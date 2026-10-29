/**
 * Shared plumbing for the File Manager's operations: where its data lives, how paths are checked before anything
 * is changed, and the few low-level moves (copy a tree, move across disks) the other modules build on.
 */
import * as fs from "fs";
import { promises as fsp } from "fs";
import { homedir } from "os";
import * as nodePath from "path";
import { defaultEditorHooks } from "./fmEditorHooks";
import { createJobHub, type JobHub } from "./fmJobs";
import { historyHooks } from "./fmOpHistory";
import { defaultClipboard, type ClipboardHooks } from "./fmClipboard";
import { FmError, isSameOrInside, platformName, protectedReason, type Platform } from "./fmPaths";
import type { DatabasesHooks } from "./fmDbHooks";
import type { SecretsHooks } from "./fmSecretsHooks";
import type { GraveyardHooks } from "./fmGraveyardHooks";
import type { SubdomainsHooks } from "./fmSubdomainsHooks";
import type { TaskManagerHooks } from "./fmTaskManager";
import type { SysinfoHooks } from "./fmSysinfo";

/** What "Open in editor" needs from the computer, replaceable so tests never start a real editor. */
export interface EditorHooks {
  /** Where a command is on the PATH, or null (`Bun.which`). */
  which(name: string): string | null;
  /** The environment variables the editor choice looks at ($VISUAL and $EDITOR). */
  env: Record<string, string | undefined>;
  /** Starts the editor in the background (`Bun.openInEditor`); it can't tell afterwards whether it worked. */
  open(path: string, options: { editor?: string; line?: number; column?: number; command?: string }): void;
}

export interface FmContext {
  platform: Platform;
  /** The user's home folder (places, "~", protection). */
  home: string;
  /** Where the app keeps its own files: settings and the Recycle Bin. */
  dataDir: string;
  /** Optional sandbox root directory for confining relative or sandboxed file operations. */
  sandboxRoot?: string;
  /** The Recycle Bin folder. Nothing in it may be changed except through the Recycle Bin functions. */
  trashRoot: string;
  /** Starts a program for "Open". Replaceable so tests never launch real applications. */
  launch: (command: string, args: string[], options?: { windowsVerbatimArguments?: boolean }) => Promise<void>;
  /** When set, helper programs (ffmpeg and so on) are only looked for in these folders. For tests. */
  toolDirs?: string[];
  /** Starting a code editor for "Open in editor". */
  editor: EditorHooks;
  /** Test replacements for the Secrets feature's clock, network, clipboard and key-derivation cost. */
  secrets?: Partial<SecretsHooks>;
  /** Test replacements for the Databases feature's keychain, child programs, clock and environment. */
  databases?: Partial<DatabasesHooks>;
  /** The Rip graveyard folder. Unset means the Rip engine's own choice (`GRAVEYARD`, else ~/.local/share/rip/graveyard). For tests. */
  graveyardDir?: string;
  /** Test replacements for the graveyard's "same disk?" check and a hook inside the copy loop. */
  graveyardHooks?: Partial<GraveyardHooks>;
  /** Test replacements for the Subdomains tool's fetch, DNS, HTTP and TCP calls, clock and program start. */
  subdomains?: Partial<SubdomainsHooks>;
  /** Test replacements for the cross-platform Process & Task Manager tool. */
  tasks?: Partial<TaskManagerHooks>;
  /** Test replacements for the cross-platform System Information tool. */
  sysinfo?: Partial<SysinfoHooks>;
  /** Optional test overrides for the Built-In Ollama AI Assistant & Full Capability Router. */
  ollama?: {
    baseUrl?: string;
    cloudBaseUrl?: string;
    apiKey?: string;
    totalRamBytes?: number;
    platform?: string;
    arch?: string;
    cpuModel?: string;
    cpuCores?: number;
    ollamaBinPath?: string | null;
    installBinaryHook?: (
      platform: string,
      arch: string,
      onProgress: (step: string, pct: number) => void,
    ) => Promise<{ installedPath: string }>;
    playAudioCommand?: string[] | ((wavPath: string, platform: string) => Promise<void>);
  };
  /** Putting text and pictures on the system clipboard. Replaceable so tests never touch the real one. */
  clipboard: ClipboardHooks;
  /** Background work: conversions and installs. */
  jobs: JobHub;
  /** Cleanup that must run when the server stops (watchers, child processes, timers). Add with `ctx.disposers.push(fn)`. */
  disposers: Array<() => void>;
}

/** One API operation: takes the JSON body and returns the JSON answer (or throws an FmError). */
export type FmHandler = (ctx: FmContext, body: Record<string, any>) => Promise<unknown>;

export interface FmContextOptions {
  platform?: Platform;
  home?: string;
  sandboxRoot?: string;
  dataDir?: string;
  launch?: FmContext["launch"];
  toolDirs?: string[];
  editor?: Partial<EditorHooks>;
  secrets?: Partial<SecretsHooks>;
  databases?: Partial<DatabasesHooks>;
  graveyardDir?: string;
  graveyardHooks?: Partial<GraveyardHooks>;
  subdomains?: Partial<SubdomainsHooks>;
  tasks?: Partial<TaskManagerHooks>;
  sysinfo?: Partial<SysinfoHooks>;
  ollama?: FmContext["ollama"];
  clipboard?: Partial<ClipboardHooks>;
}

export function createContext(options: FmContextOptions = {}): FmContext {
  const platform = options.platform ?? platformName();
  const rawHome = options.home ?? homedir();
  const p =
    platform === "win32" ||
    (process.platform === "win32" && (/^[A-Za-z]:[\\/]/.test(rawHome) || /^[A-Za-z]:[\\/]/.test(options.dataDir ?? "")))
      ? nodePath.win32
      : nodePath.posix;
  const home = p.resolve(rawHome);
  const sandboxRoot = options.sandboxRoot ? p.resolve(options.sandboxRoot) : undefined;
  const dataDir = p.resolve(options.dataDir ?? p.join(home, ".bun_rad_studio"));
  return {
    platform,
    home,
    sandboxRoot,
    dataDir,
    trashRoot: p.join(dataDir, "file_manager_trash"),
    launch: options.launch ?? defaultLaunch,
    toolDirs: options.toolDirs,
    editor: { ...defaultEditorHooks({ platform, home, toolDirs: options.toolDirs }), ...options.editor },
    clipboard: { ...defaultClipboard(), ...options.clipboard },
    jobs: createJobHub(2, historyHooks({ dataDir })),
    secrets: options.secrets,
    databases: options.databases,
    graveyardDir: options.graveyardDir ? p.resolve(options.graveyardDir) : undefined,
    graveyardHooks: options.graveyardHooks,
    subdomains: options.subdomains,
    tasks: options.tasks,
    sysinfo: options.sysinfo,
    ollama: options.ollama,
    disposers: [],
  };
}

async function defaultLaunch(command: string, args: string[], options: { windowsVerbatimArguments?: boolean } = {}): Promise<void> {
  const { spawn } = await import("child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true, windowsVerbatimArguments: options.windowsVerbatimArguments });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** A path from a client: must be a non-empty string without null characters and absolute for this platform. */
export function absolutePath(ctx: FmContext, input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new FmError("BAD_PATH", "No location was given.");
  if (input.includes("\0")) throw new FmError("BAD_PATH", "That location isn't valid.");
  const p = ctx.platform === "win32" || (process.platform === "win32" && /^[A-Za-z]:[\\/]/.test(input)) ? nodePath.win32 : nodePath.posix;
  if (!p.isAbsolute(input)) throw new FmError("BAD_PATH", "That location isn't a full path.");
  return p.resolve(input);
}

export function pathApi(ctx: Pick<FmContext, "platform"> & { home?: string; dataDir?: string }) {
  return ctx.platform === "win32" || (process.platform === "win32" && (/^[A-Za-z]:[\\/]/.test(ctx.home ?? "") || /^[A-Za-z]:[\\/]/.test(ctx.dataDir ?? "")))
    ? nodePath.win32
    : nodePath.posix;
}

function deepestRealPath(target: string): string | null {
  try {
    let cur = nodePath.resolve(target);
    const tail: string[] = [];
    for (let i = 0; i < 64; i++) {
      try {
        const real = fs.realpathSync(cur);
        return tail.length ? nodePath.join(real, ...tail.reverse()) : real;
      } catch {
        const parent = nodePath.dirname(cur);
        if (parent === cur) return null;
        tail.push(nodePath.basename(cur));
        cur = parent;
      }
    }
  } catch {}
  return null;
}

export function assertModifiable(ctx: FmContext, target: string): void {
  const reason = protectedReason(target, { platform: ctx.platform, home: ctx.home, extraProtected: [ctx.trashRoot] }, "modify");
  if (reason) throw new FmError("PROTECTED", reason);
  if (ctx.platform === process.platform) {
    const p = pathApi(ctx);
    const parentReal = deepestRealPath(p.dirname(target));
    if (parentReal) {
      const realTarget = p.join(parentReal, p.basename(target));
      const realHome = deepestRealPath(ctx.home) ?? ctx.home;
      const realTrash = deepestRealPath(ctx.trashRoot) ?? ctx.trashRoot;
      const realReason = protectedReason(realTarget, { platform: ctx.platform, home: realHome, extraProtected: [realTrash] }, "modify");
      if (realReason) throw new FmError("PROTECTED", realReason);
    }
  }
}

export function assertCreatable(ctx: FmContext, parent: string): void {
  const reason = protectedReason(parent, { platform: ctx.platform, home: ctx.home, extraProtected: [ctx.trashRoot] }, "create");
  if (reason) throw new FmError("PROTECTED", reason);
  if (ctx.platform === process.platform) {
    const realParent = deepestRealPath(parent);
    if (realParent) {
      const realHome = deepestRealPath(ctx.home) ?? ctx.home;
      const realTrash = deepestRealPath(ctx.trashRoot) ?? ctx.trashRoot;
      const realReason = protectedReason(realParent, { platform: ctx.platform, home: realHome, extraProtected: [realTrash] }, "create");
      if (realReason) throw new FmError("PROTECTED", realReason);
    }
  }
}

export async function lstatOrNull(target: string): Promise<fs.Stats | null> {
  try {
    return await fsp.lstat(target);
  } catch (err: any) {
    if (err?.code === "ENOENT" || err?.code === "ENOTDIR") return null;
    throw err;
  }
}

export async function exists(target: string): Promise<boolean> {
  return (await lstatOrNull(target)) !== null;
}

export async function assertFolder(target: string, what = "That location"): Promise<void> {
  let st: fs.Stats;
  try {
    st = await fsp.stat(target);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NOT_FOUND", `${what} doesn't exist.`);
    throw err;
  }
  if (!st.isDirectory()) throw new FmError("NOT_A_FOLDER", `${what} isn't a folder.`);
}

/** Copies a file, folder or link. Links are copied as links (never followed), and nothing existing is overwritten. */
export async function copyTree(source: string, destination: string): Promise<void> {
  const st = await fsp.lstat(source);
  if (st.isDirectory()) {
    await fsp.cp(source, destination, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, errorOnExist: true, force: false });
  } else if (st.isSymbolicLink()) {
    await fsp.symlink(await fsp.readlink(source), destination);
  } else {
    await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    await fsp.utimes(destination, st.atime, st.mtime).catch(() => {});
  }
}

/** Renames, or copies then removes when the two places are on different disks. Never overwrites on the copy path. */
export async function moveTree(source: string, destination: string): Promise<void> {
  try {
    await fsp.rename(source, destination);
    return;
  } catch (err: any) {
    if (err?.code !== "EXDEV") throw err;
  }
  await copyTree(source, destination);
  try {
    await fsp.rm(source, { recursive: true, force: false });
  } catch (err) {
    // The copy exists but the original could not be removed: keep both rather than lose data.
    throw new FmError("PARTIAL_MOVE", "The item was copied to the new place, but the original could not be removed. Both copies still exist.");
  }
}

/** Same disk entry, used to tell a case-only rename ("a.txt" to "A.txt") from a real name clash. */
export async function sameEntry(a: string, b: string): Promise<boolean> {
  try {
    const [x, y] = await Promise.all([fsp.lstat(a), fsp.lstat(b)]);
    return x.ino !== 0 && x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
}

export function assertNotIntoItself(ctx: FmContext, source: string, destDir: string): void {
  if (isSameOrInside(destDir, source, ctx.platform)) throw new FmError("INTO_ITSELF", "A folder can't be placed inside itself.");
  if (ctx.platform === process.platform) {
    const realSource = deepestRealPath(source);
    const realDest = deepestRealPath(destDir);
    if (realSource && realDest && isSameOrInside(realDest, realSource, ctx.platform)) {
      throw new FmError("INTO_ITSELF", "A folder can't be placed inside itself.");
    }
  }
}

/** Runs `fn` for each item, collecting a result or a plain-language error per item, so one failure doesn't stop the rest. */
export async function eachItem<T, R>(items: T[], fn: (item: T) => Promise<R>, describe: (err: unknown) => { code: string; message: string }): Promise<Array<{ ok: true; value: R } | { ok: false; code: string; message: string }>> {
  const out: Array<{ ok: true; value: R } | { ok: false; code: string; message: string }> = [];
  for (const item of items) {
    try {
      out.push({ ok: true, value: await fn(item) });
    } catch (err) {
      out.push({ ok: false, ...describe(err) });
    }
  }
  return out;
}

/** Yields to the event loop, so long scans don't freeze the server. */
export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
