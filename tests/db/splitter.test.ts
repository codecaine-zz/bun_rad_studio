import { describe, it, expect } from "bun:test";
import { splitStatements, statementAt, leadingKeyword } from "../../src/db/splitter";

const sqls = (s: string, engine: "sqlite" | "mysql" | "postgres") => splitStatements(s, { engine }).map((x) => x.sql);

describe("splitStatements", () => {
  it("does not split on semicolons inside strings, identifiers or comments", () => {
    const script = `SELECT 'a;b'; -- trailing; comment
SELECT "x;y" FROM t; /* block; comment */ SELECT 3;`;
    expect(sqls(script, "sqlite")).toEqual([`SELECT 'a;b'`, `SELECT "x;y" FROM t`, `SELECT 3`]);
  });

  it("handles doubled quotes and returns last statement without delimiter", () => {
    expect(sqls(`INSERT INTO t VALUES ('it''s; ok'); SELECT 1`, "postgres")).toEqual([`INSERT INTO t VALUES ('it''s; ok')`, `SELECT 1`]);
  });

  it("drops comment-only and empty statements", () => {
    expect(sqls(`;; -- nothing\n;/* x */; SELECT 1;`, "mysql")).toEqual(["SELECT 1"]);
  });

  it("postgres: dollar quoting and nested block comments", () => {
    const fn = `CREATE FUNCTION f() RETURNS int AS $body$ BEGIN RETURN 1; END; $body$ LANGUAGE plpgsql`;
    expect(sqls(`${fn}; SELECT f(); /* a /* nested; */ still; comment */ SELECT 2`, "postgres")).toEqual([fn, "SELECT f()", "SELECT 2"]);
    expect(sqls(`DO $$ BEGIN PERFORM 1; END $$; SELECT 1`, "postgres")).toEqual([`DO $$ BEGIN PERFORM 1; END $$`, "SELECT 1"]);
  });

  it("postgres: E'' strings honour backslash escapes but plain strings do not", () => {
    expect(sqls(`SELECT E'a\\';b'; SELECT 'a\\'; SELECT 3`, "postgres")).toEqual([`SELECT E'a\\';b'`, `SELECT 'a\\'`, "SELECT 3"]);
  });

  it("mysql: backslash escapes, backticks, # and -- comments, DELIMITER blocks", () => {
    expect(sqls("SELECT 'a\\';b'; SELECT `we;ird`; # c;d\nSELECT 2; -- x;y\nSELECT 3", "mysql")).toEqual(["SELECT 'a\\';b'", "SELECT `we;ird`", "SELECT 2", "SELECT 3"]);
    const proc = `DELIMITER //\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END//\nDELIMITER ;\nSELECT 9;`;
    expect(sqls(proc, "mysql")).toEqual([`CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END`, "SELECT 9"]);
  });

  it("mysql: -- without trailing whitespace is not a comment", () => {
    expect(sqls("SELECT 5--3; SELECT 1", "mysql")).toEqual(["SELECT 5--3", "SELECT 1"]);
  });

  it("sqlite: trigger bodies (including CASE ... END) stay in one statement", () => {
    const trg = `CREATE TRIGGER trg AFTER INSERT ON t BEGIN UPDATE u SET n = CASE WHEN 1 THEN 1 ELSE 2 END; INSERT INTO log VALUES (1); END`;
    expect(sqls(`${trg}; SELECT 1;`, "sqlite")).toEqual([trg, "SELECT 1"]);
  });

  it("sqlite: bracket-quoted identifiers", () => {
    expect(sqls(`SELECT [a;b] FROM t; SELECT 2`, "sqlite")).toEqual([`SELECT [a;b] FROM t`, "SELECT 2"]);
  });

  it("reports offsets and line numbers", () => {
    const script = "SELECT 1;\n\n  SELECT 2;";
    const parts = splitStatements(script, { engine: "sqlite" });
    expect(parts.map((p) => p.line)).toEqual([1, 3]);
    expect(script.slice(parts[1]!.start, parts[1]!.end)).toBe("SELECT 2");
  });

  it("unterminated strings do not hang", () => {
    expect(sqls(`SELECT 'oops; SELECT 2`, "postgres")).toEqual([`SELECT 'oops; SELECT 2`]);
  });

  it("statementAt picks the statement around the cursor", () => {
    const script = "SELECT 1;\nSELECT 2;\nSELECT 3;";
    expect(statementAt(script, 12, { engine: "sqlite" })?.sql).toBe("SELECT 2");
    expect(statementAt(script, script.length, { engine: "sqlite" })?.sql).toBe("SELECT 3");
  });

  it("leadingKeyword skips comments", () => {
    expect(leadingKeyword("/* c */ -- x\n  delete from t")).toBe("DELETE");
  });
});
