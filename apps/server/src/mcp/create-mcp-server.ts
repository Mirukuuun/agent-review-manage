import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReviewTools } from "./register-review-tools.js";
import { ReviewService } from "../services/review-service.js";
import type { Logger } from "../util/logger.js";

export function createReviewMcpServer(reviewService: ReviewService, logger: Logger): McpServer {
  const server = new McpServer({
    name: "ai-agent-review-gateway",
    version: "0.1.0"
  });

  registerReviewTools(server, reviewService, logger);
  return server;
}
