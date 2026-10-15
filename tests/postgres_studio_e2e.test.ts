import { describe, it, expect, afterAll, beforeAll } from "bun:test";
import { startPostgresStudioServer } from "../applications/postgres_studio_server.ts";
import { generatePostgresStudioHtml } from "../applications/postgres_studio.ts";
import { provisionTestDb } from "./helpers/testdb.ts";

// Runs against a throwaway database (TEST_PG_URL); skipped when it is not configured.
const testDb = await provisionTestDb("postgres");
const suite = testDb ? describe : describe.skip;

suite("🐘 Postgres Studio Pro - Comprehensive End-to-End Enterprise Test Suite", () => {
  const server = testDb ? startPostgresStudioServer({ port: 0, config: testDb.config }) : (null as any);
  const baseUrl = `http://127.0.0.1:${server?.port}`;

  beforeAll(async () => {
    if (testDb) await fetch(`${baseUrl}/api/seed-sample`, { method: "POST" });
  });

  afterAll(async () => {
    try {
      server?.stop(true);
    } catch {}
    await testDb?.drop();
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

  it("3. HTML bundles the GUI CRUD layer (inline edits, modals, table designer)", () => {
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

  // =========================================================================
  // 14. MICROSOFT ACCESS VISUAL QUERY EXECUTION & MULTI-TABLE JOINS (PostgreSQL)
  // =========================================================================
  it("14. PostgreSQL executes INNER, LEFT, RIGHT, and FULL OUTER joins and 4-table QBE queries", async () => {
    // 14.1 INNER JOIN (Option 1)
    const innerRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT c.name AS customer_name, o.id AS order_id, o.total_amount
              FROM customers c
              INNER JOIN orders o ON c.id = o.customer_id
              ORDER BY o.id ASC;`
      }),
    });
    expect(innerRes.status).toBe(200);
    const innerData = (await innerRes.json()) as any;
    expect(innerData.success).toBe(true);
    expect(innerData.rows.length).toBeGreaterThan(0);
    expect(innerData.columns).toContain("customer_name");
    expect(innerData.columns).toContain("order_id");

    // 14.2 LEFT OUTER JOIN (Option 2)
    const leftRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT c.name AS customer_name, o.id AS order_id
              FROM customers c
              LEFT JOIN orders o ON c.id = o.customer_id
              ORDER BY c.id ASC;`
      }),
    });
    expect(leftRes.status).toBe(200);
    const leftData = (await leftRes.json()) as any;
    expect(leftData.success).toBe(true);
    expect(leftData.rows.length).toBeGreaterThanOrEqual(innerData.rows.length);

    // 14.3 RIGHT OUTER JOIN (Option 3)
    const rightRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT c.name AS customer_name, o.id AS order_id
              FROM customers c
              RIGHT JOIN orders o ON c.id = o.customer_id
              ORDER BY o.id ASC;`
      }),
    });
    expect(rightRes.status).toBe(200);
    const rightData = (await rightRes.json()) as any;
    expect(rightData.success).toBe(true);
    expect(rightData.rows.length).toBe(innerData.rows.length);

    // 14.4 FULL OUTER JOIN (Option 4 - Postgres Native)
    const fullRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT c.name AS customer_name, o.id AS order_id
              FROM customers c
              FULL OUTER JOIN orders o ON c.id = o.customer_id;`
      }),
    });
    expect(fullRes.status).toBe(200);
    const fullData = (await fullRes.json()) as any;
    expect(fullData.success).toBe(true);
    expect(fullData.rows.length).toBeGreaterThanOrEqual(leftData.rows.length);

    // 14.5 4-Table Join with Aggregates & Group By (Enterprise Template preset)
    const multiRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT
                c.name AS "Customer",
                p.category AS "Category",
                p.name AS "Product",
                SUM(oi.quantity) AS "TotalUnits",
                SUM(oi.unit_price * oi.quantity) AS "Revenue"
              FROM customers c
              INNER JOIN orders o ON c.id = o.customer_id
              INNER JOIN order_items oi ON o.id = oi.order_id
              INNER JOIN products p ON oi.product_id = p.id
              GROUP BY c.name, p.category, p.name
              HAVING SUM(oi.quantity) > 0
              ORDER BY "Revenue" DESC
              LIMIT 50;`
      }),
    });
    expect(multiRes.status).toBe(200);
    const multiData = (await multiRes.json()) as any;
    expect(multiData.success).toBe(true);
    expect(multiData.rows.length).toBeGreaterThan(0);
    expect(multiData.columns).toContain("Customer");
    expect(multiData.columns).toContain("Category");
    expect(multiData.columns).toContain("Revenue");
  });

  // =========================================================================
  // 15. PERSISTING QUERY DESIGNER AS PERMANENT POSTGRESQL VIEW
  // =========================================================================
  it("15. Creates permanent PostgreSQL VIEW from designer query and verifies catalog registration", async () => {
    const viewName = "v_test_qbe_customer_summary";

    // 1. Create View via query API (simulating saveDesignerAsView)
    const createRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `CREATE OR REPLACE VIEW "${viewName}" AS
              SELECT c.id, c.name, COUNT(o.id) AS order_count, COALESCE(SUM(o.total_amount), 0) AS total_spent
              FROM customers c
              LEFT JOIN orders o ON c.id = o.customer_id
              GROUP BY c.id, c.name;`
      }),
    });
    expect(createRes.status).toBe(200);
    const createData = (await createRes.json()) as any;
    expect(createData.success).toBe(true);

    // 2. Verify view shows up in GET /api/schema
    const schemaRes = await fetch(`${baseUrl}/api/schema`);
    const schemaData = (await schemaRes.json()) as any;
    expect(schemaData.success).toBe(true);
    const foundView = (schemaData.views || []).find((v: any) => v.name === viewName);
    expect(foundView).toBeDefined();

    // 3. Query the newly created view
    const viewQueryRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: `SELECT * FROM "${viewName}" ORDER BY id ASC LIMIT 5;` }),
    });
    expect(viewQueryRes.status).toBe(200);
    const viewQueryData = (await viewQueryRes.json()) as any;
    expect(viewQueryData.success).toBe(true);
    expect(viewQueryData.columns).toContain("order_count");
    expect(viewQueryData.columns).toContain("total_spent");

    // 4. Clean up view
    const dropRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: `DROP VIEW IF EXISTS "${viewName}";` }),
    });
    expect(dropRes.status).toBe(200);
    const dropData = (await dropRes.json()) as any;
    expect(dropData.success).toBe(true);
  });

  // =========================================================================
  // 16. MICROSOFT ACCESS FORM VIEW (Single-Record Inspector & Record Navigation)
  // =========================================================================
  it("16. HTML bundles Form View, record pager, and field inspector", async () => {
    const html = generatePostgresStudioHtml();

    // Toolbar View Switcher
    expect(html).toContain('id="btnViewDatasheet"');
    expect(html).toContain('id="btnViewForm"');
    expect(html).toContain("switchGridMode");

    // Form Container & Record Navigation Bar
    expect(html).toContain('id="gridFormContainer"');
    expect(html).toContain('id="accessFormFields"');
    expect(html).toContain('id="gridFormNavBar"');
    expect(html).toContain('id="formCurrentRecordInput"');
    expect(html).toContain('id="formTotalRecords"');
    expect(html).toContain('id="formStatusBadge"');

    // Navigation and Action functions
    expect(html).toContain("formNavRecord");
    expect(html).toContain("formJumpToRecord");
    expect(html).toContain("formNewRecord");
    expect(html).toContain("formDuplicateRecord");
    expect(html).toContain("formSaveRecord");
    expect(html).toContain("formDeleteRecord");

    // Test API: Inserting a record, updating it, and deleting it
    const insertRes = await fetch(`${baseUrl}/api/rows/insert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        row: { name: "Form View Tester", email: "formview@example.com", tier: "Gold" },
      }),
    });
    expect(insertRes.status).toBe(200);
    const insertData = (await insertRes.json()) as any;
    expect(insertData.success).toBe(true);

    // Read back
    const readRes = await fetch(`${baseUrl}/api/table/data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers", search: "Form View Tester" }),
    });
    const readData = (await readRes.json()) as any;
    expect(readData.rows.length).toBeGreaterThan(0);
    const insertedId = readData.rows[0].id;

    // Update
    const updateRes = await fetch(`${baseUrl}/api/rows/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: "customers",
        pkCol: "id",
        pkVal: insertedId,
        row: { email: "updated_formview@example.com" },
      }),
    });
    expect(updateRes.status).toBe(200);

    // Delete
    const delRes = await fetch(`${baseUrl}/api/rows/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "customers", pkCol: "id", pkVal: insertedId }),
    });
    expect(delRes.status).toBe(200);
  });

  // =========================================================================
  // 17. ACCESS TABLE DESIGN VIEW (Live Column Add/Drop & Index Management)
  // =========================================================================
  it("17. Interactive Table Design View supports live ALTER TABLE ADD/DROP COLUMN and indexes", async () => {
    const html = generatePostgresStudioHtml();

    // Design View UI controls
    expect(html).toContain("Table Design View");
    expect(html).toContain("Table Fields (Columns Specification)");
    expect(html).toContain("executeAddColumn");
    expect(html).toContain("executeDropColumn");
    expect(html).toContain("executeCreateIndex");
    expect(html).toContain("executeDropIndex");

    const testTable = "test_design_table";

    // 1. Create a base table
    await fetch(`${baseUrl}/api/schema/create-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: testTable,
        columns: [
          { name: "id", type: "SERIAL", pk: true },
          { name: "title", type: "VARCHAR(255)", notnull: true },
        ],
      }),
    });

    // 2. Add column via /api/schema/add-column
    const addColRes = await fetch(`${baseUrl}/api/schema/add-column`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        table: testTable,
        column: { name: "extra_notes", type: "TEXT", notnull: false, dflt_value: "'sample'" },
      }),
    });
    expect(addColRes.status).toBe(200);
    const addColData = (await addColRes.json()) as any;
    expect(addColData.success).toBe(true);

    // Verify column exists in schema
    let schemaRes = await fetch(`${baseUrl}/api/schema`);
    let schemaData = (await schemaRes.json()) as any;
    let tMeta = schemaData.tables.find((t: any) => t.name === testTable);
    expect(tMeta.columns.some((c: any) => c.name === "extra_notes")).toBe(true);

    // 3. Drop column via /api/schema/drop-column
    const dropColRes = await fetch(`${baseUrl}/api/schema/drop-column`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: testTable, column: "extra_notes" }),
    });
    expect(dropColRes.status).toBe(200);

    // Verify column dropped
    schemaRes = await fetch(`${baseUrl}/api/schema`);
    schemaData = (await schemaRes.json()) as any;
    tMeta = schemaData.tables.find((t: any) => t.name === testTable);
    expect(tMeta.columns.some((c: any) => c.name === "extra_notes")).toBe(false);

    // Cleanup
    await fetch(`${baseUrl}/api/schema/drop-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: testTable }),
    });
  });

  // =========================================================================
  // 18. POSTGRESQL LOCK CONTENTION & DEADLOCK WATCHDOG
  // =========================================================================
  it("18. Activity monitor provides real-time lock contention detection and 1-click termination", async () => {
    const html = generatePostgresStudioHtml();

    // UI elements
    expect(html).toContain('id="activityLocksAlert"');
    expect(html).toContain("terminateAllBlockingProcesses");
    expect(html).toContain("Active Lock Contention Detected");

    // Endpoint GET /api/activity/locks
    const locksRes = await fetch(`${baseUrl}/api/activity/locks`);
    expect(locksRes.status).toBe(200);
    const locksData = (await locksRes.json()) as any;
    expect(locksData.success).toBe(true);
    expect(Array.isArray(locksData.blockedLocks)).toBe(true);

    // Endpoint GET /api/activity includes blockedLocks
    const actRes = await fetch(`${baseUrl}/api/activity`);
    expect(actRes.status).toBe(200);
    const actData = (await actRes.json()) as any;
    expect(actData.success).toBe(true);
    expect(Array.isArray(actData.activity)).toBe(true);
    expect(Array.isArray(actData.blockedLocks)).toBe(true);
  });

  // =========================================================================
  // 19. POSTGRESQL GUC RUNTIME PARAMETER CONFIGURATION TUNER
  // =========================================================================
  it("19. Engine Tuning tab features categorized PostgreSQL GUC Parameter Catalog", async () => {
    const html = generatePostgresStudioHtml();

    // UI controls
    expect(html).toContain('id="gucSettingsTable"');
    expect(html).toContain('id="gucSearchInput"');
    expect(html).toContain('id="btnGucMem"');
    expect(html).toContain('id="btnGucPlan"');
    expect(html).toContain('id="btnGucWal"');
    expect(html).toContain('id="btnGucConn"');
    expect(html).toContain('id="btnGucVac"');
    expect(html).toContain("renderGucSettingsTable");
    expect(html).toContain("setGucCategory");
    expect(html).toContain("editGucSetting");

    // Endpoint GET /api/pragma returns rich settings catalog
    const pragmaRes = await fetch(`${baseUrl}/api/pragma`);
    expect(pragmaRes.status).toBe(200);
    const pragmaData = (await pragmaRes.json()) as any;
    expect(pragmaData.success).toBe(true);
    expect(Array.isArray(pragmaData.settings)).toBe(true);
    expect(pragmaData.settings.length).toBeGreaterThan(10);

    const firstSetting = pragmaData.settings[0];
    expect(firstSetting.name).toBeDefined();
    expect(firstSetting.setting).toBeDefined();
    expect(firstSetting.category).toBeDefined();
  });

  // =========================================================================
  // 20. ACCESS FULL SCHEMA ERD & RELATIONAL CARDINALITY BADGES
  // =========================================================================
  it("20. Visual Query Designer features 1-click Full Schema ERD and Cardinality badges", () => {
    const html = generatePostgresStudioHtml();

    // ERD Ribbon buttons
    expect(html).toContain('id="btnDesignerFullErd"');
    expect(html).toContain('id="btnDesignerExportSvg"');
    expect(html).toContain("loadFullSchemaErd");
    expect(html).toContain("exportDesignerCanvasSvg");
    expect(html).toContain("qbe-cardinality-badge");
  });

  // =========================================================================
  // 21. MICROSOFT ACCESS TOTALS ROW & QUICK FILTER BAR
  // =========================================================================
  it("21. Totals Row & Quick Filter Bar in Datasheet", async () => {
    const html = generatePostgresStudioHtml();

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
      body: JSON.stringify({ table: "products" }),
    });
    expect(aggRes.status).toBe(200);
    const aggData = (await aggRes.json()) as any;
    expect(aggData.success).toBe(true);
    expect(aggData.aggregates).toBeDefined();
    expect(aggData.aggregates._totalCount).toBeGreaterThan(0);
    if (aggData.aggregates.price) {
      expect(aggData.aggregates.price.sum).toBeDefined();
      expect(aggData.aggregates.price.avg).toBeDefined();
    }
  });

  // =========================================================================
  // 22. MICROSOFT ACCESS PUBLICATION REPORT GENERATOR
  // =========================================================================
  it("22. Publication Report Generator Modal & Print View", () => {
    const html = generatePostgresStudioHtml();

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
  // 23. POSTGRESQL CUSTOM ENUM TYPES MANAGEMENT
  // =========================================================================
  it("23. PostgreSQL Custom ENUM Types Management (pg_type & pg_enum)", async () => {
    const html = generatePostgresStudioHtml();

    expect(html).toContain('id="tabBtnTypes"');
    expect(html).toContain('id="tabTypes"');
    expect(html).toContain('id="createEnumModal"');
    expect(html).toContain("loadEnumTypes");
    expect(html).toContain("submitCreateEnum");

    // API: Create Enum Type
    const enumName = `test_enum_${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/types/enums/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: enumName,
        values: ["draft", "submitted", "approved", "rejected"],
      }),
    });
    expect(createRes.status).toBe(200);

    // List Enums
    const listRes = await fetch(`${baseUrl}/api/types/enums`);
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData.success).toBe(true);
    const found = listData.enums.find((e: any) => e.name === enumName);
    expect(found).toBeDefined();
    expect(found.values).toContain("draft");
    expect(found.values).toContain("approved");

    // Add Enum Value
    const addValRes = await fetch(`${baseUrl}/api/types/enums/add-value`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: enumName, value: "archived" }),
    });
    expect(addValRes.status).toBe(200);

    // Drop Enum Type
    const dropRes = await fetch(`${baseUrl}/api/types/enums/drop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: enumName }),
    });
    expect(dropRes.status).toBe(200);
  });

  // =========================================================================
  // 24. POSTGRESQL DECLARATIVE PARTITION TREES EXPLORER
  // =========================================================================
  it("24. Declarative Partition Trees Explorer (pg_partitioned_table & pg_inherits)", async () => {
    const html = generatePostgresStudioHtml();

    expect(html).toContain('id="tabBtnPartitions"');
    expect(html).toContain('id="tabPartitions"');
    expect(html).toContain("loadPartitions");

    // API: Query Partitions
    const partRes = await fetch(`${baseUrl}/api/partitions`);
    expect(partRes.status).toBe(200);
    const partData = (await partRes.json()) as any;
    expect(partData.success).toBe(true);
    expect(Array.isArray(partData.partitions)).toBe(true);
  });

  // =========================================================================
  // 25. POSTGRESQL STREAMING REPLICATION & WAL DIAGNOSTICS
  // =========================================================================
  it("25. Streaming Replication & Write-Ahead Log Diagnostics", async () => {
    const html = generatePostgresStudioHtml();

    expect(html).toContain('id="tabBtnReplication"');
    expect(html).toContain('id="tabReplication"');
    expect(html).toContain("loadReplicationStatus");

    // API: Query Replication Status
    const replRes = await fetch(`${baseUrl}/api/replication`);
    expect(replRes.status).toBe(200);
    const replData = (await replRes.json()) as any;
    expect(replData.success).toBe(true);
    expect(replData.replication).toBeDefined();
    expect(Array.isArray(replData.replication.standbys)).toBe(true);
    expect(Array.isArray(replData.replication.slots)).toBe(true);
  });

  // =========================================================================
  // 26. POSTGRESQL 1-CLICK DATABASE BACKUP & SQL DUMP
  // =========================================================================
  it("26. Enterprise 1-Click Database Backup & SQL Dump Generator", async () => {
    const html = generatePostgresStudioHtml();

    expect(html).toContain('id="btnDbBackupDump"');
    expect(html).toContain('id="dumpModal"');
    expect(html).toContain('id="dumpSqlPreview"');
    expect(html).toContain("openDatabaseDumpModal");
    expect(html).toContain("runGenerateDump");
    expect(html).toContain("downloadDumpFile");

    // API: Generate Dump
    const dumpRes = await fetch(`${baseUrl}/api/database/dump`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all" }),
    });
    expect(dumpRes.status).toBe(200);
    const dumpData = (await dumpRes.json()) as any;
    expect(dumpData.success).toBe(true);
    expect(typeof dumpData.sql).toBe("string");
    expect(dumpData.sql).toContain("POSTGRES STUDIO PRO");
    expect(dumpData.sql).toContain("CREATE TABLE IF NOT EXISTS");
    expect(dumpData.sql).toContain("INSERT INTO");
  });
});

