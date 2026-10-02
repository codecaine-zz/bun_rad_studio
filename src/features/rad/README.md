# RAD Development Utilities (`rad`)

A comprehensive suite of 44 ergonomic, production-grade utility modules designed for **Rapid Application Development (RAD)** in [Bun](https://bun.com). Ported and extended from [`codecaine-zz/vlang_utils`](https://github.com/codecaine-zz/vlang_utils) and modern utility primitives inspired by [`toss/es-toolkit`](https://github.com/toss/es-toolkit), supercharged with native Bun standard library superpowers (`Bun.Glob`, `Bun.$`, `Bun.serve`, `Bun.hash`, `Bun.Transpiler`, and `bun:sqlite` FTS5).

Never write boilerplate from scratch again.

---

## Included Modules (44 Total)

| Module | Description | Superpower / Engine |
| :--- | :--- | :--- |
| **`fileutils`** | Asynchronous JSON, CSV, atomic line operations, copy, move, directory walking, human file sizes. | `node:fs/promises` & `Bun.file` |
| **`sqliteutils`** | Native `bun:sqlite` persistence: KV store, JSON document store, parameterized CRUD, migrations, and FTS5 full-text search. | `bun:sqlite` |
| **`strutils`** | Case conversions (`snake`, `kebab`, `camel`, `pascal`, `title`), `slugify`, masking (`email`, `phone`, `card`), Levenshtein distance, word wrap. | Pure TS |
| **`arrutils` / `sliceutils`** | Modern collection helpers: `at` (negative index), `compact`, `chunk`, `partition`, `drop`/`take`, `keyBy`, `countBy`, `minBy`/`maxBy`, `zip`/`unzip`, `tail`, `without`, `unique`. | `es-toolkit` inspired |
| **`objutils`** | Deep path access (`get`, `set`, `unset`, `has`), `pick`/`pickBy`, `omit`/`omitBy`, `deepMerge`, `deepClone`, `isEqual`, `isEmpty`, `isNil`, `flattenObject`. | `es-toolkit` inspired |
| **`fnutils`** | Functional primitives: `once`, `memoize`, `curry`, `partial`, `negate`, `before`, `after`, `debounce`, `throttle`, `times`, `delay`, `pipe`. | `es-toolkit` inspired |
| **`envutils`** | Type-safe environment variable retrieval (`getStr`, `getInt`, `getBool`, `getFloat`), `.env` loader, and variable expansion (`${VAR}`). | `process.env` |
| **`cryptoutils`** | SHA-256, SHA-512, MD5, HMAC-SHA256, Base64 / Base64URL encode/decode, UUID v4, secure tokens, native password hashing. | `Bun.password` & WebCrypto |
| **`timeutils`** | Human relative time ("2 hours ago", "in 3 days"), ISO 8601 formatting/parsing, calendar boundaries, `Stopwatch`. | `Date` & `performance.now` |
| **`httputils`** | Ergonomic HTTP client (`getJson`, `postJson`, `putJson`, `deleteJson`, `getText`), query builder/parser, retry with backoff. | Native `fetch` |
| **`cliutils`** | Terminal ANSI styling, progress bar, Unicode sparkline, ASCII horizontal bar chart, gauge, and tree hierarchy. | Terminal ANSI |
| **`sysutils`** | System telemetry (CPU cores, RAM, uptime), safe execution (`execSafe`, `quoteArg`), temp/home paths, clipboard integration. | `node:os` |
| **`netutils`** | Network discovery (primary local IP, public IP probe, online connectivity check, TCP ping latency). | `node:os` & WebSockets |
| **`validutils`** | High-speed validation for email, URL, IPv4/IPv6, phone numbers, alphanumeric strings, numeric ranges, UUID, JSON. | RegExp |
| **`structutils`** | Generic RAD data structures: `SimpleStack`, `SimpleQueue`, circular `SimpleRingBuffer`, and `SimpleMinHeap`. | Pure TS |
| **`statutils`** | Statistical analysis: mean, median, mode, variance, std dev, quartiles, IQR, skewness, covariance, Pearson correlation, OLS linear regression, moving average. | Pure TS |
| **`stateutils`** | Managed persistent app state (`AppStateStore`, `KeyValueState`) with atomic writes, auto-save, and rollback. | JSON storage |
| **`cacheutils`** | In-memory caching: O(1) `LRUCache` with recency eviction and entry-level `TTLCache` with auto-cleanup and `getOrSet`. | Map / Timers |
| **`semverutils`** | Semantic Versioning 2.0.0 parsing, precedence comparison, range matching (`^`, `~`, `>=`, `<=`), and version bumping. | Pure TS |
| **`flowutils`** | Traffic control: Token Bucket `RateLimiter`, 3-state `CircuitBreaker`, exponential backoff `retry`, `debounce`, `throttle`. | Async Primitives |
| **`templateutils`** | Fast string templating with fallback defaults (`{{key \| default}}`) and terminal ANSI markdown rendering. | Regex Replacement |
| **`colorutils`** | Hex/RGB/HSL conversions, color transforms (`lighten`, `darken`), WCAG 2.1 accessibility auditing, and 24-bit Truecolor terminal output. | Color Math |
| **`archiveutils`** | Zip archive creation, extraction, directory compression, and in-memory inspection via zero-dependency deflate. | Compression Streams |
| **`asyncutils`** | Bounded concurrency primitives: order-preserving `parallelMap`, `parallelFilter`, `parallelEach`, `WaitGroup`, `WorkerPool`, `timeoutPromise`. | Async/Await |
| **`regexutils`** | High-level pattern matching helpers: `isMatch`, `findFirst`, `findAll`, `replace`, `split`, `findNamedGroups`. | RegExp Engine |
| **`mockutils`** | Synthetic testing data generation: `mockUser`, `mockUsers`, `mockEmail`, `mockPhone`, `mockIpv4`, `mockUrl`, `loremWords`, `loremText`. | Pseudorandom |
| **`logutils`** | Leveled structured logging (`LogLevel`, `Logger`, file/console sinks, JSON output mode, ANSI highlighting). | Streams & Console |
| **`tomlutils`** | TOML configuration file and string parsing with typed accessors (`getString`, `getInt`, `getBool`, `getArray`). | Parser |
| **`htmlutils`** | HTML parsing, DOM navigation (`getElementById`, `getElementsByTag`), link extraction, entity escaping, and tag stripping. | AST Walk |
| **`bitutils`** | Dynamic `BitSet`, popcount, bitmask flag manipulation (`setFlag`, `hasFlag`, `clearFlag`, `toggleFlag`). | Bitwise Ops |
| **`compressutils`** | Fast Gzip and Deflate string and buffer compression, decompression, and compression ratio calculation. | Native CompressionStreams |
| **`tarutils`** | TAR archive creation, unpacking, directory archiving, and tarball inspection. | Binary Blocks |
| **`mathutils`** | Spatial geometry and number theory: `lerp`, `remap`, `clamp`, `inRange`, `sum`, `sumBy`, `randomInt`, `roundToStep`, `Point2D`, `Rect`, `gcd`, `lcm`. | Math Built-ins |
| **`cronutils`** | Standard 5-field cron parsing, date matching (`matchesCron`), next run calculation (`nextCronRun`), and human English translation (`cronToHuman`). | Cron Matcher |
| **`urlutils`** | RFC 3986 URL parsing (`parseUrl`), path segment joining (`joinUrl`), and credential redaction for logs (`redactCredentials`). | WHATWG URL |
| **`jwtutils`** | Lightweight, zero-dependency HS256 JSON Web Token signing (`signJwt`) and verification (`verifyJwt`) with expiration checks. | WebCrypto HMAC |
| **`eventutils`** | In-memory publish-subscribe event dispatcher (`EventEmitter`, `on`, `once`, `off`, `emit`). | Event Dispatch |
| **`diffutils`** | Line-level text diffing (`diffLines`), Git-style unified diff generation (`unifiedDiff`), and ANSI colored diff rendering. | Myers / Line Diff |
| **`graphutils`** | Directed Acyclic Graphs (`Graph`), Kahn's topological sort with cycle detection, BFS, DFS, and shortest path. | Graph Theory |
| **`globutils`** | High-performance filesystem globbing, directory scanning, and pattern matching. | **`Bun.Glob`** |
| **`shellutils`** | Ergonomic subprocess execution, piping, exit code handling, and PATH discovery. | **`Bun.$` & `Bun.which`** |
| **`hashutils`** | Ultrafast 64-bit non-cryptographic hashing (`wyhash`, `crc32`, `cityHash`, `rapidhash`) and Bloom filter. | **`Bun.hash`** |
| **`serverutils`** | Lightweight HTTP routing, zero-config static file server, and WebSocket pub/sub hub. | **`Bun.serve`** |
| **`transpileutils`** | In-memory TypeScript/TSX transpilation, AST import/export scanning, and code evaluation. | **`Bun.Transpiler`** |

---

## Quick Start CLI Runner

Run the full interactive 44-module demonstration dashboard with execution timing:

```bash
bun run rad
# or
bun run index.ts rad
```

---

## RAD Copy & Paste TypeScript Recipes

### 1. `arrutils.at` & Modern Array Helpers (`es-toolkit`)
```typescript
import { arrutils } from "./src/features/rad/index.ts";

const items = ["alpha", "beta", "gamma", "delta"];

// Safe negative index retrieval (es-toolkit/array/at)
console.log(arrutils.at(items, 0));  // "alpha"
console.log(arrutils.at(items, -1)); // "delta"
console.log(arrutils.at(items, -2)); // "gamma"
console.log(arrutils.at(items, 10)); // undefined

// Filter out falsy values
const clean = arrutils.compact([0, 1, false, 2, "", 3, null, undefined]); // [1, 2, 3]

// Index by property
const users = [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }];
const userMap = arrutils.keyBy(users, (u) => u.id); // { u1: {...}, u2: {...} }

// Drop & take
console.log(arrutils.drop(items, 2));     // ["gamma", "delta"]
console.log(arrutils.takeRight(items, 2)); // ["gamma", "delta"]
```

### 2. `objutils` Deep Path & Immutability (`es-toolkit`)
```typescript
import { objutils } from "./src/features/rad/index.ts";

const profile = {
  user: {
    details: {
      name: "Alice",
      roles: ["admin", "editor"],
    },
  },
};

// Safe deep get with fallback
const name = objutils.get(profile, "user.details.name", "Unknown"); // "Alice"
const missing = objutils.get(profile, "user.details.age", 18); // 18

// Deep set and unset
objutils.set(profile, "user.details.email", "alice@example.com");
objutils.unset(profile, "user.details.email");

// Deep equality & deep merge
const eq = objutils.isEqual({ a: [1, 2] }, { a: [1, 2] }); // true
const merged = objutils.deepMerge({ a: { b: 1 } }, { a: { c: 2 } }); // { a: { b: 1, c: 2 } }

// Pick & Omit
const subset = objutils.pick({ a: 1, b: 2, c: 3 }, ["a", "c"]); // { a: 1, c: 3 }
```

### 3. `fnutils` Functional Primitives (`es-toolkit`)
```typescript
import { fnutils } from "./src/features/rad/index.ts";

// Memoize expensive function
const expensiveCalc = fnutils.memoize((n: number) => {
  return n * 42;
});
console.log(expensiveCalc(10)); // calculated
console.log(expensiveCalc(10)); // returned from cache

// Left-to-right pipe composition
const processText = fnutils.pipe(
  "  hello bun  ",
  (s: string) => s.trim(),
  (s: string) => s.toUpperCase(),
  (s: string) => `[${s}]`
);
console.log(processText); // "[HELLO BUN]"

// Run once only
const init = fnutils.once(() => console.log("System initialized"));
init();
init(); // no-op
```

### 4. `sqliteutils` & FTS5 Full-Text Search
```typescript
import { sqliteutils } from "./src/features/rad/index.ts";

const db = sqliteutils.openDb("app.db");

// Key-Value Store
sqliteutils.createKvTable(db, "settings");
sqliteutils.setKv(db, "settings", "theme", "dark");
const theme = sqliteutils.getKvOr(db, "settings", "theme", "light");

// JSON Document Store
sqliteutils.createJsonStore(db, "profiles");
sqliteutils.saveDoc(db, "profiles", "u1", { name: "Alice", active: true });
const profile = sqliteutils.loadDoc(db, "profiles", "u1");

// FTS5 Full-Text Search
sqliteutils.createFtsTable(db, "docs", ["title", "content"]);
sqliteutils.indexFts(db, "docs", { title: "Getting Started", content: "Learn Bun RAD utilities" });
const searchResults = sqliteutils.searchFts(db, "docs", "Bun");

sqliteutils.closeDb(db);
```

### 5. `globutils` (Native Bun.Glob)
```typescript
import { globutils } from "./src/features/rad/index.ts";

// Async directory scan
const tsFiles = await globutils.globScan("**/*.ts", { cwd: "src" });

// Pattern match a specific path
const isTs = globutils.globMatch("*.ts", "app.ts"); // true

// Find files matching pattern
const jsonFiles = await globutils.findFiles("*.json", ".");
```

### 6. `shellutils` (Native Bun.$)
```typescript
import { shellutils } from "./src/features/rad/index.ts";

// Safe quiet subprocess execution
const res = await shellutils.execCmd("git rev-parse --short HEAD");
if (res.success) {
  console.log("Commit:", res.stdout.trim());
}

// Check executable in PATH
const bunPath = shellutils.whichCmd("bun");

// Pipe commands safely
const lines = await shellutils.execLines("ls -1");
```

### 7. `hashutils` (Native Bun.hash & BloomFilter)
```typescript
import { hashutils } from "./src/features/rad/index.ts";

// Ultra-fast 64-bit wyhash
const hashVal = hashutils.wyhash("speed-of-light");
const hex = hashutils.hashHex("speed-of-light", "wyhash");

// In-memory Bloom Filter (10,000 items, 1% false positive)
const bloom = hashutils.createBloomFilter(10000, 0.01);
bloom.add("user:1001");
console.log(bloom.has("user:1001")); // true
console.log(bloom.has("user:9999")); // false
```

### 8. `serverutils` (Native Bun.serve)
```typescript
import { serverutils } from "./src/features/rad/index.ts";

// Micro-router
const router = serverutils.createRouter();
router.get("/api/status", () => new Response(JSON.stringify({ status: "ok" })));
router.post("/api/echo", async (req) => new Response(await req.text()));

// Start ephemeral server
const server = serverutils.serveHttp({ router, port: 8080 });
console.log(`Server listening on ${server.url}`);

// Stop gracefully
server.stop();
```

### 9. `transpileutils` (Native Bun.Transpiler)
```typescript
import { transpileutils } from "./src/features/rad/index.ts";

// Transpile TypeScript in-memory to JavaScript
const js = transpileutils.transpileTs("const x: number = 42; export default x;");

// Scan imports & exports without executing
const analysis = transpileutils.analyzeCode(`
  import { foo } from "./foo";
  export const bar = 1;
`);
console.log(analysis.exports); // ["bar"]
console.log(analysis.imports); // [{ path: "./foo", kind: "import-statement" }]

// In-memory evaluation
const value = transpileutils.evalTs<number>("const a = 10; const b = 20; return a + b;"); // 30
```

### 10. `jwtutils`
```typescript
import { jwtutils } from "./src/features/rad/index.ts";

const token = jwtutils.signJwt({ sub: "user_123", role: "admin" }, "supersecret", 3600);
const claims = jwtutils.verifyJwt<{ sub: string; role: string }>(token, "supersecret");
console.log(claims.sub); // "user_123"
```
