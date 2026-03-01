import { afterEach, describe, expect, it } from "vitest";
import { createTestContext } from "./test-helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("settings api", () => {
  it("reads and updates settings", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const before = await ctx.app.inject({ method: "GET", url: "/api/settings" });
    expect(before.statusCode).toBe(200);
    expect(before.json().default_timeout_seconds).toBe(600);
    expect(before.json().default_reviewer_id).toBeNull();

    const updated = await ctx.app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: {
        default_timeout_seconds: 120,
        default_timeout_action: "mark_timeout",
        default_reviewer_id: "reviewer-001"
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().default_timeout_seconds).toBe(120);
    expect(updated.json().default_timeout_action).toBe("mark_timeout");
    expect(updated.json().default_reviewer_id).toBe("reviewer-001");

    const after = await ctx.app.inject({ method: "GET", url: "/api/settings" });
    expect(after.statusCode).toBe(200);
    expect(after.json().default_timeout_seconds).toBe(120);
    expect(after.json().default_reviewer_id).toBe("reviewer-001");

    const cleared = await ctx.app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: {
        default_reviewer_id: ""
      }
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().default_reviewer_id).toBeNull();
  });
});
