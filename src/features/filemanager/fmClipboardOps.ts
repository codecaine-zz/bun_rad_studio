/**
 * "Copy to the clipboard" for files: a picture (as a picture) or a text file (its contents as text).
 *   clip/image  {path}  -> {copied: true}
 *   clip/text   {path}  -> {copied: true, chars, lines}
 * Both read the file here, on the server, so nothing large travels through the page, and both say plainly why they refused.
 */
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, assertCreatable, assertModifiable, type FmContext, type FmHandler } from "./fmCore";
import { FmError, classify, describeFsError, extensionOf, formatSize, isDocumentPackageName, splitName } from "./fmPaths";
import { imagePreviewFor } from "./fmQuickLook";

/** Maximum file size in bytes allowed when copying a text file's contents to the system clipboard. */
export const MAX_CLIP_TEXT_BYTES = 5 * 1024 * 1024;
/** Maximum file size in bytes allowed when copying an image file to the system clipboard. */
export const MAX_CLIP_IMAGE_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
  ico: "image/x-icon", avif: "image/avif", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic",
};

async function regularFile(ctx: FmContext, input: unknown, what: string): Promise<{ file: string; size: number }> {
  const file = absolutePath(ctx, input);
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new FmError("NOT_A_FILE", `That isn't a file, so there is no ${what} to copy.`);
    return { file, size: st.size };
  } catch (err) {
    if (err instanceof FmError) throw err;
    const d = describeFsError(err, `read that ${what}`);
    throw new FmError(d.code, d.message);
  }
}

/** Puts a picture file on the clipboard as a picture. */
export async function copyImageToClipboard(ctx: FmContext, input: unknown): Promise<{ copied: true }> {
  const { file, size } = await regularFile(ctx, input, "picture");
  const name = nodePath.basename(file);
  if (classify(name, false).kind !== "image") throw new FmError("NOT_AN_IMAGE", "That isn't a picture, so it can't be copied as one.");
  if (size > MAX_CLIP_IMAGE_BYTES) throw new FmError("TOO_BIG", `That picture is ${formatSize(size)}, which is more than the ${formatSize(MAX_CLIP_IMAGE_BYTES)} that can be put on the clipboard.`);
  const directMime = IMAGE_MIME[extensionOf(name)];
  const targetFile = directMime ? file : ((await imagePreviewFor(ctx, file)) ?? file);
  const mime = directMime ?? "image/png";
  if (!(await ctx.clipboard.writeImage(targetFile, mime))) {
    throw new FmError("CLIPBOARD_FAILED", "The picture couldn't be put on the clipboard. Its format may not be supported on this computer, or the clipboard tool is missing (Linux needs wl-copy or xclip).");
  }
  return { copied: true };
}

/** Puts the contents of a plain-text file on the clipboard as text. */
export async function copyTextFileToClipboard(ctx: FmContext, input: unknown): Promise<{ copied: true; chars: number; lines: number }> {
  const { file, size } = await regularFile(ctx, input, "text");
  if (size > MAX_CLIP_TEXT_BYTES) throw new FmError("TOO_BIG", `That file is ${formatSize(size)}, which is more than the ${formatSize(MAX_CLIP_TEXT_BYTES)} that can be copied as text. Open it in the code editor and copy the part you need.`);
  let bytes: Buffer;
  try {
    bytes = await fsp.readFile(file);
  } catch (err) {
    const d = describeFsError(err, "read that file");
    throw new FmError(d.code, d.message);
  }
  let text: string;
  try {
    if (bytes.subarray(0, 8192).includes(0)) throw new Error("binary");
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new FmError("NOT_TEXT", "This file isn't plain UTF-8 text, so it can't be copied as text.");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text === "") throw new FmError("EMPTY", "That file is empty, so there is nothing to copy.");
  if (!ctx.clipboard.writeText(text)) throw new FmError("CLIPBOARD_FAILED", "The text couldn't be put on the clipboard. The clipboard tool may be missing (Linux needs wl-copy, xclip or xsel).");
  return { copied: true, chars: text.length, lines: text.split("\n").length - (text.endsWith("\n") ? 1 : 0) };
}

function nextAvailableFilePath(dir: string, preferredName: string): string {
  const cleanName = preferredName.replace(/[/\\]/g, "_").trim() || "Clipboard.png";
  const candidate0 = nodePath.join(dir, cleanName);
  if (!existsSync(candidate0)) return candidate0;
  const [stem, ext] = splitName(cleanName);
  for (let i = 2; i < 1000; i++) {
    const cand = nodePath.join(dir, `${stem} (${i})${ext}`);
    if (!existsSync(cand)) return cand;
  }
  return nodePath.join(dir, `${stem}-${Date.now()}${ext}`);
}

function resolveDirInput(ctx: FmContext, raw: unknown): string {
  const s = typeof raw === "string" && raw.trim() ? raw.trim() : ctx.sandboxRoot || ctx.home;
  if (nodePath.isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s)) {
    return absolutePath(ctx, s);
  }
  return absolutePath(ctx, nodePath.join(ctx.sandboxRoot || ctx.home, s));
}

/** Saves an image from the system clipboard (or provided base64 PNG) as a new .png file in `dirPath`. */
export async function pasteClipboardImageToFile(
  ctx: FmContext,
  payload: { dirPath?: string; path?: string; base64Png?: string; fileName?: string },
): Promise<{ saved: true; path: string; name: string; size: number }> {
  const dir = resolveDirInput(ctx, payload?.dirPath || payload?.path);
  await assertCreatable(ctx, dir);

  const stamp = new Date().toISOString().slice(0, 19).replace(/T/, "-").replace(/:/g, "");
  const defaultName = payload?.fileName && String(payload.fileName).trim()
    ? String(payload.fileName).trim().replace(/(\.png)?$/i, ".png")
    : `Clipboard-${stamp}.png`;
  const targetPath = nextAvailableFilePath(dir, defaultName);

  if (typeof payload?.base64Png === "string" && payload.base64Png.trim()) {
    const cleanB64 = payload.base64Png.trim().replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/i, "");
    const buf = Buffer.from(cleanB64, "base64");
    if (buf.length === 0) {
      throw new FmError("EMPTY_IMAGE", "The clipboard image data was empty.");
    }
    await fsp.writeFile(targetPath, buf);
    const st = await fsp.stat(targetPath);
    return { saved: true, path: targetPath, name: nodePath.basename(targetPath), size: st.size };
  }

  let wrote = false;
  if (ctx.platform === "darwin") {
    const appleScript = [
      "on run argv",
      "  set outPath to POSIX file (item 1 of argv)",
      "  try",
      "    set imgData to the clipboard as «class PNGf»",
      "  on error",
      "    error number -128",
      "  end try",
      "  set fRef to open for access outPath with write permission",
      "  try",
      "    set eof fRef to 0",
      "    write imgData to fRef",
      "    close access fRef",
      "  on error errMsg",
      "    try",
      "      close access fRef",
      "    end try",
      "    error errMsg",
      "  end try",
      "end run",
    ].join("\n");
    const r = spawnSync("osascript", ["-e", appleScript, targetPath], { stdio: "ignore", timeout: 6000 });
    wrote = r.status === 0 && existsSync(targetPath);
  } else if (ctx.platform === "win32") {
    const ps = `$img = Get-Clipboard -Format Image; if ($null -eq $img) { exit 2 }; $img.Save(${JSON.stringify(targetPath)}, [System.Drawing.Imaging.ImageFormat]::Png)`;
    const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore", timeout: 6000 });
    wrote = r.status === 0 && existsSync(targetPath);
  } else {
    const wl = spawnSync("wl-paste", ["--type", "image/png"], { maxBuffer: MAX_CLIP_IMAGE_BYTES, timeout: 5000 });
    if (wl.status === 0 && wl.stdout && wl.stdout.length > 0) {
      await fsp.writeFile(targetPath, wl.stdout);
      wrote = true;
    } else {
      const xc = spawnSync("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"], { maxBuffer: MAX_CLIP_IMAGE_BYTES, timeout: 5000 });
      if (xc.status === 0 && xc.stdout && xc.stdout.length > 0) {
        await fsp.writeFile(targetPath, xc.stdout);
        wrote = true;
      }
    }
  }

  if (!wrote || !existsSync(targetPath)) {
    throw new FmError("NO_CLIPBOARD_IMAGE", "There is no picture on the clipboard right now. Copy a screenshot or image first, then try again.");
  }

  const st = await fsp.stat(targetPath);
  if (st.size === 0) {
    await fsp.unlink(targetPath).catch(() => {});
    throw new FmError("NO_CLIPBOARD_IMAGE", "There is no picture on the clipboard right now.");
  }
  return { saved: true, path: targetPath, name: nodePath.basename(targetPath), size: st.size };
}

const TIDY_CATEGORY_FOLDERS = new Set([
  "Books & Documents",
  "Images & Screenshots",
  "Audio & Music",
  "Videos",
  "Archives & Installers",
  "Code & Data",
]);

function classifyTidyCategory(name: string, isDocPkg: boolean): string | null {
  if (isDocPkg) {
    const ext = extensionOf(name);
    if (ext === "playground" || ext === "playgroundbook") return "Code & Data";
    return "Books & Documents";
  }
  const ext = extensionOf(name);
  const info = classify(name, false);

  if (
    [
      "epub", "ibooks", "pdf", "docx", "doc", "odt", "rtf", "rtfd", "textbundle", "scriv", "ulysses",
      "pages", "numbers", "key", "oo3", "mindnode", "graffle", "pptx", "ppsx", "odp", "xlsx", "xlsm",
      "ods", "txt", "md", "markdown", "rst", "org", "adoc", "tex", "fb2", "mobi", "azw", "azw3",
    ].includes(ext) ||
    info.kind === "document"
  ) {
    return "Books & Documents";
  }
  if (
    info.kind === "image" ||
    ["png", "jpg", "jpeg", "gif", "webp", "heic", "svg", "bmp", "tiff", "tif", "avif", "ico", "psd", "raw", "cr2", "nef"].includes(ext)
  ) {
    return "Images & Screenshots";
  }
  if (
    info.kind === "audio" ||
    ["mp3", "wav", "m4a", "flac", "ogg", "opus", "aac", "aiff", "wma", "mid", "midi"].includes(ext)
  ) {
    return "Audio & Music";
  }
  if (
    info.kind === "video" ||
    ["mp4", "mov", "mkv", "webm", "avi", "m4v", "wmv", "flv", "mpeg", "mpg"].includes(ext)
  ) {
    return "Videos";
  }
  if (
    info.kind === "archive" ||
    ["zip", "tar", "gz", "tgz", "7z", "rar", "bz2", "xz", "zst", "dmg", "pkg", "iso", "deb", "rpm", "msi", "apk"].includes(ext)
  ) {
    return "Archives & Installers";
  }
  if (
    info.kind === "code" ||
    [
      "json", "jsonl", "csv", "tsv", "yaml", "yml", "toml", "xml", "ini", "env", "sql", "sqlite", "sqlite3", "db",
      "py", "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "go", "java", "c", "cpp", "h", "cs", "rb", "php", "sh", "zsh",
      "html", "css", "scss", "ipynb", "playground", "playgroundbook", "log",
    ].includes(ext)
  ) {
    return "Code & Data";
  }
  return null;
}

/** A planned or completed file move into a category subfolder during a folder tidy operation. */
export interface TidyMoveItem {
  name: string;
  category: string;
  from: string;
  to: string;
}

/** Organizes loose files in a directory into categorized subfolders (or previews the moves without modifying disk). */
export async function tidyFolder(
  ctx: FmContext,
  payload: { path?: string; preview?: boolean },
): Promise<{
  preview: boolean;
  dir: string;
  movedCount: number;
  moves: TidyMoveItem[];
  byCategory: Record<string, number>;
}> {
  const dir = resolveDirInput(ctx, payload?.path);
  await assertCreatable(ctx, dir);

  const stat = await fsp.stat(dir);
  if (!stat.isDirectory()) {
    throw new FmError("NOT_A_DIRECTORY", "Select a folder to tidy and organize.");
  }

  const dirents = await fsp.readdir(dir, { withFileTypes: true });
  const plannedMoves: TidyMoveItem[] = [];
  const byCategory: Record<string, number> = {};
  const reservedTargets = new Set<string>();

  for (const d of dirents) {
    if (d.name.startsWith(".")) continue;
    if (TIDY_CATEGORY_FOLDERS.has(d.name)) continue;
    const isDocPkg = d.isDirectory() && isDocumentPackageName(d.name);
    if (d.isDirectory() && !isDocPkg) continue;
    if (!d.isFile() && !isDocPkg) continue;

    const category = classifyTidyCategory(d.name, isDocPkg);
    if (!category) continue;

    const categoryDir = nodePath.join(dir, category);
    const fromPath = nodePath.join(dir, d.name);
    let toPath = nodePath.join(categoryDir, d.name);
    if (existsSync(toPath) || reservedTargets.has(toPath)) {
      const [stem, ext] = splitName(d.name);
      for (let i = 2; i < 1000; i++) {
        const cand = nodePath.join(categoryDir, `${stem} (${i})${ext}`);
        if (!existsSync(cand) && !reservedTargets.has(cand)) {
          toPath = cand;
          break;
        }
      }
    }
    reservedTargets.add(toPath);
    plannedMoves.push({ name: d.name, category, from: fromPath, to: toPath });
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  if (payload?.preview) {
    return {
      preview: true,
      dir,
      movedCount: plannedMoves.length,
      moves: plannedMoves,
      byCategory,
    };
  }

  const completedMoves: TidyMoveItem[] = [];
  for (const m of plannedMoves) {
    const catDir = nodePath.dirname(m.to);
    await fsp.mkdir(catDir, { recursive: true });
    await fsp.rename(m.from, m.to);
    completedMoves.push(m);
  }

  return {
    preview: false,
    dir,
    movedCount: completedMoves.length,
    moves: completedMoves,
    byCategory,
  };
}

/** Computed cryptographic digest and file size for a single file in a checksum manifest. */
export interface ChecksumItemResult {
  name: string;
  path: string;
  size: number;
  hash: string;
}

/** Verification status comparing a file's actual digest against its expected checksum entry. */
export interface VerifyItemResult {
  name: string;
  status: "ok" | "mismatch" | "missing";
  expected: string;
  actual: string | null;
}

async function computeFileDigest(filePath: string, algorithm: "sha256" | "sha1" | "md5"): Promise<{ hash: string; size: number }> {
  const st = await fsp.stat(filePath);
  if (!st.isFile()) throw new FmError("NOT_A_FILE", `"${nodePath.basename(filePath)}" is not a regular file.`);
  const h = createHash(algorithm);
  const buf = await fsp.readFile(filePath);
  h.update(buf);
  return { hash: h.digest("hex"), size: st.size };
}

function detectHashAlgorithm(hashHex: string, fallback: "sha256" | "sha1" | "md5" = "sha256"): "sha256" | "sha1" | "md5" {
  const clean = hashHex.trim();
  if (clean.length === 32) return "md5";
  if (clean.length === 40) return "sha1";
  if (clean.length === 64) return "sha256";
  return fallback;
}

/** Generates a SHA-256 / SHA-1 / MD5 checksum manifest for one or more files (or a folder's files). */
export async function generateChecksums(
  ctx: FmContext,
  payload: { paths?: unknown; algorithm?: string; saveFile?: boolean; outputName?: string },
): Promise<{
  algorithm: "sha256" | "sha1" | "md5";
  items: ChecksumItemResult[];
  manifestText: string;
  savedPath: string | null;
  savedName: string | null;
  undo: { action: "delete"; paths: string[] } | null;
}> {
  const rawPaths = Array.isArray(payload?.paths) ? payload.paths : [];
  if (rawPaths.length === 0) throw new FmError("BAD_REQUEST", "Select at least one file to generate a checksum manifest.");
  const algoRaw = String(payload?.algorithm || "sha256").toLowerCase();
  const algorithm: "sha256" | "sha1" | "md5" = algoRaw === "md5" ? "md5" : algoRaw === "sha1" ? "sha1" : "sha256";

  const targetFiles: string[] = [];
  for (const raw of rawPaths) {
    const abs = absolutePath(ctx, raw);
    const st = await fsp.stat(abs).catch(() => null);
    if (!st) continue;
    if (st.isFile()) {
      targetFiles.push(abs);
    } else if (st.isDirectory()) {
      const dirents = await fsp.readdir(abs, { withFileTypes: true });
      for (const d of dirents) {
        if (d.isFile() && !d.name.startsWith(".")) {
          targetFiles.push(nodePath.join(abs, d.name));
        }
      }
    }
  }
  if (targetFiles.length === 0) {
    throw new FmError("NO_FILES", "No regular files were found in the selection to hash.");
  }

  const items: ChecksumItemResult[] = [];
  for (const f of targetFiles.slice(0, 200)) {
    const { hash, size } = await computeFileDigest(f, algorithm);
    items.push({ name: nodePath.basename(f), path: f, size, hash });
  }

  const manifestText = items.map((it) => `${it.hash}  ${it.name}`).join("\n") + "\n";
  let savedPath: string | null = null;
  let savedName: string | null = null;
  let undo: { action: "delete"; paths: string[] } | null = null;

  if (payload?.saveFile !== false) {
    const parentDir = nodePath.dirname(items[0]!.path);
    await assertCreatable(ctx, parentDir);
    const defaultName = payload?.outputName && String(payload.outputName).trim()
      ? String(payload.outputName).trim()
      : items.length === 1
        ? `${items[0]!.name}.${algorithm}`
        : `${algorithm.toUpperCase()}SUMS`;
    savedPath = nextAvailableFilePath(parentDir, defaultName);
    savedName = nodePath.basename(savedPath);
    await fsp.writeFile(savedPath, manifestText, "utf8");
    undo = { action: "delete", paths: [savedPath] };
  }

  return { algorithm, items, manifestText, savedPath, savedName, undo };
}

/** Verifies either a checksum manifest file (.sha256, .md5, SHA256SUMS) or a single file against an expected hash. */
export async function verifyChecksums(
  ctx: FmContext,
  payload: { path?: unknown; expectedHash?: string; algorithm?: string },
): Promise<{
  mode: "single" | "manifest";
  manifestName: string;
  algorithm: "sha256" | "sha1" | "md5";
  passed: number;
  failed: number;
  missing: number;
  results: VerifyItemResult[];
}> {
  const targetPath = absolutePath(ctx, payload?.path);
  const st = await fsp.stat(targetPath).catch(() => null);
  if (!st || !st.isFile()) {
    throw new FmError("NOT_A_FILE", "Select a file or checksum manifest (.sha256, .md5, SHA256SUMS) to verify.");
  }
  const base = nodePath.basename(targetPath);
  const dir = nodePath.dirname(targetPath);
  const expectedRaw = typeof payload?.expectedHash === "string" ? payload.expectedHash.trim().toLowerCase() : "";

  if (expectedRaw) {
    const cleanExpected = expectedRaw.replace(/[^a-f0-9]/g, "");
    if (!cleanExpected) throw new FmError("BAD_HASH", "Enter a valid hexadecimal hash (MD5, SHA-1, or SHA-256) to compare against.");
    const algorithm = payload?.algorithm
      ? (String(payload.algorithm).toLowerCase() as "sha256" | "sha1" | "md5")
      : detectHashAlgorithm(cleanExpected, "sha256");
    const { hash: actual } = await computeFileDigest(targetPath, algorithm);
    const ok = actual.toLowerCase() === cleanExpected;
    return {
      mode: "single",
      manifestName: base,
      algorithm,
      passed: ok ? 1 : 0,
      failed: ok ? 0 : 1,
      missing: 0,
      results: [{ name: base, status: ok ? "ok" : "mismatch", expected: cleanExpected, actual }],
    };
  }

  // Determine if targetPath is itself a manifest file, or if a sidecar .sha256/.md5 exists next to it
  const lowerBase = base.toLowerCase();
  const isManifestFile =
    /\.(sha256|sha1|md5|sfv|sums)$/i.test(lowerBase) ||
    /^(sha256sums|sha1sums|md5sums|checksums(\.txt)?)$/i.test(lowerBase);

  let manifestPath = targetPath;
  let singleTargetForSidecar: string | null = null;
  if (!isManifestFile) {
    const sidecars = [`${targetPath}.sha256`, `${targetPath}.sha1`, `${targetPath}.md5`];
    const foundSidecar = sidecars.find((p) => existsSync(p));
    if (foundSidecar) {
      manifestPath = foundSidecar;
      singleTargetForSidecar = base;
    } else {
      throw new FmError("NEEDS_EXPECTED_HASH", `No sidecar .sha256 file was found next to "${base}". Provide an expected hash to verify this file.`);
    }
  } else if (/\.(sha256|sha1|md5)$/i.test(lowerBase)) {
    const stripped = base.replace(/\.(sha256|sha1|md5)$/i, "");
    if (stripped && existsSync(nodePath.join(dir, stripped))) {
      singleTargetForSidecar = stripped;
    }
  }

  const rawText = (await fsp.readFile(manifestPath, "utf8")).replace(/^\uFEFF/, "");
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) {
    throw new FmError("EMPTY_MANIFEST", `"${nodePath.basename(manifestPath)}" does not contain any checksum lines.`);
  }

  const extAlgo: "sha256" | "sha1" | "md5" =
    manifestPath.toLowerCase().endsWith(".md5") || lowerBase.includes("md5")
      ? "md5"
      : manifestPath.toLowerCase().endsWith(".sha1") || lowerBase.includes("sha1")
        ? "sha1"
        : "sha256";

  const entriesToVerify: Array<{ fileName: string; expected: string; algo: "sha256" | "sha1" | "md5" }> = [];
  for (const line of lines) {
    // Standard GNU format: <hex>  <filename> or <hex> *<filename>
    const gnu = /^([a-fA-F0-9]{32,64})\s+\*?(.+)$/.exec(line);
    if (gnu) {
      const hash = gnu[1]!.toLowerCase();
      const fileName = gnu[2]!.trim();
      entriesToVerify.push({ fileName, expected: hash, algo: detectHashAlgorithm(hash, extAlgo) });
      continue;
    }
    // BSD format: SHA256 (filename) = <hex>
    const bsd = /^(?:SHA256|SHA1|MD5)\s*\((.+)\)\s*=\s*([a-fA-F0-9]{32,64})$/i.exec(line);
    if (bsd) {
      const fileName = bsd[1]!.trim();
      const hash = bsd[2]!.toLowerCase();
      entriesToVerify.push({ fileName, expected: hash, algo: detectHashAlgorithm(hash, extAlgo) });
      continue;
    }
    // Bare single hash inside a sidecar file (`release.zip.sha256` containing only `<hex>`)
    const bare = /^([a-fA-F0-9]{32,64})$/.exec(line);
    if (bare && singleTargetForSidecar) {
      const hash = bare[1]!.toLowerCase();
      entriesToVerify.push({ fileName: singleTargetForSidecar, expected: hash, algo: detectHashAlgorithm(hash, extAlgo) });
    }
  }

  if (entriesToVerify.length === 0) {
    throw new FmError("BAD_MANIFEST", `Could not parse any valid checksum lines in "${nodePath.basename(manifestPath)}".`);
  }

  const results: VerifyItemResult[] = [];
  let passed = 0;
  let failed = 0;
  let missing = 0;
  const manifestDir = nodePath.dirname(manifestPath);

  for (const item of entriesToVerify.slice(0, 200)) {
    const safeRel = item.fileName.replace(/^[/\\]+/, "");
    const candidate = absolutePath(ctx, nodePath.join(manifestDir, safeRel));
    if (!existsSync(candidate)) {
      missing++;
      results.push({ name: item.fileName, status: "missing", expected: item.expected, actual: null });
      continue;
    }
    try {
      const { hash: actual } = await computeFileDigest(candidate, item.algo);
      if (actual.toLowerCase() === item.expected) {
        passed++;
        results.push({ name: item.fileName, status: "ok", expected: item.expected, actual });
      } else {
        failed++;
        results.push({ name: item.fileName, status: "mismatch", expected: item.expected, actual });
      }
    } catch {
      missing++;
      results.push({ name: item.fileName, status: "missing", expected: item.expected, actual: null });
    }
  }

  return {
    mode: "manifest",
    manifestName: nodePath.basename(manifestPath),
    algorithm: entriesToVerify[0]?.algo ?? extAlgo,
    passed,
    failed,
    missing,
    results,
  };
}

/** Metadata row for a file or directory included in a folder structure/inventory export. */
export interface InventoryEntry {
  relativePath: string;
  name: string;
  isDir: boolean;
  size: number;
  sizeFormatted: string;
  modifiedIso: string;
  depth: number;
}

/** Exports a directory's structure and file inventory as ASCII Tree, Markdown Table, CSV, or JSON. */
export async function exportFolderInventory(
  ctx: FmContext,
  payload: { path?: unknown; format?: string; maxDepth?: number; includeHidden?: boolean; saveFile?: boolean },
): Promise<{
  folderName: string;
  folderPath: string;
  format: "tree" | "markdown" | "csv" | "json";
  totalFiles: number;
  totalFolders: number;
  totalBytes: number;
  truncated: boolean;
  content: string;
  savedPath: string | null;
  savedName: string | null;
  undo: { action: "delete"; paths: string[] } | null;
}> {
  const dir = resolveDirInput(ctx, payload?.path);
  const st = await fsp.stat(dir).catch(() => null);
  if (!st || !st.isDirectory()) {
    throw new FmError("NOT_A_DIRECTORY", "Select a folder to export its directory tree or inventory.");
  }

  const fmtRaw = String(payload?.format || "tree").toLowerCase();
  const format: "tree" | "markdown" | "csv" | "json" =
    fmtRaw === "markdown" || fmtRaw === "md" ? "markdown"
    : fmtRaw === "csv" ? "csv"
    : fmtRaw === "json" ? "json"
    : "tree";
  const maxDepth = Math.max(1, Math.min(6, Number(payload?.maxDepth) || 3));
  const includeHidden = payload?.includeHidden === true;
  const maxItems = 500;

  const entries: InventoryEntry[] = [];
  const treeLines: string[] = [`${nodePath.basename(dir)}/`];
  let totalFiles = 0;
  let totalFolders = 0;
  let totalBytes = 0;
  let truncated = false;

  async function walk(currentDir: string, relPrefix: string, depth: number, treePrefix: string) {
    if (depth > maxDepth) return;
    if (entries.length >= maxItems) {
      truncated = true;
      return;
    }
    const dirents = await fsp.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    const filtered = dirents
      .filter((d) => includeHidden || !d.name.startsWith("."))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      });

    for (let i = 0; i < filtered.length; i++) {
      if (entries.length >= maxItems) {
        truncated = true;
        break;
      }
      const d = filtered[i]!;
      const isLast = i === filtered.length - 1;
      const fullPath = nodePath.join(currentDir, d.name);
      const relPath = relPrefix ? `${relPrefix}/${d.name}` : d.name;
      const itemStat = await fsp.stat(fullPath).catch(() => null);
      const isDir = d.isDirectory();
      const size = !isDir && itemStat ? itemStat.size : 0;
      const mtimeIso = itemStat ? new Date(itemStat.mtimeMs).toISOString().slice(0, 19).replace("T", " ") : "";

      if (isDir) totalFolders++;
      else {
        totalFiles++;
        totalBytes += size;
      }

      entries.push({
        relativePath: relPath,
        name: d.name,
        isDir,
        size,
        sizeFormatted: isDir ? "—" : formatSize(size),
        modifiedIso: mtimeIso,
        depth,
      });

      const branch = isLast ? "└── " : "├── ";
      const childPrefix = treePrefix + (isLast ? "    " : "│   ");
      treeLines.push(`${treePrefix}${branch}${d.name}${isDir ? "/" : ` (${formatSize(size)})`}`);

      if (isDir && depth < maxDepth) {
        await walk(fullPath, relPath, depth + 1, childPrefix);
      }
    }
  }

  await walk(dir, "", 1, "");

  const folderName = nodePath.basename(dir);
  let content = "";
  if (format === "tree") {
    treeLines.push("");
    treeLines.push(`${totalFolders} folder${totalFolders === 1 ? "" : "s"}, ${totalFiles} file${totalFiles === 1 ? "" : "s"}, ${formatSize(totalBytes)} total${truncated ? " (truncated)" : ""}`);
    content = treeLines.join("\n") + "\n";
  } else if (format === "markdown") {
    const md = [
      `# Folder Inventory: \`${folderName}\``,
      "",
      `- **Folders**: ${totalFolders}`,
      `- **Files**: ${totalFiles}`,
      `- **Total Size**: ${formatSize(totalBytes)} (${totalBytes.toLocaleString("en-US")} bytes)`,
      "",
      "| Path | Kind | Size | Modified |",
      "| :--- | :--- | ---: | :--- |",
      ...entries.map((e) => `| \`${e.relativePath}${e.isDir ? "/" : ""}\` | ${e.isDir ? "Folder" : "File"} | ${e.sizeFormatted} | ${e.modifiedIso} |`),
      "",
    ];
    content = md.join("\n");
  } else if (format === "csv") {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [
      ["Path", "Name", "Type", "Size (Bytes)", "Size", "Modified"].map(esc).join(","),
      ...entries.map((e) => [e.relativePath, e.name, e.isDir ? "Folder" : "File", String(e.size), e.sizeFormatted, e.modifiedIso].map(esc).join(",")),
    ];
    content = rows.join("\n") + "\n";
  } else {
    content = JSON.stringify(
      {
        folder: folderName,
        totalFolders,
        totalFiles,
        totalBytes,
        totalSizeFormatted: formatSize(totalBytes),
        truncated,
        entries,
      },
      null,
      2,
    ) + "\n";
  }

  let savedPath: string | null = null;
  let savedName: string | null = null;
  let undo: { action: "delete"; paths: string[] } | null = null;

  if (payload?.saveFile === true) {
    await assertCreatable(ctx, dir);
    const ext = format === "markdown" ? "md" : format === "csv" ? "csv" : format === "json" ? "json" : "txt";
    const defaultName = `${folderName}-inventory.${ext}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    savedPath = nextAvailableFilePath(dir, defaultName);
    savedName = nodePath.basename(savedPath);
    await fsp.writeFile(savedPath, content, "utf8");
    undo = { action: "delete", paths: [savedPath] };
  }

  return {
    folderName,
    folderPath: dir,
    format,
    totalFiles,
    totalFolders,
    totalBytes,
    truncated,
    content,
    savedPath,
    savedName,
    undo,
  };
}

/** File Manager API handlers for clipboard copy/paste, folder tidy, checksum generation/verification, and directory inventory export. */
export const clipboardOperations: Record<string, FmHandler> = {
  async "clip/image"(ctx, b) {
    return await copyImageToClipboard(ctx, b.path);
  },
  async "clip/text"(ctx, b) {
    return await copyTextFileToClipboard(ctx, b.path);
  },
  async "clip/pasteImageAsFile"(ctx, b) {
    return await pasteClipboardImageToFile(ctx, (b || {}) as any);
  },
  async "folder/tidy"(ctx, b) {
    return await tidyFolder(ctx, (b || {}) as any);
  },
  async "checksum/generate"(ctx, b) {
    return await generateChecksums(ctx, (b || {}) as any);
  },
  async "checksum/verify"(ctx, b) {
    return await verifyChecksums(ctx, (b || {}) as any);
  },
  async "folder/inventory"(ctx, b) {
    return await exportFolderInventory(ctx, (b || {}) as any);
  },
};
