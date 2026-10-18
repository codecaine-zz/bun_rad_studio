/**
 * Pure helpers for the File Manager: what a file name may look like, which places must not be changed,
 * how to pick a free name, what kind of file something is, and how to explain a file-system error in plain words.
 *
 * Everything here takes the platform as a parameter (default: this machine), so the Windows rules can be tested
 * on macOS or Linux. Nothing here touches the disk except where a function says so.
 */
import * as nodePath from "path";

export type Platform = "win32" | "darwin" | "linux";

export const MAX_NAME_LENGTH = 255;

function pathFor(platform: Platform, sample?: string) {
  return platform === "win32" || (process.platform === "win32" && typeof sample === "string" && /^[A-Za-z]:[\\/]/.test(sample))
    ? nodePath.win32
    : nodePath.posix;
}

export function platformName(platform: string = process.platform): Platform {
  return platform === "win32" || platform === "darwin" ? platform : "linux";
}

/** What the platform calls its own file manager, for menu items like "Show in Finder". */
export function systemFileManagerName(platform: Platform = platformName()): string {
  return platform === "win32" ? "File Explorer" : platform === "darwin" ? "Finder" : "your file manager";
}

// ---------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------

const WINDOWS_RESERVED = new Set(["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`)]);

/** The name as the user meant it: surrounding spaces removed (they are never intended and Windows forbids trailing ones). */
export function cleanName(name: unknown): string {
  return typeof name === "string" ? name.trim() : "";
}

/** A plain-language reason why `name` cannot be a file or folder name here, or null when it is fine. */
export function validateName(name: unknown, platform: Platform = platformName()): string | null {
  if (typeof name !== "string") return "Type a name.";
  const n = name.trim();
  if (!n) return "Type a name.";
  if (n === "." || n === "..") return `"${n}" can't be used as a name.`;
  if (n.includes("\0")) return "A name can't contain an invisible null character.";
  if (n.includes("/")) return 'A name can\'t contain a "/" (it separates folders).';
  if (platform === "win32") {
    if (/[\\:*?"<>|]/.test(n)) return 'A name can\'t contain any of these characters: \\ : * ? " < > |';
    if (/[\u0000-\u001f]/.test(n)) return "A name can't contain control characters.";
    if (/[. ]$/.test(n)) return "On Windows a name can't end with a dot or a space.";
    const stem = n.split(".")[0]!.trim().toUpperCase();
    if (WINDOWS_RESERVED.has(stem)) return `"${stem}" is reserved by Windows and can't be used as a name.`;
    if (n.length > MAX_NAME_LENGTH) return `That name is too long (the limit is ${MAX_NAME_LENGTH} characters).`;
  } else if (Buffer.byteLength(n, "utf8") > MAX_NAME_LENGTH) {
    return `That name is too long (the limit is ${MAX_NAME_LENGTH} bytes, and some characters take more than one).`;
  }
  return null;
}

/** Splits "photo.final.jpg" into ["photo.final", ".jpg"]; ".bashrc" and "README" have no extension; ".tar.gz" counts as one. */
export function splitName(name: string): [string, string] {
  const double = /\.(tar\.(?:gz|bz2|xz|zst|lz4|lzma))$/i.exec(name);
  if (double && double.index > 0) return [name.slice(0, double.index), name.slice(double.index)];
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return [name, ""];
  return [name.slice(0, dot), name.slice(dot)];
}

/**
 * The first free variant of `name`. `exists` says whether a candidate is taken.
 *   style "number": "report.txt" -> "report (2).txt", "report (3).txt" ...
 *   style "copy":   "report.txt" -> "report copy.txt", "report copy 2.txt" ...
 */
export function uniqueName(name: string, exists: (candidate: string) => boolean, style: "number" | "copy" = "number"): string {
  if (!exists(name)) return name;
  const [base, ext] = splitName(name);
  for (let i = 1; i < 10_000; i++) {
    const candidate = style === "copy" ? (i === 1 ? `${base} copy${ext}` : `${base} copy ${i}${ext}`) : `${base} (${i + 1})${ext}`;
    if (!exists(candidate)) return candidate;
  }
  throw new FmError("NO_FREE_NAME", "Could not find a free name.");
}

// ---------------------------------------------------------------------------------------------------------------
// Paths that must not be changed
// ---------------------------------------------------------------------------------------------------------------

export interface ProtectContext {
  platform?: Platform;
  home: string;
  /** More places to keep safe (the app's own Recycle Bin folder). */
  extraProtected?: string[];
}

/** Top-level folders that must not be moved, renamed or deleted themselves. */
const POSIX_TOP = ["/bin", "/boot", "/dev", "/etc", "/lib", "/lib32", "/lib64", "/libexec", "/proc", "/root", "/run", "/sbin", "/sys", "/usr", "/var", "/home", "/Users", "/Volumes", "/System", "/Library", "/Applications", "/private", "/cores", "/opt", "/mnt", "/media", "/srv"];
/** Folders whose contents belong to the operating system: nothing inside may be changed from here. */
const POSIX_SYSTEM_INSIDE = ["/bin", "/boot", "/dev", "/etc", "/lib", "/lib32", "/lib64", "/libexec", "/proc", "/sbin", "/sys", "/usr", "/System", "/private/etc"];
const POSIX_SYSTEM_ALLOWED_INSIDE = ["/usr/local"];
const HOME_SUBFOLDERS = ["Desktop", "Documents", "Downloads", "Pictures", "Music", "Movies", "Videos", "Public", "Library", "AppData", "Templates"];
const WIN_TOP = ["windows", "program files", "program files (x86)", "programdata", "users", "system volume information", "$recycle.bin", "recovery"];
const WIN_SYSTEM_INSIDE = ["windows", "system volume information", "$recycle.bin", "recovery"];

function sameOrInside(child: string, parent: string, p: typeof nodePath.posix, ci: boolean): boolean {
  const a = ci ? child.toLowerCase() : child;
  const b = ci ? parent.toLowerCase() : parent;
  if (a === b) return true;
  const rel = p.relative(b, a);
  return rel !== "" && !rel.startsWith("..") && !p.isAbsolute(rel);
}

/**
 * Why `target` must not be changed (`kind: "modify"`: moved, renamed, deleted) or must not receive new items
 * (`kind: "create"`), in plain words; null when it is fine. Reading and copying are always allowed.
 */
export function protectedReason(target: string, ctx: ProtectContext, kind: "modify" | "create" = "modify"): string | null {
  const platform = ctx.platform ?? platformName();
  const p = pathFor(platform, target);
  const ci = platform !== "linux";
  const t = p.resolve(target);
  const home = p.resolve(ctx.home);

  for (const extra of ctx.extraProtected ?? []) {
    if (sameOrInside(t, p.resolve(extra), p, ci)) return "This folder belongs to the File Manager's Recycle Bin. Use the Recycle Bin to restore or delete items.";
  }

  if (platform === "win32") {
    const { root } = p.parse(t);
    const segments = t.slice(root.length).split("\\").filter(Boolean);
    if (/^\\\\/.test(root) && segments.length === 0) return "This is the top of a network location and can't be changed here.";
    if (kind === "modify" && segments.length === 0) return "This is the top of a drive and can't be moved, renamed or deleted.";
    const first = (segments[0] ?? "").toLowerCase();
    if (kind === "modify" && segments.length === 1 && WIN_TOP.includes(first)) return "This is a system folder that Windows needs to work, so it can't be moved, renamed or deleted.";
    if (segments.length >= 1 && WIN_SYSTEM_INSIDE.includes(first)) return "This is inside a system folder that Windows needs to work, so it can't be changed from here.";
  } else {
    if (kind === "modify" && t === "/") return "This is the top of the computer's file system and can't be moved, renamed or deleted.";
    if (kind === "modify" && POSIX_TOP.includes(t)) return "This is a system folder that your computer needs to work, so it can't be moved, renamed or deleted.";
    const allowed = POSIX_SYSTEM_ALLOWED_INSIDE.some((a) => sameOrInside(t, a, p, ci));
    if (!allowed && POSIX_SYSTEM_INSIDE.some((s) => sameOrInside(t, s, p, ci))) return "This is inside a system folder that your computer needs to work, so it can't be changed from here.";
  }

  if (kind === "modify") {
    if (t === home || (ci && t.toLowerCase() === home.toLowerCase())) return "This is your home folder and can't be moved, renamed or deleted.";
    if (HOME_SUBFOLDERS.some((name) => (ci ? t.toLowerCase() === p.join(home, name).toLowerCase() : t === p.join(home, name)))) {
      return "This is one of your main personal folders, so it can't be moved, renamed or deleted. You can change what's inside it.";
    }
  }
  return null;
}

/** True when `child` is `parent` itself or lies inside it (used to stop "move a folder into itself"). */
export function isSameOrInside(child: string, parent: string, platform: Platform = platformName()): boolean {
  const p = pathFor(platform, child);
  return sameOrInside(p.resolve(child), p.resolve(parent), p, platform !== "linux");
}

/**
 * The path a `file://` address stands for (`file:///Users/me/My%20Docs/a.txt` gives `/Users/me/My Docs/a.txt`), or null
 * when it can't be one on this platform (another computer's name, an encoded slash). On the platform this runs on it
 * is `Bun.fileURLToPath`; the Windows rules for a Windows path are written out so they can be tested anywhere.
 */
export function fileUrlToPath(text: string, platform: Platform = platformName()): string | null {
  try {
    let path: string;
    if (platform === platformName()) path = Bun.fileURLToPath(text);
    else if (platform === "win32") {
      const u = new URL(text);
      const body = decodeURIComponent(u.pathname);
      if (/%2f|%5c/i.test(u.pathname)) return null;
      const host = u.hostname.toLowerCase();
      path = host && host !== "localhost" ? `\\\\${u.hostname}${body.replace(/\//g, "\\")}` : body.replace(/^\/([A-Za-z]:)/, "$1").replace(/\//g, "\\");
    } else {
      const u = new URL(text);
      if (u.hostname && u.hostname.toLowerCase() !== "localhost") return null;
      if (/%2f/i.test(u.pathname)) return null;
      path = decodeURIComponent(u.pathname);
    }
    return path && !path.includes("\0") ? pathFor(platform).resolve(path) : null;
  } catch {
    return null;
  }
}

/** The `file://` address of an absolute path (`Bun.pathToFileURL`): spaces, # and ? are written as %20, %23 and %3F. */
export function pathToFileUrl(path: string): string {
  return Bun.pathToFileURL(path).href;
}

/**
 * Turns what a person typed in the address bar into an absolute path: `~` and `~/x` mean the home folder,
 * a pasted `file://` address means the path it stands for, surrounding quotes are dropped, a relative path is taken
 * from `cwd`, and on Windows `/` is accepted for `\`.
 */
export function parseTypedPath(input: string, cwd: string, home: string, platform: Platform = platformName()): string | null {
  const p = pathFor(platform);
  let text = typeof input === "string" ? input.trim() : "";
  if (!text || text.includes("\0")) return null;
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) text = text.slice(1, -1).trim();
  if (!text) return null;
  if (/^file:\/\//i.test(text)) return text.length > 7 ? fileUrlToPath(text, platform) : null;
  if (text === "~") return p.resolve(home);
  if (/^~[\\/]/.test(text)) return p.resolve(home, text.slice(2));
  if (platform === "win32") {
    text = text.replace(/\//g, "\\");
    if (/^[A-Za-z]:$/.test(text)) text += "\\";
  }
  return p.isAbsolute(text) ? p.resolve(text) : p.resolve(cwd, text);
}

// ---------------------------------------------------------------------------------------------------------------
// What kind of file is it
// ---------------------------------------------------------------------------------------------------------------

export interface FileKind {
  kind: "folder" | "image" | "video" | "audio" | "pdf" | "document" | "spreadsheet" | "presentation" | "archive" | "code" | "text" | "program" | "disk-image" | "font" | "other";
  icon: string;
  label: string;
  /** How the Info panel can show it without opening another program. */
  preview: "image" | "text" | null;
  /** Opening it would run a program or an installer, so the app asks first. */
  program: boolean;
}

const ALL_IMAGE_EXTS = [
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "svgz", "ico", "tif", "tiff", "heic", "heif", "avif",
  "raw", "psd", "cr2", "cr3", "nef", "arw", "dng", "orf", "rw2", "pef", "srw", "raf",
  "tga", "ppm", "pgm", "pbm", "pnm", "pam", "hdr", "exr", "dds", "pcx", "jp2", "j2k", "jpf", "jxl",
  "icns", "cur", "qoi", "sgi", "rgb", "xbm", "xpm", "wbmp", "pict", "pct", "iff", "lbm", "jfif", "pjpeg", "pjp", "apng",
];

const EXT_GROUPS: Array<[FileKind["kind"], string, string, string[]]> = [
  ["image", "🖼️", "image", ALL_IMAGE_EXTS],
  ["video", "🎞️", "video", ["mp4", "mov", "mkv", "avi", "webm", "wmv", "flv", "m4v", "mpg", "mpeg"]],
  ["audio", "🎵", "audio file", ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "aiff", "mid", "midi"]],
  ["pdf", "📕", "PDF document", ["pdf"]],
  ["document", "📄", "document", ["doc", "docx", "odt", "rtf", "pages", "epub", "mobi", "fb2"]],
  ["spreadsheet", "📊", "spreadsheet", ["xls", "xlsx", "xlsm", "ods", "csv", "tsv", "numbers"]],
  ["presentation", "📽️", "presentation", ["ppt", "pptx", "ppsx", "odp", "key"]],
  ["archive", "🗜️", "archive", ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "tbz2", "tbz", "xz", "txz", "zst", "tzst", "lzma", "tlz", "lz4", "br", "z", "cab", "iso", "whl", "cbz", "cpio", "lzh", "lha", "xar", "ar", "ipa", "xpi"]],
  ["code", "💻", "source file", ["js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs", "php", "html", "htm", "css", "scss", "json", "xml", "yaml", "yml", "toml", "sql", "lua", "dart", "vue", "svelte", "ps1", "bat", "cmd", "sh", "bash", "zsh", "v", "vsh", "vv", "zig", "nim", "ex", "exs", "erl", "hs", "ml", "clj", "scala", "groovy", "r", "jl", "pl", "pm", "fs", "fsx", "vb", "asm", "s", "m", "mm", "cc", "cxx", "hh", "hxx", "mts", "cts", "jsonc", "less", "sass", "graphql", "proto", "cmake", "gradle", "tf", "sol", "wat", "fish", "ksh"]],
  ["text", "📝", "text file", ["txt", "md", "markdown", "log", "ini", "cfg", "conf", "env", "gitignore", "rst", "tex", "nfo"]],
  ["program", "⚙️", "program", ["exe", "msi", "app", "command", "jar", "apk", "appimage", "scr", "com", "run", "vbs", "deb", "rpm", "pkg"]],
  ["disk-image", "💿", "disk image", ["dmg", "img", "vhd", "vmdk"]],
  ["font", "🔤", "font", ["ttf", "otf", "woff", "woff2", "ttc", "eot"]],
];

/** Plain names for source files whose extension alone says little (".v" is V, not Verilog or Coq). */
const LANGUAGE_NAMES: Record<string, string> = { v: "V", vsh: "V", vv: "V", zig: "Zig", nim: "Nim", ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell", ml: "OCaml", clj: "Clojure", jl: "Julia", fs: "F#", fsx: "F#", sol: "Solidity", wat: "WebAssembly text", tf: "Terraform", proto: "Protocol Buffers", graphql: "GraphQL" };

const BY_EXT = new Map<string, (typeof EXT_GROUPS)[number]>();
for (const g of EXT_GROUPS) for (const e of g[3]) if (!BY_EXT.has(e)) BY_EXT.set(e, g);

/** Opening any of these would start a program or an installer. */
const PROGRAM_EXTS = new Set(["exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "jar", "app", "command", "sh", "bash", "zsh", "run", "appimage", "deb", "rpm", "pkg", "dmg", "apk"]);
const IMAGE_PREVIEW = new Set(ALL_IMAGE_EXTS);

export function extensionOf(name: string): string {
  const [, ext] = splitName(name);
  return ext.replace(/^\./, "").toLowerCase();
}

export function classify(name: string, isDir: boolean, hasExecBit = false): FileKind {
  if (isDir) {
    if (name.toLowerCase().endsWith(".app")) return { kind: "program", icon: "⚙️", label: "Application", preview: null, program: true };
    return { kind: "folder", icon: "📁", label: "Folder", preview: null, program: false };
  }
  const ext = extensionOf(name);
  const lastPart = ext.slice(ext.lastIndexOf(".") + 1); // "tar.gz" is looked up as "gz"
  const group = BY_EXT.get(lastPart);
  const program = PROGRAM_EXTS.has(lastPart) || hasExecBit;
  if (!group) {
    return { kind: program ? "program" : "other", icon: program ? "⚙️" : "📃", label: ext ? `${ext.toUpperCase()} file` : "File", preview: null, program };
  }
  const [kind, icon, noun] = group;
  const label = kind === "code" && LANGUAGE_NAMES[lastPart] ? `${LANGUAGE_NAMES[lastPart]} source file` : kind === "image" || kind === "video" || kind === "code" || kind === "text" ? (ext ? `${ext.toUpperCase()} ${noun}` : noun) : noun;
  const preview: FileKind["preview"] = IMAGE_PREVIEW.has(ext) ? "image" : kind === "code" || kind === "text" ? "text" : null;
  return { kind, icon, label, preview, program: program || kind === "program" };
}

/** Files that are normally invisible: dotfiles everywhere, and a few names Windows keeps out of sight. */
export function isHiddenName(name: string, platform: Platform = platformName()): boolean {
  if (name.startsWith(".")) return true;
  if (platform === "win32") return ["desktop.ini", "thumbs.db", "$recycle.bin", "system volume information", "ntuser.dat", "pagefile.sys", "hiberfil.sys", "swapfile.sys"].includes(name.toLowerCase());
  return false;
}

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} byte${bytes === 1 ? "" : "s"}`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[i]}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Errors in plain words
// ---------------------------------------------------------------------------------------------------------------

export class FmError extends Error {
  code: string;
  /** Extra facts for the page, sent along with the error (for example what a file really is). */
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "FmError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** A file-system error explained the way a beginner can act on. `what` is a short phrase like "copy that". */
export function describeFsError(err: unknown, what = "do that"): { code: string; message: string } {
  if (err instanceof FmError) return { code: err.code, message: err.message };
  const e = err as NodeJS.ErrnoException;
  const code = e?.code ?? "UNKNOWN";
  switch (code) {
    case "ENOENT": return { code, message: "That item doesn't exist any more. It may have been moved or deleted by another program." };
    case "EACCES":
    case "EPERM": return { code, message: `You don't have permission to ${what}. Check that the item isn't locked or owned by another user.` };
    case "EEXIST": return { code, message: "An item with that name already exists." };
    case "ENOTEMPTY": return { code, message: "That folder isn't empty." };
    case "ENOSPC": return { code, message: "There isn't enough free space on the disk." };
    case "EDQUOT": return { code, message: "Your disk space quota is used up." };
    case "EBUSY": return { code, message: "That item is in use by another program. Close the program and try again." };
    case "EISDIR": return { code, message: "That is a folder, not a file." };
    case "ENOTDIR": return { code, message: "That is a file, not a folder." };
    case "EROFS": return { code, message: "That disk is read-only, so nothing can be changed on it." };
    case "ENAMETOOLONG": return { code, message: "That name or path is too long." };
    case "ELOOP": return { code, message: "That item is a link that points back to itself." };
    case "EMFILE":
    case "ENFILE": return { code, message: "Too many files are open at once. Try again with fewer items." };
    case "EXDEV": return { code, message: "That can't be moved directly between those disks." };
    case "EINVAL": return { code, message: "That isn't allowed here." };
    default: return { code, message: e?.message ? `Something went wrong: ${e.message}` : "Something went wrong." };
  }
}
