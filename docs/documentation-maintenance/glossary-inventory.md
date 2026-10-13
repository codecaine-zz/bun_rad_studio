# Glossary term inventory

The list of terms the handbook must define. **The glossary itself is not written yet** (planned for the next documentation phase); this page records what it must cover so that terms are not forgotten. A term appears here only if it is used by the project, its interface, its code or these documents.

## Contents

- [Terms from the task brief](#terms-from-the-task-brief)
- [Project-specific terms found in the repository](#project-specific-terms-found-in-the-repository)
- [Easily confused pairs to explain](#easily-confused-pairs-to-explain)
- [Definition format](#definition-format)

## Terms from the task brief

Each needs: plain definition, why it matters here, an example, related terms, links.

| Area | Terms |
|---|---|
| The tool | IDE, RAD, Bun, runtime, Webview, frontend, backend, component, control, property, event, handler, binding, API, generated code |
| Data and SQL | CRUD, SQL, query, schema, table, row, column, primary key, foreign key, index, constraint, transaction, autocommit, commit, rollback, migration, parameterized query, pagination, NULL |
| Connecting | adapter, driver, connection, session, TLS, certificate, environment variable, secret |
| Files and text | JSON, CSV, Unicode, encoding |
| Building | dependency, package, build, bundle, executable, test, fixture |

## Project-specific terms found in the repository

| Term | Where it comes from |
|---|---|
| Studio | The name for a windowed application (`applications/*_studio.ts`) |
| Launcher, Launcher Studio Pro, CLI companion | `applications/launcher_studio.ts`, `cli_apps/launcher_cli.ts` |
| Demo | Files in `demos/` shown by the launcher |
| SimpleGUI, SimpleWindow, SimpleControlRef | `src/simplegui.ts`, `docs/SIMPLEGUI_API.md` |
| webview-bun | The `webview-bun` package that draws windows |
| Form spec / ControlSpec / `control_type` | `docs/API.md` |
| Visual control, non-visual control (tray component) | `src/ide.html`, `docs/API.md` |
| DB Wizard, DBGrid, DBNavigator, DBInput, DBDropdown, TFDConnection | `src/ide.html` (designer placeholders) |
| Database Workbench | `src/db/`, `docs/databases/workbench.md` |
| Connection profile; environment label (development, test, staging, production) | `src/db/profiles.ts` |
| Read-only connection | `src/db/adapters/` |
| Capability | `src/db/types.ts` (`Capabilities`) |
| Confirmation token; typed confirmation | `src/db/service.ts` |
| Row key; conflict detection; pending change | `src/db/adapters/base.ts`, `src/db/workbench_ui.ts` |
| Statement splitter; script | `src/db/splitter.ts` |
| Typed parameter; exact decimal; big integer; binary (base64) | `src/db/wire.ts` |
| Credential store / keychain | `src/db/profiles.ts` (`Bun.secrets`) |
| Throwaway (disposable) test database | `tests/helpers/testdb.ts` |
| WAL, `VACUUM INTO`, integrity check | SQLite backup in `src/db/` |
| Macro, Access-style macro designer, QBE (query by example), saved query | `applications/studio_macros_server.ts`, SQLite/MySQL/Postgres studios |
| Code translation (SQL to Python/Bun/V) | `applications/studio_codegen.ts` |
| Rip, graveyard | Rip Studio (`applications/rip_*.ts`) |
| Environment Vault | `applications/env_studio.ts` |
| App Bundler | `applications/app_bundler_studio.ts` |
| SimpleCLI | `src/simplecli/` |
| RAD utility modules (`rad`) | `src/features/rad/` |
| Homebrew suite; Brewfile | `install_homebrew_suite.sh`, `Brewfile` |
| Theme | `docs/THEMES.md` |
| `dist/` | Build output of `bun run build` |

## Easily confused pairs to explain

| Pair | Why it matters |
|---|---|
| Database vs database server | SQLite is a file; MySQL/PostgreSQL are servers |
| Database schema vs JSON schema; PostgreSQL schema vs MySQL "schema" | The word means different things in each place |
| SQL NULL vs JavaScript `null` vs empty string | Editing and CSV export treat them differently |
| Export vs backup | Only a tested backup can be restored |
| Authentication vs authorization | Logging in vs what the account may do |
| Build vs bundle vs package | `bun run build` produces a bundle in `dist/` |
| Design time vs runtime | Designer placeholders vs a running form |
| Studio vs CLI tool vs demo | The launcher's three kinds of entry |
| Read-only profile vs read-only account | The first is enforced by the tool plus the engine; only the second is a hard guarantee |

## Definition format

Each glossary entry will contain: **Term**, **plain-language definition**, **why it matters in this project**, **a short example or analogy**, **related terms**, **links to guides**. Abbreviations are expanded at first use.
