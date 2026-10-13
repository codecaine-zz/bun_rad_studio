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
| `bun test` | Runs every test file under `tests/` and `src/` | **Default, on the author's Mac (13 October 2026): 1156 pass, 175 skipped, 0 fail**, 1331 tests, 104 files, about 85 seconds. The 175 skips are the 152 database tests (need `TEST_MYSQL_URL` / `TEST_PG_URL`), 18 Redis tests (`TEST_REDIS_URL`) and 5 live-network tests (`TEST_NETWORK=1`). Earlier, with database servers configured, the database suites also passed (1218 pass in 94 files at that time). |
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

**Redis tests** (`tests/redis_studio_pro.test.ts`, `tests/redis_studio_enhancements.test.ts`, 18 tests) seed keys and run `FLUSHDB` on databases 14 and 15, so they are opt-in too and skipped unless a reachable server is named:

```bash
TEST_REDIS_URL=redis://127.0.0.1:6379 bun test tests/redis_studio_pro.test.ts tests/redis_studio_enhancements.test.ts
```

Use a throwaway Redis only. CI starts one for itself.

**Live-network tests** (real DNS lookups and a port scan: test 12b in `tests/enterprise_applications.test.ts` and the "live DNS" suite in `src/features/doggo/doggo.test.ts`, 5 tests) are skipped unless `TEST_NETWORK=1`; their result depends on the network, not on the code.

Two launcher tests that open a real Terminal window on macOS skip themselves when the `CI` environment variable is set.

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

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests, on `macos-latest` with Bun 1.4.2: `bun install --frozen-lockfile`, `bun run typecheck`, `bun audit` (informational), `bun run docs:check`, a throwaway Redis (Homebrew, port 6390, no persistence), then `bun test` with `TEST_REDIS_URL` pointing at it.

- **Verified on GitHub, after a rocky start.** The first run (13 October 2026, run 38482567102) had 14 test failures that never showed locally ([D-032](../documentation-maintenance/discrepancies.md#d-032)). A third run failed on a live-network test. After those fixes, run 38484129943 **succeeded, and succeeded again when re-run** (second attempt: 1169 pass, 158 skipped, 0 fail; about 2.5 minutes per run). Two successes on one commit is some evidence of stability, not proof.
- Windows and Linux are not covered (the workflow runs on macOS only).
- The live MySQL and PostgreSQL suites and the live-network tests skip themselves, so CI does not run them. The Redis tests do run there.
- The lesson of the first run: a fresh local clone is not the same as a clean machine. Anything a test needs from the machine (a running server, a desktop, enough speed) must be stated, opt-in or skipped.

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
