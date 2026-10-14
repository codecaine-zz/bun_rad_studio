/**
 * What the permissions feature needs from the computer, in one replaceable place: the file system, the few helper
 * programs (`chflags` and `stat` on macOS, `attrib` on Windows, `ls`), who the user is, and the safety limits.
 * Tests replace these so they never depend on the machine they run on. Programs are always started from an argument
 * list; no shell is ever involved, so a file name can't change what runs.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import type { FmContext } from "./fmCore";
import type { Platform } from "./fmPaths";
import type { FlagChange } from "./fmPermsModel";

/** The parts of a `Stats` the feature reads. */
export interface PermStat {
  mode: number;
  uid: number;
  gid: number;
  dev: number;
  ino: number;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isFile(): boolean;
}

export interface PermsFs {
  lstat(path: string): Promise<PermStat>;
  readdir(path: string): Promise<string[]>;
  chmod(path: string, mode: number): Promise<void>;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface PermsLimits {
  /** Most items one recursive run may look at. */
  maxItems: number;
  /** Longest a run may take, in milliseconds. */
  maxMillis: number;
  /** Most items that may be chosen at once. */
  maxPaths: number;
  /** A run that changes more items than this must be confirmed. */
  manyItems: number;
  /** How many example rows a preview lists. */
  maxExamples: number;
  maxProblems: number;
}

export const DEFAULT_LIMITS: PermsLimits = { maxItems: 100_000, maxMillis: 60_000, maxPaths: 1000, manyItems: 50, maxExamples: 200, maxProblems: 50 };

export interface PermsHooks {
  fs: PermsFs;
  run(argv: string[]): Promise<RunResult>;
  /** The user id of this process, or null where there is none (Windows). */
  uid(): number | null;
  programs: { attrib: string; chflags: string; stat: string; ls: string };
  limits: PermsLimits;
  now(): number;
}

export async function defaultRun(argv: string[]): Promise<RunResult> {
  try {
    const proc = Bun.spawn(argv, { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: { ...process.env, LC_ALL: "C" } });
    const timer = setTimeout(() => { try { proc.kill(); } catch {} }, 15_000);
    try {
      const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      return { code: await proc.exited, stdout, stderr };
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    return { code: null, stdout: "", stderr: String(err?.message ?? err) };
  }
}

export function defaultHooks(platform: Platform): PermsHooks {
  const system32 = process.env.SystemRoot ? nodePath.win32.join(process.env.SystemRoot, "System32", "attrib.exe") : "attrib.exe";
  return {
    fs: {
      lstat: (p) => fsp.lstat(p),
      readdir: (p) => fsp.readdir(p),
      chmod: (p, m) => fsp.chmod(p, m),
    },
    run: defaultRun,
    uid: () => (typeof process.getuid === "function" ? process.getuid() : null),
    programs: { attrib: platform === "win32" ? system32 : "attrib", chflags: "/usr/bin/chflags", stat: "/usr/bin/stat", ls: "/bin/ls" },
    limits: { ...DEFAULT_LIMITS },
    now: () => Date.now(),
  };
}

const overrides = new WeakMap<FmContext, Partial<PermsHooks>>();

/** Replaces parts of the hooks for one server (tests only). */
export function setPermsHooks(ctx: FmContext, hooks: Partial<PermsHooks>): void {
  overrides.set(ctx, hooks);
}

export function hooksFor(ctx: FmContext): PermsHooks {
  const base = defaultHooks(ctx.platform);
  const o = overrides.get(ctx);
  return o ? { ...base, ...o, programs: { ...base.programs, ...o.programs }, limits: { ...base.limits, ...o.limits } } : base;
}

// ---------------------------------------------------------------------------------------------------------------
// Extra settings that are not permission bits: Locked, Hidden, Read-only
// ---------------------------------------------------------------------------------------------------------------

/** What is known about an item's extra settings; a missing key means it does not apply or could not be read. */
export type FlagState = FlagChange;

const UF_IMMUTABLE = 0x2;
const UF_HIDDEN = 0x8000;

/** The letters `attrib` prints before the path ("A  SHR  C:\x") as flags; null when the line doesn't end with the path. */
export function parseAttribLine(line: string, path: string): FlagState | null {
  const at = line.toLowerCase().lastIndexOf(path.toLowerCase());
  if (at < 0) return null;
  const letters = line.slice(0, at).trim().split(/\s+/).filter(Boolean);
  if (letters.some((l) => !/^[ASHIRXOUVPB]+$/.test(l))) return null;
  const set = new Set(letters.join("").split(""));
  return { readonly: set.has("R"), hidden: set.has("H") };
}

/** The current extra settings of one item, or null when they can't be read. */
export async function readFlags(platform: Platform, hooks: PermsHooks, path: string, modeBits: number): Promise<FlagState | null> {
  if (platform === "darwin") {
    const r = await hooks.run([hooks.programs.stat, "-f", "%f", "--", path]);
    const n = Number.parseInt(r.stdout.trim(), 10);
    if (r.code !== 0 || !Number.isFinite(n)) return null;
    return { locked: (n & UF_IMMUTABLE) !== 0, hidden: (n & UF_HIDDEN) !== 0 };
  }
  if (platform === "win32") {
    const r = await hooks.run([hooks.programs.attrib, path]);
    const line = r.stdout.split(/\r?\n/).find((l) => l.trim() !== "");
    const parsed = r.code === 0 && line ? parseAttribLine(line, path) : null;
    return parsed ?? { readonly: (modeBits & 0o200) === 0 };
  }
  return null;
}

/** Which flags differ from `current` and so need changing (an unknown current value counts as different). */
export function flagsToChange(current: FlagState | null, want: FlagChange): FlagChange {
  const out: FlagChange = {};
  for (const key of ["locked", "hidden", "readonly"] as const) {
    const w = want[key];
    if (w === undefined) continue;
    if (!current || current[key] !== w) out[key] = w;
  }
  return out;
}

/** Applies flag changes to one item with the platform's own program, from an argument list. Throws when it fails. */
export async function writeFlags(platform: Platform, hooks: PermsHooks, path: string, change: FlagChange): Promise<void> {
  if (platform === "darwin") {
    const names: string[] = [];
    if (change.hidden !== undefined) names.push(change.hidden ? "hidden" : "nohidden");
    if (change.locked !== undefined) names.push(change.locked ? "uchg" : "nouchg");
    if (!names.length) return;
    const r = await hooks.run([hooks.programs.chflags, "-h", "--", names.join(","), path]);
    if (r.code !== 0) throw Object.assign(new Error(r.stderr.trim() || "chflags failed"), { code: r.code === null ? "ENOENT" : "EPERM" });
  } else if (platform === "win32") {
    const args: string[] = [];
    if (change.readonly !== undefined) args.push(change.readonly ? "+R" : "-R");
    if (change.hidden !== undefined) args.push(change.hidden ? "+H" : "-H");
    if (!args.length) return;
    const r = await hooks.run([hooks.programs.attrib, ...args, path, "/L"]);
    if (r.code !== 0) throw Object.assign(new Error(r.stderr.trim() || r.stdout.trim() || "attrib failed"), { code: r.code === null ? "ENOENT" : "EPERM" });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Names of owners, and extra access rules
// ---------------------------------------------------------------------------------------------------------------

/** "owner:group" names for a path, asked from the system; null when unavailable. */
export async function ownerNamesOf(platform: Platform, hooks: PermsHooks, path: string): Promise<{ owner: string; group: string } | null> {
  if (platform === "win32") return null;
  const args = platform === "darwin" ? ["-f", "%Su:%Sg", "--", path] : ["-c", "%U:%G", "--", path];
  const r = await hooks.run([hooks.programs.stat, ...args]);
  const m = r.code === 0 ? /^([^\s:]+):([^\s:]+)\s*$/.exec(r.stdout) : null;
  return m ? { owner: m[1]!, group: m[2]! } : null;
}

/** True when `ls -ld` shows the "+" that marks extra access rules (an ACL); null when that can't be told. */
export async function hasExtraRules(platform: Platform, hooks: PermsHooks, path: string): Promise<boolean | null> {
  if (platform === "win32") return null;
  const r = await hooks.run([hooks.programs.ls, "-ld", "--", path]);
  const first = r.code === 0 ? r.stdout.split(/\s+/)[0] : undefined;
  if (!first || !/^[-dlcbps][-rwxsStT]{9}[+@. ]?$/.test(first)) return null;
  return first.endsWith("+");
}
