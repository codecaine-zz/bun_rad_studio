import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { Database } from "bun:sqlite";
import { SqliteAdapter } from "../src/db/adapters/sqlite";
import type { ConnectionConfig } from "../src/db/types";
import type { CloneRedisClient } from "../src/features/filemanager/fmDbHooks";
import type { TestInput } from "../src/features/filemanager/fmDbTest";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { FakeKeychain, fakeStudioCommand } from "./helpers/db_fm";

setDefaultTimeout(30_000);

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
        return "OK";
      },
      close() {},
    };
  }
}

const GLOBALS = [
  "window",
  "document",
  "navigator",
  "location",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLSelectElement",
  "HTMLTextAreaElement",
  "HTMLButtonElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CustomEvent",
  "Node",
  "Element",
  "MutationObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "localStorage",
  "sessionStorage",
  "CSS",
  "Blob",
  "URL",
  "fetch",
] as const;

let root = "";
let home = "";
let dbFolder = "";
let sqliteFilePath = "";
let server: ReturnType<typeof startFileManagerServer>;
let base = "";
let keychain: FakeKeychain;
let redisStore: FakeRedisStore;
let win: any;
let doc: Document;
let power: any;
let dbState: any;
let dbFiles: any;
let dbMacros: any;
const saved = new Map<string, PropertyDescriptor | undefined>();

async function call(op: string, payload: unknown = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}/api/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-fm-token": "ui-token" },
    body: JSON.stringify(payload ?? {}),
  });
  return { status: res.status, body: await res.json() };
}

function pane(): HTMLElement {
  return doc.getElementById("power-pane-databases")!;
}

function top(): HTMLElement | null {
  return ([...doc.querySelectorAll(".modal-backdrop")].at(-1) as HTMLElement | undefined) ?? null;
}

function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  el!.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function button(label: string, scope: ParentNode = doc): HTMLButtonElement | undefined {
  return [...scope.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().includes(label)) as HTMLButtonElement | undefined;
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null | undefined, value: string) {
  expect(el).toBeTruthy();
  el!.value = value;
  el!.dispatchEvent(new win.Event("input", { bubbles: true }));
  el!.dispatchEvent(new win.Event("change", { bubbles: true }));
}

async function until(pred: () => unknown, label: string, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = pred();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

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
  root = mkdtempSync(join(tmpdir(), "fm-db-macros-"));
  home = join(root, "home");
  dbFolder = join(home, "databases");
  mkdirSync(dbFolder, { recursive: true });
  keychain = new FakeKeychain();
  redisStore = new FakeRedisStore();

  sqliteFilePath = join(dbFolder, "store.sqlite");
  const db = new Database(sqliteFilePath, { create: true });
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'Silver',
      spent REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid'
    );
    INSERT INTO customers (id, name, email, tier, spent, active) VALUES
      (1, 'Ada Lovelace', 'ada@analytical.org', 'Gold', 900, 1),
      (2, 'Grace Hopper', 'grace@navy.mil', 'Gold', 1500, 1),
      (3, 'Alan Turing', 'alan@bletchley.uk', 'Silver', 320, 1);
    INSERT INTO orders (customer_id, total, status) VALUES
      (1, 450, 'paid'),
      (1, 450, 'paid'),
      (2, 1500, 'paid'),
      (3, 320, 'pending');
  `);
  db.close();

  const rc = redisStore.client();
  await rc.send("SET", ["app:version", "2.5.0"]);
  await rc.send("HSET", ["user:1", "name", "Ada Lovelace", "role", "admin"]);

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
          return new SqliteAdapter(config);
        },
        async openRedis(_input: TestInput) {
          return redisStore.client();
        },
        startTimeoutMs: 15_000,
        killGraceMs: 400,
      },
    },
  });

  base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8")
    .replace(/__FM_TOKEN__/g, "ui-token")
    .replace(/__FM_PLATFORM__/g, "linux")
    .replace(/__FM_NONCE__/g, "n")
    .replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch")) {
    Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  }
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", {
    value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o),
    configurable: true,
    writable: true,
  });
  doc = win.document;
  const st = (await import("../resources/file_manager/ui/state.js")).state;
  st.platform = "linux";
  st.sep = "/";
  st.home = home;
  st.location = { kind: "folder", path: dbFolder };
  power = await import("../resources/file_manager/ui/power.js");
  dbState = await import("../resources/file_manager/ui/dbState.js");
  dbFiles = await import("../resources/file_manager/ui/dbFiles.js");
  dbMacros = await import("../resources/file_manager/ui/dbMacros.js");
  await import("../resources/file_manager/ui/databases.js");
  dbState.resetDatabases();
  power.resetPower();
});

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

describe("File Manager Databases: Bun JS Macros Backend", () => {
  let sqliteProfileId = "";
  let redisProfileId = "";

  test("1. db/macros/list returns seeded Access-style Bun JS & Visual DoCmd default macros", async () => {
    const res = await call("db/macros/list");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.macros)).toBe(true);
    expect(res.body.macros.length).toBeGreaterThanOrEqual(5);
    const names = res.body.macros.map((m: any) => m.name);
    expect(names).toContain("Table Row Counter (Bun JS)");
    expect(names).toContain("Customer Order Audit (Access VBA style)");
    expect(names).toContain("Loyalty Tier Promotion (Transactional)");
    expect(names).toContain("Quick VIP Report (Visual DoCmd + RunCode)");
    expect(names).toContain("Redis Key Inspector & Cache Macro");
  });

  test("2. db/macros/save, db/macros/duplicate, and db/macros/delete manage custom macros", async () => {
    const saveRes = await call("db/macros/save", {
      macro: {
        name: "Custom Inventory Macro",
        description: "Counts active customers",
        mode: "bun",
        code: "return await DCount('*', 'customers', 'active = 1');",
      },
    });
    expect(saveRes.status).toBe(200);
    const savedMacro = saveRes.body.macro;
    expect(savedMacro.id).toBeTruthy();
    expect(savedMacro.name).toBe("Custom Inventory Macro");

    const dupRes = await call("db/macros/duplicate", { id: savedMacro.id });
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.macro.name).toBe("Custom Inventory Macro (Copy)");
    expect(dupRes.body.macro.id).not.toBe(savedMacro.id);

    const delRes = await call("db/macros/delete", { id: dupRes.body.macro.id });
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);
  });

  test("3. db/macros/validate checks Bun JS syntax via Bun.Transpiler and validates visual action rows", async () => {
    const badJs = await call("db/macros/validate", {
      macro: {
        name: "Broken JS",
        mode: "bun",
        code: "const x = ; // syntax error",
      },
    });
    expect(badJs.status).toBe(200);
    expect(badJs.body.valid).toBe(false);
    expect(badJs.body.issues.some((i: any) => i.severity === "error")).toBe(true);

    const warnJs = await call("db/macros/validate", {
      macro: {
        name: "Drop Table Warning",
        mode: "bun",
        code: "await db.execute('DROP TABLE old_logs');",
      },
    });
    expect(warnJs.status).toBe(200);
    expect(warnJs.body.valid).toBe(true);
    expect(warnJs.body.issues.some((i: any) => i.severity === "warning")).toBe(true);

    const badActions = await call("db/macros/validate", {
      macro: {
        name: "Broken Actions",
        mode: "actions",
        actions: [
          { id: "1", action: "RunSQL", enabled: true, parameters: {} },
          { id: "2", action: "DeleteRecord", enabled: true, parameters: { table: "customers" } },
          { id: "3", action: "RunMacro", enabled: true, parameters: { macroName: "NonExistentMacro" } },
        ],
      },
    });
    expect(badActions.status).toBe(200);
    expect(badActions.body.valid).toBe(false);
    expect(badActions.body.issues.filter((i: any) => i.severity === "error").length).toBe(2);
    expect(badActions.body.issues.filter((i: any) => i.severity === "warning").length).toBe(1);
  });

  test("4. db/macros/convert & db/macros/export convert visual DoCmd macros to Bun JS, Access VBA, SQL, and JSON", async () => {
    const visualMacro = {
      id: "vis_1",
      name: "Visual VIP Upgrade",
      description: "Upgrades high spenders",
      mode: "actions" as const,
      actions: [
        { id: "s1", action: "SetTempVar", enabled: true, parameters: { name: "cutoff", expression: "1000" } },
        { id: "s2", action: "UpdateRecord", enabled: true, condition: "[cutoff] >= 500", parameters: { table: "customers", setValues: "tier = 'VIP'", whereCondition: "spent >= 1000" } },
        { id: "s3", action: "RunCode", enabled: true, parameters: { code: "TempVars.vipCount = await DCount('*', 'customers', \"tier = 'VIP'\");" } },
        { id: "s4", action: "MessageBox", enabled: true, parameters: { message: "Upgraded [vipCount] VIPs", title: "VIP Upgrade", type: "info" } },
      ],
    };

    const conv = await call("db/macros/convert", { macro: visualMacro });
    expect(conv.status).toBe(200);
    expect(conv.body.code).toContain("DoCmd.SetTempVar(\"cutoff\"");
    expect(conv.body.code).toContain("DoCmd.UpdateRecord(\"customers\"");
    expect(conv.body.code).toContain("DCount('*', 'customers'");
    expect(conv.body.code).toContain("MsgBox(\"Upgraded [vipCount] VIPs\"");

    for (const format of ["bun", "vba", "sql", "json"] as const) {
      const exp = await call("db/macros/export", { macro: visualMacro, format });
      expect(exp.status).toBe(200);
      expect(exp.body.format).toBe(format);
      expect(exp.body.content.length).toBeGreaterThan(20);
      if (format === "vba") {
        expect(exp.body.content).toContain("Public Sub Visual_VIP_Upgrade()");
        expect(exp.body.content).toContain("CurrentDb.Execute");
      }
      if (format === "sql") {
        expect(exp.body.content).toContain("BEGIN TRANSACTION;");
      }
    }
  });

  test("5. executes Bun JS macros on Scratch SQLite with CurrentDb, DoCmd, DLookup/DCount/DSum/DAvg/DMin/DMax, OpenRecordset, and TempVars", async () => {
    const runRes = await call("db/macros/run", {
      target: { kind: "memory" },
      macro: {
        name: "Scratch Access VBA Suite",
        mode: "bun",
        code: `
          const initialCount = await DCount("*", "customers");
          const maxSpent = await DMax("spent", "customers");
          const minSpent = await DMin("spent", "customers");
          const avgSpent = await DAvg("spent", "customers");
          const topCustomer = await DLookup("name", "customers", "spent = " + maxSpent);

          // Recordset iteration (Access DAO style)
          const rs = await CurrentDb.OpenRecordset("SELECT name, spent FROM customers ORDER BY id ASC");
          const visited = [];
          while (!rs.EOF) {
            visited.push(rs.Fields("name"));
            rs.MoveNext();
          }
          rs.Close();

          // Insert & Update via DoCmd
          await DoCmd.InsertRecord("customers", {
            name: "Katherine Johnson",
            email: "kj@nasa.gov",
            tier: "Platinum",
            spent: 2500,
            active: 1,
          });
          await DoCmd.UpdateRecord("customers", "tier = 'VIP'", "spent >= 1000");

          const vipCount = await DCount("*", "customers", "tier = 'VIP'");
          const totalSpent = await DSum("spent", "customers");

          TempVars.topCustomer = topCustomer;
          TempVars.vipCount = vipCount;
          MsgBox("Top customer: [topCustomer], VIPs: [vipCount]", "Audit Complete", "info");
          Debug.print("Visited:", visited.join(", "));
          console.table(await DoCmd.OpenTable("customers", "tier = 'VIP'"));

          return {
            initialCount,
            maxSpent,
            minSpent,
            avgSpent: Math.round(avgSpent),
            topCustomer,
            visitedCount: visited.length,
            vipCount,
            totalSpent,
          };
        `,
      },
    });

    expect(runRes.status).toBe(200);
    const r = runRes.body;
    expect(r.ok).toBe(true);
    expect(r.target.engine).toBe("sqlite");
    expect(r.returnValue).toEqual({
      initialCount: 5,
      maxSpent: 2100,
      minSpent: 150,
      avgSpent: 993,
      topCustomer: "Margaret Hamilton",
      visitedCount: 5,
      vipCount: 3,
      totalSpent: 7465.5,
    });
    expect(r.messages[0].message).toBe("Top customer: Margaret Hamilton, VIPs: 3");
    expect(r.logs.some((l: any) => l.text.includes("Visited: Ada Lovelace"))).toBe(true);
    expect(r.resultSets.length).toBeGreaterThanOrEqual(1);
  });

  test("6. executes Bun JS macros against a real SQLite file on disk, supports atomic rollback on error, and dryRun rollback", async () => {
    // 1. Dry-run should not persist changes to sqliteFilePath
    const dryRes = await call("db/macros/run", {
      target: { kind: "sqliteFile", path: sqliteFilePath },
      dryRun: true,
      macro: {
        name: "Dry Run Insert",
        mode: "bun",
        code: `
          await db.insert("customers", { name: "Dry Run User", email: "dry@test.io", tier: "Gold", spent: 500, active: 1 });
          return await DCount("*", "customers");
        `,
      },
    });
    expect(dryRes.status).toBe(200);
    expect(dryRes.body.ok).toBe(true);
    expect(dryRes.body.dryRun).toBe(true);
    expect(dryRes.body.rolledBack).toBe(true);
    expect(dryRes.body.returnValue).toBe(4);

    // Verify file still has 3 customers
    let checkDb = new Database(sqliteFilePath, { readonly: true });
    expect((checkDb.query("SELECT COUNT(*) AS c FROM customers").get() as any).c).toBe(3);
    checkDb.close();

    // 2. Atomic transaction rolls back earlier writes when an error is thrown
    const failTx = await call("db/macros/run", {
      target: { kind: "sqliteFile", path: sqliteFilePath },
      transaction: true,
      macro: {
        name: "Failing Transaction",
        mode: "bun",
        code: `
          await db.insert("customers", { name: "Should Rollback", email: "rb@test.io", tier: "Silver", spent: 10, active: 1 });
          throw new Error("Simulated failure mid-macro");
        `,
      },
    });
    expect(failTx.status).toBe(200);
    expect(failTx.body.ok).toBe(false);
    expect(failTx.body.rolledBack).toBe(true);
    expect(failTx.body.error.message).toContain("Simulated failure mid-macro");

    checkDb = new Database(sqliteFilePath, { readonly: true });
    expect((checkDb.query("SELECT COUNT(*) AS c FROM customers").get() as any).c).toBe(3);
    checkDb.close();

    // 3. Real commit persists changes
    const commitRes = await call("db/macros/run", {
      target: { kind: "sqliteFile", path: sqliteFilePath },
      transaction: true,
      macro: {
        name: "Commit Insert",
        mode: "bun",
        code: `
          await db.insert("customers", { name: "Donald Knuth", email: "knuth@stanford.edu", tier: "Platinum", spent: 3000, active: 1 });
          return await DCount("*", "customers");
        `,
      },
    });
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.ok).toBe(true);
    expect(commitRes.body.committed).toBe(true);
    expect(commitRes.body.returnValue).toBe(4);

    checkDb = new Database(sqliteFilePath, { readonly: true });
    expect((checkDb.query("SELECT COUNT(*) AS c FROM customers").get() as any).c).toBe(4);
    checkDb.close();
  });

  test("7. supports [Enter ...] prompt parameters, Redis macros, cross-connection macros, production guards, and secret redaction", async () => {
    const saveSql = await call("db/profile/save", {
      profile: {
        engine: "sqlite",
        name: "Store SQLite",
        path: sqliteFilePath,
        sqliteMode: "readwrite",
      },
    });
    expect(saveSql.status).toBe(200);
    sqliteProfileId = saveSql.body.profile.id;

    const saveRedis = await call("db/profile/save", {
      profile: {
        engine: "redis",
        name: "Cache Redis",
        host: "127.0.0.1",
        port: 6379,
        dbIndex: 0,
      },
      password: "SUPER_SECRET_REDIS_PASSWORD_888",
    });
    expect(saveRedis.status).toBe(200);
    redisProfileId = saveRedis.body.profile.id;

    // 1. Missing [Enter Minimum Spent] prompt fails with promptsRequired list
    const missingPrompt = await call("db/macros/run", {
      target: { kind: "profile", profileId: sqliteProfileId },
      macro: {
        name: "Parameterized Query",
        mode: "bun",
        code: "return await db.query('SELECT name FROM customers WHERE spent >= [Enter Minimum Spent]');",
      },
    });
    expect(missingPrompt.status).toBe(200);
    expect(missingPrompt.body.ok).toBe(false);
    expect(missingPrompt.body.promptsRequired).toEqual(["Minimum Spent"]);

    // Provide prompt parameter value
    const withPrompt = await call("db/macros/run", {
      target: { kind: "profile", profileId: sqliteProfileId },
      params: { "Minimum Spent": "1000" },
      macro: {
        name: "Parameterized Query",
        mode: "bun",
        code: "return await db.query('SELECT name FROM customers WHERE spent >= [Enter Minimum Spent] ORDER BY spent DESC');",
      },
    });
    expect(withPrompt.status).toBe(200);
    expect(withPrompt.body.ok).toBe(true);
    expect(withPrompt.body.returnValue.map((r: any) => r.name)).toEqual(["Donald Knuth", "Grace Hopper"]);

    // 2. Redis macro execution + cross-connection access via connections.use()
    const redisRun = await call("db/macros/run", {
      target: { kind: "profile", profileId: redisProfileId },
      macro: {
        name: "Sync SQLite VIPs to Redis Cache",
        mode: "bun",
        code: `
          const ver = await redis.get("app:version");
          const sqlConn = await connections.use("Store SQLite");
          const vips = await sqlConn.db.query("SELECT id, name, tier FROM customers WHERE spent >= 1000 ORDER BY id");
          for (const v of vips) {
            await redis.hset("vip:" + v.id, { name: v.name, tier: v.tier });
          }
          const vip2 = await redis.hgetall("vip:2");
          return { ver, synced: vips.length, vip2 };
        `,
      },
    });
    expect(redisRun.status).toBe(200);
    expect(redisRun.body.ok).toBe(true);
    expect(redisRun.body.returnValue).toEqual({
      ver: "2.5.0",
      synced: 2,
      vip2: { name: "Grace Hopper", tier: "Gold" },
    });

    // 3. Production guard requires confirmWrites
    const saveProd = await call("db/profile/save", {
      profile: {
        engine: "sqlite",
        name: "Prod Store",
        path: sqliteFilePath,
        sqliteMode: "readwrite",
        environment: "production",
      },
    });
    const prodId = saveProd.body.profile.id;

    const unconfirmed = await call("db/macros/run", {
      target: { kind: "profile", profileId: prodId },
      macro: {
        name: "Prod Write",
        mode: "bun",
        code: "return await DCount('*', 'customers');",
      },
    });
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.error.code).toBe("NEEDS_CONFIRM");

    const confirmed = await call("db/macros/run", {
      target: { kind: "profile", profileId: prodId },
      confirmWrites: true,
      macro: {
        name: "Prod Write",
        mode: "bun",
        code: "return await DCount('*', 'customers');",
      },
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.ok).toBe(true);

    // 4. Secret redaction guarantee
    const redactRun = await call("db/macros/run", {
      target: { kind: "profile", profileId: redisProfileId },
      macro: {
        name: "Secret Redaction Check",
        mode: "bun",
        code: `
          console.log("Attempted leak: SUPER_SECRET_REDIS_PASSWORD_888");
          return "SUPER_SECRET_REDIS_PASSWORD_888";
        `,
      },
    });
    expect(redactRun.status).toBe(200);
    const serialized = JSON.stringify(redactRun.body);
    expect(serialized).not.toContain("SUPER_SECRET_REDIS_PASSWORD_888");
    expect(redactRun.body.returnValue).toBe("********");
  });
});

describe("File Manager Databases: Bun JS Macros UI Dialog & Integration", () => {
  test("1. right-clicking a SQLite file offers Run Bun JS macro on database… after probing", async () => {
    const paneMod = await import("../resources/file_manager/ui/pane.js");
    const entry = { name: "store.sqlite", path: sqliteFilePath, isDir: false, size: 8192, mtimeMs: 100 };
    (paneMod.left as any).entries = [entry];
    await dbFiles.probeSqliteFiles();
    const items = dbMacros.macroSqliteMenuItems([entry]);
    expect(items.length).toBe(1);
    expect(items[0].label).toContain("Bun JS macro");
  });

  test("2. toolbar Macros (Bun JS)… button opens the Macro Studio dialog, runs a Bun JS macro, and converts visual actions to Bun JS", async () => {
    power.openPower("databases", {});
    await until(() => pane() && !pane().hidden && pane().querySelector(".db-toolbar"), "the Databases tab");
    await until(() => dbState.db.loaded, "the Databases overview");

    const macroBtn = button("⚡ Macros (Bun JS)…", pane());
    expect(macroBtn).toBeTruthy();
    click(macroBtn);

    await until(() => top()?.querySelector(".db-macro-studio"), "the Macros dialog to open");
    const dlg = top()!;
    expect(dlg.querySelector("[role=dialog]")?.getAttribute("aria-modal")).toBe("true");
    expect(dlg.querySelectorAll(".db-macro-item").length).toBeGreaterThanOrEqual(5);

    // Click "▶ Run Macro" on the default selected macro
    const runBtn = button("▶ Run Macro", dlg);
    expect(runBtn).toBeTruthy();
    click(runBtn);

    await until(
      () => dlg.querySelector(".db-macro-run-summary"),
      "the macro execution result to render",
    );
    expect(dlg.querySelector(".db-macro-run-summary")?.textContent).toContain("Completed");

    // Select the visual DoCmd macro ("Quick VIP Report (Visual DoCmd + RunCode)")
    const visualItem = [...dlg.querySelectorAll(".db-macro-item")].find((el) =>
      (el.textContent ?? "").includes("Quick VIP Report"),
    ) as HTMLElement | undefined;
    expect(visualItem).toBeTruthy();
    click(visualItem);

    await until(() => dlg.querySelector(".db-macro-step-card"), "the visual DoCmd action matrix rows");
    expect(dlg.querySelectorAll(".db-macro-step-card").length).toBeGreaterThanOrEqual(4);

    // Click "⇄ Convert Actions to Bun JS"
    const convertBtn = button("Convert Actions to Bun JS", dlg);
    expect(convertBtn).toBeTruthy();
    click(convertBtn);

    await until(() => !dlg.querySelector(".db-macro-code")?.closest("[hidden]"), "the converted Bun JS code editor");
    const codeEditor = dlg.querySelector(".db-macro-code") as HTMLTextAreaElement;
    expect(codeEditor.value).toContain("DoCmd");

    // Verify no leaked secrets or [object Object] in DOM
    const fullText = doc.body.textContent ?? "";
    expect(fullText).not.toContain("SUPER_SECRET_REDIS_PASSWORD_888");
    expect(fullText).not.toContain("[object Object]");

    // Close dialog
    const closeBtn = button("Close", dlg);
    click(closeBtn);
    await until(() => !top(), "the Macros dialog to close");
  });
});
