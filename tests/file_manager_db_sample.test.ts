import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { Database } from "bun:sqlite";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { DATASETS } from "../src/db/samples/catalog";
import { FakeKeychain, fakeStudioCommand } from "./helpers/db_fm";

setDefaultTimeout(30_000);

const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch", "localStorage", "sessionStorage"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-db-sample-"));
const home = join(root, "home");
const target = join(root, "databases");
const keychain = new FakeKeychain();
let server: ReturnType<typeof startFileManagerServer>;
let base = "";
let win: any;
let doc: any;
let power: any;
let dbState: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => any, what: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${what}. Dialog: ${String(top()?.textContent ?? "").replace(/\s+/g, " ").slice(0, 500)}`);
}
const pane = (): any => doc.getElementById("power-pane-databases");
const top = (): any => [...doc.querySelectorAll(".modal-backdrop")].at(-1);
const click = (el: any) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
const setValue = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
};
const button = (text: string, from: any): any => [...from.querySelectorAll("button")].find((b: any) => b.textContent.trim().startsWith(text));
const call = async (op: string, body: Record<string, unknown> = {}) => {
  const r = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": "ui-token" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
};

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => true, typeInTerminal: () => true, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false,
  }));
  for (const d of [home, target]) mkdirSync(d, { recursive: true });
  server = startFileManagerServer({
    port: 0, token: "ui-token",
    context: {
      home, dataDir: join(root, "data"),
      databases: { secretStore: async () => keychain, env: () => ({ PATH: process.env.PATH ?? "" }), cwd: () => home, appRoots: () => [], studioCommand: () => fakeStudioCommand(), startTimeoutMs: 15_000, killGraceMs: 400 },
    },
  });
  base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "win32" ? "win32" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = win.document;
  const st = (await import("../resources/file_manager/ui/state.js")).state;
  st.platform = process.platform === "win32" ? "win32" : "linux";
  st.sep = process.platform === "win32" ? "\\" : "/";
  st.home = home;
  st.location = { kind: "folder", path: target };
  power = await import("../resources/file_manager/ui/power.js");
  dbState = await import("../resources/file_manager/ui/dbState.js");
  await import("../resources/file_manager/ui/databases.js");
  dbState.resetDatabases();
  power.resetPower();
});

afterAll(() => {
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(g, k, d);
    else delete g[k];
  }
  mock.restore();
  server?.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("File Manager: server operations for sample databases", () => {
  test("the catalog lists every dataset with counts per scale", async () => {
    const { body } = await call("db/sample/catalog");
    expect(body.datasets.length).toBe(DATASETS.length);
    expect(body.datasets.length).toBeGreaterThanOrEqual(10);
    const medicare = body.datasets.find((d: any) => d.id === "medicare_formulary");
    expect(medicare.rows.small).toBeLessThan(medicare.rows.medium);
    expect(medicare.tableCount).toBeGreaterThanOrEqual(35);
    expect(body.scales).toEqual(["small", "medium", "large"]);
  });

  test("creates a SQLite file, saves it as a connection, and never overwrites an existing file", async () => {
    const r = await call("db/sample/create", { datasetId: "hospital_ehr", scale: "small", folder: target, name: "ops_hospital" });
    expect(r.status).toBe(200);
    const file = join(target, "ops_hospital.sqlite");
    expect(r.body.path).toBe(file);
    expect(r.body.profile).toMatchObject({ engine: "sqlite", path: file });
    const db = new Database(file, { readonly: true });
    expect((db.query("SELECT dataset_id FROM _sample_info").get() as any).dataset_id).toBe("hospital_ehr");
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
    const before = readFileSync(file);
    const again = await call("db/sample/create", { datasetId: "hospital_ehr", scale: "small", folder: target, name: "ops_hospital" });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(again.body.error.code).toBe("EXISTS");
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  test("refuses unknown datasets, bad scales, missing folders and bad names; creates no folders", async () => {
    expect((await call("db/sample/create", { datasetId: "nope", scale: "small", folder: target, name: "x" })).status).toBeGreaterThanOrEqual(400);
    expect((await call("db/sample/create", { datasetId: "hospital_ehr", scale: "huge", folder: target, name: "x" })).status).toBeGreaterThanOrEqual(400);
    const missing = join(root, "missing-folder");
    const r = await call("db/sample/create", { datasetId: "hospital_ehr", scale: "small", folder: missing, name: "x" });
    expect(r.body.error.code).toBe("NOT_FOUND");
    expect(existsSync(missing)).toBe(false);
    expect((await call("db/sample/create", { datasetId: "hospital_ehr", scale: "small", folder: target, name: "../evil" })).status).toBeGreaterThanOrEqual(400);
    expect((await call("db/sample/create", { datasetId: "hospital_ehr", scale: "small", folder: "relative/path", name: "x" })).status).toBeGreaterThanOrEqual(400);
    expect(existsSync(join(root, "evil.sqlite"))).toBe(false);
  });
});

describe("File Manager: the New sample database dialog", () => {
  async function openTab() {
    power.openPower("databases", {});
    await until(() => pane() && !pane().hidden && pane().querySelector(".db-toolbar"), "the Databases tab");
    await until(() => dbState.db.loaded, "the overview");
  }

  test("the button is in the toolbar, with a title", async () => {
    await openTab();
    const b = button("New sample database", pane());
    expect(b).toBeTruthy();
    expect(b.getAttribute("title")).toContain("synthetic");
  });

  test("choose a sample, search, pick a scale, create: the file exists and the connection is selected", async () => {
    click(button("New sample database", pane()));
    await until(() => top()?.querySelector(".db-sample-list input"), "the dialog");
    const dlg = top();
    expect(dlg.querySelector("[role=dialog]")?.getAttribute("aria-modal")).toBe("true");
    expect(dlg.querySelectorAll(".db-sample-item").length).toBe(DATASETS.length);
    const [folder, name] = [...dlg.querySelectorAll("label.db-field input")] as any[];
    expect(folder.value).toBe(target);
    setValue(dlg.querySelector("input[type=search]"), "banking");
    expect([...dlg.querySelectorAll(".db-sample-title")].map((e: any) => e.textContent)).toEqual(["Retail Banking and Double-Entry Ledger"]);
    setValue(dlg.querySelector("input[type=search]"), "");
    const medicare = [...dlg.querySelectorAll(".db-sample-item")].find((l: any) => l.textContent.includes("Medicare"));
    click(medicare.querySelector("input"));
    await until(() => dlg.querySelector(".db-sample-about").textContent.includes("formulary"), "the description");
    expect(dlg.querySelector(".db-sample-facts").textContent).toContain("SYNTHETIC DATA");
    expect(name.value).toBe("sample_medicare_formulary");
    setValue(name, "ui_medicare");
    click(button("Create sample database", dlg));
    await until(() => !top(), "the dialog to close");
    const file = join(target, "ui_medicare.sqlite");
    expect(statSync(file).size).toBeGreaterThan(100_000);
    const db = new Database(file, { readonly: true });
    expect(db.query("SELECT dataset_id, scale FROM _sample_info").get() as any).toEqual({ dataset_id: "medicare_formulary", scale: "small" });
    expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
    await until(() => pane().querySelector(".db-detail h3")?.textContent.includes("Medicare"), "the new connection to be selected");
    expect(doc.querySelector("#toasts")?.textContent).toContain("ui_medicare.sqlite");
  });

  test("an existing file name shows the problem in the dialog, keeps it open and never overwrites", async () => {
    const file = join(target, "ui_medicare.sqlite");
    const before = readFileSync(file);
    click(button("New sample database", pane()));
    await until(() => top()?.querySelector(".db-sample-list input"), "the dialog");
    const dlg = top();
    const name = dlg.querySelectorAll("label.db-field input")[1];
    setValue(name, "ui_medicare");
    click(button("Create sample database", dlg));
    await until(() => !dlg.querySelector(".dialog-error")?.hidden && dlg.querySelector(".dialog-error").textContent.includes("already exists"), "the error");
    expect(top()).toBe(dlg);
    expect(button("Create sample database", dlg).disabled).toBe(false);
    expect(readFileSync(file).equals(before)).toBe(true);
    dlg.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await until(() => !top(), "the dialog to close with Escape");
    expect(existsSync(file)).toBe(true);
  });

  test("a missing folder is reported and nothing is created", async () => {
    click(button("New sample database", pane()));
    await until(() => top()?.querySelector(".db-sample-list input"), "the dialog");
    const dlg = top();
    const [folder] = [...dlg.querySelectorAll("label.db-field input")] as any[];
    setValue(folder, join(root, "no-such-folder"));
    click(button("Create sample database", dlg));
    await until(() => !dlg.querySelector(".dialog-error")?.hidden && dlg.querySelector(".dialog-error").textContent.includes("doesn't exist"), "the error");
    expect(existsSync(join(root, "no-such-folder"))).toBe(false);
    click(button("Cancel", dlg));
    await until(() => !top(), "close");
  });
});
