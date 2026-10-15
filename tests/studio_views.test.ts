import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { createAdapter } from "../src/db";
import { provisionTestDb, type TestDb } from "./helpers/testdb";
import { viewTools, viewApi } from "../src/shared/studioViews";
import { STUDIO_DIALOGS_SCRIPT } from "../src/shared/studioDialogs";

const storeDir = mkdtempSync(join(tmpdir(), "studio-views-macros-"));
process.env.STUDIO_MACRO_STORE_DIR = storeDir;
const { generateSqliteStudioHtml } = await import("../applications/sqlite_studio.ts");
const { generateMysqlStudioHtml } = await import("../applications/mysql_studio.ts");
const { generatePostgresStudioHtml } = await import("../applications/postgres_studio.ts");
const { startSqliteStudioServer } = await import("../applications/sqlite_studio_server.ts");
const { startMysqlStudioServer } = await import("../applications/mysql_studio_server.ts");
const { startPostgresStudioServer } = await import("../applications/postgres_studio_server.ts");
afterAll(() => rmSync(storeDir, { recursive: true, force: true }));

const T = viewTools;

describe("no native dialogs in the studio pages", () => {
  const pages: [string, string][] = [
    ["sqlite", generateSqliteStudioHtml()],
    ["mysql", generateMysqlStudioHtml()],
    ["postgres", generatePostgresStudioHtml()],
  ];
  it("prompt(), confirm() and alert() are never called by the page scripts (they do nothing in the desktop webview)", () => {
    for (const [name, html] of pages) {
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!.replace(STUDIO_DIALOGS_SCRIPT, ""));
      const hits: string[] = [];
      for (const s of scripts) for (const m of s.matchAll(/(?<![\w.$])(prompt|confirm|alert)\(/g)) hits.push(s.slice(Math.max(0, m.index! - 40), m.index! + 40).replace(/\s+/g, " "));
      expect(hits, `${name}: ${hits.join(" | ")}`).toEqual([]);
      // the markup (inline onclick handlers) too
      expect(html.replace(/<script>[\s\S]*?<\/script>/g, ""), name).not.toMatch(/on\w+="[^"]*(?<![\w.$])(prompt|confirm|alert)\(/);
    }
  });
  it("every studio carries the shared dialogs and the Create view entry points", () => {
    for (const [name, html] of pages) {
      expect(html, name).toContain(STUDIO_DIALOGS_SCRIPT);
      expect(html, name).toContain("StudioViews.configure(");
      expect(html, name).toContain("StudioViews.openFromEditor(");
    }
  });
});

describe("view DDL builder", () => {
  it("SQLite: CREATE VIEW [IF NOT EXISTS], quoted, columns", () => {
    expect(T.buildViewDdl("sqlite", { name: "v1", select: "SELECT 1 AS a;" })).toBe('CREATE VIEW "v1" AS\nSELECT 1 AS a');
    expect(T.buildViewDdl("sqlite", { name: 'we"ird', select: "select 1", ifNotExists: true, columns: "a, b" })).toBe('CREATE VIEW IF NOT EXISTS "we""ird" ("a", "b") AS\nselect 1');
  });
  it("MySQL: CREATE [OR REPLACE] with ALGORITHM / SQL SECURITY, never IF NOT EXISTS", () => {
    expect(T.buildViewDdl("mysql", { name: "v`1", select: "SELECT 1", orReplace: true, algorithm: "merge", sqlSecurity: "invoker", ifNotExists: true })).toBe("CREATE OR REPLACE ALGORITHM = MERGE SQL SECURITY INVOKER VIEW `v``1` AS\nSELECT 1");
    expect(T.buildViewDdl("mysql", { name: "v", select: "SELECT 1", ifNotExists: true })).not.toMatch(/IF NOT EXISTS/);
    expect(T.buildViewDdl("mysql", { name: "v", select: "SELECT 1", algorithm: "x; DROP", sqlSecurity: "y" })).toBe("CREATE VIEW `v` AS\nSELECT 1");
  });
  it("PostgreSQL: schema-qualified views, security_barrier, materialized WITH [NO] DATA (no OR REPLACE)", () => {
    expect(T.buildViewDdl("postgres", { name: "v", schema: "my schema", select: "SELECT 1", orReplace: true, securityBarrier: true })).toBe('CREATE OR REPLACE VIEW "my schema"."v" WITH (security_barrier = true) AS\nSELECT 1');
    expect(T.buildViewDdl("postgres", { name: "m", schema: "public", select: "SELECT 1", materialized: true, orReplace: true, withData: false })).toBe('CREATE MATERIALIZED VIEW "public"."m" AS\nSELECT 1\nWITH NO DATA');
    expect(T.buildViewDdl("postgres", { name: "m", select: "SELECT 1", materialized: true, ifNotExists: true })).toBe('CREATE MATERIALIZED VIEW IF NOT EXISTS "m" AS\nSELECT 1\nWITH DATA');
  });
  it("drop statements", () => {
    expect(T.buildDropViewDdl("sqlite", { name: "v" })).toBe('DROP VIEW "v"');
    expect(T.buildDropViewDdl("mysql", { name: "v" })).toBe("DROP VIEW `v`");
    expect(T.buildDropViewDdl("postgres", { name: "m", schema: "s", materialized: true, ifExists: true })).toBe('DROP MATERIALIZED VIEW IF EXISTS "s"."m"');
  });
  it("rejects invalid names", () => {
    for (const d of ["sqlite", "mysql", "postgres"] as const) {
      expect(T.validateViewName(d, "")).not.toBe("");
      expect(T.validateViewName(d, "  ")).not.toBe("");
      expect(T.validateViewName(d, " lead")).not.toBe("");
      expect(T.validateViewName(d, "a\u0000b")).not.toBe("");
      expect(T.validateViewName(d, "a\nb")).not.toBe("");
      expect(T.validateViewName(d, "x".repeat(300))).not.toBe("");
      expect(T.validateViewName(d, "fine name")).toBe("");
    }
    expect(T.validateViewName("sqlite", "sqlite_master")).not.toBe("");
    expect(T.validateViewName("mysql", "a.b")).not.toBe("");
    expect(T.validateViewName("mysql", "x".repeat(65))).not.toBe("");
    expect(T.validateViewName("postgres", "x".repeat(64))).not.toBe("");
    expect(() => T.buildViewDdl("sqlite", { name: "", select: "SELECT 1" })).toThrow();
  });
  it("the query must be one SELECT: semicolons in strings/comments are fine, a second statement is not", () => {
    expect(T.validateSelect("sqlite", "SELECT ';' AS s; ").ok).toBe(true);
    expect(T.validateSelect("sqlite", "-- note;\nSELECT 1 /* ; */").ok).toBe(true);
    expect(T.validateSelect("postgres", "SELECT $q$;$q$").ok).toBe(true);
    expect(T.validateSelect("mysql", "WITH a AS (SELECT 1) SELECT * FROM a").ok).toBe(true);
    expect(T.validateSelect("sqlite", "SELECT 1; DROP TABLE t").ok).toBe(false);
    expect(T.validateSelect("sqlite", "SELECT 1; -- ok\nSELECT 2").ok).toBe(false);
    expect(T.validateSelect("sqlite", "DROP TABLE t").ok).toBe(false);
    expect(T.validateSelect("sqlite", "DELETE FROM t").ok).toBe(false);
    expect(T.validateSelect("sqlite", "  ").ok).toBe(false);
    expect(T.validateSelect("sqlite", "SELECT 'oops").ok).toBe(false);
    expect(T.validateSelect("mysql", "SELECT 1 # c;\n; DROP TABLE t").ok).toBe(false);
    expect(T.validateSelect("sqlite", "TABLE t").ok).toBe(false);
    expect(T.validateSelect("postgres", "TABLE t").ok).toBe(true);
  });
  it("a hostile name stays one quoted identifier", () => {
    const ddl = T.buildViewDdl("sqlite", { name: 'x" AS SELECT 1; DROP TABLE t; --', select: "SELECT 1" });
    expect(ddl).toBe('CREATE VIEW "x"" AS SELECT 1; DROP TABLE t; --" AS\nSELECT 1');
    const my = T.buildViewDdl("mysql", { name: "x` AS SELECT 1; DROP TABLE t; --", select: "SELECT 1" });
    expect(my).toBe("CREATE VIEW `x`` AS SELECT 1; DROP TABLE t; --` AS\nSELECT 1");
  });
});

// -------------------------------------------------------------------------------------------------------------
// Same flow, same expectations, through the studios' HTTP routes (so the real server code path is exercised)
// -------------------------------------------------------------------------------------------------------------
const post = async (base: string, path: string, body: unknown) => ({ status: 0, ...((await (await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()) as any) });
const q = (base: string, sql: string) => post(base, "/api/query", { sql });

describe("SQLite studio: views through /api/view/*", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-views-sqlite-"));
  const path = join(dir, "v.db");
  const db = new Database(path);
  db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, qty INT); INSERT INTO t (name, qty) VALUES ('a', 1), ('b', 2), ('c', 3)");
  db.close();
  const server = startSqliteStudioServer({ port: 0, initialDbPath: path });
  const base = `http://127.0.0.1:${server.port}`;
  afterAll(() => { server.stop(true); rmSync(dir, { recursive: true, force: true }); });

  it("check explains problems in plain words and creates nothing", async () => {
    const ok = await post(base, "/api/view/check", { name: "v_ok", select: "SELECT id, name FROM t" });
    expect(ok.success).toBe(true);
    expect(ok.columns).toEqual(["id", "name"]);
    expect(ok.message).toContain("2 columns");
    const bad = await post(base, "/api/view/check", { name: "v_bad", select: "SELECT nope FROM t" });
    expect(bad.success).toBe(false);
    expect(bad.error).toContain("column that does not exist");
    const noTable = await post(base, "/api/view/check", { name: "v_bad", select: "SELECT * FROM missing" });
    expect(noTable.error).toContain("does not exist");
    expect((await q(base, "SELECT name FROM sqlite_master WHERE type='view'")).rows).toEqual([]);
  });

  it("creates, refuses a duplicate, replaces, reads the definition back, edits and drops", async () => {
    const c = await post(base, "/api/view/create", { name: "v_big", select: "SELECT id, name FROM t WHERE qty > 1;" });
    expect(c.success).toBe(true);
    expect(c.ddl).toBe('CREATE VIEW "v_big" AS\nSELECT id, name FROM t WHERE qty > 1');
    expect((await q(base, "SELECT count(*) AS n FROM v_big")).rows[0].n).toBe(2);
    const dup = await post(base, "/api/view/create", { name: "v_big", select: "SELECT 1" });
    expect(dup.success).toBe(false);
    expect(dup.error).toContain("already exists");
    const ifNot = await post(base, "/api/view/create", { name: "v_big", select: "SELECT 1", ifNotExists: true });
    expect(ifNot.success).toBe(true);
    expect((await q(base, "SELECT count(*) AS n FROM v_big")).rows[0].n).toBe(2); // untouched
    const def = await post(base, "/api/view/definition", { name: "v_big" });
    expect(def.select).toBe("SELECT id, name FROM t WHERE qty > 1");
    const rep = await post(base, "/api/view/create", { name: "v_big", select: "SELECT id FROM t", orReplace: true });
    expect(rep.success).toBe(true);
    expect((await q(base, "SELECT count(*) AS n FROM v_big")).rows[0].n).toBe(3);
    // a failing replace leaves the old view in place (one transaction)
    const badRep = await post(base, "/api/view/create", { name: "v_big", select: "SELECT nope FROM t", orReplace: true });
    expect(badRep.success).toBe(false);
    expect((await q(base, "SELECT count(*) AS n FROM v_big")).rows[0].n).toBe(3);
    const dropped = await post(base, "/api/view/drop", { name: "v_big" });
    expect(dropped.success).toBe(true);
    expect((await post(base, "/api/view/drop", { name: "v_big" })).success).toBe(false);
  });

  it("a name that collides with a table, bad names, and injection attempts", async () => {
    const clash = await post(base, "/api/view/create", { name: "t", select: "SELECT 1" });
    expect(clash.success).toBe(false);
    expect(clash.error).toMatch(/already exists/);
    expect((await post(base, "/api/view/create", { name: "", select: "SELECT 1" })).success).toBe(false);
    expect((await post(base, "/api/view/create", { name: "sqlite_x", select: "SELECT 1" })).success).toBe(false);
    const stack = await post(base, "/api/view/create", { name: "v_stack", select: "SELECT 1; DROP TABLE t" });
    expect(stack.success).toBe(false);
    expect((await q(base, "SELECT count(*) AS n FROM t")).rows[0].n).toBe(3);
    const evil = await post(base, "/api/view/create", { name: 'x" AS SELECT 1; DROP TABLE t; --', select: "SELECT 1 AS one" });
    expect(evil.success).toBe(true);
    expect((await q(base, "SELECT count(*) AS n FROM t")).rows[0].n).toBe(3);
    const names = (await q(base, "SELECT name FROM sqlite_master WHERE type='view'")).rows.map((r: any) => r.name);
    expect(names).toEqual(['x" AS SELECT 1; DROP TABLE t; --']);
    expect((await post(base, "/api/view/drop", { name: 'x" AS SELECT 1; DROP TABLE t; --' })).success).toBe(true);
  });
});

describe("viewApi on a bare SQLite adapter (transactions)", () => {
  it("rolls the drop back when the new definition is rejected", async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE t (a INT); CREATE VIEW v AS SELECT a FROM t");
    const run = async (s: string) => db.query(s).all() as any[];
    const adapter = {
      dialect: "sqlite" as const,
      run,
      tx: async (fn: any) => { db.run("BEGIN"); try { await fn(run); db.run("COMMIT"); } catch (e) { db.run("ROLLBACK"); throw e; } },
      rollbackProbe: async (fn: any) => { db.run("BEGIN"); try { await fn(run); } finally { db.run("ROLLBACK"); } },
      describe: async (s: string) => [...db.query(s).columnNames],
    };
    const r = await viewApi("create", { name: "v", select: "SELECT zzz FROM t", orReplace: true }, adapter);
    expect(r.success).toBe(false);
    expect((db.query("SELECT sql FROM sqlite_master WHERE name='v'").all() as any[])[0].sql).toContain("SELECT a FROM t");
  });
});

const myDb = await provisionTestDb("mysql");
const pgDb = await provisionTestDb("postgres");

(myDb ? describe : describe.skip)("MySQL studio: views through /api/view/* (real MySQL)", () => {
  const server = myDb ? startMysqlStudioServer({ port: 0, config: myDb.config as any }) : (null as any);
  const base = `http://127.0.0.1:${server?.port}`;
  afterAll(async () => { server?.stop(true); await myDb?.drop(); });

  it("check, create, duplicate, OR REPLACE, definition, drop, and hostile input", async () => {
    const a = createAdapter({ engine: "mysql", ...myDb!.config, allowPublicKeyRetrieval: true } as any);
    await a.connect();
    await a.query("CREATE TABLE t (id INT PRIMARY KEY, name VARCHAR(20), qty INT)");
    await a.query("INSERT INTO t VALUES (1,'a',1),(2,'b',2),(3,'c',3)");
    await a.close();
    expect((await post(base, "/api/view/check", { name: "v1", select: "SELECT id, name FROM t" })).success).toBe(true);
    const bad = await post(base, "/api/view/check", { name: "v1", select: "SELECT nope FROM t" });
    expect(bad.success).toBe(false);
    expect(bad.error).toContain("column that does not exist");
    const dupCols = await post(base, "/api/view/check", { name: "v1", select: "SELECT id, id FROM t" });
    expect(dupCols.success).toBe(false);
    const c = await post(base, "/api/view/create", { name: "v1", select: "SELECT id, name FROM t WHERE qty > 1", sqlSecurity: "INVOKER" });
    expect(c.success).toBe(true);
    expect(c.ddl).toContain("SQL SECURITY INVOKER VIEW `v1`");
    expect((await q(base, "SELECT COUNT(*) AS n FROM v1")).rows[0].n).toBe(2);
    const dup = await post(base, "/api/view/create", { name: "v1", select: "SELECT 1" });
    expect(dup.success).toBe(false);
    expect(dup.error).toContain("already exists");
    expect((await post(base, "/api/view/check", { name: "v1", select: "SELECT id FROM t" })).success).toBe(false);
    const def = await post(base, "/api/view/definition", { name: "v1" });
    expect(def.success).toBe(true);
    expect(def.select.toLowerCase()).toContain("select");
    expect(def.sqlSecurity).toBe("INVOKER");
    const rep = await post(base, "/api/view/create", { name: "v1", select: "SELECT id FROM t", orReplace: true });
    expect(rep.success).toBe(true);
    expect((await q(base, "SELECT COUNT(*) AS n FROM v1")).rows[0].n).toBe(3);
    expect((await post(base, "/api/view/create", { name: "t", select: "SELECT 1", orReplace: true })).success).toBe(false); // a table is not a view
    expect((await post(base, "/api/view/create", { name: "v2", select: "SELECT 1; DROP TABLE t" })).success).toBe(false);
    expect((await post(base, "/api/view/create", { name: "a.b", select: "SELECT 1" })).success).toBe(false);
    const evil = await post(base, "/api/view/create", { name: "x` AS SELECT 1; DROP TABLE t; --", select: "SELECT 1 AS one" });
    expect(evil.success).toBe(true);
    expect((await q(base, "SELECT COUNT(*) AS n FROM t")).rows[0].n).toBe(3);
    expect((await post(base, "/api/view/drop", { name: "x` AS SELECT 1; DROP TABLE t; --" })).success).toBe(true);
    expect((await post(base, "/api/view/drop", { name: "v1" })).success).toBe(true);
    expect((await post(base, "/api/view/drop", { name: "v1" })).success).toBe(false);
  }, 60_000);
});

(pgDb ? describe : describe.skip)("PostgreSQL studio: views through /api/view/* (real PostgreSQL)", () => {
  const server = pgDb ? startPostgresStudioServer({ port: 0, config: pgDb.config as any }) : (null as any);
  const base = `http://127.0.0.1:${server?.port}`;
  afterAll(async () => { server?.stop(true); await pgDb?.drop(); });

  it("check, create, duplicate, OR REPLACE, schema, materialized, edit, drop, and hostile input", async () => {
    const a = createAdapter({ engine: "postgres", ...pgDb!.config, allowPublicKeyRetrieval: true } as any);
    await a.connect();
    await a.query("CREATE TABLE t (id INT PRIMARY KEY, name VARCHAR(20), qty INT)");
    await a.query("INSERT INTO t VALUES (1,'a',1),(2,'b',2),(3,'c',3)");
    await a.query("CREATE SCHEMA other");
    await a.close();
    const bad = await post(base, "/api/view/check", { name: "v1", select: "SELECT nope FROM t" });
    expect(bad.success).toBe(false);
    expect(bad.error).toContain("column that does not exist");
    expect(Number((await q(base, "SELECT count(*) AS n FROM pg_views WHERE viewname = 'v1'")).rows[0].n)).toBe(0);
    const c = await post(base, "/api/view/create", { name: "v1", select: "SELECT id, name FROM t WHERE qty > 1", securityBarrier: true });
    expect(c.success).toBe(true);
    expect(c.ddl).toContain('CREATE VIEW "public"."v1" WITH (security_barrier = true)');
    expect(Number((await q(base, "SELECT COUNT(*) AS n FROM v1")).rows[0].n)).toBe(2);
    const dup = await post(base, "/api/view/create", { name: "v1", select: "SELECT 1" });
    expect(dup.success).toBe(false);
    expect(dup.error).toContain("already exists");
    expect((await post(base, "/api/view/check", { name: "v1", select: "SELECT id FROM t" })).success).toBe(false);
    const def = await post(base, "/api/view/definition", { name: "v1" });
    expect(def.success).toBe(true);
    expect(def.kind).toBe("view");
    expect(def.select.toLowerCase()).toContain("qty > 1");
    const rep = await post(base, "/api/view/create", { name: "v1", select: "SELECT id, name FROM t", orReplace: true });
    expect(rep.success).toBe(true);
    expect(Number((await q(base, "SELECT COUNT(*) AS n FROM v1")).rows[0].n)).toBe(3);
    const changeCols = await post(base, "/api/view/create", { name: "v1", select: "SELECT name FROM t", orReplace: true });
    expect(changeCols.success).toBe(false);
    expect(changeCols.error).toContain("re-create");
    expect((await post(base, "/api/view/create", { name: "v1", select: "SELECT name FROM t", recreate: true })).success).toBe(true);
    const other = await post(base, "/api/view/create", { name: "ov", schema: "other", select: "SELECT id FROM public.t" });
    expect(other.success).toBe(true);
    expect(Number((await q(base, "SELECT COUNT(*) AS n FROM other.ov")).rows[0].n)).toBe(3);
    // materialized
    const m = await post(base, "/api/view/create", { name: "mv", select: "SELECT id, qty FROM t", materialized: true, withData: false });
    expect(m.success).toBe(true);
    expect(m.ddl).toContain("WITH NO DATA");
    expect((await q(base, "SELECT ispopulated FROM pg_matviews WHERE matviewname = 'mv'")).rows[0].ispopulated).toBe(false);
    const mDef = await post(base, "/api/view/definition", { name: "mv" });
    expect(mDef.kind).toBe("materialized");
    const mDup = await post(base, "/api/view/create", { name: "mv", select: "SELECT 1", materialized: true, orReplace: true });
    expect(mDup.success).toBe(false); // cannot be OR REPLACE'd
    const mEdit = await post(base, "/api/view/create", { name: "mv", select: "SELECT id FROM t", materialized: true, recreate: true });
    expect(mEdit.success).toBe(true);
    expect((await q(base, "SELECT ispopulated FROM pg_matviews WHERE matviewname = 'mv'")).rows[0].ispopulated).toBe(true);
    expect((await post(base, "/api/view/create", { name: "bad", select: "SELECT 1; DROP TABLE t" })).success).toBe(false);
    const evil = await post(base, "/api/view/create", { name: 'x" AS SELECT 1; DROP TABLE t; --', select: "SELECT 1 AS one" });
    expect(evil.success).toBe(true);
    expect(Number((await q(base, "SELECT COUNT(*) AS n FROM t")).rows[0].n)).toBe(3);
    expect((await post(base, "/api/view/drop", { name: 'x" AS SELECT 1; DROP TABLE t; --' })).success).toBe(true);
    expect((await post(base, "/api/view/drop", { name: "mv", materialized: true })).success).toBe(true);
    expect((await post(base, "/api/view/drop", { name: "ov", schema: "other" })).success).toBe(true);
    expect((await post(base, "/api/view/drop", { name: "v1" })).success).toBe(true);
    expect((await post(base, "/api/view/drop", { name: "v1" })).success).toBe(false);
  }, 60_000);
});

// -------------------------------------------------------------------------------------------------------------
// The dialogs in the real pages (jsdom under Node, against the real server)
// -------------------------------------------------------------------------------------------------------------
const node = Bun.which("node");
async function runUi(base: string, engine: string) {
  const proc = Bun.spawn([node!, "--test", "--test-force-exit", "--test-reporter=spec", join(import.meta.dir, "studio_views.node.mjs")], {
    env: { ...process.env, SV_BASE: base, SV_ENGINE: engine, NODE_NO_WARNINGS: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0 || process.env.SC_VERBOSE) console.log(out + err);
  return code;
}
const WIDE: Record<string, string> = {
  sqlite: "CREATE TABLE wide (id INTEGER PRIMARY KEY, sku TEXT, full_name TEXT)",
  mysql: "CREATE TABLE wide (id INT PRIMARY KEY, sku VARCHAR(20), full_name VARCHAR(100))",
  postgres: "CREATE TABLE wide (id INT PRIMARY KEY, sku VARCHAR(20), full_name VARCHAR(100))",
};
const WIDE_ROWS = "INSERT INTO wide (id, sku, full_name) VALUES (1,'a','Ann'),(2,'b','Bob'),(3,'c','Cy'),(4,'d','Di'),(5,'e','Ed')";

(node ? describe : describe.skip)("Create view / Edit / Drop dialogs in the page", () => {
  it("SQLite studio", async () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-views-ui-"));
    const path = join(dir, "w.db");
    const db = new Database(path);
    db.run(WIDE.sqlite!);
    db.run(WIDE_ROWS);
    db.close();
    const server = startSqliteStudioServer({ port: 0, initialDbPath: path });
    try {
      expect(await runUi(`http://127.0.0.1:${server.port}`, "sqlite")).toBe(0);
    } finally {
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  for (const [engine, handle] of [["mysql", myDb], ["postgres", pgDb]] as const) {
    it(`${engine === "mysql" ? "MySQL" : "PostgreSQL"} studio (needs a throwaway server)`, async () => {
      const t = await provisionTestDb(engine);
      if (!t) return;
      let server: any;
      try {
        const a = createAdapter({ engine, ...t.config, allowPublicKeyRetrieval: true } as any);
        await a.connect();
        await a.query(WIDE[engine]!);
        await a.query(WIDE_ROWS);
        await a.close();
        server = engine === "mysql" ? startMysqlStudioServer({ port: 0, config: t.config as any }) : startPostgresStudioServer({ port: 0, config: t.config as any });
        expect(await runUi(`http://127.0.0.1:${server.port}`, engine)).toBe(0);
      } finally {
        server?.stop(true);
        await t.drop();
      }
    }, 180_000);
  }
});
