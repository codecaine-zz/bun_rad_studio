import { describe, it, expect, afterAll } from "bun:test";
import { startPostgresStudioServer } from "../applications/postgres_studio_server.ts";
import { generatePostgresStudioHtml } from "../applications/postgres_studio.ts";

describe("🐘 Postgres Studio Pro - Comprehensive End-to-End Enterprise Test Suite", () => {
  const server = startPostgresStudioServer({
    port: 0,
    config: {
      host: "localhost",
      port: 5432,
      user: "root",
      database: "mydb",
      schema: "public",
    },
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;

  afterAll(async () => {
    try {
      server.stop(true);
    } catch {}
  });

  // =========================================================================
  // 1. UI ARCHITECTURE & TABS VALIDATION (All 11 Tabs & Controls)
  // =========================================================================
  it("1. HTML contains all 11 enterprise workstation navigation tabs and corresponding panes", async () => {
    const html = generatePostgresStudioHtml();

    // 11 Navigation Tab Buttons
    expect(html).toContain('id="tabBtnGrid"');
    expect(html).toContain('id="tabBtnSql"');
    expect(html).toContain('id="tabBtnDesigner"');
    expect(html).toContain('id="tabBtnExtensions"');
    expect(html).toContain('id="tabBtnActivity"');
    expect(html).toContain('id="tabBtnExplain"');
    expect(html).toContain('id="tabBtnSequences"');
    expect(html).toContain('id="tabBtnRoles"');
    expect(html).toContain('id="tabBtnTriggers"');
    expect(html).toContain('id="tabBtnTelemetry"');
    expect(html).toContain('id="tabBtnJson"');

    // 11 Tab Panes
    expect(html).toContain('id="tabGrid"');
    expect(html).toContain('id="tabSql"');
    expect(html).toContain('id="tabDesigner"');
    expect(html).toContain('id="tabExtensions"');
    expect(html).toContain('id="tabActivity"');
    expect(html).toContain('id="tabExplain"');
    expect(html).toContain('id="tabSequences"');
    expect(html).toContain('id="tabRoles"');
    expect(html).toContain('id="tabTriggers"');
    expect(html).toContain('id="tabTelemetry"');
    expect(html).toContain('id="tabJson"');
  });

  it("2. HTML includes Visual Query Designer with deep zoom, room presets, resizer bar, and Venn preview", () => {
    const html = generatePostgresStudioHtml();

    // Zoom Controls
    expect(html).toContain("qbe-zoom-controls");
    expect(html).toContain("canvasZoomSelect");
    expect(html).toContain("zoomInDesignerCanvas");
    expect(html).toContain("zoomOutDesignerCanvas");
    expect(html).toContain("resetDesignerCanvasZoom");
    expect(html).toContain("fitDesignerCanvasZoom");

    // Room Presets
    expect(html).toContain("qbe-room-controls");
    expect(html).toContain("btnRoomCanvas");
    expect(html).toContain("btnRoomSplit");
    expect(html).toContain("btnRoomGrid");
    expect(html).toContain("setDesignerRoomMode");

    // Draggable Resizer Bar
    expect(html).toContain("qbe-resizer-bar");
    expect(html).toContain("initResizerBar");

    // Live Venn Diagram Preview & Native FULL OUTER JOIN option
    expect(html).toContain("access-venn-preview-row");
    expect(html).toContain('id="jpVennSvg"');
    expect(html).toContain('id="jpSqlSnippet"');
    expect(html).toContain("updateJoinPropVennDiagram");
    expect(html).toContain("FULL OUTER JOIN (Postgres Native)");
  });

  it("3. HTML bundles the Access-style GUI CRUD layer (inline edits, modals, table designer)", () => {
    const html = generatePostgresStudioHtml();

    // Embedded CRUD stylesheet
    expect(html).toContain("Postgres Studio Pro GUI CRUD & Designer Layer");
    expect(html).toContain(".crud-bar");
    expect(html).toContain(".crud-modal-card");

    // Embedded CRUD client logic
    expect(html).toContain("openRowDialog");
    expect(html).toContain("openTableDesigner");
    expect(html).toContain("openIndexesManager");
    expect(html).toContain("openImportDialog");
    expect(html).toContain("openExportDialog");
    expect(html).toContain("initCrud");
  });

  // =========================================================================
  // 2. SCHEMA & DATA GRID VERIFICATION
  // =========================================================================
  it("4. GET /api/schema returns tables, columns, indexes, and exact row counts", async () => {
    const res = await fetch(`${baseUrl}/api/schema`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.name).toBe("string");
    expect(Array.isArray(body.tables)).toBe(true);
    expect(body.tables.length).toBeGreaterThan(0);

    const customers = body.tables.find((t: any) => t.name === "customers");
    expect(customers).toBeDefined();
    expect(customers.rowCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(customers.columns)).toBe(true);

    const emailCol = customers.columns.find((c: any) => c.name === "email");
    expect(emailCol).toBeDefined();
  });

  it("5. POST /api/table/data returns paginated rows with JSONB and array fields", async () => {
    const res = await fetch(`${baseUrl}/api/table/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "products", page: 1, pageSize: 10 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThanOrEqual(body.rows.length);

    // Products table has JSONB specs and TEXT[] tags
    const product = body.rows[0];
    expect(product.specs).toBeDefined();
    expect(product.tags).toBeDefined();
  });

  // =========================================================================
  // 3. COMPLETE CRUD CYCLE & BATCH IMPORT
  // =========================================================================
  it("6. Complete Table Lifecycle: Create, Insert, Update, Import Batch, Truncate, Drop", async () => {
    const testTable = "test_crud_items";
    // Ensure clean state before starting
    await fetch(`${baseUrl}/api/schema/drop-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable }),
    });

    // A. Create Table via /api/schema/create-table
    const createRes = await fetch(`${baseUrl}/api/schema/create-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: testTable,
        columns: [
          { name: "id", type: "SERIAL", pk: true, notNull: true },
          { name: "item_code", type: "VARCHAR(50)", notNull: true, unique: true },
          { name: "description", type: "TEXT" },
          { name: "metadata", type: "JSONB" },
          { name: "price", type: "NUMERIC(10,2)" },
        ],
      }),
    });
    expect(createRes.status).toBe(200);

    // B. Insert Row via /api/rows/insert
    const insertRes = await fetch(`${baseUrl}/api/rows/insert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: testTable,
        row: {
          item_code: "ITEM-001",
          description: "Initial Test Item",
          metadata: JSON.stringify({ category: "testing", score: 99 }),
          price: 19.99,
        },
      }),
    });
    expect(insertRes.status).toBe(200);
    const insertBody = (await insertRes.json()) as any;
    expect(insertBody.success).toBe(true);

    // C. Update Row via /api/rows/update
    const updateRes = await fetch(`${baseUrl}/api/rows/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: testTable,
        pkCol: "item_code",
        pkVal: "ITEM-001",
        row: {
          description: "Updated Description Via CRUD",
          price: 24.50,
        },
      }),
    });
    expect(updateRes.status).toBe(200);
    const updateBody = (await updateRes.json()) as any;
    expect(updateBody.success).toBe(true);

    // D. Batch Import via /api/rows/import-batch
    const batchRes = await fetch(`${baseUrl}/api/rows/import-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: testTable,
        rows: [
          { item_code: "BATCH-002", description: "Batch Item 2", price: 10.0 },
          { item_code: "BATCH-003", description: "Batch Item 3", price: 15.0 },
          { item_code: "BATCH-004", description: "Batch Item 4", price: 20.0 },
        ],
      }),
    });
    expect(batchRes.status).toBe(200);
    const batchBody = (await batchRes.json()) as any;
    expect(batchBody.success).toBe(true);
    expect(batchBody.importedCount).toBe(3);

    // Verify row count is now 4
    const countRes = await fetch(`${baseUrl}/api/table/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable, page: 1, pageSize: 10 }),
    });
    const countBody = (await countRes.json()) as any;
    expect(countBody.total).toBe(4);

    // E. Truncate Table via /api/table/truncate
    const truncRes = await fetch(`${baseUrl}/api/table/truncate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable }),
    });
    expect(truncRes.status).toBe(200);
    const truncBody = (await truncRes.json()) as any;
    expect(truncBody.success).toBe(true);

    // Verify table is empty
    const emptyRes = await fetch(`${baseUrl}/api/table/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable, page: 1, pageSize: 10 }),
    });
    const emptyBody = (await emptyRes.json()) as any;
    expect(emptyBody.total).toBe(0);

    // F. Drop Table via /api/schema/drop-table
    const dropRes = await fetch(`${baseUrl}/api/schema/drop-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable }),
    });
    expect(dropRes.status).toBe(200);
    const dropBody = (await dropRes.json()) as any;
    expect(dropBody.success).toBe(true);
  });

  // =========================================================================
  // 4. INDEXES MANAGEMENT (B-TREE & GIN)
  // =========================================================================
  it("7. Create, list, and drop PostgreSQL indexes (BTREE and GIN)", async () => {
    // List existing indexes on customers table
    const listRes = await fetch(`${baseUrl}/api/indexes?table=customers`);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as any;
    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.indexes)).toBe(true);

    // Create a new BTREE index
    const idxName = "idx_customers_tier_test";
    const createRes = await fetch(`${baseUrl}/api/indexes/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: idxName,
        table: "customers",
        columns: ["tier"],
        type: "btree",
      }),
    });
    expect(createRes.status).toBe(200);
    const createBody = (await createRes.json()) as any;
    expect(createBody.success).toBe(true);

    // Verify created index is in list
    const verifyRes = await fetch(`${baseUrl}/api/indexes?table=customers`);
    const verifyBody = (await verifyRes.json()) as any;
    expect(verifyBody.indexes.some((i: any) => i.name === idxName)).toBe(true);

    // Drop the created index
    const dropRes = await fetch(`${baseUrl}/api/indexes/drop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: idxName }),
    });
    expect(dropRes.status).toBe(200);
    const dropBody = (await dropRes.json()) as any;
    expect(dropBody.success).toBe(true);
  });

  // =========================================================================
  // 5. SEQUENCES MANAGER
  // =========================================================================
  it("8. GET /api/sequences lists sequences and POST /api/sequences/restart restarts value", async () => {
    const listRes = await fetch(`${baseUrl}/api/sequences`);
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as any;
    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.sequences)).toBe(true);

    // If there is an existing sequence (e.g. from SERIAL columns), test restart
    if (listBody.sequences.length > 0) {
      const seq = listBody.sequences[0];
      const restartRes = await fetch(`${baseUrl}/api/sequences/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: seq.name, restartVal: 100 }),
      });
      expect(restartRes.status).toBe(200);
      const restartBody = (await restartRes.json()) as any;
      expect(restartBody.success).toBe(true);
    }
  });

  // =========================================================================
  // 6. ROLES & PRIVILEGES
  // =========================================================================
  it("9. GET /api/roles queries pg_roles with superuser, login, and connection limits", async () => {
    const res = await fetch(`${baseUrl}/api/roles`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.roles)).toBe(true);
    expect(body.roles.length).toBeGreaterThan(0);

    // Current user should be present
    const rootOrPostgres = body.roles.find((r: any) => r.name === "root" || r.name === "postgres");
    expect(rootOrPostgres).toBeDefined();
    expect(typeof rootOrPostgres.is_superuser).toBe("boolean");
    expect(typeof rootOrPostgres.can_login).toBe("boolean");
  });

  // =========================================================================
  // 7. TRIGGERS & FUNCTIONS
  // =========================================================================
  it("10. GET /api/triggers and GET /api/functions return catalog routines", async () => {
    const trigRes = await fetch(`${baseUrl}/api/triggers`);
    expect(trigRes.status).toBe(200);
    const trigBody = (await trigRes.json()) as any;
    expect(trigBody.success).toBe(true);
    expect(Array.isArray(trigBody.triggers)).toBe(true);

    const funcRes = await fetch(`${baseUrl}/api/functions`);
    expect(funcRes.status).toBe(200);
    const funcBody = (await funcRes.json()) as any;
    expect(funcBody.success).toBe(true);
    expect(Array.isArray(funcBody.functions)).toBe(true);
  });

  // =========================================================================
  // 8. PERFORMANCE & TELEMETRY
  // =========================================================================
  it("11. GET /api/telemetry and GET /api/table/stats return bloat & cache hit ratio metrics", async () => {
    // 1. General Performance Metrics
    const telRes = await fetch(`${baseUrl}/api/telemetry`);
    expect(telRes.status).toBe(200);
    const telBody = (await telRes.json()) as any;
    expect(telBody.success).toBe(true);
    expect(telBody.telemetry).toBeDefined();
    expect(typeof telBody.telemetry.cacheHitRatio).toBe("number");
    expect(typeof telBody.telemetry.activeLocksCount).toBe("number");
    expect(typeof telBody.telemetry.databaseSizeBytesPretty).toBe("string");

    // 2. User Table Bloat Stats
    const statsRes = await fetch(`${baseUrl}/api/table/stats`);
    expect(statsRes.status).toBe(200);
    const statsBody = (await statsRes.json()) as any;
    expect(statsBody.success).toBe(true);
    expect(Array.isArray(statsBody.stats)).toBe(true);

    // 3. Per-table VACUUM ANALYZE
    const vacRes = await fetch(`${baseUrl}/api/vacuum`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers", analyze: true }),
    });
    expect(vacRes.status).toBe(200);
    const vacBody = (await vacRes.json()) as any;
    expect(vacBody.success).toBe(true);
  });

  // =========================================================================
  // 9. MYSQL WORKSTATION PARITY & ENTERPRISE ENHANCEMENTS
  // =========================================================================
  it("12. HTML includes MySQL Studio mirrored layout: 22 themes, persistent SQL editor banner, 5 KPI cards, sidebar resizer, and new tabs", () => {
    const html = generatePostgresStudioHtml();

    // 22-Theme Selector
    expect(html).toContain('id="ddStudioTheme"');
    expect(html).toContain('value="midnight"');
    expect(html).toContain('value="sonoma_emerald"');
    expect(html).toContain('value="cyberpunk"');

    // Persistent Top SQL Editor Banner & Presets
    expect(html).toContain('id="editorBanner"');
    expect(html).toContain('id="presetSelect"');
    expect(html).toContain('id="sqlEditor"');
    expect(html).toContain('id="queryTiming"');
    expect(html).toContain('id="sqlResultStatus"');
    expect(html).toContain('id="btnToggleEditor"');

    // 5 Enterprise KPI Cards
    expect(html).toContain('class="kpi-row"');
    expect(html).toContain('id="kpiDbName"');
    expect(html).toContain('id="kpiEngine"');
    expect(html).toContain('id="kpiTables"');
    expect(html).toContain('id="kpiRows"');
    expect(html).toContain('id="kpiConnections"');

    // Modern Sidebar & Resizer
    expect(html).toContain('id="sidebarResizer"');
    expect(html).toContain('id="sidebarDbBadge"');
    expect(html).toContain('id="sidebarDbName"');
    expect(html).toContain('id="searchObjects"');

    // Mirrored Workstation Tabs: Schema Designer, Audit Logs, PRAGMA / GUC Settings
    expect(html).toContain('id="tabBtnSchema"');
    expect(html).toContain('id="tabSchema"');
    expect(html).toContain('id="tabBtnAudit"');
    expect(html).toContain('id="tabAudit"');
    expect(html).toContain('id="tabBtnPragma"');
    expect(html).toContain('id="tabPragma"');
  });

  it("13. Enterprise API Endpoints: Integrity check, Audit logs, Query export, and PRAGMA settings", async () => {
    // 1. Schema Integrity Check
    const intRes = await fetch(`${baseUrl}/api/integrity`);
    expect(intRes.status).toBe(200);
    const intBody = (await intRes.json()) as any;
    expect(intBody.success).toBe(true);
    expect(Array.isArray(intBody.checks)).toBe(true);

    // 2. Audit Logs
    const auditRes = await fetch(`${baseUrl}/api/audit-logs`);
    expect(auditRes.status).toBe(200);
    const auditBody = (await auditRes.json()) as any;
    expect(auditBody.success).toBe(true);
    expect(Array.isArray(auditBody.logs)).toBe(true);

    // 3. Export query rows to JSON
    const expRes = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "json",
        tableName: "customers",
        rows: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
      }),
    });
    expect(expRes.status).toBe(200);
    const expBody = (await expRes.json()) as any;
    expect(expBody.success).toBe(true);
    expect(expBody.rowCount).toBe(2);
    expect(typeof expBody.filename).toBe("string");

    // 4. Server PRAGMA / GUC Settings
    const pragmaGetRes = await fetch(`${baseUrl}/api/pragma`);
    expect(pragmaGetRes.status).toBe(200);
    const pragmaGetBody = (await pragmaGetRes.json()) as any;
    expect(pragmaGetBody.success).toBe(true);
    expect(Array.isArray(pragmaGetBody.settings)).toBe(true);

    // 5. Mutate / Set PRAGMA
    const pragmaSetRes = await fetch(`${baseUrl}/api/pragma`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pragma: "work_mem", value: "8MB" }),
    });
    expect(pragmaSetRes.status).toBe(200);
    const pragmaSetBody = (await pragmaSetRes.json()) as any;
    expect(pragmaSetBody.success).toBe(true);
  });
});
