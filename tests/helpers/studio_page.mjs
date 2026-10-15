// Shared jsdom helper for the studio page tests (runs under NODE, see studio_columns.test.ts for why).
import { JSDOM } from "jsdom";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function wait(cond, what, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = cond(); } catch {}
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await sleep(25);
  }
}

/**
 * Opens a studio page against a running server, lets the start-up macro finish, optionally opens a table.
 * Native dialogs are recorded (they must never be called), fetch calls are recorded, full-screen requests are recorded.
 */
export async function openStudio(base, { table, storage, quiet = true } = {}) {
  const html = await (await fetch(base + "/")).text();
  const calls = [];
  const native = [];
  const fullscreen = [];
  let inflight = 0;
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: base + "/",
    beforeParse(win) {
      win.fetch = async (u, o) => {
        calls.push({ url: String(u), body: o && o.body ? String(o.body) : "" });
        if (/\/api\/export$/.test(String(u))) return new Response(JSON.stringify({ success: true, rowCount: 0, filename: "test", path: "test" }), { headers: { "content-type": "application/json" } });
        inflight++;
        try { return await fetch(new URL(String(u), base).toString(), o); } finally { inflight--; }
      };
      for (const n of ["prompt", "confirm", "alert"]) win[n] = (...a) => { native.push(n + ":" + a[0]); return n === "confirm" ? true : null; };
      win.HTMLElement.prototype.scrollIntoView = () => {};
      win.Element.prototype.requestFullscreen = function () { fullscreen.push(String(new Error("requestFullscreen").stack).split("\n").slice(1, 6).join(" <- ")); return Promise.resolve(); };
      win.HTMLElement.prototype.requestFullscreen = win.Element.prototype.requestFullscreen;
      for (const [k, v] of Object.entries(storage || {})) win.localStorage.setItem(k, v);
    },
  });
  const w = dom.window;
  const d = w.document;
  const s = {
    dom, w, d, calls, native, fullscreen,
    q: (sel) => d.querySelector(sel),
    qa: (sel) => Array.from(d.querySelectorAll(sel)),
    byText: (sel, text) => Array.from(d.querySelectorAll(sel)).find((e) => e.textContent.trim().includes(text)),
    key: (key, opts = {}, target) => { const ev = new w.KeyboardEvent("keydown", Object.assign({ key, bubbles: true, cancelable: true }, opts)); (target || d.activeElement || d.body).dispatchEvent(ev); return ev; },
    idle: async () => { for (let quiet = 0; quiet < 6; ) { await sleep(50); quiet = inflight === 0 ? quiet + 1 : 0; } },
    close: () => {},
  };
  await wait(() => w.StudioCols && w.StudioCols.instances.grid && w.StudioDialogs, "the shared studio scripts");
  try {
    const ok = await wait(() => s.qa("button").find((b) => b.textContent.trim() === "OK"), "the welcome box", 6000);
    ok.click();
    await wait(() => /Macro '[^']*' (finished|failed)/.test(d.body.textContent), "the start-up macro", 20000);
  } catch {}
  if (table) {
    await wait(() => s.qa(".tree-item").some((e) => e.textContent.includes(table)), "the table in the sidebar");
    for (let attempt = 1; ; attempt++) {
      s.qa(".tree-item").find((e) => e.textContent.includes(table)).click();
      try { await wait(() => s.qa("#gridHeaderRow th[data-col]").length > 0, "the grid", 5000); break; } catch (e) { if (attempt >= 3) throw e; }
    }
  }
  await s.idle();
  return s;
}
