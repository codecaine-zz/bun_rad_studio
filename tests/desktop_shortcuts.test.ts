import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { attachWindowShortcuts, getWindowShortcutsScript } from "../index";
import { SimpleWindow, getTheme, SIMPLEGUI_THEMES } from "../src/simplegui";
import { DESKTOP_SHORTCUTS_SCRIPT } from "../src/shared/desktopShortcuts";

type KeyOptions = Partial<{ key: string; altKey: boolean; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; repeat: boolean; isComposing: boolean }>;

function page(script = DESKTOP_SHORTCUTS_SCRIPT) {
    const dom = new JSDOM('<!doctype html><input id="editor"><dialog open><textarea></textarea></dialog>');
    const window = dom.window;
    const calls = { fullscreen: 0, quit: 0, exit: 0 };
    Object.assign(window, {
        toggleNativeFullscreen: () => { calls.fullscreen++; },
        quitApp: () => { calls.quit++; },
    });
    Object.assign(window.document, {
        fullscreenElement: window.document.documentElement,
        exitFullscreen: () => { calls.exit++; return Promise.resolve(); },
    });
    const errors: unknown[] = [];
    const install = (source: string) => new Function(
        "window", "document", "Event", "navigator", "setTimeout", "setInterval", "console", source,
    )(window, window.document, window.Event, window.navigator, () => 0, () => 0, { error: (...args: unknown[]) => errors.push(args) });
    install(script);
    const press = (code: string, opts: KeyOptions = {}, target: EventTarget = window.document.body, type = "keydown") => {
        const event = new window.KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true, ...opts });
        target.dispatchEvent(event);
        return event;
    };
    const option = (code: string, opts: KeyOptions = {}) => {
        press("AltRight", { key: "Alt", altKey: true });
        return press(code, { altKey: true, ...opts });
    };
    return { window, calls, errors, press, option, install, close: () => window.close() };
}

const simpleHtml = new SimpleWindow("Shortcuts", 800, 600, { fullscreen: false, autoSave: false }).generateHtml();
const simpleScript = [...simpleHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]!)
    .find((source) => source.includes("let lastAltTime"));
if (!simpleScript) throw new Error("SimpleGUI's keyboard script was not generated.");

for (const [name, script] of [
    ["shared desktop client", DESKTOP_SHORTCUTS_SCRIPT],
    ["studio window script", getWindowShortcutsScript()],
    ["SimpleGUI generated script", simpleScript],
] as const) {
    describe(name, () => {
        test("Esc never changes fullscreen and still reaches dialogs and tools", () => {
            const p = page(script);
            let escaped = 0;
            p.window.document.addEventListener("keydown", (event: { key: string }) => {
                if (event.key === "Escape") escaped++;
            });
            for (const target of [p.window.document.body, p.window.document.querySelector("textarea")!]) {
                expect(p.press("Escape", {}, target).defaultPrevented).toBe(true);
            }
            expect(escaped).toBe(2);
            expect(p.calls).toEqual({ fullscreen: 0, quit: 0, exit: 0 });
            p.close();
        });

        test("Right Option+/ toggles exactly once, ignoring changed characters and key repeat", () => {
            const p = page(script);
            expect(p.option("Slash", { key: "\u00f7" }).defaultPrevented).toBe(true);
            expect(p.calls.fullscreen).toBe(1);
            p.press("Slash", { altKey: true, repeat: true });
            expect(p.calls.fullscreen).toBe(1);
            p.option("Slash");
            expect(p.calls.fullscreen).toBe(2);
            expect(p.calls.quit).toBe(0);
            p.close();
        });

        test("Left Option, extra modifiers, composing, and lost focus do not trigger fullscreen", () => {
            const p = page(script);
            p.press("AltLeft", { key: "Alt", altKey: true });
            p.press("Slash", { altKey: true });
            p.option("Slash", { metaKey: true });
            p.option("Slash", { shiftKey: true });
            p.option("Slash", { isComposing: true });
            p.press("AltRight", { key: "Alt", altKey: false }, undefined, "keyup");
            p.press("Slash", { altKey: true });
            p.press("AltRight", { key: "Alt", altKey: true });
            p.window.dispatchEvent(new p.window.Event("blur"));
            p.press("Slash", { altKey: true });
            expect(p.calls.fullscreen).toBe(0);
            p.close();
        });

        test("Cmd+Q works inside inputs and dialogs even if a local handler stops propagation", () => {
            const p = page(script);
            for (const target of [p.window.document.querySelector("input")!, p.window.document.querySelector("textarea")!]) {
                target.addEventListener("keydown", (event: Event) => event.stopImmediatePropagation());
                expect(p.press("KeyQ", { key: "q", metaKey: true }, target).defaultPrevented).toBe(true);
            }
            p.press("KeyQ", { metaKey: true, repeat: true });
            expect(p.calls.quit).toBe(2);
            p.close();
        });

        test("theme keys wrap in both directions and use the app's existing change handler", () => {
            const p = page(script);
            p.window.document.body.insertAdjacentHTML("beforeend", '<select id="theme-selector"><option value="dark">Dark</option><option disabled value="skip">Skip</option><option value="light">Light</option></select>');
            const select = p.window.document.querySelector("select")!;
            let changed = 0;
            select.addEventListener("change", () => changed++);
            p.option("BracketRight", { key: "\u2018" });
            expect(select.value).toBe("light");
            p.option("BracketRight");
            expect(select.value).toBe("dark");
            p.option("BracketLeft");
            expect(select.value).toBe("light");
            p.press("BracketLeft", { altKey: true, repeat: true });
            expect(changed).toBe(3);
            expect(p.calls.quit).toBe(0);
            p.close();
        });
    });
}

test("the shared client is idempotent and prefers an app's theme bridge", () => {
    const p = page();
    p.install(DESKTOP_SHORTCUTS_SCRIPT);
    const directions: number[] = [];
    Object.assign(p.window, { cycleAppTheme: (direction: number) => directions.push(direction) });
    p.option("BracketRight");
    p.option("BracketLeft");
    expect(directions).toEqual([1, -1]);
    p.option("Slash");
    expect(p.calls.fullscreen).toBe(1);
    p.close();
});

test("File Manager's closeApp bridge is supported", () => {
    const p = page();
    Reflect.deleteProperty(p.window, "quitApp");
    Object.assign(p.window, { closeApp: () => { p.calls.quit++; } });
    p.press("KeyQ", { metaKey: true }, p.window.document.querySelector("input")!);
    expect(p.calls.quit).toBe(1);
    p.close();
});

test("apps with a theme toggle use its existing click handler", () => {
    const p = page();
    p.window.document.body.insertAdjacentHTML("beforeend", '<button id="themeToggle">Theme</button>');
    let clicks = 0;
    p.window.document.querySelector("button")!.addEventListener("click", () => clicks++);
    p.option("BracketRight");
    p.option("BracketLeft");
    expect(clicks).toBe(2);
    p.close();
});

test("bridge failures are reported rather than silently ignored", async () => {
    const p = page();
    Object.assign(p.window, { cycleAppTheme: () => Promise.reject(new Error("Theme failed")) });
    p.option("BracketRight");
    await Promise.resolve();
    expect(p.errors).toHaveLength(1);
    p.close();
});

test("native windows install the shortcuts before page scripts run", () => {
    const scripts: string[] = [];
    const fake = { unsafeWindowHandle: null, init: (script: string) => scripts.push(script), bind: () => {} };
    attachWindowShortcuts(fake as unknown as Parameters<typeof attachWindowShortcuts>[0], { fullscreen: false });
    expect(scripts).toEqual([DESKTOP_SHORTCUTS_SCRIPT]);
});

describe("SimpleGUI theme cycling", () => {
    test("visits each distinct built-in theme, resolves aliases and wraps backward", () => {
        const win = new SimpleWindow("Themes", 800, 600, { theme: "macos_dark", autoSave: false });
        const initial = getTheme(win.theme).name;
        const seen = new Set<string>();
        const count = new Set(Object.values(SIMPLEGUI_THEMES).map((theme) => theme.name)).size;
        for (let i = 0; i < count; i++) {
            win.cycleTheme(1, false);
            seen.add(getTheme(win.theme).name);
        }
        expect(seen.size).toBe(count);
        expect(getTheme(win.theme).name).toBe(initial);
        win.cycleTheme(-1, false);
        win.cycleTheme(1, false);
        expect(getTheme(win.theme).name).toBe(initial);
    });

    test("a theme selector stays in sync with keyboard cycling", () => {
        const win = new SimpleWindow("Themes", 800, 600, { theme: "dracula", autoSave: false });
        win.addThemeSelector("my_colors", "", false);
        win.cycleTheme(1, false);
        expect(win.getValue("my_colors")).toBe(win.theme);
        win.cycleTheme(-1, false);
        expect(getTheme(win.theme).name).toBe("Dracula");
        expect(win.getValue("my_colors")).toBe(win.theme);
    });
});
