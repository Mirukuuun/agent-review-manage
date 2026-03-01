PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS review_task (
  task_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  client_request_id TEXT,
  scenario TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  final_payload_json TEXT,
  review_text TEXT NOT NULL,
  context_info TEXT,
  status TEXT NOT NULL,
  feedback TEXT,
  reviewer_id TEXT,
  reviewed_at TEXT,
  webhook_url TEXT,
  callback_status TEXT NOT NULL DEFAULT 'none',
  callback_attempts INTEGER NOT NULL DEFAULT 0,
  callback_next_retry_at TEXT,
  callback_event_id TEXT,
  timeout_seconds INTEGER NOT NULL,
  timeout_action TEXT NOT NULL,
  expire_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_task_idempotency
  ON review_task(agent_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_review_task_status_expire
  ON review_task(status, expire_at);

CREATE INDEX IF NOT EXISTS idx_review_task_scenario_status
  ON review_task(scenario, status);

CREATE INDEX IF NOT EXISTS idx_review_task_callback_retry
  ON review_task(callback_status, callback_next_retry_at);

CREATE TABLE IF NOT EXISTS review_action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  action TEXT NOT NULL,
  operator_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES review_task(task_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_action_log_task_time
  ON review_action_log(task_id, created_at);

CREATE TABLE IF NOT EXISTS system_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
