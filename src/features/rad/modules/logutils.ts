/**
 * Structured and colorized console/file logging utilities with configurable severity levels.
 */
import { appendFileSync } from "node:fs";
import { colors } from "../../../shared/colors.ts";

/**
 * Numeric severity levels used to filter log output in {@link Logger}.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Configuration options for constructing a {@link Logger}.
 */
export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  json?: boolean;
  logFile?: string;
}

/**
 * Structured logger supporting ANSI-colored terminal output, JSON-lines mode, and file appending.
 */
export class Logger {
  level: LogLevel;
  prefix: string;
  json: boolean;
  logFile?: string;

  /**
   * Creates a new {@link Logger} instance with the given options.
   * @param options - Minimum log level, prefix tag, JSON output flag, and optional log file path.
   */
  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? "";
    this.json = options.json ?? false;
    this.logFile = options.logFile;
  }

  private write(level: LogLevel, levelName: string, colorFn: (s: string) => string, msg: string, meta?: any): void {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();

    if (this.json) {
      const payload: Record<string, any> = {
        timestamp,
        level: levelName,
        message: msg,
      };
      if (this.prefix) payload.prefix = this.prefix;
      if (meta !== undefined) payload.meta = meta;
      const line = JSON.stringify(payload);
      console.log(line);
      if (this.logFile) {
        appendFileSync(this.logFile, `${line}\n`);
      }
      return;
    }

    const tag = colorFn(`[${levelName}]`.padEnd(7));
    const prefixStr = this.prefix ? `[${this.prefix}] ` : "";
    const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
    const line = `${colors.dim(timestamp)} ${tag} ${prefixStr}${msg}${metaStr}`;

    console.log(line);
    if (this.logFile) {
      // Strip ANSI codes for plain file logging
      const plain = line.replace(/\x1b\[[0-9;]*m/g, "");
      appendFileSync(this.logFile, `${plain}\n`);
    }
  }

  /**
   * Logs a `DEBUG`-level message and optional structured metadata.
   */
  debug(msg: string, meta?: any): void {
    this.write(LogLevel.DEBUG, "DEBUG", colors.gray, msg, meta);
  }

  /**
   * Logs an `INFO`-level message and optional structured metadata.
   */
  info(msg: string, meta?: any): void {
    this.write(LogLevel.INFO, "INFO", colors.green, msg, meta);
  }

  /**
   * Logs a `WARN`-level message and optional structured metadata.
   */
  warn(msg: string, meta?: any): void {
    this.write(LogLevel.WARN, "WARN", colors.yellow, msg, meta);
  }

  /**
   * Logs an `ERROR`-level message and optional structured metadata.
   */
  error(msg: string, meta?: any): void {
    this.write(LogLevel.ERROR, "ERROR", colors.red, msg, meta);
  }
}

/**
 * Factory helper that creates a new {@link Logger} with the provided options.
 */
export function newLogger(options: LoggerOptions = {}): Logger {
  return new Logger(options);
}

/**
 * Namespace of logging utilities (`LogLevel`, `Logger`, `newLogger`).
 */
export const logutils = {
  LogLevel,
  Logger,
  newLogger,
};
