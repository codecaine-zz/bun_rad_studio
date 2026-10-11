import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

if (process.platform !== "win32") {
  process.exit(0);
}

const webviewBuildDir = join(process.cwd(), "node_modules", "webview-bun", "build");
const target = join(webviewBuildDir, "WebView2Loader.dll");

function walk(dir: string, matches: string[], depth = 0) {
  if (depth > 6 || matches.length > 0) return;

  try {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip Windows Defender and protected system folders
        const lower = entry.name.toLowerCase();
        if (lower.includes("defender") || lower.includes("system volume information")) {
          continue;
        }
        walk(full, matches, depth + 1);
        if (matches.length > 0) return;
      } else if (entry.name.toLowerCase() === "webview2loader.dll") {
        matches.push(full);
        return;
      }
    }
  } catch {
    // EPERM / EACCES - skip restricted directories silently
  }
}

function findWebView2Loader(): string | undefined {
  const progFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const progFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const localAppData = process.env.LOCALAPPDATA ?? "";

  const candidateRoots = [
    join(progFilesX86, "Microsoft", "EdgeWebView"),
    join(progFiles, "Microsoft", "EdgeWebView"),
    join(progFilesX86, "Microsoft", "Edge", "Application"),
    join(progFiles, "Microsoft", "Edge", "Application"),
    ...(localAppData ? [join(localAppData, "Microsoft", "EdgeWebView")] : []),
    "C:\\Windows\\System32",
    "C:\\Windows\\SysWOW64",
    "C:\\Windows\\Arm64",
  ];

  const matches: string[] = [];
  for (const root of candidateRoots) {
    walk(root, matches, 0);
    if (matches.length > 0) {
      break;
    }
  }

  return matches[0];
}

function installWebView2Loader() {
  try {
    mkdirSync(webviewBuildDir, { recursive: true });

    if (existsSync(target)) {
      console.log(`[windows-webview] WebView2Loader.dll already present at ${target}`);
      return;
    }

    const source = findWebView2Loader();
    if (!source) {
      console.warn(
        "[windows-webview] WebView2Loader.dll was not found. Install the Microsoft Edge WebView2 runtime or run: winget install --id Microsoft.EdgeWebView2Runtime --exact"
      );
      return;
    }

    copyFileSync(source, target);
    console.log(`[windows-webview] Copied ${source} -> ${target}`);
  } catch (err: any) {
    console.warn(`[windows-webview] Note: Unable to auto-copy WebView2Loader.dll (${err?.message ?? err}).`);
  }
}

try {
  installWebView2Loader();
} catch {}
