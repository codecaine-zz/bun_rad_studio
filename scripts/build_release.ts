#!/usr/bin/env bun
/**
 * Builds the files for a GitHub release: one archive per platform and processor, with every desktop app and every
 * command-line tool in it, plus checksums and release notes.
 *
 *   bun run release:build                         every platform (needs the internet the first time, to fetch each Bun runtime)
 *   bun run release:build -- --targets linux-x64,windows-x64
 *   bun run release:build -- --mac-apps           also build the .app bundles for this Mac (zipped, with icons)
 *   bun run release:build -- --list               show the platforms and exit
 *
 * Output, in release/:
 *   bun-rad-studio-v<version>-<platform>.tar.gz   (.zip for Windows)
 *   bun-rad-studio-v<version>-macos-<arch>-apps.zip   (with --mac-apps)
 *   SHA256SUMS.txt, RELEASE_NOTES.md
 * Publish with:  gh release create v<version> release/*.tar.gz release/*.zip release/SHA256SUMS.txt -F release/RELEASE_NOTES.md
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { ICONS_OUT, iconSpecFor, renderPngs } from "./release/icons";
import { listMacApps } from "./release/build_mac_apps";
import { RELEASE_DIR, archiveSuite, bundleApps, logBundleFailures, stageSuite } from "./release/suite";
import { TARGETS, VERSION, findTargets, hostTargetId, listSourceApps, log, run, sha256File, type Target } from "./release/common";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export interface Options {
  targets: Target[];
  macApps: boolean;
  keepStage: boolean;
}

export function parseArgs(argv: string[]): Options & { list: boolean } {
  let ids: string[] | null = null;
  const o = { macApps: false, keepStage: false, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--targets") ids = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--mac-apps") o.macApps = true;
    else if (a === "--keep-stage") o.keepStage = true;
    else if (a === "--list") o.list = true;
    else throw new Error(`Unknown option "${a}". Options: --targets a,b  --mac-apps  --keep-stage  --list`);
  }
  return { ...o, targets: findTargets(ids) };
}

export function releaseNotes(rows: Array<{ target: Target; file: string; bytes: number; guiCount: number; cliCount: number }>, macApps: string[]): string {
  const L: string[] = [`# Bun RAD Studio v${VERSION}`, "", "Download the file that matches your computer. Each one holds every app for that platform: unpack it and start any app from its `bin/` folder (read `README.txt` inside).", ""];
  L.push("| Your computer | Download | Size | Desktop apps | Command-line tools |", "|---|---|---|---|---|");
  for (const r of rows) L.push(`| ${r.target.note.split(".")[0]} | \`${r.file}\` | ${mb(r.bytes)} | ${r.guiCount || "-"} | ${r.cliCount} |`);
  L.push("", "### Which one do I pick?", "", "- **Mac:** Apple silicon (M1 or newer) -> `macos-arm64`. Intel -> `macos-x64`." + (macApps.length ? " The `-apps` zip files hold ready-to-open `.app` bundles with their own icons." : ""));
  L.push("- **Windows:** `windows-x64`. Windows on ARM can run it too; `windows-arm64` has the command-line tools only. `-baseline` is for processors from before 2013.");
  L.push("- **Linux:** `linux-x64` (Intel/AMD) or `linux-arm64` (Raspberry Pi, Graviton ...). Alpine uses the `-musl` files (command-line tools only). `-baseline` is for processors from before 2013.", "");
  L.push("Check a download against `SHA256SUMS.txt`: `shasum -a 256 -c SHA256SUMS.txt --ignore-missing`.", "");
  L.push("Desktop apps need a web view on the system: macOS has one built in; Windows needs the WebView2 runtime (part of Windows 11); Linux needs GTK 4 and WebKitGTK 6.0 (`libgtk-4-1 libwebkitgtk-6.0-4`).", "");
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

  const bundles = await bundleApps(sources);
  logBundleFailures(bundles);
  log("🧩", `Bundled ${bundles.built.length} of ${sources.length}`);

  // Menu icons for Linux come from the same drawing code as the Mac icons, so they can only be drawn on a Mac.
  let iconsDir: string | null = null;
  if (process.platform === "darwin") {
    try {
      const apps = listMacApps();
      await renderPngs(apps.map((a) => iconSpecFor({ id: a.id, category: a.category })), join(ICONS_OUT, "png"));
      iconsDir = join(ICONS_OUT, "png");
    } catch (err: any) {
      log("⚠️", `No icons for the Linux menus (${String(err?.message ?? err).split("\n")[0]})`);
    }
  }

  mkdirSync(RELEASE_DIR, { recursive: true });
  for (const f of readdirSync(RELEASE_DIR)) if (/^bun-rad-studio-v.*\.(tar\.gz|zip)$/.test(f) || f === "SHA256SUMS.txt") rmSync(join(RELEASE_DIR, f), { force: true });

  const rows: Parameters<typeof releaseNotes>[0] = [];
  for (const target of opts.targets) {
    log("🔨", `${target.id}`);
    const dir = await stageSuite(target, { bundles, iconsDir });
    const file = await archiveSuite(dir, target);
    if (!opts.keepStage) rmSync(dir, { recursive: true, force: true });
    const gui = target.gui ? bundles.built.filter((a) => a.kind === "gui").length : 0;
    rows.push({ target, file: file.split("/").pop()!, bytes: statSync(file).size, guiCount: gui, cliCount: bundles.built.filter((a) => a.kind === "cli").length });
    log("✅", `${file.split("/").pop()}  ${mb(statSync(file).size)}`);
  }

  const macZips: string[] = [];
  if (opts.macApps) {
    if (process.platform !== "darwin") log("⚠️", "--mac-apps needs a Mac; skipped");
    else {
      const arch = hostTargetId().endsWith("arm64") ? "arm64" : "x64";
      await run(["bun", "run", "scripts/release/build_mac_apps.ts", "--zip", "--arch", arch], { cwd: join(import.meta.dir, "..") });
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
