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
const launched: Array<{ command: string; args: string[] }> = [];

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
  writeFileSync(join(work, "LICENSE"), "MIT License\n\nCopyright (c) someone\n");
  writeFileSync(join(work, "big.ts"), big);
  writeFileSync(join(work, "program.bin"), Buffer.from([0, 1, 2, 3, 0, 0, 255, 0]));
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => true,
    typeInTerminal: (text: string) => (typedInTerminal.push(text), true),
    showTerminal() {},
    hideTerminal() {},
    toggleTerminal() {},
    wireTerminal() {},
    isTerminalOpen: () => false,
  }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data"), launch: async (command, args) => void launched.push({ command, args }) } });
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
  Object.assign(shared, { platform: process.platform, sep: process.platform === "win32" ? "\\" : "/", home, location: { kind: "folder", path: work }, search: null, workspace: "files", powerOpen: false });
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
  test("starts on the welcome screen, with every control labeled and explained", () => {
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

  test("a V file is recognized, colored, and its snippets have tab stops with mirrors", async () => {
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
    [...doc.querySelectorAll("[role=menuitem]")].find((e: any) => e.textContent.includes("prettify document")).click();
    await until(() => toasts().some((t) => /v fmt|isn't installed/.test(t)), "the V formatter's result");
    expect(toasts().join(" | ")).toMatch(/v fmt|isn't installed/);
    expect(ta.value).toBe("fn main( {\n");
  }, 15_000);

  test("Format / prettify and Minify lay out and squeeze a JavaScript file through the server; Undo brings it back", async () => {
    writeFileSync(join(work, "messy.js"), "const a={b:1,c:[1,2,3]};\nfunction f(x){return x+1}\n");
    await openFile("messy.js");
    const ta = active();
    const original = ta.value;
    const menu = async (label: string) => {
      button("Tools").click();
      await sleep(50);
      [...doc.querySelectorAll("[role=menuitem]")].find((e: any) => e.textContent.includes(label)).click();
    };
    await menu("prettify document");
    await until(() => ta.value !== original, "the formatted text");
    expect(ta.value).toBe("const a = { b: 1, c: [1, 2, 3] };\nfunction f(x) {\n  return x + 1;\n}\n");
    expect(toasts().join(" | ")).toContain("Formatted with Prettier");
    await menu("Minify");
    await until(() => !ta.value.includes("\n"), "the minified text");
    expect(ta.value).toBe("const a={b:1,c:[1,2,3]};function f(x){return x+1}");
    press(ta, "z", { ctrlKey: true });
    await sleep(100);
    expect(ta.value).toBe("const a = { b: 1, c: [1, 2, 3] };\nfunction f(x) {\n  return x + 1;\n}\n");
  });

  test("a mistake is explained with its place and the text is not touched; a language with no formatter is only tidied, honestly", async () => {
    writeFileSync(join(work, "broken.js"), "const a = {");
    await openFile("broken.js");
    let ta = active();
    button("Tools").click();
    await sleep(50);
    [...doc.querySelectorAll("[role=menuitem]")].find((e: any) => e.textContent.includes("prettify document")).click();
    await until(() => toasts().some((t) => /line 1/.test(t)), "the error toast");
    expect(ta.value).toBe("const a = {");
    writeFileSync(join(work, "tidy.rb"), "puts 1   \n\n\n\n\nputs 2");
    await openFile("tidy.rb");
    ta = active();
    button("Tools").click();
    await sleep(50);
    [...doc.querySelectorAll("[role=menuitem]")].find((e: any) => e.textContent.includes("prettify document")).click();
    await until(() => ta.value === "puts 1\n\n\nputs 2\n", "the tidied text");
    expect(toasts().join(" | ")).toContain("Only whitespace was tidied");
  }, 20000);

  test("the preview can be switched on and off in zen mode, where the toolbar's Preview button is hidden", async () => {
    writeFileSync(join(work, "zen.md"), "# Hello zen\n\nSome *text*\n");
    await openFile("zen.md");
    const root = doc.querySelector(".code-root");
    const zenPreview = doc.querySelector(".code-zen-bar .code-zen-preview");
    const pane = doc.querySelector(".code-preview-pane");
    expect(zenPreview).toBeTruthy();
    expect(pane.hidden).toBe(true);
    button("⛶ Zen")?.click();
    await sleep(100);
    expect(root.classList.contains("code-zen")).toBe(true);
    zenPreview.click();
    await sleep(200);
    expect(pane.hidden).toBe(false);
    expect(zenPreview.getAttribute("aria-pressed")).toBe("true");
    expect(pane.textContent).toContain("Hello zen");
    zenPreview.click();
    await sleep(100);
    expect(pane.hidden).toBe(true);
    expect(zenPreview.getAttribute("aria-pressed")).toBe("false");
    doc.querySelector(".code-zen-exit").click();
    await sleep(100);
    expect(root.classList.contains("code-zen")).toBe(false);
  }, 20000);

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
    const quotedWork = process.platform === "win32" ? `'${work}'` : work;
    const quotedFile = process.platform === "win32" ? `'${file}'` : file;
    expect(typedInTerminal[0]).toBe(`cd ${quotedWork} && v run ${quotedFile}\r`);
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

  test("Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z (or Ctrl+Y) redoes, the same way the Undo button does", async () => {
    await openFile("notes.txt");
    const calls: string[] = [];
    const real = (doc as any).execCommand;
    (doc as any).execCommand = (name: string) => (calls.push(name), true);
    try {
      const ta = active();
      ta.focus();
      const press = (k: string, extra: Record<string, unknown> = {}) => {
        const ev = new win.KeyboardEvent("keydown", { key: k, code: `Key${k.toUpperCase()}`, bubbles: true, cancelable: true, [mod]: true, ...extra });
        ta.dispatchEvent(ev);
        return ev;
      };
      expect(press("z").defaultPrevented).toBe(true);
      expect(calls).toEqual(["undo"]);
      expect(press("z", { shiftKey: true }).defaultPrevented).toBe(true);
      expect(calls).toEqual(["undo", "redo"]);
      expect(press("y").defaultPrevented).toBe(true);
      expect(calls).toEqual(["undo", "redo", "redo"]);
    } finally {
      (doc as any).execCommand = real;
    }
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
    // And from outside the text (focus on the page itself): leaves zen mode without also leaving the Tools view.
    const workspaceBefore = doc.getElementById("app").dataset.workspace;
    button("⛶ Zen")?.click();
    await sleep(100);
    expect(root.classList.contains("code-zen")).toBe(true);
    (doc.activeElement as any)?.blur?.();
    doc.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(100);
    expect(root.classList.contains("code-zen")).toBe(false);
    expect(doc.getElementById("app").dataset.workspace).toBe(workspaceBefore);
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

describe("Recent in the Places list opens things the way the file list does", () => {
  test("a file with no extension (LICENSE) opens in the built-in editor, not in another program, and is listed under Recent", async () => {
    const ops = await import("../resources/file_manager/ui/ops.js");
    const before = launched.length;
    await ops.openPath(join(work, "LICENSE"));
    await until(() => tabNames().includes("LICENSE"), "the LICENSE tab");
    expect(launched.length).toBe(before);
    expect(active().value).toContain("MIT License");
    await until(async () => (await call("settings")).settings.recents[0]?.path === join(work, "LICENSE"), "LICENSE under Recent");
  }, 20000);

  test("a Recent item that is gone says so and opens nothing", async () => {
    const ops = await import("../resources/file_manager/ui/ops.js");
    const before = launched.length;
    await ops.openPath(join(work, "deleted-long-ago.txt"));
    await until(() => toasts().some((t) => t.includes("isn't there any more")), "the toast");
    expect(launched.length).toBe(before);
  });
});

describe("built-in developer power features in the UI", () => {
  test("breadcrumbs show path, active symbol, word occurrences, and task count; Tasks panel lists TODOs; Minimap toggles", async () => {
    writeFileSync(
      join(work, "feature.js"),
      "function computeTotal(price) {\n  // TODO: apply discount\n  const total = price + price;\n  return total;\n}\n",
    );
    await openFile("feature.js");
    const ta = active();
    const pos = ta.value.indexOf("price");
    ta.setSelectionRange(pos, pos);
    doc.dispatchEvent(new win.Event("selectionchange"));
    await sleep(100);

    const crumbs = doc.querySelector(".code-crumbs");
    expect(crumbs.hidden).toBe(false);
    expect(crumbs.textContent).toContain("feature.js");
    expect(crumbs.textContent).toContain("computeTotal");
    expect(crumbs.textContent).toContain("price · 3×");
    expect(crumbs.textContent).toContain("1 task");

    // Clicking the task badge in breadcrumbs opens the Tasks (TODO) side panel
    const todoPill: any = doc.querySelector(".code-crumb-todo");
    todoPill.click();
    await sleep(100);
    expect(doc.querySelector(".code-panel-host").textContent).toContain("apply discount");

    // Toggle minimap via toolbar button
    const mmBtn = button("Minimap");
    expect(mmBtn).toBeTruthy();
    mmBtn!.click();
    await sleep(100);
    const mm: any = doc.querySelector(".code-ed:not([hidden]) .code-minimap");
    expect(mm.hidden).toBe(false);
    mmBtn!.click();
    await sleep(50);
  });

  test("JSON Tree Explorer preview, Live Code Inspector preview, and Compare with Saved diff tab", async () => {
    writeFileSync(join(work, "data.json"), '{"b": 1, "a": 2}\n');
    await openFile("data.json");
    const pvBtn = button("Preview");
    pvBtn!.click();
    await sleep(100);
    const pvPane: any = doc.querySelector(".code-preview-pane");
    expect(pvPane.hidden).toBe(false);
    expect(pvPane.textContent).toContain("JSON Tree Explorer");

    // Switch to feature.js to see the Live Code Inspector and test Compare with Saved
    await openFile("feature.js");
    await sleep(100);
    expect(pvPane.textContent).toContain("Live Inspector");
    const ta = active();
    caretToEnd(ta);
    type(ta, "// extra line\n");
    await sleep(400);
    expect(pvPane.textContent).toContain("+1 added");

    const openDiffBtn = [...pvPane.querySelectorAll("button")].find((b: any) => b.textContent.includes("Open diff tab"));
    expect(openDiffBtn).toBeTruthy();
    openDiffBtn.click();
    await sleep(150);
    expect(tabNames().some((n) => n.startsWith("Diff:"))).toBe(true);
    pvBtn!.click();
    await sleep(50);
  });

  test("clicking links in Markdown preview opens web URLs in the browser, jumps to #headings (including GFM -- and emoji slugs), and opens relative files", async () => {
    const { slugifyMarkdownHeading, normalizeMarkdownSlug } = await import("../resources/file_manager/ui/codePreview.js");
    expect(slugifyMarkdownHeading("3. Console UI & RAD Components")).toBe("3-console-ui--rad-components");
    expect(normalizeMarkdownSlug("3-console-ui--rad-components")).toBe("3-console-ui-rad-components");
    expect(slugifyMarkdownHeading("🚀 How to Use Any Theme")).toBe("-how-to-use-any-theme");

    writeFileSync(
      join(work, "links.md"),
      [
        "# Overview",
        "",
        "Visit [Bun Docs](https://bun.sh/docs) or https://example.com/guide for more.",
        "Jump to [Details section](#details-section), [Console UI & RAD Components](#3-console-ui--rad-components), [How to Use](#-how-to-use-any-theme), [Quick Start](#custom-anchor), [Top](#top), or open [Notes](./notes.txt).",
        "",
        "## Details Section",
        "Line 7 content.",
        "",
        "## 3. Console UI & RAD Components",
        "RAD content.",
        "",
        "## 🚀 How to Use Any Theme",
        "Theme usage.",
        "",
        '<a id="custom-anchor"></a>',
        "",
        "## 1. 🐣 5-Minute Quick Start",
        "Quick start steps.",
      ].join("\n"),
    );
    await openFile("links.md");
    const pvBtn = button("Preview");
    pvBtn!.click();
    await sleep(100);
    const pvPane: any = doc.querySelector(".code-preview-pane");
    expect(pvPane.hidden).toBe(false);

    const links = [...pvPane.querySelectorAll('.code-md-link[role="link"]')];
    expect(links.map((l: any) => l.textContent)).toEqual([
      "Bun Docs",
      "https://example.com/guide",
      "Details section",
      "Console UI & RAD Components",
      "How to Use",
      "Quick Start",
      "Top",
      "Notes",
    ]);
    // Standalone <a id="custom-anchor"></a> is hidden in preview rather than shown as raw text
    expect(pvPane.querySelector(".code-md-content").textContent).not.toContain('<a id="custom-anchor">');

    // 1. Click external web link -> opens in system browser
    const beforeLaunch = launched.length;
    links[0].click();
    await until(() => launched.length > beforeLaunch, "the web link to be launched");
    expect(launched.at(-1)?.args.join(" ")).toContain("https://bun.sh/docs");

    // 2. Click bare autolinked URL -> opens in system browser
    const beforeAuto = launched.length;
    links[1].click();
    await until(() => launched.length > beforeAuto, "the bare autolinked URL to be launched");
    expect(launched.at(-1)?.args.join(" ")).toContain("https://example.com/guide");

    // 3. Click #details-section anchor -> jumps editor cursor to line 6
    links[2].click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 6");

    // 4. Click #3-console-ui--rad-components anchor -> jumps editor cursor to line 9 without error toast
    links[3].click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 9");
    expect(toasts().some((t) => t.includes("wasn't found"))).toBe(false);

    // 5. Click #-how-to-use-any-theme anchor -> jumps editor cursor to line 12 without error toast
    links[4].click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 12");
    expect(toasts().some((t) => t.includes("wasn't found"))).toBe(false);

    // 6. Click #custom-anchor -> jumps to <a id="custom-anchor"></a> (line 15) without error toast
    links[5].click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 15");
    expect(toasts().some((t) => t.includes("wasn't found"))).toBe(false);

    // 7. Click #top anchor -> returns editor cursor to line 1
    links[6].click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 1");

    // 8. Click relative file link ./notes.txt -> opens notes.txt tab in the editor
    links[7].click();
    await until(() => doc.querySelector(".code-tab.active .code-tab-name")?.textContent === "notes.txt", "notes.txt to become active");
    pvBtn!.click();
    await sleep(50);
  });

  test("GitHub-style Markdown navigation: Outline (TOC) with filter, Prev/Next/Back section navigation, # heading anchors, Preview / Plain text toggle, and inline image preview", async () => {
    writeFileSync(join(work, "diagram.ppm"), "P3\n1 1\n255\n255 0 0\n");
    writeFileSync(
      join(work, "guide.md"),
      [
        "# Getting Started",
        "Intro text with ![Diagram](./diagram.ppm)",
        "",
        "## Installation",
        "Install steps.",
        "",
        "### Advanced Setup",
        "Advanced details.",
      ].join("\n"),
    );
    await openFile("guide.md");
    const pvBtn = button("Preview");
    pvBtn!.click();
    await sleep(100);
    const pvPane: any = doc.querySelector(".code-preview-pane");
    expect(pvPane.hidden).toBe(false);

    // Inline image resolves relative to the Markdown file via /api/raw
    const img: any = pvPane.querySelector("img.code-md-image");
    expect(img).toBeTruthy();
    expect(decodeURIComponent(img.getAttribute("src") || "")).toContain("diagram.ppm");

    // 1. Outline button shows heading count and opens TOC panel
    const tocBtn: any = pvPane.querySelector(".code-md-toc-btn");
    expect(tocBtn).toBeTruthy();
    expect(tocBtn.textContent).toContain("Outline (3)");
    const tocPanel: any = pvPane.querySelector(".code-md-toc");
    expect(tocPanel.hidden).toBe(true);
    tocBtn.click();
    expect(tocPanel.hidden).toBe(false);
    expect(tocPanel.querySelectorAll(".code-md-toc-item").length).toBe(3);

    // Filter TOC
    const tocFilter: any = tocPanel.querySelector(".code-md-toc-filter");
    tocFilter.value = "adv";
    tocFilter.dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(tocPanel.querySelectorAll(".code-md-toc-item").length).toBe(1);
    expect(tocPanel.querySelector(".code-md-toc-text").textContent).toBe("Advanced Setup");

    // Click TOC item -> jumps editor to line 7 (### Advanced Setup) and updates current section
    tocPanel.querySelector(".code-md-toc-item").click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 7");
    expect(pvPane.querySelector(".code-md-cur-sec").textContent).toContain("Advanced Setup");

    // 2. Prev / Next section buttons and Back history button
    const prevBtn: any = pvPane.querySelector(".code-md-prev-btn");
    const nextBtn: any = pvPane.querySelector(".code-md-next-btn");
    const backBtn: any = pvPane.querySelector(".code-md-back-btn");
    expect(backBtn.hidden).toBe(false);
    prevBtn.click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 4");
    expect(pvPane.querySelector(".code-md-cur-sec").textContent).toContain("Installation");

    // Clicking # anchor on Getting Started jumps back to line 1 and records history
    const firstAnchor: any = pvPane.querySelector(".code-md-anchor");
    expect(firstAnchor).toBeTruthy();
    firstAnchor.click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 1");

    // Clicking Back returns to Installation (line 4)
    backBtn.click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 4");

    nextBtn.click();
    await sleep(50);
    expect(status("pos")).toContain("Ln 7");

    // 3. Toggle between Preview and Plain text inside the Markdown preview toolbar
    const plainModeBtn: any = [...pvPane.querySelectorAll(".code-md-mode-btn")].find((b: any) => b.textContent === "Plain text");
    const previewModeBtn: any = [...pvPane.querySelectorAll(".code-md-mode-btn")].find((b: any) => b.textContent === "Preview");
    expect(plainModeBtn).toBeTruthy();
    expect(previewModeBtn.getAttribute("aria-pressed")).toBe("true");
    plainModeBtn.click();
    expect(plainModeBtn.getAttribute("aria-pressed")).toBe("true");
    expect(pvPane.querySelector(".code-md-content").hidden).toBe(true);
    expect(pvPane.querySelector(".code-md-plain").hidden).toBe(false);
    expect(pvPane.querySelector(".code-md-plain").textContent).toContain("# Getting Started");

    previewModeBtn.click();
    expect(previewModeBtn.getAttribute("aria-pressed")).toBe("true");
    expect(pvPane.querySelector(".code-md-content").hidden).toBe(false);
    expect(pvPane.querySelector(".code-md-plain").hidden).toBe(true);

    // 4. Zoom images in Markdown preview (click image, +/- buttons, zoom slider, reset, and fullscreen lightbox)
    const imgWrap: any = pvPane.querySelector(".code-md-img");
    const zoomInBtn: any = imgWrap.querySelector(".code-md-zoom-in");
    const zoomOutBtn: any = imgWrap.querySelector(".code-md-zoom-out");
    const zoomRange: any = imgWrap.querySelector(".code-md-zoom-range");
    const zoomPct: any = imgWrap.querySelector(".code-md-zoom-pct");
    const lbBtn: any = imgWrap.querySelector(".code-md-zoom-lightbox");

    expect(imgWrap.dataset.zoom).toBe("100");
    // Clicking the image toggles 100% -> 200%
    img.click();
    expect(imgWrap.dataset.zoom).toBe("200");
    expect(img.style.width).toBe("200%");
    expect(zoomPct.textContent).toBe("200%");

    // + button increases zoom by 25% -> 225%
    zoomInBtn.click();
    expect(imgWrap.dataset.zoom).toBe("225");
    // − button decreases zoom by 25% -> 200%
    zoomOutBtn.click();
    expect(imgWrap.dataset.zoom).toBe("200");

    // Range slider sets zoom to 300%
    zoomRange.value = "300";
    zoomRange.dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(imgWrap.dataset.zoom).toBe("300");
    expect(img.style.width).toBe("300%");

    // Reset button restores 100%
    zoomPct.click();
    expect(imgWrap.dataset.zoom).toBe("100");
    expect(img.style.width).toBe("");

    // Lightbox viewer opens, zooms, and closes with Escape
    lbBtn.click();
    const lb: any = doc.querySelector(".code-md-lightbox");
    expect(lb).toBeTruthy();
    expect(lb.dataset.zoom).toBe("100");
    lb.querySelector(".code-md-lb-in").click();
    expect(lb.dataset.zoom).toBe("125");
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(doc.querySelector(".code-md-lightbox")).toBeNull();

    // 5. Resizing the split between Code Editor and Preview (via slider and draggable resizer bar)
    const resizer: any = doc.querySelector(".code-preview-resizer");
    const splitSlider: any = pvPane.querySelector(".code-preview-split-slider");
    const splitVal: any = pvPane.querySelector(".code-preview-split-val");
    expect(resizer.hidden).toBe(false);
    expect(pvPane.dataset.width).toBe("45");

    // Slide the split slider to 60%
    splitSlider.value = "60";
    splitSlider.dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(pvPane.dataset.width).toBe("60");
    expect(pvPane.style.flexBasis).toBe("60%");
    expect(splitVal.textContent).toBe("60%");
    expect(resizer.getAttribute("aria-valuenow")).toBe("60");

    // Drag the resizer bar between the editor and preview
    resizer.dispatchEvent(new win.MouseEvent("mousedown", { button: 0, clientX: 400, bubbles: true }));
    win.dispatchEvent(new win.MouseEvent("mousemove", { clientX: 480, bubbles: true }));
    win.dispatchEvent(new win.MouseEvent("mouseup", { bubbles: true }));
    expect(pvPane.dataset.width).toBe("50");
    expect(splitSlider.value).toBe("50");

    // Keyboard arrow keys on the resizer bar adjust the split and 0 resets to 45%
    resizer.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    expect(pvPane.dataset.width).toBe("55");
    resizer.dispatchEvent(new win.KeyboardEvent("keydown", { key: "0", bubbles: true, cancelable: true }));
    expect(pvPane.dataset.width).toBe("45");

    pvBtn!.click();
    await sleep(50);
    expect(resizer.hidden).toBe(true);
  });

  test("Code Folding, Sticky Scroll Header, Multi-Cursor Batch Edits, Inline Color Swatches, Live Syntax Diagnostics, Diff Gutter Bars, Split Editor, and Local File History", async () => {
    const { detectFoldableRanges, diagnoseSyntax, computeGutterLineChanges, editAllOccurrences, addLinePrefixSuffix, numberSelectedLines } = await import("../resources/file_manager/ui/codeLogic.js");

    // 1. Pure logic checks for foldable ranges, syntax diagnostics, diff gutter bars, and batch edits
    const sampleCode = [
      "function renderCard(title) {",
      "  const color = '#3b82f6';",
      "  if (title) {",
      "    return title;",
      "  }",
      "}",
    ].join("\n");
    const folds = detectFoldableRanges(sampleCode, "javascript");
    expect(folds.length).toBeGreaterThanOrEqual(2);
    expect(folds[0]).toMatchObject({ startLine: 1, endLine: 6 });

    const badJson = '{\n  "name": "app",\n  "broken": [1, 2\n}';
    const jsonDiags = diagnoseSyntax(badJson, "json");
    expect(jsonDiags.length).toBeGreaterThan(0);

    const badJs = "function demo() {\n  const x = [1, 2);\n}\n";
    const jsDiags = diagnoseSyntax(badJs, "javascript");
    expect(jsDiags.length).toBeGreaterThan(0);
    expect(jsDiags[0]!.line).toBe(2);

    const changes = computeGutterLineChanges("a\nb\nc", "a\nB_MOD\nc\nd_NEW");
    expect(changes.get(2)).toBe("modified");
    expect(changes.get(4)).toBe("added");

    const batchOcc = editAllOccurrences("const foo = 1;\nconst bar = foo + foo;\n", 6, 9, "total");
    expect(batchOcc.insert).toContain("const total = 1;\nconst bar = total + total;");

    const prefSuf = addLinePrefixSuffix("apple\nbanana", 0, 12, "- [ ] ", "!");
    expect(prefSuf.insert).toBe("- [ ] apple!\n- [ ] banana!");

    const numbered = numberSelectedLines("first\nsecond\nthird", 0, 18);
    expect(numbered.insert).toBe("1. first\n2. second\n3. third");

    // 2. End-to-end UI checks in the mounted Code Editor
    await openFile("hello.v");
    const editorText = [
      "fn render_theme() {",
      "  primary := '#ff5500'",
      "  secondary := 'rgb(16, 185, 129)'",
      "  if primary != '' {",
      "    println(primary)",
      "  }",
      "}",
    ].join("\n");
    const t = active();
    t.value = editorText;
    t.selectionStart = t.selectionEnd = editorText.indexOf("println");
    t.dispatchEvent(new win.Event("input", { bubbles: true }));
    win.document.dispatchEvent(new win.Event("selectionchange"));
    await sleep(420);

    // Diff gutter bars mark modified/added lines compared to saved file
    expect(doc.querySelectorAll(".code-gn-modified, .code-gn-added").length).toBeGreaterThan(0);

    // Inline color swatches appear in the editor layer and breadcrumb bar
    expect(doc.querySelectorAll(".code-color-swatch").length).toBeGreaterThanOrEqual(2);
    t.selectionStart = t.selectionEnd = editorText.indexOf("#ff5500");
    win.document.dispatchEvent(new win.Event("selectionchange"));
    expect(doc.querySelector(".code-crumb-color")).toBeTruthy();

    // Sticky scroll header shows enclosing block when cursor is inside nested block
    const stickyEl: any = doc.querySelector(".code-ed:not([hidden]) .code-sticky-scroll");
    expect(stickyEl).toBeTruthy();
    t.selectionStart = t.selectionEnd = editorText.indexOf("println");
    win.document.dispatchEvent(new win.Event("selectionchange"));
    expect(stickyEl.hidden).toBe(false);
    expect(stickyEl.textContent).toContain("Ln ");

    // Code folding via gutter icon and Selection menu commands
    const foldIcon: any = doc.querySelector(".code-ed:not([hidden]) .code-fold-icon");
    expect(foldIcon).toBeTruthy();
    foldIcon.dispatchEvent(new win.MouseEvent("mousedown", { button: 0, bubbles: true }));
    expect(doc.querySelector(".code-ed:not([hidden]) .code-fold-badge")).toBeTruthy();
    expect(doc.querySelectorAll(".code-ed:not([hidden]) .code-row-folded").length).toBeGreaterThan(0);

    const runMenuCmd = (menuName: string, itemLabel: string) => {
      const mBtn = [...doc.querySelectorAll(".code-menu-btn")].find((b: any) => b.textContent.trim() === menuName) as any;
      mBtn.click();
      const item = [...doc.querySelectorAll(".menu .menu-item")].find((b: any) => b.textContent.includes(itemLabel)) as any;
      item.click();
    };

    runMenuCmd("Selection", "Unfold all blocks");
    expect(doc.querySelector(".code-ed:not([hidden]) .code-fold-badge")).toBeNull();
    runMenuCmd("Selection", "Fold all blocks");
    expect(doc.querySelector(".code-ed:not([hidden]) .code-fold-badge")).toBeTruthy();
    runMenuCmd("Selection", "Unfold all blocks");

    // Live syntax diagnostics squiggles & breadcrumb error badge on unclosed bracket
    t.value = "fn broken() {\n  x := [1, 2)\n}\n";
    t.dispatchEvent(new win.Event("input", { bubbles: true }));
    await sleep(420);
    expect(doc.querySelector(".code-ed:not([hidden]) .code-diag-err")).toBeTruthy();
    expect(doc.querySelector(".code-ed:not([hidden]) .code-gn-err")).toBeTruthy();
    const diagCrumb: any = doc.querySelector(".code-crumb-diag");
    expect(diagCrumb).toBeTruthy();
    expect(diagCrumb.textContent).toContain("error");
    diagCrumb.click();
    expect(status("pos")).toContain("Ln 2");

    // Side-by-side Split Editor pane
    writeFileSync(join(work, "history-test.md"), "# Guide\n\n## Intro\nHello world\n");
    await openFile("history-test.md");
    const splitBtn = [...doc.querySelectorAll(".code-toolbar .code-btn")].find((b: any) => b.textContent.includes("Split")) as any;
    expect(splitBtn).toBeTruthy();
    const splitPane: any = doc.querySelector(".code-split-pane");
    expect(splitPane.hidden).toBe(true);
    splitBtn.click();
    expect(splitPane.hidden).toBe(false);
    expect(splitPane.querySelector(".code-split-select").options.length).toBeGreaterThanOrEqual(2);
    expect(splitPane.querySelector(".code-split-body").textContent.length).toBeGreaterThan(0);
    splitBtn.click();
    expect(splitPane.hidden).toBe(true);

    // Synchronized Markdown scrolling toggle in Markdown preview
    const pvBtn = [...doc.querySelectorAll(".code-toolbar .code-btn")].find((b: any) => b.textContent.includes("Preview")) as any;
    pvBtn.click();
    await sleep(80);
    const syncBtn: any = doc.querySelector(".code-md-sync-btn");
    expect(syncBtn).toBeTruthy();
    expect(syncBtn.getAttribute("aria-pressed")).toBe("true");
    syncBtn.click();
    expect(syncBtn.getAttribute("aria-pressed")).toBe("false");
    syncBtn.click();
    expect(syncBtn.getAttribute("aria-pressed")).toBe("true");
    pvBtn.click();
    await sleep(50);

    // Local File History / Timeline Snapshots side panel
    const histTab = [...doc.querySelectorAll(".code-side-tab")].find((b: any) => b.dataset.panel === "history") as any;
    expect(histTab).toBeTruthy();
    histTab.click();
    expect(doc.querySelectorAll(".code-hist-item").length).toBeGreaterThanOrEqual(1);

    // Modify guide.md, take a manual snapshot, then restore initial snapshot
    const mdTa = active();
    const originalMd = mdTa.value;
    mdTa.value = `${originalMd}\n\n## Extra Section\n`;
    mdTa.dispatchEvent(new win.Event("input", { bubbles: true }));
    const snapNowBtn = [...doc.querySelectorAll(".code-panel-head .code-btn")].find((b: any) => b.textContent.includes("Snapshot now")) as any;
    expect(snapNowBtn).toBeTruthy();
    snapNowBtn.click();
    const histItems = [...doc.querySelectorAll(".code-hist-item")];
    expect(histItems.length).toBeGreaterThanOrEqual(2);

    // Click Restore on the earliest ("Initial open") snapshot (last item in reverse-chronological list)
    const earliestItem = histItems[histItems.length - 1]!;
    const restoreBtn = [...earliestItem.querySelectorAll("button")].find((b: any) => b.textContent === "Restore") as any;
    restoreBtn.click();
    expect(mdTa.value).toBe(originalMd);
  });
});


