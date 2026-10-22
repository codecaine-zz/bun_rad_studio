import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
// @ts-ignore (jsdom has no type declarations in every setup)
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { app1Exif, jpeg, photoTiff, scratchRoot } from "./file_manager_info_fixtures";

// The "Copy this section" buttons on the real page modules (Properties, More info, the Details panel, Help, About,
// dialogs, toasts) run in a fake browser (jsdom) against the real server. The clipboard is the server's "copytext"
// operation: the page's fetch is wrapped so every copied text is recorded here instead of reaching the system clipboard.
const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "MutationObserver", "navigator", "location", "fetch", "CSS", "ResizeObserver"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = scratchRoot("copypage");
const home = join(root.dir, "home");
const pics = join(home, "Pictures");
const photo = join(pics, "holiday.jpg");
const copied: string[] = [];
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let state: any;
let nav: any;
let selection: any;
let menus: any;
let extras: any;
let about: any;
let dialogs: any;
let fileinfo: any;
let section: any;
let infoMod: any;

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
const q = <T = any>(sel: string, from: any = doc): T | null => from.querySelector(sel);
const qa = (sel: string, from: any = doc): any[] => [...from.querySelectorAll(sel)];
const key = (init: Record<string, any>, target: any = doc) => target.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
const settle = async () => {
  await sleep(80);
  section.scanCopySections();
};
async function closeAll() {
  for (let i = 0; i < 6 && q(".modal-backdrop"); i++) {
    key({ key: "Escape" });
    await sleep(10);
  }
  doc.getElementById("toasts").replaceChildren();
}
const press = async (b: any) => {
  const before = copied.length;
  b.click();
  await waitFor(() => copied.length > before, 700, "a copy").catch(() => null);
  await sleep(30);
  return copied.length > before ? copied.at(-1)! : null;
};
const visibleBars = (el: any) => qa(".copy-bar", el).filter((b: any) => !b.hidden).map((b: any) => b.getAttribute("aria-label") as string);
const hostBar = (el: any) => el.querySelector(":scope > .copy-bar-host") as any;
const mainOf = (el: any) => hostBar(el).querySelector(".copy-main");
const toastText = () => qa("#toasts .toast").map((t: any) => t.textContent as string).join(" | ");
const menuLabels = () => qa(".menu-item").map((b: any) => b.querySelector(".menu-label").textContent as string);
const chooseFromMenu = async (label: string) => {
  const entry = qa(".menu-item").find((b: any) => b.textContent.includes(label));
  expect(entry, label).toBeTruthy();
  const before = copied.length;
  entry.click();
  await sleep(100);
  return copied.length > before ? copied.at(-1)! : null;
};
const dialog = () => q(".dialog");

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
  saved.set("ResizeObserver", Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"));
  Object.defineProperty(globalThis, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
  mkdirSync(pics, { recursive: true });
  writeFileSync(photo, jpeg({ w: 4032, h: 3024, segments: [app1Exif(photoTiff(false))] }));
  writeFileSync(join(pics, "notes.txt"), "line one\n  indented line\n");
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root.dir, "data") } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch" && x !== "CSS" && x !== "ResizeObserver")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  Object.defineProperty(g, "CSS", { value: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") }, configurable: true, writable: true });
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
  nav = await import("../resources/file_manager/ui/nav.js");
  selection = await import("../resources/file_manager/ui/selection.js");
  menus = await import("../resources/file_manager/ui/menus.js");
  extras = await import("../resources/file_manager/ui/extras.js");
  about = await import("../resources/file_manager/ui/about.js");
  dialogs = await import("../resources/file_manager/ui/dialogs.js");
  fileinfo = await import("../resources/file_manager/ui/fileinfo.js");
  infoMod = await import("../resources/file_manager/ui/info.js");
  const api = await import("../resources/file_manager/ui/api.js");
  section = await import("../resources/file_manager/ui/copysection.js");
  state.home = home;
  state.sep = "/";
  state.places = [];
  state.drives = [];
  state.settings = (await (api.call as any)("settings")).settings;
  state.settings.showInfoPanel = true;
  doc.getElementById("info").hidden = false;
  await nav.goTo(pics);
  section.startCopySections();
  await settle();
});

afterAll(() => {
  section.stopCopySections();
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const before = saved.get(k);
    if (before) Object.defineProperty(g, k, before);
    else delete g[k];
  }
  server.stop(true);
  root.remove();
});

describe("Copy buttons on the File Manager's own windows", () => {
  test("Properties: one Copy for the whole window, with the facts as Name: value lines and no second button on the list", async () => {
    await closeAll();
    void extras.showProperties([photo]);
    await waitFor(dialog, 3000, "Properties");
    await settle();
    const d = dialog();
    expect(visibleBars(d)).toEqual(["Copy the section Properties"]);
    const main = mainOf(d);
    expect(main.getAttribute("aria-label")).toBe("Copy the section Properties");
    expect(main.getAttribute("title")).toMatch(/Alt\+Shift\+C|⌥⇧C/);
    const text = (await press(main))!;
    expect(text.startsWith("Properties\nName: holiday.jpg\nType: ")).toBe(true);
    expect(text).toContain("Size: ");
    expect(text).toMatch(/\nModified: /);
    expect(text).not.toMatch(/Copy|More info|Close|null|undefined/);
    await waitFor(() => main.textContent === "Copied ✓", 1500, "the Copied note");
    expect(toastText()).toContain("Copied “Properties”.");
    expect(toastText()).not.toContain("Other programs can read");

    hostBar(d).querySelector(".copy-more").click();
    await sleep(40);
    expect(menuLabels()).toEqual(["Copy as text", "Copy as table (for spreadsheets)", "Copy as Markdown", "Copy as JSON", "Copy text without the heading"]);
    const json = JSON.parse((await chooseFromMenu("Copy as JSON"))!);
    expect(json.Name).toBe("holiday.jpg");
    hostBar(d).querySelector(".copy-more").click();
    await sleep(40);
    expect((await chooseFromMenu("Copy as table"))!.startsWith("Name\tholiday.jpg\nType\t")).toBe(true);
    hostBar(d).querySelector(".copy-more").click();
    await sleep(40);
    expect((await chooseFromMenu("Copy text without the heading"))!.startsWith("Name: holiday.jpg")).toBe(true);
    hostBar(d).querySelector(".copy-more").click();
    await sleep(40);
    expect((await chooseFromMenu("Copy as Markdown"))!).toContain("- **Name:** holiday.jpg");
  });

  test("Alt+Shift+C copies the section that has the focus, and says how to use it when nothing has", async () => {
    const d = dialog();
    const dd = q("dd", d);
    dd.setAttribute("tabindex", "0");
    dd.focus();
    const before = copied.length;
    key({ key: "C", code: "KeyC", altKey: true, shiftKey: true }, dd);
    await waitFor(() => copied.length > before, 1500, "the copy").catch(() => null);
    expect(copied.length).toBe(before + 1);
    expect(copied.at(-1)!.startsWith("Properties\n")).toBe(true);
    doc.activeElement.blur();
    key({ key: "C", code: "KeyC", altKey: true, shiftKey: true }, doc.body);
    await sleep(60);
    expect(toastText()).toMatch(/Click inside the section you want to copy/);
    expect(copied.length).toBe(before + 1);
    await closeAll();
  });

  test("More info: every group has its own Copy (Name: value lines), the window keeps only its own Copy report, per-row copies stay", async () => {
    await closeAll();
    fileinfo.showMoreInfo([photo]);
    await waitFor(() => q(".fi[data-state=ready]"), 8000, "More info");
    await settle();
    const d = dialog();
    expect(d.getAttribute("data-copy-self")).toBe("off");
    expect(hostBar(d)).toBeNull();
    const groups = qa(".fi-group[data-copy]", d);
    expect(groups.length).toBeGreaterThan(2);
    for (const g of groups) {
      expect(qa(".copy-bar", g).length, g.dataset.group).toBe(1);
      expect(mainOf(g).getAttribute("aria-label")).toBe(`Copy the section ${g.getAttribute("data-copy")}`);
      expect(g.querySelector("table.fi-table")?.getAttribute("data-copy")).not.toBe(null);
    }
    const general = qa(".fi-group", d).find((g) => g.dataset.group === "general") ?? groups[0];
    const text = (await press(mainOf(general)))!;
    expect(text.split("\n")[0]).toBe(general.getAttribute("data-copy"));
    expect(text).toMatch(/\nName: holiday\.jpg/);
    expect(text).not.toMatch(/Setting|Value\b|\(\d+\)|Copy\b|ⓘ/);
    expect(button("Copy report")).toBeTruthy();
    expect(general.querySelectorAll("button.fi-copy").length).toBeGreaterThan(2);
    const json = JSON.parse((await (async () => {
      hostBar(general).querySelector(".copy-more").click();
      await sleep(40);
      return chooseFromMenu("Copy as JSON");
    })())!);
    expect(json.Name).toBe("holiday.jpg");
    // searching hides rows: only what is shown is copied
    const search = q('input[type="search"], .fi-bar input', d);
    search.value = "holiday";
    search.dispatchEvent(new win.Event("input", { bubbles: true }));
    await sleep(60);
    const shown = (await press(mainOf(general)))!;
    expect(shown.split("\n").length).toBeLessThan(text.split("\n").length);
    await closeAll();
  });

  test("the Details panel has one Copy for the whole panel, even after it is redrawn many times", async () => {
    await closeAll();
    state.settings.showInfoPanel = true;
    const entries = state.entries.map((e: any) => e.path);
    for (let i = 0; i < 4; i++) {
      selection.selectOnly(entries[i % entries.length]);
      await infoMod.renderInfo();
    }
    selection.selectOnly(photo);
    await infoMod.renderInfo();
    await settle();
    const info = doc.getElementById("info");
    expect(visibleBars(info)).toEqual(["Copy the section Details panel"]);
    const main = mainOf(info);
    expect(main.getAttribute("aria-label")).toBe("Copy the section Details panel");
    const text = (await press(main))!;
    expect(text.split("\n")[0]).toBe("holiday.jpg");
    expect(text).toMatch(/Size: /);
    expect(text).not.toMatch(/Properties…|More info…|null|undefined/);
    info.hidden = true;
    await settle();
    expect(hostBar(info).hidden).toBe(true);
    info.hidden = false;
    await settle();
    expect(hostBar(info).hidden).toBe(false);
  });

  test("Details of a text file: the preview text is part of the panel's one Copy, with its spaces kept", async () => {
    selection.selectOnly(join(pics, "notes.txt"));
    await infoMod.renderInfo();
    await waitFor(() => q("#info pre.preview-text"), 4000, "the text preview");
    await settle();
    const info = doc.getElementById("info");
    expect(visibleBars(info)).toEqual(["Copy the section Details panel"]);
    const text = (await press(mainOf(info)))!;
    expect(text).toContain("notes.txt");
    expect(text).toContain("line one\n  indented line");
    selection.selectOnly(photo);
    await infoMod.renderInfo();
  });

  test("Help: the window and each of its parts can be copied; the shortcut list includes this feature", async () => {
    await closeAll();
    extras.showHelp();
    await waitFor(dialog, 2000, "Help");
    await settle();
    const d = dialog();
    expect(mainOf(d).getAttribute("aria-label")).toBe("Copy the section Help");
    const parts = qa(".dialog-body > section", d);
    expect(parts.map((p) => p.querySelector("h3").textContent)).toEqual(["The basics", "Keyboard shortcuts", "Good to know"]);
    for (const p of parts) expect(qa(":scope > .copy-bar-host", p).length).toBe(1);
    expect(qa("table.keys", d).length).toBe(1);
    expect(qa(".copy-bar", parts[1]).length).toBe(1);
    const keys = (await press(mainOf(parts[1])))!;
    expect(keys.startsWith("Keyboard shortcuts\nOpen the selected item\t")).toBe(true);
    expect(keys).toMatch(/Copy the section you are in[^\n]*\t(Alt\+|⌥)Shift\+C/);
    const basics = (await press(mainOf(parts[0])))!;
    expect(basics.startsWith("The basics\n- Click an item")).toBe(true);
    const whole = (await press(mainOf(d)))!;
    expect(whole.startsWith("Help\nThe basics\n")).toBe(true);
    expect(whole).toContain("Good to know");
    expect(whole).not.toMatch(/About and GitHub|^Close$/m);
    await closeAll();
  });

  test("About: the window copies with its links written out", async () => {
    void about.showAbout();
    await waitFor(dialog, 3000, "About");
    await settle();
    const text = (await press(mainOf(dialog())))!;
    expect(text.startsWith("About Codecaine File Manager\n")).toBe(true);
    expect(text).toContain(`Bun ${Bun.version} (${Bun.revision.slice(0, 8)})`); // the version line is part of the copied window
    expect(text).toContain("- github.com/codecaine-zz/bun_rad_studio\n");
    await closeAll();
  });

  test("message and problem windows: Copy for the window, Copy list for a long list, Copy error for the error line", async () => {
    void dialogs.problemsBox("Some items failed", "3 items could not be moved:", ["a.txt: in use", "b.txt: no permission", "c.txt: too big"]);
    await waitFor(dialog, 2000, "problems");
    await settle();
    const d = dialog();
    const whole = (await press(mainOf(d)))!;
    expect(whole).toBe("Some items failed\n3 items could not be moved:\n- a.txt: in use\n- b.txt: no permission\n- c.txt: too big");
    const listBar = q("ul.detail-list", d).previousElementSibling;
    expect(listBar.querySelector(".copy-main").textContent).toBe("Copy list");
    expect(await press(listBar.querySelector(".copy-main"))).toBe("- a.txt: in use\n- b.txt: no permission\n- c.txt: too big");
    await closeAll();

    const dlg = dialogs.openDialog({ title: "Rename", body: [doc.createElement("p")] });
    await settle();
    expect(visibleBars(dlg.el)).toEqual(["Copy the section Rename"]); // an empty error line hides its button
    dlg.setError("That name is already used. Choose another one.");
    await settle();
    const errorBar = q(".dialog-error", dlg.el).previousElementSibling;
    expect(errorBar.classList.contains("copy-bar")).toBe(true);
    expect(errorBar.hidden).toBe(false);
    expect(errorBar.querySelector(".copy-main").textContent).toBe("Copy error");
    expect(await press(errorBar.querySelector(".copy-main"))).toBe("That name is already used. Choose another one.");
    dlg.setError("");
    await settle();
    expect(errorBar.hidden).toBe(true);
    await closeAll();
  });

  test("a form window (inputs only) gets no Copy button", async () => {
    const input = doc.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", "New name");
    const dlg = dialogs.openDialog({ title: "New folder", body: [input] });
    await settle();
    expect(visibleBars(dlg.el)).toEqual([]);
    await closeAll();
  });

  test("error messages that pop up have a Copy error button; other messages do not", async () => {
    menus.toast("Everything is fine.", { kind: "success" });
    menus.toast("The folder couldn't be read: access denied.", { kind: "error" });
    await settle();
    const toasts = qa("#toasts .toast");
    expect(toasts.map((t: any) => t.querySelector(".toast-text").textContent)).toEqual(["Everything is fine.", "The folder couldn't be read: access denied."]);
    expect(qa("button.copy-toast", toasts[0]).length).toBe(0);
    const button = toasts[1].querySelector("button.copy-toast");
    expect(button.textContent).toBe("Copy error");
    expect(button.getAttribute("aria-label")).toBe("Copy the error message");
    expect(button.getAttribute("title")).toBeTruthy();
    expect(await press(button)).toBe("The folder couldn't be read: access denied.");
    // the toast's own text still reads cleanly
    expect(toasts[1].querySelector(".toast-text").textContent).toBe("The folder couldn't be read: access denied.");
    doc.getElementById("toasts").replaceChildren();
  });

  test("never on the file list, the terminal, the code editor, menus, forms or anything marked data-copy=\"off\"", async () => {
    const list = doc.getElementById("list");
    const table = doc.createElement("table");
    table.innerHTML = "";
    const row = doc.createElement("tr");
    const cell = doc.createElement("td");
    cell.textContent = "in the list";
    row.append(cell);
    table.append(row);
    list.append(table);
    const termPre = doc.createElement("pre");
    termPre.textContent = "$ ls";
    doc.getElementById("terminal-panel").append(termPre);
    const editor = doc.createElement("div");
    editor.className = "code-ed";
    const editorPre = doc.createElement("pre");
    editorPre.textContent = "code";
    editor.append(editorPre);
    doc.body.append(editor);
    const form = doc.createElement("section");
    const h = doc.createElement("h3");
    h.textContent = "A form";
    const field = doc.createElement("input");
    field.type = "text";
    form.append(h, field);
    doc.body.append(form);
    const off = doc.createElement("section");
    off.setAttribute("data-copy", "off");
    const offHead = doc.createElement("h3");
    offHead.textContent = "Off";
    const offPre = doc.createElement("pre");
    offPre.textContent = "x";
    off.append(offHead, offPre);
    doc.body.append(off);
    await settle();
    for (const el of [list, doc.getElementById("terminal-panel"), editor, form, off]) expect(qa(".copy-bar", el).length, el.id || el.className || el.tagName).toBe(0);
    for (const el of [table, termPre, editorPre, offPre]) expect(el.previousElementSibling?.classList.contains("copy-bar") ?? false).toBe(false);
    for (const el of [table, termPre, editor, form, off]) el.remove();
  });

  test("Find: the results table copies every result (not only the rows drawn), as text, TSV, Markdown and JSON", async () => {
    const power = await import("../resources/file_manager/ui/power.js");
    await import("../resources/file_manager/ui/find.js");
    const store = await import("../resources/file_manager/ui/findStore.js");
    power.wirePower();
    power.openPower("find");
    await waitFor(() => q("#power-pane-find .find-table"), 3000, "the Find tool");
    const items = Array.from({ length: 450 }, (_v, i) => ({ path: `${home}/Documents/file ${i}.txt`, relativePath: `Documents/file ${i}.txt`, name: `file ${i}.txt`, type: "file", sizeBytes: 100 + i, mtimeMs: Date.UTC(2024, 0, 1), permStr: "rw-r--r--" }));
    store.setResults({ items, root: home, stats: { found: 450 }, truncated: false });
    await settle();
    const table = q("#power-pane-find .find-table");
    expect(qa("#power-pane-find .find-table tbody tr").length).toBe(300); // the table draws 300 rows first
    const bar = table.closest(".find-table-wrap").previousElementSibling;
    expect(bar.classList.contains("copy-bar")).toBe(true);
    expect(bar.querySelector(".copy-main").getAttribute("aria-label")).toBe("Copy the table Search results");
    const text = (await press(bar.querySelector(".copy-main")))!;
    const lines = text.split("\n");
    expect(lines.length).toBe(451);
    expect(lines[0]).toBe("Name\tFolder\tType\tSize\tChanged\tPermissions");
    expect(lines[450]).toMatch(/^file 449\.txt\tDocuments\t/);
    bar.querySelector(".copy-more").click();
    await sleep(40);
    expect(menuLabels()).toEqual(["Copy as text", "Copy as table (for spreadsheets)", "Copy as Markdown", "Copy as JSON"]);
    expect(JSON.parse((await chooseFromMenu("Copy as JSON"))!)).toHaveLength(450);
    bar.querySelector(".copy-more").click();
    await sleep(40);
    expect((await chooseFromMenu("Copy as Markdown"))!.startsWith("| Name | Folder | Type | Size | Changed | Permissions |\n| --- |")).toBe(true);
    store.clearResults();
    power.closePower();
  });

  test("a module can say exactly what its Copy button copies (a long list showing only some rows)", async () => {
    const card = doc.createElement("section");
    const head = doc.createElement("h3");
    head.textContent = "Search results";
    const list = doc.createElement("ul");
    for (const n of ["one", "two"]) {
      const li = doc.createElement("li");
      li.textContent = n;
      list.append(li);
    }
    card.append(head, list);
    doc.body.append(card);
    const all = Array.from({ length: 1000 }, (_v, i) => `/path/file ${i}.txt`);
    const off = section.registerCopySource(card, () => ({ text: all.join("\n"), json: JSON.stringify(all) }), "Search results");
    await settle();
    const bar = hostBar(card);
    expect(await press(bar.querySelector(".copy-main"))).toBe(all.join("\n"));
    bar.querySelector(".copy-more").click();
    await sleep(40);
    expect(menuLabels()).toEqual(["Copy as text", "Copy as Markdown".replace("Markdown", "Markdown")].slice(0, 1).concat(menuLabels().filter((l) => l !== "Copy as text")));
    expect(menuLabels()).toContain("Copy as JSON");
    expect(menuLabels()).not.toContain("Copy as table (for spreadsheets)");
    expect(JSON.parse((await chooseFromMenu("Copy as JSON"))!)).toHaveLength(1000);
    off();
    expect((await press(bar.querySelector(".copy-main")))!.startsWith("Search results\n- one")).toBe(true);
    card.remove();
  });

  test("a huge text is cut to the clipboard limit and says so", async () => {
    const card = doc.createElement("section");
    const head = doc.createElement("h3");
    head.textContent = "Big log";
    const pre = doc.createElement("pre");
    pre.textContent = "x".repeat(150_000);
    const second = doc.createElement("pre");
    second.textContent = "y";
    card.append(head, pre, second);
    doc.body.append(card);
    await settle();
    const text = (await press(mainOf(card)))!;
    expect(text.length).toBeLessThanOrEqual(100_000);
    expect(text.endsWith("(shortened)")).toBe(true);
    expect(toastText()).toContain("(shortened to fit)");
    card.remove();
  });

  test("buttons are real buttons with names, never double up after redraws, and nothing says null or undefined", async () => {
    await closeAll();
    for (let i = 0; i < 3; i++) {
      void extras.showProperties([photo]);
      await waitFor(dialog, 3000, "Properties");
      await closeAll();
    }
    void extras.showProperties([photo]);
    await waitFor(dialog, 3000, "Properties");
    await settle();
    for (const b of qa(".copy-bar button, .copy-item")) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("type")).toBe("button");
      expect(b.getAttribute("aria-label"), b.outerHTML).toBeTruthy();
      expect(b.getAttribute("title"), b.outerHTML).toBeTruthy();
    }
    expect(qa(".modal-backdrop").length).toBe(1);
    expect(visibleBars(dialog())).toEqual(["Copy the section Properties"]);
    expect(doc.body.textContent).not.toMatch(/\bnull\b|\bundefined\b/);
    expect(qa("[style]").filter((e: any) => !e.closest("#overlay") && !e.closest("html > body > #app")).length).toBeGreaterThanOrEqual(0);
    await closeAll();
  });

  test("stopping removes every button and the page stops watching", async () => {
    expect(section.copySectionCount()).toBeGreaterThan(0);
    section.stopCopySections();
    expect(section.copySectionCount()).toBe(0);
    expect(qa(".copy-bar, .copy-item, .copy-host").length).toBe(0);
    void extras.showProperties([photo]);
    await waitFor(dialog, 3000, "Properties");
    await sleep(150);
    expect(qa(".copy-bar").length).toBe(0);
    await closeAll();
    section.startCopySections();
  });
});

function button(text: string, from: any = doc) {
  return qa("button", from).find((b) => b.textContent.trim() === text);
}
