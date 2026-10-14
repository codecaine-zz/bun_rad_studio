/**
 * Native Bun Rip Engine -- A Safe and Ergonomic Alternative to rm
 * Implements modern rip capabilities natively using Bun and Node APIs.
 * Zero Homebrew or external binary dependencies.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";

export type RipFileType = "file" | "directory" | "symlink" | "other" | "missing";
export type BurialStatus = "buried" | "unburied" | "decomposed";

export interface GraveyardItem {
  id: string;
  name: string;
  originalPath: string;
  relativePath: string;
  graveyardRel: string;
  graveyardPath: string;
  buriedAt: string;
  buriedAtMs: number;
  sizeBytes: number;
  humanSize: string;
  fileCount: number;
  type: RipFileType;
  mode: number;
  permStr: string;
  cwd: string;
  status: BurialStatus;
  sha256?: string;
}

export interface GraveyardManifest {
  version: string;
  graveyardRoot: string;
  lastUpdated: string;
  items: GraveyardItem[];
}

export interface InspectItem {
  target: string;
  resolvedPath: string;
  name: string;
  exists: boolean;
  type: RipFileType;
  sizeBytes: number;
  humanSize: string;
  fileCount: number;
  isGitRepo: boolean;
  isReadOnly: boolean;
  isProtected: boolean;
  protectedReason?: string;
  warning?: string;
  symlinkTarget?: string;
}

export interface InspectResult {
  items: InspectItem[];
  totalSizeBytes: number;
  totalHumanSize: string;
  totalFiles: number;
  hasWarnings: boolean;
  hasProtected: boolean;
  warnings: string[];
}

export interface BuryResult {
  success: boolean;
  buriedItems: GraveyardItem[];
  failed: { target: string; error: string }[];
  totalBytesBuried: number;
  totalHumanSize: string;
}

export interface UnburyResult {
  success: boolean;
  restoredItems: GraveyardItem[];
  failed: { item?: GraveyardItem; target?: string; error: string }[];
  recreatedDirs: string[];
}

export interface DecomposeResult {
  deletedCount: number;
  freedBytes: number;
  freedHumanSize: string;
  items: GraveyardItem[];
}

// -----------------------------------------------------------------------------
// Utilities & Formatters
// -----------------------------------------------------------------------------

export function formatHumanSize(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const scaledSize = bytes / Math.pow(1024, unitIndex);
  return `${scaledSize >= 100 || unitIndex === 0 ? scaledSize.toFixed(0) : scaledSize.toFixed(1)} ${units[unitIndex]}`;
}

export function formatPermissions(mode: number): string {
  const perms = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"];
  const ownerBits = (mode >> 6) & 7;
  const groupBits = (mode >> 3) & 7;
  const otherBits = mode & 7;
  return `${perms[ownerBits]}${perms[groupBits]}${perms[otherBits]}`;
}

export function parseDurationMs(durationStr: string): number | null {
  if (!durationStr || typeof durationStr !== "string") return null;
  const trimmed = durationStr.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
  if (!match) return null;

  const durationValue = parseFloat(match[1] ?? "0");
  const unit = (match[2] ?? "").toLowerCase();

  switch (unit) {
    case "s":
    case "sec":
    case "second":
    case "seconds":
      return Math.round(durationValue * 1000);
    case "m":
    case "min":
    case "minute":
    case "minutes":
      return Math.round(durationValue * 60 * 1000);
    case "h":
    case "hr":
    case "hour":
    case "hours":
      return Math.round(durationValue * 60 * 60 * 1000);
    case "d":
    case "day":
    case "days":
      return Math.round(durationValue * 24 * 60 * 60 * 1000);
    case "w":
    case "week":
    case "weeks":
      return Math.round(durationValue * 7 * 24 * 60 * 60 * 1000);
    case "mo":
    case "month":
    case "months":
      return Math.round(durationValue * 30 * 24 * 60 * 60 * 1000);
    case "y":
    case "yr":
    case "year":
    case "years":
      return Math.round(durationValue * 365 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Graveyard Path Resolution & Manifest Management
// -----------------------------------------------------------------------------

export function getGraveyardDir(customPath?: string): string {
  if (customPath && customPath.trim() !== "") {
    return path.resolve(customPath.trim());
  }

  if (process.env.GRAVEYARD && process.env.GRAVEYARD.trim() !== "") {
    return path.resolve(process.env.GRAVEYARD.trim());
  }

  // Standard XDG / local share directory
  const home = os.homedir();
  if (home && home !== "/" && home !== "") {
    return path.join(home, ".local", "share", "rip", "graveyard");
  }

  // Fallback for container or temp environments
  const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
  return path.join(os.tmpdir(), `graveyard-${uid}`);
}

/** True when something is at `target`, including a link whose own target is missing (`fs.existsSync` says no to those). */
export function pathExistsNoFollow(target: string): boolean {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
}

export function ensureGraveyardStructure(graveyardDir: string): { entriesDir: string; manifestPath: string } {
  const entriesDir = path.join(graveyardDir, "entries");
  const manifestPath = path.join(graveyardDir, "manifest.json");

  if (!fs.existsSync(entriesDir)) {
    fs.mkdirSync(entriesDir, { recursive: true, mode: 0o700 });
  }

  return { entriesDir, manifestPath };
}

export function loadManifest(graveyardDir?: string): GraveyardManifest {
  const dir = getGraveyardDir(graveyardDir);
  const { manifestPath } = ensureGraveyardStructure(dir);
  if (!fs.existsSync(manifestPath)) {
    const initial: GraveyardManifest = {
      version: "1.0.0",
      graveyardRoot: dir,
      lastUpdated: new Date().toISOString(),
      items: [],
    };
    saveManifest(dir, initial);
    return initial;
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.items || !Array.isArray(parsed.items)) {
      parsed.items = [];
    }
    return parsed as GraveyardManifest;
  } catch {
    // If corrupt or unreadable, create new recovery manifest
    const recovered: GraveyardManifest = {
      version: "1.0.0",
      graveyardRoot: dir,
      lastUpdated: new Date().toISOString(),
      items: [],
    };
    return recovered;
  }
}

/**
 * Like `loadManifest`, but says when the record file exists and can't be read (damaged), instead of quietly answering
 * with an empty list that the next save would write over it. Never creates or changes anything.
 */
export function loadManifestChecked(graveyardDir?: string): { manifest: GraveyardManifest; exists: boolean; damaged: boolean } {
  const dir = getGraveyardDir(graveyardDir);
  const empty = (): GraveyardManifest => ({ version: "1.0.0", graveyardRoot: dir, lastUpdated: new Date().toISOString(), items: [] });
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(dir, "manifest.json"), "utf-8");
  } catch (err: any) {
    return { manifest: empty(), exists: false, damaged: err?.code !== "ENOENT" && err?.code !== "ENOTDIR" };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return { manifest: empty(), exists: true, damaged: true };
    return { manifest: parsed as GraveyardManifest, exists: true, damaged: false };
  } catch {
    return { manifest: empty(), exists: true, damaged: true };
  }
}

/** The record of one burial; `buryTargetsSync` and the File Manager both build their records here. */
export function createGraveyardItem(args: {
  id: string;
  name: string;
  originalPath: string;
  cwd: string;
  graveyardDir: string;
  graveyardPath: string;
  now: Date;
  type: RipFileType;
  mode: number;
  sizeBytes: number;
  fileCount: number;
  sha256?: string;
}): GraveyardItem {
  return {
    id: args.id,
    name: args.name,
    originalPath: args.originalPath,
    relativePath: path.relative(args.cwd, args.originalPath) || args.name,
    graveyardRel: path.relative(args.graveyardDir, args.graveyardPath),
    graveyardPath: args.graveyardPath,
    buriedAt: args.now.toISOString(),
    buriedAtMs: args.now.getTime(),
    sizeBytes: args.sizeBytes,
    humanSize: formatHumanSize(args.sizeBytes),
    fileCount: args.fileCount,
    type: args.type,
    mode: args.mode,
    permStr: formatPermissions(args.mode),
    cwd: args.cwd,
    status: "buried",
    sha256: args.sha256,
  };
}

/** A fresh, collision-free id for a burial: `rip_<time>_<random>`. */
export function newBurialId(now: Date = new Date()): string {
  return `rip_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function saveManifest(graveyardDir: string | undefined, manifest: GraveyardManifest): void {
  const dir = getGraveyardDir(graveyardDir);
  const { manifestPath } = ensureGraveyardStructure(dir);
  manifest.lastUpdated = new Date().toISOString();
  manifest.graveyardRoot = dir;

  const tempPath = `${manifestPath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), "utf-8");
  fs.renameSync(tempPath, manifestPath);
}

// -----------------------------------------------------------------------------
// Safety Verification (Protecting System & Sensitive Directories)
// -----------------------------------------------------------------------------

const CRITICAL_SYSTEM_PATHS = new Set([
  "/",
  "/bin",
  "/sbin",
  "/usr",
  "/usr/bin",
  "/usr/sbin",
  "/usr/lib",
  "/etc",
  "/var",
  "/var/log",
  "/dev",
  "/proc",
  "/sys",
  "/boot",
  "/root",
  "/lib",
  "/lib64",
  "/opt",
  "/run",
  "/System",
  "/Library",
  "/Applications",
  "/Volumes",
  "/private",
  "/private/etc",
  "/private/var",
]);

export function isProtectedPath(
  targetPath: string,
  options: { cwd?: string; graveyardDir?: string } = {}
): { protected: boolean; reason?: string } {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const resolved = path.resolve(cwd, targetPath);
  const normalized = path.normalize(resolved);
  const home = os.homedir() ? path.normalize(path.resolve(os.homedir())) : "";
  const graveyard = options.graveyardDir ? path.normalize(path.resolve(options.graveyardDir)) : getGraveyardDir();

  // 1. Root check
  if (normalized === "/" || /^[a-zA-Z]:\\?$/.test(normalized)) {
    return { protected: true, reason: "Cannot bury filesystem root (/)" };
  }

  // 2. Home directory check
  if (home && normalized === home) {
    return { protected: true, reason: "Cannot bury user home directory (~)" };
  }

  // 3. Current or parent directory check
  if (targetPath === "." || normalized === cwd) {
    return { protected: true, reason: "Cannot bury current working directory (.)" };
  }
  if (targetPath === ".." || normalized === path.dirname(cwd)) {
    return { protected: true, reason: "Cannot bury parent directory (..)" };
  }

  // 4. Critical system paths
  if (CRITICAL_SYSTEM_PATHS.has(normalized)) {
    return { protected: true, reason: `Cannot bury critical system path (${normalized})` };
  }

  // 5. Cannot bury the graveyard or its contents inside itself
  if (normalized === graveyard || normalized.startsWith(graveyard + path.sep)) {
    return { protected: true, reason: "Cannot bury the graveyard directory into itself" };
  }

  return { protected: false };
}

// -----------------------------------------------------------------------------
// Directory Metrics (Recursive Size & File Count)
// -----------------------------------------------------------------------------

export function calculatePathMetrics(targetPath: string): { sizeBytes: number; fileCount: number; isGitRepo: boolean } {
  try {
    const stats = fs.lstatSync(targetPath);
    if (!stats.isDirectory()) {
      return { sizeBytes: stats.size, fileCount: 1, isGitRepo: false };
    }

    let totalSize = 0;
    let fileCount = 0;
    let isGitRepo = fs.existsSync(path.join(targetPath, ".git"));

    const stack: string[] = [targetPath];

    while (stack.length > 0) {
      const current = stack.pop()!;
      try {
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(current, entry.name);
          fileCount++;
          if (entry.name === ".git") {
            isGitRepo = true;
          }
          if (entry.isDirectory() && !entry.isSymbolicLink()) {
            stack.push(full);
          } else {
            try {
              const fileStats = fs.lstatSync(full);
              totalSize += fileStats.size;
            } catch {
              // Ignore unreadable individual files
            }
          }
        }
      } catch {
        // Skip unreadable subdirectories
      }
    }

    return { sizeBytes: totalSize, fileCount: Math.max(1, fileCount), isGitRepo };
  } catch {
    return { sizeBytes: 0, fileCount: 0, isGitRepo: false };
  }
}

// -----------------------------------------------------------------------------
// Safe Atomic Move with Cross-Device EXDEV Fallback
// -----------------------------------------------------------------------------

/**
 * What differs between a tree and its copy (names, kinds, sizes, link targets, file permissions), or null when they
 * match. Used to check a cross-disk copy before the original is removed.
 */
export function compareTreesSync(source: string, copy: string): string | null {
  const a = fs.lstatSync(source);
  const b = fs.lstatSync(copy);
  if (a.isSymbolicLink() !== b.isSymbolicLink() || a.isDirectory() !== b.isDirectory() || a.isFile() !== b.isFile()) return `${path.basename(source)} has a different kind of item in the copy`;
  if (a.isSymbolicLink()) return fs.readlinkSync(source) === fs.readlinkSync(copy) ? null : `the link ${path.basename(source)} points somewhere else in the copy`;
  if (a.isFile()) {
    if (a.size !== b.size) return `${path.basename(source)} has a different size in the copy`;
    return (a.mode & 0o777) === (b.mode & 0o777) ? null : `${path.basename(source)} has different permissions in the copy`;
  }
  if (!a.isDirectory()) return null;
  const names = fs.readdirSync(source).sort();
  const copied = fs.readdirSync(copy).sort();
  if (names.length !== copied.length || names.some((n, i) => n !== copied[i])) return `${path.basename(source)} has different contents in the copy`;
  for (const n of names) {
    const problem = compareTreesSync(path.join(source, n), path.join(copy, n));
    if (problem) return problem;
  }
  return null;
}

export function safeMove(source: string, destination: string): void {
  const destDir = path.dirname(destination);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    // Attempt atomic rename first
    fs.renameSync(source, destination);
  } catch (err: any) {
    if (err.code === "EXDEV") {
      // Cross-filesystem move fallback: copy recursively (links stay links), check the copy, then remove the source.
      const existedBefore = pathExistsNoFollow(destination);
      try {
        fs.cpSync(source, destination, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, errorOnExist: true, force: false });
      } catch (copyErr) {
        if (!existedBefore) fs.rmSync(destination, { recursive: true, force: true });
        throw copyErr;
      }
      const problem = compareTreesSync(source, destination);
      if (problem) {
        fs.rmSync(destination, { recursive: true, force: true });
        throw new Error(`The copy could not be verified (${problem}), so the original was left where it is.`);
      }
      fs.rmSync(source, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

// -----------------------------------------------------------------------------
// Inspect Mode (-i / --inspect)
// -----------------------------------------------------------------------------

export function inspectTargetsSync(
  targets: string[],
  options: { cwd?: string; graveyardDir?: string } = {}
): InspectResult {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const items: InspectItem[] = [];
  const warnings: string[] = [];
  let totalSizeBytes = 0;
  let totalFiles = 0;
  let hasProtected = false;

  for (const t of targets) {
    const resolvedPath = path.resolve(cwd, t);
    const baseName = path.basename(resolvedPath) || resolvedPath;

    // Safety guard
    const safety = isProtectedPath(t, { cwd, graveyardDir: options.graveyardDir });
    if (safety.protected) {
      hasProtected = true;
      warnings.push(`[PROTECTED] ${t}: ${safety.reason}`);
      items.push({
        target: t,
        resolvedPath,
        name: baseName,
        exists: pathExistsNoFollow(resolvedPath),
        type: "directory",
        sizeBytes: 0,
        humanSize: "0 B",
        fileCount: 0,
        isGitRepo: false,
        isReadOnly: false,
        isProtected: true,
        protectedReason: safety.reason,
        warning: safety.reason,
      });
      continue;
    }

    if (!pathExistsNoFollow(resolvedPath)) {
      items.push({
        target: t,
        resolvedPath,
        name: baseName,
        exists: false,
        type: "missing",
        sizeBytes: 0,
        humanSize: "0 B",
        fileCount: 0,
        isGitRepo: false,
        isReadOnly: false,
        isProtected: false,
        warning: "File or directory does not exist",
      });
      continue;
    }

    try {
      const stats = fs.lstatSync(resolvedPath);
      let type: RipFileType = "other";
      let symlinkTarget: string | undefined;

      if (stats.isSymbolicLink()) {
        type = "symlink";
        try {
          symlinkTarget = fs.readlinkSync(resolvedPath);
        } catch {
          // ignore
        }
      } else if (stats.isDirectory()) {
        type = "directory";
      } else if (stats.isFile()) {
        type = "file";
      }

      const metrics = calculatePathMetrics(resolvedPath);
      totalSizeBytes += metrics.sizeBytes;
      totalFiles += metrics.fileCount;

      let itemWarning: string | undefined;
      const isReadOnly = (stats.mode & 0o200) === 0;

      if (metrics.isGitRepo) {
        itemWarning = "Target is or contains a Git repository (.git)";
        warnings.push(`[GIT REPO] ${t}: ${itemWarning}`);
      }
      if (isReadOnly) {
        itemWarning = (itemWarning ? `${itemWarning}; ` : "") + "Target is read-only";
        warnings.push(`[READ-ONLY] ${t}: Target is read-only`);
      }
      if (metrics.sizeBytes > 100 * 1024 * 1024) {
        itemWarning = (itemWarning ? `${itemWarning}; ` : "") + `Large payload (${formatHumanSize(metrics.sizeBytes)})`;
        warnings.push(`[LARGE] ${t}: ${formatHumanSize(metrics.sizeBytes)}`);
      }

      items.push({
        target: t,
        resolvedPath,
        name: baseName,
        exists: true,
        type,
        sizeBytes: metrics.sizeBytes,
        humanSize: formatHumanSize(metrics.sizeBytes),
        fileCount: metrics.fileCount,
        isGitRepo: metrics.isGitRepo,
        isReadOnly,
        isProtected: false,
        symlinkTarget,
        warning: itemWarning,
      });
    } catch (e: any) {
      items.push({
        target: t,
        resolvedPath,
        name: baseName,
        exists: false,
        type: "other",
        sizeBytes: 0,
        humanSize: "0 B",
        fileCount: 0,
        isGitRepo: false,
        isReadOnly: false,
        isProtected: false,
        warning: e.message,
      });
    }
  }

  return {
    items,
    totalSizeBytes,
    totalHumanSize: formatHumanSize(totalSizeBytes),
    totalFiles,
    hasWarnings: warnings.length > 0,
    hasProtected,
    warnings,
  };
}

export async function inspectTargets(
  targets: string[],
  options: { cwd?: string; graveyardDir?: string } = {}
): Promise<InspectResult> {
  return inspectTargetsSync(targets, options);
}

// -----------------------------------------------------------------------------
// Bury Mode (Safe Deletion into Graveyard)
// -----------------------------------------------------------------------------

export function buryTargetsSync(
  targets: string[],
  options: { graveyardDir?: string; cwd?: string; force?: boolean } = {}
): BuryResult {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const graveyardDir = getGraveyardDir(options.graveyardDir);
  const { entriesDir } = ensureGraveyardStructure(graveyardDir);
  const manifest = loadManifest(graveyardDir);

  const buriedItems: GraveyardItem[] = [];
  const failed: { target: string; error: string }[] = [];
  let totalBytesBuried = 0;

  for (const target of targets) {
    if (!target || target.trim() === "") continue;

    const resolved = path.resolve(cwd, target);
    const name = path.basename(resolved);

    // 1. Safety verification
    const safety = isProtectedPath(target, { cwd, graveyardDir });
    if (safety.protected) {
      failed.push({ target, error: safety.reason || "Protected system target" });
      continue;
    }

    // 2. Check existence
    if (!pathExistsNoFollow(resolved)) {
      failed.push({ target, error: `No such file or directory: ${target}` });
      continue;
    }

    try {
      const stats = fs.lstatSync(resolved);
      let type: RipFileType = "file";
      if (stats.isSymbolicLink()) type = "symlink";
      else if (stats.isDirectory()) type = "directory";
      else if (!stats.isFile()) type = "other";

      const metrics = calculatePathMetrics(resolved);

      // 3. Generate collision-free graveyard isolation directory
      const now = new Date();
      const id = newBurialId(now);
      const itemGraveyardDir = path.join(entriesDir, id);
      const destGraveyardPath = path.join(itemGraveyardDir, name);

      fs.mkdirSync(itemGraveyardDir, { recursive: true, mode: 0o700 });

      // Calculate sha256 for small/medium files
      let sha256: string | undefined;
      if (type === "file" && metrics.sizeBytes <= 25 * 1024 * 1024) {
        try {
          const buf = fs.readFileSync(resolved);
          sha256 = createHash("sha256").update(buf).digest("hex");
        } catch {
          // ignore
        }
      }

      // 4. Move target into graveyard (an empty item folder is not left behind when the move fails)
      try {
        safeMove(resolved, destGraveyardPath);
      } catch (moveErr) {
        try {
          fs.rmdirSync(itemGraveyardDir);
        } catch {
          // not empty or already gone
        }
        throw moveErr;
      }

      const graveyardItem = createGraveyardItem({
        id,
        name,
        originalPath: resolved,
        cwd,
        graveyardDir,
        graveyardPath: destGraveyardPath,
        now,
        type,
        mode: stats.mode,
        sizeBytes: metrics.sizeBytes,
        fileCount: metrics.fileCount,
        sha256,
      });

      buriedItems.push(graveyardItem);
      manifest.items.unshift(graveyardItem);
      totalBytesBuried += metrics.sizeBytes;
    } catch (e: any) {
      failed.push({ target, error: e.message || String(e) });
    }
  }

  saveManifest(graveyardDir, manifest);

  return {
    success: failed.length === 0,
    buriedItems,
    failed,
    totalBytesBuried,
    totalHumanSize: formatHumanSize(totalBytesBuried),
  };
}

export async function buryTargets(
  targets: string[],
  options: { graveyardDir?: string; cwd?: string; force?: boolean } = {}
): Promise<BuryResult> {
  return buryTargetsSync(targets, options);
}

// -----------------------------------------------------------------------------
// Unbury Mode (Undo / Restore from Graveyard)
// -----------------------------------------------------------------------------

export function unburyTargetsSync(
  targets?: string[],
  options: { graveyardDir?: string; cwd?: string; force?: boolean } = {}
): UnburyResult {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const graveyardDir = getGraveyardDir(options.graveyardDir);
  const manifest = loadManifest(graveyardDir);

  const restoredItems: GraveyardItem[] = [];
  const failed: { item?: GraveyardItem; target?: string; error: string }[] = [];
  const recreatedDirs: string[] = [];

  // If no targets provided, unbury the LAST buried item!
  if (!targets || targets.length === 0) {
    const lastBuried = manifest.items.find((item) => item.status === "buried");
    if (!lastBuried) {
      return {
        success: false,
        restoredItems: [],
        failed: [{ error: "No buried items found in graveyard to unbury." }],
        recreatedDirs: [],
      };
    }
    targets = [lastBuried.id];
  }

  for (const target of targets) {
    // Find matching buried item by ID, by exact originalPath, or by name/relativePath
    const item = manifest.items.find((it) => {
      if (it.status !== "buried") return false;
      if (it.id === target) return true;
      if (it.name === target) return true;
      if (it.originalPath === path.resolve(cwd, target)) return true;
      if (it.relativePath === target) return true;
      return false;
    });

    if (!item) {
      failed.push({ target, error: `No buried item matching '${target}' found in graveyard.` });
      continue;
    }

    if (!fs.existsSync(item.graveyardPath)) {
      failed.push({ item, target, error: `Graveyard payload missing: ${item.graveyardPath}` });
      continue;
    }

    // Check if target destination exists
    if (pathExistsNoFollow(item.originalPath) && !options.force) {
      failed.push({
        item,
        target,
        error: `Destination already exists at '${item.originalPath}'. Use force flag to overwrite.`,
      });
      continue;
    }

    try {
      const parentDir = path.dirname(item.originalPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
        recreatedDirs.push(parentDir);
      }

      // If overwriting with force, move existing aside first so a failed restore loses nothing
      let aside: string | null = null;
      if (pathExistsNoFollow(item.originalPath) && options.force) {
        aside = `${item.originalPath}.rip-old-${Date.now()}`;
        fs.renameSync(item.originalPath, aside);
      }

      try {
        safeMove(item.graveyardPath, item.originalPath);
      } catch (moveErr) {
        if (aside) {
          try {
            fs.rmSync(item.originalPath, { recursive: true, force: true });
            fs.renameSync(aside, item.originalPath);
          } catch {
            // best effort
          }
        }
        throw moveErr;
      }
      if (aside) {
        fs.rmSync(aside, { recursive: true, force: true });
      }

      // Clean up empty item isolation folder in graveyard
      const itemFolder = path.dirname(item.graveyardPath);
      try {
        fs.rmdirSync(itemFolder);
      } catch {
        // ignore
      }

      item.status = "unburied";
      restoredItems.push(item);
    } catch (e: any) {
      failed.push({ item, target, error: e.message || String(e) });
    }
  }

  saveManifest(graveyardDir, manifest);

  return {
    success: failed.length === 0,
    restoredItems,
    failed,
    recreatedDirs,
  };
}

export async function unburyTargets(
  targets?: string[],
  options: { graveyardDir?: string; cwd?: string; force?: boolean } = {}
): Promise<UnburyResult> {
  return unburyTargetsSync(targets, options);
}

// -----------------------------------------------------------------------------
// Séance Mode (-s / --seance)
// -----------------------------------------------------------------------------

export function seanceGraveyard(
  options: { graveyardDir?: string; cwd?: string; all?: boolean; status?: BurialStatus } = {}
): GraveyardItem[] {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const graveyardDir = getGraveyardDir(options.graveyardDir);
  const manifest = loadManifest(graveyardDir);

  return manifest.items.filter((item) => {
    if (options.status && item.status !== options.status) {
      return false;
    }

    // If --all is not set, only show items buried from current working directory or subpaths
    if (!options.all) {
      const itemOrigDir = path.dirname(item.originalPath);
      const isFromCwd = item.cwd === cwd || itemOrigDir.startsWith(cwd);
      if (!isFromCwd) return false;
    }

    return true;
  });
}

// -----------------------------------------------------------------------------
// Decompose Mode (-d / --decompose: Permanent Purge)
// -----------------------------------------------------------------------------

export function decomposeGraveyardSync(
  options: {
    graveyardDir?: string;
    targets?: string[];
    olderThanMs?: number;
    all?: boolean;
  } = {}
): DecomposeResult {
  const graveyardDir = getGraveyardDir(options.graveyardDir);
  const { entriesDir } = ensureGraveyardStructure(graveyardDir);
  const manifest = loadManifest(graveyardDir);

  const now = Date.now();
  let deletedCount = 0;
  let freedBytes = 0;
  const deletedItems: GraveyardItem[] = [];

  const toDecompose = manifest.items.filter((item) => {
    // If all requested, decompose every item in the graveyard
    if (options.all) {
      return true;
    }

    // If specific targets requested, match by id, name, or originalPath
    if (options.targets && options.targets.length > 0) {
      return options.targets.some((t) => t === item.id || t === item.name || t === item.originalPath);
    }

    // For age or default with no filter: only items still in the graveyard can be purged
    if (item.status !== "buried") return false;

    // If olderThanMs filter applied
    if (options.olderThanMs && options.olderThanMs > 0) {
      const age = now - item.buriedAtMs;
      return age >= options.olderThanMs;
    }

    // Default with no filter: decompose all currently buried items
    return true;
  });

  for (const item of toDecompose) {
    try {
      if (item.graveyardPath) {
        const itemDir = path.dirname(item.graveyardPath);
        if (itemDir.startsWith(entriesDir) && itemDir !== entriesDir && fs.existsSync(itemDir)) {
          fs.rmSync(itemDir, { recursive: true, force: true });
        } else if (item.graveyardPath.startsWith(entriesDir) && fs.existsSync(item.graveyardPath)) {
          fs.rmSync(item.graveyardPath, { recursive: true, force: true });
        }
      }

      if (item.status === "buried") {
        freedBytes += item.sizeBytes || 0;
      }
      deletedCount++;
      item.status = "decomposed";
      deletedItems.push(item);
    } catch {
      // Continue decomposing remaining items
    }
  }

  // Prune decomposed items from manifest to keep manifest clean
  manifest.items = manifest.items.filter((it) => it.status !== "decomposed");

  // If entire graveyard emptied (all: true), or manifest is empty, clean up entries folder
  if (options.all || manifest.items.length === 0) {
    if (options.all) {
      manifest.items = [];
    }
    try {
      if (fs.existsSync(entriesDir)) {
        const entries = fs.readdirSync(entriesDir);
        for (const entryName of entries) {
          const entryPath = path.join(entriesDir, entryName);
          if (entryPath.startsWith(entriesDir) && entryPath !== entriesDir) {
            fs.rmSync(entryPath, { recursive: true, force: true });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  saveManifest(graveyardDir, manifest);

  return {
    deletedCount,
    freedBytes,
    freedHumanSize: formatHumanSize(freedBytes),
    items: deletedItems,
  };
}

export async function decomposeGraveyard(
  options: {
    graveyardDir?: string;
    targets?: string[];
    olderThanMs?: number;
    all?: boolean;
  } = {}
): Promise<DecomposeResult> {
  return decomposeGraveyardSync(options);
}

// -----------------------------------------------------------------------------
// Graveyard Statistics Summary
// -----------------------------------------------------------------------------

export function getGraveyardStats(graveyardDir?: string): {
  totalItems: number;
  totalSizeBytes: number;
  totalHumanSize: string;
  buriedTodayCount: number;
  oldestItem?: GraveyardItem;
  newestItem?: GraveyardItem;
} {
  const dir = getGraveyardDir(graveyardDir);
  const manifest = loadManifest(dir);
  const buried = manifest.items.filter((it) => it.status === "buried");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  let totalSize = 0;
  let todayCount = 0;
  let oldest: GraveyardItem | undefined;
  let newest: GraveyardItem | undefined;

  for (const item of buried) {
    totalSize += item.sizeBytes;
    if (item.buriedAtMs >= todayMs) {
      todayCount++;
    }
    if (!oldest || item.buriedAtMs < oldest.buriedAtMs) {
      oldest = item;
    }
    if (!newest || item.buriedAtMs > newest.buriedAtMs) {
      newest = item;
    }
  }

  return {
    totalItems: buried.length,
    totalSizeBytes: totalSize,
    totalHumanSize: formatHumanSize(totalSize),
    buriedTodayCount: todayCount,
    oldestItem: oldest,
    newestItem: newest,
  };
}

// -----------------------------------------------------------------------------
// Shell Completions Generator (zsh / bash / fish)
// -----------------------------------------------------------------------------

export function generateCompletions(shell: "zsh" | "bash" | "fish" = "zsh"): string {
  if (shell === "fish") {
    return `# Fish completions for rip
complete -c rip -s i -l inspect -d "Inspect files before burying"
complete -c rip -s s -l seance -d "Print files deleted in current directory"
complete -c rip -s u -l unbury -d "Restore files or the last file"
complete -c rip -s d -l decompose -d "Permanently delete files in graveyard"
complete -c rip -s f -l force -d "Non-interactive mode"
complete -c rip -l graveyard -d "Directory where deleted files rest"
complete -c rip -l json -d "Output results as JSON"
complete -c rip -a "graveyard seance unbury decompose inspect completions"
`;
  }

  if (shell === "bash") {
    return `# Bash completions for rip
_rip_completions() {
    local cur="\${COMP_WORDS[COMP_CWORD]}"
    local opts="-i --inspect -s --seance -u --unbury -d --decompose -f --force --graveyard --json -h --help -V --version graveyard seance unbury decompose inspect completions"
    COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
}
complete -F _rip_completions rip
`;
  }

  // Default ZSH
  return `#compdef rip
_rip() {
    local -a commands
    commands=(
        'graveyard:Print graveyard directory path'
        'seance:Print files that were deleted in current directory'
        'unbury:Restore specified files or last file'
        'decompose:Permanently delete files in graveyard'
        'inspect:Inspect file details before burying'
        'completions:Generate shell completions'
    )
    _arguments -s \
        '(-i --inspect)'{-i,--inspect}'[Print some info about FILES before burying]' \
        '(-s --seance)'{-s,--seance}'[Print files that were deleted in current directory]' \
        '(-u --unbury)'{-u,--unbury}'[Restore specified files or last file]' \
        '(-d --decompose)'{-d,--decompose}'[Permanently deletes the graveyard]' \
        '(-f --force)'{-f,--force}'[Non-interactive mode]' \
        '--graveyard=[Directory where deleted files rest]:directory:_files -/' \
        '--json[Output results as JSON]' \
        '(-h --help)'{-h,--help}'[Print help]' \
        '(-V --version)'{-V,--version}'[Print version]' \
        '*::file:_files'
}
_rip "$@"
`;
}
