import { describe, expect, test } from "bun:test";
import { MysqlManager } from "../applications/mysql_studio_server.ts";
import { PostgresManager } from "../applications/postgres_studio_server.ts";

// The sidebar's row counts must be real counts, not the database's planner estimates (which are stale after a bulk load or a
// delete, so a full table could show 0 and an emptied one could still show rows). No server is needed: the connection is stubbed.


function pgManager(opts: { estimate: number; exact: number }) {
  const seen: string[] = [];
  const manager = new PostgresManager("", { host: "127.0.0.1", port: 1, user: "u", password: "placeholder", database: "d", schema: "public" } as any);
  (manager as any).sql_conn = {
    unsafe: async (sql: string) => {
      seen.push(sql);
      if (/information_schema\.schemata/.test(sql)) return [{ schema_name: "public" }];
      if (/FROM information_schema\.tables/.test(sql)) return [{ table_name: "t", table_type: "BASE TABLE" }];
      if (/reltuples/.test(sql)) return [{ rc: opts.estimate }];
      if (/LIMIT 100001/.test(sql)) return [{ rc: opts.exact }];
      return [];
    },
  };
  return { manager, seen };
}

function myManager(opts: { estimate: number; exact: number }) {
  const seen: string[] = [];
  const manager = new MysqlManager("", { host: "127.0.0.1", port: 1, user: "u", password: "placeholder", database: "d" } as any);
  (manager as any).sql_conn = {
    unsafe: async (sql: string) => {
      seen.push(sql);
      if (/FROM information_schema\.tables/.test(sql)) return [{ TABLE_NAME: "t", TABLE_TYPE: "BASE TABLE", TABLE_ROWS: opts.estimate }];
      if (/LIMIT 100001/.test(sql)) return [{ c: opts.exact }];
      return [];
    },
  };
  return { manager, seen };
}

describe("PostgreSQL Studio row counts", () => {
  test("a table whose estimate is stale shows its real count, both ways", async () => {
    const emptied = pgManager({ estimate: 5, exact: 0 });
    expect((await emptied.manager.getSchema()).tables[0]!.rowCount).toBe(0);
    const filled = pgManager({ estimate: 0, exact: 7 });
    expect((await filled.manager.getSchema()).tables[0]!.rowCount).toBe(7);
  });

  test("a big table keeps the estimate and is not counted row by row", async () => {
    const big = pgManager({ estimate: 5_000_000, exact: 1 });
    expect((await big.manager.getSchema()).tables[0]!.rowCount).toBe(5_000_000);
    expect(big.seen.some((s) => /LIMIT 100001/.test(s))).toBe(false);
  });
});

describe("MySQL Studio row counts", () => {
  test("a table whose estimate is stale shows its real count, both ways", async () => {
    const emptied = myManager({ estimate: 5, exact: 0 });
    expect((await emptied.manager.getSchema()).tables[0]!.rowCount).toBe(0);
    const filled = myManager({ estimate: 0, exact: 17 });
    expect((await filled.manager.getSchema()).tables[0]!.rowCount).toBe(17);
  });

  test("a big table keeps the estimate and is not counted row by row", async () => {
    const big = myManager({ estimate: 5_000_000, exact: 1 });
    expect((await big.manager.getSchema()).tables[0]!.rowCount).toBe(5_000_000);
    expect(big.seen.some((s) => /LIMIT 100001/.test(s))).toBe(false);
  });
});
