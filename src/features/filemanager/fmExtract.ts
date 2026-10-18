/**
 * Universal archive and compressed-file extraction for the File Manager.
 *
 * Supports:
 *   - Built-in Zip archives: .zip, .cbz, .whl, .jar, .apk, .ipa, .xpi
 *   - Built-in Tar archives: .tar, .tar.gz, .tgz, .tar.zst, .tzst
 *   - Built-in single-file compressed streams: .gz, .svgz, .zst, .br
 *   - External-tool multi-file archives (7-Zip / unar / bsdtar):
 *       .tar.bz2, .tbz2, .tbz, .tar.xz, .txz, .tar.lz4, .tar.lzma, .tlz,
 *       .7z, .rar, .iso, .cab, .dmg, .cpio, .lzh, .lha, .xar, .ar, .rpm
 *   - External-tool single-file compressed streams:
 *       .bz2, .xz, .lzma, .lz4, .z
 *
 * Extraction never overwrites existing items: multi-file archives unpack into a new sibling folder named after the
 * archive (with "(2)" etc. when taken), and single-file compressed streams unpack to a new sibling file.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext } from "./fmCore";
import { extractTarGz, gunzipFile, unbrotliFile, unzstdFile } from "./fmConvArchive";
import { ConvError } from "./fmConvCommon";
import { Stage, publishFile, publishFolder, removeQuietly, runCommands, sanitizeExtracted, siblingTemp, type TreeLimits } from "./fmConvExec";
import { FmError, splitName, uniqueName } from "./fmPaths";
import { explainFailure, resolveTool } from "./fmToolDetect";
import { childEnv, type ToolId } from "./fmTools";
import { DEFAULT_ZIP_LIMITS, extractZip, type ZipLimits } from "./fmZip";

const BUILTIN_ZIP_EXTS = new Set(["zip", "cbz", "whl", "jar", "apk", "ipa", "xpi"]);
const BUILTIN_TAR_EXTS = new Set(["tar", "tar.gz", "tgz", "tar.zst", "tzst"]);
const BUILTIN_SINGLE_EXTS = new Set(["gz", "svgz", "zst", "br"]);
const EXTERNAL_TAR_EXTS = new Set(["tar.bz2", "tbz2", "tbz", "tar.xz", "txz", "tar.lz4", "tar.lzma", "tlz"]);
const EXTERNAL_ARCHIVE_EXTS = new Set([
  ...EXTERNAL_TAR_EXTS,
  "7z", "rar", "iso", "cab", "dmg", "cpio", "lzh", "lha", "xar", "ar", "rpm",
]);
const EXTERNAL_SINGLE_EXTS = new Set(["bz2", "xz", "lzma", "lz4", "z"]);

export const EXTRACTABLE_EXTENSIONS: readonly string[] = [
  ...BUILTIN_ZIP_EXTS,
  ...BUILTIN_TAR_EXTS,
  ...BUILTIN_SINGLE_EXTS,
  ...EXTERNAL_ARCHIVE_EXTS,
  ...EXTERNAL_SINGLE_EXTS,
];

const EXTRACTABLE_SET = new Set<string>(EXTRACTABLE_EXTENSIONS);

/** Lowercase extension of `name`, keeping compound `.tar.*` extensions intact. */
export function archiveExtensionOf(name: string): string {
  const [, ext] = splitName(name);
  return ext.replace(/^\./, "").toLowerCase();
}

/** True when `name` has an extension that can be extracted or uncompressed. */
export function isExtractableName(name: string): boolean {
  if (typeof name !== "string" || !name.trim()) return false;
  return EXTRACTABLE_SET.has(archiveExtensionOf(name));
}

function archiveStem(fileName: string, ext: string): string {
  if (ext === "svgz") return `${fileName.slice(0, fileName.length - 5)}.svg` || "image.svg";
  const [stem] = splitName(fileName);
  return stem || "Extracted";
}

function singleFileTargetName(fileName: string, ext: string): string {
  if (ext === "svgz") {
    const base = fileName.slice(0, Math.max(0, fileName.length - 5));
    return `${base || "image"}.svg`;
  }
  const [stem] = splitName(fileName);
  if (stem && stem !== fileName) return stem;
  return `${fileName || "decompressed"}.out`;
}

export interface ArchiveExtracted {
  /** Path of the extracted folder (or the uncompressed file for single-file formats like .gz/.zst/.br). */
  folder: string;
  /** Same as `folder`: the created path on disk. */
  output: string;
  /** True when `output` is a folder, false when a single compressed file was uncompressed directly to a file. */
  isFolder: boolean;
  files: number;
  folders: number;
  bytes: number;
  skipped: string[];
}

export interface ExtractItemResult extends ArchiveExtracted {
  source: string;
}

export interface ExtractBatchResult {
  results: ExtractItemResult[];
  skippedCount: number;
  errors: Array<{ path: string; message: string }>;
}

/** Picks an installed external extractor (`unar`, `sevenzip`, or `bsdtar`) that handles `ext`. */
function pickExternalExtractor(ctx: FmContext, ext: string): { tool: ToolId; bin: string } {
  const sevenzip = resolveTool(ctx, "sevenzip");
  const unar = resolveTool(ctx, "unar");
  const bsdtar = resolveTool(ctx, "bsdtar");

  if (EXTERNAL_TAR_EXTS.has(ext) || ext === "cpio" || ext === "xar" || ext === "ar" || ext === "rpm") {
    if (bsdtar) return { tool: "bsdtar", bin: bsdtar };
    if (unar) return { tool: "unar", bin: unar };
    if (sevenzip) return { tool: "sevenzip", bin: sevenzip };
  } else if (ext === "rar" || ext === "lzh" || ext === "lha") {
    if (unar) return { tool: "unar", bin: unar };
    if (sevenzip) return { tool: "sevenzip", bin: sevenzip };
    if (bsdtar) return { tool: "bsdtar", bin: bsdtar };
  } else {
    if (sevenzip) return { tool: "sevenzip", bin: sevenzip };
    if (unar) return { tool: "unar", bin: unar };
    if (bsdtar) return { tool: "bsdtar", bin: bsdtar };
  }
  throw new FmError(
    "TOOL_MISSING",
    `Opening .${ext} archives needs 7-Zip, The Unarchiver (unar), or bsdtar installed. Open Convert / Process to set up helper tools.`,
  );
}

async function extractWithExternalTool(
  ctx: FmContext,
  filePath: string,
  destDir: string,
  ext: string,
  expectSingleFile: boolean,
  limits: ZipLimits,
): Promise<ArchiveExtracted> {
  const p = pathApi(ctx);
  const baseName = p.basename(filePath);
  const { tool, bin } = pickExternalExtractor(ctx, ext);
  const treeLimits: TreeLimits = { maxBytes: limits.maxTotalBytes, maxEntries: limits.maxEntries };
  const stage = new Stage();
  const taken = new Set(await fsp.readdir(destDir));
  const folderCandidate = p.join(destDir, uniqueName(archiveStem(baseName, ext), (n) => taken.has(n)));
  const work = siblingTemp(folderCandidate);

  try {
    const safeIn = stage.safeInput(filePath, "input", ext);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5 * 60 * 1000);
    try {
      const steps: Array<string[] | (() => string[])> = [];
      if (tool === "unar") {
        steps.push([bin, "-q", "-no-directory", "-o", work, "--", safeIn]);
      } else if (tool === "sevenzip") {
        if (EXTERNAL_TAR_EXTS.has(ext)) {
          const tarDir = stage.subDir("tar");
          steps.push(
            [bin, "x", "-y", "-bd", "-p", "-bb0", `-o${tarDir}`, "--", safeIn],
            () => {
              const tarFile = nodePath.join(tarDir, "input.tar");
              return [bin, "x", "-y", "-bd", "-p", "-bb0", "-snl-", `-o${work}`, "--", tarFile];
            },
          );
        } else {
          steps.push([bin, "x", "-y", "-bd", "-p", "-bb0", "-snl-", `-o${work}`, "--", safeIn]);
        }
      } else {
        steps.push([bin, "-xf", safeIn, "-C", work]);
      }

      await runCommands(steps, {
        env: childEnv(ctx),
        watch: { dir: work, limits: treeLimits },
        explain: (text, code) => explainFailure(tool, text, code),
        signal: ac.signal,
        log: () => {},
      });
    } finally {
      clearTimeout(timer);
    }

    const sanitized = await sanitizeExtracted(work, treeLimits);
    const skipped = sanitized.removedLinks > 0 ? [`${sanitized.removedLinks} symbolic link${sanitized.removedLinks === 1 ? " was" : "s were"} skipped.`] : [];

    // For single-file compressed formats (.bz2, .xz, .lzma, .lz4, .z), if the tool produced a single file, place that file directly.
    if (expectSingleFile) {
      const names = await fsp.readdir(work);
      if (names.length === 1) {
        const onlyPath = nodePath.join(work, names[0]!);
        const onlyStat = await fsp.lstat(onlyPath);
        if (onlyStat.isFile()) {
          const targetName = uniqueName(singleFileTargetName(baseName, ext), (n) => taken.has(n));
          const finalFile = p.join(destDir, targetName);
          publishFile(onlyPath, finalFile);
          await removeQuietly(work);
          return {
            folder: finalFile,
            output: finalFile,
            isFolder: false,
            files: 1,
            folders: 0,
            bytes: onlyStat.size,
            skipped,
          };
        }
      }
    }

    // Count total bytes and folders inside `work` before publishing.
    let totalBytes = 0;
    let totalFolders = 0;
    const stack = [work];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const entryName of await fsp.readdir(cur)) {
        const full = nodePath.join(cur, entryName);
        const st = await fsp.lstat(full);
        if (st.isDirectory()) {
          totalFolders++;
          stack.push(full);
        } else if (st.isFile()) {
          totalBytes += st.size;
        }
      }
    }

    publishFolder(work, folderCandidate);
    return {
      folder: folderCandidate,
      output: folderCandidate,
      isFolder: true,
      files: sanitized.files,
      folders: totalFolders,
      bytes: totalBytes,
      skipped,
    };
  } catch (err: any) {
    await removeQuietly(work);
    if (err instanceof FmError) throw err;
    if (err instanceof ConvError) throw new FmError("BAD_ARCHIVE", err.message);
    throw new FmError("EXTRACT_FAILED", String(err?.message ?? "Could not extract this archive."));
  } finally {
    stage.cleanup();
  }
}

/**
 * Extracts or uncompresses any supported archive or compressed file into `destInput` (default: beside the file).
 * Never overwrites an existing file or folder.
 */
export async function extractArchive(
  ctx: FmContext,
  fileInput: unknown,
  destInput?: unknown,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ArchiveExtracted> {
  const filePath = absolutePath(ctx, fileInput);
  const p = pathApi(ctx);
  const destDir = destInput === undefined ? p.dirname(filePath) : absolutePath(ctx, destInput);
  await assertFolder(destDir, "The destination");
  assertCreatable(ctx, destDir);

  const st = await fsp.stat(filePath);
  if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't a compressed file or archive.");

  const baseName = p.basename(filePath);
  const ext = archiveExtensionOf(baseName);

  // 1. Built-in Zip formats (.zip, .cbz, .whl, .jar, .apk, .ipa, .xpi)
  if (BUILTIN_ZIP_EXTS.has(ext) || !ext) {
    if (!BUILTIN_ZIP_EXTS.has(ext)) {
      throw new FmError("UNSUPPORTED", `"${baseName}" isn't a supported compressed file or archive.`);
    }
    const r = await extractZip(ctx, filePath, destDir, limits);
    return { ...r, output: r.folder, isFolder: true };
  }

  // 2. Built-in Tar formats (.tar, .tar.gz, .tgz, .tar.zst, .tzst)
  if (BUILTIN_TAR_EXTS.has(ext)) {
    const taken = new Set(await fsp.readdir(destDir));
    const root = p.join(destDir, uniqueName(archiveStem(baseName, ext), (n) => taken.has(n)));
    await fsp.mkdir(root);
    try {
      const r = await extractTarGz(filePath, root, ctx.platform, {
        maxBytes: limits.maxTotalBytes,
        maxEntries: limits.maxEntries,
      });
      return {
        folder: root,
        output: root,
        isFolder: true,
        files: r.files,
        folders: r.folders,
        bytes: r.bytes,
        skipped: r.skipped,
      };
    } catch (err: any) {
      await fsp.rm(root, { recursive: true, force: true }).catch(() => {});
      if (err instanceof FmError) throw err;
      throw new FmError("BAD_ARCHIVE", String(err?.message ?? "This archive is damaged and couldn't be unpacked."));
    }
  }

  // 3. Built-in single-file compressed formats (.gz, .svgz, .zst, .br)
  if (BUILTIN_SINGLE_EXTS.has(ext)) {
    const taken = new Set(await fsp.readdir(destDir));
    const outName = uniqueName(singleFileTargetName(baseName, ext), (n) => taken.has(n));
    const outPath = p.join(destDir, outName);
    try {
      if (ext === "gz" || ext === "svgz") {
        await gunzipFile(filePath, outPath, limits.maxTotalBytes);
      } else if (ext === "zst") {
        await unzstdFile(filePath, outPath, limits.maxTotalBytes);
      } else {
        await unbrotliFile(filePath, outPath, limits.maxTotalBytes);
      }
      const outStat = await fsp.stat(outPath);
      await fsp.utimes(outPath, st.mtime, st.mtime).catch(() => {});
      return {
        folder: outPath,
        output: outPath,
        isFolder: false,
        files: 1,
        folders: 0,
        bytes: outStat.size,
        skipped: [],
      };
    } catch (err: any) {
      await fsp.rm(outPath, { force: true }).catch(() => {});
      if (err instanceof FmError) throw err;
      throw new FmError("BAD_ARCHIVE", String(err?.message ?? "This compressed file is damaged and couldn't be unpacked."));
    }
  }

  // 4. External single-file compressed formats (.bz2, .xz, .lzma, .lz4, .z)
  if (EXTERNAL_SINGLE_EXTS.has(ext)) {
    return await extractWithExternalTool(ctx, filePath, destDir, ext, true, limits);
  }

  // 5. External multi-file archives (.7z, .rar, .tar.xz, .txz, .tar.bz2, .tbz2, .iso, .cab, .dmg, etc.)
  if (EXTERNAL_ARCHIVE_EXTS.has(ext)) {
    return await extractWithExternalTool(ctx, filePath, destDir, ext, false, limits);
  }

  throw new FmError("UNSUPPORTED", `"${baseName}" isn't a supported compressed file or archive.`);
}

/**
 * Extracts all extractable files from `pathsInput` (ignoring non-archive files or folders in a mixed selection).
 * Throws if no extractable files were in `pathsInput` or if every extractable file failed.
 */
export async function extractItems(
  ctx: FmContext,
  pathsInput: unknown,
  destInput?: unknown,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ExtractBatchResult> {
  if (!Array.isArray(pathsInput) || pathsInput.length === 0) {
    throw new FmError("BAD_REQUEST", "Nothing was selected.");
  }
  const p = pathApi(ctx);
  const resolved = pathsInput.map((item) => absolutePath(ctx, item));
  const candidateFiles: string[] = [];
  let skippedCount = 0;

  for (const itemPath of resolved) {
    const st = await fsp.stat(itemPath).catch(() => null);
    if (!st || !st.isFile() || !isExtractableName(p.basename(itemPath))) {
      skippedCount++;
      continue;
    }
    candidateFiles.push(itemPath);
  }

  if (candidateFiles.length === 0) {
    throw new FmError("NOTHING_TO_EXTRACT", "None of the selected items is a compressed file or archive that can be extracted.");
  }

  const results: ExtractItemResult[] = [];
  const errors: Array<{ path: string; message: string }> = [];
  let firstErr: unknown = null;

  for (const filePath of candidateFiles) {
    try {
      const extracted = await extractArchive(ctx, filePath, destInput, limits);
      results.push({ ...extracted, source: filePath });
    } catch (err: any) {
      firstErr ??= err;
      errors.push({ path: filePath, message: String(err?.message ?? "Could not extract this archive.") });
    }
  }

  if (results.length === 0 && firstErr) {
    throw firstErr;
  }

  return { results, skippedCount, errors };
}
