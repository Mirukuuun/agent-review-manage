import { createHmac, randomUUID } from "node:crypto";
import type { ReviewCompletedEvent } from "@agent-review/shared";
import { ReviewService } from "./review-service.js";
import type { Logger } from "../util/logger.js";

export class WebhookDispatcher {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly reviewService: ReviewService,
    private readonly logger: Logger,
    private readonly intervalMs: number,
    private readonly webhookSecret?: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const jobs = this.reviewService.listDueWebhookJobs(100);
      for (const job of jobs) {
        await this.dispatchSingle(job.task_id, job.webhook_url, job.callback_attempts, job.callback_event_id);
      }
    } catch (error) {
      this.logger.error("webhook dispatcher run failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.running = false;
    }
  }

  private async dispatchSingle(
    taskId: string,
    webhookUrl: string,
    callbackAttempts: number,
    existingEventId: string | null
  ): Promise<void> {
    const eventId = existingEventId ?? randomUUID();
    const eventTimestamp = new Date().toISOString();

    const status = this.reviewService.getReviewStatus(taskId);
    const event: ReviewCompletedEvent = {
      event: "review.completed",
      event_id: eventId,
      event_timestamp: eventTimestamp,
      task: status
    };

    const body = JSON.stringify(event);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-event-id": eventId,
      "x-event-timestamp": eventTimestamp
    };

    if (this.webhookSecret) {
      headers["x-signature"] = createHmac("sha256", this.webhookSecret)
        .update(`${eventTimestamp}.${body}`)
        .digest("hex");
    }

    try {
      const response = await this.fetchFn(webhookUrl, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000)
      });

      if (response.ok) {
        this.reviewService.markCallbackSuccess(taskId, eventId);
        this.logger.info("webhook delivered", { task_id: taskId, webhook_url: webhookUrl, event_id: eventId });
      } else {
        this.handleFailure(taskId, eventId, callbackAttempts + 1, `HTTP ${response.status}`);
      }
    } catch (error) {
      this.handleFailure(taskId, eventId, callbackAttempts + 1, error instanceof Error ? error.message : String(error));
    }
  }

  private handleFailure(taskId: string, eventId: string, attempts: number, reason: string): void {
    this.reviewService.markCallbackRetryOrFailure(taskId, eventId, attempts);
    this.logger.warn("webhook delivery failed", {
      task_id: taskId,
      event_id: eventId,
      attempts,
      reason
    });
  }
}
