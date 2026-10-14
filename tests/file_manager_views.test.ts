import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { createContext } from "../src/features/filemanager/fmCore";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, updateSettings } from "../src/features/filemanager/fmSettings";

// Part 1: the saved settings behind the views. Part 2: the real page (main.js, with the terminal replaced by a stub
// because it needs a shell and the xterm library) run in a fake browser against the real server.

const root = mkdtempSync(join(tmpdir(), "fm-views-"));
const home = join(root, "home");
const dataDir = join(root, "data");
const dest = join(home, "dest");
const ctx = createContext({ home, dataDir: join(root, "data-unit"), platform: "linux" });

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
    expect(DEFAULT_SETTINGS.workspace).toBe("files");
  });

  test("good values are kept", () => {
    const s = sanitizeSettings({ workspace: "dual", startWith: "last", splitSide: "bottom", splitSize: 35, sidebarCollapsed: true, focusMode: true, activeTool: "find", splitTool: "my-tool-2", dualPath: home }, ctx);
    expect(s).toMatchObject({ workspace: "dual", startWith: "last", splitSide: "bottom", splitSize: 35, sidebarCollapsed: true, focusMode: true, activeTool: "find", splitTool: "my-tool-2", dualPath: home });
  });

  test("damaged values fall back to the defaults or are clamped", () => {
    const s = sanitizeSettings({ workspace: "nonsense", startWith: 3, splitSide: "left", splitSize: "wide", sidebarCollapsed: "yes", focusMode: 1, activeTool: "Not A Tool!", splitTool: "9abc", dualPath: "relative/path" }, ctx);
    expect(s).toMatchObject({ workspace: "files", startWith: "files", splitSide: "right", splitSize: 50, sidebarCollapsed: false, focusMode: false, activeTool: "", splitTool: "", dualPath: "" });
    expect(sanitizeSettings({ splitSize: 5 }, ctx).splitSize).toBe(20);
    expect(sanitizeSettings({ splitSize: 500 }, ctx).splitSize).toBe(80);
    expect(sanitizeSettings({ splitSize: Number.NaN }, ctx).splitSize).toBe(50);
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
    const s = await updateSettings(ctx, { workspace: "split", splitSize: 999, splitSide: "bottom", activeTool: "calc", bogus: 1 });
    expect(s).toMatchObject({ workspace: "split", splitSize: 80, splitSide: "bottom", activeTool: "calc" });
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
let doc: any;
let win: any;
let toolbarModule: any;
let chrome: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const $ = (sel: string): any => doc.querySelector(sel);
const app = (): any => doc.getElementById("app");
const ws = () => app().dataset.workspace;
const shown = (sel: string) => !$(sel).hidden;
const key = (target: any, k: string, extra: Record<string, unknown> = {}) => {
  const ev = new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(ev);
  return ev;
};
const alt = (digit: number) => key(doc.body, String(digit), { altKey: true, code: `Digit${digit}` });
const savedSettings = async () => JSON.parse(readFileSync(join(dataDir, "file_manager.json"), "utf8"));
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
  mock.module("../resources/file_manager/ui/terminal.js", () => ({
    terminalAvailable: () => true, typeInTerminal: () => true, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, isTerminalOpen: () => false, wireTerminal() {},
  }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir, platform: "linux" } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, "linux").replace(/__FM_START__/g, "").replace(/__FM_NONCE__/g, "n");
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
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  win.Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(win.HTMLElement.prototype, "offsetParent", { get() { return win.document.body; }, configurable: true });
  doc = win.document;
  // The page modules are shared by every page test in this process. Whatever an earlier file left behind (an open menu
  // makes every shortcut stand aside; a mounted tool or a remembered view belongs to a page that is gone) must not count here.
  (await import("../resources/file_manager/ui/menus.js")).closeMenu();
  (await import("../resources/file_manager/ui/power.js")).resetPower();
  const shared = (await import("../resources/file_manager/ui/state.js")).state;
  Object.assign(shared, { workspace: "files", powerOpen: false, search: null, loading: false, busy: 0, terminalOpen: false });
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
  test("is a labelled radio group with a tooltip and keyboard hint on every view", () => {
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
    key(doc.body, "5", { altKey: true, ctrlKey: true, code: "Digit5" });
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
    await sleep(500);
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
    await sleep(250);
    expect((await savedSettings()).splitSize).toBe(20);
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
    await sleep(250);
    expect((await savedSettings()).splitSize).toBe(70);
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
    expect($("#dual-status").textContent).toContain("1 selected");
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
