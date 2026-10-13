import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Database } from "bun:sqlite";
import { SqliteAdapter } from "../../src/db/adapters/sqlite";
import { DbError } from "../../src/db/errors";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sqlite-adapter-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const mem = async () => {
  const a = new SqliteAdapter({ engine: "sqlite", sqliteMode: "memory" });
  await a.connect();
  return a;
};
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof DbError ? e.code : `other: ${String(e)}`;
  }
};

describe("SqliteAdapter connection modes", () => {
  it("does not create a missing file unless explicitly asked", async () => {
    const path = join(dir, "missing.db");
    const a = new SqliteAdapter({ engine: "sqlite", path });
    expect(await code(a.connect())).toBe("DATABASE_NOT_FOUND");
    expect(existsSync(path)).toBe(false);
    const c = new SqliteAdapter({ engine: "sqlite", path, sqliteMode: "create" });
    await c.connect();
    expect(existsSync(path)).toBe(true);
    await c.close();
    const again = new SqliteAdapter({ engine: "sqlite", path, sqliteMode: "create" });
    expect(await code(again.connect())).toBe("INVALID_REQUEST");
  });

  it("read-only open cannot write (connection-level enforcement)", async () => {
    const path = join(dir, "ro.db");
    const seed = new Database(path);
    seed.run("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t VALUES (1,'a')");
    seed.close();
    const a = new SqliteAdapter({ engine: "sqlite", path, sqliteMode: "readonly" });
    await a.connect();
    expect((await a.query("SELECT v FROM t")).rows[0]!.v).toBe("a");
    expect(await code(a.query("INSERT INTO t VALUES (2,'b')"))).toBe("READ_ONLY");
    expect(await code(a.query("SELECT 1; DELETE FROM t"))).toBe("INVALID_REQUEST");
    const caps = await a.capabilities();
    expect(caps.readOnlyEnforcement).toBe("connection");
    // Engine-level: even bypassing the statement filter via the raw handle, SQLite refuses the write.
    expect(() => (a as any).conn.run("DELETE FROM t")).toThrow(/readonly/i);
    await a.close();
  });

  it("readOnly flag on a writable open uses query_only and blocks writes", async () => {
    const a = new SqliteAdapter({ engine: "sqlite", sqliteMode: "memory", readOnly: true });
    await a.connect();
    expect(() => (a as any).conn.run("CREATE TABLE x (a)")).toThrow();
    expect((await a.capabilities()).readOnlyEnforcement).toBe("transaction");
  });

  it("reports in-memory databases as temporary", async () => {
    const a = await mem();
    expect(a.isTemporary).toBe(true);
    expect((await a.capabilities()).notes.temporary).toContain("lost");
  });

  it("explains unsupported features instead of hiding them", async () => {
    const caps = await (await mem()).capabilities();
    expect(caps.cancelQuery).toBe(false);
    expect(caps.notes.cancelQuery).toBeTruthy();
    expect(caps.notes.statementTimeout).toBeTruthy();
  });
});

describe("SqliteAdapter queries and value fidelity", () => {
  it("binds quotes and SQL-looking text as data", async () => {
    const a = await mem();
    await a.query("CREATE TABLE t (id INTEGER PRIMARY KEY, s TEXT)");
    const evil = `Robert'); DROP TABLE t;-- "x" \\ ; \u0000`.replace("\u0000", "");
    await a.query("INSERT INTO t (s) VALUES (?)", [evil]);
    const r = await a.query("SELECT s FROM t WHERE s = ?", [evil]);
    expect(r.rows[0]!.s).toBe(evil);
    expect((await a.query("SELECT COUNT(*) AS n FROM t")).rows[0]!.n).toBe(1);
  });

  it("round-trips Unicode, NULL vs empty string, large integers, decimals and binary", async () => {
    const a = await mem();
    await a.query("CREATE TABLE t (id INTEGER PRIMARY KEY, u TEXT, n TEXT, e TEXT, big INTEGER, dec TEXT, b BLOB)");
    await a.query("INSERT INTO t (u,n,e,big,dec,b) VALUES (?,?,?,?,?,?)", [
      "héllo 日本語 🚀",
      null,
      "",
      { $bigint: "9223372036854775807" },
      { $decimal: "12345678901234567890.1234567890" },
      { $binary: Buffer.from([0, 255, 16]).toString("base64") },
    ]);
    const row = (await a.query("SELECT * FROM t")).rows[0]!;
    expect(row.u).toBe("héllo 日本語 🚀");
    expect(row.n).toBeNull();
    expect(row.e).toBe("");
    expect(row.big).toBe("9223372036854775807");
    expect(row.dec).toBe("12345678901234567890.1234567890");
    expect(row.b).toEqual({ $binary: Buffer.from([0, 255, 16]).toString("base64") });
  });

  it("rejects malformed typed parameters", async () => {
    const a = await mem();
    expect(await code(a.query("SELECT ?", [{ $bigint: "12x" }]).catch((e) => Promise.reject(e)))).not.toBe("no error");
    expect(await code(a.query("SELECT ?", [{ $nope: 1 } as any]))).not.toBe("no error");
  });

  it("limits rows and reports truncation", async () => {
    const a = await mem();
    await a.query("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    for (let i = 0; i < 5; i++) await a.query("INSERT INTO t DEFAULT VALUES");
    const r = await a.query("SELECT * FROM t", [], { maxRows: 3 });
    expect(r.rowCount).toBe(3);
    expect(r.truncated).toBe(true);
  });

  it("transactions commit and roll back", async () => {
    const a = await mem();
    await a.query("CREATE TABLE t (id INTEGER PRIMARY KEY, v INT)");
    const s = await a.openSession();
    await s.begin();
    await s.query("INSERT INTO t (v) VALUES (1)");
    expect(s.inTransaction).toBe(true);
    await s.rollback();
    expect((await a.query("SELECT COUNT(*) AS n FROM t")).rows[0]!.n).toBe(0);
    await s.begin();
    await s.query("INSERT INTO t (v) VALUES (2)");
    await s.commit();
    expect((await a.query("SELECT COUNT(*) AS n FROM t")).rows[0]!.n).toBe(1);
  });

  it("maps constraint, syntax and missing-object errors to stable codes", async () => {
    const a = await mem();
    await a.query("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)");
    expect(await code(a.query("INSERT INTO t (v) VALUES (NULL)"))).toBe("CONSTRAINT_VIOLATION");
    expect(await code(a.query("SELEC 1"))).toBe("SYNTAX_ERROR");
    expect(await code(a.query("SELECT * FROM nope"))).toBe("OBJECT_NOT_FOUND");
  });
});

describe("SqliteAdapter explorer and browse", () => {
  const setup = async () => {
    const a = await mem();
    await a.query("CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)");
    await a.query("CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id), note TEXT)");
    await a.query("CREATE INDEX idx_child_note ON child(note)");
    await a.query("CREATE VIEW v AS SELECT id, name FROM parent");
    await a.query("CREATE TABLE comp (a INT, b INT, v TEXT, PRIMARY KEY (a, b))");
    await a.query("CREATE TABLE nokey (x INT, y TEXT)");
    await a.query("CREATE TABLE nr (k TEXT PRIMARY KEY, v INT) WITHOUT ROWID");
    await a.query("CREATE TABLE nopk_nr (k TEXT, v INT)");
    return a;
  };

  it("lists objects and describes keys, foreign keys and indexes from the real catalog", async () => {
    const a = await setup();
    const names = (await a.listObjects()).map((o) => `${o.type}:${o.name}`);
    expect(names).toContain("view:v");
    expect(names).toContain("table:parent");
    const child = await a.describeTable({ name: "child", type: "table" });
    expect(child.primaryKey).toEqual(["id"]);
    expect(child.foreignKeys).toEqual([{ name: null, columns: ["parent_id"], refTable: "parent", refColumns: ["id"], onDelete: "NO ACTION", onUpdate: "NO ACTION" }]);
    expect(child.indexes.some((i) => i.name === "idx_child_note" && i.columns[0] === "note")).toBe(true);
    const comp = await a.describeTable({ name: "comp", type: "table" });
    expect(comp.primaryKey).toEqual(["a", "b"]);
    expect((await a.describeTable({ name: "parent", type: "table" })).columns[0]!.autoIncrement).toBe(true);
  });

  it("describes unknown tables as an error, never by guessing", async () => {
    const a = await setup();
    expect(await code(a.describeTable({ name: 'x"; DROP TABLE parent;--', type: "table" }))).toBe("OBJECT_NOT_FOUND");
    expect((await a.listObjects()).some((o) => o.name === "parent")).toBe(true);
  });

  it("pages, sorts and filters with a stable order and exact totals", async () => {
    const a = await setup();
    for (let i = 1; i <= 25; i++) await a.query("INSERT INTO parent (name) VALUES (?)", [i % 5 === 0 ? `five_${i}` : `n_${i}`]);
    const p1 = await a.browse({ table: { name: "parent", type: "table" }, limit: 10, offset: 0 });
    const p3 = await a.browse({ table: { name: "parent", type: "table" }, limit: 10, offset: 20 });
    expect(p1.total).toBe(25);
    expect(p1.rows.map((r) => r.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p3.rows.length).toBe(5);
    const f = await a.browse({ table: { name: "parent", type: "table" }, limit: 50, offset: 0, filters: [{ column: "name", op: "contains", value: "five" }], orderBy: [{ column: "id", direction: "desc" }] });
    expect(f.total).toBe(5);
    expect(f.rows[0]!.id).toBe(25);
    // LIKE wildcards in user text are matched literally.
    const lit = await a.browse({ table: { name: "parent", type: "table" }, limit: 50, offset: 0, filters: [{ column: "name", op: "contains", value: "%" }] });
    expect(lit.total).toBe(0);
  });

  it("rejects unknown sort/filter columns", async () => {
    const a = await setup();
    expect(await code(a.browse({ table: { name: "parent", type: "table" }, limit: 5, offset: 0, orderBy: [{ column: "id; DROP TABLE parent", direction: "asc" }] }))).toBe("INVALID_REQUEST");
    expect(await code(a.browse({ table: { name: "parent", type: "table" }, limit: 5, offset: 0, filters: [{ column: "nope", op: "isNull" }] }))).toBe("INVALID_REQUEST");
  });

  it("explains why a result is not editable", async () => {
    const a = await setup();
    const view = await a.browse({ table: { name: "v", type: "view" }, limit: 5, offset: 0 });
    expect(view.editable).toMatchObject({ ok: false });
    expect((view.editable as any).reason).toContain("Views are read-only");
    const rowid = await a.browse({ table: { name: "nokey", type: "table" }, limit: 5, offset: 0 });
    expect(rowid.editable).toEqual({ ok: true, keyColumns: ["rowid"], keyKind: "rowid" });
    const none = await a.browse({ table: { name: "nopk_nr", type: "table" }, limit: 5, offset: 0 });
    expect(none.editable.ok).toBe(true); // regular tables have rowid
    const nr = await a.browse({ table: { name: "nr", type: "table" }, limit: 5, offset: 0 });
    expect(nr.editable).toEqual({ ok: true, keyColumns: ["k"], keyKind: "primary" });
  });
});

describe("SqliteAdapter safe row editing", () => {
  const T = { name: "comp", type: "table" as const };
  const setup = async () => {
    const a = await mem();
    await a.query("CREATE TABLE comp (a INT, b INT, v TEXT, PRIMARY KEY (a, b))");
    await a.query("INSERT INTO comp VALUES (1,1,'x'),(1,2,'y'),(2,1,'z')");
    return a;
  };
  const vals = async (a: SqliteAdapter) => (await a.query("SELECT a,b,v FROM comp ORDER BY a,b")).rows.map((r) => `${r.a}/${r.b}/${r.v}`);

  it("updates only the row identified by the full composite key", async () => {
    const a = await setup();
    await a.updateRow({ table: T, key: { a: 1, b: 2 }, expected: { v: "y" }, changes: { v: "Y" } });
    expect(await vals(a)).toEqual(["1/1/x", "1/2/Y", "2/1/z"]);
  });

  it("refuses an incomplete or wrong key instead of guessing", async () => {
    const a = await setup();
    expect(await code(a.updateRow({ table: T, key: { a: 1 }, expected: {}, changes: { v: "!" } }))).toBe("INVALID_REQUEST");
    expect(await code(a.updateRow({ table: T, key: { a: 1, b: 1, v: "x" }, expected: {}, changes: { v: "!" } }))).toBe("INVALID_REQUEST");
    expect(await code(a.deleteRow({ table: T, key: { b: 1 } }))).toBe("INVALID_REQUEST");
    expect(await vals(a)).toEqual(["1/1/x", "1/2/y", "2/1/z"]);
  });

  it("detects a concurrent change and does not overwrite it", async () => {
    const a = await setup();
    await a.query("UPDATE comp SET v = 'theirs' WHERE a = 1 AND b = 1"); // another session
    expect(await code(a.updateRow({ table: T, key: { a: 1, b: 1 }, expected: { v: "x" }, changes: { v: "mine" } }))).toBe("CONFLICT");
    expect((await vals(a))[0]).toBe("1/1/theirs");
  });

  it("detects a row deleted by someone else on update and delete", async () => {
    const a = await setup();
    await a.query("DELETE FROM comp WHERE a = 2");
    expect(await code(a.updateRow({ table: T, key: { a: 2, b: 1 }, expected: {}, changes: { v: "q" } }))).toBe("CONFLICT");
    expect(await code(a.deleteRow({ table: T, key: { a: 2, b: 1 } }))).toBe("CONFLICT");
  });

  it("deletes exactly one row, honouring the optional snapshot guard", async () => {
    const a = await setup();
    expect(await code(a.deleteRow({ table: T, key: { a: 1, b: 1 }, expected: { v: "stale" } }))).toBe("CONFLICT");
    await a.deleteRow({ table: T, key: { a: 1, b: 1 }, expected: { v: "x" } });
    expect(await vals(a)).toEqual(["1/2/y", "2/1/z"]);
  });

  it("matches NULL guards with IS NULL", async () => {
    const a = await mem();
    await a.query("CREATE TABLE n (id INTEGER PRIMARY KEY, v TEXT)");
    await a.query("INSERT INTO n VALUES (1, NULL)");
    await a.updateRow({ table: { name: "n", type: "table" }, key: { id: 1 }, expected: { v: null }, changes: { v: "set" } });
    expect((await a.query("SELECT v FROM n")).rows[0]!.v).toBe("set");
  });

  it("rowid tables use rowid, and views / unknown columns are rejected", async () => {
    const a = await mem();
    await a.query("CREATE TABLE nk (x TEXT)");
    await a.query("INSERT INTO nk VALUES ('a'),('a')");
    const page = await a.browse({ table: { name: "nk", type: "table" }, limit: 10, offset: 0 });
    const second = page.rows[1]!;
    await a.updateRow({ table: { name: "nk", type: "table" }, key: { rowid: second.__rowid__ as number }, expected: { x: "a" }, changes: { x: "b" } });
    expect((await a.query("SELECT x FROM nk ORDER BY rowid")).rows.map((r) => r.x)).toEqual(["a", "b"]);
    await a.query("CREATE VIEW vv AS SELECT * FROM nk");
    expect(await code(a.updateRow({ table: { name: "vv", type: "view" }, key: { rowid: 1 }, expected: {}, changes: { x: "z" } }))).toBe("NOT_EDITABLE");
    expect(await code(a.updateRow({ table: { name: "nk", type: "table" }, key: { rowid: 1 }, expected: {}, changes: { "x\"=1;--": "z" } }))).toBe("INVALID_REQUEST");
  });

  it("insert uses parameters and rejects unknown/generated columns", async () => {
    const a = await mem();
    await a.query("CREATE TABLE g (id INTEGER PRIMARY KEY, a INT, b INT GENERATED ALWAYS AS (a * 2) VIRTUAL)");
    const r = await a.insertRow({ table: { name: "g", type: "table" }, values: { a: 4 } });
    expect(r.affectedRows).toBe(1);
    expect((await a.query("SELECT b FROM g")).rows[0]!.b).toBe(8);
    expect(await code(a.insertRow({ table: { name: "g", type: "table" }, values: { b: 1 } }))).toBe("INVALID_REQUEST");
    expect(await code(a.insertRow({ table: { name: "g", type: "table" }, values: { nope: 1 } }))).toBe("INVALID_REQUEST");
  });
});

describe("SqliteAdapter CSV export", () => {
  it("streams escaped CSV, keeps NULL distinct from empty and can exclude columns", async () => {
    const a = await mem();
    await a.query("CREATE TABLE t (id INTEGER PRIMARY KEY, s TEXT, secret TEXT)");
    await a.query("INSERT INTO t (s, secret) VALUES (?, 'x'), (NULL, 'y'), ('', 'z')", ['say "hi", ok\nnext']);
    let out = "";
    for await (const chunk of a.exportCsv({ table: { name: "t", type: "table" }, excludeColumns: ["secret"] })) out += chunk;
    expect(out).toBe('id,s\r\n1,"say ""hi"", ok\nnext"\r\n2,\r\n3,""\r\n');
    expect(out).not.toContain("secret");
  });

  it("exports in pages without loading everything at once", async () => {
    const a = await mem();
    await a.query("CREATE TABLE t (id INTEGER PRIMARY KEY, v INT)");
    await a.query("WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM c WHERE n < 2500) INSERT INTO t (v) SELECT n FROM c");
    let lines = 0;
    let chunks = 0;
    for await (const chunk of a.exportCsv({ table: { name: "t", type: "table" } })) {
      chunks++;
      lines += chunk.split("\r\n").length - 1;
    }
    expect(lines).toBe(2501);
    expect(chunks).toBe(2501);
  });
});
