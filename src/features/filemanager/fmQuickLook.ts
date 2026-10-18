/**
 * Quick Look: what the File Manager can show when you press Space on a file.
 *
 *  - pictures, text and code are handled by `previewFile` (fmList.ts);
 *  - sound and video are streamed to the page's own <audio> / <video> player from `/api/raw` (with Range requests, so
 *    seeking works and a big file is never loaded whole);
 *  - on macOS, documents the page cannot draw itself (PDF, Word, Excel, Keynote, HEIC pictures, camera RAW, ...) are
 *    shown as the first-page picture that the system's own Quick Look makes (`qlmanage -t`). Nothing like it exists on
 *    Windows or Linux, so there those files get the plain information card.
 *
 * Safety: the file name only ever reaches `qlmanage` as one argument (never a shell line); only regular files are read;
 * pictures made for the preview live in a private temporary folder that is removed when the File Manager stops.
 */
import { promises as fsp, rmSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { tmpdir } from "os";
import * as nodePath from "path";
import { absolutePath, type FmContext } from "./fmCore";
import { decodeImageToPngBuffer } from "./fmImageConvert";
import { classify, extensionOf } from "./fmPaths";
import { resolveTool } from "./fmToolDetect";

export const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", weba: "audio/webm",
};
export const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", ogv: "video/ogg",
};
export const MEDIA_MIME: Record<string, string> = { ...AUDIO_MIME, ...VIDEO_MIME };

/** Files the system's Quick Look can draw a picture of but a web page cannot. */
const THUMB_EXTS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "pages", "numbers", "key", "rtf", "rtfd", "odt", "ods", "odp", "epub",
  "heic", "heif", "tif", "tiff", "psd", "ai", "eps", "cr2", "cr3", "nef", "arw", "dng", "raw", "usdz",
  "mkv", "avi", "wmv", "flv", "mpg", "mpeg", "3gp",
]);

export function mediaKindOf(name: string): "audio" | "video" | null {
  const ext = extensionOf(name);
  return AUDIO_MIME[ext] ? "audio" : VIDEO_MIME[ext] ? "video" : null;
}

export const wantsThumbnail = (name: string) => THUMB_EXTS.has(extensionOf(name));

/** Whether this computer can make the document pictures (macOS with its `qlmanage` tool). */
export function thumbnailsAvailable(ctx: Pick<FmContext, "platform" | "toolDirs">): boolean {
  if (ctx.platform !== "darwin" || ctx.toolDirs) return false;
  return !!Bun.which("qlmanage");
}

const THUMB_SIZE = 1400;
const THUMB_TIMEOUT_MS = 12_000;
const MAX_CACHED = 60;
const dirs = new WeakMap<object, string>();
const running = new Map<string, Promise<string | null>>();

async function cacheDir(ctx: FmContext): Promise<string> {
  let dir = dirs.get(ctx);
  if (!dir) {
    const made = nodePath.join(tmpdir(), `fm-quicklook-${randomBytes(6).toString("hex")}`);
    await fsp.mkdir(made, { mode: 0o700, recursive: true });
    dirs.set(ctx, made);
    ctx.disposers.push(() => {
      try { rmSync(made, { recursive: true, force: true }); } catch { /* the system cleans /tmp anyway */ }
    });
    dir = made;
  }
  return dir;
}

async function prune(dir: string): Promise<void> {
  const names = (await fsp.readdir(dir)).filter((n) => n.endsWith(".png"));
  if (names.length <= MAX_CACHED) return;
  const withTime = await Promise.all(names.map(async (n) => ({ n, t: (await fsp.stat(nodePath.join(dir, n)).catch(() => null))?.mtimeMs ?? 0 })));
  withTime.sort((a, b) => a.t - b.t);
  for (const old of withTime.slice(0, names.length - MAX_CACHED)) await fsp.rm(nodePath.join(dir, old.n), { force: true });
}

async function runTool(argv: string[], timeoutMs = THUMB_TIMEOUT_MS): Promise<boolean> {
  try {
    const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "ignore", stderr: "ignore", windowsHide: true });
    const timer = setTimeout(() => { try { proc.kill(); } catch {} }, timeoutMs);
    const code = await proc.exited;
    clearTimeout(timer);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Converts any image file into a cached temporary PNG in the private Quick Look folder, using:
 *   1. Pure-TypeScript decoders (Netpbm PBM/PGM/PPM/PAM, TGA, TIFF, PSD, QOI, XBM, BMP, embedded PNG / ICNS)
 *   2. ImageMagick (`magick` / `convert`)
 *   3. macOS `sips`
 *   4. `ffmpeg`
 *   5. macOS `qlmanage`
 */
export async function imagePreviewFor(ctx: FmContext, pathInput: unknown): Promise<string | null> {
  const file = absolutePath(ctx, pathInput);
  const name = nodePath.basename(file);
  if (classify(name, false).preview !== "image") return null;
  const st = await fsp.stat(file).catch(() => null);
  if (!st || !st.isFile()) return null;
  const dir = await cacheDir(ctx);
  const key = createHash("sha1").update(`img|${file}|${st.mtimeMs}|${st.size}`).digest("hex").slice(0, 24);
  const target = nodePath.join(dir, `${key}.png`);
  if ((await fsp.stat(target).catch(() => null))?.size) return target;
  const pending = running.get(target);
  if (pending) return pending;

  const job = (async () => {
    const ext = extensionOf(name);
    const tmpTarget = nodePath.join(dir, `${key}.tmp.png`);
    try {
      // 1. Pure-TS decoder for fast, dependency-free conversion
      if (st.size > 0 && st.size <= 64 * 1024 * 1024) {
        const buf = await fsp.readFile(file);
        const decoded = decodeImageToPngBuffer(buf, ext);
        if (decoded && decoded.length > 0) {
          await fsp.writeFile(target, decoded);
          await prune(dir).catch(() => {});
          return target;
        }
      }

      // 2. ImageMagick (magick / convert)
      const magick = resolveTool(ctx, "imagemagick");
      if (magick) {
        await runTool([magick, `${file}[0]`, "-auto-orient", "-thumbnail", `${THUMB_SIZE}x${THUMB_SIZE}>`, tmpTarget]);
        if ((await fsp.stat(tmpTarget).catch(() => null))?.size) {
          await fsp.rename(tmpTarget, target);
          await prune(dir).catch(() => {});
          return target;
        }
      }

      // 3. macOS sips
      if (ctx.platform === "darwin" && !ctx.toolDirs) {
        const sips = Bun.which("sips");
        if (sips) {
          await runTool([sips, "-s", "format", "png", "-Z", String(THUMB_SIZE), file, "--out", tmpTarget]);
          if ((await fsp.stat(tmpTarget).catch(() => null))?.size) {
            await fsp.rename(tmpTarget, target);
            await prune(dir).catch(() => {});
            return target;
          }
        }
      }

      // 4. ffmpeg
      const ffmpeg = resolveTool(ctx, "ffmpeg");
      if (ffmpeg) {
        await runTool([ffmpeg, "-y", "-i", file, "-frames:v", "1", "-vf", `scale='min(${THUMB_SIZE},iw)':-1`, tmpTarget]);
        if ((await fsp.stat(tmpTarget).catch(() => null))?.size) {
          await fsp.rename(tmpTarget, target);
          await prune(dir).catch(() => {});
          return target;
        }
      }

      // 5. macOS Quick Look (qlmanage)
      if (thumbnailsAvailable(ctx)) {
        const work = nodePath.join(dir, `${key}-ql`);
        await fsp.mkdir(work, { recursive: true });
        try {
          await runTool(["qlmanage", "-t", "-s", String(THUMB_SIZE), "-o", work, file]);
          const made = (await fsp.readdir(work)).find((n) => n.endsWith(".png"));
          if (made) {
            await fsp.rename(nodePath.join(work, made), target);
            await prune(dir).catch(() => {});
            return target;
          }
        } finally {
          await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
        }
      }

      return null;
    } catch {
      return null;
    } finally {
      await fsp.rm(tmpTarget, { force: true }).catch(() => {});
      running.delete(target);
    }
  })();

  running.set(target, job);
  return job;
}

/** The path of a PNG picture of the file (made now, or reused), or null when the system could not make one. */
export async function thumbnailFor(ctx: FmContext, pathInput: unknown): Promise<string | null> {
  const file = absolutePath(ctx, pathInput);
  if (!thumbnailsAvailable(ctx) || !wantsThumbnail(nodePath.basename(file))) return null;
  const st = await fsp.stat(file);
  if (!st.isFile()) return null;
  const dir = await cacheDir(ctx);
  const key = createHash("sha1").update(`${file}|${st.mtimeMs}|${st.size}`).digest("hex").slice(0, 24);
  const target = nodePath.join(dir, `${key}.png`);
  if ((await fsp.stat(target).catch(() => null))?.size) return target;
  const pending = running.get(target);
  if (pending) return pending;
  const job = (async () => {
    const work = nodePath.join(dir, key);
    await fsp.mkdir(work, { recursive: true });
    try {
      const proc = Bun.spawn(["qlmanage", "-t", "-s", String(THUMB_SIZE), "-o", work, file], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
      const timer = setTimeout(() => { try { proc.kill(); } catch { /* already over */ } }, THUMB_TIMEOUT_MS);
      await proc.exited;
      clearTimeout(timer);
      const made = (await fsp.readdir(work)).find((n) => n.endsWith(".png"));
      if (!made) return null;
      await fsp.rename(nodePath.join(work, made), target);
      await prune(dir).catch(() => {});
      return target;
    } catch {
      return null;
    } finally {
      await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
      running.delete(target);
    }
  })();
  running.set(target, job);
  return job;
}

/** One byte range of a `Range: bytes=...` header: null when there is none, "bad" when it can't be served. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | "bad" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "bad";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const tail = Number(m[2]);
    if (tail === 0) return "bad";
    start = Math.max(0, size - tail);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start <= end) || start >= size) return "bad";
  return { start, end };
}

/** Serves a file, or the part of it that was asked for, so a player can start playing and jump around. */
export function fileResponse(req: Request, file: string, size: number, headers: Record<string, string>): Response {
  const range = parseRange(req.headers.get("range"), size);
  const base = { ...headers, "Accept-Ranges": "bytes" };
  if (range === "bad") return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
  const f = Bun.file(file);
  if (!range) return new Response(f, { headers: { ...base, "Content-Length": String(size) } });
  return new Response(f.slice(range.start, range.end + 1), { status: 206, headers: { ...base, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(range.end - range.start + 1) } });
}
