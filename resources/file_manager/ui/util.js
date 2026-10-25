// Pure helpers for the File Manager page: no DOM and no network, so they can be tested on their own.

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** "File 2" sorts before "File 10", and case is ignored. */
export const naturalCompare = (a, b) => collator.compare(a, b);

export function formatSize(bytes) {
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

/**
 * "Today, 3:45 PM", "Yesterday, 9:02 AM", "Mar 3, 2025". Empty for a missing date.
 * @param {number} ms
 * @param {number} [now]
 * @param {string} [locale]
 */
export function formatDate(ms, now = Date.now(), locale = undefined) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const today = new Date(now);
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

const KIND_ORDER = (e) => (e.isDir ? 0 : 1);

/** Sorted copy of `entries`. `by`: name | modified | size | type. Folders can be kept on top. */
export function sortEntries(entries, { by = "name", dir = "asc", foldersFirst = true } = {}) {
  const sign = dir === "desc" ? -1 : 1;
  const compare = (a, b) => {
    switch (by) {
      case "modified": return a.mtimeMs - b.mtimeMs;
      case "size": {
        const sa = a.isDir && !a.folderSizeCalculated ? -1 : a.size;
        const sb = b.isDir && !b.folderSizeCalculated ? -1 : b.size;
        return sa - sb;
      }
      case "type": return naturalCompare(a.label, b.label);
      default: return naturalCompare(a.name, b.name);
    }
  };
  return [...entries].sort((a, b) => {
    if (foldersFirst && KIND_ORDER(a) !== KIND_ORDER(b)) return KIND_ORDER(a) - KIND_ORDER(b);
    return sign * compare(a, b) || naturalCompare(a.name, b.name);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Paths (the server always sends absolute, normalized paths; `sep` is "/" or "\")
// ---------------------------------------------------------------------------------------------------------------

export function isWindowsPath(path) {
  return /^[A-Za-z]:[\\/]?/.test(path) || path.startsWith("\\\\");
}

export function joinPath(dir, name, sep) {
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

export function baseName(path, sep) {
  const trimmed = path.length > 1 && path.endsWith(sep) && !/^[A-Za-z]:\\$/.test(path) ? path.slice(0, -1) : path;
  const i = trimmed.lastIndexOf(sep);
  return i < 0 ? trimmed : trimmed.slice(i + 1) || trimmed;
}

export function parentOf(path, sep) {
  if (sep === "/") {
    if (path === "/") return null;
    const i = path.lastIndexOf("/");
    return i <= 0 ? "/" : path.slice(0, i);
  }
  const unc = /^\\\\[^\\]+\\[^\\]+/.exec(path);
  if (unc && path.length === unc[0].length) return null;
  if (/^[A-Za-z]:\\?$/.test(path)) return null;
  const i = path.lastIndexOf("\\");
  if (i < 0) return null;
  const parent = path.slice(0, i);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

/**
 * The clickable parts of an address, from the top down.
 * @param {string} path
 * @param {string} sep
 * @returns {Array<{ name: string, path: string, root?: boolean, ellipsis?: boolean }>}
 */
export function splitPath(path, sep) {
  if (sep === "/") {
    const parts = path.split("/").filter(Boolean);
    const out = [{ name: "Computer", path: "/", root: true }];
    let acc = "";
    for (const p of parts) {
      acc += `/${p}`;
      out.push({ name: p, path: acc });
    }
    return out;
  }
  const unc = /^\\\\([^\\]+)\\([^\\]+)/.exec(path);
  let root;
  let rest;
  if (unc) {
    root = { name: `\\\\${unc[1]}\\${unc[2]}`, path: unc[0], root: true };
    rest = path.slice(unc[0].length);
  } else {
    const drive = /^([A-Za-z]:)\\?/.exec(path);
    if (!drive) return [{ name: path, path, root: true }];
    root = { name: drive[1], path: `${drive[1]}\\`, root: true };
    rest = path.slice(drive[0].length);
  }
  const out = [root];
  let acc = root.path.replace(/\\$/, "");
  for (const p of rest.split("\\").filter(Boolean)) {
    acc += `\\${p}`;
    out.push({ name: p, path: acc });
  }
  return out;
}

/** True when `path` is `folder` or inside it. */
export function isInside(path, folder, sep, ignoreCase = false) {
  const a = ignoreCase ? path.toLowerCase() : path;
  const b = ignoreCase ? folder.toLowerCase() : folder;
  if (a === b) return true;
  return a.startsWith(b.endsWith(sep) ? b : b + sep);
}

/** The drive or mount that contains `path`: the longest matching entry of `drives`. */
export function driveFor(path, drives, sep) {
  const ci = sep === "\\";
  let best = null;
  for (const d of drives) if (isInside(path, d.path, sep, ci) && (!best || d.path.length > best.path.length)) best = d;
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Selection and keyboard
// ---------------------------------------------------------------------------------------------------------------

/** The index of the next entry whose name starts with `text` (case-insensitive), searching after `from` and wrapping. */
export function typeaheadFind(entries, text, from = -1) {
  const t = text.toLowerCase();
  if (!t) return -1;
  const n = entries.length;
  // typing the same letter again moves to the next entry starting with it
  const start = t.length > 1 && new Set(t).size === 1 ? from + 1 : t.length === 1 ? from + 1 : Math.max(from, 0);
  const needle = t.length > 1 && new Set(t).size === 1 ? t[0] : t;
  for (let i = 0; i < n; i++) {
    const idx = (start + i) % n;
    if (entries[idx].name.toLowerCase().startsWith(needle)) return idx;
  }
  return -1;
}

/** Indexes from `a` to `b` inclusive, in either direction. */
export function rangeIndexes(a, b) {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** Ctrl on Windows/Linux, Cmd on macOS. */
export const isModifier = (e, platform) => (platform === "darwin" ? e.metaKey : e.ctrlKey);

/** Holding Ctrl (Windows/Linux) or Option (macOS) while dropping copies instead of moving. */
export const wantsCopy = (e, platform) => (platform === "darwin" ? e.altKey : e.ctrlKey);

/** The lower-case ending of a file name without the dot: "photo.JPG" gives "jpg"; no ending gives "". */
export function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

export const EXTRACTABLE_EXTENSIONS = [
  "zip", "cbz", "whl", "jar", "apk", "ipa", "xpi",
  "tar", "tar.gz", "tgz", "tar.zst", "tzst",
  "gz", "svgz", "zst", "br",
  "tar.bz2", "tbz2", "tbz", "tar.xz", "txz", "tar.lz4", "tar.lzma", "tlz",
  "7z", "rar", "iso", "cab", "dmg", "cpio", "lzh", "lha", "xar", "ar", "rpm",
  "bz2", "xz", "lzma", "lz4", "z",
];

const EXTRACTABLE_SET = new Set(EXTRACTABLE_EXTENSIONS);

/** Lowercase extension of `name`, keeping compound `.tar.*` extensions intact. */
export function archiveExtensionOf(name) {
  if (typeof name !== "string") return "";
  const double = /\.(tar\.(?:gz|bz2|xz|zst|lz4|lzma))$/i.exec(name);
  if (double && double.index > 0) return double[1].toLowerCase();
  return extensionOf(name);
}

/** True when `name` is an archive or compressed file that can be extracted or uncompressed. */
export function isExtractableName(name) {
  return EXTRACTABLE_SET.has(archiveExtensionOf(name));
}

/** True when `entry` is a file that can be extracted or uncompressed. */
export function isExtractableEntry(entry) {
  return Boolean(entry && !entry.isDir && isExtractableName(entry.name));
}

/** Filters `entries` to only those files that can be extracted or uncompressed. */
export function extractableEntries(entries) {
  return Array.isArray(entries) ? entries.filter(isExtractableEntry) : [];
}

/** One sentence about the selection, for the status bar and screen readers. */
export function describeSelection(selected) {
  if (selected.length === 0) return "";
  const files = selected.filter((e) => !e.isDir);
  const folders = selected.length - files.length;
  const sizedFolders = selected.filter((e) => e.isDir && e.folderSizeCalculated);
  const bytes = files.reduce((n, e) => n + e.size, 0) + sizedFolders.reduce((n, e) => n + e.size, 0);
  const showBytes = files.length > 0 || sizedFolders.length > 0;
  const parts = [];
  if (folders) parts.push(plural(folders, "folder"));
  if (files.length) parts.push(plural(files.length, "file"));
  return `${parts.join(" and ")} selected${showBytes ? ` (${formatSize(bytes)})` : ""}`;
}

/**
 * Parses a human size token like "500b", "10kb", "1.5mb", "2gb", "empty", or "0" into bytes, or null if invalid.
 */
export function parseByteSizeToken(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  if (s === "empty" || s === "0") return 0;
  const m = /^(\d+(?:\.\d+)?)\s*(b|bytes?|k|kb|m|mb|g|gb|t|tb)?$/.exec(s);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num) || num < 0) return null;
  const unit = m[2] || "b";
  const mult = unit.startsWith("t") ? 1024 ** 4
    : unit.startsWith("g") ? 1024 ** 3
    : unit.startsWith("m") ? 1024 ** 2
    : unit.startsWith("k") ? 1024
    : 1;
  return Math.round(num * mult);
}

/**
 * Inspects clipboard text to suggest a smart filename, extension, and label when pasting text directly as a new file.
 */
export function detectSnippetInfo(text) {
  const raw = typeof text === "string" ? text : "";
  const trimmed = raw.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return { ext: "json", baseName: "Pasted data", label: "JSON data" };
    } catch { /* not valid JSON */ }
  }
  if (trimmed.startsWith("#!/")) {
    return { ext: "sh", baseName: "Pasted script", label: "Shell script" };
  }
  if (/^<!doctype\s+html\b|^<html\b/i.test(trimmed)) {
    return { ext: "html", baseName: "Pasted page", label: "HTML document" };
  }
  if (/^<svg\b[\s\S]*<\/svg>$/i.test(trimmed)) {
    return { ext: "svg", baseName: "Pasted vector", label: "SVG image" };
  }
  if (/^\s*(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(?:TABLE|VIEW|INDEX)|ALTER\s+TABLE|WITH\s+\w+\s+AS)\b/i.test(trimmed)) {
    return { ext: "sql", baseName: "Pasted query", label: "SQL query" };
  }
  if (/^(?:import\s+[\s\S]+?\s+from\s+["']|export\s+(?:const|let|function|async\s+function|class|default|interface|type)\s+)/m.test(trimmed)) {
    return { ext: "ts", baseName: "Pasted module", label: "TypeScript module" };
  }
  if (/^#{1,6}\s+\S/m.test(trimmed) || /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(trimmed) || /^```[\w-]*$/m.test(trimmed)) {
    return { ext: "md", baseName: "Pasted note", label: "Markdown note" };
  }
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length >= 2) {
    const sample = lines.slice(0, 10);
    const commas = sample.map((l) => l.split(",").length);
    if (commas[0] >= 2 && commas.every((c) => c === commas[0])) {
      return { ext: "csv", baseName: "Pasted table", label: "CSV table" };
    }
  }
  return { ext: "txt", baseName: "Pasted text", label: "Text file" };
}

/**
 * Shortens a long breadcrumb: keeps the root and the last `keep` parts, with "…" standing for the middle.
 * @param {Array<{ name: string, path: string, root?: boolean, ellipsis?: boolean }>} crumbs
 * @param {number} [keep]
 * @returns {Array<{ name: string, path: string, root?: boolean, ellipsis?: boolean }>}
 */
export function collapseCrumbs(crumbs, keep = 4) {
  if (crumbs.length <= keep + 1) return crumbs;
  return [crumbs[0], { name: "…", path: crumbs[crumbs.length - keep - 1].path, ellipsis: true }, ...crumbs.slice(-keep)];
}

/** Friendly sentence for a count of results. */
export function summarizeCount(total, shown) {
  if (total === 0) return "This folder is empty";
  return shown < total ? `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} items` : plural(total, "item");
}

// Which kinds of helper work a file name allows. The server has the same lists (fmTools.ts); a test keeps them equal.
const KIND_EXTENSIONS = {
  Pictures: "jpg jpeg png gif webp bmp tif tiff heic heif avif ico svg",
  Video: "mp4 mov mkv avi webm m4v wmv flv mpg mpeg 3gp ts",
  Sound: "mp3 wav flac aac m4a ogg opus wma aiff aif",
  Documents: "md markdown txt html htm docx odt rtf epub tex rst org textile",
};

/** @param {string} name @returns {string[]} */
export function kindsForName(name) {
  const ext = extensionOf(name);
  return Object.entries(KIND_EXTENSIONS).filter(([, list]) => list.split(" ").includes(ext)).map(([kind]) => kind);
}
