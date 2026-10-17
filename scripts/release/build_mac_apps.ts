#!/usr/bin/env bun
/**
 * Builds every desktop application as a double-clickable macOS .app with its own icon.
 *
 *   bun run build:mac-apps                      all apps, for this Mac, into release/mac-apps/
 *   bun run build:mac-apps -- --only calculator-studio,code-studio
 *   bun run build:mac-apps -- --arch x64        build for Intel Macs (from an Apple silicon Mac, or the other way round)
 *   bun run build:mac-apps -- --install         also copy them into ~/Applications
 *   bun run build:mac-apps -- --zip             also write one zip per architecture for a GitHub release
 *   bun run build:mac-apps -- --verify          start each app and check that its page answers (opens windows)
 *   bun run build:mac-apps -- --jobs 4          build four apps at the same time (default: your CPU cores minus one, at most 8; -j 1 builds one by one)
 *                                               (--verify always starts the apps one by one: each opens a window)
 *
 * Each .app holds a small Bun runtime, the app bundled to one file, the window library and the app's resources, so it
 * runs without Bun or this project installed. They are signed ad hoc, which is what a Mac needs to run them locally.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { collect } from "../build_showcase";
import { appStoreCategory, makeIcns } from "./icons";
import { desktopInfo } from "./desktop";
import { BUNDLE_DIR, RELEASE_DIR, bundleApps, buildRuntime, logBundleFailures } from "./suite";
import { ROOT, SIDECAR_FILES, TARGETS, VERSION, defaultJobs, listSourceApps, log, mapPool, parseJobs, run, webviewLibSource, xmlEscape, type SourceApp } from "./common";

export interface MacApp {
  /** Launcher name, like `calculator-studio`. */
  id: string;
  /** What the person sees: "Calculator Studio". */
  title: string;
  emoji: string;
  category: string;
  source: SourceApp;
}

const dashed = (s: string) => s.replace(/_/g, "-");

/** One entry per distinct desktop app: the same list (and names, emoji and categories) as SHOWCASE.md. */
export function listMacApps(): MacApp[] {
  const sources = listSourceApps().filter((a) => a.kind === "gui");
  const byName = new Map(sources.map((a) => [a.name, a]));
  const apps: MacApp[] = [];
  for (const e of collect()) {
    const source = e.file === "designer" ? byName.get("rad-designer") : byName.get(dashed(e.file));
    if (!source) continue;
    apps.push({ id: source.name, title: safeTitle(e.name), emoji: e.icon, category: e.category, source });
  }
  return apps;
}

/** A name that is allowed in a file name and reads well in the Dock and Finder. */
export function safeTitle(name: string): string {
  return name.replace(/[/:\\]/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function bundleId(id: string): string {
  return `dev.bunradstudio.${id.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
}

export function infoPlist(app: MacApp, iconFile: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>${xmlEscape(app.id)}</string>
  <key>CFBundleIconFile</key><string>${xmlEscape(iconFile)}</string>
  <key>CFBundleIdentifier</key><string>${xmlEscape(bundleId(app.id))}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>${xmlEscape(app.title)}</string>
  <key>CFBundleDisplayName</key><string>${xmlEscape(app.title)}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${xmlEscape(VERSION)}</string>
  <key>CFBundleVersion</key><string>${xmlEscape(VERSION)}</string>
  <key>LSApplicationCategoryType</key><string>${appStoreCategory(app.category)}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key><true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key><true/>
  </dict>
</dict>
</plist>
`;
}

/** The program the Dock starts. It adds the usual Homebrew and Bun folders to PATH (apps opened from Finder get a bare one). */
export function launcherScript(app: MacApp): string {
  return `#!/bin/bash
# ${app.title}
DIR="$(cd "$(dirname "$0")" && pwd -P)"
RES="$DIR/../Resources"
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.bun/bin:$PATH"
export BUN_BE_BUN=1
export WEBVIEW_PATH="$RES/lib/libwebview.dylib"
# Some apps look for ./resources or keep small files in the folder they start in. Give them one that is writable
# and not inside this app: a folder in your home that links to the app's resources.
WORK="$HOME/.bun_rad_studio/run"
mkdir -p "$WORK" && ln -sfn "$RES/resources" "$WORK/resources" && cd "$WORK"
exec "$RES/runtime/bun" "$RES/app/${app.id}.js" "$@"
`;
}

export const APPS_PER_ZIP = 30;

/** Which .app folders go into which zip file. One zip when they all fit, otherwise `-1of3`, `-2of3` ... */
export function zipPlan(names: string[], arch: string, perZip = APPS_PER_ZIP): Array<[string, string[]]> {
  const parts = Math.max(1, Math.ceil(names.length / perZip));
  const size = Math.ceil(names.length / parts);
  const base = `bun-rad-studio-v${VERSION}-macos-${arch}-apps`;
  return Array.from({ length: parts }, (_, i) => [parts === 1 ? `${base}.zip` : `${base}-${i + 1}of${parts}.zip`, names.slice(i * size, (i + 1) * size)] as [string, string[]]).filter(([, g]) => g.length > 0);
}

export interface BuildOptions {
  outDir: string;
  arch: "arm64" | "x64";
  only: string[] | null;
  install: boolean;
  zip: boolean;
  verify: boolean;
  sign: boolean;
  /** How many apps are built, installed and zipped at the same time. */
  jobs: number;
}

export function parseArgs(argv: string[]): BuildOptions {
  const opts: BuildOptions = { outDir: join(RELEASE_DIR, "mac-apps"), arch: process.arch === "arm64" ? "arm64" : "x64", only: null, install: false, zip: false, verify: false, sign: true, jobs: defaultJobs() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const value = () => argv[++i] ?? "";
    if (a === "--only") opts.only = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--arch") {
      const v = value();
      if (v !== "arm64" && v !== "x64") throw new Error(`--arch must be arm64 or x64, not "${v}"`);
      opts.arch = v;
    } else if (a === "--out") opts.outDir = value();
    else if (a === "--install") opts.install = true;
    else if (a === "--zip") opts.zip = true;
    else if (a === "--verify") opts.verify = true;
    else if (a === "--no-sign") opts.sign = false;
    else if (a === "--jobs" || a === "-j") opts.jobs = parseJobs(value());
    else if (a === "--help" || a === "-h") {
      console.log(readFileSync(import.meta.path, "utf8").split("*/")[0]!.replace(/^[#/* ]+/gm, "").trim());
      process.exit(0);
    } else throw new Error(`Unknown option "${a}". Try --help.`);
  }
  return opts;
}

/** Makes one .app. `png` is the app's drawn icon (or null to use the generic one). */
export async function buildApp(app: MacApp, runtime: string, opts: BuildOptions, png: string | null): Promise<string> {
  const bundle = join(opts.outDir, `${app.title}.app`);
  const contents = join(bundle, "Contents");
  rmSync(bundle, { recursive: true, force: true });
  for (const d of ["MacOS", "Resources/app", "Resources/runtime", "Resources/lib"]) mkdirSync(join(contents, d), { recursive: true });

  const icon = join(contents, "Resources", "AppIcon.icns");
  await makeIcns(png ?? desktopInfo(app.id).png, icon);

  writeFileSync(join(contents, "Info.plist"), infoPlist(app, "AppIcon"));
  const exe = join(contents, "MacOS", app.id);
  writeFileSync(exe, launcherScript(app));
  chmodSync(exe, 0o755);

  // `cp -c` makes an APFS clone: the runtime and resources appear in every app but cost disk space only once.
  await run(["cp", "-c", runtime, join(contents, "Resources", "runtime", "bun")]).catch(() => run(["cp", runtime, join(contents, "Resources", "runtime", "bun")]));
  chmodSync(join(contents, "Resources", "runtime", "bun"), 0o755);
  cpSync(join(BUNDLE_DIR, "apps", `${app.id}.js`), join(contents, "Resources", "app", `${app.id}.js`));
  cpSync(webviewLibSource("libwebview.dylib"), join(contents, "Resources", "lib", "libwebview.dylib"));
  await run(["cp", "-cR", join(ROOT, "resources"), join(contents, "Resources", "resources")]).catch(() => run(["cp", "-R", join(ROOT, "resources"), join(contents, "Resources", "resources")]));
  for (const f of SIDECAR_FILES) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(contents, "Resources", "app", f.split("/").pop()!));
  if (opts.sign) await run(["codesign", "--force", "--deep", "--sign", "-", bundle]);
  return bundle;
}

/** Starts an app the way the Dock would and checks that it stays up and that its page (if it has one) answers. */
export async function verifyApp(bundle: string, app: MacApp): Promise<{ ok: boolean; detail: string }> {
  const proc = Bun.spawn([join(bundle, "Contents", "MacOS", app.id)], { cwd: "/tmp", stdout: "pipe", stderr: "pipe", env: { ...process.env, PATH: "/usr/bin:/bin" } });
  let output = "";
  const read = async (s: ReadableStream<Uint8Array>) => { for await (const chunk of s) output += new TextDecoder().decode(chunk); };
  void read(proc.stdout as ReadableStream<Uint8Array>);
  void read(proc.stderr as ReadableStream<Uint8Array>);
  let detail = "";
  let ok = false;
  const stop = Date.now() + 9000;
  let alive = true;
  void proc.exited.then(() => { alive = false; });
  while (Date.now() < stop && alive) {
    const url = /https?:\/\/(?:127\.0\.0\.1|localhost):\d+/.exec(output)?.[0];
    if (url) {
      // The window and its page server share one thread, so an open window can make a request wait: only an
      // error answer or a refused connection counts as broken.
      try {
        const res = await fetch(`${url}/`, { signal: AbortSignal.timeout(3000) });
        ok = res.status < 500;
        detail = `${url} answered ${res.status}`;
      } catch (err: any) {
        const timedOut = err?.name === "TimeoutError" || /timed out/i.test(String(err?.message));
        ok = timedOut;
        detail = timedOut ? `${url} is up (the window was busy)` : `${url} did not answer (${err?.message ?? err})`;
      }
      break;
    }
    await Bun.sleep(300);
  }
  if (!detail) {
    ok = alive;
    detail = alive ? "running, no web address in its output" : `exited early: ${output.trim().split("\n").slice(-3).join(" | ").slice(0, 200)}`;
  }
  try { process.kill(proc.pid, "SIGTERM"); } catch { /* already gone */ }
  await Promise.race([proc.exited, Bun.sleep(1500)]);
  try { process.kill(proc.pid, "SIGKILL"); } catch { /* already gone */ }
  return { ok, detail };
}

async function main() {
  if (process.platform !== "darwin") {
    console.error("The .app bundles can only be built on a Mac (they need codesign, sips and iconutil).");
    process.exit(1);
  }
  const opts = parseArgs(process.argv.slice(2));
  let apps = listMacApps();
  if (opts.only) {
    const missing = opts.only.filter((id) => !apps.some((a) => a.id === id));
    if (missing.length) throw new Error(`No such app: ${missing.join(", ")}. Names look like ${apps.slice(0, 3).map((a) => a.id).join(", ")}.`);
    apps = apps.filter((a) => opts.only!.includes(a.id));
  }
  log("📦", `Building ${apps.length} apps for macOS ${opts.arch}`);

  const bundles = await bundleApps(apps.map((a) => a.source), undefined, opts.jobs);
  logBundleFailures(bundles);
  const built = new Set(bundles.built.map((a) => a.name));
  apps = apps.filter((a) => built.has(a.id));

  const target = TARGETS.find((t) => t.id === `macos-${opts.arch}`)!;
  const runtime = await buildRuntime(target);

  mkdirSync(opts.outDir, { recursive: true });
  const failures: string[] = [];
  log("⚙️", `Building ${apps.length} apps, ${Math.min(opts.jobs, apps.length)} at a time`);
  let finished = 0;
  const outcomes = await mapPool(apps, opts.jobs, async (app) => {
    try {
      const path = await buildApp(app, runtime, opts, desktopInfo(app.id).png);
      log("✅", `[${++finished}/${apps.length}] ${app.title}.app`);
      return { app, path };
    } catch (err: any) {
      failures.push(`${app.title}: ${String(err?.message ?? err).split("\n")[0]}`);
      log("❌", `[${++finished}/${apps.length}] ${app.title}: ${String(err?.message ?? err).split("\n")[0]}`);
      return null;
    }
  });
  const bundlesBuilt = outcomes.filter((o): o is { app: MacApp; path: string } => o !== null);

  if (opts.verify) {
    log("🔎", "Starting each app (windows will open and close)");
    for (const b of bundlesBuilt) {
      const r = await verifyApp(b.path, b.app);
      log(r.ok ? "✅" : "❌", `${b.app.title}: ${r.detail}`);
      if (!r.ok) failures.push(`${b.app.title} (verify): ${r.detail}`);
    }
  }
  if (opts.install) {
    const dest = join(homedir(), "Applications");
    mkdirSync(dest, { recursive: true });
    await mapPool(bundlesBuilt, opts.jobs, async (b) => {
      const to = join(dest, `${b.app.title}.app`);
      rmSync(to, { recursive: true, force: true });
      await run(["cp", "-cR", b.path, to]).catch(() => run(["cp", "-R", b.path, to]));
    });
    log("📲", `Copied ${bundlesBuilt.length} apps to ${dest}`);
  }
  if (opts.zip) {
    // GitHub accepts files up to 2 GiB, so a full set goes into several zips of about 30 apps (~1 GB each).
    const names = readdirSync(opts.outDir).filter((f) => f.endsWith(".app")).sort();
    for (const f of readdirSync(opts.outDir)) if (/-apps(-\d+of\d+)?\.zip$/.test(f)) rmSync(join(opts.outDir, f), { force: true });
    await mapPool(zipPlan(names, opts.arch), Math.min(opts.jobs, 3), async ([file, group]) => {
      await run(["zip", "-qry", join(opts.outDir, file), ...group], { cwd: opts.outDir });
      log("🗜️", join(opts.outDir, file));
    });
  }
  log("🎉", `${bundlesBuilt.length} of ${apps.length} apps built in ${opts.outDir}`);
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`❌  ${err?.message ?? err}`);
    process.exit(1);
  });
}
