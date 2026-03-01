import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { GetReviewStatusResult, SubmitReviewResult } from "@agent-review/shared";
import { createReviewMcpServer } from "../mcp/create-mcp-server.js";
import { createLogger } from "../util/logger.js";
import { createTestContext } from "./test-helpers.js";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = undefined;
  }
});

describe("mcp tools", () => {
  it("lists and calls submit_review/get_review_status", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createReviewMcpServer(ctx.reviewService, createLogger("error"));
    await server.connect(serverTransport);

    const client = new Client({
      name: "test-client",
      version: "0.1.0"
    });
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);
    expect(toolNames).toContain("submit_review");
    expect(toolNames).toContain("get_review_status");

    const submitRaw = await client.callTool({
      name: "submit_review",
      arguments: {
        agent_id: "agent-mcp",
        scenario: "xhs_comment",
        payload: {
          url: "https://example.com/mcp",
          text: "hello mcp"
        }
      }
    });

    const submit = extractStructured<SubmitReviewResult>(submitRaw);
    expect(submit.status).toBe("pending");

    const statusRaw = await client.callTool({
      name: "get_review_status",
      arguments: {
        task_id: submit.task_id
      }
    });

    const status = extractStructured<GetReviewStatusResult>(statusRaw);
    expect(status.task_id).toBe(submit.task_id);
    expect(status.status).toBe("pending");

    await client.close();
    await server.close();
  });

  it("accepts camelCase aliases for submit_review fields", async () => {
    const ctx = await createTestContext();
    cleanup = ctx.cleanup;

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createReviewMcpServer(ctx.reviewService, createLogger("error"));
    await server.connect(serverTransport);

    const client = new Client({
      name: "test-client-camel",
      version: "0.1.0"
    });
    await client.connect(clientTransport);

    const submitRaw = await client.callTool({
      name: "submit_review",
      arguments: {
        agent_id: "agent-mcp-camel",
        scenario: "xhs_comment",
        payload: {
          url: "https://example.com/mcp-camel",
          text: "hello mcp camel"
        },
        webhookUrl: "http://127.0.0.1:9000/review-callback",
        clientRequestId: `mcp-camel-${Date.now()}`,
        timeoutConfig: {
          timeout_seconds: 12,
          timeout_action: "auto_approve"
        }
      }
    });

    const submit = extractStructured<SubmitReviewResult>(submitRaw);
    expect(submit.status).toBe("pending");

    const task = ctx.reviewService.getTaskById(submit.task_id);
    expect(task.webhook_url).toBe("http://127.0.0.1:9000/review-callback");
    expect(task.timeout_seconds).toBe(12);
    expect(task.timeout_action).toBe("auto_approve");

    await client.close();
    await server.close();
  });
});

function extractStructured<T>(result: unknown): T {
  const raw = result as {
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ text?: string }>;
  };

  if (raw.isError) {
    throw new Error(raw.content?.[0]?.text || "tool call failed");
  }

  if (raw.structuredContent !== undefined) {
    return raw.structuredContent as T;
  }

  const text = raw.content?.[0]?.text;
  if (!text) {
    throw new Error("missing tool result");
  }

  return JSON.parse(text) as T;
}
