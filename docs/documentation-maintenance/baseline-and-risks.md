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
| `bun test` after the fixes | 1101 pass, 152 skipped, 0 fail (1253 tests, 98 files, about 82 s) | New tests: `tests/ide_html.test.ts`, `tests/code_studio_security.test.ts`, `tests/standalone_server_binding.test.ts`. Each was checked to fail against the old code. |
| `bun run index.ts` (the designer) | Started and kept running for several seconds, no error output | Before the D-001 fix it stopped at once. The window was not inspected. |
| `node_modules/.bin/tsc --noEmit -p .` | 75 errors, all in `bin/codecaine-postgres-designer.js` (a generated JavaScript file that does not parse) | `tsconfig.json` has `allowJs` on and no `include`, so it reads `bin/`. |
| `node_modules/.bin/tsc --noEmit -p . --allowJs false` | 681 errors. Most are in tests (`tests/sqlite_studio_pro.test.ts` 111, `tests/sqlite_studio_macros.test.ts` 76, `tests/sqlite_studio_e2e.test.ts` 62) and in `applications/sqlite_studio_server.ts` (51). The most common code is TS18046 (an `unknown` value used without checking it, 413 times) | `package.json` has no type-check script, so nothing enforces this. Treat the count as a baseline, not a verdict: Bun runs the code without type checking. |
| `bun run docs:check` | 0 errors, 0 warnings | Checks internal links and anchors only. |
| Continuous integration | **Missing**: there is no `.github/workflows` folder | Nothing runs the tests automatically. |

**Known side effect of the test run** ([D-006](discrepancies.md#d-006)): after `bun test`, `bin/manifest.json` is modified and two new files appear in `bin/` (`codecaine-sqlite-studio-macros`, `codecaine-studio-codegen`). Reproduced again on 13 October 2026. Revert them before committing.

## Risks

Severity: **High** means data loss, a security hole or an unusable core workflow; **Medium** means a likely problem with a workaround; **Low** means minor.

| ID | Risk | Evidence | Who is affected | Severity | Status |
|---|---|---|---|---|---|
| R-01 | Any web page in the user's browser could run shell commands through Code Studio while it was open | Probe against the old `applications/code_studio.ts`: `POST /api/exec` with `Origin: https://evil.example` returned 200 and the command output. See [D-012](discrepancies.md#d-012) | Anyone running Code Studio | High | **Fixed**, tested (`tests/code_studio_security.test.ts`) |
| R-02 | Standalone `--server` mode of Task Manager, Fd Studio and Rip Studio listened on all network interfaces, and the loopback guard trusts a header the client controls | Source: `host: "0.0.0.0"` in the three files; test against the old code failed. See [D-013](discrepancies.md#d-013) | Anyone running those servers on a shared network | High | **Fixed**, tested (`tests/standalone_server_binding.test.ts`) |
| R-03 | 29 studio servers under `applications/` (mostly games and small tools, plus `rad_studio.ts` and `system_studio.ts`) do not call the loopback guard, and many answer with `Access-Control-Allow-Origin: *` | Source only: `grep -L guardLocalRequest` over files containing `Bun.serve`. Of these, only `maze_generator_studio.ts` and `word_search_studio.ts` write files (their own state file); none has an endpoint that runs commands (the one `Bun.spawn` in `system_studio.ts` starts its own helper server) | Players of those games: another web page could change their saved state | Low | Open. Not exercised, so the impact is a reading of the source |
| R-04 | Database passwords for the older MySQL and PostgreSQL studios live in a plain `.env` file, and every value is copied into the process environment | Source: `applications/mysql_studio_server.ts`, `applications/postgres_studio_server.ts`. `.env` is ignored by git, so no secret is committed. See [D-009](discrepancies.md#d-009) | Users of those two studios | Medium | Open. Changing it changes how users store settings, so it needs your decision |
| R-05 | Nothing runs the tests or the type check automatically | No `.github/workflows`; no type-check script | Contributors | Medium | Open |
| R-06 | A generated JavaScript file in `bin/` does not parse | `tsc` reports 75 syntax errors in `bin/codecaine-postgres-designer.js` | Users of the `codecaine-postgres-designer` command (not run) | Medium | Open, not investigated |
| R-07 | Running the tests changes tracked files | [D-006](discrepancies.md#d-006) | Contributors | Low | Open |
| R-08 | The MySQL and PostgreSQL integration tests are skipped without database servers | 152 skipped tests | Contributors changing the database layer | Medium | Open |
| R-09 | Designer behaviour is unverified beyond start-up and export | [Visual designer](../visual-designer/index.md) | Users of the designer | Medium | Open |

## Not yet assessed

These were not looked at, so this page says nothing about them: Windows and Linux behaviour, the Homebrew formula and install scripts, `run.ps1`, the packaged binaries in `bin/` and `dist/`, dependency vulnerabilities, performance, and accessibility.

## See also

- [Discrepancies found while documenting](discrepancies.md)
- [Coverage matrix](coverage-matrix.md)
- [Testing](../testing/index.md)
