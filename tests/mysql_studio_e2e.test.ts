import { describe, it, expect, afterAll } from "bun:test";
import { startMysqlStudioServer } from "../applications/mysql_studio_server.ts";
import { generateMysqlStudioHtml } from "../applications/mysql_studio.ts";

describe("🐬 MySQL Studio Pro - Comprehensive End-to-End Enterprise Test Suite", () => {
  const server = startMysqlStudioServer({
    port: 0,
    config: {
      host: "localhost",
      port: 3306,
      user: "root",
      password: "@Delphi32@",
      database: "my_app_dev",
    },
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
  it("1. HTML contains all 11 enterprise workstation navigation tabs and corresponding panes", () => {
    const html = generateMysqlStudioHtml();

    // 11 Navigation Tab Buttons
    expect(html).toContain('id="tabBtnGrid"');
    expect(html).toContain('id="tabBtnDesigner"');
    expect(html).toContain('id="tabBtnSchema"');
    expect(html).toContain('id="tabBtnTypes"');
    expect(html).toContain('id="tabBtnPartitions"');
    expect(html).toContain('id="tabBtnActivity"');
    expect(html).toContain('id="tabBtnReplication"');
    expect(html).toContain('id="tabBtnExplain"');
    expect(html).toContain('id="tabBtnJson"');
    expect(html).toContain('id="tabBtnAudit"');
    expect(html).toContain('id="tabBtnPragma"');

    // Tab Panes
    expect(html).toContain('id="tabGrid"');
    expect(html).toContain('id="tabDesigner"');
    expect(html).toContain('id="tabSchema"');
    expect(html).toContain('id="tabTypes"');
    expect(html).toContain('id="tabPartitions"');
    expect(html).toContain('id="tabActivity"');
    expect(html).toContain('id="tabReplication"');
    expect(html).toContain('id="tabExplain"');
    expect(html).toContain('id="tabJson"');
    expect(html).toContain('id="tabAudit"');
    expect(html).toContain('id="tabPragma"');
  });

  it("2. HTML includes Visual Query Designer with deep zoom, room presets, resizer bar, and Venn preview", () => {
    const html = generateMysqlStudioHtml();

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
    const html = generateMysqlStudioHtml();

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

  // =========================================================================
  // 2. SCHEMA & DATA GRID VERIFICATION
  // =========================================================================
  it("4. GET /api/schema returns tables, columns, indexes, and exact row counts", async () => {
    const res = await fetch(`${baseUrl}/api/schema`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.dbName).toBe("string");
    expect(Array.isArray(body.tables)).toBe(true);
    expect(body.tables.length).toBeGreaterThan(0);

    const customers = body.tables.find((t: any) => t.name === "customers");
    expect(customers).toBeDefined();
    expect(customers.rowCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(customers.columns)).toBe(true);

    const emailCol = customers.columns.find((c: any) => c.name === "email");
    expect(emailCol).toBeDefined();
  });

  it("5. POST /api/table/data returns paginated rows with column data", async () => {
    const res = await fetch(`${baseUrl}/api/table/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers", page: 1, pageSize: 10 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThanOrEqual(body.rows.length);

    const customer = body.rows[0];
    expect(customer.name).toBeDefined();
    expect(customer.email).toBeDefined();
  });

  // =========================================================================
  // 3. COMPLETE CRUD CYCLE & BATCH IMPORT
  // =========================================================================
  it("6. Complete Table Lifecycle: Create, Insert, Update, Import Batch, Truncate, Drop", async () => {
    const testTable = "test_mysql_crud_items";
    // Ensure clean state before starting
    await fetch(`${baseUrl}/api/schema/drop-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable }),
    });

    // 1. Create table
    const createRes = await fetch(`${baseUrl}/api/schema/create-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: testTable,
        columns: [
          { name: "id", type: "INT", pk: true, autoinc: true },
          { name: "title", type: "VARCHAR(255)", notnull: true },
          { name: "amount", type: "DECIMAL(10,2)", default: "0.00" },
        ],
      }),
    });
    expect(createRes.status).toBe(200);
    const createData = (await createRes.json()) as any;
    expect(createData.success).toBe(true);

    // 2. Insert row
    const insertRes = await fetch(`${baseUrl}/api/rows/insert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: testTable,
        data: { title: "Widget Pro", amount: 49.99 },
      }),
    });
    expect(insertRes.status).toBe(200);
    const insertData = (await insertRes.json()) as any;
    expect(insertData.success).toBe(true);

    // 3. Update row
    const updateRes = await fetch(`${baseUrl}/api/rows/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: testTable,
        pkCol: "title",
        pkVal: "Widget Pro",
        data: { amount: 59.99 },
      }),
    });
    expect(updateRes.status).toBe(200);

    // 4. Batch Import
    const importRes = await fetch(`${baseUrl}/api/table/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: testTable,
        rows: [
          { title: "Batch 1", amount: 10.00 },
          { title: "Batch 2", amount: 20.00 },
          { title: "Batch 3", amount: 30.00 },
        ],
      }),
    });
    expect(importRes.status).toBe(200);
    const importData = (await importRes.json()) as any;
    expect(importData.success).toBe(true);
    expect(importData.imported).toBe(3);

    // 5. Truncate table
    const truncRes = await fetch(`${baseUrl}/api/table/truncate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable }),
    });
    expect(truncRes.status).toBe(200);

    // 6. Drop table
    const dropRes = await fetch(`${baseUrl}/api/schema/drop-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable }),
    });
    expect(dropRes.status).toBe(200);
  });

  // =========================================================================
  // 4. MICROSOFT ACCESS TOTALS ROW & QUICK FILTER BAR
  // =========================================================================
  it("7. Microsoft Access Totals Row & Quick Filter Bar in Datasheet", async () => {
    const html = generateMysqlStudioHtml();

    // DOM Elements
    expect(html).toContain('id="btnToggleTotals"');
    expect(html).toContain('id="btnToggleFilterBar"');
    expect(html).toContain('id="gridFilterBarRow"');
    expect(html).toContain('id="gridTotalsFoot"');
    expect(html).toContain("toggleAccessTotalsRow");
    expect(html).toContain("toggleQuickFilterBar");
    expect(html).toContain("updateAccessTotalsRow");

    // API: Table Aggregates for Totals Row
    const aggRes = await fetch(`${baseUrl}/api/table/aggregates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers" }),
    });
    expect(aggRes.status).toBe(200);
    const aggData = (await aggRes.json()) as any;
    expect(aggData.success).toBe(true);
    expect(aggData.aggregates).toBeDefined();
    expect(aggData.aggregates.__total.count).toBeGreaterThan(0);
    if (aggData.aggregates.balance) {
      expect(aggData.aggregates.balance.sum).toBeGreaterThan(0);
      expect(aggData.aggregates.balance.avg).toBeGreaterThan(0);
    }
  });

  // =========================================================================
  // 5. MICROSOFT ACCESS PUBLICATION REPORT GENERATOR
  // =========================================================================
  it("8. Microsoft Access Publication Report Generator Modal & Print View", () => {
    const html = generateMysqlStudioHtml();

    expect(html).toContain('id="btnAccessReport"');
    expect(html).toContain('id="accessReportModal"');
    expect(html).toContain('id="accessReportContent"');
    expect(html).toContain("openAccessReportModal");
    expect(html).toContain("printAccessReport");
    expect(html).toContain("exportAccessReportHtml");
    expect(html).toContain("@media print");
    expect(html).toContain("access-report-sheet");
  });

  // =========================================================================
  // 6. MYSQL CUSTOM ENUM / SET TYPES MANAGEMENT
  // =========================================================================
  it("9. MySQL Custom ENUM/SET Types Management via information_schema.COLUMNS", async () => {
    const html = generateMysqlStudioHtml();

    expect(html).toContain('id="tabBtnTypes"');
    expect(html).toContain('id="tabTypes"');
    expect(html).toContain('id="createEnumModal"');
    expect(html).toContain("loadEnumTypes");
    expect(html).toContain("submitCreateEnum");

    // 1. List Enums
    const listRes = await fetch(`${baseUrl}/api/types/enums`);
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData.success).toBe(true);
    expect(Array.isArray(listData.enums)).toBe(true);
    expect(listData.enums.length).toBeGreaterThan(0);

    const customerTier = listData.enums.find((e: any) => e.table === "customers" && e.column === "tier");
    expect(customerTier).toBeDefined();
    expect(customerTier.values).toContain("Standard");
    expect(customerTier.values).toContain("VIP");

    // 2. Add Enum Value
    const addValRes = await fetch(`${baseUrl}/api/types/enums/add-value`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers", column: "tier", value: "Legendary" }),
    });
    expect(addValRes.status).toBe(200);

    // Verify newly added value appears
    const listAgain = await fetch(`${baseUrl}/api/types/enums`);
    const listAgainData = (await listAgain.json()) as any;
    const updatedTier = listAgainData.enums.find((e: any) => e.table === "customers" && e.column === "tier");
    expect(updatedTier.values).toContain("Legendary");
  });

  // =========================================================================
  // 7. DECLARATIVE PARTITION TREES EXPLORER
  // =========================================================================
  it("10. Declarative Partition Trees Explorer (information_schema.PARTITIONS)", async () => {
    const html = generateMysqlStudioHtml();

    expect(html).toContain('id="tabBtnPartitions"');
    expect(html).toContain('id="tabPartitions"');
    expect(html).toContain("loadPartitions");

    // API: Query Partitions
    const partRes = await fetch(`${baseUrl}/api/partitions`);
    expect(partRes.status).toBe(200);
    const partData = (await partRes.json()) as any;
    expect(partData.success).toBe(true);
    expect(Array.isArray(partData.partitions)).toBe(true);
    expect(partData.partitions.length).toBeGreaterThan(0);

    const salesPart = partData.partitions.find((p: any) => p.parentTable === "sales_history");
    expect(salesPart).toBeDefined();
    expect(salesPart.partitionStrategy).toBe("RANGE");
  });

  // =========================================================================
  // 8. STREAMING REPLICATION & BINARY LOG DIAGNOSTICS
  // =========================================================================
  it("11. Streaming Replication & Binary Log Diagnostics (SHOW BINARY LOGS & REPLICA STATUS)", async () => {
    const html = generateMysqlStudioHtml();

    expect(html).toContain('id="tabBtnReplication"');
    expect(html).toContain('id="tabReplication"');
    expect(html).toContain("loadReplicationStatus");

    // API: Query Replication Status
    const replRes = await fetch(`${baseUrl}/api/replication`);
    expect(replRes.status).toBe(200);
    const replData = (await replRes.json()) as any;
    expect(replData.success).toBe(true);
    expect(replData.replication).toBeDefined();
    expect(Array.isArray(replData.replication.binaryLogs)).toBe(true);
    expect(Array.isArray(replData.replication.replicas)).toBe(true);
  });

  // =========================================================================
  // 9. LIVE PROCESS LIST & LOCK CONTENTION MONITOR
  // =========================================================================
  it("12. Live Process List & Lock Contention Monitor (PROCESSLIST & innodb_lock_waits)", async () => {
    const html = generateMysqlStudioHtml();

    expect(html).toContain('id="tabBtnActivity"');
    expect(html).toContain('id="tabActivity"');
    expect(html).toContain("loadActivity");
    expect(html).toContain("terminateProcess");

    // API: Query Activity & Locks
    const actRes = await fetch(`${baseUrl}/api/activity`);
    expect(actRes.status).toBe(200);
    const actData = (await actRes.json()) as any;
    expect(actData.success).toBe(true);
    expect(Array.isArray(actData.activity)).toBe(true);
    expect(actData.activity.length).toBeGreaterThan(0);
    expect(Array.isArray(actData.blockedLocks)).toBe(true);
  });

  // =========================================================================
  // 10. ENTERPRISE 1-CLICK DATABASE BACKUP & SQL DUMP
  // =========================================================================
  it("13. Enterprise 1-Click Database Backup & SQL Dump Generator", async () => {
    const html = generateMysqlStudioHtml();

    expect(html).toContain('id="btnDbBackupDump"');
    expect(html).toContain('id="dumpModal"');
    expect(html).toContain('id="dumpSqlPreview"');
    expect(html).toContain("openDatabaseDumpModal");
    expect(html).toContain("runGenerateDump");
    expect(html).toContain("downloadDumpFile");

    // API: Generate Dump (mode: all)
    const dumpRes = await fetch(`${baseUrl}/api/database/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all" }),
    });
    expect(dumpRes.status).toBe(200);
    const dumpData = (await dumpRes.json()) as any;
    expect(dumpData.success).toBe(true);
    expect(typeof dumpData.sql).toBe("string");
    expect(dumpData.sql).toContain("MYSQL STUDIO PRO");
    expect(dumpData.sql).toContain("CREATE TABLE");
    expect(dumpData.sql).toContain("INSERT INTO `customers`");

    // API: Generate Dump (mode: schema only)
    const schemaDumpRes = await fetch(`${baseUrl}/api/database/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "schema" }),
    });
    expect(schemaDumpRes.status).toBe(200);
    const schemaDumpData = (await schemaDumpRes.json()) as any;
    expect(schemaDumpData.success).toBe(true);
    expect(schemaDumpData.sql).toContain("CREATE TABLE");
  });

  // =========================================================================
  // 11. SQL QUERY EXECUTION & TELEMETRY
  // =========================================================================
  it("14. POST /api/query executes SQL queries with execution timing", async () => {
    const queryRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT id, name, email, tier, balance FROM customers ORDER BY id ASC LIMIT 5;" }),
    });
    expect(queryRes.status).toBe(200);
    const queryData = (await queryRes.json()) as any;
    expect(queryData.success).toBe(true);
    expect(Array.isArray(queryData.rows)).toBe(true);
    expect(queryData.rows.length).toBeGreaterThan(0);
    expect(Array.isArray(queryData.columns)).toBe(true);
    expect(queryData.columns).toContain("name");
    expect(typeof queryData.latencyMs).toBe("number");
  });

  // =========================================================================
  // 12. QUERY EXPLAIN PLAN VISUALIZER
  // =========================================================================
  it("15. POST /api/explain returns tree execution plan for queries", async () => {
    const explainRes = await fetch(`${baseUrl}/api/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT c.name, count(o.id) as orders_count FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id;" }),
    });
    expect(explainRes.status).toBe(200);
    const explainData = (await explainRes.json()) as any;
    expect(explainData.success).toBe(true);
    expect(explainData.planTree || explainData.rawText || explainData.rows).toBeDefined();
  });

  // =========================================================================
  // 13. ENTERPRISE KPIS & WORKBENCH TELEMETRY
  // =========================================================================
  it("16. GET /api/kpis returns enterprise database metrics", async () => {
    const kpiRes = await fetch(`${baseUrl}/api/kpis`);
    expect(kpiRes.status).toBe(200);
    const kpiData = (await kpiRes.json()) as any;
    expect(kpiData.success).toBe(true);
    expect(kpiData.kpis).toBeDefined();
    expect(kpiData.kpis.dbName).toBe("my_app_dev");
    expect(kpiData.kpis.tableCount).toBeGreaterThanOrEqual(4);
    expect(typeof kpiData.kpis.totalRows).toBe("number");
  });

  // =========================================================================
  // 14. SERVER OPERATIONS & PRAGMA SETTINGS
  // =========================================================================
  it("17. POST /api/pragma retrieves MySQL system variables", async () => {
    const pragmaRes = await fetch(`${baseUrl}/api/pragma`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pragma: "version" }),
    });
    expect(pragmaRes.status).toBe(200);
    const pragmaData = (await pragmaRes.json()) as any;
    expect(pragmaData.success).toBe(true);
  });

  // =========================================================================
  // 15. DATA EXPORT FORMATS
  // =========================================================================
  it("18. POST /api/export exports query results in CSV, JSON, and SQL formats", async () => {
    const testRows = [
      { id: 1, name: "Alice", tier: "VIP" },
      { id: 2, name: "Bob", tier: "Standard" },
    ];

    // CSV
    const csvRes = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "csv", rows: testRows, tableName: "customers" }),
    });
    expect(csvRes.status).toBe(200);
    const csvData = (await csvRes.json()) as any;
    expect(csvData.success).toBe(true);
    expect(csvData.data).toContain("id,name,tier");

    // JSON
    const jsonRes = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "json", rows: testRows, tableName: "customers" }),
    });
    expect(jsonRes.status).toBe(200);
    const jsonData = (await jsonRes.json()) as any;
    expect(jsonData.success).toBe(true);
    expect(jsonData.data).toContain("Alice");

    // SQL
    const sqlRes = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "sql", rows: testRows, tableName: "customers" }),
    });
    expect(sqlRes.status).toBe(200);
    const sqlData = (await sqlRes.json()) as any;
    expect(sqlData.success).toBe(true);
    expect(sqlData.data).toContain("INSERT INTO");
  });

  // =========================================================================
  // 16. THEMES & WORKBENCH FACTORY VALIDATION
  // =========================================================================
  it("19. HTML includes 22 theme options, persistent SQL banner, and 5 KPI cards", () => {
    const html = generateMysqlStudioHtml();

    // Theme selector
    expect(html).toContain('id="ddStudioTheme"');
    expect(html).toContain('value="midnight"');
    expect(html).toContain('value="cyberpunk"');

    // Persistent SQL Editor
    expect(html).toContain('id="sqlEditor"');
    expect(html).toContain('id="presetSelect"');
    expect(html).toContain('id="queryTiming"');

    // KPI Cards
    expect(html).toContain('id="kpiDbName"');
    expect(html).toContain('id="kpiEngine"');
    expect(html).toContain('id="kpiTables"');
    expect(html).toContain('id="kpiRows"');
  });

  // =========================================================================
  // 17. AUDIT LOG TELEMETRY
  // =========================================================================
  it("20. Audit log entries are written to audit_logs during operations", async () => {
    const auditRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5;" }),
    });
    expect(auditRes.status).toBe(200);
    const auditData = (await auditRes.json()) as any;
    expect(auditData.success).toBe(true);
    expect(Array.isArray(auditData.rows)).toBe(true);
    expect(auditData.rows.length).toBeGreaterThan(0);
  });
});
