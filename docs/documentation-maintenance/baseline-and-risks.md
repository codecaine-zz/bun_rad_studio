# Baseline checks and risk register

What was run against the project, what happened, and what could hurt users or developers. Everything here was observed on **13 October 2026** (macOS, Bun 1.4.2) unless a row says "source only". Labels follow the [style guide](style-guide.md#status-labels).

## Contents

- [Baseline checks](#baseline-checks)
- [Risks](#risks)
- [Not yet assessed](#not-yet-assessed)
- [See also](#see-also)

## Baseline checks

| Command | Result | Notes |
|---|---|---|
| `bun test` | 1092 pass, 152 skipped, 0 fail (1244 tests, 96 files, about 82 s), before the fixes in D-001, D-011, D-012 and D-013 | The 152 skipped tests are the MySQL and PostgreSQL suites, which need running database servers (see [testing](../testing/index.md)). They were **not verified** here. |
| `bun test` after the D-006 to D-020 fixes | 1133 pass, 152 skipped, 0 fail (1285 tests, 101 files, about 84 s) | New test files: `tests/ide_html.test.ts`, `tests/code_studio_security.test.ts`, `tests/standalone_server_binding.test.ts`, `tests/launcher_listing.test.ts`, `tests/studio_servers_local_only.test.ts`. The tests added for each fix were checked to fail against the old code, except the launcher tests (their old-code run could not import the new export) and the button-colour fix (checked in the browser only). |
| `bun run index.ts` (the designer) | Started and kept running for several seconds, no error output | Before the D-001 fix it stopped at once. The native window was not inspected; the page it loads was opened in a browser (see [the designer page](../visual-designer/index.md#what-was-checked)). |
| `node_modules/.bin/tsc --noEmit -p .` | Before D-014 was fixed: 75 errors, all in `bin/codecaine-postgres-designer.js`, a bash script wrongly named `.js`. After: 679 errors, none under `bin/` | `tsconfig.json` has `allowJs` on and no `include`. With `--allowJs false` the count was 681 (before the fix). Most are in tests (`tests/sqlite_studio_pro.test.ts` 111, `tests/sqlite_studio_macros.test.ts` 76, `tests/sqlite_studio_e2e.test.ts` 62) and in `applications/sqlite_studio_server.ts` (51). The most common code is TS18046 (an `unknown` value used without checking it, 413 times). Bun runs the code without type checking, so treat the count as a baseline, not a verdict. Since 13 October 2026 `bun run typecheck` stops the count from growing per file (see [Testing](../testing/index.md#type-check-ratchet)); the existing errors are not fixed. |
| `node_modules/.bin/tsc --noEmit -p . --allowJs false` | 681 errors. Most are in tests (`tests/sqlite_studio_pro.test.ts` 111, `tests/sqlite_studio_macros.test.ts` 76, `tests/sqlite_studio_e2e.test.ts` 62) and in `applications/sqlite_studio_server.ts` (51). The most common code is TS18046 (an `unknown` value used without checking it, 413 times) | `package.json` has no type-check script, so nothing enforces this. Treat the count as a baseline, not a verdict: Bun runs the code without type checking. |
| `bun run docs:check` | 0 errors, 0 warnings | Checks internal links and anchors only. |
| Continuous integration | A workflow now exists (`.github/workflows/ci.yml`: install with the lockfile, `bun run typecheck`, `bun run docs:check`, `bun test`, on macOS with Bun 1.4.2). **It has not run on GitHub**; all four steps were run in a fresh local clone, which exposed [D-020](discrepancies.md#d-020) | Before this, nothing ran the tests automatically. |

**Test run side effects:** after the D-006 fix, a full `bun test` leaves `git status` clean (checked on 13 October 2026). Before it, `bin/manifest.json` changed on every run.

## Risks

Severity: **High** means data loss, a security hole or an unusable core workflow; **Medium** means a likely problem with a workaround; **Low** means minor.

| ID | Risk | Evidence | Who is affected | Severity | Status |
|---|---|---|---|---|---|
| R-01 | Any web page in the user's browser could run shell commands through Code Studio while it was open | Probe against the old `applications/code_studio.ts`: `POST /api/exec` with `Origin: https://evil.example` returned 200 and the command output. See [D-012](discrepancies.md#d-012) | Anyone running Code Studio | High | **Fixed**, tested (`tests/code_studio_security.test.ts`) |
| R-02 | Standalone `--server` mode of Task Manager, Fd Studio and Rip Studio listened on all network interfaces, and the loopback guard trusts a header the client controls | Source: `host: "0.0.0.0"` in the three files; test against the old code failed. See [D-013](discrepancies.md#d-013) | Anyone running those servers on a shared network | High | **Fixed**, tested (`tests/standalone_server_binding.test.ts`) |
| R-03 | 27 studio servers under `applications/` (mostly games and small tools) did not call the loopback guard, and answered with `Access-Control-Allow-Origin: *`. Three of them (Frogger, Snake, Tetris) also called `Bun.serve` without a `hostname`, so (source only, not observed) they listened on every network interface | `grep -L guardLocalRequest` over files containing `Bun.serve`. The Maze Generator and Word Search servers accept `POST /api/state` and write their own state file; none had an endpoint that runs commands | Players of those games: another web page could change their saved state | Low | **Fixed**: all 27 now call the guard and bind to `127.0.0.1`. `tests/studio_servers_local_only.test.ts` fails if any file with `Bun.serve({` omits the guard or binds `"0.0.0.0"`. See [D-013](discrepancies.md#d-013) |
| R-04 | Database passwords for the older MySQL and PostgreSQL studios live in a plain `.env` file, and every value is copied into the process environment | Source: `applications/mysql_studio_server.ts`, `applications/postgres_studio_server.ts`. `.env` is ignored by git, so no secret is committed. See [D-009](discrepancies.md#d-009) | Users of those two studios | Medium | Accepted and documented (13 October 2026): the behaviour is unchanged; the reference page lists what the loader does and safe practice |
| R-05 | Nothing ran the tests or the type check automatically | No workflow existed; there was no type-check script | Contributors | Medium | Partly fixed: a CI workflow (not yet run on GitHub) runs the tests and a type-check ratchet that blocks new errors; the 679 existing errors remain |
| R-06 | The launcher offered five library files as applications, and three of them got broken `codecaine-*` commands | `codecaine-postgres-designer.js` ran a browser script and crashed with `document is not defined`; the other two printed nothing. See [D-014](discrepancies.md#d-014) | Users of those commands | Medium | **Fixed**, tested (`tests/launcher_listing.test.ts`) |
| R-07 | Running the tests changed tracked files | [D-006](discrepancies.md#d-006) | Contributors | Low | **Fixed** |
| R-08 | The MySQL and PostgreSQL integration tests are skipped without database servers | 152 skipped tests | Contributors changing the database layer | Medium | Open |
| R-09 | Designer behaviour is unverified beyond the items in [What was checked](../visual-designer/index.md#what-was-checked) | Run, Export, save/reopen, drag and resize and most of the 95 controls were not checked | Users of the designer | Medium | Open |
| R-11 | The designer's interface did nothing and its dialogs could not open (since 12 September 2026), and Import could corrupt the open form | Observed in a browser rendering of the page: `SyntaxError` from a closing script tag inside a string, dialogs nested inside a hidden dialog, and `Form: undefinedxundefined` after importing JSON without `controls`. See [D-016](discrepancies.md#d-016), [D-017](discrepancies.md#d-017), [D-018](discrepancies.md#d-018) | Users of the designer | High | **Fixed**, tested (`tests/ide_html.test.ts`) |
| R-12 | Button text contrast in the designer: 25 of 51 themes are below 4.5 to 1 (new buttons in the default theme were 1.4 to 1, now fixed) | Computed from `getThemeColors` in `src/ide.html`. See [D-019](discrepancies.md#d-019) | Users who rely on readable text | Low | Partly fixed; theme colours are a design decision |
| R-10 | `bun run applications/redis_studio_server.ts --server` crashes at start-up | Observed: `ReferenceError: Cannot access 'RedisManager' before initialization` (a circular import with `redis_studio.ts`, which also reacts to `--server`). Same result on the committed code. See [D-015](discrepancies.md#d-015) | Anyone starting that file directly | Low | **Fixed** (see [D-015](discrepancies.md#d-015)) |

## Not yet assessed

These were not looked at, so this page says nothing about them: Windows and Linux behaviour, the Homebrew formula and install scripts, `run.ps1`, the packaged binaries in `bin/` and `dist/`, dependency vulnerabilities, performance, and accessibility.

## See also

- [Discrepancies found while documenting](discrepancies.md)
- [Coverage matrix](coverage-matrix.md)
- [Testing](../testing/index.md)
