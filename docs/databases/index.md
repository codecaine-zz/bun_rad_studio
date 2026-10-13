# Databases overview

Bun RAD Studio works with three database engines. This page tells you which tool to use and links to the detailed guide. Engine-by-engine guides and a plain-language concepts guide are **planned** for the next documentation phase; until then the [Database Workbench guide](workbench.md) is the authoritative description of verified behaviour.

## Contents

- [Which tool for which job](#which-tool-for-which-job)
- [The three engines at a glance](#the-three-engines-at-a-glance)
- [Safe practice for learning](#safe-practice-for-learning)
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
- [Database tests](../testing/database-tests.md)
- [Legacy per-studio guides (unverified)](../userguides/README.md)
