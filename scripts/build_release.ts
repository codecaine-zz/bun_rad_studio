#!/usr/bin/env bun
/**
 * Builds the files for a GitHub release: one archive per platform and processor, with every desktop app and every
 * command-line tool in it, plus checksums and release notes.
 *
 *   bun run release:build                         every platform (needs the internet the first time, to fetch each Bun runtime)
 *   bun run release:build -- --targets linux-x64,windows-x64
 *   bun run release:build -- --mac-apps           also build the .app bundles for this Mac (zipped, with icons)
 *   bun run release:build -- --jobs 4             build four things at once (default: CPU cores minus one, at most 8; -j 1 = one by one)
 *   bun run release:build -- --list               show the platforms and exit
 *
 * Output, in release/:
 *   bun-rad-studio-v<version>-<platform>.tar.gz   (.zip for Windows)
 *   bun-rad-studio-v<version>-macos-<arch>-apps.zip   (with --mac-apps)
 *   SHA256SUMS.txt, RELEASE_NOTES.md
 * Publish with:  gh release create v<version> release/*.tar.gz release/*.zip release/SHA256SUMS.txt -F release/RELEASE_NOTES.md
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { RELEASE_DIR, archiveSuite, bundleApps, logBundleFailures, stageSuite } from "./release/suite";
import { TARGETS, VERSION, defaultJobs, findTargets, hostTargetId, listSourceApps, log, mapPool, parseJobs, run, sha256File, type Target } from "./release/common";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export interface Options {
  targets: Target[];
  macApps: boolean;
  keepStage: boolean;
  jobs: number;
}

export function parseArgs(argv: string[]): Options & { list: boolean } {
  let ids: string[] | null = null;
  const o = { macApps: false, keepStage: false, list: false, jobs: defaultJobs() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--targets") ids = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--mac-apps") o.macApps = true;
    else if (a === "--keep-stage") o.keepStage = true;
    else if (a === "--list") o.list = true;
    else if (a === "--jobs" || a === "-j") o.jobs = parseJobs(argv[++i]);
    else throw new Error(`Unknown option "${a}". Options: --targets a,b  --mac-apps  --keep-stage  --jobs N  --list`);
  }
  return { ...o, targets: findTargets(ids) };
}

export function releaseNotes(rows: Array<{ target: Target; file: string; bytes: number; guiCount: number; cliCount: number }>, macApps: string[]): string {
  const L: string[] = [`# Bun RAD Studio v${VERSION}`, "", "Download the file that matches your computer. Each one holds every app for that platform: unpack it and start any app from its `bin/` folder (read `README.txt` inside).", ""];
  L.push("| Your computer | Download | Size | Desktop apps | Command-line tools |", "|---|---|---|---|---|");
  for (const r of rows) L.push(`| ${r.target.note.split(".")[0]} | \`${r.file}\` | ${mb(r.bytes)} | ${r.guiCount || "-"} | ${r.cliCount} |`);
  L.push("", "### Which one do I pick?", "", "- **Mac:** Apple silicon (M1 or newer) -> `macos-arm64`. Intel -> `macos-x64`." + (macApps.length ? " The `-apps` zip files hold ready-to-open `.app` bundles with their own icons." : ""));
  L.push("- **Windows:** `windows-x64`. `windows-arm64` has native command-line tools and uses baseline x64 emulation for desktop apps (Windows 11 required). `-baseline` is for processors from before 2013. Run `install.cmd` for Start menu shortcuts with the same artwork as the Mac apps.");
  L.push("- **Linux:** `linux-x64` (Intel/AMD) or `linux-arm64` (Raspberry Pi, Graviton ...). Alpine uses the `-musl` files (command-line tools only). `-baseline` is for processors from before 2013.", "");
  L.push("Check a download against `SHA256SUMS.txt`: `shasum -a 256 -c SHA256SUMS.txt --ignore-missing`.", "");
  L.push("Desktop apps need a web view on the system: macOS has one built in; Windows needs WebView2 and the Visual C++ 2015-2022 x64 Redistributable (including on ARM); Linux needs GTK 4 and WebKitGTK 6.0 (`libgtk-4-1 libwebkitgtk-6.0-4`). Linux `sh install.sh` adds app names and matching Mac icons to your menu.", "");
  L.push("Ubuntu 24.04+: if a desktop app crashes with a bwrap / dbus-proxy permission error, run `sh install.sh --apparmor` in the extracted Linux download (sudo required). This grants sandbox user namespaces to that download's shared runtime, covering every desktop app and child studio. AppArmor and WebKit's sandbox stay enabled. Rerun after moving the folder; remove with `sh install.sh --uninstall --apparmor`. Alpine/musl downloads have command-line tools only and do not need this fix.", "");
  return L.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.list) {
    for (const t of TARGETS) console.log(`${t.id.padEnd(22)} ${t.gui ? "apps + tools" : "tools only "}  ${t.note}`);
    return;
  }
  const sources = listSourceApps();
  log("📦", `${sources.filter((s) => s.kind === "gui").length} desktop apps and ${sources.filter((s) => s.kind === "cli").length} command-line tools, ${opts.targets.length} platforms`);

  const bundles = await bundleApps(sources, undefined, opts.jobs);
  logBundleFailures(bundles);
  log("🧩", `Bundled ${bundles.built.length} of ${sources.length}`);

  mkdirSync(RELEASE_DIR, { recursive: true });
  for (const target of opts.targets) {
    const file = `bun-rad-studio-v${VERSION}-${target.id}.${target.os === "windows" ? "zip" : "tar.gz"}`;
    rmSync(join(RELEASE_DIR, file), { force: true });
  }

  // Platforms are packed at the same time (each has its own staging folder); the table keeps the order of the list.
  const rows = await mapPool(opts.targets, Math.min(opts.jobs, 4), async (target) => {
    log("🔨", `${target.id}`);
    const dir = await stageSuite(target, { bundles });
    const file = await archiveSuite(dir, target);
    if (!opts.keepStage) rmSync(dir, { recursive: true, force: true });
    const gui = target.gui ? bundles.built.filter((a) => a.kind === "gui").length : 0;
    log("✅", `${basename(file)}  ${mb(statSync(file).size)}`);
    return { target, file: basename(file), bytes: statSync(file).size, guiCount: gui, cliCount: bundles.built.filter((a) => a.kind === "cli").length };
  });

  const macZips: string[] = [];
  if (opts.macApps) {
    if (process.platform !== "darwin") log("⚠️", "--mac-apps needs a Mac; skipped");
    else {
      const arch = hostTargetId().endsWith("arm64") ? "arm64" : "x64";
      await run(["bun", "run", "scripts/release/build_mac_apps.ts", "--zip", "--arch", arch, "--jobs", String(opts.jobs)], { cwd: join(import.meta.dir, "..") });
      const dir = join(RELEASE_DIR, "mac-apps");
      for (const f of readdirSync(dir).filter((x) => /-apps(-\d+of\d+)?\.zip$/.test(x))) {
        await run(["mv", join(dir, f), join(RELEASE_DIR, f)]);
        macZips.push(join(RELEASE_DIR, f));
      }
    }
  }

  const files = readdirSync(RELEASE_DIR).filter((f) => /^bun-rad-studio-v.*\.(tar\.gz|zip)$/.test(f)).sort();
  const sums: string[] = [];
  for (const f of files) sums.push(`${await sha256File(join(RELEASE_DIR, f))}  ${f}`);
  writeFileSync(join(RELEASE_DIR, "SHA256SUMS.txt"), sums.join("\n") + "\n");
  writeFileSync(join(RELEASE_DIR, "RELEASE_NOTES.md"), releaseNotes(rows, macZips));
  log("🎉", `${files.length} files in ${RELEASE_DIR}`);
  console.log(`\nPublish: gh release create v${VERSION} release/*.tar.gz release/*.zip release/SHA256SUMS.txt -F release/RELEASE_NOTES.md`);
  if (bundles.failed.length) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`❌  ${err?.message ?? err}`);
    process.exit(1);
  });
}
