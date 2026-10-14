/** `info/media`: sound and video details. ffprobe when installed (full), the built-in readers otherwise (basic). */
import { absolutePath, type FmContext } from "./fmCore";
import { fileSource, helperEnv, helperProgram, installHint, openForRead, readBytes, regularFile, runProgram, type InfoGroup } from "./fmInfoCommon";
import { parseFlac, parseMp3, parseOgg, parseWav } from "./fmInfoAudio";
import { emptyMedia, mediaGroups, type MediaInfo, type MediaStream } from "./fmInfoMediaRows";
import { parseMatroska, parseMp4 } from "./fmInfoVideo";
import { extensionOf, FmError } from "./fmPaths";
import { SNIFF_BYTES, sniffType } from "./fmSniff";

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const text = (v: unknown, max = 500): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").slice(0, max).trim() : typeof v === "number" ? String(v) : "");

function rate(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const [a, b] = v.split("/").map(Number);
  return a && b ? a / b : undefined;
}

/** What ffprobe's JSON says, in the same shape the built-in readers give. */
export function fromFfprobe(json: any): MediaInfo {
  const m = emptyMedia("");
  m.source = "ffprobe";
  const f = json?.format ?? {};
  m.container = text(f.format_long_name) || text(f.format_name);
  m.durationSec = num(f.duration) ?? null;
  m.bitrate = num(f.bit_rate) ?? null;
  for (const [k, v] of Object.entries<any>(f.tags ?? {}).slice(0, 80)) {
    const key = k.toLowerCase().replace(/^album-artist$/, "album_artist");
    if (typeof v === "string" || typeof v === "number") m.tags[key] = text(v);
  }
  for (const s of (Array.isArray(json?.streams) ? json.streams : []).slice(0, 100)) {
    const type = s.codec_type === "video" || s.codec_type === "audio" || s.codec_type === "subtitle" || s.codec_type === "data" ? (s.codec_type as MediaStream["type"]) : "other";
    const cover = type === "video" && s.disposition?.attached_pic === 1;
    if (cover) m.coverArt = true;
    const stream: MediaStream = { type, codec: text(s.codec_long_name) || text(s.codec_name), width: num(s.width), height: num(s.height), channels: num(s.channels), layout: text(s.channel_layout) || undefined, sampleRate: num(s.sample_rate), bitrate: num(s.bit_rate), bits: num(s.bits_per_raw_sample) ?? (num(s.bits_per_sample) || undefined) };
    if (type === "video") {
      const fps = rate(s.avg_frame_rate) ?? rate(s.r_frame_rate);
      if (fps && fps > 0 && fps < 1000) stream.fps = fps;
      stream.detail = cover ? "cover" : [text(s.profile), text(s.pix_fmt)].filter(Boolean).join(", ") || undefined;
    }
    stream.language = text(s.tags?.language) || undefined;
    stream.title = text(s.tags?.title) || undefined;
    m.streams.push(stream);
  }
  for (const c of (Array.isArray(json?.chapters) ? json.chapters : []).slice(0, 500)) m.chapters.push({ start: num(c.start_time) ?? 0, title: text(c.tags?.title, 200) });
  return m;
}

async function viaFfprobe(ctx: FmContext, path: string): Promise<MediaInfo | null> {
  const bin = helperProgram(ctx, "ffmpeg", "ffprobe");
  if (!bin) return null;
  const r = await runProgram([bin, "-v", "error", "-protocol_whitelist", "file", "-print_format", "json", "-show_format", "-show_streams", "-show_chapters", "-i", path], helperEnv(ctx), { timeoutMs: 9000, maxBytes: 4 * 1024 * 1024 });
  if (r.code !== 0 || r.timedOut || r.truncated) return null;
  try {
    const json = JSON.parse(r.stdout);
    return json?.streams?.length || json?.format ? fromFfprobe(json) : null;
  } catch {
    return null;
  }
}

export interface MediaResult {
  groups: InfoGroup[];
  source: "ffprobe" | "built-in";
  helper: { ffprobe: boolean; hint: string };
  partial: boolean;
  notes: string[];
}

export async function mediaInfo(ctx: FmContext, input: unknown): Promise<MediaResult> {
  const t = await regularFile(ctx, input);
  const path = absolutePath(ctx, input);
  const hasProbe = !!helperProgram(ctx, "ffmpeg", "ffprobe");
  const hint = hasProbe ? "" : installHint(ctx.platform, "ffprobe");
  let info = await viaFfprobe(ctx, path);
  if (!info) {
    const handle = await openForRead(path);
    try {
      const src = fileSource(handle, t.lst.size);
      const sniff = sniffType(await readBytes(handle, 0, SNIFF_BYTES));
      const kind = sniff?.kind ?? "";
      if (kind === "mp3" || (kind === "binary" && extensionOf(path) === "mp3")) info = await parseMp3(src);
      else if (kind === "wav") info = await parseWav(src);
      else if (kind === "flac") info = await parseFlac(src);
      else if (kind === "ogg") info = await parseOgg(src);
      else if (["mp4", "m4a", "m4v", "mov", "3gp"].includes(kind)) info = await parseMp4(src);
      else if (kind === "mkv" || kind === "webm") info = await parseMatroska(src);
      else throw new FmError("NOT_MEDIA", `This doesn't look like a sound or video file that the built-in reader knows.${hint ? ` ${hint}` : ""}`);
    } finally {
      await handle.close();
    }
  }
  return { groups: mediaGroups(info, t.lst.size), source: info.source, helper: { ffprobe: hasProbe, hint }, partial: info.partial, notes: info.notes };
}
