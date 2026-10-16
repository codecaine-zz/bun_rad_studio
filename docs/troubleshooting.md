# Troubleshooting

Look up what you see, find the likely cause and the safe next step. Rows marked **seen** were reproduced on **13 October 2026** (macOS, Bun 1.4.2); rows marked **from source** were read but not reproduced. Database error codes are in the [Workbench guide](databases/workbench.md#troubleshooting); installation problems are in [Install and first launch](getting-started/install-and-first-launch.md#when-something-fails).

## Contents

- [Starting a program](#starting-a-program)
- [Servers and the browser](#servers-and-the-browser)
- [The designer](#the-designer)
- [Files and data](#files-and-data)
- [Tests, type check and documentation checks](#tests-type-check-and-documentation-checks)
- [Collecting information for a report](#collecting-information-for-a-report)

## Starting a program

### Downloaded File Manager does not open

Extract the **whole** archive; keep `app`, `lib` and `resources` beside the executable.

- **Windows / Windows ARM:** first run `install.cmd` from the extracted download. It checks WebView2 and the [Visual C++ 2015-2022 x64 Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe), and offers to install missing prerequisites using signed Microsoft installers. The native window DLL is x64 even on ARM; an ARM64-only C++ runtime is not sufficient. The ARM download uses the baseline x64 Bun runtime to avoid requiring AVX2 emulation and needs Windows 11 with x64 emulation. Open `troubleshoot.cmd` to retain errors in a console.
- **Linux:** install GTK 4 and WebKitGTK 6.0: `sudo apt install libgtk-4-1 libwebkitgtk-6.0-4` (Ubuntu 24.04+/Debian), or `sudo dnf install gtk4 webkitgtk6.0` (Fedora). Run `sh install.sh` in the extracted folder, then use the applications menu. This restores execute permission if the unzip tool lost it. For errors run `sh troubleshoot.sh` in a terminal; on older downloads use `chmod +x codecaine-file-manager` then `./codecaine-file-manager`. A window needs a graphical desktop; `--server` prints a browser address without loading the native window library.
- **macOS:** move the app to Applications first. These downloads are ad-hoc signed, not Developer ID signed or notarized. Right-click **Open** is not sufficient on every macOS version. Only after trusting the source and verifying the download checksum, run `xattr -dr com.apple.quarantine "/Applications/Codecaine File Manager.app"` in Terminal, then open it from Applications. Do not disable Gatekeeper globally.

On Ubuntu 24.04+, `bwrap: setting up uid map: Permission denied` followed by `Failed to fully launch dbus-proxy` means AppArmor blocked WebKit's sandbox namespaces. From the extracted release folder, run `sh install.sh --apparmor` and enter your sudo password. This grants permission only to that executable; do not disable AppArmor or WebKit's sandbox. Repeat after moving the folder or extracting a new version.

If launching `./codecaine-file-manager` works but the applications-menu entry does not, check the `Exec=` line in `~/.local/share/applications/codecaine-file-manager.desktop`. Older Linux installers could prepend an unwanted backtick to the executable path when run with GNU `sed`. Updated installers fix this for both the standalone File Manager and full suite; rerun the corrected installer to regenerate shortcuts. Existing downloads need an updated installer or a corrected `Exec=` line.

New Windows/Linux builds retain startup output in `~/.bun_rad_studio/file-manager-startup.log` (`%USERPROFILE%\.bun_rad_studio\file-manager-startup.log` on Windows) and try to show an error dialog on failure. The troubleshooting scripts and startup logs require a rebuilt download; existing release archives are unchanged.

Window preferences are saved by atomic replacement. On Windows, brief file locks are retried for up to 250 ms; a persistent lock or permission error is still reported rather than deleting the previous settings file. Close any program holding `file_manager_window.json` and check the data folder's permissions if saving continues to fail.

File Manager page settings are saved in order. Changing a view while the last folder is still being remembered no longer lets an older save response replace the newer view choice.

| What you see | Likely cause | What to do |
|---|---|---|
| `src/ide.html does not match src/ide/` from `bun run ide:check` or a failing `tests/ide_build.test.ts`; or an edit to `src/ide.html` that vanished | `src/ide.html` is built from the parts in `src/ide/`. It was edited by hand, or a part was edited and `bun run ide:build` was not run ([D-044](documentation-maintenance/discrepancies.md#d-044)) | Make the change in the matching file under `src/ide/` (find it by function name; the [handbook](developer/handbook.md#extend-the-designer) lists the main ones), run `bun run ide:build`, commit both |
| `ReferenceError: existsSync is not defined` when running `bun start` (**seen** before the fix) | The old designer start-up bug ([D-001](documentation-maintenance/discrepancies.md#d-001)) | `git pull`, then start again |
| `error: Failed to start server. Is port 8997 in use?` with `code: "EADDRINUSE"` (**seen**, Blackjack; other games use ports 8995 to 9005) | The same game is already running, or another program holds that port | Close the other copy, or start with a free port: `bun run applications/blackjack_studio.ts --server --port 0` |
| A window never appears but the terminal shows output | The window system or webview library failed (on Linux, missing packages) | [Requirements](getting-started/requirements.md#linux-system-packages-partly-verified); try `--server` and open the printed address in a browser |
| `document is not defined` when running a `.js` file from `applications/` (**seen**) | You ran a browser script as a program ([D-014](documentation-maintenance/discrepancies.md#d-014)) | Run the `*_studio.ts` file instead |
| `Cannot access 'RedisManager' before initialization` (**seen** before the fix) | A circular import in the Redis files ([D-015](documentation-maintenance/discrepancies.md#d-015)) | Update the project |
| `bun: command not found`, `Module not found` | Bun missing, or the wrong folder | See [Install and first launch](getting-started/install-and-first-launch.md#when-something-fails) |
| A `codecaine-*` command that did nothing or crashed | One of the three wrappers removed in [D-014](documentation-maintenance/discrepancies.md#d-014) | Regenerate: `bun run scripts/generate_brew_suite.ts` |

## Servers and the browser

| What you see | Likely cause | What to do |
|---|---|---|
| `403 Forbidden: cross-origin request blocked` or `non-loopback Host header` (**seen** in tests) | The [loopback guard](glossary.md#loopback-guard) refused the request: it came from a page on another address, or the `Host` is not `127.0.0.1` / `localhost` | Open the studio at the address it printed (`http://127.0.0.1:<port>/`), not through another host name, a tunnel or a proxy |
| A studio's address does not open from another computer (**seen**) | Studios listen on this computer only, on purpose ([D-013](documentation-maintenance/discrepancies.md#d-013)) | Use the studio on the machine where it runs; do not rebind it |
| `curl` to a studio works but your own web page's request fails (**seen**) | `curl` sends no `Origin`; a page on another address does, and is refused | Expected. Put your code inside the studio, or call it from a program, not a web page |
| `READY:<port>` is never printed | That studio has no headless mode, or it printed a "server running at" line instead | Look at the application index column "Automated start check" ([Application index](reference/application-index.md#studios)) |

NovaCode Studio's command runner uses Windows PowerShell on Windows and `sh` on macOS/Linux. Use commands for that shell; Windows does not require Git Bash or WSL for the runner.

## The designer

| What you see | Likely cause | What to do |
|---|---|---|
| Menus show but nothing responds; property fields are empty (**seen** before the fix) | The page's script stopped early ([D-016](documentation-maintenance/discrepancies.md#d-016)) | Update the project |
| **Audit**, **Import** or **Keys** seem to do nothing; no status bar (**seen** before the fix) | Dialogs hidden inside another dialog ([D-017](documentation-maintenance/discrepancies.md#d-017)) | Update the project |
| Clicking a palette item adds nothing | Normal: the palette starts *placement mode*; click on the canvas to drop the control (Shift+click keeps placing; Esc cancels) | Click the canvas |
| **Import** says "That text is not valid JSON", "does not look like a form layout", "must be a list of controls" or names a control without `control_type` (**seen**) | The pasted text failed validation. **Your current form was not changed** | Fix the text; the message says what is wrong |
| After **Import** you want the old form back | | Press Cmd/Ctrl+Z (**seen**) |
| Closing the designer lost your layout | Before 13 October 2026 nothing was saved. Now the latest form is autosaved: start the designer again and use **Restore** on the banner. If no banner appears, nothing had been autosaved (no controls, or the app could not write `~/.bun_rad_studio`) | Copy the **JSON** tab to a file next time; **Import** reads it back ([Data and files](reference/data-and-files.md)) |
| **Export** created extra files like `index.ts.bak-2026-10-13T...` | You exported into a folder that already held changed files; they were kept for you ([D-022](documentation-maintenance/discrepancies.md#d-022)) | Compare, then delete the backups you do not need |
| **Run** does nothing | The preview process failed to start or crashed | Read the status bar (it shows a failure the designer itself noticed) and then **`.rad_preview/preview.log`** in the folder you started the designer in: since 13 October 2026 the preview's output and a failure to start it are written there ([D-040](documentation-maintenance/discrepancies.md#d-040)). You can also run `bun .rad_preview/preview.ts` from that folder and read the error |
| Exported app title or size looks wrong | A width or height that is not a positive number becomes 800 by 600 ([D-021](documentation-maintenance/discrepancies.md#d-021)) | Enter whole numbers |

## Files and data

| What you see | Likely cause | What to do |
|---|---|---|
| Edits to an uploaded SQLite file are not in the original | SQLite Studio works on a **copy** in `.sqlite_uploads/` | Use the Workbench to open the original file, or copy the edited file back yourself |
| Launcher favourites vanished | `.launcher_history.json` is kept in the folder you started from | Start from the same folder, or set `LAUNCHER_HISTORY_FILE` |
| A file you "deleted" with Rip Studio is missing | It is in the graveyard (`$GRAVEYARD`, else `~/.local/share/rip/graveyard`), not gone | Restore it from Rip Studio |
| Database settings from `.env` are not picked up | `.env` is read from the **current folder** only | Start the studio from the folder that holds it ([Environment variables](reference/index.md#environment-variables)) |

## Tests, type check and documentation checks

On Windows, use an **x64 Bun executable** for tests that import `webview-bun`, including on Windows ARM: its Windows native DLL is x64. Invoke that executable directly for the test runner; an ARM64 Bun installation can otherwise be selected by nested package scripts. WSL integration tests require WSL and the opt-in `FM_TEST_WSL=1`; Unix-shell tests require `sh`.

| What you see | Likely cause | What to do |
|---|---|---|
| `New type errors (the count for these files went up)` (**seen**) | `bun run typecheck` found more errors in the listed files | Fix them. Only after a deliberate decision, `bun run typecheck -- --update` and say why in the commit |
| `docs/toc.md is stale: run bun run docs:build` (**seen**) | A generated page is out of date, often because a page was added to `docs/nav.json` | `bun run docs:build`, commit the result |
| `missing anchor #...` from `docs:check` (**seen**) | A link points at a heading that does not exist. Anchors are the full heading text in lower case with hyphens, so `## CLI tool (command-line interface)` is `#cli-tool-command-line-interface` | Copy the anchor from the heading |
| `docs/theme.md` has no H1 on Windows (**seen** before the fix) | Git checked out the tracked symlink as a plain file containing `THEMES.md` because `core.symlinks` is false | Update the project: the checker now reads this known legacy alias as [Themes](THEMES.md), without requiring symlink privileges. Do not edit the symlink's target text as if it were a Markdown page |
| A test passes on your machine but fails in a fresh clone | It depends on an untracked file (for example `.env`) or the folder name ([D-020](documentation-maintenance/discrepancies.md#d-020)) | Make the test create what it needs |
| About 152 tests are skipped | The MySQL and PostgreSQL suites need a disposable server | [Database tests](testing/database-tests.md) |
| `git status` shows changes in `bin/` after tests | The wrapper list really changed (the timestamp alone no longer causes this, [D-006](documentation-maintenance/discrepancies.md#d-006)) | Review the change; commit it if intended |

## Collecting information for a report

Include: the exact command, the full output, `bun --version`, your operating system and version, and whether it also fails in a fresh clone. Remove passwords, tokens and your `.env` contents first; see [Security](security.md).
