import { describe, it, expect, afterAll } from "bun:test";
import { startSqliteStudioServer } from "../applications/sqlite_studio_server.ts";
import { generateSqliteStudioHtml } from "../applications/sqlite_studio.ts";
import {
  DEFAULT_SAMPLE_MACROS,
  type MacroDefinition,
  type MacroAction,
  extractPromptParams,
  applyPromptParams,
  validateMacro,
  macroToSqlScript,
  macroToVba,
  macroToBunJs,
} from "../applications/sqlite_studio_macros.ts";

describe("⚡ SQLite Studio Pro - Macro Automation Suite", () => {
  const server = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:" });
  const baseUrl = `http://127.0.0.1:${server.port}`;

  afterAll(() => {
    try {
      server.stop(true);
    } catch {}
  });

  it("1. Workstation HTML includes Macro Designer tab, matrix, and ribbon", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();

    // Tab button & pane
    expect(html).toContain("tabBtnMacros");
    expect(html).toContain("Macro Designer");
    expect(html).toContain("id=\"tabMacros\"");

    // Macro Ribbon & controls
    expect(html).toContain("macro-ribbon");
    expect(html).toContain("macroSelector");
    expect(html).toContain("macroNameInput");
    expect(html).toContain("btnRunMacro");
    expect(html).toContain("btnSingleStep");
    expect(html).toContain("macroAutoExecCheck");

    // Action Matrix
    expect(html).toContain("macroMatrixTable");
    expect(html).toContain("macroMatrixBody");
    expect(html).toContain("Action Arguments");

    // Action Catalog Drawer
    expect(html).toContain("macroCatalogDrawer");
    expect(html).toContain("macroCatalogItems");
    expect(html).toContain("catalogSearchInput");

    // Modals
    expect(html).toContain("macroSingleStepModal");
    expect(html).toContain("macroMsgBoxModal");
    expect(html).toContain("macroJsonModal");

    // Script functions
    expect(html).toContain("runCurrentMacro");
    expect(html).toContain("promptSingleStepDialog");
    expect(html).toContain("openMacroMsgBox");
    expect(html).toContain("ACCESS_ACTION_CATALOG");
  });

  it("2. Client scripts embedded in workstation HTML parse with zero JavaScript syntax errors", () => {
    const html = generateSqliteStudioHtml();
    const scriptMatches = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi) || [];
    expect(scriptMatches.length).toBeGreaterThanOrEqual(3);

    for (const tag of scriptMatches) {
      const code = tag.replace(/<\/?script[\s\S]*?>/gi, "");
      if (!code.trim()) continue;
      expect(() => {
        new Function(code);
      }).not.toThrow();
    }
  });

  it("3. /api/macros/list returns seeded default sample macros", async () => {
    const res = await fetch(`${baseUrl}/api/macros/list`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    expect(data.success).toBe(true);
    expect(Array.isArray(data.macros)).toBe(true);
    expect(data.macros.length).toBeGreaterThanOrEqual(3);

    const macroNames = data.macros.map((m: any) => m.name);
    expect(macroNames).toContain("AutoExec");
    expect(macroNames).toContain("VIP_Customer_Report");
    expect(macroNames).toContain("Database_Maintenance_Routine");

    const autoexec = data.macros.find((m: any) => m.name === "AutoExec");
    expect(autoexec).toBeDefined();
    expect(autoexec.isAutoExec).toBe(true);
    expect(autoexec.actions.length).toBeGreaterThanOrEqual(4);

    const actionTypes = autoexec.actions.map((a: any) => a.action);
    expect(actionTypes).toContain("OpenTable");
    expect(actionTypes).toContain("MessageBox");
    expect(actionTypes).toContain("ApplyFilter");
  });

  it("4. Internal _studio_macros table does NOT pollute schema tables or KPI table counts", async () => {
    const kpiRes = await fetch(`${baseUrl}/api/kpis`);
    expect(kpiRes.status).toBe(200);
    const kpis = await kpiRes.json() as any;

    const schemaRes = await fetch(`${baseUrl}/api/schema`);
    expect(schemaRes.status).toBe(200);
    const schema = await schemaRes.json() as any;

    const tableNames = schema.tables.map((t: any) => t.name);
    expect(tableNames).not.toContain("_studio_macros");
    expect(tableNames).toContain("customers");
    expect(tableNames).toContain("orders");

    // Verify tableCount is exact user tables count
    expect(kpis.tableCount).toBe(schema.tables.length);
  });

  it("5. /api/macros/save successfully creates and updates a custom macro", async () => {
    const customMacro: MacroDefinition = {
      id: "macro_custom_test",
      name: "Quarterly_Customer_Bonus",
      description: "Test macro to award loyalty bonus balance and notify",
      isAutoExec: false,
      actions: [
        {
          id: "step_1",
          action: "Comment",
          enabled: true,
          parameters: { comment: "Award loyalty bonus to standard tier" },
        },
        {
          id: "step_2",
          action: "RunSQL",
          enabled: true,
          parameters: {
            sql: "UPDATE customers SET balance = balance + 50 WHERE tier = 'Standard';",
          },
        },
        {
          id: "step_3",
          action: "MessageBox",
          enabled: true,
          parameters: {
            message: "Loyalty bonuses awarded!",
            title: "Bonus Process",
            type: "success",
            beep: true,
          },
        },
      ],
    };

    const saveRes = await fetch(`${baseUrl}/api/macros/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ macro: customMacro }),
    });

    expect(saveRes.status).toBe(200);
    const saveData = await saveRes.json() as any;
    expect(saveData.success).toBe(true);
    expect(saveData.macro.name).toBe("Quarterly_Customer_Bonus");
    expect(saveData.macro.actions.length).toBe(3);

    // Verify it appears in /api/macros/list
    const listRes = await fetch(`${baseUrl}/api/macros/list`);
    const listData = await listRes.json() as any;
    const found = listData.macros.find((m: any) => m.name === "Quarterly_Customer_Bonus");
    expect(found).toBeDefined();
    expect(found.actions[1].action).toBe("RunSQL");
  });

  it("6. /api/macros/run executes macro on server and produces step-by-step telemetry logs", async () => {
    const execMacro: MacroDefinition = {
      id: "macro_exec_test",
      name: "Server_Execution_Test",
      description: "Server execution verification macro",
      actions: [
        {
          id: "s1",
          action: "SetVariable",
          enabled: true,
          parameters: { name: "bonusAmount", expression: 25 },
        },
        {
          id: "s2",
          action: "RunSQL",
          enabled: true,
          condition: "[bonusAmount] > 10",
          parameters: {
            sql: "INSERT INTO audit_logs (action, entity, details) VALUES ('MACRO_EXEC_TEST', 'CUSTOMERS', 'Macro executed bonus step');",
          },
        },
        {
          id: "s3",
          action: "RunSQL",
          enabled: true,
          condition: "[bonusAmount] < 5", // Should be SKIPPED
          parameters: {
            sql: "INSERT INTO audit_logs (action, entity, details) VALUES ('SKIPPED_STEP', 'NONE', 'Should not run');",
          },
        },
        {
          id: "s4",
          action: "VacuumDatabase",
          enabled: true,
          parameters: { analyze: true },
        },
      ],
    };

    const runRes = await fetch(`${baseUrl}/api/macros/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ macro: execMacro }),
    });

    expect(runRes.status).toBe(200);
    const runData = await runRes.json() as any;
    expect(runData.success).toBe(true);
    expect(runData.result).toBeDefined();
    expect(runData.result.totalSteps).toBe(4);
    expect(runData.result.executedSteps).toBe(3);
    expect(runData.result.skippedSteps).toBe(1);
    expect(runData.result.failedSteps).toBe(0);

    // Verify logs
    const logs = runData.result.logs;
    expect(logs.length).toBe(4);
    expect(logs[0].action).toBe("SetVariable");
    expect(logs[0].status).toBe("success");

    expect(logs[1].action).toBe("RunSQL");
    expect(logs[1].status).toBe("success");
    expect(logs[1].conditionMet).toBe(true);

    expect(logs[2].action).toBe("RunSQL");
    expect(logs[2].status).toBe("skipped");
    expect(logs[2].conditionMet).toBe(false);

    expect(logs[3].action).toBe("VacuumDatabase");
    expect(logs[3].status).toBe("success");

    // Verify audit log row was created
    const qRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM audit_logs WHERE action = 'MACRO_EXEC_TEST';" }),
    });
    const qData = await qRes.json() as any;
    expect(qData.success).toBe(true);
    expect(qData.rows.length).toBe(1);
    expect(qData.rows[0].entity).toBe("CUSTOMERS");
  });

  it("7. StopMacro action halts execution early and reports accurate execution counts", async () => {
    const earlyStopMacro: MacroDefinition = {
      id: "macro_early_stop",
      name: "Early_Stop_Test",
      description: "Tests StopMacro halts remaining steps",
      actions: [
        {
          id: "s1",
          action: "Comment",
          enabled: true,
          parameters: { comment: "Step 1 executes" },
        },
        {
          id: "s2",
          action: "StopMacro",
          enabled: true,
          parameters: { reason: "Intentional early termination" },
        },
        {
          id: "s3",
          action: "RunSQL",
          enabled: true,
          parameters: {
            sql: "INSERT INTO audit_logs (action, entity, details) VALUES ('UNREACHABLE', 'TEST', 'Never runs');",
          },
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/macros/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ macro: earlyStopMacro }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.result.executedSteps).toBe(2); // Step 1 and Step 2 (StopMacro)
    expect(data.result.totalSteps).toBe(3);

    // Verify Step 3 never ran
    const qRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM audit_logs WHERE action = 'UNREACHABLE';" }),
    });
    const qData = await qRes.json() as any;
    expect(qData.rows.length).toBe(0);
  });

  it("8. /api/macros/delete successfully deletes macros", async () => {
    const delRes = await fetch(`${baseUrl}/api/macros/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "macro_custom_test" }),
    });
    expect(delRes.status).toBe(200);
    const delData = await delRes.json() as any;
    expect(delData.success).toBe(true);

    const listRes = await fetch(`${baseUrl}/api/macros/list`);
    const listData = await listRes.json() as any;
    expect(listData.macros.some((m: any) => m.id === "macro_custom_test")).toBe(false);
  });

  it("9. /api/queries/list returns seeded default queries and does NOT pollute user schema or KPIs", async () => {
    const listRes = await fetch(`${baseUrl}/api/queries/list`);
    expect(listRes.status).toBe(200);
    const data = await listRes.json() as any;

    expect(data.success).toBe(true);
    expect(Array.isArray(data.queries)).toBe(true);
    expect(data.queries.length).toBeGreaterThanOrEqual(3);

    const queryNames = data.queries.map((q: any) => q.name);
    expect(queryNames).toContain("VIP_Customers_High_Balance");
    expect(queryNames).toContain("Low_Stock_Restock_Alerts");
    expect(queryNames).toContain("Top_Spenders_By_Revenue");

    // Verify _studio_queries is not in user schema or table counts
    const schemaRes = await fetch(`${baseUrl}/api/schema`);
    const schema = await schemaRes.json() as any;
    const tableNames = schema.tables.map((t: any) => t.name);
    expect(tableNames).not.toContain("_studio_queries");

    const kpiRes = await fetch(`${baseUrl}/api/kpis`);
    const kpis = await kpiRes.json() as any;
    expect(kpis.tableCount).toBe(schema.tables.length);
  });

  it("10. /api/queries/save persists named queries with visual QBE designer state and allows deletion", async () => {
    const designerQuery = {
      id: "query_vip_loyalty_test",
      name: "QBE_VIP_Loyalty_Analysis",
      description: "Visual Query Designer QBE State Test Query",
      sql: "SELECT name, email, balance FROM customers WHERE balance > 750 ORDER BY balance DESC;",
      designerStateJson: JSON.stringify({
        selectedTables: ["customers"],
        columns: [
          { table: "customers", column: "name", alias: "Customer", visible: true },
          { table: "customers", column: "balance", alias: "Balance", visible: true, criteria: "> 750", sort: "DESC" }
        ],
        joins: []
      })
    };

    const saveRes = await fetch(`${baseUrl}/api/queries/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: designerQuery }),
    });

    expect(saveRes.status).toBe(200);
    const saveData = await saveRes.json() as any;
    expect(saveData.success).toBe(true);
    expect(saveData.query.name).toBe("QBE_VIP_Loyalty_Analysis");

    // Verify presence in list
    const listRes = await fetch(`${baseUrl}/api/queries/list`);
    const listData = await listRes.json() as any;
    const found = listData.queries.find((q: any) => q.name === "QBE_VIP_Loyalty_Analysis");
    expect(found).toBeDefined();
    expect(found.designerStateJson).toBeDefined();
    expect(JSON.parse(found.designerStateJson).selectedTables).toContain("customers");

    // Delete query
    const delRes = await fetch(`${baseUrl}/api/queries/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "query_vip_loyalty_test" }),
    });
    expect(delRes.status).toBe(200);
    const delData = await delRes.json() as any;
    expect(delData.success).toBe(true);

    const reListRes = await fetch(`${baseUrl}/api/queries/list`);
    const reListData = await reListRes.json() as any;
    expect(reListData.queries.some((q: any) => q.id === "query_vip_loyalty_test")).toBe(false);
  });

  it("11. Macro CRUD actions (InsertRecord, UpdateRecord, MakeTable, DeleteRecord, EmptyTable) execute successfully", async () => {
    const crudMacro: MacroDefinition = {
      id: "macro_access_crud_test",
      name: "Access_CRUD_Data_Pipeline",
      description: "Full suite of action queries executed in a macro",
      actions: [
        // 1. SetWarnings false (behavior: suppress confirmation prompts during bulk batch)
        {
          id: "step_warn",
          action: "SetWarnings",
          enabled: true,
          parameters: { warningsOn: false },
        },
        // 2. InsertRecord (Append Query)
        {
          id: "step_insert",
          action: "InsertRecord",
          enabled: true,
          parameters: {
            tableName: "customers",
            fields: "name='Zenith Corp', email='contact@zenith.org', balance=2500, tier='VIP'",
          },
        },
        // 3. UpdateRecord (Update Query)
        {
          id: "step_update",
          action: "UpdateRecord",
          enabled: true,
          parameters: {
            tableName: "customers",
            setValues: "balance = balance + 500",
            whereCondition: "name = 'Zenith Corp'",
          },
        },
        // 4. MakeTable (Make-Table Query)
        {
          id: "step_make_table",
          action: "MakeTable",
          enabled: true,
          parameters: {
            newTableName: "vip_zenith_summary",
            sourceSql: "SELECT name, email, balance, tier FROM customers WHERE name = 'Zenith Corp'",
            dropExisting: true,
          },
        },
        // 5. OpenQuery (OpenQuery action executing saved named query)
        {
          id: "step_open_query",
          action: "OpenQuery",
          enabled: true,
          parameters: {
            queryName: "VIP_Customers_High_Balance",
            view: "Datasheet",
            dataMode: "ReadOnly",
          },
        },
        // 6. DeleteRecord (Delete Query)
        {
          id: "step_delete",
          action: "DeleteRecord",
          enabled: true,
          parameters: {
            tableName: "customers",
            whereCondition: "name = 'Zenith Corp'",
          },
        },
        // 7. EmptyTable (Clear/Truncate Table)
        {
          id: "step_empty",
          action: "EmptyTable",
          enabled: true,
          parameters: {
            tableName: "vip_zenith_summary",
          },
        },
      ],
    };

    const runRes = await fetch(`${baseUrl}/api/macros/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ macro: crudMacro }),
    });

    expect(runRes.status).toBe(200);
    const runData = await runRes.json() as any;
    expect(runData.success).toBe(true);
    expect(runData.result.totalSteps).toBe(7);
    expect(runData.result.executedSteps).toBe(7);
    expect(runData.result.failedSteps).toBe(0);

    const logs = runData.result.logs;
    expect(logs.find((l: any) => l.action === "SetWarnings")?.status).toBe("success");
    expect(logs.find((l: any) => l.action === "InsertRecord")?.status).toBe("success");
    expect(logs.find((l: any) => l.action === "UpdateRecord")?.status).toBe("success");
    expect(logs.find((l: any) => l.action === "MakeTable")?.status).toBe("success");
    expect(logs.find((l: any) => l.action === "OpenQuery")?.status).toBe("success");
    expect(logs.find((l: any) => l.action === "DeleteRecord")?.status).toBe("success");
    expect(logs.find((l: any) => l.action === "EmptyTable")?.status).toBe("success");

    // Verify Zenith Corp was inserted, updated, copied to vip_zenith_summary, then deleted from customers
    const checkDeleted = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM customers WHERE name = 'Zenith Corp';" }),
    });
    const checkDelData = await checkDeleted.json() as any;
    expect(checkDelData.rows.length).toBe(0);

    // Verify vip_zenith_summary exists and was emptied
    const checkSummary = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT COUNT(*) as count FROM vip_zenith_summary;" }),
    });
    const checkSumData = await checkSummary.json() as any;
    expect(checkSumData.rows[0].count).toBe(0);
  });

  it("12. Record navigation and editing actions (GoToRecord, FindRecord, ShowAllRecords, SetValue) execute cleanly", async () => {
    const recordNavMacro: MacroDefinition = {
      id: "macro_nav_test",
      name: "Record_Navigation_Suite",
      description: "",
      actions: [
        {
          id: "n1",
          action: "GoToRecord",
          enabled: true,
          parameters: { record: "First" },
        },
        {
          id: "n2",
          action: "FindRecord",
          enabled: true,
          parameters: { findWhat: "VIP", match: "Entire", matchCase: true },
        },
        {
          id: "n3",
          action: "SetValue",
          enabled: true,
          parameters: { item: "tier", expression: "'Platinum'" },
        },
        {
          id: "n4",
          action: "SaveRecord",
          enabled: true,
          parameters: {},
        },
        {
          id: "n5",
          action: "ShowAllRecords",
          enabled: true,
          parameters: {},
        },
      ],
    };

    const res = await fetch(`${baseUrl}/api/macros/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ macro: recordNavMacro }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.result.executedSteps).toBe(5);
    expect(data.result.failedSteps).toBe(0);
  });
  const post = async (path: string, body: any): Promise<any> => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  };
  const sql = async (statement: string) => (await post("/api/query", { sql: statement })) as any;
  const step = (id: string, action: string, parameters: any, extra: any = {}): MacroAction => ({ id, action, enabled: true, parameters, ...extra });

  it("13. [Enter ...] prompts are detected and substituted safely (SQLite [identifier] quoting untouched)", () => {
    const q = "SELECT [name], * FROM t WHERE d >= [Enter Start Date] AND n = [Enter Name] AND x = [Enter Start Date]";
    expect(extractPromptParams(q)).toEqual(["Enter Start Date", "Enter Name"]);
    const out = applyPromptParams(q, { "Enter Start Date": "2024-01-01", "Enter Name": "O'Brien" });
    expect(out).toContain("d >= '2024-01-01'");
    expect(out).toContain("n = 'O''Brien'");
    expect(out).toContain("[name]");
    expect(applyPromptParams("a = [Enter N]", { "Enter N": "42" })).toBe("a = 42");
    expect(applyPromptParams("a = [Enter N]", { "Enter N": "1; DROP TABLE x" })).toBe("a = '1; DROP TABLE x'");
  });

  it("14. Server macros stop on first error by default but honour continueOnError and macro onError", async () => {
    await sql("CREATE TABLE IF NOT EXISTS m14 (id INTEGER PRIMARY KEY, v TEXT);");
    const failing = step("f", "RunSQL", { sql: "INSERT INTO no_such_table VALUES (1);" });
    const ok = step("ok", "RunSQL", { sql: "INSERT INTO m14 (v) VALUES ('after');" });

    let data = await post("/api/macros/run", { macro: { id: "m14a", name: "m14a", description: "", actions: [failing, ok] } });
    expect(data.result.success).toBe(false);
    expect(data.result.executedSteps).toBe(0);

    data = await post("/api/macros/run", { macro: { id: "m14b", name: "m14b", description: "", actions: [{ ...failing, continueOnError: true }, ok] } });
    expect(data.result.success).toBe(true);
    expect(data.result.failedSteps).toBe(1);
    expect(data.result.executedSteps).toBe(1);

    data = await post("/api/macros/run", { macro: { id: "m14c", name: "m14c", description: "", onError: "continue", actions: [failing, ok] } });
    expect(data.result.success).toBe(true);
    expect(data.result.failedSteps).toBe(1);
  });

  it("15. Atomic run rolls back every change when a later step fails; dryRun never commits", async () => {
    await sql("CREATE TABLE IF NOT EXISTS m15 (id INTEGER PRIMARY KEY, v TEXT);");
    await sql("DELETE FROM m15;");
    const insert = step("i", "RunSQL", { sql: "INSERT INTO m15 (v) VALUES ('x');" });
    const boom = step("b", "RunSQL", { sql: "INSERT INTO no_such_table VALUES (1);" });

    let data = await post("/api/macros/run", { transaction: true, macro: { id: "m15a", name: "m15a", description: "", actions: [insert, boom] } });
    expect(data.result.success).toBe(false);
    expect(data.result.rolledBack).toBe(true);
    expect(((await sql("SELECT COUNT(*) AS c FROM m15")).rows[0]).c).toBe(0);

    data = await post("/api/macros/run", { dryRun: true, macro: { id: "m15b", name: "m15b", description: "", actions: [insert] } });
    expect(data.result.success).toBe(true);
    expect(data.result.dryRun).toBe(true);
    expect(((await sql("SELECT COUNT(*) AS c FROM m15")).rows[0]).c).toBe(0);

    data = await post("/api/macros/run", { transaction: true, macro: { id: "m15c", name: "m15c", description: "", actions: [insert] } });
    expect(data.result.committed).toBe(true);
    expect(((await sql("SELECT COUNT(*) AS c FROM m15")).rows[0]).c).toBe(1);
  });

  it("16. Parameter prompts are answered via params and missing answers fail the step", async () => {
    await sql("CREATE TABLE IF NOT EXISTS m16 (id INTEGER PRIMARY KEY, name TEXT);");
    await sql("DELETE FROM m16;");
    const macro = { id: "m16", name: "m16", description: "", actions: [step("p", "RunSQL", { sql: "INSERT INTO m16 (name) VALUES ([Enter Name]);" })] };

    let data = await post("/api/macros/run", { macro });
    expect(data.result.success).toBe(false);
    expect(data.result.error).toContain("Enter Name");

    data = await post("/api/macros/run", { macro, params: { "Enter Name": "O'Hara" } });
    expect(data.result.success).toBe(true);
    expect(((await sql("SELECT name FROM m16")).rows[0]).name).toBe("O'Hara");
  });

  it("17. A broken condition fails the step instead of silently running it", async () => {
    await sql("CREATE TABLE IF NOT EXISTS m17 (id INTEGER PRIMARY KEY);");
    const macro = { id: "m17", name: "m17", description: "", actions: [step("c", "RunSQL", { sql: "INSERT INTO m17 DEFAULT VALUES;" }, { condition: "[x] ===== 1" })] };
    const data = await post("/api/macros/run", { macro });
    expect(data.result.success).toBe(false);
    expect(data.result.error).toContain("Invalid condition");
    expect(((await sql("SELECT COUNT(*) AS c FROM m17")).rows[0]).c).toBe(0);
  });

  it("18. RunMacro executes sub-macros on the server and guards against recursion", async () => {
    await sql("CREATE TABLE IF NOT EXISTS m18 (id INTEGER PRIMARY KEY);");
    await post("/api/macros/save", { macro: { id: "m18_sub", name: "M18_Sub", description: "", actions: [step("s", "RunSQL", { sql: "INSERT INTO m18 DEFAULT VALUES;" })] } });
    await post("/api/macros/save", { macro: { id: "m18_self", name: "M18_Self", description: "", actions: [step("r", "RunMacro", { macroName: "M18_Self" })] } });

    let data = await post("/api/macros/run", { macro: { id: "m18", name: "m18", description: "", actions: [step("c", "RunMacro", { macroName: "M18_Sub" })] } });
    expect(data.result.success).toBe(true);
    expect(((await sql("SELECT COUNT(*) AS c FROM m18")).rows[0]).c).toBe(1);

    data = await post("/api/macros/run", { id: "M18_Self" });
    expect(data.result.success).toBe(false);
    expect(data.result.error).toContain("nesting too deep");
  });

  it("19. validateMacro flags missing params, unbounded UPDATE/DELETE and unknown sub-macros", () => {
    const issues = validateMacro(
      { id: "v", name: "v", description: "", actions: [
        step("1", "RunSQL", {}),
        step("2", "DeleteRecord", { table: "t" }),
        step("3", "RunMacro", { macroName: "Ghost" }),
        step("4", "UpdateRecord", { table: "t", setValues: "a=1" }, { enabled: false }),
      ] },
      ["Real"],
    );
    expect(issues.filter((i) => i.severity === "error").map((i) => i.stepIndex)).toEqual([1, 3]);
    expect(issues.filter((i) => i.severity === "warning").map((i) => i.stepIndex)).toEqual([2]);
  });

  it("20. Macros export as SQL script and VBA via /api/macros/export; onError persists", async () => {
    const macro: MacroDefinition = {
      id: "m20", name: "Nightly Cleanup", description: "purge", onError: "continue",
      actions: [
        step("1", "DeleteRecord", { table: "logs", whereCondition: "age > 30" }),
        step("2", "MessageBox", { message: "Done", title: "Cleanup" }),
        step("3", "VacuumDatabase", {}),
      ],
    };
    expect(macroToSqlScript(macro)).toContain('DELETE FROM "logs" WHERE age > 30;');
    expect(macroToSqlScript(macro).indexOf("COMMIT;")).toBeLessThan(macroToSqlScript(macro).indexOf("VACUUM;"));
    expect(macroToVba(macro)).toContain("Public Sub Nightly_Cleanup()");

    const sqlOut = await post("/api/macros/export", { macro, format: "sql" });
    expect(sqlOut.success).toBe(true);
    expect(sqlOut.content).toContain("BEGIN TRANSACTION;");
    const vbaOut = await post("/api/macros/export", { macro, format: "vba" });
    expect(vbaOut.content).toContain('MsgBox "Done", vbInformation, "Cleanup"');

    await post("/api/macros/save", { macro });
    const list = await (await fetch(`${baseUrl}/api/macros/list`)).json() as any;
    expect(list.macros.find((m: any) => m.id === "m20").onError).toBe("continue");
  });

  it("21. Designer exposes the new controls", async () => {
    const html = await (await fetch(`${baseUrl}/`)).text();
    for (const token of ["btnDryRun", "btnAtomicRun", "macroOnErrorSelect", "duplicateCurrentMacro", "runMacroSteps", "extractPromptParams", "resolveMacroSqlParams", "macroDialogModal", "macroAskConfirm", "macro-modal", "RunCode"]) {
      expect(html).toContain(token);
    }
  });

  it("22. RunCode executes Bun JS with CurrentDb, DoCmd, TempVars, DCount/DLookup/DSum and exports to Bun JS", async () => {
    await sql("CREATE TABLE IF NOT EXISTS m22 (id INTEGER PRIMARY KEY, name TEXT, score INTEGER);");
    await sql("DELETE FROM m22;");
    await sql("INSERT INTO m22 (name, score) VALUES ('Ada', 40), ('Grace', 60);");

    const macro: MacroDefinition = {
      id: "m22_bun",
      name: "Bun Access Macro",
      description: "Test Bun JS RunCode action",
      actions: [
        step("1", "RunCode", {
          code: `
            const cnt = await DCount("*", "m22");
            const total = await DSum("score", "m22");
            const topName = await DLookup("name", "m22", "score = 60");
            await DoCmd.InsertRecord("m22", { name: "Alan", score: 50 });
            TempVars.countBefore = cnt;
            TempVars.totalBefore = total;
            TempVars.topName = topName;
            Debug.print("Count=" + cnt + " Total=" + total + " Top=" + topName);
            return { cnt, total, topName, after: await DCount("*", "m22") };
          `,
        }),
        step("2", "MessageBox", {
          message: "Top was [topName] with total [totalBefore]",
          title: "Summary",
        }),
      ],
    };

    const runRes = await post("/api/macros/run", { macro });
    expect(runRes.success).toBe(true);
    expect(runRes.result.success).toBe(true);
    expect(runRes.result.executedSteps).toBe(2);
    expect(runRes.result.logs[0].message).toContain("Count=2 Total=100 Top=Grace");
    expect(runRes.result.logs[0].output.returnValue).toEqual({ cnt: 2, total: 100, topName: "Grace", after: 3 });

    const bunJs = macroToBunJs(macro);
    expect(bunJs).toContain("export async function Bun_Access_Macro(");
    expect(bunJs).toContain('MsgBox("Top was [topName] with total [totalBefore]"');

    const exportOut = await post("/api/macros/export", { macro, format: "bun" });
    expect(exportOut.success).toBe(true);
    expect(exportOut.filename).toBe("Bun_Access_Macro.macro.js");
    expect(exportOut.content).toContain("export async function Bun_Access_Macro(");
  });
});


