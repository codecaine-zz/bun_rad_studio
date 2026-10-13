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
| `bun test` | All tests (1,285 at the time of writing, about 85 s) | ~85 s |
| `bun test tests/<file>.test.ts` | One test file | seconds |
| `bun test tests/<file>.test.ts -t "part of a test name"` | One test | seconds |
| `bun run typecheck` | TypeScript errors per file against `scripts/typecheck_baseline.json`; fails only when a file gets worse | ~4 s |
| `bun run typecheck -- --update` | Records the current counts (do this after **fixing** errors) | ~4 s |
| `bun run docs:build` | Regenerates the table of contents, application and script indexes, coverage matrix | seconds |
| `bun run docs:check` | Fails on a stale generated page, a broken link or anchor, an unlisted page, an unclosed code fence, a secret-looking string or a `bun run` example whose script or file does not exist | seconds |
| `bun run build` | Bundles the library into `dist/` (git-ignored) | seconds |
| `bun run scripts/generate_brew_suite.ts` | Regenerates the `bin/codecaine-*` wrappers and `bin/manifest.json` | seconds |

## Repository layout

| Path | What is in it |
|---|---|
| `index.ts` | The visual designer's backend and the native window helpers; exports `exportProjectHelper`, `runPreviewHelper`, `generatePreviewHtml` |
| `src/ide.html` | The designer's page (markup, style and script in one file) |
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
| `bin/`, `Formula/` | Generated command wrappers (tracked) and the Homebrew formula |
| `dist/`, `node_modules/`, `exported_project/`, `.rad_preview/` | Generated; git-ignored |

## Before you commit

1. `bun test` passes (or you can name the failing test and say it was already failing).
2. `bun run typecheck` passes.
3. `bun run docs:build` has been run and its output is committed, then `bun run docs:check` passes.
4. `git status` shows only files you meant to change. A full `bun test` run leaves the tree clean ([D-006](../documentation-maintenance/discrepancies.md#d-006)).
5. If you changed behaviour, the page that describes it and its row in `docs/documentation-maintenance/features.json` say what was verified and how. See the [contributor checklist](../documentation-maintenance/contributor-checklist.md).
6. Refactoring and behaviour changes are separate commits where practical, and a behaviour change says so in the commit message and in [discrepancies](../documentation-maintenance/discrepancies.md) when it fixes a defect.

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
2. **If it serves pages:** bind to `127.0.0.1`, call `guardLocalRequest(req)` first in `fetch` and return its result when it is not `null`, print `READY:<port>` when started with `--server`, and take the port from `--port` or `PORT` (0 means any free port). Do not answer with `Access-Control-Allow-Origin: *`.
3. **Put web assets in `resources/<name>/`** if it is mostly a page.
4. **Add a `package.json` script** `app:<short>` (for example `"app:pong": "bun run applications/pong_studio.ts"`).
5. **Give the launcher a description:** without an entry in `KNOWN_STUDIO_META` (`applications/launcher_studio.ts`) the launcher shows the file name as the title, the category "RAD Studio" and a generic description. Add an entry for a proper title, category and description. The generated application index falls back to the first comment at the top of the file.
6. **Regenerate the wrappers** with `bun run scripts/generate_brew_suite.ts` and commit `bin/` changes.
7. **Add tests** for the behaviour (see `tests/breakout_studio.test.ts` for the style).
8. **Run `bun run docs:build`** so the application index lists it, and add a row to `features.json` if it is a feature worth tracking.

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
| `src/ide.html`, palette | A `palette-item` with `onclick="spawnControl('<type>')"` |
| `src/ide.html`, `placeControlAt` | Default width and height for the type, and whether its background is transparent |
| `src/ide.html`, canvas renderer | How the control looks in the designer |
| `src/ide.html`, code generators | Its output in the Bun TS, HTML, React, Vue and Python tabs |
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

## Rules the tests enforce

| Rule | Test |
|---|---|
| Every studio server uses the loopback guard and binds to loopback | `tests/studio_servers_local_only.test.ts`, `tests/standalone_server_binding.test.ts` |
| Every application module imports cleanly; every headless studio serves a page | `tests/applications_smoke.test.ts` |
| The launcher lists only real programs; no wrapper wraps a library | `tests/launcher_listing.test.ts` |
| The designer page parses and its dialogs are siblings | `tests/ide_html.test.ts` |
| Type errors per file never grow | `bun run typecheck` |
| Documentation links, anchors, navigation and generated pages are current | `bun run docs:check` (also run by `tests/docs_check.test.ts`) |

## Documentation

- One authoritative page per subject; link to it instead of copying steps ([style guide](../documentation-maintenance/style-guide.md)).
- Add a page to `docs/nav.json`, run `bun run docs:build`, then `bun run docs:check`.
- Say how you know: run it, or label it *source only* or *not run*. Never describe a planned feature as available.
- New terms go in the [glossary](../glossary.md).

## Compatibility and releases

- No saved file format is versioned ([Data and files](../reference/data-and-files.md#file-formats-and-compatibility)); do not change one silently.
- A behaviour change that users could notice is listed in [discrepancies](../documentation-maintenance/discrepancies.md) with a "Behaviour change" line, and a migration note if needed.
- There is no release process in the repository besides `bun run build` and the Homebrew scripts; the Homebrew steps were not verified end to end. Before tagging anything, run the CI commands in a fresh clone.

## See also

- [Architecture](architecture.md)
- [Testing](../testing/index.md)
- [Performance baseline](../performance.md)
- [Contributor checklist](../documentation-maintenance/contributor-checklist.md)
- [Baseline and risks](../documentation-maintenance/baseline-and-risks.md)
