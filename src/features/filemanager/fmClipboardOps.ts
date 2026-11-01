/**
 * "Copy to the clipboard" for files: a picture (as a picture) or a text file (its contents as text).
 *   clip/image  {path}  -> {copied: true}
 *   clip/text   {path}  -> {copied: true, chars, lines}
 * Both read the file here, on the server, so nothing large travels through the page, and both say plainly why they refused.
 */
import { spawnSync } from "child_process";
import { existsSync, promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, assertCreatable, assertModifiable, type FmContext, type FmHandler } from "./fmCore";
import { FmError, classify, describeFsError, extensionOf, formatSize, isDocumentPackageName, splitName } from "./fmPaths";
import { imagePreviewFor } from "./fmQuickLook";

export const MAX_CLIP_TEXT_BYTES = 5 * 1024 * 1024;
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

export interface TidyMoveItem {
  name: string;
  category: string;
  from: string;
  to: string;
}

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
};
