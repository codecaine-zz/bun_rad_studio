import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { DATASETS, datasetCounts, totalRows } from "../src/db/samples/catalog";
import { sqlHelpers } from "../src/db/samples/dialect";
import { seedSqlite, scalar } from "./helpers/samples";

setDefaultTimeout(120_000);

describe("Large scale on SQLite: a few hundred thousand rows, under 30 seconds, with integrity intact", () => {
  for (const ds of DATASETS) {
    it(`${ds.id}: ${"large"} loads in time, counts match, foreign keys hold and the queries still run`, async () => {
      const progress: number[] = [];
      const { db, ms, rows } = await seedSqlite(ds, "large", undefined, []);
      const total = totalRows(ds, "large");
      expect(rows).toBe(total);
      expect(total).toBeGreaterThan(100_000);
      expect(total).toBeLessThan(900_000);
      expect(ms).toBeLessThan(30_000);
      for (const [t, n] of Object.entries(datasetCounts(ds).large)) expect(scalar(db, `SELECT COUNT(*) FROM "${t}"`), t).toBe(n);
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
      const h = sqlHelpers("sqlite");
      for (const q of ds.queries) expect(db.query(q.sql(h)).all().length, q.id).toBeGreaterThan(0);
      void progress;
      console.log(`[large] ${ds.id}: ${total.toLocaleString()} rows in ${(ms / 1000).toFixed(1)} s`);
      db.close();
    });
  }
});
