import { describe, it, expect, afterAll } from "bun:test";
import {
  formatSqlDialect,
  buildColumnFilterWhere,
  buildOrderClause,
  computeSchemaDiffDdl,
} from "../../src/shared/studioServerEnhancements";
import { startSqliteStudioServer } from "../../applications/sqlite_studio_server";
import { startMysqlStudioServer } from "../../applications/mysql_studio_server";
import { startPostgresStudioServer } from "../../applications/postgres_studio_server";
import { generateSqliteStudioHtml } from "../../applications/sqlite_studio";
import { generateMysqlStudioHtml } from "../../applications/mysql_studio";
import { generatePostgresStudioHtml } from "../../applications/postgres_studio";
import { generateSqlCode } from "../../applications/studio_codegen";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { ProfileStore, MemorySecretStore } from "../../src/db/profiles";
import { WorkbenchService } from "../../src/db/service";
import { createWorkbenchHandler } from "../../src/db/workbench_http";
import { generateWorkbenchHtml } from "../../src/db/workbench_ui";

describe("Studio Server Enhancements (SQL Formatting, Column Filters, Multi-Sort, Schema Diff)", () => {
  it("formats SQL across sqlite, mysql, and postgres dialects", () => {
    const formatted = formatSqlDialect("select a,b from users where id=1 order by a desc", "sqlite");
    expect(formatted).toContain("SELECT");
    expect(formatted).toContain("FROM");
    expect(formatted).toContain("WHERE");

    const pgFormatted = formatSqlDialect("select id, payload from events where created_at > now()", "postgres");
    expect(pgFormatted).toContain("SELECT");
    expect(pgFormatted).toContain("FROM");
  });

  it("builds parameterized per-column WHERE clauses for sqlite, mysql, and postgres", () => {
    const validCols = ["id", "name", "balance", "notes"];
    const sqliteClause = buildColumnFilterWhere(
      { name: "Alice", balance: ">=100", notes: "NULL", malicious: "1=1" },
      validCols,
      "sqlite"
    );
    expect(sqliteClause.clauses.length).toBe(3);
    expect(sqliteClause.params).toEqual(["%Alice%", 100]);
    expect(sqliteClause.clauses.some((c) => c.includes("IS NULL"))).toBe(true);

    const pgClause = buildColumnFilterWhere(
      { name: "=Bob", balance: "<50" },
      validCols,
      "postgres",
      3
    );
    expect(pgClause.clauses).toEqual([
      'CAST("name" AS TEXT) = $3',
      'CAST("balance" AS DOUBLE PRECISION) < $4',
    ]);
    expect(pgClause.params).toEqual(["Bob", 50]);
  });

  it("builds multi-column ORDER BY clauses and ignores invalid columns", () => {
    const validCols = ["id", "tier", "balance"];
    const order = buildOrderClause(validCols, "sqlite", {
      sortColumns: [
        { col: "tier", dir: "ASC" },
        { col: "invalid_col", dir: "DESC" },
        { col: "balance", dir: "DESC" },
      ],
    });
    expect(order).toBe('ORDER BY "tier" ASC, "balance" DESC');

    const fallback = buildOrderClause(validCols, "mysql", {
      sortColumns: [],
      orderBy: "id",
      orderDir: "DESC",
    });
    expect(fallback).toBe("ORDER BY `id` DESC");
  });

  it("computes Schema Diff & Migration DDL for added, dropped, and modified tables", () => {
    const before = [
      {
        name: "users",
        columns: [
          { name: "id", type: "INTEGER", pk: true, notnull: true },
          { name: "email", type: "TEXT", pk: false, notnull: true },
        ],
      },
      {
        name: "legacy_logs",
        columns: [{ name: "id", type: "INTEGER", pk: true }],
      },
    ];
    const after = [
      {
        name: "users",
        columns: [
          { name: "id", type: "INTEGER", pk: true, notnull: true },
          { name: "email", type: "TEXT", pk: false, notnull: true },
          { name: "role", type: "TEXT", pk: false, notnull: false, dflt_value: "'member'" },
        ],
      },
      {
        name: "orders",
        columns: [
          { name: "id", type: "INTEGER", pk: true, notnull: true },
          { name: "user_id", type: "INTEGER", pk: false, notnull: true },
        ],
      },
    ];

    const diff = computeSchemaDiffDdl(before, after, "sqlite");
    expect(diff.summary.addedTables).toEqual(["orders"]);
    expect(diff.summary.removedTables).toEqual(["legacy_logs"]);
    expect(diff.summary.modifiedTables).toEqual(["users"]);
    expect(diff.ddl).toContain('DROP TABLE "legacy_logs";');
    expect(diff.ddl).toContain('CREATE TABLE "orders"');
    expect(diff.ddl).toContain('ALTER TABLE "users" ADD COLUMN "role" TEXT DEFAULT \'member\';');
  });
});

describe("Studio HTTP Endpoints (/api/sql/format, /api/schema/diff, /api/table/data columnFilters & sortColumns)", () => {
  const sqlite = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:" });
  const mysql = startMysqlStudioServer({ port: 0, config: { host: "127.0.0.1", port: 1, user: "u", database: "d" } });
  const pg = startPostgresStudioServer({ port: 0, config: { host: "127.0.0.1", port: 1, user: "u", database: "d" } });

  afterAll(() => {
    for (const s of [sqlite, mysql, pg]) {
      try { s.stop(true); } catch {}
    }
  });

  const post = async (port: number, path: string, body: any) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json() as any;
  };

  it("supports server-side columnFilters and multi-column sortColumns on /api/table/data", async () => {
    await post(Number(sqlite.port), "/api/query", {
      sql: `
        CREATE TABLE accounts (id INTEGER PRIMARY KEY, tier TEXT, score INTEGER);
        INSERT INTO accounts (tier, score) VALUES
          ('gold', 10),
          ('gold', 30),
          ('silver', 25),
          ('gold', 20);
      `,
    });

    const res = await post(Number(sqlite.port), "/api/table/data", {
      table: "accounts",
      page: 1,
      pageSize: 10,
      columnFilters: { tier: "=gold", score: ">=20" },
      sortColumns: [
        { col: "tier", dir: "ASC" },
        { col: "score", dir: "DESC" },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.totalRows).toBe(2);
    expect(res.rows.map((r: any) => r.score)).toEqual([30, 20]);
  });

  it("exposes /api/sql/format and /api/schema/diff across SQLite, MySQL, and Postgres studio servers", async () => {
    for (const srv of [sqlite, mysql, pg]) {
      const fmt = await post(Number(srv.port), "/api/sql/format", {
        sql: "select id, name from accounts where id = 1",
      });
      expect(fmt.success).toBe(true);
      expect(fmt.formatted).toContain("SELECT");

      const diff = await post(Number(srv.port), "/api/schema/diff", {
        baselineTables: [],
        targetTables: [
          {
            name: "audit_events",
            columns: [{ name: "id", type: "INTEGER", pk: true, notnull: true }],
          },
        ],
      });
      expect(diff.success).toBe(true);
      expect(diff.summary.addedTables).toEqual(["audit_events"]);
      expect(diff.ddl).toContain("CREATE TABLE");
    }
  });
});

describe("Codegen New Targets (bun-sql and typescript) & Studio HTML Injection", () => {
  it("generates native Bun.sql code preserving Postgres/MySQL syntax and TypeScript row interfaces", () => {
    const pgCode = generateSqlCode(
      'SELECT id, email FROM users WHERE email ILIKE [Enter Email Pattern]',
      "bun-sql",
      { sourceDialect: "postgres" },
      "find_users"
    );
    expect(pgCode.code).toContain('import { SQL } from "bun";');
    expect(pgCode.code).toContain("ILIKE $1");
    expect(pgCode.code).toContain("await db.unsafe(");

    const tsCode = generateSqlCode(
      "CREATE TABLE products (id INTEGER PRIMARY KEY, title TEXT NOT NULL, price REAL); SELECT id, title, price FROM products WHERE price >= [Enter Min Price];",
      "typescript",
      { sourceDialect: "sqlite" },
      "product_Catalog"
    );
    expect(tsCode.code).toContain("export interface ProductsRow");
    expect(tsCode.code).toContain('"id": number;');
    expect(tsCode.code).toContain('"title": string;');
    expect(tsCode.code).toContain('"price": number | null;');
    expect(tsCode.code).toContain("export function runProductCatalog");
  });

  it("embeds StudioIdeEnhancements and new codegen targets across all 3 studio HTML pages with valid script syntax", () => {
    for (const html of [generateSqliteStudioHtml(), generateMysqlStudioHtml(), generatePostgresStudioHtml()]) {
      expect(html).toContain("StudioIdeEnhancements");
      expect(html).toContain("studioWorksheetBar");
      expect(html).toContain("studioRowInspector");
      expect(html).toContain("studioSchemaSubnav");
      expect(html).toContain("setCodeGenTarget('bun-sql')");
      expect(html).toContain("setCodeGenTarget('typescript')");

      const scripts = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi) || [];
      for (const tag of scripts) {
        const code = tag.replace(/<\/?script[\s\S]*?>/gi, "");
        if (code.trim()) {
          expect(() => new Function(code)).not.toThrow();
        }
      }
    }
  });

  it("supports /api/v2/format and /api/v2/describe-all in Workbench v2 and renders new Workbench UI controls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wb-ide-test-"));
    const dbPath = join(dir, "test.db");
    const db = new Database(dbPath);
    db.run("CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES authors(id));");
    db.close();

    const service = new WorkbenchService(new ProfileStore(join(dir, "profiles"), new MemorySecretStore()));
    const handler = createWorkbenchHandler(service);
    try {
      const call = async (path: string, body: unknown) => {
        const r = await handler.handle(
          new Request("http://127.0.0.1" + path, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Workbench-Token": handler.token },
            body: JSON.stringify(body),
          })
        );
        return (await r!.json()) as any;
      };

      const prof = await call("/api/v2/profiles/save", {
        profile: { name: "mem", engine: "sqlite", path: dbPath, sqliteMode: "readwrite" },
      });
      const profileId = prof.profile.id;
      const conn = await call("/api/v2/connect", { profileId });
      const connectionId = conn.connection.connectionId;

      const fmt = await call("/api/v2/format", { engine: "sqlite", sql: "select * from books where author_id=1" });
      expect(fmt.ok).toBe(true);
      expect(fmt.formatted).toContain("SELECT");

      const descAll = await call("/api/v2/describe-all", { connectionId });
      expect(descAll.ok).toBe(true);
      expect(descAll.tables.map((t: any) => t.name).sort()).toEqual(["authors", "books"]);

      const wbHtml = generateWorkbenchHtml({ token: "t" });
      expect(wbHtml).toContain("btnFormatSql");
      expect(wbHtml).toContain("btnErDiagram");
      expect(wbHtml).toContain("rowInspector");
      expect(wbHtml).toContain("sqlTabs");
    } finally {
      await service.closeAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
