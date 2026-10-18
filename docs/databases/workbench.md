# Database Workbench (MySQL · PostgreSQL · SQLite)

The workbench is a shared database tool that opens from **SQLite Studio, MySQL Studio and Postgres Studio** (the
**🧰 Workbench** button, bottom-right) at `/workbench`, or on its own:

```sh
bun run src/db/workbench_server.ts      # prints the URL; set WORKBENCH_PORT to pick a port
```

It is additive: the existing studios are unchanged apart from that link and the security fixes listed below.

## Getting started

| Engine | What you need | Connection settings |
|---|---|---|
| SQLite | Nothing (built into Bun) | **Mode**: `readwrite` opens an existing file, `readonly` cannot write, `create` makes a **new** file (never overwrites), `memory` is temporary (data lost on disconnect). |
| MySQL 8+ / MariaDB | A running server and an account | Host, port (3306), user, password, database. Servers using `caching_sha2_password` over a non-TLS connection need `allowPublicKeyRetrieval` (off by default). |
| PostgreSQL | A running server and a role | Host, port (5432), user, password, database, schema (default `public`). |

1. **+ New connection**, fill the form, **Test**, then **Save**.
2. Click the connection to connect. The header shows its name, engine, version, database, **environment color**
   (green development · blue test · amber staging · red production) and **READ-ONLY** when applicable.
3. Pick a table in the explorer.

## Connections and credentials

* Profiles (name, folder, tags, favorite, environment, read-only, host/port/database, TLS) are saved in
  `~/.bun_rad_studio/connections.json` (mode 0600; override the folder with `STUDIO_DB_PROFILE_DIR`).
* **Passwords are never written to that file.** They go to the operating-system credential store through
  `Bun.secrets` (macOS Keychain, Windows Credential Manager, Linux libsecret). If the store is unavailable the
  page says so and passwords are kept **in memory only** for that run. Alternatively give a *password environment
  variable name* and the secret stays out of the tool entirely.
* Passwords are removed from error messages, are not logged and are never sent back to the browser (it only learns
  whether one is stored).
* TLS: tick *Use TLS*. Certificate verification stays **on**; a custom CA can be supplied in the profile
  (`tls: { ca }`); turning verification off needs `tls: { verify: false }` in the profile file and is not offered in the form.
* Limits: 4 pooled connections by default; connect timeout 10 s; optional per-statement timeout (see *Engine differences*).
* Disconnecting or switching connection is refused while a transaction is open, and the page warns before
  discarding unsaved row changes.
* Not implemented yet: SSH tunnels.

## Everyday workflow

* **Browse**: paged (50 rows by default, never more than 5000 per page), sorted by the primary key unless you click a
  column header, filter with *contains / starts with / = / ≠ / < / ≤ / > / ≥ / is NULL*. NULL is shown as *NULL*,
  distinct from an empty string. Binary values show their size.
* **Edit**: double-click a cell (the editor offers *NULL* for nullable columns); **+ Add row**; click a row and
  **Delete selected**. Changes are *pending* (highlighted) until you **Save**; **Preview changes** shows each
  operation; **Discard** drops them.
* **Editing is only offered when a row can be identified**: a primary key (composite keys supported) or, in SQLite,
  the rowid. Views and tables without a key are read-only and the banner says why.
* Each saved change updates **exactly one row**, matched by its key **and** the old values you saw. If someone else
  changed or deleted the row you get a conflict message and nothing is overwritten. Deleting always asks for confirmation.
* **Structure** tab: columns, types, keys, foreign keys (click to jump to the referenced table), indexes.
* **Export CSV**: streams the whole table (RFC 4180, UTF-8 with BOM for spreadsheets). NULL is written as an empty
  field and the empty string as `""`, so they stay distinguishable. Binary is written as base64.

## SQL editor and transactions

* **Run statement** runs one statement (parameters can be sent separately by the API); **Run script** splits the text
  with a real tokenizer (quotes, comments, PostgreSQL `$$…$$`, MySQL `DELIMITER`, SQLite trigger bodies) and runs the
  statements in order, **stopping** or **continuing** on error as you choose. *All-or-nothing* wraps the script in a
  transaction (not possible for MySQL DDL, which commits implicitly).
* Results show row count, time and are labeled **read-only result**. Result sets are limited to 1000 rows (`truncated` is reported).
* **Begin / Commit / Rollback** control one explicit transaction per connection; the header shows *transaction open*.
  On MySQL/PostgreSQL the grid's row edits use their own connection and are refused while a SQL transaction is open;
  on SQLite they join it.
* **Cancel** asks the server to stop the running statement (PostgreSQL `pg_cancel_backend`, MySQL `KILL QUERY`).
  SQLite cannot be interrupted; the button is disabled and says so.

## Safety

* **Read-only connections** are enforced below the UI: SQLite opens the file read-only; PostgreSQL runs each statement
  in `BEGIN READ ONLY` (always rolled back); MySQL uses a session-level read-only setting (which also blocks DDL).
  A statement filter additionally rejects writes, transaction control and `SET` tricks, and multiple statements per
  request. The filter is defense in depth, **not** the boundary — for a hard guarantee use a database account without
  write privileges (verified by the *insufficient privileges* test).
* **Confirmations are enforced by the server.** Dropping, truncating, `DELETE`/`UPDATE` without `WHERE`,
  `ALTER … DROP`, administrative or unrecognized statements, and row deletes return a one-time token bound to that exact
  operation; the dialog shows the connection, database, environment and statements. **Production** connections confirm
  every write and require typing the connection name. Tokens expire after 2 minutes and work once.
* Everything the database returns is inserted as text, never HTML. API calls need a per-process token, a loopback
  `Host`, a same-origin `Origin` and a JSON content type.

## Import/export versus backup/restore

| | What it is | Restore tested? |
|---|---|---|
| **Export CSV** | Rows of one table, for use elsewhere | n/a – it is not a backup |
| SQL dump (legacy studios) | A generated script | Not verified; do not rely on it as a backup |
| **SQLite backup** (`POST /api/v2/sqlite/backup`) | `VACUUM INTO`: a consistent copy of a *live* database including WAL contents, opened and integrity-checked before it is reported | **Yes** – restore creates a **new** file after a preview (tables, row counts, integrity) and a confirmation token; existing files are never overwritten |
| MySQL / PostgreSQL backup | Not yet provided here (needs `mysqldump` / `pg_dump` detection) | – |

Import (CSV/JSON/SQL with mapping, preview and error reports) is not implemented yet in the workbench; the legacy
studios keep their existing basic import.

## Engine differences you will notice

| | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| Schemas | none | = database | yes (`schema.table`) |
| DDL in a transaction | yes | **no** (implicit commit) | yes |
| Statement timeout | none (only lock wait, `statementTimeoutMs`, default 5 s) | `max_execution_time`, **SELECT only** | `statement_timeout`, cancels the statement |
| Cancel | no | yes | yes |
| Exact numbers | integers exact; `DECIMAL` stored as text/real per column affinity | `BIGINT`/`DECIMAL` returned as exact strings | `bigint`/`numeric` returned as exact strings |
| Dates | stored as text/numbers | `DATETIME` shown as stored text (no zone conversion) | `timestamptz` shown as UTC instant (ISO) |
| Foreign keys | enforced per connection (turned on by the workbench, never persisted) | InnoDB | yes |

Journal mode (WAL) and other database-wide PRAGMAs are never changed by the workbench.

## Platform requirements

Bun 1.4+. Credential storage needs the OS store (Linux: libsecret/`secret-tool` available to Bun). Tested on
macOS (arm64) only by hand. The Workbench's automated tests also pass on Linux in CI; Windows was not checked for them specifically ([Testing](../testing/index.md#other-platforms)).

## Troubleshooting

| Message | Likely cause |
|---|---|
| `CONNECTION_REFUSED` | Server not running, wrong host/port. |
| `AUTH_FAILED` | Wrong user/password, or the account may not connect from this host. |
| `DATABASE_NOT_FOUND` | Database name typo, or (SQLite) file missing – use mode *create* to make a new one. |
| `TLS_ERROR` | Certificate/CA problem; supply the CA rather than disabling verification. |
| `PERMISSION_DENIED` | The account lacks the privilege; use another profile. |
| `LOCKED` | Another session holds a lock (SQLite: raise `statementTimeoutMs`, or close the other writer). |
| `CONFLICT` | The row changed since you loaded it: refresh and re-apply. |
| `NOT_EDITABLE` | View, or table without a primary key. |
| `READ_ONLY` | Read-only profile or a statement that is not a read. |
| `CONNECTION_LOST` | The server dropped the session; reconnect. |

## Known limitations (this release)

* Duplicate column names in one result (`SELECT a.id, b.id`) collapse into one on MySQL/PostgreSQL (driver returns objects); alias them.
* Ad-hoc result limits on MySQL/PostgreSQL are applied after the rows are fetched; table browsing and export are bounded in the database. Deep `OFFSET` paging gets slower on very large server tables.
* Float/double columns are not used for conflict detection (inexact equality).
* The legacy studios still rely on client-side confirmations for their own destructive buttons; the workbench enforces them on the server.
* Query history, autocomplete, import wizard, schema designer/migrations, ER diagram, MySQL/PostgreSQL backup, session/lock views and RAD-IDE data binding are planned (see the plan in the repository history).

## Security fixes in the legacy MySQL/PostgreSQL studios

Identifier and literal quoting was made consistent (`"` / `` ` `` doubled, string literals escaped incl. MySQL
backslashes); PostgreSQL `set-schema` only accepts existing schemas; `redesign-table` no longer drops the original
table when copying data fails (and swaps tables atomically); type/default fragments cannot contain `;`/comments;
MySQL truncate/drop report real failures; MySQL scripts use the shared tokenizer. Regression tests:
`tests/db/studio_injection.test.ts`.
