/**
 * API operations of the "Dev" power tool, namespaced `dev/...`: code statistics ("tokei studio"), a project overview,
 * a Git summary, a disk report, a TODO scanner and the developer tools found on this computer. Everything is read
 * only on the user's files; the one thing written is an export the person asks for, as a new file (never replacing
 * one). Long scans are jobs the page polls (`dev/job/poll`) and can cancel (`dev/job/cancel`).
 */
import { absolutePath, assertFolder, type FmContext, type FmHandler } from "./fmCore";
import { runDisk, runDupes, HEAVY_FOLDERS } from "./fmDevDisk";
import { detectEnvironment } from "./fmDevEnv";
import { checkProjectVersions, checkRange, compareVersions, sortVersions } from "./fmDevSemver";
import { EXPORT_FORMATS, parseFormat, render, saveText, type Table } from "./fmDevExport";
import { gitSummary } from "./fmDevGit";
import { cancelDevJob, findDevJob, pollDevJob, startDevJob, type DevJob } from "./fmDevJobs";
import { LANGUAGES } from "./fmDevLangs";
import { projectInfo } from "./fmDevProject";
import { parseStatsOptions, queryFiles, runStats, type FilesQuery } from "./fmDevScan";
import { MAX_SNAPSHOTS, deleteSnapshot, diffLanguages, loadSnapshots, saveSnapshot } from "./fmDevStore";
import { DEFAULT_TAGS, parseTags, runTodo } from "./fmDevTodo";
import { TOKEI_INSTALL_HINT, detectTokei } from "./fmDevTokei";
import type { FileRow, StatsResult } from "./fmDevTypes";
import { HARD_MAX_DIRS, HARD_MAX_FILES, HARD_MAX_SECONDS, VENDORED_DIRS, type WalkLimits } from "./fmDevWalk";
import { FmError, isSameOrInside } from "./fmPaths";
import { MAX_READ_BYTES } from "./fmDevRead";
import type { DiskReport, DupeReport } from "./fmDevDisk";
import type { TodoReport } from "./fmDevTodo";

async function folderOf(ctx: FmContext, input: unknown): Promise<string> {
  const root = absolutePath(ctx, input);
  await assertFolder(root, "That folder");
  return root;
}

const limitsOf = (b: Record<string, any>): Partial<WalkLimits> => ({ maxFiles: b.maxFiles, maxDirs: b.maxDirs, maxSeconds: b.maxSeconds });

function statsOf(ctx: FmContext, id: unknown): { job: DevJob; result: StatsResult; files: FileRow[] } {
  const job = findDevJob(ctx, id, ["stats"]);
  if (job.state === "running") throw new FmError("NOT_READY", "That scan is still running.");
  const result = job.result as StatsResult | null;
  if (!result) throw new FmError("NO_RESULT", "That scan has no numbers (it was cancelled or failed). Run it again.");
  return { job, result, files: (job.data?.files as FileRow[] | undefined) ?? [] };
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

function languagesTable(r: StatsResult): Table {
  const rows = r.languages.map((l) => [l.name, l.files, l.code, l.comments, l.blanks, l.lines, pct(l.code, r.totals.code)]);
  rows.push(["Total", r.totals.files, r.totals.code, r.totals.comments, r.totals.blanks, r.totals.lines, 100]);
  return { title: "Code statistics", columns: ["Language", "Files", "Code", "Comments", "Blanks", "Lines", "Code %"], rows, meta: { folder: r.root, engine: r.engineLabel, scannedInMs: r.elapsedMs } };
}

function filesTable(files: FileRow[], q: FilesQuery, r: StatsResult): Table {
  const { rows } = queryFiles(files, { ...q, offset: 0, limit: 100_000 });
  return { title: q.language ? `Files: ${q.language}` : "Files", columns: ["Path", "Language", "Code", "Comments", "Blanks", "Size (bytes)"], rows: rows.map((f) => [f.path, f.language, f.code, f.comments, f.blanks, f.size]), meta: { folder: r.root, engine: r.engineLabel } };
}

const sortKeys = ["code", "comments", "blanks", "lines", "size", "path"] as const;
function filesQuery(b: Record<string, any>): FilesQuery {
  const num = (v: unknown, d: number, min: number, max: number) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.floor(Number(v)))) : d);
  return {
    language: typeof b.language === "string" && b.language ? b.language.slice(0, 80) : undefined,
    sort: (sortKeys as readonly string[]).includes(b.sort) ? b.sort : "code",
    dir: b.dir === "asc" ? "asc" : "desc",
    filter: typeof b.filter === "string" ? b.filter.slice(0, 200) : "",
    offset: num(b.offset, 0, 0, 1_000_000),
    limit: num(b.limit, 100, 1, 500),
  };
}

function exportTable(ctx: FmContext, b: Record<string, any>, snapshots: Awaited<ReturnType<typeof loadSnapshots>>): Table {
  const scope = typeof b.scope === "string" ? b.scope : "languages";
  const job = findDevJob(ctx, b.id);
  if (job.state === "running" || !job.result) throw new FmError("NOT_READY", "There is nothing to export yet. Run the scan first.");
  if (scope === "languages" || scope === "files" || scope === "diff") {
    const { result, files } = statsOf(ctx, b.id);
    if (scope === "languages") return languagesTable(result);
    if (scope === "files") return filesTable(files, filesQuery(b), result);
    const snap = snapshots.find((s) => s.id === b.snapshotId);
    if (!snap) throw new FmError("NO_SNAPSHOT", "That snapshot doesn't exist any more.");
    const d = diffLanguages(snap.languages, result.languages);
    return { title: `Changes since "${snap.name}"`, columns: ["Language", "Status", "Files", "Files change", "Code", "Code change", "Comments change", "Blanks change"], rows: d.rows.map((r) => [r.name, r.status, r.files, r.filesDelta, r.code, r.codeDelta, r.commentsDelta, r.blanksDelta]), meta: { folder: result.root, snapshot: snap.name, snapshotDate: snap.createdAt } };
  }
  if (scope === "todo" && job.kind === "todo") {
    const r = job.result as TodoReport;
    return { title: "TODO and FIXME markers", columns: ["Tag", "Path", "Line", "Text"], rows: r.items.map((i) => [i.tag, i.path, i.line, i.text]), meta: { folder: r.root, counts: r.counts } };
  }
  if (scope === "disk" && job.kind === "disk") {
    const r = job.result as DiskReport;
    return { title: "Disk usage by top-level entry", columns: ["Entry", "Files", "Bytes"], rows: r.top.map((t) => [t.name, t.files, t.bytes]), meta: { folder: r.root, totalBytes: r.totalBytes } };
  }
  if (scope === "dupes" && job.kind === "dupes") {
    const r = job.result as DupeReport;
    return { title: "Duplicate files", columns: ["Group", "Size (bytes)", "Path"], rows: r.groups.flatMap((g, i) => g.files.map((f) => [i + 1, g.size, f])), meta: { folder: r.root, wastedBytes: r.totalWasted } };
  }
  throw new FmError("BAD_SCOPE", "That can't be exported from this scan.");
}

const safeName = (s: string) => s.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "export";

export const devOperations: Record<string, FmHandler> = {
  async "dev/meta"(ctx) {
    const tokei = await detectTokei(ctx);
    return {
      tokei,
      installHint: TOKEI_INSTALL_HINT,
      languageCount: LANGUAGES.length,
      languages: LANGUAGES.map((l) => l.name).sort(),
      heavyFolders: HEAVY_FOLDERS,
      vendoredDirs: VENDORED_DIRS,
      defaultTags: DEFAULT_TAGS,
      exportFormats: [...EXPORT_FORMATS],
      limits: { maxFiles: HARD_MAX_FILES, maxDirs: HARD_MAX_DIRS, maxSeconds: HARD_MAX_SECONDS, maxFileBytes: MAX_READ_BYTES, maxSnapshots: MAX_SNAPSHOTS },
      platform: ctx.platform,
    };
  },

  async "dev/stats/start"(ctx, b) {
    const root = await folderOf(ctx, b.root);
    const options = parseStatsOptions(b);
    const job = startDevJob(ctx, "stats", root, (j) => runStats(ctx, j, options));
    return { id: job.id, seq: job.seq };
  },

  async "dev/disk/start"(ctx, b) {
    const root = await folderOf(ctx, b.root);
    const job = startDevJob(ctx, "disk", root, (j) => runDisk(j, limitsOf(b)));
    return { id: job.id, seq: job.seq };
  },

  async "dev/dupes/start"(ctx, b) {
    const root = await folderOf(ctx, b.root);
    const minBytes = Number.isFinite(Number(b.minBytes)) ? Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(b.minBytes)))) : 1024;
    const job = startDevJob(ctx, "dupes", root, (j) => runDupes(j, { minBytes, vendored: b.vendored === true, limits: limitsOf(b) }));
    return { id: job.id, seq: job.seq };
  },

  async "dev/todo/start"(ctx, b) {
    const root = await folderOf(ctx, b.root);
    const tags = parseTags(b.tags);
    const excludes = Array.isArray(b.excludes) ? b.excludes.filter((e: unknown): e is string => typeof e === "string").slice(0, 50) : [];
    const job = startDevJob(ctx, "todo", root, (j) => runTodo(j, { tags, respectGitignore: b.respectGitignore !== false, hidden: b.hidden === true, vendored: b.vendored === true, excludes, limits: limitsOf(b) }));
    return { id: job.id, seq: job.seq };
  },

  async "dev/job/poll"(ctx, b) {
    return pollDevJob(ctx, b);
  },

  async "dev/job/cancel"(ctx, b) {
    return cancelDevJob(ctx, b);
  },

  async "dev/stats/files"(ctx, b) {
    const { files } = statsOf(ctx, b.id);
    return queryFiles(files, filesQuery(b));
  },

  async "dev/export"(ctx, b) {
    const format = parseFormat(b.format);
    const table = exportTable(ctx, b, await loadSnapshots(ctx));
    return { format, title: table.title, rows: table.rows.length, text: render(table, format) };
  },

  async "dev/export/save"(ctx, b) {
    const format = parseFormat(b.format);
    const table = exportTable(ctx, b, await loadSnapshots(ctx));
    // The file goes into the scanned folder (or one inside it), never somewhere unrelated.
    const folder = absolutePath(ctx, b.folder);
    if (!isSameOrInside(folder, findDevJob(ctx, b.id).root, ctx.platform)) throw new FmError("BAD_PATH", "An export can only be saved inside the folder that was scanned.");
    const stamp = new Date().toISOString().slice(0, 10);
    const saved = await saveText(ctx, { folder, name: `${safeName(table.title)}-${stamp}`, format, text: render(table, format) });
    return { ...saved, rows: table.rows.length };
  },

  async "dev/snapshot/save"(ctx, b) {
    const { result } = statsOf(ctx, b.id);
    const snapshot = await saveSnapshot(ctx, { name: b.name, root: result.root, engine: result.engineLabel, languages: result.languages });
    return { snapshot };
  },

  async "dev/snapshot/list"(ctx, b) {
    const root = typeof b.root === "string" && b.root ? absolutePath(ctx, b.root) : null;
    const all = await loadSnapshots(ctx);
    const snapshots = all.map((s) => ({ id: s.id, name: s.name, root: s.root, createdAt: s.createdAt, engine: s.engine, totals: s.totals, sameFolder: root !== null && s.root === root }));
    return { snapshots, max: MAX_SNAPSHOTS };
  },

  async "dev/snapshot/diff"(ctx, b) {
    const { result } = statsOf(ctx, b.id);
    const snap = (await loadSnapshots(ctx)).find((s) => s.id === b.snapshotId);
    if (!snap) throw new FmError("NO_SNAPSHOT", "That snapshot doesn't exist any more.");
    return { snapshot: { id: snap.id, name: snap.name, root: snap.root, createdAt: snap.createdAt, engine: snap.engine }, ...diffLanguages(snap.languages, result.languages) };
  },

  async "dev/snapshot/delete"(ctx, b) {
    return { deleted: await deleteSnapshot(ctx, b.snapshotId) };
  },

  async "dev/project"(ctx, b) {
    return await projectInfo(await folderOf(ctx, b.root));
  },

  async "dev/git"(ctx, b) {
    return { git: await gitSummary(await folderOf(ctx, b.root)) };
  },

  async "dev/env"(ctx, b) {
    return await detectEnvironment(ctx, b.refresh === true);
  },

  /** Version tools (Bun.semver): `action` is "compare", "range", "sort" or "project". */
  async "dev/semver"(ctx, b) {
    switch (b.action) {
      case "compare": return { ...compareVersions(b.a, b.b) };
      case "range": return { ...checkRange(b.version, b.range) };
      case "sort": return { ...sortVersions(b.text, b.descending === true) };
      case "project": return { ...(await checkProjectVersions(ctx, await folderOf(ctx, b.root))) };
      default: throw new FmError("BAD_REQUEST", "Choose what to do: compare, check a range, sort, or check a project.");
    }
  },
};
