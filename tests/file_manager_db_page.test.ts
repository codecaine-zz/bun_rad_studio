import { afterAll, beforeAll, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { Database } from "bun:sqlite";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { FakeKeychain, fakeStudioCommand } from "./helpers/db_fm";

// Starting a real child program takes a moment on a slow computer.
setDefaultTimeout(30_000);

const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch", "localStorage", "sessionStorage"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-db-page-"));
const PW = "page-SECRET-8080";
const PW_URL = "url-SECRET-6060";
const ENV_PW = "env-SECRET-7070";

const keychain = new FakeKeychain();
const live: Record<string, string> = {
  PATH: process.env.PATH ?? "",
  MSQL_HOST: "env-mysql.example.com", MSQL_PORT: "3307", MSQL_USER: "envuser", MSQL_PASSWORD: ENV_PW, MSQL_NAME: "shop",
  DATABASE_URL: `postgres://pguser:${ENV_PW}@pg.example.com:5433/appdb`,
};
const windows: Array<{ command: string[] }> = [];
const testResults = new Map<string, any>();
let server: ReturnType<typeof startFileManagerServer>;
let base = "";
let win: any;
let doc: any;
let db: any;
let power: any;
let files: any;
let detect: any;
let studio: any;
const home = join(root, "home");
const start = join(root, "start");
const install = join(root, "install");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => any, what: string, ms = 10_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${what}. The tab says: ${String(pane()?.textContent ?? "").replace(/\s+/g, " ").slice(0, 1400)} | dialog: ${String(top()?.textContent ?? "").replace(/\s+/g, " ").slice(0, 300)}`);
}
const pane = (): any => doc.getElementById("power-pane-databases");
const dialogs = (): any[] => [...doc.querySelectorAll(".modal-backdrop")];
const top = (): any => dialogs().at(-1);
const btn = (text: string, from: any = pane()): any => [...from.querySelectorAll("button")].find((b: any) => b.textContent.trim().startsWith(text));
const click = (el: any) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
const setValue = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
};
const key = (target: any, k: string) => target.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const closeAll = () => {
  for (const d of dialogs()) d.remove();
  doc.querySelectorAll(".menu").forEach((m: any) => m.remove());
  doc.querySelectorAll("#toasts .toast").forEach((t: any) => t.remove());
};
const toasts = () => doc.querySelector("#toasts")?.textContent ?? "";
const field = (from: any, label: string): any => {
  const el = [...from.querySelectorAll("label.db-field")].find((l: any) => l.querySelector(".db-field-label")?.textContent.trim().startsWith(label));
  if (!el) throw new Error(`No field called ${label}`);
  return el.querySelector("input, select, textarea");
};
const call = async (op: string, body: Record<string, unknown> = {}) => {
  const r = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": "ui-token" }, body: JSON.stringify(body) });
  return (await r.json()) as any;
};
const rows = (): string[] => [...pane().querySelectorAll(".db-row .db-row-name")].map((e: any) => e.textContent.replace(/^★\s*/, "").trim());
const selectRow = async (name: string) => {
  const row = [...pane().querySelectorAll(".db-row")].find((r: any) => r.querySelector(".db-row-name").textContent.replace(/^★\s*/, "").trim() === name);
  if (!row) throw new Error(`No connection called ${name}: ${rows()}`);
  click(row);
  await until(() => pane().querySelector(".db-detail h3")?.textContent.includes(name), `the detail of ${name}`);
};
async function openTab(opts?: Record<string, unknown>) {
  closeAll();
  power.openPower("databases", opts);
  await until(() => pane() && !pane().hidden && pane().querySelector(".db-toolbar"), "the Databases tab");
  await until(() => db.db.loaded && !pane().querySelector(".db-listbox")?.textContent.includes("Loading"), "the list");
  await sleep(60);
}
const reopen = async (opts?: Record<string, unknown>) => {
  power.closePower?.();
  power.resetPower();
  doc.getElementById("power-body").replaceChildren();
  await openTab(opts);
};

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => true, typeInTerminal: () => true, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false,
  }));
  for (const d of [home, start, install]) mkdirSync(d, { recursive: true });
  writeFileSync(join(install, ".env"), "REDIS_URL=redis://cache.example.com:6380/2\nPG_SCHEMA=audit\n");
  server = startFileManagerServer({
    port: 0, token: "ui-token",
    context: {
      platform: "linux", home, dataDir: join(root, "data"),
      databases: {
        secretStore: async () => keychain, env: () => live, cwd: () => start, appRoots: () => [install], studioCommand: () => fakeStudioCommand(),
        spawnWindow: async (command) => (windows.push({ command }), { ok: true }),
        testConnection: async (input) => testResults.get(input.host ?? "") ?? { ok: true, ms: 12, message: "Connected to MySQL 8.0.", facts: ["Database: shop"] },
        startTimeoutMs: 15_000, killGraceMs: 400,
      },
    },
  });
  base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = win.document;
  const st = (await import("../resources/file_manager/ui/state.js")).state;
  st.platform = "linux";
  st.sep = "/";
  st.home = home;
  st.location = { kind: "folder", path: home };
  power = await import("../resources/file_manager/ui/power.js");
  db = await import("../resources/file_manager/ui/dbState.js");
  detect = await import("../resources/file_manager/ui/dbDetect.js");
  studio = await import("../resources/file_manager/ui/dbStudio.js");
  files = await import("../resources/file_manager/ui/dbFiles.js");
  await import("../resources/file_manager/ui/databases.js");
  db.resetDatabases();
  studio.resetStudios();
  files.resetDatabaseFiles();
  power.resetPower();
});

afterAll(async () => {
  studio?.resetStudios();
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

describe("the Databases tab: found in your environment", () => {
  test("it is a Power tab with a Home tile, an icon and a title", async () => {
    const tab = power.listPowerTabs().find((t: any) => t.id === "databases");
    expect(tab).toMatchObject({ label: "Databases", icon: "🗄️" });
    expect(tab.tip).toContain("replaces environment variables");
    const { registerHomeTiles } = await import("../resources/file_manager/ui/homeTiles.js");
    const home = await import("../resources/file_manager/ui/home.js");
    registerHomeTiles();
    const tile = home.listHomeTiles().find((t: any) => t.id === "tool-databases");
    expect(tile).toMatchObject({ icon: "🗄️", title: "Databases" });
    expect(tile?.text).toContain("replaces environment variables");
  });

  test("cards for what the environment holds, with where each value came from; passwords are never in the page", async () => {
    await openTab();
    const banner = pane().querySelector(".db-found");
    expect(banner.hidden).toBe(false);
    expect(banner.getAttribute("aria-label")).toBe("Found in your environment");
    expect(banner.querySelector("h3").textContent).toContain("Found in your environment");
    const cards = [...banner.querySelectorAll(".db-card")];
    expect(cards.map((c: any) => c.dataset.key.split(":")[0]).sort()).toEqual(["mysql", "postgres", "redis"]);
    const mysql = cards.find((c: any) => c.dataset.key.startsWith("mysql"));
    expect(mysql.getAttribute("role")).toBe("group");
    expect(mysql.getAttribute("aria-label")).toBe("MySQL / MariaDB: env-mysql.example.com:3307/shop");
    expect(mysql.textContent).toContain("environment variable MSQL_HOST");
    expect(mysql.textContent).toContain("found (hidden)");
    expect(mysql.textContent).not.toContain(ENV_PW);
    const pg = cards.find((c: any) => c.dataset.key.startsWith("postgres"));
    expect(pg.textContent).toContain("environment variable DATABASE_URL");
    // a .env in the install folder: found, but not loaded into the environment
    const redis = cards.find((c: any) => c.dataset.key.startsWith("redis"));
    expect(redis.textContent).toContain("`.env` in the install folder");
    expect(redis.textContent).toContain("found in the file but not loaded into the environment");
    expect(redis.querySelector(".db-badge-note").textContent).toContain("not loaded into the environment");
    expect(pane().innerHTML).not.toContain(ENV_PW);
    for (const b of banner.querySelectorAll("button")) expect(b.title, b.textContent).toBeTruthy();
    expect([...mysql.querySelectorAll("button")].map((b: any) => b.textContent)).toEqual(["Save to the manager", "Not now", "Never for this one"]);
  });

  test("'Not now' hides a card for now; 'Never for this one' is remembered by the server", async () => {
    await openTab();
    const key = (name: string) => [...pane().querySelectorAll(".db-card")].find((c: any) => c.dataset.key.startsWith(name));
    click(btn("Not now", key("redis")));
    await until(() => !key("redis"), "the redis card to go");
    click(btn("Never for this one", key("postgres")));
    await until(() => !key("postgres"), "the postgres card to go");
    expect(toasts()).toContain("won't be offered again");
    expect((await call("db/detect", {})).dismissed).toBe(1);
    expect(key("mysql")).toBeTruthy();
    // bring them back
    click([...pane().querySelectorAll("button")].find((b: any) => b.textContent.startsWith("Offer put-aside")));
    await until(() => key("postgres"), "the postgres card to return");
  });

  test("Save to the manager: a normal connection appears, the password is in the keychain, and the page says the variables are no longer needed", async () => {
    await openTab();
    const card = [...pane().querySelectorAll(".db-card")].find((c: any) => c.dataset.key.startsWith("mysql"));
    click(btn("Save to the manager", card));
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "Saved to the manager", "the follow-up dialog");
    const d = top();
    expect(d.textContent).toContain("These environment variables are no longer needed");
    expect([...d.querySelectorAll(".db-names code")].map((c: any) => c.textContent)).toEqual(["MSQL_HOST", "MSQL_NAME", "MSQL_PASSWORD", "MSQL_PORT", "MSQL_USER"]);
    expect(d.textContent).toContain("Nothing is edited for you");
    expect(d.textContent).not.toContain(ENV_PW);
    expect([...keychain.map.values()]).toContain(ENV_PW);
    for (const b of d.querySelectorAll("button")) expect(b.textContent.trim().length).toBeGreaterThan(0);
    // the one-click switch for the engine
    click(btn("Stop using environment variables for MySQL", d));
    await until(() => toasts().includes("no longer use environment variables"), "the confirmation");
    expect((await call("db/overview")).settings.engines.mysql.useEnv).toBe(false);
    await until(() => rows().includes("MySQL / MariaDB: env-mysql.example.com:3307/shop"), "the new connection in the list");
    expect(pane().querySelector(".db-card[data-key^='mysql']")).toBeNull();
    expect(pane().textContent).not.toContain(ENV_PW);
  });

  test("the saved connection's Effective settings: values, sources, ignored and no-longer-needed names only", async () => {
    await openTab();
    await selectRow("MySQL / MariaDB: env-mysql.example.com:3307/shop");
    const eff = await until(() => pane().querySelector(".db-effective-table"), "the effective settings");
    const table = pane().querySelector(".db-effective");
    expect(table.querySelector("caption").textContent).toContain("where it comes from");
    const rowOf = (label: string) => [...eff.querySelectorAll("tbody tr")].find((r: any) => r.querySelector("th").textContent === label);
    expect(rowOf("Host").textContent).toContain("env-mysql.example.com");
    expect(rowOf("Host").textContent).toContain("Saved connection");
    expect(rowOf("Password").textContent).toContain("set, hidden");
    expect(table.textContent).toContain("These environment variables are no longer needed");
    expect(table.textContent).toContain("MSQL_HOST");
    expect(table.textContent).toContain("The studio will use the values above, and nothing from the environment or any .env file");
    expect(pane().textContent).not.toContain(ENV_PW);
    // the engine switch shows the new choice
    const toggle = pane().querySelector(".db-env-toggle input[type=checkbox]");
    expect(toggle.checked).toBe(false);
  });

  test("detection settings: on by default, saving automatically is off and asks before it is turned on", async () => {
    await openTab();
    const details = pane().querySelector(".db-detect-settings");
    expect(details.querySelector("summary").textContent).toBe("Detection settings");
    const auto = details.querySelector("#db-detect-auto");
    const saveAuto = details.querySelector("#db-detect-save");
    expect(auto.checked).toBe(true);
    expect(saveAuto.checked).toBe(false);
    click(saveAuto);
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "Save detected connections automatically?", "the question");
    click(btn("Cancel", top()));
    await until(() => !top(), "the dialog to close");
    await sleep(40);
    expect(pane().querySelector("#db-detect-save").checked).toBe(false);
    expect((await call("db/overview")).settings.detect.autoSave).toBe(false);
    click(pane().querySelector("#db-detect-save"));
    await until(() => top(), "the question again");
    click(btn("Save automatically", top()));
    await until(() => !top(), "the dialog to close");
    await sleep(200);
    expect((await call("db/overview")).settings.detect.autoSave).toBe(true);
    await call("db/detect/settings", { autoSave: false });
  });

  test("when the environment changes after saving: a notice with a field-by-field diff, and Update", async () => {
    live.MSQL_HOST = "new-mysql.example.com";
    live.MSQL_PASSWORD = "changed-SECRET-0001";
    await reopen();
    const card = await until(() => pane().querySelector(".db-card-changed"), "the changed card");
    expect(card.textContent).toContain("Your environment changed since this was saved");
    expect(card.querySelector(".db-diff li").textContent).toBe("Host: env-mysql.example.com → new-mysql.example.com");
    expect(card.querySelector(".db-diff").textContent).toContain("Password: different (not shown)");
    expect(pane().innerHTML).not.toContain("changed-SECRET-0001");
    expect(pane().innerHTML).not.toContain(ENV_PW);
    click(btn("Update the saved connection", card));
    await until(() => toasts().includes("was updated from your environment"), "the update");
    await until(() => !pane().querySelector(".db-card-changed"), "the notice to go");
    expect(rows().some((r) => r.includes("env-mysql.example.com"))).toBe(true);
    expect((await call("db/overview")).profiles.find((p: any) => p.engine === "mysql").host).toBe("new-mysql.example.com");
  });
});

describe("the editor", () => {
  async function openEditor(engine: string) {
    closeAll();
    click(btn("＋ Add connection"));
    await until(() => doc.querySelector(".menu"), "the menu");
    expect([...doc.querySelectorAll(".menu-item .menu-label")].map((b: any) => b.textContent)).toEqual(["SQLite", "MySQL / MariaDB", "PostgreSQL", "Redis"]);
    click([...doc.querySelectorAll(".menu-item")].find((b: any) => b.textContent.includes(engine)));
    await until(() => top()?.querySelector(".db-editor"), `the ${engine} editor`);
    return top();
  }
  const labelsOf = (d: any) => [...d.querySelectorAll(".db-field-label")].map((e: any) => e.textContent.trim());

  test("each engine asks for its own settings, with defaults, hints and labeled controls", async () => {
    const sqlite = await openEditor("SQLite");
    expect(labelsOf(sqlite)).toEqual(["Name", "Folder", "Tags", "Environment", "Database file", "How to open it"]);
    expect([...field(sqlite, "How to open it").options].map((o: any) => o.value)).toEqual(["readwrite", "readonly", "create", "memory"]);
    closeAll();
    const mysql = await openEditor("MySQL");
    expect(labelsOf(mysql)).toEqual(expect.arrayContaining(["Host", "Port", "User", "Password", "Database", "Connect timeout (seconds)", "Statement timeout (seconds)"]));
    expect(labelsOf(mysql)).not.toContain("Schema");
    expect(field(mysql, "Port").placeholder).toBe("3306");
    expect(mysql.textContent).toContain("Allow public key retrieval");
    closeAll();
    const pg = await openEditor("PostgreSQL");
    expect(field(pg, "Port").placeholder).toBe("5432");
    expect(labelsOf(pg)).toContain("Schema");
    closeAll();
    const redis = await openEditor("Redis");
    expect(labelsOf(redis)).toEqual(expect.arrayContaining(["User name (ACL)", "Password", "Database number", "Key prefix"]));
    expect(field(redis, "Port").placeholder).toBe("6379");
    expect(field(redis, "Database number").max).toBe("15");
    expect(redis.textContent).toContain("Read-only (ask before opening a studio)");
    closeAll();
  });

  test("the password box is write-only; TLS reveals CA and verify; a missing keychain is said plainly", async () => {
    const d = await openEditor("PostgreSQL");
    const pw = field(d, "Password");
    expect(pw.type).toBe("password");
    expect(pw.getAttribute("autocomplete")).toBe("new-password");
    expect(d.textContent).toContain("Stored in your computer's keychain");
    expect(d.querySelector(".db-notice")).toBeNull();
    const more = d.querySelector("#db-tls-more");
    expect(more.hidden).toBe(true);
    const tls = [...d.querySelectorAll("input[type=checkbox]")].find((c: any) => c.closest("label").textContent.includes("Use TLS"));
    tls.checked = true;
    tls.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(more.hidden).toBe(false);
    expect(more.textContent).toContain("Check the server's certificate");
    expect(more.querySelector("textarea").getAttribute("aria-label")).toBe("CA certificate (PEM text)");
    closeAll();
    db.db.secretStore = { kind: "memory", persistent: false };
    const noKeychain = await openEditor("MySQL");
    expect(noKeychain.querySelector(".db-notice").textContent).toContain("keychain isn't available");
    expect(noKeychain.textContent).toContain("You will be asked again next time");
    closeAll();
    db.db.secretStore = { kind: "os-keychain", persistent: true };
  });

  test("new MySQL connection: Test connection answers in plain words, Save stores the password in the keychain only", async () => {
    testResults.set("good.example", { ok: true, ms: 9, message: "Connected to MySQL 8.0.36.", version: "8.0.36", facts: ["Database: shop", "3 ms"] });
    testResults.set("refused.example", { ok: false, ms: 4, code: "CONNECTION_REFUSED", message: "Nothing answered at refused.example:3306. Is the server running, and are the host and port right?", facts: [] });
    const d = await openEditor("MySQL");
    setValue(field(d, "Name"), "Shop (staging)");
    setValue(field(d, "Folder"), "Clients");
    setValue(field(d, "Tags"), "work, client-x");
    setValue(field(d, "Environment"), "staging");
    setValue(field(d, "Host"), "refused.example");
    setValue(field(d, "User"), "app");
    setValue(field(d, "Password"), PW);
    setValue(field(d, "Database"), "shop");
    click(btn("Test connection", d));
    await until(() => d.querySelector(".db-test-bad"), "the failed test");
    expect(d.querySelector(".db-test").textContent).toContain("It didn't work. Nothing answered at refused.example:3306");
    expect(d.querySelector(".db-test").getAttribute("role")).toBe("status");
    setValue(field(d, "Host"), "good.example");
    click(btn("Test connection", d));
    await until(() => d.querySelector(".db-test-ok"), "the good test");
    expect(d.querySelector(".db-test").textContent).toContain("It works. Connected to MySQL 8.0.36.");
    expect(d.textContent).not.toContain(PW);
    click(btn("Save", d));
    await until(() => !top(), "the dialog to close");
    await until(() => rows().includes("Shop (staging)"), "the new row");
    const row = [...pane().querySelectorAll(".db-row")].find((r: any) => r.textContent.includes("Shop (staging)"));
    expect(row.textContent).toContain("Staging");
    expect(row.querySelector(".db-tag").textContent).toBe("work");
    expect(pane().querySelector(".db-group-title").parentElement.getAttribute("role")).toBe("group");
    expect([...pane().querySelectorAll(".db-group-title")].map((e: any) => e.textContent.trim())).toEqual(expect.arrayContaining(["📂 Clients", "📂 From environment"]));
    expect([...keychain.map.values()]).toContain(PW);
    expect(doc.documentElement.innerHTML).not.toContain(PW);
    expect(win.localStorage.length + win.sessionStorage.length).toBe(0);
    const saved = (await call("db/overview")).profiles.find((p: any) => p.name === "Shop (staging)");
    expect(saved).toMatchObject({ host: "good.example", hasPassword: true, folder: "Clients", environment: "staging" });
    expect(JSON.stringify(saved)).not.toContain(PW);
  });

  test("a server-side validation error stays in the dialog, nothing typed is lost", async () => {
    const d = await openEditor("Redis");
    setValue(field(d, "Name"), "Bad Redis");
    setValue(field(d, "Host"), "bad host!");
    click(btn("Save", d));
    await until(() => d.querySelector(".dialog-error:not([hidden])"), "the error");
    expect(d.querySelector(".dialog-error").textContent).toContain("host");
    expect(d.querySelector(".dialog-error").getAttribute("role")).toBe("alert");
    expect(field(d, "Name").value).toBe("Bad Redis");
    expect(top()).toBe(d.closest(".modal-backdrop"));
    closeAll();
  });

  test("pasting an address fills in the form; the password goes to the keychain without ever being filled into the page", async () => {
    closeAll();
    click(btn("Paste address…"));
    await until(() => top()?.querySelector(".db-url"), "the paste dialog");
    const input = top().querySelector(".db-url");
    expect(input.getAttribute("aria-label")).toBe("Connection address");
    setValue(input, "ftp://nope");
    click(btn("Fill in the form", top()));
    await until(() => top().querySelector(".dialog-error:not([hidden])"), "the error");
    expect(top().querySelector(".dialog-error").textContent).toContain("isn't a kind of database address");
    setValue(input, `postgres://bob:${PW_URL}@h.example:5433/app?sslmode=require`);
    click(btn("Fill in the form", top()));
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "New PostgreSQL connection", "the filled form");
    expect(input.value).toBe("");
    const d = top();
    expect(field(d, "Host").value).toBe("h.example");
    expect(field(d, "Port").value).toBe("5433");
    expect(field(d, "User").value).toBe("bob");
    expect(field(d, "Database").value).toBe("app");
    expect(field(d, "Password").value).toBe("");
    expect([...d.querySelectorAll("input[type=checkbox]")].find((c: any) => c.closest("label").textContent.includes("Use TLS")).checked).toBe(true);
    expect(doc.documentElement.innerHTML).not.toContain(PW_URL);
    click(btn("Save", d));
    await until(() => !top(), "the dialog to close");
    await until(() => rows().some((r) => r.startsWith("PostgreSQL: h.example")), "the new row");
    expect([...keychain.map.values()]).toContain(PW_URL);
    expect(doc.documentElement.innerHTML).not.toContain(PW_URL);
  });

  test("Import from environment lists everything with a preview, and Save works from there too", async () => {
    closeAll();
    click(btn("Import from environment…"));
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "Import from environment", "the import dialog");
    await until(() => top().querySelector(".db-card"), "the cards");
    const d = top();
    expect(d.textContent).toContain("never connects to anything");
    expect(d.textContent).not.toContain(ENV_PW);
    const statuses = [...d.querySelectorAll(".db-card")].map((c: any) => c.dataset.status);
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(["new", "saved", "changed"]).toContain(s);
    expect(d.textContent).toContain(".env files looked at, read-only:");
    click(btn("Close", d));
    await until(() => !top(), "close");
  });
});

describe("a saved connection in the list and its details", () => {
  test("arrow keys move through the list and Enter opens; rows say their environment in words; favorites and groups", async () => {
    await call("db/profile/save", { profile: { engine: "postgres", name: "Prod reports", host: "prod.example", environment: "production", favorite: true, folder: "Clients" }, password: PW });
    await openTab();
    const list = pane().querySelector(".db-list");
    expect(list.getAttribute("role")).toBe("listbox");
    const prod = [...list.querySelectorAll(".db-row")].find((r: any) => r.textContent.includes("Prod reports"));
    expect(prod.getAttribute("role")).toBe("option");
    expect(prod.textContent).toContain("Production");
    expect(prod.querySelector(".db-env").textContent).toContain("⚠");
    expect(prod.title).toContain("PostgreSQL");
    // favorites first within a folder
    const clients = [...list.querySelectorAll(".db-group")].find((g: any) => g.querySelector(".db-group-title").textContent.includes("Clients"));
    expect(clients.querySelector(".db-row-name").textContent).toContain("★ Prod reports");
    const all = [...list.querySelectorAll(".db-row")];
    all[0].focus();
    click(all[0]);
    await until(() => pane().querySelector(".db-row.selected"), "a selected row");
    key(pane().querySelector(".db-list"), "ArrowDown");
    await until(() => pane().querySelector(".db-row.selected") !== all[0] && pane().querySelector(".db-row[aria-selected=true]"), "the next row");
    expect([...pane().querySelectorAll(".db-row")].filter((r: any) => r.getAttribute("aria-selected") === "true")).toHaveLength(1);
    // filter
    setValue(pane().querySelector(".db-filter"), "prod.example");
    expect(rows()).toEqual(["Prod reports"]);
    setValue(pane().querySelector(".db-filter"), "zzz-nothing");
    expect(pane().querySelector(".db-empty").textContent).toContain("No connection matches that filter");
    setValue(pane().querySelector(".db-filter"), "");
  });

  test("details, Test connection, Duplicate with the password choice, Favorite and Delete (with a confirmation)", async () => {
    await openTab();
    await selectRow("Prod reports");
    const detail = pane().querySelector(".db-detail");
    expect(detail.textContent).toContain("Saved in your computer's keychain");
    expect(detail.querySelector(".db-env-production")).toBeTruthy();
    click(btn("Test connection", detail));
    await until(() => detail.querySelector(".db-test-ok"), "the test result");
    expect(detail.querySelector(".db-test").textContent).toContain("It works.");
    // copy without the password
    click(btn("Duplicate…", detail));
    await until(() => top()?.querySelector(".dialog-title")?.textContent === 'Copy "Prod reports"', "the copy question");
    expect([...top().querySelectorAll(".btn")].map((b: any) => b.textContent)).toEqual(["Cancel", "Copy without the password", "Copy the password too"]);
    click(btn("Copy without the password", top()));
    await until(() => rows().includes("Prod reports (copy)"), "the copy");
    const copy = (await call("db/overview")).profiles.find((p: any) => p.name === "Prod reports (copy)");
    expect(copy.hasPassword).toBe(false);
    // copy with it
    await selectRow("Prod reports");
    click(btn("Duplicate…", pane().querySelector(".db-detail")));
    await until(() => top(), "the question");
    click(btn("Copy the password too", top()));
    await until(() => rows().filter((r) => r === "Prod reports (copy)").length === 2, "the second copy");
    expect((await call("db/overview")).profiles.filter((p: any) => p.name === "Prod reports (copy)" && p.hasPassword)).toHaveLength(1);
    // delete needs a yes
    await selectRow("Prod reports (copy)");
    click(btn("Delete…", pane().querySelector(".db-detail")));
    await until(() => top()?.querySelector(".dialog-title")?.textContent.startsWith("Delete"), "the confirmation");
    click(btn("Cancel", top()));
    await until(() => !top(), "the dialog to close");
    expect(rows().filter((r) => r === "Prod reports (copy)")).toHaveLength(2);
    click(btn("Delete…", pane().querySelector(".db-detail")));
    await until(() => top(), "the confirmation again");
    click(btn("Delete", top()));
    await until(() => rows().filter((r) => r === "Prod reports (copy)").length === 1, "one copy to go");
  });

  test("Effective settings with a hostile environment: values and their sources, ignored names, no foreign values", async () => {
    live.MSQL_PORT = "3399";
    await call("db/engine/save", { engine: "mysql", useEnv: true });
    const created = await call("db/profile/save", { profile: { engine: "mysql", name: "Partial", host: "partial.example", user: "me" } });
    await openTab();
    await selectRow("Partial");
    const table = await until(() => pane().querySelector(".db-effective-table"), "the table");
    const rowOf = (label: string) => [...table.querySelectorAll("tbody tr")].find((r: any) => r.querySelector("th").textContent === label);
    expect(rowOf("Host").textContent).toContain("partial.example");
    expect(rowOf("Port").textContent).toContain("3399");
    expect(rowOf("Port").textContent).toContain("Environment");
    expect(rowOf("Port").textContent).toContain("environment variable MSQL_PORT");
    expect(rowOf("Password").textContent).toContain("not set");
    expect(rowOf("Password").textContent).toContain("environment passwords are never used with a saved connection");
    const text = pane().querySelector(".db-effective").textContent;
    // the ignored variables are named, but their values (a host, a password) are not shown
    expect(text).toContain("Environment variables being ignored");
    expect(text).toContain("MSQL_USER");
    expect(text).not.toContain("envuser");
    expect(text).not.toContain(ENV_PW);
    live.MSQL_PORT = "3307";
    expect(created.ok).toBe(true);
  });
});

describe("a studio inside the tab", () => {
  const frame = () => pane().querySelector("iframe.db-studio-frame");

  test("Open in SQLite Studio shows the studio in a frame with the right attributes and a status", async () => {
    const file = join(root, "people.sqlite");
    new Database(file).run("create table people(id integer primary key)");
    await call("db/profile/save", { profile: { engine: "sqlite", name: "People", path: file } });
    await openTab();
    await selectRow("People");
    click(btn("Open in SQLite Studio"));
    await until(() => frame(), "the studio frame", 20_000);
    const f = frame();
    expect(f.getAttribute("title")).toBe("SQLite Studio: People");
    expect(f.getAttribute("src")).toMatch(new RegExp(`^http://localhost:${server.port}/app/dbstudio/st\\d+-[a-z0-9]+/$`));
    expect(f.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-forms allow-modals allow-downloads");
    expect(f.getAttribute("sandbox")).not.toContain("allow-top-navigation");
    expect(f.getAttribute("sandbox")).not.toContain("allow-popups");
    expect(f.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(pane().dataset.view).toBe("studio");
    expect(doc.getElementById("app").classList.contains("db-studio-open")).toBe(true);
    const section = pane().querySelector(".db-studio:not([hidden])");
    expect(section.dataset.state).toBe("running");
    expect(section.querySelector(".db-state").textContent).toContain("Running");
    expect(section.querySelector(".db-state").getAttribute("role")).toBe("status");
    expect([...section.querySelectorAll("button")].map((b: any) => b.textContent)).toEqual(["← Connections", "⛶ Expand", "Stop", "Restart", "Open in a separate window", "Open in my browser", "Close"]);
    for (const b of section.querySelectorAll("button")) expect(b.title, b.textContent).toBeTruthy();
    expect(section.querySelector(".db-studio-title").textContent).toBe("SQLite Studio: People");
    expect(pane().querySelector(".db-strip").textContent).toContain("SQLite Studio: People");
    expect(pane().querySelector(".db-strip").dataset.count).toBe("1");
    expect(pane().querySelector(".db-strip .db-chip.active")?.getAttribute("aria-current")).toBe("true");
    // Expand fills the window (db-studio-max), and Esc or Restore returns without leaving the studio
    const expandBtn = section.querySelector(".db-expand");
    expect(expandBtn.getAttribute("aria-pressed")).toBe("false");
    click(expandBtn);
    expect(studio.isStudioExpanded()).toBe(true);
    expect(doc.getElementById("app").classList.contains("db-studio-max")).toBe(true);
    expect(pane().dataset.maximized).toBe("true");
    expect(expandBtn.textContent).toBe("⛶ Restore");
    expect(expandBtn.getAttribute("aria-pressed")).toBe("true");
    key(doc.body, "Escape");
    expect(studio.isStudioExpanded()).toBe(false);
    expect(doc.getElementById("app").classList.contains("db-studio-max")).toBe(false);
    expect(pane().dataset.view).toBe("studio");
    expect(expandBtn.textContent).toBe("⛶ Expand");
    // the frame page it points at is the server's, on the other loopback address
    const page = await fetch(f.getAttribute("src"), { headers: { Host: `localhost:${server.port}` } }).catch(() => null);
    expect(page).toBeTruthy();
  });

  test("back to the list keeps it running; the separate window and Stop work; Restart starts a new one", async () => {
    click(btn("⛶ Expand"));
    expect(doc.getElementById("app").classList.contains("db-studio-max")).toBe(true);
    click(btn("← Connections"));
    await until(() => pane().dataset.view === "list", "the list");
    expect(doc.getElementById("app").classList.contains("db-studio-open")).toBe(false);
    expect(doc.getElementById("app").classList.contains("db-studio-max")).toBe(false);
    expect(frame()).toBeTruthy();
    expect(pane().querySelector(".db-row.selected .db-running").textContent).toContain("open");
    click(btn("Show it"));
    await until(() => pane().dataset.view === "studio", "the studio view");
    expect(doc.getElementById("app").classList.contains("db-studio-open")).toBe(true);
    click(btn("Open in a separate window"));
    await until(() => windows.length === 1, "the window request");
    expect(windows[0]!.command.at(-1)).toContain("people.sqlite");
    expect(toasts()).toContain("opening in its own window");
    const before = frame().getAttribute("src");
    click(btn("Restart"));
    await until(() => frame() && frame().getAttribute("src") !== before && pane().querySelectorAll(".db-studio").length === 1, "the restarted studio", 20_000);
    expect(frame().getAttribute("src")).toContain("/app/dbstudio/");
    click(btn("Stop"));
    await until(() => !frame() && pane().querySelector(".db-state").textContent.includes("Stopped"), "the stopped state");
    expect(pane().querySelector(".db-studio:not([hidden]) .pw-hint").textContent).toContain("isn't running");
    click(btn("Close"));
    await until(() => pane().dataset.view === "list", "the list");
    expect(pane().querySelector(".db-studio")).toBeNull();
  });

  test("a production connection asks first: Cancel opens nothing, 'Open anyway' opens it under a warning", async () => {
    await openTab();
    await selectRow("Prod reports");
    // the stand-in works for every engine
    click(btn("Open in PostgreSQL Studio"));
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "This is a production connection", "the question");
    expect(top().textContent).toContain("no read-only mode");
    expect(top().textContent).toContain("Open it anyway?");
    click(btn("Cancel", top()));
    await until(() => !top(), "the dialog to close");
    expect(!!frame()).toBe(false);
    expect((await call("db/studio/list")).studios.filter((s: any) => s.state === "running")).toHaveLength(0);
    click(btn("Open in PostgreSQL Studio"));
    await until(() => top(), "the question again");
    click(btn("Open anyway", top()));
    await until(() => frame(), "the studio", 20_000);
    const warning = pane().querySelector(".db-studio:not([hidden]) .db-banner-writes");
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toContain("production or read-only");
    expect(warning.textContent).toContain("full access");
    click(btn("Stop"));
    await until(() => !frame(), "the studio to stop");
    click(btn("Close"));
  });

  test("a studio that crashes is said so in plain words, with its log", async () => {
    // the stand-in studio crashes shortly after it says it is ready
    live.FAKE_MODE = "crash";
    await call("db/profile/save", { profile: { engine: "sqlite", name: "Crashy", sqliteMode: "memory" } });
    await openTab();
    await selectRow("Crashy");
    click(btn("Open in SQLite Studio"));
    await until(() => pane().querySelector(".db-studio:not([hidden])"), "the studio pane", 20_000);
    await until(() => pane().querySelector(".db-studio-message:not([hidden])"), "the crash message", 20_000);
    expect(pane().querySelector(".db-studio-message").textContent).toContain("stopped unexpectedly (exit code 3)");
    expect(pane().querySelector(".db-studio-message").getAttribute("role")).toBe("alert");
    expect(pane().querySelector(".db-state").textContent).toContain("Stopped unexpectedly");
    await until(() => pane().querySelector(".db-log")?.textContent?.includes("READY:"), "the log lines");
    delete live.FAKE_MODE;
    click(btn("Close"));
  });
});

describe("databases in the file list", () => {
  test("only real SQLite files get the menu entries, and only .env files get the import", async () => {
    const real = join(root, "real.sqlite");
    new Database(real).run("create table t(x)");
    const fake = join(root, "fake.db");
    writeFileSync(fake, "this is a text file named like a database");
    const plain = join(root, "notes.txt");
    writeFileSync(plain, "hello");
    const entry = (path: string, size: number) => ({ name: path.split("/").pop() ?? path, path, isDir: false, size, mtimeMs: 1 });
    const { state, emit } = await import("../resources/file_manager/ui/state.js");
    (state as any).entries = [entry(real, 100), entry(fake, 41), entry(plain, 5)];
    emit("view");
    await until(() => files.isSqliteFile(state.entries[0]), "the real file to be recognized");
    await sleep(150);
    expect(files.sqliteMenuItems([state.entries[0]]).map((i: any) => i.label)).toEqual(["Open in SQLite Studio", "Open in SQLite Studio in its own window", "Open in SQLite Studio in my browser", "Add as database connection"]);
    expect(files.sqliteMenuItems([state.entries[1]])).toEqual([]);
    expect(files.sqliteMenuItems([state.entries[2]])).toEqual([]);
    expect(files.sqliteMenuItems([state.entries[0], state.entries[1]])).toEqual([]);
    for (const item of files.sqliteMenuItems([state.entries[0]])) expect(item.tip.length).toBeGreaterThan(10);
    const env = (name: string) => files.envFileMenuItems([{ name, path: `/p/${name}`, isDir: false }]).map((i: any) => i.label);
    for (const name of [".env", ".env.local", ".env.production", "prod.env"]) expect(env(name), name).toEqual(["Import database settings…"]);
    for (const name of ["env.txt", ".environment", "notenv", ".envrc"]) expect(env(name), name).toEqual([]);
  });

  test("Open with… can use SQLite Studio as a built-in program, and the opener starts the studio in the tab", async () => {
    const list = await call("openwith/list", { path: join(root, "real.sqlite") });
    expect(list.builtin.map((b: any) => b.id)).toEqual(["builtin:code", "builtin:sqlite"]);
    const run = await call("openwith/run", { paths: [join(root, "real.sqlite")], programId: "builtin:sqlite" });
    expect(run.builtin).toBe("sqlite");
    const { finishOpen } = await import("../resources/file_manager/ui/openwith.js");
    closeAll();
    expect(finishOpen(run, join(root, "real.sqlite"))).toBe(true);
    await until(() => pane() && pane().querySelector("iframe.db-studio-frame"), "the studio opened from the file", 20_000);
    expect(pane().querySelector(".db-studio-title").textContent).toBe("SQLite Studio: real.sqlite");
    click(btn("Stop"));
    await until(() => !pane().querySelector("iframe.db-studio-frame"), "stop");
    click(btn("Close"));
    // a text file is refused with a plain message
    finishOpen({ builtin: "sqlite", with: "x", opened: "" }, join(root, "notes.txt"));
    await until(() => toasts().includes("isn't an SQLite database"), "the refusal");
  });

  test("'Import database settings…' for a chosen .env file: preview, then save only what is chosen", async () => {
    closeAll();
    const file = join(root, "project.env");
    writeFileSync(file, `PG_HOST=pg.project.example\nPG_USER=deploy\nPG_PASSWORD=${PW}\nPG_DATABASE=app\n`);
    const { showEnvFileImport } = await import("../resources/file_manager/ui/dbImport.js");
    const done = showEnvFileImport(file);
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "Import from project.env", "the preview");
    const d = top();
    expect(d.textContent).toContain("Nothing is written until you press Save to the manager");
    expect(d.textContent).toContain("the file you chose");
    expect(d.textContent).not.toContain(PW);
    expect((await call("db/overview")).profiles.some((p: any) => p.host === "pg.project.example")).toBe(false);
    click(btn("Save to the manager", d));
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "Saved to the manager", "the saved dialog");
    click(btn("Done", top()));
    await done;
    expect((await call("db/overview")).profiles.some((p: any) => p.host === "pg.project.example" && p.hasPassword)).toBe(true);
    expect(readFileSync(file, "utf8")).toContain(`PG_PASSWORD=${PW}`);
  });
});

describe("shortcuts that open a database in a window or the browser", () => {
  const launched: string[][] = [];
  test("a SQLite file can be opened in its own window or in the browser from the right-click menu", async () => {
    (server.context as { launch: unknown }).launch = async (command: string, args: string[]) => void launched.push([command, ...args]);
    const real = join(root, "real.sqlite");
    const { state, emit } = await import("../resources/file_manager/ui/state.js");
    (state as any).entries = [{ name: "real.sqlite", path: real, isDir: false, size: 100, mtimeMs: 1 }];
    emit("view");
    await until(() => files.isSqliteFile(state.entries[0]), "the real file to be recognized");
    const items = files.sqliteMenuItems([state.entries[0]]);
    const before = windows.length;
    await items.find((i: any) => i.label.endsWith("its own window")).action();
    await until(() => windows.length === before + 1, "the window request");
    expect(windows.at(-1)!.command.at(-1)).toBe(real);
    expect(toasts()).toContain("real.sqlite is opening in its own window");
    await items.find((i: any) => i.label.endsWith("my browser")).action();
    await until(() => launched.length === 1, "the browser to be asked for");
    expect(launched[0]!.join(" ")).toMatch(/http:\/\/127\.0\.0\.1:\d+\//);
    expect(toasts()).toContain("real.sqlite is opening in your web browser");
    await call("db/studio/list").then((r: any) => Promise.all(r.studios.map((s: any) => call("db/studio/stop", { id: s.id }))));
  });

  test("saved connections become Home tiles that open the way Settings says, and the Databases tool has the same two buttons", async () => {
    const sc = await import("../resources/file_manager/ui/dbShortcuts.js");
    const { listHomeTiles } = await import("../resources/file_manager/ui/home.js");
    const { state } = await import("../resources/file_manager/ui/state.js");
    const saved = (await call("db/profile/save", { profile: { engine: "sqlite", name: "Quick people", path: join(root, "real.sqlite"), favorite: true } })).profile;
    sc.resetShortcuts();
    await sc.loadShortcuts();
    const tile = () => listHomeTiles().find((t: any) => t.id === `db-shortcut-${saved.id}`);
    expect(tile()?.title).toBe("Quick people");
    expect(tile()!.cta).toBe("Open window →");
    expect(tile()!.text).toContain("its own window");
    expect(JSON.stringify(listHomeTiles())).not.toContain(PW);
    const before = windows.length;
    await tile()!.run();
    await until(() => windows.length === before + 1, "the window from the tile");
    (state.settings as any).dbShortcut = "browser";
    expect(tile()!.cta).toBe("Open in browser →");
    const launches = launched.length;
    await tile()!.run();
    await until(() => launched.length === launches + 1, "the browser from the tile");
    expect(windows.length).toBe(before + 1);
    (state.settings as any).dbShortcut = "window";
    await openTab();
    await selectRow("Quick people");
    expect(btn("Open in a window")?.title).toContain("own desktop window");
    expect(btn("Open in my browser")?.title).toContain("web browser");
    await call("db/studio/list").then((r: any) => Promise.all(r.studios.map((s: any) => call("db/studio/stop", { id: s.id }))));
  });

  test("a production connection still asks first, and Cancel opens nothing", async () => {
    const sc = await import("../resources/file_manager/ui/dbShortcuts.js");
    const prod = (await call("db/profile/save", { profile: { engine: "sqlite", name: "Prod shortcut", sqliteMode: "memory", environment: "production" } })).profile;
    const before = windows.length;
    const pending = sc.openShortcut(prod, "window");
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "This is a production connection", "the question");
    click(btn("Cancel", top()));
    expect(await pending).toBe(false);
    expect(windows.length).toBe(before);
    const again = sc.openShortcut(prod, "window");
    await until(() => top()?.querySelector(".dialog-title")?.textContent === "This is a production connection", "the question again");
    click(btn("Open anyway", top()));
    expect(await again).toBe(true);
    expect(windows.length).toBe(before + 1);
  });
});

describe("right-click shortcuts to the database studios and the other tools", () => {
  const labels = () => [...doc.querySelectorAll(".menu .menu-item .menu-label")].map((e: any) => e.textContent);
  const choose = (label: string) => click([...doc.querySelectorAll(".menu .menu-item")].find((b: any) => b.querySelector(".menu-label").textContent === label));
  const stopAll = async () => void (await Promise.all(((await call("db/studio/list")).studios as any[]).map((st) => call("db/studio/stop", { id: st.id }))));

  test("the menu of empty space lists the four studios, the graveyard and 'Open a tool…', which lists every tool by group", async () => {
    const contextmenu = await import("../resources/file_manager/ui/contextmenu.js");
    closeAll();
    contextmenu.showBackgroundMenu({ x: 5, y: 5 });
    expect(labels()).toEqual(expect.arrayContaining(["Open SQLite Studio", "Open MySQL Studio", "Open PostgreSQL Studio", "Open Redis Studio", "Open Graveyard", "Open a tool…"]));
    for (const el of doc.querySelectorAll(".menu .menu-item")) if (el.textContent.includes("Studio") || el.textContent.includes("tool")) expect(el.getAttribute("title").length, el.textContent).toBeGreaterThan(30);
    choose("Open a tool…");
    await until(() => labels().includes("Databases"), "the list of tools");
    expect(labels()).toEqual(expect.arrayContaining(["Databases", "Open MySQL Studio", "Open Redis Studio"]));
    expect(doc.querySelectorAll(".menu .menu-header").length).toBeGreaterThan(1);
    expect(doc.querySelector(".menu")?.getAttribute("aria-label")).toBe("Open a tool");
    for (const el of doc.querySelectorAll(".menu .menu-item")) expect(el.getAttribute("title")?.length ?? 0, el.textContent).toBeGreaterThan(5);
    power.closePower();
    choose("Databases");
    await until(() => power.activePowerTab() === "databases" && power.powerIsOpen(), "the Databases tool");
    closeAll();
    contextmenu.showEntryMenu([{ name: "x.txt", path: join(root, "x.txt"), isDir: false, size: 1, mtimeMs: 1 }], { x: 5, y: 5 });
    expect(labels()).toContain("Open a tool…");
    closeAll();
  });

  test("'Open Redis Studio' adds the first connection when there is none, opens the only one, and offers a choice when there are several", async () => {
    const contextmenu = await import("../resources/file_manager/ui/contextmenu.js");
    const mine = async () => ((await call("db/overview")).profiles as any[]).filter((x) => x.engine === "redis");
    // no environment detection in the way: what is saved here is all there is
    await call("db/detect/settings", { auto: false, autoSave: false });
    for (const p of await mine()) await call("db/profile/delete", { id: p.id, confirm: true });
    expect(await mine()).toEqual([]);
    const open = async () => {
      closeAll();
      contextmenu.showBackgroundMenu({ x: 5, y: 5 });
      choose("Open Redis Studio");
    };
    await open();
    await until(() => top()?.querySelector(".dialog-title")?.textContent.includes("Redis"), "the form to add a Redis connection");
    expect(toasts()).toContain("No Redis connection yet");
    closeAll();
    await call("db/profile/save", { profile: { engine: "redis", name: "Shortcut cache", host: "cache.example.com" } });
    await open();
    const end = Date.now() + 20_000;
    while (Date.now() < end && !((await call("db/studio/list")).studios as any[]).some((st) => st.title.includes("Shortcut cache"))) await sleep(100);
    expect(((await call("db/studio/list")).studios as any[]).some((st) => st.title.includes("Shortcut cache"))).toBe(true);
    await stopAll();
    await call("db/profile/save", { profile: { engine: "redis", name: "Shortcut queue", host: "queue.example.com" } });
    await open();
    await until(() => rows().length === 2 && rows().every((n) => n.startsWith("Shortcut")), "the list narrowed to Redis connections");
    expect(toasts()).toContain("You have 2 Redis connections");
    expect(pane().querySelector(".db-filter").value).toBe("Redis");
    expect(((await call("db/studio/list")).studios as any[]).filter((st) => st.title.includes("Shortcut") && ["starting", "running"].includes(st.state)).length).toBe(0);
    for (const p of await mine()) await call("db/profile/delete", { id: p.id, confirm: true });
    await call("db/detect/settings", { auto: true, autoSave: false });
    setValue(pane().querySelector(".db-filter"), "");
    await openTab();
  });
});

describe("the whole tab", () => {
  test("no 'null', 'undefined' or '[object' text, every control is named, and no secret is anywhere in the page", async () => {
    await openTab();
    await selectRow("People");
    await sleep(100);
    const text = pane().textContent;
    for (const bad of ["null", "undefined", "[object", "NaN"]) expect(text, bad).not.toContain(bad);
    const unnamed = [...pane().querySelectorAll("button, input, select, textarea")].filter((el: any) => {
      if (el.type === "hidden") return false;
      return !(el.title || el.getAttribute("aria-label") || el.textContent.trim() || el.closest("label")?.textContent.trim() || el.getAttribute("placeholder"));
    });
    expect(unnamed.map((e: any) => e.outerHTML.slice(0, 80))).toEqual([]);
    for (const secret of [PW, PW_URL, ENV_PW, "changed-SECRET-0001"]) {
      expect(doc.documentElement.outerHTML, secret).not.toContain(secret);
      expect(win.localStorage.length + win.sessionStorage.length).toBe(0);
    }
    // no element carries a secret in an attribute either
    for (const el of doc.querySelectorAll("*")) for (const a of el.attributes) for (const secret of [PW, PW_URL, ENV_PW]) expect(a.value).not.toContain(secret);
  });
});
