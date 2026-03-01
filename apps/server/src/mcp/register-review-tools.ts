import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ERROR_CODES } from "@agent-review/shared";
import { ReviewService } from "../services/review-service.js";
import { isAppError } from "../util/errors.js";
import type { Logger } from "../util/logger.js";

const submitReviewInputSchema = z.object({
  agent_id: z.string().min(1),
  scenario: z.literal("xhs_comment"),
  payload: z.record(z.string(), z.unknown()),
  webhook_url: z.string().url().optional(),
  webhookUrl: z.string().url().optional(),
  client_request_id: z.string().min(1).optional(),
  clientRequestId: z.string().min(1).optional(),
  timeout_config: z
    .object({
      timeout_seconds: z.number().int().min(1).optional(),
      timeout_action: z.enum(["auto_approve", "auto_reject", "mark_timeout"]).optional()
    })
    .optional(),
  timeoutConfig: z
    .object({
      timeout_seconds: z.number().int().min(1).optional(),
      timeout_action: z.enum(["auto_approve", "auto_reject", "mark_timeout"]).optional()
    })
    .optional()
});

const getReviewStatusInputSchema = z.object({
  task_id: z.string().min(1)
});

export function registerReviewTools(server: McpServer, reviewService: ReviewService, logger: Logger): void {
  server.registerTool(
    "submit_review",
    {
      title: "提交待审任务",
      description: "提交一条待人工审核任务，返回 task_id 与过期时间",
      inputSchema: submitReviewInputSchema
    },
    async (args) => {
      try {
        const normalizedArgs = {
          ...args,
          webhook_url: args.webhook_url ?? args.webhookUrl,
          client_request_id: args.client_request_id ?? args.clientRequestId,
          timeout_config: args.timeout_config ?? args.timeoutConfig
        };
        const result = reviewService.submitReview(normalizedArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: { ...result }
        };
      } catch (error) {
        logger.warn("submit_review failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_review_status",
    {
      title: "查询审核状态",
      description: "根据 task_id 查询审核终态",
      inputSchema: getReviewStatusInputSchema
    },
    async (args) => {
      try {
        const result = reviewService.getReviewStatus(args.task_id);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: { ...result }
        };
      } catch (error) {
        logger.warn("get_review_status failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        return toToolError(error);
      }
    }
  );
}

function toToolError(error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  if (isAppError(error)) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: error.code,
              message: error.message,
              details: error.details
            }
          })
        }
      ]
    };
  }

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : "Internal error"
          }
        })
      }
    ]
  };
}
