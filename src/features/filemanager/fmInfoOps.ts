/** The "More info" API: operations named `info/...`. Every one needs the session token like all other operations. */
import type { FmHandler } from "./fmCore";
import { documentInfo } from "./fmInfoDoc";
import { exiftoolInfo } from "./fmInfoExiftool";
import { folderInfo, manyInfo } from "./fmInfoFolder";
import { fileInfo } from "./fmInfoFile";
import { imageInfo, openMap, saveReport } from "./fmInfoImageOps";
import { mediaInfo } from "./fmInfoMedia";
import { OP_TIMEOUT_MS, regularFile, withLimit } from "./fmInfoCommon";
import { stripFile } from "./fmInfoStrip";
import { FAST_GROUP_TITLE } from "./fmHashes";
import { DEFAULT_HASH_IDS, HASHES, cancelTask, compareHash, hashFile, startTask, taskView } from "./fmInfoTasks";
import { FmError } from "./fmPaths";

function hashRows(value: unknown): Array<{ id: string; value: string }> {
  if (!Array.isArray(value) || value.length > 40) throw new FmError("BAD_REQUEST", "Calculate the fingerprints first.");
  return value.map((r) => {
    if (!r || typeof r.id !== "string" || typeof r.value !== "string" || r.value.length > 200) throw new FmError("BAD_REQUEST", "Those fingerprints aren't valid.");
    return { id: r.id, value: r.value };
  });
}

export const infoOperations: Record<string, FmHandler> = {
  async "info/file"(ctx, b) {
    return await withLimit(OP_TIMEOUT_MS, () => fileInfo(ctx, b.path));
  },
  async "info/image"(ctx, b) {
    return await withLimit(OP_TIMEOUT_MS, () => imageInfo(ctx, b.path));
  },
  async "info/exiftool"(ctx, b) {
    return await withLimit(OP_TIMEOUT_MS, () => exiftoolInfo(ctx, b.path));
  },
  async "info/media"(ctx, b) {
    return await withLimit(OP_TIMEOUT_MS, () => mediaInfo(ctx, b.path));
  },
  async "info/document"(ctx, b) {
    return await withLimit(OP_TIMEOUT_MS, () => documentInfo(ctx, b.path));
  },
  async "info/folder"(ctx, b) {
    return await withLimit(OP_TIMEOUT_MS + 2000, () => folderInfo(ctx, b.path));
  },
  async "info/many"(ctx, b) {
    return await withLimit(OP_TIMEOUT_MS + 2000, () => manyInfo(ctx, b.paths));
  },
  /** The kinds of fingerprint that can be chosen, with plain-words descriptions and which are ticked by default. */
  async "info/hashkinds"() {
    return { kinds: HASHES, defaults: DEFAULT_HASH_IDS, fastTitle: FAST_GROUP_TITLE };
  },
  /** Starts a fingerprint job (MD5, SHA-1, SHA-256, SHA-512, CRC32). Ask `info/task` how it is going. */
  async "info/hash"(ctx, b) {
    await regularFile(ctx, b.path);
    return { task: startTask(ctx, "hash", (control) => hashFile(ctx, b.path, control, b.algorithms)) };
  },
  /** Starts counting a folder with no time limit other than cancelling (it still stops at a very large number of items). */
  async "info/folderscan"(ctx, b) {
    return { task: startTask(ctx, "folder", (control) => folderInfo(ctx, b.path, { signal: control.signal, progress: control.progress, maxMs: 5 * 60_000, maxEntries: 3_000_000 })) };
  },
  async "info/task"(ctx, b) {
    return { task: taskView(ctx, b.id) };
  },
  async "info/cancel"(ctx, b) {
    return { cancelled: cancelTask(ctx, b.id) };
  },
  async "info/compare"(_ctx, b) {
    return compareHash(b.expected, hashRows(b.rows));
  },
  async "info/strip"(ctx, b) {
    return await withLimit(30_000, () => stripFile(ctx, b.path, b.keepOrientation === true));
  },
  async "info/save"(ctx, b) {
    return await saveReport(ctx, b.path, b.format, b.content);
  },
  async "info/openmap"(ctx, b) {
    return await openMap(ctx, b);
  },
};
