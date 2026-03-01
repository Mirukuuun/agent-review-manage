# MCP Integration Reference

## Runtime Facts

- Default host: `127.0.0.1`
- Default port: `8787`
- MCP endpoint (HTTP/SSE): `http://127.0.0.1:8787/mcp`
- Health endpoint: `http://127.0.0.1:8787/api/health`
- UI endpoint: `http://127.0.0.1:8787/`
- Tools: `submit_review`, `get_review_status`
- Current supported scenario: `xhs_comment`

## Environment And Auth

Use `.env` and set values from `.env.example`.

Auth behavior:
- If `ADMIN_PASSWORD` is empty: no auth required.
- If `ADMIN_PASSWORD` is set: require Basic Auth for `/mcp` and `/api/*` except `/api/health`.
- Basic Auth username is fixed to `admin`.

Non-local host guard:
- When `HOST` is not `127.0.0.1` / `localhost` / `::1`, require `ADMIN_PASSWORD`.

## Start Commands

```bash
npm install
cp .env.example .env
npm run mcp:http
```

Use stdio transport:

```bash
npm run mcp:stdio
```

## TypeScript Client Snippet (HTTP/SSE)

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const serverUrl = "http://127.0.0.1:8787";
const adminPassword = process.env.ADMIN_PASSWORD?.trim();

const headers: Record<string, string> = {};
if (adminPassword) {
  headers.authorization = `Basic ${Buffer.from(`admin:${adminPassword}`).toString("base64")}`;
}

const client = new Client({ name: "demo-agent", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(`${serverUrl}/mcp`), {
  requestInit: { headers }
});

await client.connect(transport);
```

## TypeScript Client Snippet (stdio)

```ts
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const command = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx"
);

const client = new Client({ name: "demo-agent", version: "0.1.0" });
const transport = new StdioClientTransport({
  command,
  args: ["apps/server/src/bin/mcp-stdio.ts"],
  cwd: process.cwd(),
  env: { ...process.env }
});

await client.connect(transport);
```

## Tool Argument Examples

### submit_review

```json
{
  "agent_id": "demo-agent",
  "scenario": "xhs_comment",
  "payload": {
    "url": "https://www.xiaohongshu.com/explore/example",
    "text": "sample text to review",
    "context_info": "source=demo"
  },
  "client_request_id": "demo-1700000000000",
  "timeout_config": {
    "timeout_seconds": 120,
    "timeout_action": "auto_reject"
  }
}
```

### get_review_status

```json
{
  "task_id": "task_xxx"
}
```

## REST Approve/Reject Examples

Approve:

```bash
curl -X POST "http://127.0.0.1:8787/api/tasks/<task_id>/approve" \
  -H "Content-Type: application/json" \
  -d "{\"reviewer_id\":\"human\",\"feedback\":\"ok\"}"
```

Reject:

```bash
curl -X POST "http://127.0.0.1:8787/api/tasks/<task_id>/reject" \
  -H "Content-Type: application/json" \
  -d "{\"reviewer_id\":\"human\",\"feedback\":\"need rewrite\"}"
```

If `ADMIN_PASSWORD` is enabled, add Basic Auth:

```bash
curl -u "admin:<password>" ...
```

## Webhook Notes

- Provide `webhook_url` in `submit_review` to enable callback.
- Callback retry delays: `5s`, `30s`, `120s` (max 4 attempts total).
- Callback event shape: `review.completed` with final task status.
- If `WEBHOOK_SECRET` is set, callback includes `x-signature` (HMAC SHA-256).

## Failure Mapping

- `INVALID_SCENARIO`: scenario is not `xhs_comment`.
- `INVALID_PAYLOAD`: payload schema validation failed.
- `INVALID_REVIEW_TEXT`: `review_text`/`review_text_path` cannot resolve non-empty text.
- `INVALID_MCP_REQUEST`: first HTTP request is not MCP `initialize`.
- `INVALID_MCP_SESSION`: missing or invalid `mcp-session-id`.
- `TASK_ALREADY_PROCESSED`: approve/reject called on a non-pending task.
