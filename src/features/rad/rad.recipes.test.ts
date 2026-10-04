// Executable mirrors of every code recipe in src/features/rad/README.md and the
// "RAD Master-Upgrade Integration Recipes" in docs/API.md. Disk paths are redirected to temp dirs.
import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  archiveutils,
  arrutils,
  bitutils,
  cacheutils,
  compressutils,
  fileutils,
  graphutils,
  mathutils,
  objutils,
  sqliteutils,
  stateutils,
  statutils,
  structutils,
  tarutils,
  tomlutils,
} from "./index.ts";

describe("RAD README recipes — Batch 2: Data Structures & Collections", () => {
  it("9. arrutils recipe", () => {
    const orders = [
      { id: 1, customer: "ana", total: 40, day: 1 },
      { id: 2, customer: "bo", total: 90, day: 1 },
      { id: 3, customer: "ana", total: 15, day: 2 },
    ];
    const ranked = arrutils.orderBy(orders, [(o) => o.customer, (o) => o.total], ["asc", "desc"]).map((o) => o.id);
    const byCustomer = arrutils.groupBy(orders, (o) => o.customer);
    const deltas = arrutils.pairwise(orders.map((o) => o.total)).map(([a, b]) => b - a);
    const pages = arrutils.chunk(arrutils.range(1, 8), 3);
    const ab = arrutils.shuffle(["A", "B", "C"], mathutils.seededRandom(42));
    const tags = arrutils.toggleItem(["bun", "ts"], "ts");
    expect(ranked).toEqual([1, 3, 2]);
    expect(Object.keys(byCustomer)).toEqual(["ana", "bo"]);
    expect(deltas).toEqual([50, -75]);
    expect(pages).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(ab).toEqual(arrutils.shuffle(["A", "B", "C"], mathutils.seededRandom(42)));
    expect(tags).toEqual(["bun"]);
  });

  it("10. objutils recipe", () => {
    const defaults = { server: { port: 3000, host: "0.0.0.0" }, features: { beta: false } };
    const user = { server: { port: 8080 }, features: { beta: true }, secret: null };
    const cfg = objutils.deepMerge(objutils.deepClone(defaults), objutils.compactObject(user) as any);
    objutils.set(cfg, 'labels["app.kubernetes.io/name"]', "api");
    const changes = objutils.objectDiff(defaults, cfg);
    const env = objutils.mapKeys(objutils.flattenObject(cfg), (_v, k) => k.toUpperCase().replace(/\W/g, "_"));
    const frozen = objutils.deepFreeze(cfg);
    expect(objutils.get<number>(frozen, "server.port")).toBe(8080);
    expect(changes.added).toEqual(["labels.app.kubernetes.io/name"]);
    expect(changes.changed.sort()).toEqual(["features.beta", "server.port"]);
    expect(changes.removed).toEqual([]);
    expect((env as Record<string, unknown>).SERVER_PORT).toBe(8080);
  });

  it("11. structutils recipe", () => {
    const jobs = new structutils.SimplePriorityQueue<string>();
    jobs.enqueue("send-newsletter", 5);
    jobs.enqueue("charge-card", 1);
    const next = jobs.dequeue();
    const recent = new structutils.SimpleRingBuffer<number>(3);
    [120, 95, 300, 80].forEach((ms) => recent.push(ms));
    const commands = new structutils.SimpleTrie(["deploy", "deploy:prod", "dev", "doctor"]);
    const suggestions = commands.withPrefix("dep");
    const accounts = new structutils.DisjointSet<string>();
    accounts.union("ana@x.io", "ana@y.io");
    accounts.union("ana@y.io", "+1-555-0100");
    expect(next).toBe("charge-card");
    expect(recent.toArray()).toEqual([95, 300, 80]);
    expect(suggestions.sort()).toEqual(["deploy", "deploy:prod"]);
    expect(accounts.connected("ana@x.io", "+1-555-0100")).toBe(true);
  });

  it("12. statutils recipe", () => {
    const latencies = [12, 15, 11, 14, 13, 12, 250, 16, 13, 12];
    const s = statutils.summarize(latencies);
    const p95 = statutils.percentile(latencies, 95);
    const spikes = statutils.detectOutliers(latencies);
    const smooth = statutils.exponentialMovingAverage(latencies, 0.3);
    const fit = statutils.linearRegression([1, 2, 3, 4], [110, 205, 290, 410]);
    const forecast = statutils.predictLinear(fit, 5);
    expect(s.median).toBe(13);
    expect(p95).toBeGreaterThan(16);
    expect(spikes).toEqual([250]);
    expect(smooth).toHaveLength(latencies.length);
    expect(fit.r2).toBeGreaterThan(0.98);
    expect(forecast).toBeCloseTo(500);
  });

  it("13. mathutils recipe", () => {
    const progress = mathutils.inverseLerp(0, 250, 75);
    const barWidth = Math.round(mathutils.lerp(0, 40, progress));
    const heading = mathutils.wrap(350 + 30, 0, 360);
    const price = mathutils.round(19.999 * 1.0825, 2);
    const overlap = mathutils.rectIntersection({ x: 0, y: 0, width: 100, height: 50 }, { x: 80, y: 20, width: 50, height: 50 });
    const rng = mathutils.seededRandom(2026);
    const dice = mathutils.secureRandomInt(1, 6);
    expect(progress).toBeCloseTo(0.3);
    expect(barWidth).toBe(12);
    expect(heading).toBe(20);
    expect(price).toBe(21.65);
    expect(overlap).toEqual({ x: 80, y: 20, width: 20, height: 30 });
    expect(rng()).toBeLessThan(1);
    expect(dice).toBeGreaterThanOrEqual(1);
    expect(mathutils.percentChange(80, 100)).toBe(25);
  });

  it("14. bitutils recipe", () => {
    const Perm = bitutils.defineFlags(["read", "write", "delete", "admin"] as const);
    let role = bitutils.combineFlags(Perm, ["read", "write"]);
    role = bitutils.setFlag(role, Perm.delete);
    const canMutate = bitutils.hasAnyFlag(role, Perm.write | Perm.delete);
    const names = bitutils.describeFlags(role, Perm);
    const mon = bitutils.BitSet.fromIndices(7, [0, 2, 4]);
    const tue = bitutils.BitSet.fromIndices(7, [1, 2]);
    const shared = mon.and(tue).toIndices();
    expect(canMutate).toBe(true);
    expect(names).toEqual(["read", "write", "delete"]);
    expect(shared).toEqual([2]);
    expect(bitutils.toBinary(role, 4)).toBe("0111");
  });

  it("15. graphutils recipe", () => {
    const tasks = graphutils.Graph.fromEdges<string>([["install", "build"], ["build", "test"], ["build", "lint"], ["test", "deploy"], ["lint", "deploy"]]);
    const order = tasks.topologicalSort();
    const roads = graphutils.newGraph<string>({ directed: false });
    roads.addEdge("A", "B", 7).addEdge("B", "C", 2).addEdge("A", "C", 12).addEdge("C", "D", 3);
    const route = roads.dijkstra("A", "D");
    const imports = graphutils.Graph.fromEdges<string>([["a.ts", "b.ts"], ["b.ts", "c.ts"], ["c.ts", "a.ts"]]);
    const cycle = imports.findCycle();
    const snapshot = JSON.stringify(roads);
    expect(order).toEqual(["install", "build", "test", "lint", "deploy"]);
    expect(route).toEqual({ path: ["A", "B", "C", "D"], distance: 12 });
    expect(cycle).toEqual(["a.ts", "b.ts", "c.ts", "a.ts"]);
    expect(graphutils.Graph.fromJSON(JSON.parse(snapshot)).edgeCount).toBe(4);
  });
});

describe("RAD README recipes — Batch 1: File & Storage", () => {
  it("1. fileutils recipe", async () => {
    await fileutils.withTempDir(async (dir) => {
      await fileutils.saveJson(`${dir}/config.json`, { port: 8080 });
      const cfg = await fileutils.loadJson(`${dir}/config.json`, { port: 3000 });
      await fileutils.appendJsonl(`${dir}/events.jsonl`, { type: "boot", at: Date.now() });
      const events = await fileutils.readJsonl<{ type: string }>(`${dir}/events.jsonl`);
      await fileutils.writeCsvObjects(`${dir}/users.csv`, [{ id: 1, bio: 'Likes "Bun",\nand TS' }]);
      const users = await fileutils.readCsvObjects(`${dir}/users.csv`);
      const files = await fileutils.walkFiles(dir, (p) => !p.endsWith(".tmp"), { skipDirs: ["node_modules"], maxDepth: 3 });
      expect(cfg.port).toBe(8080);
      expect(events.length).toBe(1);
      expect(users[0]?.bio).toBe('Likes "Bun",\nand TS');
      expect(files.length).toBe(3);
      expect(fileutils.formatBytes(await fileutils.dirSize(dir))).toMatch(/B$/);
      expect((await fileutils.hashFile(`${dir}/users.csv`)).length).toBe(64);
    });
  });

  it("2. sqliteutils recipe", () => {
    const db = sqliteutils.openDb(":memory:", { busyTimeoutMs: 10_000 });
    sqliteutils.runMigrations(db, [
      { version: 1, name: "users", up: "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT);" },
    ]);
    sqliteutils.insertMany(db, "users", [{ email: "a@x.io", name: "A" }, { email: "b@x.io", name: "B" }]);
    sqliteutils.upsertRow(db, "users", { email: "a@x.io", name: "Ada" }, ["email"]);
    const ada = sqliteutils.selectOne<{ name: string }>(db, "users", "email = ?", ["a@x.io"]);
    sqliteutils.transaction(db, () => {
      sqliteutils.updateRows(db, "users", { name: "Bea" }, "email = ?", ["b@x.io"]);
    });
    sqliteutils.createKvTable(db, "stats");
    expect(sqliteutils.incrementKv(db, "stats", "logins")).toBe(1);
    sqliteutils.createJsonStore(db, "profiles");
    sqliteutils.saveDoc(db, "profiles", "u1", { role: "admin" });
    const admins = sqliteutils.findDocs(db, "profiles", "$.role", "admin");
    sqliteutils.createFtsTable(db, "notes", ["body"]);
    sqliteutils.indexFts(db, "notes", { body: "bun is fast" });
    const hits = sqliteutils.searchFtsRanked(db, "notes", "fast");
    expect(ada?.name).toBe("Ada");
    expect(admins.length).toBe(1);
    expect(typeof hits[0]?.rank).toBe("number");
    expect(sqliteutils.getSchemaVersion(db)).toBe(1);
    sqliteutils.closeDb(db);
  });

  it("3. tomlutils recipe", async () => {
    const cfg = tomlutils.parseToml(`
[server]
port = 8080
cors_origins = ["http://localhost:3000"]
[[server.upstreams]]
host = "10.0.0.2"
`);
    expect(tomlutils.getInt(cfg, "server.port", 3000)).toBe(8080);
    expect(tomlutils.getString(cfg, "server.upstreams.0.host")).toBe("10.0.0.2");
    tomlutils.setTomlPath(cfg, "server.tls.enabled", true);
    const merged = tomlutils.mergeToml(cfg, { server: { port: 9090 } });
    expect(tomlutils.stringifyToml(merged)).toContain("port = 9090");
    await fileutils.withTempDir(async (dir) => {
      const layered = await tomlutils.loadTomlLayers([join(dir, "config/default.toml"), join(dir, "config/local.toml")]);
      expect(layered).toEqual({});
    });
  });

  it("4. archiveutils recipe", async () => {
    const zip = archiveutils.zipFiles([
      { name: "docs/", data: "" },
      { name: "docs/readme.txt", data: "Bun RAD Suite" },
      { name: "logo.png", data: new Uint8Array([137, 80, 78, 71]), compress: false },
    ]);
    expect((await archiveutils.listZipDetails(zip)).length).toBe(3);
    expect(await archiveutils.readZipText(zip, "docs/readme.txt")).toBe("Bun RAD Suite");
    await fileutils.withTempDir(async (dir) => {
      expect(await archiveutils.unzipToDir(zip, join(dir, "extracted"))).toBe(2);
    });
  });

  it("5. compressutils recipe", () => {
    const json = JSON.stringify({ rows: Array.from({ length: 500 }, (_, i) => ({ i })) });
    for (const fmt of ["gzip", "brotli", "zstd"] as const) {
      const packed = compressutils.compress(json, fmt);
      expect(compressutils.compressionRatio(json.length, packed.length)).toBeGreaterThan(50);
    }
    const b64 = compressutils.gzipCompressString(json);
    expect(compressutils.gzipDecompressString(b64) === json).toBe(true);
    expect(compressutils.detectCompression(compressutils.zstdCompress("x"))).toBe("zstd");
  });

  it("6. tarutils recipe", async () => {
    const tgz = tarutils.packTarGz([
      { name: "pkg/", data: "", type: "directory" },
      { name: "pkg/package.json", data: '{"name":"demo"}', mode: 0o644 },
      { name: `pkg/${"very/".repeat(30)}deep.txt`, data: "long paths just work" },
    ]);
    expect(tarutils.unpackTarGz(tgz).map((e) => e.type)).toEqual(["directory", "file", "file"]);
    await fileutils.withTempDir(async (dir) => {
      await Bun.write(join(dir, "dist/app.js"), "x");
      await Bun.write(join(dir, "dist/app.js.map"), "{}");
      await tarutils.createTarFile(join(dir, "dist"), join(dir, "release/dist.tgz"), (rel) => !rel.endsWith(".map"));
      expect(await tarutils.extractTarFile(join(dir, "release/dist.tgz"), join(dir, "restore"))).toBe(1);
    });
  });

  it("7. stateutils recipe", async () => {
    await fileutils.withTempDir(async (dir) => {
      const store = new stateutils.AppStateStore("todo-app", { todos: [] as string[], theme: "dark" }, { customPath: join(dir, "todo-state.json") });
      await store.load();
      const log: string[] = [];
      const off = store.subscribe((next, prev) => log.push(`${prev.todos.length}→${next.todos.length}`));
      await store.update((d) => {
        d.todos.push("ship v2");
      });
      await store.patch({ theme: "light" });
      store.rollback();
      expect(store.select((s) => s.theme)).toBe("dark");
      off();
      expect(log[0]).toBe("0→1");

      const kv = new stateutils.KeyValueState("my-cli", join(dir, "my-cli-kv.json"));
      await kv.init();
      await kv.setMany({ token: "abc", region: "us-east" });
      expect(kv.get<string>("region")).toBe("us-east");
    });
  });

  it("8. cacheutils recipe", async () => {
    const evicted: string[] = [];
    const lru = new cacheutils.LRUCache<string, string>(2, (k) => evicted.push(k));
    lru.set("a", "A");
    lru.set("b", "B");
    lru.set("c", "C");
    lru.getOrSet("d", () => "D");
    expect(evicted).toEqual(["a", "b"]);

    let fetches = 0;
    const users = new cacheutils.TTLCache<string, { id: string }>(30_000, { sliding: true });
    const fetchUser = async (id: string) => {
      fetches++;
      return { id };
    };
    const [u1, u2] = await Promise.all([users.getOrSet("u1", () => fetchUser("u1")), users.getOrSet("u1", () => fetchUser("u1"))]);
    expect(u1 === u2).toBe(true);
    expect(fetches).toBe(1);
    expect(users.ttl("u1")).toBeGreaterThan(0);
    users.dispose();
  });
});

describe("docs/API.md — RAD Master-Upgrade Integration Recipes", () => {
  it("Recipe 21: Storage Power-Pack", async () => {
    await fileutils.withTempDir(async (dir) => {
      await tomlutils.saveToml(`${dir}/default.toml`, { db: { path: `${dir}/app.db` }, cache: { ttl_ms: 5000 } });
      await tomlutils.saveToml(`${dir}/local.toml`, { cache: { ttl_ms: 250 } });
      const cfg = await tomlutils.loadTomlLayers([`${dir}/default.toml`, `${dir}/local.toml`]);

      const db = sqliteutils.openDb(tomlutils.getString(cfg, "db.path"));
      sqliteutils.runMigrations(db, [{ version: 1, up: "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);" }]);
      sqliteutils.insertMany(db, "notes", [{ body: "alpha" }, { body: "beta" }]);

      const cache = new cacheutils.TTLCache<string, number>(tomlutils.getInt(cfg, "cache.ttl_ms"));
      const count = await cache.getOrSet("notes:count", () => sqliteutils.countRows(db, "notes"));

      sqliteutils.backupDb(db, `${dir}/backup.db`);
      await fileutils.writeCsvObjects(`${dir}/notes.csv`, sqliteutils.selectRows(db, "notes"));
      sqliteutils.closeDb(db);
      const csvBytes = await Bun.file(`${dir}/notes.csv`).bytes();
      const tgz = tarutils.packTarGz([{ name: "export/notes.csv", data: csvBytes }]);
      const zip = archiveutils.zipFiles([{ name: "notes.csv.zst", data: compressutils.zstdCompress(csvBytes) }]);
      await Bun.write(`${dir}/export.tgz`, tgz);

      const state = new stateutils.AppStateStore("exporter", { lastExport: "", sha256: "" }, { customPath: `${dir}/state.json` });
      await state.patch({ lastExport: new Date().toISOString(), sha256: await fileutils.hashFile(`${dir}/export.tgz`) });

      expect(tomlutils.getInt(cfg, "cache.ttl_ms")).toBe(250);
      expect(count).toBe(2);
      expect(tarutils.listTarEntries(tgz)).toEqual(["export/notes.csv"]);
      expect(await archiveutils.listZipEntries(zip)).toEqual(["notes.csv.zst"]);
      expect(state.get().sha256.length).toBe(64);
    });
  });

  it("Recipe 22: Collections Power-Pack", () => {
    const deps = graphutils.Graph.fromEdges<string>([["db", "api"], ["cache", "api"], ["api", "web"], ["api", "worker"]]);
    if (deps.hasCycle()) throw new Error(`cycle: ${deps.findCycle()!.join(" -> ")}`);
    const startOrder = deps.topologicalSort();

    const Cap = bitutils.defineFlags(["http", "queue", "storage"] as const);
    const caps: Record<string, number> = { db: Cap.storage, cache: Cap.storage, api: Cap.http, web: Cap.http, worker: Cap.queue };
    const pq = new structutils.SimplePriorityQueue<string>();
    startOrder.forEach((svc, i) => pq.enqueue(svc, i));
    const boot: string[] = [];
    while (!pq.isEmpty()) boot.push(pq.dequeue()!);
    const httpServices = boot.filter((s) => bitutils.hasFlag(caps[s]!, Cap.http));

    const rng = mathutils.seededRandom(7);
    const timings = boot.map((svc) => ({ svc, ms: mathutils.round(50 + rng() * 100, 1) }));
    const slowest = arrutils.orderBy(timings, [(t) => t.ms], ["desc"])[0]!;
    const summary = statutils.summarize(timings.map((t) => t.ms));

    const before = { api: { replicas: 2, port: 8080 }, web: { replicas: 1 } };
    const after = objutils.deepMerge(objutils.deepClone(before), { api: { replicas: 3 } });
    const drift = objutils.objectDiff(before, after);

    expect(startOrder).toEqual(["db", "cache", "api", "web", "worker"]);
    expect(httpServices).toEqual(["api", "web"]);
    expect(slowest.ms).toBe(Math.max(...timings.map((t) => t.ms)));
    expect(summary.count).toBe(5);
    expect(drift).toEqual({ added: [], removed: [], changed: ["api.replicas"] });
  });
});
