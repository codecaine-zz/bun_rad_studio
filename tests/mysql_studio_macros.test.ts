import { describe, it, expect, afterAll, beforeAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Keep macros/queries out of the real ~/.bun_rad_studio store.
const storeDir = mkdtempSync(join(tmpdir(), "mysql-macros-"));
process.env.STUDIO_MACRO_STORE_DIR = storeDir;

const { startMysqlStudioServer } = await import("../applications/mysql_studio_server.ts");
const { generateMysqlStudioHtml } = await import("../applications/mysql_studio.ts");
const { macroToSqlScript, macroToVba, parseRecordFieldsToInsertSql, applyPromptParams } = await import("../applications/sqlite_studio_macros.ts");

import { provisionTestDb } from "./helpers/testdb.ts";

// Runs against a throwaway database (TEST_MYSQL_URL); skipped when it is not configured.
const testDb = await provisionTestDb("mysql");
const suite = testDb ? describe : describe.skip;

type Action = { id: string; action: string; enabled: boolean; parameters: any; [k: string]: any };

suite("🐬 MySQL Studio Pro - Access Macro Automation Suite", () => {
  const server = testDb ? startMysqlStudioServer({ port: 0, config: testDb.config }) : (null as any);
  const baseUrl = `http://127.0.0.1:${server?.port}`;
  const suffix = Date.now();
  const T = (n: string) => `zz_macro_${n}_${suffix}`;
  const created: string[] = [];

  const post = async (path: string, body: any) => {
    const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as any;
  };
  const sql = (statement: string) => post("/api/query", { sql: statement });
  const count = async (table: string) => Number(((await sql(`SELECT COUNT(*) AS c FROM \`${table}\``)).rows[0] as any).c);
  const step = (id: string, action: string, parameters: any, extra: any = {}): Action => ({ id, action, enabled: true, parameters, ...extra });
  const macro = (name: string, actions: Action[], extra: any = {}) => ({ id: `m_${name}_${suffix}`, name, description: "", actions, ...extra });
  const makeTable = async (name: string, ddl = "id INT AUTO_INCREMENT PRIMARY KEY, v VARCHAR(100)") => {
    const r = await sql(`CREATE TABLE \`${name}\` (${ddl})`);
    expect(r.success).toBe(true);
    created.push(name);
  };

  afterAll(async () => {
    for (const t of created) await sql(`DROP TABLE IF EXISTS \`${t}\``);
    try { server?.stop(true); } catch {}
    await testDb?.drop();
    rmSync(storeDir, { recursive: true, force: true });
  });

  it("1. Workstation HTML has the macro tab/designer and every script parses", () => {
    const html = generateMysqlStudioHtml();
    for (const token of ["tabBtnMacros", 'id="tabMacros"', "macroMatrixBody", "btnDryRun", "btnAtomicRun", "macroOnErrorSelect", "runMacroSteps", "MACRO_DIALECT = \"mysql\"", "renderMacroTreeGroup"]) {
      expect(html).toContain(token);
    }
    const scripts = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi) || [];
    for (const tag of scripts) {
      const code = tag.replace(/<\/?script[\s\S]*?>/gi, "");
      if (code.trim()) expect(() => new Function(code)).not.toThrow();
    }
    // The shared script must quote with backticks and be MySQL-flavoured.
    expect(html).toContain("MySQL Studio Pro");
    expect(html).toContain("NOW() - INTERVAL 30 DAY");
  });

  it("2. Macro CRUD persists per connection (not inside the database) with seeded defaults", async () => {
    const list = await (await fetch(`${baseUrl}/api/macros/list`)).json() as any;
    expect(list.success).toBe(true);
    expect(list.macros.some((m: any) => m.isAutoExec)).toBe(true);

    const saved = await post("/api/macros/save", { macro: macro("crud", [step("a", "Comment", { comment: "hi" })], { onError: "continue" }) });
    expect(saved.success).toBe(true);
    const again = await (await fetch(`${baseUrl}/api/macros/list`)).json() as any;
    expect(again.macros.find((m: any) => m.name === "crud").onError).toBe("continue");

    const dup = await post("/api/macros/save", { macro: { ...macro("crud", []), id: "other_id" } });
    expect(dup.success).toBe(false);

    await post("/api/macros/delete", { id: `m_crud_${suffix}` });
    const after = await (await fetch(`${baseUrl}/api/macros/list`)).json() as any;
    expect(after.macros.find((m: any) => m.name === "crud")).toBeUndefined();

    const tables = await sql("SHOW TABLES LIKE '\\_studio\\_%'");
    expect(tables.rows.length).toBe(0);
  });

  it("3. Server runs a macro with step telemetry and CRUD actions against live MySQL", async () => {
    const t = T("crud");
    const copy = T("copy");
    await makeTable(t, "id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), qty INT");
    created.push(copy);
    const data = await post("/api/macros/run", {
      macro: macro("crud_run", [
        step("1", "InsertRecord", { table: t, fields: 'name: "Back\\slash\'s", qty: 5' }),
        step("2", "InsertRecord", { table: t, fields: { name: "b", qty: 10 } }),
        step("3", "UpdateRecord", { table: t, setValues: "qty = qty + 1", whereCondition: "qty > 5" }),
        step("4", "MakeTable", { newTable: copy, selectSql: `SELECT * FROM \`${t}\` WHERE qty > 5`, dropExisting: true }),
        step("5", "DeleteRecord", { table: t, whereCondition: "qty > 5" }),
        step("6", "OpenQuery", { sql: `SELECT * FROM \`${t}\`` }),
        step("7", "SetVariable", { name: "x", expression: "1" }),
      ]),
    });
    expect(data.result.error).toBeUndefined();
    expect(data.result.success).toBe(true);
    expect(data.result.executedSteps).toBe(7);
    expect(data.result.logs.length).toBe(7);
    expect(await count(copy)).toBe(1);
    expect(await count(t)).toBe(1);
    const row = (await sql(`SELECT name FROM \`${t}\``)).rows[0];
    expect(row.name).toBe("Back\\slash's");
    const emptied = await post("/api/macros/run", { macro: macro("empty", [step("1", "EmptyTable", { table: t })]) });
    expect(emptied.result.success).toBe(true);
    expect(await count(t)).toBe(0);
  });

  it("4. Stops on first error by default; continueOnError / macro onError keep going", async () => {
    const t = T("onerr");
    await makeTable(t);
    const failing = step("f", "RunSQL", { sql: "INSERT INTO no_such_table_zz VALUES (1)" });
    const ok = step("ok", "RunSQL", { sql: `INSERT INTO \`${t}\` (v) VALUES ('after')` });

    let d = await post("/api/macros/run", { macro: macro("e1", [failing, ok]) });
    expect(d.result.success).toBe(false);
    expect(await count(t)).toBe(0);

    d = await post("/api/macros/run", { macro: macro("e2", [{ ...failing, continueOnError: true }, ok]) });
    expect(d.result.success).toBe(true);
    expect(d.result.failedSteps).toBe(1);
    expect(await count(t)).toBe(1);

    d = await post("/api/macros/run", { macro: macro("e3", [failing, ok], { onError: "continue" }) });
    expect(d.result.success).toBe(true);
    expect(await count(t)).toBe(2);
  });

  it("5. Atomic run rolls back on failure, dryRun never commits, success commits", async () => {
    const t = T("atomic");
    await makeTable(t);
    const insert = step("i", "RunSQL", { sql: `INSERT INTO \`${t}\` (v) VALUES ('x')` });
    const boom = step("b", "RunSQL", { sql: "INSERT INTO no_such_table_zz VALUES (1)" });

    let d = await post("/api/macros/run", { transaction: true, macro: macro("a1", [insert, boom]) });
    expect(d.result.success).toBe(false);
    expect(d.result.rolledBack).toBe(true);
    expect(await count(t)).toBe(0);

    d = await post("/api/macros/run", { dryRun: true, macro: macro("a2", [insert, insert]) });
    expect(d.result.success).toBe(true);
    expect(d.result.dryRun).toBe(true);
    expect(await count(t)).toBe(0);

    d = await post("/api/macros/run", { transaction: true, macro: macro("a3", [insert, insert]) });
    expect(d.result.committed).toBe(true);
    expect(await count(t)).toBe(2);
  });

  it("6. MySQL DDL is refused in atomic/dry-run mode (implicit commit) instead of silently committing", async () => {
    const name = T("ddl");
    created.push(name);
    const d = await post("/api/macros/run", {
      dryRun: true,
      macro: macro("ddl", [step("1", "RunSQL", { sql: `CREATE TABLE \`${name}\` (id INT)` })]),
    });
    expect(d.result.success).toBe(false);
    expect(d.result.error).toContain("implicitly");
    const exists = await sql(`SHOW TABLES LIKE '${name}'`);
    expect(exists.rows.length).toBe(0);

    const mt = await post("/api/macros/run", { transaction: true, macro: macro("mt", [step("1", "MakeTable", { newTable: name, selectSql: "SELECT 1 AS a" })]) });
    expect(mt.result.success).toBe(false);
    expect(mt.result.rolledBack).toBe(true);
  });

  it("7. [Enter ...] parameters are answered via params, escaped for MySQL, and missing answers fail", async () => {
    const t = T("params");
    await makeTable(t);
    const m = macro("p", [step("1", "RunSQL", { sql: `INSERT INTO \`${t}\` (v) VALUES ([Enter Name])` })]);
    let d = await post("/api/macros/run", { macro: m });
    expect(d.result.success).toBe(false);
    expect(d.result.error).toContain("Enter Name");

    const nasty = "O'Hara\\' ); DROP TABLE x; --";
    d = await post("/api/macros/run", { macro: m, params: { "Enter Name": nasty } });
    expect(d.result.success).toBe(true);
    expect((await sql(`SELECT v FROM \`${t}\``)).rows[0].v).toBe(nasty);
    expect(applyPromptParams("[Enter A]", { "Enter A": "a\\b" }, true)).toBe("'a\\\\b'");
  });

  it("8. Broken conditions fail the step; RunMacro runs sub-macros with a recursion guard", async () => {
    const t = T("sub");
    await makeTable(t);
    let d = await post("/api/macros/run", { macro: macro("c", [step("1", "RunSQL", { sql: `INSERT INTO \`${t}\` (v) VALUES ('no')` }, { condition: "[x] ===== 1" })]) });
    expect(d.result.success).toBe(false);
    expect(d.result.error).toContain("Invalid condition");
    expect(await count(t)).toBe(0);

    await post("/api/macros/save", { macro: macro("Sub_One", [step("1", "RunSQL", { sql: `INSERT INTO \`${t}\` (v) VALUES ('sub')` })]) });
    await post("/api/macros/save", { macro: macro("Self_Loop", [step("1", "RunMacro", { macroName: "Self_Loop" })]) });
    d = await post("/api/macros/run", { macro: macro("parent", [step("1", "RunMacro", { macroName: "Sub_One" })]) });
    expect(d.result.success).toBe(true);
    expect(await count(t)).toBe(1);
    d = await post("/api/macros/run", { id: "Self_Loop" });
    expect(d.result.success).toBe(false);
    expect(d.result.error).toContain("nesting too deep");
  });

  it("9. Validation endpoint flags missing args and unbounded UPDATE/DELETE", async () => {
    const d = await post("/api/macros/validate", {
      macro: macro("v", [step("1", "RunSQL", {}), step("2", "DeleteRecord", { table: "t" }), step("3", "RunMacro", { macroName: "Ghost" })]),
    });
    expect(d.issues.filter((i: any) => i.severity === "error").map((i: any) => i.stepIndex)).toEqual([1, 3]);
    expect(d.issues.filter((i: any) => i.severity === "warning").map((i: any) => i.stepIndex)).toEqual([2]);
    const blocked = await post("/api/macros/run", { macro: macro("v2", [step("1", "RunSQL", {})]) });
    expect(blocked.result.error).toContain("Validation failed");
  });

  it("10. Exports use MySQL quoting/transaction syntax; saved queries round-trip", async () => {
    const m = macro("Nightly Cleanup", [
      step("1", "DeleteRecord", { table: "logs", whereCondition: "age > 30" }),
      step("2", "InsertRecord", { table: "logs", fields: { msg: "a\\b'c" } }),
    ]);
    const script = macroToSqlScript(m as any, [], "mysql");
    expect(script).toContain("START TRANSACTION;");
    expect(script).toContain("DELETE FROM `logs` WHERE age > 30;");
    expect(script).toContain("'a\\\\b''c'");
    expect(macroToVba(m as any, [], "mysql")).toContain("Public Sub Nightly_Cleanup()");
    expect(parseRecordFieldsToInsertSql("t", { a: 1 }, "mysql")).toBe("INSERT INTO `t` (`a`) VALUES (1);");

    const ex = await post("/api/macros/export", { macro: m, format: "sql" });
    expect(ex.content).toContain("START TRANSACTION;");

    const q = await post("/api/queries/save", { query: { id: "q1", name: "All_One", sql: "SELECT 1 AS one" } });
    expect(q.success).toBe(true);
    const run = await post("/api/macros/run", { macro: macro("uq", [step("1", "OpenQuery", { queryName: "All_One" })]) });
    expect(run.result.success).toBe(true);
    const list = await (await fetch(`${baseUrl}/api/queries/list`)).json() as any;
    expect(list.queries.map((x: any) => x.name)).toContain("All_One");
    await post("/api/queries/delete", { id: "q1" });
  });

  it("11. Maintenance (OPTIMIZE/ANALYZE) and backup actions run", async () => {
    const d = await post("/api/macros/run", {
      macro: macro("maint", [step("1", "VacuumDatabase", { analyze: true }), step("2", "BackupDatabase", { mode: "schema" })]),
    });
    expect(d.result.error).toBeUndefined();
    expect(d.result.success).toBe(true);
    const inTx = await post("/api/macros/run", { dryRun: true, macro: macro("maint2", [step("1", "VacuumDatabase", {})]) });
    expect(inTx.result.success).toBe(false);
  });
});
