/**
 * Code statistics: picks the engine (the real tokei when it is installed, else the built-in counter), runs it as a
 * job and keeps the per-file table on the server for the page's drill-down. The built-in counter walks the folder
 * with fmDevWalk (so it never leaves the folder, never follows links, honours .gitignore) and counts each text
 * file with fmDevCount.
 */
import type { FmContext } from "./fmCore";
import { countText } from "./fmDevCount";
import { setProgress, type DevJob } from "./fmDevJobs";
import { languageForName, languageForShebang, type LangDef } from "./fmDevLangs";
import { MAX_READ_BYTES, decodeText, looksBinary, readHead, readRegularFile } from "./fmDevRead";
import { TOKEI_INSTALL_HINT, detectTokei, parseTokeiJson, runTokei } from "./fmDevTokei";
import { sumTotals, type FileRow, type LangRow, type StatsOptions, type StatsResult } from "./fmDevTypes";
import { HARD_MAX_SECONDS, resolveLimits, walkFiles, type Cancellable } from "./fmDevWalk";
import { FmError } from "./fmPaths";

/** The most the built-in counter reads in one scan. */
export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const CHUNK = 12;

export function parseStatsOptions(b: Record<string, any>): StatsOptions {
  const engine = b.engine === "tokei" || b.engine === "builtin" ? b.engine : "auto";
  const excludes = Array.isArray(b.excludes) ? b.excludes.filter((e: unknown): e is string => typeof e === "string" && e.trim().length > 0 && e.length <= 300 && !e.includes("\0")).map((e: string) => e.trim()).slice(0, 50) : [];
  const limit = (v: unknown) => (v === undefined ? undefined : Number(v));
  return {
    engine,
    respectGitignore: b.respectGitignore !== false,
    hidden: b.hidden === true,
    vendored: b.vendored === true,
    excludes,
    docAsComment: b.docAsComment !== false,
    maxFiles: limit(b.maxFiles),
    maxDirs: limit(b.maxDirs),
    maxSeconds: limit(b.maxSeconds),
  };
}

const sortRows = (rows: LangRow[]) => rows.sort((a, b) => b.code - a.code || b.lines - a.lines || a.name.localeCompare(b.name));

/** The built-in counter over a whole folder. */
export async function countFolder(root: string, o: StatsOptions, job: Cancellable, onProgress?: (p: Record<string, number>) => void): Promise<{ result: Omit<StatsResult, "engine" | "engineLabel" | "elapsedMs" | "notes" | "options" | "root">; files: FileRow[] }> {
  const rows = new Map<string, LangRow>();
  const files: FileRow[] = [];
  const skipped = { binary: 0, tooBig: 0, unknown: 0, symlinks: 0, ignored: 0, hidden: 0, vendored: 0 };
  let bytesRead = 0;
  let lines = 0;
  const countOne = async (abs: string, rel: string, name: string): Promise<void> => {
    let lang: LangDef | null = languageForName(name);
    if (!lang) {
      // A script without an extension may say what it is on its first line.
      const head = name.includes(".") ? null : await readHead(abs);
      lang = head ? languageForShebang(head.toString("latin1").split("\n")[0] ?? "") : null;
      if (!lang) {
        skipped.unknown++;
        return;
      }
    }
    const read = await readRegularFile(abs, MAX_READ_BYTES);
    if (read.kind === "skip") return;
    if (read.kind === "big") {
      skipped.tooBig++;
      return;
    }
    if (looksBinary(read.buf)) {
      skipped.binary++;
      return;
    }
    bytesRead += read.size;
    const c = countText(decodeText(read.buf), lang, o.docAsComment);
    const row = (name: string) => {
      let r = rows.get(name);
      if (!r) rows.set(name, (r = { name, files: 0, code: 0, comments: 0, blanks: 0, lines: 0, bytes: 0 }));
      return r;
    };
    const r = row(lang.name);
    r.files++;
    r.code += c.code;
    r.comments += c.comments;
    r.blanks += c.blanks;
    r.lines += c.code + c.comments + c.blanks;
    r.bytes += read.size;
    let fileCode = c.code;
    let fileComments = c.comments;
    let fileBlanks = c.blanks;
    // Code embedded in the file (JavaScript in HTML, fenced code in Markdown) counts under its own language, with no extra file.
    for (const [childName, cc] of Object.entries(c.children ?? {})) {
      const child = row(childName);
      child.code += cc.code;
      child.comments += cc.comments;
      child.blanks += cc.blanks;
      child.lines += cc.code + cc.comments + cc.blanks;
      fileCode += cc.code;
      fileComments += cc.comments;
      fileBlanks += cc.blanks;
    }
    lines += fileCode + fileComments + fileBlanks;
    files.push({ path: rel, language: lang.name, code: fileCode, comments: fileComments, blanks: fileBlanks, size: read.size });
  };
  const report = await walkFiles(root, { respectIgnore: o.respectGitignore, hidden: o.hidden, vendored: o.vendored, excludes: o.excludes, maxFiles: o.maxFiles, maxDirs: o.maxDirs, maxSeconds: o.maxSeconds }, job, async (batch, rep) => {
    for (let i = 0; i < batch.length; i += CHUNK) {
      if (job.cancelled) return;
      await Promise.all(batch.slice(i, i + CHUNK).map((f) => countOne(f.abs, f.rel, f.name)));
    }
    onProgress?.({ files: rep.files, folders: rep.dirs, lines, languages: rows.size });
    if (bytesRead > MAX_TOTAL_BYTES) return "bytes";
  });
  skipped.symlinks = report.symlinks;
  skipped.ignored = report.ignored;
  skipped.hidden = report.hiddenSkipped;
  skipped.vendored = report.vendoredSkipped;
  const languages = sortRows([...rows.values()]);
  return { result: { languages, totals: sumTotals(languages), skipped, stoppedBy: report.stoppedBy, fileCount: files.length }, files };
}

/** `dev/stats/start`: the job's work. Stores the file table in `job.data` and returns the summary the page shows. */
export async function runStats(ctx: FmContext, job: DevJob, o: StatsOptions): Promise<StatsResult> {
  const started = Date.now();
  const notes: string[] = [];
  const tokei = await detectTokei(ctx);
  if (o.engine === "tokei" && !tokei.installed) throw new FmError("TOKEI_MISSING", `tokei isn't installed. ${TOKEI_INSTALL_HINT}`);
  let useTokei = tokei.installed && o.engine !== "builtin";
  if (o.engine === "auto" && !tokei.installed) notes.push(`tokei isn't installed, so the built-in counter was used. ${TOKEI_INSTALL_HINT}`);
  const baseResult = { root: job.root, options: o };
  if (useTokei) {
    setProgress(job, { phase: "tokei", files: 0, folders: 0, lines: 0 });
    try {
      const limits = resolveLimits(o);
      const text = await runTokei(ctx, tokei.path!, job.root, o, job, Math.min(limits.maxSeconds, HARD_MAX_SECONDS) * 1000);
      const parsed = parseTokeiJson(text);
      const languages = sortRows(parsed.languages);
      job.data = { files: parsed.files };
      if (!o.docAsComment) notes.push("tokei decides itself how to count documentation comments, so \"Treat doc comments as comments\" doesn't change its numbers.");
      return { ...baseResult, engine: "tokei", engineLabel: `tokei ${tokei.version ?? ""}`.trim(), languages, totals: sumTotals(languages), skipped: { binary: 0, tooBig: 0, unknown: 0, symlinks: 0, ignored: 0, hidden: 0, vendored: 0 }, stoppedBy: null, elapsedMs: Date.now() - started, notes, fileCount: parsed.files.length };
    } catch (err) {
      if (job.cancelled) throw err;
      if (o.engine === "tokei") throw err;
      notes.push(`tokei didn't work this time (${(err as Error).message}), so the built-in counter was used.`);
      useTokei = false;
    }
  }
  setProgress(job, { phase: "counting", files: 0, folders: 0, lines: 0 });
  const { result, files } = await countFolder(job.root, o, job, (p) => setProgress(job, { phase: "counting", ...p }));
  job.data = { files };
  return { ...baseResult, engine: "builtin", engineLabel: "Built-in counter", ...result, elapsedMs: Date.now() - started, notes, fileCount: files.length };
}

export interface FilesQuery {
  language?: string;
  sort: "code" | "comments" | "blanks" | "lines" | "size" | "path";
  dir: "asc" | "desc";
  filter: string;
  offset: number;
  limit: number;
}

/** A page of the per-file table (`dev/stats/files`). */
export function queryFiles(files: FileRow[], q: FilesQuery): { rows: FileRow[]; total: number } {
  const needle = q.filter.toLowerCase();
  let rows = files.filter((f) => (!q.language || f.language === q.language) && (!needle || f.path.toLowerCase().includes(needle)));
  const key = (f: FileRow) => (q.sort === "lines" ? f.code + f.comments + f.blanks : q.sort === "path" ? f.path : f[q.sort]);
  const sign = q.dir === "asc" ? 1 : -1;
  rows = rows.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
    return c * sign || a.path.localeCompare(b.path);
  });
  return { rows: rows.slice(q.offset, q.offset + q.limit), total: rows.length };
}
