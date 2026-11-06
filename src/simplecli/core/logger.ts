/**
 * Structured multi-level logger with ANSI colors and optional file streaming
 */

import { LogLevel, type LogLevelName } from "./types.ts";
import { Ansi } from "./ansi.ts";
import { appendFileSync } from "node:fs";

/**
 * Structured multi-level console and file logger with timestamped, ANSI-colored output.
 */
export class Logger {
  private level: LogLevel = LogLevel.INFO;
  private logFile: string | null = null;
  private noColor: boolean = false;

  /** Creates a new `Logger` with the specified minimum log level, optional file output path, and color setting. */
  constructor(
    level: LogLevel = LogLevel.INFO,
    logFile?: string,
    noColor: boolean = false,
  ) {
    this.level = level;
    if (logFile) this.logFile = logFile;
    this.noColor = noColor;
  }

  /** Sets the minimum log level by enum value or level name (`"trace"` through `"silent"`). */
  public setLevel(level: LogLevel | LogLevelName): this {
    if (typeof level === "string") {
      const map: Record<string, LogLevel> = {
        trace: LogLevel.TRACE,
        debug: LogLevel.DEBUG,
        info: LogLevel.INFO,
        warn: LogLevel.WARN,
        error: LogLevel.ERROR,
        silent: LogLevel.SILENT,
      };
      this.level = map[level.toLowerCase()] ?? LogLevel.INFO;
    } else {
      this.level = level;
    }
    return this;
  }

  /** Returns the current minimum `LogLevel`. */
  public getLevel(): LogLevel {
    return this.level;
  }

  /** Configures a file path to append plain-text log entries to, or `null` to disable file logging. */
  public setLogFile(filePath: string | null): this {
    this.logFile = filePath;
    return this;
  }

  /** Enables or disables ANSI color codes in console log output. */
  public setNoColor(noColor: boolean): this {
    this.noColor = noColor;
    return this;
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  private write(
    level: LogLevel,
    prefix: string,
    colorPrefix: string,
    message: string,
    ...args: any[]
  ): void {
    if (this.level > level) return;

    const timeStr = this.timestamp();
    const formattedArgs =
      args.length > 0
        ? " " +
          args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" ")
        : "";
    const consoleMsg = this.noColor
      ? `[${timeStr}] [${prefix}] ${message}${formattedArgs}`
      : `${Ansi.dim(`[${timeStr}]`)} ${colorPrefix} ${message}${formattedArgs}`;

    if (level >= LogLevel.ERROR) {
      console.error(consoleMsg);
    } else if (level === LogLevel.WARN) {
      console.warn(consoleMsg);
    } else {
      console.log(consoleMsg);
    }

    if (this.logFile) {
      try {
        const fileMsg = `[${timeStr}] [${prefix}] ${message}${formattedArgs}\n`;
        appendFileSync(this.logFile, fileMsg, "utf8");
      } catch (err) {
        console.error(
          `[Logger Error] Failed writing to log file "${this.logFile}":`,
          err,
        );
      }
    }
  }

  /** Logs a verbose trace-level diagnostic message. */
  public trace(message: string, ...args: any[]): void {
    const tag = this.noColor
      ? "[TRACE]"
      : Ansi.style(" TRACE ", Ansi.BG_MAGENTA + Ansi.WHITE);
    this.write(LogLevel.TRACE, "TRACE", tag, message, ...args);
  }

  /** Logs a debug-level message. */
  public debug(message: string, ...args: any[]): void {
    const tag = this.noColor
      ? "[DEBUG]"
      : Ansi.style(" DEBUG ", Ansi.BG_BLUE + Ansi.WHITE);
    this.write(LogLevel.DEBUG, "DEBUG", tag, message, ...args);
  }

  /** Logs an informational message. */
  public info(message: string, ...args: any[]): void {
    const tag = this.noColor
      ? "[INFO]"
      : Ansi.style(" INFO  ", Ansi.BG_CYAN + Ansi.BLACK);
    this.write(LogLevel.INFO, "INFO", tag, message, ...args);
  }

  /** Logs a success message at the `INFO` level. */
  public success(message: string, ...args: any[]): void {
    const tag = this.noColor
      ? "[SUCCESS]"
      : Ansi.style("   OK  ", Ansi.BG_GREEN + Ansi.BLACK);
    this.write(LogLevel.INFO, "SUCCESS", tag, message, ...args);
  }

  /** Logs a warning message to `console.warn`. */
  public warn(message: string, ...args: any[]): void {
    const tag = this.noColor
      ? "[WARN]"
      : Ansi.style(" WARN  ", Ansi.BG_YELLOW + Ansi.BLACK);
    this.write(LogLevel.WARN, "WARN", tag, message, ...args);
  }

  /** Logs an error message to `console.error`. */
  public error(message: string, ...args: any[]): void {
    const tag = this.noColor
      ? "[ERROR]"
      : Ansi.style(" ERROR ", Ansi.BG_RED + Ansi.WHITE);
    this.write(LogLevel.ERROR, "ERROR", tag, message, ...args);
  }

  /** Logs a fatal error message and immediately terminates the process with exit code `1`. */
  public fatal(message: string, ...args: any[]): never {
    const tag = this.noColor
      ? "[FATAL]"
      : Ansi.style(" FATAL ", Ansi.BG_RED + Ansi.BOLD + Ansi.WHITE);
    this.write(LogLevel.ERROR, "FATAL", tag, message, ...args);
    process.exit(1);
  }
}
