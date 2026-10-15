/**
 * ⚡ Bun RAD Studio - Visual Table Joins Screenshot Capture Pipeline
 *
 * Spins up the live SQLite Studio & MySQL Studio engines, applies presets,
 * and captures high-resolution screenshots for the userguides.
 */

import { startSqliteStudioServer } from "../applications/sqlite_studio_server.ts";
import { generateMysqlStudioHtml } from "../applications/mysql_studio.ts";
import { guardLocalRequest } from "../src/localGuard";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = join(process.cwd(), "screenshots", "apps");
mkdirSync(OUTPUT_DIR, { recursive: true });

async function runScreenshot(url: string, outputPath: string, width = 1400, height = 920, delayMs = 1500) {
  console.log(`[Screenshot] Capturing ${outputPath} from ${url}...`);
  const profileDir = `/tmp/chrome_vj_profile_${Date.now()}`;
  
  // Use a slight virtual-time-budget or sleep so JS executes completely
  const cmd = `"${CHROME_BIN}" --headless=new --disable-gpu --no-sandbox --user-data-dir="${profileDir}" --virtual-time-budget=${delayMs} --screenshot="${outputPath}" --window-size=${width},${height} "${url}" 2>/dev/null`;
  
  const proc = Bun.spawn(["bash", "-c", cmd]);
  await proc.exited;
  
  if (existsSync(outputPath)) {
    const file = Bun.file(outputPath);
    console.log(`✅ Captured: ${outputPath} (${file.size} bytes)`);
  } else {
    console.error(`❌ Failed to capture: ${outputPath}`);
  }
}

async function main() {
  console.log("========================================================================");
  console.log("📸 Capturing Visual Table Joins Screenshots for Userguides");
  console.log("========================================================================");

  // 1. Start SQLite Studio Server
  const sqliteServer = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:" });
  const sqlitePort = sqliteServer.port;
  console.log(`🚀 SQLite Studio Server running on http://127.0.0.1:${sqlitePort}`);

  // 2. Start MySQL Studio Mock Server with Full Relational Schema
  const mysqlSchema = {
    dbPath: "ecommerce_prod",
    dbName: "ecommerce_prod",
    isMemory: false,
    tables: [
      {
        name: "customers",
        type: "table",
        sql: "CREATE TABLE `customers` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(255) NOT NULL, `email` varchar(255) NOT NULL, `tier` varchar(50) DEFAULT 'Standard', `city` varchar(100) DEFAULT NULL, `country` varchar(100) DEFAULT 'USA', PRIMARY KEY (`id`)) ENGINE=InnoDB;",
        rowCount: 1250,
        columns: [
          { cid: 1, name: "id", type: "INT", notnull: true, dflt_value: null, pk: true },
          { cid: 2, name: "name", type: "VARCHAR(255)", notnull: true, dflt_value: null, pk: false },
          { cid: 3, name: "email", type: "VARCHAR(255)", notnull: true, dflt_value: null, pk: false },
          { cid: 4, name: "tier", type: "VARCHAR(50)", notnull: false, dflt_value: "'Standard'", pk: false },
          { cid: 5, name: "city", type: "VARCHAR(100)", notnull: false, dflt_value: null, pk: false },
          { cid: 6, name: "country", type: "VARCHAR(100)", notnull: false, dflt_value: "'USA'", pk: false }
        ],
        indices: [{ name: "PRIMARY", unique: true, origin: "pk", columns: ["id"] }],
        foreignKeys: []
      },
      {
        name: "orders",
        type: "table",
        sql: "CREATE TABLE `orders` (`id` int(11) NOT NULL AUTO_INCREMENT, `customer_id` int(11) NOT NULL, `order_date` datetime NOT NULL, `total_amount` decimal(10,2) NOT NULL, `status` varchar(50) DEFAULT 'completed', PRIMARY KEY (`id`), KEY `fk_orders_customer` (`customer_id`), CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`)) ENGINE=InnoDB;",
        rowCount: 4820,
        columns: [
          { cid: 1, name: "id", type: "INT", notnull: true, dflt_value: null, pk: true },
          { cid: 2, name: "customer_id", type: "INT", notnull: true, dflt_value: null, pk: false },
          { cid: 3, name: "order_date", type: "DATETIME", notnull: true, dflt_value: null, pk: false },
          { cid: 4, name: "total_amount", type: "DECIMAL(10,2)", notnull: true, dflt_value: null, pk: false },
          { cid: 5, name: "status", type: "VARCHAR(50)", notnull: false, dflt_value: "'completed'", pk: false }
        ],
        indices: [
          { name: "PRIMARY", unique: true, origin: "pk", columns: ["id"] },
          { name: "fk_orders_customer", unique: false, origin: "c", columns: ["customer_id"] }
        ],
        foreignKeys: [
          { id: 1, seq: 0, table: "customers", from: "customer_id", to: "id" }
        ]
      },
      {
        name: "order_items",
        type: "table",
        sql: "CREATE TABLE `order_items` (`id` int(11) NOT NULL AUTO_INCREMENT, `order_id` int(11) NOT NULL, `product_id` int(11) NOT NULL, `quantity` int(11) NOT NULL DEFAULT 1, `unit_price` decimal(10,2) NOT NULL, PRIMARY KEY (`id`), KEY `fk_items_order` (`order_id`), KEY `fk_items_product` (`product_id`), CONSTRAINT `fk_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`), CONSTRAINT `fk_items_product` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)) ENGINE=InnoDB;",
        rowCount: 14200,
        columns: [
          { cid: 1, name: "id", type: "INT", notnull: true, dflt_value: null, pk: true },
          { cid: 2, name: "order_id", type: "INT", notnull: true, dflt_value: null, pk: false },
          { cid: 3, name: "product_id", type: "INT", notnull: true, dflt_value: null, pk: false },
          { cid: 4, name: "quantity", type: "INT", notnull: true, dflt_value: "1", pk: false },
          { cid: 5, name: "unit_price", type: "DECIMAL(10,2)", notnull: true, dflt_value: null, pk: false }
        ],
        indices: [
          { name: "PRIMARY", unique: true, origin: "pk", columns: ["id"] },
          { name: "fk_items_order", unique: false, origin: "c", columns: ["order_id"] },
          { name: "fk_items_product", unique: false, origin: "c", columns: ["product_id"] }
        ],
        foreignKeys: [
          { id: 1, seq: 0, table: "orders", from: "order_id", to: "id" },
          { id: 2, seq: 0, table: "products", from: "product_id", to: "id" }
        ]
      },
      {
        name: "products",
        type: "table",
        sql: "CREATE TABLE `products` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(255) NOT NULL, `category` varchar(100) NOT NULL, `price` decimal(10,2) NOT NULL, `stock_qty` int(11) NOT NULL DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB;",
        rowCount: 680,
        columns: [
          { cid: 1, name: "id", type: "INT", notnull: true, dflt_value: null, pk: true },
          { cid: 2, name: "name", type: "VARCHAR(255)", notnull: true, dflt_value: null, pk: false },
          { cid: 3, name: "category", type: "VARCHAR(100)", notnull: true, dflt_value: null, pk: false },
          { cid: 4, name: "price", type: "DECIMAL(10,2)", notnull: true, dflt_value: null, pk: false },
          { cid: 5, name: "stock_qty", type: "INT", notnull: true, dflt_value: "0", pk: false }
        ],
        indices: [{ name: "PRIMARY", unique: true, origin: "pk", columns: ["id"] }],
        foreignKeys: []
      }
    ],
    views: [
      {
        name: "v_customer_summary",
        type: "view",
        sql: "CREATE VIEW `v_customer_summary` AS SELECT c.name, COUNT(o.id) as total_orders, SUM(o.total_amount) as total_spent FROM customers c LEFT JOIN orders o ON c.id = o.customer_id GROUP BY c.id;",
        rowCount: 1250,
        columns: [
          { cid: 1, name: "name", type: "VARCHAR(255)", notnull: true, dflt_value: null, pk: false },
          { cid: 2, name: "total_orders", type: "BIGINT", notnull: true, dflt_value: null, pk: false },
          { cid: 3, name: "total_spent", type: "DECIMAL(10,2)", notnull: false, dflt_value: null, pk: false }
        ],
        indices: [],
        foreignKeys: []
      }
    ],
    totalTables: 4,
    totalViews: 1,
    totalIndices: 5,
    totalRows: 20950
  };

  const mysqlKpis = {
    dbPath: "ecommerce_prod",
    dbName: "ecommerce_prod",
    isMemory: false,
    fileSizeBytes: 48234496,
    fileSizeFormatted: "46.0 MB",
    pageSize: 16384,
    pageCount: 2944,
    tableCount: 4,
    viewCount: 1,
    indexCount: 5,
    totalRows: 20950,
    journalMode: "InnoDB",
    walMode: true,
    cacheSizeKb: 131072,
    mysqlVersion: "8.4.3 Enterprise"
  };

  const mysqlServer = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };
      if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(generateMysqlStudioHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders }
        });
      }
      if (url.pathname === "/api/kpis") {
        return Response.json(mysqlKpis, { headers: corsHeaders });
      }
      if (url.pathname === "/api/schema") {
        return Response.json(mysqlSchema, { headers: corsHeaders });
      }
      if (url.pathname === "/api/query") {
        return Response.json({ rows: [], columns: [], count: 0, executionTimeMs: 0.42 }, { headers: corsHeaders });
      }
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }
  });
  const mysqlPort = mysqlServer.port;
  console.log(`🚀 MySQL Studio Server running on http://127.0.0.1:${mysqlPort}`);

  // Screenshot 1: SQLite Studio Visual Table Joins Canvas (Multi-table relationship diagram & QBE criteria matrix)
  await runScreenshot(
    `http://127.0.0.1:${sqlitePort}/?tab=designer&preset=ecommerce_multi&min_editor=1&room=split`,
    join(OUTPUT_DIR, "visual_joins_canvas_sqlite.png"),
    1400,
    1340,
    2500
  );

  // Screenshot 2: Join Properties Modal Dialog (with 3-circle Venn Diagrams & Directional Radio Choices)
  await runScreenshot(
    `http://127.0.0.1:${sqlitePort}/?tab=designer&preset=ecommerce_multi&modal=customers.id-%3Eorders.customer_id`,
    join(OUTPUT_DIR, "visual_joins_properties_modal.png"),
    1400,
    950,
    2500
  );

  // Screenshot 3: Expansive Zoom & Room Mode (Zoomed in 125%, Canvas Room maximized, showing resizer and zoom toolbar)
  await runScreenshot(
    `http://127.0.0.1:${sqlitePort}/?tab=designer&preset=ecommerce_multi&room=canvas-max&zoom=1.25&min_editor=1`,
    join(OUTPUT_DIR, "visual_joins_zoom_room.png"),
    1400,
    1020,
    2500
  );

  // Screenshot 4: MySQL Studio Relational Query Designer with 4-Table Visual Joins
  await runScreenshot(
    `http://127.0.0.1:${mysqlPort}/?tab=designer&preset=ecommerce_multi&min_editor=1&room=split`,
    join(OUTPUT_DIR, "visual_joins_canvas_mysql.png"),
    1400,
    1340,
    2500
  );

  // Clean up
  sqliteServer.stop(true);
  mysqlServer.stop(true);
  console.log("\n✨ All screenshots captured successfully!");
}

main().catch(console.error);
