/** API operations of the "Replace" power tool (search and replace across files), namespaced `sd/...`. */
import { randomUUID } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { writeClipboardSync } from "../../localGuard";
import { SD_MAX_FILE_BYTES, SD_PRESETS, formatReport, joinDiffs, parseExtList } from "../../sd_helpers";
import { absolutePath, assertCreatable, assertFolder, lstatOrNull, type FmContext, type FmHandler } from "./fmCore";
import { FmError, describeFsError, uniqueName, validateName } from "./fmPaths";
import { applyPreview, backupExtension, undoRun, undoSummary } from "./fmSdApply";
import { MAX_PREVIEWS, runSdJob, sdState, type SdPreview } from "./fmSdRun";
import {
  SD_DEFAULT_EXCLUDES, SD_MAX_FILES, SD_MAX_FIND, SD_MAX_REPLACE, SD_MAX_REPLACEMENTS, SD_TIMEOUT_MS, SD_UNDO_RUNS, compileSpec,
  type SdFilter, type SdScanOutcome, type SdSpec,
} from "./fmSdShared";

const MAX_TARGETS = 50;

function parseSpec(b: Record<string, any>): SdSpec {
  if (typeof b.find !== "string") throw new FmError("BAD_REQUEST", "Type what to look for.");
  if (b.replace !== undefined && typeof b.replace !== "string") throw new FmError("BAD_REQUEST", "The replacement has to be text.");
  if (b.flags !== undefined && typeof b.flags !== "string") throw new FmError("BAD_REQUEST", "The flags have to be letters.");
  const spec: SdSpec = {
    find: b.find, replace: b.replace ?? "", literal: b.literal === true, wholeWord: b.wholeWord === true, ignoreCase: b.ignoreCase === true,
    flags: (b.flags ?? "g").trim().slice(0, 12), escapes: b.escapes === true,
  };
  compileSpec(spec);
  return spec;
}

async function parseTargets(ctx: FmContext, b: Record<string, any>): Promise<string[]> {
  if (!Array.isArray(b.targets) || b.targets.length === 0) throw new FmError("BAD_REQUEST", "Choose at least one file or folder to search in.");
  if (b.targets.length > MAX_TARGETS) throw new FmError("BAD_REQUEST", `That's too many places at once (the limit is ${MAX_TARGETS}). Choose a folder that holds them instead.`);
  const targets = [...new Set(b.targets.map((t: unknown) => absolutePath(ctx, t)))];
  for (const t of targets) if (!(await lstatOrNull(t))) throw new FmError("NOT_FOUND", `"${nodePath.basename(t)}" doesn't exist. Check the path, or choose it again.`);
  return targets;
}

const words = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[\s,;]+/) : []).map((s) => s.trim().slice(0, 200)).filter(Boolean).slice(0, 50);

function parseFilter(b: Record<string, any>): SdFilter {
  return {
    exts: parseExtList(words(b.exts).join(",")).slice(0, 50),
    exclude: words(b.exclude),
    defaultExcludes: typeof b.defaultExcludes === "boolean" ? b.defaultExcludes : true,
    hidden: b.hidden === true,
  };
}

function getPreview(ctx: FmContext, id: unknown): SdPreview {
  const p = typeof id === "string" ? sdState(ctx).previews.get(id) : undefined;
  if (!p) throw new FmError("NO_PREVIEW", "That result isn't available any more. Press Preview or Count again.");
  return p;
}

/** The files a request is about: the ticked ones, or every file with matches. */
function chosen(ctx: FmContext, p: SdPreview, paths: unknown, onlyChanged: boolean): string[] {
  const pool = p.files.filter((f) => !onlyChanged || f.changed);
  if (paths === undefined || paths === null) return pool.map((f) => f.path);
  if (!Array.isArray(paths) || paths.length > SD_MAX_FILES) throw new FmError("BAD_REQUEST", "Choose which files you mean.");
  const wanted = new Set(paths.map((x: unknown) => absolutePath(ctx, x)));
  for (const w of wanted) if (!p.files.some((f) => f.path === w)) throw new FmError("BAD_REQUEST", "One of those files isn't part of this result.");
  return pool.filter((f) => wanted.has(f.path)).map((f) => f.path);
}

function view(p: SdPreview) {
  const o = p.outcome;
  return {
    id: p.id,
    mode: p.mode,
    files: p.files.map((f) => ({ path: f.path, matches: f.matches, changed: f.changed, hunks: f.hunks, added: f.added, removed: f.removed, size: f.size, hasDiff: f.diff !== "", applied: p.applied.has(f.path) })),
    stats: {
      filesScanned: o.filesScanned, filesMatched: p.files.length, filesChanged: p.files.filter((f) => f.changed).length, replacements: o.replacements,
      durationMs: p.durationMs, skipped: o.skipped, filesCapped: o.filesCapped, replacementsCapped: o.replacementsCapped,
    },
  };
}

async function scan(ctx: FmContext, b: Record<string, any>, mode: "count" | "preview") {
  const spec = parseSpec(b);
  const targets = await parseTargets(ctx, b);
  const filter = parseFilter(b);
  const started = Date.now();
  const outcome = await runSdJob<SdScanOutcome>(ctx, { kind: "scan", mode, spec, targets, filter });
  const state = sdState(ctx);
  const preview: SdPreview = { id: randomUUID(), mode, spec, at: Date.now(), targets, files: outcome.files, outcome, durationMs: Date.now() - started, applied: new Map() };
  state.previews.set(preview.id, preview);
  while (state.previews.size > MAX_PREVIEWS) state.previews.delete(state.previews.keys().next().value as string);
  return view(preview);
}

/** Writes a brand-new file in `folder`. An existing file is never overwritten: a free name ("x (2).patch") is used. */
async function saveNew(ctx: FmContext, folderInput: unknown, nameInput: unknown, fallbackName: string, text: string): Promise<{ path: string; name: string }> {
  const folder = absolutePath(ctx, folderInput);
  await assertFolder(folder, "That folder");
  assertCreatable(ctx, folder);
  const wanted = typeof nameInput === "string" && nameInput.trim() ? nameInput.trim() : fallbackName;
  const bad = validateName(wanted, ctx.platform);
  if (bad) throw new FmError("BAD_NAME", bad);
  const taken = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const name = uniqueName(wanted, (c) => taken.has(c), "number");
    const path = nodePath.join(folder, name);
    try {
      await fsp.writeFile(path, text, { flag: "wx" });
      return { path, name };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw new FmError(describeFsError(err).code, describeFsError(err, "save a file here").message);
      taken.add(name);
    }
  }
  throw new FmError("NO_FREE_NAME", "Could not find a free name.");
}

const statusWord = (p: SdPreview, f: SdPreview["files"][number]) =>
  p.applied.has(f.path) ? "Replaced" : p.mode === "count" ? "Matches found" : f.changed ? "Preview ready" : "No change";

function diffsOf(ctx: FmContext, b: Record<string, any>, what: string): string[] {
  const p = getPreview(ctx, b.id);
  const paths = new Set(chosen(ctx, p, b.paths, true));
  const parts = p.files.filter((f) => paths.has(f.path) && f.diff).map((f) => f.diff);
  if (!parts.length) throw new FmError("NOTHING_TO_DO", `There's no diff to ${what} yet. Press Preview first, and tick the files you want.`);
  return parts;
}

export const sdOperations: Record<string, FmHandler> = {
  async "sd/info"(ctx) {
    return {
      presets: SD_PRESETS,
      defaultExcludes: SD_DEFAULT_EXCLUDES,
      limits: { files: SD_MAX_FILES, replacements: SD_MAX_REPLACEMENTS, fileBytes: SD_MAX_FILE_BYTES, seconds: Math.round(SD_TIMEOUT_MS / 1000), undoRuns: SD_UNDO_RUNS, find: SD_MAX_FIND, replace: SD_MAX_REPLACE },
      undo: undoSummary(ctx),
    };
  },
  async "sd/count"(ctx, b) {
    return await scan(ctx, b, "count");
  },
  async "sd/preview"(ctx, b) {
    return await scan(ctx, b, "preview");
  },
  async "sd/diff"(ctx, b) {
    const p = getPreview(ctx, b.id);
    const path = absolutePath(ctx, b.path);
    const f = p.files.find((x) => x.path === path);
    if (!f) throw new FmError("NOT_FOUND", "That file isn't part of this result.");
    return { path, diff: f.diff, truncated: f.diffTruncated, changed: f.changed, matches: f.matches };
  },
  async "sd/copydiff"(ctx, b) {
    const parts = diffsOf(ctx, b, "copy");
    return { copied: writeClipboardSync(joinDiffs(parts)), files: parts.length };
  },
  async "sd/savediff"(ctx, b) {
    const parts = diffsOf(ctx, b, "save");
    return { ...(await saveNew(ctx, b.folder, b.name, "replace_changes.patch", joinDiffs(parts))), files: parts.length };
  },
  async "sd/savereport"(ctx, b) {
    const p = getPreview(ctx, b.id);
    const skipped = p.outcome.skipped;
    const text = formatReport({
      find: p.spec.find, replace: p.spec.replace, mode: p.mode,
      rows: p.files.map((f) => ({ filePath: f.path, matches: f.matches, hunks: f.hunks, status: statusWord(p, f) })),
      skipped: skipped.binary + skipped.large + skipped.notText,
    });
    return { ...(await saveNew(ctx, b.folder, b.name, "replace_report.md", text)), files: p.files.length };
  },
  async "sd/apply"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Replacing text in files changes them on disk and needs your confirmation.");
    const p = getPreview(ctx, b.id);
    if (p.mode !== "preview") throw new FmError("NEEDS_PREVIEW", "Press Preview first, so you can see what will change before it does.");
    const files = chosen(ctx, p, b.paths, true);
    if (!files.length) throw new FmError("NOTHING_TO_DO", "No files are ticked, or none of them would change.");
    const { rows, run } = await applyPreview(ctx, p, { files, backup: b.backup === true, backupExt: backupExtension(b.backupExt) });
    return {
      rows,
      replaced: rows.filter((r) => r.status === "replaced").length,
      replacements: rows.reduce((n, r) => n + (r.status === "replaced" ? r.replacements : 0), 0),
      skipped: rows.filter((r) => r.status !== "replaced").length,
      backups: rows.filter((r) => r.backup).length,
      runId: run?.id ?? null,
      undo: undoSummary(ctx),
    };
  },
  async "sd/undo"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Undoing a replace changes files on disk and needs your confirmation.");
    if (b.runId !== undefined && typeof b.runId !== "string") throw new FmError("BAD_REQUEST", "Choose which replace to undo.");
    const { rows } = await undoRun(ctx, b.runId);
    return { rows, restored: rows.filter((r) => r.status === "restored").length, left: rows.filter((r) => r.status !== "restored").length, undo: undoSummary(ctx) };
  },
};
