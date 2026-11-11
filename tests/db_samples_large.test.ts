import { describe, expect, it, setDefaultTimeout } from "bun:test";
import { DATASETS, datasetCounts, totalRows } from "../src/db/samples/catalog";
import { sqlHelpers } from "../src/db/samples/dialect";
import { seedSqlite, scalar } from "./helpers/samples";

setDefaultTimeout(120_000);

const STRESS_LARGE = process.env.TEST_LARGE_SAMPLES === "1";
const TARGET_SCALE: "medium" | "large" = STRESS_LARGE ? "large" : "medium";

describe("Sample dataset scale & integrity on SQLite (TEST_LARGE_SAMPLES=1 for full 2.8M-row stress scale)", () => {
  for (const ds of DATASETS) {
    it(`${ds.id}: ${TARGET_SCALE} loads in time, counts match, foreign keys hold and the queries still run`, async () => {
      const progress: number[] = [];
      const { db, ms, rows } = await seedSqlite(
        ds,
        TARGET_SCALE,
        undefined,
        [],
      );
      const total = totalRows(ds, TARGET_SCALE);
      expect(rows).toBe(total);
      if (STRESS_LARGE) {
        expect(total).toBeGreaterThan(100_000);
        expect(total).toBeLessThan(900_000);
      } else {
        expect(total).toBeGreaterThan(1_000);
      }
      expect(ms).toBeLessThan(30_000);
      for (const [t, n] of Object.entries(datasetCounts(ds)[TARGET_SCALE]))
        expect(scalar(db, `SELECT COUNT(*) FROM "${t}"`), t).toBe(n);
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
      const h = sqlHelpers("sqlite");
      for (const q of ds.queries)
        expect(db.query(q.sql(h)).all().length, q.id).toBeGreaterThan(0);
      void progress;
      console.log(
        `[${TARGET_SCALE}] ${ds.id}: ${total.toLocaleString()} rows in ${(ms / 1000).toFixed(1)} s`,
      );
      db.close();
    });
  }
});
