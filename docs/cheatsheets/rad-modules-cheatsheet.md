# 45 RAD utility modules and 10 system tools cheat sheet

A complete, beginner-friendly reference for all **45 `rad` utility modules** (`44` core modules plus the `sliceutils` alias inside `src/features/rad/`) and all **10 programmatic system utilities** (`fd`, `sd`, `rip`, `procs`, `watchexec`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo`) shipped with **Bun RAD Studio**.

---

## What is rad in 30 seconds

**`rad`** (Rapid Application Development) is a zero-dependency TypeScript standard library built directly on top of Bun's native runtime APIs (`bun:sqlite`, `Bun.TOML`, `Bun.Glob`, `Bun.Transpiler`, `Bun.serve`, `Bun.password`, `Bun.hash`, `Bun.color`, `Bun.semver`, `Bun.gzipSync`).

Instead of installing dozens of tiny npm packages (`better-sqlite3`, `lodash`, `minimatch`, `adm-zip`, `jsonwebtoken`, `p-limit`, `cron-parser`, `semver`, `chalk`), you get **45 cohesive utility modules** across **6 domains**, plus **10 full-featured CLI/GUI system tools** whose TypeScript Coordinators and Doers you can import directly into your scripts, servers, and automation workflows.

> **Why 45 modules?** There are **44 core implementation files** under [`src/features/rad/modules/`](../../src/features/rad/modules) plus **`sliceutils`**, an ergonomic re-export alias for `arrutils`, bringing the exported `rad` namespace to **45 modules**.

---

## Quick import patterns

Pick the import style that matches where your script lives:

### 1. Installed package in an external Bun or TypeScript project

```ts
// Import the unified rad namespace (safest — zero symbol collisions)
import { rad } from "bun-rad-studio";

// Access any of the 45 modules through rad.<module>
const safe = rad.strutils.slugify("Hello RAD Studio!");
const db = rad.sqliteutils.openDb(":memory:");
rad.sqliteutils.closeDb(db);
```

### 2. Script at the repository root (`app.ts` or `<your-file.ts>`)

```ts
// Run with: bun run app.ts   or   bun run <your-file.ts>
import { rad } from "./src/features/rad/index.ts";

const sys = rad.sysutils.getSystemInfo();
console.log(`${sys.platform}/${sys.arch} (${sys.cpuCount} CPUs)`);
```

### 3. Script nested two folders deep inside the repo (for example `scripts/tasks/job.ts`)

```ts
import { rad } from "../../src/features/rad/index.ts";

const config = await rad.tomlutils.loadToml("bunfig.toml", {});
console.log(config);
```

### Direct module and flat helper imports

You can import module namespaces or specific functions directly from [`src/features/rad/index.ts`](../../src/features/rad/index.ts), or import a single module file directly for minimal bundle scope:

```ts
// Direct namespace + helper imports from the RAD barrel
import {
  fileutils,
  sqliteutils,
  arrutils,
  retry,
  RateLimiter,
} from "./src/features/rad/index.ts";

// Single-module file import
import { sha256, uuidV7 } from "./src/features/rad/modules/cryptoutils.ts";
```

### Namespace collision rules (D-027)

When importing from the top-level package `"bun-rad-studio"` (or [`src/index.ts`](../../src/index.ts)) or using flat exports from [`src/features/rad/index.ts`](../../src/features/rad/index.ts), a few symbols overlap by name. Prefer **`rad.<module>.<fn>`** (or the module namespace) whenever in doubt:

| Colliding symbol | Top-level `"bun-rad-studio"` / flat `rad/index.ts` export | Explicit `rad.<module>` alternative |
| :--- | :--- | :--- |
| `writeFileAtomic` | `SimpleGUI` **synchronous** (`void`) in `"bun-rad-studio"` | `rad.fileutils.writeFileAtomic` (**async** `Promise<number>`) |
| `LRUCache` | `SimpleCLI` command-history cache in `"bun-rad-studio"` | `rad.cacheutils.LRUCache` |
| `Logger`, `LogLevel` | `SimpleCLI` logger in `"bun-rad-studio"` | `rad.logutils.Logger`, `rad.logutils.LogLevel` |
| `TreeNode` | `SimpleCLI` tree node in `"bun-rad-studio"` | `TreeNode` (TS type from `src/features/rad/index.ts` or `cliutils.ts`) |
| `getInt`, `getBool`, `set` | Flat exports come from `rad.envutils` | `rad.tomlutils.getInt`, `rad.tomlutils.getBool`, `rad.objutils.set` |
| `sumBy` | Flat export comes from `rad.arrutils` | `rad.mathutils.sumBy` |
| `inRange` | Flat export comes from `rad.validutils` | `rad.mathutils.inRange` |
| `debounce`, `throttle` | Flat exports come from `rad.flowutils` | `rad.fnutils.debounce`, `rad.fnutils.throttle` |
| `stripAnsi` | Flat export comes from `rad.cliutils` | `rad.strutils.stripAnsi` (namespace-only) |

---

## Symptom-to-module quick finder

Find the right module immediately by what you are trying to build:

| I want to... | Use | Jump to |
| :--- | :--- | :--- |
| Read/write text, JSON, JSONL, CSV, walk directories, hash files, or write files atomically | `rad.fileutils` | [`fileutils`](#fileutils) |
| Store relational tables, run migrations, FTS5 search, KV flags, or JSON documents | `rad.sqliteutils` | [`sqliteutils`](#sqliteutils) |
| Load, merge, query, and save `.toml` config files | `rad.tomlutils` | [`tomlutils`](#tomlutils) |
| Create or safely extract `.zip` archives with zip-slip checks | `rad.archiveutils` | [`archiveutils`](#archiveutils) |
| Gzip, Deflate, Brotli, or Zstd compress strings, byte buffers, or single files | `rad.compressutils` | [`compressutils`](#compressutils) |
| Pack or unpack `.tar` and `.tar.gz` archives | `rad.tarutils` | [`tarutils`](#tarutils) |
| Persist reactive app settings/state to OS config/data directories with rollback | `rad.stateutils` | [`stateutils`](#stateutils) |
| Cache expensive lookups in memory with LRU eviction or TTL + in-flight dedup | `rad.cacheutils` | [`cacheutils`](#cacheutils) |
| Chunk, deduplicate, group, sort, window, zip, or binary-search arrays | `rad.arrutils` / `rad.sliceutils` | [`arrutils` & `sliceutils`](#arrutils-and-sliceutils-alias) |
| Deep-clone, deep-merge, pick/omit, flatten, or diff nested objects | `rad.objutils` | [`objutils`](#objutils) |
| Use stacks, queues, deques, ring buffers, min-heaps, priority queues, tries, or union-find | `rad.structutils` | [`structutils`](#structutils) |
| Compute mean, median, stdDev, percentiles, outliers, correlations, or linear regression | `rad.statutils` | [`statutils`](#statutils) |
| Lerp, clamp, test 2D rects, compute primes/GCD/LCM, or seed random floats | `rad.mathutils` | [`mathutils`](#mathutils) |
| Pack permissions/features into integer bitflags or large `BitSet` bitmaps | `rad.bitutils` | [`bitutils`](#bitutils) |
| Build directed/undirected graphs, topological sort, detect cycles, BFS/DFS, Dijkstra | `rad.graphutils` | [`graphutils`](#graphutils) |
| Convert cases (`slugify`, camel/snake), mask PII, fuzzy-search, wrap words | `rad.strutils` | [`strutils`](#strutils) |
| Match emails/URLs/UUIDs/semver, escape regex, or extract named groups | `rad.regexutils` | [`regexutils`](#regexutils) |
| Render `{{var \| filter}}` templates or ANSI-highlighted Markdown in the terminal | `rad.templateutils` | [`templateutils`](#templateutils) |
| Convert HEX/RGB/HSL/HSV/LAB, generate gradients, or check WCAG contrast | `rad.colorutils` | [`colorutils`](#colorutils) |
| Escape HTML, strip tags, parse element attributes, or extract links/headings/meta | `rad.htmlutils` | [`htmlutils`](#htmlutils) |
| Compute line/word/char diffs, generate unified patches, or colorize terminal diffs | `rad.diffutils` | [`diffutils`](#diffutils) |
| Get CPU/RAM/OS info, read/write the clipboard, or run untrusted args without a shell | `rad.sysutils` | [`sysutils`](#sysutils) |
| Print ANSI colors, progress bars, sparklines, bar charts, gauges, or trees | `rad.cliutils` | [`cliutils`](#cliutils) |
| Parse `.env` files, coerce typed env vars, require keys, or expand `${VAR}` | `rad.envutils` | [`envutils`](#envutils) |
| Check `which` binaries or run trusted shell pipelines with timeout/env control | `rad.shellutils` | [`shellutils`](#shellutils) |
| Match or scan files using `Bun.Glob` patterns, extglob, and brace ranges | `rad.globutils` | [`globutils`](#globutils) |
| Strip TS types, transpile TSX/TS in memory, scan AST imports/exports, or eval TS | `rad.transpileutils` | [`transpileutils`](#transpileutils) |
| Emit structured ANSI or JSON-line logs with levels and file output | `rad.logutils` | [`logutils`](#logutils) |
| Parse 5-field cron schedules, compute next run times, or format to English | `rad.cronutils` | [`cronutils`](#cronutils) |
| Parse, compare, bump, or match SemVer ranges (`Bun.semver`) | `rad.semverutils` | [`semverutils`](#semverutils) |
| Discover local/public IPs, check internet connectivity, TCP ping, or DNS lookup | `rad.netutils` | [`netutils`](#netutils) |
| Send `GET`/`POST`/`PUT`/`DELETE` JSON requests or `fetchWithRetry` with query builders | `rad.httputils` | [`httputils`](#httputils) |
| Spin up a `Bun.serve` HTTP router, traversal-safe static server, or WebSocket hub | `rad.serverutils` | [`serverutils`](#serverutils) |
| Parse RFC 3986 URLs into segments/params, join URLs, or redact passwords | `rad.urlutils` | [`urlutils`](#urlutils) |
| Sign, verify, or inspect `HS256` JWT tokens | `rad.jwtutils` | [`jwtutils`](#jwtutils) |
| Hash SHA-256/SHA-512, sign HMACs, generate UUIDv4/v7, or hash Argon2id passwords | `rad.cryptoutils` | [`cryptoutils`](#cryptoutils) |
| Hash cache keys at gigabytes/sec (`wyhash`, `crc32`) or run a `BloomFilter` | `rad.hashutils` | [`hashutils`](#hashutils) |
| Cap parallel tasks (`parallelMap`, `WorkerPool`), wait groups, or promise timeouts | `rad.asyncutils` | [`asyncutils`](#asyncutils) |
| Enforce `RateLimiter`, `CircuitBreaker`, backoff `retry`, `debounce`, or `throttle` | `rad.flowutils` | [`flowutils`](#flowutils) |
| Compose `pipe`, `memoize`, `once`, `partial`, `before`, `after`, `times`, or `delay` | `rad.fnutils` | [`fnutils`](#fnutils) |
| Wire up a lightweight typed-style pub/sub `EventEmitter` | `rad.eventutils` | [`eventutils`](#eventutils) |
| Validate emails, HTTP URLs, IPv4/IPv6, phones, UUIDs, JSON, or numeric ranges | `rad.validutils` | [`validutils`](#validutils) |
| Generate synthetic users, emails, phones, IPs, URLs, or Lorem Ipsum text | `rad.mockutils` | [`mockutils`](#mockutils) |
| Compute `timeAgo`, day/month boundaries, high-res `Stopwatch`, or `nanoseconds` | `rad.timeutils` | [`timeutils`](#timeutils) |
| Run full file-find, search-replace, safe trash, `ps`, watch, LOC, disk, IP, OSINT, or DNS tools | System Tools (10) | [Section 7](#7-programmatic-api-for-the-10-system-utilities) |

---

## Contents

- [What is rad in 30 seconds](#what-is-rad-in-30-seconds)
- [Quick import patterns](#quick-import-patterns)
- [Symptom-to-module quick finder](#symptom-to-module-quick-finder)
- [Confusing pairs explained](#confusing-pairs-explained)
- [1. File, SQLite WAL and FTS5, TOML, archives, and state (8 modules)](#1-file-sqlite-wal-and-fts5-toml-archives-and-state-8-modules)
- [2. Arrays, slices, objects, data structures, statistics, math, bits, and graphs (8 modules)](#2-arrays-slices-objects-data-structures-statistics-math-bits-and-graphs-8-modules)
- [3. Strings, regex, templates, color, HTML, and diffs (6 modules)](#3-strings-regex-templates-color-html-and-diffs-6-modules)
- [4. System, CLI, env, shell, glob, transpile, logging, cron, and semver (9 modules)](#4-system-cli-env-shell-glob-transpile-logging-cron-and-semver-9-modules)
- [5. Networking, HTTP, server, URL, JWT, crypto, and hashing (7 modules)](#5-networking-http-server-url-jwt-crypto-and-hashing-7-modules)
- [6. Async, flow control, functional utilities, events, validation, mocks, and time (7 modules)](#6-async-flow-control-functional-utilities-events-validation-mocks-and-time-7-modules)
- [7. Programmatic API for the 10 system utilities](#7-programmatic-api-for-the-10-system-utilities)
- [8. Pro tips, cross-platform gotchas, and FAQ](#8-pro-tips-cross-platform-gotchas-and-faq)

---

## Confusing pairs explained

### 1. `rad.fileutils` vs `rad.sqliteutils` vs `rad.stateutils` vs `rad.cacheutils`

| Module | Persisted to disk? | Best for | Avoid when |
| :--- | :--- | :--- | :--- |
| `rad.fileutils` | Yes (raw files) | Configs, JSON/JSONL logs, CSV tables, binary assets, temp dirs | Concurrent multi-writer mutations or indexed queries |
| `rad.sqliteutils` | Yes (`.db` + WAL) | Structured rows, atomic transactions, schema migrations, KV counters, JSON docs, FTS5 full-text search | Ephemeral UI settings or multi-GB blobs |
| `rad.stateutils` | Yes (OS JSON files) | App preferences, UI state, reactive `.subscribe()` listeners, bounded rollback history | High-frequency relational queries or many records |
| `rad.cacheutils` | No (RAM only) | Hot in-memory `LRUCache` or `TTLCache` with async `getOrSet` thundering-herd protection | Anything that must survive process restarts |

### 2. `rad.sysutils.execSafe` vs `rad.shellutils`

- **Use `rad.sysutils.execSafe(cmd, args, options)`** whenever any argument comes from user input, filenames with spaces, or untrusted input. It spawns `cmd` directly without invoking `/bin/sh` or `cmd.exe`, eliminating shell injection (`;` / `&&` / `$()` / backtick attacks).
- **Use `rad.shellutils.execCmd` / `exec` / `pipeCmds`** only for trusted developer commands that deliberately need shell syntax (`|`, redirects, env expansion, or `timeoutMs`).

### 3. `rad.cryptoutils` vs `rad.hashutils` vs `rad.jwtutils`

- **`rad.cryptoutils`**: Cryptographically secure digests (`sha256`, `sha512`), keyed message authentication (`hmacSha256`), CSPRNG tokens (`randomToken`, `uuidV4`, `uuidV7`), and slow salted password hashing (`hashPassword` / `verifyPassword` via Argon2id). Use for security, integrity, and auth.
- **`rad.hashutils`**: Ultra-fast **non-cryptographic** hashes (`wyhash`, `rapidhash`, `cityHash64`, `crc32`, `murmur32v3`) and `createBloomFilter`. **Never use `hashutils` for passwords, tokens, or tamper detection** — use it for cache keys, checksums, deduplication, and hash partitioning.
- **`rad.jwtutils`**: Stateless `HS256` JSON Web Tokens (`signJwt`, `verifyJwt` with constant-time signature checks + `exp` validation, `decodeJwtUnverified` for debugging).

### 4. `rad.archiveutils` vs `rad.tarutils` vs `rad.compressutils`

- **`rad.archiveutils`**: Multi-file **`.zip`** archives with built-in zip-slip `safeJoin` checks and entry/total decompression size caps (`256 MiB` / `512 MiB` defaults). Best for cross-platform bundles shared with macOS/Windows users.
- **`rad.tarutils`**: POSIX USTAR/PAX **`.tar` and `.tar.gz`** archives preserving Unix file modes and `mtime`. Best for backups, release tarballs, and Linux/macOS tooling.
- **`rad.compressutils`**: In-memory & single-file **Gzip, Deflate, Brotli, and Zstd** compression for strings and `Uint8Array` buffers (does not bundle multiple files/directories into one archive).

### 5. `rad.globutils` vs `fd` Coordinator `searchFiles`

- **`rad.globutils`**: Ultra-fast wildcard pattern matching (`globMatch`, `globFilter`, `globScan`, `globScanSync`) powered by `Bun.Glob` (including extglob `!(...)` and brace ranges `{a..z}`). Returns `string[]` paths or booleans.
- **`fd` Coordinator (`searchFiles`)**: Recursive directory traversal returning rich `FdEntry` metadata (`size`, `mtime`, `depth`, `isSymlink`, `isExecutable`) with regex smart-case, size bounds (`+10M`), age filters (`changedWithin: "2h"`), `--empty`, `--exclude`, and `--exec`.

### 6. `rad.asyncutils` vs `rad.flowutils` vs `rad.fnutils`

- **`rad.asyncutils`**: Concurrency **execution** (`parallelMap`, `parallelFilter`, `parallelEach`, `WorkerPool`, `createWaitGroup`, `timeoutPromise`).
- **`rad.flowutils`**: Resilience and traffic **shaping** (`RateLimiter` token bucket, `CircuitBreaker`, jittered `retry`, `debounce`, `throttle`).
- **`rad.fnutils`**: Functional **composition & call adapters** (`pipe`, `memoize`, `once`, `negate`, `partial`, `before`, `after`, `identity`, `noop`, `times`, `delay`).

### 7. `rad.fileutils.writeFileAtomic` (async) vs `SimpleGUI` `writeFileAtomic` (sync)

- **`rad.fileutils.writeFileAtomic(filePath, data)`** is **asynchronous**, accepts `string | Uint8Array`, creates parent directories automatically, and returns `Promise<number>` (bytes written).
- **`SimpleGUI`'s `writeFileAtomic(filePath, content)`** (exported at the top level of `"bun-rad-studio"` / [`src/index.ts`](../../src/index.ts)) is **synchronous**, returns `void`, accepts UTF-8 `string` only, and enforces `0o600` file permissions on POSIX.

---

## 1. File, SQLite WAL and FTS5, TOML, archives, and state (8 modules)

<a id="fileutils"></a>
### `rad.fileutils`

**Why it exists:** Replaces `fs-extra`, `mkdirp`, `rimraf`, `csv-parse`, `csv-stringify`, and `pretty-bytes` with async, cross-platform file helpers and crash-safe atomic writes.

- **Paths & Metadata:** `ensureDir(dirPath: string): Promise<void>`, `pathExists(path: string): Promise<boolean>`, `isFile(path: string): Promise<boolean>`, `isDir(path: string): Promise<boolean>`, `fileInfo(path: string): Promise<FileInfo | null>`, `dirSize(dirPath: string): Promise<number>`
- **Byte Formatting & Hashing:** `formatBytes(bytes: number, decimals = 1): string`, `parseBytes(input: string): number`, `fileSizeHuman(bytesOrPath: number | string): Promise<string>`, `hashFile(filePath: string, algorithm: FileHashAlgorithm = "sha256"): Promise<string>` (`"md5" | "sha1" | "sha256" | "sha512" | "blake2b256"`)
- **Text, Atomic Writes, JSON, JSONL, Lines:** `readText(filePath: string, fallback?: string): Promise<string>`, `writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<number>`, `writeText(filePath: string, text: string, options?: { atomic?: boolean }): Promise<number>`, `saveJson(filePath: string, data: unknown, pretty = true): Promise<void>`, `loadJson<T>(filePath: string, fallback?: T): Promise<T>`, `readJsonl<T = unknown>(filePath: string): Promise<T[]>`, `writeJsonl(filePath: string, records: unknown[]): Promise<void>`, `appendJsonl(filePath: string, record: unknown): Promise<void>`, `readLines(filePath: string): Promise<string[]>`, `writeLines(filePath: string, lines: string[]): Promise<void>`, `appendLine(filePath: string, line: string): Promise<void>`, `appendLines(filePath: string, lines: string[]): Promise<void>`
- **File Ops, Temp Dirs, Traversal:** `touch(filePath: string): Promise<void>`, `copyFile(src: string, dest: string): Promise<void>`, `moveFile(src: string, dest: string): Promise<void>`, `copyDir(srcDir: string, destDir: string, overwrite = true): Promise<void>`, `removePath(path: string): Promise<boolean>`, `makeTempDir(prefix = "rad-"): Promise<string>`, `withTempDir<T>(fn: (dir: string) => Promise<T> | T, prefix = "rad-"): Promise<T>`, `walkFiles(dirPath: string, filter?: (filePath: string) => boolean, options?: WalkOptions): Promise<string[]>` (`WalkOptions`: `{ maxDepth?: number; skipDirs?: string[]; includeDirs?: boolean }`)
- **CSV (RFC 4180):** `parseCsvString(csvText: string, delimiter = ",", options?: CsvParseOptions): string[][]`, `formatCsvString(rows: CsvCell[][], delimiter = ","): string`, `csvToObjects(rows: string[][]): Record<string, string>[]`, `objectsToCsv(records: Record<string, CsvCell>[], columns?: string[]): CsvCell[][]`, `readCsv(filePath: string, delimiter = ",", options?: CsvParseOptions): Promise<string[][]>`, `writeCsv(filePath: string, rows: CsvCell[][], delimiter = ","): Promise<void>`, `readCsvObjects(filePath: string, delimiter = ","): Promise<Record<string, string>[]>`, `writeCsvObjects(filePath: string, records: Record<string, CsvCell>[], columns?: string[], delimiter = ","): Promise<void>`

<a id="sqliteutils"></a>
### `rad.sqliteutils`

**Why it exists:** Wraps Bun's built-in C-speed `bun:sqlite` (`Database`) with WAL mode enabled by default, parameterized CRUD builders (protecting table/column identifiers via `quoteIdent`), versioned migrations, a persistent Key-Value store, a JSON document store, and FTS5 ranked full-text search — replacing `better-sqlite3`, `lowdb`, and simple ORM boilerplate.

- **Connection & Core SQL:** `openDb(path = ":memory:", options: boolean | OpenDbOptions = true): Database` (`OpenDbOptions`: `{ wal?, readonly?, create?, foreignKeys?, busyTimeoutMs? }`), `closeDb(db: Database): void`, `quoteIdent(name: string): string`, `execSql(db: Database, sql: string, params: SqlParams = []): void`, `queryAll<T>(db: Database, sql: string, params: SqlParams = []): T[]`, `queryOne<T>(db: Database, sql: string, params: SqlParams = []): T | null`, `queryValue<T>(db: Database, sql: string, params: SqlParams = []): T | null`, `transaction<T>(db: Database, fn: () => T): T`
- **Schema Inspection & CRUD:** `tableExists(db, table): boolean`, `listTables(db): string[]`, `tableColumns(db, table): ColumnInfo[]`, `countRows(db, table, whereClause?, params = []): number`, `insertRow(db, table, record): number`, `insertMany(db, table, records): number`, `upsertRow(db, table, record, conflictColumns): number`, `selectRows<T>(db, table, columns = ["*"], whereClause?, params = []): T[]`, `selectOne<T>(db, table, whereClause, params = []): T | null`, `updateRows(db, table, updates, whereClause?, params = []): number`, `deleteRows(db, table, whereClause?, params = []): number`
- **Schema Migrations:** `runMigrations(db, migrations: SqlMigration[]): number` (`SqlMigration`: `{ version: number; up: string; name?: string }`), `getSchemaVersion(db): number`
- **Key-Value Store:** `createKvTable(db, table = "kv_store"): void`, `setKv(db, table, key, value): void`, `getKv(db, table, key): string | null`, `getKvOr<T>(db, table, key, fallback: T): T`, `hasKv(db, table, key): boolean`, `incrementKv(db, table, key, by = 1): number`, `deleteKv(db, table, key): boolean`, `listKv(db, table): Record<string, string>`
- **JSON Document Store:** `createJsonStore(db, table = "json_store"): void`, `saveDoc<T>(db, table, id, doc: T): void`, `loadDoc<T>(db, table, id): T | null`, `deleteDoc(db, table, id): boolean`, `listDocs<T>(db, table): StoredDoc<T>[]`, `findDocs<T>(db, table, jsonPath, value: string | number | boolean | null): StoredDoc<T>[]`
- **FTS5 Full-Text Search:** `createFtsTable(db, table, columns: string[]): void`, `indexFts(db, table, row: Record<string, any>): void`, `searchFts<T>(db, table, query: string, limit = 50): T[]`, `searchFtsRanked<T>(db, table, query: string, limit = 50): (T & { rank: number })[]`
- **Maintenance & Extensions:** `vacuumDb(db): void`, `checkpointWal(db): void`, `backupDb(db, destPath: string): void`, `dbSizeBytes(db): number`, `registerFunction(db, name, fn, options?)`, `registerAggregate(db, name, options)`, `onDatabaseChange(db, hooks): () => void`, `statementInfo(db, sql): SqliteStatementInfo`

<a id="tomlutils"></a>
### `rad.tomlutils`

**Why it exists:** Uses `Bun.TOML.parse` plus a clean serializer, layered file loader, and dot-path typed accessors — eliminating `smol-toml` or `iarna-toml`.

- **Parse & Serialize:** `parse` (`Bun.TOML.parse`), `stringify`, `parseToml<T>(content: string): T`, `tryParseToml<T>(content: string): T | null`, `stringifyToml(data: Record<string, any>): string`
- **File I/O & Layering:** `loadToml<T>(filePath: string, fallback?: T): Promise<T>`, `saveToml(filePath: string, data: Record<string, any>): Promise<number>`, `loadTomlLayers<T>(filePaths: string[]): Promise<T>`, `mergeToml<T>(base: T, override: Record<string, any>): T`
- **Dot-Path Getters & Mutators:** `getTomlPath(doc, keyPath)`, `hasTomlKey(doc, keyPath): boolean`, `setTomlPath<T>(doc, keyPath, value): T`, `getString(doc, keyPath, fallback = ""): string`, `getInt(doc, keyPath, fallback = 0): number`, `getNumber(doc, keyPath, fallback = 0): number`, `getBool(doc, keyPath, fallback = false): boolean`, `getArray<T>(doc, keyPath, fallback = []): T[]`, `getTable<T>(doc, keyPath, fallback = {}): T`

<a id="archiveutils"></a>
### `rad.archiveutils`

**Why it exists:** Pure-TypeScript `.zip` builder and extractor backed by `Bun.deflateRawSync`/`Bun.inflateRawSync`, enforcing zip-slip path containment and size budgets (`MAX_ZIP_ENTRY_BYTES` = 256 MiB, `MAX_ZIP_TOTAL_BYTES` = 512 MiB) — replacing `adm-zip` and `jszip` (standard non-Zip64/unencrypted `.zip`, up to 65,535 entries and < 4 GiB).

- **Create ZIPs:** `zipFiles(entries: ZipEntryInput[]): Uint8Array`, `zipFile(srcPath: string, destZipPath: string): Promise<void>`, `zipDir(srcDir: string, destZipPath: string, filter?: (relPath: string) => boolean): Promise<number>`
- **Inspect & Extract ZIPs:** `listZipEntries(zipDataOrPath): Promise<string[]>`, `listZipDetails(zipDataOrPath): Promise<ZipEntryInfo[]>`, `readZipEntry(zipDataOrPath, entryName: string): Promise<Uint8Array | null>`, `readZipText(zipDataOrPath, entryName: string): Promise<string | null>`, `unzipToMemory(zipDataOrPath, maxTotalBytes?): Promise<ZipExtractedEntry[]>`, `unzipToDir(zipDataOrPath, destDir: string, maxTotalBytes?): Promise<number>`
- **Security & Time Helpers:** `safeJoin(destDir: string, entryName: string): string`, `toDosDateTime(d: Date): { time: number; date: number }`, `fromDosDateTime(time: number, date: number): Date`

<a id="compressutils"></a>
### `rad.compressutils`

**Why it exists:** One consistent API over Bun's native Gzip, Deflate, Brotli (`quality = 11` default), and Zstd (`level = 3` default), complete with magic-byte format detection and default `256 MiB` decompression bomb guards (`DEFAULT_MAX_DECOMPRESSED_BYTES`).

- **Format-Specific:** `gzipCompress(data, level?)`, `gzipDecompress(data, maxOutputLength?)`, `gzipCompressString(str): string` (Base64), `gzipDecompressString(base64Str, maxOutputLength?): string`, `deflateCompress(data, level?)`, `deflateDecompress(data, maxOutputLength?)`, `brotliCompress(data, quality = 11)`, `brotliDecompress(data, maxOutputLength?)`, `zstdCompress(data, level = 3)`, `zstdDecompress(data, maxOutputLength?)`
- **Unified, Files & Inspection:** `compress(data, format: CompressionFormat, level?)`, `decompress(data, format: CompressionFormat, maxOutputLength?)` (`CompressionFormat`: `"gzip" | "deflate" | "brotli" | "zstd"`), `detectCompression(data: Uint8Array): DetectedCompression` (`"gzip" | "zstd" | "zlib" | "unknown"`), `compressFile(src, format = "gzip", dest?): Promise<string>`, `decompressFile(src, format = "gzip", dest?): Promise<string>`, `compressionRatio(uncompressedLen, compressedLen): number`

<a id="tarutils"></a>
### `rad.tarutils`

**Why it exists:** Zero-dependency POSIX USTAR/PAX tar & `.tar.gz` packer/unpacker with symlink/path-traversal protection and `MAX_DECOMPRESSED_TAR_BYTES` (`256 MiB`) guard — replacing `tar` and `tar-stream`.

- **Byte API:** `packTarBytes(entries: TarEntry[]): Uint8Array`, `unpackTarBytes(bytes: Uint8Array): UnpackedTarEntry[]`, `listTarEntries(bytes: Uint8Array): string[]`, `packTarGz(entries: TarEntry[], level?): Uint8Array`, `unpackTarGz(bytes: Uint8Array, maxOutputLength?): UnpackedTarEntry[]`, `paxRecord(key: string, value: string): string`
- **Directory/File API:** `createTarFile(srcDir: string, destTarPath: string, filter?: (relPath: string) => boolean): Promise<number>`, `extractTarFile(tarPath: string, destDir: string): Promise<number>` (handles both `.tar` and `.tar.gz` / `.tgz`)

<a id="stateutils"></a>
### `rad.stateutils`

**Why it exists:** Persists application preferences and small JSON state atomically to OS-standard app directories, supporting reactive `.subscribe()` callbacks and snapshot rollback — replacing `conf` and `env-paths`.

- **OS Directory Resolvers:** `resolveConfigDir(appName: string): string`, `resolveDataDir(appName: string): string`, `resolveCacheDir(appName: string): string`
- **`AppStateStore<T>` (`new AppStateStore<T>(appName, defaultState, options?: AppStateOptions)`):**
  - `options`: `{ customPath?: string; autoSave?: boolean; historyLimit?: number }`
  - Properties & Methods: `filePath`, `autoSave`, `historyLimit`, `get(): T`, `select<K>(selector: (state: T) => K): K`, `update(updater: (prev: T) => T | void): Promise<void>`, `patch(partial: Partial<T>): Promise<void>`, `subscribe(listener: StateListener<T>): () => void`, `save(): Promise<void>`, `load(): Promise<T>`, `canRollback(): boolean`, `rollback(): void`, `reset(): void`, `removeFile(): Promise<boolean>`
- **`KeyValueState` (`new KeyValueState(appName, customPath?)`):** `filePath`, `init(): Promise<void>`, `get<T>(key, fallback?): T`, `has(key): boolean`, `set(key, val): Promise<void>`, `setMany(entries): Promise<void>`, `delete(key): Promise<void>`, `keys(): string[]`, `all(): Record<string, any>`, `clear(): Promise<void>`

<a id="cacheutils"></a>
### `rad.cacheutils`

**Why it exists:** Provides fast in-memory O(1) LRU eviction and TTL expiration caches, plus `TTLCache.getOrSet` in-flight promise deduplication (eliminating thundering-herd cache stampedes) — replacing `lru-cache` and `node-cache`.

- **`LRUCache<K, V>` (`new LRUCache<K, V>(capacity: number, onEvict?: (key: K, value: V) => void)`):**
  - `capacity`, `size(): number`, `get(key): V | undefined`, `peek(key): V | undefined`, `set(key, value): void`, `getOrSet(key, factory: () => V): V` (synchronous!), `has(key): boolean`, `delete(key): boolean`, `clear(): void`, `resize(newCapacity: number): void`, `keys(): K[]`, `values(): V[]`, `entries(): [K, V][]`, `stats(): CacheStats`
- **`TTLCache<K, V>` (`new TTLCache<K, V>(defaultTtlMs = 60_000, options?: TTLCacheOptions)`):**
  - `options`: `{ sweepIntervalMs?: number; sliding?: boolean }`
  - `defaultTtlMs`, `sliding`, `size(): number`, `get(key): V | undefined`, `set(key, value, ttlMs?): void`, `getOrSet(key, factory: () => Promise<V> | V, ttlMs?): Promise<V>` (async with in-flight deduplication!), `has(key): boolean`, `ttl(key): number`, `touch(key, ttlMs?): boolean`, `delete(key): boolean`, `clear(): void`, `prune(): number`, `keys(): K[]`, `stats(): CacheStats`, `dispose(): void`

### Domain 1 runnable recipes

#### Recipe A: `sqliteutils` 4-in-1 (WAL SQL + Migrations + Transaction + KV + JSON Docs + FTS5)

```ts
import { rad } from "./src/features/rad/index.ts";

const sql = rad.sqliteutils;

// 1. Open in-memory (or "./data/app.db") with WAL + foreign keys enabled
const db = sql.openDb(":memory:", { wal: true, foreignKeys: true });

try {
  // 2. Run idempotent numbered schema migrations
  sql.runMigrations(db, [
    {
      version: 1,
      name: "create_notes",
      up: `
        CREATE TABLE notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          views INTEGER NOT NULL DEFAULT 0
        );
      `,
    },
  ]);

  // 3. Atomic transaction + CRUD + upsert
  sql.transaction(db, () => {
    sql.insertMany(db, "notes", [
      { slug: "bun-wal", title: "SQLite WAL Mode Guide", views: 10 },
      { slug: "rad-fts5", title: "Full-Text Search with FTS5", views: 25 },
    ]);
    sql.upsertRow(
      db,
      "notes",
      { slug: "bun-wal", title: "SQLite WAL Mode Guide (Updated)", views: 11 },
      ["slug"],
    );
  });
  const topNotes = sql.queryAll<{ slug: string; views: number }>(
    db,
    "SELECT slug, views FROM notes ORDER BY views DESC",
  );

  // 4. Built-in Key-Value store (counters, flags, config values)
  sql.createKvTable(db, "app_kv");
  sql.setKv(db, "app_kv", "app.env", "production");
  const hits = sql.incrementKv(db, "app_kv", "metrics.hits", 5);
  const retries = sql.getKvOr<number>(db, "app_kv", "http.retries", 3);

  // 5. Built-in JSON Document store with SQLite json_extract queries
  sql.createJsonStore(db, "plugins");
  sql.saveDoc(db, "plugins", "zip-helper", {
    name: "Zip Helper",
    enabled: true,
    tier: "core",
  });
  const doc = sql.loadDoc<{ name: string; enabled: boolean }>(
    db,
    "plugins",
    "zip-helper",
  );
  const corePlugins = sql.findDocs<{ name: string; tier: string }>(
    db,
    "plugins",
    "$.tier",
    "core",
  );

  // 6. Built-in FTS5 ranked full-text search
  sql.createFtsTable(db, "docs_fts", ["title", "body"]);
  sql.indexFts(db, "docs_fts", {
    title: "Atomic File Writes",
    body: "Use writeFileAtomic for crash-safe saves in Bun RAD Studio.",
  });
  sql.indexFts(db, "docs_fts", {
    title: "Zip Archives",
    body: "Use archiveutils to pack directories with zip-slip protection.",
  });
  const ranked = sql.searchFtsRanked<{ title: string; body: string }>(
    db,
    "docs_fts",
    "atomic OR writeFileAtomic",
    10,
  );

  console.log({
    schemaVersion: sql.getSchemaVersion(db),
    topNotes,
    hits,
    retries,
    doc,
    coreCount: corePlugins.length,
    rankedTitles: ranked.map((r) => `${r.title} (rank=${r.rank.toFixed(2)})`),
  });
} finally {
  sql.closeDb(db);
}
```

#### Recipe B: `fileutils` + `tomlutils` + `archiveutils` (Config layering, atomic audit log, and ZIP backup)

```ts
import { join } from "node:path";
import { rad } from "./src/features/rad/index.ts";

await rad.fileutils.withTempDir(async (workDir) => {
  const baseToml = join(workDir, "default.toml");
  const localToml = join(workDir, "local.toml");
  const auditLog = join(workDir, "bundle", "audit.jsonl");
  const stateFile = join(workDir, "bundle", "manifest.json");
  const backupZip = join(workDir, "backup.zip");
  const restoreDir = join(workDir, "restored");

  // Save and merge layered TOML configs
  await rad.tomlutils.saveToml(baseToml, {
    app: { name: "rad-demo", port: 8080, debug: false },
  });
  await rad.tomlutils.saveToml(localToml, {
    app: { port: 9090, debug: true },
  });
  const cfg = await rad.tomlutils.loadTomlLayers([baseToml, localToml]);

  // Write JSONL logs + atomic manifest
  await rad.fileutils.ensureDir(join(workDir, "bundle"));
  await rad.fileutils.appendJsonl(auditLog, {
    event: "config_loaded",
    port: rad.tomlutils.getInt(cfg, "app.port", 3000),
    debug: rad.tomlutils.getBool(cfg, "app.debug", false),
  });
  await rad.fileutils.writeFileAtomic(
    stateFile,
    JSON.stringify({ app: rad.tomlutils.getString(cfg, "app.name") }, null, 2),
  );

  // Archive bundle directory into a ZIP and verify contents safely
  const packedCount = await rad.archiveutils.zipDir(
    join(workDir, "bundle"),
    backupZip,
  );
  const details = await rad.archiveutils.listZipDetails(backupZip);
  const restoredCount = await rad.archiveutils.unzipToDir(
    backupZip,
    restoreDir,
  );

  console.log({
    packedCount,
    restoredCount,
    entries: details.map((e) => `${e.name} (${e.uncompressedSize} B)`),
    manifestHash: await rad.fileutils.hashFile(
      join(restoreDir, "manifest.json"),
      "sha256",
    ),
  });
}, "rad-backup-");
```

---

## 2. Arrays, slices, objects, data structures, statistics, math, bits, and graphs (8 modules)

<a id="arrutils-and-sliceutils-alias"></a>
### `rad.arrutils` and `rad.sliceutils` (alias)

**Why it exists:** `rad.sliceutils` is a direct alias of `rad.arrutils` (providing 59 immutable array/slice operations inspired by `lodash`, Rust slices, and `es-toolkit`) — eliminating `lodash-es` or `ramda`.

- **Indexing & Slicing:** `at<T>(arr, index)`, `first`/`head`, `last`, `tail`, `initial`, `take(arr, n = 1)`, `takeRight(arr, n = 1)`, `takeWhile`, `takeRightWhile`, `drop(arr, n = 1)`, `dropRight(arr, n = 1)`, `dropWhile`, `dropRightWhile`, `range(start, end?, step = 1)`
- **Grouping, Aggregation & Filtering:** `compact`, `filterMap`, `unique`, `uniqBy`, `without`, `partition`, `count`, `keyBy`, `countBy`, `groupBy`, `minBy`, `maxBy`, `sumBy`, `frequency`
- **Reshaping & Sets:** `chunk`, `windowed(arr, size, step = 1)`, `pairwise`, `flatten`, `flattenDeep`, `zip`, `zipWith`, `unzip`, `zipObject`, `intersection`, `intersectionBy`, `difference`, `differenceBy`, `union`, `unionBy`, `xor`, `cartesianProduct`
- **Sorting, Search & Sampling:** `sortBy`, `orderBy`, `isSorted`, `binarySearch`, `sortedIndex`, `shuffle`, `sample`, `sampleSize`
- **Immutable Edits:** `insertAt`, `removeAt`, `moveItem`, `rotate`, `toggleItem`

<a id="objutils"></a>
### `rad.objutils`

**Why it exists:** Safe nested object traversal, prototype-pollution-guarded path updates, deep structural equality/cloning/merging, and object diffs — replacing `lodash.merge`, `dot-prop`, and `deep-equal`.

- **Predicates & Equality:** `isNil(v)`, `isPlainObject(v)`, `isPrimitive(v)`, `isEqual(a, b, strict = false)`, `isEmpty(v)`
- **Paths & Transformation:** `toPath(path: ObjPath): (string | number)[]`, `get(obj, path, defaultValue?)`, `has(obj, path)`, `set(obj, path, value)` (blocks `__proto__`/`constructor`/`prototype`), `unset(obj, path)`, `pick(obj, keys)`, `pickBy(obj, pred)`, `omit(obj, keys)`, `omitBy(obj, pred)`, `compactObject(obj)`, `findKey(obj, pred)`, `flattenObject(obj, prefix = "", flattenArrays = false)`, `unflattenObject(flat)`, `mapKeys(obj, fn)`, `mapValues(obj, fn)`, `renameKeys(obj, keyMap)`, `invert(obj)`, `typedKeys(obj)`, `typedEntries(obj)`
- **Clones, Merges & Diffs:** `defaults(obj, ...sources)`, `deepClone<T>(val: T): T`, `deepMerge<T>(target, ...sources): T`, `deepFreeze<T>(obj: T): Readonly<T>`, `objectDiff(a, b): ObjectDiff` (`{ added, removed, changed }`)

<a id="structutils"></a>
### `rad.structutils`

**Why it exists:** Classic algorithmic containers not built into JavaScript (`O(1)` queues/deques/ring buffers, `O(log n)` heaps/priority queues, prefix tries, and disjoint-set union-find) with zero external packages.

- **`SimpleStack<T>`:** `push`, `pop`, `peek`, `isEmpty`, `size`, `clear`, `toArray`
- **`SimpleQueue<T>`:** O(1) amortized FIFO (`enqueue`, `dequeue`, `peek`, `isEmpty`, `size`, `clear`, `toArray`)
- **`SimpleDeque<T>`:** Double-ended (`pushFront`, `pushBack`, `popFront`, `popBack`, `peekFront`, `peekBack`, `isEmpty`, `size`, `clear`, `toArray`)
- **`SimpleRingBuffer<T>(capacity)`:** Fixed-size circular buffer (`push`, `pop`, `peek` [oldest], `peekLast` [newest], `at(index)`, `isFull`, `isEmpty`, `size()`, `capacity`, `clear`, `toArray`)
- **`SimpleMinHeap<T>(compareFn?)`:** `push`, `pop`, `peek`, `isEmpty`, `size`, `clear`, `toArray`
- **`SimplePriorityQueue<T>`:** `enqueue(item, priority)`, `dequeue(): T | undefined`, `peek(): T | undefined`, `isEmpty`, `size`, `clear`
- **`SimpleTrie`:** Prefix autocomplete tree (`add(word)`, `has(word)`, `hasPrefix(prefix)`, `withPrefix(prefix, limit = Infinity)`, `find(prefix, limit?)`, `delete(word)`, `size()`)
- **`DisjointSet<T>`:** Union-find with path compression (`add(x)`, `find(x)`, `union(a, b)`, `connected(a, b)`, `setSize(x)`, `groups()`)

<a id="statutils"></a>
### `rad.statutils`

**Why it exists:** Clean descriptive statistics, outlier detection, correlations, moving averages, histograms, and linear regression that safely return `0` / `[]` on empty inputs instead of leaking `NaN` — replacing `simple-statistics`.

- **Averages & Spread:** `mean`, `weightedMean`, `geometricMean`, `harmonicMean`, `median`, `mode`, `minMax`, `variance(nums, sample = true)`, `stdDev(nums, sample = true)`, `sem(nums)`
- **Quantiles & Outliers:** `percentile(nums, p)`, `quartiles(nums): [number, number, number]`, `iqr(nums)`, `detectOutliers(nums, k = 1.5): number[]` (Tukey IQR fence), `skewness(nums)`, `kurtosis(nums)`
- **Correlation, Regression & Series:** `covariance`, `pearsonCorrelation`, `rank`, `spearmanCorrelation`, `linearRegression(points): LinearModel` (`{ slope, intercept, r2 }`), `predictLinear(model, x)`, `zScore`, `zScores`, `normalize`, `movingAverage`, `exponentialMovingAverage`, `histogram(nums, bins = 10): HistogramBin[]`, `summarize(nums): StatsSummary`

<a id="mathutils"></a>
### `rad.mathutils`

**Why it exists:** Interpolation, angle/rectangle geometry, number theory, exact `bigint` factorials, and seeded/CSPRNG random helpers.

- **Interpolation & Rounding:** `lerp(a, b, t)`, `inverseLerp(a, b, value)`, `remap(value, inMin, inMax, outMin, outMax)`, `clamp(val, min, max)`, `wrap(val, min, max)`, `roundToStep(val, step)`, `round(val, decimals = 0)`, `approxEqual(a, b, epsilon = 1e-9)`, `inRange(val, min, max)`
- **Geometry (`Point2D`, `Rect`):** `distance(p1, p2)`, `midpoint(p1, p2)`, `angleBetween(p1, p2)`, `rotatePoint(p, radians, origin = { x: 0, y: 0 })`, `degToRad`, `radToDeg`, `rectIntersects`, `rectIntersection`, `rectUnion`, `rectContainsPoint`, `rectArea`
- **Number Theory & Series:** `gcd`, `lcm`, `isPowerOfTwo`, `nextPowerOfTwo`, `isPrime`, `primeFactors`, `factorial(n): bigint`, `binomial(n, k)`, `sum`, `sumBy`, `product`, `percentOf`, `percentChange`
- **Randomness:** `randomInt(min, max)`, `randomFloat(min, max)`, `secureRandomInt(min, max)`, `seededRandom(seed): () => number`

<a id="bitutils"></a>
### `rad.bitutils`

**Why it exists:** Clean primitives for 32-bit integer bit manipulation, named enum-like bitmask flags, and arbitrary-length `BitSet` collections.

- **Bit Ops:** `popcount(n)`, `getBit(n, pos)`, `setBit(n, pos)`, `clearBit(n, pos)`, `toggleBit(n, pos)`, `countTrailingZeros(n)`, `toBinary(n, bits = 32): string`
- **Named Flags:** `setFlag(mask, flag)`, `hasFlag(mask, flag)`, `hasAnyFlag(mask, flags)`, `clearFlag(mask, flag)`, `toggleFlag(mask, flag)`, `defineFlags(names: string[])`, `combineFlags(flagMap, names)`, `describeFlags(mask, flagMap)`
- **`BitSet` (`new BitSet(size: number)` + `BitSet.fromIndices(size, indices)` + `BitSet.fromBinaryString(bits)`):** `set`, `get`, `clear`, `toggle`, `fill`, `countSet`, `any`, `none`, `all`, `nextSetBit`, `indices`, `toIndices`, `and`, `or`, `xor`, `andNot`, `clone`, `equals`, `toBinaryString`

<a id="graphutils"></a>
### `rad.graphutils`

**Why it exists:** Full-featured directed/undirected weighted graph toolkit with BFS, DFS, Dijkstra shortest paths, Kahn topological sort, cycle detection, and Tarjan strongly connected components — replacing `graphlib`.

- **`Graph<T extends GraphNode>` (`newGraph<T>(options?: GraphOptions)` / `Graph.fromEdges` / `Graph.fromJSON`):**
  - **Mutations & Queries:** `addNode`, `addEdge(from, to, weight = 1)`, `removeNode`, `removeEdge`, `hasNode`, `hasEdge`, `getEdgeWeight`, `getNeighbors`, `predecessors`, `getNodes`, `getEdges`, `nodeCount`, `edgeCount`, `outDegree`, `inDegree`
  - **Algorithms:** `bfs(start)`, `dfs(start)`, `shortestPath(start, target): T[] | null`, `dijkstra(start, target): WeightedPath<T> | null`, `distancesFrom(start): Map<T, number>`, `reachableFrom(start)`, `topologicalSort(): T[]`, `hasCycle(): boolean`, `findCycle(): T[] | null`, `connectedComponents(): T[][]`, `stronglyConnectedComponents(): T[][]`, `reverse()`, `clone()`, `clear()`, `toJSON()`

### Domain 2 runnable recipe: Task scheduler dependency graph + telemetry stats

```ts
import { rad } from "./src/features/rad/index.ts";

// 1. Build a weighted task DAG and compute execution order + critical cost
const dag = rad.graphutils.newGraph<string>({ directed: true });
dag.addEdge("checkout", "install", 2);
dag.addEdge("install", "lint", 1);
dag.addEdge("install", "test", 4);
dag.addEdge("lint", "build", 2);
dag.addEdge("test", "build", 3);

const order = dag.topologicalSort();
const fastest = dag.dijkstra("checkout", "build");

// 2. Clean raw telemetry rows using sliceutils/arrutils, objutils, and statutils
const rawSamples = [
  { task: "build", ms: 120, owner: { team: "core" }, secretInternal: "x" },
  { task: "build", ms: 135, owner: { team: "core" }, secretInternal: "x" },
  { task: "build", ms: 128, owner: { team: "core" }, secretInternal: "x" },
  { task: "build", ms: 940, owner: { team: "core" }, secretInternal: "x" },
  null,
];
const clean = rad.sliceutils
  .compact(rawSamples)
  .map((row) => rad.objutils.omit(row, ["secretInternal"]));

const latencies = clean.map((r) => r.ms);
const summary = rad.statutils.summarize(latencies);
const outliers = rad.statutils.detectOutliers(latencies);

// 3. Track feature flags with bitutils
const Perms = rad.bitutils.defineFlags(["READ", "WRITE", "DEPLOY"]);
const roleMask = rad.bitutils.combineFlags(Perms, ["READ", "DEPLOY"]);

console.log({
  order,
  shortestCost: fastest,
  summary: {
    mean: summary.mean,
    median: summary.median,
    q3: summary.q3,
    stdDev: summary.stdDev.toFixed(1),
  },
  outliers,
  activeFlags: rad.bitutils.describeFlags(roleMask, Perms),
});
```

---

## 3. Strings, regex, templates, color, HTML, and diffs (6 modules)

<a id="strutils"></a>
### `rad.strutils`

**Why it exists:** Case conversions, PII masking, Levenshtein/fuzzy matching, ANSI-aware truncation/display width, and pluralization — replacing `slugify`, `fuse.js`, `string-width`, and `pluralize`.

- **Case & Words:** `words`, `slugify(str, options?: SlugifyOptions)`, `toSnakeCase`, `toKebabCase`, `toConstantCase`, `toDotCase`, `toCamelCase`, `toPascalCase`, `toTitleCase`, `toSentenceCase`, `capitalize`, `uncapitalize`
- **Masking & Random:** `maskString`, `maskEmail`, `maskPhone`, `maskCreditCard`, `randomString(length: number, alphabet?: string)`, `randomAlphanumeric(length: number)`
- **Fuzzy & Distance:** `levenshteinDistance(a, b)`, `similarity(a, b)` (0–1), `closestMatch(query, candidates)`, `fuzzyScore(query, target)`, `fuzzySearch<T>(query, items, getText: (item: T) => string = String): FuzzyResult<T>[]`
- **Formatting & Unicode:** `truncate`, `truncateWords`, `truncateMiddle`, `padCenter`, `wordWrap(text, width: number, options?: WordWrapOptions)`, `dedent`, `indent`, `normalizeWhitespace`, `isBlank`, `splitLines`, `countOccurrences`, `ensurePrefix`, `ensureSuffix`, `removePrefix`, `removeSuffix`, `graphemes`, `reverse`, `displayWidth`, `stripAnsi` (**namespace-only on `strutils`**), `pluralize`, `ordinal`, `initials`

<a id="regexutils"></a>
### `rad.regexutils`

**Why it exists:** Safe regex compilation, pre-tested `commonPatterns`, and zero-boilerplate named capture group extraction.

- **Built-In Patterns (`commonPatterns`):** `email`, `url`, `ipv4`, `uuid`, `semver`, `hexColor`, `isoDate`, `slug`, `integer`, `number`, `whitespace`
- **Compile & Test:** `escapeRegExp(str)`, `literal(str, flags = "")`, `isValidRegex(pattern)`, `tryRegex(pattern, flags = ""): RegExp | null`, `isMatch(text, pattern)`, `matchesPattern(text, name: CommonPatternName)`, `anyOf(patterns: string[], flags = ""): RegExp`
- **Extract & Transform:** `findFirst`, `findAll`, `matchFirst`, `matchAll`, `countMatches`, `replace`, `replaceFirst`, `split`, `findNamedGroups(text, pattern)`, `extractGroups(text, pattern)`

<a id="templateutils"></a>
### `rad.templateutils`

**Why it exists:** Lightweight `{{variable | filter}}` template engine supporting nested dot-paths, custom filters, HTML escaping, strict missing-key checking, plus ANSI-colored Markdown terminal rendering.

- **Engine:** `builtinFilters` (`upper`, `lower`, `trim`, `capitalize`, `title`, `json`, `escape`, `length`), `compileTemplate(template: string, options?: TemplateOptions): CompiledTemplate` (`TemplateOptions`: `{ escape?: boolean; missing?: "empty" | "keep" | "throw"; filters?: Record<string, TemplateFilter> }`), `renderTemplate(template: string, data: Record<string, any>, options?: TemplateOptions): string`, `templateVariables(template: string): string[]`
- **Markdown:** `renderMarkdownAnsi(markdown: string): string`

<a id="colorutils"></a>
### `rad.colorutils`

**Why it exists:** Powered by native `Bun.color` plus WCAG 2.1 contrast calculation, perceptual Delta-E (`rgbToLab` + `deltaE`), color harmonies, gradients, and 24-bit ANSI terminal helpers — replacing `color`, `colord`, and `tinycolor2`.

- **Parse & Convert:** `color` (`Bun.color`), `parseColor(input): RGBA | null`, `isValidColor(input): boolean`, `hexToRgb`, `rgbToHex(rgb, includeAlpha = false)`, `toCssRgb`, `toCssHsl`, `rgbToHsl`, `hslToRgb`, `rgbToHsv`, `hsvToRgb`, `rgbToLab`, `deltaE`
- **Manipulate & Palettes:** `lighten`, `darken`, `saturate`, `desaturate`, `rotateHue`, `complement`, `invertColor`, `grayscale`, `mix`, `gradient(c1, c2, steps)`, `shades(rgb: RGB, count = 9)`, `harmony(rgb: RGB, scheme)`
- **WCAG Accessibility & ANSI:** `luminance(rgb)`, `contrastRatio(fg: RGB, bg: RGB): number`, `isAccessible(fg: RGB, bg: RGB, level?: WcagLevel): boolean`, `isLight`, `isDark`, `bestTextColor(bg: RGB): RGB`, `randomColor()`, `fgRgb`, `bgRgb`, `fgColor`, `gradientText`

<a id="htmlutils"></a>
### `rad.htmlutils`

**Why it exists:** Fast, zero-dependency HTML escaping, safe template literal tag builder (`safeHtml` / `rawHtml`), tag stripping, and lightweight scraping (`selectAll`, links, headings, meta tags) without `cheerio` or `he`.

- **Escaping & Safe Builders:** `escapeHtml`, `unescapeHtml`, `rawHtml(html): RawHtml`, `safeHtml(strings, ...values): RawHtml` (call `.toString()` or `String(...)` for the rendered HTML string), `buildTag(tag, attrs?, content?)`
- **Extraction & Text Conversion:** `stripTags`, `htmlToText`, `parseAttributes(attrStr)`, `selectAll(html, selector): HtmlElementInfo[]`, `selectFirst(html, selector): HtmlElementInfo | null`, `extractLinks(html, baseUrl?): HtmlLink[]`, `extractImages(html, baseUrl?)`, `extractHeadings(html)`, `extractMeta(html): HtmlMeta`, `getElementById(html, id): { id, tag, text, raw } | null`, `getElementsByTag(html, tag): { tag, text, raw }[]`

<a id="diffutils"></a>
### `rad.diffutils`

**Why it exists:** Myers-style line/word/char/array diffing, standard unified diff generation + patch parsing/application, and ANSI-colored inline/unified terminal diff rendering — replacing `diff`.

- **Diff Computation:** `diffArrays<T>(a, b): DiffOp<T>[]`, `diffLines(oldText, newText, options?: DiffLineOptions): DiffChange[]` (`DiffType = "add" | "delete" | "equal"`), `diffWords(oldText, newText): DiffOp<string>[]`, `diffChars(oldText, newText): DiffOp<string>[]`, `diffStats(changes): DiffStats`, `similarityRatio(oldText, newText): number`
- **Unified Patches & Rendering:** `unifiedDiff(oldText, newText, filename = "file.txt", options?: UnifiedDiffOptions): string` (`options`: `{ context?, newFilename?, ignoreWhitespace?, ignoreCase? }`), `parseUnifiedDiff(patch): DiffHunk[]`, `applyPatch(oldText, patch: string): string`, `renderColoredDiff(diffText: string): string`, `renderInlineDiff(oldText, newText): string`

### Domain 3 runnable recipe: Accessible release summary + patch diff report

```ts
import { rad } from "./src/features/rad/index.ts";

// 1. Validate contrast for a status badge color
const badgeBg = "#0369a1";
const badgeBgRgb = rad.colorutils.hexToRgb(badgeBg)!;
const badgeFgRgb = rad.colorutils.bestTextColor(badgeBgRgb);
const badgeFgHex = rad.colorutils.rgbToHex(badgeFgRgb);
const contrast = rad.colorutils.contrastRatio(badgeFgRgb, badgeBgRgb);

// 2. Render a safe HTML snippet and a terminal Markdown card from templates
const tpl = "Release **{{version | upper}}** by {{author}} ({{slug}})";
const slug = rad.strutils.slugify("Bun RAD Studio v2 Launch!");
const md = rad.templateutils.renderTemplate(
  tpl,
  { version: "v2.0.0", author: rad.strutils.maskEmail("dev@example.com"), slug },
  { missing: "throw" },
);
const htmlCard = rad.htmlutils
  .safeHtml`<div data-slug="${slug}" style="background:${badgeBg};color:${badgeFgHex}">${md}</div>`
  .toString();

// 3. Diff old vs updated configuration and generate a unified patch
const oldCfg = "port = 3000\nworkers = 2\nmode = dev";
const newCfg = "port = 8080\nworkers = 4\nmode = prod";
const patch = rad.diffutils.unifiedDiff(oldCfg, newCfg, "config.toml");

console.log({ contrast: contrast.toFixed(2), htmlCard });
console.log(rad.templateutils.renderMarkdownAnsi(md));
console.log(rad.diffutils.renderColoredDiff(patch));
console.log("Applied round-trip matches:", rad.diffutils.applyPatch(oldCfg, patch) === newCfg);
```

---

## 4. System, CLI, env, shell, glob, transpile, logging, cron, and semver (9 modules)

<a id="sysutils"></a>
### `rad.sysutils`

**Why it exists:** Safely executes external binaries **without invoking a shell**, inspects host OS/memory/CPU metrics, quotes CLI args, and accesses the OS clipboard.

- **OS & Clipboard:** `getSystemInfo(): SystemInfo` (`{ platform, arch, cpuCount, totalMem, freeMem, uptime, hostname }`), `getHomeDir(): string`, `getTempDir(): string`, `copyToClipboard(text: string): Promise<boolean>`, `readFromClipboard(): Promise<string>`
- **Safe Subprocesses:** `quoteArg(arg: string): string`, `execSafe(cmd: string, args: string[] = [], options?: { cwd?: string; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string; exitCode: number }>`

<a id="cliutils"></a>
### `rad.cliutils`

**Why it exists:** ANSI-aware terminal widgets (progress bars, sparklines, bar charts, gauges, hierarchical trees, colors, and ANSI string width/wrapping) — note there is **no** `formatTable` here; use [`src/shared/table.ts`](../../src/shared/table.ts) if you need ASCII/Unicode tables.

- **ANSI Colors & Width:** `colors`, `bold`, `dim`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `gray`, `stripAnsi(str): string`, `stringWidth(str): number`, `sliceAnsi(str, start, end?): string`, `wrapAnsi(str, width): string`
- **Widgets & Charts:** `progressBar` / `formatProgressBar(current, total, width = 30)`, `sparkline` / `renderSparkline(nums): string`, `barChart` / `renderBarChart(items: BarChartItem[], maxWidth = 30): string`, `gauge` / `renderGauge(value: number, min: number, max: number, width = 20): string`, `tree` / `renderTree(node: TreeNode): string` (`BarChartItem`: `{ label, value }`, `TreeNode`: `{ name, children? }`)

<a id="envutils"></a>
### `rad.envutils`

**Why it exists:** Parses `.env` files, enforces required environment variables, expands `${VAR}` references, and coerces strings, ints, floats, and booleans (`"1"`, `"true"`, `"yes"`, `"on"`) — replacing `dotenv`.

- **Typed Getters & Mutation:** `getStr(key, fallback = "")`, `getInt(key, fallback = 0)`, `getFloat(key, fallback = 0)`, `getBool(key, fallback = false)`, `set(key, value)`, `requireEnv(key): string` (throws if missing/empty)
- **File Parsing & Expansion:** `parseEnvString(content): Record<string, string>`, `loadEnv(contentOrPath: string): Promise<Record<string, string>>`, `expandVars(str, extraVars?): string`

<a id="shellutils"></a>
### `rad.shellutils`

**Why it exists:** Runs trusted shell strings, pipes commands together, captures output lines cleanly, resolves executables in `PATH`, and escapes arguments — wrapping Bun's shell capabilities (`exec` is an alias for `execCmd(command: string, options?: ShellOptions)`).

- **Execution & Pipes:** `which` / `whichCmd(cmd: string): string | null`, `exec` / `execCmd(command: string, options?: ShellOptions): Promise<ShellExecResult>` (`ShellOptions`: `{ cwd?, env?, timeoutMs? }`; `ShellExecResult`: `{ stdout, stderr, exitCode, success }`), `execLines(command: string, options?: ShellOptions): Promise<string[]>`, `pipeCmds(cmd1: string, cmd2: string): Promise<ShellExecResult>`, `escapeArg(arg: string): string`

<a id="globutils"></a>
### `rad.globutils`

**Why it exists:** Cross-platform `\`-normalizing wrapper around `Bun.Glob` (with Bun's extglob `!(...)` and brace ranges `{1..10}`, `{a..z}`), returning sorted lexicographical paths — replacing `glob` and `minimatch`.

- **Pattern Matching:** `createGlob(pattern): Glob`, `globMatch(pattern, path): boolean`, `globFilter(pattern, paths): string[]`, `globMatchAny(patterns, path): boolean`, `globMatchAll(patterns, path): boolean`
- **Filesystem Scanning:** `glob` / `globScan(pattern, options?: GlobScanOptions): Promise<string[]>`, `globScanSync(pattern, options?: GlobScanOptions): string[]` (`GlobScanOptions`: `{ cwd?, onlyFiles?, dot?, followSymlinks?, absolute? }`), `findFiles(pattern, dir = "."): Promise<string[]>`, `hasMatch(pattern, dir = "."): Promise<boolean>`

<a id="transpileutils"></a>
### `rad.transpileutils`

**Why it exists:** Exposes `Bun.Transpiler` for in-memory TypeScript/TSX transpilation, static AST import/export scanning without executing code, type stripping, and quick snippet evaluation.

- **Functions:** `transpileTs(source: string, options?: TranspileOptions): string` (`TranspileOptions`: `{ loader?: "ts" | "tsx" | "js" | "jsx"; minify?: boolean }`), `scanImports(source, loader = "ts"): { path: string; kind: string }[]`, `analyzeCode(source, loader = "ts"): CodeAnalysis` (`{ exports, imports }`), `stripTypes(source): string`, `evalTs<T = any>(source: string): T`

<a id="logutils"></a>
### `rad.logutils`

**Why it exists:** Zero-config logger supporting colored console output, JSON-lines structured logging, prefix tags, minimum severity threshold filtering, and automatic ANSI-stripped file appending.

- **Exports:** `LogLevel` (`DEBUG = 0`, `INFO = 1`, `WARN = 2`, `ERROR = 3`), `Logger` (`new Logger(options?: LoggerOptions)`), `newLogger(options?: LoggerOptions): Logger` (`LoggerOptions`: `{ level?, prefix?, json?, logFile? }`)
- **`Logger` Methods:** `.debug(msg, meta?)`, `.info(msg, meta?)`, `.warn(msg, meta?)`, `.error(msg, meta?)`

<a id="cronutils"></a>
### `rad.cronutils`

**Why it exists:** Standard 5-field (`minute hour dayOfMonth month dayOfWeek`) cron parser, date matcher, next-run calculator (minute resolution up to 366 days ahead), and human-readable summary formatter — replacing `cron-parser` and `cronstrue`.

- **Functions:** `parseCron(expr: string): CronSchedule`, `matchesCron(cron: CronSchedule, date = new Date()): boolean`, `nextCronRun(cron: CronSchedule, fromDate = new Date()): Date`, `cronToHuman(expr: string): string`

<a id="semverutils"></a>
### `rad.semverutils`

**Why it exists:** Fast native `Bun.semver` range matching & comparison plus strict parsing and major/minor/patch version bumping — replacing `semver`.

- **Functions:** `parseSemver(version: string): SemVer` (`{ major, minor, patch, prerelease?, build? }`), `compareSemver(v1, v2): -1 | 0 | 1`, `satisfiesRange(version, range): boolean`, `bumpVersion(version, type: "major" | "minor" | "patch"): string`

### Domain 4 runnable recipe: Release pre-flight checker

```ts
import { rad } from "./src/features/rad/index.ts";

// 1. Setup structured logger and read env defaults
const log = rad.logutils.newLogger({
  prefix: "release",
  level: rad.logutils.LogLevel.INFO,
});
const parsedEnv = rad.envutils.parseEnvString(
  "APP_ENV=staging\nMAX_FILES=25\nDRY_RUN=true",
);
log.info("Loaded inline env", parsedEnv);

// 2. Scan repository TypeScript modules & inspect imports via Bun.Transpiler AST
const modFiles = await rad.globutils.globScan("src/features/rad/modules/*.ts");
const sampleCode = await rad.fileutils.readText(modFiles[0]!);
const ast = rad.transpileutils.analyzeCode(sampleCode, "ts");

// 3. Check SemVer compatibility & next scheduled nightly build window
const currentVer = "1.4.2";
const nextVer = rad.semverutils.bumpVersion(currentVer, "minor");
const schedule = rad.cronutils.parseCron("0 2 * * 1-5");

// 4. Safe subprocess call without invoking a shell
const bunVersion = await rad.sysutils.execSafe("bun", ["--version"]);

// 5. Render CLI metrics summary
console.log(
  rad.cliutils.renderBarChart([
    { label: "RAD modules", value: modFiles.length },
    { label: "Exports in first file", value: ast.exports.length },
  ]),
);
console.log({
  bunVersion: bunVersion.stdout.trim(),
  currentVer,
  nextVer,
  compatible: rad.semverutils.satisfiesRange(nextVer, "^1.0.0"),
  scheduleSummary: rad.cronutils.cronToHuman("0 2 * * 1-5"),
  nextRunIso: rad.cronutils.nextCronRun(schedule).toISOString(),
});
```

---

## 5. Networking, HTTP, server, URL, JWT, crypto, and hashing (7 modules)

<a id="netutils"></a>
### `rad.netutils`

**Why it exists:** Host IP discovery, outbound online reachability check, TCP port latency measurement (`tcpPing`), and native async `Bun.dns.lookup`.

- **Functions:** `getLocalIp(): string`, `getPublicIp(timeoutMs = 4000): Promise<string>` (queries `api.ipify.org`), `isOnline(timeoutMs = 3000): Promise<boolean>` (`HEAD` probe to `1.1.1.1`), `tcpPing(host: string, port: number, timeoutMs = 2000): Promise<{ reachable: boolean; durationMs: number }>`, `resolveHost(host: string): Promise<string[]>`

<a id="httputils"></a>
### `rad.httputils`

**Why it exists:** Ergonomic typed `fetch` wrappers (`getJson`, `postJson`, `putJson`, `deleteJson`, `getText`) that throw descriptive errors on non-2xx status codes, exponential backoff `fetchWithRetry` (retrying network errors, `429`, and `5xx`), and prototype-safe query string helpers.

- **Query Strings:** `buildQuery(params: Record<string, any>): string`, `parseQuery(queryString: string): Record<string, string>` (blocks `__proto__`/`constructor`/`prototype`)
- **HTTP Requests:** `fetchWithRetry(url, init?, maxRetries = 3, backoffMs = 200): Promise<Response>`, `getJson<T>(url, headers = {}): Promise<T>`, `postJson<T, R = any>(url, body: T, headers = {}): Promise<R>`, `putJson<T, R = any>(url, body: T, headers = {}): Promise<R>`, `deleteJson<R = any>(url, headers = {}): Promise<R>`, `getText(url, headers = {}): Promise<string>`

<a id="serverutils"></a>
### `rad.serverutils`

**Why it exists:** High-speed `Bun.serve` HTTP router (`/:param` extraction), realpath-contained static file server, and topic pub/sub WebSocket hub — bound to `"127.0.0.1"` by default with local-guard protection against DNS rebinding.

- **Router & HTTP:** `createRouter(): HttpRouter` (`.get`, `.post`, `.put`, `.delete`, `.handle`), `serveHttp(options?: ServeOptions): ServerInstance` (`ServeOptions`: `{ port?, hostname?, fetch?, router? }`; `ServerInstance`: `{ port, hostname, url, stop(closeActiveConnections = true), raw }`)
- **Static Files:** `serveStatic(options: StaticServerOptions): ServerInstance` (`{ dir, port?, hostname?, spaFallback? }`)
- **WebSockets:** `createWsHub(options?: WsHubOptions): WebSocketHub` (`{ port, url, broadcast(topic, data), stop(), raw }`; clients subscribe via `?topic=...`, defaulting to `"default"`)

<a id="urlutils"></a>
### `rad.urlutils`

**Why it exists:** Decomposes RFC 3986 URLs into clean segments and query maps, joins URLs without double slashes, and redacts embedded credentials before logging.

- **Functions:** `parseUrl(urlStr: string): ParsedUrl` (`{ href, protocol, host, hostname, port, pathname, search, hash, username, password?, hostWithPort, pathSegments, queryParams }`), `joinUrl(base: string, ...segments: string[]): string`, `redactCredentials(urlStr: string): string`

<a id="jwtutils"></a>
### `rad.jwtutils`

**Why it exists:** Dependency-free `HS256` JSON Web Token signing and constant-time (`timingSafeEqual`) signature + `exp` verification — replacing `jsonwebtoken` for symmetric HMAC tokens.

- **Functions:** `signJwt(payload: Record<string, any>, secret: string, expiresInSeconds = 3600): string`, `verifyJwt<T = Record<string, any>>(token: string, secret: string): T`, `decodeJwtUnverified<T = Record<string, any>>(token: string): T`

<a id="cryptoutils"></a>
### `rad.cryptoutils`

**Why it exists:** Native Bun cryptographic digests, HMAC signing, Base64/Base64URL helpers, random UUIDv4/time-ordered UUIDv7 (`Bun.randomUUIDv7`), hex tokens, and `Bun.password` Argon2id/bcrypt password hashing.

- **Digests & HMAC:** `sha256(data)`, `sha512(data)`, `md5(data)`, `hmacSha256(data, secret)`
- **Encoding:** `base64Encode(data)`, `base64Decode(str)`, `base64UrlEncode(data)`, `base64UrlDecode(str)`
- **IDs & Passwords:** `uuidV4()`, `uuidV7()`, `randomToken(length = 32)`, `hashPassword(password): Promise<string>`, `verifyPassword(password, hash): Promise<boolean>`

<a id="hashutils"></a>
### `rad.hashutils`

**Why it exists:** Exposes native `Bun.hash` non-cryptographic algorithms (`wyhash`, `rapidhash`, `cityHash64`, `crc32`, etc.) plus a double-hashed `BloomFilter` for ultra-fast cache keys, checksums, and deduplication.

- **Algorithms:** `wyhash(data, seed?)`, `rapidhash(data, seed?)`, `cityHash64(data, seed?)`, `cityHash32(data)`, `murmur64v2(data, seed?)`, `murmur32v3(data, seed?)`, `crc32(data)`, `adler32(data)`, `hashHex(data, algo: HashAlgorithm = "wyhash"): string`
- **Probabilistic Sets:** `createBloomFilter(expectedItems = 1000, falsePositiveRate = 0.01): BloomFilter` (`add`, `has`, `count`, `sizeBits`)

### Domain 5 runnable recipe: Authenticated HTTP API + WebSocket micro-server

```ts
import { rad } from "./src/features/rad/index.ts";

const jwtSecret = "placeholder-secret";
const limiter = new rad.flowutils.RateLimiter(20, 10); // 20 burst, 10 req/s
const items = new Map<string, { id: string; title: string; ownerEmail: string }>();

// 1. Start a topic-based WebSocket hub for real-time updates
const wsHub = rad.serverutils.createWsHub({ port: 0 });

// 2. Define REST routes with validation, JWT auth, rate limiting, and WS broadcast
const router = rad.serverutils.createRouter();

router.post("/login", async (req) => {
  const body = (await req.json()) as { email?: string; password?: string };
  if (!body.email || !rad.validutils.isEmail(body.email) || !body.password) {
    return Response.json({ error: "Invalid credentials" }, { status: 400 });
  }
  const pwHash = await rad.cryptoutils.hashPassword("example-password");
  const ok = await rad.cryptoutils.verifyPassword(body.password, pwHash);
  if (!ok) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const token = rad.jwtutils.signJwt({ sub: body.email }, jwtSecret, 900);
  return Response.json({ token });
});

router.post("/items", async (req) => {
  if (!limiter.allow(1)) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  let claims: { sub: string };
  try {
    claims = rad.jwtutils.verifyJwt<{ sub: string }>(auth, jwtSecret);
  } catch {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = (await req.json()) as { title?: string };
  const id = rad.cryptoutils.uuidV7();
  const item = { id, title: body.title ?? "Untitled", ownerEmail: claims.sub };
  items.set(id, item);
  wsHub.broadcast("items", { type: "created", item });
  return Response.json(item, { status: 201 });
});

router.get("/items/:id", (_req, params) => {
  const found = items.get(params.id!);
  return found
    ? Response.json(found)
    : Response.json({ error: "Not found" }, { status: 404 });
});

// 3. Boot HTTP server on an ephemeral local port, test end-to-end, and stop cleanly
const api = rad.serverutils.serveHttp({ port: 0, router });
try {
  const loginRes = await rad.httputils.postJson<
    { email: string; password: string },
    { token: string }
  >(rad.urlutils.joinUrl(api.url, "login"), {
    email: "alice@example.com",
    password: "example-password",
  });

  const created = await rad.httputils.postJson<
    { title: string },
    { id: string; title: string }
  >(
    rad.urlutils.joinUrl(api.url, "items"),
    { title: "Deploy micro-server" },
    { Authorization: `Bearer ${loginRes.token}` },
  );

  const fetched = await rad.httputils.getJson<{ id: string; title: string }>(
    rad.urlutils.joinUrl(api.url, "items", created.id),
  );
  console.log({ apiUrl: api.url, wsUrl: wsHub.url, fetched });
} finally {
  api.stop();
  wsHub.stop();
}
```

---

## 6. Async, flow control, functional utilities, events, validation, mocks, and time (7 modules)

<a id="asyncutils"></a>
### `rad.asyncutils`

**Why it exists:** Bounded async concurrency (`parallelMap`, `WorkerPool`), Go-style `WaitGroup`, and promise deadlines — replacing `p-limit` and `async`.

- **Functions & Classes:** `parallelMap<T, R>(items, concurrency, fn: (item, index) => Promise<R>): Promise<R[]>` (preserves order), `parallelFilter<T>(items, concurrency, predicate): Promise<T[]>`, `parallelEach<T>(items, concurrency, fn): Promise<void>`, `createWaitGroup(): WaitGroup` (`add`, `done`, `wait`), `timeoutPromise<T>(promise, ms, errorMsg?): Promise<T>`, `WorkerPool` (`new WorkerPool(concurrency)` -> `submit(task)`, `waitAll()`)

<a id="flowutils"></a>
### `rad.flowutils`

**Why it exists:** Production resilience building blocks: token-bucket `RateLimiter`, 3-state `CircuitBreaker` (`CLOSED` -> `OPEN` -> `HALF_OPEN`), jittered exponential backoff `retry`, and cancellable `debounce`/`throttle` — replacing `opossum` and `async-retry`.

- **`RateLimiter` (`new RateLimiter(capacity, refillRatePerSec)`):** `allow(count = 1): boolean`, `wait(count = 1): Promise<void>`
- **`CircuitBreaker` (`new CircuitBreaker(failureThreshold = 5, resetTimeoutMs = 10_000)`):** `getState(): CircuitState`, `canExecute(): boolean`, `recordSuccess(): void`, `recordFailure(): void`, `execute<T>(fn: () => Promise<T>): Promise<T>`
- **Functions:** `retry<T>(fn, maxAttempts = 3, delayMs = 100, multiplier = 2.0, maxDelayMs = 5000): Promise<T>`, `debounce(fn, waitMs)` (with `.cancel()`), `throttle(fn, intervalMs)` (with `.cancel()`)

<a id="fnutils"></a>
### `rad.fnutils`

**Why it exists:** Lightweight functional combinators, memoization, call-count guards, and left-to-right `pipe` composition.

- **Combinators & Guards:** `once(fn)`, `memoize(fn, keyResolver?)` (exposes `.cache` `Map`), `negate(predicate)`, `partial(fn, ...presetArgs)`, `before(n, fn)`, `after(n, fn)`, `debounce(fn, waitMs)`, `throttle(fn, waitMs)`
- **Utilities:** `identity(val)`, `noop()`, `times(n, iteratee)`, `delay(ms): Promise<void>`, `pipe(initialValue, ...fns)`

<a id="eventutils"></a>
### `rad.eventutils`

**Why it exists:** Browser- and Bun-friendly zero-dependency pub/sub `EventEmitter`.

- **Exports:** `EventEmitter` (`on`, `once`, `off`, `emit`, `listenerCount`, `removeAllListeners`), `newEmitter(): EventEmitter`

<a id="validutils"></a>
### `rad.validutils`

**Why it exists:** Fast, zero-dependency input validation predicates for forms, API boundaries, and configs.

- **Predicates:** `isEmail(str)`, `isUrl(str)` (`http:`, `https:`, `ftp:`), `isIpv4(str)` (dotted quad `0..255`, no leading zeroes), `isIpv6(str)`, `isPhone(str)`, `isAlphanumeric(str)`, `inRange(val, min, max)`, `isUuid(str)` (v1–v8, nil, max), `isJson(str)`

<a id="mockutils"></a>
### `rad.mockutils`

**Why it exists:** Instant synthetic user fixtures, contact details, endpoints, and Lorem Ipsum text for tests and demos without installing `faker`.

- **Generators:** `mockUser(): MockUser` (`{ id, name, email, role, phone, avatar }`), `mockUsers(count): MockUser[]`, `mockEmail(name?)`, `mockPhone()`, `mockIpv4()`, `mockUrl()`, `loremWords(count)`, `loremText(paragraphs = 1, minSentences = 3, maxSentences = 6)`

<a id="timeutils"></a>
### `rad.timeutils`

**Why it exists:** Relative formatting (`timeAgo`), calendar boundaries, day math, high-resolution stopwatch, and monotonic `Bun.nanoseconds()` timing.

- **Dates & Formatting:** `timeAgo(input, now = new Date())`, `formatIso(date = new Date())`, `parseIso(isoStr): Date`, `startOfDay`, `endOfDay`, `startOfMonth`, `endOfMonth`, `addDays(date, days)`, `diffDays(d1, d2)`
- **Benchmarking:** `createStopwatch(): Stopwatch` (`start`, `stop`, `elapsedMs`, `reset`), `nanoseconds(): number` (`Bun.nanoseconds()`)

### Domain 6 runnable recipe: Bounded parallel jobs with retries, timeouts, and circuit breaker

```ts
import { rad } from "./src/features/rad/index.ts";

const bus = rad.eventutils.newEmitter();
bus.on("job:done", (id: string, ms: number) => {
  console.log(`Completed ${id} in ${ms.toFixed(1)}ms`);
});

const breaker = new rad.flowutils.CircuitBreaker(3, 5_000);
const jobs = rad.mockutils.mockUsers(8);
const sw = rad.timeutils.createStopwatch();

let simulatedTransientCalls = 0;

// Process at most 3 jobs in parallel; each attempt has a timeout + backoff retry + circuit breaker
const processed = await rad.asyncutils.parallelMap(jobs, 3, async (user) => {
  if (!rad.validutils.isEmail(user.email)) {
    throw new Error(`Invalid synthetic email: ${user.email}`);
  }

  return await breaker.execute(() =>
    rad.flowutils.retry(
      () =>
        rad.asyncutils.timeoutPromise(
          (async () => {
            simulatedTransientCalls++;
            if (simulatedTransientCalls === 1) {
              throw new Error("Transient upstream hiccup");
            }
            const jobSw = rad.timeutils.createStopwatch();
            await rad.fnutils.delay(15);
            bus.emit("job:done", user.id, jobSw.stop());
            return { id: user.id, role: user.role };
          })(),
          1_000,
        ),
      3,
      20,
    ),
  );
});

console.log({
  processedCount: processed.length,
  breakerState: breaker.getState(),
  totalElapsedMs: sw.stop().toFixed(1),
});
```

---

## 7. Programmatic API for the 10 system utilities

Every one of the 10 system tools in `bun-rad-studio` works **3 ways**:

1. **Interactive GUI Studio:** `bun run app:<tool>` (launches a desktop/terminal RAD studio panel)
2. **Standalone CLI:** `bun run cli:<tool> -- <flags>` (prints formatted terminal tables, diffs, JSON, etc.)
3. **Programmatic TypeScript API:** Import `run*Coordinator` (plus typed domain functions and Doers) from `src/features/<tool>/` directly in your own TypeScript code.

| Tool | GUI Studio script | CLI script | Primary Coordinator entrypoints |
| :--- | :--- | :--- | :--- |
| `fd` | `bun run app:fd` | `bun run cli:fd` | `searchFiles`, `runFdCoordinator` ([`fdCoordinator.ts`](../../src/features/fd/fdCoordinator.ts)) |
| `sd` | `bun run app:sd` | `bun run cli:sd` | `processFile`, `runSdCoordinator` ([`sdCoordinator.ts`](../../src/features/sd/sdCoordinator.ts)) |
| `rip` | `bun run app:rip` | `bun run cli:rip` | `buryTarget`, `unburyTarget`, `seanceGraveyard`, `runRipCoordinator` ([`ripCoordinator.ts`](../../src/features/rip/ripCoordinator.ts)) |
| `procs` | `bun run app:procs` | `bun run cli:procs` | `getProcesses`, `runProcsCoordinator` ([`procsCoordinator.ts`](../../src/features/procs/procsCoordinator.ts)) |
| `watchexec` | `bun run app:watchexec` | `bun run cli:watchexec` | `runWatchexecCoordinator`, `startWatcher` ([`watchexecCoordinator.ts`](../../src/features/watchexec/watchexecCoordinator.ts)) |
| `tokei` | `bun run app:tokei` | `bun run cli:tokei` | `computeCodeStats`, `computeCodeStatsSync`, `runTokeiCoordinator` ([`tokeiCoordinator.ts`](../../src/features/tokei/tokeiCoordinator.ts)) |
| `gdu` | `bun run app:gdu` | `bun run cli:gdu` | `analyzeDirectory`, `analyzeDirectorySync`, `runGduCoordinator` ([`gduCoordinator.ts`](../../src/features/gdu/gduCoordinator.ts)) |
| `ipinfo` | `bun run app:ipinfo` | `bun run cli:ipinfo` | `queryIp`, `runIpInfoCoordinator` ([`ipinfoCoordinator.ts`](../../src/features/ipinfo/ipinfoCoordinator.ts)) |
| `subfinder` | `bun run app:subfinder` | `bun run cli:subfinder` | `enumerateDomain`, `enumerateDomainSync`, `runSubfinderCoordinator` ([`subfinderCoordinator.ts`](../../src/features/subfinder/subfinderCoordinator.ts)) |
| `doggo` | `bun run app:doggo` | `bun run cli:doggo` | `lookupDomain`, `runDoggoCoordinator` ([`doggoCoordinator.ts`](../../src/features/doggo/doggoCoordinator.ts)) |

### `fd` — Fast file finder

- **Ways to run:** `bun run app:fd` | `bun run cli:fd` | `./src/features/fd/fdCoordinator.ts`
- **Functions:**
  - `searchFiles(options: FdOptions): Promise<FdEntry[]>`
  - `runFdCoordinator(options: FdOptions): Promise<string[]>`
- **`FdOptions` fields:**
  - Required: `rootPath: string`, `hidden: boolean`, `absolute: boolean`
  - Optional: `pattern?: string`, `typeFilter?: "f" | "d" | "l" | "x"`, `extension?: string`, `maxDepth?: number`, `minDepth?: number`, `caseSensitive?: boolean`, `execCmd?: string[]` (replaces `"{}"` with matched path), `exclude?: string[]`, `sizeFilter?: string` (`"+10M"`, `"-1k"`, `"500"`), `changedWithin?: string` (`"10m"`, `"2h"`, `"7d"`), `empty?: boolean`
- **Return (`FdEntry`):** `{ path, displayPath, name, isDirectory, isFile, isSymlink, isExecutable, depth, size?, mtime? }`

```ts
import { searchFiles } from "./src/features/fd/fdCoordinator.ts";

const recentTsFiles = await searchFiles({
  rootPath: "src/features/rad/modules",
  hidden: false,
  absolute: false,
  typeFilter: "f",
  extension: "ts",
  exclude: ["node_modules", ".git"],
  maxDepth: 2,
});
console.log(recentTsFiles.slice(0, 5).map((e) => `${e.displayPath} (${e.size ?? 0} B)`));
```

### `sd` — Search and replace

- **Ways to run:** `bun run app:sd` | `bun run cli:sd` | `./src/features/sd/sdCoordinator.ts` & `./src/features/sd/sdDoers.ts`
- **Functions:**
  - `processFile(filePath: string, regex: RegExp, replacement: string, literalReplacement = false): Promise<FileTransformResult>` (reads & diffs **without** writing to disk; skips binary files containing `0x00` bytes)
  - `runSdCoordinator(options: SdOptions): Promise<string[]>`
  - Doers: `buildReplacerRegex(find, stringMode, flags = "", ignoreCase?, wholeWord?): RegExp`, `formatDiffPreview(filePath, hunks)`
- **`SdOptions` fields:**
  - Required: `findPattern: string`, `replacePattern: string`, `files: string[]` (`["-"]` or `[]` reads stdin), `stringMode: boolean`, `flags: string`, `preview: boolean`
  - Optional: `countOnly?: boolean`, `ignoreCase?: boolean`, `backupExt?: string`, `wholeWord?: boolean`, `quiet?: boolean`
- **Return (`FileTransformResult`):** `{ filePath, hasChanged, originalContent, newContent, diffHunks: DiffHunk[] }` where `DiffHunk` is `{ lineNumber, original, modified }`

> **Warning – Verify file targets before writing:** `runSdCoordinator` with `preview: false` overwrites every changed file in `options.files` in place. Always test first with `preview: true` or non-destructive `processFile(...)`, and consider setting `backupExt: ".bak"` on real source trees.

```ts
import { join } from "node:path";
import { rad } from "./src/features/rad/index.ts";
import { processFile, runSdCoordinator } from "./src/features/sd/sdCoordinator.ts";
import { buildReplacerRegex } from "./src/features/sd/sdDoers.ts";

await rad.fileutils.withTempDir(async (dir) => {
  const sampleFile = join(dir, "sample.txt");
  await rad.fileutils.writeText(sampleFile, "const port = 3000;\n");

  // 1. Non-destructive preview using processFile
  const regex = buildReplacerRegex("3000", true);
  const dry = await processFile(sampleFile, regex, "8080", true);
  console.log("Dry diff hunks:", dry.diffHunks);

  // 2. Apply in-place inside temp dir with .bak backup
  const log = await runSdCoordinator({
    findPattern: "3000",
    replacePattern: "8080",
    files: [sampleFile],
    stringMode: true,
    flags: "g",
    preview: false,
    backupExt: ".bak",
  });
  console.log(log);
}, "sd-demo-");
```

### `rip` — Safe file deletion (graveyard)

- **Ways to run:** `bun run app:rip` | `bun run cli:rip` | `./src/features/rip/ripCoordinator.ts` & `./src/features/rip/ripDoers.ts`
- **Functions:**
  - `buryTarget(target: string, graveyardDir: string): Promise<GraveyardRecord>`
  - `unburyTarget(graveyardDir: string, targetQuery?: string, force = false): Promise<GraveyardRecord>`
  - `getRecordInfo(graveyardDir: string, query: string): Promise<GraveyardRecord>`
  - `seanceGraveyard(graveyardDir: string): Promise<string[]>`
  - `pruneGraveyard(graveyardDir: string, days: number): Promise<number>`
  - `decomposeGraveyard(graveyardDir: string): Promise<number>`
  - `runRipCoordinator(options: RipOptions): Promise<string[]>`
  - `resolveGraveyardDir(customDir?: string): string` (honors `customDir`, then `process.env.GRAVEYARD`, then `~/.local/share/rip/graveyard`)
- **`RipOptions` fields:**
  - Required: `targets: string[]`, `unbury: boolean`, `seance: boolean`, `decompose: boolean`, `permanent: boolean`, `verbose: boolean`
  - Optional: `unburyTarget?: string`, `graveyardDir?: string`, `infoTarget?: string`, `pruneDays?: number`, `dryRun?: boolean`, `showSize?: boolean`, `force?: boolean`
- **Return (`GraveyardRecord`):** `{ id, originalPath, graveyardPath, deletedAt, isDirectory, size }`

> **Warning – Verify targets and options carefully:** `buryTarget` and `runRipCoordinator` move real files or directories out of their original paths into the graveyard, while `permanent: true` or `decompose: true` permanently deletes files from disk without undo. Built-in safety checks block `/`, `$HOME`, and graveyard ancestors, so verify paths first and preview with `dryRun: true` or isolated temp folders.

```ts
import { join } from "node:path";
import { rad } from "./src/features/rad/index.ts";
import { buryTarget, runRipCoordinator, unburyTarget } from "./src/features/rip/ripCoordinator.ts";

await rad.fileutils.withTempDir(async (dir) => {
  const graveyard = join(dir, ".graveyard");
  const scratchFile = join(dir, "scratch.txt");
  await rad.fileutils.writeText(scratchFile, "recoverable note");

  // Dry-run check first
  console.log(
    await runRipCoordinator({
      targets: [scratchFile],
      unbury: false,
      seance: false,
      decompose: false,
      permanent: false,
      verbose: false,
      dryRun: true,
      graveyardDir: graveyard,
    }),
  );

  const buried = await buryTarget(scratchFile, graveyard);
  const restored = await unburyTarget(graveyard, buried.id);
  console.log("Restored:", restored.originalPath);
}, "rip-demo-");
```

### `procs` — Modern process viewer

- **Ways to run:** `bun run app:procs` | `bun run cli:procs` | `./src/features/procs/procsCoordinator.ts`
- **Functions:**
  - `getProcesses(keyword?: string, sortBy?: "cpu" | "mem" | "pid" | "user", limit?: number, user?: string): Promise<ProcessInfo[]>`
  - `runProcsCoordinator(options: ProcsOptions): Promise<string>`
- **`ProcsOptions` fields:**
  - Required: `tree: boolean`, `watch: boolean`
  - Optional: `keyword?: string`, `user?: string`, `sortBy?: "cpu" | "mem" | "pid" | "user"`, `limit?: number`, `json?: boolean`, `ports?: boolean`, `killPid?: number`, `signal?: string` (defaults `"SIGTERM"`), `interactive?: boolean`
- **Return (`ProcessInfo`):** `{ pid, ppid, user, cpu, mem, stat, time, command, ports?: string[] }`

```ts
import { getProcesses, runProcsCoordinator } from "./src/features/procs/procsCoordinator.ts";

const topProcs = await getProcesses(undefined, "cpu", 5);
console.log(topProcs.map((p) => `${p.pid} ${p.user} ${p.cpu}% ${p.command}`));

const treeOutput = await runProcsCoordinator({
  keyword: "bun",
  tree: true,
  watch: false,
  ports: true,
});
console.log(treeOutput);
```

### `watchexec` — File-watching command runner

- **Ways to run:** `bun run app:watchexec` | `bun run cli:watchexec` | `./src/features/watchexec/watchexecCoordinator.ts`
- **Functions:**
  - `runWatchexecCoordinator(options: WatchexecOptions): Promise<{ close: () => void }>` (registers `exit`/`SIGINT`/`SIGTERM` cleanup)
  - `createExecutionHandler(options: WatchexecOptions, state: ProcessState): (triggeredPath?: string) => void`
  - `startWatcher(options: WatchexecOptions, state: ProcessState, onTrigger): { close: () => void }`
- **`WatchexecOptions` fields:**
  - Required: `watchPaths: string[]`, `command: string[]`, `ignorePatterns: string[]`, `debounceMs: number`, `clear: boolean`, `restart: boolean`, `runOnStart: boolean`
  - Optional: `extensions?: string[]`, `filterPatterns?: string[]`, `shell?: string`
- **Return:** `{ close: () => void }`; spawned commands receive `WATCHEXEC_WRITTEN_PATH`, `WATCHEXEC_TRIGGERED_PATH`, and `WATCHEXEC_COMMON_PATH` in `env`.

```ts
import { runWatchexecCoordinator } from "./src/features/watchexec/watchexecCoordinator.ts";

const watcher = await runWatchexecCoordinator({
  watchPaths: ["src"],
  command: ["bun", "--version"],
  extensions: ["ts"],
  ignorePatterns: ["node_modules", ".git"],
  debounceMs: 250,
  clear: false,
  restart: true,
  runOnStart: true,
});

// Always close the watcher handle when tearing down programmatic runs
setTimeout(() => watcher.close(), 1000);
```

### `tokei` — Code line counter

- **Ways to run:** `bun run app:tokei` | `bun run cli:tokei` | `./src/features/tokei/tokeiCoordinator.ts`
- **Functions:**
  - `computeCodeStats(options: TokeiOptions): Promise<LanguageReport[]>`
  - `computeCodeStatsSync(options: TokeiOptions): LanguageReport[]`
  - `runTokeiCoordinator(options: TokeiOptions): Promise<string>`
- **`TokeiOptions` fields:**
  - Required: `paths: string[]`, `sort: "files" | "lines" | "blank" | "comment" | "code"`, `showFiles: boolean`, `hidden: boolean`
  - Optional: `json?: boolean`, `markdown?: boolean`, `excludes?: string[]` (merged with `node_modules`, `.git`, `.graveyard`, `dist`, `build`)
- **Return (`LanguageReport`):** `{ language, files, stats: { lines, blank, comment, code }, fileDetails: FileStat[] }`

```ts
import { computeCodeStats } from "./src/features/tokei/tokeiCoordinator.ts";

const reports = await computeCodeStats({
  paths: ["src/features/rad"],
  sort: "code",
  showFiles: false,
  hidden: false,
});
for (const r of reports) {
  console.log(`${r.language}: ${r.files} files, ${r.stats.code} LOC`);
}
```

### `gdu` — Disk usage analyzer

- **Ways to run:** `bun run app:gdu` | `bun run cli:gdu` | `./src/features/gdu/gduCoordinator.ts`
- **Functions:**
  - `analyzeDirectory(options: GduOptions): Promise<DiskUsageItem>`
  - `analyzeDirectorySync(options: GduOptions): DiskUsageItem`
  - `formatReport(root: DiskUsageItem, options: GduOptions): string[]`
  - `formatDisksTable(disks: MountedDisk[]): string`
  - `runGduCoordinator(options: GduOptions): Promise<string[]>`
- **`GduOptions` fields:**
  - Required: `targetDir: string`, `nonInteractive: boolean`, `showItemCount: boolean`, `showRelativeSize: boolean`, `showDisks: boolean`, `summarize: boolean`, `noHidden: boolean`, `si: boolean`, `ignoreDirs: string[]`
  - Optional: `top?: number`, `maxDepth?: number`, `sortBy?: "size" | "name" | "count" | "mtime"`, `minSize?: number | string`, `json?: boolean`, `noCross?: boolean`
- **Return (`DiskUsageItem`):** `{ name, path, size, itemCount, isDirectory, mtime, children?: DiskUsageItem[] }`

```ts
import { analyzeDirectory, formatReport } from "./src/features/gdu/gduCoordinator.ts";

const gduOpts = {
  targetDir: "src/features/rad",
  nonInteractive: true,
  showItemCount: true,
  showRelativeSize: true,
  showDisks: false,
  summarize: false,
  noHidden: true,
  si: true,
  ignoreDirs: ["node_modules", ".git"],
  top: 5,
  sortBy: "size" as const,
};
const tree = await analyzeDirectory(gduOpts);
console.log(formatReport(tree, gduOpts).join("\n"));
```

### `ipinfo` — IP intelligence, CIDR math, and local adapters

- **Ways to run:** `bun run app:ipinfo` | `bun run cli:ipinfo` | `./src/features/ipinfo/ipinfoCoordinator.ts` & `./src/features/ipinfo/ipinfoDoers.ts`
- **Functions:**
  - `queryIp(target?: string, token?: string): Promise<IpInfoResult>`
  - `runIpInfoCoordinator(options: IpInfoOptions): Promise<string>`
  - Doers: `isIpAddress(input)`, `isCidr(input)`, `cleanTarget(input)`, `classifyIp(ip)`
- **`IpInfoOptions` fields:**
  - Required: `json: boolean`, `csv: boolean`, `noColor: boolean`
  - Optional: `targetIp?: string` (IP, hostname, or CIDR like `"192.168.1.0/24"`), `token?: string` (falls back to `process.env.IPINFO_TOKEN`), `field?: string`, `bulkFile?: string`, `local?: boolean`
- **Returns:**
  - `IpInfoResult`: `{ ip, hostname?, city?, region?, country?, loc?, org?, postal?, timezone?, mapUrl?, readme? }`
  - `SubnetInfo` (for CIDR): `{ cidr, network, broadcast, netmask, wildcard, firstHost, lastHost, totalHosts, usableHosts }`
  - `LocalInterfaceInfo` (when `local: true`): `{ name, address, family, netmask, mac, internal }`

```ts
import { runIpInfoCoordinator } from "./src/features/ipinfo/ipinfoCoordinator.ts";

// Offline CIDR subnet math (works without internet access)
const subnetJson = await runIpInfoCoordinator({
  targetIp: "10.0.0.0/24",
  json: true,
  csv: false,
  noColor: true,
});
console.log(JSON.parse(subnetJson));
```

### `subfinder` — Subdomain discovery

- **Ways to run:** `bun run app:subfinder` | `bun run cli:subfinder` | `./src/features/subfinder/subfinderCoordinator.ts`
- **Functions:**
  - `enumerateDomain(domain, timeoutMs, active, probe = false, ports?, detectWildcard = false, onProgress?, onBatch?): Promise<SubdomainResult[]>`
  - `enumerateDomainSync(domain, active = false, probe = false, ports?, detectWildcard = false, onProgress?): SubdomainResult[]`
  - `formatSubdomainResult(res: SubdomainResult, options: SubfinderOptions): string`
  - `runSubfinderCoordinator(options: SubfinderOptions): Promise<string[]>`
- **`SubfinderOptions` fields:**
  - Required: `domains: string[]`, `active: boolean`, `probe: boolean`, `silent: boolean`, `json: boolean`, `timeoutMs: number`
  - Optional: `sources?: string[]`, `outputFile?: string`, `ports?: number[]`, `detectWildcard?: boolean`
- **Return (`SubdomainResult`):** `{ host, sources, ip?, httpStatus?, httpTitle?, openPorts?, isWildcard?, httpScheme?, note? }`

```ts
import { enumerateDomain } from "./src/features/subfinder/subfinderCoordinator.ts";

const subdomains = await enumerateDomain(
  "example.com",
  2000,
  true,   // active DNS resolution
  false,  // probe HTTP
  undefined,
  true,   // detectWildcard
);
console.log(subdomains.map((s) => `${s.host} -> ${s.ip?.join(", ") ?? "unresolved"}`));
```

### `doggo` — Modern DNS and DNS-over-HTTPS client

- **Ways to run:** `bun run app:doggo` | `bun run cli:doggo` | `./src/features/doggo/doggoCoordinator.ts`
- **Functions:**
  - `lookupDomain(domain: string, type: DoggoOptions["queryType"] = "A", nameserver?: string): Promise<DoggoResponse>`
  - `runDoggoCoordinator(options: DoggoOptions): Promise<string>`
- **`DoggoOptions` fields:**
  - Required: `domain: string`, `queryType: DnsRecordType | "ALL"` (`"A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SOA" | "PTR" | "CAA" | "SRV" | "ALL"`), `short: boolean`, `json: boolean`, `showTime: boolean`
  - Optional: `nameserver?: string`, `doh?: boolean`, `dohUrl?: string`, `all?: boolean`
- **Return (`DoggoResponse`):** `{ domain, queryType, answers: DnsAnswer[], queryTimeMs, server, protocol?: "UDP" | "DoH" }` where `DnsAnswer` is `{ name, type, class, ttl?, data }`

```ts
import { lookupDomain, runDoggoCoordinator } from "./src/features/doggo/doggoCoordinator.ts";

const res = await lookupDomain("example.com", "MX");
console.log(`${res.domain} (${res.queryTimeMs}ms via ${res.server}):`, res.answers);

const dohJson = await runDoggoCoordinator({
  domain: "example.com",
  queryType: "A",
  doh: true,
  short: false,
  json: true,
  showTime: true,
});
console.log(dohJson);
```

---

## 8. Pro tips, cross-platform gotchas, and FAQ

### Cross-platform Windows, macOS, and Linux gotchas

- **Glob patterns vs Windows backslashes:** `rad.globutils` automatically normalizes `\` to `/` before compiling `Bun.Glob`. Always pass `/` patterns like `"src/**/*.ts"` on all platforms.
- **Process-tree cleanup (`watchexec`):** `killProcessTree` automatically switches between `taskkill /pid <pid> /T /F` on Windows (`win32`) and `pgrep -P` + negative-PID process group signals on macOS/Linux. Avoid spawning nested shells unless you actually need `shell` features.
- **Local HTTP security (`serverutils`):** When `hostname` is `"127.0.0.1"`, `"localhost"`, or `"::1"` (the default for `serveHttp`, `serveStatic`, and `createWsHub`), incoming requests pass through `guardLocalRequest` to block DNS-rebinding `Host`/`Origin` spoofing, and `serveStatic` checks `realpathSync` containment so symlinks cannot escape `dir`. Pass `hostname: "0.0.0.0"` only when intentionally binding to the network.
- **Clipboard utilities (`sysutils`):** `copyToClipboard` and `readFromClipboard` wrap platform clipboard binaries (`pbcopy`/`pbpaste` on macOS, X11/Wayland helpers on Linux, Windows clipboard tools). Check the boolean returned by `copyToClipboard` when running inside headless containers/CI where no display server exists.
- **ZIP and compression caps (`archiveutils`, `compressutils`, `tarutils`):** `archiveutils` implements standard non-Zip64, unencrypted ZIP (`<= 65,535` entries, `< 4 GiB`) with default limits of `256 MiB` per entry (`MAX_ZIP_ENTRY_BYTES`) and `512 MiB` total (`MAX_ZIP_TOTAL_BYTES`). `compressutils` and `tarutils` cap decompression at `256 MiB` by default (`maxOutputLength` parameter) to defend against zip/gzip bombs.
- **Graveyard location (`rip`):** `resolveGraveyardDir()` uses your `graveyardDir` option, else `$GRAVEYARD`, else `~/.local/share/rip/graveyard`.

### Frequently asked questions

**Do I need to `npm install` extra packages to use these 45 modules?**
No. All 45 `rad` modules and all 10 system tools run purely on Bun built-ins and standard Node-compatible built-in APIs (`node:fs`, `node:path`, `node:crypto`, `node:net`, `bun:sqlite`).

**Why should I prefer `rad.<module>.<fn>` over flat imports?**
Several utility names collide across domains or with `SimpleGUI`/`SimpleCLI` at the package root (`writeFileAtomic`, `LRUCache`, `Logger`, `getInt`, `getBool`, `set`, `sumBy`, `inRange`, `debounce`, `throttle`, `stripAnsi`). Using `rad.fileutils.writeFileAtomic`, `rad.tomlutils.getInt`, `rad.objutils.set`, etc. is always unambiguous.

**What happens if I call `statutils` functions on empty arrays `[]`?**
`statutils` guards empty arrays cleanly (`mean([]) === 0`, `stdDev([]) === 0`, `median([]) === 0`, `detectOutliers([])` returns `[]`), preventing accidental `NaN` propagation in dashboards.

**Does `sd` corrupt images, `.wasm`, or `.sqlite` files when scanning a folder?**
No. Both `processFile` and `runSdCoordinator` scan files for NUL (`0x00`) bytes via `isBinaryBuffer` and skip binary files automatically, and `expandTargets` ignores `.git`, `node_modules`, `.graveyard`, `dist`, `build`, and dot-entries.

**Where can I see the full module handbook or system utility recipes?**
- [`src/features/rad/README.md`](../../src/features/rad/README.md)
- [`docs/SYSTEM_UTILITIES_API.md`](../SYSTEM_UTILITIES_API.md)
