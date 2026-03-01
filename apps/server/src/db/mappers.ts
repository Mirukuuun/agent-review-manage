import type { ReviewTaskDTO, ReviewStatus, TimeoutAction, CallbackStatus } from "@agent-review/shared";

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

export function toReviewTaskDTO(row: ReviewTaskRow): ReviewTaskDTO {
  return {
    task_id: row.task_id,
    agent_id: row.agent_id,
    scenario: row.scenario as ReviewTaskDTO["scenario"],
    status: row.status as ReviewStatus,
    payload: parseJson(row.payload_json),
    final_payload: row.final_payload_json ? parseJson(row.final_payload_json) : null,
    review_text: row.review_text,
    context_info: row.context_info,
    feedback: row.feedback,
    reviewer_id: row.reviewer_id,
    reviewed_at: row.reviewed_at,
    webhook_url: row.webhook_url,
    callback_status: row.callback_status as CallbackStatus,
    callback_attempts: row.callback_attempts,
    callback_next_retry_at: row.callback_next_retry_at,
    callback_event_id: row.callback_event_id,
    timeout_seconds: row.timeout_seconds,
    timeout_action: row.timeout_action as TimeoutAction,
    expire_at: row.expire_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function parseJson(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  return { value: parsed };
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}
