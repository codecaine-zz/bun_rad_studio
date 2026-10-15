// Runs under NODE (jsdom needs it), driven by studio_shortcuts.test.ts: the Visual Query Designer Run shortcut.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { openStudio, wait, sleep } from "./helpers/studio_page.mjs";

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

const BASE = process.env.SS_BASE;
const ENGINE = process.env.SS_ENGINE || "sqlite";

function spy(s) {
  const n = { design: 0, sql: 0, editor: 0, exec: 0 };
  s.w.runDesignerQuery = () => { n.design++; };
  s.w.runCustomDesignerSql = () => { n.sql++; };
  s.w.runEditorQuery = () => { n.editor++; };
  // PostgreSQL binds its console run to a const, so it is counted by the request it sends
  return n;
}
const press = (s, key, opts, target) => s.key(key, opts, target);

describe(`Designer Run shortcut on the ${ENGINE} studio (jsdom against the real server)`, () => {
  test("the Run button shows and advertises the shortcut, and is the active-view dispatcher", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    s.w.switchTab("designer");
    const b = await wait(() => s.q("#btnDesignerRun") || s.q(".qbe-btn-run"), "the Run button");
    assert.match(b.textContent, /! Run/);
    assert.match(b.textContent, /Enter/, "the shortcut is printed on the button");
    assert.match(b.getAttribute("title") || b.dataset.tip || "", /Enter or F5/);
    assert.equal(b.getAttribute("aria-keyshortcuts"), "Control+Enter F5");
    const n = spy(s);
    b.click();
    assert.deepEqual([n.design, n.sql], [1, 0]);
    s.w.eval('queryDesignerState.activeView = "sql"');
    b.click();
    assert.deepEqual([n.design, n.sql], [1, 1], "the SQL view runs the SQL as written");
    s.close();
  });

  test("Ctrl/Cmd+Enter and F5 run the designer once, from the window and from inside a designer field; F5 never reloads", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    s.w.switchTab("designer");
    await wait(() => s.q(".qbe-btn-run"), "the designer");
    const n = spy(s);
    let ev = press(s, "Enter", { ctrlKey: true }, s.w);
    assert.equal(n.design, 1); assert.ok(ev.defaultPrevented);
    ev = press(s, "Enter", { metaKey: true }, s.d.body);
    assert.equal(n.design, 2); assert.ok(ev.defaultPrevented);
    ev = press(s, "F5", {}, s.w);
    assert.equal(n.design, 3); assert.ok(ev.defaultPrevented, "F5 default (reload) is prevented");
    // inside an input / select / textarea of the designer
    const field = s.q(".qbe-btn-run").closest("div").parentElement.querySelector("input, select") || s.q("#designerCanvas") || s.d.body;
    const input = s.d.createElement("input");
    (s.q(".qbe-btn-run").parentElement).appendChild(input);
    input.focus();
    ev = press(s, "Enter", { ctrlKey: true }, input);
    assert.equal(n.design, 4, "once, not twice"); assert.ok(ev.defaultPrevented);
    ev = press(s, "F5", {}, input);
    assert.equal(n.design, 5);
    // the SQL view: the textarea's own Ctrl+Enter must not double the run
    s.w.eval('queryDesignerState.activeView = "sql"');
    s.w.renderQueryDesigner();
    const ta = await wait(() => s.q("#designerSqlPreview"), "the designer SQL textarea");
    ta.focus();
    ev = press(s, "Enter", { ctrlKey: true }, ta);
    assert.deepEqual([n.sql, n.design], [1, 5], "the SQL view runs the SQL exactly once");
    ev = press(s, "F5", {}, ta);
    assert.deepEqual([n.sql, n.design], [2, 5]);
    // modifiers that mean something else are left alone
    press(s, "F5", { ctrlKey: true }, s.w);
    ev = press(s, "Enter", {}, s.w);
    assert.equal(ev.defaultPrevented, false);
    assert.equal(n.sql + n.design, 7, "Ctrl+F5 and a bare Enter do not run the designer");
    s.close();
  });

  test("on the other tabs the designer does not run, the console keeps its own run", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    const n = spy(s);
    const consoleRuns = () => s.calls.filter((c) => /\/api\/query$/.test(c.url) && c.body.includes("4242")).length;
    const ed = s.q("#sqlEditor") || s.q("#sqlEditorTextarea");
    ed.value = "SELECT 4242 AS marker";
    // grid tab: no designer run
    press(s, "Enter", { ctrlKey: true }, s.w);
    press(s, "F5", {}, s.w);
    assert.equal(n.design + n.sql, 0, "no designer run outside the designer");
    if (ENGINE === "postgres") {
      await wait(() => consoleRuns() === 1, "the PostgreSQL console run (window handler)");
    } else {
      ed.dispatchEvent(new s.w.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
      assert.equal(n.editor, 1, "the console run still works from the editor");
    }
    // designer tab: only the designer runs
    s.w.switchTab("designer");
    await wait(() => s.q(".qbe-btn-run"), "the designer");
    const before = consoleRuns();
    press(s, "Enter", { ctrlKey: true }, s.w);
    await sleep(100);
    assert.equal(consoleRuns(), before, "the console statement is not sent from the designer");
    assert.equal(n.design, 1);
    assert.equal(n.editor, ENGINE === "postgres" ? 0 : 1);
    // back on the grid the console owns the key again, the designer stays quiet
    s.w.switchTab("grid");
    press(s, "Enter", { ctrlKey: true }, s.w);
    assert.equal(n.design, 1);
    if (ENGINE === "postgres") await wait(() => consoleRuns() === before + 1, "the console handler to be back");
    s.close();
  });

  test("a Keyboard shortcuts button and Mod+/ list the shortcuts; Esc closes only that dialog", async () => {
    const s = await openStudio(BASE);
    const b = s.q("#btnShortcuts");
    assert.ok(b, "a visible Shortcuts button in the header");
    assert.match(b.getAttribute("aria-label"), /Keyboard shortcuts/);
    b.click();
    const dlg = await wait(() => s.q('[data-ss-dialog="shortcuts"]'), "the shortcuts dialog");
    assert.match(dlg.textContent, /Run the query/);
    assert.match(dlg.textContent, /F5/);
    s.key("Escape", {}, s.d.activeElement);
    await wait(() => !s.q('[data-ss-dialog="shortcuts"]'), "Esc to close it");
    const ev = press(s, "/", { ctrlKey: true }, s.w);
    assert.ok(ev.defaultPrevented);
    await wait(() => s.q('[data-ss-dialog="shortcuts"]'), "Ctrl+/ to open it");
    assert.deepEqual(s.native, []);
    s.close();
  });
});
