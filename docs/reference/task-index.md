# Task index

Find a page by what you want to do. A status in brackets says how far to trust it: **verified** = run or tested, **source only** = read from the code, **planned** = does not exist.

## Contents

- [Getting started](#getting-started)
- [Databases](#databases)
- [Building windows and applications](#building-windows-and-applications)
- [Contributing and testing](#contributing-and-testing)
- [When something goes wrong](#when-something-goes-wrong)

## Getting started

| I want to… | Go to |
|---|---|
| Check my computer can run it | [Requirements](../getting-started/requirements.md) |
| Install it | [Install and first launch](../getting-started/install-and-first-launch.md#step-3-install-the-packages) (verified) |
| See every tool and how to start it | [Application index](application-index.md) |
| Open the launcher | [Step 5](../getting-started/install-and-first-launch.md#step-5-open-the-launcher) (verified) |
| Manage files, archives, media, terminals and databases in one app | [Codecaine File Manager](../userguides/43_file_manager.md) (verified) |
| Update or uninstall | [Update and remove](../getting-started/update-and-remove.md) |

## Databases

| I want to… | Go to |
|---|---|
| Connect to a database | [Workbench: getting started](../databases/workbench.md#getting-started) (verified) |
| Keep my database password safe | [Workbench: connections and credentials](../databases/workbench.md#connections-and-credentials) (verified) |
| Browse and edit rows safely | [Workbench: everyday workflow](../databases/workbench.md#everyday-workflow) (verified) |
| Run SQL, use transactions | [Workbench: SQL editor and transactions](../databases/workbench.md#sql-editor-and-transactions) (verified) |
| Stop myself damaging data | [Workbench: safety](../databases/workbench.md#safety) (verified) |
| Export a table / back up a SQLite file | [Import/export versus backup/restore](../databases/workbench.md#importexport-versus-backuprestore) (verified) |
| Import a CSV, TSV, JSON, NDJSON or SQL file safely | [Import with staging](../databases/staging-import.md) (verified) |
| Clone a database between SQLite, MySQL and PostgreSQL, or generate synthetic sample databases | [Complete guide to databases in the File Manager](../databases/complete-databases-guide.md) and [Sample databases](../databases/sample-datasets.md) (verified) |
| Fix a connection error | [Workbench troubleshooting table](../databases/workbench.md#troubleshooting) |
| Compare SQLite, MySQL and PostgreSQL | [Databases overview](../databases/index.md#the-three-engines-at-a-glance) |

## Building windows and applications

| I want to… | Go to |
|---|---|
| Open a window from code | [First program](../getting-started/install-and-first-launch.md#step-6-run-your-first-program) (launch verified) and [SIMPLEGUI_API.md](../SIMPLEGUI_API.md) |
| Design a form visually | [Visual designer](../visual-designer/index.md) (partly verified; see [what was checked](../visual-designer/index.md#what-was-checked)) |
| Export an application | [Generated applications](../generated-applications/index.md) (`exportProjectHelper` verified) |
| Generate a database-backed application | Not available (planned) |
| Build the library | [Step 8](../getting-started/install-and-first-launch.md#step-8-build-the-library-optional) (verified) |

## Contributing and testing

| I want to… | Go to |
|---|---|
| Run the tests | [Testing](../testing/index.md) (verified) |
| Test against MySQL/PostgreSQL safely | [Database tests](../testing/database-tests.md) |
| Write or change documentation | [Style guide](../documentation-maintenance/style-guide.md) and [contributor checklist](../documentation-maintenance/contributor-checklist.md) |
| Understand how the code fits together | [Architecture](../developer/architecture.md) (source only) |
| Add an application or a designer control | [Developer handbook](../developer/handbook.md#add-an-application) |
| Look up a word | [Glossary](../glossary.md) |
| Find where my data and settings are stored | [Data and files](data-and-files.md) |
| Check what is protected and what is not | [Security](../security.md) |
| Check the documentation for broken links | `bun run docs:check` ([how it works](../documentation-maintenance/style-guide.md#checking-your-pages)) |

## When something goes wrong

| Symptom | Go to |
|---|---|
| Anything else (start-up, ports, 403, designer, files, checks) | [Troubleshooting](../troubleshooting.md) |
| `bun start` fails with `existsSync is not defined` | [Discrepancy D-001](../documentation-maintenance/discrepancies.md#d-001) |
| Install or first-launch problem | [When something fails](../getting-started/install-and-first-launch.md#when-something-fails) |
| Database connection error | [Workbench troubleshooting](../databases/workbench.md#troubleshooting) |
| A test is skipped | [Testing: what is skipped](../testing/index.md#what-is-skipped-and-why) |
