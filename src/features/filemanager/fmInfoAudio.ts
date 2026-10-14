/** Built-in readers for sound files: MP3, WAV, FLAC and Ogg (Vorbis, Opus). Header facts and tags only. */
import { ascii, be32, clip, le16, le32, type Source } from "./fmInfoCommon";
import { emptyMedia, type MediaInfo } from "./fmInfoMediaRows";

const syncsafe = (b: Uint8Array, o: number) => ((b[o]! & 0x7f) << 21) | ((b[o + 1]! & 0x7f) << 14) | ((b[o + 2]! & 0x7f) << 7) | (b[o + 3]! & 0x7f);

function decodeText(enc: number, data: Uint8Array): string {
  const b = Buffer.from(data);
  let s: string;
  if (enc === 1) s = b.length >= 2 && b[0] === 0xff && b[1] === 0xfe ? b.subarray(2).toString("utf16le") : b.length >= 2 && b[0] === 0xfe && b[1] === 0xff ? Buffer.from(b.subarray(2)).swap16().toString("utf16le") : b.toString("utf16le");
  else if (enc === 2) s = Buffer.from(b).swap16().toString("utf16le");
  else if (enc === 3) s = b.toString("utf8");
  else s = b.toString("latin1");
  return clip(s.replace(/\0+$/, "").replace(/\0/g, " / "), 500).trim();
}

const ID3_V23: Record<string, string> = { TIT2: "title", TPE1: "artist", TPE2: "album_artist", TALB: "album", TYER: "date", TDRC: "date", TCON: "genre", TRCK: "track", TPOS: "disc", TCOM: "composer", TENC: "encoder", TSSE: "encoder", TCOP: "copyright", TLAN: "language" };
const ID3_V22: Record<string, string> = { TT2: "title", TP1: "artist", TP2: "album_artist", TAL: "album", TYE: "date", TCO: "genre", TRK: "track", TPA: "disc", TCM: "composer", TEN: "encoder", TCR: "copyright", TLA: "language" };
const ID3V1_GENRES = ["Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise", "Alt Rock", "Bass", "Soul", "Punk"];

const BITRATES: Record<string, number[]> = {
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 3: [11025, 12000, 8000] };

export async function parseMp3(src: Source): Promise<MediaInfo> {
  const m = emptyMedia("MP3 audio");
  const head = await src.read(0, 10);
  let audioStart = 0;
  if (ascii(head, 0, 3) === "ID3" && head.length >= 10) {
    const ver = head[3]!;
    const flags = head[5]!;
    const size = syncsafe(head, 6);
    audioStart = 10 + size + (flags & 0x10 ? 10 : 0);
    const tag = await src.read(10, Math.min(size, 1024 * 1024));
    let p = 0;
    if (ver >= 3 && flags & 0x40) p = ver === 4 ? syncsafe(tag, 0) : be32(tag, 0) + 4;
    const idLen = ver === 2 ? 3 : 4;
    const hdr = ver === 2 ? 6 : 10;
    for (let n = 0; n < 300 && p + hdr <= tag.length; n++) {
      const id = ascii(tag, p, idLen);
      if (!/^[A-Z0-9]+$/.test(id)) break;
      const fsize = ver === 2 ? (tag[p + 3]! << 16) | (tag[p + 4]! << 8) | tag[p + 5]! : ver === 4 ? syncsafe(tag, p + 4) : be32(tag, p + 4);
      if (fsize <= 0 || p + hdr + fsize > tag.length) break;
      const body = tag.subarray(p + hdr, p + hdr + fsize);
      if (id === "APIC" || id === "PIC") m.coverArt = true;
      else if (id.startsWith("T") && id !== "TXXX" && id !== "TXX" && fsize <= 65536) {
        const key = (ver === 2 ? ID3_V22 : ID3_V23)[id];
        if (key && !m.tags[key]) m.tags[key] = decodeText(body[0]!, body.subarray(1));
      } else if ((id === "COMM" || id === "COM") && fsize <= 65536 && body.length > 5 && !m.tags.comment) {
        const parts = decodeText(body[0]!, body.subarray(4)).split(/\s\/\s/);
        m.tags.comment = (parts.length > 1 ? parts.slice(1).join(" ") : parts[0]!).trim();
      }
      p += hdr + fsize;
    }
    m.container = `MP3 audio (ID3v2.${ver})`;
  }
  let v1 = 0;
  if (src.size >= 128) {
    const tail = await src.read(src.size - 128, 128);
    if (ascii(tail, 0, 3) === "TAG") {
      v1 = 128;
      const f = (o: number, n: number) => clip(Buffer.from(tail.subarray(o, o + n)).toString("latin1").replace(/\0.*$/, "")).trim();
      m.tags.title ||= f(3, 30);
      m.tags.artist ||= f(33, 30);
      m.tags.album ||= f(63, 30);
      m.tags.date ||= f(93, 4);
      if (tail[125] === 0 && tail[126]! > 0) m.tags.track ||= String(tail[126]);
      m.tags.genre ||= ID3V1_GENRES[tail[127]!] ?? "";
      if (!m.container.includes("ID3v2")) m.container = "MP3 audio (ID3v1 tag)";
    }
  }
  for (const k of Object.keys(m.tags)) if (!m.tags[k]) delete m.tags[k];
  // The first audio frame: a sync mark of 11 set bits followed by a valid header.
  const win = await src.read(audioStart, 64 * 1024);
  let f = -1;
  for (let i = 0; i + 4 <= win.length; i++) {
    if (win[i] === 0xff && (win[i + 1]! & 0xe0) === 0xe0 && ((win[i + 1]! >> 3) & 3) !== 1 && ((win[i + 1]! >> 1) & 3) !== 0 && (win[i + 2]! >> 4) !== 15 && (win[i + 2]! >> 4) !== 0 && ((win[i + 2]! >> 2) & 3) !== 3) { f = i; break; }
  }
  if (f < 0) { m.partial = true; m.notes.push("No sound frames were found."); return m; }
  const vbits = (win[f + 1]! >> 3) & 3;
  const version = vbits === 3 ? 1 : vbits === 2 ? 2 : 3; // 3 stands for MPEG 2.5
  const layer = 4 - ((win[f + 1]! >> 1) & 3);
  const rate = RATES[version]![(win[f + 2]! >> 2) & 3]!;
  const bitrate = (BITRATES[`${version === 1 ? 1 : 2}-${layer}`]?.[win[f + 2]! >> 4] ?? 0) * 1000;
  const mono = ((win[f + 3]! >> 6) & 3) === 3;
  const samples = layer === 1 ? 384 : layer === 3 && version !== 1 ? 576 : 1152;
  let frames = 0, vbr = false;
  const off = f + 4 + (version === 1 ? (mono ? 17 : 32) : mono ? 9 : 17);
  const tag = ascii(win, off, 4);
  if (tag === "Xing" || tag === "Info") {
    vbr = tag === "Xing";
    if (win[off + 7]! & 1) frames = be32(win, off + 8);
  } else if (ascii(win, f + 36, 4) === "VBRI") {
    vbr = true;
    frames = be32(win, f + 36 + 14);
  }
  m.streams.push({ type: "audio", codec: `MP3 (MPEG-${version === 3 ? "2.5" : version} Layer ${"I".repeat(layer)})`, channels: mono ? 1 : 2, sampleRate: rate, bitrate: vbr ? undefined : bitrate || undefined, detail: vbr ? "Variable bit rate (VBR)" : "Constant bit rate" });
  if (frames) {
    m.durationSec = (frames * samples) / rate;
    if (vbr) m.bitrate = Math.round(((src.size - audioStart - v1) * 8) / m.durationSec);
  } else if (bitrate) {
    m.durationSec = ((src.size - audioStart - v1) * 8) / bitrate;
    m.bitrate = bitrate;
    m.notes.push("The length is estimated from the bit rate.");
  }
  return m;
}

export async function parseWav(src: Source): Promise<MediaInfo> {
  const m = emptyMedia("WAV audio (RIFF)");
  let pos = 12;
  let byteRate = 0, dataSize = -1;
  for (let n = 0; n < 200 && pos + 8 <= src.size; n++) {
    const h = await src.read(pos, 8);
    if (h.length < 8) break;
    const id = ascii(h, 0, 4);
    let len = le32(h, 4);
    if (id === "fmt ") {
      const d = await src.read(pos + 8, Math.min(len, 40));
      if (d.length >= 16) {
        let tag = le16(d, 0);
        if (tag === 0xfffe && d.length >= 26) tag = le16(d, 24);
        const names: Record<number, string> = { 1: "PCM (uncompressed)", 3: "IEEE float", 6: "A-law", 7: "µ-law", 0x11: "IMA ADPCM", 0x55: "MP3", 0xfffe: "Extensible" };
        byteRate = le32(d, 8);
        m.streams.push({ type: "audio", codec: names[tag] ?? `Format 0x${tag.toString(16)}`, channels: le16(d, 2), sampleRate: le32(d, 4), bits: le16(d, 14), bitrate: byteRate * 8 });
      }
    } else if (id === "data") {
      if (len === 0 || len === 0xffffffff || pos + 8 + len > src.size) len = Math.max(0, src.size - pos - 8);
      dataSize = len;
    } else if (id === "LIST" && len <= 64 * 1024) {
      const d = await src.read(pos + 8, len);
      if (ascii(d, 0, 4) === "INFO") {
        const keys: Record<string, string> = { INAM: "title", IART: "artist", IPRD: "album", ICRD: "date", ISFT: "encoder", ICMT: "comment", IGNR: "genre", ICOP: "copyright", ITRK: "track" };
        for (let p = 4; p + 8 <= d.length;) {
          const k = ascii(d, p, 4), l = le32(d, p + 4);
          if (keys[k]) m.tags[keys[k]!] = clip(Buffer.from(d.subarray(p + 8, p + 8 + l)).toString("latin1").replace(/\0.*$/, "")).trim();
          p += 8 + l + (l & 1);
        }
      }
    }
    pos += 8 + len + (len & 1);
  }
  if (byteRate > 0 && dataSize >= 0) m.durationSec = dataSize / byteRate;
  else m.partial = true;
  return m;
}

function vorbisComments(d: Uint8Array, at: number, m: MediaInfo): void {
  let p = at;
  if (p + 4 > d.length) return;
  p += 4 + le32(d, p);
  if (p + 4 > d.length) return;
  const count = Math.min(le32(d, p), 300);
  p += 4;
  for (let i = 0; i < count && p + 4 <= d.length; i++) {
    const len = le32(d, p);
    p += 4;
    if (p + len > d.length) break;
    const text = Buffer.from(d.subarray(p, p + len)).toString("utf8");
    p += len;
    const eq = text.indexOf("=");
    if (eq < 1) continue;
    const key = text.slice(0, eq).toLowerCase().replace(/^albumartist$/, "album_artist").replace(/^tracknumber$/, "track").replace(/^discnumber$/, "disc");
    if (key === "metadata_block_picture") { m.coverArt = true; continue; }
    if (!m.tags[key]) m.tags[key] = clip(text.slice(eq + 1), 500).trim();
  }
}

export async function parseFlac(src: Source): Promise<MediaInfo> {
  const m = emptyMedia("FLAC audio");
  let pos = 4;
  for (let n = 0; n < 200; n++) {
    const h = await src.read(pos, 4);
    if (h.length < 4) { m.partial = true; break; }
    const last = (h[0]! & 0x80) !== 0, type = h[0]! & 0x7f;
    const len = (h[1]! << 16) | (h[2]! << 8) | h[3]!;
    if (type === 0 && len >= 34) {
      const d = await src.read(pos + 4, 34);
      const rate = (d[10]! << 12) | (d[11]! << 4) | (d[12]! >> 4);
      const channels = ((d[12]! >> 1) & 7) + 1;
      const bits = (((d[12]! & 1) << 4) | (d[13]! >> 4)) + 1;
      const total = (d[13]! & 15) * 2 ** 32 + be32(d, 14);
      m.streams.push({ type: "audio", codec: "FLAC (lossless)", channels, sampleRate: rate, bits });
      if (rate && total) m.durationSec = total / rate;
    } else if (type === 4 && len <= 1024 * 1024) vorbisComments(await src.read(pos + 4, len), 0, m);
    else if (type === 6) m.coverArt = true;
    pos += 4 + len;
    if (last) break;
  }
  return m;
}

export async function parseOgg(src: Source): Promise<MediaInfo> {
  const m = emptyMedia("Ogg audio");
  const d = await src.read(0, 128 * 1024);
  const first = 27 + (d[26] ?? 0);
  let rate = 0, preskip = 0;
  if (ascii(d, first + 1, 6) === "vorbis" && d[first] === 1) {
    rate = le32(d, first + 12);
    m.container = "Ogg Vorbis audio";
    m.streams.push({ type: "audio", codec: "Vorbis", channels: d[first + 11], sampleRate: rate, bitrate: le32(d, first + 20) || undefined });
  } else if (ascii(d, first, 8) === "OpusHead") {
    preskip = le16(d, first + 10);
    rate = 48000;
    m.container = "Ogg Opus audio";
    m.streams.push({ type: "audio", codec: "Opus", channels: d[first + 9], sampleRate: le32(d, first + 12) || 48000, detail: "Opus always plays at 48,000 Hz" });
  } else {
    m.partial = true;
    m.notes.push("This Ogg file holds something other than Vorbis or Opus sound.");
  }
  const opus = rate === 48000 && m.container.includes("Opus");
  const at = Buffer.from(d).indexOf(opus ? "OpusTags" : "\x03vorbis");
  if (at >= 0) vorbisComments(d, at + (opus ? 8 : 7), m);
  const tailLen = Math.min(src.size, 70_000);
  const tail = await src.read(src.size - tailLen, tailLen);
  const last = tail.lastIndexOf("OggS");
  if (last >= 0 && last + 14 <= tail.length && rate) {
    const lo = le32(tail, last + 6), hi = le32(tail, last + 10);
    if (hi !== 0xffffffff && hi * 2 ** 32 + lo > 0) m.durationSec = Math.max(0, hi * 2 ** 32 + lo - preskip) / rate;
  }
  return m;
}
