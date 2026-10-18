/**
 * Looking at things: folder listings, properties, folder sizes, the sidebar places and drives, previews and search.
 * Nothing here changes anything on disk.
 */
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, assertFolder, pathApi, tick, type FmContext } from "./fmCore";
import { mediaKindOf, thumbnailsAvailable, wantsThumbnail } from "./fmQuickLook";
import { FmError, classify, describeFsError, isHiddenName, systemFileManagerName } from "./fmPaths";

export interface Entry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  /** A link whose target is missing. */
  broken: boolean;
  size: number;
  mtimeMs: number;
  kind: string;
  icon: string;
  label: string;
  hidden: boolean;
  program: boolean;
  preview: "image" | "text" | null;
  readOnly: boolean;
  /** The twelve permission bits of the item itself; null for a link and on Windows. */
  mode: number | null;
}

export const MAX_LIST_ENTRIES = 50_000;

async function toEntry(ctx: FmContext, dir: string, name: string, p: typeof nodePath.posix): Promise<Entry | null> {
  const full = p.join(dir, name);
  let st: fs.Stats;
  try {
    st = await fsp.lstat(full);
  } catch {
    return null; // vanished while listing
  }
  let isDir = st.isDirectory();
  let broken = false;
  let target = st;
  const isSymlink = st.isSymbolicLink();
  if (isSymlink) {
    try {
      target = await fsp.stat(full);
      isDir = target.isDirectory();
    } catch {
      broken = true;
    }
  }
  const execBit = ctx.platform !== "win32" && !isDir && (target.mode & 0o111) !== 0;
  const kind = classify(name, isDir, execBit);
  return {
    name,
    path: full,
    isDir,
    isSymlink,
    broken,
    size: isDir ? 0 : target.size,
    mtimeMs: target.mtimeMs,
    kind: kind.kind,
    icon: broken ? "⛓️‍💥" : isSymlink && !isDir ? "🔗" : kind.icon,
    label: broken ? "Broken link" : isSymlink ? `Link to ${kind.label.toLowerCase()}` : kind.label,
    hidden: isHiddenName(name, ctx.platform),
    program: kind.program,
    preview: kind.preview,
    readOnly: ctx.platform === "win32" ? (target.mode & 0o200) === 0 : false,
    mode: ctx.platform === "win32" || isSymlink ? null : st.mode & 0o7777,
  };
}

export interface Listing {
  path: string;
  parent: string | null;
  entries: Entry[];
  total: number;
  truncated: boolean;
}

/** The listing entry for one item (what the file list would show for it), for opening a path from Recent or Favorites. */
export async function entryFor(ctx: FmContext, input: unknown): Promise<Entry> {
  const full = absolutePath(ctx, input);
  const p = pathApi(ctx);
  const name = p.basename(full);
  const dir = p.dirname(full);
  const entry = name && dir !== full ? await toEntry(ctx, dir, name, p) : null;
  if (!entry) throw new FmError("NOT_FOUND", `"${name || full}" isn't there any more. It may have been moved, renamed or deleted.`);
  return entry;
}

export async function listFolder(ctx: FmContext, input: unknown, options: { showHidden?: boolean } = {}): Promise<Listing> {
  const dir = absolutePath(ctx, input);
  const p = pathApi(ctx);
  await assertFolder(dir, "That folder");
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch (err) {
    throw new FmError(describeFsError(err).code, describeFsError(err, "open that folder").message);
  }
  const visible = options.showHidden ? names : names.filter((n) => !isHiddenName(n, ctx.platform));
  const total = visible.length;
  const slice = visible.length > MAX_LIST_ENTRIES ? visible.slice(0, MAX_LIST_ENTRIES) : visible;
  const entries: Entry[] = [];
  for (let i = 0; i < slice.length; i += 64) {
    const batch = await Promise.all(slice.slice(i, i + 64).map((n) => toEntry(ctx, dir, n, p)));
    for (const e of batch) if (e) entries.push(e);
  }
  const parent = p.dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, entries, total, truncated: total > slice.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Sizes and properties
// ---------------------------------------------------------------------------------------------------------------

export interface FolderStats {
  bytes: number;
  files: number;
  folders: number;
  /** The count stopped early (too many items or too long); the numbers are a minimum. */
  partial: boolean;
}

/** Adds up a folder without following links. Gives up politely after `maxEntries` items or `timeMs`. */
export async function folderStats(root: string, limits: { maxEntries?: number; timeMs?: number } = {}): Promise<FolderStats> {
  const maxEntries = limits.maxEntries ?? 300_000;
  const deadline = Date.now() + (limits.timeMs ?? 8000);
  const stats: FolderStats = { bytes: 0, files: 0, folders: 0, partial: false };
  const stack = [root];
  let seen = 0;
  while (stack.length) {
    const dir = stack.pop()!;
    let names: fs.Dirent[];
    try {
      names = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // not readable: skip it
    }
    for (const d of names) {
      if (++seen > maxEntries || Date.now() > deadline) {
        stats.partial = true;
        return stats;
      }
      const full = nodePath.join(dir, d.name);
      if (d.isSymbolicLink()) {
        stats.files++;
        continue;
      }
      if (d.isDirectory()) {
        stats.folders++;
        stack.push(full);
      } else {
        stats.files++;
        try {
          stats.bytes += (await fsp.lstat(full)).size;
        } catch {}
      }
      if (seen % 500 === 0) await tick();
    }
  }
  return stats;
}

export interface Properties {
  count: number;
  name: string;
  path: string | null;
  location: string | null;
  kind: string;
  isDir: boolean;
  size: number;
  files: number;
  folders: number;
  partial: boolean;
  createdMs: number | null;
  modifiedMs: number | null;
  accessedMs: number | null;
  permissions: string | null;
  readOnly: boolean;
  linkTarget: string | null;
  hidden: boolean;
}

export async function propertiesOf(ctx: FmContext, inputs: unknown): Promise<Properties> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new FmError("BAD_REQUEST", "Nothing was selected.");
  const paths = inputs.map((i) => absolutePath(ctx, i));
  const p = pathApi(ctx);
  let size = 0;
  let files = 0;
  let folders = 0;
  let partial = false;
  const stats: Array<{ path: string; lst: fs.Stats }> = [];
  for (const path of paths) {
    const lst = await fsp.lstat(path);
    stats.push({ path, lst });
    if (lst.isDirectory()) {
      const sub = await folderStats(path); // counts what is inside, not the folder itself
      size += sub.bytes;
      files += sub.files;
      folders += sub.folders;
      partial ||= sub.partial;
    } else {
      files++;
      size += lst.size;
    }
  }
  const first = stats[0]!;
  const single = paths.length === 1;
  let linkTarget: string | null = null;
  let targetStat = first.lst;
  if (single && first.lst.isSymbolicLink()) {
    linkTarget = await fsp.readlink(first.path).catch(() => null);
    targetStat = await fsp.stat(first.path).catch(() => first.lst);
  }
  const isDir = single ? targetStat.isDirectory() : false;
  const name = single ? p.basename(first.path) || first.path : `${paths.length} items`;
  const sameParent = paths.every((x) => p.dirname(x) === p.dirname(paths[0]!));
  return {
    count: paths.length,
    name,
    path: single ? first.path : null,
    location: sameParent ? p.dirname(paths[0]!) : null,
    kind: single ? (first.lst.isSymbolicLink() ? "Link" : classify(name, isDir).label) : "Several items",
    isDir,
    size,
    files,
    folders: single && !isDir ? 0 : folders,
    partial,
    createdMs: single ? first.lst.birthtimeMs || null : null,
    modifiedMs: single ? first.lst.mtimeMs : null,
    accessedMs: single ? first.lst.atimeMs : null,
    permissions: single && ctx.platform !== "win32" ? (targetStat.mode & 0o777).toString(8).padStart(3, "0") : null,
    readOnly: single ? (targetStat.mode & 0o200) === 0 : false,
    linkTarget,
    hidden: single ? isHiddenName(name, ctx.platform) : false,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Places and drives
// ---------------------------------------------------------------------------------------------------------------

export interface Place {
  id: string;
  name: string;
  path: string;
  icon: string;
  freeBytes?: number;
  totalBytes?: number;
}

function isDirectory(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function diskSpace(path: string): { freeBytes: number; totalBytes: number } | null {
  try {
    const s = (fs as any).statfsSync(path);
    return { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
  } catch {
    return null;
  }
}

/** Linux: folders named in ~/.config/user-dirs.dirs (they may be translated or moved). */
function xdgUserDirs(home: string): Record<string, string> {
  try {
    const text = fs.readFileSync(nodePath.join(home, ".config", "user-dirs.dirs"), "utf8");
    const out: Record<string, string> = {};
    for (const m of text.matchAll(/^XDG_(\w+)_DIR="([^"]+)"/gm)) out[m[1]!] = m[2]!.replace(/^\$HOME/, home);
    return out;
  } catch {
    return {};
  }
}

/** macOS: mount points that the system marks `nobrowse` (Recovery, Preboot ...): Finder hides these, so do we. */
export function parseNoBrowseMounts(mountOutput: string): Set<string> {
  const hidden = new Set<string>();
  for (const line of mountOutput.split("\n")) {
    const m = /^.+? on (.+) \(([^)]*)\)\s*$/.exec(line);
    if (m && m[2]!.split(",").map((o) => o.trim()).includes("nobrowse")) hidden.add(m[1]!);
  }
  return hidden;
}

/** Linux: the places that are really mounted, from /proc/mounts (spaces are written as \040). */
export function parseMountPoints(procMounts: string): Set<string> {
  const points = new Set<string>();
  for (const line of procMounts.split("\n")) {
    const parts = line.split(" ");
    if (parts.length >= 2 && parts[1]) points.add(parts[1].replace(/\\040/g, " ").replace(/\\011/g, "\t"));
  }
  return points;
}

function readNoBrowse(): Set<string> {
  try {
    const out = Bun.spawnSync(["/sbin/mount"], { stdout: "pipe", stderr: "ignore" });
    return out.exitCode === 0 ? parseNoBrowseMounts(out.stdout.toString()) : new Set();
  } catch {
    return new Set();
  }
}

const MAC_SYSTEM_VOLUMES = new Set(["Recovery", "Preboot", "VM", "Update", "xarts", "iSCPreboot", "Hardware"]);

export function listPlaces(ctx: FmContext): { places: Place[]; drives: Place[]; platform: string; fileManagerName: string; separator: string; home: string } {
  const p = pathApi(ctx);
  const xdg = ctx.platform === "linux" ? xdgUserDirs(ctx.home) : {};
  const candidates: Array<[string, string, string, string]> = [
    ["home", "Home", ctx.home, "🏠"],
    ["desktop", "Desktop", xdg.DESKTOP ?? p.join(ctx.home, "Desktop"), "🖥️"],
    ["documents", "Documents", xdg.DOCUMENTS ?? p.join(ctx.home, "Documents"), "📄"],
    ["downloads", "Downloads", xdg.DOWNLOAD ?? p.join(ctx.home, "Downloads"), "⬇️"],
    ["pictures", "Pictures", xdg.PICTURES ?? p.join(ctx.home, "Pictures"), "🖼️"],
    ["music", "Music", xdg.MUSIC ?? p.join(ctx.home, "Music"), "🎵"],
    ["videos", ctx.platform === "darwin" ? "Movies" : "Videos", xdg.VIDEOS ?? p.join(ctx.home, ctx.platform === "darwin" ? "Movies" : "Videos"), "🎞️"],
  ];
  const places = candidates.filter(([id, , path]) => id === "home" || isDirectory(path)).map(([id, name, path, icon]) => ({ id, name, path, icon }));

  const drives: Place[] = [];
  if (ctx.platform === "win32") {
    for (let c = 65; c <= 90; c++) {
      const root = `${String.fromCharCode(c)}:\\`;
      if (isDirectory(root)) drives.push({ id: `drive-${root}`, name: `Local Disk (${root.slice(0, 2)})`, path: root, icon: "💽", ...(diskSpace(root) ?? {}) });
    }
  } else {
    drives.push({ id: "drive-root", name: "Computer", path: "/", icon: "💻", ...(diskSpace("/") ?? {}) });
    const mountParents = ctx.platform === "darwin" ? ["/Volumes"] : ["/media", "/run/media", "/mnt"];
    const user = nodePath.basename(ctx.home);
    const hiddenVolumes = ctx.platform === "darwin" ? readNoBrowse() : new Set<string>();
    let mounted: Set<string> | null = null;
    if (ctx.platform === "linux") {
      try {
        mounted = parseMountPoints(fs.readFileSync("/proc/mounts", "utf8"));
      } catch {
        mounted = null;
      }
    }
    for (const parent of mountParents) {
      for (const base of [parent, nodePath.join(parent, user)]) {
        let names: string[] = [];
        try {
          names = fs.readdirSync(base);
        } catch {
          continue;
        }
        for (const n of names) {
          const full = nodePath.join(base, n);
          if (base === parent && nodePath.join(parent, user) === full) continue; // the per-user folder only holds drives
          try {
            if (fs.lstatSync(full).isSymbolicLink() && fs.realpathSync(full) === "/") continue; // the startup disk, listed as "Computer"
          } catch {
            continue;
          }
          if (hiddenVolumes.has(full) || (ctx.platform === "darwin" && MAC_SYSTEM_VOLUMES.has(n))) continue;
          if (mounted && !mounted.has(full)) continue; // an empty folder under /mnt, not a disk
          if (isDirectory(full) && !drives.some((d) => d.path === full)) drives.push({ id: `drive-${full}`, name: n, path: full, icon: "💾", ...(diskSpace(full) ?? {}) });
        }
      }
    }
  }
  return { places, drives, platform: ctx.platform, fileManagerName: systemFileManagerName(ctx.platform), separator: p.sep, home: ctx.home };
}

// ---------------------------------------------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------------------------------------------

import { inspectRichPreview, type RichPreview } from "./fmPreview";

export const PREVIEW_BYTES = 64 * 1024;

export type Preview =
  | { type: "text"; text: string; truncated: boolean; size: number; rich?: RichPreview }
  | { type: "image"; size: number }
  /** Sound or video the page can play itself (streamed from /api/raw). */
  | { type: "audio" | "video"; size: number }
  /** A document the system can draw a picture of (macOS Quick Look): /api/raw?thumb=1. */
  | { type: "thumb"; size: number; rich?: RichPreview }
  | { type: "binary"; size: number; rich?: RichPreview }
  | { type: "none"; size: number };

export async function previewFile(ctx: FmContext, input: unknown): Promise<Preview> {
  const path = absolutePath(ctx, input);
  const st = await fsp.stat(path);
  if (st.isDirectory()) return { type: "none", size: 0 };
  const base = nodePath.basename(path);
  const kind = classify(base, false);
  if (kind.preview === "image") return { type: "image", size: st.size };
  const media = mediaKindOf(base);
  if (media) return { type: media, size: st.size };
  const hasThumb = wantsThumbnail(base) && thumbnailsAvailable(ctx);
  if (st.size === 0) {
    return hasThumb ? { type: "thumb", size: 0 } : { type: "text", text: "", truncated: false, size: 0 };
  }
  const handle = await fsp.open(path, "r");
  try {
    const length = Math.min(st.size, PREVIEW_BYTES);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const head = buffer.subarray(0, bytesRead);
    if (hasThumb) {
      const rich = await inspectRichPreview(handle, path, st.size, head, null, true).catch(() => null);
      return { type: "thumb", size: st.size, ...(rich ? { rich } : {}) };
    }
    let isBin = head.subarray(0, 8192).includes(0);
    if (!isBin && kind.preview !== "text") {
      // Unknown extension: show it as text only when it really looks like text.
      let odd = 0;
      for (const b of head.subarray(0, 4096)) if (b < 9 || (b > 13 && b < 32)) odd++;
      if (odd > 4096 * 0.02) isBin = true;
    }
    if (isBin) {
      const rich = await inspectRichPreview(handle, path, st.size, head, null, false).catch(() => null);
      return { type: "binary", size: st.size, ...(rich ? { rich } : {}) };
    }
    const text = new TextDecoder("utf-8").decode(head);
    const rich = await inspectRichPreview(handle, path, st.size, head, text, false).catch(() => null);
    return { type: "text", text, truncated: st.size > bytesRead, size: st.size, ...(rich ? { rich } : {}) };
  } finally {
    await handle.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------------------------------

export interface SearchOptions {
  showHidden?: boolean;
  maxResults?: number;
  timeMs?: number;
  maxDepth?: number;
  /** Only this kind of file (image, video, audio, document, ...). Folders are always matched by name. */
  kind?: string;
}

export interface SearchResult {
  entries: Array<Entry & { folder: string }>;
  truncated: boolean;
  /** Folders that could not be read (no permission). */
  skipped: number;
  scanned: number;
}

/** "photo" matches any name containing it; "*.jpg" or "report?.txt" match the whole name. Case does not matter. */
export function nameMatcher(query: string): (name: string) => boolean {
  const q = query.trim().toLowerCase();
  if (/[*?]/.test(q)) {
    const re = new RegExp("^" + q.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i");
    return (name) => re.test(name);
  }
  return (name) => name.toLowerCase().includes(q);
}

export async function searchFolder(ctx: FmContext, rootInput: unknown, queryInput: unknown, options: SearchOptions = {}): Promise<SearchResult> {
  const root = absolutePath(ctx, rootInput);
  const query = typeof queryInput === "string" ? queryInput.trim() : "";
  if (!query) throw new FmError("BAD_REQUEST", "Type something to search for.");
  await assertFolder(root, "That folder");
  const p = pathApi(ctx);
  const matches = nameMatcher(query);
  const maxResults = options.maxResults ?? 1000;
  const maxDepth = options.maxDepth ?? 12;
  const deadline = Date.now() + (options.timeMs ?? 10_000);
  const result: SearchResult = { entries: [], truncated: false, skipped: 0, scanned: 0 };
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift()!;
    let names: string[];
    try {
      names = await fsp.readdir(dir);
    } catch {
      result.skipped++;
      continue;
    }
    for (const name of names) {
      if (!options.showHidden && isHiddenName(name, ctx.platform)) continue;
      result.scanned++;
      if (Date.now() > deadline || result.entries.length >= maxResults) {
        result.truncated = true;
        return result;
      }
      const full = p.join(dir, name);
      let nameMatches = matches(name);
      let lst: fs.Stats | null = null;
      if (nameMatches || depth < maxDepth) {
        lst = await fsp.lstat(full).catch(() => null);
        if (!lst) continue;
      }
      if (lst && lst.isDirectory() && depth < maxDepth) queue.push({ dir: full, depth: depth + 1 });
      if (nameMatches) {
        const entry = await toEntry(ctx, dir, name, p);
        if (entry && (!options.kind || entry.isDir || entry.kind === options.kind)) result.entries.push({ ...entry, folder: dir });
      }
      if (result.scanned % 300 === 0) await tick();
    }
  }
  return result;
}
