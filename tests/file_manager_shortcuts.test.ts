import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, updateSettings } from "../src/features/filemanager/fmSettings";
import * as ui7 from "../resources/file_manager/ui/codeKeys.js";
const { KEYMAP, matchShortcut }: any = ui7;
import * as ui8 from "../resources/file_manager/ui/shortcuts.js";
const { ACTIONS, FIXED, canonical, checkAssign, defaultsFor, effectiveKeys, formatShortcut, isValidSpec, sanitizeOverrides, setBackspaceDeletes, specFromEvent }: any = ui8;

const PLATFORMS = ["darwin", "linux", "win32"];
const action = (id: string) => ACTIONS.find((a: any) => a.id === id)!;
const defaults = (platform: string) => new Map(ACTIONS.map((a: any) => [a.id, defaultsFor(a, platform)]));
const ev = (o: Record<string, unknown>) => ({ key: "", code: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });

describe("the table of shortcuts", () => {
  test("every action has a unique id, a label and a group", () => {
    const ids = ACTIONS.map((a: any) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACTIONS as any[]) expect(a.label && a.group && ["files", "code", "global", "dual"].includes(a.scope), a.id).toBeTruthy();
    expect(ACTIONS.length).toBeGreaterThan(60);
  });
  test("the original shortcuts are valid and never clash with each other, on every system", () => {
    for (const platform of PLATFORMS) {
      const keys = defaults(platform);
      for (const a of ACTIONS as any[]) for (const spec of keys.get(a.id) as string[]) {
        expect(isValidSpec(spec), `${a.id} ${spec}`).toBe(true);
        expect(checkAssign(a, spec, keys, platform), `${platform} ${a.id} ${spec}`).toBeNull();
      }
    }
  });
  test("every function key has a second way that needs no function key (many keyboards need Fn held for F-keys)", () => {
    const isF = (k: string) => /(^|\+)F\d{1,2}$/.test(k);
    for (const platform of PLATFORMS) for (const a of ACTIONS as any[]) {
      const keys = defaultsFor(a, platform) as string[];
      if (keys.some(isF)) expect(keys.some((k) => !isF(k)), `${platform} ${a.id}`).toBe(true);
    }
    for (const id of ["bookmarkNext", "bookmarkPrev", "shortcuts"]) expect((KEYMAP as any)[id].some((k: string) => !isF(k)), id).toBe(true);
  });
  test("the Code tab's own table is where its defaults come from", () => {
    expect(action("code.save").keys).toEqual(["Mod+S"]);
    expect(action("code.replace").keys).toEqual(["Mod+H", "Mod+Alt+F"]);
    expect(KEYMAP.save).toEqual(["Mod+S"]);
  });
  test("platform-only defaults", () => {
    expect(defaultsFor(action("nav.back"), "darwin")).toEqual(["Alt+ArrowLeft", "Mod+["]);
    expect(defaultsFor(action("nav.back"), "linux")).toEqual(["Alt+ArrowLeft"]);
    expect(defaultsFor(action("nav.address"), "linux")).toEqual(["Mod+L", "Alt+D"]);
    expect(defaultsFor(action("nav.address"), "darwin")).toEqual(["Mod+L"]);
  });
  test("the terminal has shortcuts for toggle, open here, and paste", () => {
    expect(defaultsFor(action("terminal.toggle"), "darwin")).toEqual(["Ctrl+`"]);
    expect(defaultsFor(action("terminal.here"), "linux")).toEqual(["Mod+Alt+T"]);
    expect(defaultsFor(action("terminal.paste"), "linux")).toEqual(["Mod+Alt+V"]);
    expect(formatShortcut("Mod+Alt+T", "darwin")).toBe("⌘⌥T");
    expect(formatShortcut("Mod+Alt+T", "linux")).toBe("Ctrl+Alt+T");
    expect(formatShortcut("Mod+Alt+V", "darwin")).toBe("⌘⌥V");
    expect(formatShortcut("Mod+Alt+V", "linux")).toBe("Ctrl+Alt+V");
    expect(formatShortcut("Ctrl+`", "darwin")).toBe("⌃`");
  });
  test("the fixed theme-cycle shortcuts are displayed in both directions", () => {
    const themes = FIXED.find((x: any) => x.label.includes("all themes"));
    expect(themes.keys).toEqual(["Alt+[", "Alt+]"]);
    expect(themes.keys.map((key: string) => formatShortcut(key, "darwin"))).toEqual(["⌥[", "⌥]"]);
    expect(themes.keys.map((key: string) => formatShortcut(key, "linux"))).toEqual(["Alt+[", "Alt+]"]);
    for (const platform of PLATFORMS) {
      expect(checkAssign(action("file.copy"), "Alt+[", defaults(platform), platform)?.reason).toContain("fixed key");
      expect(checkAssign(action("file.copy"), "Alt+]", defaults(platform), platform)?.reason).toContain("fixed key");
    }
  });
  test("archive extraction, zip compression, invert selection, and productivity shortcuts are registered and formatted", () => {
    expect(defaultsFor(action("file.extract"), "darwin")).toEqual(["Mod+Shift+E", "Mod+U"]);
    expect(defaultsFor(action("file.zip"), "darwin")).toEqual(["Mod+Shift+Z", "Mod+Alt+Z"]);
    expect(defaultsFor(action("file.invertSelection"), "darwin")).toEqual(["Mod+Shift+I"]);
    expect(defaultsFor(action("file.copyPath"), "darwin")).toEqual(["Mod+Shift+C"]);
    expect(defaultsFor(action("file.copyFileUrl"), "darwin")).toEqual(["Mod+Alt+U"]);
    expect(defaultsFor(action("file.reveal"), "darwin")).toEqual(["Mod+Alt+S"]);
    expect(defaultsFor(action("file.toggleFavorite"), "darwin")).toEqual(["Mod+Alt+B"]);
    expect(defaultsFor(action("file.newDatedFolder"), "darwin")).toEqual(["Mod+Alt+Shift+N"]);
    expect(defaultsFor(action("file.newDatedNote"), "darwin")).toEqual(["Mod+Shift+J"]);
    expect(defaultsFor(action("file.convert"), "darwin")).toEqual(["Mod+Shift+O"]);
    expect(defaultsFor(action("file.lock"), "darwin")).toEqual(["Mod+Alt+L"]);
    expect(defaultsFor(action("file.openWith"), "darwin")).toEqual(["Mod+O"]);
    expect(defaultsFor(action("nav.home"), "darwin")).toEqual(["Alt+Home", "Mod+Alt+H"]);
    expect(defaultsFor(action("nav.recents"), "darwin")).toEqual(["Mod+Alt+Y"]);
    expect(defaultsFor(action("nav.duplicateTab"), "darwin")).toEqual(["Mod+Alt+D"]);
    expect(defaultsFor(action("app.activity"), "darwin")).toEqual(["Mod+Shift+Y"]);
    expect(defaultsFor(action("app.shortcuts"), "darwin")).toEqual(["Mod+Shift+/"]);
    expect(formatShortcut("Mod+Shift+E", "darwin")).toBe("⌘⇧E");
    expect(formatShortcut("Mod+Shift+E", "linux")).toBe("Ctrl+Shift+E");
    expect(formatShortcut("Mod+U", "darwin")).toBe("⌘U");
    expect(formatShortcut("Mod+U", "linux")).toBe("Ctrl+U");
  });
});

describe("matching key presses", () => {
  test("Ctrl is the Control key on a Mac too, and Mod is Command there", () => {
    expect(matchShortcut(ev({ key: "`", code: "Backquote", ctrlKey: true }), "Ctrl+`", "darwin")).toBe(true);
    expect(matchShortcut(ev({ key: "`", code: "Backquote", metaKey: true }), "Ctrl+`", "darwin")).toBe(false);
    expect(matchShortcut(ev({ key: "t", code: "KeyT", metaKey: true, altKey: true }), "Mod+Alt+T", "darwin")).toBe(true);
    expect(matchShortcut(ev({ key: "t", code: "KeyT", ctrlKey: true, altKey: true }), "Mod+Alt+T", "linux")).toBe(true);
    expect(matchShortcut(ev({ key: "t", code: "KeyT", metaKey: true, altKey: true }), "Mod+Alt+T", "linux")).toBe(false);
  });
  test("a punctuation key is matched by where it is, so other keyboard layouts work", () => {
    // On a German keyboard the key left of 1 types "^"
    expect(matchShortcut(ev({ key: "^", code: "Backquote", ctrlKey: true }), "Ctrl+`", "linux")).toBe(true);
    expect(matchShortcut(ev({ key: "=", code: "Equal", metaKey: true }), "Mod+=", "darwin")).toBe(true);
  });
  test("extra modifiers don't match", () => {
    expect(matchShortcut(ev({ key: "s", code: "KeyS", ctrlKey: true, shiftKey: true }), "Mod+S", "linux")).toBe(false);
  });
});

describe("conflicts", () => {
  test("two actions in the same place can't share a key", () => {
    const keys = defaults("linux");
    const problem = checkAssign(action("view.details"), "Mod+2", keys, "linux");
    expect(problem?.reason).toContain("already used");
    expect(problem?.reason).toContain("List view");
    expect(problem?.other?.id).toBe("view.list");
  });
  test("Ctrl and Mod are the same key on Windows and Linux, but different keys on a Mac", () => {
    expect(canonical("Ctrl+K", "linux")).toBe(canonical("Mod+K", "linux"));
    expect(canonical("Ctrl+K", "darwin")).not.toBe(canonical("Mod+K", "darwin"));
    expect(checkAssign(action("view.details"), "Ctrl+2", defaults("linux"), "linux")?.other?.id).toBe("view.list");
    expect(checkAssign(action("view.details"), "Ctrl+2", defaults("darwin"), "darwin")).toBeNull();
  });
  test("the file list and the Code editor are separate places, so they may share a key", () => {
    expect(checkAssign(action("file.copy"), "Mod+S", defaults("linux"), "linux")).toBeNull();
    expect(checkAssign(action("code.save"), "Mod+Shift+H", defaults("linux"), "linux")).toBeNull();
  });
  test("keys that work everywhere clash with every place", () => {
    const keys = defaults("linux");
    expect(checkAssign(action("terminal.here"), "Mod+S", keys, "linux")?.other?.id).toBe("code.save");
    expect(checkAssign(action("file.copy"), "Ctrl+`", keys, "linux")?.other?.id).toBe("terminal.toggle");
    expect(checkAssign(action("code.zen"), "Mod+Alt+T", keys, "linux")?.other?.id).toBe("terminal.here");
  });
  test("fixed keys can't be taken", () => {
    const keys = defaults("linux");
    expect(checkAssign(action("file.copy"), "Alt+3", keys, "linux")?.reason).toContain("fixed");
    expect(checkAssign(action("code.save"), "Alt+3", keys, "linux")?.reason).toContain("fixed");
    expect(checkAssign(action("code.find"), "Mod+A", keys, "linux")?.reason).toContain("fixed");
    expect(FIXED.length).toBeGreaterThan(5);
  });
  test("keys needed for typing and moving, and keys the computer keeps, are refused with a reason", () => {
    const keys = defaults("linux");
    for (const bad of ["Q", "5", "Space", "Enter", "ArrowDown", "Tab", "Escape", "Shift+Q", "Shift+ArrowUp"]) expect(checkAssign(action("file.copy"), bad, keys, "linux"), bad).not.toBeNull();
    expect(checkAssign(action("code.save"), "Delete", keys, "linux")?.reason).toContain("edits the text");
    expect(checkAssign(action("file.copy"), "Alt+F4", keys, "linux")?.reason).toContain("computer");
    expect(checkAssign(action("file.copy"), "Mod+Tab", keys, "darwin")?.reason).toContain("computer");
    expect(checkAssign(action("file.copy"), "F9", keys, "linux")).toBeNull();
    expect(checkAssign(action("file.copy"), "Shift+Delete", keys, "linux")?.other?.id).toBe("file.deleteForever");
    expect(checkAssign(action("file.copy"), "nonsense+++", keys, "linux")?.reason).toContain("isn't a key combination");
  });
});

describe("a person's changes", () => {
  test("a change replaces the original and a free key is accepted", () => {
    const { keys, rejected } = effectiveKeys({ "terminal.here": ["Mod+Alt+J"], "file.rename": ["F9", "Mod+Alt+R"] }, "linux");
    expect(keys.get("terminal.here")).toEqual(["Mod+Alt+J"]);
    expect(keys.get("file.rename")).toEqual(["F9", "Mod+Alt+R"]);
    expect(rejected).toEqual([]);
  });
  test("two actions can swap keys", () => {
    const { keys, rejected } = effectiveKeys({ "view.details": ["Mod+2"], "view.list": ["Mod+1"] }, "linux");
    expect(keys.get("view.details")).toEqual(["Mod+2"]);
    expect(keys.get("view.list")).toEqual(["Mod+1"]);
    expect(rejected).toEqual([]);
  });
  test("a change that clashes is never applied and the action keeps its original keys", () => {
    const { keys, rejected } = effectiveKeys({ "view.details": ["Mod+2"] }, "linux");
    expect(keys.get("view.details")).toEqual(["Mod+1"]);
    expect(keys.get("view.list")).toEqual(["Mod+2"]);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toContain("already used");
  });
  test("when two changes want the same key the first one wins", () => {
    const { keys, rejected } = effectiveKeys({ "file.copy": ["Mod+Shift+K"], "file.cut": ["Mod+Shift+K"] }, "linux");
    expect(keys.get("file.copy")).toEqual(["Mod+Shift+K"]);
    expect(keys.get("file.cut")).toEqual(["Mod+X"]);
    expect(rejected.length).toBe(1);
  });
  test("an action can be switched off, and the key it had becomes free", () => {
    const { keys } = effectiveKeys({ "view.list": [], "view.details": ["Mod+2"] }, "linux");
    expect(keys.get("view.list")).toEqual([]);
    expect(keys.get("view.details")).toEqual(["Mod+2"]);
  });
  test("saved changes are cleaned: unknown actions, bad text, repeats, clashes and changes that equal the original", () => {
    const clean = sanitizeOverrides({
      "nope": ["Mod+K"], "file.copy": ["Mod+Shift+K", "mod+shift+k", "not a key", 5], "file.cut": ["Mod+Shift+K"], "view.list": ["Mod+2"], "terminal.here": [], "app.help": "F1", "file.paste": ["Mod+V"],
    }, "linux");
    expect(clean).toEqual({ "file.copy": ["Mod+Shift+K"], "terminal.here": [] });
    expect(sanitizeOverrides(null, "linux")).toEqual({});
    expect(sanitizeOverrides([], "linux")).toEqual({});
    expect(sanitizeOverrides({ "file.copy": Array(20).fill("Mod+Shift+K") }, "linux")).toEqual({ "file.copy": ["Mod+Shift+K"] });
  });
  test("cleaning is stable: cleaning twice gives the same", () => {
    const once = sanitizeOverrides({ "file.copy": ["Mod+Shift+K"], "view.details": ["Mod+2"], "view.list": ["Mod+1"] }, "darwin");
    expect(sanitizeOverrides(once, "darwin")).toEqual(once);
  });
});

describe("recording a key press", () => {
  test("modifiers on their own are not a shortcut", () => {
    for (const key of ["Control", "Shift", "Alt", "Meta"]) expect(specFromEvent(ev({ key }), "linux")).toBeNull();
  });
  test("Control is Mod on Windows and Linux; Command is Mod and Control is Ctrl on a Mac", () => {
    expect(specFromEvent(ev({ key: "t", code: "KeyT", ctrlKey: true, altKey: true }), "linux")).toEqual({ spec: "Mod+Alt+T" });
    expect(specFromEvent(ev({ key: "†", code: "KeyT", metaKey: true, altKey: true }), "darwin")).toEqual({ spec: "Mod+Alt+T" });
    expect(specFromEvent(ev({ key: "`", code: "Backquote", ctrlKey: true }), "darwin")).toEqual({ spec: "Ctrl+`" });
    expect(specFromEvent(ev({ key: "2", code: "Digit2", ctrlKey: true, shiftKey: true }), "linux")).toEqual({ spec: "Mod+Shift+2" });
    expect(specFromEvent(ev({ key: "F9", code: "F9" }), "linux")).toEqual({ spec: "F9" });
    expect(specFromEvent(ev({ key: " ", code: "Space", ctrlKey: true }), "linux")).toEqual({ spec: "Mod+Space" });
  });
  test("the Windows key can't be used, and dead keys are refused", () => {
    expect(specFromEvent(ev({ key: "t", code: "KeyT", metaKey: true }), "linux")).toMatchObject({ error: expect.stringContaining("Windows") });
    expect(specFromEvent(ev({ key: "Dead", code: "Quote" }), "linux")).toMatchObject({ error: expect.any(String) });
  });
  test("what is recorded is a valid shortcut that matches the same key press", () => {
    const press = ev({ key: "k", code: "KeyK", ctrlKey: true, altKey: true });
    const got = specFromEvent(press, "linux") as { spec: string };
    expect(isValidSpec(got.spec)).toBe(true);
    expect(matchShortcut(press, got.spec, "linux")).toBe(true);
  });
});

describe("the saved settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "fm-shortcuts-"));
  const ctx = createContext({ home: dir, dataDir: join(dir, "data"), platform: "linux" } as any);
  test("start with none, and a clash is dropped when saving", async () => {
    expect(DEFAULT_SETTINGS.shortcuts).toEqual({});
    const saved = await updateSettings(ctx, { shortcuts: { "file.copy": ["Mod+Shift+K"], "file.cut": ["Mod+Shift+K"], "view.list": ["Mod+1"], "bogus": ["F9"] } });
    expect(saved.shortcuts).toEqual({ "file.copy": ["Mod+Shift+K"] });
    expect((await loadSettings(ctx)).shortcuts).toEqual({ "file.copy": ["Mod+Shift+K"] });
    rmSync(dir, { recursive: true, force: true });
  });
  test("a hand-edited file can't make two actions share a key, and odd values are ignored", () => {
    const ctx2 = createContext({ home: "/tmp", dataDir: "/tmp/fm-shortcuts-none", platform: "linux" } as any);
    expect(sanitizeSettings({ shortcuts: { "view.details": ["Mod+2"] } }, ctx2).shortcuts).toEqual({});
    expect(sanitizeSettings({ shortcuts: "x" }, ctx2).shortcuts).toEqual({});
    expect(sanitizeSettings({ shortcuts: { "file.copy": [1, null, {}] } }, ctx2).shortcuts).toEqual({});
  });
});

describe("a Mac keyboard on Windows or Linux (its Delete key sends Backspace)", () => {
  test("by default on Windows, Linux, and macOS, both Delete and Backspace delete", () => {
    for (const platform of ["win32", "linux"]) {
      expect(defaultsFor(action("file.trash"), platform)).toEqual(["Delete", "Backspace"]);
      expect(defaultsFor(action("file.deleteForever"), platform)).toEqual(["Shift+Delete", "Shift+Backspace"]);
      expect(defaultsFor(action("file.bury"), platform)).toEqual(["Alt+Delete", "Alt+Backspace"]);
      expect(defaultsFor(action("nav.up"), platform)).toEqual(["Alt+ArrowUp"]);
    }
    expect(defaultsFor(action("file.trash"), "darwin")).toEqual(["Delete", "Backspace", "Mod+Backspace"]);
    expect(defaultsFor(action("file.deleteForever"), "darwin")).toEqual(["Shift+Delete", "Shift+Backspace"]);
    expect(defaultsFor(action("nav.up"), "darwin")).toEqual(["Alt+ArrowUp", "Mod+ArrowUp"]);
  });

  test("with the setting turned off, Backspace goes up a folder on Windows and Linux while Mac is untouched", () => {
    setBackspaceDeletes(false);
    try {
      for (const platform of ["win32", "linux"]) {
        expect(defaultsFor(action("nav.up"), platform)).toContain("Backspace");
        expect(defaultsFor(action("file.trash"), platform)).toEqual(["Delete"]);
        expect(defaultsFor(action("file.deleteForever"), platform)).toEqual(["Shift+Delete"]);
        const keys = defaults(platform);
        for (const a of ACTIONS as any[]) for (const spec of keys.get(a.id) as string[]) {
          expect(isValidSpec(spec), `${a.id} ${spec}`).toBe(true);
          expect(checkAssign(a, spec, keys, platform), `${platform} ${a.id} ${spec}`).toBeNull();
        }
      }
      expect(defaultsFor(action("file.trash"), "darwin")).toEqual(["Delete", "Backspace", "Mod+Backspace"]);
      expect(defaultsFor(action("file.deleteForever"), "darwin")).toEqual(["Shift+Delete", "Shift+Backspace"]);
      expect(defaultsFor(action("nav.up"), "darwin")).toEqual(["Alt+ArrowUp", "Mod+ArrowUp"]);
    } finally {
      setBackspaceDeletes(true);
    }
    expect(defaultsFor(action("file.trash"), "win32")).toEqual(["Delete", "Backspace"]);
  });

  test("the setting is saved, validated, on by default, and upgrades legacy settings files that had the old false default", async () => {
    expect(DEFAULT_SETTINGS.backspaceDeletes).toBe(true);
    const root = mkdtempSync(join(tmpdir(), "fm-bs-"));
    try {
      const dataDir = join(root, "data");
      mkdirSync(dataDir, { recursive: true });
      const ctx = createContext({ home: join(root, "home"), dataDir, platform: "linux" });
      expect((await loadSettings(ctx)).backspaceDeletes).toBe(true);

      // Simulate an older version's saved file_manager.json where backspaceDeletes defaulted to false on Linux/Windows
      writeFileSync(join(dataDir, "file_manager.json"), JSON.stringify({ theme: "dark", backspaceDeletes: false }, null, 2));
      expect((await loadSettings(ctx)).backspaceDeletes).toBe(true);
      expect((await updateSettings(ctx, { view: "icons" })).backspaceDeletes).toBe(true);

      // Explicitly turning it off persists across loads and unrelated updates
      expect((await updateSettings(ctx, { backspaceDeletes: false })).backspaceDeletes).toBe(false);
      expect((await loadSettings(ctx)).backspaceDeletes).toBe(false);
      expect((await updateSettings(ctx, { view: "details" })).backspaceDeletes).toBe(false);
      expect((await updateSettings(ctx, { backspaceDeletes: "yes" })).backspaceDeletes).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Only close the window with its close button", () => {
  test("the setting is saved, validated and off by default", async () => {
    expect(DEFAULT_SETTINGS.shortcutsCantClose).toBe(false);
    const root = mkdtempSync(join(tmpdir(), "fm-close-"));
    try {
      const ctx = createContext({ home: join(root, "home"), dataDir: join(root, "data"), platform: "darwin" });
      expect((await updateSettings(ctx, { shortcutsCantClose: true })).shortcutsCantClose).toBe(true);
      expect((await loadSettings(ctx)).shortcutsCantClose).toBe(true);
      expect((await updateSettings(ctx, { shortcutsCantClose: 1 })).shortcutsCantClose).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
