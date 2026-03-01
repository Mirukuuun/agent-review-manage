# AI Agent 审核网关

面向 AI Agent 的本地 Human-in-the-loop 审核网关。

## 提供能力

- MCP 工具：
  - `submit_review`
  - `get_review_status`
- MCP 传输方式：
  - 位于 `/mcp` 的 HTTP/SSE
  - stdio
- REST API：
  - `GET /api/health`
  - `GET /api/tasks`
  - `GET /api/tasks/:task_id`
  - `POST /api/tasks/:task_id/approve`
  - `POST /api/tasks/:task_id/reject`
  - `GET /api/settings`
  - `PUT /api/settings`
- Web UI：
  - Dashboard（仪表盘）
  - Workspace（工作区）
  - Settings（设置）
- 运行时任务：
  - 超时扫描（默认 60s）
  - webhook 分发扫描（默认 2s）
  - 重试延迟：5s / 30s / 120s（最多 4 次尝试）

## 技术栈

- Node.js >= 22（`node:sqlite`）
- npm workspaces（脚本名兼容 pnpm）
- TypeScript
- Fastify
- `@modelcontextprotocol/sdk`
- SQLite
- 原生 HTML/CSS/JS
- Vitest

## 项目结构

```text
apps/server      # 服务端 + 静态 UI
packages/shared  # 共享类型/常量/错误定义
scripts/         # 示例 agent + webhook 接收器
```

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 创建环境变量文件

```bash
cp .env.example .env
```

3. 启动 HTTP 服务

```bash
npm run mcp:http
```

4. 打开以下端点

- UI：`http://127.0.0.1:8787/`
- MCP：`http://127.0.0.1:8787/mcp`
- 健康检查：`http://127.0.0.1:8787/api/health`

## 示例命令

### HTTP Agent 流程

```bash
npm run example:agent:http -- --auto-approve-after-ms=2000
```

### stdio Agent 流程

```bash
npm run example:agent:stdio -- --auto-approve-after-ms=2000
```

### Webhook 流程

终端 A：

```bash
npm run example:webhook-receiver
```

终端 B：

```bash
npm run example:agent:http -- --use-webhook --webhook-url=http://127.0.0.1:9000/review-callback --auto-approve-after-ms=2000
```

## 安全行为

- 设置了 `ADMIN_PASSWORD` 时，`/api/*` 和 `/mcp` 需要 Basic Auth（`/api/health` 除外）。
- Basic Auth 用户名固定为 `admin`。
- 当 `HOST` 为非本地地址且 `ADMIN_PASSWORD` 为空时，服务启动会失败。

## 环境变量

- `HOST`（默认：`127.0.0.1`）
- `PORT`（默认：`8787`）
- `DB_PATH`（默认：`./data/review-gateway.sqlite`）
- `ADMIN_PASSWORD`（可选）
- `WEBHOOK_SECRET`（可选）
- `LOG_LEVEL`（默认：`info`）
- `TIMEOUT_SWEEP_INTERVAL_MS`（默认：`60000`）
- `WEBHOOK_SWEEP_INTERVAL_MS`（默认：`2000`）

## 开发命令

```bash
npm run dev
npm run typecheck
npm run test
npm run build
npm run lint
```

## 错误码

- `INVALID_SCENARIO`
- `INVALID_PAYLOAD`
- `INVALID_REVIEW_TEXT`
- `INVALID_WEBHOOK_URL`
- `INVALID_MCP_REQUEST`
- `INVALID_MCP_SESSION`
- `TASK_ALREADY_PROCESSED`

## CI

GitHub Actions 工作流：`.github/workflows/ci.yml`

- Node 22 和 24
- `npm ci`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## 说明

- 当前只实现了 `xhs_comment` 场景。
- UI 为原生静态文件（不使用 React/Vue）。
- 本轮迭代有意不包含 Docker/Compose。
