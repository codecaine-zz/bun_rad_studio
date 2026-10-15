import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { makeRig, RIGS, type Rig } from "../helpers/staging";
import { startSqliteStudioServer } from "../../applications/sqlite_studio_server";
import { startMysqlStudioServer } from "../../applications/mysql_studio_server";
import { startPostgresStudioServer } from "../../applications/postgres_studio_server";
import { createStagingHandler, scratchDir } from "../../src/db/staging/routes";
import { SqliteStageDb } from "../../src/db/staging/db";
import { resetLimits, setLimits } from "../../src/db/staging/limits";

const H = { "X-Studio-Staging": "1", "Content-Type": "application/json" };

class Client {
  constructor(readonly base: string) {}
  async post(path: string, body: unknown = {}, headers: Record<string, string> = H) {
    const r = await fetch(`${this.base}/api/staging/${path}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  }
  async get(path: string, headers: Record<string, string> = { "X-Studio-Staging": "1" }) {
    const r = await fetch(`${this.base}/api/staging/${path}`, { headers });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  }
  async upload(name: string, content: string | Uint8Array, chunk = 8) {
    const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
    const start = await this.post("upload/start", { name, size: bytes.length });
    if (start.status !== 200) return start;
    let off = 0;
    for (; off < bytes.length; off += chunk) {
      const part = bytes.subarray(off, off + chunk);
      const r = await fetch(`${this.base}/api/staging/upload/chunk?id=${start.body.uploadId}&offset=${off}`, { method: "POST", headers: { "X-Studio-Staging": "1", "Content-Type": "application/octet-stream" }, body: part });
      const j = (await r.json()) as any;
      if (!j.ok) return { status: r.status, body: j };
    }
    return this.post("upload/finish", { uploadId: start.body.uploadId });
  }
  async job(r: { status: number; body: any }) {
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    for (let i = 0; i < 600; i++) {
      const j = (await this.get(`job?id=${r.body.job.id}`)).body.job;
      if (j.state !== "running") return j;
      await Bun.sleep(25);
    }
    throw new Error("job did not finish");
  }
}

const CSV = "id,name,email,age\n1,Ann Changed,ann@x.com,31\n3,Cy,cy@x.com,22\n4,Di,di@x.com,x\n";

async function flow(c: Client, rig: Rig) {
  const info = await c.get("info");
  expect(info.body).toMatchObject({ ok: true, engine: rig.name, production: false });
  const up = await c.upload("people.csv", CSV, 16);
  expect(up.status).toBe(200);
  const sourceId = up.body.sourceId;
  const an = await c.post("analyze", { sourceId });
  expect(an.body.analysis.settings).toMatchObject({ format: "csv", delimiter: ",", hasHeader: true });
  const sg = await c.post("suggest", { sourceId, settings: an.body.analysis.settings, table: "customers" });
  expect(sg.body.keyColumns).toEqual(["id"]);
  const plan = { target: "customers", createTable: false, rules: sg.body.mapping.rules, keyColumns: ["id"], userRules: [] };
  const sample = await c.post("map/sample", { sourceId, settings: an.body.analysis.settings, plan });
  expect(sample.body.rows[2].problems[0].message).toMatch(/not a whole number/);
  const load = await c.job(await c.post("load", { sourceId, settings: an.body.analysis.settings, plan }));
  expect(load.state, JSON.stringify(load)).toBe("done");
  const batchId = load.result.batch.batchId;
  expect(load.result).toMatchObject({ rowsLoaded: 3 });
  const val = await c.job(await c.post("validate", { batchId }));
  expect(val.state, JSON.stringify(val.error)).toBe("done");
  expect(val.result).toMatchObject({ total: 3, valid: 2, invalid: 1, newRows: 1, changed: 1 });
  const problems = await c.post("problems", { batchId });
  expect(problems.body.lines[0]).toMatchObject({ column: "age", code: "not_integer", value: "x" });
  const pv = await c.post("preview", { batchId, mode: "upsert", rehearse: true });
  expect(pv.body.preview.counts).toMatchObject({ insert: 1, update: 1 });
  expect(pv.body.preview.rehearsal).toMatchObject({ ok: true });
  const bad = await c.post("promote", { batchId, mode: "nonsense" });
  expect(bad.status).toBe(400);
  const pr = await c.job(await c.post("promote", { batchId, mode: "upsert" }));
  expect(pr.state, JSON.stringify(pr.error)).toBe("done");
  expect(pr.result.counts).toMatchObject({ inserted: 1, updated: 1 });
  expect((await rig.sql("SELECT name FROM customers WHERE id = 1"))[0]!.name).toBe("Ann Changed");
  const un = await c.post("undo", { batchId });
  expect(un.body.result).toMatchObject({ ok: true });
  expect((await rig.sql("SELECT name FROM customers WHERE id = 1"))[0]!.name).toBe("Ann");
  const area = await c.post("area", {});
  expect(area.body.entries.find((e: any) => e.batch.batchId === batchId).batch.status).toBe("undone");
  const rej = await fetch(`${c.base}/api/staging/rejects`, { method: "POST", headers: H, body: JSON.stringify({ batchId }) });
  expect(rej.headers.get("content-type")).toContain("text/csv");
  expect(await rej.text()).toContain("not a whole number");
  expect((await c.post("drop", { batchId })).body.ok).toBe(true);
}

const servers: ReturnType<typeof Bun.serve>[] = [];
afterAll(() => servers.forEach((s) => s.stop(true)));

for (const name of RIGS) {
  const enabled = name === "sqlite" || (name === "mysql" ? process.env.TEST_MYSQL_URL : process.env.TEST_PG_URL);
  (enabled ? describe : describe.skip)(`staging API in the ${name} studio`, () => {
    let rig: Rig;
    let c: Client;
    beforeAll(async () => {
      rig = (await makeRig(name))!;
      await rig.sql(`INSERT INTO customers (id, name, email, age) VALUES (1,'Ann','ann@x.com',30), (2,'Bob','bob@x.com',40)`);
      const server =
        name === "sqlite"
          ? startSqliteStudioServer({ port: 0, initialDbPath: rig.path })
          : name === "mysql"
            ? startMysqlStudioServer({ port: 0, initialDbPath: rig.config!.database, config: { ...rig.config, url: undefined } as any })
            : startPostgresStudioServer({ port: 0, initialDbPath: rig.config!.database, config: { ...rig.config, schema: "public" } as any });
      servers.push(server);
      c = new Client(`http://127.0.0.1:${server.port}`);
    });
    afterAll(async () => {
      await rig?.close();
    });

    it("runs the whole import through the studio's own HTTP API: upload, map, load, check, dry run, promote, undo", async () => {
      await flow(c, rig);
    }, 60_000);

    it("refuses requests that do not come from the studio page", async () => {
      expect((await c.get("info", {})).status).toBe(403);
      expect((await c.post("area", {}, { "Content-Type": "application/json" })).status).toBe(403);
      expect((await c.post("area", {}, { "X-Studio-Staging": "1", "Content-Type": "text/plain" })).status).toBe(415);
      const cross = await fetch(`${c.base}/api/staging/info`, { headers: { "X-Studio-Staging": "1", Origin: "http://evil.example" } });
      expect(cross.status).toBe(403);
      const rebind = await fetch(`${c.base}/api/staging/info`, { headers: { "X-Studio-Staging": "1", Host: "evil.example" } }).catch(() => null);
      if (rebind) expect(rebind.status).toBe(403);
      expect((await c.post("paste", "{not json")).status).toBe(400);
      expect((await c.post("nonsense", {})).status).toBe(404);
    });
  });
}

describe("staging API: uploads, files on disk, caps, production safety", () => {
  let dir: string;
  let c: Client;
  let server: ReturnType<typeof Bun.serve>;
  let handler: ReturnType<typeof createStagingHandler>;
  const TOKEN = "grant-secret-123";
  let rig: Rig;
  beforeAll(async () => {
    rig = (await makeRig("sqlite"))!;
    dir = rig.dir;
    await rig.sql(`INSERT INTO customers (id, name, email, age) VALUES (1,'Ann','ann@x.com',30)`);
    handler = createStagingHandler({ engine: "sqlite", getDb: async () => new SqliteStageDb({ path: rig.path! }) }, { token: TOKEN });
    server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (req) => (await handler.handle(req)) ?? new Response("nf", { status: 404 }) });
    c = new Client(`http://127.0.0.1:${server.port}`);
  });
  afterAll(async () => {
    resetLimits();
    server?.stop(true);
    handler?.dispose();
    delete process.env.STUDIO_ENVIRONMENT;
    await rig?.close();
  });

  it("uploads in pieces into a private scratch folder, refuses out-of-order and oversize pieces, and releases the copy", async () => {
    const up = await c.upload("a.csv", "id,name\n1,Ann\n", 5);
    expect(up.body).toMatchObject({ ok: true, name: "a.csv", size: 14 });
    const files = readdirSync(scratchDir()).filter((f) => f.endsWith(".upload"));
    expect(files.length).toBeGreaterThan(0);
    if (process.platform !== "win32") expect(statSync(scratchDir()).mode & 0o077).toBe(0);
    await c.post("source/release", { sourceId: up.body.sourceId });
    const start = await c.post("upload/start", { name: "b.csv", size: 10 });
    const r = await fetch(`${c.base}/api/staging/upload/chunk?id=${start.body.uploadId}&offset=3`, { method: "POST", headers: { "X-Studio-Staging": "1", "Content-Type": "application/octet-stream" }, body: new Uint8Array(3) });
    expect(r.status).toBe(409);
    const r2 = await fetch(`${c.base}/api/staging/upload/chunk?id=${start.body.uploadId}&offset=0`, { method: "POST", headers: { "X-Studio-Staging": "1", "Content-Type": "application/octet-stream" }, body: new Uint8Array(11) });
    expect(r2.status).toBe(413);
    setLimits({ maxFileBytes: 100 });
    expect((await c.post("upload/start", { name: "big.csv", size: 101 })).body.error.message).toMatch(/bigger than/);
    resetLimits();
    const short = await c.post("upload/start", { name: "short.csv", size: 50 });
    await fetch(`${c.base}/api/staging/upload/chunk?id=${short.body.uploadId}&offset=0`, { method: "POST", headers: { "X-Studio-Staging": "1", "Content-Type": "application/octet-stream" }, body: new Uint8Array(5) });
    expect((await c.post("upload/finish", { uploadId: short.body.uploadId })).body.error.message).toMatch(/did not arrive completely/);
  });

  it("paste works, and Excel files get a plain explanation", async () => {
    const p = await c.post("paste", { text: "a;b\n1;2\n" });
    const an = await c.post("analyze", { sourceId: p.body.sourceId });
    expect(an.body.analysis.settings.delimiter).toBe(";");
    expect((await c.post("paste", { text: "   " })).status).toBe(400);
    const x = await c.upload("book.xlsx", new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0]));
    const ax = await c.post("analyze", { sourceId: x.body.sourceId });
    expect(ax.status).toBe(400);
    expect(ax.body.error.message).toMatch(/Excel.*CSV UTF-8/);
  });

  it("reads a file from disk only after the File Manager grants that exact path with its secret, read-only", async () => {
    const f = join(dir, "grant.csv");
    writeFileSync(f, "id,name,email,age\n9,G,g@x.com,20\n");
    const before = readFileSync(f, "utf8");
    expect((await c.post("source/grant", {})).status).toBe(404);
    expect((await c.post("grant", { path: f }, { "Content-Type": "application/json" })).status).toBe(403);
    expect((await c.post("grant", { path: f }, { ...H, "x-staging-grant": "wrong" })).status).toBe(403);
    const ok = { ...H, "x-staging-grant": TOKEN };
    for (const bad of ["relative/file.csv", join(dir, "nope.csv"), dir, join(dir, "t.db"), "/etc/passwd", "C:relative"]) {
      expect((await c.post("grant", { path: bad }, ok)).status, bad).toBe(400);
    }
    if (process.platform !== "win32") {
      symlinkSync("/etc/hosts", join(dir, "link.csv"));
      expect((await c.post("grant", { path: join(dir, "link.csv") }, ok)).status).toBe(400);
    }
    expect((await c.post("grant", { path: f }, ok)).status).toBe(200);
    expect((await c.get("pending")).body.pending).toMatchObject({ open: true, name: "grant.csv" });
    const src = await c.post("source/grant", {});
    expect(src.body).toMatchObject({ ok: true, name: "grant.csv" });
    expect((await c.post("source/grant", {})).status).toBe(404);
    const sg = await c.post("analyze", { sourceId: src.body.sourceId });
    expect(sg.body.analysis.columns.map((x: any) => x.name)).toEqual(["id", "name", "email", "age"]);
    await c.post("source/release", { sourceId: src.body.sourceId });
    expect(readFileSync(f, "utf8")).toBe(before);
    expect(existsSync(f)).toBe(true);
    // asking only to open the wizard (no file)
    expect((await c.post("grant", {}, ok)).status).toBe(200);
    expect((await c.get("pending")).body.pending).toMatchObject({ open: true });
    await c.post("pending/clear", {});
    expect((await c.get("pending")).body.pending).toBeNull();
  });

  it("a production (or read-only marked) connection needs the table name typed before promoting or undoing, and never runs the writing test run", async () => {
    process.env.STUDIO_ENVIRONMENT = "production";
    try {
      expect((await c.get("info")).body).toMatchObject({ production: true });
      const up = await c.upload("p.csv", "id,name,email,age\n5,Prod,p@x.com,20\n");
      const an = await c.post("analyze", { sourceId: up.body.sourceId });
      const sg = await c.post("suggest", { sourceId: up.body.sourceId, settings: an.body.analysis.settings, table: "customers" });
      const plan = { target: "customers", createTable: false, rules: sg.body.mapping.rules, keyColumns: ["id"], userRules: [] };
      const load = await c.job(await c.post("load", { sourceId: up.body.sourceId, settings: an.body.analysis.settings, plan }));
      const batchId = load.result.batch.batchId;
      const val = await c.job(await c.post("validate", { batchId }));
      expect(val.result.notes.join(" ")).toMatch(/not tried in advance on a protected connection/);
      const pv = await c.post("preview", { batchId, mode: "insert-new", rehearse: true });
      expect(pv.body.guarded).toBe(true);
      expect(pv.body.preview.rehearsal.skipped).toMatch(/protected connection/);
      expect(pv.body.preview.counts.insert).toBe(1);
      const refused = await c.post("promote", { batchId, mode: "insert-new" });
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe("NEEDS_CONFIRM");
      expect((await c.post("promote", { batchId, mode: "insert-new", confirmTyped: "wrong" })).status).toBe(403);
      expect((await rig.sql("SELECT COUNT(*) AS c FROM customers WHERE id = 5"))[0]!.c).toBe(0);
      const done = await c.job(await c.post("promote", { batchId, mode: "insert-new", confirmTyped: "customers" }));
      expect(done.state).toBe("done");
      expect((await c.post("undo", { batchId })).status).toBe(403);
      expect((await c.post("undo", { batchId, confirmTyped: "customers" })).body.result.ok).toBe(true);
    } finally {
      delete process.env.STUDIO_ENVIRONMENT;
    }
    process.env.STUDIO_READONLY = "1";
    try {
      expect((await c.get("info")).body).toMatchObject({ readOnlyMarked: true });
    } finally {
      delete process.env.STUDIO_READONLY;
    }
  });

  it("runs one step at a time and can cancel a load", async () => {
    const lines = ["id,name,email,age"];
    for (let i = 0; i < 250000; i++) lines.push(`${500 + i},N${i},m${i}@x.com,20`);
    const text = lines.join("\n");
    const up = await c.upload("many.csv", text, 1 << 20);
    const up2 = await c.upload("many2.csv", text, 1 << 20);
    const an = await c.post("analyze", { sourceId: up.body.sourceId });
    const sg = await c.post("suggest", { sourceId: up.body.sourceId, settings: an.body.analysis.settings, table: "customers" });
    const plan = { target: "customers", createTable: false, rules: sg.body.mapping.rules, keyColumns: ["id"], userRules: [] };
    const before = (await rig.db.tables()).filter((t) => t.startsWith("stg_")).length;
    const start = await c.post("load", { sourceId: up.body.sourceId, settings: an.body.analysis.settings, plan });
    expect(start.status).toBe(200);
    const second = await c.post("load", { sourceId: up2.body.sourceId, settings: an.body.analysis.settings, plan });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("BUSY");
    await c.post("job/cancel", { id: start.body.job.id });
    const j = await c.job(start);
    expect(j.state).toBe("cancelled");
    expect((await rig.db.tables()).filter((t) => t.startsWith("stg_")).length).toBe(before);
  });

  it("rejects hostile requests: unknown tables, own tables as targets, bad rules, unknown columns", async () => {
    const up = await c.upload("h.csv", "id,name,email,age\n1,a,b,2\n");
    const an = await c.post("analyze", { sourceId: up.body.sourceId });
    const sid = up.body.sourceId;
    const st = an.body.analysis.settings;
    expect((await c.post("suggest", { sourceId: sid, settings: st, table: 'customers"; DROP TABLE customers; --' })).status).toBe(404);
    expect((await c.post("suggest", { sourceId: sid, settings: st, table: "_import_batches" })).status).toBe(400);
    const good = (await c.post("suggest", { sourceId: sid, settings: st, table: "customers" })).body.mapping.rules;
    const base = { target: "customers", createTable: false, rules: good, keyColumns: ["id"], userRules: [] };
    expect((await c.post("load", { sourceId: sid, settings: st, plan: { ...base, rules: [{ target: "id", source: { kind: "column", column: "zzz" }, steps: [] }] } })).status).toBe(400);
    expect((await c.post("load", { sourceId: sid, settings: st, plan: { ...base, rules: [{ target: "nope", source: { kind: "skip" }, steps: [] }] } })).status).toBe(400);
    expect((await c.post("load", { sourceId: "missing", settings: st, plan: base })).status).toBe(404);
    expect((await c.post("load", { sourceId: sid, settings: st, plan: { ...base, createTable: true, target: "stg_evil_20260101_1200", newTable: { columns: [{ name: "a", kind: "text" }] } } })).status).toBe(400);
    expect((await c.post("load", { sourceId: sid, settings: st, plan: { ...base, createTable: true, target: 'x"; DROP TABLE customers;--', newTable: { columns: [{ name: "a", kind: "text" }] } } })).status).toBe(400);
    expect((await c.post("fix", { batchId: "nope", rowId: 1, column: "a", value: "x" })).status).toBe(404);
    expect((await c.post("describe", { table: "_import_batch_changes" })).status).toBe(400);
  });
});
