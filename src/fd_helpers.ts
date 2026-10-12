/**
 * Pure helpers for Fd Studio: saved-search presets, result sorting/filtering,
 * search history and limit parsing. No GUI or filesystem access, so they are unit-testable.
 */

export interface FdPreset {
  /** Dropdown label. */
  label: string;
  pattern: string;
  exts: string;
  size: string;
  /** Matches an entry of the "Modified" dropdown, or "Any Time". */
  age: string;
  /** Type filter: all | file | directory | executable | symlink | empty */
  type: "all" | "file" | "directory" | "executable" | "symlink" | "empty";
}

export const FD_PRESET_NONE = "Presets…";

export const FD_PRESETS: FdPreset[] = [
  { label: "Large files (>10M)", pattern: "", exts: "", size: "+10M", age: "Any Time", type: "file" },
  { label: "Recently modified (24h)", pattern: "", exts: "", size: "", age: "Last 24 hours", type: "file" },
  { label: "Images", pattern: "", exts: "png,jpg,jpeg,gif,webp,svg,heic", size: "", age: "Any Time", type: "file" },
  { label: "Source code", pattern: "", exts: "ts,tsx,js,jsx,py,go,rs,java,c,cpp,h,swift", size: "", age: "Any Time", type: "file" },
  { label: "Documents", pattern: "", exts: "md,txt,pdf,doc,docx,rtf", size: "", age: "Any Time", type: "file" },
  { label: "Logs", pattern: "", exts: "log", size: "", age: "Any Time", type: "file" },
  { label: "Empty files & folders", pattern: "", exts: "", size: "", age: "Any Time", type: "empty" },
  { label: "Directories only", pattern: "", exts: "", size: "", age: "Any Time", type: "directory" },
];

export function findPreset(label: string): FdPreset | undefined {
  return FD_PRESETS.find((p) => p.label === label);
}

export const FD_SORT_KEYS = [
  "Default order",
  "Name (A→Z)",
  "Name (Z→A)",
  "Size (largest)",
  "Size (smallest)",
  "Modified (newest)",
  "Modified (oldest)",
] as const;

export interface SortableItem {
  name: string;
  sizeBytes: number;
  mtimeMs: number;
  relativePath?: string;
}

/** Returns a new, sorted array. "Default order" (or unknown keys) preserves input order. */
export function sortResults<T extends SortableItem>(items: T[], key: string): T[] {
  const out = items.slice();
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  switch (key) {
    case "Name (A→Z)":
      return out.sort(byName);
    case "Name (Z→A)":
      return out.sort((a, b) => byName(b, a));
    case "Size (largest)":
      return out.sort((a, b) => b.sizeBytes - a.sizeBytes);
    case "Size (smallest)":
      return out.sort((a, b) => a.sizeBytes - b.sizeBytes);
    case "Modified (newest)":
      return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
    case "Modified (oldest)":
      return out.sort((a, b) => a.mtimeMs - b.mtimeMs);
    default:
      return out;
  }
}

/** Case-insensitive substring filter over name and relative path. Empty query returns a copy. */
export function filterResults<T extends SortableItem>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice();
  return items.filter((it) => it.name.toLowerCase().includes(q) || (it.relativePath || "").toLowerCase().includes(q));
}

/** Parses the max-results box; blank/invalid → default, clamped to [1, hardCap]. */
export function parseMaxResults(raw: string, def = 1500, hardCap = 20000): number {
  const n = parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, hardCap);
}

/** Adds an entry to the front of the history, removing duplicates and capping its length. */
export function pushHistory(history: string[], entry: string, cap = 15): string[] {
  const e = entry.trim();
  if (!e) return history.slice(0, cap);
  return [e, ...history.filter((h) => h !== e)].slice(0, cap);
}

/** Builds a safe default file name for save-as dialogs. */
export function exportFileName(ext: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
  return `fd_results_${stamp}.${ext.replace(/^\./, "")}`;
}
