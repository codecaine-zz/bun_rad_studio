/**
 * The terminal panel's shells. One real shell per open terminal, on a pseudo-terminal (PTY), started in a folder.
 *
 * A PTY needs Bun's `terminal` option, which exists on macOS and Linux only; on Windows `terminalSupported` is false
 * and the page says so instead of showing a button that cannot work.
 *
 * A terminal is a full shell running as the current user: nothing the File Manager protects (the Recycle Bin, the
 * protected folders, confirmations) applies inside it. The server therefore only opens one for a request that
 * carries the session token, and limits how many are open at once.
 */
import { existsSync, statSync } from "fs";
import type { FmContext } from "./fmCore";

export const MAX_TERMINALS = 4;
export const MAX_INPUT_BYTES = 64 * 1024;

export function terminalSupported(platform: FmContext["platform"]): boolean {
  return platform !== "win32";
}

/** The user's shell, if it is an existing absolute path; otherwise a shell every system has. */
export function pickShell(platform: FmContext["platform"], env: Record<string, string | undefined> = process.env): string {
  const own = env.SHELL;
  if (own && own.startsWith("/") && existsSync(own)) return own;
  const fallbacks = platform === "darwin" ? ["/bin/zsh", "/bin/bash", "/bin/sh"] : ["/bin/bash", "/bin/sh"];
  return fallbacks.find((p) => existsSync(p)) ?? "/bin/sh";
}

export function clampSize(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
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
