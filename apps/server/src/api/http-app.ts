import { randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  ERROR_CODES,
  REVIEW_STATUSES,
  REVIEW_SCENARIOS,
  TIMEOUT_ACTIONS,
  type ListTasksQuery,
  type SystemSettings
} from "@agent-review/shared";
import { enforceBasicAuth } from "./auth.js";
import type { ReviewService } from "../services/review-service.js";
import type { SettingsService } from "../services/settings-service.js";
import type { Logger } from "../util/logger.js";
import { AppError, isAppError } from "../util/errors.js";
import { createReviewMcpServer } from "../mcp/create-mcp-server.js";

const listTasksQuerySchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  scenario: z.enum(REVIEW_SCENARIOS).optional(),
  task_id: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().max(100).optional()
});

const approveSchema = z.object({
  reviewer_id: z.string().trim().min(1).max(128).optional(),
  feedback: z.string().trim().max(1000).optional(),
  approve_mode: z.enum(["pass", "edit_pass"]).optional(),
  final_payload: z.record(z.string(), z.unknown()).optional()
});

const rejectSchema = z.object({
  reviewer_id: z.string().trim().min(1).max(128).optional(),
  feedback: z.string().trim().max(1000).optional()
});

const updateSettingsSchema = z.object({
  default_timeout_seconds: z.number().int().min(1).max(7 * 24 * 3600).optional(),
  default_timeout_action: z.enum(TIMEOUT_ACTIONS).optional(),
  default_reviewer_id: z.string().trim().max(128).optional()
});

interface HttpAppOptions {
  reviewService: ReviewService;
  settingsService: SettingsService;
  logger: Logger;
  adminPassword?: string;
}

interface McpSession {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  close: () => Promise<void>;
}

export async function buildHttpApp(options: HttpAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID()
  });

  const logger = options.logger.child({ scope: "http" });
  const mcpSessions = new Map<string, McpSession>();

  app.addHook("onRequest", async (request, reply) => {
    await enforceBasicAuth(request, reply, options.adminPassword);
    logger.info("request", { request_id: request.id, method: request.method, url: request.url });
  });

  app.addHook("onResponse", async (request, reply) => {
    logger.info("response", {
      request_id: request.id,
      method: request.method,
      url: request.url,
      status_code: reply.statusCode
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
      return;
    }

    if (error instanceof z.ZodError) {
      reply.status(400).send({
        error: {
          code: ERROR_CODES.INVALID_PAYLOAD,
          message: "Invalid request payload",
          details: error.flatten()
        }
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("unhandled error", { error: message, stack });
    reply.status(500).send({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: "Internal error"
      }
    });
  });

  app.get("/api/health", async () => ({ status: "ok", now: new Date().toISOString() }));

  app.get("/api/tasks", async (request) => {
    const parsed = listTasksQuerySchema.parse(request.query);
    const query: ListTasksQuery = {
      status: parsed.status,
      scenario: parsed.scenario,
      task_id: parsed.task_id,
      page: parsed.page,
      page_size: parsed.page_size
    };

    return options.reviewService.listTasks(query);
  });

  app.get("/api/tasks/:task_id", async (request) => {
    const params = z.object({ task_id: z.string().min(1) }).parse(request.params);
    return options.reviewService.getTaskById(params.task_id);
  });

  app.post("/api/tasks/:task_id/approve", async (request) => {
    const params = z.object({ task_id: z.string().min(1) }).parse(request.params);
    const body = approveSchema.parse(request.body ?? {});
    return options.reviewService.approveTask(params.task_id, body);
  });

  app.post("/api/tasks/:task_id/reject", async (request) => {
    const params = z.object({ task_id: z.string().min(1) }).parse(request.params);
    const body = rejectSchema.parse(request.body ?? {});
    return options.reviewService.rejectTask(params.task_id, body);
  });

  app.get("/api/settings", async () => {
    return options.settingsService.getSettings();
  });

  app.put("/api/settings", async (request) => {
    const body = updateSettingsSchema.parse(request.body ?? {});
    const payload: Partial<SystemSettings> = {
      default_timeout_seconds: body.default_timeout_seconds,
      default_timeout_action: body.default_timeout_action,
      default_reviewer_id: body.default_reviewer_id
    };
    return options.settingsService.updateSettings(payload);
  });

  app.route({
    method: ["GET", "POST", "DELETE"],
    url: "/mcp",
    handler: async (request, reply) => {
      const sessionId = readSessionId(request.headers);

      if (request.method === "POST" && !sessionId) {
        if (!isInitializeRequestBody(request.body)) {
          throw new AppError(ERROR_CODES.INVALID_MCP_REQUEST, "First MCP request must be initialize", 400);
        }

        const created = await createMcpSession(options.reviewService, logger.child({ scope: "mcp" }), mcpSessions);
        reply.hijack();
        await created.transport.handleRequest(request.raw, reply.raw, request.body);
        return;
      }

      if (!sessionId) {
        throw new AppError(ERROR_CODES.INVALID_MCP_SESSION, "Missing mcp-session-id", 400);
      }

      const session = mcpSessions.get(sessionId);
      if (!session) {
        throw new AppError(ERROR_CODES.INVALID_MCP_SESSION, "Invalid mcp-session-id", 400);
      }

      reply.hijack();
      await session.transport.handleRequest(request.raw, reply.raw, request.method === "POST" ? request.body : undefined);

      if (request.method === "DELETE") {
        mcpSessions.delete(sessionId);
        await session.close();
      }
    }
  });

  const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../public");
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/"
  });

  app.get("/", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  app.addHook("onClose", async () => {
    for (const session of mcpSessions.values()) {
      await session.close();
    }
    mcpSessions.clear();
  });

  return app;
}

async function createMcpSession(
  reviewService: ReviewService,
  logger: Logger,
  sessions: Map<string, McpSession>
): Promise<McpSession> {
  const server = createReviewMcpServer(reviewService, logger);
  let resolvedSessionId = "";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      resolvedSessionId = sessionId;
    },
    onsessionclosed: (sessionId) => {
      const existing = sessions.get(sessionId);
      if (existing) {
        sessions.delete(sessionId);
      }
    }
  });

  await server.connect(transport);

  const session: McpSession = {
    get sessionId() {
      return resolvedSessionId || transport.sessionId || "";
    },
    transport,
    close: async () => {
      await server.close();
    }
  };

  const maybeSessionId = transport.sessionId;
  if (maybeSessionId) {
    resolvedSessionId = maybeSessionId;
    sessions.set(maybeSessionId, session);
  } else {
    const originalHandleRequest = transport.handleRequest.bind(transport);
    transport.handleRequest = async (req, res, parsedBody) => {
      await originalHandleRequest(req, res, parsedBody);
      const newSessionId = transport.sessionId;
      if (newSessionId && !sessions.has(newSessionId)) {
        resolvedSessionId = newSessionId;
        sessions.set(newSessionId, session);
      }
    };
  }

  return session;
}

function readSessionId(headers: Record<string, unknown>): string | undefined {
  const rawValue = headers["mcp-session-id"] ?? headers["Mcp-Session-Id"];
  if (Array.isArray(rawValue)) {
    return rawValue[0];
  }

  return typeof rawValue === "string" && rawValue.trim().length > 0 ? rawValue.trim() : undefined;
}

function isInitializeRequestBody(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }

  const maybeMethod = (body as Record<string, unknown>).method;
  return maybeMethod === "initialize";
}
