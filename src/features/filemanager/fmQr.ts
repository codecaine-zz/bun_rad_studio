/**
 * Saving and copying the QR codes made in the QR tool (the picture itself is drawn in the page).
 *   qr/save        {dir, name, kind: "png"|"svg"|"txt", data}  -> {path, name}   data: base64 for png, text for svg and txt
 *   qr/copy-image  {data}                                      -> {copied: true}  a PNG, as base64, goes on the clipboard as a picture
 *   png/save, png/copy  the same two, under names for any picture made in the page (a frame of an animated GIF)
 *   qr/open-url    {url}                                       -> {opened}        a web address read from a code, in the system browser
 * Saving never replaces a file: if the name is taken a free one ("qr-code (2).png") is used. The bytes are checked here, so a
 * request can't write anything but a real PNG, an SVG or plain text, and the name can't leave the chosen folder.
 */
import { promises as fsp } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import * as nodePath from "path";
import { absolutePath, assertCreatable, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { openCommand } from "./fmOpen";
import { FmError, describeFsError, uniqueName, validateName } from "./fmPaths";

// A request may be about 1 MB (see MAX_BODY_BYTES in fmServer.ts), and base64 adds a third.
export const MAX_QR_PNG_BYTES = 700 * 1024;
export const MAX_QR_TEXT_BYTES = 900 * 1024;

const KINDS = { png: ".png", svg: ".svg", txt: ".txt" } as const;
type Kind = keyof typeof KINDS;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngBytes(data: unknown): Buffer {
  if (typeof data !== "string" || !data) throw new FmError("BAD_REQUEST", "There is no picture to use.");
  if (data.length > Math.ceil((MAX_QR_PNG_BYTES * 4) / 3) + 8) throw new FmError("TOO_BIG", "That picture is too big to save. Choose a smaller size.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new FmError("BAD_REQUEST", "The picture isn't valid.");
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > MAX_QR_PNG_BYTES) throw new FmError("TOO_BIG", "That picture is too big to save. Choose a smaller size.");
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new FmError("BAD_REQUEST", "That isn't a PNG picture.");
  return bytes;
}

function textBytes(data: unknown, kind: "svg" | "txt"): Buffer {
  if (typeof data !== "string" || !data) throw new FmError("BAD_REQUEST", "There is nothing to save.");
  const bytes = Buffer.from(data, "utf8");
  if (bytes.length > MAX_QR_TEXT_BYTES) throw new FmError("TOO_BIG", "That is too big to save.");
  if (kind === "svg" && !/^\s*(<\?xml[^>]*\?>\s*)?<svg[\s>]/.test(data)) throw new FmError("BAD_REQUEST", "That isn't an SVG picture.");
  if (kind === "svg" && /<script|on\w+\s*=|javascript:/i.test(data)) throw new FmError("BAD_REQUEST", "That SVG contains active content and was not saved.");
  return bytes;
}

/** Writes a QR picture or text into a folder under a name that is free. */
export async function saveQr(ctx: FmContext, input: { dir?: unknown; name?: unknown; kind?: unknown; data?: unknown }): Promise<{ path: string; name: string }> {
  const kind = input.kind as Kind;
  if (!(kind in KINDS)) throw new FmError("BAD_REQUEST", "Choose PNG, SVG or text.");
  const dir = absolutePath(ctx, input.dir);
  try {
    if (!(await fsp.stat(dir)).isDirectory()) throw new FmError("NOT_A_FOLDER", "That isn't a folder.");
  } catch (err) {
    if (err instanceof FmError) throw err;
    const d = describeFsError(err, "open that folder");
    throw new FmError(d.code, d.message);
  }
  assertCreatable(ctx, dir);
  const bytes = kind === "png" ? pngBytes(input.data) : textBytes(input.data, kind);
  // The name is only a suggestion: it is cleaned, given the right ending, and made unique.
  let base = typeof input.name === "string" ? input.name.replace(/\.[A-Za-z0-9]{1,5}$/, "") : "";
  base = base.replace(/[\\/\0-\x1f]/g, " ").trim().slice(0, 80) || "qr-code";
  const wanted = `${base}${KINDS[kind]}`;
  const bad = validateName(wanted, ctx.platform);
  if (bad) throw new FmError("BAD_NAME", bad);
  const taken = new Set((await fsp.readdir(dir)).map((n) => (ctx.platform === "win32" ? n.toLowerCase() : n)));
  const name = uniqueName(wanted, (n) => taken.has(ctx.platform === "win32" ? n.toLowerCase() : n));
  const path = pathApi(ctx).join(dir, name);
  try {
    await fsp.writeFile(path, bytes, { flag: "wx" });
  } catch (err: any) {
    if (err?.code === "EEXIST") throw new FmError("EXISTS", `"${name}" already exists here. Try again.`);
    const d = describeFsError(err, "save the QR code");
    throw new FmError(d.code, d.message);
  }
  return { path, name };
}

/** Puts a PNG on the clipboard as a picture, through a private temporary file that is removed straight away. */
export async function copyQrImage(ctx: FmContext, data: unknown): Promise<{ copied: true }> {
  const bytes = pngBytes(data);
  const dir = await mkdtemp(nodePath.join(tmpdir(), "fm-qr-"));
  try {
    const file = nodePath.join(dir, "qr-code.png");
    await fsp.writeFile(file, bytes, { mode: 0o600 });
    if (!(await ctx.clipboard.writeImage(file, "image/png"))) {
      throw new FmError("CLIPBOARD_FAILED", "The picture couldn't be put on the clipboard. Save it as a file instead (Linux needs wl-copy or xclip for copying pictures).");
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  return { copied: true };
}

/**
 * Opens a web address that was read from a QR code, but only an http or https one, with no hidden user name and password, no
 * control characters and a sensible length: a code can hold anything, so anything else is refused here.
 */
export async function openQrUrl(ctx: FmContext, input: unknown): Promise<{ opened: string }> {
  if (typeof input !== "string" || !input.trim() || input.length > 2048) throw new FmError("BAD_URL", "That isn't a web address this program will open.");
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x20\x7f]/.test(input.trim())) throw new FmError("BAD_URL", "That address has spaces or hidden characters, so it was not opened.");
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new FmError("BAD_URL", "That isn't a web address this program will open.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FmError("BAD_URL", "Only web addresses that start with http:// or https:// are opened from here.");
  if (url.username || url.password) throw new FmError("BAD_URL", "That address has a hidden user name or password in it, so it was not opened.");
  const cmd = openCommand(ctx.platform, url.href);
  try {
    await ctx.launch(cmd.command, cmd.args);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NO_OPENER", ctx.platform === "linux" ? "Opening a web page needs the 'xdg-open' program (package 'xdg-utils'), which this computer doesn't seem to have." : "No program to open web pages was found.");
    throw new FmError("OPEN_FAILED", "Couldn't open the web page.");
  }
  return { opened: url.href };
}

export const qrOperations: Record<string, FmHandler> = {
  async "qr/save"(ctx, b) {
    return await saveQr(ctx, b);
  },
  async "qr/copy-image"(ctx, b) {
    return await copyQrImage(ctx, b.data);
  },
  async "png/save"(ctx, b) {
    return await saveQr(ctx, { ...b, kind: "png" });
  },
  async "png/copy"(ctx, b) {
    return await copyQrImage(ctx, b.data);
  },
  async "qr/open-url"(ctx, b) {
    return await openQrUrl(ctx, b.url);
  },
};
