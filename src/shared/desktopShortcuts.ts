interface ShortcutKeyEvent {
    code: string;
    key: string;
    altKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    repeat: boolean;
    isComposing: boolean;
    defaultPrevented?: boolean;
    preventDefault(): void;
    stopImmediatePropagation(): void;
}

interface ThemeOption {
    disabled: boolean;
    value: string;
    closest(selector: string): unknown;
}

interface ThemeControl {
    disabled: boolean;
    value: string;
    options: ArrayLike<ThemeOption>;
    dispatchEvent(event: Event): boolean;
    click(): void;
}

interface DesktopShortcutWindow {
    addEventListener(type: string, listener: (event: ShortcutKeyEvent) => void, capture?: boolean): void;
    __desktopShortcutsAttached?: boolean;
    toggleNativeFullscreen?: () => unknown;
    quitApp?: () => unknown;
    closeApp?: () => unknown;
    closeWindow?: () => unknown;
    cycleAppTheme?: (direction: number) => unknown;
    openAppThemes?: () => unknown;
    doToggleFullscreen?: () => unknown;
}

declare const window: DesktopShortcutWindow;
declare const document: { querySelector(selector: string): ThemeControl | null };

function desktopShortcutsClient() {
    const host = window as DesktopShortcutWindow & { localStorage?: unknown };
    try {
        const ls = host.localStorage as { getItem?: (k: string) => unknown } | undefined;
        ls?.getItem?.("__rad_ls__");
    } catch {
        let mem: Record<string, string> = {};
        const poly = {
            getItem: (k: string) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k]! : null),
            setItem: (k: string, v: unknown) => { mem[k] = String(v); },
            removeItem: (k: string) => { delete mem[k]; },
            clear: () => { mem = {}; },
            key: (i: number) => Object.keys(mem)[i] ?? null,
            get length() { return Object.keys(mem).length; },
        };
        try {
            Object.defineProperty(host, "localStorage", { value: poly, configurable: true, writable: true });
        } catch {}
    }
    if (host.__desktopShortcutsAttached) return;
    host.__desktopShortcutsAttached = true;
    let rightOption = false;

    const report = (error: unknown) => console.error("Desktop keyboard shortcut failed:", error);
    const run = (action: () => unknown) => {
        try {
            Promise.resolve(action()).catch(report);
        } catch (error) {
            report(error);
        }
    };
    const consume = (event: ShortcutKeyEvent) => {
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    const cycleTheme = (direction: number) => {
        if (typeof host.cycleAppTheme === "function") return host.cycleAppTheme(direction);
        const selector = document.querySelector(
            'select[id*="theme" i], select[name*="theme" i], select[data-theme-selector]',
        );
        if (selector && !selector.disabled) {
            const options = Array.from(selector.options).filter((option) =>
                !option.disabled && !option.closest("optgroup[disabled]") && option.value !== "",
            );
            if (!options.length) throw new Error("No themes are available.");
            const current = options.findIndex((option) => option.value === selector.value);
            const next = current < 0 ? (direction > 0 ? 0 : options.length - 1)
                : (current + direction + options.length) % options.length;
            selector.value = options[next]!.value;
            selector.dispatchEvent(new Event("change", { bubbles: true }));
            return;
        }
        const toggle = document.querySelector("#themeToggle, #btn-theme, #theme-toggle");
        if (toggle && !toggle.disabled) {
            toggle.click();
            return;
        }
        throw new Error("This app has no switchable themes.");
    };

    // Right Option + T: the app's own theme gallery, or else focus its theme list so the arrow keys pick one.
    const openThemes = () => {
        if (typeof host.openAppThemes === "function") return host.openAppThemes();
        const selector = document.querySelector(
            'select[id*="theme" i], select[name*="theme" i], select[data-theme-selector]',
        ) as (ThemeControl & { focus?: () => void; showPicker?: () => void }) | null;
        if (selector && !selector.disabled) {
            selector.focus?.();
            try { selector.showPicker?.(); } catch { /* showPicker needs a user gesture in some engines; focus is enough */ }
            return;
        }
        throw new Error("This app has no theme list.");
    };

    window.addEventListener("blur", () => { rightOption = false; });
    window.addEventListener("keyup", (event) => {
        if (event.code === "AltRight" || !event.altKey) rightOption = false;
    }, true);
    window.addEventListener("keydown", (event) => {
        if (event.code === "AltRight") rightOption = true;
        if (!event.altKey && event.code !== "AltRight") rightOption = false;
        if (event.isComposing) return;

        if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
            (event.code === "KeyQ" || event.key.toLowerCase() === "q")) {
            const quit = host.quitApp || host.closeApp || host.closeWindow;
            if (typeof quit === "function") {
                consume(event);
                if (!event.repeat) run(() => quit.call(host));
            }
            return;
        }

        // Use physical codes: Option changes the character produced by punctuation keys on macOS.
        if (!rightOption || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
        if (event.code === "Slash") {
            consume(event);
            if (!event.repeat) run(() => {
                const toggle = host.toggleNativeFullscreen || host.doToggleFullscreen;
                if (!toggle) throw new Error("Native fullscreen is unavailable.");
                return toggle.call(host);
            });
        } else if (event.code === "BracketLeft" || event.code === "BracketRight") {
            consume(event);
            if (!event.repeat) run(() => cycleTheme(event.code === "BracketRight" ? 1 : -1));
        } else if (event.code === "KeyT") {
            consume(event);
            if (!event.repeat) run(openThemes);
        }
    }, true);

    // Standard editing shortcuts (Cut/Copy/Paste/Select All/Undo/Redo). macOS webviews hosted without an app
    // menu have no Edit menu, so Cmd+C/V/X/A/Z do nothing there. Windows and Linux use Ctrl instead of Cmd. The
    // shortcuts are handled (and the native default suppressed) on every platform so behavior is identical, and
    // so the undo history and selection highlight below work everywhere.
    const isMac = /Mac|iPhone|iPad/i.test(String((host as any).navigator?.platform || (host as any).navigator?.userAgent || ""));
    {
        const doc = (host as any).document;
        const readSelection = (): string => {
            const el = doc.activeElement as any;
            if (el && typeof el.selectionStart === "number" && typeof el.value === "string" && el.selectionStart !== el.selectionEnd) {
                return el.value.substring(el.selectionStart, el.selectionEnd);
            }
            return String((host as any).getSelection?.()?.toString() || "");
        };
        const writeClip = async (text: string) => {
            if (typeof (host as any).__radClipboardWrite === "function") {
                try { await (host as any).__radClipboardWrite(text); return; } catch { /* fall through */ }
            }
            try { await (host as any).navigator.clipboard.writeText(text); } catch { doc.execCommand("copy"); }
        };
        const readClip = async (): Promise<string> => {
            if (typeof (host as any).__radClipboardRead === "function") {
                try { return String((await (host as any).__radClipboardRead()) ?? ""); } catch { /* fall through */ }
            }
            try { return await (host as any).navigator.clipboard.readText(); } catch { return ""; }
        };
        // Visible selection: some themes leave ::selection unstyled or unfocused-gray, so "select all" looks like nothing happened.
        const ensureSelectionStyle = () => {
            if (doc.getElementById("rad-selection-style") || !doc.head) return;
            const st = doc.createElement("style");
            st.id = "rad-selection-style";
            st.textContent = "input::selection, textarea::selection, [contenteditable]::selection { background: #2563eb !important; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }";
            doc.head.appendChild(st);
        };
        ensureSelectionStyle();
        doc.addEventListener("DOMContentLoaded", ensureSelectionStyle);

        // Own undo history for inputs/textareas: the native stack is lost whenever the app rewrites .value, and
        // there is no Edit menu to drive it, so Cmd+Z would otherwise do nothing.
        const histories = new WeakMap<object, { stack: { v: string; s: number; e: number }[]; i: number }>();
        let restoring = false;
        const isTextField = (el: any) => !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(el.type || "")));
        const snap = (el: any) => {
            let h = histories.get(el);
            if (!h) { h = { stack: [], i: -1 }; histories.set(el, h); }
            const top = h.stack[h.i];
            if (top && top.v === el.value) { top.s = el.selectionStart; top.e = el.selectionEnd; return; }
            h.stack = h.stack.slice(0, h.i + 1);
            h.stack.push({ v: el.value, s: el.selectionStart, e: el.selectionEnd });
            if (h.stack.length > 200) h.stack.shift();
            h.i = h.stack.length - 1;
        };
        doc.addEventListener("focusin", (ev: any) => { if (isTextField(ev.target)) snap(ev.target); }, true);
        doc.addEventListener("input", (ev: any) => { if (!restoring && isTextField(ev.target)) snap(ev.target); }, true);
        const stepHistory = (el: any, dir: number) => {
            snap(el);
            const h = histories.get(el)!;
            const next = h.i + dir;
            if (next < 0 || next >= h.stack.length) return;
            h.i = next;
            const st = h.stack[next]!;
            restoring = true;
            try {
                el.value = st.v;
                el.setSelectionRange(st.s, st.e);
                el.dispatchEvent(new Event("input", { bubbles: true }));
            } finally { restoring = false; }
        };

        window.addEventListener("keydown", (event) => {
            if (event.defaultPrevented || event.isComposing) return;
            // Cmd on Mac, Ctrl elsewhere; AltGr (reported as Ctrl+Alt on Windows) must keep typing characters.
            const mod = isMac ? (event.metaKey && !event.ctrlKey) : (event.ctrlKey && !event.metaKey);
            if (!mod || event.altKey) return;
            const el = doc.activeElement as any;
            const editable = !!el && (
                (el.tagName === "TEXTAREA") ||
                (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(el.type || "")) ||
                el.isContentEditable
            );
            const code = event.code;
            if (code === "KeyA" && !event.shiftKey) {
                consume(event);
                if (editable && typeof el.select === "function") el.select();
                else doc.execCommand("selectAll");
            } else if (code === "KeyC" && !event.shiftKey) {
                const text = readSelection();
                if (!text) return;
                consume(event);
                run(() => writeClip(text));
            } else if (code === "KeyX" && !event.shiftKey) {
                if (!editable) return;
                const text = readSelection();
                if (!text) return;
                consume(event);
                run(async () => { await writeClip(text); doc.execCommand("delete"); });
            } else if (code === "KeyV" && !event.shiftKey) {
                if (!editable || el.readOnly || el.disabled) return;
                consume(event);
                run(async () => {
                    const text = await readClip();
                    if (!text) return;
                    if (!doc.execCommand("insertText", false, text) && typeof el.setRangeText === "function") {
                        el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
                        el.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                });
            } else if (code === "KeyZ") {
                if (!editable) return;
                consume(event);
                if (isTextField(el)) stepHistory(el, event.shiftKey ? 1 : -1);
                else doc.execCommand(event.shiftKey ? "redo" : "undo");
            } else if (code === "KeyY" && !event.shiftKey) {
                if (!editable) return;
                consume(event);
                if (isTextField(el)) stepHistory(el, 1);
                else doc.execCommand("redo");
            }
        });
    }

    // Let dialogs, editors and games handle Esc first, but never let its default action leave fullscreen.
    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.code === "Escape") event.preventDefault();
    });
}

export const DESKTOP_SHORTCUTS_SCRIPT = `(${desktopShortcutsClient.toString()})();`;
