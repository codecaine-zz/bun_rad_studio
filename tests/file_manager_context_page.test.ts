import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
// @ts-ignore (jsdom has no type declarations in every setup)
import { JSDOM } from "jsdom";
import { pathToFileUrl } from "../src/features/filemanager/fmPaths";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The right-click actions added with the Bun utilities: Open in your editor, Compare data files…, Copy as a file://
// address, and the editor choice in Settings. Run for real in a fake browser against the real server; the editor is a
// recorder (nothing is ever started) and the clipboard operation is intercepted.
const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "navigator", "location", "fetch", "ResizeObserver"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-ctx-page-"));
const home = join(root, "home");
const work = join(home, "work");
const copied: string[] = [];
const started: string[] = [];
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let state: any;
let contextmenu: any;
let extras: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => any, ms = 4000, what = "condition"): Promise<any> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(15);
  }
}
const q = (sel: string, from: any = doc): any => from.querySelector(sel);
const qa = (sel: string, from: any = doc): any[] => [...from.querySelectorAll(sel)];
const menuItem = (label: string): any => qa(".menu .menu-item").find((b) => b.querySelector(".menu-label").textContent === label);
const menuLabels = (): string[] => qa(".menu .menu-item .menu-label").map((e) => e.textContent);
const dialogText = () => q(".modal-backdrop .dialog")?.textContent ?? "";
const closeAll = () => {
  for (const b of qa(".modal-backdrop")) b.remove();
  q(".menu")?.remove();
  doc.body.classList.remove("modal-open");
};
const entry = (name: string) => ({ name, path: join(work, name), isDir: false, size: 1 });
const toasts = () => q("#toasts")?.textContent ?? "";

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
  saved.set("ResizeObserver", Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"));
  Object.defineProperty(globalThis, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "a b.json"), JSON.stringify({ name: "x", n: 1, list: [1, 2], gone: true }));
  writeFileSync(join(work, "c.yaml"), "name: y\nn: 1\nlist: [1, 2, 3]\nadded: yes\n");
  writeFileSync(join(work, "same1.json"), '{"a":1,"b":[1,2]}');
  writeFileSync(join(work, "same2.yml"), "b: [1, 2]\na: 1 # comment\n");
  writeFileSync(join(work, "bad.toml"), "a = \n");
  writeFileSync(join(work, "notes.txt"), "hello");
  writeFileSync(join(work, "d.csv"), "a,b\n1,2\n");
  server = startFileManagerServer({
    port: 0, token: "ui-token",
    context: { home, dataDir: join(root, "data"), launch: async () => {}, editor: { which: (n) => (n === "code" ? "/usr/local/bin/code" : null), env: {}, open: (p, { command: _c, ...o }) => void started.push(`${p}|${JSON.stringify(o)}`) } },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch" && x !== "ResizeObserver")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", {
    value: async (u: any, o: any) => {
      if (typeof u === "string" && u.endsWith("/api/copytext")) {
        copied.push(JSON.parse(o.body).text);
        return new Response(JSON.stringify({ ok: true, copied: true }), { headers: { "Content-Type": "application/json" } });
      }
      return realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o);
    },
    configurable: true, writable: true,
  });
  doc = win.document;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  contextmenu = await import("../resources/file_manager/ui/contextmenu.js");
  extras = await import("../resources/file_manager/ui/extras.js");
  const api = await import("../resources/file_manager/ui/api.js");
  state.home = home;
  state.sep = "/";
  state.places = [];
  state.drives = [];
  state.platform = process.platform === "darwin" ? "darwin" : "linux";
  state.settings = (await (api.call as any)("settings")).settings;
  state.location = { path: work };
});

afterAll(() => {
  closeAll();
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(g, k, d);
    else delete g[k];
  }
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("right-click on empty space", () => {
  test("offers a new SQLite database, which makes a real database file in the folder and selects it for renaming", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const { goTo } = await import("../resources/file_manager/ui/nav.js");
    await goTo(work);
    contextmenu.showBackgroundMenu({ x: 5, y: 5 });
    expect(menuLabels()).toContain("New SQLite database");
    expect(menuLabels().indexOf("New SQLite database")).toBe(menuLabels().indexOf("New file") + 1);
    expect(menuItem("New SQLite database").getAttribute("title").length).toBeGreaterThan(30);
    menuItem("New SQLite database").click();
    await waitFor(() => existsSync(join(work, "New database.sqlite")), 4000, "the database file");
    expect(readFileSync(join(work, "New database.sqlite")).subarray(0, 15).toString()).toBe("SQLite format 3");
    expect(state.location.path).toBe(work);
  });
});

describe("right-click actions that use Bun's utilities", () => {
  test("a single text file offers Open in your editor and the file:// copy; every item with a tip has a tooltip", async () => {
    contextmenu.showEntryMenu([entry("notes.txt")], { x: 5, y: 5 });
    expect(menuLabels()).toContain("Open in your editor");
    expect(menuLabels()).toContain("Copy path as a file:// address");
    expect(menuLabels()).not.toContain("Compare data files…");
    for (const label of ["Open in your editor", "Copy path as a file:// address"]) expect(menuItem(label).getAttribute("title").length, label).toBeGreaterThan(30);
    menuItem("Open in your editor").click();
    await waitFor(() => started.length === 1, 4000, "the editor to be asked");
    expect(started[0]).toBe(`${join(work, "notes.txt")}|{"editor":"vscode"}`); // Automatic found the stub's only editor, VS Code
    await waitFor(() => /Sent notes\.txt to code\./.test(toasts()), 3000, "the confirmation");
  });

  test("a folder or a non-text file doesn't get Open in your editor; the data comparison needs exactly two data files", () => {
    contextmenu.showEntryMenu([{ ...entry("d.csv") }], { x: 5, y: 5 });
    expect(menuLabels()).not.toContain("Compare data files…");
    closeAll();
    contextmenu.showEntryMenu([{ name: "work", path: work, isDir: true, size: 0 }], { x: 5, y: 5 });
    expect(menuLabels()).not.toContain("Open in your editor");
    expect(menuLabels()).toContain("Copy path as a file:// address");
    closeAll();
    contextmenu.showEntryMenu([entry("a b.json")], { x: 5, y: 5 });
    expect(menuLabels()).not.toContain("Compare data files…");
    closeAll();
    contextmenu.showEntryMenu([entry("a b.json"), entry("c.yaml"), entry("same1.json")], { x: 5, y: 5 });
    expect(menuLabels()).not.toContain("Compare data files…");
    closeAll();
    contextmenu.showEntryMenu([entry("a b.json"), entry("notes.txt")], { x: 5, y: 5 });
    expect(menuLabels()).not.toContain("Compare data files…");
    closeAll();
  });

  test("copying the file:// address puts the escaped address on the clipboard, one line per item", async () => {
    closeAll();
    contextmenu.showEntryMenu([entry("a b.json"), entry("c.yaml")], { x: 5, y: 5 });
    menuItem("Copy path as a file:// address").click();
    await waitFor(() => copied.length > 0, 3000, "the copy");
    expect(copied.at(-1)).toBe(`${pathToFileUrl(join(work, "a b.json"))}\n${pathToFileUrl(join(work, "c.yaml"))}`);
    expect(copied.at(-1)).toContain("a%20b.json");
    await waitFor(() => /file:\/\/ addresses were copied/.test(toasts()));
  });

  test("two data files: the Compare window says what differs, with a Copy button for each list", async () => {
    closeAll();
    contextmenu.showEntryMenu([entry("a b.json"), entry("c.yaml")], { x: 5, y: 5 });
    expect(menuItem("Compare data files…").getAttribute("title")).toMatch(/ignoring key order/);
    menuItem("Compare data files…").click();
    await waitFor(() => q(".cmp-verdict"), 4000, "the comparison");
    expect(q(".cmp-verdict").textContent).toContain("✖ The files differ: 4 differences.");
    expect(q(".cmp-names").textContent).toContain("Left: a b.json (JSON)");
    expect(q(".cmp-names").textContent).toContain("Right: c.yaml (YAML)");
    const sections = qa(".cmp-section");
    expect(sections.map((s) => s.querySelector(".cmp-title").textContent)).toEqual(["Changed (1)", "Only in the left file (1)", "Only in the right file (2)"]);
    const changed = qa("tbody tr", sections[0]).map((r) => [...r.children].map((c: any) => c.textContent));
    expect(changed).toEqual([["name", '"x"', '"y"']]);
    expect(qa("tbody th", sections[1]).map((e) => e.textContent)).toEqual(["gone"]);
    expect(qa("tbody th", sections[2]).map((e) => e.textContent)).toEqual(["list[2]", "added"]);
    expect(qa("th[scope=col]", sections[0]).map((e) => e.textContent)).toEqual(["Where", "a b.json", "c.yaml"]);
    expect(q(".modal-backdrop").textContent).toMatch(/compared by what they say/);
    expect(q(".modal-backdrop").textContent).not.toMatch(/\bnull\b|\bundefined\b/);
    const before = copied.length;
    sections[1].querySelector("button.copy-item").click();
    await waitFor(() => copied.length === before + 1, 3000, "the copy of one list");
    expect(copied.at(-1)).toBe('Only in the left file\nWhere\tValue\ngone\ttrue');
    q(".cmp-all button").click();
    await waitFor(() => copied.length === before + 2, 3000, "the copy of everything");
    expect(copied.at(-1)).toContain("Left: a b.json (JSON)");
    expect(copied.at(-1)).toContain("4 differences.");
    for (const c of qa("button, input", q(".modal-backdrop"))) expect(c.getAttribute("title") || c.getAttribute("aria-label") || c.textContent, c.outerHTML.slice(0, 80)).toBeTruthy();
    closeAll();
  });

  test("two files that mean the same thing are reported as identical, whatever their format", async () => {
    contextmenu.showEntryMenu([entry("same1.json"), entry("same2.yml")], { x: 5, y: 5 });
    menuItem("Compare data files…").click();
    await waitFor(() => q(".cmp-verdict"), 4000);
    expect(q(".cmp-verdict").textContent).toContain("✔ These files mean exactly the same thing");
    expect(qa(".cmp-section").length).toBe(0);
    expect(dialogText()).toContain("compared by what they say");
    closeAll();
  });

  test("a file that can't be read is explained in a message, and no window opens", async () => {
    contextmenu.showEntryMenu([entry("same1.json"), entry("bad.toml")], { x: 5, y: 5 });
    menuItem("Compare data files…").click();
    await waitFor(() => /bad\.toml" couldn't be read as TOML/.test(toasts()), 4000, "the explanation");
    expect(q(".modal-backdrop")).toBeNull();
  });
});

describe("Settings: the editor choice", () => {
  test("the list says which editors are found, the choice is saved, and the Open in your editor action follows it", async () => {
    closeAll();
    extras.showSettings();
    const select = await waitFor(() => qa(".modal-backdrop select").find((s) => s.getAttribute("aria-label")?.startsWith("Code editor")) && qa(".modal-backdrop select").find((s) => s.getAttribute("aria-label")?.startsWith("Code editor")).options.length === 5 && qa(".modal-backdrop select").find((s) => s.getAttribute("aria-label")?.startsWith("Code editor")), 4000, "the editor list");
    expect([...select.options].map((o: any) => o.textContent)).toEqual(["Automatic", "Visual Studio Code", "Sublime Text (not found)", "WebStorm (not found)", "IntelliJ IDEA (not found)"]);
    expect(select.getAttribute("title")).toMatch(/EDITOR/);
    expect([...select.options].every((o: any) => o.getAttribute("title")?.length > 10)).toBe(true);
    select.value = "vscode";
    select.dispatchEvent(new win.Event("change", { bubbles: true }));
    await waitFor(() => state.settings.editor === "vscode", 3000, "the saved choice");
    closeAll();
    started.length = 0;
    contextmenu.showEntryMenu([entry("notes.txt")], { x: 5, y: 5 });
    menuItem("Open in your editor").click();
    await waitFor(() => started.length === 1);
    expect(started[0]).toContain('"editor":"vscode"');
    // a choice that isn't installed gives the plain explanation
    state.settings.editor = "idea";
    await (await import("../resources/file_manager/ui/api.js")).call("settings", { set: { editor: "idea" } });
    contextmenu.showEntryMenu([entry("notes.txt")], { x: 5, y: 5 });
    menuItem("Open in your editor").click();
    await waitFor(() => /IntelliJ IDEA can't be started from here/.test(toasts()), 3000, "the explanation");
    expect(started.length).toBe(1);
  });
});
