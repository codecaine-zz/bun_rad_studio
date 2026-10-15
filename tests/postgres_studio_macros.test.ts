import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Macros are stored per connection on disk; point the store at a throwaway directory before anything runs.
const storeDir = mkdtempSync(join(tmpdir(), "pg-macros-"));
process.env.STUDIO_MACRO_STORE_DIR = storeDir;

const { startPostgresStudioServer } = await import("../applications/postgres_studio_server.ts");
const { generatePostgresStudioHtml } = await import("../applications/postgres_studio.ts");
const { applyPromptParams, extractPromptParams } = await import("../applications/sqlite_studio_macros.ts");
type MacroDefinition = import("../applications/sqlite_studio_macros.ts").MacroDefinition;
type MacroAction = import("../applications/sqlite_studio_macros.ts").MacroAction;
import { provisionTestDb } from "./helpers/testdb.ts";

// Runs against a throwaway database (TEST_PG_URL); skipped when it is not configured.
const testDb = await provisionTestDb("postgres");
const suite = testDb ? describe : describe.skip;

suite("⚡ Postgres Studio Pro - Macro Designer", () => {
  const server = testDb ? startPostgresStudioServer({ port: 0, config: testDb.config }) : (null as any);
  const baseUrl = `http://127.0.0.1:${server?.port}`;
  const stamp = Date.now();
  const T = (n: string) => `zz_macro_test_${n}_${stamp}`;
  const scratch = ["a", "b", "c", "crud", "made", "prm", "cond", "sub"].map(T);

  const post = async (path: string, body: any) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as any;
  };
  const sql = async (statement: string) => await post("/api/query", { sql: statement });
  const count = async (table: string) => Number((await sql(`SELECT COUNT(*) AS c FROM "${table}"`)).rows[0].c);
  const step = (id: string, action: string, parameters: any, extra: any = {}): MacroAction => ({ id, action, enabled: true, parameters, ...extra });
  const macro = (id: string, actions: MacroAction[], extra: any = {}): MacroDefinition => ({ id, name: id, description: "", actions, ...extra });

  beforeAll(async () => {
    if (!testDb) return;
    for (const t of [T("a"), T("b"), T("c"), T("cond"), T("sub")]) {
      await sql(`CREATE TABLE "${t}" (id SERIAL PRIMARY KEY, v TEXT)`);
    }
    await sql(`CREATE TABLE "${T("prm")}" (id SERIAL PRIMARY KEY, name TEXT)`);
    await sql(`CREATE TABLE "${T("crud")}" (id SERIAL PRIMARY KEY, name TEXT, balance INT DEFAULT 0)`);
  });

  afterAll(async () => {
    for (const t of scratch) await sql(`DROP TABLE IF EXISTS "${t}"`);
    try {
      server?.stop(true);
    } catch {}
    await testDb?.drop();
    rmSync(storeDir, { recursive: true, force: true });
  });

  it("1. HTML contains the macro tab, pane and designer controls, and every script parses", async () => {
    const html = generatePostgresStudioHtml();
    for (const token of [
      "tabBtnMacros", "id=\"tabMacros\"", "Macro Designer", "macroSelector", "btnRunMacro", "btnDryRun", "btnAtomicRun",
      "macroOnErrorSelect", "renderMacroDesigner", "loadMacrosFromServer", "renderMacroTreeGroup", "renderQueryTreeGroup",
      "sidebarMacroGroups", "MACRO_DIALECT = \"postgres\"",
    ]) {
      expect(html).toContain(token);
    }
    expect(html).toContain("macros: \"tabMacros\"");

    const scripts = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi) || [];
    expect(scripts.length).toBeGreaterThanOrEqual(3);
    for (const tag of scripts) {
      const code = tag.replace(/<\/?script[\s\S]*?>/gi, "");
      if (!code.trim()) continue;
      expect(() => new Function(code)).not.toThrow();
    }
    // served page is the same generator
    const served = await (await fetch(`${baseUrl}/`)).text();
    expect(served).toContain("tabBtnMacros");
  });

  it("2. /api/macros/list seeds default macros; save, update and delete round-trip", async () => {
    const list = await (await fetch(`${baseUrl}/api/macros/list`)).json() as any;
    expect(list.success).toBe(true);
    expect(list.macros.length).toBeGreaterThanOrEqual(1);

    const m = macro("pg_save", [step("1", "Comment", { comment: "hello" }), step("2", "RunSQL", { sql: "SELECT 1" })], { name: "PG_Save_Test" });
    const saved = await post("/api/macros/save", { macro: m });
    expect(saved.success).toBe(true);
    expect(saved.macro.actions.length).toBe(2);

    const updated = await post("/api/macros/save", { macro: { ...m, description: "changed" } });
    expect(updated.macro.description).toBe("changed");
    const again = await (await fetch(`${baseUrl}/api/macros/list`)).json() as any;
    expect(again.macros.filter((x: any) => x.name === "PG_Save_Test").length).toBe(1);

    expect((await post("/api/macros/delete", { id: "pg_save" })).success).toBe(true);
    const after = await (await fetch(`${baseUrl}/api/macros/list`)).json() as any;
    expect(after.macros.some((x: any) => x.id === "pg_save")).toBe(false);
  });

  it("3. Macros are persisted outside the database (no macro tables created)", async () => {
    const tables = await sql(
      "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%studio_macro%' OR table_name LIKE '%studio_quer%'",
    );
    expect(tables.rows.length).toBe(0);
  });

  it("4. Run returns per-step telemetry with skipped conditions, SetVariable and rowsAffected", async () => {
    const m = macro("pg_run", [
      step("s1", "SetVariable", { name: "bonus", expression: 25 }),
      step("s2", "RunSQL", { sql: `INSERT INTO "${T("a")}" (v) VALUES ('ran')` }, { condition: "[bonus] > 10" }),
      step("s3", "RunSQL", { sql: `INSERT INTO "${T("a")}" (v) VALUES ('skipped')` }, { condition: "[bonus] < 5" }),
      step("s4", "UpdateRecord", { table: T("a"), setValues: "v = 'updated'", whereCondition: "v = 'ran'" }),
    ]);
    const data = await post("/api/macros/run", { macro: m });
    expect(data.success).toBe(true);
    expect(data.result.totalSteps).toBe(4);
    expect(data.result.executedSteps).toBe(3);
    expect(data.result.skippedSteps).toBe(1);
    expect(data.result.logs[2].status).toBe("skipped");
    expect(data.result.variables.lastRowsAffected).toBe(1);
    const rows = (await sql(`SELECT v FROM "${T("a")}" ORDER BY id`)).rows;
    expect(rows.map((r: any) => r.v)).toEqual(["updated"]);
    await sql(`DELETE FROM "${T("a")}"`);
  });

  it("5. Stops on first error by default; honours step continueOnError and macro onError", async () => {
    const failing = step("f", "RunSQL", { sql: `INSERT INTO "${T("missing_table")}" VALUES (1)` });
    const ok = step("ok", "RunSQL", { sql: `INSERT INTO "${T("b")}" (v) VALUES ('after')` });

    let data = await post("/api/macros/run", { macro: macro("e1", [failing, ok]) });
    expect(data.result.success).toBe(false);
    expect(data.result.executedSteps).toBe(0);
    expect(await count(T("b"))).toBe(0);

    data = await post("/api/macros/run", { macro: macro("e2", [{ ...failing, continueOnError: true }, ok]) });
    expect(data.result.success).toBe(true);
    expect(data.result.failedSteps).toBe(1);
    expect(data.result.executedSteps).toBe(1);

    data = await post("/api/macros/run", { macro: macro("e3", [failing, ok], { onError: "continue" }) });
    expect(data.result.success).toBe(true);
    expect(data.result.failedSteps).toBe(1);
    expect(await count(T("b"))).toBe(2);
    await sql(`DELETE FROM "${T("b")}"`);
  });

  it("6. Atomic run rolls back (including DDL); dryRun never commits; success commits", async () => {
    const insert = step("i", "RunSQL", { sql: `INSERT INTO "${T("c")}" (v) VALUES ('x')` });
    const boom = step("b", "RunSQL", { sql: `INSERT INTO "${T("missing_table")}" VALUES (1)` });

    let data = await post("/api/macros/run", { transaction: true, macro: macro("t1", [insert, boom]) });
    expect(data.result.success).toBe(false);
    expect(data.result.rolledBack).toBe(true);
    expect(await count(T("c"))).toBe(0);

    // Postgres DDL is transactional
    const ddlName = T("made");
    data = await post("/api/macros/run", {
      transaction: true,
      macro: macro("t1b", [step("m", "MakeTable", { newTableName: ddlName, sourceSql: "SELECT 1 AS n" }), boom]),
    });
    expect(data.result.rolledBack).toBe(true);
    const exists = await sql(`SELECT to_regclass('public."${ddlName}"') AS r`);
    expect(exists.rows[0].r).toBeNull();

    data = await post("/api/macros/run", { dryRun: true, macro: macro("t2", [insert]) });
    expect(data.result.success).toBe(true);
    expect(data.result.dryRun).toBe(true);
    expect(data.result.rolledBack).toBe(true);
    expect(await count(T("c"))).toBe(0);

    data = await post("/api/macros/run", { transaction: true, macro: macro("t3", [insert]) });
    expect(data.result.success).toBe(true);
    expect(data.result.committed).toBe(true);
    expect(await count(T("c"))).toBe(1);
    await sql(`DELETE FROM "${T("c")}"`);
  });

  it("7. [Enter ...] parameters are escaped (quote injection) and missing answers fail the step", async () => {
    expect(extractPromptParams("a = [Enter Name] AND b = [Enter Name]")).toEqual(["Enter Name"]);
    expect(applyPromptParams("n = [Enter Name]", { "Enter Name": "O'Brien" })).toBe("n = 'O''Brien'");

    const m = macro("prm", [step("p", "RunSQL", { sql: `INSERT INTO "${T("prm")}" (name) VALUES ([Enter Name])` })]);
    let data = await post("/api/macros/run", { macro: m });
    expect(data.result.success).toBe(false);
    expect(data.result.error).toContain("Enter Name");

    const evil = "x'); DROP TABLE \"" + T("prm") + "\"; --";
    data = await post("/api/macros/run", { macro: m, params: { "Enter Name": evil } });
    expect(data.result.success).toBe(true);
    expect((await sql(`SELECT name FROM "${T("prm")}"`)).rows[0].name).toBe(evil);

    data = await post("/api/macros/run", { macro: m, params: { "Enter Name": "O'Hara" } });
    expect(data.result.success).toBe(true);
    expect(await count(T("prm"))).toBe(2);
  });

  it("8. A broken condition fails the step instead of running it", async () => {
    const m = macro("cond", [step("c", "RunSQL", { sql: `INSERT INTO "${T("cond")}" (v) VALUES ('no')` }, { condition: "[x] ===== 1" })]);
    const data = await post("/api/macros/run", { macro: m });
    expect(data.result.success).toBe(false);
    expect(data.result.error).toContain("Invalid condition");
    expect(await count(T("cond"))).toBe(0);
  });

  it("9. RunMacro runs sub-macros and guards against recursion", async () => {
    await post("/api/macros/save", { macro: macro("pg_sub", [step("s", "RunSQL", { sql: `INSERT INTO "${T("sub")}" (v) VALUES ('sub')` })], { name: "PG_Sub" }) });
    await post("/api/macros/save", { macro: macro("pg_self", [step("r", "RunMacro", { macroName: "PG_Self" })], { name: "PG_Self" }) });

    let data = await post("/api/macros/run", { macro: macro("parent", [step("c", "RunMacro", { macroName: "PG_Sub" })]) });
    expect(data.result.success).toBe(true);
    expect(await count(T("sub"))).toBe(1);

    data = await post("/api/macros/run", { id: "PG_Self" });
    expect(data.result.success).toBe(false);
    expect(data.result.error).toContain("nesting too deep");

    await post("/api/macros/delete", { id: "pg_sub" });
    await post("/api/macros/delete", { id: "pg_self" });
  });

  it("10. validate flags missing params, unbounded UPDATE/DELETE and unknown sub-macros", async () => {
    const m = macro("v", [
      step("1", "RunSQL", {}),
      step("2", "DeleteRecord", { table: "t" }),
      step("3", "RunMacro", { macroName: "Ghost" }),
    ]);
    const data = await post("/api/macros/validate", { macro: m });
    expect(data.success).toBe(true);
    expect(data.issues.filter((i: any) => i.severity === "error").map((i: any) => i.stepIndex)).toEqual([1, 3]);
    expect(data.issues.filter((i: any) => i.severity === "warning").map((i: any) => i.stepIndex)).toEqual([2]);
  });

  it("11. Exports as a Postgres SQL script (BEGIN; and double-quoted identifiers) and VBA; onError persists", async () => {
    const m = macro(
      "pg_export",
      [
        step("1", "DeleteRecord", { table: "logs", whereCondition: "age > 30" }),
        step("2", "MessageBox", { message: "Done", title: "Cleanup" }),
        step("3", "VacuumDatabase", {}),
      ],
      { name: "Nightly Cleanup", onError: "continue" },
    );
    const sqlOut = await post("/api/macros/export", { macro: m, format: "sql" });
    expect(sqlOut.success).toBe(true);
    expect(sqlOut.content).toContain("BEGIN;");
    expect(sqlOut.content).not.toContain("BEGIN TRANSACTION;");
    expect(sqlOut.content).toContain('DELETE FROM "logs" WHERE age > 30;');
    expect(sqlOut.content).not.toContain("`");

    const vbaOut = await post("/api/macros/export", { macro: m, format: "vba" });
    expect(vbaOut.content).toContain("Public Sub Nightly_Cleanup()");

    await post("/api/macros/save", { macro: m });
    const list = await (await fetch(`${baseUrl}/api/macros/list`)).json() as any;
    expect(list.macros.find((x: any) => x.id === "pg_export").onError).toBe("continue");
    await post("/api/macros/delete", { id: "pg_export" });
  });

  it("12. Saved queries API: list, save with designer state, delete", async () => {
    const q = {
      id: "pg_query_test",
      name: "PG_QBE_Test",
      description: "designer state",
      sql: "SELECT 1 AS one",
      designerStateJson: JSON.stringify({ selectedTables: ["customers"], columns: [], joins: [] }),
    };
    const saved = await post("/api/queries/save", { query: q });
    expect(saved.success).toBe(true);
    const list = await (await fetch(`${baseUrl}/api/queries/list`)).json() as any;
    const found = list.queries.find((x: any) => x.name === "PG_QBE_Test");
    expect(found).toBeDefined();
    expect(JSON.parse(found.designerStateJson).selectedTables).toContain("customers");

    const del = await post("/api/queries/delete", { id: "pg_query_test" });
    expect(del.success).toBe(true);
    const re = await (await fetch(`${baseUrl}/api/queries/list`)).json() as any;
    expect(re.queries.some((x: any) => x.id === "pg_query_test")).toBe(false);
  });

  it("13. MakeTable + Insert/Update/Delete/EmptyTable CRUD actions run against the live database", async () => {
    const crud = T("crud");
    const made = T("made");
    const m = macro("crud", [
      step("1", "InsertRecord", { tableName: crud, fields: "name='Zenith Corp', balance=2500" }),
      step("2", "UpdateRecord", { tableName: crud, setValues: "balance = balance + 500", whereCondition: "name = 'Zenith Corp'" }),
      step("3", "MakeTable", { newTableName: made, sourceSql: `SELECT name, balance FROM "${crud}" WHERE name = 'Zenith Corp'`, dropExisting: true }),
      step("4", "DeleteRecord", { tableName: crud, whereCondition: "name = 'Zenith Corp'" }),
      step("5", "EmptyTable", { tableName: made }),
    ]);
    const data = await post("/api/macros/run", { macro: m });
    expect(data.result.success).toBe(true);
    expect(data.result.executedSteps).toBe(5);
    expect(data.result.failedSteps).toBe(0);
    expect(await count(crud)).toBe(0);
    expect(await count(made)).toBe(0);

    // check the intermediate state with a run that stops before the delete
    const partial = await post("/api/macros/run", { macro: { ...m, id: "crud2", actions: m.actions.slice(0, 3) } });
    expect(partial.result.success).toBe(true);
    expect(await count(crud)).toBe(1);
    const row = (await sql(`SELECT name, balance FROM "${made}"`)).rows[0];
    expect(row.name).toBe("Zenith Corp");
    expect(Number(row.balance)).toBe(3000);
    await sql(`DELETE FROM "${crud}"`);
  });

  it("14. VacuumDatabase works outside a transaction and is refused inside one", async () => {
    const vac = macro("vac", [step("v", "VacuumDatabase", { analyze: true })]);
    let data = await post("/api/macros/run", { macro: vac });
    expect(data.result.success).toBe(true);
    data = await post("/api/macros/run", { macro: vac, transaction: true });
    expect(data.result.success).toBe(false);
    expect(data.result.rolledBack).toBe(true);
  });

  it("15. Schema listing is not polluted by macro storage", async () => {
    const schema = await (await fetch(`${baseUrl}/api/schema`)).json() as any;
    const names = (schema.tables || []).map((t: any) => t.name);
    expect(names.some((n: string) => n.includes("studio_macro"))).toBe(false);
  });
});
