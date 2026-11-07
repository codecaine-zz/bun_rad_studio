# 45 RAD utility modules and 10 system tools cheat sheet

A beginner-friendly, domain-by-domain cheat sheet for the **45 `rad` utility modules** (`src/features/rad/`) and the **10 programmatic system utilities** (`fd`, `sd`, `rip`, `procs`, `watchexec`, `tokei`, `gdu`, `ipinfo`, `subfinder`, `doggo`).

---

## What is `rad`? (In 30 seconds)

Instead of installing dozens of third-party npm packages (`lodash`, `uuid`, `chalk`, `dotenv`, `glob`, `semver`, `cron-parser`, `better-sqlite3`), **`import { rad } from "../../src/features/rad/index.ts"` gives you 45 zero-dependency utility modules** organized into 6 easy categories:

- **Saving/loading JSON, CSV, or `.jsonl` files?** Use `rad.fileutils`.
- **Storing data in a local SQLite database (tables, key-value, JSON docs, or FTS5 search)?** Use `rad.sqliteutils`.
- **Grouping, sorting, deduplicating, or chunking arrays?** Use `rad.arrutils`.
- **Safely reading deep object properties (`user.profile.name`) or omitting fields?** Use `rad.objutils`.
- **Formatting strings (`slugify`, `toCamelCase`, masking emails)?** Use `rad.strutils`.
- **Finding files with wildcards (`**/*.ts`)?** Use `rad.globutils`.
- **Hashing passwords, generating UUIDs, or signing JWTs?** Use `rad.cryptoutils` and `rad.jwtutils`.
- **Running async tasks in parallel with a concurrency limit or retry logic?** Use `rad.asyncutils` and `rad.flowutils`.

---

## Contents

- [Quick import patterns](#quick-import-patterns)
- [1. File, SQLite (WAL + FTS5), TOML, archives, and state (8 modules)](#1-file-sqlite-wal--fts5-toml-archives-and-state-8-modules)
- [2. Collections, objects, data structures, statistics, math, and graphs (8 modules)](#2-collections-objects-data-structures-statistics-math-and-graphs-8-modules)
- [3. Strings, regex, templates, colors, HTML, and diffs (6 modules)](#3-strings-regex-templates-colors-html-and-diffs-6-modules)
- [4. System, CLI, env, Bun Shell, Glob, Transpiler, cron, and SemVer (9 modules)](#4-system-cli-env-bun-shell-glob-transpiler-cron-and-semver-9-modules)
- [5. Network, HTTP, `Bun.serve` router, URL, JWT, crypto, and `Bun.hash` (7 modules)](#5-network-http-bunserve-router-url-jwt-crypto-and-bunhash-7-modules)
- [6. Async concurrency, flow control, functional, events, validation, mock, and time (7 modules)](#6-async-concurrency-flow-control-functional-events-validation-mock-and-time-7-modules)
- [7. The 10 system utilities as TypeScript functions](#7-the-10-system-utilities-as-typescript-functions)
- [8. Pro RAD module and system tool tips and tricks](#8-pro-rad-module-and-system-tool-tips-and-tricks)

---

## Quick import patterns

> 📖 **Learn more:** [45 RAD Utility Modules Handbook (`src/features/rad/README.md`)](../../src/features/rad/README.md) · [RAD Development Suite (`SYSTEM_UTILITIES_API.md#15-rad-development-suite-45-modules---44-core--sliceutils-alias`)](../SYSTEM_UTILITIES_API.md#15-rad-development-suite-45-modules---44-core--sliceutils-alias)

```typescript
// Unified namespace import (all 45 modules on `rad.*`)
import { rad } from "../../src/features/rad/index.ts";

// Or direct named module imports
import {
  fileutils,
  sqliteutils,
  tomlutils,
  arrutils,
  objutils,
  strutils,
  globutils,
  shellutils,
  serverutils,
  cryptoutils,
  hashutils,
  asyncutils,
} from "../../src/features/rad/index.ts";
```

---

## 1. File, SQLite (WAL + FTS5), TOML, archives, and state (8 modules)

> 📖 **Learn more:** [Domain 1: File & Storage (`src/features/rad/README.md#1-file--storage-8-modules`)](../../src/features/rad/README.md#1-file--storage-8-modules) · [Complete Databases Guide (`databases/complete-databases-guide.md`)](../databases/complete-databases-guide.md) · [Data & File Operations (`reference/data-and-files.md`)](../reference/data-and-files.md)

| Module | Key Functions | Copy-Paste Example |
| :--- | :--- | :--- |
| **[`fileutils`](../../src/features/rad/README.md#1-fileutils)** | `saveJson`, `loadJson`, `writeFileAtomic`, `readJsonl`, `appendJsonl`, `readCsvObjects`, `writeCsvObjects`, `walkFiles`, `withTempDir`, `hashFile`, `formatBytes` | `await rad.fileutils.saveJson("cfg.json", { port: 8080 });`<br>`const cfg = await rad.fileutils.loadJson("cfg.json", { port: 3000 });` |
| **[`sqliteutils`](../../src/features/rad/README.md#2-sqliteutils)** | `openDb`, `runMigrations`, `insertRow`, `insertMany`, `upsertRow`, `selectRows`, `selectOne`, `updateRows`, `deleteRows`, `queryAll`, `transaction`, `createKvTable`, `setKv`, `getKvOr`, `incrementKv`, `createJsonStore`, `saveDoc`, `findDocs`, `createFtsTable`, `indexFts`, `searchFtsRanked`, `backupDb` | `const db = rad.sqliteutils.openDb(":memory:");`<br>`rad.sqliteutils.createKvTable(db, "kv");`<br>`rad.sqliteutils.setKv(db, "kv", "theme", "nord");` |
| **[`tomlutils`](../../src/features/rad/README.md#3-tomlutils)** | `parseToml`, `tryParseToml`, `stringifyToml`, `loadToml`, `saveToml`, `loadTomlLayers`, `getInt`, `getString`, `getBool`, `setTomlPath`, `mergeToml` | `const doc = rad.tomlutils.parseToml("[app]\nport = 8080");`<br>`const port = rad.tomlutils.getInt(doc, "app.port", 3000);` |
| **[`archiveutils`](../../src/features/rad/README.md#4-archiveutils)** | `zipFiles`, `zipFile`, `zipDir`, `listZipEntries`, `listZipDetails`, `readZipText`, `unzipToMemory`, `unzipToDir` | `const zip = rad.archiveutils.zipFiles([{ name: "hi.txt", data: "Hello" }]);`<br>`const text = await rad.archiveutils.readZipText(zip, "hi.txt");` |
| **[`compressutils`](../../src/features/rad/README.md#5-compressutils)** | `compress`, `decompress`, `gzipCompressString`, `gzipDecompressString`, `brotliCompress`, `zstdCompress`, `detectCompression`, `compressionRatio` | `const b64 = rad.compressutils.gzipCompressString("payload");`<br>`const raw = rad.compressutils.gzipDecompressString(b64);` |
| **[`tarutils`](../../src/features/rad/README.md#6-tarutils)** | `packTarBytes`, `unpackTarBytes`, `listTarEntries`, `packTarGz`, `unpackTarGz`, `createTarFile`, `extractTarFile` | `const tar = rad.tarutils.packTarBytes([{ name: "a.txt", data: "ok" }]);` |
| **[`stateutils`](../../src/features/rad/README.md#7-stateutils)** | `AppStateStore`, `KeyValueState` | `const store = new rad.stateutils.AppStateStore("app", { visits: 1 });` |
| **[`cacheutils`](../../src/features/rad/README.md#8-cacheutils)** | `LRUCache`, `TTLCache` | `const cache = new rad.cacheutils.LRUCache<string, number>(128);` |

---

## 2. Collections, objects, data structures, statistics, math, and graphs (8 modules)

> 📖 **Learn more:** [Domain 2: Data Structures & Collections (`src/features/rad/README.md#2-data-structures--collections-8-modules`)](../../src/features/rad/README.md#2-data-structures--collections-8-modules)

| Module | Key Functions | Copy-Paste Example |
| :--- | :--- | :--- |
| **[`arrutils` / `sliceutils`](../../src/features/rad/README.md#9-arrutils--sliceutils)** | `at` (negative index), `chunk`, `compact`, `unique`, `uniqBy`, `groupBy`, `keyBy`, `countBy`, `partition`, `sortBy`, `flatten`, `difference`, `intersection`, `union`, `zip`, `sample`, `shuffle` | `const last = rad.arrutils.at(["a", "b", "c"], -1); // "c"`<br>`const pages = rad.arrutils.chunk([1, 2, 3, 4], 2); // [[1,2],[3,4]]` |
| **[`objutils`](../../src/features/rad/README.md#10-objutils)** | `get`, `set`, `unset`, `has`, `pick`, `omit`, `deepClone`, `deepMerge`, `isEqual`, `mapValues`, `mapKeys`, `invert`, `flattenObject` | `const name = rad.objutils.get(user, "profile.name", "Anon");`<br>`const safe = rad.objutils.omit(user, ["password", "token"]);` |
| **[`structutils`](../../src/features/rad/README.md#11-structutils)** | `SimpleStack`, `SimpleQueue`, `SimpleDeque`, `SimpleRingBuffer`, `SimpleMinHeap`, `SimplePriorityQueue`, `SimpleTrie`, `DisjointSet` | `const q = new rad.structutils.SimpleQueue<string>(); q.enqueue("job1");` |
| **[`statutils`](../../src/features/rad/README.md#12-statutils)** | `sum`, `mean`, `median`, `mode`, `variance`, `stdDev`, `percentile`, `iqr`, `zScores`, `pearsonCorrelation`, `linearRegression` | `const avg = rad.statutils.mean([10, 20, 30]); // 20`<br>`const p95 = rad.statutils.percentile(latencies, 95);` |
| **[`mathutils`](../../src/features/rad/README.md#13-mathutils)** | `clamp`, `lerp`, `remap`, `gcd`, `lcm`, `isPrime`, `factorial`, `degToRad`, `radToDeg`, `distance`, `rectIntersects`, `randomInt` | `const pct = rad.mathutils.clamp(rawScore, 0, 100);` |
| **[`bitutils`](../../src/features/rad/README.md#14-bitutils)** | `BitSet` (`set`, `get`, `countSet`), `popcount`, `setFlag`, `clearFlag`, `toggleFlag`, `hasFlag` | `const bs = new rad.bitutils.BitSet(64); bs.set(7); bs.get(7); // true` |
| **[`graphutils`](../../src/features/rad/README.md#15-graphutils)** | `newGraph`, `addEdge`, `topologicalSort`, `hasCycle`, `bfs`, `dfs`, `shortestPath` | `const dag = rad.graphutils.newGraph<string>(); dag.addEdge("a", "b");` |

---

## 3. Strings, regex, templates, colors, HTML, and diffs (6 modules)

> 📖 **Learn more:** [Domain 3: Strings, Text & Markup (`src/features/rad/README.md#3-strings-text--markup-6-modules`)](../../src/features/rad/README.md#3-strings-text--markup-6-modules)

| Module | Key Functions | Copy-Paste Example |
| :--- | :--- | :--- |
| **[`strutils`](../../src/features/rad/README.md#16-strutils)** | `slugify`, `toCamelCase`, `toSnakeCase`, `toKebabCase`, `toPascalCase`, `toTitleCase`, `truncate`, `padCenter`, `maskEmail`, `maskString`, `levenshteinDistance`, `words` | `rad.strutils.slugify("Hello Bun RAD!"); // "hello-bun-rad"`<br>`rad.strutils.maskEmail("ada@example.com"); // "a***a@example.com"` |
| **[`regexutils`](../../src/features/rad/README.md#17-regexutils)** | `isMatch`, `findFirst`, `findAll`, `replace`, `replaceFirst`, `extractGroups`, `escapeRegExp` | `rad.regexutils.findFirst(/\d+/, "Release v42"); // "42"` |
| **[`templateutils`](../../src/features/rad/README.md#18-templateutils)** | `renderTemplate`, `renderMarkdownAnsi` | `rad.templateutils.renderTemplate("Hi {{name \| Friend}}!", { name: "Ada" });` |
| **[`colorutils`](../../src/features/rad/README.md#19-colorutils)** | `hexToRgb`, `rgbToHex`, `rgbToHsl`, `hslToRgb`, `lighten`, `darken`, `luminance`, `contrastRatio`, `isAccessible`, `fgRgb`, `bgRgb` | `const rgb = rad.colorutils.hexToRgb("#38bdf8");` |
| **[`htmlutils`](../../src/features/rad/README.md#20-htmlutils)** | `escapeHtml`, `unescapeHtml`, `stripTags`, `extractLinks`, `getElementById`, `getElementsByTag` | `rad.htmlutils.stripTags("<p>Hello <b>World</b></p>"); // "Hello World"` |
| **[`diffutils`](../../src/features/rad/README.md#21-diffutils)** | `diffLines`, `unifiedDiff`, `renderColoredDiff`, `applyPatch` | `const patch = rad.diffutils.unifiedDiff("a\nb", "a\nc");` |

---

## 4. System, CLI, env, Bun Shell, Glob, Transpiler, cron, and SemVer (9 modules)

> 📖 **Learn more:** [Domain 4: System, CLI & Shell Runtime (`src/features/rad/README.md#4-system-cli--shell-runtime-9-modules`)](../../src/features/rad/README.md#4-system-cli--shell-runtime-9-modules)

| Module | Key Functions | Copy-Paste Example |
| :--- | :--- | :--- |
| **[`sysutils`](../../src/features/rad/README.md#22-sysutils)** | `getSystemInfo`, `quoteArg`, `getHomeDir`, `getTempDir`, `execSafe`, `copyToClipboard`, `readFromClipboard` | `const cores = rad.sysutils.getSystemInfo().cpuCount;` |
| **[`cliutils`](../../src/features/rad/README.md#23-cliutils)** | `renderSparkline`, `formatProgressBar`, `progressBar`, `renderBarChart`, `renderGauge`, `renderTree`, `formatTable` | `rad.cliutils.renderSparkline([2, 5, 8, 4, 9]); // "▂▅▇▄█"` |
| **[`envutils`](../../src/features/rad/README.md#24-envutils)** | `getStr`, `getInt`, `getFloat`, `getBool`, `set`, `requireEnv`, `parseEnvString`, `loadEnv`, `expandVars` | `const port = rad.envutils.getInt("PORT", 3000);` |
| **[`shellutils`](../../src/features/rad/README.md#25-shellutils)** | `whichCmd`, `execCmd`, `execLines`, `escapeArg`, `pipeCmds` | `const res = await rad.shellutils.execCmd("bun --version");` |
| **[`globutils`](../../src/features/rad/README.md#26-globutils)** | `findFiles`, `globScan`, `globScanSync`, `globMatch`, `globFilter` | `const files = await rad.globutils.findFiles("**/*.ts", "./src");` |
| **[`transpileutils`](../../src/features/rad/README.md#27-transpileutils)** | `transpileTs`, `analyzeCode`, `scanImports`, `stripTypes`, `evalTs` | `const { exports } = rad.transpileutils.analyzeCode("export const x = 1;");` |
| **[`logutils`](../../src/features/rad/README.md#28-logutils)** | `newLogger`, `LogLevel` | `const log = rad.logutils.newLogger({ prefix: "app" }); log.info("Ready");` |
| **[`cronutils`](../../src/features/rad/README.md#29-cronutils)** | `parseCron`, `matchesCron`, `nextCronRun`, `cronToHuman` | `rad.cronutils.cronToHuman("*/15 * * * *"); // "Every 15 minutes"` |
| **[`semverutils`](../../src/features/rad/README.md#30-semverutils)** | `parseSemver`, `compareSemver`, `satisfiesRange`, `bumpVersion`, `sortSemver` | `rad.semverutils.satisfiesRange("2.4.1", "^2.0.0"); // true` |

---

## 5. Network, HTTP, `Bun.serve` router, URL, JWT, crypto, and `Bun.hash` (7 modules)

> 📖 **Learn more:** [Domain 5: Network, Web & Cryptography (`src/features/rad/README.md#5-network-web--cryptography-7-modules`)](../../src/features/rad/README.md#5-network-web--cryptography-7-modules)

| Module | Key Functions | Copy-Paste Example |
| :--- | :--- | :--- |
| **[`netutils`](../../src/features/rad/README.md#31-netutils)** | `getLocalIp`, `getPublicIp`, `tcpPing`, `resolveHost`, `isOnline` | `const ip = rad.netutils.getLocalIp();` |
| **[`httputils`](../../src/features/rad/README.md#32-httputils)** | `getJson`, `postJson`, `putJson`, `deleteJson`, `getText`, `buildQuery`, `fetchWithRetry` | `const qs = rad.httputils.buildQuery({ q: "bun", page: 1 });` |
| **[`serverutils`](../../src/features/rad/README.md#33-serverutils)** | `createRouter`, `serveHttp`, `serveStatic`, `createWsHub` | `const r = rad.serverutils.createRouter(); r.get("/ping", () => new Response("pong"));` |
| **[`urlutils`](../../src/features/rad/README.md#34-urlutils)** | `joinUrl`, `parseUrl`, `getQueryParam`, `setQueryParam`, `redactCredentials` | `rad.urlutils.redactCredentials("postgres://u:secret@host/db");` |
| **[`jwtutils`](../../src/features/rad/README.md#35-jwtutils)** | `signJwt`, `verifyJwt`, `decodeJwtUnverified` | `const tok = rad.jwtutils.signJwt({ id: 1 }, "placeholder-secret", 3600);` |
| **[`cryptoutils`](../../src/features/rad/README.md#36-cryptoutils)** | `sha256`, `sha512`, `md5`, `hmacSha256`, `base64Encode`, `base64UrlEncode`, `uuidV4`, `uuidV7`, `randomToken`, `hashPassword`, `verifyPassword` | `const digest = rad.cryptoutils.sha256("hello");` |
| **[`hashutils`](../../src/features/rad/README.md#37-hashutils)** | `wyhash`, `crc32`, `adler32`, `cityHash64`, `rapidhash`, `createBloomFilter` | `const h = rad.hashutils.wyhash("fast-key");` |

---

## 6. Async concurrency, flow control, functional, events, validation, mock, and time (7 modules)

> 📖 **Learn more:** [Domain 6: Concurrency, Flow Control & Logic (`src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules`)](../../src/features/rad/README.md#6-concurrency-flow-control--logic-7-modules)

| Module | Key Functions | Copy-Paste Example |
| :--- | :--- | :--- |
| **[`asyncutils`](../../src/features/rad/README.md#38-asyncutils)** | `parallelMap`, `parallelFilter`, `parallelEach`, `timeoutPromise`, `createWaitGroup`, `WorkerPool` | `const out = await rad.asyncutils.parallelMap([1, 2, 3], 2, async (x) => x * 2);` |
| **[`flowutils`](../../src/features/rad/README.md#39-flowutils)** | `RateLimiter`, `CircuitBreaker`, `retry`, `debounce`, `throttle` | `const lim = new rad.flowutils.RateLimiter(50, 10); lim.allow(1);` |
| **[`fnutils`](../../src/features/rad/README.md#40-fnutils)** | `pipe`, `once`, `memoize`, `partial`, `negate`, `before`, `after`, `debounce`, `throttle`, `times`, `noop`, `identity` | `const val = rad.fnutils.pipe(5, (n) => n * 2, (n) => n + 1); // 11` |
| **[`eventutils`](../../src/features/rad/README.md#41-eventutils)** | `newEmitter`, `EventEmitter` (`on`, `once`, `off`, `emit`, `waitFor`) | `const ee = rad.eventutils.newEmitter(); ee.on("done", () => {});` |
| **[`validutils`](../../src/features/rad/README.md#42-validutils)** | `isEmail`, `isUrl`, `isIpv4`, `isIpv6`, `isPhone`, `isUuid`, `isJson`, `isAlphanumeric`, `inRange` | `rad.validutils.isEmail("dev@bun.sh"); // true` |
| **[`mockutils`](../../src/features/rad/README.md#43-mockutils)** | `mockUser`, `mockUsers`, `mockEmail`, `mockPhone`, `mockUrl`, `mockIpv4`, `loremWords`, `loremText` | `const users = rad.mockutils.mockUsers(10);` |
| **[`timeutils`](../../src/features/rad/README.md#44-timeutils)** | `timeAgo`, `formatIso`, `parseIso`, `addDays`, `diffDays`, `startOfDay`, `endOfDay`, `startOfMonth`, `endOfMonth`, `createStopwatch`, `nanoseconds` | `rad.timeutils.timeAgo(new Date(Date.now() - 60_000)); // "1 minute ago"` |

---

## 7. The 10 system utilities as TypeScript functions

> 📖 **Learn more:** [System Utilities Programmatic API (`SYSTEM_UTILITIES_API.md`)](../SYSTEM_UTILITIES_API.md) · [User Guides Master Hub (`userguides/README.md`)](../userguides/README.md)

All 10 system utilities under `src/features/` expose clean TypeScript **Coordinators** (high-level workflows) and **Doers** (pure single-responsibility helpers):

| Utility & Docs | Coordinator / Doer Import | Programmatic Call |
| :--- | :--- | :--- |
| **[`fd`](../SYSTEM_UTILITIES_API.md#1-fd-fast-file--directory-search)** · [README](../../src/features/fd/README.md) | `import { searchFiles } from "../../src/features/fd/fdCoordinator.ts"` | `await searchFiles({ pattern: "test", rootPath: "src", extension: "ts", hidden: false, absolute: false })` |
| **[`sd`](../SYSTEM_UTILITIES_API.md#2-sd-search--displace--sed-alternative)** · [README](../../src/features/sd/README.md) | `import { buildReplacerRegex, replaceText } from "../../src/features/sd/sdDoers.ts"` | `replaceText(src, buildReplacerRegex("old", true, "g"), "new")` |
| **[`rip`](../SYSTEM_UTILITIES_API.md#3-rip--rip2-safe-removal-with-graveyard--undo)** · [README](../../src/features/rip/README.md) | `import { buryTarget, unburyTarget } from "../../src/features/rip/ripCoordinator.ts"` | `await buryTarget("temp.log", graveyardDir); await unburyTarget(graveyardDir);` |
| **[`procs`](../SYSTEM_UTILITIES_API.md#4-procs-modern-process-viewer)** · [README](../../src/features/procs/README.md) | `import { getProcesses } from "../../src/features/procs/procsCoordinator.ts"` | `await getProcesses("bun", "cpu")` |
| **[`watchexec`](../SYSTEM_UTILITIES_API.md#5-watchexec-file-watcher--process-orchestrator)** · [README](../../src/features/watchexec/README.md) | `import { runWatchexecCoordinator } from "../../src/features/watchexec/watchexecCoordinator.ts"` | `await runWatchexecCoordinator({ watchPaths: ["src"], command: ["bun", "test"], ... })` |
| **[`tokei`](../SYSTEM_UTILITIES_API.md#6-tokei-fast-code--loc-counter)** · [README](../../src/features/tokei/README.md) | `import { computeCodeStats } from "../../src/features/tokei/tokeiCoordinator.ts"` | `await computeCodeStats({ paths: ["src"], sort: "code", showFiles: false, hidden: false })` |
| **[`gdu`](../SYSTEM_UTILITIES_API.md#7-gdu--gdu-go-pretty-fast-disk-usage-analyzer)** · [README](../../src/features/gdu/README.md) | `import { analyzeDirectory } from "../../src/features/gdu/gduCoordinator.ts"` | `await analyzeDirectory({ targetDir: ".", nonInteractive: true, ... })` |
| **[`ipinfo`](../SYSTEM_UTILITIES_API.md#8-ipinfo--ipinfo-cli-ip-geolocation--asn-details)** · [README](../../src/features/ipinfo/README.md) | `import { queryIp } from "../../src/features/ipinfo/ipinfoCoordinator.ts"` | `await queryIp("1.1.1.1")` |
| **[`subfinder`](../SYSTEM_UTILITIES_API.md#9-subfinder-passive-subdomain-discovery)** · [README](../../src/features/subfinder/README.md) | `import { enumerateDomain } from "../../src/features/subfinder/subfinderCoordinator.ts"` | `await enumerateDomain("example.com", 5000, false)` |
| **[`doggo`](../SYSTEM_UTILITIES_API.md#10-doggo-dns-client-for-humans)** · [README](../../src/features/doggo/README.md) | `import { lookupDomain } from "../../src/features/doggo/doggoCoordinator.ts"` | `await lookupDomain("example.com", "A")` |

---

## 8. Pro RAD module and system tool tips and tricks

> 📖 **Learn more:** [Complete Databases Guide (`databases/complete-databases-guide.md`)](../databases/complete-databases-guide.md) · [Developer Architecture (`developer/architecture.md`)](../developer/architecture.md)

1. **Batch SQLite Writes Inside Transactions (`insertMany` / `transaction`)**: `rad.sqliteutils.openDb()` enables `WAL` mode automatically, and wrapping bulk inserts in `rad.sqliteutils.insertMany(db, "items", rows)` or `rad.sqliteutils.transaction(db, () => { ... })` delivers **50x–100x faster** write throughput than individual row inserts.
2. **Instant Full-Text Search with SQLite FTS5 (`createFtsTable` & `searchFtsRanked`)**: Create a ranked full-text search index in two lines with `rad.sqliteutils.createFtsTable(db, "docs_fts", ["title", "body"])` and `rad.sqliteutils.searchFtsRanked(db, "docs_fts", "bun OR sqlite")`—no external search engine required.
3. **Hardware-Accelerated Non-Cryptographic Hashing (`rad.hashutils.wyhash`)**: For cache keys, content deduplication, and `createBloomFilter`, use `rad.hashutils.wyhash(input)` (powered by `Bun.hash.wyhash`) instead of SHA-256 for multi-GB/s throughput.
4. **Atomic Configuration Writes (`rad.fileutils.writeFileAtomic`)**: Prevent truncated JSON/TOML config files on power loss or crash by using `await rad.fileutils.writeFileAtomic(path, data)` or `await rad.fileutils.saveJson(path, obj)`.
5. **Import Coordinators Instead of Spawning Subprocesses**: When building a GUI or CLI that needs file search (`fd`), code stats (`tokei`), process lists (`procs`), or DNS lookups (`doggo`), import the TypeScript Coordinator directly (`computeCodeStats`, `getProcesses`, `lookupDomain`) rather than shelling out—it works identically on macOS, Linux, and Windows with full TypeScript types.

For complete API signatures and recipes, see:
- [`src/features/rad/README.md`](../../src/features/rad/README.md)
- [`docs/SYSTEM_UTILITIES_API.md`](../SYSTEM_UTILITIES_API.md)
