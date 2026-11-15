# Studios, codecaine CLI, databases, packaging and FAQ cheat sheet

> **Scope and verification status (matches [`docs/index.md`](../index.md) and [`docs/nav.json`](../nav.json)):**
> - **Verified on macOS (`arm64`):** source checkout setup, `bun run cli:launcher --list`, `bun run app:launcher`, `bun run start` (Visual Form Designer Form1, 95 visual / 6 non-visual controls, 6 code tabs, Audit/Auto-Fix, Import JSON, Undo/Redo in browser), `bun run docs:check`, and automated `bun test` suites.
> - **Not hand-verified in this doc baseline:** [`HOMEBREW_SUITE_GUIDE.md`](../HOMEBREW_SUITE_GUIDE.md) (global `bun`/`npm` wrapper installs and `brew tap`/`brew trust`/`--cask`/`--link`), Windows and Linux native WebView windows, Visual Form Designer **Run** preview window / **Export** button clicks (plus `D-002` placeholder Database controls), and script-generated [`docs/userguides/`](../userguides/43_file_manager.md) (`D-004`).

This guide covers installing and running **Bun RAD Studio** across operating systems, using the master `codecaine` CLI and `bun run` workspace commands, getting productive in the **Codecaine File Manager**, choosing between `rad.sqliteutils`, **Database Workbench**, and the **Database Studios** (SQLite, PostgreSQL, MySQL, Redis), understanding the **Visual Form Designer** and packaging/OS file paths, and solving common setup or API errors fast.

---

## Contents

1. [Installing and launching on macOS, Windows and Linux](#installing-and-launching-on-macos-windows-and-linux)
2. [Master `codecaine` CLI and `bun run` scripts](#master-codecaine-cli-and-bun-run-scripts)
3. [Codecaine File Manager and workstation cheat sheet](#codecaine-file-manager-and-workstation-cheat-sheet)
4. [Databases cheat sheet: SQLite, PostgreSQL, MySQL and Redis](#databases-cheat-sheet-sqlite-postgresql-mysql-and-redis)
5. [Visual Form Designer, standalone packaging and saved file locations](#visual-form-designer-standalone-packaging-and-saved-file-locations)
6. [Master zero-questions-left troubleshooting and FAQ](#master-zero-questions-left-troubleshooting-and-faq)

---

## Installing and launching on macOS, Windows and Linux

### Operating system prerequisites

| Platform | Runtime and OS requirements | Critical notes and workarounds | Status |
| :--- | :--- | :--- | :--- |
| **macOS 12+** | Built-in **WKWebView** + **Bun 1.4.2+** | No extra WebView library needed. If Gatekeeper flags an unsigned downloaded `.app` or binary as *"damaged"* or from an unidentified developer, inspect the release checksum first and then clear the quarantine attribute with `xattr -cr /path/to/App.app` (or `xattr -dr com.apple.quarantine ./codecaine-file-manager`). | Source launch verified on `arm64` |
| **Linux** | **Bun** + `libgtk-4-1` and `libwebkitgtk-6.0-4` (see [`requirements.md`](../getting-started/requirements.md)) | On **Ubuntu 24.04+**, AppArmor may block WebKitGTK's sandbox (`bwrap: setting up uid map: Permission denied`). From an extracted release folder, run `sh install.sh --apparmor` (allows user namespaces for that exact binary path only), or run File Manager in browser server mode (`--server`) in Brave or Chrome without touching AppArmor. | Native window not hand-verified |
| **Windows 10 / 11** | **Edge WebView2** + **Microsoft Visual C++ 2015–2022 x64 Redistributable (`vc_redist.x64.exe`)** + **x64 Bun** | Even on **Windows 11 ARM64**, install the **x64** VC++ runtime and **x64 Bun** (via x64 emulation) because `webview-bun` loads x64 bindings. **Avoid Parallels/VMware UNC paths (`\\Mac\...`)**: clone or extract to a local NTFS drive (`C:\Users\<you>\...`) so `cmd.exe` and Bun do not fail on UNC paths. Unblock downloaded `.exe` files via Properties or `install.cmd`. | Native window not hand-verified |

### Three installation methods

#### 1. Source checkout (verified on macOS Apple silicon)

```bash
git clone https://github.com/codecaine-zz/bun_rad_studio.git
cd bun_rad_studio
bun install

# Quick verification and launch
bun run cli:launcher --list
bun run app:launcher          # Unified GUI Launcher Studio
bun run start                 # Visual Form Designer (IDE)
bun run app:files             # Codecaine File Manager Studio
bun run examples/docs/hello_window.ts
```

Check optional OS/media tools anytime with `bun run deps:check` or `bun run tools:check`.

#### 2. Global npm / Bun install (*not hand-verified — see [`HOMEBREW_SUITE_GUIDE.md`](../HOMEBREW_SUITE_GUIDE.md)*)

```bash
# Install globally with Bun or npm
bun add -g bun-rad-studio
npm install -g bun-rad-studio

# Or run one-off without installing globally
bunx bun-rad-studio --help
npx bun-rad-studio list
```

#### 3. Homebrew suite and Homebrew 7+ `brew trust` (*not hand-verified — see [`HOMEBREW_SUITE_GUIDE.md`](../HOMEBREW_SUITE_GUIDE.md)*)

> **Homebrew 7+ requirement:** Homebrew 7 removed direct `./Formula/*.rb` path installs and requires trusting third-party taps before formula/cask installation.

```bash
# Option A: Automated suite installer script (CLI formulas, GUI cask, PATH links, diagnostics)
./install_homebrew_suite.sh
./install_homebrew_suite.sh --cask
./install_homebrew_suite.sh --link
./install_homebrew_suite.sh --doctor

# Option B: Manual tap + Homebrew 7 brew trust
brew tap codecaine-zz/tap https://github.com/codecaine-zz/bun_rad_studio.git
brew trust codecaine-zz/tap
brew install codecaine-zz/tap/codecaine-utility-suite
brew install codecaine-zz/tap/codecaine
brew install --cask codecaine-zz/tap/codecaine-file-manager
```

From a source checkout, equivalent `package.json` wrappers are available: `bun run brew:check`, `bun run brew:doctor`, `bun run brew:suite`, `bun run brew:cask`, `bun run brew:link`, `bun run brew:unlink`, and `bun run brew:install`.

---

## Master `codecaine` CLI and `bun run` scripts

### Workspace `bun run` scripts (all verified in [`package.json`](../../package.json))

| Category | Exact `bun run` commands | What they launch or check |
| :--- | :--- | :--- |
| **Core Hubs** | `bun run app:launcher`, `bun run start`, `bun run app:files`, `bun run workbench`, `bun run cli:launcher --list` | Launcher Studio, Visual Form Designer, Codecaine File Manager (`--reset-window`, `--server`), Database Workbench, CLI tool inventory |
| **Database Studios & CLI** | `bun run app:sqlite` (`app:database`), `bun run app:postgres` (`app:pg`), `bun run app:mysql`, `bun run app:redis`, `bun run cli:database` | Dedicated GUI studios and terminal SQLite CLI (`--help`) |
| **Developer & System Studios** | `bun run app:api`, `bun run app:code`, `bun run app:system`, `bun run app:process` (`app:task`), `bun run app:watcher`, `bun run app:json`, `bun run app:devtools`, `bun run app:convert`, `bun run app:crypto`, `bun run app:regex`, `bun run app:bundler`, `bun run app:network`, `bun run app:git`, `bun run app:markdown`, `bun run app:calc`, `bun run app:rad` | Desktop tools for REST/HTTP, code editing, hardware telemetry, processes, file watching, JSON, crypto/JWT, regex, bundling, DNS/network, Git, Markdown, math, and RAD utilities |
| **10 System Tool Studios** | `bun run app:fd`, `bun run app:sd`, `bun run app:rip`, `bun run app:procs`, `bun run app:tokei`, `bun run app:gdu`, `bun run app:ipinfo`, `bun run app:subfinder`, `bun run app:doggo`, `bun run app:watchexec` | GUI workspaces for `fd`, `sd`, `rip`, `procs`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo`, and `watchexec` |
| **Media & Paint Studios** | `bun run app:player` (`app:ampdeck`), `bun run app:paint` (`app:chroma`), `bun run cli:tts`, `bun run cli:say` | AmpDeck Pro audio/media rack, Chroma Paint Studio, AI TTS workstation CLI & speech synthesizer |
| **Headless CLIs (`cli:*`)** | `bun run cli:vault`, `bun run cli:system`, `bun run cli:json`, `bun run cli:process`, `bun run cli:api`, `bun run cli:crypto`, `bun run cli:fd`, `bun run cli:sd`, `bun run cli:rip`, `bun run cli:procs`, `bun run cli:tokei`, `bun run cli:gdu`, `bun run cli:ipinfo`, `bun run cli:subfinder`, `bun run cli:doggo`, `bun run cli:rad`, `bun run rad`, `bun run rad:cookbook` | Encrypted RADENC file vault, terminal utilities, and RAD quick CLI/cookbook |
| **Batch, Tests & Docs** | `bun run files:actions`, `bun run test`, `bun run test:fast`, `bun run test:db`, `bun run typecheck`, `bun run docs:build`, `bun run docs:check` | Batch file automation, test suites, typecheck ratchet, docs index builder and validator |

### Master `codecaine` suite CLI (`bun run codecaine` or global `codecaine`)

Verified against [`cli_apps/codecaine_suite_cli.ts`](../../cli_apps/codecaine_suite_cli.ts):

| Command | Options and behavior |
| :--- | :--- |
| `bun run codecaine` (or `codecaine`) | Opens Launcher Studio GUI by default when run with no subcommand |
| `codecaine doctor` | Checks Bun version, repository root, Homebrew status, native helpers, and saved config directories |
| `codecaine gui` / `codecaine launcher` / `codecaine launcher-cli` | Opens the GUI Launcher Studio or interactive terminal launcher |
| `codecaine list` (or `ls`) | Lists tools; supports `--apps`, `--cli`, `--demos`, `--category <name>`, `--search <term>`, `--json` |
| `codecaine search <query>` (or `find`) | Finds matching GUI studios, CLIs, and demos by name/keyword |
| `codecaine run <tool> [args...]` | Runs any studio, CLI, or demo (aliases: `app <tool>`, `cli <tool>`, `demo <tool>`, or bare `codecaine <tool>`) |
| `codecaine info <tool>` | Prints tool path, script mapping, category, and launch details |
| `codecaine upgrade` (or `update`) `[--yes]` | Updates installed global package / checkout |
| `codecaine brew <subcommand>` | Subcommands: `status`, `doctor`, `check`, `install-deps`, `cask`, `link`, `unlink` |

### Programmatic studio and launcher usage in TypeScript

Every desktop studio exports a factory function (`createFdStudio`, `createJqStudio`, `createLauncherStudio`, `createSqliteStudio`, etc.) returning a `SimpleWindow`. Calling the factory **without** `.run()` lets you embed, inspect, or unit-test studio workflows headlessly in `bun test` without opening a native WebView:

```typescript
import { expect, test } from "bun:test";
import { createFdStudio } from "./applications/fd_studio.ts";
import { createJqStudio } from "./applications/jq_studio.ts";
import { createLauncherStudio } from "./applications/launcher_studio.ts";

test("Built-in studios can be driven headlessly without win.run()", async () => {
  // Omit win.run() in tests so no native WebView window opens
  const jqWin = createJqStudio({ fullscreen: false });
  jqWin.setValue("txt_filter", ".modules | map(.name)");
  await jqWin.triggerClick("btn_execute");
  expect(jqWin.getText("txt_output_json").length).toBeGreaterThan(0);

  await jqWin.triggerClick("btn_reset_sample");
  expect(jqWin.getText("txt_filter")).toBe(".");

  const fdWin = createFdStudio({ fullscreen: false, theme: "midnight" });
  fdWin.setValue("txt_pattern", "*.ts");
  await fdWin.triggerClick("btn_clear");
  expect(fdWin.getText("txt_pattern")).toBe("");

  const launcher = createLauncherStudio({ fullscreen: false });
  expect(launcher.title).toContain("Launcher");
});
```

---

## Codecaine File Manager and workstation cheat sheet

Launch via `bun run app:files` (see [`applications/file_manager_studio.ts`](../../applications/file_manager_studio.ts) and [`docs/userguides/43_file_manager.md`](../userguides/43_file_manager.md)):

| Startup flag | Purpose |
| :--- | :--- |
| `--reset-window` | Clears saved window bounds (`file_manager_window.json`) and reopens in default screen-filling mode (fallback `1280x820`) |
| `--server` | Starts local HTTP server only (loopback `127.0.0.1:<port>`) for Brave/Chrome or low-GPU Linux VMs |
| `--browser` (`-b`) | Opens directly in the system default browser |
| `--port <n>`, `--path <dir>`, `--tool <id>`, `--game <id>` | Sets explicit HTTP port, initial folder, startup power tool, or arcade game |
| `--width <n> --height <n>`, `--max`, `--home`, `--data-dir <dir>` | Overrides initial window dimensions, maximizes, forces home view, or overrides data directory |

### Essential shortcuts and workstation workflows

| Area | Shortcuts and actions |
| :--- | :--- |
| **Window Views** | `Alt+1` Files, `Alt+2` Home, `Alt+3` Tools, `Alt+4` Split, **`Alt+5` Dual-Pane Commander**, `Alt+6` Focus (`Esc` leaves), `Alt+7` Toggle sidebar, `Alt+8` / `F11` Ultra Focus (`⌥` = `Alt` on macOS) |
| **Folder Tabs** | `Ctrl+T` / `Cmd+T` New tab · `Ctrl+Alt+D` / `Cmd+Alt+D` Duplicate tab · `Ctrl+Alt+W` / `Cmd+Alt+W` Close tab · `Ctrl+Alt+Shift+T` Reopen closed tab · `Ctrl+Tab` / `Ctrl+Shift+Tab` Cycle tabs |
| **Dual-Pane Commander (`Alt+5`)** | `Tab` Switch active pane · **`F5`** (or `Ctrl/Cmd+Alt+C`) Copy to opposite pane · **`F6`** (or `Ctrl/Cmd+Alt+M`) Move to opposite pane |
| **Quick Look and Media Player** | **`Space`** opens Quick Look (image EXIF & GPS privacy scrubber, SVG safety scan, syntax-highlighted code, documents). Audio/video plays in a multi-track queue with `0`–`9` tenth-jumps, `E` 10-band EQ, `Q` queue, `L` lyrics, `A` A-B loop. |
| **Color Tags (7 colors)** | Assign **Red**, **Orange**, **Yellow**, **Green**, **Blue**, **Purple**, or **Gray** tags via right-click -> **Color tag**, Quickbar swatches, or Command Palette (`Ctrl/Cmd+P` -> *Filter by Color Tag*); click sidebar tag dots or search `tag:any` to filter. *(Plain digits jump to filenames by prefix; `Alt+0` / `Cmd+0` toggles theme FX.)* |
| **Synced Terminal** | **`Cmd+J`** (macOS) / **`Ctrl+J`** (Windows/Linux) or `` Ctrl+` `` toggles the persistent terminal drawer · `Ctrl/Cmd+Alt+T` opens in selected folder · `Ctrl/Cmd+Alt+V` pastes into terminal |
| **Safe Delete & Rip Graveyard** | `Delete` moves to Recycle Bin · `Shift+Delete` deletes permanently (confirmation dialog) · **`Alt+Delete`** (macOS `⌥⌫`) **buries in the Rip Graveyard** with one-step `Ctrl/Cmd+Z` undo (`Ctrl+Alt+Delete` is never overridden). Protected system/home folders cannot be deleted or buried. |
| **Batch Rename, Compare & Convert** | Select multiple files + `F2` for **Bulk Rename** with live preview and rollback. Use **Compare folders** (`Compare` tab) to diff trees. Open **Convert or process** (`Ctrl/Cmd+Shift+O`, up to 500 items per batch) or run headless batch jobs via `bun run files:actions`. |
| **Creative & Media Studios** | Right-click media or open Tools -> **Image Studio**, **Media Studio**, **Paint Studio (Chroma Studio Pro)** (`bun run app:paint`), or **AmpDeck Pro** (`bun run app:player` / `bun run app:ampdeck`). |
| **AI Text-to-Speech (TTS)** | Built-in TTS tab plus CLI workstations: `bun run cli:tts` (`speak`, `export`, `audiobook`, `clean`, `voices`, `formats`, `status`, `clone-voice`) and `bun run cli:say --text "Hello world" --output speech.mp3`. |
| **24-Game Arcade & FX HUD** | Open **Games** in File Manager (or standalone `bun run app:pacman`, `bun run app:tetris`, `bun run app:balatro`). Press **`Alt+G`** inside any game to open the **Game Master FX HUD** and toggle CRT Scanlines or Cabinet Glow. |

### Encrypted Secrets Vault (`RADSEC`) and File Vault (`RADENC`)

> **Warning – Unrecoverable Data if Passwords or Recovery Keys Are Lost:** `RADENC` (`bun run cli:vault`) and `RADSEC` (`file_manager_secrets.radsec`) use **Argon2id + HKDF-SHA-256 + AES-256-GCM** local encryption with **no backdoors and no cloud password reset**. Never pass secrets on shell command lines (`RADENC` refuses `--password` flags by design), and store both your master passphrase and `RADSEC` 160-bit recovery key offline before burying or deleting originals.

- **File Vault (`RADENC`):** In File Manager select files and press **`Ctrl/Cmd+Alt+L`**, or run `bun run cli:vault encrypt <file>` / `bun run cli:vault decrypt <file>.radenc`. Encrypts streaming files in authenticated 1 MiB STREAM chunks and prints an interactive prompt or stdin confirmation.
- **Secrets Vault (`RADSEC`):** Built into File Manager (`file_manager_secrets.radsec` in `~/.bun_rad_studio/`). Supports master password + optional key file + 160-bit recovery key + optional `Bun.secrets` OS keychain unlock, automatically masks revealed values after **15 seconds**, and clears copied secrets from the system clipboard after **30 seconds**. See [`security.md`](../security.md) for the complete threat model.

### Launching File Manager, RADENC vault CLI and safe atomic file handling

```bash
# Desktop WebView window (default) vs headless loopback browser server (ideal for VMs/Brave/Chrome)
bun run app:files
bun run app:files --server --port 9020

# Clear corrupted/off-screen bounds saved in file_manager_window.json
bun run app:files --reset-window

# Stream-encrypt or decrypt files interactively (never accepts --password on argv)
bun run cli:vault encrypt /tmp/notes.txt
bun run cli:vault decrypt /tmp/notes.txt.radenc
```

When writing your own workstation utilities or custom configuration files, prefer `SimpleGUI`'s atomic `0o600` helpers (or `await rad.fileutils.writeFileAtomic` for async code):

```typescript
import {
  getAppConfigFile,
  getAppStateFile,
  resolveUserPath,
  writeFileAtomic,
} from "./src/simplegui.ts";
import { rad } from "./src/features/rad/index.ts";

const userNotes = resolveUserPath("~/notes/daily.md");
const cfgPath = getAppConfigFile("my_workstation", "settings.json"); // ~/.config/my_workstation/settings.json (macOS/Linux)
const statePath = getAppStateFile("my_workstation", "session.json"); // OS state dir

// Synchronous atomic temp-file + 0o600 rename (SimpleGUI)
writeFileAtomic(cfgPath, JSON.stringify({ theme: "apple_dark", notesPath: userNotes }, null, 2));

// Asynchronous atomic write from rad.fileutils (D-027 distinction)
await rad.fileutils.writeFileAtomic(statePath, JSON.stringify({ lastOpened: Date.now() }));
```

---

## Databases cheat sheet: SQLite, PostgreSQL, MySQL and Redis

### When to use each database tool

| Need | Recommended tool | Why |
| :--- | :--- | :--- |
| **Embedded app persistence / unit tests** | `rad.sqliteutils` (TypeScript code) | Zero external server; automatic WAL mode, KV store, JSON doc store, FTS5 full-text search, `insertMany`, and transactions on `:memory:` or `/tmp/demo.sqlite`. |
| **Fast unified data/SQL inspection** | **Database Workbench** (`bun run workbench`) | Browser UI on loopback (`WORKBENCH_PORT`), manages SQLite/PostgreSQL/MySQL profiles (`connections.json` `0600` + `Bun.secrets` keychain), browse/edit rows, `READ ONLY` toggle, SQL runner with rollback, and `VACUUM INTO` backups. See [`workbench.md`](../databases/workbench.md). |
| **Visual tables, QBE, cloning, staging, macros, Redis** | **Dedicated Studios** (`bun run app:sqlite`, `bun run app:postgres`, `bun run app:mysql`, `bun run app:redis`, File Manager **Databases** tab) | Full studio toolkits: Access-style QBE filters, Cross-Engine Cloning, Access-style JS Macros, 5-step Staging Import wizard, 11 sample datasets, and Redis key/TTL/Pub-Sub tools. |

### Connections, `.env` discovery, sample datasets, staging import and cloning

- **Disposable local examples & placeholder credentials** (avoid real passwords in code or docs):

  ```bash
  # Safe local SQLite test path
  bun run cli:database info /tmp/demo.sqlite

  # Safe placeholder URL format for .env discovery (never commit real secrets)
  DATABASE_URL="postgres://user:placeholder@localhost:5432/appdb"
  ```

- **Priority order (`.env` & profiles):** explicit studio profile (`~/.bun_rad_studio/connections.json`) -> active File Manager Databases connection -> workspace `.env` (`DATABASE_URL`, `PGHOST`/`PG*`, `MYSQL_*`, `REDIS_URL`). Note that File Manager intentionally strips inherited DB environment variables when launching `app:sqlite`/`app:postgres`/`app:mysql` as child processes so unrelated `.env` credentials do not leak into opened studios ([`docs/databases/index.md`](../databases/index.md)).
- **11 Synthetic Sample Datasets** ([`sample-datasets.md`](../databases/sample-datasets.md)): Stored under `BUNRAD_SAMPLE_DIR` (default `~/bun_rad_samples`) in Small/Medium/Large sizes — Medicare Part D Formulary Builder (flagship 41 tables / 9 views), Hospital EHR, Medical Claims, E-Commerce, Retail Banking, HR & Payroll, Warehouse/Logistics, Airline Ops, Project Management, IoT Telemetry, and SaaS Billing. Each includes `_sample_info`, `_sample_dictionary`, and `_sample_queries`.
- **5-Step Staging Import Wizard** ([`staging-import.md`](../databases/staging-import.md)):
  1. **Source:** CSV, TSV, JSON, or NDJSON (up to **2 GB / 5M rows**). *(Note: Excel `.xlsx`/`.ods` files are not imported by the SQL Staging Wizard directly; Redis Studio's `Import` handles spreadsheet formats.)*
  2. **Map:** Column mapping, type casting, date/trim transforms.
  3. **Load:** Stages into `stg_<table>_<yyyymmdd>_<hhmm>`.
  4. **Check:** Validates nulls, uniqueness, ranges, and foreign keys.
  5. **Promote & Undo:** Previews **Dry Run**, then promotes inside a transaction while recording `_import_batches` / `_import_batch_changes` for rollback.
- **Cross-Engine Cloning & Access-Style JS Macros:** Clone tables across SQLite, PostgreSQL, MySQL, and Redis (`replace`, `truncate`, `append`, `upsert`, `skip`, `fail` modes with canonical type mapping), or automate workflows in the **Macro Studio** with `CurrentDb`, `DoCmd`, `TempVars`, `DCount`, and `db.transaction`. See [`complete-databases-guide.md`](../databases/complete-databases-guide.md).

### Visual Query Criteria (QBE) syntax cheat sheet

Verified in [`applications/sqlite_studio.ts`](../../applications/sqlite_studio.ts) (`formatAccessCriterion` / `criteriaHelpBanner`), [`applications/mysql_studio.ts`](../../applications/mysql_studio.ts), and [`applications/postgres_designer.js`](../../applications/postgres_designer.js):

| Goal | Example QBE cell entry | Generated SQL predicate |
| :--- | :--- | :--- |
| **Exact match** | `active` or `= 42` | `= 'active'` or `= 42` |
| **Numeric / date comparisons** | `> 100`, `<= 50`, `<> Archived`, `!= 0` | `> 100`, `<= 50`, `<> 'Archived'`, `!= 0` |
| **Inclusive range** | `BETWEEN 100 AND 500` | `BETWEEN 100 AND 500` (also works with `'2026-01-01' AND '2026-12-31'`) |
| **Wildcard text match** | `LIKE '%acme%'` or `LIKE 'A_C'` | `LIKE '%acme%'` / `LIKE 'A_C'` (use SQL `%` / `_` wildcards; plain `*acme*` becomes `= '*acme*'`) |
| **Case-insensitive text (Postgres)** | `ILIKE '%error%'` | `ILIKE '%error%'` (`postgres_designer.js`; use `LIKE` / `NOT LIKE` in SQLite & MySQL) |
| **Set membership** | `IN ('open', 'pending')` or `NOT IN (0, 99)` | `IN ('open', 'pending')` / `NOT IN (0, 99)` |
| **Missing / present values** | `IS NULL` or `IS NOT NULL` | `IS NULL` / `IS NOT NULL` |
| **Compound `AND` / `OR` filters** | Single cell: `BETWEEN 10 AND 50` / `IN ('US', 'CA')`; or use grid **`Criteria`** + **`Or`** / **`Or 2`** rows | Same-row columns combine with `AND`; **`Criteria` / `Or` / `Or 2`** rows combine with `OR` |

### Copy-paste database examples (QBE, SQLite WAL + FTS5 + JSON1, Redis fallback and URL redaction)

```sql
-- Concrete QBE cell expressions -> generated SQL WHERE clause:
-- [status]  Criteria: IN ('open', 'pending')      -> "orders"."status" IN ('open', 'pending')
-- [total]   Criteria: > 100                        -> "orders"."total" > 100
-- [created] Criteria: BETWEEN '2026-01-01' AND '2026-12-31'
-- [email]   Criteria: LIKE '%acme%'  | Or: IS NULL -> ("orders"."email" LIKE '%acme%' OR "orders"."email" IS NULL)
SELECT id, status, total, email
FROM "orders"
WHERE ("orders"."status" IN ('open', 'pending') AND "orders"."total" > 100)
   OR ("orders"."email" IS NULL);
```

```typescript
import { rad } from "./src/features/rad/index.ts";

// 1. SQLite WAL + Parameterized Transaction + JSON1 Document Store + FTS5 Search
const db = rad.sqliteutils.openDb("/tmp/demo.sqlite"); // enables WAL automatically
try {
  rad.sqliteutils.createJsonStore(db, "events");
  rad.sqliteutils.createFtsTable(db, "events_fts", ["title", "body"]);

  rad.sqliteutils.transaction(db, () => {
    rad.sqliteutils.saveDoc(db, "events", "evt-1", { service: "billing", level: "warn" });
    rad.sqliteutils.saveDoc(db, "events", "evt-2", { service: "auth", level: "info" });
    rad.sqliteutils.indexFts(db, "events_fts", {
      title: "Billing timeout",
      body: "Retry budget exceeded for billing webhook",
    });
  });

  // SQLite JSON1 json_extract lookup + FTS5 MATCH
  const billingDocs = rad.sqliteutils.findDocs<{ service: string; level: string }>(
    db,
    "events",
    "$.service",
    "billing",
  );
  const ftsHits = rad.sqliteutils.searchFts<{ title: string }>(db, "events_fts", "webhook", 10);
  console.log({ billingCount: billingDocs.length, ftsHits });
} finally {
  rad.sqliteutils.closeDb(db);
}
```

```typescript
import { createRedisNamespace } from "./src/simplecli/index.ts";
import { rad } from "./src/features/rad/index.ts";

// 2. NamespacedRedis with automatic in-memory fallback + safe DB URL credential redaction
const redis = createRedisNamespace("session_cache", {
  url: "redis://localhost:6379",
  inMemory: true, // set false to connect to live Redis and fall back only when offline
  fallbackToMemory: true,
});

try {
  await redis.setJson("user:42", { role: "admin" }, 300);
  const profile = await redis.getOrSet("user:42", () => ({ role: "guest" }), 300);
  console.log({ profile, memoryMode: redis.isMemoryFallback() });
  await redis.del("user:42");
} finally {
  redis.close();
}

const rawDbUrl = "postgres://admin:placeholder@db.internal:5432/app";
console.log(rad.urlutils.redactCredentials(rawDbUrl));
// => "postgres://admin:***@db.internal:5432/app"
```

---

## Visual Form Designer, standalone packaging and saved file locations

### Visual Form Designer (`bun run start`)

Launch the Form Designer with `bun run start` (backed by `index.ts` and `src/ide.html` — see [`visual-designer/index.md`](../visual-designer/index.md)):

- **Verified in browser checks:** `Form1` (`800x600`), **95 visual + 6 non-visual controls** on palette, **6 live code tabs** (`TypeScript`, `Full bun.ts`, `V Code`, `HTML/CSS`, `JSON`, `SQLite`), Audit/Auto-Fix, Import JSON, and Undo/Redo.
- **Not hand-verified / known gaps:** **Run** preview window click, **Export** button click, and native desktop WebView interactions were not hand-verified; **Database Designer controls (`DB Grid`, `DB Navigator`, etc.) and the Database Wizard are UI placeholders (`D-002`)** — wire real data using `rad.sqliteutils`, `bun run workbench`, or dedicated DB studios instead.
- **Designer files:** Auto-saves to `~/.bun_rad_studio/designer_draft.json`, previews from `.rad_preview/`, and exports to `exported_project/` (backing up prior exports as `.bak-<timestamp>`).

### Standalone executables and npm packaging

```bash
# 1. Compile your own standalone desktop or CLI binary with Bun
bun build --compile --outfile ./dist/my-app app.ts

# 2. Repo single-binary / app bundle scripts
bun run build                 # Default local build (dist/)
bun run build:binary          # Compiled binary build
bun run build:all             # All local targets
bun run build:mac-apps        # macOS .app bundles (Apple silicon / Intel)
bun run release:build         # Full 10-target release build (see docs/developer/releasing.md)

# 3. Build & verify publishable npm package (dist/npm/)
bun run npm:build
bun run npm:pack
```

### Complete OS paths and saved files reference

Verified against `src/simplegui.ts` (`getAppConfigDir`, `getAppStateDir`, `getAppDataDir`, `getAppLogDir`, `saveTheme`), [`data-and-files.md`](../reference/data-and-files.md), [`workbench.md`](../databases/workbench.md), and [`troubleshooting.md`](../troubleshooting.md):

| Data item | macOS path | Linux path | Windows path | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Global SimpleGUI theme (`saveTheme`)** | `~/.config/simplegui/theme.txt` | `~/.config/simplegui/theme.txt` | `%USERPROFILE%\.config\simplegui\theme.txt` | Created when saving user theme choice |
| **Per-app config (`getAppConfigDir`)** | `$XDG_CONFIG_HOME/<app>` or `~/.config/<app>` | `$XDG_CONFIG_HOME/<app>` or `~/.config/<app>` | `%APPDATA%\<app>` | User preferences per named app |
| **Per-app state (`session.json`, `form_state.json`)** | `~/Library/Application Support/<app>` | `$XDG_STATE_HOME/<app>` or `~/.local/state/<app>` | `%LOCALAPPDATA%\<app>` | Window bounds (`session.json`), inputs (`form_state.json`), custom `state.json` |
| **Per-app data (`getAppDataDir`)** | `~/Library/Application Support/<app>` | `~/.local/share/<app>` | `%LOCALAPPDATA%\<app>` | App databases and assets |
| **Per-app logs (`getAppLogDir`)** | `~/Library/Logs/<app>` | `~/.local/state/<app>/log` | `%LOCALAPPDATA%\<app>\Logs` | App log output |
| **Studio & File Manager home (`~/.bun_rad_studio/`)** | `~/.bun_rad_studio/` | `~/.bun_rad_studio/` | `%USERPROFILE%\.bun_rad_studio\` | Stores `designer_draft.json`, `macros/`, `connections.json` (`0600`), `connections_redis.json`, `file_manager.json`, `file_manager_window.json`, `file_manager_themes.json`, `file_manager_secrets.radsec`, `file_manager_trash/`, `file_operations.json`, `file-manager-startup.log` |
| **Database profile override (`STUDIO_DB_PROFILE_DIR`)** | `$STUDIO_DB_PROFILE_DIR/connections.json` | `$STUDIO_DB_PROFILE_DIR/connections.json` | `%STUDIO_DB_PROFILE_DIR%\connections.json` | Isolates Workbench/Studio connection profiles for CI or tests |
| **Rip Graveyard (`rip` / `Alt+Delete`)** | `$GRAVEYARD` or `~/.local/share/rip/graveyard/` | `$GRAVEYARD` or `~/.local/share/rip/graveyard/` | `$GRAVEYARD` or `%USERPROFILE%\.local\share\rip\graveyard\` | Safe burial directory with manifest metadata |
| **Sample DB datasets (`BUNRAD_SAMPLE_DIR`)** | `~/bun_rad_samples` | `~/bun_rad_samples` | `%USERPROFILE%\bun_rad_samples` | Generated SQLite/JSON/SQL sample datasets |

---

## Master zero-questions-left troubleshooting and FAQ

| # | Symptom | Root cause | Exact fix |
| :--- | :--- | :--- | :--- |
| **1** | **Desktop window script finishes cleanly with no window appearing** | Forgot `win.run()` at the bottom, or called `process.exit()` before the WebView loop started | Add `win.run()` on the final line (or `if (import.meta.main) win.run()` when exporting a `createWindow()` helper for tests). |
| **2** | **`win.getText("txtName")` returns `""` or `win.setText(...)` does nothing** | Control was created without chaining `.id("txtName")` (auto-generated ID was assigned instead) | Chain `.id("txtName")` directly on `win.addTextInput(...)` / `win.addLabel(...)` and pass that exact ID string. |
| **3** | **Window opens fullscreen unexpectedly or ignores `width` / `height`** | `newSimpleWindow` defaults to `fullscreen: true` only when `width`, `height`, and `fullscreen` are omitted, whereas explicit `fullscreen: true` overrides numeric dimensions (`src/simplegui.ts`) | Pass explicit numbers: `newSimpleWindow("My App", 1000, 700)` or `{ width: 1000, height: 700, fullscreen: false }`. |
| **4** | **File Manager window opens off-screen, zero-sized, or blank on relaunch** | Stale/corrupted bounds saved in `file_manager_window.json` or WebKit driver issue | Run `bun run app:files --reset-window` (or remove `~/.bun_rad_studio/file_manager_window.json`); fallback to `bun run app:files --server`. |
| **5** | **`win.setText("lblStatus", "<b>OK</b>")` shows raw `<b>` tags** | `setText()` escapes HTML characters intentionally to prevent accidental injection | Use `win.setHtml("lblStatus", "<b>OK</b>")` when rendering intentional HTML markup (sanitize untrusted inputs first). |
| **6** | **`Cannot find module "bun-rad-studio"` / `"./src/simplegui"` / `"../../src/simplegui"`** | Wrong import path for where your script lives (package install vs repo root vs subfolder) | Use `"bun-rad-studio/simplegui"` when installed via `bun add`; `"./src/simplegui"` at repo root; `"../../src/simplegui"` inside `examples/rad_tutorial/` or `applications/`. |
| **7** | **Duplicate symbol or wrong overload (`writeFileAtomic`, `LRUCache`, `Logger`) from top-level barrel** | `src/index.ts` combines SimpleGUI (sync), SimpleCLI, and `rad.*` (async) exports (`D-027`) | Import explicitly from `rad.fileutils.writeFileAtomic`, `rad.cacheutils.LRUCache`, `rad.logutils`, or subpath imports `"bun-rad-studio"` / `"bun-rad-studio/simplegui"` (or `"./src/simplecli"` in source checkouts). |
| **8** | **Live search or timer updates cause UI lag / dropped frames** | Running expensive SQL queries on every raw keystroke or issuing dozens of separate property mutations per tick | Use `.filterTable("tbl")` for in-memory tables, wrap SQLite/API queries in `rad.flowutils.debounce(fn, 200)`, and batch UI updates with `win.values({...})`, `win.setManyTexts({...})`, or `win.setManyVisibility({...})`. |
| **9** | **Inserting 1,000+ SQLite rows takes several seconds** | Individual `db.run("INSERT ...")` calls auto-commit to disk on every row | Use `rad.sqliteutils.insertMany(db, "items", rows)` or wrap loops inside `rad.sqliteutils.transaction(db, () => { ... })`. |
| **10** | **CLI hangs in GitHub Actions / CI or breaks piped `jq` scripts** | Interactive prompt called without `--yes`/non-interactive flag, or ANSI tables printed to stdout | Gate prompts on `process.stdin.isTTY` (add `--yes`), and use `app.output(data)` which automatically emits clean JSON whenever `!process.stdout.isTTY` or `--json` is passed. |
| **11** | **macOS says extracted `.app` or binary is `"damaged"` or blocked by Gatekeeper** | Unsigned archive downloaded from browser retains `com.apple.quarantine` attribute | Inspect checksum first, then run `xattr -cr /path/to/App.app` or `xattr -dr com.apple.quarantine ./codecaine-file-manager`. |
| **12** | **Windows SmartScreen blocks `.exe`, or launcher fails under Parallels `\\Mac\...`** | Downloaded unsigned `.exe` + UNC network working directory rejected by `cmd.exe` / WebView2 | Copy repo/ZIP to a local NTFS path (`C:\Users\<you>\...`), run `install.cmd`, and install Edge WebView2 + `vc_redist.x64.exe`. |
| **13** | **Windows 11 ARM64 throws WebView native DLL load error** | ARM64 Bun binary cannot load `webview-bun`'s x64 native library | Install **x64 Bun** and **x64 Microsoft VC++ Redistributable (`vc_redist.x64.exe`)** and launch under Windows x64 emulation. |
| **14** | **Ubuntu 24.04+ WebKit crashes with `bwrap: setting up uid map: Permission denied` or `dbus-proxy`** | AppArmor blocks unprivileged user namespaces for extracted binaries | From the extracted release folder run `sh install.sh --apparmor` (scopes one profile to that executable path), or launch with `--server` in Brave/Chrome. |
| **15** | **Linux/VM File Manager 24-game Arcade stutters or canvas renders slowly** | Linux `libwebkitgtk-6.0-4` falls back to software compositing on older GPUs or VMs | Start `bun run app:files --server`, open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome**, and press **`Alt+G`** inside games to disable CRT Scanlines/Cabinet Glow. |
| **16** | **Homebrew 7 fails with `Calling Installation from a local Formula path is unsupported` or untrusted tap error** | Homebrew 7 removed direct `./Formula/*.rb` installs and requires `brew trust` | Run `brew tap codecaine-zz/tap https://github.com/codecaine-zz/bun_rad_studio.git` followed by `brew trust codecaine-zz/tap`, or run `./install_homebrew_suite.sh`. |
| **17** | **`EADDRINUSE` starting File Manager (`8995–9005`) or Database Workbench** | An older studio instance is still listening on the default loopback port | Pass `--port 9020` to File Manager, set `WORKBENCH_PORT=9100 bun run workbench`, or inspect running processes with `bun run cli:procs`. |
| **18** | **`403 Forbidden` when hitting Workbench or File Manager `--server` from another machine** | Intentional loopback host/origin protection (`localGuard.ts`) rejects non-loopback requests | Access via `http://127.0.0.1:<port>` on the local machine (or tunnel cleanly over SSH local port forwarding). |
| **19** | **`app:sqlite` / `app:postgres` / `app:mysql` ignores `.env` when opened from File Manager** | File Manager strips inherited DB env vars from child processes (`docs/databases/index.md`) to prevent silent cross-project leaks | Save an explicit connection profile in Database Workbench / File Manager, or run directly from your project terminal (`bun run app:postgres`). |
| **20** | **Visual Form Designer Database controls (`DB Grid`, etc.) or Export/Run behave unexpectedly** | Database widgets in the Designer are UI placeholders (`D-002`), and Run/Export native clicks are unverified (`docs/visual-designer/index.md`) | Copy generated TypeScript/SQLite tabs and build real database logic with `rad.sqliteutils`, `bun run workbench`, or `bun run app:sqlite`. |
| **21** | **`RADENC` / `RADSEC` asks for a passphrase I forgot** | Argon2id + AES-256-GCM encryption has no password reset or key escrow | Restore from your offline **`RADSEC` 160-bit recovery key** or unencrypted backup; without it, encrypted data cannot be recovered. |
| **22** | **`bun run docs:check` fails with secret scanner, broken `#anchor`, or `no such script`** | Password-like example `>= 8` chars lacks whitelisted prefix, `&`/emoji in heading changes `slugify`, or doc references a non-existent `bun run` script | Prefix example credentials with `placeholder-` / `example-password` / `your-api-key` (`postgres://user:placeholder@localhost:5432/appdb`), use `and` without emojis in headings, and verify `package.json` keys. |

### Troubleshooting wrong vs right code recipes

```typescript
import { createWindow, writeFileAtomic as writeGuiFileAtomic } from "./src/simplegui.ts";
import { rad } from "./src/features/rad/index.ts";
import { Logger as CliLogger, LRUCache as CliLruCache, writeFileAtomic } from "./src/index.ts";

// (a) Confirmation dialogs inside onClick: prefer trailing callback instead of awaiting inline
const win = createWindow("Safe App", {
  appId: "safe_app",
  width: 960,
  height: 640,
  theme: "apple_dark",
  fullscreen: false,
});

// ❌ Wrong: awaiting modal Promise inside native UI callback can stall WebView dispatch
// win.addButton("Delete", async (w) => { if (await w.confirm("Delete?")) { /* ... */ } });
// ✅ Right: use the trailing callback inside window event handlers
win.addButton("Delete", (w) => {
  w.dialogs.confirm("Delete item?", "Confirm", (ok) => {
    if (ok) w.setHtml("lblStatus", "<b>Deleted</b>");
  });
});

// (b) Checkbox boolean & HTML labels: never use setText() for booleans or raw HTML markup
// ❌ Wrong: win.setText("chkActive", "true"); win.setText("lblStatus", "<b>Ready</b>"); // escapes <b>
// ✅ Right:
win.addCheckbox("Active", false).id("chkActive");
win.addLabel("").id("lblStatus");
win.setChecked("chkActive", true);
win.setHtml("lblStatus", "<b>Ready</b>");

// (c) session.json option precedence: unpinned createWindow("App", { appId }) lets saved session.json resize/re-theme
// ❌ Wrong: createWindow("Safe App", { appId: "safe_app" }); // width/height/theme/fullscreen come from session.json
// ✅ Right: pass explicit width, height, theme, and fullscreen: false to pin startup layout

// (d) Command execution with user input: never interpolate untrusted text into shell strings
async function searchUserTerm(userQuery: string) {
  // ❌ Wrong: await rad.shellutils.execCmd(`rg "${userQuery}" ./src`); // shell injection risk
  // ✅ Right: pass argv array via rad.sysutils.execSafe (no shell invoked)
  return rad.sysutils.execSafe("rg", ["--fixed-strings", userQuery, "./src"]);
}

// (e) D-027 root barrel disambiguation (src/index.ts):
// Root writeFileAtomic is SimpleGUI sync; Logger & LRUCache are SimpleCLI's.
// Use rad.* namespaces whenever you specifically want async fileutils or rad.cacheutils/rad.logutils:
const cliCache = new CliLruCache<string, number>(64);
const cliLogger = new CliLogger();
const radLogger = rad.logutils.newLogger({ prefix: "rad" });
const radCache = new rad.cacheutils.LRUCache<string, number>(64);
writeFileAtomic("./tmp-sync.txt", "sync 0600");
void rad.fileutils.writeFileAtomic("./tmp-async.txt", "async");
void [win, writeGuiFileAtomic, searchUserTerm, cliCache, cliLogger, radLogger, radCache];
```

---

## See also

- **[Cheatsheets Hub](index.md)** — Beginner onboarding, 3 import scenarios, architecture chooser, and 35+ "How do I...?" patterns
- **[SimpleGUI Desktop RAD Cheat Sheet](simplegui-cheatsheet.md)** · **[SimpleCLI Console Cheat Sheet](simplecli-cheatsheet.md)** · **[45 RAD Modules & 10 System Tools Cheat Sheet](rad-modules-cheatsheet.md)**
- **[Complete Single-File Master Cheat Sheet (`CHEATSHEET.md`)](../../CHEATSHEET.md)**
- **[Main Troubleshooting Guide](../troubleshooting.md)** · **[Security Model](../security.md)** · **[Saved Data & Files](../reference/data-and-files.md)** · **[Releasing & Packaging](../developer/releasing.md)**
