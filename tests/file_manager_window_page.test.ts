import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { readWindowPrefs, writeWindowPrefs, WINDOW_FILE } from "../src/features/filemanager/fmWindow";

const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
// Scratch folders live inside the project (cleaned up below), never in the system's temporary folder.
const root = mkdtempSync(join(import.meta.dir, ".fm-window-page-test-"));
const dataDir = join(root, "data");
let server: ReturnType<typeof startFileManagerServer>;
let base = "";
let doc: any;
let win: any;
let ws: any; // windowState.js
let wset: any; // windowSettings.js
let extras: any;
let appState: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => any, what: string, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(15);
  }
  throw new Error(`Timed out waiting for ${what}`);
};
const dialogs = () => [...doc.querySelectorAll(".modal-backdrop")];
const top = (): any => dialogs().at(-1);
const button = (text: string, from: any = doc): any => [...from.querySelectorAll("button")].find((b: any) => b.textContent.trim().startsWith(text));
const toastText = () => doc.querySelector("#toasts")?.textContent ?? "";
const clearAll = () => {
  for (const d of dialogs()) d.remove();
  doc.querySelectorAll("#toasts .toast").forEach((t: any) => t.remove());
};
const state = (over: Record<string, unknown> = {}) => ({ x: 120, y: 80, width: 1280, height: 820, maximized: false, fullscreen: false, screenWidth: 1728, screenHeight: 1117, dpr: 2, ...over });

/** What the window process offers the page, as a stand-in that writes down its calls. */
const calls: Array<[string, ...unknown[]]> = [];
const answers: Record<string, any> = {};
function installDesktop(extra: Record<string, any> = {}) {
  calls.length = 0;
  for (const k of Object.keys(answers)) delete answers[k];
  Object.assign(answers, extra);
  const fn = (name: string, fallback: any) => (...args: unknown[]) => {
    calls.push([name, ...args]);
    const a = answers[name];
    return Promise.resolve(typeof a === "function" ? a(...args) : (a ?? fallback));
  };
  win.fmWindowPoll = fn("poll", null);
  win.fmWindowChanged = fn("changed", { ok: true, saved: false, ignored: false, mode: "fill", modeSwitched: false });
  win.fmWindowSave = fn("save", { ok: true, mode: "remember" });
  win.fmWindowReset = fn("reset", { ok: true, settled: true, mode: "fill" });
  win.fmWindowApply = fn("apply", { ok: true, settled: true, mode: "fill" });
}
function removeDesktop() {
  for (const k of ["fmWindowPoll", "fmWindowChanged", "fmWindowSave", "fmWindowReset", "fmWindowApply"]) delete win[k];
}
const called = (name: string) => calls.filter((c) => c[0] === name);

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({
    terminalAvailable: () => false,
    typeInTerminal: () => false,
    showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false,
  }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { platform: "linux", home: root, dataDir } });
  base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  win = dom.window;
  appState = (await import("../resources/file_manager/ui/state.js")).state;
  appState.platform = "linux";
  ws = await import("../resources/file_manager/ui/windowState.js");
  wset = await import("../resources/file_manager/ui/windowSettings.js");
  extras = await import("../resources/file_manager/ui/extras.js");
  const api = await import("../resources/file_manager/ui/api.js");
  appState.settings = ((await api.call("settings")) as any).settings;
  ws.timing.retryMs = 5;
});

afterAll(() => {
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const d = saved.get(key);
    if (d) Object.defineProperty(g, key, d);
    else delete g[key];
  }
  mock.restore();
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  clearAll();
  removeDesktop();
  rmSync(join(dataDir, WINDOW_FILE), { force: true });
});

/** Timers that only run when told to, so the debouncing can be checked exactly. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void; every?: number }>();
  return {
    setTimeout: (fn: () => void, ms: number) => { const id = nextId++; pending.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id: number) => void pending.delete(id),
    setInterval: (fn: () => void, ms: number) => { const id = nextId++; pending.set(id, { at: now + ms, fn, every: ms }); return id; },
    clearInterval: (id: number) => void pending.delete(id),
    /** Moves time forward, running what is due (in order), and lets promises settle. */
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, t] = due;
        now = t.at;
        if (t.every) t.at += t.every;
        else pending.delete(id);
        t.fn();
        for (let i = 0; i < 6; i++) await Promise.resolve();
      }
      now = end;
    },
    count: () => pending.size,
  };
}

/** A reporter wired to a fake window process whose frame the test controls. */
function reporterFor(frame: { current: any }, answer: (report: any) => any = () => ({ ok: true, ignored: false, modeSwitched: false })) {
  const sent: any[] = [];
  const timers = fakeTimers();
  let polls = 0;
  let switched = 0;
  const visible = { value: true };
  const reporter = ws.createWindowReporter({
    bridge: { poll: async () => { polls++; return frame.current; }, changed: async (r: any) => { sent.push(r); return answer(r); } },
    measure: () => ({ screenWidth: 1728, screenHeight: 1117, dpr: 2, outerWidth: 0, outerHeight: 0, innerWidth: 0, innerHeight: 0, availWidth: 0, availHeight: 0, x: 0, y: 0, fullscreen: false }),
    timers,
    onSwitched: () => void switched++,
    isVisible: () => visible.value,
    win: doc.defaultView,
  });
  return { reporter, sent, timers, polls: () => polls, switched: () => switched, visible };
}
const frame = (over: Record<string, unknown> = {}) => ({ x: 0, y: 33, width: 1728, height: 1005, maximized: true, fullscreen: false, ...over });

describe("watching the window", () => {
  test("opening the window is never reported: the first steady look is the starting point", async () => {
    const f = { current: frame() };
    const r = reporterFor(f);
    r.reporter.start();
    await r.timers.advance(10_000);
    expect(r.sent).toEqual([]);
    expect(r.polls()).toBeGreaterThan(5);
    r.reporter.stop();
  });

  test("a window that was still settling at the first look is not reported either", async () => {
    const f = { current: frame({ maximized: false, width: 1280, height: 820, x: 224, y: 125 }) };
    const r = reporterFor(f);
    r.reporter.start();
    await r.timers.advance(500); // first look: the window is still at its starting size
    f.current = frame(); // it has finished maximising
    await r.timers.advance(5000);
    expect(r.sent).toEqual([]);
    r.reporter.stop();
  });

  test("a real change is reported once, in the shape the app expects, after 500 ms of stillness", async () => {
    const f = { current: frame() };
    const r = reporterFor(f);
    r.reporter.start();
    await r.timers.advance(2000);
    f.current = frame({ x: 300, y: 200, width: 1000, height: 700, maximized: false });
    await r.timers.advance(500); // seen at the next look
    expect(r.sent).toEqual([]); // not yet: it waits for the window to hold still
    await r.timers.advance(1000);
    expect(r.sent).toEqual([{ x: 300, y: 200, width: 1000, height: 700, maximized: false, fullscreen: false, screenWidth: 1728, screenHeight: 1117, dpr: 2 }]);
    await r.timers.advance(20_000); // and not again while nothing changes
    expect(r.sent.length).toBe(1);
    r.reporter.stop();
  });

  test("a window that keeps changing is reported once, with where it ended up", async () => {
    const f = { current: frame() };
    const r = reporterFor(f);
    r.reporter.start();
    await r.timers.advance(2000);
    for (let i = 1; i <= 6; i++) {
      f.current = frame({ maximized: false, width: 1000 + i * 10, x: 10, y: 10 });
      await r.timers.advance(250);
    }
    expect(r.sent).toEqual([]);
    await r.timers.advance(2000);
    expect(r.sent.length).toBe(1);
    expect(r.sent[0].width).toBe(1060);
    r.reporter.stop();
  });

  test("a change that is undone before it was sent is not sent", async () => {
    const f = { current: frame() };
    const r = reporterFor(f);
    r.reporter.start();
    await r.timers.advance(2000);
    const original = f.current;
    f.current = frame({ x: 50, maximized: false });
    await r.timers.advance(500);
    f.current = original;
    await r.timers.advance(5000);
    expect(r.sent).toEqual([]);
    r.reporter.stop();
  });

  test("going back to how it started, after a report, is reported too", async () => {
    const f = { current: frame() };
    const r = reporterFor(f);
    r.reporter.start();
    await r.timers.advance(2000);
    const original = f.current;
    f.current = frame({ x: 50, maximized: false });
    await r.timers.advance(3000);
    f.current = original;
    await r.timers.advance(3000);
    expect(r.sent.length).toBe(2);
    expect(r.sent[1].maximized).toBe(true);
    r.reporter.stop();
  });

  test("no spam: however long the page runs, it sends at most one report per change and keeps at most one timer waiting", async () => {
    const f = { current: frame() };
    const r = reporterFor(f);
    r.reporter.start();
    for (let i = 0; i < 200; i++) {
      if (i % 40 === 20) f.current = frame({ x: i, maximized: false });
      await r.timers.advance(100);
    }
    expect(r.sent.length).toBeLessThanOrEqual(5);
    expect(r.timers.count()).toBeLessThanOrEqual(2);
    r.reporter.stop();
    expect(r.timers.count()).toBe(0);
  });

  test("a report the app ignored (it had just moved the window itself) is sent again later; one it took changes the mode once", async () => {
    const f = { current: frame() };
    let ignore = 2;
    const r = reporterFor(f, () => (ignore-- > 0 ? { ok: true, ignored: true } : { ok: true, ignored: false, modeSwitched: true }));
    r.reporter.start();
    await r.timers.advance(2000);
    f.current = frame({ x: 40, maximized: false });
    await r.timers.advance(10_000);
    expect(r.sent.length).toBe(3);
    expect(r.switched()).toBe(1);
    r.reporter.stop();
  });

  test("when the window process never answers it gives up after a few tries", async () => {
    const f = { current: frame() };
    const r = reporterFor(f, () => null);
    r.reporter.start();
    await r.timers.advance(2000);
    f.current = frame({ x: 40, maximized: false });
    await r.timers.advance(60_000);
    expect(r.sent.length).toBe(5);
    expect(r.timers.count()).toBe(0);
  });

  test("nothing is looked at while the window is hidden", async () => {
    const f = { current: frame() };
    const r = reporterFor(f);
    r.visible.value = false;
    r.reporter.start();
    await r.timers.advance(10_000);
    expect(r.polls()).toBe(0);
    r.visible.value = true;
    await r.timers.advance(1000);
    expect(r.polls()).toBeGreaterThan(0);
    r.reporter.stop();
  });

  test("when the page goes away, a change that was still waiting is sent at once", async () => {
    const f = { current: frame() };
    const r = reporterFor(f);
    r.reporter.start();
    await r.timers.advance(2000);
    f.current = frame({ x: 70, maximized: false });
    await r.timers.advance(500);
    expect(r.sent).toEqual([]);
    doc.defaultView.dispatchEvent(new doc.defaultView.Event("pagehide"));
    await r.timers.advance(0);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(r.sent.length).toBe(1);
    r.reporter.stop();
  });

  test("without the window process's own numbers the page's are used, but only where they make sense", () => {
    const page = { x: 10, y: 20, outerWidth: 1000, outerHeight: 700, innerWidth: 1000, innerHeight: 668, screenWidth: 1920, screenHeight: 1080, availWidth: 1920, availHeight: 1040, dpr: 1, fullscreen: false };
    expect(ws.buildReport(null, page)).toEqual({ x: 10, y: 20, width: 1000, height: 700, maximized: false, fullscreen: false, screenWidth: 1920, screenHeight: 1080, dpr: 1 });
    expect(ws.buildReport(null, { ...page, innerWidth: 1920, innerHeight: 1010 })).toMatchObject({ maximized: true, fullscreen: false });
    expect(ws.buildReport(null, { ...page, fullscreen: true })).toMatchObject({ fullscreen: true, maximized: false });
    expect(ws.buildReport(null, { ...page, outerWidth: 0, outerHeight: 0 })).toBeNull(); // a Mac web view says 0
    expect(ws.buildReport({ x: 1, y: 2, width: 3, height: 4, maximized: true, fullscreen: false }, { ...page, outerWidth: 0 })).toMatchObject({ x: 1, y: 2, width: 3, height: 4, maximized: true, screenWidth: 1920 });
    expect(ws.buildReport({ x: NaN, y: 2, width: 3, height: 4 }, { ...page, outerWidth: 0 })).toBeNull();
  });

  test("in a plain browser there is nothing to watch: no desktop functions, no timers, no calls", () => {
    removeDesktop();
    expect(ws.hasDesktopWindow()).toBe(false);
    expect(ws.wireWindowState()).toBeNull();
    expect(wset.windowSection()).toBeNull();
  });
});

describe("the remembered-window message", () => {
  test("shown once, with the way back, the first time the window process says the mode switched", async () => {
    const f = { current: frame() };
    installDesktop({ poll: () => f.current, changed: () => ({ ok: true, saved: true, ignored: false, mode: "remember", modeSwitched: true }) });
    const old = { ...ws.timing };
    Object.assign(ws.timing, { pollMs: 10, debounceMs: 10 });
    try {
      expect(ws.hasDesktopWindow()).toBe(true);
      const reporter = ws.wireWindowState();
      expect(reporter).toBeTruthy();
      expect(ws.wireWindowState()).toBeNull(); // starting twice does nothing
      await sleep(80);
      expect(toastText()).toBe("");
      f.current = frame({ x: 9, maximized: false });
      await until(() => toastText().includes("remembered"), "the message");
      expect(toastText()).toBe(`${ws.REMEMBERED_TOAST}✕`);
      expect(ws.REMEMBERED_TOAST).toBe("Your window size is remembered. Settings → Window → Reset to default to go back to full screen.");
      clearAll();
      f.current = frame({ x: 19, maximized: false });
      await sleep(150);
      expect(toastText()).toBe(""); // not again
    } finally {
      ws.stopWindowState();
      Object.assign(ws.timing, old);
    }
  });
});

describe("Settings → Window", () => {
  const open = async () => {
    extras.showSettings();
    await until(() => top()?.querySelector(".window-settings [data-window-saved]")?.textContent, "the Window section");
    return top().querySelector(".window-settings");
  };
  const radios = (section: any) => [...section.querySelectorAll("input[type=radio]")];
  const checkedMode = (section: any) => radios(section).find((r: any) => r.checked)?.value;
  const choose = (section: any, value: string) => {
    const r = radios(section).find((x: any) => x.value === value);
    r.checked = true;
    r.dispatchEvent(new win.Event("change", { bubbles: true }));
  };

  test("a browser has no Window section", async () => {
    extras.showSettings();
    await sleep(50);
    expect(top().querySelector(".window-settings")).toBeNull();
    expect(top().textContent).not.toContain("Reset window");
  });

  test("the section: three choices in a labelled group, the default ticked, a plain saved-text, two buttons with explanations", async () => {
    installDesktop();
    const section = await open();
    expect(section.querySelector("h3").textContent).toBe("Window");
    const group = section.querySelector("[role=radiogroup]");
    expect(group.getAttribute("aria-labelledby")).toBe(section.querySelector("h3").id);
    expect([...group.querySelectorAll("label")].map((l: any) => l.textContent)).toEqual(["Fill the screen (default)", "Remember my window", "True full screen"]);
    for (const l of group.querySelectorAll("label")) expect(l.title.length).toBeGreaterThan(20);
    expect(radios(section).map((r: any) => r.value)).toEqual(["fill", "remember", "fullscreen"]);
    expect(new Set(radios(section).map((r: any) => r.name)).size).toBe(1);
    expect(checkedMode(section)).toBe("fill");
    expect(section.querySelector("[data-window-saved]").textContent).toBe("Nothing is saved yet: the window fills the screen.");
    const use = button("Use this window as my preference now", section);
    const reset = button("Reset window to default", section);
    expect(use.title).toContain("Remember");
    expect(reset.title).toContain("fill the screen");
    for (const b of section.querySelectorAll("button")) expect(b.getAttribute("type")).toBe("button");
    expect(section.textContent).not.toMatch(/null|undefined|NaN/);
    expect(section.innerHTML).not.toContain("style=");
  });

  test("what is saved is shown as plain text, and the saved mode is ticked", async () => {
    writeWindowPrefs(dataDir, { mode: "remember", state: state() as any });
    installDesktop();
    const section = await open();
    expect(checkedMode(section)).toBe("remember");
    expect(section.querySelector("[data-window-saved]").textContent).toBe("Saved: 1280 × 820 at 120, 80");
    expect(wset.savedText(state({ maximized: true }))).toBe("Saved: 1280 × 820 at 120, 80 (fills the screen)");
    expect(wset.savedText(state({ fullscreen: true }))).toContain("full screen");
    expect(wset.savedText(state({ x: -1500 }))).toBe("Saved: 1280 × 820 at -1500, 80");
    expect(wset.savedText(null)).toContain("Nothing is saved");
  });

  test("choosing a mode saves it and applies it to the open window", async () => {
    installDesktop();
    const section = await open();
    choose(section, "fullscreen");
    await until(() => called("apply").length === 1, "the window to be told");
    expect(called("apply")[0]).toEqual(["apply", "fullscreen"]);
    expect(readWindowPrefs(dataDir).mode).toBe("fullscreen");
    await until(() => checkedMode(section) === "fullscreen", "the choice to show");
    choose(section, "fill");
    await until(() => called("apply").length === 2, "the second choice");
    expect(called("apply")[1]).toEqual(["apply", "fill"]);
    expect(readWindowPrefs(dataDir).mode).toBe("fill");
    choose(section, "remember");
    await until(() => readWindowPrefs(dataDir).mode === "remember", "remember");
  });

  test("choosing 'Remember my window' with nothing remembered yet remembers the window as it is; with something saved it keeps that", async () => {
    installDesktop();
    let section = await open();
    choose(section, "remember");
    await until(() => called("save").length === 1, "the window to be saved");
    expect(called("save")[0]![1]).toMatchObject({ screenWidth: expect.any(Number), dpr: expect.any(Number) });
    clearAll();
    writeWindowPrefs(dataDir, { mode: "fill", state: state() as any });
    installDesktop();
    section = await open();
    choose(section, "remember");
    await until(() => readWindowPrefs(dataDir).mode === "remember", "the mode");
    await sleep(60);
    expect(called("save").length).toBe(0);
    expect(readWindowPrefs(dataDir).state).toEqual(state());
  });

  test("if true full screen isn't possible the person is told the window fills the screen instead", async () => {
    installDesktop({ apply: () => ({ ok: true, settled: true, mode: "fullscreen", fellBack: true }) });
    const section = await open();
    choose(section, "fullscreen");
    await until(() => toastText().includes("isn't available"), "the message");
    expect(toastText()).toContain("the window fills the screen instead");
  });

  test("Reset: forgets the saved window, resets the open window, says so, and shows the default", async () => {
    writeWindowPrefs(dataDir, { mode: "remember", state: state() as any });
    installDesktop();
    const section = await open();
    button("Reset window to default", section).click();
    await until(() => toastText().includes("Window reset"), "the message");
    expect(toastText()).toContain("Window reset: the File Manager fills the screen.");
    expect(existsSync(join(dataDir, WINDOW_FILE))).toBe(false);
    expect(called("reset").length).toBe(1);
    await until(() => checkedMode(section) === "fill", "the default to show");
    expect(section.querySelector("[data-window-saved]").textContent).toContain("Nothing is saved");
  });

  test("Reset asks again while the window says it isn't there yet (leaving full screen takes a moment)", async () => {
    let n = 0;
    installDesktop({ reset: () => ({ ok: true, settled: false, mode: "fill" }), apply: () => (++n < 3 ? { ok: true, settled: false, mode: "fill" } : { ok: true, settled: true, mode: "fill" }) });
    await wset.resetWindowToDefault();
    expect(called("reset").length).toBe(1);
    expect(called("apply").map((c) => c[1])).toEqual(["fill", "fill", "fill"]);
    expect(toastText()).toContain("Window reset");
  });

  test("Reset gives up after a few tries instead of asking for ever", async () => {
    installDesktop({ reset: () => ({ ok: true, settled: false, mode: "fill" }), apply: () => ({ ok: true, settled: false, mode: "fill" }) });
    await wset.resetWindowToDefault();
    expect(called("apply").length).toBe(ws.timing.retries);
  });

  test("Use this window as my preference now: the window process saves its frame, and the saved text follows", async () => {
    installDesktop({ save: () => { writeWindowPrefs(dataDir, { mode: "remember", state: state({ x: 5, y: 6 }) as any }); return { ok: true, mode: "remember" }; } });
    const section = await open();
    button("Use this window as my preference now", section).click();
    await until(() => toastText().includes("Saved: the window will open like this next time."), "the message");
    expect(called("save").length).toBe(1);
    expect(called("save")[0]![1]).toMatchObject({ screenWidth: expect.any(Number), screenHeight: expect.any(Number), dpr: expect.any(Number) });
    await until(() => section.querySelector("[data-window-saved]").textContent === "Saved: 1280 × 820 at 5, 6", "the saved text");
    expect(checkedMode(section)).toBe("remember");
  });

  test("if the window's size can't be read the person is told and nothing changes", async () => {
    installDesktop({ save: () => ({ ok: false, mode: "fill" }) });
    const section = await open();
    button("Use this window as my preference now", section).click();
    await until(() => toastText().includes("couldn't be read"), "the message");
    expect(existsSync(join(dataDir, WINDOW_FILE))).toBe(false);
  });

  test("the Help dialog offers Reset window only in the desktop app, and it works", async () => {
    extras.showHelp();
    expect(button("Reset window", top())).toBeUndefined();
    clearAll();
    installDesktop();
    writeWindowPrefs(dataDir, { mode: "remember", state: state() as any });
    extras.showHelp();
    const reset = button("Reset window", top());
    expect(reset).toBeTruthy();
    reset.click();
    await until(() => toastText().includes("Window reset"), "the message");
    expect(called("reset").length).toBe(1);
    expect(existsSync(join(dataDir, WINDOW_FILE))).toBe(false);
  });

  test("a server that refuses is reported in plain words, and the window isn't touched", async () => {
    installDesktop();
    const realFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = async () => new Response(JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: "That isn't one of the window choices." } }), { status: 400, headers: { "Content-Type": "application/json" } });
    try {
      await wset.resetWindowToDefault();
    } finally {
      (globalThis as any).fetch = realFetch;
    }
    expect(toastText()).toContain("That isn't one of the window choices.");
    expect(called("reset").length).toBe(0);
  });
});
