import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { createContext } from "../src/features/filemanager/fmCore";
import {
  MAX_UPLOAD_DROP_BYTES,
  startFileManagerServer,
} from "../src/features/filemanager/fmServer";
import {
  DEFAULT_SETTINGS,
  MAX_SESSION_TABS,
  loadSettings,
  sanitizeSettings,
  updateSettings,
} from "../src/features/filemanager/fmSettings";

setDefaultTimeout(30_000);

const root = realpathSync(mkdtempSync(join(tmpdir(), "fm-tabs-dnd-")));
const home = join(root, "home");
const folderA = join(home, "alpha");
const folderB = join(home, "beta");
const folderC = join(home, "gamma");
const dataDir = join(root, "data");
const unitDataDir = join(root, "data-unit");

const GLOBALS = [
  "document",
  "window",
  "Node",
  "Element",
  "Event",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "navigator",
  "location",
  "fetch",
  "KeyboardEvent",
  "MouseEvent",
  "CustomEvent",
] as const;

const savedGlobals = new Map<string, PropertyDescriptor | undefined>();
let server: ReturnType<typeof startFileManagerServer>;
let dom: JSDOM;
let doc: Document;
let win: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  mkdirSync(folderA, { recursive: true });
  mkdirSync(folderB, { recursive: true });
  mkdirSync(folderC, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(unitDataDir, { recursive: true });
  writeFileSync(join(folderA, "one.txt"), "one");
  writeFileSync(join(folderB, "two.txt"), "two");

  server = startFileManagerServer({
    port: 0,
    token: "test-tabs-dnd-token",
    context: { home, dataDir },
  });

  const html = readFileSync(
    join(import.meta.dir, "..", "resources", "file_manager", "index.html"),
    "utf8",
  )
    .replaceAll("__FM_TOKEN__", server.token)
    .replaceAll("__FM_PLATFORM__", process.platform)
    .replaceAll("__FM_ARCH__", process.arch)
    .replaceAll("__FM_PHONON__", "0")
    .replaceAll("__FM_START__", "");

  dom = new JSDOM(html, { url: `http://127.0.0.1:${server.port}/` });
  win = dom.window;
  doc = win.document;

  for (const name of GLOBALS) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  const origFetch = globalThis.fetch;
  for (const name of GLOBALS) {
    if (name === "fetch") {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        writable: true,
        value: (input: any, init?: any) => {
          const url =
            typeof input === "string" && input.startsWith("/")
              ? `http://127.0.0.1:${server.port}${input}`
              : input;
          return origFetch(url, init);
        },
      });
      continue;
    }
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: win[name],
    });
  }
});

afterAll(() => {
  server?.stop(true);
  dom?.window?.close();
  for (const [name, desc] of savedGlobals) {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete (globalThis as any)[name];
  }
  rmSync(root, { recursive: true, force: true });
});

describe("sessionTabs & activeTabIndex settings validation", () => {
  const ctx = createContext({ home, dataDir: unitDataDir });

  test("defaults to empty sessionTabs and activeTabIndex 0", () => {
    expect(DEFAULT_SETTINGS.sessionTabs).toEqual([]);
    expect(DEFAULT_SETTINGS.activeTabIndex).toBe(0);
    const clean = sanitizeSettings({}, ctx);
    expect(clean.sessionTabs).toEqual([]);
    expect(clean.activeTabIndex).toBe(0);
  });

  test("sanitizes valid tabs, strips invalid entries, caps at 24, and clamps activeTabIndex", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      kind: "folder",
      path: join(home, `dir-${i}`),
      quickFilter: i === 0 ? "  *.ts\x00 " : "",
      kindFilter: i === 0 ? "code" : "INVALID!",
      scrollTop: i === 0 ? 142.7 : -5,
    }));
    const raw = {
      sessionTabs: [
        { kind: "trash", quickFilter: "report", scrollTop: 50 },
        { kind: "folder", path: "relative/not-allowed" },
        { kind: "unknown", path: folderA },
        ...many,
      ],
      activeTabIndex: 99,
    };
    const clean = sanitizeSettings(raw, ctx);
    expect(clean.sessionTabs.length).toBe(MAX_SESSION_TABS);
    expect(clean.sessionTabs[0]).toEqual({
      kind: "trash",
      quickFilter: "report",
      scrollTop: 50,
    });
    expect(clean.sessionTabs[1]).toEqual({
      kind: "folder",
      path: join(home, "dir-0"),
      quickFilter: "*.ts",
      kindFilter: "code",
      scrollTop: 143,
    });
    expect(clean.sessionTabs[2]).toEqual({
      kind: "folder",
      path: join(home, "dir-1"),
    });
    expect(clean.activeTabIndex).toBe(MAX_SESSION_TABS - 1);

    // Negative and NaN activeTabIndex clamp to 0
    expect(
      sanitizeSettings({ sessionTabs: [], activeTabIndex: 5 }, ctx)
        .activeTabIndex,
    ).toBe(0);
    expect(
      sanitizeSettings(
        {
          sessionTabs: [{ kind: "folder", path: folderA }],
          activeTabIndex: -3,
        },
        ctx,
      ).activeTabIndex,
    ).toBe(0);

    // Round-trip persistence via updateSettings + loadSettings
    await updateSettings(ctx, {
      sessionTabs: [
        { kind: "folder", path: folderA, quickFilter: "one" },
        { kind: "folder", path: folderB, kindFilter: "code", scrollTop: 80 },
      ],
      activeTabIndex: 1,
    });
    const loaded = await loadSettings(ctx);
    expect(loaded.sessionTabs).toEqual([
      { kind: "folder", path: folderA, quickFilter: "one" },
      { kind: "folder", path: folderB, kindFilter: "code", scrollTop: 80 },
    ]);
    expect(loaded.activeTabIndex).toBe(1);
  });
});

describe("ARIA tablist structure, keyboard navigation, closedTabs & session restore", () => {
  test("renders valid ARIA tablist with no nested buttons inside role=tab and add/dup outside tablist", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const { loadPlaces, goTo } =
      await import("../resources/file_manager/ui/nav.js");
    const tabs = await import("../resources/file_manager/ui/tabs.js");

    await loadPlaces();
    tabs.wireTabs();
    await goTo(folderA, { push: false });
    await tabs.openNewTab(folderB);

    const bar = doc.getElementById("tabbar")!;
    expect(bar.getAttribute("role")).toBeNull();

    const tablist = bar.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
    expect(tablist!.getAttribute("focusgroup")).toBe("tablist nomemory");
    expect(tablist!.getAttribute("aria-label")).toBe("Open folder tabs");

    // .fm-tab-dup and .fm-tab-add must be siblings outside role="tablist"
    const dupBtn = bar.querySelector(".fm-tab-dup");
    const addBtn = bar.querySelector(".fm-tab-add");
    expect(dupBtn).not.toBeNull();
    expect(addBtn).not.toBeNull();
    expect(tablist!.contains(dupBtn)).toBe(false);
    expect(tablist!.contains(addBtn)).toBe(false);
    expect(dupBtn!.parentElement).toBe(bar);
    expect(addBtn!.parentElement).toBe(bar);

    // Each .fm-tab wrapper has role="presentation"; role="tab" is on .fm-tab-select button itself
    const wrappers = [...tablist!.querySelectorAll(".fm-tab")];
    expect(wrappers.length).toBe(2);
    for (const w of wrappers) {
      expect(w.getAttribute("role")).toBe("presentation");
      expect(w.getAttribute("aria-selected")).toBeNull();
    }

    const tabBtns = [...tablist!.querySelectorAll('[role="tab"]')];
    expect(tabBtns.length).toBe(2);
    for (const btn of tabBtns) {
      expect(btn.tagName).toBe("BUTTON");
      expect(btn.classList.contains("fm-tab-select")).toBe(true);
      // No nested buttons inside role="tab"
      expect(btn.querySelector("button")).toBeNull();
    }

    // Active tab (index 1: folderB) has aria-selected="true", tabindex="0", focusgroupstart
    expect(tabBtns[0]!.getAttribute("aria-selected")).toBe("false");
    expect(tabBtns[0]!.getAttribute("tabindex")).toBe("-1");
    expect(tabBtns[0]!.hasAttribute("focusgroupstart")).toBe(false);

    expect(tabBtns[1]!.getAttribute("aria-selected")).toBe("true");
    expect(tabBtns[1]!.getAttribute("tabindex")).toBe("0");
    expect(tabBtns[1]!.hasAttribute("focusgroupstart")).toBe(true);

    // Keyboard navigation fallback (when focusGroup is not in HTMLElement.prototype) + scrollIntoView
    let scrollCalls = 0;
    const origScrollIntoView = (win.HTMLElement.prototype as any)
      .scrollIntoView;
    (win.HTMLElement.prototype as any).scrollIntoView = function () {
      scrollCalls++;
    };
    try {
      const ev = new win.KeyboardEvent("keydown", {
        key: "ArrowLeft",
        bubbles: true,
        cancelable: true,
      });
      tabBtns[1]!.dispatchEvent(ev);
      await sleep(60);
      expect(state.location.path).toBe(folderA);
      expect(scrollCalls).toBeGreaterThanOrEqual(1);

      const activeBtnNow = bar.querySelector(
        '[role="tab"][aria-selected="true"]',
      )!;
      activeBtnNow.dispatchEvent(
        new win.KeyboardEvent("keydown", {
          key: "End",
          bubbles: true,
          cancelable: true,
        }),
      );
      await sleep(60);
      expect(state.location.path).toBe(folderB);
    } finally {
      (win.HTMLElement.prototype as any).scrollIntoView = origScrollIntoView;
    }
  });

  test("caps closedTabs at 12 and reopens most recently closed tab", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const tabs = await import("../resources/file_manager/ui/tabs.js");

    state.closedTabs = [];
    await tabs.closeOtherTabs((state.tabs[0] as any).id);
    for (let i = 0; i < 15; i++) {
      await tabs.openNewTab(i % 2 === 0 ? folderB : folderC);
      await tabs.closeTab(state.activeTabId);
    }
    expect(state.closedTabs.length).toBe(12);

    const reopened = await tabs.reopenClosedTab();
    expect(reopened).not.toBeNull();
    expect(reopened!.location.path).toBe(folderB);
    expect(state.closedTabs.length).toBe(11);
  });

  test("restores saved sessionTabs on boot and skips when explicit startup path differs", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const tabs = await import("../resources/file_manager/ui/tabs.js");

    // Reset to single tab and configure saved sessionTabs
    state.tabs = [];
    state.activeTabId = 0;
    (state.settings as any).sessionTabs = [
      { kind: "folder", path: folderA, quickFilter: "one" },
      { kind: "folder", path: folderB, kindFilter: "code" },
      { kind: "folder", path: folderC },
    ];
    (state.settings as any).activeTabIndex = 1;

    // 1. Explicit startup path override differing from active saved tab (folderB) skips restore
    const startMeta = doc.querySelector('meta[name="fm-start"]')!;
    startMeta.setAttribute("content", encodeURIComponent(folderC));
    const skipped = await tabs.restoreSessionTabs();
    expect(skipped).toBe(false);
    expect(state.tabs.length).toBeLessThanOrEqual(1);

    // 2. Clearing startup override allows restore of all 3 tabs with index 1 active
    startMeta.setAttribute("content", "");
    const restored = await tabs.restoreSessionTabs();
    expect(restored).toBe(true);
    expect(state.tabs.length).toBe(3);
    expect(state.location.path).toBe(folderB);
    expect(state.kindFilter).toBe("code");

    // 3. Debounced persistence writes updated sessionTabs to settings
    await tabs.openNewTab(folderA);
    await sleep(450);
    const saved = JSON.parse(
      readFileSync(join(dataDir, "file_manager.json"), "utf8"),
    );
    expect(saved.sessionTabs.length).toBe(4);
    expect(saved.activeTabIndex).toBe(3);
  });
});

describe("POST /api/upload-drop & dnd.js external OS file drop", () => {
  const baseUrl = () => `http://127.0.0.1:${server.port}`;

  test("rejects unauthorized requests without valid x-fm-token", async () => {
    const res = await fetch(
      `${baseUrl()}/api/upload-drop?dir=${encodeURIComponent(folderA)}&name=secret.txt`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: "nope",
      },
    );
    expect(res.status).toBe(401);
  });

  test("writes raw bytes atomically, avoids overwriting existing files, and rejects invalid names", async () => {
    // Upload a new file via raw bytes
    const res1 = await fetch(
      `${baseUrl()}/api/upload-drop?dir=${encodeURIComponent(folderA)}&name=notes.txt`,
      {
        method: "POST",
        headers: {
          "x-fm-token": server.token,
          "Content-Type": "text/plain",
        },
        body: "hello drop world",
      },
    );
    expect(res1.status).toBe(200);
    const data1 = (await res1.json()) as any;
    expect(data1.ok).toBe(true);
    expect(data1.name).toBe("notes.txt");
    expect(readFileSync(data1.path, "utf8")).toBe("hello drop world");

    // Second upload with same name picks a non-overwriting unique filename
    const res2 = await fetch(
      `${baseUrl()}/api/upload-drop?dir=${encodeURIComponent(folderA)}&name=notes.txt`,
      {
        method: "POST",
        headers: {
          "x-fm-token": server.token,
          "Content-Type": "text/plain",
        },
        body: "second copy",
      },
    );
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as any;
    expect(data2.ok).toBe(true);
    expect(data2.name).not.toBe("notes.txt");
    expect(readFileSync(data1.path, "utf8")).toBe("hello drop world");
    expect(readFileSync(data2.path, "utf8")).toBe("second copy");

    // Multipart/form-data upload also works
    const form = new FormData();
    form.append("dir", folderA);
    form.append(
      "file",
      new Blob(["multipart payload"], { type: "text/plain" }),
      "nested/path/multi.txt",
    );
    const res3 = await fetch(`${baseUrl()}/api/upload-drop`, {
      method: "POST",
      headers: { "x-fm-token": server.token },
      body: form,
    });
    expect(res3.status).toBe(200);
    const data3 = (await res3.json()) as any;
    expect(data3.ok).toBe(true);
    expect(data3.name).toBe("multi.txt");
    expect(readFileSync(data3.path, "utf8")).toBe("multipart payload");

    // Rejects invalid name like ".."
    const badName = await fetch(
      `${baseUrl()}/api/upload-drop?dir=${encodeURIComponent(folderA)}&name=..`,
      {
        method: "POST",
        headers: { "x-fm-token": server.token },
        body: "x",
      },
    );
    expect(badName.status).toBe(400);

    // Rejects oversized payload (> 32 MiB) via Content-Length without triggering Windows ECONNRESET on a 32 MiB body stream
    const http = await import("node:http");
    const tooBigStatus = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        `${baseUrl()}/api/upload-drop?dir=${encodeURIComponent(folderA)}&name=huge.bin`,
        {
          method: "POST",
          headers: {
            "x-fm-token": server.token,
            "Content-Type": "application/octet-stream",
            "Content-Length": String(MAX_UPLOAD_DROP_BYTES + 1),
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
          req.destroy();
        },
      );
      req.on("error", (err: any) => {
        if (err?.code === "ECONNRESET") return;
        reject(err);
      });
      req.write(Buffer.alloc(16));
    });
    expect(tooBigStatus).toBe(413);
  });

  test("dnd.js attachDropTarget highlights copy on external Files dragover and uploads on drop (ignoring trash)", async () => {
    const { attachDropTarget, drag } =
      await import("../resources/file_manager/ui/dnd.js");
    drag.paths = [];

    // Non-trash folder target
    const target = doc.createElement("div");
    doc.body.append(target);
    attachDropTarget(target, { getPath: () => folderC });

    const dtOver: any = { types: ["Files"], dropEffect: "none" };
    const overEv = new win.Event("dragover", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(overEv, "dataTransfer", { value: dtOver });
    target.dispatchEvent(overEv);

    expect(overEv.defaultPrevented).toBe(true);
    expect(dtOver.dropEffect).toBe("copy");
    expect(target.classList.contains("drop-target")).toBe(true);

    // Drop a File onto folderC
    const droppedFile = new File(["external file body"], "from-os.txt", {
      type: "text/plain",
    });
    const dtDrop: any = { types: ["Files"], files: [droppedFile] };
    const dropEv = new win.Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(dropEv, "dataTransfer", { value: dtDrop });
    target.dispatchEvent(dropEv);

    await sleep(150);
    expect(target.classList.contains("drop-target")).toBe(false);
    const landed = join(folderC, "from-os.txt");
    expect(existsSync(landed)).toBe(true);
    expect(readFileSync(landed, "utf8")).toBe("external file body");

    // Trash target ignores external OS file drags
    const trashTarget = doc.createElement("div");
    doc.body.append(trashTarget);
    attachDropTarget(trashTarget, { trash: true });
    const dtTrash: any = { types: ["Files"], dropEffect: "none" };
    const trashOver = new win.Event("dragover", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(trashOver, "dataTransfer", { value: dtTrash });
    trashTarget.dispatchEvent(trashOver);
    expect(trashOver.defaultPrevented).toBe(false);
    expect(trashTarget.classList.contains("drop-target")).toBe(false);
  });
});
