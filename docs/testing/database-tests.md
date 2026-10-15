# Database tests

Tests never touch real databases. SQLite suites use `:memory:` or temp files. MySQL and PostgreSQL suites create a
uniquely named throwaway database (`bunrad_test_<random>`) on a server you point them at, and drop it when the suite ends.
Without the variables below those suites are **skipped** (they are not reported as passing).

```sh
# admin URL: the account needs CREATE/DROP DATABASE
export TEST_MYSQL_URL='mysql://user:password@localhost:3306'
export TEST_PG_URL='postgres://user@localhost:5432/postgres'
export TEST_REDIS_URL='redis://localhost:6379'   # a throwaway Redis (its suites flush databases 14 and 15)
bun run test:db
```

Use a development server, never one holding data you care about. Credentials come from your shell environment only;
never commit them. Helper: [`tests/helpers/testdb.ts`](../../tests/helpers/testdb.ts).

## What runs where

| Suite | Needs | Notes |
|---|---|---|
| `tests/db/*.test.ts` (splitter, SQLite adapter, classifier, profiles, HTTP API, large data) | nothing | Pure Bun + temp files |
| `tests/db/server_adapters.test.ts`, `studio_injection.test.ts`, legacy `mysql_*`/`postgres_*` suites | `TEST_MYSQL_URL` / `TEST_PG_URL` | Skipped otherwise. Also creates and drops a temporary database user/role. |
| `tests/db/workbench_ui.test.ts` | `node` on PATH (jsdom cannot run page scripts under Bun) | Runs the page against the real server on SQLite, plus MySQL/PostgreSQL when configured |
| `tests/file_manager_db_realservers.test.ts`, the real-server part of `tests/file_manager_db_profiles.test.ts` | `TEST_MYSQL_URL` / `TEST_PG_URL` (a database name in the address is used as is) / `TEST_REDIS_URL` | The File Manager's Databases tool: Test connection, and each real studio started from a saved connection while the environment names a wrong server. Skipped otherwise. |
| `tests/db_samples_*.test.ts` (sample catalog: datasets, model, integrity, large scale, API) | nothing | Every dataset on real SQLite (foreign keys, integrity, determinism, every view and example query). With `TEST_MYSQL_URL` / `TEST_PG_URL` the same datasets, the API and `db_samples_realservers` / `db_samples_ui` (clicks **Put in the SQL editor** / **Run it** end to end and runs the inserted queries) also run on real MySQL / PostgreSQL; each creates and drops its own `sample_*` database / schema. See [Sample databases](../databases/sample-datasets.md) |
| `tests/file_manager_db_sample.test.ts` | nothing | File Manager **New sample database…** page flow and server operations (temp folder) |
| `tests/db/staging_*.test.ts` (reader and values, engine, API, page) | nothing for SQLite; `node` on PATH for the page test | The **Import with staging** engine on real SQLite: formats, encodings and a streaming memory bound, mapping, cell checks, every promote mode, dry run = real counts, rollback, undo and its refusal, injection through names/values/file names, caps, new tables, a 400,000-row load. With `TEST_MYSQL_URL` / `TEST_PG_URL` the same engine suite, the HTTP API in the MySQL and PostgreSQL studios, and the whole wizard in jsdom against each real studio server also run (each creates and drops a `bunrad_test_*` database). Throwaway servers: `docker run -d --name stg-mysql -e MYSQL_ROOT_PASSWORD=pw -p 127.0.0.1:33907:3306 mysql:8` and `docker run -d --name stg-pg -e POSTGRES_PASSWORD=pw -p 127.0.0.1:55437:5432 postgres:16`, then `TEST_MYSQL_URL='mysql://root:pw@127.0.0.1:33907' TEST_PG_URL='postgres://postgres:pw@127.0.0.1:55437/postgres'`. See [Import with staging](../databases/staging-import.md) |
| `tests/file_manager_db_import.test.ts`, `tests/file_manager_db_import_page.test.ts` | nothing | The File Manager side of **Import with staging**: the file, secret and production marks handed to a studio (started now, already running, or in its own window), path checks, the Databases-tab button and the right-click item in a fake browser |
| OS keychain test | macOS Keychain / Windows Credential Manager / libsecret | Uses a unique service name and removes its entry; falls back to checking the in-memory store |

`bun run test:db` runs all of the above. The full repository suite is still `bun test`.
