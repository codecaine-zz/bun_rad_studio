/**
 * What a file name may legitimately hold (`expectedFor`) and which names are traps on their own (`checkName`).
 * Deliberately conservative: an extension that isn't listed here is never judged, so a file with an unusual or no
 * extension is never reported.
 */
import { splitName } from "./fmPaths";
import type { Family, Sniffed } from "./fmSniff";

export interface ExtRule {
  /** What kind of thing the name promises. */
  family: Family;
  /** Content kinds that are fine under this extension. */
  kinds: ReadonlySet<string>;
  /** Plain text is what the name promises (so binary content is reported). */
  textLike: boolean;
}

const set = (...parts: string[][]): Set<string> => new Set(parts.flat());

/** Everything that reads as text. */
const TEXTY = ["text", "html", "xml", "svg", "script"];
/** The MP4 / QuickTime family shares one container, and the same file is often named any of these. */
const FTYP = ["mp4", "m4a", "m4v", "mov", "3gp", "heic", "avif"];
const ZIPPED = ["zip"];

const rules = new Map<string, ExtRule>();
function rule(exts: string, family: Family, kinds: Set<string>, textLike = false): void {
  for (const e of exts.split(" ")) rules.set(e, { family, kinds, textLike });
}

// Text and source code. Binary content is only reported for the plain formats; log, sql and ts may hold binary data.
rule(
  "txt md markdown csv tsv json jsonl ndjson xml xhtml html htm css scss less js mjs cjs jsx tsx py rb go rs java kt swift c cc cpp cs h hpp php lua dart vue svelte pl r " +
    "sh bash zsh fish bat cmd ps1 psm1 vbs vbe wsf hta sql yaml yml toml ini cfg conf log srt vtt ass tex rst nfo gitignore env properties diff patch ics vcf lst",
  "text",
  set(TEXTY),
  true,
);
rule("log sql diff patch", "text", set(TEXTY, ["binary"]), true);
rule("ts mts cts", "text", set(TEXTY, ["mpeg", "binary"]), true);
rule("svg", "image", set(["svg", "xml", "text", "html"]), true);
rule("plist", "text", set(TEXTY, ["bplist"]), true);
rule("key", "archive", set(ZIPPED, TEXTY, ["binary"]));

// Pictures
rule("png apng", "image", set(["png"]));
rule("jpg jpeg jpe jfif", "image", set(["jpeg"]));
rule("gif", "image", set(["gif"]));
rule("webp", "image", set(["webp"]));
rule("bmp dib", "image", set(["bmp"]));
rule("tif tiff", "image", set(["tiff"]));
rule("ico", "image", set(["ico", "cur"]));
rule("cur", "image", set(["cur", "ico"]));
rule("psd", "image", set(["psd"]));
rule("heic heif avif", "image", set(FTYP));

// Video and audio
rule("mp4 m4v mov qt 3gp 3g2 f4v", "video", set(FTYP));
rule("m4a m4b m4r", "audio", set(FTYP));
rule("mkv webm mka mk3d", "video", set(["mkv", "webm"]));
rule("avi", "video", set(["avi"]));
rule("wmv wma asf", "video", set(["asf"]));
rule("flv", "video", set(["flv"]));
rule("mpg mpeg mpe", "video", set(["mpeg"]));
rule("mp3", "audio", set(["mp3"]));
rule("aac", "audio", set(["aac"], FTYP));
rule("wav wave", "audio", set(["wav"]));
rule("flac", "audio", set(["flac"]));
rule("ogg oga ogv opus spx", "audio", set(["ogg"]));
rule("aif aiff aifc", "audio", set(["aiff"]));
rule("mid midi kar", "audio", set(["midi"]));

// Documents. Word and Excel also open web pages, plain text and the newer zipped formats saved under the old name.
rule("pdf", "document", set(["pdf"]));
rule("rtf", "document", set(["rtf"]));
rule("doc dot", "document", set(["ole2", "rtf", "zip", "html", "xml", "text"]));
rule("xls xlt xla xlw", "document", set(["ole2", "zip", "html", "xml", "text"]));
rule("ppt pps pot msg wps vsd vss pub mpp", "document", set(["ole2"]));
rule("msi", "program", set(["ole2"]));
rule("docx xlsx pptx dotx xltx potx ppsx docm xlsm pptm xlsb", "document", set(ZIPPED, ["ole2"]));
rule("odt ods odp odg odf ott ots otp epub pages numbers", "document", set(ZIPPED));

// Archives. ZIP is also what Office files, apps and packages are made of.
rule("zip zipx jar war ear apk aab ipa xpi whl egg nupkg vsix kmz sketch cbz", "archive", set(ZIPPED));
rule("rar", "archive", set(["rar"]));
rule("7z", "archive", set(["7z"]));
rule("gz tgz tar.gz", "archive", set(["gzip"]));
rule("svgz", "image", set(["gzip"]));
rule("bz2 tbz tbz2 tar.bz2", "archive", set(["bzip2"]));
rule("xz txz tar.xz", "archive", set(["xz"]));
rule("zst tar.zst", "archive", set(["zstd"]));
rule("tar", "archive", set(["tar"]));
rule("cab", "archive", set(["cab"]));
rule("radsec", "data", set(["radsec"]));
rule("radenc", "data", set(["radenc"]));

// Databases and fonts
rule("sqlite sqlite3 db3 s3db", "data", set(["sqlite"]));
rule("ttf", "font", set(["ttf", "otf", "ttc"]));
rule("otf", "font", set(["otf", "ttf"]));
rule("ttc", "font", set(["ttc", "ttf"]));
rule("woff", "font", set(["woff"]));
rule("woff2", "font", set(["woff2"]));

/** The rule for an extension (lower case, no dot, "tar.gz" allowed), or null when it is never judged. */
export function expectedFor(ext: string): ExtRule | null {
  return rules.get(ext.toLowerCase().replace(/^\./, "")) ?? null;
}

/**
 * How a real content relates to what an extension promises:
 * "ok" (fits, say nothing), "same" (another format of the same sort of thing), "different" (another sort of thing).
 */
export function judge(r: ExtRule, actual: Sniffed): "ok" | "same" | "different" {
  if (r.kinds.has(actual.kind)) return "ok";
  // Binary data that isn't recognised may be a rare or damaged format; only plain text names are sure it is wrong.
  if (actual.kind === "binary") return r.textLike ? "different" : "ok";
  // A .txt that is really Rich Text is a different format of a document, not a different sort of file.
  if (r.textLike && actual.kind === "rtf") return "same";
  return actual.family === r.family ? "same" : "different";
}

// ---------------------------------------------------------------------------------------------------------------
// Names that are traps by themselves
// ---------------------------------------------------------------------------------------------------------------

/** Extensions that start something when opened, or are a shortcut to something that does. */
export const LAUNCH_EXTS = new Set([
  "exe", "scr", "com", "pif", "bat", "cmd", "msi", "msp", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "lnk", "url", "jar", "ps1", "reg", "cpl",
  "app", "command", "dmg", "pkg", "apk", "sh",
]);

/** Extensions of things people open to read or look at: a launch extension after one of these is a disguise. */
export const DECOY_EXTS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv", "md",
  "jpg", "jpeg", "png", "gif", "bmp", "tif", "tiff", "heic", "webp", "svg", "ico",
  "mp3", "mp4", "mov", "avi", "mkv", "wav", "flac", "wmv", "m4a", "zip", "rar", "7z",
]);

export interface NameProblem {
  code: "BIDI_OVERRIDE" | "HIDDEN_CHARACTERS" | "DOUBLE_EXTENSION" | "PADDED_NAME" | "TRAILING_DOT_SPACE";
  title: string;
  detail: string;
  /** The name with invisible characters made visible. Only set when it differs. */
  visibleName?: string;
}

const BIDI = /[\u202A-\u202E\u2066-\u2069]/;
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B\u2060\uFEFF\u180E\u3164\uFFA0\u115F\u1160]/;
// eslint-disable-next-line no-control-regex
const HIDDEN_ALL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200B\u2060\uFEFF\u180E\u3164\uFFA0\u115F\u1160\u202A-\u202E\u2066-\u2069]/g;
const PADDED = /[ \u00a0\u2000-\u200a\u3000_.]{4,}\.[^. _\u00a0]+$/;

/** The name with each hidden character written out, like "report‹U+202E›fdp.exe". */
export function visibleName(name: string): string {
  return name.replace(HIDDEN_ALL, (c) => `‹U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}›`);
}

/** Name-only traps. These need no look inside the file. */
export function checkName(name: string): NameProblem | null {
  const shown = visibleName(name);
  if (BIDI.test(name)) {
    return {
      code: "BIDI_OVERRIDE",
      title: "Its name hides its real ending",
      detail: `The name contains a hidden character that flips the writing direction, which can make it look like it ends in a harmless type such as .pdf. Written out, it is "${shown}".`,
      visibleName: shown,
    };
  }
  if (HIDDEN.test(name)) {
    return {
      code: "HIDDEN_CHARACTERS",
      title: "Its name has hidden characters",
      detail: `The name contains characters you can't see, which can disguise what the file is. Written out, it is "${shown}".`,
      visibleName: shown,
    };
  }
  const parts = name.split(".");
  if (parts.length >= 3) {
    const last = parts[parts.length - 1]!.toLowerCase();
    const before = parts[parts.length - 2]!.trim().toLowerCase();
    if (LAUNCH_EXTS.has(last) && DECOY_EXTS.has(before)) {
      return {
        code: "DOUBLE_EXTENSION",
        title: "Its name ends in two file types",
        detail: `"${name}" looks like a ${before.toUpperCase()} file, but its real type is the last part, .${last}, which can start a program.`,
      };
    }
  }
  if (PADDED.test(name)) {
    return {
      code: "PADDED_NAME",
      title: "Its name is padded to hide its ending",
      detail: `"${name}" has a long gap just before its ending, which pushes the real file type out of sight in a narrow list.`,
    };
  }
  if (name.length > 1 && /[ .]$/.test(name)) {
    return {
      code: "TRAILING_DOT_SPACE",
      title: "Its name ends with a dot or a space",
      detail: `"${name}" ends with a dot or a space, which some systems drop when they look at the name, so it can be mistaken for a different file.`,
    };
  }
  return null;
}

/** True for names whose type needs real data inside (a picture, a sound, a PDF...), so an empty file under them is not that thing yet. */
export function needsContent(ext: string): boolean {
  const r = expectedFor(ext);
  return !!r && !r.textLike && !["sqlite", "sqlite3", "db3", "s3db"].includes(ext.toLowerCase());
}

export interface EndingNotice {
  /** The part before the last ending, as written ("txt" in "New file.txt.png"). */
  first: string;
  /** The last ending, which is the one that counts. */
  last: string;
  /** The name without the last ending. */
  withoutLast: string;
}

/**
 * A name with two known file types that don't belong together ("New file.txt.png"): only the last one counts, so the
 * file is treated as the last kind. Not for launch endings (those are name traps with their own, stronger message).
 */
export function checkEndings(name: string): EndingNotice | null {
  const clean = withoutTrailing(name);
  const parts = clean.split(".");
  if (parts.length < 3) return null;
  const last = parts[parts.length - 1]!.toLowerCase();
  const first = parts[parts.length - 2]!.trim().toLowerCase();
  if (!first || LAUNCH_EXTS.has(last)) return null;
  const lastRule = expectedFor(last);
  if (!lastRule) return null;
  const firstRule = expectedFor(first);
  const firstKnown = firstRule !== null || DECOY_EXTS.has(first);
  if (!firstKnown) return null;
  if (firstRule && firstRule.family === lastRule.family) return null;
  if (!firstRule && expectedFor(last)?.family === "text") return null;
  return { first, last, withoutLast: parts.slice(0, -1).join(".") };
}

/** The extension of a name as it is judged: lower case, no dot, "" when there is none. */
export function judgedExtension(name: string): string {
  return splitName(withoutTrailing(name))[1].replace(/^\./, "").toLowerCase();
}

/** The name without trailing dots and spaces, which Windows ignores when it looks at the ending. */
export function withoutTrailing(name: string): string {
  return name.replace(/[ .]+$/, "") || name;
}
