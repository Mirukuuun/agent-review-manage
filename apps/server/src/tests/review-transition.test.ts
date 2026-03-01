import { afterEach, describe, expect, it } from "vitest";
import { ERROR_CODES } from "@agent-review/shared";
import { AppError } from "../util/errors.js";
import { createTestContext } from "./test-helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("review transition", () => {
  it("approves pending task and blocks second transition", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const submit = ctx.reviewService.submitReview({
      agent_id: "agent-1",
      scenario: "xhs_comment",
      payload: {
        url: "https://example.com/2",
        text: "待审核"
      }
    });

    const approved = ctx.reviewService.approveTask(submit.task_id, {
      reviewer_id: "reviewer-a",
      feedback: "ok"
    });

    expect(approved.status).toBe("approved");
    expect(approved.feedback).toBe("ok");

    expect(() =>
      ctx.reviewService.rejectTask(submit.task_id, {
        reviewer_id: "reviewer-b",
        feedback: "late"
      })
    ).toThrowError(AppError);

    try {
      ctx.reviewService.rejectTask(submit.task_id, {
        reviewer_id: "reviewer-b"
      });
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe(ERROR_CODES.TASK_ALREADY_PROCESSED);
      expect(appError.statusCode).toBe(409);
    }
  });

  it("rejects pending task", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const submit = ctx.reviewService.submitReview({
      agent_id: "agent-2",
      scenario: "xhs_comment",
      payload: {
        url: "https://example.com/3",
        text: "待拒绝"
      }
    });

    const rejected = ctx.reviewService.rejectTask(submit.task_id, {
      reviewer_id: "reviewer-c",
      feedback: "不合规"
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.feedback).toBe("不合规");
  });
});
