import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";

export const PE_MACHINE_X64 = 0x8664;
export const PE_MACHINE_ARM64 = 0xaa64;
export const PE_MACHINE_X86 = 0x014c;

/**
 * Reads the PE COFF Machine header (uint16LE) from a Windows .exe / .dll file.
 * Returns 0x8664 for x86_64, 0xaa64 for ARM64, 0x014c for 32-bit x86, or null if not a valid PE file.
 */
export function getPeMachineType(filePath: string): number | null {
  let fd: number | undefined;
  try {
    if (!existsSync(filePath)) return null;
    fd = openSync(filePath, "r");
    const header = Buffer.alloc(1024);
    const bytesRead = readSync(fd, header, 0, header.length, 0);
    if (bytesRead < 64) return null;
    // DOS 'MZ' magic (0x4d, 0x5a)
    if (header[0] !== 0x4d || header[1] !== 0x5a) return null;
    const peOffset = header.readUInt32LE(0x3c);
    if (peOffset < 0 || peOffset > 1024 * 1024) return null;

    let peBuf: Buffer;
    if (peOffset + 6 <= bytesRead) {
      peBuf = header.subarray(peOffset, peOffset + 6);
    } else {
      peBuf = Buffer.alloc(6);
      const n = readSync(fd, peBuf, 0, 6, peOffset);
      if (n < 6) return null;
    }
    // PE\0\0 signature (0x50, 0x45, 0x00, 0x00)
    if (peBuf[0] !== 0x50 || peBuf[1] !== 0x45 || peBuf[2] !== 0x00 || peBuf[3] !== 0x00) {
      return null;
    }
    return peBuf.readUInt16LE(4);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch {}
    }
  }
}

/** True when `filePath` is a 64-bit x86_64 (0x8664) Windows PE binary. */
export function isPeX64(filePath: string): boolean {
  return getPeMachineType(filePath) === PE_MACHINE_X64;
}

const SKIP_DIR_NAMES = new Set([
  "arm64",
  "x86",
  "win32",
  "syswow64",
  "sysarm32",
  "system volume information",
]);

function walkForX64WebView2Loader(dir: string, matches: string[], depth = 0) {
  if (depth > 6 || matches.length > 0) return;

  try {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    // Visit x64 / ebwebview folders first, and skip non-x64 architecture folders.
    entries.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aPriority = aName === "x64" ? 0 : aName === "ebwebview" ? 1 : 2;
      const bPriority = bName === "x64" ? 0 : bName === "ebwebview" ? 1 : 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return bName.localeCompare(aName); // newer version numbers first
    });

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (SKIP_DIR_NAMES.has(lower) || lower.includes("defender")) {
          continue;
        }
        walkForX64WebView2Loader(full, matches, depth + 1);
        if (matches.length > 0) return;
      } else if (entry.name.toLowerCase() === "webview2loader.dll") {
        if (isPeX64(full)) {
          matches.push(full);
          return;
        }
      }
    }
  } catch {
    // EPERM / EACCES - skip restricted directories silently
  }
}

export function findWebView2Loader(customRoots?: string[]): string | undefined {
  const progFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const progFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const localAppData = process.env.LOCALAPPDATA ?? "";

  const candidateRoots = customRoots ?? [
    join(progFilesX86, "Microsoft", "EdgeWebView"),
    join(progFiles, "Microsoft", "EdgeWebView"),
    join(progFilesX86, "Microsoft", "Edge", "Application"),
    join(progFiles, "Microsoft", "Edge", "Application"),
    ...(localAppData ? [join(localAppData, "Microsoft", "EdgeWebView")] : []),
    "C:\\Windows\\System32",
  ];

  const matches: string[] = [];
  for (const root of candidateRoots) {
    walkForX64WebView2Loader(root, matches, 0);
    if (matches.length > 0) {
      break;
    }
  }

  return matches[0];
}

function prependWindowsDllSearchPath(dir: string) {
  if (process.platform !== "win32" || !existsSync(dir)) return;
  const currentPath = process.env.PATH ?? process.env.Path ?? "";
  const parts = currentPath.split(delimiter).map((p) => p.trim().toLowerCase());
  if (!parts.includes(dir.trim().toLowerCase())) {
    const updated = currentPath ? `${dir}${delimiter}${currentPath}` : dir;
    process.env.PATH = updated;
    process.env.Path = updated;
  }
}

/**
 * Ensures `node_modules/webview-bun/build/WebView2Loader.dll` is a valid x64 (0x8664) DLL if present,
 * removing any wrong-architecture (ARM64 / x86) copy that would break `libwebview.dll` (which is x64).
 */
export function ensureValidWindowsWebViewLoader(rootDir = process.cwd()): string | undefined {
  const webviewBuildDir = join(rootDir, "node_modules", "webview-bun", "build");
  const target = join(webviewBuildDir, "WebView2Loader.dll");

  try {
    mkdirSync(webviewBuildDir, { recursive: true });
    prependWindowsDllSearchPath(webviewBuildDir);

    if (existsSync(target)) {
      if (isPeX64(target)) {
        return target;
      }
      // A non-x64 (e.g. ARM64 0xaa64 or x86 0x014c) WebView2Loader.dll breaks x64 libwebview.dll!
      rmSync(target, { force: true });
      console.log(`[windows-webview] Removed non-x64 WebView2Loader.dll at ${target}`);
    }

    const source = findWebView2Loader();
    if (!source) {
      // Note: libwebview.dll also includes Microsoft's built-in EdgeUpdate registry fallback
      // (EBWebView\x64\EmbeddedBrowserWebView.dll), which works directly as long as no wrong-arch
      // WebView2Loader.dll is sitting in the way.
      return undefined;
    }

    copyFileSync(source, target);
    console.log(`[windows-webview] Copied x64 WebView2Loader.dll: ${source} -> ${target}`);
    return target;
  } catch (err: any) {
    console.warn(`[windows-webview] Note: Unable to verify/copy WebView2Loader.dll (${err?.message ?? err}).`);
    return undefined;
  }
}

function isRunnableWindowsX64Bun(candidate: string): boolean {
  if (!existsSync(candidate) || !isPeX64(candidate)) return false;
  try {
    const res = Bun.spawnSync([candidate, "--version"], { stdout: "ignore", stderr: "ignore" });
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

/** Locates an already-installed x64 Bun executable on Windows (used on Windows 11 ARM64 for x64 libwebview.dll). */
export function findExistingWindowsX64Bun(): string | undefined {
  if (process.platform !== "win32") return undefined;
  if (process.arch === "x64" && isPeX64(process.execPath)) return process.execPath;

  const userProfile = process.env.USERPROFILE || "C:\\Users\\Default";
  const localAppData = process.env.LOCALAPPDATA || join(userProfile, "AppData", "Local");
  const targetDir = join(localAppData, "bun-x64");

  // Prefer baseline x64 on Windows ARM64 because Windows x64 emulation in ARM64 VMs (e.g. Apple Silicon M-series)
  // does not always expose AVX2 instructions.
  const candidates = [
    join(targetDir, "bun-windows-x64-baseline", "bun.exe"),
    join(targetDir, "bun-windows-x64", "bun.exe"),
    join(targetDir, "bun.exe"),
    "C:\\Tools\\bun-x64\\bun-windows-x64-baseline\\bun.exe",
    "C:\\Tools\\bun-x64\\bun-windows-x64\\bun.exe",
    "C:\\Tools\\bun-x64\\bun.exe",
  ];

  for (const candidate of candidates) {
    if (isRunnableWindowsX64Bun(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * On Windows 11 ARM64, `node_modules/webview-bun/build/libwebview.dll` is an x86_64 (0x8664) DLL.
 * Native ARM64 `bun.exe` cannot dlopen an x64 DLL (Win32 error 193). Windows 11 ARM64 runs x64-baseline `bun.exe`
 * seamlessly via built-in emulation without requiring AVX2. This helper ensures `bun-windows-x64-baseline\bun.exe` is available.
 */
export async function ensureWindowsX64Bun(): Promise<string | undefined> {
  if (process.platform !== "win32") return undefined;
  const existing = findExistingWindowsX64Bun();
  if (existing) return existing;

  const userProfile = process.env.USERPROFILE || "C:\\Users\\Default";
  const localAppData = process.env.LOCALAPPDATA || join(userProfile, "AppData", "Local");
  const targetDir = join(localAppData, "bun-x64");
  const baselineExe = join(targetDir, "bun-windows-x64-baseline", "bun.exe");
  const standardExe = join(targetDir, "bun-windows-x64", "bun.exe");
  const altExe = join(targetDir, "bun.exe");
  const zipPath = join(tmpdir(), `bun-windows-x64-baseline-${process.pid}.zip`);

  console.log("[windows-webview] Windows ARM64 detected: setting up x64-baseline Bun runtime for native WebView2 (libwebview.dll is x64)...");
  try {
    mkdirSync(targetDir, { recursive: true });
    const res = await fetch("https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64-baseline.zip");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    writeFileSync(zipPath, bytes);

    // Extract using Windows built-in tar.exe (fast) or PowerShell Expand-Archive as fallback
    const tar = Bun.spawnSync(["tar.exe", "-xf", zipPath, "-C", targetDir], { stdout: "ignore", stderr: "ignore" });
    if (tar.exitCode !== 0) {
      Bun.spawnSync(
        [
          "powershell.exe",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdout: "ignore", stderr: "ignore" }
      );
    }
    try { rmSync(zipPath, { force: true }); } catch {}

    for (const candidate of [baselineExe, standardExe, altExe]) {
      if (isRunnableWindowsX64Bun(candidate)) {
        // Also populate bun-windows-x64\bun.exe if not already runnable so run.ps1 finds it immediately
        if (candidate === baselineExe && !isRunnableWindowsX64Bun(standardExe)) {
          try {
            mkdirSync(join(targetDir, "bun-windows-x64"), { recursive: true });
            copyFileSync(baselineExe, standardExe);
          } catch {}
        }
        console.log(`[windows-webview] Configured x64-baseline Bun runtime at ${candidate}`);
        return candidate;
      }
    }
  } catch (err: any) {
    try { rmSync(zipPath, { force: true }); } catch {}
    console.warn(`[windows-webview] Automatic x64 Bun setup failed (${err?.message ?? err}).`);
  }

  return undefined;
}

/**
 * Initializes COM Single-Threaded Apartment (COINIT_APARTMENTTHREADED = 0x2) on the current Windows thread.
 * Calling this at startup before async networking prevents `CoInitializeEx` mode conflicts when `new Webview()`
 * creates the Edge WebView2 controller.
 */
export async function initWindowsComSta(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    const ole32 = dlopen("ole32.dll", {
      CoInitializeEx: { args: [FFIType.pointer, FFIType.u32], returns: FFIType.i32 },
    });
    // COINIT_APARTMENTTHREADED = 0x2; S_OK = 0, S_FALSE = 1
    const hr = ole32.symbols.CoInitializeEx(null, 0x2);
    return hr === 0 || hr === 1;
  } catch {
    return false;
  }
}

if (import.meta.main) {
  if (process.platform === "win32") {
    try {
      ensureValidWindowsWebViewLoader();
    } catch {}
    if (process.arch === "arm64") {
      await ensureWindowsX64Bun().catch(() => undefined);
    }
  }
}
