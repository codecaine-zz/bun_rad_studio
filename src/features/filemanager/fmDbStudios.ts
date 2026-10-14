/**
 * Runs the four database studios (`--server` mode) as child programs, one per connection, and keeps them tidy:
 * a start-up deadline, a capped and scrubbed log, crash notices in plain words, at most a few at once, and
 * nothing left behind (they stop with the File Manager, and also when it is killed: see src/parentWatch.ts).
 */
import { FmError } from "./fmPaths";
import type { DatabasesHooks, DbProcess } from "./fmDbHooks";
import { ENGINES, type DbEngine } from "./fmDbModel";

export type StudioState = "starting" | "running" | "stopping" | "stopped" | "crashed";

export interface StudioInfo {
  id: string;
  engine: DbEngine;
  /** What it was started for: the connection's id, or null for a SQLite file opened directly. */
  profileId: string | null;
  title: string;
  state: StudioState;
  port?: number;
  pid?: number;
  /** The address of the studio's page, only while it runs. */
  url?: string;
  startedAt: number;
  endedAt?: number;
  exitCode?: number | null;
  /** Plain words about why it is not running. */
  message?: string;
  /** The last few log lines, for the status line. */
  tail: string[];
  /** Set when the connection is marked read-only or production and the person confirmed that the studio can still change data. */
  writesConfirmed: boolean;
}

export interface StartRequest {
  engine: DbEngine;
  /** One studio per key (engine and connection). */
  key: string;
  profileId: string | null;
  title: string;
  command: string[];
  env: Record<string, string>;
  cwd: string;
  /** Secret values to remove from the log. */
  secrets: string[];
  writesConfirmed: boolean;
}

const READY = /(?:^|\s)READY:(\d{1,5})\b/;
const LOG_LINES = 300;
const LOG_LINE_MAX = 400;
const KEEP_FINISHED = 8;

interface Entry {
  info: StudioInfo;
  key: string;
  proc: DbProcess | null;
  log: string[];
  secrets: string[];
  timers: ReturnType<typeof setTimeout>[];
  ended: Promise<void>;
  endedResolve: () => void;
  stopping: boolean;
}

const live = new Set<StudioManager>();
let exitHookInstalled = false;

function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on("exit", () => {
    for (const m of live) m.killAllNow();
  });
}

/** Removes known secret values and anything that looks like a password in an address. */
export function scrubLog(line: string, secrets: string[]): string {
  let out = line.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  for (const s of secrets) if (s && s.length >= 3) out = out.split(s).join("••••");
  out = out.replace(/(:\/\/[^:/@\s]*:)[^@/\s]+@/g, "$1••••@").replace(/\b(password|passwd|pwd)(["']?\s*[=:]\s*["']?)[^\s"'&;,]+/gi, "$1$2••••");
  return out.length > LOG_LINE_MAX ? out.slice(0, LOG_LINE_MAX) + "…" : out;
}

/** What went wrong, from the last lines the studio printed and how it ended. */
export function explainExit(lines: string[], code: number | null, studio: string): string {
  const text = lines.join("\n");
  if (/EADDRINUSE|address already in use/i.test(text)) return `${studio} couldn't open its network port because something else is using it. Try again.`;
  if (/Cannot find module|Module not found|ENOENT.*\.(ts|js)/i.test(text)) return `${studio}'s program files couldn't be found. The download may be incomplete.`;
  if (/libwebview|webview/i.test(text) && /error|cannot|failed/i.test(text)) return `${studio} needs the desktop window library, which isn't available here.`;
  if (/permission denied|EACCES/i.test(text)) return `${studio} wasn't allowed to start or to use a file. Check the file permissions.`;
  if (/out of memory|heap/i.test(text)) return `${studio} ran out of memory.`;
  return `${studio} stopped unexpectedly${code !== null && code !== undefined ? ` (exit code ${code})` : ""}. The last lines of its log are shown below.`;
}

export class StudioManager {
  private entries = new Map<string, Entry>();
  private seq = 0;

  constructor(private readonly hooks: DatabasesHooks) {
    live.add(this);
    installExitHook();
  }

  list(): StudioInfo[] {
    return [...this.entries.values()].map((e) => ({ ...e.info, tail: e.log.slice(-4) }));
  }

  get(id: string): StudioInfo | undefined {
    const e = this.entries.get(id);
    return e ? { ...e.info, tail: e.log.slice(-4) } : undefined;
  }

  logs(id: string, max = 120): string[] {
    const e = this.entries.get(id);
    if (!e) throw new FmError("NOT_FOUND", "That studio isn't running any more.");
    return e.log.slice(-Math.min(max, LOG_LINES));
  }

  /** The running or starting studio for this key, if any. */
  find(key: string): StudioInfo | undefined {
    for (const e of this.entries.values()) if (e.key === key && (e.info.state === "starting" || e.info.state === "running")) return this.get(e.info.id);
    return undefined;
  }

  activeCount(): number {
    return [...this.entries.values()].filter((e) => e.info.state === "starting" || e.info.state === "running" || e.info.state === "stopping").length;
  }

  /** Where a running studio's page is, or null. Only a running studio of ours is ever framed. */
  runningPort(id: string): number | null {
    const e = this.entries.get(id);
    return e && e.info.state === "running" && e.info.port ? e.info.port : null;
  }

  async start(req: StartRequest): Promise<StudioInfo> {
    const existing = this.find(req.key);
    if (existing) return existing;
    if (this.activeCount() >= this.hooks.maxStudios) throw new FmError("TOO_MANY", `${this.hooks.maxStudios} studios are already open. Stop one first.`);

    // Finished entries for the same connection are replaced; keep only a few of the rest.
    for (const [id, e] of this.entries) if (e.key === req.key && (e.info.state === "stopped" || e.info.state === "crashed")) this.entries.delete(id);
    const finished = [...this.entries.values()].filter((e) => e.info.state === "stopped" || e.info.state === "crashed");
    for (const e of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED + 1))) this.entries.delete(e.info.id);

    const id = `st${++this.seq}-${Math.random().toString(36).slice(2, 10)}`;
    let endedResolve!: () => void;
    const ended = new Promise<void>((r) => (endedResolve = r));
    const entry: Entry = {
      info: { id, engine: req.engine, profileId: req.profileId, title: req.title, state: "starting", startedAt: this.hooks.now(), tail: [], writesConfirmed: req.writesConfirmed },
      key: req.key,
      proc: null,
      log: [],
      secrets: req.secrets,
      timers: [],
      ended,
      endedResolve,
      stopping: false,
    };
    this.entries.set(id, entry);

    let proc: DbProcess;
    try {
      proc = this.hooks.spawn(req.command, { env: req.env, cwd: req.cwd });
    } catch (err) {
      this.finish(entry, "crashed", null, `${ENGINES[req.engine].studioName} couldn't be started: ${scrubLog(err instanceof Error ? err.message : String(err), req.secrets)}`);
      return this.get(id)!;
    }
    entry.proc = proc;
    entry.info.pid = proc.pid;

    let readyResolve!: (port: number) => void;
    const ready = new Promise<number>((r) => (readyResolve = r));
    const pump = (stream: ReadableStream<Uint8Array> | null, watchReady: boolean) => {
      if (!stream) return;
      const decoder = new TextDecoder();
      let pending = "";
      const reader = stream.getReader();
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            pending += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = pending.indexOf("\n")) >= 0) {
              this.addLine(entry, pending.slice(0, nl), watchReady, readyResolve);
              pending = pending.slice(nl + 1);
            }
            if (pending.length > 4000) pending = pending.slice(-1000);
          }
          if (pending) this.addLine(entry, pending, watchReady, readyResolve);
        } catch {
          // a closed pipe just ends the log
        }
      })();
    };
    pump(proc.stdout, true);
    pump(proc.stderr, false);

    proc.exited.then((code) => {
      if (entry.stopping) this.finish(entry, "stopped", code, entry.info.message);
      else if (entry.info.state !== "stopped" && entry.info.state !== "crashed") this.finish(entry, "crashed", code, explainExit(entry.log.slice(-12), code, ENGINES[entry.info.engine].studioName));
    });

    // Wait for READY:<port> and for the page to answer, within the deadline.
    const deadline = this.hooks.startTimeoutMs;
    const timedOut = new Promise<"timeout">((r) => entry.timers.push(setTimeout(() => r("timeout"), deadline)));
    const first = await Promise.race([ready, timedOut, entry.ended.then(() => "ended" as const)]);
    if (first === "timeout") {
      this.finish(entry, "crashed", null, `${ENGINES[req.engine].studioName} didn't become ready within ${Math.round(deadline / 1000)} seconds.`);
      this.terminate(entry);
      return this.get(id)!;
    }
    if (first === "ended") return this.get(id)!;
    const port = first;
    let answered = false;
    const probeEnd = this.hooks.now() + deadline;
    while (!answered && entry.info.state === "starting" && this.hooks.now() < probeEnd) {
      answered = await this.hooks.probe(port);
      if (!answered) await new Promise((r) => setTimeout(r, 120));
    }
    if (entry.info.state !== "starting") return this.get(id)!;
    if (!answered) {
      this.finish(entry, "crashed", null, `${ENGINES[req.engine].studioName} started but its page didn't answer.`);
      this.terminate(entry);
      return this.get(id)!;
    }
    entry.info.port = port;
    entry.info.url = `http://127.0.0.1:${port}/`;
    entry.info.state = "running";
    const life = setTimeout(() => {
      if (entry.info.state === "running") {
        const hours = this.hooks.maxLifetimeMs / 3600_000;
        entry.info.message = `Stopped after ${hours >= 1 ? `${Math.round(hours)} hours` : `${Math.max(1, Math.round(hours * 60))} minute${Math.round(hours * 60) > 1 ? "s" : ""}`}, so a forgotten studio doesn't run for days.`;
        void this.stop(id);
      }
    }, this.hooks.maxLifetimeMs);
    (life as { unref?: () => void }).unref?.();
    entry.timers.push(life);
    return this.get(id)!;
  }

  private addLine(entry: Entry, raw: string, watchReady: boolean, ready: (port: number) => void) {
    const line = scrubLog(raw.replace(/\r$/, ""), entry.secrets);
    if (!line.trim()) return;
    entry.log.push(line);
    if (entry.log.length > LOG_LINES) entry.log.splice(0, entry.log.length - LOG_LINES);
    if (watchReady) {
      const m = READY.exec(raw);
      if (m) {
        const port = Number(m[1]);
        if (port > 0 && port < 65536) ready(port);
      }
    }
  }

  private finish(entry: Entry, state: "stopped" | "crashed", code: number | null, message?: string) {
    if (entry.info.state === "stopped" || entry.info.state === "crashed") return;
    for (const t of entry.timers) clearTimeout(t);
    entry.timers = [];
    entry.info.state = state;
    entry.info.endedAt = this.hooks.now();
    entry.info.exitCode = code;
    entry.info.port = undefined;
    entry.info.url = undefined;
    if (message) entry.info.message = message;
    entry.endedResolve();
  }

  /** Asks the program to stop, and ends it after the grace period if it doesn't. */
  private terminate(entry: Entry) {
    const proc = entry.proc;
    if (!proc) return;
    try {
      proc.kill("SIGTERM");
    } catch {}
    const t = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, this.hooks.killGraceMs);
    (t as { unref?: () => void }).unref?.();
    proc.exited.then(() => clearTimeout(t));
  }

  async stop(id: string): Promise<StudioInfo> {
    const entry = this.entries.get(id);
    if (!entry) throw new FmError("NOT_FOUND", "That studio isn't running any more.");
    if (entry.info.state === "stopped" || entry.info.state === "crashed") return this.get(id)!;
    entry.stopping = true;
    entry.info.state = "stopping";
    this.terminate(entry);
    await Promise.race([entry.ended, new Promise((r) => { const t = setTimeout(r, this.hooks.killGraceMs + 3000); (t as { unref?: () => void }).unref?.(); })]);
    if (entry.info.state === "stopping") this.finish(entry, "stopped", null, entry.info.message);
    return this.get(id)!;
  }

  /** Begins stopping every studio without waiting (used when the File Manager closes). */
  stopAll() {
    for (const e of this.entries.values()) {
      if (e.info.state === "starting" || e.info.state === "running") {
        e.stopping = true;
        this.terminate(e);
      }
    }
  }

  /** Last resort when the process is exiting: no grace period. */
  killAllNow() {
    for (const e of this.entries.values()) {
      if (e.proc && e.info.state !== "stopped" && e.info.state !== "crashed") {
        try {
          e.proc.kill("SIGKILL");
        } catch {}
      }
    }
  }

  dispose() {
    this.stopAll();
    live.delete(this);
  }
}
