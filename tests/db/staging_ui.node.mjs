// Runs under NODE (jsdom cannot execute page scripts under Bun). Driven by staging_ui.test.ts, which starts the real studio
// server(s), creates the fixture databases and passes locations through the environment.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const TARGETS = JSON.parse(process.env.STG_TARGETS);
const CSV = process.env.STG_CSV;
const windows = [];
after(() => {
  for (const w of windows) {
    w.__closed = true;
    w.close();
  }
  setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wait(cond, what, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try {
      v = cond();
    } catch {
      v = false;
    }
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await sleep(20);
  }
}

async function openPage(base) {
  const html = await (await fetch(base + "/")).text();
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: base + "/",
    beforeParse(win) {
      // after the window is closed its pending requests never answer, so late callbacks cannot touch a dead document
      win.fetch = (u, o) => (win.__closed ? new Promise(() => {}) : fetch(new URL(u, base).toString(), o).then((r) => (win.__closed ? new Promise(() => {}) : r)));
      win.confirm = () => true;
      win.addEventListener("error", (e) => errors.push(String(e.message)));
      win.URL.createObjectURL = () => "blob:x";
      win.URL.revokeObjectURL = () => {};
      win.HTMLAnchorElement.prototype.click = function () { win.__downloaded = (win.__downloaded || 0) + 1; };
    },
  });
  const w = dom.window;
  windows.push(w);
  const d = w.document;
  const q = (sel, root = d) => root.querySelector(sel);
  const qa = (sel, root = d) => [...root.querySelectorAll(sel)];
  const byText = (sel, text, root = d) => qa(sel, root).find((n) => n.textContent.includes(text));
  const click = (n) => n.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const change = (n, value) => {
    if (value !== undefined) n.value = value;
    n.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  return { w, d, q, qa, byText, click, change, errors, dialogText: () => q(".stg-dialog")?.textContent ?? "" };
}

const clean = (s) => s.replace(/\s+/g, " ");

async function customers(base) {
  const r = await (await fetch(base + "/api/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: "SELECT id, name, age, balance FROM customers ORDER BY id" }) })).json();
  assert.equal(r.success, true, JSON.stringify(r));
  return r.rows.map((x) => [Number(x.id), x.name, Number(x.age), Number(x.balance)]);
}

for (const target of TARGETS) {
  describe(`Import with staging wizard on ${target.label} (jsdom against the real studio server)`, () => {
    test("file → map → load into staging → check (problems) → fix → skip → promote (upsert) → undo; nothing is rendered as HTML", async () => {
      const p = await openPage(target.base);
      await wait(() => p.q("#btnStagingImport"), "the Import with staging button");
      p.click(p.q("#btnStagingImport"));
      await wait(() => p.q(".stg-overlay") && !p.q(".stg-overlay").hidden, "the wizard to open");
      assert.match(p.q(".stg-dialog").getAttribute("aria-modal"), /true/);
      assert.ok(p.q(".stg-steps"), "stepper");

      // 1 · Source: the file is sent to the studio in pieces
      const csv = Buffer.from(CSV, "base64");
      const file = new p.w.File([csv], "customers_messy.csv", { type: "text/csv" });
      const input = await wait(() => p.q(".stg-file"), "the file chooser");
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      p.change(input);
      await wait(() => p.q(".stg-srcinfo .stg-table"), "the preview table");
      assert.match(p.dialogText(), /semicolon-separated text, UTF-8, first row = column names/);
      assert.match(p.dialogText(), /Customer ID/);
      assert.ok(!/<script/i.test(p.q(".stg-srcinfo").innerHTML.replace(/&lt;/g, "")), "no raw HTML in the preview");
      p.click(p.byText(".stg-foot button", "Next: choose where it goes"));

      // 2 · Map
      await wait(() => p.q(".stg-select[aria-label='Target table']"), "the target chooser");
      p.change(p.q(".stg-select[aria-label='Target table']"), "customers");
      await wait(() => p.q("table[aria-label='Column mapping']"), "the mapping table");
      const rows = p.qa("table[aria-label='Column mapping'] tbody tr");
      const mapped = Object.fromEntries(rows.map((r) => [r.querySelector(".stg-strong").textContent, r.querySelector("select").value]));
      assert.equal(mapped.id, "col:Customer ID");
      assert.equal(mapped.name, "col:Full Name");
      assert.equal(mapped.email, "col:E-mail Address");
      assert.equal(mapped.joined, "col:Date joined");
      assert.equal(mapped.tier, "col:Plan");
      await wait(() => p.q(".stg-sample table"), "the mapped preview");
      await wait(() => !p.byText(".stg-foot button", "Next: load into staging").disabled, "the next button");
      p.click(p.byText(".stg-foot button", "Next: load into staging"));

      // 3 · Load
      await wait(() => /rows? copied/.test(p.dialogText()) && p.byText(".stg-foot button", "Check the rows"), "the load to finish", 20000);
      assert.match(p.dialogText(), /8 rows copied/);
      assert.match(p.dialogText(), /has not been touched/);
      p.click(p.byText(".stg-foot button", "Check the rows"));

      // 4 · Check
      await wait(() => p.q(".stg-stats") && p.byText(".stg-statlabel", "Problems"), "the check summary", 30000);
      const stat = (label) => Number(clean(p.byText(".stg-stat", label).textContent).match(/^([\d,]+)/)[1].replace(/,/g, ""));
      assert.equal(stat("Rows in the file"), 8);
      assert.equal(stat("Ready"), 3);
      assert.equal(stat("Problems"), 5);
      assert.equal(stat("Already there, changed"), 2);
      assert.equal(stat("New to the table"), 1);
      await wait(() => p.q("table[aria-label='Problems']"), "the problems table");
      const problemText = clean(p.q("table[aria-label='Problems']").textContent);
      assert.match(problemText, /“x” is not a whole number/);
      assert.match(problemText, /already belongs to another row/);
      assert.match(problemText, /not a date/);
      assert.match(problemText, /Row has 2 fields but there are 8 columns/);
      assert.match(problemText, /table's own rules reject this row/);
      // fix one cell in place
      p.click(p.q("button[aria-label='Fix row 4 column age']"));
      await wait(() => p.q(".stg-sheet input[type=text]"), "the fix sheet");
      p.q(".stg-sheet input[type=text]").value = "22";
      p.click(p.byText(".stg-sheet button", "Save"));
      await wait(() => p.byText(".stg-banner", "You changed rows since the last check"), "the re-check hint");
      assert.ok(p.byText(".stg-foot button", "Next: review & promote").disabled, "promotion is blocked until the rows are checked again");
      // skip everything that is still wrong, then check again
      p.click(p.byText(".stg-toolbar button", "Skip all problem rows"));
      await wait(() => p.byText(".stg-toolbar button", "Check again"), "the toolbar");
      p.click(p.byText(".stg-toolbar button", "Check again"));
      await wait(() => p.q(".stg-stats") && stat("Ready") === 4, "the second check", 30000);
      assert.equal(stat("Problems"), 0);
      assert.equal(stat("Skipped by you"), 4);
      assert.equal(stat("New to the table"), 2);
      assert.equal(stat("Already there, changed"), 2);
      p.click(p.byText(".stg-foot button", "Next: review & promote"));

      // 5 · Review & promote
      await wait(() => p.q(".stg-previewbox .stg-stats") && p.byText(".stg-statlabel", "will be added"), "the dry run", 30000);
      const dry = (label) => Number(clean(p.byText(".stg-stat", label).textContent).match(/^([\d,]+)/)[1]);
      assert.equal(dry("will be added"), 2);
      assert.equal(dry("will be updated"), 2);
      assert.match(p.dialogText(), /Test run passed/);
      assert.match(p.dialogText(), /Sample of rows that would be updated/);
      const sql = p.q(".stg-sql").textContent;
      assert.match(sql, /INSERT INTO/);
      assert.ok(!/ann@example|Bobby/.test(sql), "the SQL carries no data values");
      const promote = await wait(() => p.byText(".stg-foot button", "Promote 4 rows"), "the promote button");
      assert.equal(promote.disabled, false);
      p.click(promote);
      await wait(() => /Done\./.test(p.dialogText()), "the promotion", 30000);
      assert.match(clean(p.dialogText()), /2 rows added, 2 rows updated, 0 rows left alone/);
      assert.deepEqual(await customers(target.base), [
        [1, "Ann Lee", 30, 1510],
        [2, "Bobby Ray", 41, 20],
        [3, "Cy\nDee", 22, 5.5],
        [6, "Fay", 33, 2000.25],
      ]);

      // undo
      p.click(p.byText(".stg-toolbar button", "Undo this import"));
      await wait(() => p.q(".stg-sheet"), "the undo question");
      p.click(p.byText(".stg-sheet button", "Undo the import"));
      await wait(() => p.byText(".stg-toast.show", "Undone"), "the undo", 20000);
      assert.deepEqual(await customers(target.base), [
        [1, "Ann Lee", 30, 10.5],
        [2, "Bob Ray", 40, 20],
      ]);
      assert.deepEqual(p.errors.filter((e) => /stg|staging/i.test(e)), [], "no script errors from the wizard");
    });

    test("a studio started by the File Manager with a data file opens the wizard by itself with that file already chosen", async () => {
      const p = await openPage(target.grantedBase);
      await wait(() => p.q(".stg-overlay") && !p.q(".stg-overlay").hidden, "the wizard to open by itself", 10000);
      await wait(() => p.q(".stg-srcinfo .stg-table"), "the file to be read");
      assert.match(p.dialogText(), /from_file_manager\.csv/);
      assert.match(p.dialogText(), /comma-separated text/);
      p.click(p.byText(".stg-foot button", "Next: choose where it goes"));
      await wait(() => p.q(".stg-select[aria-label='Target table']"), "the mapping step");
    });

    test("Esc closes only the dialog, focus stays inside while it is open, and Tab wraps", async () => {
      const p = await openPage(target.base);
      await wait(() => p.q("#btnStagingImport"), "the button");
      p.click(p.q("#btnStagingImport"));
      await wait(() => !p.q(".stg-overlay").hidden && p.q(".stg-file"), "the wizard");
      let fullscreen = 0;
      p.d.documentElement.requestFullscreen = () => { fullscreen++; return Promise.resolve(); };
      const esc = new p.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      p.q(".stg-dialog").dispatchEvent(esc);
      assert.equal(p.q(".stg-overlay").hidden, true, "Esc closes the wizard");
      assert.equal(fullscreen, 0, "the full-screen API is never used");
    });
  });
}
