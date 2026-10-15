/**
 * Every sample dataset on real MySQL 8 and PostgreSQL servers. Skipped unless TEST_MYSQL_URL / TEST_PG_URL are set
 * (see docs/testing/database-tests.md). Each run creates uniquely named databases / schemas and removes them again.
 */
import { afterAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { SQL } from "bun";
import { DATASETS, datasetCounts, totalRows } from "../src/db/samples/catalog";
import { sqlHelpers } from "../src/db/samples/dialect";
import { seedMysql, seedPostgres } from "../src/db/samples/targets";
import { SeedCancelled } from "../src/db/samples/runner";
import { provisionTestDb } from "./helpers/testdb";

setDefaultTimeout(180_000);

const tag = Math.random().toString(16).slice(2, 8);
let seq = 0;

for (const engine of ["mysql", "postgres"] as const) {
  const testDb = await provisionTestDb(engine);
  const suite = testDb ? describe : describe.skip;
  suite(`sample datasets on a real ${engine === "mysql" ? "MySQL" : "PostgreSQL"} server`, () => {
    const cfg = testDb?.config;
    const sql: any = testDb ? new SQL({ adapter: engine, hostname: cfg!.host, port: cfg!.port, username: cfg!.user, password: cfg!.password, database: engine === "postgres" ? cfg!.database : undefined, max: 6, allowPublicKeyRetrieval: engine === "mysql" ? true : undefined } as any) : null;
    const created: string[] = [];
    const q = (n: string) => (engine === "mysql" ? `\`${n}\`` : `"${n}"`);

    afterAll(async () => {
      for (const n of created) await sql.unsafe(engine === "mysql" ? `DROP DATABASE IF EXISTS ${q(n)}` : `DROP SCHEMA IF EXISTS ${q(n)} CASCADE`).catch(() => {});
      await sql?.end?.();
      await testDb?.drop();
    });

    /** Runs read-only SQL inside the sample (MySQL: its own database; PostgreSQL: its own schema on the search path). */
    async function inSample<T>(name: string, fn: (run: (s: string) => Promise<any[]>) => Promise<T>): Promise<T> {
      if (engine === "mysql") {
        const c = await sql.reserve();
        try {
          await c.unsafe(`USE ${q(name)}`);
          return await fn((s) => c.unsafe(s));
        } finally {
          c.release();
        }
      }
      return await sql.begin(async (tx: any) => {
        await tx.unsafe(`SET LOCAL search_path TO ${q(name)}`);
        return await fn((s) => tx.unsafe(s));
      });
    }

    async function load(id: string, scale: "small" | "medium" | "large") {
      const ds = DATASETS.find((d) => d.id === id)!;
      const name = `sample_t_${tag}_${++seq}`;
      created.push(name);
      const t0 = Date.now();
      const sum = engine === "mysql"
        ? await seedMysql(sql, ds, { datasetId: id, scale, target: name, mode: "new" }, {})
        : await seedPostgres(sql, ds, { datasetId: id, scale, target: name, mode: "new" }, {});
      return { ds, name, sum, ms: Date.now() - t0 };
    }

    for (const ds of DATASETS) {
      for (const scale of ["small", "medium"] as const) {
        it(`${ds.id} (${scale}): row counts, views and example queries`, async () => {
          const { name, sum } = await load(ds.id, scale);
          expect(sum.rows).toBe(totalRows(ds, scale));
          await inSample(name, async (run) => {
            for (const [t, n] of Object.entries(datasetCounts(ds)[scale])) expect(Number((await run(`SELECT COUNT(*) AS n FROM ${q(t)}`))[0].n), t).toBe(n);
            expect((await run(`SELECT dataset_id, scale FROM ${q("_sample_info")}`))[0]).toMatchObject({ dataset_id: ds.id, scale });
            for (const v of ds.views) {
              const rows = await run(`SELECT * FROM ${q(v.name)} LIMIT 5`);
              if (scale === "medium") expect(rows.length, `view ${v.name}`).toBeGreaterThan(0);
            }
            const h = sqlHelpers(engine);
            for (const query of ds.queries) expect((await run(query.sql(h))).length, `query ${query.id}`).toBeGreaterThan(0);
            expect(Number((await run(`SELECT COUNT(*) AS n FROM ${q("_sample_queries")}`))[0].n)).toBe(ds.queries.length);
          });
        });
      }
    }

    it("Medicare formulary (large): a few hundred thousand rows load in a reasonable time", async () => {
      const { ds, name, sum, ms } = await load("medicare_formulary", "large");
      console.log(`[${engine}] medicare_formulary large: ${sum.rows.toLocaleString()} rows in ${(ms / 1000).toFixed(1)} s`);
      expect(sum.rows).toBe(totalRows(ds, "large"));
      expect(ms).toBeLessThan(90_000);
      await inSample(name, async (run) => {
        expect(Number((await run(`SELECT COUNT(*) AS n FROM ${q("rx_claim")}`))[0].n)).toBe(datasetCounts(ds).large.rx_claim!);
      });
    });

    it("the metadata is real: comments / dictionary, generated columns, JSON and (PostgreSQL) arrays, materialized views, partial indexes", async () => {
      const { name } = await load("saas_billing", "small");
      await inSample(name, async (run) => {
        if (engine === "mysql") {
          const c = await run(`SELECT table_comment AS c FROM information_schema.tables WHERE table_schema = '${name}' AND table_name = 'invoice'`);
          expect(String(c[0].c ?? c[0].TABLE_COMMENT)).toContain("Invoices");
          const col = await run(`SELECT column_comment AS c, generation_expression AS g FROM information_schema.columns WHERE table_schema = '${name}' AND table_name = 'invoice' AND column_name = 'total'`);
          expect(String(col[0].g ?? col[0].GENERATION_EXPRESSION)).toContain("subtotal");
          expect(String((await run(`SELECT data_type AS t FROM information_schema.columns WHERE table_schema = '${name}' AND table_name = 'subscription_event' AND column_name = 'details'`))[0].t)).toBe("json");
        } else {
          const c = await run(`SELECT obj_description(to_regclass('invoice')) AS c, col_description(to_regclass('invoice'), (SELECT ordinal_position FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'invoice' AND column_name = 'total')) AS cc`);
          expect(c[0].c).toContain("Invoices");
          expect(String(c[0].cc)).toContain("Computed");
          expect(((await run(`SELECT 1 AS x FROM pg_matviews WHERE schemaname = current_schema() AND matviewname = 'mv_monthly_revenue'`))).length).toBe(1);
          expect(String((await run(`SELECT data_type AS t FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'subscription_event' AND column_name = 'details'`))[0].t)).toBe("jsonb");
        }
      });
    });

    it("triggers work on this engine: published formulary versions are immutable, the ledger cannot be changed", async () => {
      const med = await load("medicare_formulary", "small");
      const published = (await inSample(med.name, (run) => run(`SELECT fd.id AS id FROM ${q("formulary_drug")} fd JOIN ${q("formulary_version")} fv ON fv.id = fd.formulary_version_id WHERE fv.status = 'published' LIMIT 1`)))[0].id;
      // A failing statement aborts a PostgreSQL transaction, so each one gets its own.
      await expect(inSample(med.name, (run) => run(`UPDATE ${q("formulary_drug")} SET tier_id = 4 WHERE id = ${published}`))).rejects.toThrow(/immutable/);
      const bank = await load("retail_banking", "small");
      await expect(inSample(bank.name, (run) => run(`UPDATE ${q("posting")} SET debit = debit + 1 WHERE id = 1`))).rejects.toThrow(/immutable/);
      await expect(inSample(bank.name, (run) => run(`DELETE FROM ${q("posting")} WHERE id = 1`))).rejects.toThrow(/immutable/);
      await inSample(bank.name, async (run) => {
        expect(Number((await run(`SELECT COUNT(*) AS n FROM ${q("v_entry_balance_check")} WHERE difference <> 0`))[0].n)).toBe(0);
      });
    });

    it("an error halfway leaves nothing behind (rollback / cleanup)", async () => {
      const ds = DATASETS.find((d) => d.id === "hospital_ehr")!;
      const name = `sample_t_${tag}_fail`;
      created.push(name);
      let n = 0;
      const attempt = engine === "mysql"
        ? seedMysql(sql, ds, { datasetId: ds.id, scale: "small", target: name, mode: "new" }, { isCancelled: () => ++n > 40 })
        : seedPostgres(sql, ds, { datasetId: ds.id, scale: "small", target: name, mode: "new" }, { isCancelled: () => ++n > 40 });
      await expect(attempt).rejects.toBeInstanceOf(SeedCancelled);
      const left = engine === "mysql"
        ? await sql.unsafe("SELECT schema_name AS n FROM information_schema.schemata WHERE schema_name = ?", [name])
        : await sql.unsafe("SELECT nspname AS n FROM pg_namespace WHERE nspname = $1", [name]);
      expect(left.length).toBe(0);
    });
  });
}
