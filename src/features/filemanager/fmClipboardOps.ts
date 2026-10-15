/**
 * "Copy to the clipboard" for files: a picture (as a picture) or a text file (its contents as text).
 *   clip/image  {path}  -> {copied: true}
 *   clip/text   {path}  -> {copied: true, chars, lines}
 * Both read the file here, on the server, so nothing large travels through the page, and both say plainly why they refused.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, type FmContext, type FmHandler } from "./fmCore";
import { FmError, classify, describeFsError, extensionOf, formatSize } from "./fmPaths";

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
  const mime = IMAGE_MIME[extensionOf(name)] ?? "image/png";
  if (!(await ctx.clipboard.writeImage(file, mime))) {
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

export const clipboardOperations: Record<string, FmHandler> = {
  async "clip/image"(ctx, b) {
    return await copyImageToClipboard(ctx, b.path);
  },
  async "clip/text"(ctx, b) {
    return await copyTextFileToClipboard(ctx, b.path);
  },
};
