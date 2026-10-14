import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ABOUT_LINKS } from "../src/features/filemanager/fmAboutOps";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { JSDOM } from "jsdom";

// Page tests share the page modules in one process, and api.js keeps the first token it sees: every page test uses this one.
const TOKEN = "ui-token";
let root: string;
let server: ReturnType<typeof startFileManagerServer>;
const launched: Array<{ command: string; args: string[] }> = [];

const post = (op: string, body: unknown = {}) =>
  fetch(`http://127.0.0.1:${server.port}/api/${op}`, { method: "POST", headers: { "content-type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify(body) });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "fm-about-"));
  server = startFileManagerServer({ port: 0, token: TOKEN, context: { home: root, dataDir: join(root, "data"), launch: async (command, args) => void launched.push({ command, args }) } });
});
afterAll(() => {
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("About links", () => {
  test("the project and the author's GitHub pages are listed, all over https", () => {
    const urls = ABOUT_LINKS.map((l) => l.url);
    expect(urls).toContain("https://github.com/codecaine-zz/bun_rad_studio");
    expect(urls).toContain("https://github.com/codecaine-zz");
    expect(urls).toContain("https://codefreelance.net/apps/markdown_tutorials/");
    for (const u of urls) expect(u.startsWith("https://")).toBe(true);
    expect(new Set(ABOUT_LINKS.map((l) => l.id)).size).toBe(ABOUT_LINKS.length);
  });

  test("about/info lists them and about/open starts the browser with the fixed address", async () => {
    const info = (await (await post("about/info")).json()) as { links: Array<{ id: string }> };
    expect(info.links.map((l) => l.id)).toContain("project");
    const res = await post("about/open", { id: "project" });
    expect(res.status).toBe(200);
    expect(launched.at(-1)!.args).toContain("https://github.com/codecaine-zz/bun_rad_studio");
    expect((await post("about/open", { id: "tutorials" })).status).toBe(200);
    expect(launched.at(-1)!.args).toContain("https://codefreelance.net/apps/markdown_tutorials/");
  });

  test("an unknown id, or an address sent instead of an id, opens nothing", async () => {
    const before = launched.length;
    expect((await post("about/open", { id: "https://evil.example" })).status).toBe(400);
    expect((await post("about/open", { id: "nope", url: "https://evil.example" })).status).toBe(400);
    expect(launched.length).toBe(before);
  });

  test("the token is required", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/api/about/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "project" }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("the donation QR code", () => {
  test("the page serves the QR picture as an SVG, the same one the GitHub page uses", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/ui/donate-paypal-qr.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    const served = await res.text();
    expect(served).toBe(readFileSync(join(import.meta.dir, "..", "docs", "images", "donate-paypal-qr.svg"), "utf8"));
    expect(served).toContain("<svg");
    expect(served).not.toMatch(/<script|onload=|href=/i);
  });
});

describe("the Support window in the page", () => {
  const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  let doc: any;
  let about: any;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const button = (text: string): any => [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.trim() === text);

  beforeAll(async () => {
    const base = `http://127.0.0.1:${server.port}`;
    const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, TOKEN).replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
    const dom = new JSDOM(html, { url: `${base}/` });
    const g = globalThis as any;
    for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
    for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
    const realFetch = saved.get("fetch")!.value as typeof fetch;
    Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
    doc = dom.window.document;
    about = await import("../resources/file_manager/ui/about.js");
  });
  afterAll(() => {
    const g = globalThis as any;
    for (const key of GLOBALS) {
      const d = saved.get(key);
      if (d) Object.defineProperty(g, key, d);
      else delete g[key];
    }
  });

  test("shows the QR picture with a description, the link, and buttons that open and copy it", async () => {
    await about.showDonate();
    const img = doc.querySelector(".modal-backdrop img.donate-qr");
    expect(img.getAttribute("src")).toBe("/ui/donate-paypal-qr.svg");
    expect(img.getAttribute("alt")).toMatch(/QR code.*paypal\.me\/codecaine81/);
    expect(doc.querySelector(".modal-backdrop").textContent).toContain("paypal.me/codecaine81");
    expect(doc.querySelector(".modal-backdrop").textContent).not.toMatch(/\bnull\b|\bundefined\b/);
    const before = launched.length;
    button("Open PayPal ↗").click();
    await sleep(300);
    expect(launched.length).toBe(before + 1);
    expect(launched.at(-1)!.args).toContain("https://paypal.me/codecaine81");
    button("Copy link").click();
    await sleep(300);
    expect(doc.querySelector("#toasts").textContent).toMatch(/donation link was copied|Couldn't copy/);
    button("Close").click();
  });

  test("the About window has a Donate button that opens it", async () => {
    await about.showAbout();
    button("Donate with a QR code…").click();
    await sleep(300);
    expect(doc.querySelector(".modal-backdrop img.donate-qr")).toBeTruthy();
    for (const b of doc.querySelectorAll(".modal-backdrop")) b.remove();
  });
});
