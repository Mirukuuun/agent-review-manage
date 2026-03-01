import { afterEach, describe, expect, it } from "vitest";
import { createTestContext } from "./test-helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("health api", () => {
  it("returns status ok", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const response = await ctx.app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.now).toBe("string");
  });
});
