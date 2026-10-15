// Runs under NODE (jsdom needs it), driven by studio_focus.test.ts: Focus mode in the real pages.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { openStudio, wait, sleep } from "./helpers/studio_page.mjs";

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

const BASE = process.env.SF_BASE;
const ENGINE = process.env.SF_ENGINE || "sqlite";
const body = (s) => s.d.body.classList;
const hidden = (s, sel) => { const e = s.q(sel); if (!e) return null; return s.w.getComputedStyle(e).display === "none"; };

describe(`Focus mode on the ${ENGINE} studio (jsdom against the real server)`, () => {
  test("every section header has a labelled Focus button with a tooltip and aria-pressed", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    await wait(() => s.q(".view-tabs .sf-btn"), "the tab bar button");
    const tab = s.q(".view-tabs .sf-btn");
    assert.match(tab.textContent, /Focus/);
    assert.equal(tab.getAttribute("aria-pressed"), "false");
    const tip = tab.title || tab.dataset.tip || "";
    assert.match(tip, /Fill the window/);
    assert.match(tip, /Alt\+Enter|Enter/);
    assert.ok(s.q('.editor-top .sf-btn[data-sf-key="editor"]'), "SQL editor header");
    assert.ok(s.q('aside .sf-btn[data-sf-key="sidebar"]'), "sidebar header");
    assert.ok(s.q("#tabGrid .sf-btn"), "data grid header");
    // every pane has one (a header button or a corner button)
    for (const p of s.qa(".tab-pane")) assert.ok(p.querySelector(".sf-btn"), "a Focus button in " + p.id);
    assert.ok(s.q("#sfExit"), "the Exit button exists");
    s.close();
  });

  test("focusing the data grid hides the header, KPI strip, tab bar, sidebar and editor; Exit restores them; no Fullscreen API", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    const before = { rows: s.qa("#gridBody tr").length, scroll: 0 };
    const scroller = s.q("#gridTableContainer");
    scroller.scrollTop = 40;
    // select a row so the selection can be compared
    const row = s.q("#gridBody tr");
    row.classList.add("selected");
    s.q("#tabGrid .sf-btn").click();
    assert.ok(body(s).contains("sf-on") && body(s).contains("sf-k-pane"));
    assert.equal(s.w.StudioFocus.state.key, "pane:tabGrid");
    for (const sel of ["body > header", ".view-tabs", "aside", ".editor-banner"]) assert.equal(hidden(s, sel), true, sel + " is hidden");
    const kpi = s.q("body > .kpi-row"); if (kpi) assert.equal(s.w.getComputedStyle(kpi).display, "none");
    assert.equal(hidden(s, "#tabGrid"), false, "the grid stays");
    const exit = s.q("#sfExit");
    assert.ok(exit && !s.q(".sf-bar").hidden, "the bar and its Exit button are visible");
    assert.match(s.q("#sfName").textContent, /Focus:/);
    assert.equal(s.q("#tabGrid .sf-btn").getAttribute("aria-pressed"), "true");
    assert.ok(s.d.activeElement === s.q("#tabGrid") || s.q("#tabGrid").contains(s.d.activeElement), "focus moved into the section");
    // grid state survives
    assert.equal(s.qa("#gridBody tr").length, before.rows);
    assert.ok(s.q("#gridBody tr").classList.contains("selected"));
    assert.equal(scroller.scrollTop, 40);
    exit.click();
    assert.equal(body(s).contains("sf-on"), false);
    for (const sel of ["body > header", ".view-tabs", "aside"]) assert.equal(hidden(s, sel), false, sel + " is back");
    assert.equal(s.q("#tabGrid .sf-btn").getAttribute("aria-pressed"), "false");
    assert.equal(scroller.scrollTop, 40);
    s.close();
  });

  test("Alt+Enter toggles focus, never Esc; double-click on a header toggles; the shortcut is listed", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    // The studio's own one-time "go full screen on the first key or click" (outside the File Manager) is not focus mode: let it fire first
    s.key("Shift", {}, s.w);
    await sleep(50);
    const fs0 = s.fullscreen.length;
    let ev = s.key("Enter", { altKey: true }, s.w);
    assert.ok(ev.defaultPrevented);
    assert.ok(body(s).contains("sf-on"));
    // Esc must not leave focus mode (it belongs to menus and dialogs)
    s.key("Escape", {}, s.d.activeElement);
    assert.ok(body(s).contains("sf-on"), "Esc does not exit focus mode");
    s.key("Enter", { altKey: true }, s.w);
    assert.equal(body(s).contains("sf-on"), false);
    // double-click on the tab header
    const tabBtn = s.q(".view-tabs .tab-btn.active");
    tabBtn.dispatchEvent(new s.w.MouseEvent("dblclick", { bubbles: true }));
    assert.ok(body(s).contains("sf-on"), "double-click on the active tab focuses it");
    s.q(".sf-bar .sf-title").dispatchEvent(new s.w.MouseEvent("dblclick", { bubbles: true }));
    assert.equal(body(s).contains("sf-on"), false, "double-click on the bar title leaves");
    // a dialog open: the shortcut does nothing
    s.w.studioConfirm("x?");
    await wait(() => s.q(".sd-dialog"), "a dialog");
    s.key("Enter", { altKey: true }, s.w);
    assert.equal(body(s).contains("sf-on"), false);
    s.key("Escape", {}, s.d.activeElement);
    await sleep(20);
    // the shortcut is in the list
    s.w.StudioShortcuts.show();
    const dlg = await wait(() => s.q('[data-ss-dialog="shortcuts"]'), "the list");
    assert.match(dlg.textContent, /Focus mode/);
    assert.match(dlg.textContent, /Alt/);
    assert.equal(s.fullscreen.length, fs0, "the Fullscreen API was not used by focus mode");
    s.close();
  });

  test("editor: focusing the SQL editor keeps its text; Editor / Both / Results switch; sidebar focus", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    const ed = s.q("#sqlEditor") || s.q("#sqlEditorTextarea");
    ed.value = "SELECT 1 AS unsaved_text";
    s.q('.editor-top .sf-btn[data-sf-key="editor"]').click();
    assert.ok(body(s).contains("sf-k-editor"));
    assert.equal(hidden(s, ".tab-pane.active"), true);
    assert.equal(hidden(s, "aside"), true);
    assert.equal(hidden(s, ".editor-banner"), false);
    assert.equal(ed.value, "SELECT 1 AS unsaved_text");
    const seg = s.q("#sfSeg");
    assert.equal(seg.hidden, false);
    seg.querySelector('[data-m="both"]').click();
    assert.ok(body(s).contains("sf-k-pane") && body(s).contains("sf-m-both"));
    assert.equal(hidden(s, ".editor-banner"), false);
    assert.equal(hidden(s, ".tab-pane.active"), false);
    seg.querySelector('[data-m="results"]').click();
    assert.ok(body(s).contains("sf-m-results"));
    assert.equal(hidden(s, ".editor-banner"), true);
    assert.equal(ed.value, "SELECT 1 AS unsaved_text");
    s.q("#sfExit").click();
    assert.equal(body(s).contains("sf-on"), false);
    // sidebar
    s.q('aside .sf-btn[data-sf-key="sidebar"]').click();
    assert.ok(body(s).contains("sf-k-sidebar"));
    assert.equal(hidden(s, "main"), true);
    assert.equal(hidden(s, "aside"), false);
    s.q("#sfExit").click();
    assert.equal(hidden(s, "main"), false);
    s.close();
  });

  test("the last focus state of each tab is remembered: switching tabs applies it, and a reload restores it", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    s.w.StudioFocus.enter("pane:tabGrid");
    const stored = JSON.parse(s.w.localStorage.getItem("bunrad.focus.v1:" + ENGINE));
    assert.equal(stored.tabs.grid.key, "pane:tabGrid");
    // another tab has no focus state: switching shows it normally
    s.w.switchTab("schema");
    assert.equal(body(s).contains("sf-on"), false, "the schema tab was never focused");
    s.w.StudioFocus.enter("pane:tabSchema");
    s.w.switchTab("grid");
    assert.equal(s.w.StudioFocus.state.key, "pane:tabGrid", "the grid tab is focused again");
    s.w.switchTab("schema");
    assert.equal(s.w.StudioFocus.state.key, "pane:tabSchema");
    s.w.StudioFocus.exit();
    s.w.switchTab("grid");
    assert.equal(s.w.StudioFocus.state.key, "pane:tabGrid");
    const saved = s.w.localStorage.getItem("bunrad.focus.v1:" + ENGINE);
    s.close();
    // a reload starts focused on the grid
    const s2 = await openStudio(BASE, { storage: { ["bunrad.focus.v1:" + ENGINE]: saved } });
    await wait(() => s2.w.StudioFocus && s2.w.StudioFocus.state, "the restored focus", 5000);
    assert.equal(s2.w.StudioFocus.state.key, "pane:tabGrid");
    assert.ok(s2.d.body.classList.contains("sf-on"));
    s2.q("#sfExit").click();
    assert.equal(s2.d.body.classList.contains("sf-on"), false);
    s2.close();
  });

  test("the designer can be focused and the Run shortcut still works there", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    s.w.switchTab("designer");
    await wait(() => s.q("#tabDesigner .sf-btn"), "the designer Focus button");
    let n = 0;
    s.w.runDesignerQuery = () => { n++; };
    s.q("#tabDesigner .sf-btn").click();
    assert.equal(s.w.StudioFocus.state.key, "pane:tabDesigner");
    s.key("Enter", { ctrlKey: true }, s.w);
    assert.equal(n, 1);
    s.q("#sfExit").click();
    s.close();
  });

  test("PostgreSQL console: the editor and the results of the SQL console tab can be focused separately", async (t) => {
    if (ENGINE !== "postgres") return t.skip("PostgreSQL only");
    const s = await openStudio(BASE, { table: "wide" });
    s.w.switchTab("sql");
    await wait(() => s.q('#tabSql .sf-btn[data-sf-mode="results"]') && s.q('#tabSql .sf-btn[data-sf-mode="editor"]'), "both console buttons");
    s.q('#tabSql .sf-btn[data-sf-mode="editor"]').click();
    assert.equal(JSON.stringify(s.w.StudioFocus.state), JSON.stringify({ key: "pane:tabSql", mode: "editor" }));
    assert.equal(hidden(s, ".editor-banner"), true, "the top banner is not part of the console focus");
    assert.equal(hidden(s, "#tabSql .grid-container"), true);
    assert.equal(hidden(s, "#tabSql .editor-section"), false);
    s.q("#sfSeg [data-m=results]").click();
    assert.equal(hidden(s, "#tabSql .editor-section"), true);
    assert.equal(hidden(s, "#tabSql .grid-container"), false);
    s.q("#sfSeg [data-m=both]").click();
    assert.equal(hidden(s, "#tabSql .editor-section"), false);
    assert.equal(hidden(s, "#tabSql .grid-container"), false);
    s.q("#sfExit").click();
    s.close();
  });
});
