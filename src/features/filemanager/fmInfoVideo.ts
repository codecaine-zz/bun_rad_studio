/** Built-in readers for video and sound containers: MP4 / MOV / M4A, and Matroska / WebM (best effort). */
import { ascii, be16, be32, clip, readBoxes, type Box, type Source } from "./fmInfoCommon";
import { emptyMedia, type MediaInfo, type MediaStream } from "./fmInfoMediaRows";

const CODECS: Record<string, string> = {
  avc1: "H.264 (AVC)", avc3: "H.264 (AVC)", hvc1: "H.265 (HEVC)", hev1: "H.265 (HEVC)", av01: "AV1", vp09: "VP9", vp08: "VP8", mp4v: "MPEG-4 Visual", jpeg: "Motion JPEG", mjpa: "Motion JPEG",
  apch: "Apple ProRes 422 HQ", apcn: "Apple ProRes 422", apco: "Apple ProRes 422 Proxy", apcs: "Apple ProRes 422 LT", ap4h: "Apple ProRes 4444", "dvh1": "Dolby Vision (HEVC)",
  mp4a: "AAC", alac: "Apple Lossless (ALAC)", "ac-3": "Dolby Digital (AC-3)", "ec-3": "Dolby Digital Plus (E-AC-3)", opus: "Opus", fLaC: "FLAC", samr: "AMR (voice)", ".mp3": "MP3", sowt: "PCM (16-bit)", twos: "PCM (16-bit)", lpcm: "PCM", in24: "PCM (24-bit)", fl32: "PCM (float)",
  tx3g: "Timed text (subtitles)", wvtt: "WebVTT (subtitles)", c608: "Closed captions", text: "Text", mp4s: "MPEG-4 systems",
};

const BRANDS: Array<[RegExp, string]> = [
  [/^qt/, "QuickTime movie (MOV)"], [/^M4A/, "M4A audio (MPEG-4)"], [/^M4B/, "M4B audiobook (MPEG-4)"], [/^M4V/, "M4V video (MPEG-4)"], [/^3g/, "3GP phone video"], [/^(isom|iso2|mp41|mp42|avc1|dash|MSNV)/, "MP4 video (MPEG-4)"],
];

const MAC_EPOCH = Date.UTC(1904, 0, 1);

function trackFrom(buf: Uint8Array, trak: Box, durationOf: { timescale: number }): { stream: MediaStream; handler: string } | null {
  const find = (parent: Box, type: string, from = 8): Box | undefined => readBoxes(buf, parent.body + (from - 8), parent.end).find((b) => b.type === type);
  const tkhd = find(trak, "tkhd");
  const mdia = find(trak, "mdia");
  if (!mdia) return null;
  const mdhd = find(mdia, "mdhd");
  const hdlr = find(mdia, "hdlr");
  const handler = hdlr ? ascii(buf, hdlr.body + 8, 4) : "";
  const stream: MediaStream = { type: handler === "vide" ? "video" : handler === "soun" ? "audio" : handler === "sbtl" || handler === "subt" || handler === "text" || handler === "clcp" ? "subtitle" : "other", codec: "" };
  let timescale = 0, duration = 0;
  if (mdhd) {
    const v1 = buf[mdhd.body] === 1;
    timescale = be32(buf, mdhd.body + (v1 ? 20 : 12));
    duration = v1 ? be32(buf, mdhd.body + 24) * 2 ** 32 + be32(buf, mdhd.body + 28) : be32(buf, mdhd.body + 16);
    const lang = be16(buf, mdhd.body + (v1 ? 32 : 20));
    const code = String.fromCharCode(((lang >> 10) & 31) + 0x60, ((lang >> 5) & 31) + 0x60, (lang & 31) + 0x60);
    if (/^[a-z]{3}$/.test(code) && code !== "und") stream.language = code;
    if (timescale && duration) stream.durationSec = duration / timescale;
  }
  durationOf.timescale = timescale;
  if (tkhd && stream.type === "video") {
    const v1 = buf[tkhd.body] === 1;
    const w = be32(buf, tkhd.body + (v1 ? 88 : 76)) / 65536, h = be32(buf, tkhd.body + (v1 ? 92 : 80)) / 65536;
    if (w > 0 && h > 0 && w < 100000 && h < 100000) { stream.width = Math.round(w); stream.height = Math.round(h); }
  }
  const minf = find(mdia, "minf");
  const stbl = minf ? find(minf, "stbl") : undefined;
  const stsd = stbl ? find(stbl, "stsd") : undefined;
  if (stsd && stsd.end - stsd.body >= 24) {
    const e = stsd.body + 8;
    const fmt = ascii(buf, e + 4, 4);
    stream.codec = CODECS[fmt] ?? CODECS[fmt.trim()] ?? fmt.trim();
    if (stream.type === "audio") {
      stream.channels = be16(buf, e + 24);
      stream.bits = be16(buf, e + 26) || undefined;
      stream.sampleRate = be32(buf, e + 32) >>> 16 || undefined;
    } else if (stream.type === "video" && (!stream.width || !stream.height)) {
      stream.width = be16(buf, e + 32);
      stream.height = be16(buf, e + 34);
    }
  }
  const stts = stbl ? find(stbl, "stts") : undefined;
  if (stts && stream.type === "video" && stream.durationSec) {
    const n = Math.min(be32(buf, stts.body + 4), 4096);
    let samples = 0;
    for (let i = 0; i < n && stts.body + 8 + i * 8 + 8 <= stts.end; i++) samples += be32(buf, stts.body + 8 + i * 8);
    if (samples > 1) stream.fps = samples / stream.durationSec;
  }
  return { stream, handler };
}

const ITUNES: Record<string, string> = { "©nam": "title", "©ART": "artist", aART: "album_artist", "©alb": "album", "©day": "date", "©gen": "genre", "©wrt": "composer", "©too": "encoder", "©cmt": "comment", cprt: "copyright", "©grp": "grouping", desc: "description" };

function readIlst(buf: Uint8Array, ilst: Box, m: MediaInfo): void {
  for (const item of readBoxes(buf, ilst.body, ilst.end, 200)) {
    const data = readBoxes(buf, item.body, item.end, 4).find((b) => b.type === "data");
    if (!data) continue;
    if (item.type === "covr") { m.coverArt = true; continue; }
    const payload = buf.subarray(data.body + 8, data.end);
    const key = ITUNES[item.type];
    if (key && !m.tags[key]) m.tags[key] = clip(Buffer.from(payload).toString("utf8"), 500).trim();
    else if (item.type === "trkn" && payload.length >= 6) m.tags.track ||= `${be16(payload, 2)}${be16(payload, 4) ? `/${be16(payload, 4)}` : ""}`;
    else if (item.type === "disk" && payload.length >= 6) m.tags.disc ||= `${be16(payload, 2)}${be16(payload, 4) ? `/${be16(payload, 4)}` : ""}`;
  }
}

export async function parseMp4(src: Source): Promise<MediaInfo> {
  const m = emptyMedia("MP4 video (MPEG-4)");
  let pos = 0;
  let moov: Box | null = null;
  let moovBuf: Buffer | null = null;
  for (let n = 0; n < 200 && pos + 8 <= src.size; n++) {
    const h = await src.read(pos, 16);
    if (h.length < 8) break;
    let size = be32(h, 0);
    const type = ascii(h, 4, 4);
    let header = 8;
    if (size === 1 && h.length >= 16) { size = be32(h, 8) * 2 ** 32 + be32(h, 12); header = 16; }
    else if (size === 0) size = src.size - pos;
    if (size < header) break;
    if (type === "ftyp") {
      const d = await src.read(pos + header, Math.min(size - header, 64));
      const brand = ascii(d, 0, 4);
      m.container = BRANDS.find(([re]) => re.test(brand))?.[1] ?? `MP4 family (${brand.trim()})`;
    } else if (type === "moov") {
      if (size > 32 * 1024 * 1024) { m.partial = true; m.notes.push("The movie's index is too large to read here."); break; }
      moovBuf = await src.read(pos, size);
      moov = { type, start: 0, body: header, end: moovBuf.length };
      break;
    }
    pos += size;
  }
  if (!moov || !moovBuf) {
    m.partial = true;
    if (!m.notes.length) m.notes.push("The movie's index (moov) wasn't found, so the file may be cut short.");
    return m;
  }
  const kids = readBoxes(moovBuf, moov.body, moov.end, 500);
  const mvhd = kids.find((b) => b.type === "mvhd");
  if (mvhd) {
    const v1 = moovBuf[mvhd.body] === 1;
    const ts = be32(moovBuf, mvhd.body + (v1 ? 20 : 12));
    const dur = v1 ? be32(moovBuf, mvhd.body + 24) * 2 ** 32 + be32(moovBuf, mvhd.body + 28) : be32(moovBuf, mvhd.body + 16);
    if (ts > 0 && dur > 0) m.durationSec = dur / ts;
    const created = v1 ? be32(moovBuf, mvhd.body + 4) * 2 ** 32 + be32(moovBuf, mvhd.body + 8) : be32(moovBuf, mvhd.body + 4);
    if (created > 0) {
      const ms = MAC_EPOCH + created * 1000;
      if (ms > Date.UTC(1990, 0, 1) && ms < Date.now() + 864e5 * 366) m.tags.creation_time = new Date(ms).toISOString().replace(".000Z", "Z");
    }
  }
  for (const trak of kids.filter((b) => b.type === "trak").slice(0, 64)) {
    const t = trackFrom(moovBuf, trak, { timescale: 0 });
    if (t) m.streams.push(t.stream);
  }
  const udta = kids.find((b) => b.type === "udta");
  for (const parent of [udta, moov]) {
    if (!parent) continue;
    const meta = readBoxes(moovBuf, parent === moov ? moov.body : parent.body, parent.end, 500).find((b) => b.type === "meta");
    const ilst = meta ? readBoxes(moovBuf, meta.body + 4, meta.end).find((b) => b.type === "ilst") : undefined;
    if (ilst) readIlst(moovBuf, ilst, m);
  }
  const chpl = udta ? readBoxes(moovBuf, udta.body, udta.end).find((b) => b.type === "chpl") : undefined;
  if (chpl && chpl.end - chpl.body > 9) {
    let p = chpl.body + 8;
    const count = Math.min(moovBuf[p]!, 200);
    p += 1;
    for (let i = 0; i < count && p + 9 <= chpl.end; i++) {
      const start = (be32(moovBuf, p) * 2 ** 32 + be32(moovBuf, p + 4)) / 1e7;
      const len = moovBuf[p + 8]!;
      m.chapters.push({ start, title: clip(Buffer.from(moovBuf.subarray(p + 9, p + 9 + len)).toString("utf8"), 200) });
      p += 9 + len;
    }
  }
  if (!m.streams.length) m.partial = true;
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Matroska / WebM
// ---------------------------------------------------------------------------------------------------------------

const MKV_CODECS: Record<string, string> = {
  "V_MPEG4/ISO/AVC": "H.264 (AVC)", "V_MPEGH/ISO/HEVC": "H.265 (HEVC)", V_VP9: "VP9", V_VP8: "VP8", V_AV1: "AV1", "V_MPEG4/ISO/ASP": "MPEG-4 ASP", V_MPEG2: "MPEG-2",
  A_AAC: "AAC", A_OPUS: "Opus", A_VORBIS: "Vorbis", A_FLAC: "FLAC", A_AC3: "Dolby Digital (AC-3)", A_EAC3: "Dolby Digital Plus (E-AC-3)", A_DTS: "DTS", "A_MPEG/L3": "MP3", A_PCM: "PCM",
  "S_TEXT/UTF8": "SubRip text (SRT)", "S_TEXT/ASS": "Advanced SubStation (ASS)", S_HDMV: "Blu-ray subtitles (PGS)", "S_VOBSUB": "DVD subtitles (VobSub)", "S_TEXT/WEBVTT": "WebVTT",
};

interface El {
  id: number;
  start: number;
  end: number;
}

function vint(b: Uint8Array, p: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  const first = b[p];
  if (!first) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || p + len > b.length) return null;
  let v = keepMarker ? first : first & (0xff >> len);
  let allOnes = (first & (0xff >> len)) === 0xff >> len;
  for (let i = 1; i < len; i++) {
    v = v * 256 + b[p + i]!;
    if (b[p + i] !== 0xff) allOnes = false;
  }
  return { value: v, length: len, unknown: !keepMarker && allOnes };
}

function elements(b: Uint8Array, start: number, end: number, max = 5000): El[] {
  const out: El[] = [];
  let p = start;
  while (p < end && out.length < max) {
    const id = vint(b, p, true);
    if (!id) break;
    const size = vint(b, p + id.length, false);
    if (!size) break;
    const body = p + id.length + size.length;
    const stop = size.unknown ? end : Math.min(end, body + size.value);
    out.push({ id: id.value, start: body, end: stop });
    if (size.unknown) break;
    p = body + size.value;
  }
  return out;
}

const uint = (b: Uint8Array, e: El) => {
  let v = 0;
  for (let i = e.start; i < e.end && i < e.start + 8; i++) v = v * 256 + b[i]!;
  return v;
};
const str = (b: Uint8Array, e: El) => clip(Buffer.from(b.subarray(e.start, e.end)).toString("utf8").replace(/\0.*$/, ""), 300).trim();
const float = (b: Uint8Array, e: El) => (e.end - e.start === 4 ? Buffer.from(b).readFloatBE(e.start) : e.end - e.start === 8 ? Buffer.from(b).readDoubleBE(e.start) : NaN);

export async function parseMatroska(src: Source): Promise<MediaInfo> {
  const m = emptyMedia("Matroska video (MKV)");
  const b = await src.read(0, 2 * 1024 * 1024);
  const top = elements(b, 0, b.length, 20);
  const head = top.find((e) => e.id === 0x1a45dfa3);
  if (head) {
    const doc = elements(b, head.start, head.end).find((e) => e.id === 0x4282);
    if (doc && str(b, doc) === "webm") m.container = "WebM video";
  }
  const seg = top.find((e) => e.id === 0x18538067);
  if (!seg) { m.partial = true; return m; }
  let scale = 1_000_000;
  for (const e of elements(b, seg.start, seg.end, 200)) {
    if (e.id === 0x1549a966) {
      const info = elements(b, e.start, e.end);
      const s = info.find((x) => x.id === 0x2ad7b1);
      if (s) scale = uint(b, s) || scale;
      const d = info.find((x) => x.id === 0x4489);
      if (d) { const dur = float(b, d); if (Number.isFinite(dur)) m.durationSec = (dur * scale) / 1e9; }
      for (const [id, key] of [[0x7ba9, "title"], [0x4d80, "encoder"], [0x5741, "writing_app"]] as const) { const x = info.find((y) => y.id === id); if (x) m.tags[key] = str(b, x); }
    } else if (e.id === 0x1654ae6b) {
      for (const t of elements(b, e.start, e.end).filter((x) => x.id === 0xae)) {
        const f = elements(b, t.start, t.end);
        const get = (id: number) => f.find((x) => x.id === id);
        const type = get(0x83) ? uint(b, get(0x83)!) : 0;
        const codecId = get(0x86) ? str(b, get(0x86)!) : "";
        const stream: MediaStream = { type: type === 1 ? "video" : type === 2 ? "audio" : type === 17 ? "subtitle" : "other", codec: MKV_CODECS[codecId] ?? (MKV_CODECS[codecId.split("/")[0] ?? ""] ?? codecId) };
        const lang = get(0x22b59c) ?? get(0x22b59d);
        if (lang) stream.language = str(b, lang);
        if (get(0x536e)) stream.title = str(b, get(0x536e)!);
        if (get(0x88)) stream.isDefault = uint(b, get(0x88)!) === 1;
        const video = get(0xe0), audio = get(0xe1);
        if (video) {
          const v = elements(b, video.start, video.end);
          const w = v.find((x) => x.id === 0xb0), h = v.find((x) => x.id === 0xba);
          if (w) stream.width = uint(b, w);
          if (h) stream.height = uint(b, h);
          const dd = get(0x23e383);
          if (dd) { const ns = uint(b, dd); if (ns > 0) stream.fps = 1e9 / ns; }
        }
        if (audio) {
          const a = elements(b, audio.start, audio.end);
          const r = a.find((x) => x.id === 0xb5), c = a.find((x) => x.id === 0x9f), bd = a.find((x) => x.id === 0x6264);
          if (r) stream.sampleRate = Math.round(float(b, r)) || undefined;
          if (c) stream.channels = uint(b, c);
          if (bd) stream.bits = uint(b, bd);
        }
        m.streams.push(stream);
      }
    } else if (e.id === 0x1f43b675) break;
  }
  if (!m.streams.length) m.partial = true;
  return m;
}
