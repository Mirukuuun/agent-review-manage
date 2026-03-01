import { afterEach, describe, expect, it } from "vitest";
import { createTestContext } from "./test-helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("submit idempotency", () => {
  it("returns existing task when client_request_id duplicates", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const first = ctx.reviewService.submitReview({
      agent_id: "agent-1",
      scenario: "xhs_comment",
      payload: {
        url: "https://example.com/1",
        text: "hello"
      },
      client_request_id: "abc"
    });

    const second = ctx.reviewService.submitReview({
      agent_id: "agent-1",
      scenario: "xhs_comment",
      payload: {
        url: "https://example.com/1",
        text: "hello"
      },
      client_request_id: "abc"
    });

    expect(second.task_id).toBe(first.task_id);
    const list = ctx.reviewService.listTasks({});
    expect(list.total).toBe(1);
  });
});
