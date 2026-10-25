import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { setVaultInternal } from "../src/features/filemanager/fmVaultTasks";

// The Lock dialogs, run for real in a fake browser (jsdom) against the real server. The fake browser's globals are
// removed again in afterAll so that other test files are not affected.
const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch", "Event", "KeyboardEvent"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

const scratch = join(import.meta.dir, `.scratch-fm-vault-page-${process.pid}`);
const home = join(scratch, "home");
const work = join(home, "work");
const PW = "river-lamp-orbit-seven-plum";
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let vault: any;
let strength: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dialog = (): any => doc.querySelector(".modal-backdrop .dialog");
const buttons = () => [...dialog().querySelectorAll("button")] as any[];
const button = (text: string): any => buttons().find((b) => b.textContent.trim() === text);
const input = (selector: string): any => dialog().querySelector(selector);
const pwBoxes = (): any[] => [...dialog().querySelectorAll("input.vault-input")];
const type = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
};
// Key derivation and decryption are slow on a shared CI runner, so the wait is long (each test still has its own 30 s limit).
const until = async (fn: () => boolean, ms = 25_000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timed out waiting. Dialog text: ${dialog()?.textContent?.slice(0, 600)}`);
    await sleep(20);
  }
};
const closeAll = () => {
  for (const b of doc.querySelectorAll(".modal-backdrop")) {
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    b.remove();
  }
  doc.body.classList.remove("modal-open");
};
const entry = (name: string, isDir = false, size = 0) => ({ name, path: join(work, name), isDir, size });

beforeAll(async () => {
  mkdirSync(join(work, "album"), { recursive: true });
  writeFileSync(join(work, "note.txt"), "a private note");
  writeFileSync(join(work, "album", "one.txt"), "1");
  writeFileSync(join(work, "album", "two.txt"), "22");
  writeFileSync(join(work, "plain.txt"), "not encrypted");
  writeFileSync(join(work, "fake.radenc"), "I only have the extension");
  mock.module("../resources/file_manager/ui/terminal.js", () => ({
    terminalShell: () => "posix",
    terminalWsl: () => ({}),
    terminalAvailable: () => false,
    typeInTerminal: () => false,
    showTerminal() {},
    hideTerminal() {},
    toggleTerminal() {},
    wireTerminal() {},
    isTerminalOpen: () => false,
  }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(scratch, "data") } });
  setVaultInternal(server.context, { kdf: { memoryKiB: 64, passes: 1, parallelism: 1 } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform);
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  win = dom.window;
  strength = await import("../resources/file_manager/ui/vaultStrength.js");
  vault = await import("../resources/file_manager/ui/vault.js");
  const state = (await import("../resources/file_manager/ui/state.js")).state as any;
  state.sep = process.platform === "win32" ? "\\" : "/";
  state.platform = process.platform;
  state.location = { kind: "folder", path: work };
});

afterEach(() => {
  closeAll();
});

afterAll(() => {
  closeAll();
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const before = saved.get(key);
    if (before) Object.defineProperty(g, key, before);
    else delete g[key];
  }
  mock.restore();
  server.stop(true);
  rmSync(scratch, { recursive: true, force: true });
});

describe("the strength meter's words", () => {
  test("too short, weak, good and strong, in plain words", () => {
    const { strengthOf, MIN_LENGTH } = strength;
    expect(MIN_LENGTH).toBe(10);
    expect(strengthOf("").label).toBe("Nothing typed yet");
    expect(strengthOf("abc12").label).toBe("Too short");
    expect(strengthOf("abc12").tip).toContain("10");
    expect(strengthOf("aaaaaaaaaaaa").label).toBe("Weak");
    expect(strengthOf("password").label).toBe("Too short");
    expect(strengthOf("sunshine1234").label).toBe("Weak");
    expect(strengthOf("correct-horse-battery").label).toBe("Weak");
    expect(strengthOf("correct-horse-battery-staple").label).toBe("Good");
    expect(strengthOf("Summer2024!").label).toBe("Weak");
    expect(strengthOf("river-lamp-orbit-seven-plum-quiet").label).toBe("Good");
    expect(strengthOf("river-lamp-orbit-seven-plum-quiet-garden").label).toBe("Strong");
    expect(strengthOf("k8#Vq!zP2m@Lw9$Xr4&n").label).toBe("Strong");
  });

  test("a passphrase the page suggested uses its exact strength", () => {
    const { strengthOf } = strength;
    const phrase = "tiger-orbit-lamp-river-seven-plum";
    expect(strengthOf(phrase, { phrase, bits: 66 })).toMatchObject({ level: 4, label: "Strong", bits: 66 });
    expect(strengthOf(phrase + "x", { phrase, bits: 66 }).bits).not.toBe(66);
  });
});

describe("the Encrypt dialog", () => {
  test("lists what will be locked, with sizes, and every control has a label and a tooltip", async () => {
    vault.lockEntries([entry("note.txt", false, 14), entry("album", true)]);
    const d = dialog();
    expect(d.querySelector("h2").textContent).toBe("Encrypt 2 items");
    await until(() => d.querySelector(".vault-items").textContent.includes("2 files"));
    const text = d.querySelector(".vault-items").textContent;
    expect(text).toContain("note.txt");
    expect(text).toContain("14 bytes");
    expect(text).toContain("album");
    expect(text).toContain("Folder: 2 files, 3 bytes");
    const controls = [...d.querySelectorAll("button, input, select, textarea")] as any[];
    expect(controls.length).toBeGreaterThan(10);
    for (const c of controls) {
      expect(c.getAttribute("title"), c.outerHTML.slice(0, 120)).toBeTruthy();
      if (c.tagName !== "BUTTON") expect(c.labels?.length || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
    }
    expect(d.querySelectorAll("[style]").length).toBe(0);
    expect(d.textContent).not.toContain("null");
    expect(d.textContent).not.toContain("undefined");
    const [a, b] = pwBoxes();
    expect([a.type, b.type]).toEqual(["password", "password"]);
    expect([a.autocomplete, b.autocomplete]).toEqual(["new-password", "new-password"]);
    expect(d.textContent).toContain("There is no way to recover a lost password");
    expect(input("input[type=radio]:checked").value).toBe("standard");
    expect(d.textContent).toContain("Standard (recommended)");
    const [compress, hide, trash] = [...d.querySelectorAll(".vault-option input[type=checkbox]")] as any[];
    expect([compress.checked, hide.checked, trash.checked]).toEqual([true, false, false]);
    expect([...d.querySelectorAll(".vault-summary li")].map((li: any) => li.textContent)).toEqual(["note.txt.radenc", "album.radenc"]);
    closeAll();
  });

  test("hiding the name changes the planned file names", () => {
    vault.lockEntries([entry("note.txt"), entry("plain.txt")]);
    const hide = [...dialog().querySelectorAll(".vault-option input[type=checkbox]")][1] as any;
    hide.checked = true;
    hide.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect([...dialog().querySelectorAll(".vault-summary li")].map((li: any) => li.textContent)).toEqual(["Encrypted file 1.radenc", "Encrypted file 2.radenc"]);
    closeAll();
  });

  test("validation: empty, too short and mismatched passwords are explained and nothing starts", async () => {
    vault.lockEntries([entry("note.txt")]);
    const [a, b] = pwBoxes();
    button("Encrypt").click();
    expect(dialog().querySelector(".dialog-error").textContent).toBe("Type a password first.");
    type(a, "short");
    button("Encrypt").click();
    expect(dialog().querySelector(".dialog-error").textContent).toContain("too short");
    type(a, PW);
    type(b, PW + "x");
    expect(dialog().querySelector(".vault-mismatch").hidden).toBe(false);
    button("Encrypt").click();
    expect(dialog().querySelector(".dialog-error").textContent).toContain("don't match");
    type(b, PW);
    expect(dialog().querySelector(".vault-mismatch").hidden).toBe(true);
    await sleep(50);
    expect(existsSync(join(work, "note.txt.radenc"))).toBe(false);
    closeAll();
  });

  test("the strength meter updates as you type, in words and in the accessible value", () => {
    vault.lockEntries([entry("note.txt")]);
    const [a] = pwBoxes();
    const meter = dialog().querySelector("[role=meter]");
    const label = () => dialog().querySelector(".vault-meter-text").textContent;
    expect(meter.getAttribute("aria-label")).toBe("Password strength");
    type(a, "abc");
    expect(label()).toBe("Too short");
    expect(meter.getAttribute("aria-valuetext")).toBe("Too short");
    type(a, "sunshine1234");
    expect(label()).toContain("Weak");
    type(a, "correct-horse-battery-staple");
    expect(label()).toContain("Good");
    expect(meter.getAttribute("aria-valuenow")).toBe("3");
    type(a, "river-lamp-orbit-seven-plum-quiet-garden");
    expect(label()).toContain("Strong");
    expect(dialog().querySelector(".vault-meter-bar").dataset.level).toBe("4");
    closeAll();
  });

  test("Show/Hide reveals the password, and a Caps Lock hint appears", () => {
    vault.lockEntries([entry("note.txt")]);
    const [a, b] = pwBoxes();
    const toggle = button("Show");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    toggle.click();
    expect([a.type, b.type]).toEqual(["text", "text"]);
    expect(button("Hide").getAttribute("aria-pressed")).toBe("true");
    button("Hide").click();
    expect(a.type).toBe("password");
    expect(dialog().querySelector(".vault-caps").hidden).toBe(true);
    const caps = new win.KeyboardEvent("keydown", { key: "A", modifierCapsLock: true, bubbles: true });
    a.dispatchEvent(caps);
    expect(dialog().querySelector(".vault-caps").hidden).toBe(false);
    a.dispatchEvent(new win.KeyboardEvent("keyup", { key: "A", bubbles: true }));
    expect(dialog().querySelector(".vault-caps").hidden).toBe(true);
    closeAll();
  });

  test("Suggest a passphrase fills both boxes with random words, shows them, and warns", async () => {
    vault.lockEntries([entry("note.txt")]);
    const [a, b] = pwBoxes();
    button("Suggest a passphrase").click();
    await until(() => a.value.length > 0);
    expect(a.value.split("-")).toHaveLength(6);
    expect(b.value).toBe(a.value);
    expect(a.type).toBe("text");
    const shown = dialog().querySelector(".vault-phrase").textContent;
    expect(shown).toBe(a.value);
    expect(dialog().querySelector(".vault-suggestion").textContent).toContain("can't be opened by anyone");
    expect(dialog().querySelector(".vault-meter-text").textContent).toContain("Strong");
    expect(dialog().querySelector(".vault-meter-text").textContent).toContain("66");
    const first = a.value;
    button("Suggest a passphrase").click();
    await until(() => a.value !== first);
    closeAll();
  });

  test("the server's refusal of an obvious password is shown in the dialog, and the boxes keep what was typed", async () => {
    vault.lockEntries([entry("note.txt")]);
    const [a, b] = pwBoxes();
    type(a, "password123456");
    type(b, "password123456");
    button("Encrypt").click();
    await until(() => !dialog().querySelector(".dialog-error").hidden);
    expect(dialog().querySelector(".dialog-error").textContent).toContain("too easy to guess");
    expect(a.value).toBe("password123456");
    expect(button("Encrypt").disabled).toBe(false);
    expect(existsSync(join(work, "note.txt.radenc"))).toBe(false);
    closeAll();
  });

  test("a real run: progress, per-item results, Show in folder, originals untouched, boxes cleared", async () => {
    vault.lockEntries([entry("note.txt"), entry("album", true)]);
    const [a, b] = pwBoxes();
    type(a, PW);
    type(b, PW);
    button("Encrypt").click();
    await until(() => a.value === "" && b.value === "");
    await until(() => dialog().textContent.includes("2 items locked"), 15_000);
    const text = dialog().textContent;
    expect(text).toContain("Locked as note.txt.radenc");
    expect(text).toContain("Locked as album.radenc");
    expect(text).toContain("forget the password");
    expect(text).not.toContain(PW);
    expect(text).not.toContain("null");
    expect(button("Show in folder")).toBeTruthy();
    expect(readdirSync(work).sort()).toEqual(["album", "album.radenc", "fake.radenc", "note.txt", "note.txt.radenc", "plain.txt"]);
    expect(readFileSync(join(work, "note.txt"), "utf8")).toBe("a private note");
    expect(readFileSync(join(work, "note.txt.radenc")).includes(Buffer.from("a private note"))).toBe(false);
    button("Close").click();
    await sleep(20);
    expect(doc.querySelector(".modal-backdrop")).toBeNull();
  }, 30_000);

  test("closing the window while a job runs cancels it and leaves nothing behind", async () => {
    const big = join(work, "big.bin");
    writeFileSync(big, Buffer.alloc(40_000_000, 7));
    vault.lockEntries([{ name: "big.bin", path: big, isDir: false, size: 40_000_000 }]);
    const [a, b] = pwBoxes();
    type(a, PW);
    type(b, PW);
    button("Encrypt").click();
    await until(() => !!dialog()?.querySelector(".vault-progress"));
    doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await until(() => !doc.querySelector(".modal-backdrop"));
    expect(a.value).toBe("");
    await sleep(1500);
    expect(readdirSync(work).filter((n) => n.startsWith(".radenc"))).toEqual([]);
    rmSync(big);
    rmSync(join(work, "big.bin.radenc"), { force: true });
  }, 30_000);
});

describe("the Decrypt dialog", () => {
  test("shows what the file is, without a password", async () => {
    vault.unlockEntries([entry("note.txt.radenc")]);
    expect(dialog().querySelector("h2").textContent).toBe("Decrypt “note.txt.radenc”");
    await until(() => dialog().querySelector(".vault-items").textContent.includes("RADENC encrypted file"));
    expect(dialog().querySelector(".vault-items").textContent).toMatch(/Lock strength: Custom\. Compressed\. Size: /);
    const pw = pwBoxes();
    expect(pw).toHaveLength(1);
    expect(pw[0].autocomplete).toBe("current-password");
    for (const c of dialog().querySelectorAll("button, input")) {
      expect(c.getAttribute("title"), c.outerHTML.slice(0, 100)).toBeTruthy();
      if (c.tagName !== "BUTTON") expect(c.labels?.length || c.getAttribute("aria-label")).toBeTruthy();
    }
    expect(button("Decrypt").disabled).toBe(false);
    closeAll();
  });

  test("a file that isn't RADENC gets a friendly message and can't be decrypted", async () => {
    vault.unlockEntries([entry("fake.radenc")]);
    await until(() => dialog().querySelector(".vault-items").textContent.includes("isn't a RADENC"));
    expect(button("Decrypt").disabled).toBe(true);
    expect(dialog().querySelector(".dialog-error").textContent).toContain("can't be unlocked");
    closeAll();
  });

  test("a wrong password is reported plainly, then Try again and the right password work", async () => {
    vault.unlockEntries([entry("note.txt.radenc")]);
    await until(() => dialog().querySelector(".vault-items").textContent.includes("RADENC encrypted file"));
    const [pw] = pwBoxes();
    const out = join(scratch, "unlocked");
    mkdirSync(out, { recursive: true });
    const folder = input("input[type=text]:not(.vault-input)");
    type(folder, out);
    type(pw, "this is not the password");
    button("Decrypt").click();
    await until(() => dialog().textContent.includes("Wrong password, or the file is damaged or has been changed.") && !!button("Try again"));
    expect(pw.value).toBe("");
    expect(readdirSync(out)).toEqual([]);
    button("Try again").click();
    const [again] = pwBoxes();
    expect(again.value).toBe("");
    type(again, PW);
    button("Decrypt").click();
    await until(() => dialog().textContent.includes("1 item unlocked"));
    expect(dialog().textContent).toContain("Unlocked as note.txt");
    expect(readFileSync(join(out, "note.txt"), "utf8")).toBe("a private note");
    expect(again.value).toBe("");
    button("Close").click();
  }, 30_000);

  test("several files: the valid ones are unlocked and an invalid one is marked", async () => {
    vault.unlockEntries([entry("note.txt.radenc"), entry("album.radenc"), entry("fake.radenc")]);
    await until(() => dialog().querySelector(".vault-items").textContent.includes("isn't a RADENC"));
    const out = join(scratch, "unlocked2");
    mkdirSync(out, { recursive: true });
    type(input("input[type=text]:not(.vault-input)"), out);
    type(pwBoxes()[0], PW);
    button("Decrypt").click();
    await until(() => dialog().textContent.includes("2 items unlocked"));
    expect(readdirSync(out).sort()).toEqual(["album", "note.txt"]);
    closeAll();
  }, 30_000);
});

describe("where the dialogs are offered", () => {
  test("only unlocked items can be locked; only .radenc files can be unlocked", () => {
    expect(vault.canLock([entry("a.txt"), entry("folder", true)])).toBe(true);
    expect(vault.canLock([entry("a.radenc")])).toBe(false);
    expect(vault.canLock([entry("a.txt"), entry("a.radenc")])).toBe(false);
    expect(vault.canLock([])).toBe(false);
    expect(vault.canUnlock([entry("a.RADENC")])).toBe(true);
    expect(vault.canUnlock([entry("a.radenc"), entry("b.txt")])).toBe(false);
    expect(vault.canUnlock([entry("folder.radenc", true)])).toBe(false);
    expect(vault.isLocked(entry("x.radenc"))).toBe(true);
  });

  test("the right-click menu and the toolbar offer the Lock actions (the menu module can't load without a real terminal library, so its source is checked)", () => {
    const ui = join(import.meta.dir, "..", "resources", "file_manager", "ui");
    const menu = readFileSync(join(ui, "contextmenu.js"), "utf8");
    expect(menu).toContain('canLock(entries) ? { label: "Encrypt…"');
    expect(menu).toContain('canUnlock(entries) ? { label: "Decrypt…"');
    const bar = readFileSync(join(ui, "toolbar.js"), "utf8");
    expect(bar).toMatch(/id: "lock", icon: "🔒", label: "Lock"/);
    expect(bar).toContain("run: lockSelection");
    expect(readFileSync(join(ui, "main.js"), "utf8")).toContain('import "./vault.js"');
  });

  test("Enter or double-click on a .radenc file opens the Decrypt dialog instead of the system opener", async () => {
    const ops = await import("../resources/file_manager/ui/ops.js");
    await ops.openEntry(entry("note.txt.radenc"));
    expect(dialog().querySelector("h2").textContent).toContain("Decrypt");
    closeAll();
  });
});
