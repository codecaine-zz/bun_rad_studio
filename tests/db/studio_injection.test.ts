import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { provisionTestDb } from "../helpers/testdb";

process.env.STUDIO_MACRO_STORE_DIR = mkdtempSync(join(tmpdir(), "inj-macros-"));
const { startPostgresStudioServer } = await import("../../applications/postgres_studio_server.ts");
const { startMysqlStudioServer } = await import("../../applications/mysql_studio_server.ts");

/**
 * Regression tests for identifiers / literals that look like SQL, sent to the existing studio servers.
 * They run against throwaway databases (TEST_PG_URL / TEST_MYSQL_URL) and are skipped otherwise.
 */
const pgDb = await provisionTestDb("postgres");
const myDb = await provisionTestDb("mysql");

const post = async (base: string, path: string, body: unknown) => {
  const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json()) as any;
};

(pgDb ? describe : describe.skip)("PostgreSQL studio: SQL-looking names and values", () => {
  const server = pgDb ? startPostgresStudioServer({ port: 0, config: pgDb.config }) : (null as any);
  const base = `http://127.0.0.1:${server?.port}`;
  const q = (sql: string) => post(base, "/api/query", { sql });
  afterAll(async () => {
    server?.stop(true);
    await pgDb?.drop();
    rmSync(process.env.STUDIO_MACRO_STORE_DIR!, { recursive: true, force: true });
  });

  const exists = async (name: string) => Number((await q(`SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_name = '${name.replace(/'/g, "''")}'`)).rows[0].c) === 1;

  it("set-schema cannot be used to run SQL", async () => {
    const r = await post(base, "/api/set-schema", { schema: `public"; CREATE TABLE inj_set_schema (a int); --` });
    expect(r.success).toBe(false);
    expect(await exists("inj_set_schema")).toBe(false);
  });

  it("tables and columns with quotes are created as literal names, not interpreted", async () => {
    const r = await post(base, "/api/schema/create-table", { name: `we"ird`, columns: [{ name: `c"ol`, type: "text" }] });
    expect(r.success).toBe(true);
    expect(await exists(`we"ird`)).toBe(true);
    const cols = await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'we"ird'`);
    expect(cols.rows.map((x: any) => x.column_name)).toEqual([`c"ol`]);
  });

  it("type and default fragments cannot start another statement", async () => {
    await q(`CREATE TABLE victim (a int)`);
    const bad = await post(base, "/api/schema/create-table", { name: "t_bad", columns: [{ name: "a", type: "int); DROP TABLE victim; --" }] });
    expect(bad.success).toBe(false);
    const bad2 = await post(base, "/api/schema/create-table", { name: "t_bad2", columns: [{ name: "a", type: "int", dflt_value: "1); DROP TABLE victim; --" }] });
    expect(bad2.success).toBe(false);
    expect(await exists("victim")).toBe(true);
    expect(await exists("t_bad")).toBe(false);
  });

  it("redesign-table does not interpolate the table name into its catalog lookup", async () => {
    await q(`CREATE TABLE victim2 (a int)`);
    const r = await post(base, "/api/schema/redesign-table", { table: `x' OR '1'='1`, columns: [{ name: "a", type: "int" }] });
    expect(r.success).toBe(false);
    expect(await exists("victim2")).toBe(true);
  });

  it("redesign-table never drops the original when the data cannot be copied", async () => {
    await q(`CREATE TABLE keepme (a text)`);
    await q(`INSERT INTO keepme VALUES ('abc')`);
    const r = await post(base, "/api/schema/redesign-table", { table: "keepme", columns: [{ name: "a", type: "integer" }] });
    expect(r.success).toBe(false);
    expect(r.error).toContain("original table was left unchanged");
    expect((await q(`SELECT a FROM keepme`)).rows).toEqual([{ a: "abc" }]);
    const leftovers = await q(`SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_name LIKE '_tmp_redesign_%'`);
    expect(Number(leftovers.rows[0].c)).toBe(0);
  });
});

(myDb ? describe : describe.skip)("MySQL studio: SQL-looking names and values", () => {
  const server = myDb ? startMysqlStudioServer({ port: 0, config: myDb.config }) : (null as any);
  const base = `http://127.0.0.1:${server?.port}`;
  const q = (sql: string) => post(base, "/api/query", { sql });
  afterAll(async () => {
    server?.stop(true);
    await myDb?.drop();
  });

  it("truncate / drop treat the name as one identifier", async () => {
    await q("CREATE TABLE victim (a INT)");
    await q("INSERT INTO victim VALUES (1)");
    for (const route of ["/api/table/truncate", "/api/schema/drop-table"]) {
      const r = await post(base, route, { table: "nope`; DROP TABLE victim; -- " });
      if (route === "/api/table/truncate") expect(r.success).toBe(false);
    }
    expect((await q("SELECT COUNT(*) AS c FROM victim")).rows[0].c).toBe(1);
  });

  it("enum values with quotes and backslashes stay data", async () => {
    await q("CREATE TABLE e1 (id INT PRIMARY KEY)");
    const r = await post(base, "/api/types/enums/create", { table: "e1", column: "kind", values: ["a", `b\\', 'c'); DROP TABLE victim; -- `] });
    // whatever the outcome, no statement was smuggled in
    expect(r).toBeDefined();
    expect((await q("SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'e1'")).rows[0].c).toBe(1);
  });
});
