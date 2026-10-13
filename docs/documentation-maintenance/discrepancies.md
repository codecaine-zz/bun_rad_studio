# Discrepancies found while documenting

Where the code, existing documents and reality disagree. Each item says what was observed, how, and what was **not** done. The handbook describes actual behaviour and links here; it does not change application behaviour to make a claim true. Statuses: *Open* (not fixed), *Fixed* (documentation-only fix applied).

## Contents

- [D-001 `bun start` fails (fixed)](#d-001)
- [D-002 Designer database controls are placeholders](#d-002)
- [D-003 Tool counts in the README disagree with the launcher](#d-003)
- [D-004 Older per-application guides are generated and unverified](#d-004)
- [D-005 Linux system packages differ between two documents](#d-005)
- [D-006 Running the tests modifies tracked files](#d-006)
- [D-007 SimpleGUI quick start imports a package that is not installed](#d-007)
- [D-008 Broken links and a broken code fence in existing documents](#d-008)
- [D-009 Legacy studios keep database passwords in a plain `.env` file](#d-009)
- [D-010 Two identical theme documents](#d-010)
- [D-011 Exported project did not parse (fixed)](#d-011)
- [D-012 Code Studio accepted commands from any web page (fixed)](#d-012)
- [D-013 Standalone servers listened on every network interface (fixed)](#d-013)
- [D-014 The launcher listed library files as applications (fixed)](#d-014)
- [D-015 Redis server file crashes when started directly (fixed)](#d-015)
- [D-016 The designer's script was cut short, so the page did nothing (fixed)](#d-016)
- [D-017 Import, Keys and Audit dialogs, the status bar and the context menu could never appear (fixed)](#d-017)
- [D-018 Importing a layout could corrupt the open form or fail silently (fixed)](#d-018)
- [D-019 Button text was hard to read in many themes (fixed)](#d-019)
- [D-020 Two tests passed only on the author's machine (fixed)](#d-020)

<a id="d-001"></a>
## D-001: `bun start` fails (fixed)

- **Status:** Fixed on 13 October 2026: `existsSync` is now imported in `index.ts`. `bun run index.ts` starts and stays running (macOS, Bun 1.4.2; process observed, window not inspected). Regression tests: `tests/ide_html.test.ts`.
- **Observed before the fix:** `bun start` (and `bun run index.ts`) stops immediately with `ReferenceError: existsSync is not defined` at `index.ts:972` (function `getIdeHtml`). Reproduced on 13 October 2026 in a fresh clone and in the working tree, macOS, Bun 1.4.2.
- **Cause:** `index.ts` calls `existsSync` but never imports it (its `fs` import lists `readFileSync, writeFileSync, mkdirSync`).
- **Documents that claim otherwise:** `README.md` ("Visual RAD Form Designer & IDE (`bun start`)").
- **Effect on this handbook:** the [visual designer](../visual-designer/index.md) and [generated applications](../generated-applications/index.md) pages remain source-based for the interface and say so.

<a id="d-002"></a>
## D-002: Designer database controls are placeholders

- **Status:** Open (documented as placeholders).
- **Observed (source):** `src/ide.html` draws `db_grid` with three hard-coded sample rows (around line 1867); `db_connection` is a labelled tray item; `launchAccessCrudWizard` (around line 6541) fills the form with one fixed "Customer" layout. No code connects to a database or discovers fields from the designer.
- **Documents that suggest otherwise:** the "DB Wizard" button's tooltip ("Auto-generate an MS Access style Database CRUD form layout") and the README's Microsoft Access parity wording.

<a id="d-003"></a>
## D-003: Tool counts in the README disagree with the launcher

- **Status:** Open.
- **Observed:** `bun run cli:launcher --list` reports **175 tools: 70 studios, 78 CLI tools, 27 demos** (the launcher does not count itself or the visual designer). The README says "170+ applications", "all **65** Studio Applications, **77** CLI Utilities and **27** Showcase Demos (169+ tools total)", "140+ tools" and has a heading "**39** Enterprise Production Workstations & Utilities". The guide generator says "all 40 applications".
- **Handbook rule:** counts are taken from the generated [application index](../reference/application-index.md).

<a id="d-004"></a>
## D-004: Older per-application guides are generated and unverified

- **Status:** Open.
- **Observed:** the 43 numbered guides in `docs/userguides/` are written by `scripts/guides_generator/*.ts` (`build_all_guides.ts`); editing the `.md` files by hand is overwritten the next time the generator runs. They contain unverified statements such as `Version: 2.4.0`, `Dependencies: 0`, `Offline: 100%`, and cover only part of the 70 studios (see the *Documentation page* column of the [coverage matrix](coverage-matrix.md)).
- **Handbook rule:** these guides are linked as *legacy, unverified*. They are not copied into verified pages. Replacing them is tracked in the coverage matrix.

<a id="d-005"></a>
## D-005: Linux system packages differ between two documents

- **Status:** Open (not verified; no Linux machine).
- **Observed:** `node_modules/webview-bun/README.md` says its Linux library needs GTK 4 and WebKitGTK 6 (`libgtk-4-1`, `libwebkitgtk-6.0-4`). `docs/HOMEBREW_SUITE_GUIDE.md` lists `libwebkitgtk-6.0-4 libgtk-3-0` or `libwebkit2gtk-4.0-37` and Fedora/Arch equivalents.

<a id="d-006"></a>
## D-006: Running the tests modifies tracked files

- **Status:** Fixed on 13 October 2026.
- **Observed:** after a full `bun test`, `bin/manifest.json` was modified (and, before [D-014](#d-014), two extra files appeared in `bin/`). The cause is `tests/codecaine_homebrew_suite.test.ts`, which calls `generateAllWrappers()` from `scripts/generate_brew_suite.ts`; that rewrote the manifest with a new `generatedAt` timestamp every time.
- **Fix:** the generator keeps the existing manifest when only the timestamp would change. After a full `bun test` run `git status` is clean.
- **Not changed:** the test still regenerates the real `bin/` wrappers (it rewrites them with identical content). If a wrapper or the command list really changes, the files change, which is intended.

<a id="d-007"></a>
## D-007: SimpleGUI quick start imports a package that is not installed

- **Status:** Open (documented workaround).
- **Observed:** the quick start in [SIMPLEGUI_API.md](../SIMPLEGUI_API.md) uses `import { simplegui } from "bun_rad_studio"`. `package.json` has `"name": "bun_rad_studio"` and `"private": true`; the repository's own demos import `"../index.ts"`. The handbook's example uses the demos' form and was run: [`examples/docs/hello_window.ts`](../../examples/docs/hello_window.ts).

<a id="d-008"></a>
## D-008: Broken links and a broken code fence in existing documents

- **Status:** Fixed (documentation-only edits, 13 October 2026), found by `bun run docs:check`.
- `docs/API.md` was missing a closing code fence after the `ControlSpec` interface, which swallowed the headings below it; `docs/SYSTEM_UTILITIES_API.md` linked to a non-existent `AGENTS.md`; three README and two theme-document anchors pointed at headings whose generated anchors have a leading hyphen (the heading starts with an emoji).

<a id="d-009"></a>
## D-009: Legacy studios keep database passwords in a plain `.env` file

- **Status:** Accepted and documented (decision recorded 13 October 2026: keep the behaviour, document the risk). See [Reference: environment variables](../reference/index.md#environment-variables) for the facts and safe practice.
- **Observed:** `applications/mysql_studio_server.ts` and `applications/postgres_studio_server.ts` read `.env` from the current folder and copy every value into the process environment. The Workbench uses the operating system's credential store instead.

<a id="d-010"></a>
## D-010: Two identical theme documents

- **Status:** Open.
- **Observed:** `docs/theme.md` and `docs/THEMES.md` have identical content (1229 lines each, no `diff` output). Two files whose names differ only by case also collide on case-insensitive file systems. The handbook links to `THEMES.md`; `theme.md` is kept in the navigation only so that it is not silently lost.

<a id="d-011"></a>
## D-011: Exported project did not parse (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** a project written by `exportProjectHelper` failed to build or start (`bun build index.ts`: `Unexpected /`, `Unexpected escape sequence`). The generated `index.ts` contains helper functions `setTimelineSteps`, `setBreadcrumbs`, `setTreeNodes` and `setAvatarGroup`, whose JavaScript strings use a template literal inside a template literal; the inner backticks were not escaped in the generator (`index.ts`, the `appTs` template).
- **Fix:** the inner backticks are now escaped. The generated helpers pass valid JavaScript to the page (checked with `new Function`).
- **Regression tests:** `tests/ide_html.test.ts` ("Exported project").
- **Not covered:** whether those four helpers draw correctly in a real page.

<a id="d-012"></a>
## D-012: Code Studio accepted commands from any web page (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** `applications/code_studio.ts` did not call `guardLocalRequest` (`src/localGuard.ts`) and answered with `Access-Control-Allow-Origin: *`. While Code Studio was running, a request with a foreign `Origin` header to `POST /api/exec` ran the command: the old code returned status 200 and the command's output (probe run against the previous version of the file). The same server also reads, saves, renames and deletes files. A web page open in the user's browser could therefore have run commands on the user's machine.
- **Also fixed:** the workspace boundary check was `path.startsWith(workspaceRoot)`, which accepts a sibling folder such as `/work/ws-evil` for the workspace `/work/ws`. It is now `isInsideWorkspace` (exported from the same file) and uses the relative path.
- **Behaviour change:** requests from another origin, or with a non-loopback `Host`, now get `403`. The Code Studio page itself, `curl` and the tests send no foreign `Origin`, so they are unaffected.
- **Regression tests:** `tests/code_studio_security.test.ts`.
- **Not done:** the other studios that do not use the guard (see [risk R-03](baseline-and-risks.md#risks)) were not changed.

<a id="d-013"></a>
## D-013: Standalone servers listened on every network interface (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** `bun run applications/<app>.ts --server` for `task_manager`, `fd_studio` and `rip_studio` started the server with `host: "0.0.0.0"`, while printing `http://127.0.0.1:<port>`. The guard only checks the `Host` header, which a client on the same network can set to `localhost`, so these servers (process control, file operations) were reachable from the local network.
- **Fix:** they now bind to `127.0.0.1`. LAN use did not work before either, because the guard refuses a non-loopback `Host`.
- **Later in the same change:** the static rule in `tests/studio_servers_local_only.test.ts` found two more files with the same bind, `applications/redis_studio_server.ts` and `applications/system_studio_server.ts`; both now bind to `127.0.0.1`. Frogger, Snake and Tetris called `Bun.serve` without a `hostname`, which makes Bun listen on every interface; they now pass `127.0.0.1`.
- **Regression tests:** `tests/standalone_server_binding.test.ts` (runs the standalone servers and tries the machine's LAN address; skipped when there is no non-loopback IPv4 address; including the two Redis files since D-015 was fixed) and `tests/studio_servers_local_only.test.ts` (static rules over all of `applications/`).

<a id="d-014"></a>
## D-014: The launcher listed library files as applications (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** `scanWorkspaceApps` in `applications/launcher_studio.ts` listed every `.ts` and `.js` file in `applications/` except a few name patterns. Five files are not programs: `postgres_designer.js` (a browser script), `postgres_studio_designer.ts`, `sqlite_studio_macros.ts`, `studio_codegen.ts` and `system_studio_extras.ts`. Running them directly either printed nothing or crashed (`bun run applications/postgres_designer.js` fails with `document is not defined`). The same scan feeds `scripts/generate_brew_suite.ts`, so the committed `bin/` held three broken commands (`codecaine-postgres-designer.js`, `codecaine-postgres-studio-designer`, `codecaine-system-studio-extras`). Because the wrapper for the browser script is a bash file named `.js`, `tsc` also reported 75 syntax errors for it.
- **Fix:** these five files are listed in `NON_APP_MODULES` and skipped. The three broken wrappers were removed and `bin/manifest.json` regenerated (259 to 256 commands).
- **Behaviour change:** the launcher and `codecaine list` no longer show those five entries. They did not work.
- **Regression tests:** `tests/launcher_listing.test.ts` (also checks that every listed application contains `import.meta.main`, so a new library file added to `applications/` is caught).
- **Not done:** the test `tests/codecaine_homebrew_suite.test.ts` still writes into the real `bin/` ([D-006](#d-006)). The sample diagnostics output in `docs/HOMEBREW_SUITE_GUIDE.md` was updated from 259 to 256, the value `./install_homebrew_suite.sh --doctor` printed on 13 October 2026.

<a id="d-015"></a>
## D-015: Redis server file crashes when started directly (fixed)

- **Status:** Fixed on 13 October 2026: the `--server` block at the end of `applications/redis_studio.ts` now runs only when that file is the entry point (`import.meta.main`). Both `bun applications/redis_studio_server.ts --server` and `bun applications/redis_studio.ts --server` start, print `READY:<port>` and listen on 127.0.0.1 only (`tests/standalone_server_binding.test.ts`).
- **Observed before the fix:** `PORT=23457 bun applications/redis_studio_server.ts --server` stops with `ReferenceError: Cannot access 'RedisManager' before initialization` at `applications/redis_studio_server.ts:1026`, called from `applications/redis_studio.ts:2798`. The committed version behaves the same. `redis_studio.ts` imports the server file and also starts a server whenever `--server` is on the command line, so starting the server file first loads `redis_studio.ts` in the middle of its own initialization.
- **Not checked:** talking to a real Redis server through either file.

<a id="d-016"></a>
## D-016: The designer's script was cut short, so the page did nothing (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** `src/ide.html` has a line (`html += "</script>\n</body>\n</html>";`, in the code that builds the exported HTML) with a literal closing script tag inside a JavaScript string. A browser ends an inline script at the first closing script tag, even inside a string, so the designer's single large script stopped in the middle of that line and failed with `SyntaxError: Invalid or unexpected token`. The page then showed its menus and buttons but nothing worked: the form title and property fields were empty and `formSpec` was undefined. The line was added on 12 September 2026 (commit `29dbfe4`), so the designer's interface has been inert since then, independent of [D-001](#d-001).
- **How found:** the page `getIdeHtml()` returns was opened in the integrated browser and its script was extracted and checked with `node --check`.
- **Fix:** the tag is written as `<\/script>` inside the string.
- **Regression test:** `tests/ide_html.test.ts` ("every inline script is valid JavaScript, as a browser would split the page").

<a id="d-017"></a>
## D-017: Import, Keys and Audit dialogs, the status bar and the context menu could never appear (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** in `src/ide.html` the *event handler editor* dialog (`eventEditorModal`) was missing two closing `</div>` tags. Everything after it was nested inside that hidden dialog: the Import, Keys (`hotkeysModal`) and Audit (`diagnosticsModal`) dialogs, the right-click context menu, the status bar and the placement toast. Clicking **Audit** set the dialog to `display:flex` but its size was 0 by 0, so nothing showed; the status bar was missing from the window.
- **Fix:** the two closing tags were added. After the fix every dialog is a direct child of `<body>`, the status bar is 22 px tall and the Audit dialog fills the window.
- **Regression test:** `tests/ide_html.test.ts` ("dialogs, context menu and status bar are not nested inside another dialog").
- **Not checked:** the Keys dialog and the right-click menu were not opened; only their position in the page was checked.

<a id="d-018"></a>
## D-018: Importing a layout could corrupt the open form or fail silently (fixed)

- **Status:** Fixed on 13 October 2026 (behaviour change, see below).
- **Observed (in the browser, after D-016 and D-017 were fixed):** `processImportJSON` replaced the open form with whatever JSON it was given, then rendered it. JSON with a title but no `controls` list, or with `"controls": "abc"`, left the form without a usable controls list (the status line read `Form: undefinedxundefined`) and showed "Invalid JSON format: Cannot read properties of undefined". JSON with neither `title` nor `controls` did nothing and said nothing. The Import dialog stayed open.
- **Fix:** `normalizeImportedSpec` checks the text first. Valid layouts are completed with defaults (title "Imported Form", 840 by 560, position 0,0, size 150 by 36, a generated `id` when missing, duplicate ids renamed). Anything else is refused with a specific message and the open form is left unchanged.
- **Behaviour change:** a layout with only a title is now accepted as an empty form; unusable input is refused instead of half-applied. A successful import can be undone with Cmd/Ctrl+Z (checked in the browser).
- **Regression tests:** `tests/ide_html.test.ts` ("Designer: importing a JSON layout"), which runs the real function from the page.

<a id="d-019"></a>
## D-019: Button text was hard to read in many themes (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** with the default theme, a newly placed button had light text (`#cdd6f4`) on a lavender fill (`#cba6f7`), a contrast of 1.4 to 1 (WCAG AA asks for 4.5 to 1 for normal text). The theme already defines the right button text colour (`btnFg`) and the "change theme" action uses it, but placing a button did not.
- **Fix:** a new button now takes `btnFg` from the theme (for High Contrast this is the same `#000000` as before).
- **Also found:** computed from the theme table in `getThemeColors`, 25 of the 51 theme choices had a `btnFg` on `btnBg` contrast below 4.5 to 1 (for example Sonoma Emerald 2.5, Linux Mint 2.8, Solarized Light 3.0).
- **Fix:** `getThemeColors` now wraps the unchanged table (`getRawThemeColors`). A theme keeps its own button text colour when it already reaches 4.5 to 1; otherwise the button text becomes black or white, whichever reads better. No other colour changes. Now all 51 themes reach 4.5 to 1 for button text.
- **Behaviour change:** in the 25 themes concerned, button text is black or white instead of the theme's original tint.
- **Not changed:** Solarized Light and Solarized Dark body text on the form or panel colour is below 4.5 to 1 (1 and 2 combinations). These are the published Solarized colours, so they were left.
- **Tests:** `tests/ide_html.test.ts` ("Designer themes") runs the real functions from the page against every theme in the dropdown.

<a id="d-020"></a>
## D-020: Two tests passed only on the author's machine (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** running `bun test` in a fresh `git clone` made in a folder called `ci_clone` failed two tests that passed in the working copy: `tests/launcher.test.ts` ("scopes exclusively to project repository tools") expected every application path to contain `/bun_rad_studio/`, so it only passed if the checkout folder had that name; `tests/mysql_manual_config.test.ts` (test 9) expected `hasPassword` to be true, which was only so because the untracked `.env` in the working copy holds a MySQL password.
- **Fix:** the launcher test checks that paths start with the current folder; the MySQL test sets and restores a placeholder `MSQL_PASSWORD`. The MySQL file also passes with `.env` moved away.
- **Why it matters:** both would have failed on the first run of the new [CI workflow](../testing/index.md#continuous-integration) (the first would not have, as GitHub's folder has the same name, but only by luck).
