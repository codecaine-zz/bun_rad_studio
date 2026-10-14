// Pure helpers of the Find tool: no page and no network, so they can be tested on their own.
// The sort and filter work like Fd Studio's (src/fd_helpers.ts) so the page and the server agree on what is shown.
import { plural } from "./util.js";

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

/** A new, sorted array. "Default order" (or an unknown key) keeps the order the search gave. */
export function sortItems(items, key) {
  const out = items.slice();
  switch (key) {
    case "Name (A→Z)": return out.sort(byName);
    case "Name (Z→A)": return out.sort((a, b) => byName(b, a));
    case "Size (largest)": return out.sort((a, b) => b.sizeBytes - a.sizeBytes);
    case "Size (smallest)": return out.sort((a, b) => a.sizeBytes - b.sizeBytes);
    case "Modified (newest)": return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
    case "Modified (oldest)": return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
    default: return out;
  }
}

/** Keeps the items whose name or relative path contains `query` (ignoring letter case). Empty keeps everything. */
export function filterItems(items, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return items.slice();
  return items.filter((it) => it.name.toLowerCase().includes(q) || (it.relativePath || "").toLowerCase().includes(q));
}

/** Puts `entry` first in the list of recent searches (no repeats, at most `cap`). */
export function pushHistory(history, entry, cap = 15) {
  const e = String(entry ?? "").trim();
  if (!e) return history.slice(0, cap);
  return [e, ...history.filter((x) => x !== e)].slice(0, cap);
}

/** "sub/deep/d.ts" gives "sub/deep"; a top-level item gives "". Results always use "/" in relative paths. */
export function dirOf(relativePath) {
  const i = relativePath.lastIndexOf("/");
  return i < 0 ? "" : relativePath.slice(0, i);
}

const TYPE_LABELS = { file: "File", directory: "Folder", symlink: "Link", executable: "Program", socket: "Socket", pipe: "Pipe", empty: "Empty", other: "Other" };
export const typeLabel = (type) => TYPE_LABELS[type] ?? "Other";

/** The text of a list of paths for the clipboard or a file: one per line. */
export function pathsText(items, kind) {
  return items.map((i) => (kind === "relative" ? i.relativePath : i.path)).join("\n");
}

/** Adds up the sizes of the files (folders have no size of their own). */
export function totalBytes(items) {
  return items.reduce((n, i) => n + (i.type === "directory" ? 0 : i.sizeBytes), 0);
}

/** The indexes from `a` to `b`, whichever is larger. */
export function rangeBetween(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/** "wc -l {}" has placeholders; the help text shows what each one means. */
export const PLACEHOLDER_HELP = [
  ["{}", "the full path of the item"],
  ["{/}", "just its name"],
  ["{//}", "the folder it is in"],
  ["{.}", "the full path without the ending (.txt)"],
  ["{/.}", "its name without the ending"],
];

/** A few of the names, for a confirmation ("a.txt, b.txt and 7 more"). */
export function sampleNames(items, count = 5) {
  const names = items.slice(0, count).map((i) => i.name);
  const more = items.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
}

/** Tells apart a plain "no" from a failure when summarising what a batch action did. */
export function summarizeBatch(verb, result) {
  const parts = [];
  if (result.done) parts.push(`${verb} ${plural(result.done, "item")}`);
  if (result.skipped) parts.push(`${result.skipped} skipped`);
  if (result.failed) parts.push(`${result.failed} couldn't be done`);
  return parts.length ? parts.join(", ") : "Nothing was changed";
}
