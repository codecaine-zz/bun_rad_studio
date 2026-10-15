import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Code tab, mounted for real in a fake browser (jsdom) against the real server. Typing is simulated with key and
// input events, so what is tested is the page's own handling of them. The terminal (which needs a real shell and the
// xterm library) is replaced by a recorder, so we can see what "Run" would type there.
const GLOBALS = ["document", "window", "Node", "Event", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "navigator", "location", "fetch", "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "getComputedStyle", "InputEvent", "KeyboardEvent", "MouseEvent"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const typedInTerminal: string[] = [];

const root = mkdtempSync(join(tmpdir(), "fm-code-ui-"));
const home = join(root, "home");
const work = join(home, "proj");
const big = Array.from({ length: 1250 }, (_, i) => `export function fn${i}(a: number, b: string) {\n  const value${i} = a + ${i};\n  return value${i};\n}\n`).join("");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let code: any;
let call: any;
let logic: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Waits for something that happens in the server or the page; a loaded machine only makes it take longer.
async function until<T>(fn: () => T | Promise<T>, label: string, ms = 20000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await Promise.resolve(fn()).catch(() => null);
    if (v) return v as NonNullable<T>;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await sleep(25);
  }
}
// The page reads its platform once, when the first page test loads its modules, so ask the page what it decided.
let mod: "metaKey" | "ctrlKey" = process.platform === "darwin" ? "metaKey" : "ctrlKey";
const tabNames = () => [...doc.querySelectorAll(".code-tab-name")].map((e: any) => e.textContent);
const active = (): any => doc.querySelector(".code-ed:not([hidden]) textarea");
const options = (): string[] => [...doc.querySelectorAll(".code-ed:not([hidden]) .code-ac:not([hidden]) [role=option] .code-ac-label")].map((e: any) => e.textContent);
const toasts = (): string[] => [...doc.querySelectorAll("#toasts .toast-text")].map((e: any) => e.textContent);
const status = (name: string): string => doc.querySelector(`.code-root .code-st-${name}`).textContent;
const dialogButton = (text: string): any => [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.trim() === text);
const button = (text: string): any => [...doc.querySelectorAll(".code-root button")].find((b: any) => b.textContent.trim().includes(text));

function press(ta: any, key: string, extra: Record<string, unknown> = {}) {
  const ev = new win.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  ta.dispatchEvent(ev);
  return ev;
}
function insert(ta: any, text: string) {
  ta.dispatchEvent(new win.InputEvent("beforeinput", { inputType: "insertText", data: text, bubbles: true, cancelable: true }));
  ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
  ta.dispatchEvent(new win.InputEvent("input", { inputType: "insertText", data: text, bubbles: true }));
}
function type(ta: any, text: string) {
  for (const ch of text) {
    const ev = press(ta, ch === "\n" ? "Enter" : ch);
    if (!ev.defaultPrevented) insert(ta, ch);
  }
}
const caretToEnd = (ta: any) => ta.setSelectionRange(ta.value.length, ta.value.length);
async function openFile(name: string) {
  await code.openInCode(join(work, name));
  await sleep(350);
}

beforeAll(async () => {
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "hello.v"), 'module main\n\nfn main() {\n\tprintln("hi")\n}\n');
  writeFileSync(join(work, "a.ts"), "const items = [1, 2, 3];\nfunction total(list: number[]) {\n  return list.length;\n}\n");
  writeFileSync(join(work, "notes.txt"), "one\ntwo\n");
  writeFileSync(join(work, "big.ts"), big);
  writeFileSync(join(work, "program.bin"), Buffer.from([0, 1, 2, 3, 0, 0, 255, 0]));
  mock.module("../resources/file_manager/ui/terminal.js", () => ({
    terminalAvailable: () => true,
    typeInTerminal: (text: string) => (typedInTerminal.push(text), true),
    showTerminal() {},
    isTerminalOpen: () => false,
  }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data") } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform);
  const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key]?.bind ? (dom.window as any)[key].bind(dom.window) : (dom.window as any)[key], configurable: true, writable: true });
  for (const key of ["Node", "Event", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "InputEvent", "KeyboardEvent", "MouseEvent"]) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  Object.defineProperty(g, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  // jsdom has no layout; without this the editor thinks it is hidden and paints nothing
  Object.defineProperty((dom.window as any).HTMLElement.prototype, "offsetParent", { get() { return dom.window.document.body; }, configurable: true });
  doc = dom.window.document;
  win = dom.window;
  const power = await import("../resources/file_manager/ui/power.js");
  call = (await import("../resources/file_manager/ui/api.js")).call;
  logic = await import("../resources/file_manager/ui/codeLogic.js");
  code = await import("../resources/file_manager/ui/code.js");
  // The page's shared state outlives the page tests that ran before this one in the same process (the Recycle Bin as the
  // current place changes what the right-click menu offers): start from an ordinary folder.
  const shared = (await import("../resources/file_manager/ui/state.js")).state;
  Object.assign(shared, { location: { kind: "folder", path: work }, search: null, workspace: "files", powerOpen: false });
  shared.selection.clear();
  mod = shared.platform === "darwin" ? "metaKey" : "ctrlKey";
  power.wirePower();
  power.openPower("code");
  await sleep(500);
});

afterAll(async () => {
  await sleep(2000); // let the page's own delayed work (saving the session, refreshing the outline) finish while its globals still exist
  (await import("../resources/file_manager/ui/menus.js")).closeMenu(); // an open menu would make the next page test ignore its shortcuts
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const before = saved.get(key);
    if (before) Object.defineProperty(g, key, before);
    else delete g[key];
  }
  mock.restore();
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("the Code tab in a browser-like page", () => {
  test("starts on the welcome screen, with every control labelled and explained", () => {
    expect(doc.querySelector("#power-tab-code")).toBeTruthy();
    expect(doc.querySelector(".code-welcome").textContent).toContain("Code editor");
    expect(doc.querySelector(".code-welcome").textContent).not.toContain("null");
    for (const c of doc.querySelectorAll(".code-root button, .code-root input")) {
      expect(c.getAttribute("title") || c.getAttribute("aria-label") || c.textContent.trim() || c.labels?.length, c.outerHTML.slice(0, 120)).toBeTruthy();
    }
    expect(doc.querySelectorAll(".code-root [style]").length).toBe(0);
  });

  test("opens a file once, even when it is asked for twice at the same moment", async () => {
    await Promise.all([code.openInCode(join(work, "a.ts")), code.openInCode(join(work, "a.ts"))]);
    await sleep(500);
    expect(tabNames()).toEqual(["a.ts"]);
    expect(active().value).toContain("function total");
    expect(status("lang")).toBe("TypeScript");
    expect(status("saved")).toBe("Saved");
  });

  test("refuses a binary file with a plain message and opens no tab", async () => {
    await openFile("program.bin");
    expect(tabNames()).toEqual(["a.ts"]);
    expect(toasts().join(" ")).toMatch(/binary|text/i);
  });

  test("editing marks the tab unsaved; Save writes the file; the guard knows about unsaved work", async () => {
    const ta = active();
    caretToEnd(ta);
    type(ta, "\nconst z = 1;\n");
    expect(doc.querySelector(".code-dot")).toBeTruthy();
    expect(status("saved")).toContain("Unsaved");
    expect(code.codeHasUnsaved()).toBe(true);
    press(ta, "s", { [mod]: true });
    await until(() => readFileSync(join(work, "a.ts"), "utf8").includes("const z = 1;"), "the file to be written");
    await until(() => !doc.querySelector(".code-dot") && !code.codeHasUnsaved(), "the tab to be marked saved");
  });

  test("a file changed on disk is noticed when saving, and Overwrite is a choice", async () => {
    const path = join(work, "a.ts");
    writeFileSync(path, "// changed by someone else\n");
    const later = new Date(Date.now() + 5000);
    utimesSync(path, later, later);
    const ta = active();
    caretToEnd(ta);
    type(ta, "// mine\n");
    press(ta, "s", { [mod]: true });
    await until(() => doc.querySelector(".modal-backdrop"), "the changed-on-disk dialog");
    expect(doc.querySelector(".modal-backdrop").textContent).toContain("changed on disk");
    expect(readFileSync(path, "utf8")).toBe("// changed by someone else\n");
    dialogButton("Overwrite the file").click();
    await until(() => readFileSync(path, "utf8").includes("// mine"), "the file to be overwritten");
    await until(() => !code.codeHasUnsaved(), "the tab to be marked saved");
  });

  test("a completion list opens while typing, narrows as you type, and Enter accepts", async () => {
    const ta = active();
    caretToEnd(ta);
    type(ta, "\nconst r = tot");
    await sleep(50);
    expect(options()[0]).toBe("total");
    const box = doc.querySelector(".code-ed:not([hidden]) .code-ac");
    expect(box.getAttribute("role")).toBe("listbox");
    expect(doc.querySelector(".code-ed:not([hidden]) [role=option][aria-selected=true]")).toBeTruthy();
    expect(ta.getAttribute("aria-expanded")).toBe("true");
    type(ta, "a");
    expect(options()[0]).toBe("total");
    press(ta, "Enter");
    await sleep(20);
    expect(ta.value.endsWith("const r = total()") || ta.value.endsWith("const r = total(")).toBe(true);
    expect(options()).toEqual([]);
    expect(ta.getAttribute("aria-expanded")).toBe("false");
  });

  test("Escape closes the list, and Ctrl+Space or Alt+/ opens it on demand", async () => {
    const ta = active();
    caretToEnd(ta);
    type(ta, "\ncon");
    expect(options().length).toBeGreaterThan(0);
    press(ta, "Escape");
    expect(options()).toEqual([]);
    press(ta, " ", { ctrlKey: true });
    expect(options().length).toBeGreaterThan(0);
    press(ta, "Escape");
    press(ta, "/", { altKey: true, code: "Slash" });
    expect(options().length).toBeGreaterThan(0);
    press(ta, "Escape");
  });

  test("a signature tip appears while typing a call", async () => {
    const ta = active();
    caretToEnd(ta);
    type(ta, "\ntotal(");
    const tip = doc.querySelector(".code-ed:not([hidden]) .code-sig");
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toContain("total(list: number[])");
  });

  test("turning suggestions off stops the list, and the choice is kept in the session", async () => {
    const ta = active();
    await sleep(10);
    button("View").click();
    await sleep(50);
    const item = [...doc.querySelectorAll("[role=menuitemcheckbox], [role=menuitem]")].find((e: any) => e.textContent.includes("Code suggestions"));
    item.click();
    await sleep(900);
    caretToEnd(ta);
    type(ta, "\nconst q = tot");
    expect(options()).toEqual([]);
    await until(async () => (await call("code/session", {})).session.settings.completion === false, "the choice to reach the session");
    button("View").click();
    await sleep(50);
    [...doc.querySelectorAll("[role=menuitemcheckbox], [role=menuitem]")].find((e: any) => e.textContent.includes("Code suggestions")).click();
    await sleep(300);
  });

  test("a V file is recognised, coloured, and its snippets have tab stops with mirrors", async () => {
    await openFile("hello.v");
    expect(status("lang")).toBe("V");
    expect(status("indent")).toBe("Tabs");
    const keywords = [...doc.querySelectorAll(".code-ed:not([hidden]) .code-t-keyword")].map((e: any) => e.textContent);
    expect(keywords).toContain("fn");
    expect(keywords).toContain("module");
    const ta = active();
    caretToEnd(ta);
    type(ta, "\ngeneric");
    await until(() => options().includes("generic"), "the suggestion list");
    const row = [...doc.querySelectorAll(".code-ed:not([hidden]) .code-ac [role=option]")].find((e: any) => e.querySelector(".code-ac-label").textContent === "generic" && e.querySelector(".code-ac-k-snippet"));
    expect(row).toBeTruthy();
    row.click();
    await sleep(20);
    expect(ta.value.endsWith("fn name[T](x T) T {\n\treturn x\n}")).toBe(true);
    expect(ta.value.slice(ta.selectionStart, ta.selectionEnd)).toBe("name");
    type(ta, "first");
    press(ta, "Tab");
    expect(ta.value.slice(ta.selectionStart, ta.selectionEnd)).toBe("T");
    type(ta, "U");
    expect(ta.value).toContain("fn first[U](x U) U {");
    press(ta, "Tab");
    expect(ta.value.slice(ta.selectionStart, ta.selectionEnd)).toBe("x");
    type(ta, "v");
    expect(ta.value).toContain("fn first[U](v U) U {\n\treturn v\n}");
    press(ta, "Escape");
  });

  test("Format document on V explains itself: V's own message for bad code, or a friendly note without V", async () => {
    const ta = active();
    ta.setSelectionRange(0, ta.value.length);
    insert(ta, "fn main( {\n");
    const fmt = await call("code/format", { tool: "v", text: "fn main( {\n" });
    if (fmt.available) {
      expect(fmt.formatted).toBe(false);
      expect(fmt.problem).toBeTruthy();
      expect(fmt.problem).not.toContain("fm-vfmt");
    } else expect(fmt.message).toContain("isn't installed");
    button("Tools").click();
    await sleep(50);
    [...doc.querySelectorAll("[role=menuitem]")].find((e: any) => e.textContent.includes("Format document")).click();
    await sleep(2500);
    expect(toasts().join(" | ")).toMatch(/v fmt|isn't installed/);
    expect(ta.value).toBe("fn main( {\n");
  });

  test("a Run preset types its command into the terminal only when Run is clicked", async () => {
    const ta = active();
    ta.setSelectionRange(0, ta.value.length);
    insert(ta, 'module main\n\nfn main() {\n\tprintln("hi")\n}\n');
    press(ta, "s", { [mod]: true });
    await sleep(400);
    expect(typedInTerminal).toEqual([]);
    const file = join(work, "hello.v");
    const saved1 = await call("code/presets/save", { path: file, scope: "file", preset: { name: "Run it", command: "v run {file}", kind: "run", cwd: "file" } });
    await call("code/presets/default", { path: file, id: saved1.presets[0].id, kind: "run" });
    await openFile("notes.txt");
    await openFile("hello.v");
    expect(typedInTerminal).toEqual([]);
    button("Run").click();
    await until(() => typedInTerminal.length > 0, "the command to be typed");
    expect(typedInTerminal.length).toBe(1);
    expect(typedInTerminal[0]).toBe(`cd ${work} && v run ${file}\r`);
    expect(typedInTerminal[0]!.endsWith("\r")).toBe(true);
    expect(typedInTerminal[0]!.slice(0, -1)).not.toContain("\n");
  });

  test("a command that looks risky asks first, and a file name with a line break is refused", async () => {
    const file = join(work, "hello.v");
    await call("code/presets/save", { path: file, scope: "file", preset: { name: "Clean", command: "rm -rf build", kind: "build", cwd: "file" } });
    const list = await call("code/presets/list", { path: file });
    await call("code/presets/default", { path: file, id: list.presets.find((p: any) => p.name === "Clean").id, kind: "build" });
    const before = typedInTerminal.length;
    button("Build").click();
    await until(() => doc.querySelector(".modal-backdrop"), "the question about the risky command");
    expect(doc.querySelector(".modal-backdrop").textContent).toContain("rm -rf build");
    expect(typedInTerminal.length).toBe(before);
    dialogButton("Cancel").click();
    await sleep(100);
    expect(typedInTerminal.length).toBe(before);
    const bad = logic.buildRunSequence({ command: "echo {file}", cwd: "file" }, { path: "/x/a\nb.v", platform: "linux", workspace: "/x", root: "/x" });
    expect(bad.error).toBeTruthy();
  });

  test("completion on a 5,000-line file takes well under 20 ms", () => {
    const text = `${big}\nconst zz = val`;
    const index = logic.buildIndex(text, "typescript", text.length);
    const started = performance.now();
    let r;
    for (let i = 0; i < 10; i++) r = logic.complete({ text, caret: text.length, lang: "typescript", index, others: [] });
    expect((performance.now() - started) / 10).toBeLessThan(20);
    expect(r.items[0].label).toBe("value0");
  });

  test("Open with → Code editor (built in) opens the file, and the right-click menu offers Edit in Code editor for text files only", async () => {
    const openwith = await import("../resources/file_manager/ui/openwith.js");
    expect(openwith.finishOpen({ builtin: "code", with: "Code editor (built in)" }, join(work, "notes.txt"))).toBe(true);
    await until(() => tabNames().includes("notes.txt"), "the notes.txt tab");
    const menu = await import("../resources/file_manager/ui/contextmenu.js");
    const entry = (name: string, isDir = false) => ({ name, path: join(work, name), isDir, size: 1, mtimeMs: 0, label: "", icon: "" });
    const labels = () => [...doc.querySelectorAll("[role=menuitem]")].map((e: any) => e.textContent);
    menu.showEntryMenu([entry("hello.v")], { x: 5, y: 5 });
    expect(labels().join("|")).toContain("Edit in Code editor");
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(50);
    menu.showEntryMenu([entry("program.bin")], { x: 5, y: 5 });
    expect(labels().join("|")).not.toContain("Edit in Code editor");
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(50);
    menu.showEntryMenu([entry("src", true)], { x: 5, y: 5 });
    expect(labels().join("|")).toContain("Open folder in Code editor");
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  test("zen mode always shows a way out: a visible button, Esc, and a hint when it starts", async () => {
    await openFile("notes.txt");
    const root = doc.querySelector(".code-root");
    const exit = doc.querySelector(".code-zen-exit");
    expect(exit).toBeTruthy();
    expect(exit.getAttribute("aria-label")).toBe("Leave zen mode");
    expect(root.classList.contains("code-zen")).toBe(false);
    button("⛶ Zen")?.click();
    await sleep(100);
    expect(root.classList.contains("code-zen")).toBe(true);
    expect(doc.querySelector("#toasts").textContent).toContain("Leave zen mode");
    // The button is the only one left in the toolbar's place, and it works.
    exit.click();
    await sleep(100);
    expect(root.classList.contains("code-zen")).toBe(false);
    // Esc leaves it too, from inside the text.
    button("⛶ Zen")?.click();
    await sleep(100);
    expect(root.classList.contains("code-zen")).toBe(true);
    const esc = new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    active().dispatchEvent(esc);
    await sleep(100);
    expect(root.classList.contains("code-zen")).toBe(false);
  });

  test("closing a tab with unsaved changes asks first", async () => {
    await openFile("notes.txt");
    const ta = active();
    caretToEnd(ta);
    type(ta, "more\n");
    button("Close notes.txt")?.click();
    doc.querySelector('.code-tab-close[aria-label="Close notes.txt"]').click();
    await sleep(100);
    expect(doc.querySelector(".modal-backdrop").textContent).toMatch(/unsaved/i);
    dialogButton("Cancel").click();
    await sleep(100);
    expect(tabNames()).toContain("notes.txt");
    expect(existsSync(join(work, "notes.txt"))).toBe(true);
    expect(readFileSync(join(work, "notes.txt"), "utf8")).toBe("one\ntwo\n");
  });

  describe("autosave", () => {
    const helloPath = () => join(work, "hello.v");
    const toggle = () => doc.querySelector(".code-root .code-st-autosave");

    test("is off by default, and nothing is saved by itself", async () => {
      await openFile("hello.v");
      expect(toggle().textContent).toBe("Autosave: Off");
      expect(toggle().getAttribute("aria-pressed")).toBe("false");
      const before = readFileSync(helloPath(), "utf8");
      const ta = active();
      caretToEnd(ta);
      type(ta, "// edited\n");
      await sleep(1900);
      expect(readFileSync(helloPath(), "utf8")).toBe(before);
      expect(status("saved")).toContain("Unsaved");
      press(ta, "s", { [mod]: true });
      await sleep(400);
    });

    test("the status button turns it on, the choice is remembered, and it saves after the delay", async () => {
      toggle().click();
      await sleep(300);
      expect(toggle().textContent).toBe("Autosave: On (1.5 s)");
      expect(toggle().getAttribute("aria-pressed")).toBe("true");
      for (let i = 0; i < 40 && !(await call("code/session", {})).session.settings.autosave; i++) await sleep(100);
      expect((await call("code/session", {})).session.settings.autosave).toBe(true);
      const ta = active();
      caretToEnd(ta);
      type(ta, "// auto one\n");
      expect(status("saved")).toContain("Unsaved");
      await sleep(900);
      expect(readFileSync(helloPath(), "utf8")).not.toContain("auto one");
      await until(() => readFileSync(helloPath(), "utf8").includes("auto one"), "the autosave");
      await until(() => status("saved") === "Autosaved", "the status line to say Autosaved");
      await until(() => !code.codeHasUnsaved(), "the editor to count it as saved");
    });

    test("typing again restarts the wait, and leaving the editor saves at once", async () => {
      const ta = active();
      caretToEnd(ta);
      type(ta, "// auto two\n");
      await sleep(1000);
      type(ta, "// auto three\n");
      await sleep(1000);
      expect(readFileSync(helloPath(), "utf8")).not.toContain("auto three");
      doc.querySelector(".code-editors").dispatchEvent(new win.FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
      await until(() => readFileSync(helloPath(), "utf8").includes("auto three"), "the autosave when leaving the editor");
      const saved = readFileSync(helloPath(), "utf8");
      expect(saved).toContain("auto two");
      expect(saved).toContain("auto three");
      await until(() => status("saved") === "Autosaved", "the status line to say Autosaved");
    });

    test("the options dialog offers the delays and the switch-away choice, and returns what was chosen", async () => {
      const { askAutosave } = await import("../resources/file_manager/ui/codeDialogs.js");
      const answer = askAutosave({ autosave: true, autosaveDelay: 1500, autosaveOnBlur: true });
      await sleep(50);
      const dialog = doc.querySelector(".modal-backdrop");
      expect(dialog.textContent).toMatch(/new file still needs Save As/i);
      expect([...dialog.querySelectorAll("#autosave-delay option")].map((o: any) => o.value)).toEqual(["500", "1500", "3000", "10000", "30000"]);
      const select = dialog.querySelector("#autosave-delay");
      select.value = "10000";
      dialog.querySelector("#autosave-blur").checked = false;
      dialogButton("OK").click();
      expect(await answer).toEqual({ autosave: true, autosaveDelay: 10000, autosaveOnBlur: false });
      const cancelled = askAutosave({ autosave: false, autosaveDelay: 1500, autosaveOnBlur: true });
      await sleep(50);
      expect(doc.querySelector("#autosave-delay").disabled).toBe(true);
      dialogButton("Cancel").click();
      expect(await cancelled).toBeNull();
    });

    test("turning it off again stops the saving", async () => {
      toggle().click();
      await sleep(300);
      expect(toggle().textContent).toBe("Autosave: Off");
      const ta = active();
      caretToEnd(ta);
      type(ta, "// not saved\n");
      await sleep(1900);
      expect(readFileSync(helloPath(), "utf8")).not.toContain("not saved");
      press(ta, "s", { [mod]: true });
      await until(() => !code.codeHasUnsaved(), "the manual save");
    });
  });
});

describe("opening a text file from the file list", () => {
  test("a plain text file with no extension (LICENSE, NOTICE, an unknown name) opens in the built-in editor too", async () => {
    const ops = await import("../resources/file_manager/ui/ops.js");
    writeFileSync(join(work, "LICENSE"), "MIT License\n\nCopyright (c) 2026 Someone\n");
    writeFileSync(join(work, "mystery-notes"), "just some words\nin a file with no ending\n");
    for (const name of ["LICENSE", "mystery-notes"]) {
      await ops.openEntry({ path: join(work, name), name, isDir: false, program: false, size: 40, kind: "other" });
      await sleep(500);
      expect(tabNames(), name).toContain(name);
    }
    expect(ops.textOpensInEditor({ name: "LICENSE", isDir: false, program: false })).toBe(true);
    expect(ops.textOpensInEditor({ name: "mystery-notes", isDir: false, program: false })).toBe(false); // only a look inside tells
    expect(ops.textOpensInEditor({ name: "LICENSE", isDir: false, program: true })).toBe(false); // a program still asks first
  });

  test("by default it opens in the built-in Code editor, not in the computer's program", async () => {
    const ops = await import("../resources/file_manager/ui/ops.js");
    const power = await import("../resources/file_manager/ui/power.js");
    await ops.openEntry({ path: join(work, "notes.txt"), name: "notes.txt", isDir: false, program: false, size: 8 });
    await sleep(500);
    expect(power.powerIsOpen() && power.activePowerTab() === "code").toBe(true);
    expect(tabNames()).toContain("notes.txt");
  });

  test("the Convert button opens a searchable list of text conversions and applies the pick to the whole file", async () => {
    await openFile("notes.txt");
    button("Convert")?.click();
    await sleep(100);
    const input: any = doc.querySelector(".code-pal-in");
    expect(input).toBeTruthy();
    expect(doc.querySelectorAll(".code-pal-item").length).toBeGreaterThan(20);
    input.value = "base64 enc";
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
    await sleep(50);
    expect(doc.querySelector(".code-pal-sel .code-pal-label").textContent).toBe("Base64 encode");
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(150);
    expect(Buffer.from(active().value.trim(), "base64").toString("utf8")).toMatch(/one\ntwo/);
  });
});
