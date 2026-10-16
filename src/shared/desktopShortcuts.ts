interface ShortcutKeyEvent {
    code: string;
    key: string;
    altKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    repeat: boolean;
    isComposing: boolean;
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
    const host = window;
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

    // Let dialogs, editors and games handle Esc first, but never let its default action leave fullscreen.
    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.code === "Escape") event.preventDefault();
    });
}

export const DESKTOP_SHORTCUTS_SCRIPT = `(${desktopShortcutsClient.toString()})();`;
