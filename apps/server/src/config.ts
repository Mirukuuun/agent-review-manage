import { DEFAULT_TIMEOUT_ACTION, DEFAULT_TIMEOUT_SECONDS, type TimeoutAction } from "@agent-review/shared";
import { config as dotenvConfig } from "dotenv";
import { AppError } from "./util/errors.js";
import { ERROR_CODES } from "@agent-review/shared";

dotenvConfig();

export interface AppConfig {
  host: string;
  port: number;
  dbPath: string;
  adminPassword?: string;
  webhookSecret?: string;
  logLevel: string;
  timeoutSweepIntervalMs: number;
  webhookSweepIntervalMs: number;
  defaultTimeoutSeconds: number;
  defaultTimeoutAction: TimeoutAction;
}

export function loadConfig(): AppConfig {
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = parseInt(process.env.PORT?.trim() || "8787", 10);
  const dbPath = process.env.DB_PATH?.trim() || "./data/review-gateway.sqlite";
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() || undefined;
  const webhookSecret = process.env.WEBHOOK_SECRET?.trim() || undefined;
  const logLevel = process.env.LOG_LEVEL?.trim() || "info";
  const timeoutSweepIntervalMs = parsePositiveInt(process.env.TIMEOUT_SWEEP_INTERVAL_MS, 60_000);
  const webhookSweepIntervalMs = parsePositiveInt(process.env.WEBHOOK_SWEEP_INTERVAL_MS, 2_000);
  const defaultTimeoutSeconds = parsePositiveInt(process.env.DEFAULT_TIMEOUT_SECONDS, DEFAULT_TIMEOUT_SECONDS);
  const defaultTimeoutAction = parseTimeoutAction(process.env.DEFAULT_TIMEOUT_ACTION, DEFAULT_TIMEOUT_ACTION);

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new AppError(ERROR_CODES.INVALID_PAYLOAD, "Invalid PORT", 400);
  }

  return {
    host,
    port,
    dbPath,
    adminPassword,
    webhookSecret,
    logLevel,
    timeoutSweepIntervalMs,
    webhookSweepIntervalMs,
    defaultTimeoutSeconds,
    defaultTimeoutAction
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseTimeoutAction(value: string | undefined, fallback: TimeoutAction): TimeoutAction {
  if (value === "auto_approve" || value === "auto_reject" || value === "mark_timeout") {
    return value;
  }

  return fallback;
}

export function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}
