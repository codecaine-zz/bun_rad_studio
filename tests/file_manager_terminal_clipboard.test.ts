import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

interface KeyEvent {
  type: string;
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface MenuItem {
  label?: string;
  disabled?: boolean;
  action?: () => unknown;
}

function fixture(platform = "linux") {
  class Button extends EventTarget { disabled = false; }
  const buttons = new Map(["copy", "paste", "select-all"].map((name) => [`#terminal-${name}`, new Button()]));
  const host = new EventTarget();
  const copied: string[] = [];
  const notices: string[] = [];
  const pasted: string[] = [];
  let menu: MenuItem[] = [];
  let selectionChanged = () => {};
  let handler: (e: KeyEvent) => boolean = () => true;
  const clipboard = { readText: async () => "clipboard\ntext" };
  const term = {
    selection: "",
    focused: false,
    getSelection() { return this.selection; },
    hasSelection() { return !!this.selection; },
    onSelectionChange(fn: () => void) { selectionChanged = fn; },
    attachCustomKeyEventHandler(fn: typeof handler) { handler = fn; },
    selectAll() { this.selection = "all output\nincluding scrollback"; selectionChanged(); },
    clearSelection() { this.selection = ""; selectionChanged(); },
    focus() { this.focused = true; },
    paste(text: string) { pasted.push(text); },
  };
  const source = readFileSync(new URL("../resources/file_manager/ui/terminalClipboard.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?$/gm, "").replace(/^export /gm, "");
  const wire = new Function("deps", `
    const { $, copyToClipboard, showMenu, toast, state, navigator } = deps;
    ${source}
    return wireTerminalClipboard;
  `)({
    $: (selector: string) => buttons.get(selector),
    copyToClipboard: async (text: string) => { copied.push(text); return true; },
    showMenu: (items: MenuItem[]) => { menu = items; },
    toast: (message: string) => notices.push(message),
    state: { platform }, navigator: { clipboard },
  }) as (terminal: typeof term, host: EventTarget) => void;
  wire(term, host);
  const click = (name: string) => buttons.get(`#terminal-${name}`)!.dispatchEvent(new Event("click"));
  const context = () => {
    const event = new Event("contextmenu", { cancelable: true });
    host.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    return menu;
  };
  const item = (label: string) => menu.find((entry) => entry.label === label)!;
  const key = (key: string, modifiers: Partial<KeyEvent> = {}) => {
    let prevented = false;
    let stopped = false;
    const result = handler({ type: "keydown", key, ...modifiers, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    return { result, prevented, stopped };
  };
  return { term, buttons, copied, notices, pasted, clipboard, click, context, item, key };
}

describe("terminal selection and clipboard controls", () => {
  test("Copy follows xterm's selection, and Select all includes scrollback", async () => {
    const f = fixture();
    expect(f.buttons.get("#terminal-copy")!.disabled).toBe(true);
    f.click("select-all");
    expect(f.term.selection).toContain("scrollback");
    expect(f.buttons.get("#terminal-copy")!.disabled).toBe(false);
    f.click("copy");
    await Promise.resolve();
    expect(f.copied).toEqual(["all output\nincluding scrollback"]);
    expect(f.term.focused).toBe(true);
  });

  test("right-click copies the terminal selection and can clear it without changing output", async () => {
    const f = fixture();
    expect(f.context().filter((entry) => entry.label).map((entry) => entry.label)).toEqual(["Copy", "Paste", "Select all", "Clear selection"]);
    expect(f.item("Copy").disabled).toBe(true);
    f.click("select-all");
    f.context();
    await f.item("Copy").action!();
    expect(f.copied).toEqual(["all output\nincluding scrollback"]);
    f.item("Clear selection").action!();
    expect(f.term.selection).toBe("");
    expect(f.buttons.get("#terminal-copy")!.disabled).toBe(true);
  });

  test("paste uses xterm's paste API, not raw shell input or an extra Enter", async () => {
    const f = fixture();
    f.click("paste");
    await Promise.resolve();
    expect(f.pasted).toEqual(["clipboard\ntext"]);
    f.context();
    await f.item("Paste").action!();
    expect(f.pasted).toEqual(["clipboard\ntext", "clipboard\ntext"]);
  });

  test("clipboard read failures are explained and nothing is pasted", async () => {
    const f = fixture();
    f.clipboard.readText = async () => { throw new Error("Clipboard permission denied"); };
    f.context();
    await f.item("Paste").action!();
    expect(f.pasted).toEqual([]);
    expect(f.notices[0]).toContain("Couldn't read the clipboard");
    expect(f.term.focused).toBe(true);
  });

  test("copy, paste and select-all shortcuts work on all platforms while leaving Ctrl+C and Ctrl+A to the shell", async () => {
    for (const platform of ["linux", "win32", "darwin"]) {
      const f = fixture(platform);
      for (const key of ["a", "c"]) {
        expect(f.key(key, { ctrlKey: true })).toEqual({ result: true, prevented: false, stopped: false });
      }
      expect(f.key("v", { ctrlKey: true })).toEqual({ result: false, prevented: true, stopped: true });
      expect(f.key("v", { ctrlKey: true, shiftKey: true })).toEqual({ result: false, prevented: true, stopped: true });
      expect(f.key("v", { metaKey: true })).toEqual({ result: false, prevented: true, stopped: true });
      expect(f.key("Insert", { shiftKey: true })).toEqual({ result: false, prevented: true, stopped: true });
      await Promise.resolve();
      expect(f.pasted).toEqual(["clipboard\ntext", "clipboard\ntext", "clipboard\ntext", "clipboard\ntext"]);
      expect(f.key("a", { ctrlKey: true, shiftKey: true })).toEqual({ result: false, prevented: true, stopped: true });
      expect(f.key("c", { ctrlKey: true, shiftKey: true }).result).toBe(false);
      await Promise.resolve();
      expect(f.copied).toEqual(["all output\nincluding scrollback"]);
      expect(f.key("c", { metaKey: true }).result).toBe(platform !== "darwin");
      expect(f.key("c", { ctrlKey: true, shiftKey: true, altKey: true }).result).toBe(true);
    }
  });

  test("copying without a selection explains how to select text", () => {
    const f = fixture();
    f.key("c", { ctrlKey: true, shiftKey: true });
    expect(f.copied).toEqual([]);
    expect(f.notices[0]).toContain("Select terminal text first");
  });
});
