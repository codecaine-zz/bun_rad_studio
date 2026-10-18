// The player's brain, with no page dependencies (so it is tested on its own): reading the tags inside music files, turning
// subtitle files into the form a <video> understands, clock text, which kinds of file play, and the play queue.

/** The file endings the built-in player takes. They must match AUDIO_MIME and VIDEO_MIME in fmQuickLook.ts (a test checks it). */
export const AUDIO_EXTS = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "oga", "opus", "weba"]);
export const VIDEO_EXTS = new Set(["mp4", "m4v", "mov", "webm", "ogv"]);
export const PLAYLIST_EXTS = new Set(["m3u", "m3u8"]);
export const SUBTITLE_EXTS = ["vtt", "srt"];
export const LYRIC_EXTS = ["lrc", "txt"];

const extOf = (name) => {
  const base = String(name).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
};
export const mediaKindOfName = (name) => (AUDIO_EXTS.has(extOf(name)) ? "audio" : VIDEO_EXTS.has(extOf(name)) ? "video" : null);
export const isPlaylistFile = (name) => PLAYLIST_EXTS.has(extOf(name));
export const isPlayableOrPlaylist = (name) => !!mediaKindOfName(name) || isPlaylistFile(name);

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
      p += 16; // width, height, depth, colors
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

/** Equalizer presets: gain in decibels for each of the ten bands in EQ_BANDS (32 classic & studio presets). */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass boost": [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  "Treble boost": [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  "Full Bass & Treble": [5, 4, 0, -4, -3, 1, 5, 7, 8, 8],
  "Full Bass": [7, 7, 7, 4, 1, -2, -5, -6, -7, -7],
  "Full Treble": [-6, -6, -6, -2, 2, 7, 10, 10, 10, 11],
  "Loudness (V-Curve)": [8, 6, 3, 0, -2, -2, 0, 3, 6, 8],
  Vocal: [-2, -2, -1, 1, 3, 3, 2, 0, -1, -2],
  Rock: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
  Pop: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
  Classical: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  Club: [0, 0, 5, 3, 3, 3, 2, 0, 0, 0],
  Dance: [6, 4, 1, 0, 0, -3, -4, -4, 0, 0],
  Headphones: [3, 7, 3, -2, -1, 1, 3, 6, 8, 9],
  "Laptop Speakers": [3, 7, 3, -2, -1, 1, 3, 6, 8, 9],
  "Large Hall": [6, 6, 3, 3, 0, -3, -3, -3, 0, 0],
  Live: [-3, 0, 2, 3, 3, 3, 2, 1, 1, 1],
  Party: [4, 4, 0, 0, 0, 0, 0, 0, 4, 4],
  Reggae: [0, 0, 0, -3, 0, 4, 4, 0, 0, 0],
  Ska: [-1, -3, -2, 0, 2, 3, 5, 6, 7, 6],
  Soft: [3, 1, 0, -1, 0, 2, 5, 6, 7, 8],
  "Soft Rock": [2, 2, 1, 0, -2, -3, -2, 0, 1, 5],
  Techno: [5, 3, 0, -3, -3, 0, 5, 6, 6, 5],
  "Electronic / EDM": [6, 5, 1, 0, -2, 2, 1, 2, 6, 7],
  "Hip-Hop / Trap": [7, 6, 2, 3, -1, -1, 2, -1, 3, 4],
  "R&B / Soul": [3, 7, 6, 1, -2, -1, 2, 3, 3, 4],
  Jazz: [4, 3, 1, 2, -2, -2, 0, 2, 3, 4],
  Acoustic: [5, 5, 3, 1, 2, 2, 3, 4, 3, 2],
  "Metal / Heavy": [6, 5, 0, -4, -2, 0, 4, 6, 7, 6],
  "Podcast / Voice": [-5, -4, -2, 2, 4, 5, 4, 2, -1, -3],
  "Cinema / Sub": [8, 7, 4, 1, -1, 1, 3, 5, 6, 5],
  "Late night": [-4, -2, 0, 1, 2, 2, 1, 0, -1, -3],
};
export const clampGain = (db) => Math.max(-12, Math.min(12, Math.round(Number(db) || 0)));
export const clampBalance = (pan) => Math.max(-100, Math.min(100, Math.round(Number(pan) || 0)));

/** Visual themes for the Media Deck and Quick Look player (16 world-class studio skins). */
export const PLAYER_SKINS = [
  { id: "classic", label: "Classic 90s Rack", accent: "#00ff41", accent2: "#38bdf8", accent3: "#facc15" },
  { id: "modern", label: "Modern Bento Glass", accent: "#38bdf8", accent2: "#818cf8", accent3: "#f472b6" },
  { id: "cyberpunk", label: "Cyberpunk Neon", accent: "#00f5ff", accent2: "#ff007f", accent3: "#fde047" },
  { id: "amber", label: "Retro Hi-Fi Tube", accent: "#f59e0b", accent2: "#ef4444", accent3: "#fde68a" },
  { id: "theme", label: "Match App Theme", accent: "#60a5fa", accent2: "#34d399", accent3: "#f472b6" },
  { id: "outrun", label: "Synthwave Outrun 1984", accent: "#ff2a85", accent2: "#00f0ff", accent3: "#facc15" },
  { id: "dracula", label: "Dracula Midnight Studio", accent: "#bd93f9", accent2: "#ff79c6", accent3: "#50fa7b" },
  { id: "nord", label: "Nordic Frost Mastering", accent: "#88c0d0", accent2: "#81a1c1", accent3: "#a3be8c" },
  { id: "tokyo_night", label: "Tokyo Night Shibuya", accent: "#7aa2f7", accent2: "#bb9af7", accent3: "#7dcfff" },
  { id: "emerald_matrix", label: "Matrix Bio-Phosphor", accent: "#10b981", accent2: "#34d399", accent3: "#a7f3d0" },
  { id: "gold_mastering", label: "24K Gold Mastering Console", accent: "#eab308", accent2: "#f59e0b", accent3: "#fef08a" },
  { id: "liquid_metal", label: "Apple Pro Titanium", accent: "#cbd5e1", accent2: "#38bdf8", accent3: "#94a3b8" },
  { id: "crimson_valve", label: "Crimson Warm Valve", accent: "#f43f5e", accent2: "#fb923c", accent3: "#fda4af" },
  { id: "arctic_glass", label: "Arctic Daylight Glass", accent: "#0284c7", accent2: "#6366f1", accent3: "#0ea5e9" },
  { id: "amiga_workbench", label: "Retro Amiga Protracker", accent: "#ff8800", accent2: "#60a5fa", accent3: "#ffffff" },
  { id: "hologram_prism", label: "Aurora Hologram Prism", accent: "#2dd4bf", accent2: "#c084fc", accent3: "#f472b6" },
];

/** Hardware graphics performance tiers for the Media Deck Visualizer & Atmospheric FX engine. */
export const DECK_HARDWARE_TIERS = [
  { id: "auto", label: "Auto-Detect Hardware", badge: "Smart", desc: "Detects Apple Silicon / ARM / high-core GPU automatically" },
  { id: "low", label: "Low Graphics (Eco 30fps)", badge: "Battery Saver", desc: "Crisp lightweight analyzers for older or integrated GPUs" },
  { id: "medium", label: "Medium Graphics (Balanced 60fps)", badge: "Balanced", desc: "Multi-layer neon ribbons, 3D grids, and particle fields" },
  { id: "high", label: "High-End Desktop GPU", badge: "High", desc: "Rich multi-harmonic shaders, reflections, and dense particle physics" },
  { id: "ultra", label: "Modern ARM / Apple M-Series Ultra", badge: "ARM Ultra", desc: "Out-of-this-world 120fps-class raymarched & atmospheric stage effects" },
];

/** Detects recommended Media Deck graphics tier on the active machine. */
export function detectDeckHardwareTier() {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const cores = Number(nav?.hardwareConcurrency || 8);
    const ua = String(nav?.userAgent || "");
    const isAppleSilicon = /Macintosh|Mac OS X/i.test(ua) && cores >= 8;
    if (isAppleSilicon || cores >= 10) return "ultra";
    if (cores >= 6) return "high";
    if (cores >= 4) return "medium";
    return "low";
  } catch {
    return "ultra";
  }
}

/** Category filter pills for the 108 Media Deck Visualizers & Atmospheric Stage Effects. */
export const VIZ_CATEGORIES = [
  { id: "all", label: "All (108)", icon: "✨" },
  { id: "spectrum", label: "Spectrum & VU", icon: "📊" },
  { id: "wave", label: "Oscilloscopes", icon: "〰️" },
  { id: "synth", label: "Synth & Retro", icon: "🌆" },
  { id: "cosmic", label: "Cosmic & Space", icon: "🌌" },
  { id: "cyber", label: "Cyber & Matrix", icon: "⚡" },
  { id: "nature", label: "Weather & Nature", icon: "🌧️" },
  { id: "thermal", label: "Fire & Plasma", icon: "🔥" },
  { id: "geometry", label: "Sacred & 3D", icon: "🔮" },
];

/**
 * 108 Real-Time Audio Visualizers & Atmospheric Stage Effects for the Media Deck.
 * Grouped across Low Graphics, Medium Graphics, and Modern ARM / High-End Ultra tiers.
 * Notice the first 20 IDs preserve exact backward compatibility with existing presets & tests.
 */
export const VIZ_MODES = [
  // ── Core 20 Classic & Pro Modes (preserved in exact index order 0..19) ──
  { id: "spectrum", label: "Spectrum + Peak Caps", tier: "low", cat: "spectrum", icon: "📊", badge: "Classic", desc: "56-band studio spectrum analyzer with falling peak-hold caps", archetype: "core", depth: 3 },
  { id: "oscilloscope", label: "Stereo Oscilloscope", tier: "low", cat: "wave", icon: "〰️", badge: "CRT", desc: "Dual-trace stereo phosphor oscilloscope with studio graticule", archetype: "core", depth: 2 },
  { id: "milkdrop", label: "Cyber-Tunnel Radial", tier: "medium", cat: "cyber", icon: "🌀", badge: "Milkdrop", desc: "Radial cyber-tunnel spokes with bass-reactive shockwave rings", archetype: "core", depth: 2 },
  { id: "vu", label: "Studio Bar VU + Peak", tier: "low", cat: "spectrum", icon: "🎚️", badge: "Broadcast", desc: "Dual L/R segmented broadcast LED bar meters with peak hold", archetype: "core", depth: 3 },
  { id: "led_matrix", label: "Hi-Fi LED Dot Matrix", tier: "low", cat: "spectrum", icon: "🟩", badge: "Hi-Fi", desc: "36x14 dot-matrix LED wall with floating peak indicators", archetype: "core", depth: 3 },
  { id: "analog_vu", label: "Warm Analog Needle VU", tier: "low", cat: "spectrum", icon: "🧭", badge: "Tube", desc: "Twin warm backlit analog ballistic needle VU dials with clip LEDs", archetype: "core", depth: 3 },
  { id: "synthwave", label: "Outrun Synthwave Grid", tier: "medium", cat: "synth", icon: "🌆", badge: "1984", desc: "80s laser sunset, audio-reactive mountain range, and 3D perspective floor", archetype: "core", depth: 1 },
  { id: "matrix", label: "Matrix Digital Rain", tier: "medium", cat: "cyber", icon: "💻", badge: "Cyber", desc: "Cascading bio-phosphor katakana & hex glyph streams synced to FFT", archetype: "core", depth: 1 },
  { id: "starfield", label: "3D Warp Starfield", tier: "low", cat: "cosmic", icon: "🌠", badge: "3D Warp", desc: "Hyperspace starfield with bass-driven warp speed and gold novas", archetype: "core", depth: 1 },
  { id: "pulsar", label: "Pulsar Stacked Ridges", tier: "medium", cat: "wave", icon: "🏔️", badge: "CP-1919", desc: "Stacked radio-pulsar elevation ridges inspired by Unknown Pleasures", archetype: "core", depth: 2 },
  { id: "dna", label: "3D DNA Double Helix", tier: "medium", cat: "geometry", icon: "🧬", badge: "Helix", desc: "Rotating double-helix nucleotide base pairs modulated by frequencies", archetype: "core", depth: 2 },
  { id: "plasma", label: "Neon Plasma Ribbon", tier: "medium", cat: "thermal", icon: "🌈", badge: "Aurora", desc: "Four-band harmonic aurora plasma ribbons dancing across the stage", archetype: "core", depth: 2 },
  { id: "particles", label: "Bass Nova Constellation", tier: "medium", cat: "cosmic", icon: "✨", badge: "Web", desc: "Orbital particle constellation connected by bass-reactive filaments", archetype: "core", depth: 1 },
  { id: "lissajous", label: "XY Stereo Vectorscope", tier: "low", cat: "wave", icon: "➰", badge: "Phase", desc: "Mastering-grade XY Lissajous stereo phase vectorscope", archetype: "core", depth: 2 },
  { id: "fire", label: "Inferno Spectrum Flame", tier: "medium", cat: "thermal", icon: "🔥", badge: "Pyro", desc: "Audio-driven inferno flames with rising golden ember sparks", archetype: "core", depth: 1 },
  { id: "kaleidoscope", label: "Sacred Geometry Mandala", tier: "ultra", cat: "geometry", icon: "🔮", badge: "8-Fold", desc: "8-fold symmetrical mandala petals expanding with harmonic energy", archetype: "core", depth: 2 },
  { id: "mirror_bars", label: "Mirrored Club Analyzer", tier: "low", cat: "spectrum", icon: "🪩", badge: "Club", desc: "Symmetric dual-horizon festival analyzer with wet reflection", archetype: "core", depth: 3 },
  { id: "spectrogram", label: "Thermal Waterfall Band", tier: "medium", cat: "thermal", icon: "🌡️", badge: "Heatmap", desc: "Scrolling HSL thermal waterfall spectrogram across 18 frequency bands", archetype: "core", depth: 1 },
  { id: "blackhole", label: "Event Horizon Vortex", tier: "ultra", cat: "cosmic", icon: "🕳️", badge: "Relativistic", desc: "Relativistic accretion disk spiraling into a bass-pulsing singularity", archetype: "core", depth: 1 },
  { id: "cyber_city", label: "Neon Cyber Skyline", tier: "medium", cat: "cyber", icon: "🏙️", badge: "Night City", desc: "Equalizer skyscrapers with lit windows and wet neon street reflections", archetype: "core", depth: 1 },

  // ── LOW GRAPHICS TIER: Crisp, Eco-Friendly Studio Analyzers & Weather (22 more = 30 Low total) ──
  { id: "sub_bar_analyzer", label: "Sub-Bass 16-Band Bricks", tier: "low", cat: "spectrum", icon: "🧱", badge: "Eco", desc: "Chunky 16-band sub-bass brick analyzer with crisp white peak caps", archetype: "bars", depth: 3, params: { count: 16, style: "brick", color1: "#22c55e", color2: "#eab308" } },
  { id: "fine_128_spectrum", label: "128-Band Mastering Hairlines", tier: "low", cat: "spectrum", icon: "📏", badge: "Precision", desc: "Ultra-fine 128-line mastering FFT spectrum with floating peak dots", archetype: "bars", depth: 3, params: { count: 96, style: "hairline", color1: "#38bdf8", color2: "#f472b6" } },
  { id: "oct_band_iso", label: "ISO 1/3 Octave Analyzer", tier: "low", cat: "spectrum", icon: "🎛️", badge: "Studio", desc: "Calibrated 31-band ISO studio graphic analyzer with dB grid", archetype: "bars", depth: 3, params: { count: 31, style: "segmented", color1: "#10b981", color2: "#f59e0b" } },
  { id: "twin_horizon_bars", label: "Twin Horizon Split Bars", tier: "low", cat: "spectrum", icon: "⚖️", badge: "Stereo", desc: "Left channel top-down, Right channel bottom-up split spectrum", archetype: "bars", depth: 3, params: { count: 44, style: "split", color1: "#06b6d4", color2: "#ec4899" } },
  { id: "diamond_stem_bars", label: "Diamond Stem Lollipops", tier: "low", cat: "spectrum", icon: "📍", badge: "Discrete", desc: "Discrete stem-and-diamond FFT sample pins with zero GPU fill overhead", archetype: "bars", depth: 3, params: { count: 40, style: "lollipop", color1: "#a855f7", color2: "#38bdf8" } },
  { id: "amber_vfd_bars", label: "1980s Vacuum Fluorescent VFD", tier: "low", cat: "synth", icon: "📟", badge: "Hi-Fi VFD", desc: "Teal and amber Japanese cassette deck VFD vacuum fluorescent bars", archetype: "bars", depth: 3, params: { count: 28, style: "segmented", color1: "#2dd4bf", color2: "#fb923c" } },
  { id: "phosphor_green_crt", label: "P1 Green Vector Scope", tier: "low", cat: "wave", icon: "🟢", badge: "Tektronix", desc: "Single-beam P1 green laboratory oscilloscope with persistence grid", archetype: "wave", depth: 2, params: { lines: 1, fill: false, color1: "#22c55e", color2: "#86efac", freq: 1.5 } },
  { id: "amber_tube_scope", label: "Warm Valve Filament Wave", tier: "low", cat: "wave", icon: "🟠", badge: "Tube", desc: "Warm amber vacuum-tube audio waveform with soft harmonic glow", archetype: "wave", depth: 2, params: { lines: 2, fill: true, color1: "#f59e0b", color2: "#fde68a", freq: 2.0 } },
  { id: "stepped_bitcrush_wave", label: "8-Bit Chiptune Quantized Wave", tier: "low", cat: "synth", icon: "👾", badge: "8-Bit", desc: "Staircase-quantized NES/GameBoy pulse waveform reacting to transients", archetype: "wave", depth: 2, params: { lines: 2, stepped: true, color1: "#ec4899", color2: "#38bdf8", freq: 3.0 } },
  { id: "dual_mirror_wave", label: "Symmetric Ribbon Envelope", tier: "low", cat: "wave", icon: "🎗️", badge: "Envelope", desc: "Filled symmetric top-and-bottom waveform envelope with peak outline", archetype: "wave", depth: 2, params: { lines: 2, mirror: true, fill: true, color1: "#6366f1", color2: "#22d3ee", freq: 1.8 } },
  { id: "gentle_rain_stage", label: "Lo-Fi Midnight Raindrops", tier: "low", cat: "nature", icon: "🌧️", badge: "Chill", desc: "Calming angled midnight rain streaks that speed up with the beat", archetype: "weather", depth: 1, params: { kind: "rain", count: 42, color1: "#38bdf8", color2: "#94a3b8", angle: 0.16 } },
  { id: "soft_snow_drift", label: "Arctic Snowfall Drift", tier: "low", cat: "nature", icon: "❄️", badge: "Winter", desc: "Gentle crystalline snowflakes drifting with midrange audio currents", archetype: "weather", depth: 1, params: { kind: "snow", count: 38, color1: "#f8fafc", color2: "#bae6fd", angle: 0.08 } },
  { id: "golden_fireflies", label: "Summer Meadow Fireflies", tier: "low", cat: "nature", icon: "🪲", badge: "Ambient", desc: "Warm bioluminescent fireflies pulsing to vocal and acoustic frequencies", archetype: "weather", depth: 1, params: { kind: "fireflies", count: 28, color1: "#facc15", color2: "#84cc16" } },
  { id: "sakura_petal_breeze", label: "Kyoto Sakura Petal Wind", tier: "low", cat: "nature", icon: "🌸", badge: "Zen", desc: "Pink cherry blossom petals swirling across the deck with the melody", archetype: "weather", depth: 1, params: { kind: "petals", count: 30, color1: "#f472b6", color2: "#fbcfe8" } },
  { id: "bamboo_wind_zen", label: "Zen Bamboo Sway", tier: "low", cat: "nature", icon: "🎋", badge: "Minimal", desc: "Minimalist emerald bamboo stalks swaying in rhythm with bass waves", archetype: "bars", depth: 1, params: { count: 18, style: "bamboo", color1: "#10b981", color2: "#a7f3d0" } },
  { id: "binary_pulse_stream", label: "Binary 0/1 Data Bus", tier: "low", cat: "cyber", icon: "0️⃣", badge: "Logic", desc: "Crisp horizontal logic-analyzer 0/1 bit streams clocked by audio peaks", archetype: "matrix", depth: 1, params: { glyphs: "01", cols: 28, color1: "#22d3ee", color2: "#38bdf8" } },
  { id: "morse_beacon_grid", label: "Subspace Morse Telemetry", tier: "low", cat: "cyber", icon: "📡", badge: "Signal", desc: "Pulsing dash-dot telemetry beacons across frequency channels", archetype: "matrix", depth: 1, params: { glyphs: "·−=", cols: 24, color1: "#f59e0b", color2: "#fef08a" } },
  { id: "minimal_halo_ring", label: "Zenith Halo Ring", tier: "low", cat: "geometry", icon: "⭕", badge: "Pure", desc: "Clean breathing concentric halo rings driven by bass, mids, and treble", archetype: "radial", depth: 2, params: { spokes: 36, rings: 4, style: "halo", color1: "#38bdf8", color2: "#818cf8" } },
  { id: "radar_sweep_scope", label: "Sonar Carrier Sweep", tier: "low", cat: "cyber", icon: "🧭", badge: "Sonar", desc: "Rotating naval sonar sweep revealing frequency ping targets", archetype: "radial", depth: 2, params: { spokes: 40, rings: 3, style: "radar", color1: "#10b981", color2: "#34d399" } },
  { id: "vinyl_groove_spin", label: "Spinning 12-Inch Vinyl Grooves", tier: "low", cat: "synth", icon: "💿", badge: "Turntable", desc: "Concentric micro-grooves modulated by real-time audio amplitude", archetype: "radial", depth: 2, params: { spokes: 32, rings: 7, style: "vinyl", color1: "#f43f5e", color2: "#facc15" } },
  { id: "cassette_reel_spin", label: "Twin Studio Tape Reels", tier: "low", cat: "synth", icon: "📼", badge: "Analog", desc: "Dual rotating magnetic tape reels with dynamic tension ribbon", archetype: "vumeter", depth: 2, params: { variant: "reels", color1: "#f97316", color2: "#fde047" } },
  { id: "stereo_phase_cross", label: "Mastering Phase Crosshair", tier: "low", cat: "spectrum", icon: "➕", badge: "Mastering", desc: "L/R correlation balance meter with dynamic stereo width diamond", archetype: "vumeter", depth: 3, params: { variant: "crosshair", color1: "#22c55e", color2: "#38bdf8" } },

  // ── MEDIUM GRAPHICS TIER: Rich Multi-Layer Ribbons, Storms, Horizons & Grids (36 more) ──
  { id: "thunderstorm_stage", label: "Electric Thunderstorm & Sheet Lightning", tier: "medium", cat: "nature", icon: "⛈️", badge: "Storm", desc: "Heavy rain sheets with bass-triggered forked lightning bolts across the deck", archetype: "weather", depth: 1, params: { kind: "storm", count: 64, lightning: true, color1: "#60a5fa", color2: "#e0f2fe" } },
  { id: "blizzard_whiteout", label: "Sub-Zero Gale Blizzard", tier: "medium", cat: "nature", icon: "🌨️", badge: "Gale", desc: "High-velocity whipping snow squalls with icy Frost-glass gusts", archetype: "weather", depth: 1, params: { kind: "snow", count: 72, angle: 0.42, color1: "#e0f2fe", color2: "#38bdf8" } },
  { id: "velvet_smoke_stage", label: "Stage Dry-Ice Smoke Plumes", tier: "medium", cat: "nature", icon: "💨", badge: "Stage FX", desc: "Billowing concert dry-ice smoke clouds illuminated by bass spotlights", archetype: "nebula", depth: 1, params: { clouds: 14, color1: "#94a3b8", color2: "#38bdf8", smoke: true } },
  { id: "cyber_smog_haze", label: "Blade Runner Acid Fog", tier: "medium", cat: "cyber", icon: "🌫️", badge: "2049", desc: "Amber and cyan dystopian smog layers drifting through neon laser beams", archetype: "nebula", depth: 1, params: { clouds: 16, color1: "#f59e0b", color2: "#06b6d4", smoke: true } },
  { id: "northern_lights_borealis", label: "Arctic Aurora Borealis Curtains", tier: "medium", cat: "nature", icon: "🌌", badge: "Borealis", desc: "Shimmering emerald and violet geomagnetic curtains rippled by harmonics", archetype: "wave", depth: 1, params: { lines: 5, fill: true, aurora: true, color1: "#10b981", color2: "#a855f7", freq: 2.4 } },
  { id: "bioluminescent_ocean", label: "Deep Sea Bioluminescent Plankton", tier: "medium", cat: "nature", icon: "🪼", badge: "Abyssal", desc: "Glowing cyan and magenta abyssal organisms surging with sub-bass tides", archetype: "weather", depth: 1, params: { kind: "fireflies", count: 56, color1: "#00f5ff", color2: "#ec4899" } },
  { id: "autumn_amber_gust", label: "Autumn Maple Wind Gust", tier: "medium", cat: "nature", icon: "🍁", badge: "Seasonal", desc: "Swirling crimson and gold autumn leaves caught in audio whirlwinds", archetype: "weather", depth: 1, params: { kind: "petals", count: 48, color1: "#f97316", color2: "#ef4444" } },
  { id: "desert_sandstorm_dunes", label: "Arrakis Spice Sandstorm", tier: "medium", cat: "nature", icon: "🏜️", badge: "Dune", desc: "Shifting golden desert dunes with cinnamon spice particles glowing on peaks", archetype: "horizon", depth: 1, params: { variant: "dunes", color1: "#f59e0b", color2: "#ea580c" } },
  { id: "miami_vice_palm_sunset", label: "1986 Vice Sunset & Palms", tier: "medium", cat: "synth", icon: "🌴", badge: "Vice", desc: "Magenta-orange striped sun with ocean waves and synth-reactive horizon", archetype: "horizon", depth: 1, params: { variant: "ocean_sun", color1: "#ec4899", color2: "#06b6d4" } },
  { id: "cyber_highway_chase", label: "Testarossa Night Highway", tier: "medium", cat: "synth", icon: "🏎️", badge: "Turbo", desc: "High-speed perspective road markings and neon streetlamps rushing past", archetype: "horizon", depth: 1, params: { variant: "highway", color1: "#ff007f", color2: "#00f5ff" } },
  { id: "wireframe_canyon_flight", label: "Vector Trench Run", tier: "medium", cat: "synth", icon: "⛰️", badge: "Vector", desc: "Dual-wall 3D vector canyon corridor narrowing and flaring with the beat", archetype: "horizon", depth: 1, params: { variant: "canyon", color1: "#22d3ee", color2: "#a855f7" } },
  { id: "arctic_glacier_peaks", label: "Crystalline Iceberg Horizon", tier: "medium", cat: "nature", icon: "🏔️", badge: "Glacier", desc: "Jagged translucent iceberg peaks reflecting aurora sky and water ripples", archetype: "horizon", depth: 1, params: { variant: "glacier", color1: "#38bdf8", color2: "#e0f2fe" } },
  { id: "volcanic_magma_ridge", label: "Tectonic Magma Fissure", tier: "medium", cat: "thermal", icon: "🌋", badge: "Magma", desc: "Cracked obsidian mountain range with glowing lava rivers pulsing to bass", archetype: "horizon", depth: 1, params: { variant: "volcano", color1: "#ef4444", color2: "#facc15" } },
  { id: "tokyo_shibuya_skyline", label: "Shibuya Crossing Neon Towers", tier: "medium", cat: "cyber", icon: "🗼", badge: "Tokyo", desc: "Dense cyberpunk megacity skyline with vertical hologram billboards", archetype: "horizon", depth: 1, params: { variant: "megacity", color1: "#7aa2f7", color2: "#ff79c6" } },
  { id: "hex_honeycomb_shield", label: "Hexagonal Forcefield Matrix", tier: "medium", cat: "cyber", icon: "🐝", badge: "Hex", desc: "Reactive hexagonal energy cells lighting up across the frequency spectrum", archetype: "geometry", depth: 2, params: { shape: "hex_grid", count: 28, color1: "#00f5ff", color2: "#3b82f6" } },
  { id: "circuit_pcb_traces", label: "Motherboard Gold Bus Traces", tier: "medium", cat: "cyber", icon: "🔌", badge: "PCB", desc: "High-speed data packets racing along 45-degree gold motherboard traces", archetype: "geometry", depth: 1, params: { shape: "circuit", count: 24, color1: "#10b981", color2: "#facc15" } },
  { id: "neural_synapse_mesh", label: "Cortical Neural Firing", tier: "medium", cat: "cyber", icon: "🧠", badge: "AI Mesh", desc: "Action-potential impulses jumping across interconnected neural dendrites", archetype: "geometry", depth: 2, params: { shape: "neural", count: 32, color1: "#c084fc", color2: "#38bdf8" } },
  { id: "hud_fighter_avionics", label: "F-22 Tactical Pitch Ladder HUD", tier: "medium", cat: "cyber", icon: "🎯", badge: "Avionics", desc: "Military head-up display with pitch ladder, target lock, and G-force meters", archetype: "vumeter", depth: 3, params: { variant: "hud", color1: "#22c55e", color2: "#facc15" } },
  { id: "katakana_crimson_rain", label: "Redwall Ghost Protocol Rain", tier: "medium", cat: "cyber", icon: "🈴", badge: "Netrunner", desc: "High-alert crimson & gold rogue AI glyph cascade reactive to transients", archetype: "matrix", depth: 1, params: { glyphs: "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ019", cols: 38, color1: "#f43f5e", color2: "#facc15" } },
  { id: "cyber_hex_dump", label: "Kernel Memory Hex Dump", tier: "medium", cat: "cyber", icon: "🔢", badge: "0xFF", desc: "Streaming hexadecimal memory words highlighted by real-time FFT bins", archetype: "matrix", depth: 1, params: { glyphs: "0123456789ABCDEF", cols: 34, color1: "#38bdf8", color2: "#a855f7" } },
  { id: "radial_sunburst_eq", label: "360° Solar Flare Equalizer", tier: "medium", cat: "spectrum", icon: "☀️", badge: "360°", desc: "Circular 64-bar radial equalizer radiating from a bass-pulsing sun core", archetype: "radial", depth: 2, params: { spokes: 64, rings: 2, style: "bars", color1: "#f59e0b", color2: "#ef4444" } },
  { id: "turbine_jet_afterburner", label: "Jet Engine Afterburner Ring", tier: "medium", cat: "thermal", icon: "🚀", badge: "Mach 3", desc: "Spinning titanium turbine blades with blue-orange shock-diamond exhaust", archetype: "radial", depth: 2, params: { spokes: 48, rings: 4, style: "turbine", color1: "#38bdf8", color2: "#f97316" } },
  { id: "harmonic_flower_petals", label: "Polar Rose Harmonic Bloom", tier: "medium", cat: "geometry", icon: "🌺", badge: "Rhodonea", desc: "Mathematical rhodonea polar rose curves blooming with musical chords", archetype: "radial", depth: 2, params: { spokes: 72, rings: 5, style: "rose", color1: "#ec4899", color2: "#a855f7" } },
  { id: "dual_turntable_battle", label: "DJ Scratch Battle Decks", tier: "medium", cat: "synth", icon: "🎧", badge: "DJ Pro", desc: "Twin spinning DJ platters with crossfader energy arc and beat markers", archetype: "vumeter", depth: 2, params: { variant: "dj_decks", color1: "#00f5ff", color2: "#ff007f" } },
  { id: "mcintosh_blue_meters", label: "Audiophile Blue Glass Wattmeters", tier: "medium", cat: "spectrum", icon: "💎", badge: "Audiophile", desc: "Iconic sapphire-blue backlit audiophile power-output needle meters", archetype: "vumeter", depth: 3, params: { variant: "blue_vu", color1: "#38bdf8", color2: "#e0f2fe" } },
  { id: "nixie_tube_spectrum", label: "Soviet IN-13 Nixie Plasma Columns", tier: "medium", cat: "thermal", icon: "🧪", badge: "Nixie", desc: "Warm neon-orange gas-discharge glass columns glowing with audio voltage", archetype: "bars", depth: 3, params: { count: 24, style: "nixie", color1: "#f97316", color2: "#fde047" } },
  { id: "laser_club_show", label: "Ibiza Festival Laser Fan", tier: "medium", cat: "synth", icon: "🔦", badge: "Rave", desc: "Sweeping emerald, cyan, and magenta festival laser beams cutting through haze", archetype: "radial", depth: 2, params: { spokes: 28, rings: 1, style: "lasers", color1: "#00ff41", color2: "#ff007f" } },
  { id: "seismic_richterscale", label: "Seismograph Sub-Bass Drum Chart", tier: "medium", cat: "wave", icon: "📈", badge: "Tremor", desc: "Multi-needle geological seismograph needles scratching P-wave bass tremors", archetype: "wave", depth: 2, params: { lines: 4, fill: false, color1: "#ef4444", color2: "#facc15", freq: 4.2 } },
  { id: "ecg_cardiac_pulse", label: "Bio-Monitor Cardiac Telemetry", tier: "medium", cat: "wave", icon: "💓", badge: "Vital", desc: "High-contrast ICU cardiac waveform spiking on kick-drum heartbeats", archetype: "wave", depth: 2, params: { lines: 2, fill: false, color1: "#10b981", color2: "#f43f5e", freq: 3.5 } },
  { id: "ocean_tidal_swell", label: "Pacific Midnight Swell", tier: "medium", cat: "nature", icon: "🌊", badge: "Tidal", desc: "Layered translucent ocean swells with cresting whitecap foam on high hats", archetype: "wave", depth: 1, params: { lines: 5, fill: true, color1: "#0284c7", color2: "#38bdf8", freq: 1.6 } },
  { id: "prism_rainbow_bars", label: "Dark Side Spectral Prism", tier: "medium", cat: "spectrum", icon: "🌈", badge: "Optical", desc: "Full-spectrum dispersive rainbow analyzer bars with specular highlights", archetype: "bars", depth: 3, params: { count: 52, style: "rainbow", color1: "#ff007f", color2: "#00f5ff" } },
  { id: "floating_lanterns", label: "Chiang Mai Sky Lanterns", tier: "medium", cat: "thermal", icon: "🏮", badge: "Warm", desc: "Hundreds of glowing paper lanterns ascending into the night sky with the melody", archetype: "weather", depth: 1, params: { kind: "lanterns", count: 34, color1: "#f97316", color2: "#fef08a" } },
  { id: "champagne_gold_bubbles", label: "Dom Pérignon Effervescence", tier: "medium", cat: "thermal", icon: "🥂", badge: "Luxury", desc: "Effervescent 24K gold micro-bubbles rising with high-frequency sparkle", archetype: "weather", depth: 1, params: { kind: "lanterns", count: 48, color1: "#eab308", color2: "#fef9c3" } },
  { id: "emerald_kelp_forest", label: "Submarine Kelp Currents", tier: "medium", cat: "nature", icon: "🌿", badge: "Aquatic", desc: "Undulating underwater kelp ribbons and sunbeams swaying to basslines", archetype: "bars", depth: 1, params: { count: 32, style: "bamboo", color1: "#059669", color2: "#34d399" } },
  { id: "spiral_galaxy_arms", label: "Andromeda Spiral Galaxy", tier: "medium", cat: "cosmic", icon: "🌀", badge: "Deep Space", desc: "Rotatingbarred spiral galaxy with thousands of star clusters pulsing to music", archetype: "radial", depth: 1, params: { spokes: 80, rings: 3, style: "galaxy", color1: "#818cf8", color2: "#f472b6" } },
  { id: "meteor_shower_streaks", label: "Perseid Meteor Shower", tier: "medium", cat: "cosmic", icon: "☄️", badge: "Bolide", desc: "Blazing cosmic meteors streaking diagonally across a starry night stage", archetype: "weather", depth: 1, params: { kind: "meteors", count: 26, color1: "#38bdf8", color2: "#facc15", angle: 0.55 } },

  // ── MODERN ARM / APPLE SILICON ULTRA TIER: Out-of-This-World 3D, Raymarched & Cosmic FX (42 more = 108 total) ──
  { id: "m4_metal_raymarch_orbs", label: "Apple Silicon Liquid Metal Metaballs", tier: "ultra", cat: "geometry", icon: "🫧", badge: "ARM Ultra", desc: "Specular chrome & neon metaball orbs fusing and splitting in real time", archetype: "nebula", depth: 2, params: { clouds: 22, metaballs: true, color1: "#38bdf8", color2: "#f472b6" } },
  { id: "supernova_shockwave_core", label: "Type Ia Supernova Remnant", tier: "ultra", cat: "cosmic", icon: "💥", badge: "ARM Ultra", desc: "Expanding relativistic plasma shells and filamentary shockwaves on every kick", archetype: "radial", depth: 1, params: { spokes: 96, rings: 6, style: "supernova", color1: "#f97316", color2: "#38bdf8" } },
  { id: "quasar_relativistic_jet", label: "Blazar Twin Relativistic Jets", tier: "ultra", cat: "cosmic", icon: "🌌", badge: "ARM Ultra", desc: "Supermassive black hole accretion disk firing twin polar gamma-ray jets", archetype: "radial", depth: 1, params: { spokes: 84, rings: 5, style: "quasar", color1: "#c084fc", color2: "#22d3ee" } },
  { id: "wormhole_einstein_rosen", label: "Einstein-Rosen Spacetime Tunnel", tier: "ultra", cat: "cosmic", icon: "🕳️", badge: "ARM Ultra", desc: "Curved spacetime grid funnel warping through hyperspace with sub-bass", archetype: "radial", depth: 1, params: { spokes: 64, rings: 8, style: "wormhole", color1: "#00f5ff", color2: "#8b5cf6" } },
  { id: "dyson_sphere_megastructure", label: "Kardashev Type-II Dyson Swarm", tier: "ultra", cat: "cosmic", icon: "🛰️", badge: "ARM Ultra", desc: "Geodesic orbital solar collectors rotating around a captive pulsing star", archetype: "geometry", depth: 2, params: { shape: "sphere", count: 42, color1: "#facc15", color2: "#38bdf8" } },
  { id: "tesseract_4d_hypercube", label: "4D Rotating Hypercube Projection", tier: "ultra", cat: "geometry", icon: "🧊", badge: "ARM Ultra", desc: "Four-dimensional Schlegel tesseract rotating through XW/YZ planes with FFT", archetype: "geometry", depth: 2, params: { shape: "tesseract", count: 16, color1: "#00f5ff", color2: "#ff007f" } },
  { id: "icosahedron_crystal_core", label: "Geodesic Plasma Icosahedron", tier: "ultra", cat: "geometry", icon: "💎", badge: "ARM Ultra", desc: "Faceted 3D wireframe polyhedron with bass-extruded vertices and laser core", archetype: "geometry", depth: 2, params: { shape: "polyhedron", count: 24, color1: "#a855f7", color2: "#2dd4bf" } },
  { id: "torus_tokamak_fusion", label: "ITER Tokamak Magnetic Fusion", tier: "ultra", cat: "thermal", icon: "⚛️", badge: "ARM Ultra", desc: "Toroidal magnetic confinement plasma spiraling at 150 million degrees", archetype: "radial", depth: 2, params: { spokes: 90, rings: 6, style: "torus", color1: "#f43f5e", color2: "#38bdf8" } },
  { id: "tesla_coil_high_voltage", label: "Wardenclyffe Mega-Tesla Arcs", tier: "ultra", cat: "thermal", icon: "⚡", badge: "ARM Ultra", desc: "Branching purple-white high-voltage dielectric lightning arcs striking the rim", archetype: "radial", depth: 2, params: { spokes: 32, rings: 3, style: "tesla", color1: "#c084fc", color2: "#e0f2fe" } },
  { id: "solar_coronal_loops", label: "Solar SDO Coronal Mass Ejection", tier: "ultra", cat: "thermal", icon: "☀️", badge: "ARM Ultra", desc: "Extreme-UV magnetic plasma arches erupting from the solar chromosphere", archetype: "radial", depth: 1, params: { spokes: 72, rings: 4, style: "corona", color1: "#fb923c", color2: "#fef08a" } },
  { id: "pillars_of_creation", label: "JWST Carina Nebula Dust Pillars", tier: "ultra", cat: "cosmic", icon: "🔭", badge: "ARM Ultra", desc: "Volumetric cosmic dust clouds and newborn protostars lit by audio frequencies", archetype: "nebula", depth: 1, params: { clouds: 24, color1: "#f59e0b", color2: "#38bdf8" } },
  { id: "veil_nebula_filaments", label: "Cygnus Loop Supernova Veil", tier: "ultra", cat: "cosmic", icon: "🌠", badge: "ARM Ultra", desc: "Delicate ionized oxygen (teal) and hydrogen-alpha (crimson) shock filaments", archetype: "wave", depth: 1, params: { lines: 7, fill: false, aurora: true, color1: "#2dd4bf", color2: "#f43f5e", freq: 3.2 } },
  { id: "gravitational_lensing", label: "Gargantua Gravitational Lens", tier: "ultra", cat: "cosmic", icon: "🪐", badge: "ARM Ultra", desc: "Warped relativistic Einstein ring bending starlight around an audio singularity", archetype: "radial", depth: 1, params: { spokes: 80, rings: 5, style: "wormhole", color1: "#fde68a", color2: "#f97316" } },
  { id: "pulsar_magnetosphere", label: "Millisecond Magnetar Beams", tier: "ultra", cat: "cosmic", icon: "💫", badge: "ARM Ultra", desc: "Ultra-rapid dipole magnetic field lines and sweeping synchrotron beams", archetype: "radial", depth: 2, params: { spokes: 64, rings: 4, style: "quasar", color1: "#38bdf8", color2: "#818cf8" } },
  { id: "quantum_wavefunction", label: "Schrödinger Probability Cloud", tier: "ultra", cat: "geometry", icon: "🔬", badge: "ARM Ultra", desc: "Atomic 3d/4f orbital harmonic probability densities interfering in phase", archetype: "radial", depth: 2, params: { spokes: 88, rings: 5, style: "rose", color1: "#22d3ee", color2: "#f472b6" } },
  { id: "string_theory_calabi_yau", label: "11D Calabi-Yau Manifold", tier: "ultra", cat: "geometry", icon: "🪢", badge: "ARM Ultra", desc: "Folded multidimensional superstring ribbons vibrating at harmonic overtones", archetype: "wave", depth: 2, params: { lines: 8, fill: false, color1: "#c084fc", color2: "#38bdf8", freq: 4.5 } },
  { id: "cern_lhc_collision", label: "CERN ATLAS Higgs Boson Shower", tier: "ultra", cat: "cyber", icon: "💥", badge: "ARM Ultra", desc: "Curving charged-particle tracks spiraling through a solenoid calorimeter", archetype: "radial", depth: 2, params: { spokes: 76, rings: 5, style: "tesla", color1: "#facc15", color2: "#06b6d4" } },
  { id: "chladni_cymatics_plate", label: "Acoustic Cymatics Resonance Sand", tier: "ultra", cat: "geometry", icon: "🥁", badge: "ARM Ultra", desc: "Nodal Chladni standing-wave geometric patterns shifting with pitch changes", archetype: "geometry", depth: 2, params: { shape: "cymatics", count: 48, color1: "#fde047", color2: "#38bdf8" } },
  { id: "ferrofluid_magnetic_spikes", label: "Neodymium Ferrofluid Crown", tier: "ultra", cat: "thermal", icon: "👑", badge: "ARM Ultra", desc: "Glossy liquid-magnet Rosensweig spikes leaping in sync with sub-bass", archetype: "radial", depth: 2, params: { spokes: 60, rings: 3, style: "supernova", color1: "#94a3b8", color2: "#38bdf8" } },
  { id: "bioluminescent_jellyfish", label: "Mariana Trench Crown Jellyfish", tier: "ultra", cat: "nature", icon: "🪼", badge: "ARM Ultra", desc: "Translucent pulsing bell and trailing neon tentacles swimming to the rhythm", archetype: "radial", depth: 2, params: { spokes: 52, rings: 4, style: "rose", color1: "#00f5ff", color2: "#f472b6" } },
  { id: "crystal_cavern_prism", label: "Naica Giant Selenite Prism Cave", tier: "ultra", cat: "geometry", icon: "💎", badge: "ARM Ultra", desc: "Refractive crystalline beams splitting audio energy into laser caustics", archetype: "geometry", depth: 1, params: { shape: "polyhedron", count: 32, color1: "#67e8f9", color2: "#c084fc" } },
  { id: "holographic_globe_atlas", label: "Orbital Planetary Telemetry Globe", tier: "ultra", cat: "cyber", icon: "🌍", badge: "ARM Ultra", desc: "Rotating 3D latitude/longitude wireframe globe with satellite eq arcs", archetype: "geometry", depth: 2, params: { shape: "sphere", count: 48, color1: "#22d3ee", color2: "#10b981" } },
  { id: "tron_lightcycle_arena", label: "Encom Lightcycle Grid Arena", tier: "ultra", cat: "cyber", icon: "🏍️", badge: "ARM Ultra", desc: "90-degree neon light-ribbon trails racing across a 3D perspective arena", archetype: "horizon", depth: 1, params: { variant: "highway", color1: "#00f5ff", color2: "#f97316" } },
  { id: "blade_runner_spinner_rain", label: "Los Angeles 2049 Spinner Flight", tier: "ultra", cat: "cyber", icon: "🌧️", badge: "ARM Ultra", desc: "Volumetric neon city rain, searchlights, and towering holographic pylons", archetype: "horizon", depth: 1, params: { variant: "megacity", color1: "#f59e0b", color2: "#ec4899" } },
  { id: "akira_neo_tokyo_explosion", label: "Neo-Tokyo Psychic Singularity", tier: "ultra", cat: "cyber", icon: "🔴", badge: "ARM Ultra", desc: "Expanding crimson energy dome with skyscraper debris and shockwave rings", archetype: "radial", depth: 1, params: { spokes: 88, rings: 6, style: "supernova", color1: "#ef4444", color2: "#facc15" } },
  { id: "ghost_shell_thermoptic", label: "Section 9 Thermoptic Camo Mesh", tier: "ultra", cat: "cyber", icon: "🕸️", badge: "ARM Ultra", desc: "Refractive hexagonal cloaking mesh rippling with high-frequency transients", archetype: "geometry", depth: 2, params: { shape: "hex_grid", count: 40, color1: "#2dd4bf", color2: "#818cf8" } },
  { id: "matrix_architect_screens", label: "The Architect's Video Wall", tier: "ultra", cat: "cyber", icon: "📺", badge: "ARM Ultra", desc: "Curved array of 64 telemetry monitors each pulsing with its own FFT bin", archetype: "bars", depth: 2, params: { count: 48, style: "segmented", color1: "#00ff41", color2: "#e2e8f0" } },
  { id: "valkyrie_warp_drive", label: "Alcubierre Faster-Than-Light Bubble", tier: "ultra", cat: "cosmic", icon: "🚀", badge: "ARM Ultra", desc: "Contracting forward space and expanding rear blueshift/redshift starlight", archetype: "radial", depth: 1, params: { spokes: 92, rings: 5, style: "wormhole", color1: "#38bdf8", color2: "#f43f5e" } },
  { id: "fibonacci_golden_spiral", label: "Golden Ratio Phyllotaxis Spiral", tier: "ultra", cat: "geometry", icon: "🌻", badge: "ARM Ultra", desc: "137.5° Fibonacci golden-angle seed spiral pulsing with harmonic precision", archetype: "radial", depth: 2, params: { spokes: 108, rings: 3, style: "galaxy", color1: "#facc15", color2: "#10b981" } },
  { id: "mandelbrot_julia_orbit", label: "Julia Set Fractal Orbit Trap", tier: "ultra", cat: "geometry", icon: "🌀", badge: "ARM Ultra", desc: "Complex-plane fractal filaments morphing continuously with bass and treble", archetype: "radial", depth: 2, params: { spokes: 84, rings: 6, style: "rose", color1: "#a855f7", color2: "#facc15" } },
  { id: "lorenz_chaos_attractor", label: "Lorenz Butterfly Strange Attractor", tier: "ultra", cat: "geometry", icon: "🦋", badge: "ARM Ultra", desc: "Chaotic dual-lobe differential trajectory glowing with stereo phase width", archetype: "wave", depth: 2, params: { lines: 6, fill: false, color1: "#38bdf8", color2: "#f97316", freq: 5.0 } },
  { id: "fourier_epicycle_engine", label: "Harmonic Epicycle Gear Train", tier: "ultra", cat: "geometry", icon: "⚙️", badge: "ARM Ultra", desc: "Nested rotating Fourier planetary circles tracing the live audio waveform", archetype: "radial", depth: 2, params: { spokes: 48, rings: 6, style: "turbine", color1: "#facc15", color2: "#38bdf8" } },
  { id: "obsidian_mirror_lake", label: "Patagonia Midnight Mirror Lake", tier: "ultra", cat: "nature", icon: "🏞️", badge: "ARM Ultra", desc: "Starlit mountain peaks with crystal-clear water ripples driven by sub-bass", archetype: "horizon", depth: 1, params: { variant: "glacier", color1: "#818cf8", color2: "#2dd4bf" } },
  { id: "jupiter_great_red_spot", label: "Jovian Hurricane Cloud Bands", tier: "ultra", cat: "cosmic", icon: "🪐", badge: "ARM Ultra", desc: "Turbulent counter-rotating ammonia cloud belts and anticyclonic vortex", archetype: "wave", depth: 1, params: { lines: 7, fill: true, aurora: true, color1: "#f97316", color2: "#fde68a", freq: 2.8 } },
  { id: "saturn_cassini_rings", label: "Cassini Division Ring Resonances", tier: "ultra", cat: "cosmic", icon: "🪐", badge: "ARM Ultra", desc: "Tilted icy planetary ring system with shepherd-moon density waves", archetype: "radial", depth: 2, params: { spokes: 72, rings: 8, style: "vinyl", color1: "#fde68a", color2: "#38bdf8" } },
  { id: "prism_caustic_pool", label: "Mediterranean Sunlight Caustics", tier: "ultra", cat: "nature", icon: "🌊", badge: "ARM Ultra", desc: "Refracted underwater sunlight caustic mesh dancing to high-hat shimmer", archetype: "geometry", depth: 1, params: { shape: "neural", count: 44, color1: "#38bdf8", color2: "#e0f2fe" } },
  { id: "neon_lotus_zenith", label: "Cyber-Nirvana Thousand-Petal Lotus", tier: "ultra", cat: "geometry", icon: "🪷", badge: "ARM Ultra", desc: "Sacred 12-fold glowing lotus mandala breathing with vocal presence", archetype: "radial", depth: 2, params: { spokes: 96, rings: 6, style: "rose", color1: "#f472b6", color2: "#2dd4bf" } },
  { id: "dragon_fire_breath", label: "Draconic Plasma Breath", tier: "ultra", cat: "thermal", icon: "🐉", badge: "ARM Ultra", desc: "Twin swirling dragon-fire vortex ribbons and golden ember tornado", archetype: "nebula", depth: 1, params: { clouds: 20, color1: "#ef4444", color2: "#facc15" } },
  { id: "emerald_northern_crown", label: "Corona Borealis Star Crown", tier: "ultra", cat: "cosmic", icon: "👑", badge: "ARM Ultra", desc: "High-density emerald and diamond stellar crown with harmonic light rays", archetype: "radial", depth: 2, params: { spokes: 80, rings: 4, style: "bars", color1: "#10b981", color2: "#a7f3d0" } },
  { id: "liquid_gold_equalizer", label: "24K Molten Gold Mastering Wall", tier: "ultra", cat: "spectrum", icon: "🏆", badge: "ARM Ultra", desc: "Reflective molten gold 64-band analyzer with diamond peak-hold crowns", archetype: "bars", depth: 3, params: { count: 64, style: "rainbow", color1: "#eab308", color2: "#fef08a" } },
  { id: "cybernetic_eye_iris", label: "Bionic Optical Iris Scanner", tier: "ultra", cat: "cyber", icon: "👁️", badge: "ARM Ultra", desc: "Dilating cybernetic pupil and radial iris fibers contracting on bass drops", archetype: "radial", depth: 2, params: { spokes: 72, rings: 5, style: "turbine", color1: "#00f5ff", color2: "#f43f5e" } },
  { id: "omega_singularity_finale", label: "Omega Point Hyper-Visualizer", tier: "ultra", cat: "cosmic", icon: "♾️", badge: "ARM Ultra", desc: "Grand synthesis of starfield warp, harmonic mandala, and spectrum crown", archetype: "radial", depth: 2, params: { spokes: 96, rings: 7, style: "supernova", color1: "#00f5ff", color2: "#ff007f" } },
];

/** Maximum simultaneous visualizer / atmospheric layers that can be mixed in the Media Deck. */
export const MAX_VIZ_LAYERS = 4;

const VIZ_MODE_MAP = new Map(VIZ_MODES.map((m) => [m.id, m]));

/**
 * 12 Curated Multi-Layer Signature Mixes combining atmospheric backdrops,
 * middle harmonic waveforms/mandalas, and foreground studio analyzers.
 */
export const VIZ_MIX_PRESETS = [
  { id: "synthwave+spectrum+starfield", label: "1984 Outrun Stage", icon: "🌆", desc: "Outrun Synthwave Grid + 3D Warp Starfield + Spectrum Peak Caps" },
  { id: "thunderstorm_stage+cyber_city+oscilloscope", label: "Blade Runner Rain", icon: "⛈️", desc: "Electric Thunderstorm + Neon Cyber Skyline + Stereo Oscilloscope" },
  { id: "blackhole+kaleidoscope+particles", label: "Singularity Mandala", icon: "🕳️", desc: "Event Horizon Vortex + Sacred Mandala + Bass Nova Constellation" },
  { id: "northern_lights_borealis+obsidian_mirror_lake+mirror_bars", label: "Arctic Aurora Club", icon: "🌌", desc: "Aurora Borealis + Mirror Lake + Mirrored Club Analyzer" },
  { id: "matrix+cyber_city+led_matrix", label: "Night City Netrunner", icon: "💻", desc: "Matrix Digital Rain + Neon Cyber Skyline + Hi-Fi LED Dot Matrix" },
  { id: "fire+volcanic_magma_ridge+analog_vu", label: "Warm Valve Inferno", icon: "🔥", desc: "Inferno Flame + Magma Ridge + Warm Analog Needle VU" },
  { id: "pillars_of_creation+dna+plasma", label: "Cosmic Genesis", icon: "🧬", desc: "JWST Nebula Pillars + 3D DNA Helix + Neon Plasma Ribbon" },
  { id: "gentle_rain_stage+sakura_petal_breeze+amber_tube_scope", label: "Kyoto Lo-Fi Study", icon: "🌸", desc: "Midnight Rain + Sakura Petals + Warm Valve Filament Wave" },
  { id: "m4_metal_raymarch_orbs+tesseract_4d_hypercube+fine_128_spectrum", label: "Apple Silicon M4 Pro", icon: "🫧", desc: "Liquid Metal Metaballs + 4D Hypercube + 128-Band Hairlines" },
  { id: "laser_club_show+velvet_smoke_stage+mirror_bars", label: "Ibiza Mainstage", icon: "🔦", desc: "Dry-Ice Smoke + Ibiza Laser Fan + Mirrored Club Analyzer" },
  { id: "wormhole_einstein_rosen+supernova_shockwave_core+lissajous", label: "Interstellar Warp", icon: "🪐", desc: "Einstein-Rosen Wormhole + Supernova Core + XY Vectorscope" },
  { id: "bioluminescent_ocean+bioluminescent_jellyfish+pulsar", label: "Abyssal Odyssey", icon: "🪼", desc: "Bioluminescent Plankton + Crown Jellyfish + Pulsar Ridges" },
];

/**
 * Parses a visualizer mode specification (e.g. `"synthwave+spectrum+starfield"`)
 * into a deduplicated array of valid mode IDs (up to `MAX_VIZ_LAYERS`).
 */
export function parseVizLayers(spec) {
  if (!spec) return ["spectrum"];
  const rawParts = Array.isArray(spec)
    ? spec
    : String(spec)
        .split("+")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
  const out = [];
  for (const id of rawParts) {
    if (VIZ_MODE_MAP.has(id) && !out.includes(id)) {
      out.push(id);
      if (out.length >= MAX_VIZ_LAYERS) break;
    }
  }
  return out.length ? out : ["spectrum"];
}

/** Normalizes any single or multi-layer visualizer spec into a canonical `+`-joined string. */
export function normalizeVizSpec(spec) {
  return parseVizLayers(spec).join("+");
}

/** Formats a human-readable label for a single mode or multi-layer mix. */
export function formatVizLabel(spec) {
  const layers = parseVizLayers(spec);
  if (layers.length === 1) {
    return VIZ_MODE_MAP.get(layers[0])?.label || "Spectrum + Peak Caps";
  }
  const preset = VIZ_MIX_PRESETS.find((p) => normalizeVizSpec(p.id) === layers.join("+"));
  if (preset) return `${preset.label} (${layers.length}FX)`;
  const first = VIZ_MODE_MAP.get(layers[0])?.label || layers[0];
  return `${first} + ${layers.length - 1} FX`;
}

/**
 * Draws any of the 108 prebuilt real-time audio visualizers & atmospheric stage effects
 * (or up to 4 simultaneously mixed layers joined by `+`, e.g. `"synthwave+spectrum+starfield"`)
 * onto a 2D canvas context.
 * Shared across Quick Look, File Manager Media Deck, and standalone Media Player Studio Pro.
 */
export function renderAudioVisualizer(g2, width, height, mode, freqData, timeData, peaks, accentColor, phase = 0) {
  if (!g2) return;
  g2.clearRect(0, 0, width, height);
  const accent = accentColor || "#00ff41";
  const bins = freqData?.length || 1;

  const sampleFreq = (norm) => {
    const clamped = Math.max(0, Math.min(0.999, Number(norm) || 0));
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(clamped * bins * 0.82)));
    return (freqData?.[idx] || 0) / 255;
  };

  let bass = 0;
  let mids = 0;
  let highs = 0;
  for (let i = 0; i < 8; i++) bass += freqData?.[i] || 0;
  for (let i = 8; i < 32; i++) mids += freqData?.[Math.min(bins - 1, i)] || 0;
  for (let i = 32; i < 64; i++) highs += freqData?.[Math.min(bins - 1, i)] || 0;
  bass /= 8 * 255;
  mids /= 24 * 255;
  highs /= 32 * 255;

  // Support multi-layer mixing ("synthwave+spectrum+starfield") sorted back-to-front by depth
  const rawModeStr = String(mode || "spectrum").trim();
  if (rawModeStr.includes("+")) {
    const layers = parseVizLayers(rawModeStr);
    if (layers.length > 1) {
      const sorted = [...layers].sort((a, b) => {
        const da = VIZ_MODE_MAP.get(a)?.depth ?? 2;
        const db = VIZ_MODE_MAP.get(b)?.depth ?? 2;
        return da - db;
      });
      for (let idx = 0; idx < sorted.length; idx++) {
        g2.save();
        g2.globalAlpha = idx === 0 ? 0.95 : idx === sorted.length - 1 ? 0.92 : 0.78;
        renderSingleVisualizerLayer(g2, width, height, sorted[idx], freqData, timeData, peaks, accent, phase + idx * 13, sampleFreq, bass, mids, highs, bins);
        g2.restore();
      }
      return;
    }
  }

  renderSingleVisualizerLayer(g2, width, height, rawModeStr, freqData, timeData, peaks, accent, phase, sampleFreq, bass, mids, highs, bins);
}

function renderSingleVisualizerLayer(g2, width, height, mode, freqData, timeData, peaks, accent, phase, sampleFreq, bass, mids, highs, bins) {
  // 1. Stereo Oscilloscope (dual-trace CRT with graticule)
  if (mode === "oscilloscope") {
    g2.strokeStyle = "rgba(255,255,255,0.06)";
    g2.lineWidth = 1;
    for (let x = width / 8; x < width; x += width / 8) {
      g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, height); g2.stroke();
    }
    for (let y = height / 4; y < height; y += height / 4) {
      g2.beginPath(); g2.moveTo(0, y); g2.lineTo(width, y); g2.stroke();
    }
    const len = timeData?.length || 64;
    const slice = width / Math.max(1, len - 1);
    // Secondary stereo harmonic trace
    g2.lineWidth = 1.4;
    g2.strokeStyle = "rgba(56, 189, 248, 0.55)";
    g2.beginPath();
    for (let i = 0; i < len; i++) {
      const v = ((timeData[(i + 6) % len] ?? 128) - 128) / 128;
      const y = height / 2 + v * (height * 0.36) + Math.sin(i * 0.15 + phase * 0.08) * bass * 10;
      if (i === 0) g2.moveTo(0, y);
      else g2.lineTo(i * slice, y);
    }
    g2.stroke();
    // Primary phosphor trace
    g2.lineWidth = 2.2;
    g2.strokeStyle = accent;
    g2.beginPath();
    for (let i = 0; i < len; i++) {
      const v = ((timeData[i] ?? 128) - 128) / 128;
      const y = height / 2 + v * (height * 0.44);
      if (i === 0) g2.moveTo(0, y);
      else g2.lineTo(i * slice, y);
    }
    g2.stroke();
    return;
  }

  // 2. Cyber-Tunnel Radial (Milkdrop-inspired tunnel)
  if (mode === "milkdrop") {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * (0.28 + bass * 0.22);
    for (let r = 1; r <= 3; r++) {
      const ringR = ((phase * 1.8 + r * 35) % (Math.min(width, height) * 0.48)) + 8;
      g2.strokeStyle = `hsla(${(phase * 2 + r * 90) % 360}, 90%, 60%, ${0.15 + bass * 0.25})`;
      g2.lineWidth = 1.2;
      g2.beginPath();
      g2.arc(cx, cy, ringR, 0, Math.PI * 2);
      g2.stroke();
    }
    const spokes = 48;
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2 + phase * 0.025;
      const mag = sampleFreq(i / spokes);
      const r1 = maxR * 0.32;
      const r2 = r1 + mag * maxR * 1.2;
      const hue = Math.round(((i / spokes) * 300 + phase * 3) % 360);
      g2.strokeStyle = `hsla(${hue}, 95%, 60%, ${0.48 + mag * 0.5})`;
      g2.lineWidth = 2.2;
      g2.beginPath();
      g2.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
      g2.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
      g2.stroke();
    }
    g2.strokeStyle = accent;
    g2.lineWidth = 1.8;
    g2.beginPath();
    g2.arc(cx, cy, maxR * 0.32, 0, Math.PI * 2);
    g2.stroke();
    return;
  }

  // 3. Studio Bar VU + Peak Hold
  if (mode === "vu") {
    let sumL = 0;
    let sumR = 0;
    const half = Math.floor(bins / 2) || 1;
    for (let i = 0; i < half; i++) {
      sumL += freqData[i] || 0;
      sumR += freqData[Math.min(bins - 1, i + Math.floor(half / 3))] || 0;
    }
    const lvlL = Math.min(1, (sumL / (half * 255)) * 1.65);
    const lvlR = Math.min(1, (sumR / (half * 255)) * 1.65);
    const pad = 14;
    const barH = Math.max(12, Math.floor((height - pad * 3) / 2));
    const barW = width - pad * 2;
    const drawMeter = (y, level, peakIdx, label) => {
      peaks[peakIdx] = Math.max(level, (peaks[peakIdx] || 0) - 0.012);
      g2.fillStyle = "rgba(15, 23, 42, 0.78)";
      g2.fillRect(pad, y, barW, barH);
      const segments = 32;
      const segW = barW / segments;
      const lit = Math.round(level * segments);
      for (let s = 0; s < lit; s++) {
        const ratio = s / segments;
        g2.fillStyle = ratio > 0.82 ? "#ef4444" : ratio > 0.62 ? "#facc15" : accent;
        g2.fillRect(pad + s * segW + 1, y + 2, Math.max(2, segW - 2), barH - 4);
      }
      const px = pad + Math.min(segments - 1, Math.floor(peaks[peakIdx] * segments)) * segW;
      g2.fillStyle = "#f8fafc";
      g2.fillRect(px, y + 1, 3, barH - 2);
      g2.fillStyle = "rgba(255,255,255,0.8)";
      g2.font = "bold 10px monospace";
      g2.fillText(label, pad + 6, y + barH - 5);
    };
    drawMeter(pad, lvlL, 0, "L CH  -20  -10   -3    0  +3dB");
    drawMeter(pad * 2 + barH, lvlR, 1, "R CH  -20  -10   -3    0  +3dB");
    return;
  }

  // 4. Hi-Fi LED Dot Matrix Wall
  if (mode === "led_matrix") {
    const cols = 36;
    const rows = 14;
    const cw = width / cols;
    const rh = height / rows;
    for (let c = 0; c < cols; c++) {
      const v = sampleFreq(c / cols);
      const litRows = Math.round(v * rows);
      peaks[c] = Math.max(litRows, (peaks[c] || 0) - 0.18);
      const peakRow = Math.min(rows - 1, Math.floor(peaks[c]));
      for (let r = 0; r < rows; r++) {
        const y = height - (r + 1) * rh;
        const isLit = r < litRows;
        const isPeak = r === peakRow && peakRow > 0;
        if (isPeak) g2.fillStyle = "#f8fafc";
        else if (isLit) g2.fillStyle = r >= 11 ? "#ef4444" : r >= 8 ? "#facc15" : accent;
        else g2.fillStyle = "rgba(255,255,255,0.06)";
        g2.fillRect(c * cw + 1.5, y + 1.5, Math.max(2, cw - 3), Math.max(2, rh - 3));
      }
    }
    return;
  }

  // 5. Warm Analog Needle VU Meters
  if (mode === "analog_vu") {
    const dialW = (width - 28) / 2;
    const dialH = height - 16;
    const lvlL = Math.min(1, bass * 0.9 + mids * 0.55);
    const lvlR = Math.min(1, mids * 0.85 + highs * 0.65);
    peaks[0] = (peaks[0] || 0) * 0.72 + lvlL * 0.28;
    peaks[1] = (peaks[1] || 0) * 0.72 + lvlR * 0.28;
    const drawDial = (ox, level, label) => {
      g2.fillStyle = "rgba(28, 22, 14, 0.92)";
      g2.fillRect(ox, 8, dialW, dialH);
      g2.strokeStyle = "rgba(245, 158, 11, 0.45)";
      g2.lineWidth = 1.5;
      g2.strokeRect(ox, 8, dialW, dialH);
      const cx = ox + dialW / 2;
      const cy = 8 + dialH * 0.88;
      const radius = Math.min(dialW * 0.44, dialH * 0.72);
      // Scale arc (-20dB to 0dB amber, 0dB to +3dB red)
      g2.lineWidth = 3;
      g2.strokeStyle = "#fde68a";
      g2.beginPath();
      g2.arc(cx, cy, radius, Math.PI * 1.18, Math.PI * 1.66);
      g2.stroke();
      g2.strokeStyle = "#ef4444";
      g2.beginPath();
      g2.arc(cx, cy, radius, Math.PI * 1.66, Math.PI * 1.82);
      g2.stroke();
      // Needle
      const angle = Math.PI * (1.18 + Math.min(1, level) * 0.64);
      g2.strokeStyle = "#f97316";
      g2.lineWidth = 2.2;
      g2.beginPath();
      g2.moveTo(cx, cy);
      g2.lineTo(cx + Math.cos(angle) * (radius * 1.06), cy + Math.sin(angle) * (radius * 1.06));
      g2.stroke();
      // Pivot cap + label
      g2.fillStyle = "#facc15";
      g2.beginPath();
      g2.arc(cx, cy, 4, 0, Math.PI * 2);
      g2.fill();
      g2.fillStyle = "rgba(253, 230, 138, 0.85)";
      g2.font = "bold 10px monospace";
      g2.fillText(label, ox + 10, 22);
      // Peak LED
      g2.fillStyle = level > 0.78 ? "#ef4444" : "rgba(239,68,68,0.2)";
      g2.beginPath();
      g2.arc(ox + dialW - 14, 18, 4, 0, Math.PI * 2);
      g2.fill();
    };
    drawDial(8, peaks[0], "LEFT VU (dB)");
    drawDial(20 + dialW, peaks[1], "RIGHT VU (dB)");
    return;
  }

  // 6. Outrun Synthwave Grid (80s sunset + mountains + 3D perspective floor)
  if (mode === "synthwave") {
    const horizon = height * 0.54;
    const sunR = Math.min(width, height) * (0.22 + bass * 0.06);
    const sunGrad = g2.createLinearGradient(0, horizon - sunR * 1.8, 0, horizon);
    sunGrad.addColorStop(0, "#facc15");
    sunGrad.addColorStop(0.5, "#f97316");
    sunGrad.addColorStop(1, "#ec4899");
    g2.fillStyle = sunGrad;
    g2.beginPath();
    g2.arc(width / 2, horizon - sunR * 0.15, sunR, Math.PI, 0);
    g2.fill();
    // Sun scanline cutouts
    g2.fillStyle = "#04070b";
    for (let s = 0; s < 5; s++) {
      const sy = horizon - sunR * (0.12 + s * 0.16);
      g2.fillRect(width / 2 - sunR - 2, sy, sunR * 2 + 4, 1.5 + s * 0.6);
    }
    // Mountain silhouette reacting to spectrum
    g2.fillStyle = "#0f0722";
    g2.strokeStyle = "#00f5ff";
    g2.lineWidth = 1.5;
    g2.beginPath();
    g2.moveTo(0, horizon);
    const pts = 28;
    for (let i = 0; i <= pts; i++) {
      const x = (i / pts) * width;
      const distCenter = Math.abs(i / pts - 0.5) * 2;
      const hVal = sampleFreq(i / pts) * height * 0.28 * (0.35 + distCenter * 0.85);
      g2.lineTo(x, horizon - hVal);
    }
    g2.lineTo(width, horizon);
    g2.closePath();
    g2.fill();
    g2.stroke();
    // 3D Perspective Grid Floor
    g2.strokeStyle = "rgba(255, 0, 127, 0.58)";
    g2.lineWidth = 1.1;
    const vx = width / 2;
    for (let i = -8; i <= 8; i++) {
      g2.beginPath();
      g2.moveTo(vx + i * 14, horizon);
      g2.lineTo(vx + i * 95, height);
      g2.stroke();
    }
    const scroll = (phase * 0.06) % 1;
    for (let r = 0; r < 6; r++) {
      const t = Math.pow((r + scroll) / 6, 1.7);
      const y = horizon + t * (height - horizon);
      g2.beginPath();
      g2.moveTo(0, y);
      g2.lineTo(width, y);
      g2.stroke();
    }
    return;
  }

  // 7. Matrix Digital Rain
  if (mode === "matrix") {
    const cols = 36;
    const cw = width / cols;
    const glyphs = "0123456789ABCDEFZ<>+*:=∑∆Ω";
    g2.font = "bold 10px monospace";
    for (let c = 0; c < cols; c++) {
      const v = sampleFreq(c / cols);
      const speed = 1.2 + (c % 5) * 0.45 + v * 2.4;
      const headY = ((phase * speed + c * 37) % (height + 60)) - 20;
      const tailLen = Math.max(4, Math.floor(4 + v * 10));
      for (let t = 0; t < tailLen; t++) {
        const y = headY - t * 11;
        if (y < -10 || y > height + 10) continue;
        const ch = glyphs[(c * 7 + t * 3 + Math.floor(phase * 0.2)) % glyphs.length];
        if (t === 0) g2.fillStyle = "#ffffff";
        else {
          const alpha = Math.max(0.08, (1 - t / tailLen) * (0.45 + v * 0.55));
          g2.fillStyle = accent.startsWith("#") ? accent : `rgba(0, 255, 65, ${alpha})`;
          g2.globalAlpha = t === 0 ? 1 : alpha;
        }
        g2.fillText(ch, c * cw + 2, y);
        g2.globalAlpha = 1;
      }
    }
    return;
  }

  // 8. 3D Warp Starfield
  if (mode === "starfield") {
    const cx = width / 2;
    const cy = height / 2;
    const stars = 72;
    const warp = 1 + bass * 3.5;
    for (let i = 0; i < stars; i++) {
      const seedAngle = (i * 2.39996) % (Math.PI * 2);
      const z = 1 - (((phase * 0.014 * warp + (i / stars)) % 1));
      const prevZ = Math.min(1, z + 0.045 * warp);
      const rad = (1 - z) * Math.max(width, height) * 0.62;
      const prevRad = (1 - prevZ) * Math.max(width, height) * 0.62;
      const x = cx + Math.cos(seedAngle) * rad;
      const y = cy + Math.sin(seedAngle) * rad;
      const px = cx + Math.cos(seedAngle) * prevRad;
      const py = cy + Math.sin(seedAngle) * prevRad;
      const v = sampleFreq(i / stars);
      g2.strokeStyle = i % 3 === 0 ? accent : i % 3 === 1 ? "#38bdf8" : "#f8fafc";
      g2.lineWidth = Math.max(1, (1 - z) * 3.2);
      g2.beginPath();
      g2.moveTo(px, py);
      g2.lineTo(x, y);
      g2.stroke();
      if (v > 0.55) {
        g2.fillStyle = "#facc15";
        g2.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
    return;
  }

  // 9. Pulsar Stacked Ridges (Joy Division / Unknown Pleasures horizon lines)
  if (mode === "pulsar") {
    const lines = 11;
    const padX = width * 0.1;
    const spanW = width - padX * 2;
    for (let r = 0; r < lines; r++) {
      const baseY = 26 + (r / (lines - 1)) * (height - 36);
      g2.fillStyle = "#04070b";
      g2.strokeStyle = r % 2 === 0 ? accent : "#38bdf8";
      g2.lineWidth = 1.5;
      g2.beginPath();
      g2.moveTo(padX, baseY);
      const segs = 32;
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        const env = Math.exp(-Math.pow((u - 0.5) * 3.1, 2));
        const mag = sampleFreq(((r * 7 + s) % segs) / segs);
        const ripple = Math.sin(s * 0.6 + phase * 0.08 + r) * 0.25 + 0.75;
        const dy = mag * env * ripple * 34;
        g2.lineTo(padX + u * spanW, baseY - dy);
      }
      g2.lineTo(padX + spanW, baseY + 6);
      g2.lineTo(padX, baseY + 6);
      g2.closePath();
      g2.fill();
      g2.stroke();
    }
    return;
  }

  // 10. 3D DNA Double Helix
  if (mode === "dna") {
    const rungs = 28;
    const cy = height / 2;
    const amp = height * (0.28 + bass * 0.14);
    for (let i = 0; i < rungs; i++) {
      const u = (i + 0.5) / rungs;
      const x = u * width;
      const a = u * Math.PI * 3.5 + phase * 0.05;
      const v = sampleFreq(u);
      const y1 = cy + Math.sin(a) * amp * (0.55 + v * 0.55);
      const y2 = cy - Math.sin(a) * amp * (0.55 + v * 0.55);
      // Base pair rung
      g2.strokeStyle = "rgba(148, 163, 184, 0.45)";
      g2.lineWidth = 1.4;
      g2.beginPath();
      g2.moveTo(x, y1);
      g2.lineTo(x, y2);
      g2.stroke();
      // Strand A node
      g2.fillStyle = accent;
      g2.beginPath();
      g2.arc(x, y1, 2.6 + v * 2.4, 0, Math.PI * 2);
      g2.fill();
      // Strand B node
      g2.fillStyle = "#f43f5e";
      g2.beginPath();
      g2.arc(x, y2, 2.6 + v * 2.4, 0, Math.PI * 2);
      g2.fill();
    }
    return;
  }

  // 11. Neon Plasma Ribbon (multi-harmonic aurora waves)
  if (mode === "plasma") {
    const ribbons = [
      { color: accent, speed: 0.04, freq: 2.2, amp: 0.36, band: bass },
      { color: "#38bdf8", speed: -0.032, freq: 3.1, amp: 0.3, band: mids },
      { color: "#ec4899", speed: 0.055, freq: 4.0, amp: 0.25, band: highs },
      { color: "#facc15", speed: -0.025, freq: 1.6, amp: 0.22, band: (bass + mids) * 0.5 },
    ];
    for (const [idx, r] of ribbons.entries()) {
      g2.strokeStyle = r.color;
      g2.lineWidth = 2.4;
      g2.beginPath();
      const steps = 48;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const x = u * width;
        const v = sampleFreq((u + idx * 0.2) % 1);
        const wave = Math.sin(u * Math.PI * r.freq + phase * r.speed) * Math.cos(u * Math.PI * 1.3 - phase * 0.02);
        const y = height / 2 + wave * height * r.amp * (0.45 + r.band * 0.7 + v * 0.35);
        if (s === 0) g2.moveTo(x, y);
        else g2.lineTo(x, y);
      }
      g2.stroke();
    }
    return;
  }

  // 12. Bass Nova Constellation (connected particle web)
  if (mode === "particles") {
    const cx = width / 2;
    const cy = height / 2;
    const count = 36;
    const nodes = [];
    for (let i = 0; i < count; i++) {
      const v = sampleFreq(i / count);
      const angle = (i / count) * Math.PI * 2 + phase * 0.015 * (i % 2 === 0 ? 1 : -1);
      const radius = (0.14 + v * 0.34 + ((i * 19) % 17) / 65) * Math.min(width, height);
      nodes.push({ x: cx + Math.cos(angle) * radius * 1.35, y: cy + Math.sin(angle) * radius * 0.85, v });
    }
    // Constellation web lines
    g2.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % count];
      const c = nodes[(i + 5) % count];
      g2.strokeStyle = "rgba(56, 189, 248, 0.28)";
      g2.beginPath();
      g2.moveTo(a.x, a.y);
      g2.lineTo(b.x, b.y);
      g2.lineTo(c.x, c.y);
      g2.stroke();
    }
    for (const n of nodes) {
      g2.fillStyle = n.v > 0.6 ? "#facc15" : accent;
      g2.beginPath();
      g2.arc(n.x, n.y, 2 + n.v * 3.5, 0, Math.PI * 2);
      g2.fill();
    }
    return;
  }

  // 13. XY Stereo Vectorscope (Lissajous phase scope)
  if (mode === "lissajous") {
    const cx = width / 2;
    const cy = height / 2;
    const rad = Math.min(width, height) * 0.42;
    g2.strokeStyle = "rgba(255,255,255,0.12)";
    g2.lineWidth = 1;
    g2.beginPath();
    g2.arc(cx, cy, rad, 0, Math.PI * 2);
    g2.moveTo(cx - rad, cy); g2.lineTo(cx + rad, cy);
    g2.moveTo(cx, cy - rad); g2.lineTo(cx, cy + rad);
    g2.stroke();
    g2.strokeStyle = accent;
    g2.lineWidth = 2;
    g2.beginPath();
    const len = timeData?.length || 96;
    for (let i = 0; i < len; i++) {
      const t1 = ((timeData[i] ?? 128) - 128) / 128;
      const t2 = ((timeData[(i + Math.floor(len / 4)) % len] ?? 128) - 128) / 128;
      const a = (i / len) * Math.PI * 2;
      const x = cx + (t1 * 0.7 + Math.sin(a * 3 + phase * 0.04) * (0.25 + bass * 0.35)) * rad;
      const y = cy + (t2 * 0.7 + Math.cos(a * 2 - phase * 0.03) * (0.25 + mids * 0.35)) * rad;
      if (i === 0) g2.moveTo(x, y);
      else g2.lineTo(x, y);
    }
    g2.closePath();
    g2.stroke();
    return;
  }

  // 14. Inferno Spectrum Flame
  if (mode === "fire") {
    const bars = 48;
    const bw = width / bars;
    for (let i = 0; i < bars; i++) {
      const v = sampleFreq(i / bars);
      const flicker = 0.82 + 0.18 * Math.sin(phase * 0.25 + i * 1.7);
      const fh = Math.max(6, v * flicker * height * 0.92);
      const grad = g2.createLinearGradient(0, height, 0, height - fh);
      grad.addColorStop(0, "#fef08a");
      grad.addColorStop(0.35, "#f97316");
      grad.addColorStop(0.75, "#dc2626");
      grad.addColorStop(1, "rgba(127, 29, 29, 0)");
      g2.fillStyle = grad;
      g2.beginPath();
      g2.moveTo(i * bw, height);
      g2.quadraticCurveTo(i * bw + bw * 0.5, height - fh * 1.12, (i + 1) * bw, height);
      g2.fill();
      // Rising ember spark
      const sparkY = height - ((phase * 2.2 + i * 29) % Math.max(24, fh * 1.25));
      g2.fillStyle = "#fde047";
      g2.fillRect(i * bw + bw * 0.4, sparkY, 2, 2);
    }
    return;
  }

  // 15. Sacred Geometry Mandala (8-fold kaleidoscope)
  if (mode === "kaleidoscope") {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * 0.44;
    const folds = 8;
    for (let f = 0; f < folds; f++) {
      const baseAngle = (f / folds) * Math.PI * 2 + phase * 0.015;
      g2.strokeStyle = f % 2 === 0 ? accent : "#ec4899";
      g2.lineWidth = 1.6;
      g2.beginPath();
      for (let s = 0; s <= 16; s++) {
        const u = s / 16;
        const v = sampleFreq(u);
        const r = u * maxR * (0.45 + v * 0.65);
        const theta = baseAngle + Math.sin(u * Math.PI * 2 + phase * 0.05) * (0.38 + bass * 0.3);
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;
        if (s === 0) g2.moveTo(x, y);
        else g2.lineTo(x, y);
      }
      g2.stroke();
    }
    g2.strokeStyle = "#facc15";
    g2.lineWidth = 1.5;
    g2.beginPath();
    g2.arc(cx, cy, maxR * (0.22 + bass * 0.25), 0, Math.PI * 2);
    g2.stroke();
    return;
  }

  // 16. Mirrored Club Analyzer (symmetric dual-horizon bars)
  if (mode === "mirror_bars") {
    const cy = height / 2;
    const bars = 48;
    const bw = width / bars;
    for (let i = 0; i < bars; i++) {
      const dist = Math.abs((i + 0.5) / bars - 0.5) * 2;
      const v = sampleFreq(dist * 0.85);
      const bh = Math.max(2, v * (height * 0.45));
      peaks[i] = Math.max(bh, (peaks[i] || 0) - 1.1);
      g2.fillStyle = accent;
      g2.fillRect(i * bw + 1, cy - bh, Math.max(1, bw - 2), bh);
      g2.fillStyle = "rgba(56, 189, 248, 0.58)";
      g2.fillRect(i * bw + 1, cy + 1, Math.max(1, bw - 2), bh * 0.82);
      g2.fillStyle = "#facc15";
      g2.fillRect(i * bw + 1, Math.max(0, cy - peaks[i] - 2), Math.max(1, bw - 2), 2);
    }
    g2.fillStyle = "rgba(255,255,255,0.35)";
    g2.fillRect(0, cy - 0.5, width, 1);
    return;
  }

  // 17. Thermal Waterfall Spectrogram Heatmap
  if (mode === "spectrogram") {
    const cols = 42;
    const rows = 18;
    const cw = width / cols;
    const rh = height / rows;
    for (let c = 0; c < cols; c++) {
      const timeShift = (c + Math.floor(phase * 0.5)) * 0.14;
      for (let r = 0; r < rows; r++) {
        const v = sampleFreq(r / rows);
        const wave = 0.65 + 0.35 * Math.sin(timeShift - r * 0.35);
        const heat = Math.min(1, v * wave * 1.25);
        const hue = Math.round(250 - heat * 230);
        const light = Math.round(12 + heat * 56);
        g2.fillStyle = `hsl(${hue}, 95%, ${light}%)`;
        g2.fillRect(c * cw, height - (r + 1) * rh, Math.ceil(cw), Math.ceil(rh));
      }
    }
    return;
  }

  // 18. Event Horizon Vortex (spiral accretion disk)
  if (mode === "blackhole") {
    const cx = width / 2;
    const cy = height / 2;
    const coreR = Math.min(width, height) * (0.14 + bass * 0.1);
    const arms = 64;
    for (let i = 0; i < arms; i++) {
      const u = i / arms;
      const v = sampleFreq(u);
      const angle = u * Math.PI * 6 - phase * 0.04;
      const r = coreR + (1 - u) * Math.min(width, height) * 0.34 * (0.65 + v * 0.55);
      const x = cx + Math.cos(angle) * r * 1.45;
      const y = cy + Math.sin(angle) * r * 0.72;
      g2.fillStyle = i % 2 === 0 ? accent : "#f97316";
      g2.beginPath();
      g2.arc(x, y, 1.5 + v * 3, 0, Math.PI * 2);
      g2.fill();
    }
    g2.fillStyle = "#020408";
    g2.strokeStyle = "#f97316";
    g2.lineWidth = 2.4;
    g2.beginPath();
    g2.arc(cx, cy, coreR, 0, Math.PI * 2);
    g2.fill();
    g2.stroke();
    return;
  }

  // 19. Neon Cyber Skyline (city equalizer + water reflection)
  if (mode === "cyber_city") {
    const waterY = height * 0.72;
    const buildings = 28;
    const bw = width / buildings;
    for (let i = 0; i < buildings; i++) {
      const v = sampleFreq(i / buildings);
      const bh = Math.max(12, v * waterY * 0.9);
      const bx = i * bw + 1;
      const by = waterY - bh;
      g2.fillStyle = "#0f172a";
      g2.strokeStyle = i % 2 === 0 ? accent : "#00f5ff";
      g2.lineWidth = 1.2;
      g2.fillRect(bx, by, Math.max(2, bw - 2), bh);
      g2.strokeRect(bx, by, Math.max(2, bw - 2), bh);
      // Lit windows
      g2.fillStyle = "#facc15";
      for (let wy = by + 5; wy < waterY - 4; wy += 6) {
        if ((i + Math.floor(wy)) % 2 === 0) {
          g2.fillRect(bx + 3, wy, Math.max(2, bw - 8), 2.5);
        }
      }
      // Wet street reflection
      g2.fillStyle = i % 2 === 0 ? "rgba(0, 255, 68, 0.22)" : "rgba(0, 245, 255, 0.22)";
      g2.fillRect(bx, waterY + 2, Math.max(2, bw - 2), Math.min(height - waterY - 2, bh * 0.38));
    }
    g2.strokeStyle = "#ec4899";
    g2.lineWidth = 1.5;
    g2.beginPath();
    g2.moveTo(0, waterY);
    g2.lineTo(width, waterY);
    g2.stroke();
    return;
  }

  // ── Procedural Archetype Engines for the 88 Additional Modes (Low / Medium / ARM Ultra) ──
  const spec = VIZ_MODE_MAP.get(mode);
  if (spec && spec.archetype && spec.archetype !== "core") {
    const p = spec.params || {};
    const c1 = p.color1 || accent;
    const c2 = p.color2 || "#38bdf8";

    // Archetype A: Specialized Bar & Bamboo Analyzers
    if (spec.archetype === "bars") {
      const count = p.count || 36;
      const bw = width / count;
      const style = p.style || "brick";
      for (let i = 0; i < count; i++) {
        const u = i / count;
        const v = sampleFreq(u);
        const bh = Math.max(3, v * height * 0.88);
        peaks[i] = Math.max(bh, (peaks[i] || 0) - 1.2);
        const x = i * bw;
        if (style === "hairline") {
          g2.strokeStyle = i % 2 === 0 ? c1 : c2;
          g2.lineWidth = 1.2;
          g2.beginPath();
          g2.moveTo(x + bw * 0.5, height);
          g2.lineTo(x + bw * 0.5, height - bh);
          g2.stroke();
          g2.fillStyle = "#f8fafc";
          g2.fillRect(x + bw * 0.5 - 1, Math.max(0, height - peaks[i] - 3), 2, 2);
        } else if (style === "lollipop") {
          const cx = x + bw * 0.5;
          const cy = height - bh;
          g2.strokeStyle = c1;
          g2.lineWidth = 1.3;
          g2.beginPath();
          g2.moveTo(cx, height);
          g2.lineTo(cx, cy);
          g2.stroke();
          g2.fillStyle = v > 0.65 ? "#facc15" : c2;
          g2.beginPath();
          g2.arc(cx, cy, 2.8 + v * 2, 0, Math.PI * 2);
          g2.fill();
        } else if (style === "split") {
          const cy = height / 2;
          g2.fillStyle = c1;
          g2.fillRect(x + 1, cy - bh * 0.48, Math.max(1, bw - 2), bh * 0.48);
          g2.fillStyle = c2;
          g2.fillRect(x + 1, cy + 1, Math.max(1, bw - 2), bh * 0.48);
        } else if (style === "bamboo") {
          const sway = Math.sin(phase * 0.04 + i * 0.6) * (4 + bass * 8);
          g2.strokeStyle = i % 2 === 0 ? c1 : c2;
          g2.lineWidth = Math.max(2, bw * 0.32);
          g2.beginPath();
          g2.moveTo(x + bw * 0.5, height);
          g2.quadraticCurveTo(x + bw * 0.5 + sway, height - bh * 0.5, x + bw * 0.5 + sway * 1.4, height - bh);
          g2.stroke();
        } else if (style === "rainbow") {
          const hue = Math.round((u * 320 + phase * 2) % 360);
          g2.fillStyle = `hsl(${hue}, 92%, 56%)`;
          g2.fillRect(x + 1, height - bh, Math.max(1, bw - 2), bh);
          g2.fillStyle = "#ffffff";
          g2.fillRect(x + 1, Math.max(0, height - peaks[i] - 2), Math.max(1, bw - 2), 2);
        } else {
          // brick / segmented / nixie
          const segs = style === "segmented" ? 10 : 6;
          const segH = Math.max(2, Math.floor(height / (segs + 2)));
          const lit = Math.max(1, Math.round((bh / height) * segs));
          for (let s = 0; s < lit; s++) {
            g2.fillStyle = s > segs * 0.75 ? "#ef4444" : s > segs * 0.5 ? c2 : c1;
            g2.fillRect(x + 1, height - (s + 1) * (segH + 1), Math.max(2, bw - 2), segH);
          }
        }
      }
      return;
    }

    // Archetype B: Multi-Harmonic Waves, Auroras & Strange Attractors
    if (spec.archetype === "wave") {
      const lines = p.lines || 3;
      const steps = 44;
      for (let l = 0; l < lines; l++) {
        g2.strokeStyle = l % 2 === 0 ? c1 : c2;
        g2.lineWidth = p.aurora ? 2.6 : 1.8;
        g2.beginPath();
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const x = u * width;
          const tv = ((timeData?.[(s * 2 + l * 9) % (timeData?.length || 64)] ?? 128) - 128) / 128;
          const fv = sampleFreq((u + l * 0.15) % 1);
          const rawWave = Math.sin(u * Math.PI * (p.freq || 2.2) + phase * 0.05 * (l + 1)) * (0.35 + fv * 0.65) + tv * 0.45;
          const qWave = p.stepped ? Math.round(rawWave * 5) / 5 : rawWave;
          const dir = p.mirror && l % 2 === 1 ? -1 : 1;
          const baseY = p.aurora ? height * (0.28 + l * 0.12) : height / 2;
          const y = baseY + dir * qWave * height * 0.34;
          if (s === 0) g2.moveTo(x, y);
          else g2.lineTo(x, y);
        }
        g2.stroke();
        if (p.fill) {
          g2.lineTo(width, height);
          g2.lineTo(0, height);
          g2.closePath();
          g2.fillStyle = l % 2 === 0 ? c1 : c2;
          g2.globalAlpha = 0.16;
          g2.fill();
          g2.globalAlpha = 1;
        }
      }
      return;
    }

    // Archetype C: Atmospheric Weather, Rain, Snow, Fireflies, Sakura & Meteor Showers
    if (spec.archetype === "weather") {
      const count = p.count || 40;
      const kind = p.kind || "rain";
      const slope = p.angle || 0.15;
      for (let i = 0; i < count; i++) {
        const u = i / count;
        const v = sampleFreq(u);
        const speed = 1.4 + (i % 7) * 0.35 + bass * 2.5;
        const x = ((i * 47 + phase * speed * slope * 18) % (width + 40)) - 20;
        const y = kind === "lanterns"
          ? height - (((phase * speed * 1.6 + i * 31) % (height + 30)) - 15)
          : ((phase * speed * 2.4 + i * 31) % (height + 30)) - 15;

        if (kind === "rain" || kind === "storm" || kind === "meteors") {
          const len = (kind === "meteors" ? 18 : 11) + v * 14;
          g2.strokeStyle = i % 3 === 0 ? c2 : c1;
          g2.lineWidth = kind === "meteors" ? 2.2 : 1.3;
          g2.beginPath();
          g2.moveTo(x, y);
          g2.lineTo(x + len * slope, y + len);
          g2.stroke();
        } else {
          const rad = 1.8 + (i % 3) + v * 3.2;
          g2.fillStyle = i % 2 === 0 ? c1 : c2;
          g2.beginPath();
          g2.arc(x, y, rad, 0, Math.PI * 2);
          g2.fill();
        }
      }
      // Bass-reactive sheet & forked lightning for storm mode
      if (p.lightning && bass > 0.35) {
        g2.strokeStyle = "#f8fafc";
        g2.lineWidth = 2.2;
        g2.beginPath();
        let lx = width * (0.25 + ((Math.floor(phase) * 19) % 50) / 100);
        let ly = 0;
        g2.moveTo(lx, ly);
        for (let seg = 0; seg < 6; seg++) {
          lx += Math.sin(phase + seg * 2.3) * 18;
          ly += height / 6;
          g2.lineTo(lx, ly);
        }
        g2.stroke();
      }
      return;
    }

    // Archetype D: Matrix, Binary & Telemetry Glyph Streams
    if (spec.archetype === "matrix") {
      const cols = p.cols || 30;
      const cw = width / cols;
      const glyphs = p.glyphs || "01";
      g2.font = "bold 10px monospace";
      for (let c = 0; c < cols; c++) {
        const v = sampleFreq(c / cols);
        const headY = ((phase * (1.5 + v * 2.2) + c * 29) % (height + 40)) - 10;
        for (let t = 0; t < 5; t++) {
          const y = headY - t * 12;
          if (y < 0 || y > height) continue;
          g2.fillStyle = t === 0 ? "#ffffff" : t % 2 === 0 ? c1 : c2;
          const ch = glyphs[(c * 5 + t + Math.floor(phase * 0.25)) % glyphs.length];
          g2.fillText(ch, c * cw + 2, y);
        }
      }
      return;
    }

    // Archetype E: Radial Supernovas, Wormholes, Galaxies, Turbines & Polar Roses
    if (spec.archetype === "radial") {
      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.min(width, height) * 0.45;
      const spokes = Math.min(72, p.spokes || 48);
      const rings = p.rings || 3;
      const style = p.style || "bars";

      for (let r = 1; r <= rings; r++) {
        const rr = (r / rings) * maxR * (0.55 + bass * 0.45);
        g2.strokeStyle = r % 2 === 0 ? c1 : c2;
        g2.lineWidth = 1.3;
        g2.beginPath();
        g2.arc(cx, cy, rr, 0, Math.PI * 2);
        g2.stroke();
      }

      for (let i = 0; i < spokes; i++) {
        const u = i / spokes;
        const v = sampleFreq(u);
        const angle = u * Math.PI * 2 + phase * (style === "galaxy" ? -0.03 : 0.025);
        const innerR = style === "lasers" ? 4 : maxR * 0.22;
        const petal = style === "rose" ? Math.abs(Math.cos(angle * 3 + phase * 0.04)) : 1;
        const outerR = innerR + maxR * 0.78 * (0.25 + v * 0.75) * petal;
        const spiralShift = style === "galaxy" || style === "wormhole" ? (outerR / maxR) * 0.85 : 0;
        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle + spiralShift) * outerR;
        const y2 = cy + Math.sin(angle + spiralShift) * outerR;
        g2.strokeStyle = i % 2 === 0 ? c1 : c2;
        g2.lineWidth = style === "supernova" ? 2.2 : 1.5;
        g2.beginPath();
        g2.moveTo(x1, y1);
        g2.lineTo(x2, y2);
        g2.stroke();
      }
      return;
    }

    // Archetype F: 3D Landscapes, Dunes, Ocean Sunsets, Highways & Glaciers
    if (spec.archetype === "horizon") {
      const horizonY = height * 0.56;
      // Glowing celestial orb
      const orbR = Math.min(width, height) * (0.18 + bass * 0.08);
      g2.fillStyle = c1;
      g2.beginPath();
      g2.arc(width / 2, horizonY - orbR * 0.25, orbR, Math.PI, 0);
      g2.fill();

      // Audio-reactive mountain / dune / glacier silhouette
      g2.fillStyle = "#090d16";
      g2.strokeStyle = c2;
      g2.lineWidth = 1.8;
      g2.beginPath();
      g2.moveTo(0, horizonY);
      const pts = 28;
      for (let i = 0; i <= pts; i++) {
        const u = i / pts;
        const v = sampleFreq(u);
        const ridge = Math.sin(u * Math.PI * 4 + phase * 0.04) * 8 + v * height * 0.28;
        g2.lineTo(u * width, horizonY - Math.max(4, ridge));
      }
      g2.lineTo(width, horizonY);
      g2.closePath();
      g2.fill();
      g2.stroke();

      // Foreground perspective lines or water reflection ripples
      g2.strokeStyle = c1;
      g2.lineWidth = 1.2;
      for (let r = 1; r <= 6; r++) {
        const y = horizonY + (r / 6) * (height - horizonY);
        g2.beginPath();
        g2.moveTo(width * (0.08 * (6 - r)), y);
        g2.lineTo(width * (1 - 0.08 * (6 - r)), y);
        g2.stroke();
      }
      return;
    }

    // Archetype G: Volumetric Nebulae, Dry-Ice Smoke & Apple Silicon Metaball Orbs
    if (spec.archetype === "nebula") {
      const clouds = p.clouds || 16;
      for (let i = 0; i < clouds; i++) {
        const u = i / clouds;
        const v = sampleFreq(u);
        const cx = (width * 0.12) + ((i * 67 + phase * (0.8 + (i % 3) * 0.4)) % (width * 0.76));
        const cy = (height * 0.2) + Math.sin(phase * 0.03 + i * 1.4) * (height * 0.25);
        const rx = (18 + v * 28) * (p.metaballs ? 0.9 : 1.4);
        const ry = (14 + v * 22);
        const grad = g2.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry));
        grad.addColorStop(0, i % 2 === 0 ? c1 : c2);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g2.fillStyle = grad;
        g2.beginPath();
        g2.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
        g2.fill();
        if (p.metaballs) {
          g2.strokeStyle = "#f8fafc";
          g2.lineWidth = 1.2;
          g2.beginPath();
          g2.arc(cx, cy, rx * 0.55, 0, Math.PI * 2);
          g2.stroke();
        }
      }
      return;
    }

    // Archetype H: 3D Polyhedra, 4D Hypercubes, Hex Grids, Neural Meshes & Cymatics
    if (spec.archetype === "geometry") {
      const cx = width / 2;
      const cy = height / 2;
      const count = p.count || 24;
      const maxR = Math.min(width, height) * (0.34 + bass * 0.12);
      const pts = [];
      for (let i = 0; i < count; i++) {
        const u = i / count;
        const v = sampleFreq(u);
        const a = u * Math.PI * 2 + phase * 0.025;
        const r = maxR * (0.45 + 0.55 * Math.sin(u * Math.PI * 3 + phase * 0.04) * (0.6 + v * 0.4));
        pts.push({ x: cx + Math.cos(a) * r * 1.35, y: cy + Math.sin(a) * r, v });
      }
      g2.lineWidth = 1.4;
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const p3 = pts[(i + 4) % pts.length];
        g2.strokeStyle = i % 2 === 0 ? c1 : c2;
        g2.beginPath();
        g2.moveTo(p1.x, p1.y);
        g2.lineTo(p2.x, p2.y);
        g2.lineTo(p3.x, p3.y);
        g2.stroke();
        g2.fillStyle = p1.v > 0.6 ? "#facc15" : c1;
        g2.beginPath();
        g2.arc(p1.x, p1.y, 2.2 + p1.v * 2.5, 0, Math.PI * 2);
        g2.fill();
      }
      return;
    }

    // Archetype I: Studio Tape Reels, DJ Platters, Fighter HUD & Audiophile Meters
    if (spec.archetype === "vumeter") {
      const cy = height / 2;
      const r = Math.min(width * 0.18, height * 0.36);
      const lx = width * 0.3;
      const rx = width * 0.7;
      for (const [idx, cx] of [lx, rx].entries()) {
        const band = idx === 0 ? bass : mids;
        g2.strokeStyle = idx === 0 ? c1 : c2;
        g2.lineWidth = 2;
        g2.beginPath();
        g2.arc(cx, cy, r * (0.85 + band * 0.2), 0, Math.PI * 2);
        g2.stroke();
        for (let s = 0; s < 3; s++) {
          const a = phase * 0.06 + (s * Math.PI * 2) / 3;
          g2.beginPath();
          g2.moveTo(cx, cy);
          g2.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
          g2.stroke();
        }
      }
      g2.strokeStyle = "#facc15";
      g2.beginPath();
      g2.moveTo(lx, cy + r * 0.85);
      g2.quadraticCurveTo(width / 2, cy + r * (0.4 - bass * 0.5), rx, cy + r * 0.85);
      g2.stroke();
      return;
    }
  }

  // 20. Default: Classic Spectrum Analyzer with falling peak-hold caps
  const bars = 56;
  const bw = width / bars;
  for (let i = 0; i < bars; i++) {
    const v = sampleFreq(i / bars);
    const bh = Math.max(2, v * height);
    peaks[i] = Math.max(bh, (peaks[i] || 0) - 1.35);
    const grad = g2.createLinearGradient(0, height, 0, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(0.68, "#facc15");
    grad.addColorStop(1, "#ef4444");
    g2.fillStyle = grad;
    g2.fillRect(i * bw + 1, height - bh, Math.max(1, bw - 2), bh);
    // Falling peak-hold cap
    const capY = Math.max(0, height - peaks[i] - 2);
    g2.fillStyle = "#f8fafc";
    g2.fillRect(i * bw + 1, capY, Math.max(1, bw - 2), 2);
  }
}

/** Formats elapsed or remaining time ("02:14" or "-01:42") for the clickable LED clock. */
export function formatLedClock(seconds, duration = NaN, remaining = false) {
  if (remaining && Number.isFinite(duration) && duration > 0) {
    const left = Math.max(0, duration - (Number.isFinite(seconds) ? seconds : 0));
    return `-${formatClock(left)}`;
  }
  return formatClock(seconds);
}

/** Parses synchronized .lrc lyrics into sorted { time, text } cues. */
export function parseLrc(text) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const cues = [];
  const tagRe = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of lines) {
    const matches = [...raw.matchAll(tagRe)];
    if (!matches.length) continue;
    const lyric = raw.replace(tagRe, "").trim();
    for (const m of matches) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const frac = m[3] ? Number(m[3].padEnd(3, "0").slice(0, 3)) / 1000 : 0;
      const time = min * 60 + sec + frac;
      if (Number.isFinite(time)) cues.push({ time, text: lyric || "♪" });
    }
  }
  return cues.sort((a, b) => a.time - b.time);
}

/** Index of the active .lrc cue at `seconds`, or -1 before the first cue. */
export function activeLrcIndex(cues, seconds) {
  if (!Array.isArray(cues) || !cues.length || !Number.isFinite(seconds)) return -1;
  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    if (seconds + 0.08 >= cues[i].time) idx = i;
    else break;
  }
  return idx;
}

/** Parses an M3U / M3U8 playlist into { path, title, duration } items. */
export function parseM3u(text) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let pendingTitle = "";
  let pendingDuration = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF:")) {
      const rest = line.slice(8);
      const comma = rest.indexOf(",");
      if (comma >= 0) {
        const dur = Number(rest.slice(0, comma).trim().split(/\s+/)[0]);
        pendingDuration = Number.isFinite(dur) && dur > 0 ? dur : 0;
        pendingTitle = rest.slice(comma + 1).trim();
      } else {
        pendingTitle = rest.trim();
      }
      continue;
    }
    if (line.startsWith("#")) continue;
    let filePath = line;
    if (/^file:\/\//i.test(filePath)) {
      try {
        const u = new URL(filePath);
        filePath = decodeURIComponent(u.pathname);
        if (/^\/[A-Za-z]:\//.test(filePath)) filePath = filePath.slice(1);
      } catch { /* keep as-is */ }
    }
    out.push({ path: filePath, title: pendingTitle, duration: pendingDuration });
    pendingTitle = "";
    pendingDuration = 0;
  }
  return out;
}

/** Serializes tracks into an #EXTM3U playlist string. */
export function formatM3u(items) {
  const lines = ["#EXTM3U"];
  for (const item of items ?? []) {
    if (!item || !item.path) continue;
    const dur = Number.isFinite(item.duration) && item.duration > 0 ? Math.round(item.duration) : -1;
    const label = String(item.title || item.name || item.path).replace(/[\r\n]+/g, " ").trim();
    lines.push(`#EXTINF:${dur},${label}`);
    lines.push(String(item.path));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Computes { x, y, zeroY } spline coordinates for the 10-band EQ frequency response curve.
 * `preamp` and `bands` are in [-12, 12] dB.
 */
export function computeEqSpline(preamp, bands, width, height) {
  const w = Math.max(40, Number(width) || 240);
  const h = Math.max(24, Number(height) || 56);
  const padX = 8;
  const padY = 6;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const pre = clampGain(preamp);
  const zeroY = Math.max(padY, Math.min(h - padY, (h / 2) - (pre / 12) * (innerH / 2)));
  const vals = Array.isArray(bands) && bands.length ? bands.map(clampGain) : EQ_PRESETS.Flat;
  const anchors = vals.map((g, i) => {
    const x = padX + (vals.length === 1 ? innerW / 2 : (i / (vals.length - 1)) * innerW);
    const combined = Math.max(-12, Math.min(12, g + pre * 0.35));
    const y = (h / 2) - (combined / 12) * (innerH / 2);
    return { x, y: Math.max(padY, Math.min(h - padY, y)) };
  });
  const points = [];
  const steps = 6;
  for (let i = 0; i < anchors.length - 1; i++) {
    const p0 = anchors[Math.max(0, i - 1)];
    const p1 = anchors[i];
    const p2 = anchors[i + 1];
    const p3 = anchors[Math.min(anchors.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      points.push({ x, y: Math.max(padY, Math.min(h - padY, y)) });
    }
  }
  if (anchors.length) points.push(anchors[anchors.length - 1]);
  return { points, anchors, zeroY };
}


