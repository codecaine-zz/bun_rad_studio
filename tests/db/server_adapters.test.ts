import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createAdapter, DbError, type DbAdapter, type ConnectionConfig, type Engine } from "../../src/db";
import { provisionTestDb, type TestDb } from "../helpers/testdb";

/**
 * Integration tests for the MySQL and PostgreSQL adapters. They run against throwaway databases
 * (TEST_MYSQL_URL / TEST_PG_URL, see docs/DATABASE_TESTING.md) and are skipped otherwise.
 */
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof DbError ? e.code : `other: ${String(e)}`;
  }
};

for (const engine of ["mysql", "postgres"] as const) {
  const testDb: TestDb | null = await provisionTestDb(engine);
  const suite = testDb ? describe : describe.skip;
  const my = engine === "mysql";
  const q = (n: string) => (my ? `\`${n}\`` : `"${n}"`);

  suite(`${engine} adapter`, () => {
    let a: DbAdapter;
    const cfg = (extra: Partial<ConnectionConfig> = {}): ConnectionConfig => ({ engine, ...testDb!.config, allowPublicKeyRetrieval: true, ...extra });
    const T = (name: string) => ({ name, type: "table" as const, ...(my ? {} : { schema: "public" }) });

    beforeAll(async () => {
      a = createAdapter(cfg());
      await a.connect();
      const intType = my ? "INT" : "INTEGER";
      await a.query(`CREATE TABLE ${q("vals")} (id BIGINT PRIMARY KEY, dcm DECIMAL(30,10), u ${my ? "VARCHAR(100)" : "TEXT"}, n ${my ? "VARCHAR(10)" : "TEXT"}, e ${my ? "VARCHAR(10)" : "TEXT"}, b ${my ? "BLOB" : "BYTEA"}, j ${my ? "JSON" : "JSONB"}, ts ${my ? "DATETIME(3)" : "TIMESTAMPTZ"})`);
      await a.query(`CREATE TABLE ${q("parent")} (id ${intType} PRIMARY KEY, name VARCHAR(50) NOT NULL)`);
      await a.query(`CREATE TABLE ${q("child")} (id ${intType} PRIMARY KEY, parent_id ${intType}, note VARCHAR(50), CONSTRAINT fk_child_parent FOREIGN KEY (parent_id) REFERENCES ${q("parent")}(id))`);
      await a.query(`CREATE INDEX idx_child_note ON ${q("child")}(note)`);
      await a.query(`CREATE TABLE ${q("comp")} (a ${intType}, b ${intType}, v VARCHAR(50), PRIMARY KEY (a, b))`);
      await a.query(`CREATE TABLE ${q("nokey")} (x ${intType}, y VARCHAR(10))`);
      await a.query(`CREATE VIEW ${q("pv")} AS SELECT id, name FROM ${q("parent")}`);
      await a.query(`INSERT INTO ${q("comp")} VALUES (1,1,'x'),(1,2,'y'),(2,1,'z')`);
    });
    afterAll(async () => {
      await a?.close();
      await testDb?.drop();
    });

    describe("connection", () => {
      it("reports version, database and capabilities with explanations", async () => {
        const info = await a.ping();
        expect(info.currentDatabase).toBe(testDb!.name);
        const caps = await a.capabilities();
        expect(caps.engine).toBe(engine);
        expect(caps.cancelQuery).toBe(true);
        expect(caps.transactionalDdl).toBe(!my);
        if (my) expect(caps.notes.transactionalDdl).toContain("implicitly");
      });

      it("turns failures into actionable, credential-free errors", async () => {
        const bad = createAdapter(cfg({ password: "definitely-wrong-password-xyz" }));
        let connected = false;
        try {
          await bad.connect();
          connected = true; // e.g. a local PostgreSQL configured with trust authentication
        } catch (e) {
          expect(e).toBeInstanceOf(DbError);
          expect((e as DbError).code).toBe("AUTH_FAILED");
          expect((e as DbError).message).not.toContain("definitely-wrong-password-xyz");
          expect((e as DbError).hint).toBeTruthy();
        }
        if (connected) await bad.close();
        expect(await code(createAdapter(cfg({ port: 1, connectTimeoutMs: 2000 })).connect())).toBe("CONNECTION_REFUSED");
        expect(await code(createAdapter(cfg({ database: "bunrad_no_such_db_zz" })).connect())).toBe("DATABASE_NOT_FOUND");
      });
    });

    describe("value fidelity", () => {
      it("round-trips exact integers, decimals, Unicode, NULL vs empty, binary, JSON", async () => {
        const bin = Buffer.from([0, 255, 16, 128]).toString("base64");
        await a.query(`INSERT INTO ${q("vals")} (id, dcm, u, n, e, b, j) VALUES (${my ? "?, ?, ?, ?, ?, ?, ?" : "$1, $2, $3, $4, $5, $6, $7"})`, [
          { $bigint: "9223372036854775807" },
          { $decimal: "12345678901234567890.1234567890" },
          "héllo 日本語 🚀 'quoted' \"dq\" \\ ; --",
          null,
          "",
          { $binary: bin },
          { $json: { a: [1, 2, { b: null }], s: "x" } },
        ]);
        const row = (await a.query(`SELECT * FROM ${q("vals")} WHERE id = ${my ? "?" : "$1"}`, [{ $bigint: "9223372036854775807" }])).rows[0]!;
        expect(row.id).toBe("9223372036854775807");
        expect(row.dcm).toBe("12345678901234567890.1234567890");
        expect(row.u).toBe("héllo 日本語 🚀 'quoted' \"dq\" \\ ; --");
        expect(row.n).toBeNull();
        expect(row.e).toBe("");
        expect(row.b).toEqual({ $binary: bin });
        expect(row.j).toEqual({ a: [1, 2, { b: null }], s: "x" });
      });

      it("neighbouring big integers are distinguished exactly", async () => {
        await a.query(`INSERT INTO ${q("vals")} (id) VALUES (${my ? "?" : "$1"})`, [{ $bigint: "9223372036854775806" }]);
        const r = await a.query(`SELECT id FROM ${q("vals")} WHERE id = ${my ? "?" : "$1"}`, [{ $bigint: "9223372036854775806" }]);
        expect(r.rows.map((x) => x.id)).toEqual(["9223372036854775806"]);
      });

      it("keeps a naive DATETIME exactly as stored when browsing (MySQL) and a timestamptz instant (PostgreSQL)", async () => {
        const ins = my ? "2024-01-02 03:04:05.678" : "2024-01-02 03:04:05.678+05";
        await a.query(`INSERT INTO ${q("vals")} (id, ts) VALUES (${my ? "?" : "$1"}, ${my ? "?" : "$2"})`, my ? [{ $bigint: "5" }, ins] : [{ $bigint: "5" }, ins]);
        const page = await a.browse({ table: T("vals"), limit: 10, offset: 0, filters: [{ column: "id", op: "eq", value: { $bigint: "5" } }] });
        expect(page.rows[0]!.ts).toBe(my ? "2024-01-02 03:04:05.678" : "2024-01-01T22:04:05.678Z");
      });

      it("treats SQL-looking parameters as data", async () => {
        await a.query(`INSERT INTO ${q("parent")} (id, name) VALUES (${my ? "?, ?" : "$1, $2"})`, [100, `x'); DROP TABLE ${q("parent")}; --`]);
        expect((await a.query(`SELECT name FROM ${q("parent")} WHERE id = 100`)).rows[0]!.name).toContain("DROP TABLE");
        expect((await a.listObjects()).some((o) => o.name === "parent")).toBe(true);
      });

      it("rejects multiple statements in query() and splits correctly around quoted semicolons", async () => {
        expect(await code(a.query("SELECT 1; SELECT 2"))).toBe("INVALID_REQUEST");
        expect((await a.query("SELECT 'a;b' AS s")).rows[0]!.s).toBe("a;b");
      });
    });

    describe("transactions, timeouts, cancel", () => {
      it("commits and rolls back on an isolated session", async () => {
        const s = await a.openSession();
        await s.begin();
        await s.query(`INSERT INTO ${q("parent")} (id, name) VALUES (201, 'tx')`);
        expect(s.inTransaction).toBe(true);
        expect(Number((await a.query(`SELECT COUNT(*) AS n FROM ${q("parent")} WHERE id = 201`)).rows[0]!.n)).toBe(0); // other connection cannot see it
        await s.rollback();
        expect(Number((await a.query(`SELECT COUNT(*) AS n FROM ${q("parent")} WHERE id = 201`)).rows[0]!.n)).toBe(0);
        await s.begin();
        await s.query(`INSERT INTO ${q("parent")} (id, name) VALUES (202, 'tx2')`);
        await s.commit();
        expect(Number((await a.query(`SELECT COUNT(*) AS n FROM ${q("parent")} WHERE id = 202`)).rows[0]!.n)).toBe(1);
        await s.close();
      });

      it("cancels a running statement through the server", async () => {
        const s = await a.openSession();
        const sleeping = s.query(my ? "SELECT SLEEP(5) AS s" : "SELECT pg_sleep(5)");
        await Bun.sleep(300);
        const t0 = performance.now();
        expect(await s.cancel()).toBe(true);
        const outcome = await sleeping.then(
          (r) => ({ ok: true, r }),
          (e) => ({ ok: false, e }),
        );
        expect(performance.now() - t0).toBeLessThan(3000);
        // PostgreSQL raises an error; MySQL returns early from SLEEP with a non-zero result.
        if (!my) expect((outcome as any).ok).toBe(false);
        else expect(outcome.ok === false || String((outcome as any).r.rows[0].s) !== "0").toBe(true);
        await s.close();
      });

      it("enforces a server-side statement timeout", async () => {
        const t = createAdapter(cfg({ statementTimeoutMs: 300 }));
        await t.connect();
        const t0 = performance.now();
        const c = await code(t.query(my ? "SELECT SLEEP(5) AS s" : "SELECT pg_sleep(5)").then((r) => (my && String(r.rows[0]!.s) !== "0" ? Promise.reject(new DbError("TIMEOUT", "interrupted")) : r)));
        expect(performance.now() - t0).toBeLessThan(3000);
        expect(c === "TIMEOUT" || c === "CANCELED").toBe(true);
        await t.close();
      });
    });

    describe("read-only enforcement", () => {
      it("blocks writes, DDL and attempts to undo read-only mode", async () => {
        const ro = createAdapter(cfg({ readOnly: true }));
        await ro.connect();
        expect((await ro.capabilities()).readOnlyEnforcement).toBe("transaction");
        expect((await ro.query(`SELECT COUNT(*) AS n FROM ${q("comp")}`)).rows[0]!.n).toBeDefined();
        for (const stmt of [
          `INSERT INTO ${q("comp")} VALUES (9,9,'no')`,
          `UPDATE ${q("comp")} SET v = 'no'`,
          `DELETE FROM ${q("comp")}`,
          `DROP TABLE ${q("comp")}`,
          `CREATE TABLE ${q("zz")} (a INT)`,
          "COMMIT",
          my ? "SET SESSION transaction_read_only = 0" : "SET default_transaction_read_only = off",
          my ? "SET SESSION TRANSACTION READ WRITE" : "SET TRANSACTION READ WRITE",
        ]) expect(await code(ro.query(stmt))).toBe("READ_ONLY");
        // multi-statement bypass attempt (COMMIT; INSERT ...) must not reach the server as one batch
        expect(await code(ro.query(`COMMIT; INSERT INTO ${q("comp")} VALUES (8,8,'no')`))).toBe("INVALID_REQUEST");
        // DML smuggled through a data-modifying CTE is stopped by the engine itself (PostgreSQL)
        if (!my) expect(await code(ro.query(`WITH x AS (INSERT INTO ${q("comp")} VALUES (7,7,'no') RETURNING *) SELECT * FROM x`))).toBe("READ_ONLY");
        const s = await ro.openSession();
        await s.begin();
        expect(await code(s.query(`DELETE FROM ${q("comp")}`))).toBe("READ_ONLY");
        await s.close();
        expect(Number((await a.query(`SELECT COUNT(*) AS n FROM ${q("comp")}`)).rows[0]!.n)).toBe(3);
        await ro.close();
      });

      it("the engine itself refuses writes even when the statement filter is bypassed", async () => {
        const ro = createAdapter(cfg({ readOnly: true })) as any;
        await ro.connect();
        const conn = await ro.p.reserve();
        try {
          for (const stmt of ro.prepareReadOnlyConnection()) await conn.unsafe(stmt);
          await ro.enterGuard(conn, 0);
          const attempts = [`INSERT INTO ${q("comp")} VALUES (30,30,'no')`, ...(my ? [`CREATE TABLE ${q("zz2")} (a INT)`] : [])];
          for (const stmt of attempts) {
            const err = await conn.unsafe(stmt).then(() => null, (e: unknown) => e);
            expect(err).not.toBeNull();
            if (!my) await conn.unsafe("ROLLBACK");
            if (!my) await ro.enterGuard(conn, 0);
          }
        } finally {
          await conn.unsafe("ROLLBACK").catch(() => {});
          conn.release();
          await ro.close();
        }
        expect(Number((await a.query(`SELECT COUNT(*) AS n FROM ${q("comp")} WHERE a = 30`)).rows[0]!.n)).toBe(0);
      });

      it("insufficient privileges surface as PERMISSION_DENIED (the real boundary)", async () => {
        const user = `bunrad_ro_${Math.random().toString(16).slice(2, 10)}`;
        const pw = "Ro-pass-123!";
        const dbq = q(testDb!.name);
        if (my) {
          await a.query(`CREATE USER '${user}'@'%' IDENTIFIED BY '${pw}'`);
          await a.query(`GRANT SELECT ON ${dbq}.* TO '${user}'@'%'`);
        } else {
          await a.query(`CREATE ROLE ${q(user)} LOGIN PASSWORD '${pw}'`);
          await a.query(`GRANT CONNECT ON DATABASE ${dbq} TO ${q(user)}`);
          await a.query(`GRANT USAGE ON SCHEMA public TO ${q(user)}`);
          await a.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${q(user)}`);
        }
        try {
          const limited = createAdapter(cfg({ user, password: pw }));
          await limited.connect();
          expect((await limited.query(`SELECT COUNT(*) AS n FROM ${q("comp")}`)).rows.length).toBe(1);
          expect(await code(limited.query(`INSERT INTO ${q("comp")} VALUES (50,50,'no')`))).toBe("PERMISSION_DENIED");
          await limited.close();
        } finally {
          await a.query(my ? `DROP USER IF EXISTS '${user}'@'%'` : `DROP OWNED BY ${q(user)}`).catch(() => {});
          if (!my) await a.query(`DROP ROLE IF EXISTS ${q(user)}`).catch(() => {});
        }
      });
    });

    describe("explorer", () => {
      it("describes keys, foreign keys, indexes and views from the real catalog", async () => {
        const objs = await a.listObjects();
        expect(objs.find((o) => o.name === "pv")?.type).toBe("view");
        expect(objs.find((o) => o.name === "comp")?.type).toBe("table");
        const child = await a.describeTable(T("child"));
        expect(child.primaryKey).toEqual(["id"]);
        expect(child.foreignKeys).toHaveLength(1);
        expect(child.foreignKeys[0]).toMatchObject({ name: "fk_child_parent", columns: ["parent_id"], refTable: "parent", refColumns: ["id"] });
        expect(child.indexes.some((i) => i.name === "idx_child_note")).toBe(true);
        expect((await a.describeTable(T("comp"))).primaryKey).toEqual(["a", "b"]);
        expect(await code(a.describeTable({ name: 'x"; DROP TABLE comp;--', type: "table" }))).toBe("OBJECT_NOT_FOUND");
      });
    });

    describe("browse and safe editing", () => {
      it("pages with exact totals, stable order, sorting and filtering", async () => {
        for (let i = 1; i <= 25; i++) await a.query(`INSERT INTO ${q("child")} (id, parent_id, note) VALUES (${my ? "?, NULL, ?" : "$1, NULL, $2"})`, [i, i % 5 === 0 ? `five_${i}` : `n_${i}`]);
        const p1 = await a.browse({ table: T("child"), limit: 10, offset: 0 });
        expect(p1.total).toBe(25);
        expect(p1.rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const f = await a.browse({ table: T("child"), limit: 50, offset: 0, filters: [{ column: "note", op: "contains", value: "five" }], orderBy: [{ column: "id", direction: "desc" }] });
        expect(f.total).toBe(5);
        expect(f.rows[0]!.id).toBe(25);
        expect((await a.browse({ table: T("child"), limit: 5, offset: 0, filters: [{ column: "note", op: "contains", value: "%" }] })).total).toBe(0);
        expect(await code(a.browse({ table: T("child"), limit: 5, offset: 0, orderBy: [{ column: "id; DROP TABLE child", direction: "asc" }] }))).toBe("INVALID_REQUEST");
      });

      it("explains why editing is disabled", async () => {
        const v = await a.browse({ table: { name: "pv", type: "view", ...(my ? {} : { schema: "public" }) }, limit: 5, offset: 0 });
        expect((v.editable as any).reason).toContain("Views are read-only");
        const nk = await a.browse({ table: T("nokey"), limit: 5, offset: 0 });
        expect(nk.editable.ok).toBe(false);
        expect((nk.editable as any).reason).toContain("no primary key");
        expect(await code(a.updateRow({ table: T("nokey"), key: { x: 1 }, expected: {}, changes: { y: "a" } }))).toBe("NOT_EDITABLE");
        expect(await code(a.deleteRow({ table: T("nokey"), key: { x: 1 } }))).toBe("NOT_EDITABLE");
      });

      it("updates only the row identified by the full composite key and detects conflicts", async () => {
        await a.updateRow({ table: T("comp"), key: { a: 1, b: 2 }, expected: { v: "y" }, changes: { v: "Y" } });
        const vals = async () => (await a.query(`SELECT a, b, v FROM ${q("comp")} ORDER BY a, b`)).rows.map((r) => `${r.a}/${r.b}/${r.v}`);
        expect(await vals()).toEqual(["1/1/x", "1/2/Y", "2/1/z"]);
        expect(await code(a.updateRow({ table: T("comp"), key: { a: 1 }, expected: {}, changes: { v: "!" } }))).toBe("INVALID_REQUEST");
        await a.query(`UPDATE ${q("comp")} SET v = 'theirs' WHERE a = 1 AND b = 1`);
        expect(await code(a.updateRow({ table: T("comp"), key: { a: 1, b: 1 }, expected: { v: "x" }, changes: { v: "mine" } }))).toBe("CONFLICT");
        expect((await vals())[0]).toBe("1/1/theirs");
        expect(await code(a.deleteRow({ table: T("comp"), key: { a: 2, b: 1 }, expected: { v: "stale" } }))).toBe("CONFLICT");
        await a.deleteRow({ table: T("comp"), key: { a: 2, b: 1 }, expected: { v: "z" } });
        expect(await vals()).toEqual(["1/1/theirs", "1/2/Y"]);
        expect(await code(a.deleteRow({ table: T("comp"), key: { a: 2, b: 1 } }))).toBe("CONFLICT");
      });

      it("conflict detection is case-sensitive and an unchanged-value update is not a conflict", async () => {
        await a.query(`INSERT INTO ${q("comp")} VALUES (5,5,'Case')`);
        expect(await code(a.updateRow({ table: T("comp"), key: { a: 5, b: 5 }, expected: { v: "case" }, changes: { v: "x" } }))).toBe("CONFLICT");
        expect(await code(a.updateRow({ table: T("comp"), key: { a: 5, b: 5 }, expected: { v: "Case" }, changes: { v: "Case" } }))).toBe("no error");
      });

      it("insert returns the generated id and rejects unknown columns", async () => {
        await a.query(my ? "CREATE TABLE ai (id INT AUTO_INCREMENT PRIMARY KEY, v VARCHAR(10))" : "CREATE TABLE ai (id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, v VARCHAR(10))");
        const r = await a.insertRow({ table: T("ai"), values: { v: "a" } });
        expect(r.affectedRows).toBe(1);
        if (my) expect(r.lastInsertId).toBe("1");
        expect(await code(a.insertRow({ table: T("ai"), values: { "v\";--": "a" } }))).toBe("INVALID_REQUEST");
      });
    });

    describe("export", () => {
      it("streams CSV with NULL distinct from empty and can exclude columns", async () => {
        await a.query(`CREATE TABLE ${q("exp")} (id INT PRIMARY KEY, s VARCHAR(50), secret VARCHAR(10))`);
        await a.query(`INSERT INTO ${q("exp")} VALUES (1, 'say "hi", ok', 'x'), (2, NULL, 'y'), (3, '', 'z')`);
        let out = "";
        for await (const c of a.exportCsv({ table: T("exp"), excludeColumns: ["secret"] })) out += c;
        expect(out).toBe('id,s\r\n1,"say ""hi"", ok"\r\n2,\r\n3,""\r\n');
      });
    });
  });
}
