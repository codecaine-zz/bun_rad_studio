# Reference index

Look-up pages. Nothing here is a tutorial; each row says where the fact comes from.

## Contents

- [Generated indexes](#generated-indexes)
- [API documents](#api-documents)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [Files the project reads or writes](#files-the-project-reads-or-writes)

## Generated indexes

| Index | Contents |
|---|---|
| [Application index](application-index.md) | Every tool found by the launcher, with its launch command |
| [Script index](script-index.md) | Every `package.json` script |
| [Coverage matrix](../documentation-maintenance/coverage-matrix.md) | What is documented and verified |
| [Task index](task-index.md) | "I want to…" links |

These pages are produced by `bun run docs:build`; do not edit them by hand.

## API documents

| Document | Describes | Accuracy check |
|---|---|---|
| [API.md](../API.md) | The visual designer's control specification and the IPC functions of `index.ts` | Not diffed against the source |
| [SIMPLEGUI_API.md](../SIMPLEGUI_API.md) | The SimpleGUI window/controls library (`src/simplegui.ts`) | Not diffed against the source; its quick start imports from `"bun_rad_studio"` ([D-007](../documentation-maintenance/discrepancies.md#d-007)) |
| [SYSTEM_UTILITIES_API.md](../SYSTEM_UTILITIES_API.md) | The RAD utility modules (`src/features/rad`) | Not diffed against the source |
| [THEMES.md](../THEMES.md) | Themes available to SimpleGUI | Theme count not verified |
| [Database Workbench](../databases/workbench.md) | The HTTP interface under `/api/v2` is internal; the page documents behaviour, not the endpoints | Behaviour verified by tests |

## Environment variables

Only variables whose behaviour was read in the source are listed. "Scope" is the program that reads it.

| Variable | Purpose | Default | Scope | Source |
|---|---|---|---|---|
| `STUDIO_DB_PROFILE_DIR` | Folder for `connections.json` (Workbench connection profiles) | `~/.bun_rad_studio` | Database Workbench | `src/db/profiles.ts` |
| `STUDIO_MACRO_STORE_DIR` | Folder for saved macros and queries | `~/.bun_rad_studio/macros` | SQLite/MySQL/Postgres studios | `applications/studio_macros_server.ts` |
| `STUDIO_EXPORT_DIR` | Folder for MySQL Studio file exports | current folder | MySQL Studio | `applications/mysql_studio_server.ts` |
| `LAUNCHER_HISTORY_FILE` | File holding launcher favourites and history | `.launcher_history.json` in the current folder | Launcher | `applications/launcher_studio.ts` |
| `WORKBENCH_PORT` | Port for `bun run workbench` | a free port chosen by the system | Workbench server | `src/db/workbench_server.ts` |
| `TEST_MYSQL_URL`, `TEST_PG_URL` | Admin URL of a development server for tests | unset (tests skipped) | Tests | `tests/helpers/testdb.ts` |
| `MSQL_*`, `MYSQL_*`, `PG_*`, `POSTGRES_*`, `DATABASE_URL` | Connection settings read by the legacy MySQL/Postgres studios (host, port, user, password, database, TLS) | see the studios' guides | Legacy studios | `applications/mysql_studio_server.ts`, `applications/postgres_studio_server.ts` |

**Security note: the `.env` file used by the legacy MySQL and PostgreSQL studios.** (Decision recorded 13 October 2026: this behaviour is left as it is and documented; see [D-009](../documentation-maintenance/discrepancies.md#d-009).)

- At start-up each of these two studios reads `.env` from the **current folder** and copies **every** `KEY=value` line into its environment, **replacing** any variable of the same name that was already set (read in `applications/mysql_studio_server.ts` and `applications/postgres_studio_server.ts`). The values stay in the process's environment, which programs it starts can inherit.
- The file is plain text. It is listed in `.gitignore`, so git will not add it, but nothing else protects it. Anyone who can read the file can read the password.
- Safe practice: keep the file only on your own machine; never copy it into a project folder you share, a backup you upload or a chat; use a database account with the least privileges you need (read-only if you only browse); on macOS and Linux, make the file readable by you alone with `chmod 600 .env`; do not put real passwords in `.env.example`, which **is** committed.
- The [Database Workbench](../databases/workbench.md#connections-and-credentials) keeps passwords in the operating system's credential store instead, and does not read `.env`.


Many other variables exist (for example `PORT`, `SCREENSHOT_MODE`, `STUDIO_WORKER`, `REDIS_URL`); they were not individually verified and are not documented here.

## Commands

See the [script index](script-index.md). Commands that were run for this handbook are marked in [Install and first launch](../getting-started/install-and-first-launch.md) and [Testing](../testing/index.md).

## Files the project reads or writes

See [Update and remove: what the project saves](../getting-started/update-and-remove.md#what-the-project-saves-on-your-computer).
