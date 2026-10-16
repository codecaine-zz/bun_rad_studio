#!/usr/bin/env bun
/**
 * Builds downloads of the Codecaine File Manager only, one zip per operating system and processor, plus a static
 * download page you can host on a website.
 *
 *   bun run release:file-manager                         every download (needs the internet the first time, to fetch each Bun runtime)
 *   bun run release:file-manager -- --targets macos-arm64,windows-x64
 *   bun run release:file-manager -- --list
 *   bun run release:file-manager -- --page-only --base-url https://github.com/<you>/<repo>/releases/download/v1.0.0/
 *                                                      rewrite only index.html so its buttons point at where the zips are hosted
 *
 * Output, in release/file-manager/:
 *   Codecaine-File-Manager-v<version>-<platform>.zip   one per platform
 *   index.html                                         download page with one button per zip (upload it next to the zips)
 *   SHA256SUMS.txt
 *
 * What is in each zip:
 *   macOS    "Codecaine File Manager.app": double-click, with its own icon (signed ad hoc, see READ ME FIRST.txt)
 *   Windows  "Codecaine File Manager.exe" with no console window (the custom icon and title are only embedded when built on Windows), next to app/, lib/ and resources/
 *   Linux    "codecaine-file-manager" next to app/, lib/ and resources/, plus install.sh for a menu entry
 * Every zip also holds the SQLite, MySQL, PostgreSQL and Redis studios, which the File Manager starts from the same folder.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { ICONS_OUT, iconSpecFor, renderPngs } from "./icons";
import { BUNDLE_DIR, CACHE_DIR, RELEASE_DIR, bundleApps, buildRuntime, logBundleFailures } from "./suite";
import { buildApp, type MacApp } from "./build_mac_apps";
import { ROOT, SIDECAR_FILES, TARGETS, VERSION, defaultJobs, listSourceApps, log, mapPool, parseJobs, run, sha256File, webviewLibSource, writeFileAtomic, type SourceApp, type Target } from "./common";
import { LINUX_SANDBOX_WARNING, linuxSandboxSetup } from "./linuxSandbox";

export const APP_TITLE = "Codecaine File Manager";
export const OUT_DIR = join(RELEASE_DIR, "file-manager");
const STAGE = join(RELEASE_DIR, ".stage-fm");
const MAIN = "file-manager-studio";
const STUDIOS = ["sqlite-studio", "mysql-studio", "postgres-studio", "redis-studio"];
const MAGICK = ["/opt/homebrew/opt/imagemagick-full/bin/magick", "/opt/homebrew/bin/magick", "magick"].find((p) => p === "magick" || existsSync(p)) ?? "magick";

export interface Download {
  /** Used in the file name: macos-arm64, windows-x64 ... */
  id: string;
  os: "macos" | "windows" | "linux";
  arch: "arm64" | "x64";
  /** The Bun runtime / window library to build with (Windows on ARM runs the x64 build through Windows' own emulation). */
  from: string;
  label: string;
  hint: string;
  older?: boolean;
}

export const DOWNLOADS: Download[] = [
  { id: "macos-arm64", os: "macos", arch: "arm64", from: "macos-arm64", label: "Apple silicon", hint: "Macs with an M1, M2, M3, M4 or newer chip" },
  { id: "macos-x64", os: "macos", arch: "x64", from: "macos-x64", label: "Intel", hint: "Macs with an Intel processor" },
  { id: "windows-x64", os: "windows", arch: "x64", from: "windows-x64", label: "64-bit (x64)", hint: "Most Windows 10 and 11 PCs" },
  { id: "windows-arm64", os: "windows", arch: "arm64", from: "windows-x64", label: "ARM64", hint: "Windows on ARM (Snapdragon X, Surface Pro X ...). Runs through Windows' built-in x64 emulation" },
  { id: "windows-x64-baseline", os: "windows", arch: "x64", from: "windows-x64-baseline", label: "x64 for older CPUs", hint: "Processors from before 2013 (no AVX2)", older: true },
  { id: "linux-x64", os: "linux", arch: "x64", from: "linux-x64", label: "x86-64 (Intel / AMD)", hint: "Ubuntu, Debian, Fedora, Arch and other glibc distributions" },
  { id: "linux-arm64", os: "linux", arch: "arm64", from: "linux-arm64", label: "ARM64", hint: "Raspberry Pi OS 64-bit, Ampere, Graviton and other 64-bit ARM Linux" },
  { id: "linux-x64-baseline", os: "linux", arch: "x64", from: "linux-x64-baseline", label: "x86-64 for older CPUs", hint: "Processors from before 2013 (no AVX2)", older: true },
];

const zipName = (d: Download) => `Codecaine-File-Manager-v${VERSION}-${d.id}.zip`;
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

function targetOf(d: Download): Target {
  const t = TARGETS.find((x) => x.id === d.from);
  if (!t) throw new Error(`No build target ${d.from}`);
  return t;
}

/** The program at the root of the Windows and Linux folders: it starts itself as the bundled Bun runtime running the app. */
export const LAUNCHER_STUB = `// ${APP_TITLE} launcher. Started by a double-click; runs app/${MAIN}.js with this same executable acting as Bun.
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, rmSync, symlinkSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

const dir = dirname(process.execPath);
const lib = process.platform === "win32" ? "libwebview.dll" : process.platform === "darwin" ? "libwebview.dylib" : \`libwebview-\${process.arch}.so\`;
const env: Record<string, string> = { ...(process.env as Record<string, string>), BUN_BE_BUN: "1" };
if (!env.WEBVIEW_PATH) env.WEBVIEW_PATH = join(dir, "lib", lib);

// The app looks for ./resources and keeps small files in the folder it starts in. On Windows that is this folder;
// elsewhere it is a writable folder in the home directory that links to ours (the download may sit somewhere read-only).
let cwd = dir;
if (process.platform !== "win32") {
  try {
    const work = join(homedir(), ".bun_rad_studio", "run");
    mkdirSync(work, { recursive: true });
    rmSync(join(work, "resources"), { force: true });
    symlinkSync(join(dir, "resources"), join(work, "resources"));
    cwd = work;
  } catch (err) {
    console.warn("Could not prepare the writable resource folder; using the extracted folder instead:", err);
    cwd = dir;
  }
}

const script = join(dir, "app", "${MAIN}.js");
const logDir = join(homedir(), ".bun_rad_studio");
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, "file-manager-startup.log");
const log = openSync(logFile, "a", 0o600);
appendFileSync(log, "\\nFile Manager startup: " + new Date().toISOString() + " " + process.platform + "/" + process.arch + "\\n");
const serverOnly = process.argv.includes("--server") || process.argv.includes("-s");
try {
  if (!existsSync(script)) {
    throw new Error("Missing " + script + ". Unpack the whole zip and keep its files together.");
  }
  const child = Bun.spawn([process.execPath, script, ...process.argv.slice(2)], { cwd, env, stdio: ["inherit", serverOnly ? "inherit" : log, serverOnly ? "inherit" : log] });
  const code = await child.exited;
  if (code !== 0) {
    const message = "File Manager exited with " + code + ". See " + logFile;
    appendFileSync(log, message + "\\n");
    console.error(message);
  }
  process.exitCode = code;
} catch (err) {
  appendFileSync(log, String(err) + "\\n");
  console.error("Could not start the File Manager. See " + logFile, err);
  process.exitCode = 1;
} finally {
  closeSync(log);
}
`;

async function compileLauncher(d: Download, outFile: string, icoFile: string | null): Promise<void> {
  const t = targetOf(d);
  mkdirSync(CACHE_DIR, { recursive: true });
  const stub = join(CACHE_DIR, "fm-launcher.ts");
  writeFileAtomic(stub, LAUNCHER_STUB);
  const args = ["bun", "build", "--compile", "--minify", `--target=${t.bunTarget}`, `--outfile=${outFile}`];
  // Bun only embeds a custom .exe icon and title when it runs on Windows; building from a Mac or Linux keeps Bun's own. Hiding the console works everywhere.
  if (d.os === "windows") {
    args.push("--windows-hide-console");
    if (process.platform === "win32") args.push(`--windows-title=${APP_TITLE}`, ...(icoFile ? [`--windows-icon=${icoFile}`] : []));
  }
  await run([...args, stub]);
}

export function readmeFor(d: Download): string {
  const L: string[] = [`${APP_TITLE} ${VERSION}: ${d.label}`, "", d.hint + ".", ""];
  if (d.os === "windows") {
    L.push(`Start it: double-click "${APP_TITLE}.exe".`, "", "It needs the Microsoft WebView2 runtime (already part of Windows 11):", "  https://developer.microsoft.com/microsoft-edge/webview2/", "");
    L.push("Windows SmartScreen may say the app is unrecognised the first time. Choose More info > Run anyway.", "Keep the folders next to the .exe (app, lib, resources): the program reads them.");
    L.push("", "The native window also needs Microsoft Visual C++ 2015-2022 Redistributable (x64):", "  https://aka.ms/vs/17/release/vc_redist.x64.exe");
    if (d.arch === "arm64") L.push("", "This is the 64-bit Intel/AMD build; Windows on ARM runs it through its own emulation. It works the same, a little slower to start.");
  } else if (d.os === "linux") {
    L.push("Start it:", "  ./codecaine-file-manager", "", "Add it to your applications menu and your PATH:", "  sh install.sh        (undo with: sh install.sh --uninstall)", "", "It needs GTK 4 and WebKitGTK 6.0:", "  Debian/Ubuntu 24.04+:  sudo apt install libgtk-4-1 libwebkitgtk-6.0-4", "  Fedora:                sudo dnf install gtk4 webkitgtk6.0", "");
    L.push("Headless (no window, open the address it prints in a browser):", "  ./codecaine-file-manager --server");
    L.push("", "Ubuntu 24.04+ sandbox fix:", "  If startup logs say 'bwrap: setting up uid map: Permission denied' or", "  'Failed to fully launch dbus-proxy', run:", "    sh install.sh --apparmor", "  Enter your sudo password in the terminal. This installs an AppArmor profile", "  for this executable only; AppArmor and WebKit's sandbox stay enabled.", "  Keep the folder in its final location; rerun that command after moving it.", "  Remove the menu entry, link and profile with: sh install.sh --uninstall --apparmor");
  }
  L.push("", "If the native window is unavailable, the File Manager opens in your default browser instead.",
    "Startup details and errors: " + (d.os === "windows" ? "%USERPROFILE%\\\\.bun_rad_studio\\\\file-manager-startup.log" : "~/.bun_rad_studio/file-manager-startup.log") + ".");
  L.push("", "Licence: MIT (see LICENSE). The source code is at https://github.com/codecaine-zz/bun_rad_studio", "");
  return L.join(d.os === "windows" ? "\r\n" : "\n");
}

export function linuxInstallScript(): string {
  return `#!/bin/sh
# Adds ${APP_TITLE} to your applications menu and links it into ~/.local/bin. Undo it with: sh install.sh --uninstall
set -e
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
BIN="\${HOME}/.local/bin"
APPS="\${HOME}/.local/share/applications"
${linuxSandboxSetup("codecaine-file-manager", "codecaine-file-manager")}\
if [ "$UNINSTALL" = 1 ]; then
  rm -f "$BIN/codecaine-file-manager" "$APPS/codecaine-file-manager.desktop"
  echo "Removed."
  exit 0
fi
mkdir -p "$BIN" "$APPS"
ln -sf "$ROOT/codecaine-file-manager" "$BIN/codecaine-file-manager"
cat > "$APPS/codecaine-file-manager.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=${APP_TITLE}
Comment=File manager for developers
Exec="$ROOT/codecaine-file-manager"
Icon=$ROOT/codecaine-file-manager.png
Terminal=false
Categories=Utility;FileManager;Development;
EOF
echo "Installed. Look for \\"${APP_TITLE}\\" in your applications menu, or run: codecaine-file-manager"
${LINUX_SANDBOX_WARNING}\
`;
}

const MAC_README = `${APP_TITLE} ${VERSION}

1. Drag "${APP_TITLE}.app" into your Applications folder.
2. Open it. The first time, macOS may say it can't verify the app (it is signed ad hoc, not with an Apple Developer ID).
   - Right-click the app, choose Open, then Open again. You only do this once.
   - Or run:  xattr -dr com.apple.quarantine "/Applications/${APP_TITLE}.app"

Everything runs on your Mac: no account, nothing is sent anywhere.
Licence: MIT. Source code: https://github.com/codecaine-zz/bun_rad_studio
`;

interface Assets {
  icnsPng: string | null;
  ico: string | null;
  png512: string | null;
}

async function makeAssets(): Promise<Assets> {
  const assets: Assets = { icnsPng: null, ico: null, png512: null };
  if (process.platform !== "darwin") return assets;
  try {
    const names = await renderPngs([iconSpecFor({ id: MAIN, category: "File & Directory Tools" })]);
    if (names.includes(MAIN)) assets.icnsPng = join(ICONS_OUT, "png", `${MAIN}.png`);
  } catch (err: any) {
    log("⚠️", `Couldn't draw the icon (${String(err?.message ?? err).split("\n")[0]}); using the generic one.`);
  }
  if (assets.icnsPng) {
    const dir = join(CACHE_DIR, "fm-icons");
    mkdirSync(dir, { recursive: true });
    assets.png512 = join(dir, "icon-512.png");
    await run(["sips", "-z", "512", "512", assets.icnsPng, "--out", assets.png512]);
    try {
      assets.ico = join(dir, "icon.ico");
      await run([MAGICK, assets.icnsPng, "-define", "icon:auto-resize=256,128,64,48,32,16", assets.ico]);
    } catch (err: any) {
      assets.ico = null;
      log("⚠️", `No Windows icon (${String(err?.message ?? err).split("\n")[0]})`);
    }
  }
  return assets;
}

async function zipDir(parent: string, entries: string[], out: string): Promise<void> {
  rmSync(out, { force: true });
  await run(["zip", "-qry", "-X", out, ...entries], { cwd: parent });
}

async function buildMac(d: Download, assets: Assets, sources: SourceApp[]): Promise<string> {
  const target = targetOf(d);
  const stage = join(STAGE, d.id);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const main = sources.find((s) => s.name === MAIN)!;
  const app: MacApp = { id: MAIN, title: APP_TITLE, emoji: "📁", category: "File & Directory Tools", source: main };
  const runtime = await buildRuntime(target);
  const opts = { outDir: stage, arch: d.arch, only: null, install: false, zip: false, verify: false, sign: false, jobs: 1 } as const;
  const bundle = await buildApp(app, runtime, { ...opts }, assets.icnsPng);
  const appDir = join(bundle, "Contents", "Resources", "app");
  for (const s of STUDIOS) if (existsSync(join(BUNDLE_DIR, "apps", `${s}.js`))) cpSync(join(BUNDLE_DIR, "apps", `${s}.js`), join(appDir, `${s}.js`));
  await run(["codesign", "--force", "--deep", "--sign", "-", bundle]);
  writeFileSync(join(stage, "READ ME FIRST.txt"), MAC_README);
  const out = join(OUT_DIR, zipName(d));
  rmSync(out, { force: true });
  // ditto keeps the .app exactly as macOS expects (permissions, signatures, extended attributes).
  const holder = join(stage, "pkg");
  mkdirSync(holder, { recursive: true });
  cpSync(bundle, join(holder, `${APP_TITLE}.app`), { recursive: true });
  cpSync(join(stage, "READ ME FIRST.txt"), join(holder, "READ ME FIRST.txt"));
  await run(["ditto", "-c", "-k", "--norsrc", holder, out]);
  return out;
}

async function buildFolder(d: Download, assets: Assets): Promise<string> {
  const target = targetOf(d);
  const name = `Codecaine-File-Manager-v${VERSION}-${d.id}`;
  const stage = join(STAGE, d.id);
  const dir = join(stage, name);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(dir, "app"), { recursive: true });
  mkdirSync(join(dir, "lib"), { recursive: true });

  const exeName = d.os === "windows" ? `${APP_TITLE}.exe` : "codecaine-file-manager";
  await compileLauncher(d, join(dir, exeName), d.os === "windows" ? assets.ico : null);
  if (d.os !== "windows") chmodSync(join(dir, exeName), 0o755);

  for (const s of [MAIN, ...STUDIOS]) if (existsSync(join(BUNDLE_DIR, "apps", `${s}.js`))) cpSync(join(BUNDLE_DIR, "apps", `${s}.js`), join(dir, "app", `${s}.js`));
  for (const f of SIDECAR_FILES) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(dir, "app", f.split("/").pop()!));
  cpSync(webviewLibSource(target.webviewLib!), join(dir, "lib", target.webviewLib!));
  cpSync(join(ROOT, "resources"), join(dir, "resources"), { recursive: true });
  if (existsSync(join(ROOT, "LICENSE"))) cpSync(join(ROOT, "LICENSE"), join(dir, "LICENSE"));
  writeFileSync(join(dir, "README.txt"), readmeFor(d));
  writeFileSync(join(dir, "VERSION"), `${VERSION}\n`);
  if (d.os === "linux") {
    writeFileSync(join(dir, "install.sh"), linuxInstallScript());
    chmodSync(join(dir, "install.sh"), 0o755);
    if (assets.png512) cpSync(assets.png512, join(dir, "codecaine-file-manager.png"));
  }
  const out = join(OUT_DIR, zipName(d));
  await zipDir(stage, [name], out);
  return out;
}

export function downloadPage(rows: Array<{ d: Download; file: string; bytes: number }>, baseUrl = ""): string {
  const base = baseUrl && !baseUrl.endsWith("/") ? `${baseUrl}/` : baseUrl;
  const data = rows.map((r) => ({ id: r.d.id, os: r.d.os, arch: r.d.arch, label: r.d.label, hint: r.d.hint, older: !!r.d.older, file: base + r.file, size: mb(r.bytes) }));
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const card = (os: "macos" | "windows" | "linux", title: string, icon: string, note: string) => {
    const list = rows.filter((r) => r.d.os === os);
    const main = list.filter((r) => !r.d.older);
    const old = list.filter((r) => r.d.older);
    const btn = (r: (typeof rows)[number], primary: boolean) =>
      `<a class="btn${primary ? "" : " ghost"}" data-id="${r.d.id}" href="${esc(base + r.file)}" download><span class="b-top">${esc(r.d.label)}</span><span class="b-sub">${esc(r.d.hint)}</span><span class="b-size">.zip · ${mb(r.bytes)}</span></a>`;
    return `<section class="card" id="${os}"><div class="icon">${icon}</div><h2>${title}</h2><p class="note">${note}</p>${main.map((r) => btn(r, true)).join("")}${old.length ? `<details><summary>Older computers</summary>${old.map((r) => btn(r, false)).join("")}</details>` : ""}</section>`;
  };
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Download ${APP_TITLE}</title>
<meta name="description" content="Download ${APP_TITLE} for macOS, Windows and Linux. No compiling needed.">
<style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#121a33;--line:#243056;--fg:#e8ecf8;--dim:#93a0c6;--acc:#6366f1;--acc2:#38bdf8}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 500px at 15% -10%,#2a2f78 0,transparent 60%),radial-gradient(900px 500px at 100% 0,#0e4a66 0,transparent 55%),var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:1100px;margin:0 auto;padding:56px 24px 72px}
h1{font-size:clamp(34px,6vw,60px);margin:0 0 8px;letter-spacing:-.02em;line-height:1.05}h1 span{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--dim);font-size:19px;max-width:720px;margin:0 0 8px}.ver{color:var(--dim);font-size:14px;margin:0 0 36px}
#rec{display:none;margin:0 0 28px;padding:18px 22px;border:1px solid var(--acc);border-radius:16px;background:linear-gradient(90deg,#1b2160,#0f3550);align-items:center;gap:16px;flex-wrap:wrap}
#rec b{font-size:18px}#rec a{margin-left:auto;background:#fff;color:#0b1020;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px}.card.me{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 18px 50px #6366f130}
.icon{font-size:40px}h2{margin:6px 0 4px;font-size:26px}.note{color:var(--dim);margin:0 0 18px;font-size:14px}
.btn{display:grid;grid-template-columns:1fr auto;gap:2px 12px;align-items:center;padding:14px 16px;margin:0 0 10px;border-radius:14px;text-decoration:none;color:#fff;background:linear-gradient(135deg,var(--acc),#4f46e5);border:1px solid transparent;transition:transform .12s,filter .12s}
.btn:hover{transform:translateY(-1px);filter:brightness(1.1)}.btn.ghost{background:transparent;border-color:var(--line)}.btn.rec{outline:2px solid var(--acc2);outline-offset:2px}
.b-top{font-weight:700;font-size:17px}.b-size{grid-row:1;grid-column:2;font-size:13px;opacity:.85;white-space:nowrap}.b-sub{grid-column:1/3;font-size:13px;opacity:.8}
details{margin-top:6px}summary{cursor:pointer;color:var(--dim);font-size:14px;margin:8px 0}
.how{margin-top:36px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}.how div{border:1px solid var(--line);border-radius:16px;padding:20px;background:#0e1530}
.how h3{margin:0 0 8px;font-size:17px}.how p,.how li{color:var(--dim);font-size:14px;margin:4px 0}.how ol{padding-left:20px;margin:0}code{background:#1a2347;padding:2px 6px;border-radius:6px;font-size:13px;color:#cbd5f5}
footer{margin-top:40px;color:var(--dim);font-size:14px}footer a{color:var(--acc2)}
</style></head><body><main>
<h1>${APP_TITLE.replace("File Manager", "<span>File Manager</span>")}</h1>
<p class="lead">A fast, private file manager for developers: dual panes, code editor, database studios, encrypted vault, live server and more. Download it, unzip it, open it. No compiling.</p>
<p class="ver">Version ${VERSION} · macOS, Windows and Linux · free and open source (MIT)</p>
<div id="rec"><div><b id="rec-title"></b><div id="rec-sub" style="color:#b9c4e8;font-size:14px"></div></div><a id="rec-link" href="#" download>Download</a></div>
<div class="grid">
${card("macos", "macOS", "🍎", "A double-clickable .app with its own icon. Drag it to Applications.")}
${card("windows", "Windows", "🪟", "Unzip and double-click the .exe. Needs the WebView2 runtime (built into Windows 11).")}
${card("linux", "Linux", "🐧", "Unzip, run it, or use install.sh for a menu entry. Needs GTK 4 and WebKitGTK 6.0.")}
</div>
<div class="how">
<div><h3>macOS: first launch</h3><ol><li>Unzip and drag the app to Applications.</li><li>Right-click it, choose <b>Open</b>, then <b>Open</b> again.</li></ol><p>Or: <code>xattr -dr com.apple.quarantine "/Applications/${APP_TITLE}.app"</code></p></div>
<div><h3>Windows: first launch</h3><ol><li>Unzip the whole folder (keep the files together).</li><li>Double-click <b>${APP_TITLE}.exe</b>.</li></ol><p>If SmartScreen warns you, choose <b>More info</b> then <b>Run anyway</b>.</p></div>
<div><h3>Linux: first launch</h3><ol><li><code>unzip</code> the download.</li><li>Run <code>./codecaine-file-manager</code> or <code>sh install.sh</code>.</li></ol><p>Ubuntu 24.04+: if the window crashes with a bwrap / dbus-proxy permission error, run <code>sh install.sh --apparmor</code> (sudo required). This permits sandbox namespaces for this executable only. Rerun after moving the folder.</p><p>Not sure of your CPU? <code>uname -m</code> prints x86_64 or aarch64.</p></div>
</div>
<footer>Check a download: <code>shasum -a 256 -c SHA256SUMS.txt --ignore-missing</code> (the file is next to the zips). Prefer to build it yourself? The source is on <a href="https://github.com/codecaine-zz/bun_rad_studio">GitHub</a>.</footer>
</main>
<script>
const FILES = ${JSON.stringify(data)};
(function () {
  const ua = navigator.userAgent || "", plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const os = /Win/i.test(plat + ua) ? "windows" : /Mac/i.test(plat) && !/iPhone|iPad/i.test(ua) ? "macos" : /Linux|X11|CrOS/i.test(plat + ua) ? "linux" : null;
  if (!os) return;
  const card = document.getElementById(os);
  if (card) card.classList.add("me");
  const finish = (arch) => {
    const pick = FILES.find((f) => f.os === os && f.arch === arch && !f.older) || FILES.find((f) => f.os === os && !f.older);
    if (!pick) return;
    const a = document.querySelector('[data-id="' + pick.id + '"]');
    if (a) a.classList.add("rec");
    const names = { macos: "macOS", windows: "Windows", linux: "Linux" };
    document.getElementById("rec").style.display = "flex";
    document.getElementById("rec-title").textContent = "Looks like you are on " + names[os] + (arch === "arm64" ? " (ARM)" : "");
    document.getElementById("rec-sub").textContent = pick.label + " · " + pick.size + (os === "macos" ? ". Not sure which Mac you have? Apple menu > About This Mac: \\u201cChip\\u201d means Apple silicon." : "");
    const l = document.getElementById("rec-link"); l.href = pick.file; l.textContent = "Download for " + names[os];
  };
  // The processor can only be read reliably from newer browsers; when it can't, assume the most common one.
  const hi = navigator.userAgentData && navigator.userAgentData.getHighEntropyValues;
  if (hi) navigator.userAgentData.getHighEntropyValues(["architecture"]).then((v) => finish(/arm/i.test(v.architecture || "") ? "arm64" : "x64")).catch(() => finish(os === "macos" ? "arm64" : "x64"));
  else finish(os === "macos" ? "arm64" : /aarch64|arm/i.test(ua + plat) ? "arm64" : "x64");
})();
</script></body></html>
`;
}

export function parseArgs(argv: string[]): { ids: string[] | null; list: boolean; baseUrl: string; pageOnly: boolean; jobs: number } {
  let ids: string[] | null = null;
  let list = false;
  let baseUrl = "";
  let pageOnly = false;
  let jobs = defaultJobs();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--targets") ids = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--list") list = true;
    else if (a === "--base-url") baseUrl = argv[++i] ?? "";
    else if (a === "--page-only") pageOnly = true;
    else if (a === "--jobs" || a === "-j") jobs = parseJobs(argv[++i]);
    else throw new Error(`Unknown option "${a}". Options: --targets a,b  --list  --base-url <url the zips are hosted at>  --page-only  --jobs N`);
  }
  return { ids, list, baseUrl, pageOnly, jobs };
}

async function main() {
  const { ids, list, baseUrl, pageOnly, jobs } = parseArgs(process.argv.slice(2));
  if (list) {
    for (const d of DOWNLOADS) console.log(`${d.id.padEnd(22)} ${d.label.padEnd(22)} ${d.hint}`);
    return;
  }
  if (pageOnly) {
    mkdirSync(OUT_DIR, { recursive: true });
    const have = DOWNLOADS.filter((d) => existsSync(join(OUT_DIR, zipName(d)))).map((d) => ({ d, file: zipName(d), bytes: statSync(join(OUT_DIR, zipName(d))).size }));
    writeFileSync(join(OUT_DIR, "index.html"), downloadPage(have, baseUrl));
    log("🌐", `index.html rewritten for ${have.length} downloads${baseUrl ? ` hosted at ${baseUrl}` : ""}`);
    return;
  }
  let chosen = DOWNLOADS;
  if (ids) {
    const bad = ids.filter((i) => !DOWNLOADS.some((d) => d.id === i));
    if (bad.length) throw new Error(`Unknown target ${bad.join(", ")}. Choose from: ${DOWNLOADS.map((d) => d.id).join(", ")}`);
    chosen = DOWNLOADS.filter((d) => ids.includes(d.id));
  }
  if (chosen.some((d) => d.os === "macos") && process.platform !== "darwin") throw new Error("The macOS .app downloads can only be built on a Mac (they need codesign, sips and iconutil).");

  const sources = listSourceApps().filter((s) => s.name === MAIN || STUDIOS.includes(s.name));
  if (!sources.some((s) => s.name === MAIN)) throw new Error("applications/file_manager_studio.ts was not found");
  mkdirSync(OUT_DIR, { recursive: true });

  log("🧩", `Bundling ${sources.length} programs (the File Manager and its ${sources.length - 1} database studios)`);
  const bundles = await bundleApps(sources, undefined, jobs);
  logBundleFailures(bundles);
  if (!bundles.built.some((s) => s.name === MAIN)) throw new Error("The File Manager did not bundle");

  const assets = await makeAssets();
  const rows: Array<{ d: Download; file: string; bytes: number }> = [];
  const failures: string[] = [];
  const built = await mapPool(chosen, jobs, async (d) => {
    try {
      log("🔨", `${d.id}`);
      const out = d.os === "macos" ? await buildMac(d, assets, sources) : await buildFolder(d, assets);
      log("✅", `${out.split("/").pop()}  ${mb(statSync(out).size)}`);
      return { d, file: out.split("/").pop()!, bytes: statSync(out).size };
    } catch (err: any) {
      failures.push(`${d.id}: ${String(err?.message ?? err).split("\n").slice(0, 3).join(" ")}`);
      log("❌", failures[failures.length - 1]!);
      return null;
    }
  });
  for (const r of built) if (r) rows.push(r);
  rmSync(STAGE, { recursive: true, force: true });

  // The page and checksums always describe every zip that is present, not only the ones built this time.
  const present = DOWNLOADS.filter((d) => existsSync(join(OUT_DIR, zipName(d)))).map((d) => ({ d, file: zipName(d), bytes: statSync(join(OUT_DIR, zipName(d))).size }));
  writeFileSync(join(OUT_DIR, "index.html"), downloadPage(present, baseUrl));
  const sums: string[] = [];
  for (const r of present) sums.push(`${await sha256File(join(OUT_DIR, r.file))}  ${r.file}`);
  writeFileSync(join(OUT_DIR, "SHA256SUMS.txt"), sums.join("\n") + "\n");
  log("🌐", `${join(OUT_DIR, "index.html")} lists ${present.length} downloads`);
  if (failures.length) {
    console.error(`\n${failures.length} download(s) failed:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
}

if (import.meta.main) main().catch((e) => { console.error(e); process.exit(1); });
