/**
 * The "Sample databases" dialog, driven end to end: the real client script runs in jsdom against a real studio server
 * (SQLite always; MySQL / PostgreSQL when TEST_MYSQL_URL / TEST_PG_URL are set). Regression for "Insert example queries" failing:
 * the queries must land in the editor the studio really reads, and they must RUN against the freshly created sample.
 */
import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { SQL } from "bun";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startSqliteStudioServer } from "../applications/sqlite_studio_server.ts";
import { startMysqlStudioServer } from "../applications/mysql_studio_server.ts";
import { startPostgresStudioServer } from "../applications/postgres_studio_server.ts";
import { SAMPLES_SCRIPT_MYSQL, SAMPLES_SCRIPT_POSTGRES, SAMPLES_SCRIPT_SQLITE } from "../src/db/samples/ui";
import { DATASETS } from "../src/db/samples/catalog";
import { isReadOnlySelect } from "../src/db/samples/routes";
import { sqlHelpers } from "../src/db/samples/dialect";
import { DIALECTS } from "../src/db/samples/model";
import { provisionTestDb } from "./helpers/testdb";

setDefaultTimeout(60_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => T, what: string, ms = 30_000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v as NonNullable<T>;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

interface Page { win: any; doc: any; calls: { toast: string[]; tabs: string[]; refresh: number }; close(): void }

/** A bare page with what the studios provide to the dialog: both SQL editors, a toast, switchTab, refreshAll and saved queries. */
function openPage(base: string, script: string): Page {
  const dom = new JSDOM(`<!doctype html><body><textarea id="sqlEditor">SELECT * FROM nothing;</textarea><textarea id="sqlEditorTextarea">SELECT * FROM nothing;</textarea></body>`, { url: `${base}/`, runScripts: "outside-only" });
  const win: any = dom.window;
  const calls = { toast: [] as string[], tabs: [] as string[], refresh: 0 };
  win.fetch = (u: string, o?: any) => fetch(u.startsWith("/") ? base + u : u, o);
  win.showToast = (m: string) => calls.toast.push(String(m));
  win.switchTab = (t: string) => calls.tabs.push(t);
  win.refreshAll = async () => { calls.refresh++; };
  win.queryDesignerState = { savedQueries: [] };
  win.eval(script);
  return { win, doc: win.document, calls, close: () => dom.window.close() };
}

const click = (page: Page, el: any) => el.dispatchEvent(new page.win.MouseEvent("click", { bubbles: true, cancelable: true }));
const byId = (page: Page, id: string) => page.doc.getElementById(id);
const statements = (text: string) => text.split(/;\s*\n\s*\n/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean);

async function createSample(page: Page, datasetId: string, target: string) {
  page.win.openSampleDatabases();
  await until(() => page.doc.querySelector(".sdb-item"), "the catalog");
  click(page, page.doc.querySelector(`.sdb-item[data-id="${datasetId}"]`));
  const input = await until(() => byId(page, "sdbTarget"), "the name field");
  input.value = target;
  input.dispatchEvent(new page.win.Event("input", { bubbles: true }));
  click(page, byId(page, "sdbCreate"));
  await until(() => byId(page, "sdbPutQueries"), "the finished state with the example queries panel");
}

interface Rig { name: string; base: string; script: string; cleanup(): Promise<void>; query(sql: string): Promise<any>; names(tag: string): string; dropSample(target: string): Promise<void> }
const rigs: Rig[] = [];

const dir = mkdtempSync(join(tmpdir(), "sdb-ui-"));
{
  const sampleDir = join(dir, "samples");
  const server = startSqliteStudioServer({ port: 0, initialDbPath: ":memory:", sampleDir });
  const base = `http://127.0.0.1:${server.port}`;
  rigs.push({
    name: "SQLite", base, script: SAMPLES_SCRIPT_SQLITE,
    cleanup: async () => { server.stop(true); rmSync(dir, { recursive: true, force: true }); },
    query: async (sql) => (await fetch(`${base}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) })).json(),
    names: (tag) => `ui_${tag}.sqlite`,
    dropSample: async (target) => { rmSync(target, { force: true }); },
  });
}
for (const engine of ["mysql", "postgres"] as const) {
  const testDb = await provisionTestDb(engine);
  if (!testDb) continue;
  const server: any = engine === "mysql" ? startMysqlStudioServer({ port: 0, config: testDb.config } as any) : startPostgresStudioServer({ port: 0, config: testDb.config } as any);
  const base = `http://127.0.0.1:${server.port}`;
  const created: string[] = [];
  const admin: any = new SQL({ adapter: engine, hostname: testDb.config.host, port: testDb.config.port, username: testDb.config.user, password: testDb.config.password, database: engine === "postgres" ? testDb.config.database : undefined, max: 2, allowPublicKeyRetrieval: engine === "mysql" ? true : undefined } as any);
  const stamp = Math.random().toString(16).slice(2, 7);
  rigs.push({
    name: engine === "mysql" ? "MySQL" : "PostgreSQL", base, script: engine === "mysql" ? SAMPLES_SCRIPT_MYSQL : SAMPLES_SCRIPT_POSTGRES,
    cleanup: async () => {
      for (const n of created) await admin.unsafe(engine === "mysql" ? `DROP DATABASE IF EXISTS \`${n}\`` : `DROP SCHEMA IF EXISTS "${n}" CASCADE`).catch(() => {});
      await admin.end?.();
      server.stop(true);
      await testDb.drop();
    },
    query: async (sql) => (await fetch(`${base}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sql }) })).json(),
    names: (tag) => { const n = `sample_ui_${stamp}_${tag}`; created.push(n); return n; },
    dropSample: async (target) => { await admin.unsafe(engine === "mysql" ? `DROP DATABASE IF EXISTS \`${target}\`` : `DROP SCHEMA IF EXISTS "${target}" CASCADE`); },
  });
}

afterAll(async () => { for (const r of rigs) await r.cleanup(); });

describe("example queries are read-only and portable", () => {
  it("every catalog query is a single SELECT / WITH statement for every engine", () => {
    for (const d of DIALECTS) {
      const h = sqlHelpers(d);
      for (const ds of DATASETS) for (const q of ds.queries) expect(isReadOnlySelect(q.sql(h).trim()), `${ds.id}.${q.id} (${d})`).toBe(true);
    }
  });
  it("the guard rejects anything that changes data or runs several statements", () => {
    expect(isReadOnlySelect("SELECT 1")).toBe(true);
    expect(isReadOnlySelect("-- note\nWITH a AS (SELECT 1) SELECT * FROM a;")).toBe(true);
    expect(isReadOnlySelect("DELETE FROM t")).toBe(false);
    expect(isReadOnlySelect("SELECT 1; DROP TABLE t")).toBe(false);
    expect(isReadOnlySelect("WITH x AS (DELETE FROM t RETURNING 1) SELECT * FROM x")).toBe(false);
    expect(isReadOnlySelect("SELECT 'a;b' AS s")).toBe(true);
  });
});

for (const rig of rigs) {
  describe(`Sample databases dialog, ${rig.name}: Example queries`, () => {
    let page: Page;
    let target = "";
    beforeAll(async () => {
      page = openPage(rig.base, rig.script);
      target = rig.names("a");
      await createSample(page, "hospital_ehr", target);
    });
    afterAll(() => page.close());

    it("explains itself in plain words", () => {
      const panel = page.doc.querySelector(".sdb-qpanel");
      expect(panel.textContent).toContain("ready-made queries for this sample to the SQL editor");
      expect(panel.textContent).toContain("only read data (SELECT); nothing is changed");
      expect(byId(page, "sdbPutQueries").textContent).toBe("Put in the SQL editor");
      expect(byId(page, "sdbRunQueries").textContent).toBe("Run it");
      expect(page.doc.body.textContent).not.toContain("Insert example queries");
      const options = [...byId(page, "sdbQuerySelect").querySelectorAll("option")];
      expect(options[0].textContent).toBe("All 8 example queries".replace("8", String(DATASETS.find((d) => d.id === "hospital_ehr")!.queries.length)));
      expect(options.length).toBe(1 + DATASETS.find((d) => d.id === "hospital_ehr")!.queries.length);
      expect(options[1].textContent).toContain(" - ");
    });

    it("Run it runs one chosen query inside the dialog and shows its rows", async () => {
      const select = byId(page, "sdbQuerySelect");
      select.value = "top_dx_by_dept";
      select.dispatchEvent(new page.win.Event("change", { bubbles: true }));
      click(page, byId(page, "sdbRunQueries"));
      await until(() => page.doc.querySelector(".sdb-qtable"), "the result table");
      expect(page.doc.querySelector(".sdb-qpanel").textContent).toMatch(/rows in \d+ ms/);
      expect(byId(page, "sdbQMsg").textContent).toBe("");
    });

    it("Run it with all queries reports each one", async () => {
      const select = byId(page, "sdbQuerySelect");
      select.value = "all";
      select.dispatchEvent(new page.win.Event("change", { bubbles: true }));
      click(page, byId(page, "sdbRunQueries"));
      const lines = await until(() => page.doc.querySelector(".sdb-qlines"), "the list of results");
      const n = DATASETS.find((d) => d.id === "hospital_ehr")!.queries.length;
      expect(lines.children.length).toBe(n);
      expect([...lines.children].every((l: any) => l.textContent.startsWith("OK"))).toBe(true);
    });

    it("Put in the SQL editor fills the editor(s) the studio reads, switches to the sample, and the queries RUN there", async () => {
      const ds = DATASETS.find((d) => d.id === "hospital_ehr")!;
      click(page, byId(page, "sdbPutQueries"));
      await until(() => page.calls.tabs.includes("sql"), "the SQL tab to open");
      expect(page.calls.refresh).toBeGreaterThan(0);
      const a = byId(page, "sdbEditorDummy") ?? page.doc.getElementById("sqlEditor");
      const b = page.doc.getElementById("sqlEditorTextarea");
      expect(a.value).toBe(b.value);
      expect(a.value).not.toContain("nothing");
      const list = statements(a.value);
      expect(list.length).toBe(ds.queries.length);
      expect(a.value).toContain(`-- ${ds.queries[0]!.title}`);
      expect(page.doc.getElementById("sdbOverlay").classList.contains("open")).toBe(false);
      expect(page.win.queryDesignerState.savedQueries.length).toBe(ds.queries.length);
      expect(page.win.queryDesignerState.savedQueries[0].name).toContain(ds.title);
      // the studio itself (now pointed at the sample) must run every inserted statement
      for (const sql of list) {
        const r = await rig.query(sql);
        expect(r.success !== false && !r.error, `${sql.split("\n")[0]} -> ${r.error}`).toBe(true);
      }
    });

    it("a single chosen query goes into the editor on its own", async () => {
      page.win.openSampleDatabases();
      await until(() => page.doc.getElementById("sdbOverlay").classList.contains("open"), "the dialog");
      const select = await until(() => byId(page, "sdbQuerySelect"), "the query list (the finished sample is still shown)");
      for (const id of ["sqlEditor", "sqlEditorTextarea"]) page.doc.getElementById(id).value = "";
      select.value = "polypharmacy";
      select.dispatchEvent(new page.win.Event("change", { bubbles: true }));
      click(page, byId(page, "sdbPutQueries"));
      await until(() => page.doc.getElementById("sqlEditor").value.includes("Patients on 5+ active medications"), "the single query");
      const text = page.doc.getElementById("sqlEditor").value;
      expect(statements(text).length).toBe(1);
      expect((await rig.query(statements(text)[0]!)).success).not.toBe(false);
    });

    it("a problem is shown inside the dialog in plain words, not as a vague toast", async () => {
      const p2 = openPage(rig.base, rig.script);
      const t2 = rig.names("b");
      await createSample(p2, "hospital_ehr", t2);
      await rig.dropSample(p2.win.__sampleDatabases.job.result.target);
      click(p2, byId(p2, "sdbRunQueries"));
      const msg = await until(() => byId(p2, "sdbQMsg")?.textContent, "the error message");
      expect(msg.length).toBeGreaterThan(20);
      expect(msg).toMatch(/no longer exists|not found|could not|does not exist/i);
      expect(byId(p2, "sdbQMsg").getAttribute("role")).toBe("alert");
      expect(p2.calls.toast.some((t) => /error|failed/i.test(t))).toBe(false);
      p2.close();
    });
  });
}

beforeAll(() => {});
