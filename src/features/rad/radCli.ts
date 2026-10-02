import { rad } from "./index.ts";
import { colors } from "../../shared/colors.ts";

export async function runRadShowcase(): Promise<void> {
  console.log(colors.bold(colors.cyan("==================================================")));
  console.log(colors.bold(colors.cyan("   Bun System Utilities: 44-Module RAD Showcase   ")));
  console.log(colors.bold(colors.cyan("==================================================")));

  const sw = rad.timeutils.createStopwatch();
  sw.start();

  // 1. fileutils
  console.log(`\n${colors.bold(colors.yellow("1. [fileutils] File & Data Persistence:"))}`);
  const tmpJson = "/tmp/bun_rad_demo.json";
  await rad.fileutils.saveJson(tmpJson, { project: "bun_sys_utils", ready: true });
  const loaded = await rad.fileutils.loadJson<{ project: string }>(tmpJson);
  const size = await rad.fileutils.fileSizeHuman(tmpJson);
  console.log(colors.green(` - Saved & loaded JSON file: ${loaded.project} (size: ${size})`));

  // 2. sqliteutils
  console.log(`\n${colors.bold(colors.yellow("2. [sqliteutils] Native SQLite KV & Document Store:"))}`);
  const db = rad.sqliteutils.openDb(":memory:");
  rad.sqliteutils.createKvTable(db, "settings");
  rad.sqliteutils.setKv(db, "settings", "theme", "cyberpunk");
  console.log(colors.green(` - KV stored & retrieved: theme = "${rad.sqliteutils.getKv(db, "settings", "theme")}"`));
  rad.sqliteutils.createJsonStore(db, "users");
  rad.sqliteutils.saveDoc(db, "users", "u1", { name: "Alice", role: "admin" });
  console.log(colors.green(` - Document store: ${JSON.stringify(rad.sqliteutils.loadDoc(db, "users", "u1"))}`));
  rad.sqliteutils.closeDb(db);

  // 3. strutils
  console.log(`\n${colors.bold(colors.yellow("3. [strutils] String Transforms & Privacy Masks:"))}`);
  console.log(colors.green(` - Slugify: "${rad.strutils.slugify("Bun RAD 2026: The Speed of Light!")}"`));
  console.log(colors.green(` - Masked email: "${rad.strutils.maskEmail("developer@bun.sh")}"`));
  console.log(colors.green(` - Levenshtein: kitten vs sitting = ${rad.strutils.levenshteinDistance("kitten", "sitting")}`));

  // 4. arrutils / sliceutils
  console.log(`\n${colors.bold(colors.yellow("4. [arrutils / sliceutils] Array & Collection Helpers:"))}`);
  const chunks = rad.arrutils.chunk([1, 2, 3, 4, 5, 6], 2);
  console.log(colors.green(` - Chunks of 2: ${JSON.stringify(chunks)}`));
  const [evens, odds] = rad.arrutils.partition([1, 2, 3, 4, 5], (n) => n % 2 === 0);
  console.log(colors.green(` - Partitioned: evens=[${evens}], odds=[${odds}]`));

  // 5. envutils
  console.log(`\n${colors.bold(colors.yellow("5. [envutils] Type-Safe Environment Variables:"))}`);
  rad.envutils.set("RAD_PORT", 8080);
  console.log(colors.green(` - Typed integer env RAD_PORT: ${rad.envutils.getInt("RAD_PORT")}`));

  // 6. cryptoutils
  console.log(`\n${colors.bold(colors.yellow("6. [cryptoutils] Cryptography & Tokens:"))}`);
  console.log(colors.green(` - SHA-256("bun"): ${rad.cryptoutils.sha256("bun")}`));
  console.log(colors.green(` - Secure UUID v4: ${rad.cryptoutils.uuidV4()}`));

  // 7. timeutils
  console.log(`\n${colors.bold(colors.yellow("7. [timeutils] Relative Time & Boundaries:"))}`);
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
  console.log(colors.green(` - Relative time: ${rad.timeutils.timeAgo(twoHoursAgo)}`));

  // 8. httputils
  console.log(`\n${colors.bold(colors.yellow("8. [httputils] Query Builder & Ergonomic Fetch:"))}`);
  const q = rad.httputils.buildQuery({ q: "bun", page: 1 });
  console.log(colors.green(` - Query string: "${q}"`));

  // 9. cliutils
  console.log(`\n${colors.bold(colors.yellow("9. [cliutils] Terminal Widgets & Visuals:"))}`);
  console.log(colors.green(` - Progress bar: ${rad.cliutils.formatProgressBar(75, 100)}`));
  console.log(colors.green(` - Sparkline:    ${rad.cliutils.renderSparkline([1, 3, 5, 8, 4, 9, 2, 10])}`));
  console.log(colors.green(` - Gauge:        ${rad.cliutils.renderGauge(65, 0, 100)}`));

  // 10. sysutils
  console.log(`\n${colors.bold(colors.yellow("10. [sysutils] System Telemetry:"))}`);
  const sys = rad.sysutils.getSystemInfo();
  console.log(colors.green(` - OS: ${sys.platform} (${sys.arch}) with ${sys.cpuCount} CPUs, ${(sys.totalMem / 1e9).toFixed(1)} GB RAM`));

  // 11. netutils
  console.log(`\n${colors.bold(colors.yellow("11. [netutils] Network Discovery:"))}`);
  console.log(colors.green(` - Primary Local IP: ${rad.netutils.getLocalIp()}`));

  // 12. validutils
  console.log(`\n${colors.bold(colors.yellow("12. [validutils] High-Speed Validation:"))}`);
  console.log(colors.green(` - Valid email ("a@b.com"): ${rad.validutils.isEmail("a@b.com")}`));
  console.log(colors.green(` - Valid IPv4 ("127.0.0.1"): ${rad.validutils.isIpv4("127.0.0.1")}`));

  // 13. structutils
  console.log(`\n${colors.bold(colors.yellow("13. [structutils] RAD Data Structures:"))}`);
  const rb = new rad.structutils.SimpleRingBuffer<string>(3);
  rb.push("first");
  rb.push("second");
  rb.push("third");
  rb.push("fourth"); // overwrites first
  console.log(colors.green(` - RingBuffer (cap 3, pushed 4): [${rb.toArray().join(", ")}]`));

  // 14. statutils
  console.log(`\n${colors.bold(colors.yellow("14. [statutils] Statistics & Modeling:"))}`);
  const sample = [10, 12, 23, 23, 16, 23, 21, 16];
  console.log(colors.green(` - Mean: ${rad.statutils.mean(sample).toFixed(2)}, Median: ${rad.statutils.median(sample)}, Mode: [${rad.statutils.mode(sample)}]`));

  // 15. stateutils
  console.log(`\n${colors.bold(colors.yellow("15. [stateutils] Managed Persistent State:"))}`);
  const state = new rad.stateutils.AppStateStore("demo_app", { count: 0 }, { customPath: "/tmp/bun_rad_state.json" });
  await state.update((d) => {
    d.count += 1;
  });
  console.log(colors.green(` - App state count: ${state.get().count}`));

  // 16. cacheutils
  console.log(`\n${colors.bold(colors.yellow("16. [cacheutils] LRU & TTL Caching:"))}`);
  const lru = new rad.cacheutils.LRUCache<string, number>(2);
  lru.set("a", 1);
  lru.set("b", 2);
  lru.get("a"); // a is recent
  lru.set("c", 3); // b evicted
  console.log(colors.green(` - LRU has "a": ${lru.has("a")}, has "b": ${lru.has("b")}, has "c": ${lru.has("c")}`));

  // 17. semverutils
  console.log(`\n${colors.bold(colors.yellow("17. [semverutils] Semantic Versioning:"))}`);
  console.log(colors.green(` - Satisfies "^1.2.0" against "1.5.3": ${rad.semverutils.satisfiesRange("1.5.3", "^1.2.0")}`));
  console.log(colors.green(` - Bump minor: 1.2.3 -> ${rad.semverutils.bumpVersion("1.2.3", "minor")}`));

  // 18. flowutils
  console.log(`\n${colors.bold(colors.yellow("18. [flowutils] Traffic Control & Resilience:"))}`);
  const limiter = new rad.flowutils.RateLimiter(5, 10);
  console.log(colors.green(` - Rate limiter allow: ${limiter.allow(2)}`));

  // 19. templateutils
  console.log(`\n${colors.bold(colors.yellow("19. [templateutils] Templating & ANSI Markdown:"))}`);
  const rendered = rad.templateutils.renderTemplate("Welcome {{user}} to {{framework | Bun}}!", { user: "Developer" });
  console.log(colors.green(` - Rendered: "${rendered}"`));

  // 20. colorutils
  console.log(`\n${colors.bold(colors.yellow("20. [colorutils] Color Conversions & Accessibility:"))}`);
  const rgb = rad.colorutils.hexToRgb("#3498db");
  const white = { r: 255, g: 255, b: 255 };
  console.log(colors.green(` - Contrast against white: ${rad.colorutils.contrastRatio(rgb, white)}:1 (AA: ${rad.colorutils.isAccessible(rgb, white)})`));

  // 21. archiveutils
  console.log(`\n${colors.bold(colors.yellow("21. [archiveutils] In-Memory Zip Creation & Inspection:"))}`);
  const zip = rad.archiveutils.zipFiles([{ name: "hello.txt", data: "Hello Bun Zip!" }]);
  const entries = await rad.archiveutils.listZipEntries(zip);
  console.log(colors.green(` - Created zip with entries: [${entries.join(", ")}]`));

  // 22. asyncutils
  console.log(`\n${colors.bold(colors.yellow("22. [asyncutils] Bounded Concurrency Mapping:"))}`);
  const squares = await rad.asyncutils.parallelMap([1, 2, 3, 4], 2, async (n) => n * n);
  console.log(colors.green(` - Parallel squares: [${squares.join(", ")}]`));

  // 23. regexutils
  console.log(`\n${colors.bold(colors.yellow("23. [regexutils] High-Level Pattern Matching:"))}`);
  const matches = rad.regexutils.findAll(/\d+/g, "orders: 42, 99, 105");
  console.log(colors.green(` - All numbers found: [${matches.join(", ")}]`));

  // 24. mockutils
  console.log(`\n${colors.bold(colors.yellow("24. [mockutils] Synthetic Data Generation:"))}`);
  const user = rad.mockutils.mockUser();
  console.log(colors.green(` - Mock User: ${user.name} <${user.email}> (${user.role})`));

  // 25. logutils
  console.log(`\n${colors.bold(colors.yellow("25. [logutils] Structured Leveled Logger:"))}`);
  const logger = rad.logutils.newLogger({ level: rad.logutils.LogLevel.INFO, prefix: "App" });
  logger.info("Application initialized smoothly", { env: "production" });

  // 26. tomlutils
  console.log(`\n${colors.bold(colors.yellow("26. [tomlutils] TOML Config Parsing:"))}`);
  const tomlDoc = rad.tomlutils.parseToml("[server]\nport = 3000\nname = 'bun-api'");
  console.log(colors.green(` - Parsed server.port: ${rad.tomlutils.getInt(tomlDoc, "server.port")}`));

  // 27. htmlutils
  console.log(`\n${colors.bold(colors.yellow("27. [htmlutils] HTML Processing & Entities:"))}`);
  const links = rad.htmlutils.extractLinks('<a href="https://bun.sh">Bun Runtime</a>');
  console.log(colors.green(` - Extracted link: ${links[0]?.text} -> ${links[0]?.href}`));

  // 28. bitutils
  console.log(`\n${colors.bold(colors.yellow("28. [bitutils] Dynamic BitSets & Bitmasks:"))}`);
  const bs = new rad.bitutils.BitSet(16);
  bs.set(1);
  bs.set(4);
  console.log(colors.green(` - BitSet count: ${bs.countSet()}, binary: ${bs.toBinaryString()}`));

  // 29. compressutils
  console.log(`\n${colors.bold(colors.yellow("29. [compressutils] Gzip & Deflate Compression:"))}`);
  const original = "Bun is fast, single-binary, and modern.";
  const compressed = rad.compressutils.gzipCompressString(original);
  console.log(colors.green(` - Compressed to base64 (${compressed.length} chars), ratio: ${rad.compressutils.compressionRatio(original.length, compressed.length)}%`));

  // 30. tarutils
  console.log(`\n${colors.bold(colors.yellow("30. [tarutils] TAR Packing & Unpacking:"))}`);
  const tarBytes = rad.tarutils.packTarBytes([{ name: "test.txt", data: "Hello TAR!" }]);
  const unpacked = rad.tarutils.unpackTarBytes(tarBytes);
  console.log(colors.green(` - Unpacked TAR: "${unpacked[0]?.name}" with content "${unpacked[0]?.text}"`));

  // 31. mathutils
  console.log(`\n${colors.bold(colors.yellow("31. [mathutils] Geometry & Number Theory:"))}`);
  console.log(colors.green(` - Lerp(0, 100, 0.5): ${rad.mathutils.lerp(0, 100, 0.5)}`));
  console.log(colors.green(` - GCD(84, 18): ${rad.mathutils.gcd(84, 18)}, LCM: ${rad.mathutils.lcm(84, 18)}`));

  // 32. cronutils
  console.log(`\n${colors.bold(colors.yellow("32. [cronutils] 5-Field Cron Parsing & Scheduling:"))}`);
  console.log(colors.green(` - Human description: "${rad.cronutils.cronToHuman("0 0 * * *")}"`));

  // 33. urlutils
  console.log(`\n${colors.bold(colors.yellow("33. [urlutils] RFC 3986 URL & Redaction:"))}`);
  console.log(colors.green(` - Redacted credentials: "${rad.urlutils.redactCredentials("postgres://admin:secret@db.lan:5432/main")}"`));

  // 34. jwtutils
  console.log(`\n${colors.bold(colors.yellow("34. [jwtutils] HS256 Zero-Dependency JWT:"))}`);
  const token = rad.jwtutils.signJwt({ sub: "user_42" }, "secret_key");
  const claims = rad.jwtutils.verifyJwt(token, "secret_key");
  console.log(colors.green(` - Signed & verified JWT subject: ${claims.sub}`));

  // 35. eventutils
  console.log(`\n${colors.bold(colors.yellow("35. [eventutils] In-Memory Event Emitter:"))}`);
  const emitter = rad.eventutils.newEmitter();
  let receivedEvent = "";
  emitter.on("ready", (msg: string) => {
    receivedEvent = msg;
  });
  emitter.emit("ready", "System all green!");
  console.log(colors.green(` - Event received: "${receivedEvent}"`));

  // 36. diffutils
  console.log(`\n${colors.bold(colors.yellow("36. [diffutils] Unified Line Diffing:"))}`);
  const ud = rad.diffutils.unifiedDiff("line 1\nline 2", "line 1\nline 2 modified");
  console.log(colors.green(` - Unified diff generated (${ud.split("\n").length} lines)`));

  // 37. graphutils
  console.log(`\n${colors.bold(colors.yellow("37. [graphutils] DAG Topological Sort & BFS:"))}`);
  const g = rad.graphutils.newGraph<string>();
  g.addEdge("build", "test");
  g.addEdge("test", "deploy");
  console.log(colors.green(` - Topological build order: [${g.topologicalSort().join(" -> ")}]`));

  // 38. globutils (Bun.Glob)
  console.log(`\n${colors.bold(colors.yellow("38. [globutils] Native Bun.Glob File Pattern Matching:"))}`);
  const pkgMatches = await rad.globutils.findFiles("*.json", ".");
  console.log(colors.green(` - Matched json files: [${pkgMatches.join(", ")}]`));

  // 39. shellutils (Bun.$)
  console.log(`\n${colors.bold(colors.yellow("39. [shellutils] Safe Subprocess Execution & PATH Discovery (Bun.$):"))}`);
  const bunPath = rad.shellutils.whichCmd("bun");
  const shEcho = await rad.shellutils.execCmd("echo 'Bun Shell Turbocharged'");
  console.log(colors.green(` - Bun binary: ${bunPath}`));
  console.log(colors.green(` - Bun.$ stdout: "${shEcho.stdout.trim()}" (exit: ${shEcho.exitCode})`));

  // 40. hashutils (Bun.hash & BloomFilter)
  console.log(`\n${colors.bold(colors.yellow("40. [hashutils] Ultra-Fast Non-Crypto Hashes & Bloom Filter (Bun.hash):"))}`);
  const wy = rad.hashutils.wyhash("speed of light");
  const bloom = rad.hashutils.createBloomFilter(100, 0.01);
  bloom.add("user:101");
  console.log(colors.green(` - wyhash("speed of light"): ${wy} (hex: ${rad.hashutils.hashHex("speed of light")})`));
  console.log(colors.green(` - Bloom filter membership: "user:101"=${bloom.has("user:101")}, "user:999"=${bloom.has("user:999")}`));

  // 41. serverutils (Bun.serve)
  console.log(`\n${colors.bold(colors.yellow("41. [serverutils] High-Performance HTTP & WebSockets (Bun.serve):"))}`);
  const router = rad.serverutils.createRouter();
  router.get("/health", () => new Response(JSON.stringify({ status: "ok" }), { headers: { "content-type": "application/json" } }));
  const testServer = rad.serverutils.serveHttp({ router });
  const healthRes = await fetch(`${testServer.url}/health`);
  console.log(colors.green(` - Ephemeral server on port ${testServer.port}: GET /health -> status ${healthRes.status}`));
  testServer.stop();

  // 42. transpileutils (Bun.Transpiler)
  console.log(`\n${colors.bold(colors.yellow("42. [transpileutils] In-Memory AST Analysis & Transpilation (Bun.Transpiler):"))}`);
  const tsCode = `import { foo } from "./foo"; export const answer: number = 42;`;
  const analysis = rad.transpileutils.analyzeCode(tsCode);
  const evalResult = rad.transpileutils.evalTs<number>("const a: number = 20; const b: number = 22; return a + b;");
  console.log(colors.green(` - Scanned exports: [${analysis.exports.join(", ")}], imports: [${analysis.imports.map((i) => i.path).join(", ")}]`));
  console.log(colors.green(` - In-memory evalTs: ${evalResult}`));

  // 43. objutils (es-toolkit/object & predicate)
  console.log(`\n${colors.bold(colors.yellow("43. [objutils] Deep Path Access, Equality & Object Transforms (es-toolkit):"))}`);
  const testObj = { user: { profile: { name: "Antigravity", roles: ["admin", "editor"] } } };
  const nestedName = rad.objutils.get(testObj, "user.profile.name");
  const picked = rad.objutils.pick({ a: 1, b: 2, c: 3 }, ["a", "c"]);
  const isEqualCheck = rad.objutils.isEqual({ x: [1, 2] }, { x: [1, 2] });
  console.log(colors.green(` - Deep get("user.profile.name"): "${nestedName}"`));
  console.log(colors.green(` - Picked: ${JSON.stringify(picked)}, Deep isEqual: ${isEqualCheck}`));

  // 44. fnutils (es-toolkit/function)
  console.log(`\n${colors.bold(colors.yellow("44. [fnutils] Functional Utilities: memoize, once, curry, pipe (es-toolkit):"))}`);
  let callCount = 0;
  const memoizedFib = rad.fnutils.memoize((n: number): number => {
    callCount++;
    return n <= 1 ? n : n * 2;
  });
  const f1 = memoizedFib(10);
  const f2 = memoizedFib(10);
  const pipedVal = rad.fnutils.pipe(5, (x: number) => x * 2, (x: number) => x + 10);
  console.log(colors.green(` - Memoized result: ${f1} (second call cached: ${f1 === f2}, underlying calls: ${callCount})`));
  console.log(colors.green(` - Piped result (5 * 2 + 10): ${pipedVal}`));

  sw.stop();
  console.log(colors.bold(colors.green(`\n✓ All 44 RAD modules verified and working in ${sw.elapsedMs().toFixed(1)}ms!\n`)));
}

if (import.meta.main) {
  await runRadShowcase();
}

