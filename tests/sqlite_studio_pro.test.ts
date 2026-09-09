import { describe, it, expect, afterAll } from "bun:test";
import { startSqliteStudioServer } from "../applications/sqlite_studio_server.ts";
import { createSqliteStudio, createDatabaseStudio, createSqliteStudioPro } from "../applications/sqlite_studio.ts";
import { existsSync, unlinkSync, readFileSync } from "fs";
import { resolve } from "path";
import { Database } from "bun:sqlite";

describe("⚡ SQLite Studio Pro - Enterprise Database Workstation Suite", () => {
  const server = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:" });
  const baseUrl = `http://127.0.0.1:${server.port}`;

  afterAll(() => {
    try {
      server.stop(true);
    } catch {}
  });

  it("1. Server starts on dynamic port and serves workstation HTML shell", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("SQLite Studio Pro");
    expect(html).toContain("Query Designer");
    expect(html).toContain("bun:sqlite");
    expect(html).toContain("objectTreeContainer");
    expect(html).toContain("mainDataGrid");
    expect(html).toContain("designerSqlPreview");
  });

  it("2. /api/kpis returns valid database telemetry metrics", async () => {
    const res = await fetch(`${baseUrl}/api/kpis`);
    expect(res.status).toBe(200);
    const kpis = await res.json();
    expect(kpis.dbName).toBe(":memory:");
    expect(kpis.isMemory).toBe(true);
    expect(typeof kpis.pageSize).toBe("number");
    expect(typeof kpis.tableCount).toBe("number");
    expect(kpis.tableCount).toBeGreaterThanOrEqual(4); // customers, products, orders, order_items, audit_logs
    expect(kpis.totalRows).toBeGreaterThanOrEqual(25);
    expect(typeof kpis.sqliteVersion).toBe("string");
  });

  it("3. /api/schema inspects all tables, views, columns and foreign keys", async () => {
    const res = await fetch(`${baseUrl}/api/schema`);
    expect(res.status).toBe(200);
    const schema = await res.json();
    expect(Array.isArray(schema.tables)).toBe(true);
    expect(Array.isArray(schema.views)).toBe(true);

    const tableNames = schema.tables.map((t: any) => t.name);
    expect(tableNames).toContain("customers");
    expect(tableNames).toContain("products");
    expect(tableNames).toContain("orders");
    expect(tableNames).toContain("order_items");

    const customersTable = schema.tables.find((t: any) => t.name === "customers");
    expect(customersTable).toBeDefined();
    expect(customersTable.columns.length).toBeGreaterThanOrEqual(5);

    const colNames = customersTable.columns.map((c: any) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("name");
    expect(colNames).toContain("email");

    const views = schema.views.map((v: any) => v.name);
    expect(views).toContain("v_customer_orders");
  });

  it("4. /api/query executes SELECT queries with timing and columns metadata", async () => {
    const res = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: "SELECT name, email, tier, balance FROM customers ORDER BY balance DESC LIMIT 5;",
      }),
    });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBe(5);
    expect(result.columns).toEqual(["name", "email", "tier", "balance"]);
    expect(typeof result.latencyMs).toBe("number");
  });

  it("5. /api/explain generates visual query plan analysis", async () => {
    const res = await fetch(`${baseUrl}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: "SELECT * FROM customers WHERE email = 'linus@kernel.org';",
      }),
    });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.queryPlan)).toBe(true);
    expect(result.queryPlan.length).toBeGreaterThan(0);
    expect(typeof result.queryPlan[0].detail).toBe("string");
  });

  it("6. /api/table/data provides paginated, sorted, and filtered rows", async () => {
    const res = await fetch(`${baseUrl}/api/table/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "products",
        page: 1,
        pageSize: 4,
        orderBy: "price",
        orderDir: "DESC",
      }),
    });
    expect(res.status).toBe(200);
    const result = await res.json();
    expect(result.success).toBe(true);
    expect(result.table).toBe("products");
    expect(result.rows.length).toBe(4);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(4);
    expect(result.totalRows).toBeGreaterThanOrEqual(10);
    // Highest price product should be first
    expect(result.rows[0].price).toBeGreaterThanOrEqual(result.rows[1].price);
  });

  it("7. /api/table/mutate safely inserts, updates, and deletes records", async () => {
    // Insert
    const insertRes = await fetch(`${baseUrl}/api/table/mutate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        action: "insert",
        payload: {
          data: {
            name: "Test Developer",
            email: "test_dev@example.com",
            company: "Acme Inc",
            country: "Canada",
            tier: "Enterprise",
            balance: 5000.0,
          },
        },
      }),
    });
    const insertData = await insertRes.json();
    expect(insertData.success).toBe(true);
    const newId = insertData.lastInsertRowid;
    expect(typeof newId).toBe("number");

    // Update
    const updateRes = await fetch(`${baseUrl}/api/table/mutate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        action: "update",
        payload: {
          rowId: newId,
          data: { tier: "VIP", balance: 9999.0 },
        },
      }),
    });
    const updateData = await updateRes.json();
    expect(updateData.success).toBe(true);

    // Verify update
    const verifyRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: `SELECT tier, balance FROM customers WHERE id = ${newId};` }),
    });
    const verifyData = await verifyRes.json();
    expect(verifyData.rows[0].tier).toBe("VIP");
    expect(verifyData.rows[0].balance).toBe(9999.0);

    // Delete
    const deleteRes = await fetch(`${baseUrl}/api/table/mutate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        action: "delete",
        payload: { rowId: newId },
      }),
    });
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);
  });

  it("8. /api/pragma configures and tests PRAGMAs", async () => {
    const res = await fetch(`${baseUrl}/api/pragma`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pragma: "foreign_keys", value: "ON" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("9. /api/export generates CSV, JSON, and SQL export payloads", async () => {
    const sampleRows = [
      { id: 1, name: "Alpha", val: 100 },
      { id: 2, name: "Beta", val: 200 },
    ];

    for (const format of ["csv", "json", "sql"] as const) {
      const res = await fetch(`${baseUrl}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, rows: sampleRows, tableName: "sample" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.rowCount).toBe(2);
      expect(existsSync(data.path)).toBe(true);
      // Clean up file
      try { unlinkSync(data.path); } catch {}
    }
  });

  it("10. Desktop factory creates instance and maintains backward compatibility", () => {
    const app = createSqliteStudio();
    expect(app).toBeDefined();
    expect(app.fullscreen).toBe(true);
    expect(typeof app.run).toBe("function");
    expect(typeof app.generateHtml).toBe("function");

    // Aliases
    expect(createDatabaseStudio).toBe(createSqliteStudio);
    expect(createSqliteStudioPro).toBe(createSqliteStudio);
  });

  it("11. /api/workspace-databases scans and returns discovered project databases", async () => {
    const res = await fetch(`${baseUrl}/api/workspace-databases`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.databases)).toBe(true);
    expect(data.databases.length).toBeGreaterThanOrEqual(1);
    expect(data.databases.some((d: any) => d.name.includes(":memory:"))).toBe(true);
  });

  it("12. /api/connect safely switches active database and reflects new KPIs and schema", async () => {
    // Create a temporary sqlite database file
    const tempDbPath = resolve(process.cwd(), `test_db_${Date.now()}.sqlite`);
    const tempDb = new Database(tempDbPath);
    tempDb.run("CREATE TABLE test_items (id INTEGER PRIMARY KEY, item_name TEXT);");
    tempDb.run("INSERT INTO test_items (item_name) VALUES ('Widget A'), ('Widget B');");
    tempDb.close();

    try {
      const res = await fetch(`${baseUrl}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: tempDbPath }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.path).toBe(tempDbPath);
      expect(data.kpis).toBeDefined();
      expect(data.kpis.tableCount).toBe(1);
      expect(data.schema).toBeDefined();
      expect(data.schema.tables.some((t: any) => t.name === "test_items")).toBe(true);

      // Reconnect to in-memory
      const resMem = await fetch(`${baseUrl}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: ":memory:" }),
      });
      expect(resMem.status).toBe(200);
    } finally {
      try { unlinkSync(tempDbPath); } catch {}
    }
  });

  it("13. /api/upload-database validates SQLite magic bytes and loads uploaded file", async () => {
    // Create valid SQLite file buffer
    const tempDbPath = resolve(process.cwd(), `test_upload_${Date.now()}.db`);
    const tempDb = new Database(tempDbPath);
    tempDb.run("CREATE TABLE uploaded_records (id INTEGER PRIMARY KEY, title TEXT);");
    tempDb.run("INSERT INTO uploaded_records (title) VALUES ('Item 1');");
    tempDb.close();

    const fileBuffer = readFileSync(tempDbPath);
    try { unlinkSync(tempDbPath); } catch {}

    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", blob, "uploaded_test.db");

    const res = await fetch(`${baseUrl}/api/upload-database`, {
      method: "POST",
      body: formData,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.name).toBe("uploaded_test.db");
    expect(data.schema.tables.some((t: any) => t.name === "uploaded_records")).toBe(true);

    try { unlinkSync(data.path); } catch {}

    // Reconnect to in-memory database to restore seed tables for subsequent tests
    await fetch(`${baseUrl}/api/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: ":memory:" }),
    });
  });

  it("14. Embedded workstation scripts parse with valid JavaScript syntax (no GUI freeze)", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
    expect(scripts.length).toBeGreaterThan(0);

    for (let i = 0; i < scripts.length; i++) {
      const scriptBody = scripts[i].replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
      expect(() => {
        new Function(scriptBody);
      }).not.toThrow();
    }
  });

  it("15. Access QBE Designer compiler generates valid SQL with Sort, Joins, Aggregates, Criteria, and executes successfully", async () => {
    // 1. Fetch HTML and execute buildDesignerSql inside an emulated context
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    const scriptMatch = html.match(/<script[\s\S]*?<\/script>/gi)?.[0];
    expect(scriptMatch).toBeDefined();
    const scriptBody = scriptMatch!.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");

    // Mock minimal browser globals needed by script execution
    const mockContext = {
      window: {
        location: { search: "" },
        addEventListener: () => {},
      },
      document: {
        getElementById: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        head: { appendChild: () => {} },
        createElement: () => ({ setAttribute: () => {}, style: {}, addEventListener: () => {} }),
      },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    };

    const runScript = new Function(
      "window", "document", "fetch",
      `${scriptBody}; return { buildDesignerSql, queryDesignerState, setCurrentSchema: (s) => { currentSchema = s; } };`
    );

    const { buildDesignerSql, queryDesignerState, setCurrentSchema } = runScript(
      mockContext.window,
      mockContext.document,
      mockContext.fetch
    );

    setCurrentSchema({
      tables: [
        { name: "customers", columns: [{ name: "id" }, { name: "name" }, { name: "tier" }] },
        { name: "orders", columns: [{ name: "id" }, { name: "customer_id" }, { name: "total_amount" }, { name: "status" }] }
      ]
    });

    // Setup an Access-grade query:
    // Tables: customers, orders
    // Join: customers.id = orders.customer_id (INNER JOIN)
    // Columns:
    //  1. customers.name        | Total: GroupBy | Sort: ASC | Show: true
    //  2. orders.total_amount   | Total: Sum     | Sort: DESC | Show: true
    //  3. orders.total_amount   | Total: Avg     | Show: true
    //  4. orders.id             | Total: Count   | Show: true
    //  5. orders.status         | Total: Where   | Criteria: !='cancelled' | Show: false
    // Top Values (Limit): 25
    // Distinct: true

    queryDesignerState.selectedTables = ["customers", "orders"];
    queryDesignerState.joins = [
      { leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "INNER" }
    ];
    queryDesignerState.showTotals = true;
    queryDesignerState.distinct = true;
    queryDesignerState.topLimit = 25;
    queryDesignerState.columns = [
      {
        field: "name",
        table: "customers",
        total: "GroupBy",
        sort: "ASC",
        show: true,
        criteria: "",
        or1: "",
        or2: "",
        alias: "customer_name"
      },
      {
        field: "total_amount",
        table: "orders",
        total: "Sum",
        sort: "DESC",
        show: true,
        criteria: "> 0",
        or1: "",
        or2: "",
        alias: "total_spent"
      },
      {
        field: "total_amount",
        table: "orders",
        total: "Avg",
        sort: "None",
        show: true,
        criteria: "",
        or1: "",
        or2: "",
        alias: "avg_spent"
      },
      {
        field: "id",
        table: "orders",
        total: "Count",
        sort: "None",
        show: true,
        criteria: "",
        or1: "",
        or2: "",
        alias: "order_count"
      },
      {
        field: "status",
        table: "orders",
        total: "Where",
        sort: "None",
        show: false,
        criteria: "!='cancelled'",
        or1: "",
        or2: "",
        alias: ""
      }
    ];

    const generatedSql = buildDesignerSql();
    expect(generatedSql).toContain("SELECT DISTINCT");
    expect(generatedSql).toContain('FROM "customers"');
    expect(generatedSql).toContain('INNER JOIN "orders" ON "customers"."id" = "orders"."customer_id"');
    expect(generatedSql).toContain('SUM("orders"."total_amount") AS "total_spent"');
    expect(generatedSql).toContain('AVG("orders"."total_amount") AS "avg_spent"');
    expect(generatedSql).toContain('COUNT("orders"."id") AS "order_count"');
    expect(generatedSql).toContain('GROUP BY "customers"."name"');
    expect(generatedSql).toContain('HAVING SUM("orders"."total_amount") > 0');
    expect(generatedSql).toContain('ORDER BY "customers"."name" ASC, SUM("orders"."total_amount") DESC');
    expect(generatedSql).toContain("LIMIT 25");

    // Execute the compiled query against /api/query to ensure it is 100% valid SQLite syntax
    const queryRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: generatedSql }),
    });
    expect(queryRes.status).toBe(200);
    const queryData = await queryRes.json();
    expect(queryData.success).toBe(true);
    expect(Array.isArray(queryData.columns)).toBe(true);
    expect(queryData.columns).toContain("customer_name");
    expect(queryData.columns).toContain("total_spent");
    expect(queryData.columns).toContain("avg_spent");
    expect(queryData.columns).toContain("order_count");
  });
});

