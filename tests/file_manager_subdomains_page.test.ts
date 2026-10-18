import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
// @ts-ignore (jsdom has no type declarations in every setup)
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Subdomains tab on the real page modules, in a fake browser (jsdom), against the real server. Nothing reaches the
// network: the server's fetch, DNS, HTTP and TCP calls are replaced, and the page's "copytext" calls are recorded here
// instead of reaching the system clipboard. The fake browser's globals are removed again in afterAll.
const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "MutationObserver", "navigator", "location", "fetch", "CSS", "ResizeObserver"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-subs-ui-"));
const home = join(root, "home");
const work = join(home, "work");
const copied: string[] = [];
const launched: Array<{ command: string; args: string[] }> = [];
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let power: any;
let stateMod: any;
let section: any;
let home_: any;

const json = (text: string, status = 200) => new Response(text, { status, headers: { "content-type": "application/json" } });
type Route = (url: URL) => Response | Promise<Response>;
const world: { routes: Record<string, Route>; resolve: (h: string) => Promise<string[]>; http: (r: any) => Promise<any>; tcp: (ip: string, port: number) => Promise<boolean>; calls: string[] } = {
  routes: {}, resolve: async () => [], http: async () => ({ status: 200, body: "" }), tcp: async () => false, calls: [],
};
const hostsOf = (...names: string[]) => JSON.stringify(names);
/** What each source says for the domain that was asked about (so any test domain works). */
const names = (domain: string, ...labels: string[]) => labels.map((l) => `${l}.${domain}`);
function reset() {
  world.calls = [];
  world.routes = {
    "crt.sh": (u) => { const d = (u.searchParams.get("q") ?? "").slice(2); return json(JSON.stringify([{ name_value: names(d, "www", "mail").join("\n") }])); },
    "api.hackertarget.com": (u) => { const d = u.searchParams.get("q") ?? ""; return new Response(`api.${d},1.2.3.4\nshop.${d},1.2.3.5\n`); },
    "otx.alienvault.com": (u) => { const d = u.pathname.split("/")[5] ?? ""; return json(JSON.stringify({ passive_dns: [{ hostname: `cdn.${d}` }] })); },
    "jonlu.ca": (u) => json(hostsOf(...names(u.pathname.split("/").pop() ?? "", "www", "blog"))),
  };
  world.resolve = async () => ["93.184.216.34"];
  world.http = async () => ({ status: 200, body: "<title>Hello</title>" });
  world.tcp = async () => false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => any, what: string, ms = 8000): Promise<any> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(2);
  }
}
const pane = (): any => doc.getElementById("power-pane-subs");
const q = (sel: string): any => pane().querySelector(sel);
const qa = (sel: string): any[] => [...pane().querySelectorAll(sel)];
const btn = (text: string): any => qa("button").find((b) => b.textContent.trim().includes(text));
const field = (label: string): any => pane().querySelector(`[aria-label="${label}"]`);
const fire = (el: any, type: string) => el.dispatchEvent(new win.Event(type, { bubbles: true }));
const type = (el: any, value: string) => { el.value = value; fire(el, "input"); };
const tick = (el: any, on = true) => { if (el.checked !== on) { el.checked = on; fire(el, "change"); } };
const rows = (): any[] => qa(".subs-table tbody tr[data-host]");
const hostsShown = () => rows().map((r) => r.dataset.host as string);
const cell = (tr: any, i: number) => tr.children[i].textContent as string;
const message = () => q(".subs-message");
const toasts = () => [...doc.querySelectorAll("#toasts .toast")].map((t: any) => t.textContent as string).join(" | ");
const sourceRow = (id: string): any => pane().querySelector(`.subs-source[data-source="${id}"]`);
const isRunning = () => pane().getAttribute("aria-busy") === "true";
const idle = () => until(() => !isRunning(), "the run to finish", 15_000);
const state = (id: string) => sourceRow(id).dataset.state as string;
const lastCopy = () => copied.at(-1) ?? "";
async function copyWith(label: string) {
  const before = copied.length;
  btn(label).click();
  await until(() => copied.length > before, `a copy from ${label}`, 2000);
  return lastCopy();
}
/** Puts the form back to its starting state, so a test doesn't depend on what the one before it left behind. */
function cleanForm() {
  for (const name of ["Resolve DNS", "Probe HTTP/HTTPS", "Probe ports", "Detect wildcard DNS", "Keep these results"]) tick(qa("label.subs-check").find((l) => l.textContent.includes(name)).querySelector("input"), false);
  type(field("Narrow these results"), "");
  for (const label of ["Filter by IP address", "Filter by web status", "Filter by source"]) { field(label).value = "any"; fire(field(label), "input"); }
  tick(qa("label.subs-check").find((l) => l.textContent.includes("Only live")).querySelector("input"), false);
  doc.querySelector("#toasts").replaceChildren();
}
async function run(domain: string, setup: () => void = () => {}) {
  cleanForm();
  type(field("Domain to look up"), domain);
  setup();
  btn("Find subdomains").click();
  await until(() => isRunning() || Boolean(toasts()), "the run to start", 4000);
  await idle();
}
const sourcesOnly = (...ids: string[]) => {
  for (const input of qa(".subs-source input")) tick(input, !input.disabled && ids.includes(input.closest(".subs-source").dataset.source));
};

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false }));
  mkdirSync(work, { recursive: true });
  reset();
  server = startFileManagerServer({
    port: 0, token: "ui-token",
    context: {
      home, dataDir: join(root, "data"), toolDirs: [join(root, "no-tools")], launch: async (command, args) => void launched.push({ command, args }),
      subdomains: {
        fetch: async (url) => { world.calls.push(url); const route = world.routes[new URL(url).hostname]; return route ? route(new URL(url)) : new Response("nope", { status: 404 }); },
        resolve: (h: string) => world.resolve(h), http: (r: any) => world.http(r), tcp: (ip: string, p: number) => world.tcp(ip, p),
      },
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch" && x !== "CSS" && x !== "ResizeObserver")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  Object.defineProperty(g, "CSS", { value: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") }, configurable: true, writable: true });
  Object.defineProperty(g, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", {
    value: async (u: any, o: any) => {
      if (typeof u === "string" && u.endsWith("/api/copytext")) {
        copied.push(JSON.parse(o.body).text);
        return new Response(JSON.stringify({ ok: true, copied: true }), { headers: { "Content-Type": "application/json" } });
      }
      return realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o);
    },
    configurable: true, writable: true,
  });
  doc = win.document;
  stateMod = await import("../resources/file_manager/ui/state.js");
  stateMod.state.location = { kind: "folder", path: work };
  power = await import("../resources/file_manager/ui/power.js");
  section = await import("../resources/file_manager/ui/copysection.js");
  await import("../resources/file_manager/ui/net.js");
  await import("../resources/file_manager/ui/subs.js");
  home_ = await import("../resources/file_manager/ui/home.js");
  power.wirePower();
  section.startCopySections();
  power.openPower("subs");
  await until(() => qa(".subs-source").length === 5, "the sources to load");
});

afterAll(() => {
  section.stopCopySections();
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const before = saved.get(k);
    if (before) Object.defineProperty(g, k, before);
    else delete g[k];
  }
  mock.restore();
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("the tab and its page", () => {
  test("is a Power tab in the Network group, right after the Network tab, with a Home tile", async () => {
    const tabs = power.listPowerTabs();
    const ids = tabs.map((t: any) => t.id);
    expect(tabs.find((t: any) => t.id === "subs")).toMatchObject({ label: "Subdomains", icon: "🔭", group: "network", groupLabel: "Network" });
    expect(ids.indexOf("subs")).toBe(ids.indexOf("net") + 1);
    const button = doc.getElementById("power-tab-subs");
    expect(button.title).toContain("Subdomains");
    expect(button.getAttribute("aria-selected")).toBe("true");
    const tiles = await import("../resources/file_manager/ui/homeTiles.js");
    tiles.registerHomeTiles();
    const tile = home_.listHomeTiles().find((t: any) => t.id === "tool-subs");
    expect(tile).toMatchObject({ icon: "🔭", title: "Subdomains" });
    expect(tile.text).toContain("you own or may test");
  });

  test("the responsible-use box is there, the active steps are off, and the permission box is hidden", () => {
    const note = q('.subs-warning[role="note"]');
    expect(note.textContent).toContain("domains you own or are allowed to test");
    expect(note.textContent).toContain("never touches the domain");
    expect(note.textContent).toContain("off by default");
    for (const label of ["Resolve DNS", "Probe HTTP/HTTPS", "Probe ports", "Detect wildcard DNS", "Allow private/internal addresses", "Accept untrusted HTTPS certificates", "Keep these results"]) {
      const box = qa("label.subs-check").find((l) => l.textContent.includes(label)).querySelector("input");
      expect(box.checked, label).toBe(false);
    }
    expect(q(".subs-permission").hidden).toBe(true);
    expect(qa(".subs-step .pw-hint").map((p) => p.textContent).join(" ")).toContain("can look like a port scan");
  });

  test("the sources are listed with notes; the subfinder program is not installed here, with a display-only install hint", () => {
    expect(qa(".subs-source").map((s) => s.dataset.source)).toEqual(["crtsh", "hackertarget", "alienvault", "anubis", "subfinder"]);
    const program = sourceRow("subfinder");
    expect(program.querySelector("input").disabled).toBe(true);
    expect(program.querySelector("input").checked).toBe(false);
    expect(program.textContent).toContain(process.platform === "win32" ? "projectdiscovery/subfinder" : "brew install subfinder");
    expect(program.querySelector(".subs-badge").textContent).toBe("not installed");
    expect(qa(".subs-source input").filter((i) => i.checked)).toHaveLength(4);
    expect(qa(".subs-badge").filter((b) => b.textContent === "ready")).toHaveLength(4);
  });

  test("every control has a visible or ARIA label and a tooltip; no inline styles; no 'null'", () => {
    const controls = qa("button, input, select, textarea");
    expect(controls.length).toBeGreaterThan(30);
    for (const c of controls) {
      expect(c.getAttribute("title") || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
      if (c.tagName !== "BUTTON") expect(c.labels?.length || c.getAttribute("aria-label"), c.outerHTML.slice(0, 120)).toBeTruthy();
      if (c.tagName === "BUTTON") expect(c.getAttribute("title") || c.textContent.trim(), c.outerHTML.slice(0, 120)).toBeTruthy();
    }
    expect(pane().querySelectorAll("[style]").length).toBe(0);
    expect(pane().textContent).not.toMatch(/\bnull\b|\bundefined\b|\[object/);
    expect(q("table").getAttribute("aria-label")).toContain("Subdomains found");
    for (const th of qa("th")) expect(th.querySelector("button").title.length).toBeGreaterThan(10);
  });
});

describe("option checks give plain messages and start nothing", () => {
  const tryRun = async (setup: () => void) => {
    reset();
    setup();
    btn("Find subdomains").click();
    await sleep(120);
    expect(isRunning()).toBe(false);
    expect(world.calls).toEqual([]);
    return message().textContent as string;
  };
  const clean = () => {
    type(field("Domain to look up"), "");
    type(field("Time limit per source in seconds"), "15");
    type(field("Most results to keep"), "2000");
    type(field("DNS lookups at once"), "8");
    type(field("Web checks at once"), "4");
    for (const name of ["Resolve DNS", "Probe HTTP/HTTPS", "Probe ports", "Detect wildcard DNS"]) tick(qa("label.subs-check").find((l) => l.textContent.includes(name)).querySelector("input"), false);
    type(field("Ports to probe"), "80,443");
    sourcesOnly("crtsh", "hackertarget", "alienvault", "anubis");
  };

  test("an empty or invalid domain: the server's plain message is shown next to the box, and the box is marked", async () => {
    clean();
    expect(await tryRun(() => {})).toContain("Type a domain first");
    expect(field("Domain to look up").getAttribute("aria-invalid")).toBe("true");
    reset();
    for (const [bad, words] of [["http://example.com", "web address"], ["co.uk", "shared suffix"], ["127.0.0.1", "IP address"], ["localhost", "this computer"], ["my_site.example.com", "underscore"]] as const) {
      type(field("Domain to look up"), bad);
      btn("Find subdomains").click();
      await until(() => message().textContent.includes(words), `a message about ${bad}`, 3000);
      expect(field("Domain to look up").getAttribute("aria-invalid")).toBe("true");
      expect(isRunning()).toBe(false);
    }
    expect(world.calls).toEqual([]);
    type(field("Domain to look up"), "example.com");
    expect(message().hidden).toBe(true);
  });

  test("numbers out of range, no sources, empty ports: each has its own message", async () => {
    clean();
    expect(await tryRun(() => { type(field("Domain to look up"), "example.com"); type(field("Time limit per source in seconds"), "2"); })).toContain("from 3 to 60 seconds");
    expect(field("Time limit per source in seconds").getAttribute("aria-invalid")).toBe("true");
    clean();
    expect(await tryRun(() => { type(field("Domain to look up"), "example.com"); type(field("Most results to keep"), "10001"); })).toContain("from 1 to 10000");
    clean();
    expect(await tryRun(() => { type(field("Domain to look up"), "example.com"); type(field("DNS lookups at once"), "11"); })).toContain("from 1 to 10");
    clean();
    expect(await tryRun(() => { type(field("Domain to look up"), "example.com"); type(field("Web checks at once"), "6"); })).toContain("from 1 to 5");
    clean();
    expect(await tryRun(() => { type(field("Domain to look up"), "example.com"); type(field("Time limit per source in seconds"), "abc"); })).toContain("whole number");
    clean();
    expect(await tryRun(() => { type(field("Domain to look up"), "example.com"); sourcesOnly(); })).toContain("at least one source");
    clean();
    expect(await tryRun(() => { type(field("Domain to look up"), "example.com"); tick(qa("label.subs-check").find((l) => l.textContent.includes("Probe ports")).querySelector("input")); type(field("Ports to probe"), ""); })).toContain("Type the ports to probe");
    clean();
    const bad = await tryRun(() => { type(field("Domain to look up"), "example.com"); tick(qa("label.subs-check").find((l) => l.textContent.includes("Probe ports")).querySelector("input")); type(field("Ports to probe"), "80;443"); tick(qa("label.subs-check").find((l) => l.textContent.includes("Probe ports")).querySelector("input")); tick(qa("label.subs-check").find((l) => l.textContent.includes("Probe ports")).querySelector("input")); });
    expect(bad).toMatch(/permission|Type the ports|isn't a valid port/);
    clean();
  });
});

describe("ownership confirmation for the active steps", () => {
  const box = (name: string) => qa("label.subs-check").find((l) => l.textContent.includes(name)).querySelector("input");
  const permissionBox = () => q(".subs-permission input");
  const fresh = () => {
    reset();
    type(field("Domain to look up"), "");
    for (const name of ["Resolve DNS", "Probe HTTP/HTTPS", "Probe ports", "Detect wildcard DNS"]) tick(box(name), false);
    sourcesOnly("anubis");
  };

  test("ticking an active step reveals the box; probing and the wildcard check switch DNS on; DNS off switches them off", () => {
    fresh();
    expect(q(".subs-permission").hidden).toBe(true);
    expect(box("Allow private/internal addresses").disabled).toBe(true);
    tick(box("Probe HTTP/HTTPS"));
    expect(box("Resolve DNS").checked).toBe(true);
    expect(q(".subs-permission").hidden).toBe(false);
    expect(box("Allow private/internal addresses").disabled).toBe(false);
    expect(box("Accept untrusted HTTPS certificates").disabled).toBe(false);
    tick(box("Detect wildcard DNS"));
    tick(box("Probe ports"));
    expect(field("Ports to probe").disabled).toBe(false);
    tick(box("Resolve DNS"), false);
    for (const name of ["Probe HTTP/HTTPS", "Probe ports", "Detect wildcard DNS"]) expect(box(name).checked, name).toBe(false);
    expect(q(".subs-permission").hidden).toBe(true);
    expect(box("Accept untrusted HTTPS certificates").disabled).toBe(true);
    expect(field("Ports to probe").disabled).toBe(true);
  });

  test("without the tick nothing runs; with it the run starts, and the tick is remembered for that domain only", async () => {
    fresh();
    type(field("Domain to look up"), "mine.example.org");
    tick(box("Resolve DNS"));
    expect(permissionBox().checked).toBe(false);
    btn("Find subdomains").click();
    await sleep(100);
    expect(isRunning()).toBe(false);
    expect(message().textContent).toContain("I own this domain or have permission");
    expect(permissionBox().getAttribute("aria-invalid")).toBe("true");
    expect(world.calls).toEqual([]);
    tick(permissionBox());
    expect(message().hidden).toBe(true);
    doc.querySelector("#toasts").replaceChildren();
    btn("Find subdomains").click();
    await until(() => isRunning() || Boolean(toasts()), "the run");
    await idle();
    expect(rows().length).toBe(2);
    expect(q(".subs-permission p.pw-hint").textContent).toContain("Remembered for mine.example.org");
    // the same domain again: already ticked, no new question
    doc.querySelector("#toasts").replaceChildren();
    btn("Find subdomains").click();
    await until(() => isRunning() || Boolean(toasts()), "the second run");
    await idle();
    expect(message().hidden).toBe(true);
    // another domain: asked again; a passive run never asks
    type(field("Domain to look up"), "someone-else.example.net");
    expect(permissionBox().checked).toBe(false);
    btn("Find subdomains").click();
    await sleep(100);
    expect(isRunning()).toBe(false);
    expect(message().textContent).toContain("I own this domain or have permission");
    tick(box("Resolve DNS"), false);
    doc.querySelector("#toasts").replaceChildren();
    btn("Find subdomains").click();
    await until(() => isRunning() || Boolean(toasts()), "a passive run");
    await idle();
    expect(message().hidden).toBe(true);
    // back to the first domain: still remembered
    type(field("Domain to look up"), "MINE.example.org.");
    tick(box("Resolve DNS"));
    expect(permissionBox().checked).toBe(true);
    tick(box("Resolve DNS"), false);
  });
});

describe("a passive run, live", () => {
  test("shows progress per source, fills the table as sources answer, and ends with counts", async () => {
    reset();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    world.routes["crt.sh"] = async () => { await gate; return json(JSON.stringify([{ name_value: "www.example.com\nmail.example.com" }])); };
    sourcesOnly("crtsh", "hackertarget", "alienvault", "anubis");
    type(field("Domain to look up"), "example.com");
    btn("Find subdomains").click();
    await until(() => state("hackertarget") === "done" && state("anubis") === "done", "the quick sources", 5000);
    // while crt.sh is still being asked, the others' hosts are already in the table
    expect(state("crtsh")).toBe("running");
    expect(sourceRow("crtsh").querySelector(".subs-badge").textContent).toBe("asking…");
    expect(sourceRow("crtsh").querySelector("progress").hidden).toBe(false);
    expect(sourceRow("anubis").querySelector(".subs-badge").textContent).toBe("answered");
    expect(sourceRow("anubis").textContent).toContain("2 hosts");
    await until(() => hostsShown().includes("api.example.com"), "hosts to appear", 4000);
    expect(hostsShown()).not.toContain("mail.example.com");
    expect(pane().querySelector(".subs-progress").hidden).toBe(false);
    expect(q(".pw-row .pw-status").textContent).toMatch(/Sources answered: \d of 4/);
    expect(btn("Find subdomains").disabled).toBe(true);
    expect(btn("Cancel").hidden).toBe(false);
    release();
    await idle();
    expect(state("crtsh")).toBe("done");
    expect(hostsShown().sort()).toEqual(["api.example.com", "blog.example.com", "cdn.example.com", "mail.example.com", "shop.example.com", "www.example.com"]);
    expect(q(".subs-counts").textContent).toBe("6 hosts");
    expect(btn("Find subdomains").disabled).toBe(false);
    expect(btn("Cancel").hidden).toBe(true);
    expect(toasts()).toContain("Done: 6 hosts found");
    expect(q(".subs-shown").textContent).toBe("Looking up example.com");
    const www = rows().find((r) => r.dataset.host === "www.example.com");
    expect(cell(www, 1).split(", ").sort()).toEqual(["anubis", "crtsh"]);
    expect(cell(www, 2)).toBe("—");
    expect(world.calls.filter((u) => u.includes("example.com")).length).toBe(4);
  });

  test("a source that fails shows its own error; the others still deliver", async () => {
    reset();
    world.routes["api.hackertarget.com"] = () => new Response("API count exceeded - Increase Quota with Membership");
    world.routes["otx.alienvault.com"] = () => { throw new TypeError("offline"); };
    await run("example.com");
    expect(state("hackertarget")).toBe("failed");
    expect(sourceRow("hackertarget").querySelector(".subs-source-error").textContent).toContain("daily limit");
    expect(sourceRow("alienvault").querySelector(".subs-source-error").textContent).toContain("couldn't be reached");
    expect(state("crtsh")).toBe("done");
    expect(hostsShown().sort()).toEqual(["blog.example.com", "mail.example.com", "www.example.com"]);
    expect(toasts()).toContain("2 sources didn't answer");
  });

  test("Cancel stops a run that is waiting on a source, keeps what arrived, and frees the Find button", async () => {
    reset();
    world.routes["crt.sh"] = () => new Promise<Response>(() => {});
    type(field("Domain to look up"), "example.com");
    btn("Find subdomains").click();
    await until(() => hostsShown().includes("api.example.com"), "the quick sources");
    expect(isRunning()).toBe(true);
    btn("Cancel").click();
    await idle();
    expect(state("crtsh")).toBe("cancelled");
    expect(sourceRow("crtsh").querySelector(".subs-badge").textContent).toBe("cancelled");
    expect(hostsShown()).toContain("api.example.com");
    expect(toasts()).toContain("Cancelled with");
    expect(btn("Find subdomains").disabled).toBe(false);
  });

  test("leaving the tab does not stop the run; coming back shows it finished", async () => {
    reset();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    world.routes["crt.sh"] = async () => { await gate; return json(JSON.stringify([{ name_value: "late.example.com" }])); };
    type(field("Domain to look up"), "example.com");
    btn("Find subdomains").click();
    await until(() => hostsShown().includes("api.example.com"), "the quick sources");
    power.registerPowerTab({ id: "elsewhere", label: "Elsewhere", icon: "x", tip: "another tool", mount: () => ({}) });
    power.openPower("elsewhere");
    await sleep(100);
    release();
    await sleep(300);
    expect(hostsShown()).not.toContain("late.example.com");
    power.openPower("subs");
    await until(() => hostsShown().includes("late.example.com"), "the table to catch up", 5000);
    await idle();
    expect(state("crtsh")).toBe("done");
  });
});

describe("the results table", () => {
  test("sort by any column (aria-sort follows), filter by text, source, address and web status, Only live, counts", async () => {
    reset();
    world.routes["jonlu.ca"] = () => json(hostsOf("www.t.example.org", "api.t.example.org", "old.t.example.org", "lan.t.example.org", "slow.t.example.org"));
    world.routes["crt.sh"] = () => json(JSON.stringify([{ name_value: "api.t.example.org\nextra.t.example.org" }]));
    world.resolve = async (h) => (h === "old.t.example.org" || h === "extra.t.example.org" ? [] : h === "lan.t.example.org" ? ["10.0.0.5"] : ["93.184.216.34"]);
    world.http = async (r) => ({ status: r.host === "api.t.example.org" ? 404 : r.host === "slow.t.example.org" ? 503 : 200, body: `<title>Page of ${r.host.split(".")[0]}</title>` });
    sourcesOnly("crtsh", "anubis");
    await run("t.example.org", () => { tick(qa("label.subs-check").find((l) => l.textContent.includes("Probe HTTP/HTTPS")).querySelector("input")); tick(q(".subs-permission input")); });
    expect(hostsShown()).toEqual(["api.t.example.org", "extra.t.example.org", "lan.t.example.org", "old.t.example.org", "slow.t.example.org", "www.t.example.org"]);
    expect(q(".subs-counts").textContent).toBe("6 hosts · 4 with an IP address · 3 answered on the web");
    const api = rows()[0];
    expect(cell(api, 3)).toBe("404");
    expect(cell(api, 4)).toBe("Page of api");
    expect(cell(api, 1).split(", ").sort()).toEqual(["anubis", "crtsh"]);
    expect(cell(rows().find((r) => r.dataset.host === "lan.t.example.org"), 0)).toContain("private network address");

    // sorting
    qa("th button").find((b) => b.textContent === "Host").click();
    expect(hostsShown()[0]).toBe("www.t.example.org");
    expect(qa("th").find((t) => t.dataset.key === "host").getAttribute("aria-sort")).toBe("descending");
    qa("th button").find((b) => b.textContent === "Web").click();
    expect(hostsShown().slice(0, 3)).toEqual(["www.t.example.org", "api.t.example.org", "slow.t.example.org"]);
    expect(qa("th").find((t) => t.dataset.key === "web" || t.dataset.key === "status").getAttribute("aria-sort")).toBe("ascending");
    expect(qa("th").find((t) => t.dataset.key === "host").getAttribute("aria-sort")).toBe("none");
    expect(hostsShown().slice(-3)).toEqual(["extra.t.example.org", "lan.t.example.org", "old.t.example.org"]);

    // filters
    const filterText = field("Narrow these results");
    type(filterText, "PAGE OF api");
    await until(() => hostsShown().length === 1, "the text filter");
    expect(hostsShown()).toEqual(["api.t.example.org"]);
    expect(q(".subs-counts").textContent).toContain("1 shown of 6 hosts");
    type(filterText, "");
    await until(() => hostsShown().length === 6, "the filter to clear");
    const set = (el: any, v: string) => { el.value = v; fire(el, "input"); };
    set(field("Filter by web status"), "4xx");
    await until(() => hostsShown().length === 1, "the status filter");
    set(field("Filter by web status"), "none");
    await until(() => hostsShown().length === 3, "the no-answer filter");
    set(field("Filter by web status"), "any");
    set(field("Filter by IP address"), "none");
    await until(() => hostsShown().length === 2, "the no-IP filter");
    expect(hostsShown().sort()).toEqual(["extra.t.example.org", "old.t.example.org"]);
    set(field("Filter by IP address"), "has");
    await until(() => hostsShown().length === 4, "the has-IP filter");
    set(field("Filter by IP address"), "any");
    set(field("Filter by source"), "crtsh");
    await until(() => hostsShown().length === 2, "the source filter");
    expect(hostsShown().sort()).toEqual(["api.t.example.org", "extra.t.example.org"]);
    set(field("Filter by source"), "any");
    const onlyLive = qa("label.subs-check").find((l) => l.textContent.includes("Only live")).querySelector("input");
    tick(onlyLive);
    await until(() => hostsShown().length === 4, "only live");
    expect(hostsShown()).not.toContain("old.t.example.org");
    set(field("Filter by web status"), "5xx");
    set(filterText, "zzz-nothing");
    await until(() => rows().length === 0, "an empty result");
    expect(q(".subs-table tbody").textContent).toContain("Nothing matches the filters");
    tick(onlyLive, false);
    set(field("Filter by web status"), "any");
    set(filterText, "");
    await until(() => hostsShown().length === 6, "everything back");
  });

  test("a big result is drawn 300 rows at a time, and its Copy button still copies every row", async () => {
    reset();
    const many = Array.from({ length: 450 }, (_, i) => `h${String(i).padStart(3, "0")}.big.example.org`);
    world.routes["jonlu.ca"] = () => json(JSON.stringify(many));
    sourcesOnly("anubis");
    await run("big.example.org");
    expect(rows().length).toBe(300);
    expect(q(".subs-counts").textContent).toBe("450 hosts");
    expect(btn("Show 150 more").hidden).toBe(false);
    btn("Show 150 more").click();
    expect(rows().length).toBe(450);
    expect(btn("Show more") ?? btn("more")).toBeTruthy();
    // the table's own Copy button (from the page-wide copy system) copies all of them, not just the drawn rows
    type(field("Narrow these results"), "h4");
    await until(() => rows().length === 50, "the filter");
    await sleep(100);
    section.scanCopySections(pane());
    const table = q(".subs-table");
    expect(qa(".copy-bar").map((b) => b.getAttribute("aria-label")).join("|")).toContain("Subdomains");
    const before = copied.length;
    await section.copySectionNow(table, { title: "Subdomains", format: "tsv" });
    await until(() => copied.length > before, "the table copy", 2000);
    const lines = lastCopy().split("\n");
    expect(lines[0]).toBe("Host\tFound by\tIP addresses\tWeb\tPage title\tOpen ports\tWildcard");
    expect(lines.length).toBe(51);
    type(field("Narrow these results"), "");
    await until(() => rows().length === 450, "the filter to clear");
  });
});

describe("active steps: results and hostile data", () => {
  const checkbox = (name: string) => qa("label.subs-check").find((l) => l.textContent.includes(name)).querySelector("input");
  const evilTitle = "=HYPERLINK(\"http://evil\")<img src=x onerror=\"window.__pwned=1\"><script>window.__pwned=2</script>";

  test("DNS, wildcard flags, web status and title, open ports; private addresses are refused with a plain note; hostile titles stay text", async () => {
    reset();
    world.routes["jonlu.ca"] = () => json(hostsOf("www.act.example.net", "fake.act.example.net", "lan.act.example.net", "evil.act.example.net", "redir.act.example.net"));
    world.resolve = async (h) => ({ "www.act.example.net": ["93.184.216.34"], "fake.act.example.net": ["203.0.113.7"], "lan.act.example.net": ["192.168.1.9"], "evil.act.example.net": ["93.184.216.35"], "redir.act.example.net": ["93.184.216.36"] } as Record<string, string[]>)[h] ?? (h.startsWith("wc-") ? ["203.0.113.7"] : []);
    world.http = async (r) => r.host === "evil.act.example.net" ? { status: 200, body: `<title>${evilTitle}</title>` } : r.host === "redir.act.example.net" ? { status: 302, location: "https://elsewhere.invalid/", body: "" } : { status: 200, body: `<title>${r.host}</title>` };
    world.tcp = async (_ip, port) => port === 443;
    sourcesOnly("anubis");
    cleanForm();
    type(field("Domain to look up"), "act.example.net");
    for (const name of ["Resolve DNS", "Detect wildcard DNS", "Probe HTTP/HTTPS", "Probe ports"]) tick(checkbox(name));
    tick(q(".subs-permission input"));
    btn("Find subdomains").click();
    await until(isRunning, "the run");
    await until(() => q(".pw-row .pw-status").textContent.includes("DNS") || !isRunning(), "a DNS progress line", 5000).catch(() => {});
    await idle();
    expect(q(".subs-counts").textContent).toBe("5 hosts · 5 with an IP address · 3 answered on the web · 3 with open ports · 1 matching the wildcard");
    const by = (h: string) => rows().find((r) => r.dataset.host === h);
    expect(cell(by("www.act.example.net"), 2)).toBe("93.184.216.34");
    expect(cell(by("www.act.example.net"), 3)).toBe("200");
    expect(cell(by("www.act.example.net"), 5)).toBe("443");
    expect(cell(by("fake.act.example.net"), 6)).toBe("yes");
    expect(by("lan.act.example.net").textContent).toContain("Points to a private network address, so it is not probed.");
    expect(cell(by("lan.act.example.net"), 3)).toBe("—");
    expect(by("redir.act.example.net").textContent).toContain("another site, not followed");
    // hostile page title: shown as plain text, never as markup, nothing executed
    const titleCell = by("evil.act.example.net").children[4];
    expect(titleCell.textContent).toContain("<img src=x");
    expect(titleCell.children.length).toBe(0);
    expect(pane().querySelector("img, script, iframe, object, embed, a[href]")).toBeNull();
    expect((win as any).__pwned).toBeUndefined();
    expect(pane().textContent).not.toMatch(/\bnull\b|\bundefined\b/);
  });

  test("copying: hosts, CSV (formula-safe), JSON, Markdown, one column, one cell, one row, the URL", async () => {
    const shown = hostsShown();
    expect(shown.length).toBe(5);
    expect(await copyWith("Copy hosts (one per line)")).toBe(shown.join("\n"));
    const csv = await copyWith("Copy as CSV");
    expect(csv.split("\r\n")[0]).toBe("Host,Found by,IP addresses,Web,Page title,Open ports,Wildcard");
    expect(csv).toContain("\"'=HYPERLINK(");
    for (const line of csv.split("\r\n").slice(1)) expect(line.replace(/^"/, "")).not.toMatch(/^[=+\-@]/);
    const jsonText = await copyWith("Copy as JSON");
    const parsed = JSON.parse(jsonText);
    expect(parsed).toHaveLength(5);
    expect(parsed[0]).toMatchObject({ Host: "evil.act.example.net", "Found by": "anubis" });
    const md = await copyWith("Copy as Markdown");
    expect(md.split("\n")[0]).toBe("| Host | Found by | IP addresses | Web | Page title | Open ports | Wildcard |");
    expect(md.split("\n")).toHaveLength(7);
    const column = field("Column to copy");
    column.value = "ip";
    expect(await copyWith("Copy column")).toContain("93.184.216.34");
    // one cell: double-click
    const before = copied.length;
    const www = rows().find((r) => r.dataset.host === "www.act.example.net");
    www.children[2].dispatchEvent(new win.MouseEvent("dblclick", { bubbles: true }));
    await until(() => copied.length > before, "a cell copy", 2000);
    expect(lastCopy()).toBe("93.184.216.34");
    // a row and the URL need a selected row
    expect(btn("Copy row").disabled).toBe(true);
    www.click();
    expect(www.getAttribute("aria-selected")).toBe("true");
    expect(q(".subs-selbar .pw-status").textContent).toBe("Selected: www.act.example.net");
    expect(btn("Copy row").disabled).toBe(false);
    expect(await copyWith("Copy row")).toBe("www.act.example.net\tanubis\t93.184.216.34\t200\twww.act.example.net\t443\t");
    expect(await copyWith("Copy URL")).toBe("https://www.act.example.net/");
  });

  test("a selected host: Open in the Network tab (an event, and the Network tab gets the host), Open in browser (server launch)", async () => {
    const heard: any[] = [];
    const off = stateMod.on("open-in-network", (d: any) => heard.push(d));
    const www = rows().find((r) => r.dataset.host === "www.act.example.net");
    www.click();
    btn("Open in Network tab").click();
    off();
    expect(heard).toEqual([{ host: "www.act.example.net" }]);
    await until(() => power.activePowerTab() === "net", "the Network tab to open");
    expect(doc.querySelector('#power-pane-net input[aria-label="Computer or website to check"]').value).toBe("www.act.example.net");
    power.openPower("subs");
    await until(() => !pane().hidden, "the Subdomains tab");
    launched.length = 0;
    rows().find((r) => r.dataset.host === "www.act.example.net").click();
    btn("Open in browser").click();
    await until(() => launched.length === 1, "the browser launch");
    expect(launched[0]!.args.at(-1)).toBe("https://www.act.example.net/");
    await until(() => toasts().includes("Opened https://www.act.example.net/"), "the confirmation");
  });
});

describe("saving and history", () => {
  const folder = () => field("Folder to save in");
  test("Export writes a new file in the folder (only the rows shown), never overwrites; the report is a Markdown file", async () => {
    reset();
    world.routes["jonlu.ca"] = () => json(hostsOf("a.save.example.org", "b.save.example.org", "c.save.example.org"));
    sourcesOnly("anubis");
    await run("save.example.org");
    expect(folder().value).toBe(work);
    btn("Use current folder").click();
    expect(folder().value).toBe(work);
    btn("Export").click();
    await until(() => toasts().includes("Saved 3 hosts"), "the export", 4000);
    expect(readdirSync(work)).toEqual(["save.example.org hosts.txt"]);
    expect(readFileSync(join(work, "save.example.org hosts.txt"), "utf8")).toBe("a.save.example.org\nb.save.example.org\nc.save.example.org\n");
    doc.querySelector("#toasts").replaceChildren();
    // the same again makes another file; a narrowed table exports only what it shows
    type(field("Narrow these results"), "b.save");
    await until(() => hostsShown().length === 1, "the filter");
    field("Export format").value = "csv";
    btn("Export").click();
    await until(() => toasts().includes("Saved 1 host as"), "the second export", 4000);
    expect(readdirSync(work).sort()).toEqual(["save.example.org hosts.txt", "save.example.org subdomains.csv"]);
    expect(readFileSync(join(work, "save.example.org subdomains.csv"), "utf8")).toContain("b.save.example.org");
    expect(readFileSync(join(work, "save.example.org subdomains.csv"), "utf8")).not.toContain("a.save.example.org");
    field("Export format").value = "txt";
    btn("Export").click();
    await until(() => readdirSync(work).length === 3, "a third file", 4000);
    expect(readFileSync(join(work, "save.example.org hosts.txt"), "utf8").split("\n")).toHaveLength(4);
    type(field("Narrow these results"), "");
    type(field("File name (optional)"), "my report");
    btn("Save as a report").click();
    await until(() => existsSync(join(work, "my report.md")), "the report", 4000);
    const md = readFileSync(join(work, "my report.md"), "utf8");
    expect(md).toContain("# Subdomain report: save.example.org");
    expect(md).toContain("## Notes in plain words");
    type(field("File name (optional)"), "");
  });

  test("problems are said in plain words: no folder, a folder that isn't there, a bad name", async () => {
    doc.querySelector("#toasts").replaceChildren();
    type(folder(), "");
    btn("Export").click();
    await until(() => toasts().includes("Type the folder to save in"), "the folder hint", 2000);
    type(folder(), join(work, "missing"));
    btn("Export").click();
    await until(() => toasts().includes("doesn't exist"), "the missing-folder message", 3000);
    type(folder(), work);
    type(field("File name (optional)"), "../evil");
    btn("Save as a report").click();
    await until(() => toasts().includes("can't contain"), "the name message", 3000);
    type(field("File name (optional)"), "");
    expect(readdirSync(work).some((f) => f.includes("evil"))).toBe(false);
  });

  test("History lists the runs with counts but no host names, 'Use this domain' refills the box, and Clear history empties it", async () => {
    const items = () => qa(".subs-history-item");
    await until(() => items().length >= 3, "history entries");
    const first = items()[0];
    expect(first.textContent).toContain("save.example.org");
    expect(first.textContent).toContain("3 hosts");
    expect(first.textContent).toContain("passive only");
    expect(first.textContent).toContain("no host names kept");
    expect(q(".subs-history").textContent).not.toContain("a.save.example.org");
    expect(items().length).toBeLessThanOrEqual(20);
    type(field("Domain to look up"), "");
    [...first.querySelectorAll("button")].find((b: any) => b.textContent === "Use this domain").click();
    expect(field("Domain to look up").value).toBe("save.example.org");
  });

  test("'Keep these results' stores the hosts; they can be shown again (static: no export, no browser) and cleared with the history", async () => {
    reset();
    world.routes["jonlu.ca"] = () => json(hostsOf("k1.keep.example.org", "k2.keep.example.org"));
    sourcesOnly("anubis");
    await run("keep.example.org", () => tick(qa("label.subs-check").find((l) => l.textContent.includes("Keep these results")).querySelector("input")));
    await until(() => qa(".subs-history-item")[0]?.textContent.includes("keep.example.org"), "the new entry");
    const entry = qa(".subs-history-item")[0];
    expect(entry.textContent).not.toContain("no host names kept");
    const show = [...entry.querySelectorAll("button")].find((b: any) => b.textContent === "Show kept results");
    expect(show.title).toContain("2 host names");
    // empty the table first by loading an older run
    type(field("Narrow these results"), "");
    show.click();
    await until(() => q(".subs-counts").textContent.includes("kept results from"), "the kept results", 3000);
    expect(hostsShown()).toEqual(["k1.keep.example.org", "k2.keep.example.org"]);
    rows()[0].click();
    expect(btn("Open in browser").disabled).toBe(true);
    expect(btn("Open in browser").title).toContain("run from this session");
    expect(btn("Copy URL").disabled).toBe(false);
    btn("Export").click();
    await sleep(100);
    expect(toasts()).toContain("work on a run from this session");
    btn("Clear history").click();
    await until(() => qa(".subs-history-item").length === 0, "the history to clear", 3000);
    expect(q(".subs-history + p, .subs-card p.pw-hint:not([hidden])")).toBeTruthy();
    expect(btn("Clear history").disabled).toBe(true);
    const files = readdirSync(join(root, "data")).filter((f) => f.includes("subdomains_history"));
    expect(files).toEqual([]);
  });
});
