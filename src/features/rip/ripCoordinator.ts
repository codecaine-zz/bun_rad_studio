/**
 * High-level coordinator operations for `rip`, orchestrating burying, restoring
 * (unburying), inspecting, listing (seance), pruning, and purging (decomposing)
 * files in the graveyard.
 */
import { join, resolve } from "node:path";
import type { GraveyardManifest, GraveyardRecord, RipOptions } from "./ripTypes.ts";
import {
  ensureDirectoryExists,
  formatGraveyardRecord,
  formatRecordDetail,
  generateRecordId,
  inspectPath,
  movePath,
  permanentDelete,
  readManifest,
  resolveGraveyardDir,
  writeManifest,
} from "./ripDoers.ts";
import { colors } from "../../shared/colors.ts";

/**
 * Moves a target file or directory into `graveyardDir` and appends its metadata record to the manifest.
 */
export async function buryTarget(
  target: string,
  graveyardDir: string
): Promise<GraveyardRecord> {
  const fullPath = resolve(target);
  const info = await inspectPath(fullPath);
  const recordId = generateRecordId(fullPath);
  const graveyardPath = join(graveyardDir, recordId);

  await movePath(fullPath, graveyardPath);

  const record: GraveyardRecord = {
    id: recordId,
    originalPath: fullPath,
    graveyardPath,
    deletedAt: new Date().toISOString(),
    isDirectory: info.isDirectory,
    size: info.size,
  };

  const manifest = await readManifest(graveyardDir);
  manifest.records.push(record);
  await writeManifest(graveyardDir, manifest);

  return record;
}

/**
 * Restores a buried item from the graveyard back to its original path.
 * Restores the most recently buried item by default, or matches by 1-based index, record ID, or original path substring.
 */
export async function unburyTarget(
  graveyardDir: string,
  targetQuery?: string
): Promise<GraveyardRecord> {
  const manifest = await readManifest(graveyardDir);
  if (manifest.records.length === 0) {
    throw new Error("[RipUnbury] Graveyard is empty, nothing to restore.");
  }

  let index = manifest.records.length - 1;
  if (targetQuery) {
    const num = parseInt(targetQuery, 10);
    if (!isNaN(num) && num >= 1 && num <= manifest.records.length) {
      index = num - 1;
    } else {
      const foundIndex = manifest.records.findLastIndex(
        (r) => r.id === targetQuery || r.originalPath.includes(targetQuery)
      );
      if (foundIndex === -1) {
        throw new Error(`[RipUnbury] No buried item matched: ${targetQuery}`);
      }
      index = foundIndex;
    }
  }

  const [record] = manifest.records.splice(index, 1);
  if (!record) {
    throw new Error("[RipUnbury] Failed to pop record from manifest.");
  }

  await movePath(record.graveyardPath, record.originalPath);
  await writeManifest(graveyardDir, manifest);

  return record;
}

/**
 * Finds and returns a buried `GraveyardRecord` matching a 1-based index, record ID, or original path substring.
 */
export async function getRecordInfo(
  graveyardDir: string,
  query: string
): Promise<GraveyardRecord> {
  const manifest = await readManifest(graveyardDir);
  const num = parseInt(query, 10);
  let record: GraveyardRecord | undefined;
  if (!isNaN(num) && num >= 1 && num <= manifest.records.length) {
    record = manifest.records[num - 1];
  } else {
    record = manifest.records.find(
      (r) => r.id === query || r.originalPath.includes(query)
    );
  }
  if (!record) {
    throw new Error(`[RipInfo] No buried item found matching: ${query}`);
  }
  return record;
}

/**
 * Permanently deletes buried items older than `days` days and updates the graveyard manifest.
 * Returns the number of purged items.
 */
export async function pruneGraveyard(
  graveyardDir: string,
  days: number
): Promise<number> {
  const manifest = await readManifest(graveyardDir);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const remaining: GraveyardRecord[] = [];
  let purgedCount = 0;

  for (const record of manifest.records) {
    if (new Date(record.deletedAt).getTime() <= cutoff) {
      await permanentDelete(record.graveyardPath);
      purgedCount++;
    } else {
      remaining.push(record);
    }
  }

  manifest.records = remaining;
  await writeManifest(graveyardDir, manifest);
  return purgedCount;
}

/**
 * Lists all currently buried items in the graveyard formatted with 1-based index numbers.
 */
export async function seanceGraveyard(graveyardDir: string): Promise<string[]> {
  const manifest = await readManifest(graveyardDir);
  if (manifest.records.length === 0) {
    return ["Graveyard is empty."];
  }
  return manifest.records.map((r, i) => `${colors.dim(`[${i + 1}]`)} ${formatGraveyardRecord(r)}`);
}

/**
 * Permanently deletes all buried items in the graveyard and resets the manifest.
 * Returns the count of deleted items.
 */
export async function decomposeGraveyard(graveyardDir: string): Promise<number> {
  const manifest = await readManifest(graveyardDir);
  const count = manifest.records.length;
  for (const record of manifest.records) {
    await permanentDelete(record.graveyardPath);
  }
  await writeManifest(graveyardDir, { version: 1, records: [] });
  return count;
}

/**
 * Executes the primary `rip` workflow according to `options` and returns output lines for display.
 */
export async function runRipCoordinator(options: RipOptions): Promise<string[]> {
  const graveyardDir = resolveGraveyardDir(options.graveyardDir);
  await ensureDirectoryExists(graveyardDir);

  if (options.showSize) {
    const manifest = await readManifest(graveyardDir);
    const { formatGraveyardSummary } = await import("./ripDoers.ts");
    return [formatGraveyardSummary(manifest)];
  }

  if (options.decompose) {
    const cleared = await decomposeGraveyard(graveyardDir);
    return [`Graveyard decomposed: permanently deleted ${cleared} item(s).`];
  }

  if (options.pruneDays !== undefined) {
    const pruned = await pruneGraveyard(graveyardDir, options.pruneDays);
    return [`Pruned ${pruned} item(s) older than ${options.pruneDays} day(s).`];
  }

  if (options.infoTarget) {
    const record = await getRecordInfo(graveyardDir, options.infoTarget);
    return [formatRecordDetail(record)];
  }

  if (options.seance) {
    return await seanceGraveyard(graveyardDir);
  }

  if (options.unbury) {
    const restored = await unburyTarget(graveyardDir, options.unburyTarget);
    return [`Restored ${restored.originalPath}`];
  }

  if (options.dryRun) {
    return options.targets.map((t) => `[Dry-Run] Would bury: ${resolve(t)}`);
  }

  if (options.permanent) {
    for (const target of options.targets) {
      await permanentDelete(resolve(target));
    }
    return options.targets.map((t) => `Permanently deleted ${resolve(t)}`);
  }

  const results: string[] = [];
  for (const target of options.targets) {
    const record = await buryTarget(target, graveyardDir);
    results.push(`Buried ${record.originalPath} (id: ${record.id})`);
  }
  return results;
}
