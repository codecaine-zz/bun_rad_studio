/**
 * Version tools for the Dev tab, with `Bun.semver`: compare two versions, check a version against a range
 * (^1.2.0, >=2 <3, 1.x), sort a list, and check the developer tools installed here against what a project asks for
 * (package.json "engines", .tool-versions, .nvmrc and similar).
 *
 * `Bun.semver` is lenient (it treats text that isn't a range as "anything goes" and may read "1.2" as a version), so
 * every version and range is checked against the strict shapes first and the person gets a plain-words message.
 */
import { promises as fsp } from "fs";
import { join } from "path";
import type { FmContext } from "./fmCore";
import { detectEnvironment } from "./fmDevEnv";
import { FmError } from "./fmPaths";

export const MAX_LIST_LINES = 2000;
export const MAX_VERSION_CHARS = 100;
export const MAX_RANGE_CHARS = 200;

const VERSION = /^[v=]?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const COMPARATOR = /^(?:[\^~]|>=?|<=?|=)?v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** The version without a leading "v" or "=", or null when it isn't a full MAJOR.MINOR.PATCH version. */
export function cleanVersion(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  return t.length <= MAX_VERSION_CHARS && VERSION.test(t) ? t.replace(/^[v=]/, "") : null;
}

/** Is this a range written the way npm writes them? (alternatives with ||, spaces for "and", hyphen ranges) */
export function isRange(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > MAX_RANGE_CHARS) return false;
  return t.split("||").every((alt) => {
    const a = alt.trim();
    if (!a) return false;
    const hyphen = a.split(/\s+-\s+/);
    if (hyphen.length === 2) return hyphen.every((v) => COMPARATOR.test(v));
    return a.split(/\s+/).every((tok) => COMPARATOR.test(tok));
  });
}

const notAVersion = (text: string) => new FmError("BAD_VERSION", `“${text.slice(0, 40)}” isn't a version. A version has three numbers separated by dots, like 1.4.2 (a leading v is fine). Pre-release labels such as 1.0.0-beta.2 are allowed.`);

function mustVersion(text: unknown, which: string): string {
  if (typeof text !== "string" || !text.trim()) throw new FmError("BAD_REQUEST", `Type ${which} first.`);
  const v = cleanVersion(text);
  if (!v) throw notAVersion(text.trim());
  return v;
}

export interface Comparison {
  a: string;
  b: string;
  /** -1: the first is older, 0: the same, 1: the first is newer. */
  order: -1 | 0 | 1;
  message: string;
  notes: string[];
}

const preRelease = (v: string) => VERSION.exec(v)?.[4] !== undefined;

/** Which of two versions is older? Build metadata (after a +) is ignored, as the semver rules say. */
export function compareVersions(aText: unknown, bText: unknown): Comparison {
  const a = mustVersion(aText, "the first version");
  const b = mustVersion(bText, "the second version");
  const order = Bun.semver.order(a, b) as -1 | 0 | 1;
  const notes: string[] = [];
  if (preRelease(a) || preRelease(b)) notes.push("A pre-release (like 1.0.0-beta.1) comes before the finished version it leads up to (1.0.0).");
  if (a.includes("+") || b.includes("+")) notes.push("Build information after a + is ignored when versions are compared.");
  const message = order === 0 ? `${a} and ${b} are the same version.` : order < 0 ? `${a} is older than ${b}.` : `${a} is newer than ${b}.`;
  return { a, b, order, message, notes };
}

export interface RangeCheck {
  version: string;
  range: string;
  satisfies: boolean;
  message: string;
  notes: string[];
}

/** Does a version fit a range such as ^1.2.0 (1.2.0 up to, not including, 2.0.0)? */
export function checkRange(versionText: unknown, rangeText: unknown): RangeCheck {
  const version = mustVersion(versionText, "a version");
  if (typeof rangeText !== "string" || !rangeText.trim()) throw new FmError("BAD_REQUEST", "Type a range first, like ^1.2.0 or >=2 <3.");
  const range = rangeText.trim();
  if (!isRange(range)) {
    throw new FmError("BAD_RANGE", `“${range.slice(0, 40)}” isn't a range I can read. Examples: ^1.2.0 (compatible with 1.2.0), ~1.2.0 (patches only), >=2 <3 (between), 1.x (any 1.something), 1.2.3 - 2.0.0, or alternatives joined with ||.`);
  }
  const satisfies = Bun.semver.satisfies(version, range);
  const notes: string[] = [];
  if (!satisfies && preRelease(version)) notes.push("A pre-release version only fits a range that names a pre-release of the same x.y.z, so a beta of 1.3.0 doesn't fit ^1.2.0.");
  return { version, range, satisfies, message: satisfies ? `${version} fits ${range}.` : `${version} does not fit ${range}.`, notes };
}

export interface SortedList {
  sorted: string[];
  /** Lines that aren't versions: [line number, text]. */
  invalid: Array<[number, string]>;
  duplicates: number;
}

/** Sorts one version per line, oldest first (or newest first). Lines that aren't versions are listed, not guessed at. */
export function sortVersions(text: unknown, descending = false): SortedList {
  if (typeof text !== "string" || !text.trim()) throw new FmError("BAD_REQUEST", "Paste some versions first, one on each line.");
  const lines = text.split(/\r?\n/);
  if (lines.length > MAX_LIST_LINES) throw new FmError("TOO_LARGE", `That is more than ${MAX_LIST_LINES.toLocaleString("en-US")} lines. Sort a shorter list.`);
  const good: string[] = [];
  const invalid: Array<[number, string]> = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const v = cleanVersion(t);
    if (v) good.push(v);
    else invalid.push([i + 1, t.slice(0, 60)]);
  });
  if (!good.length) throw new FmError("BAD_VERSION", "None of those lines is a version. A version has three numbers separated by dots, like 1.4.2.");
  const unique = [...new Set(good)];
  const sorted = unique.sort((x, y) => Bun.semver.order(x, y));
  if (descending) sorted.reverse();
  return { sorted, invalid: invalid.slice(0, 50), duplicates: good.length - unique.length };
}

// ---------------------------------------------------------------------------------------------------------------
// What a project asks for, compared with what is installed
// ---------------------------------------------------------------------------------------------------------------

export interface Requirement {
  tool: string;
  /** Where the requirement was written. */
  source: string;
  wanted: string;
  installed: string | null;
  status: "ok" | "older" | "newer" | "missing" | "unknown";
  message: string;
}

/** package.json "engines" names, .tool-versions names and others, mapped to the id of a developer tool. */
const TOOL_ALIASES: Record<string, string> = { node: "node", nodejs: "node", bun: "bun", npm: "npm", pnpm: "pnpm", yarn: "yarn", deno: "deno", python: "python3", python3: "python3", golang: "go", go: "go", ruby: "ruby", php: "php", java: "java", rust: "rustc", rustc: "rustc", dotnet: "dotnet", "dotnet-core": "dotnet" };
const PIN_FILES: Array<[file: string, tool: string]> = [[".nvmrc", "node"], [".node-version", "node"], [".bun-version", "bun"], [".python-version", "python3"], [".ruby-version", "ruby"]];

/** The version inside a tool's `--version` answer ("v20.11.0", "Python 3.12.1", "go1.22.0"), with .0 added when only two numbers were given. */
export function versionIn(text: string | null | undefined): string | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.]+))?/.exec(text ?? "");
  return m ? `${m[1]}.${m[2]}.${m[3] ?? "0"}${m[4] ? `-${m[4]}` : ""}` : null;
}

/** A pin such as "20", "20.11" or "v20.11.0" as the range it means ("20.x", "20.11.x" or exactly that version), or null when it can't be read ("lts/*"). */
export function pinRange(pin: string): string | null {
  const t = pin.trim().replace(/^v/, "");
  if (/^\d+$/.test(t) || /^\d+\.\d+$/.test(t)) return `${t}.x`;
  return cleanVersion(t) ? `=${t}` : null;
}

/** Decides whether the installed version meets a requirement, and if not, whether it is too old or too new. */
export function judge(tool: string, source: string, wanted: string, range: string | null, installed: string | null): Requirement {
  if (!range || !isRange(range)) return { tool, source, wanted, installed, status: "unknown", message: `“${wanted.slice(0, 40)}” isn't a version or range that can be checked here.` };
  if (!installed) return { tool, source, wanted, installed: null, status: "missing", message: `${tool} isn't installed (or didn't report a version), so ${wanted} can't be met.` };
  if (Bun.semver.satisfies(installed, range)) return { tool, source, wanted, installed, status: "ok", message: `${tool} ${installed} fits ${wanted}.` };
  // Not fitting: is the installed one below the range or above it? The first number in the range is its lower end for the usual forms.
  const first = /(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?/.exec(range);
  const part = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? v : "0");
  const floor = first ? `${first[1]}.${part(first[2])}.${part(first[3])}` : null;
  const older = floor !== null && Bun.semver.order(installed, floor) < 0;
  return { tool, source, wanted, installed, status: older ? "older" : "newer", message: older ? `${tool} ${installed} is older than ${wanted}. Update it.` : `${tool} ${installed} is newer than ${wanted} allows.` };
}

async function readText(path: string, max = 256 * 1024): Promise<string | null> {
  try {
    const st = await fsp.stat(path);
    if (!st.isFile() || st.size > max) return null;
    return await fsp.readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Compares the developer tools installed here with the versions a project folder asks for. Nothing is changed. */
export async function checkProjectVersions(ctx: FmContext, root: string): Promise<{ requirements: Requirement[]; sources: string[] }> {
  const { tools } = await detectEnvironment(ctx, false);
  const installedOf = (id: string): string | null => versionIn(tools.find((t) => t.id === id)?.version);
  const requirements: Requirement[] = [];
  const sources: string[] = [];
  const pkg = await readText(join(root, "package.json"));
  if (pkg !== null) {
    try {
      const engines = (JSON.parse(pkg) as { engines?: unknown }).engines;
      if (engines && typeof engines === "object" && !Array.isArray(engines)) {
        sources.push("package.json");
        for (const [name, wanted] of Object.entries(engines as Record<string, unknown>).slice(0, 20)) {
          const id = TOOL_ALIASES[name.toLowerCase()];
          if (id && typeof wanted === "string") requirements.push(judge(name, "package.json engines", wanted.trim().slice(0, 80), wanted.trim(), installedOf(id)));
        }
      }
    } catch {
      sources.push("package.json (couldn't be read)");
    }
  }
  const toolVersions = await readText(join(root, ".tool-versions"));
  if (toolVersions !== null) {
    sources.push(".tool-versions");
    for (const line of toolVersions.split(/\r?\n/).slice(0, 50)) {
      const [name, pin] = line.replace(/#.*/, "").trim().split(/\s+/);
      const id = name ? TOOL_ALIASES[name.toLowerCase()] : undefined;
      if (id && pin) requirements.push(judge(name!, ".tool-versions", pin, pinRange(pin), installedOf(id)));
    }
  }
  for (const [file, id] of PIN_FILES) {
    const text = await readText(join(root, file), 4096);
    const pin = text?.split(/\r?\n/)[0]?.trim();
    if (pin) {
      sources.push(file);
      requirements.push(judge(id === "python3" ? "python" : id, file, pin, pinRange(pin), installedOf(id)));
    }
  }
  return { requirements, sources };
}
