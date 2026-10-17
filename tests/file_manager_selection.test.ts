import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { JSDOM } from "jsdom";
import { isModifier } from "../resources/file_manager/ui/util.js";

test("Ctrl+click selects multiple folders in either Windows pane without opening a menu", () => {
  const dom = new JSDOM("<main></main>");
  const { document, Element, MouseEvent } = dom.window;
  const state = { platform: "win32" };
  const menus: string[][] = [];
  const source = readFileSync(new URL("../resources/file_manager/ui/list.js", import.meta.url), "utf8");
  const mouse = source.slice(source.indexOf("const rowOf ="), source.indexOf("export function wireList()")).replace(/^export /gm, "");
  type Pane = { side: string; selection: Set<string>; ids: { empty: string }; wrap: HTMLElement; list: HTMLElement; head: HTMLElement };
  const wirePane = new Function("deps", `
    const { Element, state, isModifier, list, part, setActivePane, toggleKey, selectOnly,
      selectedEntries, showEntryMenu, attachDropTarget } = deps;
    ${mouse}
    return wirePane;
  `)({
    Element, state, isModifier,
    list: (pane: Pane) => pane.list,
    part: (pane: Pane, name: "wrap" | "head") => pane[name],
    setActivePane() {},
    toggleKey: (key: string, pane: Pane) => pane.selection.has(key) ? pane.selection.delete(key) : pane.selection.add(key),
    selectOnly: (key: string, pane: Pane) => { pane.selection.clear(); pane.selection.add(key); },
    selectedEntries: (pane: Pane) => [...pane.selection],
    showEntryMenu: (paths: string[]) => menus.push(paths),
    attachDropTarget() {},
  }) as (pane: Pane) => void;
  try {
    for (const side of ["left", "right"]) {
      const wrap = document.createElement("div");
      wrap.innerHTML = '<div class="list"><div class="row is-folder" data-key="C:\\first"></div><div class="row is-folder" data-key="C:\\second"></div></div><header></header>';
      document.body.append(wrap);
      const list = wrap.querySelector<HTMLElement>(".list")!;
      const pane: Pane = { side, selection: new Set(), ids: { empty: `${side}-empty` }, wrap, list, head: wrap.querySelector("header")! };
      wirePane(pane);
      const [first, second] = [...list.children];
      first!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      second!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, ctrlKey: true }));
      second!.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
      for (const button of [0, 2]) {
        second!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button, ctrlKey: true }));
        expect(menus).toHaveLength(0);
      }
      expect([...pane.selection]).toEqual(["C:\\first", "C:\\second"]);
      second!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2, ctrlKey: true }));
      second!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, button: 2, ctrlKey: true }));
      expect(menus.pop()).toEqual(["C:\\first", "C:\\second"]);
      second!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      expect(menus.pop()).toEqual(["C:\\first", "C:\\second"]);
      state.platform = "darwin";
      second!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, ctrlKey: true }));
      expect(menus.pop()).toEqual(["C:\\first", "C:\\second"]);
      state.platform = "win32";
    }
  } finally { dom.window.close(); }
});

test("Enter choosing a menu action is consumed before that action focuses the terminal", async () => {
  const dom = new JSDOM('<div id="overlay"></div><textarea id="terminal"></textarea>', { pretendToBeVisual: true });
  const { document, HTMLElement, KeyboardEvent } = dom.window;
  const source = readFileSync(new URL("../resources/file_manager/ui/menus.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const h = (tag: string, props: Record<string, unknown>, ...children: (Node | string | (Node | string)[])[]) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === "function") el.addEventListener(key.slice(2), value as EventListener);
      else if (value != null) el.setAttribute(key, String(value));
    }
    el.append(...children.flat());
    return el;
  };
  const menus = new Function("deps", `
    const { document, window, HTMLElement, h, $ } = deps;
    ${source}
    return { showMenu, closeMenu };
  `)({ document, window: dom.window, HTMLElement, h, $: (selector: string) => document.querySelector(selector) }) as {
    showMenu: (items: { label: string; action: () => void }[]) => HTMLElement;
    closeMenu: () => void;
  };
  let inserts = 0;
  try {
    const menu = menus.showMenu([{ label: "Insert paths in Terminal", action() { inserts++; document.querySelector<HTMLTextAreaElement>("#terminal")!.focus(); } }]);
    await new Promise((resolve) => setTimeout(resolve, 1));
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    menu.querySelector("button")!.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(inserts).toBe(1);
    expect(document.activeElement?.id).toBe("terminal");
    expect(document.querySelector(".menu")).toBeNull();
  } finally {
    menus.closeMenu();
    dom.window.close();
  }
});
