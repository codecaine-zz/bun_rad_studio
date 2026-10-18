// Runs under NODE (jsdom cannot execute the studio page scripts under Bun's vm). Driven by studio_columns.test.ts, which
// starts a studio server on a database holding one wide table and passes its address through the environment.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// jsdom timers that fire after a window was closed are harmless noise for these tests
process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

const BASE = process.env.SC_BASE;
const TABLE = process.env.SC_TABLE || "wide";
const ENGINE = process.env.SC_ENGINE || "sqlite";
const COLS = JSON.parse(process.env.SC_COLS);
const QUERY = `SELECT ${COLS.slice(0, 5).join(", ")} FROM ${TABLE} ORDER BY ${COLS[0]} LIMIT 5`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(cond, what, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = cond(); } catch {}
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await sleep(25);
  }
}

async function openStudio(storage, expectCols = COLS.length) {
  const html = await (await fetch(BASE + "/")).text();
  const calls = [];
  let inflight = 0;
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: BASE + "/",
    beforeParse(win) {
      win.fetch = async (u, o) => {
        calls.push({ url: String(u), body: o && o.body ? String(o.body) : "" });
        // the export endpoint writes a file into the server's working directory: the test only needs to see the request
        if (/\/api\/export$/.test(String(u))) return new Response(JSON.stringify({ success: true, rowCount: 0, filename: "test", path: "test" }), { headers: { "content-type": "application/json" } });
        inflight++;
        try { return await fetch(new URL(String(u), BASE).toString(), o); } finally { inflight--; }
      };
      win.confirm = () => true;
      win.alert = () => {};
      win.HTMLElement.prototype.scrollIntoView = () => {};
      for (const [k, v] of Object.entries(storage || {})) win.localStorage.setItem(k, v);
    },
  });
  const w = dom.window;
  const d = w.document;
  const s = {
    dom, w, d, calls,
    q: (sel) => d.querySelector(sel),
    qa: (sel) => Array.from(d.querySelectorAll(sel)),
    heads: () => s.qa("#gridHeaderRow th[data-col]").map((t) => t.dataset.col),
    cells: () => s.qa("#gridBody tr:first-child td[data-col]").map((t) => t.dataset.col),
    grid: () => w.StudioCols.instances.grid,
    key: (e, type = "keydown") => { const ev = new w.KeyboardEvent(type, { key: e, bubbles: true, cancelable: true }); (d.activeElement || d.body).dispatchEvent(ev); return ev; },
    // Windows stay open until the process ends (--test-force-exit): closing one with a request still in flight only makes noise
    close: () => {},
  };
  await wait(() => w.StudioCols && w.StudioCols.instances.grid, "the Columns control");
  // The sample AutoExec macro shows a welcome box and then opens another table: let it finish before the test picks its own table
  try {
    const ok = await wait(() => s.qa("button").find((b) => b.textContent.trim() === "OK"), "the welcome box", 6000);
    ok.click();
    await wait(() => /Macro '[^']*' (finished|failed)/.test(d.body.textContent), "the start-up macro", 20000);
  } catch {}
  await wait(() => s.qa(".tree-item").some((e) => e.textContent.includes(TABLE)), "the table in the sidebar");
  for (let attempt = 1; ; attempt++) {
    s.qa(".tree-item").find((e) => e.textContent.includes(TABLE)).click();
    try {
      await wait(() => s.heads().length === expectCols, "the grid to show " + expectCols + " columns", 5000);
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
  // stray refreshes started by the start-up macro must land before the test acts
  for (let quiet = 0; quiet < 6; ) { await sleep(50); quiet = inflight === 0 ? quiet + 1 : 0; }
  return s;
}
const popItems = (s) => s.qa("#scPop-grid .sc-item input");
const tick = () => sleep(60);

describe(`Columns control on the ${ENGINE} studio (jsdom against the real server)`, () => {
  test("the Columns button is in the grid toolbar, labeled, and shows the column count", async () => {
    const s = await openStudio();
    try {
      const b = s.q("#scBtn-grid");
      assert.ok(b, "button exists");
      assert.equal(b.tagName, "BUTTON");
      assert.match(b.textContent, /Columns/);
      assert.equal(b.getAttribute("aria-haspopup"), "dialog");
      assert.equal(b.getAttribute("aria-expanded"), "false");
      assert.match(b.getAttribute("aria-label") || "", new RegExp(`Columns: all ${COLS.length} shown`));
      assert.ok(b.title || b.getAttribute("data-tip"), "has a tooltip");
      assert.equal(b.querySelector(".sc-count").textContent, String(COLS.length));
      assert.ok(b.closest(".grid-toolbar"), "mounted in the grid toolbar");
      assert.equal(s.q("#scStrip-grid").hidden, true, "no strip while nothing is hidden");
      // Every header has a column menu button
      assert.equal(s.qa("#gridHeaderRow th .sc-th-btn").length, COLS.length);
    } finally { s.close(); }
  });

  test("the popover lists every column with its type, hides and shows columns, and updates the badge and strip", async () => {
    const s = await openStudio();
    try {
      s.q("#scBtn-grid").click();
      const pop = s.q("#scPop-grid");
      assert.ok(pop, "popover opens");
      assert.equal(pop.getAttribute("role"), "dialog");
      assert.equal(s.q("#scBtn-grid").getAttribute("aria-expanded"), "true");
      assert.equal(popItems(s).length, COLS.length);
      assert.ok(pop.querySelector(".sc-search"), "search box for a wide table");
      assert.ok(pop.querySelector(".sc-mark.pk"), "primary key mark");
      assert.ok(pop.querySelector(".sc-type").textContent.length > 0, "column type");
      const box = (c) => s.q(`#scPop-grid input[data-col="${c}"]`);
      assert.equal(box("notes").checked, true);
      box("notes").click();
      box("tags").click();
      await tick();
      assert.ok(!s.heads().includes("notes") && !s.heads().includes("tags"), "headers are gone");
      assert.ok(!s.cells().includes("notes") && !s.cells().includes("tags"), "cells are gone");
      assert.equal(s.heads().length, COLS.length - 2);
      assert.equal(s.q("#scBtn-grid .sc-count").textContent, `${COLS.length - 2} of ${COLS.length}`);
      assert.match(s.q("#scBtn-grid").getAttribute("aria-label"), /2 columns hidden/);
      const strip = s.q("#scStrip-grid");
      assert.equal(strip.hidden, false);
      assert.match(strip.textContent, /2 hidden columns/);
      assert.match(strip.textContent, /notes/);
      // the strip's chip shows one column again
      strip.querySelector(".sc-chip").click();
      await tick();
      assert.ok(s.heads().includes("notes"));
      // Show all
      Array.from(s.qa("#scPop-grid .sc-act")).find((b) => b.textContent === "Select all").click();
      await tick();
      assert.deepEqual(s.heads(), COLS);
      assert.equal(s.q("#scStrip-grid").hidden, true);
      assert.equal(s.q("#scBtn-grid .sc-count").textContent, String(COLS.length));
    } finally { s.close(); }
  });

  test("Only keys, search filtering and Hide all keep at least one column visible", async () => {
    const s = await openStudio();
    try {
      s.q("#scBtn-grid").click();
      const act = (label) => Array.from(s.qa("#scPop-grid .sc-act")).find((b) => b.textContent === label);
      act("Only keys").click();
      await tick();
      assert.ok(s.heads().includes(COLS[0]) && s.heads().length < COLS.length, "keys only");
      act("Select all").click();
      await tick();
      act("Clear").click();
      await tick();
      assert.equal(s.heads().length, 1, "one column always stays");
      assert.equal(s.heads()[0], COLS[0], "the primary key is the one that stays");
      const locked = popItems(s).filter((i) => i.checked);
      assert.equal(locked.length, 1);
      assert.equal(locked[0].disabled, true, "the last visible column cannot be unticked");
      // search narrows the list
      const search = s.q("#scPop-grid .sc-search");
      search.value = "post";
      search.dispatchEvent(new s.w.Event("input", { bubbles: true }));
      assert.equal(popItems(s).length, 1);
      act("Reset to default").click();
      await tick();
      assert.deepEqual(s.heads(), COLS);
    } finally { s.close(); }
  });

  test("the choice is remembered across a reload, per table, and Reset to default forgets it", async () => {
    const a = await openStudio();
    let saved;
    try {
      a.grid().hide("notes");
      a.grid().hide("city");
      await tick();
      saved = {};
      for (let i = 0; i < a.w.localStorage.length; i++) { const k = a.w.localStorage.key(i); if (k.startsWith("bunrad.cols.")) saved[k] = a.w.localStorage.getItem(k); }
      assert.equal(Object.keys(saved).length, 1);
      assert.match(Object.keys(saved)[0], new RegExp(`^bunrad\\.cols\\.v1:${ENGINE}\\|.*\\|${TABLE}$`));
    } finally { a.close(); }
    const b = await openStudio(saved, COLS.length - 2);
    try {
      assert.ok(!b.heads().includes("notes") && !b.heads().includes("city"), "still hidden after the reload");
      assert.equal(b.q("#scBtn-grid .sc-count").textContent, `${COLS.length - 2} of ${COLS.length}`);
      assert.equal(b.q("#scStrip-grid").hidden, false);
      b.grid().reset();
      await tick();
      assert.deepEqual(b.heads(), COLS);
      assert.equal(Object.keys(Object.fromEntries(Array.from({ length: b.w.localStorage.length }, (_, i) => [b.w.localStorage.key(i), 1]))).filter((k) => k.startsWith("bunrad.cols.v1:")).length, 0);
    } finally { b.close(); }
  });

  test("the header menu hides a column and sorting still works with columns hidden", async () => {
    const s = await openStudio();
    try {
      const btn = s.q('#gridHeaderRow th[data-col="country"] .sc-th-btn');
      btn.click();
      const menu = s.q(".sc-menu");
      assert.ok(menu, "menu opens");
      const labels = Array.from(menu.querySelectorAll("button")).map((b) => b.textContent.trim());
      assert.ok(labels.includes("Hide column") && labels.some((l) => /^Unhide Fields…/.test(l)));
      Array.from(menu.querySelectorAll("button")).find((b) => /Hide column/.test(b.textContent)).click();
      await tick();
      assert.ok(!s.heads().includes("country"));
      assert.equal(s.q(".sc-menu"), null, "menu closes");
      // right-click opens the same menu
      s.q('#gridHeaderRow th[data-col="email"]').dispatchEvent(new s.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
      assert.ok(s.q(".sc-menu"), "context menu on the header");
      s.key("Escape");
      assert.equal(s.q(".sc-menu"), null);
      if (ENGINE !== "postgres") {
        const before = s.calls.length;
        s.q('#gridHeaderRow th[data-col="sku"]').click();
        await wait(() => s.calls.slice(before).some((c) => /table\/data/.test(c.url) && /"orderBy":"sku"/.test(c.body)), "a sorted request");
        assert.ok(s.heads().includes("sku") && !s.heads().includes("country"), "sort keeps the hidden set");
      }
    } finally { s.close(); }
  });

  test("Escape closes only the popover and focus returns to the Columns button", async () => {
    const s = await openStudio();
    try {
      let leaked = 0;
      s.w.addEventListener("keydown", (e) => { if (e.key === "Escape") leaked++; });
      s.q("#scBtn-grid").click();
      assert.ok(s.q("#scPop-grid"));
      assert.equal(s.d.activeElement.className, "sc-search", "focus moves into the popover");
      s.key("ArrowDown");
      assert.equal(s.d.activeElement.dataset.col, COLS[0], "arrow keys move through the list");
      s.key("Escape");
      assert.equal(s.q("#scPop-grid"), null, "popover closed");
      assert.equal(s.d.activeElement.id, "scBtn-grid", "focus returns to the button");
      assert.equal(leaked, 0, "Escape did not reach other handlers");
      assert.equal(s.d.fullscreenElement || null, null, "no browser full screen");
    } finally { s.close(); }
  });

  test("copy and export follow the visible columns unless the option includes the hidden ones", async () => {
    const s = await openStudio();
    try {
      s.grid().hide("notes");
      s.grid().hide("tags");
      await tick();
      assert.deepEqual(s.grid().exportColumns(COLS), COLS.filter((c) => c !== "notes" && c !== "tags"));
      const rows = [Object.fromEntries(COLS.map((c) => [c, 1]))];
      assert.deepEqual(Object.keys(s.grid().exportRows(rows, COLS)[0]), COLS.filter((c) => c !== "notes" && c !== "tags"));
      assert.match(s.grid().exportLabel(), /hidden columns excluded/);
      // exportResults posts only the visible columns
      s.w.eval("exportResults('csv')");
      await wait(() => s.calls.some((c) => /api\/export$/.test(c.url)), "the export request");
      const body = JSON.parse(s.calls.find((c) => /api\/export$/.test(c.url)).body);
      assert.ok(body.rows.length > 0);
      assert.ok(!("notes" in body.rows[0]) && !("tags" in body.rows[0]) && COLS[0] in body.rows[0], "hidden columns are not exported");
      // the option includes them
      s.q("#scBtn-grid").click();
      s.q('#scPop-grid input[type="checkbox"][id^="scExp-"]').click();
      assert.deepEqual(s.grid().exportColumns(COLS), COLS);
      assert.match(s.q("#btnExportCsv, #btnGridExportCsv").title || s.q("#btnExportCsv, #btnGridExportCsv").getAttribute("data-tip") || "", /columns/);
    } finally { s.close(); }
  });

  test("query results have their own scope, and editing a row still lists every column", async () => {
    const s = await openStudio();
    try {
      for (const id of ["sqlEditor", "sqlEditorTextarea"]) { const e = s.d.getElementById(id); if (e) e.value = QUERY; }
      s.w.eval("runEditorQuery()");
      await wait(() => s.heads().length === 5, "the query result");
      assert.match(s.grid().state().scopeKey, /\|query:grid\|/, JSON.stringify({ heads: s.heads(), src: s.w.crud && s.w.crud.source, title: s.d.getElementById("gridTargetTitle").textContent }));
      s.grid().hide(COLS[3]);
      await tick();
      assert.equal(s.heads().length, 4);
      // table view of the same table is unaffected
      s.qa(".tree-item").find((e) => e.textContent.includes(TABLE)).click();
      await wait(() => s.heads().length === COLS.length, "the table again");
      assert.ok(!/\|query:/.test(s.grid().state().scopeKey));
      if (ENGINE !== "postgres") {
        s.grid().hide("notes");
        await tick();
        s.w.eval("openRowDialog('insert')");
        await wait(() => s.qa(".crud-form .crud-label").length > 0, "the row form");
        assert.equal(s.qa(".crud-form .crud-label").length, COLS.length, "the insert form keeps hidden columns");
      }
    } finally { s.close(); }
  });
});

// ----------------------------------------------------------------------------------------------------------
// datasheet: widths, display names, order, frozen columns, filters, formatting
// ----------------------------------------------------------------------------------------------------------
describe(`Datasheet behavior on the ${ENGINE} studio (jsdom against the real server)`, () => {
  const plain = (a) => JSON.parse(JSON.stringify(a));
  const kd = (s, key, opts, target) => { const ev = new s.w.KeyboardEvent("keydown", Object.assign({ key, bubbles: true, cancelable: true }, opts)); (target || s.d.activeElement || s.d.body).dispatchEvent(ev); return ev; };
  const th = (s, c) => s.q('#gridHeaderRow th[data-col="' + c + '"]');
  const table = (s) => s.q("#gridTableContainer table");
  const ptr = (s, target, type, x) => target.dispatchEvent(new s.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, button: 0 }));
  const drag = (s, col, from, to) => { const rz = th(s, col).querySelector(".sc-rz"); ptr(s, rz, "pointerdown", from); ptr(s, s.w, "pointermove", to); ptr(s, s.w, "pointerup", to); };
  const menuItem = (s, re) => Array.from(s.qa(".sc-menu button")).find((b) => re.test(b.textContent));
  const openMenu = (s, col) => { th(s, col).querySelector(".sc-th-btn").click(); assert.ok(s.q(".sc-menu"), "menu opens"); };
  const dialog = (s) => s.q(".sd-dialog");
  const widths = (s) => s.grid().state().widths;
  const cellCount = (s) => th(s, COLS[0]).parentElement.children.length;

  test("every header has a resize handle; dragging sets a clamped width, keeps header, body, filter bar and totals aligned, and is remembered", async () => {
    const s = await openStudio();
    try {
      assert.ok(th(s, "full_name").querySelector(".sc-rz"), "a resize handle on each header");
      assert.equal(table(s).querySelector("colgroup.sc-cg"), null, "automatic widths until the user resizes");
      s.q("#btnToggleTotals").click();
      s.q("#btnToggleFilterBar, [onclick*='toggleFilterBar'], [onclick*='ilterBar']")?.click();
      await tick();
      drag(s, "full_name", 100, 300);
      await tick();
      const w1 = widths(s).full_name;
      assert.ok(w1 >= 48 && w1 <= 900, "width " + w1);
      assert.ok(table(s).classList.contains("sc-fixed"));
      // every visible column got an explicit width the first time (nothing jumps)
      assert.equal(Object.keys(widths(s)).length, COLS.length);
      // alignment: the colgroup, the header, the body rows, the filter bar and the totals row all span the same number of columns
      const n = cellCount(s);
      assert.equal(table(s).querySelectorAll("colgroup.sc-cg col").length, n);
      for (const tr of table(s).rows) {
        if (tr.classList.contains("sc-row-hidden") || tr.style.display === "none") continue;
        const span = Array.from(tr.cells).reduce((a, c) => a + (c.colSpan || 1), 0);
        if (Array.from(tr.cells).length === 1 && span !== n) continue; // "no records" style message rows
        assert.equal(span, n, "row spans " + span + " of " + n + ": " + tr.outerHTML.slice(0, 80));
      }
      const total = Array.from(table(s).querySelectorAll("colgroup.sc-cg col")).reduce((a, c) => a + parseInt(c.style.width, 10), 0);
      assert.equal(parseInt(table(s).style.width, 10), total, "the table is as wide as its columns");
      // clamped
      drag(s, "sku", 500, -5000); await tick();
      assert.equal(widths(s).sku, 48, "minimum");
      drag(s, "sku", 0, 99999); await tick();
      assert.equal(widths(s).sku, 900, "maximum");
      assert.equal(s.w.document.body.classList.contains("sc-col-resizing"), false);
      assert.equal(s.q(".sc-guide"), null, "the live guide line is gone after the drop");
      // persisted per table, restored after a reload
      const saved = s.w.localStorage.getItem(s.grid().state().scopeKey);
      assert.equal(JSON.parse(saved).widths.sku, 900);
      const b = await openStudio({ [s.grid().state().scopeKey]: saved });
      try {
        assert.equal(b.grid().state().widths.sku, 900);
        assert.ok(table(b).classList.contains("sc-fixed"));
        assert.equal(table(b).querySelectorAll("colgroup.sc-cg col").length, cellCount(b));
      } finally { b.close(); }
    } finally { s.close(); }
  });

  test("a live guide line follows the pointer while dragging", async () => {
    const s = await openStudio();
    try {
      const rz = th(s, "sku").querySelector(".sc-rz");
      ptr(s, rz, "pointerdown", 100);
      assert.ok(s.q(".sc-guide"), "guide line while dragging");
      assert.ok(s.d.body.classList.contains("sc-col-resizing"));
      ptr(s, s.w, "pointerup", 100);
      assert.equal(s.q(".sc-guide"), null);
    } finally { s.close(); }
  });

  test("double-click on the edge fits the column to its content (capped); Field Width dialog, Standard width, Alt+arrows", async () => {
    const s = await openStudio();
    try {
      th(s, "sku").querySelector(".sc-rz").dispatchEvent(new s.w.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await tick();
      const sku = widths(s).sku;
      assert.ok(sku >= 48 && sku < 200, "sku fits its short values: " + sku);
      th(s, "notes").querySelector(".sc-rz").dispatchEvent(new s.w.MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await tick();
      assert.ok(widths(s).notes > sku && widths(s).notes <= 480, "long text is capped: " + widths(s).notes);
      // keyboard: Alt+Right on a focused header
      const before = widths(s).sku;
      th(s, "sku").focus();
      kd(s, "ArrowRight", { altKey: true });
      assert.equal(widths(s).sku, before + 10);
      kd(s, "ArrowLeft", { altKey: true, shiftKey: true }, th(s, "sku"));
      assert.equal(widths(s).sku, before - 30);
      // Field Width dialog
      openMenu(s, "sku");
      menuItem(s, /Field Width/).click();
      const dlg = await wait(() => s.q('.sd-dialog[data-sc-dialog="width"]'), "the width dialog");
      const input = dlg.querySelector("#scWidthInput");
      input.value = "5";
      Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent === "OK").click();
      assert.ok(dlg.querySelector(".sd-error:not([hidden])"), "out of range is refused inside the dialog");
      await tick();
      input.value = "222";
      Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent === "OK").click();
      await tick();
      assert.equal(widths(s).sku, 222);
      openMenu(s, "sku");
      menuItem(s, /Field Width/).click();
      const d2 = await wait(() => s.q('.sd-dialog[data-sc-dialog="width"]'), "the width dialog");
      Array.from(d2.querySelectorAll("button")).find((b) => /Standard/.test(b.textContent)).click();
      await tick();
      assert.equal(widths(s).sku, 140, "standard width");
      // Fit all / Reset widths from the header menu
      openMenu(s, "sku");
      menuItem(s, /Fit all columns/).click();
      await tick();
      assert.equal(Object.keys(widths(s)).length, COLS.length);
      openMenu(s, "sku");
      menuItem(s, /Reset widths/).click();
      await tick();
      assert.deepEqual(plain(widths(s)), {});
      assert.equal(table(s).querySelector("colgroup.sc-cg"), null);
      assert.equal(s.w.localStorage.getItem(s.grid().state().scopeKey), null, "nothing left to remember");
    } finally { s.close(); }
  });

  test("Rename Field is a display name only: header, tooltip, dialogs, export rule; SQL and sorting keep the real name", async () => {
    const s = await openStudio();
    try {
      openMenu(s, "full_name");
      menuItem(s, /Rename Field/).click();
      const dlg = await wait(() => dialog(s), "the rename dialog");
      const input = dlg.querySelector("input");
      input.value = "Customer name";
      input.dispatchEvent(new s.w.Event("input", { bubbles: true }));
      kd(s, "Enter", {}, input);
      await tick();
      const h = th(s, "full_name");
      assert.match(h.textContent, /^Customer name/);
      assert.equal(h.dataset.col, "full_name", "the real name stays in data-col");
      assert.match(h.getAttribute("title"), /full_name/, "the tooltip shows the real name");
      assert.ok(h.classList.contains("sc-aliased"), "a subtle indicator");
      assert.equal(s.cells().includes("full_name"), true, "cells still use the real name");
      assert.equal(s.grid().state().alias.full_name, "Customer name");
      // Hide / Unhide dialog shows alias and real name
      s.q("#scBtn-grid").click();
      const row = s.q('#scPop-grid input[data-col="full_name"]').closest(".sc-item");
      assert.match(row.textContent, /Customer name/);
      assert.match(row.textContent, /full_name/);
      kd(s, "Escape");
      // export: real names by default, aliases when the option is on
      const rows = [Object.fromEntries(COLS.map((c) => [c, 1]))];
      assert.ok("full_name" in s.grid().exportRows(rows, COLS)[0] && !("Customer name" in s.grid().exportRows(rows, COLS)[0]));
      s.q("#scBtn-grid").click();
      s.q('#scPop-grid input[id^="scAlias-"]').click();
      const ex = s.grid().exportRows(rows, COLS)[0];
      assert.ok("Customer name" in ex && !("full_name" in ex), "aliases become the header when the option is ticked");
      assert.equal(Object.keys(ex).length, COLS.length);
      kd(s, "Escape");
      // SQL always real: sorting by the renamed column sends the real name (PostgreSQL's grid has no header sort)
      if (ENGINE !== "postgres") {
        s.calls.length = 0;
        th(s, "full_name").click();
        await wait(() => s.calls.some((c) => /\/api\/table\/data/.test(c.url)), "a data request");
        const sent = s.calls.filter((c) => /\/api\/table\/data/.test(c.url)).map((c) => c.url + " " + c.body).join("\n");
        assert.ok(/full_name/.test(sent) && !/Customer name|Customer%20name/.test(sent), "the request uses the real name: " + sent.slice(0, 200));
      }
      // persists across a reload, clearable
      const key = s.grid().state().scopeKey;
      const saved = s.w.localStorage.getItem(key);
      assert.equal(JSON.parse(saved).alias.full_name, "Customer name");
      const b = await openStudio({ [key]: saved });
      try {
        assert.match(th(b, "full_name").textContent, /^Customer name/);
        openMenu(b, "full_name");
        menuItem(b, /Use real name/).click();
        await tick();
        assert.match(th(b, "full_name").textContent, /^full_name/);
        assert.deepEqual(plain(b.grid().state().alias), {});
      } finally { b.close(); }
    } finally { s.close(); }
  });

  test("drag a header to reorder (drop indicator), Move left/right from the menu; body cells follow; remembered", async () => {
    const s = await openStudio();
    try {
      const dt = { data: {}, setData(k, v) { this.data[k] = v; }, getData(k) { return this.data[k]; }, effectAllowed: "", dropEffect: "" };
      const fire = (el, type, x) => { const ev = new s.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x }); ev.dataTransfer = dt; el.dispatchEvent(ev); return ev; };
      assert.equal(th(s, "sku").draggable, true);
      fire(th(s, "sku"), "dragstart", 0);
      fire(th(s, "country"), "dragover", 0);
      assert.ok(th(s, "country").classList.contains("sc-drop-before"), "a drop indicator");
      fire(th(s, "country"), "drop", 0);
      await tick();
      const heads = s.heads();
      assert.ok(heads.indexOf("sku") < heads.indexOf("country") && heads.indexOf("sku") > heads.indexOf("email"), heads.join());
      assert.equal(s.cells().join(), heads.join(), "body cells follow the header order");
      // menu: Move left
      const pos = s.heads().indexOf("balance");
      openMenu(s, "balance");
      menuItem(s, /Move left/).click();
      await tick();
      assert.equal(s.heads().indexOf("balance"), pos - 1);
      assert.equal(s.cells().join(), s.heads().join());
      openMenu(s, "balance");
      menuItem(s, /Move right/).click();
      await tick();
      assert.equal(s.heads().indexOf("balance"), pos);
      // export follows the grid order
      assert.deepEqual(plain(s.grid().exportColumns(COLS)), plain(s.grid().state().visible));
      // remembered
      const key = s.grid().state().scopeKey;
      const saved = s.w.localStorage.getItem(key);
      const order = s.heads().join();
      const b = await openStudio({ [key]: saved });
      try { assert.equal(b.heads().join(), order); assert.equal(b.cells().join(), b.heads().join()); } finally { b.close(); }
      // reset layout puts the order back and keeps nothing else
      openMenu(s, "balance");
      menuItem(s, /Reset layout/).click();
      await tick();
      assert.equal(s.heads().join(), COLS.join());
    } finally { s.close(); }
  });

  test("Freeze columns up to here makes sticky left columns (header and body); Unfreeze all releases them; remembered", async () => {
    const s = await openStudio();
    try {
      openMenu(s, "sku");
      menuItem(s, /Freeze columns up to here/).click();
      await tick();
      const frozenHeads = s.qa("#gridHeaderRow th.sc-frozen");
      const lead = s.qa("#gridHeaderRow th:not([data-col])").length;
      assert.equal(frozenHeads.length, lead + 2, "lead columns + id + sku are frozen");
      assert.ok(frozenHeads.every((h) => h.style.left !== ""), "each frozen header has a left offset");
      const firstRow = Array.from(s.q("#gridBody tr").cells);
      assert.equal(firstRow.filter((c) => c.classList.contains("sc-frozen")).length, lead + 2, "body cells are frozen too");
      assert.equal(s.qa(".sc-frozen-last").length > 0, true, "the last frozen column carries the shadow edge");
      assert.equal(s.grid().state().freeze, 2);
      const key = s.grid().state().scopeKey;
      const saved = s.w.localStorage.getItem(key);
      const b = await openStudio({ [key]: saved });
      try { assert.equal(b.qa("#gridHeaderRow th.sc-frozen").length, lead + 2); } finally { b.close(); }
      openMenu(s, "sku");
      menuItem(s, /Unfreeze all/).click();
      await tick();
      assert.equal(s.qa(".sc-frozen").length, 0);
      assert.equal(s.grid().state().freeze, 0);
    } finally { s.close(); }
  });

  test("column filter dialog: conditions and a values checklist filter the page's rows, with a strip and Clear all filters", async () => {
    const s = await openStudio();
    try {
      const visibleRows = () => s.qa("#gridBody tr").filter((r) => !r.classList.contains("sc-row-hidden")).length;
      const total = visibleRows();
      assert.ok(total >= 10);
      openMenu(s, "qty");
      menuItem(s, /^Filter/).click();
      const dlg = await wait(() => s.q('.sd-dialog[data-sc-dialog="filter"]'), "the filter dialog");
      assert.ok(dlg.querySelector("#scFilterSearch"), "a search box for the values");
      assert.ok(dlg.querySelectorAll(".sc-fl-row").length >= 10, "distinct values are listed");
      const op = dlg.querySelector("#scFilterOp");
      op.value = "gt";
      dlg.querySelector("#scFilterVal").value = "10";
      Array.from(dlg.querySelectorAll("button")).find((b) => b.textContent === "Apply").click();
      await tick();
      assert.equal(visibleRows(), total - 10, "greater than 10 keeps the last rows");
      assert.ok(th(s, "qty").classList.contains("sc-filtered"), "the header is marked");
      assert.match(s.q("#scStrip-grid").textContent, /1 filter: \d+ of \d+ rows on this page/);
      // a value checklist on another column
      s.grid().ds.clearFilters();
      await tick();
      assert.equal(visibleRows(), total);
      openMenu(s, "sku");
      menuItem(s, /^Filter/).click();
      const d2 = await wait(() => s.q('.sd-dialog[data-sc-dialog="filter"]'), "the filter dialog");
      const first = d2.querySelector(".sc-fl-row input");
      first.click();
      Array.from(d2.querySelectorAll("button")).find((b) => b.textContent === "Apply").click();
      await tick();
      assert.equal(visibleRows(), 1, "one value selected");
      // is empty (NULL)
      s.grid().ds.setFilter("email", { op: "isnull", val: "", val2: "", set: null });
      s.grid().ds.setFilter("sku", null);
      await tick();
      assert.ok(visibleRows() < total && visibleRows() > 0, "NULL emails: " + visibleRows());
      // Clear all filters from the header menu
      openMenu(s, "qty");
      menuItem(s, /Clear all filters/).click();
      await tick();
      assert.equal(visibleRows(), total);
      assert.equal(s.q("#scStrip-grid").hidden, true);
    } finally { s.close(); }
  });

  test("columns can be selected (Ctrl/Shift+click) and hidden together; row height, font size and zebra are formatting options", async () => {
    const s = await openStudio();
    try {
      const click = (c, o) => th(s, c).dispatchEvent(new s.w.MouseEvent("click", Object.assign({ bubbles: true, cancelable: true }, o)));
      click("sku", { ctrlKey: true });
      assert.ok(th(s, "sku").classList.contains("sc-colsel"));
      assert.ok(s.q('#gridBody td[data-col="sku"]').classList.contains("sc-colsel"), "cells are highlighted too");
      click("country", { shiftKey: true });
      assert.deepEqual(plain(s.grid().ds.selection()), ["sku", "full_name", "email", "country"]);
      openMenu(s, "email");
      assert.ok(menuItem(s, /Hide Fields \(4 selected\)/), "Hide Fields acts on the selection");
      menuItem(s, /Hide Fields/).click();
      await tick();
      assert.deepEqual(s.heads().filter((c) => ["sku", "full_name", "email", "country"].includes(c)), []);
      s.grid().showAll();
      await tick();
      // formatting
      s.grid().ds.setFormat({ rowH: "compact", font: 14, zebra: false });
      assert.equal(table(s).getAttribute("data-sc-row"), "compact");
      assert.equal(table(s).style.fontSize, "14px");
      assert.ok(table(s).classList.contains("sc-nozebra"));
      const key = s.grid().state().scopeKey;
      assert.deepEqual(JSON.parse(s.w.localStorage.getItem(key)).fmt, { rowH: "compact", zebra: false, font: 14 });
      s.grid().ds.resetLayout();
      await tick();
      assert.equal(table(s).getAttribute("data-sc-row"), null);
      assert.equal(s.w.localStorage.getItem(key), null);
    } finally { s.close(); }
  });

  test("hide, rename, freeze and resize work together: hidden columns keep their widths and a re-render keeps everything", async () => {
    const s = await openStudio();
    try {
      drag(s, "sku", 100, 220); await tick();
      s.grid().ds.setAlias("sku", "Item"); await tick();
      s.grid().hide("email"); await tick();
      s.grid().ds.freezeUpTo("sku"); await tick();
      // sorting re-renders the grid: the layout must survive it
      th(s, "balance").click();
      await wait(() => s.calls.some((c) => /\/api\//.test(c.url)), "a request");
      await s.idle?.();
      await wait(() => th(s, "sku") && /^Item/.test(th(s, "sku").textContent), "the alias after the re-render");
      assert.ok(table(s).classList.contains("sc-fixed"));
      assert.equal(table(s).querySelectorAll("colgroup.sc-cg col").length, cellCount(s));
      assert.ok(th(s, "sku").classList.contains("sc-frozen"));
      assert.ok(!s.heads().includes("email"));
      s.grid().show("email"); await tick();
      assert.ok(widths(s).email, "a column that comes back has a width");
      assert.equal(table(s).querySelectorAll("colgroup.sc-cg col").length, cellCount(s));
    } finally { s.close(); }
  });
});
