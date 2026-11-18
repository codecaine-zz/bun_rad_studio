import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-ignore
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

const UI_DIR = join(import.meta.dir, "..", "resources", "file_manager", "ui");
const INDEX_HTML_PATH = join(
  import.meta.dir,
  "..",
  "resources",
  "file_manager",
  "index.html",
);
const CHROME_BIN =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const PLATFORMS = ["darwin", "win32", "linux"] as const;
type Platform = (typeof PLATFORMS)[number];

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
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "ResizeObserver",
  "MouseEvent",
  "KeyboardEvent",
  "CSS",
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

describe("Cross-OS File Manager Frontend QA: HTTP, CSP, Paths, Shortcuts & CSS Contracts", () => {
  test("startFileManagerServer emits exact <meta name='fm-platform'>, strict CSP nonce, 200 UI assets, and valid places across darwin/win32/linux", async () => {
    const prevScreenshot = process.env.SCREENSHOT_MODE;
    process.env.SCREENSHOT_MODE = "1";
    try {
      for (const platform of PLATFORMS) {
        const root = mkdtempSync(
          join(tmpdir(), `fm-crossos-http-${platform}-`),
        );
        const home = join(root, "home");
        const dataDir = join(root, "data");
        mkdirSync(join(home, "Documents"), { recursive: true });
        writeFileSync(join(home, "note.txt"), "cross-os test\n");
        const token = `crossos-${platform}-token`;
        const server = startFileManagerServer({
          port: 0,
          token,
          context: { platform, home, dataDir },
        });
        const base = `http://127.0.0.1:${server.port}`;

        try {
          const res = await fetch(`${base}/`);
          expect(res.status).toBe(200);
          const html = await res.text();
          expect(html).toContain(
            `<meta name="fm-platform" content="${platform}" />`,
          );
          expect(html).not.toContain("__FM_TOKEN__");
          expect(html).not.toContain("__FM_PLATFORM__");
          expect(html).not.toContain("__FM_NONCE__");

          const nonceMatch =
            /<meta\s+name="fm-nonce"\s+content="([^"]+)"/i.exec(html);
          expect(nonceMatch).toBeTruthy();
          const nonce = nonceMatch![1]!;
          const csp = res.headers.get("content-security-policy") || "";
          expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
          expect(csp).not.toContain("'unsafe-inline'");
          expect(csp).toContain("script-src 'self';");

          for (const asset of [
            "/ui/main.js",
            "/ui/dom.js",
            "/ui/util.js",
            "/ui/power.css",
            "/ui/phonon.css",
            "/ui/code.css",
            "/ui/views.css",
            "/ui/style.css",
            "/ui/subs.css",
          ]) {
            const ar = await fetch(`${base}${asset}`);
            expect(ar.status, `HTTP status for ${asset} on ${platform}`).toBe(
              200,
            );
          }

          const placesRes = await fetch(`${base}/api/places`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-fm-token": token,
            },
            body: JSON.stringify({}),
          });
          expect(placesRes.status).toBe(200);
          const places = (await placesRes.json()) as any;
          expect(places.separator).toBe(
            process.platform === "win32" ? "\\" : "/",
          );
          expect(Array.isArray(places.places)).toBe(true);
          expect(Array.isArray(places.drives)).toBe(true);
        } finally {
          server.stop(true);
          rmSync(root, { recursive: true, force: true });
        }
      }
    } finally {
      if (prevScreenshot === undefined) delete process.env.SCREENSHOT_MODE;
      else process.env.SCREENSHOT_MODE = prevScreenshot;
    }
  });

  test("util.js and serve.js handle POSIX, Windows drive, UNC, and file:// paths without corruption", async () => {
    const util = await import("../resources/file_manager/ui/util.js");
    const serve = await import("../resources/file_manager/ui/serve.js");

    expect(util.isWindowsPath("C:\\Users\\Demo")).toBe(true);
    expect(util.isWindowsPath("D:\\")).toBe(true);
    expect(util.isWindowsPath("\\\\server\\share\\folder")).toBe(true);
    expect(util.isWindowsPath("/Users/demo")).toBe(false);

    expect(util.isAbsolutePath("/Users/demo/a.txt")).toBe(true);
    expect(util.isAbsolutePath("C:\\Users\\Demo\\a.txt")).toBe(true);
    expect(util.isAbsolutePath("C:/Users/Demo/a.txt")).toBe(true);
    expect(util.isAbsolutePath("\\\\server\\share\\a.txt")).toBe(true);
    expect(util.isAbsolutePath("docs/a.txt")).toBe(false);

    expect(util.parentOf("/", "/")).toBeNull();
    expect(util.parentOf("/readme.md", "/")).toBe("/");
    expect(util.parentOf("C:\\", "\\")).toBeNull();
    expect(util.parentOf("C:\\Users", "\\")).toBe("C:\\");
    expect(util.parentOf("C:\\Users\\Demo\\a.txt", "\\")).toBe(
      "C:\\Users\\Demo",
    );
    expect(util.parentOf("\\\\server\\share", "\\")).toBeNull();
    expect(util.parentOf("\\\\server\\share\\", "\\")).toBeNull();
    expect(util.parentOf("\\\\server\\share\\docs\\a.txt", "\\")).toBe(
      "\\\\server\\share\\docs",
    );

    expect(util.splitPath("\\\\server\\share\\docs\\a.txt", "\\")).toEqual([
      { name: "\\\\server\\share", path: "\\\\server\\share", root: true },
      { name: "docs", path: "\\\\server\\share\\docs" },
      { name: "a.txt", path: "\\\\server\\share\\docs\\a.txt" },
    ]);
    expect(util.splitPath("C:\\Users\\Demo", "\\")).toEqual([
      { name: "C:", path: "C:\\", root: true },
      { name: "Users", path: "C:\\Users" },
      { name: "Demo", path: "C:\\Users\\Demo" },
    ]);

    expect(
      util.isInside(
        "C:\\Users\\Demo\\Notes.txt",
        "c:\\users\\demo",
        "\\",
        true,
      ),
    ).toBe(true);
    expect(
      util.isInside(
        "C:\\Users\\Demo2\\Notes.txt",
        "C:\\Users\\Demo",
        "\\",
        true,
      ),
    ).toBe(false);
    expect(util.isInside("/Users/demo2/a", "/Users/demo", "/", false)).toBe(
      false,
    );

    expect(util.samePath("C:\\Docs", "c:\\docs")).toBe(true);
    expect(util.samePath("/Users/Demo", "/Users/demo")).toBe(false);

    expect(
      util.resolveLocalMediaPath("logo.png", "/readme.md", "/home", "/"),
    ).toBe("/logo.png");
    expect(
      util.resolveLocalMediaPath(
        "../img/pic.png",
        "/docs/sub/guide.md",
        "/",
        "/",
      ),
    ).toBe("/docs/img/pic.png");
    expect(
      util.resolveLocalMediaPath(
        "img/a.png",
        "C:\\Users\\Demo\\readme.md",
        "C:\\",
        "\\",
      ),
    ).toBe("C:\\Users\\Demo\\img\\a.png");
    expect(
      util.resolveLocalMediaPath(
        "file:///C:/Users/Demo/a%20b.png",
        "/tmp/x.md",
        "/",
        "/",
      ),
    ).toBe("C:\\Users\\Demo\\a b.png");
    expect(
      util.resolveLocalMediaPath(
        "file://server/share/docs/pic.png",
        "/tmp/x.md",
        "/",
        "/",
      ),
    ).toBe("\\\\server\\share\\docs\\pic.png");
    expect(
      util.resolveLocalMediaPath(
        "sub/x.png",
        "\\\\server\\share\\docs\\readme.md",
        "\\\\server\\share",
        "\\",
      ),
    ).toBe("\\\\server\\share\\docs\\sub\\x.png");
    expect(
      util.resolveLocalMediaPath(
        "https://example.com/a.png",
        "/x.md",
        "/",
        "/",
      ),
    ).toBe("");
    expect(
      util.resolveLocalMediaPath("javascript:alert(1)", "/x.md", "/", "/"),
    ).toBe("");

    expect(serve.relativeTo("C:\\", "C:\\app\\index.html")).toBe(
      "app\\index.html",
    );
    expect(serve.relativeTo("C:\\Site", "c:\\site\\src\\app.js")).toBe(
      "src\\app.js",
    );
    expect(serve.relativeTo("C:\\Site", "C:\\Site2\\index.html")).toBe("");
    expect(serve.relativeTo("/var/www", "/var/www/index.html")).toBe(
      "index.html",
    );
  });

  test("shortcuts.js and codeKeys.js format Darwin vs Win32/Linux shortcuts without Mod+ leakage", async () => {
    const shortcuts = await import("../resources/file_manager/ui/shortcuts.js");
    const codeKeys = await import("../resources/file_manager/ui/codeKeys.js");

    expect(shortcuts.formatShortcut("Mod+Shift+P", "darwin")).toBe("⌘⇧P");
    expect(shortcuts.formatShortcut("Mod+Shift+P", "win32")).toBe(
      "Ctrl+Shift+P",
    );
    expect(shortcuts.formatShortcut("Mod+Shift+P", "linux")).toBe(
      "Ctrl+Shift+P",
    );
    expect(shortcuts.formatShortcut("Alt+6", "darwin")).toBe("⌥6");
    expect(shortcuts.formatShortcut("Alt+6", "win32")).toBe("Alt+6");
    expect(shortcuts.formatShortcut("Alt+6", "linux")).toBe("Alt+6");

    expect(codeKeys.shortcutText("aiChat", "darwin")).toBe("⌘⇧I");
    expect(codeKeys.shortcutText("aiChat", "win32")).toBe("Ctrl+Shift+I");
    expect(codeKeys.shortcutText("aiChat", "linux")).toBe("Ctrl+Shift+I");
  });

  test("CSS files enforce #app.power-max clearance and responsive overflow containment", () => {
    const powerCss = readFileSync(join(UI_DIR, "power.css"), "utf8");
    const phononCss = readFileSync(join(UI_DIR, "phonon.css"), "utf8");
    const codeCss = readFileSync(join(UI_DIR, "code.css"), "utf8");
    const databasesCss = readFileSync(join(UI_DIR, "databases.css"), "utf8");
    const viewsCss = readFileSync(join(UI_DIR, "views.css"), "utf8");
    const styleCss = readFileSync(join(UI_DIR, "style.css"), "utf8");
    const subsCss = readFileSync(join(UI_DIR, "subs.css"), "utf8");

    expect(powerCss).toContain("#app.power-max");
    expect(powerCss).toContain("padding-top: 3rem;");
    expect(phononCss).toContain(
      "#app.power-max .power-pane.phonon-studio-root",
    );
    expect(phononCss).toContain(".phonon-hidden-file-input");
    expect(codeCss).toContain("#app.power-max .power-pane.code-root");
    expect(codeCss).toContain(".code-tabs[hidden]");
    expect(databasesCss).toContain("#app.power-max:not(.db-studio-max)");
    expect(viewsCss).toContain("#viewbar {");
    expect(viewsCss).toContain("overflow-x: auto;");
    expect(viewsCss).toContain("#dual-pane {");
    expect(styleCss).toContain("#status {");
    expect(subsCss).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(powerCss).toContain("minmax(min(380px, 100%), 1fr)");
  });
});

describe("Cross-OS JSDOM UI Regression Checks across darwin/win32/linux", () => {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const root = mkdtempSync(join(tmpdir(), "fm-crossos-jsdom-"));
  const home = join(root, "home");
  const dataDir = join(root, "data");

  let server: ReturnType<typeof startFileManagerServer>;
  let dom: JSDOM;
  let win: any;
  let doc: any;
  let stateMod: any;
  let domMod: any;
  let powerMod: any;
  let toolbarMod: any;
  let sidebarMod: any;
  let homeMod: any;
  let homeTilesMod: any;
  let workspaceMod: any;
  let commandPaletteMod: any;
  let contextmenuMod: any;
  let favoritesMod: any;
  let menusMod: any;
  let codeTabsMod: any;
  let codeDocsMod: any;
  let navMod: any;

  let origPlatform: string;
  let origSep: string;

  beforeAll(async () => {
    mkdirSync(join(home, "Documents"), { recursive: true });
    writeFileSync(join(home, "sample.mp3"), Buffer.from("ID3demo"));
    writeFileSync(join(home, "notes.txt"), "hello world\n");

    server = startFileManagerServer({
      port: 0,
      token: "jsdom-crossos-token",
      context: { platform: "darwin", home, dataDir },
    });
    const base = `http://127.0.0.1:${server.port}`;
    const html = readFileSync(INDEX_HTML_PATH, "utf8")
      .replace(/__FM_TOKEN__/g, "jsdom-crossos-token")
      .replace(/__FM_PLATFORM__/g, "darwin")
      .replace(/__FM_NONCE__/g, "test-nonce");

    dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
    win = dom.window;
    doc = win.document;

    const g = globalThis as any;
    for (const key of GLOBALS) {
      saved.set(key, Object.getOwnPropertyDescriptor(g, key));
    }
    for (const key of GLOBALS.filter((k) => k !== "fetch")) {
      const val = win[key];
      Object.defineProperty(g, key, {
        value:
          typeof val === "function" &&
          key !== "Node" &&
          !key.endsWith("Event") &&
          !key.startsWith("HTML") &&
          key !== "Element"
            ? val.bind(win)
            : val,
        configurable: true,
        writable: true,
      });
    }
    Object.defineProperty(g, "ResizeObserver", {
      value: class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(g, "CSS", {
      value: { escape: (s: string) => String(s) },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(g, "requestAnimationFrame", {
      value: (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 0),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(g, "cancelAnimationFrame", {
      value: (id: number) => clearTimeout(id),
      configurable: true,
      writable: true,
    });
    const realFetch = saved.get("fetch")!.value as typeof fetch;
    Object.defineProperty(g, "fetch", {
      value: (u: any, o: any) =>
        realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o),
      configurable: true,
      writable: true,
    });

    stateMod = await import("../resources/file_manager/ui/state.js");
    // The terminal loads /vendor/xterm.mjs in browsers; stub terminal.js cleanly for JSDOM module loading.
    mock.module("../resources/file_manager/ui/terminal.js", () => ({
      terminalShell: () => "posix",
      terminalWsl: () => ({}),
      terminalAvailable: () => false,
      typeInTerminal: () => false,
      showTerminal() {},
      hideTerminal() {},
      toggleTerminal() {},
      wireTerminal() {},
      isTerminalOpen: () => false,
    }));
    domMod = await import("../resources/file_manager/ui/dom.js");
    powerMod = await import("../resources/file_manager/ui/power.js");
    toolbarMod = await import("../resources/file_manager/ui/toolbar.js");
    sidebarMod = await import("../resources/file_manager/ui/sidebar.js");
    homeMod = await import("../resources/file_manager/ui/home.js");
    homeTilesMod = await import("../resources/file_manager/ui/homeTiles.js");
    workspaceMod = await import("../resources/file_manager/ui/workspace.js");
    commandPaletteMod =
      await import("../resources/file_manager/ui/commandPalette.js");
    contextmenuMod =
      await import("../resources/file_manager/ui/contextmenu.js");
    favoritesMod = await import("../resources/file_manager/ui/favorites.js");
    menusMod = await import("../resources/file_manager/ui/menus.js");
    codeTabsMod = await import("../resources/file_manager/ui/codeTabs.js");
    codeDocsMod = await import("../resources/file_manager/ui/codeDocs.js");
    navMod = await import("../resources/file_manager/ui/nav.js");

    await import("../resources/file_manager/ui/phonon.js");
    await import("../resources/file_manager/ui/transcribe.js");

    origPlatform = stateMod.state.platform;
    origSep = stateMod.state.sep;

    powerMod.resetPower();
    powerMod.wirePower();
    toolbarMod.wireToolbar();
    commandPaletteMod.wireCommandPalette();
    homeTilesMod.registerHomeTiles();
    await navMod.loadPlaces();
  });

  afterAll(async () => {
    try {
      menusMod?.closeMenu?.();
      powerMod?.resetPower?.();
      stateMod.state.platform = origPlatform;
      stateMod.state.sep = origSep;
      await sleep(30);
    } finally {
      const g = globalThis as any;
      for (const key of GLOBALS) {
        const before = saved.get(key);
        if (before) Object.defineProperty(g, key, before);
        else delete g[key];
      }
      mock.restore();
      server.stop(true);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("dom.js h() applies style objects via CSSOM instead of coercing to [object Object]", () => {
    const el = domMod.h("div", {
      style: { display: "none", paddingTop: "8px", "--test-gap": "4px" },
    });
    expect(el.style.display).toBe("none");
    expect(el.style.paddingTop).toBe("8px");
    expect(el.style.getPropertyValue("--test-gap")).toBe("4px");
    expect(el.getAttribute("style")).not.toContain("[object Object]");
  });

  test("codeTabs.js removes role='tablist' and hides strip when 0 tabs are open; codeDocs.reset() clears tabs", () => {
    const strip = doc.createElement("div");
    strip.setAttribute("role", "tablist");
    codeTabsMod.renderTabs(strip, [], null, {
      activate() {},
      close() {},
      closeOthers() {},
      closeAll() {},
      copyPath() {},
      reveal() {},
    });
    expect(strip.hidden).toBe(true);
    expect(strip.hasAttribute("role")).toBe(false);

    const store = codeDocsMod.createDocs();
    store.newUntitled("hello");
    expect(store.list().length).toBe(1);
    codeTabsMod.renderTabs(strip, store.list(), store.active?.id, {
      activate() {},
      close() {},
      closeOthers() {},
      closeAll() {},
      copyPath() {},
      reveal() {},
    });
    expect(strip.hidden).toBe(false);
    expect(strip.getAttribute("role")).toBe("tablist");
    expect(strip.querySelectorAll('[role="tab"]').length).toBe(1);

    store.reset();
    expect(store.list().length).toBe(0);
  });

  test("Cross-OS UI labels, shortcuts, sidebar places, home tiles, command palette & context menu adapt cleanly for darwin, win32, and linux", async () => {
    for (const platform of PLATFORMS) {
      const expectedMod = platform === "darwin" ? "⌘" : "Ctrl+";
      const expectedAlt = platform === "darwin" ? "⌥" : "Alt+";
      const expectedPaletteShortcut =
        platform === "darwin" ? "⌘⇧P" : "Ctrl+Shift+P";
      const expectedAddrShortcut = platform === "darwin" ? "⌘L" : "Ctrl+L";

      stateMod.state.platform = platform;
      stateMod.state.sep = platform === "win32" ? "\\" : "/";
      stateMod.state.location = { kind: "folder", path: home };
      stateMod.state.cliUtilsDir =
        platform === "win32" ? "C:\\Tools\\cli_utils" : `${home}/cli_utils`;
      stateMod.state.cliAppsDir = "";
      stateMod.state.settings.focusMode = false;

      // Viewbar + Toolbar + Home + Sidebar
      stateMod.emit("settings");
      toolbarMod.updateToolbar();
      homeMod.renderHome();
      sidebarMod.renderSidebar();

      expect(doc.getElementById("edit-address")?.title).toContain(
        expectedAddrShortcut,
      );
      expect(doc.getElementById("viewbar-palette")?.title).toContain(
        expectedPaletteShortcut,
      );
      expect(doc.getElementById("viewbar-transcribe")).toBeTruthy();
      expect(doc.getElementById("tool-transcribe")).toBeTruthy();

      // Sidebar contains Ollama TTS + Audio to Text even without cliUtilsDir
      stateMod.state.cliUtilsDir = "";
      sidebarMod.renderSidebar();
      const sideLabels = [...doc.querySelectorAll("#sidebar .sl")].map(
        (el: any) => el.textContent,
      );
      expect(sideLabels).toContain("Ollama TTS");
      expect(sideLabels).toContain("Audio to Text");

      // Home tile includes Audio to Text & zero Mod+ literals
      const homeTileTitles = [...doc.querySelectorAll("#home .ht-title")].map(
        (el: any) => el.textContent,
      );
      expect(homeTileTitles).toContain("Audio to Text");
      const homePaletteBtn = [
        ...doc.querySelectorAll("#home .home-quick"),
      ].find((el: any) =>
        (el.getAttribute("title") || "").includes("Command Palette"),
      );
      expect(homePaletteBtn).toBeTruthy();
      expect(homePaletteBtn?.getAttribute("title")).toContain(
        expectedPaletteShortcut,
      );

      // Focus toggle uses platform Alt/Option modifier both on and off
      workspaceMod.toggleFocusMode();
      expect(doc.getElementById("focus-toggle")?.title).toContain(
        `${expectedAlt}6`,
      );
      workspaceMod.toggleFocusMode();
      expect(doc.getElementById("focus-toggle")?.title).toContain(
        `${expectedAlt}6`,
      );

      // Command palette footer & workspace items
      const cpDlg = commandPaletteMod.openCommandPalette("");
      try {
        const cpFooter =
          doc.querySelector(".cp-dialog .cp-footer")?.textContent || "";
        expect(cpFooter).toContain(
          platform === "darwin" ? "⌘Enter" : "Ctrl+Enter",
        );
        expect(cpFooter).not.toMatch(/\bMod\+/);
        const catalog = commandPaletteMod.buildPaletteCatalog();
        const wsFiles = catalog.find((c: any) => c.id === "view.ws.files");
        expect(wsFiles?.shortcut).toBe(`${expectedAlt}1`);
      } finally {
        cpDlg?.close?.(null);
        menusMod.closeMenu();
      }

      // No literal "Mod+" in any [title] in DOM
      const literalModTitles = [...doc.querySelectorAll("[title]")].filter(
        (el: any) => /\bMod\+/.test(el.getAttribute("title") || ""),
      );
      expect(literalModTitles).toEqual([]);

      // Context menu for audio file & Win32 CLI utility case-insensitive match
      contextmenuMod.showEntryMenu(
        [
          {
            name: "sample.mp3",
            path:
              platform === "win32"
                ? "C:\\Users\\Demo\\sample.mp3"
                : `${home}/sample.mp3`,
            isDir: false,
            size: 1024,
            kind: "Sound",
          },
        ],
        { x: 50, y: 50 },
      );
      const audioLabels = [
        ...doc.querySelectorAll(".menu .menu-item .menu-label"),
      ].map((el: any) => el.textContent);
      expect(audioLabels).toContain("Transcribe Audio to Text…");
      expect(audioLabels).toContain("Generate Subtitles (.SRT)");
      menusMod.closeMenu();

      if (platform === "win32") {
        stateMod.state.cliUtilsDir = "c:\\tools\\cli_utils";
        contextmenuMod.showEntryMenu(
          [
            {
              name: "mytool.exe",
              path: "C:\\TOOLS\\CLI_UTILS\\mytool.exe",
              isDir: false,
              size: 1024,
              kind: "Program",
            },
          ],
          { x: 50, y: 50 },
        );
        const cliLabels = [
          ...doc.querySelectorAll(".menu .menu-item .menu-label"),
        ].map((el: any) => el.textContent);
        expect(cliLabels).toContain("Put .\\mytool.exe in Terminal");
        expect(cliLabels).toContain("Run .\\mytool.exe in Terminal");
        menusMod.closeMenu();
      } else {
        expect(expectedMod === "⌘" || expectedMod === "Ctrl+").toBe(true);
      }
    }
  });

  test("favorites.js matches Windows paths case-insensitively", () => {
    stateMod.state.platform = "win32";
    stateMod.state.sep = "\\";
    stateMod.state.settings.favorites = ["C:\\Users\\Demo\\Projects"];
    stateMod.state.settings.favoriteNames = {
      "C:\\Users\\Demo\\Projects": "My Win Projects",
    };
    expect(favoritesMod.isFavorite("c:\\users\\demo\\projects")).toBe(true);
    expect(favoritesMod.favoriteName("c:\\users\\demo\\projects")).toBe(
      "My Win Projects",
    );
  });
});

describe("Live Headless Google Chrome CDP Cross-OS QA", () => {
  test("Chrome CDP renders darwin, win32, and linux across Desktop/Mobile, themes, Power Studios (?max=1), and menus with 0 errors and 0 overflow", async () => {
    if (!existsSync(CHROME_BIN)) {
      // Headless Chrome binary only exists on macOS host in this environment.
      return;
    }

    const prevScreenshot = process.env.SCREENSHOT_MODE;
    process.env.SCREENSHOT_MODE = "1";
    const port = await freePort();
    const userDataDir = mkdtempSync(join(tmpdir(), "fm-crossos-chrome-"));
    const proc = Bun.spawn(
      [
        CHROME_BIN,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        "about:blank",
      ],
      { stdout: "ignore", stderr: "ignore" },
    );

    let ws: WebSocket | null = null;
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const httpErrors: string[] = [];

    try {
      let pageTarget: { type: string; webSocketDebuggerUrl: string } | null =
        null;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/json/list`);
          if (r.ok) {
            const list = (await r.json()) as any[];
            const found = list.find((t) => t.type === "page");
            if (found) {
              pageTarget = found;
              break;
            }
          }
        } catch {}
        await sleep(100);
      }
      expect(pageTarget).toBeTruthy();

      ws = new WebSocket(pageTarget!.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        ws!.addEventListener("open", () => resolve(), { once: true });
        ws!.addEventListener("error", (e) => reject(e), { once: true });
      });

      let seq = 0;
      const pending = new Map<
        number,
        { resolve: (v: any) => void; reject: (e: Error) => void }
      >();
      const listeners = new Map<string, Set<(p: any) => void>>();
      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (typeof msg.id === "number") {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message));
            else p.resolve(msg.result);
          }
        } else if (msg.method) {
          for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
        }
      });

      const send = (method: string, params: Record<string, any> = {}) => {
        const id = ++seq;
        ws!.send(JSON.stringify({ id, method, params }));
        return new Promise<any>((resolve, reject) => {
          pending.set(id, { resolve, reject });
        });
      };
      const on = (event: string, fn: (p: any) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(fn);
      };
      const evalJs = async (expression: string) => {
        const res = await send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (res.exceptionDetails) {
          throw new Error(
            `Eval exception: ${res.exceptionDetails.text} ${JSON.stringify(res.exceptionDetails.exception)}`,
          );
        }
        return res.result?.value;
      };

      await send("Page.enable");
      await send("Runtime.enable");
      await send("Network.enable");
      await send("Log.enable");

      on("Runtime.exceptionThrown", (p) => {
        pageErrors.push(
          p.exceptionDetails?.exception?.description ||
            p.exceptionDetails?.text ||
            "pageerror",
        );
      });
      on("Runtime.consoleAPICalled", (p) => {
        if (p.type === "error") {
          consoleErrors.push(
            (p.args || [])
              .map((a: any) => a.value ?? a.description ?? "")
              .join(" "),
          );
        }
      });
      on("Log.entryAdded", (p) => {
        if (p.entry?.level === "error") {
          consoleErrors.push(`[Log:${p.entry.source}] ${p.entry.text}`);
        }
      });
      on("Network.responseReceived", (p) => {
        if (p.response.status >= 400) {
          httpErrors.push(`${p.response.status} ${p.response.url}`);
        }
      });

      const waitForReady = async () => {
        for (let i = 0; i < 75; i++) {
          const ok = await evalJs(
            `document.body && document.body.classList.contains("ready")`,
          );
          if (ok) return;
          await sleep(80);
        }
        throw new Error("Timed out waiting for document.body.ready");
      };

      for (const platform of PLATFORMS) {
        const root = mkdtempSync(join(tmpdir(), `fm-cdp-qa-${platform}-`));
        const home = join(root, "home");
        const dataDir = join(root, "data");
        mkdirSync(join(home, "Documents"), { recursive: true });
        writeFileSync(join(home, "sample.mp3"), Buffer.from("ID3demo"));
        writeFileSync(join(home, "notes.txt"), "Hello Chrome\n");

        const server = startFileManagerServer({
          port: 0,
          token: `cdp-qa-${platform}`,
          context: { platform, home, dataDir },
        });
        const base = `http://127.0.0.1:${server.port}`;

        try {
          for (const vp of [
            { width: 1440, height: 900, mobile: false },
            { width: 390, height: 844, mobile: true },
          ]) {
            await send("Emulation.setDeviceMetricsOverride", {
              width: vp.width,
              height: vp.height,
              deviceScaleFactor: 1,
              mobile: vp.mobile,
            });
            await send("Page.navigate", { url: `${base}/` });
            await waitForReady();
            await sleep(180);

            const baseCheck = await evalJs(`(() => ({
                metaPlat: document.querySelector('meta[name="fm-platform"]')?.getAttribute("content"),
                overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                viewSwitchRole: document.getElementById("view-switch")?.getAttribute("role"),
                radioCount: document.querySelectorAll('#view-switch [role="radio"]').length,
                vbTranscribe: !!document.getElementById("viewbar-transcribe"),
                toolTranscribe: !!document.getElementById("tool-transcribe"),
                editAddrTitle: document.getElementById("edit-address")?.getAttribute("title") || "",
                literalModCount: [...document.querySelectorAll("[title]")].filter(el => /\\bMod\\+/.test(el.getAttribute("title") || "")).length,
              }))()`);

            expect(baseCheck.metaPlat).toBe(platform);
            expect(baseCheck.overflowX).toBe(0);
            expect(baseCheck.viewSwitchRole).toBe("radiogroup");
            expect(baseCheck.radioCount).toBe(5);
            expect(baseCheck.vbTranscribe).toBe(true);
            expect(baseCheck.toolTranscribe).toBe(true);
            expect(baseCheck.editAddrTitle).toContain(
              platform === "darwin" ? "⌘L" : "Ctrl+L",
            );
            expect(baseCheck.literalModCount).toBe(0);

            await evalJs(`document.getElementById("view-dual")?.click()`);
            await sleep(150);
            const dualOverflow = await evalJs(
              `document.documentElement.scrollWidth - document.documentElement.clientWidth`,
            );
            expect(dualOverflow).toBe(0);

            await evalJs(`document.getElementById("view-home")?.click()`);
            await sleep(150);
            const homeCheck = await evalJs(`(() => ({
                overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                hasTranscribeTile: !![...document.querySelectorAll("#home .ht-title")].find(el => el.textContent.includes("Audio to Text")),
              }))()`);
            expect(homeCheck.overflowX).toBe(0);
            expect(homeCheck.hasTranscribeTile).toBe(true);

            for (const toolId of [
              "phonon",
              "sysinfo",
              "ollama",
              "bionic",
              "find",
              "code",
              "tasks",
              "dev",
              "databases",
              "cliutils",
              "subs",
              "transcribe",
            ]) {
              await send("Page.navigate", {
                url: `${base}/?tool=${toolId}&max=1${toolId === "transcribe" ? "&demo=1" : ""}`,
              });
              await waitForReady();
              await sleep(180);

              const studio = await evalJs(`(() => {
                  const maxBar = document.getElementById("power-max-bar");
                  const pane = document.getElementById("power-pane-${toolId}");
                  const maxRect = maxBar && !maxBar.hidden ? maxBar.getBoundingClientRect() : null;
                  const candidates = pane ? [...pane.querySelectorAll(".phonon-banner-card, .ollama-hero-banner, .sys-top-card, .tasks-top-card, .code-toolbar, .transcribe-banner-card, .db-studio-head, .pw-card, .dev-tabs, h3")] : [];
                  const first = candidates.find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || pane?.firstElementChild;
                  const r = first ? first.getBoundingClientRect() : null;
                  const overlapsMaxBar = !!(maxRect && r && maxRect.bottom > r.top + 0.5 && maxRect.left < r.right && maxRect.right > r.left);
                  const tablistOk = [...(pane?.querySelectorAll('[role="tablist"]') || [])].every(tl => tl.querySelectorAll('[role="tab"]').length > 0);
                  return {
                    hasPowerMax: document.getElementById("app")?.classList.contains("power-max"),
                    overlapsMaxBar,
                    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    paneOverflowX: pane ? pane.scrollWidth - pane.clientWidth : 0,
                    tablistOk,
                  };
                })()`);

              expect(studio.hasPowerMax).toBe(true);
              expect(
                studio.overlapsMaxBar,
                `${platform} ${vp.width}x${vp.height} tool=${toolId} overlapsMaxBar`,
              ).toBe(false);
              expect(
                studio.overflowX,
                `${platform} ${vp.width}x${vp.height} tool=${toolId} overflowX`,
              ).toBe(0);
              expect(
                studio.paneOverflowX,
                `${platform} ${vp.width}x${vp.height} tool=${toolId} paneOverflowX`,
              ).toBe(0);
              expect(studio.tablistOk).toBe(true);
            }
          }

          // Desktop theme & palette checks
          await send("Emulation.setDeviceMetricsOverride", {
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await send("Page.navigate", { url: `${base}/` });
          await waitForReady();
          await sleep(150);

          await evalJs(`document.getElementById("viewbar-themes")?.click()`);
          await sleep(120);
          await evalJs(
            `[...document.querySelectorAll(".menu .menu-item")].find(b => b.querySelector(".menu-label")?.textContent === "Standard light")?.click()`,
          );
          await sleep(120);
          expect(await evalJs(`document.documentElement.dataset.theme`)).toBe(
            "light",
          );

          await evalJs(`document.getElementById("viewbar-themes")?.click()`);
          await sleep(120);
          await evalJs(
            `[...document.querySelectorAll(".menu .menu-item")].find(b => b.querySelector(".menu-label")?.textContent === "Standard dark")?.click()`,
          );
          await sleep(120);
          expect(await evalJs(`document.documentElement.dataset.theme`)).toBe(
            "dark",
          );

          // Command Palette footer & Context Menu checks in live Chrome
          await evalJs(`document.getElementById("viewbar-palette")?.click()`);
          await sleep(140);
          const cpFooter = await evalJs(
            `document.querySelector(".cp-dialog .cp-footer")?.textContent || ""`,
          );
          expect(cpFooter).toContain(
            platform === "darwin" ? "⌘Enter" : "Ctrl+Enter",
          );
          expect(cpFooter).not.toMatch(/\bMod\+/);
          await evalJs(
            `document.querySelector(".cp-dialog")?.closest(".modal-backdrop")?.querySelector(".dialog-foot button")?.click() ?? document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`,
          );
          await sleep(100);

          await evalJs(`(() => {
              const mp3 = [...document.querySelectorAll("#list .row")].find(r => r.textContent.includes("sample.mp3"));
              mp3?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
            })()`);
          await sleep(120);
          const ctxLabels = await evalJs(
            `[...document.querySelectorAll(".menu .menu-item .menu-label")].map(el => el.textContent)`,
          );
          expect(ctxLabels).toContain("Transcribe Audio to Text…");
          expect(ctxLabels).toContain("Generate Subtitles (.SRT)");
          await evalJs(
            `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`,
          );
          await sleep(80);
        } finally {
          server.stop(true);
          rmSync(root, { recursive: true, force: true });
        }
      }

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
      expect(httpErrors).toEqual([]);
    } finally {
      try {
        ws?.close();
      } catch {}
      try {
        proc.kill();
        await proc.exited;
      } catch {}
      rmSync(userDataDir, { recursive: true, force: true });
      if (prevScreenshot === undefined) delete process.env.SCREENSHOT_MODE;
      else process.env.SCREENSHOT_MODE = prevScreenshot;
    }
  }, 240_000);
});
