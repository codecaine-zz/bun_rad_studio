import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
    if (
      peBuf[0] !== 0x50 ||
      peBuf[1] !== 0x45 ||
      peBuf[2] !== 0x00 ||
      peBuf[3] !== 0x00
    ) {
      return null;
    }
    return peBuf.readUInt16LE(4);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {}
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
  const progFilesX86 =
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
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
export function ensureValidWindowsWebViewLoader(
  rootDir = process.cwd(),
): string | undefined {
  const webviewBuildDir = join(rootDir, "node_modules", "webview-bun", "build");
  const target = join(webviewBuildDir, "WebView2Loader.dll");

  try {
    mkdirSync(webviewBuildDir, { recursive: true });
    prependWindowsDllSearchPath(webviewBuildDir);

    // Remove any non-x64 (ARM64 0xaa64 or x86 0x014c) DLL sitting inside webview-bun/build
    for (const entry of readdirSync(webviewBuildDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".dll")) {
        const fullDll = join(webviewBuildDir, entry.name);
        if (!isPeX64(fullDll)) {
          rmSync(fullDll, { force: true });
          console.log(`[windows-webview] Removed non-x64 DLL at ${fullDll}`);
        }
      }
    }

    if (existsSync(target) && isPeX64(target)) {
      return target;
    }

    const source = findWebView2Loader();
    if (!source) {
      // Note: libwebview.dll also includes Microsoft's built-in EdgeUpdate registry fallback
      // (EBWebView\x64\EmbeddedBrowserWebView.dll), which works directly as long as no wrong-arch
      // WebView2Loader.dll is sitting in the way.
      return undefined;
    }

    copyFileSync(source, target);
    console.log(
      `[windows-webview] Copied x64 WebView2Loader.dll: ${source} -> ${target}`,
    );
    return target;
  } catch (err: any) {
    console.warn(
      `[windows-webview] Note: Unable to verify/copy WebView2Loader.dll (${err?.message ?? err}).`,
    );
    return undefined;
  }
}

const VC_RUNTIME_DLLS = [
  "msvcp140.dll",
  "vcruntime140.dll",
  "vcruntime140_1.dll",
] as const;

export const DEFAULT_BUN_WINDOWS_X64_TAG = "bun-v1.4.4";
export const DEFAULT_WEBVIEW2_NUGET_VERSION = "1.0.2903.40";

/** Creates a private `0o700` staging directory inside `os.tmpdir()` via `mkdtempSync`. */
export function makePrivateStageDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    chmodSync(dir, 0o700);
  } catch {}
  return dir;
}

/** Computes lowercase 64-hex SHA-256 digest of `bytes`. */
export function sha256Hex(bytes: Uint8Array): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(bytes);
  return hasher.digest("hex").toLowerCase();
}

/** Parses an expected SHA-256 digest for `assetName` from a `SHASUMS256.txt` / `sha256sum.txt` manifest. */
export function parseSha256SumsFile(
  manifestText: string,
  assetName: string,
): string | null {
  for (const rawLine of manifestText.split(/\r?\n/)) {
    const line = rawLine.trim();
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line);
    if (!m) continue;
    const digest = m[1]!.toLowerCase();
    const candidate = m[2]!.trim().replace(/^.*[/\\]/, "");
    if (candidate === assetName) return digest;
  }
  return null;
}

/** Verifies `bytes` against an expected 64-hex SHA-256 digest; throws on invalid or mismatched hash. */
export function verifySha256Hex(
  bytes: Uint8Array,
  expectedHex: string,
  label: string,
): void {
  const normalized = expectedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`Invalid expected SHA-256 digest for ${label}`);
  }
  const actual = sha256Hex(bytes);
  if (actual !== normalized) {
    throw new Error(
      `SHA-256 verification failed for ${label}: expected ${normalized}, got ${actual}`,
    );
  }
}

function isZipArchive(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** Verifies Microsoft Corporation Authenticode signature on extracted Windows DLLs. */
function verifyMicrosoftAuthenticode(filePath: string): boolean {
  if (process.platform !== "win32") return true;
  const escaped = filePath.replace(/'/g, "''");
  const ps = Bun.spawnSync(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$sig = Get-AuthenticodeSignature -LiteralPath '${escaped}'; if ($sig -and $sig.Status -eq 'Valid' -and $sig.SignerCertificate.Subject -match 'Microsoft') { exit 0 } else { exit 1 }`,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  return ps.exitCode === 0;
}

function extractZipOnWindows(zipPath: string, destDir: string): boolean {
  const tar = Bun.spawnSync(
    ["tar.exe", "--no-same-owner", "-xf", zipPath, "-C", destDir],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  if (tar.exitCode === 0) return true;
  const ps = Bun.spawnSync(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  return ps.exitCode === 0;
}

/**
 * Ensures `node_modules/webview-bun/build/` contains valid x64 (`0x8664`) copies of `msvcp140.dll`,
 * `vcruntime140.dll`, `vcruntime140_1.dll`, and `WebView2Loader.dll`, and registers the folder via
 * `SetDllDirectoryW` so ARM64/x86 DLLs in `System32` or `PATH` on Windows 11 ARM64 (Parallels) never
 * trigger Win32 Error 193 (`ERROR_BAD_EXE_FORMAT`) when loading `libwebview.dll`.
 */
export async function ensureWindowsX64VcRuntimeAndWebViewLoader(
  rootDir = process.cwd(),
): Promise<void> {
  if (process.platform !== "win32") return;
  const webviewBuildDir = join(rootDir, "node_modules", "webview-bun", "build");
  ensureValidWindowsWebViewLoader(rootDir);

  // 1. Copy local x64 (0x8664) VC++ runtime DLLs if already present in System32
  const sys32 = "C:\\Windows\\System32";
  for (const dll of VC_RUNTIME_DLLS) {
    const dest = join(webviewBuildDir, dll);
    if (existsSync(dest) && isPeX64(dest)) continue;
    const candidate = join(sys32, dll);
    if (existsSync(candidate) && isPeX64(candidate)) {
      try {
        copyFileSync(candidate, dest);
      } catch {}
    }
  }

  // 2. If any of msvcp140.dll, vcruntime140.dll, vcruntime140_1.dll is still missing or non-x64,
  //    download Microsoft's official x64 Desktop VCLibs appx (standard zip, no UAC/admin required)
  const missingVc = VC_RUNTIME_DLLS.some(
    (dll) => !isPeX64(join(webviewBuildDir, dll)),
  );
  if (missingVc) {
    const stageDir = makePrivateStageDir("vc-x64-");
    const zipPath = join(stageDir, "vclibs-x64.zip");
    try {
      console.log(
        "[windows-webview] Provisioning Microsoft x64 Visual C++ Runtime DLLs for native WebView2...",
      );
      const res = await fetch(
        "https://aka.ms/Microsoft.VCLibs.x64.14.00.Desktop.appx",
      );
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!isZipArchive(bytes)) {
          throw new Error("Downloaded VCLibs package is not a valid archive");
        }
        if (process.env.VCLIBS_APPX_SHA256) {
          verifySha256Hex(bytes, process.env.VCLIBS_APPX_SHA256, "VCLibs.appx");
        }
        writeFileSync(zipPath, bytes);
        if (extractZipOnWindows(zipPath, stageDir)) {
          for (const dll of VC_RUNTIME_DLLS) {
            const extracted = join(stageDir, dll);
            const dest = join(webviewBuildDir, dll);
            if (isPeX64(extracted) && verifyMicrosoftAuthenticode(extracted)) {
              copyFileSync(extracted, dest);
            }
          }
          console.log(
            "[windows-webview] Installed verified x64 msvcp140.dll, vcruntime140.dll, and vcruntime140_1.dll.",
          );
        }
      }
    } catch (err: any) {
      console.warn(
        `[windows-webview] Note: Could not auto-download VCLibs x64 (${err?.message ?? err}).`,
      );
    } finally {
      try {
        rmSync(stageDir, { recursive: true, force: true });
      } catch {}
    }
  }

  // 3. If x64 WebView2Loader.dll was not found locally (e.g. Windows 11 ARM64 with only arm64 Edge installed),
  //    fetch Microsoft's official pinned Microsoft.Web.WebView2 NuGet package and verify PE + Authenticode
  const loaderTarget = join(webviewBuildDir, "WebView2Loader.dll");
  if (!isPeX64(loaderTarget)) {
    const stageDir = makePrivateStageDir("wv2-x64-");
    const zipPath = join(stageDir, "webview2.zip");
    const nugetVersion =
      process.env.WEBVIEW2_NUGET_VERSION || DEFAULT_WEBVIEW2_NUGET_VERSION;
    try {
      console.log(
        `[windows-webview] Provisioning Microsoft x64 WebView2Loader.dll (${nugetVersion})...`,
      );
      const res = await fetch(
        `https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/${encodeURIComponent(nugetVersion)}`,
      );
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!isZipArchive(bytes)) {
          throw new Error(
            "Downloaded WebView2 NuGet package is not a valid archive",
          );
        }
        if (process.env.WEBVIEW2_NUGET_SHA256) {
          verifySha256Hex(
            bytes,
            process.env.WEBVIEW2_NUGET_SHA256,
            `Microsoft.Web.WebView2.${nugetVersion}.nupkg`,
          );
        }
        writeFileSync(zipPath, bytes);
        if (extractZipOnWindows(zipPath, stageDir)) {
          const extracted = join(
            stageDir,
            "runtimes",
            "win-x64",
            "native",
            "WebView2Loader.dll",
          );
          if (isPeX64(extracted) && verifyMicrosoftAuthenticode(extracted)) {
            copyFileSync(extracted, loaderTarget);
            console.log(
              "[windows-webview] Installed verified x64 WebView2Loader.dll.",
            );
          }
        }
      }
    } catch {
    } finally {
      try {
        rmSync(stageDir, { recursive: true, force: true });
      } catch {}
    }
  }

  // 4. Register webviewBuildDir via SetDllDirectoryW so Windows resolves libwebview.dll's dependencies from here first
  try {
    const { dlopen, FFIType, ptr } = await import("bun:ffi");
    const kernel32 = dlopen("kernel32.dll", {
      SetDllDirectoryW: { args: [FFIType.pointer], returns: FFIType.i32 },
    });
    const utf16 = Buffer.from(webviewBuildDir + "\0", "utf16le");
    kernel32.symbols.SetDllDirectoryW(ptr(utf16));
  } catch {}
}

function isRunnableWindowsX64Bun(candidate: string): boolean {
  if (!existsSync(candidate) || !isPeX64(candidate)) return false;
  try {
    const res = Bun.spawnSync([candidate, "--version"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

/** Locates an already-installed x64 Bun executable on Windows (used on Windows 11 ARM64 for x64 libwebview.dll). */
export function findExistingWindowsX64Bun(): string | undefined {
  if (process.platform !== "win32") return undefined;
  if (process.arch === "x64" && isPeX64(process.execPath))
    return process.execPath;

  const userProfile = process.env.USERPROFILE || "C:\\Users\\Default";
  const localAppData =
    process.env.LOCALAPPDATA || join(userProfile, "AppData", "Local");
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
  const localAppData =
    process.env.LOCALAPPDATA || join(userProfile, "AppData", "Local");
  const targetDir = join(localAppData, "bun-x64");
  const baselineExe = join(targetDir, "bun-windows-x64-baseline", "bun.exe");
  const standardExe = join(targetDir, "bun-windows-x64", "bun.exe");
  const altExe = join(targetDir, "bun.exe");
  const stageDir = makePrivateStageDir("bun-x64-");
  const assetName = "bun-windows-x64-baseline.zip";
  const zipPath = join(stageDir, assetName);
  const bunTag = process.env.BUN_WINDOWS_X64_TAG || DEFAULT_BUN_WINDOWS_X64_TAG;
  const baseUrl = `https://github.com/oven-sh/bun/releases/download/${encodeURIComponent(bunTag)}`;

  console.log(
    `[windows-webview] Windows ARM64 detected: setting up verified x64-baseline Bun runtime (${bunTag}) for native WebView2...`,
  );
  try {
    mkdirSync(targetDir, { recursive: true });
    let expectedSha = process.env.BUN_WINDOWS_X64_SHA256?.trim().toLowerCase();
    if (!expectedSha) {
      const sumsRes = await fetch(`${baseUrl}/SHASUMS256.txt`);
      if (!sumsRes.ok) {
        throw new Error(
          `Failed to fetch SHASUMS256.txt (HTTP ${sumsRes.status})`,
        );
      }
      expectedSha =
        parseSha256SumsFile(await sumsRes.text(), assetName) ?? undefined;
    }
    if (!expectedSha) {
      throw new Error(`Missing SHA-256 entry for ${assetName} in ${bunTag}`);
    }

    const res = await fetch(`${baseUrl}/${assetName}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    verifySha256Hex(bytes, expectedSha, assetName);
    writeFileSync(zipPath, bytes);

    if (!extractZipOnWindows(zipPath, targetDir)) {
      throw new Error(`Failed to extract ${assetName}`);
    }

    for (const candidate of [baselineExe, standardExe, altExe]) {
      if (isRunnableWindowsX64Bun(candidate)) {
        // Also populate bun-windows-x64\bun.exe if not already runnable so run.ps1 finds it immediately
        if (
          candidate === baselineExe &&
          !isRunnableWindowsX64Bun(standardExe)
        ) {
          try {
            mkdirSync(join(targetDir, "bun-windows-x64"), { recursive: true });
            copyFileSync(baselineExe, standardExe);
          } catch {}
        }
        console.log(
          `[windows-webview] Configured verified x64-baseline Bun runtime at ${candidate}`,
        );
        return candidate;
      }
    }
  } catch (err: any) {
    console.warn(
      `[windows-webview] Automatic x64 Bun setup failed (${err?.message ?? err}).`,
    );
  } finally {
    try {
      rmSync(stageDir, { recursive: true, force: true });
    } catch {}
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
      CoInitializeEx: {
        args: [FFIType.pointer, FFIType.u32],
        returns: FFIType.i32,
      },
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
      await ensureWindowsX64VcRuntimeAndWebViewLoader();
    } catch {}
    if (process.arch === "arm64" || !isPeX64(process.execPath)) {
      await ensureWindowsX64Bun().catch(() => undefined);
    }
  }
  try {
    const { areWrappersUpToDate, generateAllWrappers } =
      await import("./generate_brew_suite.ts");
    if (!areWrappersUpToDate()) {
      generateAllWrappers();
    }
  } catch {}
}
