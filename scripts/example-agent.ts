import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { GetReviewStatusResult, SubmitReviewResult } from "@agent-review/shared";

interface Args {
  transport: "http" | "stdio";
  serverUrl: string;
  autoApproveAfterMs: number;
  useWebhook: boolean;
  webhookUrl?: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(`starting example agent with transport=${args.transport}\n`);

  const client = new Client({
    name: "example-agent",
    version: "0.1.0"
  });

  const transport = args.transport === "http" ? createHttpTransport(args) : createStdioTransport(args);
  await connectWithTimeout(client, transport, 15_000);

  const timeoutConfig =
    args.transport === "stdio"
      ? {
          timeout_seconds: Math.max(1, Math.ceil(args.autoApproveAfterMs / 1000)),
          timeout_action: "auto_approve" as const
        }
      : undefined;

  const submitRaw = await client.callTool({
    name: "submit_review",
    arguments: {
      agent_id: "example-agent",
      scenario: "xhs_comment",
      payload: {
        url: "https://www.xiaohongshu.com/explore/example",
        text: `这是一条自动化提交的审核文本：${new Date().toISOString()}`,
        context_info: "来源: example-agent"
      },
      webhook_url: args.useWebhook ? args.webhookUrl : undefined,
      timeout_config: timeoutConfig,
      client_request_id: `example-${Date.now()}`
    }
  });

  const submit = extractToolStructuredContent<SubmitReviewResult>(submitRaw);
  process.stdout.write(`submit_review -> task_id=${submit.task_id}, status=${submit.status}\n`);

  if (args.transport === "http" && args.autoApproveAfterMs > 0) {
    void scheduleAutoApprove(args, submit.task_id, args.autoApproveAfterMs);
  }

  const finalStatus = await pollUntilDone(client, submit.task_id);
  process.stdout.write(`final status -> ${finalStatus.status}\n`);

  await client.close();
  if (args.transport === "http" && "terminateSession" in transport) {
    await (transport as StreamableHTTPClientTransport).terminateSession().catch(() => undefined);
  }
}

function createHttpTransport(args: Args): StreamableHTTPClientTransport {
  const headers: Record<string, string> = {};
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (adminPassword) {
    headers.authorization = `Basic ${Buffer.from(`admin:${adminPassword}`).toString("base64")}`;
  }

  return new StreamableHTTPClientTransport(new URL(`${args.serverUrl.replace(/\/$/, "")}/mcp`), {
    requestInit: {
      headers
    }
  });
}

function createStdioTransport(args: Args): StdioClientTransport {
  const command = join(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx"
  );

  return new StdioClientTransport({
    command,
    args: ["apps/server/src/bin/mcp-stdio.ts"],
    env: {
      ...pickStringEnv(process.env),
      TIMEOUT_SWEEP_INTERVAL_MS: "1000",
      WEBHOOK_SWEEP_INTERVAL_MS: "1000",
      LOG_LEVEL: process.env.LOG_LEVEL ?? "warn"
    },
    cwd: process.cwd()
  });
}

async function scheduleAutoApprove(args: Args, taskId: string, delayMs: number): Promise<void> {
  await sleep(delayMs);

  const headers: Record<string, string> = {
    "content-type": "application/json"
  };

  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (adminPassword) {
    headers.authorization = `Basic ${Buffer.from(`admin:${adminPassword}`).toString("base64")}`;
  }

  const response = await fetch(`${args.serverUrl.replace(/\/$/, "")}/api/tasks/${taskId}/approve`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      reviewer_id: "example-auto-approver",
      feedback: "example auto approve"
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    process.stderr.write(`auto approve failed: ${response.status} ${text}\n`);
  } else {
    process.stdout.write(`auto approve triggered for ${taskId}\n`);
  }
}

async function pollUntilDone(client: Client, taskId: string): Promise<GetReviewStatusResult> {
  for (let i = 0; i < 120; i += 1) {
    const statusRaw = await client.callTool({
      name: "get_review_status",
      arguments: { task_id: taskId }
    });

    const status = extractToolStructuredContent<GetReviewStatusResult>(statusRaw);
    process.stdout.write(`poll -> ${status.status}\n`);

    if (status.status !== "pending") {
      return status;
    }

    await sleep(1000);
  }

  throw new Error("polling timeout");
}

async function connectWithTimeout(client: Client, transport: StreamableHTTPClientTransport | StdioClientTransport, timeoutMs: number): Promise<void> {
  const timeoutPromise = sleep(timeoutMs).then(() => {
    throw new Error(`connect timeout after ${timeoutMs}ms`);
  });
  await Promise.race([client.connect(transport), timeoutPromise]);
}

function extractToolStructuredContent<T>(result: unknown): T {
  if (!result || typeof result !== "object") {
    throw new Error("invalid MCP result");
  }

  const raw = result as {
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type: string; text?: string }>;
  };

  if (raw.isError) {
    const text = raw.content?.[0]?.text ?? "tool execution failed";
    throw new Error(text);
  }

  if (raw.structuredContent !== undefined) {
    return raw.structuredContent as T;
  }

  const text = raw.content?.[0]?.text;
  if (!text) {
    throw new Error("missing structuredContent");
  }

  return JSON.parse(text) as T;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    transport: "http",
    serverUrl: process.env.SERVER_URL?.trim() || "http://127.0.0.1:8787",
    autoApproveAfterMs: 2000,
    useWebhook: false,
    webhookUrl: "http://127.0.0.1:9000/review-callback"
  };

  for (const item of argv) {
    if (item === "--transport=http") {
      args.transport = "http";
    } else if (item === "--transport=stdio") {
      args.transport = "stdio";
    } else if (item.startsWith("--server-url=")) {
      args.serverUrl = item.slice("--server-url=".length);
    } else if (item.startsWith("--auto-approve-after-ms=")) {
      args.autoApproveAfterMs = Number(item.slice("--auto-approve-after-ms=".length));
    } else if (item === "--use-webhook") {
      args.useWebhook = true;
    } else if (item.startsWith("--webhook-url=")) {
      args.webhookUrl = item.slice("--webhook-url=".length);
    }
  }

  return args;
}

function pickStringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      output[key] = value;
    }
  }
  return output;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
