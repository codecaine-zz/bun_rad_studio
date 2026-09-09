/**
 * ⚡ Bun RAD Studio - SQLite Studio Pro Server Engine
 * 
 * High-performance background HTTP telemetry & database engine for SQLite Studio Pro.
 * Runs on a dedicated OS thread (via Bun Worker) or standalone web server, providing
 * sub-millisecond query execution, schema reflection, and live database telemetry
 * without main-thread event loop blocking.
 */

import { Database } from "bun:sqlite";
import { resolve, basename } from "path";
import { existsSync, statSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { homedir } from "os";
import { generateSqliteStudioHtml } from "./sqlite_studio.ts";

export interface ServerOptions {
  port?: number;
  host?: string;
  initialDbPath?: string;
}

export interface TableColumnMeta {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
  dflt_value: any;
  pk: boolean;
}

export interface TableSchemaMeta {
  name: string;
  type: "table" | "view";
  sql: string;
  rowCount: number;
  columns: TableColumnMeta[];
  indices: { name: string; unique: boolean; origin: string; columns: string[] }[];
  foreignKeys: { id: number; seq: number; table: string; from: string; to: string }[];
}

export interface DatabaseSchemaResponse {
  dbPath: string;
  dbName: string;
  isMemory: boolean;
  tables: TableSchemaMeta[];
  views: TableSchemaMeta[];
  totalTables: number;
  totalViews: number;
  totalIndices: number;
  totalRows: number;
}

export interface DatabaseKpis {
  dbPath: string;
  dbName: string;
  isMemory: boolean;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  pageSize: number;
  pageCount: number;
  freelistCount: number;
  journalMode: string;
  walMode: boolean;
  foreignKeys: boolean;
  tableCount: number;
  viewCount: number;
  indexCount: number;
  totalRows: number;
  cacheSizeKb: number;
  sqliteVersion: string;
}

// -------------------------------------------------------------------------------------------------
// Database Manager
// -------------------------------------------------------------------------------------------------

export class SqliteManager {
  public db: Database;
  public activePath: string;
  public isMemory: boolean;

  constructor(dbPath: string = ":memory:") {
    this.activePath = dbPath;
    this.isMemory = dbPath === ":memory:";
    this.db = new Database(dbPath);
    this.initPragmas();
    if (this.isMemory) {
      this.seedEnterpriseDatabase();
    }
  }

  private initPragmas() {
    try {
      this.db.run("PRAGMA foreign_keys = ON;");
      if (!this.isMemory) {
        this.db.run("PRAGMA journal_mode = WAL;");
      }
    } catch {}
  }

  public connect(newPath: string): { success: boolean; path: string; error?: string } {
    try {
      const raw = (newPath || "").trim();
      let targetPath = ":memory:";
      if (raw && raw !== ":memory:") {
        if (raw.startsWith("~/") || raw === "~") {
          targetPath = resolve(homedir(), raw.slice(2));
        } else {
          targetPath = resolve(process.cwd(), raw);
        }
      }

      const newDb = new Database(targetPath);
      
      // Close old if not memory
      try { this.db.close(); } catch {}
      
      this.db = newDb;
      this.activePath = targetPath;
      this.isMemory = targetPath === ":memory:";
      this.initPragmas();

      if (this.isMemory) {
        this.seedEnterpriseDatabase();
      }

      this.logAudit("DB_CONNECT", "SYSTEM", `Switched connection to ${targetPath}`);
      return { success: true, path: this.activePath };
    } catch (err: any) {
      return { success: false, path: this.activePath, error: err?.message || String(err) };
    }
  }

  public getWorkspaceDatabases(): { name: string; path: string; sizeFormatted: string; isMemory?: boolean; isCurrent?: boolean }[] {
    const list: { name: string; path: string; sizeFormatted: string; isMemory?: boolean; isCurrent?: boolean }[] = [
      {
        name: ":memory: (In-Memory RAM)",
        path: ":memory:",
        sizeFormatted: "0 B (RAM)",
        isMemory: true,
        isCurrent: this.isMemory,
      },
    ];

    const searchDirs = [process.cwd()];
    const potentialSubdirs = ["data", "db", "databases", "fixtures", "tests", ".sqlite_uploads"];
    for (const sub of potentialSubdirs) {
      const p = resolve(process.cwd(), sub);
      if (existsSync(p) && statSync(p).isDirectory()) {
        searchDirs.push(p);
      }
    }

    const seen = new Set<string>();
    const extRegex = /\.(sqlite|db|sqlite3|db3)$/i;

    for (const dir of searchDirs) {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (extRegex.test(file)) {
            const fullPath = resolve(dir, file);
            if (!seen.has(fullPath) && existsSync(fullPath)) {
              seen.add(fullPath);
              const st = statSync(fullPath);
              list.push({
                name: file,
                path: fullPath,
                sizeFormatted: formatBytes(st.size),
                isCurrent: fullPath === this.activePath,
              });
            }
          }
        }
      } catch {}
    }

    return list;
  }

  public getKpis(): DatabaseKpis {
    let fileSizeBytes = 0;
    let fileSizeFormatted = "0 B (RAM)";
    if (!this.isMemory && existsSync(this.activePath)) {
      try {
        fileSizeBytes = statSync(this.activePath).size;
        fileSizeFormatted = formatBytes(fileSizeBytes);
      } catch {}
    }

    const getPragma = (name: string): any => {
      try {
        const row = this.db.query(`PRAGMA ${name};`).get() as any;
        if (!row) return null;
        return Object.values(row)[0];
      } catch {
        return null;
      }
    };

    const pageSize = Number(getPragma("page_size")) || 4096;
    const pageCount = Number(getPragma("page_count")) || 0;
    const freelistCount = Number(getPragma("freelist_count")) || 0;
    const journalMode = String(getPragma("journal_mode") || "delete").toUpperCase();
    const foreignKeys = Boolean(Number(getPragma("foreign_keys")) === 1);
    const cacheSizePages = Math.abs(Number(getPragma("cache_size")) || 2000);
    const cacheSizeKb = Math.round((cacheSizePages * pageSize) / 1024);

    // Schema counts
    let tableCount = 0;
    let viewCount = 0;
    let indexCount = 0;
    let totalRows = 0;

    try {
      const items = (this.db.query("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%';").all() as any[]) || [];
      items.forEach((item) => {
        if (item.type === "table") tableCount++;
        else if (item.type === "view") viewCount++;
        else if (item.type === "index") indexCount++;
      });

      // Count rows across all user tables
      const tables = items.filter((i) => i.type === "table");
      for (const t of tables) {
        try {
          const c = (this.db.query(`SELECT count(*) as c FROM "${t.name}";`).get() as any)?.c || 0;
          totalRows += Number(c);
        } catch {}
      }
    } catch {}

    const sqliteVersion = String((this.db.query("SELECT sqlite_version() as v;").get() as any)?.v || "3.45.0");

    return {
      dbPath: this.activePath,
      dbName: this.isMemory ? ":memory:" : basename(this.activePath),
      isMemory: this.isMemory,
      fileSizeBytes,
      fileSizeFormatted,
      pageSize,
      pageCount,
      freelistCount,
      journalMode,
      walMode: journalMode === "WAL",
      foreignKeys,
      tableCount,
      viewCount,
      indexCount,
      totalRows,
      cacheSizeKb,
      sqliteVersion,
    };
  }

  public getSchema(): DatabaseSchemaResponse {
    const tablesMeta: TableSchemaMeta[] = [];
    const viewsMeta: TableSchemaMeta[] = [];
    let totalIndices = 0;
    let totalRows = 0;

    const masterItems = (this.db.query(
      "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;"
    ).all() as any[]) || [];

    for (const item of masterItems) {
      const isTable = item.type === "table";
      let rowCount = 0;
      if (isTable) {
        try {
          rowCount = Number((this.db.query(`SELECT count(*) as c FROM "${item.name}";`).get() as any)?.c || 0);
          totalRows += rowCount;
        } catch {}
      }

      // Column metadata
      let columns: TableColumnMeta[] = [];
      try {
        const colsRaw = (this.db.query(`PRAGMA table_info("${item.name}");`).all() as any[]) || [];
        columns = colsRaw.map((c) => ({
          cid: c.cid,
          name: c.name,
          type: c.type || "ANY",
          notnull: Boolean(c.notnull),
          dflt_value: c.dflt_value,
          pk: Boolean(c.pk),
        }));
      } catch {}

      // Index metadata
      let indices: any[] = [];
      if (isTable) {
        try {
          const idxRaw = (this.db.query(`PRAGMA index_list("${item.name}");`).all() as any[]) || [];
          indices = idxRaw.map((idx) => {
            let cols: string[] = [];
            try {
              const idxInfo = (this.db.query(`PRAGMA index_info("${idx.name}");`).all() as any[]) || [];
              cols = idxInfo.map((ii) => ii.name);
            } catch {}
            return {
              name: idx.name,
              unique: Boolean(idx.unique),
              origin: idx.origin,
              columns: cols,
            };
          });
          totalIndices += indices.length;
        } catch {}
      }

      // Foreign key metadata
      let foreignKeys: any[] = [];
      if (isTable) {
        try {
          foreignKeys = (this.db.query(`PRAGMA foreign_key_list("${item.name}");`).all() as any[]) || [];
        } catch {}
      }

      const meta: TableSchemaMeta = {
        name: item.name,
        type: isTable ? "table" : "view",
        sql: item.sql || "",
        rowCount,
        columns,
        indices,
        foreignKeys,
      };

      if (isTable) {
        tablesMeta.push(meta);
      } else {
        viewsMeta.push(meta);
      }
    }

    return {
      dbPath: this.activePath,
      dbName: this.isMemory ? ":memory:" : basename(this.activePath),
      isMemory: this.isMemory,
      tables: tablesMeta,
      views: viewsMeta,
      totalTables: tablesMeta.length,
      totalViews: viewsMeta.length,
      totalIndices,
      totalRows,
    };
  }

  public query(sql: string, params: any[] = []): {
    success: boolean;
    rows?: Record<string, any>[];
    columns?: string[];
    rowCount?: number;
    rowsAffected?: number;
    lastInsertRowid?: number;
    latencyMs?: number;
    error?: string;
  } {
    const trimmed = sql.trim();
    if (!trimmed) {
      return { success: false, error: "Query statement is empty" };
    }

    const t0 = performance.now();
    try {
      const isRead = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)/i.test(trimmed);

      if (isRead) {
        const stmt = this.db.query(trimmed);
        const rows = (stmt.all(...params) as Record<string, any>[]) || [];
        const latencyMs = Number((performance.now() - t0).toFixed(2));
        const columns = rows.length > 0 ? Object.keys(rows[0]!) : this.extractColumnsFromQuery(trimmed);

        this.logAudit("SELECT", "QUERY", trimmed.slice(0, 150));
        return {
          success: true,
          rows,
          columns,
          rowCount: rows.length,
          latencyMs,
        };
      } else {
        // Mutation or DDL
        const result = this.db.run(trimmed, ...params);
        const latencyMs = Number((performance.now() - t0).toFixed(2));

        this.logAudit("MUTATION", "STATEMENT", trimmed.slice(0, 150));
        return {
          success: true,
          rows: [],
          columns: [],
          rowsAffected: result.changes,
          lastInsertRowid: Number(result.lastInsertRowid),
          latencyMs,
        };
      }
    } catch (err: any) {
      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return {
        success: false,
        latencyMs,
        error: err?.message || String(err),
      };
    }
  }

  public explain(sql: string): {
    success: boolean;
    queryPlan?: { id: number; parent: number; notused: number; detail: string; isScan: boolean; isIndex: boolean }[];
    rawPlan?: any[];
    latencyMs?: number;
    error?: string;
  } {
    const trimmed = sql.trim();
    if (!trimmed) return { success: false, error: "SQL statement is required for explain" };

    const t0 = performance.now();
    try {
      const cleanSql = trimmed.replace(/^EXPLAIN\s+QUERY\s+PLAN\s+/i, "");
      const explainRows = (this.db.query(`EXPLAIN QUERY PLAN ${cleanSql}`).all() as any[]) || [];
      const latencyMs = Number((performance.now() - t0).toFixed(2));

      const queryPlan = explainRows.map((row) => {
        const detail = String(row.detail || "");
        const isScan = /SCAN\s+TABLE/i.test(detail);
        const isIndex = /USING\s+INDEX|SEARCH\s+TABLE/i.test(detail);
        return {
          id: Number(row.id || 0),
          parent: Number(row.parent || 0),
          notused: Number(row.notused || 0),
          detail,
          isScan,
          isIndex,
        };
      });

      return {
        success: true,
        queryPlan,
        rawPlan: explainRows,
        latencyMs,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
      };
    }
  }

  public getTableData(
    table: string,
    options: { page?: number; pageSize?: number; orderBy?: string; orderDir?: "ASC" | "DESC"; search?: string } = {}
  ): {
    success: boolean;
    table: string;
    rows?: any[];
    columns?: string[];
    totalRows?: number;
    page?: number;
    pageSize?: number;
    totalPages?: number;
    latencyMs?: number;
    error?: string;
  } {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(500, Math.max(1, options.pageSize || 25));
    const offset = (page - 1) * pageSize;

    const t0 = performance.now();
    try {
      // Validate table exists
      const exists = (this.db.query("SELECT name FROM sqlite_master WHERE (type='table' OR type='view') AND name = ?;").get(table) as any);
      if (!exists) {
        return { success: false, table, error: `Table or view '${table}' does not exist` };
      }

      // Column metadata
      const colsRaw = (this.db.query(`PRAGMA table_info("${table}");`).all() as any[]) || [];
      const columns = colsRaw.map((c) => c.name);

      // Where filter for search
      let whereClause = "";
      const params: any[] = [];
      if (options.search && options.search.trim() && columns.length > 0) {
        const searchVal = `%${options.search.trim()}%`;
        const conditions = columns.map((col) => `CAST("${col}" AS TEXT) LIKE ?`);
        whereClause = `WHERE (${conditions.join(" OR ")})`;
        columns.forEach(() => params.push(searchVal));
      }

      // Total count
      const countSql = `SELECT count(*) as total FROM "${table}" ${whereClause};`;
      const countStmt = this.db.query(countSql);
      const totalRows = Number((countStmt.get(...params) as any)?.total || 0);

      // Order by
      let orderClause = "";
      if (options.orderBy && columns.includes(options.orderBy)) {
        const dir = options.orderDir === "DESC" ? "DESC" : "ASC";
        orderClause = `ORDER BY "${options.orderBy}" ${dir}`;
      }

      // Data fetch
      const dataSql = `SELECT * FROM "${table}" ${whereClause} ${orderClause} LIMIT ? OFFSET ?;`;
      const dataStmt = this.db.query(dataSql);
      const rows = (dataStmt.all(...params, pageSize, offset) as Record<string, any>[]) || [];
      const latencyMs = Number((performance.now() - t0).toFixed(2));

      return {
        success: true,
        table,
        rows,
        columns,
        totalRows,
        page,
        pageSize,
        totalPages: Math.ceil(totalRows / pageSize) || 1,
        latencyMs,
      };
    } catch (err: any) {
      return { success: false, table, error: err?.message || String(err) };
    }
  }

  public mutateRow(
    table: string,
    action: "insert" | "update" | "delete",
    payload: { rowId?: any; pkColumn?: string; data?: Record<string, any> }
  ): { success: boolean; rowsAffected?: number; lastInsertRowid?: number; error?: string } {
    try {
      const pkCol = payload.pkColumn || "id";

      if (action === "delete") {
        if (payload.rowId === undefined) throw new Error("rowId is required for deletion");
        const res = this.db.run(`DELETE FROM "${table}" WHERE "${pkCol}" = ?;`, [payload.rowId]);
        this.logAudit("DELETE", table, `Deleted ${pkCol}=${payload.rowId}`);
        return { success: true, rowsAffected: res.changes };
      }

      if (action === "update") {
        if (payload.rowId === undefined || !payload.data) throw new Error("rowId and data required for update");
        const entries = Object.entries(payload.data).filter(([k]) => k !== pkCol);
        if (entries.length === 0) return { success: true, rowsAffected: 0 };

        const setClause = entries.map(([k]) => `"${k}" = ?`).join(", ");
        const values = entries.map(([, v]) => v);
        values.push(payload.rowId);

        const res = this.db.run(`UPDATE "${table}" SET ${setClause} WHERE "${pkCol}" = ?;`, values);
        this.logAudit("UPDATE", table, `Updated ${pkCol}=${payload.rowId} (${entries.length} cols)`);
        return { success: true, rowsAffected: res.changes };
      }

      if (action === "insert") {
        if (!payload.data) throw new Error("data object is required for insert");
        const keys = Object.keys(payload.data);
        if (keys.length === 0) throw new Error("At least one column is required for insert");

        const cols = keys.map((k) => `"${k}"`).join(", ");
        const placeholders = keys.map(() => "?").join(", ");
        const values = keys.map((k) => payload.data![k]);

        const res = this.db.run(`INSERT INTO "${table}" (${cols}) VALUES (${placeholders});`, values);
        this.logAudit("INSERT", table, `Inserted new row id=${res.lastInsertRowid}`);
        return { success: true, rowsAffected: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
      }

      return { success: false, error: "Invalid mutation action" };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  }

  public runPragma(pragmaName: string, value?: string): { success: boolean; result: any; error?: string } {
    try {
      let sql = "";
      if (value !== undefined && value !== null) {
        sql = `PRAGMA ${pragmaName} = ${value};`;
        this.db.run(sql);
        const check = this.db.query(`PRAGMA ${pragmaName};`).get();
        return { success: true, result: check };
      } else {
        sql = `PRAGMA ${pragmaName};`;
        const res = this.db.query(sql).all();
        return { success: true, result: res };
      }
    } catch (err: any) {
      return { success: false, result: null, error: err?.message || String(err) };
    }
  }

  public seedEnterpriseDatabase(): { success: boolean; count: number } {
    try {
      this.db.run("BEGIN TRANSACTION;");

      // 1. Customers
      this.db.run(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          company TEXT,
          country TEXT DEFAULT 'United States',
          tier TEXT DEFAULT 'Standard',
          balance REAL DEFAULT 0.00,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Products
      this.db.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sku TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          price REAL NOT NULL,
          stock INTEGER DEFAULT 100,
          rating REAL DEFAULT 4.5,
          active INTEGER DEFAULT 1
        );
      `);

      // 3. Orders
      this.db.run(`
        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          order_number TEXT UNIQUE NOT NULL,
          status TEXT DEFAULT 'pending',
          total_amount REAL DEFAULT 0.00,
          payment_method TEXT DEFAULT 'Credit Card',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. Order Items
      this.db.run(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity INTEGER DEFAULT 1,
          unit_price REAL NOT NULL
        );
      `);

      // 5. Audit Log
      this.db.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action TEXT NOT NULL,
          entity TEXT NOT NULL,
          details TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Indices
      this.db.run("CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);");
      this.db.run("CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);");
      this.db.run("CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);");
      this.db.run("CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);");

      // Views
      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_customer_orders AS
        SELECT 
          c.id AS customer_id,
          c.name AS customer_name,
          c.email,
          c.tier,
          count(o.id) AS total_orders,
          coalesce(sum(o.total_amount), 0.0) AS lifetime_spend
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id;
      `);

      this.db.run(`
        CREATE VIEW IF NOT EXISTS v_sales_by_category AS
        SELECT 
          p.category,
          count(oi.id) AS units_sold,
          sum(oi.quantity * oi.unit_price) AS gross_revenue,
          avg(p.rating) AS avg_product_rating
        FROM products p
        JOIN order_items oi ON oi.product_id = p.id
        GROUP BY p.category;
      `);

      // Populate Seed Records
      const custCount = (this.db.query("SELECT count(*) as c FROM customers;").get() as any)?.c || 0;
      if (custCount === 0) {
        // 12 Customers
        const customers = [
          ["Linus Torvalds", "linus@kernel.org", "Linux Foundation", "United States", "Enterprise", 45200.50],
          ["Brendan Eich", "brendan@brave.com", "Brave Software", "United States", "Enterprise", 31800.00],
          ["Jarred Sumner", "jarred@oven.sh", "Oven Inc / Bun", "United States", "VIP", 94500.00],
          ["Guido van Rossum", "guido@python.org", "Python Software Foundation", "Netherlands", "Standard", 12400.75],
          ["Dennis Ritchie", "dennis@bell-labs.com", "Bell Labs", "United States", "Honorary", 75000.00],
          ["Ada Lovelace", "ada@babbage.engine", "Analytical Research", "United Kingdom", "Pioneering", 120000.00],
          ["Grace Hopper", "grace@navy.mil", "Naval Computing", "United States", "Pioneering", 88000.00],
          ["Ken Thompson", "ken@unix.org", "Bell Labs", "United States", "VIP", 62000.00],
          ["Bjarne Stroustrup", "bjarne@morgan.com", "C++ Standards", "United States", "Enterprise", 54000.00],
          ["Anders Hejlsberg", "anders@microsoft.com", "TypeScript / C#", "United States", "Enterprise", 67000.00],
          ["Sophie Wilson", "sophie@arm.com", "ARM Architecture", "United Kingdom", "VIP", 83000.00],
          ["Donald Knuth", "knuth@stanford.edu", "Stanford University", "United States", "Honorary", 99000.00],
        ];

        for (const [name, email, comp, country, tier, bal] of customers) {
          this.db.run(
            "INSERT INTO customers (name, email, company, country, tier, balance) VALUES (?, ?, ?, ?, ?, ?);",
            [name, email, comp, country, tier, bal]
          );
        }

        // 10 Products
        const products = [
          ["BUN-PRO-01", "Bun RAD Studio Workstation Pro", "Developer Tools", 499.00, 250, 4.9],
          ["SQL-IDE-02", "SQLite Studio Pro Dedicated License", "Developer Tools", 199.00, 500, 4.8],
          ["SRV-SYS-03", "Hardware Telemetry Probe Appliance", "Hardware", 1299.00, 45, 4.7],
          ["MEM-NVME-04", "Ultra-Fast PCI-e 5.0 NVMe 4TB", "Hardware", 389.00, 120, 4.9],
          ["NET-ROUT-05", "10GbE SFP+ Enterprise Core Switch", "Networking", 899.00, 60, 4.6],
          ["SEC-HSM-06", "Hardware Security Module KeyVault", "Security", 1499.00, 30, 5.0],
          ["RAM-ECC-07", "DDR5-5600 128GB ECC Workstation Kit", "Hardware", 549.00, 85, 4.8],
          ["ACC-PWR-08", "Titanium 1600W Silent ATX 3.0 PSU", "Power", 329.00, 150, 4.7],
          ["DSK-ENC-09", "8-Bay Thunderbolt 4 RAID Enclosure", "Storage", 799.00, 75, 4.5],
          ["SRV-ARM-10", "Ampere Altra 128-Core Compute Node", "Servers", 4899.00, 15, 4.9],
        ];

        for (const [sku, name, cat, price, stock, rating] of products) {
          this.db.run(
            "INSERT INTO products (sku, name, category, price, stock, rating) VALUES (?, ?, ?, ?, ?, ?);",
            [sku, name, cat, price, stock, rating]
          );
        }

        // 15 Orders with Items
        for (let i = 1; i <= 15; i++) {
          const custId = (i % 12) + 1;
          const orderNum = `ORD-2026-${1000 + i}`;
          const status = i % 4 === 0 ? "completed" : i % 3 === 0 ? "shipped" : "processing";
          const payMethod = i % 2 === 0 ? "Corporate Net-30" : "Credit Card";

          const prod1Id = (i % 10) + 1;
          const prod2Id = ((i + 3) % 10) + 1;
          const q1 = (i % 3) + 1;
          const q2 = 1;

          const p1 = (this.db.query("SELECT price FROM products WHERE id = ?;").get(prod1Id) as any)?.price || 199.0;
          const p2 = (this.db.query("SELECT price FROM products WHERE id = ?;").get(prod2Id) as any)?.price || 389.0;
          const totalAmount = Number((q1 * p1 + q2 * p2).toFixed(2));

          const orderRes = this.db.run(
            "INSERT INTO orders (customer_id, order_number, status, total_amount, payment_method) VALUES (?, ?, ?, ?, ?);",
            [custId, orderNum, status, totalAmount, payMethod]
          );
          const orderId = orderRes.lastInsertRowid;

          this.db.run("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?);", [
            orderId,
            prod1Id,
            q1,
            p1,
          ]);
          this.db.run("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?);", [
            orderId,
            prod2Id,
            q2,
            p2,
          ]);
        }

        this.db.run(`
          INSERT INTO audit_logs (action, entity, details) VALUES
            ('SYSTEM_BOOT', 'DATABASE', 'Enterprise schema and starter relational dataset seeded successfully.'),
            ('PRAGMA_INIT', 'DATABASE', 'Foreign keys enabled and WAL mode optimized.');
        `);
      }

      this.db.run("COMMIT;");
      return { success: true, count: 12 + 10 + 15 };
    } catch (err) {
      this.db.run("ROLLBACK;");
      throw err;
    }
  }

  private logAudit(action: string, entity: string, details: string) {
    try {
      this.db.run(
        "INSERT INTO audit_logs (action, entity, details) VALUES (?, ?, ?);",
        [action, entity, details.slice(0, 300)]
      );
    } catch {}
  }

  private extractColumnsFromQuery(sql: string): string[] {
    const match = sql.match(/SELECT\s+(.+?)\s+FROM/i);
    if (!match || !match[1]) return [];
    return match[1].split(",").map((s) => s.trim().split(/\s+as\s+/i).pop()!.trim().replace(/["'`]/g, ""));
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// -------------------------------------------------------------------------------------------------
// Native OS File Dialog Chooser
// -------------------------------------------------------------------------------------------------

export function pickNativeDatabaseFile(): string | null {
  try {
    if (process.platform === "darwin") {
      const script = `try
POSIX path of (choose file with prompt "Select SQLite Database File")
on error
return ""
end try`;
      const proc = Bun.spawnSync(["osascript", "-e", script]);
      const out = proc.stdout.toString().trim();
      return out || null;
    } else if (process.platform === "linux") {
      const proc = Bun.spawnSync([
        "zenity",
        "--file-selection",
        "--title=Select SQLite Database File",
        "--file-filter=SQLite Databases (*.db *.sqlite *.sqlite3)|*.db *.sqlite *.sqlite3 *.db3",
        "--file-filter=All Files|*",
      ]);
      const out = proc.stdout.toString().trim();
      return out || null;
    } else if (process.platform === "win32") {
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Select SQLite Database File'; $f.Filter = 'SQLite Database (*.sqlite;*.db;*.sqlite3;*.db3)|*.sqlite;*.db;*.sqlite3;*.db3|All Files (*.*)|*.*'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$f.FileName}`;
      const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", psScript]);
      const out = proc.stdout.toString().trim();
      return out || null;
    }
  } catch {
    // fallback
  }
  return null;
}

// -------------------------------------------------------------------------------------------------
// HTTP Telemetry Server Engine
// -------------------------------------------------------------------------------------------------

export function startSqliteStudioServer(options: ServerOptions = {}) {
  const port = options.port ?? 0;
  const hostname = options.host ?? "127.0.0.1";
  const manager = new SqliteManager(options.initialDbPath || ":memory:");

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS Headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // 1. Root HTML Workstation Shell
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(generateSqliteStudioHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          },
        });
      }

      // 2. Database KPIs Telemetry
      if (url.pathname === "/api/kpis" && req.method === "GET") {
        const kpis = manager.getKpis();
        return Response.json(kpis, { headers: corsHeaders });
      }

      // 3. Database Schema
      if (url.pathname === "/api/schema" && req.method === "GET") {
        const schema = manager.getSchema();
        return Response.json(schema, { headers: corsHeaders });
      }

      // 4. Execute Arbitrary SQL
      if (url.pathname === "/api/query" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string; params?: any[] };
          const result = manager.query(body.sql, body.params || []);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 5. Explain Query Plan
      if (url.pathname === "/api/explain" && req.method === "POST") {
        try {
          const body = (await req.json()) as { sql: string };
          const result = manager.explain(body.sql);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 6. Paginated Table Data
      if (url.pathname === "/api/table/data" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            table: string;
            page?: number;
            pageSize?: number;
            orderBy?: string;
            orderDir?: "ASC" | "DESC";
            search?: string;
          };
          const result = manager.getTableData(body.table, body);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 7. Table Mutation (Insert / Update / Delete)
      if (url.pathname === "/api/table/mutate" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            table: string;
            action: "insert" | "update" | "delete";
            payload: { rowId?: any; pkColumn?: string; data?: Record<string, any> };
          };
          const result = manager.mutateRow(body.table, body.action, body.payload);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8. Connect / Switch Database
      if (url.pathname === "/api/connect" && req.method === "POST") {
        try {
          const body = (await req.json()) as { path: string };
          const result = manager.connect(body.path);
          if (!result.success) {
            return Response.json(result, { status: 400, headers: corsHeaders });
          }
          return Response.json({
            ...result,
            kpis: manager.getKpis(),
            schema: manager.getSchema(),
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 8b. Browse Database via Native OS Dialog
      if (url.pathname === "/api/browse" && (req.method === "POST" || req.method === "GET")) {
        try {
          const selectedPath = pickNativeDatabaseFile();
          if (!selectedPath) {
            return Response.json({ success: false, cancelled: true, message: "File selection was cancelled." }, { headers: corsHeaders });
          }
          const connectRes = manager.connect(selectedPath);
          if (!connectRes.success) {
            return Response.json({ success: false, error: connectRes.error, path: selectedPath }, { status: 400, headers: corsHeaders });
          }
          return Response.json({
            success: true,
            path: selectedPath,
            name: basename(selectedPath),
            kpis: manager.getKpis(),
            schema: manager.getSchema(),
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8c. Workspace Discovered Databases List
      if (url.pathname === "/api/workspace-databases" && req.method === "GET") {
        try {
          const databases = manager.getWorkspaceDatabases();
          return Response.json({ success: true, databases }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 8d. Upload Database File (Browser & Drag-Drop Mode)
      if (url.pathname === "/api/upload-database" && req.method === "POST") {
        try {
          const formData = await req.formData();
          const file = formData.get("file") as File | null;
          if (!file) {
            return Response.json({ success: false, error: "No file provided in form data" }, { status: 400, headers: corsHeaders });
          }

          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const header = new TextDecoder().decode(bytes.slice(0, 15));
          if (!header.startsWith("SQLite format 3")) {
            return Response.json({
              success: false,
              error: "Invalid SQLite database file (missing 'SQLite format 3' header magic bytes)",
            }, { status: 400, headers: corsHeaders });
          }

          const uploadDir = resolve(process.cwd(), ".sqlite_uploads");
          try { mkdirSync(uploadDir, { recursive: true }); } catch {}
          const safeName = file.name ? basename(file.name) : `uploaded_${Date.now()}.db`;
          const savePath = resolve(uploadDir, safeName);
          writeFileSync(savePath, bytes);

          const connectRes = manager.connect(savePath);
          if (!connectRes.success) {
            return Response.json({ success: false, error: connectRes.error }, { status: 400, headers: corsHeaders });
          }

          return Response.json({
            success: true,
            path: savePath,
            name: safeName,
            kpis: manager.getKpis(),
            schema: manager.getSchema(),
          }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 9. Seed Dataset
      if (url.pathname === "/api/seed" && req.method === "POST") {
        try {
          const result = manager.seedEnterpriseDatabase();
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 10. Run PRAGMA
      if (url.pathname === "/api/pragma" && req.method === "POST") {
        try {
          const body = (await req.json()) as { pragma: string; value?: string };
          const result = manager.runPragma(body.pragma, body.value);
          return Response.json(result, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // 11. Export Query Results
      if (url.pathname === "/api/export" && req.method === "POST") {
        try {
          const body = (await req.json()) as {
            format: "csv" | "json" | "sql";
            tableName?: string;
            rows: Record<string, any>[];
          };

          if (!body.rows || body.rows.length === 0) {
            return Response.json({ success: false, error: "No rows provided for export" }, { status: 400, headers: corsHeaders });
          }

          const filename = `sqlite_export_${Date.now()}.${body.format}`;
          const exportPath = resolve(process.cwd(), filename);
          let content = "";

          if (body.format === "json") {
            content = JSON.stringify(body.rows, null, 2);
          } else if (body.format === "csv") {
            const headers = Object.keys(body.rows[0] || {});
            const lines = [headers.join(",")];
            for (const r of body.rows) {
              lines.push(headers.map((h) => JSON.stringify(r[h] ?? "")).join(","));
            }
            content = lines.join("\n");
          } else if (body.format === "sql") {
            const tbl = body.tableName || "exported_records";
            const headers = Object.keys(body.rows[0] || {});
            const lines = body.rows.map((r) => {
              const vals = headers.map((h) => {
                const v = r[h];
                if (v === null || v === undefined) return "NULL";
                if (typeof v === "number") return v;
                return `'${String(v).replace(/'/g, "''")}'`;
              });
              return `INSERT INTO "${tbl}" (${headers.map((h) => `"${h}"`).join(", ")}) VALUES (${vals.join(", ")});`;
            });
            content = lines.join("\n");
          }

          writeFileSync(exportPath, content, "utf8");
          return Response.json({ success: true, filename, path: exportPath, rowCount: body.rows.length }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // 12. Clipboard Copy Helper
      if (url.pathname === "/api/clipboard" && req.method === "POST") {
        try {
          const body = (await req.json()) as { text: string };
          if (process.platform === "darwin") {
            const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
            proc.stdin.write(body.text || "");
            proc.stdin.end();
            await proc.exited;
          }
          return Response.json({ success: true }, { headers: corsHeaders });
        } catch {
          return Response.json({ success: true, fallback: "Clipboard simulated" }, { headers: corsHeaders });
        }
      }

      // Shutdown / Close workstation
      if ((url.pathname === "/api/shutdown" || url.pathname === "/api/close") && (req.method === "POST" || req.method === "GET")) {
        setTimeout(() => process.exit(0), 100);
        return Response.json({ success: true, message: "Workstation shutting down..." }, { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

// -------------------------------------------------------------------------------------------------
// Worker Message Handling (Isolated OS Background Thread)
// -------------------------------------------------------------------------------------------------

if (!Bun.isMainThread && (!process.env.STUDIO_WORKER || process.env.STUDIO_WORKER === "sqlite_studio")) {
  const preferredPort = 0; // Dynamic ephemeral port prevents any collisions
  const initialDbPath = process.env.SQLITE_DB_PATH || ":memory:";
  const server = startSqliteStudioServer({ port: preferredPort, initialDbPath });

  (globalThis as any).postMessage({
    ready: true,
    type: "sqlite_studio",
    port: server.port,
    url: `http://127.0.0.1:${server.port}`,
  });
}

// -------------------------------------------------------------------------------------------------
// Standalone CLI Invocation
// -------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const preferredPort = Number(process.env.PORT) || 5757;
  const initialDb = process.argv[2] || ":memory:";
  const server = startSqliteStudioServer({ port: preferredPort, initialDbPath: initialDb });
  console.log(`\n⚡ -----------------------------------------------------------------`);
  console.log(`⚡ SQLite Studio Pro - Enterprise Database Workstation Server`);
  console.log(`⚡ Local URL:    http://127.0.0.1:${server.port}`);
  console.log(`⚡ Network URL:  http://localhost:${server.port}`);
  console.log(`⚡ Database:     ${initialDb}`);
  console.log(`⚡ -----------------------------------------------------------------\n`);
}
