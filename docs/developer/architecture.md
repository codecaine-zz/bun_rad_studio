# Architecture

How the parts of Bun RAD Studio fit together: what each part is responsible for, how data moves between them, and where the boundaries (and the trust boundaries) are. Everything here was read from the source on 13 October 2026; statements about running behaviour say what was run. For the vocabulary see the [glossary](../glossary.md); for how to work on the code see the [developer handbook](handbook.md).

## Contents

- [The big picture](#the-big-picture)
- [Components and responsibilities](#components-and-responsibilities)
- [How a studio is built](#how-a-studio-is-built)
- [Data flow](#data-flow)
- [Trust boundaries](#trust-boundaries)
- [Persistent data](#persistent-data)
- [Size and shape of the code](#size-and-shape-of-the-code)
- [Known structural problems](#known-structural-problems)

## The big picture

Every program is a Bun script that opens a native window (through the `webview-bun` package) and shows a web page in it. The page is either built from code (SimpleGUI), loaded from a folder of HTML (`resources/`), or served by a small local web server that the program starts itself.

```
                 ┌──────────────────────────────────────────────┐
                 │  Bun (TypeScript runtime, tests, installer)   │
                 └──────────────────────────────────────────────┘
                                      │ runs
   ┌────────────────┬─────────────────┼───────────────────┬──────────────────┐
   │ index.ts        │ applications/   │ cli_apps/          │ demos/           │
   │ visual designer │ 65 studios the  │ 78 command-line    │ 27 examples      │
   │ + window helpers│ launcher lists  │ tools (no window)  │ of SimpleGUI     │
   └───────┬────────┴───────┬─────────┴─────────┬─────────┴────────┬─────────┘
           │ uses           │ uses              │ uses             │ uses
           ▼                ▼                   ▼                  ▼
   src/ide.html     src/simplegui.ts    src/*_tools.ts      src/simplegui.ts
   (designer page)  (build a window     src/features/*      (window from code)
                     from code)         (shared logic for
                                         CLI and studio)
                                 │
           ┌─────────────────────┼───────────────────────┐
           ▼                     ▼                       ▼
   src/localGuard.ts     src/db/ (Database        scripts/ (build, docs,
   (loopback guard for   Workbench: adapters,     generate bin/ wrappers,
    every local server)  profiles, service, HTTP) type-check ratchet)
```

## Components and responsibilities

| Component | Responsibility | Main files |
|---|---|---|
| Visual designer | Edit a form as JSON, show it as code, export a project, preview it | `index.ts` (backend: windowing, export, preview), `src/ide.html` (the whole page: HTML, CSS and about 4,700 lines of script) |
| Window helpers | Native fullscreen, always-on-top, centring and window shortcuts for every window, through `bun:ffi` | `index.ts` (`attachWindowShortcuts`, `setWindowPositionNative`, ...) |
| SimpleGUI | Build a window by calling methods (`addButton`, `addInput`, ...); it generates the page and handles events | `src/simplegui.ts` (about 11,600 lines), `src/simplegui_components.ts`, `src/simplegui_dialogs.ts` |
| Studios | One windowed application each | `applications/*_studio.ts` (and a few other names); 85 files in the folder including helpers |
| Studio servers | Local web server that gives a studio's page its data (`/api/...`) | `applications/*_server.ts` or inside the studio file |
| Resource pages | HTML, CSS and script for studios that are mostly web pages (the games, Calculator, Code Studio) | `resources/<name>/index.html` |
| Shared tool logic | Code used by both a studio and its command-line twin | `src/*_tools.ts`, `src/features/*` |
| Database layer | Connections, safe browsing and editing, SQL, transactions, export, SQLite backup for SQLite, MySQL and PostgreSQL | `src/db/` |
| Local-server guard | Refuse requests from other web pages or other hosts | `src/localGuard.ts` |
| Launcher | Find every studio, CLI tool and demo; start, stop and remember them | `applications/launcher_studio.ts`, `cli_apps/launcher_cli.ts` |
| Command wrappers | Generated `bin/codecaine-*` scripts and the Homebrew formula | `scripts/generate_brew_suite.ts`, `bin/`, `Formula/` |
| Build | Bundle the library (and optionally a native binary) into `dist/` (git-ignored) | `scripts/build.ts` |
| Documentation system | Navigation, generated indexes and the link checker | `docs/nav.json`, `scripts/docs/` |
| Quality gates | Tests, type-check ratchet, CI | `tests/`, `scripts/typecheck_ratchet.ts`, `.github/workflows/ci.yml` |

## How a studio is built

Three patterns exist. Which one a studio uses decides where its logic lives.

| Pattern | Example | How the window gets its page | Headless mode |
|---|---|---|---|
| **Resource page plus small server** | Pong, Calculator, Code Studio | `generate<Name>Html()` reads `resources/<name>/index.html`, injects a storage fallback and window shortcuts; `start<Name>Server()` serves it with `Bun.serve`; `create<Name>()` opens the window | yes (`--server`) |
| **Server in a worker** | SQLite, MySQL, PostgreSQL and Redis studios | The studio starts its `*_server.ts` in a worker and points the window at that server's address | yes |
| **SimpleGUI in-process** | API Studio, Crypto Studio, RAD Studio, the demos | `new SimpleWindow(...)` and `add...` calls generate the page; the page and the program talk through [bindings](../glossary.md#binding) | no |

Common rules for all three:

- The file's executable part sits under `if (import.meta.main)`, so importing the file for tests or reuse has no side effects. A test loads every file in `applications/` to enforce this ([Testing](../testing/index.md#application-smoke-test)).
- Servers bind to `127.0.0.1` and call `guardLocalRequest` first; a test enforces both ([D-013](../documentation-maintenance/discrepancies.md#d-013)).
- A server that can run headless prints `READY:<port>` (or "server running at: http://127.0.0.1:<port>/") so tools and tests can find it.

## Data flow

**Designer: from drag to exported project**

1. You click a palette item, then the canvas. `placeControlAt` appends a control to the in-page `formSpec` (JSON).
2. Every change re-renders the canvas and the code tabs from `formSpec`. Undo and redo keep copies of earlier specs.
3. **Export** calls the `exportProject` binding; `exportProjectHelper` (in `index.ts`) renders `index.html` from the spec and writes `index.ts` and `package.json` into `exported_project` in the current folder. Files that would change are first kept as `.bak` copies.
4. **Run** calls `runPreview`; `runPreviewHelper` writes `.rad_preview/preview.ts` and starts it in a separate process.
5. **Import** replaces `formSpec` only after `normalizeImportedSpec` accepts the JSON.

**Database Workbench**

```
browser/webview page ──(JSON, per-process token, loopback Host/Origin)──▶ workbench_http.ts
        ▲                                                                   │
        │                                                             service.ts (rules: read-only,
        │                                                              confirmations, transactions)
        │                                                                   │
        └──────── rows as text, never HTML ◀────────── adapters (sqlite / mysql / postgres)
                                                                            │
                                                          profiles.ts ──▶ OS credential store
                                                          (passwords never in connections.json)
```

It is mounted inside the SQLite, MySQL and PostgreSQL studio servers under `/workbench` and `/api/v2/` (checked for SQLite in `applications/sqlite_studio_server.ts`), and it can also run alone (`bun run workbench`). One workbench exists per process (`src/db/workbench_shared.ts`).

**Launcher**: `scanWorkspaceApps` lists files in `applications/`, `cli_apps/` and `demos/`, skipping helper files (`*_server.*`, `*_crud.*`, `*_engine.*`, `*_ops.*`) and the modules named in `NON_APP_MODULES`; it starts them as `bun run <path>` and keeps favourites and history in `.launcher_history.json`. The same scan feeds the `bin/` wrapper generator and the [application index](../reference/application-index.md).

## Trust boundaries

| Boundary | What crosses it | Protection (verified by test unless marked) |
|---|---|---|
| Web page in your browser → a local studio server | HTTP requests | Loopback bind; `guardLocalRequest` refuses foreign `Host` and `Origin` |
| Page inside a window → desktop program | [Bindings](../glossary.md#binding) | The set of bindings is fixed; `openExternalUrl` accepts only `http`, `https`, `mailto` (source) |
| Pasted JSON layout → designer | `formSpec` | `normalizeImportedSpec` validates; generated code escapes values ([D-021](../documentation-maintenance/discrepancies.md#d-021)); event handler scripts run by design and control text is inserted as raw HTML; Import warns about scripts ([D-024](../documentation-maintenance/discrepancies.md#d-024)) |
| Workbench page → database | SQL and row edits | Per-process token, read-only enforced in the engine, server-checked confirmations, parameterised values, rows rendered as text |
| Programs → files | Workspace paths (Code Studio), exports, state files | Workspace containment check (`isInsideWorkspace`); the maze and word-search state files are written through a temporary file and a rename (source) |
| Program → your database password | `.env` (older studios) or OS credential store (Workbench) | See [D-009](../documentation-maintenance/discrepancies.md#d-009) |

## Persistent data

See [Data and files](../reference/data-and-files.md) for the full list. In short: layouts live only in the open designer page until you copy the JSON; Workbench profiles are in `~/.bun_rad_studio/connections.json`; the launcher keeps `.launcher_history.json`; games keep their state in local files or browser storage; exports go to `exported_project`.

## Size and shape of the code

Measured on 13 October 2026 with `wc -l` and `ls`: `src/simplegui.ts` 11,612 lines, `index.ts` about 4,600, `src/ide.html` 6,991 (the script is lines 2,244 to 6,911). 85 files in `applications/` (65 listed as studios by the launcher), 78 in `cli_apps/`, 27 demos, 101 test files and 1,285 tests.

## Known structural problems

- **Very large files.** `src/simplegui.ts`, `index.ts` (windowing, export, preview and generators together) and `src/ide.html` (markup, style and script together) are hard to review. Nothing was split: splitting changes nothing for users and risks regressions, so it needs a reason and tests first.
- **Duplicated server scaffolding.** 34 files in `applications/` define a `generate...Html` function, and the games repeat the same `generate...Html` / `start...Server` / `create...` code. A shared helper would remove the duplication; it was left alone because each copy differs slightly and the tests only check the common behaviour.
- **266 type errors** (127 in `applications/`, 83 in `tests/`, 32 in `src/`) are recorded in the [baseline](../testing/index.md#type-check-ratchet); Bun does not check types when running.
- **Generated code lives inside template strings** in `index.ts` (the exported project) and `src/ide.html` (the code tabs), where escaping mistakes are easy; see [D-011](../documentation-maintenance/discrepancies.md#d-011) and [D-021](../documentation-maintenance/discrepancies.md#d-021).
