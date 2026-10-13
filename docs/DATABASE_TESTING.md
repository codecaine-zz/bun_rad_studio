# Database tests

Tests never touch real databases. SQLite suites use `:memory:` or temp files. MySQL and PostgreSQL suites create a
uniquely named throwaway database (`bunrad_test_<random>`) on a server you point them at, and drop it when the suite ends.
Without the variables below those suites are **skipped** (they are not reported as passing).

```sh
# admin URL: the account needs CREATE/DROP DATABASE
export TEST_MYSQL_URL='mysql://user:password@localhost:3306'
export TEST_PG_URL='postgres://user@localhost:5432/postgres'
bun run test:db
```

Use a development server, never one holding data you care about. Credentials come from your shell environment only;
never commit them. Helper: [`tests/helpers/testdb.ts`](../tests/helpers/testdb.ts).

## What runs where

| Suite | Needs | Notes |
|---|---|---|
| `tests/db/*.test.ts` (splitter, SQLite adapter, classifier, profiles, HTTP API, large data) | nothing | Pure Bun + temp files |
| `tests/db/server_adapters.test.ts`, `studio_injection.test.ts`, legacy `mysql_*`/`postgres_*` suites | `TEST_MYSQL_URL` / `TEST_PG_URL` | Skipped otherwise. Also creates and drops a temporary database user/role. |
| `tests/db/workbench_ui.test.ts` | `node` on PATH (jsdom cannot run page scripts under Bun) | Runs the page against the real server on SQLite, plus MySQL/PostgreSQL when configured |
| OS keychain test | macOS Keychain / Windows Credential Manager / libsecret | Uses a unique service name and removes its entry; falls back to checking the in-memory store |

`bun run test:db` runs all of the above. The full repository suite is still `bun test`.
