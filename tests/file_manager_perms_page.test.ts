import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { setPermsHooks, type RunResult } from "../src/features/filemanager/fmPermsSys";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const posix = process.platform !== "win32";
const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-perms-page-"));
const home = join(root, "home");
const servers: Array<ReturnType<typeof startFileManagerServer>> = [];
let base = "";
let doc: any;
let state: any;
let nav: any;
let extras: any;
let info: any;
let ops: any;
let menu: any;
let model: any;
let counter = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => any, what: string, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${what}`);
};
const modeOf = (p: string) => lstatSync(p).mode & 0o7777;
const dialogs = () => [...doc.querySelectorAll(".modal-backdrop")];
const top = (): any => dialogs().at(-1);
const section = (): any => doc.querySelector(".perm-section");
const box = (bit: number): any => section()?.querySelector(`input[data-bit="${bit}"]`);
const octal = (): any => section().querySelector(".perm-octal");
const letters = (): string => section().querySelector(".perm-symbolic").textContent;
const button = (text: string, from: any = doc): any => [...from.querySelectorAll("button")].find((b: any) => b.textContent.trim().startsWith(text));
const typeInto = (input: any, text: string) => {
  input.value = text;
  input.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
};
const closeAll = () => {
  for (const d of dialogs()) d.remove();
  doc.body.classList.remove("modal-open");
  doc.querySelectorAll("#toasts .toast, .menu").forEach((t: any) => t.remove());
};
const previewText = () => section()?.querySelector(".perm-preview")?.textContent ?? "";
const applyButton = (): any => section().querySelector(".perm-apply");

/** Opens Properties for these paths and waits until the permissions have been read. */
async function open(paths: string[], options: Record<string, any> = {}) {
  closeAll();
  await extras.showProperties(paths, options);
  await until(() => section()?.querySelector(".perm-grid, .perm-error, .perm-blocked, .perm-flags, .perm-body > .hint"), "the permissions section");
  await until(() => !section().textContent.includes("Reading permissions"), "the permissions to be read");
}

/** Waits for the preview of the current choice, then applies it. */
async function applyChange(expectText: string) {
  await until(() => previewText().includes(expectText) && !applyButton().disabled, `the preview "${expectText}" (it says: ${previewText()})`);
  applyButton().click();
}

function fixture(files: Record<string, number> = { "a.txt": 0o644, "b.txt": 0o600, "run.sh": 0o755 }) {
  const dir = join(home, `case${++counter}`);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o755);
  for (const [name, mode] of Object.entries(files)) {
    writeFileSync(join(dir, name), "x");
    chmodSync(join(dir, name), mode);
  }
  return dir;
}

function tree() {
  const dir = fixture({ "a.txt": 0o644, "run.sh": 0o755 });
  mkdirSync(join(dir, "sub"));
  chmodSync(join(dir, "sub"), 0o755);
  writeFileSync(join(dir, "sub", "c.txt"), "x");
  chmodSync(join(dir, "sub", "c.txt"), 0o644);
  symlinkSync(join(dir, "a.txt"), join(dir, "ln"));
  return dir;
}

beforeAll(async () => {
  mkdirSync(home, { recursive: true });
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false,
  }));
  const server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data") } });
  servers.push(server);
  base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  const api = await import("../resources/file_manager/ui/api.js");
  nav = await import("../resources/file_manager/ui/nav.js");
  extras = await import("../resources/file_manager/ui/extras.js");
  info = await import("../resources/file_manager/ui/info.js");
  ops = await import("../resources/file_manager/ui/ops.js");
  menu = await import("../resources/file_manager/ui/contextmenu.js");
  model = await import("../resources/file_manager/ui/permsModel.js");
  state.home = home;
  state.sep = "/";
  state.undoStack = [];
  state.settings = { ...((await api.call("settings")) as any).settings, showInfoPanel: true };
  // remembered on the server too, so the page's later saves of other settings (the last folder) keep it
  await nav.saveSettings({ showInfoPanel: true });
  await nav.goTo(home, { push: false });
});

afterAll(() => {
  closeAll();
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const d = saved.get(key);
    if (d) Object.defineProperty(g, key, d);
    else delete g[key];
  }
  mock.restore();
  for (const s of servers) s.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!posix)("the Permissions section of Properties", () => {
  test("one file: the grid, the digits, the letters, the owner, with plain words and no stray text", async () => {
    const dir = fixture();
    await open([join(dir, "a.txt")]);
    const boxes = [...section().querySelectorAll(".perm-grid input[type=checkbox]")];
    expect(boxes).toHaveLength(9);
    expect(boxes.map((b: any) => b.checked)).toEqual([true, true, false, true, false, false, true, false, false]);
    expect(boxes.map((b: any) => b.getAttribute("aria-label"))).toEqual(["Owner can read", "Owner can write", "Owner can run", "Group can read", "Group can write", "Group can run", "Others can read", "Others can write", "Others can run"]);
    expect(octal().value).toBe("644");
    expect(letters()).toBe("rw-r--r--");
    expect(section().textContent).toMatch(/Owner: \S+/);
    expect(section().textContent).toContain("Changing who owns something needs administrator rights");
    expect([...section().querySelectorAll(".perm-colhead")].map((t: any) => t.textContent)).toContain("Run");
    expect(section().textContent).not.toMatch(/\bnull\b|\bundefined\b|\[object/i);
    expect(applyButton().disabled).toBe(true);
    expect(section().querySelector(".perm-preview").textContent).toContain("Change a box");
    // the section is part of the Properties window, which still has its other facts
    expect(top().textContent).toContain("Properties");
    expect(top().textContent).toContain("a.txt");
  });

  test("a folder says 'Run / open folder'", async () => {
    const dir = fixture();
    await open([dir]);
    expect([...section().querySelectorAll(".perm-colhead")].map((t: any) => t.textContent)).toContain("Run / open folder");
    expect(octal().value).toBe("755");
    expect(section().querySelector('[data-recursive="on"]')).toBeTruthy();
    await open([join(dir, "a.txt")]);
    expect(section().querySelector('[data-recursive="on"]')).toBeNull();
  });

  test("boxes, digits and letters stay in step, in every direction", async () => {
    const dir = fixture();
    await open([join(dir, "a.txt")]);
    box(0o100).click();
    expect(octal().value).toBe("744");
    expect(letters()).toBe("rwxr--r--");
    box(0o020).click();
    expect(octal().value).toBe("764");
    box(0o020).click();
    box(0o100).click();
    expect(octal().value).toBe("644");
    typeInto(octal(), "600");
    expect(box(0o040).checked).toBe(false);
    expect(box(0o004).checked).toBe(false);
    expect(box(0o200).checked).toBe(true);
    expect(letters()).toBe("rw-------");
    typeInto(octal(), "755");
    expect(box(0o100).checked).toBe(true);
    expect(letters()).toBe("rwxr-xr-x");
    // special bits through four digits, and back
    typeInto(octal(), "4755");
    expect(box(0o4000).checked).toBe(true);
    expect(letters()).toBe("rwsr-xr-x");
    typeInto(octal(), "1777");
    expect(box(0o1000).checked).toBe(true);
    expect(letters()).toBe("rwxrwxrwt");
    box(0o1000).click();
    expect(octal().value).toBe("777");
    box(0o2000).click();
    expect(octal().value).toBe("2777");
    expect(letters()).toBe("rwxrwsrwx");
  });

  test("digits that aren't permissions are flagged and change nothing", async () => {
    const dir = fixture();
    await open([join(dir, "a.txt")]);
    for (const bad of ["69", "999", "abc", "12345", "64 4"]) {
      typeInto(octal(), bad);
      if (bad.length >= 3 || /[^0-7]/.test(bad)) expect(octal().getAttribute("aria-invalid"), bad).toBe("true");
      expect(letters(), bad).toBe("rw-r--r--");
    }
    expect(section().querySelector(".perm-octal-note").textContent).toContain("0 to 7");
    typeInto(octal(), "640");
    expect(octal().hasAttribute("aria-invalid")).toBe(false);
    expect(letters()).toBe("rw-r-----");
    octal().dispatchEvent(new doc.defaultView.Event("blur"));
    expect(octal().value).toBe("640");
  });

  test("Enter in the digits box doesn't close the window; Escape does", async () => {
    const dir = fixture();
    await open([join(dir, "a.txt")]);
    octal().focus();
    octal().dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(30);
    expect(dialogs()).toHaveLength(1);
    expect(section()).toBeTruthy();
    doc.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await sleep(30);
    expect(dialogs()).toHaveLength(0);
  });

  test("presets set the boxes for the kind of item, and show which one is chosen", async () => {
    const dir = fixture();
    await open([join(dir, "a.txt")]);
    const preset = (name: string) => button(name, section());
    const expectations: Array<[string, string]> = [["Private", "600"], ["Normal", "644"], ["Shared with my group", "664"], ["Read-only", "444"], ["Make executable", "755"], ["Remove execute", "644"], ["Everyone can read", "644"]];
    for (const [name, digits] of expectations) {
      preset(name).click();
      expect(octal().value, name).toBe(digits);
      expect(preset(name).getAttribute("aria-pressed")).toBe("true");
    }
    typeInto(octal(), "600");
    expect(preset("Everyone can read").getAttribute("aria-pressed")).toBe("false");
    await open([dir]);
    for (const [name, digits] of [["Private", "700"], ["Normal", "755"], ["Shared with my group", "775"], ["Read-only", "555"], ["Everyone can read", "755"]] as const) {
      button(name, section()).click();
      expect(octal().value, name).toBe(digits);
    }
    // "run" presets are for files: on a folder alone they say what is needed, and change nothing
    button("Make executable", section()).click();
    await until(() => previewText().includes("changes files only"), "the explanation");
    expect(applyButton().disabled).toBe(true);
  });

  test("several items with different modes show a mixed state, and only what was changed is applied", async () => {
    const dir = fixture({ "a.txt": 0o644, "b.txt": 0o600 });
    await open([join(dir, "a.txt"), join(dir, "b.txt")]);
    const g = box(0o040);
    expect(g.indeterminate).toBe(true);
    expect(g.getAttribute("aria-checked")).toBe("mixed");
    expect(box(0o200).indeterminate).toBe(false);
    expect(octal().value).toBe("");
    expect(octal().placeholder).toBe("mixed");
    expect(letters()).toBe("rw-?--?--");
    g.click();
    expect(g.checked).toBe(true);
    expect(g.indeterminate).toBe(false);
    await applyChange("1 item will change, 1 is already correct");
    await until(() => section().textContent.includes("Changed 1 item"), "the change");
    expect(modeOf(join(dir, "a.txt"))).toBe(0o644);
    expect(modeOf(join(dir, "b.txt"))).toBe(0o640);
  });

  test("a mixed box goes on, off, and back to leaving things as they are", async () => {
    const dir = fixture({ "a.txt": 0o644, "b.txt": 0o600 });
    await open([join(dir, "a.txt"), join(dir, "b.txt")]);
    const g = box(0o040);
    g.click();
    expect(g.checked).toBe(true);
    g.click();
    expect(g.checked).toBe(false);
    expect(g.indeterminate).toBe(false);
    g.click();
    expect(g.indeterminate).toBe(true);
    await until(() => previewText().includes("Change a box"), "the preview to clear");
    expect(applyButton().disabled).toBe(true);
    // typing digits sets everything exactly
    typeInto(octal(), "640");
    await applyChange("2 items will change");
    await until(() => section().textContent.includes("Changed 2 items"), "the change");
    expect([modeOf(join(dir, "a.txt")), modeOf(join(dir, "b.txt"))]).toEqual([0o640, 0o640]);
  });

  test("the preview says how many items change, are already right or can't be changed", async () => {
    const dir = tree();
    await open([dir]);
    button("Private", section()).click();
    section().querySelector('[data-recursive="on"]').click();
    const scope = section().querySelector(".perm-scope");
    expect(scope.disabled).toBe(false);
    await until(() => previewText().includes("will change"), "the preview");
    // root, a.txt, run.sh, sub, c.txt change; the link is left out
    expect(previewText()).toContain("5 items will change");
    expect(previewText()).toContain("1 is left out");
    expect(previewText()).toContain("Left out: 1 item (link)");
    expect(previewText()).not.toMatch(/\bnull\b|\bundefined\b/);
    scope.value = "files";
    scope.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await until(() => previewText().includes("3 items will change"), "the preview for files only");
    scope.value = "dirs";
    scope.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await until(() => previewText().includes("2 items will change"), "the preview for folders only");
    section().querySelector(".perm-examples summary").click();
    expect(section().querySelector(".perm-example-list").textContent).toContain("755 rwxr-xr-x");
    expect(modeOf(dir)).toBe(0o755); // a preview changes nothing
  });

  test("everything inside: files and folders get their own modes, links are untouched, and Undo puts it all back", async () => {
    const dir = tree();
    const before = [dir, join(dir, "a.txt"), join(dir, "run.sh"), join(dir, "sub"), join(dir, "sub", "c.txt")].map(modeOf);
    await open([dir]);
    button("Private", section()).click();
    section().querySelector('[data-recursive="on"]').click();
    await applyChange("5 items will change");
    await until(() => section().textContent.includes("Changed 5 items"), "the change");
    expect([dir, join(dir, "a.txt"), join(dir, "run.sh"), join(dir, "sub"), join(dir, "sub", "c.txt")].map(modeOf)).toEqual([0o700, 0o600, 0o600, 0o700, 0o600]);
    expect(modeOf(join(dir, "a.txt"))).toBe(0o600);
    const lnTarget = modeOf(join(dir, "a.txt"));
    expect(lnTarget).toBe(0o600);
    expect(state.undoStack.at(-1).label).toBe("permissions of 5 items");
    // the section is redrawn with the new permissions, and offers Undo
    await until(() => octal()?.value === "700", "the section to show the new permissions");
    const inline = section().querySelector(".perm-undo");
    expect(inline.hidden).toBe(false);
    inline.click();
    await until(() => modeOf(join(dir, "a.txt")) === 0o644, "Undo");
    expect([dir, join(dir, "a.txt"), join(dir, "run.sh"), join(dir, "sub"), join(dir, "sub", "c.txt")].map(modeOf)).toEqual(before);
    await until(() => octal()?.value === "755", "the boxes to show the restored permissions");
    expect(state.undoStack.some((u: any) => u.label === "permissions of 5 items")).toBe(false);
  });

  test("the page's own Undo undoes a change from this window", async () => {
    const dir = fixture();
    state.undoStack = [];
    await open([join(dir, "a.txt")]);
    button("Read-only", section()).click();
    await until(() => !applyButton().disabled, "the preview");
    // taking away your own write permission has to be confirmed
    expect(previewText()).toContain("You will be asked to confirm");
    applyButton().click();
    await until(() => top()?.textContent.includes("Are you sure?"), "the confirmation");
    button("Change permissions", top()).click();
    await until(() => modeOf(join(dir, "a.txt")) === 0o444, "the change");
    await until(() => state.undoStack.length === 1, "the Undo step");
    await ops.undo();
    expect(modeOf(join(dir, "a.txt"))).toBe(0o644);
    expect(state.undoStack).toHaveLength(0);
  });

  test("risky changes need confirmation; cancelling does nothing", async () => {
    const dir = fixture();
    const f = join(dir, "a.txt");
    await open([f]);
    typeInto(octal(), "777");
    await until(() => !applyButton().disabled, "the preview");
    expect(previewText()).toContain("Anyone with an account");
    applyButton().click();
    await until(() => top()?.textContent.includes("Are you sure?"), "the confirmation");
    const confirmation = top();
    expect(confirmation.textContent).toContain("Anyone with an account");
    for (const b of confirmation.querySelectorAll("button")) expect((b.title || b.textContent).trim()).toBeTruthy();
    button("Cancel", confirmation).click();
    await sleep(100);
    expect(modeOf(f)).toBe(0o644);
    expect(dialogs()).toHaveLength(1);
    applyButton().click();
    await until(() => dialogs().length === 2, "the confirmation again");
    button("Change permissions", top()).click();
    await until(() => modeOf(f) === 0o777, "the change");
    state.undoStack = [];
    // setuid on a file is confirmed too, and explained
    await open([join(dir, "run.sh")]);
    section().querySelector(".perm-advanced summary").click();
    box(0o4000).click();
    await until(() => !applyButton().disabled, "the preview");
    expect(previewText()).toContain("owner's or group's rights");
    applyButton().click();
    await until(() => top()?.textContent.includes("Are you sure?"), "the confirmation for setuid");
    button("Cancel", top()).click();
    await sleep(100);
    expect(modeOf(join(dir, "run.sh")) & 0o4000).toBe(0);
  });

  test("more than 50 items inside need confirmation; Stop and progress are in place", async () => {
    const dir = fixture({});
    for (let i = 0; i < 60; i++) {
      writeFileSync(join(dir, `f${i}.txt`), "x");
      chmodSync(join(dir, `f${i}.txt`), 0o644);
    }
    await open([dir]);
    button("Private", section()).click();
    section().querySelector('[data-recursive="on"]').click();
    const scope = section().querySelector(".perm-scope");
    scope.value = "files";
    scope.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await until(() => previewText().includes("60 items will change") && !applyButton().disabled, "the preview");
    expect(previewText()).toContain("changes a lot of items");
    expect(section().querySelector(".perm-cancel").hidden).toBe(true);
    applyButton().click();
    await until(() => top()?.textContent.includes("Are you sure?"), "the confirmation");
    button("Cancel", top()).click();
    await sleep(100);
    expect(modeOf(join(dir, "f1.txt"))).toBe(0o644);
    applyButton().click();
    await until(() => dialogs().length === 2, "the confirmation again");
    button("Change permissions", top()).click();
    await until(() => section().textContent.includes("Changed 60 items"), "the change");
    expect(modeOf(join(dir, "f59.txt"))).toBe(0o600);
    expect(modeOf(dir)).toBe(0o755); // only files were chosen
    state.undoStack = [];
  });

  test("the capital-X choice: making things readable doesn't make plain files run", async () => {
    const dir = tree();
    chmodSync(join(dir, "sub"), 0o700);
    await open([dir]);
    button("Everyone can read", section()).click();
    section().querySelector('[data-recursive="on"]').click();
    expect(section().querySelector('[data-xonly="on"]').checked).toBe(true);
    await applyChange("will change");
    await until(() => section().textContent.includes("Changed"), "the change");
    expect(modeOf(join(dir, "a.txt"))).toBe(0o644);
    expect(modeOf(join(dir, "run.sh"))).toBe(0o755);
    expect(modeOf(join(dir, "sub"))).toBe(0o755);
    expect(modeOf(join(dir, "sub", "c.txt"))).toBe(0o644);
    // Make executable on files inside turns the choice off, because it was asked for
    await open([dir]);
    button("Make executable", section()).click();
    section().querySelector('[data-recursive="on"]').click();
    expect(section().querySelector('[data-xonly="on"]').checked).toBe(false);
    await applyChange("will change");
    await until(() => section().textContent.includes("Changed"), "the change");
    expect(modeOf(join(dir, "a.txt"))).toBe(0o755);
    expect(modeOf(join(dir, "sub", "c.txt"))).toBe(0o755);
    expect(modeOf(join(dir, "sub"))).toBe(0o755); // folders are left alone by "executable"
    state.undoStack = [];
  });

  test("system items are refused with a reason, and nothing can be edited", async () => {
    await open(["/usr/bin/env"]);
    expect(section().textContent).toContain("Can't be changed here");
    expect(section().querySelector(".perm-grid")).toBeNull();
    expect(section().querySelector(".perm-apply")).toBeNull();
    expect(section().textContent).toContain("system folder");
    const dir = fixture();
    await open([join(dir, "a.txt"), "/usr/bin/env"]);
    expect(section().textContent).toContain("Some can't be changed");
    expect(section().querySelector(".perm-grid")).toBeTruthy();
  });

  test("a link is shown as one, with nothing to edit", async () => {
    const dir = tree();
    await open([join(dir, "ln")]);
    expect(section().textContent).toContain("This is a link");
    expect(section().querySelector(".perm-grid")).toBeNull();
  });

  test("every control has visible text or a label, and a plain-words title; no stray words", async () => {
    const dir = tree();
    await open([dir]);
    section().querySelector(".perm-advanced summary").click();
    section().querySelector('[data-recursive="on"]').click();
    button("Private", section()).click();
    await until(() => previewText().includes("will change"), "the preview");
    const controls = [...section().querySelectorAll("input, select, button, summary")];
    expect(controls.length).toBeGreaterThan(25);
    for (const c of controls) {
      const label = c.getAttribute("aria-label") || c.textContent.trim() || c.closest("label")?.textContent.trim();
      expect(label, c.outerHTML.slice(0, 100)).toBeTruthy();
      const title = c.title || c.closest("label")?.title || "";
      expect(title.length, `${label} needs a title`).toBeGreaterThan(8);
      expect(c.getAttribute("tabindex"), label).not.toBe("-1");
    }
    expect(section().querySelector(".perm-grid").getAttribute("aria-label")).toBe("Who can read, write or run");
    // no table, text block or fact list of its own: the Properties window keeps a single Copy button
    expect(section().querySelectorAll("table, pre, dl")).toHaveLength(0);
    expect(section().textContent).not.toMatch(/\bnull\b|\bundefined\b|\[object|NaN/i);
    // nothing relies on colour alone: warnings start with words
    for (const w of section().querySelectorAll(".perm-warn")) expect(w.textContent).toMatch(/^Careful/);
  });

  test("the section is built without HTML strings: a hostile name stays plain text", async () => {
    const dir = fixture({ "<img src=x onerror=alert(1)>.txt": 0o644, "b.txt": 0o600 });
    await open([join(dir, "<img src=x onerror=alert(1)>.txt"), join(dir, "b.txt")]);
    button("Private", section()).click();
    await until(() => previewText().includes("will change"), "the preview");
    section().querySelector(".perm-examples summary").click();
    expect(section().querySelector("img")).toBeNull();
    expect(section().querySelector(".perm-example-list").textContent).toContain("<img src=x onerror=alert(1)>.txt");
  });
});

describe.skipIf(!posix)("quick actions in the right-click menu, and the Details panel", () => {
  async function menuFor(paths: string[]) {
    closeAll();
    await nav.goTo(join(paths[0]!, ".."), { push: false });
    const entries = state.entries.filter((e: any) => paths.includes(e.path));
    menu.showEntryMenu(entries, { x: 10, y: 10 });
    return [...doc.querySelectorAll(".menu .menu-item")] as any[];
  }
  const labels = (items: any[]) => items.map((i) => i.querySelector(".menu-label").textContent);

  test("a file that doesn't run offers Make executable and Permissions…; one that does offers Remove execute", async () => {
    const dir = fixture({ "plain.txt": 0o644, "tool.sh": 0o755 });
    state.undoStack = [];
    let items = await menuFor([join(dir, "plain.txt")]);
    expect(labels(items)).toContain("Make executable");
    expect(labels(items)).not.toContain("Remove execute");
    expect(labels(items)).toContain("Permissions…");
    for (const i of items) expect((i.title || i.textContent).trim().length).toBeGreaterThan(2);
    items.find((i) => i.textContent.includes("Make executable")).click();
    await until(() => modeOf(join(dir, "plain.txt")) === 0o755, "the change");
    await until(() => state.undoStack.length === 1, "the Undo step");
    expect(state.undoStack[0].label).toContain("make executable");
    await until(() => doc.querySelector("#toasts")?.textContent.includes("is now executable"), "the message");
    await ops.undo();
    expect(modeOf(join(dir, "plain.txt"))).toBe(0o644);

    items = await menuFor([join(dir, "tool.sh")]);
    expect(labels(items)).toContain("Remove execute");
    expect(labels(items)).not.toContain("Make executable");
    items.find((i) => i.textContent.includes("Remove execute")).click();
    await until(() => modeOf(join(dir, "tool.sh")) === 0o644, "the change");
    await until(() => state.undoStack.length === 1, "the Undo step");
    await ops.undo();
    expect(modeOf(join(dir, "tool.sh"))).toBe(0o755);
  });

  test("several files change together as one Undo step; folders are left out", async () => {
    const dir = fixture({ "one.txt": 0o644, "two.txt": 0o600 });
    mkdirSync(join(dir, "sub"));
    chmodSync(join(dir, "sub"), 0o755);
    state.undoStack = [];
    const items = await menuFor([join(dir, "one.txt"), join(dir, "two.txt"), join(dir, "sub")]);
    items.find((i) => i.textContent.includes("Make executable")).click();
    await until(() => modeOf(join(dir, "two.txt")) === 0o711, "the change");
    expect(modeOf(join(dir, "one.txt"))).toBe(0o755);
    expect(modeOf(join(dir, "sub"))).toBe(0o755);
    expect(state.undoStack).toHaveLength(1);
    await ops.undo();
    expect([modeOf(join(dir, "one.txt")), modeOf(join(dir, "two.txt"))]).toEqual([0o644, 0o600]);
  });

  test("a folder only offers Permissions…, which opens Properties at the permissions", async () => {
    const dir = fixture();
    const items = await menuFor([dir]);
    expect(labels(items)).not.toContain("Make executable");
    expect(labels(items)).not.toContain("Remove execute");
    items.find((i) => i.textContent.includes("Permissions…")).click();
    await until(() => section()?.querySelector(".perm-grid"), "the permissions");
    await until(() => doc.activeElement === box(0o400), "focus on the first box");
    expect(top().textContent).toContain("Properties");
  });

  test("the Details panel shows one line of permissions for one item", async () => {
    const dir = fixture({ "a.txt": 0o644, "tool.sh": 0o4755 });
    await nav.goTo(dir, { push: false });
    for (const [name, text] of [["a.txt", "rw-r--r-- (644)"], ["tool.sh", "rwsr-xr-x (4755)"]] as const) {
      state.selection = new Set([join(dir, name)]);
      await info.renderInfo();
      const panel = doc.getElementById("info");
      expect(panel.textContent, name).toContain("Permissions");
      expect(panel.textContent, name).toContain(text);
      expect(panel.textContent, name).not.toMatch(/\bnull\b|\bundefined\b/);
    }
    state.selection = new Set([join(dir, "a.txt"), join(dir, "tool.sh")]);
    await info.renderInfo();
    expect(doc.getElementById("info").textContent).not.toContain("Permissions");
    symlinkSync(join(dir, "a.txt"), join(dir, "ln"));
    await nav.goTo(dir, { push: false });
    state.selection = new Set([join(dir, "ln")]);
    await info.renderInfo();
    expect(doc.getElementById("info").textContent).not.toMatch(/\bnull\b|\bundefined\b/);
  });

  test("the page's rwx text is the same as the server's for every mode", async () => {
    const { permissionText } = await import("../src/features/filemanager/fmInfoFile");
    for (let mode = 0; mode <= 0o7777; mode++) expect(model.symbolicOf(mode)).toBe(permissionText(mode));
    expect(model.octalOf(0o644)).toBe("644");
    expect(model.octalOf(0o4755)).toBe("4755");
    expect(model.parseOctal("0644")).toBe(0o644);
    expect(model.parseOctal("644 ")).toBe(0o644);
    for (const bad of ["", "64", "99", "12345", "6a4", null, undefined]) expect(model.parseOctal(bad)).toBeNull();
  });
});

describe.skipIf(!posix)("macOS extras: Locked and Hidden", () => {
  test("two more boxes, shown and applied through the program stand-in, with Undo", async () => {
    const dir = fixture({ "a.txt": 0o644 });
    const file = join(dir, "a.txt");
    const files: Record<string, { locked?: boolean; hidden?: boolean }> = {};
    const calls: string[][] = [];
    const server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data-mac"), platform: "darwin" } });
    servers.push(server);
    setPermsHooks(server.context, {
      run: async (argv: string[]): Promise<RunResult> => {
        calls.push(argv);
        const path = argv.at(-1)!;
        if (argv[0] === "/usr/bin/stat" && argv[2] === "%f") return { code: 0, stdout: `${((files[path] ??= {}).locked ? 2 : 0) | (files[path]!.hidden ? 0x8000 : 0)}\n`, stderr: "" };
        if (argv[0] === "/usr/bin/stat") return { code: 0, stdout: "me:staff\n", stderr: "" };
        if (argv[0] === "/usr/bin/chflags") {
          for (const w of argv[3]!.split(",")) {
            const f = (files[path] ??= {});
            if (w === "uchg") f.locked = true;
            else if (w === "nouchg") f.locked = false;
            else if (w === "hidden") f.hidden = true;
            else if (w === "nohidden") f.hidden = false;
          }
          return { code: 0, stdout: "", stderr: "" };
        }
        return { code: 1, stdout: "", stderr: "" };
      },
    });
    const previous = base;
    base = `http://127.0.0.1:${server.port}`;
    try {
      state.undoStack = [];
      await open([file]);
      const locked = section().querySelector('[data-flag="locked"]');
      const hidden = section().querySelector('[data-flag="hidden"]');
      expect(locked).toBeTruthy();
      expect(hidden).toBeTruthy();
      expect(locked.getAttribute("aria-label")).toBe("Locked");
      expect(locked.title).toContain("can't be changed");
      expect(locked.checked).toBe(false);
      locked.click();
      hidden.click();
      await applyChange("1 item will change");
      await until(() => section().textContent.includes("Changed 1 item"), "the change");
      expect(files[file]).toEqual({ locked: true, hidden: true });
      expect(calls.find((c) => c[0] === "/usr/bin/chflags")).toEqual(["/usr/bin/chflags", "-h", "--", "hidden,uchg", file]);
      expect(modeOf(file)).toBe(0o644);
      await ops.undo();
      expect(files[file]).toEqual({ locked: false, hidden: false });
    } finally {
      base = previous;
      closeAll();
    }
  });
});
