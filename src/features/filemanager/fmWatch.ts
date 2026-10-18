/**
 * The engine of the File Manager's "Watch" tool: it watches a folder and runs a command whenever files change
 * (like the stand-alone Task Watcher Studio). A `Watcher` owns one folder watch, at most one running command and
 * that watcher's log and history; the `WatchHub` keeps a few of them per server and stops them all with it.
 *
 * Commands run through the system shell, as the current user, so the operations that start a watcher need the
 * person's confirmation (see fmWatchOps.ts). Whatever is running is always ended with its whole process tree.
 */
import { statSync, watch as fsWatch, type FSWatcher } from "fs";
import * as nodePath from "path";
import type { Subprocess } from "bun";
import { buildWatchexecEnv, killRunningProcess, shouldTrigger } from "../watchexec/watchexecDoers";
import type { FmContext } from "./fmCore";
import { FmError, describeFsError } from "./fmPaths";
import { LogBuffer, MAX_LOG_CHARS, createTextCleaner } from "./fmWatchLog";

export const MAX_HISTORY = 50;
export const MAX_ACTIVE_WATCHERS = 3;
const MAX_KEPT_WATCHERS = 6;

export type WatchState = "ACTIVE" | "STOPPED" | "ERROR";
export type RunKind = "running" | "success" | "failed" | "cancelled";
export type ShellChoice = "sh" | "bash" | "zsh" | "cmd" | "powershell";

export interface HistoryRow {
  time: string;
  n: number;
  file: string;
  /** RUNNING, SUCCESS, FAILED(n) or CANCELLED. */
  status: string;
  kind: RunKind;
  code: number | null;
  duration: string;
}

export interface WatchConfig {
  watchPath: string;
  cwd: string;
  command: string;
  exts: string[];
  ignore: string[];
  filters: string[];
  debounce: number;
  clear: boolean;
  postponeInitial: boolean;
  restart: boolean;
  shell: ShellChoice | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Running a command
// ---------------------------------------------------------------------------------------------------------------

/** The program and arguments that run `command` through a shell. */
export function shellArgv(platform: FmContext["platform"], shell: ShellChoice | null, command: string): string[] {
  if (platform === "win32") {
    if (shell === "powershell") return ["powershell.exe", "-NoProfile", "-Command", command];
    return ["cmd.exe", "/d", "/s", "/c", command];
  }
  return [shell && shell !== "cmd" && shell !== "powershell" ? `/bin/${shell}` : "/bin/sh", "-c", command];
}

interface Run {
  proc: Subprocess;
  row: HistoryRow;
  startedAt: number;
  cancelled: boolean;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Watcher {
  state: WatchState = "ACTIVE";
  message = "";
  status = "Watching for changes.";
  triggerCount = 0;
  lastEvent: string | null = null;
  pid: number | null = null;
  history: HistoryRow[] = [];
  readonly log: LogBuffer;
  readonly startedAt = Date.now();

  private current: Run | null = null;
  private fsw: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private guard: ReturnType<typeof setInterval> | null = null;
  private pending: { abs: string; rel: string } | null = null;

  constructor(readonly id: string, private readonly platform: FmContext["platform"], readonly config: WatchConfig, logCap = MAX_LOG_CHARS) {
    this.log = new LogBuffer(logCap);
  }

  get running(): boolean {
    return this.current !== null;
  }

  start(): void {
    try {
      this.fsw = fsWatch(this.config.watchPath, { recursive: true }, (_event, name) => this.onEvent(name));
    } catch (err) {
      throw new FmError("WATCH_FAILED", `The folder couldn't be watched: ${describeFsError(err, "watch that folder").message}`);
    }
    this.fsw.on("error", (err) => this.fail(`Watching stopped: ${describeFsError(err).message}`));
    // Removing the watched folder usually raises no event at all, so look for it now and then.
    this.guard = setInterval(() => this.checkFolder(), 1500);
    this.guard.unref?.();
    this.log.append(`[watchexec] Watching ${this.config.watchPath}\n`);
    if (!this.config.postponeInitial) void this.run(null);
  }

  private onEvent(name: string | Buffer | null): void {
    if (this.state !== "ACTIVE") return;
    const rel = typeof name === "string" ? name : name ? name.toString() : "";
    let wanted = false;
    try {
      wanted = !!rel && shouldTrigger(rel, this.config.exts, this.config.ignore, this.config.filters);
    } catch {
      wanted = false;
    }
    if (!wanted) return;
    const abs = nodePath.join(this.config.watchPath, rel);
    try {
      if (statSync(abs).isDirectory()) return;
    } catch {
      // A deleted or transient file should still trigger the watcher.
    }
    this.pending = { abs, rel };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const change = this.pending;
      this.pending = null;
      if (change && this.state === "ACTIVE") void this.run(change);
    }, this.config.debounce);
  }

  /** Runs the command now (`change` null means "run now" from the page). Returns what happened. */
  async run(change: { abs: string; rel: string } | null): Promise<"started" | "busy" | "failed"> {
    if (this.state !== "ACTIVE") throw new FmError("NOT_WATCHING", "This watcher has stopped. Start a new one to run the command.");
    const { config } = this;
    if (change) this.lastEvent = change.rel;
    if (this.current && !config.restart) {
      this.log.append(`\n[watchexec] Change ignored${change ? ` (${change.rel})` : ""}: the previous run is still going and "Restart on change" is off.\n`);
      return "busy";
    }
    try {
      if (!statSync(config.cwd).isDirectory()) throw new Error("not a folder");
    } catch {
      this.log.append(`\n[watchexec] The folder to run in doesn't exist: ${config.cwd}\n`);
      this.status = `The folder to run in doesn't exist: ${config.cwd}`;
      return "failed";
    }

    if (config.clear) this.log.clear();
    if (this.current) {
      this.log.append("\n[watchexec] Restarting: stopping the previous run.\n");
      this.cancel(this.current);
    }

    this.triggerCount++;
    const startedAt = Date.now();
    const row: HistoryRow = { time: new Date(startedAt).toLocaleTimeString(), n: this.triggerCount, file: change?.rel ?? "Manual", status: "RUNNING", kind: "running", code: null, duration: "…" };
    this.history.unshift(row);
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY;
    this.log.append(`\n[${row.time}] [watchexec] Running: ${config.command}\n[watchexec] In folder: ${config.cwd}\n`);
    if (change) this.log.append(`[watchexec] Triggered by: ${change.abs}\n`);

    let proc: Subprocess;
    try {
      const argv = shellArgv(this.platform, config.shell, config.command);
      const isCmd = this.platform === "win32" && argv[0]?.toLowerCase() === "cmd.exe";
      proc = Bun.spawn(isCmd ? ["cmd.exe", "/d", "/s", "/c", `"${config.command}"`] : argv, {
        cwd: config.cwd,
        env: { ...process.env, ...buildWatchexecEnv(change?.abs, config.watchPath) },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        ...(isCmd ? { windowsVerbatimArguments: true } : {}),
      });
    } catch (err) {
      this.setRow(row, "failed", -1, startedAt);
      this.log.append(`\n[watchexec] The command couldn't be started: ${describeFsError(err).message}\n`);
      this.status = "The command couldn't be started.";
      return "failed";
    }
    const run: Run = { proc, row, startedAt, cancelled: false };
    this.current = run;
    this.pid = proc.pid;
    this.status = `Running: ${config.command}`;
    void this.finish(run);
    return "started";
  }

  private async finish(run: Run): Promise<void> {
    const pump = async (stream: ReadableStream<Uint8Array> | null | undefined) => {
      if (!stream) return;
      const clean = createTextCleaner();
      const reader = stream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          this.output(run, clean(value));
        }
        this.output(run, clean(null, true));
      } catch {
        // the pipe was closed under us: the run is over
      }
    };
    const pumps = Promise.all([pump(run.proc.stdout as ReadableStream<Uint8Array>), pump(run.proc.stderr as ReadableStream<Uint8Array>)]);
    const exit = await run.proc.exited;
    // A program left running in the background could keep the pipes open for ever, so only wait a moment for the rest.
    await Promise.race([pumps, sleep(300)]);
    if (run.cancelled) return;
    const code = typeof exit === "number" ? exit : -1;
    this.setRow(run.row, code === 0 ? "success" : "failed", code, run.startedAt);
    this.log.append(`\n[watchexec] The command finished with status ${code} (${seconds(Date.now() - run.startedAt)}).\n`);
    if (this.current === run) {
      this.current = null;
      this.pid = null;
    }
    this.status = code === 0 ? `Finished OK in ${seconds(Date.now() - run.startedAt)}.` : `Failed with status ${code} after ${seconds(Date.now() - run.startedAt)}.`;
  }

  private output(run: Run, text: string): void {
    if (text && !run.cancelled) this.log.append(text);
  }

  private setRow(row: HistoryRow, kind: RunKind, code: number | null, startedAt: number): void {
    row.kind = kind;
    row.code = code;
    row.status = kind === "success" ? "SUCCESS" : kind === "failed" ? `FAILED(${code})` : kind === "cancelled" ? "CANCELLED" : "RUNNING";
    row.duration = seconds(Date.now() - startedAt);
  }

  /** Ends a run and its whole process tree; its late output is dropped. */
  private cancel(run: Run): void {
    run.cancelled = true;
    this.setRow(run.row, "cancelled", null, run.startedAt);
    killRunningProcess(run.proc);
    if (this.current === run) {
      this.current = null;
      this.pid = null;
    }
  }

  /** Ends the running command, if any. Returns whether there was one. */
  kill(): boolean {
    const run = this.current;
    if (!run) return false;
    this.log.append("\n[watchexec] The command was stopped by you.\n");
    this.cancel(run);
    this.status = "The command was stopped.";
    return true;
  }

  private closeWatching(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.guard) clearInterval(this.guard);
    this.timer = null;
    this.guard = null;
    this.pending = null;
    try { this.fsw?.close(); } catch {}
    this.fsw = null;
  }

  stop(): void {
    if (this.state === "STOPPED") return;
    this.closeWatching();
    if (this.current) this.cancel(this.current);
    if (this.state === "ACTIVE") this.status = "Watcher stopped.";
    this.state = "STOPPED";
    this.log.append("\n[watchexec] Watcher stopped.\n");
  }

  private fail(message: string): void {
    if (this.state !== "ACTIVE") return;
    this.closeWatching();
    if (this.current) this.cancel(this.current);
    this.state = "ERROR";
    this.message = message;
    this.status = message;
    this.log.append(`\n[watchexec] ${message}\n`);
  }

  /** Notices when the watched folder has disappeared. */
  checkFolder(): void {
    if (this.state !== "ACTIVE") return;
    try {
      if (!statSync(this.config.watchPath).isDirectory()) throw new Error("not a folder");
    } catch {
      this.fail(`The folder being watched is gone (removed, moved or unreachable): ${this.config.watchPath}`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The hub
// ---------------------------------------------------------------------------------------------------------------

export interface WatchHub {
  readonly watchers: Map<string, Watcher>;
  create(config: WatchConfig, logCap?: number): Watcher;
  remove(id: string): boolean;
  closeAll(): void;
}

const hubs = new WeakMap<FmContext, WatchHub>();

/** The server's watchers. Created on first use; stopped (with everything they started) when the server stops. */
export function getWatchHub(ctx: FmContext): WatchHub {
  const existing = hubs.get(ctx);
  if (existing) return existing;
  let counter = 0;
  const watchers = new Map<string, Watcher>();
  const hub: WatchHub = {
    watchers,
    create(config, logCap) {
      const active = [...watchers.values()].filter((w) => w.state === "ACTIVE").length;
      if (active >= MAX_ACTIVE_WATCHERS) throw new FmError("TOO_MANY", `Up to ${MAX_ACTIVE_WATCHERS} watchers can run at once. Stop one first.`);
      const watcher = new Watcher(`w${++counter}`, ctx.platform, config, logCap);
      watcher.start();
      watchers.set(watcher.id, watcher);
      // Finished watchers stay visible so their log can still be read, but not for ever.
      for (const old of [...watchers.values()]) {
        if (watchers.size <= MAX_KEPT_WATCHERS) break;
        if (old.state !== "ACTIVE" && old !== watcher) watchers.delete(old.id);
      }
      return watcher;
    },
    remove(id) {
      const watcher = watchers.get(id);
      if (!watcher) return false;
      watcher.stop();
      return watchers.delete(id);
    },
    closeAll() {
      for (const w of watchers.values()) {
        try { w.stop(); } catch {}
      }
      watchers.clear();
      if (hubs.get(ctx) === hub) hubs.delete(ctx);
    },
  };
  hubs.set(ctx, hub);
  ctx.disposers.push(() => hub.closeAll());
  return hub;
}
