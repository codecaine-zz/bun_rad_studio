import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
// @ts-ignore (jsdom has no type declarations in every setup)
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { app1Exif, jpeg, photoTiff, png, scratchRoot } from "./file_manager_info_fixtures";
import { FORMATS, buildReport, rowMatches } from "../resources/file_manager/ui/fileinfoReport.js";

// These modules need the fake browser, so they are loaded after it exists.
let dominantColors: any, toHex: any, toHslText: any, toRgbText: any;

const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "navigator", "location", "fetch", "Image", "CSS", "ResizeObserver"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = scratchRoot("page");
const home = join(root.dir, "home");
const pics = join(home, "Pictures");
const photo = join(pics, "holiday.jpg");
const plain = join(pics, "flat.png");
const launched: Array<{ command: string; args: string[] }> = [];
const copied: string[] = [];
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let state: any;
let nav: any;
let selection: any;
let info: any;
let menus: any;
let contextmenu: any;
let extras: any;
let keys: any;
let fileinfo: any;
let canvasPixels: number[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => any, ms = 4000, what = "condition"): Promise<any> {
  // Never less than 12 s: a shared CI runner can be several times slower than a laptop.
  const end = Date.now() + Math.max(ms, 12_000);
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await sleep(15);
  }
}
const q = <T = any>(sel: string, from: any = doc): T | null => from.querySelector(sel);
const qa = (sel: string, from: any = doc): any[] => [...from.querySelectorAll(sel)];
const dialogEl = () => q(".fi-dialog");
const button = (text: string, from: any = doc) => qa("button", from).find((b) => b.textContent.trim() === text);
const key = (init: Record<string, any>) => doc.dispatchEvent(new win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
const type = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
};
async function closeAll() {
  for (let i = 0; i < 6 && q(".modal-backdrop"); i++) {
    key({ key: "Escape" });
    await sleep(10);
  }
}
const rowsOf = (group: string) => Object.fromEntries(qa(`[data-group="${group}"] .fi-row`).map((r) => [r.querySelector("th").textContent.replace(/ ⓘ$/, "").trim(), r.querySelector(".fi-value").textContent.replace(/^[⚠✔ℹ] /, "").replace(/^(Warning|Good|Note): /, "").trim()]));
const toastText = () => q("#toasts")?.textContent ?? "";

async function open(paths: string[]) {
  await closeAll();
  fileinfo.showMoreInfo(paths);
  await waitFor(dialogEl, 3000, "the dialog");
}
const loaded = () => waitFor(() => q(".fi[data-state=ready]"), 8000, "the details to load");

let canSymlink = true;
beforeAll(async () => {
  // The terminal needs a library that only the real page can load.
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}), terminalAvailable: () => false, typeInTerminal: () => false, showTerminal() {}, isTerminalOpen: () => false, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {} }));
  saved.set("ResizeObserver", Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"));
  Object.defineProperty(globalThis, "ResizeObserver", { value: class { observe() {} disconnect() {} unobserve() {} }, configurable: true, writable: true });
  for (const d of [pics, join(home, "tree", "sub")]) mkdirSync(d, { recursive: true });
  writeFileSync(photo, jpeg({ w: 4032, h: 3024, segments: [app1Exif(photoTiff(false))] }));
  writeFileSync(plain, png({ w: 6, h: 4 }));
  writeFileSync(join(home, "tree", "a.txt"), "hello");
  writeFileSync(join(home, "tree", "sub", "b.txt"), "world!");
  try {
    symlinkSync(photo, join(pics, "shortcut.jpg"));
  } catch {
    canSymlink = false;
  }
  // Page modules read the token once, when first loaded, and other page tests share them: they all use this token.
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root.dir, "data"), launch: async (command, args) => void launched.push({ command, args }) } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform === "darwin" ? "darwin" : "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
  win = dom.window;
  const g = globalThis as any;
  for (const k of GLOBALS) if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch" && x !== "Image" && x !== "CSS" && x !== "ResizeObserver")) Object.defineProperty(g, k, { value: (win as any)[k], configurable: true, writable: true });
  Object.defineProperty(g, "CSS", { value: { escape: (s: string) => s.replace(/["\\]/g, "\\$&") }, configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  // The clipboard is never really written: copy requests are recorded instead.
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
  // jsdom can't load or draw pictures, so a small stand-in draws a known set of pixels.
  Object.defineProperty(g, "Image", {
    value: class {
      listeners: Record<string, () => void> = {};
      naturalWidth = 128;
      naturalHeight = 64;
      addEventListener(t: string, f: () => void) { this.listeners[t] = f; }
      set src(_v: string) { queueMicrotask(() => this.listeners.load?.()); }
    },
    configurable: true, writable: true,
  });
  win.HTMLCanvasElement.prototype.getContext = function () {
    return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(canvasPixels) }) };
  };
  doc = win.document;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  nav = await import("../resources/file_manager/ui/nav.js");
  selection = await import("../resources/file_manager/ui/selection.js");
  info = await import("../resources/file_manager/ui/info.js");
  menus = await import("../resources/file_manager/ui/menus.js");
  contextmenu = await import("../resources/file_manager/ui/contextmenu.js");
  extras = await import("../resources/file_manager/ui/extras.js");
  keys = await import("../resources/file_manager/ui/keys.js");
  fileinfo = await import("../resources/file_manager/ui/fileinfo.js");
  ({ dominantColors, toHex, toHslText, toRgbText } = await import("../resources/file_manager/ui/fileinfoPalette.js"));
  const api = await import("../resources/file_manager/ui/api.js");
  state.home = home;
  state.sep = process.platform === "win32" ? "\\" : "/";
  state.places = [];
  state.drives = [];
  state.platform = process.platform === "darwin" ? "darwin" : "linux";
  state.settings = (await (api.call as any)("settings")).settings;
  await nav.saveSettings({ showInfoPanel: true });
  keys.wireKeys();
  await nav.goTo(pics);
});

afterAll(async () => {
  await closeAll();
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(g, k, d);
    else delete g[k];
  }
  server.stop(true);
  root.remove();
});

describe("opening the window", () => {
  test("from the right-click menu, with the shortcut shown", async () => {
    await closeAll();
    selection.selectKeys([photo]);
    contextmenu.showEntryMenu(selection.selectedEntries(), { x: 10, y: 10 });
    const item = qa(".menu .menu-item").find((b) => b.textContent.includes("More info"));
    expect(item).toBeDefined();
    expect(item.textContent).toMatch(/Alt\+Shift\+Enter|⌥⇧↩/); // written the way this computer writes it
    item.click();
    await waitFor(dialogEl);
    expect(q(".fi-name").textContent).toBe("holiday.jpg");
    await loaded();
    await closeAll();
  });

  test("from the Properties window's “More info…” button", async () => {
    await closeAll();
    extras.showProperties([photo]);
    const more = await waitFor(() => button("More info…"), 3000, "the Properties window");
    more.click();
    await waitFor(dialogEl, 3000, "the More info window");
    expect(q(".fi-name").textContent).toBe("holiday.jpg");
    expect(qa(".modal-backdrop")).toHaveLength(1);
    await closeAll();
  });

  test("from the keyboard: Alt+Shift+Enter opens it, and Alt+Enter still opens Properties", async () => {
    await closeAll();
    selection.selectKeys([photo]);
    key({ key: "Enter", altKey: true, shiftKey: true });
    await waitFor(dialogEl);
    await closeAll();
    key({ key: "Enter", altKey: true });
    await waitFor(() => qa(".dialog-title").find((t) => t.textContent === "Properties"));
    expect(dialogEl()).toBeNull();
    await closeAll();
  });

  test("from the Details panel's “More info…” button", async () => {
    await closeAll();
    selection.selectKeys([photo]);
    await info.renderInfo();
    const more = await waitFor(() => button("More info…", q("#info")), 3000, "the panel button");
    expect(more.title).toContain("hidden details");
    more.click();
    await waitFor(dialogEl);
    await closeAll();
  });

  test("a menu on empty space offers the folder's details", async () => {
    await closeAll();
    contextmenu.showBackgroundMenu({ x: 5, y: 5 });
    const item = qa(".menu .menu-item").find((b) => b.textContent.includes("More info about this folder"));
    expect(item).toBeDefined();
    item.click();
    await waitFor(dialogEl);
    expect(q(".fi-name").textContent).toBe("Pictures");
    await closeAll();
  });
});

describe("what the window shows for a photo", () => {
  test("groups, real tables with headers, plain-word tooltips and a labeled copy button on every row", async () => {
    await open([photo]);
    await loaded();
    const groups = qa(".fi-group").map((g) => g.dataset.group);
    for (const id of ["general", "dates", "image", "camera", "location", "privacy-view", "hashes", "exiftool-view"]) expect(groups, id).toContain(id);
    const camera = rowsOf("camera");
    expect(camera["Camera"]).toBe("Canon EOS R5");
    expect(camera["ISO"]).toBe("400");
    expect(camera["Aperture"]).toBe("f/2.8");
    const table = q('[data-group="camera"] table');
    expect(table.querySelector("caption").textContent).toBe("Camera and shot");
    expect(qa("thead th[scope=col]", table).map((t) => t.textContent)).toEqual(["Setting", "Value", "Copy"]);
    expect(qa("tbody th[scope=row]", table).length).toBeGreaterThan(5);
    const iso = qa("tbody th", table).find((t) => t.textContent.startsWith("ISO"));
    expect(iso.title).toContain("sensitive");
    for (const row of qa(".fi-row")) {
      const copy = row.querySelector("button.fi-copy");
      expect(copy.tagName).toBe("BUTTON");
      expect(copy.getAttribute("aria-label")).toMatch(/^Copy .+/);
      expect(copy.type).toBe("button");
    }
    expect(q(".fi-summary", q('[data-group="image"]')).title).toContain("picture itself");
    expect(rowsOf("image")["Size"]).toBe("4,032 × 3,024 pixels");
    await closeAll();
  });

  test("the location warning is shown in plain words with text and an icon, not color alone", async () => {
    await open([photo]);
    await loaded();
    const banner = q(".fi-gps-banner");
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain("Has location");
    expect(banner.textContent).toContain("This photo contains the location where it was taken.");
    const loc = rowsOf("location");
    expect(loc["Warning"]).toBe("This photo contains the location where it was taken.");
    expect(loc["Coordinates"]).toBe("48.858222, 2.2945");
    const warnRow = qa('[data-group="location"] .fi-value.fi-warn')[0];
    expect(warnRow.querySelector(".sr-only").textContent).toBe("Warning: ");
    expect(warnRow.querySelector(".fi-flag").textContent).toContain("⚠");
    const priv = qa('[data-group="privacy-view"] li').map((li) => li.textContent);
    expect(priv.find((t) => t.includes("Where it was taken"))).toContain("Found");
    expect(priv.find((t) => t.includes("Camera or lens serial"))).toContain("Found");
    expect(priv.find((t) => t.includes("Embedded XMP"))).toContain("Not found");
    await closeAll();
  });

  test("a picture with nothing private shows no location banner and a clean privacy list", async () => {
    await open([plain]);
    await loaded();
    expect(q(".fi-gps-banner").hidden).toBe(true);
    expect(q('[data-group="location"]')).toBeNull();
    expect(q('[data-group="privacy-view"]').textContent).toContain("No private details were found.");
    expect(q(".fi-gps")).toBeNull();
    await closeAll();
  });
});

describe("searching", () => {
  test("filters rows as you type, opens groups, hides empty ones, says how many match, and Escape clears it", async () => {
    await open([photo]);
    await loaded();
    const total = qa(".fi-row:not([hidden])").length;
    const search = q(".fi-search");
    type(search, "iso");
    const visible = qa(".fi-row").filter((r) => !r.hidden && !r.closest("[hidden]"));
    expect(visible.map((r) => r.querySelector("th").textContent.replace(/ ⓘ$/, ""))).toEqual(["ISO"]);
    expect(q(".fi-status").textContent).toBe("1 detail match “iso”.");
    expect(q('[data-group="general"]').hidden).toBe(true);
    expect(q('[data-group="camera"]').hidden).toBe(false);
    type(search, "canon eos");
    expect(qa(".fi-row").filter((r) => !r.hidden).map((r) => r.querySelector(".fi-value").textContent)).toContain("Canon EOS R5");
    type(search, "zzzz-nothing");
    expect(q(".fi-status").textContent).toContain("Nothing matches");
    expect(qa(".fi-group").every((g) => g.hidden || g.dataset.group === "exiftool-view" || g.dataset.group === "privacy-view")).toBe(true);
    search.focus();
    search.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(search.value).toBe("");
    expect(qa(".fi-row:not([hidden])").length).toBe(total);
    expect(q(".modal-backdrop")).not.toBeNull();
    await closeAll();
  });

  test("a group the person closed stays closed, and a search opens it only while searching", async () => {
    await open([photo]);
    await loaded();
    const details = q('[data-group="camera"] details');
    q("summary", details).click();
    await sleep(20);
    expect(details.open).toBe(false);
    type(q(".fi-search"), "iso");
    expect(details.open).toBe(true);
    type(q(".fi-search"), "");
    expect(details.open).toBe(false);
    q("summary", details).click();
    await sleep(20);
    await closeAll();
  });

  test("the matching rule: every word must appear in the label or the value", () => {
    const row = { label: "Camera", value: "Canon EOS R5" };
    expect(rowMatches(row, "")).toBe(true);
    expect(rowMatches(row, "CANON r5")).toBe(true);
    expect(rowMatches(row, "canon nikon")).toBe(false);
    expect(rowMatches(row, "camera")).toBe(true);
  });
});

describe("copying", () => {
  test("a row's copy button copies its value and says so", async () => {
    await open([photo]);
    await loaded();
    copied.length = 0;
    const row = qa('[data-group="camera"] .fi-row').find((r) => r.querySelector("th").textContent.startsWith("Camera"));
    row.querySelector("button.fi-copy").click();
    await waitFor(() => copied.length === 1);
    expect(copied[0]).toBe("Canon EOS R5");
    await waitFor(() => toastText().includes("copied"));
    await closeAll();
  });

  test("the whole report can be copied as text, JSON and Markdown", async () => {
    await open([photo]);
    await loaded();
    const format = q(".fi-format");
    for (const [value, check] of [
      ["text", (t: string) => t.startsWith("Details of “holiday.jpg”") && t.includes("== Camera and shot ==") && /Camera:\s+Canon EOS R5/.test(t)],
      ["json", (t: string) => JSON.parse(t).groups.some((g: any) => g.title === "Camera and shot" && g.rows.some((r: any) => r.label === "ISO" && r.value === "400"))],
      ["markdown", (t: string) => t.startsWith("# holiday.jpg") && t.includes("| Setting | Value |") && t.includes("| Camera | Canon EOS R5 |")],
    ] as const) {
      format.value = value;
      copied.length = 0;
      q(".fi-copy-report").click();
      await waitFor(() => copied.length === 1);
      expect(check(copied[0]!), value).toBe(true);
    }
    await closeAll();
  });

  test("the report builders escape and shorten safely", () => {
    const report = buildReport({ name: "a|b.txt", path: "/x/a`b" }, [{ title: "G|1", note: "n", rows: [{ label: "A|B", value: "line1\nline2 <b>" }] }, { title: "empty", rows: [] }], new Date(0));
    expect(report.groups).toHaveLength(1);
    const md = FORMATS.markdown.make(report);
    expect(md).toContain("| A\\|B | line1 ⏎ line2 &lt;b&gt; |");
    expect(md).not.toContain("a`b");
    expect(FORMATS.text.make(report)).toContain("line1 ⏎ line2 <b>");
    const huge = buildReport({ name: "x", path: "/x" }, [{ title: "t", rows: Array.from({ length: 2000 }, (_, i) => ({ label: `L${i}`, value: "v".repeat(2000) })) }]);
    const json = FORMATS.json.make(huge);
    expect(json.length).toBeLessThanOrEqual(800_000);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(FORMATS.text.make(huge).length).toBeLessThanOrEqual(800_100);
  });
});

describe("saving the report next to the file", () => {
  test("Save report makes <name>.info.txt, then (2), never overwriting; JSON and Markdown get their own endings", async () => {
    await open([plain]);
    await loaded();
    q(".fi-format").value = "text";
    q(".fi-save-report").click();
    await waitFor(() => existsSync(join(pics, "flat.png.info.txt")));
    await waitFor(() => toastText().includes("flat.png.info.txt"));
    const first = readFileSync(join(pics, "flat.png.info.txt"), "utf8");
    expect(first).toContain("Details of “flat.png”");
    q(".fi-save-report").click();
    await waitFor(() => existsSync(join(pics, "flat.png.info (2).txt")));
    expect(readFileSync(join(pics, "flat.png.info.txt"), "utf8")).toBe(first);
    q(".fi-format").value = "json";
    q(".fi-save-report").click();
    await waitFor(() => existsSync(join(pics, "flat.png.info.json")));
    expect(() => JSON.parse(readFileSync(join(pics, "flat.png.info.json"), "utf8"))).not.toThrow();
    q(".fi-format").value = "markdown";
    q(".fi-save-report").click();
    await waitFor(() => existsSync(join(pics, "flat.png.info.md")));
    expect(readdirSync(pics).filter((n) => n.startsWith("flat.png.info")).sort()).toEqual(["flat.png.info (2).txt", "flat.png.info.json", "flat.png.info.md", "flat.png.info.txt"]);
    await closeAll();
  });

  test("for several items saving is off, with a reason", async () => {
    await open([photo, plain]);
    await loaded();
    expect(q(".fi-save-report").disabled).toBe(true);
    expect(q(".fi-save-report").title).toContain("one item");
    await closeAll();
  });
});

describe("fingerprints", () => {
  test("calculate, copy and compare with a pasted fingerprint in a sloppy form", async () => {
    await open([plain]);
    await loaded();
    const start = button("Calculate fingerprints");
    start.click();
    await waitFor(() => qa(".fi-hash-table tbody tr").length === 5, 4000, "five fingerprints");
    const table = Object.fromEntries(qa(".fi-hash-table tbody tr").map((r) => [r.children[0].textContent, r.children[1].textContent]));
    const { createHash } = await import("crypto");
    expect(table["SHA-256"]).toBe(createHash("sha256").update(readFileSync(plain)).digest("hex"));
    expect(table["MD5"]).toBe(createHash("md5").update(readFileSync(plain)).digest("hex"));
    expect(q(".fi-hash-status").textContent).toContain("Done");
    expect(q(".fi-compare").hidden).toBe(false);
    const input = q(".fi-compare-input");
    expect(button("Compare").disabled).toBe(true);
    type(input, `  SHA256: ${table["SHA-256"].toUpperCase()}  `);
    button("Compare").click();
    await waitFor(() => q(".fi-compare-result").textContent.includes("Match"));
    expect(q(".fi-compare-result").textContent).toContain("✔ Match.");
    type(input, "0".repeat(64));
    button("Compare").click();
    await waitFor(() => q(".fi-compare-result").textContent.includes("No match"));
    expect(q(".fi-compare-result").textContent).toContain("✖ No match.");
    copied.length = 0;
    qa(".fi-hash-table button.fi-copy")[2].click();
    await waitFor(() => copied.length === 1);
    expect(copied[0]).toBe(table["SHA-256"]);
    // the fingerprints go into the report
    copied.length = 0;
    q(".fi-format").value = "text";
    q(".fi-copy-report").click();
    await waitFor(() => copied.length === 1);
    expect(copied[0]).toContain(table["SHA-256"]);
    await closeAll();
  });
});

describe("the map and the private information", () => {
  test("Copy coordinates copies two numbers", async () => {
    await open([photo]);
    await loaded();
    copied.length = 0;
    q(".fi-copy-gps").click();
    await waitFor(() => copied.length === 1);
    expect(copied[0]).toBe("48.858222, 2.2945");
    await closeAll();
  });

  test("Open map… never opens anything by itself: it explains first, and Don't open does nothing", async () => {
    await open([photo]);
    await loaded();
    launched.length = 0;
    q(".fi-open-map").click();
    const title = await waitFor(() => qa(".dialog-title").find((t) => t.textContent === "Open the map?"));
    const dialog = title.closest(".dialog");
    expect(dialog.textContent).toContain("openstreetmap.org");
    expect(dialog.textContent).toContain("48.858222");
    expect(dialog.textContent).toContain("web browser");
    button("Don't open", dialog).click();
    await sleep(150);
    expect(launched).toEqual([]);
    q(".fi-open-map").click();
    const again = await waitFor(() => qa(".dialog-title").find((t) => t.textContent === "Open the map?"));
    button("Open the map", again.closest(".dialog")).click();
    await waitFor(() => launched.length === 1);
    expect(launched[0]!.args.join(" ")).toContain("https://www.openstreetmap.org/?mlat=48.858222&mlon=2.294500");
    await closeAll();
  });

  test("Remove private info…: asks first, makes “name (no metadata).jpg”, leaves the original alone", async () => {
    await open([photo]);
    await loaded();
    const before = readFileSync(photo);
    q(".fi-strip").click();
    const title = await waitFor(() => qa(".dialog-title").find((t) => t.textContent.startsWith("Make a copy without private details")));
    const dialog = title.closest(".dialog");
    expect(dialog.textContent).toContain("The original is not changed");
    button("Cancel", dialog).click();
    await sleep(150);
    expect(existsSync(join(pics, "holiday (no metadata).jpg"))).toBe(false);
    q(".fi-strip").click();
    const again = await waitFor(() => qa(".dialog-title").find((t) => t.textContent.startsWith("Make a copy without private details")));
    button("Make the copy", again.closest(".dialog")).click();
    await waitFor(() => existsSync(join(pics, "holiday (no metadata).jpg")));
    await waitFor(() => toastText().includes("without private details"));
    expect(readFileSync(photo).equals(before)).toBe(true);
    const clean = readFileSync(join(pics, "holiday (no metadata).jpg"));
    expect(clean.includes(Buffer.from("Canon"))).toBe(false);
    expect(clean.length).toBeLessThan(before.length);
    // doing it again never replaces the first copy
    q(".fi-strip").click();
    const third = await waitFor(() => qa(".dialog-title").find((t) => t.textContent.startsWith("Make a copy without private details")));
    button("Make the copy", third.closest(".dialog")).click();
    await waitFor(() => existsSync(join(pics, "holiday (no metadata) (2).jpg")));
    await closeAll();
  });

  test("a kind the built-in cleaner can't do says what to use instead", async () => {
    writeFileSync(join(pics, "anim.gif"), Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;", "latin1"));
    await nav.refresh();
    await open([join(pics, "anim.gif")]);
    await loaded();
    expect(q(".fi-strip")).toBeNull();
    expect(q('[data-group="privacy-view"]').textContent).toContain("JPEG, PNG and WebP");
    await closeAll();
  });
});

describe("the color palette", () => {
  test("is worked out in the page from a canvas (stubbed here), and each swatch copies its HEX code", async () => {
    // left half red, right half blue
    canvasPixels = Array.from({ length: 64 }, (_, i) => (i < 32 ? [220, 20, 20, 255] : [20, 20, 220, 255])).flat();
    await open([plain]);
    await loaded();
    const chips: any[] = await waitFor(() => {
      const c = qa(".fi-chip");
      return c.length ? c : null;
    }, 4000, "swatches");
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.querySelector("strong").textContent).sort()).toEqual(["#1414dc", "#dc1414"]);
    expect(chips[0].textContent).toMatch(/rgb\(\d+, \d+, \d+\)/);
    expect(chips[0].textContent).toMatch(/hsl\(\d+, \d+%, \d+%\)/);
    expect(chips[0].getAttribute("aria-label")).toContain("Copy color 1");
    expect(chips[0].querySelector(".fi-swatch").style.getPropertyValue("--fi-swatch")).toMatch(/^#[0-9a-f]{6}$/);
    copied.length = 0;
    chips.find((c) => c.querySelector("strong").textContent === "#dc1414").click();
    await waitFor(() => copied.length === 1);
    expect(copied[0]).toBe("#dc1414");
    // the colors are part of the report too
    copied.length = 0;
    q(".fi-copy-report").click();
    await waitFor(() => copied.length === 1);
    expect(copied[0]).toContain("== Color palette ==");
    expect(copied[0]).toContain("#dc1414");
    await closeAll();
  });

  test("when the picture can't be drawn, no palette is shown and nothing breaks", async () => {
    canvasPixels = [];
    await open([plain]);
    await loaded();
    await sleep(100);
    expect(qa(".fi-chip")).toHaveLength(0);
    await closeAll();
  });

  test("median cut: dominant colors, share, k limit, transparency and edge cases", () => {
    const px = (r: number, g: number, b: number, a = 255, n = 1) => Array.from({ length: n }, () => [r, g, b, a]).flat();
    const two = dominantColors(px(255, 0, 0, 255, 30).concat(px(0, 0, 255, 255, 10)), 2);
    expect(two.map(toHex)).toEqual(["#ff0000", "#0000ff"]);
    expect(two[0]!.share).toBeCloseTo(0.75);
    expect(two[1]!.share).toBeCloseTo(0.25);
    const mixed = Array.from({ length: 400 }, (_, i) => px((i * 37) & 255, (i * 91) & 255, (i * 13) & 255)).flat();
    expect(dominantColors(mixed, 6)).toHaveLength(6);
    expect(dominantColors(mixed, 100).length).toBeLessThanOrEqual(8);
    expect(dominantColors(mixed, 0).length).toBe(1);
    expect(dominantColors(px(10, 20, 30, 0, 50), 4)).toEqual([]);
    expect(dominantColors([], 4)).toEqual([]);
    expect(dominantColors(px(9, 9, 9, 255, 20), 4)).toHaveLength(1);
    expect(dominantColors(mixed, 8).reduce((n: number, c: { share: number }) => n + c.share, 0)).toBeCloseTo(1);
    expect(toRgbText({ r: 1, g: 2, b: 3 })).toBe("rgb(1, 2, 3)");
    expect(toHslText({ r: 255, g: 0, b: 0 })).toBe("hsl(0, 100%, 50%)");
    expect(toHslText({ r: 0, g: 0, b: 0 })).toBe("hsl(0, 0%, 0%)");
    expect(toHslText({ r: 0, g: 255, b: 255 })).toBe("hsl(180, 100%, 50%)");
    expect(toHex({ r: 0, g: 10, b: 255 })).toBe("#000aff");
  });
});

describe("folders, several items, links and failures", () => {
  test("a folder is counted with progress and shows kinds and sizes", async () => {
    await open([join(home, "tree")]);
    await waitFor(() => q('[data-group="kinds"]') || q(".fi-slot-folder .fi-note"), 5000, "the folder summary");
    const general = rowsOf("general");
    expect(general["Files"]).toBe("2");
    expect(general["Folders"]).toBe("1");
    expect(general["Total size"]).toContain("11 bytes");
    expect(q('[data-group="largest"]')).not.toBeNull();
    expect(q(".fi-slot-hashes").children).toHaveLength(0);
    await closeAll();
  });

  test("several items give one summary, and no save or fingerprints", async () => {
    await open([photo, plain, join(home, "tree")]);
    await loaded();
    expect(q(".fi-name").textContent).toBe("3 items");
    expect(rowsOf("general")["Files"]).toBe("4");
    expect(q(".fi-hashes")).toBeNull();
    await closeAll();
  });

  test("a link shows its own facts and a button to its target, whose window replaces it", async () => {
    if (!canSymlink) return;
    await open([join(pics, "shortcut.jpg")]);
    await waitFor(() => q(".fi-target"), 4000, "the target button");
    expect(rowsOf("general")["Link points to"]).toBe(photo);
    expect(q('[data-group="camera"]')).toBeNull();
    expect(q(".fi-hashes")).toBeNull();
    q(".fi-target").click();
    await waitFor(() => qa(".fi-dialog").length === 1 && q(".fi-name")?.textContent === "holiday.jpg", 3000, "the target window");
    await loaded();
    expect(q('[data-group="camera"]')).not.toBeNull();
    await closeAll();
  });

  test("an item that has gone is explained in words", async () => {
    await open([join(pics, "vanished.png")]);
    const msg = await waitFor(() => q(".fi-note[role=alert]"), 3000, "an error");
    expect(msg.textContent).toContain("doesn't exist");
    await closeAll();
  });

  test("a text file shows its encoding and line endings; an unreadable kind says so politely", async () => {
    writeFileSync(join(pics, "crlf.txt"), "a\r\nb\r\n");
    writeFileSync(join(pics, "blob.dat"), Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 37 + 1) & 255)));
    await open([join(pics, "crlf.txt")]);
    await loaded();
    expect(rowsOf("document")["Line endings"]).toBe("Windows (CRLF)");
    await open([join(pics, "blob.dat")]);
    await loaded();
    expect(q(".fi-slot-document").textContent).toContain("no detailed reader");
    await closeAll();
  });
});

describe("the Details panel photo strip", () => {
  // Earlier tests started folder refreshes that nobody waited for; let them finish so they can't change the selection later.
  beforeAll(async () => {
    await closeAll();
    await sleep(400);
    await nav.goTo(pics);
    await sleep(700);
    await nav.saveSettings({ showInfoPanel: true });
  });

  test("a photo shows its size, camera, date and exposure, and a “Has location” badge", async () => {
    selection.selectKeys([photo]);
    await info.renderInfo();
    const strip = await waitFor(() => q(".fi-photo", q("#info")), 3000, "the photo strip");
    expect(strip.getAttribute("aria-label")).toBe("Photo details");
    const facts = Object.fromEntries(qa("dt", strip).map((dt: any) => [dt.textContent, dt.nextElementSibling.textContent]));
    expect(facts).toMatchObject({ Size: "4032 × 3024", Camera: "Canon EOS R5", ISO: "ISO 400", Aperture: "f/2.8", Shutter: "1/250 s", "Focal length": "50 mm" });
    expect(facts["Taken"]).toContain("2024-05-01 12:34:56");
    const badge = q(".fi-badge", strip);
    expect(badge.textContent).toContain("Has location");
    expect(badge.title).toContain("This photo contains the location where it was taken");
    expect(qa("dt[title]", strip).length).toBeGreaterThan(3);
  });

  test("a picture without camera notes has no strip and no badge; text files and folders ask nothing", async () => {
    selection.selectKeys([plain]);
    state.settings.showInfoPanel = true;
    await info.renderInfo();
    await waitFor(() => q(".info-name", q("#info"))?.textContent === "flat.png", 3000, "flat.png in info panel");
    expect(q(".info-name", q("#info")).textContent).toBe("flat.png");
    expect(q(".fi-photo", q("#info"))).toBeNull();
    expect(q(".fi-badge", q("#info"))).toBeNull();
    selection.selectKeys([join(pics, "crlf.txt")]);
    state.settings.showInfoPanel = true;
    await info.renderInfo();
    await waitFor(() => q(".info-name", q("#info"))?.textContent === "crlf.txt", 3000, "crlf.txt in info panel");
    expect(q(".info-name", q("#info")).textContent).toBe("crlf.txt");
    expect(q(".fi-photo", q("#info"))).toBeNull();
  });
});

describe("the page rules", () => {
  test("nothing here uses innerHTML, and the window's own markup comes only from the helpers", () => {
    const dir = join(import.meta.dir, "..", "resources", "file_manager", "ui");
    for (const f of readdirSync(dir).filter((n) => /^fileinfo.*\.js$/.test(n))) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|eval\(|setAttribute\(\s*["']style|javascript:/);
      expect(text.split("\n").length, f).toBeLessThan(400);
    }
    expect(menus).toBeDefined();
  });
});
