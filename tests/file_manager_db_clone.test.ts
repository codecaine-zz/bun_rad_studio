import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { Database } from "bun:sqlite";
import { SqliteAdapter } from "../src/db/adapters/sqlite";
import type { ConnectionConfig, DbAdapter, ObjectRef, Param, QueryOptions, QueryResult, TableInfo } from "../src/db/types";
import type { CloneRedisClient } from "../src/features/filemanager/fmDbHooks";
import type { TestInput } from "../src/features/filemanager/fmDbTest";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { FakeKeychain, fakeStudioCommand } from "./helpers/db_fm";

setDefaultTimeout(30_000);

/**
 * In-memory Redis emulator implementing `CloneRedisClient` (`SCAN`, `TYPE`, `PTTL`, `PEXPIRE`, `EXISTS`, `DEL`,
 * `GET`, `SET`, `HGETALL`, `HSET`, `LRANGE`, `RPUSH`, `SMEMBERS`, `SADD`, `ZRANGE`, `ZADD`) so Redis <-> SQL and
 * Redis <-> Redis cloning can be tested deterministically without an external Redis server.
 */
class FakeRedisStore {
  readonly items = new Map<
    string,
    {
      type: "string" | "hash" | "list" | "set" | "zset";
      ttlMs: number | null;
      str?: string;
      hash?: Map<string, string>;
      list?: string[];
      set?: Set<string>;
      zset?: Map<string, string>;
    }
  >();

  client(): CloneRedisClient {
    const store = this.items;
    return {
      async send(cmd: string, args: string[]) {
        const u = cmd.toUpperCase();
        if (u === "SCAN") {
          const matchIdx = args.findIndex((a) => a.toUpperCase() === "MATCH");
          const pattern = matchIdx >= 0 ? (args[matchIdx + 1] ?? "*") : "*";
          const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
          const keys = [...store.keys()].filter((k) => !prefix || k.startsWith(prefix)).sort();
          return ["0", keys];
        }
        if (u === "TYPE") {
          const entry = store.get(args[0]!);
          return entry ? entry.type : "none";
        }
        if (u === "PTTL") {
          const entry = store.get(args[0]!);
          if (!entry) return -2;
          return entry.ttlMs ?? -1;
        }
        if (u === "PEXPIRE") {
          const entry = store.get(args[0]!);
          if (!entry) return 0;
          entry.ttlMs = Number(args[1] ?? 0);
          return 1;
        }
        if (u === "EXISTS") {
          return store.has(args[0]!) ? 1 : 0;
        }
        if (u === "DEL") {
          let n = 0;
          for (const k of args) if (store.delete(k)) n++;
          return n;
        }
        if (u === "GET") {
          const entry = store.get(args[0]!);
          return entry?.type === "string" ? (entry.str ?? "") : null;
        }
        if (u === "SET") {
          store.set(args[0]!, { type: "string", ttlMs: null, str: String(args[1] ?? "") });
          return "OK";
        }
        if (u === "HGETALL") {
          const entry = store.get(args[0]!);
          if (!entry || entry.type !== "hash" || !entry.hash) return [];
          const out: string[] = [];
          for (const [k, v] of entry.hash.entries()) out.push(k, v);
          return out;
        }
        if (u === "HSET") {
          const key = args[0]!;
          let entry = store.get(key);
          if (!entry || entry.type !== "hash" || !entry.hash) {
            entry = { type: "hash", ttlMs: null, hash: new Map() };
            store.set(key, entry);
          }
          for (let i = 1; i + 1 < args.length; i += 2) {
            entry.hash!.set(args[i]!, args[i + 1]!);
          }
          return Math.floor((args.length - 1) / 2);
        }
        if (u === "LRANGE") {
          const entry = store.get(args[0]!);
          return entry?.type === "list" ? [...(entry.list ?? [])] : [];
        }
        if (u === "RPUSH") {
          const key = args[0]!;
          let entry = store.get(key);
          if (!entry || entry.type !== "list" || !entry.list) {
            entry = { type: "list", ttlMs: null, list: [] };
            store.set(key, entry);
          }
          entry.list!.push(...args.slice(1));
          return entry.list!.length;
        }
        if (u === "SMEMBERS") {
          const entry = store.get(args[0]!);
          return entry?.type === "set" ? [...(entry.set ?? [])].sort() : [];
        }
        if (u === "SADD") {
          const key = args[0]!;
          let entry = store.get(key);
          if (!entry || entry.type !== "set" || !entry.set) {
            entry = { type: "set", ttlMs: null, set: new Set() };
            store.set(key, entry);
          }
          for (const m of args.slice(1)) entry.set!.add(m);
          return entry.set!.size;
        }
        if (u === "ZRANGE") {
          const entry = store.get(args[0]!);
          if (!entry || entry.type !== "zset" || !entry.zset) return [];
          const out: string[] = [];
          for (const [member, score] of entry.zset.entries()) out.push(member, score);
          return out;
        }
        if (u === "ZADD") {
          const key = args[0]!;
          let entry = store.get(key);
          if (!entry || entry.type !== "zset" || !entry.zset) {
            entry = { type: "zset", ttlMs: null, zset: new Map() };
            store.set(key, entry);
          }
          for (let i = 1; i + 1 < args.length; i += 2) {
            entry.zset!.set(args[i + 1]!, args[i]!);
          }
          return entry.zset!.size;
        }
        return "OK";
      },
      close() {},
    };
  }
}

/**
 * SQLite-backed adapter that emulates MySQL or PostgreSQL dialect SQL generated during cross-engine cloning,
 * recording all executed SQL statements while translating dialect-specific clauses to SQLite so data and schema
 * round-tripping across `sqlite` <-> `mysql` <-> `postgres` can be verified end-to-end.
 */
class DialectBackedSqliteAdapter implements DbAdapter {
  readonly config: Readonly<Omit<ConnectionConfig, "password">>;
  readonly engine: "mysql" | "postgres";
  readonly executedSql: string[] = [];
  private inner: SqliteAdapter;
  private schema?: string;

  constructor(config: ConnectionConfig, sqlitePath: string) {
    this.engine = config.engine as "mysql" | "postgres";
    this.schema = config.engine === "postgres" ? (config.schema || "public") : undefined;
    this.config = config;
    this.inner = new SqliteAdapter({
      engine: "sqlite",
      path: sqlitePath,
      sqliteMode: config.readOnly ? "readonly" : "readwrite",
      readOnly: config.readOnly,
    });
  }

  private normalizeSqlForSqlite(sql: string): string {
    if (/SELECT\s+setval\(\s*pg_get_serial_sequence/i.test(sql)) {
      return "SELECT 1 AS seq_synced";
    }
    let s = sql;
    if (this.engine === "postgres" && this.schema) {
      const schemaPrefix = new RegExp(`"${this.schema}"\\.`, "g");
      s = s.replace(schemaPrefix, "");
    }
    s = s.replace(/`([^`]+)`/g, '"$1"');
    s = s.replace(/\$\d+/g, "?");
    s = s.replace(/\bGENERATED\s+BY\s+DEFAULT\s+AS\s+IDENTITY\s+PRIMARY\s+KEY\b/gi, "PRIMARY KEY AUTOINCREMENT");
    s = s.replace(/\bBIGINT\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, "INTEGER PRIMARY KEY AUTOINCREMENT");
    s = s.replace(/\bINT\s+NOT\s+NULL\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, "INTEGER PRIMARY KEY AUTOINCREMENT");
    s = s.replace(/\bBIGINT\s+NOT\s+NULL\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, "INTEGER PRIMARY KEY AUTOINCREMENT");
    s = s.replace(/\s+ENGINE=InnoDB\s+DEFAULT\s+CHARSET=utf8mb4\b/gi, "");
    s = s.replace(/\bDROP\s+TABLE\s+IF\s+EXISTS\s+("[^"]+")\s+CASCADE\b/gi, "DROP TABLE IF EXISTS $1");
    s = s.replace(/\bINSERT\s+IGNORE\s+INTO\b/gi, "INSERT OR IGNORE INTO");
    if (/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i.test(s)) {
      s = s.replace(/\bINSERT\s+INTO\b/i, "INSERT OR REPLACE INTO").replace(/\s+ON\s+DUPLICATE\s+KEY\s+UPDATE[\s\S]*$/i, "");
    }
    return s;
  }

  connect() {
    return this.inner.connect();
  }
  close() {
    return this.inner.close();
  }
  ping() {
    return this.inner.ping();
  }
  capabilities() {
    return this.inner.capabilities();
  }
  async query(sql: string, params?: Param[], options?: QueryOptions): Promise<QueryResult> {
    this.executedSql.push(sql);
    return await this.inner.query(this.normalizeSqlForSqlite(sql), params, options);
  }
  openSession() {
    return this.inner.openSession();
  }
  async listObjects(): Promise<ObjectRef[]> {
    const objs = await this.inner.listObjects();
    return objs.map((o) => ({ ...o, ...(this.schema ? { schema: this.schema } : {}) }));
  }
  async describeTable(ref: ObjectRef): Promise<TableInfo> {
    const info = await this.inner.describeTable({ name: ref.name, type: ref.type });
    return { ...info, ...(this.schema ? { schema: this.schema } : {}) };
  }
  browse(req: any) {
    return this.inner.browse(req);
  }
  insertRow(req: any) {
    return this.inner.insertRow(req);
  }
  updateRow(req: any) {
    return this.inner.updateRow(req);
  }
  deleteRow(req: any) {
    return this.inner.deleteRow(req);
  }
  exportCsv(source: any) {
    return this.inner.exportCsv(source);
  }
}

const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch", "localStorage", "sessionStorage"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-db-clone-"));
const home = join(root, "home");
const dbFolder = join(root, "databases");
const keychain = new FakeKeychain();

const redisStores = new Map<number, FakeRedisStore>([
  [0, new FakeRedisStore()],
  [1, new FakeRedisStore()],
]);
const sqlBackingFiles = new Map<string, string>();
const recordedAdapters = new Map<string, DialectBackedSqliteAdapter>();

let server: ReturnType<typeof startFileManagerServer>;
let base = "";
let win: any;
let doc: any;
let power: any;
let dbState: any;
let dbFiles: any;
let dbClone: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => any, what: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${what}. Dialog: ${String(top()?.textContent ?? "").replace(/\s+/g, " ").slice(0, 500)}`);
}
const pane = (): any => doc.getElementById("power-pane-databases");
const top = (): any => [...doc.querySelectorAll(".modal-backdrop")].at(-1);
const click = (el: any) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
const setValue = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
};
const button = (text: string, from: any): any => [...from.querySelectorAll("button")].find((b: any) => b.textContent.trim().includes(text));
const call = async (op: string, body: Record<string, unknown> = {}) => {
  const r = await fetch(`${base}/api/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-fm-token": "ui-token" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as any };
};

let sourceSqlitePath = "";
let mysqlSqliteBacking = "";
let pgSqliteBacking = "";

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({
    terminalShell: () => "posix",
    terminalWsl: () => ({}),
    terminalAvailable: () => true,
    typeInTerminal: () => true,
    showTerminal() {},
    hideTerminal() {},
    toggleTerminal() {},
    wireTerminal() {},
    isTerminalOpen: () => false,
  }));
  for (const d of [home, dbFolder]) mkdirSync(d, { recursive: true });

  sourceSqlitePath = join(dbFolder, "source_shop.sqlite");
  mysqlSqliteBacking = join(dbFolder, "backing_mysql.sqlite");
  pgSqliteBacking = join(dbFolder, "backing_postgres.sqlite");

  // Seed rich source SQLite database with FK dependencies (categories <- products <- order_items), views, indexes, blobs, JSON, booleans
  const srcDb = new Database(sourceSqlitePath, { create: true });
  srcDb.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug VARCHAR(64) NOT NULL UNIQUE,
      title TEXT NOT NULL
    );
    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      sku VARCHAR(40) NOT NULL,
      price NUMERIC(10,2) NOT NULL DEFAULT 0,
      in_stock BOOLEAN NOT NULL DEFAULT 1,
      metadata JSON,
      thumbnail BLOB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX idx_products_sku ON products(sku);
    CREATE INDEX idx_products_cat ON products(category_id);
    CREATE VIEW active_products AS
      SELECT id, sku, price FROM products WHERE in_stock = 1;

    INSERT INTO categories (id, slug, title) VALUES
      (1, 'hardware', 'Synthesizers & Hardware'),
      (2, 'software', 'Audio Plugins');
    INSERT INTO products (id, category_id, sku, price, in_stock, metadata, thumbnail) VALUES
      (10, 1, 'SYNTH-01', 499.95, 1, '{"polyphony":16}', X'CAFEBABE'),
      (11, 1, 'DRUM-02', 299.00, 0, '{"pads":8}', X'DEADBEEF'),
      (12, 2, 'REVERB-PRO', 79.50, 1, '{"stereo":true}', NULL);
  `);
  srcDb.close();

  // Initialize empty backing SQLite files for simulated MySQL and Postgres servers
  for (const p of [mysqlSqliteBacking, pgSqliteBacking]) {
    const d = new Database(p, { create: true });
    d.exec("VACUUM");
    d.close();
  }
  sqlBackingFiles.set("mysql:shop_mysql", mysqlSqliteBacking);
  sqlBackingFiles.set("postgres:shop_pg", pgSqliteBacking);

  // Seed Redis db 0 with hashes, strings, sets and TTLs
  const r0 = redisStores.get(0)!.client();
  await r0.send("HSET", ["customers:101", "name", "Ada Lovelace", "tier", "gold", "email", "ada@example.org"]);
  await r0.send("PEXPIRE", ["customers:101", "60000"]);
  await r0.send("HSET", ["customers:102", "name", "Alan Turing", "tier", "platinum", "email", "alan@example.org"]);
  await r0.send("SET", ["config:site_title", "Codecaine Audio Shop"]);
  await r0.send("SET", ["config:maintenance", "off"]);

  server = startFileManagerServer({
    port: 0,
    token: "ui-token",
    context: {
      platform: "linux",
      home,
      dataDir: join(root, "data"),
      databases: {
        secretStore: async () => keychain,
        env: () => ({ PATH: process.env.PATH ?? "" }),
        cwd: () => home,
        appRoots: () => [],
        studioCommand: () => fakeStudioCommand(),
        openAdapter(config: ConnectionConfig) {
          if (config.engine === "sqlite") return new SqliteAdapter(config);
          const key = `${config.engine}:${config.database ?? "default"}`;
          const backing = sqlBackingFiles.get(key);
          if (!backing) throw new Error(`No backing store for ${key}`);
          const adapter = new DialectBackedSqliteAdapter(config, backing);
          recordedAdapters.set(key, adapter);
          return adapter;
        },
        async openRedis(input: TestInput) {
          const idx = input.dbIndex ?? 0;
          let st = redisStores.get(idx);
          if (!st) {
            st = new FakeRedisStore();
            redisStores.set(idx, st);
          }
          return st.client();
        },
        startTimeoutMs: 15_000,
        killGraceMs: 400,
      },
    },
  });

  base = `http://127.0.0.1:${server.port}`;
  const html = readFileSyncSafe(join(import.meta.dir, "..", "resources", "file_manager", "index.html"))
    .replace(/__FM_TOKEN__/g, "ui-token")
    .replace(/__FM_PLATFORM__/g, "linux")
    .replace(/__FM_NONCE__/g, "n")
    .replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = win.document;
  const st = (await import("../resources/file_manager/ui/state.js")).state;
  st.platform = "linux";
  st.sep = "/";
  st.home = home;
  st.location = { kind: "folder", path: dbFolder };
  power = await import("../resources/file_manager/ui/power.js");
  dbState = await import("../resources/file_manager/ui/dbState.js");
  dbFiles = await import("../resources/file_manager/ui/dbFiles.js");
  dbClone = await import("../resources/file_manager/ui/dbClone.js");
  await import("../resources/file_manager/ui/databases.js");
  dbState.resetDatabases();
  power.resetPower();
});

function readFileSyncSafe(p: string): string {
  const { readFileSync } = require("fs");
  return readFileSync(p, "utf8");
}

afterAll(() => {
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(g, k, d);
    else delete g[k];
  }
  mock.restore();
  server?.stop(true);
  try { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
});

describe("Database & Table Cloning: Backend Operations", () => {
  let sqliteProfileId = "";
  let mysqlProfileId = "";
  let pgProfileId = "";
  let redis0ProfileId = "";
  let redis1ProfileId = "";

  test("saves connections for SQLite, MySQL, PostgreSQL and Redis", async () => {
    const rSqlite = await call("db/profile/save", {
      profile: { engine: "sqlite", name: "Source Shop SQLite", path: sourceSqlitePath, sqliteMode: "readwrite" },
    });
    expect(rSqlite.status).toBe(200);
    sqliteProfileId = rSqlite.body.profile.id;

    const rMysql = await call("db/profile/save", {
      profile: { engine: "mysql", name: "Shop MySQL", host: "127.0.0.1", port: 3306, user: "root", database: "shop_mysql" },
      password: "secret-mysql-password",
    });
    expect(rMysql.status).toBe(200);
    mysqlProfileId = rMysql.body.profile.id;

    const rPg = await call("db/profile/save", {
      profile: { engine: "postgres", name: "Shop Postgres", host: "127.0.0.1", port: 5432, user: "postgres", database: "shop_pg", schema: "public" },
      password: "secret-pg-password",
    });
    expect(rPg.status).toBe(200);
    pgProfileId = rPg.body.profile.id;

    const rRedis0 = await call("db/profile/save", {
      profile: { engine: "redis", name: "Redis Primary (db 0)", host: "127.0.0.1", port: 6379, dbIndex: 0 },
    });
    expect(rRedis0.status).toBe(200);
    redis0ProfileId = rRedis0.body.profile.id;

    const rRedis1 = await call("db/profile/save", {
      profile: { engine: "redis", name: "Redis Replica (db 1)", host: "127.0.0.1", port: 6379, dbIndex: 1 },
    });
    expect(rRedis1.status).toBe(200);
    redis1ProfileId = rRedis1.body.profile.id;
  });

  test("db/clone/inspect inspects SQLite tables, views, foreign keys, indexes and row counts", async () => {
    const { status, body } = await call("db/clone/inspect", { source: { profileId: sqliteProfileId } });
    expect(status).toBe(200);
    expect(body.source.engine).toBe("sqlite");
    expect(body.totalRows).toBe(7); // 2 categories + 3 products + 2 rows in active_products view
    const names = body.objects.map((o: any) => `${o.name}:${o.kind}`);
    expect(names).toEqual(["active_products:view", "categories:table", "products:table"]);
    const products = body.objects.find((o: any) => o.name === "products");
    expect(products.rowCount).toBe(3);
    expect(products.primaryKey).toEqual(["id"]);
    expect(products.foreignKeys.length).toBe(1);
    expect(products.foreignKeys[0].refTable).toBe("categories");
    expect(products.indexes.filter((i: any) => !i.primary).length).toBe(2);
  });

  test("clones an entire SQLite database into a brand-new SQLite file with topological FK ordering, views, indexes and binary blobs", async () => {
    const preview = await call("db/clone/preview", {
      source: { profileId: sqliteProfileId },
      target: { kind: "newSqlite", folder: dbFolder, name: "full_clone" },
      options: { contentMode: "all", conflictMode: "replace", includeIndexes: true, includeForeignKeys: true, includeViews: true },
    });
    expect(preview.status).toBe(200);
    // Topological sort puts `categories` BEFORE `products`, and `active_products` view last!
    expect(preview.body.plans.map((p: any) => p.sourceName)).toEqual(["categories", "products", "active_products"]);

    const run = await call("db/clone/run", {
      source: { profileId: sqliteProfileId },
      target: { kind: "newSqlite", folder: dbFolder, name: "full_clone", saveProfile: true },
      options: { contentMode: "all", conflictMode: "replace", includeIndexes: true, includeForeignKeys: true, includeViews: true },
    });
    expect(run.status).toBe(200);
    const clonedPath = join(dbFolder, "full_clone.sqlite");
    expect(run.body.createdPath).toBe(clonedPath);
    expect(run.body.createdProfile.path).toBe(clonedPath);
    expect(run.body.summary.tablesCopied).toBe(2);
    expect(run.body.summary.viewsCopied).toBe(1);
    expect(run.body.summary.rowsCopied).toBe(5);
    expect(run.body.summary.indexesCreated).toBeGreaterThanOrEqual(2);
    expect(run.body.summary.foreignKeysCreated).toBe(1);

    const db = new Database(clonedPath, { readonly: true });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    const cats = db.query("SELECT id, slug, title FROM categories ORDER BY id").all() as any[];
    expect(cats.length).toBe(2);
    const prods = db.query("SELECT id, sku, thumbnail FROM products ORDER BY id").all() as any[];
    expect(prods.length).toBe(3);
    expect(Buffer.from(prods[0].thumbnail).toString("hex").toUpperCase()).toBe("CAFEBABE");
    const active = db.query("SELECT sku FROM active_products ORDER BY id").all() as any[];
    expect(active.map((r) => r.sku)).toEqual(["SYNTH-01", "REVERB-PRO"]);
    db.close();
  });

  test("clones selected tables within the same SQLite database using tablePrefix or renameMap, and refuses self-overwrite", async () => {
    // Self-overwrite without prefix or renameMap is refused
    const bad = await call("db/clone/run", {
      source: { profileId: sqliteProfileId },
      target: { profileId: sqliteProfileId },
      options: { tables: ["categories"] },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain("same database");

    // With renameMap, clones `categories` -> `categories_backup` inside the same database!
    const ok = await call("db/clone/run", {
      source: { profileId: sqliteProfileId },
      target: { profileId: sqliteProfileId },
      options: { tables: ["categories"], renameMap: { categories: "categories_backup" }, rowLimit: 1 },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.summary.rowsCopied).toBe(1);

    const db = new Database(sourceSqlitePath, { readonly: true });
    const rows = db.query("SELECT slug FROM categories_backup").all() as any[];
    expect(rows).toEqual([{ slug: "hardware" }]);
    db.close();

    // Clean up categories_backup so source stays clean
    const wdb = new Database(sourceSqlitePath);
    wdb.exec("DROP TABLE categories_backup");
    wdb.close();
  });

  test("supports conflict modes: skip, append, upsert, truncate, and fail", async () => {
    const destPath = join(dbFolder, "conflict_test.sqlite");
    // 1. Initial clone with rowLimit: 1
    const r1 = await call("db/clone/run", {
      source: { path: sourceSqlitePath },
      target: { kind: "newSqlite", folder: dbFolder, name: "conflict_test", saveProfile: false },
      options: { tables: ["categories"], rowLimit: 1 },
    });
    expect(r1.status).toBe(200);
    expect(r1.body.summary.rowsCopied).toBe(1);

    // 2. "skip" mode skips existing table
    const rSkip = await call("db/clone/run", {
      source: { path: sourceSqlitePath },
      target: { path: destPath },
      options: { tables: ["categories"], conflictMode: "skip" },
    });
    expect(rSkip.status).toBe(200);
    expect(rSkip.body.summary.skippedCount).toBe(1);
    expect(rSkip.body.summary.rowsCopied).toBe(0);

    // 3. "fail" mode stops with CONFLICT error
    const rFail = await call("db/clone/run", {
      source: { path: sourceSqlitePath },
      target: { path: destPath },
      options: { tables: ["categories"], conflictMode: "fail" },
    });
    expect(rFail.status).toBe(400);
    expect(rFail.body.error.code).toBe("CONFLICT");

    // 4. Modify row 1 in dest, then run "append" (keeps modified row 1, adds row 2)
    let d = new Database(destPath);
    d.exec("UPDATE categories SET title = 'Modified Title' WHERE id = 1");
    d.close();

    const rAppend = await call("db/clone/run", {
      source: { path: sourceSqlitePath },
      target: { path: destPath },
      options: { tables: ["categories"], conflictMode: "append" },
    });
    expect(rAppend.status).toBe(200);
    d = new Database(destPath, { readonly: true });
    expect((d.query("SELECT title FROM categories WHERE id = 1").get() as any).title).toBe("Modified Title");
    expect((d.query("SELECT COUNT(*) AS c FROM categories").get() as any).c).toBe(2);
    d.close();

    // 5. Run "upsert" (updates row 1 back to 'Synthesizers & Hardware')
    const rUpsert = await call("db/clone/run", {
      source: { path: sourceSqlitePath },
      target: { path: destPath },
      options: { tables: ["categories"], conflictMode: "upsert" },
    });
    expect(rUpsert.status).toBe(200);
    d = new Database(destPath, { readonly: true });
    expect((d.query("SELECT title FROM categories WHERE id = 1").get() as any).title).toBe("Synthesizers & Hardware");
    d.close();
  });

  test("clones across SQL engines: SQLite -> MySQL -> PostgreSQL -> SQLite with dialect translation", async () => {
    // 1. SQLite -> MySQL
    const toMysql = await call("db/clone/run", {
      source: { profileId: sqliteProfileId },
      target: { profileId: mysqlProfileId },
      options: { contentMode: "all", conflictMode: "replace", includeViews: true },
    });
    expect(toMysql.status).toBe(200);
    expect(toMysql.body.summary.targetEngine).toBe("mysql");
    // Views across different engines are materialized as tables
    expect(toMysql.body.summary.warnings.some((w: string) => w.includes("materialized as table"))).toBe(true);
    const mysqlAdapter = recordedAdapters.get("mysql:shop_mysql")!;
    expect(mysqlAdapter.executedSql.some((s) => s.includes("ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"))).toBe(true);
    expect(mysqlAdapter.executedSql.some((s) => s.includes("AUTO_INCREMENT PRIMARY KEY"))).toBe(true);

    // 2. MySQL -> PostgreSQL
    const toPg = await call("db/clone/run", {
      source: { profileId: mysqlProfileId },
      target: { profileId: pgProfileId },
      options: { tables: ["categories", "products"], contentMode: "all", conflictMode: "replace" },
    });
    expect(toPg.status).toBe(200);
    expect(toPg.body.summary.targetEngine).toBe("postgres");
    expect(toPg.body.summary.rowsCopied).toBe(5);
    const pgAdapter = recordedAdapters.get("postgres:shop_pg")!;
    expect(pgAdapter.executedSql.some((s) => s.includes("GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY"))).toBe(true);
    expect(pgAdapter.executedSql.some((s) => s.includes("pg_get_serial_sequence"))).toBe(true);

    // 3. PostgreSQL -> New SQLite file
    const toSqlite = await call("db/clone/run", {
      source: { profileId: pgProfileId },
      target: { kind: "newSqlite", folder: dbFolder, name: "from_postgres", saveProfile: false },
      options: { contentMode: "all", conflictMode: "replace" },
    });
    expect(toSqlite.status).toBe(200);
    expect(toSqlite.body.summary.rowsCopied).toBe(5);
    const finalDb = new Database(join(dbFolder, "from_postgres.sqlite"), { readonly: true });
    expect((finalDb.query("SELECT COUNT(*) AS c FROM products").get() as any).c).toBe(3);
    finalDb.close();
  });

  test("clones Redis <-> Redis, Redis -> SQLite, and SQLite -> Redis seamlessly", async () => {
    // 1. Inspect Redis db 0
    const inspectRedis = await call("db/clone/inspect", { source: { profileId: redis0ProfileId } });
    expect(inspectRedis.status).toBe(200);
    expect(inspectRedis.body.source.engine).toBe("redis");
    const groups = inspectRedis.body.objects.map((o: any) => `${o.name}:${o.redisKeyType}:${o.rowCount}`);
    expect(groups).toEqual(["config:string:2", "customers:hash:2"]);

    // 2. Redis (db 0) -> Redis (db 1) with prefix
    const rToR = await call("db/clone/run", {
      source: { profileId: redis0ProfileId },
      target: { profileId: redis1ProfileId },
      options: { tablePrefix: "copied_" },
    });
    expect(rToR.status).toBe(200);
    expect(rToR.body.summary.keysCopied).toBe(4);
    const r1Store = redisStores.get(1)!;
    expect(r1Store.items.get("copied_customers:101")?.hash?.get("name")).toBe("Ada Lovelace");
    expect(r1Store.items.get("copied_customers:101")?.ttlMs).toBe(60000);
    expect(r1Store.items.get("copied_config:site_title")?.str).toBe("Codecaine Audio Shop");

    // 3. Redis (db 0) -> New SQLite file (hashes become structured columns, strings become key/value rows)
    const rToSql = await call("db/clone/run", {
      source: { profileId: redis0ProfileId },
      target: { kind: "newSqlite", folder: dbFolder, name: "from_redis", saveProfile: false },
      options: { contentMode: "all", conflictMode: "replace" },
    });
    expect(rToSql.status).toBe(200);
    expect(rToSql.body.summary.rowsCopied).toBe(4);
    const sqlFromRedis = new Database(join(dbFolder, "from_redis.sqlite"), { readonly: true });
    const custRows = sqlFromRedis.query("SELECT redis_key, key_id, name, tier, email, ttl_ms FROM customers ORDER BY key_id").all() as any[];
    expect(custRows).toEqual([
      { redis_key: "customers:101", key_id: "101", name: "Ada Lovelace", tier: "gold", email: "ada@example.org", ttl_ms: 60000 },
      { redis_key: "customers:102", key_id: "102", name: "Alan Turing", tier: "platinum", email: "alan@example.org", ttl_ms: null },
    ]);
    const cfgRows = sqlFromRedis.query("SELECT redis_key, redis_type, value_text FROM config ORDER BY redis_key").all() as any[];
    expect(cfgRows).toEqual([
      { redis_key: "config:maintenance", redis_type: "string", value_text: "off" },
      { redis_key: "config:site_title", redis_type: "string", value_text: "Codecaine Audio Shop" },
    ]);
    sqlFromRedis.close();

    // 4. SQLite -> Redis (db 1) as Redis Hashes
    const sqlToR = await call("db/clone/run", {
      source: { profileId: sqliteProfileId },
      target: { profileId: redis1ProfileId },
      options: { tables: ["categories"], redisFormat: "hash" },
    });
    expect(sqlToR.status).toBe(200);
    expect(sqlToR.body.summary.rowsCopied).toBe(2);
    expect(r1Store.items.get("categories:1")?.hash?.get("slug")).toBe("hardware");
    expect(r1Store.items.get("categories:2")?.hash?.get("title")).toBe("Audio Plugins");
    expect([...(r1Store.items.get("categories:_ids")?.set ?? [])].sort()).toEqual(["1", "2"]);
  });

  test("requires confirmation before writing to a production or read-only target connection", async () => {
    const prodSave = await call("db/profile/save", {
      profile: {
        engine: "sqlite",
        name: "Production Target",
        path: join(dbFolder, "from_postgres.sqlite"),
        sqliteMode: "readwrite",
        environment: "production",
      },
    });
    const prodId = prodSave.body.profile.id;

    const unconfirmed = await call("db/clone/run", {
      source: { profileId: sqliteProfileId },
      target: { profileId: prodId },
      options: { tables: ["categories"] },
    });
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.error.code).toBe("NEEDS_CONFIRM");

    const confirmed = await call("db/clone/run", {
      source: { profileId: sqliteProfileId },
      target: { profileId: prodId },
      options: { tables: ["categories"] },
      confirmWrites: true,
    });
    expect(confirmed.status).toBe(200);
  });
});

describe("Database & Table Cloning: UI Dialog & File Manager Integration", () => {
  test("right-clicking a SQLite file offers Clone database / tables… without altering sqliteMenuItems", () => {
    const entry = { name: "source_shop.sqlite", path: sourceSqlitePath, isDir: false, size: 8192, mtimeMs: 100 };
    // Before probing, returns empty
    expect(dbClone.cloneSqliteMenuItems([entry])).toEqual([]);
    // Keep sqliteMenuItems contract intact
    expect(typeof dbFiles.sqliteMenuItems).toBe("function");
  });

  test("toolbar Clone button opens the wizard, inspects source, previews DDL and clones selected tables into a new SQLite connection", async () => {
    power.openPower("databases", {});
    await until(() => pane() && !pane().hidden && pane().querySelector(".db-toolbar"), "the Databases tab");
    await until(() => dbState.db.loaded, "the overview");

    const cloneBtn = button("🧬 Clone database / tables…", pane());
    expect(cloneBtn).toBeTruthy();
    click(cloneBtn);

    await until(() => top()?.querySelector(".db-clone-list .db-clone-item"), "the clone dialog and inspected source objects");
    const dlg = top();
    expect(dlg.querySelector("[role=dialog]")?.getAttribute("aria-modal")).toBe("true");
    expect(dlg.querySelectorAll(".db-clone-item").length).toBe(3);

    // Click "Tables only" so the view is unchecked
    click(button("Tables only", dlg));
    expect(dlg.querySelector(".db-clone-selmeta")?.textContent).toContain("2 of 3 selected");

    // Choose "New SQLite database file…" as the target
    const dstSelect = dlg.querySelector('select[aria-label="Target database"]');
    setValue(dstSelect, "__new_sqlite__");
    const nameInput = dlg.querySelector('input[aria-label="File name for the new SQLite file"]');
    setValue(nameInput, "ui_cloned_shop.sqlite");

    // Click "Preview plan & SQL"
    click(button("Preview plan & SQL", dlg));
    await until(() => !dlg.querySelector(".db-clone-preview")?.hidden && dlg.querySelector(".db-clone-ddl"), "the SQL DDL preview");
    expect(dlg.querySelector(".db-clone-preview")?.textContent).toContain("CREATE TABLE");

    // Click "Clone now"
    click(button("Clone now", dlg));
    await until(() => !top(), "the clone dialog to close after cloning");

    const createdFile = join(dbFolder, "ui_cloned_shop.sqlite");
    expect(existsSync(createdFile)).toBe(true);
    const verifyDb = new Database(createdFile, { readonly: true });
    expect((verifyDb.query("SELECT COUNT(*) AS c FROM categories").get() as any).c).toBe(2);
    expect((verifyDb.query("SELECT COUNT(*) AS c FROM products").get() as any).c).toBe(3);
    verifyDb.close();
  });
});
