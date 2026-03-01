---
name: ai-review-manage-mcp
description: Operate and integrate this repository as a local Human-in-the-loop review gateway. Use when an agent needs to run the project, connect to its MCP server over HTTP/SSE or stdio, call submit_review and get_review_status correctly, satisfy Basic Auth and MCP session requirements, or debug integration failures for this codebase.
---

# AI Review Manage MCP

## Overview

Use this skill to bootstrap this repo and connect an MCP client to its review tools.
Prefer this skill for setup, integration, and troubleshooting tasks around `/mcp`.

## Start The Project

1. Use Node.js 22 or later.
2. Install dependencies:

```bash
npm install
```

3. Create environment file:

```bash
cp .env.example .env
```

On Windows, use `copy .env.example .env`.

4. Start HTTP service (UI + REST + MCP endpoint):

```bash
npm run mcp:http
```

Windows helper:

```bat
start.bat
```

5. Verify endpoints:
- UI: `http://127.0.0.1:8787/`
- MCP: `http://127.0.0.1:8787/mcp`
- Health: `http://127.0.0.1:8787/api/health`

## Choose MCP Transport

- Use HTTP/SSE when a client can reach a URL endpoint.
- Use stdio when a client runs locally and can spawn a process.

### HTTP/SSE

- Endpoint: `http://127.0.0.1:8787/mcp`
- If `ADMIN_PASSWORD` is set, send Basic Auth (`admin:<password>`) for `/mcp` and `/api/*` (except `/api/health`).
- Send `initialize` as the first MCP request.
- Reuse `mcp-session-id` in follow-up `POST`/`GET`/`DELETE` requests.

### Stdio

- Start MCP stdio transport with:

```bash
npm run mcp:stdio
```

- Or spawn `tsx apps/server/src/bin/mcp-stdio.ts` from the client transport process.

## Use Tools Correctly

Available MCP tools:
1. `submit_review`
2. `get_review_status`

### submit_review

Required arguments:
- `agent_id` (string)
- `scenario` (must be `xhs_comment`)
- `payload` (object)

Optional arguments:
- `webhook_url`
- `client_request_id`
- `timeout_config.timeout_seconds`
- `timeout_config.timeout_action` (`auto_approve` | `auto_reject` | `mark_timeout`)

`xhs_comment` payload rules:
- Required: `url` (valid URL), `text` (non-empty string)
- Optional: `review_text`, `review_text_path`, `context_info`

### get_review_status

Required argument:
- `task_id`

Final statuses:
- `approved`
- `rejected`
- `timeout`

## Run A Smoke Workflow

1. Call `submit_review`.
2. Approve or reject in UI (`/`) or REST API.
3. Poll `get_review_status` until status is not `pending`.
4. Use built-in examples for a quick end-to-end check:

```bash
npm run example:agent:http -- --auto-approve-after-ms=2000
npm run example:agent:stdio -- --auto-approve-after-ms=2000
```

## Troubleshoot Fast

- `UNAUTHORIZED`: missing/wrong Basic Auth while `ADMIN_PASSWORD` is enabled.
- `INVALID_MCP_REQUEST`: first HTTP MCP request was not `initialize`.
- `INVALID_MCP_SESSION`: missing or invalid `mcp-session-id`.
- `INVALID_PAYLOAD` or `INVALID_REVIEW_TEXT`: scenario payload invalid or review text unresolved.
- Startup failure on non-local `HOST`: set `ADMIN_PASSWORD`.

## References

Read [references/mcp-integration.md](references/mcp-integration.md) for client snippets, complete payload examples, REST approval calls, webhook validation details, and a troubleshooting checklist.
