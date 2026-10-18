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
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
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
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform).replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
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
  state.sep = process.platform === "win32" ? "\\" : "/";
  state.places = [];
  state.drives = [];
  state.platform = process.platform;
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
    await waitFor(() => existsSync(join(work, "New database.sqlite")) && readFileSync(join(work, "New database.sqlite")).length >= 4096, 4000, "the initialized database file");
    expect(readFileSync(join(work, "New database.sqlite")).subarray(0, 15).toString()).toBe("SQLite format 3");
    expect(state.location.path).toBe(work);
  });

  test("offers New dated folder and New dated note, creating YYYY-MM-DD folders and notes on disk", async () => {
    const ops = await import("../resources/file_manager/ui/ops.js");
    const stamp = ops.localDateStamp();
    contextmenu.showBackgroundMenu({ x: 5, y: 5 });
    expect(menuLabels()).toContain(`New dated folder (${stamp})`);
    expect(menuLabels()).toContain(`New dated note (${stamp}.md)`);
    menuItem(`New dated folder (${stamp})`).click();
    await waitFor(() => existsSync(join(work, stamp)), 4000, "the dated folder");
    expect(existsSync(join(work, stamp))).toBe(true);
    contextmenu.showBackgroundMenu({ x: 5, y: 5 });
    menuItem(`New dated note (${stamp}.md)`).click();
    await waitFor(() => existsSync(join(work, `${stamp}.md`)), 4000, "the dated note");
    expect(existsSync(join(work, `${stamp}.md`))).toBe(true);
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

describe("One-click media actions in the right-click menu and Details panel", () => {
  test("pictures, videos, sounds and 2-file pairs offer tailored one-click actions that all exist in the catalog", async () => {
    const mq = await import("../resources/file_manager/ui/mediaQuick.js");
    const { CATALOG_BY_ID } = await import("../src/features/filemanager/fmConvCatalog");
    const pic = { name: "photo.jpg", path: join(work, "photo.jpg"), isDir: false, size: 120 };
    const pic2 = { name: "second.png", path: join(work, "second.png"), isDir: false, size: 140 };
    const vid = { name: "clip.mov", path: join(work, "clip.mov"), isDir: false, size: 500 };
    const vid2 = { name: "clip2.mp4", path: join(work, "clip2.mp4"), isDir: false, size: 600 };
    const aud = { name: "voice.mp3", path: join(work, "voice.mp3"), isDir: false, size: 200 };
    const aud2 = { name: "voice2.wav", path: join(work, "voice2.wav"), isDir: false, size: 220 };
    const sub = { name: "captions.srt", path: join(work, "captions.srt"), isDir: false, size: 40 };

    for (const sel of [[pic], [pic, pic2], [vid], [vid, vid2], [aud], [aud, aud2], [pic, aud], [vid, aud], [vid, sub]]) {
      for (const a of mq.quickMediaActions(sel)) {
        expect(CATALOG_BY_ID.has(a.id), a.id).toBe(true);
      }
    }

    const picIds = mq.quickMediaActions([pic]).map((a: any) => a.id);
    expect(picIds).toContain("img-rot-right");
    expect(picIds).toContain("img-enhance");
    expect(picIds).toContain("img-scan");
    expect(picIds).toContain("img-png");
    expect(picIds).not.toContain("img-jpg"); // already a JPG

    const multiPicIds = mq.quickMediaActions([pic, pic2]).map((a: any) => a.id);
    expect(multiPicIds).toContain("img-combine-pdf");
    expect(multiPicIds).toContain("img-montage");
    expect(multiPicIds).toContain("img-gif-anim");

    const vidIds = mq.quickMediaActions([vid]).map((a: any) => a.id);
    expect(vidIds).toContain("vid-small");
    expect(vidIds).toContain("vid-mp3");
    expect(vidIds).toContain("vid-mute");
    expect(vidIds).toContain("vid-vertical-blur");
    expect(vidIds).toContain("vid-normalize");
    expect(vidIds).toContain("vid-voice");
    expect(vidIds).toContain("vid-mp4");

    const audIds = mq.quickMediaActions([aud]).map((a: any) => a.id);
    expect(audIds).toContain("aud-normalize");
    expect(audIds).toContain("aud-voice");
    expect(audIds).toContain("aud-denoise");
    expect(audIds).toContain("aud-silence");
    expect(audIds).toContain("aud-small-voice");
    expect(audIds).toContain("aud-wav");
    expect(audIds).not.toContain("aud-mp3"); // already MP3

    expect(mq.quickMediaActions([pic, aud]).map((a: any) => a.id)).toEqual(["vid-still"]);
    expect(mq.quickMediaActions([vid, aud]).map((a: any) => a.id)).toEqual(["vid-add-music"]);
    expect(mq.quickMediaActions([vid, sub]).map((a: any) => a.id)).toEqual(["vid-burn-subs"]);

    // Right-click menu includes One-click media items for a video, and Paint in Paint Studio for a picture
    closeAll();
    contextmenu.showEntryMenu([vid], { x: 5, y: 5 });
    expect(menuLabels()).toContain("Make smaller for sharing");
    expect(menuLabels()).toContain("Save the sound as MP3");
    expect(menuLabels()).toContain("Remove the sound (mute)");
    closeAll();
    contextmenu.showEntryMenu([pic], { x: 5, y: 5 });
    expect(menuLabels()).toContain("Edit in Image Studio");
    expect(menuLabels()).toContain("Paint in Paint Studio");
    closeAll();

    // Paint Studio power tab is registered in Pictures and media
    await import("../resources/file_manager/ui/paint.js");
    const { listPowerTabs } = await import("../resources/file_manager/ui/power.js");
    expect(listPowerTabs().find((t: any) => t.id === "paint")).toMatchObject({
      id: "paint",
      label: "Paint Studio",
      icon: "🖌️",
      group: "media",
      groupLabel: "Pictures and media",
    });

    // Details panel card renders buttons with tooltips and data-quick-action
    const card = mq.quickMediaBlock([aud]);
    expect(card).not.toBeNull();
    const btns = [...card!.querySelectorAll("button.mq-btn")];
    expect(btns.length).toBeGreaterThanOrEqual(6);
    expect(btns.some((b: any) => b.dataset.quickAction === "aud-voice")).toBe(true);
    expect(btns.every((b: any) => b.getAttribute("title")?.length > 10)).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
  });
});
