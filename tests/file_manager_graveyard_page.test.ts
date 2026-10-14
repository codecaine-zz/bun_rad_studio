import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
// @ts-ignore (jsdom has no type declarations in every setup)
import { JSDOM } from "jsdom";
import { createGraveyardItem, loadManifest, saveManifest } from "../applications/rip_engine";
import { defaultGraveyardHooks } from "../src/features/filemanager/fmGraveyardHooks";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Graveyard tab, Bury (Rip) in the file list, the shortcut, Undo and the Delete setting, run for real in a fake
// browser (jsdom) against the real server and a private graveyard folder. Waits poll for what they expect (no fixed sleeps).
const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "navigator", "location", "fetch", "ResizeObserver"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-grave-ui-"));
const home = join(root, "home");
const work = join(home, "work");
const gy = join(root, "graveyard");
const launched: string[] = [];
const seam: { sameDevice: null | ((a: string, b: string) => boolean) } = { sameDevice: null };
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let state: any;
let api: any;
let nav: any;
let ops: any;
let contextmenu: any;
let extras: any;
let power: any;
let graveActions: any;
let toolbar: any;
let n = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => any, what: string, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(15);
  }
}
const q = (sel: string, from: any = doc): any => from.querySelector(sel);
const qa = (sel: string, from: any = doc): any[] => [...from.querySelectorAll(sel)];
const pane = (): any => doc.getElementById("power-pane-grave");
const rows = (): any[] => qa(".grave-table tbody tr", pane());
const rowNames = (): string[] => rows().map((r) => q(".grave-name", r).textContent.replace(/^\S+\s/, "").trim());
const btn = (text: string, from: any = pane()): any => qa("button", from).find((b) => b.textContent.trim() === text || b.textContent.trim().startsWith(text));
const dialog = (): any => qa(".modal-backdrop .dialog").at(-1);
const dialogBtn = (text: string): any => qa("button", dialog()).find((b) => b.textContent.trim() === text);
const toasts = (): string => qa("#toasts .toast-text").map((e) => e.textContent).join(" | ");
const closeAll = () => {
  for (const b of qa(".modal-backdrop")) b.remove();
  q(".menu")?.remove();
  qa("#toasts .toast").forEach((t) => t.remove());
  doc.body.classList.remove("modal-open");
};
const type = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
};
const choose = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
};
const tick = (el: any, on = true) => {
  el.checked = on;
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
};
const key = (k: string, init: Record<string, unknown> = {}) => doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
const call = (op: string, body: unknown = {}) => api.call(op, body);
const folder = () => {
  const d = join(work, `case-${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const write = (path: string, text = "hello") => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
};
const listed = async () => (await call("grave/list", { pageSize: 500 })).items as any[];
const idOf = async (path: string) => (await listed()).find((i) => i.originalPath === path)?.id as string;
async function buryByApi(paths: string[]) {
  const res = await call("grave/bury", { paths });
  if (res.job) await server.context.jobs.whenDone(res.job.id);
}
const openTab = async () => {
  power.openPower("grave");
  await until(() => pane() && rows !== undefined && q(".grave-card", pane()), "the Graveyard tab");
  await until(() => !q(".pw-status", pane())?.textContent.includes("Couldn't"), "a loaded tab");
};
const reloadTab = async () => {
  closeAll();
  power.openPower("grave");
  await sleep(0);
  btn("Refresh").click();
  await sleep(30);
};
async function selectPath(path: string) {
  state.selection = new Set([path]);
  state.focusKey = path;
}

beforeAll(async () => {
  mkdirSync(work, { recursive: true });
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
  saved.set("ResizeObserver", Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"));
  Object.defineProperty(globalThis, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
  server = startFileManagerServer({
    port: 0,
    token: "ui-token",
    context: { home, dataDir: join(root, "data"), graveyardDir: gy, launch: async (c, a) => void launched.push([c, ...a].join(" ")), graveyardHooks: { sameDevice: async (a, b) => (seam.sameDevice ? seam.sameDevice(a, b) : defaultGraveyardHooks.sameDevice(a, b)) } },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch" && x !== "ResizeObserver")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = win.document;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  api = await import("../resources/file_manager/ui/api.js");
  nav = await import("../resources/file_manager/ui/nav.js");
  ops = await import("../resources/file_manager/ui/ops.js");
  contextmenu = await import("../resources/file_manager/ui/contextmenu.js");
  extras = await import("../resources/file_manager/ui/extras.js");
  power = await import("../resources/file_manager/ui/power.js");
  graveActions = await import("../resources/file_manager/ui/graveActions.js");
  toolbar = await import("../resources/file_manager/ui/toolbar.js");
  await import("../resources/file_manager/ui/graveyard.js");
  const tools = await import("../resources/file_manager/ui/tools.js");
  const keys = await import("../resources/file_manager/ui/keys.js");
  state.platform = "linux";
  state.home = home;
  state.sep = "/";
  state.places = [];
  state.drives = [];
  state.settings = (await api.call("settings")).settings;
  power.wirePower();
  tools.wireTools();
  keys.wireKeys();
  toolbar.buildToolbar();
  await nav.goTo(work, { push: false });
  graveActions.setEmptyDelay(0);
});

afterAll(() => {
  closeAll();
  power.resetPower();
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(g, k, d);
    else delete g[k];
  }
  mock.restore();
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
  closeAll();
  seam.sameDevice = null;
  rmSync(gy, { recursive: true, force: true });
  rmSync(join(root, "data", "file_manager_trash"), { recursive: true, force: true });
  state.undoStack = [];
  state.selection = new Set();
  launched.length = 0;
  await call("settings", { set: { deleteTo: "bin" } });
  state.settings.deleteTo = "bin";
});

// ---------------------------------------------------------------------------------------------------------------

describe("the Graveyard tab", () => {
  test("it is a tab in Find & more with a picture, a name and a tip, and Home has a tile for it", async () => {
    const tab = power.listPowerTabs().find((t: any) => t.id === "grave");
    expect(tab).toMatchObject({ label: "Graveyard", icon: "🪦", group: "files" });
    expect(tab.tip.length).toBeGreaterThan(20);
    const home_ = await import("../resources/file_manager/ui/home.js");
    const tiles = await import("../resources/file_manager/ui/homeTiles.js");
    tiles.registerHomeTiles();
    const tile: any = home_.listHomeTiles().find((t: any) => t.id === "tool-grave");
    expect(tile).toBeTruthy();
    expect(tile.title).toBe("Graveyard");
    expect(tile.text).toContain("restore");
    const button = q("#power-tab-grave");
    expect(button.title).toContain("Graveyard");
  });

  test("an empty graveyard shows zeros, an explanation, the path, and no 'null' or 'undefined'", async () => {
    await openTab();
    await until(() => q(".grave-path", pane())?.textContent === gy, "the graveyard path");
    const cards = qa(".grave-card", pane()).map((c) => c.textContent);
    expect(cards).toHaveLength(5);
    expect(cards[0]).toContain("0");
    expect(cards[0]).toContain("Buried items");
    expect(cards[2]).toContain("nothing buried yet");
    expect(q(".grave-empty", pane()).hidden).toBe(false);
    expect(q(".grave-empty", pane()).textContent).toContain("The graveyard is empty");
    expect(pane().textContent).not.toMatch(/\bnull\b|\bundefined\b|NaN/);
    expect(btn("Restore").disabled).toBe(true);
    expect(btn("Delete for good…").disabled).toBe(true);
    expect(btn("Delete old…").disabled).toBe(true);
  });

  test("telemetry: counts, total size, oldest and newest, the graveyard folder and the free space", async () => {
    const dir = folder();
    const a = write(join(dir, "oldest.txt"), "12345");
    const b = write(join(dir, "newest.txt"), "1234567890");
    const sub = join(dir, "pack");
    write(join(sub, "x.txt"), "abc");
    await buryByApi([a]);
    await sleep(5);
    await buryByApi([sub, b]);
    await reloadTab();
    await until(() => rows().length === 3, "three rows");
    const cards = qa(".grave-card", pane());
    const text = (i: number) => cards[i].textContent;
    expect(text(0)).toContain("3");
    expect(text(0)).toContain("3 items buried today");
    expect(text(1)).toContain("18 B");
    expect(text(2)).toContain("oldest.txt");
    expect(text(3)).toMatch(/newest\.txt|pack/);
    expect(text(4)).toMatch(/of [\d.]+ [KMGTP]?B on this disk/);
    expect(q(".grave-path", pane()).textContent).toBe(gy);
    for (const c of cards) expect(c.title.length).toBeGreaterThan(10);
    btn("Show in file manager").click();
    await until(() => launched.length > 0, "the system file manager being asked to show the folder");
    expect(launched.join("\n")).toContain(gy);
    btn("Open here").click();
    await until(() => state.location.path === gy, "this window opening the graveyard folder");
    await nav.goTo(work, { push: false });
  });

  test("every control has visible text or an aria-label, and a title a beginner can read", async () => {
    await buryByApi([write(join(folder(), "t.txt"))]);
    await reloadTab();
    await until(() => rows().length === 1, "a row");
    for (const el of qa("button, input, select, summary, [role=toolbar]", pane())) {
      const name = (el.textContent ?? "").trim() || el.getAttribute("aria-label") || el.getAttribute("placeholder");
      expect(name, el.outerHTML.slice(0, 90)).toBeTruthy();
      if (el.tagName === "BUTTON" || el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "SUMMARY") expect((el.title ?? "").length, el.outerHTML.slice(0, 90)).toBeGreaterThan(5);
    }
    expect(pane().textContent).not.toMatch(/\bnull\b|\bundefined\b/);
    // sorted columns say so in words for screen readers, and the filter has all four choices
    expect(qa("th[aria-sort]", pane()).map((t) => t.getAttribute("aria-sort")).sort()).toEqual(["descending", "none", "none", "none", "none"]);
    expect(qa(".grave-controls select option", pane()).map((o) => o.textContent).slice(0, 4)).toEqual(["All", "From the current folder", "Files", "Folders", "50 per page"].slice(0, 4));
  });
});

describe("the list: search, filters, sorting, selection and paging", () => {
  test("search, the Files and Folders filters and 'From the current folder' narrow the list", async () => {
    const here = folder();
    const other = folder();
    await buryByApi([write(join(here, "alpha report.txt")), write(join(here, "beta.log")), write(join(other, "alpha notes.txt")), join(here, "pack"), join(other, "stuff")].filter((p) => !p.endsWith("pack") && !p.endsWith("stuff")));
    mkdirSync(join(here, "pack"), { recursive: true });
    write(join(here, "pack", "in.txt"));
    mkdirSync(join(other, "stuff"), { recursive: true });
    write(join(other, "stuff", "in.txt"));
    await buryByApi([join(here, "pack"), join(other, "stuff")]);
    await reloadTab();
    await until(() => rows().length === 5, "five rows");
    const search = q(".grave-search", pane());
    type(search, "alpha");
    await until(() => rows().length === 2, "the search to narrow to two");
    expect(rowNames().sort()).toEqual(["alpha notes.txt", "alpha report.txt"]);
    type(search, "alpha report");
    await until(() => rows().length === 1, "both words to match");
    type(search, "no such thing");
    await until(() => rows().length === 0, "nothing matching");
    expect(q(".grave-empty", pane()).textContent).toContain("Nothing matches");
    type(search, "");
    await until(() => rows().length === 5, "everything again");
    const filter = qa("select", pane()).find((s) => s.getAttribute("aria-label") === "Show");
    choose(filter, "folders");
    await until(() => rows().length === 2, "two folders");
    expect(rowNames().sort()).toEqual(["pack", "stuff"]);
    choose(filter, "files");
    await until(() => rows().length === 3, "three files");
    await nav.goTo(here, { push: false });
    choose(filter, "here");
    await until(() => rows().length === 3 && rowNames().every((nme) => ["alpha report.txt", "beta.log", "pack"].includes(nme)), "the three buried from this folder");
    await nav.goTo(work, { push: false });
    choose(filter, "all");
    await until(() => rows().length === 5, "all again");
  });

  test("clicking a column heading sorts by it, again reverses it, and the heading says which way", async () => {
    const dir = folder();
    await buryByApi([write(join(dir, "b.txt"), "xx"), write(join(dir, "a.txt"), "xxxxxx"), write(join(dir, "c.txt"), "x")]);
    await reloadTab();
    await until(() => rows().length === 3, "rows");
    const sortBtn = (label: string) => qa(".grave-sort", pane()).find((b) => b.textContent.trim().startsWith(label));
    sortBtn("Name").click();
    await until(() => rowNames().join() === "a.txt,b.txt,c.txt", "A to Z");
    expect(sortBtn("Name").closest("th").getAttribute("aria-sort")).toBe("ascending");
    sortBtn("Name").click();
    await until(() => rowNames().join() === "c.txt,b.txt,a.txt", "Z to A");
    expect(sortBtn("Name").closest("th").getAttribute("aria-sort")).toBe("descending");
    sortBtn("Size").click();
    await until(() => rowNames().join() === "a.txt,b.txt,c.txt", "biggest first");
    sortBtn("Buried").click();
    await until(() => rowNames().join() === "c.txt,a.txt,b.txt" || rowNames().length === 3, "newest first");
  });

  test("ticking rows, Select all on this page, Select all on every page and Select none, with the count said in words", async () => {
    const dir = folder();
    await buryByApi(Array.from({ length: 4 }, (_, i) => write(join(dir, `f${i}.txt`))));
    await reloadTab();
    await until(() => rows().length === 4, "rows");
    const boxes = () => qa("tbody input[type=checkbox]", pane());
    tick(boxes()[0]);
    expect(btn("Restore").disabled).toBe(false);
    expect(btn("Open its folder").disabled).toBe(false);
    expect(pane().textContent).toContain("1 item selected");
    tick(boxes()[1]);
    expect(btn("Open its folder").disabled).toBe(true);
    expect(pane().textContent).toContain("2 items selected");
    const all = q("thead input[type=checkbox]", pane());
    expect(all.indeterminate).toBe(true);
    tick(all);
    expect(boxes().every((b) => b.checked)).toBe(true);
    tick(all, false);
    expect(boxes().some((b) => b.checked)).toBe(false);
    btn("Select all").click();
    await until(() => boxes().every((b) => b.checked), "everything ticked");
    expect(pane().textContent).toContain("Selected 4 items on all pages");
    btn("Select none").click();
    expect(boxes().some((b) => b.checked)).toBe(false);
    expect(btn("Restore").disabled).toBe(true);
    for (const b of boxes()) expect(b.getAttribute("aria-label")).toMatch(/^Select /);
  });

  test("a graveyard with 5,200 items pages smoothly: 100 a page, Next, a page size choice, search across all pages, and Select all across pages", async () => {
    const items = Array.from({ length: 5200 }, (_, i) =>
      createGraveyardItem({ id: `rip_${1_700_000_000_000 + i}_${i.toString(36)}`, name: `doc-${i}.txt`, originalPath: join(work, `d${i % 20}`, `doc-${i}.txt`), cwd: join(work, `d${i % 20}`), graveyardDir: gy, graveyardPath: join(gy, "entries", `x${i}`, "doc"), now: new Date(1_700_000_000_000 + i * 1000), type: "file", mode: 0o644, sizeBytes: 100, fileCount: 1 }),
    );
    saveManifest(gy, { version: "1.0.0", graveyardRoot: gy, lastUpdated: "", items: items.reverse() });
    const started = performance.now();
    await reloadTab();
    await until(() => rows().length === 100, "the first page");
    expect(performance.now() - started).toBeLessThan(5000);
    expect(qa(".grave-card", pane())[0].textContent).toContain("5,200");
    expect(pane().textContent).toContain("1–100 of 5,200");
    expect(pane().textContent).toContain("page 1 of 52");
    expect(btn("‹ Previous").disabled).toBe(true);
    btn("Next ›").click();
    await until(() => pane().textContent.includes("101–200 of 5,200"), "the second page");
    expect(rows().every((r) => q(".grave-warn", r))).toBe(true); // no files were made for this test, and each row says so in words
    const size = qa("select", pane()).find((s) => s.getAttribute("aria-label") === "Items per page");
    choose(size, "500");
    await until(() => rows().length === 500, "500 rows");
    expect(pane().textContent).toContain("1–500 of 5,200");
    type(q(".grave-search", pane()), "doc-5199");
    await until(() => rows().length === 1, "one match across every page");
    type(q(".grave-search", pane()), "");
    await until(() => rows().length === 500, "all again");
    btn("Select all").click();
    await until(() => pane().textContent.includes("Selected 5,200 items on all pages"), "all 5,200 selected");
    btn("Select none").click();
    choose(size, "100");
  });
});

describe("restoring", () => {
  test("Restore puts an item back and Undo buries it again; the toast offers to show it", async () => {
    const f = write(join(folder(), "back.txt"), "restore me");
    await buryByApi([f]);
    await reloadTab();
    await until(() => rows().length === 1, "row");
    tick(q("tbody input[type=checkbox]", pane()));
    btn("Restore").click();
    await until(() => existsSync(f), "the file to be back");
    expect(readFileSync(f, "utf8")).toBe("restore me");
    await until(() => toasts().includes("Restored “back.txt”"), "the toast");
    expect(qa("#toasts .toast-action").map((b) => b.textContent)).toContain("Show it");
    await until(() => rows().length === 0, "the list to empty");
    expect(state.undoStack.at(-1).label).toContain("restore of 1 item from the graveyard");
    await ops.undo();
    expect(existsSync(f)).toBe(false);
    expect((await listed()).map((i) => i.originalPath)).toEqual([f]);
  });

  test("when something is in the way, the usual Replace / Keep both / Skip question appears, and nothing is overwritten before you answer", async () => {
    const dir = folder();
    const f = write(join(dir, "clash.txt"), "from the graveyard");
    await buryByApi([f]);
    write(f, "already here");
    await reloadTab();
    await until(() => rows().length === 1, "row");
    tick(q("tbody input[type=checkbox]", pane()));
    btn("Restore").click();
    await until(() => dialog(), "the conflict question");
    expect(dialog().textContent).toContain("clash.txt");
    expect(qa("button", dialog()).map((b) => b.textContent.trim())).toEqual(["Cancel", "Skip", "Replace", "Keep both"]);
    expect(readFileSync(f, "utf8")).toBe("already here");
    dialogBtn("Cancel").click();
    await sleep(40);
    expect(readFileSync(f, "utf8")).toBe("already here");
    expect((await listed()).length).toBe(1);
    expect(rows().length).toBe(1);
    expect(btn("Restore").disabled).toBe(false); // cancelling keeps the choice

    btn("Restore").click();
    await until(() => dialog(), "the question again");
    dialogBtn("Keep both").click();
    await until(() => existsSync(join(dir, "clash (2).txt")), "the second copy");
    expect(readFileSync(join(dir, "clash (2).txt"), "utf8")).toBe("from the graveyard");
    expect(readFileSync(f, "utf8")).toBe("already here");
  });

  test("Replace sends the old item to the Recycle Bin first, and Skip leaves everything alone", async () => {
    const dir = folder();
    const f = write(join(dir, "r.txt"), "buried one");
    await buryByApi([f]);
    write(f, "current one");
    await reloadTab();
    await until(() => rows().length === 1, "row");
    tick(q("tbody input[type=checkbox]", pane()));
    btn("Restore").click();
    await until(() => dialog(), "question");
    dialogBtn("Skip").click();
    await sleep(60);
    expect(readFileSync(f, "utf8")).toBe("current one");
    expect((await listed()).length).toBe(1);
    btn("Restore").click();
    await until(() => dialog(), "question again");
    dialogBtn("Replace").click();
    await until(() => readFileSync(f, "utf8") === "buried one", "the buried version to be back");
    expect((await call("trash/list")).items.some((t: any) => t.name === "r.txt")).toBe(true);
    await ops.undo();
    expect(readFileSync(f, "utf8")).toBe("current one");
  });

  test("when the original folder is gone: create it, or choose another folder in the typed-path box", async () => {
    const parent = folder();
    const f = write(join(parent, "deep", "g.txt"), "gone folder");
    await buryByApi([f]);
    rmSync(parent, { recursive: true });
    await reloadTab();
    await until(() => rows().length === 1, "row");
    tick(q("tbody input[type=checkbox]", pane()));
    btn("Restore").click();
    await until(() => dialog(), "the missing-folder question");
    expect(dialog().textContent).toContain("The original folder is gone");
    expect(dialog().textContent).toContain(join(parent, "deep"));
    expect(qa("button", dialog()).map((b) => b.textContent.trim())).toEqual(["Cancel", "Choose another folder…", "Create the folder"]);
    dialogBtn("Choose another folder…").click();
    await until(() => dialog()?.querySelector("input[type=text]"), "the folder box");
    const input = q("input[type=text]", dialog());
    type(input, join(root, "no-such-folder"));
    dialogBtn("Use this folder").click();
    await until(() => q(".dialog-error", dialog())?.textContent.includes("isn't a folder that exists"), "the error in the box");
    const other = folder();
    type(input, other);
    dialogBtn("Use this folder").click();
    await until(() => existsSync(join(other, "g.txt")), "the file in the other folder");
    expect(existsSync(parent)).toBe(false);

    // and the other answer: create the folder
    const f2 = write(join(parent, "again", "h.txt"), "second");
    await buryByApi([f2]);
    rmSync(parent, { recursive: true });
    await reloadTab();
    await until(() => rows().length === 2 || rows().length === 1, "rows");
    const row = rows().find((r) => r.textContent.includes("h.txt"))!;
    tick(q("input[type=checkbox]", row));
    btn("Restore").click();
    await until(() => dialog(), "the question");
    dialogBtn("Create the folder").click();
    await until(() => existsSync(f2), "the folder to be made and the file restored");
  });

  test("Restore to… asks for a folder and puts the items there", async () => {
    const f = write(join(folder(), "move-me.txt"), "elsewhere");
    await buryByApi([f]);
    await reloadTab();
    await until(() => rows().length === 1, "row");
    tick(q("tbody input[type=checkbox]", pane()));
    btn("Restore to…").click();
    await until(() => dialog()?.querySelector("input[type=text]"), "the folder box");
    const dest = folder();
    type(q("input[type=text]", dialog()), `${dest}`);
    dialogBtn("Use this folder").click();
    await until(() => existsSync(join(dest, "move-me.txt")), "the file in the chosen folder");
    expect(existsSync(f)).toBe(false);
  });

  test("an item whose files are gone says so on its row, and restoring it explains why it can't be", async () => {
    const f = write(join(folder(), "ghost.txt"));
    await buryByApi([f]);
    rmSync(join(gy, "entries", await idOf(f)), { recursive: true });
    await reloadTab();
    await until(() => rows().length === 1, "row");
    expect(rows()[0].textContent).toContain("files missing");
    expect(q(".grave-warn", rows()[0]).title).toContain("no longer in the graveyard");
    tick(q("tbody input[type=checkbox]", pane()));
    btn("Restore").click();
    await until(() => dialog(), "the explanation");
    expect(dialog().textContent).toContain("its files are no longer in the graveyard");
    dialogBtn("OK").click();
  });
});

describe("deleting for good", () => {
  test("Delete for good… says how many and how big, can be cancelled, and then really deletes", async () => {
    const dir = folder();
    await buryByApi([write(join(dir, "x1.txt"), "1".repeat(100)), write(join(dir, "x2.txt"), "2".repeat(200)), write(join(dir, "keep.txt"), "k")]);
    await reloadTab();
    await until(() => rows().length === 3, "rows");
    for (const r of rows()) if (r.textContent.includes("x")) tick(q("input[type=checkbox]", r), !r.textContent.includes("keep"));
    btn("Delete for good…").click();
    await until(() => dialog(), "the question");
    expect(dialog().textContent).toContain("2 items (300 B)");
    expect(dialog().textContent).toContain("can't be undone");
    expect(dialog().textContent).toContain("Recycle Bin");
    dialogBtn("Cancel").click();
    await sleep(40);
    expect((await listed()).length).toBe(3);
    btn("Delete for good…").click();
    await until(() => dialog(), "the question again");
    dialogBtn("Delete for good").click();
    await until(async () => (await listed()).length === 1, "two deletions");
    expect((await listed())[0].name).toBe("keep.txt");
    await until(() => rows().length === 1, "list refreshed");
    expect(toasts()).toContain("Deleted 2 items for good");
  });

  test("Delete old… shows how many items are that old, and only deletes those", async () => {
    const dir = folder();
    await buryByApi([write(join(dir, "stale.txt"), "s"), write(join(dir, "fresh.txt"), "f")]);
    const m = loadManifest(gy);
    m.items.find((i) => i.name === "stale.txt")!.buriedAtMs = Date.now() - 50 * 86_400_000;
    saveManifest(gy, m);
    await reloadTab();
    await until(() => rows().length === 2, "rows");
    btn("Delete old…").click();
    await until(() => dialog(), "the box");
    const days = q("input[type=number]", dialog());
    await until(() => dialog().textContent.includes("1 item (1 B) will be deleted"), "the count for 30 days");
    expect(dialogBtn("Delete for good").disabled).toBe(false);
    type(days, "400");
    await until(() => dialog().textContent.includes("Nothing is that old"), "the zero count");
    expect(dialogBtn("Delete for good").disabled).toBe(true);
    type(days, "abc");
    await until(() => dialog().textContent.includes("whole number of days"), "the hint");
    expect(dialogBtn("Delete for good").disabled).toBe(true);
    type(days, "30");
    await until(() => !dialogBtn("Delete for good").disabled, "the button");
    dialogBtn("Delete for good").click();
    await until(async () => (await listed()).length === 1, "the old one gone");
    expect((await listed())[0].name).toBe("fresh.txt");
  });

  test("Empty graveyard… needs the word empty and waits a moment before the button works", async () => {
    const dir = folder();
    await buryByApi([write(join(dir, "e1.txt")), write(join(dir, "e2.txt"))]);
    await reloadTab();
    await until(() => rows().length === 2, "rows");
    graveActions.setEmptyDelay(250);
    try {
      btn("Empty graveyard…").click();
      await until(() => dialog(), "the question");
      expect(dialog().textContent).toContain("All 2 items (");
      expect(dialog().textContent).toContain("can't be undone");
      expect(dialog().textContent).toContain("Rip Studio");
      const go = dialogBtn("Empty the graveyard");
      expect(go.disabled).toBe(true);
      const input = q("input[type=text]", dialog());
      expect(input.getAttribute("aria-label")).toContain("empty");
      type(input, "empt");
      expect(go.disabled).toBe(true);
      type(input, "Empty");
      expect(go.disabled).toBe(true); // right word, but the wait isn't over
      expect(dialog().textContent).toContain("unlocks in a moment");
      await until(() => !go.disabled, "the button to unlock");
      type(input, "empt");
      expect(go.disabled).toBe(true);
      type(input, " EMPTY ");
      expect(go.disabled).toBe(false);
      go.click();
      await until(async () => (await listed()).length === 0, "an empty graveyard");
      await until(() => rows().length === 0, "an empty list");
      expect(toasts()).toMatch(/Deleted 2 items for good|in the background/);
    } finally {
      graveActions.setEmptyDelay(0);
    }
  });

  test("Escape or Cancel on any of the delete questions changes nothing", async () => {
    await buryByApi([write(join(folder(), "safe.txt"))]);
    await reloadTab();
    await until(() => rows().length === 1, "row");
    btn("Empty graveyard…").click();
    await until(() => dialog(), "question");
    dialogBtn("Cancel").click();
    btn("Delete old…").click();
    await until(() => dialog(), "box");
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(40);
    expect((await listed()).length).toBe(1);
  });
});

describe("previews and opening the original folder", () => {
  test("clicking a name shows the text, the names inside a folder, or a link's target, read-only", async () => {
    const dir = folder();
    const txt = write(join(dir, "note.txt"), "buried note text");
    const sub = join(dir, "pack");
    write(join(sub, "one.txt"));
    write(join(sub, "two.txt"));
    symlinkSync("/etc/hosts", join(dir, "lnk"));
    await buryByApi([txt, sub, join(dir, "lnk")]);
    await reloadTab();
    await until(() => rows().length === 3, "rows");
    const clickName = (nme: string) => qa(".grave-name", pane()).find((b) => b.textContent.includes(nme)).click();
    clickName("note.txt");
    await until(() => q(".grave-text", pane())?.textContent === "buried note text", "the text");
    expect(q(".grave-preview h3", pane()).textContent).toBe("Preview: note.txt");
    clickName("pack");
    await until(() => q(".grave-names", pane())?.textContent.includes("two.txt"), "the folder's names");
    clickName("lnk");
    await until(() => q(".grave-preview-body", pane()).textContent.includes("points to “/etc/hosts”"), "the link text");
    expect(q(".grave-preview-body", pane()).textContent).toContain("isn't opened or followed");
  });

  test("a folder that was buried can be opened in the file list from its row", async () => {
    const dir = folder();
    const f = write(join(dir, "where.txt"));
    await buryByApi([f]);
    await reloadTab();
    await until(() => rows().length === 1, "row");
    const link = q(".grave-link", rows()[0]);
    expect(link.title).toContain(f);
    await nav.goTo(home, { push: false });
    link.click();
    await until(() => state.location.path === dir, "the file list to open the original folder");
    await nav.goTo(work, { push: false });
  });

  test("Verify shows a clean result, then finds a stray folder and Repair fixes only the list", async () => {
    const f = write(join(folder(), "v.txt"), "keep");
    await buryByApi([f]);
    await reloadTab();
    btn("Verify…").click();
    await until(() => dialog()?.textContent.includes("Everything matches"), "a clean report");
    dialogBtn("Close").click();
    mkdirSync(join(gy, "entries", "rip_1700000000000_stray"), { recursive: true });
    writeFileSync(join(gy, "entries", "rip_1700000000000_stray", "lost.txt"), "lost");
    btn("Verify…").click();
    await until(() => dialog()?.textContent.includes("1 problem found"), "the problem");
    expect(dialog().textContent).toContain("1 folder in the graveyard isn't on the list");
    const repair = qa("button", dialog()).find((b) => b.textContent.startsWith("Repair"));
    expect(repair.hidden).toBe(false);
    expect(repair.title.length).toBeGreaterThan(20);
    repair.click();
    await until(() => qa(".modal-backdrop").length === 2, "the Repair question");
    const confirm = qa(".modal-backdrop .dialog").at(-1);
    expect(confirm.textContent).toContain("Nothing that is buried is deleted");
    qa("button", confirm).find((b: any) => b.textContent.trim() === "Repair")!.click();
    await until(() => dialog()?.textContent.includes("Everything matches"), "a clean report after repairing");
    expect(readFileSync(join(gy, "entries", "rip_1700000000000_stray", "lost.txt"), "utf8")).toBe("lost");
    dialogBtn("Close").click();
    await until(() => rows().length === 2, "the adopted item on the list");
  });

  test("a damaged record file is called out in words and Verify offers the repair", async () => {
    await buryByApi([write(join(folder(), "d.txt"))]);
    writeFileSync(join(gy, "manifest.json"), "{ not json");
    await reloadTab();
    await until(() => !q(".grave-alert", pane()).hidden, "the warning");
    expect(q(".grave-alert", pane()).textContent).toContain("record file is damaged");
    expect(q(".grave-empty", pane()).textContent).toContain("damaged");
    btn("Verify…").click();
    await until(() => dialog()?.textContent.includes("record file is damaged"), "the verify text");
    const repair = qa("button", dialog()).find((b) => b.textContent.startsWith("Repair"));
    expect(repair.hidden).toBe(false);
    dialogBtn("Close").click();
    await call("grave/repair", { confirm: true });
  });
});

describe("Bury (Rip) in the file list", () => {
  test("right-click → Bury (Rip) buries the item, the toast offers Open Graveyard, and Undo (the keyboard and the button) brings it back as one step", async () => {
    const dir = folder();
    const f = write(join(dir, "bury-me.txt"), "bury");
    const g = write(join(dir, "also.txt"), "also");
    await nav.goTo(dir, { push: false });
    state.selection = new Set([f, g]);
    contextmenu.showEntryMenu(state.entries.filter((e: any) => state.selection.has(e.path)), { x: 10, y: 10 });
    const items = qa(".menu .menu-item");
    const item = items.find((b) => b.querySelector(".menu-label").textContent === "Bury (Rip)");
    expect(item).toBeTruthy();
    expect(item.title.toLowerCase()).toContain("graveyard");
    expect(item.textContent).toContain("Alt+Del");
    expect(items.some((b) => b.querySelector(".menu-label").textContent === "Move to Recycle Bin")).toBe(true);
    item.click();
    await until(() => !existsSync(f) && !existsSync(g), "both to be buried");
    await until(() => toasts().includes("Buried 2 items"), "the toast");
    expect(toasts()).toContain("Press Ctrl+Z to undo");
    expect(qa("#toasts .toast-action").map((b) => b.textContent)).toContain("Open Graveyard");
    expect((await listed()).map((i) => i.name).sort()).toEqual(["also.txt", "bury-me.txt"]);
    expect(state.undoStack.at(-1).label).toBe("burial of 2 items");
    expect(state.entries.some((e: any) => e.path === f)).toBe(false);
    // one Undo restores both
    key("z", { ctrlKey: true });
    await until(() => existsSync(f) && existsSync(g), "both to be restored by one Undo");
    expect(readFileSync(f, "utf8")).toBe("bury");
    expect((await listed()).length).toBe(0);
    expect(state.undoStack.length).toBe(0);
  });

  test("the toast's Open Graveyard button opens the tab, which shows what was buried", async () => {
    const dir = folder();
    const f = write(join(dir, "show-me.txt"));
    await nav.goTo(dir, { push: false });
    await selectPath(f);
    power.closePower();
    await ops.burySelection();
    const action = qa("#toasts .toast-action").find((b) => b.textContent === "Open Graveyard");
    action.click();
    await until(() => power.activePowerTab() === "grave" && rows().some((r) => r.textContent.includes("show-me.txt")), "the tab to open with the item");
    expect(power.powerIsOpen()).toBe(true);
  });

  test("the shortcut Alt+Delete buries the selected items (and is in Help's list)", async () => {
    const dir = folder();
    const f = write(join(dir, "shortcut.txt"));
    await nav.goTo(dir, { push: false });
    await selectPath(f);
    key("Delete", { altKey: true });
    await until(() => !existsSync(f), "the file to be buried");
    expect((await listed()).map((i) => i.name)).toEqual(["shortcut.txt"]);
    // a plain Delete still goes to the Recycle Bin by default
    const g = write(join(dir, "plain.txt"));
    await nav.goTo(dir, { push: false });
    await selectPath(g);
    key("Delete");
    await until(() => !existsSync(g), "plain Delete");
    expect((await call("trash/list")).items.map((t: any) => t.name)).toEqual(["plain.txt"]);
    expect((await listed()).map((i) => i.name)).toEqual(["shortcut.txt"]);
    extras.showHelp();
    const help = dialog();
    expect(help.textContent).toContain("Bury in the Rip graveyard");
    expect(qa("td.keycap", help).some((k) => k.textContent === "Alt+Delete")).toBe(true);
  });

  test("protected folders are refused with a plain message and nothing happens", async () => {
    await nav.goTo(dirname(home), { push: false }).catch(() => {});
    state.entries = [{ name: "home", path: home, isDir: true, size: 0, mtimeMs: 1 }];
    state.location = { kind: "folder", path: dirname(home) };
    state.selection = new Set([home]);
    await ops.burySelection();
    await until(() => toasts().includes("home folder"), "the refusal");
    expect(existsSync(home)).toBe(true);
    expect((await listed()).length).toBe(0);
    await nav.goTo(work, { push: false });
  });

  test("on another disk the burial runs as a job in the task list, and the Graveyard tab updates when it is done", async () => {
    const dir = folder();
    const f = write(join(dir, "far.txt"), "far away");
    await nav.goTo(dir, { push: false });
    await selectPath(f);
    seam.sameDevice = () => false;
    await openTab();
    await ops.burySelection();
    await until(() => q("#tasks .task"), "a card in the task list");
    expect(q("#tasks .task").getAttribute("aria-label")).toContain("graveyard");
    await until(() => !existsSync(f) && rows().some((r) => r.textContent.includes("far.txt")), "the file buried and listed");
    await until(() => q("#tasks .task")?.dataset.state === "done", "the card to say done");
    expect(q("#tasks .task .task-status").textContent).toBe("Done.");
    expect(toasts()).toContain("done");
  });
});

describe("Settings: what the Delete key uses", () => {
  test("the choice is in Settings with a hint and a title, defaults to the Recycle Bin, and switching it changes what Delete does", async () => {
    extras.showSettings();
    const select = qa("select", dialog()).find((s) => s.getAttribute("aria-label") === "When I press Delete, use");
    expect(select).toBeTruthy();
    expect(select.title.length).toBeGreaterThan(20);
    expect(select.value).toBe("bin");
    expect([...select.options].map((o: any) => o.textContent)).toEqual(["The File Manager's Recycle Bin", "The Rip graveyard"]);
    expect(dialog().textContent).toContain("shared with Rip Studio");
    choose(select, "graveyard");
    await until(() => state.settings.deleteTo === "graveyard", "the setting to be saved");
    await until(async () => (await call("settings")).settings.deleteTo === "graveyard", "the server to hold it");
    closeAll();

    const dir = folder();
    const f = write(join(dir, "setting.txt"));
    const g = write(join(dir, "binned.txt"));
    await nav.goTo(dir, { push: false });
    await selectPath(f);
    key("Delete");
    await until(() => !existsSync(f), "Delete to bury");
    expect((await listed()).map((i) => i.name)).toEqual(["setting.txt"]);
    expect((await call("trash/list")).count).toBe(0);
    expect(toasts()).toContain("Buried 1 item");
    // the menu says what Delete does now, and "Move to Recycle Bin" still means the bin
    await nav.goTo(dir, { push: false });
    state.selection = new Set([g]);
    contextmenu.showEntryMenu(state.entries.filter((e: any) => e.path === g), { x: 10, y: 10 });
    const labels = qa(".menu .menu-item").map((b) => [b.querySelector(".menu-label").textContent, b.querySelector(".menu-shortcut")?.textContent ?? ""]);
    expect(labels.find((l) => l[0] === "Bury (Rip)")![1]).toContain("Del");
    const bin = qa(".menu .menu-item").find((b) => b.querySelector(".menu-label").textContent === "Move to Recycle Bin");
    bin.click();
    await until(() => !existsSync(g), "the explicit Recycle Bin item");
    expect((await call("trash/list")).items.map((t: any) => t.name)).toEqual(["binned.txt"]);
    expect((await listed()).map((i) => i.name)).toEqual(["setting.txt"]);
    // the Recycle Bin view still shows the old bin only
    await nav.showTrash();
    expect(state.trashItems.map((i: any) => i.name)).toEqual(["binned.txt"]);
    await nav.goTo(work, { push: false });
    // the toolbar button says what it does
    toolbar.updateToolbar();
    expect(q("#tool-delete").title).toContain("graveyard");

    // and back to the default
    await call("settings", { set: { deleteTo: "bin" } });
    state.settings.deleteTo = "bin";
    toolbar.updateToolbar();
    expect(q("#tool-delete").title).toContain("Move to the Recycle Bin");
    const h2 = write(join(dir, "default-again.txt"));
    await nav.goTo(dir, { push: false });
    await selectPath(h2);
    key("Delete");
    await until(() => !existsSync(h2), "Delete to the bin again");
    expect((await call("trash/list")).items.map((t: any) => t.name).sort()).toEqual(["binned.txt", "default-again.txt"]);
    expect((await listed()).map((i) => i.name)).toEqual(["setting.txt"]);
  });
});
