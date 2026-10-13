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
