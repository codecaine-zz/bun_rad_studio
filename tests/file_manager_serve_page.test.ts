import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-serve-ui-"));
const home = join(root, "home");
const site = join(home, "site");
const phpsite = join(home, "phpsite");
const plain = join(home, "plain");
const HAS_PHP = !!Bun.which("php");
const launched: string[][] = [];
let server: ReturnType<typeof startFileManagerServer>;
let dom: JSDOM;
let doc: any;
let state: any;
let api: any;
let power: any;
let store: any;
let actions: any;
let menus: any;
let contextmenu: any;
let homeTiles: any;
let homeMod: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const $ = (selector: string, from: any = doc): any => from.querySelector(selector);
const $$ = (selector: string, from: any = doc): any[] => [...from.querySelectorAll(selector)];
const pane = () => $("#power-pane-serve");
const button = (text: string, from: any = doc): any => $$("button", from).find((b) => b.textContent.trim() === text);
const labeled = (label: string, from: any = doc): any => $(`[aria-label="${label}"]`, from);
const rows = () => $$(".serve-row", pane());
const click = (el: any) => el.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
const change = (el: any, value?: string) => {
  if (value !== undefined) el.value = value;
  el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
};
async function until<T>(fn: () => T | Promise<T>, what: string, ms = 8000): Promise<NonNullable<T>> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(30);
  }
}
const noStrayWords = (el: any, where: string) => expect(el.textContent, where).not.toMatch(/\bnull\b|\bundefined\b|\[object|NaN/);
const menuLabels = () => $$(".menu .menu-label").map((e) => e.textContent);
const entry = (path: string, isDir: boolean) => ({ path, name: path.split("/").pop(), isDir });
const portIsFree = async (port: number) => {
  try {
    const s = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("") });
    await s.stop(true);
    return true;
  } catch {
    return false;
  }
};

async function openTool(path = site) {
  state.location = { kind: "folder", path };
  power.openPower("serve");
  await until(() => $(".serve-quick-folder", pane())?.textContent === path, "the folder in the quick switches");
}

async function stopEverything() {
  await api.call("serve/stopAll");
  await store.refreshServers();
}

beforeAll(async () => {
  for (const d of [site, phpsite, plain]) mkdirSync(d, { recursive: true });
  writeFileSync(join(site, "index.html"), "<html><body><h1>Hello from the live server</h1></body></html>");
  writeFileSync(join(site, "page.html"), "<body>a page</body>");
  writeFileSync(join(site, "a.css"), "h1{}");
  writeFileSync(join(site, "notes.txt"), "notes");
  writeFileSync(join(phpsite, "index.php"), "<?php echo 'php ' . (1+1);");
  writeFileSync(join(phpsite, "composer.json"), "{}");
  writeFileSync(join(plain, "readme.txt"), "x");
  // The terminal needs a library the page loads from /vendor/, which a plain import can't reach.
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data"), launch: async (c, a) => { launched.push([c, ...a]); } } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  api = await import("../resources/file_manager/ui/api.js");
  power = await import("../resources/file_manager/ui/power.js");
  await import("../resources/file_manager/ui/serve.js");
  store = await import("../resources/file_manager/ui/serveStore.js");
  actions = await import("../resources/file_manager/ui/serveActions.js");
  menus = await import("../resources/file_manager/ui/menus.js");
  contextmenu = await import("../resources/file_manager/ui/contextmenu.js");
  homeMod = await import("../resources/file_manager/ui/home.js");
  homeTiles = await import("../resources/file_manager/ui/homeTiles.js");
  state.home = home;
  state.sep = "/";
  state.settings = { ...(await api.call("settings")).settings };
  state.location = { kind: "folder", path: site };
  power.wirePower();
});

afterEach(async () => {
  menus.closeMenu();
  for (const el of $$(".modal-backdrop")) el.remove();
  await stopEverything();
});

afterAll(async () => {
  store.resetServeStore();
  await stopEverything();
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

describe("the Serve tab", () => {
  test("is a tab of the tools panel, with a Home tile named Live server", async () => {
    const tab = power.listPowerTabs().find((t: any) => t.id === "serve");
    expect(tab).toMatchObject({ label: "Serve", group: "automate" });
    expect(tab.tip.length).toBeGreaterThan(10);
    expect(power.listPowerTabs().find((t: any) => t.id === "serve").groupLabel).toBe("Automate");
    homeTiles.registerHomeTiles();
    const tile = homeMod.listHomeTiles().find((t: any) => t.id === "tool-serve");
    expect(tile.title).toBe("Live server");
    expect(tile.text).toContain("Serve");
    expect(tile.text.length).toBeGreaterThan(20);
    power.openPower("serve");
    const tabButton = $("#power-tab-serve");
    expect(tabButton.textContent).toContain("Serve");
    expect(tabButton.title).toBeTruthy();
    expect(tabButton.getAttribute("aria-selected")).toBe("true");
  });

  test("shows the quick switches, an empty list and the form, with every control named and no stray words", async () => {
    await openTool(site);
    await until(() => button("Start server"), "the form");
    expect($("h3", pane()).textContent).toContain("The folder you are looking at");
    expect(pane().textContent).toContain("No server is running");
    expect(pane().textContent).toContain("Running servers (0 of 8)");
    const switches = $$("[role=switch]", pane());
    expect(switches).toHaveLength(2);
    for (const sw of switches) {
      expect(sw.tagName).toBe("BUTTON");
      expect(sw.getAttribute("aria-checked")).toBe("false");
      expect(sw.getAttribute("aria-label")).toBeTruthy();
      expect(sw.title.length).toBeGreaterThan(8);
      expect(sw.textContent).toContain("Off");
    }
    for (const el of $$("button, input, select", pane())) {
      const named = (el.textContent ?? "").trim() || el.getAttribute("aria-label") || (el.closest("label")?.textContent ?? "").trim();
      expect(named, el.outerHTML).toBeTruthy();
      expect(el.title || el.getAttribute("aria-label") || (el.closest("label")?.title ?? ""), el.outerHTML).toBeTruthy();
    }
    noStrayWords(pane(), "the Serve tab");
    // The kinds, port and options are there.
    expect($$("select option", pane()).map((o) => o.value)).toEqual(["auto", "static", "php"]);
    expect(labeled("Port number").placeholder).toBe("Auto");
    expect(pane().textContent).toContain("Reload the page when files change");
    expect(pane().textContent).toContain("Open my browser when it starts");
    expect(pane().textContent).toContain("Show hidden files");
    expect(pane().textContent).toContain("Let other websites read these files (CORS)");
    // The network option is off, and its warning appears in plain words only when it is ticked.
    const lan = $$("input[type=checkbox]", pane()).find((i) => i.closest("label").textContent.includes("(LAN)"));
    expect(lan.checked).toBe(false);
    expect(lan.closest("label").textContent).toBe("Let other devices on my network see it (LAN)");
    const warning = $(".serve-lan-warning", pane());
    expect(warning.hidden).toBe(true);
    lan.checked = true;
    lan.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toMatch(/Anyone on the same Wi-Fi or network/);
    expect(warning.textContent).toMatch(/Only use this on a network you trust/);
    expect(warning.textContent).toMatch(/not safe on a network/);
    lan.checked = false;
    lan.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(warning.hidden).toBe(true);
    // PHP status line says what was found.
    await until(() => $(".serve-php-info", pane())?.textContent, "the PHP status");
    expect($(".serve-php-info", pane()).textContent).toMatch(HAS_PHP ? /PHP found: PHP \d/ : /PHP isn't installed/);
  });

  test("the live switch starts a server for the folder, shows it, and turns it off again", async () => {
    await openTool(site);
    const liveSwitch = $$("[role=switch]", pane())[0];
    await until(() => !liveSwitch.disabled, "the switch to be usable");
    click(liveSwitch);
    const row = await until(() => rows()[0], "the server row");
    await until(() => liveSwitch.getAttribute("aria-checked") === "true", "the switch to turn on");
    expect(liveSwitch.textContent).toContain("On");
    expect(rows()).toHaveLength(1);
    expect(launched.at(-1)!.join(" ")).toMatch(/http:\/\/127\.0\.0\.1:\d+\//);
    const url = $(".serve-link", row).textContent;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(row.textContent).toContain("Live server with live reload");
    expect(row.textContent).toContain("running");
    expect(row.textContent).toMatch(/Port \d+/);
    expect(row.textContent).toContain(site);
    expect(row.textContent).toMatch(/Started /);
    expect(row.textContent).toMatch(/\d+ requests?/);
    expect($("[role=switch]", row).getAttribute("aria-checked")).toBe("true");
    expect($(".serve-badge", row).hidden).toBe(true);
    expect($(".serve-lan-note", row).hidden).toBe(true);
    expect(pane().textContent).toContain("Running servers (1 of 8)");
    noStrayWords(pane(), "the running list");
    // The real server answers.
    const page = await (await realFetch(url)).text();
    expect(page).toContain("Hello from the live server");
    expect(page).toContain("/__live__/client.js");
    // The status-bar pill says so in words, and opens the tool.
    const pill = $(".serve-pill");
    expect(pill.textContent).toMatch(/^● Live :\d+$/);
    expect(pill.title).toContain("Click to open the Serve tool");
    expect(pill.getAttribute("aria-label")).toBeTruthy();
    expect($("#status-right").firstElementChild).toBe(pill);
    // Counting requests shows up in the row.
    await until(() => /[1-9]\d* requests?/.test(rows()[0].textContent), "the request count to update", 7000);
    // Turn it off with the same switch.
    click(liveSwitch);
    await until(() => rows().length === 0, "the row to go away");
    expect(liveSwitch.getAttribute("aria-checked")).toBe("false");
    expect($(".serve-pill")).toBeNull();
    expect(pane().textContent).toContain("No server is running");
    await expect(realFetch(url)).rejects.toBeDefined();
    const port = Number(new URL(url).port);
    expect(await portIsFree(port)).toBe(true);
  });

  test("the row's buttons open, copy, restart, show a log and stop", async () => {
    await openTool(site);
    click($$("[role=switch]", pane())[0]);
    const row = await until(() => rows()[0], "the server row");
    const url = $(".serve-link", row).textContent;
    const before = launched.length;
    click(button("Open in browser", row));
    await until(() => launched.length > before, "the browser to be asked to open");
    expect(launched.at(-1)!.join(" ")).toContain(url);
    // Copy URL goes through the server's clipboard helper; either way a message is shown.
    const toasts = () => $$("#toasts .toast").map((t) => t.textContent).join("|");
    click(button("Copy URL", row));
    await until(() => /Address copied|couldn't be copied/.test(toasts()), "a copy message");
    // The log.
    await realFetch(`${url}missing-page`);
    click(button("Show log", row));
    const log = $(".serve-log-text", row);
    expect($(".serve-log", row).hidden).toBe(false);
    expect(button("Hide log", row).getAttribute("aria-expanded")).toBe("true");
    await until(() => /GET \/missing-page 404/.test(log.textContent), "the log lines");
    expect(log.getAttribute("role")).toBe("log");
    expect(log.tabIndex).toBe(0);
    noStrayWords(log, "the log");
    click(button("Hide log", row));
    expect($(".serve-log", row).hidden).toBe(true);
    // Restart keeps the same port and folder.
    const port = new URL(url).port;
    click(button("Restart", row));
    await until(() => rows()[0] && rows()[0].dataset.id !== row.dataset.id, "a new server row");
    expect($(".serve-link", rows()[0]).textContent).toBe(`http://127.0.0.1:${port}/`);
    // Stop.
    click(button("Stop", rows()[0]));
    await until(() => rows().length === 0, "the row to go away");
  });

  test("the form starts a server for any folder, remembers choices but never the network option", async () => {
    await openTool(plain);
    const folder = labeled("Folder to serve");
    folder.value = site;
    change(folder);
    await until(() => /live server/.test($(".serve-detect", pane()).textContent), "the folder to be described");
    expect($(".serve-detect", pane()).textContent).toContain("This folder has web pages (HTML)");
    const kind = labeled("Kind of server");
    kind.value = "static";
    const open = $$("input[type=checkbox]", pane()).find((i) => i.closest("label").textContent.includes("Open my browser"));
    open.checked = false;
    const before = launched.length;
    const port = labeled("Port number");
    port.value = "abc";
    click(button("Start server"));
    await until(() => /port must be a whole number/.test($(".serve-message", pane()).textContent), "the port message");
    expect($(".serve-message", pane()).classList.contains("pw-bad")).toBe(true);
    expect(rows()).toHaveLength(0);
    port.value = "";
    click(button("Start server"));
    const row = await until(() => rows()[0], "the server row");
    expect($(".serve-message", pane()).textContent).toMatch(/^Running at http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(launched.length).toBe(before);
    expect(row.textContent).toContain(site);
    // Settings remember kind, reload and open-browser choices, and nothing about the network.
    await until(async () => (await api.call("settings")).settings.serveOptions.openBrowser === false, "the settings to be saved").catch(() => null);
    const saved = (await api.call("settings")).settings;
    expect(saved.serveOptions).toEqual({ kind: "static", liveReload: true, openBrowser: false });
    expect(JSON.stringify(saved.serveOptions)).not.toMatch(/lan/i);
    // Starting the same folder again reports the running server instead of making another.
    click(button("Start server"));
    await until(() => $$("#toasts .toast").some((t) => /already running/.test(t.textContent)), "the already-running message");
    expect(rows()).toHaveLength(1);
  });

  test("the network option asks first, says why, and marks the server clearly", async () => {
    await openTool(plain);
    const folder = labeled("Folder to serve");
    folder.value = site;
    change(folder);
    const lan = $$("input[type=checkbox]", pane()).find((i) => i.closest("label").textContent.includes("(LAN)"));
    lan.checked = true;
    lan.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const open = $$("input[type=checkbox]", pane()).find((i) => i.closest("label").textContent.includes("Open my browser"));
    open.checked = false;
    click(button("Start server"));
    const dialog = await until(() => $(".modal-backdrop"), "the confirmation");
    expect(dialog.textContent).toMatch(/Anyone on the same Wi-Fi or network can open this server/);
    expect(dialog.textContent).toContain("Only do this on a network you trust");
    // Saying no starts nothing, and the box is unticked again so it can't be forgotten.
    click(button("Cancel", dialog));
    await sleep(150);
    expect(rows()).toHaveLength(0);
    expect(lan.checked).toBe(false);
    expect($(".serve-lan-warning", pane()).hidden).toBe(true);
    lan.checked = true;
    lan.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    click(button("Start server"));
    const again = await until(() => $(".modal-backdrop"), "the confirmation again");
    click(button("Start for my network", again));
    const row = await until(() => rows()[0], "the server row");
    expect(lan.checked).toBe(false);
    expect($(".serve-badge", row).hidden).toBe(false);
    expect($(".serve-badge", row).textContent).toBe("Network");
    expect($(".serve-lan-note", row).hidden).toBe(false);
    expect($(".serve-lan-note", row).textContent).toMatch(/Anyone on your network can read these files/);
    expect($(".serve-pill").textContent).toMatch(/^● Live :\d+$/);
    noStrayWords(row, "the network row");
    // It is not remembered.
    const saved = (await api.call("settings")).settings;
    expect(JSON.stringify(saved)).not.toMatch(/"lan"|0\.0\.0\.0/);
    // The warning is gone again for the next server: the box is not remembered as ticked after a reload of the page's choices.
    expect(state.settings.serveOptions).not.toHaveProperty("lan");
  });

  test("errors from the server are shown in plain words, never as null or undefined", async () => {
    await openTool(plain);
    const folder = labeled("Folder to serve");
    folder.value = "";
    click(button("Start server"));
    expect($(".serve-message", pane()).textContent).toBe("Choose the folder to serve first.");
    folder.value = join(root, "nowhere");
    click(button("Start server"));
    await until(() => /doesn't exist/.test($(".serve-message", pane()).textContent), "a missing folder message");
    folder.value = home;
    click(button("Start server"));
    await until(() => /too broad or belongs to the system/.test($(".serve-message", pane()).textContent), "the too-broad message");
    noStrayWords(pane(), "the form after errors");
  });
});

describe("the PHP server from the page", () => {
  test.skipIf(!HAS_PHP)("the PHP switch starts PHP for the folder, shows its version, log and stop", async () => {
    await openTool(phpsite);
    await until(() => /This folder has PHP files/.test($(".serve-quick", pane()).textContent) && !$$("[role=switch]", pane())[1].disabled, "the PHP switch to be usable");
    expect($(".serve-quick", pane()).textContent).toContain("This folder has PHP files");
    click($$("[role=switch]", pane())[1]);
    const row = await until(() => rows()[0], "the PHP row");
    expect(row.textContent).toMatch(/PHP server \(PHP \d+\.\d+\.\d+\S* \(cli\)\)/);
    const url = $(".serve-link", row).textContent;
    expect(Number(new URL(url).port)).toBeGreaterThanOrEqual(8000);
    expect(await (await realFetch(url)).text()).toBe("php 2");
    expect($(".serve-pill").textContent).toMatch(/^● PHP :\d+$/);
    click(button("Show log", row));
    await until(() => /Development Server/.test($(".serve-log-text", row).textContent), "PHP's start message in the log", 7000);
    noStrayWords(row, "the PHP row");
    click(button("Stop", row));
    await until(() => rows().length === 0, "the row to go away", 10_000);
    await expect(realFetch(url)).rejects.toBeDefined();
  });

  test.skipIf(HAS_PHP)("without PHP the PHP switch is off and says why", async () => {
    await openTool(phpsite);
    await until(() => $$("[role=switch]", pane())[1].title.includes("PHP isn't installed"), "the reason");
    expect($$("[role=switch]", pane())[1].disabled).toBe(true);
  });
});

describe("the right-click menu", () => {
  const show = async (entries: any[]) => {
    contextmenu.showEntryMenu(entries, { x: 5, y: 5 });
    return menuLabels();
  };
  const primed = async (path: string) => {
    actions.primeHint(path);
    await until(() => actions.hintFor(path)?.done, "the folder to be checked");
  };

  test("right-clicking empty space offers the same for the folder you are in", async () => {
    const before = state.location;
    state.search = null;
    for (const [path, php] of [[site, false], [phpsite, true], [plain, false]] as const) {
      await primed(path);
      state.location = { kind: "folder", path };
      contextmenu.showBackgroundMenu({ x: 5, y: 5 });
      const labels = menuLabels();
      expect(labels, path).toContain("Start live server here");
      expect(labels.includes("Start PHP server here"), path).toBe(php);
      expect(labels).toContain("New folder");
      noStrayWords($(".menu"), "the folder menu");
      menus.closeMenu();
    }
    state.location = before;
  });

  test("a folder offers to start a live server, and a folder with PHP also offers PHP", async () => {
    await primed(site);
    await primed(phpsite);
    await primed(plain);
    const siteLabels = await show([entry(site, true)]);
    expect(siteLabels).toContain("Start live server here");
    expect(siteLabels).not.toContain("Start PHP server here");
    menus.closeMenu();
    const phpLabels = await show([entry(phpsite, true)]);
    expect(phpLabels).toContain("Start live server here");
    expect(phpLabels).toContain("Start PHP server here");
    menus.closeMenu();
    const plainLabels = await show([entry(plain, true)]);
    expect(plainLabels).toContain("Start live server here");
    expect(plainLabels).not.toContain("Start PHP server here");
    menus.closeMenu();
    // Several items, and plain files, get none of it.
    for (const labels of [await show([entry(site, true), entry(plain, true)]), (menus.closeMenu(), await show([entry(join(site, "notes.txt"), false)]))]) {
      expect(labels.join("|")).not.toMatch(/live server|PHP server/i);
    }
  });

  test("a folder that is too broad to serve gets no server entries", async () => {
    await primed(home);
    expect(actions.hintFor(home).blocked).toBe(true);
    expect((await show([entry(home, true)])).join("|")).not.toMatch(/live server|PHP server/i);
  });

  test("an HTML file offers Open with live server, which serves its folder and opens that page", async () => {
    const labels = await show([entry(join(site, "page.html"), false)]);
    expect(labels).toContain("Open with live server");
    expect(labels).not.toContain("Start live server here");
    menus.closeMenu();
    expect(await show([entry(join(site, "A.HTM"), false)])).toContain("Open with live server");
    menus.closeMenu();
    const before = launched.length;
    contextmenu.showEntryMenu([entry(join(site, "page.html"), false)], { x: 5, y: 5 });
    click($$(".menu .menu-item").find((b) => b.textContent.includes("Open with live server")));
    await until(() => launched.length > before, "the browser to open the page");
    expect(launched.at(-1)!.join(" ")).toMatch(/http:\/\/127\.0\.0\.1:\d+\/page\.html$/);
    await until(() => store.store.servers.length === 1, "the server to be listed");
    expect(store.store.servers[0]).toMatchObject({ kind: "static", root: site, status: "running" });
    // A second page reuses the same server.
    menus.closeMenu();
    contextmenu.showEntryMenu([entry(join(site, "index.html"), false)], { x: 5, y: 5 });
    click($$(".menu .menu-item").find((b) => b.textContent.includes("Open with live server")));
    await until(() => launched.at(-1)!.join(" ").endsWith("/index.html"), "the second page to open");
    expect((await api.call("serve/status")).servers).toHaveLength(1);
  });

  test("with a server running the folder offers Stop instead, and choosing it stops the server", async () => {
    const started = await actions.startServer({ root: site, kind: "static", openBrowser: false });
    expect(started.status).toBe("running");
    await primed(site);
    const labels = await show([entry(site, true)]);
    expect(labels).toContain("Stop live server");
    expect(labels).not.toContain("Start live server here");
    click($$(".menu .menu-item").find((b) => b.textContent.includes("Stop live server")));
    await until(() => store.store.servers.length === 0, "the server to stop");
    expect((await api.call("serve/status")).servers).toEqual([]);
  });

  test.skipIf(!HAS_PHP)("a PHP folder with PHP running offers Stop PHP server", async () => {
    await primed(phpsite);
    contextmenu.showEntryMenu([entry(phpsite, true)], { x: 5, y: 5 });
    click($$(".menu .menu-item").find((b) => b.textContent.includes("Start PHP server here")));
    await until(() => store.store.servers.some((s: any) => s.kind === "php"), "PHP to start", 10_000);
    menus.closeMenu();
    const labels = await show([entry(phpsite, true)]);
    expect(labels).toContain("Stop PHP server");
    expect(labels).toContain("Start live server here");
    click($$(".menu .menu-item").find((b) => b.textContent.includes("Stop PHP server")));
    await until(() => store.store.servers.length === 0, "PHP to stop", 10_000);
  });

  test("every menu entry has an icon-free readable label and nothing says null", async () => {
    await primed(phpsite);
    await show([entry(phpsite, true)]);
    noStrayWords($(".menu"), "the menu");
    for (const b of $$(".menu .menu-item")) expect(b.textContent.trim().length).toBeGreaterThan(1);
  });
});

describe("polling and tidying up", () => {
  test("asks for the servers only while the tab shows or a server runs, and the timers follow the page", async () => {
    const g = globalThis as any;
    const active = new Set<any>();
    const realSet = g.setInterval;
    const realClear = g.clearInterval;
    g.setInterval = (fn: any, ms: number, ...rest: any[]) => {
      const id = realSet(fn, ms, ...rest);
      if (ms === store.POLL_MS) active.add(id);
      return id;
    };
    g.clearInterval = (id: any) => {
      active.delete(id);
      return realClear(id);
    };
    try {
      store.resetServeStore();
      active.clear();
      await openTool(site);
      await until(() => active.size === 1, "polling to start while the tab shows");
      power.concealPower();
      await until(() => active.size === 0, "polling to stop when the tab is hidden and nothing runs");
      power.openPower("serve");
      const started = await actions.startServer({ root: site, kind: "static", openBrowser: false });
      expect(started).toBeTruthy();
      expect(active.size).toBe(1);
      power.concealPower();
      await sleep(100);
      expect(active.size).toBe(1);
      await stopEverything();
      await until(() => active.size === 0, "polling to stop after the last server stopped");
      // A refresh after the page is gone does nothing and doesn't fail.
      const desc = Object.getOwnPropertyDescriptor(g, "document")!;
      delete g.document;
      try {
        expect(await store.refreshServers()).toBe(store.store);
        expect(store.pillText([])).toBe("");
      } finally {
        Object.defineProperty(g, "document", desc);
      }
    } finally {
      g.setInterval = realSet;
      g.clearInterval = realClear;
    }
  });

  test("the pill words: one server by kind and port, several by count", () => {
    expect(store.pillText([])).toBe("");
    expect(store.pillText([{ kind: "static", port: 5500, status: "running" }])).toBe("● Live :5500");
    expect(store.pillText([{ kind: "php", port: 8000, status: "running" }])).toBe("● PHP :8000");
    expect(store.pillText([{ kind: "php", port: 8000, status: "running" }, { kind: "static", port: 5500, status: "running" }])).toBe("● 2 servers");
    expect(store.pillText([{ kind: "php", port: 8000, status: "failed" }])).toBe("");
  });

  test("clicking the pill opens the Serve tab", async () => {
    power.concealPower();
    await actions.startServer({ root: site, kind: "static", openBrowser: false });
    const pill = await until(() => $(".serve-pill"), "the pill");
    expect(power.powerIsOpen()).toBe(false);
    click(pill);
    expect(power.powerIsOpen()).toBe(true);
    expect(power.activePowerTab()).toBe("serve");
  });
});

const realFetch = (u: any, o?: any) => (globalThis as any).fetch(u, o);
