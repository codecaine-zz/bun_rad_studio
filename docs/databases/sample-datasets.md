# Sample databases

SQLite Studio, MySQL Studio and PostgreSQL Studio each have a **🌱 Seed Sample DB** button that opens **Sample databases**: a catalog of eleven production-style databases you can create in a few seconds, and the File Manager can create the same samples as new SQLite files. Use them to try the studios, practice SQL, test tools or demo a schema without touching real data.

> **All data is synthetic.** Every person, organization, identifier, price and event is produced by a seeded random generator. Real generic and brand drug names appear in the Medicare sample only as a realistic catalog; plan, contract, member and pharmacy ids, prices, rules and utilization are generated and are **not CMS data** and must never be presented as real. Each sample says so in its description, in its `_sample_info` table and in the dialog.

## The catalog

| Sample | What it is | Tables | Views | Example queries | Rows (Small / Medium / Large) | Shows off |
|---|---|---:|---:|---:|---|---|
| **Medicare Part D Formulary Builder** (flagship) | Formulary versions, tiers, utilization management, cost sharing, pharmacy networks and CMS-style export staging. | 41 | 9 | 11 | 12,051 / 50,176 / 331,131 | version workflow + status triggers, immutable published versions, tier-change report (LAG), step-therapy chains, CMS-style staging tables, materialized view (PostgreSQL) |
| Hospital EHR | Patients, encounters, diagnoses, procedures, orders, labs, medications, beds and scheduling. | 22 | 7 | 9 | 5,873 / 56,836 / 316,686 | ICD-10 / CPT-style codes, 30-day readmission (window LAG), lab reference ranges, bed occupancy, audit log |
| Health Insurance Claims Adjudication | Members, eligibility, providers, fee schedules, claims and lines, denials, remittances and accumulators. | 18 | 6 | 8 | 3,131 / 29,601 / 157,404 | claim header = sum of lines, CARC-style denials, remittance reconciliation, accumulators, duplicate detection |
| E-commerce Marketplace | Catalog, variants, inventory, orders, payments, shipments, returns, promotions and reviews. | 19 | 7 | 9 | 5,427 / 43,147 / 245,395 | category tree (recursive CTE), totals that reconcile, EAN-13 check digits, RFM segmentation, seasonality |
| Retail Banking and Double-Entry Ledger | Customers, accounts, an immutable double-entry ledger, cards, fraud alerts and loans. | 15 | 7 | 9 | 3,933 / 38,313 / 237,883 | balanced journal entries, immutable ledger triggers, IBAN mod-97 + Luhn checks, running balance, fraud velocity |
| HR and Payroll | Org chart, compensation, payslips, benefits, leave, reviews and training. | 17 | 6 | 8 | 3,830 / 44,139 / 189,861 | manager hierarchy (recursive CTE), net pay generated column, compa-ratio, attrition |
| Warehouse, Inventory and Supply Chain | Suppliers, purchase orders, receiving, lots with expiry, bin stock, pick tasks, shipments and cycle counts. | 19 | 6 | 8 | 2,870 / 31,053 / 214,768 | ABC classification, lot expiry, supplier on-time-in-full, cycle-count variance |
| Airline Reservations | Routes, flights, bookings and tickets, seats, check-in, baggage, loyalty, crew and maintenance. | 18 | 6 | 8 | 8,251 / 45,056 / 209,920 | unique seat per flight, load factor, on-time performance, payment = ticket sum |
| Project Management and Issue Tracker | Projects, sprints, epics, stories, bugs, workflow history, comments, labels, links and worklogs. | 13 | 6 | 9 | 2,678 / 36,198 / 217,991 | issue tree (self FK), workflow history, cycle time, sprint velocity, reopen detection |
| IoT Telemetry | Sites, gateways, devices, sensors, 15-minute readings, hourly roll-ups, alerts and maintenance. | 14 | 6 | 7 | 1,984 / 46,483 / 412,884 | time-series volume, moving averages (window frames), anomalies, hourly roll-up = raw data |
| SaaS Subscription Billing | Plans, subscriptions, usage metering, invoices, payments, dunning and MRR analytics. | 19 | 8 | 8 | 3,918 / 42,123 / 289,523 | generated columns, soft delete, JSON, MRR and cohort analytics, materialized view (PostgreSQL) |

Row counts are exact and identical on every engine. Counts of tables include nothing but the sample's own tables; every sample also gets three bookkeeping tables (below).

### The Medicare Part D Formulary Builder in more detail

Plan years (legacy coverage-gap benefit up to 2024, out-of-pocket-cap benefit from 2025), sponsors, contracts and plans with `H0000-001`-style ids, a drug catalog (RxNorm-style RXCUI, NDC-style product codes, USP-style categories and classes, DEA schedules), six tiers with copay and coinsurance by benefit phase, pharmacy channel and days supply, formularies with a **draft → in review → approved → published → retired** version workflow, drugs per version with prior authorization, step-therapy groups, quantity limits and age/gender limits, Part B vs D rules, pharmacy networks, claims, exceptions and appeals, a change log, an audit trail, and staging tables laid out like the CMS formulary, plan information and beneficiary cost files. Views include formulary by tier, drugs with UM flags, the tier-change report between versions and a coverage summary per plan. Triggers keep published versions immutable and write the audit trail when a version's status changes.

## What every sample contains

- Realistic normalized tables with primary and foreign keys, unique and CHECK constraints, NOT NULLs, defaults, sensible indexes, created/updated timestamps and soft-delete or audit patterns where natural.
- 6 to 9 views and 7 to 11 **example queries** (window functions, CTEs, recursive CTEs, joins across five or more tables).
- `_sample_info` (dataset id, version, seed, scale, reference date, creation time, synthetic-data notice), `_sample_dictionary` (every table, view and column described) and `_sample_queries` (the example queries, ready to run).
- Deterministic data: the same seed and scale always produce identical rows. Distributions are skewed and seasonal, and referential integrity is guaranteed. Views and queries use a fixed reference date stored in `_sample_info`, so results never drift.

How each engine is used:

| | SQLite | MySQL | PostgreSQL |
|---|---|---|---|
| Where it goes | a **new `.sqlite` file** (default) or, if no name is taken, the open database | a **new database** (default `sample_<id>`) | a **new schema** in the current database (default `sample_<id>`) |
| Documentation | `_sample_dictionary` table | `COMMENT` on every table and column, plus the table | `COMMENT ON` every table, column and view, plus the table |
| Types | text dates, 0/1 booleans, JSON checked with `json_valid` | `JSON`, `DATETIME`, `TINYINT(1)`, stored generated columns | `UUID`, `JSONB`, `TEXT[]`, `BOOLEAN`, identity columns, materialized views |
| Triggers | `BEGIN … END` triggers | `BEFORE`/`AFTER` triggers with `SIGNAL` | PL/pgSQL functions and triggers |

Adapted per dialect: enums are `CHECK … IN (…)` constraints on all engines (so data is identical), partial indexes exist on SQLite and PostgreSQL only, and materialized views exist on PostgreSQL only (other engines get a plain view with the same name).

## Using it in a studio

1. Click **🌱 Seed Sample DB**. Search the cards or filter by domain; arrow keys move between cards, Enter selects, Esc closes only this dialog.
2. Pick **Small** (instant), **Medium** or **Large** (a few hundred thousand rows; a progress bar shows loading, **Cancel** stops it and removes everything created so far). The dialog shows rows and an estimated time for each size.
3. Type the name of the new database / schema / file (a default is filled in) and press **Create sample database**.
4. When it finishes, **Open it** switches the studio to the sample. Below the summary the **Example queries** panel explains itself:
   - choose **one** query (title and comment are listed) or **All of them**,
   - **Put in the SQL editor** switches the studio to the sample (so the table names resolve), puts the query or queries in the SQL editor and also saves them under the studio's saved queries,
   - **Run it** runs the choice inside the dialog and shows the rows (or a plain-words reason if it could not run). Example queries only read data (`SELECT`); they run in a read-only transaction.

### Safety rules

- A new sample **never** touches anything that exists: an existing file, database or schema with that name is refused (409). A SQLite file is never overwritten, and *Open database* mode refuses if any table or view name is already used, listing the clashes.
- **Replace the sample's tables** only works on a target that already holds the same sample (its `_sample_info` names it), needs the confirmation box, and drops only the tables and views that sample defines. Your own tables in the same schema or database are left alone.
- A sample that fails or is cancelled is rolled back (PostgreSQL, SQLite) or removed again (MySQL, whose DDL cannot be rolled back), so no partial sample is left.
- *Open database* mode on SQLite runs without letting other requests in between (the connection is shared); a Large sample blocks the studio for a few seconds there. Creating a new file does not.
- The old `/api/seed` (and PostgreSQL `/api/seed-sample`) endpoints still create the small classic starter data.

New SQLite files go to the folder in `BUNRAD_SAMPLE_DIR`, or `~/bun_rad_samples` when it is not set.

## From the File Manager

**Find & more → Databases → New sample database…** creates a new SQLite file in a folder you choose: pick the sample and size, the folder (the folder you are looking at is filled in; none is created for you) and a file name. An existing file is never overwritten. The file is saved as a connection, so it can then be opened in a studio window, your browser or inside the tab like any other connection.

## API

| Request | What it does |
|---|---|
| `GET /api/samples/catalog` | every dataset with tables, views, relationships, example queries (written for this engine), rows and estimated seconds per scale |
| `POST /api/samples/seed` `{datasetId, scale, target, mode, confirm, wait}` | starts creating a sample (`mode` is `new` or `replace-sample-tables`; `target` may be `current` on SQLite); answers `202 {jobId}`, or the finished job with `wait: true` |
| `GET /api/samples/job?id=` | progress: phase, table, rows done and total, percent, result or error |
| `POST /api/samples/cancel` `{jobId}` | stops a running job |
| `POST /api/samples/open` `{target}` | points the studio at the created sample |
| `POST /api/samples/run` `{datasetId, queryId, target}` | runs one catalog query read-only against the sample and returns a preview (the SQL always comes from the catalog) |

## Tests

`tests/db_samples_*.test.ts` check every dataset on real SQLite (counts, foreign keys, integrity, determinism, every view and every example query, Large scale under 30 s) and, when `TEST_MYSQL_URL` / `TEST_PG_URL` are set, on real MySQL 8 and PostgreSQL 16 ([Database tests](../testing/database-tests.md)). `tests/db_samples_ui.test.ts` clicks the dialog's example-query buttons end to end in each studio and runs the inserted queries against the freshly created sample.
