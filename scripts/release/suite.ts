// Builds one release archive per platform: a small Bun runtime for that platform, every app bundled to one
// JavaScript file, the window library the desktop apps need, their resources, and a launcher for each app.
//
//   <name>/runtime/bun            the platform's Bun runtime (a compiled stub; it acts as plain `bun` with BUN_BE_BUN=1)
//   <name>/apps/*.js, cli/*.js    each application, bundled (the same files for every platform)
//   <name>/bin/<app>[.cmd]        start any app with `bin/<app>` (a tiny launcher script)
//   <name>/lib/                   the native window library for this platform
//   <name>/resources/             pages, images and other files the apps read
//
// One shared runtime instead of a 60 MB executable per app keeps the whole suite near 30 MB per platform.
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";
import { ROOT, SIDECAR_FILES, TARGETS, VERSION, defaultJobs, log, mapPool, run, shQuote, webviewLibSource, writeFileAtomic, zipEntries, type SourceApp, type Target } from "./common";
import { LINUX_SANDBOX_WARNING, linuxSandboxSetup } from "./linuxSandbox";
import { WINDOWS_SETUP, desktopInfo, embedWindowsIcon, stageDesktopIcons, windowsDesktopLauncher, windowsInstallCommand, windowsInstallScript } from "./desktop";

export const RELEASE_DIR = join(ROOT, "release");
export const CACHE_DIR = join(RELEASE_DIR, ".cache");
export const BUNDLE_DIR = join(CACHE_DIR, "bundles");

export interface BundleResult {
  built: SourceApp[];
  failed: Array<{ app: SourceApp; reason: string }>;
}

const WEBVIEW_STUB = `export const SizeHint = { NONE: 0, MIN: 1, MAX: 2, FIXED: 3 };
export class Webview {
  constructor() { throw new Error("Windows can't be opened from a command-line tool. Start the matching desktop app instead."); }
}
export function unload() {}
export const WEBVIEW_VERSION = "0.12.0";
`;

const FILE_MANAGER_WORKER = "fmFindWorker.ts";

/** Copies an app and the separately bundled worker it loads relative to its own URL. */
export function copyAppBundle(app: SourceApp, destination: string, outRoot = BUNDLE_DIR): void {
  const source = join(outRoot, app.kind === "gui" ? "apps" : "cli");
  cpSync(join(source, `${app.name}.js`), join(destination, `${app.name}.js`));
  if (app.name === "file-manager-studio") {
    cpSync(join(source, FILE_MANAGER_WORKER), join(destination, FILE_MANAGER_WORKER));
  }
}

/**
 * The window library is found through the WEBVIEW_PATH that every launcher sets, so the bundles carry no copy of it.
 * - Desktop apps: webview-bun's loader is replaced by one that reads WEBVIEW_PATH or lib/ next to the bundle (its own
 *   picks a file inside node_modules, which a bundle can't carry). Child processes an app starts find it the same way.
 * - Command-line tools: the whole module is replaced by a stub. They never open a window, and without it they start
 *   on computers that have no GTK or WebKit at all (servers, Alpine).
 */
export function webviewPlugin(kind: SourceApp["kind"]): import("bun").BunPlugin {
  return {
    name: "webview-from-env",
    setup(build) {
      if (kind === "cli") {
        build.onResolve({ filter: /^webview-bun$/ }, () => ({ path: "webview-bun-stub", namespace: "webview-stub" }));
        build.onLoad({ filter: /.*/, namespace: "webview-stub" }, () => ({ contents: WEBVIEW_STUB, loader: "js" }));
        return;
      }
      build.onLoad({ filter: /webview-bun[\\/]src[\\/]ffi\.ts$/ }, async ({ path }) => {
        const source = readFileSync(path, "utf8");
        // The library sits in lib/ next to the folder the bundle is in; WEBVIEW_PATH (set by the launchers) wins when present.
        const file = 'process.platform === "win32" ? "libwebview.dll" : process.platform === "darwin" ? "libwebview.dylib" : `libwebview-${process.arch}.so`';
        const patched = source.replace(/let lib_file;[\s\S]*?(?=export const lib = dlopen)/, `import { join as __join } from "node:path";\nconst lib_file = { default: process.env.WEBVIEW_PATH || __join(import.meta.dir, "..", "lib", ${file}) };\n\n`);
        if (patched === source) throw new Error("webview-bun's loader changed; update webviewPlugin in scripts/release/suite.ts");
        // Server mode and browser-hosted tools must start even when native desktop dependencies are missing.
        const lazy = patched.replace("export const lib = dlopen(", "const loadLibrary = () => dlopen(");
        return { contents: `${lazy}
let nativeLibrary: ReturnType<typeof loadLibrary> | undefined;
export const lib = {
  get symbols() { return (nativeLibrary ??= loadLibrary()).symbols; },
  close() { nativeLibrary?.close(); },
};
`, loader: "ts" };
      });
    },
  };
}

/** Bundles every app to `bundles/apps/<name>.js` or `bundles/cli/<name>.js`. Failures are reported, not fatal. */
export async function bundleApps(apps: SourceApp[], outRoot = BUNDLE_DIR, jobs = defaultJobs()): Promise<BundleResult> {
  rmSync(outRoot, { recursive: true, force: true });
  for (const kind of ["apps", "cli"]) mkdirSync(join(outRoot, kind), { recursive: true });
  // Several bundles are made at once; each writes only its own file, and the shared _assets folders are cleared at the end.
  const outcomes = await mapPool(apps, jobs, async (app): Promise<string | null> => {
    const dir = join(outRoot, app.kind === "gui" ? "apps" : "cli");
    try {
      const out = await Bun.build({
        entrypoints: [resolve(ROOT, app.entry)],
        target: "bun",
        minify: true,
        plugins: [webviewPlugin(app.kind), {
          name: "release-entrypoint",
          setup(build) {
            build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, ({ path }) => {
              if (path !== resolve(ROOT, app.entry)) return;
              // Bun can misidentify UNC entrypoints when the file URL lowercases the server name.
              const source = readFileSync(path, "utf8").replace(/^#![^\r\n]*(?:\r?\n|$)/, "").replace(/\bimport\.meta\.main\b/g,
                '(import.meta.main || import.meta.url === __releaseEntryUrl(Bun.main).href)');
              return { contents: `import { pathToFileURL as __releaseEntryUrl } from "node:url";\n${source}`, loader: path.endsWith(".ts") ? "ts" : "js" };
            });
          },
        }],
        outdir: dir,
        naming: { entry: `${app.name}.js`, asset: "_assets/[name]-[hash].[ext]" },
      });
      if (!out.success) throw new Error(out.logs.map((l) => l.message).join("; ").slice(0, 300) || "the bundler failed");
      if (app.name === "file-manager-studio") {
        // Keep the filename used by fmFindRun's relative URL; the contents include all worker dependencies.
        const worker = await Bun.build({
          entrypoints: [join(ROOT, "src/features/filemanager", FILE_MANAGER_WORKER)],
          target: "bun",
          minify: true,
          outdir: dir,
          naming: { entry: FILE_MANAGER_WORKER },
        });
        if (!worker.success) throw new Error(worker.logs.map((l) => l.message).join("; ").slice(0, 300) || "the Find worker bundler failed");
      }
      return null;
    } catch (err: any) {
      return String(err?.message ?? err).slice(0, 300);
    }
  });
  const result: BundleResult = { built: [], failed: [] };
  apps.forEach((app, i) => (outcomes[i] === null ? result.built.push(app) : result.failed.push({ app, reason: outcomes[i]! })));
  // The native library is loaded from lib/ (WEBVIEW_PATH), so the copies the bundler made are not needed.
  for (const kind of ["apps", "cli"]) rmSync(join(outRoot, kind, "_assets"), { recursive: true, force: true });
  return result;
}

const STUB = `// A runtime: with BUN_BE_BUN=1 this executable behaves exactly like the \`bun\` command.\nconsole.log("Bun RAD Studio runtime");\n`;

/** The runtime for a target: a compiled stub, cached between runs and invalidated whenever Bun.version changes. */
export async function buildRuntime(target: Target): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const exe = target.os === "windows" ? ".exe" : "";
  const out = join(CACHE_DIR, `runtime-${target.id}${exe}`);
  const stamp = join(CACHE_DIR, `runtime-${target.id}.bun-version`);
  if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === Bun.version) return out;
  rmSync(out, { force: true });
  const stub = join(CACHE_DIR, "runtime-stub.ts");
  writeFileAtomic(stub, STUB);
  await run(["bun", "build", "--compile", "--minify", `--target=${target.bunTarget}`, `--outfile=${out}`, stub]);
  if (target.os === "windows") embedWindowsIcon(out, desktopInfo("rad-studio").ico);
  writeFileAtomic(stamp, `${Bun.version}\n`);
  return out;
}

export function unixLauncher(app: SourceApp, target: Target): string {
  const lib = app.kind === "gui" && target.webviewLib ? `[ -n "$WEBVIEW_PATH" ] || export WEBVIEW_PATH="$ROOT/lib/${target.webviewLib}"\n` : "";
  const dir = app.kind === "gui" ? "apps" : "cli";
  // Desktop apps look for ./resources and keep small files in their start folder: give them a writable one that links to ours.
  const work = app.kind === "gui" ? `WORK="\${HOME}/.bun_rad_studio/run"\nmkdir -p "$WORK" && ln -sfn "$ROOT/resources" "$WORK/resources" && cd "$WORK"\n` : "";
  return `#!/bin/sh
# Starts ${app.name}. Works through symlinks, so you can link it into a folder on your PATH.
p="$0"
while [ -h "$p" ]; do
  l="$(readlink "$p")"
  case "$l" in /*) p="$l" ;; *) p="$(dirname "$p")/$l" ;; esac
done
ROOT="$(cd "$(dirname "$p")/.." && pwd -P)"
export BUN_BE_BUN=1
${lib}${work}exec "$ROOT/runtime/bun" "$ROOT/${dir}/${app.name}.js" "$@"
`;
}

export function windowsLauncher(app: SourceApp, target: Target): string {
  const lib = app.kind === "gui" && target.webviewLib ? `if not defined WEBVIEW_PATH set "WEBVIEW_PATH=%ROOT%\\lib\\${target.webviewLib}"\r\n` : "";
  const dir = app.kind === "gui" ? "apps" : "cli";
  const cd = app.kind === "gui" ? `pushd "%ROOT%" || exit /b 1\r\n` : "";
  const exit = app.kind === "gui" ? `set "EXIT_CODE=%errorlevel%"\r\npopd\r\nexit /b %EXIT_CODE%\r\n` : "exit /b %errorlevel%\r\n";
  const runtime = app.kind === "gui" && target.guiRuntime ? "bun-gui.exe" : "bun.exe";
  return `@echo off\r\nsetlocal\r\nset "ROOT=%~dp0.."\r\nset BUN_BE_BUN=1\r\n${lib}${cd}"%ROOT%\\runtime\\${runtime}" "%ROOT%\\${dir}\\${app.name}.js" %*\r\n${exit}`;
}

export function installScript(guiNames: string[], target?: Target): string {
  const sandbox = target?.os === "linux" && target.gui && guiNames.length > 0;
  return `#!/bin/sh
# Installs Bun RAD Studio for the current user: links every app into ~/.local/bin and adds the desktop apps to
# the applications menu. Run it from the folder you unpacked. Undo it with: sh install.sh --uninstall
set -e
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
BIN="\${HOME}/.local/bin"
APPS="\${HOME}/.local/share/applications"
${sandbox ? linuxSandboxSetup("bun-rad-studio", "runtime/bun") : `UNINSTALL=0
case "\${1:-}" in
  --uninstall) UNINSTALL=1 ;;
  "") ;;
  *) echo "Usage: sh install.sh [--uninstall]" >&2; exit 1 ;;
esac
`}\
if [ "$UNINSTALL" = 1 ]; then
  for f in "$ROOT"/bin/*; do rm -f "$BIN/$(basename "$f")"; done
  rm -f "$APPS"/bun-rad-studio-*.desktop
  echo "Removed the links and menu entries."
  exit 0
fi
mkdir -p "$BIN" "$APPS"
for f in "$ROOT"/bin/*; do ln -sf "$f" "$BIN/$(basename "$f")"; done
chmod +x "$ROOT/runtime/bun" "$ROOT"/bin/*
ESCAPED_ROOT="$(printf '%s' "$ROOT" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g; s/[\`]/\\\\\\\`/g; s/\\$/\\\\$/g; s/%/%%/g')"
${guiNames.length ? `for name in ${guiNames.map(shQuote).join(" ")}; do
  icon="$ROOT/share/icons/$name.png"
  case "$name" in
${guiNames.map(name => `    ${shQuote(name)}) title=${shQuote(desktopInfo(name).title)} ;;`).join("\n")}
  esac
  cat > "$APPS/bun-rad-studio-$name.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$title
Comment=Bun RAD Studio
Exec="$ESCAPED_ROOT/bin/$name"
Icon=$icon
Terminal=false
Categories=Development;Utility;
EOF
done` : ""}
echo "Installed. Make sure $BIN is on your PATH, then try: ${guiNames[0] ?? "fd-cli"}"
${sandbox ? LINUX_SANDBOX_WARNING : ""}\
`;
}

export function readme(target: Target, guiNames: string[], cliNames: string[]): string {
  const sh = target.os !== "windows";
  const run1 = sh ? `./bin/${guiNames[0] ?? cliNames[0] ?? "app"}` : `bin\\${guiNames[0] ?? cliNames[0] ?? "app"}.cmd`;
  const lines = [
    `Bun RAD Studio ${VERSION}: ${target.id}`,
    "",
    target.note + ".",
    "",
    "Start an app:",
    `  ${run1}`,
    "",
    guiNames.length ? `Desktop apps (${guiNames.length}), start any of them from bin/:\n${guiNames.map((n) => `  ${n}`).join("\n")}\n` : "This download has the command-line tools only.\n",
    `Command-line tools (${cliNames.length}), start any of them from bin/ and add --help:\n${cliNames.map((n) => `  ${n}`).join("\n")}`,
    "",
  ];
  if (sh) lines.push("Put them on your PATH (and add the desktop apps to your menu on Linux):", "  sh install.sh", "");
  if (target.os === "macos") lines.push("macOS may ask you to allow the downloaded files the first time:", "  xattr -dr com.apple.quarantine .", "  (or open System Settings > Privacy & Security and choose Open Anyway)", "");
  if (target.os === "linux" && target.variant === "musl") lines.push("Alpine needs the C++ runtime for Bun:", "  apk add libstdc++ libgcc", "");
  if (target.os === "linux" && target.gui) lines.push("The desktop apps need GTK 4 and WebKitGTK 6.0:", "  Debian/Ubuntu 24.04+:  sudo apt install libgtk-4-1 libwebkitgtk-6.0-4", "  Fedora:                sudo dnf install gtk4 webkitgtk6.0", "");
  if (target.os === "linux" && target.gui) lines.push("Ubuntu 24.04+ may block WebKit's sandbox with a bwrap / dbus-proxy permission error.", "Fix all desktop apps in this download with:", "  sh install.sh --apparmor", "This uses sudo to install /etc/apparmor.d/bun-rad-studio, allowing sandbox user", "namespaces for this download's runtime/bun only. AppArmor and WebKit's sandbox stay enabled.", "All apps and their child studios use that shared runtime; no per-app setup is needed.", "Keep the folder in its final location, and rerun after moving it. One suite installation", "is covered at a time. Command-line tools do not need this permission.", "Remove links, menu entries and the profile with: sh install.sh --uninstall --apparmor", "");
  if (target.os === "windows" && target.gui) lines.push("First, double-click install.cmd. It checks Microsoft WebView2 and the Visual C++ 2015-2022 x64 Redistributable (including on ARM), offers to install missing prerequisites from Microsoft, then adds Start menu shortcuts.", "No Bun, compiler, administrator shell or source checkout is needed. Microsoft installers may request elevation.", "Manual downloads:", "  https://developer.microsoft.com/microsoft-edge/webview2/", "  https://aka.ms/vs/17/release/vc_redist.x64.exe", "", "Optional desktop shortcuts: powershell -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1 -Desktop", "Undo: powershell -NoProfile -ExecutionPolicy Bypass -File .\\install.ps1 -Uninstall -Desktop", "Keep the folder in place. Menu shortcuts start without a console; errors are in %USERPROFILE%\\.bun_rad_studio\\logs.", "For a console with the original output, run the matching bin\\<app>.cmd.", "");
  lines.push("Every file in this download is also in the source repository. License: MIT (see LICENSE).", "");
  return lines.join(sh ? "\n" : "\r\n");
}

export interface StageOptions {
  bundles: BundleResult;
}

/** Lays out one platform's folder, ready to be archived. Returns the folder. */
export async function stageSuite(target: Target, options: StageOptions, stageRoot = join(RELEASE_DIR, ".stage")): Promise<string> {
  const name = `bun-rad-studio-v${VERSION}-${target.id}`;
  const dir = join(stageRoot, name);
  rmSync(dir, { recursive: true, force: true });
  for (const sub of ["bin", "runtime", "cli"]) mkdirSync(join(dir, sub), { recursive: true });

  const exe = target.os === "windows" ? ".exe" : "";
  const runtime = await buildRuntime(target);
  cpSync(runtime, join(dir, "runtime", `bun${exe}`));
  if (target.os !== "windows") chmodSync(join(dir, "runtime", "bun"), 0o755);
  if (target.guiRuntime) {
    const guiTarget = TARGETS.find(t => t.id === target.guiRuntime);
    if (!guiTarget) throw new Error(`Unknown desktop runtime ${target.guiRuntime}`);
    cpSync(await buildRuntime(guiTarget), join(dir, "runtime", "bun-gui.exe"));
  }

  const apps = options.bundles.built.filter((a) => a.kind === "cli" || target.gui);
  const gui = apps.filter((a) => a.kind === "gui");
  const cli = apps.filter((a) => a.kind === "cli");
  if (gui.length) mkdirSync(join(dir, "apps"), { recursive: true });
  for (const app of apps) {
    const sub = app.kind === "gui" ? "apps" : "cli";
    copyAppBundle(app, join(dir, sub));
    if (target.os === "windows") {
      writeFileSync(join(dir, "bin", `${app.name}.cmd`), windowsLauncher(app, target));
      if (app.kind === "gui") writeFileSync(join(dir, "bin", `${app.name}.ps1`), windowsDesktopLauncher(app.name, target.guiRuntime ? "bun-gui.exe" : "bun.exe"));
    }
    else {
      const file = join(dir, "bin", app.name);
      writeFileSync(file, unixLauncher(app, target));
      chmodSync(file, 0o755);
    }
  }
  if (gui.length && target.webviewLib) {
    mkdirSync(join(dir, "lib"), { recursive: true });
    cpSync(webviewLibSource(target.webviewLib), join(dir, "lib", target.webviewLib));
    // On a Mac, a copy-on-write clone costs no extra disk space.
    cpSync(join(ROOT, "resources"), join(dir, "resources"), { recursive: true });
    for (const f of SIDECAR_FILES) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(dir, "apps", f.split("/").pop()!));
  }
  if (gui.length) stageDesktopIcons(dir, gui.map(a => a.name));
  const guiNames = gui.map((a) => a.name);
  writeFileSync(join(dir, "README.txt"), readme(target, guiNames, cli.map((a) => a.name)));
  writeFileSync(join(dir, "VERSION"), `${VERSION}\n`);
  if (target.os === "windows" && gui.length) {
    writeFileSync(join(dir, "install.ps1"), windowsInstallScript(guiNames));
    writeFileSync(join(dir, "setup.ps1"), WINDOWS_SETUP);
    writeFileSync(join(dir, "install.cmd"), windowsInstallCommand(true));
  }
  if (existsSync(join(ROOT, "LICENSE"))) cpSync(join(ROOT, "LICENSE"), join(dir, "LICENSE"));
  if (target.os !== "windows") {
    writeFileSync(join(dir, "install.sh"), installScript(guiNames, target));
    chmodSync(join(dir, "install.sh"), 0o755);
  }
  return dir;
}

/** Packs a staged folder: .tar.gz for macOS and Linux, .zip for Windows. Returns the archive path. */
export async function archiveSuite(dir: string, target: Target, outDir = RELEASE_DIR): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const base = basename(dir);
  const parent = join(dir, "..");
  if (target.os === "windows") {
    const out = join(outDir, `${base}.zip`);
    rmSync(out, { force: true });
    await zipEntries(parent, [base], out);
    return out;
  }
  const out = join(outDir, `${base}.tar.gz`);
  rmSync(out, { force: true });
  await run(["tar", "-czf", out, "-C", parent, base]);
  return out;
}

export function logBundleFailures(result: BundleResult) {
  for (const f of result.failed) log("⚠️", `${f.app.name} did not bundle: ${f.reason}`);
}
