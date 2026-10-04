import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { rad } from "./index.ts";

const { fileutils, sqliteutils, tomlutils, archiveutils, compressutils, tarutils, stateutils, cacheutils } = rad;

describe("RAD Batch 1 — File & Storage (enhanced)", () => {
  it("fileutils > bytes, predicates, atomic text, JSONL, appends", async () => {
    expect(fileutils.formatBytes(1536)).toBe("1.5 KB");
    expect(fileutils.formatBytes(-2048)).toBe("-2.0 KB");
    expect(fileutils.parseBytes("1.5 KB")).toBe(1536);
    expect(fileutils.parseBytes("10mb")).toBe(10 * 1024 * 1024);
    expect(() => fileutils.parseBytes("lots")).toThrow("[fileutils.parseBytes]");

    await fileutils.withTempDir(async (dir) => {
      const p = join(dir, "nested/a.txt");
      expect(await fileutils.pathExists(p)).toBe(false);
      await fileutils.writeText(p, "hello", { atomic: true });
      expect(await fileutils.isFile(p)).toBe(true);
      expect(await fileutils.isDir(dir)).toBe(true);
      expect(await fileutils.readText(p)).toBe("hello");
      expect(await fileutils.readText(join(dir, "missing"), "fb")).toBe("fb");
      expect((await fileutils.fileInfo(p))?.size).toBe(5);
      expect(await fileutils.fileInfo(join(dir, "nope"))).toBeNull();

      const log = join(dir, "app.log");
      await fileutils.appendLine(log, "a");
      await fileutils.appendLines(log, ["b", "c"]);
      expect(await fileutils.readLines(log)).toEqual(["a", "b", "c"]);

      const jl = join(dir, "e.jsonl");
      await fileutils.writeJsonl(jl, [{ n: 1 }]);
      await fileutils.appendJsonl(jl, { n: 2 });
      expect(await fileutils.readJsonl<{ n: number }>(jl)).toEqual([{ n: 1 }, { n: 2 }]);

      expect(await fileutils.hashFile(p)).toBe(new Bun.CryptoHasher("sha256").update("hello").digest("hex"));
      await fileutils.touch(join(dir, "t/.stamp"));
      expect(await fileutils.isFile(join(dir, "t/.stamp"))).toBe(true);
    });
  });

  it("fileutils > RFC 4180 CSV, records, walk options, copy/remove/dirSize", async () => {
    const rows = fileutils.parseCsvString('id,note\r\n1,"multi\nline, with ""quotes"""\n\n2,plain');
    expect(rows).toEqual([["id", "note"], ["1", 'multi\nline, with "quotes"'], ["2", "plain"]]);
    expect(fileutils.parseCsvString("a, b ", ",", { trim: false })).toEqual([["a", " b "]]);
    const text = fileutils.formatCsvString([["id", "name"], [1, ' padded '], [null, true]]);
    expect(text).toBe('id,name\n1," padded "\n,true');
    expect(fileutils.csvToObjects([["id", "name"], ["1", "Ada"], ["2"]])).toEqual([
      { id: "1", name: "Ada" },
      { id: "2", name: "" },
    ]);
    expect(fileutils.objectsToCsv([{ a: 1 }, { b: 2 }])).toEqual([["a", "b"], [1, undefined], [undefined, 2]]);

    await fileutils.withTempDir(async (dir) => {
      await fileutils.writeCsvObjects(join(dir, "u.csv"), [{ id: 1, name: "Ada" }]);
      expect(await fileutils.readCsvObjects(join(dir, "u.csv"))).toEqual([{ id: "1", name: "Ada" }]);
      await fileutils.writeText(join(dir, "src/a.ts"), "a");
      await fileutils.writeText(join(dir, "src/deep/b.ts"), "bb");
      await fileutils.writeText(join(dir, "node_modules/x.ts"), "x");
      const all = await fileutils.walkFiles(dir, (f) => f.endsWith(".ts"), { skipDirs: ["node_modules"] });
      expect(all.length).toBe(2);
      expect((await fileutils.walkFiles(join(dir, "src"), undefined, { maxDepth: 0 })).length).toBe(1);
      expect(await fileutils.dirSize(join(dir, "src"))).toBe(3);
      await fileutils.copyDir(join(dir, "src"), join(dir, "copy"));
      expect(await fileutils.isFile(join(dir, "copy/deep/b.ts"))).toBe(true);
      expect(await fileutils.removePath(join(dir, "copy"))).toBe(true);
      expect(await fileutils.removePath(join(dir, "copy"))).toBe(false);
    });
  });

  it("sqliteutils > quoting, queries, transactions, introspection", () => {
    const db = sqliteutils.openDb(":memory:", { foreignKeys: true });
    expect(sqliteutils.quoteIdent('we"ird')).toBe('"we""ird"');
    sqliteutils.execSql(db, "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT);");
    expect(sqliteutils.tableExists(db, "users")).toBe(true);
    expect(sqliteutils.listTables(db)).toEqual(["users"]);
    expect(sqliteutils.tableColumns(db, "users").map((c) => c.name)).toEqual(["id", "email", "name"]);

    expect(sqliteutils.insertMany(db, "users", [{ email: "a@x", name: "A" }, { email: "b@x", name: "B" }])).toBe(2);
    sqliteutils.upsertRow(db, "users", { email: "a@x", name: "Ada" }, ["email"]);
    expect(sqliteutils.selectOne<{ name: string }>(db, "users", "email = ?", ["a@x"])?.name).toBe("Ada");
    expect(sqliteutils.countRows(db, "users")).toBe(2);
    expect(sqliteutils.queryValue<number>(db, "SELECT COUNT(*) FROM users WHERE name LIKE ?", ["A%"])).toBe(1);
    expect(sqliteutils.queryAll(db, "SELECT * FROM users").length).toBe(2);
    expect(sqliteutils.queryOne(db, "SELECT * FROM users WHERE id = ?", [999])).toBeNull();

    expect(() =>
      sqliteutils.transaction(db, () => {
        sqliteutils.insertRow(db, "users", { email: "c@x", name: "C" });
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(sqliteutils.countRows(db, "users")).toBe(2);
    sqliteutils.closeDb(db);
  });

  it("sqliteutils > KV counters, doc queries, migrations, ranked FTS, backup", async () => {
    const db = sqliteutils.openDb();
    sqliteutils.createKvTable(db, "stats");
    expect(sqliteutils.incrementKv(db, "stats", "views")).toBe(1);
    expect(sqliteutils.incrementKv(db, "stats", "views", 5)).toBe(6);
    expect(sqliteutils.hasKv(db, "stats", "views")).toBe(true);

    sqliteutils.createJsonStore(db, "docs");
    sqliteutils.saveDoc(db, "docs", "u1", { role: "admin", active: true });
    sqliteutils.saveDoc(db, "docs", "u2", { role: "user", active: false });
    expect(sqliteutils.findDocs(db, "docs", "$.role", "admin").map((d) => d.id)).toEqual(["u1"]);
    expect(sqliteutils.findDocs(db, "docs", "$.active", false).map((d) => d.id)).toEqual(["u2"]);
    expect(typeof sqliteutils.listDocs(db, "docs")[0]?.updatedAt).toBe("string");

    expect(sqliteutils.getSchemaVersion(db)).toBe(0);
    sqliteutils.runMigrations(db, [{ version: 1, name: "t", up: "CREATE TABLE t (id INT);" }]);
    expect(sqliteutils.getSchemaVersion(db)).toBe(1);
    expect(() => sqliteutils.runMigrations(db, [{ version: 2, up: "x" }, { version: 2, up: "y" }])).toThrow("Duplicate");
    expect(() => sqliteutils.runMigrations(db, [{ version: 3, up: "NOT SQL" }])).toThrow("Migration 3");

    sqliteutils.createFtsTable(db, "fts", ["title"]);
    sqliteutils.indexFts(db, "fts", { title: "bun bun fast" });
    sqliteutils.indexFts(db, "fts", { title: "bun slow" });
    const ranked = sqliteutils.searchFtsRanked<{ title: string }>(db, "fts", "bun");
    expect(ranked.length).toBe(2);
    expect(typeof ranked[0]?.rank).toBe("number");
    expect(sqliteutils.dbSizeBytes(db)).toBeGreaterThan(0);

    await fileutils.withTempDir((dir) => {
      const dest = join(dir, "backup.db");
      sqliteutils.backupDb(db, dest);
      const copy = sqliteutils.openDb(dest);
      expect(sqliteutils.getKv(copy, "stats", "views")).toBe("6");
      sqliteutils.closeDb(copy);
    });
    sqliteutils.closeDb(db);
  });

  it("tomlutils > errors, paths, merge, layers", async () => {
    expect(() => tomlutils.parseToml("a = ")).toThrow("[tomlutils.parseToml]");
    expect(tomlutils.tryParseToml("a = ")).toBeNull();
    const doc = tomlutils.parseToml('[server]\nport = 8080\nratio = 0.75\nhosts = [{ name = "a" }]');
    expect(tomlutils.getTomlPath(doc, "server.hosts.0.name")).toBe("a");
    expect(tomlutils.getNumber(doc, "server.ratio")).toBe(0.75);
    expect(tomlutils.getTable(doc, "server").port).toBe(8080);
    expect(tomlutils.hasTomlKey(doc, "server.tls")).toBe(false);
    tomlutils.setTomlPath(doc, "server.tls.enabled", true);
    expect(tomlutils.getBool(doc, "server.tls.enabled")).toBe(true);
    expect(tomlutils.mergeToml({ s: { a: 1, b: 2 } }, { s: { b: 3 } })).toEqual({ s: { a: 1, b: 3 } });

    await fileutils.withTempDir(async (dir) => {
      await tomlutils.saveToml(join(dir, "default.toml"), { server: { port: 80, host: "0.0.0.0" } });
      await tomlutils.saveToml(join(dir, "local.toml"), { server: { port: 9000 } });
      const cfg = await tomlutils.loadTomlLayers([join(dir, "default.toml"), join(dir, "missing.toml"), join(dir, "local.toml")]);
      expect(cfg).toEqual({ server: { port: 9000, host: "0.0.0.0" } });
    });
  });

  it("compressutils > all codecs, dispatch, detection, files", async () => {
    const text = "Rapid Application Development ".repeat(50);
    for (const fmt of ["gzip", "deflate", "brotli", "zstd"] as const) {
      const packed = compressutils.compress(text, fmt);
      expect(new TextDecoder().decode(compressutils.decompress(packed, fmt))).toBe(text);
      expect(packed.length).toBeLessThan(text.length);
    }
    expect(compressutils.gzipCompress(text, 9).length).toBeLessThanOrEqual(compressutils.gzipCompress(text, 1).length);
    expect(compressutils.detectCompression(compressutils.gzipCompress("x"))).toBe("gzip");
    expect(compressutils.detectCompression(compressutils.zstdCompress("x"))).toBe("zstd");
    expect(compressutils.detectCompression(new Uint8Array([1, 2, 3]))).toBe("unknown");
    expect(() => compressutils.gzipDecompress(new Uint8Array([1, 2, 3]))).toThrow("[compressutils.gzipDecompress]");

    await fileutils.withTempDir(async (dir) => {
      const src = join(dir, "log.txt");
      await Bun.write(src, text);
      const zst = await compressutils.compressFile(src, "zstd");
      expect(zst).toBe(`${src}.zst`);
      await fileutils.removePath(src);
      expect(await compressutils.decompressFile(zst, "zstd")).toBe(src);
      expect(await Bun.file(src).text()).toBe(text);
    });
  });

  it("archiveutils > timestamps, store/deflate, dirs, details, zip-slip", async () => {
    const when = new Date(2026, 0, 2, 3, 4, 6);
    expect(archiveutils.toDosDateTime(when)).toEqual({ time: 6275, date: 23586 });
    expect(archiveutils.fromDosDateTime(6275, 23586).getTime()).toBe(when.getTime());

    const zip = archiveutils.zipFiles([
      { name: "docs/", data: "" },
      { name: "docs/readme.txt", data: "Hello ".repeat(100), mtime: when },
      { name: "tiny.bin", data: new Uint8Array([1, 2, 3]) },
      { name: "ünïcode.txt", data: "ok" },
    ]);
    const details = await archiveutils.listZipDetails(zip);
    expect(details.map((d) => d.name)).toEqual(["docs/", "docs/readme.txt", "tiny.bin", "ünïcode.txt"]);
    expect(details[0]?.isDirectory).toBe(true);
    expect(details[1]?.compressionMethod).toBe(8);
    expect(details[2]?.compressionMethod).toBe(0);
    expect(details[1]?.modified.getTime()).toBe(when.getTime());
    expect(await archiveutils.readZipText(zip, "ünïcode.txt")).toBe("ok");
    expect(await archiveutils.readZipEntry(zip, "nope")).toBeNull();
    expect((await archiveutils.unzipToMemory(zip)).length).toBe(3);

    expect(() => archiveutils.safeJoin("/out", "../etc/passwd")).toThrow("escapes");
    const evil = archiveutils.zipFiles([{ name: "../evil.txt", data: "x" }]);
    await fileutils.withTempDir(async (dir) => {
      // Leading "../" segments are kept in the name, so extraction must refuse it.
      const raw = Buffer.from(evil);
      expect((await archiveutils.listZipEntries(raw))[0]).toBe("../evil.txt");
      await expect(archiveutils.unzipToDir(raw, join(dir, "out"))).rejects.toThrow("escapes");
      expect(await archiveutils.unzipToDir(zip, join(dir, "ok"))).toBe(3);
      await Bun.write(join(dir, "site/a.txt"), "a");
      await Bun.write(join(dir, "site/.git/HEAD"), "ref");
      expect(await archiveutils.zipDir(join(dir, "site"), join(dir, "site.zip"), (rel) => !rel.startsWith(".git/"))).toBe(1);
    });
  });

  it("tarutils > long names, dirs, metadata, gzip, traversal safety", async () => {
    const longName = `${"deep/".repeat(40)}file.txt`;
    const mtime = new Date(1_700_000_000_000);
    const tar = tarutils.packTarBytes([
      { name: "pkg/", data: "", type: "directory" },
      { name: "pkg/index.ts", data: "export {}", mode: 0o600, mtime },
      { name: longName, data: "long" },
    ]);
    const entries = tarutils.unpackTarBytes(tar);
    expect(entries.map((e) => e.name)).toEqual(["pkg/", "pkg/index.ts", longName]);
    expect(entries[0]?.type).toBe("directory");
    expect(entries[1]?.mode).toBe(0o600);
    expect(entries[1]?.mtime.getTime()).toBe(mtime.getTime());
    expect(entries[2]?.text).toBe("long");
    expect(tarutils.paxRecord("path", "a/b")).toBe("12 path=a/b\n");

    const tgz = tarutils.packTarGz([{ name: "a.txt", data: "hi" }]);
    expect(tarutils.listTarEntries(tgz)).toEqual(["a.txt"]);
    expect(tarutils.unpackTarGz(tgz)[0]?.text).toBe("hi");

    const corrupt = new Uint8Array(tar);
    corrupt[0] = corrupt[0]! ^ 0xff;
    expect(() => tarutils.unpackTarBytes(corrupt)).toThrow("checksum");

    await fileutils.withTempDir(async (dir) => {
      await Bun.write(join(dir, "src/a.txt"), "A");
      await fileutils.ensureDir(join(dir, "src/empty"));
      expect(await tarutils.createTarFile(join(dir, "src"), join(dir, "out.tgz"))).toBe(2);
      expect(await tarutils.extractTarFile(join(dir, "out.tgz"), join(dir, "restore"))).toBe(1);
      expect(await fileutils.isDir(join(dir, "restore/empty"))).toBe(true);
      await Bun.write(join(dir, "evil.tar"), tarutils.packTarBytes([{ name: "x/../../evil", data: "x" }]));
      await expect(tarutils.extractTarFile(join(dir, "evil.tar"), join(dir, "r2"))).rejects.toThrow("escapes");
    });
  });

  it("stateutils > dirs, atomic save, undo history, subscribe, patch, KeyValueState", async () => {
    expect(stateutils.resolveCacheDir("x").endsWith("x") || stateutils.resolveCacheDir("x").endsWith("Cache")).toBe(true);
    expect(stateutils.resolveDataDir("x")).toContain("x");
    await fileutils.withTempDir(async (dir) => {
      const store = new stateutils.AppStateStore("t", { n: 0, theme: "dark" }, { customPath: join(dir, "s.json"), historyLimit: 2 });
      const seen: number[] = [];
      const off = store.subscribe((next) => seen.push(next.n));
      await store.update((d) => {
        d.n = 1;
      });
      await store.patch({ n: 2 });
      await store.patch({ n: 3 });
      expect(seen).toEqual([1, 2, 3]);
      store.rollback();
      store.rollback();
      expect(store.get().n).toBe(1);
      expect(store.canRollback()).toBe(false); // historyLimit 2
      off();
      expect(store.select((s) => s.theme)).toBe("dark");
      const reloaded = new stateutils.AppStateStore("t", { n: 0, theme: "dark", extra: true }, { customPath: join(dir, "s.json") });
      expect(await reloaded.load()).toEqual({ n: 3, theme: "dark", extra: true });
      expect(await reloaded.removeFile()).toBe(true);

      const kv = new stateutils.KeyValueState("t", join(dir, "kv.json"));
      await kv.init();
      await kv.setMany({ a: 1, b: 2 });
      expect(kv.has("a")).toBe(true);
      expect(kv.keys()).toEqual(["a", "b"]);
      await kv.clear();
      expect(kv.all()).toEqual({});
    });
  });

  it("cacheutils > LRU extras and TTL de-dup / sliding / prune", async () => {
    const evicted: string[] = [];
    const lru = new cacheutils.LRUCache<string, number>(2, (k) => evicted.push(k));
    lru.set("a", 1);
    lru.set("b", 2);
    lru.peek("a"); // no recency bump
    lru.set("c", 3);
    expect(evicted).toEqual(["a"]);
    expect(lru.getOrSet("d", () => 4)).toBe(4);
    expect(lru.keys()).toEqual(["c", "d"]);
    lru.resize(1);
    expect(lru.size()).toBe(1);
    expect(lru.stats().evictions).toBe(3);

    const ttl = new cacheutils.TTLCache<string, number>(50);
    let calls = 0;
    const factory = async () => {
      calls++;
      await Bun.sleep(5);
      return 42;
    };
    const [x, y] = await Promise.all([ttl.getOrSet("k", factory), ttl.getOrSet("k", factory)]);
    expect([x, y, calls]).toEqual([42, 42, 1]);
    expect(ttl.ttl("k")).toBeGreaterThan(0);
    expect(ttl.ttl("missing")).toBe(-1);
    ttl.set("short", 1, 1);
    await Bun.sleep(5);
    expect(ttl.prune()).toBeGreaterThanOrEqual(1);
    expect(ttl.touch("k", 1000)).toBe(true);
    expect(ttl.keys()).toEqual(["k"]);
    expect(ttl.stats().hits).toBeGreaterThanOrEqual(0);
    ttl.dispose();
  });
});
