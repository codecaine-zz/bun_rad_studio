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
      case "size": return (a.isDir ? -1 : a.size) - (b.isDir ? -1 : b.size);
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
// Paths (the server always sends absolute, normalised paths; `sep` is "/" or "\")
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

/** One sentence about the selection, for the status bar and screen readers. */
export function describeSelection(selected) {
  if (selected.length === 0) return "";
  const files = selected.filter((e) => !e.isDir);
  const folders = selected.length - files.length;
  const bytes = files.reduce((n, e) => n + e.size, 0);
  const parts = [];
  if (folders) parts.push(plural(folders, "folder"));
  if (files.length) parts.push(plural(files.length, "file"));
  return `${parts.join(" and ")} selected${files.length ? ` (${formatSize(bytes)})` : ""}`;
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
