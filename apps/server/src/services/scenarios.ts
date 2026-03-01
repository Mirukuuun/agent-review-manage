import { z } from "zod";
import { ERROR_CODES, REVIEW_SCENARIOS, type ReviewScenario } from "@agent-review/shared";
import { AppError } from "../util/errors.js";

const xhsCommentSchema = z
  .object({
    url: z.string().url(),
    text: z.string().trim().min(1),
    review_text: z.string().trim().min(1).optional(),
    review_text_path: z.string().trim().min(1).optional(),
    context_info: z.string().trim().min(1).optional()
  })
  .passthrough();

export interface ScenarioReviewContent {
  reviewText: string;
  contextInfo: string | null;
}

export function validateScenario(scenario: string): asserts scenario is ReviewScenario {
  if (!REVIEW_SCENARIOS.includes(scenario as ReviewScenario)) {
    throw new AppError(ERROR_CODES.INVALID_SCENARIO, `Unsupported scenario: ${scenario}`, 400);
  }
}

export function validateScenarioPayload(scenario: ReviewScenario, payload: unknown): Record<string, unknown> {
  if (scenario === "xhs_comment") {
    const result = xhsCommentSchema.safeParse(payload);
    if (!result.success) {
      throw new AppError(ERROR_CODES.INVALID_PAYLOAD, "Invalid scenario payload", 400, result.error.flatten());
    }

    return result.data;
  }

  throw new AppError(ERROR_CODES.INVALID_SCENARIO, `Unsupported scenario: ${scenario}`, 400);
}

export function extractScenarioReviewContent(scenario: ReviewScenario, payload: Record<string, unknown>): ScenarioReviewContent {
  if (scenario === "xhs_comment") {
    const reviewTextPath = typeof payload.review_text_path === "string" ? payload.review_text_path : undefined;
    if (reviewTextPath) {
      const resolved = resolvePath(payload, reviewTextPath);
      if (typeof resolved !== "string" || resolved.trim().length === 0) {
        throw new AppError(ERROR_CODES.INVALID_REVIEW_TEXT, "review_text_path points to empty or invalid text", 400);
      }

      return {
        reviewText: resolved,
        contextInfo: typeof payload.context_info === "string" ? payload.context_info : null
      };
    }

    const directReviewText = typeof payload.review_text === "string" ? payload.review_text.trim() : "";
    if (directReviewText.length > 0) {
      return {
        reviewText: directReviewText,
        contextInfo: typeof payload.context_info === "string" ? payload.context_info : null
      };
    }

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (text.length === 0) {
      throw new AppError(ERROR_CODES.INVALID_REVIEW_TEXT, "Cannot resolve review text", 400);
    }

    return {
      reviewText: text,
      contextInfo: typeof payload.context_info === "string" ? payload.context_info : null
    };
  }

  throw new AppError(ERROR_CODES.INVALID_SCENARIO, `Unsupported scenario: ${scenario}`, 400);
}

function resolvePath(source: Record<string, unknown>, path: string): unknown {
  const segments = path.split(".").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
