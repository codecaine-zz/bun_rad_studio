import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startSqliteStudioServer } from "../applications/sqlite_studio_server.ts";
import { startMysqlStudioServer } from "../applications/mysql_studio_server.ts";
import { startPostgresStudioServer } from "../applications/postgres_studio_server.ts";
import { DATASETS, datasetCounts, totalRows } from "../src/db/samples/catalog";
import { objectNames } from "../src/db/samples/render";
import { provisionTestDb } from "./helpers/testdb";

const post = (base: string, path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const get = async (base: string, path: string) => (await fetch(`${base}${path}`)).json() as Promise<any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitJob(base: string, id: string, ms = 60_000): Promise<any> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const j = await get(base, `/api/samples/job?id=${id}`);
    if (j.status !== "running") return j;
    await sleep(15);
  }
  throw new Error("job did not finish");
}
const query = async (base: string, sql: string) => (await (await post(base, "/api/query", { sql })).json()) as any;

describe("sample databases API: SQLite Studio", () => {
  const dir = mkdtempSync(join(tmpdir(), "sdb-api-"));
  const sampleDir = join(dir, "samples");
  const server = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:", sampleDir });
  const base = `http://127.0.0.1:${server.port}`;
  afterAll(() => {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/samples/catalog describes every dataset for SQLite, with queries and defaults", async () => {
    const c = await get(base, "/api/samples/catalog");
    expect(c.success).toBe(true);
    expect(c.dialect).toBe("sqlite");
    expect(c.datasets.length).toBe(DATASETS.length);
    expect(c.host.sampleDir).toBe(sampleDir);
    expect(c.host.supportsCurrent).toBe(true);
    const medicare = c.datasets.find((d: any) => d.id === "medicare_formulary");
    expect(medicare.tableCount).toBeGreaterThanOrEqual(35);
    expect(medicare.queries.length).toBeGreaterThanOrEqual(6);
    expect(medicare.queries[0].sql).toContain("SELECT");
    expect(medicare.description).toContain("SYNTHETIC");
    expect(c.defaultTargets.medicare_formulary).toBe("sample_medicare_formulary.sqlite");
    expect(medicare.rows.small).toBe(totalRows(DATASETS.find((d) => d.id === "medicare_formulary")!, "small"));
  });

  it("creates a new file (wait) with the exact catalog row counts and can open it", async () => {
    const r = await (await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: "api_hospital", wait: true })).json() as any;
    expect(r.success).toBe(true);
    expect(r.status).toBe("done");
    const file = join(sampleDir, "api_hospital.sqlite");
    expect(r.result.target).toBe(file);
    const ds = DATASETS.find((d) => d.id === "hospital_ehr")!;
    expect(r.result.rows).toBe(totalRows(ds, "small"));
    const db = new Database(file, { readonly: true });
    for (const [t, n] of Object.entries(datasetCounts(ds).small)) expect((db.query(`SELECT COUNT(*) AS n FROM "${t}"`).get() as any).n).toBe(n);
    db.close();
    const opened = await (await post(base, "/api/samples/open", { target: file })).json() as any;
    expect(opened.success).toBe(true);
    const q = await query(base, "SELECT COUNT(*) AS n FROM patient");
    expect(q.rows?.[0]?.n ?? q.data?.[0]?.n).toBe(datasetCounts(ds).small.patient!);
    const back = await (await post(base, "/api/connect", { path: ":memory:" })).json() as any;
    expect(back.success).toBe(true);
  });

  it("reports progress while a medium sample is created and ends at 100%", async () => {
    const start = await (await post(base, "/api/samples/seed", { datasetId: "medicare_formulary", scale: "medium", target: "api_progress" })).json() as any;
    expect(start.success).toBe(true);
    expect(start.jobId).toBeTruthy();
    const seen: number[] = [];
    let job: any;
    const end = Date.now() + 60_000;
    while (Date.now() < end) {
      job = await get(base, `/api/samples/job?id=${start.jobId}`);
      seen.push(job.percent);
      if (job.status !== "running") break;
      await sleep(5);
    }
    expect(job.status).toBe("done");
    expect(job.percent).toBe(100);
    expect(job.rowsDone).toBe(job.rowsTotal);
    expect(new Set(seen).size).toBeGreaterThan(2);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("never overwrites: a second create with the same name is a 409 and leaves the file untouched", async () => {
    const file = join(sampleDir, "api_hospital.sqlite");
    const before = readFileSync(file);
    const res = await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: "api_hospital" });
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.code).toBe("exists");
    expect(body.error).toContain("already exists");
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it("validates input: unknown dataset, scale, mode, names", async () => {
    expect((await post(base, "/api/samples/seed", { datasetId: "nope", target: "x" })).status).toBe(404);
    expect((await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "enormous", target: "x" })).status).toBe(400);
    expect((await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", mode: "wipe", target: "x" })).status).toBe(400);
    expect((await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", target: "../escape" })).status).toBe(400);
    expect((await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", target: "sub/dir" })).status).toBe(400);
    expect((await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", target: "bad name!" })).status).toBe(400);
    expect((await get(base, "/api/samples/job?id=missing")).success).toBe(false);
    expect(existsSync(join(dir, "escape.sqlite"))).toBe(false);
  });

  it("the open database: refuses name collisions without changing anything, then adds the sample", async () => {
    const schema = await get(base, "/api/schema");
    const existing = new Set((schema.tables ?? schema.objects ?? []).map((t: any) => String(t.name).toLowerCase()));
    // a table of our own that collides with the hospital sample
    expect((await query(base, "CREATE TABLE patient (note TEXT)")).success).toBe(true);
    const clash = await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: "current" });
    expect(clash.status).toBe(409);
    const clashBody = await clash.json() as any;
    expect(clashBody.error).toContain("patient");
    expect((await query(base, "SELECT name FROM sqlite_master WHERE name = '_sample_info'")).rows?.length ?? 0).toBe(0);
    await query(base, "DROP TABLE patient");
    // pick a dataset whose names are free in the studio's own in-memory database
    const free = DATASETS.find((d) => objectNames(d).tables.concat(objectNames(d).views).every((n) => !existing.has(n.toLowerCase())) && d.id !== "hospital_ehr");
    expect(free).toBeTruthy();
    const ok = await (await post(base, "/api/samples/seed", { datasetId: free!.id, scale: "small", target: "current", wait: true })).json() as any;
    expect(ok.status).toBe("done");
    const info = await query(base, "SELECT dataset_id FROM _sample_info");
    expect((info.rows ?? info.data)[0].dataset_id).toBe(free!.id);

    // replace: needs confirmation, only touches the sample's own objects
    const noConfirm = await post(base, "/api/samples/seed", { datasetId: free!.id, scale: "small", target: "current", mode: "replace-sample-tables" });
    expect(noConfirm.status).toBe(409);
    expect((await noConfirm.json() as any).code).toBe("confirm_required");
    await query(base, "CREATE TABLE my_notes (id INTEGER PRIMARY KEY, body TEXT)");
    await query(base, "INSERT INTO my_notes (body) VALUES ('keep me')");
    const firstTable = free!.order[0]!;
    await query(base, `DELETE FROM ${firstTable} WHERE id IN (SELECT id FROM ${firstTable} LIMIT 1)`).catch(() => {});
    const rep = await (await post(base, "/api/samples/seed", { datasetId: free!.id, scale: "small", target: "current", mode: "replace-sample-tables", confirm: true, wait: true })).json() as any;
    expect(rep.status).toBe("done");
    expect(((await query(base, "SELECT body FROM my_notes")).rows ?? [])[0]?.body).toBe("keep me");
    const cnt = await query(base, `SELECT COUNT(*) AS n FROM ${firstTable}`);
    expect((cnt.rows ?? cnt.data)[0].n).toBe(datasetCounts(free!).small[firstTable]);
    // a different sample in the same database is refused (one sample per database)
    const other = DATASETS.find((d) => d.id !== free!.id)!;
    const wrong = await post(base, "/api/samples/seed", { datasetId: other.id, scale: "small", target: "current", mode: "replace-sample-tables", confirm: true });
    expect(wrong.status).toBe(409);
  });

  it("replace on a file that is not a sample is refused and the file is untouched", async () => {
    mkdirSync(sampleDir, { recursive: true });
    const plain = join(sampleDir, "plain.sqlite");
    const p = new Database(plain);
    p.run("CREATE TABLE patient (id INTEGER PRIMARY KEY, note TEXT)");
    p.run("INSERT INTO patient (note) VALUES ('mine')");
    p.close();
    const before = readFileSync(plain);
    const res = await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: "plain.sqlite", mode: "replace-sample-tables", confirm: true });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).code).toBe("not_a_sample");
    expect(readFileSync(plain).equals(before)).toBe(true);
  });

  it("cancelling a large sample stops it and removes the partial file", async () => {
    const start = await (await post(base, "/api/samples/seed", { datasetId: "medicare_formulary", scale: "large", target: "api_cancel" })).json() as any;
    expect(start.success).toBe(true);
    // a second job while one runs is refused
    const busy = await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: "api_busy" });
    expect(busy.status).toBe(409);
    expect(((await busy.json()) as any).code).toBe("busy");
    await sleep(120);
    await post(base, "/api/samples/cancel", { jobId: start.jobId });
    const job = await waitJob(base, start.jobId);
    expect(job.status).toBe("cancelled");
    expect(readdirSync(sampleDir).filter((f) => f.startsWith("api_cancel"))).toEqual([]);
  });

  it("POST /api/samples/run runs a catalog query read-only and explains problems in plain words", async () => {
    const file = join(sampleDir, "api_hospital.sqlite");
    const ok = await (await post(base, "/api/samples/run", { datasetId: "hospital_ehr", queryId: "polypharmacy", target: file })).json() as any;
    expect(ok.success).toBe(true);
    expect(ok.columns).toEqual(["mrn", "sex", "meds"]);
    expect(ok.rowCount).toBeGreaterThan(0);
    expect(ok.rows[0].length).toBe(3);
    const unknown = await post(base, "/api/samples/run", { datasetId: "hospital_ehr", queryId: "drop_everything", target: file });
    expect(unknown.status).toBe(404);
    const noTarget = await post(base, "/api/samples/run", { datasetId: "hospital_ehr", queryId: "polypharmacy" });
    expect(noTarget.status).toBe(400);
    const gone = await post(base, "/api/samples/run", { datasetId: "hospital_ehr", queryId: "polypharmacy", target: join(sampleDir, "missing.sqlite") });
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as any).error).toContain("no longer exists");
    // a client cannot send its own SQL: the field is ignored and the catalog statement runs
    const sneaky = await (await post(base, "/api/samples/run", { datasetId: "hospital_ehr", queryId: "polypharmacy", target: file, sql: "DROP TABLE patient" })).json() as any;
    expect(sneaky.success).toBe(true);
    const db = new Database(file, { readonly: true });
    expect((db.query("SELECT COUNT(*) AS n FROM patient").get() as any).n).toBeGreaterThan(0);
    db.close();
  });

  it("the legacy POST /api/seed still works", async () => {
    const r = await (await post(base, "/api/seed", {})).json() as any;
    expect(r.success).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------ MySQL and PostgreSQL (real servers)
const adminUrl = (engine: "mysql" | "postgres") => (engine === "mysql" ? process.env.TEST_MYSQL_URL : process.env.TEST_PG_URL)?.trim();

async function adminSql(engine: "mysql" | "postgres") {
  const raw = adminUrl(engine)!;
  const u = new URL(raw.replace(/^mysql:\/\//i, "http://").replace(/^postgres(ql)?:\/\//i, "http://"));
  return new SQL({ adapter: engine, hostname: u.hostname, port: Number(u.port) || (engine === "mysql" ? 3306 : 5432), username: decodeURIComponent(u.username || "root"), password: u.password ? decodeURIComponent(u.password) : undefined, database: engine === "postgres" ? decodeURIComponent(u.pathname.slice(1)) || "postgres" : undefined, max: 2, allowPublicKeyRetrieval: engine === "mysql" ? true : undefined } as any);
}

for (const engine of ["mysql", "postgres"] as const) {
  const testDb = await provisionTestDb(engine);
  const suite = testDb ? describe : describe.skip;
  suite(`sample databases API: ${engine === "mysql" ? "MySQL" : "PostgreSQL"} Studio (real server)`, () => {
    const server = testDb ? (engine === "mysql" ? startMysqlStudioServer({ port: 0, config: testDb.config } as any) : startPostgresStudioServer({ port: 0, config: testDb.config } as any)) : (null as any);
    const base = `http://127.0.0.1:${server?.port}`;
    const tag = Math.random().toString(16).slice(2, 8);
    const created: string[] = [];
    let admin: any;
    const kind = engine === "mysql" ? "database" : "schema";
    const nameOf = (s: string) => `sample_t_${tag}_${s}`;
    async function exists(name: string) {
      if (engine === "mysql") return ((await admin.unsafe("SELECT schema_name AS n FROM information_schema.schemata WHERE schema_name = ?", [name])) as any[]).length > 0;
      return ((await server && (await admin.unsafe("SELECT 1 FROM pg_namespace WHERE nspname = $1", [name]))) as any[]).length > 0;
    }
    async function count(name: string, table: string): Promise<number> {
      const r = engine === "mysql" ? await admin.unsafe(`SELECT COUNT(*) AS n FROM \`${name}\`.\`${table}\``) : await admin.unsafe(`SELECT COUNT(*) AS n FROM "${name}"."${table}"`);
      return Number(r[0].n);
    }
    beforeAll(async () => {
      admin = engine === "mysql" ? await adminSql("mysql") : new SQL({ adapter: "postgres", hostname: testDb!.config.host, port: testDb!.config.port, username: testDb!.config.user, password: testDb!.config.password, database: testDb!.config.database, max: 2 } as any);
    });
    afterAll(async () => {
      for (const n of created) {
        try {
          if (engine === "mysql") await admin.unsafe(`DROP DATABASE IF EXISTS \`${n}\``);
          else await admin.unsafe(`DROP SCHEMA IF EXISTS "${n}" CASCADE`);
        } catch {}
      }
      try { server?.stop(true); } catch {}
      await admin?.end?.();
      await testDb?.drop();
    });

    it("catalog is the same list with this engine's wording", async () => {
      const c = await get(base, "/api/samples/catalog");
      expect(c.dialect).toBe(engine);
      expect(c.targetLabel).toBe(kind);
      expect(c.datasets.length).toBe(DATASETS.length);
      expect(c.defaultTargets.medicare_formulary).toBe("sample_medicare_formulary");
      expect(c.datasets[0].queries[0].sql.length).toBeGreaterThan(20);
    });

    it(`creates a new ${kind} with the exact row counts, then refuses to reuse the name`, async () => {
      const name = nameOf("hosp");
      created.push(name);
      const r = await (await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: name, wait: true })).json() as any;
      expect(r.error ?? r.status).toBe("done");
      const ds = DATASETS.find((d) => d.id === "hospital_ehr")!;
      for (const [t, n] of Object.entries(datasetCounts(ds).small)) expect(await count(name, t)).toBe(n);
      const again = await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: name });
      expect(again.status).toBe(409);
      expect(((await again.json()) as any).error).toContain("already");
      expect(await count(name, "patient")).toBe(datasetCounts(ds).small.patient!);
    });

    it(`refuses a ${kind} that holds someone else's tables (nothing changes)`, async () => {
      const name = nameOf("mine");
      created.push(name);
      if (engine === "mysql") { await admin.unsafe(`CREATE DATABASE \`${name}\``); await admin.unsafe(`CREATE TABLE \`${name}\`.patient (note TEXT)`); await admin.unsafe(`INSERT INTO \`${name}\`.patient (note) VALUES ('mine')`); }
      else { await admin.unsafe(`CREATE SCHEMA "${name}"`); await admin.unsafe(`CREATE TABLE "${name}".patient (note TEXT)`); await admin.unsafe(`INSERT INTO "${name}".patient (note) VALUES ('mine')`); }
      const res = await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: name });
      expect(res.status).toBe(409);
      expect(((await res.json()) as any).error).toContain("patient");
      const replace = await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", scale: "small", target: name, mode: "replace-sample-tables", confirm: true });
      expect(replace.status).toBe(409);
      expect(((await replace.json()) as any).code).toBe("not_a_sample");
      expect(await count(name, "patient")).toBe(1);
    });

    it("replace needs confirm, keeps unrelated tables and restores the sample", async () => {
      const name = nameOf("repl");
      created.push(name);
      const ds = DATASETS.find((d) => d.id === "saas_billing")!;
      const first = await (await post(base, "/api/samples/seed", { datasetId: ds.id, scale: "small", target: name, wait: true })).json() as any;
      expect(first.error ?? first.status).toBe("done");
      if (engine === "mysql") await admin.unsafe(`CREATE TABLE \`${name}\`.my_notes (body TEXT)`);
      else await admin.unsafe(`CREATE TABLE "${name}".my_notes (body TEXT)`);
      if (engine === "mysql") await admin.unsafe(`DELETE FROM \`${name}\`.coupon_redemption`); else await admin.unsafe(`DELETE FROM "${name}".coupon_redemption`);
      const noConfirm = await post(base, "/api/samples/seed", { datasetId: ds.id, scale: "small", target: name, mode: "replace-sample-tables" });
      expect(noConfirm.status).toBe(409);
      const ok = await (await post(base, "/api/samples/seed", { datasetId: ds.id, scale: "small", target: name, mode: "replace-sample-tables", confirm: true, wait: true })).json() as any;
      expect(ok.error ?? ok.status).toBe("done");
      expect(await count(name, "coupon_redemption")).toBe(datasetCounts(ds).small.coupon_redemption!);
      expect(await count(name, "my_notes")).toBe(0);
    });

    it("cancel removes everything that was created", async () => {
      const name = nameOf("cancel");
      created.push(name);
      const start = await (await post(base, "/api/samples/seed", { datasetId: "medicare_formulary", scale: "large", target: name })).json() as any;
      expect(start.success).toBe(true);
      await sleep(300);
      await post(base, "/api/samples/cancel", { jobId: start.jobId });
      const job = await waitJob(base, start.jobId);
      expect(job.status).toBe("cancelled");
      expect(await exists(name)).toBe(false);
    });

    it("validates names and keeps the legacy seed endpoint", async () => {
      expect((await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", target: "bad name; DROP" })).status).toBe(400);
      expect((await post(base, "/api/samples/seed", { datasetId: "nope", target: "x" })).status).toBe(404);
      if (engine === "postgres") expect((await post(base, "/api/samples/seed", { datasetId: "hospital_ehr", target: "public" })).status).toBe(400);
      const legacy = await post(base, engine === "mysql" ? "/api/seed" : "/api/seed-sample", {});
      expect((await legacy.json() as any).success).toBe(true);
    });
  });
}
