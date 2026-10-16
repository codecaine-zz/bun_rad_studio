import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-info-panel-"));
const home = join(root, "home");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let state: any;
let nav: any;
let info: any;
let api: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FILES = ["notes.txt", "report.pdf", "picture.png", "archive.zip", "song.mp3", "program.v", "data.bin"];

async function select(...names: string[]) {
  state.selection = new Set(names.map((n) => join(home, n)));
  await info.renderInfo();
  await sleep(60);
}

beforeAll(async () => {
  mkdirSync(join(home, "Folder"), { recursive: true });
  for (const f of FILES) writeFileSync(join(home, f), f === "notes.txt" || f === "program.v" ? "text\n" : Buffer.from([0, 1, 2, 3]));
  // The terminal needs a library the page loads from /vendor/, which a plain import can't reach.
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data") } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  api = await import("../resources/file_manager/ui/api.js");
  nav = await import("../resources/file_manager/ui/nav.js");
  info = await import("../resources/file_manager/ui/info.js");
  state.home = home;
  state.sep = "/";
  state.settings = { ...(await api.call("settings")).settings, showInfoPanel: true };
  await nav.goTo(home, { push: false });
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

describe("the Details panel never shows stray words", () => {
  test("every kind of single item, and several at once, leaves no 'null' or 'undefined' text", async () => {
    for (const name of ["Folder", ...FILES]) {
      await select(name);
      const text = doc.getElementById("info").textContent;
      expect(text, name).toContain(name);
      expect(text, name).not.toMatch(/\bnull\b|\bundefined\b|\[object/i);
      expect([...doc.querySelectorAll("#info button")].map((b: any) => b.textContent), name).toContain("Properties…");
    }
    await select("notes.txt", "report.pdf", "Folder");
    expect(doc.getElementById("info").textContent).not.toMatch(/\bnull\b|\bundefined\b/i);
    await select();
    expect(doc.getElementById("info").textContent).not.toMatch(/\bnull\b|\bundefined\b/i);
  });
});
