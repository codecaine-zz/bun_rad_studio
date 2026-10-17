// The player's brain, with no page dependencies (so it is tested on its own): reading the tags inside music files, turning
// subtitle files into the form a <video> understands, clock text, which kinds of file play, and the play queue.

/** The file endings the built-in player takes. They must match AUDIO_MIME and VIDEO_MIME in fmQuickLook.ts (a test checks it). */
export const AUDIO_EXTS = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "oga", "opus", "weba"]);
export const VIDEO_EXTS = new Set(["mp4", "m4v", "mov", "webm", "ogv"]);
export const SUBTITLE_EXTS = ["vtt", "srt"];
export const LYRIC_EXTS = ["lrc", "txt"];

const extOf = (name) => {
  const base = String(name).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
};
export const mediaKindOfName = (name) => (AUDIO_EXTS.has(extOf(name)) ? "audio" : VIDEO_EXTS.has(extOf(name)) ? "video" : null);

/** "3:07" or "1:02:03". Anything that isn't a time gives "0:00". */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** SubRip (.srt) to WebVTT, which is what a <track> needs. A file that is already WebVTT is returned as it is. */
export function srtToVtt(text) {
  const clean = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/^WEBVTT/.test(clean)) return clean;
  return `WEBVTT\n\n${clean.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------------------------------------------

const latin1 = (b) => Array.from(b, (c) => String.fromCharCode(c)).join("");
const utf8 = (b) => new TextDecoder("utf-8").decode(b);
const be32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const syncsafe = (b, i) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);

function decodeText(bytes, encoding) {
  if (encoding === 1 || encoding === 2) {
    let view = bytes;
    let label = encoding === 2 ? "utf-16be" : "utf-16le";
    if (view[0] === 0xff && view[1] === 0xfe) { view = view.subarray(2); label = "utf-16le"; }
    else if (view[0] === 0xfe && view[1] === 0xff) { view = view.subarray(2); label = "utf-16be"; }
    return new TextDecoder(label).decode(view).replace(/\0+$/, "");
  }
  return (encoding === 3 ? utf8(bytes) : latin1(bytes)).replace(/\0+$/, "");
}

/** Position of the end of a null-terminated string starting at `from` (two zero bytes for UTF-16), and the position after it. */
function terminator(bytes, from, encoding) {
  const wide = encoding === 1 || encoding === 2;
  for (let i = from; i < bytes.length - (wide ? 1 : 0); i += wide ? 2 : 1) {
    if (bytes[i] === 0 && (!wide || bytes[i + 1] === 0)) return [i, i + (wide ? 2 : 1)];
  }
  return [bytes.length, bytes.length];
}

const emptyTags = () => ({ title: "", artist: "", album: "", year: "", track: "", lyrics: "", cover: null });
const hasAny = (t) => !!(t.title || t.artist || t.album || t.year || t.track || t.lyrics || t.cover);

/** The tags of an MP3 (ID3v2.2, 2.3 and 2.4) from the start of the file, or null. */
export function parseId3(bytes) {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
  const version = bytes[3];
  if (version < 2 || version > 4) return null;
  const end = Math.min(bytes.length, 10 + syncsafe(bytes, 6));
  const tags = emptyTags();
  let pos = 10;
  if (version >= 3 && (bytes[5] & 0x40) && pos + 4 <= end) pos += version === 4 ? syncsafe(bytes, pos) : be32(bytes, pos) + 4; // an extended header
  const idLen = version === 2 ? 3 : 4;
  const hdr = version === 2 ? 6 : 10;
  while (pos + hdr <= end) {
    const id = latin1(bytes.subarray(pos, pos + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const size = version === 2 ? (bytes[pos + 3] << 16) | (bytes[pos + 4] << 8) | bytes[pos + 5] : version === 4 ? syncsafe(bytes, pos + 4) : be32(bytes, pos + 4);
    const body = bytes.subarray(pos + hdr, Math.min(end, pos + hdr + size));
    pos += hdr + size;
    if (size <= 0 || !body.length) continue;
    const text = () => decodeText(body.subarray(1), body[0]).split("\0")[0].trim();
    const lyrics = () => {
      const enc = body[0];
      const step = enc === 1 || enc === 2 ? 2 : 1;
      let end = body.length;
      for (let i = 4; i + step <= body.length; i += step) {
        if (body[i] === 0 && (step === 1 || body[i + 1] === 0)) { end = i + step; break; }
      }
      return decodeText(body.subarray(end), enc).trim().slice(0, 256 * 1024);
    };
    switch (id) {
      case "TIT2": case "TT2": tags.title = text(); break;
      case "TPE1": case "TP1": tags.artist = text(); break;
      case "TALB": case "TAL": tags.album = text(); break;
      case "TRCK": case "TRK": tags.track = text(); break;
      case "TDRC": case "TYER": case "TYE": tags.year = text().slice(0, 4); break;
      case "USLT": case "ULT": if (!tags.lyrics && body.length >= 4) tags.lyrics = lyrics(); break;
      case "APIC": case "PIC": {
        if (tags.cover) break;
        const enc = body[0];
        let mime;
        let at;
        if (id === "PIC") { mime = latin1(body.subarray(1, 4)).toLowerCase() === "png" ? "image/png" : "image/jpeg"; at = 4; }
        else { const [e, next] = terminator(body, 1, 0); mime = latin1(body.subarray(1, e)) || "image/jpeg"; at = next; }
        at += 1; // the picture type
        const [, afterDesc] = terminator(body, at, enc);
        if (afterDesc < body.length) tags.cover = { mime: mime.includes("/") ? mime : `image/${mime}`, data: body.slice(afterDesc) };
        break;
      }
    }
  }
  return hasAny(tags) ? tags : null;
}

/** Looks through the boxes of an MP4/M4A "moov" box for the iTunes style tags. */
export function parseMp4Tags(moov) {
  const tags = emptyTags();
  const boxes = (bytes, from, to, visit) => {
    let pos = from;
    while (pos + 8 <= to) {
      let size = be32(bytes, pos);
      const type = latin1(bytes.subarray(pos + 4, pos + 8));
      let head = 8;
      if (size === 1 && pos + 16 <= to) { size = be32(bytes, pos + 12); head = 16; } // 64-bit size: the low half is enough here
      if (size < head || pos + size > to) break;
      visit(type, pos + head, pos + size);
      pos += size;
    }
  };
  const dataOf = (from, to) => {
    let out = null;
    boxes(moov, from, to, (type, a, b) => { if (type === "data" && b - a >= 8) out = { flags: be32(moov, a) & 0xffffff, bytes: moov.subarray(a + 8, b) }; });
    return out;
  };
  const walk = (from, to) => boxes(moov, from, to, (type, a, b) => {
    if (type === "udta" || type === "ilst") walk(a, b);
    else if (type === "meta") walk(a + 4, b);
    else {
      const d = dataOf(a, b);
      if (!d) return;
      const text = () => utf8(d.bytes).trim();
      if (type === "\u00a9nam") tags.title = text();
      else if (type === "\u00a9ART" || type === "aART") tags.artist = tags.artist || text();
      else if (type === "\u00a9alb") tags.album = text();
      else if (type === "\u00a9day") tags.year = text().slice(0, 4);
      else if (type === "\u00a9lyr") tags.lyrics = text().slice(0, 256 * 1024);
      else if (type === "trkn" && d.bytes.length >= 4) tags.track = String((d.bytes[2] << 8) | d.bytes[3]);
      else if (type === "covr" && !tags.cover) tags.cover = { mime: d.flags === 14 ? "image/png" : "image/jpeg", data: d.bytes.slice() };
    }
  });
  walk(0, moov.length);
  return hasAny(tags) ? tags : null;
}

/** The tags of a FLAC file (Vorbis comments and the front cover) from the start of the file, or null. */
export function parseFlac(bytes) {
  if (bytes.length < 8 || latin1(bytes.subarray(0, 4)) !== "fLaC") return null;
  const tags = emptyTags();
  let pos = 4;
  while (pos + 4 <= bytes.length) {
    const last = (bytes[pos] & 0x80) !== 0;
    const type = bytes[pos] & 0x7f;
    const len = (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
    const body = bytes.subarray(pos + 4, pos + 4 + len);
    if (body.length < len) break;
    if (type === 4 && body.length >= 8) {
      let p = 4 + le32(body, 0);
      const count = p + 4 <= body.length ? le32(body, p) : 0;
      p += 4;
      for (let i = 0; i < count && p + 4 <= body.length; i++) {
        const n = le32(body, p);
        const line = utf8(body.subarray(p + 4, p + 4 + n));
        p += 4 + n;
        const eq = line.indexOf("=");
        if (eq < 1) continue;
        const key = line.slice(0, eq).toUpperCase();
        const value = line.slice(eq + 1).trim();
        if (key === "TITLE") tags.title = value;
        else if (key === "ARTIST") tags.artist = tags.artist || value;
        else if (key === "ALBUM") tags.album = value;
        else if (key === "DATE") tags.year = value.slice(0, 4);
        else if (key === "TRACKNUMBER") tags.track = value;
        else if (["LYRICS", "UNSYNCEDLYRICS", "SYNCEDLYRICS"].includes(key) && !tags.lyrics) tags.lyrics = value.slice(0, 256 * 1024);
      }
    } else if (type === 6 && body.length >= 32 && !tags.cover) {
      const mimeLen = be32(body, 4);
      const mime = latin1(body.subarray(8, 8 + mimeLen));
      let p = 8 + mimeLen;
      p += 4 + be32(body, p); // the description
      p += 16; // width, height, depth, colours
      const dataLen = be32(body, p);
      if (p + 4 + dataLen <= body.length) tags.cover = { mime: mime || "image/jpeg", data: body.slice(p + 4, p + 4 + dataLen) };
    }
    pos += 4 + len;
    if (last) break;
  }
  return hasAny(tags) ? tags : null;
}

/** Plain lyric/transcript text from SRT or WebVTT; timing lines and cue numbers are omitted. */
export function subtitleText(text) {
  return String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*(?:WEBVTT|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$)|\d+)\s*$/.test(line)
      && !/^\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s+-->/.test(line))
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Vorbis/Opus comments from the first Ogg audio packet, including lyrics fields. */
export function parseOggTags(bytes) {
  const tags = emptyTags();
  const find = (needle) => {
    const signature = new TextEncoder().encode(needle);
    outer: for (let i = 0; i <= bytes.length - signature.length; i++) {
      for (let j = 0; j < signature.length; j++) if (bytes[i + j] !== signature[j]) continue outer;
      return i + signature.length;
    }
    return -1;
  };
  let at = find("OpusTags");
  if (at < 0) at = find("\x03vorbis");
  if (at < 0 || at + 8 > bytes.length) return null;
  let pos = at;
  const vendorLength = le32(bytes, pos); pos += 4 + vendorLength;
  if (pos + 4 > bytes.length) return null;
  const count = Math.min(le32(bytes, pos), 300); pos += 4;
  for (let i = 0; i < count && pos + 4 <= bytes.length; i++) {
    const length = le32(bytes, pos); pos += 4;
    if (length > 256 * 1024 || pos + length > bytes.length) break;
    const comment = utf8(bytes.subarray(pos, pos + length)); pos += length;
    const eq = comment.indexOf("=");
    if (eq < 1) continue;
    const key = comment.slice(0, eq).toUpperCase();
    const value = comment.slice(eq + 1).trim();
    if (["LYRICS", "UNSYNCEDLYRICS", "SYNCEDLYRICS"].includes(key) && !tags.lyrics) tags.lyrics = value.slice(0, 256 * 1024);
    else if (key === "TITLE") tags.title = value;
    else if (key === "ARTIST") tags.artist ||= value;
    else if (key === "ALBUM") tags.album = value;
  }
  return hasAny(tags) ? tags : null;
}

// ---------------------------------------------------------------------------------------------------------------
// The play queue
// ---------------------------------------------------------------------------------------------------------------

/** Which item plays next and before, with shuffle (every item once before any repeats) and repeat off / all / one. */
export class PlayQueue {
  constructor(count, start = 0, random = Math.random) {
    this.count = count;
    this.random = random;
    this.shuffle = false;
    this.repeat = "off";
    this.order = Array.from({ length: count }, (_, i) => i);
    this.pos = Math.max(0, Math.min(count - 1, start));
  }

  get index() { return this.order[this.pos] ?? 0; }

  shuffled(first) {
    const rest = Array.from({ length: this.count }, (_, i) => i).filter((i) => i !== first);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return first === undefined ? rest : [first, ...rest];
  }

  setShuffle(on) {
    const current = this.index;
    this.shuffle = !!on;
    this.order = on ? this.shuffled(current) : Array.from({ length: this.count }, (_, i) => i);
    this.pos = on ? 0 : current;
  }

  setRepeat(mode) { this.repeat = mode === "all" || mode === "one" ? mode : "off"; }

  cycleRepeat() {
    this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
    return this.repeat;
  }

  /** The item to play when the current one ended (`auto`) or the person pressed Next. null: nothing more to play. */
  next(auto = false) {
    if (!this.count) return null;
    if (auto && this.repeat === "one") return this.index;
    if (this.pos + 1 < this.count) { this.pos++; return this.index; }
    if (this.repeat === "all" || (!auto && this.count > 1)) {
      this.pos = 0;
      if (this.shuffle) this.order = this.shuffled(this.shuffle ? this.order[this.count - 1] : undefined).slice();
      return this.index;
    }
    return null;
  }

  /** Previous: past the first few seconds it restarts the current item (`{ restart: true }`), as every player does. */
  prev(secondsIn = 0) {
    if (secondsIn > 3 || this.pos === 0 && this.repeat !== "all") return { restart: true, index: this.index };
    this.pos = this.pos === 0 ? this.count - 1 : this.pos - 1;
    return { restart: false, index: this.index };
  }

  jumpTo(itemIndex) {
    const at = this.order.indexOf(itemIndex);
    if (at >= 0) this.pos = at;
    return this.index;
  }
}

/** Equaliser presets: gain in decibels for each of the ten bands in EQ_BANDS. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass boost": [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  "Treble boost": [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  Vocal: [-2, -2, -1, 1, 3, 3, 2, 0, -1, -2],
  Rock: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
  Pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  Classical: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  "Late night": [-4, -2, 0, 1, 2, 2, 1, 0, -1, -3],
};
export const clampGain = (db) => Math.max(-12, Math.min(12, Math.round(Number(db) || 0)));
