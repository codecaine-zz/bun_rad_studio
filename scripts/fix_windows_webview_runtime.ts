import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

if (process.platform !== "win32") {
  process.exit(0);
}

const webviewBuildDir = join(process.cwd(), "node_modules", "webview-bun", "build");
const target = join(webviewBuildDir, "WebView2Loader.dll");

function walk(dir: string, matches: string[]) {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, matches);
      continue;
    }
    if (entry.name.toLowerCase() === "webview2loader.dll") {
      matches.push(full);
    }
  }
}

function findWebView2Loader(): string | undefined {
  const candidateRoots = [
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    process.env.ProgramFiles ?? "C:\\Program Files",
    "C:\\Windows\\System32",
    "C:\\Windows\\SysWOW64",
    "C:\\Program Files (x86)\\Microsoft\\EdgeWebView",
    "C:\\Program Files\\Microsoft\\EdgeWebView",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application",
    "C:\\Program Files\\Microsoft\\Edge\\Application",
  ];

  const matches: string[] = [];
  for (const root of candidateRoots) {
    walk(root, matches);
    if (matches.length > 0) {
      break;
    }
  }

  return matches[0];
}

function installWebView2Loader() {
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
}

installWebView2Loader();
