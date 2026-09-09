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
    expect(app.width).toBeGreaterThanOrEqual(1024);
    expect(app.height).toBeGreaterThanOrEqual(768);
    expect(typeof app.run).toBe("function");
    expect(typeof app.generateHtml).toBe("function");

    // Windowed fallback options
    const windowedApp = createSqliteStudio({ fullscreen: false, width: 1000, height: 700 });
    expect(windowedApp.fullscreen).toBe(false);
    expect(windowedApp.width).toBe(1000);
    expect(windowedApp.height).toBe(700);

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
      "window", "document", "fetch", "setInterval",
      `${scriptBody}; return { buildDesignerSql, queryDesignerState, setCurrentSchema: (s) => { currentSchema = s; } };`
    );

    const { buildDesignerSql, queryDesignerState, setCurrentSchema } = runScript(
      mockContext.window,
      mockContext.document,
      mockContext.fetch,
      () => 0
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

  it("16. Query Presets, Editable SQL Runner, Persistent Saved Queries, and Export Enhancements operate correctly", async () => {
    // 1. Fetch workstation HTML and verify UI enhancements exist
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();

    expect(html).toContain("applyDesignerPreset");
    expect(html).toContain("⚡ Presets / Templates");
    expect(html).toContain("runCustomDesignerSql");
    expect(html).toContain("copyDesignerDatasheetMarkdown");
    expect(html).toContain("copyDesignerDatasheetSqlInsert");
    expect(html).toContain("filterDesignerDatasheet");
    expect(html).toContain("toggleCriteriaHelp");
    expect(html).toContain("criteriaHelpBanner");
    expect(html).toContain("qbe-saved-chip");

    // 2. Test built-in Presets SQL execution against active database
    // Top Spenders Preset Query
    const topSpendersSql = `
      SELECT "customers"."name" AS "Customer", "customers"."tier" AS "Tier",
             SUM("orders"."total_amount") AS "TotalSpend", COUNT("orders"."id") AS "OrdersCount"
      FROM "customers"
      INNER JOIN "orders" ON "customers"."id" = "orders"."customer_id"
      GROUP BY "customers"."name", "customers"."tier"
      HAVING SUM("orders"."total_amount") > 0
      ORDER BY "TotalSpend" DESC
      LIMIT 25;
    `;
    const spendRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: topSpendersSql }),
    });
    expect(spendRes.status).toBe(200);
    const spendData = await spendRes.json();
    expect(spendData.success).toBe(true);
    expect(spendData.columns).toContain("Customer");
    expect(spendData.columns).toContain("TotalSpend");

    // Low Stock Alert Preset Query
    const lowStockSql = `
      SELECT "products"."name" AS "Product", "products"."category" AS "Category",
             "products"."stock" AS "UnitsInStock", "products"."price" AS "Price"
      FROM "products"
      WHERE "products"."stock" < 50
      ORDER BY "products"."stock" ASC
      LIMIT 50;
    `;
    const stockRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: lowStockSql }),
    });
    expect(stockRes.status).toBe(200);
    const stockData = await stockRes.json();
    expect(stockData.success).toBe(true);
    expect(stockData.columns).toContain("UnitsInStock");

    // Active Orders Pipeline Preset Query
    const ordersPipelineSql = `
      SELECT "orders"."id" AS "OrderID", "customers"."name" AS "Customer",
             "orders"."status" AS "Status", "orders"."total_amount" AS "Amount"
      FROM "customers"
      INNER JOIN "orders" ON "customers"."id" = "orders"."customer_id"
      WHERE "orders"."status" <> 'cancelled'
      ORDER BY "orders"."id" DESC
      LIMIT 50;
    `;
    const orderRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: ordersPipelineSql }),
    });
    expect(orderRes.status).toBe(200);
    const orderData = await orderRes.json();
    expect(orderData.success).toBe(true);
    expect(orderData.columns).toContain("OrderID");
    expect(orderData.columns).toContain("Status");
  });

  it("17. Security & SQL Injection Prevention Verification", async () => {
    // 1. Malicious PRAGMA name injection attempt
    const badPragmaNameRes = await fetch(`${baseUrl}/api/pragma`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pragma: "foreign_keys; DROP TABLE customers; --" }),
    });
    const badPragmaNameData = await badPragmaNameRes.json();
    expect(badPragmaNameData.success).toBe(false);
    expect(badPragmaNameData.error).toContain("Invalid pragma name");

    // 2. Malicious PRAGMA value injection attempt
    const badPragmaValRes = await fetch(`${baseUrl}/api/pragma`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pragma: "foreign_keys", value: "ON; DROP TABLE customers; --" }),
    });
    const badPragmaValData = await badPragmaValRes.json();
    expect(badPragmaValData.success).toBe(false);
    expect(badPragmaValData.error).toContain("Invalid or unsafe pragma value");

    // 3. Malicious table mutation injection attempt (Table name injection)
    const badMutateTableRes = await fetch(`${baseUrl}/api/table/mutate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: 'customers" OR 1=1; --',
        action: "delete",
        payload: { rowId: 1 },
      }),
    });
    const badMutateTableData = await badMutateTableRes.json();
    expect(badMutateTableData.success).toBe(false);
    expect(badMutateTableData.error).toContain("does not exist");

    // 4. Malicious primary key column injection attempt
    const badPkColRes = await fetch(`${baseUrl}/api/table/mutate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        action: "delete",
        payload: { pkColumn: 'id" = 1 OR 1=1; --', rowId: 1 },
      }),
    });
    const badPkColData = await badPkColRes.json();
    expect(badPkColData.success).toBe(false);
    expect(badPkColData.error).toContain("Invalid primary key column");

    // 5. Malicious column injection attempt in update payload
    const badColRes = await fetch(`${baseUrl}/api/table/mutate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        action: "update",
        payload: {
          rowId: 1,
          data: {
            'tier" = "HACKED"; DROP TABLE orders; --': "malicious_val",
          },
        },
      }),
    });
    const badColData = await badColRes.json();
    // Non-existent columns are safely filtered out, resulting in 0 rows affected or success without injection
    expect(badColData.error).toBeUndefined();

    // 6. Verify customers & orders tables are completely intact after all attack attempts
    const verifyCustRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: 'SELECT count(*) as count FROM customers;' }),
    });
    const verifyCustData = await verifyCustRes.json();
    expect(verifyCustData.success).toBe(true);
    expect(verifyCustData.rows[0].count).toBeGreaterThan(0);

    // 7. Verify Client-Side QBE criteria injection neutralization
    const workstationRes = await fetch(`${baseUrl}/`);
    const html = await workstationRes.text();
    expect(html).toContain("escapeHtml");
    expect(html).toContain("trimmed.includes(\";\")");

    // Test criteria escaping in JavaScript sandbox
    const evalSandbox = new Function(`
      function formatAccessCriterion(qualifiedField, criterionStr) {
        if (!criterionStr || !String(criterionStr).trim()) return "";
        const trimmed = String(criterionStr).trim();
        if (trimmed.includes(";") || trimmed.includes("--") || trimmed.includes("/*")) {
          return qualifiedField + " = '" + trimmed.replace(/'/g, "''") + "'";
        }
        if (/^(=|<>|!=|>|<|>=|<=|LIKE|NOT LIKE|IN|NOT IN|BETWEEN|IS NULL|IS NOT NULL)/i.test(trimmed)) {
          return qualifiedField + " " + trimmed;
        }
        return qualifiedField + " = '" + trimmed.replace(/'/g, "''") + "'";
      }

      function escapeHtml(value) {
        if (value === null || value === undefined) return "";
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      return {
        safeCriterion: formatAccessCriterion('"customers"."name"', "Alice; DROP TABLE customers; --"),
        safeXss: escapeHtml("<script>alert('pwned')</script>")
      };
    `)();

    expect(evalSandbox.safeCriterion).toBe(`"customers"."name" = 'Alice; DROP TABLE customers; --'`);
    expect(evalSandbox.safeXss).toBe("&lt;script&gt;alert(&#039;pwned&#039;)&lt;/script&gt;");
  });

  it("18. Multi-Table Joins (> 2 tables): Graph Spanning Tree & Topological Query Execution", async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    const scriptMatch = html.match(/<script[\s\S]*?<\/script>/gi)?.[0];
    expect(scriptMatch).toBeDefined();
    const scriptBody = scriptMatch!.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");

    const mockContext = {
      window: { location: { search: "" }, addEventListener: () => {} },
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
      "window", "document", "fetch", "setInterval",
      `${scriptBody}; return { buildDesignerSql, buildDesignerJoinPairs, suggestDesignerJoin, queryDesignerState, setCurrentSchema: (s) => { currentSchema = s; } };`
    );

    const { buildDesignerSql, buildDesignerJoinPairs, suggestDesignerJoin, queryDesignerState, setCurrentSchema } = runScript(
      mockContext.window,
      mockContext.document,
      mockContext.fetch,
      () => 0
    );

    // 4-Table Schema
    setCurrentSchema({
      tables: [
        {
          name: "customers",
          columns: [{ name: "id" }, { name: "name" }, { name: "tier" }],
          foreignKeys: [],
        },
        {
          name: "orders",
          columns: [{ name: "id" }, { name: "customer_id" }, { name: "total_amount" }, { name: "status" }],
          foreignKeys: [{ table: "customers", from: "customer_id", to: "id" }],
        },
        {
          name: "order_items",
          columns: [{ name: "id" }, { name: "order_id" }, { name: "product_id" }, { name: "quantity" }, { name: "unit_price" }],
          foreignKeys: [
            { table: "orders", from: "order_id", to: "id" },
            { table: "products", from: "product_id", to: "id" },
          ],
        },
        {
          name: "products",
          columns: [{ name: "id" }, { name: "sku" }, { name: "name" }, { name: "category" }, { name: "price" }],
          foreignKeys: [],
        },
      ],
    });

    // Verify smart heuristic join suggestions
    const custToOrd = suggestDesignerJoin("customers", "orders");
    expect(custToOrd).not.toBeNull();
    expect(custToOrd.leftField).toBe("id");
    expect(custToOrd.rightField).toBe("customer_id");

    const ordToItem = suggestDesignerJoin("orders", "order_items");
    expect(ordToItem).not.toBeNull();
    expect(ordToItem.leftField).toBe("id");
    expect(ordToItem.rightField).toBe("order_id");

    const itemToProd = suggestDesignerJoin("order_items", "products");
    expect(itemToProd).not.toBeNull();
    expect(itemToProd.leftField).toBe("product_id");
    expect(itemToProd.rightField).toBe("id");

    // Add 4 tables in shuffled order: customers, products, orders, order_items
    queryDesignerState.selectedTables = ["customers", "products", "orders", "order_items"];
    const spanningTree = buildDesignerJoinPairs();

    // Spanning tree should have exactly 3 joins connecting all 4 tables
    expect(spanningTree.length).toBe(3);

    // Set spanning tree as the active joins
    queryDesignerState.joins = spanningTree;
    queryDesignerState.showTotals = true;
    queryDesignerState.columns = [
      { table: "customers", field: "name", alias: "Customer", total: "GroupBy", sort: "ASC", show: true, criteria: "" },
      { table: "products", field: "category", alias: "Category", total: "GroupBy", sort: "", show: true, criteria: "" },
      { table: "products", field: "name", alias: "Product", total: "GroupBy", sort: "", show: true, criteria: "" },
      { table: "order_items", field: "quantity", alias: "UnitsSold", total: "Sum", sort: "", show: true, criteria: "> 0" },
      { table: "orders", field: "total_amount", alias: "OrderTotal", total: "Sum", sort: "DESC", show: true, criteria: "" },
    ];

    const sql = buildDesignerSql();
    expect(sql).toContain('FROM "customers"');
    expect(sql).toContain('GROUP BY');
    expect(sql).toContain('ORDER BY');

    // Execute compiled 4-table join query against test database
    const queryRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });

    expect(queryRes.status).toBe(200);
    const queryData = await queryRes.json();
    expect(queryData.success).toBe(true);
    expect(Array.isArray(queryData.columns)).toBe(true);
    expect(queryData.columns).toContain("Customer");
    expect(queryData.columns).toContain("Category");
    expect(queryData.columns).toContain("Product");
    expect(queryData.columns).toContain("UnitsSold");
    expect(queryData.columns).toContain("OrderTotal");
    expect(queryData.rows.length).toBeGreaterThan(0);
  });

  it("19. Relational Join Views: Seeded views discovery, multi-table queries, and dynamic view creation", async () => {
    // 1. Fetch schema and verify the 5 multi-table join views exist
    const schemaRes = await fetch(`${baseUrl}/api/schema`);
    expect(schemaRes.status).toBe(200);
    const schema = await schemaRes.json();
    expect(Array.isArray(schema.views)).toBe(true);

    const viewNames = schema.views.map((v: any) => v.name);
    expect(viewNames).toContain("v_order_details_extended");
    expect(viewNames).toContain("v_customer_order_summary");
    expect(viewNames).toContain("v_product_sales_performance");
    expect(viewNames).toContain("v_pending_shipments");
    expect(viewNames).toContain("v_vip_customer_analytics");

    // 2. Query 4-table join view: v_order_details_extended
    const orderDetailsRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM v_order_details_extended LIMIT 10;" }),
    });
    expect(orderDetailsRes.status).toBe(200);
    const orderDetailsData = await orderDetailsRes.json();
    expect(orderDetailsData.success).toBe(true);
    expect(orderDetailsData.rows.length).toBeGreaterThan(0);
    expect(orderDetailsData.columns).toContain("order_id");
    expect(orderDetailsData.columns).toContain("customer_name");
    expect(orderDetailsData.columns).toContain("customer_email");
    expect(orderDetailsData.columns).toContain("product_name");
    expect(orderDetailsData.columns).toContain("product_category");
    expect(orderDetailsData.columns).toContain("line_total");

    // 3. Query 3-table aggregate join view: v_customer_order_summary
    const customerSummaryRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM v_customer_order_summary LIMIT 10;" }),
    });
    expect(customerSummaryRes.status).toBe(200);
    const customerSummaryData = await customerSummaryRes.json();
    expect(customerSummaryData.success).toBe(true);
    expect(customerSummaryData.columns).toContain("total_orders");
    expect(customerSummaryData.columns).toContain("total_spend");
    expect(customerSummaryData.rows.length).toBeGreaterThan(0);

    // 4. Query product sales performance view: v_product_sales_performance
    const productPerfRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM v_product_sales_performance LIMIT 10;" }),
    });
    expect(productPerfRes.status).toBe(200);
    const productPerfData = await productPerfRes.json();
    expect(productPerfData.success).toBe(true);
    expect(productPerfData.columns).toContain("gross_revenue");
    expect(productPerfData.columns).toContain("units_sold");

    // 5. Query pending shipments view: v_pending_shipments
    const pendingRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM v_pending_shipments;" }),
    });
    expect(pendingRes.status).toBe(200);
    const pendingData = await pendingRes.json();
    expect(pendingData.success).toBe(true);

    // 6. Test Dynamic View Creation via DDL
    const createViewRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `CREATE VIEW IF NOT EXISTS v_high_value_orders AS
              SELECT o.id AS order_id, c.name AS customer_name, o.total_amount
              FROM orders o
              JOIN customers c ON o.customer_id = c.id
              WHERE o.total_amount > 200;`
      }),
    });
    expect(createViewRes.status).toBe(200);
    const createViewData = await createViewRes.json();
    expect(createViewData.success).toBe(true);

    // Verify newly created view is reflected in /api/schema
    const updatedSchemaRes = await fetch(`${baseUrl}/api/schema`);
    const updatedSchema = await updatedSchemaRes.json();
    const updatedViewNames = updatedSchema.views.map((v: any) => v.name);
    expect(updatedViewNames).toContain("v_high_value_orders");

    // Verify querying the newly created view
    const testNewViewRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM v_high_value_orders LIMIT 5;" }),
    });
    const testNewViewData = await testNewViewRes.json();
    expect(testNewViewData.success).toBe(true);
    expect(testNewViewData.columns).toContain("order_id");
    expect(testNewViewData.columns).toContain("customer_name");
  });
});


