import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-recents-ui-"));
const home = join(root, "home");
const docs = join(home, "Docs");
const fileA = join(docs, "alpha.txt");
const fileB = join(docs, "beta.md");
const fileC = join(docs, "gamma.json");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let recents: any;
let sidebar: any;
let homeView: any;
let extras: any;
let state: any;
let api: any;
let codeDocs: any;
let codeTabs: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dialogButton = (text: string): any => [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.includes(text));
const type = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
};
const serverSettings = async () => (await api.call("settings")).settings;
const recentSectionEl = (): any => [...doc.querySelectorAll("#sidebar .side-section")].find((s: any) => s.querySelector(".side-title")?.textContent === "Recent");
const sidebarRecentLabels = (): string[] => [...(recentSectionEl()?.querySelectorAll(".side-item .sl") ?? [])].map((l: any) => l.textContent);

beforeAll(async () => {
  mkdirSync(docs, { recursive: true });
  writeFileSync(fileA, "alpha");
  writeFileSync(fileB, "# beta");
  writeFileSync(fileC, '{"gamma":true}');
  mock.module("../resources/file_manager/ui/terminal.js", () => ({
    terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => true, typeInTerminal: () => true, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, isTerminalOpen: () => false, wireTerminal() {},
  }));
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data") } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8")
    .replace(/__FM_TOKEN__/g, "ui-token")
    .replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux")
    .replace(/__FM_NONCE__/g, "n")
    .replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  api = await import("../resources/file_manager/ui/api.js");
  recents = await import("../resources/file_manager/ui/recents.js");
  sidebar = await import("../resources/file_manager/ui/sidebar.js");
  homeView = await import("../resources/file_manager/ui/home.js");
  extras = await import("../resources/file_manager/ui/extras.js");
  codeDocs = await import("../resources/file_manager/ui/codeDocs.js");
  codeTabs = await import("../resources/file_manager/ui/codeTabs.js");

  state.home = home;
  state.sep = "/";
  state.places = [];
  state.drives = [];
  state.location = { kind: "folder", path: docs };
  state.workspace = "home";
  state.settings = (await serverSettings()) as any;
  sidebar.wireSidebar();
  homeView.wireHome();
  sidebar.renderSidebar();
  homeView.renderHome();
});

afterAll(() => {
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const d = saved.get(key);
    if (d) Object.defineProperty(g, key, d);
    else delete g[key];
  }
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("Recent files in the sidebar, Home view, toolbar menu, and Manage dialog", () => {
  test("starts enabled with an empty hint in the sidebar and Home view", () => {
    expect(recents.isRecentsEnabled()).toBe(true);
    expect(recentSectionEl()?.querySelector(".side-hint")?.textContent).toContain("Files you open appear here");
    expect(doc.querySelector("#home")?.textContent).toContain("Files you open will be listed here");
  });

  test("adding recent files populates the sidebar and Home card, with per-item remove and controls", async () => {
    await api.call("recent/add", { path: fileA });
    await api.call("recent/add", { path: fileB });
    const r = await api.call("recent/add", { path: fileC });
    state.settings = r.settings;
    sidebar.renderSidebar();
    homeView.renderHome();

    expect(sidebarRecentLabels()).toEqual(["gamma.json", "beta.md", "alpha.txt"]);
    const homeItems = [...doc.querySelectorAll("#home .home-recent-item")];
    expect(homeItems.length).toBe(3);

    // Click the per-item remove button on the Home card for beta.md
    const removeBeta = homeItems.find((el: any) => el.textContent.includes("beta.md"))?.querySelector(".home-recent-rm");
    expect(removeBeta).toBeTruthy();
    removeBeta.click();
    await sleep(300);

    expect((await serverSettings()).recents.map((x: any) => x.path)).toEqual([fileC, fileA]);
    expect(sidebarRecentLabels()).toEqual(["gamma.json", "alpha.txt"]);
  });

  test("turning recent files off in the sidebar pauses tracking and hides the list until turned back on", async () => {
    const toggleBtn = recentSectionEl()?.querySelector(".side-head .side-mini");
    expect(toggleBtn?.getAttribute("aria-pressed")).toBe("true");
    toggleBtn.click();
    await sleep(300);

    expect(recents.isRecentsEnabled()).toBe(false);
    expect((await serverSettings()).recentsEnabled).toBe(false);
    expect(sidebarRecentLabels()).toEqual([]);
    expect(recentSectionEl()?.querySelector(".side-hint")?.textContent).toContain("turned off");
    expect(doc.querySelector("#home")?.textContent).toContain("Recent files are turned off");

    // Re-enable via sidebar button
    const resumeBtn = recentSectionEl()?.querySelector(".side-head .side-mini");
    expect(resumeBtn?.getAttribute("aria-pressed")).toBe("false");
    resumeBtn.click();
    await sleep(300);

    expect(recents.isRecentsEnabled()).toBe(true);
    expect((await serverSettings()).recentsEnabled).toBe(true);
    expect(sidebarRecentLabels()).toEqual(["gamma.json", "alpha.txt"]);
  });

  test("the Recent toolbar menu lists recent files, the Turn off toggle, Manage, and Clear", async () => {
    recents.showRecentsMenu({ x: 10, y: 10 });
    await sleep(50);
    const items = [...doc.querySelectorAll("[role=menuitem], [role=menuitemcheckbox]")].map((i: any) => i.textContent);
    expect(items.some((t: string) => t.includes("gamma.json"))).toBe(true);
    expect(items.some((t: string) => t.includes("alpha.txt"))).toBe(true);
    expect(items.some((t: string) => t.includes("Turn off recent files"))).toBe(true);
    expect(items.some((t: string) => t.includes("Manage recent files"))).toBe(true);
    expect(items.some((t: string) => t.includes("Clear recent files"))).toBe(true);
    doc.defaultView.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "Escape" }));
    doc.body.click();
  });

  test("Manage recent files dialog: filters items, detects and prunes missing files, removes items, and clears all", async () => {
    // Re-add beta.md and then delete alpha.txt from disk so it shows as missing
    const added = await api.call("recent/add", { path: fileB });
    state.settings = added.settings;
    rmSync(fileA);

    const p = recents.showRecentsManager();
    await sleep(500);

    const rows = () => [...doc.querySelectorAll(".modal-backdrop .fav-row")];
    expect(rows().length).toBe(3);
    const missingRow = rows().find((r: any) => r.textContent.includes("alpha.txt"));
    expect(missingRow?.classList.contains("fav-missing")).toBe(true);
    expect(missingRow?.textContent).toContain("isn't there any more");

    // Filter by name
    const filterInput = doc.querySelector('.modal-backdrop input[type="search"]');
    type(filterInput, "gamma");
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain("gamma.json");
    type(filterInput, "");
    expect(rows().length).toBe(3);

    // Prune missing files
    const pruneBtn = dialogButton("Remove missing files");
    expect(pruneBtn).toBeTruthy();
    expect(pruneBtn.disabled).toBe(false);
    pruneBtn.click();
    await sleep(400);
    expect(rows().length).toBe(2);
    expect((await serverSettings()).recents.map((x: any) => x.path)).toEqual([fileB, fileC]);

    // Clear all from dialog
    dialogButton("Clear all recent files").click();
    await sleep(300);
    expect(rows().length).toBe(0);
    expect((await serverSettings()).recents).toEqual([]);

    dialogButton("Done").click();
    await p;
  });

  test("Settings dialog includes the Remember recently opened files toggle", async () => {
    extras.showSettings();
    await sleep(100);
    const dialogText = doc.querySelector(".modal-backdrop")?.textContent ?? "";
    expect(dialogText).toContain("Remember recently opened files");
    expect(dialogText).toContain("Manage recent files");
    dialogButton("Done").click();
    await sleep(50);
  });
});

describe("Recent files in the built-in Code editor", () => {
  test("createDocs tracks recents when enabled, supports removeRecent and clearRecents, and stops tracking when disabled", async () => {
    const d = codeDocs.createDocs();
    await d.openPath(fileB);
    await d.openPath(fileC);
    expect(d.session.recents.map((r: any) => r.path)).toEqual([fileC, fileB]);

    // Remove a single item
    d.removeRecent(fileC);
    expect(d.session.recents.map((r: any) => r.path)).toEqual([fileB]);

    // Disable recents and open another file
    d.setRecentsEnabled(false);
    expect(d.settings.recentsEnabled).toBe(false);
    writeFileSync(fileA, "alpha again");
    await d.openPath(fileA);
    expect(d.session.recents.map((r: any) => r.path)).toEqual([fileB]);

    // Clear all recents
    d.clearRecents();
    expect(d.session.recents).toEqual([]);
  });

  test("renderWelcome renders Turn off/Turn on, Clear, and per-item remove buttons", () => {
    const host = doc.createElement("div");
    const removed: string[] = [];
    let cleared = 0;
    const toggled: boolean[] = [];

    codeTabs.renderWelcome(host, {
      recents: [{ path: fileB, at: new Date().toISOString() }],
      recentsEnabled: true,
      onNew: () => {},
      onQuickOpen: () => {},
      onOpen: () => {},
      onOpenByPath: () => {},
      onRemoveRecent: (p: string) => removed.push(p),
      onClearRecents: () => cleared++,
      onToggleRecents: (on: boolean) => toggled.push(on),
    });

    expect(host.querySelector(".code-res-line")?.textContent).toBe(fileB);
    host.querySelector(".code-recent-remove")?.click();
    expect(removed).toEqual([fileB]);

    const buttons = [...host.querySelectorAll(".code-recent-actions button")];
    buttons.find((b: any) => b.textContent === "Clear")?.click();
    expect(cleared).toBe(1);
    buttons.find((b: any) => b.textContent === "Turn off")?.click();
    expect(toggled).toEqual([false]);
  });
});
