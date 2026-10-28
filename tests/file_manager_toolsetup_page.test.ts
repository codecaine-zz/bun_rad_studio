import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-toolsetup-ui-"));
const typed: string[] = [];
const servers: Array<ReturnType<typeof startFileManagerServer>> = [];
let base = "";
let doc: any;
let setup: any;
let tools: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => any, what: string, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${what}`);
};
const dialogs = () => [...doc.querySelectorAll(".modal-backdrop")];
const top = (): any => dialogs().at(-1);
const button = (text: string, from: any = doc): any => [...from.querySelectorAll("button")].find((b: any) => b.textContent.trim().startsWith(text));
const toastText = () => doc.querySelector("#toasts")?.textContent ?? "";
const closeAll = () => {
  for (const d of dialogs()) d.remove();
  doc.querySelectorAll("#toasts .toast").forEach((t: any) => t.remove());
};

/** A computer with stand-in programs, and a File Manager server that believes it is that computer. */
function computer(platform: "darwin" | "linux" | "win32", programs: string[]) {
  const dir = mkdtempSync(join(root, "c"));
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(dir, "home"), { recursive: true });
  for (const p of programs) {
    writeFileSync(join(bin, p), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, p), 0o755);
  }
  const server = startFileManagerServer({ port: 0, token: "ui-token", context: { platform, home: join(dir, "home"), dataDir: join(dir, "data"), toolDirs: [bin] } });
  servers.push(server);
  base = `http://127.0.0.1:${server.port}`;
  return { dir, server };
}

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => true,
    typeInTerminal: (text: string) => { typed.push(text); return true; },
    showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false,
  }));
  computer("linux", ["apt-get"]);
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  const state = (await import("../resources/file_manager/ui/state.js")).state;
  state.platform = "linux";
  state.location = { kind: "folder", path: root };
  state.entries = [];
  state.selection = new Set();
  setup = await import("../resources/file_manager/ui/toolsetup.js");
  tools = await import("../resources/file_manager/ui/tools.js");
});

afterAll(() => {
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

describe("one-click setup of the helper programs", () => {
  test("choosing: everything is ticked, the manager can be changed, Select none and Only the main ones work, and the count is on the button", async () => {
    closeAll();
    typed.length = 0;
    const closed: string[] = [];
    const started = setup.startSetup({ mode: "choose", startJob: (ids: string[]) => closed.push(`job:${ids}`), closeOuter: () => closed.push("closed") });
    await until(() => top()?.querySelector(".setup-list"), "the list");
    const d = top();
    expect(d.querySelector(".dialog-title").textContent).toBe("Install helper programs");
    const boxes = () => [...d.querySelectorAll(".setup-row input[type=checkbox]")];
    expect(boxes().length).toBe(16);
    expect(boxes().every((b: any) => b.checked)).toBe(true);
    expect([...d.querySelectorAll("input[type=radio]")].map((r: any) => r.value)).toEqual(["apt", "brew"]);
    expect(d.querySelector("input[type=radio]").checked).toBe(true);
    expect(d.textContent).toContain("Asks for your computer's password in the Terminal");
    expect(button("Install 16", d)).toBeTruthy();
    for (const b of d.querySelectorAll("button")) expect(b.title || b.textContent.trim(), b.outerHTML.slice(0, 80)).toBeTruthy();

    button("Select none", d).click();
    expect(boxes().some((b: any) => b.checked)).toBe(false);
    expect(button("Choose something to install", d).disabled).toBe(true);
    button("Only the main ones", d).click();
    expect(boxes().filter((b: any) => b.checked).length).toBe(4);
    expect(button("Install 4", d)).toBeTruthy();
    button("Select all", d).click();
    expect(button("Install 16", d)).toBeTruthy();

    // Homebrew has no package for LibreOffice on Linux: switching to it unticks and grays that one out
    const brewRadio = [...d.querySelectorAll("input[type=radio]")].find((r: any) => r.value === "brew");
    brewRadio.checked = true;
    brewRadio.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    const libre = boxes().find((b: any) => b.closest("label").textContent.includes("LibreOffice"));
    expect(libre.disabled).toBe(true);
    expect(libre.checked).toBe(false);
    expect(d.textContent).toContain("Homebrew isn't installed yet, so it is installed and set up first");
    const aptRadio = [...d.querySelectorAll("input[type=radio]")].find((r: any) => r.value === "apt");
    aptRadio.checked = true;
    aptRadio.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    expect(libre.disabled).toBe(false);
    expect(libre.checked).toBe(false); // it stays unticked until you tick it again

    // leave out pandoc and install the rest
    const pandoc = boxes().find((b: any) => b.closest("label").textContent.startsWith("pandoc"));
    pandoc.checked = false;
    pandoc.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    const expected = boxes().filter((b: any) => b.checked).length;
    expect(expected).toBe(13); // 16, minus LibreOffice and calibre (Mac applications with no Linux Homebrew package) and pandoc
    expect(button(`Install ${expected} programs`, d)).toBeTruthy();
    button(`Install ${expected} programs`, d).click();
    const plan = await started;
    expect(plan.manager).toBe("apt");
    expect(plan.tools.map((t: any) => t.id)).not.toContain("pandoc");
    expect(plan.tools.length).toBe(expected);
    expect(plan.tools.map((t: any) => t.id)).not.toContain("libreoffice");
    expect(plan.tools.map((t: any) => t.id)).not.toContain("calibre");
    expect(closed).toEqual(["closed"]);
    expect(typed.length).toBe(1);
    expect(typed[0]).toMatch(/^bash '.*install_helper_programs\.sh'\r$/);
    expect(toastText()).toContain("Type your computer's password there");
    expect(readFileSync(plan.path, "utf8")).not.toContain("'pandoc'");
    expect(readFileSync(plan.path, "utf8")).toContain("try 'ffmpeg' 'ffmpeg'");
  });

  test("Cancel installs nothing", async () => {
    closeAll();
    typed.length = 0;
    const started = setup.startSetup({ mode: "choose", startJob: () => { throw new Error("no job"); }, closeOuter: () => { throw new Error("not closed"); } });
    await until(() => top()?.querySelector(".setup-list"), "the list");
    button("Cancel", top()).click();
    expect(await started).toBeNull();
    expect(typed.length).toBe(0);
  });

  test("everything: one question that lists what is installed, sizes and the password note, then the Terminal runs it", async () => {
    closeAll();
    typed.length = 0;
    const started = setup.startSetup({ mode: "everything", startJob: () => { throw new Error("no job"); }, closeOuter: () => {} });
    await until(() => top()?.textContent.includes("Install everything that is missing?"), "the question");
    const text = top().textContent;
    expect(text).toContain("16 programs");
    expect(text).toContain("apt (the Debian and Ubuntu installer)");
    expect(text).toContain("password");
    expect(text).toContain("LibreOffice");
    button("Install all 16", top()).click();
    const plan = await started;
    expect(plan.tools.length).toBe(16);
    expect(typed.length).toBe(1);
    expect(toastText()).not.toMatch(/\bnull\b|\bundefined\b/);
  });

  test("Homebrew on a Mac that has it: no password, so it runs as a background task instead of in the Terminal", async () => {
    closeAll();
    typed.length = 0;
    computer("darwin", ["brew"]);
    const jobs: string[][] = [];
    const started = setup.startSetup({ mode: "everything", startJob: (ids: string[]) => { jobs.push(ids); return "job"; }, closeOuter: () => {} });
    await until(() => top()?.textContent.includes("Install everything that is missing?"), "the question");
    expect(top().textContent).toContain("No password needed");
    button("Install all", top()).click();
    expect(await started).toBe("job");
    expect(jobs.length).toBe(1);
    expect(jobs[0]!.length).toBe(16);
    expect(typed.length).toBe(0);
  });

  test("a Mac without Homebrew says it will install Homebrew first, and uses the Terminal", async () => {
    closeAll();
    typed.length = 0;
    computer("darwin", []);
    const started = setup.startSetup({ mode: "everything", startJob: () => { throw new Error("no job"); }, closeOuter: () => {} });
    await until(() => top()?.textContent.includes("Install everything that is missing?"), "the question");
    expect(top().textContent).toContain("Homebrew isn't installed yet, so it is installed and set up first");
    button("Install all", top()).click();
    const plan = await started;
    expect(plan.installsHomebrew).toBe(true);
    expect(readFileSync(plan.path, "utf8")).toContain("install.sh");
    expect(typed.length).toBe(1);
  });

  test("Windows: the background installers (winget or Scoop) are used, with the same list to choose from", async () => {
    closeAll();
    typed.length = 0;
    computer("win32", ["winget.exe"]);
    const jobs: string[][] = [];
    const started = setup.startSetup({ mode: "choose", startJob: (ids: string[]) => { jobs.push(ids); return "job"; }, closeOuter: () => {} });
    await until(() => top()?.querySelector(".setup-list"), "the list");
    expect(top().querySelectorAll("input[type=radio]").length).toBe(0);
    expect(top().textContent).toContain("winget or Scoop");
    const unavailable = [...top().querySelectorAll(".setup-row input")].filter((b: any) => b.disabled);
    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable.every((b: any) => !b.checked)).toBe(true);
    button("Select none", top()).click();
    const first = top().querySelector(".setup-row input[type=checkbox]");
    first.checked = true;
    first.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    button("Install 1", top()).click();
    expect(await started).toBe("job");
    expect(jobs[0]!.length).toBe(1);
    expect(typed.length).toBe(0);
  });

  test("Windows Install all excludes manual-only helpers and leaves the outer dialog open until the job starts", async () => {
    closeAll();
    computer("win32", ["winget.exe"]);
    const jobs: string[][] = [];
    let closed = false;
    const started = setup.startSetup({ mode: "everything", startJob: (ids: string[]) => { jobs.push(ids); return "job"; }, closeOuter: () => { closed = true; } });
    await until(() => top()?.textContent.includes("Install everything that is missing?"), "the question");
    expect(top().textContent).toContain("Install manually");
    button("Install all", top()).click();
    expect(await started).toBe("job");
    expect(jobs[0]).toContain("ffmpeg");
    expect(jobs[0]).not.toContain("fonttools");
    expect(jobs[0]).not.toContain("woff2");
    expect(jobs[0]).not.toContain("unar");
    expect(closed).toBe(false);
  });

  test("Windows Install all keeps installation startup errors visible in Helper programs", async () => {
    closeAll();
    computer("win32", ["winget.exe"]);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (typeof input === "string" && input.includes("/api/tools/install")) {
        return new Response(JSON.stringify({ error: { code: "MANUAL_INSTALL", message: "Installer could not start (test)." } }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      await tools.showToolsDialog();
      await until(() => button("Install everything missing"), "the helper programs");
      const outer = top();
      button("Install everything missing", outer).click();
      await until(() => top() !== outer && button("Install all", top()), "the question");
      button("Install all", top()).click();
      await until(() => outer.textContent.includes("Installer could not start (test)."), "the installation error");
      expect(outer.isConnected).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
      closeAll();
    }
  });

  test("the helper programs window shows the one-click section with both buttons, and nothing says null", async () => {
    closeAll();
    computer("linux", ["apt-get"]);
    tools.showToolsDialog();
    await until(() => top()?.querySelector(".tools-box"), "the window");
    const box = top().querySelector(".tools-box");
    await until(() => box.querySelector(".tool-setup") || button("Helper programs", box), "the list");
    (button("Helper programs", box) as any)?.click();
    await until(() => box.querySelector(".tool-setup"), "the one-click section");
    const section = box.querySelector(".tool-setup");
    expect(section.textContent).toContain("One-click setup");
    expect(section.textContent).toMatch(/\d+ helper programs are missing/);
    expect(button("Install everything missing (", section)).toBeTruthy();
    expect(button("Choose what to install…", section)).toBeTruthy();
    expect(box.textContent).not.toMatch(/\bnull\b|\bundefined\b/);
    closeAll();
  });
});
