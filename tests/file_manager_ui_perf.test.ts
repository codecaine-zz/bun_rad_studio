import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { JSDOM } from "jsdom";
import { join } from "path";

const UI_DIR = join(import.meta.dir, "..", "resources", "file_manager", "ui");

let dom: JSDOM;
let prevGlobals: Record<string, unknown> = {};

function installDom() {
  dom = new JSDOM(
    `<!doctype html><html><body>
      <div id="toolbar-row">
        <header id="toolbar" role="toolbar">
          <button id="t1" class="tool" type="button"><span class="tl">One</span></button>
          <button id="t2" class="tool" type="button"><span class="tl">Two</span></button>
          <button id="t3" class="tool" type="button"><span class="tl">Three</span></button>
          <button id="t4" class="tool" type="button"><span class="tl">Four</span></button>
          <button id="t5" class="tool" type="button"><span class="tl">Five</span></button>
          <button id="t6" class="tool" type="button"><span class="tl">Six</span></button>
        </header>
        <button id="tool-more" type="button" hidden>More</button>
      </div>
      <div id="list-head" class="list-head">
        <button data-sort="name" type="button">Name</button>
        <span class="h-where" hidden>Folder</span>
        <span class="h-ext" hidden>Extension</span>
        <span class="h-perms" hidden>Permissions</span>
      </div>
      <div id="list-wrap">
        <div id="list" role="listbox" tabindex="0"></div>
        <div id="empty" class="empty" hidden></div>
      </div>
      <aside id="info" hidden></aside>
    </body></html>`,
    { url: "http://127.0.0.1/" },
  );

  const keys = [
    "window",
    "document",
    "Element",
    "HTMLElement",
    "Node",
    "MouseEvent",
    "Event",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ] as const;
  for (const k of keys) prevGlobals[k] = (globalThis as any)[k];

  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).Element = dom.window.Element;
  (globalThis as any).HTMLElement = dom.window.HTMLElement;
  (globalThis as any).Node = dom.window.Node;
  (globalThis as any).MouseEvent = dom.window.MouseEvent;
  (globalThis as any).Event = dom.window.Event;
  (globalThis as any).getComputedStyle = dom.window.getComputedStyle.bind(
    dom.window,
  );
}

function restoreDom() {
  for (const [k, v] of Object.entries(prevGlobals)) {
    if (v === undefined) delete (globalThis as any)[k];
    else (globalThis as any)[k] = v;
  }
  dom?.window?.close?.();
}

beforeAll(() => {
  installDom();
});

afterAll(() => {
  restoreDom();
});

describe("UI rendering performance, reflow elimination, and CSS polish", () => {
  test("renderList appends 'Show more' rows incrementally, stamps appliedPack/appliedName, and places .more outside #list", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const { left } = await import("../resources/file_manager/ui/pane.js");
    const { renderList, iconsPerLine } =
      await import("../resources/file_manager/ui/list.js");

    state.settings.view = "details";
    state.settings.groupBy = "none";
    state.settings.columns = [];
    state.location = { kind: "folder", path: "/demo/big" };
    state.search = null;
    state.shown = 0;
    state.selection = new Set();
    (state as any).entries = Array.from({ length: 650 }, (_, i) => ({
      name: `file-${String(i).padStart(4, "0")}.txt`,
      path: `/demo/big/file-${String(i).padStart(4, "0")}.txt`,
      isDir: false,
      size: 1024 + i,
      mtimeMs: 1_700_000_000_000 + i * 1000,
      label: "Text file",
      ext: ".txt",
      hidden: false,
      broken: false,
    }));

    renderList(left);

    const listEl = document.getElementById("list")!;
    const initialRows = listEl.querySelectorAll(".row");
    expect(initialRows.length).toBe(500);
    // `#list` (`role="listbox"`) must not contain `.more` footer
    expect(listEl.querySelector(".more")).toBeNull();

    // Sibling `.list-more-host` holds `.more`
    const moreHost = listEl.nextElementSibling as HTMLElement | null;
    expect(moreHost?.classList.contains("list-more-host")).toBe(true);
    expect(moreHost?.hidden).toBe(false);
    const moreButtons = moreHost!.querySelectorAll(".more .btn");
    expect(moreButtons.length).toBe(2);
    expect(moreButtons[0]!.textContent).toContain("Show 150 more");

    // Row icons stamp appliedPack / appliedName so syncVisibleIcons skips re-classification
    const firstRow = initialRows[0] as HTMLElement;
    const firstIcon = firstRow.querySelector(".c-icon") as HTMLElement;
    expect(firstIcon.dataset.appliedPack).toBe("default");
    expect(firstIcon.dataset.appliedName).toBe("file-0000.txt");
    expect(firstIcon.dataset.iconKind).toBeTruthy();

    // Click "Show 150 more" and verify existing DOM nodes are preserved (incremental append)
    const row499Before = initialRows[499];
    (moreButtons[0] as HTMLButtonElement).click();

    const afterRows = listEl.querySelectorAll(".row");
    expect(afterRows.length).toBe(650);
    expect(afterRows[0]).toBe(firstRow);
    expect(afterRows[499]).toBe(row499Before);
    expect(moreHost!.hidden).toBe(true);
    expect(moreHost!.children.length).toBe(0);

    // iconsPerLine prefers resolved getComputedStyle(container).gridTemplateColumns track count
    state.settings.view = "icons";
    const origGetComputedStyle = globalThis.getComputedStyle;
    (globalThis as any).getComputedStyle = () => ({
      gridTemplateColumns: "180px 180px 180px 180px",
    });
    try {
      expect(iconsPerLine(left)).toBe(4);
    } finally {
      (globalThis as any).getComputedStyle = origGetComputedStyle;
      state.settings.view = "details";
    }
  });

  test("fitToolbar performs a single read pass without read-write scrollWidth loop", async () => {
    const { fitToolbar } =
      await import("../resources/file_manager/ui/chrome.js");
    const bar = document.getElementById("toolbar") as HTMLElement;
    const more = document.getElementById("tool-more") as HTMLElement;
    const buttons = [...bar.querySelectorAll<HTMLElement>(".tool")];

    let scrollWidthReads = 0;
    Object.defineProperty(bar, "clientWidth", {
      value: 300,
      configurable: true,
    });
    Object.defineProperty(bar, "scrollWidth", {
      get: () => {
        scrollWidthReads++;
        return (
          buttons.filter((b) => !b.classList.contains("overflowed")).length * 80
        );
      },
      configurable: true,
    });
    Object.defineProperty(more, "offsetWidth", {
      value: 60,
      configurable: true,
    });
    for (const b of buttons) {
      Object.defineProperty(b, "offsetWidth", {
        value: 80,
        configurable: true,
      });
    }

    fitToolbar();

    // Only a single initial scrollWidth read — no read-write loop!
    expect(scrollWidthReads).toBe(1);
    expect(more.hidden).toBe(false);
    // 300 - 60 (moreWidth) = 240 -> fits 3 buttons of 80px each; last 3 overflow
    const visible = buttons.filter((b) => !b.classList.contains("overflowed"));
    const overflowed = buttons.filter((b) =>
      b.classList.contains("overflowed"),
    );
    expect(visible.map((b) => b.id)).toEqual(["t1", "t2", "t3"]);
    expect(overflowed.map((b) => b.id)).toEqual(["t4", "t5", "t6"]);

    // Widening toolbar restores all buttons and hides More
    Object.defineProperty(bar, "clientWidth", {
      value: 1000,
      configurable: true,
    });
    fitToolbar();
    expect(bar.querySelectorAll(".tool.overflowed").length).toBe(0);
    expect(more.hidden).toBe(true);
  });

  test("marquee caches row rects at drag start, throttles mousemove via rAF, and applies scroll delta", async () => {
    const { state } = await import("../resources/file_manager/ui/state.js");
    const { selectRowsInRect, wireMarquee } =
      await import("../resources/file_manager/ui/marquee.js");

    const wrap = document.getElementById("list-wrap") as HTMLElement;
    const listEl = document.getElementById("list") as HTMLElement;
    listEl.replaceChildren();
    wrap.scrollTop = 0;
    wrap.scrollLeft = 0;

    let rectReads = 0;
    const rowSpecs = [
      { key: "/a", top: 10, bottom: 40 },
      { key: "/b", top: 50, bottom: 80 },
      { key: "/c", top: 90, bottom: 120 },
    ];
    for (const spec of rowSpecs) {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.key = spec.key;
      row.getBoundingClientRect = () => {
        rectReads++;
        return {
          left: 10,
          right: 200,
          top: spec.top,
          bottom: spec.bottom,
          width: 190,
          height: 30,
          x: 10,
          y: spec.top,
          toJSON() {
            return {};
          },
        } as DOMRect;
      };
      listEl.append(row);
    }

    // Backwards-compatible synchronous selectRowsInRect
    state.selection = new Set();
    const syncHits = selectRowsInRect("left", {
      left: 0,
      top: 0,
      right: 100,
      bottom: 60,
    });
    expect(syncHits).toEqual(["/a", "/b"]);

    // Wire marquee with controlled rAF queue
    rectReads = 0;
    const rafQueue: FrameRequestCallback[] = [];
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    };
    (globalThis as any).cancelAnimationFrame = () => {};

    wrap.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 400,
        width: 400,
        height: 400,
        x: 0,
        y: 0,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    Object.defineProperty(wrap, "clientWidth", {
      value: 400,
      configurable: true,
    });
    Object.defineProperty(wrap, "clientHeight", {
      value: 400,
      configurable: true,
    });

    wireMarquee("left");
    state.selection = new Set();

    wrap.dispatchEvent(
      new MouseEvent("mousedown", {
        button: 0,
        clientX: 5,
        clientY: 5,
        bubbles: true,
      }),
    );
    // Multiple rapid mousemove events before rAF fires
    dom.window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 50, clientY: 30, bubbles: true }),
    );
    dom.window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 80, clientY: 60, bubbles: true }),
    );
    dom.window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 100, clientY: 75, bubbles: true }),
    );

    // Rects read exactly once per row at drag start, and only 1 rAF queued
    expect(rectReads).toBe(3);
    expect(rafQueue.length).toBe(1);

    // Execute queued rAF frame
    rafQueue.shift()!(16);
    expect([...state.selection]).toEqual(["/a", "/b"]);

    // Scroll down by 40px: row /c (90..120) shifts to viewport 50..80, intersecting 5..75
    wrap.scrollTop = 40;
    dom.window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 100, clientY: 75, bubbles: true }),
    );
    expect(rafQueue.length).toBe(1);
    rafQueue.shift()!(32);
    // Still zero additional getBoundingClientRect calls during drag!
    expect(rectReads).toBe(3);
    expect([...state.selection]).toEqual(["/b", "/c"]);

    dom.window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  test("style.css and themeEffects.css include content-visibility, fallback, WCAG AA cut/hidden contrast, and 11px badges", () => {
    const styleCss = readFileSync(join(UI_DIR, "style.css"), "utf8");
    const themeEffectsCss = readFileSync(
      join(UI_DIR, "themeEffects.css"),
      "utf8",
    );

    expect(styleCss).toContain(".view-details .row:nth-child(n + 40)");
    expect(styleCss).toContain(".view-list .row:nth-child(n + 40)");
    expect(styleCss).toContain("content-visibility: auto;");
    expect(styleCss).toContain("contain-intrinsic-size: auto none auto 30px;");
    expect(styleCss).toContain("@supports not (content-visibility: auto)");
    expect(styleCss).toContain("contain: layout style paint;");

    // `.row.cut` preserves text contrast (no whole-row `opacity: 0.5`)
    expect(styleCss).not.toMatch(/\.row\.cut\s*\{\s*opacity:\s*0\.5;/);
    expect(styleCss).toMatch(/\.row\.cut\s*\{[^}]*font-style:\s*italic;/);
    expect(styleCss).toContain(".row.cut .icon");
    expect(styleCss).toContain("opacity: 0.55;");
    expect(styleCss).toContain(".row.hidden-item .icon");
    expect(styleCss).toContain("opacity: 0.75;");

    // SOURCE / TARGET badges bumped from 10px to 11px
    const sourceBlock = themeEffectsCss.slice(
      themeEffectsCss.indexOf('content: "🎯 SOURCE (ACTIVE)";'),
      themeEffectsCss.indexOf('content: "📥 TARGET";'),
    );
    const targetBlock = themeEffectsCss.slice(
      themeEffectsCss.indexOf('content: "📥 TARGET";'),
      themeEffectsCss.indexOf('content: "📥 TARGET";') + 500,
    );
    expect(sourceBlock).toContain("font-size: 11px;");
    expect(targetBlock).toContain("font-size: 11px;");
  });
});
