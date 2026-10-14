import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { createContext } from "../src/features/filemanager/fmCore";
import { MAX_FAVORITES, MAX_FAVORITE_NAME, sanitizeSettings } from "../src/features/filemanager/fmSettings";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// ---- the saved settings -------------------------------------------------------------------------------------------
describe("favorite names in the settings", () => {
  const ctx = createContext({ platform: "linux", home: "/home/u", dataDir: "/tmp/x" });
  test("a name belongs to a favorite, is trimmed and shortened, and is dropped with the favorite", () => {
    const s = sanitizeSettings({ favorites: ["/a/b", "/c"], favoriteNames: { "/a/b": "  My   place  ", "/c": "x".repeat(200), "/gone": "Ghost", "/a/b/../b": "dup", relative: "no" } }, ctx);
    expect(s.favoriteNames["/a/b"]).toBeDefined();
    expect(s.favoriteNames["/c"]!.length).toBe(MAX_FAVORITE_NAME);
    expect(Object.keys(s.favoriteNames).sort()).toEqual(["/a/b", "/c"]);
    expect(sanitizeSettings({ favorites: [], favoriteNames: { "/a": "x" } }, ctx).favoriteNames).toEqual({});
  });
  test("control characters and junk are cleaned, and bad shapes are ignored", () => {
    const s = sanitizeSettings({ favorites: ["/a"], favoriteNames: { "/a": "tab\there\nnew\u0000line" } }, ctx);
    expect(s.favoriteNames["/a"]).not.toMatch(/[\u0000-\u001f]/);
    for (const bad of [null, 5, "x", [], { "/a": 5 }, { "/a": "   " }]) expect(sanitizeSettings({ favorites: ["/a"], favoriteNames: bad }, ctx).favoriteNames).toEqual({});
  });
  test("the cap is 100", () => {
    expect(MAX_FAVORITES).toBe(100);
  });
});

// ---- the page, run for real in a fake browser against the real server --------------------------------------------
const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-fav-ui-"));
const home = join(root, "home");
const projects = join(home, "Projects");
const music = join(home, "Music");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let fav: any;
let nav: any;
let state: any;
let api: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dialogButton = (text: string): any => [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.trim() === text);
const type = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
};
const serverSettings = async () => (await api.call("settings")).settings;
const sidebarLabels = () => [...doc.querySelectorAll("#sidebar .side-section")].find((s: any) => s.querySelector(".side-title")?.textContent === "Favorites")?.querySelectorAll(".side-item .sl");

beforeAll(async () => {
  for (const d of [projects, music, join(home, "Docs")]) mkdirSync(d, { recursive: true });
  writeFileSync(join(home, "file.txt"), "x");
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
  fav = await import("../resources/file_manager/ui/favorites.js");
  const sidebar = await import("../resources/file_manager/ui/sidebar.js");
  state.home = home;
  state.sep = "/";
  state.places = [];
  state.drives = [];
  state.location = { kind: "folder", path: projects };
  state.settings = (await serverSettings()) as any;
  fav.wireFavorites();
  sidebar.wireSidebar();
  sidebar.renderSidebar();
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

describe("favorites in the page", () => {
  test("with none, the sidebar explains how to add one and the star is empty", () => {
    expect(doc.querySelector("#sidebar .side-hint")?.textContent).toContain("☆");
    const star = doc.getElementById("fav-star");
    expect(star.textContent).toBe("☆");
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(star.title).toContain("Add this folder");
  });

  test("the star adds the folder you are in, saves it, shows it on the left and fills in", async () => {
    doc.getElementById("fav-star").click();
    await sleep(400);
    expect((await serverSettings()).favorites).toEqual([projects]);
    expect([...sidebarLabels()].map((l: any) => l.textContent)).toEqual(["Projects"]);
    expect(doc.getElementById("fav-star").textContent).toBe("★");
    expect(doc.getElementById("fav-star").getAttribute("aria-pressed")).toBe("true");
    expect(doc.getElementById("fav-star").getAttribute("aria-label")).toContain("Remove");
  });

  test("a favorite can have your own name, and an empty name goes back to the folder's", async () => {
    const p = fav.renameFavorite(projects);
    await sleep(100);
    const input = doc.querySelector(".modal-backdrop input");
    expect(input.value).toBe("Projects");
    type(input, "  My   work  ");
    dialogButton("Rename").click();
    await p;
    await sleep(300);
    expect((await serverSettings()).favoriteNames).toEqual({ [projects]: "My work" });
    expect([...sidebarLabels()].map((l: any) => l.textContent)).toEqual(["My work"]);
    expect(fav.favoriteName(projects)).toBe("My work");
    const again = fav.renameFavorite(projects);
    await sleep(100);
    type(doc.querySelector(".modal-backdrop input"), "");
    dialogButton("Rename").click();
    await again;
    await sleep(300);
    expect((await serverSettings()).favoriteNames).toEqual({});
    expect(fav.favoriteName(projects)).toBe("Projects");
  });

  test("a typed location is added: ~ works, files, missing folders and repeats are explained", async () => {
    const attempt = async (text: string) => {
      const p = fav.addFavoritePrompt();
      await sleep(100);
      type(doc.querySelector(".modal-backdrop input"), text);
      dialogButton("Add to Favorites").click();
      await sleep(400);
      return { error: doc.querySelector(".modal-backdrop .dialog-error")?.textContent ?? "", p };
    };
    let r = await attempt("~/Music");
    expect(await r.p).toBe(music);
    r = await attempt(join(home, "file.txt"));
    expect(r.error).toContain("file");
    dialogButton("Cancel").click();
    await r.p;
    r = await attempt(join(home, "nope"));
    expect(r.error).toContain("no folder");
    dialogButton("Cancel").click();
    await r.p;
    r = await attempt(projects);
    expect(r.error).toContain("already");
    dialogButton("Cancel").click();
    await r.p;
    r = await attempt("");
    expect(r.error).toContain("Type a folder");
    dialogButton("Cancel").click();
    await r.p;
    expect((await serverSettings()).favorites).toEqual([projects, music]);
  });

  test("the Favorites menu lists them, and choosing one goes there", async () => {
    fav.showFavoritesMenu({ x: 5, y: 5 });
    await sleep(50);
    const items = [...doc.querySelectorAll("[role=menuitem]")].map((i: any) => i.textContent);
    expect(items.some((t: string) => t.includes("Projects"))).toBe(true);
    expect(items.some((t: string) => t.includes("Music"))).toBe(true);
    expect(items.some((t: string) => t.includes("Remove this folder from Favorites"))).toBe(true);
    expect(items.some((t: string) => t.includes("Manage favorites"))).toBe(true);
    doc.defaultView.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "Escape" }));
    doc.body.click();
  });

  test("Manage favorites: rename, reorder, remove and mark a folder that is gone, then Save", async () => {
    rmSync(music, { recursive: true });
    const p = fav.showFavoritesManager();
    await sleep(700);
    const rows = () => [...doc.querySelectorAll(".fav-row")];
    expect(rows().length).toBe(2);
    expect(rows()[1].classList.contains("fav-missing")).toBe(true);
    expect(rows()[1].textContent).toContain("isn't there any more");
    // rename the first, move it down, add Docs, then save
    type(rows()[0].querySelector("input"), "Code");
    rows()[0].querySelector("button[aria-label^='Move'][title='Move down']").click();
    await sleep(50);
    expect(rows()[1].querySelector("input").value).toBe("Code");
    const add = doc.querySelector(".fav-add");
    add.click();
    await sleep(100);
    const top = [...doc.querySelectorAll(".modal-backdrop")].at(-1);
    type(top.querySelector("input"), join(home, "Docs"));
    [...top.querySelectorAll("button")].find((b: any) => b.textContent.trim() === "Add").click();
    await sleep(400);
    expect(rows().length).toBe(3);
    dialogButton("Save").click();
    expect(await p).toBe(true);
    await sleep(300);
    const s = await serverSettings();
    expect(s.favorites).toEqual([music, projects, join(home, "Docs")]);
    expect(s.favoriteNames).toEqual({ [projects]: "Code" });
  });

  test("Remove in Manage takes it out, Cancel changes nothing", async () => {
    let p = fav.showFavoritesManager();
    await sleep(500);
    doc.querySelectorAll(".fav-row")[0].querySelector(".btn.danger").click();
    dialogButton("Cancel").click();
    expect(await p).toBe(false);
    expect((await serverSettings()).favorites.length).toBe(3);
    p = fav.showFavoritesManager();
    await sleep(500);
    doc.querySelectorAll(".fav-row")[0].querySelector(".btn.danger").click();
    dialogButton("Save").click();
    await p;
    await sleep(300);
    expect((await serverSettings()).favorites).toEqual([projects, join(home, "Docs")]);
  });

  test("the star turns off again, and is disabled in the Recycle Bin", async () => {
    doc.getElementById("fav-star").click();
    await sleep(400);
    expect((await serverSettings()).favorites).toEqual([join(home, "Docs")]);
    expect(doc.getElementById("fav-star").textContent).toBe("☆");
    state.location = { kind: "trash" };
    (await import("../resources/file_manager/ui/state.js")).emit("view");
    expect(doc.getElementById("fav-star").disabled).toBe(true);
    await nav; // keep the import used
  });
});
