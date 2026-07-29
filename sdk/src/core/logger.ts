import type { Logger, LogLevel } from "../types/common.js";
import { redactObject } from "./redact.js";

const LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

function write(stream: "stderr" | "stdout", label: string, message: string, meta?: unknown): void {
  const line = meta === undefined ? `[cash-drive] ${label} ${message}` : `[cash-drive] ${label} ${message} ${JSON.stringify(redactObject(meta))}`;
  if (stream === "stderr") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export function createLogger(level: LogLevel = "warn"): Logger {
  const threshold = LEVEL_ORDER[level];
  return {
    error(message, meta) {
      if (threshold >= LEVEL_ORDER.error) write("stderr", "error", message, meta);
    },
    warn(message, meta) {
      if (threshold >= LEVEL_ORDER.warn) write("stderr", "warn", message, meta);
    },
    info(message, meta) {
      if (threshold >= LEVEL_ORDER.info) write("stderr", "info", message, meta);
    },
    debug(message, meta) {
      if (threshold >= LEVEL_ORDER.debug) write("stderr", "debug", message, meta);
    },
  };
}

export const silentLogger: Logger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

export function resolveLogger(logger?: Logger | LogLevel): Logger {
  if (logger === undefined) return createLogger("warn");
  if (typeof logger === "string") return logger === "silent" ? silentLogger : createLogger(logger);
  return logger;
}
