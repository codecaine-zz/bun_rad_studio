#!/usr/bin/env bun
/**
 * Publishes the files in release/ as a GitHub Release and points the download page at them.
 *
 *   bun run release:publish                 build nothing, just publish what is in release/ (asks nothing; run it on purpose)
 *   bun run release:publish -- --dry-run    show what would be uploaded and the notes, change nothing
 *   bun run release:publish -- --draft      create the release as a draft you can look at on GitHub first
 *
 * What goes up (each file is one download; GitHub accepts up to 2 GiB per file):
 *   - Codecaine-File-Manager-v<version>-<platform>.zip      the File Manager, one per OS and processor
 *   - bun-rad-studio-v<version>-<platform>.tar.gz / .zip    the full suite: every app and command-line tool
 *   - bun-rad-studio-v<version>-macos-<arch>-apps-NofM.zip  every app as a double-click Mac .app with its icon
 *   - bun-rad-studio-v<version>-free-music-*.zip             optional CC BY 4.0 music packs
 *   - SHA256SUMS.txt                                        checksums of all of the above
 * It also rewrites release/file-manager/index.html so its buttons download from the release.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { VERSION, ROOT, log, run, sha256File } from "./release/common";

const RELEASE = join(ROOT, "release");
const FM = join(RELEASE, "file-manager");
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const draft = args.includes("--draft");
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`;

async function repoSlug(): Promise<string> {
  const url = (await run(["git", "remote", "get-url", "origin"], { cwd: ROOT })).trim();
  const m = /github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/.exec(url);
  if (!m) throw new Error(`Can't find the GitHub repository in "${url}".`);
  return m[1]!;
}

/** Every file of this version that is part of the release, with its folder. */
function collect(): Array<{ path: string; name: string; bytes: number }> {
  const out: Array<{ path: string; name: string; bytes: number }> = [];
  const take = (dir: string, re: RegExp) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).sort()) if (re.test(f)) out.push({ path: join(dir, f), name: f, bytes: statSync(join(dir, f)).size });
  };
  take(FM, new RegExp(`^Codecaine-File-Manager-v${VERSION.replace(/\./g, "\\.")}-.*\\.zip$`));
  take(RELEASE, new RegExp(`^bun-rad-studio-v${VERSION.replace(/\./g, "\\.")}-.*\\.(tar\\.gz|zip)$`));
  take(RELEASE, new RegExp(`^bun-rad-studio-v${VERSION.replace(/\./g, "\\.")}-free-music-(?:source|mp3|songs-mp3)(?:-\\d+of\\d+)?\\.zip$`));
  take(join(RELEASE, "mac-apps"), /-apps(-\d+of\d+)?\.zip$/);
  take(join(RELEASE, "mac-apps-x64"), /-apps(-\d+of\d+)?\.zip$/);
  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
}

const KIND = (n: string) => (n.startsWith("Codecaine-File-Manager") ? "fm" : /-free-music-(?:source|mp3|songs-mp3)(?:-\d+of\d+)?\.zip$/.test(n) ? "music" : /-apps(-\d+of\d+)?\.zip$/.test(n) ? "apps" : "suite");
const platformOf = (n: string) => /-(macos|windows|linux)-(arm64|x64)(-baseline|-musl)?/.exec(n)?.[0].slice(1) ?? n;

/** The headline of each entry in the newest section of the changelog (the bold words that start the line), for the release notes. */
export function changelogHighlights(changelog: string, limit = 25): string[] {
  const section = changelog.split(/^## /m)[1] ?? "";
  const out: string[] = [];
  for (const line of section.split("\n")) {
    const m = /^- \*\*(.+?)\*\*/.exec(line);
    if (m) out.push(m[1]!.replace(/[.:]$/, ""));
    if (out.length >= limit) break;
  }
  return out;
}

export function notes(files: Array<{ name: string; bytes: number }>, repo: string, whatsNew: string[] = []): string {
  const url = (n: string) => `https://github.com/${repo}/releases/download/v${VERSION}/${n}`;
  const row = (label: string, pred: (n: string) => boolean) => {
    const f = files.filter((x) => KIND(x.name) === "fm" && pred(x.name));
    return f.length ? `| ${label} | ${f.map((x) => `[${platformOf(x.name).split("-").slice(1).join(" ")} (${mb(x.bytes)})](${url(x.name)})`).join(" · ")} |` : null;
  };
  const L: string[] = [`# Bun RAD Studio v${VERSION}`, "", "**No programming needed.** Download, unzip, open. Bun is included; no source checkout or compilation needed. Native-window system requirements are listed below.", ""];
  if (whatsNew.length) L.push(`## ✨ What's new in v${VERSION}`, "", ...whatsNew.map((w) => `- ${w}`), "", "The full list is in the [changelog](https://github.com/" + repo + "/blob/main/CHANGELOG.md).", "");
  L.push("## ⭐ Codecaine File Manager", "", "A fast, private file manager for developers: two folders side by side, a code editor, database studios (SQLite, MySQL, PostgreSQL, Redis), an encrypted password vault, a live web server, **a download manager that splits files over several connections and resumes them**, an API client, a project bundler, an `.env` editor, and more.", "");
  L.push("| Your computer | Download |", "|---|---|");
  for (const r of [row("🍎 **Mac**", (n) => n.includes("-macos-")), row("🪟 **Windows**", (n) => n.includes("-windows-")), row("🐧 **Linux**", (n) => n.includes("-linux-"))]) if (r) L.push(r);
  const hasFileManagerMac = files.some((f) => KIND(f.name) === "fm" && f.name.includes("-macos-"));
  const macInstructions = hasFileManagerMac
    ? "- **Mac:** `arm64` = Apple silicon (M1 and newer); `x64` = Intel. Unzip and drag the app to Applications. It is ad-hoc signed, not Developer ID signed or notarized; right-click Open may not work. Only after trusting the source and verifying the checksum, run `xattr -dr com.apple.quarantine \"/Applications/Codecaine File Manager.app\"` in Terminal, then open the app. Do not disable Gatekeeper globally."
    : "- **Mac:** Standalone `.app` downloads are being built on macOS. For now, download a macOS full-suite archive below and start `bin/file-manager-studio` (see the included `README.txt` for first-launch guidance).";
  L.push("", macInstructions,
    "- **Windows:** `x64` for most PCs; `arm64` for Windows 11 on ARM (baseline x64 emulation, no AVX2 required); `baseline` for processors from before 2013. Unzip the whole folder, double-click **install.cmd**, then **Codecaine File Manager.exe**. Setup checks WebView2 and the [Visual C++ 2015-2022 x64 Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe), including on ARM, and offers to install missing prerequisites from Microsoft. No Bun or compiler is needed. If it fails, open **troubleshoot.cmd**.",
    "- **Linux:** `x64` (Intel/AMD) or `arm64` (Raspberry Pi 4/5 64-bit, servers); run `sh install.sh` for a menu entry and executable permissions. Needs GTK 4 and WebKitGTK 6.0 (`sudo apt install libgtk-4-1 libwebkitgtk-6.0-4` on Ubuntu 24.04+/Debian). Run `sh troubleshoot.sh` to see startup errors. On Ubuntu 24.04+, if startup fails with a bwrap / dbus-proxy permission error, run `sh install.sh --apparmor` (sudo required). This adds an executable-specific AppArmor user-namespace permission without disabling AppArmor or WebKit's sandbox. Rerun after moving the extracted folder; remove with `sh install.sh --uninstall --apparmor`.",
    "- **File Manager startup:** if the native window is unavailable, the File Manager opens in your default browser. Standalone Windows/Linux downloads record startup errors in `~/.bun_rad_studio/logs/file-manager-<pid>.log` (Windows: `%USERPROFILE%\\.bun_rad_studio\\logs`).", "");
  const apps = files.filter((f) => KIND(f.name) === "apps");
  const suite = files.filter((f) => KIND(f.name) === "suite");
  if (apps.length) {
    L.push("## 🍎 Every app as a Mac `.app` (with its own icon)", "", "65 desktop apps (games, studios, tools), each a double-click `.app`. Download **all the parts for your Mac** and unzip them into one folder.", "");
    for (const arch of ["arm64", "x64"]) {
      const parts = apps.filter((f) => f.name.includes(`-macos-${arch}-apps`));
      if (parts.length) L.push(`- **${arch === "arm64" ? "Apple silicon (M1 and newer)" : "Intel"}:** ${parts.map((p) => `[${p.name.replace(/^.*-apps-?/, "").replace(/\.zip$/, "") || "all"} (${mb(p.bytes)})](${url(p.name)})`).join(" · ")}`);
    }
    L.push("");
  }
  if (suite.length) {
    L.push("## 📦 The whole suite: every desktop app and command-line tool", "", "One download per platform with all 73 desktop apps and 79 command-line tools, each started from its `bin/` folder (see `README.txt` inside).", "", "| Platform | Download |", "|---|---|");
    for (const f of suite) L.push(`| ${platformOf(f.name)} | [${f.name}](${url(f.name)}) (${mb(f.bytes)}) |`);
    L.push("", "For **every desktop app in a Linux suite download** (ARM64, x64 and x64-baseline), the Ubuntu 24.04+ bwrap / dbus-proxy fix is `sh install.sh --apparmor` from that suite's folder. Its executable-specific AppArmor profile covers the shared `runtime/bun`, including child studios. Rerun after moving the folder; remove with `sh install.sh --uninstall --apparmor`.", "",
      "Windows: run `install.cmd` to add apps to the Start menu with their Mac artwork and no console window. Linux: `sh install.sh` adds matching names and icons to your applications menu. Keep the extracted folder in place. Windows ARM includes native CLI tools and baseline x64-emulated desktop apps. Alpine/musl downloads hold command-line tools only.", "");
  }
  const music = files.filter((f) => KIND(f.name) === "music");
  if (music.length) {
    L.push("## 🎵 Free music — CC BY 4.0", "", "These separate music archives contain audio from Codecaine's YouTube playlist. Each archive includes attribution and license details. The music is licensed under Creative Commons Attribution 4.0; it is not covered by the project's MIT license.", "", "| Format | Download |", "|---|---|");
    for (const [kind, label] of [["source", "Source audio"], ["mp3", "Full-length MP3 (128 kbps)"], ["songs-mp3", "Individual chapter songs (MP3, 128 kbps)"]] as const) {
      const packs = music.filter((f) => f.name.includes(`-free-music-${kind}`));
      if (packs.length) L.push(`| ${label} | ${packs.map((f) => `[${f.name}](${url(f.name)}) (${mb(f.bytes)})`).join(" · ")} |`);
    }
    L.push("");
  }
  L.push("## ✅ Check your download", "", "`SHA256SUMS.txt` lists a checksum for every file: `shasum -a 256 -c SHA256SUMS.txt --ignore-missing`.", "",
    "## ℹ️ Good to know", "", "- The apps are **not signed with an Apple or Microsoft developer certificate**. Follow the macOS quarantine instructions above; Windows may show *More info → Run anyway*. They run entirely on your computer: no account, nothing is sent anywhere.",
    "- Downloads are cross-compiled. Linux ARM64 File Manager startup and its executable-specific AppArmor fix were confirmed working on Ubuntu 24.04 ARM64. Installer/launcher coverage is tested for every Linux suite desktop app across ARM64, x64 and x64-baseline, but not every app's UI has been manually tested. If something doesn't start, please open an issue and include the download name, system and startup log.",
    `- Prefer the source? \`git clone https://github.com/${repo}\` then \`bun install\` and \`bun run app:files\`.`, "");
  return L.join("\n");
}

async function main() {
  const repo = await repoSlug();
  const files = collect();
  if (!files.some((f) => KIND(f.name) === "fm")) throw new Error("No File Manager zips found. Run: bun run release:file-manager");
  const tag = `v${VERSION}`;
  log("📦", `${files.length} files for ${repo} ${tag}, ${mb(files.reduce((n, f) => n + f.bytes, 0))} in total`);
  for (const f of files) console.log(`   ${mb(f.bytes).padStart(7)}  ${f.name}`);

  // One checksum file for everything, and a download page whose buttons come from the release.
  const sums: string[] = [];
  for (const f of files) sums.push(`${await sha256File(f.path)}  ${f.name}`);
  const sumsPath = join(RELEASE, "SHA256SUMS.txt");
  writeFileSync(sumsPath, sums.join("\n") + "\n");
  const body = notes(files, repo, changelogHighlights(existsSync(join(ROOT, "CHANGELOG.md")) ? readFileSync(join(ROOT, "CHANGELOG.md"), "utf8") : ""));
  const notesPath = join(RELEASE, "RELEASE_NOTES.md");
  writeFileSync(notesPath, body);
  await run(["bun", "run", "scripts/release/build_file_manager.ts", "--page-only", "--base-url", `https://github.com/${repo}/releases/download/${tag}/`], { cwd: ROOT });
  copyFileSync(sumsPath, join(FM, "SHA256SUMS.txt"));

  if (dry) {
    log("🧪", "Dry run: nothing was uploaded.");
    console.log("\n" + body);
    return;
  }
  const exists = await run(["gh", "release", "view", tag, "--repo", repo], { cwd: ROOT }).then(() => true, () => false);
  if (exists) throw new Error(`The release ${tag} already exists on GitHub. Delete it first (gh release delete ${tag}) or raise the version in package.json.`);
  log("🚀", `Creating release ${tag}${draft ? " (draft)" : ""} and uploading ${files.length + 1} files. This can take a while…`);
  const cmd = ["gh", "release", "create", tag, "--repo", repo, "--title", `Bun RAD Studio ${tag}`, "--notes-file", notesPath, "--target", "main", ...(draft ? ["--draft"] : []), ...files.map((f) => f.path), sumsPath];
  const proc = Bun.spawn(cmd, { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`gh release create failed (${code}).`);
  log("🎉", `Published: https://github.com/${repo}/releases/tag/${tag}`);
}

if (import.meta.main) main().catch((e) => { console.error(`❌  ${e?.message ?? e}`); process.exit(1); });
