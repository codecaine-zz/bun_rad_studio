// What every release script shares: the platforms we build for, which files are applications, and small helpers.
import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

export const ROOT = resolve(import.meta.dir, "..", "..");
export const VERSION: string = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

/** Files that an app reads from the folder its code is in, so they travel next to the bundled apps. */
export const SIDECAR_FILES = ["applications/postgres_designer.js", "src/ide.html"];

export type OsName = "macos" | "linux" | "windows";

export interface Target {
  /** The name used in file names: macos-arm64, linux-x64-baseline ... */
  id: string;
  /** What `bun build --compile --target=` is given. */
  bunTarget: string;
  os: OsName;
  arch: "arm64" | "x64";
  /** baseline = x64 without AVX2 (older CPUs); musl = Alpine and other musl systems. */
  variant: "" | "baseline" | "musl";
  /** The native window library exists for this target, so the desktop apps can run. */
  gui: boolean;
  /** The file inside lib/ that the apps load (set as WEBVIEW_PATH). */
  webviewLib: string | null;
  /** Where to start reading about it. */
  note: string;
}

const WEBVIEW_DIR = join(ROOT, "node_modules", "webview-bun", "build");
export const webviewLibSource = (name: string) => join(WEBVIEW_DIR, name);

export const TARGETS: Target[] = [
  { id: "macos-arm64", bunTarget: "bun-darwin-arm64", os: "macos", arch: "arm64", variant: "", gui: true, webviewLib: "libwebview.dylib", note: "Apple silicon Macs (M1 and newer)" },
  { id: "macos-x64", bunTarget: "bun-darwin-x64", os: "macos", arch: "x64", variant: "", gui: true, webviewLib: "libwebview.dylib", note: "Intel Macs" },
  { id: "linux-x64", bunTarget: "bun-linux-x64", os: "linux", arch: "x64", variant: "", gui: true, webviewLib: "libwebview-x64.so", note: "64-bit Intel/AMD Linux with glibc (Ubuntu, Debian, Fedora ...). Desktop apps need GTK 4 and WebKitGTK 6.0" },
  { id: "linux-x64-baseline", bunTarget: "bun-linux-x64-baseline", os: "linux", arch: "x64", variant: "baseline", gui: true, webviewLib: "libwebview-x64.so", note: "Like linux-x64, for CPUs older than 2013 (no AVX2)" },
  { id: "linux-arm64", bunTarget: "bun-linux-arm64", os: "linux", arch: "arm64", variant: "", gui: true, webviewLib: "libwebview-arm64.so", note: "64-bit ARM Linux with glibc (Raspberry Pi OS 64-bit, Ampere, Graviton ...). Desktop apps need GTK 4 and WebKitGTK 6.0" },
  { id: "linux-x64-musl", bunTarget: "bun-linux-x64-musl", os: "linux", arch: "x64", variant: "musl", gui: false, webviewLib: null, note: "Alpine and other musl Linux. Command-line tools only (the window library needs glibc)" },
  { id: "linux-arm64-musl", bunTarget: "bun-linux-arm64-musl", os: "linux", arch: "arm64", variant: "musl", gui: false, webviewLib: null, note: "Alpine on ARM. Command-line tools only" },
  { id: "windows-x64", bunTarget: "bun-windows-x64", os: "windows", arch: "x64", variant: "", gui: true, webviewLib: "libwebview.dll", note: "64-bit Windows 10 and 11 (needs the WebView2 runtime, already part of Windows 11). Also runs on Windows on ARM through emulation" },
  { id: "windows-x64-baseline", bunTarget: "bun-windows-x64-baseline", os: "windows", arch: "x64", variant: "baseline", gui: true, webviewLib: "libwebview.dll", note: "Like windows-x64, for CPUs older than 2013 (no AVX2)" },
  { id: "windows-arm64", bunTarget: "bun-windows-arm64", os: "windows", arch: "arm64", variant: "", gui: false, webviewLib: null, note: "Windows on ARM, native command-line tools. For the desktop apps use windows-x64 (Windows on ARM runs it through emulation)" },
];

export function findTargets(ids: string[] | null): Target[] {
  if (!ids || ids.length === 0) return TARGETS;
  const chosen: Target[] = [];
  for (const id of ids) {
    const t = TARGETS.find((x) => x.id === id);
    if (!t) throw new Error(`Unknown target "${id}". Choose from: ${TARGETS.map((x) => x.id).join(", ")}`);
    chosen.push(t);
  }
  return chosen;
}

/** The target that matches this computer, for building the Mac apps and for testing. */
export function hostTargetId(): string {
  const os = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
  return `${os}-${process.arch === "arm64" ? "arm64" : "x64"}`;
}

export interface SourceApp {
  /** Launcher name: file name with dashes, like `file-manager-studio` or `fd-cli`. */
  name: string;
  /** Path of the source file, relative to the project. */
  entry: string;
  kind: "gui" | "cli";
}

const dashed = (stem: string) => stem.replace(/_/g, "-");

/** Every desktop app (applications/*.ts that start a window when run) and every command-line tool. */
export function listSourceApps(): SourceApp[] {
  const apps: SourceApp[] = [];
  for (const f of readdirSync(join(ROOT, "applications")).filter((x) => x.endsWith(".ts")).sort()) {
    const text = readFileSync(join(ROOT, "applications", f), "utf8");
    if (/import\.meta\.main/.test(text)) apps.push({ name: dashed(f.replace(/\.ts$/, "")), entry: `applications/${f}`, kind: "gui" });
  }
  // The visual form designer is the project's own index.ts.
  if (existsSync(join(ROOT, "index.ts"))) apps.push({ name: "rad-designer", entry: "index.ts", kind: "gui" });
  for (const f of readdirSync(join(ROOT, "cli_apps")).filter((x) => x.endsWith(".ts")).sort()) {
    apps.push({ name: dashed(f.replace(/\.ts$/, "")), entry: `cli_apps/${f}`, kind: "cli" });
  }
  return apps;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  const reader = Bun.file(path).stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

/** A word for a shell script: wrapped in single quotes with any inside ones escaped. */
export const shQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function log(emoji: string, message: string) {
  console.log(`${emoji}  ${message}`);
}

/** Runs a program and returns its output; throws with the program's own words when it fails. */
export async function run(cmd: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`${cmd.slice(0, 3).join(" ")} failed (${code}): ${(err || out).trim().split("\n").slice(-6).join("\n")}`);
  return out;
}
