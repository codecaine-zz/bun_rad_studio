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

- A full `bun test` run leaves `git status` clean ([D-006](../documentation-maintenance/discrepancies.md#d-006), fixed). The Homebrew test re-generates the `bin/` wrappers; they only change if a wrapper or the command list really changed.
- The macro/codegen tests write to a temporary folder (`STUDIO_MACRO_STORE_DIR`), not to your real settings.
- The OS-keychain test writes one entry under a unique test service name and deletes it again. On a machine without a credential store it falls back to checking the in-memory store.

## Not covered by automated tests

- Real desktop windows: most window-based apps are tested through their servers or HTML output, not by clicking.
- Interactive behaviour of the visual designer page. `tests/ide_html.test.ts` checks that the page's scripts parse, that its dialogs are not nested inside each other, the JSON import rules and the exported project, but nothing clicks through the page automatically.
- Windows and Linux.
- TLS connections to a real database server.

## See also

- [Database tests](database-tests.md)
- [Coverage matrix](../documentation-maintenance/coverage-matrix.md)

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests: `bun install --frozen-lockfile`, `bun run typecheck`, `bun run docs:check`, then `bun test`, on `macos-latest` with Bun 1.4.2.

- **Not verified on GitHub.** The same four steps passed in a fresh local clone (after the [D-020](../documentation-maintenance/discrepancies.md#d-020) fixes), but the workflow file has not run on GitHub.
- Windows and Linux are not covered.
- The live MySQL and PostgreSQL suites skip themselves, so CI does not test them.

## Type-check ratchet

Bun runs TypeScript without checking types, and the project has no `tsc` errors (there were 679 in 61 files at the start of 13 October 2026; see [D-026](../documentation-maintenance/discrepancies.md#d-026) for the real defects that clean-up found) ([baseline](../documentation-maintenance/baseline-and-risks.md#baseline-checks)). `bun run typecheck` (`scripts/typecheck_ratchet.ts`) runs `tsc --noEmit` and compares the number of errors **per file** with `scripts/typecheck_baseline.json`:

| Result | Exit code |
|---|---|
| Every file has the same or fewer errors than recorded | 0 |
| A file has more errors than recorded, or a file with none now has one | 1 (the files are listed) |
| `tsc` is missing or fails without reporting type errors, or there is no baseline | 2 |

- After you **fix** errors the check still passes and lists the files that improved. Run `bun run typecheck -- --update` to record the gain so it cannot be lost again.
- Running `--update` after **adding** errors defeats the check; do it only for a deliberate reason and say so in the commit.
- With the baseline at zero every error fails the check; the per-file comparison only matters if errors are ever recorded again.
- The count is per file, so fixing one error and adding another in the same file is not detected.
- Tests for the script are in `tests/typecheck_ratchet.test.ts` (they use a throwaway project, not the baseline).

## Application smoke test

`tests/applications_smoke.test.ts` (about 1 second):

1. imports every application module in `applications/` in a fresh process and fails on an error, so a module that crashes when loaded (for example [D-015](../documentation-maintenance/discrepancies.md#d-015)) is caught;
2. starts every application that has a headless mode (`--server`, 32 studios), waits for it to print its port and checks that `GET /` returns an HTML page.

What it does **not** check: the native window, any feature inside a studio, or the command-line tools in `cli_apps/` (they run when imported, so they are not loadable as modules). The per-studio result is shown in the *Automated start check* column of the [application index](../reference/application-index.md#studios). Checked by breaking two applications on purpose: the test failed and named both.
