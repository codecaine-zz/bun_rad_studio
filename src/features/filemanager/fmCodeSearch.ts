/**
 * The Code tab's workspace helpers: a list of the files in a folder (for "Go to file"), and "Find in files".
 * Walking yields to the event loop, and the text search runs in a worker thread that is stopped when it takes too
 * long, so a huge folder or a badly written pattern can never freeze the File Manager.
 */
import { promises as fsp } from "fs";
import { absolutePath, assertFolder, pathApi, tick, type FmContext } from "./fmCore";
import { FmError } from "./fmPaths";

export const MAX_FILES = 20_000;
export const MAX_RESULTS = 1000;
const SKIP_DIRS = new Set(["node_modules", ".git", ".hg", ".svn", "dist", ".next", ".nuxt", ".cache", ".venv", "__pycache__", ".idea", ".gradle", ".tox", "coverage"]);
const BIG_DIR = 5000;

export interface FileList { root: string; files: string[]; truncated: boolean; timedOut: boolean; skipped: string[] }

/** Relative paths (with "/") of the files under `root`, breadth first. Links are never followed. */
export async function listWorkspaceFiles(ctx: FmContext, rootInput: unknown, opts: { hidden?: boolean; timeMs?: number } = {}): Promise<FileList> {
  const root = absolutePath(ctx, rootInput);
  await assertFolder(root, "That folder");
  const p = pathApi(ctx);
  const deadline = Date.now() + (opts.timeMs ?? 4000);
  const files: string[] = [];
  const skipped: string[] = [];
  const queue: string[] = [""];
  let truncated = false;
  let timedOut = false;
  let visited = 0;
  while (queue.length && !truncated && !timedOut) {
    const rel = queue.shift()!;
    let entries: import("fs").Dirent[];
    try {
      entries = await fsp.readdir(rel ? p.join(root, rel) : root, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.length > BIG_DIR && rel) { skipped.push(`${rel}/ (${entries.length} items)`); continue; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (!opts.hidden && e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        queue.push(childRel);
      } else if (e.isFile()) {
        if (files.length >= MAX_FILES) { truncated = true; break; }
        files.push(childRel);
      }
    }
    if (++visited % 20 === 0) {
      await tick();
      if (Date.now() > deadline) timedOut = true;
    }
  }
  return { root, files, truncated, timedOut, skipped: skipped.slice(0, 20) };
}

// ---------------------------------------------------------------------------------------------------------------
// Find in files (worker thread)
// ---------------------------------------------------------------------------------------------------------------

export interface SearchMatch { path: string; line: number; col: number; length: number; text: string }
export interface SearchOutcome { matches: SearchMatch[]; filesSearched: number; skippedBinary: number; truncated: boolean; timedOut: boolean }

/** The worker's program. It only ever reads, and receives a list of files from the server. */
const WORKER_SOURCE = `
const fs = require("fs");
self.onmessage = (e) => {
  const { root, sep, files, query, regex, caseSensitive, wholeWord, maxResults, maxBytes } = e.data;
  let re;
  try {
    let source = regex ? query : query.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
    if (wholeWord) source = "\\\\b(?:" + source + ")\\\\b";
    re = new RegExp(source, caseSensitive ? "g" : "gi");
  } catch (err) {
    postMessage({ type: "done", error: "That pattern isn't valid: " + String(err && err.message || err).slice(0, 120) });
    return;
  }
  const matches = [];
  let searched = 0, binary = 0, truncated = false, lastPost = Date.now();
  for (const rel of files) {
    let buf;
    try {
      const st = fs.statSync(root + sep + rel);
      if (!st.isFile() || st.size > maxBytes) continue;
      buf = fs.readFileSync(root + sep + rel);
    } catch (err) { continue; }
    if (buf.includes(0)) { binary++; continue; }
    searched++;
    const lines = buf.toString("utf8").split(/\\r\\n|\\n|\\r/);
    for (let i = 0; i < lines.length && !truncated; i++) {
      const raw = lines[i];
      if (raw.length > 4000) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(raw)) !== null) {
        if (m[0] === "") { re.lastIndex++; if (re.lastIndex > raw.length) break; continue; }
        matches.push({ path: rel, line: i + 1, col: m.index + 1, length: m[0].length, text: raw.length > 300 ? raw.slice(Math.max(0, m.index - 100), m.index + 200) : raw, cut: raw.length > 300 ? Math.max(0, m.index - 100) : 0 });
        if (matches.length >= maxResults) { truncated = true; break; }
      }
    }
    if (truncated) break;
    if (Date.now() - lastPost > 300) { lastPost = Date.now(); postMessage({ type: "progress", matches: matches.length, searched }); }
  }
  postMessage({ type: "done", matches, searched, binary, truncated });
};
`;

export function searchWorkspace(ctx: FmContext, root: string, files: string[], q: { query: string; regex: boolean; caseSensitive: boolean; wholeWord: boolean }, timeMs = 12_000): Promise<SearchOutcome> {
  const p = pathApi(ctx);
  return new Promise((resolve, reject) => {
    const stop = () => finish(() => resolve({ matches: [], filesSearched: 0, skippedBinary: 0, truncated: false, timedOut: true }));
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url);
    let done = false;
    let progress = 0;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const at = ctx.disposers.indexOf(stop);
      if (at >= 0) ctx.disposers.splice(at, 1);
      try { worker.terminate(); } catch {}
      URL.revokeObjectURL(url);
      fn();
    };
    const timer = setTimeout(() => finish(() => resolve({ matches: [], filesSearched: progress, skippedBinary: 0, truncated: false, timedOut: true })), timeMs);
    worker.onmessage = (ev: MessageEvent) => {
      const m = ev.data;
      if (m.type === "progress") progress = m.searched;
      else if (m.type === "done") {
        if (m.error) finish(() => reject(new FmError("BAD_PATTERN", m.error)));
        else finish(() => resolve({ matches: m.matches.map((x: any) => ({ path: x.path, line: x.line, col: x.col - x.cut, length: x.length, text: x.text })), filesSearched: m.searched, skippedBinary: m.binary, truncated: m.truncated, timedOut: false }));
      }
    };
    worker.onerror = (ev: ErrorEvent) => finish(() => reject(new FmError("SEARCH_FAILED", `The search stopped: ${ev.message ?? "unknown problem"}`)));
    worker.postMessage({ root, sep: p.sep, files, ...q, maxResults: MAX_RESULTS, maxBytes: 5 * 1024 * 1024 });
    ctx.disposers.push(stop);
  });
}

/** `code/search`: walks the folder, then searches the files in the worker. */
export async function findInFiles(ctx: FmContext, body: Record<string, any>): Promise<SearchOutcome & { root: string; fileListTruncated: boolean }> {
  if (typeof body.query !== "string" || !body.query) throw new FmError("BAD_REQUEST", "Type something to look for.");
  if (body.query.length > 500) throw new FmError("BAD_REQUEST", "That search text is too long.");
  const list = await listWorkspaceFiles(ctx, body.root, { hidden: body.hidden === true, timeMs: 3000 });
  let files = list.files;
  if (typeof body.include === "string" && body.include.trim()) {
    const parts = body.include.split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 10);
    const res = parts.map((g: string) => new RegExp(`(^|/)${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*").replace(/\?/g, "[^/]")}$`));
    files = files.filter((f) => res.some((r: RegExp) => r.test(f)));
  }
  const out = await searchWorkspace(ctx, list.root, files, { query: body.query, regex: body.regex === true, caseSensitive: body.caseSensitive === true, wholeWord: body.wholeWord === true }, Number.isFinite(body.timeMs) ? Math.min(12_000, Math.max(300, Number(body.timeMs))) : 12_000);
  return { ...out, root: list.root, fileListTruncated: list.truncated || list.timedOut };
}
