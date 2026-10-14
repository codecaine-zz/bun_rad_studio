# Requirements

This page lists what you need before installing, and what was actually checked. "Verified" always means *I ran it on the setup in the first table*.

## What was used for verification

| Item | Value |
|---|---|
| Computer | Apple silicon Mac (macOS) |
| Bun | 1.4.2 |
| Date | 13 October 2026 |
| Checked from | a fresh `git clone` of the repository |

## Operating systems

| System | Status | Notes |
|---|---|---|
| macOS | **Verified** for the commands in this handbook that say so | Uses the system's built-in web view; nothing extra to install. |
| Linux | **Not verified** | The libraries the project depends on need extra system packages (see below). Two project documents disagree about which ones; see [D-005](../documentation-maintenance/discrepancies.md#d-005). |
| Windows | **Not verified** | The project ships `run.ps1`, `run.cmd` and a script that copies `WebView2Loader.dll` after install. The Microsoft Edge WebView2 runtime must be installed. |

Command-line tools (the 78 tools whose names end in `_cli`) need no window system, but only a few were run for this handbook (see the [coverage matrix](../documentation-maintenance/coverage-matrix.md)).

## Required software

### Bun (required)

*What it is:* a program that runs the project's TypeScript files and installs its packages.
*Check it:* open a terminal and run

```bash
bun --version
```

Expected result: a version number such as `1.4.2`. If the terminal says `command not found`, install Bun from <https://bun.sh>. The **minimum** supported Bun version is **unknown**: the project does not state one; 1.4.2 is the version tested here.

### Git (to download the project)

```bash
git --version
```

Expected result: a version number. Alternatively download the repository as a ZIP file from GitHub.

## Optional software

| Software | Needed for | How to check |
|---|---|---|
| Homebrew command-line tools (ffmpeg, jq, ripgrep, …) | Some studios that wrap those tools | `bun run deps:check` prints a table showing which are installed. It only inspects; it installs nothing unless you add `--install`. Verified: runs and lists the tools. |
| A MySQL or PostgreSQL server | Using the Workbench or studios with those engines | See the [Database Workbench guide](../databases/workbench.md#getting-started). SQLite needs nothing: it is built into Bun. |
| Node.js | Only to run one automated test (`tests/db/workbench_ui.test.ts`) | `node --version` |

## Linux system packages (partly verified)

`webview-bun`'s own README says its Linux library needs GTK 4 and WebKitGTK 6 (Debian: `libgtk-4-1`, `libwebkitgtk-6.0-4`). `docs/HOMEBREW_SUITE_GUIDE.md` lists different packages (`libwebkitgtk-6.0-4 libgtk-3-0` or `libwebkit2gtk-4.0-37`). **Verified on 13 October 2026:** on GitHub's `ubuntu-latest` runner, installing `libwebkitgtk-6.0-4 libgtk-4-1 xvfb xclip` was enough for the whole automated suite to pass (without `libwebkitgtk-6.0-4` 74 test files failed to load the native library). Those tests use a virtual display and mostly fake windows, so **a real window on a Linux desktop has not been opened**. `xclip` is only needed for the clipboard buttons. Details: [Testing](../testing/index.md#other-platforms).

## Disk space and network

- `bun install` downloads about 46 packages (the `node_modules` folder was 56 MB here). It needs internet access the first time.
- Nothing else is downloaded when you run the tools, except where a tool's own purpose is network access.

## Next

[Install and first launch](install-and-first-launch.md)
