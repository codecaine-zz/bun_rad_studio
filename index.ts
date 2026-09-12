import { SizeHint, Webview } from "webview-bun";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { spawn, spawnSync } from "child_process";
import { join } from "path";
import { dlopen, FFIType } from "bun:ffi";

function getLinuxDisplaySizeFallback() {
    try {
        const out = spawnSync("xrandr", ["--query"], { encoding: "utf8" });
        const text = String(out.stdout || "");
        const match = text.match(/(\d+)x(\d+)(?:\s+\+\d+\+\d+)?/);
        if (match) {
            return { width: Number(match[1]), height: Number(match[2]) };
        }
    } catch {
        // Ignore and use a safe fallback
    }
    return { width: 1920, height: 1080 };
}

const fullscreenStateMap = new WeakMap<Webview, boolean>();
export const fullscreenDebounceMap = new WeakMap<object, number>();

export function setAlwaysOnTopNative(wv: Webview, onTop: boolean) {
    try {
        const handle = wv.unsafeWindowHandle;
        if (!handle) return;

        if (process.platform === "darwin") {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.i64],
                    returns: FFIType.void,
                },
                sel_registerName: {
                    args: [FFIType.cstring],
                    returns: FFIType.pointer,
                }
            });
            const sel_setLevel = libobjc.symbols.sel_registerName(Buffer.from("setLevel:\0"));
            // Level 5 = NSFloatingWindowLevel (Always On Top), 0 = NSNormalWindowLevel
            const level = onTop ? 5n : 0n;
            libobjc.symbols.objc_msgSend(handle, sel_setLevel, level);
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                SetWindowPos: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32],
                    returns: FFIType.bool,
                }
            });
            // HWND_TOPMOST = -1, HWND_NOTOPMOST = -2
            // SWP_NOMOVE (2) | SWP_NOSIZE (1) = 3
            const insertAfter = onTop ? -1 : -2;
            user32.symbols.SetWindowPos(handle, insertAfter, 0, 0, 0, 0, 3);
        } else if (process.platform === "linux") {
            // Linux/Wayland builds in Bun can crash when directly calling GTK/GDK FFI.
            // The safe fallback is to leave the window at normal stacking until a stable host API is available.
            console.warn("Linux always-on-top is unavailable in this Bun/Wayland environment; skipping native call.");
        }
    } catch (e) {
        console.warn("Could not set window level:", e);
    }
}

export function toggleFullscreenNative(wv: Webview) {
    try {
        if (!wv) return;
        const now = Date.now();
        const lastToggle = fullscreenDebounceMap.get(wv as any) ?? 0;
        if (now - lastToggle < 450) {
            return;
        }
        fullscreenDebounceMap.set(wv as any, now);

        const handle = wv.unsafeWindowHandle;
        if (!handle) return;

        if (process.platform === "darwin") {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.u64],
                    returns: FFIType.u64,
                },
                sel_registerName: {
                    args: [FFIType.cstring],
                    returns: FFIType.pointer,
                }
            });
            const sel_cb = libobjc.symbols.sel_registerName(Buffer.from("collectionBehavior\0"));
            const sel_scb = libobjc.symbols.sel_registerName(Buffer.from("setCollectionBehavior:\0"));
            const sel_toggle = libobjc.symbols.sel_registerName(Buffer.from("toggleFullScreen:\0"));

            // Enable NSWindowCollectionBehaviorFullScreenPrimary (128) on NSWindow
            const cb = BigInt(libobjc.symbols.objc_msgSend(handle, sel_cb, 0n));
            libobjc.symbols.objc_msgSend(handle, sel_scb, cb | 128n);

            // Perform Cocoa toggleFullScreen:
            libobjc.symbols.objc_msgSend(handle, sel_toggle, 0n);
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                IsZoomed: {
                    args: [FFIType.pointer],
                    returns: FFIType.bool,
                },
                ShowWindow: {
                    args: [FFIType.pointer, FFIType.i32],
                    returns: FFIType.bool,
                }
            });
            const isZoomed = user32.symbols.IsZoomed(handle);
            // SW_MAXIMIZE = 3, SW_RESTORE = 9
            user32.symbols.ShowWindow(handle, isZoomed ? 9 : 3);
        } else if (process.platform === "linux") {
            // GTK/GDK direct FFI is unstable under Bun on Ubuntu/Wayland and can segfault.
            // Keep the state in memory but avoid the unsafe native call.
            const nextState = !(fullscreenStateMap.get(wv) ?? false);
            fullscreenStateMap.set(wv, nextState);
            console.warn("Linux fullscreen toggle is unavailable in this Bun/Wayland environment; skipping native call.");
        }
    } catch (e) {
        console.warn("Could not toggle native window fullscreen:", e);
    }
}

export function isFullscreenNative(wv: Webview): boolean {
    try {
        if (!wv) return false;
        const handle = wv.unsafeWindowHandle;
        if (!handle) return false;

        if (process.platform === "darwin") {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.u64],
                    returns: FFIType.u64,
                },
                sel_registerName: {
                    args: [FFIType.cstring],
                    returns: FFIType.pointer,
                }
            });
            const sel_styleMask = libobjc.symbols.sel_registerName(Buffer.from("styleMask\0"));
            const mask = BigInt(libobjc.symbols.objc_msgSend(handle, sel_styleMask, 0n));
            return (mask & (1n << 14n)) !== 0n;
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                IsZoomed: {
                    args: [FFIType.pointer],
                    returns: FFIType.bool,
                },
            });
            return Boolean(user32.symbols.IsZoomed(handle));
        } else if (process.platform === "linux") {
            return Boolean(fullscreenStateMap.get(wv));
        }
    } catch {
        return false;
    }
    return false;
}

export function setFullscreenNative(wv: Webview, fullscreen = true) {
    try {
        if (!wv) return;
        const current = isFullscreenNative(wv);
        if (current !== fullscreen) {
            fullscreenDebounceMap.delete(wv as any);
            toggleFullscreenNative(wv);
        }
    } catch (e) {
        console.warn("Could not set fullscreen:", e);
    }
}

export function minimizeWindowNative(wv: Webview) {
    try {
        const handle = wv?.unsafeWindowHandle;
        if (!handle) return;

        if (process.platform === "darwin") {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.pointer],
                    returns: FFIType.void,
                },
                sel_registerName: {
                    args: [FFIType.cstring],
                    returns: FFIType.pointer,
                }
            });
            const isFull = isFullscreenNative(wv);
            if (isFull) {
                setFullscreenNative(wv, false);
                setTimeout(() => {
                    try {
                        const sel_miniaturize = libobjc.symbols.sel_registerName(Buffer.from("miniaturize:\0"));
                        libobjc.symbols.objc_msgSend(handle, sel_miniaturize, null);
                    } catch {}
                }, 350);
                return;
            }
            try {
                const sel_perf = libobjc.symbols.sel_registerName(Buffer.from("performMiniaturize:\0"));
                libobjc.symbols.objc_msgSend(handle, sel_perf, null);
            } catch {}
            const sel_miniaturize = libobjc.symbols.sel_registerName(Buffer.from("miniaturize:\0"));
            libobjc.symbols.objc_msgSend(handle, sel_miniaturize, null);
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                ShowWindow: {
                    args: [FFIType.pointer, FFIType.i32],
                    returns: FFIType.bool,
                }
            });
            // SW_MINIMIZE = 6
            user32.symbols.ShowWindow(handle, 6);
        } else if (process.platform === "linux") {
            console.warn("Linux minimize is unavailable in this Bun/Wayland environment; skipping native call.");
        }
    } catch (e) {
        console.warn("Could not minimize native window:", e);
    }
}

export function hideAppNative(wv?: Webview) {
    try {
        if (process.platform === "darwin") {
            const libobjc = dlopen("libobjc.dylib", {
                objc_getClass: {
                    args: [FFIType.cstring],
                    returns: FFIType.pointer,
                },
                objc_msgSend: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.pointer],
                    returns: FFIType.pointer,
                },
                sel_registerName: {
                    args: [FFIType.cstring],
                    returns: FFIType.pointer,
                }
            });
            const cls = libobjc.symbols.objc_getClass(Buffer.from("NSApplication\0"));
            const selShared = libobjc.symbols.sel_registerName(Buffer.from("sharedApplication\0"));
            const app = libobjc.symbols.objc_msgSend(cls, selShared, null);
            if (app) {
                const selHide = libobjc.symbols.sel_registerName(Buffer.from("hide:\0"));
                libobjc.symbols.objc_msgSend(app, selHide, null);
                return;
            }
        }
    } catch {}
    if (wv) minimizeWindowNative(wv);
}

export function closeWindowNative(wv: Webview) {
    try {
        const handle = wv?.unsafeWindowHandle;
        if (handle && process.platform === "darwin") {
            try {
                const libobjc = dlopen("libobjc.dylib", {
                    objc_msgSend: {
                        args: [FFIType.pointer, FFIType.pointer, FFIType.pointer],
                        returns: FFIType.void,
                    },
                    sel_registerName: {
                        args: [FFIType.cstring],
                        returns: FFIType.pointer,
                    }
                });
                const sel_performClose = libobjc.symbols.sel_registerName(Buffer.from("performClose:\0"));
                libobjc.symbols.objc_msgSend(handle, sel_performClose, null);
            } catch {}
        } else if (handle && process.platform === "win32") {
            try {
                const user32 = dlopen("user32.dll", {
                    PostMessageW: {
                        args: [FFIType.pointer, FFIType.u32, FFIType.pointer, FFIType.pointer],
                        returns: FFIType.bool,
                    }
                });
                // WM_CLOSE = 0x0010
                user32.symbols.PostMessageW(handle, 0x0010, null, null);
            } catch {}
        }
    } catch (e) {
        console.warn("Could not close native window:", e);
    }
}

export function getScreenDimensions(): { width: number; height: number } {
    let screenW = 1920;
    let screenH = 1080;
    try {
        if (process.platform === "darwin") {
            const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
                CGMainDisplayID: { args: [], returns: FFIType.u32 },
                CGDisplayPixelsWide: { args: [FFIType.u32], returns: FFIType.u64 },
                CGDisplayPixelsHigh: { args: [FFIType.u32], returns: FFIType.u64 },
            });
            const mainId = cg.symbols.CGMainDisplayID();
            screenW = Number(cg.symbols.CGDisplayPixelsWide(mainId));
            screenH = Number(cg.symbols.CGDisplayPixelsHigh(mainId));
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                GetSystemMetrics: { args: [FFIType.i32], returns: FFIType.i32 },
            });
            screenW = user32.symbols.GetSystemMetrics(0);
            screenH = user32.symbols.GetSystemMetrics(1);
        }
    } catch {}
    return { width: screenW, height: screenH };
}

export function centerWindowNative(wv: Webview, winWidth = 1400, winHeight = 900) {
    return setWindowPositionNative(wv, "center", winWidth, winHeight);
}

export interface WindowShortcutOptions {
    onQuit?: () => void;
    onClose?: () => void;
    onMinimize?: () => void;
    onFullscreen?: () => void;
    onAlwaysOnTop?: (onTop: boolean) => void;
    onCenter?: () => void;
    fullscreen?: boolean;
}

export function attachWindowShortcuts(wv: Webview, options?: WindowShortcutOptions) {
    let alwaysOnTopState = false;

    // Enable macOS FullScreen Collection Behavior immediately on creation
    if (process.platform === "darwin" && wv?.unsafeWindowHandle) {
        try {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: { args: [FFIType.pointer, FFIType.pointer, FFIType.u64], returns: FFIType.u64 },
                sel_registerName: { args: [FFIType.cstring], returns: FFIType.pointer }
            });
            const sel_cb = libobjc.symbols.sel_registerName(Buffer.from("collectionBehavior\0"));
            const sel_scb = libobjc.symbols.sel_registerName(Buffer.from("setCollectionBehavior:\0"));
            const cb = BigInt(libobjc.symbols.objc_msgSend(wv.unsafeWindowHandle, sel_cb, 0n));
            libobjc.symbols.objc_msgSend(wv.unsafeWindowHandle, sel_scb, cb | 128n);
        } catch (e) {}
    }

    try {
        wv.bind("requestInitialFullscreen", () => {
            if (options?.fullscreen !== false) {
                if (!isFullscreenNative(wv)) {
                    fullscreenDebounceMap.delete(wv as any);
                    setFullscreenNative(wv, true);
                }
            }
            const isFull = isFullscreenNative(wv);
            return { success: true, isFullscreen: isFull };
        });
    } catch {}

    try {
        wv.bind("quitApp", () => {
            if (options?.onQuit) {
                try { options.onQuit(); } catch {}
            }
            try { closeWindowNative(wv); } catch {}
            process.exit(0);
        });
    } catch {}

    try {
        wv.bind("closeWindow", () => {
            if (options?.onClose) {
                try { options.onClose(); } catch {}
            }
            try { closeWindowNative(wv); } catch {}
            process.exit(0);
        });
    } catch {}

    try {
        wv.bind("minimizeWindow", () => {
            if (options?.onMinimize) {
                options.onMinimize();
            } else {
                minimizeWindowNative(wv);
            }
            return { success: true };
        });
    } catch {}

    try {
        wv.bind("hideApp", () => {
            hideAppNative(wv);
            return { success: true };
        });
    } catch {}

    try {
        wv.bind("toggleFullscreen", () => {
            if (options?.onFullscreen) {
                options.onFullscreen();
            } else {
                toggleFullscreenNative(wv);
            }
            return { success: true };
        });
    } catch {}

    try {
        wv.bind("toggleNativeFullscreen", () => {
            toggleFullscreenNative(wv);
            return { success: true };
        });
    } catch {}

    try {
        wv.bind("toggleAlwaysOnTop", () => {
            alwaysOnTopState = !alwaysOnTopState;
            setAlwaysOnTopNative(wv, alwaysOnTopState);
            if (options?.onAlwaysOnTop) options.onAlwaysOnTop(alwaysOnTopState);
            return { success: true, onTop: alwaysOnTopState };
        });
    } catch {}

    try {
        wv.bind("setAlwaysOnTop", (onTop?: boolean) => {
            alwaysOnTopState = onTop !== undefined ? onTop : !alwaysOnTopState;
            setAlwaysOnTopNative(wv, alwaysOnTopState);
            if (options?.onAlwaysOnTop) options.onAlwaysOnTop(alwaysOnTopState);
            return { success: true, onTop: alwaysOnTopState };
        });
    } catch {}

    try {
        wv.bind("centerWindow", () => {
            if (options?.onCenter) {
                options.onCenter();
            } else {
                centerWindowNative(wv);
            }
            return { success: true };
        });
    } catch {}

    try {
        wv.bind("setWindowPosition", (pos: any) => {
            setWindowPositionNative(wv, pos);
            return { success: true, position: pos };
        });
    } catch {}
}

export function getWindowShortcutsScript(): string {
    return `
(function() {
    // Disable default right-click context menu across desktop windows to prevent inspect/reload from breaking desktop apps
    window.addEventListener("contextmenu", function(e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }, { capture: true });

    let lastAltTime = 0;
    let zoomLevel = 1.0;
    let isFnPressed = false;

    function applyZoom(delta, reset) {
        if (reset) zoomLevel = 1.0;
        else zoomLevel = Math.max(0.4, Math.min(3.0, zoomLevel + delta));
        document.body.style.zoom = zoomLevel;
    }

    function doCloseOrQuit() {
        if (typeof window.quitApp === "function") {
            try { window.quitApp(); return; } catch(e) {}
        }
        if (typeof window.closeWindow === "function") {
            try { window.closeWindow(); return; } catch(e) {}
        }
        if (typeof window.handleWindowCloseIPC === "function") {
            try { window.handleWindowCloseIPC(); return; } catch(e) {}
        }
        try { window.close(); } catch(e) {}
        try { fetch("/api/shutdown", { method: "POST" }); } catch(e) {}
        try { fetch("/api/close", { method: "POST" }); } catch(e) {}
        try {
            if (!document.getElementById("shutdownOverlay")) {
                const overlay = document.createElement("div");
                overlay.id = "shutdownOverlay";
                overlay.style.cssText = "position:fixed;inset:0;background:rgba(8,11,18,0.94);backdrop-filter:blur(10px);z-index:9999999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif;";
                overlay.innerHTML = "<div style='font-size:36px;margin-bottom:12px;'>⚡</div><div style='font-size:20px;font-weight:700;'>Workstation Stopped</div><div style='font-size:13px;color:#94a3b8;margin-top:8px;'>You can now safely close this window.</div>";
                document.body.appendChild(overlay);
            }
        } catch(e) {}
    }

    let lastFullscreenTime = 0;
    function doToggleFullscreen() {
        const now = Date.now();
        if (now - lastFullscreenTime < 450) return;
        lastFullscreenTime = now;

        // 1. Native Desktop Webview IPC (if available, dispatch ONCE and return immediately)
        if (typeof window.toggleNativeFullscreen === "function") {
            try { window.toggleNativeFullscreen(); return; } catch(e) {}
        }
        if (typeof window.toggleFullscreen === "function" && window.toggleFullscreen !== doToggleFullscreen) {
            try { window.toggleFullscreen(); return; } catch(e) {}
        }

        // 2. HTML5 Fullscreen API (standard browsers and WebKit only when native IPC is unavailable)
        try {
            const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            if (!isFull) {
                const el = document.documentElement;
                if (el.requestFullscreen) {
                    el.requestFullscreen().catch(function() {});
                } else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                } else if (el.mozRequestFullScreen) {
                    el.mozRequestFullScreen();
                } else if (el.msRequestFullscreen) {
                    el.msRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(function() {});
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }
        } catch(e) {}

        // 3. Optional telemetry / server notification
        try {
            fetch("/api/fullscreen", { method: "POST" }).catch(function() {});
        } catch(e) {}
    }

    // Expose globally for UI buttons and external handlers
    window.doToggleFullscreen = doToggleFullscreen;
    if (!window.toggleFullscreen) {
        window.toggleFullscreen = doToggleFullscreen;
    }

    window.addEventListener("keyup", function(e) {
        if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn" || e.code === "Function") {
            isFnPressed = false;
        }
    });

    window.addEventListener("keydown", function(e) {
        if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn" || e.code === "Function") {
            isFnPressed = true;
        }

        // Ignore held-down key repeats for toggles
        if (e.repeat) return;

        // 1. Double-tap Alt ("alt+alt") within 450ms to close/quit window
        if ((e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight")) {
            const now = Date.now();
            if (now - lastAltTime > 50 && now - lastAltTime < 450) {
                lastAltTime = 0;
                e.preventDefault();
                doCloseOrQuit();
                return;
            }
            lastAltTime = now;
        } else if (e.key !== "Alt" && e.code !== "AltLeft" && e.code !== "AltRight") {
            lastAltTime = 0;
        }

        // 2. Prevent raw browser reload & inspect shortcuts (F5, Ctrl+R, Cmd+R, Shift+F5, Ctrl+Shift+R, F12, Ctrl+Shift+I, Cmd+Option+I, Cmd+Shift+C)
        if (
            (e.key === "F5" || e.code === "F5") ||
            (e.key === "F12" || e.code === "F12") ||
            ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "r" || e.code === "KeyR")) ||
            ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key.toLowerCase() === "i" || e.code === "KeyI" || e.key.toLowerCase() === "c" || e.code === "KeyC")) ||
            (e.metaKey && e.altKey && (e.key.toLowerCase() === "i" || e.code === "KeyI" || e.key.toLowerCase() === "j" || e.code === "KeyJ" || e.key.toLowerCase() === "c" || e.code === "KeyC"))
        ) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }

        const keyLower = (e.key || "").toLowerCase();
        const code = e.code || "";
        const isQ = keyLower === "q" || code === "KeyQ";
        const isW = keyLower === "w" || code === "KeyW";
        const isF = keyLower === "f" || code === "KeyF";
        const isM = keyLower === "m" || code === "KeyM";
        const isH = keyLower === "h" || code === "KeyH";
        const isT = keyLower === "t" || code === "KeyT";
        const isC = keyLower === "c" || code === "KeyC";

        // 3. Close / Quit shortcuts: Cmd+Q, Cmd+W, Ctrl+Q, Ctrl+W, Alt+F4, Alt+W, Alt+Q
        if (
            ((e.metaKey || e.ctrlKey) && (isQ || isW)) ||
            (e.altKey && (isQ || isW || e.key === "F4" || code === "F4"))
        ) {
            e.preventDefault();
            doCloseOrQuit();
            return;
        }

        const isInput = !!(e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable));
        const isFn = isFnPressed || (typeof e.getModifierState === "function" && (e.getModifierState("Fn") || e.getModifierState("FnLock") || e.getModifierState("Symbol")));
        const isBareF = !e.metaKey && !e.ctrlKey && !e.altKey && isF;
        const isCmdOrCtrlF = (e.metaKey || e.ctrlKey) && isF;

        // 4. Fullscreen toggle shortcuts:
        // - Cmd+F / Ctrl+F (all windows / editors)
        // - Cmd+Ctrl+F / Ctrl+Cmd+F (macOS native shortcut ⌃⌘F)
        // - Cmd+Shift+F / Ctrl+Shift+F
        // - Fn+F / Globe+F (macOS fullscreen)
        // - F11 (standard function key)
        // - F / f (when not inside an input field)
        // - Alt+Enter (Windows/Linux standard)
        if (
            isCmdOrCtrlF ||
            (!isInput && isBareF) ||
            (isFn && isF) ||
            e.key === "F11" || code === "F11" ||
            (e.altKey && (e.key === "Enter" || code === "Enter"))
        ) {
            e.preventDefault();
            e.stopPropagation();
            doToggleFullscreen();
            return;
        }

        // Escape: exit fullscreen if currently in fullscreen
        if (e.key === "Escape" || code === "Escape") {
            try {
                if (document.fullscreenElement || document.webkitFullscreenElement) {
                    if (document.exitFullscreen) document.exitFullscreen().catch(function() {});
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                }
                if (typeof window.toggleNativeFullscreen === "function") {
                    try { window.toggleNativeFullscreen(); } catch(e) {}
                }
            } catch(e) {}
        }

        // 5. Minimize window: Cmd+M, Ctrl+M, Alt+M
        if ((e.metaKey || e.ctrlKey || e.altKey) && isM) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.minimizeWindow === "function") {
                try { window.minimizeWindow(); } catch(e) {}
            }
            return;
        }

        // 5b. Hide application window: Cmd+H, Ctrl+H
        if ((e.metaKey || e.ctrlKey) && isH) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.hideApp === "function") {
                try { window.hideApp(); } catch(e) {}
            } else if (typeof window.minimizeWindow === "function") {
                try { window.minimizeWindow(); } catch(e) {}
            }
            return;
        }

        // 6. Always-on-top toggle: Cmd+Shift+T, Ctrl+Shift+T, Alt+T
        if (
            ((e.metaKey || e.ctrlKey) && e.shiftKey && isT) ||
            (e.altKey && !e.ctrlKey && !e.metaKey && isT)
        ) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.toggleAlwaysOnTop === "function") {
                try { window.toggleAlwaysOnTop(); } catch(e) {}
            }
            return;
        }

        // 7. Center window: Cmd+Shift+C, Ctrl+Shift+C
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && isC) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.centerWindow === "function") {
                try { window.centerWindow(); } catch(e) {}
            }
            return;
        }

        // 8. Zoom shortcuts: Cmd/Ctrl + (+/- / 0)
        if (e.metaKey || e.ctrlKey) {
            if (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd") {
                e.preventDefault();
                applyZoom(0.1, false);
                return;
            } else if (e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract") {
                e.preventDefault();
                applyZoom(-0.1, false);
                return;
            } else if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
                e.preventDefault();
                applyZoom(0, true);
                return;
            }
        }
    }, { capture: true });

    // Automatically trigger initial fullscreen on application launch with verification
    function triggerInitialFullscreen() {
        var attempts = 0;
        function attempt() {
            if (typeof window.requestInitialFullscreen === "function") {
                try {
                    var p = window.requestInitialFullscreen();
                    if (p && typeof p.then === "function") {
                        p.then(function(res) {
                            if ((!res || !res.isFullscreen) && attempts++ < 25) {
                                setTimeout(attempt, 150);
                            }
                        }).catch(function() {
                            if (attempts++ < 25) setTimeout(attempt, 150);
                        });
                        return;
                    }
                } catch(e) {}
            }
            if (typeof window.toggleNativeFullscreen === "function") {
                try { window.toggleNativeFullscreen(); } catch(e) {}
            } else if (typeof window.toggleFullscreen === "function") {
                try { window.toggleFullscreen(); } catch(e) {}
            }
            if (attempts++ < 25) {
                setTimeout(attempt, 150);
            }
        }
        setTimeout(attempt, 80);
        window.addEventListener("DOMContentLoaded", function() { setTimeout(attempt, 120); });
        window.addEventListener("load", function() { setTimeout(attempt, 200); });
    }
    triggerInitialFullscreen();
})();
`;
}


export type WindowPositionPreset = 
    | "center" | "screen_center"
    | "upper_left" | "top_left"
    | "upper_right" | "top_right"
    | "bottom_left" | "lower_left"
    | "bottom_right" | "lower_right"
    | "top_center" | "upper_center"
    | "bottom_center" | "lower_center"
    | "center_left"
    | "center_right";

export function setWindowPositionNative(wv: Webview, pos: WindowPositionPreset | { x: number, y: number }, winWidth = 1400, winHeight = 900) {
    try {
        let screenW = 1920;
        let screenH = 1080;

        if (process.platform === "darwin") {
            const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
                CGMainDisplayID: { args: [], returns: FFIType.u32 },
                CGDisplayPixelsWide: { args: [FFIType.u32], returns: FFIType.u64 },
                CGDisplayPixelsHigh: { args: [FFIType.u32], returns: FFIType.u64 }
            });
            const mainId = cg.symbols.CGMainDisplayID();
            screenW = Number(cg.symbols.CGDisplayPixelsWide(mainId));
            screenH = Number(cg.symbols.CGDisplayPixelsHigh(mainId));
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                GetSystemMetrics: { args: [FFIType.i32], returns: FFIType.i32 }
            });
            // SM_CXSCREEN = 0, SM_CYSCREEN = 1
            screenW = user32.symbols.GetSystemMetrics(0);
            screenH = user32.symbols.GetSystemMetrics(1);
        } else if (process.platform === "linux") {
            const fallback = getLinuxDisplaySizeFallback();
            screenW = fallback.width;
            screenH = fallback.height;
        }

        let targetX = 40;
        let targetTopY = 40;

        if (typeof pos === "object" && pos !== null) {
            targetX = pos.x;
            targetTopY = pos.y;
        } else {
            const preset = String(pos || "center").toLowerCase();
            const margin = 30;
            if (preset === "upper_left" || preset === "top_left") {
                targetX = margin;
                targetTopY = margin + 30;
            } else if (preset === "upper_right" || preset === "top_right") {
                targetX = screenW - winWidth - margin;
                targetTopY = margin + 30;
            } else if (preset === "bottom_left" || preset === "lower_left") {
                targetX = margin;
                targetTopY = screenH - winHeight - margin;
            } else if (preset === "bottom_right" || preset === "lower_right") {
                targetX = screenW - winWidth - margin;
                targetTopY = screenH - winHeight - margin;
            } else if (preset === "top_center" || preset === "upper_center") {
                targetX = Math.round((screenW - winWidth) / 2);
                targetTopY = margin + 30;
            } else if (preset === "bottom_center" || preset === "lower_center") {
                targetX = Math.round((screenW - winWidth) / 2);
                targetTopY = screenH - winHeight - margin;
            } else if (preset === "center_left") {
                targetX = margin;
                targetTopY = Math.round((screenH - winHeight) / 2);
            } else if (preset === "center_right") {
                targetX = screenW - winWidth - margin;
                targetTopY = Math.round((screenH - winHeight) / 2);
            } else {
                // "center" default
                targetX = Math.round((screenW - winWidth) / 2);
                targetTopY = Math.round((screenH - winHeight) / 2);
            }
        }

        const handle = wv.unsafeWindowHandle;
        if (handle) {
            if (process.platform === "darwin") {
                const presetStr = typeof pos === "string" ? pos.toLowerCase() : "";
                if (presetStr === "center" || presetStr === "middle" || presetStr === "middle_center" || presetStr === "center_center" || !presetStr) {
                    const libobjc = dlopen("libobjc.dylib", {
                        objc_msgSend: {
                            args: [FFIType.pointer, FFIType.pointer],
                            returns: FFIType.void,
                        },
                        sel_registerName: {
                            args: [FFIType.cstring],
                            returns: FFIType.pointer,
                        }
                    });
                    const sel_center = libobjc.symbols.sel_registerName(Buffer.from("center\0"));
                    libobjc.symbols.objc_msgSend(handle, sel_center);
                } else {
                    const libobjc = dlopen("libobjc.dylib", {
                        objc_msgSend: {
                            args: [FFIType.pointer, FFIType.pointer, FFIType.f64, FFIType.f64],
                            returns: FFIType.void,
                        },
                        sel_registerName: {
                            args: [FFIType.cstring],
                            returns: FFIType.pointer,
                        }
                    });
                    const sel_setFrameTopLeft = libobjc.symbols.sel_registerName(Buffer.from("setFrameTopLeftPoint:\0"));
                    libobjc.symbols.objc_msgSend(handle, sel_setFrameTopLeft, Number(targetX), Number(screenH - targetTopY));
                }
            } else if (process.platform === "win32") {
                const user32 = dlopen("user32.dll", {
                    SetWindowPos: {
                        args: [FFIType.pointer, FFIType.pointer, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32],
                        returns: FFIType.bool,
                    }
                });
                // SWP_NOSIZE (1) | SWP_NOZORDER (4) = 5
                user32.symbols.SetWindowPos(handle, null, Number(targetX), Number(targetTopY), 0, 0, 5);
            } else if (process.platform === "linux") {
                // Direct GTK/GDK FFI is unsafe under Bun on Ubuntu/Wayland and can segfault.
                // Leave Linux windows in their current position instead of risking a crash.
                console.warn("Linux window positioning is unavailable in this Bun/Wayland environment; skipping native move.");
            }
        }
    } catch (e) {
        console.warn("Could not set window position:", e);
    }
}

// Main IDE entry point helper
export let html = "";
export function getIdeHtml(): string {
    const defaultSpec = JSON.stringify({
        title: "Form1",
        width: 800,
        height: 600,
        background_color: "#0f172a",
        font_color: "#e2e8f0",
        padding: 20,
        spacing: 12,
        controls: []
    });

    const candidates = [
        join(process.cwd(), "src", "ide.html"),
        join(import.meta.dir, "src", "ide.html"),
        join(import.meta.dir, "ide.html"),
        join(process.cwd(), "ide.html"),
    ];
    for (const p of candidates) {
        if (existsSync(p)) {
            try {
                const raw = readFileSync(p, "utf-8");
                return raw.replace("__SPEC_JSON__", defaultSpec);
            } catch {}
        }
    }
    return `<!DOCTYPE html><html><body style="background:#0f172a;color:#e2e8f0;font-family:system-ui;padding:20px;"><h1>Bun RAD Studio IDE</h1></body></html>`;
}

// Helper function for exporting project structure
export function exportProjectHelper(specJson: string, customExportDir?: string) {
    try {
        const spec = JSON.parse(specJson);
        const exportDir = customExportDir || join(process.cwd(), "exported_project");
        mkdirSync(exportDir, { recursive: true });
        
        const previewHtml = generatePreviewHtml(spec);
        writeFileSync(join(exportDir, "index.html"), previewHtml);

        let boundMethods: string[] = [];
        let customHandlers: { name: string, ctrlId: string, type: string, evt: string }[] = [];
        (spec.controls || []).forEach((c: any) => {
            if (!c.event_handlers) return;
            for (let evtName in c.event_handlers) {
                let handler = c.event_handlers[evtName];
                if (handler && typeof handler === "string" && handler.trim()) {
                    const clean = handler.trim();
                    const isFuncName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean);
                    if (isFuncName && !boundMethods.includes(clean)) {
                        boundMethods.push(clean);
                        customHandlers.push({ name: clean, ctrlId: c.id, type: c.control_type || "control", evt: evtName });
                    }
                }
            }
        });

        let handlersCode = "";
        if (customHandlers.length > 0) {
            handlersCode += '\n// ==========================================\n';
            handlersCode += '// 🔌 RAD COMPONENT EVENT HANDLERS (' + customHandlers.length + ' active binding(s))\n';
            handlersCode += '// ==========================================\n';
            customHandlers.forEach(h => {
                handlersCode += 'wv.bind("' + h.name + '", (data?: any) => {\n';
                handlersCode += '    console.log("⚡ RAD Event [' + h.evt + '] on #' + h.ctrlId + ' (' + h.type + '):", data || "");\n';
                if (h.evt === "onChange" || h.evt === "onInput") {
                    handlersCode += '    return { success: true, value: data };\n';
                } else {
                    handlersCode += '    return { success: true, timestamp: Date.now() };\n';
                }
                handlersCode += '});\n\n';
            });
        }

        const appTs = `
import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";

// Initialize Webview Window
const wv = new Webview();
wv.title = "${spec.title || 'Exported App'}";
wv.size = { width: ${spec.width || 800}, height: ${spec.height || 600}, hint: SizeHint.NONE };

// Load HTML UI Spec
const html = readFileSync(join(import.meta.dir, "index.html"), "utf-8");
wv.setHTML(html);

// ==========================================
// 🛠️ RAD BACKEND HELPER UTILITIES
// ==========================================

export function execJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("❌ JS Exec Error:", e); }
}

export function setControlText(controlId: string, text: string) {
    const escaped = JSON.stringify(text);
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.tagName==="SELECT"){el.value=\${escaped};if(el.tagName==="TEXTAREA")el.scrollTop=el.scrollHeight;}else{el.textContent=\${escaped};el.innerText=\${escaped};}}\`);
}

export function setControlValue(controlId: string, value: any) {
    const escaped = JSON.stringify(value);
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.tagName==="SELECT"){el.value=\${escaped};if(el.tagName==="TEXTAREA")el.scrollTop=el.scrollHeight;}else{el.textContent=\${escaped};el.innerText=\${escaped};if(el.dataset)el.dataset.value=\${escaped};}}\`);
}

export function setControlPlaceholder(controlId: string, placeholder: string) {
    const escaped = JSON.stringify(placeholder);
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("placeholder" in el)el.placeholder=\${escaped};else{const inp=el.querySelector("input, textarea");if(inp)inp.placeholder=\${escaped};}}\`);
}

export function setControlReadOnly(controlId: string, readOnly: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("readOnly" in el)el.readOnly=\${readOnly};else{const inp=el.querySelector("input, textarea");if(inp)inp.readOnly=\${readOnly};}}\`);
}

export function setControlRequired(controlId: string, required: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("required" in el)el.required=\${required};else{const inp=el.querySelector("input, textarea, select");if(inp)inp.required=\${required};}}\`);
}

export function setControlMaxLength(controlId: string, maxLength: number) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("maxLength" in el)el.maxLength=\${maxLength};else{const inp=el.querySelector("input, textarea");if(inp)inp.maxLength=\${maxLength};}}\`);
}

export function setControlEnabled(controlId: string, enabled: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){el.disabled=\${!enabled};el.style.opacity=\${enabled ? "1" : "0.55"};el.style.pointerEvents=\${enabled ? "auto" : "none"};}\`);
}

export function setControlVisible(controlId: string, visible: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){el.style.display=\${visible ? "" : "none"};}\`);
}

export function setSegmentedSelected(controlId: string, itemText: string) {
    const escaped = JSON.stringify(itemText);
    execJS(\`const container=document.getElementById("\${controlId}");if(container){container.querySelectorAll("button").forEach(b=>{const isSel=b.textContent.trim()===\${escaped};b.style.background=isSel?"var(--accent, #38bdf8)":"transparent";b.style.color=isSel?"#ffffff":"inherit";});}\`);
}

export function setStatChart(controlId: string, opts: { title?: string; value?: string; trend?: string }) {
    const title = opts.title !== undefined ? JSON.stringify(opts.title) : "null";
    const value = opts.value !== undefined ? JSON.stringify(opts.value) : "null";
    const trend = opts.trend !== undefined ? JSON.stringify(opts.trend) : "null";
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const tEl=c.querySelector("span");const vEl=c.querySelector("div:nth-child(2)");const trEl=c.querySelectorAll("span")[1];if(tEl&&\${title}!==null)tEl.textContent=\${title};if(vEl&&\${value}!==null)vEl.textContent=\${value};if(trEl&&\${trend}!==null)trEl.textContent=\${trend};}\`);
}

export function setToast(controlId: string, title: string, message?: string, alertType?: string) {
    const tStr = JSON.stringify(title);
    const mStr = message !== undefined ? JSON.stringify(message) : "null";
    const aStr = alertType !== undefined ? JSON.stringify(alertType) : "null";
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const tEl=c.querySelector("span:nth-child(1)");const mEl=c.querySelector("span:nth-child(2)");if(tEl&&\${tStr}!==null)tEl.textContent=\${tStr};if(mEl&&\${mStr}!==null)mEl.textContent=\${mStr};if(\${aStr}!==null){const col=\${aStr}==='error'?'#ef4444':\${aStr}==='warning'?'#f59e0b':'#10b981';c.style.borderLeftColor=col;}}\`);
}

export function setTimePickerValue(controlId: string, timeStr: string) {
    const escaped = JSON.stringify(timeStr);
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const inp=c.querySelector("input[type=time]");if(inp)inp.value=\${escaped};}\`);
}

export function setAccordionOpen(controlId: string, open: boolean) {
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const body=c.querySelector("div:nth-child(2)");const arrow=c.querySelector(".acc-arrow");if(body)body.style.display=\${open ? "'block'" : "'none'"};if(arrow)arrow.textContent=\${open ? "'▼'" : "'▶'"};}\`);
}

export function setTimelineSteps(controlId: string, stepsCSV: string) {
    const escaped = JSON.stringify(stepsCSV);
    execJS(\`const c=document.getElementById("\${controlId}");if(c&&\${escaped}){const steps=\${escaped}.split(",").map(s=>s.trim());c.innerHTML=steps.map((st,i)=>\`<div style="display:flex;align-items:center;gap:10px;font-size:11px;"><div style="width:10px;height:10px;border-radius:50%;background:\\\${i<=1?'var(--accent, #38bdf8)':'rgba(255,255,255,0.2)'};"></div><span>\\\${st}</span></div>\`).join("");}\`);
}

export function setBreadcrumbs(controlId: string, crumbsCSV: string) {
    const escaped = JSON.stringify(crumbsCSV);
    execJS(\`const c=document.getElementById("\${controlId}");if(c&&\${escaped}){const crumbs=\${escaped}.split(",").map(s=>s.trim());c.innerHTML=crumbs.map((cr,i)=>\`\\\${i>0?'<span style="opacity:0.4;">›</span>':''}<span style="\\\${i===crumbs.length-1?'font-weight:700;color:var(--accent,#38bdf8);':'opacity:0.7;'}">\\\${cr}</span>\`).join("");}\`);
}

export function setTreeNodes(controlId: string, nodesCSV: string) {
    const escaped = JSON.stringify(nodesCSV);
    execJS(\`const c=document.getElementById("\${controlId}");if(c&&\${escaped}){const nodes=\${escaped}.split(",").map(s=>s.trim());c.innerHTML=nodes.map((n,i)=>\`<div style="padding-left:\\\${i===0?0:16}px;display:flex;align-items:center;gap:6px;"><span style="opacity:0.6;">\\\${i===0?'▼ 📁':'├─'}</span><span>\\\${n}</span></div>\`).join("");}\`);
}

export function setAvatarGroup(controlId: string, avatarsCSV: string) {
    const escaped = JSON.stringify(avatarsCSV);
    execJS(\`const c=document.getElementById("\${controlId}");if(c&&\${escaped}){const avs=\${escaped}.split(",").map(s=>s.trim());const avCols=['#0284c7','#7c3aed','#059669','#d97706','#dc2626'];c.innerHTML=avs.map((av,i)=>\`<div style="width:32px;height:32px;border-radius:50%;background:\\\${av.startsWith('+')?'rgba(255,255,255,0.2)':avCols[i%avCols.length]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid transparent;margin-left:\\\${i===0?0:-8}px;">\\\${av}</div>\`).join("");}\`);
}

export function setRichSelectText(controlId: string, text: string) {
    const escaped = JSON.stringify(text);
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const span=c.querySelector("span:nth-child(2)");if(span)span.textContent=\${escaped};}\`);
}

export function setTabsActive(controlId: string, tabName: string) {
    const escaped = JSON.stringify(tabName);
    execJS(\`const container=document.getElementById("\${controlId}");if(container){container.dataset.value=\${escaped};container.querySelectorAll("button").forEach(b=>{const isSel=b.textContent.trim()===\${escaped};b.style.borderBottom=isSel?"2px solid var(--accent, #38bdf8)":"none";b.style.color=isSel?"var(--accent, #38bdf8)":"inherit";b.style.fontWeight=isSel?"700":"normal";});}\`);
}

export function setStatusBarText(controlId: string, statusText: string) {
    const escaped = JSON.stringify(statusText);
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const span=c.querySelector("div:nth-child(1) span:nth-child(3)");if(span)span.textContent=\${escaped};}\`);
}

export function setPaginationPage(controlId: string, pageNum: number | string) {
    const pageStr = String(pageNum);
    const escaped = JSON.stringify(pageStr);
    execJS(\`const c=document.getElementById("\${controlId}");if(c){c.querySelectorAll("button").forEach(b=>{if(!isNaN(parseInt(b.textContent.trim()))){const isSel=b.textContent.trim()===\${escaped};b.style.background=isSel?"var(--accent, #38bdf8)":"rgba(255,255,255,0.06)";b.style.color=isSel?"#ffffff":"inherit";b.style.fontWeight=isSel?"700":"normal";}});}\`);
}

export function setToggleButtonState(controlId: string, active: boolean, labelText?: string) {
    const label = labelText !== undefined ? JSON.stringify(labelText) : "null";
    execJS(\`const btn=document.getElementById("\${controlId}");if(btn){btn.dataset.checked="\${active}";btn.style.background=\${active}?"var(--accent, #38bdf8)":"rgba(255,255,255,0.08)";btn.style.color=\${active}?"#ffffff":"inherit";if(\${label}!==null)btn.textContent=\${label};}\`);
}

export function setPropertyGridData(controlId: string, properties: string | Record<string, string>) {
    const raw = typeof properties === 'string' ? properties : Object.entries(properties).map(([k, v]) => \`\${k}: \${v}\`).join(', ');
    const escaped = JSON.stringify(raw);
    execJS(\`if(window.setPropertyGridData)window.setPropertyGridData(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setPopupMenuItems(controlId: string, itemsCSV: string) {
    const escaped = JSON.stringify(itemsCSV);
    execJS(\`if(window.setPopupMenuItems)window.setPopupMenuItems(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setCalendarDate(controlId: string, yearMonthStr: string) {
    const escaped = JSON.stringify(yearMonthStr);
    execJS(\`if(window.setCalendarDate)window.setCalendarDate(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setColorSwatchColor(controlId: string, hexColor: string) {
    const escaped = JSON.stringify(hexColor);
    execJS(\`if(window.setColorSwatchColor)window.setColorSwatchColor(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setFilePathBarPath(controlId: string, pathStr: string) {
    const escaped = JSON.stringify(pathStr);
    execJS(\`if(window.setFilePathBarPath)window.setFilePathBarPath(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setKanbanColumns(controlId: string, columnsData: string) {
    const escaped = JSON.stringify(columnsData);
    execJS(\`if(window.setKanbanColumns)window.setKanbanColumns(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setShortcutRecorderValue(controlId: string, shortcutStr: string) {
    const escaped = JSON.stringify(shortcutStr);
    execJS(\`if(window.setShortcutRecorderValue)window.setShortcutRecorderValue(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setSplitButtonAction(controlId: string, text: string) {
    const escaped = JSON.stringify(text);
    execJS(\`if(window.setSplitButtonAction)window.setSplitButtonAction(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setSparklineTableData(controlId: string, rowsCSV: string) {
    const escaped = JSON.stringify(rowsCSV);
    execJS(\`if(window.setSparklineTableData)window.setSparklineTableData(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setMetricComparison(controlId: string, title: string, curVal: string, targetStr: string, changeStr: string) {
    const opts = JSON.stringify({ title, curVal, targetStr, changeStr });
    execJS(\`if(window.setMetricComparison)window.setMetricComparison(\${JSON.stringify(controlId)}, \${opts});\`);
}

export function setActivityFeedItems(controlId: string, itemsCSV: string) {
    const escaped = JSON.stringify(itemsCSV);
    execJS(\`if(window.setActivityFeedItems)window.setActivityFeedItems(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setWorkspaceTabs(controlId: string, filesCSV: string) {
    const escaped = JSON.stringify(filesCSV);
    execJS(\`if(window.setWorkspaceTabs)window.setWorkspaceTabs(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setWindowPosition(pos: "center" | "upper_left" | "upper_right" | "bottom_left" | "bottom_right" | "top_center" | "bottom_center" | "center_left" | "center_right" | { x: number, y: number }) {
    execJS(\`if(window.setWindowPosition)window.setWindowPosition(\${JSON.stringify(pos)});\`);
}

// ==========================================
// 🪟 WINDOW EVENT LIFECYCLE HOOKS
// ==========================================

wv.bind("onFormLoad", () => {
    console.log("⚡ Window Lifecycle [onFormLoad]: Application initialized successfully.");
});

wv.bind("onFormResize", (size?: { width: number, height: number }) => {
    console.log("⚡ Window Lifecycle [onFormResize]: New window dimensions:", size || "");
});

wv.bind("onFormClose", () => {
    console.log("⚡ Window Lifecycle [onFormClose]: Application closing...");
});

wv.bind("backendAlert", (msg: string) => {
    console.log("⚡ Backend Alert:", msg);
});

// ==========================================
// ⌨️ WINDOW FUNCTIONALITY & SHORTCUT BINDINGS
// ==========================================

wv.bind("quitApp", () => {
    try { wv.destroy(); } catch (e) {}
    process.exit(0);
});

wv.bind("closeWindow", () => {
    try { wv.destroy(); } catch (e) {}
    process.exit(0);
});

wv.bind("minimizeWindow", () => {
    console.log("⚡ Window Lifecycle: Window minimized");
});

wv.bind("toggleFullscreen", () => {
    console.log("⚡ Window Lifecycle: Fullscreen toggled");
});

wv.bind("toggleAlwaysOnTop", () => {
    console.log("⚡ Window Lifecycle: Always on top toggled");
});

wv.bind("centerWindow", () => {
    console.log("⚡ Window Lifecycle: Center window");
});
${handlersCode}
console.log("🚀 Starting Bun RAD Studio App: ${spec.title || 'Exported App'}...");
wv.run();
        `;
        writeFileSync(join(exportDir, "index.ts"), appTs.trim());

        const pkgJson = {
            name: "exported-rad-project",
            version: "1.0.0",
            scripts: {
                start: "bun run index.ts"
            },
            dependencies: {
                "webview-bun": "^2.4.0"
            }
        };
        writeFileSync(join(exportDir, "package.json"), JSON.stringify(pkgJson, null, 2));

        return { success: true, dir: exportDir };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// Only launch main Webview IDE window when run as primary entrypoint (not imported during bun test)
if (import.meta.main) {
    const webview = new Webview();
    attachWindowShortcuts(webview);
    html = getIdeHtml();
    webview.setHTML(html);
    webview.title = "Bun RAD Studio (Delphi/VB Style)";
    webview.size = { width: 1400, height: 900, hint: SizeHint.NONE };

    if (process.platform === "darwin" && webview.unsafeWindowHandle) {
        try {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: { args: [FFIType.pointer, FFIType.pointer, FFIType.u64], returns: FFIType.u64 },
                sel_registerName: { args: [FFIType.cstring], returns: FFIType.pointer }
            });
            const sel_cb = libobjc.symbols.sel_registerName(Buffer.from("collectionBehavior\0"));
            const sel_scb = libobjc.symbols.sel_registerName(Buffer.from("setCollectionBehavior:\0"));
            const cb = BigInt(libobjc.symbols.objc_msgSend(webview.unsafeWindowHandle, sel_cb, 0n));
            libobjc.symbols.objc_msgSend(webview.unsafeWindowHandle, sel_scb, cb | 128n);
        } catch (e) {}
    }

    webview.bind("runPreview", (specJson: string) => {
        try {
            const spec = JSON.parse(specJson);
            const tempDir = join(process.cwd(), ".rad_preview");
            mkdirSync(tempDir, { recursive: true });

            const previewHtml = generatePreviewHtml(spec);
            writeFileSync(join(tempDir, "preview.html"), previewHtml);

            const safeTitle = (spec.title || "Preview").replace(/"/g, '\\"');
            const previewTs = `
import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";
import { attachWindowShortcuts } from "${join(process.cwd(), "index.ts")}";

const html = readFileSync(join(import.meta.dir, "preview.html"), "utf-8");
const wv = new Webview();
attachWindowShortcuts(wv);
wv.setHTML(html);
wv.title = "${safeTitle} - Live Preview";
wv.size = { width: ${spec.width || 800}, height: ${spec.height || 600}, hint: SizeHint.NONE };

wv.bind("backendAlert", (msg: string) => {
    console.log("Backend alert:", msg);
});

wv.run();
            `;
            const previewTsPath = join(tempDir, "preview.ts");
            writeFileSync(previewTsPath, previewTs);

            const bunBin = process.execPath || "bun";
            const proc = spawn(bunBin, ["run", previewTsPath], {
                cwd: process.cwd(),
                stdio: "ignore",
                detached: true
            });
            proc.unref();

            return { success: true };
        } catch (err: any) {
            console.error("Preview failed:", err);
            return { success: false, error: err.message };
        }
    });

    webview.bind("exportProject", (specJson: string) => {
        return exportProjectHelper(specJson);
    });

    webview.run();
}


export {
    simplegui, SimpleWindow, SimpleControlRef, createWindow, newWindow, newSimpleWindow, new_simple_window,
    listThemes, getThemeKeys, get_theme_keys, getTheme, saveTheme, save_theme, getSavedTheme, get_saved_theme,
    homeDir, tempDir, desktopDir, documentsDir, downloadsDir,
    resolveUserPath, resolve_user_path,
    getAppConfigDir, get_app_config_dir,
    getAppDataDir, get_app_data_dir,
    getAppCacheDir, get_app_cache_dir,
    getAppStateDir, get_app_state_dir,
    getAppLogDir, get_app_log_dir,
    getAppRuntimeDir, get_app_runtime_dir,
    getAppConfigFile, get_app_config_file,
    getAppStateFile, get_app_state_file,
    writeFileAtomic, write_file_atomic,
    saveStateToFile, save_state_to_file,
    loadStateFromFile, load_state_from_file,
    shouldPersistControl, should_persist_control,
    isBrightColor, is_bright_color,
    isBrightAccentColor, is_bright_accent_color,
    autoShortThemeName, auto_short_theme_name,
    getShortThemeName, get_short_theme_name,
    listShortThemes, list_short_themes
} from "./src/simplegui.ts";

export * from "./src/simplecli/index.ts";

export function setStatusBarText(controlId: string, statusText: string) {}
export function setKanbanColumns(controlId: string, columnsData: string) {}
export function setShortcutRecorderValue(controlId: string, shortcutStr: string) {}
export function setSplitButtonAction(controlId: string, text: string) {}
export function setSparklineTableData(controlId: string, rowsCSV: string) {}
export function setMetricComparison(controlId: string, title: string, curVal: string, targetStr: string, changeStr: string) {}
export function setActivityFeedItems(controlId: string, itemsCSV: string) {}
export function setWorkspaceTabs(controlId: string, filesCSV: string) {}

export function isColorBright(hex?: string): boolean {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return false;
    const clean = hex.slice(1);
    let r = 0, g = 0, b = 0;
    if (clean.length === 3) {
        r = parseInt(clean[0] + clean[0], 16);
        g = parseInt(clean[1] + clean[1], 16);
        b = parseInt(clean[2] + clean[2], 16);
    } else if (clean.length >= 6) {
        r = parseInt(clean.slice(0, 2), 16);
        g = parseInt(clean.slice(2, 4), 16);
        b = parseInt(clean.slice(4, 6), 16);
    } else {
        return false;
    }
    return (r * 0.299 + g * 0.587 + b * 0.114) > 180;
}

export function generatePreviewHtml(spec: any): string {
    const bg = spec.background_color || '#0f172a';
    const fg = spec.font_color || '#e2e8f0';

    const isLight = bg === '#f8fafc' || bg === '#ffffff' || (bg.startsWith('#') && bg.length >= 7 && (parseInt(bg.slice(1,3), 16)*0.299 + parseInt(bg.slice(3,5), 16)*0.587 + parseInt(bg.slice(5,7), 16)*0.114) > 160);

    let accent = spec.accent_color || '#38bdf8';
    if (spec.accent_color) {
        accent = spec.accent_color;
    } else if (bg === '#050505') {
        accent = '#0fb36a';
    } else if (bg === '#000000' || fg === '#00ff00') {
        accent = '#00ff00';
    } else if (bg === '#0d0221' || fg === '#00f6ff') {
        accent = '#00f6ff';
    } else if (isLight) {
        accent = '#0284c7';
    } else if (bg === '#090d16') {
        accent = '#3b82f6';
    }

    const defaultBtnBg = spec.accent_color || accent || '#0284c7';
    const isBrightDefault = (defaultBtnBg === '#0fb36a' || defaultBtnBg === '#30d158' || defaultBtnBg === '#00ff00' || defaultBtnBg === '#4ade80') || isColorBright(defaultBtnBg);
    const defaultBtnFg = isBrightDefault ? '#000000' : '#ffffff';

    const border = bg === '#050505' ? '#2a2a2a' : (isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.12)');
    const w = spec.width || 800;
    const h = spec.height || 600;

    const buildEvents = (c: any) => {
        let ev = '';
        const handlers: Record<string, string> = { ...(c.event_handlers || {}) };
        if (c.id) {
            const ctrlType = (c.control_type || c.type || '').toLowerCase();
            const isInputType = [
                'input', 'search', 'form_search', 'textarea', 'form_textarea',
                'select', 'dropdown', 'form_dropdown', 'listbox', 'checkbox', 'form_checkbox',
                'radio', 'form_radio', 'slider', 'form_slider', 'number', 'form_number',
                'date', 'date_picker', 'form_date', 'time_picker', 'form_time',
                'color', 'color_picker', 'color_well', 'form_color', 'form_code',
                'stepper', 'number_stepper', 'form_stepper', 'form_drop_zone',
                'tabs', 'pagination', 'toggle_button',
                'search_field', 'masked_input', 'token_field', 'tag_input',
                'inline_editable_label', 'pull_down', 'combo_box', 'mode_control',
                'theme_menu', 'pill_toggle', 'knob', 'vertical_slider', 'range_slider',
                'date_range_picker', 'date_time_picker', 'color_grid', 'file_picker_field',
                'feedback_mood', 'transfer_list', 'color_swatch', 'file_path_bar', 'drop_zone'
            ].includes(ctrlType);
            if (isInputType) {
                if (!handlers.onChange && !handlers.onchange && !handlers.onClick && !handlers.onclick) {
                    handlers.onChange = `on_${c.id}_change`;
                }
            } else {
                if (!handlers.onClick && !handlers.onclick) {
                    handlers.onClick = `on_${c.id}_click`;
                }
            }
        }
        for (const [evtName, handler] of Object.entries(handlers)) {
            if (!handler || typeof handler !== 'string' || !handler.trim()) continue;
            const clean = (handler as string).trim();
            let attrName = evtName.toLowerCase();
            if (attrName === 'onhover' || attrName === 'onmouseenter') attrName = 'onmouseover';
            if (attrName === 'onhoverexit' || attrName === 'onmouseleave') attrName = 'onmouseout';
            if (attrName === 'ondoubleclick') attrName = 'ondblclick';

            const isFuncName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean);
            let codeToExec = '';
            if (isFuncName) {
                const valExpr = "this.tagName==='SELECT'&&this.multiple?Array.from(this.selectedOptions).map(o=>o.value):(this.type==='checkbox'?this.checked:(this.dataset&&this.dataset.page?parseInt(this.dataset.page):(this.value!==undefined?this.value:'')))";
                codeToExec = `if(event&&!event.isTrusted)return;if(this.disabled)return;if(window['${clean}']){window['${clean}'](${valExpr})}else if(window['${clean}']===undefined&&window.backendAlert){window.backendAlert('Event: ${clean}')}`;
            } else {
                codeToExec = clean;
            }

            const safeCode = codeToExec.replace(/"/g, '&quot;');
            ev += ` ${attrName}="try{${safeCode}}catch(e){console.error(e)}"`;
        }
        return ev;
    };

    const getShadowCss = (s?: string, bCol?: string) => {
        if (s === 'subtle') return 'box-shadow:0 2px 4px rgba(0,0,0,0.15);';
        if (s === 'medium') return 'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        if (s === 'deep') return 'box-shadow:0 10px 25px rgba(0,0,0,0.5);';
        if (s === 'glow') return `box-shadow:0 0 15px ${bCol || '#38bdf8'};`;
        return '';
    };

    const base = (c: any, extra = '') => {
        let bw = c.border_width !== undefined && c.border_width !== null && c.border_width !== '' ? `border-width:${c.border_width}px;` : '';
        let bc = c.border_color ? `border-color:${c.border_color};` : '';
        let bs = c.border_style ? `border-style:${c.border_style};` : '';
        let br = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : '';
        let sh = getShadowCss(c.box_shadow, c.border_color || c.font_color);
        let ta = c.text_align ? `text-align:${c.text_align};` : '';
        let op = c.opacity !== undefined && c.opacity !== null && c.opacity !== '' ? `opacity:${c.opacity / 100};` : (c.enabled === false ? 'opacity:0.55;' : '');
        let pe = c.enabled === false ? 'pointer-events:none;' : '';
        let cur = c.cursor ? `cursor:${c.cursor};` : '';
        const posX = c.left !== undefined ? c.left : (c.x !== undefined ? c.x : 0);
        const posY = c.top !== undefined ? c.top : (c.y !== undefined ? c.y : 0);

        const ctrlType = (c.control_type || c.type || '').toLowerCase();
        const isFullWidthContainer = (ctrlType === 'groupbox' || ctrlType === 'card' || ctrlType === 'accordion') && posX <= 40 && c.width >= (w - (posX * 2) - 60);
        const isFullWidthControl = !isFullWidthContainer && posX <= 60 && c.width >= (w - 120) && [
            'textarea', 'html_view', 'browser_view', 'code_view', 'code_editor',
            'data_table', 'db_grid', 'table', 'activity_feed', 'stat_chart',
            'tabs', 'workspace_tabs', 'status_bar', 'property_grid', 'kanban_board',
            'sparkline_table', 'drop_zone'
        ].includes(ctrlType);

        let widthCss = `${c.width}px`;
        if (isFullWidthContainer) {
            widthCss = `calc(100% - ${posX * 2}px)`;
        } else if (isFullWidthControl) {
            widthCss = `calc(100% - ${posX + 20}px)`;
        }

        let posStyle = `position:absolute;left:${posX}px;top:${posY}px;width:${widthCss};max-width:${isFullWidthContainer ? `calc(100% - ${posX * 2}px)` : '100%'};height:${c.height}px;`;
        if (c.dock === 'bottom' || c.control_type === 'status_bar' || (c.type === 'status_bar')) {
            posStyle = `position:fixed;bottom:0;left:0;right:0;width:100%;height:${c.height || 28}px;z-index:9999;`;
        } else if (c.dock === 'top') {
            posStyle = `position:fixed;top:0;left:0;right:0;width:100%;height:${c.height || 40}px;z-index:9999;`;
        } else if (c.dock === 'fill') {
            posStyle = `position:absolute;top:0;bottom:0;left:0;right:0;width:100%;height:100%;`;
        }

        return `${posStyle}` +
            `font-size:${c.font_size || 13}px;` +
            `box-sizing:border-box;transition:background 0.15s,color 0.15s,filter 0.15s,transform 0.1s;${bw}${bc}${bs}${br}${sh}${ta}${op}${pe}${cur}${extra}`;
    };

    let controls = '';
    let hoverStyles = '';
    for (const c of (spec.controls || [])) {
        if (c.visible === false) continue;
        const t = c.control_type || c.type;
        const text = (c.text !== undefined && c.text !== '') ? c.text : (c.value !== undefined && c.value !== '' ? c.value : (c.caption !== undefined && c.caption !== '' ? c.caption : (c.title !== undefined && c.title !== '' ? c.title : (c.text ?? c.value ?? c.caption ?? c.title ?? ''))));
        const color = c.font_color || fg;
        const rawCbg = c.background_color || 'transparent';
        const cbg = c.background_color && c.background_color !== 'transparent'
            ? c.background_color
            : (bg === '#050505' ? '#121212' : (isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)'));
        const ev = buildEvents(c);
        const ctxAttr = c.context_menu_items && Array.isArray(c.context_menu_items) && c.context_menu_items.length > 0
            ? ` data-context-menu="${c.context_menu_items.join('|').replace(/"/g, '&quot;')}" data-ctrl-id="${c.id}"`
            : '';
        const id = ` id="${c.id}"${ctxAttr}`;
        const disabled = c.enabled === false ? ' disabled' : '';
        const titleAttr = c.tooltip ? ` title="${c.tooltip.replace(/"/g, '&quot;')}"` : '';
        const roAttr = c.read_only ? ' readonly' : '';
        const reqAttr = c.required ? ' required' : '';
        const maxLenAttr = c.max_length !== undefined && c.max_length !== null && c.max_length !== '' ? ` maxlength="${c.max_length}"` : '';
        const autoFocusAttr = c.auto_focus ? ' autofocus' : '';
        const minVal = c.min_value !== undefined ? c.min_value : c.min;
        const minAttr = minVal !== undefined && minVal !== null && minVal !== '' ? ` min="${minVal}"` : '';
        const maxVal = c.max_value !== undefined ? c.max_value : c.max;
        const maxAttr = maxVal !== undefined && maxVal !== null && maxVal !== '' ? ` max="${maxVal}"` : '';
        const stepAttr = c.step !== undefined && c.step !== null && c.step !== '' ? ` step="${c.step}"` : '';

        if (c.hover_color || c.hover_text_color) {
            let rules = '';
            if (c.hover_color) rules += `background-color:${c.hover_color} !important;background:${c.hover_color} !important;`;
            if (c.hover_text_color) rules += `color:${c.hover_text_color} !important;`;
            hoverStyles += `#${c.id}:hover { ${rules} }\n#${c.id}:hover input, #${c.id}:hover textarea, #${c.id}:hover select, #${c.id}:hover button { ${rules} }\n`;
        }

        const hasCustomBorder = c.border_width !== undefined || c.border_color || c.border_style;
        const defBorder = hasCustomBorder ? `border-width:${c.border_width || 1}px;border-color:${c.border_color || border};border-style:${c.border_style || 'solid'};` : `border:1px solid ${border};`;
        const defRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:5px;';

        if (t === 'button') {
            const hasCustomBg = c.custom_background === true || (c.background_color && c.background_color !== 'transparent' && c.background_color !== defaultBtnBg && c.background_color !== spec.accent_color && !c._isThemeAccent);
            const hasCustomFg = c.custom_color === true;
            const btnBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : defaultBtnBg;
            const isBright = (btnBg === '#0fb36a' || btnBg === '#30d158' || btnBg === '#00ff00' || btnBg === '#4ade80') || isColorBright(btnBg);
            const btnColor = hasCustomFg && c.font_color ? c.font_color : (isBright ? '#000000' : (color || '#ffffff'));
            const bBorder = hasCustomBorder ? `border-width:${c.border_width || 1}px;border-color:${c.border_color || border};border-style:${c.border_style || 'solid'};` : 'border:none;';
            const bRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const mouseOverFilter = c.hover_color || c.hover_text_color ? '' : ` onmouseover="this.style.filter='brightness(1.15)'" onmouseout="this.style.filter=''"`;
            const customAttr = hasCustomBg ? ' data-custom-bg="true"' : ' class="rad-button btn-theme-accent"';
            controls += `<button${id}${customAttr}${titleAttr}${ev}${disabled} style="${base(c)}background:${btnBg};color:${btnColor};${bBorder}${bRadius}cursor:${c.cursor||'pointer'};font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);"${mouseOverFilter} onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''">${text}</button>\n`;
        } else if (t === 'label') {
            const isStatus = (c.id && (c.id.toLowerCase().includes('status') || c.id.toLowerCase().includes('telemetry'))) ||
                             (text && (text.toLowerCase().startsWith('status:') || text.toLowerCase().startsWith('status :') || text.toLowerCase().startsWith('matches found:') || text.toLowerCase().startsWith('ready  |') || text.toLowerCase().startsWith('codefreelance engine:')));
            const statusStyle = isStatus ? 'width:calc(100% - 40px) !important;max-width:calc(100% - 40px) !important;font-size:12px;opacity:0.9;' : '';
            const customColorAttr = c.custom_color ? ' data-custom-color="true"' : ' data-theme-label="true"';
            const captionAttr = c.is_caption || c.is_card_subtitle ? ' data-caption="true"' : '';
            controls += `<div${id}${titleAttr}${ev}${customColorAttr}${captionAttr} class="rad-label" style="${base(c)}color:${color};display:flex;align-items:center;background:${rawCbg};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${statusStyle}">${text}</div>\n`;
        } else if (t === 'input' || t === 'search') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} type="${t === 'search' ? 'search' : 'text'}" value="${text}" placeholder="${c.placeholder || ''}" oninput="const fnC=window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" onkeydown="if(event.key==='Enter'){const fnE=window['${c.id}_onEnter']||window['on_${c.id}_enter']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnE)fnE(this.value);}" style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;">\n`;
        } else if (t === 'password') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} type="password" value="${text}" placeholder="${c.placeholder || ''}" oninput="const fnC=window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;">\n`;
        } else if (t === 'textarea') {
            controls += `<textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} placeholder="${c.placeholder || ''}" oninput="const fnC=window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:8px;resize:none;outline:none;">${text}</textarea>\n`;
        } else if (t === 'checkbox') {
            const chk = c.checked ? 'checked' : '';
            controls += `<label${id}${titleAttr} class="rad-checkbox-label" data-theme-label="true" style="${base(c)}display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};color:${color};"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="checkbox" ${chk}${disabled}${reqAttr}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${text}</label>\n`;
        } else if (t === 'radio') {
            const chk = c.checked ? 'checked' : '';
            controls += `<label${id}${titleAttr} class="rad-radio-label" data-theme-label="true" style="${base(c)}display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};color:${color};"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="radio" ${chk}${disabled}${reqAttr}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${text}</label>\n`;
        } else if (t === 'switch' || t === 'form_switch') {
            const on = c.checked;
            const trackCol = on ? accent : (isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)');
            const thumbX = on ? '22px' : '2px';
            controls += `<div${id}${titleAttr} class="rad-switch-label" data-theme-label="true" style="${base(c)}display:flex;align-items:center;gap:10px;color:${color};cursor:${c.cursor||'pointer'};" onclick="this.querySelector('.sw-track').style.background=this.querySelector('.sw-thumb').style.left==='2px'?'${accent}':'${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}';this.querySelector('.sw-thumb').style.left=this.querySelector('.sw-thumb').style.left==='2px'?'22px':'2px';">${t === 'form_switch' ? `<span>${text}</span>` : ''}<div class="sw-track" style="width:44px;height:24px;background:${trackCol};border-radius:12px;position:relative;flex-shrink:0;transition:background 0.2s;"><div class="sw-thumb" style="position:absolute;left:${thumbX};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.2s;"></div></div>${t !== 'form_switch' ? `<span>${text}</span>` : ''}</div>\n`;
        } else if (t === 'slider' || t === 'form_slider') {
            const val = c.value !== undefined ? c.value : 50;
            const hasExplicitText = (c.text !== undefined && c.text !== '' && c.text !== String(val)) || (c.caption !== undefined && c.caption !== '' && c.caption !== String(val)) || (c.title !== undefined && c.title !== '');
            const sliderTitle = hasExplicitText ? (c.caption || c.title || c.text) : '';
            const headerLabel = sliderTitle ? `<span class="rad-slider-title" data-theme-label="true" style="opacity:0.9;">${sliderTitle}</span>` : '';
            controls += `<div${id}${titleAttr} class="rad-slider-wrapper" data-theme-label="true" style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><div style="display:flex;justify-content:${headerLabel ? 'space-between' : 'flex-end'};align-items:center;font-size:11px;font-weight:700;">${headerLabel}<span class="slider-val" style="color:${accent};font-family:monospace;font-size:12px;font-weight:bold;">${val}</span></div><input type="range"${minAttr || ' min="0"'}${maxAttr || ' max="100"'}${stepAttr} value="${val}"${ev} oninput="if(this.previousElementSibling&&this.previousElementSibling.querySelector('.slider-val'))this.previousElementSibling.querySelector('.slider-val').textContent=this.value;" style="width:100%;height:6px;accent-color:${accent};cursor:${c.cursor||'pointer'};"></div>\n`;
        } else if (t === 'number' || t === 'form_number') {
            const val = c.value !== undefined ? c.value : 0;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span>` : ''}<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="number" value="${val}" placeholder="${c.placeholder || ''}"${ev}${roAttr}${reqAttr}${minAttr}${maxAttr}${stepAttr}${autoFocusAttr} style="background:${cbg};color:${color};${defBorder}${defRadius}padding:4px 8px;outline:none;font-size:${c.font_size||13}px;"></div>\n`;
        } else if (t === 'date' || t === 'date_picker' || t === 'form_date') {
            const val = c.value || '2026-07-27';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span>` : ''}<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="date" value="${val}"${ev} style="width:100%;height:100%;background:${cbg};color:${color};${defBorder}${defRadius}padding:4px 8px;outline:none;font-size:${c.font_size||13}px;color-scheme:${isLight ? 'light' : 'dark'};cursor:pointer;"></div>\n`;
        } else if (t === 'color' || t === 'color_picker' || t === 'color_well' || t === 'form_color') {
            const val = c.value || '#0284c7';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;background:${cbg};${defBorder}${defRadius}padding:2px 8px;cursor:pointer;"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="color" value="${val}"${ev} style="width:28px;height:24px;border:none;border-radius:4px;cursor:pointer;background:transparent;" oninput="if(this.nextElementSibling)this.nextElementSibling.textContent=this.value.toUpperCase();"><span class="color-hex" style="font-size:11px;font-weight:700;color:${color};font-family:monospace;">${val.toUpperCase()}</span></div>\n`;
        } else if (t === 'progress' || t === 'progress_bar' || t === 'form_progress') {
            const val = c.value !== undefined ? c.value : 60;
            const progBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
            controls += `<div${id}${titleAttr} class="rad-progress" style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;"><span>${text}</span><span>${val}%</span></div>` : ''}<div style="width:100%;height:8px;background:${progBg};border-radius:4px;overflow:hidden;"><div style="width:${val}%;height:100%;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : accent};border-radius:4px;transition:width 0.3s;"></div></div></div>\n`;
        } else if (t === 'circular_progress') {
            const val = c.value !== undefined ? c.value : 75;
            const r = 36; const circ = 2 * Math.PI * r;
            const dash = circ * val / 100;
            const circBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 100 100" width="${Math.min(c.width,c.height)}" height="${Math.min(c.width,c.height)}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="${circBg}" stroke-width="10"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${accent}" stroke-width="10" stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}" stroke-dashoffset="${circ*0.25}" stroke-linecap="round" transform="rotate(-90 50 50)"/><text x="50" y="54" text-anchor="middle" font-size="18" fill="${color}" font-weight="bold">${val}%</text></svg></div>\n`;
        } else if (t === 'rating') {
            const val = c.value !== undefined ? c.value : 3;
            const starBg = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
            controls += `<div${id}${titleAttr} data-value="${val}" style="${base(c)}display:flex;align-items:center;gap:4px;font-size:${Math.max(c.height-8,16)}px;">${[1,2,3,4,5].map(i=>`<span style="cursor:pointer;color:${i<=val?'#f59e0b':starBg};transition:color 0.1s;" onclick="const parent=this.parentNode;parent.dataset.value='${i}';parent.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<${i}?'#f59e0b':'${starBg}'});if(window['${c.id}_onChange'])window['${c.id}_onChange'](${i});else if(window['on_${c.id}_change'])window['on_${c.id}_change'](${i});" onmouseover="this.parentNode.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<${i}?'#f59e0b':'${starBg}'})" onmouseout="const cur=parseInt(this.parentNode.dataset.value||'${val}');this.parentNode.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<cur?'#f59e0b':'${starBg}'})">★</span>`).join('')}</div>\n`;
        } else if (t === 'stepper' || t === 'number_stepper') {
            const val = c.value !== undefined ? c.value : 5;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg};${defBorder}${defRadius}padding:0 6px;color:${color};"><button onclick="const s=this.nextElementSibling;const n=parseInt(s.textContent||'0')-1;s.textContent=n;if(window['${c.id}_onChange'])window['${c.id}_onChange'](n);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](n);" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color='${accent}';" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${accent};font-size:16px;font-weight:bold;cursor:pointer;line-height:1;user-select:none;transition:all 0.15s;">−</button><span class="stepper-val" style="font-weight:bold;font-size:12px;color:${color};">${val}</span><button onclick="const s=this.previousElementSibling;const n=parseInt(s.textContent||'0')+1;s.textContent=n;if(window['${c.id}_onChange'])window['${c.id}_onChange'](n);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](n);" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color='${accent}';" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${accent};font-size:16px;font-weight:bold;cursor:pointer;line-height:1;user-select:none;transition:all 0.15s;">+</button></div>\n`;
        } else if (t === 'badge' || t === 'status_badge') {
            const bRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:20px;';
            let badgeBg = '#10b981';
            let badgeFg = '#ffffff';
            let badgeBorder = 'border:none;';
            
            const aType = c.alert_type || c.type || '';
            if (c.background_color && c.background_color !== 'transparent') {
                badgeBg = c.background_color;
                const isBgBright = isColorBright(badgeBg);
                badgeFg = c.font_color || (isBgBright ? '#0f172a' : '#ffffff');
            } else if (aType === 'info') {
                badgeBg = isLight ? '#e0f2fe' : 'rgba(14,165,233,0.2)';
                badgeFg = isLight ? '#0369a1' : '#38bdf8';
                badgeBorder = isLight ? 'border:1px solid #7dd3fc;' : 'border:1px solid rgba(14,165,233,0.4);';
            } else if (aType === 'success') {
                badgeBg = isLight ? '#dcfce7' : 'rgba(16,185,129,0.2)';
                badgeFg = isLight ? '#15803d' : '#34d399';
                badgeBorder = isLight ? 'border:1px solid #86efac;' : 'border:1px solid rgba(16,185,129,0.4);';
            } else if (aType === 'warning') {
                badgeBg = isLight ? '#fef3c7' : 'rgba(245,158,11,0.2)';
                badgeFg = isLight ? '#92400e' : '#fbbf24';
                badgeBorder = isLight ? 'border:1px solid #fde68a;' : 'border:1px solid rgba(245,158,11,0.4);';
            } else if (aType === 'error') {
                badgeBg = isLight ? '#fee2e2' : 'rgba(239,68,68,0.2)';
                badgeFg = isLight ? '#991b1b' : '#f87171';
                badgeBorder = isLight ? 'border:1px solid #fca5a5;' : 'border:1px solid rgba(239,68,68,0.4);';
            } else {
                badgeBg = isLight ? '#f1f5f9' : 'rgba(255,255,255,0.1)';
                badgeFg = isLight ? '#0f172a' : '#f8fafc';
                badgeBorder = isLight ? 'border:1px solid #cbd5e1;' : 'border:1px solid rgba(255,255,255,0.15);';
            }
            controls += `<div${id}${titleAttr} class="rad-badge" style="${base(c)}background:${badgeBg};color:${badgeFg};${badgeBorder}${bRadius}display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;">${text}</div>\n`;
        } else if (t === 'image') {
            const imgBorder = hasCustomBorder ? `border-width:${c.border_width || 1}px;border-color:${c.border_color || border};border-style:${c.border_style || 'dashed'};` : `border:1px dashed ${border};`;
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};${imgBorder}${defRadius}display:flex;align-items:center;justify-content:center;color:${color};font-size:11px;">🖼️ ${text||'Image'}</div>\n`;
        } else if (t === 'divider' || t === 'separator') {
            controls += `<hr${id}${titleAttr} style="${base(c)}height:1px;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : border};border:none;padding:0;margin:0;">\n`;
        } else if (t === 'panel') {
            const panelBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : (isLight ? '#e2e8f0' : '#1e293b');
            const pRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${panelBg};color:${color};${defBorder}${pRadius}overflow:hidden;"><div style="padding:8px 12px;font-weight:700;font-size:11px;text-transform:uppercase;color:${accent};border-bottom:1px solid ${border};letter-spacing:0.5px;">${text}</div></div>\n`;
        } else if (t === 'groupbox') {
            const gbTitle = c.title || c.caption || text || 'Group';
            const gbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const legendColor = isLight ? '#0f172a' : accent;
            controls += `<fieldset${id}${titleAttr}${ev} style="${base(c)}background:${cbg};${defBorder}${gbRadius}padding:12px;box-sizing:border-box;"><legend style="padding:0 8px;font-size:11px;font-weight:700;color:${legendColor};text-transform:uppercase;letter-spacing:0.5px;">${gbTitle}</legend></fieldset>\n`;
        } else if (t === 'drop_zone') {
            const dzBorder = hasCustomBorder ? `border-width:${c.border_width || 2}px;border-color:${c.border_color || accent};border-style:${c.border_style || 'dashed'};` : `border:2px dashed ${accent};`;
            const dzRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            const customClick = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div id="${c.id}_wrapper"${ctxAttr}${titleAttr} onclick="const fi=document.getElementById('${c.id}_file');if(fi)fi.click();" ondragover="event.preventDefault();" ondrop="event.preventDefault();if(event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0]){const p=event.dataTransfer.files[0].name;const lbl=this.querySelector('.dz-label');if(lbl)lbl.textContent=p;const hid=document.getElementById('${c.id}');if(hid)hid.value=p;const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(p);}" style="${base(c)}background:${cbg};${dzBorder}${dzRadius}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:${color};opacity:0.85;cursor:${c.cursor||'pointer'};" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter=''"><input type="hidden" id="${c.id}" name="${c.id}" value="${text||''}"><input type="file" id="${c.id}_file" style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;const lbl=this.parentNode.querySelector('.dz-label');if(lbl)lbl.textContent=p;const hid=document.getElementById('${c.id}');if(hid)hid.value=p;const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(p);const fnK=window['${customClick}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK(p);}"><span style="font-size:24px;">📥</span><span class="dz-label" style="font-size:11px;">${text||'Drop files here or click to browse'}</span></div>\n`;
        } else if (t === 'status_indicator') {
            const statusColor = c.status === 'error' ? '#ef4444' : c.status === 'warning' ? '#f59e0b' : c.status === 'inactive' ? (isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)') : '#10b981';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;color:${color};"><div style="width:10px;height:10px;background:${statusColor};border-radius:50%;box-shadow:0 0 6px ${statusColor};flex-shrink:0;"></div><span style="font-size:12px;font-weight:600;">${text}</span></div>\n`;
        } else if (t === 'metric_card') {
            const mRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            const showTrend = c.trend !== undefined && c.trend !== null && c.trend !== '' && c.trend !== false && c.show_trend !== false;
            const trendHtml = showTrend ? `<div style="font-size:10px;color:${c.trend_color || '#10b981'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">↑ ${c.trend}</div>` : '';
            const pad = c.padding !== undefined ? `${c.padding}px` : (showTrend ? '10px 12px' : '6px 14px');
            const justify = showTrend ? 'space-between' : 'center';
            const valSize = c.value_font_size || (showTrend ? 22 : 19);
            const valColor = c.value_color || color;
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};${defBorder}${mRadius}padding:${pad};display:flex;flex-direction:column;justify-content:${justify};gap:2px;box-sizing:border-box;"><div style="font-size:${c.font_size || 10}px;color:${color};opacity:0.75;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${text}</div><div style="font-size:${valSize}px;font-weight:800;color:${valColor};line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${c.value||'—'}</div>${trendHtml}</div>\n`;
        } else if (t === 'alert_banner') {
            const alertCol = c.alert_type === 'error' ? '#ef4444' : c.alert_type === 'warning' ? '#f59e0b' : c.alert_type === 'success' ? '#10b981' : accent;
            const alertIcon = c.alert_type === 'error' ? '❌' : c.alert_type === 'warning' ? '⚠️' : c.alert_type === 'success' ? '✅' : 'ℹ️';
            const aRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:0 6px 6px 0;';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : alertCol + '22'};border-left:4px solid ${alertCol};${aRadius}display:flex;align-items:center;gap:10px;padding:0 12px;color:${color};"><span>${alertIcon}</span><span style="font-size:12px;">${text}</span></div>\n`;
        } else if (t === 'code_view') {
            const codeBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : '#0d1117';
            const codeFg = c.font_color && c.font_color !== fg ? c.font_color : '#7dd3fc';
            const cdRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<textarea${id}${titleAttr}${ev}${roAttr}${autoFocusAttr} placeholder="${c.placeholder || ''}" style="${base(c)}background:${codeBg};${defBorder}${cdRadius}padding:12px;color:${codeFg};font-family:'Fira Code','Courier New',monospace;font-size:${c.font_size||12}px;overflow:auto;margin:0;resize:none;outline:none;white-space:pre;" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'>${text}</textarea>\n`;
        } else if (t === 'metric_meter') {
            const val = c.value !== undefined ? c.value : 65;
            const meterBg = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;"><span>${text}</span><span>${val}%</span></div><div style="width:100%;height:6px;background:${meterBg};border-radius:3px;overflow:hidden;"><div style="width:${val}%;height:100%;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : `linear-gradient(to right, ${accent}, #818cf8)`};border-radius:3px;"></div></div></div>\n`;
        } else if (t === 'tag') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 8px;">${(text||'tag1,tag2').split(',').map((tg: string)=>`<span style="background:${cbg};color:${accent};${defBorder}${defRadius}padding:2px 10px;font-size:11px;font-weight:600;">${tg.trim()}</span>`).join('')}</div>\n`;
        } else if (t === 'form_field' || t === 'form_password' || t === 'form_textarea') {
            const inputType = t === 'form_password' ? 'password' : (t === 'form_textarea' ? 'textarea' : 'text');
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;"><label style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</label>${inputType === 'textarea' ? `<textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${ev}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} placeholder="${c.placeholder || ''}" style="flex:1;background:${cbg};color:${color};${defBorder}${defRadius}padding:6px 10px;resize:none;outline:none;font-size:${c.font_size||13}px;"></textarea>` : `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="${inputType}"${ev}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} placeholder="${c.placeholder || ''}" style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;font-size:${c.font_size||13}px;">`}</div>\n`;
        } else if (t === 'select' || t === 'dropdown' || t === 'form_dropdown' || t === 'listbox') {
            const rawOpts = c.items || c.options || text || c.caption || 'Option 1, Option 2, Option 3';
            const optArray = Array.isArray(rawOpts) ? rawOpts : String(rawOpts).split(',').map((s: string) => s.trim());
            const isListBox = t === 'listbox';
            const isMulti = isListBox && (Boolean(c.multiple) || Boolean(c.multi_select) || c.selection_mode === 'multiple');

            let selectedVals: string[] = [];
            if (Array.isArray(c.value)) {
                selectedVals = c.value.map(String);
            } else if (Array.isArray(c.selected)) {
                selectedVals = c.selected.map(String);
            } else if (c.value !== undefined && c.value !== null && c.value !== '') {
                if (isMulti && typeof c.value === 'string' && c.value.includes(',')) {
                    selectedVals = c.value.split(',').map((s: string) => s.trim());
                } else {
                    selectedVals = [String(c.value)];
                }
            } else if (c.selected !== undefined && c.selected !== null && c.selected !== '') {
                selectedVals = [String(c.selected)];
            } else if (!isMulti && optArray[0]) {
                const firstOpt = optArray[0];
                const firstVal = typeof firstOpt === 'object' && firstOpt !== null ? (firstOpt.value !== undefined ? String(firstOpt.value) : String(firstOpt.id || '')) : String(firstOpt);
                selectedVals = [firstVal];
            }

            const itemLabels = c.item_labels || {};
            const selOptions = optArray.map((opt: any) => {
                const val = typeof opt === 'object' && opt !== null ? (opt.value !== undefined ? String(opt.value) : String(opt.id || '')) : String(opt);
                const label = typeof opt === 'object' && opt !== null ? (opt.label || opt.text || opt.name || val) : (itemLabels[val] || val);
                const isSelected = selectedVals.includes(val) || (typeof opt === 'string' && selectedVals.includes(opt)) ? ' selected' : '';
                return `<option value="${val.replace(/"/g, '&quot;')}"${isSelected}>${label}</option>`;
            }).join('');

            const sizeAttr = isListBox ? ` size="${c.size || 5}"` : '';
            const multiAttr = isMulti ? ' multiple' : '';
            const chevronColor = encodeURIComponent(accent || '#38bdf8');
            const selectInnerStyle = isListBox
                ? `width:100%;height:100%;background:${cbg};color:${color};${defBorder}${defRadius}padding:4px 8px;outline:none;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;box-sizing:border-box;`
                : `width:100%;height:100%;background-color:${cbg};color:${color};${defBorder}${defRadius}padding:0 30px 0 10px;outline:none;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;font-weight:500;appearance:none;-webkit-appearance:none;background-image:url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'12\\' height=\\'12\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'${chevronColor}\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'%3E%3Cpolyline points=\\'6 9 12 15 18 9\\'%3E%3C/polyline%3E%3C/svg%3E');background-repeat:no-repeat;background-position:right 10px center;background-size:12px 12px;box-shadow:0 1px 2px rgba(0,0,0,0.2);box-sizing:border-box;`;

            const selectClass = isListBox ? 'simplegui-listbox' : 'simplegui-select';
            if (t === 'form_dropdown') {
                controls += `<div style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;"><label style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</label><select id="${c.id}" class="${selectClass}"${sizeAttr}${multiAttr}${ev}${disabled}${reqAttr} style="${selectInnerStyle}">${selOptions}</select></div>\n`;
            } else {
                controls += `<div style="${base(c)}"><select id="${c.id}" class="${selectClass}"${sizeAttr}${multiAttr}${ev}${disabled}${reqAttr} style="${selectInnerStyle}">${selOptions}</select></div>\n`;
            }
        } else if (t === 'form_link') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;justify-content:space-between;align-items:center;color:${color};"><span style="font-size:11px;opacity:0.8;">${text}</span><a href="#"${ev} style="color:${accent};text-decoration:none;font-size:11px;font-weight:700;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">View Link 🔗</a></div>\n`;
        } else if (t === 'path') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;background:${cbg};${defBorder}${defRadius}padding:0 10px;color:${color};font-size:11px;overflow:hidden;">📁 ${(text||'Users › developer › project').replace(/›/g,'<span style="opacity:0.4;margin:0 4px;">›</span>')}</div>\n`;
        } else if (t === 'db_grid') {
            const gridBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : (isLight ? '#ffffff' : 'rgba(15,23,42,0.8)');
            const dbBorder = hasCustomBorder ? `border-width:${c.border_width || 1}px;border-color:${c.border_color || accent};border-style:${c.border_style || 'solid'};` : `border:1px solid ${accent};`;
            const dbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const thColor = isLight ? '#0f172a' : accent;
            const selBg = isLight ? 'rgba(2,132,199,0.18)' : 'rgba(56,189,248,0.22)';
            const hoverBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
            controls += `<div${id}${titleAttr} style="${base(c)}overflow:auto;${dbBorder}${dbRadius}background:${gridBg};box-shadow:0 4px 12px rgba(0,0,0,0.3);"><div style="padding:6px 12px;background:${isLight ? 'rgba(2,132,199,0.1)' : 'rgba(56,189,248,0.1)'};font-size:11px;font-weight:700;color:${accent};border-bottom:1px solid ${border};display:flex;justify-content:space-between;"><span>🗄️ ${text||'DBGrid: Dataset1'}</span><span>3 Records</span></div><table style="width:100%;border-collapse:collapse;font-size:11px;color:${color};"><thead><tr style="background:${cbg};">${['ID','Customer Name','Email','Balance'].map(h=>`<th style="padding:6px 10px;text-align:left;font-weight:700;color:${thColor};border-bottom:1px solid ${border};">${h}</th>`).join('')}</tr></thead><tbody>${[['101','Acme Corp','sales@acme.com','$12,450'],['102','Starlight Ltd','info@starlight.io','$8,900'],['103','Nexus Tech','contact@nexus.dev','$15,200']].map(r=>`<tr style="border-bottom:1px solid ${border};cursor:pointer;transition:background 0.12s;" data-pid="${r[0]}" onclick="const tbody=this.closest('tbody');if(tbody){tbody.querySelectorAll('tr').forEach(tr=>{tr.classList.remove('selected-tr');tr.style.background=''});this.classList.add('selected-tr');this.style.background='${selBg}';window.selectedRowElement=this;window.selectedRowPid='${r[0]}';if(window.onTableRowClick)window.onTableRowClick(this);const fn=window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${r[0]}');}" onmouseover="if(!this.classList.contains('selected-tr'))this.style.background='${hoverBg}'" onmouseout="if(!this.classList.contains('selected-tr'))this.style.background=''">${r.map(cell=>`<td style="padding:6px 10px;">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>\n`;
        } else if (t === 'db_navigator') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}${defRadius}padding:2px;gap:2px;">${[['⏮','First'],['◀','Prev'],['▶','Next'],['⏭','Last'],['➕','Add'],['✖','Delete'],['💾','Post'],['🔄','Refresh']].map(b=>`<button title="${b[1]}" style="flex:1;height:100%;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'};border:none;border-radius:4px;color:${color};font-size:12px;cursor:pointer;" onmouseover="this.style.background='${isLight ? 'rgba(2,132,199,0.2)' : 'rgba(56,189,248,0.2)'}'" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'}'">${b[0]}</button>`).join('')}</div>\n`;
        } else if (t === 'db_input') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:3px;"><label style="font-size:10px;font-weight:700;color:${accent};">🗄️ ${text||'DBField'}</label><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" value="Sample Record Data" placeholder="${c.placeholder || ''}"${ev}${roAttr}${reqAttr}${maxLenAttr} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;font-size:${c.font_size||13}px;"></div>\n`;
        } else if (t === 'db_dropdown') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:3px;"><label style="font-size:10px;font-weight:700;color:${accent};">🗄️ ${text||'DBLookup'}</label><select${ev} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 8px;outline:none;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><option>Acme Corp</option><option>Starlight Ltd</option><option>Nexus Tech</option></select></div>\n`;
        } else if (t === 'open_dialog') {
            controls += `<input type="file"${id}${ev} style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;if(window['${c.id}_onSelect'])window['${c.id}_onSelect'](p);else if(window.backendAlert)window.backendAlert('File Selected: '+p);}">\n`;
        } else if (t === 'save_dialog') {
            controls += `<input type="file"${id}${ev} style="display:none;">\n`;
        } else if (t === 'table' || t === 'data_table' || t === 'table_view' || t === 'form_table') {
            const rawHeaders = c.columns || c.headers || (c.text ? String(c.text).split(',').map(s => s.trim()) : ['ID', 'Name', 'Value', 'Status']);
            const headers = Array.isArray(rawHeaders) ? rawHeaders : String(rawHeaders).split(',').map(s => s.trim());
            const rawRows = c.rows || c.data || c.dataset || (Array.isArray(c.value) ? c.value : [
                ['#1', 'Item 1', '100', 'Active'],
                ['#2', 'Item 2', '200', 'Active'],
                ['#3', 'Item 3', '300', 'Active']
            ]);
            const isMulti = Boolean(c.multi_select || c.multiple || c.selection_mode === 'multiple');
            const hasCheckboxes = Boolean(c.checkbox_selection || c.selectable_checkbox || c.checkboxes);
            const tableBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : cbg;
            const selBg = isLight ? 'rgba(2,132,199,0.18)' : 'rgba(56,189,248,0.22)';
            const hoverBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
            const thColor = isLight ? '#0f172a' : accent;
            const esc = (s: any) => s === null || s === undefined ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

            const thCheckbox = hasCheckboxes
                ? `<th style="width:36px;padding:8px 6px;text-align:center;border-bottom:1px solid ${border};"><input type="checkbox" class="table-select-all" style="accent-color:${accent};cursor:pointer;" onclick="event.stopPropagation();const tbl=this.closest('table');const chks=tbl.querySelectorAll('tbody .row-chk');const isChk=this.checked;chks.forEach(k=>{k.checked=isChk;const tr=k.closest('tr');if(tr){if(isChk){tr.classList.add('selected-tr');tr.style.background='${selBg}';}else{tr.classList.remove('selected-tr');tr.style.background='';}}});if(window['${c.id}_syncTable'])window['${c.id}_syncTable']();"></th>`
                : '';

            const tableRowsHtml = rawRows.map((r: any, rIdx: number) => {
                const cells = Array.isArray(r) ? r : Object.values(r);
                const rowPid = esc(String(cells[0] || '').trim());
                const tdCheckbox = hasCheckboxes
                    ? `<td style="width:36px;padding:8px 6px;text-align:center;"><input type="checkbox" class="row-chk" style="accent-color:${accent};cursor:pointer;" onclick="event.stopPropagation();const tr=this.closest('tr');if(tr){if(this.checked){tr.classList.add('selected-tr');tr.style.background='${selBg}';}else{tr.classList.remove('selected-tr');tr.style.background='';}}if(window['${c.id}_syncTable'])window['${c.id}_syncTable']();"></td>`
                    : '';

                const rowClickScript = `const tr=this;const tbody=tr.closest('tbody');const table=tr.closest('table');const rows=Array.from(tbody.querySelectorAll('tr'));const curIdx=rows.indexOf(tr);const lastIdx=parseInt(table.dataset.lastIdx!==undefined?table.dataset.lastIdx:'-1',10);const isMulti=${isMulti};if(isMulti&&(event.ctrlKey||event.metaKey)){tr.classList.toggle('selected-tr');tr.style.background=tr.classList.contains('selected-tr')?'${selBg}':'';const chk=tr.querySelector('.row-chk');if(chk)chk.checked=tr.classList.contains('selected-tr');table.dataset.lastIdx=curIdx;}else if(isMulti&&event.shiftKey&&lastIdx>=0){const start=Math.min(lastIdx,curIdx);const end=Math.max(lastIdx,curIdx);for(let i=start;i<=end;i++){rows[i].classList.add('selected-tr');rows[i].style.background='${selBg}';const chk=rows[i].querySelector('.row-chk');if(chk)chk.checked=true;}}else{if(!isMulti){rows.forEach(r=>{r.classList.remove('selected-tr');r.style.background='';const chk=r.querySelector('.row-chk');if(chk)chk.checked=false;});tr.classList.add('selected-tr');tr.style.background='${selBg}';const chk=tr.querySelector('.row-chk');if(chk)chk.checked=true;table.dataset.lastIdx=curIdx;}else{tr.classList.toggle('selected-tr');tr.style.background=tr.classList.contains('selected-tr')?'${selBg}':'';const chk=tr.querySelector('.row-chk');if(chk)chk.checked=tr.classList.contains('selected-tr');table.dataset.lastIdx=curIdx;}}window.selectedRowElement=tr;window.selectedRowPid='${rowPid}';if(window.onTableRowClick)window.onTableRowClick(tr);if(window['${c.id}_syncTable'])window['${c.id}_syncTable']();const fn=window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${rowPid}');`;

                return `<tr style="border-bottom:1px solid ${border};cursor:pointer;transition:background 0.12s;" data-pid="${rowPid}" data-row-index="${rIdx}" onclick="${rowClickScript}" onmouseover="if(!this.classList.contains('selected-tr'))this.style.background='${hoverBg}'" onmouseout="if(!this.classList.contains('selected-tr'))this.style.background=''">${tdCheckbox}${cells.map((cell: any, i: number) => {
                    const alignStyle = (i >= 3 && i <= 5) ? 'text-align:right;' : 'text-align:left;';
                    const monoStyle = (i === 0 || (i >= 3 && i <= 5)) ? 'font-family:monospace;' : '';
                    return `<td style="padding:8px 12px;white-space:nowrap;${alignStyle}${monoStyle}">${esc(cell)}</td>`;
                }).join('')}</tr>`;
            }).join('');

            const syncScript = `<script>window['${c.id}_syncTable']=function(){const cont=document.getElementById('${c.id}');if(!cont)return;const tbl=cont.querySelector('table');if(!tbl)return;const selectedTrs=Array.from(tbl.querySelectorAll('tbody tr.selected-tr'));const pids=selectedTrs.map(r=>r.getAttribute('data-pid')||'');const allTrs=tbl.querySelectorAll('tbody tr');const selectAllChk=tbl.querySelector('thead .table-select-all');if(selectAllChk){selectAllChk.checked=allTrs.length>0&&selectedTrs.length===allTrs.length;selectAllChk.indeterminate=selectedTrs.length>0&&selectedTrs.length<allTrs.length;}const hid=document.getElementById('${c.id}_selected');if(hid)hid.value=pids.join(',');const fnSel=window['${c.id}_onSelectionChange']||window['on_${c.id}_selection_change']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnSel)fnSel(pids);};</script>`;

            controls += `<div${id}${titleAttr} style="${base(c)}overflow:auto;${defBorder}${defRadius}background:${tableBg};"><input type="hidden" id="${c.id}_selected" name="${c.id}_selected" value=""><table style="width:100%;border-collapse:collapse;font-size:12px;color:${color};"><thead><tr style="background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};position:sticky;top:0;z-index:2;">${thCheckbox}${headers.map((h: any)=>`<th style="padding:8px 12px;text-align:left;font-weight:700;color:${thColor};border-bottom:1px solid ${border};white-space:nowrap;">${esc(h)}</th>`).join('')}</tr></thead><tbody>${tableRowsHtml}</tbody></table></div>\n${syncScript}\n`;
        } else if (t === 'segmented_control') {
            const items = (text || 'Overview, Analytics, Reports').split(',').map((s: string) => s.trim());
            const sel = c.value || items[0] || '';
            const segBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
            const segRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const activeBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : accent;
            controls += `<div${id}${titleAttr}${ev} data-value="${sel}" style="${base(c)}display:flex;align-items:center;background:${cbg !== 'transparent' ? cbg : segBg};padding:3px;${defBorder}${segRadius}gap:3px;">${items.map((item: string) => {
                const isSel = item === sel;
                const itemBg = isSel ? activeBg : 'transparent';
                const itemFg = isSel ? '#ffffff' : color;
                return `<button onclick="this.parentNode.querySelectorAll('button').forEach(b=>{b.style.background='transparent';b.style.color='${color}'});this.style.background='${activeBg}';this.style.color='#ffffff';this.parentNode.dataset.value='${item}';if(window['${c.id}_onChange'])window['${c.id}_onChange']('${item}');else if(window['on_${c.id}_change'])window['on_${c.id}_change']('${item}');" style="flex:1;height:100%;border:none;border-radius:6px;background:${itemBg};color:${itemFg};font-weight:600;font-size:11px;cursor:${c.cursor||'pointer'};transition:all 0.15s;">${item}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'tree_view') {
            const rawNodes = (text || '📂 Project Root, 📂 src, 📄 index.ts, 📄 styles.css, 📁 assets, 🖼️ logo.png').split(',').map((n: string) => n.trim());
            const treeBg = cbg;
            const selBg = isLight ? 'rgba(2,132,199,0.15)' : 'rgba(56,189,248,0.2)';
            const selFg = isLight ? '#0f172a' : accent;
            controls += `<div${id}${titleAttr}${ev} class="rad-tree-container" data-selected="" style="${base(c)}background:${treeBg};${defBorder}${defRadius}padding:6px 8px;overflow:auto;display:flex;flex-direction:column;gap:2px;font-size:12px;color:${color};">${rawNodes.map((nodeText: string, idx: number) => {
                const isFolder = nodeText.includes('📁') || nodeText.includes('Project Root') || nodeText.includes('src') || nodeText.includes('assets') || idx === 0;
                const indent = idx === 0 ? 0 : (idx === 1 || idx === 4 ? 16 : 32);
                const arrowIcon = isFolder ? '▼' : ' ';
                const cleanName = nodeText;
                return `<div class="tree-node${idx===0?' selected-tree-node':''}" data-node="${cleanName}" style="padding:4px 8px;padding-left:${indent + 8}px;border-radius:4px;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;transition:background 0.12s;${idx===0 ? `background:${selBg};color:${selFg};font-weight:600;` : ''}" onclick="event.stopPropagation();const container=this.closest('.rad-tree-container');container.querySelectorAll('.tree-node').forEach(n=>{n.style.background='transparent';n.style.color='${color}';n.style.fontWeight='normal';});this.style.background='${selBg}';this.style.color='${selFg}';this.style.fontWeight='600';container.dataset.selected=this.dataset.node;if(window['${c.id}_onSelect'])window['${c.id}_onSelect'](this.dataset.node);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](this.dataset.node);if(window['${c.id}_onNodeClick'])window['${c.id}_onNodeClick'](this.dataset.node);" onmouseover="if(!this.style.background.includes('rgba')){this.style.background='${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'}'}" onmouseout="if(!this.style.background.includes('rgba(56')&&!this.style.background.includes('rgba(2,132')){this.style.background='transparent';}"><span class="tree-arrow" onclick="event.stopPropagation();const isCollapsed=this.textContent==='▶';this.textContent=isCollapsed?'▼':'▶';let curr=this.closest('.tree-node').nextElementSibling;while(curr){const currIndent=parseInt(curr.style.paddingLeft||'0');if(currIndent<=${indent + 8})break;curr.style.display=isCollapsed?'flex':'none';curr=curr.nextElementSibling;}" style="width:12px;font-size:9px;opacity:0.7;display:inline-block;cursor:pointer;">${arrowIcon}</span><span>${cleanName}</span></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'avatar_group') {
            const avatars = (text || 'JD, AS, MK, +3').split(',').map((a: string) => a.trim());
            const avColors = ['#0284c7', '#7c3aed', '#059669', '#d97706', '#dc2626'];
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;padding:0 4px;">${avatars.map((av: string, i: number) => {
                const bgCol = av.startsWith('+') ? (isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)') : avColors[i % avColors.length];
                return `<div style="width:32px;height:32px;border-radius:50%;background:${bgCol};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid ${bg};margin-left:${i === 0 ? '0' : '-8px'};box-shadow:0 2px 4px rgba(0,0,0,0.2);flex-shrink:0;" title="${av}">${av}</div>`;
            }).join('')}</div>\n`;
        } else if (t === 'stat_chart') {
            const val = c.value !== undefined ? c.value : '$48,290';
            const trend = c.trend || '+18.4%';
            const scRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg};${defBorder}${scRadius}padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:10px;font-weight:700;color:${color};opacity:0.7;text-transform:uppercase;">${text||'Monthly Revenue'}</span><span style="font-size:10px;font-weight:700;color:#10b981;background:rgba(16,185,129,0.15);padding:2px 6px;border-radius:4px;">${trend}</span></div><div style="font-size:20px;font-weight:800;color:${color};">${val}</div><svg viewBox="0 0 100 24" style="width:100%;height:24px;overflow:visible;"><path d="M0 20 L20 14 L40 17 L60 8 L80 12 L100 2" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/><path d="M0 20 L20 14 L40 17 L60 8 L80 12 L100 2 L100 24 L0 24 Z" fill="${accent}" opacity="0.15"/></svg></div>\n`;
        } else if (t === 'accordion') {
            const accRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg};${defBorder}${accRadius}overflow:hidden;display:flex;flex-direction:column;"><div onclick="const body=this.nextElementSibling;const arrow=this.querySelector('.acc-arrow');if(body.style.display==='none'){body.style.display='block';arrow.textContent='▼';}else{body.style.display='none';arrow.textContent='▶';}" style="padding:8px 12px;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};font-weight:700;font-size:12px;color:${color};display:flex;justify-content:space-between;align-items:center;cursor:pointer;"><span>${text||'Accordion Section'}</span><span class="acc-arrow" style="font-size:10px;opacity:0.7;">▼</span></div><div style="padding:10px 12px;font-size:11px;color:${color};opacity:0.85;border-top:1px solid ${border};">${c.placeholder||'Collapsible accordion content panel details.'}</div></div>\n`;
        } else if (t === 'breadcrumb') {
            const crumbs = (text || 'Home, Projects, App Settings').split(',').map((cr: string) => cr.trim());
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;gap:6px;font-size:11px;color:${color};">${crumbs.map((crumb: string, i: number) => {
                const isLast = i === crumbs.length - 1;
                const colStyle = isLast ? `font-weight:700;color:${accent};` : `opacity:0.7;cursor:pointer;`;
                return `${i > 0 ? `<span style="opacity:0.4;">›</span>` : ''}<span style="${colStyle}">${crumb}</span>`;
            }).join('')}</div>\n`;
        } else if (t === 'timeline') {
            const steps = (text || 'Order Placed, Payment Verified, In Transit, Delivered').split(',').map((st: string) => st.trim());
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:8px;padding:6px 8px;">${steps.map((step: string, i: number) => {
                const active = i <= 1;
                const nodeCol = active ? accent : (isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)');
                return `<div style="display:flex;align-items:center;gap:10px;font-size:11px;color:${color};"><div style="width:10px;height:10px;border-radius:50%;background:${nodeCol};box-shadow:${active ? `0 0 6px ${accent}` : 'none'};flex-shrink:0;"></div><span style="font-weight:${active ? '700' : 'normal'};opacity:${active ? '1' : '0.6'};">${step}</span></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'toast_card') {
            const tCol = c.alert_type === 'error' ? '#ef4444' : c.alert_type === 'warning' ? '#f59e0b' : c.alert_type === 'info' ? accent : '#10b981';
            const tIcon = c.alert_type === 'error' ? '❌' : c.alert_type === 'warning' ? '⚠️' : c.alert_type === 'info' ? 'ℹ️' : '✅';
            const tRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};border-left:4px solid ${tCol};${defBorder}${tRadius}padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 4px 14px rgba(0,0,0,0.25);"><div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">${tIcon}</span><div style="display:flex;flex-direction:column;"><span style="font-weight:700;font-size:12px;color:${color};">${text||'Notification'}</span><span style="font-size:10px;color:${color};opacity:0.7;">${c.placeholder||'Action performed successfully.'}</span></div></div><button onclick="this.parentNode.style.display='none'" style="background:none;border:none;color:${color};opacity:0.5;cursor:pointer;font-size:14px;">✕</button></div>\n`;
        } else if (t === 'time_picker') {
            const val = c.value || '09:30';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;gap:8px;background:${cbg};${defBorder}${defRadius}padding:0 10px;color:${color};"><span style="font-size:14px;opacity:0.7;">🕒</span><input type="time" value="${val}" style="background:none;border:none;color:inherit;font-family:inherit;font-size:${c.font_size||13}px;outline:none;width:100%;color-scheme:${isLight ? 'light' : 'dark'};"></div>\n`;
        } else if (t === 'rich_select') {
            const optList = c.options || 'React.js, Vue.js, Angular, Svelte, Next.js, Bun RAD Studio, TypeScript';
            controls += `<div${id}${titleAttr}${ev} class="rad-rich-select" style="${base(c)}background:${cbg};${defBorder}${defRadius}display:flex;align-items:center;gap:6px;padding:0 8px;color:${color};"><span style="opacity:0.6;font-size:13px;flex-shrink:0;">🔍</span><input type="text" value="${text || ''}" placeholder="${c.placeholder || 'Type to search options...'}" style="flex:1;background:none;border:none;color:inherit;font-family:inherit;font-size:${c.font_size||12}px;outline:none;width:100%;" oninput="const val=this.value.toLowerCase();const dropdown=this.parentNode.querySelector('.rich-select-dropdown');if(dropdown){dropdown.style.display='block';dropdown.querySelectorAll('.rich-select-option').forEach(opt=>{opt.style.display=opt.textContent.toLowerCase().includes(val)?'block':'none';});}if(window['${c.id}_onChange'])window['${c.id}_onChange'](this.value);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](this.value);" onfocus="const dropdown=this.parentNode.querySelector('.rich-select-dropdown');if(dropdown)dropdown.style.display='block';" onblur="setTimeout(()=>{const dropdown=this.parentNode.querySelector('.rich-select-dropdown');if(dropdown)dropdown.style.display='none';},200)"><span style="font-size:10px;opacity:0.5;cursor:pointer;flex-shrink:0;" onclick="const input=this.parentNode.querySelector('input');input.focus();">▼</span><div class="rich-select-dropdown" style="display:none;position:absolute;left:0;top:100%;width:100%;max-height:160px;overflow-y:auto;background:${isLight?'#ffffff':'#1e293b'};border:1px solid ${border};border-radius:6px;margin-top:4px;box-shadow:0 6px 16px rgba(0,0,0,0.3);z-index:999;">${optList.split(',').map((opt: string) => { const clean = opt.trim(); return `<div class="rich-select-option" style="padding:6px 10px;font-size:11px;cursor:pointer;color:${color};" onmouseover="this.style.background='${isLight?'rgba(2,132,199,0.1)':'rgba(56,189,248,0.15)'}'" onmouseout="this.style.background='transparent'" onmousedown="event.preventDefault()" onclick="const input=this.closest('.rad-rich-select').querySelector('input');input.value='${clean}';this.parentNode.style.display='none';if(window['${c.id}_onChange'])window['${c.id}_onChange']('${clean}');else if(window['on_${c.id}_change'])window['on_${c.id}_change']('${clean}');">${clean}</div>`; }).join('')}</div></div>\n`;
        } else if (t === 'property_grid') {
            const rawProps = text || 'Theme: Dark, Font Size: 13px, Auto Save: True, Version: 1.4.0';
            const propsList = rawProps.split(',').map((s: string) => s.trim().split(':')).filter((arr: string[]) => arr.length === 2);
            const pgRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const customClick = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${pgRadius}display:flex;flex-direction:column;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.2);"><div style="padding:6px 10px;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};font-weight:700;font-size:11px;color:${accent};border-bottom:1px solid ${border};display:flex;align-items:center;gap:6px;"><span>📋</span><span>${c.caption || 'Property Inspector'}</span></div><div class="prop-grid-body" style="display:flex;flex-direction:column;overflow-y:auto;flex:1;min-height:0;">${propsList.map((pair: string[]) => {
                const k = (pair[0] || '').trim(); const v = (pair[1] || '').trim();
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-bottom:1px solid ${border};font-size:11px;cursor:pointer;" onmouseover="this.style.background='${isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'}'" onmouseout="this.style.background=''" onclick="event.stopPropagation();const fnK=window['${customClick}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK('${k}: ${v}');"><span style="font-weight:600;color:${color};opacity:0.85;">${k}</span><span style="font-size:11px;color:${accent};font-weight:600;font-family:monospace;">${v}</span></div>`;
            }).join('')}</div></div>\n`;
        } else if (t === 'popup_menu') {
            const rawItems = text || '✂️ Cut  ⌘X, 📋 Copy  ⌘C, 📄 Paste  ⌘V, ---, 🗑️ Delete  ⌫';
            const items = rawItems.split(',').map((s: string) => s.trim());
            const pmRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            const customClick = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} class="rad-popup-menu" style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${pmRadius}padding:6px;display:flex;flex-direction:column;gap:2px;box-shadow:0 10px 25px rgba(0,0,0,0.4);">${items.map((it: string) => {
                if (it === '---') return `<div style="height:1px;background:${border};margin:4px 0;"></div>`;
                const parts = it.split(/\s{2,}/);
                const label = parts[0] || it;
                const shortcut = parts[1] || '';
                return `<div class="popup-item" style="padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${color};cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background='${isLight ? 'rgba(2,132,199,0.12)' : 'rgba(56,189,248,0.18)'}'" onmouseout="this.style.background=''" onclick="event.stopPropagation();const fnK=window['${customClick}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK('${label.replace(/'/g, "\\'")}');"><span>${label}</span>${shortcut ? `<span style="font-size:10px;opacity:0.5;font-family:monospace;">${shortcut}</span>` : ''}</div>`;
            }).join('')}</div>\n`;
        } else if (t === 'calendar_view') {
            const calRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:12px;';
            const calBg = cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b');
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            const curDate = text || 'July 2026';
            const selDay = Number(c.value) || 25;

            const calMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const dateParts = curDate.trim().split(' ').filter(Boolean);
            let calMIdx = calMonths.findIndex(m => m.toLowerCase() === (dateParts[0] || '').toLowerCase());
            if (calMIdx === -1) calMIdx = 6;
            const calYear = parseInt(dateParts[1] || '2026', 10);
            const calFirstDay = new Date(calYear, calMIdx, 1).getDay();
            const calDaysInMonth = new Date(calYear, calMIdx + 1, 0).getDate();
            const calPrevMonthDays = new Date(calYear, calMIdx, 0).getDate();

            let initialDays = '';
            for (let i = 0; i < calFirstDay; i++) {
                const d = calPrevMonthDays - calFirstDay + 1 + i;
                initialDays += `<span class="cal-day cal-day-prev" style="padding:4px 0;opacity:0.35;cursor:pointer;" onclick="window.navCalendar(this, -1);">${d}</span>`;
            }
            for (let d = 1; d <= calDaysInMonth; d++) {
                const isSelected = (d === selDay);
                const bgStyle = isSelected ? `background:${accent};color:#ffffff;font-weight:700;border-radius:50%;` : '';
                initialDays += `<span class="cal-day cal-day-cur" data-day="${d}" style="padding:4px 0;opacity:0.95;cursor:pointer;${bgStyle}" onclick="window.selectCalendarDay(this, ${d});">${d}</span>`;
            }
            const totalCellsCount = (calFirstDay + calDaysInMonth) > 35 ? 42 : 35;
            const nextFillerCount = totalCellsCount - (calFirstDay + calDaysInMonth);
            for (let d = 1; d <= nextFillerCount; d++) {
                initialDays += `<span class="cal-day cal-day-next" style="padding:4px 0;opacity:0.35;cursor:pointer;" onclick="window.navCalendar(this, 1);">${d}</span>`;
            }

            controls += `<div id="${c.id}_wrapper"${titleAttr} data-cal-id="${c.id}" data-accent="${accent}" data-color="${color}" data-change-handler="${customChange}" style="${base(c)}background:${calBg};${defBorder}${calRadius}padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 4px 14px rgba(0,0,0,0.25);"><input type="hidden" id="${c.id}" name="${c.id}" value="${selDay}"><div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:12px;color:${color};border-bottom:1px solid ${border};padding-bottom:6px;"><button type="button" style="background:none;border:none;color:inherit;cursor:pointer;font-size:12px;opacity:0.7;" onclick="window.navCalendar(this, -1);">◄</button><span class="cal-title">${curDate}</span><button type="button" style="background:none;border:none;color:inherit;cursor:pointer;font-size:12px;opacity:0.7;" onclick="window.navCalendar(this, 1);">►</button></div><div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:10px;font-weight:700;color:${accent};margin-top:6px;opacity:0.8;"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div><div class="cal-days-grid" style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:11px;color:${color};gap:2px;margin-top:4px;">${initialDays}</div></div>\n`;
        } else if (t === 'color_swatch') {
            const colorsList = (text || '#0284c7, #38bdf8, #10b981, #f59e0b, #ef4444, #7c3aed, #ec4899').split(',').map((s: string) => s.trim());
            const curCol = c.value || colorsList[0] || '#0284c7';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_wrapper"${titleAttr} data-value="${curCol}" style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:6px;padding:4px;"><input type="hidden" id="${c.id}" name="${c.id}" value="${curCol}"><span style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${c.caption || 'Color Palette Swatch'}</span><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${colorsList.map((hex: string) => {
                const isSel = hex.toLowerCase() === curCol.toLowerCase();
                return `<div class="swatch-chip" data-color="${hex}" style="width:24px;height:24px;border-radius:50%;background:${hex};cursor:pointer;transition:transform 0.15s, box-shadow 0.15s;box-shadow:${isSel ? `0 0 0 3px ${isLight ? '#ffffff' : '#0f172a'}, 0 0 0 5px ${hex}` : '0 2px 6px rgba(0,0,0,0.3)'};transform:${isSel ? 'scale(1.15)' : 'scale(1)'};" onclick="this.parentNode.querySelectorAll('.swatch-chip').forEach(s=>{s.style.transform='scale(1)';s.style.boxShadow='0 2px 6px rgba(0,0,0,0.3)';});this.style.transform='scale(1.15)';this.style.boxShadow='0 0 0 3px ${isLight ? '#ffffff' : '#0f172a'}, 0 0 0 5px ${hex}';const hid=document.getElementById('${c.id}');if(hid)hid.value='${hex}';this.closest('[id]').dataset.value='${hex}';const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC('${hex}');"></div>`;
            }).join('')}</div></div>\n`;
        } else if (t === 'file_path_bar') {
            const pathVal = text || '/Users/codecaine/bun_rad_studio/src';
            const fRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_wrapper"${ctxAttr}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${fRadius}padding:0 8px;gap:8px;box-shadow:0 2px 6px rgba(0,0,0,0.15);color:${color};"><input type="hidden" id="${c.id}" name="${c.id}" value="${pathVal}"><input type="file" id="${c.id}_native_file" style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;const txt=this.parentNode.querySelector('.path-text');if(txt)txt.textContent=p;const hid=document.getElementById('${c.id}');if(hid)hid.value=p;const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(p);const fnK=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK(p);}"><div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;cursor:pointer;" onclick="const cur=document.getElementById('${c.id}')?.value||'${pathVal}';const fnK=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK(cur);"><span style="font-size:14px;opacity:0.75;flex-shrink:0;">📁</span><span class="path-text" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.9;font-family:monospace;">${pathVal}</span></div><button type="button" onclick="event.stopPropagation();const cur=document.getElementById('${c.id}')?.value||'${pathVal}';const fnK=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK(cur);const fi=document.getElementById('${c.id}_native_file');if(fi)fi.click();" style="padding:4px 10px;background:${accent};color:#ffffff;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;flex-shrink:0;transition:filter 0.15s;" onmouseover="this.style.filter='brightness(1.15)'" onmouseout="this.style.filter=''">Browse...</button></div>\n`;
        } else if (t === 'kanban_board') {
            const rawCols = text || 'To Do (3) | In Progress (2) | Done (4)';
            const cols = rawCols.split('|').map((s: string) => s.trim());
            const kbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            const sampleCards = [
                ['● Design Specs', '● IPC Handlers', '● State Sync'],
                ['● HTML Generator', '● UI Canvas'],
                ['● Unit Tests', '● API Docs', '● Themes', '● Exporter']
            ];
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#f8fafc' : '#0f172a')};${defBorder}${kbRadius}padding:8px;display:flex;gap:8px;box-shadow:0 4px 14px rgba(0,0,0,0.25);overflow-x:auto;">${cols.map((colStr: string, idx: number) => {
                const cards = sampleCards[idx % sampleCards.length] || [];
                return `<div style="flex:1;min-width:90px;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'};border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:6px;"><div style="font-size:10px;font-weight:700;color:${accent};border-bottom:1px solid ${border};padding-bottom:4px;display:flex;justify-content:space-between;align-items:center;"><span>${colStr}</span></div><div style="display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto;">${cards.map((card: string) => `<div onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${card.replace(/'/g, "\\'")}');" style="background:${isLight ? '#ffffff' : '#1e293b'};border:1px solid ${border};border-radius:4px;padding:4px 6px;font-size:10px;color:${color};font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.1);cursor:pointer;">${card}</div>`).join('')}</div></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'shortcut_recorder') {
            const scVal = text || c.value || '⌘ Shift P';
            const keys = scVal.split(/\s+|\+|\-/).filter(Boolean);
            const srRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${srRadius}padding:0 8px;gap:6px;box-shadow:0 2px 6px rgba(0,0,0,0.15);color:${color};cursor:pointer;" onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${scVal}');"><div style="display:flex;align-items:center;gap:4px;">${keys.map((k: string) => `<kbd class="rad-mono" style="background:${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'};border:1px solid ${border};border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;color:${accent};">${k}</kbd>`).join('')}</div><span style="font-size:10px;opacity:0.5;">⌨️ Edit</span></div>\n`;
        } else if (t === 'split_button') {
            const mainText = text || 'Save Changes';
            const sbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            const customMenuHandler = c.event_handlers?.onMenu || c.event_handlers?.onmenu || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:inline-flex;align-items:stretch;background:${cbg !== 'transparent' ? cbg : accent};${defBorder}${sbRadius}overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.2);"><button onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${mainText}');" style="flex:1;padding:0 12px;background:none;border:none;color:#ffffff;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;">${mainText}</button><div style="width:1px;background:rgba(255,255,255,0.25);"></div><button onclick="const fn=window['${customMenuHandler}']||window['${c.id}_onMenu']||window['on_${c.id}_menu'];if(fn)fn();" style="padding:0 8px;background:none;border:none;color:#ffffff;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">▼</button></div>\n`;
        } else if (t === 'sparkline_table') {
            const rawRows = text || 'Revenue: $48k [↗], Active Users: 1.2k [→], Errors: 0.01% [↘]';
            const rows = rawRows.split(',').map((s: string) => s.trim());
            const stRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${stRadius}padding:6px 10px;display:flex;flex-direction:column;justify-content:space-around;box-shadow:0 4px 12px rgba(0,0,0,0.2);color:${color};">${rows.map((row: string, i: number) => {
                const parts = row.split(':');
                const label = parts[0] || 'Metric';
                const val = parts[1] || '$10k';
                const isUp = i % 3 === 0; const isFlat = i % 3 === 1;
                const sparkColor = isUp ? '#10b981' : isFlat ? accent : '#ef4444';
                const points = isUp ? '0,14 10,12 20,8 30,10 40,4 50,2' : isFlat ? '0,8 10,10 20,7 30,9 40,8 50,8' : '0,2 10,5 20,8 30,6 40,12 50,14';
                return `<div onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${label.replace(/'/g, "\\'")}');" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:${i < rows.length - 1 ? `1px solid ${border}` : 'none'};cursor:pointer;"><span style="font-weight:600;opacity:0.85;">${label}</span><div style="display:flex;align-items:center;gap:8px;"><svg width="50" height="16" style="overflow:visible;"><polyline fill="none" stroke="${sparkColor}" stroke-width="2" points="${points}" /></svg><span class="rad-mono" style="font-weight:700;color:${sparkColor};">${val}</span></div></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'metric_comparison') {
            const mTitle = text || 'Monthly Recurring Revenue';
            const mVal = c.value || '$84,250';
            const targetStr = c.placeholder || 'vs $75,000 target';
            const mcRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${mcRadius}padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 4px 14px rgba(0,0,0,0.25);color:${color};cursor:pointer;" onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${mTitle.replace(/'/g, "\\'")}');"><div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;opacity:0.8;"><span>${mTitle}</span><span style="background:rgba(16,185,129,0.15);color:#10b981;padding:2px 6px;border-radius:4px;font-weight:bold;">▲ +12.3%</span></div><div style="display:flex;align-items:baseline;gap:8px;margin:4px 0;"><span style="font-size:20px;font-weight:800;color:${accent};">${mVal}</span><span style="font-size:10px;opacity:0.6;">${targetStr}</span></div><div style="width:100%;height:4px;background:${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'};border-radius:2px;overflow:hidden;"><div style="width:82%;height:100%;background:#10b981;"></div></div></div>\n`;
        } else if (t === 'activity_feed') {
            const rawItems = text || 'Alice deployed v1.4 (2m ago), Bob pushed fix (15m ago), Charlie opened PR #42 (1h ago)';
            const items = rawItems.split(',').map((s: string) => s.trim());
            const afRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${afRadius}padding:8px 10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,0.2);color:${color};"><div style="font-weight:700;font-size:11px;color:${accent};border-bottom:1px solid ${border};padding-bottom:4px;display:flex;align-items:center;gap:6px;"><span>⚡</span><span>${c.caption || 'Activity Stream'}</span></div><div style="display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;">${items.map((it: string) => {
                const initial = it.charAt(0).toUpperCase();
                return `<div onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${it.replace(/'/g, "\\'")}');" style="display:flex;align-items:center;gap:8px;font-size:10px;cursor:pointer;"><div style="width:20px;height:20px;border-radius:50%;background:${accent};color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:9px;flex-shrink:0;">${initial}</div><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it}</span></div>`;
            }).join('')}</div></div>\n`;
        } else if (t === 'file_tree_tabs') {
            const rawFiles = text || '⚡ index.ts*, 📄 API.md, 🎨 styles.css';
            const files = rawFiles.split(',').map((s: string) => s.trim());
            const ftRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const customHandler = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg !== 'transparent' ? cbg : (isLight ? '#e2e8f0' : '#090d16')};${defBorder}${ftRadius}padding:0 4px;gap:2px;overflow-x:auto;">${files.map((file: string, idx: number) => {
                const isSel = idx === 0;
                return `<div style="padding:4px 10px;background:${isSel ? (isLight ? '#ffffff' : '#1e293b') : 'transparent'};border-radius:4px 4px 0 0;font-size:11px;font-weight:${isSel ? '700' : 'normal'};color:${isSel ? accent : color};display:flex;align-items:center;gap:6px;cursor:pointer;border-bottom:${isSel ? `2px solid ${accent}` : 'none'};" onclick="const fn=window['${customHandler}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fn)fn('${file}');"><span>${file}</span><span style="font-size:9px;opacity:0.5;" onclick="event.stopPropagation();this.parentNode.style.display='none';">✕</span></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'form_checkbox') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><label style="display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="checkbox" ${c.checked ? 'checked' : ''}${disabled}${reqAttr}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${c.placeholder || 'Enable option toggle'}</label></div>\n`;
        } else if (t === 'form_radio') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><label style="display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="radio" ${c.checked ? 'checked' : ''}${disabled}${reqAttr}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${c.placeholder || 'Select option'}</label></div>\n`;
        } else if (t === 'form_search') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><div style="display:flex;align-items:center;gap:6px;background:${cbg};${defBorder}${defRadius}padding:0 8px;height:32px;"><span style="opacity:0.6;font-size:13px;">🔍</span><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="search" value="" placeholder="${c.placeholder || 'Search records...'}"${disabled}${roAttr}${ev} style="flex:1;background:none;border:none;color:${color};outline:none;font-size:${c.font_size||13}px;width:100%;"></div></div>\n`;
        } else if (t === 'form_color') {
            const hexVal = c.value || '#38bdf8';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><div style="display:flex;align-items:center;gap:8px;"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="color" value="${hexVal}"${disabled}${ev} style="width:36px;height:28px;padding:2px;${defBorder}${defRadius}cursor:${c.cursor||'pointer'};background:${rawCbg};"><span style="font-family:monospace;font-size:12px;opacity:0.9;">${hexVal}</span></div></div>\n`;
        } else if (t === 'form_time') {
            const timeVal = c.value || '09:30';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><div style="display:flex;align-items:center;gap:8px;background:${cbg};${defBorder}${defRadius}padding:0 8px;height:32px;"><span style="font-size:14px;opacity:0.7;">🕒</span><input type="time" value="${timeVal}"${disabled}${roAttr}${ev} style="background:none;border:none;color:inherit;font-family:inherit;font-size:${c.font_size||13}px;outline:none;width:100%;color-scheme:${isLight ? 'light' : 'dark'};"></div></div>\n`;
        } else if (t === 'form_stepper') {
            const stepVal = c.value !== undefined ? c.value : 5;
            const customHandler = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;gap:8px;color:${color};"><span style="font-size:11px;font-weight:700;opacity:0.8;">${text}</span><div style="display:flex;align-items:center;justify-content:space-between;background:${cbg};${defBorder}${defRadius}padding:0 6px;height:32px;min-width:110px;"><button onclick="const s=this.nextElementSibling;const n=parseInt(s.textContent||'0')-1;s.textContent=n;const fn=window['${customHandler}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fn)fn(n);" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color='${accent}';" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${accent};font-size:16px;font-weight:bold;cursor:pointer;line-height:1;user-select:none;transition:all 0.15s;">−</button><span style="font-weight:bold;font-size:12px;padding:0 8px;">${stepVal}</span><button onclick="const s=this.previousElementSibling;const n=parseInt(s.textContent||'0')+1;s.textContent=n;const fn=window['${customHandler}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fn)fn(n);" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color='${accent}';" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${accent};font-size:16px;font-weight:bold;cursor:pointer;line-height:1;user-select:none;transition:all 0.15s;">+</button></div></div>\n`;
        } else if (t === 'form_code') {
            const codeFg = c.font_color && c.font_color !== fg ? c.font_color : '#7dd3fc';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;gap:4px;"><span style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</span><textarea${disabled}${roAttr}${autoFocusAttr}${ev} placeholder="${c.placeholder || '// Enter script code...'}" style="flex:1;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : '#0d1117'};${defBorder}${defRadius}padding:8px;color:${codeFg};font-family:'Fira Code','Courier New',monospace;font-size:${c.font_size||12}px;overflow:auto;margin:0;resize:none;outline:none;white-space:pre;" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'>${c.value || c.code || ''}</textarea></div>\n`;
        } else if (t === 'form_drop_zone') {
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            const customClick = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div id="${c.id}_wrapper"${ctxAttr}${titleAttr} style="${base(c)}display:flex;flex-direction:column;gap:4px;"><span style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</span><div onclick="const fi=document.getElementById('${c.id}_file');if(fi)fi.click();" ondragover="event.preventDefault();" ondrop="event.preventDefault();if(event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0]){const p=event.dataTransfer.files[0].name;const lbl=this.querySelector('.dz-label');if(lbl)lbl.textContent=p;const hid=document.getElementById('${c.id}');if(hid)hid.value=p;const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(p);}" style="flex:1;background:${cbg};border:2px dashed ${accent};${defRadius}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:${color};opacity:0.85;cursor:${c.cursor||'pointer'};"><input type="hidden" id="${c.id}" name="${c.id}" value="${c.value||''}"><input type="file" id="${c.id}_file" style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;const lbl=this.parentNode.querySelector('.dz-label');if(lbl)lbl.textContent=p;const hid=document.getElementById('${c.id}');if(hid)hid.value=p;const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(p);const fnK=window['${customClick}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK(p);}"><span style="font-size:20px;">📥</span><span class="dz-label" style="font-size:11px;">${c.placeholder || 'Drop files here or click to browse'}</span></div></div>\n`;
        } else if (t === 'tabs') {
            const tabItems = (text || 'General, Security, Advanced').split(',').map((tb: string) => tb.trim());
            const activeTab = c.value || tabItems[0] || '';
            const customHandler = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div${id}${titleAttr} data-value="${activeTab}" style="${base(c)}display:flex;align-items:center;background:${cbg !== 'transparent' ? cbg : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)')};border-bottom:2px solid ${border};padding:0 4px;gap:2px;">${tabItems.map((tb: string, idx: number) => {
                const isSel = tb === activeTab || (idx === 0 && !c.value);
                return `<button onclick="this.parentNode.querySelectorAll('button').forEach(b=>{b.style.borderBottom='none';b.style.color='${color}';b.style.fontWeight='normal'});this.style.borderBottom='2px solid ${accent}';this.style.color='${accent}';this.style.fontWeight='700';this.parentNode.dataset.value='${tb}';const fn=window['${customHandler}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fn)fn('${tb}');" style="height:100%;padding:0 14px;background:none;border:none;border-bottom:${isSel ? `2px solid ${accent}` : 'none'};color:${isSel ? accent : color};font-weight:${isSel ? '700' : 'normal'};font-size:12px;cursor:pointer;transition:all 0.15s;">${tb}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'menu_bar') {
            const rawMenus = c.items || c.menus || (text ? text.split('|') : ['File', 'Edit', 'View', 'Help']);
            const customClick = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            const mbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const defaultSubMenus: Record<string, string[]> = {
                'File': ['📄 New File  ⌘N', '📂 Open...  ⌘O', '💾 Save  ⌘S', '---', '🚪 Exit  ⌘Q'],
                'Edit': ['↩️ Undo  ⌘Z', '↪️ Redo  ⌘⇧Z', '---', '✂️ Cut  ⌘X', '📋 Copy  ⌘C', '📄 Paste  ⌘V'],
                'View': ['🔍 Zoom In  ⌘+', '🔎 Zoom Out  ⌘-', '🔄 Reset Zoom  ⌘0', '---', '🖥️ Fullscreen  ⌃⌘F'],
                'Run': ['▶️ Start Debugging  F5', '⚡ Run Without Debugging  ⌃F5', '🔄 Restart  ⌘⇧F5'],
                'Tools': ['⌨️ Command Palette...  ⌘⇧P', '⚙️ Preferences...  ⌘,', '---', '🩺 Diagnostics'],
                'Help': ['📖 Documentation', '⌨️ Keyboard Shortcuts', '---', 'ℹ️ About Bun RAD Studio']
            };

            const menus = (Array.isArray(rawMenus) ? rawMenus : [rawMenus]).map((m: any) => {
                if (typeof m === 'string') {
                    const parts = m.split(':');
                    const label = (parts[0] || '').trim() || 'Menu';
                    const items = parts[1] ? parts[1].split(',').map((s: string) => s.trim()) : (defaultSubMenus[label] || ['Action 1', 'Action 2']);
                    return { label, items };
                }
                return { label: m.label || 'Menu', items: m.items || defaultSubMenus[m.label] || ['Item 1', 'Item 2'] };
            });

            controls += `<div id="${c.id}" class="rad-menu-bar" style="${base(c)}display:flex;align-items:center;background:${cbg !== 'transparent' ? cbg : (isLight ? '#f1f5f9' : '#1e293b')};${defBorder}${mbRadius}padding:0 6px;gap:2px;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${menus.map((m: any) => {
                return `<div class="menu-bar-item" style="position:relative;display:inline-block;" onmouseleave="const dd=this.querySelector('.menu-dropdown');if(dd)dd.style.display='none';"><button type="button" onclick="event.stopPropagation();document.querySelectorAll('.menu-dropdown').forEach(d=>{if(d!==this.nextElementSibling)d.style.display='none'});const dd=this.nextElementSibling;if(dd)dd.style.display=dd.style.display==='block'?'none':'block';" onmouseenter="const anyOpen=Array.from(document.querySelectorAll('.menu-dropdown')).some(d=>d.style.display==='block');if(anyOpen){document.querySelectorAll('.menu-dropdown').forEach(d=>d.style.display='none');const dd=this.nextElementSibling;if(dd)dd.style.display='block';}" style="padding:5px 10px;background:transparent;border:none;border-radius:4px;color:${color};font-size:12px;font-weight:600;cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}'" onmouseout="this.style.background='transparent'">${m.label}</button><div class="menu-dropdown" style="display:none;position:absolute;left:0;top:100%;min-width:190px;background:${isLight ? '#ffffff' : '#1e293b'};border:1px solid ${border};border-radius:8px;padding:6px;box-shadow:0 12px 28px rgba(0,0,0,0.4);z-index:99999;backdrop-filter:blur(12px);">${(m.items || []).map((it: string) => {
                    if (it === '---') return `<div style="height:1px;background:${border};margin:4px 0;"></div>`;
                    const parts = it.split(/\s{2,}/);
                    const itLabel = parts[0] || it;
                    const itShortcut = parts[1] || '';
                    return `<div class="menu-dropdown-item" style="padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${color};cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background='${isLight ? 'rgba(2,132,199,0.12)' : 'rgba(56,189,248,0.18)'}'" onmouseout="this.style.background=''" onclick="event.stopPropagation();this.closest('.menu-dropdown').style.display='none';if(window.showInteractionToast)window.showInteractionToast('Menu Bar Action','${m.label} > ${itLabel.replace(/'/g, "\\'")}');const fn=window['${customClick}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${m.label} > ${itLabel.replace(/'/g, "\\'")}');"><span>${itLabel}</span>${itShortcut ? `<span class="rad-mono" style="font-size:10px;opacity:0.5;">${itShortcut}</span>` : ''}</div>`;
                }).join('')}</div></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'tool_bar') {
            const barItems = (text || '📄 New, 📂 Open, 💾 Save, ⚙️ Settings, 🔍 Search').split(',').map((item: string) => item.trim());
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;background:${cbg !== 'transparent' ? cbg : (isLight ? '#f1f5f9' : '#1e293b')};${defBorder}${defRadius}padding:0 8px;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${barItems.map((item: string) => `<button style="height:28px;padding:0 10px;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${color};font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;" onmouseover="this.style.background='${isLight ? 'rgba(2,132,199,0.15)' : 'rgba(56,189,248,0.2)'}'" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)'}'" onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${item.replace(/'/g, "\\'")}');">${item}</button>`).join('')}</div>\n`;
        } else if (t === 'status_bar') {
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg !== 'transparent' ? cbg : (isLight ? '#e2e8f0' : '#090d16')};border-top:1px solid ${border};padding:0 12px;font-size:11px;color:${color};"><div style="display:flex;align-items:center;gap:8px;"><span style="color:#10b981;font-weight:bold;">🟢 Ready</span><span style="opacity:0.4;">|</span><span>${text || 'UTF-8 | Line 1, Col 1'}</span></div><div style="display:flex;align-items:center;gap:8px;opacity:0.75;"><span>Bun RAD v1.3</span><span>100%</span></div></div>\n`;
        } else if (t === 'split_pane') {
            const parts = (text || 'Navigation Sidebar | Main Detail Area').split('|');
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;background:${cbg !== 'transparent' ? cbg : (isLight ? '#f8fafc' : '#0f172a')};${defBorder}${defRadius}overflow:hidden;"><div style="flex:1;padding:8px 12px;font-size:11px;color:${color};background:${isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)'};overflow:auto;"><div style="font-weight:700;color:${accent};margin-bottom:4px;">Left Pane</div><div>${parts[0].trim()}</div></div><div style="width:4px;background:${accent};cursor:col-resize;opacity:0.75;flex-shrink:0;"></div><div style="flex:2;padding:8px 12px;font-size:11px;color:${color};overflow:auto;"><div style="font-weight:700;color:${accent};margin-bottom:4px;">Main Area</div><div>${parts[1] ? parts[1].trim() : 'Detail content panel'}</div></div></div>\n`;
        } else if (t === 'pagination') {
            const curPage = Number(c.value) || 1;
            const pagId = c.id;
            const pagInactBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
            const pagActiveBg = accent;

            const updateJs = (pageExpr: string) => `
                var p=this.parentNode;
                var targetP=${pageExpr};
                p.dataset.page=String(targetP);
                p.querySelectorAll('button[data-pag-num]').forEach(function(b){
                    var sel=b.dataset.pagNum===String(targetP);
                    b.dataset.active=sel?'true':'false';
                    b.style.background=sel?'${pagActiveBg}':'${pagInactBg}';
                    b.style.color=sel?'#ffffff':'inherit';
                    b.style.fontWeight=sel?'bold':'normal';
                    b.style.border=sel?'none':'1px solid ${border}';
                });
                if(window['${pagId}_onChange']) window['${pagId}_onChange'](targetP);
                else if(window['on_${pagId}_change']) window['on_${pagId}_change'](targetP);
                if(window['${pagId}_onClick']) window['${pagId}_onClick'](targetP);
                else if(window['on_${pagId}_click']) window['on_${pagId}_click'](targetP);
            `.replace(/\s+/g, ' ').trim();

            const makePageBtn = (n: number) => {
                const isActive = curPage === n;
                return `<button data-pag-num="${n}" data-active="${isActive ? 'true' : 'false'}" onclick="${updateJs(String(n))}" style="padding:4px 10px;background:${isActive ? pagActiveBg : pagInactBg};border:${isActive ? 'none' : '1px solid ' + border};border-radius:4px;color:${isActive ? '#fff' : 'inherit'};font-weight:${isActive ? 'bold' : 'normal'};cursor:pointer;transition:all 0.15s;">${n}</button>`;
            };

            const prevJs = updateJs("Math.max(1, parseInt(this.parentNode.dataset.page||'1', 10) - 1)");
            const nextJs = updateJs("Math.min(this.parentNode.querySelectorAll('button[data-pag-num]').length||3, parseInt(this.parentNode.dataset.page||'1', 10) + 1)");

            controls += `<div${id}${titleAttr} data-page="${curPage}" style="${base(c)}display:flex;align-items:center;justify-content:center;gap:4px;color:${color};font-size:12px;"><button onclick="${prevJs}" style="padding:4px 8px;background:${pagInactBg};border:1px solid ${border};border-radius:4px;color:inherit;cursor:pointer;transition:all 0.15s;">« Prev</button>${makePageBtn(1)}${makePageBtn(2)}${makePageBtn(3)}<button onclick="${nextJs}" style="padding:4px 8px;background:${pagInactBg};border:1px solid ${border};border-radius:4px;color:inherit;cursor:pointer;transition:all 0.15s;">Next »</button></div>\n`;
        } else if (t === 'command_palette') {
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;gap:8px;background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};border:1px solid ${accent};${defRadius}padding:0 12px;box-shadow:0 4px 16px rgba(0,0,0,0.3);color:${color};"><span style="font-size:14px;color:${accent};">⌘</span><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" placeholder="${c.placeholder || 'Type a command or search actions...'}" value="${text || ''}" style="flex:1;background:none;border:none;color:inherit;font-family:inherit;font-size:12px;outline:none;" ${disabled}${roAttr}><span style="font-size:10px;font-weight:700;background:${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'};padding:2px 6px;border-radius:4px;opacity:0.8;">ESC</span></div>\n`;
        } else if (t === 'toggle_button') {
            const isChecked = c.checked;
            controls += `<button id="${c.id}" ${titleAttr}${ev}${disabled} style="${base(c)}background:${isChecked ? accent : (cbg !== 'transparent' ? cbg : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'))};color:${isChecked ? '#ffffff' : color};${defBorder}${defRadius}font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;cursor:${c.cursor||'pointer'};" onclick="const isChk=this.dataset.checked==='true';this.dataset.checked=!isChk;this.style.background=!isChk?'${accent}':'${cbg !== 'transparent' ? cbg : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)')}';this.style.color=!isChk?'#ffffff':'${color}';if(window['${c.id}_onChange'])window['${c.id}_onChange'](!isChk);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](!isChk);" data-checked="${isChecked ? 'true' : 'false'}">${isChecked ? '🔒 Locked' : (text || '🔓 Unlocked')}</button>\n`;
        } else if (t === 'search_field') {
            const curVal = c.value !== undefined ? String(c.value) : (text || '');
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            const customClick = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div id="${c.id}_wrapper" class="search-field-wrapper"${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};color:${color};${defBorder}border-radius:20px;padding:0 12px;gap:8px;"><span style="font-size:13px;opacity:0.6;">🔍</span><input id="${c.id}" name="${c.id}" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="search" value="${curVal}" placeholder="${c.placeholder || 'Search...'}"${disabled}${roAttr} style="flex:1;background:none;border:none;color:${color};outline:none;font-size:${c.font_size||13}px;" oninput="const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" onkeydown="if(event.key==='Enter'){const fnK=window['${customClick}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK(this.value);}">${curVal ? `<button type="button" onclick="const inp=document.getElementById('${c.id}');if(inp){inp.value='';inp.dispatchEvent(new Event('input'));inp.dispatchEvent(new Event('change'));}" style="background:none;border:none;color:${color};opacity:0.5;cursor:pointer;font-size:12px;">✕</button>` : ''}</div>\n`;
        } else if (t === 'token_field' || t === 'tag_input') {
            const rawTokens = c.tags || c.tokens || (text ? text.split(',') : ['tag1', 'tag2']);
            const tokenArr = Array.isArray(rawTokens) ? rawTokens : String(rawTokens).split(',').map((s: string) => s.trim()).filter(Boolean);
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;flex-wrap:wrap;gap:6px;background:${cbg};color:${color};${defBorder}${defRadius}padding:4px 8px;overflow-y:auto;"><input type="hidden" id="${c.id}" name="${c.id}" value="${tokenArr.join(',')}"><div class="token-list" style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:6px;">${tokenArr.map((tok: string) => `<span class="token-chip" style="background:${isLight ? 'rgba(2,132,199,0.12)' : 'rgba(56,189,248,0.15)'};color:${accent};border:1px solid ${border};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${tok}<span onclick="const chip=this.parentNode;const cont=chip.closest('[id]');chip.remove();const all=Array.from(cont.querySelectorAll('.token-chip')).map(c=>c.textContent.replace('✕','').trim());const hid=document.getElementById('${c.id}');if(hid)hid.value=all.join(',');const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(all.join(','));" style="cursor:pointer;opacity:0.6;font-size:10px;">✕</span></span>`).join('')}</div><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" placeholder="${c.placeholder || '+ Add...'}" onkeydown="if(event.key==='Enter'&&this.value.trim()){event.preventDefault();const val=this.value.trim();const list=this.previousElementSibling;const span=document.createElement('span');span.className='token-chip';span.style.cssText='background:${isLight ? 'rgba(2,132,199,0.12)' : 'rgba(56,189,248,0.15)'};color:${accent};border:1px solid ${border};border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;';span.innerHTML=val+'<span style=\\&quot;cursor:pointer;opacity:0.6;font-size:10px;\\&quot; onclick=\\&quot;const chip=this.parentNode;const cont=chip.closest(\\'[id]\\');chip.remove();const all=Array.from(cont.querySelectorAll(\\'.token-chip\\')).map(c=>c.textContent.replace(\\'✕\\',\\'\\').trim());const hid=document.getElementById(\\''+'${c.id}'+'\\');if(hid)hid.value=all.join(\\',\\');const fnC=window[\\''+'${customChange}'+'\\']||window[\\''+'${c.id}'+'_onChange\\']||window[\\'on_'+'${c.id}'+'_change\\'];if(fnC)fnC(all.join(\\',\\'));\\&quot;>✕</span>';list.appendChild(span);this.value='';const all=Array.from(list.querySelectorAll('.token-chip')).map(c=>c.textContent.replace('✕','').trim());const hid=document.getElementById('${c.id}');if(hid)hid.value=all.join(',');const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(all.join(','));}" style="flex:1;min-width:60px;background:none;border:none;color:${color};outline:none;font-size:11px;"></div>\n`;
        } else if (t === 'masked_input') {
            const mask = c.mask || '(999) 999-9999';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_wrapper" class="rad-masked-input-wrapper"${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;gap:8px;"><input id="${c.id}" name="${c.id}" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" value="${text}" placeholder="${mask}"${disabled}${roAttr} oninput="const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" style="flex:1;background:none;border:none;color:${color};outline:none;font-family:monospace;font-size:${c.font_size||13}px;letter-spacing:1px;"><span style="font-size:10px;opacity:0.6;font-family:monospace;color:${color};">${mask}</span></div>\n`;
        } else if (t === 'inline_editable_label') {
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} class="rad-editable-label-container" data-theme-label="true" title="Double-click to edit" ondblclick="const span=this.querySelector('.label-display');const inp=document.getElementById('${c.id}');span.style.display='none';inp.style.display='block';inp.focus();inp.select();" style="${base(c)}display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:0 10px;box-sizing:border-box;"><div class="label-display" data-theme-label="true" style="font-size:${c.font_size||13}px;font-weight:600;display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;"><span class="label-text" style="color:${color};font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${text || 'Click to edit text'}</span><span class="rad-editable-badge" style="font-size:10px;font-weight:700;color:${accent};">✎ EDIT</span></div><input id="${c.id}" name="${c.id}" class="rad-editable-input" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" value="${text}" onblur="const span=this.previousElementSibling;span.querySelector('.label-text').textContent=this.value;span.style.display='flex';this.style.display='none';const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.value=this.previousElementSibling.querySelector('.label-text').textContent;this.blur();}" style="display:none;width:100%;padding:3px 8px;outline:none;font-size:${c.font_size||13}px;font-weight:600;"></div>\n`;
        } else if (t === 'section_header') {
            const subtitle = c.subtitle || c.caption || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid ${border};padding-bottom:6px;"><div style="font-size:16px;font-weight:800;color:${accent};letter-spacing:-0.2px;">${text}</div>${subtitle ? `<div style="font-size:11px;color:${color};opacity:0.7;margin-top:2px;">${subtitle}</div>` : ''}</div>\n`;
        } else if (t === 'hotkey_badge') {
            const keys = (c.shortcut || text || '⌘K').split(/\s+|\+/).filter(Boolean);
            const rawDesc = c.description || '';
            const hasDesc = Boolean(rawDesc && rawDesc !== text && !keys.includes(rawDesc));
            const justify = hasDesc ? 'space-between' : 'center';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:${justify};gap:6px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 8px;box-sizing:border-box;white-space:nowrap;overflow:hidden;">${hasDesc ? `<span style="font-size:11px;font-weight:600;opacity:0.85;white-space:nowrap;">${rawDesc}</span>` : ''}<div style="display:inline-flex;align-items:center;gap:3px;flex-shrink:0;">${keys.map((k: string) => `<kbd class="rad-mono" style="background:${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'};border:1px solid ${border};border-radius:4px;padding:2px 5px;font-size:10px;font-weight:700;color:${accent};line-height:1.2;">${k}</kbd>`).join('')}</div></div>\n`;
        } else if (t === 'link') {
            const url = c.url || c.placeholder || '#';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;"><a href="${url}"${ev} target="_blank" style="color:${accent};text-decoration:none;font-size:${c.font_size||13}px;font-weight:600;display:inline-flex;align-items:center;gap:4px;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'"><span>🔗</span><span>${text || url}</span></a></div>\n`;
        } else if (t === 'banner' || t === 'status_banner') {
            const bStyle = c.style || c.alert_type || c.banner_style || 'info';
            const bCol = bStyle === 'error' ? '#ef4444' : (bStyle === 'warning' ? '#f59e0b' : (bStyle === 'success' ? '#10b981' : accent));
            const bIcon = bStyle === 'error' ? '❌' : (bStyle === 'warning' ? '⚠️' : (bStyle === 'success' ? '✅' : 'ℹ️'));
            const bRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const subtitle = c.message || c.caption || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : (bCol + '18')};border-left:4px solid ${bCol};border-top:1px solid ${border};border-right:1px solid ${border};border-bottom:1px solid ${border};${bRadius}display:flex;align-items:center;gap:12px;padding:0 14px;color:${color};"><span style="font-size:16px;">${bIcon}</span><div style="display:flex;flex-direction:column;min-width:0;"><span style="font-size:12px;font-weight:700;color:${color};">${text}</span>${subtitle ? `<span style="font-size:11px;opacity:0.8;color:${color};margin-top:1px;">${subtitle}</span>` : ''}</div></div>\n`;
        } else if (t === 'info_callout') {
            const bCol = c.alert_type === 'success' ? '#10b981' : (c.alert_type === 'warning' ? '#f59e0b' : accent);
            const btnText = c.button_text || 'Learn More';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-left:4px solid ${bCol};border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px;color:${color};"><div style="display:flex;align-items:center;gap:10px;min-width:0;"><span style="font-size:20px;">💡</span><div style="display:flex;flex-direction:column;"><span style="font-weight:800;font-size:13px;color:${bCol};">${text || 'Callout Title'}</span><span style="font-size:11px;opacity:0.8;margin-top:2px;">${c.message || c.caption || 'Important callout details and guidance for the user.'}</span></div></div>${btnText ? `<button style="padding:6px 12px;background:${bCol};color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;">${btnText}</button>` : ''}</div>\n`;
        } else if (t === 'hero_banner') {
            const heroGrad = c.gradient_style || `linear-gradient(135deg, ${accent}22 0%, #1e1b4b 100%)`;
            const hTitle = c.caption || text || 'Hero Title';
            const hSubtitle = c.caption ? (c.subtitle || text || '') : (c.subtitle || '');
            const heroBtn = c.placeholder || c.button_text || 'Get Started';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${heroGrad};border:1px solid ${border};border-radius:12px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;color:${color};box-shadow:0 8px 24px rgba(0,0,0,0.3);"><div style="display:flex;flex-direction:column;gap:4px;min-width:0;"><div style="font-size:18px;font-weight:800;color:${accent};letter-spacing:-0.3px;">${hTitle}</div><div style="font-size:12px;opacity:0.85;max-width:560px;">${hSubtitle}</div></div>${heroBtn ? `<button type="button" onclick="const fnK=window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK('${heroBtn.replace(/'/g, "\\'")}');" style="padding:8px 18px;background:${accent};color:#ffffff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px ${accent}44;flex-shrink:0;">${heroBtn}</button>` : ''}</div>\n`;
        } else if (t === 'image_button') {
            const sym = c.symbol || '🚀';
            controls += `<button${id}${titleAttr}${ev}${disabled} style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-weight:600;font-size:12px;padding:0 12px;" onmouseover="this.style.filter='brightness(1.15)'" onmouseout="this.style.filter=''"><span style="font-size:14px;">${sym}</span><span>${text}</span></button>\n`;
        } else if (t === 'help_button') {
            controls += `<button${id}${titleAttr}${ev}${disabled} style="${base(c)}background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};color:${color};border:1px solid ${border};border-radius:50%;width:${c.width||26}px;height:${c.height||26}px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;cursor:pointer;opacity:0.85;" title="${c.tooltip || text || 'Help & Documentation'}" onmouseover="this.style.opacity='1';this.style.borderColor='${accent}';" onmouseout="this.style.opacity='0.85';this.style.borderColor='${border}';">?</button>\n`;
        } else if (t === 'badge_button') {
            const count = c.count !== undefined ? c.count : 3;
            const bCol = c.badge_color || '#ef4444';
            controls += `<button${id}${titleAttr}${ev}${disabled} style="${base(c)}position:relative;background:${cbg};color:${color};${defBorder}${defRadius}display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-weight:700;font-size:12px;padding:0 14px;"><span>${text}</span><span style="background:${bCol};color:#ffffff;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:800;box-shadow:0 1px 3px rgba(0,0,0,0.3);">${count}</span></button>\n`;
        } else if (t === 'quick_action_bar') {
            const rawActs = c.items || c.actions || (text ? text.split(',') : ['⚡ Run', '💾 Save', '🔄 Sync', '⚙️ Options']);
            const actions = Array.isArray(rawActs) ? rawActs : String(rawActs).split(',').map((s: string) => s.trim());
            const customClick = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div id="${c.id}"${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}${defRadius}padding:3px;gap:4px;">${actions.map((act: any) => {
                const label = typeof act === 'object' && act ? (act.label || act.actionId || '') : String(act);
                const actionId = typeof act === 'object' && act ? (act.actionId || act.label || '') : String(act);
                const icon = typeof act === 'object' && act && act.icon ? act.icon + ' ' : '';
                return `<button type="button" onclick="const fnK=window['${customClick}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK('${actionId.replace(/'/g, "\\'")}');" style="flex:1;height:100%;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};border:none;border-radius:4px;color:${color};font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.15s;" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'}';this.style.color='${color}';">${icon}${label}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'floating_toolbar') {
            const tools = (c.tools || (text ? text.split(',') : ['🔍', '✂️', '📋', '🗑️', '⚙️'])).map((s: string) => s.trim());
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;background:rgba(20,25,35,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.18);border-radius:30px;padding:4px 8px;gap:6px;box-shadow:0 12px 30px rgba(0,0,0,0.5);">${tools.map((tl: string) => `<button onclick="if(window['${c.id}_onClick'])window['${c.id}_onClick']('${tl}');" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#ffffff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;" onmouseover="this.style.background='${accent}';this.style.transform='scale(1.15)';" onmouseout="this.style.background='rgba(255,255,255,0.08)';this.style.transform='scale(1)';">${tl}</button>`).join('')}</div>\n`;
        } else if (t === 'radio_group') {
            const rawOpts = c.items || (text ? text.split(',') : ['Option A', 'Option B', 'Option C']);
            const rOpts = Array.isArray(rawOpts) ? rawOpts : String(rawOpts).split(',').map((s: string) => s.trim());
            const curVal = c.value !== undefined ? String(c.value) : (rOpts[0] || '');
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;gap:16px;color:${color};flex-wrap:wrap;"><input type="hidden" id="${c.id}" name="${c.id}" value="${curVal}">${rOpts.map((opt: string, i: number) => {
                const isSel = opt === curVal || String(i) === curVal;
                return `<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:${c.font_size||12}px;font-weight:500;"><input type="radio" name="${c.id}_group" value="${opt}" ${isSel ? 'checked' : ''} style="accent-color:${accent};cursor:pointer;" onchange="const hid=document.getElementById('${c.id}');if(hid)hid.value='${opt}';const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC('${opt}');"><span>${opt}</span></label>`;
            }).join('')}</div>\n`;
        } else if (t === 'pull_down' || t === 'combo_box') {
            const rawOpts = c.items || c.options || (text ? text.split(',') : ['Default Item', 'Option 1', 'Option 2']);
            const pOpts = Array.isArray(rawOpts) ? rawOpts : String(rawOpts).split(',').map((s: string) => s.trim());
            const curVal = c.value !== undefined ? String(c.value) : (pOpts[0] || '');
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}${defRadius}padding:0 8px;gap:6px;"><input id="${c.id}" name="${c.id}" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" value="${curVal}" placeholder="${c.placeholder || 'Select or type...'}" style="flex:1;background:none;border:none;color:${color};font-size:${c.font_size||13}px;outline:none;" oninput="const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);"><select onchange="const inp=document.getElementById('${c.id}');if(inp){inp.value=this.value;inp.dispatchEvent(new Event('input'));inp.dispatchEvent(new Event('change'));}const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" style="background:none;border:none;color:${color};cursor:pointer;outline:none;width:18px;">${pOpts.map((opt: string) => `<option value="${opt}" ${opt === curVal ? 'selected' : ''}>${opt}</option>`).join('')}</select></div>\n`;
        } else if (t === 'theme_menu' || t === 'mode_control') {
            const rawModes = c.items || c.modes || ['System', 'Dark', 'Light'];
            const modes = Array.isArray(rawModes) ? rawModes : String(rawModes).split(',').map((s: string) => s.trim());
            const curMode = c.value !== undefined ? String(c.value) : (modes[0] || 'Dark');
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}border-radius:20px;padding:2px;gap:2px;"><input type="hidden" id="${c.id}" name="${c.id}" value="${curMode}">${modes.map((m: string) => {
                const isSel = String(m).toLowerCase() === String(curMode).toLowerCase();
                const icon = m.toLowerCase().includes('dark') ? '🌙 ' : (m.toLowerCase().includes('light') ? '☀️ ' : (m.toLowerCase().includes('system') || m.toLowerCase().includes('auto') ? '⚙️ ' : ''));
                return `<button type="button" onclick="this.parentNode.querySelectorAll('button').forEach(b=>{b.style.background='transparent';b.style.color='${color}'});this.style.background='${accent}';this.style.color='#fff';const hid=document.getElementById('${c.id}');if(hid){hid.value='${m}';hid.dispatchEvent(new Event('change'));}const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC('${m}');" style="flex:1;height:100%;border:none;border-radius:18px;background:${isSel ? accent : 'transparent'};color:${isSel ? '#fff' : color};font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.15s;">${icon}${m}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'icon_segments') {
            const rawSyms = c.items || c.symbols || (text ? text.split(',') : ['▦ Grid', '☰ List', '☷ Table']);
            const syms = Array.isArray(rawSyms) ? rawSyms : String(rawSyms).split(',').map((s: string) => s.trim());
            const curIdx = c.selected !== undefined ? c.selected : (typeof c.value === 'number' ? c.value : 0);
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}${defRadius}padding:3px;gap:3px;"><input type="hidden" id="${c.id}" name="${c.id}" value="${curIdx}">${syms.map((sym: any, i: number) => {
                const label = typeof sym === 'object' && sym ? `${sym.icon ? sym.icon + ' ' : ''}${sym.label || ''}` : String(sym);
                const isSel = i === curIdx;
                return `<button type="button" onclick="this.parentNode.querySelectorAll('button').forEach(b=>{b.style.background='transparent';b.style.color='${color}'});this.style.background='${accent}';this.style.color='#fff';const hid=document.getElementById('${c.id}');if(hid){hid.value='${i}';hid.dispatchEvent(new Event('change'));}const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(${i});" style="flex:1;height:100%;border:none;border-radius:6px;background:${isSel ? accent : 'transparent'};color:${isSel ? '#fff' : color};font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">${label}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'pill_toggle') {
            const rawOpts = c.items || c.options || (text ? text.split(',') : ['Enabled', 'Disabled']);
            const opts = Array.isArray(rawOpts) ? rawOpts : String(rawOpts).split(',').map((s: string) => s.trim());
            const curIdx = typeof c.value === 'number' ? c.value : (c.selected !== undefined ? c.selected : (typeof c.value === 'string' ? opts.indexOf(c.value) : 0));
            const activeIdx = curIdx >= 0 ? curIdx : 0;
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}border-radius:24px;padding:3px;gap:2px;"><input type="hidden" id="${c.id}" name="${c.id}" value="${activeIdx}">${opts.map((op: string, idx: number) => {
                const isSel = idx === activeIdx;
                return `<button type="button" onclick="this.parentNode.querySelectorAll('button').forEach(b=>{b.style.background='transparent';b.style.color='${color}'});this.style.background='${accent}';this.style.color='#fff';const hid=document.getElementById('${c.id}');if(hid){hid.value='${idx}';hid.dispatchEvent(new Event('change'));}const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(${idx});" style="flex:1;height:100%;border:none;border-radius:20px;background:${isSel ? accent : 'transparent'};color:${isSel ? '#fff' : color};font-size:11px;font-weight:700;cursor:pointer;">${op}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'tag_cloud') {
            const rawTags = c.tags || (text ? text.split(',') : ['TypeScript', 'Bun', 'macOS', 'GUI', 'Cocoa', 'RAD', 'Desktop']);
            const tags = Array.isArray(rawTags) ? rawTags : String(rawTags).split(',').map((s: string) => s.trim());
            const rawSel = c.selectedTags || c.selected || [];
            const selList = Array.isArray(rawSel) ? rawSel : [rawSel];
            const customClick = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px;overflow-y:auto;"><input type="hidden" id="${c.id}" name="${c.id}" value="${selList.join(',')}">${tags.map((tg: string) => {
                const isSel = selList.includes(tg);
                return `<span class="tag-cloud-item" onclick="this.classList.toggle('selected');const isS=this.classList.contains('selected');this.style.background=isS?'${accent}':'${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color=isS?'#ffffff':'${color}';const cont=this.closest('[id]');const curSel=Array.from(cont.querySelectorAll('.tag-cloud-item.selected')).map(el=>el.textContent.replace('#','').trim());const hid=document.getElementById('${c.id}');if(hid)hid.value=curSel.join(',');const fnK=window['${customClick}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK('${tg}');const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(curSel.join(','));" style="background:${isSel ? accent : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)')};color:${isSel ? '#ffffff' : color};border:1px solid ${border};border-radius:14px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.borderColor='${accent}';" onmouseout="this.style.borderColor='${border}';">#${tg}</span>`;
            }).join('')}</div>\n`;
        } else if (t === 'transfer_list') {
            const rawAvail = c.leftItems || c.available || ['Alpha', 'Beta', 'Gamma', 'Delta'];
            const rawSel = c.rightItems || c.selected || ['Epsilon'];
            const avail = Array.isArray(rawAvail) ? rawAvail : String(rawAvail).split(',').map((s: string) => s.trim());
            const sel = Array.isArray(rawSel) ? rawSel : String(rawSel).split(',').map((s: string) => s.trim());
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            const leftTitle = c.leftTitle || c.left_title || 'Available';
            const rightTitle = c.rightTitle || c.right_title || 'Selected';
            const btnBg = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';
            const btnHoverBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
            const itemSelBg = isLight ? 'rgba(2,132,199,0.18)' : 'rgba(56,189,248,0.22)';
            const itemSelBorder = `1px solid ${accent}`;

            const syncScript = `<script>window['${c.id}_sync']=function(){const cont=document.getElementById('${c.id}_container');if(!cont)return;const availItems=cont.querySelector('.transfer-avail-items');const selItems=cont.querySelector('.transfer-sel-items');const curAvail=Array.from(availItems.querySelectorAll('.transfer-item')).map(el=>el.textContent.trim());const curSel=Array.from(selItems.querySelectorAll('.transfer-item')).map(el=>el.textContent.trim());const availCount=cont.querySelector('.transfer-avail-count');if(availCount)availCount.textContent=String(curAvail.length);const selCount=cont.querySelector('.transfer-sel-count');if(selCount)selCount.textContent=String(curSel.length);const hidSel=document.getElementById('${c.id}');if(hidSel)hidSel.value=curSel.join(',');const hidAvail=document.getElementById('${c.id}_available');if(hidAvail)hidAvail.value=curAvail.join(',');const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(curSel,curAvail);};</script>`;

            const moveItemDblClick = `const cont=this.closest('.transfer-container');const inAvail=this.closest('.transfer-avail');const target=inAvail?cont.querySelector('.transfer-sel-items'):cont.querySelector('.transfer-avail-items');this.classList.remove('selected');this.style.background='transparent';this.style.borderColor='transparent';target.appendChild(this);if(window['${c.id}_sync'])window['${c.id}_sync']();`;

            controls += `<div id="${c.id}_container" class="transfer-container"${titleAttr} style="${base(c)}display:flex;align-items:stretch;gap:8px;color:${color};"><input type="hidden" id="${c.id}" name="${c.id}" value="${sel.join(',')}"><input type="hidden" id="${c.id}_available" name="${c.id}_available" value="${avail.join(',')}"><div class="transfer-avail" style="flex:1;height:100%;min-height:0;background:${cbg};${defBorder}${defRadius}display:flex;flex-direction:column;font-size:11px;overflow:hidden;"><div style="font-weight:700;color:${accent};padding:6px 10px;border-bottom:1px solid ${border};display:flex;justify-content:space-between;align-items:center;background:${isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)'};"><span>${leftTitle}</span><span class="transfer-avail-count" style="background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};padding:1px 6px;border-radius:10px;font-size:10px;">${avail.length}</span></div><div class="transfer-avail-items" style="flex:1;overflow-y:auto;padding:4px;display:flex;flex-direction:column;gap:2px;">${avail.map((a: string) => `<div class="transfer-item" title="Click to select, double-click to transfer" ondblclick="${moveItemDblClick}" onclick="this.classList.toggle('selected');const isS=this.classList.contains('selected');this.style.background=isS?'${itemSelBg}':'transparent';this.style.border=isS?'${itemSelBorder}':'1px solid transparent';" style="padding:4px 8px;border-radius:4px;cursor:pointer;border:1px solid transparent;transition:all 0.12s;user-select:none;">${a}</div>`).join('')}</div></div><div class="transfer-buttons" style="display:flex;flex-direction:column;justify-content:center;gap:4px;"><button type="button" title="Move Selected to ${rightTitle}" onclick="const cont=this.closest('.transfer-container');const availList=cont.querySelector('.transfer-avail-items');const selList=cont.querySelector('.transfer-sel-items');const toMove=availList.querySelectorAll('.transfer-item.selected');toMove.forEach(el=>{el.classList.remove('selected');el.style.background='transparent';el.style.border='1px solid transparent';selList.appendChild(el);});if(window['${c.id}_sync'])window['${c.id}_sync']();" style="width:32px;height:26px;padding:0;background:${accent};color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.filter='brightness(1.15)'" onmouseout="this.style.filter=''">›</button><button type="button" title="Move All to ${rightTitle}" onclick="const cont=this.closest('.transfer-container');const availList=cont.querySelector('.transfer-avail-items');const selList=cont.querySelector('.transfer-sel-items');const toMove=availList.querySelectorAll('.transfer-item');toMove.forEach(el=>{el.classList.remove('selected');el.style.background='transparent';el.style.border='1px solid transparent';selList.appendChild(el);});if(window['${c.id}_sync'])window['${c.id}_sync']();" style="width:32px;height:26px;padding:0;background:${btnBg};color:${color};border:1px solid ${border};border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background='${btnHoverBg}'" onmouseout="this.style.background='${btnBg}'">»</button><button type="button" title="Move Selected to ${leftTitle}" onclick="const cont=this.closest('.transfer-container');const availList=cont.querySelector('.transfer-avail-items');const selList=cont.querySelector('.transfer-sel-items');const toMove=selList.querySelectorAll('.transfer-item.selected');toMove.forEach(el=>{el.classList.remove('selected');el.style.background='transparent';el.style.border='1px solid transparent';availList.appendChild(el);});if(window['${c.id}_sync'])window['${c.id}_sync']();" style="width:32px;height:26px;padding:0;background:${btnBg};color:${color};border:1px solid ${border};border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background='${btnHoverBg}'" onmouseout="this.style.background='${btnBg}'">‹</button><button type="button" title="Move All to ${leftTitle}" onclick="const cont=this.closest('.transfer-container');const availList=cont.querySelector('.transfer-avail-items');const selList=cont.querySelector('.transfer-sel-items');const toMove=selList.querySelectorAll('.transfer-item');toMove.forEach(el=>{el.classList.remove('selected');el.style.background='transparent';el.style.border='1px solid transparent';availList.appendChild(el);});if(window['${c.id}_sync'])window['${c.id}_sync']();" style="width:32px;height:26px;padding:0;background:${btnBg};color:${color};border:1px solid ${border};border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;display:flex;align-items:center;justify-content:center;" onmouseover="this.style.background='${btnHoverBg}'" onmouseout="this.style.background='${btnBg}'">«</button></div><div class="transfer-sel" style="flex:1;height:100%;min-height:0;background:${cbg};${defBorder}${defRadius}display:flex;flex-direction:column;font-size:11px;overflow:hidden;"><div style="font-weight:700;color:#10b981;padding:6px 10px;border-bottom:1px solid ${border};display:flex;justify-content:space-between;align-items:center;background:${isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)'};"><span>${rightTitle}</span><span class="transfer-sel-count" style="background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};padding:1px 6px;border-radius:10px;font-size:10px;">${sel.length}</span></div><div class="transfer-sel-items" style="flex:1;overflow-y:auto;padding:4px;display:flex;flex-direction:column;gap:2px;">${sel.map((s: string) => `<div class="transfer-item" title="Click to select, double-click to transfer" ondblclick="${moveItemDblClick}" onclick="this.classList.toggle('selected');const isS=this.classList.contains('selected');this.style.background=isS?'${itemSelBg}':'transparent';this.style.border=isS?'${itemSelBorder}':'1px solid transparent';" style="padding:4px 8px;border-radius:4px;cursor:pointer;border:1px solid transparent;transition:all 0.12s;user-select:none;">${s}</div>`).join('')}</div></div></div>\n${syncScript}\n`;
        } else if (t === 'vertical_slider') {
            const val = c.value !== undefined ? c.value : 50;
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:${color};"><span style="font-size:11px;font-weight:700;color:${accent};">${val}</span><input id="${c.id}" name="${c.id}" type="range" min="${c.min_value||0}" max="${c.max_value||100}" value="${val}" style="transform:rotate(-90deg);width:${Math.max(60, (c.height||120) - 40)}px;accent-color:${accent};cursor:pointer;" oninput="this.parentNode.querySelector('span').textContent=this.value;const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);"><span style="font-size:10px;opacity:0.6;">${text || 'Vol'}</span></div>\n`;
        } else if (t === 'range_slider') {
            const low = c.low !== undefined ? c.low : 20;
            const high = c.high !== undefined ? c.high : 80;
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:6px;color:${color};"><div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;"><span>${text || 'Range'}</span><span style="color:${accent};">${low} – ${high}</span></div><div style="position:relative;height:6px;background:${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'};border-radius:3px;"><div style="position:absolute;left:${low}%;width:${high - low}%;height:100%;background:${accent};border-radius:3px;"></div></div></div>\n`;
        } else if (t === 'knob') {
            const val = c.value !== undefined ? Number(c.value) : 60;
            const min = c.min_value !== undefined ? Number(c.min_value) : 0;
            const max = c.max_value !== undefined ? Number(c.max_value) : 100;
            const angle = Math.round(((val - min) / (max - min)) * 270 - 135);
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:${color};user-select:none;cursor:ns-resize;" onwheel="event.preventDefault();const inp=document.getElementById('${c.id}');let cur=parseInt(inp.value,10);cur=event.deltaY<0?Math.min(${max},cur+2):Math.max(${min},cur-2);inp.value=cur;this.querySelector('.knob-val').textContent=cur+'%';const ang=Math.round(((cur-${min})/(${max}-${min}))*270-135);this.querySelector('.knob-pointer').style.transform='rotate('+ang+'deg)';const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(cur);" onclick="const inp=document.getElementById('${c.id}');let cur=parseInt(inp.value,10);cur=cur>=${max}?${min}:cur+10;inp.value=cur;this.querySelector('.knob-val').textContent=cur+'%';const ang=Math.round(((cur-${min})/(${max}-${min}))*270-135);this.querySelector('.knob-pointer').style.transform='rotate('+ang+'deg)';const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(cur);"><input type="hidden" id="${c.id}" name="${c.id}" value="${val}"><div style="width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 30% 30%, ${isLight ? '#f1f5f9' : '#334155'}, ${isLight ? '#cbd5e1' : '#0f172a'});border:2px solid ${border};box-shadow:0 4px 10px rgba(0,0,0,0.3);position:relative;display:flex;align-items:center;justify-content:center;"><div class="knob-pointer" style="position:absolute;width:4px;height:12px;background:${accent};border-radius:2px;top:4px;transform-origin:center 18px;transform:rotate(${angle}deg);"></div></div><span class="knob-val" style="font-size:11px;font-weight:800;color:${accent};">${val}%</span></div>\n`;
        } else if (t === 'level_indicator') {
            const val = c.value !== undefined ? c.value : 75;
            const bars = 12;
            const activeBars = Math.round((val / 100) * bars);
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:3px;padding:4px 6px;background:${cbg};${defBorder}${defRadius};">${Array.from({length: bars}).map((_, idx) => {
                const isActive = idx < activeBars;
                const col = idx >= 10 ? '#ef4444' : (idx >= 7 ? '#f59e0b' : '#10b981');
                return `<div style="flex:1;height:100%;background:${isActive ? col : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)')};border-radius:2px;box-shadow:${isActive ? `0 0 4px ${col}` : 'none'};"></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'spinner') {
            const isActive = c.active !== false;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:center;gap:8px;color:${color};">${isActive ? `<svg width="24" height="24" viewBox="0 0 24 24" style="animation:spin 0.8s linear infinite;"><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style><circle cx="12" cy="12" r="10" stroke="${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}" stroke-width="3" fill="none"/><path d="M12 2 A10 10 0 0 1 22 12" stroke="${accent}" stroke-width="3" fill="none" stroke-linecap="round"/></svg>` : ''}${text ? `<span style="font-size:12px;font-weight:600;">${text}</span>` : ''}</div>\n`;
        } else if (t === 'donut_chart') {
            const pct = c.value !== undefined ? Number(c.value) : 68;
            const r = 32; const circ = 2 * Math.PI * r;
            const dash = circ * pct / 100;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:12px;background:${cbg};${defBorder}${defRadius}padding:10px 14px;color:${color};"><svg width="76" height="76" viewBox="0 0 80 80"><circle cx="40" cy="40" r="${r}" fill="none" stroke="${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}" stroke-width="8"/><circle cx="40" cy="40" r="${r}" fill="none" stroke="${accent}" stroke-width="8" stroke-dasharray="${dash.toFixed(1)} ${(circ - dash).toFixed(1)}" stroke-linecap="round" transform="rotate(-90 40 40)"/><text x="40" y="44" text-anchor="middle" font-size="14" font-weight="800" fill="${color}">${pct}%</text></svg><div style="display:flex;flex-direction:column;min-width:0;"><span style="font-size:13px;font-weight:700;color:${color};">${text || 'Progress Metric'}</span><span style="font-size:11px;opacity:0.75;margin-top:2px;">${c.caption || 'Active workload completion'}</span></div></div>\n`;
        } else if (t === 'activity_rings') {
            const pcts = c.percentages || [85, 65, 45];
            const cols = c.colors || ['#ff2d55', '#5856d6', '#00f5d4'];
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:center;"><svg width="90" height="90" viewBox="0 0 100 100">${pcts.map((pct: number, idx: number) => {
                const rad = 38 - (idx * 10);
                const circ = 2 * Math.PI * rad;
                const d = circ * pct / 100;
                const strokeCol = cols[idx % cols.length];
                return `<circle cx="50" cy="50" r="${rad}" fill="none" stroke="${strokeCol}26" stroke-width="7"/><circle cx="50" cy="50" r="${rad}" fill="none" stroke="${strokeCol}" stroke-width="7" stroke-dasharray="${d.toFixed(1)} ${(circ - d).toFixed(1)}" stroke-linecap="round" transform="rotate(-90 50 50)"/>`;
            }).join('')}</svg></div>\n`;
        } else if (t === 'segment_distribution_bar') {
            const labels = c.labels || ['TypeScript (65%)', 'CSS (25%)', 'HTML (10%)'];
            const vals = c.values || [65, 25, 10];
            const segCols = c.colors || ['#3178c6', '#38bdf8', '#e34c26'];
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:6px;color:${color};"><div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;"><span>${text || 'Distribution'}</span><span style="opacity:0.7;">100% total</span></div><div style="display:flex;width:100%;height:10px;border-radius:5px;overflow:hidden;">${vals.map((v: number, i: number) => `<div style="width:${v}%;height:100%;background:${segCols[i % segCols.length]};" title="${labels[i] || ''}"></div>`).join('')}</div><div style="display:flex;gap:12px;font-size:10px;opacity:0.8;flex-wrap:wrap;">${labels.map((l: string, i: number) => `<div style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:50%;background:${segCols[i % segCols.length]};display:inline-block;"></span><span>${l}</span></div>`).join('')}</div></div>\n`;
        } else if (t === 'feedback_mood') {
            const moods = ['😡', '🙁', '😐', '🙂', '🤩'];
            const selMood = c.value || '🙂';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-around;background:${cbg};${defBorder}${defRadius}padding:6px;gap:8px;"><input type="hidden" id="${c.id}" name="${c.id}" value="${selMood}">${moods.map((m: string) => {
                const isSel = m === selMood;
                return `<button type="button" onclick="this.parentNode.querySelectorAll('button').forEach(b=>{b.style.transform='scale(1)';b.style.background='transparent'});this.style.transform='scale(1.3)';this.style.background='${accent}22';const hid=document.getElementById('${c.id}');if(hid){hid.value='${m}';hid.dispatchEvent(new Event('change'));}const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC('${m}');" style="font-size:22px;background:${isSel ? accent + '22' : 'transparent'};border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform 0.15s;transform:${isSel ? 'scale(1.3)' : 'scale(1)'};">${m}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'activity_heatmap') {
            const weeks = c.weeks || 16;
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};${defBorder}${defRadius}padding:10px;display:flex;flex-direction:column;justify-content:space-between;color:${color};"><div style="font-size:11px;font-weight:700;margin-bottom:6px;color:${accent};">${text || 'Contribution Activity'}</div><div style="display:flex;gap:3px;overflow-x:auto;">${Array.from({length: weeks}).map((_, wIdx) => `<div style="display:flex;flex-direction:column;gap:3px;">${Array.from({length: 5}).map((_, dIdx) => {
                const intensity = (wIdx * 3 + dIdx * 2) % 5;
                const heatCol = intensity === 0 ? (isLight ? '#e2e8f0' : '#1e293b') : (intensity === 1 ? '#0e4429' : (intensity === 2 ? '#006d32' : (intensity === 3 ? '#26a641' : '#39d353')));
                return `<div style="width:10px;height:10px;border-radius:2px;background:${heatCol};"></div>`;
            }).join('')}</div>`).join('')}</div></div>\n`;
        } else if (t === 'date_range_picker') {
            const startVal = c.start_date || '2026-07-01';
            const endVal = c.end_date || '2026-07-31';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;background:${cbg};${defBorder}${defRadius}padding:0 8px;color:${color};"><input type="hidden" id="${c.id}" name="${c.id}" value="${startVal} to ${endVal}"><span style="font-size:13px;opacity:0.7;">📅</span><input type="date" value="${startVal}" onchange="const p=this.parentNode;const hid=document.getElementById('${c.id}');const endInp=p.querySelectorAll('input[type=date]')[1];hid.value=this.value+' to '+endInp.value;const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(hid.value);" style="background:none;border:none;color:inherit;outline:none;font-size:11px;color-scheme:${isLight ? 'light' : 'dark'};"><span style="opacity:0.5;">➔</span><input type="date" value="${endVal}" onchange="const p=this.parentNode;const hid=document.getElementById('${c.id}');const startInp=p.querySelectorAll('input[type=date]')[0];hid.value=startInp.value+' to '+this.value;const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(hid.value);" style="background:none;border:none;color:inherit;outline:none;font-size:11px;color-scheme:${isLight ? 'light' : 'dark'};"></div>\n`;
        } else if (t === 'date_time_picker') {
            const dtVal = c.value || '2026-07-27T12:00';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;background:${cbg};${defBorder}${defRadius}padding:0 8px;color:${color};"><span style="font-size:13px;opacity:0.7;">🕒</span><input id="${c.id}" name="${c.id}" type="datetime-local" value="${dtVal}" onchange="const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" style="flex:1;background:none;border:none;color:inherit;outline:none;font-size:12px;color-scheme:${isLight ? 'light' : 'dark'};"></div>\n`;
        } else if (t === 'color_grid') {
            const gridCols = c.colors || ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#0284c7', '#6366f1', '#a855f7', '#ec4899', '#64748b'];
            const curCol = c.value || c.selectedColor || gridCols[0];
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_container"${titleAttr} style="${base(c)}display:grid;grid-template-columns:repeat(5, 1fr);gap:6px;background:${cbg};${defBorder}${defRadius}padding:8px;"><input type="hidden" id="${c.id}" name="${c.id}" value="${curCol}">${gridCols.map((gc: string) => {
                const isSel = gc.toLowerCase() === String(curCol).toLowerCase();
                return `<div class="color-grid-item" onclick="this.parentNode.querySelectorAll('.color-grid-item').forEach(el=>el.style.border='none');this.style.border='2px solid #ffffff';const hid=document.getElementById('${c.id}');if(hid){hid.value='${gc}';hid.dispatchEvent(new Event('change'));}const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC('${gc}');" style="width:100%;height:24px;border-radius:4px;background:${gc};cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:transform 0.1s;border:${isSel ? '2px solid #ffffff' : 'none'};" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'file_picker_field') {
            const pVal = text || c.value || '/Users/codecaine/Documents';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            const customChange = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div id="${c.id}_wrapper"${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}${defRadius}padding:0 8px;gap:8px;color:${color};"><span style="font-size:13px;opacity:0.7;">📂</span><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" id="${c.id}" name="${c.id}" value="${pVal}" placeholder="${c.placeholder || 'Select a file...'}" oninput="const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(this.value);" style="flex:1;background:none;border:none;color:inherit;font-family:monospace;font-size:11px;outline:none;"><input type="file" id="${c.id}_native_file" style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;const inp=document.getElementById('${c.id}');if(inp){inp.value=p;inp.dispatchEvent(new Event('input'));inp.dispatchEvent(new Event('change'));}const fnC=window['${customChange}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fnC)fnC(p);const fnK=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK(p);}"><button type="button" onclick="event.stopPropagation();const inp=document.getElementById('${c.id}');const cur=inp?inp.value:'${pVal}';const fnK=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fnK)fnK(cur);const fi=document.getElementById('${c.id}_native_file');if(fi)fi.click();" style="padding:4px 10px;background:${accent};color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;">${c.button_title || 'Browse...'}</button></div>\n`;
        } else if (t === 'path_control') {
            const parts = (text || 'Root › Users › codecaine › Projects').split('›').map((s: string) => s.trim());
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}${defRadius}padding:0 10px;gap:6px;color:${color};font-size:11px;overflow-x:auto;">${parts.map((prt: string, i: number) => `<span style="cursor:pointer;font-weight:${i === parts.length - 1 ? '700' : 'normal'};color:${i === parts.length - 1 ? accent : color};">${prt}</span>${i < parts.length - 1 ? '<span style="opacity:0.4;">/</span>' : ''}`).join('')}</div>\n`;
        } else if (t === 'html_view' || t === 'browser_view') {
            controls += `<div${id}${titleAttr} class="simplegui-html-view" data-control-type="${t}" style="${base(c)}background:${cbg};${defBorder}${defRadius}padding:12px;overflow:auto;color:${color};font-size:12px;">${text || '<div style="opacity:0.8;">HTML View Canvas</div>'}</div>\n`;
        } else if (t === 'code_editor' || t === 'code_studio') {
            const fileName = c.caption || c.filename || 'app.ts';
            const lang = c.placeholder || c.language || 'typescript';
            const codeVal = c.code || text || '// Bun RAD Studio v1.4\nconsole.log("Hello, World!");';
            controls += `<div${id}${titleAttr} style="${base(c)}background:#0d1117;border:1px solid #30363d;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.4);"><div style="padding:6px 12px;background:#161b22;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#c9d1d9;"><div style="display:flex;align-items:center;gap:6px;"><span style="color:#58a6ff;">📄</span><span style="font-weight:600;">${fileName}</span></div><span style="font-size:10px;background:#21262d;padding:2px 8px;border-radius:4px;color:#79c0ff;font-weight:bold;">${lang}</span></div><textarea spellcheck="false" ${id ? `data-ctrl-id="${c.id}"` : ''} style="flex:1;background:#0d1117;color:#79c0ff;border:none;padding:10px;font-family:'Fira Code',monospace;font-size:12px;line-height:1.5;outline:none;resize:none;margin:0;">${codeVal}</textarea></div>\n`;
        } else if (t === 'diff_view') {
            const oldLines = (c.old_text || '- function hello() {\n-   return false;\n- }').split('\n');
            const newLines = (c.new_text || '+ function hello() {\n+   return true;\n+ }').split('\n');
            controls += `<div${id}${titleAttr} style="${base(c)}background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:8px 12px;overflow:auto;font-family:monospace;font-size:11px;line-height:1.4;"><div style="color:#f85149;margin-bottom:4px;">${oldLines.map((l: string) => `<div>${l}</div>`).join('')}</div><div style="color:#3fb950;">${newLines.map((l: string) => `<div>${l}</div>`).join('')}</div></div>\n`;
        } else if (t === 'terminal_view') {
            const prompt = c.prompt_text || '$ bun run start';
            const logOut = c.output || '[server] listening on http://localhost:3000\n[ready] client connected successfully';
            controls += `<div${id}${titleAttr} style="${base(c)}background:#050505;border:1px solid #2a2a2a;border-radius:8px;padding:10px 12px;font-family:'Fira Code',monospace;font-size:11px;color:#f0fdf4;display:flex;flex-direction:column;gap:6px;overflow:auto;"><div style="color:#38bdf8;font-weight:700;">${prompt}</div><div style="opacity:0.85;white-space:pre-wrap;">${logOut}</div><div style="display:flex;align-items:center;gap:4px;color:#30d158;"><span>$</span><span style="animation:blink 1s infinite;">▌</span></div></div>\n`;
        } else if (t === 'json_tree') {
            const jsonText = c.json || text || '{\n  "name": "bun_rad_studio",\n  "status": "active",\n  "version": 1.4\n}';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};${defBorder}${defRadius}padding:10px;font-family:monospace;font-size:11px;color:${color};overflow:auto;white-space:pre;"><span style="color:${accent};font-weight:bold;">{ JSON Inspector }</span>\n${jsonText}</div>\n`;
        } else if (t === 'audio_waveform') {
            const amps = c.amplitudes || [20, 45, 80, 60, 30, 90, 75, 40, 85, 95, 65, 35, 70, 50, 80, 40];
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:3px;background:${cbg};${defBorder}${defRadius}padding:0 8px;">${amps.map((a: number) => `<div style="flex:1;height:${a}%;background:${accent};border-radius:2px;opacity:0.85;"></div>`).join('')}</div>\n`;
        } else if (t === 'image_gallery') {
            const imgs = c.images || ['🖼️ Slide 1', '🖼️ Slide 2', '🖼️ Slide 3'];
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;background:${cbg};${defBorder}${defRadius}padding:8px;overflow-x:auto;">${imgs.map((im: string) => `<div style="min-width:100px;height:100%;border:1px solid ${border};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:${color};background:${isLight ? '#f8fafc' : '#1e293b'};">${im}</div>`).join('')}</div>\n`;
        } else if (t === 'media_player') {
            const song = c.title || text || 'Midnight Drive';
            const artist = c.artist || 'Synthwave Collective';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:12px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:${color};"><div style="display:flex;align-items:center;gap:10px;"><div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg, ${accent}, #ec4899);display:flex;align-items:center;justify-content:center;font-size:18px;">🎵</div><div style="display:flex;flex-direction:column;"><span style="font-weight:700;font-size:12px;">${song}</span><span style="font-size:10px;opacity:0.7;">${artist}</span></div></div><div style="display:flex;align-items:center;gap:8px;"><button style="background:none;border:none;color:${color};font-size:14px;cursor:pointer;">⏮</button><button style="width:28px;height:28px;border-radius:50%;background:${accent};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;">▶</button><button style="background:none;border:none;color:${color};font-size:14px;cursor:pointer;">⏭</button></div></div>\n`;
        } else if (t === 'stat_grid') {
            let titles = c.titles || ['Revenue', 'Users', 'Orders', 'Growth'];
            let vals = c.values || ['$12.4k', '850', '320', '+24%'];
            if (Array.isArray(c.stats)) {
                titles = c.stats.map((s: any) => s.label || s.title || '');
                vals = c.stats.map((s: any) => s.value || '');
            }
            controls += `<div${id}${titleAttr} style="${base(c)}display:grid;grid-template-columns:repeat(${Math.max(1, titles.length)}, 1fr);gap:8px;">${titles.map((tl: string, idx: number) => `<div style="background:${cbg};border:1px solid ${border};border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;justify-content:space-between;"><span style="font-size:10px;opacity:0.7;font-weight:bold;text-transform:uppercase;">${tl}</span><span style="font-size:16px;font-weight:800;color:${accent};margin-top:2px;">${vals[idx]||'—'}</span></div>`).join('')}</div>\n`;
        } else if (t === 'score_card') {
            const titleText = c.caption || text || 'User Satisfaction';
            const subtitleText = c.caption ? (text || '') : (c.subtitle || '');
            const score = c.score !== undefined ? c.score : (c.value !== undefined ? c.value : 4.9);
            const grade = c.placeholder || c.grade || '';
            const revs = c.reviews !== undefined ? c.reviews : 128;
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:10px;padding:12px;display:flex;align-items:center;justify-content:space-between;color:${color};"><div style="display:flex;flex-direction:column;"><span style="font-size:11px;font-weight:700;opacity:0.8;">${titleText}</span><div style="font-size:24px;font-weight:900;color:${accent};">${score} <span style="font-size:14px;color:#f59e0b;">${grade ? `(${grade}) ★★★★★` : '★★★★★'}</span></div><span style="font-size:10px;opacity:0.6;">${subtitleText ? subtitleText : `Based on ${revs} reviews`}</span></div></div>\n`;
        } else if (t === 'avatar_card') {
            const user = text || 'John Doe';
            const role = c.subtitle || 'Senior Engineer';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;color:${color};"><div style="width:36px;height:36px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;flex-shrink:0;">${user.charAt(0)}</div><div style="display:flex;flex-direction:column;min-width:0;"><span style="font-weight:700;font-size:12px;">${user}</span><span style="font-size:11px;opacity:0.7;">${role}</span></div></div>\n`;
        } else if (t === 'user_profile_card') {
            const user = (c.userProfile && c.userProfile.name) || c.caption || text || 'Jane Developer';
            const email = (c.userProfile && (c.userProfile.handle || c.userProfile.email)) || c.text || c.email || 'jane@example.com';
            const role = (c.userProfile && c.userProfile.bio) || c.role || 'Lead Architect';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:12px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;color:${color};box-shadow:0 4px 14px rgba(0,0,0,0.25);"><div style="display:flex;align-items:center;gap:12px;"><div style="width:44px;height:44px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;">${user.charAt(0)}</div><div style="display:flex;flex-direction:column;"><span style="font-weight:800;font-size:14px;">${user}</span><span style="font-size:11px;color:${accent};font-weight:600;">${role}</span><span style="font-size:10px;opacity:0.7;">${email}</span></div></div></div>\n`;
        } else if (t === 'product_card') {
            const prod = (c.productData && c.productData.title) || c.caption || text || 'Pro Wireless Mouse';
            const price = (c.productData && c.productData.price) || c.value || c.price || '$79.99';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:12px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;color:${color};"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:800;font-size:13px;">${prod}</span><span style="background:rgba(16,185,129,0.15);color:#10b981;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:bold;">In Stock</span></div><div style="font-size:18px;font-weight:900;color:${accent};margin:6px 0;">${price}</div><button style="width:100%;padding:6px;background:${accent};color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">Add to Cart 🛒</button></div>\n`;
        } else if (t === 'app_launcher_tile') {
            const appName = text || 'Code Studio';
            const icon = c.icon || '🚀';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:${color};cursor:pointer;transition:transform 0.15s;" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'"><span style="font-size:26px;">${icon}</span><span style="font-size:11px;font-weight:700;">${appName}</span></div>\n`;
        } else if (t === 'http_request_card') {
            const method = c.method || 'POST';
            const url = c.url || '/api/v1/auth/login';
            const sc = c.status_code || 200;
            const rt = c.response_time || '42ms';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:8px;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;color:${color};font-family:monospace;font-size:11px;"><div style="display:flex;align-items:center;gap:8px;"><span style="background:${method === 'GET' ? '#0284c7' : '#10b981'};color:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;">${method}</span><span>${url}</span></div><div style="display:flex;align-items:center;gap:8px;"><span style="color:#10b981;font-weight:bold;">${sc} OK</span><span style="opacity:0.6;">${rt}</span></div></div>\n`;
        } else if (t === 'resource_monitor') {
            const cpu = c.cpu !== undefined ? c.cpu : 24;
            const mem = c.mem !== undefined ? c.mem : 58;
            const disk = c.disk !== undefined ? c.disk : 41;
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;justify-content:space-around;color:${color};"><div style="font-size:11px;font-weight:700;color:${accent};">⚡ System Resources</div>${[['CPU', cpu, '#0284c7'], ['RAM', mem, '#10b981'], ['Disk', disk, '#f59e0b']].map(([rName, rVal, rCol]: any) => `<div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;"><span style="width:36px;font-weight:bold;">${rName}</span><div style="flex:1;height:5px;background:${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'};border-radius:3px;margin:0 8px;overflow:hidden;"><div style="width:${rVal}%;height:100%;background:${rCol};"></div></div><span style="font-family:monospace;font-weight:bold;">${rVal}%</span></div>`).join('')}</div>\n`;
        } else if (t === 'env_vars') {
            const vars = c.vars || { 'NODE_ENV': 'production', 'PORT': '3000', 'DEBUG': 'false' };
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:4px;overflow-y:auto;color:${color};font-family:monospace;font-size:11px;"><div style="font-weight:bold;color:${accent};">Environment Variables</div>${Object.entries(vars).map(([k, v]) => `<div style="display:flex;justify-content:space-between;border-bottom:1px solid ${border};padding:2px 0;"><span style="color:#f59e0b;">${k}</span><span style="opacity:0.85;">${v}</span></div>`).join('')}</div>\n`;
        } else if (t === 'status_dock') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:rgba(15,23,42,0.85);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:0 12px;color:#f8fafc;font-size:11px;"><div style="display:flex;align-items:center;gap:6px;"><span style="color:#10b981;">●</span><span>${text || 'Daemon Live'}</span></div><span style="opacity:0.6;font-family:monospace;">${c.status || 'OK'}</span></div>\n`;
        } else if (t === 'nav_rail') {
            const items = (c.items || (text ? text.split(',') : ['🏠 Home', '📊 Stats', '⚙️ Config', '📁 Files'])).map((s: string) => s.trim());
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;gap:8px;background:${cbg};border-right:1px solid ${border};padding:12px 6px;color:${color};">${items.map((it: string, idx: number) => `<button onclick="if(window['${c.id}_onClick'])window['${c.id}_onClick']('${it}');" style="padding:8px 12px;background:${idx === 0 ? accent : 'transparent'};color:${idx === 0 ? '#fff' : color};border:none;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;text-align:left;">${it}</button>`).join('')}</div>\n`;
        } else if (t === 'disclosure' || t === 'collapsible_section') {
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};${defBorder}${defRadius}overflow:hidden;"><details style="padding:8px 12px;color:${color};font-size:12px;"><summary style="cursor:pointer;font-weight:700;color:${accent};user-select:none;">${text || 'Advanced Settings'}</summary><div style="padding-top:8px;font-size:11px;opacity:0.85;">${c.content || c.placeholder || 'Expanded collapsible details and configuration.'}</div></details></div>\n`;
        } else if (t === 'accordion_group') {
            const titles = (c.titles || (text ? text.split(',') : ['Section 1', 'Section 2', 'Section 3'])).map((s: string) => s.trim());
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;gap:4px;">${titles.map((tl: string, i: number) => `<div style="background:${cbg};border:1px solid ${border};border-radius:6px;overflow:hidden;"><div style="padding:6px 10px;font-size:11px;font-weight:700;color:${accent};cursor:pointer;background:${isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'};">${tl}</div></div>`).join('')}</div>\n`;
        } else {
            // Fallback for any other type
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}display:flex;align-items:center;justify-content:center;">${text}</div>\n`;
        }
    }

    // Process non_visual_controls array if present
    for (const nv of (spec.non_visual_controls || [])) {
        const nvt = nv.control_type;
        const nvid = ` id="${nv.id}"`;
        const nvev = buildEvents(nv);
        if (nvt === 'open_dialog') {
            controls += `<input type="file"${nvid}${nvev} style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;if(window['${nv.id}_onSelect'])window['${nv.id}_onSelect'](p);else if(window.backendAlert)window.backendAlert('File Selected: '+p);}">\n`;
        } else if (nvt === 'save_dialog') {
            controls += `<input type="file"${nvid}${nvev} style="display:none;">\n`;
        } else if (nvt === 'timer') {
            const interval = nv.interval || 1000;
            const handler = nv.event_handlers?.onTimer || nv.event_handlers?.ontimer || `on_${nv.id}_timer`;
            const autoStart = nv.enabled !== false;
            controls += `<script>
                (function() {
                    window['__timer_interval_${nv.id}'] = ${interval};
                    window['__timer_func_${nv.id}'] = function() {
                        if (window['${handler}']) { try{ window['${handler}'](); } catch(e){ console.error(e); } }
                        else if (window['on_${nv.id}_timer']) { try{ window['on_${nv.id}_timer'](); } catch(e){ console.error(e); } }
                        else if (window['on_${nv.id}_tick']) { try{ window['on_${nv.id}_tick'](); } catch(e){ console.error(e); } }
                    };
                    if (${autoStart}) {
                        window['__timer_id_${nv.id}'] = setInterval(window['__timer_func_${nv.id}'], ${interval});
                    }
                })();
            </script>\n`;
        }
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${spec.title || 'Preview'}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root {
    --accent: ${accent};
    --accent-secondary: ${spec.secondary_accent || accent};
    --btn-bg: ${defaultBtnBg};
    --btn-fg: ${defaultBtnFg};
    --theme-fg: ${fg};
    --theme-muted: ${isLight ? '#334155' : '#94a3b8'};
    --card-bg: ${isLight ? '#ffffff' : (bg === '#050505' ? '#121212' : '#1e293b')};
    --card-border: ${border};
    --input-bg: ${isLight ? '#ffffff' : (bg === '#050505' ? '#121212' : 'rgba(255, 255, 255, 0.05)')};
    --input-border: ${border};
    --editable-bg: ${isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.04)'};
    --editable-border: ${isLight ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.22)'};
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: auto; }
  body {
    background: ${bg};
    color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    position: relative;
    width: 100%;
    min-height: 100%;
    overflow-x: hidden;
  }
  input, textarea, select, button { font-family: inherit; } .rad-mono { font-family: monospace; } * { spellcheck: false; }
  button.btn-theme-accent,
  button:not([data-custom-bg]):not([data-no-theme]):not(#simplegui-dialog-cancel):not(.modal-close):not([data-pag-num]) {
    background: var(--btn-bg, ${defaultBtnBg});
    color: var(--btn-fg, ${defaultBtnFg});
  }

  /* Themed Labels, Text, Checks, Editable Labels and Tables */
  .rad-label:not([data-custom-color]):not([data-caption="true"]),
  [data-theme-label="true"],
  label:not([data-custom-color]),
  .rad-checkbox-label,
  .rad-radio-label,
  .rad-switch-label,
  .rad-slider-title,
  .rad-editable-label-container,
  .label-display,
  .label-text,
  .rad-editable-input,
  .rad-masked-input-wrapper,
  .rad-masked-input-wrapper input,
  .stepper-val,
  table td,
  .tree-node:not(.selected-tree-node),
  .rad-tree-container span {
      color: var(--theme-fg, ${fg}) !important;
  }

  /* Inline Editable Label Container & Display */
  .rad-editable-label-container {
    background: var(--editable-bg, ${isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.04)'}) !important;
    border: 1px dashed var(--editable-border, ${isLight ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.22)'}) !important;
    border-radius: 6px !important;
    color: var(--theme-fg, ${fg}) !important;
    transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s !important;
    box-sizing: border-box !important;
  }
  .rad-editable-label-container:hover {
    border-color: var(--accent, ${accent}) !important;
    border-style: solid !important;
    background: var(--input-bg, ${isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'}) !important;
    box-shadow: 0 0 0 1px var(--accent, ${accent}) !important;
  }
  .rad-editable-label-container .label-display,
  .rad-editable-label-container .label-text {
    color: var(--theme-fg, ${fg}) !important;
    font-weight: 600 !important;
  }
  .rad-editable-badge {
    display: inline-flex !important;
    align-items: center !important;
    gap: 3px !important;
    font-size: 10px !important;
    font-weight: 700 !important;
    color: var(--accent, ${accent}) !important;
    background: var(--editable-bg, ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}) !important;
    border: 1px solid var(--editable-border, ${isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)'}) !important;
    border-radius: 4px !important;
    padding: 1px 6px !important;
    letter-spacing: 0.3px !important;
    flex-shrink: 0 !important;
  }
  .rad-editable-input {
    background: var(--input-bg, ${isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.08)'}) !important;
    color: var(--theme-fg, ${fg}) !important;
    border: 1px solid var(--accent, ${accent}) !important;
    border-radius: 5px !important;
    outline: none !important;
    box-shadow: 0 0 0 2px var(--accent, ${accent})44 !important;
    padding: 3px 8px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    font-family: inherit !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  
  /* Subtitles, Captions & Muted metadata */
  .rad-caption,
  .rad-card-subtitle,
  [data-caption="true"],
  .rad-muted-text {
      color: var(--theme-muted, ${isLight ? '#334155' : '#94a3b8'}) !important;
  }

  table th {
      color: ${isLight ? '#0f172a' : accent} !important;
  }
  table tr {
      border-color: ${border} !important;
  }
  table tr:hover:not(.selected-tr) {
      background: ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'} !important;
  }
  table tr.selected-tr {
      background: ${isLight ? 'rgba(2,132,199,0.18)' : 'rgba(56,189,248,0.22)'} !important;
  }
  legend {
      color: ${isLight ? '#0f172a' : accent} !important;
      font-weight: 700 !important;
  }
  .selected-tree-node {
      color: ${isLight ? '#0f172a' : accent} !important;
      font-weight: 700 !important;
  }

  input[type=range] { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.12); outline: none; cursor: pointer; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${accent}; cursor: pointer; box-shadow: 0 0 6px rgba(56,189,248,0.5); }
  :focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
  ::selection { background: rgba(56,189,248,0.3); }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
  select:not([size]):not([multiple]), .simplegui-select:not([size]):not([multiple]) {
    appearance: none !important;
    -webkit-appearance: none !important;
    color-scheme: ${isLight ? 'light' : 'dark'} !important;
    background-repeat: no-repeat !important;
    background-position: right 10px center !important;
    background-size: 12px 12px !important;
    padding-right: 30px !important;
    cursor: pointer !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2) !important;
  }
  select[multiple] option:checked, select[size] option:checked {
    background: ${isLight ? '#0284c7' : accent} linear-gradient(0deg, ${isLight ? '#0284c7' : accent} 0%, ${isLight ? '#0284c7' : accent} 100%) !important;
    color: #ffffff !important;
  }
  select:not([size]):hover, .simplegui-select:hover {
    border-color: ${accent} !important;
  }
  select:not([size]):focus, .simplegui-select:focus {
    border-color: ${accent} !important;
    outline: 2px solid ${accent} !important;
    outline-offset: 1px !important;
  }
  select option {
    background-color: ${isLight ? '#ffffff' : (bg === '#050505' ? '#121212' : '#1e293b')} !important;
    color: ${fg} !important;
    padding: 8px 12px !important;
  }
  .ctx-item:hover { background: rgba(56, 189, 248, 0.2) !important; }
  ${hoverStyles}
</style>
<body spellcheck="false" autocapitalize="none" autocorrect="off" oncontextmenu="return false;">
${controls}
<script>
  window.showOpenDialog = function(id) { const el = document.getElementById(id); if (el) el.click(); };
  window.showSaveDialog = function(id) { const el = document.getElementById(id); if (el) el.click(); };
  window.startTimer = function(id, ms) {
    if (window['__timer_id_' + id]) clearInterval(window['__timer_id_' + id]);
    const interval = ms || window['__timer_interval_' + id] || 1000;
    window['__timer_interval_' + id] = interval;
    const runner = function() {
      if (window['__timer_func_' + id]) { try { window['__timer_func_' + id](); } catch(e){} }
      else if (window['on_' + id + '_tick']) { try { window['on_' + id + '_tick'](); } catch(e){} }
      else if (window['on_' + id + '_timer']) { try { window['on_' + id + '_timer'](); } catch(e){} }
    };
    window['__timer_id_' + id] = setInterval(runner, interval);
  };
  window.stopTimer = function(id) {
    if (window['__timer_id_' + id]) {
      clearInterval(window['__timer_id_' + id]);
      window['__timer_id_' + id] = null;
    }
  };
  window.setTimerInterval = function(id, ms) {
    const newMs = ms || 1000;
    window['__timer_interval_' + id] = newMs;
    window.startTimer(id, newMs);
  };
  window.getControlValue = function(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if ("value" in el) return el.value;
    if (el.dataset && el.dataset.value) return el.dataset.value;
    return el.textContent ? el.textContent.trim() : null;
  };
  window.setControlText = function(id, text) {
    const el = document.getElementById(id);
    if (el) { if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") { el.value = text; if (el.tagName === "TEXTAREA") el.scrollTop = el.scrollHeight; } else { el.textContent = text; el.innerText = text; } }
  };
  window.setControlValue = function(id, val) {
    const el = document.getElementById(id);
    if (el) { if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") { el.value = val; if (el.tagName === "TEXTAREA") el.scrollTop = el.scrollHeight; } else { el.textContent = val; el.innerText = val; if (el.dataset) el.dataset.value = val; } }
  };
  window.setControlPlaceholder = function(id, placeholder) {
    const el = document.getElementById(id);
    if (el) {
      if ("placeholder" in el) el.placeholder = placeholder;
      else { const inp = el.querySelector("input, textarea"); if (inp) inp.placeholder = placeholder; }
    }
  };
  window.setControlReadOnly = function(id, readOnly) {
    const el = document.getElementById(id);
    if (el) { if ("readOnly" in el) el.readOnly = readOnly; else { const inp = el.querySelector("input, textarea"); if (inp) inp.readOnly = readOnly; } }
  };
  window.setControlRequired = function(id, required) {
    const el = document.getElementById(id);
    if (el) { if ("required" in el) el.required = required; else { const inp = el.querySelector("input, textarea, select"); if (inp) inp.required = required; } }
  };
  window.setControlMaxLength = function(id, maxLength) {
    const el = document.getElementById(id);
    if (el) { if ("maxLength" in el) el.maxLength = maxLength; else { const inp = el.querySelector("input, textarea"); if (inp) inp.maxLength = maxLength; } }
  };
  window.setControlEnabled = function(id, enabled) {
    const el = document.getElementById(id);
    if (el) { el.disabled = !enabled; el.style.opacity = enabled ? "1" : "0.55"; el.style.pointerEvents = enabled ? "auto" : "none"; }
  };
  window.setControlVisible = function(id, visible) {
    const el = document.getElementById(id);
    if (el) { el.style.display = visible ? "" : "none"; }
  };
  window.setStatChart = function(id, titleOrOpts, valStr, trendStr) {
    const c = document.getElementById(id);
    if (!c) return;
    let title = '', value = '', trend = '';
    if (typeof titleOrOpts === 'object' && titleOrOpts !== null) {
      title = titleOrOpts.title || '';
      value = titleOrOpts.value || '';
      trend = titleOrOpts.trend || '';
    } else {
      title = String(titleOrOpts || '');
      value = String(valStr || '');
      trend = String(trendStr || '');
    }
    if (title) { const t = c.querySelector(".stat-title") || c.querySelector("span"); if (t) t.textContent = title; }
    if (value) { const v = c.querySelector(".stat-val") || c.querySelector("div:nth-child(2)"); if (v) v.textContent = value; }
    if (trend) { const tr = c.querySelector(".stat-trend") || c.querySelectorAll("span")[1]; if (tr) tr.textContent = trend; }
    c.style.transition = "box-shadow 0.3s, border-color 0.3s";
    c.style.boxShadow = "0 0 22px #38bdf8";
    c.style.borderColor = "#38bdf8";
    setTimeout(function() { c.style.boxShadow = ""; c.style.borderColor = ""; }, 1500);
  };
  window.setTimelineSteps = function(id, stepsList) {
    const c = document.getElementById(id);
    if (!c) return;
    const steps = Array.isArray(stepsList) ? stepsList : String(stepsList || '').split(',').map(function(s){ return s.trim(); });
    const accent = '#38bdf8';
    let html = '';
    steps.forEach(function(stepText, idx) {
      const active = idx <= 1 || stepText.includes('Passed') || stepText.includes('Verified') || stepText.includes('Deployed');
      const nodeCol = active ? '#10b981' : (idx === 0 ? accent : 'rgba(255,255,255,0.3)');
      const icon = active ? '✓' : '•';
      html += '<div style="display:flex;align-items:center;gap:10px;font-size:11px;margin-bottom:6px;"><span style="color:' + nodeCol + ';font-weight:bold;">' + icon + '</span><span style="font-weight:' + (active?'700':'400') + ';">' + stepText + '</span></div>';
    });
    c.innerHTML = html;
    c.style.transition = "box-shadow 0.3s";
    c.style.boxShadow = "0 0 20px #10b981";
    setTimeout(function() { c.style.boxShadow = ""; }, 1400);
  };
  window.setToast = function(id, title, msg, alertType) {
    const c = document.getElementById(id);
    if (c) {
      if (title) { const tEl = c.querySelector("span:nth-child(1)"); if (tEl) tEl.textContent = title; }
      if (msg) { const mEl = c.querySelector("span:nth-child(2)"); if (mEl) mEl.textContent = msg; }
      if (alertType) { c.style.borderLeftColor = alertType==='error'?'#ef4444':alertType==='warning'?'#f59e0b':'#10b981'; }
      c.style.transition = "box-shadow 0.3s, border-color 0.3s";
      c.style.boxShadow = "0 0 18px " + (alertType==='error'?'#ef4444':alertType==='warning'?'#f59e0b':'#10b981');
      setTimeout(function() { c.style.boxShadow = ""; }, 1400);
    }
  };
  window.setSegmentedSelected = function(id, labelText) {
    const container = document.getElementById(id);
    if (!container) return;
    const accent = '#38bdf8';
    container.dataset.value = labelText;
    container.querySelectorAll('button').forEach(function(b) {
      const isSel = b.textContent.trim() === labelText;
      b.style.background = isSel ? accent : 'transparent';
      b.style.color = isSel ? '#ffffff' : 'inherit';
    });
  };
  window.handleTreeNodeClick = function(el) {
    var id = el.getAttribute('data-tree-id');
    var nodeText = el.getAttribute('data-node');
    var parent = el.closest('.rad-tree-container');
    if (parent) {
      parent.querySelectorAll('.tree-node').forEach(function(n) {
        n.style.background = 'transparent';
        n.style.color = 'inherit';
        n.style.fontWeight = 'normal';
      });
    }
    el.style.background = 'rgba(56,189,248,0.25)';
    el.style.color = '#38bdf8';
    el.style.fontWeight = '700';
    var fn = window[id + '_onSelect'] || window['on_' + id + '_select'];
    if (fn) fn(nodeText);
  };
  window.handleTreeArrowClick = function(e, arrow) {
    e.stopPropagation();
    var isCol = arrow.textContent === '▶';
    arrow.textContent = isCol ? '▼' : '▶';
    var curr = arrow.closest('.tree-node').nextElementSibling;
    var indent = parseInt(arrow.closest('.tree-node').style.paddingLeft || '0', 10);
    while (curr) {
      var currInd = parseInt(curr.style.paddingLeft || '0', 10);
      if (currInd <= indent) break;
      curr.style.display = isCol ? 'flex' : 'none';
      curr = curr.nextElementSibling;
    }
  };
  window.setTreeNodes = function(id, nodesList) {
    const container = document.getElementById(id);
    if (!container) return;
    const nodes = Array.isArray(nodesList) ? nodesList : String(nodesList || '').split(',').map(function(s){ return s.trim(); });
    const accent = '#38bdf8';
    const selBg = 'rgba(56,189,248,0.25)';
    let html = '';
    nodes.forEach(function(nodeText, idx) {
      const isFolder = nodeText.includes('📁') || nodeText.includes('📂') || nodeText.includes('demos') || nodeText.includes('src') || idx === 0;
      const indent = idx === 0 ? 0 : (idx === 1 ? 16 : 32);
      const arrow = isFolder ? '▼' : ' ';
      const selStyle = idx === 0 ? 'background:' + selBg + ';color:' + accent + ';font-weight:700;' : '';
      const isUpdatedFolder = nodeText.includes('UPDATED') || nodeText.includes('[');
      const isNewFile = nodeText.endsWith('.ts') || nodeText.includes('.js') || nodeText.includes('.json');
      let badgeHtml = '';
      if (isUpdatedFolder) {
        badgeHtml = '<span style="font-size:9px;font-weight:800;background:#0284c7;color:#ffffff;padding:2px 8px;border-radius:10px;box-shadow:0 0 8px rgba(2,132,199,0.6);flex-shrink:0;margin-left:8px;">UPDATED</span>';
      } else if (isNewFile) {
        badgeHtml = '<span style="font-size:9px;font-weight:800;background:#10b981;color:#ffffff;padding:2px 8px;border-radius:10px;box-shadow:0 0 8px rgba(16,185,129,0.6);flex-shrink:0;margin-left:8px;">NEW</span>';
      }
      html += '<div class="tree-node' + (idx===0?' selected-tree-node':'') + '" data-node="' + nodeText + '" data-tree-id="' + id + '" style="padding:6px 10px;padding-left:' + (indent + 8) + 'px;border-radius:6px;display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;cursor:pointer;user-select:none;transition:all 0.2s;' + selStyle + '"' +
        ' onclick="window.handleTreeNodeClick(this);">' +
        '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden;">' +
        '<span class="tree-arrow" onclick="window.handleTreeArrowClick(event, this);" style="width:12px;font-size:9px;opacity:0.8;cursor:pointer;flex-shrink:0;">' + arrow + '</span>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + nodeText + '</span></div>' +
        badgeHtml +
        '</div>';
    });
    container.innerHTML = html;
    container.style.transition = "box-shadow 0.3s, border-color 0.3s";
    container.style.boxShadow = "0 0 25px #38bdf8";
    container.style.borderColor = "#38bdf8";
    setTimeout(function() {
      container.style.boxShadow = "";
      container.style.borderColor = "";
    }, 1500);
  };
  window.setTabsActive = function(id, tabName) {
    const c = document.getElementById(id);
    if (!c) return;
    const accent = '#38bdf8';
    c.dataset.value = tabName;
    c.querySelectorAll('button').forEach(function(b) {
      const isSel = b.textContent.trim() === tabName;
      b.style.borderBottom = isSel ? '2px solid ' + accent : 'none';
      b.style.color = isSel ? accent : 'inherit';
      b.style.fontWeight = isSel ? '700' : 'normal';
    });
  };
  window.setStatusBarText = function(id, textStr) {
    const c = document.getElementById(id);
    if (!c) return;
    const span = c.querySelector('div:nth-child(1) span:nth-child(3)');
    if (span) span.textContent = textStr;
  };
  window.setPropertyGridData = function(id, rawProps) {
    const c = document.getElementById(id);
    if (!c) return;
    const body = c.querySelector('.prop-grid-body');
    if (!body) return;
    const propsList = String(rawProps || '').split(',').map(function(s){ return s.trim().split(':'); }).filter(function(arr){ return arr.length === 2; });
    const accent = '#38bdf8';
    let html = '';
    propsList.forEach(function(pair) {
      const k = pair[0].trim(); const v = pair[1].trim();
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:11px;"><span style="font-weight:600;opacity:0.85;">' + k + '</span><span class="rad-mono" style="font-size:11px;color:' + accent + ';font-weight:600;">' + v + '</span></div>';
    });
    body.innerHTML = html;
  };
  window.handlePopupItemClick = function(el) {
    var id = el.getAttribute('data-popup-id');
    var label = el.getAttribute('data-popup-label');
    var fn = window[id + '_onClick'] || window['on_' + id + '_click'];
    if (fn) fn(label);
  };
  window.setPopupMenuItems = function(id, itemsCSV) {
    const c = document.getElementById(id);
    if (!c) return;
    const items = String(itemsCSV || '').split(',').map(function(s){ return s.trim(); });
    let html = '';
    items.forEach(function(it) {
      if (it === '---') { html += '<div style="height:1px;background:rgba(255,255,255,0.1);margin:4px 0;"></div>'; return; }
      const parts = it.split(/\s{2,}/);
      const label = parts[0] || it; const shortcut = parts[1] || '';
      html += '<div class="popup-item" data-popup-id="' + id + '" data-popup-label="' + label.replace(/"/g, '&quot;') + '" style="padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;font-size:11px;cursor:pointer;" onclick="window.handlePopupItemClick(this);"><span>' + label + '</span>' + (shortcut ? '<span class="rad-mono" style="font-size:10px;opacity:0.5;">' + shortcut + '</span>' : '') + '</div>';
    });
    c.innerHTML = html;
  };
  window.renderCalendarGrid = function(idOrWrapper, yearMonthStr, selectedDay) {
    const wrapper = typeof idOrWrapper === 'string'
      ? (document.getElementById(idOrWrapper + '_wrapper') || (document.getElementById(idOrWrapper) ? document.getElementById(idOrWrapper).closest('[data-cal-id]') : null) || document.getElementById(idOrWrapper))
      : idOrWrapper;
    if (!wrapper) return;
    const realId = wrapper.dataset.calId || (wrapper.id ? wrapper.id.replace(/_wrapper$/, '') : '');
    const titleEl = wrapper.querySelector('.cal-title');
    if (yearMonthStr && titleEl) {
      titleEl.textContent = yearMonthStr;
    }
    const curTitle = (yearMonthStr || (titleEl ? titleEl.textContent : 'July 2026')).trim();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const parts = curTitle.split(' ').filter(Boolean);
    let mIdx = months.findIndex(function(m){ return m.toLowerCase() === (parts[0] || '').toLowerCase(); });
    if (mIdx === -1) mIdx = 6;
    const yNum = parseInt(parts[1] || '2026', 10);

    const hiddenInput = document.getElementById(realId);
    let selDay = selectedDay !== undefined ? Number(selectedDay) : (hiddenInput && hiddenInput.value ? Number(hiddenInput.value) : 1);
    if (!selDay || isNaN(selDay)) selDay = 1;

    const firstDay = new Date(yNum, mIdx, 1).getDay();
    const daysInMonth = new Date(yNum, mIdx + 1, 0).getDate();
    const prevMonthDays = new Date(yNum, mIdx, 0).getDate();
    if (selDay > daysInMonth) selDay = daysInMonth;
    if (hiddenInput && selectedDay !== undefined) hiddenInput.value = String(selDay);

    const accent = wrapper.dataset.accent || '#38bdf8';
    const grid = wrapper.querySelector('.cal-days-grid');
    if (!grid) return;

    let html = '';
    for (let i = 0; i < firstDay; i++) {
      const d = prevMonthDays - firstDay + 1 + i;
      html += '<span class="cal-day cal-day-prev" style="padding:4px 0;opacity:0.35;cursor:pointer;" onclick="window.navCalendar(this, -1);">' + d + '</span>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const isSel = (d === selDay);
      const selStyle = isSel ? 'background:' + accent + ';color:#ffffff;font-weight:700;border-radius:50%;' : '';
      html += '<span class="cal-day cal-day-cur" data-day="' + d + '" style="padding:4px 0;opacity:0.95;cursor:pointer;' + selStyle + '" onclick="window.selectCalendarDay(this, ' + d + ');">' + d + '</span>';
    }
    const totalCurrent = firstDay + daysInMonth;
    const totalCells = totalCurrent > 35 ? 42 : 35;
    const nextDays = totalCells - totalCurrent;
    for (let d = 1; d <= nextDays; d++) {
      html += '<span class="cal-day cal-day-next" style="padding:4px 0;opacity:0.35;cursor:pointer;" onclick="window.navCalendar(this, 1);">' + d + '</span>';
    }
    grid.innerHTML = html;
  };

  window.selectCalendarDay = function(el, day) {
    const wrapper = el ? (el.closest('[data-cal-id]') || el.closest('[id$="_wrapper"]')) : null;
    if (!wrapper) return;
    const realId = wrapper.dataset.calId || (wrapper.id ? wrapper.id.replace(/_wrapper$/, '') : '');
    const accent = wrapper.dataset.accent || '#38bdf8';
    wrapper.querySelectorAll('.cal-day').forEach(function(item) {
      item.style.background = 'transparent';
      item.style.color = 'inherit';
      item.style.fontWeight = 'normal';
      item.style.borderRadius = '0';
    });
    if (el) {
      el.style.background = accent;
      el.style.color = '#ffffff';
      el.style.fontWeight = '700';
      el.style.borderRadius = '50%';
    }
    const hid = document.getElementById(realId);
    if (hid) hid.value = String(day);
    const titleEl = wrapper.querySelector('.cal-title');
    const curMonth = titleEl ? titleEl.textContent.trim() : '';
    const statusText = 'Selected Date: ' + (curMonth ? curMonth + ' ' : '') + day;
    if (window.setStatusBarText) {
      window.setStatusBarText('desktop_status_bar', statusText);
    }
    if (window.showInteractionToast) {
      window.showInteractionToast('Date Selected', (curMonth ? curMonth + ' ' : '') + 'Day ' + day);
    }
    const customChange = wrapper.dataset.changeHandler || '';
    const fnC = window[customChange] || window[realId + '_onChange'] || window['on_' + realId + '_change'];
    if (fnC) {
      try { fnC(day); } catch(err) { console.error('Calendar change callback error:', err); }
    }
  };

  window.navCalendar = function(btnEl, delta) {
    const wrapper = typeof btnEl === 'string'
      ? (document.getElementById(btnEl + '_wrapper') || document.getElementById(btnEl))
      : (btnEl ? (btnEl.closest('[data-cal-id]') || btnEl.closest('[id$="_wrapper"]')) : null);
    if (!wrapper) return;
    const realId = wrapper.dataset.calId || (wrapper.id ? wrapper.id.replace(/_wrapper$/, '') : '');
    const titleEl = wrapper.querySelector('.cal-title');
    if (!titleEl) return;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const cur = titleEl.textContent.trim().split(' ').filter(Boolean);
    let mIdx = months.findIndex(function(m){ return m.toLowerCase() === (cur[0] || '').toLowerCase(); });
    if (mIdx === -1) mIdx = 6;
    let y = parseInt(cur[1] || '2026', 10);
    mIdx += delta;
    if (mIdx < 0) { mIdx = 11; y--; }
    if (mIdx > 11) { mIdx = 0; y++; }
    const newTitle = months[mIdx] + ' ' + y;
    titleEl.textContent = newTitle;
    window.renderCalendarGrid(wrapper, newTitle);
    if (window.setStatusBarText) {
      window.setStatusBarText('desktop_status_bar', 'Calendar: ' + newTitle);
    }
    if (window.showInteractionToast) {
      window.showInteractionToast('Calendar Navigation', newTitle);
    }
    const fnNav = delta < 0 ? (window[realId + '_onPrev'] || window['on_' + realId + '_prev']) : (window[realId + '_onNext'] || window['on_' + realId + '_next']);
    if (fnNav) {
      try { fnNav(newTitle); } catch(err) { console.error('Calendar navigation callback error:', err); }
    }
  };

  window.setCalendarDate = function(id, headerText, selectedDay) {
    window.renderCalendarGrid(id, headerText, selectedDay);
    if (headerText) {
      const statusText = 'Calendar set to ' + headerText + (selectedDay !== undefined ? ' ' + selectedDay : '') + '.';
      if (window.setStatusBarText) {
        window.setStatusBarText('desktop_status_bar', statusText);
      }
      if (window.showInteractionToast) {
        window.showInteractionToast('Calendar Updated', headerText + (selectedDay !== undefined ? ' Day ' + selectedDay : ''));
      }
    }
  };
  window.setColorSwatchColor = function(id, hexColor) {
    const c = document.getElementById(id);
    if (!c) return;
    c.dataset.value = hexColor;
    c.querySelectorAll('.swatch-chip').forEach(function(chip) {
      const isSel = chip.dataset.color.toLowerCase() === hexColor.toLowerCase();
      chip.style.transform = isSel ? 'scale(1.15)' : 'scale(1)';
      chip.style.boxShadow = isSel ? '0 0 0 3px #0f172a, 0 0 0 5px ' + hexColor : '0 2px 6px rgba(0,0,0,0.3)';
    });
  };
  window.setFilePathBarPath = function(id, pathStr) {
    const c = document.getElementById(id);
    if (!c) return;
    const span = c.querySelector('.path-text');
    if (span) span.textContent = pathStr;
  };
  window.setKanbanColumns = function(id, rawCols) {
    const c = document.getElementById(id);
    if (!c) return;
    const cols = String(rawCols || '').split('|').map(function(s){ return s.trim(); });
    const sampleCards = [
      ['● Design Specs', '● IPC Handlers', '● State Sync'],
      ['● HTML Generator', '● UI Canvas'],
      ['● Unit Tests', '● API Docs', '● Themes', '● Exporter']
    ];
    let html = '';
    const accent = '#38bdf8';
    cols.forEach(function(colStr, idx) {
      const cards = sampleCards[idx % sampleCards.length];
      html += '<div style="flex:1;min-width:90px;background:rgba(255,255,255,0.05);border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:6px;"><div style="font-size:10px;font-weight:700;color:' + accent + ';border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;display:flex;justify-content:space-between;align-items:center;"><span>' + colStr + '</span></div><div style="display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto;">' + cards.map(function(card){ return '<div onclick="const fn=window[' + JSON.stringify(id + '_onClick') + ']||window[' + JSON.stringify('on_' + id + '_click') + '];if(fn)fn(' + JSON.stringify(card) + ');" style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 6px;font-size:10px;color:inherit;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.1);cursor:pointer;">' + card + '</div>'; }).join('') + '</div></div>';
    });
    c.innerHTML = html;
  };
  window.setShortcutRecorderValue = function(id, shortcutStr) {
    const c = document.getElementById(id);
    if (!c) return;
    c.dataset.value = shortcutStr;
    const keys = String(shortcutStr || '').split(/[ +-]+/).filter(Boolean);
    const accent = '#38bdf8';
    const keysContainer = c.querySelector('div');
    if (keysContainer) {
      keysContainer.innerHTML = keys.map(function(k){ return '<kbd class="rad-mono" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;color:' + accent + ';">' + k + '</kbd>'; }).join('');
    }
  };
  window.setSplitButtonAction = function(id, textStr) {
    const c = document.getElementById(id);
    if (!c) return;
    const btn = c.querySelector('button:first-child');
    if (btn) btn.textContent = textStr;
  };
  window.setSparklineTableData = function(id, rowsCSV) {
    const c = document.getElementById(id);
    if (!c) return;
    const rows = String(rowsCSV || '').split(',').map(function(s){ return s.trim(); });
    const accent = '#38bdf8';
    let html = '';
    rows.forEach(function(row, i) {
      const parts = row.split(':');
      const label = parts[0] || 'Metric';
      const val = parts[1] || '$10k';
      const isUp = i % 3 === 0; const isFlat = i % 3 === 1;
      const sparkColor = isUp ? '#10b981' : isFlat ? accent : '#ef4444';
      const points = isUp ? '0,14 10,12 20,8 30,10 40,4 50,2' : isFlat ? '0,8 10,10 20,7 30,9 40,8 50,8' : '0,2 10,5 20,8 30,6 40,12 50,14';
      html += '<div onclick="const fn=window[' + JSON.stringify(id + '_onClick') + ']||window[' + JSON.stringify('on_' + id + '_click') + '];if(fn)fn(' + JSON.stringify(label) + ');" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:' + (i < rows.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none') + ';cursor:pointer;"><span style="font-weight:600;opacity:0.85;">' + label + '</span><div style="display:flex;align-items:center;gap:8px;"><svg width="50" height="16" style="overflow:visible;"><polyline fill="none" stroke="' + sparkColor + '" stroke-width="2" points="' + points + '" /></svg><span class="rad-mono" style="font-weight:700;color:' + sparkColor + ';">' + val + '</span></div></div>';
    });
    c.innerHTML = html;
  };
  window.setMetricComparison = function(id, opts) {
    const c = document.getElementById(id);
    if (!c) return;
    const titleSpan = c.querySelector('div:first-child span:first-child');
    if (titleSpan && opts.title) titleSpan.textContent = opts.title;
    const valSpan = c.querySelector('div:nth-child(2) span:first-child');
    if (valSpan && opts.curVal) valSpan.textContent = opts.curVal;
    const targetSpan = c.querySelector('div:nth-child(2) span:nth-child(2)');
    if (targetSpan && opts.targetStr) targetSpan.textContent = opts.targetStr;
    const changeSpan = c.querySelector('div:first-child span:nth-child(2)');
    if (changeSpan && opts.changeStr) changeSpan.textContent = opts.changeStr;
  };
  window.setActivityFeedItems = function(id, itemsCSV) {
    const c = document.getElementById(id);
    if (!c) return;
    const items = String(itemsCSV || '').split(',').map(function(s){ return s.trim(); });
    const stream = c.querySelector('div:nth-child(2)');
    if (!stream) return;
    const accent = '#38bdf8';
    let html = '';
    items.forEach(function(it) {
      const initial = it.charAt(0).toUpperCase();
      html += '<div onclick="const fn=window[' + JSON.stringify(id + '_onClick') + ']||window[' + JSON.stringify('on_' + id + '_click') + '];if(fn)fn(' + JSON.stringify(it) + ');" style="display:flex;align-items:center;gap:8px;font-size:10px;cursor:pointer;"><div style="width:20px;height:20px;border-radius:50%;background:' + accent + ';color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:9px;flex-shrink:0;">' + initial + '</div><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + it + '</span></div>';
    });
    stream.innerHTML = html;
  };
  window.handleTabCloseClick = function(e, btn) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (btn && btn.parentNode) btn.parentNode.style.display = 'none';
  };
  window.setWorkspaceTabs = function(id, filesCSV) {
    const c = document.getElementById(id);
    if (!c) return;
    const files = String(filesCSV || '').split(',').map(function(s){ return s.trim(); });
    const accent = '#38bdf8';
    let html = '';
    files.forEach(function(file, idx) {
      const isSel = idx === 0;
      html += '<div style="padding:4px 10px;background:' + (isSel ? '#1e293b' : 'transparent') + ';border-radius:4px 4px 0 0;font-size:11px;font-weight:' + (isSel ? '700' : 'normal') + ';color:' + (isSel ? accent : 'inherit') + ';display:flex;align-items:center;gap:6px;cursor:pointer;border-bottom:' + (isSel ? '2px solid ' + accent : 'none') + ';" onclick="const fn=window[' + JSON.stringify(id + '_onChange') + ']||window[' + JSON.stringify('on_' + id + '_change') + '];if(fn)fn(' + JSON.stringify(file) + ');"><span>' + file + '</span><span style="font-size:9px;opacity:0.5;" onclick="window.handleTabCloseClick(event, this);">✕</span></div>';
    });
    c.innerHTML = html;
  };
  window.__handlePagClick = function(btn, id, accent, border, isLight, e) {
    var log = function(msg) {
      if (window.backendAlert) window.backendAlert("PagClick Log: " + msg);
      else console.log("PagClick Log: " + msg);
    };
    try {
      if (e && e.stopPropagation) e.stopPropagation();
      var parent = btn.closest ? btn.closest('[data-page]') : btn.parentNode;
      if (!parent) parent = btn.parentNode;
      var numBtns = Array.from(parent.querySelectorAll('button[data-pag-num]'));
      var currentPageStr = parent.dataset.page || '1';
      var currentPage = parseInt(currentPageStr, 10) || 1;
      var targetPage = currentPage;

      if (btn.dataset && btn.dataset.pagNum) {
        targetPage = parseInt(btn.dataset.pagNum, 10);
      } else if (btn.dataset && btn.dataset.pagPrev) {
        targetPage = Math.max(1, currentPage - 1);
      } else if (btn.dataset && btn.dataset.pagNext) {
        targetPage = Math.min(numBtns.length || 3, currentPage + 1);
      }

      parent.dataset.page = String(targetPage);

      numBtns.forEach(function(b) {
        var pn = parseInt(b.dataset.pagNum, 10);
        var isSel = pn === targetPage;
        b.dataset.active = isSel ? 'true' : 'false';
        b.style.background = isSel ? accent : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)');
        b.style.color = isSel ? '#ffffff' : 'inherit';
        b.style.fontWeight = isSel ? 'bold' : 'normal';
        b.style.border = isSel ? 'none' : '1px solid ' + border;
      });

      var pageArg = targetPage;
      if (typeof window[id + '_onChange'] === 'function') { window[id + '_onChange'](pageArg); }
      else if (typeof window['on_' + id + '_change'] === 'function') { window['on_' + id + '_change'](pageArg); }
      if (typeof window[id + '_onClick'] === 'function') { window[id + '_onClick'](pageArg); }
      else if (typeof window['on_' + id + '_click'] === 'function') { window['on_' + id + '_click'](pageArg); }
    } catch (err) {
      log(err.message + " " + err.stack);
    }
  };
  window.setControlText = function(id, text) {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
        el.value = text;
      } else {
        const targetSpan = el.querySelector("span:nth-child(2)");
        if (targetSpan) {
          targetSpan.textContent = text;
        } else {
          el.textContent = text;
        }
      }
    }
  };
  window.setAlertBannerText = function(id, textStr) {
    const el = document.getElementById(id);
    if (!el) return;
    const span = el.querySelector("span:nth-child(2)");
    if (span) span.textContent = textStr;
    else el.textContent = textStr;
  };
  window.setPaginationPage = function(id, pageNum) {
    const c = document.getElementById(id);
    if (!c) return;
    const pNum = parseInt(String(pageNum), 10);
    if (isNaN(pNum)) return;
    const accent = '#38bdf8';
    c.dataset.page = String(pNum);
    const numBtns = Array.from(c.querySelectorAll('button[data-pag-num]'));
    const fallbackBtns = numBtns.length === 0
      ? Array.from(c.querySelectorAll('button')).filter(function(b) { return !isNaN(parseInt(b.textContent.trim(), 10)); })
      : numBtns;
    fallbackBtns.forEach(function(b) {
      const bn = b.dataset.pagNum ? parseInt(b.dataset.pagNum, 10) : parseInt(b.textContent.trim(), 10);
      const isSel = bn === pNum;
      b.dataset.active = isSel ? 'true' : 'false';
      b.style.background = isSel ? accent : 'rgba(255,255,255,0.06)';
      b.style.color = isSel ? '#ffffff' : 'inherit';
      b.style.fontWeight = isSel ? '700' : 'normal';
      b.style.border = isSel ? 'none' : '1px solid rgba(255,255,255,0.12)';
    });
  };
  window.setToggleButtonState = function(id, active, labelText) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const accent = '#38bdf8';
    btn.dataset.checked = active ? 'true' : 'false';
    btn.style.background = active ? accent : 'rgba(255,255,255,0.08)';
    btn.style.color = active ? '#ffffff' : 'inherit';
    if (labelText !== undefined && labelText !== null) btn.textContent = labelText;
  };
  window.toggleFullscreen = function() {
    if (window.toggleFullscreenBackend) try { window.toggleFullscreenBackend(); } catch(e){}
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{});
      else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  };
  window.showInteractionToast = function(title, subtitle) {
    var toast = document.getElementById("rad-interaction-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "rad-interaction-toast";
      toast.style.cssText = "position:fixed;top:40px;right:24px;background:rgba(15,23,42,0.92);color:#f8fafc;border:1px solid rgba(56,189,248,0.45);border-radius:10px;padding:8px 16px;box-shadow:0 12px 32px rgba(0,0,0,0.55),0 0 16px rgba(56,189,248,0.3);z-index:99999999;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font-family:system-ui,-apple-system,sans-serif;font-size:12px;display:flex;align-items:center;gap:12px;transform:translateY(-8px);opacity:0;transition:all 0.22s cubic-bezier(0.16,1,0.3,1);pointer-events:none;";
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(56,189,248,0.2);color:#38bdf8;font-size:12px;font-weight:bold;">⚡</span><div><div style="font-weight:700;color:#38bdf8;font-size:10px;letter-spacing:0.8px;text-transform:uppercase;">' + (title || 'ACTION TRIGGERED') + '</div><div style="color:#f8fafc;font-weight:600;font-size:12px;margin-top:2px;">' + (subtitle || '') + '</div></div>';
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    if (window._interactionToastTimer) clearTimeout(window._interactionToastTimer);
    window._interactionToastTimer = setTimeout(function() {
      if (toast) {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-8px)";
      }
    }, 2200);
  };

  window.highlightControl = function(ctrlId) {
    if (!ctrlId) return;
    var el = document.getElementById(ctrlId) || document.getElementById(ctrlId + '_wrapper') || document.getElementById(ctrlId + '_container');
    if (!el) return;
    var origOutline = el.style.outline;
    var origShadow = el.style.boxShadow;
    var origTransition = el.style.transition;
    el.style.transition = 'all 0.15s ease';
    el.style.outline = '2px solid #38bdf8';
    el.style.boxShadow = '0 0 20px rgba(56,189,248,0.5)';
    setTimeout(function() {
      el.style.outline = origOutline;
      el.style.boxShadow = origShadow;
      el.style.transition = origTransition;
    }, 900);
  };

  window.handleContextMenuItemClick = function(el) {
    var cbName = el.getAttribute('data-ctx-cb') || 'on_context_menu_select';
    var label = el.getAttribute('data-ctx-label') || '';
    if (window.hideContextMenu) window.hideContextMenu();
    if (window.showInteractionToast) {
      window.showInteractionToast('Context Menu Select', label);
    }
    var cb = window[cbName];
    if (cb) {
      try { cb(label); } catch(err) { console.error('Context menu callback error:', err); }
    }
  };

  window._contextMenuOpenedAt = 0;
  window.globalContextMenuItems = ${JSON.stringify(spec.global_context_menu_items || spec.globalContextMenuItems || [])};

  window.showContextMenu = function(opts) {
    window._contextMenuOpenedAt = Date.now();
    var menu = document.getElementById("rad-context-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "rad-context-menu";
      menu.style.cssText = "display:none;position:fixed;min-width:210px;background:#1e293b;color:#f8fafc;border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:6px;box-shadow:0 16px 36px rgba(0,0,0,0.55);z-index:9999999;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);font-family:system-ui,-apple-system,sans-serif;user-select:none;pointer-events:auto;";
      document.body.appendChild(menu);
    }
    var winW = window.innerWidth || document.documentElement.clientWidth || 1000;
    var winH = window.innerHeight || document.documentElement.clientHeight || 800;
    var rawX = typeof opts.x === 'number' ? opts.x : 100;
    var rawY = typeof opts.y === 'number' ? opts.y : 100;
    var x = Math.max(10, Math.min(rawX, winW - 230));
    var y = Math.max(10, Math.min(rawY, winH - 280));
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    var items = opts.items || [];
    var html = "";
    items.forEach(function(it) {
      if (it === "---") {
        html += '<div style="height:1px;background:rgba(255,255,255,0.12);margin:4px 0;"></div>';
      } else {
        var parts = it.split(/\\s{2,}/);
        var label = parts[0] || it;
        var sc = parts[1] || '';
        html += '<div class="ctx-item" data-ctx-cb="' + (opts.callback || 'on_context_menu_select') + '" data-ctx-label="' + label.replace(/"/g, '&quot;') + '" style="padding:6px 12px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;font-size:12px;cursor:pointer;user-select:none;transition:background 0.12s;" onclick="event.stopPropagation();window.handleContextMenuItemClick(this);"><span>' + label + '</span>' + (sc ? '<span class="rad-mono" style="font-size:10px;opacity:0.5;">' + sc + '</span>' : '') + '</div>';
      }
    });
    menu.innerHTML = html;
    menu.style.display = "block";
  };

  window.hideContextMenu = function() {
    var menu = document.getElementById("rad-context-menu");
    if (menu) menu.style.display = "none";
  };

  // Close context menu and dropdowns on outside left click or mousedown
  window.addEventListener("click", function(e) {
    if (e && e.button !== 0) return;
    if (window._contextMenuOpenedAt && Date.now() - window._contextMenuOpenedAt < 250) return;
    var target = e.target;
    if (target && target.closest && target.closest('#rad-context-menu')) return;
    if (window.hideContextMenu) window.hideContextMenu();
    document.querySelectorAll('.menu-dropdown').forEach(function(d) { d.style.display = 'none'; });
  });

  window.addEventListener("mousedown", function(e) {
    if (e && e.button !== 0) return;
    if (window._contextMenuOpenedAt && Date.now() - window._contextMenuOpenedAt < 250) return;
    var target = e.target;
    if (target && target.closest && target.closest('#rad-context-menu')) return;
    if (window.hideContextMenu) window.hideContextMenu();
  });

  // Handle right-click context menus
  window.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    e.stopPropagation();
    window._contextMenuOpenedAt = Date.now();
    var target = e.target;
    var ctxEl = target && target.closest ? target.closest('[data-context-menu]') : null;
    if (ctxEl) {
      var raw = ctxEl.getAttribute('data-context-menu');
      var ctrlId = ctxEl.getAttribute('data-ctrl-id') || ctxEl.id;
      if (window.highlightControl) window.highlightControl(ctrlId);
      if (window.showInteractionToast) {
        window.showInteractionToast('Target Right-Clicked', 'Opened menu for ' + (ctrlId || 'target'));
      }
      var items = raw ? raw.split('|') : [];
      if (window.showContextMenu) {
        window.showContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: items,
          callback: 'on_' + ctrlId + '_context_select'
        });
      }
      var fn = "on_" + ctrlId + "_contextmenu";
      if (window[fn]) {
        try { window[fn]({ id: ctrlId, x: e.clientX, y: e.clientY }); } catch(err) {}
      }
      return false;
    }
    if (window.globalContextMenuItems && window.showContextMenu && window.globalContextMenuItems.length > 0) {
      if (window.showInteractionToast) {
        window.showInteractionToast('Global Context Menu', 'Canvas Background Right-Clicked');
      }
      window.showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: window.globalContextMenuItems,
        callback: 'on_global_context_menu_select'
      });
    }
    if (window.on_window_contextmenu) {
      try { window.on_window_contextmenu({ x: e.clientX, y: e.clientY }); } catch(err) {}
    }
    return false;
  }, { capture: true });

  (function() {
    let lastAltTime = 0;
    let zoomLevel = 1.0;
    function applyZoom(delta, reset) {
      if (reset) zoomLevel = 1.0;
      else zoomLevel = Math.max(0.4, Math.min(3.0, zoomLevel + delta));
      document.body.style.zoom = zoomLevel;
    }
    function doCloseOrQuit() {
      if (window.quitApp) {
        try { window.quitApp(); return; } catch(e) {}
      }
      if (window.closeWindow) {
        try { window.closeWindow(); return; } catch(e) {}
      }
      if (window.handleWindowCloseIPC) {
        try { window.handleWindowCloseIPC(); return; } catch(e) {}
      }
      try { window.close(); } catch(e) {}
      try { fetch("/api/shutdown", { method: "POST" }); } catch(e) {}
    }

    let isFnPressed = false;
    window.addEventListener("keyup", (e) => {
      if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn" || e.code === "Function") {
        isFnPressed = false;
      }
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn" || e.code === "Function") {
        isFnPressed = true;
      }

      // 1. Double-tap Alt ("alt+alt") within 450ms to close/quit window
      if ((e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight") && !e.repeat) {
        const now = Date.now();
        if (now - lastAltTime > 50 && now - lastAltTime < 450) {
          lastAltTime = 0;
          e.preventDefault();
          doCloseOrQuit();
          return;
        }
        lastAltTime = now;
      } else if (e.key !== "Alt" && e.code !== "AltLeft" && e.code !== "AltRight") {
        lastAltTime = 0;
      }

      // 2. Prevent browser reload shortcuts (F5, Cmd+R, Ctrl+R) that destroy webview IPC bindings
      if (
        e.key === "F5" ||
        e.code === "F5" ||
        ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key.toLowerCase() === "r" || e.code === "KeyR"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      const keyLower = (e.key || "").toLowerCase();
      const code = e.code || "";
      const isQ = keyLower === "q" || code === "KeyQ";
      const isW = keyLower === "w" || code === "KeyW";
      const isF = keyLower === "f" || code === "KeyF";

      // 3. Close / Quit shortcuts: Cmd+Q, Cmd+W, Ctrl+Q, Ctrl+W, Alt+F4, Alt+W, Alt+Q
      if (
        ((e.metaKey || e.ctrlKey) && (isQ || isW)) ||
        (e.altKey && (isQ || isW || e.key === "F4" || code === "F4"))
      ) {
        e.preventDefault();
        doCloseOrQuit();
        return;
      }

      const isFn = isFnPressed || (typeof e.getModifierState === "function" && (e.getModifierState("Fn") || e.getModifierState("FnLock") || e.getModifierState("Symbol")));
      const isInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable);
      const isBareF = !e.metaKey && !e.ctrlKey && !e.altKey && isF;
      const isCmdOrCtrlF = (e.metaKey || e.ctrlKey) && isF;

      // 4. Fullscreen toggle shortcuts: Cmd+F, Ctrl+F, Fn+F, F11, Cmd+Ctrl+F, Alt+Enter, bare F
      if (
        isCmdOrCtrlF ||
        (!isInput && isBareF) ||
        (isFn && isF) ||
        e.key === "F11" || e.code === "F11" ||
        (e.altKey && (e.key === "Enter" || e.code === "Enter"))
      ) {
        e.preventDefault();
        if (window.toggleNativeFullscreen) window.toggleNativeFullscreen();
        else if (window.toggleFullscreen) window.toggleFullscreen();
        return;
      }

      // 5. Minimize window: Cmd+M, Ctrl+M, Alt+M
      if ((e.metaKey || e.ctrlKey || e.altKey) && (e.key.toLowerCase() === "m" || e.code === "KeyM")) {
        e.preventDefault();
        e.stopPropagation();
        if (window.minimizeWindow) window.minimizeWindow();
        return;
      }

      // 5b. Hide window: Cmd+H, Ctrl+H
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "h" || e.code === "KeyH")) {
        e.preventDefault();
        e.stopPropagation();
        if (window.hideApp) window.hideApp();
        else if (window.minimizeWindow) window.minimizeWindow();
        return;
      }

      // 6. Always-on-top toggle: Cmd+Shift+T, Ctrl+Shift+T, Alt+T
      if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key.toLowerCase() === "t" || e.code === "KeyT")) ||
        (e.altKey && !e.ctrlKey && !e.metaKey && (e.key.toLowerCase() === "t" || e.code === "KeyT"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (window.toggleAlwaysOnTop) window.toggleAlwaysOnTop();
        return;
      }

      // 7. Center window: Cmd+Shift+C, Ctrl+Shift+C
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key.toLowerCase() === "c" || e.code === "KeyC")) {
        e.preventDefault();
        e.stopPropagation();
        if (window.centerWindow) window.centerWindow();
        return;
      }

      // 8. Zoom shortcuts: Cmd/Ctrl + (+/- / 0)
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd") {
          e.preventDefault();
          applyZoom(0.1, false);
          return;
        } else if (e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract") {
          e.preventDefault();
          applyZoom(-0.1, false);
          return;
        } else if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
          e.preventDefault();
          applyZoom(0, true);
          return;
        }
      }
    }, { capture: true });
  })();
  window.addEventListener("DOMContentLoaded", () => {
    if (window.onFormLoad) window.onFormLoad();
  });
  window.addEventListener("resize", () => {
    if (window.onFormResize) window.onFormResize({ width: window.innerWidth, height: window.innerHeight });
  });
  window.addEventListener("beforeunload", () => {
    if (window.onFormClose) window.onFormClose();
  });
  ${spec.fullscreen !== false ? `
  (function() {
    var attempts = 0;
    function attempt() {
      if (typeof window.requestInitialFullscreen === "function") {
        try {
          var p = window.requestInitialFullscreen();
          if (p && typeof p.then === "function") {
            p.then(function(res) {
              if ((!res || !res.isFullscreen) && attempts++ < 25) {
                setTimeout(attempt, 150);
              }
            }).catch(function() {
              if (attempts++ < 25) setTimeout(attempt, 150);
            });
            return;
          }
        } catch(e) {}
      }
      if (typeof window.toggleNativeFullscreen === "function") {
        try { window.toggleNativeFullscreen(); } catch(e) {}
      } else if (typeof window.toggleFullscreen === "function") {
        try { window.toggleFullscreen(); } catch(e) {}
      }
      if (attempts++ < 25) {
        setTimeout(attempt, 150);
      }
    }
    setTimeout(attempt, 80);
    window.addEventListener("DOMContentLoaded", function() { setTimeout(attempt, 120); });
    window.addEventListener("load", function() { setTimeout(attempt, 200); });
  })();
  ` : ''}
</script>
</body>
</html>`;
}
