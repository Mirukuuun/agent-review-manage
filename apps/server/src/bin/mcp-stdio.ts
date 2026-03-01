import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "../config.js";
import { initDatabase } from "../db/init-db.js";
import { createReviewMcpServer } from "../mcp/create-mcp-server.js";
import { RuntimeScheduler } from "../scheduler/runtime-scheduler.js";
import { ReviewService } from "../services/review-service.js";
import { SettingsService } from "../services/settings-service.js";
import { WebhookDispatcher } from "../services/webhook-dispatcher.js";
import { createLogger } from "../util/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel).child({ component: "mcp-stdio" });

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

  runtimeScheduler.start();
  webhookDispatcher.start();

  const server = createReviewMcpServer(reviewService, logger.child({ component: "mcp" }));
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    runtimeScheduler.stop();
    webhookDispatcher.stop();
    await server.close();
    db.close();
    process.exit(0);
  });
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
