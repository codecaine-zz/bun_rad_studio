import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { makeRig, RIGS, type Rig } from "../helpers/staging";
import { fileSource } from "../../src/db/staging/source";
import { analyzeSource } from "../../src/db/staging/reader";
import { autoMap } from "../../src/db/staging/mapping";
import { LoadCancelled, loadIntoStaging } from "../../src/db/staging/staging";
import { validateStaging, type ValidationSummary } from "../../src/db/staging/validate";
import { executePromote, previewPromote, testDatabaseRules, undoBatch } from "../../src/db/staging/promote";
import { getBatch, listBatches } from "../../src/db/staging/ledger";
import { dropStaging, fixCell, forgetBatch, listProblems, listStagedRows, rejectsCsv, setSkipped, stagingArea, transformColumn } from "../../src/db/staging/review";
import { resetLimits, setLimits, StagingError } from "../../src/db/staging/limits";
import { newTableTarget, sanitizeNewTable, suggestNewTable } from "../../src/db/staging/newtable";
import type { ImportPlan, PromoteMode } from "../../src/db/staging/types";

const tag = () => Math.random().toString(36).slice(2, 8);

const MESSY =
  "Customer ID;Full Name;E-mail Address;Age;Balance;Date joined;Active?;Plan\r\n" +
  '1;Ann Lee;ann@x.com;30;"1.510,00";01/01/2020;yes;free\r\n' +
  "2;Bobby Ray;bob@x.com;41;20,00;02/02/2021;no;pro\r\n" +
  '3;"Cy\nDee";cy@x.com;x;5,5;31/12/2022;y;team\r\n' +
  "4;Di Fox;ann@x.com;22;5,5;31/12/2022;1;team\r\n" +
  "5;Ed Mo;ed@x.com;200;1,5;2022-12-31;y;free\r\n" +
  '6;Fay;fay@x.com;33;"2.000,25";15/03/2023;N;pro\r\n' +
  "7;Gus;gus@x.com;29;7;not a date;yes;gold\r\n" +
  "8;short\r\n" +
  "6;Fay again;fay2@x.com;34;1;16/03/2023;no;free\r\n";

for (const name of RIGS) {
  const enabled = name === "sqlite" || (name === "mysql" ? process.env.TEST_MYSQL_URL : process.env.TEST_PG_URL);
  (enabled ? describe : describe.skip)(`staging import engine on ${name}`, () => {
    let rig: Rig;
    const T = name === "postgres" ? "true" : "1";
    const F = name === "postgres" ? "false" : "0";
    beforeAll(async () => {
      rig = (await makeRig(name))!;
    });
    afterAll(async () => {
      resetLimits();
      await rig?.close();
    });

    const reset = async () => {
      await rig.sql("DELETE FROM orders");
      await rig.sql("DELETE FROM customers");
      await rig.sql(`INSERT INTO customers (id, name, email, age, balance, joined, active, tier) VALUES (1,'Ann','ann@x.com',30,10.50,'2020-01-01',${T},'free'), (2,'Bob','bob@x.com',40,20,'2021-02-02',${F},'pro')`);
    };
    const customers = async () => (await rig.sql("SELECT id, name, email, age, balance, joined, active, tier FROM customers ORDER BY id")).map((r) => [Number(r.id), r.name, r.email, Number(r.age), Number(r.balance), String(r.joined).slice(0, 10), r.active === true || Number(r.active) === 1, r.tier]);

    type Staged = Awaited<ReturnType<typeof stage>>;
    async function stage(csv: string | Uint8Array, o: { table?: string; key?: string[]; userRules?: ImportPlan["userRules"]; fileName?: string; mutate?: (p: ImportPlan) => void; signal?: AbortSignal; onProgress?: (p: { rows: number }) => void } = {}) {
      const table = o.table ?? "customers";
      const file = rig.write(`in-${tag()}.csv`, csv);
      const src = fileSource(file, o.fileName);
      const a = await analyzeSource(src);
      const target = await rig.db.describe(table);
      const am = autoMap(a.columns, target);
      const plan: ImportPlan = { target: table, createTable: false, rules: am.rules, keyColumns: o.key ?? target.primaryKey, userRules: o.userRules ?? [] };
      o.mutate?.(plan);
      const res = await loadIntoStaging({ db: rig.db, src, settings: a.settings, sourceColumns: a.columns.map((c) => c.name), plan, fileName: o.fileName ?? "in.csv", signal: o.signal, onProgress: o.onProgress });
      return { a, target, plan, res, dataColumns: res.dataColumns };
    }
    const check = (s: Staged): Promise<ValidationSummary> => validateStaging({ db: rig.db, batch: s.res.batch, target: s.target, dataColumns: s.dataColumns, plan: s.plan });
    const popts = async (s: Staged, mode: PromoteMode, extra: object = {}) => ({ db: rig.db, batch: (await getBatch(rig.db, s.res.batch.batchId))!, target: s.target, dataColumns: s.dataColumns, plan: s.plan, mode, ...extra });
    const stagingRows = async (s: Staged) => (await rig.sql(`SELECT _stg_status AS st, _stg_match AS m, COUNT(*) AS c FROM ${name === "postgres" ? '"public".' : ""}${name === "mysql" ? "`" : '"'}${s.res.stagingTable}${name === "mysql" ? "`" : '"'} GROUP BY 1, 2`)).map((r) => `${r.st}/${r.m ?? "-"}=${r.c}`).sort();

    it("loads a messy file into a staging table, classifies every row, and never touches the target", async () => {
      await reset();
      const before = await customers();
      const s = await stage(MESSY, { fileName: "mess.csv" });
      expect(s.res.rowsLoaded).toBe(9);
      expect(s.res.stagingTable).toMatch(/^stg_customers_\d{8}_\d{4}(_\d+)?$/);
      expect(s.res.problemRows).toBe(1);
      expect(await customers()).toEqual(before);
      const meta = (await rig.sql(`SELECT _stg_source_file AS f, _stg_row_number AS n, _stg_batch_id AS b, _stg_status AS st FROM ${name === "postgres" ? '"public".' : ""}${name === "mysql" ? "`" : '"'}${s.res.stagingTable}${name === "mysql" ? "`" : '"'} ORDER BY _stg_row_id LIMIT 1`))[0]!;
      expect(meta.f).toBe("mess.csv");
      expect(Number(meta.n)).toBe(2);
      expect(meta.b).toBe(s.res.batch.batchId);
      const sum = await check(s);
      expect(sum).toMatchObject({ total: 9, valid: 4, invalid: 4, duplicate: 1, newRows: 2, changed: 2, same: 0, blocking: [] });
      const lines = (await listProblems(rig.db, s.res.batch.batchId, { limit: 100 })).lines.map((l) => `${l.rowNumber}:${l.column}:${l.code}`);
      expect(lines).toContain("4:age:not_integer");
      expect(lines).toContain("5:email:unique_target");
      expect(lines).toContain("8:joined:bad_date");
      expect(lines).toContain("9:null:damaged_row");
      expect(lines).toContain("10:id:dup_file");
      expect(await customers()).toEqual(before);
    });

    it("dry run counts equal the real counts, and a rehearsal leaves the table untouched", async () => {
      await reset();
      const s = await stage(MESSY);
      await check(s);
      // the database's own CHECK rule rejects the 200-year-old customer: found in advance, set aside
      const summary = await testDatabaseRules({ db: rig.db, batch: s.res.batch, target: s.target, dataColumns: s.dataColumns, plan: s.plan }, await check(s));
      expect(summary.invalid).toBe(5);
      expect(summary.valid).toBe(3);
      const lines = (await listProblems(rig.db, s.res.batch.batchId, { limit: 100 })).lines;
      expect(lines.find((l) => l.code === "db_rule")?.rowNumber).toBe(6);
      for (const mode of ["insert-new", "upsert", "update-only"] as PromoteMode[]) {
        const before = await customers();
        const p = await previewPromote(await popts(s, mode));
        const r = await executePromote({ ...(await popts(s, mode)), rehearse: true });
        expect(await customers()).toEqual(before);
        expect(r.counts.inserted).toBe(p.counts.insert);
        expect(r.counts.updated).toBe(p.counts.update);
        expect((await getBatch(rig.db, s.res.batch.batchId))!.status).toBe("checked");
      }
      const p = await previewPromote(await popts(s, "upsert"));
      expect(p.counts).toMatchObject({ insert: 1, update: 2, invalid: 5, duplicate: 1 });
      expect(p.sql.join(" ")).not.toMatch(/ann@x|Fay|Bobby/);
      expect(p.sample.updates.map((u) => u.key)).toEqual(["id = 1", "id = 2"]);
      const real = await executePromote(await popts(s, "upsert"));
      expect(real.counts.inserted).toBe(p.counts.insert);
      expect(real.counts.updated).toBe(p.counts.update);
      expect(await customers()).toEqual([
        [1, "Ann Lee", "ann@x.com", 30, 1510, "2020-01-01", true, "free"],
        [2, "Bobby Ray", "bob@x.com", 41, 20, "2021-02-02", false, "pro"],
        [6, "Fay", "fay@x.com", 33, 2000.25, "2023-03-15", false, "pro"],
      ]);
      const after = (await rig.sql(`SELECT _stg_status AS st FROM ${name === "postgres" ? '"public".' : ""}${name === "mysql" ? "`" : '"'}${s.res.stagingTable}${name === "mysql" ? "`" : '"'} WHERE _stg_status = 'promoted'`)).length;
      expect(after).toBe(3);
      const b = (await getBatch(rig.db, s.res.batch.batchId))!;
      expect(b).toMatchObject({ status: "promoted", mode: "upsert", rowsInserted: 1, rowsUpdated: 2, undoable: true });
      await expect(executePromote(await popts(s, "upsert"))).rejects.toThrow(/already promoted/);
    });

    it("a failed promotion rolls back completely and leaves the table and the staged rows as they were", async () => {
      await reset();
      const s = await stage(MESSY);
      await check(s); // no database-rule test here: the 200-year-old customer reaches the database
      const before = await customers();
      await expect(executePromote(await popts(s, "upsert"))).rejects.toThrow(/refused|constraint|check/i);
      expect(await customers()).toEqual(before);
      const b = (await getBatch(rig.db, s.res.batch.batchId))!;
      expect(b.status).not.toBe("promoted");
      expect(await stagingRows(s)).toContain("valid/new=2");
      expect(await rig.sql("SELECT COUNT(*) AS c FROM _import_batch_changes WHERE batch_id = '" + s.res.batch.batchId + "'")).toEqual([{ c: name === "postgres" ? "0" : 0 }]);
    });

    it("every promote mode does what it says", async () => {
      const csv = "id,name,email,age\n1,Ann Changed,ann@x.com,31\n2,Bob,bob@x.com,40\n3,Cy,cy@x.com,22\n4,Di,di@x.com,23\n";
      for (const [mode, expected] of [
        ["insert-new", [[1, "Ann", 30], [2, "Bob", 40], [3, "Cy", 22], [4, "Di", 23]]],
        ["upsert", [[1, "Ann Changed", 31], [2, "Bob", 40], [3, "Cy", 22], [4, "Di", 23]]],
        ["update-only", [[1, "Ann Changed", 31], [2, "Bob", 40]]],
        ["append", [[1, "Ann", 30], [2, "Bob", 40], [3, "Cy", 22], [4, "Di", 23]]],
      ] as [PromoteMode, (string | number)[][]][]) {
        await reset();
        const s = await stage(csv, { key: mode === "append" ? [] : ["id"] });
        const sum = await check(s);
        // without a key every clash counts as a problem and is left out (that is what "skip repeats" means)
        expect(sum.invalid).toBe(mode === "append" ? 2 : 0);
        const p = await previewPromote(await popts(s, mode));
        const r = await executePromote(await popts(s, mode));
        expect(r.counts.inserted).toBe(p.counts.insert);
        expect(r.counts.updated).toBe(p.counts.update);
        const got = (await customers()).map((c) => [c[0], c[1], c[3]]);
        expect(got).toEqual(expected);
      }
    });

    it("insert-all stops with a plain message when a row clashes, and changes nothing", async () => {
      await reset();
      const s = await stage("id,name,email,age\n2,Bob again,bob2@x.com,41\n9,New,new@x.com,20\n");
      await check(s);
      const p = await previewPromote(await popts(s, "insert-all"));
      expect(p.warnings.join(" ")).toMatch(/already exist/);
      const before = await customers();
      await expect(executePromote(await popts(s, "insert-all"))).rejects.toThrow(/unique|duplicate|exists|constraint/i);
      expect(await customers()).toEqual(before);
    });

    it("undo restores exactly what the import changed, and refuses (changing nothing) when a row was touched since", async () => {
      await reset();
      const s = await stage("id,name,email,age\n1,Ann New Name,ann@x.com,31\n3,Cy,cy@x.com,22\n4,Di,di@x.com,23\n");
      await check(s);
      const original = await customers();
      const r = await executePromote(await popts(s, "upsert"));
      expect(r.counts).toMatchObject({ inserted: 2, updated: 1 });
      expect((await customers()).length).toBe(4);
      // somebody edits a row the import added
      await rig.sql("UPDATE customers SET name = 'Edited later' WHERE id = 3");
      const mid = await customers();
      const refused = await undoBatch(rig.db, s.target, s.res.batch.batchId);
      expect(refused.ok).toBe(false);
      expect(refused.conflicts.map((c) => c.key)).toContain("id = 3");
      expect(await customers()).toEqual(mid);
      expect((await getBatch(rig.db, s.res.batch.batchId))!.status).toBe("promoted");
      await rig.sql("UPDATE customers SET name = 'Cy' WHERE id = 3");
      const done = await undoBatch(rig.db, s.target, s.res.batch.batchId);
      expect(done).toMatchObject({ ok: true });
      expect(await customers()).toEqual(original);
      const b = (await getBatch(rig.db, s.res.batch.batchId))!;
      expect(b.status).toBe("undone");
      await expect(undoBatch(rig.db, s.target, s.res.batch.batchId)).rejects.toThrow(/already undone/);
      expect(await rig.sql("SELECT COUNT(*) AS c FROM _import_batch_changes WHERE batch_id = '" + s.res.batch.batchId + "'")).toEqual([{ c: name === "postgres" ? "0" : 0 }]);
    });

    it("checks foreign keys, and loads a table whose key the database numbers itself", async () => {
      await reset();
      const csv = "customer_id,total,note\n1,10.50,ok\n2,20,fine\n99,5,orphan\n";
      const s = await stage(csv, { table: "orders", key: [] });
      const sum = await check(s);
      expect(sum).toMatchObject({ valid: 2, invalid: 1 });
      const bad = (await listProblems(rig.db, s.res.batch.batchId, {})).lines[0]!;
      expect(bad).toMatchObject({ code: "fk_missing", column: "customer_id", value: "99" });
      expect(bad.message).toMatch(/customers/);
      const p = await previewPromote(await popts(s, "append"));
      expect(p.undo.available).toBe(name !== "mysql");
      const r = await executePromote(await popts(s, "append"));
      expect(r.counts.inserted).toBe(2);
      expect((await rig.sql("SELECT COUNT(*) AS c FROM orders"))[0]!.c).toEqual(name === "postgres" ? "2" : 2);
      if (name !== "mysql") {
        expect((await undoBatch(rig.db, await rig.db.describe("orders"), s.res.batch.batchId)).ok).toBe(true);
        expect((await rig.sql("SELECT COUNT(*) AS c FROM orders"))[0]!.c).toEqual(name === "postgres" ? "0" : 0);
      } else {
        expect((await getBatch(rig.db, s.res.batch.batchId))!.undoNote).toMatch(/cannot be undone/);
      }
    });

    it("your own checks (regex, range, list, length, not empty) mark rows as problems", async () => {
      await reset();
      const s = await stage("id,name,email,age\n10,A,a@x.com,20\n11,Bo,not-an-email,20\n12,,c@x.com,20\n13,Dee,d@x.com,130\n14,Eve,e@x.com,20\n", {
        userRules: [
          { column: "email", kind: "regex", value: "^[^@\\s]+@[^@\\s]+$", message: "Needs an @" },
          { column: "age", kind: "max", value: "120" },
          { column: "name", kind: "length", value: "2-10" },
        ],
      });
      await check(s);
      const lines = (await listProblems(rig.db, s.res.batch.batchId, {})).lines.map((l) => `${l.rowNumber}:${l.column}:${l.message}`);
      expect(lines.join("|")).toMatch(/3:email:Needs an @/);
      expect(lines.join("|")).toMatch(/5:age:Must be at most 120/);
      expect(lines.join("|")).toMatch(/2:name:Length must be 2 to 10/);
    });

    it("fix in place, skip rows, clean a column, and download the rejects", async () => {
      await reset();
      const s = await stage("id,name,email,age\n20,  padded  ,p@x.com,20\n21,Zed,z@x.com,abc\n22,Yan,y@x.com,xyz\n");
      let sum = await check(s);
      expect(sum.invalid).toBe(2);
      const csv: string[] = [];
      for await (const part of rejectsCsv(rig.db, s.res.batch.batchId)) csv.push(part);
      const text = csv.join("");
      expect(text.split("\r\n")[0]).toBe("row_number,status,id,name,email,age,problems");
      expect(text).toContain("abc");
      expect(text).toContain("is not a whole number");
      const rows = await listStagedRows(rig.db, s.res.batch.batchId, { status: "invalid" });
      await fixCell(rig.db, s.res.batch.batchId, rows.rows[0]!.rowId, "age", "21");
      await setSkipped(rig.db, s.res.batch.batchId, { rowIds: [rows.rows[1]!.rowId], skip: true });
      const changed = await transformColumn(rig.db, s.res.batch.batchId, "name", { t: "trim" });
      expect(changed).toBe(1);
      sum = await check(s);
      expect(sum).toMatchObject({ valid: 2, invalid: 0, skipped: 1 });
      await setSkipped(rig.db, s.res.batch.batchId, { skip: false });
      sum = await check(s);
      expect(sum.invalid).toBe(1);
      const r = await executePromote(await popts(s, "insert-new"));
      expect(r.counts.inserted).toBe(2);
      expect((await rig.sql("SELECT name FROM customers WHERE id = 20"))[0]!.name).toBe("padded");
    });

    it("the staging area lists imports, drops staging tables on request only, and keeps the record", async () => {
      await reset();
      const s = await stage("id,name,email,age\n30,Q,q@x.com,20\n");
      await check(s);
      const area = await stagingArea(rig.db);
      const entry = area.entries.find((e) => e.batch.batchId === s.res.batch.batchId)!;
      expect(entry).toMatchObject({ rows: 1, stale: false });
      expect(entry.batch.stagingTable).toBe(s.res.stagingTable);
      await dropStaging(rig.db, s.res.batch.batchId);
      expect((await rig.db.tables()).includes(s.res.stagingTable)).toBe(false);
      expect((await getBatch(rig.db, s.res.batch.batchId))!.status).toBe("dropped");
      await expect(listStagedRows(rig.db, s.res.batch.batchId, {})).rejects.toThrow(/dropped/);
      await forgetBatch(rig.db, s.res.batch.batchId);
      expect((await listBatches(rig.db)).some((b) => b.batchId === s.res.batch.batchId)).toBe(false);
    });

    it("cancelling a load leaves no staging table behind", async () => {
      const rows = Array.from({ length: 4000 }, (_, i) => `${100 + i},N${i},n${i}@x.com,20`).join("\n");
      const ac = new AbortController();
      const before = (await rig.db.tables()).filter((t) => /^stg_customers_\d{8}_\d{4}/.test(t)).length;
      await expect(stage("id,name,email,age\n" + rows, { signal: ac.signal, onProgress: () => ac.abort() })).rejects.toBeInstanceOf(LoadCancelled);
      expect((await rig.db.tables()).filter((t) => /^stg_customers_\d{8}_\d{4}/.test(t)).length).toBe(before);
    });

    it("hard limits stop a load with a plain message and keep nothing", async () => {
      const before = (await rig.db.tables()).filter((t) => /^stg_customers_\d{8}_\d{4}/.test(t)).length;
      try {
        setLimits({ maxRows: 3 });
        await expect(stage("id,name,email,age\n1,a,a@x.com,1\n2,b,b@x.com,2\n3,c,c@x.com,3\n4,d,d@x.com,4\n")).rejects.toThrow(/more than 3 rows/);
        setLimits({ maxFileBytes: 20 });
        await expect(stage("id,name,email,age\n1,a,a@x.com,1\n")).rejects.toThrow(/bigger than/);
        resetLimits();
        setLimits({ maxRecordChars: 50 });
        await expect(stage('id,name,email,age\n1,"' + "x".repeat(200) + '",a@x.com,1\n')).rejects.toThrow(/One row is bigger/);
      } finally {
        resetLimits();
      }
      expect((await rig.db.tables()).filter((t) => /^stg_customers_\d{8}_\d{4}/.test(t)).length).toBe(before);
    });

    it("hostile column names, values and file names are data, never SQL", async () => {
      await reset();
      const evil = `x"); DROP TABLE customers; --`;
      const s = await stage(`id,name,email,age,${evil}\n77,"'); DELETE FROM customers; --",e@x.com,20,1\n78,Robert'); DROP TABLE orders;--,r@x.com,21,2\n`, { fileName: `o'brien"; DROP TABLE customers; --.csv` });
      const sum = await check(s);
      expect(sum.invalid).toBe(0);
      const r = await executePromote(await popts(s, "insert-new"));
      expect(r.counts.inserted).toBe(2);
      expect((await rig.sql("SELECT name FROM customers WHERE id = 77"))[0]!.name).toBe(`'); DELETE FROM customers; --`);
      expect((await customers()).length).toBe(4);
      expect(await rig.db.tables()).toContain("orders");
      const src = (await rig.sql(`SELECT _stg_source_file AS f FROM ${name === "postgres" ? '"public".' : ""}${name === "mysql" ? "`" : '"'}${s.res.stagingTable}${name === "mysql" ? "`" : '"'} LIMIT 1`))[0]!.f;
      expect(src).toBe(`o'brien"; DROP TABLE customers; --.csv`);
      // an injection through the target table name is refused: it must be a real table in the catalog
      await expect(rig.db.describe(`customers"; DROP TABLE customers; --`)).rejects.toThrow(/no table called/);
      // a hostile column in a new table is renamed to a safe identifier
      const sug = suggestNewTable((await analyzeSource(fileSource(rig.write("e.csv", `a b,${evil},select\n1,2,3\n`)))).columns);
      for (const c of sug.spec.columns) expect(c.name).toMatch(/^[a-z][a-z0-9_]*$/);
    });

    it("creates a new table from the data, loads it, and undo takes it away again", async () => {
      const csv = "Item Name,Qty,Price,Shipped,Day\nWidget,3,\"1,234.50\",yes,2024-03-01\nGadget,10,5.25,no,2024-03-02\n";
      const file = rig.write(`new-${tag()}.csv`, csv);
      const src = fileSource(file);
      const a = await analyzeSource(src);
      const sug = suggestNewTable(a.columns);
      const tname = `imp_${tag()}`;
      const spec = sanitizeNewTable({ ...sug.spec, autoId: true });
      const plan: ImportPlan = { target: tname, createTable: true, rules: sug.rules, keyColumns: [], userRules: [], newTable: { columns: spec.columns, autoId: true } as never };
      const built = newTableTarget(rig.db, tname, spec, []);
      const res = await loadIntoStaging({ db: rig.db, src, settings: a.settings, sourceColumns: a.columns.map((c) => c.name), plan, fileName: "new.csv" });
      const base = { db: rig.db, batch: res.batch, target: built.target, dataColumns: res.dataColumns, plan };
      const sum = await validateStaging(base);
      expect(sum).toMatchObject({ valid: 2, invalid: 0 });
      expect((await rig.db.tables()).includes(tname)).toBe(false);
      const pv = await previewPromote({ ...base, mode: "append" });
      expect(pv.counts.insert).toBe(2);
      const r = await executePromote({ ...base, batch: (await getBatch(rig.db, res.batch.batchId))!, mode: "append" });
      expect(r.counts.inserted).toBe(2);
      const q = name === "mysql" ? "`" : '"';
      const rows = await rig.sql(`SELECT * FROM ${q}${tname}${q} ORDER BY id`);
      expect(rows.length).toBe(2);
      expect(Number(rows[0]!.price)).toBe(1234.5);
      const real = await rig.db.describe(tname);
      const u = await undoBatch(rig.db, real, res.batch.batchId);
      expect(u).toMatchObject({ ok: true, droppedTable: true });
      expect((await rig.db.tables()).includes(tname)).toBe(false);
    });


    (name === "sqlite" ? it : it.skip)("loads a large file into staging with bounded memory and checks it set-based", async () => {
      await reset();
      const lines = ["id,name,email,age"];
      const total = 400_000;
      for (let i = 0; i < total; i++) lines.push(`${1000 + i},Name ${i},user${i}@example.com,${20 + (i % 60)}`);
      const text = lines.join("\n");
      const start = process.memoryUsage().rss;
      let peak = start;
      const s = await stage(text, { onProgress: () => (peak = Math.max(peak, process.memoryUsage().rss)) });
      expect(s.res.rowsLoaded).toBe(total);
      const sum = await check(s);
      peak = Math.max(peak, process.memoryUsage().rss);
      expect(sum).toMatchObject({ total, valid: total, invalid: 0, newRows: total });
      expect(peak - start).toBeLessThan(400 * 1024 * 1024);
      const r = await executePromote(await popts(s, "insert-new"));
      expect(r.counts.inserted).toBe(total);
      expect((await rig.sql("SELECT COUNT(*) AS c FROM customers"))[0]!.c).toBe(total + 2);
      const u = await undoBatch(rig.db, s.target, s.res.batch.batchId);
      expect(u.ok).toBe(true);
      expect((await rig.sql("SELECT COUNT(*) AS c FROM customers"))[0]!.c).toBe(2);
    }, 120_000);

    it("requires a key for matching modes and says so in plain words", async () => {
      await reset();
      const s = await stage("id,name,email,age\n1,A,a@x.com,20\n", { key: [] });
      await check(s);
      await expect(previewPromote(await popts(s, "upsert"))).rejects.toThrow(/key column/);
      await expect(executePromote(await popts(s, "insert-new"))).rejects.toThrow(/key column/);
    });

    it("blocks (explains) when a required column is not mapped", async () => {
      await reset();
      const s = await stage("email,age\nq@x.com,20\n", { key: [] });
      const sum = await check(s);
      expect(sum.blocking.join(" ")).toMatch(/“name” is required/);
    });
  });
}
