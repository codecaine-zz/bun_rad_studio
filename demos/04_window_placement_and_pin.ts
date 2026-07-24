/**
 * ⚡ Bun RAD Studio Demo 4: Native Window Placement API & Pin Management
 * 
 * Demonstrates:
 * - 9 Window Placement Presets (center, upper_left, upper_right, top_center, bottom_left, bottom_right, bottom_center, center_left, center_right)
 * - Always On Top Window Pinning (setAlwaysOnTopNative)
 * - macOS Cocoa Native Fullscreen Toggling (toggleFullscreenNative)
 * - Application Quit Handler (process.exit(0))
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, setWindowPositionNative, toggleFullscreenNative } from "../index.ts";

const formSpec = {
    title: "Demo 4 - Native Window Placement & Pin API",
    width: 820,
    height: 540,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 24,
    spacing: 14,
    controls: [
        { id: "lblTitle", type: "label", caption: "🖼️ Native Window Placement & Pinning Manager", left: 24, top: 20, width: 550, height: 28, font_size: 18, font_weight: "700" },
        { id: "lblStatus", type: "label", caption: "Click any window placement button below to instantly move the application window across the screen...", left: 24, top: 52, width: 750, height: 20, font_size: 13, font_color: "#38bdf8" },

        // 3x3 Window Placement Grid Buttons
        { id: "btnTopLeft", type: "button", caption: "↖ Upper Left", left: 24, top: 95, width: 230, height: 42, background_color: "#3b82f6", event_handlers: { onClick: "on_btnTopLeft_click" } },
        { id: "btnTopCenter", type: "button", caption: "⬆ Top Center", left: 270, top: 95, width: 230, height: 42, background_color: "#3b82f6", event_handlers: { onClick: "on_btnTopCenter_click" } },
        { id: "btnTopRight", type: "button", caption: "↗ Upper Right", left: 516, top: 95, width: 230, height: 42, background_color: "#3b82f6", event_handlers: { onClick: "on_btnTopRight_click" } },

        { id: "btnCenterLeft", type: "button", caption: "⬅ Center Left", left: 24, top: 150, width: 230, height: 42, background_color: "#3b82f6", event_handlers: { onClick: "on_btnCenterLeft_click" } },
        { id: "btnCenter", type: "button", caption: "🎯 Center Screen", left: 270, top: 150, width: 230, height: 42, background_color: "#0284c7", font_weight: "700", event_handlers: { onClick: "on_btnCenter_click" } },
        { id: "btnCenterRight", type: "button", caption: "➡ Center Right", left: 516, top: 150, width: 230, height: 42, background_color: "#3b82f6", event_handlers: { onClick: "on_btnCenterRight_click" } },

        { id: "btnBottomLeft", type: "button", caption: "↙ Lower Left", left: 24, top: 205, width: 230, height: 42, background_color: "#3b82f6", event_handlers: { onClick: "on_btnBottomLeft_click" } },
        { id: "btnBottomCenter", type: "button", caption: "⬇ Bottom Center", left: 270, top: 205, width: 230, height: 42, background_color: "#3b82f6", event_handlers: { onClick: "on_btnBottomCenter_click" } },
        { id: "btnBottomRight", type: "button", caption: "↘ Lower Right", left: 516, top: 205, width: 230, height: 42, background_color: "#3b82f6", event_handlers: { onClick: "on_btnBottomRight_click" } },

        // Pinning & Fullscreen Action Controls
        { id: "pnlPin", type: "groupbox", title: "📌 Always On Top & Fullscreen Toggles", left: 24, top: 270, width: 722, height: 110 },
        { id: "btnTogglePin", type: "button", caption: "📌 Toggle Stay On Top (OFF)", left: 40, top: 305, width: 220, height: 44, background_color: "#475569", event_handlers: { onClick: "on_btnTogglePin_click" } },
        { id: "btnToggleFs", type: "button", caption: "⛶ Toggle Fullscreen (Cmd+F)", left: 275, top: 305, width: 220, height: 44, background_color: "#10b981", event_handlers: { onClick: "on_btnToggleFs_click" } },
        { id: "btnQuitApp", type: "button", caption: "❌ Quit App (Cmd+Q)", left: 510, top: 305, width: 215, height: 44, background_color: "#ef4444", event_handlers: { onClick: "on_btnQuitApp_click" } },

        // Result Status Panel
        { id: "pnlOutput", type: "groupbox", title: "⚡ FFI Window Lifecycle Log", left: 24, top: 400, width: 722, height: 100 },
        { id: "lblLog", type: "label", caption: "Window handle initialized. Current position: Center Screen.", left: 40, top: 430, width: 680, height: 50, font_size: 13, font_color: "#38bdf8" }
    ]
};

const html = generatePreviewHtml(formSpec);
const wv = new Webview();
wv.setHTML(html);
wv.title = "Bun RAD Studio - Demo 4: Window Placement & Pin";
wv.size = { width: 820, height: 540, hint: SizeHint.NONE };

let isPinned = false;

function execJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("JS Error:", e); }
}

function updateLog(msg: string) {
    execJS(`document.getElementById("lblLog").textContent = ${JSON.stringify(msg)};`);
}

// Global hotkey IPC bindings
wv.bind("toggleNativeFullscreen", () => {
    console.log("⚡ [IPC] Toggling Fullscreen via Hotkey (Cmd+F / F11)");
    toggleFullscreenNative(wv);
    updateLog("⛶ Native Cocoa toggleFullScreen invoked via Hotkey!");
});

wv.bind("quitApp", () => {
    console.log("⚡ [IPC] Quitting App via Hotkey (Cmd+Q / Alt+F4)");
    process.exit(0);
});

// Window Placement Handlers
wv.bind("on_btnTopLeft_click", () => {
    console.log("⚡ [IPC] Moving window to Upper Left");
    setWindowPositionNative(wv, "upper_left", 820, 540);
    updateLog("↖ Window repositioned to: Upper Left");
});
wv.bind("on_btnTopCenter_click", () => {
    console.log("⚡ [IPC] Moving window to Top Center");
    setWindowPositionNative(wv, "top_center", 820, 540);
    updateLog("⬆ Window repositioned to: Top Center");
});
wv.bind("on_btnTopRight_click", () => {
    console.log("⚡ [IPC] Moving window to Upper Right");
    setWindowPositionNative(wv, "upper_right", 820, 540);
    updateLog("↗ Window repositioned to: Upper Right");
});
wv.bind("on_btnCenterLeft_click", () => {
    console.log("⚡ [IPC] Moving window to Center Left");
    setWindowPositionNative(wv, "center_left", 820, 540);
    updateLog("⬅ Window repositioned to: Center Left");
});
wv.bind("on_btnCenter_click", () => {
    console.log("⚡ [IPC] Moving window to Center Screen");
    setWindowPositionNative(wv, "center", 820, 540);
    updateLog("🎯 Window repositioned to: Center Screen");
});
wv.bind("on_btnCenterRight_click", () => {
    console.log("⚡ [IPC] Moving window to Center Right");
    setWindowPositionNative(wv, "center_right", 820, 540);
    updateLog("➡ Window repositioned to: Center Right");
});
wv.bind("on_btnBottomLeft_click", () => {
    console.log("⚡ [IPC] Moving window to Lower Left");
    setWindowPositionNative(wv, "bottom_left", 820, 540);
    updateLog("↙ Window repositioned to: Lower Left");
});
wv.bind("on_btnBottomCenter_click", () => {
    console.log("⚡ [IPC] Moving window to Bottom Center");
    setWindowPositionNative(wv, "bottom_center", 820, 540);
    updateLog("⬇ Window repositioned to: Bottom Center");
});
wv.bind("on_btnBottomRight_click", () => {
    console.log("⚡ [IPC] Moving window to Lower Right");
    setWindowPositionNative(wv, "bottom_right", 820, 540);
    updateLog("↘ Window repositioned to: Lower Right");
});

// Always On Top Pin Handler
wv.bind("on_btnTogglePin_click", () => {
    isPinned = !isPinned;
    console.log("⚡ [IPC] Setting Always On Top:", isPinned);
    setAlwaysOnTopNative(wv, isPinned);
    execJS(`
        const btn = document.getElementById("btnTogglePin");
        btn.textContent = ${isPinned ? '"📌 Pin: ENABLED (ON)"' : '"📌 Pin: DISABLED (OFF)"'};
        btn.style.background = ${isPinned ? '"#0284c7"' : '"#475569"'};
    `);
    updateLog(isPinned ? "📌 Always On Top ENABLED: Window floats above all OS windows." : "📌 Always On Top DISABLED: Normal window level.");
});

// Fullscreen Handler
wv.bind("on_btnToggleFs_click", () => {
    console.log("⚡ [IPC] Toggling Fullscreen");
    toggleFullscreenNative(wv);
    updateLog("⛶ Native Cocoa toggleFullScreen invoked!");
});

// Quit App Handler
wv.bind("on_btnQuitApp_click", () => {
    console.log("⚡ Exiting Demo 4 via Quit button...");
    process.exit(0);
});

console.log("🚀 Running Bun RAD Studio Demo 4: Native Window Placement & Pin...");
wv.run();
