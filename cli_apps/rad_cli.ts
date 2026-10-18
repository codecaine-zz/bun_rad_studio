#!/usr/bin/env bun
/**
 * ⚡ Bun RAD Utilities CLI
 * Terminal Command-Line Companion for the 44-Module Rapid Application Development (RAD) Suite
 * Ported & extended from https://github.com/codecaine-zz/bun_sys_utils
 */

import { rad } from "../src/features/rad/index.ts";
import { runRadShowcase } from "../src/features/rad/radCli.ts";
import { colors } from "../src/shared/colors.ts";

export interface RadModuleInfo {
  name: string;
  category: string;
  description: string;
  superpower: string;
}

export const RAD_MODULES_CATALOG: RadModuleInfo[] = [
  // 1. File & Database
  { name: "fileutils", category: "File & Storage", description: "JSON, CSV, atomic lines, file tree walking, human sizes", superpower: "node:fs/promises & Bun.file" },
  { name: "sqliteutils", category: "File & Storage", description: "Native bun:sqlite KV store, JSON document store, CRUD, FTS5", superpower: "bun:sqlite" },
  { name: "tomlutils", category: "File & Storage", description: "TOML config parsing and serialization with typed extractors", superpower: "Bun.TOML native engine" },
  { name: "archiveutils", category: "File & Storage", description: "In-memory ZIP archive creation, extraction, and inspection", superpower: "Compression Streams" },
  { name: "compressutils", category: "File & Storage", description: "Fast Gzip and Deflate string and buffer compression", superpower: "Native CompressionStreams" },
  { name: "tarutils", category: "File & Storage", description: "TAR archive creation, tarball inspection and unpacking", superpower: "Binary block parser" },
  { name: "stateutils", category: "File & Storage", description: "Managed persistent app state store with atomic rollback", superpower: "JSON State Engine" },
  { name: "cacheutils", category: "File & Storage", description: "O(1) LRU eviction cache & TTL cache with getOrSet", superpower: "In-Memory Store" },

  // 2. Data Structures & Math
  { name: "arrutils", category: "Data Structures", description: "Modern array & slice helpers: at (negative index), compact, chunk, keyBy, drop, take", superpower: "es-toolkit inspired" },
  { name: "objutils", category: "Data Structures", description: "Deep path access (get/set), pick, omit, deepMerge, isEqual", superpower: "es-toolkit inspired" },
  { name: "structutils", category: "Data Structures", description: "SimpleStack, SimpleQueue, circular SimpleRingBuffer, SimpleMinHeap", superpower: "Generic Collections" },
  { name: "statutils", category: "Data Structures", description: "Mean, median, mode, variance, std dev, quartiles, OLS regression", superpower: "Statistics Engine" },
  { name: "mathutils", category: "Data Structures", description: "lerp, remap, clamp, sumBy, Point2D, Rect, gcd, lcm", superpower: "Geometry & Math" },
  { name: "bitutils", category: "Data Structures", description: "Dynamic BitSet, popcount, and bitmask flag operators", superpower: "Bitwise Operations" },
  { name: "graphutils", category: "Data Structures", description: "Directed graphs (DAG), Kahn's topological sort, cycle detection, BFS/DFS", superpower: "Graph Theory" },

  // 3. Strings & Formats
  { name: "strutils", category: "Strings & Formats", description: "Case conversions, slugify, email/card privacy masking, Levenshtein", superpower: "Pure TypeScript" },
  { name: "regexutils", category: "Strings & Formats", description: "Pattern matching helpers: isMatch, findFirst, findAll, replace", superpower: "RegExp Engine" },
  { name: "templateutils", category: "Strings & Formats", description: "Template engine ({{key | default}}) and ANSI markdown renderer", superpower: "Regex Templater" },
  { name: "colorutils", category: "Strings & Formats", description: "Hex/RGB/HSL conversion, WCAG 2.1 contrast audit, 24-bit Truecolor", superpower: "Color Math" },
  { name: "htmlutils", category: "Strings & Formats", description: "HTML tag stripping, entity escaping, DOM link/tag extraction", superpower: "AST Parser" },
  { name: "diffutils", category: "Strings & Formats", description: "Line-level text diffing and unified diff generation with ANSI colors", superpower: "Diff Engine" },

  // 4. System & Runtime
  { name: "sysutils", category: "System & Runtime", description: "CPU cores, RAM, uptime, safe process execution, clipboard", superpower: "node:os" },
  { name: "cliutils", category: "System & Runtime", description: "ANSI terminal styling, progress bars, sparklines, gauges, trees", superpower: "Terminal Graphics" },
  { name: "envutils", category: "System & Runtime", description: "Type-safe environment variables (getStr, getInt, getBool), .env loader", superpower: "process.env" },
  { name: "shellutils", category: "System & Runtime", description: "Quiet subprocess execution, output piping, and PATH discovery", superpower: "Bun.$ & Bun.which" },
  { name: "globutils", category: "System & Runtime", description: "Filesystem glob pattern matching, directory scanning", superpower: "Bun.Glob" },
  { name: "transpileutils", category: "System & Runtime", description: "In-memory TypeScript transpilation, AST import/export scan, eval", superpower: "Bun.Transpiler" },
  { name: "logutils", category: "System & Runtime", description: "Structured leveled logging (DEBUG/INFO/WARN/ERROR) with JSON sinks", superpower: "Streams & Console" },
  { name: "cronutils", category: "System & Runtime", description: "Standard 5-field cron parsing, date matching, human descriptions", superpower: "Cron Engine" },
  { name: "semverutils", category: "System & Runtime", description: "SemVer 2.0.0 parsing, comparison, range matching (^, ~), version bumping", superpower: "SemVer Engine" },

  // 5. Network & Web
  { name: "netutils", category: "Network & Web", description: "Primary local IP, public IP probe, online check, TCP ping", superpower: "Sockets & OS" },
  { name: "httputils", category: "Network & Web", description: "Ergonomic HTTP client (getJson, postJson), query builder, retry", superpower: "Native fetch" },
  { name: "serverutils", category: "Network & Web", description: "Micro HTTP router, static file server, and WebSocket pub/sub hub", superpower: "Bun.serve" },
  { name: "urlutils", category: "Network & Web", description: "RFC 3986 URL parsing, query string builder, credential redaction", superpower: "WHATWG URL" },
  { name: "jwtutils", category: "Network & Web", description: "Zero-dependency HS256 JWT signing, verifying, and expiration", superpower: "WebCrypto HMAC" },
  { name: "cryptoutils", category: "Network & Web", description: "SHA-256, SHA-512, MD5, HMAC, Base64, UUID v4, password hashing", superpower: "Bun.password & WebCrypto" },
  { name: "hashutils", category: "Network & Web", description: "Ultra-fast non-cryptographic hashes (wyhash, crc32, cityHash) & Bloom filter", superpower: "Bun.hash" },

  // 6. Logic & Functions
  { name: "asyncutils", category: "Functions & Logic", description: "Bounded concurrency: parallelMap, parallelFilter, WaitGroup, WorkerPool", superpower: "Async/Await" },
  { name: "flowutils", category: "Functions & Logic", description: "Token Bucket RateLimiter, 3-state CircuitBreaker, exponential backoff retry", superpower: "Async Primitives" },
  { name: "fnutils", category: "Functions & Logic", description: "once, memoize, curry, partial, debounce, throttle, pipe, times", superpower: "es-toolkit inspired" },
  { name: "eventutils", category: "Functions & Logic", description: "In-memory publish-subscribe EventEmitter with wildcard support", superpower: "Event Dispatch" },
  { name: "validutils", category: "Functions & Logic", description: "High-speed validation: email, URL, IPv4/IPv6, alphanumeric, range", superpower: "RegExp Engine" },
  { name: "mockutils", category: "Functions & Logic", description: "Synthetic test data generator: mockUser, mockEmail, mockPhone, lorem", superpower: "Pseudorandom" },
  { name: "timeutils", category: "Functions & Logic", description: "Human relative time (2 hours ago), ISO formatting, Stopwatch", superpower: "performance.now" },
];

export function printRadHelp(): void {
  console.log(`
${colors.bold("Bun RAD Utilities CLI")} (44 Rapid Application Development Modules)
Ported from: https://github.com/codecaine-zz/bun_sys_utils

Usage:
  bun run cli:rad                     Run full 44-module benchmark showcase
  bun run cli:rad --list              List all 44 utility modules by category
  bun run cli:rad --module <name>     Run demonstration/test for a specific module
  bun run cli:rad --recipe <name>     Print TypeScript copy-paste recipe for a module
  bun run cli:rad --categories        List all 6 module categories
  bun run cli:rad --json              Output module catalog in JSON format
  bun run cli:rad --help              Display this help menu

Examples:
  bun run cli:rad --list
  bun run cli:rad --module fileutils
  bun run cli:rad --recipe arrutils
  bun run cli:rad --module sqliteutils
`);
}

export function printCatalogTable(): void {
  console.log(colors.bold(colors.cyan("\n=========================================================================================")));
  console.log(colors.bold(colors.cyan("   Bun RAD Development Suite: 44 Production-Grade Modules Catalog                        ")));
  console.log(colors.bold(colors.cyan("=========================================================================================\n")));

  const categories = Array.from(new Set(RAD_MODULES_CATALOG.map((m) => m.category)));

  for (const cat of categories) {
    console.log(colors.bold(colors.yellow(`▶ ${cat}:`)));
    const mods = RAD_MODULES_CATALOG.filter((m) => m.category === cat);
    for (const m of mods) {
      const namePadded = m.name.padEnd(16);
      const superPadded = m.superpower.padEnd(28);
      console.log(`  ${colors.bold(colors.green(namePadded))} ${colors.gray(`[${superPadded}]`)} ${m.description}`);
    }
    console.log();
  }
}

export function printRecipe(moduleName: string): void {
  const mod = RAD_MODULES_CATALOG.find((m) => m.name.toLowerCase() === moduleName.toLowerCase());
  if (!mod) {
    console.error(colors.red(`❌ Unknown module "${moduleName}". Use --list to see available modules.`));
    process.exit(1);
  }

  console.log(colors.bold(colors.cyan(`\n// Recipe: ${mod.name} (${mod.category})`)));
  console.log(colors.gray(`// Superpower: ${mod.superpower}`));
  console.log(colors.gray(`// ${mod.description}\n`));
  console.log(colors.green(`import { ${mod.name} } from "./src/features/rad/index.ts";`));
  console.log(colors.green(`// or: import { rad } from "./src/features/rad/index.ts";\n`));

  switch (mod.name) {
    case "fileutils":
      console.log(`await fileutils.saveJson("/tmp/data.json", { status: "ok" });
const data = await fileutils.loadJson<{ status: string }>("/tmp/data.json");
console.log(data.status);`);
      break;
    case "sqliteutils":
      console.log(`const db = sqliteutils.openDb(":memory:");
sqliteutils.createKvTable(db, "settings");
sqliteutils.setKv(db, "settings", "theme", "midnight");
console.log(sqliteutils.getKv(db, "settings", "theme"));
sqliteutils.closeDb(db);`);
      break;
    case "arrutils":
      console.log(`const items = ["alpha", "beta", "gamma"];
console.log(arrutils.at(items, -1)); // "gamma"
console.log(arrutils.chunk([1, 2, 3, 4], 2)); // [[1, 2], [3, 4]]
console.log(arrutils.compact([0, 1, false, 2, ""])); // [1, 2]`);
      break;
    case "objutils":
      console.log(`const user = { profile: { name: "Alice" } };
console.log(objutils.get(user, "profile.name")); // "Alice"
console.log(objutils.pick({ a: 1, b: 2, c: 3 }, ["a", "c"])); // { a: 1, c: 3 }`);
      break;
    case "fnutils":
      console.log(`const memoized = fnutils.memoize((x: number) => x * x);
console.log(memoized(5)); // 25
const piped = fnutils.pipe(10, (x: number) => x * 2, (x: number) => x + 5);
console.log(piped); // 25`);
      break;
    case "globutils":
      console.log(`const jsonFiles = await globutils.glob("*.json");
console.log(jsonFiles);`);
      break;
    case "shellutils":
      console.log(`const result = await shellutils.exec(["echo", "Hello Bun"]);
console.log(result.stdout.trim());`);
      break;
    case "hashutils":
      console.log(`const hash = hashutils.wyhash("quick string");
const bloom = hashutils.createBloomFilter(1000);
bloom.add("key1");
console.log(bloom.has("key1")); // true`);
      break;
    default:
      console.log(`// Example usage for ${mod.name}:
console.log(${mod.name});`);
      break;
  }
  console.log();
}

export async function runSingleModuleDemo(moduleName: string): Promise<void> {
  const mod = RAD_MODULES_CATALOG.find((m) => m.name.toLowerCase() === moduleName.toLowerCase());
  if (!mod) {
    console.error(colors.red(`❌ Unknown module "${moduleName}". Use --list to see available modules.`));
    process.exit(1);
  }

  console.log(colors.bold(colors.cyan(`\n⚡ Running demonstration for [${mod.name}] (${mod.category})...`)));
  const sw = rad.timeutils.createStopwatch();
  sw.start();

  try {
    switch (mod.name) {
      case "fileutils": {
        const tmp = "/tmp/bun_rad_cli_test.json";
        await rad.fileutils.saveJson(tmp, { test: true, timestamp: Date.now() });
        const loaded = await rad.fileutils.loadJson<any>(tmp);
        console.log(colors.green(`✓ JSON atomic write & read: ${JSON.stringify(loaded)}`));
        break;
      }
      case "sqliteutils": {
        const db = rad.sqliteutils.openDb(":memory:");
        rad.sqliteutils.createKvTable(db, "store");
        rad.sqliteutils.setKv(db, "store", "key1", "val1");
        console.log(colors.green(`✓ SQLite KV stored & read: key1 = "${rad.sqliteutils.getKv(db, "store", "key1")}"`));
        rad.sqliteutils.closeDb(db);
        break;
      }
      case "strutils": {
        console.log(colors.green(`✓ Slugify: "${rad.strutils.slugify("Bun RAD Studio 2026")}"`));
        console.log(colors.green(`✓ Mask email: "${rad.strutils.maskEmail("developer@example.com")}"`));
        console.log(colors.green(`✓ Levenshtein distance: ${rad.strutils.levenshteinDistance("bun", "fun")}`));
        break;
      }
      case "arrutils":
      case "sliceutils": {
        const arr = ["a", "b", "c", "d"];
        console.log(colors.green(`✓ arrutils.at(-1): "${rad.arrutils.at(arr, -1)}"`));
        console.log(colors.green(`✓ arrutils.chunk: ${JSON.stringify(rad.arrutils.chunk(arr, 2))}`));
        break;
      }
      case "objutils": {
        const obj = { nested: { val: 42 } };
        console.log(colors.green(`✓ objutils.get: ${rad.objutils.get(obj, "nested.val")}`));
        console.log(colors.green(`✓ objutils.isEqual: ${rad.objutils.isEqual({ a: 1 }, { a: 1 })}`));
        break;
      }
      case "fnutils": {
        const piped = rad.fnutils.pipe(5, (x: number) => x * 3, (x: number) => x + 1);
        console.log(colors.green(`✓ fnutils.pipe: ${piped}`));
        break;
      }
      case "globutils": {
        const files = await rad.globutils.glob("*.json");
        console.log(colors.green(`✓ globutils found json files: ${files.join(", ")}`));
        break;
      }
      case "shellutils": {
        const bunPath = rad.shellutils.which("bun");
        console.log(colors.green(`✓ shellutils which bun: ${bunPath}`));
        break;
      }
      case "hashutils": {
        const h = rad.hashutils.wyhash("test");
        console.log(colors.green(`✓ hashutils wyhash: ${h}`));
        break;
      }
      default: {
        const modObj = (rad as any)[mod.name];
        console.log(colors.green(`✓ Module "${mod.name}" initialized with ${Object.keys(modObj || {}).length} methods`));
        break;
      }
    }
  } finally {
    sw.stop();
    console.log(colors.gray(`Completed in ${sw.elapsedMs().toFixed(2)}ms\n`));
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printRadHelp();
    return;
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(RAD_MODULES_CATALOG, null, 2));
    return;
  }

  if (args.includes("--list") || args.includes("-l")) {
    printCatalogTable();
    return;
  }

  if (args.includes("--categories")) {
    const categories = Array.from(new Set(RAD_MODULES_CATALOG.map((m) => m.category)));
    console.log(colors.bold(colors.cyan("\nRAD Utility Categories:")));
    categories.forEach((c) => console.log(` - ${c}`));
    console.log();
    return;
  }

  const recipeIdx = args.findIndex((a) => a === "--recipe" || a === "-r");
  if (recipeIdx !== -1 && args[recipeIdx + 1]) {
    printRecipe(args[recipeIdx + 1]!);
    return;
  }

  const modIdx = args.findIndex((a) => a === "--module" || a === "-m");
  if (modIdx !== -1 && args[modIdx + 1]) {
    await runSingleModuleDemo(args[modIdx + 1]!);
    return;
  }

  // Positional argument if passed
  if (args.length === 1 && !args[0]?.startsWith("-")) {
    const candidate = args[0]!;
    if (RAD_MODULES_CATALOG.some((m) => m.name.toLowerCase() === candidate.toLowerCase())) {
      await runSingleModuleDemo(candidate);
      return;
    }
  }

  // Default: run full showcase
  await runRadShowcase();
}

if (import.meta.main) {
  await main();
}
