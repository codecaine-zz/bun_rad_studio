/**
 * "Run a command on the results" (fd's -x and -X) WITHOUT a shell: the command text is split into words here
 * (quotes allowed), the {} placeholders are filled in per word, and the program is started with those words as
 * its arguments. Nothing in a file name can therefore be mistaken for shell syntax.
 */
import { spawn } from "child_process";
import * as nodePath from "path";
import type { FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import { EXEC_MAX_RUNS, EXEC_OUTPUT_CAP, EXEC_TIMEOUT_MS } from "./fmFindShared";
import { findState } from "./fmFindRun";

/** Splits a command into words. Spaces separate; '...' and "..." group; inside "..." a backslash escapes " and \. */
export function tokenize(template: string, platform: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let started = false;
  let i = 0;
  while (i < template.length) {
    const c = template[i]!;
    if (c === "'" || c === '"') {
      started = true;
      i++;
      let closed = false;
      while (i < template.length) {
        const d = template[i]!;
        if (d === c) {
          closed = true;
          i++;
          break;
        }
        if (c === '"' && d === "\\" && (template[i + 1] === '"' || template[i + 1] === "\\") && (platform !== "win32" || template[i + 1] === '"')) {
          current += template[i + 1];
          i += 2;
          continue;
        }
        current += d;
        i++;
      }
      if (!closed) throw new FmError("BAD_COMMAND", "A quote in the command isn't closed. Add the missing quote mark.");
    } else if (/\s/.test(c)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
      i++;
    } else if (c === "\\" && platform !== "win32" && i + 1 < template.length) {
      current += template[i + 1];
      started = true;
      i += 2;
    } else {
      current += c;
      started = true;
      i++;
    }
  }
  if (started) tokens.push(current);
  return tokens;
}

const PLACEHOLDER = /\{(\/\/|\/\.|\/|\.)?\}/g;
const hasPlaceholder = (token: string) => new RegExp(PLACEHOLDER.source).test(token);

/** Fills {} (path), {/} (name), {//} (folder), {.} (path without extension) and {/.} (name without extension). */
export function fillPlaceholders(token: string, path: string, platform: string): string {
  const p = platform === "win32" ? nodePath.win32 : nodePath.posix;
  const name = p.basename(path);
  const ext = p.extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  const dir = p.dirname(path);
  return token.replace(PLACEHOLDER, (_m, kind: string | undefined) => {
    switch (kind) {
      case "/": return name;
      case "//": return dir;
      case ".": return p.join(dir, stem);
      case "/.": return stem;
      default: return path;
    }
  });
}

export interface ExecPlan {
  program: string;
  /** One list of arguments per run. */
  runs: Array<{ path: string | null; args: string[] }>;
}

/**
 * `each`: the command runs once per path (fd -x). `batch`: it runs once and every word holding a placeholder is
 * repeated for each path (fd -X). A command without any placeholder gets {} added at the end, like fd does.
 */
export function planExec(templateInput: unknown, paths: string[], mode: "each" | "batch", platform: string): ExecPlan {
  if (typeof templateInput !== "string" || !templateInput.trim()) throw new FmError("BAD_COMMAND", 'Type a command first, like: wc -l {}');
  if (templateInput.length > 2000) throw new FmError("BAD_COMMAND", "That command is too long.");
  if (templateInput.includes("\0")) throw new FmError("BAD_COMMAND", "That command isn't valid.");
  const tokens = tokenize(templateInput, platform);
  if (tokens.length === 0) throw new FmError("BAD_COMMAND", 'Type a command first, like: wc -l {}');
  if (tokens.length > 100) throw new FmError("BAD_COMMAND", "That command has too many parts.");
  const [program, ...rest] = tokens as [string, ...string[]];
  if (hasPlaceholder(program)) throw new FmError("BAD_COMMAND", "The program name can't contain {} - put the file placeholders after it.");
  const words = rest.some(hasPlaceholder) ? rest : [...rest, "{}"];
  if (mode === "each") {
    if (paths.length > EXEC_MAX_RUNS) throw new FmError("TOO_MANY", `That would start the program ${paths.length} times (the limit is ${EXEC_MAX_RUNS}). Use "Run once with all results" instead.`);
    return { program, runs: paths.map((path) => ({ path, args: words.map((w) => fillPlaceholders(w, path, platform)) })) };
  }
  const args: string[] = [];
  for (const w of words) {
    if (hasPlaceholder(w)) for (const path of paths) args.push(fillPlaceholders(w, path, platform));
    else args.push(w);
  }
  if (args.reduce((n, a) => n + a.length + 1, 0) > 200_000) throw new FmError("TOO_MANY", "That's too many items for one command. Narrow the search or run it on fewer items.");
  return { program, runs: [{ path: null, args }] };
}

export interface ExecRun {
  path: string | null;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  error?: string;
  durationMs: number;
}

export interface ExecOutcome {
  runs: ExecRun[];
  truncated: boolean;
  timedOut: boolean;
  /** Runs that were never started because the time ran out. */
  notRun: number;
}

const quote = (a: string) => (/[\s"']/.test(a) || a === "" ? JSON.stringify(a) : a);

/** Starts the program with the given arguments (no shell), with a time limit and a cap on how much output is kept. */
export async function runExec(ctx: FmContext, plan: ExecPlan, cwd: string, limits: { timeoutMs?: number; outputCap?: number } = {}): Promise<ExecOutcome> {
  const state = findState(ctx);
  const deadline = Date.now() + (limits.timeoutMs ?? EXEC_TIMEOUT_MS);
  let budget = limits.outputCap ?? EXEC_OUTPUT_CAP;
  let truncated = false;
  let anyTimeout = false;
  const runs: ExecRun[] = [];
  const keep = (text: string): string => {
    if (text.length <= budget) {
      budget -= text.length;
      return text;
    }
    truncated = true;
    const part = text.slice(0, Math.max(0, budget));
    budget = 0;
    return part;
  };
  for (const run of plan.runs) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const started = Date.now();
    const result = await new Promise<Omit<ExecRun, "path" | "command" | "durationMs">>((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let child;
      try {
        child = spawn(plan.program, run.args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      } catch (err: any) {
        return resolve({ exitCode: null, stdout: "", stderr: "", timedOut: false, error: err?.message ?? "The program couldn't start." });
      }
      state.children.add(child);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGKILL"); } catch {}
      }, remaining);
      const done = (exitCode: number | null, error?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.children.delete(child);
        resolve({ exitCode, stdout: keep(stdout), stderr: keep(stderr), timedOut, ...(error ? { error } : {}) });
      };
      // Only the first part of the output is kept in memory, whatever the program prints.
      child.stdout?.on("data", (d: Buffer) => { if (stdout.length < EXEC_OUTPUT_CAP) stdout += d.toString("utf8"); });
      child.stderr?.on("data", (d: Buffer) => { if (stderr.length < EXEC_OUTPUT_CAP) stderr += d.toString("utf8"); });
      child.once("error", (err: NodeJS.ErrnoException) => done(null, err.code === "ENOENT" ? `The program "${plan.program}" wasn't found. Check the spelling, or give its full location.` : err.code === "EACCES" ? `You aren't allowed to run "${plan.program}".` : `The program couldn't start: ${err.message}`));
      child.once("close", (code) => done(code, timedOut ? "It took too long and was stopped." : undefined));
    });
    if (result.timedOut) anyTimeout = true;
    runs.push({ path: run.path, command: [plan.program, ...run.args].slice(0, 12).map(quote).join(" ") + (run.args.length > 11 ? ` … (${run.args.length} arguments)` : ""), durationMs: Date.now() - started, ...result });
  }
  return { runs, truncated, timedOut: anyTimeout, notRun: plan.runs.length - runs.length };
}
