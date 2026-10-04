# ⚡ Bun RAD Development Utilities (`rad`)

A comprehensive, production-grade suite of **45 ergonomic utility modules** (44 core modules + `sliceutils` alias) engineered for **Rapid Application Development (RAD)** in [Bun](https://bun.com). Ported and extended from [`codecaine-zz/vlang_utils`](https://github.com/codecaine-zz/vlang_utils) and modern utility primitives inspired by [`toss/es-toolkit`](https://github.com/toss/es-toolkit), supercharged with native Bun standard library superpowers (`Bun.Glob`, `Bun.$`, `Bun.serve`, `Bun.hash`, `Bun.Transpiler`, `Bun.TOML`, and `bun:sqlite` FTS5).

Never write boilerplate from scratch again.

---

## 📑 Table of Contents

- [🌟 Architectural Highlights](#-architectural-highlights)
- [📦 Quick Import & Consumption](#-quick-import--consumption)
- [📋 Complete 45-Module Directory by Domain](#-complete-45-module-directory-by-domain)
  - [1. File & Storage (8 Modules)](#1-file--storage-8-modules)
  - [2. Data Structures & Collections (8 Modules)](#2-data-structures--collections-8-modules)
  - [3. Strings, Text & Markup (6 Modules)](#3-strings-text--markup-6-modules)
  - [4. System, CLI & Shell Runtime (9 Modules)](#4-system-cli--shell-runtime-9-modules)
  - [5. Network, Web & Cryptography (7 Modules)](#5-network-web--cryptography-7-modules)
  - [6. Concurrency, Flow Control & Logic (7 Modules)](#6-concurrency-flow-control--logic-7-modules)
- [🛠️ Exhaustive Module-by-Module API Reference](#-exhaustive-module-by-module-api-reference)
  - [fileutils](#1-fileutils)
  - [sqliteutils](#2-sqliteutils)
  - [tomlutils](#3-tomlutils)
  - [archiveutils](#4-archiveutils)
  - [compressutils](#5-compressutils)
  - [tarutils](#6-tarutils)
  - [stateutils](#7-stateutils)
  - [cacheutils](#8-cacheutils)
  - [arrutils & sliceutils](#9-arrutils--sliceutils)
  - [objutils](#10-objutils)
  - [structutils](#11-structutils)
  - [statutils](#12-statutils)
  - [mathutils](#13-mathutils)
  - [bitutils](#14-bitutils)
  - [graphutils](#15-graphutils)
  - [strutils](#16-strutils)
  - [regexutils](#17-regexutils)
  - [templateutils](#18-templateutils)
  - [colorutils](#19-colorutils)
  - [htmlutils](#20-htmlutils)
  - [diffutils](#21-diffutils)
  - [sysutils](#22-sysutils)
  - [cliutils](#23-cliutils)
  - [envutils](#24-envutils)
  - [shellutils](#25-shellutils)
  - [globutils](#26-globutils)
  - [transpileutils](#27-transpileutils)
  - [logutils](#28-logutils)
  - [cronutils](#29-cronutils)
  - [semverutils](#30-semverutils)
  - [netutils](#31-netutils)
  - [httputils](#32-httputils)
  - [serverutils](#33-serverutils)
  - [urlutils](#34-urlutils)
  - [jwtutils](#35-jwtutils)
  - [cryptoutils](#36-cryptoutils)
  - [hashutils](#37-hashutils)
  - [asyncutils](#38-asyncutils)
  - [flowutils](#39-flowutils)
  - [fnutils](#40-fnutils)
  - [eventutils](#41-eventutils)
  - [validutils](#42-validutils)
  - [mockutils](#43-mockutils)
  - [timeutils](#44-timeutils)
- [⚡ Quick Start Interactive Tooling & CLI](#-quick-start-interactive-tooling--cli)

---

## 🌟 Architectural Highlights

1. **Zero-Overhead Native Bun Superpowers**:
   - `globutils`: Direct binding to `Bun.Glob` for ultrafast filesystem pattern scanning.
   - `shellutils`: Direct binding to `Bun.$` and `Bun.which` for safe, cross-platform subprocess orchestration.
   - `serverutils`: Instant micro-routing and static file serving backed by `Bun.serve`.
   - `hashutils`: Nanosecond non-cryptographic hashing (`wyhash`, `rapidhash`, `cityHash`, `crc32`) via `Bun.hash`.
   - `transpileutils`: In-memory TSX/TS compilation and import/export AST analysis via `Bun.Transpiler`.
   - `tomlutils`: Native `Bun.TOML` parser paired with high-performance serializers and typed key-path accessors.
   - `sqliteutils`: High-throughput `bun:sqlite` engine featuring WAL mode, JSON document storage, and FTS5 full-text search.
2. **`es-toolkit` & Modern Ergonomics**:
   - Negative index access (`arrutils.at`), array partitioning, chunking, and grouping.
   - Deep property access (`objutils.get`, `set`, `unset`), structural equality (`isEqual`), and deep cloning.
   - Functional composition pipelines (`fnutils.pipe`), memoization, and decorators.
3. **Rock-Solid Portability**:
   - Every module works seamlessly across macOS, Linux, and Windows.
   - 100% typed with TypeScript 5 strict mode and covered by an end-to-end test suite (`bun test src/features/rad/rad.test.ts`).

---

## 📦 Quick Import & Consumption

Import the complete unified `rad` namespace or individual modules directly:

```typescript
// Option 1: Import everything via the unified `rad` object
import { rad } from "./src/features/rad/index.ts";

rad.strutils.slugify("Hello World");
rad.arrutils.chunk([1, 2, 3, 4], 2);

// Option 2: Selective named module imports
import {
  fileutils,
  sqliteutils,
  arrutils,
  objutils,
  fnutils,
  globutils,
  shellutils,
  hashutils,
} from "./src/features/rad/index.ts";

// Option 3: Import from top-level entry
import { rad } from "./index.ts";
```

---

## 📋 Complete 45-Module Directory by Domain

### 1. File & Storage (8 Modules)
| Module | Description | Engine / Superpower |
| :--- | :--- | :--- |
| **[`fileutils`](#1-fileutils)** | Asynchronous JSON, CSV, atomic line operations, directory walking, human byte sizes. | `node:fs/promises` & `Bun.file` |
| **[`sqliteutils`](#2-sqliteutils)** | Embedded database: KV store, JSON document store, CRUD builder, migrations, FTS5 search. | `bun:sqlite` |
| **[`tomlutils`](#3-tomlutils)** | High-speed TOML parsing and serialization with typed key-path extractors. | **`Bun.TOML`** |
| **[`archiveutils`](#4-archiveutils)** | Zero-dependency ZIP archive creation, directory compression, in-memory inspection. | Deflate / Buffer streams |
| **[`compressutils`](#5-compressutils)** | Fast Gzip & Deflate compression/decompression for strings and buffers, ratio calculation. | Native `CompressionStream` |
| **[`tarutils`](#6-tarutils)** | POSIX UStar TAR archive creation, unpacking, directory archiving, tarball inspection. | Binary Blocks |
| **[`stateutils`](#7-stateutils)** | Reactive, atomic persistent application state (`AppStateStore`, `KeyValueState`) with rollback. | Cross-platform JSON |
| **[`cacheutils`](#8-cacheutils)** | In-memory caching: O(1) `LRUCache` with eviction and `TTLCache` with auto-expiration. | Map / High-res Timers |

### 2. Data Structures & Collections (8 Modules)
| Module | Description | Engine / Superpower |
| :--- | :--- | :--- |
| **[`arrutils`](#9-arrutils--sliceutils)** | Collection helpers: `at` (negative index), `compact`, `chunk`, `partition`, `keyBy`, `countBy`. | `es-toolkit` inspired |
| **[`sliceutils`](#9-arrutils--sliceutils)** | Ergonomic array slice and collection manipulation (alias of `arrutils`). | `es-toolkit` inspired |
| **[`objutils`](#10-objutils)** | Deep path access (`get`/`set`/`unset`), `deepMerge`, `deepClone`, `isEqual`, `pick`, `omit`. | `es-toolkit` inspired |
| **[`structutils`](#11-structutils)** | Generic data structures: `SimpleStack`, `SimpleQueue`, `SimpleRingBuffer`, `SimpleMinHeap`. | Pure TS |
| **[`statutils`](#12-statutils)** | Descriptive statistics: mean, median, mode, variance, std dev, IQR, Pearson, linear regression. | Pure TS |
| **[`mathutils`](#13-mathutils)** | Spatial geometry & math: `lerp`, `remap`, `clamp`, `gcd`, `lcm`, 2D points, `Rect` intersections. | Math built-ins |
| **[`bitutils`](#14-bitutils)** | High-performance dynamic `BitSet`, popcount, bitmask flag management. | Bitwise Operations |
| **[`graphutils`](#15-graphutils)** | Directed graphs (`Graph`), Kahn's topological sort, cycle detection, BFS, DFS, shortest path. | Graph Theory |

### 3. Strings, Text & Markup (6 Modules)
| Module | Description | Engine / Superpower |
| :--- | :--- | :--- |
| **[`strutils`](#16-strutils)** | Case conversions (`snake`, `kebab`, `camel`, `pascal`, `title`), `slugify`, privacy masks. | Pure TS |
| **[`regexutils`](#17-regexutils)** | High-level pattern matching helpers: `isMatch`, `findFirst`, `findAll`, `replace`, named groups. | RegExp Engine |
| **[`templateutils`](#18-templateutils)** | Fast string templating (`{{key \| default}}`) and terminal ANSI markdown rendering. | Regex / ANSI |
| **[`colorutils`](#19-colorutils)** | Hex/RGB/HSL conversion, transforms (`lighten`, `darken`), WCAG contrast, Truecolor ANSI. | Color Math |
| **[`htmlutils`](#20-htmlutils)** | Entity escaping, DOM navigation (`getElementById`, `getElementsByTag`), link extraction. | Pure AST Regex |
| **[`diffutils`](#21-diffutils)** | Line-level text diffing (`diffLines`), unified diff generation (`unifiedDiff`), colored output. | Myers / Line Diff |

### 4. System, CLI & Shell Runtime (9 Modules)
| Module | Description | Engine / Superpower |
| :--- | :--- | :--- |
| **[`sysutils`](#22-sysutils)** | System telemetry (CPU, RAM, load), safe execution, system paths, OS clipboard read/write. | `node:os` & Native CLI |
| **[`cliutils`](#23-cliutils)** | ANSI styling, progress bar, Unicode sparkline, ASCII horizontal bar chart, gauge, tree view. | Terminal ANSI |
| **[`envutils`](#24-envutils)** | Type-safe environment variables (`getStr`, `getInt`, `getBool`), `.env` loading, `${VAR}` expansion. | `process.env` |
| **[`shellutils`](#25-shellutils)** | Subprocess execution, pipe chains, command quoting, binary PATH discovery (`which`). | **`Bun.$` & `Bun.which`** |
| **[`globutils`](#26-globutils)** | Ultrafast filesystem glob scanning and pattern matching. | **`Bun.Glob`** |
| **[`transpileutils`](#27-transpileutils)** | In-memory TypeScript/TSX transpilation, AST import/export scanning, in-memory execution. | **`Bun.Transpiler`** |
| **[`logutils`](#28-logutils)** | Leveled structured logger (`DEBUG`, `INFO`, `WARN`, `ERROR`), JSON and colored console sinks. | Streams & Console |
| **[`cronutils`](#29-cronutils)** | Standard 5-field cron parsing, date matching (`matchesCron`), next run time, human English summary. | Cron Matcher |
| **[`semverutils`](#30-semverutils)** | SemVer 2.0.0 parsing, precedence comparison, range satisfaction (`^`, `~`, `>=`), bumping. | Pure TS |

### 5. Network, Web & Cryptography (7 Modules)
| Module | Description | Engine / Superpower |
| :--- | :--- | :--- |
| **[`netutils`](#31-netutils)** | Primary local IP discovery, public IP query, online connectivity check, TCP latency ping. | `node:os` & WebSockets |
| **[`httputils`](#32-httputils)** | Ergonomic HTTP client (`getJson`, `postJson`, `putJson`, `deleteJson`, `getText`), retries with backoff. | Native `fetch` |
| **[`serverutils`](#33-serverutils)** | Lightweight HTTP router, zero-config static directory hosting, WebSocket pub/sub hub. | **`Bun.serve`** |
| **[`urlutils`](#34-urlutils)** | RFC 3986 URL parsing, path segment joining (`joinUrl`), log credential redaction. | WHATWG URL |
| **[`jwtutils`](#35-jwtutils)** | Zero-dependency HS256 JSON Web Token signing (`signJwt`), verification, and unverified decoding. | WebCrypto HMAC |
| **[`cryptoutils`](#36-cryptoutils)** | SHA-256/512, MD5, HMAC, Base64/Base64URL, UUID v4/v7, tokens, native password hashing. | `Bun.password` & WebCrypto |
| **[`hashutils`](#37-hashutils)** | Nanosecond 64-bit non-cryptographic hashes (`wyhash`, `crc32`, `rapidhash`), Bloom filter. | **`Bun.hash`** |

### 6. Concurrency, Flow Control & Logic (7 Modules)
| Module | Description | Engine / Superpower |
| :--- | :--- | :--- |
| **[`asyncutils`](#38-asyncutils)** | Bounded concurrency (`parallelMap`, `parallelFilter`, `parallelEach`), `WaitGroup`, `WorkerPool`. | Async/Await |
| **[`flowutils`](#39-flowutils)** | Traffic & resilience: Token Bucket `RateLimiter`, 3-state `CircuitBreaker`, `retry`, `debounce`. | Async Primitives |
| **[`fnutils`](#40-fnutils)** | Functional primitives: `once`, `memoize`, `curry`, `partial`, `negate`, `pipe`, `times`, `delay`. | `es-toolkit` inspired |
| **[`eventutils`](#41-eventutils)** | In-memory publish-subscribe event dispatcher (`EventEmitter`, `on`, `once`, `off`, `emit`). | Event Dispatch |
| **[`validutils`](#42-validutils)** | High-speed validators: email, URL, IPv4/IPv6, phone numbers, alphanumeric, UUID, JSON. | RegExp |
| **[`mockutils`](#43-mockutils)** | Synthetic test fixtures: `mockUser`, `mockUsers`, `mockEmail`, `mockPhone`, `mockUrl`, `loremText`. | Pseudorandom |
| **[`timeutils`](#44-timeutils)** | Human relative time ("2 hours ago"), ISO 8601 formatting/parsing, calendar boundaries, `Stopwatch`. | `Date` & High-res Timer |

---

## 🛠️ Exhaustive Module-by-Module API Reference

### 1. `fileutils`
*Async, non-blocking filesystem toolkit: crash-safe atomic writes, JSON / JSON-Lines / RFC 4180 CSV I/O, O(1) appends, fs predicates, recursive walking with depth & skip-lists, temp-dir lifecycles, byte formatting and streaming content hashes.*

```typescript
import { fileutils, type FileInfo, type CsvParseOptions, type CsvCell, type WalkOptions, type FileHashAlgorithm } from "./src/features/rad/index.ts";
```

#### Types
```typescript
interface FileInfo { path: string; size: number; isFile: boolean; isDir: boolean; isSymlink: boolean; mtimeMs: number; birthtimeMs: number; mode: number }
interface CsvParseOptions { trim?: boolean /* default true */; skipEmptyLines?: boolean /* default true */ }
type CsvCell = string | number | boolean | bigint | null | undefined; // null/undefined → empty cell
interface WalkOptions { maxDepth?: number; skipDirs?: string[]; includeDirs?: boolean }
type FileHashAlgorithm = "md5" | "sha1" | "sha256" | "sha512" | "blake2b256";
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `ensureDir(dirPath): Promise<void>` | `mkdir -p`; no-op if present. |
| `formatBytes(bytes, decimals = 1): string` | Sync 1024-based formatter (`B`…`EB`), keeps sign. Throws on non-finite. |
| `parseBytes(input): number` | `"1.5 KB"` → `1536`; accepts `K/KB/KiB`…`E`, case-insensitive. Throws on garbage. |
| `fileSizeHuman(bytesOrPath): Promise<string>` | Human size of a number **or** a file path. Throws if path missing. |
| `pathExists(path) / isFile(path) / isDir(path): Promise<boolean>` | Never-throwing predicates. |
| `fileInfo(path): Promise<FileInfo \| null>` | Plain-data `stat`, `null` when missing. |
| `readText(path, fallback?): Promise<string>` | UTF-8 read; fallback when missing, else throws. |
| `writeText(path, text, { atomic? }): Promise<number>` | Write text (parents auto-created); `atomic: true` = temp+rename. |
| `writeFileAtomic(path, data): Promise<number>` | Crash-safe replace — readers never see half-written files. |
| `saveJson(path, data, pretty = true): Promise<void>` | Atomic JSON write. |
| `loadJson<T>(path, fallback?): Promise<T>` | Parse JSON; fallback on missing **or corrupt** file. |
| `readJsonl<T>(path): Promise<T[]>` | NDJSON reader; errors include `file:line`. |
| `writeJsonl(path, records): Promise<void>` | Atomic NDJSON writer (trailing newline). |
| `appendJsonl(path, record): Promise<void>` | O(1) append of one record — ideal audit/event logs. |
| `readLines(path): Promise<string[]>` | Split on `\n` / `\r\n`. Throws if missing. |
| `writeLines(path, lines): Promise<void>` | Join with `\n` and write. |
| `appendLine(path, line) / appendLines(path, lines): Promise<void>` | O(1) append; inserts a separator only when needed. |
| `touch(path): Promise<void>` | Create empty file or bump mtime. |
| `copyFile(src, dest) / moveFile(src, dest): Promise<void>` | Parents auto-created; `moveFile` falls back to copy+unlink across devices (`EXDEV`). |
| `copyDir(src, dest, overwrite = true): Promise<void>` | Recursive `cp -R`. |
| `removePath(path): Promise<boolean>` | `rm -rf`; returns whether something existed. |
| `makeTempDir(prefix = "rad-"): Promise<string>` | Unique dir under the OS temp dir. |
| `withTempDir<T>(fn, prefix?): Promise<T>` | Run `fn(dir)`; dir is **always** deleted afterwards. |
| `hashFile(path, algorithm = "sha256"): Promise<string>` | Streaming hex digest (constant memory). |
| `parseCsvString(text, delimiter = ",", options?): string[][]` | RFC 4180: quoted delimiters, `""` escapes, **quoted newlines**, CRLF. |
| `formatCsvString(rows: CsvCell[][], delimiter = ","): string` | Quotes cells with delimiters, quotes, newlines or edge whitespace. |
| `csvToObjects(rows): Record<string,string>[]` | Header row → records (missing cells = `""`). |
| `objectsToCsv(records, columns?): CsvCell[][]` | Records → matrix (union of keys, or explicit column order). |
| `readCsv(path, delimiter?, options?) / writeCsv(path, rows, delimiter?)` | File variants of the matrix functions. |
| `readCsvObjects(path, delimiter?) / writeCsvObjects(path, records, columns?, delimiter?)` | File variants of the record functions. |
| `walkFiles(dir, filter?, options?: WalkOptions): Promise<string[]>` | Recursive listing with depth limit, skip-list, optional dirs. |
| `dirSize(dir): Promise<number>` | Total bytes under a directory. |

#### Recipe
```typescript
import { fileutils } from "./src/features/rad/index.ts";

await fileutils.withTempDir(async (dir) => {
  // Atomic config + JSON fallback
  await fileutils.saveJson(`${dir}/config.json`, { port: 8080 });
  const cfg = await fileutils.loadJson(`${dir}/config.json`, { port: 3000 });

  // Event log (O(1) appends) → read back
  await fileutils.appendJsonl(`${dir}/events.jsonl`, { type: "boot", at: Date.now() });
  const events = await fileutils.readJsonl<{ type: string }>(`${dir}/events.jsonl`);

  // CSV round-trip through plain records (handles commas, quotes and newlines in cells)
  await fileutils.writeCsvObjects(`${dir}/users.csv`, [{ id: 1, bio: 'Likes "Bun",\nand TS' }]);
  const users = await fileutils.readCsvObjects(`${dir}/users.csv`); // [{ id: "1", bio: 'Likes "Bun",\nand TS' }]

  // Walk, size, hash
  const files = await fileutils.walkFiles(dir, (p) => !p.endsWith(".tmp"), { skipDirs: ["node_modules"], maxDepth: 3 });
  console.log(cfg.port, events.length, users[0]?.bio, files.length);
  console.log(fileutils.formatBytes(await fileutils.dirSize(dir)), await fileutils.hashFile(`${dir}/users.csv`));
});
```

---

### 2. `sqliteutils`
*Embedded database toolkit on native `bun:sqlite`: tuned connections (WAL, busy timeout, foreign keys), injection-safe identifier quoting, cached typed queries, transactions, schema introspection, KV store with atomic counters, JSON document store with `json_extract` queries, bulk insert & upsert, validated migrations, BM25-ranked FTS5 search and hot backups.*

```typescript
import { sqliteutils, type OpenDbOptions, type SqlMigration, type SqlParams, type ColumnInfo, type StoredDoc } from "./src/features/rad/index.ts";
```

#### Types
```typescript
type SqlParams = any[];
interface OpenDbOptions { wal?: boolean /* true */; readonly?: boolean; create?: boolean /* true */; foreignKeys?: boolean /* true */; busyTimeoutMs?: number /* 5000 */ }
interface SqlMigration { version: number; up: string; name?: string }
interface ColumnInfo { cid: number; name: string; type: string; notnull: boolean; defaultValue: string | null; primaryKey: boolean }
interface StoredDoc<T> { id: string; doc: T; updatedAt: string }
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `quoteIdent(name): string` | Escape a table/column name (`"` → `""`). Used internally everywhere. |
| `openDb(path = ":memory:", options: boolean \| OpenDbOptions = true): Database` | Open with pragmas. Legacy `boolean` = WAL on/off. |
| `closeDb(db): void` | Close connection. |
| `execSql(db, sql, params?): void` | Run one statement. |
| `queryAll<T>(db, sql, params?): T[]` / `queryOne<T>(…): T \| null` / `queryValue<T>(…): T \| null` | Cached prepared queries: all rows, first row, first scalar. |
| `transaction<T>(db, fn): T` | Commit on success, rollback + rethrow on error; nests as savepoints. |
| `tableExists(db, table): boolean` / `listTables(db): string[]` / `tableColumns(db, table): ColumnInfo[]` | Introspection. |
| `countRows(db, table, where?, params?): number` | `COUNT(*)` with optional filter. |
| `createKvTable(db, table = "kv_store")` | `(key PK, value TEXT, updated_at)`. |
| `setKv(db, table, key, value)` / `getKv(db, table, key): string \| null` | Upsert / raw read (non-strings JSON-encoded). |
| `getKvOr<T>(db, table, key, fallback): T` | JSON-decoded read with fallback. |
| `hasKv(db, table, key): boolean` / `deleteKv(…): boolean` / `listKv(db, table): Record<string,string>` | Presence, delete, dump. |
| `incrementKv(db, table, key, by = 1): number` | Atomic counter (`BEGIN IMMEDIATE`), returns new value. |
| `createJsonStore(db, table = "json_store")` | `(id PK, doc TEXT, updated_at)`. |
| `saveDoc / loadDoc<T> / deleteDoc` | Upsert, load (`null` if absent), delete by id. |
| `listDocs<T>(db, table): StoredDoc<T>[]` | All docs with `updatedAt`. |
| `findDocs<T>(db, table, jsonPath, value): StoredDoc<T>[]` | Query by JSON path, e.g. `"$.role"`, booleans and `null` supported. |
| `insertRow(db, table, record): number` | Insert, returns `rowid`. Throws on empty record. |
| `insertMany(db, table, records): number` | Bulk insert in one transaction. |
| `upsertRow(db, table, record, conflictColumns): number` | `INSERT … ON CONFLICT DO UPDATE`. |
| `selectRows<T>(db, table, columns = ["*"], where?, params?): T[]` | Parameterized select (WHERE may include `ORDER BY`/`LIMIT`). |
| `selectOne<T>(db, table, where, params?): T \| null` | First match. |
| `updateRows(db, table, updates, where?, params?): number` / `deleteRows(db, table, where?, params?): number` | Returns rows affected. |
| `runMigrations(db, migrations): number` | Ordered, transactional, idempotent. Rejects duplicate versions; errors name the failing version. |
| `getSchemaVersion(db): number` | Highest applied version (0 if none). |
| `createFtsTable(db, table, columns)` / `indexFts(db, table, row)` | FTS5 table + indexing. |
| `searchFts<T>(db, table, query, limit = 50): T[]` | `MATCH` search (`"phrase"`, `a AND b`, `pre*`). |
| `searchFtsRanked<T>(db, table, query, limit = 50): (T & { rank })[]` | BM25 relevance order (lower = better). |
| `vacuumDb(db)` / `checkpointWal(db)` | Compact / flush WAL. |
| `backupDb(db, destPath)` | Consistent hot snapshot via `VACUUM INTO` (dest must not exist). |
| `dbSizeBytes(db): number` | `page_count × page_size`. |

#### Recipe
```typescript
import { sqliteutils } from "./src/features/rad/index.ts";

const db = sqliteutils.openDb(":memory:", { busyTimeoutMs: 10_000 });
sqliteutils.runMigrations(db, [
  { version: 1, name: "users", up: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT);" },
]);
sqliteutils.insertMany(db, "users", [{ email: "a@x.io", name: "A" }, { email: "b@x.io", name: "B" }]);
sqliteutils.upsertRow(db, "users", { email: "a@x.io", name: "Ada" }, ["email"]);
const ada = sqliteutils.selectOne<{ name: string }>(db, "users", "email = ?", ["a@x.io"]); // { name: "Ada", ... }

sqliteutils.transaction(db, () => {
  sqliteutils.updateRows(db, "users", { name: "Bea" }, "email = ?", ["b@x.io"]);
});

sqliteutils.createKvTable(db, "stats");
sqliteutils.incrementKv(db, "stats", "logins"); // 1

sqliteutils.createJsonStore(db, "profiles");
sqliteutils.saveDoc(db, "profiles", "u1", { role: "admin" });
const admins = sqliteutils.findDocs(db, "profiles", "$.role", "admin");

sqliteutils.createFtsTable(db, "notes", ["body"]);
sqliteutils.indexFts(db, "notes", { body: "bun is fast" });
const hits = sqliteutils.searchFtsRanked(db, "notes", "fast");
console.log(ada?.name, admins.length, hits[0]?.rank, sqliteutils.getSchemaVersion(db));
sqliteutils.closeDb(db);
```

---

### 3. `tomlutils`
*Native `Bun.TOML` parse/stringify with contextual errors, typed dotted-path getters (array indices supported), path mutation, deep merge and one-line layered config loading.*

```typescript
import { tomlutils, type TomlTable } from "./src/features/rad/index.ts";
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `parse` / `stringify` | Raw `Bun.TOML.parse` / `Bun.TOML.stringify`. |
| `parseToml<T>(content): T` | Parse; throws `[tomlutils.parseToml] <reason>`. |
| `tryParseToml<T>(content): T \| null` | Parse without throwing. |
| `stringifyToml(data): string` | Serialize to TOML. |
| `loadToml<T>(path, fallback?): Promise<T>` | Load file; fallback on missing/invalid. |
| `saveToml(path, data): Promise<number>` | Atomic write, parents auto-created. |
| `loadTomlLayers<T>(paths): Promise<T>` | Load + deep-merge in order (later wins), missing files skipped. |
| `getTomlPath(doc, keyPath): any` | Resolve `"a.b.0.c"`; `undefined` if absent. |
| `hasTomlKey(doc, keyPath): boolean` | Presence check. |
| `setTomlPath(doc, keyPath, value): doc` | Set, creating intermediate tables (throws if a segment is a scalar). |
| `getString / getInt / getNumber / getBool` | Typed reads with fallbacks (`getBool` accepts `"true"/"1"/"yes"/"on"`). |
| `getArray<T>(doc, keyPath, fallback = [])` / `getTable<T>(doc, keyPath, fallback = {})` | Collection reads. |
| `mergeToml<T>(base, override): T` | Deep merge (tables recurse; arrays/scalars replace). |

> [!NOTE]
> `getInt` / `getBool` share names with `envutils`; flat imports from `index.ts` resolve to the `envutils` versions. Use `tomlutils.getInt(...)` (namespaced) for TOML documents.

#### Recipe
```typescript
import { tomlutils } from "./src/features/rad/index.ts";

const cfg = tomlutils.parseToml(`
[server]
port = 8080
cors_origins = ["http://localhost:3000"]
[[server.upstreams]]
host = "10.0.0.2"
`);
tomlutils.getInt(cfg, "server.port", 3000);               // 8080
tomlutils.getString(cfg, "server.upstreams.0.host");      // "10.0.0.2"
tomlutils.setTomlPath(cfg, "server.tls.enabled", true);
const merged = tomlutils.mergeToml(cfg, { server: { port: 9090 } });
console.log(tomlutils.stringifyToml(merged));

// default.toml → local.toml override in one call (missing files are skipped)
const layered = await tomlutils.loadTomlLayers(["./config/default.toml", "./config/local.toml"]);
```

---

### 4. `archiveutils`
*Zero-dependency ZIP writer/reader: real DOS timestamps, UTF-8 names, automatic store-vs-deflate, directory entries, EOCD-based parsing, CRC-32 verification on every read, and zip-slip-safe extraction. Limits: no Zip64 (≤ 65,535 entries, ≤ 4 GiB), no encryption.*

```typescript
import { archiveutils, type ZipEntryInput, type ZipEntryInfo, type ZipEntryHeader, type ZipExtractedEntry } from "./src/features/rad/index.ts";
```

#### Types
```typescript
interface ZipEntryInput { name: string; data: string | Uint8Array; mtime?: Date; compress?: boolean } // name ending "/" = directory
interface ZipEntryHeader { name: string; crc32: number; compressedSize: number; uncompressedSize: number; offset: number; compressionMethod: number }
interface ZipEntryInfo extends ZipEntryHeader { isDirectory: boolean; modified: Date }
interface ZipExtractedEntry { name: string; data: Uint8Array }
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `zipFiles(entries): Uint8Array` | Build an archive in memory. |
| `zipFile(src, destZip): Promise<void>` | Zip one file (base name, mtime preserved). |
| `zipDir(srcDir, destZip, filter?): Promise<number>` | Recursive zip; `filter(relPath)` to exclude; returns file count. |
| `listZipEntries(zip): Promise<string[]>` | Names (bytes or path input). |
| `listZipDetails(zip): Promise<ZipEntryInfo[]>` | Sizes, CRC, method, dir flag, modified date. |
| `readZipEntry(zip, name): Promise<Uint8Array \| null>` | CRC-verified extraction of one entry. |
| `readZipText(zip, name): Promise<string \| null>` | Same, decoded as UTF-8. |
| `unzipToMemory(zip): Promise<ZipExtractedEntry[]>` | All file entries in memory. |
| `unzipToDir(zip, destDir): Promise<number>` | Extract to disk (zip-slip protected); returns file count. |
| `safeJoin(destDir, entryName): string` | Resolve inside `destDir` or throw. |
| `toDosDateTime(date) / fromDosDateTime(time, date)` | MS-DOS timestamp codec (2-second resolution). |

#### Recipe
```typescript
import { archiveutils } from "./src/features/rad/index.ts";

const zip = archiveutils.zipFiles([
  { name: "docs/", data: "" },
  { name: "docs/readme.txt", data: "Bun RAD Suite" },
  { name: "logo.png", data: new Uint8Array([137, 80, 78, 71]), compress: false },
]);
for (const e of await archiveutils.listZipDetails(zip)) console.log(e.name, e.uncompressedSize, e.modified);
const readme = await archiveutils.readZipText(zip, "docs/readme.txt"); // "Bun RAD Suite"
await archiveutils.unzipToDir(zip, "./extracted"); // throws on "../" entries
```

---

### 5. `compressutils`
*Synchronous compression on Bun's native codecs — gzip, raw deflate, zstd and brotli — with levels, Base64 helpers, a format-dispatching `compress`/`decompress` pair, magic-byte detection and file helpers.*

```typescript
import { compressutils, type CompressionFormat, type DetectedCompression } from "./src/features/rad/index.ts";
```

#### Types
```typescript
type CompressionFormat = "gzip" | "deflate" | "brotli" | "zstd"; // "deflate" = raw DEFLATE
type DetectedCompression = "gzip" | "zstd" | "zlib" | "unknown";
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `gzipCompress(data, level?)` / `gzipDecompress(bytes)` | Gzip (level 0–9). |
| `gzipCompressString(str): string` / `gzipDecompressString(b64): string` | Gzip ⇄ Base64 text. |
| `deflateCompress(data, level?)` / `deflateDecompress(bytes)` | Raw DEFLATE. |
| `brotliCompress(data, quality = 11)` / `brotliDecompress(bytes)` | Brotli (0–11). |
| `zstdCompress(data, level = 3)` / `zstdDecompress(bytes)` | Zstandard (1–22). |
| `compress(data, format, level?)` / `decompress(bytes, format)` | Codec-agnostic dispatch. |
| `detectCompression(bytes): DetectedCompression` | Magic-byte sniffing. |
| `compressFile(src, format = "gzip", dest?): Promise<string>` | Writes `src.gz/.br/.zst/.deflate` by default. |
| `decompressFile(src, format = "gzip", dest?): Promise<string>` | Strips the extension by default. |
| `compressionRatio(original, compressed): number` | % saved (1 decimal; negative if larger). |

All decompressors throw `[compressutils.<fn>] Invalid <format> data (<n> bytes): …` on corrupt input.

#### Recipe
```typescript
import { compressutils } from "./src/features/rad/index.ts";

const json = JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => ({ i })) });
for (const fmt of ["gzip", "brotli", "zstd"] as const) {
  const packed = compressutils.compress(json, fmt);
  console.log(fmt, compressutils.compressionRatio(json.length, packed.length), "% saved");
}
const b64 = compressutils.gzipCompressString(json);       // safe to store in JSON / env vars
compressutils.gzipDecompressString(b64) === json;          // true
compressutils.detectCompression(compressutils.zstdCompress("x")); // "zstd"
```

---

### 6. `tarutils`
*Pure-TypeScript POSIX ustar TAR with PAX long names, directory entries, permission bits & mtimes, header checksum verification, transparent gzip (`.tar.gz` / `.tgz`) and path-traversal-safe extraction.*

```typescript
import { tarutils, type TarEntry, type TarEntryType, type UnpackedTarEntry } from "./src/features/rad/index.ts";
```

#### Types
```typescript
type TarEntryType = "file" | "directory";
interface TarEntry { name: string; data: Uint8Array | string; mode?: number; mtime?: Date; type?: TarEntryType }
interface UnpackedTarEntry { name: string; data: Uint8Array; text: string; type: TarEntryType; mode: number; mtime: Date; size: number }
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `packTarBytes(entries): Uint8Array` | Uncompressed TAR (PAX header emitted for names > ustar limits). |
| `unpackTarBytes(bytes): UnpackedTarEntry[]` | Verifies checksums; honours PAX `path` & GNU long names; skips symlinks/devices. |
| `listTarEntries(bytes): string[]` | Names (gzip auto-detected). |
| `packTarGz(entries, level?) / unpackTarGz(bytes)` | Gzip-wrapped variants. |
| `createTarFile(srcDir, destPath, filter?): Promise<number>` | Archive a directory; gzip when path ends `.gz`/`.tgz`; keeps empty dirs, modes, mtimes. |
| `extractTarFile(tarPath, destDir): Promise<number>` | Extract (gzip auto-detected, traversal-safe); returns file count. |
| `paxRecord(key, value): string` | Build a self-length-prefixed PAX record. |

#### Recipe
```typescript
import { tarutils } from "./src/features/rad/index.ts";

const tgz = tarutils.packTarGz([
  { name: "pkg/", data: "", type: "directory" },
  { name: "pkg/package.json", data: '{"name":"demo"}', mode: 0o644 },
  { name: `pkg/${"very/".repeat(30)}deep.txt`, data: "long paths just work" },
]);
for (const e of tarutils.unpackTarGz(tgz)) console.log(e.type, e.name, e.size);
await tarutils.createTarFile("./dist", "./release/dist.tgz", (rel) => !rel.endsWith(".map"));
await tarutils.extractTarFile("./release/dist.tgz", "./restore");
```

---

### 7. `stateutils`
*Persistent application state: OS-correct config/data/cache directories, `AppStateStore` with atomic saves, multi-level undo, subscriptions and patches, and a persistent `KeyValueState` bag.*

```typescript
import { stateutils, AppStateStore, KeyValueState, type AppStateOptions, type StateListener } from "./src/features/rad/index.ts";
```

#### Types
```typescript
interface AppStateOptions { customPath?: string; autoSave?: boolean /* true */; historyLimit?: number /* 10 */ }
type StateListener<T> = (next: T, prev: T) => void;
```

#### API Signatures
| Member | Description |
| :--- | :--- |
| `resolveConfigDir(app)` | macOS `~/Library/Application Support/app` · Win `%APPDATA%\app` · Linux `$XDG_CONFIG_HOME/app`. |
| `resolveDataDir(app)` | macOS same · Win `%LOCALAPPDATA%\app` · Linux `$XDG_DATA_HOME/app` (`~/.local/share`). |
| `resolveCacheDir(app)` | macOS `~/Library/Caches/app` · Win `%LOCALAPPDATA%\app\Cache` · Linux `$XDG_CACHE_HOME/app`. |
| `new AppStateStore<T>(app, initial, options?)` | Default file: `<configDir>/<app>/state.json`. |
| `.get(): T` / `.select(fn)` | Current state / derived value. |
| `.update(fn): Promise<void>` | Mutate draft or return replacement; snapshots, notifies, auto-saves. |
| `.patch(partial): Promise<void>` | Shallow merge (same semantics as `update`). |
| `.subscribe(listener): () => void` | Change listener; returns unsubscribe. |
| `.save(): Promise<void>` | Atomic pretty-JSON write. |
| `.load(): Promise<T>` | Load and merge over defaults; corrupt files are ignored. |
| `.rollback()` / `.canRollback()` | Multi-level undo (in memory). |
| `.reset()` | Restore defaults (undoable). |
| `.removeFile(): Promise<boolean>` | Delete the persisted file. |
| `.filePath` / `.autoSave` / `.historyLimit` | Read-only config. |
| `new KeyValueState(app, customPath?)` | Persistent bag: `init()`, `get(key, fallback?)`, `has`, `set`, `setMany`, `delete`, `keys()`, `all()`, `clear()`, `filePath`. |

#### Recipe
```typescript
import { stateutils } from "./src/features/rad/index.ts";

const store = new stateutils.AppStateStore("todo-app", { todos: [] as string[], theme: "dark" }, { customPath: "/tmp/todo-state.json" });
await store.load();
const off = store.subscribe((next, prev) => console.log(prev.todos.length, "→", next.todos.length));
await store.update((d) => { d.todos.push("ship v2"); });
await store.patch({ theme: "light" });
store.rollback();                 // theme back to "dark"
console.log(store.select((s) => s.theme));
off();

const kv = new stateutils.KeyValueState("my-cli", "/tmp/my-cli-kv.json");
await kv.init();
await kv.setMany({ token: "abc", region: "us-east" });
kv.get<string>("region");         // "us-east"
```

---

### 8. `cacheutils`
*In-memory caches: O(1) `LRUCache` with eviction callbacks, peek, resize, iteration and stats; `TTLCache` with per-entry TTLs, sliding expiration, in-flight de-duplication (thundering-herd protection), background sweeping and stats.*

```typescript
import { cacheutils, LRUCache, TTLCache, type CacheStats, type TTLCacheOptions } from "./src/features/rad/index.ts";
```

#### Types
```typescript
interface CacheStats { hits: number; misses: number; evictions: number; size: number; hitRate: number }
interface TTLCacheOptions { sweepIntervalMs?: number; sliding?: boolean }
```

#### API Signatures
| Member | Description |
| :--- | :--- |
| `new LRUCache<K,V>(capacity, onEvict?)` | `onEvict(key, value)` fires on capacity evictions. |
| `.get / .set / .has / .delete / .clear / .size()` | Core ops (`get` refreshes recency). |
| `.peek(key)` | Read without refreshing recency. |
| `.getOrSet(key, factory)` | Sync compute-and-cache. |
| `.resize(capacity)` / `.capacity` | Change limit (shrinking evicts). |
| `.keys() / .values() / .entries()` | LRU → MRU order. |
| `.stats(): CacheStats` | Hit/miss/eviction counters. |
| `new TTLCache<K,V>(defaultTtlMs = 60_000, options?)` | Lazy expiry + optional `sweepIntervalMs` (unref'd timer). |
| `.get / .set(key, value, ttlMs?) / .has / .delete / .clear / .size()` | Core ops (`get` refreshes TTL when `sliding`). |
| `.getOrSet(key, factory, ttlMs?)` | Async; concurrent callers share one factory call; failures aren't cached. |
| `.ttl(key)` | ms remaining, `-1` if absent. |
| `.touch(key, ttlMs?)` | Extend lifetime. |
| `.prune()` / `.keys()` / `.stats()` / `.dispose()` | Sweep, list, counters, stop sweeper. |

#### Recipe
```typescript
import { cacheutils } from "./src/features/rad/index.ts";

const lru = new cacheutils.LRUCache<string, string>(2, (k) => console.log("evicted", k));
lru.set("a", "A"); lru.set("b", "B"); lru.set("c", "C"); // logs "evicted a"
lru.getOrSet("d", () => "D");

const users = new cacheutils.TTLCache<string, { id: string }>(30_000, { sliding: true });
const fetchUser = async (id: string) => ({ id });
const [u1, u2] = await Promise.all([users.getOrSet("u1", () => fetchUser("u1")), users.getOrSet("u1", () => fetchUser("u1"))]); // ONE fetch
console.log(u1 === u2, users.ttl("u1"), lru.stats().hitRate);
users.dispose();
```

---

### 9. `arrutils` & `sliceutils`
*Immutable array toolkit (`sliceutils` is an alias). Never mutates its input. Covers access, ranges, sliding windows, keyed set algebra, multi-key stable sorting, binary search, grouping/aggregation, zipping, seeded shuffling/sampling and drag-and-drop style edits.*

```typescript
import { arrutils, sliceutils, type Sortable, type SortDirection } from "./src/features/rad/index.ts";
```

#### Types
```typescript
type Sortable = number | string | bigint | Date | boolean;
type SortDirection = "asc" | "desc";
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `at(arr, index)` | Negative-index aware access. |
| `first(arr)` / `head(arr)` / `last(arr)` | First / last element or `undefined`. |
| `tail(arr)` / `initial(arr)` | All but first / all but last. |
| `range(start, end?, step = 1): number[]` | `range(5)` → `[0..4]`; negative steps count down. Throws on `step = 0`. |
| `compact(arr)` | Drop falsy values (`null`, `undefined`, `false`, `0`, `""`). |
| `filterMap(arr, fn)` | Map + drop `null`/`undefined` in one pass. |
| `unique(arr, keyFn?)` / `uniqBy` | Order-preserving de-dup (optionally by key). |
| `chunk(arr, size)` | Fixed-size groups (last may be short). |
| `windowed(arr, size, step = 1)` | Sliding windows (full windows only). |
| `pairwise(arr)` | Adjacent pairs `[a,b],[b,c]…`. |
| `flatten(arr)` / `flattenDeep(arr)` | One level / all levels. |
| `partition(arr, pred): [pass, fail]` | Split by predicate. |
| `count(arr, pred)` | Count matches. |
| `intersection(a, b)` / `intersectionBy(a, b, keyFn)` | Items in both. |
| `difference(a, b)` / `differenceBy(a, b, keyFn)` | Items in `a` not in `b`. |
| `union(...arrays)` / `unionBy(a, b, keyFn)` | De-duplicated concatenation. |
| `xor(a, b)` | Items in exactly one array. |
| `drop / dropRight / dropWhile / dropRightWhile` | Remove from either end. |
| `take / takeRight / takeWhile / takeRightWhile` | Keep from either end. |
| `keyBy(arr, keyFn)` / `countBy` / `groupBy` | Index, tally, bucket by key. |
| `frequency(arr)` | Tally primitive values. |
| `minBy / maxBy / sumBy(arr, fn)` | Aggregates by projection. |
| `zip(a, b)` / `zipWith(a, b, fn)` / `unzip(pairs)` / `zipObject(keys, values)` | Pairing helpers. |
| `without(arr, ...values)` | Remove specific values. |
| `shuffle(arr, rng = Math.random)` | Fisher–Yates; pass `mathutils.seededRandom(n)` for determinism. |
| `sample(arr, count = 1, rng?)` / `sampleSize` | Random picks without replacement. |
| `sortBy(arr, keyFn, direction = "asc")` | Stable single-key sort. |
| `orderBy(arr, keyFns, directions?)` | Stable multi-key sort with per-key direction. |
| `isSorted(arr, keyFn?)` | Non-decreasing check. |
| `binarySearch(sorted, target)` | Index or `-1`. |
| `sortedIndex(sorted, value)` | Insertion point keeping order. |
| `insertAt(arr, index, ...items)` / `removeAt(arr, index)` | Immutable splice. |
| `moveItem(arr, from, to)` | Reorder (drag-and-drop). |
| `rotate(arr, n)` | Rotate left (negative = right). |
| `toggleItem(arr, item)` | Add if absent, remove if present. |
| `cartesianProduct(...arrays)` | Every combination. |

#### Recipe
```typescript
import { arrutils, mathutils } from "./src/features/rad/index.ts";

const orders = [
  { id: 1, customer: "ana", total: 40, day: 1 },
  { id: 2, customer: "bo", total: 90, day: 1 },
  { id: 3, customer: "ana", total: 15, day: 2 },
];
const ranked = arrutils.orderBy(orders, [(o) => o.customer, (o) => o.total], ["asc", "desc"]).map((o) => o.id); // [1, 3, 2]
const byCustomer = arrutils.groupBy(orders, (o) => o.customer);                 // { ana: [...], bo: [...] }
const deltas = arrutils.pairwise(orders.map((o) => o.total)).map(([a, b]) => b - a); // [50, -75]
const pages = arrutils.chunk(arrutils.range(1, 8), 3);                            // [[1,2,3],[4,5,6],[7]]
const ab = arrutils.shuffle(["A", "B", "C"], mathutils.seededRandom(42));         // deterministic
const tags = arrutils.toggleItem(["bun", "ts"], "ts");                            // ["bun"]
console.log(ranked, Object.keys(byCustomer), deltas, pages, ab, tags);
```

---

### 10. `objutils`
*Safe deep object toolkit: path get/set/has/unset with quoted-bracket paths and prototype-pollution guards, pick/omit families, key/value mapping, deep clone/merge/freeze/equality, flatten/unflatten and structural diffs.*

```typescript
import { objutils, type ObjPath, type ObjectDiff } from "./src/features/rad/index.ts";
```

#### Types
```typescript
type ObjPath = string | readonly (string | number)[]; // "a.b[0]", 'a["x.y"]', or ["a", "b", 0]
interface ObjectDiff { added: string[]; removed: string[]; changed: string[] } // dot-paths
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `isNil(v)` / `isPrimitive(v)` / `isEmpty(v)` | Type predicates (`isEmpty` handles strings, arrays, Maps, Sets, objects). |
| `isPlainObject(v)` | `true` only for `{}` / `Object.create(null)` (not Date, Map, class instances). |
| `isEqual(a, b, strict = false)` | Deep equality (Dates, Maps, Sets, arrays); `strict` also compares prototypes. |
| `toPath(path)` | Parse a path string into segments. |
| `get(obj, path, default?)` / `has(obj, path)` | Safe deep read / existence. |
| `set(obj, path, value)` | Deep write (mutates, creates arrays for numeric segments). Throws on `__proto__`/`constructor`/`prototype`. |
| `unset(obj, path): boolean` | Deep delete. |
| `pick / omit(obj, keys)` | Keep / drop listed keys. |
| `pickBy / omitBy(obj, pred)` | Keep / drop by predicate. |
| `compactObject(obj)` | Drop `null`/`undefined` values. |
| `findKey(obj, pred)` | First matching key. |
| `mapKeys / mapValues(obj, fn)` | Transform keys or values. |
| `renameKeys(obj, mapping)` | `{ old: "new" }` renames. |
| `invert(obj)` | Swap keys and values. |
| `typedKeys / typedEntries(obj)` | `Object.keys/entries` with `keyof T` typing. |
| `defaults(obj, ...sources)` | Fill only `undefined` keys. |
| `deepClone(v)` | `structuredClone` with fallback. |
| `deepMerge(target, ...sources)` | Recursive merge of plain objects (pollution-safe). |
| `deepFreeze(v)` | Recursively `Object.freeze`. |
| `flattenObject(obj, prefix = "", flattenArrays = false)` | `{a:{b:1}}` → `{"a.b":1}`; empty `{}` kept as leaves. |
| `unflattenObject(flat)` | Inverse of `flattenObject`. |
| `objectDiff(before, after): ObjectDiff` | Added / removed / changed leaf paths. |

#### Recipe
```typescript
import { objutils } from "./src/features/rad/index.ts";

const defaults = { server: { port: 3000, host: "0.0.0.0" }, features: { beta: false } };
const user = { server: { port: 8080 }, features: { beta: true }, secret: null };
const cfg = objutils.deepMerge(objutils.deepClone(defaults), objutils.compactObject(user) as any);
objutils.set(cfg, 'labels["app.kubernetes.io/name"]', "api");
const changes = objutils.objectDiff(defaults, cfg);             // { added: ["labels.app.kubernetes.io/name"], changed: ["server.port","features.beta"], removed: [] }
const env = objutils.mapKeys(objutils.flattenObject(cfg), (_v, k) => k.toUpperCase().replace(/\W/g, "_"));
const frozen = objutils.deepFreeze(cfg);
console.log(objutils.get<number>(frozen, "server.port"), changes, env.SERVER_PORT);
```

---

### 11. `structutils`
*Classic data structures with predictable complexity: stack, amortized-O(1) queue, deque, overwrite-on-full ring buffer, binary min-heap, stable priority queue, prefix trie and union-find.*

```typescript
import { structutils, SimpleStack, SimpleQueue, SimpleDeque, SimpleRingBuffer, SimpleMinHeap, SimplePriorityQueue, SimpleTrie, DisjointSet } from "./src/features/rad/index.ts";
```

#### API Signatures
| Class | Members |
| :--- | :--- |
| `SimpleStack<T>` | `static from(items)`, `push`, `pop`, `peek`, `isEmpty`, `size`, `clear`, `toArray`, iterable. |
| `SimpleQueue<T>` | `static from(items)`, `enqueue`, `dequeue` (amortized O(1)), `peek`, `isEmpty`, `size`, `clear`, `toArray`, iterable. |
| `SimpleDeque<T>` | `pushBack`, `pushFront`, `popFront`, `popBack`, `peekFront`, `peekBack`, `at(i)`, `size`, `isEmpty`, `clear`, `toArray`. |
| `SimpleRingBuffer<T>(capacity)` | `push(item): evicted \| undefined`, `pop` (oldest), `peek` (oldest), `peekLast`, `at(i)`, `isFull`, `isEmpty`, `size`, `clear`, `toArray` (oldest → newest). |
| `SimpleMinHeap<T>(compareFn?)` | `static from(items, compareFn?)` (O(n) heapify), `push`, `pop`, `peek`, `size`, `isEmpty`, `clear`, `toArray`, `drain()` (sorted, empties heap). |
| `SimplePriorityQueue<T>` | `enqueue(item, priority = 0)` (lower = sooner, FIFO among ties), `dequeue`, `peek`, `size`, `isEmpty`, `clear`. |
| `SimpleTrie(words?)` | `add(word): boolean`, `has`, `hasPrefix`, `delete`, `withPrefix(prefix, limit?)`, `size`. |
| `DisjointSet<T>` | `add`, `find`, `union(a, b): boolean`, `connected`, `setSize`, `groups()`. |

#### Recipe
```typescript
import { structutils } from "./src/features/rad/index.ts";

const jobs = new structutils.SimplePriorityQueue<string>();
jobs.enqueue("send-newsletter", 5);
jobs.enqueue("charge-card", 1);
const next = jobs.dequeue();                                         // "charge-card"

const recent = new structutils.SimpleRingBuffer<number>(3);
[120, 95, 300, 80].forEach((ms) => recent.push(ms));                 // keeps last 3: [95, 300, 80]

const commands = new structutils.SimpleTrie(["deploy", "deploy:prod", "dev", "doctor"]);
const suggestions = commands.withPrefix("dep");                      // ["deploy", "deploy:prod"]

const accounts = new structutils.DisjointSet<string>();
accounts.union("ana@x.io", "ana@y.io");
accounts.union("ana@y.io", "+1-555-0100");
console.log(next, recent.toArray(), suggestions, accounts.connected("ana@x.io", "+1-555-0100"));
```

---

### 12. `statutils`
*Descriptive and inferential statistics on plain number arrays: central tendency (arithmetic/weighted/geometric/harmonic), spread, percentiles and Tukey outliers, shape, correlation (Pearson/Spearman), linear regression with R², smoothing, normalization, histograms and one-call summaries.*

```typescript
import { statutils, type StatsSummary, type LinearModel, type HistogramBin } from "./src/features/rad/index.ts";
```

#### Types
```typescript
interface StatsSummary { count: number; sum: number; mean: number; median: number; min: number; max: number; variance: number; stdDev: number; q1: number; q3: number; iqr: number }
interface LinearModel { slope: number; intercept: number; r2: number }
interface HistogramBin { start: number; end: number; count: number }
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `mean / median / mode(nums)` | `mode` returns all modes. Empty input → `0` / `[]`. |
| `weightedMean(values, weights)` | Throws on length mismatch; zero total weight → `0`. |
| `geometricMean / harmonicMean(nums)` | Positive inputs only; returns `0` for empty or non-positive input. |
| `minMax(nums)` | `{ min, max }` in one pass. |
| `variance / stdDev(nums, sample = true)` | Sample (n−1) or population. |
| `sem(nums)` | Standard error of the mean. |
| `percentile(nums, p)` | Linear interpolation, `p` in `0..100`. |
| `quartiles(nums)` / `iqr(nums)` | Tukey median-of-halves. |
| `detectOutliers(nums, k = 1.5)` | Values outside Tukey fences. |
| `skewness / kurtosis(nums)` | Shape (sample-adjusted; excess kurtosis). |
| `covariance / pearsonCorrelation(x, y)` | Linear relationship. |
| `rank(nums)` / `spearmanCorrelation(x, y)` | Average ranks for ties; rank correlation. |
| `linearRegression(x, y): LinearModel` / `predictLinear(model, x)` | OLS fit and prediction. |
| `zScore(v, mean, sd)` / `zScores(nums)` | Standardization. |
| `normalize(nums)` | Min-max scale to `0..1`. |
| `movingAverage(nums, window)` / `exponentialMovingAverage(nums, alpha)` | Smoothing. |
| `histogram(nums, bins = 10): HistogramBin[]` | Equal-width bins (max lands in last bin). |
| `summarize(nums): StatsSummary` | Everything above in one object. |

#### Recipe
```typescript
import { statutils } from "./src/features/rad/index.ts";

const latencies = [12, 15, 11, 14, 13, 12, 250, 16, 13, 12];
const s = statutils.summarize(latencies);
const p95 = statutils.percentile(latencies, 95);
const spikes = statutils.detectOutliers(latencies);                 // [250]
const smooth = statutils.exponentialMovingAverage(latencies, 0.3);
const fit = statutils.linearRegression([1, 2, 3, 4], [110, 205, 290, 410]);
const forecast = statutils.predictLinear(fit, 5);                   // ≈ 500
console.log(s.median, p95, spikes, smooth.at(-1), fit.r2.toFixed(3), forecast);
```

---

### 13. `mathutils`
*Numeric toolkit: interpolation & remapping, drift-free rounding, epsilon comparisons, 2D geometry (points, angles, rotation, rectangles), number theory (primes, factorization, BigInt factorial, binomials), percentages and seeded / cryptographically secure randomness.*

```typescript
import { mathutils, type Point2D, type Rect } from "./src/features/rad/index.ts";
```

#### Types
```typescript
interface Point2D { x: number; y: number }
interface Rect { x: number; y: number; width: number; height: number }
```

#### API Signatures
| Function | Description |
| :--- | :--- |
| `lerp(a, b, t)` / `inverseLerp(a, b, v)` / `remap(v, inMin, inMax, outMin, outMax)` | Interpolation. |
| `clamp(v, min, max)` / `wrap(v, min, max)` | Bound or wrap-around (angles, carousels). |
| `roundToStep(v, step)` / `round(v, precision = 0)` | Snap; `round(1.005, 2) === 1.01`. |
| `approxEqual(a, b, epsilon = 1e-9)` | Float-safe equality. |
| `distance / midpoint(p1, p2)` | Point geometry. |
| `angleBetween(p1, p2)` / `rotatePoint(p, radians, origin?)` | Angles in radians. |
| `degToRad / radToDeg` | Conversions. |
| `rectIntersects / rectIntersection / rectUnion / rectContainsPoint / rectArea` | Axis-aligned rectangles. |
| `gcd / lcm(a, b)` | Integer math. |
| `isPowerOfTwo / nextPowerOfTwo(n)` | Buffer sizing. |
| `isPrime(n)` / `primeFactors(n)` | Number theory. |
| `factorial(n): bigint` / `binomial(n, k)` | Exact combinatorics. |
| `inRange(v, start, end?)` | `[start, end)` (single arg = `[0, start)`). |
| `sum / product(arr)` / `sumBy(arr, fn)` | Aggregates. |
| `percentOf(part, whole)` / `percentChange(from, to)` | Percentages. |
| `randomInt / randomFloat(min, max)` | `Math.random`-based (inclusive int). |
| `secureRandomInt(min, max)` | `crypto.getRandomValues`, unbiased. |
| `seededRandom(seed): () => number` | Reproducible mulberry32 PRNG. |

#### Recipe
```typescript
import { mathutils } from "./src/features/rad/index.ts";

const progress = mathutils.inverseLerp(0, 250, 75);                  // 0.3
const barWidth = Math.round(mathutils.lerp(0, 40, progress));        // 12
const heading = mathutils.wrap(350 + 30, 0, 360);                    // 20
const price = mathutils.round(19.999 * 1.0825, 2);                   // 21.65
const overlap = mathutils.rectIntersection({ x: 0, y: 0, width: 100, height: 50 }, { x: 80, y: 20, width: 50, height: 50 });
const rng = mathutils.seededRandom(2026);
const dice = mathutils.secureRandomInt(1, 6);
console.log(barWidth, heading, price, overlap, rng(), dice, mathutils.percentChange(80, 100)); // … 25
```

---

### 14. `bitutils`
*Bit-level toolkit: a fixed-size `BitSet` with set algebra and scanning, integer bit helpers, and typed named-flag registries for permissions/feature masks.*

```typescript
import { bitutils, BitSet } from "./src/features/rad/index.ts";
```

#### API Signatures
| Member | Description |
| :--- | :--- |
| `new BitSet(size)` / `BitSet.fromIndices(size, indices)` / `BitSet.fromBinaryString("0101")` | Construct (index 0 = leftmost char). |
| `set(i, val = true)` / `get(i)` / `clear(i)` / `toggle(i)` / `fill(val = true)` | Bit access; out-of-range writes are ignored, reads return `false` (backward-compatible). |
| `countSet()` / `any()` / `none()` / `all()` | Population queries. |
| `nextSetBit(from = 0)` / `toIndices()` | Scanning (`-1` when none). |
| `and / or / xor / andNot(other)` | New BitSet (sizes must match). |
| `clone()` / `equals(other)` / `toBinaryString()` | Utilities. |
| `popcount(n)` / `countTrailingZeros(n)` | 32-bit counts. |
| `getBit / setBit / clearBit / toggleBit(n, i)` | Integer bit ops. |
| `toBinary(n, width = 32)` | Zero-padded binary string. |
| `setFlag / hasFlag / hasAnyFlag / clearFlag / toggleFlag(flags, mask)` | Mask ops. |
| `defineFlags(names)` | `["read","write"]` → `{ read: 1, write: 2 }` (max 31). |
| `combineFlags(map, names)` / `describeFlags(value, map)` | Names ↔ mask. |

#### Recipe
```typescript
import { bitutils } from "./src/features/rad/index.ts";

const Perm = bitutils.defineFlags(["read", "write", "delete", "admin"] as const);
let role = bitutils.combineFlags(Perm, ["read", "write"]);
role = bitutils.setFlag(role, Perm.delete);
const canMutate = bitutils.hasAnyFlag(role, Perm.write | Perm.delete);   // true
const names = bitutils.describeFlags(role, Perm);                         // ["read","write","delete"]

const mon = bitutils.BitSet.fromIndices(7, [0, 2, 4]);                    // Mon/Wed/Fri
const tue = bitutils.BitSet.fromIndices(7, [1, 2]);
const shared = mon.and(tue).toIndices();                                   // [2]
console.log(canMutate, names, shared, bitutils.toBinary(role, 4));
```

---

### 15. `graphutils`
*Directed or undirected, optionally weighted graph: topological sort with cycle diagnostics, cycle path extraction, BFS/DFS (iterative), fewest-hop and Dijkstra shortest paths, weak & strong (Tarjan) components, mutation, introspection and JSON round-trips.*

```typescript
import { graphutils, Graph, newGraph, type GraphNode, type GraphOptions, type GraphEdge, type GraphJSON, type WeightedPath } from "./src/features/rad/index.ts";
```

#### Types
```typescript
type GraphNode = string | number;
interface GraphOptions { directed?: boolean /* default true */ }
interface GraphEdge<T> { from: T; to: T; weight: number }
interface GraphJSON<T> { directed: boolean; nodes: T[]; edges: GraphEdge<T>[] }
interface WeightedPath<T> { path: T[]; distance: number }
```

#### API Signatures
| Member | Description |
| :--- | :--- |
| `newGraph<T>(options?)` / `new Graph<T>(options?)` | Create. |
| `Graph.fromEdges(edges, options?)` / `Graph.fromJSON(json)` | Build from `[from, to, weight?]` tuples or a snapshot. |
| `addNode(n)` / `addEdge(from, to, weight = 1)` | Chainable; non-finite weights throw. |
| `removeNode(n)` / `removeEdge(from, to)` | Return `boolean`. |
| `hasNode` / `hasEdge` / `getEdgeWeight` | Lookups. |
| `getNodes()` / `getEdges()` / `getNeighbors(n)` / `predecessors(n)` | Listings (insertion order). |
| `nodeCount` / `edgeCount` / `inDegree(n)` / `outDegree(n)` | Counts. |
| `topologicalSort()` | Kahn order; throws `[graphutils.topologicalSort]` on cycles (lists stuck nodes) or undirected graphs. |
| `hasCycle()` / `findCycle(): T[] \| null` | Cycle detection with closed path `[a, b, a]`. |
| `bfs(start)` / `dfs(start)` / `reachableFrom(start)` | Traversals. |
| `shortestPath(start, end)` | Fewest hops (unweighted). |
| `dijkstra(start, end): WeightedPath \| null` / `distancesFrom(start)` | Weighted shortest paths; negative weights throw. |
| `connectedComponents()` / `stronglyConnectedComponents()` | Weak / strong components. |
| `reverse()` / `clone()` / `clear()` / `toJSON()` | Utilities. |

#### Recipe
```typescript
import { graphutils } from "./src/features/rad/index.ts";

// Build pipeline ordering
const tasks = graphutils.Graph.fromEdges<string>([["install", "build"], ["build", "test"], ["build", "lint"], ["test", "deploy"], ["lint", "deploy"]]);
const order = tasks.topologicalSort();                    // ["install","build","test","lint","deploy"]

// Road network routing
const roads = graphutils.newGraph<string>({ directed: false });
roads.addEdge("A", "B", 7).addEdge("B", "C", 2).addEdge("A", "C", 12).addEdge("C", "D", 3);
const route = roads.dijkstra("A", "D");                   // { path: ["A","B","C","D"], distance: 12 }

// Circular import detection
const imports = graphutils.Graph.fromEdges<string>([["a.ts", "b.ts"], ["b.ts", "c.ts"], ["c.ts", "a.ts"]]);
const cycle = imports.findCycle();                        // ["a.ts","b.ts","c.ts","a.ts"]
const snapshot = JSON.stringify(roads);                   // persist & restore with Graph.fromJSON
console.log(order, route, cycle, graphutils.Graph.fromJSON(JSON.parse(snapshot)).edgeCount);
```

---

### 16. `strutils`
*String case conversion, slug generation, Levenshtein distance, privacy masking, and wrapping.*

```typescript
import { strutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `slugify(str: string): string`: Converts string into clean URL-safe slug (`"Bun RAD Studio!"` $\to$ `"bun-rad-studio"`).
- `toSnakeCase(str: string): string`: Converts to `snake_case`.
- `toKebabCase(str: string): string`: Converts to `kebab-case`.
- `toCamelCase(str: string): string`: Converts to `camelCase`.
- `toPascalCase(str: string): string`: Converts to `PascalCase`.
- `toTitleCase(str: string): string`: Converts to `Title Case`.
- `maskEmail(email: string): string`: Masks email for privacy (`"developer@bun.sh"` $\to$ `"d*******r@bun.sh"`).
- `maskPhone(phone: string): string`: Masks phone numbers (`"+1 (555) 123-4567"` $\to$ `"******4567"`).
- `maskCreditCard(cc: string): string`: Masks credit card digits (`"**** **** **** 1234"`).
- `levenshteinDistance(a: string, b: string): number`: Computes minimum edit distance.
- `truncate(text: string, maxLen: number, suffix = "..."): string`: Truncates text cleanly.
- `padCenter(text: string, width: number, padChar = " "): string`: Centers text within padded width.
- `wordWrap(text: string, width: number): string`: Wraps text at word boundaries.
- `randomAlphanumeric(length: number): string`: Generates random alphanumeric string.

#### Example
```typescript
strutils.slugify("Welcome to Bun RAD v2!"); // "welcome-to-bun-rad-v2"
strutils.toCamelCase("user_first_name");    // "userFirstName"
strutils.maskEmail("admin@company.com");     // "a***n@company.com"
strutils.levenshteinDistance("fast", "faster"); // 2
```

---

### 17. `regexutils`
*Pattern matching, replacement, splitting, and named group extraction.*

```typescript
import { regexutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `isMatch(pattern: string | RegExp, text: string): boolean`: Tests pattern against text.
- `findFirst(pattern: string | RegExp, text: string): string | null`: Returns first matching substring.
- `findAll(pattern: string | RegExp, text: string): string[]`: Returns all matching substrings.
- `replace(pattern: string | RegExp, text: string, replacement: string): string`: Replaces occurrences.
- `split(pattern: string | RegExp, text: string): string[]`: Splits text by pattern.
- `findNamedGroups(pattern: RegExp, text: string): Record<string, string>[]`: Extracts RegExp named capture groups.

#### Example
```typescript
const numbers = regexutils.findAll(/\d+/g, "Order #4012 cost $99 with discount 15%"); // ["4012", "99", "15"]
const pattern = /(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/g;
const dates = regexutils.findNamedGroups(pattern, "Event on 2026-10-02");
console.log(dates[0].year); // "2026"
```

---

### 18. `templateutils`
*Fast string templating with fallback values and ANSI terminal markdown rendering.*

```typescript
import { templateutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `renderTemplate(template: string, vars: Record<string, any>): string`: Interpolates `{{key}}` and `{{key | fallback}}`.
- `renderMarkdownAnsi(markdown: string): string`: Formats markdown headings, bold text, inline code, and lists with terminal ANSI colors.

#### Example
```typescript
const msg = templateutils.renderTemplate("Hello {{name | Friend}}, your balance is {{balance | $0.00}}", {
  name: "Alice",
}); // "Hello Alice, your balance is $0.00"

const formatted = templateutils.renderMarkdownAnsi("# Release Notes\n**Fast** and `safe`.");
```

---

### 19. `colorutils`
*Hex, RGB, and HSL conversions, transforms, WCAG 2.1 contrast calculation, and 24-bit Truecolor terminal rendering.*

```typescript
import { colorutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `hexToRgb(hex: string): RGB`: Converts hex string (`"#ff5733"`) to `{ r: 255, g: 87, b: 51 }`.
- `rgbToHex(rgb: RGB): string`: Converts `{ r, g, b }` to hex string.
- `rgbToHsl(rgb: RGB): HSL`: Converts RGB to `{ h, s, l }`.
- `hslToRgb(hsl: HSL): RGB`: Converts HSL to `{ r, g, b }`.
- `lighten(rgb: RGB, amount: number): RGB`: Lightens color by fraction (0..1).
- `darken(rgb: RGB, amount: number): RGB`: Darkens color by fraction (0..1).
- `luminance(rgb: RGB): number`: Relative luminance according to WCAG 2.1 ($0..1$).
- `contrastRatio(c1: RGB, c2: RGB): number`: Calculates contrast ratio ($1:1$ to $21:1$).
- `isAccessible(c1: RGB, c2: RGB, level: "AA" | "AAA" = "AA"): boolean`: Verifies WCAG accessibility compliance.
- `fgRgb(text: string, rgb: RGB): string`: Renders 24-bit Truecolor text foreground.
- `bgRgb(text: string, rgb: RGB): string`: Renders 24-bit Truecolor background.

#### Example
```typescript
const bg = colorutils.hexToRgb("#121212");
const fg = colorutils.hexToRgb("#0fb36a");
const ratio = colorutils.contrastRatio(bg, fg); // 7.42:1
const accessible = colorutils.isAccessible(bg, fg, "AAA"); // true
console.log(colorutils.fgRgb("Vibrant Emerald", fg));
```

---

### 20. `htmlutils`
*HTML entity escaping, tag stripping, link extraction, and lightweight DOM parsing.*

```typescript
import { htmlutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `escapeHtml(str: string): string`: Escapes `&`, `<`, `>`, `"`, and `'`.
- `unescapeHtml(str: string): string`: Restores escaped HTML entities.
- `stripTags(html: string): string`: Strips all HTML tags and returns clean text.
- `extractLinks(html: string): { href: string; text: string }[]`: Extracts all hyperlink tags and their anchor texts.
- `getElementById(html: string, id: string): { tag: string; attributes: Record<string, string>; innerHtml: string; outerHtml: string } | null`: Locates element by ID.
- `getElementsByTag(html: string, tag: string): { tag: string; attributes: Record<string, string>; innerHtml: string; outerHtml: string }[]`: Locates elements by HTML tag name.

#### Example
```typescript
const safe = htmlutils.escapeHtml("<script>alert('xss')</script>");
const text = htmlutils.stripTags("<p>Welcome to <b>Bun RAD</b></p>"); // "Welcome to Bun RAD"
const links = htmlutils.extractLinks('<a href="https://bun.sh">Bun Home</a>');
```

---

### 21. `diffutils`
*Line diff calculation, Git unified diff formatting, and ANSI colorized diff rendering.*

```typescript
import { diffutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `diffLines(oldText: string, newText: string): DiffChange[]`: Computes array of line changes with `type: "add" | "delete" | "same"`.
- `unifiedDiff(oldText: string, newText: string, filename = "file.txt"): string`: Generates standard Git-style unified diff (`--- a/file`, `+++ b/file`, `@@ -1,3 +1,3 @@`).
- `renderColoredDiff(diffText: string): string`: Formats unified diff with terminal green and red ANSI highlighting.

#### Example
```typescript
const oldCode = "const port = 3000;\nserver.listen(port);";
const newCode = "const port = 8080;\nserver.listen(port);";
const diff = diffutils.unifiedDiff(oldCode, newCode, "server.ts");
console.log(diffutils.renderColoredDiff(diff));
```

---

### 22. `sysutils`
*System telemetry, cross-platform clipboard read/write, safe execution, and temporary directory resolution.*

```typescript
import { sysutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `getSystemInfo(): SystemInfo`: Gathers platform, arch, cpuCount, totalMem, freeMem, uptime, hostname, and load average.
- `quoteArg(arg: string): string`: Safely quotes argument for shell invocation.
- `getHomeDir(): string`: Returns user home directory path.
- `getTempDir(): string`: Returns OS temporary directory path.
- `execSafe(cmd: string, args?: string[], options?: object): Promise<ShellExecResult>`: Runs subprocess with non-throwing exit status.
- `copyToClipboard(text: string): Promise<boolean>`: Copies text to the OS clipboard (pbcopy, xclip, clip).
- `readFromClipboard(): Promise<string>`: Reads text from the OS clipboard.

#### Example
```typescript
const info = sysutils.getSystemInfo();
console.log(`OS: ${info.platform} (${info.arch}) | Cores: ${info.cpuCount} | RAM: ${(info.totalMem / 1e9).toFixed(1)} GB`);

await sysutils.copyToClipboard("Token: bun-rad-2026");
const clip = await sysutils.readFromClipboard();
```

---

### 23. `cliutils`
*Terminal ANSI color utilities, Unicode sparklines, ASCII horizontal bar charts, gauges, progress bars, and tree hierarchies.*

```typescript
import { cliutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- ANSI text colors: `bold(s)`, `dim(s)`, `red(s)`, `green(s)`, `yellow(s)`, `blue(s)`, `magenta(s)`, `cyan(s)`, `gray(s)`.
- `stripAnsi(text: string): string`: Strips all ANSI escape sequences.
- `stringWidth(text: string): number`: Computes visual terminal display width (handling emojis and East Asian wide characters).
- `sliceAnsi(text: string, start: number, end?: number): string`: Slices string preserving ANSI styling.
- `wrapAnsi(text: string, columns: number): string`: Wraps text cleanly at column boundaries without breaking ANSI codes.
- `formatProgressBar(current: number, total: number, width = 30): string`: Renders ASCII progress bar (`[=======>    ] 65.0%`).
- `renderSparkline(values: number[]): string`: Renders 8-level Unicode sparkline (` ▂▃▅▆▇█`).
- `renderBarChart(items: BarChartItem[], maxWidth = 30): string`: Renders horizontal terminal bar chart.
- `renderGauge(value: number, min: number, max: number, width = 20): string`: Renders gauge dial widget.
- `renderTree(root: TreeNode): string`: Renders hierarchical directory or component tree with branch glyphs (`├──`, `└──`, `│`).

#### Example
```typescript
console.log(cliutils.formatProgressBar(75, 100)); // "[=======================>        ] 75.0%"
console.log(cliutils.renderSparkline([1, 4, 2, 8, 5, 10, 3])); // " ▃▂▆▄█▂"

console.log(cliutils.renderTree({
  name: "root",
  children: [
    { name: "src", children: [{ name: "index.ts" }] },
    { name: "package.json" },
  ],
}));
```

---

### 24. `envutils`
*Type-safe environment variable retrieval, `.env` file parser/loader, and variable expansion.*

```typescript
import { envutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `getStr(key: string, defaultVal = ""): string`: Retrieves string environment variable.
- `getInt(key: string, defaultVal = 0): number`: Retrieves integer environment variable.
- `getFloat(key: string, defaultVal = 0.0): number`: Retrieves float environment variable.
- `getBool(key: string, defaultVal = false): boolean`: Retrieves boolean (evaluates `"true"`, `"1"`, `"yes"`, `"on"`).
- `set(key: string, value: string | number | boolean): void`: Sets environment variable.
- `requireEnv(key: string): string`: Retrieves variable or throws if undefined.
- `parseEnvString(content: string): Record<string, string>`: Parses raw `.env` file string.
- `loadEnv(contentOrPath: string): Promise<Record<string, string>>`: Loads `.env` file into `process.env`.
- `expandVars(template: string, customEnv?: Record<string, string>): string`: Expands `${VAR}` expressions.

#### Example
```typescript
envutils.set("PORT", 8080);
const port = envutils.getInt("PORT", 3000); // 8080
const dbUrl = envutils.expandVars("postgres://${USER}@localhost:5432/${DB_NAME}");
```

---

### 25. `shellutils`
*Ergonomic subprocess execution, pipe chains, command quoting, and PATH discovery powered by `Bun.$` and `Bun.which`.*

```typescript
import { shellutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `whichCmd(cmd: string): string | null` (alias `which`): Discovers absolute binary path via `Bun.which`.
- `execCmd(command: string, options?: ShellOptions): Promise<ShellExecResult>`: Executes command string safely using `Bun.$`.
- `exec(cmdWithArgs: string[], options?: ShellOptions): Promise<ShellExecResult>`: Executes command with arguments array.
- `execLines(command: string): Promise<string[]>`: Executes command and returns array of stdout lines.
- `pipeCmds(cmd1: string, cmd2: string): Promise<ShellExecResult>`: Pipes output of `cmd1` into `cmd2`.
- `escapeArg(arg: string): string`: Escapes shell argument.

#### Example
```typescript
const gitHash = await shellutils.execCmd("git rev-parse --short HEAD");
if (gitHash.success) {
  console.log("Current commit:", gitHash.stdout.trim());
}

const bunBin = shellutils.which("bun"); // "/Users/.../.bun/bin/bun"
const files = await shellutils.execLines("ls -1");
```

---

### 26. `globutils`
*High-performance filesystem globbing powered by native `Bun.Glob`.*

```typescript
import { globutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `createGlob(pattern: string): Glob`: Instantiates native `new Bun.Glob(pattern)`.
- `globMatch(pattern: string, path: string): boolean`: Tests if path matches pattern.
- `globScan(pattern: string, options?: GlobScanOptions): Promise<string[]>`: Asynchronously scans directory for matching files.
- `globScanSync(pattern: string, options?: GlobScanOptions): string[]`: Synchronously scans directory for matching files.
- `findFiles(pattern: string, dir = "."): Promise<string[]>`: Finds files matching pattern.
- `hasMatch(pattern: string, dir = "."): Promise<boolean>`: Tests if any matching file exists.
- `glob`: Alias for `findFiles`.

#### Example
```typescript
const tsFiles = await globutils.globScan("**/*.ts", { cwd: "src" });
const isConfig = globutils.globMatch("*.config.{js,ts}", "app.config.ts"); // true
const hasTests = await globutils.hasMatch("**/*.test.ts"); // true
```

---

### 27. `transpileutils`
*In-memory TypeScript, TSX, and JSX transpilation, AST import/export scanning, and code evaluation powered by `Bun.Transpiler`.*

```typescript
import { transpileutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `transpileTs(source: string, options?: TranspileOptions): string`: Transpiles TS/TSX to JavaScript in-memory.
- `scanImports(source: string, loader = "ts"): { path: string; kind: string }[]`: Scans all imported modules without running code.
- `analyzeCode(source: string, loader = "ts"): CodeAnalysis`: Extracts both imports and exported symbol names.
- `stripTypes(source: string): string`: Removes TypeScript type annotations quickly.
- `evalTs<T = any>(source: string): T`: Evaluates TypeScript code in-memory and returns the result.

#### Example
```typescript
const js = transpileutils.transpileTs("const x: number = 42; export default x;");
const analysis = transpileutils.analyzeCode(`
  import { fileutils } from "./fileutils";
  export const version = "1.0.0";
`);
console.log(analysis.exports); // ["version"]
console.log(analysis.imports[0].path); // "./fileutils"

const sum = transpileutils.evalTs<number>("const a = 10; const b = 20; return a + b;"); // 30
```

---

### 28. `logutils`
*Structured, leveled logger with colored ANSI console and file sinks.*

```typescript
import { logutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `LogLevel`: Priority constants (`DEBUG: 0`, `INFO: 1`, `WARN: 2`, `ERROR: 3`, `FATAL: 4`).
- `class Logger`:
  - `constructor(options?: LoggerOptions)` (`level`, `name`, `logFile`, `json`)
  - `debug(msg: string, meta?: any): void`
  - `info(msg: string, meta?: any): void`
  - `warn(msg: string, meta?: any): void`
  - `error(msg: string, meta?: any): void`
- `newLogger(options?: LoggerOptions): Logger`: Factory helper.

#### Example
```typescript
const logger = logutils.newLogger({
  name: "API",
  level: logutils.LogLevel.DEBUG,
  json: false,
});

logger.info("Server started", { port: 8080 });
logger.error("Database connection lost", { retries: 3 });
```

---

### 29. `cronutils`
*Cron expression parser, date matcher, next run calculation, and human English translation.*

```typescript
import { cronutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `parseCron(expr: string): CronSchedule`: Validates and parses standard 5-field cron (`minute hour day month dayOfWeek`).
- `matchesCron(cron: CronSchedule, date = new Date()): boolean`: Tests if given date matches cron schedule.
- `nextCronRun(cron: CronSchedule, fromDate = new Date()): Date`: Calculates the next matching execution timestamp.
- `cronToHuman(expr: string): string`: Translates cron expression to plain English (`"*/15 * * * *"` $\to$ `"Every 15 minutes"`).

#### Example
```typescript
const schedule = cronutils.parseCron("0 0 * * *");
const nextMidnight = cronutils.nextCronRun(schedule);
const isNow = cronutils.matchesCron(schedule);
const human = cronutils.cronToHuman("*/10 * * * *"); // "Every 10 minutes"
```

---

### 30. `semverutils`
*Semantic Versioning 2.0.0 parser, comparator, range matcher, and version incrementer.*

```typescript
import { semverutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `parseSemver(version: string): SemVer`: Parses major, minor, patch, prerelease, and build metadata.
- `compareSemver(v1: string, v2: string): -1 | 0 | 1`: Compares precedence between two versions.
- `satisfiesRange(version: string, range: string): boolean`: Checks version against SemVer range (`^1.2.0`, `~2.0.0`, `>=1.0.0 <3.0.0`).
- `bumpVersion(version: string, type: "major" | "minor" | "patch"): string`: Increments version.

#### Example
```typescript
semverutils.compareSemver("1.2.3", "1.2.4"); // -1
semverutils.satisfiesRange("2.4.1", "^2.0.0"); // true
semverutils.bumpVersion("1.0.4", "minor");    // "1.1.0"
```

---

### 31. `netutils`
*Network discovery, local IP detection, public IP lookup, online status probe, and TCP latency ping.*

```typescript
import { netutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `getLocalIp(): string`: Returns primary local non-internal IPv4 address (`"192.168.1.5"`).
- `getPublicIp(timeoutMs = 3000): Promise<string | null>`: Queries public IP via lightweight probe.
- `isOnline(testHost = "1.1.1.1", port = 53, timeoutMs = 2000): Promise<boolean>`: Checks internet reachability.
- `tcpPing(host: string, port = 80, timeoutMs = 2000): Promise<number | null>`: Measures TCP connection latency in milliseconds.
- `resolveHost(hostname: string): Promise<string[]>`: Resolves DNS A records for a host.

#### Example
```typescript
const ip = netutils.getLocalIp(); // "192.168.1.71"
const online = await netutils.isOnline(); // true
const ping = await netutils.tcpPing("1.1.1.1", 443); // ~15ms
```

---

### 32. `httputils`
*Ergonomic HTTP client built on native `fetch` with automatic JSON parsing and exponential backoff retry.*

```typescript
import { httputils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `buildQuery(params: Record<string, any>): string`: Serializes object to URL query string (`"?q=bun&page=1"`).
- `parseQuery(queryString: string): Record<string, string>`: Parses query string into dictionary.
- `fetchWithRetry(url: string, init?: RequestInit, maxRetries = 3, backoffMs = 200): Promise<Response>`: Executes fetch with automatic retry.
- `getJson<T>(url: string, headers?: Record<string, string>): Promise<T>`: Performs GET and returns parsed JSON.
- `postJson<T, R = any>(url: string, body: T, headers?: Record<string, string>): Promise<R>`: Sends JSON payload via POST.
- `putJson<T, R = any>(url: string, body: T, headers?: Record<string, string>): Promise<R>`: Sends JSON payload via PUT.
- `deleteJson<R = any>(url: string, headers?: Record<string, string>): Promise<R>`: Sends DELETE request.
- `getText(url: string, headers?: Record<string, string>): Promise<string>`: Fetches raw text.

#### Example
```typescript
const query = httputils.buildQuery({ search: "bun", limit: 10 });
const data = await httputils.getJson<{ title: string }>(`https://api.example.com/items${query}`);
```

---

### 33. `serverutils`
*Micro HTTP router, static file directory host, and WebSocket pub/sub messaging hub powered by `Bun.serve`.*

```typescript
import { serverutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `createRouter(): HttpRouter`: Creates routing table with `.get()`, `.post()`, `.put()`, `.delete()`, and `.handle(req, server)`.
- `serveHttp(options?: ServeOptions): ServerInstance`: Starts an HTTP server returning `{ url, port, stop() }`.
- `serveStatic(options: StaticServerOptions): ServerInstance`: Hosts static directory with MIME mapping and SPA fallback.
- `createWsHub(options?: WsHubOptions): WebSocketHub`: Pub/sub hub with `.broadcast(topic, data)` and lifecycle listeners.

#### Example
```typescript
const router = serverutils.createRouter();
router.get("/api/health", () => new Response(JSON.stringify({ status: "ok" })));
router.post("/api/echo", async (req) => new Response(await req.text()));

const server = serverutils.serveHttp({ router, port: 8080 });
console.log(`Listening on ${server.url}`);

// Stop when done
server.stop();
```

---

### 34. `urlutils`
*RFC 3986 URL parsing, path segment joining, and credential sanitization for logs.*

```typescript
import { urlutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `parseUrl(urlStr: string): ParsedUrl`: Deconstructs URL into protocol, host, port, path, query dictionary, and hash.
- `joinUrl(base: string, ...segments: string[]): string`: Safely joins URL segments without double slashes.
- `redactCredentials(urlStr: string): string`: Redacts passwords in database connection strings and basic auth URLs for secure logging.

#### Example
```typescript
const cleanUrl = urlutils.joinUrl("https://api.dev", "v1", "users", "101");
const safeLog = urlutils.redactCredentials("postgres://admin:supersecret@db.internal:5432/main");
// => "postgres://admin:***@db.internal:5432/main"
```

---

### 35. `jwtutils`
*Zero-dependency JSON Web Token signing and verification using HMAC-SHA256 and WebCrypto.*

```typescript
import { jwtutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `signJwt(payload: Record<string, any>, secret: string, expiresInSeconds = 3600): string`: Signs HS256 JWT with `iat` and `exp`.
- `verifyJwt<T = Record<string, any>>(token: string, secret: string): T`: Validates signature and expiration; returns claims.
- `decodeJwtUnverified<T = Record<string, any>>(token: string): T`: Extracts payload without verifying signature.

#### Example
```typescript
const token = jwtutils.signJwt({ sub: "user_42", role: "admin" }, "supersecret", 3600);
const claims = jwtutils.verifyJwt<{ sub: string; role: string }>(token, "supersecret");
console.log(claims.sub); // "user_42"
```

---

### 36. `cryptoutils`
*Cryptographic hashing, HMAC, Base64/Base64URL, UUID v4/v7, tokens, and native password hashing via `Bun.password`.*

```typescript
import { cryptoutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `sha256(data: string | Uint8Array): string`: Computes SHA-256 hex digest.
- `sha512(data: string | Uint8Array): string`: Computes SHA-512 hex digest.
- `md5(data: string | Uint8Array): string`: Computes MD5 hex digest.
- `hmacSha256(data: string | Uint8Array, secret: string): string`: Computes HMAC-SHA256 hex digest.
- `base64Encode(data: string | Uint8Array): string`: Standard Base64 encoder.
- `base64Decode(str: string): string`: Standard Base64 decoder.
- `base64UrlEncode(data: string | Uint8Array): string`: URL-safe Base64 encoder.
- `base64UrlDecode(str: string): string`: URL-safe Base64 decoder.
- `uuidV4(): string`: Generates cryptographically secure RFC 4122 UUID v4.
- `uuidV7(): string`: Generates time-ordered UUID v7.
- `randomToken(length = 32): string`: Generates hex security token.
- `hashPassword(password: string): Promise<string>`: Hashes password using native `Bun.password.hash` (Argon2id/Bcrypt).
- `verifyPassword(password: string, hash: string): Promise<boolean>`: Verifies password against hash using `Bun.password.verify`.

#### Example
```typescript
const hash = cryptoutils.sha256("bun");
const id = cryptoutils.uuidV7(); // Time-sortable UUID
const token = cryptoutils.randomToken(16);

// Native Password Hashing
const passHash = await cryptoutils.hashPassword("SuperSecret123!");
const valid = await cryptoutils.verifyPassword("SuperSecret123!", passHash); // true
```

---

### 37. `hashutils`
*Ultrafast 64-bit non-cryptographic hashing algorithms powered by `Bun.hash` and in-memory Bloom filter.*

```typescript
import { hashutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `wyhash(data: string | Uint8Array, seed?: number | bigint): bigint`: Ultrafast 64-bit `wyhash`.
- `crc32(data: string | Uint8Array): number`: Standard 32-bit CRC.
- `adler32(data: string | Uint8Array): number`: 32-bit Adler checksum.
- `cityHash64(data: string | Uint8Array, seed?: number | bigint): bigint`: Google CityHash 64-bit.
- `cityHash32(data: string | Uint8Array): number`: Google CityHash 32-bit.
- `murmur32v3(data: string | Uint8Array, seed?: number): number`: MurmurHash3 32-bit.
- `murmur64v2(data: string | Uint8Array, seed?: number | bigint): bigint`: MurmurHash2 64-bit.
- `rapidhash(data: string | Uint8Array, seed?: number | bigint): bigint`: High-performance `rapidhash`.
- `hashHex(data: string | Uint8Array, algo = "wyhash"): string`: Returns hash formatted as hex string.
- `createBloomFilter(expectedItems = 1000, falsePositiveRate = 0.01): BloomFilter`: In-memory Bloom filter with `.add(item)` and `.has(item)`.

#### Example
```typescript
const hashVal = hashutils.wyhash("instant-seed");
const hex = hashutils.hashHex("speed-of-light", "rapidhash");

const bloom = hashutils.createBloomFilter(50000, 0.01);
bloom.add("user:1001");
console.log(bloom.has("user:1001")); // true
console.log(bloom.has("user:9999")); // false
```

---

### 38. `asyncutils`
*Bounded concurrency mapping, Go-style `WaitGroup`, promise timeouts, and async `WorkerPool`.*

```typescript
import { asyncutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `parallelMap<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]>`: Concurrent mapper preserving index order.
- `parallelFilter<T>(items: T[], concurrency: number, predicate: (item: T) => Promise<boolean>): Promise<T[]>`: Concurrent filtering.
- `parallelEach<T>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<void>): Promise<void>`: Concurrent execution.
- `createWaitGroup(): WaitGroup`: Go-style synchronization barrier with `.add(delta?)`, `.done()`, and `.wait()`.
- `timeoutPromise<T>(promise: Promise<T>, ms: number, errorMsg?: string): Promise<T>`: Rejects if promise exceeds duration.
- `class WorkerPool`: Bounded task execution queue with `.run(task)`, `.waitAll()`, `.running`, `.queue`.

#### Example
```typescript
const urls = ["https://a.com", "https://b.com", "https://c.com"];
const results = await asyncutils.parallelMap(urls, 2, async (url) => {
  const res = await fetch(url);
  return res.status;
});

// WaitGroup
const wg = asyncutils.createWaitGroup();
wg.add(2);
setTimeout(() => wg.done(), 50);
setTimeout(() => wg.done(), 100);
await wg.wait();
```

---

### 39. `flowutils`
*Traffic management and resilience: Token Bucket rate limiter, 3-state circuit breaker, exponential backoff retry, debounce, and throttle.*

```typescript
import { flowutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `class RateLimiter`: Token Bucket algorithm.
  - `constructor(capacity: number, refillRatePerSec: number)`
  - `allow(count = 1): boolean`: Non-blocking check whether tokens are available.
  - `wait(count = 1): Promise<void>`: Waits until required tokens have accumulated.
- `class CircuitBreaker`: 3-state circuit breaker (`CLOSED`, `OPEN`, `HALF_OPEN`).
  - `constructor(failureThreshold = 5, resetTimeoutMs = 10_000)`
  - `canExecute(): boolean`
  - `recordSuccess(): void`
  - `recordFailure(): void`
  - `getState(): CircuitState`
- `retry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 100, multiplier = 2.0, maxDelayMs = 5000): Promise<T>`: Retries async operation with exponential backoff.
- `debounce<T>(fn: T, waitMs: number): T`: Debounces execution.
- `throttle<T>(fn: T, intervalMs: number): T`: Throttles execution rate.

#### Example
```typescript
const limiter = new flowutils.RateLimiter(10, 5); // 10 bucket capacity, 5 tokens/sec
if (limiter.allow(1)) {
  // Process request
}

const data = await flowutils.retry(
  async () => {
    return await fetch("https://flaky-service.internal/api").then((r) => r.json());
  },
  3,
  200
);
```

---

### 40. `fnutils`
*Functional programming primitives inspired by `es-toolkit`: composition, memoization, partials, and timing control.*

```typescript
import { fnutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `once<T>(fn: T): T`: Guarantees function executes only on the first call.
- `memoize<T>(fn: T, keyResolver?: (...args) => string): T & { cache: Map<string, any> }`: Memoizes results with O(1) lookups.
- `negate<T>(predicate: T): T`: Inverts boolean predicate.
- `partial<T>(fn: T, ...presetArgs: any[]): (...remainingArgs) => ReturnType<T>`: Partially applies arguments.
- `before<T>(n: number, fn: T): T`: Allows at most $n-1$ calls before returning the last result.
- `after<T>(n: number, fn: T): T`: Only executes once called at least $n$ times.
- `debounce<T>(fn: T, waitMs: number): ((...args) => void) & { cancel(): void }`: Debounce helper with cancel.
- `throttle<T>(fn: T, waitMs: number): ((...args) => void) & { cancel(): void }`: Throttle helper with cancel.
- `identity<T>(value: T): T`: Returns unchanged argument.
- `noop(): void`: Empty no-op function.
- `times<T>(n: number, iteratee: (index: number) => T): T[]`: Invokes iteratee $n$ times and collects return values.
- `delay(ms: number): Promise<void>`: Resolves after specified milliseconds.
- `pipe<T>(initialValue: T, ...fns: ((val: any) => any)[]): any`: Left-to-right function composition pipeline.

#### Example
```typescript
// Memoization
const fib = fnutils.memoize((n: number): number => (n <= 1 ? n : fib(n - 1) + fib(n - 2)));

// Left-to-Right Pipeline
const result = fnutils.pipe(
  "  bun rad suite  ",
  (s: string) => s.trim(),
  (s: string) => s.toUpperCase(),
  (s: string) => `[${s}]`
); // "[BUN RAD SUITE]"
```

---

### 41. `eventutils`
*In-memory event dispatcher supporting multi-listener subscriptions, one-time handlers, and unsubscribing.*

```typescript
import { eventutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `class EventEmitter`:
  - `on(event: string, listener: EventListener): void`: Subscribes listener.
  - `once(event: string, listener: EventListener): void`: Subscribes listener for one trigger only.
  - `off(event: string, listener: EventListener): void`: Unsubscribes listener.
  - `emit(event: string, ...args: any[]): void`: Broadcasts event to all listeners.
  - `listenerCount(event: string): number`: Returns listener count.
  - `removeAllListeners(event?: string): void`: Removes all listeners.
- `newEmitter(): EventEmitter`: Factory helper.

#### Example
```typescript
const emitter = eventutils.newEmitter();
emitter.on("user:login", (user) => console.log(`Welcome ${user.name}`));
emitter.emit("user:login", { name: "Alice" });
```

---

### 42. `validutils`
*High-speed regex and structural validation for common enterprise data formats.*

```typescript
import { validutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `isEmail(str: string): boolean`: Validates standard email address.
- `isUrl(str: string): boolean`: Validates HTTP/HTTPS URL.
- `isIpv4(str: string): boolean`: Validates IPv4 address string.
- `isIpv6(str: string): boolean`: Validates IPv6 address string.
- `isPhone(str: string): boolean`: Validates phone format.
- `isAlphanumeric(str: string): boolean`: Checks if string contains only letters and numbers.
- `inRange(val: number, min: number, max: number): boolean`: Checks if number is between min and max inclusive.
- `isUuid(str: string): boolean`: Validates RFC UUID string.
- `isJson(str: string): boolean`: Tests if string is valid JSON without throwing.

#### Example
```typescript
validutils.isEmail("team@bun.sh"); // true
validutils.isIpv4("192.168.1.1");  // true
validutils.isJson('{"ready":true}'); // true
```

---

### 43. `mockutils`
*Synthetic test fixtures: realistic users, emails, phone numbers, IP addresses, URLs, and lorem ipsum text.*

```typescript
import { mockutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `mockUser(): MockUser`: Returns realistic mock user (`{ id, name, email, phone, address, role, createdAt }`).
- `mockUsers(count: number): MockUser[]`: Generates an array of unique mock users.
- `mockEmail(name?: string): string`: Returns mock email address.
- `mockPhone(): string`: Returns realistic US phone number.
- `mockIpv4(): string`: Returns random public IPv4 address.
- `mockUrl(): string`: Returns realistic URL.
- `loremWords(count: number): string`: Generates Latin lorem words.
- `loremText(paragraphs = 1, minSentences = 3, maxSentences = 6): string`: Generates formatted paragraphs.

#### Example
```typescript
const testUser = mockutils.mockUser();
const team = mockutils.mockUsers(5);
const dummyText = mockutils.loremText(2);
```

---

### 44. `timeutils`
*Relative time formatting ("2 hours ago"), ISO conversion, calendar boundaries, and high-resolution Stopwatch.*

```typescript
import { timeutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `timeAgo(input: Date | number | string, now = new Date()): string`: Human-friendly relative time (`"just now"`, `"5 minutes ago"`, `"in 2 days"`).
- `formatIso(date = new Date()): string`: Formats date to standard ISO 8601 string.
- `parseIso(isoStr: string): Date`: Parses ISO 8601 string to Date.
- `startOfDay(date = new Date()): Date`: Sets time to 00:00:00.000.
- `endOfDay(date = new Date()): Date`: Sets time to 23:59:59.999.
- `startOfMonth(date = new Date()): Date`: Returns first day of month.
- `endOfMonth(date = new Date()): Date`: Returns last day of month.
- `addDays(date: Date, days: number): Date`: Date arithmetic.
- `diffDays(d1: Date, d2: Date): number`: Calendar day difference between dates.
- `nanoseconds(): number`: High-resolution monotonic timestamp in nanoseconds powered by native `Bun.nanoseconds()`.
- `createStopwatch(): Stopwatch`: High-resolution stopwatch using `performance.now()`.
  - `start(): void`
  - `stop(): number`: Returns elapsed milliseconds.
  - `elapsedMs(): number`: Returns current elapsed milliseconds without stopping.
  - `elapsedSeconds(): number`: Returns elapsed seconds.
  - `reset(): void`

#### Example
```typescript
const past = new Date(Date.now() - 3600 * 1000 * 4);
console.log(timeutils.timeAgo(past)); // "4 hours ago"

const sw = timeutils.createStopwatch();
sw.start();
// ... run benchmark ...
console.log(`Execution time: ${sw.stop().toFixed(2)} ms`);
```

---

## ⚡ Quick Start Interactive Tooling & CLI

Bun System Utilities ships with dedicated CLI runners and comprehensive interactive showcases so you can test, benchmark, and explore every single utility:

```bash
# ⚡ 1. Interactive 44-Module Benchmark Dashboard
bun run rad
# or: bun run index.ts rad

# 📚 2. End-to-End Dual Cookbook (10 CLI Tools + 44 RAD Modules)
bun run rad:cookbook
# or: bun run examples/rad_cookbook.ts

# 🧪 3. Run Full Test Suite
bun test
# or: bun test src/features/rad/rad.test.ts
```
