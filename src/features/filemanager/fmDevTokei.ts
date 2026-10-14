/**
 * The real `tokei` program as the code-statistics engine: found like the other helper programs, started with an
 * argument list (never a shell), a time limit and an output limit, and its JSON read defensively.
 */
import { spawn } from "child_process";
import { statSync } from "fs";
import type { FmContext } from "./fmCore";
import { capture } from "./fmToolDetect";
import { childEnv, findExecutable, searchDirs } from "./fmTools";
import { VENDORED_DIRS, type Cancellable } from "./fmDevWalk";
import { FmError } from "./fmPaths";
import type { FileRow, LangRow, StatsOptions } from "./fmDevTypes";

export const TOKEI_OUTPUT_CAP = 64 * 1024 * 1024;
export const TOKEI_INSTALL_HINT = "Install tokei with `brew install tokei` (macOS/Linux), `cargo install tokei`, `winget install XAMPPRocky.tokei` or `scoop install tokei`.";

export interface TokeiInfo {
  installed: boolean;
  path: string | null;
  version: string | null;
}

const versions = new Map<string, string | null>();

/** Where tokei is installed (if anywhere) and which version it is. The version is remembered until the file changes. */
export async function detectTokei(ctx: FmContext): Promise<TokeiInfo> {
  const extra = ctx.toolDirs ? [] : [`${ctx.home}/.cargo/bin`, `${ctx.home}/.local/bin`];
  const path = findExecutable(ctx.platform, ["tokei"], [...searchDirs(ctx), ...extra]);
  if (!path) return { installed: false, path: null, version: null };
  let key = path;
  try {
    key = `${path}|${statSync(path).mtimeMs}`;
  } catch {
    // keep the plain path as the key
  }
  if (!versions.has(key)) {
    const out = await capture([path, "--version"], childEnv(ctx), 8000);
    versions.set(key, out.code === 0 ? /(\d+\.\d+(?:\.\d+)*)/.exec(out.text)?.[1] ?? null : null);
  }
  return { installed: true, path, version: versions.get(key) ?? null };
}

/** The tokei arguments for a scan (all values are separate arguments, never joined into a command line). */
export function tokeiArgs(o: Pick<StatsOptions, "respectGitignore" | "hidden" | "vendored" | "excludes">): string[] {
  const args = ["--output", "json"];
  if (o.hidden) args.push("--hidden");
  if (!o.respectGitignore) args.push("--no-ignore");
  const excludes = [...(o.vendored ? [] : VENDORED_DIRS), ...o.excludes];
  for (const e of excludes) args.push(`--exclude=${e}`);
  args.push(".");
  return args;
}

interface RawReport {
  name?: unknown;
  stats?: { code?: unknown; comments?: unknown; blanks?: unknown; blobs?: Record<string, { code?: unknown; comments?: unknown; blanks?: unknown }> };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Reads tokei's JSON. Unknown or malformed parts are ignored; a document that isn't tokei's throws. */
export function parseTokeiJson(text: string): { languages: LangRow[]; files: FileRow[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FmError("TOKEI_BAD_OUTPUT", "tokei's answer couldn't be read.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new FmError("TOKEI_BAD_OUTPUT", "tokei's answer wasn't what was expected.");
  const rows = new Map<string, LangRow>();
  const files: FileRow[] = [];
  const row = (name: string) => {
    let r = rows.get(name);
    if (!r) rows.set(name, (r = { name, files: 0, code: 0, comments: 0, blanks: 0, lines: 0, bytes: 0 }));
    return r;
  };
  for (const [name, value] of Object.entries(data as Record<string, any>)) {
    if (name === "Total" || !value || typeof value !== "object") continue;
    const r = row(name);
    r.code += num(value.code);
    r.comments += num(value.comments);
    r.blanks += num(value.blanks);
    for (const rep of Array.isArray(value.reports) ? (value.reports as RawReport[]) : []) {
      if (typeof rep?.name !== "string") continue;
      r.files++;
      const own = rep.stats ?? {};
      let code = num(own.code);
      let comments = num(own.comments);
      let blanks = num(own.blanks);
      for (const blob of Object.values(own.blobs ?? {})) {
        code += num(blob?.code);
        comments += num(blob?.comments);
        blanks += num(blob?.blanks);
      }
      files.push({ path: rep.name.replace(/^\.[\\/]/, "").replace(/\\/g, "/"), language: name, code, comments, blanks, size: 0 });
    }
    // Code embedded in other languages (JavaScript inside HTML, Markdown in doc comments) is counted under its own language.
    for (const [childName, reports] of Object.entries((value.children ?? {}) as Record<string, RawReport[]>)) {
      const c = row(childName);
      for (const rep of Array.isArray(reports) ? reports : []) {
        c.code += num(rep?.stats?.code);
        c.comments += num(rep?.stats?.comments);
        c.blanks += num(rep?.stats?.blanks);
      }
    }
  }
  const languages = [...rows.values()].map((r) => ({ ...r, lines: r.code + r.comments + r.blanks }));
  return { languages, files };
}

/** Runs tokei in `root`. Rejects with an FmError when it can't be started, fails, is cancelled or runs out of time. */
export function runTokei(ctx: FmContext, path: string, root: string, options: StatsOptions, signal: Cancellable, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(path, tokeiArgs(options), { cwd: root, env: childEnv(ctx), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (err) {
      return reject(new FmError("TOKEI_FAILED", `tokei couldn't be started: ${(err as Error).message}`));
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let errText = "";
    let overflow = false;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(watch);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new FmError("TOKEI_TIMEOUT", `tokei took longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped.`)));
    }, timeoutMs);
    const watch = setInterval(() => {
      if (signal.cancelled) {
        child.kill();
        finish(() => reject(new FmError("CANCELLED", "Cancelled.")));
      }
    }, 100);
    child.stdout.on("data", (d: Buffer) => {
      size += d.length;
      if (size > TOKEI_OUTPUT_CAP) {
        overflow = true;
        child.kill();
      } else chunks.push(d);
    });
    child.stderr.on("data", (d: Buffer) => {
      if (errText.length < 4000) errText += d.toString("utf8");
    });
    child.once("error", (err) => finish(() => reject(new FmError("TOKEI_FAILED", `tokei couldn't be started: ${err.message}`))));
    child.once("close", (code) => {
      finish(() => {
        if (overflow) return reject(new FmError("TOKEI_TOO_BIG", "tokei's answer is too big to handle. Narrow the folder or add exclude patterns, or use the built-in counter."));
        const text = Buffer.concat(chunks).toString("utf8");
        if (code !== 0 && !text.trim()) return reject(new FmError("TOKEI_FAILED", `tokei stopped with an error${errText.trim() ? `: ${errText.trim().split("\n")[0]!.slice(0, 200)}` : "."}`));
        resolve(text);
      });
    });
  });
}
