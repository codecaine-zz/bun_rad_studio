# Install and first launch

**Goal:** get the project onto your computer, open the launcher, and run a first small program.
**Prerequisites:** [Requirements](requirements.md) – Bun and Git installed.
**Difficulty:** beginner. Every command below was run from a fresh clone on macOS with Bun 1.4.2 (13 October 2026) unless it says otherwise.

Prefer to watch first? Start with the [Bun RAD Studio overview](https://www.youtube.com/watch?v=jhTA6194Xn4) (5:55), then the [SimpleGUI full tutorial](https://www.youtube.com/watch?v=-6H_in0W73k) (15:07) or the [no-code visual designer walkthrough](https://www.youtube.com/watch?v=Rh38eyWk0Jo) (10:56).

**Windows downloads:** no source checkout, Bun or compilation is needed. Extract the whole ZIP into a permanent folder, double-click `install.cmd` to check/install Microsoft's desktop prerequisites with your permission, then open the File Manager executable or the suite's Start menu shortcuts. Windows ARM needs Windows 11 x64 emulation; setup uses the x64 Visual C++ runtime even on ARM.

**Compile from source on Windows:** install Bun, clone the project, then double-click [build.cmd](../../build.cmd). It restores dependencies and produces Windows suite and File Manager ZIPs for your PC. See [Building on Windows](../developer/releasing.md#building-on-windows) for target options.

## Contents

- [Step 1: Open a terminal](#step-1-open-a-terminal)
- [Step 2: Download the project](#step-2-download-the-project)
- [Step 3: Install the packages](#step-3-install-the-packages)
- [Step 4: See what is in the project (no window needed)](#step-4-see-what-is-in-the-project-no-window-needed)
- [Step 5: Open the launcher](#step-5-open-the-launcher)
- [Step 6: Run your first program](#step-6-run-your-first-program)
- [Step 7: Check that everything works (optional)](#step-7-check-that-everything-works-optional)
- [Step 8: Build the library (optional)](#step-8-build-the-library-optional)
- [Things that do not work yet](#things-that-do-not-work-yet)
- [When something fails](#when-something-fails)

## Step 1: Open a terminal

A *terminal* is a window where you type commands. On macOS open **Terminal** (Applications → Utilities). Every command in this page is typed in the terminal and finished with the Return key. Lines starting with `#` are comments; you do not type them.

## Step 2: Download the project

```bash
git clone https://github.com/codecaine-zz/bun_rad_studio.git
cd bun_rad_studio
```

*What it does:* `git clone` copies the project into a new folder named `bun_rad_studio`; `cd` moves the terminal into that folder. **Run every later command from inside this folder** (the "repository root").
*Expected result:* no error, and `ls` shows files such as `package.json`, `index.ts`, `applications`.
*Verification note:* verified with a clone of the local repository; the GitHub address itself was not cloned for this handbook.

## Step 3: Install the packages

```bash
bun install
```

*What it does:* downloads the libraries the project needs (`systeminformation`, `webview-bun`, and `prettier` and `sql-formatter` for the code editors' Format command) plus development tools (such as `jsdom`), into a folder called `node_modules`. It also runs a small script (`postinstall`) that does nothing on macOS and Linux and, on Windows, copies a WebView2 helper file.
*Expected result:* ends with a line like `46 packages installed`, including `+ webview-bun@2.4.0`.
*Common failures:* see [When something fails](#when-something-fails).

## Step 4: See what is in the project (no window needed)

```bash
bun run cli:launcher --list
```

*What it does:* the launcher's command-line companion scans the repository and prints every tool it finds.
*Expected result:* a summary that includes `Total Detected: 173 tools` (67 studios, 79 command-line tools, 27 demos), followed by the list. Add `--search sqlite` to filter, or `--json` for machine-readable output.

The same list is in the [application index](../reference/application-index.md).

## Step 5: Open the launcher

```bash
bun run app:launcher
```

*What it does:* opens **Launcher Studio Pro**, a window listing every tool with search, favorites and a launch button.
*Expected result:* a window opens and stays open. The terminal prints `Launching Project Application & CLI Workstation Launcher...` and keeps running; close the window or press Ctrl+C to stop it.
*Verified:* the window opened and kept running for at least 7 seconds. Clicking through its features was not done by hand for this handbook (automated tests for it exist).

To open a particular studio directly, use its short name from the [script index](../reference/script-index.md), for example `bun run app:database` (SQLite Studio). Whether each studio's window works was **not** checked individually; see the [coverage matrix](../documentation-maintenance/coverage-matrix.md).

## Step 6: Run your first program

The repository includes a tiny program for this handbook: [`examples/docs/hello_window.ts`](../../examples/docs/hello_window.ts). It opens a window with a text box and a button.

```bash
bun run examples/docs/hello_window.ts
```

*What it does:* the program uses **SimpleGUI**, the project's library for building windows in code. `createWindow(title, width, height, options)` makes a window; `addLabel`, `addTextInput` and `addButton` add controls; `win.run()` shows the window and waits for you.
*Expected result:* a 520×300 window titled "Hello from Bun RAD Studio" with a label, a text box and a **Say hello** button. The button is set up to show a message "Hello, *name*!".
*Verified:* the window opened and stayed running (12 seconds, then stopped by me). Typing a name and pressing the button was **not** tested by hand.
*Next:* the library is documented in [SIMPLEGUI_API.md](../SIMPLEGUI_API.md). Its quick-start example imports from `"bun_rad_studio"`, which only works if that package is installed; inside this repository import from `index.ts` as the example above does.

## Step 7: Check that everything works (optional)

```bash
bun test tests/db/splitter.test.ts
```

*Expected result:* `13 pass`, `0 fail`. To run **all** tests use `bun test`; see [Testing](../testing/index.md) for what is skipped without a database server.

## Step 8: Build the library (optional)

```bash
bun run build
```

*What it does:* runs `scripts/build.ts lib`, which bundles the project into a `dist/` folder.
*Expected result:* the last line is `Library build complete → dist/`, and `dist/` contains `index.js` and copies of the API documents.
*Not verified:* `bun run build:binary` and `bun run build:all` (standalone executables).

## Things that do not work yet

- **`bun start` (the visual form designer)** now opens its window and the page works (see [what was checked](../visual-designer/index.md#what-was-checked)); before 13 October 2026 it crashed ([D-001](../documentation-maintenance/discrepancies.md#d-001)) and its page did nothing ([D-016](../documentation-maintenance/discrepancies.md#d-016)). The designer has no named Save-as/Open command (only a single autosaved draft in `~/.bun_rad_studio/designer_draft.json` and JSON copy/Import), so this page still uses a code example for the first project that you can save and reopen.
- Windows ARM: the source build and extracted File Manager's native window were verified on Windows 11 ARM64 on 16 October 2026. Linux ARM64 native startup and sandbox setup were verified on Ubuntu 24.04; see [release verification](../developer/releasing.md#what-was-verified). Other hardware and every app's UI have not all been manually tested.

## When something fails

| What you see | Likely cause | What to do |
|---|---|---|
| `bun: command not found` | Bun is not installed or the terminal was not reopened after installing it. | Install Bun (<https://bun.sh>), open a new terminal, run `bun --version`. |
| `bun install` cannot download packages | No internet, or a network proxy. | Check your connection and run the command again; it is safe to repeat. |
| `error: script "start" exited with code 1` with `existsSync is not defined` | You are on a version from before the D-001 fix. | Update the project (`git pull`), then run `bun start` again. |
| The terminal shows output but no window appears | A window system problem (on Linux, missing WebKitGTK/GTK packages). | See [Requirements](requirements.md#linux-system-packages-partly-verified). |
| A command fails with `Module not found` | You are not in the repository root. | `cd` into the `bun_rad_studio` folder and retry. |

If a command in this page fails on the setup described in [Requirements](requirements.md), please report it with the exact command and output.

## Next

[Update and remove](update-and-remove.md) · [Databases overview](../databases/index.md)
