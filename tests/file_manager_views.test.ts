import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { JSDOM } from "jsdom";
import { createContext } from "../src/features/filemanager/fmCore";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, updateSettings } from "../src/features/filemanager/fmSettings";

// Part 1: the saved settings behind the views. Part 2: the real page (main.js, with the terminal replaced by a stub
// because it needs a shell and the xterm library) run in a fake browser against the real server.

const root = realpathSync(mkdtempSync(join(tmpdir(), "fm-views-")));
const home = join(root, "home");
const dataDir = join(root, "data");
const dest = join(home, "dest");
const ctx = createContext({ home, dataDir: join(root, "data-unit") });

describe("saving settings while navigation is still being remembered", () => {
  const loadSaver = (call: (method: string, data: { set: Record<string, unknown> }) => Promise<{ settings: Record<string, unknown> }>) => {
    const state = { settings: { view: "details" } as Record<string, unknown> };
    const source = readFileSync(new URL("../resources/file_manager/ui/nav.js", import.meta.url), "utf8")
      .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
    const save = new Function("state", "call", "emit", "debounce", `${source}\nreturn saveSettings;`)(state, call, () => {}, (fn: unknown) => fn) as
      (change: Record<string, unknown>) => Promise<Record<string, unknown>>;
    return { state, save };
  };

  test("writes in order and an older response cannot undo a newer view choice", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writes: Record<string, unknown>[] = [];
    const stored: Record<string, unknown> = { view: "details" };
    const { state, save } = loadSaver(async (_method, { set }) => {
      writes.push(set);
      if (writes.length === 1) await gate;
      Object.assign(stored, set);
      return { settings: { ...stored } };
    });
    const folder = save({ lastPath: home });
    const icons = save({ view: "icons" });
    await Promise.resolve();
    expect(writes).toEqual([{ lastPath: home }]);
    expect(state.settings.view).toBe("icons");
    release();
    await folder;
    expect(state.settings.view).toBe("icons");
    await icons;
    expect(writes).toEqual([{ lastPath: home }, { view: "icons" }]);
    expect(state.settings).toEqual({ view: "icons", lastPath: home });
  });

  test("a failed write is reported and does not prevent the next save", async () => {
    let attempts = 0;
    const { state, save } = loadSaver(async (_method, { set }) => {
      if (++attempts === 1) throw new Error("Settings are locked");
      return { settings: { ...set } };
    });
    const failed = save({ view: "icons" });
    const recovered = save({ view: "list" });
    await expect(failed).rejects.toThrow("Settings are locked");
    await recovered;
    expect(attempts).toBe(2);
    expect(state.settings.view).toBe("list");
  });
});

describe("the saved settings behind the views", () => {
  test("a new install starts in the Files view with sensible split values", () => {
    const s = sanitizeSettings({}, ctx);
    expect(s.workspace).toBe("files");
    expect(s.startWith).toBe("files");
    expect(s.splitSide).toBe("right");
    expect(s.splitSize).toBe(50);
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.focusMode).toBe(false);
    expect(s.activeTool).toBe("");
    expect(s.splitTool).toBe("");
    expect(s.dualPath).toBe("");
    expect(s.terminalOpen).toBe(false);
    expect(s.terminalHeight).toBe(300);
    expect(s.terminalPath).toBe("");
    expect(DEFAULT_SETTINGS.workspace).toBe("files");
  });

  test("good values are kept", () => {
    const s = sanitizeSettings({ workspace: "dual", startWith: "last", splitSide: "bottom", splitSize: 35, sidebarCollapsed: true, focusMode: true, activeTool: "find", splitTool: "my-tool-2", dualPath: home, terminalOpen: true, terminalHeight: 420, terminalPath: dest }, ctx);
    expect(s).toMatchObject({ workspace: "dual", startWith: "last", splitSide: "bottom", splitSize: 35, sidebarCollapsed: true, focusMode: true, activeTool: "find", splitTool: "my-tool-2", dualPath: home, terminalOpen: true, terminalHeight: 420, terminalPath: dest });
  });

  test("damaged values fall back to the defaults or are clamped", () => {
    const s = sanitizeSettings({ workspace: "nonsense", startWith: 3, splitSide: "left", splitSize: "wide", sidebarCollapsed: "yes", focusMode: 1, activeTool: "Not A Tool!", splitTool: "9abc", dualPath: "relative/path", terminalOpen: "yes", terminalHeight: "tall", terminalPath: "relative/folder" }, ctx);
    expect(s).toMatchObject({ workspace: "files", startWith: "files", splitSide: "right", splitSize: 50, sidebarCollapsed: false, focusMode: false, activeTool: "", splitTool: "", dualPath: "", terminalOpen: false, terminalHeight: 300, terminalPath: "" });
    expect(sanitizeSettings({ splitSize: 5 }, ctx).splitSize).toBe(20);
    expect(sanitizeSettings({ splitSize: 500 }, ctx).splitSize).toBe(80);
    expect(sanitizeSettings({ splitSize: Number.NaN }, ctx).splitSize).toBe(50);
    expect(sanitizeSettings({ terminalHeight: 40 }, ctx).terminalHeight).toBe(120);
    expect(sanitizeSettings({ terminalHeight: 5000 }, ctx).terminalHeight).toBe(1200);
    expect(sanitizeSettings({ terminalHeight: Number.NaN }, ctx).terminalHeight).toBe(300);
    expect(sanitizeSettings({ activeTool: "a".repeat(26) }, ctx).activeTool).toBe("");
    expect(sanitizeSettings({ activeTool: "a".repeat(25) }, ctx).activeTool).toBe("a".repeat(25));
    expect(sanitizeSettings("garbage", ctx).workspace).toBe("files");
    expect(sanitizeSettings(null, ctx).splitSize).toBe(50);
  });

  test("a settings file that is not JSON, or has the wrong shapes, loads as the defaults", async () => {
    const unitDir = join(root, "data-unit");
    mkdirSync(unitDir, { recursive: true });
    writeFileSync(join(unitDir, "file_manager.json"), "{ this is not json");
    expect((await loadSettings(ctx)).workspace).toBe("files");
    writeFileSync(join(unitDir, "file_manager.json"), JSON.stringify({ workspace: ["tools"], splitSize: { a: 1 }, sidebarCollapsed: null }));
    const s = await loadSettings(ctx);
    expect([s.workspace, s.splitSize, s.sidebarCollapsed]).toEqual(["files", 50, false]);
  });

  test("changes are validated when saved, and unknown keys are dropped", async () => {
    const s = await updateSettings(ctx, { workspace: "split", splitSize: 999, splitSide: "bottom", activeTool: "calc", terminalOpen: true, terminalHeight: 2000, terminalPath: home, bogus: 1 });
    expect(s).toMatchObject({ workspace: "split", splitSize: 80, splitSide: "bottom", activeTool: "calc", terminalOpen: true, terminalHeight: 1200, terminalPath: home });
    expect("bogus" in s).toBe(false);
    expect((await updateSettings(ctx, { workspace: "../etc" })).workspace).toBe("files");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------------------------------------------

const GLOBALS = [
  "document", "window", "Node", "Element", "Event", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "navigator", "location", "fetch",
  "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "MutationObserver", "getComputedStyle", "InputEvent", "KeyboardEvent", "MouseEvent", "CSS", "WebSocket",
] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let server: ReturnType<typeof startFileManagerServer>;
/** What the page asked the (recording) clipboard to hold: no test ever touches the real one. */
const clip: { text?: string; image?: { file: string; mime: string } } = {};
/** Programs the page asked the computer to start, and files it sent to an external code editor: nothing real is ever launched. */
const launched: Array<{ command: string; args: string[] }> = [];
const editorStarts: Array<{ path: string; options: any }> = [];
let doc: any;
let win: any;
let toolbarModule: any;
let chrome: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const $ = (sel: string): any => doc.querySelector(sel);
const app = (): any => doc.getElementById("app");
const MODIFIER = process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true };
const ws = () => app().dataset.workspace;
const shown = (sel: string) => !$(sel).hidden;
const key = (target: any, k: string, extra: Record<string, unknown> = {}) => {
  const ev = new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(ev);
  return ev;
};
const alt = (digit: number) => key(doc.body, String(digit), { altKey: true, code: `Digit${digit}` });
const savedSettings = async () => JSON.parse(readFileSync(join(dataDir, "file_manager.json"), "utf8"));
/** The page saves a moment after a change; on a slow machine that moment is longer, so wait for the value instead of a fixed time. */
async function savedWhen(name: string, value: unknown) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if ((await savedSettings())[name] === value) return;
    await sleep(50);
  }
  expect((await savedSettings())[name]).toBe(value);
}
const radio = (view: string): any => doc.getElementById(`view-${view}`);
const tiles = () => [...doc.querySelectorAll("#home-grid .home-tile")].filter((t: any) => !t.hidden);
const tile = (id: string): any => doc.querySelector(`#home-grid .home-tile[data-tile="${id}"]`);
const rowNames = (list: string) => [...doc.querySelectorAll(`${list} .row .name-text`)].map((e: any) => e.textContent);
const rowOf = (list: string, name: string): any => [...doc.querySelectorAll(`${list} .row`)].find((r: any) => r.querySelector(".name-text").textContent === name);
const clickRow = (list: string, name: string) => rowOf(list, name).dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
const split = () => Number($("#stage").style.getPropertyValue("--split"));

beforeAll(async () => {
  for (const f of ["a.txt", "b.txt"]) mkdirSync(home, { recursive: true }), writeFileSync(join(home, f), f);
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "c.txt"), "c");
  // The page starts where the person left it last time.
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "file_manager.json"), JSON.stringify({
    seenWelcome: true, startWith: "last", workspace: "split", splitSide: "bottom", splitSize: 35, sidebarCollapsed: true, splitTool: "timer", activeTool: "net", lastPath: home,
    favorites: [dest], recents: [{ path: join(home, "a.txt"), at: new Date().toISOString() }],
  }));
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => true, typeInTerminal: () => true, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, isTerminalOpen: () => false, wireTerminal() {},
  }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir, launch: async (command, args) => void launched.push({ command, args }), editor: { which: (n: string) => (n === "code" ? "/usr/bin/code" : null), open: (path: string, options: any) => void editorStarts.push({ path, options }) }, clipboard: { writeText: (t) => { clip.text = t; return true; }, writeImage: async (file, mime) => { clip.image = { file, mime }; return true; } } } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform).replace(/__FM_START__/g, "").replace(/__FM_NONCE__/g, "n");
  const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch" && x !== "ResizeObserver" && x !== "WebSocket" && x !== "CSS")) {
    const value = win[k];
    Object.defineProperty(g, k, { value: typeof value === "function" && !/^[A-Z]/.test(k) ? value.bind(win) : value, configurable: true, writable: true });
  }
  Object.defineProperty(g, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
  Object.defineProperty(g, "WebSocket", { value: class {}, configurable: true, writable: true });
  Object.defineProperty(g, "CSS", { value: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") }, configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => {
    if (u === "/api/copytext") {
      clip.text = JSON.parse(o.body).text;
      return Promise.resolve(Response.json({ ok: true, copied: true }));
    }
    return realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o);
  }, configurable: true, writable: true });
  win.Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(win.HTMLElement.prototype, "offsetParent", { get() { return win.document.body; }, configurable: true });
  doc = win.document;
  // The page modules are shared by every page test in this process. Whatever an earlier file left behind (an open menu
  // makes every shortcut stand aside; a mounted tool or a remembered view belongs to a page that is gone) must not count here.
  (await import("../resources/file_manager/ui/menus.js")).closeMenu();
  (await import("../resources/file_manager/ui/power.js")).resetPower();
  const shared = (await import("../resources/file_manager/ui/state.js")).state;
  Object.assign(shared, { platform: process.platform, sep: process.platform === "win32" ? "\\" : "/", home, workspace: "files", powerOpen: false, search: null, loading: false, busy: 0, terminalOpen: false });
  shared.selection.clear();
  chrome = await import("../resources/file_manager/ui/chrome.js");
  toolbarModule = await import("../resources/file_manager/ui/toolbar.js");
  await import("../resources/file_manager/ui/main.js");
  for (let i = 0; i < 100 && !doc.body.classList.contains("ready"); i++) await sleep(50);
  await sleep(300);
});

afterAll(async () => {
  await sleep(500);
  (await import("../resources/file_manager/ui/menus.js")).closeMenu();
  (await import("../resources/file_manager/ui/power.js")).resetPower();
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const before = saved.get(k);
    if (before) Object.defineProperty(g, k, before);
    else delete g[k];
  }
  mock.restore();
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("the page starts in the view it was left in", () => {
  test("the saved view, split direction, split size, sidebar and tool are all restored before the page shows", () => {
    expect(doc.body.classList.contains("ready")).toBe(true);
    expect(ws()).toBe("split");
    expect(app().dataset.splitSide).toBe("bottom");
    expect(split()).toBe(35);
    expect(app().classList.contains("sidebar-collapsed")).toBe(true);
    expect($("#sidebar-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(shown("#body") && shown("#power-panel") && shown("#splitter")).toBe(true);
    expect(shown("#home") || shown("#dual-pane")).toBe(false);
    expect($("#power-tab-timer").getAttribute("aria-selected")).toBe("true");
    expect(radio("split").getAttribute("aria-checked")).toBe("true");
    // Nothing is visible until the saved view has been applied (the page's CSS hides the stage until then).
    expect(readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "ui", "views.css"), "utf8")).toContain("body:not(.ready) #stage { visibility: hidden; }");
  });
});

describe("the view switcher", () => {
  test("is a labeled radio group with a tooltip and keyboard hint on every view", () => {
    const group = $("#view-switch");
    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(group.getAttribute("aria-label")).toBeTruthy();
    const radios = [...group.querySelectorAll("[role=radio]")];
    expect(radios.map((r: any) => r.dataset.view)).toEqual(["files", "home", "tools", "split", "dual"]);
    for (const r of radios as any[]) {
      expect(r.querySelector(".vb-label").textContent.length).toBeGreaterThan(2);
      expect(r.title).toMatch(/(Alt\+|⌥)[1-5]/);
    }
    expect(radios.filter((r: any) => r.tabIndex === 0).length).toBe(1);
    for (const id of ["sidebar-toggle", "focus-toggle", "split-orient", "power-close", "tool-more"]) expect(doc.getElementById(id).title, id).toBeTruthy();
  });

  test("every view can be chosen with the mouse and shows the right panes", async () => {
    const expected: Record<string, { body: boolean; home: boolean; power: boolean; dual: boolean; splitter: boolean }> = {
      files: { body: true, home: false, power: false, dual: false, splitter: false },
      home: { body: false, home: true, power: false, dual: false, splitter: false },
      tools: { body: false, home: false, power: true, dual: false, splitter: false },
      split: { body: true, home: false, power: true, dual: false, splitter: true },
      dual: { body: true, home: false, power: false, dual: true, splitter: true },
    };
    for (const [view, want] of Object.entries(expected)) {
      radio(view).click();
      await sleep(120);
      expect(ws(), view).toBe(view);
      expect({ body: shown("#body"), home: shown("#home"), power: shown("#power-panel"), dual: shown("#dual-pane"), splitter: shown("#splitter") }, view).toEqual(want);
      expect(radio(view).getAttribute("aria-checked")).toBe("true");
      expect([...doc.querySelectorAll("#view-switch [aria-checked=true]")].length).toBe(1);
      expect(doc.body.contains($(".modal-backdrop"))).toBe(false);
    }
    radio("files").click();
    await sleep(50);
  });

  test("arrow keys move between the views, Home and End jump to the ends", async () => {
    radio("files").focus();
    key(radio("files"), "ArrowRight");
    expect(ws()).toBe("home");
    key(radio("home"), "ArrowRight");
    expect(ws()).toBe("tools");
    key(radio("tools"), "ArrowLeft");
    expect(ws()).toBe("home");
    key(radio("home"), "End");
    expect(ws()).toBe("dual");
    key(radio("dual"), "ArrowRight");
    expect(ws()).toBe("files");
    key(radio("files"), "ArrowLeft");
    expect(ws()).toBe("dual");
    key(radio("dual"), "Home");
    expect(ws()).toBe("files");
    expect(doc.activeElement.id).toBe("view-files");
    await sleep(50);
  });

  test("Alt+1 to Alt+5 switch views even while the code or a text box has focus", async () => {
    for (const [digit, view] of [[2, "home"], [3, "tools"], [4, "split"], [5, "dual"], [1, "files"]] as const) {
      const ev = alt(digit);
      expect(ev.defaultPrevented).toBe(true);
      expect(ws()).toBe(view);
      await sleep(60);
    }
    $("#search").focus();
    key($("#search"), "2", { altKey: true, code: "Digit2" });
    expect(ws()).toBe("home");
    alt(1);
    // Ctrl+1..3 still change the list view, and Alt with Ctrl/Shift/Meta is left alone
    key(doc.body, "5", { altKey: true, shiftKey: true, code: "Digit5" });
    key(doc.body, "5", { altKey: true, ...MODIFIER, code: "Digit5" });
    expect(ws()).toBe("files");
    await sleep(50);
  });

  test("shortcuts are ignored while a dialog is open", async () => {
    $("#overlay").append(Object.assign(doc.createElement("div"), { className: "modal-backdrop" }));
    alt(3);
    expect(ws()).toBe("files");
    doc.querySelector(".modal-backdrop").remove();
  });

  test("Alt+7 folds the sidebar away and back, and the choice is saved", async () => {
    expect(app().classList.contains("sidebar-collapsed")).toBe(true);
    alt(7);
    expect(app().classList.contains("sidebar-collapsed")).toBe(false);
    expect($("#sidebar-toggle").getAttribute("aria-expanded")).toBe("true");
    await sleep(200);
    expect((await savedSettings()).sidebarCollapsed).toBe(false);
    $("#sidebar-toggle").click();
    expect(app().classList.contains("sidebar-collapsed")).toBe(true);
    await sleep(200);
    expect((await savedSettings()).sidebarCollapsed).toBe(true);
  });
});

describe("Home", () => {
  test("shows a greeting, a search box, and a tile for every capability, including every registered tool", async () => {
    alt(2);
    await sleep(150);
    expect($("#home h1").textContent).toMatch(/Good|Hello/);
    expect($("#home-search").getAttribute("aria-label")).toBeTruthy();
    const ids = tiles().map((t: any) => t.dataset.tile);
    for (const id of ["browse", "split", "dual", "convert", "lock", "terminal", "openwith", "bin", "settings", "help"]) expect(ids, id).toContain(id);
    const power = await import("../resources/file_manager/ui/power.js");
    const tools = power.listPowerTabs();
    expect(tools.length).toBeGreaterThanOrEqual(9);
    for (const t of tools) {
      expect(ids, t.id).toContain(`tool-${t.id}`);
      expect(tile(`tool-${t.id}`).textContent).toContain(t.label);
    }
    for (const t of tiles() as any[]) {
      expect(t.tagName).toBe("BUTTON");
      expect(t.title.length).toBeGreaterThan(10);
      expect(t.querySelector(".ht-title").textContent.length).toBeGreaterThan(1);
      expect(t.querySelector(".ht-text").textContent.length).toBeGreaterThan(10);
    }
    expect($("#home-grid").getAttribute("role")).toBe("group");
    expect($("#home-grid").getAttribute("aria-labelledby")).toBeTruthy();
  });

  test("lists pinned folders, places with free space, recent files, quick actions, tips and helper programs", async () => {
    const heads = [...doc.querySelectorAll("#home .home-h")].map((e: any) => e.textContent);
    for (const part of ["Pinned folders", "Places and drives", "Recent files", "Quick actions", "Tips", "Helper programs"]) expect(heads.some((h: string) => h.includes(part)), part).toBe(true);
    expect($("#home-sections").textContent).toContain("dest");
    expect($("#home-sections").textContent).toContain("a.txt");
    expect([...doc.querySelectorAll("#home-sections .home-quick")].map((b: any) => b.textContent.trim())).toEqual(expect.arrayContaining(["📁 New folder", "📄 New file"]));
    expect(doc.querySelectorAll("#home-sections .home-tips li").length).toBe(3);
    const deadline = Date.now() + 20_000;
    while (doc.querySelectorAll("#home-sections .home-chip").length === 0 && Date.now() < deadline) await sleep(50);
    expect(doc.querySelectorAll("#home-sections .home-chip").length).toBeGreaterThan(3);
  });

  test("typing filters the tiles and Enter looks for files in the current folder", async () => {
    const input = $("#home-search");
    input.value = "calc";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(tiles().map((t: any) => t.dataset.tile)).toContain("tool-calc");
    expect(tiles().map((t: any) => t.dataset.tile)).not.toContain("tool-ip");
    expect(tiles().length).toBeLessThan(4);
    expect($("#home-hint").textContent).toContain("Press Enter");
    input.value = "zzzz-nothing";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(tiles().length).toBe(0);
    expect($("#home-tiles-empty").hidden).toBe(false);
    input.value = "a.tx";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    $(".home-searchbox").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    await sleep(500);
    expect(ws()).toBe("files");
    expect($("#banner").textContent).toContain("a.tx");
    expect(rowNames("#list")).toEqual(["a.txt"]);
    $("#banner button")?.click();
    await sleep(200);
  });

  test("a tool tile opens that tool in the Tools view, and Back to files returns", async () => {
    alt(2);
    await sleep(100);
    tile("tool-find").click();
    await sleep(300);
    expect(ws()).toBe("tools");
    expect($("#power-tab-find").getAttribute("aria-selected")).toBe("true");
    expect(shown("#power-panel") && !shown("#body")).toBe(true);
    $("#power-close").click();
    await sleep(100);
    expect(ws()).toBe("files");
    expect(shown("#body") && !shown("#power-panel")).toBe(true);
    alt(2);
    await sleep(100);
    tile("tool-calc").click();
    await sleep(200);
    expect([ws(), $(".power-tab.active").id]).toEqual(["tools", "power-tab-calc"]);
  });

  test("other tiles go where they say, and the Browse tile returns to Files", async () => {
    alt(2);
    await sleep(100);
    tile("split").click();
    await sleep(150);
    expect(ws()).toBe("split");
    alt(2);
    tile("dual").click();
    await sleep(300);
    expect(ws()).toBe("dual");
    alt(2);
    tile("settings").click();
    await sleep(100);
    expect($(".modal-backdrop .dialog-title").textContent).toBe("Settings");
    expect([...doc.querySelectorAll(".modal-backdrop select")].map((s: any) => s.getAttribute("aria-label"))).toContain("When the File Manager starts, show");
    $(".modal-backdrop button.primary").click();
    await sleep(50);
    tile("browse").click();
    await sleep(100);
    expect(ws()).toBe("files");
  });

  test("a tool tile keeps Enter, Space and Backspace for itself instead of the file list", async () => {
    alt(2);
    await sleep(100);
    const first = tiles()[0];
    first.focus();
    expect(key(first, "Enter").defaultPrevented).toBe(false);
    expect(key(first, " ").defaultPrevented).toBe(false);
    expect(key(first, "Backspace").defaultPrevented).toBe(false);
    expect(key($("#view-home"), "Enter").defaultPrevented).toBe(false);
    alt(1);
    await sleep(100);
    expect(key($("#list"), "Enter").defaultPrevented).toBe(true);
    expect(key($("#tool-refresh"), "Enter").defaultPrevented).toBe(false);
  });

  test("a module can add its own tile with registerHomeTile", async () => {
    const home = await import("../resources/file_manager/ui/home.js");
    let ran = 0;
    home.registerHomeTile({ id: "vault-test", order: 5, icon: "🔒", title: "Lock files", text: "Lock files with a password so only you can open them.", run: () => ran++ });
    alt(2);
    await sleep(100);
    const first = tiles()[0];
    expect(first.dataset.tile).toBe("vault-test");
    first.click();
    await sleep(50);
    expect(ran).toBe(1);
    expect(home.listHomeTiles().some((t: any) => t.id === "vault-test")).toBe(true);
  });
});

describe("the Tools view", () => {
  test("remembers the last tool for the Tools view and, separately, for the Split view", async () => {
    alt(3);
    await sleep(150);
    $("#power-tab-ip").click();
    await sleep(250);
    expect((await savedSettings()).activeTool).toBe("ip");
    alt(4);
    await sleep(150);
    $("#power-tab-watch").click();
    await sleep(250);
    expect((await savedSettings()).splitTool).toBe("watch");
    alt(3);
    await sleep(150);
    expect($(".power-tab.active").id).toBe("power-tab-ip");
    alt(4);
    await sleep(150);
    expect($(".power-tab.active").id).toBe("power-tab-watch");
  });

  test("the tab strip has an icon and a name on every tab, grouped with separators, and moves with the arrow keys", async () => {
    const tabs = [...doc.querySelectorAll("#power-tabs [role=tab]")];
    expect(tabs.length).toBeGreaterThanOrEqual(9);
    for (const t of tabs as any[]) {
      expect(t.querySelector(".pt-icon").textContent.trim().length).toBeGreaterThan(0);
      expect(t.querySelector(".pt-label").textContent.trim().length).toBeGreaterThan(1);
      expect(t.title).toContain(":");
    }
    expect(doc.querySelectorAll("#power-tabs .power-sep").length).toBeGreaterThanOrEqual(3);
    const order = tabs.map((t: any) => t.id.replace("power-tab-", ""));
    expect(order.indexOf("find")).toBeLessThan(order.indexOf("watch"));
    expect(order.indexOf("crypto")).toBeLessThan(order.indexOf("ip"));
    expect(order.indexOf("ip")).toBeLessThan(order.indexOf("calc"));
    const before = $(".power-tab.active").id;
    key($(".power-tab.active"), "ArrowRight");
    expect($(".power-tab.active").id).not.toBe(before);
    key($(".power-tab.active"), "Home");
    expect($(".power-tab.active").id).toBe(`power-tab-${order[0]}`);
    key($(".power-tab.active"), "End");
    expect($(".power-tab.active").id).toBe(`power-tab-${order.at(-1)}`);
  });

  test("Ctrl+Shift+F style opening (openPower) switches to the Tools view from anywhere, and only changes the tab in Split", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    alt(1);
    await sleep(100);
    power.openPower("find");
    await sleep(150);
    expect([ws(), $(".power-tab.active").id]).toEqual(["tools", "power-tab-find"]);
    alt(4);
    await sleep(100);
    power.openPower("sd");
    await sleep(150);
    expect([ws(), $(".power-tab.active").id]).toEqual(["split", "power-tab-sd"]);
    expect(power.powerIsOpen()).toBe(true);
    power.closePower();
    expect(ws()).toBe("files");
    expect(power.powerIsOpen()).toBe(false);
    power.togglePower("find");
    expect(ws()).toBe("tools");
  });

  test("Esc leaves the Tools view but not the Split view", async () => {
    alt(3);
    await sleep(100);
    key(doc.body, "Escape");
    expect(ws()).toBe("files");
    alt(4);
    await sleep(100);
    key(doc.body, "Escape");
    expect(ws()).toBe("split");
  });
});

describe("the split", () => {
  test("the divider is a keyboard-resizable separator with limits and a reset", async () => {
    alt(4);
    await sleep(100);
    if (app().dataset.splitSide !== "right") $("#split-orient").click();
    expect(app().dataset.splitSide).toBe("right");
    const sep = $("#splitter");
    expect(sep.getAttribute("role")).toBe("separator");
    expect(sep.getAttribute("aria-orientation")).toBe("vertical");
    expect(sep.tabIndex).toBe(0);
    key(sep, "Home");
    expect(split()).toBe(50);
    key(sep, "ArrowRight");
    expect(split()).toBe(52);
    key(sep, "ArrowLeft");
    key(sep, "ArrowLeft");
    expect(split()).toBe(48);
    key(sep, "ArrowRight", { shiftKey: true });
    expect(split()).toBe(58);
    expect(sep.getAttribute("aria-valuenow")).toBe("58");
    for (let i = 0; i < 40; i++) key(sep, "ArrowRight");
    expect(split()).toBe(80);
    for (let i = 0; i < 80; i++) key(sep, "ArrowLeft");
    expect(split()).toBe(20);
    expect(sep.getAttribute("aria-valuemin")).toBe("20");
    expect(sep.getAttribute("aria-valuemax")).toBe("80");
    key(sep, "ArrowUp");
    expect(split()).toBe(20);
    await savedWhen("splitSize", 20);
    sep.dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    expect(split()).toBe(50);
    await sleep(250);
    expect((await savedSettings()).splitSize).toBe(50);
  });

  test("dragging the divider resizes it and saves the size when released", async () => {
    const stage = $("#stage");
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 });
    const sep = $("#splitter");
    sep.dispatchEvent(new win.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    expect(stage.classList.contains("resizing")).toBe(true);
    sep.dispatchEvent(new win.MouseEvent("pointermove", { bubbles: true, clientX: 300, clientY: 10 }));
    expect(split()).toBe(30);
    sep.dispatchEvent(new win.MouseEvent("pointermove", { bubbles: true, clientX: 50, clientY: 10 }));
    expect(split()).toBe(20);
    sep.dispatchEvent(new win.MouseEvent("pointermove", { bubbles: true, clientX: 700, clientY: 10 }));
    sep.dispatchEvent(new win.MouseEvent("pointerup", { bubbles: true }));
    expect(stage.classList.contains("resizing")).toBe(false);
    expect(split()).toBe(70);
    await savedWhen("splitSize", 70);
  });

  test("the orientation button switches between side by side and stacked, uses the other arrow keys, and is saved", async () => {
    const button = $("#split-orient");
    expect(button.hidden).toBe(false);
    expect(button.getAttribute("aria-label")).toMatch(/under/);
    button.click();
    expect(app().dataset.splitSide).toBe("bottom");
    expect($("#splitter").getAttribute("aria-orientation")).toBe("horizontal");
    expect(button.getAttribute("aria-label")).toMatch(/beside/);
    key($("#splitter"), "Home");
    key($("#splitter"), "ArrowDown");
    expect(split()).toBe(52);
    key($("#splitter"), "ArrowLeft");
    expect(split()).toBe(52);
    await sleep(250);
    expect((await savedSettings()).splitSide).toBe("bottom");
    alt(1);
    await sleep(50);
    expect(button.hidden).toBe(true);
    alt(4);
    await sleep(50);
    button.click();
    expect(app().dataset.splitSide).toBe("right");
  });
});

describe("Focus", () => {
  test("hides the toolbar, sidebar and status line; the button and Esc bring them back; the choice is saved", async () => {
    alt(1);
    await sleep(80);
    const button = $("#focus-toggle");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    button.click();
    expect(app().classList.contains("focus-mode")).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await sleep(250);
    expect((await savedSettings()).focusMode).toBe(true);
    const ev = key(doc.body, "Escape");
    expect(ev.defaultPrevented).toBe(true);
    expect(app().classList.contains("focus-mode")).toBe(false);
    await sleep(250);
    expect((await savedSettings()).focusMode).toBe(false);
    alt(6);
    expect(app().classList.contains("focus-mode")).toBe(true);
    alt(3);
    await sleep(100);
    key(doc.body, "Escape"); // leaves Focus first, not the Tools view
    expect([app().classList.contains("focus-mode"), ws()]).toEqual([false, "tools"]);
    key(doc.body, "Escape");
    expect(ws()).toBe("files");
  });

  test("Places in Focus: the Places button and Alt+7 leave Focus and show the list, and both choices are saved", async () => {
    alt(6);
    expect(app().classList.contains("focus-mode")).toBe(true);
    expect($("#sidebar-toggle").getAttribute("aria-expanded")).toBe("false");
    $("#sidebar-toggle").click();
    expect(app().classList.contains("focus-mode")).toBe(false);
    expect(app().classList.contains("sidebar-collapsed")).toBe(false);
    expect($("#sidebar-toggle").getAttribute("aria-expanded")).toBe("true");
    await sleep(300);
    expect(await savedSettings()).toMatchObject({ focusMode: false, sidebarCollapsed: false });
    alt(6);
    alt(7);
    expect([app().classList.contains("focus-mode"), app().classList.contains("sidebar-collapsed")]).toEqual([false, false]);
    alt(7);
    expect(app().classList.contains("sidebar-collapsed")).toBe(true);
    alt(7);
    expect(app().classList.contains("sidebar-collapsed")).toBe(false);
    await sleep(300);
    expect(await savedSettings()).toMatchObject({ focusMode: false, sidebarCollapsed: false });
  });

  test("Esc inside the terminal is left to the terminal", () => {
    $("#focus-toggle").click();
    const term = $("#terminal-host");
    const ev = key(term, "Escape");
    expect(ev.defaultPrevented).toBe(false);
    expect(app().classList.contains("focus-mode")).toBe(true);
    key(doc.body, "Escape");
    expect(app().classList.contains("focus-mode")).toBe(false);
  });
});

describe("the toolbar and the status bar", () => {
  test("buttons that don't fit move into a More menu, from the end, and still work", async () => {
    alt(1);
    await sleep(80);
    const bar = $("#toolbar");
    const visible = () => [...bar.querySelectorAll(".tool")].filter((b: any) => !b.hidden && !b.classList.contains("overflowed")).length;
    // jsdom has no layout, so give the toolbar a width and make each showing button 50 wide
    Object.defineProperty(bar, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(bar, "scrollWidth", { get: () => visible() * 50, configurable: true });
    chrome.fitToolbar();
    expect(visible()).toBe(6);
    expect($("#tool-more").hidden).toBe(false);
    const overflowed = [...bar.querySelectorAll(".tool.overflowed")];
    expect(overflowed.length).toBeGreaterThan(3);
    expect(overflowed.at(-1).id).toBe("tool-help");
    expect(bar.querySelector("#tool-back").classList.contains("overflowed")).toBe(false);
    $("#tool-more").click();
    await sleep(50);
    const items = [...doc.querySelectorAll(".menu [role^=menuitem]")].map((i: any) => i.textContent);
    expect(items.some((t: string) => t.includes("Help"))).toBe(true);
    expect(items.some((t: string) => t.includes("Settings"))).toBe(true);
    [...doc.querySelectorAll(".menu [role^=menuitem]")].find((i: any) => i.textContent.includes("Help")).click();
    await sleep(100);
    expect($(".modal-backdrop .dialog-title").textContent).toBe("Help");
    expect($(".modal-backdrop .keys").textContent).toMatch(/(Alt\+|⌥)1/);
    expect($(".modal-backdrop .keys").textContent).toMatch(/Focus/);
    expect($(".modal-backdrop .keys").textContent).toMatch(/F5/);
    $(".modal-backdrop button.primary").click();
    // widening the window brings everything back
    Object.defineProperty(bar, "clientWidth", { value: 5000, configurable: true });
    chrome.fitToolbar();
    expect(bar.querySelectorAll(".tool.overflowed").length).toBe(0);
    expect($("#tool-more").hidden).toBe(true);
    expect(typeof toolbarModule.updateToolbar).toBe("function");
  });

  test("hideUntilFits hides from the end and always keeps at least one", () => {
    const items = [1, 2, 3, 4, 5];
    const hidden: number[] = [];
    expect(chrome.hideUntilFits(items, (i: number) => hidden.push(i), () => hidden.length >= 2)).toBe(2);
    expect(hidden).toEqual([5, 4]);
    expect(chrome.hideUntilFits(items, () => {}, () => false)).toBe(4);
    expect(chrome.hideUntilFits(items, () => {}, () => true)).toBe(0);
  });

  test("the status bar has Details, List and Icons buttons that change and show the list view", async () => {
    const buttons = [...doc.querySelectorAll("#status-views button")];
    expect(buttons.map((b: any) => b.dataset.view)).toEqual(["details", "list", "icons"]);
    expect(buttons.every((b: any) => b.title.length > 10 && b.textContent.trim().length > 2)).toBe(true);
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    buttons[1].click();
    await sleep(250);
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
    expect($("#list").className).toContain("view-list");
    expect((await savedSettings()).view).toBe("list");
    buttons[0].click();
    await sleep(150);
    alt(2);
    expect($("#status-views").hidden).toBe(true);
    alt(1);
    expect($("#status-views").hidden).toBe(false);
  });

  test("the view bar, status bar, and Home page show a live clock and date that toggles between 12-hour and 24-hour time", async () => {
    const fixed = new Date("2026-10-17T19:05:09");
    chrome.updateClock(fixed);
    expect($("#fm-clock-date").textContent).toContain("2026");
    expect($("#fm-clock-time").textContent).toMatch(/05:09/);
    expect($("#status-clock").textContent).toContain("2026");
    expect($("#status-clock").textContent).toMatch(/05:09/);
    const beforeTitle = $("#fm-clock").title;
    $("#fm-clock").click();
    chrome.updateClock(fixed);
    expect($("#fm-clock").title).not.toBe(beforeTitle);
    const c12 = chrome.formatClock(fixed, false);
    const c24 = chrome.formatClock(fixed, true);
    expect(c24.time).toContain("19:05:09");
    expect(c12.time).toMatch(/7:05:09/);
    $("#fm-clock").click();

    // Right-clicking #fm-clock opens the Clock & Calendar quick menu with timestamp copy and dated folder actions
    $("#fm-clock").dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await sleep(40);
    const menuText = doc.querySelector(".menu")?.textContent ?? "";
    expect(menuText).toContain("Calendar, World Clocks & Timestamps");
    expect(menuText).toContain("Copy local date");
    expect(menuText).toContain("Copy filename timestamp");
    expect(menuText).toContain("New dated folder");
    (await import("../resources/file_manager/ui/menus.js")).closeMenu();

    // Calendar, World Clocks & Epoch Converter dialog
    const dlg = chrome.openCalendarDialog(fixed);
    await sleep(50);
    expect(doc.querySelector("#cal-month-label")?.textContent).toContain("2026");
    expect(doc.querySelectorAll("#cal-world-grid .cal-world-card").length).toBe(6);
    const epochIn = doc.querySelector("#cal-epoch-input") as any;
    expect(epochIn).toBeTruthy();
    epochIn.value = "1700000000";
    epochIn.dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(doc.querySelector("#cal-epoch-result")?.textContent).toContain("2023-11-14T22:13:20.000Z");
    dlg.close(null);
    await sleep(40);
  });
});

describe("the Dual view", () => {
  test("shows a second folder pane with its own address and list, and the active pane follows focus", async () => {
    alt(5);
    await sleep(500);
    expect(ws()).toBe("dual");
    expect(rowNames("#dual-list")).toEqual(rowNames("#list"));
    expect($("#dual-list").getAttribute("role")).toBe("listbox");
    expect($("#dual-list").getAttribute("aria-label")).toBeTruthy();
    expect($("#dual-crumbs .crumb.current").textContent).toBe("home");
    expect(app().dataset.dualActive).toBe("left");
    for (const b of doc.querySelectorAll("#dual-pane button")) expect(b.title || b.getAttribute("aria-label"), b.outerHTML.slice(0, 80)).toBeTruthy();
  });

  test("the right pane opens folders on double-click, goes Up, and keeps its own selection", async () => {
    rowOf("#dual-list", "dest").dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    await sleep(300);
    expect(rowNames("#dual-list")).toEqual(["c.txt"]);
    expect(rowNames("#list")).toContain("dest");
    clickRow("#dual-list", "c.txt");
    expect(rowOf("#dual-list", "c.txt").getAttribute("aria-selected")).toBe("true");
    expect($("#dual-status").textContent).toContain("1 file selected");
    expect((await savedSettings()).dualPath).toBe(dest);
  });

  test("F5 copies and F6 moves the left selection into the right folder; Tab switches panes", async () => {
    $("#list").focus();
    clickRow("#list", "a.txt");
    $("#list").dispatchEvent(new win.Event("focusin", { bubbles: true }));
    expect(app().dataset.dualActive).toBe("left");
    let ev = key($("#list"), "F5");
    expect(ev.defaultPrevented).toBe(true);
    await sleep(600);
    expect(existsSync(join(dest, "a.txt"))).toBe(true);
    expect(existsSync(join(home, "a.txt"))).toBe(true);
    expect(rowNames("#dual-list")).toEqual(["a.txt", "c.txt"]);

    clickRow("#list", "b.txt");
    ev = key($("#list"), "F6");
    await sleep(600);
    expect(existsSync(join(dest, "b.txt"))).toBe(true);
    expect(existsSync(join(home, "b.txt"))).toBe(false);
    expect(rowNames("#dual-list")).toEqual(["a.txt", "b.txt", "c.txt"]);

    ev = key($("#list"), "Tab");
    expect(ev.defaultPrevented).toBe(true);
    expect(doc.activeElement.id).toBe("dual-list");
    $("#dual-list").dispatchEvent(new win.Event("focusin", { bubbles: true }));
    expect(app().dataset.dualActive).toBe("right");
    key($("#dual-list"), "Tab");
    expect(doc.activeElement.id).toBe("list");
  });

  test("with the right pane active, F5 and the buttons copy the right selection into the left folder", async () => {
    $("#dual-list").focus();
    $("#dual-list").dispatchEvent(new win.Event("focusin", { bubbles: true }));
    key($("#dual-list"), "ArrowDown");
    clickRow("#dual-list", "c.txt");
    expect(existsSync(join(home, "c.txt"))).toBe(false);
    key(doc.body, "F5");
    await sleep(600);
    expect(existsSync(join(home, "c.txt"))).toBe(true);
    expect(existsSync(join(dest, "c.txt"))).toBe(true);
    expect(rowNames("#list")).toContain("c.txt");
    clickRow("#dual-list", "b.txt");
    $("#dual-move-left").click();
    await sleep(600);
    expect(existsSync(join(home, "b.txt"))).toBe(true);
    expect(existsSync(join(dest, "b.txt"))).toBe(false);
    expect(rowNames("#dual-list")).toEqual(["a.txt", "c.txt"]);
  });

  test("Delete in the right pane moves the selection to the Recycle Bin", async () => {
    clickRow("#dual-list", "a.txt");
    const ev = key($("#dual-list"), "Delete");
    expect(ev.defaultPrevented).toBe(true);
    await sleep(700);
    expect(existsSync(join(dest, "a.txt"))).toBe(false);
    expect(rowNames("#dual-list")).toEqual(["c.txt"]);
  });

  test("dropping items dragged from the left list onto the right pane copies or moves them there", async () => {
    const dnd = await import("../resources/file_manager/ui/dnd.js");
    writeFileSync(join(home, "d.txt"), "d");
    const nav = await import("../resources/file_manager/ui/nav.js");
    await nav.refresh();
    await sleep(300);
    dnd.drag.paths = [join(home, "d.txt")];
    const drop = new win.Event("drop", { bubbles: true, cancelable: true }) as any;
    drop.dataTransfer = { dropEffect: "move" };
    $(".dual-listwrap").dispatchEvent(drop);
    await sleep(700);
    expect(existsSync(join(dest, "d.txt"))).toBe(true);
    expect(existsSync(join(home, "d.txt"))).toBe(false);
    dnd.endDrag();
  });

  test("the sidebar and the Details panel don't take room from the two panes", () => {
    const views = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "ui", "views.css"), "utf8");
    expect(views).toMatch(/\[data-workspace="dual"\] #info \{ display: none; \}/);
    expect(views).toMatch(/--side-w: 11rem/);
  });
});

// The right pane is the same kind of list as the left one: same columns and dates, same View and sort settings, same
// right-click menu, keys, inline rename and file operations, working on its own folder.
describe("the Dual view's right pane has the same options as the left one", () => {
  const parity = join(home, "parity");
  const work = join(parity, "work");
  const other = join(parity, "other");
  const sqliteHeader = Buffer.concat([Buffer.from("SQLite format 3\0", "latin1"), Buffer.alloc(100)]);
  let menus: any;
  let nav: any;
  let pane: any;

  const until = async (check: () => boolean, what: string, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (check()) return;
      await sleep(40);
    }
    throw new Error(`Timed out waiting for ${what}`);
  };
  const $$ = (sel: string): any[] => [...doc.querySelectorAll(sel)];
  const byName = (list: string, name: string): any => $$(`${list} .row`).find((r: any) => basename(r.dataset.key) === name);
  const click = (list: string, name: string, extra: Record<string, unknown> = {}) => byName(list, name).dispatchEvent(new win.MouseEvent("click", { bubbles: true, ...extra }));
  const rightClick = (target: any) => target.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 6, clientY: 6 }));
  const menuLabels = () => $$(".menu .menu-label").map((e: any) => e.textContent);
  const focusList = (id: string) => {
    $(`#${id}`).focus();
    $(`#${id}`).dispatchEvent(new win.Event("focusin", { bubbles: true }));
  };
  const cell = (list: string, name: string, cls: string) => byName(list, name).querySelector(cls).textContent;
  const openOnRight = async (path: string) => {
    await nav.goToIn(pane.right, path);
    await until(() => $$("#dual-crumbs .crumb.current")[0]?.title === path, `the right pane to show ${path}`);
  };
  const openOnLeft = async (path: string) => {
    await nav.goTo(path);
    await until(() => $$("#crumbs .crumb.current")[0]?.title === path, `the left pane to show ${path}`);
  };

  beforeAll(async () => {
    for (const dir of [work, other]) {
      mkdirSync(join(dir, "sub"), { recursive: true });
      writeFileSync(join(dir, "one.txt"), "1");
      writeFileSync(join(dir, "two.txt"), "22222");
      writeFileSync(join(dir, "three.md"), "333");
      writeFileSync(join(dir, "data.db"), sqliteHeader);
    }
    writeFileSync(join(other, "only-right.txt"), "right");
    menus = await import("../resources/file_manager/ui/menus.js");
    nav = await import("../resources/file_manager/ui/nav.js");
    pane = await import("../resources/file_manager/ui/pane.js");
    const shared = (await import("../resources/file_manager/ui/state.js")).state;
    shared.clipboard = null;
    await nav.saveSettings({ view: "details", sortBy: "name", sortDir: "asc", foldersFirst: true, showHidden: false, deleteTo: "bin" });
    await openOnLeft(work);
    await openOnRight(other);
    await until(() => rowNames("#list").length === 5 && rowNames("#dual-list").length === 6, "both lists to be filled");
  }, 30_000);

  test("it has its own folder and the same column headings as the left list, and every control has a name and a tooltip", () => {
    expect($("#dual-crumbs .crumb.current").textContent).toBe("other");
    expect(rowNames("#list")).toEqual(["sub", "data.db", "one.txt", "three.md", "two.txt"]);
    expect(rowNames("#dual-list")).toEqual(["sub", "data.db", "one.txt", "only-right.txt", "three.md", "two.txt"]);
    const heads = (id: string) => $$(`#${id} > *`).filter((e: any) => !e.hidden).map((e: any) => e.textContent);
    expect(heads("dual-list-head")).toEqual(heads("list-head"));
    expect(heads("dual-list-head")).toEqual(["", "Name", "Date modified", "Type", "Size"]);
    for (const b of $$("#dual-pane button")) expect(b.title || b.getAttribute("aria-label"), b.outerHTML.slice(0, 80)).toBeTruthy();
    for (const b of $$("#dual-list-head button")) expect(b.textContent.trim() && b.title).toBeTruthy();
  });

  test("a file shows the same date, type, size and icon in both lists, and the status line says the same", async () => {
    await openOnRight(work);
    await until(() => rowNames("#dual-list").length === 5, "the right pane to list the work folder");
    for (const name of ["one.txt", "two.txt", "three.md", "sub", "data.db"]) {
      for (const cls of [".c-date", ".c-type", ".c-size", ".c-icon"]) expect(cell("#dual-list", name, cls), `${name} ${cls}`).toBe(cell("#list", name, cls));
    }
    expect(cell("#dual-list", "one.txt", ".c-date")).toMatch(/Today, /);
    focusList("dual-list");
    click("#dual-list", "two.txt");
    click("#list", "two.txt");
    expect($("#dual-status").textContent).toBe($("#status-left").textContent);
    expect($("#dual-status").textContent).toContain("1 file selected");
  });

  test("the View setting changes both lists, and the column headings go away with Details", async () => {
    await nav.saveSettings({ view: "icons" });
    await until(() => $("#dual-list").className === "view-icons", "both lists to use icons");
    expect($("#list").className).toBe("view-icons");
    expect($("#dual-list").className).toBe("view-icons");
    expect($("#list-head").hidden && $("#dual-list-head").hidden).toBe(true);
    await nav.saveSettings({ view: "list" });
    await until(() => $("#dual-list").className === "view-list", "both lists to use list view");
    expect($("#dual-list").className).toBe("view-list");
    await nav.saveSettings({ view: "details" });
    await until(() => $("#dual-list").className === "view-details", "both lists to use details");
    expect($("#dual-list").className).toBe("view-details");
    expect($("#dual-list-head").hidden).toBe(false);
  });

  test("clicking a heading above the right list sorts both lists, and clicking it again reverses them", async () => {
    $("#dual-list-head [data-sort=size]").click();
    await until(() => $("#list-head [data-sort=size]").getAttribute("aria-sort") === "ascending", "the sort to be applied");
    expect($("#dual-list-head [data-sort=size]").getAttribute("aria-sort")).toBe("ascending");
    expect(rowNames("#dual-list")).toEqual(rowNames("#list"));
    expect(rowNames("#dual-list").slice(0, 3)).toEqual(["sub", "one.txt", "three.md"]);
    $("#dual-list-head [data-sort=size]").click();
    await until(() => $("#list-head [data-sort=size]").getAttribute("aria-sort") === "descending", "the sort to reverse");
    expect(rowNames("#dual-list")).toEqual(rowNames("#list"));
    expect(rowNames("#dual-list").at(-1)).toBe("one.txt");
    $("#list-head [data-sort=name]").click();
    await until(() => $("#dual-list-head [data-sort=name]").getAttribute("aria-sort") === "ascending", "the left heading to sort the right list too");
    expect(rowNames("#dual-list")).toEqual(["sub", "data.db", "one.txt", "three.md", "two.txt"]);
  });

  test("hidden files and folders-first follow the one setting too", async () => {
    writeFileSync(join(work, ".secret"), "s");
    await nav.saveSettings({ showHidden: true });
    await until(() => rowNames("#dual-list").includes(".secret") && rowNames("#list").includes(".secret"), "hidden files to show in both lists");
    expect(byName("#dual-list", ".secret").classList.contains("hidden-item")).toBe(true);
    await nav.saveSettings({ showHidden: false, foldersFirst: false });
    await until(() => !rowNames("#dual-list").includes(".secret") && rowNames("#dual-list")[0] === "data.db", "the lists to follow the setting");
    expect(rowNames("#dual-list")).toEqual(rowNames("#list"));
    await nav.saveSettings({ foldersFirst: true });
    expect(rowNames("#dual-list")[0]).toBe("sub");
    rmSync(join(work, ".secret"));
  });

  const sameMenu = async (left: () => void, right: () => void, what: string) => {
    focusList("list");
    left();
    await until(() => menuLabels().length > 0, `the left menu for ${what}`);
    const leftLabels = menuLabels();
    menus.closeMenu();
    focusList("dual-list");
    right();
    await until(() => menuLabels().length > 0, `the right menu for ${what}`);
    const rightLabels = menuLabels();
    menus.closeMenu();
    return { leftLabels, rightLabels };
  };

  test("right-click on one file shows the left list's menu, including SQLite Studio for a database", async () => {
    // the database check runs in the background; the menu offers SQLite Studio once it has answered
    click("#list", "data.db");
    click("#dual-list", "data.db");
    await sleep(600);
    const db = await sameMenu(() => rightClick(byName("#list", "data.db")), () => rightClick(byName("#dual-list", "data.db")), "a database file");
    expect(db.rightLabels).toEqual(db.leftLabels);
    for (const label of ["Open", "Open with…", "Open in SQLite Studio", "Open in SQLite Studio in its own window", "Open in SQLite Studio in my browser", "Rename", "Cut", "Copy", "Bury (Rip)", "Move to Recycle Bin", "Convert or process…", "More info…", "Properties", "Copy path"]) expect(db.rightLabels, label).toContain(label);
    const text = await sameMenu(() => rightClick(byName("#list", "one.txt")), () => rightClick(byName("#dual-list", "one.txt")), "a text file");
    expect(text.rightLabels).toEqual(text.leftLabels);
    expect(text.rightLabels).toContain("Edit in Code editor");
    expect(text.rightLabels).not.toContain("Open in SQLite Studio");
  });

  test("right-click on a folder, on several items and on empty space shows the left list's menu", async () => {
    const folder = await sameMenu(() => rightClick(byName("#list", "sub")), () => rightClick(byName("#dual-list", "sub")), "a folder");
    expect(folder.rightLabels).toEqual(folder.leftLabels);
    expect(folder.rightLabels).toContain("Paste into this folder");
    const many = await sameMenu(
      () => { click("#list", "one.txt"); click("#list", "two.txt", MODIFIER); rightClick(byName("#list", "two.txt")); },
      () => { click("#dual-list", "one.txt"); click("#dual-list", "two.txt", MODIFIER); rightClick(byName("#dual-list", "two.txt")); },
      "two files",
    );
    expect(many.rightLabels).toEqual(many.leftLabels);
    expect(many.rightLabels).toContain("Rename 2 items…");
    const empty = await sameMenu(() => rightClick($("#list-wrap")), () => rightClick($("#dual-wrap")), "empty space");
    expect(empty.rightLabels).toEqual(empty.leftLabels);
    for (const label of ["New folder", "New file", "Paste", "Select all", "Refresh", "Open this folder in Code editor", "Details", "Date modified", "Folders first", "Properties of this folder"]) expect(empty.rightLabels, label).toContain(label);
  });

  test("Select all, Escape, type-to-jump and Backspace work in the right list and leave the left one alone", async () => {
    focusList("list");
    click("#list", "one.txt");
    focusList("dual-list");
    key($("#dual-list"), "a", MODIFIER);
    expect($$("#dual-list .row.selected").length).toBe(rowNames("#dual-list").length);
    expect($$("#list .row.selected").map((r: any) => r.dataset.key)).toEqual([join(work, "one.txt")]);
    key($("#dual-list"), "Escape");
    expect($$("#dual-list .row.selected").length).toBe(0);
    key($("#dual-list"), "t");
    key($("#dual-list"), "h");
    expect($("#dual-list .row.focused .name-text").textContent).toBe("three.md");
    expect($("#dual-list .row.selected .name-text").textContent).toBe("three.md");
    key($("#dual-list"), "ArrowUp", { altKey: true });
    await until(() => $("#dual-crumbs .crumb.current").textContent === "parity", "the right pane to go up");
    expect(rowNames("#list")).toContain("one.txt");
    await openOnRight(other);
  });

  test("F2 renames in place in the right list, and Undo brings the name back", async () => {
    await until(() => rowNames("#dual-list").includes("only-right.txt"), "the right folder");
    focusList("dual-list");
    click("#dual-list", "only-right.txt");
    const ev = key($("#dual-list"), "F2");
    expect(ev.defaultPrevented).toBe(true);
    await until(() => !!$("#dual-list .rename-input"), "the name box");
    expect($("#dual-list .rename-input").value).toBe("only-right.txt");
    expect($("#list .rename-input")).toBeNull();
    $("#dual-list .rename-input").value = "renamed.txt";
    key($("#dual-list .rename-input"), "Enter");
    await until(() => !!byName("#dual-list", "renamed.txt")?.classList.contains("selected"), "the renamed file to be selected");
    expect(existsSync(join(other, "renamed.txt"))).toBe(true);
    expect(existsSync(join(other, "only-right.txt"))).toBe(false);
    expect(byName("#dual-list", "renamed.txt").classList.contains("selected")).toBe(true);
    key($("#dual-list"), "z", MODIFIER);
    await until(() => existsSync(join(other, "only-right.txt")), "undo of the rename");
  });

  test("New folder from the right pane's menu makes the folder in the right folder and asks for its name there", async () => {
    focusList("dual-list");
    rightClick($("#dual-wrap"));
    await until(() => menuLabels().includes("New folder"), "the folder menu");
    $$(".menu .menu-item").find((b: any) => b.textContent.includes("New folder"))!.click();
    await until(() => !!$("#dual-list .rename-input"), "the name box on the right");
    expect(existsSync(join(other, "New folder"))).toBe(true);
    expect(existsSync(join(work, "New folder"))).toBe(false);
    $("#dual-list .rename-input").value = "made-here";
    key($("#dual-list .rename-input"), "Enter");
    await until(() => rowNames("#dual-list").includes("made-here"), "the new folder to show");
    expect(existsSync(join(other, "made-here"))).toBe(true);
    expect(rowNames("#list")).not.toContain("made-here");
  });

  test("Copy in the left list and Paste in the right pane puts the file in the right folder", async () => {
    writeFileSync(join(work, "left-only.txt"), "L");
    await nav.refresh({ pane: pane.left });
    await until(() => rowNames("#list").includes("left-only.txt"), "the new file in the left list");
    focusList("list");
    click("#list", "left-only.txt");
    key($("#list"), "c", MODIFIER);
    focusList("dual-list");
    key($("#dual-list"), "v", MODIFIER);
    await until(() => rowNames("#dual-list").includes("left-only.txt"), "the pasted file");
    expect(existsSync(join(other, "left-only.txt"))).toBe(true);
    expect(existsSync(join(work, "left-only.txt"))).toBe(true);
  });

  test("Delete in the right pane moves the right selection to the Recycle Bin and leaves the left folder alone", async () => {
    focusList("dual-list");
    click("#dual-list", "left-only.txt");
    const ev = key($("#dual-list"), "Delete");
    expect(ev.defaultPrevented).toBe(true);
    await until(() => !rowNames("#dual-list").includes("left-only.txt"), "the file to leave the right list");
    expect(existsSync(join(other, "left-only.txt"))).toBe(false);
    expect(existsSync(join(work, "left-only.txt"))).toBe(true);
    expect(rowNames("#list")).toContain("left-only.txt");
  });

  test("the toolbar's buttons act on the active pane, and Up goes up in the right pane", async () => {
    const del = () => $("#toolbar button[title^='Move to the Recycle Bin']");
    focusList("list");
    key($("#list"), "Escape");
    focusList("dual-list");
    click("#dual-list", "two.txt");
    expect(del().disabled).toBe(false);
    focusList("list");
    expect(del().disabled).toBe(true);
    focusList("dual-list");
    expect(del().disabled).toBe(false);
    $("#toolbar button[title^='Go up one folder']").click();
    await until(() => $("#dual-crumbs .crumb.current").textContent === "parity", "the right pane to go up");
    expect($("#crumbs .crumb.current").textContent).toBe("work");
    await openOnRight(other);
  });

  test("dropping on a folder row of the right list moves things there", async () => {
    const dnd = await import("../resources/file_manager/ui/dnd.js");
    writeFileSync(join(other, "drag-me.txt"), "d");
    await nav.refresh({ pane: pane.right });
    await until(() => rowNames("#dual-list").includes("drag-me.txt"), "the new file");
    dnd.drag.paths = [join(other, "drag-me.txt")];
    const drop = new win.Event("drop", { bubbles: true, cancelable: true }) as any;
    drop.dataTransfer = { dropEffect: "move" };
    byName("#dual-list", "sub").dispatchEvent(drop);
    await until(() => existsSync(join(other, "sub", "drag-me.txt")), "the file to move into the folder");
    dnd.endDrag();
  });

  test("the right list marks a file that isn't what its name says, like the left one does", async () => {
    const badges = join(work, "badges");
    mkdirSync(badges, { recursive: true });
    writeFileSync(join(badges, "photo.jpg"), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]));
    await openOnRight(badges);
    await until(() => !!$("#dual-list .row .type-badge"), "the warning mark in the right list", 8000);
    expect($("#dual-list .row.has-verdict .type-badge").getAttribute("aria-label")).toBeTruthy();
    await openOnRight(other);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Quick Look (Space) and "copy to the clipboard" in the right-click menu
// ---------------------------------------------------------------------------------------------------------------

// A 24 x 16 animated GIF of 3 frames (made with ffmpeg: testsrc, 5 per second, looping forever).
const TINY_GIF = "R0lGODlhGAAQAPf/MQAAAAAA/wD/BAD/7lk0/4f/AKZv/6a1tP8AAP8A//8pav+zAP/tAP//AP///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wD/ACH/C05FVFNDQVBFMi4wAwEAAAAh+QQEFAAfACwAAAAAGAAQAAAIswABCERAUECCBAESNlgooOGAhw4iCgRAcMBBhAoZNqwY0cHEihcTBljYoKEAjhIHPgyZseRGgh0nPrR4UCRJkwQRAEgJYCbLkRpPEtzpUaDPmi1xDuV5FCNQl0J1Ml2J9KlSqUV7UnV68yVWmVttBs1JFCxNrmOXOiC4YEGDAgVMFnh4wEBCAgQuKsjZdmFch3QNEAiA10ACBYjZuoX7d8DcAwcGBzB8EPFHBGdtFoCK0kFAACH5BAUUAP8ALAEADAAXAAQAAAhAABf8Y/Dvn4CC/wb8O2CAAMIEBRUUFMigQAGECgs2DODQAMR/CBBQJCjgYMEBB/4RCKDyo0QECGPGLNBApsyAAAAh+QQFFAD/ACwAAAwAFwADAAAIOgD/MWDwr4CAfwgHIDRAIMA/AgYQKviHYAHCBggPDjh44AABhP8MJPg3ESSDAgVA/lMYsuHDiCQpBgQAOw==";

describe("Quick Look and copy to the clipboard", () => {
  const qdir = join(home, "qlook");
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const names = () => rowNames("#list");
  const select = (name: string) => rowOf("#list", name).dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const open = (): any => $(".ql");
  const title = () => $(".ql-title")?.textContent;
  const space = () => key($("#list"), " ");
  const menuLabels = () => [...doc.querySelectorAll(".menu [role=menuitem]")].map((i: any) => i.textContent.replace(/\s+/g, " ").trim());
  const rightClick = async (name: string) => {
    rowOf("#list", name).dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    await sleep(100);
  };
  const waitFor = async (test: () => boolean, ms = 3000) => {
    for (let i = 0; i < ms / 40 && !test(); i++) await sleep(40);
    expect(test()).toBe(true);
  };

  beforeAll(async () => {
    mkdirSync(join(qdir, "g-folder"), { recursive: true });
    writeFileSync(join(qdir, "a-picture.png"), PNG);
    writeFileSync(join(qdir, "b-song.mp3"), Buffer.alloc(500, 1));
    writeFileSync(join(qdir, "c-movie.mp4"), Buffer.alloc(500, 2));
    writeFileSync(join(qdir, "d-people.csv"), 'name,city\nAda,"London, UK"\n"Sam ""the man""",Austin\n');
    writeFileSync(join(qdir, "e-notes.txt"), "line one\nline two\n");
    writeFileSync(join(qdir, "f-blob.bin"), Buffer.from([0, 1, 2, 3, 0, 0, 255, 254]));
    writeFileSync(join(qdir, "h-anim.gif"), Buffer.from(TINY_GIF, "base64"));
    // jsdom can't play or load media: give media elements the state a player reads and writes.
    const mp = win.HTMLMediaElement.prototype;
    for (const [k, d] of [["currentTime", 0], ["duration", NaN], ["volume", 1], ["muted", false], ["playbackRate", 1], ["defaultPlaybackRate", 1]] as const) {
      Object.defineProperty(mp, k, { get() { return (this.__m ??= {})[k] ?? d; }, set(v) { (this.__m ??= {})[k] = v; }, configurable: true });
    }
    Object.defineProperty(mp, "paused", { get() { return (this.__m ??= {}).paused !== false; }, configurable: true });
    mp.play = function () { (this.__m ??= {}).paused = false; this.dispatchEvent(new win.Event("play")); return Promise.resolve(); };
    mp.pause = function () { (this.__m ??= {}).paused = true; this.dispatchEvent(new win.Event("pause")); };
    mp.load = function () {};
    alt(1);
    await sleep(300);
    const nav = await import("../resources/file_manager/ui/nav.js");
    await nav.goTo(qdir);
    await waitFor(() => names().includes("e-notes.txt"), 6000);
  });

  afterAll(async () => {
    if (open()) key(doc.activeElement ?? doc.body, "Escape");
    const nav = await import("../resources/file_manager/ui/nav.js");
    await nav.goTo(home);
    await sleep(200);
  });

  test("Space opens Quick Look on the selected file and Space again closes it, putting focus back", async () => {
    select("e-notes.txt");
    $("#list").focus();
    const ev = space();
    expect(ev.defaultPrevented).toBe(true);
    await waitFor(() => !!open() && !!$(".ql-text"));
    expect(open().getAttribute("role")).toBe("dialog");
    expect(open().getAttribute("aria-modal")).toBe("true");
    expect(title()).toBe("e-notes.txt");
    expect($(".ql-text").textContent).toContain("line one");
    key(doc.activeElement, " ");
    expect(open()).toBeNull();
    expect(doc.activeElement.id).toBe("list");
  });

  test("each kind of file gets the right viewer, and sound starts playing by itself", async () => {
    const shows = async (name: string, selector: string) => {
      select(name);
      $("#list").focus();
      space();
      await waitFor(() => !!$(`.ql ${selector}`));
      if (name === "b-song.mp3") {
        expect($(".ql .mp-media").getAttribute("src")).toContain("/api/raw?path=");
        await waitFor(() => !$(".ql .mp-media").paused);
      }
      key(doc.activeElement, "Escape");
      expect(open()).toBeNull();
    };
    await shows("a-picture.png", "img.ql-image");
    await shows("b-song.mp3", ".mp");
    await shows("c-movie.mp4", ".mp.is-video");
    await shows("d-people.csv", "table.ql-table");
    await shows("f-blob.bin", ".ql-card");
    await shows("g-folder", ".ql-card");
  });

  test("a CSV is drawn as a table with its header and quoted cells right", async () => {
    select("d-people.csv");
    $("#list").focus();
    space();
    await waitFor(() => !!$(".ql table"));
    expect([...doc.querySelectorAll(".ql th")].map((e: any) => e.textContent)).toEqual(["name", "city"]);
    expect([...doc.querySelectorAll(".ql td")].map((e: any) => e.textContent)).toEqual(["Ada", "London, UK", 'Sam "the man"', "Austin"]);
    key(doc.activeElement, "Escape");
  });

  test("arrow keys move through the list and its selection, stop at the ends; Home and End jump", async () => {
    const all = names();
    const at = all.indexOf("d-people.csv");
    expect(at).toBeGreaterThan(0);
    expect(all[at + 1]).toBe("e-notes.txt");
    select("d-people.csv");
    $("#list").focus();
    space();
    await waitFor(() => !!open());
    expect($(".ql-count").textContent).toBe(`${at + 1} of ${all.length}`);
    const k = (name: string) => key(doc.activeElement, name);
    k("ArrowRight");
    expect(title()).toBe("e-notes.txt");
    expect(rowOf("#list", "e-notes.txt").getAttribute("aria-selected")).toBe("true");
    k("ArrowLeft");
    k("ArrowDown");
    k("ArrowUp");
    expect(title()).toBe("d-people.csv");
    k("End");
    expect(title()).toBe(all.at(-1));
    k("ArrowRight");
    expect(title()).toBe(all.at(-1));
    k("Home");
    expect(title()).toBe(all[0]);
    k("ArrowLeft");
    expect(title()).toBe(all[0]);
    k("Escape");
    expect(open()).toBeNull();
    expect(rowOf("#list", all[0]!).getAttribute("aria-selected")).toBe("true");
  });

  test("while it is open the list underneath gets no keys (no typing to find, no delete)", async () => {
    select("e-notes.txt");
    $("#list").focus();
    space();
    await waitFor(() => !!open());
    key(doc.activeElement, "Delete");
    key(doc.activeElement, "a");
    expect(title()).toBe("e-notes.txt");
    expect(names()).toContain("e-notes.txt");
    key(doc.activeElement, "Escape");
  });

  test("a click outside, or the Close button, closes it", async () => {
    select("e-notes.txt");
    $("#list").focus();
    space();
    await waitFor(() => !!open());
    $(".ql-backdrop").dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    expect(open()).toBeNull();
    space();
    await waitFor(() => !!open());
    [...doc.querySelectorAll(".ql button")].find((b: any) => b.textContent === "Close").click();
    expect(open()).toBeNull();
  });

  test("the right-click menu offers Quick Look, Copy image for pictures and Copy text for text files, and they reach the clipboard", async () => {
    select("a-picture.png");
    await rightClick("a-picture.png");
    expect(menuLabels().some((l: string) => l.includes("Quick Look") && l.includes("Space"))).toBe(true);
    expect(menuLabels().some((l: string) => l.includes("Copy image to clipboard"))).toBe(true);
    expect(menuLabels().some((l: string) => l.includes("Copy text to clipboard"))).toBe(false);
    [...doc.querySelectorAll(".menu [role=menuitem]")].find((i: any) => i.textContent.includes("Copy image to clipboard")).click();
    await waitFor(() => !!clip.image);
    expect(clip.image).toEqual({ file: join(qdir, "a-picture.png"), mime: "image/png" });

    select("e-notes.txt");
    await rightClick("e-notes.txt");
    expect(menuLabels().some((l: string) => l.includes("Copy text to clipboard"))).toBe(true);
    expect(menuLabels().some((l: string) => l.includes("Copy image to clipboard"))).toBe(false);
    [...doc.querySelectorAll(".menu [role=menuitem]")].find((i: any) => i.textContent.includes("Copy text to clipboard")).click();
    await waitFor(() => clip.text !== undefined);
    expect(clip.text).toBe("line one\nline two\n");
  });

  test("a folder, a binary file and a two-item selection get neither copy item", async () => {
    select("g-folder");
    await rightClick("g-folder");
    expect(menuLabels().filter((l: string) => /to clipboard/.test(l))).toEqual([]);
    key(doc.activeElement, "Escape");
    select("f-blob.bin");
    await rightClick("f-blob.bin");
    expect(menuLabels().filter((l: string) => /to clipboard/.test(l))).toEqual([]);
    key(doc.activeElement, "Escape");
    select("a-picture.png");
    rowOf("#list", "e-notes.txt").dispatchEvent(new win.MouseEvent("click", { bubbles: true, ...MODIFIER }));
    await rightClick("e-notes.txt");
    expect(menuLabels().filter((l: string) => /to clipboard/.test(l))).toEqual([]);
    key(doc.activeElement, "Escape");
  });

  test("Quick Look has a Copy button that follows the file in view", async () => {
    clip.text = undefined;
    select("e-notes.txt");
    $("#list").focus();
    space();
    await waitFor(() => !!$(".ql-text"));
    const btn = () => [...doc.querySelectorAll(".ql-head button")].find((b: any) => /^Copy/.test(b.textContent)) as any;
    expect(btn().hidden).toBe(false);
    expect(btn().textContent).toBe("Copy text");
    btn().click();
    await waitFor(() => clip.text !== undefined);
    expect(clip.text as string | undefined).toBe("line one\nline two\n");
    key(doc.activeElement, "End");
    await waitFor(() => !$(".ql-text"));
    expect(btn().hidden).toBe(true);
    key(doc.activeElement, "Escape");
  });

  test("a sound opens the player: Space plays and pauses, N moves to the next sound or video and Quick Look follows, Esc closes and stops it", async () => {
    select("b-song.mp3");
    $("#list").focus();
    space();
    await waitFor(() => !!$(".ql .mp") && !$(".ql .mp-media").paused);
    const media = () => $(".ql .mp-media");
    expect($(".mp-queue").children.length).toBe(2); // the sound and the video of this folder
    key(doc.activeElement, " ");
    expect(media().paused).toBe(true);
    key(doc.activeElement, " ");
    expect(media().paused).toBe(false);
    key(doc.activeElement, "n");
    await waitFor(() => title() === "c-movie.mp4");
    expect(rowOf("#list", "c-movie.mp4").getAttribute("aria-selected")).toBe("true");
    expect($(".ql .mp.is-video")).not.toBeNull();
    key(doc.activeElement, "b");
    await waitFor(() => title() === "b-song.mp3");
    const el = media();
    key(doc.activeElement, "Escape");
    expect(open()).toBeNull();
    expect(el.getAttribute("src")).toBeNull();
    expect(el.paused).toBe(true);
  });

  test("the player's keys: seek, volume, speed, mute, shuffle and repeat, and its buttons say what they do", async () => {
    select("b-song.mp3");
    $("#list").focus();
    space();
    await waitFor(() => !!$(".ql .mp"));
    const media = $(".ql .mp-media");
    Object.defineProperty(media, "duration", { value: 100, configurable: true });
    const k = (name: string, extra: Record<string, unknown> = {}) => key(doc.activeElement, name, extra);
    k("ArrowRight");
    expect(media.currentTime).toBe(5);
    k("ArrowRight", { shiftKey: true });
    expect(media.currentTime).toBe(35);
    k("ArrowLeft");
    expect(media.currentTime).toBe(30);
    k("5");
    expect(media.currentTime).toBe(50);
    const before = media.volume;
    k("ArrowDown");
    expect(media.volume).toBeCloseTo(before - 0.05, 2);
    k("ArrowUp");
    expect(media.volume).toBeCloseTo(before, 2);
    k("]");
    expect(media.playbackRate).toBe(1.25);
    k("[");
    k("[");
    expect(media.playbackRate).toBe(0.75);
    k("m");
    expect(media.muted).toBe(true);
    k("s");
    expect($(".mp-btn[aria-label=Shuffle]").getAttribute("aria-pressed")).toBe("true");
    k("r");
    expect($(".mp-btn[aria-label^=Repeat]").getAttribute("aria-label")).toBe("Repeat: all");
    k("r");
    expect($(".mp-btn[aria-label^=Repeat]").getAttribute("aria-label")).toBe("Repeat: this one");
    for (const b of doc.querySelectorAll(".mp button")) expect(b.getAttribute("aria-label") || b.textContent.trim(), b.outerHTML.slice(0, 80)).toBeTruthy();
    expect(doc.querySelector(".mp-seek").getAttribute("aria-label")).toBe("Position");
    k("s");
    k("r");
    k("Escape");
    expect(open()).toBeNull();
  });

  test("the equalizer and queue panels open from the keyboard and the equalizer has ten labeled bands", async () => {
    select("b-song.mp3");
    $("#list").focus();
    space();
    await waitFor(() => !!$(".ql .mp"));
    key(doc.activeElement, "e");
    expect($(".mp-panel:not([hidden])")).not.toBeNull();
    expect(doc.querySelectorAll(".mp-band").length).toBe(10);
    for (const band of doc.querySelectorAll(".mp-band")) expect(band.getAttribute("aria-label")).toMatch(/gain$/);
    key(doc.activeElement, "q");
    expect(doc.querySelector(".mp-queue").closest(".mp-panel").hidden).toBe(false);
    key(doc.activeElement, "q");
    expect($(".mp-panel:not([hidden])")).toBeNull();
    key(doc.activeElement, "Escape");
  });

  test("the player loads Windows-style local lyrics, switches sources and toggles them with L", async () => {
    const dir = join(home, "Lyrics with spaces");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "song.mp3"), Buffer.alloc(500, 1));
    writeFileSync(join(dir, "song.LRC"), "\uFEFF[00:01.00]Local verse\r\nSecond line\r\n");
    writeFileSync(join(dir, "song.en.txt"), "Alternate verse\r\n");
    const nav = await import("../resources/file_manager/ui/nav.js");
    try {
      await nav.goTo(dir);
      await waitFor(() => names().includes("song.mp3"));
      select("song.mp3");
      $("#list").focus();
      space();
      await waitFor(() => $(".mp-select[aria-label='Lyrics source']")?.options.length === 2);
      const button = $(".mp-btn[aria-label='Show lyrics (L)']");
      expect(button.hidden).toBe(false);
      key(doc.activeElement, "l");
      expect($(".mp-lyrics").closest(".mp-panel").hidden).toBe(false);
      const sources = $(".mp-select[aria-label='Lyrics source']");
      sources.value = String([...sources.options].findIndex((option: any) => option.text === "song.LRC"));
      sources.dispatchEvent(new win.Event("change", { bubbles: true }));
      expect($(".mp-lyrics").textContent).toBe("[00:01.00]Local verse\r\nSecond line");
      sources.value = String([...sources.options].findIndex((option: any) => option.text === "song.en.txt"));
      sources.dispatchEvent(new win.Event("change", { bubbles: true }));
      expect($(".mp-lyrics").textContent).toBe("Alternate verse");
      key(doc.activeElement, "l");
      expect($(".mp-lyrics").closest(".mp-panel").hidden).toBe(true);
      expect($(".mp-message").textContent).toBe("");
    } finally {
      if (open()) key(doc.activeElement, "Escape");
      await nav.goTo(qdir);
    }
  });

  test("a text file gets Copy text, Convert…, Edit, Open and More; Convert and Edit step aside for what they open", async () => {
    select("e-notes.txt");
    $("#list").focus();
    space();
    await waitFor(() => !!$(".ql-text"));
    const shown = () => [...doc.querySelectorAll(".ql-head button")].filter((b: any) => !b.hidden).map((b: any) => b.textContent.trim());
    expect(shown()).toEqual(["Copy text", "Convert…", "Edit", "Open", "More ▾", "Close"]);
    [...doc.querySelectorAll(".ql-head button")].find((b: any) => b.textContent.trim() === "More ▾").click();
    await sleep(100);
    const items = [...doc.querySelectorAll(".menu [role=menuitem]")].map((i: any) => i.textContent.replace(/\s+/g, " ").trim());
    for (const wanted of ["Copy path", "Open with…", "Show in", "Properties…", "More info…"]) expect(items.some((l: string) => l.includes(wanted)), wanted).toBe(true);
    key(doc.activeElement, "Escape");
    await sleep(50);
    expect(open()).not.toBeNull();
    [...doc.querySelectorAll(".ql-head button")].find((b: any) => b.textContent.trim() === "Convert…").click();
    expect(open()).toBeNull();
    await waitFor(() => !!doc.querySelector(".modal-backdrop"));
    key(doc.activeElement, "Escape");
    await waitFor(() => !doc.querySelector(".modal-backdrop"));
    // A picture has Edit in Studio instead of Edit; a folder has no Convert.
    select("a-picture.png");
    $("#list").focus();
    space();
    await waitFor(() => !!$(".ql-image"));
    expect(shown()).toEqual(["Copy picture", "Convert…", "Edit in Studio", "Open", "More ▾", "Close"]);
    key(doc.activeElement, "Escape");
    select("g-folder");
    $("#list").focus();
    space();
    await waitFor(() => !!$(".ql-card"));
    expect(shown()).toEqual(["Open", "More ▾", "Close"]);
    key(doc.activeElement, "Escape");
  });

  test("with nothing selected and nothing focused, Space doesn't open an empty window", async () => {
    const state = (await import("../resources/file_manager/ui/state.js")).state;
    state.selection.clear();
    ((await import("../resources/file_manager/ui/pane.js")).activePane() as any).focusKey = null;
    $("#list").focus();
    space();
    await sleep(150);
    expect(open()).toBeNull();
  });

  test("an animated GIF opens in a viewer: play and pause, frame by frame, loop, and closing stops it", async () => {
    // jsdom has no canvas: give the viewer one that counts the frames it is asked to draw.
    const g = globalThis as any;
    const proto = win.HTMLCanvasElement.prototype;
    const oldGetContext = proto.getContext;
    const hadImageData = "ImageData" in g;
    const drawn: number[] = [];
    proto.getContext = () => ({ putImageData: (img: any) => drawn.push(img.data[0]), drawImage() {}, fillRect() {} });
    g.ImageData = class { constructor(public data: any, public width: number, public height: number) {} };
    try {
      select("h-anim.gif");
      $("#list").focus();
      space();
      await waitFor(() => !!$(".gv-bar"));
      expect(title()).toBe("h-anim.gif");
      await waitFor(() => /frames/.test($(".ql-sub").textContent));
      expect($(".ql-sub").textContent).toContain("24 × 16");
      const label = () => $(".gv-label").textContent;
      const playBtn = () => $(".gv-bar [data-role=play]");
      expect(label()).toMatch(/^Frame 1 of \d+/);
      expect(playBtn().getAttribute("aria-label")).toBe("Pause (Space)"); // it starts playing
      key(doc.activeElement ?? doc.body, " ");
      expect(playBtn().getAttribute("aria-label")).toBe("Play (Space)");
      expect(open()).toBeTruthy(); // Space paused it instead of closing the window
      key(doc.activeElement ?? doc.body, ".", { code: "Period" });
      expect(label()).toMatch(/^Frame 2 of/);
      key(doc.activeElement ?? doc.body, ",", { code: "Comma" });
      expect(label()).toMatch(/^Frame 1 of/);
      key(doc.activeElement ?? doc.body, ",", { code: "Comma" }); // wraps round to the last frame
      expect(label()).toMatch(/^Frame \d+ of (\d+)/);
      const scrub = $(".gv-scrub");
      scrub.value = "1";
      scrub.dispatchEvent(new win.Event("input", { bubbles: true }));
      expect(label()).toMatch(/^Frame 2 of/);
      // playing again moves on by itself, and loops
      const before = drawn.length;
      key(doc.activeElement ?? doc.body, " ");
      await sleep(900);
      expect(drawn.length).toBeGreaterThan(before + 2);
      key(doc.activeElement ?? doc.body, "Escape");
      await sleep(50);
      expect(open()).toBeNull();
      const stopped = drawn.length;
      await sleep(500);
      expect(drawn.length).toBe(stopped); // nothing keeps drawing after it is closed
    } finally {
      proto.getContext = oldGetContext;
      if (!hadImageData) delete g.ImageData;
      if (open()) key(doc.activeElement ?? doc.body, "Escape");
    }
  });

  test("pressing Space on a Markdown file opens formatted Markdown with GitHub-style Outline navigation and toggles Preview / Plain text via buttons or P; non-browser images (PPM) preview as images", async () => {
    const dir = join(home, "QuickLook Markdown and Images");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "icon.ppm"), "P3\n1 1\n255\n0 255 0\n");
    writeFileSync(
      join(dir, "readme.md"),
      "# Project Title\n\nWelcome to [Example](https://example.com) with ![Icon](./icon.ppm).\n\n## Features\n- Fast\n",
    );
    const nav = await import("../resources/file_manager/ui/nav.js");
    try {
      await nav.goTo(dir);
      await waitFor(() => names().includes("readme.md"));
      select("readme.md");
      $("#list").focus();
      space();
      await waitFor(() => !!$(".ql .code-md-toolbar"));

      const mdContent = () => $(".ql .code-md-content");
      const plainPre = () => $(".ql pre.ql-text");
      expect(mdContent().hidden).toBe(false);
      expect(plainPre().hidden).toBe(true);
      expect($(".ql .code-md-toolbar").textContent).toContain("Outline (2)");

      // Toggle to Plain text with the P key
      key(doc.activeElement ?? doc.body, "p");
      expect(mdContent().hidden).toBe(true);
      expect(plainPre().hidden).toBe(false);
      expect(plainPre().textContent).toContain("# Project Title");

      // Toggle back to Preview with the P key
      key(doc.activeElement ?? doc.body, "p");
      expect(mdContent().hidden).toBe(false);
      expect(plainPre().hidden).toBe(true);

      // Toggle via the Plain text button in the toolbar
      const plainBtn = [...doc.querySelectorAll(".ql .code-md-mode-btn")].find((b: any) => b.textContent === "Plain text") as any;
      plainBtn.click();
      expect(mdContent().hidden).toBe(true);
      expect(plainPre().hidden).toBe(false);

      key(doc.activeElement ?? doc.body, "Escape");
      expect(open()).toBeNull();

      // Space on non-browser image (icon.ppm) opens image preview
      select("icon.ppm");
      $("#list").focus();
      space();
      await waitFor(() => !!$(".ql img.ql-image"));
      expect(decodeURIComponent($(".ql img.ql-image").getAttribute("src") || "")).toContain("icon.ppm");
      key(doc.activeElement ?? doc.body, "Escape");
      expect(open()).toBeNull();
    } finally {
      if (open()) key(doc.activeElement ?? doc.body, "Escape");
      await nav.goTo(qdir);
    }
  });

  describe("opening text files (the Open setting)", () => {
    const entry = (name: string, extra: Record<string, unknown> = {}) => ({ path: join(qdir, name), name, isDir: false, program: false, size: 10, ...extra });
    const setting = async (value: string) => {
      const nav = await import("../resources/file_manager/ui/nav.js");
      await nav.saveSettings({ textOpensIn: value });
      await savedWhen("textOpensIn", value);
    };

    test("what counts as a text file: known endings, source and dotfiles; not pictures, programs or unknown binaries", async () => {
      const ops = await import("../resources/file_manager/ui/ops.js");
      const yes = ["notes.txt", "a.ts", "main.py", "README.md", "data.json", "style.css", "index.html", "Makefile", "Dockerfile", ".env", ".gitignore", "UPPER.TXT", "LICENSE", "License", "LICENSE-MIT", "NOTICE", "CHANGELOG", "COPYING", "AUTHORS", "Brewfile", ".editorconfig", ".npmrc", "README"];
      const no = ["pic.png", "song.mp3", "doc.pdf", "archive.zip", "blob.bin", "noextension", ".DS_Store", "setup.exe", "run.sh"];
      for (const n of yes) expect(ops.textOpensInEditor(entry(n)), n).toBe(true);
      for (const n of no) expect(ops.textOpensInEditor(entry(n, n.endsWith(".sh") || n.endsWith(".exe") ? { program: true } : {})), n).toBe(false);
      expect(ops.textOpensInEditor({ ...entry("folder.txt"), isDir: true })).toBe(false);
    });

    test("with 'My code editor' chosen, the text file goes to that editor and nothing else starts", async () => {
      const ops = await import("../resources/file_manager/ui/ops.js");
      await setting("editor");
      launched.length = 0;
      editorStarts.length = 0;
      await ops.openEntry(entry("e-notes.txt"));
      await waitFor(() => editorStarts.length === 1);
      expect(editorStarts[0]!.path).toBe(join(qdir, "e-notes.txt"));
      expect(launched).toEqual([]);
    });

    test("with 'The program my computer uses' chosen, it is handed to the computer", async () => {
      const ops = await import("../resources/file_manager/ui/ops.js");
      await setting("system");
      launched.length = 0;
      editorStarts.length = 0;
      await ops.openEntry(entry("e-notes.txt"));
      await waitFor(() => launched.length === 1);
      expect(launched[0]!.args).toContain(join(qdir, "e-notes.txt"));
      expect(editorStarts).toEqual([]);
      await setting("builtin");
    });

    test("pictures, sound and video open in the File Manager's viewer by default; Quick Look's Open or the setting hands them to the computer", async () => {
      const ops = await import("../resources/file_manager/ui/ops.js");
      const nav = await import("../resources/file_manager/ui/nav.js");
      for (const n of ["a.png", "b.JPG", "c.webp", "d.svg", "e.mp3", "f.flac", "g.mp4", "h.mov", "i.gif"]) expect(ops.mediaOpensInManager(entry(n)), n).toBe(true);
      for (const n of ["doc.pdf", "notes.txt", "archive.zip", "noext", "photo.psd"]) expect(ops.mediaOpensInManager(entry(n)), n).toBe(false);
      expect(ops.mediaOpensInManager({ ...entry("x.mp4"), isDir: true })).toBe(false);
      expect(ops.mediaOpensInManager(entry("x.png", { program: true }))).toBe(false);
      launched.length = 0;
      await ops.openEntry(entry("a-picture.png"));
      await waitFor(() => !!open());
      expect(open().textContent).toContain("a-picture.png");
      expect(launched).toEqual([]);
      key(doc.activeElement ?? doc.body, "Enter"); // Quick Look's own Open still uses the computer's program
      await waitFor(() => launched.length === 1);
      expect(launched[0]!.args).toContain(join(qdir, "a-picture.png"));
      expect(open()).toBeFalsy();
      await nav.saveSettings({ mediaOpensIn: "system" });
      await savedWhen("mediaOpensIn", "system");
      expect(ops.mediaOpensInManager(entry("b-song.mp3"))).toBe(false);
      launched.length = 0;
      await ops.openEntry(entry("b-song.mp3"));
      await waitFor(() => launched.length === 1);
      expect(launched[0]!.args).toContain(join(qdir, "b-song.mp3"));
      expect(open()).toBeFalsy();
      await nav.saveSettings({ mediaOpensIn: "manager" });
      await savedWhen("mediaOpensIn", "manager");
    });

    test("Settings has the choice, saved as soon as it changes", async () => {
      const extras = await import("../resources/file_manager/ui/extras.js");
      extras.showSettings();
      await waitFor(() => !!doc.querySelector(".modal-backdrop select[aria-label='Open text files with']"));
      const select = doc.querySelector("select[aria-label='Open text files with']");
      expect([...select.options].map((o: any) => o.value)).toEqual(["builtin", "editor", "system"]);
      expect(select.value).toBe("builtin");
      select.value = "system";
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
      await savedWhen("textOpensIn", "system");
      select.value = "builtin";
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
      await savedWhen("textOpensIn", "builtin");
      const media = doc.querySelector("select[aria-label='Open pictures, sound and video with']");
      expect([...media.options].map((o: any) => o.value)).toEqual(["manager", "system"]);
      expect(media.value).toBe("manager");
      media.value = "system";
      media.dispatchEvent(new win.Event("change", { bubbles: true }));
      await savedWhen("mediaOpensIn", "system");
      media.value = "manager";
      media.dispatchEvent(new win.Event("change", { bubbles: true }));
      await savedWhen("mediaOpensIn", "manager");
      key(doc.activeElement ?? doc.body, "Escape");
    });
  });
});

describe("changing keyboard shortcuts", () => {
  // "Mod" is Command on a Mac and Control elsewhere: use what the page itself decided.
  let MOD: Record<string, boolean> = { ctrlKey: true };
  beforeAll(async () => {
    MOD = (await import("../resources/file_manager/ui/state.js")).state.platform === "darwin" ? { metaKey: true } : { ctrlKey: true };
  });
  const stateOf = async () => (await import("../resources/file_manager/ui/state.js")).state;
  const nav = async () => await import("../resources/file_manager/ui/nav.js");
  const viewNow = async () => (await stateOf()).settings.view;

  test("a changed shortcut works and the old one stops", async () => {
    await (await nav()).saveSettings({ view: "details", shortcuts: { "view.list": ["Mod+Shift+L"] } });
    key(doc.body, "2", { ...MOD, code: "Digit2" });
    expect(await viewNow()).toBe("details");
    key(doc.body, "l", { ...MOD, shiftKey: true, code: "KeyL" });
    expect(await viewNow()).toBe("list");
    await (await nav()).saveSettings({ view: "details", shortcuts: {} });
    key(doc.body, "2", { ...MOD, code: "Digit2" });
    expect(await viewNow()).toBe("list");
    await (await nav()).saveSettings({ view: "details" });
  });

  test("a shortcut that is switched off does nothing", async () => {
    await (await nav()).saveSettings({ view: "details", shortcuts: { "view.icons": [] } });
    key(doc.body, "3", { ...MOD, code: "Digit3" });
    expect(await viewNow()).toBe("details");
    await (await nav()).saveSettings({ shortcuts: {} });
  });

  test("the dialog refuses a key that another action uses, then accepts a free one, and Reset puts it back", async () => {
    const { showShortcutsDialog } = await import("../resources/file_manager/ui/shortcutsDialog.js");
    const dlg = showShortcutsDialog();
    await sleep(50);
    const row = (id: string) => doc.querySelector(`.shortcut-row[data-action="${id}"]`);
    const status = () => doc.querySelector(".shortcut-status").textContent;
    const press = (k: string, extra: Record<string, unknown>) => win.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra }));
    expect(doc.querySelectorAll(".shortcut-row").length).toBeGreaterThan(60);
    expect(doc.body.textContent).toContain("Fixed keys");

    row("view.details").querySelector(".shortcut-chip").click();
    expect(row("view.details").querySelector(".shortcut-chip").textContent).toContain("Press");
    press("2", { ...MOD, code: "Digit2" }); // Mod+2 belongs to "List view"
    await sleep(50);
    expect(status()).toContain("already used");
    expect(status()).toContain("List view");
    expect((await savedSettings()).shortcuts ?? {}).toEqual({});

    row("view.details").querySelector(".shortcut-chip").click();
    press("l", { ...MOD, shiftKey: true, code: "KeyL" });
    await sleep(80);
    expect(status()).toContain("is now");
    expect(row("view.details").querySelector(".shortcut-chip").textContent).toMatch(/L/);
    expect(((await stateOf()).settings as any).shortcuts["view.details"]).toEqual(["Mod+Shift+L"]);
    await sleep(250);
    expect((await savedSettings()).shortcuts).toEqual({ "view.details": ["Mod+Shift+L"] });

    // a plain letter is for typing; Esc cancels without closing the dialog
    row("view.list").querySelector(".shortcut-chip").click();
    press("q", { code: "KeyQ" });
    await sleep(50);
    expect(status()).toContain("typing");
    row("view.list").querySelector(".shortcut-chip").click();
    press("Escape", { code: "Escape" });
    await sleep(30);
    expect(status()).toContain("Cancelled");
    expect(doc.querySelector(".shortcut-list")).toBeTruthy();

    row("view.details").querySelector(".shortcut-reset").click();
    await sleep(80);
    expect(((await stateOf()).settings as any).shortcuts).toEqual({});
    dlg.close();
    await sleep(50);
  });

  test("the help list shows the keys that are in force", async () => {
    await (await nav()).saveSettings({ shortcuts: { "file.rename": ["Mod+Alt+R"] } });
    const { showHelp } = await import("../resources/file_manager/ui/extras.js");
    showHelp();
    await sleep(50);
    const rows = [...doc.querySelectorAll("table.keys tr")] as any[];
    const rename = rows.find((r) => r.children[0].textContent === "Rename");
    expect(rename.children[1].textContent).toMatch(/R/);
    expect(rename.children[1].textContent).not.toContain("F2");
    key(doc.activeElement ?? doc.body, "Escape");
    await (await nav()).saveSettings({ shortcuts: {} });
  });
});

describe("the QR tool", () => {
  const stubCanvas = () => {
    const proto = win.HTMLCanvasElement.prototype;
    const old = proto.getContext;
    const filled: number[] = [];
    proto.getContext = () => ({ fillRect: () => filled.push(1), putImageData() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }), set fillStyle(_v: string) {}, set strokeStyle(_v: string) {}, set lineWidth(_v: number) {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {} });
    return { filled, restore: () => { proto.getContext = old; } };
  };
  const type = (id: string, value: string) => {
    const el = doc.querySelector(`#qr-${id}`);
    el.value = value;
    el.dispatchEvent(new win.Event("input", { bubbles: true }));
  };

  test("it is one of the tools, in the Handy group, and its tab and Home tile exist", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    const tab = power.listPowerTabs().find((t: any) => t.id === "qr");
    expect(tab).toMatchObject({ label: "QR", group: "handy" });
    expect(power.listPowerTabs().map((t: any) => t.id).indexOf("qr")).toBeGreaterThan(power.listPowerTabs().map((t: any) => t.id).indexOf("timer"));
  });

  test("making a code: fields, live checks, readable explanations, and a self-check that it reads back", async () => {
    const canvas = stubCanvas();
    try {
      const power = await import("../resources/file_manager/ui/power.js");
      power.openPower("qr");
      await sleep(200);
      const root = doc.querySelector(".qr-root");
      expect(root).toBeTruthy();
      expect(root.querySelector("[role=tablist]").textContent).toContain("Read a QR code");
      // text: nothing typed yet
      expect(doc.querySelector(".qr-message").textContent).toContain("Type or paste");
      expect(doc.querySelector(".qr-actions button").disabled).toBe(true);
      type("text-text", "https://example.com/hello");
      await sleep(30);
      expect(doc.querySelector(".qr-facts").textContent).toMatch(/Version 2/);
      expect(doc.querySelector(".qr-check").textContent).toContain("reads back as exactly this");
      expect(doc.querySelector(".qr-actions button").disabled).toBe(false);
      expect(canvas.filled.length).toBeGreaterThan(10);
      // Wi-Fi: a short password is explained, a good one makes a code
      const select = doc.querySelector(".qr-left select");
      select.value = "wifi";
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
      type("wifi-ssid", "Home Net");
      type("wifi-password", "short");
      expect(doc.querySelector(".qr-message").textContent).toContain("8 to 63");
      expect(doc.querySelector(".qr-actions button").disabled).toBe(true);
      type("wifi-password", "correct horse battery");
      expect(doc.querySelector(".qr-message").textContent).toBe("");
      expect(doc.querySelector(".qr-check").textContent).toContain("✓");
      expect((doc.querySelector("#qr-wifi-password") as any).type).toBe("password");
      // too much data is a sentence, not a crash
      select.value = "text";
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
      type("text-text", "x".repeat(4000));
      expect(doc.querySelector(".qr-message").textContent).toContain("too much");
      type("text-text", "ok");
      expect(doc.querySelector(".qr-message").textContent).toBe("");
      expect(doc.body.textContent).not.toContain("null");
    } finally {
      canvas.restore();
    }
  });

  test("a color choice that a scanner can't read is flagged", async () => {
    const canvas = stubCanvas();
    try {
      const details = doc.querySelector(".qr-more");
      const [fg, bg] = [...details.querySelectorAll("input[type=color]")] as any[];
      fg.value = "#777777";
      fg.dispatchEvent(new win.Event("input", { bubbles: true }));
      bg.value = "#808080";
      bg.dispatchEvent(new win.Event("input", { bubbles: true }));
      expect(doc.querySelector(".qr-warn").textContent).toContain("too close");
      fg.value = "#ffffff";
      fg.dispatchEvent(new win.Event("input", { bubbles: true }));
      bg.value = "#000000";
      bg.dispatchEvent(new win.Event("input", { bubbles: true }));
      expect(doc.querySelector(".qr-warn").textContent).toContain("inverted");
      fg.value = "#000000";
      fg.dispatchEvent(new win.Event("input", { bubbles: true }));
      bg.value = "#ffffff";
      bg.dispatchEvent(new win.Event("input", { bubbles: true }));
      expect(doc.querySelector(".qr-warn").textContent).toBe("");
    } finally {
      canvas.restore();
    }
  });

  test("the Read page explains itself and has a keyboard-reachable drop area", async () => {
    const tabs = [...doc.querySelectorAll(".qr-tab")] as any[];
    tabs[1].click();
    expect(doc.querySelector(".qr-readgrid").hidden).toBe(false);
    expect(doc.querySelector(".qr-grid").hidden).toBe(true);
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    const drop = doc.querySelector(".qr-drop");
    expect(drop.getAttribute("tabindex")).toBe("0");
    expect(drop.getAttribute("aria-label")).toContain("Drop a picture");
    expect(doc.querySelector(".qr-readgrid .qr-message").textContent).toContain("Choose a picture");
    tabs[0].click();
    expect(doc.querySelector(".qr-grid").hidden).toBe(false);
  });
});

describe("the Themes button in the ribbon", () => {
  const labels = () => [...doc.querySelectorAll(".menu .menu-item")].map((i: any) => i.textContent.replace(/\s+/g, " ").trim());
  const item = (text: string): any => [...doc.querySelectorAll(".menu .menu-item")].find((i: any) => i.textContent.includes(text));
  const open = async () => {
    $("#tool-themes").click();
    await sleep(150);
  };
  const stateNow = async () => (await import("../resources/file_manager/ui/state.js")).state;

  test("there is a Themes button next to Settings and a quick-access Themes button next to Dual in the top bar", async () => {
    const btn = $("#tool-themes");
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-label")).toBe("Themes");
    expect(btn.title).toContain("colors");
    expect(btn.querySelector(".ti").textContent).toBe("🎨");
    expect(btn.nextElementSibling?.id).toBe("tool-settings");

    const vbBtn = $("#viewbar-themes");
    expect(vbBtn).toBeTruthy();
    expect(vbBtn.getAttribute("aria-label")).toBe("Themes");
    expect(vbBtn.title).toContain("colors");
    expect(vbBtn.previousElementSibling?.id).toBe("view-switch");
    expect(vbBtn.querySelector(".vb-icon").textContent).toBe("🎨");
    expect(vbBtn.querySelector(".vb-label").textContent).toBe("Themes");
    vbBtn.click();
    await sleep(150);
    expect(labels().join("|")).toContain("All themes…");
    key(doc.activeElement ?? doc.body, "Escape");
    await sleep(60);
  });

  test("the menu changes between standard light and dark without Settings", async () => {
    await open();
    expect(labels().slice(0, 3).map((l) => l.replace(/^✓\s*/, ""))).toEqual(["Standard: follow my computer", "Standard light", "Standard dark"]);
    expect(labels().join("|")).toContain("All themes…");
    expect(labels().join("|")).toContain("Make my own theme…");
    item("Standard dark").click();
    await sleep(250);
    const st = await stateNow();
    expect(st.settings.theme).toBe("dark");
    expect(st.settings.palette).toBe("");
    expect(doc.documentElement.dataset.theme).toBe("dark");
    await open();
    expect(item("Standard dark").getAttribute("aria-checked") ?? item("Standard dark").className).toBeTruthy();
    item("Standard: follow my computer").click();
    await sleep(250);
    expect((await stateNow()).settings.theme).toBe("auto");
  });

  test("a theme that was chosen shows up in the menu as a recent one, and is marked as the one in use", async () => {
    const { call } = await import("../resources/file_manager/ui/api.js");
    const themes = ((await call("themes/list")) as any).themes;
    expect(themes.length).toBeGreaterThan(50);
    const { chooseTheme } = await import("../resources/file_manager/ui/themes.js");
    // the recent themes are kept in the window's own storage, which the test page lends to the code
    const g = globalThis as any;
    const hadStorage = "localStorage" in g;
    g.localStorage = win.localStorage;
    win.localStorage.removeItem("fm_recent_themes");
    await chooseTheme(themes[3].key);
    await sleep(400);
    await open();
    expect(labels().join("|")).toContain(themes[3].name);
    expect(doc.documentElement.dataset.palette).toBe(themes[3].key);
    item(themes[3].name).click(); // choosing the one in use again changes nothing
    await sleep(100);
    await open();
    item("Standard: follow my computer").click();
    await sleep(400);
    expect((await stateNow()).settings.palette).toBe("");
    expect(doc.documentElement.dataset.palette).toBeUndefined();
    expect(JSON.parse(win.localStorage.getItem("fm_recent_themes"))).toEqual([themes[3].key]);
    if (!hadStorage) delete g.localStorage;
  });

  test("All themes… opens the gallery and Make my own theme… opens the editor", async () => {
    await open();
    item("All themes…").click();
    await sleep(500);
    expect(doc.querySelector(".dialog .dialog-title").textContent).toBe("Themes");
    expect(doc.querySelectorAll(".theme-card").length).toBeGreaterThan(50);
    key(doc.activeElement ?? doc.body, "Escape");
    await sleep(100);
    await open();
    item("Make my own theme…").click();
    await sleep(400);
    expect(doc.querySelector(".theme-editor")).toBeTruthy();
    key(doc.activeElement ?? doc.body, "Escape");
    await sleep(100);
    while (doc.querySelector(".modal-backdrop")) { key(doc.activeElement ?? doc.body, "Escape"); await sleep(60); }
  });

  test("the shortcut for the gallery can be set in the shortcuts dialog and starts with none", async () => {
    const { keysOf } = await import("../resources/file_manager/ui/keymap.js");
    expect(keysOf("app.themes")).toEqual(["Mod+Shift+T"]);
  });

  test("pinned favorite themes appear under Favorites in the Themes menu and are not duplicated in Recent", async () => {
    const { call } = await import("../resources/file_manager/ui/api.js");
    const themes = ((await call("themes/list")) as any).themes;
    const { chooseTheme, toggleFavoriteTheme } = await import("../resources/file_manager/ui/themes.js");
    const g = globalThis as any;
    const hadStorage = "localStorage" in g;
    g.localStorage = win.localStorage;
    win.localStorage.removeItem("fm_recent_themes");
    win.localStorage.removeItem("fm_favorite_themes");
    await chooseTheme(themes[3].key);
    await chooseTheme(themes[4].key);
    toggleFavoriteTheme(themes[3].key);
    await sleep(300);
    await open();
    const headers = [...doc.querySelectorAll(".menu .menu-header")].map((h: any) => h.textContent);
    expect(headers).toEqual(["Favorites", "Recent"]);
    const matching = [...doc.querySelectorAll(".menu .menu-item .menu-label")].filter((l: any) => l.textContent === themes[3].name);
    expect(matching.length).toBe(1);
    toggleFavoriteTheme(themes[3].key);
    item("Standard: follow my computer").click();
    await sleep(300);
    if (!hadStorage) delete g.localStorage;
  });
});


describe("the review dialog, Compare, Projects and duplicate cleanup", () => {
  const lab = join(root, "plan-lab");
  const put = (path: string, content = "x") => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, content); return path; };
  const closeDialogs = async () => { while (doc.querySelector(".modal-backdrop")) { key(doc.activeElement ?? doc.body, "Escape"); await sleep(60); } };
  const dialogText = () => doc.querySelector(".modal-backdrop:last-child .dialog")?.textContent ?? "";
  const primary = (): any => [...doc.querySelectorAll(".modal-backdrop:last-child .dialog .btn")].find((b: any) => b.classList.contains("primary"));
  const buttonNamed = (name: string): any => [...doc.querySelectorAll("button")].find((b: any) => b.textContent.trim().startsWith(name) && !b.closest("[hidden]"));
  const waitFor = async (check: () => boolean, ms = 4000) => { for (let i = 0; i < ms / 40 && !check(); i++) await sleep(40); };
  const toasts = () => [...doc.querySelectorAll("#toasts .toast")].map((t: any) => t.textContent).join(" | ");
  const setValue = (el: any, v: string) => { el.value = v; el.dispatchEvent(new win.Event("input", { bubbles: true })); el.dispatchEvent(new win.Event("change", { bubbles: true })); };

  test("Compare and Projects are tools in the Files group", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    const ids = power.listPowerTabs().map((t: any) => t.id);
    expect(power.listPowerTabs().find((t: any) => t.id === "compare")).toMatchObject({ label: "Compare", group: "files" });
    expect(power.listPowerTabs().find((t: any) => t.id === "projects")).toMatchObject({ label: "Projects", group: "files" });
    expect(ids.indexOf("compare")).toBeGreaterThan(ids.indexOf("find"));
  });

  test("a permanent delete shows the summary, the recovery limits and two confirmations; cancelling changes nothing", async () => {
    const f = put(join(lab, "gone.txt"));
    const { reviewPlan } = await import("../resources/file_manager/ui/planDialog.js");
    const pending = reviewPlan({ type: "delete", paths: [f], permanent: true }, { applyLabel: "Delete for good" });
    await waitFor(() => !!doc.querySelector(".plan-summary"));
    const text = dialogText();
    expect(text).toContain("Review before anything changes");
    expect(text).toContain("Delete for good:");
    expect(text).toContain("✗ Undo");
    expect(text).toContain("everything here is deleted for good");
    expect(text).toContain("gone.txt");
    expect(primary().disabled).toBe(true);
    const approve: any = doc.querySelector("#plan-approve");
    const permanent: any = doc.querySelector("#plan-permanent");
    approve.checked = true; approve.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(primary().disabled).toBe(true);
    permanent.checked = true; permanent.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(primary().disabled).toBe(false);
    permanent.checked = false; permanent.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(primary().disabled).toBe(true);
    key(doc.activeElement ?? doc.body, "Escape");
    expect(await pending).toEqual({ applied: false });
    expect(existsSync(f)).toBe(true);
  });

  test("approving runs the plan in the task queue and the result says it can't be undone", async () => {
    const f = put(join(lab, "bye.txt"));
    const { reviewPlan } = await import("../resources/file_manager/ui/planDialog.js");
    const pending = reviewPlan({ type: "delete", paths: [f], permanent: true });
    await waitFor(() => !!doc.querySelector("#plan-approve"));
    for (const id of ["#plan-approve", "#plan-permanent"]) { const c: any = doc.querySelector(id); c.checked = true; c.dispatchEvent(new win.Event("change", { bubbles: true })); }
    primary().click();
    const outcome: any = await pending;
    expect(outcome.applied).toBe(true);
    await waitFor(() => !existsSync(f) && /Deleted 1 item/.test(toasts()));
    expect(existsSync(f)).toBe(false);
    expect(toasts()).toMatch(/Deleted 1 item.*can't be undone/);
  });

  test("a Recycle Bin delete offers Undo that really brings the file back", async () => {
    const f = put(join(lab, "undo-me.txt"), "back again");
    const { reviewPlan } = await import("../resources/file_manager/ui/planDialog.js");
    const pending = reviewPlan({ type: "delete", paths: [f], permanent: false });
    await waitFor(() => !!doc.querySelector("#plan-approve"));
    expect(dialogText()).toContain("✓ Recycle Bin");
    const c: any = doc.querySelector("#plan-approve"); c.checked = true; c.dispatchEvent(new win.Event("change", { bubbles: true }));
    primary().click();
    await pending;
    const undoToast = (): any => [...doc.querySelectorAll("#toasts .toast")].find((t: any) => /Deleted 1 item/.test(t.textContent) && t.querySelector(".toast-action"));
    await waitFor(() => !existsSync(f) && !!undoToast());
    expect(existsSync(f)).toBe(false);
    undoToast().querySelector(".toast-action").click();
    await waitFor(() => existsSync(f));
    expect(readFileSync(f, "utf8")).toBe("back again");
  });

  test("items can be left out of a plan with their checkbox, and skipped items say why", async () => {
    const a = put(join(lab, "keep-a.txt"));
    const b = put(join(lab, "drop-b.txt"));
    const { reviewPlan } = await import("../resources/file_manager/ui/planDialog.js");
    const pending = reviewPlan({ type: "delete", paths: [a, b, join(lab, "missing.txt")], permanent: false });
    await waitFor(() => !!doc.querySelector(".plan-items"));
    expect(dialogText()).toContain("no longer exists");
    const boxes = [...doc.querySelectorAll(".plan-items input[type=checkbox]")] as any[];
    expect(boxes.length).toBe(2);
    boxes[0].checked = false; boxes[0].dispatchEvent(new win.Event("change", { bubbles: true }));
    const c: any = doc.querySelector("#plan-approve"); c.checked = true; c.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(primary().textContent).toContain("1 item");
    primary().click();
    await pending;
    await waitFor(() => !existsSync(b));
    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(false);
  });

  test("Compare: two folders are listed in the five groups and a chosen difference is copied after a preview", async () => {
    const left = join(lab, "cmp-left");
    const right = join(lab, "cmp-right");
    put(join(left, "same.txt"), "same");
    put(join(right, "same.txt"), "same");
    put(join(left, "only-left.txt"), "L");
    put(join(right, "only-right.txt"), "R");
    put(join(left, "diff.txt"), "left version");
    put(join(right, "diff.txt"), "right version, longer");
    const power = await import("../resources/file_manager/ui/power.js");
    power.openPower("compare");
    await sleep(200);
    setValue(doc.querySelector("#compare-left"), left);
    setValue(doc.querySelector("#compare-right"), right);
    buttonNamed("Compare").click();
    await waitFor(() => doc.querySelectorAll(".compare-table tbody tr").length === 4);
    const chips = doc.querySelector(".compare-chips")!.textContent;
    expect(chips).toContain("Only on the left: 1");
    expect(chips).toContain("Only on the right: 1");
    expect(chips).toContain("Different: 1");
    expect(chips).toContain("Identical: 1");
    expect(chips).toContain("Cannot compare: 0");
    expect(doc.querySelector(".compare-note")!.textContent).toMatch(/not read/);
    expect(doc.querySelector(".compare-note")!.hasAttribute("hidden")).toBe(false);
    const rowOf = (rel: string): any => [...doc.querySelectorAll(".compare-table tbody tr")].find((r: any) => r.children[1].textContent === rel);
    expect(rowOf("only-right.txt").querySelector("input").disabled).toBe(true);
    expect(rowOf("same.txt").querySelector("input").disabled).toBe(true);
    expect(rowOf("same.txt").textContent).toContain("not verified");
    const copyBox = rowOf("only-left.txt").querySelector("input");
    copyBox.checked = true; copyBox.dispatchEvent(new win.Event("change", { bubbles: true }));
    buttonNamed("Copy the selected").click();
    await waitFor(() => !!doc.querySelector(".plan-summary"));
    expect(dialogText()).toContain("Copy:");
    expect(dialogText()).toContain("only-left.txt");
    expect(existsSync(join(right, "only-left.txt"))).toBe(false);
    primary().click();
    await waitFor(() => existsSync(join(right, "only-left.txt")));
    expect(readFileSync(join(right, "only-left.txt"), "utf8")).toBe("L");
    expect(existsSync(join(left, "only-left.txt"))).toBe(true);
    expect(existsSync(join(right, "only-right.txt"))).toBe(true);
    await closeDialogs();
  });

  test("Compare: the 'verify' button runs the careful check, and the chips filter the list", async () => {
    buttonNamed("Verify them now").click();
    await waitFor(() => /identical/.test(doc.querySelector(".compare-chips")!.textContent ?? "") && doc.querySelector(".compare-note")!.hasAttribute("hidden"));
    expect(doc.querySelector(".compare-note")!.hasAttribute("hidden")).toBe(true);
    const chip: any = [...doc.querySelectorAll(".compare-chip")].find((c: any) => c.textContent.startsWith("Different"));
    chip.click();
    await waitFor(() => doc.querySelectorAll(".compare-table tbody tr").length === 1);
    expect(doc.querySelector(".compare-table tbody tr")!.children[1].textContent).toBe("diff.txt");
    expect((doc.querySelector(".compare-chip.g-different") as any).getAttribute("aria-pressed")).toBe("true");
  });

  test("Projects: save the layout, the secret check refuses a password in a command, open and delete", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    power.openPower("projects");
    await sleep(250);
    buttonNamed("Save the current layout").click();
    await waitFor(() => !!doc.querySelector(".text-input"));
    setValue(doc.querySelector(".modal-backdrop:last-child .text-input"), "Lab project");
    primary().click();
    await waitFor(() => dialogText().includes("Favorite commands"));
    expect(dialogText()).toContain("Database connections");
    expect(dialogText()).toContain("never stores passwords");
    // a command with a password in it is refused with a sentence, and the dialog stays open
    buttonNamed("Add a command").click();
    const inputs = [...doc.querySelectorAll(".proj-cmd input")] as any[];
    setValue(inputs[0], "Deploy");
    setValue(inputs[1], "deploy --password=hunter2");
    primary().click();
    await waitFor(() => /never store passwords/.test(doc.querySelector(".modal-backdrop:last-child .dialog-error")?.textContent ?? ""));
    expect(doc.querySelector(".modal-backdrop:last-child")).toBeTruthy();
    setValue(inputs[1], "bun test");
    const roots: any = doc.querySelector("textarea[aria-label='Project folders']");
    setValue(roots, `${lab}\n${join(lab, "not-there")}`);
    primary().click();
    await waitFor(() => !doc.querySelector(".modal-backdrop"));
    await waitFor(() => !!doc.querySelector(".proj-card"));
    expect(doc.querySelector(".proj-card h3")!.textContent).toContain("Lab project");
    await waitFor(() => (doc.querySelector(".proj-detail")?.textContent ?? "").includes("missing"));
    expect(doc.querySelector(".proj-detail")!.textContent).toContain("missing");
    expect(readFileSync(join(dataDir, "file_manager_workspaces.json"), "utf8")).not.toContain("hunter2");
    // opening reports the missing folder instead of failing
    buttonNamed("Open").click();
    await waitFor(() => /with 1 problem/.test(toasts()));
    expect(toasts()).toContain("not-there");
    // the command goes to the terminal only when asked, and is never pressed Enter on
    power.openPower("projects");
    buttonNamed("Details").click();
    await waitFor(() => !!doc.querySelector(".proj-cmds"));
    expect(doc.querySelector(".proj-cmds")!.textContent).toContain("bun test");
    expect(doc.querySelector(".proj-cmds")!.textContent).not.toContain("untrusted");
    buttonNamed("Delete").click();
    await waitFor(() => !!doc.querySelector(".modal-backdrop"));
    primary().click();
    await waitFor(() => !doc.querySelector(".proj-card"));
    await closeDialogs();
  });

  test("Projects: an imported command is marked untrusted and asks before it is typed", async () => {
    const file = JSON.stringify({ format: "bun-rad-file-manager-workspace", version: 1, workspace: { name: "From a friend", roots: [lab], commands: [{ label: "Hello", command: "echo hello" }] } });
    const power = await import("../resources/file_manager/ui/power.js");
    power.openPower("projects");
    await sleep(200);
    buttonNamed("Import a project file").click();
    await waitFor(() => !!doc.querySelector("textarea[aria-label=\"The workspace file's text\"]"));
    setValue(doc.querySelector("textarea[aria-label=\"The workspace file's text\"]"), file);
    primary().click();
    await waitFor(() => /Details of "From a friend"/.test(doc.querySelector(".proj-detail")?.textContent ?? ""));
    expect(doc.querySelector(".proj-badge.warn")!.textContent).toBe("untrusted");
    expect(doc.querySelector(".proj-card .proj-badge")!.textContent).toBe("imported");
    buttonNamed("Put in the terminal").click();
    await waitFor(() => dialogText().includes("not trusted yet"));
    expect(dialogText()).toContain("echo hello");
    expect(dialogText()).toContain("Nothing runs until you press Enter");
    key(doc.activeElement ?? doc.body, "Escape");
    await sleep(60);
    buttonNamed("Delete").click();
    await waitFor(() => !!doc.querySelector(".modal-backdrop"));
    primary().click();
    await waitFor(() => !doc.querySelector(".proj-card"));
  });

  test("Duplicate cleanup: one copy of each file always stays, and the rest go through the review dialog", async () => {
    const dupes = join(lab, "dupes");
    put(join(dupes, "a", "photo.jpg"), "same bytes here");
    put(join(dupes, "b", "photo-copy.jpg"), "same bytes here");
    put(join(dupes, "c", "photo-copy2.jpg"), "same bytes here");
    const { createDupes } = await import("../resources/file_manager/ui/devDupes.js");
    const d = createDupes({ getRoot: () => dupes });
    doc.body.append(d.el);
    const minSelect: any = d.el.querySelector("#dev-dupes-min");
    minSelect.value = "1";
    await d.start();
    await waitFor(() => d.el.querySelectorAll("input[data-path]").length === 3);
    const boxes = [...d.el.querySelectorAll("input[data-path]")] as any[];
    const tick = (b: any, on: boolean) => { b.checked = on; b.dispatchEvent(new win.Event("change", { bubbles: true })); };
    tick(boxes[0], true); tick(boxes[1], true); tick(boxes[2], true);
    expect(boxes.filter((b) => b.checked).length).toBe(2);
    expect(d.el.textContent).toContain("Keep at least one copy");
    const clean: any = [...d.el.querySelectorAll("button")].find((b: any) => b.textContent.startsWith("Move the selected copies"));
    expect(clean.disabled).toBe(false);
    clean.click();
    await waitFor(() => !!doc.querySelector(".plan-items"));
    expect(dialogText()).toContain("Move to the Recycle Bin:");
    expect(dialogText()).toContain("2 items");
    key(doc.activeElement ?? doc.body, "Escape");
    await sleep(60);
    for (const f of ["a/photo.jpg", "b/photo-copy.jpg", "c/photo-copy2.jpg"]) expect(existsSync(join(dupes, f))).toBe(true);
    d.el.remove();
    await closeDialogs();
  });

  test("Actions: built-in recipes are listed, a run is checked first, runs in the queue, and the result lands in the output folder", async () => {
    const act = join(lab, "act");
    const csv = put(join(act, "people.csv"), "name,age\nAda,36\n");
    put(join(act, "notes.txt"), "not a csv");
    const nav = await import("../resources/file_manager/ui/nav.js");
    const { activePane } = await import("../resources/file_manager/ui/pane.js");
    await nav.goTo(act);
    await sleep(300);
    const power = await import("../resources/file_manager/ui/power.js");
    expect(power.listPowerTabs().find((t: any) => t.id === "actions")).toMatchObject({ label: "Actions", group: "automate" });
    power.openPower("actions");
    await waitFor(() => doc.querySelectorAll(".act-card").length >= 3);
    const cardText = doc.querySelector(".act-cards")!.textContent ?? "";
    expect(cardText).toContain("Prepare images for a website");
    expect(cardText).toContain("your original files are never changed");
    expect(cardText).toContain("Make copies no wider than the size");
    const card: any = [...doc.querySelectorAll(".act-card")].find((c: any) => c.textContent.includes("Turn data files into YAML"));
    [...card.querySelectorAll("button")].find((b: any) => b.textContent.startsWith("Choose files and run")).click();
    await waitFor(() => !!doc.querySelector(".act-panel .act-inputs"));
    expect(doc.querySelector(".act-inputs")!.textContent).toContain("No files yet");
    (activePane() as any).selection.clear();
    (activePane() as any).selection.add(csv);
    (activePane() as any).selection.add(join(act, "notes.txt"));
    ([...doc.querySelectorAll(".act-panel button")].find((b: any) => b.textContent === "Use the selected files") as any).click();
    await waitFor(() => /Ready:/.test(doc.querySelector(".act-check")?.textContent ?? ""));
    expect(doc.querySelector(".act-inputs")!.textContent).toContain("2 files");
    expect(doc.querySelector(".act-check")!.textContent).toMatch(/Ready: 1 file will be used/);
    expect(doc.querySelector(".act-check")!.textContent).toMatch(/notes\.txt: This action takes \.json.*files/);
    expect(doc.querySelector(".act-check")!.textContent).toContain("never changed");
    const run: any = [...doc.querySelectorAll(".act-panel button")].find((b: any) => b.textContent === "Run the action");
    expect(run.disabled).toBe(false);
    run.click();
    await waitFor(() => /added to "yaml"/.test(doc.querySelector(".act-run")?.textContent ?? ""), 8000);
    expect(doc.querySelector(".act-run")!.textContent).toContain("✓ Convert to YAML");
    expect(doc.querySelector(".act-panel")!.textContent).not.toContain("null");
    expect(readFileSync(join(act, "yaml", "people.yaml"), "utf8")).toContain("Ada");
    expect(readFileSync(csv, "utf8")).toBe("name,age\nAda,36\n");
    expect([...doc.querySelectorAll(".act-run button")].some((b: any) => b.textContent === "Show the output folder")).toBe(true);
  }, 20000);

  test("Actions: a check that fails explains the problem and keeps Run switched off", async () => {
    const act = join(lab, "act");
    const { activePane } = await import("../resources/file_manager/ui/pane.js");
    (activePane() as any).selection.clear();
    (activePane() as any).selection.add(join(act, "notes.txt"));
    ([...doc.querySelectorAll(".act-panel button")].find((b: any) => b.textContent === "Use the selected files") as any).click();
    await waitFor(() => /can't run yet/.test(doc.querySelector(".act-check")?.textContent ?? ""));
    expect(doc.querySelector(".act-check")!.textContent).toMatch(/can't be used|at least 1 usable file/);
    expect(([...doc.querySelectorAll(".act-panel button")].find((b: any) => b.textContent === "Run the action") as any).disabled).toBe(true);
  });

  test("Actions: a custom command in an imported action is kept but shown disabled", async () => {
    const file = JSON.stringify({ format: "bun-rad-file-manager-action", version: 1, action: { name: "Friend's recipe", steps: [{ type: "convert", action: "data-yaml" }, { type: "command", label: "Upload", command: "scp x y:" }] } });
    ([...doc.querySelectorAll("button")].find((b: any) => b.textContent.startsWith("Import an action file")) as any).click();
    await waitFor(() => !!doc.querySelector(".modal-backdrop textarea"));
    setValue(doc.querySelector(".modal-backdrop:last-child textarea"), file);
    primary().click();
    await waitFor(() => [...doc.querySelectorAll(".act-card")].some((c: any) => c.textContent.includes("Friend's recipe")));
    const card: any = [...doc.querySelectorAll(".act-card")].find((c: any) => c.textContent.includes("Friend's recipe"));
    expect(card.textContent).toContain("imported");
    expect(card.querySelector(".proj-badge.warn")!.textContent).toBe("disabled");
    [...card.querySelectorAll("button")].find((b: any) => b.textContent.startsWith("Delete")).click();
    await waitFor(() => !!doc.querySelector(".modal-backdrop"));
    primary().click();
    await waitFor(() => ![...doc.querySelectorAll(".act-card")].some((c: any) => c.textContent.includes("Friend's recipe")));
  });

  test("Backspace deletes by default on Windows, Linux, and macOS; turning the Mac-keyboard setting off makes Backspace go up a folder", async () => {
    const dir = join(lab, "bs", "inner");
    const f = put(join(dir, "victim.txt"), "bye");
    put(join(dir, "keeper.txt"), "stay");
    const nav = await import("../resources/file_manager/ui/nav.js");
    const { activePane } = await import("../resources/file_manager/ui/pane.js");
    const shared = (await import("../resources/file_manager/ui/state.js")).state;
    const here = () => shared.location.path;
    const prevPlatform = shared.platform;
    shared.platform = "linux";
    try {
      win.localStorage.removeItem("fm_backspace_hint");
      await nav.goTo(dir);
      await sleep(300);
      // default on Windows/Linux/macOS: Backspace moves the selected file to the Recycle Bin and stays in the folder
      (activePane() as any).selection.clear();
      (activePane() as any).selection.add(f);
      key($("#list"), "Backspace");
      await waitFor(() => !existsSync(f));
      expect(existsSync(f)).toBe(false);
      expect(existsSync(join(dir, "keeper.txt"))).toBe(true);
      expect(here()).toBe(dir);
      // with the setting turned off on Windows/Linux: Backspace = up one folder, and the hint appears once
      await nav.saveSettings({ backspaceDeletes: false });
      key($("#list"), "Backspace");
      await waitFor(() => here() === join(lab, "bs"));
      expect(here()).toBe(join(lab, "bs"));
      expect(toasts()).toContain("Delete key is Backspace");
    } finally {
      shared.platform = prevPlatform;
      await nav.saveSettings({ backspaceDeletes: true });
    }
  });
});

describe("links inside the embedded timer", () => {
  test("a link clicked in the timer's frame opens in the system browser; messages from anywhere else are ignored", async () => {
    const embed = await import("../resources/file_manager/ui/embed.js");
    const host = doc.createElement("div");
    doc.body.append(host);
    embed.mountEmbedded(host, { id: "timer", title: "Interval Timer", note: "test" });
    const frame = host.querySelector("iframe") as any;
    const origin = new URL(frame.src).origin;
    const send = (data: unknown, o = origin, source = frame.contentWindow) => win.dispatchEvent(new win.MessageEvent("message", { data, origin: o, source }));
    launched.length = 0;
    send({ fmOpenLink: "https://www.youtube.com/@codecaine" });
    for (let i = 0; i < 40 && !launched.length; i++) await sleep(50);
    expect(launched.length).toBe(1);
    expect(launched[0]!.args.join(" ")).toContain("https://www.youtube.com/@codecaine");
    launched.length = 0;
    send({ fmOpenLink: "https://evil.example/" }, "http://evil.example:80");
    send({ fmOpenLink: "https://evil.example/" }, origin, win);
    send({ somethingElse: "https://evil.example/" });
    send({ fmOpenLink: "file:///etc/passwd" });
    send({ fmOpenLink: "javascript:alert(1)" });
    await sleep(400);
    expect(launched).toEqual([]);
    host.remove();
  });
});

describe("quiet text boxes and simple editing", () => {
  const context = (field: HTMLInputElement | HTMLTextAreaElement) => {
    field.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  };
  const menuItem = (label: string): HTMLButtonElement => [...doc.querySelectorAll(".menu-item")].find((b: any) => b.querySelector(".menu-label").textContent === label);

  test("existing, helper-created and late-created inputs disable typing suggestions", async () => {
    const { h } = await import("../resources/file_manager/ui/dom.js");
    const created = h("textarea");
    const late = doc.createElement("input");
    doc.body.append(created, late);
    for (const field of [$("#search"), $("#address-input"), created, late]) {
      field.hidden = false;
      field.focus();
      for (const [name, value] of Object.entries({ spellcheck: "false", autocomplete: "off", autocorrect: "off", autocapitalize: "off" })) {
        expect(field.getAttribute(name)).toBe(value);
      }
    }
    created.remove();
    late.remove();
    $("#address-input").hidden = true;
  });

  test("Ctrl+A and Command+A select text, not files; Clear text notifies input listeners", async () => {
    const field = doc.createElement("textarea");
    field.value = "first line\nsecond line";
    doc.body.append(field);
    field.focus();
    const shared = (await import("../resources/file_manager/ui/state.js")).state;
    const selection = [...shared.selection];
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      field.setSelectionRange(2, 2);
      expect(key(field, "a", modifier).defaultPrevented).toBe(true);
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
      expect([...shared.selection]).toEqual(selection);
    }
    let inputs = 0;
    let changes = 0;
    field.addEventListener("input", () => inputs++);
    field.addEventListener("change", () => changes++);
    context(field);
    menuItem("Clear text").click();
    expect(field.value).toBe("");
    expect(inputs).toBe(1);
    expect(changes).toBe(1);
    expect(doc.activeElement).toBe(field);
    field.remove();
  });

  test("the editing menu selects, copies, cuts and deletes only the chosen text", async () => {
    const field = doc.createElement("input");
    field.value = "alpha beta";
    doc.body.append(field);
    field.focus();
    context(field);
    menuItem("Select all").click();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 10]);
    field.setSelectionRange(6, 10);
    context(field);
    clip.text = "";
    menuItem("Copy").click();
    for (let i = 0; i < 50 && clip.text !== "beta"; i++) await sleep(20);
    expect(clip.text).toBe("beta");
    expect(field.value).toBe("alpha beta");
    context(field);
    menuItem("Cut").click();
    for (let i = 0; i < 50 && field.value !== "alpha "; i++) await sleep(20);
    expect(field.value).toBe("alpha ");
    field.setSelectionRange(0, 5);
    context(field);
    menuItem("Delete selection").click();
    expect(field.value).toBe(" ");
    field.remove();
  });

  test("read-only and disabled inputs cannot be cleared, and passwords cannot be copied through the menu", async () => {
    const field = doc.createElement("input");
    field.value = "private";
    field.readOnly = true;
    doc.body.append(field);
    field.focus();
    field.select();
    context(field);
    for (const label of ["Cut", "Paste", "Delete selection", "Clear text"]) expect(menuItem(label).disabled).toBe(true);
    expect(menuItem("Copy").disabled).toBe(false);
    (await import("../resources/file_manager/ui/menus.js")).closeMenu();
    field.readOnly = false;
    field.type = "password";
    field.select();
    context(field);
    expect(menuItem("Copy").disabled).toBe(true);
    expect(menuItem("Cut").disabled).toBe(true);
    (await import("../resources/file_manager/ui/menus.js")).closeMenu();
    field.disabled = true;
    context(field);
    expect($(".menu")).toBeNull();
    field.remove();
  });

  test("paste inserts clipboard text and reports denied clipboard access", async () => {
    const field = doc.createElement("textarea");
    field.value = "hello world";
    doc.body.append(field);
    field.focus();
    field.setSelectionRange(6, 11);
    const before = Object.getOwnPropertyDescriptor(win.navigator, "clipboard");
    Object.defineProperty(win.navigator, "clipboard", { configurable: true, value: { readText: async () => "there" } });
    try {
      context(field);
      menuItem("Paste").click();
      await sleep(20);
      expect(field.value).toBe("hello there");
      Object.defineProperty(win.navigator, "clipboard", { configurable: true, value: { readText: async () => { throw new Error("Denied"); } } });
      context(field);
      menuItem("Paste").click();
      await sleep(20);
      expect(field.value).toBe("hello there");
      expect($("#toasts").textContent).toContain("Couldn't read the clipboard");
    } finally {
      if (before) Object.defineProperty(win.navigator, "clipboard", before);
      else Reflect.deleteProperty(win.navigator, "clipboard");
      field.remove();
    }
  });

  test("opening the text menu does not commit an inline rename", async () => {
    const file = join(home, "rename-menu.txt");
    writeFileSync(file, "keep");
    const { emit } = await import("../resources/file_manager/ui/state.js");
    emit("workspace-go", "files");
    await (await import("../resources/file_manager/ui/nav.js")).goTo(home);
    (await import("../resources/file_manager/ui/list.js")).beginRename(file);
    const field = $(".rename-input");
    field.value = "not-committed.txt";
    expect(key(field, "a", { ctrlKey: true }).defaultPrevented).toBe(true);
    context(field);
    await sleep(120);
    expect($(".rename-input")).toBe(field);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(join(home, "not-committed.txt"))).toBe(false);
    menuItem("Select all").click();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
    key(field, "Escape");
    expect($(".rename-input")).toBeNull();
  });

  test("the terminal's helper textarea keeps native shell shortcuts instead of form editing", () => {
    const field = doc.createElement("textarea");
    $("#terminal-host").append(field);
    field.focus();
    expect(key(field, "a", { ctrlKey: true }).defaultPrevented).toBe(false);
    context(field);
    expect(doc.querySelector('.menu[aria-label="Text editing"]')).toBeNull();
    field.remove();
  });
});

describe("finding tools without scrolling", () => {
  const tabs = (): string[] => [...doc.querySelectorAll("#power-tabs [role=tab]")].map((t: any) => t.id.replace("power-tab-", ""));
  const filter = (value: string) => {
    $("#power-filter").value = value;
    $("#power-filter").dispatchEvent(new win.Event("input", { bubbles: true }));
  };

  test("filters immediately by name, description and group, without switching the current app", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    (await import("../resources/file_manager/ui/workspace.js")).setWorkspace("tools", { tool: "calc" });
    filter("  DoWnLoAd  ");
    expect(tabs()).toContain("downloads");
    expect(tabs()).not.toContain("calc");
    expect(power.activePowerTab()).toBe("calc");
    expect($("#power-pane-calc").getAttribute("aria-label")).toBe("Calculator");
    expect($("#power-filter-status").textContent).toContain("found");
    expect($("#power-tabs").classList.contains("filtered")).toBe(true);
    expect($("#power-tab-downloads").tabIndex).toBe(0);
    filter("security");
    expect(tabs()).toEqual(expect.arrayContaining(["crypto", "secrets"]));
    filter("speed limit");
    expect(tabs()).toContain("downloads");
    filter("zz-no-such-app");
    expect(tabs()).toEqual([]);
    expect($("#power-filter-status").textContent).toContain("No tools match");
    expect(power.activePowerTab()).toBe("calc");
    expect(key($("#power-filter"), "Enter").defaultPrevented).toBe(true);
    expect(power.activePowerTab()).toBe("calc");
  });

  test("Enter opens the first match and arrows navigate only matching apps", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    filter("download");
    $("#power-filter").focus();
    key($("#power-filter"), "Enter");
    expect(power.activePowerTab()).toBe("downloads");
    expect(doc.activeElement.id).toBe("power-tab-downloads");
    filter("security");
    $("#power-filter").focus();
    key($("#power-filter"), "ArrowDown");
    const matches = tabs();
    expect(doc.activeElement.id).toBe(`power-tab-${matches[0]}`);
    key(doc.activeElement, "ArrowRight");
    expect(power.activePowerTab()).toBe(matches[1]);
    key(doc.activeElement, "End");
    expect(power.activePowerTab()).toBe(matches.at(-1));
    key(doc.activeElement, "Home");
    expect(power.activePowerTab()).toBe(matches[0]);
  });

  test("Clear, Escape and the search input's native clear restore all apps without leaving Tools", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    const total = power.listPowerTabs().length;
    for (const clear of [
      () => $("#power-filter-clear").click(),
      () => key($("#power-filter"), "Escape"),
      () => { $("#power-filter").value = ""; $("#power-filter").dispatchEvent(new win.Event("search", { bubbles: true })); },
    ]) {
      filter("download");
      $("#power-filter").focus();
      clear();
      expect(tabs().length).toBe(total);
      expect(ws()).toBe("tools");
      expect($("#power-filter-clear").hidden).toBe(true);
      expect($("#power-tabs").classList.contains("filtered")).toBe(false);
    }
  });

  test("opening a different app from outside the filtered tabs makes its tab visible", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    filter("download");
    power.openPower("calc");
    expect($("#power-filter").value).toBe("");
    expect($("#power-tab-calc").getAttribute("aria-selected")).toBe("true");
    expect(doc.activeElement.id).toBe("power-tab-calc");
    (await import("../resources/file_manager/ui/state.js")).emit("workspace-go", "files");
  });
});

describe("download folders open inside the File Manager by default", () => {
  test("paused and finished downloads use Files view, with a separate system-file-manager action", async () => {
    const { downloadsOf } = await import("../src/features/filemanager/fmDownloadOps");
    const manager = downloadsOf(server.context);
    const folder = join(home, "download-ui");
    mkdirSync(folder, { recursive: true });
    const item = manager.add([{ url: "https://example.test/file.txt", folder, start: false }])[0]!;
    const power = await import("../resources/file_manager/ui/power.js");
    const shared = (await import("../resources/file_manager/ui/state.js")).state;
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 100; i++) {
        if (check()) return;
        await sleep(30);
      }
      throw new Error("Timed out waiting for download UI");
    };
    const row = () => doc.querySelector(`.dl-row[data-id="${item.id}"]`);
    const button = (label: string): HTMLButtonElement => [...row().querySelectorAll("button")].find((b: any) => b.textContent.includes(label));
    try {
      power.openPower("downloads");
      await until(() => !!row());
      const launches = launched.length;
      button("Open folder").click();
      await until(() => ws() === "files" && shared.location.path === folder);
      expect(launched.length).toBe(launches);
      expect(shared.selection.size).toBe(0);
      expect(doc.activeElement.id).toBe("list");

      writeFileSync(item.path, "downloaded");
      manager.get(item.id)!.state = "done";
      power.openPower("downloads");
      await until(() => row().dataset.state === "done");
      button("Open folder").click();
      await until(() => ws() === "files" && shared.selection.has(item.path));
      expect(launched.length).toBe(launches);

      power.openPower("downloads");
      await until(() => ws() === "tools");
      button("System file manager").click();
      await until(() => launched.length > launches);
      expect(launched.at(-1)!.args.join(" ")).toContain(process.platform === "linux" ? folder : item.path);
      expect(ws()).toBe("tools");

      manager.get(item.id)!.folder = join(folder, "missing");
      power.openPower("downloads");
      await sleep(100);
      button("Open folder").click();
      await until(() => $("#toasts").textContent.includes("exist"));
      expect(ws()).toBe("tools");
      expect(launched.length).toBe(launches + 1);
    } finally {
      await manager.remove(item.id);
      (await import("../resources/file_manager/ui/state.js")).emit("workspace-go", "files");
      await (await import("../resources/file_manager/ui/nav.js")).goTo(home);
    }
  });
});

describe("tool screen room toggles and universal window/browser actions", () => {
  test("Compact and Expand toggle extra room for all tools, and Escape restores from Expand before leaving Tools", async () => {
    alt(1);
    await sleep(80);
    const power = await import("../resources/file_manager/ui/power.js");
    power.openPower("paint");
    await sleep(80);
    expect(ws()).toBe("tools");
    expect(app().classList.contains("power-compact")).toBe(false);
    expect(app().classList.contains("power-max")).toBe(false);

    $("#power-compact").click();
    expect(app().classList.contains("power-compact")).toBe(true);
    expect($("#power-compact").getAttribute("aria-pressed")).toBe("true");
    $("#power-compact").click();
    expect(app().classList.contains("power-compact")).toBe(false);

    $("#power-expand").click();
    expect(app().classList.contains("power-max")).toBe(true);
    expect($("#power-expand").getAttribute("aria-pressed")).toBe("true");
    expect($("#power-max-bar").hidden).toBe(false);

    // Pressing Escape restores from Expand first without leaving the Tools view
    key(doc.body, "Escape");
    expect(app().classList.contains("power-max")).toBe(false);
    expect($("#power-max-bar").hidden).toBe(true);
    expect(ws()).toBe("tools");

    //Embedded apps also have their own Expand, Window, and Browser buttons
    const paintPane = $("#power-pane-paint");
    expect(paintPane.querySelector(".embed-expand")).not.toBeNull();
    expect(paintPane.querySelector(".embed-window")).not.toBeNull();
    expect(paintPane.querySelector(".embed-browser")).not.toBeNull();

    const launchesBefore = launched.length;
    paintPane.querySelector(".embed-browser").click();
    await sleep(120);
    expect(launched.length).toBeGreaterThan(launchesBefore);
    expect(launched.at(-1)!.args.join(" ")).toContain("/app/paint/");

    // Keyboard shortcuts (F11, macOS NSF11FunctionKey \uF70E, Ctrl+F11, Ctrl+Cmd+F, Mod+Shift+U, Alt+8) toggle Ultra Focus mode
    const modOpt = process.platform === "darwin" ? { metaKey: true } : { ctrlKey: true };
    key(doc.body, "F11", { code: "F11" });
    expect(app().classList.contains("power-max")).toBe(true);
    key(doc.body, "\uF70E", { code: "" });
    expect(app().classList.contains("power-max")).toBe(false);
    key(doc.body, "F11", { ctrlKey: true, code: "F11" });
    expect(app().classList.contains("power-max")).toBe(true);
    key(doc.body, "f", { ctrlKey: true, metaKey: true, code: "KeyF" });
    expect(app().classList.contains("power-max")).toBe(false);
    key(doc.body, "F11", { code: "F11" });
    expect(app().classList.contains("power-max")).toBe(true);
    key(doc.body, "U", { ...modOpt, shiftKey: true, code: "KeyU" });
    expect(app().classList.contains("power-max")).toBe(false);
    key(doc.body, "8", { altKey: true, code: "Digit8" });
    expect(app().classList.contains("power-max")).toBe(true);

    // Embedded and nested studio iframe postMessage bridge can toggle/exit Ultra Focus, focus app filter, and copy text
    win.dispatchEvent(new win.MessageEvent("message", { data: { fmEscapeExpand: true }, source: win }));
    expect(app().classList.contains("power-max")).toBe(false);
    win.dispatchEvent(new win.MessageEvent("message", { data: { fmToggleExpand: true }, origin: win.location.origin }));
    expect(app().classList.contains("power-max")).toBe(true);
    win.dispatchEvent(new win.MessageEvent("message", { data: { fmFilterTools: true }, source: win }));
    expect(app().classList.contains("power-max")).toBe(false);
    expect(doc.activeElement.id).toBe("power-filter");

    clip.text = "";
    win.dispatchEvent(new win.MessageEvent("message", { data: { fmCopyText: "copied from iframe" }, source: win }));
    for (let i = 0; i < 50 && clip.text !== "copied from iframe"; i++) await sleep(20);
    expect(clip.text).toBe("copied from iframe");

    // Mod+K from Files view opens Tools and focuses #power-filter
    (await import("../resources/file_manager/ui/state.js")).emit("workspace-go", "files");
    await sleep(60);
    expect(ws()).toBe("files");
    key(doc.body, "k", { ...modOpt, code: "KeyK" });
    expect(ws()).toBe("tools");
    expect(doc.activeElement.id).toBe("power-filter");

    // Cmd+C / Ctrl+C copies selected text in inputs/textareas and selected DOM text in the UI
    const field = doc.createElement("input");
    field.value = "hello shortcut copy";
    doc.body.append(field);
    field.focus();
    field.setSelectionRange(6, 14);
    clip.text = "";
    expect(key(field, "c", { ...modOpt, code: "KeyC" }).defaultPrevented).toBe(true);
    for (let i = 0; i < 50 && clip.text !== "shortcut"; i++) await sleep(20);
    expect(clip.text).toBe("shortcut");

    field.setSelectionRange(0, 6);
    clip.text = "";
    expect(key(field, "x", { ...modOpt, code: "KeyX" }).defaultPrevented).toBe(true);
    for (let i = 0; i < 50 && clip.text !== "hello "; i++) await sleep(20);
    expect(clip.text).toBe("hello ");
    expect(field.value).toBe("shortcut copy");
    field.remove();

    // Selecting non-input DOM text anywhere in the UI and pressing Cmd+C / Ctrl+C copies the selected text instead of files
    (await import("../resources/file_manager/ui/state.js")).emit("workspace-go", "files");
    await sleep(60);
    const sharedState = (await import("../resources/file_manager/ui/state.js")).state;
    sharedState.clipboard = null;
    const span = doc.createElement("span");
    span.textContent = "selected ui text";
    doc.body.append(span);
    const range = doc.createRange();
    range.selectNodeContents(span);
    const sel = win.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    clip.text = "";
    expect(key(doc.body, "c", { ...modOpt, code: "KeyC" }).defaultPrevented).toBe(true);
    for (let i = 0; i < 50 && clip.text !== "selected ui text"; i++) await sleep(20);
    expect(clip.text).toBe("selected ui text");
    expect(sharedState.clipboard).toBeNull();
    sel.removeAllRanges();
    span.remove();

    (await import("../resources/file_manager/ui/state.js")).emit("workspace-go", "files");
  });
});

describe("core file browsing & pane ergonomics (tabs, marquee, folder tree, columns/grouping, color tags, dual-pane parity)", () => {
  test("settings sanitize columns, groupBy, tags, and treeExpanded", () => {
    const clean = sanitizeSettings({
      columns: ["permissions", "ext", "bogus"],
      groupBy: "kind",
      tags: { [join(home, "a.txt")]: "red", [join(home, "b.txt")]: "invalid-color" },
      treeExpanded: true,
    }, ctx);
    expect(clean.columns).toEqual(["permissions", "ext"]);
    expect(clean.groupBy).toBe("kind");
    expect(clean.tags[join(home, "a.txt")]).toBe("red");
    expect(clean.tags[join(home, "b.txt")]).toBeUndefined();
    expect(clean.treeExpanded).toBe(true);
  });

  test("folder tabs open, duplicate, switch, cycle, and close while preserving per-tab location", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const { goTo } = await import("../resources/file_manager/ui/nav.js");
    const tabs = await import("../resources/file_manager/ui/tabs.js");

    await goTo(home);
    tabs.renderTabs();
    const initialCount = state.tabs.length;
    expect(initialCount).toBeGreaterThanOrEqual(1);

    await tabs.openNewTab(dest);
    expect(state.tabs.length).toBe(initialCount + 1);
    expect(state.location.path).toBe(dest);
    expect(doc.querySelectorAll("#tabbar .fm-tab").length).toBe(state.tabs.length);

    await tabs.cycleTab(-1);
    expect(state.location.path).toBe(home);

    await tabs.duplicateTab();
    expect(state.tabs.length).toBe(initialCount + 2);

    await tabs.closeTab();
    expect(state.tabs.length).toBe(initialCount + 1);
    await tabs.closeTab();
    expect(state.tabs.length).toBe(initialCount);
    await goTo(home);
  });

  test("customizable details columns (ext, permissions) and group-by section headers render in details view", async () => {
    const { emit } = await import("../resources/file_manager/ui/state.js");
    const { goTo, saveSettings } = await import("../resources/file_manager/ui/nav.js");

    await goTo(home);
    await saveSettings({ view: "details", columns: ["ext", "permissions"], groupBy: "kind" });
    emit("view");
    await sleep(40);

    expect(doc.querySelector("#list-head .h-ext")?.hidden).toBe(false);
    expect(doc.querySelector("#list-head .h-perms")?.hidden).toBe(false);
    expect(doc.querySelector("#list .row .c-ext")?.hidden).toBe(false);
    expect(doc.querySelector("#list .row .c-perms")?.hidden).toBe(false);
    expect(doc.querySelectorAll("#list .group-header").length).toBeGreaterThan(0);

    await saveSettings({ columns: [], groupBy: "none" });
    emit("view");
    await sleep(40);
    expect(doc.querySelector("#list-head .h-ext")?.hidden).toBe(true);
    expect(doc.querySelector("#list-head .h-perms")?.hidden).toBe(true);
    expect(doc.querySelectorAll("#list .group-header").length).toBe(0);
  });

  test("color tags mark rows with a colored dot and filter visible entries from the sidebar", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const { goTo } = await import("../resources/file_manager/ui/nav.js");
    const { setTagForPaths } = await import("../resources/file_manager/ui/tags.js");

    await goTo(home);
    const fileA = join(home, "a.txt");
    await setTagForPaths([fileA], "red");
    await sleep(40);

    const rowA = rowOf("#list", "a.txt");
    expect(rowA?.dataset.tag).toBe("red");
    expect(rowA?.querySelector(".tag-dot.tag-red")).not.toBeNull();

    const redFilter = doc.querySelector('#sidebar [data-tag-filter="red"]') as any;
    expect(redFilter).not.toBeNull();
    redFilter.click();
    await sleep(40);
    expect(state.tagFilter).toBe("red");
    expect(rowNames("#list")).toEqual(["a.txt"]);

    // Clicking the active tag filter again clears the filter
    const redFilterAgain = doc.querySelector('#sidebar [data-tag-filter="red"]') as any;
    redFilterAgain.click();
    await sleep(40);
    expect(state.tagFilter).toBe("");
    expect(rowNames("#list")).toContain("b.txt");

    await setTagForPaths([fileA], "");
    await sleep(40);
    expect(rowOf("#list", "a.txt")?.querySelector(".tag-dot")).toBeNull();
  });

  test("sidebar expandable folder tree expands, lists subfolders, and navigates on click", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const { renderSidebar } = await import("../resources/file_manager/ui/sidebar.js");
    const { toggleFolderTreeSection } = await import("../resources/file_manager/ui/folderTree.js");

    if (!state.settings.treeExpanded) await toggleFolderTreeSection();
    renderSidebar();
    await sleep(60);

    const treeRows = [...doc.querySelectorAll("#sidebar .tree-row")];
    expect(treeRows.length).toBeGreaterThan(0);
    const destRow = treeRows.find((n: any) => n.dataset.treePath === dest);
    expect(destRow).toBeDefined();
    destRow.querySelector(".tree-item").click();
    await sleep(60);
    expect(state.location.path).toBe(dest);
    await (await import("../resources/file_manager/ui/nav.js")).goTo(home);
  });

  test("right-pane parity in dual view supports back/forward history, editable address bar, and search", async () => {
    const { emit } = await import("../resources/file_manager/ui/state.js");
    const { right } = await import("../resources/file_manager/ui/pane.js");
    const dual = await import("../resources/file_manager/ui/dual.js");

    emit("workspace-go", "dual");
    await sleep(80);
    await dual.loadRight(home, { push: false });
    await dual.loadRight(dest, { push: true });
    expect(right.location.path).toBe(dest);
    expect($("#dual-back").disabled).toBe(false);

    await dual.goRightBack();
    expect(right.location.path).toBe(home);
    expect($("#dual-forward").disabled).toBe(false);

    await dual.goRightForward();
    expect(right.location.path).toBe(dest);

    // Search in right pane
    $("#dual-search").value = "c.txt";
    await dual.runRightSearch("c.txt");
    await sleep(60);
    expect(rowNames("#dual-list")).toContain("c.txt");

    await dual.loadRight(home, { push: false });
    emit("workspace-go", "files");
    await sleep(60);
  });

  test("rowDensity setting sanitizes to compact/comfortable/spacious and updates document data-density and quickbar pill", async () => {
    const { DEFAULT_SETTINGS } = await import("../src/features/filemanager/fmSettings.ts");
    const { goTo, saveSettings } = await import("../resources/file_manager/ui/nav.js");

    expect(DEFAULT_SETTINGS.rowDensity).toBe("comfortable");
    expect(sanitizeSettings({ rowDensity: "compact" }, ctx).rowDensity).toBe("compact");
    expect(sanitizeSettings({ rowDensity: "spacious" }, ctx).rowDensity).toBe("spacious");
    expect(sanitizeSettings({ rowDensity: "invalid-density" }, ctx).rowDensity).toBe("comfortable");

    await goTo(home);
    await saveSettings({ rowDensity: "compact" });
    await sleep(40);
    expect(doc.documentElement.dataset.density).toBe("compact");
    expect($("#qb-density-btn")?.textContent).toContain("Compact");

    await saveSettings({ rowDensity: "spacious" });
    await sleep(40);
    expect(doc.documentElement.dataset.density).toBe("spacious");
    expect($("#qb-density-btn")?.textContent).toContain("Spacious");

    await saveSettings({ rowDensity: "comfortable" });
    await sleep(40);
    expect(doc.documentElement.dataset.density).toBe("comfortable");
  });

  test("Smart Kind-Chips Bar and Live Folder Filter filter visible entries immediately and reset on folder navigation", async () => {
    const { state, emit } = await import("../resources/file_manager/ui/state.js");
    const { goTo, entryMatchesKindFilter } = await import("../resources/file_manager/ui/nav.js");

    expect(entryMatchesKindFilter({ name: "app.ts", ext: ".ts", isDir: false, category: "code" }, "code")).toBe(true);
    expect(entryMatchesKindFilter({ name: "readme.md", ext: ".md", isDir: false, category: "document" }, "docs")).toBe(true);
    expect(entryMatchesKindFilter({ name: "sub", ext: "", isDir: true, category: "folder" }, "folders")).toBe(true);
    expect(entryMatchesKindFilter({ name: "photo.png", ext: ".png", isDir: false, category: "image" }, "images")).toBe(true);
    expect(entryMatchesKindFilter({ name: "data.sqlite", ext: ".sqlite", isDir: false, category: "other" }, "data")).toBe(true);
    expect(entryMatchesKindFilter({ name: "bundle.zip", ext: ".zip", isDir: false, category: "archive" }, "archives")).toBe(true);

    writeFileSync(join(home, "script-rad.ts"), "export const x = 1;\n");
    await goTo(home);
    await sleep(50);

    expect(rowNames("#list")).toContain("script-rad.ts");
    expect(rowNames("#list")).toContain("a.txt");

    // Click the Code kind chip
    const codeChip = doc.querySelector('#kind-chips [data-kind="code"]') as any;
    expect(codeChip).not.toBeNull();
    codeChip.click();
    await sleep(40);
    expect(state.kindFilter).toBe("code");
    expect(rowNames("#list")).toContain("script-rad.ts");
    expect(rowNames("#list")).not.toContain("a.txt");

    // Live folder filter narrows further
    const qInput = $("#quick-filter") as any;
    qInput.value = "nomatch-xyz";
    qInput.dispatchEvent(new win.Event("input", { bubbles: true }));
    await sleep(40);
    expect(state.quickFilter).toBe("nomatch-xyz");
    expect(rowNames("#list").length).toBe(0);

    // Navigating to another folder resets both filters
    await goTo(dest);
    expect(state.kindFilter).toBe("all");
    expect(state.quickFilter).toBe("");
    await goTo(home);
    rmSync(join(home, "script-rad.ts"), { force: true });
    emit("view");
  });

  test("Context-Aware Floating Selection Action Bar appears on selection with inline color tags and context actions", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const { goTo } = await import("../resources/file_manager/ui/nav.js");
    const { selectOnly, clearSelection } = await import("../resources/file_manager/ui/selection.js");
    const { setTagForPaths } = await import("../resources/file_manager/ui/tags.js");

    await goTo(home);
    clearSelection();
    await sleep(30);
    expect($("#selection-bar")?.hidden).toBe(true);

    const fileA = join(home, "a.txt");
    selectOnly(fileA);
    await sleep(40);

    const bar = $("#selection-bar");
    expect(bar?.hidden).toBe(false);
    expect(bar?.querySelector(".sb-summary")?.textContent).toContain("1 file selected");

    // Click blue color tag dot inside the floating selection bar
    const blueTagBtn = bar?.querySelector(".sb-tag-btn.tag-blue") as any;
    expect(blueTagBtn).not.toBeNull();
    blueTagBtn.click();
    await sleep(50);
    expect((state.settings.tags as Record<string, string>)[fileA]).toBe("blue");

    await setTagForPaths([fileA], "");
    clearSelection();
    await sleep(30);
    expect($("#selection-bar")?.hidden).toBe(true);
  });

  test("Address bar favorite pin star toggles folder favorite state and updates aria-pressed", async () => {
    const { goTo } = await import("../resources/file_manager/ui/nav.js");
    const ops = await import("../resources/file_manager/ui/ops.js");

    await goTo(dest);
    await sleep(40);
    const pinBtn = $("#pin-folder");
    expect(pinBtn).not.toBeNull();
    expect(pinBtn.hidden).toBe(false);

    const wasFav = ops.isFavorite(dest);
    pinBtn.click();
    await sleep(60);
    expect(ops.isFavorite(dest)).toBe(!wasFav);
    expect(pinBtn.getAttribute("aria-pressed")).toBe(String(!wasFav));

    // Toggle back to restore original state
    pinBtn.click();
    await sleep(60);
    expect(ops.isFavorite(dest)).toBe(wasFav);
    await goTo(home);
  });

  test("RAD File Templates create starter files with content and support the template picker modal", async () => {
    const { goTo } = await import("../resources/file_manager/ui/nav.js");
    const { RAD_FILE_TEMPLATES, newFromTemplate, showNewTemplateDialog } = await import("../resources/file_manager/ui/quickbar.js");

    expect(RAD_FILE_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    await goTo(home);

    const created = await newFromTemplate("typescript", "rad_helper.ts");
    expect(created?.path).toBe(join(home, "rad_helper.ts"));
    expect(existsSync(created!.path)).toBe(true);
    expect(readFileSync(created!.path, "utf8")).toContain("export async function main(");

    // Verify template picker modal opens and renders template cards
    showNewTemplateDialog();
    await sleep(40);
    const cards = doc.querySelectorAll("#overlay .tpl-card");
    expect(cards.length).toBe(RAD_FILE_TEMPLATES.length);
    const cancelBtn = [...doc.querySelectorAll("#overlay .modal-buttons .btn")].find((b: any) => b.textContent === "Cancel") as any;
    cancelBtn?.click();
    await sleep(30);

    rmSync(created!.path, { force: true });
    await goTo(home);
  });

  test("Universal Command Palette opens, filters across categories and prefixes, and runs commands", async () => {
    const { openCommandPalette } = await import("../resources/file_manager/ui/commandPalette.js");

    const dlg = openCommandPalette();
    await sleep(40);
    const input = doc.querySelector("#overlay .cp-input") as any;
    expect(input).not.toBeNull();
    expect(doc.querySelectorAll("#overlay .cp-item").length).toBeGreaterThan(5);

    // Filter with '+' prefix for RAD templates
    input.value = "+ typescript";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    await sleep(40);
    const rows = [...doc.querySelectorAll("#overlay .cp-item")];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].textContent).toContain("TypeScript Script");

    // Filter with '#' prefix for View & Density settings
    input.value = "# compact";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    await sleep(40);
    const densityRows = [...doc.querySelectorAll("#overlay .cp-item")];
    expect(densityRows.some((r: any) => r.textContent.includes("Row Density: Compact"))).toBe(true);

    dlg?.close(null);
    await sleep(30);
  });

  test("clicking between files and folders in List and Icons views uses stable grid layout, floating selection bar, and surgical DOM selection updates without flicker", async () => {
    const { goTo, saveSettings } = await import("../resources/file_manager/ui/nav.js");
    const styleCss = readFileSync(new URL("../resources/file_manager/ui/style.css", import.meta.url), "utf8");
    const viewsCss = readFileSync(new URL("../resources/file_manager/ui/views.css", import.meta.url), "utf8");

    // 1. Verify List view uses a stable CSS Grid instead of height-sensitive newspaper columns
    expect(styleCss).toContain("#list.view-list, #dual-list.view-list { display: grid;");
    // 2. Verify selection-bar is floating (position: absolute) and nowrap so clicking between files and folders never resizes #list-wrap
    expect(viewsCss).toMatch(/\.selection-bar\s*\{[^}]*position:\s*absolute/);
    expect(viewsCss).toMatch(/\.selection-bar\s*\{[^}]*flex-wrap:\s*nowrap/);
    // 3. Verify List and Icons views keep font-weight constant on selection so 2-line icon labels never wrap/unwrap on click
    expect(styleCss).toContain(".view-list .row.selected .name-text");
    expect(styleCss).toContain(".view-icons .row.selected .name-text");

    // 4. Verify surgical DOM updates in List and Icons modes when clicking between a folder ("dest") and a file ("a.txt")
    await goTo(home);
    for (const mode of ["list", "icons"] as const) {
      await saveSettings({ view: mode });
      await sleep(30);
      expect($("#list").classList.contains(`view-${mode}`)).toBe(true);

      const folderRow = rowOf("#list", "dest");
      const fileARow = rowOf("#list", "a.txt");
      const fileBRow = rowOf("#list", "b.txt");
      expect(folderRow).toBeDefined();
      expect(fileARow).toBeDefined();
      expect(fileBRow).toBeDefined();

      // Click folder first
      clickRow("#list", "dest");
      expect(folderRow.classList.contains("selected")).toBe(true);
      expect(fileARow.classList.contains("selected")).toBe(false);
      expect(fileBRow.classList.contains("selected")).toBe(false);

      // Spy on setAttribute of the untouched row ("b.txt") while clicking from folder ("dest") to file ("a.txt")
      let untouchedAttrWrites = 0;
      const origSetAttr = fileBRow.setAttribute.bind(fileBRow);
      fileBRow.setAttribute = (name: string, val: string) => {
        untouchedAttrWrites++;
        return origSetAttr(name, val);
      };
      try {
        clickRow("#list", "a.txt");
        expect(fileARow.classList.contains("selected")).toBe(true);
        expect(folderRow.classList.contains("selected")).toBe(false);
        expect(untouchedAttrWrites).toBe(0);
      } finally {
        fileBRow.setAttribute = origSetAttr;
      }
    }
    await saveSettings({ view: "details" });
  });
});


