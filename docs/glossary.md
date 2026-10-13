# Glossary

Plain-language definitions of the words this handbook and the project use. Each entry says what the word means, **why it matters here**, a short **example**, **related** terms and **where to read more**. Abbreviations are spelled out at their entry. If a word you meet is missing, add it (see the [inventory of terms](documentation-maintenance/glossary-inventory.md) and the [style guide](documentation-maintenance/style-guide.md)).

## Contents

[A](#a) · [B](#b) · [C](#c) · [D](#d) · [E](#e) · [F](#f) · [G](#g) · [H](#h) · [I](#i) · [J](#j) · [L](#l) · [M](#m) · [N](#n) · [O](#o) · [P](#p) · [Q](#q) · [R](#r) · [S](#s) · [T](#t) · [U](#u) · [V](#v) · [W](#w)

## A

### Adapter
A small module that lets the Database Workbench talk to one kind of database (SQLite, MySQL or PostgreSQL) through the same set of operations. **Why it matters:** the Workbench screens are the same for all three; only the adapter differs. **Example:** "list tables" asks the adapter, which runs the right catalog query for that engine. **Related:** [Capability](#capability), [Connection](#connection). **See:** [Workbench guide](databases/workbench.md), source `src/db/adapters/`.

### API (application programming interface)
The set of functions or web addresses one program offers to another. **Why it matters:** the designer page talks to the desktop program through a few named functions, and every studio's local server has an `/api/...` address the page calls. **Example:** `POST /api/exec` in Code Studio. **Related:** [Binding](#binding), [Loopback](#loopback). **See:** [API.md](API.md), [SimpleGUI API](SIMPLEGUI_API.md).

### App Bundler
App Bundler Studio (and `cli:bundler`): compiles a program into a single executable and packages it as a macOS `.app` bundle with an icon. **Why it matters:** it is how a finished project becomes something you can double-click. **Related:** [Build](#build), [Bundle](#bundle), [Executable](#executable). **See:** [Application index](reference/application-index.md#studios) (the launch command only; packaging itself was not run for this handbook).

### Application
In this project, a program you start from `applications/`: a [studio](#studio). The launcher also lists command-line tools and demos. **Related:** [CLI tool](#cli-tool-command-line-interface), [Demo](#demo), [Launcher](#launcher). **See:** [Application index](reference/application-index.md).

### Autocommit
A mode where each SQL statement is saved by the database as soon as it runs, with no chance to undo it. **Why it matters:** inside a [transaction](#transaction) the Workbench turns this off so you can review and then [commit](#commit) or [roll back](#rollback). **Example:** an `UPDATE` run with autocommit on is permanent immediately. **See:** [Workbench guide](databases/workbench.md#sql-editor-and-transactions).

## B

### Backup
A copy of your data from which it can be restored. **Why it matters:** an [export](#export) is not a backup. Only the SQLite backup in the Workbench is restore-tested; it makes a consistent copy of a live database and restore creates a new file instead of overwriting. **Related:** [Export](#export), [WAL](#wal-write-ahead-log). **See:** [Workbench guide](databases/workbench.md#importexport-versus-backuprestore), [Update and remove](getting-started/update-and-remove.md#back-up-before-removing).

### Baseline (type-check)
The recorded number of TypeScript errors per file in `scripts/typecheck_baseline.json`. **Why it matters:** `bun run typecheck` fails only if a file gets more errors than its baseline. **Related:** [Ratchet](#ratchet), [TypeScript](#typescript). **See:** [Testing](testing/index.md#type-check-ratchet).

### Big integer
A whole number too large for JavaScript's ordinary number type to hold exactly (beyond 9,007,199,254,740,991). **Why it matters:** the Workbench sends such values to the page as text so no digit is lost; neighbouring big values stay distinguishable. **Example:** a `BIGINT` key of 9007199254740993. **Related:** [Exact decimal](#exact-decimal), [Typed parameter](#typed-parameter). **See:** `src/db/wire.ts`, [Workbench guide](databases/workbench.md).

### Binding
A named function the desktop program registers so the page inside the window can call it. **Why it matters:** bindings are the only way page code reaches the desktop side (for example `runPreview`, `exportProject`, `quitApp`). **Example:** the Export button calls the `exportProject` binding. **Related:** [Webview](#webview), [API](#api-application-programming-interface). **See:** [API.md](API.md#4-webview-ipc--backend-bindings).

### Brewfile
A Homebrew list of packages to install with `brew bundle --file ./Brewfile`. **Why it matters:** the project keeps its optional system tools (media, audio and graphics programs) there; `Brewfile.optional` holds optional cross-compilation tools. **Related:** [Homebrew suite](#homebrew-suite). **See:** [Homebrew suite guide](HOMEBREW_SUITE_GUIDE.md).

### Build
Turning source code into something you can run or ship, here with `bun run build`, which writes to `dist/`. **Related:** [Bundle](#bundle), [Executable](#executable). **See:** [Script index](reference/script-index.md).

### Bun
The JavaScript and TypeScript runtime that runs every part of this project (instead of Node.js). **Why it matters:** you install it once and use it for running, testing and installing. Version 1.4.2 was used for verification. **See:** [Requirements](getting-started/requirements.md#bun-required).

### Bundle
Several source files combined into one output file. **Related:** [Build](#build), [Executable](#executable). **See:** App Bundler Studio in the [application index](reference/application-index.md).

## C

### Capability
A statement of what a connected database engine supports (for example transactions, or editing rows safely). **Why it matters:** the Workbench disables a feature and says why when the engine or table cannot support it. **Example:** a table with no [primary key](#primary-key) cannot be edited safely, so editing is switched off with an explanation. **Related:** [Adapter](#adapter). **See:** [Workbench guide](databases/workbench.md).

### Certificate
A signed document that proves a server is who it claims to be, checked during [TLS](#tls-transport-layer-security). **Why it matters:** the Workbench keeps certificate checking on; a custom certificate authority can be supplied in the profile. **Related:** [TLS](#tls-transport-layer-security). **See:** [Workbench guide](databases/workbench.md#connections-and-credentials).

### CLI tool (command-line interface)
A program you run by typing a command, with no window. **Why it matters:** the project has about 78 of them in `cli_apps/`. They run when started, so they cannot be loaded as modules by tests. **Related:** [Studio](#studio). **See:** [Application index](reference/application-index.md#command-line-tools).

### Code translation
Turning a macro, saved query or SQL text into a standalone program (Python, Bun or V) that uses that language's own SQLite driver. **Why it matters:** values typed by a user are always passed as parameters, never glued into SQL; constructs that cannot be translated are reported as warnings. The generated text is checked by tests but not executed. **Related:** [Macro](#macro), [Generated code](#generated-code). **See:** `applications/studio_codegen.ts`, [Generated applications](generated-applications/index.md).

### Column
One named field of a [table](#table), for example `email`. **Related:** [Row](#row), [Primary key](#primary-key).

### Commit
Saving the changes made in a [transaction](#transaction) permanently. **Related:** [Rollback](#rollback). **See:** [Workbench guide](databases/workbench.md#sql-editor-and-transactions).

### Component
A building block of a form. In the designer's palette the word is used for both [controls](#control) you can see and [non-visual components](#non-visual-component). **Related:** [Control](#control), [Palette](#palette).

### Confirmation token
A one-time code the Workbench server hands out before a risky operation, tied to that exact operation. **Why it matters:** it proves you saw the dialog; it works once and expires after 2 minutes. **Example:** `DROP TABLE` returns a token; the dialog shows the connection, database and statement before you confirm. **Related:** [Environment label](#environment-label), [Read-only](#read-only). **See:** [Workbench guide](databases/workbench.md#safety).

### Connection
An open channel from a program to a database. **Related:** [Connection profile](#connection-profile), [Session](#session). **See:** [Workbench guide](databases/workbench.md#connections-and-credentials).

### Connection profile
A saved set of connection settings: name, folder, tags, environment, read-only flag, host, port, database and TLS options. **Why it matters:** profiles are stored in `~/.bun_rad_studio/connections.json`; passwords are never written to that file. **Related:** [Credential store](#credential-store), [Environment label](#environment-label). **See:** [Workbench guide](databases/workbench.md#connections-and-credentials).

### Constraint
A rule the database enforces on a table, such as "this column may not be empty" or "this value must exist in another table" ([foreign key](#foreign-key)). **Why it matters:** a failed constraint is why an insert or edit can be refused. **Related:** [Primary key](#primary-key), [Foreign key](#foreign-key).

### Control
A visible element on a form: button, text box, table and so on. The designer palette has 95. **Related:** [Component](#component), [Control specification](#control-specification-controlspec), [Property](#property). **See:** [API.md](API.md#3-supported-component-reference), [Visual designer](visual-designer/index.md).

### Control specification (`ControlSpec`)
The JSON object that describes one control: `id`, `control_type`, `text`, position, size, `event_handlers` and more. **Related:** [Form spec](#form-spec-formspec). **See:** [API.md](API.md#2-control-specification-object).

### CORS (cross-origin resource sharing)
Rules that tell a browser whether a web page from one address may read answers from another address. **Why it matters:** many studio servers once answered `Access-Control-Allow-Origin: *`, letting any web page talk to them; they now also refuse foreign origins through the [loopback guard](#loopback-guard). **Related:** [Origin](#origin). **See:** [D-012](documentation-maintenance/discrepancies.md#d-012).

### Credential store
The operating system's safe place for passwords (macOS Keychain, Windows Credential Manager, Linux libsecret). **Why it matters:** the Workbench saves passwords there; the older MySQL and PostgreSQL studios use a plain `.env` file instead. **Related:** [Secret](#secret), [`.env` file](#env-file). **See:** [Workbench guide](databases/workbench.md#connections-and-credentials), [Environment variables](reference/index.md#environment-variables).

### CRUD (create, read, update, delete)
The four basic things you do with stored records. **Example:** the designer's "Data CRUD" template is a sample form layout; it is not connected to a database. **See:** [D-002](documentation-maintenance/discrepancies.md#d-002).

### CSV (comma-separated values)
A plain-text table where each line is a row and commas separate columns. **Why it matters:** the Workbench exports a table as CSV and keeps SQL `NULL` distinct from an empty value. **Related:** [NULL](#null). **See:** [Workbench guide](databases/workbench.md#importexport-versus-backuprestore).

## D

### Database
An organised collection of tables. **Example:** a SQLite database is one file; MySQL and PostgreSQL databases live inside a server. **Related:** [Database server](#database-server), [Schema](#schema).

### Database server
A separate program that holds databases and answers requests (MySQL, PostgreSQL). SQLite has no server. **See:** [Databases overview](databases/index.md#the-three-engines-at-a-glance).

### Demo
A small example program in `demos/`, shown by the launcher. **Related:** [Studio](#studio). **See:** [Application index](reference/application-index.md#demos).

### Dependency
A package your code needs in order to run. **Why it matters:** `bun install` fetches them; `bun.lock` records exact versions. **Related:** [Lockfile](#lockfile), [Package](#package).

### Design time / runtime
Design time is while you arrange a form in the designer; runtime is while the finished form runs. **Why it matters:** the designer's database controls are only placeholders at design time and nothing connects to a database. **See:** [D-002](documentation-maintenance/discrepancies.md#d-002).

### `dist/`
The folder `bun run build` writes to (a bundled library, the designer page and copies of the API documents). **Why it matters:** it is regenerable and git-ignored; do not edit it. **Related:** [Build](#build). **See:** [Data and files](reference/data-and-files.md).

### DNS rebinding
An attack where a hostile web address is made to point at your own machine so that a web page can reach a local server. **Why it matters:** the loopback guard refuses any request whose `Host` is not a loopback name. **Related:** [Loopback guard](#loopback-guard). **See:** [D-012](documentation-maintenance/discrepancies.md#d-012).

### Driver
The code that speaks one database's network protocol. **Why it matters:** the Workbench reaches MySQL and PostgreSQL through Bun's built-in `SQL` client and SQLite through `bun:sqlite`; no separate driver packages are installed. **Related:** [Adapter](#adapter).

## E

### Encoding
The rule that turns characters into bytes (usually UTF-8). **Why it matters:** wrong encoding shows up as garbled text; the project keeps [Unicode](#unicode) values exact. **Related:** [Unicode](#unicode).

### `.env` file
A plain-text file of `NAME=value` lines in the folder where a program is started. **Why it matters:** the older MySQL and PostgreSQL studios read it, copy every value into their environment and replace values already set. It is git-ignored but not encrypted. **Related:** [Environment variable](#environment-variable), [Credential store](#credential-store). **See:** [Environment variables](reference/index.md#environment-variables), [D-009](documentation-maintenance/discrepancies.md#d-009).

### Environment label
A tag on a connection profile: development, test, staging or production. **Why it matters:** production connections confirm every write and require typing the connection name. **Related:** [Confirmation token](#confirmation-token). **See:** [Workbench guide](databases/workbench.md#safety).

### Environment variable
A named setting passed to a program by the system, such as `PORT` or `MSQL_HOST`. **See:** [Environment variables](reference/index.md#environment-variables).

### Environment Vault
A studio that edits `.env`-style files of `NAME=value` settings. **Why it matters:** it writes the file you choose, and such files can hold [secrets](#secret); its built-in sample text contains made-up keys, not real ones. **Related:** [`.env` file](#env-file), [Environment variable](#environment-variable). **See:** [Application index](reference/application-index.md#studios).

### Event
Something that happens to a control, such as a click or a change. **Related:** [Event handler](#event-handler). **See:** [API.md](API.md#supported-event-handlers--callback-signatures).

### Event handler
The code or function name attached to an event. **Why it matters:** in an exported project the generated handlers only log a message; you add your own code in `index.ts`. **Related:** [Export](#export). **See:** [Generated applications](generated-applications/index.md).

### Exact decimal
A number with decimal places that is carried as text so that it is never rounded by binary floating point. **Why it matters:** money and measurements read from a database must come back digit for digit. **Example:** `0.10` stays `0.10`, not `0.1000000000000000055`. **Related:** [Big integer](#big-integer), [Typed parameter](#typed-parameter). **See:** `src/db/wire.ts`.

### Executable
A single file you can run without installing the source. **Related:** [Build](#build), [Bundle](#bundle).

### Export
Writing data or a project out in a form other programs can use. **Why it matters:** the designer's export creates a Bun project (`index.html`, `index.ts`, `package.json`) and keeps timestamped `.bak` copies of files it would overwrite. A CSV export of a table is not a [backup](#backup). **See:** [Visual designer](visual-designer/index.md#exporting), [D-022](documentation-maintenance/discrepancies.md#d-022).

## F

### Fixture
Prepared data or files a test uses. **Example:** a throwaway SQLite database created for one test. **Related:** [Throwaway database](#throwaway-database).

### Foreign key
A column that refers to the primary key of another table. **Related:** [Primary key](#primary-key).

### Form spec (`FormSpec`)
The JSON document the designer keeps for a whole form: title, size, colours and a `controls` list. **Why it matters:** it is what **Import** accepts, what the JSON tab shows and what all code tabs are generated from. **Related:** [Control specification](#control-specification-controlspec), [Generated code](#generated-code). **See:** [API.md](API.md#1-formspec-data-model-schema), [Importing a layout](visual-designer/index.md#importing-a-layout).

### Frontend / backend
The frontend is what you see (the HTML page); the backend is the program behind it that does files, processes and databases. **Why it matters:** they talk through [bindings](#binding) or a local web server.

## G

### Generated code
Source text produced by a tool, such as the designer's Bun TS, HTML, React, Vue 3 and Python tabs and the exported project. **Why it matters:** untrusted values must be escaped before they go into it ([D-021](documentation-maintenance/discrepancies.md#d-021)). **See:** [Generated applications](generated-applications/index.md).

### Graveyard
Rip Studio's holding folder: instead of deleting a file for good, Rip moves it there so it can be brought back. **Related:** [Rip](#rip). **See:** [Rip Studio guide](userguides/18_rip_studio.md) (generated, not verified).

## H

### Handler
Short for [event handler](#event-handler).

### Headless mode
Running a studio with `--server`: it starts its local web server and shows no native window, so you open the page in a browser. **Why it matters:** about 32 studios support it and the smoke test starts each one. **Related:** [Loopback](#loopback). **See:** [Testing](testing/index.md#application-smoke-test).

### Homebrew suite
The project's way of installing its programs as commands (`codecaine`, `codecaine-calc`, ...): `install_homebrew_suite.sh`, the formulas in `Formula/` and the generated [wrappers](#wrapper). **Why it matters:** the local `bin/` wrappers were checked; installing through Homebrew itself was not verified end to end. **Related:** [Brewfile](#brewfile), [Wrapper](#wrapper). **See:** [Homebrew suite guide](HOMEBREW_SUITE_GUIDE.md).

## I

### IDE (integrated development environment)
A program for writing and building software. **Why it matters:** the project calls the visual form designer "the IDE". **See:** [Visual designer](visual-designer/index.md).

### Import
Reading data or a layout in. **Why it matters:** the designer's Import checks pasted JSON first and leaves your form unchanged when it is not usable. **See:** [Importing a layout](visual-designer/index.md#importing-a-layout), [D-018](documentation-maintenance/discrepancies.md#d-018).

### Index (database)
A structure that makes lookups on a column faster. Not to be confused with `index.ts` or the handbook index pages.

## J


### JSON (JavaScript Object Notation)
A plain-text format for structured data: objects in braces, lists in brackets. **Why it matters:** the [form spec](#form-spec-formspec), the Workbench's requests and connection profiles are all JSON. **Example:** `{"title": "Form1", "controls": []}`. **Related:** [Form spec](#form-spec-formspec).

## L

### Launcher
The program that lists every studio, command-line tool and demo and starts them (Launcher Studio Pro, with a command-line companion). **See:** [Install and first launch](getting-started/install-and-first-launch.md#step-5-open-the-launcher).

### Lockfile
`bun.lock`, which records the exact version of every dependency. **Why it matters:** CI installs with `--frozen-lockfile`, so a lockfile out of step with `package.json` fails. **Related:** [Dependency](#dependency).

### Loopback
The address `127.0.0.1` (also `localhost`), which only the same computer can reach. **Why it matters:** every studio server binds to it so other machines cannot connect. **Related:** [Loopback guard](#loopback-guard). **See:** [D-013](documentation-maintenance/discrepancies.md#d-013).

### Loopback guard
`guardLocalRequest` in `src/localGuard.ts`: it answers `403 Forbidden` to a request whose `Host` is not a loopback name or whose `Origin` is not the server's own. **Why it matters:** it stops web pages in your browser from driving local servers. Plain tools such as `curl` send no `Origin` and are unaffected. **Related:** [CORS](#cors-cross-origin-resource-sharing), [DNS rebinding](#dns-rebinding), [Origin](#origin). **See:** [D-012](documentation-maintenance/discrepancies.md#d-012).

## M

### Macro
A saved sequence of steps in the SQLite, MySQL and PostgreSQL studios (run SQL, insert a record, ask for a value, and so on), in the style of Microsoft Access macros. **Why it matters:** macros are your work: they are saved under `~/.bun_rad_studio/macros`; steps that ask the user for a value pass it as a parameter. **Related:** [Code translation](#code-translation), [QBE](#qbe-query-by-example). **See:** [Data and files](reference/data-and-files.md).

### Manifest (`bin/manifest.json`)
The list of generated `codecaine-*` command wrappers. **Related:** [Wrapper](#wrapper).

### Migration
A step that changes a database or a saved file format to a newer version. This project has not changed any saved file format so far.

## N

### Non-visual component
A tray item on a form that has no appearance of its own, such as a timer or a dialog (`db_connection`, `http_client`, `notification`, `open_dialog`, `save_dialog`, `timer`). **Related:** [Control](#control). **See:** [API.md](API.md#non-visual-tray-components).

### NULL
The database value meaning "no value". It is different from an empty text and from the number 0. **Why it matters:** the Workbench shows and exports it distinctly. **Related:** [CSV](#csv-comma-separated-values).

## O

### Origin
The web address a page was loaded from (scheme, host and port). Browsers send it with cross-site requests. **Related:** [CORS](#cors-cross-origin-resource-sharing), [Loopback guard](#loopback-guard).

## P

### Package
A bundle of reusable code installed with `bun install`, such as `webview-bun`. **Related:** [Dependency](#dependency).

### Palette
The designer's side panel of controls to place on a form. Clicking an item enters placement mode; you then click the canvas. **See:** [Visual designer](visual-designer/index.md#what-was-checked).

### Primary key
The column or columns that identify one row uniquely. **Why it matters:** the Workbench edits a row only through its full primary key and detects conflicting changes. **Related:** [Foreign key](#foreign-key), [Capability](#capability).

### Property
A setting of a control, such as text, position, colour or tooltip, edited in the designer's side panel. **Related:** [Control](#control).

## Q

### QBE (query by example)
Building a query by filling in a grid (tables, fields, criteria) instead of writing [SQL](#sql-structured-query-language), as in Microsoft Access. **Why it matters:** the studios' visual query designer produces the SQL for you. **Related:** [Query](#query), [Macro](#macro).

### Query
A request to a database, written in [SQL](#sql-structured-query-language). **See:** [Workbench guide](databases/workbench.md#sql-editor-and-transactions).

## R

### RAD (rapid application development)
Building programs quickly by arranging ready-made controls instead of coding every part. **Why it matters:** the project's name; the designer follows the Delphi and Visual Basic style. **See:** [Visual designer](visual-designer/index.md).

### RAD utility modules (`rad`)
A set of about 44 small helper modules (files, strings, arrays, crypto, time, HTTP, SQLite and more) in `src/features/rad/`. **Why it matters:** they are exported through the `rad` namespace; some names clash with SimpleCLI's, so reach them as `rad.<module>.<name>` ([D-027](documentation-maintenance/discrepancies.md#d-027)). **Related:** [SimpleCLI](#simplecli).

### Ratchet
A check that lets existing problems stay but forbids new ones. **Example:** `bun run typecheck`. **Related:** [Baseline](#baseline-type-check). **See:** [Testing](testing/index.md#type-check-ratchet).

### Read-only
A connection setting that blocks writes. **Why it matters:** it is enforced below the user interface, but the strongest guarantee is a database account that lacks write permission. **Related:** [Confirmation token](#confirmation-token). **See:** [Workbench guide](databases/workbench.md#safety).

### Regression test
A test added after a bug, which fails on the old code and passes on the fixed code. **Example:** `tests/ide_html.test.ts` for the designer defects. **See:** [Testing](testing/index.md).

### Rip
Rip Studio, a safer replacement for `rm` that moves files to a [graveyard](#graveyard). **See:** [Application index](reference/application-index.md#studios).

### Rollback
Undoing the changes of an open [transaction](#transaction). **Related:** [Commit](#commit).

### Row
One record in a table. **Related:** [Primary key](#primary-key).

### Runtime
The program that runs your code. **Why it matters:** here it is [Bun](#bun), which also installs packages and runs tests. In the designer, "runtime" can also mean "when the finished form runs" ([design time / runtime](#design-time--runtime)).

## S

### Schema
The structure of a database: tables, columns and the rules between them. **Why it matters:** in PostgreSQL a schema is also a namespace inside a database; in MySQL "schema" means the database itself; JSON also has "schemas". Read the context. **Related:** [Database](#database).

### Secret
Any value that must not be shared: a password, a key, a token. **Why it matters:** secrets do not belong in source, logs, examples or exported projects. **Related:** [Credential store](#credential-store), [`.env` file](#env-file).

### Session
One continuous period of a connection, with its own transaction state. **Related:** [Connection](#connection), [Transaction](#transaction).

### SimpleCLI
The project's library for command-line tools (flags, prompts, coloured output, logging), in `src/simplecli/`. **Why it matters:** most of the `cli_apps/` use it. **Related:** [SimpleGUI](#simplegui), [CLI tool](#cli-tool-command-line-interface), [RAD utility modules](#rad-utility-modules-rad).

### SimpleGUI
The project's code library for building windows by writing code, as an alternative to the visual designer (`SimpleWindow`, `SimpleControlRef`). **See:** [SimpleGUI API](SIMPLEGUI_API.md).

### SQL (structured query language)
The language used to ask relational databases for data and to change it. **Related:** [Query](#query).

### Statement splitter
Code that cuts a SQL script into separate statements at the semicolons that really end them, ignoring semicolons inside quotes and comments. **Why it matters:** the Workbench runs a script one statement at a time and reports the line of a failure. **Related:** [Query](#query), [Transaction](#transaction). **See:** `src/db/splitter.ts`.

### Studio
The project's word for a windowed application, such as SQLite Studio Pro or Code Studio. **Related:** [CLI tool](#cli-tool-command-line-interface), [Demo](#demo), [Headless mode](#headless-mode). **See:** [Application index](reference/application-index.md#studios).

## T

### Table
Rows and columns of data in a database. In the designer, `table` is also a control.

### Theme
A named set of colours (form, controls, buttons) for a form or window. **Why it matters:** the designer applies one to every control, and since [D-019](documentation-maintenance/discrepancies.md#d-019) its button text always reaches the [contrast](#wcag-contrast) rule. The documents disagree on how many themes exist: 63 (README), 76 ([THEMES.md](THEMES.md)) and 51 in the designer's theme list ([D-028](documentation-maintenance/discrepancies.md#d-028)). **See:** [THEMES.md](THEMES.md).

### Throwaway database
A temporary database created for one test and removed afterwards, so tests never touch real data. **See:** [Database tests](testing/database-tests.md).

### TLS (transport layer security)
Encryption of a network connection. **Why it matters:** the Workbench keeps certificate checking on; turning it off needs an explicit profile setting. **See:** [Workbench guide](databases/workbench.md#connections-and-credentials).

### Transaction
A group of changes that is saved together or not at all. **Related:** [Autocommit](#autocommit), [Commit](#commit), [Rollback](#rollback). **See:** [Workbench guide](databases/workbench.md#sql-editor-and-transactions).

### Typed parameter
A value passed to a database separately from the SQL text and tagged with its type (text, number, big integer, exact decimal, binary, ...). **Why it matters:** this is what prevents SQL injection and keeps values exact; the Workbench treats SQL-looking parameters as data. **Related:** [Big integer](#big-integer), [Exact decimal](#exact-decimal), [Query](#query). **See:** `src/db/wire.ts`.

### TypeScript
JavaScript with type annotations. **Why it matters:** Bun runs it without checking types, so `tsc` is the only type check and `bun run typecheck` guards against new errors. **Related:** [Ratchet](#ratchet).

## U

### Unicode
The standard that gives every character of every language a number, so text such as accents, symbols and emoji is stored correctly. **Why it matters:** the database layer keeps Unicode values exactly.

## V

### Visual control
A [control](#control) you see on a form (as opposed to a [non-visual component](#non-visual-component)).

## W

### WAL (write-ahead log)
A SQLite mode where changes go to a separate `-wal` file first. **Why it matters:** a plain file copy of a live database can miss changes in it; the Workbench backup copes with that. **Related:** [Backup](#backup). **See:** [Workbench guide](databases/workbench.md#importexport-versus-backuprestore).

### WCAG contrast
The accessibility rule (Web Content Accessibility Guidelines) that normal text needs a contrast of at least 4.5 to 1 against its background. **Why it matters:** the designer now guarantees this for button text in every theme. **See:** [D-019](documentation-maintenance/discrepancies.md#d-019).

### Webview
A window that shows a web page inside a desktop program, provided by the `webview-bun` package. **Why it matters:** every studio and the designer draw their interface this way. **Related:** [Binding](#binding), [Frontend / backend](#frontend--backend).

### Wrapper
A small generated script in `bin/` (for example `codecaine-calc`) that finds Bun and starts one application. **Related:** [Manifest](#manifest-binmanifestjson). **See:** [Homebrew suite guide](HOMEBREW_SUITE_GUIDE.md).

## Error messages you may meet

| Message | Meaning | Read |
|---|---|---|
| `ReferenceError: existsSync is not defined` | The old designer start-up bug (fixed) | [D-001](documentation-maintenance/discrepancies.md#d-001) |
| `403 Forbidden: cross-origin request blocked` / `non-loopback Host header` | The [loopback guard](#loopback-guard) refused a request from another origin or host | [D-012](documentation-maintenance/discrepancies.md#d-012) |
| `document is not defined` | A browser-only script was run as a program | [D-014](documentation-maintenance/discrepancies.md#d-014) |
| `Cannot access 'RedisManager' before initialization` | A circular import (fixed) | [D-015](documentation-maintenance/discrepancies.md#d-015) |
| `New type errors (the count for these files went up)` | `bun run typecheck` found more errors than the [baseline](#baseline-type-check) | [Testing](testing/index.md#type-check-ratchet) |

## See also

- [Inventory of terms](documentation-maintenance/glossary-inventory.md)
- [Task index](reference/task-index.md)
