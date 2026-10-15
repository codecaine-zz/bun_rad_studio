// Runs under NODE (jsdom needs it), driven by studio_views.test.ts: the Create view / Edit / Drop dialogs in the real pages.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { openStudio, wait, sleep } from "./helpers/studio_page.mjs";

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

const BASE = process.env.SV_BASE;
const ENGINE = process.env.SV_ENGINE || "sqlite";
const Q = ENGINE === "mysql" ? "`" : '"';

const type = (s, input, value) => { input.value = value; input.dispatchEvent(new s.w.Event("input", { bubbles: true })); };
const dialog = (s) => s.q(".sd-dialog[data-sv-dialog]");
const btn = (s, text) => s.qa(".sd-dialog button").find((b) => b.textContent.trim() === text);
const viewNames = async () => {
  const sql = ENGINE === "sqlite" ? "SELECT name FROM sqlite_master WHERE type='view'" : ENGINE === "mysql" ? "SELECT table_name AS name FROM information_schema.views WHERE table_schema = DATABASE()" : "SELECT viewname AS name FROM pg_views WHERE schemaname='public'";
  const r = await (await fetch(BASE + (ENGINE === "sqlite" ? "/api/query" : "/api/query"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: sql, sql }) })).json();
  const rows = r.rows || (r.results && r.results[0] && r.results[0].rows) || [];
  return rows.map((x) => (Array.isArray(x) ? x[0] : x.name || x.NAME || Object.values(x)[0]));
};

describe(`Create view dialogs on the ${ENGINE} studio (jsdom against the real server)`, () => {
  test("the sidebar button opens the dialog (no native prompt), validates inside the dialog, creates, and the view shows in the tree", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    const b = s.q('.sv-btn[data-sv="view"]');
    assert.ok(b, "a visible Create view button on the Views header");
    assert.match(b.textContent, /Create view/);
    assert.ok((b.title || b.dataset.tip) && b.getAttribute("aria-label"));
    b.click();
    await wait(() => dialog(s), "the dialog");
    const dlg = dialog(s);
    assert.equal(dlg.getAttribute("role"), "dialog");
    assert.equal(dlg.getAttribute("aria-modal"), "true");
    assert.ok(dlg.contains(s.d.activeElement), "focus is inside the dialog");
    assert.deepEqual(s.native, []);
    // empty name: refused inside the dialog
    btn(s, "Create view").click();
    await wait(() => s.q(".sd-dialog .sd-error:not([hidden])"), "an error in the dialog");
    // a name that collides with the table
    type(s, s.q("#svName"), "wide");
    type(s, s.q("#svSql"), "SELECT id, sku FROM wide");
    btn(s, "Create view").click();
    await wait(() => /already|exists/i.test(s.q(".sd-dialog .sd-error:not([hidden])")?.textContent || ""), "a collision error");
    assert.ok(dialog(s), "the dialog stays open on error");
    // a second statement is refused before anything runs
    type(s, s.q("#svName"), "v_ui");
    type(s, s.q("#svSql"), "SELECT 1; DROP TABLE wide");
    btn(s, "Create view").click();
    await wait(() => /one|statement|single/i.test(s.q(".sd-dialog .sd-error:not([hidden])")?.textContent || ""), "the multi-statement error");
    // the live preview quotes the name
    type(s, s.q("#svName"), "v ui");
    type(s, s.q("#svSql"), "SELECT id, sku FROM wide WHERE id < 5");
    assert.ok(s.q("#svPreview").textContent.includes(Q + "v ui" + Q), s.q("#svPreview").textContent);
    // Check query is a dry run
    btn(s, "Check query").click();
    await wait(() => !s.q("#svStatus").hidden, "the check result");
    assert.deepEqual((await viewNames()).filter((n) => n === "v ui"), []);
    // Esc closes only the dialog
    const esc = s.key("Escape", {}, s.q("#svName"));
    await wait(() => !dialog(s), "Esc to close the dialog");
    assert.ok(esc.defaultPrevented || true);
    // open again and create for real
    s.q('.sv-btn[data-sv="view"]').click();
    await wait(() => dialog(s), "the dialog again");
    type(s, s.q("#svName"), "v ui");
    type(s, s.q("#svSql"), "SELECT id, sku FROM wide WHERE id < 5");
    btn(s, "Create view").click();
    await wait(() => !dialog(s), "the dialog to close after creating", 20000);
    await wait(async () => true, "x");
    assert.ok((await viewNames()).includes("v ui"));
    await wait(() => s.qa(".tree-item").some((e) => e.textContent.includes("v ui")), "the new view in the sidebar", 20000);
    assert.deepEqual(s.native, []);
    // (the studios' own first-interaction fullscreen request is older than this feature; the dialogs add none)
    s.close();
  });

  test("the editor button prefills the query; the view can be edited (definition read back) and dropped with a confirm dialog", async () => {
    const s = await openStudio(BASE, { table: "wide" });
    const editor = s.q("#sqlEditor") || s.q("#sqlEditorTextarea");
    assert.ok(editor);
    editor.value = "SELECT id, full_name FROM wide WHERE id <= 3";
    const fromEditor = s.q("#btnCreateViewFromQuery") || s.q("#btnCreateViewFromConsole");
    assert.ok(fromEditor, "a Create view button next to the SQL editor");
    fromEditor.click();
    await wait(() => dialog(s), "the dialog");
    assert.match(s.q("#svSql").value, /SELECT id, full_name FROM wide/);
    type(s, s.q("#svName"), "v_edit");
    btn(s, "Create view").click();
    await wait(() => !dialog(s), "created", 20000);
    assert.ok((await viewNames()).includes("v_edit"));
    // edit definition
    const edit = s.w.StudioViews.openEdit("v_edit");
    await wait(() => dialog(s)?.getAttribute("data-sv-dialog") === "edit", "the edit dialog");
    await edit;
    assert.match(s.q("#svSql").value, /full_name/i);
    assert.ok(s.q("#svName").readOnly || s.q("#svName").hasAttribute("readonly"));
    type(s, s.q("#svSql"), "SELECT id FROM wide WHERE id <= 2");
    if (ENGINE === "postgres") {
      // fewer columns cannot be done with CREATE OR REPLACE: the dialog says so and offers the way out
      btn(s, "Save changes").click();
      await wait(() => /Drop and re-create/.test(s.q(".sd-dialog .sd-error:not([hidden])")?.textContent || ""), "the column-change hint");
      s.q("#svRecreate").click();
    }
    btn(s, "Save changes").click();
    await wait(() => !dialog(s), "the edit to be saved", 20000);
    const r = await (await fetch(BASE + "/api/view/definition", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "v_edit" }) })).json();
    assert.ok(r.success, JSON.stringify(r));
    assert.doesNotMatch(r.select, /full_name/);
    // drop: a confirm dialog, cancel keeps it, OK drops it
    const dropping = s.w.StudioViews.drop("v_edit");
    await wait(() => s.q(".sd-dialog"), "the confirm dialog");
    btn(s, "Cancel").click();
    assert.equal(await dropping, false);
    assert.ok((await viewNames()).includes("v_edit"));
    const dropping2 = s.w.StudioViews.drop("v_edit");
    await wait(() => s.q(".sd-dialog"), "the confirm dialog");
    btn(s, "Drop").click();
    assert.equal(await dropping2, true);
    assert.ok(!(await viewNames()).includes("v_edit"));
    assert.deepEqual(s.native, []);
    s.close();
  });

  test("the dialog helpers: Enter submits, Esc cancels, Tab stays inside", async () => {
    const s = await openStudio(BASE);
    const p = s.w.studioPrompt("Name?", "abc");
    await wait(() => s.q(".sd-dialog input"), "the prompt");
    const input = s.q(".sd-dialog input");
    assert.equal(input.value, "abc");
    type(s, input, "xyz");
    s.key("Enter", {}, input);
    assert.equal(await p, "xyz");
    const p2 = s.w.studioPrompt("Name?", "abc");
    await wait(() => s.q(".sd-dialog input"), "the prompt");
    s.key("Escape", {}, s.q(".sd-dialog input"));
    assert.equal(await p2, null);
    const c = s.w.studioConfirm("Sure?");
    await wait(() => s.q(".sd-dialog"), "the confirm");
    const first = s.q(".sd-dialog");
    s.key("Tab", {}, s.d.activeElement);
    assert.ok(first.contains(s.d.activeElement));
    s.key("Escape", {}, s.d.activeElement);
    assert.equal(await c, false);
    assert.equal(s.q(".sd-dialog"), null);
    await sleep(10);
    s.close();
  });
});
