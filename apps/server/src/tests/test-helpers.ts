import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import { initDatabase } from "../db/init-db.js";
import { buildHttpApp } from "../api/http-app.js";
import { createLogger } from "../util/logger.js";
import { ReviewService } from "../services/review-service.js";
import { SettingsService } from "../services/settings-service.js";

interface TestContext {
  tempDir: string;
  dbPath: string;
  db: ReturnType<typeof initDatabase>;
  reviewService: ReviewService;
  settingsService: SettingsService;
  app: FastifyInstance;
  cleanup: () => Promise<void>;
}

export async function createTestContext(options?: { adminPassword?: string }): Promise<TestContext> {
  const tempDir = mkdtempSync(join(tmpdir(), "review-gateway-test-"));
  const dbPath = join(tempDir, "test.sqlite");
  const db = initDatabase(dbPath);

  const logger = createLogger("error").child({ test: true });
  const settingsService = new SettingsService(db);
  const reviewService = new ReviewService(db, settingsService, logger);

  const app = await buildHttpApp({
    reviewService,
    settingsService,
    logger,
    adminPassword: options?.adminPassword
  });

  return {
    tempDir,
    dbPath,
    db,
    reviewService,
    settingsService,
    app,
    cleanup: async () => {
      await app.close();
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

export function basicAuthHeader(password: string): string {
  return `Basic ${Buffer.from(`admin:${password}`).toString("base64")}`;
}
