import { afterEach, describe, expect, it } from "vitest";
import type { TimeoutAction } from "@agent-review/shared";
import { createTestContext } from "./test-helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("timeout scheduler", () => {
  it.each([
    ["auto_approve", "approved"],
    ["auto_reject", "rejected"],
    ["mark_timeout", "timeout"]
  ] as const)("applies %s -> %s", async (timeoutAction: TimeoutAction, expectedStatus) => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const submit = ctx.reviewService.submitReview({
      agent_id: "agent-timeout",
      scenario: "xhs_comment",
      payload: {
        url: "https://example.com/timeout",
        text: "timeout test"
      },
      timeout_config: {
        timeout_seconds: 1,
        timeout_action: timeoutAction
      }
    });

    ctx.db
      .prepare("UPDATE review_task SET expire_at = ? WHERE task_id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), submit.task_id);

    const processed = ctx.reviewService.runTimeoutSweep(10);
    expect(processed).toBe(1);

    const status = ctx.reviewService.getReviewStatus(submit.task_id);
    expect(status.status).toBe(expectedStatus);
  });
});
