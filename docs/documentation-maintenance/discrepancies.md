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

- **Status:** Open.
- **Observed:** after a full `bun test`, `bin/manifest.json` was modified and two new files appeared in `bin/` (`codecaine-sqlite-studio-macros`, `codecaine-studio-codegen`). Which test writes them was not investigated.

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

- **Status:** Open (documented in [Reference: environment variables](../reference/index.md#environment-variables)).
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
