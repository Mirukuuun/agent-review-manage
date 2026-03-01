import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  ERROR_CODES,
  type ApproveTaskInput,
  type CallbackStatus,
  type GetReviewStatusResult,
  type ListTasksQuery,
  type ListTasksResult,
  type RejectTaskInput,
  type ReviewStatus,
  type SubmitReviewArgs,
  type SubmitReviewResult,
  type TimeoutAction,
  type ReviewTaskDTO,
  WEBHOOK_RETRY_DELAYS_MS
} from "@agent-review/shared";
import { toReviewTaskDTO, stringifyJson } from "../db/mappers.js";
import { AppError } from "../util/errors.js";
import { addMilliseconds, addSeconds, clampInteger, nowIso } from "../util/time.js";
import { SettingsService } from "./settings-service.js";
import { extractScenarioReviewContent, validateScenario, validateScenarioPayload } from "./scenarios.js";
import type { Logger } from "../util/logger.js";

interface ReviewTaskRow {
  task_id: string;
  agent_id: string;
  scenario: string;
  status: string;
  payload_json: string;
  final_payload_json: string | null;
  review_text: string;
  context_info: string | null;
  feedback: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  webhook_url: string | null;
  callback_status: string;
  callback_attempts: number;
  callback_next_retry_at: string | null;
  callback_event_id: string | null;
  timeout_seconds: number;
  timeout_action: string;
  expire_at: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookJob {
  task_id: string;
  webhook_url: string;
  callback_attempts: number;
  callback_event_id: string | null;
}

export class ReviewService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly settingsService: SettingsService,
    private readonly logger: Logger
  ) {}

  submitReview(input: SubmitReviewArgs): SubmitReviewResult {
    const agentId = input.agent_id?.trim();
    if (!agentId) {
      throw new AppError(ERROR_CODES.INVALID_PAYLOAD, "agent_id is required", 400);
    }

    validateScenario(input.scenario);
    const payload = validateScenarioPayload(input.scenario, input.payload);
    const reviewContent = extractScenarioReviewContent(input.scenario, payload);

    const clientRequestId = input.client_request_id?.trim() || null;
    if (clientRequestId) {
      const existing = this.db
        .prepare(
          "SELECT task_id, status, expire_at FROM review_task WHERE agent_id = ? AND client_request_id = ? LIMIT 1"
        )
        .get(agentId, clientRequestId) as { task_id: string; status: string; expire_at: string } | undefined;

      if (existing) {
        return {
          task_id: existing.task_id,
          status: existing.status as ReviewStatus,
          expire_at: existing.expire_at
        };
      }
    }

    const settings = this.settingsService.getSettings();
    const timeoutSeconds = clampInteger(
      input.timeout_config?.timeout_seconds ?? settings.default_timeout_seconds,
      1,
      7 * 24 * 3600
    );
    const timeoutAction = input.timeout_config?.timeout_action ?? settings.default_timeout_action;
    const webhookUrl = normalizeWebhookUrl(input.webhook_url);

    const now = new Date();
    const createdAt = now.toISOString();
    const expireAt = addSeconds(now, timeoutSeconds).toISOString();
    const taskId = randomUUID();

    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO review_task (
            task_id, agent_id, client_request_id, scenario, payload_json, review_text, context_info,
            status, webhook_url, callback_status, callback_attempts, callback_next_retry_at,
            callback_event_id, timeout_seconds, timeout_action, expire_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'none', 0, NULL, NULL, ?, ?, ?, ?, ?)`
        )
        .run(
          taskId,
          agentId,
          clientRequestId,
          input.scenario,
          stringifyJson(payload),
          reviewContent.reviewText,
          reviewContent.contextInfo,
          webhookUrl,
          timeoutSeconds,
          timeoutAction,
          expireAt,
          createdAt,
          createdAt
        );

      this.insertActionLog(taskId, "submit", agentId, {
        timeout_seconds: timeoutSeconds,
        timeout_action: timeoutAction,
        webhook_url: webhookUrl
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isUniqueConstraintError(error) && clientRequestId) {
        const existing = this.db
          .prepare(
            "SELECT task_id, status, expire_at FROM review_task WHERE agent_id = ? AND client_request_id = ? LIMIT 1"
          )
          .get(agentId, clientRequestId) as { task_id: string; status: string; expire_at: string } | undefined;

        if (existing) {
          return {
            task_id: existing.task_id,
            status: existing.status as ReviewStatus,
            expire_at: existing.expire_at
          };
        }
      }

      throw error;
    }

    return {
      task_id: taskId,
      status: "pending",
      expire_at: expireAt
    };
  }

  getReviewStatus(taskId: string): GetReviewStatusResult {
    const row = this.findTaskRow(taskId);
    return {
      task_id: row.task_id,
      status: row.status as ReviewStatus,
      final_payload: row.final_payload_json ? JSON.parse(row.final_payload_json) : null,
      feedback: row.feedback,
      reviewed_at: row.reviewed_at
    };
  }

  getTaskById(taskId: string): ReviewTaskDTO {
    return toReviewTaskDTO(this.findTaskRow(taskId));
  }

  listTasks(query: ListTasksQuery): ListTasksResult {
    const page = clampInteger(query.page ?? 1, 1, 9999);
    const pageSize = clampInteger(query.page_size ?? 20, 1, 100);
    const { whereSql, params } = buildTaskFilter(query);

    const total = (
      this.db.prepare(`SELECT COUNT(*) as total FROM review_task ${whereSql}`).get(...params) as { total: number }
    ).total;

    const items = this.db
      .prepare(
        `SELECT * FROM review_task ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, (page - 1) * pageSize) as unknown as ReviewTaskRow[];

    const summaryRows = this.db
      .prepare("SELECT status, COUNT(*) as count FROM review_task GROUP BY status")
      .all() as Array<{ status: ReviewStatus; count: number }>;

    const summary: Record<ReviewStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      timeout: 0
    };

    for (const row of summaryRows) {
      summary[row.status] = row.count;
    }

    return {
      items: items.map((row) => toReviewTaskDTO(row)),
      total,
      page,
      page_size: pageSize,
      summary
    };
  }

  approveTask(taskId: string, input: ApproveTaskInput): ReviewTaskDTO {
    const row = this.findTaskRow(taskId);
    if (row.status !== "pending") {
      throw new AppError(ERROR_CODES.TASK_ALREADY_PROCESSED, "Task already processed", 409);
    }

    const mode = input.approve_mode ?? "pass";
    let finalPayload: Record<string, unknown>;

    if (mode === "pass") {
      finalPayload = JSON.parse(row.payload_json) as Record<string, unknown>;
    } else if (mode === "edit_pass") {
      this.logger.warn("approve_mode edit_pass is deprecated", { task_id: taskId });
      if (!input.final_payload) {
        throw new AppError(ERROR_CODES.INVALID_PAYLOAD, "final_payload is required for edit_pass", 400);
      }
      validateScenario(row.scenario);
      finalPayload = validateScenarioPayload(row.scenario as ReviewTaskDTO["scenario"], input.final_payload);
    } else {
      throw new AppError(ERROR_CODES.INVALID_PAYLOAD, `Unsupported approve_mode: ${mode}`, 400);
    }

    const now = nowIso();
    const callbackEnabled = Boolean(row.webhook_url);

    const result = this.db
      .prepare(
        `UPDATE review_task
         SET status='approved', final_payload_json=?, feedback=?, reviewer_id=?, reviewed_at=?,
             callback_status=?, callback_attempts=0, callback_next_retry_at=?, callback_event_id=NULL,
             updated_at=?
         WHERE task_id=? AND status='pending'`
      )
      .run(
        stringifyJson(finalPayload),
        input.feedback?.trim() || null,
        input.reviewer_id?.trim() || null,
        now,
        callbackEnabled ? "pending" : "none",
        callbackEnabled ? now : null,
        now,
        taskId
      );

    if (result.changes === 0) {
      throw new AppError(ERROR_CODES.TASK_ALREADY_PROCESSED, "Task already processed", 409);
    }

    this.insertActionLog(taskId, "approve", input.reviewer_id?.trim() || null, {
      approve_mode: mode,
      feedback: input.feedback ?? null
    });

    return this.getTaskById(taskId);
  }

  rejectTask(taskId: string, input: RejectTaskInput): ReviewTaskDTO {
    const row = this.findTaskRow(taskId);
    if (row.status !== "pending") {
      throw new AppError(ERROR_CODES.TASK_ALREADY_PROCESSED, "Task already processed", 409);
    }

    const now = nowIso();
    const callbackEnabled = Boolean(row.webhook_url);

    const result = this.db
      .prepare(
        `UPDATE review_task
         SET status='rejected', final_payload_json=NULL, feedback=?, reviewer_id=?, reviewed_at=?,
             callback_status=?, callback_attempts=0, callback_next_retry_at=?, callback_event_id=NULL,
             updated_at=?
         WHERE task_id=? AND status='pending'`
      )
      .run(
        input.feedback?.trim() || null,
        input.reviewer_id?.trim() || null,
        now,
        callbackEnabled ? "pending" : "none",
        callbackEnabled ? now : null,
        now,
        taskId
      );

    if (result.changes === 0) {
      throw new AppError(ERROR_CODES.TASK_ALREADY_PROCESSED, "Task already processed", 409);
    }

    this.insertActionLog(taskId, "reject", input.reviewer_id?.trim() || null, {
      feedback: input.feedback ?? null
    });

    return this.getTaskById(taskId);
  }

  runTimeoutSweep(limit = 100): number {
    const rows = this.db
      .prepare("SELECT task_id, timeout_action FROM review_task WHERE status='pending' AND expire_at <= ? LIMIT ?")
      .all(nowIso(), limit) as Array<{ task_id: string; timeout_action: TimeoutAction }>;

    let processed = 0;
    for (const row of rows) {
      if (this.applyTimeoutTransition(row.task_id, row.timeout_action)) {
        processed += 1;
      }
    }

    return processed;
  }

  listDueWebhookJobs(limit = 100): WebhookJob[] {
    const rows = this.db
      .prepare(
        `SELECT task_id, webhook_url, callback_attempts, callback_event_id
         FROM review_task
         WHERE callback_status='pending' AND callback_next_retry_at IS NOT NULL AND callback_next_retry_at <= ?
         ORDER BY callback_next_retry_at ASC
         LIMIT ?`
      )
      .all(nowIso(), limit) as Array<{
      task_id: string;
      webhook_url: string | null;
      callback_attempts: number;
      callback_event_id: string | null;
    }>;

    return rows
      .filter((row): row is { task_id: string; webhook_url: string; callback_attempts: number; callback_event_id: string | null } =>
        typeof row.webhook_url === "string" && row.webhook_url.length > 0
      )
      .map((row) => ({
        task_id: row.task_id,
        webhook_url: row.webhook_url,
        callback_attempts: row.callback_attempts,
        callback_event_id: row.callback_event_id
      }));
  }

  markCallbackSuccess(taskId: string, eventId: string): void {
    const now = nowIso();
    this.db
      .prepare(
        `UPDATE review_task
         SET callback_status='success', callback_event_id=?, callback_next_retry_at=NULL, updated_at=?
         WHERE task_id=? AND callback_status='pending'`
      )
      .run(eventId, now, taskId);

    this.insertActionLog(taskId, "webhook_success", null, { event_id: eventId });
  }

  markCallbackRetryOrFailure(taskId: string, eventId: string, attempts: number): void {
    const now = new Date();
    const nowIsoValue = now.toISOString();
    const canRetry = attempts < WEBHOOK_MAX_ATTEMPTS;
    const retryDelayMs = WEBHOOK_RETRY_DELAYS_MS[Math.min(attempts - 1, WEBHOOK_RETRY_DELAYS_MS.length - 1)] ?? 120_000;
    const nextRetryAt = canRetry ? addMilliseconds(now, retryDelayMs).toISOString() : null;

    const status: CallbackStatus = canRetry ? "pending" : "failed";

    this.db
      .prepare(
        `UPDATE review_task
         SET callback_status=?, callback_attempts=?, callback_event_id=?, callback_next_retry_at=?, updated_at=?
         WHERE task_id=? AND callback_status='pending'`
      )
      .run(status, attempts, eventId, nextRetryAt, nowIsoValue, taskId);

    this.insertActionLog(taskId, canRetry ? "webhook_retry" : "webhook_failed", null, {
      event_id: eventId,
      attempts,
      next_retry_at: nextRetryAt
    });
  }

  private applyTimeoutTransition(taskId: string, timeoutAction: TimeoutAction): boolean {
    const now = nowIso();
    const targetStatus: ReviewStatus =
      timeoutAction === "auto_approve" ? "approved" : timeoutAction === "auto_reject" ? "rejected" : "timeout";

    const row = this.db
      .prepare("SELECT payload_json, webhook_url FROM review_task WHERE task_id=? LIMIT 1")
      .get(taskId) as { payload_json: string; webhook_url: string | null } | undefined;

    if (!row) {
      return false;
    }

    const callbackEnabled = Boolean(row.webhook_url);
    const finalPayload = targetStatus === "approved" ? row.payload_json : null;

    const result = this.db
      .prepare(
        `UPDATE review_task
         SET status=?, final_payload_json=?, reviewed_at=?, reviewer_id='system-timeout',
             callback_status=?, callback_attempts=0, callback_next_retry_at=?, callback_event_id=NULL,
             updated_at=?
         WHERE task_id=? AND status='pending'`
      )
      .run(targetStatus, finalPayload, now, callbackEnabled ? "pending" : "none", callbackEnabled ? now : null, now, taskId);

    if (result.changes === 0) {
      return false;
    }

    this.insertActionLog(taskId, `timeout_${targetStatus}`, "system-timeout", {
      timeout_action: timeoutAction
    });

    return true;
  }

  private findTaskRow(taskId: string): ReviewTaskRow {
    const taskIdValue = taskId.trim();
    if (!taskIdValue) {
      throw new AppError(ERROR_CODES.INVALID_PAYLOAD, "task_id is required", 400);
    }

    const row = this.db.prepare("SELECT * FROM review_task WHERE task_id = ? LIMIT 1").get(taskIdValue) as ReviewTaskRow | undefined;
    if (!row) {
      throw new AppError(ERROR_CODES.TASK_NOT_FOUND, "Task not found", 404);
    }

    return row;
  }

  private insertActionLog(taskId: string, action: string, operatorId: string | null, detail: unknown): void {
    this.db
      .prepare(
        "INSERT INTO review_action_log (task_id, action, operator_id, detail_json, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(taskId, action, operatorId, stringifyJson(detail), nowIso());
  }
}

const WEBHOOK_MAX_ATTEMPTS = 4;

function normalizeWebhookUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const candidate = value.trim();
  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return parsed.toString();
  } catch {
    throw new AppError(ERROR_CODES.INVALID_WEBHOOK_URL, "Invalid webhook_url", 400);
  }
}

function buildTaskFilter(query: ListTasksQuery): { whereSql: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];

  if (query.status) {
    clauses.push("status = ?");
    params.push(query.status);
  }

  if (query.scenario) {
    clauses.push("scenario = ?");
    params.push(query.scenario);
  }

  if (query.task_id) {
    clauses.push("task_id LIKE ?");
    params.push(`%${query.task_id.trim()}%`);
  }

  if (clauses.length === 0) {
    return { whereSql: "", params };
  }

  return {
    whereSql: `WHERE ${clauses.join(" AND ")}`,
    params
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
