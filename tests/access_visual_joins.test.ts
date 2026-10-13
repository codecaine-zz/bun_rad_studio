import { describe, it, expect, afterAll } from "bun:test";
import { startSqliteStudioServer } from "../applications/sqlite_studio_server.ts";
import { generateSqliteStudioHtml } from "../applications/sqlite_studio.ts";
import { generateMysqlStudioHtml } from "../applications/mysql_studio.ts";
import { Database } from "bun:sqlite";

describe("📐 Microsoft Access Visual Joins & Multi-Table Relationships Suite", () => {
  const server = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:" });
  const baseUrl = `http://127.0.0.1:${server.port}`;

  afterAll(() => {
    try {
      server.stop(true);
    } catch {}
  });

  it("1. SQLite Studio shell renders Microsoft Access Visual Join Canvas and Properties Modal", async () => {
    const html = generateSqliteStudioHtml();
    expect(html).toContain('id="accessJoinPropertiesModal"');
    expect(html).toContain('id="qbeCanvasViewport"');
    expect(html).toContain('id="qbeCanvasSvg"');
    expect(html).toContain('class="access-join-radio-card"');
    expect(html).toContain('jpVennSvg');
    expect(html).toContain('jpSqlSnippet');
    expect(html).toContain('updateJoinPropVennDiagram');
    expect(html).toContain('updateJoinPropPreview');
    expect(html).toContain('⚡ Auto-Detect Joins');
    expect(html).toContain('+ Link / Join');
    expect(html).toContain('autoArrangeDesignerTables()');
    expect(html).toContain('swapJoinPropDirection()');
    expect(html).toContain('selectJoinPropType');
    expect(html).toContain('findAllDesignerJoins');
  });

  it("2. MySQL Studio shell renders Microsoft Access Visual Join Canvas and Properties Modal", () => {
    const html = generateMysqlStudioHtml();
    expect(html).toContain('id="accessJoinPropertiesModal"');
    expect(html).toContain('id="qbeCanvasViewport"');
    expect(html).toContain('id="qbeCanvasSvg"');
    expect(html).toContain('class="access-join-radio-card"');
    expect(html).toContain('jpVennSvg');
    expect(html).toContain('jpSqlSnippet');
    expect(html).toContain('updateJoinPropVennDiagram');
    expect(html).toContain('updateJoinPropPreview');
    expect(html).toContain('⚡ Auto-Detect Joins');
    expect(html).toContain('+ Link / Join');
    expect(html).toContain('autoArrangeDesignerTables()');
    expect(html).toContain('swapJoinPropDirection()');
    expect(html).toContain('selectJoinPropType');
    expect(html).toContain('findAllDesignerJoins');
  });

  it("3. Client-side embedded scripts in both studios parse with zero syntax errors", () => {
    const sqliteHtml = generateSqliteStudioHtml();
    const mysqlHtml = generateMysqlStudioHtml();

    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    
    // SQLite Studio scripts validation
    let sqliteMatch;
    let sqliteScriptCount = 0;
    while ((sqliteMatch = scriptRegex.exec(sqliteHtml)) !== null) {
      const code = sqliteMatch[1].trim();
      if (!code) continue;
      sqliteScriptCount++;
      expect(() => new Function(code)).not.toThrow();
    }
    expect(sqliteScriptCount).toBeGreaterThanOrEqual(2);

    // MySQL Studio scripts validation
    let mysqlMatch;
    let mysqlScriptCount = 0;
    const mysqlScriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    while ((mysqlMatch = mysqlScriptRegex.exec(mysqlHtml)) !== null) {
      const code = mysqlMatch[1].trim();
      if (!code) continue;
      mysqlScriptCount++;
      expect(() => new Function(code)).not.toThrow();
    }
    expect(mysqlScriptCount).toBeGreaterThanOrEqual(2);
  });

  it("4. SQLite Server executes INNER, LEFT, RIGHT, and FULL OUTER joins seamlessly", async () => {
    // 4.1 INNER JOIN: only customers with orders
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
    const innerData = await innerRes.json();
    expect(innerData.success).toBe(true);
    expect(innerData.rows.length).toBeGreaterThan(0);
    expect(innerData.columns).toContain("customer_name");
    expect(innerData.columns).toContain("order_id");

    // 4.2 LEFT JOIN: all customers, including those with null orders
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
    const leftData = await leftRes.json();
    expect(leftData.success).toBe(true);
    expect(leftData.rows.length).toBeGreaterThanOrEqual(innerData.rows.length);

    // 4.3 RIGHT JOIN: supported in modern SQLite 3.39+
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
    const rightData = await rightRes.json();
    expect(rightData.success).toBe(true);
    expect(rightData.rows.length).toBe(innerData.rows.length);

    // 4.4 FULL OUTER JOIN: supported in modern SQLite 3.39+
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
    const fullData = await fullRes.json();
    expect(fullData.success).toBe(true);
    expect(fullData.rows.length).toBeGreaterThanOrEqual(leftData.rows.length);

    // 4.5 CROSS JOIN: Cartesian product
    const crossRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT c.name AS customer_name, p.name AS product_name
              FROM customers c
              CROSS JOIN products p
              LIMIT 10;`
      }),
    });
    expect(crossRes.status).toBe(200);
    const crossData = await crossRes.json();
    expect(crossData.success).toBe(true);
    expect(crossData.rows.length).toBe(10);
  });

  it("5. Multi-Table Joins (> 3 tables) with mixed join types execute correctly", async () => {
    // 4-Table Join: customers -> orders -> order_items -> products
    const multiRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT 
                c.name AS customer,
                c.tier,
                o.order_number,
                o.status AS order_status,
                p.name AS product_name,
                oi.quantity,
                oi.unit_price,
                (oi.quantity * oi.unit_price) AS line_total
              FROM customers c
              INNER JOIN orders o ON c.id = o.customer_id
              INNER JOIN order_items oi ON o.id = oi.order_id
              INNER JOIN products p ON oi.product_id = p.id
              ORDER BY o.id ASC, oi.id ASC;`
      }),
    });
    expect(multiRes.status).toBe(200);
    const multiData = await multiRes.json();
    expect(multiData.success).toBe(true);
    expect(multiData.rows.length).toBeGreaterThan(0);
    expect(multiData.columns).toEqual([
      "customer",
      "tier",
      "order_number",
      "order_status",
      "product_name",
      "quantity",
      "unit_price",
      "line_total"
    ]);

    // Mixed LEFT and INNER multi-table join
    const mixedRes = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT 
                c.name AS customer,
                o.order_number,
                p.name AS product_name
              FROM customers c
              LEFT JOIN orders o ON c.id = o.customer_id
              LEFT JOIN order_items oi ON o.id = oi.order_id
              LEFT JOIN products p ON oi.product_id = p.id
              ORDER BY c.id ASC;`
      }),
    });
    expect(mixedRes.status).toBe(200);
    const mixedData = await mixedRes.json();
    expect(mixedData.success).toBe(true);
    expect(mixedData.rows.length).toBeGreaterThanOrEqual(multiData.rows.length);
  });

  it("6. Auto-detection logic identifies foreign keys and naming conventions", () => {
    // In-memory test verifying relationships discovery between schema definitions
    const schema = {
      tables: [
        {
          name: "authors",
          columns: [{ name: "id", pk: true }, { name: "name" }],
          foreignKeys: [],
        },
        {
          name: "books",
          columns: [{ name: "id", pk: true }, { name: "author_id" }, { name: "title" }],
          foreignKeys: [{ table: "authors", from: "author_id", to: "id" }],
        },
        {
          name: "book_reviews",
          columns: [{ name: "id", pk: true }, { name: "book_id" }, { name: "rating" }],
          foreignKeys: [], // Test conventional naming: book_id -> books.id
        }
      ]
    };

    // Simulate findAllDesignerJoins logic
    function getEntityMeta(name: string) {
      return schema.tables.find(t => t.name === name);
    }
    function getSingularCandidate(name: string) {
      if (name.endsWith("s")) return name.slice(0, -1);
      return name;
    }
    function testFindJoins(left: string, right: string) {
      const lMeta = getEntityMeta(left)!;
      const rMeta = getEntityMeta(right)!;
      const matches: any[] = [];
      (lMeta.foreignKeys || []).forEach(fk => {
        if (fk.table === right) matches.push({ left, right, leftField: fk.from, rightField: fk.to || "id", conf: 100 });
      });
      (rMeta.foreignKeys || []).forEach(fk => {
        if (fk.table === left) matches.push({ left, right, leftField: fk.to || "id", rightField: fk.from, conf: 100 });
      });
      const rightSingular = getSingularCandidate(right).toLowerCase();
      (lMeta.columns || []).forEach(c => {
        if (c.name.toLowerCase() === rightSingular + "_id") {
          matches.push({ left, right, leftField: c.name, rightField: "id", conf: 90 });
        }
      });
      const leftSingular = getSingularCandidate(left).toLowerCase();
      (rMeta.columns || []).forEach(c => {
        if (c.name.toLowerCase() === leftSingular + "_id") {
          matches.push({ left, right, leftField: "id", rightField: c.name, conf: 90 });
        }
      });
      return matches;
    }

    // 1. Explicit FK detection
    const booksAuthors = testFindJoins("books", "authors");
    expect(booksAuthors.length).toBeGreaterThanOrEqual(1);
    expect(booksAuthors[0].leftField).toBe("author_id");
    expect(booksAuthors[0].rightField).toBe("id");

    // 2. Conventional naming detection (no explicit FK declared)
    const reviewsBooks = testFindJoins("book_reviews", "books");
    expect(reviewsBooks.length).toBeGreaterThanOrEqual(1);
    expect(reviewsBooks[0].leftField).toBe("book_id");
    expect(reviewsBooks[0].rightField).toBe("id");
  });

  it("7. Canvas Zooming and Room Expansion Controls (Stage Scaling, Resizer Splitter, Fit, Room Presets) in both Studios", () => {
    const sqliteHtml = generateSqliteStudioHtml();
    const mysqlHtml = generateMysqlStudioHtml();

    for (const [name, html] of [["SQLite Studio", sqliteHtml], ["MySQL Studio", mysqlHtml]]) {
      // 7.1 Expansive Viewport and Stage transform architecture
      expect(html).toContain('id="qbeCanvasStage"');
      expect(html).toContain('class="qbe-canvas-stage"');
      expect(html).toContain('id="qbeCanvasViewport"');
      expect(html).toContain('--qbe-canvas-height: 480px;');

      // 7.2 Zoom controls
      expect(html).toContain('id="canvasZoomSelect"');
      expect(html).toContain('setDesignerCanvasZoom');
      expect(html).toContain('zoomInDesignerCanvas()');
      expect(html).toContain('zoomOutDesignerCanvas()');
      expect(html).toContain('resetDesignerCanvasZoom()');
      expect(html).toContain('fitDesignerCanvasZoom()');
      expect(html).toContain('initCanvasPanAndZoom()');

      // 7.3 Room Expansion & Interactive Resizer Splitter
      expect(html).toContain('id="qbeResizerBar"');
      expect(html).toContain('class="qbe-resizer-handle"');
      expect(html).toContain('initQbeSplitter()');
      expect(html).toContain('setDesignerRoomMode(\'canvas-max\')');
      expect(html).toContain('setDesignerRoomMode(\'split\')');
      expect(html).toContain('setDesignerRoomMode(\'grid-max\')');
      expect(html).toContain('⤢ Canvas');
      expect(html).toContain('⤡ Split');
      expect(html).toContain('⤢ Grid');
    }
  });

  it("8. Section-by-Section Ease-of-Use Enhancements (Grid Density, SQL Font/Height, Datasheet Density/Font, Sidebar Toggle)", () => {
    const sqliteHtml = generateSqliteStudioHtml();
    const mysqlHtml = generateMysqlStudioHtml();

    for (const [name, html] of [["SQLite Studio", sqliteHtml], ["MySQL Studio", mysqlHtml]]) {
      // 8.1 QBE Grid Density
      expect(html).toContain('setQbeGridDensity(\'compact\')');
      expect(html).toContain('setQbeGridDensity(\'normal\')');
      expect(html).toContain('setQbeGridDensity(\'spacious\')');
      expect(html).toContain('--qbe-grid-font-size');
      expect(html).toContain('--qbe-grid-cell-padding');

      // 8.2 SQL View Editor zoom & height controls
      expect(html).toContain('adjustSqlFontSize(-1)');
      expect(html).toContain('adjustSqlFontSize(1)');
      expect(html).toContain('toggleSqlEditorHeight()');
      expect(html).toContain('id="sqlFontBadge"');

      // 8.3 Datasheet View density & font controls
      expect(html).toContain('setDatasheetDensity(\'compact\')');
      expect(html).toContain('setDatasheetDensity(\'normal\')');
      expect(html).toContain('setDatasheetDensity(\'spacious\')');
      expect(html).toContain('adjustDatasheetFontSize(-1)');
      expect(html).toContain('adjustDatasheetFontSize(1)');
      expect(html).toContain('id="dsFontBadge"');
      expect(html).toContain('--ds-font-size');
      expect(html).toContain('--ds-cell-padding');

      // 8.4 Sidebar Collapse Toggle for full workspace expansion
      expect(html).toContain('toggleSidebarCollapse()');
      expect(html).toContain('◀▶ Sidebar');
    }
  });
});
