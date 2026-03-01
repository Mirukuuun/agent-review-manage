import type { APPROVE_MODES, CALLBACK_STATUSES, REVIEW_SCENARIOS, REVIEW_STATUSES, TIMEOUT_ACTIONS } from "./constants.js";
import type { ErrorCode } from "./errors.js";

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type TimeoutAction = (typeof TIMEOUT_ACTIONS)[number];
export type CallbackStatus = (typeof CALLBACK_STATUSES)[number];
export type ReviewScenario = (typeof REVIEW_SCENARIOS)[number];
export type ApproveMode = (typeof APPROVE_MODES)[number];

export interface TimeoutConfig {
  timeout_seconds?: number;
  timeout_action?: TimeoutAction;
}

export interface SubmitReviewArgs {
  agent_id: string;
  scenario: ReviewScenario;
  payload: Record<string, unknown>;
  webhook_url?: string;
  timeout_config?: TimeoutConfig;
  client_request_id?: string;
}

export interface SubmitReviewResult {
  task_id: string;
  status: ReviewStatus;
  expire_at: string;
}

export interface GetReviewStatusArgs {
  task_id: string;
}

export interface GetReviewStatusResult {
  task_id: string;
  status: ReviewStatus;
  final_payload: Record<string, unknown> | null;
  feedback: string | null;
  reviewed_at: string | null;
}

export interface ReviewTaskDTO {
  task_id: string;
  agent_id: string;
  scenario: ReviewScenario;
  status: ReviewStatus;
  payload: Record<string, unknown>;
  final_payload: Record<string, unknown> | null;
  review_text: string;
  context_info: string | null;
  feedback: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  webhook_url: string | null;
  callback_status: CallbackStatus;
  callback_attempts: number;
  callback_next_retry_at: string | null;
  callback_event_id: string | null;
  timeout_seconds: number;
  timeout_action: TimeoutAction;
  expire_at: string;
  created_at: string;
  updated_at: string;
}

export interface ListTasksQuery {
  status?: ReviewStatus;
  scenario?: ReviewScenario;
  task_id?: string;
  page?: number;
  page_size?: number;
}

export interface ListTasksResult {
  items: ReviewTaskDTO[];
  total: number;
  page: number;
  page_size: number;
  summary: Record<ReviewStatus, number>;
}

export interface ApproveTaskInput {
  reviewer_id?: string;
  feedback?: string;
  approve_mode?: ApproveMode;
  final_payload?: Record<string, unknown>;
}

export interface RejectTaskInput {
  reviewer_id?: string;
  feedback?: string;
}

export interface SystemSettings {
  default_timeout_seconds: number;
  default_timeout_action: TimeoutAction;
  default_reviewer_id: string | null;
}

export interface StandardErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface ReviewCompletedEvent {
  event: "review.completed";
  event_id: string;
  event_timestamp: string;
  task: GetReviewStatusResult;
}
