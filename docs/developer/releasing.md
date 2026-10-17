# Building releases

How to turn the applications and command-line tools into files for a GitHub release, for every platform and processor, and how to build the Mac `.app` bundles with their own icons.

Commands in this page were run on **14 October 2026** (macOS 26 on Apple silicon, Bun 1.4.2) unless marked *not run*.

## Contents

- [The short version](#the-short-version)
- [What a release contains](#what-a-release-contains)
- [Platforms](#platforms)
- [Building on Windows](#building-on-windows)
- [Linux sandbox permissions](#linux-sandbox-permissions)
- [Mac apps with icons](#mac-apps-with-icons)
- [How it works](#how-it-works)
- [Publishing](#publishing)
- [What was verified](#what-was-verified)
- [Known limits](#known-limits)

## The short version

```bash
bun run build:mac-apps            # every desktop app as a .app with its own icon (macOS only), in release/mac-apps/
bun run release:build             # one archive per platform and processor, with checksums and notes, in release/
bun run release:build -- --mac-apps      # both, with the .app bundles zipped for the release
bun run build:mac-apps -- --jobs 4       # build four apps at the same time
```

**Parallel builds.** The build scripts (`build:mac-apps`, `release:build`, `release:file-manager`) bundle the apps, draw the icons, assemble the `.app` bundles, install and zip, and pack the platforms several at a time. The default is your processor cores minus one (at most 8), so the computer stays usable; `--jobs N` (or `-j N`) sets it, and `-j 1` builds one by one as before. (On a 12-app test, `-j 1` took 10.6 s and `-j 6` 3.6 s, with the same bundles.) `--verify` always starts the apps one at a time because each opens a window, and zipping is limited to 3 at once. The helpers are `mapPool`, `defaultJobs` and `parseJobs` in `scripts/release/common.ts`; each build writes only its own files, the shared `_assets` folders are cleared once at the end, and the shared stub files are written atomically.

The first `release:build` needs the internet: Bun downloads one runtime per platform (about 75 MB each, then cached). Everything is written under `release/`, which is not tracked by git.

## What a release contains

One archive per platform. Each holds **every desktop app and every command-line tool** for that platform:

```text
bun-rad-studio-v1.0.0-linux-arm64/
  runtime/bun            the platform's Bun runtime (acts as plain `bun`)
  apps/*.js, cli/*.js    every application, bundled to one file (the same files on every platform)
  bin/<name>             a small launcher for each: bin/file-manager-studio, bin/fd-cli ...
  lib/                   the native window library for this platform
  resources/             the pages and images the apps read
  share/icons/           icons (drawn on a Mac) for Linux menus
  install.sh             links bin/ into ~/.local/bin and adds the apps to the Linux menu
  README.txt  LICENSE  VERSION
```

Windows archives have `bin\<name>.cmd` instead of shell scripts and are `.zip` files.

One shared runtime instead of a 60 MB executable per app keeps each platform near 130 MB (37 MB for the command-line-only downloads) instead of several gigabytes. A launcher starts the runtime with `BUN_BE_BUN=1`, which makes a compiled Bun executable behave exactly like the `bun` command, and points it at the app's file.

## Platforms

`bun run release:build -- --list` prints this table.

| File name part | Computer | Desktop apps |
|---|---|---|
| `macos-arm64` | Apple silicon Macs | yes |
| `macos-x64` | Intel Macs | yes |
| `linux-x64` | 64-bit Intel/AMD Linux with glibc | yes (needs GTK 4 and WebKitGTK 6.0) |
| `linux-x64-baseline` | the same, for CPUs without AVX2 (before about 2013) | yes |
| `linux-arm64` | 64-bit ARM Linux with glibc (Raspberry Pi OS 64-bit, Graviton ...) | yes (needs GTK 4 and WebKitGTK 6.0) |
| `linux-x64-musl`, `linux-arm64-musl` | Alpine and other musl Linux | command-line tools only (`apk add libstdc++ libgcc`) |
| `windows-x64` | 64-bit Windows 10 and 11 | yes (needs WebView2, part of Windows 11) |
| `windows-x64-baseline` | the same, for CPUs without AVX2 | yes |
| `windows-arm64` | Windows 11 on ARM | native command-line tools and baseline x64-emulated desktop apps |

32-bit processors are not offered: Bun does not support them. The desktop apps are only offered where the project's window library exists (it has no musl or Windows ARM build).

Pick one platform while testing: `bun run release:build -- --targets linux-arm64,macos-arm64`.

## Building on Windows

Install [Bun](https://bun.sh), then double-click [build.cmd](../../build.cmd) in a source checkout. It restores dependencies with `bun install --frozen-lockfile`, detects the Windows hardware architecture, and builds the suite and standalone File Manager. It keeps errors visible and stops if any build fails.

```powershell
.\build.cmd                                     # ARM64 or x64, detected automatically
.\build.cmd -Target windows-x64-baseline -Jobs 2  # target older x64 processors
```

The resulting ZIPs are in `release/` and `release/file-manager/`. Packaging uses built-in PowerShell, not Unix `zip`; no Bash or Visual Studio is needed. A single-target build preserves archives for other platforms. macOS `.app` packaging still needs a Mac.

For end users: extract the entire ZIP into a permanent folder, double-click `install.cmd`, then open the app. Setup checks WebView2 and the **x64** Visual C++ runtime, including on ARM, and asks permission before downloading missing Microsoft installers. Signatures are verified before execution; failures stop setup instead of reporting success. In the suite, setup then creates Start menu shortcuts using the matching Mac artwork. Uninstall shortcuts using `install.cmd -Uninstall` (add `-Desktop` if desktop shortcuts were installed); this does not remove shared Microsoft runtimes.

Windows ARM desktop launchers use the bundled baseline x64 runtime and x64 window DLL; command-line launchers use native ARM64 Bun. This avoids DLL architecture error 193 and does not require AVX2 emulation. Users do not need Bun or a compiler. Startup logs are in `%USERPROFILE%\.bun_rad_studio\logs`; standalone File Manager also includes `troubleshoot.cmd`.

## Linux sandbox permissions

Ubuntu 24.04+ restricts unprivileged user namespaces through AppArmor. Even with GTK 4 and WebKitGTK 6.0 installed, a native window can crash with `bwrap: setting up uid map: Permission denied` / `Failed to fully launch dbus-proxy`. File Manager's JavaScript browser fallback cannot catch that native crash.

Every Linux **desktop** release installer (ARM64, x64 and x64-baseline, suite and standalone File Manager) supports:

```sh
sh install.sh --apparmor                 # install menu entries, links and sandbox permission (sudo for the profile only)
sh install.sh --uninstall --apparmor     # unload/delete the profile and remove menu entries and links
```

The shared generator in `scripts/release/linuxSandbox.ts` validates the exact extracted executable path, generates an AppArmor ABI 4 profile with `flags=(unconfined)` and `userns,`, syntax-checks it before privileged installation, and loads it with `apparmor_parser`. It does **not** turn off AppArmor, change global sysctls, or disable WebKit's sandbox.

- **Full suite:** `/etc/apparmor.d/bun-rad-studio` attaches to that download's `runtime/bun`. Every desktop launcher and child studio uses the same executable, so one profile covers all the apps. CLI tools continue to work without installing a profile.
- **Standalone File Manager:** `/etc/apparmor.d/codecaine-file-manager` attaches to the downloaded `codecaine-file-manager` executable, including its child database studios.
- Each profile covers one extracted location at a time. Choose a permanent folder and rerun after moving it. Paths containing AppArmor pattern or quoting characters are refused instead of silently granting a broader permission.
- Normal installation/uninstallation is still unprivileged; plain uninstall leaves an existing profile alone and prints the removal command. macOS and CLI-only Alpine/musl installers do not offer this Linux-only permission.

`tests/file_manager_linux_install.test.ts` exercises both installers with mocked sudo/parser commands, validates generated profiles with the real parser when available, and checks **every desktop launcher** across all three glibc Linux targets against the profiled runtime. This proves installer/launcher coverage, not that every app's UI has been manually tested on every CPU.

The rebuilt ARM64 suite's Calculator and File Manager, plus the standalone File Manager, also passed native-window startup smoke tests on Ubuntu 24.04 using the already-installed namespace-permitting profile via `aa-exec`; both File Manager servers returned HTTP 200. Newly generated profile syntax was validated, but loading it still requires interactive sudo. Native x64 startup was not tested.

## Mac apps with icons

`bun run build:mac-apps` makes one double-clickable `.app` for each of the 65 distinct desktop apps listed in [SHOWCASE.md](../../SHOWCASE.md), named as the showcase names them ("File Manager", "SQLite Studio Pro" ...).

- **Icons that say what the app is:** every app has its own picture: a glowing "liquid glass" tile (deep colour into vivid, aurora light, a faint technical grid, light from above and a bright rim along the top edge) with a glass glyph in the middle that is chosen for the app: an Apple SF Symbol (a folder for the File Manager, a shield and lock for Crypto, a branch for Git, a database drum for Postgres ...), or a shape drawn by the renderer for the games that have no symbol (Pac-Man, Tetris, Snake, Pong, Breakout, the maze, the frog, Tic-Tac-Toe, Minesweeper, Connect 4). The colours come from the app's category and are turned a little by its name, so neighbours still differ (the games span red to magenta and orange). The designs are in `scripts/release/iconDesigns.ts`, the drawing in `iconRenderer.ts`; both are drawn with macOS's own graphics through `osascript` and turned into `.icns` with `sips` and `iconutil`. If drawing fails the generic icon from `icons/` is used and the build continues. To change an icon, edit its entry in `DESIGNS` (SF Symbols are looked up by name in the SF Symbols app) and run `bun run build:mac-apps -- --only <app>`.
- **Self-contained:** each `.app` holds the runtime, the app, the window library and the resources, so it runs without Bun or this project. Copies of the runtime and resources are APFS clones, so they cost disk space once.
- **Signed ad hoc** (`codesign --sign -`), which a Mac needs to run it locally. It is not notarized.
- **A writable start folder:** an app opened from the Dock starts in `~/.bun_rad_studio/run`, which links to the app's `resources`. That keeps the small files some apps write relative to their start folder out of the signed bundle.

Options: `--only calculator-studio,code-studio` · `--arch x64` · `--install` (copy into `~/Applications`) · `--zip` (zips of 30 apps each, about 0.6 GB, so every file is far under GitHub's 2 GiB limit) · `--verify` (start every app and check it stays up and its page answers; opens windows) · `--no-sign`.

## How it works

| File | Job |
|---|---|
| `scripts/release/common.ts` | The platform table, the list of apps, helpers |
| `scripts/release/suite.ts` | Bundles the apps, builds each runtime, lays out and archives a platform |
| `scripts/release/icons.ts` | Icon colours, the drawing script, `.icns` conversion |
| `scripts/release/build_mac_apps.ts` | The `.app` builder |
| `scripts/build_release.ts` | Runs it all, writes `SHA256SUMS.txt` and `RELEASE_NOTES.md` |
| `tests/release_build.test.ts` | Checks the table, launchers, a real suite and a real `.app` |

Details that matter:

- **The window library** is not carried in the bundles. For desktop apps a small plugin replaces `webview-bun`'s loader (which picks a file inside `node_modules`) with one that uses `WEBVIEW_PATH`, or else `lib/` next to the bundle's folder; a child process an app starts finds it the same way. **Command-line tools** get a stub in place of `webview-bun`, so they start on machines with no GTK or WebKit at all.
- **Files next to the code:** a few apps read a file from the folder their code is in (`postgres_designer.js`, `ide.html`); `SIDECAR_FILES` in `common.ts` copies them beside the bundles. If an app starts failing with "no such file" after you add one, add it there.
- **File Manager Find worker:** `bundleApps` separately bundles `fmFindWorker.ts` and its dependencies. `copyAppBundle` keeps it beside `file-manager-studio.js` in the suite, Mac apps and standalone downloads, before signing. Its `.ts` filename is retained to match the worker URL used by source builds; its contents are bundled JavaScript. Keep both files together when moving an app.
- **Launchers** follow symlinks, so `ln -s .../bin/fd-cli /usr/local/bin/` works. Desktop-app launchers start in `~/.bun_rad_studio/run` (see above); command-line launchers keep your folder.
- **The same bundles** go into every platform; only the runtime, window library and launchers differ.

## Publishing

```bash
bun run release:build -- --mac-apps
gh release create v1.0.0 release/*.tar.gz release/*.zip release/SHA256SUMS.txt -F release/RELEASE_NOTES.md
```

`RELEASE_NOTES.md` is generated: a table of every download with its size and a "which one do I pick" guide. Change the version in `package.json` first; it names every file.

Downloaded Mac files carry a quarantine mark. Tell people to run `xattr -dr com.apple.quarantine .` in the unpacked folder (the suite's `README.txt` says so), or to right-click an app and choose Open.

## What was verified

- **Windows 11 ARM64, 16 October 2026:** double-click build workflow built all 73 desktop apps and 79 CLI tools plus standalone File Manager. The extracted File Manager ZIP opened a native window through x64 emulation and served HTTP 200. Tests exercised executable icon preservation, ZIP extraction (including literal brackets/apostrophes), real shortcut install/uninstall, prerequisite detection, and stderr retention. The missing-prerequisite download/install branch is tested without installing system software, not verified on a clean Windows installation.

- **All 65 Mac apps** were built, signed (`codesign --verify --deep --strict`), started and checked: 64 passed first time, the Postgres app failed because it reads `postgres_designer.js` next to its code; that file is now copied and the app passes. Apps whose page server shares a thread with the window can't answer a request while the window is busy, so for those the check is "still running with a web address", not "page answered".
- **`linux-arm64`** was unpacked in an Ubuntu 24.04 arm64 container (Docker on this Mac): `bin/fd-cli` runs, and `bin/file-manager-studio` opened a real WebKitGTK window under Xvfb with its page answering `200`; the Calculator also started.
- **`linux-arm64-musl`** command-line tools ran in an Alpine 3.20 container after `apk add libstdc++ libgcc`.
- **All ten runtimes** compile from this Mac (the cross-compile step) and every archive was written.
- `tests/release_build.test.ts` (23 tests) builds a real suite for this Mac, runs a tool from it, and builds a real `.app`.

## Known limits

- **Not run on native hardware:** `macos-x64`, `linux-x64`, `linux-x64-baseline`, `windows-x64` and `windows-x64-baseline`. Windows x64 desktop code was exercised through emulation on Windows ARM, not on an Intel/AMD PC.
- **Not notarized:** Macs will warn about downloaded apps until you notarize them with an Apple Developer ID (not part of this repository).
- **Apps that start other programs** by running `bun` (for example the Launcher's "open this app" buttons) need Bun on the PATH; they are not rewritten to use the runtime.
- **A console window** stays open behind desktop apps started from a Windows `.cmd` launcher.
- **Writes into the folder:** the Mac apps and the launchers give desktop apps a writable start folder, but an app that writes next to its own code would write into the unpacked folder (or, in a `.app`, into the bundle).
- **Sizes:** the full Mac apps set is about 1.9 GB (zipped in three files); a platform archive is about 130 MB.
