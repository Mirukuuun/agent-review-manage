import { afterEach, describe, expect, it } from "vitest";
import { basicAuthHeader, createTestContext } from "./test-helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("auth", () => {
  it("protects api routes while allowing /api/health", async () => {
    const ctx = await createTestContext({ adminPassword: "secret" });
    cleanup = ctx.cleanup;

    const health = await ctx.app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);

    const noAuth = await ctx.app.inject({ method: "GET", url: "/api/tasks" });
    expect(noAuth.statusCode).toBe(401);

    const badAuth = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: {
        authorization: basicAuthHeader("wrong")
      }
    });
    expect(badAuth.statusCode).toBe(401);

    const okAuth = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: {
        authorization: basicAuthHeader("secret")
      }
    });
    expect(okAuth.statusCode).toBe(200);
  });
});
