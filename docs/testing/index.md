# Testing

The project's automated tests use Bun's built-in test runner (`bun test`). This page lists the commands, what they need, and what to expect. Numbers are from a run on 13 October 2026 (macOS, Bun 1.4.2).

## Contents

- [Commands](#commands)
- [What is skipped and why](#what-is-skipped-and-why)
- [Where tests live](#where-tests-live)
- [Side effects to know about](#side-effects-to-know-about)
- [Not covered by automated tests](#not-covered-by-automated-tests)
- [See also](#see-also)

## Commands

Run all commands from the repository root.

| Command | What it does | Expected result (verified) |
|---|---|---|
| `bun test` | Runs every test file under `tests/` and `src/` | With database servers configured (below): **1218 pass, 0 fail**, 94 files, about 85 seconds. Without them the database suites are skipped, and the run reports the skips. |
| `bun test tests/db/splitter.test.ts` | One file | `13 pass`, `0 fail` |
| `bun run test:db` | Only the database-related tests | With servers configured: 309 pass, 0 fail. Without: 170 pass, 152 skipped, 0 fail. |

## What is skipped and why

Tests that need a MySQL or PostgreSQL server create a **temporary database with a random name**, use it, and drop it. They only run when you tell them which server to use:

```bash
export TEST_MYSQL_URL='mysql://user:your-password@localhost:3306'
export TEST_PG_URL='postgres://user@localhost:5432/postgres'
bun run test:db
```

Use a development server, never one with data you care about. Full explanation, including the temporary user/role the permission test creates: [Database tests](database-tests.md).

One test (`tests/db/workbench_ui.test.ts`) starts `node` to drive the Workbench page in a simulated browser (jsdom), because jsdom cannot run page scripts under Bun. It needs Node.js on your PATH.

## Where tests live

| Folder | Contents |
|---|---|
| `tests/` | Application and library tests (`*.test.ts`), plus two `*.node.mjs` files that run under Node |
| `tests/db/` | The shared database layer and the Workbench |
| `tests/helpers/testdb.ts` | Creates and drops temporary MySQL/PostgreSQL databases |
| `src/**/*.test.ts` | Tests next to the code they test (for example `src/features/rad/`) |

## Side effects to know about

- After a full `bun test` run, `bin/manifest.json` was modified and two new files appeared in `bin/` (which test does this was not investigated). They show up in `git status` afterwards ([D-006](../documentation-maintenance/discrepancies.md#d-006)). Discard them with `git checkout bin/manifest.json` and delete the new files if you do not want to commit them.
- The macro/codegen tests write to a temporary folder (`STUDIO_MACRO_STORE_DIR`), not to your real settings.
- The OS-keychain test writes one entry under a unique test service name and deletes it again. On a machine without a credential store it falls back to checking the in-memory store.

## Not covered by automated tests

- Real desktop windows: most window-based apps are tested through their servers or HTML output, not by clicking.
- The visual designer (it does not start, [D-001](../documentation-maintenance/discrepancies.md#d-001)).
- Windows and Linux.
- TLS connections to a real database server.

## See also

- [Database tests](database-tests.md)
- [Coverage matrix](../documentation-maintenance/coverage-matrix.md)
