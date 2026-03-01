import { loadConfig, isLocalHost } from "../config.js";
import { initDatabase } from "../db/init-db.js";
import { SettingsService } from "../services/settings-service.js";
import { ReviewService } from "../services/review-service.js";
import { WebhookDispatcher } from "../services/webhook-dispatcher.js";
import { RuntimeScheduler } from "../scheduler/runtime-scheduler.js";
import { createLogger } from "../util/logger.js";
import { buildHttpApp } from "../api/http-app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!isLocalHost(config.host) && !config.adminPassword) {
    throw new Error("ADMIN_PASSWORD is required when HOST is not local");
  }

  const logger = createLogger(config.logLevel).child({ component: "bootstrap" });
  const db = initDatabase(config.dbPath);

  const settingsService = new SettingsService(db, {
    default_timeout_seconds: config.defaultTimeoutSeconds,
    default_timeout_action: config.defaultTimeoutAction,
    default_reviewer_id: null
  });
  const reviewService = new ReviewService(db, settingsService, logger.child({ component: "review-service" }));

  const runtimeScheduler = new RuntimeScheduler(
    reviewService,
    logger.child({ component: "timeout-scheduler" }),
    config.timeoutSweepIntervalMs
  );
  const webhookDispatcher = new WebhookDispatcher(
    reviewService,
    logger.child({ component: "webhook-dispatcher" }),
    config.webhookSweepIntervalMs,
    config.webhookSecret
  );

  const app = await buildHttpApp({
    reviewService,
    settingsService,
    logger,
    adminPassword: config.adminPassword
  });

  runtimeScheduler.start();
  webhookDispatcher.start();

  await app.listen({ host: config.host, port: config.port });
  logger.info("server started", {
    host: config.host,
    port: config.port,
    mcp_url: `http://${config.host}:${config.port}/mcp`
  });

  const shutdown = async (signal: string) => {
    logger.info("shutdown requested", { signal });
    runtimeScheduler.stop();
    webhookDispatcher.stop();
    await app.close();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
