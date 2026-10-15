# Import with staging

"Load the records into staging first" is the careful way to bring incoming data into a database: **copy it into a scratch table, look at it, fix it, and only then move it into your real table.** SQLite Studio, MySQL Studio and PostgreSQL Studio each have an **📥 Import with staging** button for it, and the File Manager can open the wizard for a connection or for a data file. Every step is in plain words, every step can be repeated, and a finished import can be **undone**.

Redis Studio does not have it: staging, checking and promoting are ideas about *tables*, and Redis has none. Pretending would be misleading, so there is nothing to click there (the File Manager's button for a Redis connection is switched off and says why).

## The five steps

| Step | What happens | Your table |
|---|---|---|
| **1 · Source** | Choose a file (drop it, or pick it) or paste text. The studio works out the layout and shows the first rows. | Untouched |
| **2 · Map** | Choose the target table (or **Create a new table from this data**) and line the columns up. Clean-ups (trim, dates, numbers, yes/no…) are suggested for you. | Untouched |
| **3 · Load to staging** | The rows are copied into a **staging table** with a progress bar and a Cancel button. Cancel throws everything away. | Untouched |
| **4 · Check** | One click checks every row. You see what is wrong, row by row, in plain words, and can fix, skip or clean. Repeat as often as you like. | Untouched |
| **5 · Review & promote** | Choose what to do with the good rows, see exactly what would happen (a dry run), then promote them in one transaction. **Undo this import** puts things back. | Changed here, only here |

### 1 · Source

- **Formats:** CSV, TSV, semicolon- or pipe-separated text (and any other single-character separator you pick), a JSON list (`[ {…}, {…} ]`, or a list of lists), and JSON Lines / NDJSON (one record per line). You can also paste text.
- **Not supported: Excel (.xlsx, .xls, .ods).** Reading them would need a library this project does not ship, and a half-working reader would silently damage data. The wizard says so in plain words: in Excel choose *File → Save As → "CSV UTF-8"* and load that file. YAML, TOML and XML are not supported either.
- **Detected for you, and editable:** the text encoding (UTF-8, UTF-8 with a BOM, UTF-16 with or without a BOM in both byte orders, Latin-1 / Windows-1252), the separator, the quote character, whether the first row holds column names, and the line endings (CRLF, LF, CR, even mixed). Quoted values may contain separators, quotes (`""`) and line breaks. A row with too few or too many fields is not guessed at: it is kept and marked as a problem.
- **A live preview** shows the first rows with the current settings; change a setting and it reads the file again.
- **Big files:** the file is sent to the studio in 8 MB pieces and read as a stream, so a 500 MB file is never held in memory. Limits (with plain messages): files up to **2 GB**, up to **5,000,000 rows** per import, **500 columns**, and one row may not exceed **8 MB** (that usually means a quote was opened and never closed).
- **JSON numbers** longer than about 15 digits lose precision (that is how JSON is read by browsers and by Bun); put such values in a CSV instead. Fields that appear only after the first few thousand records of a JSON file are kept in the row's raw copy but get no column of their own.
- **Where the file goes:** only to the studio's own server on this computer (the page's own address, loopback only), into a private scratch folder (`<temp>/bunrad-staging-<user>`, owner-only) that is cleaned up when the import is loaded or after 24 hours. It is never sent over the network.

### 2 · Map

The columns are matched by name, ignoring case, underscores and plurals, plus common synonyms (`E-mail`/`email`, `Surname`/`last_name`, `Postcode`/`zip`, `Customer ID`/`id`…). You see two columns: the table column (type, *key*, *required*, *auto*) and where its value comes from, with the clean-ups after it:

| Clean-up | Does |
|---|---|
| Remove spaces / tidy spaces | trims, or trims and squeezes runs of spaces |
| Empty means no value (NULL) | `""` becomes NULL (added automatically for numbers, dates and the like) |
| UPPER / lower / Title Case | changes case |
| Keep digits only | for phone numbers and the like |
| Read as a date / date and time | `31/12/2022`, `12 Mar 2024`, `March 5, 2024`, `2024-03-04T10:00Z`… become `2022-12-31`. If day and month could be swapped (`03/04/2024`) the wizard asks which comes first (it starts from your browser's language) |
| Read as a number | `1,234.56`, `1.234,56`, `€ 1 234,50`, `(12.5)`, `7-` become plain numbers without rounding a digit |
| Read yes/no/Y/N/1/0 as true/false | for yes/no columns |
| Replace text · If empty, use a default | literal replacement; a default value |

A target column can also be filled by **joining several columns**, **splitting one column**, or **a fixed value**, or left alone (**skip**: the table's own default is used). Columns of the file that nothing uses are listed, and kept in the raw copy of each row.

Below the mapping: which columns say two rows are *the same* (the **key**, usually the primary key), and **your own checks** (must not be empty, matches a pattern, at least/at most, one of a list, length), each with an optional message of your own. A **preview of what will be loaded** shows the first rows after the clean-ups, with the cells the table would reject marked.

Mappings are remembered per table in this browser (`localStorage`), and offered again when the file has the same columns.

**Create a new table from this data:** pick a name (letters, digits, underscore), and the column types are guessed from the data (whole number, decimal, yes/no, date, date and time, JSON, UUID, text; numbers with a leading zero such as `007` stay text). Change any of them, choose which columns may be empty, and optionally add an automatic `id` primary key. The table is created when you promote, never before.

### 3 · Load to staging

**Naming convention (the same in every engine):** the staging table is created in the **same database, and for PostgreSQL the same schema, as the target** and is called

```
stg_<target>_<yyyymmdd>_<hhmm>        e.g. stg_customers_20261014_2054
```

(local time; a number is added if that name exists, and the target part is shortened for very long names). Why not a separate `staging` schema or database? It would need extra privileges, cannot be done in SQLite without `ATTACH`, and puts the data outside the transaction that promotes it. The `stg_` prefix and date make staging tables easy to find, and the **Staging area** lists them.

Its columns:

- the **data columns**: `TEXT` (`LONGTEXT` in MySQL), named like the target columns they will go into, holding the value after your clean-ups. Nothing is coerced or lost on the way in;
- `_stg_row_id` (identity primary key), `_stg_batch_id`, `_stg_source_file` (the file's name, never a path), `_stg_row_number` (the row as a spreadsheet numbers it: the header is row 1), `_stg_loaded_at`;
- `_stg_status` — `new`, `valid`, `invalid`, `duplicate`, `promoted`, `skipped`;
- `_stg_errors` — what is wrong, as JSON; `_stg_match` — `new`, `same` or `changed` compared with the target; `_stg_raw` — the row as it was in the file, kept whenever a clean-up changed it, a column was not used, or the row was damaged.

Rows go in as multi-row inserts inside **one transaction** (cancel rolls back and drops the staging table). In the studio's own in-memory SQLite database the connection is shared with the rest of the studio, so a cancelled or failed load drops the new staging table instead, which has the same effect. **The target table is never touched in this step.** The batch is recorded in `_import_batches`.

### 4 · Check

Each check can be repeated and only writes to the staging table.

| Check | How |
|---|---|
| Type of every cell (whole number, decimal, date, date and time, time, yes/no, UUID, JSON, allowed list of an enum), **size** (text length, decimal places and digits, integer range per type), **required** columns | one streaming pass, the same strict rules for every engine (MySQL, for example, would quietly turn `12abc` into `12`) |
| Your own checks | the same pass |
| **Repeats in the file** by key, and by every other unique index | set-based SQL, grouped on the converted value (so `01` and `1` are the same key) |
| **Rows that already exist** (`new`, `same` or `changed`) | set-based SQL against the target |
| **Foreign keys**: the value must exist in the parent table | set-based SQL |
| **Unique collisions** with other rows of the table | set-based SQL |
| The table's **own rules** (CHECK constraints, triggers, odd types) | the rows are tried against the table in a transaction that is always rolled back; when something is refused the range is halved until exactly the refused rows are found. Skipped on a protected connection (see below) and for more than 200,000 rows |

You get cards (rows, ready, problems, repeated, skipped, new, changed, same), a table of problems (row, column, the value, what is wrong, a suggested fix) with filters by column, **Fix…** (edit the staged cell), **Skip row**, **Skip all problem rows** (reversible), **Download the problem rows (CSV)**, **Clean a column…** (apply a clean-up to the whole staged column), and an **All staged rows** view. Changing anything asks for a new check before you can go on.

### 5 · Review & promote

| Choice | Does |
|---|---|
| **Add new rows only** | rows whose key is not in the table yet are inserted; the rest are left alone (needs a key) |
| **Add new rows and update existing ones (upsert)** | rows that exist are updated (you choose the columns), the rest are inserted (needs a key) |
| **Update existing rows only** | nothing is added (needs a key) |
| **Add every row, stop if one clashes** | all-or-nothing; the dry run warns when rows already exist |
| **Append all valid rows** | inserts the ready rows; no key needed; rows that clash with a unique value were already left out by the check |

The **dry run** shows how many rows will be added, updated, left alone and left out, a **before/after sample** of the rows to update (only values that really differ), a sample of rows to add, the **exact SQL** (copyable; no data values are typed into it, they come from the staging table), and whether the import can be undone. Unless the connection is protected it also does a **test run**: the real statements inside a transaction that is rolled back, so the counts are exactly the real counts and a refusal by the database (a CHECK rule, a trigger) shows up *before* you promote.

Promotion runs in **one transaction**. Upsert is done as an `UPDATE` of the rows that exist plus an `INSERT` of the rows that do not, not as `INSERT … ON CONFLICT`, `ON DUPLICATE KEY UPDATE` or `REPLACE`: that keeps exact counts for the dry run and the ledger, never deletes and re-creates a row (so cascading children are safe), and behaves the same in every engine. The statements use `UPDATE … FROM` (SQLite, PostgreSQL) or `UPDATE … JOIN` (MySQL). A very large import is still one transaction, so the database holds its locks for the whole run; split a huge file into several imports if that matters. In PostgreSQL, when explicit ids go into a `serial`/identity column, the sequence is moved past them.

**The ledger.** `_import_batches` has one row per import (batch id, file, target, staging table, mode, counts, timestamps, status, saved mapping); `_import_batch_changes` keeps, for undo, the primary keys of inserted rows and the previous values of updated rows, each with a fingerprint of how the row looked right after the import. Staging rows are marked `promoted` or `skipped`.

**Undo this import** removes the rows the import added and restores the old values of the rows it changed — but only if every one of those rows still looks the way the import left it. If anything was changed meanwhile, **nothing is touched** and the rows in the way are listed. Notes: undo needs a primary key on the table (otherwise the import says it is not undoable); in MySQL an import **without a key column** cannot tell which rows it added (MySQL has no `RETURNING`), so it is not undoable; binary columns are not part of the fingerprint; and undoing an import that created a table also drops that table, if it is empty again.

### Cleaning up: the Staging area

**🗂 Staging area** lists every import of the database with its staging table, rows, size (where the database can tell), age and status, and lets you **re-open** an import (the saved mapping is used and the rows are checked again), **export** the problem rows, **drop** the staging table (the record stays, so a promoted import can still be undone), or forget a finished record. Staging tables are kept (the page suggests **7 days**, then marks them) but **never dropped without you asking**. A staging table that has no record (an interrupted load) is listed too.

## Safety

- **Identifiers and values.** Table and column names always go through the database's own quoting and are checked against the real catalog; a target must be a real table. Values are only ever bound parameters (the staging table's text is converted *inside* the database with `CAST`). File contents are never executed. Hostile column names, values and file names are covered by tests.
- **Protected connections.** When the File Manager opens a studio for a connection marked **production** or **read-only**, promoting and undoing need the **table name typed** to confirm, and the test run that would briefly write to the table is not done (the counts are still exact). The File Manager asks its usual question before it opens such a studio at all.
- **Same protection as the studios' other routes.** The studio's server already refuses non-loopback `Host` headers and cross-origin requests. The staging routes additionally need the header `X-Studio-Staging: 1` (which a web page on another site cannot send without a pre-flight the studio never approves) and `application/json` bodies; uploads go only to the private scratch folder; and one step runs at a time.
- **No secrets in logs or messages.** Passwords are never in the page, the ledger or the saved mapping; database messages are shown without connection strings.
- The studios read an `.env` file in the folder they start in, like they always did; start a studio from a folder without one (or pass the connection through the File Manager) when you want to be sure which server it talks to.

## From the File Manager

- **Databases tool → a saved SQL connection → Import data with staging…** opens that connection's studio with the wizard — here in the tab, in its own window or in your browser (the same choices as the other buttons).
- **Right-click a CSV, TSV, JSON or JSON Lines file → Load into a database (staging first)…** asks for a saved connection (or a SQLite file's path) and where to open it, then opens the wizard **with that file already chosen**. Excel files get a disabled item that explains why.

How the file gets there: the File Manager checks the path (a real file of an importable kind, under 2 GB) and starts the studio with the file in its environment, or — for a studio that is already running — sends the path to the studio's `/api/staging/grant` route with a secret that only the File Manager and that studio know. The studio reads that exact file only after being granted it, and **never writes to it**.

## Tests

`tests/db/staging_reader.test.ts` (formats, encodings, streaming memory bound, values, mapping), `tests/db/staging_engine.test.ts` (every promote mode, dry run = real counts, rollback, undo and its refusal, injection, caps, new tables, a 400,000-row load; on SQLite always and on MySQL 8 and PostgreSQL 16 with `TEST_MYSQL_URL` / `TEST_PG_URL`), `tests/db/staging_api.test.ts` (the HTTP API in each studio, uploads, grants, production confirmation), `tests/db/staging_ui.test.ts` (the whole wizard in jsdom against each real studio server), `tests/file_manager_db_import.test.ts` and `tests/file_manager_db_import_page.test.ts` (the File Manager side). See [database tests](../testing/database-tests.md).

## See also

[Databases overview](index.md) · [SQLite Studio guide](../userguides/01_sqlite_studio.md#import-with-staging) · [MySQL Studio guide](../userguides/41_mysql_studio.md#import-with-staging) · [PostgreSQL Studio guide](../userguides/42_postgres_studio.md#import-with-staging) · [File Manager: Databases](../userguides/43_file_manager.md#databases-databases-tab)
