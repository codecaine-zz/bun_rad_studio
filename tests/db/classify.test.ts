import { describe, it, expect } from "bun:test";
import { classifyStatement, needsConfirmation, maskLiterals } from "../../src/db/classify";

const kind = (sql: string) => classifyStatement("postgres", sql).kind;

describe("classifyStatement", () => {
  it("recognises reads, writes, DDL and destructive statements", () => {
    expect(kind("SELECT * FROM t")).toBe("read");
    expect(kind("  /* c */ select 1")).toBe("read");
    expect(kind("WITH x AS (SELECT 1) SELECT * FROM x")).toBe("read");
    expect(kind("WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x")).toBe("write");
    expect(kind("INSERT INTO t VALUES (1)")).toBe("write");
    expect(kind("UPDATE t SET a = 1 WHERE id = 2")).toBe("write");
    expect(kind("DELETE FROM t WHERE id = 2")).toBe("write");
    expect(kind("CREATE TABLE t (a int)")).toBe("ddl");
    expect(kind("ALTER TABLE t ADD COLUMN b int")).toBe("ddl");
    expect(kind("DROP TABLE t")).toBe("destructive");
    expect(kind("TRUNCATE t")).toBe("destructive");
    expect(kind("ALTER TABLE t DROP COLUMN b")).toBe("destructive");
    expect(kind("GRANT ALL ON t TO u")).toBe("admin");
    expect(kind("COMMIT")).toBe("transaction");
    expect(kind("FROBNICATE")).toBe("other");
  });

  it("DELETE/UPDATE without WHERE are destructive, but a WHERE inside a string or comment does not count", () => {
    expect(kind("DELETE FROM t")).toBe("destructive");
    expect(kind("UPDATE t SET a = 1")).toBe("destructive");
    expect(kind("DELETE FROM t -- where id = 1")).toBe("destructive");
    expect(kind("UPDATE t SET note = 'where am i'")).toBe("destructive");
    expect(kind("DELETE FROM t /* WHERE x */")).toBe("destructive");
  });

  it("EXPLAIN ANALYZE of a modifying statement is not treated as a read", () => {
    expect(kind("EXPLAIN ANALYZE DELETE FROM t WHERE id = 1")).toBe("write");
    expect(kind("EXPLAIN SELECT 1")).toBe("read");
  });

  it("PRAGMA assignments are administrative", () => {
    expect(kind("PRAGMA foreign_keys = OFF")).toBe("admin");
    expect(kind("PRAGMA table_info(t)")).toBe("read");
  });

  it("needsConfirmation: destructive always, writes only on production", () => {
    const c = (sql: string) => classifyStatement("sqlite", sql);
    expect(needsConfirmation(c("SELECT 1"), true)).toBe(false);
    expect(needsConfirmation(c("INSERT INTO t VALUES (1)"), false)).toBe(false);
    expect(needsConfirmation(c("INSERT INTO t VALUES (1)"), true)).toBe(true);
    expect(needsConfirmation(c("DROP TABLE t"), false)).toBe(true);
    expect(needsConfirmation(c("CREATE TABLE t (a)"), true)).toBe(true);
  });

  it("maskLiterals blanks strings/comments and keeps length", () => {
    const sql = `SELECT 'a;b', "c", \`d\` -- x\n/* y */ FROM t`;
    const masked = maskLiterals(sql);
    expect(masked.length).toBe(sql.length);
    expect(masked).not.toContain("a;b");
    expect(masked).not.toContain("y");
    expect(masked).toContain("FROM t");
  });
});
