type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

class JsonLogger implements Logger {
  private readonly level: LogLevel;
  private readonly bindings: Record<string, unknown>;

  constructor(level: LogLevel, bindings: Record<string, unknown> = {}) {
    this.level = level;
    this.bindings = bindings;
  }

  child(bindings: Record<string, unknown>): Logger {
    return new JsonLogger(this.level, { ...this.bindings, ...bindings });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...(meta ?? {})
    };

    const line = JSON.stringify(payload);
    if (level === "error") {
      process.stderr.write(`${line}\n`);
      return;
    }

    process.stdout.write(`${line}\n`);
  }
}

export function createLogger(inputLevel: string | undefined): Logger {
  const normalized = (inputLevel ?? "info").toLowerCase();
  const level: LogLevel = normalized === "debug" || normalized === "warn" || normalized === "error" ? normalized : "info";
  return new JsonLogger(level);
}
