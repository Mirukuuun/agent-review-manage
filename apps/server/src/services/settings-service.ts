import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  DEFAULT_TIMEOUT_ACTION,
  DEFAULT_TIMEOUT_SECONDS,
  TIMEOUT_ACTIONS,
  type SystemSettings,
  type TimeoutAction
} from "@agent-review/shared";
import { nowIso } from "../util/time.js";

const updateSchema = z.object({
  default_timeout_seconds: z.number().int().min(1).max(7 * 24 * 3600).optional(),
  default_timeout_action: z.enum(TIMEOUT_ACTIONS).optional(),
  default_reviewer_id: z.string().trim().max(128).optional()
});

export class SettingsService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly defaults: SystemSettings = {
      default_timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
      default_timeout_action: DEFAULT_TIMEOUT_ACTION,
      default_reviewer_id: null
    }
  ) {}

  getSettings(): SystemSettings {
    const rows = this.db
      .prepare(
        "SELECT key, value FROM system_setting WHERE key IN ('default_timeout_seconds', 'default_timeout_action', 'default_reviewer_id')"
      )
      .all() as Array<{ key: string; value: string }>;

    const map = new Map(rows.map((row) => [row.key, row.value]));
    const timeoutSeconds = toInteger(map.get("default_timeout_seconds"), this.defaults.default_timeout_seconds);
    const timeoutAction = toTimeoutAction(map.get("default_timeout_action"), this.defaults.default_timeout_action);
    const reviewerId = toReviewerId(map.get("default_reviewer_id"), this.defaults.default_reviewer_id);

    return {
      default_timeout_seconds: timeoutSeconds,
      default_timeout_action: timeoutAction,
      default_reviewer_id: reviewerId
    };
  }

  updateSettings(input: Partial<SystemSettings>): SystemSettings {
    const parsed = updateSchema.parse(input);
    const now = nowIso();

    this.db.exec("BEGIN");
    try {
      if (parsed.default_timeout_seconds !== undefined) {
        this.upsert("default_timeout_seconds", String(parsed.default_timeout_seconds), now);
      }

      if (parsed.default_timeout_action !== undefined) {
        this.upsert("default_timeout_action", parsed.default_timeout_action, now);
      }

      if (parsed.default_reviewer_id !== undefined) {
        if (parsed.default_reviewer_id.length > 0) {
          this.upsert("default_reviewer_id", parsed.default_reviewer_id, now);
        } else {
          this.remove("default_reviewer_id");
        }
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getSettings();
  }

  private upsert(key: string, value: string, updatedAt: string): void {
    this.db
      .prepare(
        `INSERT INTO system_setting (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
      )
      .run(key, value, updatedAt);
  }

  private remove(key: string): void {
    this.db.prepare("DELETE FROM system_setting WHERE key = ?").run(key);
  }
}

function toInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function toTimeoutAction(value: string | undefined, fallback: TimeoutAction): TimeoutAction {
  if (value === "auto_approve" || value === "auto_reject" || value === "mark_timeout") {
    return value;
  }

  return fallback;
}

function toReviewerId(value: string | undefined, fallback: string | null): string | null {
  if (value === undefined) {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
