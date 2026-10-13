// Runs under NODE (jsdom cannot execute page scripts under Bun's vm). Driven by workbench_ui.test.ts, which
// starts the workbench server and creates the fixture databases, then passes their locations via the environment.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const BASE = process.env.WB_BASE;
const TOKEN = process.env.WB_TOKEN;
// [{ label, profile, password, prefix }]: one entry per engine under test
const TARGETS = JSON.parse(process.env.WB_TARGETS);
const PROD_DB = process.env.WB_PROD_DB;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(cond, what, ms = 6000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await sleep(10);
  }
}
const api = async (path, body) => (await fetch(BASE + path, { method: "POST", headers: { "x-workbench-token": TOKEN, "content-type": "application/json" }, body: JSON.stringify(body) })).json();

// An independent connection that inspects (and, for the conflict test, changes) the database like "another session".
async function sideChannel(profile, password) {
  const c = await api("/api/v2/connect", { profile: { ...profile, name: profile.name + " (checker)" }, password });
  assert.equal(c.ok, true, JSON.stringify(c));
  const id = c.connection.connectionId;
  return async (sql) => {
    const r = await api("/api/v2/query", { connectionId: id, sql });
    assert.equal(r.ok, true, JSON.stringify(r));
    return r.result.rows;
  };
}

async function openPage() {
  const html = await (await fetch(BASE + "/workbench")).text();
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: BASE + "/workbench",
    beforeParse(win) {
      win.fetch = (u, o) => fetch(new URL(u, BASE).toString(), o);
      win.confirm = () => true;
    },
  });
  const w = dom.window;
  const d = w.document;
  return {
    w,
    d,
    $: (id) => d.getElementById(id),
    q: (sel) => d.querySelector(sel),
    qa: (sel) => [...d.querySelectorAll(sel)],
    click: (n) => n.dispatchEvent(new w.MouseEvent("click", { bubbles: true })),
    dbl: (n) => n.dispatchEvent(new w.MouseEvent("dblclick", { bubbles: true })),
  };
}

for (const target of TARGETS) {
  describe(`workbench UI workflow on ${target.label} (jsdom against the real server)`, () => {
    test("connect → browse → edit with preview → save → conflict → add → delete with confirmation; content is never rendered as HTML", async () => {
      const profile = { ...target.profile, name: `UI ${target.label}`, environment: "test" };
      const saved = await api("/api/v2/profiles/save", { profile, password: target.password });
      assert.equal(saved.ok, true, JSON.stringify(saved));
      const check = await sideChannel(profile, target.password);
      const obj = (name) => `[data-object="${target.prefix}${name}"]`;

      const p = await openPage();
      await wait(() => p.qa("[data-profile]").some((n) => n.textContent.includes(profile.name)), "profile list");
      p.click(p.qa("[data-profile]").find((n) => n.textContent.includes(profile.name)));
      await wait(() => p.$("connBadge").textContent.includes(profile.name), "connection badge");
      assert.ok(p.$("connBadge").className.includes("env-test"));
      assert.ok(p.$("connBadge").textContent.includes(target.label));

      await wait(() => p.q(obj("people")) !== null, "explorer");
      p.click(p.q(obj("people")));
      await wait(() => p.qa("#grid tbody tr").length === 3, "grid rows");
      assert.ok(p.$("dataBanner").textContent.includes("Editable table"));
      assert.ok(p.$("dataBanner").textContent.includes("primary key (id)"));

      // NULL is displayed distinctly and hostile content is plain text
      const nullCell = p.q("#grid tbody tr:nth-child(1) td[data-col=note]");
      assert.equal(nullCell.textContent, "NULL");
      assert.ok(nullCell.className.includes("null"));
      assert.equal(p.qa("#grid img, #grid script").length, 0);
      assert.ok(p.q("#grid tbody tr:nth-child(3) td[data-col=name]").textContent.includes("<img src=x"));
      assert.equal(p.w.__xss, undefined);

      // edit Bob -> Robert, preview, then save
      p.dbl(p.q("#grid tbody tr:nth-child(2) td[data-col=name]"));
      await wait(() => p.$("cellInput") !== null, "cell editor");
      p.$("cellInput").value = "Robert";
      p.click(p.$("cellOk"));
      await wait(() => p.$("pendingInfo").textContent.includes("1 pending"), "pending indicator");
      assert.equal(p.q("#grid tbody tr:nth-child(2)").className, "changed");
      assert.equal((await check("SELECT name FROM people WHERE id = 2"))[0].name, "Bob"); // nothing written yet
      p.click(p.$("btnPreview"));
      await wait(() => p.$("previewText") !== null, "preview");
      assert.ok(p.$("previewText").textContent.includes("UPDATE people SET name"));
      p.click(p.$("previewClose"));
      p.click(p.$("btnSave"));
      await wait(() => p.$("pendingInfo").textContent === "", "save to finish");
      await wait(() => p.q("#grid tbody tr:nth-child(2) td[data-col=name]").textContent === "Robert", "refreshed grid");
      assert.deepEqual((await check("SELECT name FROM people ORDER BY id")).slice(0, 2).map((r) => r.name), ["Ann", "Robert"]);

      // conflict: another session changes Ann; our stale edit must fail without overwriting
      p.dbl(p.q("#grid tbody tr:nth-child(1) td[data-col=name]"));
      await wait(() => p.$("cellInput") !== null, "cell editor 2");
      p.$("cellInput").value = "Anna";
      p.click(p.$("cellOk"));
      await wait(() => p.$("pendingInfo").textContent.includes("1 pending"), "pending indicator 2");
      await check("UPDATE people SET name = 'Annabel' WHERE id = 1");
      p.click(p.$("btnSave"));
      await wait(() => p.$("toast").textContent.includes("changed or deleted"), "conflict message");
      assert.equal((await check("SELECT name FROM people WHERE id = 1"))[0].name, "Annabel");
      p.click(p.$("btnDiscard"));

      // add a row
      p.click(p.$("btnAddRow"));
      await wait(() => p.q("#grid tr.added") !== null, "new row");
      p.dbl(p.q("#grid tr.added td:nth-child(3)"));
      await wait(() => p.$("cellInput") !== null, "cell editor 3");
      p.$("cellInput").value = "Dora";
      p.click(p.$("cellOk"));
      await wait(() => p.$("pendingInfo").textContent.includes("1 pending"), "pending indicator 3");
      p.click(p.$("btnSave"));
      await wait(() => p.q("#grid tr.added") === null && p.qa("#grid tbody tr").length === 4, "inserted row");
      assert.equal((await check("SELECT name FROM people WHERE id = 4"))[0].name, "Dora");

      // delete the selected row: the server demands a confirmation that shows the exact operation
      p.click(p.q("#grid tbody tr:nth-child(4)"));
      p.click(p.$("btnDelRow"));
      await wait(() => p.q("#grid tr.deleted") !== null, "row marked deleted");
      p.click(p.$("btnSave"));
      await wait(() => p.$("confirmOk") !== null, "confirmation dialog");
      assert.ok(p.$("dlgBody").textContent.includes("DELETE FROM people"));
      p.click(p.$("confirmOk"));
      await wait(() => p.qa("#grid tbody tr").length === 3, "row deleted");
      assert.equal(Number((await check("SELECT COUNT(*) AS n FROM people"))[0].n), 3);

      // views are read-only and say why; cells cannot be edited
      p.click(p.q(obj("v_people")));
      await wait(() => p.$("dataBanner").textContent.startsWith("Read-only"), "read-only banner");
      assert.ok(p.$("dataBanner").textContent.includes("Views are read-only"));
      p.dbl(p.q("#grid tbody tr:nth-child(1) td[data-col=name]"));
      await sleep(30);
      assert.equal(p.$("cellInput"), null);

      // structure tab
      p.click(p.q(obj("people")));
      await wait(() => p.qa("#structCols tr").length > 1, "structure");
      assert.ok(p.q("#structCols").textContent.includes("PK1"));

      // SQL tab: result is clearly read-only; destructive statement asks for confirmation and can be cancelled
      p.click(p.$("tabSql"));
      p.$("sqlText").value = "SELECT name FROM people WHERE id = 2";
      p.click(p.$("btnRun"));
      await wait(() => p.$("sqlResults").textContent.includes("Robert"), "sql result");
      assert.ok(p.$("sqlResults").textContent.includes("read-only result"));
      p.$("sqlText").value = "DROP TABLE people";
      p.click(p.$("btnRun"));
      await wait(() => p.$("confirmOk") !== null, "drop confirmation");
      p.click(p.$("confirmCancel"));
      await sleep(50);
      assert.equal(Number((await check("SELECT COUNT(*) AS n FROM people"))[0].n), 3);
      p.w.close();
    });
  });
}

describe("production safeguards in the UI", () => {
  test("production connection shows a red badge and requires typing the connection name", async () => {
    const profile = { name: "PROD-UI", engine: "sqlite", path: PROD_DB, environment: "production" };
    await api("/api/v2/profiles/save", { profile });
    const check = await sideChannel({ ...profile, environment: "development" });
    const p = await openPage();
    await wait(() => p.qa("[data-profile]").some((n) => n.textContent.includes("PROD-UI")), "profile");
    p.click(p.qa("[data-profile]").find((n) => n.textContent.includes("PROD-UI")));
    await wait(() => p.$("connBadge").textContent.includes("PRODUCTION"), "badge");
    assert.ok(p.$("connBadge").className.includes("env-production"));
    p.click(p.$("tabSql"));
    p.$("sqlText").value = "INSERT INTO z (v) VALUES ('b')";
    p.click(p.$("btnRun"));
    await wait(() => p.$("confirmTyped") !== null, "typed confirmation");
    assert.ok(p.$("dlgBody").textContent.includes("PRODUCTION"));
    p.$("confirmTyped").value = "wrong";
    p.click(p.$("confirmOk"));
    await wait(() => p.$("sqlResults").textContent.includes("did not match"), "mismatch message");
    assert.equal(Number((await check("SELECT COUNT(*) AS n FROM z"))[0].n), 1);
    p.w.close();
  });
});
