import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { createAdapter } from "../src/db";
import { provisionTestDb, type TestDb } from "./helpers/testdb";
import { STUDIO_COLUMNS_SCRIPT, STUDIO_COLUMNS_STYLE } from "../src/shared/studioColumns";
import { STUDIO_POLISH_SCRIPT, STUDIO_POLISH_STYLE } from "../src/shared/studioPolish";

const storeDir = mkdtempSync(join(tmpdir(), "studio-cols-macros-"));
process.env.STUDIO_MACRO_STORE_DIR = storeDir;
const { generateSqliteStudioHtml } = await import("../applications/sqlite_studio.ts");
const { generateMysqlStudioHtml } = await import("../applications/mysql_studio.ts");
const { generatePostgresStudioHtml } = await import("../applications/postgres_studio.ts");
const { startSqliteStudioServer } = await import("../applications/sqlite_studio_server.ts");
const { startMysqlStudioServer } = await import("../applications/mysql_studio_server.ts");
const { startPostgresStudioServer } = await import("../applications/postgres_studio_server.ts");

afterAll(() => rmSync(storeDir, { recursive: true, force: true }));

const COLS = ["id", "sku", "full_name", "email", "country", "balance", "qty", "is_active", "created_at", "notes", "rating", "tags", "city", "postal_code"];
const rowsSql = (bool: (n: number) => string) =>
  Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    return `(${n}, 'SKU-${1000 + n}', 'Customer ${n} with a long display name', ${n % 4 === 0 ? "NULL" : `'u${n}@example.com'`}, 'US', ${n * 10.5}, ${n}, ${bool(n)}, '2024-01-0${(n % 9) + 1} 10:00:00', ${n % 3 === 0 ? "NULL" : "'some longer free text for the notes column'"}, ${n / 10}, 'a,b', 'Austin', '1000${n}')`;
  }).join(", ");
const INSERT = (bool: (n: number) => string) => `INSERT INTO wide (${COLS.join(", ")}) VALUES ${rowsSql(bool)}`;

describe("the three studio pages carry the shared Columns control and polish", () => {
  const pages: [string, string][] = [
    ["sqlite", generateSqliteStudioHtml()],
    ["mysql", generateMysqlStudioHtml()],
    ["postgres", generatePostgresStudioHtml()],
  ];

  it("embeds identical Columns / polish code in every studio, with no remote dependencies", () => {
    for (const [name, html] of pages) {
      expect(html, name).toContain(STUDIO_COLUMNS_SCRIPT);
      expect(html, name).toContain(STUDIO_COLUMNS_STYLE);
      expect(html, name).toContain(STUDIO_POLISH_SCRIPT);
      expect(html, name).toContain(STUDIO_POLISH_STYLE);
      expect(html, name).toContain("StudioCols.create(");
      expect(html, name).not.toMatch(/<(script|link)[^>]+(src|href)=["']https?:/i);
      expect(html, name).not.toMatch(/@import|url\(["']?https?:/i);
    }
  });

  it("every inline script still parses", () => {
    for (const [name, html] of pages) {
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
      expect(scripts.length, name).toBeGreaterThan(3);
      for (const s of scripts) expect(() => new Function(s), name).not.toThrow();
    }
  });

  it("uses the documented ids: Columns hosts, export buttons, strip anchor", () => {
    for (const [name, html] of pages) {
      expect(html, name).toContain('id="btnToggleTotals"');
      expect(html, name).toContain('id="gridTableContainer"');
      expect(html, name).toContain('id="btnExportCsv"');
    }
    expect(pages[2]![1]).toContain('id="sqlResultsActions"');
    expect(pages[2]![1]).toContain("studioSqlCols");
  });

  it("the polish keeps light and dark themes working: colors come from the theme variables", () => {
    expect(STUDIO_POLISH_STYLE).toContain("color-mix(in srgb, var(--text-main)");
    expect(STUDIO_POLISH_STYLE).toContain("prefers-reduced-motion");
    expect(STUDIO_POLISH_STYLE).toContain(":focus-visible");
    expect(STUDIO_COLUMNS_STYLE).toContain("var(--bg-surface)");
  });
});

const node = Bun.which("node");

async function runUi(base: string, engine: string) {
  const proc = Bun.spawn([node!, "--test", "--test-force-exit", "--test-reporter=spec", join(import.meta.dir, "studio_columns.node.mjs")], {
    env: { ...process.env, SC_BASE: base, SC_ENGINE: engine, SC_TABLE: "wide", SC_COLS: JSON.stringify(COLS), NODE_NO_WARNINGS: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0 || process.env.SC_VERBOSE) console.log(out + err);
  return code;
}

(node ? describe : describe.skip)("Columns control in the page (jsdom under Node against the real server)", () => {
  it("SQLite studio: hide / show / persist / header menu / export rule / keyboard", async () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-cols-sqlite-"));
    const path = join(dir, "wide.db");
    const db = new Database(path);
    db.run(`CREATE TABLE wide (id INTEGER PRIMARY KEY, sku TEXT NOT NULL, full_name TEXT, email TEXT, country TEXT, balance REAL, qty INTEGER, is_active INTEGER, created_at TEXT, notes TEXT, rating REAL, tags TEXT, city TEXT, postal_code TEXT)`);
    db.run("CREATE INDEX idx_wide_sku ON wide(sku)");
    db.run(INSERT((n) => String(n % 2)));
    db.close();
    const server = startSqliteStudioServer({ port: 0, initialDbPath: path });
    try {
      expect(await runUi(`http://127.0.0.1:${server.port}`, "sqlite")).toBe(0);
    } finally {
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 180_000);

  for (const engine of ["mysql", "postgres"] as const) {
    it(`${engine === "mysql" ? "MySQL" : "PostgreSQL"} studio (needs TEST_${engine === "mysql" ? "MYSQL" : "PG"}_URL)`, async () => {
      const t: TestDb | null = await provisionTestDb(engine);
      if (!t) return; // skipped: no throwaway server configured, see docs/testing/database-tests.md
      let server: any;
      try {
        const a = createAdapter({ engine, ...t.config, allowPublicKeyRetrieval: true } as any);
        await a.connect();
        await a.query(
          engine === "mysql"
            ? "CREATE TABLE wide (id INT PRIMARY KEY, sku VARCHAR(20) NOT NULL, full_name VARCHAR(200), email VARCHAR(200), country CHAR(2), balance DECIMAL(12,2), qty INT, is_active TINYINT(1), created_at DATETIME, notes TEXT, rating DOUBLE, tags VARCHAR(100), city VARCHAR(60), postal_code VARCHAR(12), INDEX idx_wide_sku (sku))"
            : "CREATE TABLE wide (id INT PRIMARY KEY, sku VARCHAR(20) NOT NULL, full_name VARCHAR(200), email VARCHAR(200), country CHAR(2), balance NUMERIC(12,2), qty INT, is_active BOOLEAN, created_at TIMESTAMP, notes TEXT, rating DOUBLE PRECISION, tags VARCHAR(100), city VARCHAR(60), postal_code VARCHAR(12))",
        );
        await a.query(INSERT(engine === "mysql" ? (n) => String(n % 2) : (n) => (n % 2 ? "TRUE" : "FALSE")));
        await a.close();
        server = engine === "mysql" ? startMysqlStudioServer({ port: 0, config: t.config as any }) : startPostgresStudioServer({ port: 0, config: t.config as any });
        expect(await runUi(`http://127.0.0.1:${server.port}`, engine)).toBe(0);
      } finally {
        server?.stop(true);
        await t.drop();
      }
    }, 180_000);
  }
});
