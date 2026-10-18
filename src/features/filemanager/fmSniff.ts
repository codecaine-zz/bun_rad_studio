/**
 * Recognizing what a file really is from its first bytes, whatever its name says. Pure: bytes in, answer out.
 * Only the start of a file (about 600 bytes) is ever looked at, and nothing is run or parsed any further.
 */

export type Family = "image" | "video" | "audio" | "document" | "archive" | "program" | "script" | "text" | "data" | "font" | "other";

export interface Sniffed {
  /** A short stable id such as "png", "pe", "text". */
  kind: string;
  /** Plain words with an article, for a sentence: "a PNG picture". */
  label: string;
  family: Family;
  /** The usual extensions for it, most usual first, without the dot. */
  extensions: string[];
  /** Real content that would run as a program if it were opened. */
  danger: boolean;
}

/** How many bytes of a file are looked at. */
export const SNIFF_BYTES = 600;

const kinds = new Map<string, Sniffed>();
function def(kind: string, label: string, family: Family, extensions: string[], danger = false): Sniffed {
  const s: Sniffed = { kind, label, family, extensions, danger };
  kinds.set(kind, s);
  return s;
}

const PNG = def("png", "a PNG picture", "image", ["png"]);
const JPEG = def("jpeg", "a JPEG picture", "image", ["jpg", "jpeg"]);
const GIF = def("gif", "a GIF picture", "image", ["gif"]);
const WEBP = def("webp", "a WebP picture", "image", ["webp"]);
const BMP = def("bmp", "a BMP picture", "image", ["bmp"]);
const TIFF = def("tiff", "a TIFF picture", "image", ["tif", "tiff"]);
const ICO = def("ico", "an icon file", "image", ["ico"]);
const CUR = def("cur", "a mouse-cursor file", "image", ["cur"]);
const HEIC = def("heic", "a HEIC photo", "image", ["heic"]);
const AVIF = def("avif", "an AVIF picture", "image", ["avif"]);
const PSD = def("psd", "a Photoshop file", "image", ["psd"]);
const SVG = def("svg", "an SVG picture (it is text)", "image", ["svg"]);
const PDF = def("pdf", "a PDF document", "document", ["pdf"]);
const RTF = def("rtf", "a Rich Text document", "document", ["rtf"]);
const OLE2 = def("ole2", "an older Microsoft Office file or installer", "document", ["doc", "xls", "ppt", "msi"]);
const ZIP = def("zip", "a ZIP archive", "archive", ["zip"]);
const RAR = def("rar", "a RAR archive", "archive", ["rar"]);
const SEVENZ = def("7z", "a 7-Zip archive", "archive", ["7z"]);
const GZIP = def("gzip", "a gzip-compressed file", "archive", ["gz"]);
const BZIP2 = def("bzip2", "a bzip2-compressed file", "archive", ["bz2"]);
const XZ = def("xz", "an xz-compressed file", "archive", ["xz"]);
const ZSTD = def("zstd", "a Zstandard-compressed file", "archive", ["zst"]);
const RADSEC = def("radsec", "an encrypted Secrets vault (RADSEC)", "data", ["radsec"]);
const RADENC = def("radenc", "an encrypted file (RADENC)", "data", ["radenc"]);
const TAR = def("tar", "a TAR archive", "archive", ["tar"]);
const CAB = def("cab", "a Windows cabinet archive", "archive", ["cab"]);
const MP3 = def("mp3", "an MP3 audio file", "audio", ["mp3"]);
const AAC = def("aac", "an AAC audio file", "audio", ["aac"]);
const WAV = def("wav", "a WAV audio file", "audio", ["wav"]);
const FLAC = def("flac", "a FLAC audio file", "audio", ["flac"]);
const OGG = def("ogg", "an Ogg audio or video file", "audio", ["ogg"]);
const AIFF = def("aiff", "an AIFF audio file", "audio", ["aiff", "aif"]);
const MIDI = def("midi", "a MIDI music file", "audio", ["mid"]);
const ASF = def("asf", "a Windows Media file", "video", ["wmv", "wma", "asf"]);
const MP4 = def("mp4", "an MP4 video", "video", ["mp4"]);
const M4A = def("m4a", "an M4A audio file", "audio", ["m4a"]);
const M4V = def("m4v", "an M4V video", "video", ["m4v"]);
const MOV = def("mov", "a QuickTime movie", "video", ["mov"]);
const GP3 = def("3gp", "a 3GP phone video", "video", ["3gp"]);
const MKV = def("mkv", "a Matroska (MKV) video", "video", ["mkv"]);
const WEBM = def("webm", "a WebM video", "video", ["webm"]);
const AVI = def("avi", "an AVI video", "video", ["avi"]);
const FLV = def("flv", "a Flash video", "video", ["flv"]);
const MPEG = def("mpeg", "an MPEG video", "video", ["mpg", "mpeg"]);
const SQLITE = def("sqlite", "an SQLite database", "data", ["sqlite", "db"]);
const BPLIST = def("bplist", "an Apple property list", "data", ["plist"]);
const PE = def("pe", "a Windows program", "program", ["exe"], true);
const PE_DLL: Sniffed = { ...PE, label: "a Windows library (DLL)", extensions: ["dll"] };
const ELF = def("elf", "a Linux program", "program", [], true);
const MACHO = def("macho", "a Mac program", "program", [], true);
const JAVA = def("javaclass", "a compiled Java class", "program", ["class"]);
const SCRIPT = def("script", "a script (a text file that runs as a program)", "script", ["sh"], true);
const HTML = def("html", "a web page (HTML)", "text", ["html"]);
const XML = def("xml", "an XML file", "text", ["xml"]);
const TTF = def("ttf", "a TrueType font", "font", ["ttf"]);
const OTF = def("otf", "an OpenType font", "font", ["otf"]);
const TTC = def("ttc", "a font collection", "font", ["ttc"]);
const WOFF = def("woff", "a web font (WOFF)", "font", ["woff"]);
const WOFF2 = def("woff2", "a web font (WOFF2)", "font", ["woff2"]);
const TEXT = def("text", "a plain text file", "text", ["txt"]);
const BINARY = def("binary", "binary data (not text)", "data", []);

/** Every kind `sniffType` can answer. */
export function sniffKinds(): Sniffed[] {
  return [...kinds.values()];
}

/** The description of one kind by its id ("pdf", "pe" ...). */
export function kindInfo(kind: string): Sniffed | undefined {
  return kinds.get(kind);
}

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  if (at < 0 || at + s.length > b.length) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};
const bytesAt = (b: Uint8Array, at: number, want: number[]): boolean => at >= 0 && at + want.length <= b.length && want.every((v, i) => b[at + i] === v);
const u32be = (b: Uint8Array, at: number): number => (at + 4 <= b.length ? ((b[at]! * 0x1000000) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!) : -1);
const u32le = (b: Uint8Array, at: number): number => (at + 4 <= b.length ? ((b[at + 3]! * 0x1000000) + (b[at + 2]! << 16) + (b[at + 1]! << 8) + b[at]!) : -1);
const u16le = (b: Uint8Array, at: number): number => (at + 2 <= b.length ? b[at]! | (b[at + 1]! << 8) : -1);

function sniffFtyp(b: Uint8Array): Sniffed | null {
  if (!ascii(b, 4, "ftyp") || b.length < 12) return null;
  const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
  if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return HEIC;
  if (/^avi[fs]$/.test(brand)) return AVIF;
  if (brand === "M4A " || brand === "M4B " || brand === "M4P ") return M4A;
  if (brand === "qt  ") return MOV;
  if (/^3g[p2]/.test(brand)) return GP3;
  if (brand === "M4V " || brand === "M4VH" || brand === "M4VP") return M4V;
  return MP4;
}

function sniffMachO(b: Uint8Array): Sniffed | null {
  const be = u32be(b, 0);
  if (be === 0xfeedface || be === 0xfeedfacf || be === 0xcefaedfe || be === 0xcffaedfe) {
    const type = be === 0xfeedface || be === 0xfeedfacf ? u32be(b, 12) : u32le(b, 12);
    return type >= 1 && type <= 12 ? MACHO : null;
  }
  if (be === 0xcafebabe || be === 0xcafebabf) {
    const next = u32be(b, 4);
    // A "fat" Mach-O program counts its architectures (a handful); a Java class has a version of 45 or more here.
    if (next >= 1 && next <= 30) {
      const cpu = u32be(b, 8);
      return [7, 0x01000007, 12, 0x0100000c, 0x0200000c, 18, 0x01000012].includes(cpu) ? MACHO : null;
    }
    const major = (b[6] ?? 0) * 256 + (b[7] ?? 0);
    return be === 0xcafebabe && major >= 44 && major <= 100 ? JAVA : null;
  }
  return null;
}

function sniffPe(b: Uint8Array): Sniffed | null {
  if (b[0] !== 0x4d || b[1] !== 0x5a || b.length < 0x40) return null;
  const ptr = u32le(b, 0x3c);
  if (ptr < 0x40 || ptr > 0x10000) return null;
  if (ptr + 4 <= b.length) {
    if (!bytesAt(b, ptr, [0x50, 0x45, 0, 0])) return null;
    const flags = u16le(b, ptr + 22);
    return flags >= 0 && (flags & 0x2000) !== 0 ? PE_DLL : PE;
  }
  // The header lies past what was read; the DOS header says where the relocation table starts (0x40 in every Windows program).
  return (b[0x18] ?? 0) >= 0x40 ? PE : null;
}

function sniffRiff(b: Uint8Array): Sniffed | null {
  if (!ascii(b, 0, "RIFF")) return null;
  if (ascii(b, 8, "WEBP")) return WEBP;
  if (ascii(b, 8, "WAVE")) return WAV;
  if (ascii(b, 8, "AVI ")) return AVI;
  return null;
}

function sniffAudioStart(b: Uint8Array): Sniffed | null {
  if (ascii(b, 0, "ID3") && (b[3] ?? 9) >= 2 && (b[3] ?? 9) <= 4) return MP3;
  if (b.length >= 3 && b[0] === 0xff && ((b[1]! & 0xf6) === 0xf0)) return AAC;
  if (b.length >= 3 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) {
    const version = (b[1]! >> 3) & 3;
    const layer = (b[1]! >> 1) & 3;
    // Layers II and III only: a Layer I frame header looks just like the byte-order mark of UTF-16 text.
    if (version !== 1 && (layer === 1 || layer === 2) && b[2]! >> 4 !== 0xf && ((b[2]! >> 2) & 3) !== 3) return MP3;
  }
  return null;
}

function sniffBmp(b: Uint8Array): Sniffed | null {
  if (!ascii(b, 0, "BM") || b.length < 18 || u32le(b, 6) !== 0) return null;
  return [12, 40, 52, 56, 64, 108, 124].includes(u32le(b, 14)) ? BMP : null;
}

function sniffIcon(b: Uint8Array): Sniffed | null {
  const type = bytesAt(b, 0, [0, 0, 1, 0]) ? ICO : bytesAt(b, 0, [0, 0, 2, 0]) ? CUR : null;
  if (!type || b.length < 22) return null;
  const count = u16le(b, 4);
  return count >= 1 && count <= 256 && b[9] === 0 ? type : null;
}

function sniffFont(b: Uint8Array): Sniffed | null {
  if (ascii(b, 0, "wOFF")) return WOFF;
  if (ascii(b, 0, "wOF2")) return WOFF2;
  if (ascii(b, 0, "OTTO")) return OTF;
  if (ascii(b, 0, "ttcf")) return TTC;
  if ((bytesAt(b, 0, [0, 1, 0, 0]) || ascii(b, 0, "true")) && b.length >= 12) {
    const tables = (b[4]! << 8) | b[5]!;
    return tables >= 1 && tables <= 80 ? TTF : null;
  }
  return null;
}

function sniffContainer(b: Uint8Array): Sniffed | null {
  if (ascii(b, 0, "PK") && (bytesAt(b, 2, [3, 4]) || bytesAt(b, 2, [5, 6]) || bytesAt(b, 2, [7, 8]))) return ZIP;
  if (ascii(b, 0, "Rar!") && bytesAt(b, 4, [0x1a, 7])) return RAR;
  if (bytesAt(b, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return SEVENZ;
  if (bytesAt(b, 0, [0x1f, 0x8b, 8])) return GZIP;
  if (ascii(b, 0, "BZh") && (b[3] ?? 0) >= 0x31 && (b[3] ?? 0) <= 0x39) return BZIP2;
  if (bytesAt(b, 0, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0])) return XZ;
  if (bytesAt(b, 0, [0x28, 0xb5, 0x2f, 0xfd])) return ZSTD;
  if (ascii(b, 257, "ustar")) return TAR;
  if (ascii(b, 0, "RADSEC")) return RADSEC;
  if (ascii(b, 0, "RADENC")) return RADENC;
  if (ascii(b, 0, "MSCF")) return CAB;
  if (bytesAt(b, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return OLE2;
  return null;
}

function sniffMedia(b: Uint8Array): Sniffed | null {
  if (ascii(b, 0, "OggS")) return OGG;
  if (ascii(b, 0, "fLaC")) return FLAC;
  if (ascii(b, 0, "FORM") && (ascii(b, 8, "AIFF") || ascii(b, 8, "AIFC"))) return AIFF;
  if (ascii(b, 0, "MThd")) return MIDI;
  if (ascii(b, 0, "FLV") && b[3] === 1) return FLV;
  if (bytesAt(b, 0, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return ASF;
  if (bytesAt(b, 0, [0, 0, 1, 0xba]) || bytesAt(b, 0, [0, 0, 1, 0xb3])) return MPEG;
  if (bytesAt(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    const head = String.fromCharCode(...b.subarray(0, Math.min(b.length, 64)));
    return head.includes("webm") ? WEBM : MKV;
  }
  const ftyp = sniffFtyp(b);
  if (ftyp) return ftyp;
  // Older QuickTime movies start straight with an atom.
  if (b.length >= 12 && u32be(b, 0) >= 8 && ["moov", "mdat", "wide", "free", "skip", "pnot"].some((a) => ascii(b, 4, a))) return MOV;
  return null;
}

/** A BOM-less UTF-16 text has a zero in every other byte. */
function looksUtf16(b: Uint8Array): boolean {
  if (b.length < 8) return false;
  let even = 0;
  let odd = 0;
  const pairs = b.length >> 1;
  for (let i = 0; i < pairs; i++) {
    if (b[2 * i] === 0) even++;
    if (b[2 * i + 1] === 0) odd++;
  }
  return (odd > pairs * 0.8 && even === 0) || (even > pairs * 0.8 && odd === 0);
}

function hasControl(b: Uint8Array): boolean {
  for (const c of b) if (c === 0 || isPlainControl(c)) return true;
  return false;
}

const isPlainControl = (c: number): boolean => c < 0x20 && c !== 9 && c !== 10 && c !== 12 && c !== 13 && c !== 27 && c !== 8 && c !== 0x1a && c !== 0x0b;

/** "utf16" for text with a UTF-16/32 byte-order mark (or the telltale zeros), "text" for ordinary text, null otherwise. */
function textKind(b: Uint8Array): "text" | "utf16" | null {
  const le = b[0] === 0xff && b[1] === 0xfe;
  if (le && b[2] === 0 && b[3] === 0) return "utf16";
  if (b[0] === 0 && b[1] === 0 && b[2] === 0xfe && b[3] === 0xff) return "utf16";
  if (le || (b[0] === 0xfe && b[1] === 0xff)) {
    for (let i = 2; i + 1 < b.length; i += 2) {
      const [lo, hi] = le ? [b[i]!, b[i + 1]!] : [b[i + 1]!, b[i]!];
      if (hi === 0 && isPlainControl(lo)) return null;
    }
    return "utf16";
  }
  if (looksUtf16(b)) return "utf16";
  // No control bytes: UTF-8, or an older 8-bit text encoding (Windows-1252, Latin-1).
  return hasControl(b) ? null : "text";
}

function sniffText(b: Uint8Array): Sniffed | null {
  const kind = textKind(b);
  if (!kind) return null;
  if (kind === "utf16") return TEXT;
  let head = "";
  for (let i = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0; i < b.length; i++) head += String.fromCharCode(b[i]!);
  // A shebang only counts at the very first byte.
  if (b[0] === 0x23 && b[1] === 0x21 && /^#![ \t]*\/[^\r\n]{0,300}(\r?\n|$)/.test(head)) return SCRIPT;
  head = head.trimStart();
  if (head.startsWith("{\\rtf")) return RTF;
  const lower = head.slice(0, 400).toLowerCase();
  if (/^<svg[\s>]/.test(lower)) return SVG;
  if (lower.startsWith("<?xml")) return lower.includes("<svg") ? SVG : XML;
  if (/^(<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<meta[\s>]|<title[\s>])/.test(lower)) return HTML;
  return TEXT;
}

/**
 * What the bytes at the start of a file say it is. `null` only for no bytes at all. Anything that isn't recognized
 * is "text" (it reads as text) or "binary" (it doesn't), never a guess about a specific format.
 */
export function sniffType(bytes: Uint8Array): Sniffed | null {
  const b = bytes.length > SNIFF_BYTES ? bytes.subarray(0, SNIFF_BYTES) : bytes;
  if (b.length === 0) return null;
  if (bytesAt(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (bytesAt(b, 0, [0xff, 0xd8, 0xff])) return JPEG;
  if (ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a")) return GIF;
  if (ascii(b, 0, "%PDF-")) return PDF;
  if (ascii(b, 0, "8BPS") && bytesAt(b, 4, [0, 1])) return PSD;
  if (ascii(b, 0, "SQLite format 3\0")) return SQLITE;
  if (ascii(b, 0, "bplist00")) return BPLIST;
  if (ascii(b, 0, "II*\0") || ascii(b, 0, "MM\0*") || ascii(b, 0, "II+\0") || ascii(b, 0, "MM\0+")) return TIFF;
  if (b[0] === 0x7f && ascii(b, 1, "ELF")) return ELF;
  return (
    sniffRiff(b) ?? sniffContainer(b) ?? sniffPe(b) ?? sniffMachO(b) ?? sniffBmp(b) ?? sniffIcon(b) ?? sniffFont(b) ?? sniffAudioStart(b) ?? sniffMedia(b) ??
    sniffText(b) ?? BINARY
  );
}
