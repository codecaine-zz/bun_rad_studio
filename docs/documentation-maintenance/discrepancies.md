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
- [D-021 A crafted layout could run code in an exported project (fixed)](#d-021)
- [D-022 Exporting again silently overwrote the user's edits (fixed)](#d-022)
- [D-023 Run only worked when the designer was started from the project folder (fixed)](#d-023)
- [D-024 A layout can contain scripts, and control text is inserted as raw HTML (partly addressed)](#d-024)
- [D-025 Generated preview files were tracked in git (fixed)](#d-025)
- [D-026 Defects found by burning down type errors (fixed)](#d-026)
- [D-027 The unified `src/index.ts` exported some names as undefined (fixed)](#d-027)
- [D-028 Documents disagreed on how many themes exist (fixed)](#d-028)
- [D-029 A test-only package was a runtime dependency, with known advisories (fixed)](#d-029)
- [D-030 The committed command manifest depended on the author's launcher favourites (fixed)](#d-030)
- [D-031 The designer had no visible keyboard focus and an unreachable palette (fixed)](#d-031)
- [D-032 Tests silently depended on the author's machine; first GitHub run had 14 failures (fixed)](#d-032)
- [D-033 A stale package-lock.json broke `npm ci` (removed)](#d-033)
- [D-034 Fourteen game servers were copies of the same code (refactored)](#d-034)
- [D-035 Placing and resizing controls needed a mouse (fixed, behaviour change)](#d-035)
- [D-036 Dialogs ignored focus and let shortcuts edit the form behind them (fixed)](#d-036)
- [D-037 Library server helpers listened on every network interface (fixed, behaviour change)](#d-037)

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
- **What was checked on 13 October 2026:** every `bun run` command in all handbook pages, including these guides, now has to name a script in `package.json` or a file that exists; this is enforced by `bun run docs:check` (`findCommandProblems`, tested in `tests/docs_check.test.ts`). 1,242 commands were checked and the only misses were three placeholders and one script that belongs to the separate `bun_webview` repository. So the **launch commands in the guides work as written**. This says nothing about the feature descriptions, counts, versions or "zero dependencies" claims, which remain unverified.
- **New finding:** running the generator (`bun run scripts/guides_generator/build_all_guides.ts`) changes four of the committed files (`README.md`, `01_sqlite_studio.md`, `08_data_converter_studio.md`, `31_rodents_revenge_deluxe.md`), so the committed guides are not exactly what the generator produces. The generated output was **not** committed (it would overwrite committed text without review); the generator was not changed.
- **Header claims audited on 13 October 2026** (macOS, static check of the source each guide's `app:` script starts, following relative imports; 42 guides had an `app:` launcher, the Redis guide has none): 
  - **"Dependencies: 0"**: the only non-built-in package any of those studios imports is `webview-bun` (the window host, so "0" means "no third-party libraries beyond the window host"). Guide 02 already says otherwise (`systeminformation`). A `tailwindcss` hit in Color Studio was text inside generated output, not an import.
  - **"Offline: 100%"**: **false for two guides**, fixed: *Subfinder* (guide 25) queries online OSINT services (crt.sh, HackerTarget, AlienVault, CertSpotter and others) and *Doggo* (guide 26) defaults to DNS-over-HTTPS via `cloudflare-dns.com`. Their header lines now say a network is needed, in both the guide and `scripts/guides_generator/cli_replacements.ts`; regenerating produces exactly the edited text for those two files. Other external URLs found in studio sources were sample text, links or an XML DTD identifier, not requests. This was **not** tested by running the studios without a network.
  - **"Version: 2.4.0" and similar**: no studio source contains these numbers, and `package.json` says `1.0.0`. They are **unsupported** and were left in place (changing them is a content decision for the owner).
  - Feature descriptions, counts and screenshots were **not** checked.
- **Advice:** use the verified pages ([Database Workbench guide](../databases/workbench.md), [application index](../reference/application-index.md), [visual designer](../visual-designer/index.md)) first; treat a guide's claims as marketing text until checked.

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

<a id="d-021"></a>
## D-021: A crafted layout could run code in an exported project (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** `exportProjectHelper` and the **Run** preview in `index.ts` pasted the form's `title`, `width` and `height` (and control ids and event names, in log lines) straight into generated TypeScript. A layout with `"width": "400, hint: 0 }; globalThis.X = 1; //"` ran that code when the exported project started (reproduced on the old code). A title containing a quote, backslash or line break made the generated file fail to parse. Since [Import](#d-018) accepts pasted JSON, an untrusted layout was enough.
- **Fix:** values go through `tsStringLiteral` (JSON string literal) and `safeDimension` (a positive whole number, else the default 800 by 600). The page title in the generated HTML is escaped.
- **Behaviour change:** a width or height that is not a positive number now becomes 800 or 600 instead of being pasted in.
- **Regression tests:** `tests/ide_html.test.ts` ("a crafted layout cannot inject code", seven attacks, run against the real generated app with a stand-in webview) and "Run: the live preview script".
- **Not covered:** see [D-024](#d-024) for the generated HTML.

<a id="d-022"></a>
## D-022: Exporting again silently overwrote the user's edits (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** exporting into a folder that already held an export rewrote `index.html`, `index.ts` and `package.json`. The exported `index.ts` is meant to be edited (the generated handlers only log), so a second export destroyed that work without a word.
- **Fix:** a file whose content would change is first renamed to `<name>.bak-<timestamp>`. An identical file is left alone. The result lists the backups and the designer's status line says how many were kept.
- **Not changed:** the export folder is still `exported_project` in the current folder, chosen without asking.
- **Tests:** `tests/ide_html.test.ts` ("Export keeps the user's edits").

<a id="d-023"></a>
## D-023: Run only worked when the designer was started from the project folder (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** the preview script written by **Run** imported the designer from `<current folder>/index.ts` and wrote `.rad_preview` into the current folder. Starting the designer from any other folder (for example through an installed `codecaine` command) made the preview fail to start. Found by a test that ran the preview from a temporary folder: `Cannot find module .../index.ts`.
- **Fix:** it imports from the designer's own location (`import.meta.dir`). The preview folder `.rad_preview` is still created in the current folder.
- **Verification:** a real preview process was started from an empty folder and stayed running (the window's contents were not inspected). Automated: `tests/ide_html.test.ts`.

<a id="d-024"></a>
## D-024: A layout can contain scripts, and control text is inserted as raw HTML (partly addressed)

- **Status:** Import now warns about scripts (13 October 2026). Escaping of control text is deliberately **not** changed.
- **What a layout is:** the designer has an *Event Handler Script Editor*. In `generatePreviewHtml` (`index.ts`) an event handler that is not a plain function name is pasted into the page as **script** (`codeToExec = clean`), in the **Run** preview and in exported projects. So a layout is code, by design. Control text is also inserted unescaped (for example `<button>${text}</button>`, `value="${text}"`), which raw-HTML and rich-text controls need.
- **Consequence:** escaping control text would not protect against a layout author, who can already write script handlers. The honest model is "importing a layout is like opening a project with scripts". The page can still call only the window bindings (`quitApp`, `closeWindow`, `openExternalUrl` and similar; `openExternalUrl` accepts only `http`, `https` and `mailto` links and starts them without a shell on macOS). The Windows branch (`cmd /c start`) was not assessed.
- **Change made:** **Import** counts handlers that are script (`countImportedScripts`) and, when there are any, asks "This layout contains N event handler script(s). They run as code when you use Run and in exported projects. Import it only if you trust where it came from. Import anyway?". Cancel leaves the form and the dialog unchanged (checked in a browser: declined, accepted, and a layout with only function names gets no prompt).
- **Not changed:** the JSON text is not scanned for scripts hidden in other fields, and the Run and Export buttons do not warn (the warning is at import, where the foreign text arrives). Layouts you build yourself never prompt.
- **Tests:** `tests/ide_html.test.ts` ("importing a layout that contains scripts").

<a id="d-025"></a>
## D-025: Generated preview files were tracked in git (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** `.rad_preview/preview.html` and `.rad_preview/preview.ts` were committed. The **Run** button rewrites them (with the machine's absolute path in `preview.ts`), so using Run in a checkout made the working tree dirty and the files could be committed by accident.
- **Fix:** the folder is untracked (`git rm --cached`) and listed in `.gitignore`. The files stay on disk.
- **Test:** `tests/ide_html.test.ts` ("Generated output is not tracked by git").

<a id="d-026"></a>
## D-026: Defects found by burning down type errors (fixed)

- **Status:** Fixed on 13 October 2026, while reducing `tsc` errors from 679 to 18. Most errors were typing noise; these were real:
  - **PostgreSQL Studio, SQL dump header:** `applications/postgres_studio_server.ts` wrote `-- Database: ${this.activeDb}`, but `PostgresManager` has no `activeDb`, so every dump said `-- Database: undefined`. It now writes the configured database name.
  - **PostgreSQL Studio, `POST /api/table/mutate` without `schema`:** the handler called `manager.getActiveSchema()`, which does not exist, so the request failed with an error. It now uses `manager.activeSchema`.
  - **Snake, Frogger and Tetris windows:** they passed `window: { title, resizable, minWidth, minHeight }` inside the `Size` argument of `new Webview(...)`, which ignores it, so the title and minimum size were never applied. The title is now set with `webview.title` (size stays `NONE`; minimum size is not supported by this call and was not restored).
  - **Demo 25 (all themes showcase):** two buttons called `w.showNotification(...)` and `w.centerOnScreen()`, which do not exist on `SimpleWindow` and would throw when clicked. They now call `w.toast(...)` and `w.center()`.
- **Not defects (verified at run time):** `Bun.TOML.stringify`, the `RedisClient` commands (`select`, `info`, `xadd`, ...) and `db.run(sql, a, b)` with spread bindings all work on Bun 1.4.2; only the installed type definitions lack or differ. They were given precise local types instead of casts. `allowPublicKeyRetrieval` for MySQL is still sent as before; whether the driver honours it was not tested (needs a MySQL server).
- **Tests:** the existing SQLite, Redis, rad and application tests pass after the changes. The two PostgreSQL fixes have regression tests that need no database (`tests/postgres_studio_regressions.test.ts`: a stubbed connection for the dump header, a closed port for the mutate route); the old code was run against the same checks and reproduced both bugs (`-- Database: undefined`; status 400 with `manager.getActiveSchema is not a function`). The Snake, Frogger and Tetris title fix and the demo fix have no automated test.
- **Also changed:** `applications/code_studio.ts` deletes folders with `rmSync(path, { recursive: true, force: true })` instead of the deprecated `rmdirSync(path, { recursive: true })`; behaviour is the same (checked with a non-empty folder).

<a id="d-027"></a>
## D-027: The unified `src/index.ts` exported some names as undefined (fixed)

- **Status:** Fixed on 13 October 2026, with a decision that can be reversed.
- **Observed:** `src/index.ts` does `export *` from `./simplecli/index.ts`, `./simplegui.ts` and `./features/rad/index.ts`. Different libraries define different things under the same names (`LRUCache`, `Logger`, `LogLevel`, `TreeNode`; `writeFileAtomic`, synchronous in SimpleGUI and asynchronous in `rad`). TypeScript reported the clash (5 errors) and at run time `import { LRUCache, Logger, LogLevel, writeFileAtomic } from "./src/index.ts"` gave `undefined`.
- **Decision:** because the names were `undefined`, nobody could rely on them, so defining them is additive. `src/index.ts` now re-exports them explicitly: `LRUCache`, `Logger`, `LogLevel`, `TreeNode` from SimpleCLI (the library exported first) and `writeFileAtomic` from SimpleGUI. The `rad` versions are unchanged and reachable through the module namespaces: `logutils.Logger`, `logutils.LogLevel`, `cacheutils.LRUCache`, `fileutils.writeFileAtomic`.
- **To reverse or change it:** edit the two `export { ... }` lines at the end of `src/index.ts`; `tests/hub_exports.test.ts` states the current choice.
- **Tests:** `tests/hub_exports.test.ts` (each name is defined and is the chosen definition; the alternatives stay reachable). The five type errors are gone.
- **Note:** a program that wants SimpleGUI's synchronous `writeFileAtomic` and the `rad` asynchronous one in the same file must use `fileutils.writeFileAtomic` for the latter.
<a id="d-028"></a>
## D-028: Documents disagreed on how many themes exist (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** the README and `docs/SIMPLEGUI_API.md` said 63 themes; `docs/THEMES.md` and `demos/25_vlang_all_themes_showcase.ts` said 76; the designer's theme drop-down has 51 choices.
- **Measured** (`src/simplegui.ts`): `getThemeNames()` returns **76** named themes, `SIMPLEGUI_THEMES` has 151 keys (names plus aliases), `listShortThemes()` returns 88 short names. Every one of the 76 names appears in `docs/THEMES.md`. The designer's 51-item list is a subset used for form colours (`getThemeColors` in `src/ide.html`).
- **Fix:** "63 themes" became "76 themes" in the README, `docs/SIMPLEGUI_API.md` and `docs/THEMES.md`, with their anchors; the link checker passes.
- **Not checked:** that each of the 76 themes looks as THEMES.md's screenshots show.

<a id="d-029"></a>
## D-029: A test-only package was a runtime dependency, with known advisories (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** `jsdom` was listed under `dependencies` in `package.json` but is imported only by tests (`tests/word_search_*.ts`, `tests/maze_generator_*.ts`, `tests/db/workbench_ui.*`). `scripts/build.ts` copies `dependencies` into `dist/package.json`, so anyone installing the built package would also get it. `bun audit` reported 11 advisories (3 high) through it: `undici` 7.29.0 and `source-map-js` 1.2.1.
- **Fix:** `bun remove jsdom` and `bun add -d jsdom@^29.1.1` (now in `devDependencies`), then `bun audit fix`. `bun audit` reports no vulnerabilities for the 46 packages; `bun audit --prod` none for the 3 runtime packages. The full test suite passed afterwards (1164 pass, 0 fail).
- **Behaviour change:** installing the built `dist/` package no longer installs `jsdom`.
- **Not done here:** `package-lock.json` (an npm lockfile, stale next to `bun.lock`) was handled later, see [D-033](#d-033).

<a id="d-030"></a>
## D-030: The committed command manifest depended on the author's launcher favourites (fixed)

- **Status:** Fixed on 13 October 2026.
- **Observed:** a final fresh-clone test run left `bin/manifest.json` modified (the entry `codecaine-sqlite-studio` sat at position 240 in the committed file and at 159 when generated in a clean clone), although only the order differed. The launcher's scan (`scanAllApplications`) sorts favourites first, then running apps, then by name, and `scripts/generate_brew_suite.ts` registered commands in that order, so the generated list, and any commit of it, depended on whose favourites and running apps were present. This is the real cause behind the remaining part of [D-006](#d-006).
- **Reproduced:** with a launcher history that favourites some studios, the generated command order changed (test failed on the old generator).
- **Fix:** the generator sorts the scanned apps by path before registering commands. `bin/manifest.json` was regenerated once (522 changed lines, order only: the same 256 commands).
- **Behaviour change:** commands in `bin/manifest.json` (and anything that lists them in manifest order) now appear in path order instead of favourites-first order.
- **Tests:** `tests/launcher_listing.test.ts` ("does not depend on the user's launcher history"). A full `bun test` in a fresh clone leaves `git status` clean, also when the launcher tests have created `.launcher_history.json`.
- **Not tested:** the "running apps" part of the ordering (a headless studio started by hand did not change the order in one trial, so the favourites path is the one proven).

<a id="d-031"></a>
## D-031: The designer had no visible keyboard focus and an unreachable palette (fixed)

- **Status:** Fixed on 13 October 2026 (the rest of the accessibility gaps are listed on [Accessibility](../accessibility.md)).
- **Observed (browser rendering of the designer page):** 133 clickable `div` elements, including every item of the component palette, could not be reached with the Tab key (`tabIndex` below zero, no role); three CSS rules removed the focus outline and nothing replaced it, so a focused button showed nothing.
- **Fix:** a `:focus-visible` outline rule, and `makeClickablesKeyboardOperable` at start-up, which gives those elements `tabindex="0"`, `role="button"` and an `aria-label` from their tooltip, and activates them with Enter or Space. Existing `tabindex` and `role` values are kept; real buttons are untouched.
- **Behaviour change:** the Tab order now includes about 133 more stops, so reaching the canvas controls by Tab takes more key presses.
- **Verified:** live with real key presses (visible outline on Tab; Enter arms placement; Escape cancels) and by tests (`tests/ide_html.test.ts`, "Designer: keyboard access", which fail on the old page).
- **Not fixed at the time:** placing and resizing needed a mouse (moving with the arrow keys already worked; this entry originally said otherwise). See [D-035](#d-035).

<a id="d-032"></a>
## D-032: Tests silently depended on the author's machine; the first GitHub run had 14 failures (fixed)

- **Status:** Fixed on 13 October 2026 (the re-run on GitHub is recorded on the [Testing](../testing/index.md#continuous-integration) page).
- **Observed:** the first run of `.github/workflows/ci.yml` on GitHub's macOS runner (run 38482567102) passed install, type check, dependency audit and the documentation check, and the test step ended with 1157 pass, 153 skip, **14 fail**. Everything had passed in fresh local clones, which are not the same environment. The causes:
  1. **Ten Redis tests** need a Redis server. This machine had one running on port 6379, so they always passed here. They also seed data and run `FLUSHDB` on databases 14 and 15 of whatever Redis is on `127.0.0.1:6379`, which breaks the project's own rule that tests never touch a user's real databases (the MySQL and PostgreSQL suites already require an explicit opt-in).
  2. **Two launcher tests** open a real macOS Terminal window; a CI runner has no desktop (5 s timeout each). On a developer's Mac they also open Terminal windows during the test run.
  3. **Two slow tests** (system information queries, and a network scan with real sockets) took longer than Bun's 5 s default on the loaded runner.
- **Fix:** the Redis tests run only when `TEST_REDIS_URL` names a reachable Redis (`tests/helpers/redis.ts`, same idea as `TEST_MYSQL_URL`; otherwise they are skipped). CI installs Redis with Homebrew and starts it on port 6390 with persistence off, so those tests really run there. The two real-Terminal tests skip when the `CI` variable is set; the two slow tests have a 30 s timeout with their assertions unchanged.
- **Behaviour change for contributors:** `bun test` no longer runs the Redis tests by default (18 skipped). To run them: `TEST_REDIS_URL=redis://127.0.0.1:6379 bun test`, against a throwaway server only.
- **Verified:** in a fresh clone with `CI=true` and a dedicated Redis on port 6390: 1174 pass, 0 fail. The Redis helper was also checked with no variable (skipped) and with a dead port (skipped).
- **Third run (run 38483779266), a docs-only push, failed:** test 12 (Network Forensics Studio) timed out at the new 30 s limit after passing in the previous run. Reading it showed it performs **real DNS lookups and a port scan**, so its duration depends on the network, not on the code. Giving it a longer timeout was the wrong fix. It is now split: test 12 checks the page and that the handlers exist; test 12b runs the real scan and lookups and is **opt-in** (`TEST_NETWORK=1`). The four live-DNS tests of `src/features/doggo/doggo.test.ts` (example.com, 8.8.8.8, Cloudflare DoH) had the same dependency and the same opt-in. Both pass with `TEST_NETWORK=1` on the author's machine. A search of `tests/` and `src/` found no other tests that fetch external hosts.

<a id="d-033"></a>
## D-033: A stale package-lock.json broke `npm ci` (removed)

- **Status:** Fixed on 13 October 2026 (reversible with `git revert`).
- **Observed:** the tracked `package-lock.json` was last changed long before the project moved to Bun's `bun.lock`. It listed `jsdom` as a runtime dependency and did not list `systeminformation` at all. `npm ci --dry-run` failed with "Missing: systeminformation@5.33.15 from lock file". Nothing in the repository (scripts, workflow, formulas, docs) referenced the file.
- **Decision:** the project is installed and tested with Bun (`bun install --frozen-lockfile`, CI included), so the file was removed and added to `.gitignore` so an accidental `npm install` does not recreate a lockfile that will go stale again.
- **Behaviour change:** installing with npm is not supported or tested; use Bun ([Requirements](../getting-started/requirements.md)). `bun.lock` is the lockfile.
- **Also:** `actions/checkout` in the CI workflow was updated from v4 to v7 to clear GitHub's Node 20 deprecation warning; the next run confirms it works (see [Testing](../testing/index.md#continuous-integration)).

- **Extra skip on CI explained:** the code-generation test "Generated programs run on native SQLite > V: compiles and runs" skips when the V compiler is not installed. The runner has none and the author's Mac does, which is the one-test difference between 152 and 153 skips (before the opt-ins).

<a id="d-034"></a>
## D-034: Fourteen game servers were copies of the same code (refactored)

- **Status:** Refactored on 13 October 2026. **This is a refactor: no behaviour change is intended.**
- **Observed:** the `start<Name>Server` function in 15 studios was 98 to 100 percent identical (73 lines each). The earlier loopback-guard fix ([D-012](#d-012), [D-013](#d-013)) had to be made in 27 files by script. Only four values differed: the app id, display name and version in `/api/health`, and which HTML generator and assets folder each used.
- **Change:** a new `src/studio_server.ts` (`startStaticStudioServer`) holds the code once. 14 studios (`balatro`, `blackjack`, `breakout`, `codecaine_bros`, `dr_codecaine`, `flappy_bird`, `math_munchers`, `minesweeper`, `pacman`, `poker`, `rat_screw`, `rodents_revenge`, `skifree`, `yahtzee`) now call it with those four values. Each was converted **only after a script proved its old function identical to the reference** once those values were masked; 924 lines were removed (70 added).
- **Left alone on purpose:** studios whose server differs in real ways (Pong, Connect 4, Tic-Tac-Toe, Lolo, Paint, Word Search, World Time Zones, Interval Timer, Maze Generator, Calculator, Code Studio, Fd, Rip and the database studios) still have their own server code.
- **Unchanged on purpose:** the wildcard `Access-Control-Allow-Origin: *` header stays, because it was part of the copied behaviour; the loopback guard is what actually refuses foreign pages.
- **Checked:** the existing per-game tests, the smoke test (all 32 headless studios still start and serve a page) and the local-only rules pass; `tests/studio_server.test.ts` tests the shared server directly (page rendered per request, health identity, favicon and nested files, 404, raw path-traversal requests, foreign Origin and Host get 403, OPTIONS, loopback bind). The local-only static rule now scans `src/studio_server.ts` too and was shown to fail when the guard is removed from it.
- **Not checked:** the native windows of these 14 games.

<a id="d-035"></a>
## D-035: Placing and resizing controls needed a mouse (fixed, behaviour change)

- **Status:** Fixed on 13 October 2026. Follow-up to [D-031](#d-031).
- **Observed:** Enter on a palette item only armed placement (a canvas click was still needed) and nothing resized a control from the keyboard. Arrow keys already moved the selection.
- **Change (behaviour, not a refactor):** `placeControlWithKeyboard` drops the armed control at x = 16 below the lowest control (kept inside the form) and selects it; Enter/Space on a palette item now calls it. `resizeSelectedControlsBy` backs **Alt + arrows** (1 px, Alt + Shift 8 px, minimum 8 px, locked controls skipped). Both appear in the Keys dialog. Mouse placement and resizing are unchanged (`spawnControl` still only arms placement).
- **Verified:** live with real key presses in a browser (Tab to Button, Enter, Tab to Label, Enter, arrows, Alt + arrows, Cmd+Z undo) and by tests in `tests/ide_html.test.ts` ("Designer: placing and resizing without a mouse").
- **Follow-up (same day): the Tree tab rows were not keyboard reachable.** They are created after start-up, so `makeClickablesKeyboardOperable` never saw them. `renderTree` now gives each row `tabindex="0"`, `role="button"`, an `aria-label`, `aria-pressed`, and Enter/Space selection that returns focus to the row after the tree is rebuilt. Verified live (Tab, Enter, Space, then an arrow key moved the selected control) and by tests ("component tree rows are keyboard operable", failing on the old page).
- **Not checked:** the native window; screen-reader announcements; the native component dropdown by keyboard; multi-select by keyboard.

<a id="d-036"></a>
## D-036: Dialogs ignored focus and let shortcuts edit the form behind them (fixed)

- **Status:** Fixed on 13 October 2026 (behaviour change in `src/ide.html`).
- **Observed (code reading, then live):** the four dialogs (Import, Keys, Audit, event editor) were opened by setting `display: flex`. Focus was not moved in or returned; Tab could leave the dialog; Escape closed only Keys and Import, and only when the cursor was not in a text box; and the global key handler did not know a dialog was open, so **Delete, Backspace, arrow keys and Cmd+Z acted on the controls behind the dialog**. (The last point was read from the code; the old page was not driven live to lose a control.)
- **Change:** `showDialog` / `hideDialog` (used by all eight show/hide functions), a capture-phase key handler (Escape closes the open dialog, Tab is kept inside it), `role="dialog"`, `aria-modal="true"` and an `aria-label` from each dialog's title, and an early return in the global handler while a dialog is open. Window-level shortcuts handled earlier in that handler (double-Alt, F5/reload block, centre window, zoom) are unchanged.
- **Verified:** live with real key presses (Enter on the Keys button opens it, focus lands inside, six Tabs stay inside, Delete leaves the 2 controls alone, Escape closes it and focus returns to the button; Import: typing and Backspace work in the text box, Shift+Tab/Tab wrap, Escape from the text box closes it) and by six tests that fail on the old page.
- **Not checked:** the native window; a screen reader; the event editor dialog was covered by tests and shared code but not opened live; clicking the dark backdrop still does not close a dialog (unchanged).

<a id="d-037"></a>
## D-037: Library server helpers listened on every network interface (fixed, behaviour change)

- **Status:** Fixed on 13 October 2026. Follow-up to [D-013](#d-013), which covered the studios; this covers the reusable helpers and port probes that the earlier checks did not reach.
- **Observed (found by scanning every `Bun.serve(` call for a `hostname`, then grepping for `0.0.0.0`):**
  - `serveStatic` and `createWsHub` in `src/features/rad/modules/serverutils.ts` passed no `hostname`, so Bun listened on **all interfaces**; `serveStatic` publishes any directory you give it.
  - `Sys.serve` (`src/simplecli/sys/index.ts`) defaulted `hostname` to `'0.0.0.0'` explicitly, and `Sys.serveStatic` (and its `SimpleCLI.serveStatic` wrapper) passed none.
  - The free-port probe in the Snake, Frogger and Tetris studios started a throwaway server without a `hostname` (all interfaces, for an instant, answering "ok").
  - Nothing in this repository calls `Sys.serve`, `Sys.serveStatic` or `serveStatic`; one test calls `createWsHub()`.
- **Change (behaviour, not a refactor):** all of the above now default to `127.0.0.1`. `serveStatic`, `createWsHub` and `Sys.serveStatic` gained an optional `hostname` (`Sys.serve` already had one) so exposing a server is a deliberate choice. **Anyone outside this repository who relied on the old network-wide default must now pass `hostname: "0.0.0.0"`.** The probes bind `127.0.0.1`, matching the servers they probe for.
- **Why `127.0.0.1` and not `"localhost"`:** measured on this machine, Bun binds `"localhost"` to `::1` only, so a client using `127.0.0.1` could not connect; binding `127.0.0.1` answers both `127.0.0.1` and `localhost` URLs. `serveHttp` still defaults to `"localhost"` (unchanged, not investigated further).
- **Guard against regression:** `tests/studio_servers_local_only.test.ts` now scans `applications/` and `src/` and fails when any `Bun.serve(` call has no `hostname` (shown to fail when the Snake fix was reverted). It cannot see `(Bun as any).serve(`, so `tests/library_servers_local_default.test.ts` tests the helpers' defaults and the explicit option directly (the old code fails those tests).
- **Not checked:** the native windows of the three games; behaviour on Windows and Linux; whether `serveHttp`'s `"localhost"` default has the same IPv6-only effect elsewhere.
