/**
 * Pure helpers for Launcher Studio: argument parsing/quoting, search ranking,
 * running-process matching, sorting and relative-time formatting.
 * Kept free of GUI/process side effects so they are unit-testable.
 */

export interface LauncherApp {
  id: string;
  name: string;
  displayName: string;
  category: string;
  displayPath: string;
  description?: string;
  command?: string;
  isFavorite?: boolean;
  isRunning?: boolean;
  lastLaunched?: number;
  launchCount?: number;
}

/**
 * Split an argument string the way a shell would (single/double quotes and backslash escapes),
 * without ever invoking a shell. Unterminated quotes are accepted leniently.
 */
export function parseArgs(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quote) {
      if (c === quote) { quote = null; continue; }
      if (c === "\\" && quote === '"' && i + 1 < input.length && /["\\$`]/.test(input[i + 1]!)) { cur += input[++i]; continue; }
      cur += c;
    } else if (c === '"' || c === "'") {
      quote = c; has = true;
    } else if (c === "\\" && i + 1 < input.length) {
      cur += input[++i]; has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) { out.push(cur); cur = ""; has = false; }
    } else {
      cur += c; has = true;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

/** POSIX single-quote a single token so it is inert inside a shell command line. */
export function shellQuote(token: string): string {
  if (token === "") return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/** Join tokens into a safe shell command line (used for "open in Terminal"). */
export function buildShellCommand(tokens: string[]): string {
  return tokens.map(shellQuote).join(" ");
}

/** Multi-word AND search over name, id, category, path, description and command. Returns a score (0 = no match). */
export function searchScore(app: LauncherApp, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  const name = app.displayName.toLowerCase();
  const key = app.name.toLowerCase();
  const id = app.id.toLowerCase();
  const cat = app.category.toLowerCase();
  const path = app.displayPath.toLowerCase();
  const desc = (app.description || "").toLowerCase();
  const cmd = (app.command || "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    let s = 0;
    if (name === t || key === t) s = 100;
    else if (name.startsWith(t) || key.startsWith(t)) s = 60;
    else if (name.includes(t) || key.includes(t)) s = 40;
    else if (id.includes(t)) s = 30;
    else if (cat.includes(t)) s = 20;
    else if (path.includes(t) || cmd.includes(t)) s = 15;
    else if (desc.includes(t)) s = 8;
    else if (isSubsequence(t, key) && t.length >= 3) s = 5; // "tskmgr" style fuzzy match
    if (s === 0) return 0;
    score += s;
  }
  return score;
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const c of hay) if (c === needle[i]) i++;
  return i === needle.length;
}

export type SortMode = "default" | "recent" | "most_used" | "name";
export const SORT_LABELS: Record<SortMode, string> = {
  default: "Favorites, running, A-Z",
  recent: "Recently used",
  most_used: "Most used",
  name: "Name A-Z",
};

export function sortModeFromLabel(label: string): SortMode {
  for (const [k, v] of Object.entries(SORT_LABELS)) if (v === label || label.includes(v)) return k as SortMode;
  return "default";
}

export function sortApps<T extends LauncherApp>(apps: T[], mode: SortMode): T[] {
  const copy = apps.slice();
  const byName = (a: T, b: T) => a.displayName.localeCompare(b.displayName);
  switch (mode) {
    case "recent":
      return copy.sort((a, b) => (b.lastLaunched || 0) - (a.lastLaunched || 0) || byName(a, b));
    case "most_used":
      return copy.sort((a, b) => (b.launchCount || 0) - (a.launchCount || 0) || byName(a, b));
    case "name":
      return copy.sort(byName);
    default:
      return copy.sort((a, b) =>
        Number(!!b.isFavorite) - Number(!!a.isFavorite) ||
        Number(!!b.isRunning) - Number(!!a.isRunning) ||
        byName(a, b));
  }
}

/** "just now", "5m ago", "3h ago", "2d ago", or "never". */
export function relativeTime(ts: number | undefined, now = Date.now()): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)}d ago`;
  return `${Math.round(s / (86400 * 30))}mo ago`;
}

/** Compact usage text for the table: "12× · 3h ago" or "—". */
export function usageLabel(app: LauncherApp, now = Date.now()): string {
  if (!app.launchCount) return "—";
  return `${app.launchCount}× · ${relativeTime(app.lastLaunched, now)}`;
}

/**
 * Does this `ps` entry represent the given script run by a JS runtime?
 * Requires a runtime executable (bun/node/deno) and the script as a whole path segment, so
 * editors that merely have the file open, `grep`, `tail`, or look-alike names do not count.
 */
export function isScriptProcess(comm: string, args: string, relPath: string): boolean {
  const exe = (comm.split("/").pop() || "").toLowerCase();
  if (!/^(bun|node|deno|bunx)$/.test(exe) && !/^(bun|node|deno)\b/.test((args.split(/\s+/)[0]!.split("/").pop() || "").toLowerCase())) return false;
  const rel = relPath.replace(/^\.\//, "");
  const tokens = args.split(/\s+/);
  return tokens.some((tok) => tok === rel || tok === `./${rel}` || tok.endsWith(`/${rel}`));
}
