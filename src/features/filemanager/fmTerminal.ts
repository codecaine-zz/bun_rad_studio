/**
 * The terminal panel's shells. One real shell per open terminal, on a pseudo-terminal (PTY), started in a folder.
 *
 * macOS/Linux use Bun's PTY; Windows uses a ConPTY bridge hosted by the system PowerShell.
 *
 * A terminal is a full shell running as the current user: nothing the File Manager protects (the Recycle Bin, the
 * protected folders, confirmations) applies inside it. The server therefore only opens one for a request that
 * carries the session token, and limits how many are open at once.
 */
import { existsSync, promises as fsp, statSync } from "fs";
import { win32, resolve } from "path";
import type { FmContext } from "./fmCore";
import { childEnv } from "./fmTools";

export const MAX_TERMINALS = 4;
export const MAX_INPUT_BYTES = 64 * 1024;

export function terminalSupported(platform: FmContext["platform"]): boolean {
  return platform === "win32" || platform === "darwin" || platform === "linux";
}

/** The user's shell, if it is an existing absolute path; otherwise a shell every system has. */
export function pickShell(platform: FmContext["platform"], env: Record<string, string | undefined> = process.env): string {
  if (platform === "win32") {
    return win32.join(env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }
  const own = env.SHELL;
  if (own && own.startsWith("/") && existsSync(own)) return own;
  const fallbacks = platform === "darwin" ? ["/bin/zsh", "/bin/bash", "/bin/sh"] : ["/bin/bash", "/bin/sh"];
  return fallbacks.find((p) => existsSync(p)) ?? "/bin/sh";
}

export function clampSize(value: unknown, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/**
 * The folder a shell is in right now, or null when it can't be told. Linux reads /proc; macOS asks `lsof` for the
 * shell's working folder. Only the shell's own process is asked about (a number we got from the system), and the
 * answer is checked to be a plain absolute path before it is used.
 */
export async function shellFolder(platform: FmContext["platform"], pid: number): Promise<string | null> {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  let path: string | null = null;
  try {
    if (platform === "linux") {
      path = await fsp.readlink(`/proc/${pid}/cwd`);
    } else if (platform === "darwin") {
      const lsof = ["/usr/sbin/lsof", "/usr/bin/lsof"].find((p) => existsSync(p));
      if (!lsof) return null;
      const proc = Bun.spawn([lsof, "-a", "-d", "cwd", "-Fn", "-p", String(pid)], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
      const timer = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 1500);
      const out = await new Response(proc.stdout).text();
      clearTimeout(timer);
      path = out.split("\n").find((l) => l.startsWith("n"))?.slice(1) ?? null;
    }
  } catch {
    return null;
  }
  // The shell may have been in a folder that has since been removed; Linux then adds " (deleted)".
  if (!path || !path.startsWith("/") || /[\x00-\x1f\x7f]/.test(path) || path.length > 4096 || / \(deleted\)$/.test(path)) return null;
  try {
    if (!(await fsp.stat(path)).isDirectory()) return null;
  } catch {
    return null; // the folder is gone (macOS still names it)
  }
  return path;
}

export interface TerminalSession {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  /** Ends the shell: hangs up first, and forces it to stop if it ignores that. */
  close(): void;
}

export interface OpenTerminalOptions {
  cwd: string;
  cols: number;
  rows: number;
  onData: (text: string) => void;
  onExit: (code: number | null) => void;
}

function openWindowsTerminal(ctx: FmContext, options: OpenTerminalOptions): TerminalSession {
  const shell = pickShell("win32");
  const proc = Bun.spawn([
    shell, "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", resolve(import.meta.dir, "../../../resources/file_manager/windows-terminal.ps1"),
    "-Shell", shell, "-WorkingDirectory", options.cwd, "-Columns", String(options.cols), "-Rows", String(options.rows),
  ], { cwd: options.cwd, env: childEnv(ctx), stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  let closed = false;
  const pump = async (stream: ReadableStream<Uint8Array>, error = false) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true });
      if (!closed && text) options.onData(error ? `\r\n${text}` : text);
    }
    const rest = decoder.decode();
    if (!closed && rest) options.onData(rest);
  };
  const fail = (error: unknown) => {
    if (closed) return;
    options.onData(`\r\nWindows terminal connection failed: ${error instanceof Error ? error.message : String(error)}\r\n`);
    session.close();
    options.onExit(null);
  };
  const output = Promise.all([pump(proc.stdout), pump(proc.stderr, true)]).catch(fail);
  const send = (line: string) => {
    if (!closed) {
      try {
        proc.stdin.write(`${line}\n`);
        void Promise.resolve(proc.stdin.flush()).catch(fail);
      } catch (error) { fail(error); }
    }
  };
  void proc.exited.then(async (code) => {
    await output;
    if (!closed) { closed = true; options.onExit(code); }
  });
  const session: TerminalSession = {
    pid: proc.pid,
    write: (data) => send(`I:${Buffer.from(data, "utf8").toString("base64")}`),
    resize: (cols, rows) => send(`R:${cols}:${rows}`),
    close() {
      if (closed) return;
      closed = true;
      // EOF asks the bridge to terminate the shell and release ConPTY, including on server shutdown.
      proc.stdin.end();
      const timer = setTimeout(() => proc.kill(), 5000);
      timer.unref();
      void proc.exited.then(() => clearTimeout(timer));
    },
  };
  return session;
}

export interface TerminalHub {
  readonly count: number;
  /** Returns null when too many terminals are open. */
  open(ctx: FmContext, options: OpenTerminalOptions): TerminalSession | null;
  closeAll(): void;
}

export function createTerminalHub(limit = MAX_TERMINALS): TerminalHub {
  const sessions = new Set<TerminalSession>();

  return {
    get count() {
      return sessions.size;
    },

    open(ctx, options) {
      if (sessions.size >= limit) return null;
      if (!terminalSupported(ctx.platform)) throw new Error("Terminals aren't supported on this system.");
      if (!statSync(options.cwd).isDirectory()) throw new Error("That isn't a folder.");

      if (ctx.platform === "win32") {
        const windows = openWindowsTerminal(ctx, {
          ...options,
          onExit(code) { sessions.delete(session); options.onExit(code); },
        });
        const session: TerminalSession = {
          ...windows,
          close() { sessions.delete(session); windows.close(); },
        };
        sessions.add(session);
        return session;
      }

      const decoder = new TextDecoder();
      const proc = Bun.spawn([pickShell(ctx.platform)], {
        cwd: options.cwd,
        env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
        terminal: {
          cols: options.cols,
          rows: options.rows,
          data(_terminal: unknown, chunk: Uint8Array) {
            const text = decoder.decode(chunk, { stream: true });
            if (text) options.onData(text);
          },
        },
      });
      const pty = proc.terminal!;
      let closed = false;

      const session: TerminalSession = {
        pid: proc.pid,
        write(data) {
          if (!closed) pty.write(data);
        },
        resize(cols, rows) {
          if (!closed) pty.resize(cols, rows);
        },
        close() {
          if (closed) return;
          closed = true;
          sessions.delete(session);
          try { pty.close(); } catch {}
          // An interactive shell ignores a polite stop request, so end it if closing the terminal was not enough.
          const force = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 1000);
          force.unref?.();
          void proc.exited.then(() => clearTimeout(force));
        },
      };

      sessions.add(session);
      void proc.exited.then((code) => {
        const wasOpen = !closed;
        closed = true;
        sessions.delete(session);
        if (wasOpen) options.onExit(typeof code === "number" ? code : null);
      });
      return session;
    },

    closeAll() {
      for (const s of [...sessions]) s.close();
    },
  };
}
