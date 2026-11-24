import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { JSDOM } from "jsdom";

const ROOT = join(import.meta.dir, "..");
const INDEX_HTML_PATH = join(ROOT, "resources", "file_manager", "index.html");
const VIEWS_CSS_PATH = join(
  ROOT,
  "resources",
  "file_manager",
  "ui",
  "views.css",
);
const QUICKLOOK_JS_PATH = join(
  ROOT,
  "resources",
  "file_manager",
  "ui",
  "quicklook.js",
);

const indexHtml = readFileSync(INDEX_HTML_PATH, "utf8");
const viewsCss = readFileSync(VIEWS_CSS_PATH, "utf8");
const quicklookSrc = readFileSync(QUICKLOOK_JS_PATH, "utf8");

describe("File Manager UI chrome & accessibility markup/CSS", () => {
  test("index.html includes #qb-more button, #toolbar focusgroup, and <button id='status-clock'>", () => {
    const dom = new JSDOM(indexHtml);
    const doc = dom.window.document;

    // 1. Quickbar compact View options menu button
    const qbMore = doc.getElementById("qb-more");
    expect(qbMore).toBeTruthy();
    expect(qbMore?.tagName).toBe("BUTTON");
    expect(qbMore?.getAttribute("type")).toBe("button");
    expect(qbMore?.getAttribute("aria-haspopup")).toBe("menu");
    expect(qbMore?.getAttribute("aria-label")).toBe("View options");
    expect(qbMore?.closest("#quickbar")).toBeTruthy();

    // 2. Toolbar focusgroup attribute
    const toolbar = doc.getElementById("toolbar");
    expect(toolbar).toBeTruthy();
    expect(toolbar?.getAttribute("role")).toBe("toolbar");
    expect(toolbar?.getAttribute("focusgroup")).toBe("toolbar wrap");

    // 3. Accessible status-clock button
    const statusClock = doc.getElementById("status-clock");
    expect(statusClock).toBeTruthy();
    expect(statusClock?.tagName).toBe("BUTTON");
    expect(statusClock?.getAttribute("type")).toBe("button");
    expect(statusClock?.getAttribute("aria-label")).toBe(
      "Current date and time — open World Time Zones",
    );

    // 4. Required viewbar & clock elements remain intact
    for (const id of [
      "viewbar-ollama",
      "viewbar-bionic",
      "viewbar-phonon",
      "viewbar-transcribe",
      "fm-clock",
      "status-clock",
    ]) {
      expect(doc.getElementById(id), `#${id}`).toBeTruthy();
    }

    dom.window.close();
  });

  test("views.css hides .qb-more by default, shows it in @container files (max-width: 620px), and resets .status-clock button styles", () => {
    expect(viewsCss).toMatch(/\.qb-more\s*\{[^}]*display:\s*none;/s);
    expect(viewsCss).toMatch(
      /@container\s+files\s*\(max-width:\s*620px\)\s*\{[^}]*\.qb-controls\s*\{[^}]*display:\s*none;[^}]*\}[^}]*\.qb-more\s*\{[^}]*display:\s*inline-flex;/s,
    );
    expect(viewsCss).toMatch(
      /\.status-clock\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
    );
  });

  test("quicklook.js defines explicit aria-labels on all symbol-only image inspector buttons", () => {
    const expected: Array<[string, string]> = [
      ["qlImgZoomOut", "Zoom out"],
      ["qlImgZoomIn", "Zoom in"],
      ["qlImgRotLeft", "Rotate left"],
      ["qlImgRotRight", "Rotate right"],
      ["qlImgFlipH", "Flip horizontal"],
      ["qlImgFlipV", "Flip vertical"],
    ];
    for (const [dataKey, ariaLabel] of expected) {
      const pattern = new RegExp(
        `${dataKey}:[\\s\\S]{0,160}"aria-label":\\s*"${ariaLabel}"`,
      );
      expect(quicklookSrc).toMatch(pattern);
    }
  });
});

describe("File Manager UI DOM behavior (quickbar #qb-more & toolbar roving tabindex)", () => {
  let dom: JSDOM;
  const savedGlobals: Record<string, unknown> = {};
  const globalKeys = [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "getComputedStyle",
    "localStorage",
  ] as const;

  let toolbarMod: any;
  let quickbarMod: any;
  let stateMod: any;
  let menusMod: any;
  let paneMod: any;

  beforeAll(async () => {
    dom = new JSDOM(indexHtml, { url: "http://localhost/" });
    const win = dom.window as any;
    for (const k of globalKeys) {
      savedGlobals[k] = (globalThis as any)[k];
      (globalThis as any)[k] = win[k];
    }
    // JSDOM does not implement HTMLElement.prototype.focusGroup, matching browsers that need the roving tabindex fallback.
    expect("focusGroup" in HTMLElement.prototype).toBe(false);

    stateMod = await import("../resources/file_manager/ui/state.js");
    paneMod = await import("../resources/file_manager/ui/pane.js");
    menusMod = await import("../resources/file_manager/ui/menus.js");
    toolbarMod = await import("../resources/file_manager/ui/toolbar.js");
    quickbarMod = await import("../resources/file_manager/ui/quickbar.js");

    stateMod.state.location = { kind: "folder", path: "/tmp/demo" };
    stateMod.state.entries = [
      {
        name: "alpha.ts",
        path: "/tmp/demo/alpha.ts",
        isDir: false,
        size: 120,
        mtime: Date.now(),
      },
      {
        name: "beta.md",
        path: "/tmp/demo/beta.md",
        isDir: false,
        size: 80,
        mtime: Date.now(),
      },
      {
        name: "docs",
        path: "/tmp/demo/docs",
        isDir: true,
        size: 0,
        mtime: Date.now(),
      },
    ];
    stateMod.state.settings = {
      ...stateMod.state.settings,
      groupBy: "kind",
      rowDensity: "compact",
      view: "details",
      showHidden: false,
    };

    toolbarMod.buildToolbar();
    quickbarMod.wireQuickbar();
  });

  afterAll(async () => {
    // Allow menus.js setTimeout(..., 0) outside-click listener registration to settle before tearing down JSDOM globals.
    await new Promise((resolve) => setTimeout(resolve, 10));
    menusMod?.closeMenu?.();
    dom?.window.close();
    for (const k of globalKeys) {
      if (savedGlobals[k] === undefined) {
        delete (globalThis as any)[k];
      } else {
        (globalThis as any)[k] = savedGlobals[k];
      }
    }
  });

  test("#qb-more opens View options menu exposing all collapsed .qb-controls actions", () => {
    const qbMore = document.getElementById("qb-more") as HTMLButtonElement;
    expect(qbMore).toBeTruthy();

    qbMore.click();

    const menu = document.querySelector(".menu[role='menu']") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.getAttribute("aria-label")).toBe("View options");

    const itemTexts = [...menu.querySelectorAll(".menu-item")].map((el) =>
      el.textContent?.trim(),
    );
    expect(itemTexts.some((t) => t?.includes("Calculate Folder Sizes"))).toBe(
      true,
    );
    expect(itemTexts.some((t) => t?.includes("Select by Pattern"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("Select All"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("Invert Selection"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("Group: None"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("Group: Kind"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("Group: Date"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("Group: Size"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("Density: Compact"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("Density: Comfortable"))).toBe(
      true,
    );
    expect(itemTexts.some((t) => t?.includes("Density: Spacious"))).toBe(true);
    expect(itemTexts.some((t) => t?.includes("New from Template"))).toBe(true);

    // Active group & density items are marked checked
    const checkedItems = [
      ...menu.querySelectorAll('.menu-item[aria-checked="true"]'),
    ].map((el) => el.textContent?.trim());
    expect(checkedItems.some((t) => t?.includes("Group: Kind"))).toBe(true);
    expect(checkedItems.some((t) => t?.includes("Density: Compact"))).toBe(
      true,
    );

    // Clicking "Select All" selects all visible entries
    const selectAllBtn = [...menu.querySelectorAll(".menu-item")].find((el) =>
      el.textContent?.includes("Select All"),
    ) as HTMLButtonElement;
    expect(selectAllBtn).toBeTruthy();
    selectAllBtn.click();
    expect(paneMod.left.selection.size).toBe(3);

    // Reopen and click "Invert Selection" -> clears selection when all were selected
    qbMore.click();
    const menu2 = document.querySelector(".menu[role='menu']") as HTMLElement;
    const invertBtn = [...menu2.querySelectorAll(".menu-item")].find((el) =>
      el.textContent?.includes("Invert Selection"),
    ) as HTMLButtonElement;
    expect(invertBtn).toBeTruthy();
    invertBtn.click();
    expect(paneMod.left.selection.size).toBe(0);
  });

  test("#toolbar roving tabindex moves focus with ArrowRight/ArrowLeft/Home/End, wraps, includes #tool-more, respects RTL, and lets Tab exit", () => {
    const bar = document.getElementById("toolbar") as HTMLElement;
    const more = document.getElementById("tool-more") as HTMLButtonElement;
    more.hidden = false;
    toolbarMod.syncToolbarRovingTabindex();

    const visibleBtns = (): HTMLButtonElement[] => {
      const list = [...bar.querySelectorAll<HTMLButtonElement>(".tool")].filter(
        (b) =>
          !b.hidden &&
          !b.disabled &&
          !b.classList.contains("overflowed") &&
          !b.closest("[hidden]"),
      );
      if (!more.hidden && !more.disabled) list.push(more);
      return list;
    };

    const items = visibleBtns();
    expect(items.length).toBeGreaterThan(3);

    // Exactly one button has tabindex="0" and all others have "-1"
    const tabbable = items.filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable.length).toBe(1);
    expect(tabbable[0]).toBe(items[0]);
    for (const btn of items.slice(1)) {
      expect(btn.getAttribute("tabindex")).toBe("-1");
    }

    // Focus first button and press ArrowRight -> moves to second button
    items[0]!.focus();
    const evRight = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    items[0]!.dispatchEvent(evRight);
    expect(evRight.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[1]!);
    expect(items[1]!.getAttribute("tabindex")).toBe("0");
    expect(items[0]!.getAttribute("tabindex")).toBe("-1");

    // End moves to last button (#tool-more when visible)
    const evEnd = new KeyboardEvent("keydown", {
      key: "End",
      bubbles: true,
      cancelable: true,
    });
    items[1]!.dispatchEvent(evEnd);
    expect(evEnd.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(more);
    expect(more.getAttribute("tabindex")).toBe("0");

    // ArrowRight on last button wraps to first button
    const evWrapRight = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    more.dispatchEvent(evWrapRight);
    expect(evWrapRight.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]!);

    // ArrowLeft on first button wraps to last button (#tool-more)
    const evWrapLeft = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });
    items[0]!.dispatchEvent(evWrapLeft);
    expect(evWrapLeft.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(more);

    // Home moves back to first button
    const evHome = new KeyboardEvent("keydown", {
      key: "Home",
      bubbles: true,
      cancelable: true,
    });
    more.dispatchEvent(evHome);
    expect(evHome.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]!);

    // RTL direction reverses ArrowRight / ArrowLeft
    bar.style.direction = "rtl";
    const evRtlLeft = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });
    items[0]!.dispatchEvent(evRtlLeft);
    expect(document.activeElement).toBe(items[1]!);

    const evRtlRight = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    items[1]!.dispatchEvent(evRtlRight);
    expect(document.activeElement).toBe(items[0]!);
    bar.style.direction = "";

    // focusin updates the active tab stop
    items[2]!.focus();
    expect(items[2]!.getAttribute("tabindex")).toBe("0");
    expect(items[0]!.getAttribute("tabindex")).toBe("-1");

    // Tab is NOT prevented so keyboard users can exit the toolbar cleanly
    const evTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    items[2]!.dispatchEvent(evTab);
    expect(evTab.defaultPrevented).toBe(false);

    more.hidden = true;
    toolbarMod.syncToolbarRovingTabindex();
  });
});
