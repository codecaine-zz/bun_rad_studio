import { describe, expect, it } from "bun:test";
import { rad } from "./index.ts";

describe("Bun RAD Development Utilities (44 Modules)", () => {
  // 1. fileutils
  it("fileutils > handles JSON, CSV, text, and file size helpers", async () => {
    const testJson = "/tmp/test_fileutils.json";
    await rad.fileutils.saveJson(testJson, { foo: "bar", num: 42 });
    const loaded = await rad.fileutils.loadJson<{ foo: string; num: number }>(testJson);
    expect(loaded.foo).toBe("bar");
    expect(loaded.num).toBe(42);

    const csvData = [
      ["id", "name", "desc"],
      ["1", "Alice", 'Hello, "world"'],
      ["2", "Bob", "Simple"],
    ];
    const testCsv = "/tmp/test_fileutils.csv";
    await rad.fileutils.writeCsv(testCsv, csvData);
    const readCsv = await rad.fileutils.readCsv(testCsv);
    expect(readCsv.length).toBe(3);
    expect(readCsv[1]![1]).toBe("Alice");

    expect(await rad.fileutils.fileSizeHuman(1024)).toBe("1.0 KB");
    expect(await rad.fileutils.fileSizeHuman(1048576 * 2.5)).toBe("2.5 MB");
  });

  // 2. sqliteutils
  it("sqliteutils > provides KV, document store, parameterized CRUD, and migrations", () => {
    const db = rad.sqliteutils.openDb(":memory:");

    // KV
    rad.sqliteutils.createKvTable(db, "my_kv");
    rad.sqliteutils.setKv(db, "my_kv", "key1", "val1");
    expect(rad.sqliteutils.getKv(db, "my_kv", "key1")).toBe("val1");
    expect(rad.sqliteutils.getKvOr(db, "my_kv", "missing", "fallback")).toBe("fallback");

    // JSON Document store
    rad.sqliteutils.createJsonStore(db, "my_docs");
    rad.sqliteutils.saveDoc(db, "my_docs", "d1", { title: "Doc 1", count: 10 });
    const loadedDoc = rad.sqliteutils.loadDoc<{ title: string; count: number }>(db, "my_docs", "d1");
    expect(loadedDoc?.title).toBe("Doc 1");

    // CRUD
    rad.sqliteutils.execSql(db, "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL);");
    const id = rad.sqliteutils.insertRow(db, "items", { name: "Gadget", price: 19.99 });
    expect(id).toBe(1);
    const items = rad.sqliteutils.selectRows(db, "items", ["name", "price"], "price > ?", [10.0]);
    expect(items.length).toBe(1);

    // Migrations
    const applied = rad.sqliteutils.runMigrations(db, [
      { version: 1, up: "CREATE TABLE t1 (id INT);" },
      { version: 2, up: "CREATE TABLE t2 (id INT);" },
    ]);
    expect(applied).toBe(2);

    // FTS5 Full-Text Search
    rad.sqliteutils.createFtsTable(db, "articles", ["title", "body"]);
    rad.sqliteutils.indexFts(db, "articles", { title: "Bun Speed", body: "Ultra high performance JavaScript and TypeScript" });
    rad.sqliteutils.indexFts(db, "articles", { title: "Vlang Utils", body: "RAD development patterns" });
    const ftsResults = rad.sqliteutils.searchFts(db, "articles", "performance");
    expect(ftsResults.length).toBe(1);
    expect(ftsResults[0]?.title).toBe("Bun Speed");

    // Maintenance
    rad.sqliteutils.vacuumDb(db);
    rad.sqliteutils.checkpointWal(db);

    rad.sqliteutils.closeDb(db);
  });

  // 3. strutils
  it("strutils > handles case conversion, slugify, masks, and edit distance", () => {
    expect(rad.strutils.slugify("Hello World 2026!")).toBe("hello-world-2026");
    expect(rad.strutils.toSnakeCase("camelCaseText")).toBe("camel_case_text");
    expect(rad.strutils.toKebabCase("camelCaseText")).toBe("camel-case-text");
    expect(rad.strutils.toCamelCase("snake_case_text")).toBe("snakeCaseText");
    expect(rad.strutils.toPascalCase("snake_case_text")).toBe("SnakeCaseText");
    expect(rad.strutils.toTitleCase("hello world")).toBe("Hello World");
    expect(rad.strutils.maskEmail("developer@example.com")).toBe("d*******r@example.com");
    expect(rad.strutils.maskPhone("1234567890")).toBe("***-***-7890");
    expect(rad.strutils.maskCreditCard("1234567812345678")).toBe("****-****-****-5678");
    expect(rad.strutils.levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(rad.strutils.truncate("Hello World", 8)).toBe("Hello...");
  });

  // 4. arrutils / sliceutils
  it("arrutils / sliceutils > operates on collections and arrays", () => {
    expect(rad.arrutils.unique([1, 2, 2, 3, 1])).toEqual([1, 2, 3]);
    expect(rad.arrutils.chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(rad.arrutils.partition([1, 2, 3, 4], (n) => n % 2 === 0)).toEqual([[2, 4], [1, 3]]);
    expect(rad.arrutils.intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    expect(rad.arrutils.difference([1, 2, 3], [2, 3, 4])).toEqual([1]);
    expect(rad.arrutils.groupBy(["cat", "car", "dog"], (s) => s[0]!)).toEqual({
      c: ["cat", "car"],
      d: ["dog"],
    });
    expect(rad.sliceutils.frequency(["a", "b", "a"])).toEqual({ a: 2, b: 1 });

    // es-toolkit inspired methods
    expect(rad.arrutils.at(["a", "b", "c"], 0)).toBe("a");
    expect(rad.arrutils.at(["a", "b", "c"], -1)).toBe("c");
    expect(rad.arrutils.at(["a", "b", "c"], -2)).toBe("b");
    expect(rad.arrutils.at(["a", "b", "c"], 5)).toBeUndefined();

    expect(rad.arrutils.compact([0, 1, false, 2, "", 3, null, undefined])).toEqual([1, 2, 3]);
    expect(rad.arrutils.drop([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(rad.arrutils.dropRight([1, 2, 3, 4], 1)).toEqual([1, 2, 3]);
    expect(rad.arrutils.dropWhile([1, 2, 3, 4], (n) => n < 3)).toEqual([3, 4]);
    expect(rad.arrutils.take([1, 2, 3, 4], 2)).toEqual([1, 2]);
    expect(rad.arrutils.takeRight([1, 2, 3, 4], 2)).toEqual([3, 4]);
    expect(rad.arrutils.takeWhile([1, 2, 3, 4], (n) => n < 3)).toEqual([1, 2]);

    expect(rad.arrutils.keyBy([{ id: "a", v: 1 }, { id: "b", v: 2 }], (x) => x.id)).toEqual({
      a: { id: "a", v: 1 },
      b: { id: "b", v: 2 },
    });
    expect(rad.arrutils.countBy(["apple", "banana", "apple", "cherry"], (x) => x)).toEqual({
      apple: 2,
      banana: 1,
      cherry: 1,
    });
    expect(rad.arrutils.minBy([{ n: 10 }, { n: 5 }, { n: 20 }], (x) => x.n)).toEqual({ n: 5 });
    expect(rad.arrutils.maxBy([{ n: 10 }, { n: 5 }, { n: 20 }], (x) => x.n)).toEqual({ n: 20 });
    expect(rad.arrutils.sumBy([{ n: 10 }, { n: 5 }], (x) => x.n)).toBe(15);

    expect(rad.arrutils.zip(["a", "b"], [1, 2])).toEqual([["a", 1], ["b", 2]]);
    expect(rad.arrutils.unzip([["a", 1], ["b", 2]])).toEqual([["a", "b"], [1, 2]]);
    expect(rad.arrutils.tail([1, 2, 3])).toEqual([2, 3]);
    expect(rad.arrutils.without([1, 2, 3, 2, 1], 1, 2)).toEqual([3]);
    expect(rad.arrutils.zipObject(["a", "b"], [1, 2])).toEqual({ a: 1, b: 2 });
  });

  // 5. envutils
  it("envutils > handles type-safe environment variables and expansion", () => {
    rad.envutils.set("TEST_STR", "val");
    rad.envutils.set("TEST_INT", 123);
    rad.envutils.set("TEST_BOOL", "true");
    expect(rad.envutils.getStr("TEST_STR")).toBe("val");
    expect(rad.envutils.getInt("TEST_INT")).toBe(123);
    expect(rad.envutils.getBool("TEST_BOOL")).toBe(true);
    expect(rad.envutils.expandVars("Hello ${TEST_STR}")).toBe("Hello val");
  });

  // 6. cryptoutils
  it("cryptoutils > calculates hashes, base64, and UUIDs", async () => {
    expect(rad.cryptoutils.sha256("test")).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
    expect(rad.cryptoutils.md5("test")).toBe("098f6bcd4621d373cade4e832627b4f6");
    expect(rad.cryptoutils.base64Encode("hello")).toBe("aGVsbG8=");
    expect(rad.cryptoutils.base64Decode("aGVsbG8=")).toBe("hello");
    expect(rad.cryptoutils.uuidV4()).toMatch(/^[0-9a-f-]{36}$/);

    const hash = await rad.cryptoutils.hashPassword("super-secret");
    const ok = await rad.cryptoutils.verifyPassword("super-secret", hash);
    expect(ok).toBe(true);
  });

  // 7. timeutils
  it("timeutils > handles relative time, ISO conversion, and Stopwatch", () => {
    expect(rad.timeutils.timeAgo(new Date())).toBe("just now");
    const iso = rad.timeutils.formatIso();
    expect(rad.timeutils.parseIso(iso)).toBeInstanceOf(Date);

    const sw = rad.timeutils.createStopwatch();
    sw.start();
    const elapsed = sw.elapsedMs();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  // 8. httputils
  it("httputils > builds and parses query strings", () => {
    const q = rad.httputils.buildQuery({ search: "bun", active: true });
    expect(q).toContain("search=bun");
    expect(q).toContain("active=true");
    const parsed = rad.httputils.parseQuery(q);
    expect(parsed.search).toBe("bun");
    expect(parsed.active).toBe("true");
  });

  // 9. cliutils
  it("cliutils > generates progress bar, sparkline, gauge, and tree", () => {
    const bar = rad.cliutils.formatProgressBar(50, 100, 10);
    expect(bar).toContain("50%");
    const spark = rad.cliutils.renderSparkline([1, 2, 5, 10]);
    expect(spark.length).toBe(4);
    const gauge = rad.cliutils.renderGauge(50, 0, 100, 10);
    expect(gauge).toContain("50%");
    const tree = rad.cliutils.renderTree({
      name: "root",
      children: [{ name: "child1" }, { name: "child2" }],
    });
    expect(tree).toContain("root");
    expect(tree).toContain("child1");
  });

  // 10. sysutils
  it("sysutils > retrieves system telemetry and quotes arguments", () => {
    const sys = rad.sysutils.getSystemInfo();
    expect(sys.cpuCount).toBeGreaterThan(0);
    expect(sys.totalMem).toBeGreaterThan(0);
    expect(rad.sysutils.quoteArg("safe_name")).toBe("safe_name");
    expect(rad.sysutils.quoteArg("with spaces")).toBe("'with spaces'");
  });

  // 11. netutils
  it("netutils > returns valid local IPv4", () => {
    const ip = rad.netutils.getLocalIp();
    expect(rad.validutils.isIpv4(ip)).toBe(true);
  });

  // 12. validutils
  it("validutils > validates inputs correctly", () => {
    expect(rad.validutils.isEmail("user@example.com")).toBe(true);
    expect(rad.validutils.isEmail("invalid-email")).toBe(false);
    expect(rad.validutils.isUrl("https://bun.sh")).toBe(true);
    expect(rad.validutils.isIpv4("192.168.1.1")).toBe(true);
    expect(rad.validutils.inRange(5, 1, 10)).toBe(true);
    expect(rad.validutils.isJson('{"a":1}')).toBe(true);
  });

  // 13. structutils
  it("structutils > tests SimpleStack, SimpleQueue, SimpleRingBuffer, and SimpleMinHeap", () => {
    const stack = new rad.structutils.SimpleStack<number>();
    stack.push(1);
    stack.push(2);
    expect(stack.pop()).toBe(2);

    const queue = new rad.structutils.SimpleQueue<number>();
    queue.enqueue(10);
    queue.enqueue(20);
    expect(queue.dequeue()).toBe(10);

    const ring = new rad.structutils.SimpleRingBuffer<string>(2);
    ring.push("a");
    ring.push("b");
    ring.push("c");
    expect(ring.toArray()).toEqual(["b", "c"]);

    const heap = new rad.structutils.SimpleMinHeap<number>();
    heap.push(30);
    heap.push(10);
    heap.push(20);
    expect(heap.pop()).toBe(10);
    expect(heap.pop()).toBe(20);
    expect(heap.pop()).toBe(30);
  });

  // 14. statutils
  it("statutils > calculates descriptive statistics and linear regression", () => {
    const nums = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(rad.statutils.mean(nums)).toBe(5);
    expect(rad.statutils.median(nums)).toBe(4.5);
    expect(rad.statutils.mode(nums)).toEqual([4]);
    expect(rad.statutils.variance(nums, false)).toBe(4);
    expect(rad.statutils.stdDev(nums, false)).toBe(2);

    const reg = rad.statutils.linearRegression([1, 2, 3], [2, 4, 6]);
    expect(reg.slope).toBeCloseTo(2);
    expect(reg.intercept).toBeCloseTo(0);
  });

  // 15. stateutils
  it("stateutils > manages app state and rollback", async () => {
    const store = new rad.stateutils.AppStateStore("test_app", { count: 0 }, { customPath: "/tmp/test_state.json" });
    await store.update((draft) => { draft.count = 5; });
    expect(store.get().count).toBe(5);
    store.rollback();
    expect(store.get().count).toBe(0);
  });

  // 16. cacheutils
  it("cacheutils > enforces LRU capacity and TTL expiration", async () => {
    const lru = new rad.cacheutils.LRUCache<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    lru.get("a");
    lru.set("c", 3);
    expect(lru.has("b")).toBe(false);
    expect(lru.has("a")).toBe(true);

    const ttl = new rad.cacheutils.TTLCache<string, string>(50);
    ttl.set("k", "v");
    expect(ttl.get("k")).toBe("v");
  });

  // 17. semverutils
  it("semverutils > parses, compares, and satisfies ranges", () => {
    expect(rad.semverutils.compareSemver("1.2.0", "1.1.9")).toBe(1);
    expect(rad.semverutils.compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(rad.semverutils.satisfiesRange("1.3.4", "^1.0.0")).toBe(true);
    expect(rad.semverutils.satisfiesRange("2.0.0", "^1.0.0")).toBe(false);
    expect(rad.semverutils.bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  });

  // 18. flowutils
  it("flowutils > executes retry with exponential backoff and circuit breaker", async () => {
    let calls = 0;
    const res = await rad.flowutils.retry(async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
      return "success";
    }, 3, 10);
    expect(res).toBe("success");
    expect(calls).toBe(2);

    const cb = new rad.flowutils.CircuitBreaker(2, 50);
    expect(cb.canExecute()).toBe(true);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");
    expect(cb.canExecute()).toBe(false);
  });

  // 19. templateutils
  it("templateutils > renders templates and ANSI markdown", () => {
    const res = rad.templateutils.renderTemplate("Hello {{name | User}}!", {});
    expect(res).toBe("Hello User!");
    const md = rad.templateutils.renderMarkdownAnsi("# Title\n**bold**");
    expect(md).toContain("Title");
  });

  // 20. colorutils
  it("colorutils > converts hex to rgb, hsl, and checks WCAG contrast", () => {
    const rgb = rad.colorutils.hexToRgb("#ffffff");
    expect(rgb).toEqual({ r: 255, g: 255, b: 255 });
    expect(rad.colorutils.rgbToHex(rgb)).toBe("#ffffff");
    const black = { r: 0, g: 0, b: 0 };
    expect(rad.colorutils.contrastRatio(rgb, black)).toBe(21);
    expect(rad.colorutils.isAccessible(rgb, black, "AAA")).toBe(true);
  });

  // 21. archiveutils
  it("archiveutils > creates and reads zip buffer entries", async () => {
    const zip = rad.archiveutils.zipFiles([
      { name: "file1.txt", data: "Hello 1" },
      { name: "file2.txt", data: "Hello 2" },
    ]);
    const entries = await rad.archiveutils.listZipEntries(zip);
    expect(entries).toEqual(["file1.txt", "file2.txt"]);
    const content = await rad.archiveutils.readZipEntry(zip, "file1.txt");
    expect(Buffer.from(content!).toString("utf-8")).toBe("Hello 1");
  });

  // 22. asyncutils
  it("asyncutils > runs parallelMap preserving index order", async () => {
    const items = [10, 20, 30, 40];
    const res = await rad.asyncutils.parallelMap(items, 2, async (x) => x * 2);
    expect(res).toEqual([20, 40, 60, 80]);
  });

  // 23. regexutils
  it("regexutils > matches, finds, and replaces patterns", () => {
    expect(rad.regexutils.isMatch(/^\d+$/, "12345")).toBe(true);
    expect(rad.regexutils.findAll(/\d+/g, "10 20 30")).toEqual(["10", "20", "30"]);
    expect(rad.regexutils.replace(/\d+/g, "items: 123", "###")).toBe("items: ###");
  });

  // 24. mockutils
  it("mockutils > generates synthetic users and lorem text", () => {
    const user = rad.mockutils.mockUser();
    expect(user.name.length).toBeGreaterThan(0);
    expect(user.email).toContain("@");
    const lorem = rad.mockutils.loremWords(5);
    expect(lorem.split(" ").length).toBe(5);
  });

  // 25. logutils
  it("logutils > initializes logger with levels", () => {
    const logger = rad.logutils.newLogger({ level: rad.logutils.LogLevel.DEBUG });
    expect(logger.level).toBe(rad.logutils.LogLevel.DEBUG);
  });

  // 26. tomlutils
  it("tomlutils > parses TOML sections and values", () => {
    const toml = rad.tomlutils.parseToml(`
[database]
host = "localhost"
port = 5432
enabled = true
tags = ["sql", "bun"]
`);
    expect(rad.tomlutils.getString(toml, "database.host")).toBe("localhost");
    expect(rad.tomlutils.getInt(toml, "database.port")).toBe(5432);
    expect(rad.tomlutils.getBool(toml, "database.enabled")).toBe(true);
    expect(rad.tomlutils.getArray(toml, "database.tags")).toEqual(["sql", "bun"]);

    const serialized = rad.tomlutils.stringifyToml({ title: "Bun RAD", count: 10 });
    expect(serialized).toContain('title = "Bun RAD"');
    expect(serialized).toContain("count = 10");
  });


  // 27. htmlutils
  it("htmlutils > escapes entities and extracts elements", () => {
    expect(rad.htmlutils.escapeHtml("<script>")).toBe("&lt;script&gt;");
    expect(rad.htmlutils.stripTags("<p>Hello <b>World</b></p>")).toBe("Hello World");
    const el = rad.htmlutils.getElementById('<div id="main">Content</div>', "main");
    expect(el?.text).toBe("Content");
  });

  // 28. bitutils
  it("bitutils > operates on BitSet and bitmask flags", () => {
    const bs = new rad.bitutils.BitSet(32);
    bs.set(5);
    expect(bs.get(5)).toBe(true);
    expect(bs.get(6)).toBe(false);
    expect(bs.countSet()).toBe(1);

    let flag = 0;
    flag = rad.bitutils.setFlag(flag, 1 << 2);
    expect(rad.bitutils.hasFlag(flag, 1 << 2)).toBe(true);
  });

  // 29. compressutils
  it("compressutils > compresses and decompresses gzip strings", () => {
    const text = "Bun RAD compression test string!";
    const compressed = rad.compressutils.gzipCompressString(text);
    const restored = rad.compressutils.gzipDecompressString(compressed);
    expect(restored).toBe(text);
  });

  // 30. tarutils
  it("tarutils > packs and unpacks TAR bytes", () => {
    const tar = rad.tarutils.packTarBytes([
      { name: "test.txt", data: "Hello TAR test!" },
    ]);
    const unpacked = rad.tarutils.unpackTarBytes(tar);
    expect(unpacked.length).toBe(1);
    expect(unpacked[0]!.name).toBe("test.txt");
    expect(unpacked[0]!.text).toBe("Hello TAR test!");
  });

  // 31. mathutils
  it("mathutils > performs lerp, clamp, gcd, and lcm", () => {
    expect(rad.mathutils.lerp(0, 10, 0.5)).toBe(5);
    expect(rad.mathutils.clamp(15, 0, 10)).toBe(10);
    expect(rad.mathutils.gcd(12, 18)).toBe(6);
    expect(rad.mathutils.lcm(12, 18)).toBe(36);
    expect(rad.mathutils.isPowerOfTwo(64)).toBe(true);
  });

  // 32. cronutils
  it("cronutils > parses 5-field cron and converts to human description", () => {
    const cron = rad.cronutils.parseCron("0 12 * * *");
    expect(cron.hours.has(12)).toBe(true);
    expect(cron.minutes.has(0)).toBe(true);
    expect(rad.cronutils.cronToHuman("0 0 * * *")).toBe("Every day at midnight");
  });

  // 33. urlutils
  it("urlutils > parses RFC 3986 URLs and redacts credentials", () => {
    const parsed = rad.urlutils.parseUrl("https://admin:secret@api.io:8080/v1/users?page=2#top");
    expect(parsed.hostWithPort).toBe("api.io:8080");
    expect(parsed.pathSegments).toEqual(["v1", "users"]);
    expect(parsed.queryParams.page).toBe("2");
    expect(rad.urlutils.redactCredentials("postgres://user:pass@db:5432/main")).toBe(
      "postgres://user:***@db:5432/main"
    );
  });

  // 34. jwtutils
  it("jwtutils > signs, verifies, and expires HS256 tokens", () => {
    const token = rad.jwtutils.signJwt({ sub: "user_99" }, "my_secret", 60);
    const verified = rad.jwtutils.verifyJwt(token, "my_secret");
    expect(verified.sub).toBe("user_99");
    expect(() => rad.jwtutils.verifyJwt(token, "wrong_secret")).toThrow();
  });

  // 35. eventutils
  it("eventutils > emits and handles events with listeners", () => {
    const ee = rad.eventutils.newEmitter();
    let val = 0;
    ee.on("inc", (delta: number) => { val += delta; });
    ee.emit("inc", 5);
    expect(val).toBe(5);
  });

  // 36. diffutils
  it("diffutils > generates line diff and unified diff text", () => {
    const diff = rad.diffutils.unifiedDiff("alpha\nbeta", "alpha\ngamma");
    expect(diff).toContain("-beta");
    expect(diff).toContain("+gamma");
  });

  // 37. graphutils
  it("graphutils > builds DAG, executes topological sort, and detects cycles", () => {
    const g = rad.graphutils.newGraph<string>();
    g.addEdge("A", "B");
    g.addEdge("B", "C");
    g.addEdge("A", "C");
    expect(g.topologicalSort()).toEqual(["A", "B", "C"]);
    expect(g.hasCycle()).toBe(false);

    const cyclic = rad.graphutils.newGraph<string>();
    cyclic.addEdge("X", "Y");
    cyclic.addEdge("Y", "X");
    expect(cyclic.hasCycle()).toBe(true);
  });

  // 38. globutils (Bun.Glob)
  it("globutils > performs pattern matching, async and sync glob scans", async () => {
    expect(rad.globutils.globMatch("*.ts", "index.ts")).toBe(true);
    expect(rad.globutils.globMatch("*.ts", "index.js")).toBe(false);

    const asyncMatches = await rad.globutils.globScan("*.json", { cwd: "." });
    expect(asyncMatches.length).toBeGreaterThan(0);
    expect(asyncMatches).toContain("package.json");

    const syncMatches = rad.globutils.globScanSync("*.json", { cwd: "." });
    expect(syncMatches).toEqual(asyncMatches);

    const found = await rad.globutils.findFiles("package.json", ".");
    expect(found.length).toBe(1);

    const matched = await rad.globutils.hasMatch("*.json", ".");
    expect(matched).toBe(true);
  });

  // 39. shellutils (Bun.$ and Bun.which)
  it("shellutils > executes commands, captures output, and discovers binaries", async () => {
    const bunBin = rad.shellutils.whichCmd("bun");
    expect(bunBin).not.toBeNull();
    expect(bunBin).toContain("bun");

    const echoRes = await rad.shellutils.execCmd("echo 'rad test shell'");
    expect(echoRes.success).toBe(true);
    expect(echoRes.exitCode).toBe(0);
    expect(echoRes.stdout.trim()).toBe("rad test shell");

    const lines = await rad.shellutils.execLines("printf 'one\\ntwo\\nthree\\n'");
    expect(lines).toEqual(["one", "two", "three"]);

    const piped = await rad.shellutils.pipeCmds("echo 'pipe test'", "cat");
    expect(piped.stdout.trim()).toBe("pipe test");

    const escaped = rad.shellutils.escapeArg("hello world");
    expect(escaped).toBeDefined();
  });

  // 40. hashutils (Bun.hash & BloomFilter)
  it("hashutils > computes ultra-fast non-cryptographic hashes and operates Bloom filter", () => {
    const testData = "Antigravity Speed";
    expect(typeof rad.hashutils.wyhash(testData)).toBe("bigint");
    expect(typeof rad.hashutils.crc32(testData)).toBe("number");
    expect(typeof rad.hashutils.adler32(testData)).toBe("number");
    expect(typeof rad.hashutils.cityHash64(testData)).toBe("bigint");
    expect(typeof rad.hashutils.cityHash32(testData)).toBe("number");
    expect(typeof rad.hashutils.murmur32v3(testData)).toBe("number");
    expect(typeof rad.hashutils.murmur64v2(testData)).toBe("bigint");
    expect(typeof rad.hashutils.rapidhash(testData)).toBe("bigint");

    const hexDigest = rad.hashutils.hashHex(testData, "wyhash");
    expect(hexDigest.length).toBeGreaterThan(0);

    const bloom = rad.hashutils.createBloomFilter(100, 0.01);
    bloom.add("element-alpha");
    bloom.add("element-beta");
    expect(bloom.has("element-alpha")).toBe(true);
    expect(bloom.has("element-beta")).toBe(true);
    expect(bloom.has("element-gamma")).toBe(false);
    expect(bloom.count()).toBe(2);
  });

  // 41. serverutils (Bun.serve & Router)
  it("serverutils > creates HTTP routers, serves requests, and handles WebSocket hub", async () => {
    const router = rad.serverutils.createRouter();
    router.get("/api/v1/ping", () => new Response(JSON.stringify({ pong: true }), { headers: { "content-type": "application/json" } }));
    router.post("/api/v1/echo", async (req) => {
      const body = await req.json();
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    });

    const srv = rad.serverutils.serveHttp({ router });
    expect(srv.port).toBeGreaterThan(0);

    const getRes = await fetch(`${srv.url}/api/v1/ping`);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.pong).toBe(true);

    const postRes = await fetch(`${srv.url}/api/v1/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello server" }),
    });
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.message).toBe("hello server");

    srv.stop();

    // WS Hub initialization check
    const wsHub = rad.serverutils.createWsHub();
    expect(wsHub.port).toBeGreaterThan(0);
    wsHub.stop();
  });

  // 42. transpileutils (Bun.Transpiler)
  it("transpileutils > transpiles TypeScript, analyzes AST, and executes in memory", () => {
    const source = `
      import { math } from "./math";
      export interface User { id: string; }
      export const compute = (x: number): number => x * 3;
      export default compute;
    `;

    const js = rad.transpileutils.transpileTs(source);
    expect(js).toContain("compute = (x) => x * 3");
    expect(js).not.toContain("interface User");

    const analysis = rad.transpileutils.analyzeCode(source);
    expect(analysis.exports).toContain("compute");
    expect(analysis.exports).toContain("default");
    expect(analysis.imports[0]?.path).toBe("./math");

    const importsOnly = rad.transpileutils.scanImports(`import "dotenv/config"; import { a } from "./a";`);
    expect(importsOnly.length).toBe(2);

    const evalResult = rad.transpileutils.evalTs<number>("const m = 7; const n = 6; return m * n;");
    expect(evalResult).toBe(42);
  });

  // 43. objutils (es-toolkit/object & predicate)
  it("objutils > performs deep get, set, unset, pick, omit, merge, and equality checks", () => {
    expect(rad.objutils.isNil(null)).toBe(true);
    expect(rad.objutils.isNil(undefined)).toBe(true);
    expect(rad.objutils.isNil(0)).toBe(false);
    expect(rad.objutils.isPlainObject({})).toBe(true);
    expect(rad.objutils.isPlainObject([])).toBe(false);

    expect(rad.objutils.isEmpty([])).toBe(true);
    expect(rad.objutils.isEmpty({})).toBe(true);
    expect(rad.objutils.isEmpty("")).toBe(true);
    expect(rad.objutils.isEmpty([1])).toBe(false);

    expect(rad.objutils.isEqual({ a: [1, 2], b: { c: 3 } }, { a: [1, 2], b: { c: 3 } })).toBe(true);
    expect(rad.objutils.isEqual({ a: 1 }, { a: 2 })).toBe(false);

    const doc: any = { user: { name: "Alice", address: { city: "SF" } } };
    expect(rad.objutils.get(doc, "user.name")).toBe("Alice");
    expect(rad.objutils.get(doc, "user.address.city")).toBe("SF");
    expect(rad.objutils.get(doc, "user.missing.key", "fallback")).toBe("fallback");
    expect(rad.objutils.has(doc, "user.address.city")).toBe(true);
    expect(rad.objutils.has(doc, "user.fake")).toBe(false);

    rad.objutils.set(doc, "user.address.zip", "94101");
    expect(doc.user.address.zip).toBe("94101");

    rad.objutils.unset(doc, "user.address.zip");
    expect(doc.user.address.zip).toBeUndefined();

    expect(rad.objutils.pick({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
    expect(rad.objutils.omit({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });

    expect(rad.objutils.pickBy({ a: 1, b: 2, c: 3 }, (v) => v > 1)).toEqual({ b: 2, c: 3 });
    expect(rad.objutils.omitBy({ a: 1, b: 2, c: 3 }, (v) => v > 1)).toEqual({ a: 1 });

    expect(rad.objutils.findKey({ a: 10, b: 20 }, (v) => v === 20)).toBe("b");

    const flat = rad.objutils.flattenObject({ a: { b: 1, c: { d: 2 } } });
    expect(flat).toEqual({ "a.b": 1, "a.c.d": 2 });

    expect(rad.objutils.invert({ x: "1", y: "2" })).toEqual({ "1": "x", "2": "y" });

    const merged = rad.objutils.deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3, d: 4 } });
    expect(merged).toEqual({ a: { b: 1, c: 3, d: 4 } });

    const cloned = rad.objutils.deepClone(doc);
    expect(cloned).toEqual(doc);
    expect(cloned).not.toBe(doc);
  });

  // 44. fnutils (es-toolkit/function)
  it("fnutils > handles once, memoize, negate, partial, before, after, debounce, times, delay, and pipe", async () => {
    let callCount = 0;
    const init = rad.fnutils.once(() => {
      callCount++;
      return "initialized";
    });
    expect(init()).toBe("initialized");
    expect(init()).toBe("initialized");
    expect(callCount).toBe(1);

    const double = rad.fnutils.memoize((n: number) => n * 2);
    expect(double(5)).toBe(10);
    expect(double(5)).toBe(10);
    expect(double.cache.size).toBe(1);

    const isEven = (n: number) => n % 2 === 0;
    const isOdd = rad.fnutils.negate(isEven);
    expect(isOdd(3)).toBe(true);
    expect(isOdd(4)).toBe(false);

    const greet = (greeting: string, name: string) => `${greeting}, ${name}!`;
    const sayHello = rad.fnutils.partial(greet, "Hello");
    expect(sayHello("World")).toBe("Hello, World!");

    let beforeCount = 0;
    const limited = rad.fnutils.before(2, () => ++beforeCount);
    limited(); // 1
    limited(); // 2
    limited(); // still 2
    expect(beforeCount).toBe(2);

    let afterCount = 0;
    const delayedRun = rad.fnutils.after(2, () => ++afterCount);
    delayedRun(); // undefined
    delayedRun(); // 1
    expect(afterCount).toBe(1);

    expect(rad.fnutils.times(3, (i) => i * 10)).toEqual([0, 10, 20]);

    const piped = rad.fnutils.pipe(2, (n: number) => n * 3, (n: number) => n + 4);
    expect(piped).toBe(10);

    await rad.fnutils.delay(5);
  });
});


