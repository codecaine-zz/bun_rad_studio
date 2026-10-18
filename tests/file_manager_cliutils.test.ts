import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { cliUtilsDir, ensureCliUtilsFolder, listCliUtils, terminalEnv } from "../src/features/filemanager/fmCliUtils";
import { createContext } from "../src/features/filemanager/fmCore";
import { listFolder } from "../src/features/filemanager/fmList";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const posix = process.platform !== "win32";
const root = mkdtempSync(join(tmpdir(), "fm-cliutils-"));
const home = join(root, "home");
const work = join(root, "work");
const dataDir = join(root, "data");
const TOKEN = "ui-token";
let server: ReturnType<typeof startFileManagerServer>;
let base: string;

beforeAll(() => {
  mkdirSync(home, { recursive: true });
  mkdirSync(work, { recursive: true });
  server = startFileManagerServer({
    port: 0,
    host: "127.0.0.1",
    token: TOKEN,
    context: { home, dataDir, launch: async () => {} },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

async function api(op: string, body: unknown = {}) {
  const res = await fetch(`${base}/api/${op}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-fm-token": TOKEN },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as any };
}

describe("built-in RAD Studio CLI utilities folder and wrappers", () => {
  test("provisions executable wrappers for all cli_apps/*.ts in cli_utils", async () => {
    const ctx = createContext({ home, dataDir });
    const dir = ensureCliUtilsFolder(ctx);
    expect(dir).toBe(cliUtilsDir(ctx));
    expect(existsSync(dir)).toBe(true);

    const catalog = listCliUtils(ctx);
    expect(catalog.count).toBeGreaterThanOrEqual(70);
    expect(catalog.folder).toBe(dir);
    expect(catalog.sourceFolder).toContain("cli_apps");

    const calc = catalog.tools.find((t) => t.id === "calc");
    expect(calc).toBeDefined();
    expect(calc!.stem).toBe("calc_cli");
    expect(calc!.command).toBe(process.platform === "win32" ? ".\\calc" : "./calc");
    expect(calc!.stemCommand).toBe(process.platform === "win32" ? ".\\calc_cli" : "./calc_cli");
    expect(existsSync(calc!.wrapperPath)).toBe(true);
    expect(existsSync(calc!.stemWrapperPath)).toBe(true);

    if (posix) {
      expect(statSync(calc!.wrapperPath).mode & 0o111).toBeGreaterThan(0);
      expect(statSync(calc!.stemWrapperPath).mode & 0o111).toBeGreaterThan(0);
      expect(statSync(calc!.scriptPath).mode & 0o111).toBeGreaterThan(0);
    }

    const listed = await listFolder(ctx, dir);
    const names = listed.entries.map((e) => e.name);
    expect(names).toContain("calc");
    expect(names).toContain("calc_cli");
    expect(names).toContain("rad");
    expect(names).toContain("rad_cli");
    expect(names).toContain("api_stress_bench");
    if (posix) {
      const calcEntry = listed.entries.find((e) => e.name === "calc")!;
      expect(calcEntry.program).toBe(true);
    }
  });

  (posix ? test : test.skip)("running ./<name> and ./<stem> inside cli_utils executes the RAD Studio CLI utility", () => {
    const ctx = createContext({ home, dataDir });
    const dir = ensureCliUtilsFolder(ctx);

    const runShort = Bun.spawnSync(["./calc", "--help"], { cwd: dir, env: terminalEnv(ctx), stdout: "pipe", stderr: "pipe" });
    expect(runShort.exitCode).toBe(0);
    expect(runShort.stdout.toString()).toContain("Programmer Calculator");

    const runStem = Bun.spawnSync(["./calc_cli", "0xFF"], { cwd: dir, env: terminalEnv(ctx), stdout: "pipe", stderr: "pipe" });
    expect(runStem.exitCode).toBe(0);
    expect(runStem.stdout.toString()).toContain("0xFF");

    const runStandalone = Bun.spawnSync(["./api_stress_bench", "--help"], { cwd: dir, env: terminalEnv(ctx), stdout: "pipe", stderr: "pipe" });
    expect(runStandalone.exitCode).toBe(0);
    expect(runStandalone.stdout.toString()).toContain("Stress");
  });

  (posix ? test : test.skip)("terminalEnv adds cli_utils to PATH without shadowing system commands", () => {
    const ctx = createContext({ home, dataDir });
    const env = terminalEnv(ctx);
    expect(env.RAD_CLI_UTILS_DIR).toBe(cliUtilsDir(ctx));
    expect(env.PATH.split(":")).toContain(cliUtilsDir(ctx));

    // System `tr` still works as standard POSIX `tr` when called without `./`
    const sysTr = Bun.spawnSync(["sh", "-c", "printf 'a b' | tr ' ' x"], { cwd: work, env, stdout: "pipe", stderr: "pipe" });
    expect(sysTr.exitCode).toBe(0);
    expect(sysTr.stdout.toString()).toBe("axb");

    // RAD Studio CLI utilities are runnable by name from any folder via PATH
    const pathCalc = Bun.spawnSync(["sh", "-c", "calc_cli --help"], { cwd: work, env, stdout: "pipe", stderr: "pipe" });
    expect(pathCalc.exitCode).toBe(0);
    expect(pathCalc.stdout.toString()).toContain("Programmer Calculator");
  });

  test("places, cliutils/list and cliutils/ensure API endpoints return the CLI utilities folder and catalog", async () => {
    const places = await api("places");
    expect(places.status).toBe(200);
    expect(places.json.cliUtilsDir).toBe(join(dataDir, "cli_utils"));
    expect(places.json.cliAppsDir).toContain("cli_apps");

    const list = await api("cliutils/list");
    expect(list.status).toBe(200);
    expect(list.json.folder).toBe(join(dataDir, "cli_utils"));
    expect(list.json.count).toBeGreaterThanOrEqual(70);
    expect(list.json.tools.some((t: any) => t.id === "rad" && t.stem === "rad_cli")).toBe(true);

    const ensured = await api("cliutils/ensure", { force: true });
    expect(ensured.status).toBe(200);
    expect(ensured.json.count).toBe(list.json.count);
  });

  (posix ? test : test.skip)("built-in Terminal WebSocket runs ./<filename> directly inside cli_utils", async () => {
    const cliDir = join(dataDir, "cli_utils");
    const q = new URLSearchParams({ token: TOKEN, path: cliDir, cols: "100", rows: "24" }).toString();
    const ws = new (WebSocket as any)(`ws://127.0.0.1:${server.port}/api/terminal?${q}`, { headers: { Origin: base } }) as WebSocket;
    let output = "";
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.type === "output") output += m.data;
    };
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket failed"));
    });
    try {
      ws.send(JSON.stringify({ type: "input", data: "./calc --help\r" }));
      const end = Date.now() + 8000;
      while (!/Programmer Calculator/.test(output) && Date.now() < end) {
        await Bun.sleep(25);
      }
      expect(output).toContain("Programmer Calculator");
    } finally {
      ws.close();
    }
  });
});

describe("File Manager UI integration for CLI utilities", () => {
  const GLOBALS = [
    "document", "window", "Node", "Element", "Event", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "navigator", "location", "fetch",
    "requestAnimationFrame", "cancelAnimationFrame", "ResizeObserver", "MutationObserver", "getComputedStyle", "InputEvent", "KeyboardEvent", "MouseEvent", "CSS", "WebSocket",
  ] as const;

  test("Sidebar Places, CLI Utilities Power tab, terminal bar button, and opening a CLI utility auto-types ./<filename>", async () => {
    const { JSDOM } = await import("jsdom");
    const { readFileSync } = await import("fs");
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8")
      .replace(/__FM_TOKEN__/g, TOKEN)
      .replace(/__FM_PLATFORM__/g, process.platform)
      .replace(/__FM_START__/g, "")
      .replace(/__FM_NONCE__/g, "n");
    const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
    const win = dom.window as any;
    const g = globalThis as any;
    for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
    for (const k of GLOBALS.filter((x) => x !== "fetch" && x !== "ResizeObserver" && x !== "WebSocket" && x !== "CSS")) {
      const value = win[k];
      Object.defineProperty(g, k, { value: typeof value === "function" && !/^[A-Z]/.test(k) ? value.bind(win) : value, configurable: true, writable: true });
    }
    Object.defineProperty(g, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
    Object.defineProperty(g, "WebSocket", { value: class {}, configurable: true, writable: true });
    Object.defineProperty(g, "CSS", { value: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") }, configurable: true, writable: true });
    const realFetch = saved.get("fetch")!.value as typeof fetch;
    Object.defineProperty(g, "fetch", {
      value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o),
      configurable: true,
      writable: true,
    });
    win.Element.prototype.scrollIntoView = () => {};
    Object.defineProperty(win.HTMLElement.prototype, "offsetParent", { get() { return win.document.body; }, configurable: true });
    const doc = win.document as Document;

    const terminalRuns: Array<{ folder: string; command: string; submit: boolean }> = [];
    let unsubRun: (() => void) | null = null;
    try {
      const { mock } = await import("bun:test");
      mock.module("../resources/file_manager/ui/terminal.js", () => ({
        terminalShell: () => "posix",
        terminalWsl: () => ({}),
        terminalAvailable: () => true,
        typeInTerminal: () => true,
        runInTerminal: (folder: string, command: string, submit = true) => {
          terminalRuns.push({ folder, command, submit });
        },
        showTerminal() {},
        hideTerminal() {},
        toggleTerminal() {},
        wireTerminal() {},
        isTerminalOpen: () => false,
      }));
      (await import("../resources/file_manager/ui/menus.js")).closeMenu();
      (await import("../resources/file_manager/ui/power.js")).resetPower();
      const stateMod = await import("../resources/file_manager/ui/state.js");
      Object.assign(stateMod.state, {
        platform: process.platform,
        sep: process.platform === "win32" ? "\\" : "/",
        home,
        workspace: "files",
        powerOpen: false,
        search: null,
        loading: false,
        busy: 0,
        terminalOpen: false,
      });
      stateMod.state.selection.clear();
      unsubRun = stateMod.on("terminal-run-in", (payload: any) => terminalRuns.push(payload));

      await import("../resources/file_manager/ui/cliUtils.js");
      const navMod = await import("../resources/file_manager/ui/nav.js");
      const sidebarMod = await import("../resources/file_manager/ui/sidebar.js");
      const powerMod = await import("../resources/file_manager/ui/power.js");
      await navMod.loadPlaces();
      sidebarMod.renderSidebar();
      powerMod.wirePower();

      // 1. Sidebar has "CLI Utilities" under Places
      const sideButtons = [...doc.querySelectorAll("#sidebar .side-item")];
      const cliSideBtn = sideButtons.find((b) => b.textContent?.includes("CLI Utilities")) as HTMLButtonElement | undefined;
      expect(cliSideBtn).toBeDefined();

      // 2. Clicking "CLI Utilities" in the Sidebar navigates to cli_utils and lists executable wrappers
      cliSideBtn!.click();
      const cliDir = join(dataDir, "cli_utils");
      for (let i = 0; i < 100 && stateMod.state.location.path !== cliDir; i++) await Bun.sleep(30);
      expect(stateMod.state.location.path).toBe(cliDir);
      expect(stateMod.state.entries.some((e: any) => e.name === "calc")).toBe(true);

      // 3. Opening an entry inside cli_utils auto-types ./<filename> in the built-in Terminal
      const opsMod = await import("../resources/file_manager/ui/ops.js");
      const calcEntry = stateMod.state.entries.find((e: any) => e.name === "calc");
      expect(calcEntry).toBeDefined();
      await opsMod.openEntry(calcEntry);
      expect(terminalRuns.at(-1)).toEqual({
        folder: cliDir,
        command: `${process.platform === "win32" ? ".\\" : "./"}calc `,
        submit: false,
      });

      // 4. Right-clicking a CLI utility offers Put ./calc in Terminal and Run ./calc in Terminal
      const ctxMenuMod = await import("../resources/file_manager/ui/contextmenu.js");
      ctxMenuMod.showEntryMenu([calcEntry], { x: 10, y: 10 });
      const menuLabels = [...doc.querySelectorAll(".menu [role^=menuitem]")].map((el) => el.textContent ?? "");
      const prefix = process.platform === "win32" ? ".\\" : "./";
      expect(menuLabels.some((l) => l.includes(`Put ${prefix}calc in Terminal`))).toBe(true);
      expect(menuLabels.some((l) => l.includes(`Run ${prefix}calc in Terminal`))).toBe(true);
      (await import("../resources/file_manager/ui/menus.js")).closeMenu();

      // 5. Opening the CLI Utilities Power tab loads the catalog and runs ./<name>
      powerMod.openPower("cliutils");
      for (let i = 0; i < 100 && !doc.querySelector(".cliutil-card"); i++) await Bun.sleep(30);
      const calcCard = doc.querySelector('.cliutil-card[data-tool-id="calc"]') as HTMLElement | null;
      expect(calcCard).not.toBeNull();
      const runBtn = [...calcCard!.querySelectorAll("button")].find((b) => b.textContent?.includes("▶ Run")) as HTMLButtonElement | undefined;
      expect(runBtn).toBeDefined();
      runBtn!.click();
      expect(terminalRuns.at(-1)).toEqual({
        folder: cliDir,
        command: `${prefix}calc`,
        submit: true,
      });
    } finally {
      unsubRun?.();
      (await import("../resources/file_manager/ui/menus.js")).closeMenu();
      (await import("../resources/file_manager/ui/power.js")).resetPower();
      for (const k of GLOBALS) {
        const before = saved.get(k);
        if (before) Object.defineProperty(g, k, before);
        else delete g[k];
      }
    }
  });
});

