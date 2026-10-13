import { describe, expect, test } from "bun:test";
import { PostgresManager, startPostgresStudioServer } from "../applications/postgres_studio_server.ts";

// These need no PostgreSQL server: the connection is stubbed or points at a closed port.
const CONFIG = { host: "127.0.0.1", port: 1, user: "u", password: "placeholder", database: "probe_db", schema: "public" } as any;

describe("PostgreSQL Studio regressions that need no database (D-026)", () => {
  test("the SQL dump header names the configured database, not 'undefined'", async () => {
    const manager = new PostgresManager("", CONFIG);
    (manager as any).sql_conn = { unsafe: async () => [] };
    const dump = await manager.generateDatabaseDump({ mode: "schema" });
    expect(dump).toContain("-- Database: probe_db");
    expect(dump).not.toContain("undefined");
  });

  test("POST /api/table/mutate without a schema uses the active schema instead of throwing", async () => {
    const server = startPostgresStudioServer({ port: 0, host: "127.0.0.1", config: CONFIG });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/table/mutate`, {
        method: "POST",
        body: JSON.stringify({ table: "t", action: "insert", payload: { data: { a: 1 } } }),
      });
      const body = (await res.json()) as { success: boolean; error?: string };
      // The database is unreachable, so it fails, but for that reason and not because a method is missing.
      expect(body.success).toBe(false);
      expect(body.error ?? "").not.toContain("getActiveSchema");
      expect(res.status).toBe(200);
    } finally {
      server.stop(true);
    }
  });
});
