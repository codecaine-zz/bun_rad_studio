import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The "this file isn't what its name says" badges, dialogs and the open guard, run for real in a fake browser
// (jsdom) against the real server. The fake browser's globals are removed again in afterAll.
const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "MutationObserver", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

const root = mkdtempSync(join(tmpdir(), "fm-typecheck-ui-"));
const home = join(root, "home");
const files = join(home, "files");
const big = join(home, "big");
const launched: Array<{ command: string; args: string[] }> = [];
const checkRequests: string[][] = [];
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let nav: any;
let state: any;
let api: any;
let ops: any;
let info: any;
let extras: any;
let events: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const winProgram = () => {
  const b = Buffer.alloc(256);
  b.write("MZ");
  b[0x18] = 0x40;
  b.writeUInt32LE(0x80, 0x3c);
  b.write("PE\0\0", 0x80, "latin1");
  b.writeUInt16LE(0x22, 0x80 + 22);
  return b;
};
const rowFor = (name: string): any => [...doc.querySelectorAll("#list .row")].find((r: any) => r.querySelector(".name-text")?.textContent === name);
const badgeFor = (name: string): any => rowFor(name)?.querySelector(".type-badge") ?? null;
const dialog = (): any => [...doc.querySelectorAll(".modal-backdrop")].at(-1);
const dialogButton = (text: string): any => [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.trim() === text);
const closeDialogs = async () => {
  for (const b of [...doc.querySelectorAll(".modal-backdrop")]) b.remove();
  doc.body.classList.remove("modal-open");
  await sleep(10);
};
const settle = (ms = 700) => sleep(ms);
const entry = (name: string) => state.entries.find((e: any) => e.name === name);
const serverSettings = async () => (await api.call("settings")).settings;

beforeAll(async () => {
  mkdirSync(files, { recursive: true });
  mkdirSync(big, { recursive: true });
  writeFileSync(join(files, "invoice.pdf"), winProgram());
  writeFileSync(join(files, "photo.jpg"), png());
  writeFileSync(join(files, "clean.png"), png());
  writeFileSync(join(files, "notes.txt"), "just some words\n");
  writeFileSync(join(files, "scan.jpg"), png());
  writeFileSync(join(files, "scan.png"), "I was here first");
  writeFileSync(join(files, "report.pdf.exe"), winProgram());
  for (let i = 0; i < 620; i++) writeFileSync(join(big, `f${String(i).padStart(3, "0")}.pdf`), winProgram());
  // The terminal needs a library the page loads from /vendor/, which a plain import can't reach.
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data"), launch: async (command, args) => void launched.push({ command, args }) } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  (dom.window as any).HTMLElement.prototype.scrollIntoView = () => {};
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", {
    value: (u: any, o: any) => {
      if (typeof u === "string" && u.endsWith("/api/check/files")) checkRequests.push(JSON.parse(o.body).paths);
      return realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o);
    },
    configurable: true,
    writable: true,
  });
  doc = dom.window.document;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  events = await import("../resources/file_manager/ui/state.js");
  api = await import("../resources/file_manager/ui/api.js");
  nav = await import("../resources/file_manager/ui/nav.js");
  ops = await import("../resources/file_manager/ui/ops.js");
  info = await import("../resources/file_manager/ui/info.js");
  extras = await import("../resources/file_manager/ui/extras.js");
  const list = await import("../resources/file_manager/ui/list.js");
  const typecheck = await import("../resources/file_manager/ui/typecheck.js");
  state.home = home;
  state.sep = "/";
  state.settings = await serverSettings();
  list.wireList();
  info.wireInfo();
  typecheck.wireTypeCheck();
  await nav.goTo(files);
  await settle();
});

afterAll(() => {
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const d = saved.get(key);
    if (d) Object.defineProperty(g, key, d);
    else delete g[key];
  }
  mock.restore();
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("badges in the file list", () => {
  test("a disguised program, a PNG named .jpg and a double extension get a badge; clean files and plain text do not", () => {
    expect(badgeFor("invoice.pdf")).not.toBeNull();
    expect(badgeFor("photo.jpg")).not.toBeNull();
    expect(badgeFor("report.pdf.exe")).not.toBeNull();
    expect(badgeFor("clean.png")).toBeNull();
    expect(badgeFor("notes.txt")).toBeNull();
    expect(rowFor("invoice.pdf").classList.contains("has-verdict")).toBe(true);
  });

  test("each badge says what it is in words, not just color, and can be focused and pressed", () => {
    const danger = badgeFor("invoice.pdf");
    expect(danger.tagName).toBe("BUTTON");
    expect(danger.type).toBe("button");
    expect(danger.classList.contains("danger")).toBe(true);
    expect(danger.textContent).toContain("⛔");
    expect(danger.textContent).toContain("Danger");
    expect(danger.getAttribute("aria-label")).toBe("Danger: this file is not what its name says. Press for details");
    expect(danger.title).toContain("This is a program in disguise");
    expect(danger.title).toContain("Windows program");
    expect(danger.tabIndex).toBeGreaterThanOrEqual(0);
    const notice = badgeFor("photo.jpg");
    expect(notice.classList.contains("notice")).toBe(true);
    expect(notice.textContent).toContain("ℹ️");
    expect(notice.getAttribute("aria-label")).toMatch(/^Note: this file is not what its name says/);
  });

  test("the folder was asked about once, in a batch, for files only", () => {
    const asked = checkRequests.flat();
    expect(asked.filter((p) => p.endsWith("invoice.pdf")).length).toBe(1);
    expect(asked.length).toBe(7);
  });

  test("only the first 300 rows of a big folder are checked, and more when the rest is shown", async () => {
    checkRequests.length = 0;
    await nav.goTo(big);
    await settle(900);
    expect(doc.querySelectorAll("#list .row").length).toBe(500);
    expect(doc.querySelectorAll("#list .type-badge").length).toBe(300);
    expect(checkRequests.flat().length).toBe(300);
    expect(Math.max(...checkRequests.map((r) => r.length))).toBeLessThanOrEqual(100);
    doc.querySelector("#list .more .btn").click();
    await settle(900);
    expect(doc.querySelectorAll("#list .row").length).toBe(620);
    expect(doc.querySelectorAll("#list .type-badge").length).toBe(620);
    await nav.goTo(files);
    await settle();
  });
});

describe("the explanation dialog", () => {
  test("a disguised program: plain words, no rename, a safe Close", async () => {
    badgeFor("invoice.pdf").click();
    await sleep(50);
    const text = dialog().textContent;
    expect(text).toContain("This file isn't what its name says");
    expect(text).toContain('This file is named "invoice.pdf", but it is really a Windows program.');
    expect(text).toContain("What this means");
    expect(text).toContain("Don't open it unless you trust where it came from.");
    expect(dialogButton("Show in Details")).toBeTruthy();
    expect(dialogButton("Close")).toBeTruthy();
    expect([...dialog().querySelectorAll("button")].some((b: any) => b.textContent.startsWith("Rename to"))).toBe(false);
    for (const b of dialog().querySelectorAll("button")) expect(b.title, b.textContent).toBeTruthy();
    await closeDialogs();
  });

  test("Show in Details opens the Details panel on that file", async () => {
    badgeFor("invoice.pdf").click();
    await sleep(50);
    dialogButton("Show in Details").click();
    await sleep(500);
    expect(state.settings.showInfoPanel).toBe(true);
    expect([...state.selection]).toEqual([join(files, "invoice.pdf")]);
    expect(doc.querySelector(".modal-backdrop")).toBeNull();
    expect(doc.querySelector("#info .type-block.danger")?.textContent).toContain("Windows program");
  });

  test("Rename to .png renames the file, refreshes the list and says so", async () => {
    badgeFor("photo.jpg").click();
    await sleep(50);
    const rename = dialogButton("Rename to .png");
    expect(rename).toBeTruthy();
    expect(rename.title).toContain("nothing is overwritten");
    rename.click();
    await sleep(700);
    expect(existsSync(join(files, "photo.png"))).toBe(true);
    expect(existsSync(join(files, "photo.jpg"))).toBe(false);
    expect(doc.querySelector(".modal-backdrop")).toBeNull();
    expect(rowFor("photo.png")).not.toBeNull();
    expect(rowFor("photo.jpg")).toBeFalsy();
    expect(doc.querySelector("#toasts").textContent).toContain('Renamed to "photo.png"');
    await settle(500);
    expect(badgeFor("photo.png")).toBeNull();
  });

  test("it never overwrites: when the new name is taken the dialog says so and nothing changes", async () => {
    badgeFor("scan.jpg").click();
    await sleep(50);
    dialogButton("Rename to .png").click();
    await sleep(500);
    expect(dialog().querySelector(".dialog-error").textContent).toContain("already exists");
    expect(readFileSync(join(files, "scan.png"), "utf8")).toBe("I was here first");
    expect(existsSync(join(files, "scan.jpg"))).toBe(true);
    await closeDialogs();
  });
});

describe("opening", () => {
  test("a file that isn't what its name says asks first; Don't open leaves it, Open anyway opens it", async () => {
    launched.length = 0;
    const pending = ops.openEntry(entry("invoice.pdf"));
    await sleep(400);
    expect(dialog().textContent).toContain("This file isn't what its name says");
    expect(dialog().textContent).toContain("really a Windows program");
    expect(dialogButton("Open anyway").classList.contains("danger")).toBe(true);
    dialogButton("Don't open").click();
    await pending;
    expect(launched).toEqual([]);

    const again = ops.openEntry(entry("invoice.pdf"));
    await sleep(400);
    dialogButton("Open anyway").click();
    await again;
    await sleep(100);
    expect(launched.length).toBe(1);
  });

  test("a notice or a clean file opens without any question", async () => {
    launched.length = 0;
    await ops.openEntry(entry("scan.jpg"), { viewer: false }); // the guard is about handing a file to the computer's program
    await ops.openEntry(entry("clean.png"), { viewer: false });
    expect(launched.length).toBe(2);
    expect(doc.querySelector(".modal-backdrop")).toBeNull();
  });

  test("a double extension asks about the name first, then the program question", async () => {
    launched.length = 0;
    const pending = ops.openEntry(entry("report.pdf.exe"));
    await sleep(400);
    expect(dialog().textContent).toContain("looks like a PDF file");
    dialogButton("Open anyway").click();
    await sleep(400);
    expect(dialog().textContent).toContain("is a program or installer");
    dialogButton("Don't open")?.click();
    dialogButton("Cancel")?.click();
    await pending;
    expect(launched).toEqual([]);
  });
});

describe("Details and Properties", () => {
  test("Details shows the verdict for the selected file, with the rename button when there is one", async () => {
    state.selection = new Set([join(files, "scan.jpg")]);
    await info.renderInfo();
    await sleep(300);
    const block = doc.querySelector("#info .type-block.notice");
    expect(block).not.toBeNull();
    expect(block.textContent).toContain("really a PNG picture");
    expect([...block.querySelectorAll("button")].map((b: any) => b.textContent)).toEqual(["Rename to .png"]);
    state.selection = new Set([join(files, "clean.png")]);
    await info.renderInfo();
    await sleep(300);
    expect(doc.querySelector("#info .type-block")).toBeNull();
    expect(doc.querySelector("#info").textContent).not.toContain("Matches its name");
  });

  test("Properties shows the same block with Show in Details, and a clean file shows none", async () => {
    await extras.showProperties([join(files, "invoice.pdf")]);
    await sleep(300);
    expect(dialog().querySelector(".type-block.danger").textContent).toContain("Windows program");
    expect(dialogButton("Show in Details")).toBeTruthy();
    await closeDialogs();
    await extras.showProperties([join(files, "clean.png")]);
    await sleep(300);
    expect(dialog().querySelector(".type-block")).toBeNull();
    await closeDialogs();
  });
});

describe("the setting", () => {
  test("it is in the Settings dialog with a tooltip, and saves", async () => {
    extras.showSettings();
    const label = [...dialog().querySelectorAll("label.check")].find((l: any) => l.textContent.includes("Warn when a file isn't what its name says"));
    expect(label).toBeTruthy();
    expect(label.title).toContain("badge");
    const box = label.querySelector("input");
    expect(box.checked).toBe(true);
    box.checked = false;
    box.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    await settle(500);
    expect((await serverSettings()).typeWarnings).toBe(false);
    await closeDialogs();
  });

  test("with it off there are no badges, no details, and opening sends the confirmation by itself", async () => {
    expect(state.settings.typeWarnings).toBe(false);
    expect(doc.querySelectorAll("#list .type-badge").length).toBe(0);
    launched.length = 0;
    await ops.openEntry(entry("invoice.pdf"));
    await sleep(100);
    expect(doc.querySelector(".modal-backdrop")).toBeNull();
    expect(launched.length).toBe(1);
    state.selection = new Set([join(files, "scan.jpg")]);
    await info.renderInfo();
    await sleep(300);
    expect(doc.querySelector("#info .type-block")).toBeNull();
  });

  test("turning it back on brings the badges back", async () => {
    await (await import("../resources/file_manager/ui/nav.js")).saveSettings({ typeWarnings: true });
    await settle(600);
    expect(badgeFor("invoice.pdf")).not.toBeNull();
    expect(events.state.settings.typeWarnings).toBe(true);
  });
});

describe("right after a file is created or renamed", () => {
  const toastText = () => doc.querySelector("#toasts").textContent;
  const clearToasts = () => doc.querySelectorAll("#toasts .toast").forEach((t: any) => t.remove());

  test("naming a new empty file New file.txt.png says at once that it has two endings and is empty, and Details explains", async () => {
    clearToasts();
    writeFileSync(join(files, "New file.txt"), "");
    await nav.refresh({ keepSelection: false });
    await ops.commitRename(join(files, "New file.txt"), "New file.txt.png");
    await settle(600);
    expect(toastText()).toContain("Its name ends in two file types");
    expect(toastText()).toContain('"New file.txt.png" has two file types in its name');
    const details = [...doc.querySelectorAll("#toasts button")].find((b: any) => b.textContent.trim() === "Details");
    details.click();
    await sleep(100);
    expect(dialog().querySelector(".dialog-title").textContent).toBe("Look at this file's name");
    expect(dialog().textContent).toMatch(/Only the last one, \.png, counts/);
    expect(dialog().textContent).toMatch(/also empty/);
    expect(dialogButton("Rename to .txt")).toBeTruthy();
    expect(dialog().textContent).not.toMatch(/\bnull\b|\bundefined\b/);
    await closeDialogs();
  });

  test("the list badge shows it too, and renaming to .txt takes the warning away", async () => {
    await nav.refresh({ keepSelection: false });
    await settle(700);
    expect(badgeFor("New file.txt.png")).not.toBeNull();
    clearToasts();
    await ops.commitRename(join(files, "New file.txt.png"), "New file.txt");
    await settle(500);
    expect(toastText()).not.toContain("two file types");
    expect(badgeFor("New file.txt")).toBeNull();
  });

  test("an empty .png alone says it is not a real picture yet; with the setting off nothing is said", async () => {
    clearToasts();
    writeFileSync(join(files, "draft"), "");
    await nav.refresh({ keepSelection: false });
    await ops.commitRename(join(files, "draft"), "draft.png");
    await settle(500);
    expect(toastText()).toContain("An empty file with a file type in its name");
    expect(toastText()).toContain("is empty, so it is not a real .png file yet");
    await (await import("../resources/file_manager/ui/nav.js")).saveSettings({ typeWarnings: false });
    clearToasts();
    await ops.commitRename(join(files, "draft.png"), "draft2.png");
    await settle(400);
    expect(toastText()).not.toContain("empty");
    await (await import("../resources/file_manager/ui/nav.js")).saveSettings({ typeWarnings: true });
    rmSync(join(files, "draft2.png"), { force: true });
    await nav.refresh({ keepSelection: false });
  });

  test("a plain text name and a real picture under its own name stay quiet", async () => {
    clearToasts();
    writeFileSync(join(files, "plain"), "words");
    await nav.refresh({ keepSelection: false });
    await ops.commitRename(join(files, "plain"), "plain.txt");
    await settle(400);
    expect(toastText()).not.toContain("file type");
    rmSync(join(files, "plain.txt"), { force: true });
    await nav.refresh({ keepSelection: false });
  });
});
