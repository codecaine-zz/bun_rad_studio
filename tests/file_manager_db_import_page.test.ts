import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
// @ts-ignore (jsdom has no type declarations in every setup)
import { JSDOM } from "jsdom";
import { Database } from "bun:sqlite";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { FakeKeychain } from "./helpers/db_fm";

// The two ways into "Import with staging" from the File Manager: the button of a saved connection in the Databases tool,
// and the right-click item on a data file. Run for real in a fake browser against the real server; the studio is a stand-in
// that records what it is told, and windows are recorded instead of opened.
setDefaultTimeout(30_000);

const FAKE = join(import.meta.dir, "helpers", "fake_studio_staging.ts");
const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "navigator", "location", "fetch", "localStorage", "sessionStorage", "ResizeObserver"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-import-page-"));
const home = join(root, "home");
const work = join(home, "work");
const windows: { env: Record<string, string> }[] = [];
let server: ReturnType<typeof startFileManagerServer>;
let base = "";
let win: any;
let doc: any;
let power: any;
let contextmenu: any;
let dbState: any;
let studio: any;
let sqliteFile = "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => any, what: string, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${what}. Dialog: ${String(doc.querySelector(".modal-backdrop")?.textContent ?? "").replace(/\s+/g, " ").slice(0, 300)} Toasts: ${doc.querySelector("#toasts")?.textContent}`);
}
const q = (sel: string, from: any = doc): any => from.querySelector(sel);
const qa = (sel: string, from: any = doc): any[] => [...from.querySelectorAll(sel)];
const pane = (): any => doc.getElementById("power-pane-databases");
const btn = (text: string, from: any = pane()): any => qa("button", from).find((b) => b.textContent.trim().startsWith(text));
const click = (el: any) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
const menuItem = (label: string): any => qa(".menu .menu-item").find((b) => b.querySelector(".menu-label").textContent === label);
const closeAll = () => {
  for (const b of qa(".modal-backdrop")) b.remove();
  q(".menu")?.remove();
  qa("#toasts .toast").forEach((t) => t.remove());
  doc.body.classList.remove("modal-open");
};
const call = async (op: string, body: Record<string, unknown> = {}) => {
  const r = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": "ui-token" }, body: JSON.stringify(body) });
  return (await r.json()) as any;
};
const entry = (name: string) => ({ name, path: join(work, name), isDir: false, size: 1 });
async function openTab(opts?: Record<string, unknown>) {
  closeAll();
  power.openPower("databases", opts);
  await until(() => pane() && !pane().hidden && pane().querySelector(".db-toolbar"), "the Databases tab");
  await until(() => dbState.db.loaded && !pane().querySelector(".db-listbox")?.textContent.includes("Loading"), "the list");
}
async function select(name: string) {
  const row = qa(".db-row", pane()).find((r) => r.querySelector(".db-row-name").textContent.replace(/^★\s*/, "").trim() === name);
  click(row);
  await until(() => pane().querySelector(".db-detail h3")?.textContent.includes(name), `the detail of ${name}`);
}

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => true, typeInTerminal: () => true, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
  saved.set("ResizeObserver", Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"));
  Object.defineProperty(globalThis, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
  mkdirSync(work, { recursive: true });
  for (const [name, text] of Object.entries({ "people.csv": "id,name\n1,Ann\n", "t.tsv": "id\tname\n", "d.json": "[]", "l.ndjson": "{}\n", "book.xlsx": "PK", "notes.txt": "hi", "readme.md": "# x" })) writeFileSync(join(work, name), text);
  sqliteFile = join(home, "shop.sqlite");
  new Database(sqliteFile).run("create table customers(id integer primary key, name text)");
  const keychain = new FakeKeychain();
  server = startFileManagerServer({
    port: 0,
    token: "ui-token",
    context: {
      platform: "linux",
      home,
      dataDir: join(root, "data"),
      databases: {
        secretStore: async () => keychain,
        env: () => ({ PATH: process.env.PATH ?? "" }),
        cwd: () => work,
        appRoots: () => [],
        studioCommand: () => ({ kind: "dev", where: FAKE, build: (bunArgs: string[], studioArgs: string[]) => [process.execPath, ...bunArgs, FAKE, ...studioArgs] }),
        spawnWindow: async (_cmd, o) => (windows.push({ env: o.env }), { ok: true }),
        startTimeoutMs: 15_000,
        killGraceMs: 400,
      },
    },
  });
  base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch" && x !== "ResizeObserver")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = win.document;
  const st = (await import("../resources/file_manager/ui/state.js")).state;
  st.platform = "linux";
  st.sep = "/";
  st.home = home;
  st.location = { kind: "folder", path: work };
  power = await import("../resources/file_manager/ui/power.js");
  dbState = await import("../resources/file_manager/ui/dbState.js");
  studio = await import("../resources/file_manager/ui/dbStudio.js");
  contextmenu = await import("../resources/file_manager/ui/contextmenu.js");
  await import("../resources/file_manager/ui/databases.js");
  dbState.resetDatabases();
  studio.resetStudios();
  power.resetPower();
  await call("db/profile/save", { profile: { engine: "sqlite", name: "Shop file", path: sqliteFile, sqliteMode: "readwrite" } });
  await call("db/profile/save", { profile: { engine: "mysql", name: "Shop MySQL", host: "h", database: "shop" }, password: "pw-import-1" });
  await call("db/profile/save", { profile: { engine: "redis", name: "Cache", host: "h" }, password: "pw-import-2" });
});

afterAll(async () => {
  studio?.resetStudios();
  closeAll();
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(g, k, d);
    else delete g[k];
  }
  mock.restore();
  for (const s of (await call("db/studio/list")).studios ?? []) await call("db/studio/stop", { id: s.id });
  server?.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("Databases tab: Import data with staging…", () => {
  test("the button is there for SQL connections with a title, and for Redis it says plainly why it is off", async () => {
    await openTab();
    await select("Shop file");
    const b = btn("Import data with staging");
    expect(b).toBeTruthy();
    expect(b.disabled).toBe(false);
    expect(b.title).toContain("staging table");
    await select("Shop MySQL");
    expect(btn("Import data with staging").disabled).toBe(false);
    await select("Cache");
    const r = btn("Import data with staging");
    expect(r.disabled).toBe(true);
    expect(r.title).toContain("Redis has no tables");
  });

  test("it asks where to open the wizard; 'in its own window' hands the window the wizard to open", async () => {
    await openTab();
    await select("Shop file");
    click(btn("Import data with staging"));
    await until(() => qa(".menu .menu-item").length === 3, "the menu");
    expect(qa(".menu .menu-item .menu-label").map((e) => e.textContent)).toEqual(["Here, in this tab", "In its own window", "In my web browser"]);
    click(menuItem("In its own window"));
    await until(() => windows.length > 0, "the window to be started");
    expect(windows[0]!.env.STUDIO_IMPORT_OPEN).toBe("1");
    expect(windows[0]!.env.STUDIO_IMPORT_FILE).toBeUndefined();
    expect(windows[0]!.env.SQLITE_STUDIO_DB).toBe(sqliteFile);
  });

  test("'Here, in this tab' starts the studio for the wizard and shows it in the tab", async () => {
    await openTab();
    await select("Shop file");
    click(btn("Import data with staging"));
    await until(() => menuItem("Here, in this tab"), "the menu");
    click(menuItem("Here, in this tab"));
    let info: any;
    await until(() => {
      void call("db/studio/list").then((r) => (info = r.studios.find((s: any) => s.state === "running")));
      return info;
    }, "the studio to run");
    const env = ((await (await fetch(`${info.url}__env`)).json()) as any).env;
    expect(env.STUDIO_IMPORT_OPEN).toBe("1");
    await until(() => qa(".db-studio", pane()).some((s) => !s.hidden), "the studio to be shown in the tab");
  });
});

describe("right-click on a data file: Load into a database (staging first)…", () => {
  const label = "Load into a database (staging first)…";
  const labelsFor = (entries: any[]) => {
    closeAll();
    contextmenu.showEntryMenu(entries, { x: 5, y: 5 });
    return qa(".menu .menu-item .menu-label").map((e) => e.textContent);
  };

  test("CSV, TSV, JSON and JSON Lines files get it; other files, folders and selections of several do not; Excel gets an honest disabled item", () => {
    for (const n of ["people.csv", "t.tsv", "d.json", "l.ndjson"]) expect(labelsFor([entry(n)]), n).toContain(label);
    expect(labelsFor([entry("notes.txt")])).not.toContain(label);
    expect(labelsFor([entry("readme.md")])).not.toContain(label);
    expect(labelsFor([{ name: "work", path: work, isDir: true, size: 0 }])).not.toContain(label);
    expect(labelsFor([entry("people.csv"), entry("t.tsv")])).not.toContain(label);
    expect(labelsFor([entry("book.xlsx")])).toContain(label);
    const x = menuItem(label);
    expect(x.disabled).toBe(true);
    expect(x.title).toContain("CSV UTF-8");
    closeAll();
    contextmenu.showEntryMenu([entry("people.csv")], { x: 5, y: 5 });
    expect(menuItem(label).title).toContain("only read");
  });

  test("it lets the person pick a saved SQL connection (not Redis) or a SQLite file, then opens the wizard with that file", async () => {
    windows.length = 0;
    closeAll();
    contextmenu.showEntryMenu([entry("people.csv")], { x: 5, y: 5 });
    click(menuItem(label));
    await until(() => q(".modal-backdrop .dialog"), "the dialog");
    const dlg = q(".modal-backdrop .dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.textContent).toContain("people.csv");
    expect(dlg.textContent).toContain("staging table first");
    const sel = q("select", dlg);
    const options = [...sel.options].map((o: any) => o.textContent);
    expect(options.some((o) => o.includes("Shop file"))).toBe(true);
    expect(options.some((o) => o.includes("Shop MySQL"))).toBe(true);
    expect(options.some((o) => o.includes("Cache"))).toBe(false);
    expect(options.some((o) => o.includes("A SQLite file"))).toBe(true);
    for (const el of qa("select, input, button", dlg)) expect(el.title || el.getAttribute("aria-label") || el.textContent.trim(), el.outerHTML.slice(0, 80)).toBeTruthy();
    // a SQLite file typed by path, opened in its own window
    sel.value = "__file__";
    sel.dispatchEvent(new win.Event("change", { bubbles: true }));
    const path = q("input[type=text]", dlg);
    expect(path.closest("label").hidden).toBe(false);
    path.value = sqliteFile;
    click(qa("input[type=radio]", dlg).find((r) => r.value === "window"));
    click(qa("button", dlg).find((b) => b.textContent.includes("Open the import wizard")));
    await until(() => windows.length > 0, "the window");
    expect(windows[0]!.env.STUDIO_IMPORT_FILE).toBe(realpathSync(join(work, "people.csv")));
    expect(windows[0]!.env.SQLITE_STUDIO_DB).toBe(sqliteFile);
    expect(windows[0]!.env.STUDIO_STAGING_TOKEN).toBe("");
  });

  test("a path that is not a SQLite database is refused with a message, and Cancel does nothing", async () => {
    windows.length = 0;
    closeAll();
    contextmenu.showEntryMenu([entry("people.csv")], { x: 5, y: 5 });
    click(menuItem(label));
    await until(() => q(".modal-backdrop .dialog"), "the dialog");
    const dlg = q(".modal-backdrop .dialog");
    q("select", dlg).value = "__file__";
    q("select", dlg).dispatchEvent(new win.Event("change", { bubbles: true }));
    q("input[type=text]", dlg).value = join(work, "notes.txt");
    click(qa("button", dlg).find((b) => b.textContent.includes("Open the import wizard")));
    await until(() => (q("#toasts")?.textContent ?? "").includes("isn't an SQLite database"), "the refusal");
    expect(windows).toHaveLength(0);
    closeAll();
    contextmenu.showEntryMenu([entry("people.csv")], { x: 5, y: 5 });
    click(menuItem(label));
    await until(() => q(".modal-backdrop .dialog"), "the dialog again");
    click(qa("button", q(".modal-backdrop .dialog")).find((b) => b.textContent.trim() === "Cancel"));
    await sleep(100);
    expect(windows).toHaveLength(0);
  });

  test("a file the server will not hand over (gone, or too big) is reported and no dialog opens", async () => {
    closeAll();
    contextmenu.showEntryMenu([{ name: "ghost.csv", path: join(work, "ghost.csv"), isDir: false, size: 1 }], { x: 5, y: 5 });
    click(menuItem(label));
    await until(() => (q("#toasts")?.textContent ?? "").includes("isn't there"), "the message");
    expect(q(".modal-backdrop .dialog")).toBeNull();
  });
});
