import { ReviewService } from "../services/review-service.js";
import type { Logger } from "../util/logger.js";

export class RuntimeScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly reviewService: ReviewService,
    private readonly logger: Logger,
    private readonly intervalMs: number
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
      const count = this.reviewService.runTimeoutSweep(100);
      if (count > 0) {
        this.logger.info("timeout sweep processed tasks", { count });
      }
    } catch (error) {
      this.logger.error("timeout sweep failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      this.running = false;
    }
  }
}
