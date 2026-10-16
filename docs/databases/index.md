# Databases overview

Bun RAD Studio works with three database engines. This page tells you which tool to use and links to the detailed guide. Engine-by-engine guides and a plain-language concepts guide are **planned** for the next documentation phase; until then the [Database Workbench guide](workbench.md) is the authoritative description of verified behaviour.

## Contents

- [Which tool for which job](#which-tool-for-which-job)
- [The three engines at a glance](#the-three-engines-at-a-glance)
- [Safe practice for learning](#safe-practice-for-learning)
- [Connection settings and environment variables](#connection-settings-and-environment-variables)
- [Status of each part](#status-of-each-part)
- [See also](#see-also)

## Which tool for which job

| I want to… | Use | Notes |
|---|---|---|
| Look at tables, edit rows safely, run SQL, export a table | [Database Workbench](workbench.md) | Same screen for all three engines. Open it with the **🧰 Workbench** button inside SQLite, MySQL or Postgres Studio, or run `bun run workbench`. Verified by automated tests. |
| Use the larger full-screen tools (many tabs: designer, diagrams, macros, activity…) | SQLite Studio `bun run app:database` · MySQL Studio `bun run app:mysql` · Postgres Studio `bun run app:postgres` | Their server APIs are tested automatically; the windows themselves were not exercised by hand for this handbook. |
| Turn a macro or a query into Python, Bun or V code | The "code" buttons in each studio | Output is text; not executed in tests. Targets SQLite. |
| Build a window that edits database rows | Not available | The designer's database controls are placeholders ([D-002](../documentation-maintenance/discrepancies.md#d-002)). |

## The three engines at a glance

| | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| What it is | A database stored in **one file**, built into Bun | A database **server** you connect to | A database **server** you connect to |
| Needs a server running? | No | Yes | Yes |
| Logins | None (file permissions) | User name and password | User name and password |
| Good first choice for learning | **Yes** | After SQLite | After SQLite |

*Database* = the stored data. *Database server* = a program that holds one or more databases and answers requests from other programs. SQLite has no server: your program reads the file directly.

## Safe practice for learning

- Practise on a **disposable** database containing made-up data, never on a production database.
- In the Workbench give practice connections the environment **development** and use **read-only** while you only want to look.
- Anything that deletes or overwrites data asks for a confirmation that shows the exact target; read it before confirming.

## Connection settings and environment variables

The four studios (SQLite, MySQL, PostgreSQL, Redis) can be opened from the File Manager's **Databases** tool ([guide](../userguides/43_file_manager.md#databases-databases-tab)), which keeps connections for them. **A connection saved there replaces environment variables.** The order, first one found wins:

1. the **connection** chosen in the File Manager (its password comes from the OS keychain);
2. the File Manager's **defaults for that engine** (optional);
3. **environment variables**, including `.env` files Bun loaded into the environment (Bun reads `.env`, `.env.<mode>`, `.env.local` and `.env.<mode>.local` from the folder it starts in; real variables win over files);
4. the **studio's own defaults** (for example `localhost:3306`, user `root`, database `my_app_dev` for MySQL).

A studio started for a connection gets a rebuilt environment: all connection variables are removed first (`MSQL_*`, `MYSQL_*`, `MARIADB_*`, `DB_HOST/PORT/USER/PASSWORD/NAME`, `DATABASE_URL`, `PG*`, `POSTGRES_*`, `REDIS_*`, `VALKEY_*`, `SQLITE*`), then the connection's values are set under the names that studio reads, it starts in a folder without `.env` files, and Bun's own `.env` loading is switched off. These are the names each studio reads (a studio started by hand still reads them, unchanged):

| Engine | Variables the studio reads (first found wins; an address overrides single variables) |
|---|---|
| SQLite | `SQLITE_STUDIO_DB` (`--server`), `SQLITE_DB_PATH` |
| MySQL / MariaDB | host `MSQL_HOST`, `MYSQL_HOST`, `DB_HOST` · port `MSQL_PORT`, `MYSQL_PORT`, `DB_PORT` · user `MSQL_USER`, `MYSQL_USER`, `DB_USER` · password `MSQL_PASSWORD`, `MYSQL_PASSWORD`, `DB_PASSWORD` · database `MSQL_NAME`, `MSQL_DATABASE`, `MSQL_DB`, `MYSQL_DATABASE`, `DB_NAME` · TLS `MSQL_TLS`, `MYSQL_TLS` · address `MSQL_URL`, `DATABASE_URL` |
| PostgreSQL | host `PG_HOST`, `POSTGRES_HOST`, `DB_HOST` · port `PG_PORT`, `POSTGRES_PORT`, `DB_PORT` · user `PG_USER`, `POSTGRES_USER`, `DB_USER` · password `PG_PASSWORD`, `POSTGRES_PASSWORD`, `DB_PASSWORD` · database `PG_DATABASE`, `PG_NAME`, `PG_DB`, `POSTGRES_DB`, `DB_NAME` · schema `PG_SCHEMA` · TLS `PG_TLS`, `PG_SSL` · address `PG_URL`, `DATABASE_URL` |
| Redis | address `REDIS_URL` (with `redis://user:password@host:port`; `rediss://` for TLS), database number `REDIS_DB` |

**Auto-detect and save once, then the variables can be removed.** The Databases tool notices connections in the environment (and in the `.env` files of the application's own folders), shows where each value came from, and saves one with a click; from then on the saved connection is used and the variables are no longer needed. Nothing is edited for you. Details, including how a `.env` that Bun did not load is handled, are in the [File Manager guide](../userguides/43_file_manager.md#databases-databases-tab). A Redis server running at its usual local address (`127.0.0.1:6379`, as a Homebrew install gives you) is found without any variables and saved once for you.

## Status of each part

| Part | Status |
|---|---|
| Workbench (connect, browse, edit, SQL, transactions, CSV export, SQLite backup/restore) | Implemented and verified by automated tests (macOS) |
| Workbench import wizard, query history, autocomplete, schema designer, MySQL/PostgreSQL backup | **Planned** |
| Legacy studios' windows | Implemented, not verified by hand |
| Designer database controls | Placeholders |

Full detail: [coverage matrix](../documentation-maintenance/coverage-matrix.md).

## See also

- [Database Workbench guide](workbench.md)
- [Sample databases](sample-datasets.md)
- [Import with staging](staging-import.md)
- [Database tests](../testing/database-tests.md)
- [Legacy per-studio guides (unverified)](../userguides/README.md)
