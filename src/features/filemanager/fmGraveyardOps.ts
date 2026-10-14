/**
 * The graveyard's API operations (merged into the File Manager server in fmServer.ts):
 *   grave/status  grave/list  grave/check  grave/bury  grave/restore  grave/decompose  grave/verify  grave/repair  grave/preview
 * Every path goes through `absolutePath`; item ids are checked against the records and never joined into a path
 * unchecked. Slow work (copying between disks, emptying a lot) runs as a job in the tray, with Cancel.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { formatHumanSize, type GraveyardItem } from "../../../applications/rip_engine";
import { absolutePath, assertFolder, lstatOrNull, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { assertBuryable, buryOne, buryPaths, decomposeEverything, decomposeItems, moveEnv, payloadStatus, restoreItems, restoreTarget, type ConflictChoice, type DecomposeSummary, type Outcome, type RestoreOptions, type RestoreValue } from "./fmGraveyard";
import { previewBuried, repairGraveyard, verifyGraveyard, quarantineDamaged } from "./fmGraveyardCheck";
import { graveyardHooksOf } from "./fmGraveyardHooks";
import { assertWritable, createRecorder, entriesDirOf, filterItems, graveStats, graveyardDirOf, parseQuery, payloadOf, pickByIds, readGrave, rowOf, runQuery } from "./fmGraveyardStore";
import type { JobView } from "./fmJobs";
import { FmError, describeFsError } from "./fmPaths";

const MAX_PATHS = 5000;
const MAX_CHECK = 5000;
/** More items than this are emptied as a job, as is anything large. */
const INLINE_ITEMS = 25;
const HUGE_FILES = 5000;
const HUGE_BYTES = 64 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------------------------------------------

interface Group<T> {
  label: string;
  items: T[];
}

/** One step per item up to 100 items, then steps of several items, so the tray never has thousands of rows. */
function groupsOf<T>(items: T[], labelOf: (item: T) => string): Array<Group<T>> {
  if (items.length <= 100) return items.map((item) => ({ label: labelOf(item), items: [item] }));
  const size = Math.ceil(items.length / 100);
  const groups: Array<Group<T>> = [];
  for (let i = 0; i < items.length; i += size) groups.push({ label: `Items ${i + 1}–${Math.min(items.length, i + size)} of ${items.length}`, items: items.slice(i, i + size) });
  return groups;
}

function startGraveJob<T>(ctx: FmContext, title: string, items: T[], labelOf: (item: T) => string, run: (group: T[], signal: AbortSignal, log: (text: string) => void) => Promise<string | void>): JobView {
  const groups = groupsOf(items, labelOf);
  return ctx.jobs.start({
    kind: "graveyard",
    title,
    steps: groups.map((g) => ({ label: g.label, prepare: async () => ({ work: (signal: AbortSignal, log: (text: string) => void) => run(g.items, signal, log) }) })),
  });
}

const progressText = (done: { files: number; bytes: number }) => `Copied ${done.files.toLocaleString("en-US")} items (${formatHumanSize(done.bytes)})`;

// ---------------------------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------------------------

function pathsOf(ctx: FmContext, input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  if (input.length > MAX_PATHS) throw new FmError("BAD_REQUEST", `Bury up to ${MAX_PATHS} items at a time.`);
  return [...new Set(input.map((i) => absolutePath(ctx, i)))];
}

function conflictOf(input: unknown): ConflictChoice {
  if (input === undefined || input === null || input === "ask") return "ask";
  if (input === "replace" || input === "rename" || input === "skip") return input;
  throw new FmError("BAD_REQUEST", "Choose Replace, Keep both or Skip.");
}

async function restoreOptionsOf(ctx: FmContext, b: Record<string, any>): Promise<RestoreOptions> {
  const to = b.to === undefined || b.to === null || b.to === "" ? undefined : absolutePath(ctx, b.to);
  if (to) await assertFolder(to, "That destination");
  return { to, conflict: conflictOf(b.conflict), makeFolders: b.makeFolders === true };
}

const failure = (code: string, message: string) => ({ ok: false as const, code, message });

// ---------------------------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------------------------

export const graveyardOperations: Record<string, FmHandler> = {
  async "grave/status"(ctx) {
    return { status: await graveStats(ctx) };
  },

  async "grave/list"(ctx, b) {
    const query = parseQuery(b);
    const dir = graveyardDirOf(ctx);
    const state = await readGrave(dir);
    if (b.idsOnly === true) {
      const matching = filterItems(state, query);
      return { ids: matching.map((x) => x.item.id), total: matching.length };
    }
    const result = runQuery(state, query);
    const items = await Promise.all(
      result.items.map(async (item) => ({ ...rowOf(item), missing: (await payloadStatus(dir, item)) !== "ok" })),
    );
    return { items, total: result.total, page: result.page, pages: result.pages, pageSize: query.pageSize, truncated: state.truncated, damaged: state.damaged };
  },

  async "grave/check"(ctx, b) {
    const dir = graveyardDirOf(ctx);
    const options = await restoreOptionsOf(ctx, b);
    const { items, unknown } = pickByIds(await readGrave(dir), b.ids);
    if (items.length > MAX_CHECK) throw new FmError("BAD_REQUEST", "That is too many items to check at once.");
    const p = pathApi(ctx);
    const checked = [];
    for (const item of items) {
      const entry: Record<string, unknown> = { id: item.id, name: item.name, missingFiles: (await payloadStatus(dir, item)) !== "ok", unknownOrigin: !item.originalPath || !nodePath.isAbsolute(item.originalPath) };
      try {
        const { parent, target } = await restoreTarget(ctx, item, options.to);
        const there = await lstatOrNull(target);
        Object.assign(entry, { target, folder: parent, folderMissing: !(await lstatOrNull(parent)), conflict: !!there, conflictIsDir: !!there?.isDirectory(), targetName: p.basename(target) });
      } catch (err) {
        if (err instanceof FmError && err.code === "NO_ORIGIN") Object.assign(entry, { target: null, folder: null, folderMissing: false, conflict: false });
        else throw err;
      }
      checked.push(entry);
    }
    return { items: checked, unknown };
  },

  async "grave/bury"(ctx, b) {
    const paths = pathsOf(ctx, b.paths);
    const dir = graveyardDirOf(ctx);
    await assertWritable(dir);
    const hooks = graveyardHooksOf(ctx);
    const quick: string[] = [];
    const slow: string[] = [];
    for (const path of paths) {
      let sameDisk = true;
      try {
        assertBuryable(ctx, path);
        sameDisk = await hooks.sameDevice(path, entriesDirOf(dir));
      } catch {
        // refused or missing: it is reported with the rest below
      }
      (sameDisk && b.background !== true ? quick : slow).push(path);
    }
    const results = quick.length ? await buryPaths(ctx, quick, moveEnv(ctx)) : [];
    if (!slow.length) return { results };
    const job = startGraveJob(ctx, slow.length === 1 ? "Moving 1 item to the graveyard" : `Moving ${slow.length} items to the graveyard`, slow, (p) => `Burying ${pathApi(ctx).basename(p)}`, async (group, signal, log) => {
      const recorder = createRecorder(dir, 1);
      const notes: string[] = [];
      const problems: string[] = [];
      for (const path of group) {
        if (signal.aborted) break;
        try {
          const done = await buryOne(ctx, path, moveEnv(ctx, signal, (p) => log(progressText(p))), recorder);
          if (done.warning) notes.push(done.warning);
        } catch (err) {
          if (!signal.aborted) problems.push(describeFsError(err, "bury that").message);
        }
      }
      await recorder.flush();
      if (problems.length) throw new Error(problems.length === 1 ? problems[0] : `${problems.length} items didn't work. ${problems[0]}`);
      return notes[0];
    });
    return { results, job, queued: slow.length };
  },

  async "grave/restore"(ctx, b) {
    const dir = graveyardDirOf(ctx);
    const options = await restoreOptionsOf(ctx, b);
    const { items, unknown } = pickByIds(await readGrave(dir), b.ids);
    const hooks = graveyardHooksOf(ctx);
    const quick: GraveyardItem[] = [];
    const slow: GraveyardItem[] = [];
    for (const item of items) {
      let sameDisk = true;
      try {
        const { parent } = await restoreTarget(ctx, item, options.to);
        sameDisk = await hooks.sameDevice(payloadOf(dir, item), parent);
      } catch {
        // reported by the restore itself
      }
      (sameDisk && b.background !== true ? quick : slow).push(item);
    }
    const results: Array<Outcome<RestoreValue> | ReturnType<typeof failure>> = unknown.map(() => failure("NOT_FOUND", "That item is no longer in the graveyard."));
    if (quick.length) results.push(...(await restoreItems(ctx, quick, options, moveEnv(ctx))));
    if (!slow.length) return { results };
    const job = startGraveJob(ctx, slow.length === 1 ? `Restoring ${slow[0]!.name}` : `Restoring ${slow.length} items`, slow, (i) => `Restoring ${i.name}`, async (group, signal, log) => {
      const out = await restoreItems(ctx, group, options, moveEnv(ctx, signal, (p) => log(progressText(p))));
      const bad = out.filter((o) => !o.ok);
      if (bad.length && !signal.aborted) throw new Error(bad.length === 1 ? (bad[0] as { message: string }).message : `${bad.length} items didn't work. ${(bad[0] as { message: string }).message}`);
      const warning = out.find((o) => o.ok && o.value.warning);
      return warning && warning.ok ? warning.value.warning : undefined;
    });
    return { results, job, queued: slow.length };
  },

  async "grave/decompose"(ctx, b) {
    const dir = graveyardDirOf(ctx);
    const modes = [Array.isArray(b.ids), b.all === true, b.olderThanDays !== undefined].filter(Boolean).length;
    if (modes !== 1) throw new FmError("BAD_REQUEST", "Choose what to delete: some items, everything, or items older than a number of days.");
    const state = await readGrave(dir);
    const dryRun = b.dryRun === true;
    let items: GraveyardItem[];
    let unknown: string[] = [];
    if (b.all === true) items = state.buried.map((x) => x.item);
    else if (b.olderThanDays !== undefined) {
      const days = Number(b.olderThanDays);
      if (!Number.isInteger(days) || days < 1 || days > 36500) throw new FmError("BAD_REQUEST", "Enter a whole number of days, from 1 to 36500.");
      const cutoff = Date.now() - days * 86_400_000;
      items = state.buried.map((x) => x.item).filter((i) => i.buriedAtMs <= cutoff);
    } else ({ items, unknown } = pickByIds(state, b.ids));
    const bytes = items.reduce((sum, i) => sum + (Number.isFinite(i.sizeBytes) ? i.sizeBytes : 0), 0);
    if (dryRun) return { count: items.length, bytes, human: formatHumanSize(bytes), unknown: unknown.length };
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Emptying the graveyard is permanent and needs to be confirmed.");
    if (b.all === true && !(typeof b.typed === "string" && b.typed.trim().toLowerCase() === "empty")) throw new FmError("NEEDS_CONFIRM", "To empty the whole graveyard, type the word empty to confirm.");
    if (b.expectCount !== undefined && Number(b.expectCount) !== items.length) throw new FmError("CHANGED", "The graveyard changed since you looked at it, so nothing was deleted. Look at the list again.");
    await assertWritable(dir).catch(async (err) => {
      if (b.all === true && err instanceof FmError && err.code === "DAMAGED") await quarantineDamaged(dir);
      else throw err;
    });
    const entryCount = b.all === true ? (await fsp.readdir(entriesDirOf(dir)).catch(() => [] as string[])).length : 0;
    const heavy = b.background === true || items.length > INLINE_ITEMS || entryCount > INLINE_ITEMS || items.some((i) => (i.fileCount ?? 0) > HUGE_FILES || (i.sizeBytes ?? 0) > HUGE_BYTES);
    const fresh = b.all === true ? await readGrave(dir) : state;
    if (!heavy) {
      const summary = b.all === true ? await decomposeEverything(ctx, fresh, {}) : await decomposeItems(ctx, items, {});
      return { ...summaryOf(summary), unknown: unknown.length };
    }
    const job =
      b.all === true
        ? startGraveJob(ctx, "Emptying the graveyard", [fresh], () => "Emptying the graveyard", async (_g, signal, log) => finish(await decomposeEverything(ctx, fresh, { signal, progress: (d, t) => log(`Deleted ${d} of ${t}`) })))
        : startGraveJob(ctx, `Deleting ${items.length} items for good`, items, (i) => `Deleting ${i.name}`, async (group, signal, log) => finish(await decomposeItems(ctx, group, { signal, progress: (d, t) => log(`Deleted ${d} of ${t}`) })));
    return { job, count: items.length, bytes, human: formatHumanSize(bytes), unknown: unknown.length };
  },

  async "grave/verify"(ctx, b) {
    return { report: await verifyGraveyard(ctx, { deep: b.deep === true }) };
  },

  async "grave/repair"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Repairing changes the list of buried items and needs to be confirmed.");
    const flag = (v: unknown) => v !== false;
    return { report: await repairGraveyard(ctx, { missing: flag(b.missing), orphans: flag(b.orphans), staging: flag(b.staging), damaged: flag(b.damaged) }) };
  },

  async "grave/preview"(ctx, b) {
    return { preview: await previewBuried(ctx, b.id) };
  },
};

function summaryOf(s: DecomposeSummary) {
  return { deleted: s.deleted, freedBytes: s.freedBytes, freed: formatHumanSize(s.freedBytes), failed: s.failed, stoppedEarly: s.stoppedEarly };
}

/** Turns a deletion summary into the end of a job step: failures make the step fail with a plain sentence. */
function finish(s: DecomposeSummary): string | undefined {
  if (s.failed.length) throw new Error(s.failed.length === 1 ? `"${s.failed[0]!.name}" couldn't be deleted: ${s.failed[0]!.message}` : `${s.failed.length} items couldn't be deleted. ${s.failed[0]!.message}`);
  return undefined;
}
