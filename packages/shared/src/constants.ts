export const REVIEW_STATUSES = ["pending", "approved", "rejected", "timeout"] as const;

export const TIMEOUT_ACTIONS = ["auto_approve", "auto_reject", "mark_timeout"] as const;

export const CALLBACK_STATUSES = ["none", "pending", "success", "failed"] as const;

export const REVIEW_SCENARIOS = ["xhs_comment"] as const;

export const APPROVE_MODES = ["pass", "edit_pass"] as const;

export const DEFAULT_TIMEOUT_SECONDS = 600;
export const DEFAULT_TIMEOUT_ACTION = "auto_reject";

export const WEBHOOK_RETRY_DELAYS_MS = [5000, 30000, 120000] as const;
