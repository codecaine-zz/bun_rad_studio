import { describe, expect, it } from "bun:test";
import { DATASETS, datasetCounts } from "../src/db/samples/catalog";
import { datasetHash } from "../src/db/samples/runner";
import { sqlHelpers } from "../src/db/samples/dialect";
import { objectNames } from "../src/db/samples/render";
import { tableCounts } from "../src/db/samples/model";
import { dropStatements, scalar, seedSqlite } from "./helpers/samples";

describe("sample datasets on SQLite (real engine)", () => {
  for (const ds of DATASETS) {
    describe(ds.id, () => {
      for (const scale of ["small", "medium"] as const) {
        it(`${scale}: schema, row counts, constraints, views and queries`, async () => {
          const { db, rows } = await seedSqlite(ds, scale);
          const expected = datasetCounts(ds)[scale];
          let total = 0;
          for (const [name, n] of Object.entries(expected)) {
            expect(scalar(db, `SELECT COUNT(*) FROM "${name}"`)).toBe(n);
            total += n;
          }
          expect(rows).toBe(total);
          expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
          expect(scalar(db, "PRAGMA integrity_check")).toBe("ok");
          expect(scalar(db, "SELECT dataset_id FROM _sample_info")).toBe(ds.id);
          expect(scalar(db, "SELECT COUNT(*) FROM _sample_queries")).toBe(ds.queries.length);
          expect(scalar(db, "SELECT COUNT(*) FROM _sample_dictionary WHERE object_type = 'column'")).toBe(ds.tables.reduce((a, t) => a + t.columns.length, 0));
          for (const v of ds.views) {
            const r = db.query(`SELECT * FROM "${v.name}" LIMIT 5`).all();
            if (scale === "medium") expect(r.length, `view ${v.name} is empty`).toBeGreaterThan(0);
          }
          const h = sqlHelpers("sqlite");
          for (const q of ds.queries) {
            const r = db.query(q.sql(h)).all();
            expect(r.length, `query ${q.id} returned no rows at ${scale}`).toBeGreaterThan(0);
          }
          db.close();
        }, 60_000);
      }

      it("is deterministic for a seed and different for another seed", () => {
        expect(datasetHash(ds, "small")).toBe(datasetHash(ds, "small"));
        expect(datasetHash(ds, "small", 7)).not.toBe(datasetHash(ds, "small"));
      });

      it("has 3+ views, 6-12 example queries, NOT NULL / UNIQUE / CHECK / FK constraints", () => {
        expect(ds.views.length).toBeGreaterThanOrEqual(3);
        expect(ds.queries.length).toBeGreaterThanOrEqual(6);
        expect(ds.queries.length).toBeLessThanOrEqual(12);
        const cols = ds.tables.flatMap((t) => t.columns);
        expect(cols.some((c) => c.ref)).toBe(true);
        expect(cols.some((c) => c.unique) || ds.tables.some((t) => t.uniques.length)).toBe(true);
        expect(cols.some((c) => c.type === "enum") || ds.tables.some((t) => t.checks.length)).toBe(true);
      });

      it("drop statements remove everything it created", async () => {
        const { db } = await seedSqlite(ds, "small");
        for (const sql of dropStatements(ds)) db.run(sql);
        expect(db.query("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()).toEqual([]);
        const names = objectNames(ds);
        expect(names.tables.length).toBe(ds.tables.length + 3);
      });

      it("scales: small < medium < large", () => {
        const s = Object.values(tableCounts(ds, "small")).reduce((a, b) => a + b, 0);
        const m = Object.values(tableCounts(ds, "medium")).reduce((a, b) => a + b, 0);
        const l = Object.values(tableCounts(ds, "large")).reduce((a, b) => a + b, 0);
        expect(s).toBeGreaterThan(300);
        expect(s).toBeLessThan(m);
        expect(m).toBeLessThan(l);
        expect(l).toBeGreaterThan(100_000);
      });
    });
  }
});
