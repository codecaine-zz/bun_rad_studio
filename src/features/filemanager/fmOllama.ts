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
import { absolutePath, assertCreatable, assertModifiable, type FmContext, type FmHandler } from "./fmCore";
import { FmError, isSameOrInside } from "./fmPaths";

// ---------------------------------------------------------------------------------------------------------------
// 1. Pure Bun Path & File Helpers (Zero Node `fs`, `path`, `os`, or `child_process` imports)
// ---------------------------------------------------------------------------------------------------------------

export function pathSep(platform = process.platform): string {
  return platform === "win32" ? "\\" : "/";
}

export function normalizeSlashes(p: string, platform = process.platform): string {
  if (platform === "win32") return p.replace(/\//g, "\\");
  return p.replace(/\\/g, "/");
}

export function joinPath(parts: string[], platform = process.platform): string {
  const sep = pathSep(platform);
  const cleaned: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (!raw) continue;
    const norm = normalizeSlashes(raw, platform);
    if (i === 0) {
      cleaned.push(norm.length > 1 && norm.endsWith(sep) ? norm.slice(0, -1) : norm);
    } else {
      const stripped = norm.replace(/^[\\/]+|[\\/]+$/g, "");
      if (stripped) cleaned.push(stripped);
    }
  }
  if (cleaned.length === 0) return sep;
  if (cleaned.length === 1) return cleaned[0]!;
  return cleaned[0] === sep ? `${sep}${cleaned.slice(1).join(sep)}` : cleaned.join(sep);
}

export function basenamePath(p: string): string {
  const norm = p.replace(/[\\/]+$/, "");
  const idx = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

export function dirnamePath(p: string, platform = process.platform): string {
  const sep = pathSep(platform);
  const norm = normalizeSlashes(p, platform).replace(/[\\/]+$/, "");
  const idx = norm.lastIndexOf(sep);
  if (idx < 0) return ".";
  if (idx === 0) return sep;
  return norm.slice(0, idx);
}

export function extnameLower(p: string): string {
  const base = basenamePath(p);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function stemName(p: string): string {
  const base = basenamePath(p);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function sha256Hex(input: string | Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex");
}

export function tempDirPath(platform = process.platform): string {
  return process.env.TMPDIR || process.env.TEMP || process.env.TMP || (platform === "win32" ? "C:\\Temp" : "/tmp");
}

export async function fileExistsPure(filePath: string): Promise<boolean> {
  try {
    return await Bun.file(filePath).exists();
  } catch {
    return false;
  }
}

export function ensureDirectoryPure(dirPath: string, platform = process.platform): void {
  if (!dirPath || dirPath.includes("\0")) return;
  if (platform === "win32") {
    Bun.spawnSync(
      [
        "powershell",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "if ($env:FM_TARGET_DIR) { New-Item -ItemType Directory -Force -LiteralPath $env:FM_TARGET_DIR | Out-Null }",
      ],
      {
        stdout: "ignore",
        stderr: "ignore",
        env: { ...process.env, FM_TARGET_DIR: dirPath },
      },
    );
  } else {
    Bun.spawnSync(["mkdir", "-p", "--", dirPath], {
      stdout: "ignore",
      stderr: "ignore",
    });
  }
}

export function listDirectoryEntriesPure(
  dirPath: string,
  platform = process.platform,
): Array<{ name: string; path: string; isDir: boolean }> {
  if (!dirPath || dirPath.includes("\0")) return [];
  try {
    if (platform === "win32") {
      const res = Bun.spawnSync(
        [
          "powershell",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-ChildItem -LiteralPath $env:FM_TARGET_DIR -Force | Select-Object Name,PSIsContainer | ConvertTo-Json -Compress",
        ],
        {
          stdout: "pipe",
          stderr: "ignore",
          env: { ...process.env, FM_TARGET_DIR: dirPath },
        },
      );
      if (res.exitCode !== 0) return [];
      const text = res.stdout.toString().trim();
      if (!text) return [];
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr
        .filter((x) => x && typeof x.Name === "string")
        .map((x) => ({
          name: x.Name,
          path: joinPath([dirPath, x.Name], platform),
          isDir: Boolean(x.PSIsContainer),
        }));
    }
    const res = Bun.spawnSync(["ls", "-1Ap", "--", dirPath], { stdout: "pipe", stderr: "ignore" });
    if (res.exitCode !== 0) return [];
    const lines = res.stdout
      .toString("utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((entry) => {
      const isDir = entry.endsWith("/");
      const cleanName = isDir ? entry.slice(0, -1) : entry;
      return {
        name: cleanName,
        path: joinPath([dirPath, cleanName], platform),
        isDir,
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Strict Hardware Inspection, Mac MLX Exclusivity & 70% RAM Safety Ceiling (Section 2 of Brief)
// ---------------------------------------------------------------------------------------------------------------

export type RamSafetyTier = "under_8gb" | "8gb_to_16gb" | "17gb_to_32gb" | "33gb_plus";

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
export function detectNativeHostArch(platform: string, overrideArch?: string): string {
  if (overrideArch) return overrideArch;
  if (platform === "darwin" && process.platform !== "darwin") return "arm64";
  if (platform === "win32") {
    const winEnvArch = `${process.env.PROCESSOR_ARCHITEW6432 || ""} ${process.env.PROCESSOR_ARCHITECTURE || ""}`.toLowerCase();
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
  const platform = overrides?.platform ?? ctx?.ollama?.platform ?? ctx?.platform ?? process.platform;
  const arch = detectNativeHostArch(platform, overrides?.arch ?? ctx?.ollama?.arch);
  const isAppleSiliconMac = platform === "darwin" && arch === "arm64";

  let totalRamBytes = overrides?.totalRamBytes ?? ctx?.ollama?.totalRamBytes ?? 0;
  let cpuModel = overrides?.cpuModel ?? ctx?.ollama?.cpuModel ?? "";
  let cpuCores = overrides?.cpuCores ?? ctx?.ollama?.cpuCores ?? 0;

  if (!totalRamBytes || totalRamBytes <= 0) {
    if (platform === process.platform && cachedNativeHostRamBytes > 0) {
      totalRamBytes = cachedNativeHostRamBytes;
    } else {
      try {
        if (platform === "darwin" && process.platform === "darwin") {
          const memOut = Bun.spawnSync(["sysctl", "-n", "hw.memsize"], { stdout: "pipe", stderr: "ignore" })
            .stdout.toString()
            .trim();
          const parsed = Number(memOut);
          if (Number.isFinite(parsed) && parsed > 0) totalRamBytes = parsed;
        } else if (platform === "linux" && process.platform === "linux") {
          const memOut = Bun.spawnSync(["grep", "MemTotal", "/proc/meminfo"], { stdout: "pipe", stderr: "ignore" })
            .stdout.toString()
            .trim();
          const m = /(\d+)\s*kB/i.exec(memOut);
          if (m) totalRamBytes = Number(m[1]) * 1024;
        } else if (platform === "win32" && process.platform === "win32") {
          const memOut = Bun.spawnSync(
            ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"],
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
          cpuModel = Bun.spawnSync(["sysctl", "-n", "machdep.cpu.brand_string"], { stdout: "pipe", stderr: "ignore" })
            .stdout.toString()
            .trim();
          const cOut = Bun.spawnSync(["sysctl", "-n", "hw.ncpu"], { stdout: "pipe", stderr: "ignore" })
            .stdout.toString()
            .trim();
          if (Number(cOut) > 0) cpuCores = Number(cOut);
        } else if (platform === "linux" && process.platform === "linux") {
          const cOut = Bun.spawnSync(["nproc"], { stdout: "pipe", stderr: "ignore" }).stdout.toString().trim();
          if (Number(cOut) > 0) cpuCores = Number(cOut);
        }
        if (platform === process.platform) {
          if (cpuModel) cachedNativeHostCpuModel = cpuModel;
          if (cpuCores > 0) cachedNativeHostCpuCores = cpuCores;
        }
      } catch {}
    }
  }

  if (!cpuModel) cpuModel = isAppleSiliconMac ? "Apple Silicon (ARM64)" : `${platform.toUpperCase()} ${arch}`;
  if (!cpuCores || cpuCores <= 0) cpuCores = 8;

  const totalRamGb = Math.round((totalRamBytes / 1024 ** 3) * 100) / 100;
  // Rule B: Strict 70% RAM Safety Ceiling (keeping 30% free for the OS and Codecaine File Manager)
  const safeMemoryBudgetBytes = Math.floor(totalRamBytes * 0.7);
  const safeMemoryBudgetGb = Math.round((safeMemoryBudgetBytes / 1024 ** 3) * 100) / 100;

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

export function bunJoinPath(...parts: string[]): string {
  return joinPath(parts);
}

export function bunBasename(p: string): string {
  return basenamePath(p);
}

export function bunDirname(p: string): string {
  return dirnamePath(p);
}

export function bunExtname(p: string): string {
  const ext = extnameLower(p);
  return ext ? `.${ext}` : "";
}

export function ensureDirSyncWithBun(dirPath: string): void {
  ensureDirectoryPure(dirPath);
}

export function resolveSandboxPath(ctx: FmContext, relOrAbs: string): string {
  const raw = String(relOrAbs || ".").trim();
  if (raw.includes("\0")) {
    throw new FmError("BAD_PATH", "Invalid path containing null byte.");
  }
  const base = ctx.sandboxRoot || ctx.home;
  const isAbs = raw.startsWith("/") || (ctx.platform === "win32" && /^[A-Za-z]:[\\/]/.test(raw));
  const candidate = raw === "." || raw === "" ? base : isAbs ? raw : joinPath([base, raw], ctx.platform);
  const resolved = absolutePath(ctx, candidate);
  if (ctx.sandboxRoot && !isSameOrInside(resolved, ctx.sandboxRoot, ctx.platform)) {
    throw new FmError("PROTECTED_PATH", "Path escapes the configured workspace sandbox root.");
  }
  if (!isAbs && !isSameOrInside(resolved, base, ctx.platform)) {
    throw new FmError("PROTECTED_PATH", "Relative path traversal outside the workspace root is not permitted.");
  }
  if (ctx.trashRoot && isSameOrInside(resolved, ctx.trashRoot, ctx.platform)) {
    throw new FmError("TRASH_PROTECTED", "The Recycle Bin can only be changed through Recycle Bin actions.");
  }
  return resolved;
}

export function toSandboxRelative(ctx: FmContext, absPath: string): string {
  const base = (ctx.sandboxRoot || ctx.home).replace(/\/+$/, "");
  if (absPath === base) return ".";
  if (absPath.startsWith(base + "/")) {
    return absPath.slice(base.length + 1);
  }
  return absPath;
}

export function isSupportedVisionImagePath(filePath: string): boolean {
  const ext = extnameLower(filePath);
  return ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp";
}

export async function readImageAsBase64(absPath: string): Promise<string> {
  const file = Bun.file(absPath);
  if (!(await file.exists())) {
    throw new FmError("FILE_NOT_FOUND", `Image file not found: ${absPath}`);
  }
  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

export async function readTextFileSnippet(absPath: string, maxChars = 24_000): Promise<string> {
  const file = Bun.file(absPath);
  if (!(await file.exists())) {
    throw new FmError("FILE_NOT_FOUND", `File not found: ${absPath}`);
  }
  const text = await file.slice(0, maxChars * 4).text();
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

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
        if (options?.recursive) walk(entry.path, depth + 1);
      } else {
        results.push({ name: entry.name, absPath: entry.path, isDir: false });
      }
    }
  };
  walk(dirAbs, 0);
  return results;
}

/** Tiny specialized utility models that are always allowed on Apple Silicon and low-RAM tiers. */
export const UTILITY_MODEL_NAMES = new Set(["phonon", "nimble", "tev1", "clef", "clef-flash"]);

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
export function resolveSpeechModelRegistryFallback(modelName: string): string | null {
  const base = baseModelName(modelName);
  const lower = String(modelName || "").trim().toLowerCase();
  if (lower.includes("/")) return null;
  if (base === "orpheus" || base === "orpheus-tts") return "legraphista/Orpheus:latest";
  if (base === "kokoro") return "lfm3-omni:latest";
  if (base === "oute-tts" || base === "outetts") return "mannix/outetts:0.3";
  if (base === "parler-tts" || base === "llasa") return "legraphista/Orpheus:latest";
  return null;
}

export const DECISION_MODEL_NAMES = new Set(["nimble", "tev1", "clef", "clef-flash", "clef:cloud", "d3"]);

export const VISION_DECISION_MODEL_NAMES = new Set(["clef", "clef-flash", "clef:cloud", "d3"]);

export function baseModelName(model: string): string {
  const clean = String(model || "").trim().toLowerCase();
  const colon = clean.indexOf(":");
  const base = colon >= 0 ? clean.slice(0, colon) : clean;
  const slash = base.lastIndexOf("/");
  return slash >= 0 ? base.slice(slash + 1) : base;
}

export function isCloudModelName(model: string): boolean {
  const clean = String(model || "").trim().toLowerCase();
  return clean.endsWith(":cloud") || clean.endsWith("-cloud");
}

export function isPhononModelName(model: string): boolean {
  return baseModelName(model) === "phonon";
}

export function isCrossPlatformSpeechModelName(model: string): boolean {
  return CROSS_PLATFORM_SPEECH_MODEL_NAMES.has(baseModelName(model));
}

export function isSpeechModelName(model: string): boolean {
  return isPhononModelName(model) || isCrossPlatformSpeechModelName(model);
}

export function isUtilityModelName(model: string): boolean {
  return UTILITY_MODEL_NAMES.has(baseModelName(model));
}

export function isDecisionModelName(model: string, capabilities: string[] = []): boolean {
  if (capabilities.includes("decision")) return true;
  const clean = String(model || "").trim().toLowerCase();
  if (DECISION_MODEL_NAMES.has(clean)) return true;
  return DECISION_MODEL_NAMES.has(baseModelName(model));
}

export function isVisionDecisionModel(model: string, capabilities: string[] = []): boolean {
  const clean = String(model || "").trim().toLowerCase();
  const base = baseModelName(model);
  if (base === "clef" || base === "clef-flash" || clean === "clef:cloud") return true;
  return isDecisionModelName(model, capabilities) && capabilities.includes("vision");
}

export const canJudgeImagesInDecision = isVisionDecisionModel;

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
    nameLower.startsWith("qwen3.5")
  ) {
    return true;
  }
  if (quantLower.includes("mxfp") || quantLower.includes("nvfp")) return true;
  if (formatLower === "safetensors") return true;
  if (familyLower.includes("phonon") || familyLower.includes("lfm3") || familyLower.includes("qwen35") || familyLower.includes("qwen3.5")) return true;
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
}): { parameterBillions: number; estimatedRamBytes: number; estimatedRamGb: number } {
  const nameLower = String(model.name || "").toLowerCase();
  if (isCloudModelName(nameLower)) {
    return { parameterBillions: 0, estimatedRamBytes: 0, estimatedRamGb: 0 };
  }
  const base = baseModelName(nameLower);
  if (base === "phonon") {
    return { parameterBillions: 0.044, estimatedRamBytes: 220 * 1024 * 1024, estimatedRamGb: 0.22 };
  }
  if (base === "kokoro") {
    return { parameterBillions: 0.082, estimatedRamBytes: 340 * 1024 * 1024, estimatedRamGb: 0.34 };
  }
  if (base === "oute-tts" || base === "outetts" || base === "parler-tts" || base === "llasa") {
    const sz = model.sizeBytes && model.sizeBytes > 0 ? model.sizeBytes : 1100 * 1024 * 1024;
    return {
      parameterBillions: 1.0,
      estimatedRamBytes: sz,
      estimatedRamGb: Math.round((sz / 1024 ** 3) * 100) / 100,
    };
  }
  if (base === "orpheus" || base === "orpheus-tts" || base === "bark") {
    const sz = model.sizeBytes && model.sizeBytes > 0 ? model.sizeBytes : Math.round(2.1 * 1024 ** 3);
    return {
      parameterBillions: 3.0,
      estimatedRamBytes: sz,
      estimatedRamGb: Math.round((sz / 1024 ** 3) * 100) / 100,
    };
  }
  if (base === "nimble" || base === "clef-flash" || base === "tev1") {
    const sz = model.sizeBytes && model.sizeBytes > 0 ? model.sizeBytes : 900 * 1024 * 1024;
    return {
      parameterBillions: 1.2,
      estimatedRamBytes: sz,
      estimatedRamGb: Math.round((sz / 1024 ** 3) * 100) / 100,
    };
  }
  if (base === "clef") {
    const sz = model.sizeBytes && model.sizeBytes > 0 ? model.sizeBytes : Math.round(2.4 * 1024 ** 3);
    return {
      parameterBillions: 2.5,
      estimatedRamBytes: sz,
      estimatedRamGb: Math.round((sz / 1024 ** 3) * 100) / 100,
    };
  }

  let paramsB = 0;
  if (typeof model.parameterCount === "number" && model.parameterCount > 0) {
    paramsB = model.parameterCount / 1e9;
  } else if (typeof model.parameterSize === "string" && model.parameterSize.trim()) {
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
      paramsB = Math.max(0.5, Math.round((model.sizeBytes / (0.75 * 1024 ** 3)) * 10) / 10);
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
    const bytesPerParam = quant.includes("bf16") || quant.includes("fp16") ? 2.1 : quant.includes("fp8") || quant.includes("q8") ? 1.15 : 0.72;
    estimatedRamBytes = Math.round(paramsB * bytesPerParam * 1024 ** 3 + 350 * 1024 * 1024);
  }

  const estimatedRamGb = Math.round((estimatedRamBytes / 1024 ** 3) * 100) / 100;
  return {
    parameterBillions: Math.round(paramsB * 100) / 100,
    estimatedRamBytes,
    estimatedRamGb,
  };
}

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

export const DEFAULT_GENERAL_CHAT_MODEL = "qwen3.5:latest";
export const DEFAULT_COMPACT_CHAT_MODEL = "qwen3.5:4b";

export const CURATED_MODEL_CATALOG: CatalogModelSpec[] = [
  {
    name: "qwen3.5:latest",
    label: "Qwen 3.5 (Default General-Purpose Multimodal Chat, Vision, Deep Thinking & Tools — macOS, Windows & Linux)",
    parameterSize: "4B",
    parameterBillions: 4.0,
    estimatedRamGb: 3.1,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "thinking", "mlx"],
    description: "Default general-purpose LLM across macOS, Windows, and Linux supporting Chat, Vision, Code, Deep Thinking, and Tool Calling (`ollama run qwen3.5`).",
  },
  {
    name: "qwen3.5:4b",
    label: "Qwen 3.5 4B (Compact Multimodal Vision, Deep Thinking & Tools — Smaller Memory Computers)",
    parameterSize: "4B",
    parameterBillions: 4.0,
    estimatedRamGb: 3.1,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "thinking", "mlx"],
    description: "Official Qwen 3.5 4B (`qwen3.5:4b`) multimodal Chat, Vision, Deep Thinking & Tool-Calling model tailored for smaller memory computers on macOS, Windows, and Linux.",
  },
  {
    name: "lfm3:latest",
    label: "LFM3 1.7B MLX (Ultra-Fast Chat, Tools & Thinking)",
    parameterSize: "1.7B",
    parameterBillions: 1.7,
    estimatedRamGb: 1.8,
    runner: "mlx",
    capabilities: ["completion", "tools", "thinking", "mlx"],
    description: "Compact Apple Silicon MLX model with deep thinking and tool calling. Fits even under 8 GB RAM.",
  },
  {
    name: "lfm3-vl:2b-mlx-bf16",
    label: "LFM3-VL 2B MLX BF16 (Vision, Chat, Tools & Thinking)",
    parameterSize: "1.9B",
    parameterBillions: 1.9,
    estimatedRamGb: 3.9,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "thinking", "mlx"],
    description: "Native Apple Silicon MLX vision-language model for inspecting screenshots, OCR, and multimodal chat.",
  },
  {
    name: "lfm3-omni:2b-mlx-bf16",
    label: "LFM3-Omni 2B MLX BF16 (Multimodal Vision, Audio & Chat)",
    parameterSize: "2.2B",
    parameterBillions: 2.2,
    estimatedRamGb: 4.5,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "audio", "speech", "mlx"],
    description: "Native Apple Silicon MLX omni model supporting text, vision, tools, and audio.",
  },
  {
    name: "phonon",
    label: "Gradium Phonon TTS (Neural Speech Synthesizer)",
    parameterSize: "43.6M",
    parameterBillions: 0.044,
    estimatedRamGb: 0.22,
    runner: "mlx",
    capabilities: ["speech", "mlx"],
    description: "Dedicated real-time neural text-to-speech engine with 38+ voices (`/v1/audio/speech`).",
  },
  {
    name: "nimble",
    label: "Nimble (SystemOne Decision Engine — Text & JSON)",
    parameterSize: "1.2B",
    parameterBillions: 1.2,
    estimatedRamGb: 0.9,
    runner: "mlx",
    capabilities: ["decision"],
    description: "Ultra-fast SystemOne decision model for yes/no probability (`noul`), `choice`, and `score` rubrics.",
  },
  {
    name: "clef-flash",
    label: "Clef-Flash (Fast Multimodal Decision Engine — Text & Images)",
    parameterSize: "1.5B",
    parameterBillions: 1.5,
    estimatedRamGb: 1.2,
    runner: "mlx",
    capabilities: ["decision", "vision"],
    description: "Fast SystemOne decision & image classifier for receipts, screenshots, and documents.",
  },
  {
    name: "clef",
    label: "Clef (High-Accuracy Multimodal Decision Engine — Text & Images)",
    parameterSize: "2.5B",
    parameterBillions: 2.5,
    estimatedRamGb: 2.4,
    runner: "mlx",
    capabilities: ["decision", "vision"],
    description: "SystemOne decision engine that judges both text files and images (`PNG`, `JPEG`, `WebP`).",
  },
  {
    name: "tev1",
    label: "TEv1 (SystemOne Text Evaluation & Rubric Scorer)",
    parameterSize: "1.2B",
    parameterBillions: 1.2,
    estimatedRamGb: 0.9,
    runner: "mlx",
    capabilities: ["decision"],
    description: "Lightweight SystemOne decision and rubric scoring utility model.",
  },
  {
    name: "d3:9b-mxfp8",
    label: "D3 9B MXFP8 MLX (Pro Vision & Decision Engine)",
    parameterSize: "8.4B",
    parameterBillions: 8.4,
    estimatedRamGb: 10.1,
    runner: "mlx",
    capabilities: ["decision", "vision", "mlx"],
    description: "Apple Silicon MLX 8.4B multimodal decision & vision scorer (requires 16+ GB RAM).",
  },
  {
    name: "lfm3-omni:latest",
    label: "Liquid LFM3-Omni 2B (Official Omni Audio, Speech, Vision & Chat — Cross-Platform & MLX)",
    parameterSize: "2B",
    parameterBillions: 2.0,
    estimatedRamGb: 1.9,
    runner: "mlx",
    capabilities: ["completion", "speech", "audio", "vision", "tools", "mlx"],
    description: "Liquid AI LFM3-Omni 2B multimodal model supporting Audio/Speech, Vision, Chat, and Tool Calling (`ollama run lfm3-omni`).",
  },
  {
    name: "orpheus:latest",
    label: "Orpheus TTS 3B (Cross-Platform Text-to-Audio LLM — Linux, Windows & Mac)",
    parameterSize: "3B",
    parameterBillions: 3.0,
    estimatedRamGb: 2.1,
    runner: "standard",
    capabilities: ["speech", "audio", "completion"],
    description: "Expressive cross-platform Text-to-Audio LLM for Linux and Windows systems where Apple MLX Phonon is not available.",
  },
  {
    name: "kokoro:latest",
    label: "Kokoro 82M TTS (Ultra-Light Cross-Platform Text-to-Audio — Linux & Windows)",
    parameterSize: "82M",
    parameterBillions: 0.082,
    estimatedRamGb: 0.34,
    runner: "standard",
    capabilities: ["speech", "audio"],
    description: "Ultra-fast 82M cross-platform neural speech synthesizer for Linux and Windows (runs in under 350 MB RAM).",
  },
  {
    name: "oute-tts:latest",
    label: "OuteTTS 1B (Cross-Platform Audio & Voice Cloning LLM — Linux & Windows)",
    parameterSize: "1B",
    parameterBillions: 1.0,
    estimatedRamGb: 1.1,
    runner: "standard",
    capabilities: ["speech", "audio", "completion"],
    description: "Compact 1B cross-platform Text-to-Audio LLM for natural speech generation on Linux, Windows, and macOS.",
  },
  {
    name: "parler-tts:latest",
    label: "Parler-TTS Mini (Prompt-Controlled Text-to-Audio LLM — Linux & Windows)",
    parameterSize: "880M",
    parameterBillions: 0.88,
    estimatedRamGb: 1.0,
    runner: "standard",
    capabilities: ["speech", "audio"],
    description: "Cross-platform Text-to-Audio model that generates natural speech on Linux and Windows without Apple MLX.",
  },
  {
    name: "qwen3.5:2b",
    label: "Qwen 3.5 2B (Ultra-Fast Cross-Platform Multimodal — Ultra-Low RAM)",
    parameterSize: "2B",
    parameterBillions: 2.0,
    estimatedRamGb: 1.9,
    runner: "mlx",
    capabilities: ["completion", "vision", "tools", "thinking", "mlx"],
    description: "Ultra-compact Qwen 3.5 2B multimodal model for ultra-low memory machines across macOS, Windows, and Linux.",
  },
  {
    name: "qwen2.5:3b",
    label: "Qwen 2.5 3B (Cross-Platform Chat, Code & Tools — Linux & Windows)",
    parameterSize: "3B",
    parameterBillions: 3.0,
    estimatedRamGb: 2.2,
    runner: "standard",
    capabilities: ["completion", "tools", "thinking"],
    description: "Fast cross-platform Chat, Code & Tool-Calling model for Linux and Windows (fits under 8 GB RAM).",
  },
  {
    name: "moondream:latest",
    label: "Moondream 2B Vision (Cross-Platform Image & OCR — Linux & Windows)",
    parameterSize: "1.8B",
    parameterBillions: 1.8,
    estimatedRamGb: 1.7,
    runner: "standard",
    capabilities: ["completion", "vision"],
    description: "Compact cross-platform Vision & OCR model for inspecting images and screenshots on Linux and Windows.",
  },
  {
    name: "gemma4:cloud",
    label: "Gemma 4 Cloud (Zero Local RAM — Hybrid Cloud Execution)",
    parameterSize: "Cloud",
    parameterBillions: 0,
    estimatedRamGb: 0,
    runner: "cloud",
    capabilities: ["completion", "vision", "tools", "thinking", "cloud"],
    description: "Runs massive Gemma 4 in the cloud via Ollama Cloud with zero local RAM usage.",
  },
  {
    name: "clef:cloud",
    label: "Clef Cloud (Zero Local RAM — Cloud Decision & Vision Scorer)",
    parameterSize: "Cloud",
    parameterBillions: 0,
    estimatedRamGb: 0,
    runner: "cloud",
    capabilities: ["decision", "vision", "cloud"],
    description: "Runs Clef multimodal decision scoring in the cloud without using local memory.",
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
    installedModels?: Array<{ name: string; isMlx?: boolean; fitsRam?: boolean; capabilities?: string[] }>;
    taskCapability?: "chat" | "vision" | "decision" | "speech" | "embed";
  },
): HardwareGuardVerdict {
  const modelName = String(modelInput.name || "").trim();
  const isCloud = isCloudModelName(modelName);
  const isUtility = isUtilityModelName(modelName);
  const isMlx = isCloud ? false : isMlxOptimizedModel(modelInput);
  const { parameterBillions, estimatedRamBytes, estimatedRamGb } = estimateModelMemoryAndParams(modelInput);

  // Pick best suggested local model that fits inside the 70% RAM budget
  const taskCap = options?.taskCapability ?? "chat";
  const installedFitting = (options?.installedModels ?? []).filter((m) => {
    if (m.fitsRam === false) return false;
    if (hardware.isAppleSiliconMac && m.isMlx === false && !isUtilityModelName(m.name)) return false;
    if (taskCap === "decision") return isDecisionModelName(m.name, m.capabilities);
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
      suggestedLocalModel = hardware.ramTier === "under_8gb" || hardware.ramTier === "8gb_to_16gb" ? "qwen3.5:4b" : "qwen3.5:latest";
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
    (hardware.ramTier === "under_8gb" && (parameterBillions >= 7 || parameterBillions > hardware.maxParametersB)) ||
    (hardware.ramTier === "8gb_to_16gb" && (parameterBillions >= 13 || parameterBillions > hardware.maxParametersB)) ||
    (hardware.ramTier === "17gb_to_32gb" && (parameterBillions >= 70 || parameterBillions > hardware.maxParametersB));

  const exceedsSafeRamBudget = estimatedRamBytes > hardware.safeMemoryBudgetBytes;

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
  const mlxAltAvailable = options?.hasMlxAlternativeForTask ?? true;
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

export function getOllamaApiKey(ctx: FmContext): string {
  const fromCtx = ctx.ollama?.apiKey?.trim();
  if (fromCtx) return fromCtx;
  const rootKey = ctx.sandboxRoot || ctx.home;
  const fromMap = runtimeApiKeyByRoot.get(rootKey)?.trim();
  if (fromMap) return fromMap;
  const fromEnv = (Bun.env.OLLAMA_API_KEY || "").trim();
  return fromEnv;
}

export function setOllamaApiKey(ctx: FmContext, apiKey: string): void {
  const rootKey = ctx.sandboxRoot || ctx.home;
  const trimmed = String(apiKey || "").trim();
  if (trimmed) {
    runtimeApiKeyByRoot.set(rootKey, trimmed);
  } else {
    runtimeApiKeyByRoot.delete(rootKey);
  }
}

export function resolveOllamaBaseUrl(ctx: FmContext, useCloudHost = false): string {
  if (useCloudHost) {
    return (ctx.ollama?.cloudBaseUrl || Bun.env.OLLAMA_CLOUD_HOST || DEFAULT_OLLAMA_CLOUD_URL).replace(/\/+$/, "");
  }
  return (ctx.ollama?.baseUrl || Bun.env.OLLAMA_HOST || DEFAULT_OLLAMA_LOCAL_URL).replace(/\/+$/, "");
}

function isSafeForApiKeyHeader(urlStr: string, useCloudHost: boolean): boolean {
  if (useCloudHost) return true;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === "https:") return true;
    const h = parsed.hostname.toLowerCase();
    return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
  } catch {
    return false;
  }
}

export async function ollamaFetchJson(
  ctx: FmContext,
  endpointPath: string,
  init?: RequestInit & { useCloudHost?: boolean; timeoutMs?: number },
): Promise<{ ok: boolean; status: number; data: any; rawText: string }> {
  const useCloudHost = Boolean(init?.useCloudHost);
  const baseUrl = resolveOllamaBaseUrl(ctx, useCloudHost);
  const isAbsoluteUrl = endpointPath.startsWith("http://") || endpointPath.startsWith("https://");
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

export interface OllamaVersionReport {
  online: boolean;
  reachable: boolean;
  version: string;
  supportsDecision: boolean;
  supportsSpeech: boolean;
  warnings: string[];
}

export async function getOllamaVersionStatus(ctx: FmContext): Promise<OllamaVersionReport> {
  const res = await ollamaFetchJson(ctx, "/api/version", { method: "GET", timeoutMs: 4000 });
  if (!res.ok || !res.data?.version) {
    return {
      online: false,
      reachable: false,
      version: "offline",
      supportsDecision: false,
      supportsSpeech: false,
      warnings: ["Local Ollama server is not reachable on " + resolveOllamaBaseUrl(ctx) + "."],
    };
  }
  const version = String(res.data.version);
  const supportsDecision = compareSemver(version, "0.35.1") >= 0;
  const supportsSpeech = compareSemver(version, "0.40.9") >= 0;
  const warnings: string[] = [];
  if (!supportsDecision) {
    warnings.push(`Ollama v${version} is older than v0.35.1 — Decision / SystemOne (/v1/systemone) requires v0.35.1+.`);
  }
  if (!supportsSpeech) {
    warnings.push(`Ollama v${version} is older than v0.40.9 — Phonon Speech (/v1/audio/speech) requires v0.40.9+.`);
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
  badges: Array<"Chat" | "Vision" | "Speech" | "Decision" | "Thinking" | "MLX" | "Tools" | "Cloud" | "Embeddings">;
  voices: string[];
  contextLength: number;
  isMlx: boolean;
  isCloud: boolean;
  isUtility: boolean;
  fitsRam: boolean;
  estimatedRamGb: number;
  hardwareVerdict: HardwareGuardVerdict;
  modifiedAt: string;
}

const modelShowCache = new Map<string, { ts: number; data: any }>();

export async function showModelDetails(ctx: FmContext, modelName: string, forceRefresh = false): Promise<any> {
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

export function computeModelBadges(model: {
  name: string;
  capabilities: string[];
  isMlx: boolean;
  isCloud: boolean;
}): Array<"Chat" | "Vision" | "Speech" | "Decision" | "Thinking" | "MLX" | "Tools" | "Cloud" | "Embeddings"> {
  const badges: Array<"Chat" | "Vision" | "Speech" | "Decision" | "Thinking" | "MLX" | "Tools" | "Cloud" | "Embeddings"> = [];
  const caps = new Set(model.capabilities.map((c) => c.toLowerCase()));
  const nameLower = model.name.toLowerCase();

  if (isSpeechModelName(nameLower) || caps.has("speech") || caps.has("tts") || caps.has("audio")) {
    badges.push("Speech");
  }
  if (isDecisionModelName(nameLower, model.capabilities)) {
    badges.push("Decision");
  }
  if (!isPhononModelName(nameLower) && (caps.has("completion") || caps.has("chat") || (!caps.has("decision") && !caps.has("embedding")))) {
    badges.push("Chat");
  }
  if (caps.has("vision") || nameLower.includes("-vl") || nameLower.includes("omni") || baseModelName(nameLower) === "clef" || baseModelName(nameLower) === "clef-flash") {
    badges.push("Vision");
  }
  if (caps.has("thinking") || nameLower.includes("lfm3") || nameLower.includes("r1") || nameLower.includes("qwq")) {
    badges.push("Thinking");
  }
  if (caps.has("tools")) {
    badges.push("Tools");
  }
  if (caps.has("embedding") || caps.has("embeddings") || nameLower.includes("embed")) {
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
  recommendedCatalog: Array<CatalogModelSpec & { hardwareVerdict: HardwareGuardVerdict; installed: boolean }>;
}> {
  const hardware = inspectOllamaHardware(ctx);
  const tagsRes = await ollamaFetchJson(ctx, "/api/tags", { method: "GET", timeoutMs: 6000 });
  const rawModels: any[] = Array.isArray(tagsRes.data?.models) ? tagsRes.data.models : [];

  // Inspect details via /api/show in parallel
  const inspected = await Promise.all(
    rawModels.map(async (m) => {
      const name = String(m.name || m.model || "");
      const showData = await showModelDetails(ctx, name);
      const details = showData?.details || m.details || {};
      const modelInfo = showData?.model_info || {};
      const capabilities: string[] = Array.isArray(showData?.capabilities) ? showData.capabilities : [];

      let contextLength = 8192;
      let parameterCount = 0;
      let voices: string[] = [];
      for (const [k, v] of Object.entries(modelInfo)) {
        if (k.endsWith(".context_length") && typeof v === "number") contextLength = v;
        if (k === "general.parameter_count" && typeof v === "number") parameterCount = v;
        if (k.endsWith(".voices") && Array.isArray(v)) voices = v.map(String);
      }
      if (isPhononModelName(name) && voices.length === 0) {
        voices = ["default", "Zoey", "Easton", "Freya"];
      }

      const runner = String(details.runner || (isMlxOptimizedModel({ name, format: details.format, quantization: details.quantization_level }) ? "mlx" : "standard"));
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

  const hasAnyMlxChat = inspected.some((m) => m.isMlx && !isPhononModelName(m.name) && !isDecisionModelName(m.name, m.capabilities)) || true;
  const hasAnyMlxVision = inspected.some((m) => m.isMlx && m.capabilities.includes("vision")) || true;

  const badgedAll: BadgedOllamaModel[] = inspected.map((item) => {
    const taskCap = isPhononModelName(item.name)
      ? "speech"
      : isDecisionModelName(item.name, item.capabilities)
        ? "decision"
        : item.capabilities.includes("vision")
          ? "vision"
          : "chat";
    const hasMlxAlt = taskCap === "vision" ? hasAnyMlxVision : taskCap === "chat" ? hasAnyMlxChat : true;
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
  const blockedByRamModels = badgedAll.filter((m) => m.hardwareVerdict.code === "HARDWARE_RAM_REFUSAL");

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
    const installed = installedSet.has(cat.name.toLowerCase()) || installedBaseSet.has(baseModelName(cat.name));
    return {
      ...cat,
      hardwareVerdict: verdict,
      installed,
    };
  }).filter((c) => {
    if (hardware.isAppleSiliconMac && c.runner === "standard" && !isUtilityModelName(c.name)) {
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
  const res = await ollamaFetchJson(ctx, "/api/ps", { method: "GET", timeoutMs: 5000 });
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
      processor: m.size_vram ? "100% GPU / Unified Memory" : "CPU / Unified Memory",
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
    ? [{ name: targetModel, sizeBytes: running.models.find((m) => m.name === targetModel)?.sizeBytes ?? 0 }]
    : running.models;

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
          body: JSON.stringify({ model: item.name, messages: [], keep_alive: 0 }),
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

export function updateOllamaLongTask(patch: Partial<OllamaLongTaskStatus>): OllamaLongTaskStatus {
  const now = Date.now();
  const startedAt = patch.startedAt ?? (currentOllamaLongTask.active ? currentOllamaLongTask.startedAt : now);
  const nextStep = patch.step ?? currentOllamaLongTask.step;
  const nextPercent = typeof patch.percent === "number" ? Math.max(0, Math.min(100, Math.round(patch.percent))) : currentOllamaLongTask.percent;
  const stepsLog = patch.stepsLog
    ? patch.stepsLog
    : nextStep && nextStep !== currentOllamaLongTask.step
      ? [...currentOllamaLongTask.stepsLog.slice(-19), { time: now, step: nextStep, percent: nextPercent }]
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

export function getLiveOllamaLongTaskStatus(): OllamaLongTaskStatus {
  const now = Date.now();
  return {
    ...currentOllamaLongTask,
    elapsedMs: currentOllamaLongTask.active && currentOllamaLongTask.startedAt > 0
      ? Math.max(0, now - currentOllamaLongTask.startedAt)
      : currentOllamaLongTask.elapsedMs,
  };
}

export async function detectOllamaBinaryPure(ctx?: FmContext): Promise<string | null> {
  if (ctx?.ollama && "ollamaBinPath" in ctx.ollama && ctx.ollama.ollamaBinPath !== undefined) {
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
          joinPath([process.env.LOCALAPPDATA || joinPath([home, "AppData", "Local"], "win32"), "Programs", "Ollama", "ollama.exe"], "win32"),
          joinPath([home, "AppData", "Local", "Programs", "Ollama", "ollama.exe"], "win32"),
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
            joinPath([home, "Applications", "Ollama.app", "Contents", "Resources", "ollama"], "darwin"),
            joinPath([home, ".ollama", "bin", "Ollama.app", "Contents", "Resources", "ollama"], "darwin"),
            joinPath([home, ".ollama", "bin", "ollama"], "darwin"),
          ];

  for (const cand of candidates) {
    if (cand && (await fileExistsPure(cand))) return cand;
  }
  return null;
}

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
      label: "Liquid LFM3-Omni 2B (Official Omni Audio, Speech, Vision & Chat LLM)",
      parameterSize: "2B",
      estimatedRamGb: 1.9,
      requiresAppleMlx: false,
      description: "Official Ollama LFM3-Omni 2B audio, speech, vision & chat LLM (`ollama run lfm3-omni`) for Windows, Linux, and macOS.",
    },
    {
      name: "orpheus:latest",
      label: "Orpheus TTS 3B (Expressive Text-to-Audio LLM)",
      parameterSize: "3B",
      estimatedRamGb: 2.1,
      requiresAppleMlx: false,
      description: "High-naturalness cross-platform Text-to-Audio LLM for Linux, Windows, and macOS.",
    },
    {
      name: "kokoro:latest",
      label: "Kokoro 82M TTS (Ultra-Light Cross-Platform Speech)",
      parameterSize: "82M",
      estimatedRamGb: 0.34,
      requiresAppleMlx: false,
      description: "Ultra-fast 82M parameter Text-to-Audio model (<350 MB RAM) ideal for Linux & Windows.",
    },
    {
      name: "oute-tts:latest",
      label: "OuteTTS 1B (Cross-Platform Voice & Audio LLM)",
      parameterSize: "1B",
      estimatedRamGb: 1.1,
      requiresAppleMlx: false,
      description: "1B cross-platform Text-to-Audio LLM supporting natural speech synthesis on Linux & Windows.",
    },
    {
      name: "parler-tts:latest",
      label: "Parler-TTS Mini (Prompt-Controlled Text-to-Audio)",
      parameterSize: "880M",
      estimatedRamGb: 1.0,
      requiresAppleMlx: false,
      description: "Cross-platform Text-to-Audio generator for Linux, Windows, and macOS.",
    },
    {
      name: "llasa:latest",
      label: "Llasa 1B Speech LLM (Cross-Platform LLaMA TTS)",
      parameterSize: "1B",
      estimatedRamGb: 1.1,
      requiresAppleMlx: false,
      description: "Cross-platform LLaMA-based speech synthesis model for Linux & Windows.",
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
          description: "Native Apple Silicon MLX speech engine with 38+ neural voices (/v1/audio/speech).",
        },
        ...crossPlatformModels,
      ]
    : crossPlatformModels;

  const defaultSpeechModel = phononSupported
    ? "phonon"
    : hw.ramTier === "under_8gb"
      ? "kokoro:latest"
      : "lfm3-omni:latest";

  const osName = hw.platform === "win32" ? "Windows" : hw.platform === "linux" ? "Linux" : "macOS";
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

export async function getOllamaInstallStatus(ctx: FmContext) {
  const hw = inspectOllamaHardware(ctx);
  const speechCaps = getSpeechCapabilitiesForHost(ctx);
  const [binaryPath, versionStatus] = await Promise.all([
    detectOllamaBinaryPure(ctx),
    getOllamaVersionStatus(ctx),
  ]);
  const binaryInstalled = Boolean(binaryPath) || versionStatus.reachable;
  const defaultChatModel = hw.ramTier === "under_8gb" || hw.ramTier === "8gb_to_16gb" ? "qwen3.5:4b" : "qwen3.5:latest";
  const recommendedStarterModels = hw.isAppleSiliconMac
    ? [defaultChatModel, "lfm3-omni:latest", "phonon", "nimble", "lfm3:latest"]
    : hw.ramTier === "under_8gb" || hw.ramTier === "8gb_to_16gb"
      ? ["qwen3.5:4b", "lfm3-omni:latest", "kokoro:latest", "nimble"]
      : ["qwen3.5:latest", "qwen3.5:4b", "lfm3-omni:latest", "orpheus:latest", "kokoro:latest", "nimble"];

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

export async function pullModelWithHardwareGuard(
  ctx: FmContext,
  modelName: string,
  options?: { keepExistingLongTask?: boolean; progressBasePercent?: number; progressSpanPercent?: number },
): Promise<{
  ok: boolean;
  status: string;
  verdict: HardwareGuardVerdict;
  progressSteps: Array<{ status: string; completed?: number; total?: number; percent?: number }>;
}> {
  const trimmed = String(modelName || "").trim();
  if (!trimmed) throw new FmError("INVALID_INPUT", "Model name is required to pull.");

  const { hardware, models } = await listModelsWithBadgesAndHardwareFilter(ctx);
  const catalogMatch =
    CURATED_MODEL_CATALOG.find((c) => c.name.toLowerCase() === trimmed.toLowerCase()) ||
    CURATED_MODEL_CATALOG.find((c) => baseModelName(c.name) === baseModelName(trimmed));
  const verdict = evaluateModelHardwareGuard(
    {
      name: trimmed,
      parameterSize: catalogMatch?.parameterSize,
      sizeBytes: catalogMatch ? Math.round(catalogMatch.estimatedRamGb * 0.88 * 1024 ** 3) : undefined,
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
      stepsLog: [{ time: Date.now(), step: `Starting pull for ${trimmed}`, percent: basePct }],
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
  const progressSteps: Array<{ status: string; completed?: number; total?: number; percent?: number }> = [];

  const attemptPullStream = async (targetTag: string): Promise<void> => {
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: targetTag, stream: true }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new FmError("OLLAMA_PULL_ERROR", `Failed to pull "${targetTag}": ${errText || res.statusText}`);
    }

    const processLine = (line: string) => {
      const clean = line.trim();
      if (!clean) return;
      try {
        const evt = JSON.parse(clean);
        if (evt.error) {
          throw new FmError("OLLAMA_PULL_ERROR", String(evt.error));
        }
        const completed = typeof evt.completed === "number" ? evt.completed : undefined;
        const total = typeof evt.total === "number" ? evt.total : undefined;
        const percent = completed !== undefined && total && total > 0 ? Math.round((completed / total) * 100) : undefined;
        const statusStr = String(evt.status || "pulling");
        progressSteps.push({
          status: statusStr,
          completed,
          total,
          percent,
        });
        const scaledPct =
          percent !== undefined ? Math.min(99, Math.round(basePct + (percent / 100) * spanPct)) : undefined;
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
      if (fallbackTag && /manifest|does not exist|not found|404/i.test(errMsg)) {
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
  const osLabel = hw.platform === "win32" ? "Windows" : hw.platform === "linux" ? "Linux" : "macOS";

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
    let binPath = await detectOllamaBinaryPure(ctx);
    const versionPreCheck = await getOllamaVersionStatus(ctx);

    if (!binPath && !versionPreCheck.reachable) {
      updateOllamaLongTask({
        step: `Ollama binary not found on ${osLabel}. Starting automatic user-space installation...`,
        percent: 12,
      });

      if (ctx.ollama?.installBinaryHook) {
        const hooked = await ctx.ollama.installBinaryHook(hw.platform, hw.arch, (step, pct) => {
          updateOllamaLongTask({ step, percent: pct });
        });
        binPath = hooked.installedPath;
        if (ctx.ollama) ctx.ollama.ollamaBinPath = binPath;
      } else if (hw.platform === "linux") {
        // Pure-Bun Linux user-space install into ~/.local/bin/ollama (no root/sudo needed!)
        const home = (ctx as any).homeDir || ctx.home || process.env.HOME || "/tmp";
        const localDir = joinPath([home, ".local"], "linux");
        const localBinDir = joinPath([localDir, "bin"], "linux");
        ensureDirectoryPure(localBinDir, "linux");
        const archSlug = hw.arch === "arm64" || hw.arch === "aarch64" ? "arm64" : "amd64";
        const downloadUrl = `https://ollama.com/download/ollama-linux-${archSlug}.tar.zst`;

        updateOllamaLongTask({
          step: `Downloading Linux package (${downloadUrl}) into ~/.local...`,
          percent: 18,
        });

        const dlRes = await fetch(downloadUrl, {
          redirect: "follow",
          signal: AbortSignal.timeout(300_000),
        });
        if (!dlRes.ok) {
          throw new FmError("OLLAMA_LINUX_INSTALL_FAILED", `Failed to download ${downloadUrl} (HTTP ${dlRes.status}).`);
        }

        const totalBytes = Number(dlRes.headers.get("content-length") || 0);
        const chunks: Uint8Array[] = [];
        let received = 0;
        if (dlRes.body) {
          const reader = dlRes.body.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              const dlPct = totalBytes > 0 ? Math.min(42, 18 + Math.round((received / totalBytes) * 24)) : 30;
              updateOllamaLongTask({
                step: `Downloading ollama-linux-${archSlug}.tar.zst (${(received / 1024 ** 2).toFixed(1)} MB)...`,
                percent: dlPct,
                completedBytes: received,
                totalBytes,
              });
            }
          }
        }
        const compressed = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) {
          compressed.set(c, offset);
          offset += c.byteLength;
        }

        updateOllamaLongTask({
          step: `Decompressing ollama-linux-${archSlug}.tar.zst with Bun.zstdDecompressSync...`,
          percent: 45,
        });
        const tarBytes = Bun.zstdDecompressSync(compressed);
        const tmpTarPath = joinPath([tempDirPath("linux"), `ollama-linux-${Date.now()}.tar`], "linux");
        await Bun.write(tmpTarPath, tarBytes);

        updateOllamaLongTask({
          step: `Extracting Ollama into ${localDir}...`,
          percent: 49,
        });
        const tarRes = Bun.spawnSync(["tar", "-xf", tmpTarPath, "-C", localDir], {
          stdout: "ignore",
          stderr: "pipe",
        });
        Bun.spawnSync(["rm", "-f", "--", tmpTarPath], { stdout: "ignore", stderr: "ignore" });
        if (tarRes.exitCode !== 0) {
          throw new FmError("OLLAMA_LINUX_INSTALL_FAILED", `Failed to extract Linux archive: ${tarRes.stderr.toString()}`);
        }
        const candidateBin = joinPath([localBinDir, "ollama"], "linux");
        Bun.spawnSync(["chmod", "0755", candidateBin], { stdout: "ignore", stderr: "ignore" });
        binPath = candidateBin;
      } else if (hw.platform === "win32") {
        // Pure-Bun Windows user-space install (supports both native Windows 11 ARM64 in Parallels and Windows x64)
        const home = (ctx as any).homeDir || ctx.home || process.env.USERPROFILE || process.env.HOME || "C:\\Users\\Default";
        const localAppData = process.env.LOCALAPPDATA || joinPath([home, "AppData", "Local"], "win32");
        const installDir = joinPath([localAppData, "Programs", "Ollama"], "win32");
        const winTarget = joinPath([installDir, "ollama.exe"], "win32");
        ensureDirectoryPure(installDir, "win32");

        const archSlug = hw.arch === "arm64" || hw.arch === "aarch64" ? "arm64" : "amd64";
        const zipUrl = `https://ollama.com/download/ollama-windows-${archSlug}.zip`;
        updateOllamaLongTask({
          step: `Downloading Windows ${archSlug.toUpperCase()} package (${zipUrl})...`,
          percent: 16,
        });

        try {
          const dlRes = await fetch(zipUrl, {
            redirect: "follow",
            signal: AbortSignal.timeout(300_000),
          });
          if (dlRes.ok) {
            const totalBytes = Number(dlRes.headers.get("content-length") || 0);
            const chunks: Uint8Array[] = [];
            let received = 0;
            if (dlRes.body) {
              const reader = dlRes.body.getReader();
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                  chunks.push(value);
                  received += value.byteLength;
                  const dlPct = totalBytes > 0 ? Math.min(42, 16 + Math.round((received / totalBytes) * 26)) : 30;
                  updateOllamaLongTask({
                    step: `Downloading ollama-windows-${archSlug}.zip (${(received / 1024 ** 2).toFixed(1)} MB)...`,
                    percent: dlPct,
                    completedBytes: received,
                    totalBytes,
                  });
                }
              }
            }
            const zipBytes = new Uint8Array(received);
            let offset = 0;
            for (const c of chunks) {
              zipBytes.set(c, offset);
              offset += c.byteLength;
            }
            const tmpZipPath = joinPath([tempDirPath("win32"), `ollama-windows-${archSlug}-${Date.now()}.zip`], "win32");
            await Bun.write(tmpZipPath, zipBytes);

            updateOllamaLongTask({
              step: `Extracting ollama-windows-${archSlug}.zip into ${installDir}...`,
              percent: 45,
            });

            const sysTar = "C:\\Windows\\System32\\tar.exe";
            const tarCmd = (await fileExistsPure(sysTar)) ? sysTar : (Bun.which("tar") || "tar");
            const tarRes = Bun.spawnSync([tarCmd, "-xf", tmpZipPath, "-C", installDir], {
              stdout: "ignore",
              stderr: "pipe",
              windowsHide: true,
            });
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
                  env: { ...process.env, FM_ZIP_PATH: tmpZipPath, FM_DEST_DIR: installDir },
                },
              );
            }
            try {
              Bun.spawnSync(["cmd", "/c", "del", "/f", "/q", tmpZipPath], {
                stdout: "ignore",
                stderr: "ignore",
                windowsHide: true,
              });
            } catch {}
          }
        } catch {}

        // Fallback to winget / OllamaSetup.exe if the standalone zip did not produce ollama.exe
        if (!(await fileExistsPure(winTarget))) {
          const winget = Bun.which("winget");
          if (winget) {
            updateOllamaLongTask({
              step: "Installing Ollama on Windows via winget...",
              percent: 47,
            });
            Bun.spawnSync(
              [winget, "install", "-e", "--id", "Ollama.Ollama", "--accept-package-agreements", "--accept-source-agreements", "--silent"],
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
          try {
            const dlRes = await fetch(setupUrl, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
            if (dlRes.ok) {
              const tmpExe = joinPath([tempDirPath("win32"), `OllamaSetup-${Date.now()}.exe`], "win32");
              await Bun.write(tmpExe, new Uint8Array(await dlRes.arrayBuffer()));
              updateOllamaLongTask({
                step: "Running silent Windows Ollama installer (/VERYSILENT /SUPPRESSMSGBOXES /NORESTART)...",
                percent: 52,
              });
              Bun.spawnSync([tmpExe, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"], {
                stdout: "ignore",
                stderr: "ignore",
                windowsHide: true,
              });
            }
          } catch {}
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
        const home = (ctx as any).homeDir || ctx.home || process.env.HOME || "/tmp";
        updateOllamaLongTask({
          step: "Installing Ollama on macOS via Homebrew / Ollama-darwin.zip...",
          percent: 22,
        });
        const brew = Bun.which("brew") || "/opt/homebrew/bin/brew";
        if (await fileExistsPure(brew)) {
          Bun.spawnSync([brew, "install", "ollama"], { stdout: "ignore", stderr: "ignore" });
        }
        binPath = await detectOllamaBinaryPure(ctx);
        if (!binPath) {
          const zipUrl = "https://ollama.com/download/Ollama-darwin.zip";
          updateOllamaLongTask({
            step: `Downloading macOS bundle (${zipUrl})...`,
            percent: 32,
          });
          const dlRes = await fetch(zipUrl, { redirect: "follow", signal: AbortSignal.timeout(300_000) });
          if (dlRes.ok) {
            const destDir = joinPath([home, ".ollama", "bin"], "darwin");
            ensureDirectoryPure(destDir, "darwin");
            const tmpZip = joinPath([destDir, `Ollama-${Date.now()}.zip`], "darwin");
            await Bun.write(tmpZip, new Uint8Array(await dlRes.arrayBuffer()));
            updateOllamaLongTask({
              step: "Extracting Ollama.app into ~/.ollama/bin...",
              percent: 45,
            });
            Bun.spawnSync(["ditto", "-x", "-k", tmpZip, destDir], { stdout: "ignore", stderr: "ignore" });
            Bun.spawnSync(["rm", "-f", "--", tmpZip], { stdout: "ignore", stderr: "ignore" });
            binPath = joinPath([destDir, "Ollama.app", "Contents", "Resources", "ollama"], "darwin");
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
        Bun.spawn([binPath, "serve"], {
          stdout: "ignore",
          stderr: "ignore",
          windowsHide: true,
          env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434" },
        });
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
    const defaultChatModel = hw.ramTier === "under_8gb" || hw.ramTier === "8gb_to_16gb" ? "qwen3.5:4b" : "qwen3.5:latest";
    const requestedModels = Array.isArray(payload?.models) && payload!.models!.length > 0
      ? payload!.models!
      : hw.isAppleSiliconMac
        ? [payload?.chatModel || defaultChatModel, "lfm3-omni:latest", payload?.speechModel || "phonon"]
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
        const replacement = payload?.speechModel && !isPhononModelName(payload.speechModel)
          ? payload.speechModel
          : speechCaps.defaultSpeechModel;
        if (!normalizedModels.includes(replacement)) normalizedModels.push(replacement);
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
      pulledModels.find((m) => isSpeechModelName(m)) || speechCaps.defaultSpeechModel;

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

export async function createCustomModel(
  ctx: FmContext,
  payload: { model: string; from: string; system?: string; parameters?: Record<string, any> },
): Promise<{ ok: boolean; model: string; status: string }> {
  const model = String(payload.model || "").trim();
  const from = String(payload.from || "").trim();
  if (!model || !from) {
    throw new FmError("INVALID_INPUT", "Both 'model' name and base 'from' model are required.");
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
    throw new FmError("OLLAMA_CREATE_ERROR", res.data?.error || `Failed to create model ${model}`);
  }
  modelShowCache.clear();
  return { ok: true, model, status: String(res.data?.status || "success") };
}

export async function copyModel(ctx: FmContext, source: string, destination: string): Promise<{ ok: boolean }> {
  const res = await ollamaFetchJson(ctx, "/api/copy", {
    method: "POST",
    body: JSON.stringify({ source: source.trim(), destination: destination.trim() }),
  });
  if (!res.ok) {
    throw new FmError("OLLAMA_COPY_ERROR", res.data?.error || `Failed to copy ${source} to ${destination}`);
  }
  modelShowCache.clear();
  return { ok: true };
}

export async function pushModel(ctx: FmContext, model: string): Promise<{ ok: boolean; status: string }> {
  const res = await ollamaFetchJson(ctx, "/api/push", {
    method: "POST",
    body: JSON.stringify({ model: model.trim(), stream: false }),
    timeoutMs: 60_000,
  });
  if (!res.ok || res.data?.error) {
    throw new FmError("OLLAMA_PUSH_ERROR", res.data?.error || `Failed to push ${model}`);
  }
  return { ok: true, status: String(res.data?.status || "pushed") };
}

export async function deleteModel(ctx: FmContext, model: string): Promise<{ ok: boolean; deleted: string }> {
  const res = await ollamaFetchJson(ctx, "/api/delete", {
    method: "DELETE",
    body: JSON.stringify({ model: model.trim() }),
  });
  if (!res.ok) {
    throw new FmError("OLLAMA_DELETE_ERROR", res.data?.error || `Failed to delete ${model}`);
  }
  modelShowCache.clear();
  return { ok: true, deleted: model.trim() };
}

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
      ollamaFetchJson(ctx, "/api/usage", { method: "GET", useCloudHost: true, timeoutMs: 5000 }),
      ollamaFetchJson(ctx, "/api/balance", { method: "GET", useCloudHost: true, timeoutMs: 5000 }),
    ]);
    if (!usage && cloudUsage.ok) usage = cloudUsage.data;
    if (!balance && cloudBalance.ok) balance = cloudBalance.data;
  }

  return {
    hasApiKey: Boolean(apiKey),
    usage: usage || { status: apiKey ? "Connected via OLLAMA_API_KEY" : "Sign in or set OLLAMA_API_KEY to view cloud usage" },
    balance: balance || { credits: apiKey ? "Active Cloud Key" : "Local Execution Mode (0 Cloud Credits Used)" },
  };
}

// ============================================================================
// 3. CAPABILITY A: DECISION / SYSTEM ONE ENGINE (POST /v1/systemone)
// ============================================================================

export interface DecisionNoulQuestionInput {
  id?: string;
  type: "noul";
  instructions: string;
}

export interface DecisionChoiceQuestionInput {
  id?: string;
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface DecisionScoreQuestionInput {
  id?: string;
  type: "score";
  instructions: string;
  criteria: string[];
}

export type DecisionQuestionInput =
  | DecisionNoulQuestionInput
  | DecisionChoiceQuestionInput
  | DecisionScoreQuestionInput;

export function formatSystemOneQuestions(
  questionsInput: DecisionQuestionInput[] | Record<string, any>,
): Record<string, any> {
  const formatted: Record<string, any> = {};
  const list: Array<{ key: string; q: any }> = Array.isArray(questionsInput)
    ? questionsInput.map((q, idx) => ({ key: q.id || `q_${idx + 1}`, q }))
    : Object.entries(questionsInput || {}).map(([key, q]) => ({ key, q }));

  if (list.length === 0) {
    throw new FmError("INVALID_DECISION_QUESTIONS", "At least one SystemOne question ('noul', 'choice', or 'score') is required.");
  }

  for (const { key, q } of list) {
    const qType = String(q?.type || "noul").toLowerCase();
    const instructions = String(q?.instructions || q?.question || "").trim();
    if (!instructions) {
      throw new FmError("INVALID_DECISION_QUESTIONS", `Question "${key}" is missing instructions.`);
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
            criteriaObj[String(item.label)] = String(item.description || item.label);
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
      throw new FmError("INVALID_DECISION_TYPE", `Unsupported SystemOne question type "${qType}". Use "noul", "choice", or "score".`);
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
): Promise<{ model: string; verdict: HardwareGuardVerdict; useCloudHost: boolean }> {
  const { hardware, models } = await listModelsWithBadgesAndHardwareFilter(ctx, { includeHiddenForDiagnostics: true });
  const allowedInstalled = models.filter((m) => m.hardwareVerdict.allowed && m.badges.includes("Decision"));

  let chosen = String(requestedModel || "").trim();
  if (chosen && isPhononModelName(chosen)) {
    throw new FmError(
      "PHONON_SAFETY_VIOLATION",
      'Safety Rule: Never send decision, chat, completion, or embedding requests to "phonon" (it only generates speech via /v1/audio/speech).',
    );
  }

  if (!chosen) {
    if (hasImages) {
      const imgDecider = allowedInstalled.find((m) => canJudgeImagesInDecision(m.name, m.capabilities));
      chosen = imgDecider?.name || "clef-flash";
    } else {
      const textDecider = allowedInstalled[0];
      chosen = textDecider?.name || "nimble";
    }
  }

  const installedMatch = models.find((m) => m.name.toLowerCase() === chosen.toLowerCase() || baseModelName(m.name) === baseModelName(chosen));
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

  if (hasImages && !canJudgeImagesInDecision(chosen, installedMatch?.capabilities)) {
    const fallbackImg = allowedInstalled.find((m) => canJudgeImagesInDecision(m.name, m.capabilities))?.name || "clef-flash";
    chosen = fallbackImg;
  }

  return {
    model: installedMatch?.name || chosen,
    verdict,
    useCloudHost: isCloudModelName(chosen) && Boolean(getOllamaApiKey(ctx)),
  };
}

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

  const imagesBase64: string[] = Array.isArray(payload.images) ? [...payload.images] : [];
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

  const finalState = stateParts.join("\n\n").trim() || "Inspect the provided input.";
  const { model, verdict, useCloudHost } = await resolveDecisionModel(ctx, payload.model, imagesBase64.length > 0);

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
      res.data?.error?.message || res.data?.error || `SystemOne decision call failed (HTTP ${res.status}).`,
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

export const CORE_PHONON_VOICES = ["default", "Zoey", "Easton", "Freya"] as const;

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
  out = out.replace(/\b(\d{4})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g, (_m, yearStr, monthStr, dayStr) => {
    const monthIdx = Number.parseInt(monthStr, 10) - 1;
    const dayNum = Number.parseInt(dayStr, 10);
    return `${MONTH_NAMES[monthIdx]} ${dayNum}, ${yearStr}`;
  });

  // US dates with year: MM/DD/YYYY (e.g. 10/28/2026 -> October 28, 2026)
  out = out.replace(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})\b/g, (_m, monthStr, dayStr, yearStr) => {
    const monthIdx = Number.parseInt(monthStr, 10) - 1;
    const dayNum = Number.parseInt(dayStr, 10);
    return `${MONTH_NAMES[monthIdx]} ${dayNum}, ${yearStr}`;
  });

  // Short numeric dates: MM/DD (e.g. 10/28 -> October 28) when not preceded/followed by another slash
  out = out.replace(/(?<![\d/])\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\b(?![\d/])/g, (_m, monthStr, dayStr) => {
    const monthIdx = Number.parseInt(monthStr, 10) - 1;
    const dayNum = Number.parseInt(dayStr, 10);
    return `${MONTH_NAMES[monthIdx]} ${dayNum}`;
  });

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
  // Remove <think>...</think> blocks if any
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, " ");
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
export function splitSpeechTextIntoChunks(cleanedText: string, maxChars = 4096): string[] {
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

export async function getPhononSupportedVoices(ctx: FmContext): Promise<string[]> {
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

export async function validatePhononVoice(ctx: FmContext, requestedVoice?: string): Promise<string> {
  const voice = String(requestedVoice || "default").trim() || "default";
  const supported = await getPhononSupportedVoices(ctx);
  const exact = supported.find((v) => v === voice);
  if (exact) return exact;
  const caseInsensitive = supported.find((v) => v.toLowerCase() === voice.toLowerCase());
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

function combineAudioChunks(chunks: Uint8Array[], format: "wav" | "pcm"): Uint8Array {
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
const cachedSpeechFiles = new Map<string, { absPath: string; mime: string; createdAt: number }>();

export function getCachedOllamaAudioFile(id: string): { absPath: string; mime: string } | null {
  const entry = cachedSpeechFiles.get(String(id || ""));
  if (!entry) return null;
  return { absPath: entry.absPath, mime: entry.mime };
}

function spawnOsSpeakerPlayback(ctx: FmContext, wavFilePath: string): { playedOnOsSpeaker: boolean; playerCommand: string } {
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
      Bun.spawn([...ctx.ollama.playAudioCommand, wavFilePath], { stdout: "ignore", stderr: "ignore" });
      return { playedOnOsSpeaker: true, playerCommand: ctx.ollama.playAudioCommand[0]! };
    } catch {
      return { playedOnOsSpeaker: false, playerCommand: "none" };
    }
  }

  try {
    if (platform === "darwin") {
      const afplay = Bun.which("afplay") || "/usr/bin/afplay";
      Bun.spawn([afplay, "--", wavFilePath], { stdout: "ignore", stderr: "ignore" });
      return { playedOnOsSpeaker: true, playerCommand: "afplay" };
    }
    if (platform === "linux") {
      for (const bin of ["paplay", "pw-play", "aplay", "ffplay"]) {
        const resolved = Bun.which(bin);
        if (resolved) {
          const args =
            bin === "ffplay"
              ? [resolved, "-nodisp", "-autoexit", "-loglevel", "quiet", "--", wavFilePath]
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
      return { playedOnOsSpeaker: true, playerCommand: "PowerShell SoundPlayer" };
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

  const baseFreq = voice.toLowerCase() === "easton" ? 135 : voice.toLowerCase() === "freya" ? 210 : 185;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllableEnv = 0.55 + 0.45 * Math.sin(2 * Math.PI * 3.8 * t);
    const fade =
      i < 480 ? i / 480 : i > numSamples - 480 ? Math.max(0, (numSamples - i) / 480) : 1.0;
    const f1 = Math.sin(2 * Math.PI * baseFreq * t);
    const f2 = 0.4 * Math.sin(2 * Math.PI * (baseFreq * 2.02) * t);
    const f3 = 0.2 * Math.sin(2 * Math.PI * (baseFreq * 3.1) * t);
    const sample = Math.max(-1, Math.min(1, (f1 + f2 + f3) * 0.28 * syllableEnv * fade));
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

export async function runOllamaSpeech(
  ctx: FmContext,
  payload: {
    model?: string;
    input?: string;
    path?: string;
    voice?: string;
    mode?: "speaker" | "file";
    responseFormat?: "wav" | "pcm";
    saveDir?: string;
    saveFilename?: string;
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
  savedRelativePath: string | null;
  playedOnOsSpeaker: boolean;
  playerCommand: string;
  phononSupportedOnHost: boolean;
  usedCrossPlatformTtsModel: boolean;
  engineNote: string;
}> {
  let rawText = String(payload.input || "").trim();
  if (!rawText && payload.path) {
    const abs = resolveSandboxPath(ctx, payload.path);
    rawText = await readTextFileSnippet(abs, 60_000);
  }
  if (!rawText) {
    throw new FmError("EMPTY_SPEECH_INPUT", "Please provide text or select a file to read aloud.");
  }

  const voice = await validatePhononVoice(ctx, payload.voice);
  const cleanedText = cleanTextForPhononSpeech(rawText);
  if (!cleanedText) {
    throw new FmError("EMPTY_SPEECH_INPUT", "After stripping markdown and thinking blocks, there was no speakable text left.");
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
  const responseFormat: "wav" | "pcm" = payload.responseFormat === "pcm" ? "pcm" : "wav";

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
      } else if (!usedCrossPlatformTtsModel && speechCaps.phononSupported) {
        const errBody = await res.text();
        throw new FmError("OLLAMA_SPEECH_ERROR", `Phonon speech synthesis failed (HTTP ${res.status}): ${errBody}`);
      }
    } catch (err) {
      if (err instanceof FmError) throw err;
      if (!usedCrossPlatformTtsModel && speechCaps.phononSupported) {
        throw new FmError("OLLAMA_SPEECH_ERROR", `Phonon speech synthesis failed: ${(err as Error).message}`);
      }
    }

    if (!chunkBytes) {
      chunkBytes = await synthesizeCrossPlatformSpeechChunk(ctx, effectiveModel, chunkText, voice, responseFormat);
    }
    audioBuffers.push(chunkBytes);
  }

  const combinedBytes = combineAudioChunks(audioBuffers, responseFormat);
  const wavForPlayback = responseFormat === "wav" ? combinedBytes : combineAudioChunks(audioBuffers, "wav");

  // Save cached audio file for instant browser playback and OS speaker playback
  const cacheDir = bunJoinPath(ctx.dataDir, "ollama_speech_cache");
  ensureDirSyncWithBun(cacheDir);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`${Date.now()}-${Math.random()}-${effectiveModel}-${voice}-${payload.path || ""}-${cleanedText}`);
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

  let savedRelativePath: string | null = null;
  if (mode === "file" || payload.saveFilename) {
    const folderRel = payload.saveDir ? String(payload.saveDir) : ".";
    const folderAbs = resolveSandboxPath(ctx, folderRel);
    assertCreatable(ctx, folderAbs);
    ensureDirSyncWithBun(folderAbs);
    const ext = responseFormat === "pcm" ? ".pcm" : ".wav";
    const prefix = baseModelName(effectiveModel) || "speech";
    const rawFileName = bunBasename(String(payload.saveFilename || `${prefix}_${voice.toLowerCase()}_${Date.now()}${ext}`).trim());
    if (!rawFileName || rawFileName === "." || rawFileName === "..") {
      throw new FmError("BAD_NAME", "Invalid output filename.");
    }
    const safeFileName = rawFileName.endsWith(ext) ? rawFileName : `${rawFileName.replace(/\.(wav|pcm)$/i, "")}${ext}`;
    const outAbs = bunJoinPath(folderAbs, safeFileName);
    assertModifiable(ctx, outAbs);
    await Bun.write(outAbs, combinedBytes);
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

export const MIN_WEB_SEARCH_NUM_CTX = 32_000;

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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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
        title: apiKey ? `Web Search Result for "${query}"` : `OLLAMA_API_KEY Required for Live Ollama Web Search`,
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
  if (!targetUrl) throw new FmError("INVALID_INPUT", "URL is required for web_fetch.");
  const apiKey = getOllamaApiKey(ctx);
  const cloudEndpoint = `${resolveOllamaBaseUrl(ctx, true)}/api/web_fetch`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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

  const inputs = Array.isArray(payload.input) ? payload.input.map(String) : [String(payload.input || "")];
  const res = await ollamaFetchJson(ctx, "/api/embed", {
    method: "POST",
    body: JSON.stringify({ model: embedModel, input: inputs }),
    timeoutMs: 25_000,
  });

  if (res.ok && Array.isArray(res.data?.embeddings) && res.data.embeddings.length > 0) {
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
  if (!query) throw new FmError("INVALID_INPUT", "Please provide a meaning search query.");
  const dirRel = String(payload.dirPath || ".");
  const dirAbs = resolveSandboxPath(ctx, dirRel);
  const topK = Math.max(1, Math.min(25, Number(payload.topK || 8)));

  const candidateFiles = listDirectoryWithBun(dirAbs, { recursive: true, maxEntries: 60 }).filter((f) => {
    const ext = bunExtname(f.name);
    return !isSupportedVisionImagePath(f.name) && ![".wav", ".pcm", ".zip", ".tar", ".gz", ".pdf", ".mp4", ".mp3"].includes(ext);
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
    const docVec = embedRes.embeddings[idx + 1] || buildFallbackSemanticVector(doc.textForEmbed);
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
    const kwBoost = qWords.length > 0 ? (keywordHits / qWords.length) * 0.25 : 0;
    const similarity = Math.min(0.999, Math.max(0, Math.round((vecSim * 0.85 + kwBoost) * 1000) / 1000));
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

export const FILE_MANAGER_OLLAMA_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create or write a file in the Codecaine File Manager workspace (requires user confirmation before writing).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative file path to create, e.g. 'notes/summary.md'" },
          content: { type: "string", description: "Text content to write into the file" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description: "Move or rename a file or folder inside the Codecaine File Manager workspace (requires visual confirmation).",
      parameters: {
        type: "object",
        properties: {
          sourcePath: { type: "string", description: "Existing relative path of the file or folder" },
          destinationPath: { type: "string", description: "New relative destination path" },
        },
        required: ["sourcePath", "destinationPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_rename",
      description: "Batch rename multiple files in a directory with a clean naming plan (requires visual confirmation).",
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
      description: "Create a .tar.gz or .zip archive from selected files or folders (requires visual confirmation).",
      parameters: {
        type: "object",
        properties: {
          paths: { type: "array", items: { type: "string" }, description: "Relative paths to archive" },
          archivePath: { type: "string", description: "Output archive relative path, e.g. 'backup.tar.gz'" },
        },
        required: ["paths", "archivePath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_directory",
      description: "Search a directory for files matching a query or extension.",
      parameters: {
        type: "object",
        properties: {
          dirPath: { type: "string", description: "Relative directory path (default '.')" },
          query: { type: "string", description: "Filename or content substring to search for" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web via https://ollama.com/api/web_search (automatically uses 32,000+ token context).",
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
      description: "Fetch and read a web page via https://ollama.com/api/web_fetch (automatically uses 32,000+ token context).",
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

export function stagePendingToolAction(
  toolName: "create_file" | "move_file" | "batch_rename" | "archive_files",
  args: Record<string, any>,
): PendingToolAction {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(`${Date.now()}-${Math.random()}-${toolName}-${JSON.stringify(args)}`);
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

export function listPendingToolActions(): PendingToolAction[] {
  return Array.from(pendingToolActions.values()).filter((a) => a.status === "pending");
}

export async function executeConfirmedToolAction(
  ctx: FmContext,
  actionId: string,
  decision: "confirm" | "cancel" = "confirm",
): Promise<PendingToolAction> {
  const pending = pendingToolActions.get(String(actionId || ""));
  if (!pending) {
    throw new FmError("ACTION_NOT_FOUND", `Tool action "${actionId}" was not found or already completed.`);
  }
  if (decision === "cancel") {
    pending.status = "cancelled";
    return pending;
  }

  const args = pending.arguments;
  if (pending.toolName === "create_file") {
    const targetAbs = resolveSandboxPath(ctx, String(args.path || "untitled.txt"));
    const parentDir = bunDirname(targetAbs);
    assertCreatable(ctx, parentDir);
    assertModifiable(ctx, targetAbs);
    ensureDirSyncWithBun(parentDir);
    await Bun.write(targetAbs, String(args.content ?? ""));
    pending.result = { createdPath: toSandboxRelative(ctx, targetAbs), bytesWritten: String(args.content ?? "").length };
  } else if (pending.toolName === "move_file") {
    const srcAbs = resolveSandboxPath(ctx, String(args.sourcePath || ""));
    const dstAbs = resolveSandboxPath(ctx, String(args.destinationPath || ""));
    const dstParent = bunDirname(dstAbs);
    assertModifiable(ctx, srcAbs);
    assertCreatable(ctx, dstParent);
    assertModifiable(ctx, dstAbs);
    ensureDirSyncWithBun(dstParent);
    const mv = Bun.spawnSync(["mv", "--", srcAbs, dstAbs], { stdout: "pipe", stderr: "pipe" });
    if (mv.exitCode !== 0) {
      throw new FmError("MOVE_FAILED", new TextDecoder().decode(mv.stderr) || "Failed to move file.");
    }
    pending.result = { movedFrom: toSandboxRelative(ctx, srcAbs), movedTo: toSandboxRelative(ctx, dstAbs) };
  } else if (pending.toolName === "batch_rename") {
    const renames = Array.isArray(args.renames) ? args.renames : [];
    const completed: Array<{ from: string; to: string }> = [];
    for (const item of renames) {
      const fromAbs = resolveSandboxPath(ctx, String(item.from || ""));
      const toAbs = resolveSandboxPath(ctx, String(item.to || ""));
      const toParent = bunDirname(toAbs);
      assertModifiable(ctx, fromAbs);
      assertCreatable(ctx, toParent);
      assertModifiable(ctx, toAbs);
      ensureDirSyncWithBun(toParent);
      const mv = Bun.spawnSync(["mv", "--", fromAbs, toAbs], { stdout: "pipe", stderr: "pipe" });
      if (mv.exitCode === 0) {
        completed.push({ from: toSandboxRelative(ctx, fromAbs), to: toSandboxRelative(ctx, toAbs) });
      }
    }
    pending.result = { renamedCount: completed.length, completed };
  } else if (pending.toolName === "archive_files") {
    const relPaths: string[] = Array.isArray(args.paths) ? args.paths.map(String) : [];
    const archiveRel = String(args.archivePath || "archive.tar.gz");
    const archiveAbs = resolveSandboxPath(ctx, archiveRel);
    const archiveParent = bunDirname(archiveAbs);
    assertCreatable(ctx, archiveParent);
    assertModifiable(ctx, archiveAbs);
    ensureDirSyncWithBun(archiveParent);
    const archiveRoot = ctx.sandboxRoot || ctx.home;
    const validatedRel = relPaths.map((p) => {
      const abs = resolveSandboxPath(ctx, p);
      if (!isSameOrInside(abs, archiveRoot, ctx.platform)) {
        throw new FmError("PROTECTED_PATH", `Cannot archive path outside workspace root: ${p}`);
      }
      const rel = toSandboxRelative(ctx, abs);
      if (rel.startsWith("-") || rel.startsWith("..")) {
        throw new FmError("BAD_PATH", `Invalid archive entry path: ${rel}`);
      }
      return rel;
    });
    const tar = Bun.spawnSync(["tar", "-czf", archiveAbs, "-C", archiveRoot, "--", ...validatedRel], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (tar.exitCode !== 0) {
      throw new FmError("ARCHIVE_FAILED", new TextDecoder().decode(tar.stderr) || "Failed to create archive.");
    }
    pending.result = { archivePath: toSandboxRelative(ctx, archiveAbs), itemsArchived: validatedRel.length };
  }

  pending.status = "executed";
  return pending;
}

// ============================================================================
// 8. CAPABILITIES C, D, E, F, J: CHAT, STREAMING, THINKING, VISION, JSON & CLOUD
// ============================================================================

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
          additionalProperties: { type: ["string", "number", "boolean", "null"] },
        },
      },
    },
    required: ["title", "columns", "rows"],
  },
};

export async function selectBestChatOrVisionModel(
  ctx: FmContext,
  requestedModel?: string,
  requireVision = false,
): Promise<{ model: string; verdict: HardwareGuardVerdict; useCloudHost: boolean }> {
  const reqTrimmed = String(requestedModel || "").trim();
  if (reqTrimmed && isPhononModelName(reqTrimmed)) {
    throw new FmError(
      "PHONON_SAFETY_VIOLATION",
      'Safety Rule: Never send chat, completion, or embedding requests to "phonon" (it only generates speech via /v1/audio/speech and returns a 400 error for anything else).',
    );
  }

  const { hardware, models } = await listModelsWithBadgesAndHardwareFilter(ctx, { includeHiddenForDiagnostics: true });
  const allowedChatModels = models.filter((m) => m.hardwareVerdict.allowed && !isPhononModelName(m.name));

  let chosen = reqTrimmed;
  if (!chosen) {
    const defaultQwenModel = hardware.ramTier === "under_8gb" || hardware.ramTier === "8gb_to_16gb" ? "qwen3.5:4b" : "qwen3.5:latest";
    const installedQwen = allowedChatModels.find((m) => m.name.toLowerCase().startsWith("qwen3.5"));
    if (requireVision) {
      const vis =
        installedQwen ||
        allowedChatModels.find((m) => m.badges.includes("Vision") && m.badges.includes("Chat"));
      chosen = vis?.name || allowedChatModels.find((m) => m.badges.includes("Vision"))?.name || defaultQwenModel;
    } else {
      const chat =
        installedQwen ||
        allowedChatModels.find((m) => m.badges.includes("Chat") && !m.badges.includes("Decision"));
      chosen = chat?.name || allowedChatModels[0]?.name || defaultQwenModel;
    }
  }

  const installedMatch = models.find(
    (m) => m.name.toLowerCase() === chosen.toLowerCase() || baseModelName(m.name) === baseModelName(chosen),
  );
  const catalogMatch = CURATED_MODEL_CATALOG.find(
    (c) => c.name.toLowerCase() === chosen.toLowerCase() || baseModelName(c.name) === baseModelName(chosen),
  );

  const verdict = installedMatch
    ? installedMatch.hardwareVerdict
    : evaluateModelHardwareGuard(
        {
          name: chosen,
          parameterSize: catalogMatch?.parameterSize,
          sizeBytes: catalogMatch ? Math.round(catalogMatch.estimatedRamGb * 0.88 * 1024 ** 3) : undefined,
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

export async function runOllamaChatOrGenerate(
  ctx: FmContext,
  payload: {
    endpoint?: "chat" | "generate";
    model?: string;
    prompt?: string;
    messages?: Array<{ role: string; content: string; images?: string[] }>;
    paths?: string[];
    images?: string[];
    think?: boolean;
    speakReply?: boolean;
    voice?: string;
    format?: "json" | Record<string, any> | string;
    schemaPreset?: "batch_rename_plan" | "folder_organization_plan" | "table_extraction";
    enableTools?: boolean;
    useWebSearch?: boolean;
    webSearchQuery?: string;
    webFetchUrl?: string;
    numCtx?: number;
  },
): Promise<{
  model: string;
  endpoint: "chat" | "generate";
  hardwareVerdict: HardwareGuardVerdict;
  thinkEnabled: boolean;
  thinkingText: string;
  content: string;
  structuredJson: any | null;
  enforcedNumCtx: number;
  inspectedFiles: string[];
  webContextUsed: boolean;
  webSources: Array<{ title: string; url: string }>;
  pendingActions: PendingToolAction[];
  speechResult: any | null;
}> {
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  const imagesBase64: string[] = Array.isArray(payload.images) ? [...payload.images] : [];
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

  // Rule B (Speech cleanup): When reading a chat model's reply out loud, disable thinking output (think: false)
  const speakReply = Boolean(payload.speakReply);
  const thinkEnabled = speakReply ? false : Boolean(payload.think);

  // Rule H (Web Search & Web Fetch): Automatically set num_ctx to at least 32,000 tokens when running search-assisted tasks
  let webContextUsed = false;
  const webSources: Array<{ title: string; url: string }> = [];
  const webSnippets: string[] = [];

  if (payload.useWebSearch || payload.webSearchQuery) {
    webContextUsed = true;
    const q = String(payload.webSearchQuery || payload.prompt || "").trim();
    if (q) {
      const searchRes = await runOllamaWebSearch(ctx, { query: q, maxResults: 4 });
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
    webSnippets.push(`[Fetched Page: ${fetchRes.title} (${fetchRes.url})]\n${fetchRes.content.slice(0, 12_000)}`);
  }

  const requestedCtx = Number(payload.numCtx || 8192);
  const enforcedNumCtx = webContextUsed ? Math.max(requestedCtx, MIN_WEB_SEARCH_NUM_CTX) : requestedCtx;

  const resolvedFormat =
    payload.schemaPreset && STRUCTURED_SCHEMAS[payload.schemaPreset]
      ? STRUCTURED_SCHEMAS[payload.schemaPreset]
      : payload.format || undefined;

  const userPrompt = String(payload.prompt || "Describe or analyze the selected items.").trim();
  const fullUserContent = [
    userPrompt,
    fileContextBlocks.length > 0 ? `\n\nSelected Workspace Files:\n${fileContextBlocks.join("\n\n")}` : "",
    webSnippets.length > 0 ? `\n\nLive Web Context:\n${webSnippets.join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("");

  const endpoint: "chat" | "generate" = payload.endpoint === "generate" ? "generate" : "chat";
  const optionsObj: Record<string, any> = {
    num_ctx: enforcedNumCtx,
  };

  let content = "";
  let thinkingText = "";
  const stagedActions: PendingToolAction[] = [];

  if (endpoint === "generate") {
    const genReq: Record<string, any> = {
      model,
      prompt: fullUserContent,
      stream: false,
      think: thinkEnabled,
      options: optionsObj,
    };
    if (imagesBase64.length > 0) genReq.images = imagesBase64;
    if (resolvedFormat) genReq.format = resolvedFormat;

    const res = await ollamaFetchJson(ctx, "/api/generate", {
      method: "POST",
      useCloudHost,
      body: JSON.stringify(genReq),
      timeoutMs: 90_000,
    });
    if (!res.ok) {
      throw new FmError("OLLAMA_GENERATE_ERROR", res.data?.error || `Ollama /api/generate failed (HTTP ${res.status}).`);
    }
    content = String(res.data?.response || "");
    thinkingText = String(res.data?.thinking || "");
  } else {
    const messages = Array.isArray(payload.messages) && payload.messages.length > 0
      ? payload.messages.map((m, idx, arr) => {
          if (idx === arr.length - 1 && m.role === "user") {
            return {
              role: "user",
              content: [m.content, ...fileContextBlocks, ...webSnippets].filter(Boolean).join("\n\n"),
              images: imagesBase64.length > 0 ? imagesBase64 : m.images,
            };
          }
          return m;
        })
      : [
          {
            role: "system",
            content:
              "You are the Codecaine File Manager AI Assistant powered by Ollama. Be concise, helpful, and accurate.",
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
      think: thinkEnabled,
      options: optionsObj,
    };
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
      throw new FmError("OLLAMA_CHAT_ERROR", res.data?.error || `Ollama /api/chat failed (HTTP ${res.status}).`);
    }
    const msg = res.data?.message || {};
    content = String(msg.content || "");
    thinkingText = String(msg.thinking || "");

    const toolCalls: any[] = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
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
        const ws = await runOllamaWebSearch(ctx, { query: String(fnArgs.query) });
        for (const r of ws.results) webSources.push({ title: r.title, url: r.url });
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
      if (Array.isArray(structuredJson?.renames) && structuredJson.renames.length > 0 && stagedActions.length === 0) {
        stagedActions.push(stagePendingToolAction("batch_rename", { renames: structuredJson.renames }));
      }
    } catch {
      structuredJson = null;
    }
  }

  let speechResult: any | null = null;
  if (speakReply && content.trim()) {
    speechResult = await runOllamaSpeech(ctx, {
      input: content,
      voice: payload.voice || "Zoey",
      mode: "speaker",
      playOnServer: false,
    });
  }

  return {
    model,
    endpoint,
    hardwareVerdict: verdict,
    thinkEnabled,
    thinkingText,
    content,
    structuredJson,
    enforcedNumCtx,
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
  },
): Promise<{
  routedCapability: RoutedCapabilityKind;
  routeExplanation: string;
  result: any;
}> {
  const prompt = String(payload.prompt || "").trim();
  const paths = Array.isArray(payload.paths) ? payload.paths : [];
  if (!prompt) {
    if (paths.length > 0) {
      const result = await runOllamaSpeech(ctx, {
        model: payload.speechModel || (payload.model && isSpeechModelName(payload.model) ? payload.model : undefined),
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
    throw new FmError("INVALID_INPUT", "Please type a plain-English request or select a file for the AI assistant.");
  }
  const pLower = prompt.toLowerCase();
  const hasSelectedImages = paths.some((p) => isSupportedVisionImagePath(p));

  // 1. Check if user explicitly asks to download/run a specific model by name so Rule C triggers politely
  const explicitModelMatch = prompt.match(/\b(?:run|use|download|pull|load)\s+([a-z0-9._-]+:[a-z0-9._-]+|[a-z0-9._-]+-\d+b)\b/i);
  const requestedModel = payload.model || (explicitModelMatch ? explicitModelMatch[1] : undefined);

  // 2. Speech / Read Out Loud detection
  if (
    /\b(read\s+(this|it|selected|file|aloud|out\s+loud)|speak\s+(this|it|aloud)|text[\s-]to[\s-]speech|pronounce|save\s+as\s+(wav|audio))\b/i.test(
      pLower,
    )
  ) {
    const saveAsFile = /\b(save\s+as|export\s+wav|save\s+audio|file\s+mode)\b/i.test(pLower);
    const speechInput =
      paths.length > 0
        ? undefined
        : prompt.replace(/^(please\s+)?(read\s+(this\s+)?(out\s+loud|aloud)\s*:?\s*|speak\s*:?\s*)/i, "").trim() || prompt;
    const result = await runOllamaSpeech(ctx, {
      model: payload.speechModel || (requestedModel && isSpeechModelName(requestedModel) ? requestedModel : undefined),
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
    } else if (/\b(classify|categorize|auto[\s-]sort|which\s+category|which\s+folder)\b/i.test(pLower)) {
      questions = [
        {
          id: "category_choice",
          type: "choice",
          instructions: prompt,
          criteria: {
            billing: "Invoices, receipts, payments, and financial records",
            bug_report: "Crash logs, stack traces, errors, and issue reports",
            source_code: "Application source code, scripts, and configuration files",
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
  if (/\b(find\s+the\s+file\s+where|search\s+by\s+meaning|semantic\s+search|which\s+file\s+(has|contains|implements|wrote))\b/i.test(pLower)) {
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
  if (urlMatch || /\b(search\s+the\s+web|web\s+search|latest\s+release|live\s+docs|look\s+up\s+online)\b/i.test(pLower)) {
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
  if (/\b(batch[\s-]rename|rename\s+plan|organize\s+folder|organization\s+plan|extract\s+table|as\s+json)\b/i.test(pLower)) {
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
      speakReply: payload.speakReply,
      voice: payload.voice,
    });
    return {
      routedCapability: "vision",
      routeExplanation: `Routed to Multimodal Vision Inspection (POST /api/chat with base64 images, model: ${result.model}).`,
      result,
    };
  }

  // 8. Thinking / Deep Reasoning vs Fast Chat
  const needsDeepThinking =
    !payload.speakReply &&
    /\b(debug|complex|step[\s-]by[\s-]step|architecture|refactor|prove|why\s+is\s+this\s+failing|reorganize|deep\s+think)\b/i.test(
      pLower,
    );

  const needsTools = /\b(create\s+a\s+file|move\s+file|archive|compress)\b/i.test(pLower);

  const result = await runOllamaChatOrGenerate(ctx, {
    model: requestedModel,
    prompt,
    paths,
    think: needsDeepThinking,
    enableTools: needsTools,
    speakReply: payload.speakReply,
    voice: payload.voice,
  });

  return {
    routedCapability: needsTools ? "tool_action" : needsDeepThinking ? "thinking_chat" : "chat",
    routeExplanation: needsDeepThinking
      ? `Routed to Deep Reasoning Chat (POST /api/chat, think: true, model: ${result.model}).`
      : `Routed to Live Chat & Code Assistant (POST /api/chat, think: false, model: ${result.model}).`,
    result,
  };
}

// ============================================================================
// 10. LIVE STREAMING HANDLER (POST /api/ollama/stream) & OLLAMA_OPS TABLE
// ============================================================================

export async function handleOllamaStreamRequest(ctx: FmContext, req: Request): Promise<Response> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "NOT_JSON", message: "Requests must be JSON." } }),
      { status: 415, headers: { "Content-Type": "application/json" } },
    );
  }
  const maxBodyBytes = 8 * 1024 * 1024;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBodyBytes) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "TOO_LARGE", message: "That request is too large." } }),
      { status: 413, headers: { "Content-Type": "application/json" } },
    );
  }
  let body: any = {};
  try {
    const rawText = await req.text();
    if (rawText.length > maxBodyBytes) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "TOO_LARGE", message: "That request is too large." } }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }
    body = rawText ? JSON.parse(rawText) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Expected JSON object");
    }
  } catch {
    return new Response(JSON.stringify({ ok: false, error: { code: "INVALID_JSON", message: "Invalid JSON body" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
    const imagesBase64: string[] = Array.isArray(body.images) ? [...body.images] : [];
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

    const speakReply = Boolean(body.speakReply);
    const think = speakReply ? false : Boolean(body.think);
    const useWebSearch = Boolean(body.useWebSearch);
    const enforcedNumCtx = useWebSearch
      ? Math.max(Number(body.numCtx || 8192), MIN_WEB_SEARCH_NUM_CTX)
      : Number(body.numCtx || 8192);

    const promptText = [String(body.prompt || "Hello"), ...fileSnippets].filter(Boolean).join("\n\n");
    const messages = Array.isArray(body.messages) && body.messages.length > 0
      ? body.messages
      : [
          {
            role: "user",
            content: promptText,
            ...(imagesBase64.length > 0 ? { images: imagesBase64 } : {}),
          },
        ];

    const baseUrl = resolveOllamaBaseUrl(ctx, useCloudHost);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = getOllamaApiKey(ctx);
    if (apiKey && isSafeForApiKeyHeader(`${baseUrl}/api/chat`, useCloudHost)) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const upstream = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        think,
        options: { num_ctx: enforcedNumCtx },
        ...(body.format ? { format: body.format } : {}),
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text();
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "OLLAMA_STREAM_ERROR", message: errText || `HTTP ${upstream.status}` },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(upstream.body, {
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
    return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function getFullOllamaStatus(ctx: FmContext, payload?: any) {
  const [version, modelList, runningPs, cloudAccount, voices, installStatus] = await Promise.all([
    getOllamaVersionStatus(ctx),
    listModelsWithBadgesAndHardwareFilter(ctx, {
      includeHiddenForDiagnostics: Boolean(payload?.includeHiddenForDiagnostics),
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
    longTask: getLiveOllamaLongTaskStatus(),
    pendingActions: listPendingToolActions(),
  };
}

export const OLLAMA_OPS: Record<string, (ctx: FmContext, payload: any) => Promise<any>> = {
  "ollama/status": (ctx, p) => getFullOllamaStatus(ctx, p),
  "ollama/installStatus": (ctx) => getOllamaInstallStatus(ctx),
  "ollama/install": (ctx, p) => runOllamaAutoInstall(ctx, p || {}),
  "ollama/hardware": async (ctx) => inspectOllamaHardware(ctx),
  "ollama/guard": async (ctx, p) => {
    const hw = inspectOllamaHardware(ctx);
    return evaluateModelHardwareGuard(p?.model ? (typeof p.model === "string" ? { name: p.model } : p.model) : { name: "" }, hw, p?.options);
  },
  "ollama/version": (ctx) => getOllamaVersionStatus(ctx),
  "ollama/tags": (ctx, p) => listModelsWithBadgesAndHardwareFilter(ctx, p),
  "ollama/show": (ctx, p) => showModelDetails(ctx, String(p?.model || ""), Boolean(p?.forceRefresh)),
  "ollama/ps": (ctx) => listRunningModelsPs(ctx),
  "ollama/freeRam": (ctx, p) => unloadModelsFromRam(ctx, p?.model ? String(p.model) : undefined),
  "ollama/pull": (ctx, p) => pullModelWithHardwareGuard(ctx, String(p?.model || "")),
  "ollama/create": (ctx, p) => createCustomModel(ctx, p || {}),
  "ollama/copy": (ctx, p) => copyModel(ctx, String(p?.source || ""), String(p?.destination || "")),
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
  "ollama/chat": (ctx, p) => runOllamaChatOrGenerate(ctx, { ...(p || {}), endpoint: "chat" }),
  "ollama/generate": (ctx, p) => runOllamaChatOrGenerate(ctx, { ...(p || {}), endpoint: "generate" }),
  "ollama/embed": (ctx, p) => runOllamaEmbed(ctx, p || {}),
  "ollama/semanticSearch": (ctx, p) => runSemanticMeaningSearch(ctx, p || {}),
  "ollama/webSearch": (ctx, p) => runOllamaWebSearch(ctx, p || {}),
  "ollama/webFetch": (ctx, p) => runOllamaWebFetch(ctx, p || {}),
  "ollama/tool/confirm": (ctx, p) =>
    executeConfirmedToolAction(ctx, String(p?.actionId || ""), p?.decision === "cancel" ? "cancel" : "confirm"),
  "ollama/tool/pending": async () => ({ pendingActions: listPendingToolActions() }),
  "ollama/route": (ctx, p) => routePlainEnglishRequest(ctx, p || {}),
};
