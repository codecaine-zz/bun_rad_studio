# Developer handbook

For people who change the code. Commands in this page were run on **13 October 2026** (macOS, Bun 1.4.2) unless marked *not run*. For how the pieces fit together read [Architecture](architecture.md) first; for words see the [glossary](../glossary.md).

## Contents

- [Set up](#set-up)
- [Everyday commands](#everyday-commands)
- [Repository layout](#repository-layout)
- [Before you commit](#before-you-commit)
- [Debugging](#debugging)
- [Add an application](#add-an-application)
- [Extend the designer](#extend-the-designer)
- [Code generation](#code-generation)
- [Rules the tests enforce](#rules-the-tests-enforce)
- [Documentation](#documentation)
- [Compatibility and releases](#compatibility-and-releases)
- [See also](#see-also)

## Set up

```
git clone <repository-url> bun_rad_studio
cd bun_rad_studio
bun install --frozen-lockfile
bun test
```

Requirements are on [Requirements](../getting-started/requirements.md). `--frozen-lockfile` fails if `bun.lock` and `package.json` disagree, which is what CI does. The live MySQL and PostgreSQL tests are skipped unless you provide a disposable server ([Database tests](../testing/database-tests.md)); about 152 tests skip without one.

## Everyday commands

| Command | What it does | Time |
|---|---|---|
| `bun start` | Opens the visual designer | n/a |
| `bun run app:<name>` | Opens one studio (names in the [script index](../reference/script-index.md)) | n/a |
| `bun run applications/<file>.ts --server` | Runs a studio without a window and prints `READY:<port>` (not every studio supports it: see the [application index](../reference/application-index.md#studios)) | n/a |
| `bun run test` (or `bun test --timeout 30000`, what CI runs) | All tests (1,285 at the time of writing, about 85 s) | ~85 s |
| `bun test tests/<file>.test.ts` | One test file | seconds |
| `bun test tests/<file>.test.ts -t "part of a test name"` | One test | seconds |
| `bun run typecheck` | TypeScript errors per file against `scripts/typecheck_baseline.json`; fails only when a file gets worse | ~4 s |
| `bun run typecheck -- --update` | Records the current counts (do this after **fixing** errors) | ~4 s |
| `bun run ide:build` | Joins `src/ide/*` into `src/ide.html`. Run it after every edit to a part | seconds |
| `bun run ide:check` | Fails if `src/ide.html` is not exactly what the parts produce (also run by `tests/ide_build.test.ts` and CI) | seconds |
| `bun run docs:build` | Regenerates the table of contents, application and script indexes, coverage matrix | seconds |
| `bun run docs:check` | Fails on a stale generated page, a broken link or anchor, an unlisted page, an unclosed code fence, a secret-looking string or a `bun run` example whose script or file does not exist | seconds |
| `bun run build` | Bundles the library into `dist/` (git-ignored) | seconds |
| `bun run scripts/generate_brew_suite.ts` | Regenerates the `bin/codecaine-*` wrappers and `bin/manifest.json` | seconds |

## Repository layout

| Path | What is in it |
|---|---|
| `index.ts` | The visual designer's backend and the native window helpers; exports `exportProjectHelper`, `runPreviewHelper`, `generatePreviewHtml` |
| `src/ide/` | The designer's page **in numbered parts**: `00_head_and_styles.html`, `05_body_markup.html`, 20 script parts (`10_state.js` … `180_run.js`) and `999_end.html`. **Edit these** |
| `src/ide.html` | The designer's page as one file, **built from `src/ide/`** (`bun run ide:build`) and committed because other code reads it as a plain file. Do not edit it by hand |
| `src/simplegui.ts` and friends | Build windows from code |
| `src/db/` | The Database Workbench |
| `src/localGuard.ts` | Loopback guard for local servers |
| `src/features/`, `src/*_tools.ts` | Logic shared by a studio and its command-line twin |
| `applications/` | Studios and their helper files |
| `cli_apps/` | Command-line tools (scripts that run when started) |
| `demos/` | Examples of SimpleGUI |
| `resources/<name>/` | HTML, assets and sounds for the studios that are mostly web pages |
| `tests/` | `bun:test` files, `tests/db/` for the database layer, `tests/helpers/` for shared helpers |
| `scripts/` | Build, wrapper generation, documentation tools, the type-check ratchet, screenshot capture scripts |
| `docs/` | This handbook (`docs/nav.json` is its single navigation source) |
| `Formula/` | The Homebrew formula (`bin/` command wrappers are generated on `bun install` and git-ignored) |
| `bin/`, `dist/`, `node_modules/`, `exported_project/`, `.rad_preview/` | Generated; git-ignored |

## Before you commit

1. `bun test` passes (or you can name the failing test and say it was already failing).
2. `bun run typecheck` passes. If you touched the designer page, you edited `src/ide/` and ran `bun run ide:build` (`bun run ide:check` passes).
3. `bun run docs:build` has been run and its output is committed, then `bun run docs:check` passes.
4. `git status` shows only files you meant to change. A full `bun test` run leaves the tree clean ([D-006](../documentation-maintenance/discrepancies.md#d-006)).
5. If you changed behavior, the page that describes it and its row in `docs/documentation-maintenance/features.json` say what was verified and how. See the [contributor checklist](../documentation-maintenance/contributor-checklist.md).
6. Refactoring and behavior changes are separate commits where practical, and a behavior change says so in the commit message and in [discrepancies](../documentation-maintenance/discrepancies.md) when it fixes a defect.

CI (`.github/workflows/ci.yml`) runs steps 1 to 3 on macOS for every push and pull request, and it passes on GitHub ([Testing](../testing/index.md#continuous-integration)). Its first run failed 14 tests that had passed locally ([D-032](../documentation-maintenance/discrepancies.md#d-032)): check that your change does not depend on something only your machine has (a running server, a desktop, speed).

## Debugging

- **Run a studio without a window**, then open the printed address in a browser, where the browser's developer tools work: `bun run applications/pong_studio.ts --server`.
- **Look at the designer page in a browser**: `getIdeHtml()` in `index.ts` returns the exact page; serve it from a throwaway local server bound to `127.0.0.1` (this is how the designer defects in D-016 and D-017 were found).
- **A page script that "does nothing"**: extract the inline script and run `node --check` on it. A literal closing script tag inside a JavaScript string ends the script early ([D-016](../documentation-maintenance/discrepancies.md#d-016)).
- **A server refuses your request with 403**: it is the [loopback guard](../glossary.md#loopback-guard). Send no `Origin` header (plain `curl` does not) or use the server's own address.
- **A module that crashes when imported**: `bun -e 'await import("/full/path/to/file.ts")'`. The smoke test does this for every application.
- **Type errors**: `node_modules/.bin/tsc --noEmit -p .` prints them; only the count per file is enforced.
- **A test that passes only on your machine**: run the suite in a fresh clone (`git clone . /tmp/x && cd /tmp/x && bun install --frozen-lockfile && bun test`). That is how [D-020](../documentation-maintenance/discrepancies.md#d-020) was found.

## Add an application

This recipe was followed with a throwaway file and checked against the automated rules; the steps marked *not run* were not.

1. **Create `applications/<name>_studio.ts`.** Export the things tests need (for a web-page studio: `get<Name>AssetsDir`, `generate<Name>Html`, `start<Name>Server`, `create<Name>`; copy a small one such as `applications/pong_studio.ts`). Put everything that starts a window or a server under `if (import.meta.main)`.
2. **If it serves one page plus assets**, do not write a server: call `startStaticStudioServer({ app, name, version, assetsDir, generateHtml }, options)` from `src/studio_server.ts` (see `applications/balatro_studio.ts`). It binds to `127.0.0.1`, applies the loopback guard and serves `/`, `/api/health` and the files in `assetsDir`. **If you need your own server:** bind to `127.0.0.1`, call `guardLocalRequest(req)` first in `fetch` and return its result when it is not `null`. Either way, print `READY:<port>` when started with `--server` and take the port from `--port` or `PORT` (0 means any free port).
3. **Put web assets in `resources/<name>/`** if it is mostly a page.
4. **Add a `package.json` script** `app:<short>` (for example `"app:pong": "bun run applications/pong_studio.ts"`).
5. **Give the launcher a description:** without an entry in `KNOWN_STUDIO_META` (`applications/launcher_studio.ts`) the launcher shows the file name as the title, the category "RAD Studio" and a generic description. Add an entry for a proper title, category and description. The generated application index falls back to the first comment at the top of the file.
6. **Regenerate the wrappers** with `bun run scripts/generate_brew_suite.ts` (also run automatically by `bun install`).
7. **Add tests** for the behavior (see `tests/breakout_studio.test.ts` for the style).
8. **Give it tooltips** (a non-game app) or **name it in `GAME_APPS`** (a game), see [Help tooltips](#help-tooltips-for-every-app); take its screenshot and run `bun run showcase`.
9. **Run `bun run docs:build`** so the application index lists it, and add a row to `features.json` if it is a feature worth tracking.

What the existing checks do for you (observed with the throwaway app):

| A new file under `applications/` that... | Result |
|---|---|
| has `Bun.serve({` but never **calls** `guardLocalRequest(` | `tests/studio_servers_local_only.test.ts` fails and names the file (an unused import is not enough) |
| has `Bun.serve({` and binds `"0.0.0.0"` | the same test fails |
| throws when imported | `tests/applications_smoke.test.ts` fails |
| prints `READY:<port>` but does not answer `GET /` with HTML | the smoke test fails |
| is a library, not a program (no `import.meta.main`) | `tests/launcher_listing.test.ts` fails, unless the file is listed in `NON_APP_MODULES` |

## Extend the designer

Adding a **control type** touches these places (found by following `kanban_board` through the source; the end-to-end steps were *not run* for a brand-new type):

| Place | What to add |
|---|---|
| `src/ide/05_body_markup.html`, palette | A `palette-item` with `onclick="spawnControl('<type>')"` |
| `src/ide/80_palette_and_placement.js`, `placeControlAt` | Default width and height for the type, and whether its background is transparent |
| `src/ide/110_canvas_render.js`, canvas renderer (`renderControlContent`, `renderCanvas`) | How the control looks in the designer |
| `src/ide/130_code_generation_and_export.js` and `170_framework_code.js`, code generators | Its output in the Bun TS, HTML, React, Vue and Python tabs |
| `index.ts`, `generatePreviewHtml` | How the exported and preview page renders it (escape anything that goes into an attribute or script) |
| `docs/API.md` | A row in the supported-control table |
| `src/simplegui.ts` | Optionally an `add<Type>` method so code can create the same control |

After changing the page, run `bun test tests/ide_html.test.ts`. It checks that every inline script parses, that dialogs are not nested inside one another, the import rules, the theme contrast and the exported project.

## Code generation

Generated text must be treated as untrusted-input territory:

- Put values into generated TypeScript with `tsStringLiteral` and numbers with `safeDimension` (`index.ts`). Never paste a spec value between quotes by hand ([D-021](../documentation-maintenance/discrepancies.md#d-021)).
- A template literal inside a template literal needs its inner backticks and `${` escaped ([D-011](../documentation-maintenance/discrepancies.md#d-011)).
- Test generated output by **parsing or running it**, not by checking that a string appears: `new Bun.Transpiler({ loader: "ts" }).transformSync(source)`, or run it with a stand-in `webview-bun` as `tests/ide_html.test.ts` does.
- Write generated files with `writeGeneratedFile` so a user's edited copy is kept as a backup ([D-022](../documentation-maintenance/discrepancies.md#d-022)).

## Help tooltips for every app

Every window that is not a game shows a tooltip over each button, field, select and tab, saying what it does. One script (`src/shared/helpEngine.ts`, added to the page by `injectHelp` in `src/shared/helpTips.ts`) does the showing; the **words** live in one dictionary per app, `src/shared/help/<id>.ts`, registered in `src/shared/help/index.ts` (about 2,200 tips in 38 dictionaries). Hover for about half a second, or move to a control with the keyboard, and the tip appears; Escape hides it. A control that has a `title` but no dictionary entry uses its `title` as the tip (the native tooltip is turned off so there is only one). To switch hints off in a window, run `localStorage.studioHints = "off"` in its page and reload.

A dictionary maps a key to a sentence. The first matching key wins: `#id`, `aria:Label`, `text:Label` (case, spacing and leading icons ignored, so write `text:Audit & Validate` for the button "⚡ Audit & Validate"), `text^:Start` (the text begins with this), `ph:Placeholder`, `name:field`, `.class`. A checkbox or radio button is named by the label around it. A dictionary may also export `xxxSkip` rules for controls that need no tip (digits on the calculator), each with a required `why`.

- **Writing or checking a dictionary:** `bun run scripts/help_controls.ts <app file> --missing` lists the controls that have no tip yet (`--missing` omitted lists all with their tips). It reads the page the app would show, so it also tells you the dictionary id (some apps share a page, and `database_studio` and `task_manager` have their own ids).
- **A new app that is not a game** gets a dictionary (copy `env_studio.ts`) and its page generator must return `injectHelp(html, "<id>")` (SimpleGUI windows do it themselves through their `appId`, or `helpId` when it must differ). **A new game** must be added to `GAME_APPS` in `src/shared/helpPages.ts`; otherwise `tests/help_tips.test.ts` fails and names it.
- **The rules the test checks:** every control in every non-game app's page has a tip or a documented skip; each tip is 12 to 360 characters, plain text, and is not just its label repeated.
- **What it cannot see:** controls a page's script builds later are tipped (the engine watches for new nodes) but only if their dictionary key matches; the test sees only the HTML a page starts with. Plain `div`s used as buttons are not tipped, except the database studios' `.tab-btn` tabs.

## Screenshots and the showcase page

`bun run showcase` builds `SHOWCASE.md` (a picture-led page for promoting the applications) from `screenshots/apps/*_desktop.png` and the launcher's descriptions; `bun run showcase:check` and `tests/showcase.test.ts` fail when it is stale or a picture is missing. `scripts/capture_app_screenshots.ts` takes the screenshots of most apps; `scripts/capture_extra_screenshots.ts` takes the rest (Code Studio, Paint, PostgreSQL, RAD Studio, Subprocess Pipe, the games that serve their own folder, and the File Manager, which it starts on a throw-away sample home folder and drives through Chrome's DevTools protocol to show a preview, the Convert window and the terminal). Both need Google Chrome (`CHROME_BIN` overrides the path).

## Rules the tests enforce

| Rule | Test |
|---|---|
| Every studio server uses the loopback guard and binds to loopback | `tests/studio_servers_local_only.test.ts`, `tests/standalone_server_binding.test.ts` |
| Every application module imports cleanly; every headless studio serves a page | `tests/applications_smoke.test.ts` |
| The launcher lists only real programs; no wrapper wraps a library | `tests/launcher_listing.test.ts` |
| The designer page parses and its dialogs are siblings | `tests/ide_html.test.ts` |
| `src/ide.html` is exactly what `src/ide/` builds to; parts are ordered by number; a hand edit is caught | `tests/ide_build.test.ts`, `bun run ide:check` |
| Every non-game app has help tooltips for all its controls; a new game must be named in `GAME_APPS` | `tests/help_tips.test.ts` |
| `SHOWCASE.md` is exactly what the screenshots and descriptions build to | `tests/showcase.test.ts`, `bun run showcase:check` |
| Type errors per file never grow | `bun run typecheck` |
| Documentation links, anchors, navigation and generated pages are current | `bun run docs:check` (also run by `tests/docs_check.test.ts`) |

## Documentation

- One authoritative page per subject; link to it instead of copying steps ([style guide](../documentation-maintenance/style-guide.md)).
- Add a page to `docs/nav.json`, run `bun run docs:build`, then `bun run docs:check`.
- Say how you know: run it, or label it *source only* or *not run*. Never describe a planned feature as available.
- New terms go in the [glossary](../glossary.md).

## Compatibility and releases

- No saved file format is versioned ([Data and files](../reference/data-and-files.md#file-formats-and-compatibility)); do not change one silently.
- A behavior change that users could notice is listed in [discrepancies](../documentation-maintenance/discrepancies.md) with a "Behavior change" line, and a migration note if needed.
- Releases for every platform and the Mac `.app` bundles are built by `bun run release:build` and `bun run build:mac-apps`; see [Building releases](releasing.md) for what was and was not verified. The Homebrew steps were not verified end to end. Before tagging anything, run the CI commands in a fresh clone.

## See also

- [Architecture](architecture.md)
- [Testing](../testing/index.md)
- [Performance baseline](../performance.md)
- [Contributor checklist](../documentation-maintenance/contributor-checklist.md)
- [Baseline and risks](../documentation-maintenance/baseline-and-risks.md)
