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

// Option 3: Import from top-level studio entry
import { rad, fileutils } from "./src/index.ts";
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
*Asynchronous, non-blocking file, line, JSON, CSV, and directory operations.*

```typescript
import { fileutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `ensureDir(dirPath: string): Promise<void>`: Recursively creates directories if they do not exist.
- `fileSizeHuman(bytesOrPath: number | string): Promise<string>`: Converts bytes or file path into human-readable string (`"1.5 MB"`, `"450.0 KB"`).
- `saveJson(filePath: string, data: unknown, pretty = true): Promise<void>`: Writes data to formatted JSON file atomically.
- `loadJson<T>(filePath: string, fallback?: T): Promise<T>`: Reads and parses JSON file; returns fallback if missing.
- `readLines(filePath: string): Promise<string[]>`: Reads file into an array of string lines.
- `writeLines(filePath: string, lines: string[]): Promise<void>`: Writes an array of lines to file.
- `appendLine(filePath: string, line: string): Promise<void>`: Appends a single line to the end of a file.
- `copyFile(src: string, dest: string): Promise<void>`: Copies a file asynchronously.
- `moveFile(src: string, dest: string): Promise<void>`: Moves or renames a file asynchronously.
- `parseCsvString(csvText: string, delimiter = ","): string[][]`: Parses CSV string (including quotes and commas) into a 2D array.
- `formatCsvString(rows: string[][], delimiter = ","): string`: Formats a 2D array into valid CSV string with escaping.
- `readCsv(filePath: string, delimiter = ","): Promise<string[][]>`: Reads and parses a CSV file.
- `writeCsv(filePath: string, rows: string[][], delimiter = ","): Promise<void>`: Writes a 2D array to a CSV file.
- `walkFiles(dirPath: string, filter?: (path: string) => boolean): Promise<string[]>`: Recursively scans a directory for files matching an optional filter.

#### Example
```typescript
await fileutils.ensureDir("data/reports");
await fileutils.saveJson("data/reports/summary.json", { status: "ready", count: 42 });
const summary = await fileutils.loadJson("data/reports/summary.json");
const size = await fileutils.fileSizeHuman("data/reports/summary.json");

const csv = [["Name", "Role"], ["Alice", "Lead"], ["Bob", "Engineer"]];
await fileutils.writeCsv("data/reports/team.csv", csv);
const files = await fileutils.walkFiles("data", (f) => f.endsWith(".csv"));
```

---

### 2. `sqliteutils`
*Embedded SQLite database utility powered by `bun:sqlite` with WAL mode, KV store, JSON documents, CRUD, migrations, and FTS5 search.*

```typescript
import { sqliteutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `openDb(path = ":memory:", pragmaWal = true): Database`: Opens an SQLite database with WAL mode and 64MB cache.
- `closeDb(db: Database): void`: Closes database connection cleanly.
- `execSql(db: Database, sql: string, params?: any[]): void`: Executes arbitrary SQL statements with parameter binding.
- `createKvTable(db: Database, table = "kv_store"): void`: Creates a key-value store table (`key TEXT PRIMARY KEY, val TEXT, updated_at TEXT`).
- `setKv(db: Database, table: string, key: string, value: unknown): void`: Inserts or replaces a key-value entry.
- `getKv(db: Database, table: string, key: string): string | null`: Retrieves string value by key.
- `getKvOr<T>(db: Database, table: string, key: string, fallback: T): T`: Retrieves value or returns fallback if absent.
- `deleteKv(db: Database, table: string, key: string): boolean`: Deletes a key from the KV table.
- `listKv(db: Database, table: string): Record<string, string>`: Returns all key-value entries as an object.
- `createJsonStore(db: Database, table = "json_store"): void`: Creates a document store table (`id TEXT PRIMARY KEY, doc TEXT, updated_at TEXT`).
- `saveDoc<T>(db: Database, table: string, id: string, doc: T): void`: Saves JSON document by ID.
- `loadDoc<T>(db: Database, table: string, id: string): T | null`: Loads parsed JSON document by ID.
- `deleteDoc(db: Database, table: string, id: string): boolean`: Removes document by ID.
- `listDocs<T>(db: Database, table: string): { id: string; doc: T; updatedAt: string }[]`: Lists all documents.
- `insertRow(db: Database, table: string, record: Record<string, any>): number`: Inserts record and returns last insert row ID.
- `selectRows<T>(db: Database, table: string, columns = ["*"], whereClause?: string, params?: any[]): T[]`: Queries rows with parameterized conditions.
- `updateRows(db: Database, table: string, updates: Record<string, any>, whereClause?: string, params?: any[]): number`: Updates rows matching criteria.
- `deleteRows(db: Database, table: string, whereClause?: string, params?: any[]): number`: Deletes rows matching criteria.
- `runMigrations(db: Database, migrations: SqlMigration[]): number`: Runs versioned schema migrations sequentially in a transaction.
- `createFtsTable(db: Database, table: string, columns: string[]): void`: Creates an FTS5 full-text search table.
- `indexFts(db: Database, table: string, row: Record<string, string>): void`: Indexes a document into FTS5.
- `searchFts<T>(db: Database, table: string, query: string, limit = 50): T[]`: Executes full-text search query.
- `vacuumDb(db: Database): void`: Vacuums and compacts database file.
- `checkpointWal(db: Database): void`: Checkpoints the WAL journal to main database file.

#### Example
```typescript
const db = sqliteutils.openDb("app.db");

// KV Store
sqliteutils.createKvTable(db, "settings");
sqliteutils.setKv(db, "settings", "theme", "monokai_pro");
const theme = sqliteutils.getKv(db, "settings", "theme");

// Full-Text Search
sqliteutils.createFtsTable(db, "articles", ["title", "content"]);
sqliteutils.indexFts(db, "articles", { title: "Bun Speed", content: "Bun standard library is fast" });
const hits = sqliteutils.searchFts(db, "articles", "fast");

sqliteutils.closeDb(db);
```

---

### 3. `tomlutils`
*High-performance TOML parsing and serialization powered by native `Bun.TOML` with typed deep path getters.*

```typescript
import { tomlutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `parseToml<T = Record<string, any>>(content: string): T`: Parses TOML string using native `Bun.TOML.parse`.
- `stringifyToml(data: unknown): string`: Serializes a JavaScript object into formatted TOML string.
- `loadToml<T = Record<string, any>>(filePath: string, fallback?: T): Promise<T>`: Asynchronously loads and parses a TOML file.
- `saveToml(filePath: string, data: unknown): Promise<number>`: Serializes data and writes to a TOML file.
- `getString(doc: Record<string, any>, keyPath: string, fallback = ""): string`: Extracts string by dotted path.
- `getInt(doc: Record<string, any>, keyPath: string, fallback = 0): number`: Extracts integer by dotted path.
- `getBool(doc: Record<string, any>, keyPath: string, fallback = false): boolean`: Extracts boolean by dotted path.
- `getArray<T>(doc: Record<string, any>, keyPath: string, fallback = []): T[]`: Extracts array by dotted path.

#### Example
```typescript
const config = tomlutils.parseToml(`
[server]
port = 8080
enabled = true
cors_origins = ["http://localhost:3000", "https://app.dev"]
`);

const port = tomlutils.getInt(config, "server.port", 3000); // 8080
const origins = tomlutils.getArray<string>(config, "server.cors_origins"); // ["http://localhost:3000", ...]
```

---

### 4. `archiveutils`
*Pure JavaScript and Deflate-based ZIP archive creator, extractor, and inspector without third-party dependencies.*

```typescript
import { archiveutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `zipFiles(entries: ZipEntryInput[]): Uint8Array`: Creates a standard PKZIP binary buffer from an array of files/buffers.
- `listZipEntries(zipDataOrPath: Uint8Array | string): Promise<string[]>`: Lists file names contained within a ZIP archive.
- `readZipEntry(zipDataOrPath: Uint8Array | string, entryName: string): Promise<Uint8Array | null>`: Extracts a single entry from a ZIP archive.
- `unzipToDir(zipDataOrPath: Uint8Array | string, destDir: string): Promise<void>`: Unpacks all files in a ZIP archive into a destination directory.
- `zipFile(srcPath: string, destZipPath: string): Promise<void>`: Compresses a single file into a ZIP archive on disk.
- `zipDir(srcDir: string, destZipPath: string): Promise<void>`: Recursively compresses an entire directory into a ZIP archive.

#### Example
```typescript
// Create ZIP in memory
const zipBytes = archiveutils.zipFiles([
  { name: "readme.txt", data: "Bun RAD Suite" },
  { name: "config.json", data: JSON.stringify({ active: true }) },
]);

// Inspect & Unzip
const entries = await archiveutils.listZipEntries(zipBytes); // ["readme.txt", "config.json"]
await archiveutils.unzipToDir(zipBytes, "./extracted");
```

---

### 5. `compressutils`
*High-velocity Gzip and Deflate compression and decompression using native Web `CompressionStream` and `DecompressionStream`.*

```typescript
import { compressutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `gzipCompress(data: string | Uint8Array): Uint8Array`: Compresses data into Gzip binary format.
- `gzipDecompress(data: Uint8Array): Uint8Array`: Decompresses Gzip binary buffer.
- `gzipCompressString(str: string): string`: Compresses a string and encodes it as Base64.
- `gzipDecompressString(base64Str: string): string`: Decompresses Base64 Gzip string back to UTF-8 text.
- `deflateCompress(data: string | Uint8Array): Uint8Array`: Compresses data using raw Deflate.
- `deflateDecompress(data: Uint8Array): Uint8Array`: Decompresses raw Deflate bytes.
- `compressionRatio(uncompressedLen: number, compressedLen: number): number`: Calculates percentage saved (`62.4`%).

#### Example
```typescript
const original = "Rapid Application Development with Bun 2026!";
const compressed = compressutils.gzipCompressString(original);
const restored = compressutils.gzipDecompressString(compressed); // "Rapid Application Development with Bun 2026!"
const ratio = compressutils.compressionRatio(original.length, compressed.length);
```

---

### 6. `tarutils`
*POSIX UStar standard TAR archive packer and unpacker for streams and files.*

```typescript
import { tarutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `packTarBytes(entries: TarEntry[]): Uint8Array`: Packs memory entries into standard UStar 512-byte block TAR binary.
- `unpackTarBytes(bytes: Uint8Array): UnpackedTarEntry[]`: Unpacks TAR binary into file entries with names and byte contents.
- `createTarFile(srcDir: string, destTarPath: string): Promise<void>`: Archives a directory into a `.tar` file.
- `extractTarFile(tarPath: string, destDir: string): Promise<void>`: Extracts a `.tar` file into a directory.

#### Example
```typescript
const tarBytes = tarutils.packTarBytes([
  { name: "package.json", data: '{"name": "demo"}' },
  { name: "index.ts", data: 'console.log("hello");' },
]);
const unpacked = tarutils.unpackTarBytes(tarBytes);
console.log(unpacked[0].name); // "package.json"
```

---

### 7. `stateutils`
*Managed persistent application state container with atomic file writes, auto-saving, rollback, and cross-platform config dir resolution.*

```typescript
import { stateutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `resolveConfigDir(appName: string): string`: Returns standard OS config directory (`~/Library/Application Support/appName`, `~/.config/appName`, `%APPDATA%/appName`).
- `class AppStateStore<T>`: Reactive state store.
  - `get(): T`: Returns current state snapshot.
  - `set(updates: Partial<T>): void`: Merges partial state updates and triggers auto-save if enabled.
  - `save(): Promise<void>`: Flushes state to disk atomically.
  - `load(): Promise<T>`: Reloads state from disk.
  - `rollback(): void`: Restores state to the previous snapshot before the last `set`.
  - `reset(): void`: Resets state to default initialization values.
- `class KeyValueState`: Key-value persistence map.
  - `init(): Promise<void>`: Initializes storage file.
  - `get<T>(key: string, fallback: T): T`: Gets typed value.
  - `set(key: string, value: any): Promise<void>`: Sets key-value pair and persists.
  - `delete(key: string): Promise<void>`: Removes key.
  - `all(): Record<string, any>`: Returns all key-value entries.

#### Example
```typescript
interface UserSettings { theme: string; sidebarOpen: boolean; }
const store = new stateutils.AppStateStore<UserSettings>("my_app", {
  theme: "dark",
  sidebarOpen: true,
});

store.set({ theme: "win11_slate" });
console.log(store.get().theme); // "win11_slate"
store.rollback();
console.log(store.get().theme); // "dark"
```

---

### 8. `cacheutils`
*In-memory high-throughput O(1) LRU and TTL caches.*

```typescript
import { cacheutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `class LRUCache<K, V>`: Least Recently Used eviction cache.
  - `constructor(capacity: number)`
  - `get(key: K): V | undefined`: Retrieves value and marks entry as most recently used.
  - `set(key: K, value: V): void`: Stores value, evicting the oldest key if capacity exceeded.
  - `has(key: K): boolean`: Checks key presence.
  - `delete(key: K): boolean`: Removes key.
  - `clear(): void`: Clears all entries.
  - `size(): number`: Current number of items.
- `class TTLCache<K, V>`: Time-To-Live auto-expiration cache.
  - `constructor(defaultTtlMs = 60_000)`
  - `get(key: K): V | undefined`: Retrieves unexpired item.
  - `set(key: K, value: V, ttlMs?: number): void`: Sets item with custom or default TTL.
  - `has(key: K): boolean`: Checks whether unexpired key exists.
  - `delete(key: K): boolean`: Removes key.
  - `clear(): void`: Clears cache.
  - `size(): number`: Count of unexpired items.

#### Example
```typescript
const lru = new cacheutils.LRUCache<string, object>(100);
lru.set("user:101", { name: "Alice" });
const user = lru.get("user:101");

const ttl = new cacheutils.TTLCache<string, string>(5000); // 5 sec TTL
ttl.set("auth_token", "xyz_123");
```

---

### 9. `arrutils` & `sliceutils`
*Modern collection and array utilities inspired by `es-toolkit` with negative indexing and functional transformations.*

```typescript
import { arrutils, sliceutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `at<T>(arr: readonly T[], index: number): T | undefined`: Safe element retrieval supporting negative indices (`-1` = last).
- `compact<T>(arr: readonly (T | falsy)[]): T[]`: Filters out `0`, `""`, `false`, `null`, and `undefined`.
- `unique<T>(arr: readonly T[], keyFn?: (item: T) => any): T[]` (alias `uniqBy`): De-duplicates elements.
- `chunk<T>(arr: readonly T[], size: number): T[][]`: Splits array into chunks of specified length.
- `flatten<T>(arr: readonly (T | readonly T[])[]): T[]`: Flattens 2D arrays into 1D.
- `partition<T>(arr: readonly T[], predicate: (item: T) => boolean): [T[], T[]]`: Splits into `[truthy, falsy]`.
- `intersection<T>(a: readonly T[], b: readonly T[]): T[]`: Computes set intersection.
- `difference<T>(a: readonly T[], b: readonly T[]): T[]`: Computes elements in `a` not in `b`.
- `drop<T>(arr: readonly T[], count = 1): T[]` / `dropRight<T>(arr, count = 1)`: Drops elements from left or right.
- `dropWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[]` / `dropRightWhile<T>(arr, predicate)`
- `take<T>(arr: readonly T[], count = 1): T[]` / `takeRight<T>(arr, count = 1)`: Takes elements from left or right.
- `takeWhile<T>(arr: readonly T[], predicate: (item: T) => boolean): T[]` / `takeRightWhile<T>(arr, predicate)`
- `keyBy<T, K>(arr: readonly T[], keyFn: (item: T) => K): Record<K, T>`: Indexes array items into a dictionary.
- `countBy<T, K>(arr: readonly T[], keyFn: (item: T) => K): Record<K, number>`: Counts occurrences grouped by key.
- `minBy<T>(arr: readonly T[], fn: (item: T) => number): T | undefined`: Finds item with minimum metric.
- `maxBy<T>(arr: readonly T[], fn: (item: T) => number): T | undefined`: Finds item with maximum metric.
- `sumBy<T>(arr: readonly T[], fn: (item: T) => number): number`: Computes total sum by metric.
- `zip<T, U>(a: readonly T[], b: readonly U[]): [T, U][]`: Combines elements into tuple pairs.
- `unzip<T, U>(pairs: readonly [T, U][]): [T[], U[]]`: Decomposes tuple pairs into two arrays.
- `shuffle<T>(arr: readonly T[]): T[]`: Unbiased Fisher-Yates array shuffle.
- `sample<T>(arr: readonly T[], count = 1): T[]` (alias `sampleSize`): Picks random sample of elements.
- `groupBy<T, K>(arr: readonly T[], keyFn: (item: T) => K): Record<K, T[]>`: Groups elements into dictionary of arrays.
- `sortBy<T>(arr: readonly T[], keyFn: (item: T) => number | string | Date, direction = "asc"): T[]`: Sorts elements.
- `frequency<T>(arr: readonly T[]): Record<T, number>`: Tallies frequency table of primitive items.
- `tail<T>(arr: readonly T[]): T[]`: Returns all elements except the first.
- `without<T>(arr: readonly T[], ...values: T[]): T[]`: Filters out specified values.
- `zipObject<K, V>(keys: readonly K[], values: readonly V[]): Record<K, V>`: Creates object from separate key and value arrays.

#### Example
```typescript
const items = ["alpha", "beta", "gamma", "delta"];
const last = arrutils.at(items, -1); // "delta"
const chunks = arrutils.chunk(items, 2); // [["alpha", "beta"], ["gamma", "delta"]]

const users = [
  { id: "u1", name: "Alice", dept: "Eng" },
  { id: "u2", name: "Bob", dept: "Eng" },
  { id: "u3", name: "Charlie", dept: "HR" },
];
const byDept = arrutils.groupBy(users, (u) => u.dept); // { Eng: [...], HR: [...] }
const deptCounts = arrutils.countBy(users, (u) => u.dept); // { Eng: 2, HR: 1 }
```

---

### 10. `objutils`
*Deep path traversal, structural comparison, immutability, and transformation utilities.*

```typescript
import { objutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `isNil(val: unknown): val is null | undefined`: Checks if value is null or undefined.
- `isPlainObject(val: unknown): val is Record<string, any>`: Checks if value is an Object literal.
- `isEqual(a: unknown, b: unknown): boolean`: Deep recursive structural equality check.
- `isEmpty(val: unknown): boolean`: Checks if object, array, set, map, or string is empty.
- `toPath(path: string | readonly (string | number)[]): (string | number)[]`: Normalizes dotted and bracketed paths.
- `get<T>(obj: unknown, path: string | pathArray, defaultValue?: T): T | undefined`: Safely gets nested value.
- `has(obj: unknown, path: string | pathArray): boolean`: Tests whether nested path exists.
- `set<T>(obj: T, path: string | pathArray, value: any): T`: Sets value at nested path, creating intermediate objects.
- `unset(obj: any, path: string | pathArray): boolean`: Removes nested property.
- `pick<T, K>(obj: T, keys: readonly K[]): Pick<T, K>`: Creates object composed of picked keys.
- `pickBy<T>(obj: T, predicate: (val, key) => boolean): Partial<T>`: Picks properties satisfying predicate.
- `omit<T, K>(obj: T, keys: readonly K[]): Omit<T, K>`: Creates object without specified keys.
- `omitBy<T>(obj: T, predicate: (val, key) => boolean): Partial<T>`: Omits properties satisfying predicate.
- `findKey<T>(obj: T, predicate: (val, key) => boolean): string | undefined`: Finds first key satisfying predicate.
- `flattenObject(obj: Record<string, any>, prefix = ""): Record<string, any>`: Flattens nested object into dot-notation keys.
- `mapKeys<T, K>(obj: T, fn: (val, key) => K): Record<K, any>`: Transforms keys.
- `mapValues<T, V>(obj: T, fn: (val, key) => V): Record<string, V>`: Transforms values.
- `invert(obj: Record<string, string>): Record<string, string>`: Inverts keys and values.
- `deepClone<T>(val: T): T`: Deeply clones objects, arrays, dates, and regexes.
- `deepMerge<T, U>(target: T, ...sources: U[]): T & U`: Deeply merges source objects into target.

#### Example
```typescript
const data = { user: { profile: { name: "Alice", email: "alice@dev.io" } } };
const name = objutils.get(data, "user.profile.name"); // "Alice"
objutils.set(data, "user.profile.verified", true);

const same = objutils.isEqual({ a: [1, 2] }, { a: [1, 2] }); // true
const subset = objutils.pick(data.user.profile, ["name"]); // { name: "Alice" }
const flat = objutils.flattenObject(data); // { "user.profile.name": "Alice", ... }
```

---

### 11. `structutils`
*Classic RAD data structures implemented with TypeScript generics.*

```typescript
import { structutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `class SimpleStack<T>`: LIFO Stack (`push`, `pop`, `peek`, `isEmpty`, `size`, `toArray`).
- `class SimpleQueue<T>`: FIFO Queue (`enqueue`, `dequeue`, `peek`, `isEmpty`, `size`, `toArray`).
- `class SimpleRingBuffer<T>`: Fixed-capacity circular buffer (`constructor(capacity)`, `push`, `pop`, `peek`, `isFull`, `size`, `toArray`). Overwrites oldest item when full.
- `class SimpleMinHeap<T>`: Priority binary min-heap (`push`, `pop`, `peek`, `size`, `toArray`).

#### Example
```typescript
// Circular Ring Buffer for rolling telemetry or logs
const buffer = new structutils.SimpleRingBuffer<number>(3);
buffer.push(10);
buffer.push(20);
buffer.push(30);
buffer.push(40); // Overwrites 10
console.log(buffer.toArray()); // [20, 30, 40]

// Min Heap for priority task scheduling
const heap = new structutils.SimpleMinHeap<number>();
heap.push(50);
heap.push(10);
heap.push(30);
console.log(heap.pop()); // 10
```

---

### 12. `statutils`
*Comprehensive statistical and econometric calculation engine.*

```typescript
import { statutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `mean(nums: number[]): number`: Arithmetic mean.
- `median(nums: number[]): number`: Median value.
- `mode(nums: number[]): number[]`: Most frequent value(s).
- `variance(nums: number[], sample = true): number`: Sample or population variance.
- `stdDev(nums: number[], sample = true): number`: Standard deviation.
- `sem(nums: number[]): number`: Standard error of the mean ($s / \sqrt{n}$).
- `quartiles(nums: number[]): [number, number, number]`: Q1 (25th), Q2 (50th), Q3 (75th) percentiles.
- `iqr(nums: number[]): number`: Interquartile range (Q3 - Q1).
- `skewness(nums: number[]): number`: Fisher-Pearson coefficient of skewness.
- `kurtosis(nums: number[]): number`: Sample excess kurtosis.
- `covariance(x: number[], y: number[]): number`: Sample covariance between two series.
- `pearsonCorrelation(x: number[], y: number[]): number`: Pearson correlation coefficient ($r \in [-1, 1]$).
- `linearRegression(x: number[], y: number[]): { slope: number; intercept: number; r2: number }`: Ordinary Least Squares linear regression.
- `zScore(val: number, meanVal: number, stdDevVal: number): number`: Calculates standard score ($z$).
- `movingAverage(nums: number[], windowSize: number): number[]`: Computes rolling simple moving average.

#### Example
```typescript
const scores = [12, 15, 14, 10, 18, 20, 22, 24];
const avg = statutils.mean(scores); // 17.375
const [q1, q2, q3] = statutils.quartiles(scores);
const model = statutils.linearRegression([1, 2, 3, 4], [10, 20, 30, 40]);
console.log(`Slope: ${model.slope}, R²: ${model.r2}`); // Slope: 10, R²: 1
```

---

### 13. `mathutils`
*Spatial math, number theory, and geometric collision utilities.*

```typescript
import { mathutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `lerp(a: number, b: number, t: number): number`: Linear interpolation between $a$ and $b$ at fraction $t$.
- `remap(val: number, inMin: number, inMax: number, outMin: number, outMax: number): number`: Maps value from one range to another.
- `clamp(val: number, min: number, max: number): number`: Restricts number within inclusive range.
- `roundToStep(val: number, step: number): number`: Rounds value to the nearest multiple of step.
- `distance(p1: Point2D, p2: Point2D): number`: Euclidean distance between two 2D points.
- `midpoint(p1: Point2D, p2: Point2D): Point2D`: Midpoint between two 2D points.
- `rectIntersects(r1: Rect, r2: Rect): boolean`: Axis-Aligned Bounding Box (AABB) intersection check.
- `rectArea(r: Rect): number`: Computes area of rectangle.
- `gcd(a: number, b: number): number`: Greatest Common Divisor (Euclidean algorithm).
- `lcm(a: number, b: number): number`: Least Common Multiple.
- `isPowerOfTwo(n: number): boolean`: Fast bitwise power of two test.
- `inRange(val: number, start: number, end?: number): boolean`: Checks if number is in range $[start, end)$.
- `sum(arr: readonly number[]): number`: Sums all numbers in array.
- `sumBy<T>(arr: readonly T[], fn: (item: T) => number): number`: Sums numbers by selector function.
- `randomInt(min: number, max: number): number`: Inclusive random integer in $[min, max]$.
- `round(val: number, precision = 0): number`: Rounds number to specified decimal places.

#### Example
```typescript
const alpha = mathutils.lerp(0, 100, 0.75); // 75
const normalized = mathutils.remap(50, 0, 100, 0, 1); // 0.5
const r1 = { x: 0, y: 0, width: 10, height: 10 };
const r2 = { x: 5, y: 5, width: 10, height: 10 };
const colliding = mathutils.rectIntersects(r1, r2); // true
const factor = mathutils.gcd(48, 18); // 6
```

---

### 14. `bitutils`
*Bitwise flag manipulation and fast binary `BitSet`.*

```typescript
import { bitutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `class BitSet`: High-performance 32-bit word binary bit array.
  - `constructor(size: number)`
  - `set(index: number, val = true): void`
  - `get(index: number): boolean`
  - `clear(index: number): void`
  - `toggle(index: number): void`
  - `countSet(): number`: Total number of active 1 bits.
  - `toBinaryString(): string`: Formatted binary representation.
- `popcount(n: number): number`: Counts number of set bits in 32-bit integer (Hamming weight).
- `setFlag(flags: number, mask: number): number`: Activates bit flag.
- `hasFlag(flags: number, mask: number): boolean`: Tests if bit flag is active.
- `clearFlag(flags: number, mask: number): number`: Deactivates bit flag.
- `toggleFlag(flags: number, mask: number): number`: Toggles bit flag.

#### Example
```typescript
const bits = new bitutils.BitSet(64);
bits.set(0);
bits.set(42);
console.log(bits.get(42)); // true
console.log(bits.countSet()); // 2

const READ = 1, WRITE = 2, EXEC = 4;
let perms = bitutils.setFlag(0, READ | WRITE);
console.log(bitutils.hasFlag(perms, WRITE)); // true
```

---

### 15. `graphutils`
*Directed Graph (DAG) construction, topological sort, cycle detection, and pathfinding.*

```typescript
import { graphutils } from "./src/features/rad/index.ts";
```

#### API Signatures
- `class Graph<T extends string | number>`: Directed graph.
  - `addNode(node: T): void`
  - `addEdge(from: T, to: T): void`
  - `getNeighbors(node: T): T[]`
  - `getNodes(): T[]`
  - `topologicalSort(): T[]`: Returns dependency order via Kahn's algorithm (throws on cycles).
  - `hasCycle(): boolean`: Returns whether the graph contains any cycle.
  - `bfs(start: T): T[]`: Breadth-first traversal order.
  - `dfs(start: T): T[]`: Depth-first traversal order.
  - `shortestPath(start: T, end: T): T[] | null`: Unweighted shortest path sequence via BFS.
- `newGraph<T>(): Graph<T>`: Factory helper.

#### Example
```typescript
const g = graphutils.newGraph<string>();
g.addEdge("compile", "test");
g.addEdge("test", "package");
g.addEdge("package", "deploy");

const buildOrder = g.topologicalSort(); // ["compile", "test", "package", "deploy"]
const path = g.shortestPath("compile", "deploy"); // ["compile", "test", "package", "deploy"]
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

Bun RAD Studio ships with dedicated CLI runners and desktop GUI workstations so you can test, benchmark, and explore every single utility interactively:

```bash
# ⚡ 1. Interactive 44-Module Benchmark Dashboard
bun run rad
# or: bun run src/features/rad/radCli.ts

# 📚 2. End-to-End Dual Cookbook (10 CLI Tools + 44 RAD Modules)
bun run rad:cookbook
# or: bun run examples/rad_cookbook.ts

# 🖥️ 3. Full Desktop GUI Workstation (Interactive Playground & Live Tester)
bun run app:rad
# or: bun run applications/rad_studio.ts

# 🛠️ 4. Dedicated CLI Companion
bun run cli:rad --list
bun run cli:rad --module fileutils
bun run cli:rad --recipe arrutils

# 🧪 5. Run Full Test Suite
bun test src/features/rad/rad.test.ts
```
