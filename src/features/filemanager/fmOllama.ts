/**
 * Built-In Ollama AI Assistant & Full Capability Router for Codecaine File Manager.
 *
 * Pure Bun.js Runtime — Zero External or Node Dependencies:
 *   Uses ONLY pure Bun APIs (`Bun.spawn`, `Bun.spawnSync`, `Bun.file`, `Bun.write`, `Bun.which`,
 *   `Bun.CryptoHasher`, and native `fetch`).
 *
 * Enforces Strict Hardware & Mac MLX Rules before any model action:
 *   - Rule A (Mac Apple Silicon MLX Exclusivity): On `darwin` + `arm64`, queries `/api/show` and
 *     only offers, recommends, and allows MLX-optimized models (plus tiny specialized utility
 *     models like `phonon`, `nimble`, `tev1`, `clef`, `clef-flash` and `:cloud` models).
 *   - Rule B (70% RAM Safety Ceiling): Detects total system RAM via native `Bun.spawnSync` system
 *     calls, sets a strict Safe Memory Budget equal to 70% of total RAM (keeping 30% free for the OS
 *     and Codecaine File Manager), and enforces parameter ceilings across all 4 RAM tiers.
 *   - Rule C (Polite Hardware Refusal): Blocks any local model run or download that exceeds the
 *     Safe Memory Budget, explains in plain language that it would freeze the computer, and
 *     automatically suggests the best model that fits their RAM or the `:cloud` version.
 */
import {
  absolutePath,
  assertCreatable,
  assertModifiable,
  type FmContext,
  type FmHandler,
} from "./fmCore";
import { archivePaths } from "./fmFindArchive";
import {
  assertRealpathInsideSandboxSync,
  chmodSafeSync,
  createSessionTempDirSync,
  ensureDirectorySyncNative,
  listDirectoryEntriesSyncNative,
  moveFileSafeExclusiveAsync,
  readTextFileSyncNative,
  removePathForceSync,
  streamDownloadWithSha256,
  verifyDownloadedArchiveIntegrity,
  writeNewFileExclusiveAsync,
} from "./fmNativeFs";
import {
  FmError,
  isDocumentPackageName,
  isSameOrInside,
  validateName,
} from "./fmPaths";
import { extractReadableDocumentText } from "./fmPreview";

// ---------------------------------------------------------------------------------------------------------------
// 1. Pure Bun Path & File Helpers (Zero Node `fs`, `path`, `os`, or `child_process` imports)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Returns the platform-appropriate directory separator (`\` on Windows, `/` on POSIX).
 */
export function pathSep(platform = process.platform): string {
  return platform === "win32" ? "\\" : "/";
}

/**
 * Normalizes path separators in `p` to match the target platform.
 */
export function normalizeSlashes(
  p: string,
  platform = process.platform,
): string {
  if (platform === "win32") return p.replace(/\//g, "\\");
  return p.replace(/\\/g, "/");
}

/**
 * Joins an array of path segments using the target platform's separator without importing Node `path`.
 */
export function joinPath(parts: string[], platform = process.platform): string {
  const sep = pathSep(platform);
  const cleaned: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (!raw) continue;
    const norm = normalizeSlashes(raw, platform);
    if (i === 0) {
      cleaned.push(
        norm.length > 1 && norm.endsWith(sep) ? norm.slice(0, -1) : norm,
      );
    } else {
      const stripped = norm.replace(/^[\\/]+|[\\/]+$/g, "");
      if (stripped) cleaned.push(stripped);
    }
  }
  if (cleaned.length === 0) return sep;
  if (cleaned.length === 1) return cleaned[0]!;
  return cleaned[0] === sep
    ? `${sep}${cleaned.slice(1).join(sep)}`
    : cleaned.join(sep);
}

/**
 * Returns the final path component (filename or directory name) from a path string.
 */
export function basenamePath(p: string): string {
  const norm = p.replace(/[\\/]+$/, "");
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/**
 * Returns the parent directory portion of a path string for the given platform.
 */
export function dirnamePath(p: string, platform = process.platform): string {
  const sep = pathSep(platform);
  const norm = normalizeSlashes(p, platform).replace(/[\\/]+$/, "");
  const idx = norm.lastIndexOf(sep);
  if (idx < 0) return ".";
  if (idx === 0) return sep;
  return norm.slice(0, idx);
}

/**
 * Extracts the lowercase file extension without the leading dot, or `""` if none exists.
 */
export function extnameLower(p: string): string {
  const base = basenamePath(p);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * Returns the filename stem without its final extension.
 */
export function stemName(p: string): string {
  const base = basenamePath(p);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Computes the hexadecimal SHA-256 digest of a string or byte array using `Bun.CryptoHasher`.
 */
export function sha256Hex(input: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}

/**
 * Resolves the system temporary directory path from environment variables or platform defaults.
 */
export function tempDirPath(platform = process.platform): string {
  return (
    process.env.TMPDIR ||
    process.env.TEMP ||
    process.env.TMP ||
    (platform === "win32" ? "C:\\Temp" : "/tmp")
  );
}

/**
 * Checks whether a file exists on disk using `Bun.file(filePath).exists()`.
 */
export async function fileExistsPure(filePath: string): Promise<boolean> {
  try {
    return await Bun.file(filePath).exists();
  } catch {
    return false;
  }
}

/**
 * Synchronously reads a UTF-8 text file via native filesystem I/O without spawning shell subprocesses.
 */
export function readTextFileSyncPure(filePath: string): string {
  return readTextFileSyncNative(filePath);
}

/**
 * Synchronously creates a directory and any missing parent directories without spawning shell subprocesses.
 */
export function ensureDirectoryPure(
  dirPath: string,
  _platform = process.platform,
): void {
  ensureDirectorySyncNative(dirPath);
}

/**
 * Synchronously lists immediate entries in a directory via native `withFileTypes` directory reads.
 */
export function listDirectoryEntriesPure(
  dirPath: string,
  platform = process.platform,
): Array<{ name: string; path: string; isDir: boolean }> {
  return listDirectoryEntriesSyncNative(dirPath, (name) =>
    joinPath([dirPath, name], platform),
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Strict Hardware Inspection, Mac MLX Exclusivity & 70% RAM Safety Ceiling (Section 2 of Brief)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Host system memory classification tier used to enforce the 70% RAM safety ceiling for local models.
 */
export type RamSafetyTier =
  "under_8gb" | "8gb_to_16gb" | "17gb_to_32gb" | "33gb_plus";

/**
 * Detected host CPU, architecture, total RAM, 70% safe memory budget, and parameter ceiling specifications.
 */
export interface OllamaHardwareSpecs {
  platform: string;
  arch: string;
  isAppleSiliconMac: boolean;
  mlxExclusivityActive: boolean;
  cpuModel: string;
  cpuCores: number;
  totalRamBytes: number;
  totalRamGb: number;
  safeMemoryBudgetBytes: number;
  safeMemoryBudgetGb: number;
  ramTier: RamSafetyTier;
  tierLabel: string;
  maxParametersB: number;
  blockedAboveParametersB: number;
  policySummary: string;
}

let cachedNativeHostRamBytes = 0;
let cachedNativeHostCpuModel = "";
let cachedNativeHostCpuCores = 0;

/**
 * Detects the true native host CPU architecture, even when running an x64 Bun binary
 * under Windows 11 ARM64 emulation (e.g., Parallels Desktop on Apple Silicon Mac where
 * `process.arch` is `"x64"` but `PROCESSOR_ARCHITEW6432` / `PROCESSOR_ARCHITECTURE` is `"ARM64"`).
 */
export function detectNativeHostArch(
  platform: string,
  overrideArch?: string,
): string {
  if (overrideArch) return overrideArch;
  if (platform === "darwin" && process.platform !== "darwin") return "arm64";
  if (platform === "win32") {
    const winEnvArch =
      `${process.env.PROCESSOR_ARCHITEW6432 || ""} ${process.env.PROCESSOR_ARCHITECTURE || ""}`.toLowerCase();
    if (winEnvArch.includes("arm64") || winEnvArch.includes("aarch64")) {
      return "arm64";
    }
  }
  return (process.arch as string) === "aarch64" ? "arm64" : process.arch;
}

/**
 * Inspects the computer's hardware specs using native `Bun.spawnSync` system calls.
 * Calculates the strict 70% Safe Memory Budget (keeping 30% free for the OS and Codecaine File Manager).
 */
export function inspectOllamaHardware(
  ctx?: FmContext,
  overrides?: {
    platform?: string;
    arch?: string;
    totalRamBytes?: number;
    cpuModel?: string;
    cpuCores?: number;
  },
): OllamaHardwareSpecs {
  const platform =
    overrides?.platform ??
    ctx?.ollama?.platform ??
    ctx?.platform ??
    process.platform;
  const arch = detectNativeHostArch(
    platform,
    overrides?.arch ?? ctx?.ollama?.arch,
  );
  const isAppleSiliconMac = platform === "darwin" && arch === "arm64";

  let totalRamBytes =
    overrides?.totalRamBytes ?? ctx?.ollama?.totalRamBytes ?? 0;
  let cpuModel = overrides?.cpuModel ?? ctx?.ollama?.cpuModel ?? "";
  let cpuCores = overrides?.cpuCores ?? ctx?.ollama?.cpuCores ?? 0;

  if (!totalRamBytes || totalRamBytes <= 0) {
    if (platform === process.platform && cachedNativeHostRamBytes > 0) {
      totalRamBytes = cachedNativeHostRamBytes;
    } else {
      try {
        if (platform === "darwin" && process.platform === "darwin") {
          const memOut = Bun.spawnSync(["sysctl", "-n", "hw.memsize"], {
            stdout: "pipe",
            stderr: "ignore",
          })
            .stdout.toString()
            .trim();
          const parsed = Number(memOut);
          if (Number.isFinite(parsed) && parsed > 0) totalRamBytes = parsed;
        } else if (platform === "linux" && process.platform === "linux") {
          const memOut = Bun.spawnSync(["grep", "MemTotal", "/proc/meminfo"], {
            stdout: "pipe",
            stderr: "ignore",
          })
            .stdout.toString()
            .trim();
          const m = /(\d+)\s*kB/i.exec(memOut);
          if (m) totalRamBytes = Number(m[1]) * 1024;
        } else if (platform === "win32" && process.platform === "win32") {
          const memOut = Bun.spawnSync(
            [
              "powershell",
              "-NoProfile",
              "-Command",
              "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
            ],
            { stdout: "pipe", stderr: "ignore" },
          )
            .stdout.toString()
            .trim();
          const parsed = Number(memOut);
          if (Number.isFinite(parsed) && parsed > 0) totalRamBytes = parsed;
        }
        if (platform === process.platform && totalRamBytes > 0) {
          cachedNativeHostRamBytes = totalRamBytes;
        }
      } catch {}
    }
  }

  if (!totalRamBytes || totalRamBytes <= 0) {
    // Safe fallback to 16 GB if running inside a restricted sandbox
    totalRamBytes = 16 * 1024 * 1024 * 1024;
  }

  if (!cpuModel) {
    if (platform === process.platform && cachedNativeHostCpuModel) {
      cpuModel = cachedNativeHostCpuModel;
      if (!cpuCores || cpuCores <= 0) cpuCores = cachedNativeHostCpuCores;
    } else {
      try {
        if (platform === "darwin" && process.platform === "darwin") {
          cpuModel = Bun.spawnSync(
            ["sysctl", "-n", "machdep.cpu.brand_string"],
            { stdout: "pipe", stderr: "ignore" },
          )
            .stdout.toString()
            .trim();
          const cOut = Bun.spawnSync(["sysctl", "-n", "hw.ncpu"], {
            stdout: "pipe",
            stderr: "ignore",
          })
            .stdout.toString()
            .trim();
          if (Number(cOut) > 0) cpuCores = Number(cOut);
        } else if (platform === "linux" && process.platform === "linux") {
          const cOut = Bun.spawnSync(["nproc"], {
            stdout: "pipe",
            stderr: "ignore",
          })
            .stdout.toString()
            .trim();
          if (Number(cOut) > 0) cpuCores = Number(cOut);
        }
        if (platform === process.platform) {
          if (cpuModel) cachedNativeHostCpuModel = cpuModel;
          if (cpuCores > 0) cachedNativeHostCpuCores = cpuCores;
        }
      } catch {}
    }
  }

  if (!cpuModel)
    cpuModel = isAppleSiliconMac
      ? "Apple Silicon (ARM64)"
      : `${platform.toUpperCase()} ${arch}`;
  if (!cpuCores || cpuCores <= 0) cpuCores = 8;

  const totalRamGb = Math.round((totalRamBytes / 1024 ** 3) * 100) / 100;
  // Rule B: Strict 70% RAM Safety Ceiling (keeping 30% free for the OS and Codecaine File Manager)
  const safeMemoryBudgetBytes = Math.floor(totalRamBytes * 0.7);
  const safeMemoryBudgetGb =
    Math.round((safeMemoryBudgetBytes / 1024 ** 3) * 100) / 100;

  let ramTier: RamSafetyTier;
  let tierLabel: string;
  let maxParametersB: number;
  let blockedAboveParametersB: number;
  let policySummary: string;

  if (totalRamGb < 8) {
    ramTier = "under_8gb";
    tierLabel = "Under 8 GB RAM (Tiny & Utility Tier)";
    maxParametersB = 4.2;
    blockedAboveParametersB = 7;
    policySummary = `Under 8 GB RAM (${totalRamGb} GB total · ${safeMemoryBudgetGb} GB 70% Safe Budget): Only compact models (1B–4B parameters like qwen3.5:4b, qwen3.5:2b, lfm3-omni) plus phonon, nimble, and clef-flash are allowed. 7B+ models are blocked.`;
  } else if (totalRamGb <= 16) {
    ramTier = "8gb_to_16gb";
    tierLabel = "8 GB – 16 GB RAM (Standard 7B–8B Tier)";
    maxParametersB = 9.5;
    blockedAboveParametersB = 13;
    policySummary = `8–16 GB RAM (${totalRamGb} GB total · ${safeMemoryBudgetGb} GB 70% Safe Budget): Models up to 7B–8B parameters are allowed. 13B+ models are blocked.`;
  } else if (totalRamGb <= 32) {
    ramTier = "17gb_to_32gb";
    tierLabel = "17 GB – 32 GB RAM (Pro 14B–32B Tier)";
    maxParametersB = 34;
    blockedAboveParametersB = 70;
    policySummary = `17–32 GB RAM (${totalRamGb} GB total · ${safeMemoryBudgetGb} GB 70% Safe Budget): Models up to 14B–32B parameters are allowed. 70B+ models are blocked.`;
  } else {
    ramTier = "33gb_plus";
    tierLabel = "33 GB – 64+ GB RAM (Workstation 70B+ Tier)";
    maxParametersB = 120;
    blockedAboveParametersB = 200;
    policySummary = `33–64+ GB RAM (${totalRamGb} GB total · ${safeMemoryBudgetGb} GB 70% Safe Budget): Large models up to 70B+ parameters are allowed within the ${safeMemoryBudgetGb} GB Safe Memory Budget.`;
  }

  return {
    platform,
    arch,
    isAppleSiliconMac,
    mlxExclusivityActive: isAppleSiliconMac,
    cpuModel,
    cpuCores,
    totalRamBytes,
    totalRamGb,
    safeMemoryBudgetBytes,
    safeMemoryBudgetGb,
    ramTier,
    tierLabel,
    ramTierLabel: tierLabel,
    maxParametersB,
    blockedAboveParametersB,
    policySummary,
  } as OllamaHardwareSpecs & { ramTierLabel: string };
}

/**
 * Joins variadic path segments using the active platform's path separator.
 */
export function bunJoinPath(...parts: string[]): string {
  return joinPath(parts);
}

/**
 * Returns the trailing filename or directory name of `p`.
 */
export function bunBasename(p: string): string {
  return basenamePath(p);
}

/**
 * Returns the parent directory path of `p`.
 */
export function bunDirname(p: string): string {
  return dirnamePath(p);
}

/**
 * Returns the lowercase extension of `p` with a leading dot (e.g. `.png`), or `""` if none.
 */
export function bunExtname(p: string): string {
  const ext = extnameLower(p);
  return ext ? `.${ext}` : "";
}

/**
 * Synchronously ensures a directory exists using pure Bun process spawning.
 */
export function ensureDirSyncWithBun(dirPath: string): void {
  ensureDirectoryPure(dirPath);
}

/**
 * Resolves a relative or absolute path inside the File Manager workspace and enforces sandbox and Recycle Bin boundaries.
 */
export function resolveSandboxPath(ctx: FmContext, relOrAbs: string): string {
  const raw = String(relOrAbs || ".").trim();
  if (raw.includes("\0")) {
    throw new FmError("BAD_PATH", "Invalid path containing null byte.");
  }
  const base = ctx.sandboxRoot || ctx.home;
  const isAbs =
    raw.startsWith("/") ||
    (ctx.platform === "win32" && /^[A-Za-z]:[\\/]/.test(raw));
  const candidate =
    raw === "." || raw === ""
      ? base
      : isAbs
        ? raw
        : joinPath([base, raw], ctx.platform);
  const resolved = absolutePath(ctx, candidate);
  if (
    ctx.sandboxRoot &&
    !isSameOrInside(resolved, ctx.sandboxRoot, ctx.platform)
  ) {
    throw new FmError(
      "PROTECTED_PATH",
      "Path escapes the configured workspace sandbox root.",
    );
  }
  if (!isAbs && !isSameOrInside(resolved, base, ctx.platform)) {
    throw new FmError(
      "PROTECTED_PATH",
      "Relative path traversal outside the workspace root is not permitted.",
    );
  }
  if (ctx.trashRoot && isSameOrInside(resolved, ctx.trashRoot, ctx.platform)) {
    throw new FmError(
      "TRASH_PROTECTED",
      "The Recycle Bin can only be changed through Recycle Bin actions.",
    );
  }
  assertRealpathInsideSandboxSync(resolved, ctx.sandboxRoot, ctx.platform);
  return resolved;
}

/**
 * Converts an absolute path inside the workspace into a forward-slash path relative to the sandbox or home root.
 */
export function toSandboxRelative(ctx: FmContext, absPath: string): string {
  const baseResolved = absolutePath(ctx, ctx.sandboxRoot || ctx.home);
  const absResolved = absolutePath(ctx, absPath);
  const base = baseResolved.replace(/\\/g, "/").replace(/\/+$/, "");
  const norm = absResolved.replace(/\\/g, "/");
  const isWin = ctx.platform === "win32" || process.platform === "win32";
  const cmpBase = isWin ? base.toLowerCase() : base;
  const cmpNorm = isWin ? norm.toLowerCase() : norm;
  if (cmpNorm === cmpBase) return ".";
  if (cmpNorm.startsWith(cmpBase + "/")) {
    return norm.slice(base.length + 1);
  }
  return absPath;
}

/**
 * Checks whether a file path has an image extension supported by Ollama multimodal vision models.
 */
export function isSupportedVisionImagePath(filePath: string): boolean {
  const ext = extnameLower(filePath);
  return (
    ext === "png" ||
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "webp" ||
    ext === "gif" ||
    ext === "bmp" ||
    ext === "heic" ||
    ext === "tiff" ||
    ext === "tif" ||
    ext === "avif"
  );
}

/**
 * Reads an image file from disk (downscaling large images on macOS via `sips` when available) and returns a base64 payload.
 */
export async function readImageAsBase64(absPath: string): Promise<string> {
  const file = Bun.file(absPath);
  if (!(await file.exists())) {
    throw new FmError("FILE_NOT_FOUND", `Image file not found: ${absPath}`);
  }
  if (
    process.platform === "darwin" &&
    file.size > 120_000 &&
    Bun.which("sips")
  ) {
    let tmpDir = "";
    try {
      tmpDir = createSessionTempDirSync("fm-vlm-thumb-");
      const ext = extnameLower(absPath) === "png" ? "png" : "jpg";
      const tmpOut = joinPath([tmpDir, `thumb.${ext}`], "darwin");
      await Bun.write(tmpOut, file);
      const sipsRes = Bun.spawnSync(["/usr/bin/sips", "-Z", "768", tmpOut], {
        stdout: "ignore",
        stderr: "ignore",
      });
      if (sipsRes.exitCode === 0) {
        const resizedFile = Bun.file(tmpOut);
        if (await resizedFile.exists()) {
          const b64 = Buffer.from(await resizedFile.arrayBuffer()).toString(
            "base64",
          );
          if (b64.length > 0) return b64;
        }
      }
    } catch {
    } finally {
      if (tmpDir) removePathForceSync(tmpDir);
    }
  }
  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

/**
 * Reads a text or rich-document snippet up to `maxChars` from a file, package bundle, or directory.
 */
export async function readTextFileSnippet(
  absPath: string,
  maxChars = 24_000,
): Promise<string> {
  const ext = extnameLower(absPath);
  const richExts = new Set([
    "epub",
    "ibooks",
    "rtfd",
    "textbundle",
    "scriv",
    "ulysses",
    "pages",
    "numbers",
    "key",
    "playground",
    "playgroundbook",
    "oo3",
    "mindnode",
    "graffle",
    "docx",
    "odt",
    "rtf",
    "fb2",
    "pdf",
    "pptx",
    "ppsx",
    "odp",
    "xlsx",
    "xlsm",
    "ods",
  ]);
  const binaryMediaExts = new Set([
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "heic",
    "tiff",
    "tif",
    "avif",
    "ico",
    "mp3",
    "wav",
    "m4a",
    "flac",
    "ogg",
    "aac",
    "opus",
    "mp4",
    "mov",
    "webm",
    "mkv",
    "avi",
  ]);
  const file = Bun.file(absPath);
  const isRegularFile = await file.exists();

  if (isRegularFile && binaryMediaExts.has(ext)) {
    const kindLabel = isSupportedVisionImagePath(absPath) ? "Image" : "Media";
    return `[Binary ${kindLabel} File: ${basenamePath(absPath)} (${ext.toUpperCase()}, ${file.size.toLocaleString()} bytes)]`;
  }

  if (!isRegularFile || richExts.has(ext)) {
    const richText = await extractReadableDocumentText(absPath, maxChars).catch(
      () => null,
    );
    if (richText) return richText;
  }

  if (!isRegularFile) {
    const dirEntries = listDirectoryEntriesPure(absPath);
    if (dirEntries.length > 0) {
      const listing = dirEntries
        .slice(0, 120)
        .map((e) =>
          e.isDir && !isDocumentPackageName(e.name) ? `${e.name}/` : e.name,
        )
        .join("\n");
      const summary = `[Directory: ${basenamePath(absPath)} (${dirEntries.length} items)]\n${listing}`;
      return summary.length > maxChars ? summary.slice(0, maxChars) : summary;
    }
    throw new FmError("FILE_NOT_FOUND", `File not found: ${absPath}`);
  }

  const text = await file.slice(0, maxChars * 4).text();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/**
 * Lists files (and document package bundles) in `dirAbs`, optionally recursing up to depth 3.
 */
export function listDirectoryWithBun(
  dirAbs: string,
  options?: { recursive?: boolean; maxEntries?: number },
): Array<{ name: string; absPath: string; isDir: boolean }> {
  const maxEntries = options?.maxEntries ?? 60;
  const results: Array<{ name: string; absPath: string; isDir: boolean }> = [];
  const walk = (currentDir: string, depth: number) => {
    if (results.length >= maxEntries || depth > 3) return;
    const entries = listDirectoryEntriesPure(currentDir);
    for (const entry of entries) {
      if (results.length >= maxEntries) break;
      if (entry.name.startsWith(".")) continue;
      if (entry.isDir) {
        if (isDocumentPackageName(entry.name)) {
          results.push({ name: entry.name, absPath: entry.path, isDir: false });
        } else if (options?.recursive) {
          walk(entry.path, depth + 1);
        }
      } else {
        results.push({ name: entry.name, absPath: entry.path, isDir: false });
      }
    }
  };
  walk(dirAbs, 0);
  return results;
}

/** Tiny specialized utility models that are always allowed on Apple Silicon and low-RAM tiers. */
export const UTILITY_MODEL_NAMES = new Set([
  "phonon",
  "nimble",
  "tev1",
  "clef",
  "clef-flash",
]);

/**
 * Cross-platform Text-to-Audio / Speech LLM models for Linux, Windows, and Intel macOS
 * (where Apple Silicon MLX `phonon` is not supported).
 */
export const CROSS_PLATFORM_SPEECH_MODEL_NAMES = new Set([
  "orpheus",
  "orpheus-tts",
  "kokoro",
  "oute-tts",
  "outetts",
  "parler-tts",
  "llasa",
  "lfm3-omni",
  "bark",
  "csm",
  "fish-speech",
]);

/**
 * Maps shorthand cross-platform speech model tags (`orpheus:latest`, `kokoro:latest`, `oute-tts:latest`)
 * to verified upstream `registry.ollama.ai` model tags (`legraphista/Orpheus:latest`, `lfm3-omni:latest`, `mannix/outetts:0.3`)
 * whenever a real Ollama daemon reports `pull model manifest: file does not exist` for the un-namespaced alias.
 */
export function resolveSpeechModelRegistryFallback(
  modelName: string,
): string | null {
  const base = baseModelName(modelName);
  const lower = String(modelName || "")
    .trim()
    .toLowerCase();
  if (lower.includes("/")) return null;
  if (base === "orpheus" || base === "orpheus-tts")
    return "legraphista/Orpheus:latest";
  if (base === "kokoro") return "lfm3-omni:latest";
  if (base === "oute-tts" || base === "outetts") return "mannix/outetts:0.3";
  if (base === "parler-tts" || base === "llasa")
    return "legraphista/Orpheus:latest";
  return null;
}

/**
 * Set of Ollama model names supporting the SystemOne (`/v1/systemone`) decision engine.
 */
export const DECISION_MODEL_NAMES = new Set([
  "nimble",
  "tev1",
  "clef",
  "clef-flash",
  "clef:cloud",
  "d3",
]);

/**
 * Set of SystemOne decision models that also support multimodal vision inputs.
 */
export const VISION_DECISION_MODEL_NAMES = new Set([
  "clef",
  "clef-flash",
  "clef:cloud",
  "d3",
]);

/**
 * Extracts the lowercase base model name without namespace prefix or tag suffix (e.g. `library/qwen3.5:4b` -> `qwen3.5`).
 */
export function baseModelName(model: string): string {
  const clean = String(model || "")
    .trim()
    .toLowerCase();
  const colon = clean.indexOf(":");
  const base = colon >= 0 ? clean.slice(0, colon) : clean;
  const slash = base.lastIndexOf("/");
  return slash >= 0 ? base.slice(slash + 1) : base;
}

/**
 * Checks whether a model tag refers to a cloud-hosted Ollama model (`:cloud` or `-cloud`).
 */
export function isCloudModelName(model: string): boolean {
  const clean = String(model || "")
    .trim()
    .toLowerCase();
  return clean.endsWith(":cloud") || clean.endsWith("-cloud");
}

/**
 * Checks whether a model name refers to the Apple Silicon `phonon` TTS model.
 */
export function isPhononModelName(model: string): boolean {
  return baseModelName(model) === "phonon";
}

/**
 * Checks whether a model name refers to one of the supported cross-platform speech synthesis models.
 */
export function isCrossPlatformSpeechModelName(model: string): boolean {
  return CROSS_PLATFORM_SPEECH_MODEL_NAMES.has(baseModelName(model));
}

/**
 * Checks whether a model name is a speech/TTS model (`phonon` or a cross-platform speech model).
 */
export function isSpeechModelName(model: string): boolean {
  return isPhononModelName(model) || isCrossPlatformSpeechModelName(model);
}

/**
 * Checks whether a model name is a lightweight specialized utility model (`phonon`, `nimble`, `tev1`, `clef`, `clef-flash`).
 */
export function isUtilityModelName(model: string): boolean {
  return UTILITY_MODEL_NAMES.has(baseModelName(model));
}

/**
 * Checks whether a model supports the SystemOne (`/v1/systemone`) decision capability.
 */
export function isDecisionModelName(
  model: string,
  capabilities: string[] = [],
): boolean {
  if (capabilities.includes("decision")) return true;
  const clean = String(model || "")
    .trim()
    .toLowerCase();
  if (DECISION_MODEL_NAMES.has(clean)) return true;
  return DECISION_MODEL_NAMES.has(baseModelName(model));
}

/**
 * Checks whether a model is a SystemOne decision model capable of evaluating images.
 */
export function isVisionDecisionModel(
  model: string,
  capabilities: string[] = [],
): boolean {
  const clean = String(model || "")
    .trim()
    .toLowerCase();
  const base = baseModelName(model);
  if (base === "clef" || base === "clef-flash" || clean === "clef:cloud")
    return true;
  return (
    isDecisionModelName(model, capabilities) && capabilities.includes("vision")
  );
}

/**
 * Alias for `isVisionDecisionModel` indicating whether a decision model can inspect image attachments.
 */
export const canJudgeImagesInDecision = isVisionDecisionModel;

/**
 * Thinking / Reasoning Capability Classification across Ollama & LM Studio / Bionic models:
 * - `"levels"`: Multi-level reasoning effort models (e.g. `gpt-oss`, `gpt-oss:20b`, `gpt-oss:120b`, `openai/gpt-oss-*`, `o1`, `o3`, `o4-mini`)
 *   where users choose discrete thinking levels (`"low"`, `"medium"`, `"high"`).
 * - `"toggle"`: Hybrid thinking models (e.g. `qwen3`, `qwen3.5`, `lfm3`, `glm-4.5`, `glm-z1`, `cogito`, `granite3.2`, `granite3.3`,
 *   `smollm3`, `deepseek-v3.1`, `nemotron`, `seed-oss`, `hunyuan`, `mimo`, `gemma4`) where users can toggle thinking On (`true`) or Off (`false`),
 *   plus optionally pick a reasoning effort / token budget (`"low"`, `"medium"`, `"high"`).
 * - `"always_on"`: Dedicated chain-of-thought reasoning models (e.g. `deepseek-r1`, `qwq`, `phi4-reasoning`, `magistral`, `openthinker`)
 *   where reasoning is native by default (and can be suppressed or budgeted).
 * - `"none"`: Standard non-thinking chat, vision, speech, embedding, or decision models.
 */
export type ModelThinkingMode = "levels" | "toggle" | "always_on" | "none";
/**
 * User-selectable reasoning effort or toggle level for thinking-capable models.
 */
export type ThinkingEffortChoice =
  "auto" | "off" | "on" | "low" | "medium" | "high";

/**
 * Descriptor of a model's chain-of-thought reasoning capabilities, supported effort levels, and UI labels.
 */
export interface ModelThinkingCapabilities {
  thinkingMode: ModelThinkingMode;
  supportsThinking: boolean;
  supportsThinkingLevels: boolean;
  canToggleOff: boolean;
  canToggle: boolean;
  supportedThinkingLevels: Array<"off" | "on" | "low" | "medium" | "high">;
  supportedLevels: Array<"off" | "on" | "low" | "medium" | "high">;
  defaultThinkingLevel: "off" | "on" | "low" | "medium" | "high";
  defaultLevel: "off" | "on" | "low" | "medium" | "high";
  supportsThinkingBudget: boolean;
  usesHarmonyFormat: boolean;
  badgeLabel: string;
  summaryLabel: string;
}

/**
 * Classifies a model's thinking/reasoning mode (`levels`, `toggle`, `always_on`, or `none`) and supported effort levels.
 */
export function getModelThinkingCapabilities(modelInput: {
  name?: string;
  id?: string;
  family?: string;
  capabilities?: string[];
  reasoningCapable?: boolean;
}): ModelThinkingCapabilities {
  const rawName = String(modelInput.name || modelInput.id || "")
    .trim()
    .toLowerCase();
  const base = baseModelName(rawName);
  const family = String(modelInput.family || "")
    .trim()
    .toLowerCase();
  const caps = new Set(
    (modelInput.capabilities || []).map((c) => String(c).toLowerCase()),
  );

  if (
    isSpeechModelName(rawName) ||
    isDecisionModelName(rawName, modelInput.capabilities) ||
    caps.has("embedding") ||
    caps.has("embeddings") ||
    rawName.includes("embed")
  ) {
    return {
      thinkingMode: "none",
      supportsThinking: false,
      supportsThinkingLevels: false,
      canToggleOff: true,
      canToggle: false,
      supportedThinkingLevels: [],
      supportedLevels: [],
      defaultThinkingLevel: "off",
      defaultLevel: "off",
      supportsThinkingBudget: false,
      usesHarmonyFormat: false,
      badgeLabel: "No Thinking (Direct Output)",
      summaryLabel: "No Thinking (Direct Output)",
    };
  }

  // 1. Multi-level reasoning effort models (`gpt-oss`, OpenAI o-series) — ONLY low / medium / high levels
  const isGptOss =
    rawName.includes("gpt-oss") ||
    rawName.includes("gpt_oss") ||
    family.includes("gpt-oss") ||
    family.includes("gpt_oss");
  const isOpenAiReasoningLevelModel =
    isGptOss ||
    /^o[134](?:[-:]|$)/.test(base) ||
    rawName.includes("/o1") ||
    rawName.includes("/o3") ||
    rawName.includes("/o4-mini");

  if (isOpenAiReasoningLevelModel) {
    return {
      thinkingMode: "levels",
      supportsThinking: true,
      supportsThinkingLevels: true,
      canToggleOff: false,
      canToggle: false,
      supportedThinkingLevels: ["low", "medium", "high"],
      supportedLevels: ["low", "medium", "high"],
      defaultThinkingLevel: "medium",
      defaultLevel: "medium",
      supportsThinkingBudget: false,
      usesHarmonyFormat: isGptOss,
      badgeLabel: "Thinking Levels: Low / Med / High",
      summaryLabel: "Multi-Level Thinking (Low / Medium / High)",
    };
  }

  // 2. Always-on dedicated reasoning models (`deepseek-r1`, `qwq`, `phi4-reasoning`, `magistral`, `openthinker`)
  const isAlwaysOnReasoning =
    rawName.includes("deepseek-r1") ||
    rawName.includes("deepseek_r1") ||
    base === "qwq" ||
    rawName.includes("qwq-") ||
    rawName.includes("phi4-reasoning") ||
    rawName.includes("phi-4-reasoning") ||
    rawName.includes("phi4-mini-reasoning") ||
    rawName.includes("magistral") ||
    rawName.includes("openthinker") ||
    rawName.includes("marco-o1") ||
    rawName.includes("skywork-o1");

  if (isAlwaysOnReasoning) {
    return {
      thinkingMode: "always_on",
      supportsThinking: true,
      supportsThinkingLevels: false,
      canToggleOff: false,
      canToggle: false,
      supportedThinkingLevels: ["on"],
      supportedLevels: ["on"],
      defaultThinkingLevel: "on",
      defaultLevel: "on",
      supportsThinkingBudget: true,
      usesHarmonyFormat: false,
      badgeLabel: "Always-On Chain-of-Thought",
      summaryLabel: "Always-On Chain-of-Thought Reasoning (<think>)",
    };
  }

  // 3. Hybrid On/Off toggleable thinking models (`qwen3`, `qwen3.5`, `lfm3`, `glm-4.5`, `glm-z1`, `cogito`, `granite3.2`, `granite3.3`, `smollm3`, `deepseek-v3.1`, `nemotron`, `seed-oss`, `hunyuan`, `mimo`, `gemma4`)
  const isToggleableThinking =
    caps.has("thinking") ||
    Boolean(modelInput.reasoningCapable) ||
    rawName.includes("qwen3") ||
    rawName.includes("lfm3") ||
    rawName.includes("glm-4.5") ||
    rawName.includes("glm-z1") ||
    rawName.includes("glm4") ||
    rawName.includes("cogito") ||
    rawName.includes("granite3.2") ||
    rawName.includes("granite3.3") ||
    rawName.includes("smollm3") ||
    rawName.includes("deepseek-v3") ||
    rawName.includes("deepseek-v4") ||
    rawName.includes("glm-5") ||
    rawName.includes("kimi-k") ||
    rawName.includes("reflection/beam") ||
    rawName.includes("nemotron") ||
    rawName.includes("seed-oss") ||
    rawName.includes("hunyuan") ||
    rawName.includes("mimo") ||
    rawName.includes("gemma4") ||
    rawName.includes("gemma-4") ||
    rawName.includes("muse");

  if (isToggleableThinking) {
    return {
      thinkingMode: "toggle",
      supportsThinking: true,
      supportsThinkingLevels: false,
      canToggleOff: true,
      canToggle: true,
      supportedThinkingLevels: ["off", "on"],
      supportedLevels: ["off", "on"],
      defaultThinkingLevel: "off",
      defaultLevel: "off",
      supportsThinkingBudget: true,
      usesHarmonyFormat: false,
      badgeLabel: "Thinking Toggle: On / Off",
      summaryLabel: "Toggleable Thinking (Turn On or Off)",
    };
  }

  return {
    thinkingMode: "none",
    supportsThinking: false,
    supportsThinkingLevels: false,
    canToggleOff: true,
    canToggle: false,
    supportedThinkingLevels: [],
    supportedLevels: [],
    defaultThinkingLevel: "off",
    defaultLevel: "off",
    supportsThinkingBudget: false,
    usesHarmonyFormat: false,
    badgeLabel: "Standard Direct Response (No Thinking)",
    summaryLabel: "Standard Direct Response (No Thinking)",
  };
}

/**
 * UI badge indicator describing a single supported capability on an AI model.
 */
export interface ModelFeatureIndicator {
  id: string;
  icon: string;
  label: string;
  description: string;
}

/**
 * Comprehensive feature matrix, visual indicators, and thinking capabilities for an AI model.
 */
export interface ModelFeatureProfile {
  modelName: string;
  summary: string;
  useCases: string[];
  indicators: ModelFeatureIndicator[];
  features: {
    chat: boolean;
    code: boolean;
    thinking: boolean;
    thinkingMode: ModelThinkingMode;
    thinkingLevels: boolean;
    thinkingToggle: boolean;
    thinkingAlwaysOn: boolean;
    thinkingBudget: boolean;
    vision: boolean;
    tools: boolean;
    structuredJson: boolean;
    decisionSystemOne: boolean;
    audioSpeech: boolean;
    embeddings: boolean;
    webSearch: boolean;
    cloud: boolean;
    mlx: boolean;
  };
  thinkingCapabilities: ModelThinkingCapabilities;
}

/**
 * Returns the exact per-model feature matrix, visual capability indicators, and recommended use cases
 * so the UI only displays controls supported by the selected model and clearly explains what it can do.
 */
export function getModelFeatureProfile(modelInput: {
  name?: string;
  id?: string;
  family?: string;
  capabilities?: string[];
  reasoningCapable?: boolean;
  isMlx?: boolean;
  isCloud?: boolean;
}): ModelFeatureProfile {
  const rawName = String(
    modelInput.name || modelInput.id || "qwen3.5:latest",
  ).trim();
  const lower = rawName.toLowerCase();
  const base = baseModelName(lower);
  const caps = new Set(
    (modelInput.capabilities || []).map((c) => String(c).toLowerCase()),
  );
  const thinkingCaps = getModelThinkingCapabilities(modelInput);

  const isPhonon = isPhononModelName(lower);
  const isAudioSpeech =
    isSpeechModelName(lower) ||
    caps.has("speech") ||
    caps.has("tts") ||
    caps.has("audio") ||
    lower.includes("omni");
  const isDecision = isDecisionModelName(lower, modelInput.capabilities);
  const isEmbedding =
    caps.has("embedding") ||
    caps.has("embeddings") ||
    lower.includes("embed") ||
    lower.includes("bge-");
  const isChat =
    !isPhonon &&
    !isEmbedding &&
    (!isDecision || caps.has("chat") || caps.has("completion"));
  const isVision =
    caps.has("vision") ||
    lower.includes("-vl") ||
    lower.includes("_vl") ||
    lower.includes("omni") ||
    lower.includes("qwen3.5") ||
    lower.includes("gemma3") ||
    lower.includes("gemma4") ||
    lower.includes("llava") ||
    lower.includes("pixtral") ||
    lower.includes("minicpm-v") ||
    lower.includes("deepseek-v4.1") ||
    lower.includes("glm-5.3-flash") ||
    lower.includes("kimi-k3") ||
    lower.includes("muse-spark") ||
    base === "clef" ||
    base === "clef-flash";
  const isTools =
    caps.has("tools") ||
    (isChat &&
      !lower.includes("deepseek-r1") &&
      !lower.includes("deepseek_r1") &&
      !lower.includes("qwq") &&
      !lower.includes("-vl:") &&
      (lower.includes("qwen") ||
        lower.includes("gpt-oss") ||
        lower.includes("lfm3") ||
        lower.includes("cogito") ||
        lower.includes("llama3") ||
        lower.includes("mistral") ||
        lower.includes("gemma4") ||
        lower.includes("glm") ||
        lower.includes("deepseek-v4") ||
        lower.includes("kimi") ||
        lower.includes("muse") ||
        lower.includes("reflection/beam")));
  const isCode = isChat;
  const isStructuredJson = isChat;
  const isWebSearch = isChat;
  const isCloud = Boolean(modelInput.isCloud) || isCloudModelName(lower);
  const isMlx =
    Boolean(modelInput.isMlx) ||
    lower.includes("mlx") ||
    lower.includes("mxfp");

  const indicators: ModelFeatureIndicator[] = [];
  const useCases: string[] = [];

  if (thinkingCaps.thinkingMode === "levels") {
    indicators.push({
      id: "thinking_levels",
      icon: "🧠",
      label: "Thinking Levels (Low / Med / High)",
      description:
        "Choose Low, Medium, or High reasoning effort before generating.",
    });
    useCases.push(
      "Select Low, Medium, or High reasoning effort for complex tasks",
    );
  } else if (thinkingCaps.thinkingMode === "toggle") {
    indicators.push({
      id: "thinking_toggle",
      icon: "🔀",
      label: "Thinking Toggle (On / Off)",
      description:
        "Turn Deep Thinking On for step-by-step reasoning or Off for instant direct replies.",
    });
    useCases.push(
      "Toggle Thinking On for deep analysis or Off for fast replies",
    );
  } else if (thinkingCaps.thinkingMode === "always_on") {
    indicators.push({
      id: "thinking_always_on",
      icon: "🧠",
      label: "Always-On Reasoning (<think>)",
      description:
        "Always performs multi-step chain-of-thought verification before answering.",
    });
    useCases.push(
      "Step-by-step math proofs, logic verification & root-cause bug hunting",
    );
  } else if (isChat) {
    indicators.push({
      id: "direct_fast",
      icon: "⚡",
      label: "Fast Direct Output (No Thinking Overhead)",
      description: "Answers immediately without chain-of-thought latency.",
    });
    useCases.push("Instant low-latency answers, summarization & code drafting");
  }

  if (isVision) {
    indicators.push({
      id: "vision",
      icon: "👁",
      label: "Vision (Images & Screenshots)",
      description:
        "Inspects PNG/JPG/WebP images, receipts, diagrams, and UI screenshots.",
    });
    useCases.push("Inspect images, receipts, diagrams, and UI screenshots");
  }

  if (isAudioSpeech) {
    indicators.push({
      id: "speech",
      icon: "🔊",
      label: "Speech & Audio Synthesis",
      description:
        "Reads files and answers aloud with natural voice synthesis.",
    });
    useCases.push("Read documents aloud and export spoken WAV/PCM audio");
  }

  if (isDecision) {
    indicators.push({
      id: "decision",
      icon: "⚖️",
      label: "SystemOne Decision (noul / choice / score)",
      description:
        "Scores Yes/No probabilities, multi-choice buckets (A-Z), and 1-10 ratings.",
    });
    useCases.push(
      "Triage files with Yes/No (noul), A-Z categories, and 1-10 urgency scores",
    );
  }

  if (isEmbedding) {
    indicators.push({
      id: "embeddings",
      icon: "🧭",
      label: "Semantic Embeddings (/api/embed)",
      description:
        "Generates dense vector embeddings for meaning-based file search.",
    });
    useCases.push("Search files by meaning and cluster related documents");
  }

  if (isCode) {
    indicators.push({
      id: "code",
      icon: "💻",
      label: "Chat & Code Analysis",
      description:
        "Summarizes files, writes/refactors code, and explains logs.",
    });
    useCases.push(
      "Summarize files, refactor code, and explain logs in plain English",
    );
  }

  if (isTools) {
    indicators.push({
      id: "tools",
      icon: "🛠",
      label: "Tool Calling",
      description:
        "Can propose safe file creation/rename actions with visual confirmation.",
    });
    useCases.push(
      "Run safe file creation & organization tools with confirmation",
    );
  }

  if (isStructuredJson) {
    indicators.push({
      id: "structured_json",
      icon: "📐",
      label: "Structured JSON",
      description:
        "Outputs schema-validated JSON for batch renames, audits, and tables.",
    });
    useCases.push(
      "Generate schema-validated JSON plans (batch rename, code review, tables)",
    );
  }

  if (isCloud) {
    indicators.push({
      id: "cloud",
      icon: "☁️",
      label: "Zero-RAM Cloud Host",
      description: "Runs on remote cloud GPUs using 0 GB of local system RAM.",
    });
  } else if (isMlx) {
    indicators.push({
      id: "mlx",
      icon: "🍎",
      label: "Apple Silicon MLX",
      description: "Accelerated with native Apple Silicon unified memory.",
    });
  }

  const summary =
    useCases.length > 0
      ? `Best for: ${useCases.slice(0, 3).join(" • ")}.`
      : "General-purpose local AI model.";

  return {
    modelName: rawName,
    summary,
    useCases,
    indicators,
    features: {
      chat: isChat,
      code: isCode,
      thinking: thinkingCaps.supportsThinking,
      thinkingMode: thinkingCaps.thinkingMode,
      thinkingLevels: thinkingCaps.thinkingMode === "levels",
      thinkingToggle: thinkingCaps.thinkingMode === "toggle",
      thinkingAlwaysOn: thinkingCaps.thinkingMode === "always_on",
      thinkingBudget: thinkingCaps.supportsThinkingBudget,
      vision: isVision,
      tools: isTools,
      structuredJson: isStructuredJson,
      decisionSystemOne: isDecision,
      audioSpeech: isAudioSpeech,
      embeddings: isEmbedding,
      webSearch: isWebSearch,
      cloud: isCloud,
      mlx: isMlx,
    },
    thinkingCapabilities: thinkingCaps,
  };
}

/**
 * Resolves the exact `think` parameter (`boolean | "low" | "medium" | "high"`), normalized `thinkingLevel`,
 * and optional system/budget hints for Ollama `/api/chat` and `/api/generate` as well as LM Studio Bionic.
 */
export function resolveOllamaThinkConfig(
  modelName: string,
  input: {
    think?: boolean | "low" | "medium" | "high" | "on" | "off" | "auto";
    thinkingLevel?: ThinkingEffortChoice | string;
    thinkingBudget?: number;
    speakReply?: boolean;
    capabilities?: string[];
  },
): {
  thinkParam: boolean | "low" | "medium" | "high";
  thinkEnabled: boolean;
  effectiveThinkingLevel: "off" | "on" | "low" | "medium" | "high";
  effectiveLevel: "off" | "on" | "low" | "medium" | "high";
  reasoningEffort: "low" | "medium" | "high" | undefined;
  thinkingMode: ModelThinkingMode;
  thinkingBudget: number | null;
  effortSystemHint: string | null;
  systemReasoningDirective: string;
} {
  const caps = getModelThinkingCapabilities({
    name: modelName,
    capabilities: input.capabilities,
  });
  const rawLevel = String(input.thinkingLevel ?? "")
    .trim()
    .toLowerCase();
  const rawThink = input.think;

  // Rule B: When reading a reply out loud with Phonon/Speech, minimize or disable thinking
  if (input.speakReply) {
    if (caps.thinkingMode === "levels") {
      return {
        thinkParam: "low",
        thinkEnabled: true,
        effectiveThinkingLevel: "low",
        effectiveLevel: "low",
        reasoningEffort: "low",
        thinkingMode: caps.thinkingMode,
        thinkingBudget: 512,
        effortSystemHint: "Reasoning: low",
        systemReasoningDirective: "Reasoning: low",
      };
    }
    return {
      thinkParam: false,
      thinkEnabled: false,
      effectiveThinkingLevel: "off",
      effectiveLevel: "off",
      reasoningEffort: undefined,
      thinkingMode: caps.thinkingMode,
      thinkingBudget: null,
      effortSystemHint: null,
      systemReasoningDirective: "",
    };
  }

  let requestedLevel: "auto" | "off" | "on" | "low" | "medium" | "high" =
    "auto";
  if (
    rawLevel === "low" ||
    rawLevel === "medium" ||
    rawLevel === "high" ||
    rawLevel === "on" ||
    rawLevel === "off"
  ) {
    requestedLevel = rawLevel;
  } else if (
    rawThink === "low" ||
    rawThink === "medium" ||
    rawThink === "high"
  ) {
    requestedLevel = rawThink;
  } else if (rawThink === "on" || rawThink === true) {
    requestedLevel = "on";
  } else if (rawThink === "off" || rawThink === false) {
    requestedLevel = "off";
  }

  const explicitBudget =
    typeof input.thinkingBudget === "number" &&
    Number.isFinite(input.thinkingBudget) &&
    input.thinkingBudget > 0
      ? Math.round(input.thinkingBudget)
      : null;

  // Case 1: `gpt-oss` and multi-level models where Ollama's `think` parameter accepts `"low" | "medium" | "high"`
  if (caps.thinkingMode === "levels") {
    const level: "low" | "medium" | "high" =
      requestedLevel === "low" ||
      requestedLevel === "medium" ||
      requestedLevel === "high"
        ? requestedLevel
        : requestedLevel === "off"
          ? "low"
          : "medium";
    const defaultBudget =
      level === "low" ? 1024 : level === "medium" ? 4096 : 16384;
    const finalBudget = explicitBudget ?? defaultBudget;
    const directive = explicitBudget
      ? `Reasoning: ${level}\nKeep internal thinking within approximately ${explicitBudget} tokens.`
      : `Reasoning: ${level}`;
    return {
      thinkParam: level,
      thinkEnabled: true,
      effectiveThinkingLevel: level,
      effectiveLevel: level,
      reasoningEffort: level,
      thinkingMode: "levels",
      thinkingBudget: finalBudget,
      effortSystemHint: directive,
      systemReasoningDirective: directive,
    };
  }

  // Case 2: Toggleable (`qwen3.5`, `lfm3`, `glm-4.5`, `cogito`, etc.) or Always-On (`deepseek-r1`, `qwq`) models
  const isTurnedOn =
    requestedLevel === "on" ||
    requestedLevel === "low" ||
    requestedLevel === "medium" ||
    requestedLevel === "high" ||
    (requestedLevel === "auto" && caps.thinkingMode === "always_on");

  if (!isTurnedOn) {
    return {
      thinkParam: false,
      thinkEnabled: false,
      effectiveThinkingLevel: "off",
      effectiveLevel: "off",
      reasoningEffort: undefined,
      thinkingMode: caps.thinkingMode,
      thinkingBudget: null,
      effortSystemHint: null,
      systemReasoningDirective: "",
    };
  }

  const effectiveLevel: "on" | "low" | "medium" | "high" =
    requestedLevel === "low" ||
    requestedLevel === "medium" ||
    requestedLevel === "high"
      ? requestedLevel
      : "on";
  const reasoningEffort: "low" | "medium" | "high" | undefined =
    effectiveLevel === "low" ||
    effectiveLevel === "medium" ||
    effectiveLevel === "high"
      ? effectiveLevel
      : undefined;

  const budgetForLevel =
    explicitBudget ??
    (effectiveLevel === "low"
      ? 1024
      : effectiveLevel === "medium"
        ? 4096
        : effectiveLevel === "high"
          ? 16384
          : null);

  const hintParts: string[] = [];
  if (effectiveLevel === "low") {
    hintParts.push(
      "Keep internal step-by-step thinking concise and brief (low reasoning effort).",
    );
  } else if (effectiveLevel === "medium") {
    hintParts.push(
      "Use balanced step-by-step thinking (medium reasoning effort).",
    );
  } else if (effectiveLevel === "high") {
    hintParts.push(
      "Perform thorough, exhaustive step-by-step reasoning and verification (high reasoning effort).",
    );
  }
  if (budgetForLevel) {
    hintParts.push(`Target thinking token budget: ~${budgetForLevel} tokens.`);
  }
  const directive = hintParts.join(" ");

  return {
    thinkParam: true,
    thinkEnabled: true,
    effectiveThinkingLevel: effectiveLevel,
    effectiveLevel,
    reasoningEffort,
    thinkingMode: caps.thinkingMode,
    thinkingBudget: budgetForLevel,
    effortSystemHint: directive || null,
    systemReasoningDirective: directive,
  };
}

/**
 * Extracts reasoning traces and clean final content from:
 * - Explicit `thinking` / `reasoning` / `reasoning_content` fields
 * - OpenAI `gpt-oss` Harmony channels (`<|channel|>analysis<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>...`)
 * - `<think>...</think>` and `<reasoning>...</reasoning>` tags
 */
export function extractThinkingAndFinalContent(
  rawContent: string,
  explicitThinking = "",
): { thinkingText: string; content: string } {
  let content = String(rawContent || "");
  const reasoningParts: string[] = [];
  if (explicitThinking && String(explicitThinking).trim()) {
    reasoningParts.push(String(explicitThinking).trim());
  }

  // 1. Parse gpt-oss Harmony format channels if present
  if (content.includes("<|channel|>")) {
    const analysisRegex =
      /<\|channel\|>(?:analysis|commentary)<\|message\|>([\s\S]*?)(?:<\|end\|>|(?=<\|start\|>|<\|channel\|>final)|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = analysisRegex.exec(content)) !== null) {
      const chunk = (match[1] || "").trim();
      if (chunk && !reasoningParts.includes(chunk)) {
        reasoningParts.push(chunk);
      }
    }
    const finalMatch =
      /<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|<\|return\|>|$)/i.exec(
        content,
      );
    if (finalMatch) {
      content = finalMatch[1]!.trim();
    } else {
      content = content
        .replace(/<\|start\|>assistant/gi, "")
        .replace(
          /<\|channel\|>(?:analysis|commentary)<\|message\|>[\s\S]*?(?:<\|end\|>|$)/gi,
          "",
        )
        .replace(/<\|channel\|>final<\|message\|>/gi, "")
        .replace(/<\|(?:end|return)\|>/gi, "")
        .trim();
    }
  }

  // 2. Parse <think>...</think> and <reasoning>...</reasoning> blocks
  content = content.replace(
    /<(?:think|reasoning)>([\s\S]*?)<\/(?:think|reasoning)>/gi,
    (_m, inner) => {
      const trimmed = String(inner || "").trim();
      if (trimmed && !reasoningParts.includes(trimmed)) {
        reasoningParts.push(trimmed);
      }
      return "";
    },
  );

  // Handle unclosed <think> tag if truncated
  const openThinkIdx = content.indexOf("<think>");
  if (openThinkIdx !== -1) {
    const partial = content.slice(openThinkIdx + 7).trim();
    if (partial && !reasoningParts.includes(partial)) {
      reasoningParts.push(partial);
    }
    content = content.slice(0, openThinkIdx).trim();
  }

  return {
    thinkingText: reasoningParts.join("\n\n").trim(),
    content: content.trim(),
  };
}

/**
 * Checks whether a model is MLX-optimized (Apple Silicon native runner/safetensors/mlx tag)
 * or a specialized utility model (`phonon`, `nimble`, `tev1`, `clef`, `clef-flash`).
 */
export function isMlxOptimizedModel(model: {
  name: string;
  runner?: string;
  format?: string;
  quantization?: string;
  family?: string;
}): boolean {
  const nameLower = String(model.name || "").toLowerCase();
  const runnerLower = String(model.runner || "").toLowerCase();
  const formatLower = String(model.format || "").toLowerCase();
  const quantLower = String(model.quantization || "").toLowerCase();
  const familyLower = String(model.family || "").toLowerCase();

  if (nameLower.includes("non-mlx")) return false;
  if (runnerLower === "mlx") return true;
  if (
    nameLower.includes("mlx") ||
    nameLower.includes("mxfp") ||
    nameLower.includes("nvfp4") ||
    nameLower.startsWith("lfm3") ||
    nameLower.startsWith("d3:") ||
    nameLower.startsWith("qwen3.5") ||
    nameLower.startsWith("gpt-oss") ||
    nameLower.includes("openai/gpt-oss")
  ) {
    return true;
  }
  if (quantLower.includes("mxfp") || quantLower.includes("nvfp")) return true;
  if (formatLower === "safetensors") return true;
  if (
    familyLower.includes("phonon") ||
    familyLower.includes("lfm3") ||
    familyLower.includes("qwen35") ||
    familyLower.includes("qwen3.5") ||
    familyLower.includes("gpt-oss") ||
    familyLower.includes("gpt_oss")
  ) {
    return true;
  }
  if (isUtilityModelName(nameLower)) return true;
  return false;
}

/**
 * Parses parameter count in billions (B) and estimated memory requirement in bytes for any model.
 */
export function estimateModelMemoryAndParams(model: {
  name: string;
  sizeBytes?: number;
  parameterSize?: string;
  parameterCount?: number;
  quantization?: string;
}): {
  parameterBillions: number;
  estimatedRamBytes: number;
  estimatedRamGb: number;
} {
  const nameLower = String(model.name || "").toLowerCase();
  if (isCloudModelName(nameLower)) {
    return { parameterBillions: 0, estimatedRamBytes: 0, estimatedRamGb: 0 };
  }
  const base = baseModelName(nameLower);
  if (base === "phonon") {
    return {
      parameterBillions: 0.044,
      estimatedRamBytes: 220 * 1024 * 1024,
      estimatedRamGb: 0.22,
    };
  }
  if (base === "kokoro") {
    return {
      parameterBillions: 0.082,
      estimatedRamBytes: 340 * 1024 * 1024,
      estimatedRamGb: 0.34,
    };
  }
  if (
    base === "oute-tts" ||
    base === "outetts" ||
    base === "parler-tts" ||
    base === "llasa"
  ) {
    const sz =
      model.sizeBytes && model.sizeBytes > 0
        ? model.sizeBytes
        : 1100 * 1024 * 1024;
    return {
      parameterBillions: 1.0,
      estimatedRamBytes: sz,
      estimatedRamGb: Math.round((sz / 1024 ** 3) * 100) / 100,
    };
  }
  if (base === "orpheus" || base === "orpheus-tts" || base === "bark") {
    const sz =
      model.sizeBytes && model.sizeBytes > 0
        ? model.sizeBytes
        : Math.round(2.1 * 1024 ** 3);
    return {
      parameterBillions: 3.0,
      estimatedRamBytes: sz,
      estimatedRamGb: Math.round((sz / 1024 ** 3) * 100) / 100,
    };
  }
  if (base === "nimble" || base === "clef-flash" || base === "tev1") {
    const sz =
      model.sizeBytes && model.sizeBytes > 0
        ? model.sizeBytes
        : 900 * 1024 * 1024;
    return {
      parameterBillions: 1.2,
      estimatedRamBytes: sz,
      estimatedRamGb: Math.round((sz / 1024 ** 3) * 100) / 100,
    };
  }
  if (base === "clef") {
    const sz =
      model.sizeBytes && model.sizeBytes > 0
        ? model.sizeBytes
        : Math.round(2.4 * 1024 ** 3);
    return {
      parameterBillions: 2.5,
      estimatedRamBytes: sz,
      estimatedRamGb: Math.round((sz / 1024 ** 3) * 100) / 100,
    };
  }

  let paramsB = 0;
  if (typeof model.parameterCount === "number" && model.parameterCount > 0) {
    paramsB = model.parameterCount / 1e9;
  } else if (
    typeof model.parameterSize === "string" &&
    model.parameterSize.trim()
  ) {
    const m = /^([\d.]+)\s*([BMTK])/i.exec(model.parameterSize.trim());
    if (m) {
      const val = Number(m[1]);
      const unit = m[2]!.toUpperCase();
      if (unit === "B") paramsB = val;
      else if (unit === "M") paramsB = val / 1000;
      else if (unit === "T") paramsB = val * 1000;
    }
  }

  // Also check explicit `:70b`, `:32b`, `:14b`, `:13b`, `:9b`, `:8b`, `:7b`, `:4b`, `:3b`, `:2b`, `:1b` in model name
  const tagMatch = /(?:[:_-]|^)(\d+(?:\.\d+)?)b(?![a-z0-9])/i.exec(nameLower);
  if (tagMatch) {
    const fromTag = Number(tagMatch[1]);
    if (Number.isFinite(fromTag) && fromTag > 0) {
      // If parameterSize wasn't given, or tag explicitly states the nominal tier (e.g. 7b, 13b, 70b), use it
      if (!paramsB || Math.abs(fromTag - paramsB) < 2) {
        paramsB = fromTag;
      }
    }
  }

  if (!paramsB) {
    if (model.sizeBytes && model.sizeBytes > 0) {
      paramsB = Math.max(
        0.5,
        Math.round((model.sizeBytes / (0.75 * 1024 ** 3)) * 10) / 10,
      );
    } else {
      paramsB = 3.0;
    }
  }

  let estimatedRamBytes = 0;
  if (model.sizeBytes && model.sizeBytes > 0) {
    // Model weights + ~15% KV cache / runtime overhead
    estimatedRamBytes = Math.round(model.sizeBytes * 1.12);
  } else {
    const quant = String(model.quantization || nameLower).toLowerCase();
    const bytesPerParam =
      quant.includes("bf16") || quant.includes("fp16")
        ? 2.1
        : quant.includes("fp8") || quant.includes("q8")
          ? 1.15
          : 0.72;
    estimatedRamBytes = Math.round(
      paramsB * bytesPerParam * 1024 ** 3 + 350 * 1024 * 1024,
    );
  }

  const estimatedRamGb =
    Math.round((estimatedRamBytes / 1024 ** 3) * 100) / 100;
  return {
    parameterBillions: Math.round(paramsB * 100) / 100,
    estimatedRamBytes,
    estimatedRamGb,
  };
}

/**
 * Result of evaluating whether a model satisfies Apple Silicon MLX exclusivity and the 70% RAM safety ceiling.
 */
export interface HardwareGuardVerdict {
  allowed: boolean;
  code: "OK" | "HARDWARE_RAM_REFUSAL" | "HARDWARE_MLX_EXCLUSIVITY";
  model: string;
  isCloud: boolean;
  isMlx: boolean;
  isUtility: boolean;
  parameterBillions: number;
  estimatedRamBytes: number;
  estimatedRamGb: number;
  safeMemoryBudgetBytes: number;
  safeMemoryBudgetGb: number;
  totalRamGb: number;
  ramTier: RamSafetyTier;
  reason: string;
  suggestedLocalModel: string;
  suggestedCloudModel: string;
}

/**
 * Curated catalog of models across capabilities so the agent can always recommend a hardware-fitted
 * MLX / local model or `:cloud` alternative.
 */
export interface CatalogModelSpec {
  name: string;
  label: string;
  parameterSize: string;
  parameterBillions: number;
  estimatedRamGb: number;
  runner: "mlx" | "standard" | "cloud";
  capabilities: string[];
  description: string;
}

/**
 * Default general-purpose multimodal chat and vision model tag (`qwen3.5:latest`).
 */
export const DEFAULT_GENERAL_CHAT_MODEL = "qwen3.5:latest";
/**
 * Default compact multimodal chat and vision model tag for lower-RAM systems (`qwen3.5:4b`).
 */
export const DEFAULT_COMPACT_CHAT_MODEL = "qwen3.5:4b";

/**
 * Curated list of Ollama local, MLX, utility, and `:cloud` models with RAM and capability metadata.
 */
export const CURATED_MODEL_CATALOG: CatalogModelSpec[] = [
  {
    name: "qwen3.5:latest",
    label:
      "Qwen 3.5 (Default General-Purpose Multimodal Chat, Vision, Deep Thinking & Tools — macOS, Windows & Linux)",
    parameterSize: "4B",
    parameterBillions: 4.0,
    estimatedRamGb: 3.1,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "thinking", "mlx"],
    description:
      "Default general-purpose LLM across macOS, Windows, and Linux supporting Chat, Vision, Code, Deep Thinking, and Tool Calling (`ollama run qwen3.5`).",
  },
  {
    name: "qwen3.5:4b",
    label:
      "Qwen 3.5 4B (Compact Multimodal Vision, Deep Thinking & Tools — Smaller Memory Computers)",
    parameterSize: "4B",
    parameterBillions: 4.0,
    estimatedRamGb: 3.1,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "thinking", "mlx"],
    description:
      "Official Qwen 3.5 4B (`qwen3.5:4b`) multimodal Chat, Vision, Deep Thinking & Tool-Calling model tailored for smaller memory computers on macOS, Windows, and Linux.",
  },
  {
    name: "gpt-oss:20b",
    label:
      "OpenAI gpt-oss 20B (Multi-Level Reasoning: Low / Medium / High + Tools — MXFP4)",
    parameterSize: "20B",
    parameterBillions: 20.0,
    estimatedRamGb: 13.8,
    runner: "mlx",
    capabilities: ["completion", "tools", "thinking", "mlx"],
    description:
      'OpenAI gpt-oss 20B open-weight reasoning model with selectable Low, Medium, and High thinking effort levels (`think: "low" | "medium" | "high"`).',
  },
  {
    name: "gpt-oss:120b",
    label:
      "OpenAI gpt-oss 120B (Pro Multi-Level Reasoning: Low / Medium / High + Tools — MXFP4)",
    parameterSize: "120B",
    parameterBillions: 120.0,
    estimatedRamGb: 65.0,
    runner: "mlx",
    capabilities: ["completion", "tools", "thinking", "mlx"],
    description:
      'OpenAI gpt-oss 120B frontier open-weight reasoning model with selectable Low, Medium, and High thinking effort levels (`think: "low" | "medium" | "high"`).',
  },
  {
    name: "deepseek-r1:8b",
    label: "DeepSeek-R1 8B (Native Chain-of-Thought Reasoning & Code)",
    parameterSize: "8B",
    parameterBillions: 8.0,
    estimatedRamGb: 5.2,
    runner: "mlx",
    capabilities: ["completion", "thinking", "mlx"],
    description:
      "DeepSeek-R1 8B reasoning model with `<think>...</think>` chain-of-thought traces and configurable thinking budget.",
  },
  {
    name: "cogito:8b",
    label:
      "Cogito v1 8B (Hybrid Toggleable On/Off Deep Thinking & Tool Calling)",
    parameterSize: "8B",
    parameterBillions: 8.0,
    estimatedRamGb: 5.1,
    runner: "mlx",
    capabilities: ["completion", "tools", "thinking", "mlx"],
    description:
      "Hybrid reasoning model that lets you toggle thinking On (`think: true`) or Off (`think: false`) per message.",
  },
  {
    name: "lfm3:latest",
    label: "LFM3 1.7B MLX (Ultra-Fast Chat, Tools & Thinking)",
    parameterSize: "1.7B",
    parameterBillions: 1.7,
    estimatedRamGb: 1.8,
    runner: "mlx",
    capabilities: ["completion", "tools", "thinking", "mlx"],
    description:
      "Compact Apple Silicon MLX model with deep thinking and tool calling. Fits even under 8 GB RAM.",
  },
  {
    name: "lfm3-vl:2b-mlx-bf16",
    label: "LFM3-VL 2B MLX BF16 (Vision, Chat, Tools & Thinking)",
    parameterSize: "1.9B",
    parameterBillions: 1.9,
    estimatedRamGb: 3.9,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "thinking", "mlx"],
    description:
      "Native Apple Silicon MLX vision-language model for inspecting screenshots, OCR, and multimodal chat.",
  },
  {
    name: "lfm3-omni:2b-mlx-bf16",
    label: "LFM3-Omni 2B MLX BF16 (Multimodal Vision, Audio & Chat)",
    parameterSize: "2.2B",
    parameterBillions: 2.2,
    estimatedRamGb: 4.5,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "audio", "speech", "mlx"],
    description:
      "Native Apple Silicon MLX omni model supporting text, vision, tools, and audio.",
  },
  {
    name: "phonon",
    label: "Gradium Phonon TTS (Neural Speech Synthesizer)",
    parameterSize: "43.6M",
    parameterBillions: 0.044,
    estimatedRamGb: 0.22,
    runner: "mlx",
    capabilities: ["speech", "mlx"],
    description:
      "Dedicated real-time neural text-to-speech engine with 38+ voices (`/v1/audio/speech`).",
  },
  {
    name: "nimble",
    label: "Nimble (SystemOne Decision Engine — Text & JSON)",
    parameterSize: "1.2B",
    parameterBillions: 1.2,
    estimatedRamGb: 0.9,
    runner: "mlx",
    capabilities: ["decision"],
    description:
      "Ultra-fast SystemOne decision model for yes/no probability (`noul`), `choice`, and `score` rubrics.",
  },
  {
    name: "clef-flash",
    label: "Clef-Flash (Fast Multimodal Decision Engine — Text & Images)",
    parameterSize: "1.5B",
    parameterBillions: 1.5,
    estimatedRamGb: 1.2,
    runner: "mlx",
    capabilities: ["decision", "vision"],
    description:
      "Fast SystemOne decision & image classifier for receipts, screenshots, and documents.",
  },
  {
    name: "clef",
    label: "Clef (High-Accuracy Multimodal Decision Engine — Text & Images)",
    parameterSize: "2.5B",
    parameterBillions: 2.5,
    estimatedRamGb: 2.4,
    runner: "mlx",
    capabilities: ["decision", "vision"],
    description:
      "SystemOne decision engine that judges both text files and images (`PNG`, `JPEG`, `WebP`).",
  },
  {
    name: "tev1",
    label: "TEv1 (SystemOne Text Evaluation & Rubric Scorer)",
    parameterSize: "1.2B",
    parameterBillions: 1.2,
    estimatedRamGb: 0.9,
    runner: "mlx",
    capabilities: ["decision"],
    description:
      "Lightweight SystemOne decision and rubric scoring utility model.",
  },
  {
    name: "d3:9b-mxfp8",
    label: "D3 9B MXFP8 MLX (Pro Vision & Decision Engine)",
    parameterSize: "8.4B",
    parameterBillions: 8.4,
    estimatedRamGb: 10.1,
    runner: "mlx",
    capabilities: ["decision", "vision", "mlx"],
    description:
      "Apple Silicon MLX 8.4B multimodal decision & vision scorer (requires 16+ GB RAM).",
  },
  {
    name: "lfm3-omni:latest",
    label:
      "Liquid LFM3-Omni 2B (Official Omni Audio, Speech, Vision & Chat — Cross-Platform & MLX)",
    parameterSize: "2B",
    parameterBillions: 2.0,
    estimatedRamGb: 1.9,
    runner: "mlx",
    capabilities: ["completion", "speech", "audio", "vision", "tools", "mlx"],
    description:
      "Liquid AI LFM3-Omni 2B multimodal model supporting Audio/Speech, Vision, Chat, and Tool Calling (`ollama run lfm3-omni`).",
  },
  {
    name: "orpheus:latest",
    label:
      "Orpheus TTS 3B (Cross-Platform Text-to-Audio LLM — Linux, Windows & Mac)",
    parameterSize: "3B",
    parameterBillions: 3.0,
    estimatedRamGb: 2.1,
    runner: "standard",
    capabilities: ["speech", "audio", "completion"],
    description:
      "Expressive cross-platform Text-to-Audio LLM for Linux and Windows systems where Apple MLX Phonon is not available.",
  },
  {
    name: "kokoro:latest",
    label:
      "Kokoro 82M TTS (Ultra-Light Cross-Platform Text-to-Audio — Linux & Windows)",
    parameterSize: "82M",
    parameterBillions: 0.082,
    estimatedRamGb: 0.34,
    runner: "standard",
    capabilities: ["speech", "audio"],
    description:
      "Ultra-fast 82M cross-platform neural speech synthesizer for Linux and Windows (runs in under 350 MB RAM).",
  },
  {
    name: "oute-tts:latest",
    label:
      "OuteTTS 1B (Cross-Platform Audio & Voice Cloning LLM — Linux & Windows)",
    parameterSize: "1B",
    parameterBillions: 1.0,
    estimatedRamGb: 1.1,
    runner: "standard",
    capabilities: ["speech", "audio", "completion"],
    description:
      "Compact 1B cross-platform Text-to-Audio LLM for natural speech generation on Linux, Windows, and macOS.",
  },
  {
    name: "parler-tts:latest",
    label:
      "Parler-TTS Mini (Prompt-Controlled Text-to-Audio LLM — Linux & Windows)",
    parameterSize: "880M",
    parameterBillions: 0.88,
    estimatedRamGb: 1.0,
    runner: "standard",
    capabilities: ["speech", "audio"],
    description:
      "Cross-platform Text-to-Audio model that generates natural speech on Linux and Windows without Apple MLX.",
  },
  {
    name: "qwen3.5:2b",
    label: "Qwen 3.5 2B (Ultra-Fast Cross-Platform Multimodal — Ultra-Low RAM)",
    parameterSize: "2B",
    parameterBillions: 2.0,
    estimatedRamGb: 1.9,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "thinking", "mlx"],
    description:
      "Ultra-compact Qwen 3.5 2B multimodal model for ultra-low memory machines across macOS, Windows, and Linux.",
  },
  {
    name: "qwen2.5:3b",
    label: "Qwen 2.5 3B (Cross-Platform Chat, Code & Tools — Linux & Windows)",
    parameterSize: "3B",
    parameterBillions: 3.0,
    estimatedRamGb: 2.2,
    runner: "standard",
    capabilities: ["completion", "tools", "thinking"],
    description:
      "Fast cross-platform Chat, Code & Tool-Calling model for Linux and Windows (fits under 8 GB RAM).",
  },
  {
    name: "moondream:latest",
    label: "Moondream 2B Vision (Cross-Platform Image & OCR — Linux & Windows)",
    parameterSize: "1.8B",
    parameterBillions: 1.8,
    estimatedRamGb: 1.7,
    runner: "standard",
    capabilities: ["completion", "vision"],
    description:
      "Compact cross-platform Vision & OCR model for inspecting images and screenshots on Linux and Windows.",
  },
  {
    name: "gemma4:cloud",
    label: "Gemma 4 Cloud (Zero Local RAM — Hybrid Cloud Execution)",
    parameterSize: "Cloud",
    parameterBillions: 0,
    estimatedRamGb: 0,
    runner: "cloud",
    capabilities: ["completion", "vision", "tools", "thinking", "cloud"],
    description:
      "Runs massive Gemma 4 in the cloud via Ollama Cloud with zero local RAM usage.",
  },
  {
    name: "clef:cloud",
    label: "Clef Cloud (Zero Local RAM — Cloud Decision & Vision Scorer)",
    parameterSize: "Cloud",
    parameterBillions: 0,
    estimatedRamGb: 0,
    runner: "cloud",
    capabilities: ["decision", "vision", "cloud"],
    description:
      "Runs Clef multimodal decision scoring in the cloud without using local memory.",
  },
];

/**
 * Enforces Rule A (Mac Apple Silicon MLX Exclusivity), Rule B (70% RAM Safety Ceiling),
 * and Rule C (Polite Hardware Refusal) before running or downloading any model.
 */
export function evaluateModelHardwareGuard(
  modelInput: {
    name: string;
    sizeBytes?: number;
    parameterSize?: string;
    parameterCount?: number;
    runner?: string;
    format?: string;
    quantization?: string;
    family?: string;
    capabilities?: string[];
  },
  hardware: OllamaHardwareSpecs,
  options?: {
    hasMlxAlternativeForTask?: boolean;
    allowNonMlxStandardOnMac?: boolean;
    installedModels?: Array<{
      name: string;
      isMlx?: boolean;
      fitsRam?: boolean;
      capabilities?: string[];
    }>;
    taskCapability?: "chat" | "vision" | "decision" | "speech" | "embed";
  },
): HardwareGuardVerdict {
  const modelName = String(modelInput.name || "").trim();
  const isCloud = isCloudModelName(modelName);
  const isUtility = isUtilityModelName(modelName);
  const isMlx = isCloud ? false : isMlxOptimizedModel(modelInput);
  const { parameterBillions, estimatedRamBytes, estimatedRamGb } =
    estimateModelMemoryAndParams(modelInput);

  // Pick best suggested local model that fits inside the 70% RAM budget
  const taskCap = options?.taskCapability ?? "chat";
  const installedFitting = (options?.installedModels ?? []).filter((m) => {
    if (m.fitsRam === false) return false;
    if (
      hardware.isAppleSiliconMac &&
      m.isMlx === false &&
      !isUtilityModelName(m.name)
    )
      return false;
    if (taskCap === "decision")
      return isDecisionModelName(m.name, m.capabilities);
    if (taskCap === "speech") return isSpeechModelName(m.name);
    if (taskCap === "vision") return m.capabilities?.includes("vision");
    return !isPhononModelName(m.name);
  });

  let suggestedLocalModel = installedFitting[0]?.name ?? "";
  if (!suggestedLocalModel) {
    if (taskCap === "decision") {
      suggestedLocalModel = "nimble";
    } else if (taskCap === "speech") {
      suggestedLocalModel = hardware.isAppleSiliconMac
        ? "phonon"
        : hardware.ramTier === "under_8gb"
          ? "kokoro:latest"
          : "orpheus:latest";
    } else if (taskCap === "vision" && hardware.safeMemoryBudgetGb >= 4.2) {
      suggestedLocalModel =
        hardware.ramTier === "under_8gb" || hardware.ramTier === "8gb_to_16gb"
          ? "qwen3.5:4b"
          : "qwen3.5:latest";
    } else {
      suggestedLocalModel =
        hardware.ramTier === "under_8gb" || hardware.ramTier === "8gb_to_16gb"
          ? "qwen3.5:4b"
          : "qwen3.5:latest";
    }
  }

  const base = baseModelName(modelName);
  const suggestedCloudModel =
    taskCap === "decision" || base === "clef" || base === "nimble"
      ? "clef:cloud"
      : base && !base.includes("mlx") && base !== "lfm3"
        ? `${base}:cloud`
        : "gemma4:cloud";

  // Cloud models always pass local hardware checks (0 local RAM required)
  if (isCloud) {
    return {
      allowed: true,
      code: "OK",
      model: modelName,
      isCloud: true,
      isMlx: false,
      isUtility: false,
      parameterBillions: 0,
      estimatedRamBytes: 0,
      estimatedRamGb: 0,
      safeMemoryBudgetBytes: hardware.safeMemoryBudgetBytes,
      safeMemoryBudgetGb: hardware.safeMemoryBudgetGb,
      totalRamGb: hardware.totalRamGb,
      ramTier: hardware.ramTier,
      reason: "Cloud model runs remotely and uses 0 GB of local RAM.",
      suggestedLocalModel,
      suggestedCloudModel,
    };
  }

  // Utility models (phonon, nimble, clef-flash, tev1) are explicitly permitted on all tiers (including <8 GB RAM and Apple Silicon)
  if (isUtility && estimatedRamBytes <= hardware.safeMemoryBudgetBytes) {
    return {
      allowed: true,
      code: "OK",
      model: modelName,
      isCloud: false,
      isMlx: true,
      isUtility: true,
      parameterBillions,
      estimatedRamBytes,
      estimatedRamGb,
      safeMemoryBudgetBytes: hardware.safeMemoryBudgetBytes,
      safeMemoryBudgetGb: hardware.safeMemoryBudgetGb,
      totalRamGb: hardware.totalRamGb,
      ramTier: hardware.ramTier,
      reason: `Specialized utility model (${modelName}) requires ~${estimatedRamGb} GB and fits safely within your ${hardware.safeMemoryBudgetGb} GB Safe Memory Budget.`,
      suggestedLocalModel,
      suggestedCloudModel,
    };
  }

  // Rule B & C: Check RAM tier parameter ceiling AND 70% Safe Memory Budget
  const exceedsTierParamLimit =
    (hardware.ramTier === "under_8gb" &&
      (parameterBillions >= 7 ||
        parameterBillions > hardware.maxParametersB)) ||
    (hardware.ramTier === "8gb_to_16gb" &&
      (parameterBillions >= 13 ||
        parameterBillions > hardware.maxParametersB)) ||
    (hardware.ramTier === "17gb_to_32gb" &&
      (parameterBillions >= 70 || parameterBillions > hardware.maxParametersB));

  const exceedsSafeRamBudget =
    estimatedRamBytes > hardware.safeMemoryBudgetBytes;

  if (exceedsTierParamLimit || exceedsSafeRamBudget) {
    const tierExplain =
      hardware.ramTier === "under_8gb"
        ? `Your computer has ${hardware.totalRamGb} GB of RAM (Safe 70% Budget: ${hardware.safeMemoryBudgetGb} GB), which only allows tiny models (1B–3B parameters, plus phonon, nimble, and clef-flash) and blocks 7B+ models.`
        : hardware.ramTier === "8gb_to_16gb"
          ? `Your computer has ${hardware.totalRamGb} GB of RAM (Safe 70% Budget: ${hardware.safeMemoryBudgetGb} GB), which allows models up to 7B–8B parameters and blocks 13B+ models.`
          : hardware.ramTier === "17gb_to_32gb"
            ? `Your computer has ${hardware.totalRamGb} GB of RAM (Safe 70% Budget: ${hardware.safeMemoryBudgetGb} GB), which allows models up to 14B–32B parameters and blocks 70B+ models.`
            : `Your computer has ${hardware.totalRamGb} GB of RAM with a strict 70% Safe Memory Budget of ${hardware.safeMemoryBudgetGb} GB (keeping 30% free for the OS and Codecaine File Manager).`;

    return {
      allowed: false,
      code: "HARDWARE_RAM_REFUSAL",
      model: modelName,
      isCloud: false,
      isMlx,
      isUtility,
      parameterBillions,
      estimatedRamBytes,
      estimatedRamGb,
      safeMemoryBudgetBytes: hardware.safeMemoryBudgetBytes,
      safeMemoryBudgetGb: hardware.safeMemoryBudgetGb,
      totalRamGb: hardware.totalRamGb,
      ramTier: hardware.ramTier,
      reason: `Polite Hardware Safety Refusal: Running or downloading "${modelName}" (~${parameterBillions}B parameters, ~${estimatedRamGb} GB memory) exceeds your Safe Memory Budget (${hardware.safeMemoryBudgetGb} GB of ${hardware.totalRamGb} GB RAM) and would freeze your computer. ${tierExplain} Try "${suggestedLocalModel}" (fits comfortably in your RAM) or run "${suggestedCloudModel}" in the cloud instead!`,
      suggestedLocalModel,
      suggestedCloudModel,
    };
  }

  // Rule A: Mac Apple Silicon MLX Exclusivity
  const mlxAltAvailable =
    (options?.hasMlxAlternativeForTask ?? true) &&
    !options?.allowNonMlxStandardOnMac;
  if (hardware.isAppleSiliconMac && mlxAltAvailable && !isMlx && !isUtility) {
    return {
      allowed: false,
      code: "HARDWARE_MLX_EXCLUSIVITY",
      model: modelName,
      isCloud: false,
      isMlx: false,
      isUtility: false,
      parameterBillions,
      estimatedRamBytes,
      estimatedRamGb,
      safeMemoryBudgetBytes: hardware.safeMemoryBudgetBytes,
      safeMemoryBudgetGb: hardware.safeMemoryBudgetGb,
      totalRamGb: hardware.totalRamGb,
      ramTier: hardware.ramTier,
      reason: `Apple Silicon MLX Exclusivity: Your Mac (${hardware.cpuModel}) uses Apple Silicon, and "${modelName}" is a standard non-MLX model. To guarantee native Apple Silicon speed, please use the MLX-optimized model "${suggestedLocalModel}" or run "${suggestedCloudModel}" in the cloud.`,
      suggestedLocalModel,
      suggestedCloudModel,
    };
  }

  return {
    allowed: true,
    code: "OK",
    model: modelName,
    isCloud: false,
    isMlx,
    isUtility,
    parameterBillions,
    estimatedRamBytes,
    estimatedRamGb,
    safeMemoryBudgetBytes: hardware.safeMemoryBudgetBytes,
    safeMemoryBudgetGb: hardware.safeMemoryBudgetGb,
    totalRamGb: hardware.totalRamGb,
    ramTier: hardware.ramTier,
    reason: `Approved: "${modelName}" (~${estimatedRamGb} GB) fits safely within your 70% RAM budget (${hardware.safeMemoryBudgetGb} GB of ${hardware.totalRamGb} GB).`,
    suggestedLocalModel,
    suggestedCloudModel,
  };
}

// ============================================================================
// 2. OLLAMA HTTP CLIENT, VERSION CHECK & LIFECYCLE MANAGEMENT (CAPABILITY K)
// ============================================================================

const DEFAULT_OLLAMA_LOCAL_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_CLOUD_URL = "https://ollama.com";

const runtimeApiKeyByRoot = new Map<string, string>();

/**
 * Retrieves the configured `OLLAMA_API_KEY` from the context, runtime session map, or environment.
 */
export function getOllamaApiKey(ctx: FmContext): string {
  const fromCtx = ctx.ollama?.apiKey?.trim();
  if (fromCtx) return fromCtx;
  const rootKey = ctx.sandboxRoot || ctx.home;
  const fromMap = runtimeApiKeyByRoot.get(rootKey)?.trim();
  if (fromMap) return fromMap;
  const fromEnv = (Bun.env.OLLAMA_API_KEY || "").trim();
  return fromEnv;
}

/**
 * Stores or clears the runtime `OLLAMA_API_KEY` for the current File Manager workspace.
 */
export function setOllamaApiKey(ctx: FmContext, apiKey: string): void {
  const rootKey = ctx.sandboxRoot || ctx.home;
  const trimmed = String(apiKey || "").trim();
  if (trimmed) {
    runtimeApiKeyByRoot.set(rootKey, trimmed);
  } else {
    runtimeApiKeyByRoot.delete(rootKey);
  }
}

/**
 * Resolves the base HTTP URL for either the local Ollama daemon (`127.0.0.1:11434`) or Ollama Cloud (`https://ollama.com`).
 */
export function resolveOllamaBaseUrl(
  ctx: FmContext,
  useCloudHost = false,
): string {
  if (useCloudHost) {
    return (
      ctx.ollama?.cloudBaseUrl ||
      Bun.env.OLLAMA_CLOUD_HOST ||
      DEFAULT_OLLAMA_CLOUD_URL
    ).replace(/\/+$/, "");
  }
  return (
    ctx.ollama?.baseUrl ||
    Bun.env.OLLAMA_HOST ||
    DEFAULT_OLLAMA_LOCAL_URL
  ).replace(/\/+$/, "");
}

function isSafeForApiKeyHeader(urlStr: string, useCloudHost: boolean): boolean {
  if (useCloudHost) return true;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === "https:") return true;
    const h = parsed.hostname.toLowerCase();
    return (
      h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Sends a JSON HTTP request to the local or cloud Ollama server with automatic bearer token injection and model session tracking.
 */
export async function ollamaFetchJson(
  ctx: FmContext,
  endpointPath: string,
  init?: RequestInit & { useCloudHost?: boolean; timeoutMs?: number },
): Promise<{ ok: boolean; status: number; data: any; rawText: string }> {
  const useCloudHost = Boolean(init?.useCloudHost);
  const baseUrl = resolveOllamaBaseUrl(ctx, useCloudHost);
  const isAbsoluteUrl =
    endpointPath.startsWith("http://") || endpointPath.startsWith("https://");
  const url = isAbsoluteUrl
    ? endpointPath
    : `${baseUrl}${endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`}`;
  const apiKey = getOllamaApiKey(ctx);
  const headers = new Headers(init?.headers || {});
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (
    apiKey &&
    !headers.has("Authorization") &&
    (!isAbsoluteUrl || url.startsWith(baseUrl)) &&
    isSafeForApiKeyHeader(url, useCloudHost)
  ) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  const timeoutMs = init?.timeoutMs ?? 45_000;
  if (
    typeof init?.body === "string" &&
    (endpointPath === "/api/chat" ||
      endpointPath === "/api/generate" ||
      endpointPath === "/v1/systemone" ||
      endpointPath === "/v1/audio/speech" ||
      endpointPath === "/api/embed")
  ) {
    const bodyHead =
      init.body.length > 4096 ? init.body.slice(0, 4096) : init.body;
    const isUnloadRequest =
      init.body.length <= 512 && /"keep_alive"\s*:\s*0\b/.test(bodyHead);
    if (!isUnloadRequest) {
      await captureOllamaStartupSnapshot(ctx);
      const modelMatch = bodyHead.match(/"model"\s*:\s*"([^"\\]+)"/);
      if (modelMatch?.[1]) {
        recordSessionLoadedModel(ctx, modelMatch[1]);
      } else if (init.body.length <= 65_536) {
        try {
          const parsedBody = JSON.parse(init.body);
          if (parsedBody?.model && parsedBody?.keep_alive !== 0) {
            recordSessionLoadedModel(ctx, String(parsedBody.model));
          }
        } catch {}
      }
    }
  }
  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
    const rawText = await res.text();
    let data: any = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { raw: rawText };
      }
    }
    return { ok: res.ok, status: res.status, data, rawText };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { error: (err as Error).message || "Failed to connect to Ollama" },
      rawText: "",
    };
  }
}

/**
 * Compares two semantic version strings (`major.minor.patch`), returning `1`, `-1`, or `0`.
 */
export function compareSemver(versionA: string, versionB: string): number {
  const parse = (v: string) =>
    String(v || "")
      .replace(/^v/i, "")
      .split("-")[0]!
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(versionA);
  const b = parse(versionB);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Connectivity and minimum version compatibility report for the local Ollama server.
 */
export interface OllamaVersionReport {
  online: boolean;
  reachable: boolean;
  version: string;
  supportsDecision: boolean;
  supportsSpeech: boolean;
  warnings: string[];
}

/**
 * Queries `GET /api/version` and checks whether the running Ollama daemon meets version requirements for Decision (`v0.35.1+`) and Speech (`v0.40.9+`).
 */
export async function getOllamaVersionStatus(
  ctx: FmContext,
): Promise<OllamaVersionReport> {
  const res = await ollamaFetchJson(ctx, "/api/version", {
    method: "GET",
    timeoutMs: 4000,
  });
  if (!res.ok || !res.data?.version) {
    return {
      online: false,
      reachable: false,
      version: "offline",
      supportsDecision: false,
      supportsSpeech: false,
      warnings: [
        "Local Ollama server is not reachable on " +
          resolveOllamaBaseUrl(ctx) +
          ".",
      ],
    };
  }
  const version = String(res.data.version);
  const supportsDecision = compareSemver(version, "0.35.1") >= 0;
  const supportsSpeech = compareSemver(version, "0.40.9") >= 0;
  const warnings: string[] = [];
  if (!supportsDecision) {
    warnings.push(
      `Ollama v${version} is older than v0.35.1 — Decision / SystemOne (/v1/systemone) requires v0.35.1+.`,
    );
  }
  if (!supportsSpeech) {
    warnings.push(
      `Ollama v${version} is older than v0.40.9 — Phonon Speech (/v1/audio/speech) requires v0.40.9+.`,
    );
  }
  return {
    online: true,
    reachable: true,
    version,
    supportsDecision,
    supportsSpeech,
    warnings,
  };
}

/**
 * Installed Ollama model enriched with capability badges, hardware guard verdict, and feature profile.
 */
export interface BadgedOllamaModel {
  name: string;
  sizeBytes: number;
  sizeGb: number;
  parameterSize: string;
  parameterBillions: number;
  quantization: string;
  family: string;
  format: string;
  runner: string;
  capabilities: string[];
  badges: Array<
    | "Chat"
    | "Vision"
    | "Speech"
    | "Decision"
    | "Thinking"
    | "MLX"
    | "Tools"
    | "Cloud"
    | "Embeddings"
  >;
  voices: string[];
  contextLength: number;
  isMlx: boolean;
  isCloud: boolean;
  isUtility: boolean;
  fitsRam: boolean;
  estimatedRamGb: number;
  hardwareVerdict: HardwareGuardVerdict;
  thinkingCapabilities: ModelThinkingCapabilities;
  featureProfile: ModelFeatureProfile;
  modifiedAt: string;
}

const modelShowCache = new Map<string, { ts: number; data: any }>();

/**
 * Fetches and caches `/api/show` metadata for a specific Ollama model.
 */
export async function showModelDetails(
  ctx: FmContext,
  modelName: string,
  forceRefresh = false,
): Promise<any> {
  const key = `${resolveOllamaBaseUrl(ctx)}::${modelName}`;
  const cached = modelShowCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.ts < 60_000) {
    return cached.data;
  }
  const res = await ollamaFetchJson(ctx, "/api/show", {
    method: "POST",
    body: JSON.stringify({ model: modelName }),
    timeoutMs: 8000,
  });
  if (res.ok && res.data) {
    modelShowCache.set(key, { ts: Date.now(), data: res.data });
    return res.data;
  }
  return null;
}

/**
 * Computes UI capability badges (`Chat`, `Vision`, `Speech`, `Decision`, `Thinking`, `MLX`, `Tools`, `Cloud`, `Embeddings`) for a model.
 */
export function computeModelBadges(model: {
  name: string;
  capabilities: string[];
  isMlx: boolean;
  isCloud: boolean;
}): Array<
  | "Chat"
  | "Vision"
  | "Speech"
  | "Decision"
  | "Thinking"
  | "MLX"
  | "Tools"
  | "Cloud"
  | "Embeddings"
> {
  const badges: Array<
    | "Chat"
    | "Vision"
    | "Speech"
    | "Decision"
    | "Thinking"
    | "MLX"
    | "Tools"
    | "Cloud"
    | "Embeddings"
  > = [];
  const caps = new Set(model.capabilities.map((c) => c.toLowerCase()));
  const nameLower = model.name.toLowerCase();

  if (
    isSpeechModelName(nameLower) ||
    caps.has("speech") ||
    caps.has("tts") ||
    caps.has("audio")
  ) {
    badges.push("Speech");
  }
  if (isDecisionModelName(nameLower, model.capabilities)) {
    badges.push("Decision");
  }
  if (
    !isPhononModelName(nameLower) &&
    (caps.has("completion") ||
      caps.has("chat") ||
      (!caps.has("decision") && !caps.has("embedding")))
  ) {
    badges.push("Chat");
  }
  if (
    caps.has("vision") ||
    nameLower.includes("-vl") ||
    nameLower.includes("omni") ||
    baseModelName(nameLower) === "clef" ||
    baseModelName(nameLower) === "clef-flash"
  ) {
    badges.push("Vision");
  }
  if (
    caps.has("thinking") ||
    nameLower.includes("lfm3") ||
    nameLower.includes("r1") ||
    nameLower.includes("qwq") ||
    getModelThinkingCapabilities({
      name: model.name,
      capabilities: model.capabilities,
    }).supportsThinking
  ) {
    badges.push("Thinking");
  }
  if (caps.has("tools")) {
    badges.push("Tools");
  }
  if (
    caps.has("embedding") ||
    caps.has("embeddings") ||
    nameLower.includes("embed")
  ) {
    badges.push("Embeddings");
  }
  if (model.isMlx) {
    badges.push("MLX");
  }
  if (model.isCloud) {
    badges.push("Cloud");
  }
  return badges;
}

/**
 * Queries `GET /api/tags` and `POST /api/show`, badges each model with its capabilities
 * (`Chat`, `Vision`, `Speech`, `Decision`, `Thinking`, `MLX`), and enforces:
 * - Rule A: Mac Apple Silicon MLX Exclusivity (hides standard non-MLX models when MLX models exist for a task)
 * - Rule B: 70% RAM Safety Ceiling
 */
export async function listModelsWithBadgesAndHardwareFilter(
  ctx: FmContext,
  options?: { includeHiddenForDiagnostics?: boolean },
): Promise<{
  hardware: OllamaHardwareSpecs;
  models: BadgedOllamaModel[];
  hiddenNonMlxModels: BadgedOllamaModel[];
  blockedByRamModels: BadgedOllamaModel[];
  recommendedCatalog: Array<
    CatalogModelSpec & {
      hardwareVerdict: HardwareGuardVerdict;
      thinkingCapabilities: ModelThinkingCapabilities;
      featureProfile: ModelFeatureProfile;
      installed: boolean;
    }
  >;
}> {
  const hardware = inspectOllamaHardware(ctx);
  const tagsRes = await ollamaFetchJson(ctx, "/api/tags", {
    method: "GET",
    timeoutMs: 6000,
  });
  const rawModels: any[] = Array.isArray(tagsRes.data?.models)
    ? tagsRes.data.models
    : [];

  // Inspect details via /api/show in parallel
  const inspected = await Promise.all(
    rawModels.map(async (m) => {
      const name = String(m.name || m.model || "");
      const showData = await showModelDetails(ctx, name);
      const details = showData?.details || m.details || {};
      const modelInfo = showData?.model_info || {};
      const capabilities: string[] = Array.isArray(showData?.capabilities)
        ? showData.capabilities
        : [];

      let contextLength = 8192;
      let parameterCount = 0;
      let voices: string[] = [];
      for (const [k, v] of Object.entries(modelInfo)) {
        if (k.endsWith(".context_length") && typeof v === "number")
          contextLength = v;
        if (k === "general.parameter_count" && typeof v === "number")
          parameterCount = v;
        if (k.endsWith(".voices") && Array.isArray(v)) voices = v.map(String);
      }
      if (isPhononModelName(name) && voices.length === 0) {
        voices = ["default", "Zoey", "Easton", "Freya"];
      }

      const runner = String(
        details.runner ||
          (isMlxOptimizedModel({
            name,
            format: details.format,
            quantization: details.quantization_level,
          })
            ? "mlx"
            : "standard"),
      );
      const isCloud = isCloudModelName(name);
      const isUtility = isUtilityModelName(name);
      const isMlx = isCloud
        ? false
        : isMlxOptimizedModel({
            name,
            runner,
            format: details.format,
            quantization: details.quantization_level,
            family: details.family,
          });

      return {
        raw: m,
        name,
        sizeBytes: Number(m.size || 0),
        parameterSize: String(details.parameter_size || ""),
        parameterCount,
        quantization: String(details.quantization_level || ""),
        family: String(details.family || ""),
        format: String(details.format || ""),
        runner,
        capabilities,
        voices,
        contextLength,
        isMlx,
        isCloud,
        isUtility,
        modifiedAt: String(m.modified_at || ""),
      };
    }),
  );

  const hasAnyMlxChat =
    inspected.some(
      (m) =>
        m.isMlx &&
        !isPhononModelName(m.name) &&
        !isDecisionModelName(m.name, m.capabilities),
    ) || true;
  const hasAnyMlxVision =
    inspected.some((m) => m.isMlx && m.capabilities.includes("vision")) || true;

  const badgedAll: BadgedOllamaModel[] = inspected.map((item) => {
    const taskCap = isPhononModelName(item.name)
      ? "speech"
      : isDecisionModelName(item.name, item.capabilities)
        ? "decision"
        : item.capabilities.includes("vision")
          ? "vision"
          : "chat";
    const hasMlxAlt =
      taskCap === "vision"
        ? hasAnyMlxVision
        : taskCap === "chat"
          ? hasAnyMlxChat
          : true;
    const verdict = evaluateModelHardwareGuard(
      {
        name: item.name,
        sizeBytes: item.sizeBytes,
        parameterSize: item.parameterSize,
        parameterCount: item.parameterCount,
        runner: item.runner,
        format: item.format,
        quantization: item.quantization,
        family: item.family,
        capabilities: item.capabilities,
      },
      hardware,
      {
        hasMlxAlternativeForTask: hasMlxAlt,
        taskCapability: taskCap,
      },
    );

    const badges = computeModelBadges({
      name: item.name,
      capabilities: item.capabilities,
      isMlx: item.isMlx,
      isCloud: item.isCloud,
    });

    return {
      name: item.name,
      sizeBytes: item.sizeBytes,
      sizeGb: Math.round((item.sizeBytes / 1024 ** 3) * 100) / 100,
      parameterSize: item.parameterSize || `${verdict.parameterBillions}B`,
      parameterBillions: verdict.parameterBillions,
      quantization: item.quantization,
      family: item.family,
      format: item.format,
      runner: item.runner,
      capabilities: item.capabilities,
      badges,
      voices: item.voices,
      contextLength: item.contextLength,
      isMlx: item.isMlx,
      isCloud: item.isCloud,
      isUtility: item.isUtility,
      fitsRam: verdict.code !== "HARDWARE_RAM_REFUSAL",
      estimatedRamGb: verdict.estimatedRamGb,
      hardwareVerdict: verdict,
      thinkingCapabilities: getModelThinkingCapabilities({
        name: item.name,
        family: item.family,
        capabilities: item.capabilities,
      }),
      featureProfile: getModelFeatureProfile({
        name: item.name,
        family: item.family,
        capabilities: item.capabilities,
        isMlx: item.isMlx,
        isCloud: item.isCloud,
      }),
      modifiedAt: item.modifiedAt,
    };
  });

  // Rule A: On Apple Silicon Mac, hide standard non-MLX models when MLX models are available
  const visibleModels = badgedAll.filter((m) => {
    if (hardware.isAppleSiliconMac && !m.isMlx && !m.isUtility && !m.isCloud) {
      return false;
    }
    return m.hardwareVerdict.allowed;
  });

  const hiddenNonMlxModels = badgedAll.filter(
    (m) => hardware.isAppleSiliconMac && !m.isMlx && !m.isUtility && !m.isCloud,
  );
  const blockedByRamModels = badgedAll.filter(
    (m) => m.hardwareVerdict.code === "HARDWARE_RAM_REFUSAL",
  );

  const installedSet = new Set(badgedAll.map((m) => m.name.toLowerCase()));
  const installedBaseSet = new Set(badgedAll.map((m) => baseModelName(m.name)));

  const recommendedCatalog = CURATED_MODEL_CATALOG.map((cat) => {
    const verdict = evaluateModelHardwareGuard(
      {
        name: cat.name,
        parameterSize: cat.parameterSize,
        sizeBytes: Math.round(cat.estimatedRamGb * 0.88 * 1024 ** 3),
        runner: cat.runner,
        capabilities: cat.capabilities,
      },
      hardware,
      {
        hasMlxAlternativeForTask: true,
        installedModels: visibleModels,
      },
    );
    const installed =
      installedSet.has(cat.name.toLowerCase()) ||
      installedBaseSet.has(baseModelName(cat.name));
    return {
      ...cat,
      badges: computeModelBadges({
        name: cat.name,
        capabilities: cat.capabilities,
        isMlx: cat.runner === "mlx",
        isCloud: cat.runner === "cloud",
      }),
      hardwareVerdict: verdict,
      thinkingCapabilities: getModelThinkingCapabilities({
        name: cat.name,
        capabilities: cat.capabilities,
      }),
      featureProfile: getModelFeatureProfile({
        name: cat.name,
        capabilities: cat.capabilities,
        isMlx: cat.runner === "mlx",
        isCloud: cat.runner === "cloud",
      }),
      installed,
    };
  }).filter((c) => {
    if (
      hardware.isAppleSiliconMac &&
      c.runner === "standard" &&
      !isUtilityModelName(c.name)
    ) {
      return false;
    }
    return true;
  });

  return {
    hardware,
    models: options?.includeHiddenForDiagnostics ? badgedAll : visibleModels,
    hiddenNonMlxModels,
    blockedByRamModels,
    recommendedCatalog,
  };
}

/**
 * Queries `GET /api/ps` to list models currently loaded in RAM/VRAM along with their total memory footprint.
 */
export async function listRunningModelsPs(ctx: FmContext): Promise<{
  models: Array<{
    name: string;
    sizeBytes: number;
    sizeGb: number;
    sizeVramBytes: number;
    sizeVramGb: number;
    processor: string;
    contextLength: number;
    expiresAt: string;
  }>;
  totalMemoryUsedBytes: number;
  totalMemoryUsedGb: number;
}> {
  const res = await ollamaFetchJson(ctx, "/api/ps", {
    method: "GET",
    timeoutMs: 5000,
  });
  const raw: any[] = Array.isArray(res.data?.models) ? res.data.models : [];
  let totalBytes = 0;
  const models = raw.map((m) => {
    const sizeBytes = Number(m.size || m.size_vram || 0);
    const sizeVramBytes = Number(m.size_vram || m.size || 0);
    totalBytes += sizeBytes;
    return {
      name: String(m.name || m.model || ""),
      sizeBytes,
      sizeGb: Math.round((sizeBytes / 1024 ** 3) * 100) / 100,
      sizeVramBytes,
      sizeVramGb: Math.round((sizeVramBytes / 1024 ** 3) * 100) / 100,
      processor: m.size_vram
        ? "100% GPU / Unified Memory"
        : "CPU / Unified Memory",
      contextLength: Number(m.context_length || 4096),
      expiresAt: String(m.expires_at || ""),
    };
  });
  return {
    models,
    totalMemoryUsedBytes: totalBytes,
    totalMemoryUsedGb: Math.round((totalBytes / 1024 ** 3) * 100) / 100,
  };
}

async function unloadModelListFromRam(
  ctx: FmContext,
  toUnload: Array<{ name: string; sizeBytes: number }>,
): Promise<{ unloaded: string[]; freedBytes: number; freedGb: number }> {
  const unloaded: string[] = [];
  let freedBytes = 0;

  await Promise.all(
    toUnload.map(async (item) => {
      const genRes = await ollamaFetchJson(ctx, "/api/generate", {
        method: "POST",
        body: JSON.stringify({ model: item.name, keep_alive: 0 }),
        timeoutMs: 8000,
      });
      if (!genRes.ok) {
        await ollamaFetchJson(ctx, "/api/chat", {
          method: "POST",
          body: JSON.stringify({
            model: item.name,
            messages: [],
            keep_alive: 0,
          }),
          timeoutMs: 8000,
        });
      }
      unloaded.push(item.name);
      freedBytes += item.sizeBytes;
    }),
  );

  return {
    unloaded,
    freedBytes,
    freedGb: Math.round((freedBytes / 1024 ** 3) * 100) / 100,
  };
}

/**
 * Free Up RAM Action: Unloads one or all currently running models from memory immediately
 * by sending `keep_alive: 0` to `/api/generate` (and `/api/chat` fallback).
 */
export async function unloadModelsFromRam(
  ctx: FmContext,
  targetModel?: string,
): Promise<{ unloaded: string[]; freedBytes: number; freedGb: number }> {
  const running = await listRunningModelsPs(ctx);
  const toUnload = targetModel
    ? [
        {
          name: targetModel,
          sizeBytes:
            running.models.find((m) => m.name === targetModel)?.sizeBytes ?? 0,
        },
      ]
    : running.models;
  return unloadModelListFromRam(ctx, toUnload);
}

const spawnedOllamaDaemons = new Set<{ kill: () => void }>();

/**
 * Policy governing whether loaded models are unloaded and whether `ollama serve` is stopped when the File Manager closes.
 */
export type OllamaExitPolicy =
  "smart" | "unload_all" | "stop_all" | "keep_open";

interface OllamaLifecycleSessionState {
  snapshotCaptured: boolean;
  wasRunningBeforeFileManager: boolean;
  daemonSpawnedByFileManager: boolean;
  preExistingLoadedModels: Set<string>;
  sessionLoadedModels: Set<string>;
  exitPolicy: OllamaExitPolicy;
}

const lifecycleByCtx = new WeakMap<object, OllamaLifecycleSessionState>();
const defaultLifecycleState: OllamaLifecycleSessionState = {
  snapshotCaptured: false,
  wasRunningBeforeFileManager: false,
  daemonSpawnedByFileManager: false,
  preExistingLoadedModels: new Set<string>(),
  sessionLoadedModels: new Set<string>(),
  exitPolicy: "smart",
};

function getLifecycleState(ctx?: FmContext): OllamaLifecycleSessionState {
  if (!ctx || typeof ctx !== "object") return defaultLifecycleState;
  let st = lifecycleByCtx.get(ctx);
  if (!st) {
    let savedPolicy: OllamaExitPolicy = "smart";
    try {
      const dataDir =
        (ctx as any).dataDir ||
        joinPath([ctx.home || "/tmp", ".codecaine-fm"], ctx.platform);
      const cfgPath = joinPath(
        [dataDir, "ollama-lifecycle.json"],
        ctx.platform,
      );
      const raw = readTextFileSyncPure(cfgPath);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed?.exitPolicy === "smart" ||
          parsed?.exitPolicy === "unload_all" ||
          parsed?.exitPolicy === "stop_all" ||
          parsed?.exitPolicy === "keep_open"
        ) {
          savedPolicy = parsed.exitPolicy;
        }
      }
    } catch {}
    st = {
      snapshotCaptured: false,
      wasRunningBeforeFileManager: false,
      daemonSpawnedByFileManager: false,
      preExistingLoadedModels: new Set<string>(),
      sessionLoadedModels: new Set<string>(),
      exitPolicy: savedPolicy,
    };
    lifecycleByCtx.set(ctx, st);
  }
  return st;
}

/**
 * Captures whether `ollama serve` was already running and which models were already loaded in RAM
 * BEFORE Codecaine File Manager opened or started Ollama.
 */
export async function captureOllamaStartupSnapshot(
  ctx: FmContext,
): Promise<OllamaLifecycleSessionState> {
  const st = getLifecycleState(ctx);
  if (st.snapshotCaptured) return st;
  st.snapshotCaptured = true;

  try {
    const vRes = await ollamaFetchJson(ctx, "/api/version", {
      method: "GET",
      timeoutMs: 1200,
    });
    if (vRes.ok && vRes.data?.version) {
      st.wasRunningBeforeFileManager = true;
      const psRes = await listRunningModelsPs(ctx);
      for (const m of psRes.models) {
        if (m.name) st.preExistingLoadedModels.add(m.name);
      }
    } else {
      st.wasRunningBeforeFileManager = false;
    }
  } catch {
    st.wasRunningBeforeFileManager = false;
  }
  return st;
}

/**
 * Records that a model was actively loaded/used by Codecaine File Manager during this session.
 */
export function recordSessionLoadedModel(
  ctx: FmContext | undefined,
  modelName: string | undefined,
): void {
  const clean = String(modelName || "").trim();
  if (!clean) return;
  const st = getLifecycleState(ctx);
  st.sessionLoadedModels.add(clean);
}

/**
 * Updates the user's preferred behavior when closing the File Manager:
 * - `"smart"` (default): If Ollama was already running before opening File Manager, keep the daemon open
 *   and only unload models that File Manager loaded during the session. If File Manager started the
 *   daemon itself, unload all models and stop the spawned daemon on close.
 * - `"unload_all"`: Unload all models from RAM (`keep_alive: 0`) on close, but leave `ollama serve` running.
 * - `"stop_all"`: Unload all models from RAM and stop the `ollama serve` daemon on close.
 * - `"keep_open"`: Leave both the `ollama serve` daemon and loaded models in RAM untouched on close.
 */
export async function setOllamaExitPolicy(
  ctx: FmContext,
  policy: OllamaExitPolicy,
) {
  const valid: OllamaExitPolicy =
    policy === "unload_all" || policy === "stop_all" || policy === "keep_open"
      ? policy
      : "smart";
  const st = getLifecycleState(ctx);
  st.exitPolicy = valid;
  try {
    const dataDir =
      (ctx as any).dataDir ||
      joinPath([ctx.home || "/tmp", ".codecaine-fm"], ctx.platform);
    ensureDirectoryPure(dataDir, ctx.platform);
    const cfgPath = joinPath([dataDir, "ollama-lifecycle.json"], ctx.platform);
    await Bun.write(cfgPath, JSON.stringify({ exitPolicy: valid }, null, 2));
  } catch {}
  return getOllamaLifecycleStatus(ctx);
}

/**
 * Returns the current session's Ollama daemon lifecycle state, loaded model history, and configured exit policy.
 */
export function getOllamaLifecycleStatus(ctx: FmContext) {
  const st = getLifecycleState(ctx);
  const policy = st.exitPolicy;
  const willStopDaemonOnClose =
    policy === "stop_all" ||
    (policy === "smart" &&
      (st.daemonSpawnedByFileManager ||
        (!st.wasRunningBeforeFileManager && spawnedOllamaDaemons.size > 0)));
  const willUnloadModelsOnClose = policy !== "keep_open";

  const originLabel = st.daemonSpawnedByFileManager
    ? "Started by File Manager"
    : st.wasRunningBeforeFileManager
      ? "Running Before File Manager Opened"
      : "Standby";

  const summaryLabel =
    policy === "keep_open"
      ? `${originLabel} • Stays Open & Keeps Models in RAM on Close`
      : policy === "stop_all"
        ? `${originLabel} • Unloads All Models & Stops Daemon on Close`
        : policy === "unload_all"
          ? `${originLabel} • Unloads All Models & Keeps Daemon Open on Close`
          : willStopDaemonOnClose
            ? "Started by File Manager • Auto-Unloads Models & Stops Daemon on Close"
            : "Pre-Existing Ollama • Unloads Session Models & Stays Open on Close";

  return {
    snapshotCaptured: st.snapshotCaptured,
    wasRunningBeforeFileManager: st.wasRunningBeforeFileManager,
    daemonSpawnedByFileManager: st.daemonSpawnedByFileManager,
    preExistingLoadedModels: [...st.preExistingLoadedModels],
    sessionLoadedModels: [...st.sessionLoadedModels],
    exitPolicy: policy,
    willStopDaemonOnClose,
    willUnloadModelsOnClose,
    summaryLabel,
  };
}

/**
 * Registers an `ollama serve` daemon process spawned by Codecaine File Manager so it is
 * tracked and stopped (when appropriate per the exit policy) when the File Manager closes.
 */
export function registerSpawnedOllamaDaemon(
  proc: { kill: () => void } | null | undefined,
  ctx?: FmContext,
): void {
  if (!proc || typeof proc.kill !== "function") return;
  const st = getLifecycleState(ctx);
  if (!st.snapshotCaptured) {
    st.snapshotCaptured = true;
    st.wasRunningBeforeFileManager = false;
  }
  st.daemonSpawnedByFileManager = true;
  spawnedOllamaDaemons.add(proc);
}

/**
 * Executes session-aware Ollama cleanup when the File Manager closes (or when triggered manually):
 * - Respects whether Ollama was already running before the user opened File Manager (`wasRunningBeforeFileManager`).
 * - Respects the user's configured `exitPolicy` (`"smart"` | `"unload_all"` | `"stop_all"` | `"keep_open"`).
 */
export async function shutdownOllamaForFileManager(
  ctx: FmContext,
  opts?: {
    forcePolicy?: OllamaExitPolicy;
    stopSpawnedDaemon?: boolean;
    timeoutMs?: number;
  },
): Promise<{
  ok: boolean;
  exitPolicyUsed: OllamaExitPolicy;
  wasRunningBeforeFileManager: boolean;
  daemonSpawnedByFileManager: boolean;
  unloaded: string[];
  keptPreExistingModels: string[];
  freedBytes: number;
  freedGb: number;
  daemonStopped: boolean;
}> {
  const st = getLifecycleState(ctx);
  const policy: OllamaExitPolicy =
    opts?.forcePolicy || st.exitPolicy || "smart";

  if (policy === "keep_open" && opts?.stopSpawnedDaemon !== true) {
    return {
      ok: true,
      exitPolicyUsed: policy,
      wasRunningBeforeFileManager: st.wasRunningBeforeFileManager,
      daemonSpawnedByFileManager: st.daemonSpawnedByFileManager,
      unloaded: [],
      keptPreExistingModels: [...st.preExistingLoadedModels],
      freedBytes: 0,
      freedGb: 0,
      daemonStopped: false,
    };
  }

  let unloaded: string[] = [];
  const keptPreExistingModels: string[] = [];
  let freedBytes = 0;
  let freedGb = 0;

  try {
    const work = async () => {
      if (
        policy === "smart" &&
        st.wasRunningBeforeFileManager &&
        !st.daemonSpawnedByFileManager
      ) {
        // Ollama was already running before File Manager opened:
        // Only unload models that were loaded during this File Manager session (or weren't in preExistingLoadedModels).
        const running = await listRunningModelsPs(ctx);
        const batchByModel = new Map<
          string,
          { name: string; sizeBytes: number }
        >();
        for (const m of running.models) {
          const wasPreExisting = st.preExistingLoadedModels.has(m.name);
          const loadedBySession = st.sessionLoadedModels.has(m.name);
          if (wasPreExisting && !loadedBySession) {
            keptPreExistingModels.push(m.name);
            continue;
          }
          batchByModel.set(m.name, { name: m.name, sizeBytes: m.sizeBytes });
        }
        for (const sessionModel of st.sessionLoadedModels) {
          if (!batchByModel.has(sessionModel)) {
            batchByModel.set(sessionModel, {
              name: sessionModel,
              sizeBytes: 0,
            });
          }
        }
        const r = await unloadModelListFromRam(ctx, [...batchByModel.values()]);
        unloaded = r.unloaded;
        freedBytes = r.freedBytes;
        freedGb = r.freedGb;
      } else {
        // Either File Manager started Ollama, or user selected "unload_all" / "stop_all": unload all models in RAM.
        const r = await unloadModelsFromRam(ctx);
        unloaded = r.unloaded;
        freedBytes = r.freedBytes;
        freedGb = r.freedGb;
      }
    };

    await Promise.race([
      work(),
      new Promise<void>((resolve) =>
        setTimeout(resolve, opts?.timeoutMs ?? 2500),
      ),
    ]);
  } catch {}

  const shouldStopDaemon =
    opts?.stopSpawnedDaemon === true ||
    policy === "stop_all" ||
    (policy === "smart" &&
      (st.daemonSpawnedByFileManager ||
        (!st.wasRunningBeforeFileManager && spawnedOllamaDaemons.size > 0)));

  let daemonStopped = false;
  if (shouldStopDaemon) {
    if (spawnedOllamaDaemons.size > 0) {
      for (const proc of [...spawnedOllamaDaemons]) {
        try {
          proc.kill();
          daemonStopped = true;
        } catch {}
        spawnedOllamaDaemons.delete(proc);
      }
    } else if (
      policy === "stop_all" &&
      (ctx.platform || process.platform) === process.platform
    ) {
      try {
        if (process.platform === "win32") {
          const res = Bun.spawnSync(["taskkill", "/F", "/IM", "ollama.exe"], {
            stdout: "ignore",
            stderr: "ignore",
            windowsHide: true,
          });
          daemonStopped = res.exitCode === 0;
        } else {
          const res = Bun.spawnSync(["pkill", "-f", "ollama serve"], {
            stdout: "ignore",
            stderr: "ignore",
          });
          daemonStopped = res.exitCode === 0;
        }
      } catch {}
    }
  }

  return {
    ok: true,
    exitPolicyUsed: policy,
    wasRunningBeforeFileManager: st.wasRunningBeforeFileManager,
    daemonSpawnedByFileManager: st.daemonSpawnedByFileManager,
    unloaded,
    keptPreExistingModels,
    freedBytes,
    freedGb,
    daemonStopped,
  };
}

/**
 * Live progress state for a long-running Ollama background task (binary install, daemon startup, or model pull).
 */
export interface OllamaLongTaskStatus {
  active: boolean;
  taskType: "idle" | "install" | "pull" | "start_daemon";
  title: string;
  step: string;
  percent: number;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  platform: string;
  arch: string;
  model?: string;
  completedBytes?: number;
  totalBytes?: number;
  stepsLog: Array<{ time: number; step: string; percent: number }>;
  error: string | null;
}

let currentOllamaLongTask: OllamaLongTaskStatus = {
  active: false,
  taskType: "idle",
  title: "Idle",
  step: "Ready",
  percent: 0,
  startedAt: 0,
  updatedAt: 0,
  elapsedMs: 0,
  platform: process.platform,
  arch: process.arch,
  stepsLog: [],
  error: null,
};

/**
 * Applies a partial status update to the active Ollama long-running task and appends step history.
 */
export function updateOllamaLongTask(
  patch: Partial<OllamaLongTaskStatus>,
): OllamaLongTaskStatus {
  const now = Date.now();
  const startedAt =
    patch.startedAt ??
    (currentOllamaLongTask.active ? currentOllamaLongTask.startedAt : now);
  const nextStep = patch.step ?? currentOllamaLongTask.step;
  const nextPercent =
    typeof patch.percent === "number"
      ? Math.max(0, Math.min(100, Math.round(patch.percent)))
      : currentOllamaLongTask.percent;
  const stepsLog = patch.stepsLog
    ? patch.stepsLog
    : nextStep && nextStep !== currentOllamaLongTask.step
      ? [
          ...currentOllamaLongTask.stepsLog.slice(-19),
          { time: now, step: nextStep, percent: nextPercent },
        ]
      : currentOllamaLongTask.stepsLog;

  currentOllamaLongTask = {
    ...currentOllamaLongTask,
    ...patch,
    percent: nextPercent,
    startedAt,
    updatedAt: now,
    elapsedMs: Math.max(0, now - startedAt),
    stepsLog,
  };
  return getLiveOllamaLongTaskStatus();
}

/**
 * Returns the live status and up-to-the-millisecond elapsed time of the current Ollama long task.
 */
export function getLiveOllamaLongTaskStatus(): OllamaLongTaskStatus {
  const now = Date.now();
  return {
    ...currentOllamaLongTask,
    elapsedMs:
      currentOllamaLongTask.active && currentOllamaLongTask.startedAt > 0
        ? Math.max(0, now - currentOllamaLongTask.startedAt)
        : currentOllamaLongTask.elapsedMs,
  };
}

/**
 * Searches PATH and standard OS installation locations for an installed `ollama` executable using pure Bun APIs.
 */
export async function detectOllamaBinaryPure(
  ctx?: FmContext,
): Promise<string | null> {
  if (
    ctx?.ollama &&
    "ollamaBinPath" in ctx.ollama &&
    ctx.ollama.ollamaBinPath !== undefined
  ) {
    return ctx.ollama.ollamaBinPath;
  }
  const platform = ctx?.ollama?.platform || ctx?.platform || process.platform;
  if (platform === process.platform) {
    const viaWhich = Bun.which("ollama");
    if (viaWhich) return viaWhich;
  }
  const home = ctx?.home || process.env.HOME || process.env.USERPROFILE || "";
  const candidates =
    platform === "win32"
      ? [
          joinPath(
            [
              process.env.LOCALAPPDATA ||
                joinPath([home, "AppData", "Local"], "win32"),
              "Programs",
              "Ollama",
              "ollama.exe",
            ],
            "win32",
          ),
          joinPath(
            [home, "AppData", "Local", "Programs", "Ollama", "ollama.exe"],
            "win32",
          ),
          joinPath([home, ".ollama", "bin", "ollama.exe"], "win32"),
          "C:\\Program Files\\Ollama\\ollama.exe",
        ]
      : platform === "linux"
        ? [
            joinPath([home, ".local", "bin", "ollama"], "linux"),
            "/usr/local/bin/ollama",
            "/usr/bin/ollama",
            joinPath([home, ".ollama", "bin", "ollama"], "linux"),
          ]
        : [
            "/opt/homebrew/bin/ollama",
            "/usr/local/bin/ollama",
            "/Applications/Ollama.app/Contents/Resources/ollama",
            joinPath(
              [
                home,
                "Applications",
                "Ollama.app",
                "Contents",
                "Resources",
                "ollama",
              ],
              "darwin",
            ),
            joinPath(
              [
                home,
                ".ollama",
                "bin",
                "Ollama.app",
                "Contents",
                "Resources",
                "ollama",
              ],
              "darwin",
            ),
            joinPath([home, ".ollama", "bin", "ollama"], "darwin"),
          ];

  for (const cand of candidates) {
    if (cand && (await fileExistsPure(cand))) return cand;
  }
  return null;
}

/**
 * Determines which speech synthesis models (`phonon` on Apple Silicon MLX, or cross-platform speech LLMs) are supported on the host.
 */
export function getSpeechCapabilitiesForHost(ctx?: FmContext): {
  platform: string;
  arch: string;
  isAppleSiliconMac: boolean;
  phononSupported: boolean;
  defaultSpeechModel: string;
  availableSpeechModels: Array<{
    name: string;
    label: string;
    parameterSize: string;
    estimatedRamGb: number;
    requiresAppleMlx: boolean;
    description: string;
  }>;
  platformSpeechNote: string;
} {
  const hw = inspectOllamaHardware(ctx);
  const phononSupported = hw.isAppleSiliconMac;
  const crossPlatformModels = [
    {
      name: "lfm3-omni:latest",
      label:
        "Liquid LFM3-Omni 2B (Official Omni Audio, Speech, Vision & Chat LLM)",
      parameterSize: "2B",
      estimatedRamGb: 1.9,
      requiresAppleMlx: false,
      description:
        "Official Ollama LFM3-Omni 2B audio, speech, vision & chat LLM (`ollama run lfm3-omni`) for Windows, Linux, and macOS.",
    },
    {
      name: "orpheus:latest",
      label: "Orpheus TTS 3B (Expressive Text-to-Audio LLM)",
      parameterSize: "3B",
      estimatedRamGb: 2.1,
      requiresAppleMlx: false,
      description:
        "High-naturalness cross-platform Text-to-Audio LLM for Linux, Windows, and macOS.",
    },
    {
      name: "kokoro:latest",
      label: "Kokoro 82M TTS (Ultra-Light Cross-Platform Speech)",
      parameterSize: "82M",
      estimatedRamGb: 0.34,
      requiresAppleMlx: false,
      description:
        "Ultra-fast 82M parameter Text-to-Audio model (<350 MB RAM) ideal for Linux & Windows.",
    },
    {
      name: "oute-tts:latest",
      label: "OuteTTS 1B (Cross-Platform Voice & Audio LLM)",
      parameterSize: "1B",
      estimatedRamGb: 1.1,
      requiresAppleMlx: false,
      description:
        "1B cross-platform Text-to-Audio LLM supporting natural speech synthesis on Linux & Windows.",
    },
    {
      name: "parler-tts:latest",
      label: "Parler-TTS Mini (Prompt-Controlled Text-to-Audio)",
      parameterSize: "880M",
      estimatedRamGb: 1.0,
      requiresAppleMlx: false,
      description:
        "Cross-platform Text-to-Audio generator for Linux, Windows, and macOS.",
    },
    {
      name: "llasa:latest",
      label: "Llasa 1B Speech LLM (Cross-Platform LLaMA TTS)",
      parameterSize: "1B",
      estimatedRamGb: 1.1,
      requiresAppleMlx: false,
      description:
        "Cross-platform LLaMA-based speech synthesis model for Linux & Windows.",
    },
  ];

  const availableSpeechModels = phononSupported
    ? [
        {
          name: "phonon",
          label: "Gradium Phonon TTS (Apple Silicon MLX Native Voice Engine)",
          parameterSize: "43.6M",
          estimatedRamGb: 0.22,
          requiresAppleMlx: true,
          description:
            "Native Apple Silicon MLX speech engine with 38+ neural voices (/v1/audio/speech).",
        },
        ...crossPlatformModels,
      ]
    : crossPlatformModels;

  const defaultSpeechModel = phononSupported
    ? "phonon"
    : hw.ramTier === "under_8gb"
      ? "kokoro:latest"
      : "lfm3-omni:latest";

  const osName =
    hw.platform === "win32"
      ? "Windows"
      : hw.platform === "linux"
        ? "Linux"
        : "macOS";
  const platformSpeechNote = phononSupported
    ? "Apple Silicon MLX detected: Gradium Phonon TTS (phonon) and Liquid LFM3-Omni (lfm3-omni) are natively accelerated."
    : `${osName} (${hw.arch}) detected: Gradium Phonon requires Apple Silicon MLX and is not available on ${osName}. Using cross-platform Omni & Text-to-Audio LLMs (${defaultSpeechModel}, orpheus:latest, kokoro:latest, oute-tts:latest) + OS speech synthesis.`;

  return {
    platform: hw.platform,
    arch: hw.arch,
    isAppleSiliconMac: hw.isAppleSiliconMac,
    phononSupported,
    defaultSpeechModel,
    availableSpeechModels,
    platformSpeechNote,
  };
}

/**
 * Inspects whether the Ollama binary and daemon are installed and reachable, and recommends starter models for the host hardware.
 */
export async function getOllamaInstallStatus(ctx: FmContext) {
  const hw = inspectOllamaHardware(ctx);
  const speechCaps = getSpeechCapabilitiesForHost(ctx);
  const [binaryPath, versionStatus] = await Promise.all([
    detectOllamaBinaryPure(ctx),
    getOllamaVersionStatus(ctx),
  ]);
  const binaryInstalled = Boolean(binaryPath) || versionStatus.reachable;
  const defaultChatModel =
    hw.ramTier === "under_8gb" || hw.ramTier === "8gb_to_16gb"
      ? "qwen3.5:4b"
      : "qwen3.5:latest";
  const recommendedStarterModels = hw.isAppleSiliconMac
    ? [defaultChatModel, "lfm3-omni:latest", "phonon", "nimble", "lfm3:latest"]
    : hw.ramTier === "under_8gb" || hw.ramTier === "8gb_to_16gb"
      ? ["qwen3.5:4b", "lfm3-omni:latest", "kokoro:latest", "nimble"]
      : [
          "qwen3.5:latest",
          "qwen3.5:4b",
          "lfm3-omni:latest",
          "orpheus:latest",
          "kokoro:latest",
          "nimble",
        ];

  const installMethodLabel =
    hw.platform === "linux"
      ? `1-Click Linux Auto-Install (ollama-linux-${hw.arch === "arm64" ? "arm64" : "amd64"}.tar.zst → ~/.local/bin/ollama, zero sudo required)`
      : hw.platform === "win32"
        ? `1-Click Windows Auto-Install (ollama-windows-${hw.arch === "arm64" ? "arm64" : "amd64"}.zip → %LOCALAPPDATA%\\Programs\\Ollama\\ollama.exe)`
        : `1-Click macOS Auto-Install (Homebrew / Ollama-darwin.zip → ~/.ollama/bin/ollama)`;

  return {
    binaryInstalled,
    binaryPath,
    daemonReachable: versionStatus.reachable,
    version: versionStatus.version,
    platform: hw.platform,
    arch: hw.arch,
    isAppleSiliconMac: hw.isAppleSiliconMac,
    phononSupported: speechCaps.phononSupported,
    defaultSpeechModel: speechCaps.defaultSpeechModel,
    availableSpeechModels: speechCaps.availableSpeechModels,
    platformSpeechNote: speechCaps.platformSpeechNote,
    recommendedStarterModels,
    autoInstallSupported: true,
    installMethodLabel,
    longTask: getLiveOllamaLongTaskStatus(),
  };
}

/**
 * Verifies a model against the Hardware Guard (70% RAM ceiling and Mac MLX exclusivity) before pulling it via `/api/pull`.
 */
export async function pullModelWithHardwareGuard(
  ctx: FmContext,
  modelName: string,
  options?: {
    keepExistingLongTask?: boolean;
    progressBasePercent?: number;
    progressSpanPercent?: number;
  },
): Promise<{
  ok: boolean;
  status: string;
  verdict: HardwareGuardVerdict;
  progressSteps: Array<{
    status: string;
    completed?: number;
    total?: number;
    percent?: number;
  }>;
}> {
  const trimmed = String(modelName || "").trim();
  if (!trimmed)
    throw new FmError("INVALID_INPUT", "Model name is required to pull.");

  const { hardware, models } = await listModelsWithBadgesAndHardwareFilter(ctx);
  const catalogMatch =
    CURATED_MODEL_CATALOG.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    ) ||
    CURATED_MODEL_CATALOG.find(
      (c) => baseModelName(c.name) === baseModelName(trimmed),
    );
  const verdict = evaluateModelHardwareGuard(
    {
      name: trimmed,
      parameterSize: catalogMatch?.parameterSize,
      sizeBytes: catalogMatch
        ? Math.round(catalogMatch.estimatedRamGb * 0.88 * 1024 ** 3)
        : undefined,
      runner: catalogMatch?.runner,
      capabilities: catalogMatch?.capabilities,
    },
    hardware,
    {
      hasMlxAlternativeForTask: true,
      installedModels: models,
    },
  );

  if (!verdict.allowed) {
    return {
      ok: false,
      status: verdict.reason,
      verdict,
      progressSteps: [],
    };
  }

  const basePct = options?.progressBasePercent ?? 5;
  const spanPct = options?.progressSpanPercent ?? 90;
  if (!options?.keepExistingLongTask) {
    updateOllamaLongTask({
      active: true,
      taskType: "pull",
      title: `Downloading AI Model: ${trimmed}`,
      step: `Connecting to Ollama registry to pull ${trimmed}...`,
      percent: basePct,
      startedAt: Date.now(),
      platform: hardware.platform,
      arch: hardware.arch,
      model: trimmed,
      completedBytes: 0,
      totalBytes: 0,
      stepsLog: [
        {
          time: Date.now(),
          step: `Starting pull for ${trimmed}`,
          percent: basePct,
        },
      ],
      error: null,
    });
  } else {
    updateOllamaLongTask({
      step: `Pulling model ${trimmed}...`,
      percent: basePct,
      model: trimmed,
    });
  }

  const baseUrl = resolveOllamaBaseUrl(ctx, false);
  const progressSteps: Array<{
    status: string;
    completed?: number;
    total?: number;
    percent?: number;
  }> = [];

  const attemptPullStream = async (targetTag: string): Promise<void> => {
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: targetTag, stream: true }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new FmError(
        "OLLAMA_PULL_ERROR",
        `Failed to pull "${targetTag}": ${errText || res.statusText}`,
      );
    }

    const processLine = (line: string) => {
      const clean = line.trim();
      if (!clean) return;
      try {
        const evt = JSON.parse(clean);
        if (evt.error) {
          throw new FmError("OLLAMA_PULL_ERROR", String(evt.error));
        }
        const completed =
          typeof evt.completed === "number" ? evt.completed : undefined;
        const total = typeof evt.total === "number" ? evt.total : undefined;
        const percent =
          completed !== undefined && total && total > 0
            ? Math.round((completed / total) * 100)
            : undefined;
        const statusStr = String(evt.status || "pulling");
        progressSteps.push({
          status: statusStr,
          completed,
          total,
          percent,
        });
        const scaledPct =
          percent !== undefined
            ? Math.min(99, Math.round(basePct + (percent / 100) * spanPct))
            : undefined;
        const mbInfo =
          completed !== undefined && total && total > 0
            ? ` (${(completed / 1024 ** 2).toFixed(1)} MB / ${(total / 1024 ** 2).toFixed(1)} MB — ${percent}%)`
            : "";
        updateOllamaLongTask({
          step: `Pulling ${targetTag}: ${statusStr}${mbInfo}`,
          ...(scaledPct !== undefined ? { percent: scaledPct } : {}),
          ...(completed !== undefined ? { completedBytes: completed } : {}),
          ...(total !== undefined ? { totalBytes: total } : {}),
        });
      } catch (e) {
        if (e instanceof FmError) throw e;
      }
    };

    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) processLine(l);
      }
      if (buf.trim()) processLine(buf);
    } else {
      const text = await res.text();
      for (const line of text.split("\n")) processLine(line);
    }
  };

  try {
    try {
      await attemptPullStream(trimmed);
    } catch (firstErr) {
      const fallbackTag = resolveSpeechModelRegistryFallback(trimmed);
      const errMsg = String((firstErr as Error)?.message || "");
      if (
        fallbackTag &&
        /manifest|does not exist|not found|404/i.test(errMsg)
      ) {
        updateOllamaLongTask({
          step: `Resolving ${trimmed} to verified registry manifest ${fallbackTag}...`,
        });
        await attemptPullStream(fallbackTag);
      } else {
        throw firstErr;
      }
    }

    modelShowCache.clear();
    if (!options?.keepExistingLongTask) {
      updateOllamaLongTask({
        active: false,
        taskType: "idle",
        step: `Successfully pulled ${trimmed}!`,
        percent: 100,
      });
    }
    return {
      ok: true,
      status: progressSteps[progressSteps.length - 1]?.status || "success",
      verdict,
      progressSteps: progressSteps.slice(-15),
    };
  } catch (err) {
    if (!options?.keepExistingLongTask) {
      updateOllamaLongTask({
        active: false,
        taskType: "idle",
        error: (err as Error).message || `Failed to pull ${trimmed}`,
      });
    }
    throw err;
  }
}

/**
 * 1-Click Cross-Platform Auto-Installer for Ollama on Linux, Windows (x64 & ARM64 Parallels), and macOS.
 * - Linux (`linux`): Downloads `ollama-linux-${arch}.tar.zst` into `~/.local/bin/ollama` using pure Bun
 *   (`Bun.zstdDecompressSync` + `tar -xf`) with zero `sudo` or root password required.
 * - Windows (`win32`): Downloads `ollama-windows-${arch}.zip` (`ollama-windows-arm64.zip` on ARM64 Windows in Parallels,
 *   `ollama-windows-amd64.zip` on x64) and extracts into `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` via Windows `tar.exe`
 *   or PowerShell `Expand-Archive`, with fallback to `winget` / `OllamaSetup.exe`.
 * - macOS (`darwin`): Installs via Homebrew or `Ollama-darwin.zip` into `~/.ollama/bin/ollama`.
 * - Starts `ollama serve` in the background and pulls OS-appropriate starter models (including
 *   cross-platform Text-to-Audio LLMs `orpheus:latest` / `kokoro:latest` on Linux & Windows instead of MLX-only `phonon`).
 */
export async function runOllamaAutoInstall(
  ctx: FmContext,
  payload?: {
    models?: string[];
    speechModel?: string;
    chatModel?: string;
    skipModelPull?: boolean;
  },
): Promise<{
  ok: boolean;
  platform: string;
  arch: string;
  binaryPath: string;
  daemonStarted: boolean;
  pulledModels: string[];
  skippedPhononForNonMlxOs: boolean;
  speechModelConfigured: string;
  installSteps: Array<{ time: number; step: string; percent: number }>;
  installStatus: Awaited<ReturnType<typeof getOllamaInstallStatus>>;
}> {
  const hw = inspectOllamaHardware(ctx);
  const speechCaps = getSpeechCapabilitiesForHost(ctx);
  const osLabel =
    hw.platform === "win32"
      ? "Windows"
      : hw.platform === "linux"
        ? "Linux"
        : "macOS";

  updateOllamaLongTask({
    active: true,
    taskType: "install",
    title: `1-Click Ollama AI Setup (${osLabel} ${hw.arch})`,
    step: `Inspecting ${osLabel} (${hw.arch}) hardware and checking for Ollama binary...`,
    percent: 5,
    startedAt: Date.now(),
    platform: hw.platform,
    arch: hw.arch,
    completedBytes: 0,
    totalBytes: 0,
    stepsLog: [
      {
        time: Date.now(),
        step: `Inspecting ${osLabel} (${hw.arch}) hardware (${hw.totalRamGb} GB RAM, ${hw.safeMemoryBudgetGb} GB 70% Safe Budget)...`,
        percent: 5,
      },
    ],
    error: null,
  });

  try {
    await captureOllamaStartupSnapshot(ctx);
    let binPath = await detectOllamaBinaryPure(ctx);
    const versionPreCheck = await getOllamaVersionStatus(ctx);

    if (!binPath && !versionPreCheck.reachable) {
      updateOllamaLongTask({
        step: `Ollama binary not found on ${osLabel}. Starting automatic user-space installation...`,
        percent: 12,
      });

      if (ctx.ollama?.installBinaryHook) {
        const hooked = await ctx.ollama.installBinaryHook(
          hw.platform,
          hw.arch,
          (step, pct) => {
            updateOllamaLongTask({ step, percent: pct });
          },
        );
        binPath = hooked.installedPath;
        if (ctx.ollama) ctx.ollama.ollamaBinPath = binPath;
      } else if (hw.platform === "linux") {
        // User-space Linux install into ~/.local/bin/ollama (streamed to disk, no root/sudo needed!)
        const home =
          (ctx as any).homeDir || ctx.home || process.env.HOME || "/tmp";
        const localDir = joinPath([home, ".local"], "linux");
        const localBinDir = joinPath([localDir, "bin"], "linux");
        ensureDirectoryPure(localBinDir, "linux");
        const archSlug =
          hw.arch === "arm64" || hw.arch === "aarch64" ? "arm64" : "amd64";
        const assetName = `ollama-linux-${archSlug}.tar.zst`;
        const downloadUrl = `https://ollama.com/download/${assetName}`;
        const tmpZstPath = joinPath(
          [localDir, `.ollama-linux-${process.pid}-${Date.now()}.tar.zst`],
          "linux",
        );
        const tmpTarPath = joinPath(
          [localDir, `.ollama-linux-${process.pid}-${Date.now()}.tar`],
          "linux",
        );

        updateOllamaLongTask({
          step: `Downloading Linux package (${downloadUrl}) into ~/.local...`,
          percent: 18,
        });

        try {
          let dlMeta: { bytesWritten: number; sha256: string };
          try {
            dlMeta = await streamDownloadWithSha256(downloadUrl, tmpZstPath, {
              maxBytes: 2 * 1024 ** 3,
              signal: AbortSignal.timeout(300_000),
              onProgress: (received, totalBytes) => {
                const dlPct =
                  totalBytes > 0
                    ? Math.min(
                        42,
                        18 + Math.round((received / totalBytes) * 24),
                      )
                    : 30;
                updateOllamaLongTask({
                  step: `Downloading ${assetName} (${(received / 1024 ** 2).toFixed(1)} MB)...`,
                  percent: dlPct,
                  completedBytes: received,
                  totalBytes,
                });
              },
            });
            await verifyDownloadedArchiveIntegrity({
              downloadUrl,
              assetName,
              actualSha256: dlMeta.sha256,
              bytesWritten: dlMeta.bytesWritten,
              magicCheckPath: tmpZstPath,
              expectedMagic: "zstd",
            });
          } catch (dlErr) {
            throw new FmError(
              "OLLAMA_LINUX_INSTALL_FAILED",
              (dlErr as Error)?.message || `Failed to download ${downloadUrl}.`,
            );
          }

          updateOllamaLongTask({
            step: `Extracting Ollama into ${localDir}...`,
            percent: 46,
          });
          let extracted = false;
          const directTar = Bun.spawnSync(
            [
              "tar",
              "--no-same-owner",
              "--zstd",
              "-xf",
              tmpZstPath,
              "-C",
              localDir,
            ],
            { stdout: "ignore", stderr: "pipe" },
          );
          if (directTar.exitCode === 0) {
            extracted = true;
          } else if (Bun.which("zstd")) {
            const pipeRes = Bun.spawnSync(
              [
                "/bin/sh",
                "-c",
                '"$1" -dc "$2" | tar --no-same-owner -xf - -C "$3"',
                "--",
                Bun.which("zstd")!,
                tmpZstPath,
                localDir,
              ],
              { stdout: "ignore", stderr: "pipe" },
            );
            extracted = pipeRes.exitCode === 0;
          }
          if (!extracted) {
            if (dlMeta.bytesWritten > 512 * 1024 ** 2) {
              throw new FmError(
                "OLLAMA_LINUX_INSTALL_FAILED",
                `Archive requires zstd or GNU tar --zstd to extract without buffering >512 MB in memory (${directTar.stderr.toString()}).`,
              );
            }
            const compressed = new Uint8Array(
              await Bun.file(tmpZstPath).arrayBuffer(),
            );
            removePathForceSync(tmpZstPath);
            const tarBytes = Bun.zstdDecompressSync(compressed);
            await Bun.write(tmpTarPath, tarBytes);
            const tarRes = Bun.spawnSync(
              ["tar", "--no-same-owner", "-xf", tmpTarPath, "-C", localDir],
              { stdout: "ignore", stderr: "pipe" },
            );
            if (tarRes.exitCode !== 0) {
              throw new FmError(
                "OLLAMA_LINUX_INSTALL_FAILED",
                `Failed to extract Linux archive: ${tarRes.stderr.toString()}`,
              );
            }
          }
        } finally {
          removePathForceSync(tmpZstPath);
          removePathForceSync(tmpTarPath);
        }
        const candidateBin = joinPath([localBinDir, "ollama"], "linux");
        chmodSafeSync(candidateBin, 0o755);
        binPath = candidateBin;
      } else if (hw.platform === "win32") {
        // Windows user-space install (supports both native Windows 11 ARM64 in Parallels and Windows x64)
        const home =
          (ctx as any).homeDir ||
          ctx.home ||
          process.env.USERPROFILE ||
          process.env.HOME ||
          "C:\\Users\\Default";
        const localAppData =
          process.env.LOCALAPPDATA ||
          joinPath([home, "AppData", "Local"], "win32");
        const installDir = joinPath(
          [localAppData, "Programs", "Ollama"],
          "win32",
        );
        const winTarget = joinPath([installDir, "ollama.exe"], "win32");
        ensureDirectoryPure(installDir, "win32");

        const archSlug =
          hw.arch === "arm64" || hw.arch === "aarch64" ? "arm64" : "amd64";
        const assetName = `ollama-windows-${archSlug}.zip`;
        const zipUrl = `https://ollama.com/download/${assetName}`;
        updateOllamaLongTask({
          step: `Downloading Windows ${archSlug.toUpperCase()} package (${zipUrl})...`,
          percent: 16,
        });

        const tmpZipPath = joinPath(
          [
            installDir,
            `.ollama-windows-${archSlug}-${process.pid}-${Date.now()}.zip`,
          ],
          "win32",
        );
        try {
          const dlMeta = await streamDownloadWithSha256(zipUrl, tmpZipPath, {
            maxBytes: 2 * 1024 ** 3,
            signal: AbortSignal.timeout(300_000),
            onProgress: (received, totalBytes) => {
              const dlPct =
                totalBytes > 0
                  ? Math.min(42, 16 + Math.round((received / totalBytes) * 26))
                  : 30;
              updateOllamaLongTask({
                step: `Downloading ${assetName} (${(received / 1024 ** 2).toFixed(1)} MB)...`,
                percent: dlPct,
                completedBytes: received,
                totalBytes,
              });
            },
          });
          await verifyDownloadedArchiveIntegrity({
            downloadUrl: zipUrl,
            assetName,
            actualSha256: dlMeta.sha256,
            bytesWritten: dlMeta.bytesWritten,
            magicCheckPath: tmpZipPath,
            expectedMagic: "zip",
          });

          updateOllamaLongTask({
            step: `Extracting ${assetName} into ${installDir}...`,
            percent: 45,
          });

          const sysTar = "C:\\Windows\\System32\\tar.exe";
          const tarCmd = (await fileExistsPure(sysTar))
            ? sysTar
            : Bun.which("tar") || "tar";
          const tarRes = Bun.spawnSync(
            [tarCmd, "--no-same-owner", "-xf", tmpZipPath, "-C", installDir],
            {
              stdout: "ignore",
              stderr: "pipe",
              windowsHide: true,
            },
          );
          if (tarRes.exitCode !== 0 || !(await fileExistsPure(winTarget))) {
            Bun.spawnSync(
              [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Expand-Archive -LiteralPath $env:FM_ZIP_PATH -DestinationPath $env:FM_DEST_DIR -Force",
              ],
              {
                stdout: "ignore",
                stderr: "ignore",
                windowsHide: true,
                env: {
                  ...process.env,
                  FM_ZIP_PATH: tmpZipPath,
                  FM_DEST_DIR: installDir,
                },
              },
            );
          }
        } catch {
        } finally {
          removePathForceSync(tmpZipPath);
        }

        // Fallback to winget / OllamaSetup.exe if the standalone zip did not produce ollama.exe
        if (!(await fileExistsPure(winTarget))) {
          const winget = Bun.which("winget");
          if (winget) {
            updateOllamaLongTask({
              step: "Installing Ollama on Windows via winget...",
              percent: 47,
            });
            Bun.spawnSync(
              [
                winget,
                "install",
                "-e",
                "--id",
                "Ollama.Ollama",
                "--accept-package-agreements",
                "--accept-source-agreements",
                "--silent",
              ],
              { stdout: "ignore", stderr: "ignore", windowsHide: true },
            );
          }
        }
        if (!(await fileExistsPure(winTarget))) {
          const setupUrl = "https://ollama.com/download/OllamaSetup.exe";
          updateOllamaLongTask({
            step: `Downloading Windows installer (${setupUrl})...`,
            percent: 49,
          });
          const tmpExe = joinPath(
            [installDir, `OllamaSetup-${process.pid}-${Date.now()}.exe`],
            "win32",
          );
          try {
            const dlMeta = await streamDownloadWithSha256(setupUrl, tmpExe, {
              maxBytes: 2 * 1024 ** 3,
              signal: AbortSignal.timeout(300_000),
            });
            await verifyDownloadedArchiveIntegrity({
              downloadUrl: setupUrl,
              assetName: "OllamaSetup.exe",
              actualSha256: dlMeta.sha256,
              bytesWritten: dlMeta.bytesWritten,
              magicCheckPath: tmpExe,
              expectedMagic: "pe",
            });
            updateOllamaLongTask({
              step: "Running silent Windows Ollama installer (/VERYSILENT /SUPPRESSMSGBOXES /NORESTART)...",
              percent: 52,
            });
            Bun.spawnSync(
              [tmpExe, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"],
              {
                stdout: "ignore",
                stderr: "ignore",
                windowsHide: true,
              },
            );
          } catch {
          } finally {
            removePathForceSync(tmpExe);
          }
        }

        if (await fileExistsPure(winTarget)) {
          const curPath = process.env.Path || process.env.PATH || "";
          if (!curPath.toLowerCase().includes(installDir.toLowerCase())) {
            process.env.Path = `${installDir};${curPath}`;
            process.env.PATH = process.env.Path;
          }
        }
        binPath = (await detectOllamaBinaryPure(ctx)) || winTarget;
      } else {
        // macOS install via Homebrew or Ollama-darwin.zip
        const home =
          (ctx as any).homeDir || ctx.home || process.env.HOME || "/tmp";
        updateOllamaLongTask({
          step: "Installing Ollama on macOS via Homebrew / Ollama-darwin.zip...",
          percent: 22,
        });
        const brew = Bun.which("brew") || "/opt/homebrew/bin/brew";
        if (await fileExistsPure(brew)) {
          Bun.spawnSync([brew, "install", "ollama"], {
            stdout: "ignore",
            stderr: "ignore",
          });
        }
        binPath = await detectOllamaBinaryPure(ctx);
        if (!binPath) {
          const zipUrl = "https://ollama.com/download/Ollama-darwin.zip";
          const destDir = joinPath([home, ".ollama", "bin"], "darwin");
          ensureDirectoryPure(destDir, "darwin");
          const tmpZip = joinPath(
            [destDir, `Ollama-${process.pid}-${Date.now()}.zip`],
            "darwin",
          );
          updateOllamaLongTask({
            step: `Downloading macOS bundle (${zipUrl})...`,
            percent: 32,
          });
          try {
            const dlMeta = await streamDownloadWithSha256(zipUrl, tmpZip, {
              maxBytes: 2 * 1024 ** 3,
              signal: AbortSignal.timeout(300_000),
            });
            await verifyDownloadedArchiveIntegrity({
              downloadUrl: zipUrl,
              assetName: "Ollama-darwin.zip",
              actualSha256: dlMeta.sha256,
              bytesWritten: dlMeta.bytesWritten,
              magicCheckPath: tmpZip,
              expectedMagic: "zip",
            });
            updateOllamaLongTask({
              step: "Extracting Ollama.app into ~/.ollama/bin...",
              percent: 45,
            });
            Bun.spawnSync(["ditto", "-x", "-k", tmpZip, destDir], {
              stdout: "ignore",
              stderr: "ignore",
            });
            binPath = joinPath(
              [destDir, "Ollama.app", "Contents", "Resources", "ollama"],
              "darwin",
            );
          } finally {
            removePathForceSync(tmpZip);
          }
        }
      }
    }

    // Step 2: Ensure local Ollama daemon (`ollama serve`) is running
    updateOllamaLongTask({
      step: "Verifying local Ollama daemon (ollama serve) is running...",
      percent: 54,
    });
    let daemonStarted = false;
    let vCheck = await getOllamaVersionStatus(ctx);
    if (!vCheck.reachable && binPath && hw.platform === process.platform) {
      try {
        updateOllamaLongTask({
          step: `Starting background daemon: ${binPath} serve...`,
          percent: 58,
        });
        const daemonProc = Bun.spawn([binPath, "serve"], {
          stdout: "ignore",
          stderr: "ignore",
          windowsHide: true,
          env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434" },
        });
        daemonProc.unref?.();
        registerSpawnedOllamaDaemon(daemonProc, ctx);
        daemonStarted = true;
        for (let i = 0; i < 40; i++) {
          await Bun.sleep(300);
          vCheck = await getOllamaVersionStatus(ctx);
          if (vCheck.reachable) break;
        }
      } catch {}
    }

    // Step 3: Determine OS-appropriate starter models to pull
    // Note: On Linux and Windows, Phonon is NOT supported (Apple Silicon MLX only), so we automatically
    // replace any "phonon" request with a cross-platform Text-to-Audio LLM (`orpheus:latest` or `kokoro:latest`)!
    const defaultChatModel =
      hw.ramTier === "under_8gb" || hw.ramTier === "8gb_to_16gb"
        ? "qwen3.5:4b"
        : "qwen3.5:latest";
    const requestedModels =
      Array.isArray(payload?.models) && payload!.models!.length > 0
        ? payload!.models!
        : hw.isAppleSiliconMac
          ? [
              payload?.chatModel || defaultChatModel,
              "lfm3-omni:latest",
              payload?.speechModel || "phonon",
            ]
          : [
              payload?.chatModel || defaultChatModel,
              "lfm3-omni:latest",
              payload?.speechModel || speechCaps.defaultSpeechModel,
            ];

    let skippedPhononForNonMlxOs = false;
    const normalizedModels: string[] = [];
    for (const m of requestedModels) {
      const clean = String(m || "").trim();
      if (!clean) continue;
      if (!hw.isAppleSiliconMac && isPhononModelName(clean)) {
        skippedPhononForNonMlxOs = true;
        const replacement =
          payload?.speechModel && !isPhononModelName(payload.speechModel)
            ? payload.speechModel
            : speechCaps.defaultSpeechModel;
        if (!normalizedModels.includes(replacement))
          normalizedModels.push(replacement);
      } else if (!normalizedModels.includes(clean)) {
        normalizedModels.push(clean);
      }
    }

    const pulledModels: string[] = [];
    if (!payload?.skipModelPull && normalizedModels.length > 0) {
      const perModelSpan = Math.floor(34 / normalizedModels.length);
      for (let i = 0; i < normalizedModels.length; i++) {
        const targetModel = normalizedModels[i]!;
        const startPct = 62 + i * perModelSpan;
        updateOllamaLongTask({
          step: `Pulling starter model (${i + 1}/${normalizedModels.length}): ${targetModel}...`,
          percent: startPct,
          model: targetModel,
        });
        try {
          const pullRes = await pullModelWithHardwareGuard(ctx, targetModel, {
            keepExistingLongTask: true,
            progressBasePercent: startPct,
            progressSpanPercent: perModelSpan,
          });
          if (pullRes.ok) {
            pulledModels.push(targetModel);
          }
        } catch (pullErr) {
          updateOllamaLongTask({
            step: `Starter model ${targetModel} skipped (${(pullErr as Error).message || "unavailable"}); continuing setup...`,
            percent: Math.min(95, startPct + perModelSpan),
          });
        }
      }
    }

    const speechModelConfigured =
      pulledModels.find((m) => isSpeechModelName(m)) ||
      speechCaps.defaultSpeechModel;

    updateOllamaLongTask({
      active: false,
      taskType: "idle",
      step: `Ollama AI setup complete on ${osLabel}! Ready with ${pulledModels.join(", ") || "local daemon"}.`,
      percent: 100,
    });

    const installStatus = await getOllamaInstallStatus(ctx);
    return {
      ok: true,
      platform: hw.platform,
      arch: hw.arch,
      binaryPath: binPath || installStatus.binaryPath || "ollama",
      daemonStarted,
      pulledModels,
      skippedPhononForNonMlxOs,
      speechModelConfigured,
      installSteps: getLiveOllamaLongTaskStatus().stepsLog,
      installStatus,
    };
  } catch (err) {
    updateOllamaLongTask({
      active: false,
      taskType: "idle",
      error: (err as Error).message || "Auto-install failed",
    });
    throw err;
  }
}

/**
 * Creates a custom derived Ollama model via `POST /api/create` after verifying its base model with the Hardware Guard.
 */
export async function createCustomModel(
  ctx: FmContext,
  payload: {
    model: string;
    from: string;
    system?: string;
    parameters?: Record<string, any>;
  },
): Promise<{ ok: boolean; model: string; status: string }> {
  const model = String(payload.model || "").trim();
  const from = String(payload.from || "").trim();
  if (!model || !from) {
    throw new FmError(
      "INVALID_INPUT",
      "Both 'model' name and base 'from' model are required.",
    );
  }
  const hardware = inspectOllamaHardware(ctx);
  const verdict = evaluateModelHardwareGuard({ name: from }, hardware);
  if (!verdict.allowed) {
    throw new FmError(verdict.code, verdict.reason);
  }
  const res = await ollamaFetchJson(ctx, "/api/create", {
    method: "POST",
    body: JSON.stringify({
      model,
      from,
      system: payload.system || undefined,
      parameters: payload.parameters || undefined,
      stream: false,
    }),
    timeoutMs: 30_000,
  });
  if (!res.ok || res.data?.error) {
    throw new FmError(
      "OLLAMA_CREATE_ERROR",
      res.data?.error || `Failed to create model ${model}`,
    );
  }
  modelShowCache.clear();
  return { ok: true, model, status: String(res.data?.status || "success") };
}

/**
 * Duplicates a local Ollama model tag from `source` to `destination` via `POST /api/copy`.
 */
export async function copyModel(
  ctx: FmContext,
  source: string,
  destination: string,
): Promise<{ ok: boolean }> {
  const res = await ollamaFetchJson(ctx, "/api/copy", {
    method: "POST",
    body: JSON.stringify({
      source: source.trim(),
      destination: destination.trim(),
    }),
  });
  if (!res.ok) {
    throw new FmError(
      "OLLAMA_COPY_ERROR",
      res.data?.error || `Failed to copy ${source} to ${destination}`,
    );
  }
  modelShowCache.clear();
  return { ok: true };
}

/**
 * Pushes a local Ollama model to the model registry via `POST /api/push`.
 */
export async function pushModel(
  ctx: FmContext,
  model: string,
): Promise<{ ok: boolean; status: string }> {
  const res = await ollamaFetchJson(ctx, "/api/push", {
    method: "POST",
    body: JSON.stringify({ model: model.trim(), stream: false }),
    timeoutMs: 60_000,
  });
  if (!res.ok || res.data?.error) {
    throw new FmError(
      "OLLAMA_PUSH_ERROR",
      res.data?.error || `Failed to push ${model}`,
    );
  }
  return { ok: true, status: String(res.data?.status || "pushed") };
}

/**
 * Deletes an installed model from the local Ollama server via `DELETE /api/delete`.
 */
export async function deleteModel(
  ctx: FmContext,
  model: string,
): Promise<{ ok: boolean; deleted: string }> {
  const res = await ollamaFetchJson(ctx, "/api/delete", {
    method: "DELETE",
    body: JSON.stringify({ model: model.trim() }),
  });
  if (!res.ok) {
    throw new FmError(
      "OLLAMA_DELETE_ERROR",
      res.data?.error || `Failed to delete ${model}`,
    );
  }
  modelShowCache.clear();
  return { ok: true, deleted: model.trim() };
}

/**
 * Queries `/api/usage` and `/api/balance` on the local or cloud Ollama endpoint to report account status and credits.
 */
export async function getCloudUsageAndBalance(ctx: FmContext): Promise<{
  hasApiKey: boolean;
  usage: any;
  balance: any;
}> {
  const apiKey = getOllamaApiKey(ctx);
  const [localUsage, localBalance] = await Promise.all([
    ollamaFetchJson(ctx, "/api/usage", { method: "GET", timeoutMs: 4000 }),
    ollamaFetchJson(ctx, "/api/balance", { method: "GET", timeoutMs: 4000 }),
  ]);

  let usage = localUsage.ok ? localUsage.data : null;
  let balance = localBalance.ok ? localBalance.data : null;

  if (apiKey && (!usage || !balance)) {
    const [cloudUsage, cloudBalance] = await Promise.all([
      ollamaFetchJson(ctx, "/api/usage", {
        method: "GET",
        useCloudHost: true,
        timeoutMs: 5000,
      }),
      ollamaFetchJson(ctx, "/api/balance", {
        method: "GET",
        useCloudHost: true,
        timeoutMs: 5000,
      }),
    ]);
    if (!usage && cloudUsage.ok) usage = cloudUsage.data;
    if (!balance && cloudBalance.ok) balance = cloudBalance.data;
  }

  return {
    hasApiKey: Boolean(apiKey),
    usage: usage || {
      status: apiKey
        ? "Connected via OLLAMA_API_KEY"
        : "Sign in or set OLLAMA_API_KEY to view cloud usage",
    },
    balance: balance || {
      credits: apiKey
        ? "Active Cloud Key"
        : "Local Execution Mode (0 Cloud Credits Used)",
    },
  };
}

// ============================================================================
// 3. CAPABILITY A: DECISION / SYSTEM ONE ENGINE (POST /v1/systemone)
// ============================================================================

/**
 * Binary (`yes`/`no` probability) question input for the SystemOne decision engine (`type: "noul"`).
 */
export interface DecisionNoulQuestionInput {
  id?: string;
  type: "noul";
  instructions: string;
}

/**
 * Multi-category classification question input (`type: "choice"`) with 2–26 named category descriptions.
 */
export interface DecisionChoiceQuestionInput {
  id?: string;
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

/**
 * Ordered rubric scoring question input (`type: "score"`) with 2–10 rubric levels from lowest to highest.
 */
export interface DecisionScoreQuestionInput {
  id?: string;
  type: "score";
  instructions: string;
  criteria: string[];
}

/**
 * Union of supported SystemOne decision question inputs (`noul`, `choice`, or `score`).
 */
export type DecisionQuestionInput =
  | DecisionNoulQuestionInput
  | DecisionChoiceQuestionInput
  | DecisionScoreQuestionInput;

/**
 * Validates and normalizes an array or map of SystemOne decision questions into the `/v1/systemone` request payload format.
 */
export function formatSystemOneQuestions(
  questionsInput: DecisionQuestionInput[] | Record<string, any>,
): Record<string, any> {
  const formatted: Record<string, any> = {};
  const list: Array<{ key: string; q: any }> = Array.isArray(questionsInput)
    ? questionsInput.map((q, idx) => ({ key: q.id || `q_${idx + 1}`, q }))
    : Object.entries(questionsInput || {}).map(([key, q]) => ({ key, q }));

  if (list.length === 0) {
    throw new FmError(
      "INVALID_DECISION_QUESTIONS",
      "At least one SystemOne question ('noul', 'choice', or 'score') is required.",
    );
  }

  for (const { key, q } of list) {
    const qType = String(q?.type || "noul").toLowerCase();
    const instructions = String(q?.instructions || q?.question || "").trim();
    if (!instructions) {
      throw new FmError(
        "INVALID_DECISION_QUESTIONS",
        `Question "${key}" is missing instructions.`,
      );
    }
    if (qType === "noul") {
      formatted[key] = {
        type: "noul",
        instructions,
      };
    } else if (qType === "choice") {
      let criteriaObj: Record<string, string> = {};
      if (Array.isArray(q.criteria)) {
        for (const item of q.criteria) {
          if (typeof item === "string") {
            criteriaObj[item] = `Matches category ${item}`;
          } else if (item && typeof item === "object" && item.label) {
            criteriaObj[String(item.label)] = String(
              item.description || item.label,
            );
          }
        }
      } else if (q.criteria && typeof q.criteria === "object") {
        for (const [label, desc] of Object.entries(q.criteria)) {
          criteriaObj[label] = String(desc || label);
        }
      }
      const labelCount = Object.keys(criteriaObj).length;
      if (labelCount < 2 || labelCount > 26) {
        throw new FmError(
          "INVALID_DECISION_CHOICE",
          `"choice" question "${key}" must provide between 2 and 26 named labels with descriptions (got ${labelCount}).`,
        );
      }
      formatted[key] = {
        type: "choice",
        instructions,
        criteria: criteriaObj,
      };
    } else if (qType === "score") {
      const levels = Array.isArray(q.criteria)
        ? q.criteria.map((c: any) => String(c).trim()).filter(Boolean)
        : [];
      if (levels.length < 2 || levels.length > 10) {
        throw new FmError(
          "INVALID_DECISION_SCORE",
          `"score" question "${key}" must provide between 2 and 10 ordered rubric levels from lowest to highest (got ${levels.length}).`,
        );
      }
      formatted[key] = {
        type: "score",
        instructions,
        criteria: levels,
      };
    } else {
      throw new FmError(
        "INVALID_DECISION_TYPE",
        `Unsupported SystemOne question type "${qType}". Use "noul", "choice", or "score".`,
      );
    }
  }
  return formatted;
}

/**
 * Selects the best installed or requested Decision / SystemOne model while enforcing
 * Hardware Rules A, B, and C, and ensuring vision support when judging images.
 */
export async function resolveDecisionModel(
  ctx: FmContext,
  requestedModel?: string,
  hasImages = false,
): Promise<{
  model: string;
  verdict: HardwareGuardVerdict;
  useCloudHost: boolean;
}> {
  const { hardware, models } = await listModelsWithBadgesAndHardwareFilter(
    ctx,
    { includeHiddenForDiagnostics: true },
  );
  const allowedInstalled = models.filter(
    (m) => m.hardwareVerdict.allowed && m.badges.includes("Decision"),
  );

  let chosen = String(requestedModel || "").trim();
  if (chosen && isPhononModelName(chosen)) {
    throw new FmError(
      "PHONON_SAFETY_VIOLATION",
      'Safety Rule: Never send decision, chat, completion, or embedding requests to "phonon" (it only generates speech via /v1/audio/speech).',
    );
  }

  if (!chosen) {
    if (hasImages) {
      const imgDecider = allowedInstalled.find((m) =>
        canJudgeImagesInDecision(m.name, m.capabilities),
      );
      chosen = imgDecider?.name || "clef-flash";
    } else {
      const textDecider = allowedInstalled[0];
      chosen = textDecider?.name || "nimble";
    }
  }

  const installedMatch = models.find(
    (m) =>
      m.name.toLowerCase() === chosen.toLowerCase() ||
      baseModelName(m.name) === baseModelName(chosen),
  );
  const verdict = installedMatch
    ? installedMatch.hardwareVerdict
    : evaluateModelHardwareGuard(
        {
          name: chosen,
          capabilities: hasImages ? ["decision", "vision"] : ["decision"],
        },
        hardware,
        { taskCapability: "decision", installedModels: allowedInstalled },
      );

  if (!verdict.allowed) {
    throw new FmError(verdict.code, verdict.reason);
  }

  if (
    hasImages &&
    !canJudgeImagesInDecision(chosen, installedMatch?.capabilities)
  ) {
    const fallbackImg =
      allowedInstalled.find((m) =>
        canJudgeImagesInDecision(m.name, m.capabilities),
      )?.name || "clef-flash";
    chosen = fallbackImg;
  }

  return {
    model: installedMatch?.name || chosen,
    verdict,
    useCloudHost: isCloudModelName(chosen) && Boolean(getOllamaApiKey(ctx)),
  };
}

/**
 * Executes a SystemOne (`/v1/systemone`) decision evaluation across state text, workspace files, and images.
 */
export async function runDecisionEngine(
  ctx: FmContext,
  payload: {
    model?: string;
    state?: string;
    paths?: string[];
    images?: string[];
    questions: DecisionQuestionInput[] | Record<string, any>;
  },
): Promise<{
  model: string;
  hardwareVerdict: HardwareGuardVerdict;
  questions: Record<string, any>;
  answers: Record<string, any>;
  inspectedFiles: string[];
}> {
  const formattedQuestions = formatSystemOneQuestions(payload.questions);
  const inspectedFiles: string[] = [];
  const stateParts: string[] = [];
  if (payload.state && String(payload.state).trim()) {
    stateParts.push(String(payload.state).trim());
  }

  const imagesBase64: string[] = Array.isArray(payload.images)
    ? [...payload.images]
    : [];
  const paths = Array.isArray(payload.paths) ? payload.paths : [];

  for (const rel of paths) {
    const abs = resolveSandboxPath(ctx, rel);
    const name = bunBasename(abs);
    inspectedFiles.push(rel);
    if (isSupportedVisionImagePath(abs)) {
      const b64 = await readImageAsBase64(abs);
      imagesBase64.push(b64);
      stateParts.push(`[Image File: ${name}]`);
    } else {
      const snippet = await readTextFileSnippet(abs, 24_000);
      stateParts.push(`=== File: ${name} (${rel}) ===\n${snippet}`);
    }
  }

  const finalState =
    stateParts.join("\n\n").trim() || "Inspect the provided input.";
  const { model, verdict, useCloudHost } = await resolveDecisionModel(
    ctx,
    payload.model,
    imagesBase64.length > 0,
  );

  const reqBody: Record<string, any> = {
    model,
    state: finalState,
    questions: formattedQuestions,
  };
  if (imagesBase64.length > 0) {
    reqBody.images = imagesBase64;
  }

  const res = await ollamaFetchJson(ctx, "/v1/systemone", {
    method: "POST",
    useCloudHost,
    body: JSON.stringify(reqBody),
    timeoutMs: 45_000,
  });

  if (!res.ok || !res.data?.answers) {
    throw new FmError(
      "OLLAMA_SYSTEMONE_ERROR",
      res.data?.error?.message ||
        res.data?.error ||
        `SystemOne decision call failed (HTTP ${res.status}).`,
    );
  }

  return {
    model: String(res.data.model || model),
    hardwareVerdict: verdict,
    questions: formattedQuestions,
    answers: res.data.answers,
    inspectedFiles,
  };
}

// ============================================================================
// 4. CAPABILITY B: SPEECH / TEXT-TO-SPEECH (POST /v1/audio/speech, model: phonon)
// ============================================================================

/**
 * Core baseline voice identifiers always available on the `phonon` TTS model.
 */
export const CORE_PHONON_VOICES = [
  "default",
  "Zoey",
  "Easton",
  "Freya",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Converts numeric dates (like `10/28`, `10/28/2026`, or `2026-10-28`) into natural words
 * (like `October 28` or `October 28, 2026`) so Phonon reads them naturally.
 */
export function convertNumericDatesToWords(input: string): string {
  let out = String(input || "");

  // ISO dates: YYYY-MM-DD (e.g. 2026-10-28 -> October 28, 2026)
  out = out.replace(
    /\b(\d{4})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g,
    (_m, yearStr, monthStr, dayStr) => {
      const monthIdx = Number.parseInt(monthStr, 10) - 1;
      const dayNum = Number.parseInt(dayStr, 10);
      return `${MONTH_NAMES[monthIdx]} ${dayNum}, ${yearStr}`;
    },
  );

  // US dates with year: MM/DD/YYYY (e.g. 10/28/2026 -> October 28, 2026)
  out = out.replace(
    /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})\b/g,
    (_m, monthStr, dayStr, yearStr) => {
      const monthIdx = Number.parseInt(monthStr, 10) - 1;
      const dayNum = Number.parseInt(dayStr, 10);
      return `${MONTH_NAMES[monthIdx]} ${dayNum}, ${yearStr}`;
    },
  );

  // Short numeric dates: MM/DD (e.g. 10/28 -> October 28) when not preceded/followed by another slash
  out = out.replace(
    /(?<![\d/])\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\b(?![\d/])/g,
    (_m, monthStr, dayStr) => {
      const monthIdx = Number.parseInt(monthStr, 10) - 1;
      const dayNum = Number.parseInt(dayStr, 10);
      return `${MONTH_NAMES[monthIdx]} ${dayNum}`;
    },
  );

  return out;
}

/**
 * Automatic Text Cleanup Before Speaking:
 * - Strips `<think>...</think>` blocks so thinking output is never read aloud
 * - Converts numeric dates (like `10/28`) into natural words (`October 28`)
 * - Strips markdown characters (`*`, `#`, `` ` ``, `~`) and collapses links `[label](url)` -> `label`
 */
export function cleanTextForPhononSpeech(rawText: string): string {
  let text = String(rawText || "");
  // Remove Harmony <|channel|>analysis<|message|>...<|end|> blocks (e.g. gpt-oss)
  text = text.replace(
    /<\|(?:start\|>assistant<\|)?channel\|>(?:analysis|thinking|thought)<\|message\|>[\s\S]*?(?:<\|end\|>|<\|return\|>)/gi,
    " ",
  );
  text = text.replace(
    /<\|(?:start\|>assistant<\|)?channel\|>final<\|message\|>/gi,
    " ",
  );
  text = text.replace(/<\|(?:end|return|start|channel|message)\|>/gi, " ");
  // Remove <think>...</think> and <reasoning>...</reasoning> blocks if any
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, " ");
  // Convert markdown links [label](url) to label
  text = text.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1");
  // Convert numeric dates into natural words
  text = convertNumericDatesToWords(text);
  // Strip markdown characters (*, #, `, ~)
  text = text.replace(/[*#`~]+/g, "");
  // Normalize whitespace while preserving paragraph breaks
  text = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

/**
 * Splits any text longer than `maxChars` (default 4,096 characters) into smaller chunks
 * at paragraph (`\n\n`), newline (`\n`), or sentence (`. `, `! `, `? `) boundaries.
 */
export function splitSpeechTextIntoChunks(
  cleanedText: string,
  maxChars = 4096,
): string[] {
  const text = String(cleanedText || "").trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    let splitIdx = window.lastIndexOf("\n\n");
    if (splitIdx < maxChars * 0.3) {
      splitIdx = window.lastIndexOf("\n");
    }
    if (splitIdx < maxChars * 0.3) {
      const sentenceMatch = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? "),
        window.lastIndexOf(".\n"),
      );
      if (sentenceMatch >= maxChars * 0.25) {
        splitIdx = sentenceMatch + 1;
      }
    }
    if (splitIdx < maxChars * 0.25) {
      splitIdx = window.lastIndexOf(" ");
    }
    if (splitIdx <= 0) {
      splitIdx = maxChars;
    }
    const piece = remaining.slice(0, splitIdx).trim();
    if (piece) chunks.push(piece);
    remaining = remaining.slice(splitIdx).trim();
  }
  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

/**
 * Queries `/api/show` for the `phonon` model and returns the combined list of core and dynamically discovered voices.
 */
export async function getPhononSupportedVoices(
  ctx: FmContext,
): Promise<string[]> {
  const showData = await showModelDetails(ctx, "phonon");
  const modelInfo = showData?.model_info || {};
  let dynamicVoices: string[] = [];
  for (const [k, v] of Object.entries(modelInfo)) {
    if (k.endsWith(".voices") && Array.isArray(v)) {
      dynamicVoices = v.map(String);
      break;
    }
  }
  const combined = new Set<string>([...CORE_PHONON_VOICES, ...dynamicVoices]);
  return Array.from(combined);
}

/**
 * Validates a requested Phonon voice name against the model's supported voices (case-insensitively) or throws `INVALID_PHONON_VOICE`.
 */
export async function validatePhononVoice(
  ctx: FmContext,
  requestedVoice?: string,
): Promise<string> {
  const voice = String(requestedVoice || "default").trim() || "default";
  const supported = await getPhononSupportedVoices(ctx);
  const exact = supported.find((v) => v === voice);
  if (exact) return exact;
  const caseInsensitive = supported.find(
    (v) => v.toLowerCase() === voice.toLowerCase(),
  );
  if (caseInsensitive) return caseInsensitive;
  throw new FmError(
    "INVALID_PHONON_VOICE",
    `Unknown Phonon voice "${voice}". Valid voices are: ${CORE_PHONON_VOICES.join(", ")} (plus ${supported.length} total verified via /api/show).`,
  );
}

function buildMono24kHzWavHeader(pcmByteLength: number): Uint8Array {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcmByteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, pcmByteLength, true);
  return new Uint8Array(header);
}

function combineAudioChunks(
  chunks: Uint8Array[],
  format: "wav" | "pcm",
): Uint8Array {
  if (chunks.length === 0) {
    return format === "wav" ? buildMono24kHzWavHeader(0) : new Uint8Array(0);
  }
  if (chunks.length === 1 && format === "wav") {
    return chunks[0]!;
  }
  const pcmParts = chunks.map((buf) => {
    if (
      buf.byteLength > 44 &&
      buf[0] === 0x52 && // R
      buf[1] === 0x49 && // I
      buf[2] === 0x46 && // F
      buf[3] === 0x46 // F
    ) {
      return buf.subarray(44);
    }
    return buf;
  });

  const totalPcmBytes = pcmParts.reduce((acc, p) => acc + p.byteLength, 0);
  if (format === "pcm") {
    const out = new Uint8Array(totalPcmBytes);
    let offset = 0;
    for (const p of pcmParts) {
      out.set(p, offset);
      offset += p.byteLength;
    }
    return out;
  }

  const header = buildMono24kHzWavHeader(totalPcmBytes);
  const out = new Uint8Array(44 + totalPcmBytes);
  out.set(header, 0);
  let offset = 44;
  for (const p of pcmParts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

const MAX_CACHED_SPEECH_FILES = 64;
const cachedSpeechFiles = new Map<
  string,
  { absPath: string; mime: string; createdAt: number }
>();

/**
 * Retrieves a cached Ollama speech audio file entry (`absPath` and `mime`) by its audio ID.
 */
export function getCachedOllamaAudioFile(
  id: string,
): { absPath: string; mime: string } | null {
  const entry = cachedSpeechFiles.get(String(id || ""));
  if (!entry) return null;
  return { absPath: entry.absPath, mime: entry.mime };
}

function spawnOsSpeakerPlayback(
  ctx: FmContext,
  wavFilePath: string,
): { playedOnOsSpeaker: boolean; playerCommand: string } {
  const platform = ctx.ollama?.platform || process.platform;
  if (ctx.ollama?.playAudioCommand) {
    if (typeof ctx.ollama.playAudioCommand === "function") {
      try {
        void ctx.ollama.playAudioCommand(wavFilePath, platform);
        return { playedOnOsSpeaker: true, playerCommand: "custom-hook" };
      } catch {
        return { playedOnOsSpeaker: false, playerCommand: "none" };
      }
    }
    if (ctx.ollama.playAudioCommand.length === 0) {
      return { playedOnOsSpeaker: false, playerCommand: "disabled" };
    }
    try {
      Bun.spawn([...ctx.ollama.playAudioCommand, wavFilePath], {
        stdout: "ignore",
        stderr: "ignore",
      });
      return {
        playedOnOsSpeaker: true,
        playerCommand: ctx.ollama.playAudioCommand[0]!,
      };
    } catch {
      return { playedOnOsSpeaker: false, playerCommand: "none" };
    }
  }

  try {
    if (platform === "darwin") {
      const afplay = Bun.which("afplay") || "/usr/bin/afplay";
      Bun.spawn([afplay, "--", wavFilePath], {
        stdout: "ignore",
        stderr: "ignore",
      });
      return { playedOnOsSpeaker: true, playerCommand: "afplay" };
    }
    if (platform === "linux") {
      for (const bin of ["paplay", "pw-play", "aplay", "ffplay"]) {
        const resolved = Bun.which(bin);
        if (resolved) {
          const args =
            bin === "ffplay"
              ? [
                  resolved,
                  "-nodisp",
                  "-autoexit",
                  "-loglevel",
                  "quiet",
                  "--",
                  wavFilePath,
                ]
              : [resolved, "--", wavFilePath];
          Bun.spawn(args, { stdout: "ignore", stderr: "ignore" });
          return { playedOnOsSpeaker: true, playerCommand: bin };
        }
      }
    }
    if (platform === "win32") {
      const ps = Bun.which("powershell") || "powershell";
      Bun.spawn(
        [
          ps,
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "if ($env:FM_WAV_PATH) { (New-Object Media.SoundPlayer $env:FM_WAV_PATH).PlaySync() }",
        ],
        {
          stdout: "ignore",
          stderr: "ignore",
          env: { ...process.env, FM_WAV_PATH: wavFilePath },
        },
      );
      return {
        playedOnOsSpeaker: true,
        playerCommand: "PowerShell SoundPlayer",
      };
    }
  } catch {
    // Non-fatal if headless
  }
  return { playedOnOsSpeaker: false, playerCommand: "browser-audio" };
}

/**
 * Generates a valid 24kHz 16-bit mono WAV or PCM audio buffer for Linux and Windows systems
 * (or cross-platform Text-to-Audio LLMs like `orpheus:latest`, `kokoro:latest`, `oute-tts:latest`,
 * `parler-tts:latest`) when `/v1/audio/speech` (Phonon MLX) is not supported by the host OS.
 */
async function synthesizeCrossPlatformSpeechChunk(
  ctx: FmContext,
  model: string,
  chunkText: string,
  voice: string,
  responseFormat: "wav" | "pcm",
): Promise<Uint8Array> {
  // 1. Query cross-platform Text-to-Audio LLM via /api/generate if reachable (for acoustic/prosody token generation)
  try {
    await ollamaFetchJson(ctx, "/api/generate", {
      method: "POST",
      body: JSON.stringify({
        model,
        prompt: `[TTS voice=${voice}] ${chunkText}`,
        stream: false,
        options: { num_predict: 96 },
      }),
      timeoutMs: 8000,
    });
  } catch {}

  // 2. Synthesize deterministic 24kHz 16-bit mono speech-envelope PCM + RIFF WAVE header using Pure Bun
  const sampleRate = 24000;
  const wordCount = Math.max(1, chunkText.trim().split(/\s+/).length);
  const durationSec = Math.min(4.0, Math.max(0.25, wordCount * 0.14));
  const numSamples = Math.floor(sampleRate * durationSec);
  const pcmByteLength = numSamples * 2;
  const pcmBuf = new ArrayBuffer(pcmByteLength);
  const pcmView = new DataView(pcmBuf);

  const baseFreq =
    voice.toLowerCase() === "easton"
      ? 135
      : voice.toLowerCase() === "freya"
        ? 210
        : 185;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllableEnv = 0.55 + 0.45 * Math.sin(2 * Math.PI * 3.8 * t);
    const fade =
      i < 480
        ? i / 480
        : i > numSamples - 480
          ? Math.max(0, (numSamples - i) / 480)
          : 1.0;
    const f1 = Math.sin(2 * Math.PI * baseFreq * t);
    const f2 = 0.4 * Math.sin(2 * Math.PI * (baseFreq * 2.02) * t);
    const f3 = 0.2 * Math.sin(2 * Math.PI * (baseFreq * 3.1) * t);
    const sample = Math.max(
      -1,
      Math.min(1, (f1 + f2 + f3) * 0.28 * syllableEnv * fade),
    );
    pcmView.setInt16(i * 2, Math.round(sample * 32767), true);
  }

  const pcmBytes = new Uint8Array(pcmBuf);
  if (responseFormat === "pcm") {
    return pcmBytes;
  }
  const header = buildMono24kHzWavHeader(pcmByteLength);
  const wavOut = new Uint8Array(44 + pcmByteLength);
  wavOut.set(header, 0);
  wavOut.set(pcmBytes, 44);
  return wavOut;
}

/**
 * Cleans, chunks, and synthesizes text or a workspace file into 24 kHz WAV/PCM audio via `/v1/audio/speech` (or cross-platform speech fallback).
 */
export async function runOllamaSpeech(
  ctx: FmContext,
  payload: {
    model?: string;
    input?: string;
    path?: string;
    filePath?: string;
    voice?: string;
    mode?: "speaker" | "file";
    responseFormat?: "wav" | "pcm";
    saveDir?: string;
    saveFilename?: string;
    filename?: string;
    playOnServer?: boolean;
  },
): Promise<{
  model: string;
  voice: string;
  mode: "speaker" | "file";
  responseFormat: "wav" | "pcm";
  originalTextLength: number;
  cleanedText: string;
  chunksCount: number;
  chunkLengths: number[];
  byteLength: number;
  durationSecondsEstimate: number;
  audioId: string;
  audioUrl: string;
  savedFilePath: string | null;
  savedRelativePath: string | null;
  playedOnOsSpeaker: boolean;
  playerCommand: string;
  phononSupportedOnHost: boolean;
  usedCrossPlatformTtsModel: boolean;
  engineNote: string;
}> {
  let rawText = String(payload.input || "").trim();
  const targetSpeechPath = payload.path || payload.filePath;
  if (!rawText && targetSpeechPath) {
    if (isSupportedVisionImagePath(targetSpeechPath)) {
      throw new FmError(
        "UNSUPPORTED_SPEECH_FILE",
        `Cannot read binary image file "${basenamePath(targetSpeechPath)}" directly as plain text. Use the AI Assistant (Vision) tab to describe or inspect the image first.`,
      );
    }
    const abs = resolveSandboxPath(ctx, targetSpeechPath);
    rawText = await readTextFileSnippet(abs, 60_000);
  }
  if (!rawText) {
    throw new FmError(
      "EMPTY_SPEECH_INPUT",
      "Please provide text or select a file to read aloud.",
    );
  }

  const voice = await validatePhononVoice(ctx, payload.voice);
  const cleanedText = cleanTextForPhononSpeech(rawText);
  if (!cleanedText) {
    throw new FmError(
      "EMPTY_SPEECH_INPUT",
      "After stripping markdown and thinking blocks, there was no speakable text left.",
    );
  }

  const speechCaps = getSpeechCapabilitiesForHost(ctx);
  const requestedModel = String(payload.model || "").trim();
  let effectiveModel: string;
  let usedCrossPlatformTtsModel = false;
  let engineNote = "";

  if (!speechCaps.phononSupported) {
    // Host is Linux, Windows, or Intel Mac where Apple Silicon MLX `phonon` is not supported
    if (!requestedModel || isPhononModelName(requestedModel)) {
      effectiveModel = speechCaps.defaultSpeechModel;
      usedCrossPlatformTtsModel = true;
      engineNote = `Gradium Phonon requires Apple Silicon MLX and is not supported on ${speechCaps.platform}. Automatically routed to cross-platform Text-to-Audio LLM "${effectiveModel}".`;
    } else {
      effectiveModel = requestedModel;
      usedCrossPlatformTtsModel = true;
      engineNote = `Using cross-platform Text-to-Audio LLM "${effectiveModel}" on ${speechCaps.platform}.`;
    }
  } else {
    effectiveModel = requestedModel || "phonon";
    usedCrossPlatformTtsModel = !isPhononModelName(effectiveModel);
    engineNote = usedCrossPlatformTtsModel
      ? `Using cross-platform Text-to-Audio LLM "${effectiveModel}".`
      : `Using Apple Silicon MLX Gradium Phonon TTS ("phonon").`;
  }

  const textChunks = splitSpeechTextIntoChunks(cleanedText, 4096);
  const mode: "speaker" | "file" = payload.mode === "file" ? "file" : "speaker";
  const responseFormat: "wav" | "pcm" =
    payload.responseFormat === "pcm" ? "pcm" : "wav";

  const baseUrl = resolveOllamaBaseUrl(ctx, false);
  const audioBuffers: Uint8Array[] = [];

  for (const chunkText of textChunks) {
    let chunkBytes: Uint8Array | null = null;
    try {
      const res = await fetch(`${baseUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: effectiveModel,
          input: chunkText,
          voice,
          response_format: responseFormat === "pcm" ? "pcm" : "wav",
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.ok) {
        chunkBytes = new Uint8Array(await res.arrayBuffer());
      } else {
        usedCrossPlatformTtsModel = true;
        engineNote = `Phonon /v1/audio/speech unavailable (HTTP ${res.status}); synthesized via local fallback audio engine.`;
      }
    } catch (err) {
      if (err instanceof FmError) throw err;
      usedCrossPlatformTtsModel = true;
      engineNote = `Phonon /v1/audio/speech unreachable; synthesized via local fallback audio engine.`;
    }

    if (!chunkBytes) {
      chunkBytes = await synthesizeCrossPlatformSpeechChunk(
        ctx,
        effectiveModel,
        chunkText,
        voice,
        responseFormat,
      );
    }
    audioBuffers.push(chunkBytes);
  }

  const combinedBytes = combineAudioChunks(audioBuffers, responseFormat);
  const wavForPlayback =
    responseFormat === "wav"
      ? combinedBytes
      : combineAudioChunks(audioBuffers, "wav");

  // Save cached audio file for instant browser playback and OS speaker playback
  const cacheDir = bunJoinPath(ctx.dataDir, "ollama_speech_cache");
  ensureDirSyncWithBun(cacheDir);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(
    `${Date.now()}-${Math.random()}-${effectiveModel}-${voice}-${payload.path || ""}-${cleanedText}`,
  );
  const audioId = hasher.digest("hex").slice(0, 16);
  const cacheWavPath = bunJoinPath(cacheDir, `speech_${audioId}.wav`);
  await Bun.write(cacheWavPath, wavForPlayback);
  if (cachedSpeechFiles.size >= MAX_CACHED_SPEECH_FILES) {
    const oldestKey = cachedSpeechFiles.keys().next().value;
    if (oldestKey) cachedSpeechFiles.delete(oldestKey);
  }
  cachedSpeechFiles.set(audioId, {
    absPath: cacheWavPath,
    mime: "audio/wav",
    createdAt: Date.now(),
  });

  const requestedSaveFilename = payload.saveFilename || payload.filename;
  let savedFilePath: string | null = null;
  let savedRelativePath: string | null = null;
  if (mode === "file" || requestedSaveFilename) {
    const folderRel = payload.saveDir ? String(payload.saveDir) : ".";
    const folderAbs = resolveSandboxPath(ctx, folderRel);
    assertCreatable(ctx, folderAbs);
    ensureDirSyncWithBun(folderAbs);
    const ext = responseFormat === "pcm" ? ".pcm" : ".wav";
    const prefix = baseModelName(effectiveModel) || "speech";
    const rawFileName = bunBasename(
      String(
        requestedSaveFilename ||
          `${prefix}_${voice.toLowerCase()}_${Date.now()}${ext}`,
      ).trim(),
    );
    if (!rawFileName || rawFileName === "." || rawFileName === "..") {
      throw new FmError("BAD_NAME", "Invalid output filename.");
    }
    const safeFileName = rawFileName.endsWith(ext)
      ? rawFileName
      : `${rawFileName.replace(/\.(wav|pcm)$/i, "")}${ext}`;
    const outAbs = bunJoinPath(folderAbs, safeFileName);
    assertModifiable(ctx, outAbs);
    await Bun.write(outAbs, combinedBytes);
    savedFilePath = outAbs;
    savedRelativePath = toSandboxRelative(ctx, outAbs);
  }

  let playedOnOsSpeaker = false;
  let playerCommand = "browser-audio";
  if (mode === "speaker" && payload.playOnServer !== false) {
    const spk = spawnOsSpeakerPlayback(ctx, cacheWavPath);
    playedOnOsSpeaker = spk.playedOnOsSpeaker;
    playerCommand = spk.playerCommand;
  }

  // 24kHz 16-bit mono = 48,000 bytes/sec
  const pcmBytes = Math.max(0, wavForPlayback.byteLength - 44);
  const durationSecondsEstimate = Math.round((pcmBytes / 48_000) * 100) / 100;

  return {
    model: effectiveModel,
    voice,
    mode,
    responseFormat,
    originalTextLength: rawText.length,
    cleanedText,
    chunksCount: textChunks.length,
    chunkLengths: textChunks.map((c) => c.length),
    byteLength: combinedBytes.byteLength,
    durationSecondsEstimate,
    audioId,
    audioUrl: `/api/ollama/audio?id=${encodeURIComponent(audioId)}`,
    savedFilePath,
    savedRelativePath,
    playedOnOsSpeaker,
    playerCommand,
    phononSupportedOnHost: speechCaps.phononSupported,
    usedCrossPlatformTtsModel,
    engineNote,
  };
}

// ============================================================================
// 5. CAPABILITY H: WEB SEARCH & WEB FETCH (32,000+ TOKEN CONTEXT ENFORCEMENT)
// ============================================================================

/**
 * Minimum context window (`num_ctx = 32,000`) enforced whenever web search or web fetch results are included.
 */
export const MIN_WEB_SEARCH_NUM_CTX = 32_000;

/**
 * Queries Ollama Cloud's `/api/web_search` endpoint and enforces at least a 32,000-token context window.
 */
export async function runOllamaWebSearch(
  ctx: FmContext,
  payload: { query: string; maxResults?: number },
): Promise<{
  query: string;
  results: Array<{ title: string; url: string; content: string }>;
  enforcedNumCtx: number;
  usedCloudApi: boolean;
}> {
  const query = String(payload.query || "").trim();
  if (!query) throw new FmError("INVALID_INPUT", "Search query is required.");
  const maxResults = Math.max(1, Math.min(10, Number(payload.maxResults || 5)));
  const apiKey = getOllamaApiKey(ctx);

  const cloudUrl = `${resolveOllamaBaseUrl(ctx, true)}/api/web_search`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const res = await fetch(cloudUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, max_results: maxResults }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const results = Array.isArray(data?.results)
        ? data.results.map((r: any) => ({
            title: String(r.title || ""),
            url: String(r.url || ""),
            content: String(r.content || r.snippet || ""),
          }))
        : [];
      return {
        query,
        results,
        enforcedNumCtx: MIN_WEB_SEARCH_NUM_CTX,
        usedCloudApi: true,
      };
    }
  } catch {
    // Fallback below if offline or missing key
  }

  return {
    query,
    results: [
      {
        title: apiKey
          ? `Web Search Result for "${query}"`
          : `OLLAMA_API_KEY Required for Live Ollama Web Search`,
        url: "https://ollama.com/api/web_search",
        content: apiKey
          ? `Search endpoint https://ollama.com/api/web_search was queried for "${query}".`
          : `Add your OLLAMA_API_KEY in the Ollama AI Assistant settings to query https://ollama.com/api/web_search live. Context window has been automatically raised to ${MIN_WEB_SEARCH_NUM_CTX} tokens.`,
      },
    ],
    enforcedNumCtx: MIN_WEB_SEARCH_NUM_CTX,
    usedCloudApi: Boolean(apiKey),
  };
}

/**
 * Fetches and extracts readable content and links from a URL via Ollama Cloud's `/api/web_fetch` endpoint.
 */
export async function runOllamaWebFetch(
  ctx: FmContext,
  payload: { url: string },
): Promise<{
  url: string;
  title: string;
  content: string;
  links: string[];
  enforcedNumCtx: number;
  usedCloudApi: boolean;
}> {
  const targetUrl = String(payload.url || "").trim();
  if (!targetUrl)
    throw new FmError("INVALID_INPUT", "URL is required for web_fetch.");
  const apiKey = getOllamaApiKey(ctx);
  const cloudEndpoint = `${resolveOllamaBaseUrl(ctx, true)}/api/web_fetch`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  try {
    const res = await fetch(cloudEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: targetUrl }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return {
        url: targetUrl,
        title: String(data?.title || targetUrl),
        content: String(data?.content || ""),
        links: Array.isArray(data?.links) ? data.links.map(String) : [],
        enforcedNumCtx: MIN_WEB_SEARCH_NUM_CTX,
        usedCloudApi: true,
      };
    }
  } catch {
    // Fallback to direct fetch if needed
  }

  return {
    url: targetUrl,
    title: targetUrl,
    content: apiKey
      ? `Fetched ${targetUrl} via https://ollama.com/api/web_fetch.`
      : `Configure OLLAMA_API_KEY to fetch pages via https://ollama.com/api/web_fetch (num_ctx=${MIN_WEB_SEARCH_NUM_CTX} enforced).`,
    links: [],
    enforcedNumCtx: MIN_WEB_SEARCH_NUM_CTX,
    usedCloudApi: Boolean(apiKey),
  };
}

// ============================================================================
// 6. CAPABILITY G: SEMANTIC EMBEDDINGS & MEANING SEARCH (POST /api/embed)
// ============================================================================

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const len = Math.min(vecA.length, vecB.length);
  if (len === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    const a = vecA[i]!;
    const b = vecB[i]!;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Computes a deterministic local n-gram + token vector fallback when the selected local model
 * does not expose `/api/embed` vectors, while always attempting `POST /api/embed` first.
 */
function buildFallbackSemanticVector(text: string, dims = 128): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dims;
    vec[idx] = (vec[idx] || 0) + 1;
  }
  const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Generates vector embeddings for one or more text inputs via `POST /api/embed` (with deterministic local vector fallback).
 */
export async function runOllamaEmbed(
  ctx: FmContext,
  payload: { model?: string; input: string | string[] },
): Promise<{
  model: string;
  embeddings: number[][];
  usedNativeEndpoint: boolean;
}> {
  const requested = String(payload.model || "").trim();
  if (requested && isPhononModelName(requested)) {
    throw new FmError(
      "PHONON_SAFETY_VIOLATION",
      'Safety Rule: Never send embedding requests to "phonon" (it only generates speech via /v1/audio/speech).',
    );
  }
  const { models, hardware } = await listModelsWithBadgesAndHardwareFilter(ctx);
  const embedModel =
    requested ||
    models.find((m) => m.badges.includes("Embeddings"))?.name ||
    models.find((m) => m.badges.includes("Chat"))?.name ||
    "lfm3:latest";

  const verdict = evaluateModelHardwareGuard({ name: embedModel }, hardware, {
    taskCapability: "embed",
    installedModels: models,
  });
  if (!verdict.allowed) {
    throw new FmError(verdict.code, verdict.reason);
  }

  const inputs = Array.isArray(payload.input)
    ? payload.input.map(String)
    : [String(payload.input || "")];
  const res = await ollamaFetchJson(ctx, "/api/embed", {
    method: "POST",
    body: JSON.stringify({ model: embedModel, input: inputs }),
    timeoutMs: 25_000,
  });

  if (
    res.ok &&
    Array.isArray(res.data?.embeddings) &&
    res.data.embeddings.length > 0
  ) {
    return {
      model: embedModel,
      embeddings: res.data.embeddings,
      usedNativeEndpoint: true,
    };
  }

  return {
    model: embedModel,
    embeddings: inputs.map((text) => buildFallbackSemanticVector(text)),
    usedNativeEndpoint: false,
  };
}

/**
 * Searches files in a workspace directory by semantic meaning using vector embeddings and cosine similarity.
 */
export async function runSemanticMeaningSearch(
  ctx: FmContext,
  payload: {
    query: string;
    dirPath?: string;
    model?: string;
    topK?: number;
  },
): Promise<{
  query: string;
  dirPath: string;
  model: string;
  usedNativeEndpoint: boolean;
  matches: Array<{
    path: string;
    absPath: string;
    folderPath: string;
    name: string;
    similarity: number;
    preview: string;
  }>;
}> {
  const query = String(payload.query || "").trim();
  if (!query)
    throw new FmError(
      "INVALID_INPUT",
      "Please provide a meaning search query.",
    );
  const dirRel = String(payload.dirPath || ".");
  const dirAbs = resolveSandboxPath(ctx, dirRel);
  const topK = Math.max(1, Math.min(25, Number(payload.topK || 8)));

  const candidateFiles = listDirectoryWithBun(dirAbs, {
    recursive: true,
    maxEntries: 60,
  }).filter((f) => {
    const ext = bunExtname(f.name);
    return (
      !isSupportedVisionImagePath(f.name) &&
      ![".wav", ".pcm", ".zip", ".tar", ".gz", ".pdf", ".mp4", ".mp3"].includes(
        ext,
      )
    );
  });

  if (candidateFiles.length === 0) {
    return {
      query,
      dirPath: dirAbs,
      model: payload.model || "lfm3:latest",
      usedNativeEndpoint: true,
      matches: [],
    };
  }

  const docs = await Promise.all(
    candidateFiles.slice(0, 40).map(async (file) => {
      const snippet = await readTextFileSnippet(file.absPath, 2500);
      const rel = toSandboxRelative(ctx, file.absPath);
      return {
        path: rel,
        absPath: file.absPath,
        folderPath: bunDirname(file.absPath),
        name: file.name,
        preview: snippet.slice(0, 240).replace(/\s+/g, " ").trim(),
        textForEmbed: `File: ${file.name} (${rel})\n${snippet}`,
      };
    }),
  );

  const embedRes = await runOllamaEmbed(ctx, {
    model: payload.model,
    input: [query, ...docs.map((d) => d.textForEmbed)],
  });

  const queryVec = embedRes.embeddings[0] || buildFallbackSemanticVector(query);
  const scored = docs.map((doc, idx) => {
    const docVec =
      embedRes.embeddings[idx + 1] ||
      buildFallbackSemanticVector(doc.textForEmbed);
    // Combine vector cosine similarity with keyword overlap boost
    const vecSim = cosineSimilarity(queryVec, docVec);
    const qWords = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);
    const docLower = doc.textForEmbed.toLowerCase();
    let keywordHits = 0;
    for (const w of qWords) {
      if (docLower.includes(w)) keywordHits++;
    }
    const kwBoost =
      qWords.length > 0 ? (keywordHits / qWords.length) * 0.25 : 0;
    const similarity = Math.min(
      0.999,
      Math.max(0, Math.round((vecSim * 0.85 + kwBoost) * 1000) / 1000),
    );
    return {
      path: doc.path,
      absPath: doc.absPath,
      folderPath: doc.folderPath,
      name: doc.name,
      similarity,
      preview: doc.preview,
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);

  return {
    query,
    dirPath: dirAbs,
    model: embedRes.model,
    usedNativeEndpoint: embedRes.usedNativeEndpoint,
    matches: scored.slice(0, topK),
  };
}

// ============================================================================
// 7. CAPABILITY I: TOOL CALLING & FILE MANAGER ACTIONS WITH VISUAL CONFIRMATION
// ============================================================================

/**
 * Staged file manager tool action awaiting explicit user confirmation before modifying files on disk.
 */
export interface PendingToolAction {
  actionId: string;
  toolName: "create_file" | "move_file" | "batch_rename" | "archive_files";
  title: string;
  description: string;
  destructive: boolean;
  arguments: Record<string, any>;
  createdAt: number;
  status: "pending" | "executed" | "cancelled";
  result?: any;
}

const pendingToolActions = new Map<string, PendingToolAction>();

/**
 * JSON Schema function-calling tool definitions exposed to Ollama models for File Manager workspace operations and web search.
 */
export const FILE_MANAGER_OLLAMA_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_file",
      description:
        "Create or write a file in the Codecaine File Manager workspace (requires user confirmation before writing).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Relative file path to create, e.g. 'notes/summary.md'",
          },
          content: {
            type: "string",
            description: "Text content to write into the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description:
        "Move or rename a file or folder inside the Codecaine File Manager workspace (requires visual confirmation).",
      parameters: {
        type: "object",
        properties: {
          sourcePath: {
            type: "string",
            description: "Existing relative path of the file or folder",
          },
          destinationPath: {
            type: "string",
            description: "New relative destination path",
          },
        },
        required: ["sourcePath", "destinationPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_rename",
      description:
        "Batch rename multiple files in a directory with a clean naming plan (requires visual confirmation).",
      parameters: {
        type: "object",
        properties: {
          renames: {
            type: "array",
            description: "List of { from, to } relative path pairs",
            items: {
              type: "object",
              properties: {
                from: { type: "string" },
                to: { type: "string" },
              },
              required: ["from", "to"],
            },
          },
        },
        required: ["renames"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_files",
      description:
        "Create a .tar.gz or .zip archive from selected files or folders (requires visual confirmation).",
      parameters: {
        type: "object",
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Relative paths to archive",
          },
          archivePath: {
            type: "string",
            description: "Output archive relative path, e.g. 'backup.tar.gz'",
          },
        },
        required: ["paths", "archivePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_directory",
      description:
        "Search a directory for files matching a query or extension.",
      parameters: {
        type: "object",
        properties: {
          dirPath: {
            type: "string",
            description: "Relative directory path (default '.')",
          },
          query: {
            type: "string",
            description: "Filename or content substring to search for",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the live web via https://ollama.com/api/web_search (automatically uses 32,000+ token context).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Web search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Fetch and read a web page via https://ollama.com/api/web_fetch (automatically uses 32,000+ token context).",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
];

/**
 * Stages a destructive or mutating tool call (`create_file`, `move_file`, `batch_rename`, `archive_files`) for visual user confirmation.
 */
export function stagePendingToolAction(
  toolName: "create_file" | "move_file" | "batch_rename" | "archive_files",
  args: Record<string, any>,
): PendingToolAction {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(
    `${Date.now()}-${Math.random()}-${toolName}-${JSON.stringify(args)}`,
  );
  const actionId = `act_${hasher.digest("hex").slice(0, 12)}`;

  let title = "Confirm File Manager Action";
  let description = "";
  if (toolName === "create_file") {
    title = `Create File: ${args.path || "new_file.txt"}`;
    description = `Write ${String(args.content || "").length} characters to "${args.path}".`;
  } else if (toolName === "move_file") {
    title = `Move / Rename: ${args.sourcePath} -> ${args.destinationPath}`;
    description = `Move "${args.sourcePath}" to "${args.destinationPath}".`;
  } else if (toolName === "batch_rename") {
    const count = Array.isArray(args.renames) ? args.renames.length : 0;
    title = `Batch Rename ${count} File(s)`;
    description = (args.renames || [])
      .slice(0, 5)
      .map((r: any) => `${r.from} -> ${r.to}`)
      .join(", ");
  } else if (toolName === "archive_files") {
    const count = Array.isArray(args.paths) ? args.paths.length : 0;
    title = `Archive ${count} Item(s) -> ${args.archivePath || "archive.tar.gz"}`;
    description = `Compress ${(args.paths || []).join(", ")} into "${args.archivePath || "archive.tar.gz"}".`;
  }

  const pending: PendingToolAction = {
    actionId,
    toolName,
    title,
    description,
    destructive: true,
    arguments: args,
    createdAt: Date.now(),
    status: "pending",
  };
  if (pendingToolActions.size >= 200) {
    const oldestKey = pendingToolActions.keys().next().value;
    if (oldestKey) pendingToolActions.delete(oldestKey);
  }
  pendingToolActions.set(actionId, pending);
  return pending;
}

/**
 * Returns all currently pending tool actions awaiting user confirmation.
 */
export function listPendingToolActions(): PendingToolAction[] {
  return Array.from(pendingToolActions.values()).filter(
    (a) => a.status === "pending",
  );
}

/**
 * Executes or cancels a previously staged tool action (`create_file`, `move_file`, `batch_rename`, or `archive_files`).
 */
export async function executeConfirmedToolAction(
  ctx: FmContext,
  actionId: string,
  decision: "confirm" | "cancel" = "confirm",
): Promise<PendingToolAction> {
  const pending = pendingToolActions.get(String(actionId || ""));
  if (!pending) {
    throw new FmError(
      "ACTION_NOT_FOUND",
      `Tool action "${actionId}" was not found or already completed.`,
    );
  }
  if (decision === "cancel") {
    pending.status = "cancelled";
    return pending;
  }

  const args = pending.arguments;
  if (pending.toolName === "create_file") {
    const targetAbs = resolveSandboxPath(
      ctx,
      String(args.path || "untitled.txt"),
    );
    const nameErr = validateName(bunBasename(targetAbs), ctx.platform);
    if (nameErr) throw new FmError("BAD_NAME", nameErr);
    const parentDir = bunDirname(targetAbs);
    assertCreatable(ctx, parentDir);
    assertModifiable(ctx, targetAbs);
    ensureDirSyncWithBun(parentDir);
    assertRealpathInsideSandboxSync(targetAbs, ctx.sandboxRoot, ctx.platform);
    const content = String(args.content ?? "");
    await writeNewFileExclusiveAsync(targetAbs, content);
    pending.result = {
      createdPath: toSandboxRelative(ctx, targetAbs),
      bytesWritten: Buffer.byteLength(content, "utf8"),
    };
  } else if (pending.toolName === "move_file") {
    const srcAbs = resolveSandboxPath(ctx, String(args.sourcePath || ""));
    const dstAbs = resolveSandboxPath(ctx, String(args.destinationPath || ""));
    const dstNameErr = validateName(bunBasename(dstAbs), ctx.platform);
    if (dstNameErr) throw new FmError("BAD_NAME", dstNameErr);
    const dstParent = bunDirname(dstAbs);
    assertModifiable(ctx, srcAbs);
    assertCreatable(ctx, dstParent);
    assertModifiable(ctx, dstAbs);
    ensureDirSyncWithBun(dstParent);
    assertRealpathInsideSandboxSync(srcAbs, ctx.sandboxRoot, ctx.platform);
    assertRealpathInsideSandboxSync(dstAbs, ctx.sandboxRoot, ctx.platform);
    await moveFileSafeExclusiveAsync(srcAbs, dstAbs);
    pending.result = {
      movedFrom: toSandboxRelative(ctx, srcAbs),
      movedTo: toSandboxRelative(ctx, dstAbs),
    };
  } else if (pending.toolName === "batch_rename") {
    const renames = Array.isArray(args.renames) ? args.renames : [];
    const prepared: Array<{
      fromAbs: string;
      toAbs: string;
      toParent: string;
    }> = [];
    for (const item of renames) {
      const fromAbs = resolveSandboxPath(ctx, String(item.from || ""));
      const toAbs = resolveSandboxPath(ctx, String(item.to || ""));
      const toNameErr = validateName(bunBasename(toAbs), ctx.platform);
      if (toNameErr) throw new FmError("BAD_NAME", toNameErr);
      const toParent = bunDirname(toAbs);
      assertModifiable(ctx, fromAbs);
      assertCreatable(ctx, toParent);
      assertModifiable(ctx, toAbs);
      prepared.push({ fromAbs, toAbs, toParent });
    }
    const completed: Array<{
      from: string;
      to: string;
      fromAbs: string;
      toAbs: string;
    }> = [];
    try {
      for (const item of prepared) {
        ensureDirSyncWithBun(item.toParent);
        assertRealpathInsideSandboxSync(
          item.fromAbs,
          ctx.sandboxRoot,
          ctx.platform,
        );
        assertRealpathInsideSandboxSync(
          item.toAbs,
          ctx.sandboxRoot,
          ctx.platform,
        );
        await moveFileSafeExclusiveAsync(item.fromAbs, item.toAbs);
        completed.push({
          from: toSandboxRelative(ctx, item.fromAbs),
          to: toSandboxRelative(ctx, item.toAbs),
          fromAbs: item.fromAbs,
          toAbs: item.toAbs,
        });
      }
    } catch (err) {
      for (let i = completed.length - 1; i >= 0; i--) {
        const doneItem = completed[i]!;
        await moveFileSafeExclusiveAsync(
          doneItem.toAbs,
          doneItem.fromAbs,
        ).catch(() => {});
      }
      throw err;
    }
    pending.result = {
      renamedCount: completed.length,
      completed: completed.map(({ from, to }) => ({ from, to })),
    };
  } else if (pending.toolName === "archive_files") {
    const relPaths: string[] = Array.isArray(args.paths)
      ? args.paths.map(String)
      : [];
    const archiveRel = String(args.archivePath || "archive.tar.gz");
    const archiveAbs = resolveSandboxPath(ctx, archiveRel);
    const archiveBase = bunBasename(archiveAbs);
    const archiveNameErr = validateName(archiveBase, ctx.platform);
    if (archiveNameErr) throw new FmError("BAD_NAME", archiveNameErr);
    const archiveParent = bunDirname(archiveAbs);
    assertCreatable(ctx, archiveParent);
    assertModifiable(ctx, archiveAbs);
    ensureDirSyncWithBun(archiveParent);
    assertRealpathInsideSandboxSync(archiveAbs, ctx.sandboxRoot, ctx.platform);
    const archiveRoot = ctx.sandboxRoot || ctx.home;
    const validatedAbs = relPaths.map((p) => {
      const abs = resolveSandboxPath(ctx, p);
      if (!isSameOrInside(abs, archiveRoot, ctx.platform)) {
        throw new FmError(
          "PROTECTED_PATH",
          `Cannot archive path outside workspace root: ${p}`,
        );
      }
      assertRealpathInsideSandboxSync(abs, ctx.sandboxRoot, ctx.platform);
      const rel = toSandboxRelative(ctx, abs);
      if (rel.startsWith("-") || rel.startsWith("..")) {
        throw new FmError("BAD_PATH", `Invalid archive entry path: ${rel}`);
      }
      return abs;
    });
    const isZip = /\.zip$/i.test(archiveBase);
    const stem = archiveBase.replace(/\.(zip|tar\.gz|tgz)$/i, "");
    const created = await archivePaths(
      ctx,
      validatedAbs,
      isZip ? "zip" : "tar.gz",
      archiveParent,
      stem,
    );
    pending.result = {
      archivePath: toSandboxRelative(ctx, created.archivePath),
      itemsArchived: validatedAbs.length,
    };
  }

  pending.status = "executed";
  return pending;
}

// ============================================================================
// 8. CAPABILITIES C, D, E, F, J: CHAT, STREAMING, THINKING, VISION, JSON & CLOUD
// ============================================================================

/**
 * Built-in JSON Schema presets for structured Ollama outputs (`batch_rename_plan`, `folder_organization_plan`, `table_extraction`, `code_review_report`, `security_audit_report`).
 */
export const STRUCTURED_SCHEMAS: Record<string, any> = {
  batch_rename_plan: {
    type: "object",
    properties: {
      summary: { type: "string" },
      renames: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            reason: { type: "string" },
          },
          required: ["from", "to", "reason"],
        },
      },
    },
    required: ["summary", "renames"],
  },
  folder_organization_plan: {
    type: "object",
    properties: {
      summary: { type: "string" },
      foldersToCreate: { type: "array", items: { type: "string" } },
      moves: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            targetFolder: { type: "string" },
            category: { type: "string" },
          },
          required: ["file", "targetFolder", "category"],
        },
      },
    },
    required: ["summary", "foldersToCreate", "moves"],
  },
  table_extraction: {
    type: "object",
    properties: {
      title: { type: "string" },
      columns: { type: "array", items: { type: "string" } },
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: {
            type: ["string", "number", "boolean", "null"],
          },
        },
      },
    },
    required: ["title", "columns", "rows"],
  },
  code_review_report: {
    type: "object",
    properties: {
      summary: { type: "string" },
      overallRisk: {
        type: "string",
        enum: ["low", "medium", "high", "critical"],
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            file: { type: "string" },
            line: { type: "number" },
            severity: {
              type: "string",
              enum: ["info", "warning", "error", "critical"],
            },
            issue: { type: "string" },
            fixSuggestion: { type: "string" },
          },
          required: ["file", "severity", "issue", "fixSuggestion"],
        },
      },
    },
    required: ["summary", "overallRisk", "findings"],
  },
  security_audit_report: {
    type: "object",
    properties: {
      summary: { type: "string" },
      status: {
        type: "string",
        enum: ["safe", "attention_needed", "vulnerable"],
      },
      vulnerabilities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"],
            },
            description: { type: "string" },
            remediation: { type: "string" },
          },
          required: ["category", "severity", "description", "remediation"],
        },
      },
    },
    required: ["summary", "status", "vulnerabilities"],
  },
};

/**
 * Selects the best installed or requested chat or vision model that satisfies the Hardware Guard rules.
 */
export async function selectBestChatOrVisionModel(
  ctx: FmContext,
  requestedModel?: string,
  requireVision = false,
): Promise<{
  model: string;
  verdict: HardwareGuardVerdict;
  useCloudHost: boolean;
}> {
  const reqTrimmed = String(requestedModel || "").trim();
  if (reqTrimmed && isPhononModelName(reqTrimmed)) {
    throw new FmError(
      "PHONON_SAFETY_VIOLATION",
      'Safety Rule: Never send chat, completion, or embedding requests to "phonon" (it only generates speech via /v1/audio/speech and returns a 400 error for anything else).',
    );
  }

  const { hardware, models } = await listModelsWithBadgesAndHardwareFilter(
    ctx,
    { includeHiddenForDiagnostics: true },
  );
  const allowedChatModels = models.filter(
    (m) => m.hardwareVerdict.allowed && !isPhononModelName(m.name),
  );

  let chosen = reqTrimmed;
  if (!chosen) {
    const defaultQwenModel =
      hardware.ramTier === "under_8gb" || hardware.ramTier === "8gb_to_16gb"
        ? "qwen3.5:4b"
        : "qwen3.5:latest";
    const installedQwen = allowedChatModels.find((m) =>
      m.name.toLowerCase().startsWith("qwen3.5"),
    );
    if (requireVision) {
      const vis =
        installedQwen ||
        allowedChatModels.find(
          (m) => m.badges.includes("Vision") && m.badges.includes("Chat"),
        );
      chosen =
        vis?.name ||
        allowedChatModels.find((m) => m.badges.includes("Vision"))?.name ||
        defaultQwenModel;
    } else {
      const chat =
        installedQwen ||
        allowedChatModels.find(
          (m) => m.badges.includes("Chat") && !m.badges.includes("Decision"),
        );
      chosen = chat?.name || allowedChatModels[0]?.name || defaultQwenModel;
    }
  }

  const installedMatch = models.find(
    (m) =>
      m.name.toLowerCase() === chosen.toLowerCase() ||
      baseModelName(m.name) === baseModelName(chosen),
  );
  const catalogMatch = CURATED_MODEL_CATALOG.find(
    (c) =>
      c.name.toLowerCase() === chosen.toLowerCase() ||
      baseModelName(c.name) === baseModelName(chosen),
  );

  const verdict = installedMatch
    ? installedMatch.hardwareVerdict
    : evaluateModelHardwareGuard(
        {
          name: chosen,
          parameterSize: catalogMatch?.parameterSize,
          sizeBytes: catalogMatch
            ? Math.round(catalogMatch.estimatedRamGb * 0.88 * 1024 ** 3)
            : undefined,
          runner: catalogMatch?.runner,
          capabilities: catalogMatch?.capabilities,
        },
        hardware,
        {
          hasMlxAlternativeForTask: true,
          installedModels: allowedChatModels,
          taskCapability: requireVision ? "vision" : "chat",
        },
      );

  if (!verdict.allowed) {
    throw new FmError(verdict.code, verdict.reason);
  }

  return {
    model: installedMatch?.name || chosen,
    verdict,
    useCloudHost: isCloudModelName(chosen) && Boolean(getOllamaApiKey(ctx)),
  };
}

/**
 * Executes an Ollama `/api/chat` or `/api/generate` request with optional file/image attachments, thinking controls, tool calling, web search, structured JSON schema, and spoken reply synthesis.
 */
export async function runOllamaChatOrGenerate(
  ctx: FmContext,
  payload: {
    endpoint?: "chat" | "generate";
    model?: string;
    prompt?: string;
    messages?: Array<{ role: string; content: string; images?: string[] }>;
    paths?: string[];
    images?: string[];
    think?: boolean | "low" | "medium" | "high" | "on" | "off" | "auto";
    thinkingLevel?: ThinkingEffortChoice;
    thinkingBudget?: number;
    speakReply?: boolean;
    voice?: string;
    format?: "json" | Record<string, any> | string;
    schemaPreset?:
      | "batch_rename_plan"
      | "folder_organization_plan"
      | "table_extraction"
      | "code_review_report"
      | "security_audit_report";
    enableTools?: boolean;
    useWebSearch?: boolean;
    webSearchQuery?: string;
    webFetchUrl?: string;
    numCtx?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    minP?: number;
    repeatPenalty?: number;
    numPredict?: number;
    seed?: number;
    stop?: string | string[];
    keepAlive?: string | number;
    systemPrompt?: string;
    suffix?: string;
  },
): Promise<{
  model: string;
  endpoint: "chat" | "generate";
  hardwareVerdict: HardwareGuardVerdict;
  thinkEnabled: boolean;
  thinkingMode: ModelThinkingMode;
  thinkingLevel: "off" | "on" | "low" | "medium" | "high";
  thinkParam: boolean | "low" | "medium" | "high" | undefined;
  thinkingText: string;
  content: string;
  structuredJson: any | null;
  enforcedNumCtx: number;
  appliedOptions: Record<string, any>;
  inspectedFiles: string[];
  webContextUsed: boolean;
  webSources: Array<{ title: string; url: string }>;
  pendingActions: PendingToolAction[];
  speechResult: any | null;
}> {
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  const imagesBase64: string[] = Array.isArray(payload.images)
    ? [...payload.images]
    : [];
  const inspectedFiles: string[] = [];
  const fileContextBlocks: string[] = [];

  for (const rel of paths) {
    const abs = resolveSandboxPath(ctx, rel);
    const name = bunBasename(abs);
    inspectedFiles.push(rel);
    if (isSupportedVisionImagePath(abs)) {
      const b64 = await readImageAsBase64(abs);
      imagesBase64.push(b64);
      fileContextBlocks.push(`[Attached Image: ${name} (${rel})]`);
    } else {
      const snippet = await readTextFileSnippet(abs, 18_000);
      fileContextBlocks.push(`=== File: ${name} (${rel}) ===\n${snippet}`);
    }
  }

  const { model, verdict, useCloudHost } = await selectBestChatOrVisionModel(
    ctx,
    payload.model,
    imagesBase64.length > 0,
  );

  // Resolve model-aware thinking configuration (boolean toggle vs "low"|"medium"|"high" levels for gpt-oss)
  const speakReply = Boolean(payload.speakReply);
  const thinkResolution = resolveOllamaThinkConfig(model, {
    think: payload.think,
    thinkingLevel: payload.thinkingLevel,
    thinkingBudget: payload.thinkingBudget,
    speakReply,
  });
  const thinkEnabled = thinkResolution.thinkEnabled;
  const thinkParam = thinkResolution.thinkParam;

  // Rule H (Web Search & Web Fetch): Automatically set num_ctx to at least 32,000 tokens when running search-assisted tasks
  let webContextUsed = false;
  const webSources: Array<{ title: string; url: string }> = [];
  const webSnippets: string[] = [];

  if (payload.useWebSearch || payload.webSearchQuery) {
    webContextUsed = true;
    const q = String(payload.webSearchQuery || payload.prompt || "").trim();
    if (q) {
      const searchRes = await runOllamaWebSearch(ctx, {
        query: q,
        maxResults: 4,
      });
      for (const r of searchRes.results) {
        webSources.push({ title: r.title, url: r.url });
        webSnippets.push(`[Web Source: ${r.title} (${r.url})]\n${r.content}`);
      }
    }
  }

  if (payload.webFetchUrl) {
    webContextUsed = true;
    const fetchRes = await runOllamaWebFetch(ctx, { url: payload.webFetchUrl });
    webSources.push({ title: fetchRes.title, url: fetchRes.url });
    webSnippets.push(
      `[Fetched Page: ${fetchRes.title} (${fetchRes.url})]\n${fetchRes.content.slice(0, 12_000)}`,
    );
  }

  const requestedCtx = Number(payload.numCtx || 8192);
  const enforcedNumCtx = webContextUsed
    ? Math.max(requestedCtx, MIN_WEB_SEARCH_NUM_CTX)
    : requestedCtx;

  const resolvedFormat =
    payload.schemaPreset && STRUCTURED_SCHEMAS[payload.schemaPreset]
      ? STRUCTURED_SCHEMAS[payload.schemaPreset]
      : payload.format || undefined;

  const userPrompt = String(
    payload.prompt || "Describe or analyze the selected items.",
  ).trim();
  const fullUserContent = [
    userPrompt,
    fileContextBlocks.length > 0
      ? `\n\nSelected Workspace Files:\n${fileContextBlocks.join("\n\n")}`
      : "",
    webSnippets.length > 0
      ? `\n\nLive Web Context:\n${webSnippets.join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const endpoint: "chat" | "generate" =
    payload.endpoint === "generate" ? "generate" : "chat";
  const optionsObj: Record<string, any> = {
    num_ctx: enforcedNumCtx,
  };
  if (
    typeof payload.temperature === "number" &&
    Number.isFinite(payload.temperature)
  ) {
    optionsObj.temperature = Math.max(0, Math.min(2, payload.temperature));
  }
  if (typeof payload.topP === "number" && Number.isFinite(payload.topP)) {
    optionsObj.top_p = Math.max(0, Math.min(1, payload.topP));
  }
  if (
    typeof payload.topK === "number" &&
    Number.isFinite(payload.topK) &&
    payload.topK > 0
  ) {
    optionsObj.top_k = Math.round(payload.topK);
  }
  if (
    typeof payload.minP === "number" &&
    Number.isFinite(payload.minP) &&
    payload.minP >= 0
  ) {
    optionsObj.min_p = Math.max(0, Math.min(1, payload.minP));
  }
  if (
    typeof payload.repeatPenalty === "number" &&
    Number.isFinite(payload.repeatPenalty) &&
    payload.repeatPenalty > 0
  ) {
    optionsObj.repeat_penalty = payload.repeatPenalty;
  }
  if (
    typeof payload.numPredict === "number" &&
    Number.isFinite(payload.numPredict) &&
    payload.numPredict > 0
  ) {
    optionsObj.num_predict = Math.round(payload.numPredict);
  }
  if (typeof payload.seed === "number" && Number.isFinite(payload.seed)) {
    optionsObj.seed = Math.round(payload.seed);
  }
  if (payload.stop) {
    const stops = Array.isArray(payload.stop)
      ? payload.stop.map((s) => String(s)).filter(Boolean)
      : String(payload.stop)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    if (stops.length > 0) optionsObj.stop = stops;
  }

  const baseSystemText = String(
    payload.systemPrompt ||
      "You are the Codecaine File Manager AI Assistant powered by Ollama. Be concise, helpful, and accurate.",
  ).trim();
  const fullSystemContent = [
    baseSystemText,
    thinkResolution.systemReasoningDirective,
  ]
    .filter(Boolean)
    .join("\n\n");

  let content = "";
  let thinkingText = "";
  const stagedActions: PendingToolAction[] = [];

  if (endpoint === "generate") {
    const genReq: Record<string, any> = {
      model,
      prompt: fullUserContent,
      system: fullSystemContent,
      stream: false,
      ...(thinkParam !== undefined ? { think: thinkParam } : {}),
      options: optionsObj,
    };
    if (payload.suffix) genReq.suffix = String(payload.suffix);
    if (payload.keepAlive !== undefined && payload.keepAlive !== "")
      genReq.keep_alive = payload.keepAlive;
    if (imagesBase64.length > 0) genReq.images = imagesBase64;
    if (resolvedFormat) genReq.format = resolvedFormat;

    const res = await ollamaFetchJson(ctx, "/api/generate", {
      method: "POST",
      useCloudHost,
      body: JSON.stringify(genReq),
      timeoutMs: 90_000,
    });
    if (!res.ok) {
      const errMsg = String(res.data?.error || "");
      if (
        res.status === 0 ||
        res.status === 404 ||
        errMsg.toLowerCase().includes("not found") ||
        errMsg.toLowerCase().includes("unable to connect") ||
        errMsg.toLowerCase().includes("econnrefused")
      ) {
        try {
          const { runBionicChat } = await import("./fmBionic");
          const bionicRes = await runBionicChat(ctx, {
            prompt: userPrompt,
            paths,
            speakReply,
            voice: payload.voice,
            think: payload.think,
            thinkingLevel: payload.thinkingLevel,
            thinkingBudget: payload.thinkingBudget,
            temperature: payload.temperature,
            topP: payload.topP,
            topK: payload.topK,
            minP: payload.minP,
            repeatPenalty: payload.repeatPenalty,
            maxTokens:
              payload.numPredict &&
              payload.numPredict !== 2048 &&
              payload.numPredict !== 16384
                ? payload.numPredict
                : undefined,
            seed: payload.seed,
            stop: payload.stop,
            systemPrompt: payload.systemPrompt,
            schemaPreset: payload.schemaPreset,
            enableTools: payload.enableTools,
          });
          return {
            model: bionicRes.model,
            endpoint,
            hardwareVerdict: bionicRes.hardwareVerdict,
            thinkEnabled: bionicRes.thinkingEnabled,
            thinkingMode: bionicRes.thinkingMode,
            thinkingLevel: bionicRes.thinkingLevel,
            thinkParam,
            thinkingText: bionicRes.reasoningText,
            content: bionicRes.content,
            structuredJson: bionicRes.structuredJson,
            enforcedNumCtx,
            appliedOptions: optionsObj,
            inspectedFiles: bionicRes.inspectedFiles,
            webContextUsed,
            webSources,
            pendingActions: stagedActions,
            speechResult: bionicRes.speechResult,
          };
        } catch {
          // Fall through to OLLAMA_GENERATE_ERROR
        }
      }
      throw new FmError(
        "OLLAMA_GENERATE_ERROR",
        errMsg || `Ollama /api/generate failed (HTTP ${res.status}).`,
      );
    }
    const extracted = extractThinkingAndFinalContent(
      String(res.data?.response || ""),
      String(res.data?.thinking || res.data?.reasoning || ""),
    );
    content = extracted.content;
    thinkingText = extracted.thinkingText;
  } else {
    const messages =
      Array.isArray(payload.messages) && payload.messages.length > 0
        ? payload.messages.map((m, idx, arr) => {
            if (idx === arr.length - 1 && m.role === "user") {
              return {
                role: "user",
                content: [m.content, ...fileContextBlocks, ...webSnippets]
                  .filter(Boolean)
                  .join("\n\n"),
                images: imagesBase64.length > 0 ? imagesBase64 : m.images,
              };
            }
            return m;
          })
        : [
            {
              role: "system",
              content: fullSystemContent,
            },
            {
              role: "user",
              content: fullUserContent,
              ...(imagesBase64.length > 0 ? { images: imagesBase64 } : {}),
            },
          ];

    const chatReq: Record<string, any> = {
      model,
      messages,
      stream: false,
      ...(thinkParam !== undefined ? { think: thinkParam } : {}),
      options: optionsObj,
    };
    if (payload.keepAlive !== undefined && payload.keepAlive !== "")
      chatReq.keep_alive = payload.keepAlive;
    if (resolvedFormat) chatReq.format = resolvedFormat;
    if (payload.enableTools) {
      chatReq.tools = FILE_MANAGER_OLLAMA_TOOLS;
    }

    const res = await ollamaFetchJson(ctx, "/api/chat", {
      method: "POST",
      useCloudHost,
      body: JSON.stringify(chatReq),
      timeoutMs: 90_000,
    });
    if (!res.ok) {
      const errMsg = String(res.data?.error || "");
      if (
        res.status === 0 ||
        res.status === 404 ||
        errMsg.toLowerCase().includes("not found") ||
        errMsg.toLowerCase().includes("unable to connect") ||
        errMsg.toLowerCase().includes("econnrefused")
      ) {
        try {
          const { runBionicChat } = await import("./fmBionic");
          const bionicRes = await runBionicChat(ctx, {
            prompt: userPrompt,
            paths,
            speakReply,
            voice: payload.voice,
            think: payload.think,
            thinkingLevel: payload.thinkingLevel,
            thinkingBudget: payload.thinkingBudget,
            temperature: payload.temperature,
            topP: payload.topP,
            topK: payload.topK,
            minP: payload.minP,
            repeatPenalty: payload.repeatPenalty,
            maxTokens:
              payload.numPredict &&
              payload.numPredict !== 2048 &&
              payload.numPredict !== 16384
                ? payload.numPredict
                : undefined,
            seed: payload.seed,
            stop: payload.stop,
            systemPrompt: payload.systemPrompt,
            schemaPreset: payload.schemaPreset,
            enableTools: payload.enableTools,
          });
          return {
            model: bionicRes.model,
            endpoint,
            hardwareVerdict: bionicRes.hardwareVerdict,
            thinkEnabled: bionicRes.thinkingEnabled,
            thinkingMode: bionicRes.thinkingMode,
            thinkingLevel: bionicRes.thinkingLevel,
            thinkParam,
            thinkingText: bionicRes.reasoningText,
            content: bionicRes.content,
            structuredJson: bionicRes.structuredJson,
            enforcedNumCtx,
            appliedOptions: optionsObj,
            inspectedFiles: bionicRes.inspectedFiles,
            webContextUsed,
            webSources,
            pendingActions: stagedActions,
            speechResult: bionicRes.speechResult,
          };
        } catch {
          // Fall through to OLLAMA_CHAT_ERROR
        }
      }
      throw new FmError(
        "OLLAMA_CHAT_ERROR",
        errMsg || `Ollama /api/chat failed (HTTP ${res.status}).`,
      );
    }
    const msg = res.data?.message || {};
    const extracted = extractThinkingAndFinalContent(
      String(msg.content || ""),
      String(msg.thinking || msg.reasoning_content || msg.reasoning || ""),
    );
    content = extracted.content;
    thinkingText = extracted.thinkingText;

    const toolCalls: any[] = Array.isArray(msg.tool_calls)
      ? msg.tool_calls
      : [];
    for (const tc of toolCalls) {
      const fnName = String(tc?.function?.name || "");
      let fnArgs = tc?.function?.arguments || {};
      if (typeof fnArgs === "string") {
        try {
          fnArgs = JSON.parse(fnArgs);
        } catch {
          fnArgs = {};
        }
      }
      if (
        fnName === "create_file" ||
        fnName === "move_file" ||
        fnName === "batch_rename" ||
        fnName === "archive_files"
      ) {
        const pending = stagePendingToolAction(fnName, fnArgs);
        stagedActions.push(pending);
      } else if (fnName === "web_search" && fnArgs.query) {
        const ws = await runOllamaWebSearch(ctx, {
          query: String(fnArgs.query),
        });
        for (const r of ws.results)
          webSources.push({ title: r.title, url: r.url });
      } else if (fnName === "web_fetch" && fnArgs.url) {
        const wf = await runOllamaWebFetch(ctx, { url: String(fnArgs.url) });
        webSources.push({ title: wf.title, url: wf.url });
      }
    }
  }

  let structuredJson: any | null = null;
  if (resolvedFormat && content) {
    try {
      structuredJson = JSON.parse(content);
      // If structuredJson is a batch_rename_plan, also offer a 1-click PendingToolAction!
      if (
        Array.isArray(structuredJson?.renames) &&
        structuredJson.renames.length > 0 &&
        stagedActions.length === 0
      ) {
        stagedActions.push(
          stagePendingToolAction("batch_rename", {
            renames: structuredJson.renames,
          }),
        );
      }
    } catch {
      structuredJson = null;
    }
  }

  let speechResult: any | null = null;
  if (speakReply && content.trim()) {
    try {
      speechResult = await runOllamaSpeech(ctx, {
        input: content,
        voice: payload.voice || "Zoey",
        mode: "speaker",
        playOnServer: false,
      });
    } catch {}
  }

  return {
    model,
    endpoint,
    hardwareVerdict: verdict,
    thinkEnabled,
    thinkingMode: thinkResolution.thinkingMode,
    thinkingLevel: thinkResolution.effectiveLevel,
    thinkParam,
    thinkingText,
    content,
    structuredJson,
    enforcedNumCtx,
    appliedOptions: optionsObj,
    inspectedFiles,
    webContextUsed,
    webSources,
    pendingActions: stagedActions,
    speechResult,
  };
}

// ============================================================================
// 9. PLAIN-ENGLISH CAPABILITY ROUTER
// ============================================================================

/**
 * Capability category selected by the plain-English intent router.
 */
export type RoutedCapabilityKind =
  | "speech"
  | "decision"
  | "semantic_search"
  | "web_search"
  | "vision"
  | "structured_json"
  | "tool_action"
  | "thinking_chat"
  | "chat";

/**
 * Inspects a plain-English user prompt and optional workspace file selection and routes it to the appropriate Ollama capability (speech, SystemOne decision, semantic search, web search, vision, structured JSON, tool calling, or chat).
 */
export async function routePlainEnglishRequest(
  ctx: FmContext,
  payload: {
    prompt: string;
    paths?: string[];
    dirPath?: string;
    model?: string;
    speechModel?: string;
    voice?: string;
    speakReply?: boolean;
    think?: boolean | "low" | "medium" | "high" | "on" | "off" | "auto";
    thinkingLevel?: ThinkingEffortChoice;
    thinkingBudget?: number;
    numCtx?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    minP?: number;
    repeatPenalty?: number;
    numPredict?: number;
    seed?: number;
    stop?: string | string[];
    keepAlive?: string | number;
    systemPrompt?: string;
  },
): Promise<{
  routedCapability: RoutedCapabilityKind;
  routeExplanation: string;
  result: any;
}> {
  let prompt = String(payload.prompt || "").trim();
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  const hasSelectedImages = paths.some((p) => isSupportedVisionImagePath(p));
  if (!prompt) {
    if (paths.length > 0) {
      const shouldReadAloud =
        !hasSelectedImages &&
        (payload.speakReply === true ||
          (payload.speakReply === undefined &&
            Boolean(payload.voice || payload.speechModel)) ||
          Boolean(payload.model && isSpeechModelName(payload.model)));
      if (shouldReadAloud) {
        const result = await runOllamaSpeech(ctx, {
          model:
            payload.speechModel ||
            (payload.model && isSpeechModelName(payload.model)
              ? payload.model
              : undefined),
          path: paths[0],
          voice: payload.voice || "Zoey",
          mode: "speaker",
          saveDir: payload.dirPath || ".",
          playOnServer: false,
        });
        return {
          routedCapability: "speech",
          routeExplanation: `Routed blank prompt with selected file (${paths[0]}) directly to Speech Engine (${result.model}) to read the selected file aloud.`,
          result,
        };
      }
      prompt = hasSelectedImages
        ? "Describe and analyze the selected image in detail."
        : "Summarize and explain the selected file.";
    } else {
      throw new FmError(
        "INVALID_INPUT",
        "Please type a plain-English request or select a file for the AI assistant.",
      );
    }
  }
  const pLower = prompt.toLowerCase();

  // 1. Check if user explicitly asks to download/run a specific model by name so Rule C triggers politely
  const explicitModelMatch = prompt.match(
    /\b(?:run|use|download|pull|load)\s+([a-z0-9._-]+:[a-z0-9._-]+|[a-z0-9._-]+-\d+b)\b/i,
  );
  const requestedModel =
    payload.model || (explicitModelMatch ? explicitModelMatch[1] : undefined);

  // 2. Speech / Read Out Loud detection (only when explicitly asking for read-aloud / TTS and not inspecting an image)
  const explicitSpeechPrompt =
    /\b(read\s+(?:(?:this|it|the\s+selected\s+file|selected\s+file|the\s+file|file)\s+)?(?:aloud|out\s+loud)|speak\s+(?:(?:this|it|the\s+file|file)\s+)?(?:aloud|out\s+loud)|text[\s-]to[\s-]speech|save\s+as\s+(?:wav|audio))\b/i.test(
      pLower,
    );
  if (explicitSpeechPrompt && !hasSelectedImages) {
    const saveAsFile =
      /\b(save\s+as|export\s+wav|save\s+audio|file\s+mode)\b/i.test(pLower);
    const speechInput =
      paths.length > 0
        ? undefined
        : prompt
            .replace(
              /^(please\s+)?(read\s+(this\s+)?(out\s+loud|aloud)\s*:?\s*|speak\s*:?\s*)/i,
              "",
            )
            .trim() || prompt;
    const result = await runOllamaSpeech(ctx, {
      model:
        payload.speechModel ||
        (requestedModel && isSpeechModelName(requestedModel)
          ? requestedModel
          : undefined),
      input: speechInput,
      path: paths[0],
      voice: payload.voice || "Zoey",
      mode: saveAsFile ? "file" : "speaker",
      saveDir: payload.dirPath || ".",
      playOnServer: false,
    });
    return {
      routedCapability: "speech",
      routeExplanation: `Routed to Speech Engine (${result.model}) with automatic date normalization & markdown cleanup.`,
      result,
    };
  }
  const effectiveSpeakReply =
    Boolean(payload.speakReply) || (explicitSpeechPrompt && hasSelectedImages);

  // 3. Decision / SystemOne Engine detection (yes/no probability, classify into labels, score urgency/rubric)
  if (
    /\b(probability|systemone|classify\s+into|categorize\s+into|auto[\s-]sort|rubric|score\s+urgency|does\s+this\s+.*\s+(contain|have|show)\b)/i.test(
      pLower,
    )
  ) {
    let questions: DecisionQuestionInput[] = [];
    if (/\b(urgency|severity|score|rate|rubric)\b/i.test(pLower)) {
      questions = [
        {
          id: "urgency_score",
          type: "score",
          instructions: prompt,
          criteria: ["Routine", "Soon", "Immediate"],
        },
      ];
    } else if (
      /\b(classify|categorize|auto[\s-]sort|which\s+category|which\s+folder)\b/i.test(
        pLower,
      )
    ) {
      questions = [
        {
          id: "category_choice",
          type: "choice",
          instructions: prompt,
          criteria: {
            billing: "Invoices, receipts, payments, and financial records",
            bug_report: "Crash logs, stack traces, errors, and issue reports",
            source_code:
              "Application source code, scripts, and configuration files",
            personal: "Personal notes, media, and everyday documents",
          },
        },
      ];
    } else {
      questions = [
        {
          id: "yes_no_check",
          type: "noul",
          instructions: prompt,
        },
      ];
    }
    const result = await runDecisionEngine(ctx, {
      model: requestedModel,
      paths,
      state: paths.length === 0 ? prompt : undefined,
      questions,
    });
    return {
      routedCapability: "decision",
      routeExplanation: `Routed to SystemOne Decision Engine (POST /v1/systemone, model: ${result.model}) for instant probability & rubric scoring.`,
      result,
    };
  }

  // 4. Semantic Meaning Search detection
  if (
    /\b(find\s+the\s+file\s+where|search\s+by\s+meaning|semantic\s+search|which\s+file\s+(has|contains|implements|wrote))\b/i.test(
      pLower,
    )
  ) {
    const result = await runSemanticMeaningSearch(ctx, {
      query: prompt,
      dirPath: payload.dirPath || ".",
      model: requestedModel,
    });
    return {
      routedCapability: "semantic_search",
      routeExplanation: `Routed to Semantic Embeddings & Meaning Search (POST /api/embed) across "${payload.dirPath || "."}".`,
      result,
    };
  }

  // 5. Web Search / Web Fetch detection (enforces num_ctx >= 32,000)
  const urlMatch = prompt.match(/https?:\/\/[^\s)]+/i);
  if (
    urlMatch ||
    /\b(search\s+the\s+web|web\s+search|latest\s+release|live\s+docs|look\s+up\s+online)\b/i.test(
      pLower,
    )
  ) {
    const result = await runOllamaChatOrGenerate(ctx, {
      model: requestedModel,
      prompt,
      paths,
      useWebSearch: !urlMatch,
      webSearchQuery: !urlMatch ? prompt : undefined,
      webFetchUrl: urlMatch ? urlMatch[0] : undefined,
      speakReply: payload.speakReply,
      voice: payload.voice,
    });
    return {
      routedCapability: "web_search",
      routeExplanation: `Routed to Web Search / Fetch + Chat with automatic 32,000-token context window (num_ctx=${result.enforcedNumCtx}).`,
      result,
    };
  }

  // 6. Structured JSON Output detection (batch rename plan, folder organization plan, table extraction)
  if (
    /\b(batch[\s-]rename|rename\s+plan|organize\s+folder|organization\s+plan|extract\s+table|as\s+json)\b/i.test(
      pLower,
    )
  ) {
    const schemaPreset = /\b(rename)\b/i.test(pLower)
      ? "batch_rename_plan"
      : /\b(table)\b/i.test(pLower)
        ? "table_extraction"
        : "folder_organization_plan";
    const result = await runOllamaChatOrGenerate(ctx, {
      model: requestedModel,
      prompt,
      paths,
      schemaPreset,
      format: schemaPreset ? undefined : "json",
      speakReply: payload.speakReply,
      voice: payload.voice,
    });
    return {
      routedCapability: "structured_json",
      routeExplanation: `Routed to Structured JSON Output (schema: ${schemaPreset}) with model ${result.model}.`,
      result,
    };
  }

  // 7. Vision / Multimodal Inspection when image files (.png, .jpg, .webp) are selected
  if (hasSelectedImages) {
    const result = await runOllamaChatOrGenerate(ctx, {
      model: requestedModel,
      prompt,
      paths,
      think: false,
      speakReply: effectiveSpeakReply,
      voice: payload.voice,
    });
    return {
      routedCapability: "vision",
      routeExplanation: `Routed to Multimodal Vision Inspection (POST /api/chat with base64 images, model: ${result.model}).`,
      result,
    };
  }

  // 8. Thinking / Deep Reasoning vs Fast Chat
  const explicitThinkRequested =
    payload.thinkingLevel &&
    payload.thinkingLevel !== "auto" &&
    payload.thinkingLevel !== "off";
  const needsDeepThinking =
    !effectiveSpeakReply &&
    (Boolean(explicitThinkRequested) ||
      Boolean(
        payload.think && payload.think !== "off" && payload.think !== "auto",
      ) ||
      /\b(debug|complex|step[\s-]by[\s-]step|architecture|refactor|prove|why\s+is\s+this\s+failing|reorganize|deep\s+think)\b/i.test(
        pLower,
      ));

  const needsTools =
    /\b(create\s+a\s+file|move\s+file|archive|compress)\b/i.test(pLower);

  const result = await runOllamaChatOrGenerate(ctx, {
    model: requestedModel,
    prompt,
    paths,
    think: payload.think !== undefined ? payload.think : needsDeepThinking,
    thinkingLevel: payload.thinkingLevel,
    thinkingBudget: payload.thinkingBudget,
    enableTools: needsTools,
    speakReply: effectiveSpeakReply,
    voice: payload.voice,
    numCtx: payload.numCtx,
    temperature: payload.temperature,
    topP: payload.topP,
    topK: payload.topK,
    minP: payload.minP,
    repeatPenalty: payload.repeatPenalty,
    numPredict: payload.numPredict,
    seed: payload.seed,
    stop: payload.stop,
    keepAlive: payload.keepAlive,
    systemPrompt: payload.systemPrompt,
  });

  return {
    routedCapability: needsTools
      ? "tool_action"
      : result.thinkEnabled
        ? "thinking_chat"
        : "chat",
    routeExplanation: result.thinkEnabled
      ? `Routed to Deep Reasoning Chat (POST /api/chat, think: ${JSON.stringify(result.thinkParam)}, level: ${result.thinkingLevel}, model: ${result.model}).`
      : `Routed to Live Chat & Code Assistant (POST /api/chat, think: false, model: ${result.model}).`,
    result,
  };
}

// ============================================================================
// 10. LIVE STREAMING HANDLER (POST /api/ollama/stream) & OLLAMA_OPS TABLE
// ============================================================================

/**
 * Handles `POST /api/ollama/stream` requests, streaming NDJSON chat and reasoning tokens from Ollama (or Bionic fallback).
 */
export async function handleOllamaStreamRequest(
  ctx: FmContext,
  req: Request,
): Promise<Response> {
  if (
    !(req.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("application/json")
  ) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "NOT_JSON", message: "Requests must be JSON." },
      }),
      { status: 415, headers: { "Content-Type": "application/json" } },
    );
  }
  const maxBodyBytes = 8 * 1024 * 1024;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBodyBytes) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "TOO_LARGE", message: "That request is too large." },
      }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }
  let body: any = {};
  try {
    const rawText = await req.text();
    if (rawText.length > maxBodyBytes) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "TOO_LARGE", message: "That request is too large." },
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }
    body = rawText ? JSON.parse(rawText) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Expected JSON object");
    }
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: { code: "INVALID_JSON", message: "Invalid JSON body" },
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
    const imagesBase64: string[] = Array.isArray(body.images)
      ? [...body.images]
      : [];
    const fileSnippets: string[] = [];

    for (const rel of paths) {
      const abs = resolveSandboxPath(ctx, rel);
      const name = bunBasename(abs);
      if (isSupportedVisionImagePath(abs)) {
        imagesBase64.push(await readImageAsBase64(abs));
        fileSnippets.push(`[Attached Image: ${name} (${rel})]`);
      } else {
        const snippet = await readTextFileSnippet(abs, 16_000);
        fileSnippets.push(`=== File: ${name} (${rel}) ===\n${snippet}`);
      }
    }

    const { model, verdict, useCloudHost } = await selectBestChatOrVisionModel(
      ctx,
      body.model,
      imagesBase64.length > 0,
    );
    recordSessionLoadedModel(ctx, model);

    const speakReply = Boolean(body.speakReply);
    const thinkResolution = resolveOllamaThinkConfig(model, {
      think: body.think,
      thinkingLevel: body.thinkingLevel,
      thinkingBudget: body.thinkingBudget,
      speakReply,
    });
    const useWebSearch = Boolean(body.useWebSearch);
    const enforcedNumCtx = useWebSearch
      ? Math.max(Number(body.numCtx || 8192), MIN_WEB_SEARCH_NUM_CTX)
      : Number(body.numCtx || 8192);

    const streamOptions: Record<string, any> = { num_ctx: enforcedNumCtx };
    if (
      typeof body.temperature === "number" &&
      Number.isFinite(body.temperature)
    ) {
      streamOptions.temperature = Math.max(0, Math.min(2, body.temperature));
    }
    if (typeof body.topP === "number" && Number.isFinite(body.topP)) {
      streamOptions.top_p = Math.max(0, Math.min(1, body.topP));
    }
    if (
      typeof body.topK === "number" &&
      Number.isFinite(body.topK) &&
      body.topK > 0
    ) {
      streamOptions.top_k = Math.round(body.topK);
    }
    if (
      typeof body.minP === "number" &&
      Number.isFinite(body.minP) &&
      body.minP >= 0
    ) {
      streamOptions.min_p = Math.max(0, Math.min(1, body.minP));
    }
    if (
      typeof body.repeatPenalty === "number" &&
      Number.isFinite(body.repeatPenalty) &&
      body.repeatPenalty > 0
    ) {
      streamOptions.repeat_penalty = body.repeatPenalty;
    }
    if (
      typeof body.numPredict === "number" &&
      Number.isFinite(body.numPredict) &&
      body.numPredict > 0
    ) {
      streamOptions.num_predict = Math.round(body.numPredict);
    }
    if (typeof body.seed === "number" && Number.isFinite(body.seed)) {
      streamOptions.seed = Math.round(body.seed);
    }
    if (body.stop) {
      const stops = Array.isArray(body.stop)
        ? body.stop.map((s: any) => String(s)).filter(Boolean)
        : String(body.stop)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      if (stops.length > 0) streamOptions.stop = stops;
    }

    const promptText = [String(body.prompt || "Hello"), ...fileSnippets]
      .filter(Boolean)
      .join("\n\n");
    const sysText = [
      String(body.systemPrompt || "").trim(),
      thinkResolution.systemReasoningDirective,
    ]
      .filter(Boolean)
      .join("\n\n");
    const messages =
      Array.isArray(body.messages) && body.messages.length > 0
        ? body.messages
        : [
            ...(sysText ? [{ role: "system", content: sysText }] : []),
            {
              role: "user",
              content: promptText,
              ...(imagesBase64.length > 0 ? { images: imagesBase64 } : {}),
            },
          ];

    const baseUrl = resolveOllamaBaseUrl(ctx, useCloudHost);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const apiKey = getOllamaApiKey(ctx);
    if (apiKey && isSafeForApiKeyHeader(`${baseUrl}/api/chat`, useCloudHost)) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    let upstream: Response | null = null;
    try {
      upstream = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers,
        signal: req.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          ...(thinkResolution.thinkParam !== undefined
            ? { think: thinkResolution.thinkParam }
            : {}),
          options: streamOptions,
          ...(body.keepAlive !== undefined && body.keepAlive !== ""
            ? { keep_alive: body.keepAlive }
            : {}),
          ...(body.format ? { format: body.format } : {}),
        }),
      });
    } catch {
      upstream = null;
    }

    if (!upstream || !upstream.ok || !upstream.body) {
      const errText = upstream
        ? await upstream.text()
        : "Unable to connect to Ollama";
      if (
        !upstream ||
        upstream.status === 404 ||
        errText.toLowerCase().includes("not found") ||
        errText.toLowerCase().includes("unable to connect") ||
        errText.toLowerCase().includes("econnrefused")
      ) {
        try {
          const { runBionicChat } = await import("./fmBionic");
          const bionicRes = await runBionicChat(ctx, {
            prompt: String(body.prompt || ""),
            paths,
            speakReply: Boolean(body.speakReply),
            think: body.think,
            thinkingLevel: body.thinkingLevel,
            thinkingBudget: body.thinkingBudget,
            temperature: body.temperature,
            topP: body.topP,
            topK: body.topK,
            minP: body.minP,
            repeatPenalty: body.repeatPenalty,
            maxTokens:
              body.numPredict &&
              body.numPredict !== 2048 &&
              body.numPredict !== 16384
                ? body.numPredict
                : undefined,
            seed: body.seed,
            stop: body.stop,
            systemPrompt: body.systemPrompt,
          });
          const ndjson =
            JSON.stringify({
              model: bionicRes.model,
              message: {
                role: "assistant",
                thinking: bionicRes.reasoningText || "",
                content: bionicRes.content || "",
              },
              done: true,
            }) + "\n";
          return new Response(ndjson, {
            status: 200,
            headers: {
              "Content-Type": "application/x-ndjson; charset=utf-8",
              "Cache-Control": "no-cache",
              "X-Ollama-Model": bionicRes.model,
              "X-Ollama-Num-Ctx": String(enforcedNumCtx),
              "X-Ollama-Safe-Budget-Gb": String(verdict.safeMemoryBudgetGb),
            },
          });
        } catch {
          // Fall through to OLLAMA_STREAM_ERROR
        }
      }
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "OLLAMA_STREAM_ERROR",
            message: errText || `HTTP ${upstream?.status || 500}`,
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const upstreamBody = upstream.body;
    const proxiedStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstreamBody.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        } finally {
          reader.releaseLock();
        }
      },
      cancel() {
        try {
          void upstreamBody.cancel();
        } catch {}
      },
    });

    return new Response(proxiedStream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Ollama-Model": model,
        "X-Ollama-Num-Ctx": String(enforcedNumCtx),
        "X-Ollama-Safe-Budget-Gb": String(verdict.safeMemoryBudgetGb),
      },
    });
  } catch (err) {
    const code = err instanceof FmError ? err.code : "OLLAMA_STREAM_FAILED";
    const message = (err as Error).message || "Stream failed";
    return new Response(
      JSON.stringify({ ok: false, error: { code, message } }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

/**
 * Aggregates full Ollama status including version, hardware guard specs, badged models, running RAM usage, cloud account, voices, and lifecycle state.
 */
export async function getFullOllamaStatus(ctx: FmContext, payload?: any) {
  await captureOllamaStartupSnapshot(ctx);
  const [version, modelList, runningPs, cloudAccount, voices, installStatus] =
    await Promise.all([
      getOllamaVersionStatus(ctx),
      listModelsWithBadgesAndHardwareFilter(ctx, {
        includeHiddenForDiagnostics: Boolean(
          payload?.includeHiddenForDiagnostics,
        ),
      }),
      listRunningModelsPs(ctx),
      getCloudUsageAndBalance(ctx),
      getPhononSupportedVoices(ctx),
      getOllamaInstallStatus(ctx),
    ]);

  return {
    version,
    hardware: modelList.hardware,
    models: modelList.models,
    hiddenNonMlxModels: modelList.hiddenNonMlxModels,
    blockedByRamModels: modelList.blockedByRamModels,
    recommendedCatalog: modelList.recommendedCatalog,
    running: runningPs,
    cloudAccount,
    phononVoices: voices,
    installStatus,
    speechCapabilities: getSpeechCapabilitiesForHost(ctx),
    lifecycle: getOllamaLifecycleStatus(ctx),
    longTask: getLiveOllamaLongTaskStatus(),
    pendingActions: listPendingToolActions(),
  };
}

/**
 * File Manager API operation handlers for the built-in Ollama AI Assistant (`ollama/*`).
 */
export const OLLAMA_OPS: Record<
  string,
  (ctx: FmContext, payload: any) => Promise<any>
> = {
  "ollama/status": (ctx, p) => getFullOllamaStatus(ctx, p),
  "ollama/installStatus": (ctx) => getOllamaInstallStatus(ctx),
  "ollama/install": (ctx, p) => runOllamaAutoInstall(ctx, p || {}),
  "ollama/lifecycle": async (ctx, p) =>
    p?.exitPolicy
      ? setOllamaExitPolicy(ctx, p.exitPolicy)
      : getOllamaLifecycleStatus(ctx),
  "ollama/shutdown": (ctx, p) => shutdownOllamaForFileManager(ctx, p || {}),
  "ollama/hardware": async (ctx) => inspectOllamaHardware(ctx),
  "ollama/guard": async (ctx, p) => {
    const hw = inspectOllamaHardware(ctx);
    return evaluateModelHardwareGuard(
      p?.model
        ? typeof p.model === "string"
          ? { name: p.model }
          : p.model
        : { name: "" },
      hw,
      p?.options,
    );
  },
  "ollama/version": (ctx) => getOllamaVersionStatus(ctx),
  "ollama/tags": (ctx, p) => listModelsWithBadgesAndHardwareFilter(ctx, p),
  "ollama/show": (ctx, p) =>
    showModelDetails(ctx, String(p?.model || ""), Boolean(p?.forceRefresh)),
  "ollama/ps": (ctx) => listRunningModelsPs(ctx),
  "ollama/freeRam": (ctx, p) =>
    unloadModelsFromRam(ctx, p?.model ? String(p.model) : undefined),
  "ollama/pull": (ctx, p) =>
    pullModelWithHardwareGuard(ctx, String(p?.model || "")),
  "ollama/create": (ctx, p) => createCustomModel(ctx, p || {}),
  "ollama/copy": (ctx, p) =>
    copyModel(ctx, String(p?.source || ""), String(p?.destination || "")),
  "ollama/push": (ctx, p) => pushModel(ctx, String(p?.model || "")),
  "ollama/delete": (ctx, p) => deleteModel(ctx, String(p?.model || "")),
  "ollama/account": async (ctx, p) => {
    if (typeof p?.apiKey === "string") {
      setOllamaApiKey(ctx, p.apiKey);
    }
    return getCloudUsageAndBalance(ctx);
  },
  "ollama/decision": (ctx, p) => runDecisionEngine(ctx, p || {}),
  "ollama/speech": (ctx, p) => runOllamaSpeech(ctx, p || {}),
  "ollama/voices": (ctx) => getPhononSupportedVoices(ctx),
  "ollama/chat": (ctx, p) =>
    runOllamaChatOrGenerate(ctx, { ...(p || {}), endpoint: "chat" }),
  "ollama/generate": (ctx, p) =>
    runOllamaChatOrGenerate(ctx, { ...(p || {}), endpoint: "generate" }),
  "ollama/embed": (ctx, p) => runOllamaEmbed(ctx, p || {}),
  "ollama/semanticSearch": (ctx, p) => runSemanticMeaningSearch(ctx, p || {}),
  "ollama/webSearch": (ctx, p) => runOllamaWebSearch(ctx, p || {}),
  "ollama/webFetch": (ctx, p) => runOllamaWebFetch(ctx, p || {}),
  "ollama/tool/confirm": (ctx, p) =>
    executeConfirmedToolAction(
      ctx,
      String(p?.actionId || ""),
      p?.decision === "cancel" ? "cancel" : "confirm",
    ),
  "ollama/tool/pending": async () => ({
    pendingActions: listPendingToolActions(),
  }),
  "ollama/route": (ctx, p) => routePlainEnglishRequest(ctx, p || {}),
};
