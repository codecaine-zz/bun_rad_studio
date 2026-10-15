import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { createAdapter } from "../src/db";
import { provisionTestDb } from "./helpers/testdb";

const storeDir = mkdtempSync(join(tmpdir(), "studio-shortcuts-macros-"));
process.env.STUDIO_MACRO_STORE_DIR = storeDir;
const { generateSqliteStudioHtml } = await import("../applications/sqlite_studio.ts");
const { generateMysqlStudioHtml } = await import("../applications/mysql_studio.ts");
const { generatePostgresStudioHtml } = await import("../applications/postgres_studio.ts");
const { startSqliteStudioServer } = await import("../applications/sqlite_studio_server.ts");
const { startMysqlStudioServer } = await import("../applications/mysql_studio_server.ts");
const { startPostgresStudioServer } = await import("../applications/postgres_studio_server.ts");
afterAll(() => rmSync(storeDir, { recursive: true, force: true }));

describe("the designer Run button in the page sources", () => {
  const pages: [string, string][] = [
    ["sqlite", generateSqliteStudioHtml()],
    ["mysql", generateMysqlStudioHtml()],
    ["postgres", generatePostgresStudioHtml()],
  ];
  it("every studio carries the shortcut module and renders the Run button through the active-view dispatcher", () => {
    for (const [name, html] of pages) {
      expect(html, name).toContain("window.runDesignerActive");
      expect(html, name).toContain("StudioShortcuts.runHint()");
      expect(html, name).toContain('onclick="runDesignerActive()"');
      expect(html, name).not.toMatch(/qbe-btn-run"[^>]*onclick="runDesignerQuery\(\)"/);
    }
  });
});

const node = Bun.which("node");
async function runUi(base: string, engine: string) {
  const proc = Bun.spawn([node!, "--test", "--test-force-exit", "--test-reporter=spec", join(import.meta.dir, "studio_shortcuts.node.mjs")], {
    env: { ...process.env, SS_BASE: base, SS_ENGINE: engine, NODE_NO_WARNINGS: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0 || process.env.SC_VERBOSE) console.log(out + err);
  return code;
}
const WIDE: Record<string, string> = {
  sqlite: "CREATE TABLE wide (id INTEGER PRIMARY KEY, sku TEXT, full_name TEXT)",
  mysql: "CREATE TABLE wide (id INT PRIMARY KEY, sku VARCHAR(20), full_name VARCHAR(100))",
  postgres: "CREATE TABLE wide (id INT PRIMARY KEY, sku VARCHAR(20), full_name VARCHAR(100))",
};
const ROWS = "INSERT INTO wide (id, sku, full_name) VALUES (1,'a','Ann'),(2,'b','Bob'),(3,'c','Cy')";

(node ? describe : describe.skip)("Designer Run shortcut in the page (jsdom under Node against the real server)", () => {
  it("SQLite studio", async () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-shortcuts-"));
    const path = join(dir, "w.db");
    const db = new Database(path);
    db.run(WIDE.sqlite!);
    db.run(ROWS);
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
    it(`${engine === "mysql" ? "MySQL" : "PostgreSQL"} studio (needs a throwaway server)`, async () => {
      const t = await provisionTestDb(engine);
      if (!t) return;
      let server: any;
      try {
        const a = createAdapter({ engine, ...t.config, allowPublicKeyRetrieval: true } as any);
        await a.connect();
        await a.query(WIDE[engine]!);
        await a.query(ROWS);
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
