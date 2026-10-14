/**
 * "Archive all": the matches as a new .zip (made by the File Manager's own zip writer) or .tar.gz. Archives are
 * never written over an existing file: a taken name gets " (2)".
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import { absolutePath, assertCreatable, assertFolder, copyTree, lstatOrNull, moveTree, pathApi, type FmContext } from "./fmCore";
import { folderStats } from "./fmList";
import { FmError, uniqueName, validateName } from "./fmPaths";
import { createZip } from "./fmZip";
import { TAR_MAX_BYTES, ZIP_STAGE_MAX_BYTES, type TarOutcome } from "./fmFindShared";
import { runWorkerJob } from "./fmFindRun";
import { commonFolder, dropNested } from "./fmFindQuery";

export type ArchiveFormat = "zip" | "tar.gz";

export interface ArchiveResult {
  archivePath: string;
  format: ArchiveFormat;
  files: number;
  folders: number;
  /** Size of the items before packing. */
  bytes: number;
  /** Size of the archive file. */
  size: number;
  skipped: number;
}

function defaultBaseName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `fd_archive_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}

export function archiveFormat(value: unknown): ArchiveFormat {
  if (value === "zip" || value === "tar.gz") return value;
  throw new FmError("BAD_FORMAT", 'Choose "zip" or "tar.gz".');
}

export async function archivePaths(ctx: FmContext, pathsInput: string[], format: ArchiveFormat, destInput: unknown, nameInput?: unknown): Promise<ArchiveResult> {
  const dest = absolutePath(ctx, destInput);
  await assertFolder(dest, "The folder for the archive");
  assertCreatable(ctx, dest);
  const p = pathApi(ctx);

  let skipped = 0;
  const paths: string[] = [];
  for (const path of dropNested(pathsInput, ctx.platform)) {
    if (await lstatOrNull(path)) paths.push(path);
    else skipped++;
  }
  if (paths.length === 0) throw new FmError("NOTHING_TO_DO", "None of those items exist any more. Search again.");
  const base = commonFolder(paths, ctx.platform);

  const stem = typeof nameInput === "string" && nameInput.trim() ? nameInput.trim().replace(/\.(zip|tar\.gz|tgz)$/i, "") : defaultBaseName();
  const reason = validateName(`${stem}.${format}`, ctx.platform);
  if (reason) throw new FmError("BAD_NAME", reason);

  if (format === "tar.gz") {
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = new Set(await fsp.readdir(dest));
      const archivePath = p.join(dest, uniqueName(`${stem}.tar.gz`, (n) => taken.has(n)));
      try {
        const r = await runWorkerJob<TarOutcome>(ctx, { kind: "tar", paths, base, dest: archivePath, maxBytes: TAR_MAX_BYTES });
        const size = (await fsp.stat(archivePath)).size;
        return { archivePath, format, files: r.files, folders: r.folders, bytes: r.bytes, size, skipped: skipped + r.skipped };
      } catch (err: any) {
        if (err?.code === "EEXIST") continue;
        if (err?.code === "TIMEOUT") await fsp.rm(archivePath, { force: true }).catch(() => {});
        throw err;
      }
    }
    throw new FmError("EXISTS", "A file with that name keeps appearing. Try again.");
  }

  // The File Manager's zip writer zips items that sit in one folder, so the matches are first gathered into a
  // private folder (laid out like the search folder) and zipped from there.
  const stageRoot = p.join(ctx.dataDir, "find_stage", randomBytes(6).toString("hex"));
  const stageDir = p.join(stageRoot, stem);
  try {
    let total = 0;
    for (const path of paths) {
      const st = await fsp.lstat(path);
      total += st.isDirectory() ? (await folderStats(path, { maxEntries: 200_000, timeMs: 8000 })).bytes : st.size;
      if (total > ZIP_STAGE_MAX_BYTES) throw new FmError("TOO_BIG", "These items add up to more than 2 GB, which is too much to gather into one zip here. Archive fewer items.");
    }
    await fsp.mkdir(stageDir, { recursive: true });
    for (const path of paths) {
      const target = p.join(stageDir, p.relative(base, path));
      try {
        await fsp.mkdir(p.dirname(target), { recursive: true });
        await copyTree(path, target);
      } catch (err: any) {
        if (err instanceof FmError) throw err;
        skipped++;
      }
    }
    const made = await createZip(ctx, [stageDir], stem);
    const taken = new Set(await fsp.readdir(dest));
    const archivePath = p.join(dest, uniqueName(`${stem}.zip`, (n) => taken.has(n)));
    if (await lstatOrNull(archivePath)) throw new FmError("EXISTS", "A file with that name keeps appearing. Try again.");
    await moveTree(made.zipPath, archivePath);
    const size = (await fsp.stat(archivePath)).size;
    return { archivePath, format, files: made.files, folders: Math.max(0, made.folders - 1), bytes: made.bytes, size, skipped: skipped + made.skippedLinks };
  } finally {
    await fsp.rm(stageRoot, { recursive: true, force: true }).catch(() => {});
  }
}
