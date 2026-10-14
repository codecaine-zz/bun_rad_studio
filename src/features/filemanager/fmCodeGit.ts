/**
 * The Code tab's Git panel (read only): which files changed, and what changed in one file.
 * Only the `git` program is ever started, with an argument list (never a shell), a time limit and a size limit.
 */
import { spawn } from "child_process";
import { absolutePath, assertFolder, pathApi, type FmContext } from "./fmCore";
import { FmError } from "./fmPaths";

const TIMEOUT_MS = 8000;
const MAX_OUTPUT = 2 * 1024 * 1024;

export interface GitRun { ok: boolean; missing: boolean; stdout: string; stderr: string; truncated: boolean }

export function runGit(cwd: string, args: string[], timeoutMs = TIMEOUT_MS): Promise<GitRun> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;
    const done = (r: GitRun) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    let child;
    try {
      child = spawn("git", ["-c", "core.fsmonitor=false", "-c", "core.quotepath=false", ...args], {
        cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_PAGER: "cat", LC_ALL: "C" },
      });
    } catch {
      return resolve({ ok: false, missing: true, stdout: "", stderr: "", truncated: false });
    }
    const timer = setTimeout(() => {
      child.kill();
      done({ ok: false, missing: false, stdout, stderr: "Git took too long to answer.", truncated });
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString("utf8");
      else if (!truncated) { truncated = true; child.kill(); }
    });
    child.stderr.on("data", (d: Buffer) => { if (stderr.length < 8192) stderr += d.toString("utf8"); });
    child.once("error", (err: NodeJS.ErrnoException) => done({ ok: false, missing: err.code === "ENOENT", stdout, stderr: err.message, truncated }));
    child.once("close", (code) => done({ ok: code === 0 || truncated, missing: false, stdout: stdout.slice(0, MAX_OUTPUT), stderr, truncated }));
  });
}

const STATUS_NAMES: Record<string, string> = { M: "modified", A: "added", D: "deleted", R: "renamed", C: "copied", U: "conflict", "?": "new (untracked)", "!": "ignored", T: "type changed" };

export interface GitFile { path: string; from?: string; x: string; y: string; label: string }

export function parseStatus(output: string): { branch: string; ahead: number; behind: number; files: GitFile[] } {
  let branch = "";
  let ahead = 0;
  let behind = 0;
  const files: GitFile[] = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      const rest = line.slice(3);
      branch = rest.replace(/^No commits yet on /, "").replace(/^Initial commit on /, "").split("...")[0]!.replace(/ \[.*$/, "");
      ahead = Number(/ahead (\d+)/.exec(rest)?.[1] ?? 0);
      behind = Number(/behind (\d+)/.exec(rest)?.[1] ?? 0);
      continue;
    }
    if (line.length < 4) continue;
    const x = line[0]!;
    const y = line[1]!;
    let path = line.slice(3);
    let from: string | undefined;
    const arrow = path.indexOf(" -> ");
    if (arrow > 0 && (x === "R" || x === "C")) { from = path.slice(0, arrow); path = path.slice(arrow + 4); }
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1).replace(/\\(["\\])/g, "$1");
    const key = x === "?" ? "?" : x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D") ? "U" : y !== " " ? y : x;
    files.push({ path, from, x, y, label: STATUS_NAMES[key] ?? "changed" });
  }
  return { branch, ahead, behind, files: files.slice(0, 2000) };
}

function relativeFile(value: unknown): string {
  if (typeof value !== "string" || !value || value.includes("\0") || value.length > 4096) throw new FmError("BAD_REQUEST", "No file was given.");
  const clean = value.replace(/\\/g, "/");
  if (clean.startsWith("/") || /^[A-Za-z]:/.test(clean) || clean.split("/").includes("..")) throw new FmError("BAD_PATH", "That file isn't inside the repository.");
  return clean;
}

/** `code/git`: action "status" (default), "diff" (changes against the last commit) or "show" (the last committed text). */
export async function gitInfo(ctx: FmContext, body: Record<string, any>): Promise<Record<string, unknown>> {
  const root = absolutePath(ctx, body.root);
  await assertFolder(root, "That folder");
  const action = body.action === undefined ? "status" : body.action;
  if (action !== "status" && action !== "diff" && action !== "show") throw new FmError("BAD_REQUEST", "That Git action isn't supported.");
  const top = await runGit(root, ["rev-parse", "--show-toplevel"]);
  if (top.missing) return { available: false, isRepo: false, message: "Git isn't installed (or isn't on your PATH), so there is nothing to show here." };
  if (!top.ok || !top.stdout.trim()) return { available: true, isRepo: false, message: "This folder isn't inside a Git repository." };
  const toplevel = pathApi(ctx).resolve(top.stdout.trim());
  if (action === "status") {
    const r = await runGit(toplevel, ["status", "--porcelain=v1", "-b", "--untracked-files=normal"]);
    if (!r.ok) return { available: true, isRepo: true, root: toplevel, message: r.stderr.trim() || "Git couldn't report the status." };
    return { available: true, isRepo: true, root: toplevel, ...parseStatus(r.stdout), truncated: r.truncated };
  }
  const file = relativeFile(body.file);
  if (action === "diff") {
    const r = await runGit(toplevel, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "HEAD", "--", file]);
    if (!r.ok) {
      const plain = await runGit(toplevel, ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--", file]);
      return { available: true, isRepo: true, root: toplevel, diff: plain.stdout, truncated: plain.truncated, message: plain.ok ? "" : r.stderr.trim() };
    }
    return { available: true, isRepo: true, root: toplevel, diff: r.stdout, truncated: r.truncated, message: "" };
  }
  const r = await runGit(toplevel, ["show", `HEAD:${file}`]);
  return { available: true, isRepo: true, root: toplevel, text: r.ok ? r.stdout : "", truncated: r.truncated, message: r.ok ? "" : "That file isn't in the last commit." };
}
