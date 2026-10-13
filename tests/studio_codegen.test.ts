import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";

const storeDir = mkdtempSync(join(tmpdir(), "codegen-store-"));
process.env.STUDIO_MACRO_STORE_DIR = storeDir;

const { generateMacroCode, generateSqlCode, translateSqlToSqlite, splitSqlStatements } = await import("../applications/studio_codegen.ts");
const { startSqliteStudioServer } = await import("../applications/sqlite_studio_server.ts");
const { startMysqlStudioServer } = await import("../applications/mysql_studio_server.ts");
const { startPostgresStudioServer } = await import("../applications/postgres_studio_server.ts");
const { generateSqliteStudioHtml } = await import("../applications/sqlite_studio.ts");
const { generateMysqlStudioHtml } = await import("../applications/mysql_studio.ts");
const { generatePostgresStudioHtml } = await import("../applications/postgres_studio.ts");

const work = mkdtempSync(join(tmpdir(), "codegen-run-"));
afterAll(() => {
  rmSync(work, { recursive: true, force: true });
  rmSync(storeDir, { recursive: true, force: true });
});

const step = (id: string, action: string, parameters: any, extra: any = {}) => ({ id, action, enabled: true, parameters, ...extra });
const sub = { id: "sub", name: "Sub One", description: "", actions: [step("1", "RunSQL", { sql: "INSERT INTO log (msg) VALUES ('from sub')" })] };
const demo = {
  id: "demo", name: "Demo Macro", description: "",
  actions: [
    step("1", "RunSQL", { sql: "CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY, msg TEXT)" }),
    step("2", "RunSQL", { sql: "CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER)" }),
    step("3", "InsertRecord", { table: "items", fields: 'name: "O\'Brien \\ $x", qty: 5' }),
    step("4", "InsertRecord", { table: "items", fields: { name: "b", qty: 10 } }),
    step("5", "UpdateRecord", { table: "items", setValues: "qty = qty + 1", whereCondition: "qty > 5" }),
    step("6", "RunSQL", { sql: "INSERT INTO items (name, qty) VALUES ([Enter Item Name], 1)" }),
    step("7", "SetVariable", { name: "limit", expression: "3" }),
    step("8", "OpenQuery", { sql: "SELECT * FROM items WHERE qty >= 1" }, { condition: "[lastRowsAffected] > 0 && [limit] === 3" }),
    step("9", "RunMacro", { macroName: "Sub One" }),
    step("10", "MessageBox", { title: "Done", message: "All good" }),
    step("11", "MakeTable", { newTable: "items_copy", selectSql: "SELECT * FROM items", dropExisting: true }),
    step("12", "VacuumDatabase", { analyze: true }),
    step("13", "OpenReport", {}),
  ],
};
const ctx = { sourceDialect: "sqlite" as const, macros: [demo as any, sub as any], appName: "Test Studio" };
const NASTY = "x'); DROP TABLE items; --";

const run = (cmd: string[], cwd = work) => {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};
const have = (bin: string) => Bun.spawnSync(["which", bin]).exitCode === 0;
const readDb = (file: string, sql: string) => {
  const db = new Database(file, { readonly: true });
  try { return db.query(sql).all() as any[]; } finally { db.close(); }
};

describe("SQL translation to SQLite", () => {
  it("translates MySQL syntax and flags what it cannot", () => {
    const r = translateSqlToSqlite("SELECT `id`, `name` FROM `customers` WHERE ts < NOW() - INTERVAL 30 DAY AND note = '`keep` NOW()' LIMIT 5, 10", "mysql");
    expect(r.sql).toContain('"id"');
    expect(r.sql).toContain("datetime('now', '-30 days')");
    expect(r.sql).toContain("'`keep` NOW()'");
    expect(r.sql).toContain("LIMIT 10 OFFSET 5");
    const w = translateSqlToSqlite("SELECT CONCAT(a, b) FROM t ON DUPLICATE KEY UPDATE x = 1", "mysql");
    expect(w.warnings.length).toBeGreaterThanOrEqual(2);
  });
  it("translates Postgres syntax", () => {
    const r = translateSqlToSqlite('SELECT "public"."t".a::text FROM "public"."t" WHERE n ILIKE \'%x%\' AND ts > NOW() - INTERVAL \'7 days\'', "postgres");
    expect(r.sql).not.toContain("::");
    expect(r.sql).not.toContain('"public"');
    expect(r.sql).toContain("LIKE");
    expect(r.sql).toContain("datetime('now', '-7 days')");
    expect(r.warnings.some((x) => x.includes("cast"))).toBe(true);
  });
  it("splits scripts without breaking on semicolons inside strings/comments", () => {
    expect(splitSqlStatements("SELECT 'a;b'; -- c;\nUPDATE t SET x=1; /* ;; */ ;")).toEqual(["SELECT 'a;b'", "-- c;\nUPDATE t SET x=1"]);
  });
});

describe("Generated programs run on native SQLite", () => {
  it("Python: runs, binds params safely, one transaction, VACUUM after commit", () => {
    const g = generateMacroCode(demo as any, "python", ctx);
    expect(g.filename).toBe("demo_macro.py");
    expect(g.code).toContain("with conn:");
    expect(g.code).toContain("params[");
    expect(g.code).not.toContain("DROP TABLE items");
    const file = join(work, "demo.py");
    writeFileSync(file, g.code);
    const db = join(work, "py.db");
    const ok = run(["python3", file, "--db", db, "--enter-item-name", NASTY]);
    expect(ok.err).toBe("");
    expect(ok.code).toBe(0);
    expect(readDb(db, "SELECT name FROM items ORDER BY id").map((r) => r.name)).toEqual(["O'Brien \\ $x", "b", NASTY]);
    expect(readDb(db, "SELECT COUNT(*) c FROM items_copy")[0].c).toBe(3);
    expect(readDb(db, "SELECT msg FROM log")[0].msg).toBe("from sub");
    expect(ok.out).toContain("Done: All good");
    expect(run(["python3", file, "--db", db]).code).toBe(2);
  });

  it("Bun: runs, binds params safely, one transaction", () => {
    const g = generateMacroCode(demo as any, "bun", ctx);
    expect(g.filename).toBe("demo_macro.ts");
    expect(g.code).toContain('from "bun:sqlite"');
    expect(g.code).toContain("db.transaction(");
    const file = join(work, "demo.ts");
    writeFileSync(file, g.code);
    const db = join(work, "bun.db");
    const ok = run(["bun", "run", file, "--db", db, "--enterItemName", NASTY]);
    expect(ok.err).toBe("");
    expect(ok.code).toBe(0);
    expect(readDb(db, "SELECT name FROM items ORDER BY id").map((r) => r.name)).toEqual(["O'Brien \\ $x", "b", NASTY]);
    expect(readDb(db, "SELECT COUNT(*) c FROM items_copy")[0].c).toBe(3);
    expect(run(["bun", "run", file, "--db", db]).code).toBe(2);
  });

  it.skipIf(!have("v"))("V: compiles and runs, binds user text, commits atomically", () => {
    const g = generateMacroCode(demo as any, "vlang", ctx);
    expect(g.filename).toBe("demo_macro.v");
    expect(g.code).toContain("import db.sqlite");
    expect(g.code).toContain("db.begin()");
    const file = join(work, "demo.v");
    writeFileSync(file, g.code);
    const bin = join(work, "demo_v");
    const build = run(["v", "-o", bin, file]);
    expect(build.out + build.err).not.toContain("error:");
    expect(existsSync(bin)).toBe(true);
    const db = join(work, "v.db");
    const ok = run([bin, "--db", db, "--enter_item_name", NASTY]);
    expect(ok.code).toBe(0);
    expect(readDb(db, "SELECT name FROM items ORDER BY id").map((r) => r.name)).toEqual(["O'Brien \\ $x", "b", NASTY]);
    expect(readDb(db, "SELECT COUNT(*) c FROM items_copy")[0].c).toBe(3);
    expect(run([bin, "--db", db]).code).toBe(2);
  });

  it("a failing step rolls everything back in every language", () => {
    const failing = {
      id: "f", name: "Fail Macro", description: "",
      actions: [
        step("1", "RunSQL", { sql: "CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)" }),
        step("2", "RunSQL", { sql: "INSERT INTO t (v) VALUES ('x')" }),
        step("3", "RunSQL", { sql: "INSERT INTO no_such_table VALUES (1)" }),
      ],
    };
    const c = { ...ctx, macros: [failing as any] };
    const cases: [string, string[], string][] = [
      ["python", ["python3"], "py"],
      ["bun", ["bun", "run"], "ts"],
    ];
    for (const [target, cmd, ext] of cases) {
      const g = generateMacroCode(failing as any, target as any, c);
      const file = join(work, `fail_${target}.${ext}`);
      writeFileSync(file, g.code);
      const db = join(work, `fail_${target}.db`);
      new Database(db, { create: true }).exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
      const r = run([...cmd, file, "--db", db]);
      expect(r.code).toBe(1);
      expect(r.err).toContain("rolled back");
      expect(readDb(db, "SELECT COUNT(*) c FROM t")[0].c).toBe(0);
    }
    if (have("v")) {
      const g = generateMacroCode(failing as any, "vlang", c);
      const file = join(work, "fail_v.v");
      writeFileSync(file, g.code);
      const bin = join(work, "fail_v");
      expect(run(["v", "-o", bin, file]).err).not.toContain("error:");
      const db = join(work, "fail_v.db");
      new Database(db, { create: true }).exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
      expect(run([bin, "--db", db]).code).toBe(1);
      expect(readDb(db, "SELECT COUNT(*) c FROM t")[0].c).toBe(0);
    }
  });

  it("SQL scripts from MySQL are translated and runnable; SELECT results are printed", () => {
    const g = generateSqlCode("SELECT `name` FROM `items` WHERE qty >= [Enter Min]; UPDATE `items` SET qty = 0 WHERE ts < NOW() - INTERVAL 1 DAY", "python", { sourceDialect: "mysql" }, "report");
    expect(g.code).toContain('"name"');
    expect(g.code).toContain("datetime('now', '-1 days')");
    const file = join(work, "report.py");
    writeFileSync(file, g.code);
    const db = join(work, "sql.db");
    const d = new Database(db, { create: true });
    d.exec("CREATE TABLE items (name TEXT, qty INT, ts TEXT); INSERT INTO items VALUES ('a', 5, '2000-01-01'), ('b', 1, '2000-01-01')");
    d.close();
    const r = run(["python3", file, "--db", db, "--enter-min", "3"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("'name': 'a'");
    expect(r.out).not.toContain("'name': 'b'");
    expect(readDb(db, "SELECT SUM(qty) s FROM items")[0].s).toBe(0);
  });

  it("untranslatable conditions and UI-only actions are reported, not silently dropped", () => {
    const m = { id: "w", name: "Warn", description: "", actions: [
      step("1", "OpenReport", {}),
      step("2", "RunSQL", { sql: "SELECT 1" }, { condition: "Math.max(1,2) > 1" }),
    ] };
    const g = generateMacroCode(m as any, "python", { ...ctx, macros: [m as any] });
    expect(g.warnings.some((w) => w.includes("UI-only"))).toBe(true);
    expect(g.code).toContain("Condition could not be translated");
    const mysql = generateMacroCode({ id: "x", name: "X", description: "", actions: [step("1", "RunSQL", { sql: "SELECT CONCAT(a,b) FROM t" })] } as any, "bun", { sourceDialect: "mysql" });
    expect(mysql.warnings.some((w) => w.includes("CONCAT"))).toBe(true);
    expect(mysql.code).toContain("Source SQL dialect: mysql");
  });
});

describe("/api/codegen on every studio", () => {
  const sqlite = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:" });
  const mysql = startMysqlStudioServer({ port: 0, config: { host: "localhost", port: 3306, user: "root", password: "@Delphi32@", database: "my_app_dev" } });
  const pg = startPostgresStudioServer({ port: 0, config: { host: "localhost", port: 5432, user: "root", database: "mydb" } });
  afterAll(() => { for (const s of [sqlite, mysql, pg]) { try { s.stop(true); } catch {} } });

  const post = async (server: any, body: any) =>
    (await (await fetch(`http://127.0.0.1:${server.port}/api/codegen`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()) as any;

  for (const [name, getServer, dialect] of [["sqlite", () => sqlite, "sqlite"], ["mysql", () => mysql, "mysql"], ["postgres", () => pg, "postgres"]] as const) {
    it(`${name}: translates macros and SQL to python, bun and vlang`, async () => {
      const server = getServer();
      for (const target of ["python", "bun", "vlang"]) {
        const m = await post(server, { kind: "macro", target, macro: demo });
        expect(m.success).toBe(true);
        expect(m.code.length).toBeGreaterThan(200);
        expect(m.code).toContain(`Source SQL dialect: ${dialect}`);
        const q = await post(server, { kind: "sql", target, sql: "SELECT 1 AS one", name: "One" });
        expect(q.success).toBe(true);
        expect(q.filename).toMatch(/^one\.(py|ts|v)$/);
      }
      const saved = await (await fetch(`http://127.0.0.1:${server.port}/api/macros/list`)).json() as any;
      const byName = await post(server, { kind: "macro", target: "python", id: saved.macros[0].id });
      expect(byName.success).toBe(true);
    });
  }

  it("rejects unknown targets and missing macros", async () => {
    const r = await fetch(`http://127.0.0.1:${sqlite.port}/api/codegen`, { method: "POST", body: JSON.stringify({ kind: "macro", target: "cobol", macro: demo }) });
    expect(r.status).toBe(400);
    const r2 = await fetch(`http://127.0.0.1:${sqlite.port}/api/codegen`, { method: "POST", body: JSON.stringify({ kind: "macro", id: "nope" }) });
    expect(r2.status).toBe(400);
  });

  it("all three workstation pages expose the code generator", () => {
    for (const html of [generateSqliteStudioHtml(), generateMysqlStudioHtml(), generatePostgresStudioHtml()]) {
      for (const token of ["macroCodeModal", "openCodeGenFromEditor", "copyCodeGen", "/api/codegen", "setCodeGenTarget('vlang')"]) {
        expect(html).toContain(token);
      }
      const scripts = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi) || [];
      for (const tag of scripts) {
        const code = tag.replace(/<\/?script[\s\S]*?>/gi, "");
        if (code.trim()) expect(() => new Function(code)).not.toThrow();
      }
    }
  });
});
