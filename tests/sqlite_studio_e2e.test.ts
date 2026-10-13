import { describe, it, expect, afterAll } from "bun:test";
import { startSqliteStudioServer } from "../applications/sqlite_studio_server.ts";
import { generateSqliteStudioHtml } from "../applications/sqlite_studio.ts";

describe("⚡ SQLite Studio Pro - Comprehensive End-to-End Enterprise Test Suite", () => {
  const server = startSqliteStudioServer({
    port: 0,
    initialDbPath: ":memory:",
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;

  afterAll(async () => {
    try {
      server.stop(true);
    } catch {}
  });

  // =========================================================================
  // 1. UI ARCHITECTURE & WORKSTATION TABS VALIDATION
  // =========================================================================
  it("1. HTML contains core enterprise workstation navigation tabs and corresponding panes", () => {
    const html = generateSqliteStudioHtml();

    // Navigation Tab Buttons
    expect(html).toContain('id="tabBtnGrid"');
    expect(html).toContain('id="tabBtnDesigner"');
    expect(html).toContain('id="tabBtnSchema"');
    expect(html).toContain('id="tabBtnExplain"');
    expect(html).toContain('id="tabBtnJson"');
    expect(html).toContain('id="tabBtnAudit"');
    expect(html).toContain('id="tabBtnPragma"');

    // Tab Panes
    expect(html).toContain('id="tabGrid"');
    expect(html).toContain('id="tabDesigner"');
    expect(html).toContain('id="tabSchema"');
    expect(html).toContain('id="tabExplain"');
    expect(html).toContain('id="tabJson"');
    expect(html).toContain('id="tabAudit"');
    expect(html).toContain('id="tabPragma"');
  });

  it("2. HTML includes Visual Query Designer with zoom, presets, Venn preview, and Cardinality Badges", () => {
    const html = generateSqliteStudioHtml();

    // Zoom Controls
    expect(html).toContain("qbe-zoom-controls");
    expect(html).toContain("canvasZoomSelect");
    expect(html).toContain("zoomInDesignerCanvas");
    expect(html).toContain("zoomOutDesignerCanvas");
    expect(html).toContain("resetDesignerCanvasZoom");
    expect(html).toContain("fitDesignerCanvasZoom");

    // Room Presets
    expect(html).toContain("qbe-room-controls");
    expect(html).toContain("setDesignerRoomMode");

    // Draggable Resizer Bar
    expect(html).toContain("qbe-resizer-bar");
    expect(html).toContain("qbeResizerBar");
    expect(html).toContain("initQbeSplitter");

    // Live Venn Diagram Preview & Join Properties Modal
    expect(html).toContain("access-venn-preview-row");
    expect(html).toContain('id="jpVennSvg"');
    expect(html).toContain('id="jpSqlSnippet"');
    expect(html).toContain("updateJoinPropVennDiagram");

    // Access Cardinality Badges (1 and ∞)
    expect(html).toContain("qbe-cardinality-badge");
  });

  it("3. HTML bundles the Access-style GUI CRUD layer (inline edits, modals, table designer)", () => {
    const html = generateSqliteStudioHtml();

    // Embedded CRUD stylesheet
    expect(html).toContain("GUI CRUD layer");
    expect(html).toContain(".crud-bar");
    expect(html).toContain(".crud-modal-card");

    // Embedded CRUD client logic
    expect(html).toContain("openRowDialog");
    expect(html).toContain("openTableDesigner");
    expect(html).toContain("openExportDialog");
    expect(html).toContain("openImportWizard");
  });

  it("4. HTML includes Microsoft Access Totals Row & Quick Filter Bar elements", () => {
    const html = generateSqliteStudioHtml();

    // Toolbar buttons
    expect(html).toContain('id="btnToggleTotals"');
    expect(html).toContain('id="btnToggleFilterBar"');
    expect(html).toContain('id="btnAccessReport"');

    // Table elements
    expect(html).toContain('id="gridFilterBarRow"');
    expect(html).toContain('id="gridTotalsFoot"');

    // Client-side functions
    expect(html).toContain("toggleAccessTotalsRow");
    expect(html).toContain("updateAccessTotalsRow");
    expect(html).toContain("toggleQuickFilterBar");
    expect(html).toContain("renderFilterBar");
    expect(html).toContain("onColumnFilterInput");
    expect(html).toContain("filterByColumnValue");
  });

  it("5. HTML includes Microsoft Access Publication Report modal and @media print styles", () => {
    const html = generateSqliteStudioHtml();

    // Report modal
    expect(html).toContain('id="accessReportModal"');
    expect(html).toContain('id="accessReportContent"');
    expect(html).toContain("openAccessReportModal");
    expect(html).toContain("closeAccessReportModal");
    expect(html).toContain("printAccessReport");
    expect(html).toContain("exportAccessReportHtml");

    // Print media styles
    expect(html).toContain("@media print");
    expect(html).toContain(".access-report-sheet");
    expect(html).toContain(".access-report-header");
  });

  it("6. HTML includes 1-Click Database Backup & SQL Dump Generator modal and triggers", () => {
    const html = generateSqliteStudioHtml();

    // Header action button
    expect(html).toContain('id="btnDbBackupDump"');
    expect(html).toContain("openDatabaseDumpModal");

    // Dump Modal
    expect(html).toContain('id="dumpModal"');
    expect(html).toContain('id="dumpModeSelect"');
    expect(html).toContain('id="dumpTablesList"');
    expect(html).toContain('id="dumpSqlPreview"');
    expect(html).toContain("runGenerateDump");
    expect(html).toContain("copyDumpSql");
    expect(html).toContain("downloadDumpFile");
    expect(html).toContain("openDumpInSqlIde");
  });

  // =========================================================================
  // 2. BACKEND API TELEMETRY & SCHEMA VALIDATION
  // =========================================================================
  it("7. /api/kpis returns healthy database metrics and engine details", async () => {
    const res = await fetch(`${baseUrl}/api/kpis`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.dbName).toBe(":memory:");
    expect(data.isMemory).toBe(true);
    expect(typeof data.pageSize).toBe("number");
    expect(typeof data.pageCount).toBe("number");
    expect(typeof data.tableCount).toBe("number");
    expect(data.tableCount).toBeGreaterThanOrEqual(4);
    expect(typeof data.totalRows).toBe("number");
    expect(data.totalRows).toBeGreaterThanOrEqual(25);
    expect(typeof data.sqliteVersion).toBe("string");
  });

  it("8. /api/schema returns reflected relational tables, columns, indexes, and views", async () => {
    const res = await fetch(`${baseUrl}/api/schema`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.tables).toBeDefined();
    expect(Array.isArray(data.tables)).toBe(true);

    const tableNames = data.tables.map((t: any) => t.name);
    expect(tableNames).toContain("customers");
    expect(tableNames).toContain("products");
    expect(tableNames).toContain("orders");
    expect(tableNames).toContain("order_items");

    const customersTable = data.tables.find((t: any) => t.name === "customers");
    expect(customersTable.columns.length).toBeGreaterThanOrEqual(6);
    expect(customersTable.columns.some((c: any) => c.name === "id" && c.pk)).toBe(true);
    expect(customersTable.columns.some((c: any) => c.name === "balance")).toBe(true);

    // Views
    expect(data.views).toBeDefined();
    expect(data.views.some((v: any) => v.name === "v_customer_orders")).toBe(true);
  });

  it("9. /api/table/aggregates computes numeric sums, averages, min, max, and total count", async () => {
    const res = await fetch(`${baseUrl}/api/table/aggregates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.aggregates).toBeDefined();
    expect(data.aggregates.__total).toBeDefined();
    expect(data.aggregates.__total.count).toBeGreaterThanOrEqual(5);

    // Numeric column 'balance'
    expect(data.aggregates.balance).toBeDefined();
    expect(typeof data.aggregates.balance.sum).toBe("number");
    expect(typeof data.aggregates.balance.avg).toBe("number");
    expect(data.aggregates.balance.min).toBeDefined();
    expect(data.aggregates.balance.max).toBeDefined();
  });

  it("10. /api/sqlite/attached returns database list", async () => {
    const res = await fetch(`${baseUrl}/api/sqlite/attached`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.databases)).toBe(true);
    expect(data.databases.length).toBeGreaterThanOrEqual(1);
    expect(data.databases[0].name).toBe("main");
  });

  it("11. /api/sqlite/virtual-tables returns virtual table discovery", async () => {
    const res = await fetch(`${baseUrl}/api/sqlite/virtual-tables`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.virtualTables)).toBe(true);
  });

  // =========================================================================
  // 3. 1-CLICK DATABASE BACKUP & SQL DUMP ENGINE
  // =========================================================================
  it("12. /api/database/dump generates complete SQL dump with schema and data", async () => {
    const res = await fetch(`${baseUrl}/api/database/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.mode).toBe("all");
    expect(typeof data.sql).toBe("string");

    const sql = data.sql;
    expect(sql).toContain("SQLITE STUDIO PRO - ENTERPRISE DATABASE DUMP");
    expect(sql).toContain("PRAGMA foreign_keys = OFF;");
    expect(sql).toContain("BEGIN TRANSACTION;");
    expect(sql).toContain('DROP TABLE IF EXISTS "customers";');
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('INSERT INTO "customers"');
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("PRAGMA foreign_keys = ON;");
  });

  it("13. /api/database/dump generates schema-only DDL dump", async () => {
    const res = await fetch(`${baseUrl}/api/database/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "schema" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.mode).toBe("schema");

    const sql = data.sql;
    expect(sql).toContain('DROP TABLE IF EXISTS "customers";');
    expect(sql).toContain('CREATE TABLE');
    expect(sql).not.toContain('INSERT INTO "customers"');
  });

  it("14. /api/database/dump generates data-only INSERT dump", async () => {
    const res = await fetch(`${baseUrl}/api/database/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "data" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.mode).toBe("data");

    const sql = data.sql;
    expect(sql).not.toContain('DROP TABLE IF EXISTS');
    expect(sql).toContain('INSERT INTO "customers"');
  });

  it("15. /api/database/dump filters by selected tables list", async () => {
    const res = await fetch(`${baseUrl}/api/database/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all", tables: ["products"] }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    const sql = data.sql;
    expect(sql).toContain('DROP TABLE IF EXISTS "products";');
    expect(sql).toContain('INSERT INTO "products"');
    expect(sql).not.toContain('DROP TABLE IF EXISTS "customers";');
  });

  it("16. /api/dump supports both legacy and mode-aware requests", async () => {
    const res1 = await fetch(`${baseUrl}/api/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables: ["customers"] }),
    });
    expect(res1.status).toBe(200);
    const d1 = await res1.json();
    expect(d1.success).toBe(true);
    expect(d1.sql).toContain('customers');

    const res2 = await fetch(`${baseUrl}/api/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "schema", tables: ["customers"] }),
    });
    expect(res2.status).toBe(200);
    const d2 = await res2.json();
    expect(d2.success).toBe(true);
    expect(d2.sql).toContain('DROP TABLE IF EXISTS "customers";');
    expect(d2.sql).not.toContain('INSERT INTO "customers"');
  });

  // =========================================================================
  // 4. ACCESS CRUD LIFECYCLE & ROW OPERATIONS
  // =========================================================================
  it("17. CRUD Lifecycle: Insert, Update, and Delete rows via convenience APIs", async () => {
    const uniqueEmail = `test_${Date.now()}@sqlite.org`;

    // 1. Insert
    const insertRes = await fetch(`${baseUrl}/api/rows/insert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        row: {
          name: "Dr. Richard Hipp",
          email: uniqueEmail,
          company: "SQLite Consortium",
          country: "United States",
          tier: "Enterprise",
          balance: 9999.50,
        },
      }),
    });

    expect(insertRes.status).toBe(200);
    const insertData = await insertRes.json();
    expect(insertData.success).toBe(true);
    const newId = insertData.lastInsertRowid;
    expect(typeof newId).toBe("number");

    // 2. Verify via /api/table/data
    const verifyRes = await fetch(`${baseUrl}/api/table/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers", search: uniqueEmail }),
    });
    const verifyData = await verifyRes.json();
    expect(verifyData.rows.length).toBe(1);
    expect(verifyData.rows[0].name).toBe("Dr. Richard Hipp");

    // 3. Update
    const updateRes = await fetch(`${baseUrl}/api/rows/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        pk: { id: newId },
        changes: { tier: "VIP", balance: 12500.00 },
      }),
    });
    expect(updateRes.status).toBe(200);
    const updateData = await updateRes.json();
    expect(updateData.success).toBe(true);

    // 4. Delete
    const deleteRes = await fetch(`${baseUrl}/api/rows/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        pk: { id: newId },
      }),
    });
    expect(deleteRes.status).toBe(200);
    const deleteData = await deleteRes.json();
    expect(deleteData.success).toBe(true);

    // 5. Verify deletion
    const checkRes = await fetch(`${baseUrl}/api/table/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers", search: uniqueEmail }),
    });
    const checkData = await checkRes.json();
    expect(checkData.rows.length).toBe(0);
  });

  it("18. /api/rows/import-batch imports multiple rows atomically", async () => {
    const stamp = Date.now();
    const rows = [
      { name: `Batch 1 ${stamp}`, email: `b1_${stamp}@example.com`, company: "Batch Co", balance: 100 },
      { name: `Batch 2 ${stamp}`, email: `b2_${stamp}@example.com`, company: "Batch Co", balance: 200 },
      { name: `Batch 3 ${stamp}`, email: `b3_${stamp}@example.com`, company: "Batch Co", balance: 300 },
    ];

    const res = await fetch(`${baseUrl}/api/rows/import-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers", rows }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.count).toBe(3);
  });

  it("19. /api/table/truncate and /api/schema/drop-table operate correctly on test table", async () => {
    // 1. Create temporary test table
    await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "CREATE TABLE temp_scratch (id INTEGER PRIMARY KEY, msg TEXT);" }),
    });

    // 2. Insert rows
    await fetch(`${baseUrl}/api/rows/insert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "temp_scratch", row: { msg: "hello world" } }),
    });

    // 3. Truncate
    const truncRes = await fetch(`${baseUrl}/api/table/truncate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "temp_scratch" }),
    });
    expect(truncRes.status).toBe(200);
    const truncData = await truncRes.json();
    expect(truncData.success).toBe(true);

    const countRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT COUNT(*) as count FROM temp_scratch;" }),
    });
    const countData = await countRes.json();
    expect(countData.rows[0].count).toBe(0);

    // 4. Drop table
    const dropRes = await fetch(`${baseUrl}/api/schema/drop-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "temp_scratch" }),
    });
    expect(dropRes.status).toBe(200);
    const dropData = await dropRes.json();
    expect(dropData.success).toBe(true);
  });

  it("20. PRAGMA operations: journal mode, foreign keys, and integrity check", async () => {
    const pragmaRes = await fetch(`${baseUrl}/api/pragma`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pragma: "foreign_keys", value: "ON" }),
    });
    expect(pragmaRes.status).toBe(200);
    const pragmaData = await pragmaRes.json();
    expect(pragmaData.success).toBe(true);

    const checkRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "PRAGMA integrity_check;" }),
    });
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.success).toBe(true);
    expect(checkData.rows[0].integrity_check).toBe("ok");
  });
});
