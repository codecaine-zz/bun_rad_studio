import { describe, it, expect } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { SqliteAdapter } from "../../src/db/adapters/sqlite";
import { MAX_PAGE } from "../../src/db/adapters/base";

const ROWS = 200_000;

async function bigTable() {
  const dir = mkdtempSync(join(tmpdir(), "bigdata-"));
  const a = new SqliteAdapter({ engine: "sqlite", path: join(dir, "big.db"), sqliteMode: "create" });
  await a.connect();
  await a.query("CREATE TABLE big (id INTEGER PRIMARY KEY, v TEXT, n INTEGER)");
  await a.query(`WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM c WHERE i < ${ROWS}) INSERT INTO big (v, n) SELECT 'row ' || i, i % 100 FROM c`);
  return { a, cleanup: () => (a.close(), rmSync(dir, { recursive: true, force: true })) };
}

describe("large tables stay responsive", () => {
  it("browse returns one bounded page quickly, even deep into a 200k-row table", async () => {
    const { a, cleanup } = await bigTable();
    try {
      const t0 = performance.now();
      const first = await a.browse({ table: { name: "big", type: "table" }, limit: 50, offset: 0 });
      const deep = await a.browse({ table: { name: "big", type: "table" }, limit: 50, offset: ROWS - 50 });
      const filtered = await a.browse({ table: { name: "big", type: "table" }, limit: 50, offset: 0, filters: [{ column: "n", op: "eq", value: 7 }] });
      const elapsed = performance.now() - t0;
      expect(first.total).toBe(ROWS);
      expect(first.rows.length).toBe(50);
      expect(deep.rows[49]!.id).toBe(ROWS);
      expect(filtered.total).toBe(ROWS / 100);
      expect(elapsed).toBeLessThan(2000);
      // page size is capped no matter what the client asks for
      const capped = await a.browse({ table: { name: "big", type: "table" }, limit: 10_000_000, offset: 0 });
      expect(capped.rows.length).toBe(MAX_PAGE);
    } finally {
      cleanup();
    }
  });

  it("query() with maxRows reports truncation rather than returning everything", async () => {
    const { a, cleanup } = await bigTable();
    try {
      const r = await a.query("SELECT * FROM big", [], { maxRows: 1000 });
      expect(r.rows.length).toBe(1000);
      expect(r.truncated).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("CSV export streams in chunks of rows and the event loop keeps turning", async () => {
    const { a, cleanup } = await bigTable();
    try {
      let rows = 0;
      let longestGap = 0;
      let last = performance.now();
      let ticks = 0;
      const timer = setInterval(() => ticks++, 5);
      for await (const chunk of a.exportCsv({ table: { name: "big", type: "table" } })) {
        rows += chunk.split("\r\n").length - 1;
        const now = performance.now();
        longestGap = Math.max(longestGap, now - last);
        last = now;
        if (rows % 1000 === 1) await Bun.sleep(0); // consumer back-pressure point
      }
      clearInterval(timer);
      expect(rows).toBe(ROWS + 1);
      // every chunk is one row, so no single step ever held the whole table
      expect(longestGap).toBeLessThan(500);
    } finally {
      cleanup();
    }
  }, 60_000);
});
