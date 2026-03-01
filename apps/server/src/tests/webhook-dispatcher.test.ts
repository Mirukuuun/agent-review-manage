import { afterEach, describe, expect, it } from "vitest";
import { WebhookDispatcher } from "../services/webhook-dispatcher.js";
import { createLogger } from "../util/logger.js";
import { createTestContext } from "./test-helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("webhook dispatcher", () => {
  it("marks success on 2xx response", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const submit = ctx.reviewService.submitReview({
      agent_id: "agent-webhook",
      scenario: "xhs_comment",
      payload: {
        url: "https://example.com/a",
        text: "hello"
      },
      webhook_url: "http://127.0.0.1:9000/review-callback"
    });

    ctx.reviewService.approveTask(submit.task_id, { reviewer_id: "r1" });

    const dispatcher = new WebhookDispatcher(
      ctx.reviewService,
      createLogger("error"),
      1000,
      undefined,
      async () => new Response("ok", { status: 200 })
    );

    await dispatcher.runOnce();

    const task = ctx.reviewService.getTaskById(submit.task_id);
    expect(task.callback_status).toBe("success");
    expect(task.callback_attempts).toBe(0);
    expect(task.callback_event_id).toBeTruthy();
  });

  it("retries and marks failed after max attempts", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const submit = ctx.reviewService.submitReview({
      agent_id: "agent-webhook-fail",
      scenario: "xhs_comment",
      payload: {
        url: "https://example.com/b",
        text: "hello"
      },
      webhook_url: "http://127.0.0.1:9000/review-callback"
    });

    ctx.reviewService.rejectTask(submit.task_id, { reviewer_id: "r2" });

    const dispatcher = new WebhookDispatcher(
      ctx.reviewService,
      createLogger("error"),
      1000,
      undefined,
      async () => new Response("fail", { status: 500 })
    );

    for (let i = 0; i < 4; i += 1) {
      await dispatcher.runOnce();
      ctx.db
        .prepare("UPDATE review_task SET callback_next_retry_at = ? WHERE task_id = ?")
        .run(new Date(Date.now() - 1000).toISOString(), submit.task_id);
    }

    const task = ctx.reviewService.getTaskById(submit.task_id);
    expect(task.callback_status).toBe("failed");
    expect(task.callback_attempts).toBe(4);
    expect(task.callback_event_id).toBeTruthy();
  });
});
