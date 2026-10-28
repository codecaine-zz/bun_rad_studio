import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Convert & process window, run for real in a fake browser (jsdom) against the real server. The fake browser's
// globals are removed again in afterAll so that other test files are not affected.
const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

const root = mkdtempSync(join(tmpdir(), "fm-convert-ui-"));
const home = join(root, "home");
const work = join(home, "work");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let tools: any;
let stateMod: any;
const launched: Array<{ command: string; args: string[] }> = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dialog = () => doc.querySelector(".modal-backdrop .dialog");
const box = () => doc.querySelector(".tools-box");
const buttons = () => [...dialog().querySelectorAll("button")];
const button = (text: string): any => buttons().find((b: any) => b.textContent.trim().startsWith(text));
const items = (): any[] => [...dialog().querySelectorAll(".cv-item")];
const labelOf = (item: any) => item.querySelector(".cv-label").textContent;
const itemFor = (label: string) => items().find((i) => labelOf(i) === label);
const type = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
};
const fire = (el: any, name: string) => el.dispatchEvent(new doc.defaultView.Event(name, { bubbles: true }));
const field = (label: string): any => [...dialog().querySelectorAll(".cv-field")].find((f: any) => f.querySelector("label")?.textContent.trim().startsWith(label))!.querySelector("input, select");
const closeDialog = async () => {
  doc.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(20);
};

function select(paths: Array<{ name: string; isDir?: boolean }>) {
  stateMod.state.location = { kind: "folder", path: work };
  stateMod.state.entries = paths.map((p) => ({ name: p.name, path: join(work, p.name), isDir: !!p.isDir, size: 1, mtimeMs: 0, label: "File" }));
  stateMod.state.selection = new Set(paths.map((p) => join(work, p.name)));
}

beforeAll(async () => {
  mkdirSync(join(work, "pics"), { recursive: true });
  writeFileSync(join(work, "data.csv"), "name,qty\nbolt,3\nnut,5\n");
  writeFileSync(join(work, "photo.png"), "png");
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data"), toolDirs: [join(root, "no-tools")], launch: async (command, args) => { launched.push({ command, args }); } } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform);
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  // The terminal needs the xterm library, which only a real browser can load; nothing here uses the terminal.
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => false, typeInTerminal: () => false }));
  stateMod = await import("../resources/file_manager/ui/state.js");
  tools = await import("../resources/file_manager/ui/tools.js");
});

afterAll(() => {
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const before = saved.get(key);
    if (before) Object.defineProperty(g, key, before);
    else delete g[key];
  }
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("the Convert & process window in a browser-like page", () => {
  test("it asks the question, says what is selected, and lists only what applies, grouped", async () => {
    select([{ name: "data.csv" }, { name: "photo.png" }, { name: "pics", isDir: true }]);
    await tools.showToolsDialog();
    expect(dialog().querySelector(".dialog-title").textContent).toBe("Convert & process");
    expect(box().querySelector(".cv-question").textContent).toBe("What do you want to turn these into?");
    expect(box().querySelector(".cv-selected").textContent).toContain("Selected: 1 folder, 1 spreadsheet and 1 picture");
    const groups = [...box().querySelectorAll(".cv-group h3")].map((h: any) => h.firstChild.textContent);
    expect(groups).toEqual(["Pictures", "Documents", "Data & text", "Archives", "Other"]);
    expect(labelOf(itemFor("Convert to JSON"))).toBe("Convert to JSON");
    expect(itemFor("Convert to JSON").querySelector(".cv-badge").textContent).toBe("Built in");
    expect(itemFor("Zip into one .zip file").querySelector(".cv-mode").textContent).toContain("one new item");
    expect(itemFor("Convert to MP3")).toBeUndefined();
    expect(itemFor("Make the PDF file smaller")).toBeUndefined();
  });

  test("what needs a helper program is shown as unavailable, says what to install, and offers it", () => {
    const web = itemFor("Make a web-sized picture")!;
    expect(web.querySelector(".cv-main").disabled).toBe(true);
    expect(web.querySelector(".cv-badge").textContent).toBe("Needs ImageMagick");
    expect(web.querySelector(".cv-why").textContent).toContain("ImageMagick isn't installed yet");
    expect(web.querySelector("button.btn").textContent).toContain("How to install ImageMagick");
    expect(web.dataset.available).toBe("false");
  });

  test("the search box narrows the list by any word, and the group buttons filter", () => {
    const search = box().querySelector(".cv-search");
    expect(search.getAttribute("aria-label")).toBeTruthy();
    type(search, "zip");
    expect(items().map(labelOf)).toContain("Zip into one .zip file");
    expect(items().length).toBeLessThan(8);
    expect(box().querySelector(".cv-count").textContent).toContain("you can make");
    type(search, "no such thing at all");
    expect(items().length).toBe(0);
    expect(box().querySelector(".cv-count").textContent).toContain("Nothing matches");
    type(search, "");
    const chip = [...box().querySelectorAll(".cv-chip")].find((c: any) => c.textContent === "Data & text");
    chip.click();
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(items().every((i) => ["Data & text"].includes(i.closest(".cv-group")?.getAttribute("aria-label") ?? "Data & text"))).toBe(true);
    [...box().querySelectorAll(".cv-chip")].find((c: any) => c.textContent === "All").click();
    expect(items().length).toBeGreaterThan(10);
  });

  test("an action opens its options, with labels, tooltips, and a preview of the new file names", async () => {
    itemFor("Make a spreadsheet file (CSV)") ?? null;
    select([{ name: "data.csv" }]);
    await closeDialog();
    await tools.showToolsDialog();
    itemFor("Make SQL INSERT statements")!.querySelector(".cv-main").click();
    expect(dialog().querySelector(".dialog-title").textContent).toBe("Make SQL INSERT statements");
    expect(box().textContent).toContain("One new file is made.");
    expect(box().textContent).toContain("The originals are never changed.");
    expect(box().querySelector(".cv-dest legend").textContent).toContain("Where do the new files go");
    for (const c of dialog().querySelectorAll("input, select")) {
      expect(c.labels?.length || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
      expect(c.getAttribute("title"), c.outerHTML.slice(0, 120)).toBeTruthy();
    }
    expect(dialog().querySelectorAll("[style]").length).toBe(0);
    expect(field("Table name").value).toBe("data");
    await sleep(500);
    expect(box().querySelector(".cv-preview-list li").textContent).toBe("data.csv → data.sql (Built in)");
    const go = button("Convert");
    expect(go.disabled).toBe(false);
    expect(go.classList.contains("primary")).toBe(true);
  });

  test("a wrong value is explained in words right away, and Convert waits; fixing it brings it back", async () => {
    const table = field("Table name");
    type(table, "x; DROP TABLE y");
    await sleep(600);
    expect(box().querySelector(".cv-problem").textContent).toContain("use letters, digits");
    expect(button("Convert").disabled).toBe(true);
    type(table, "parts");
    await sleep(600);
    expect(box().querySelector(".cv-problem")).toBeNull();
    expect(button("Convert").disabled).toBe(false);
  });

  test("choosing another folder and a name pattern changes the preview; a missing folder is explained", async () => {
    const where = box().querySelector(".cv-dest");
    const radios = [...where.querySelectorAll("input[type=radio]")];
    radios[1].checked = true;
    fire(radios[1], "change");
    type(where.querySelector("input[type=text]"), join(work, "does-not-exist"));
    await sleep(600);
    expect(box().querySelector(".cv-problem").textContent).toContain("doesn't exist");
    type(where.querySelector("input[type=text]"), join(work, "pics"));
    radios[3].checked = true;
    fire(radios[3], "change");
    type([...where.querySelectorAll("input[type=text]")][1], "{name} dump");
    await sleep(600);
    expect(box().querySelector(".cv-preview-list li").textContent).toBe("data.csv → data dump.sql (Built in)");
    expect(box().querySelector(".cv-preview").textContent).toContain(join(work, "pics"));
  });

  test("Convert starts the job, closes the window, and the new file appears with a task card", async () => {
    const choose = [...box().querySelectorAll(".cv-dest input[type=radio]")];
    choose[0].checked = true;
    fire(choose[0], "change");
    choose[2].checked = true;
    fire(choose[2], "change");
    await sleep(600);
    button("Convert").click();
    await sleep(100);
    expect(doc.querySelector(".modal-backdrop")).toBeNull();
    for (let i = 0; i < 100 && !existsSync(join(work, "data.sql")); i++) await sleep(30);
    expect(readFileSync(join(work, "data.sql"), "utf8")).toContain('INSERT INTO "parts"');
    await sleep(900);
    const card = doc.querySelector("#tasks .task");
    expect(card).not.toBeNull();
    expect(card.querySelector(".task-title").textContent).toContain("Make SQL INSERT statements: 1 file");
    expect(card.querySelector(".task-status").textContent).toContain("Done: 1 new file");
  });

  test("Back returns to the list; keyboard: Down from the search box reaches the first choice; Escape closes", async () => {
    select([{ name: "data.csv" }]);
    await tools.showToolsDialog();
    itemFor("Convert to YAML")!.querySelector(".cv-main").click();
    button("← Back").click();
    expect(box().querySelector(".cv-question")).not.toBeNull();
    const search = box().querySelector(".cv-search");
    search.focus();
    search.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(doc.activeElement.classList.contains("cv-main")).toBe(true);
    await closeDialog();
    expect(doc.querySelector(".modal-backdrop")).toBeNull();
  });

  test("the helper programs are one click away: the main ones first, then the extras, with sizes for the big ones", async () => {
    select([{ name: "data.csv" }]);
    await tools.showToolsDialog();
    button("Helper programs").click();
    expect(dialog().querySelector(".dialog-title").textContent).toBe("Helper programs");
    const heads = [...box().querySelectorAll(".tools-heading")].map((h: any) => h.textContent);
    expect(heads[0]).toContain("main helpers");
    expect(heads[1]).toContain("More helpers");
    const names = [...box().querySelectorAll(".tool-head strong")].map((s: any) => s.textContent);
    expect(names.slice(0, 3)).toEqual(["ffmpeg", "ImageMagick", "pandoc"]);
    expect(names).toContain("LibreOffice");
    expect(names).toContain("calibre");
    const expectedHelpers = process.platform === "darwin" ? 16 : 15;
    expect(names.length).toBe(expectedHelpers);
    button("← Back to the list").click();
    expect(box().querySelector(".cv-question")).not.toBeNull();
    await closeDialog();
  });

  test("with nothing selected, the window explains and still offers the helper programs", async () => {
    select([]);
    await tools.showToolsDialog();
    expect(box().textContent).toContain("Select some files or folders first");
    expect(box().querySelectorAll(".tool-block").length).toBe(process.platform === "darwin" ? 16 : 15);
    await closeDialog();
  });

  test("helper downloads are clickable and use the authenticated native browser opener", async () => {
    select([]);
    await tools.showToolsDialog();
    const before = launched.length;
    button("Download ffmpeg").click();
    for (let i = 0; i < 100 && launched.length === before; i++) await sleep(20);
    expect(launched.length).toBe(before + 1);
    expect(launched.at(-1)!.args).toContain("https://ffmpeg.org/download.html");
    await closeDialog();
  });

  test("nothing in the window builds HTML from text or uses inline styles", () => {
    for (const f of ["tools.js", "convert.js", "convertopts.js", "convertdata.js"]) {
      const text = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "ui", f), "utf8");
      expect(text, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|setAttribute\(\s*["']style/);
    }
  });
});
