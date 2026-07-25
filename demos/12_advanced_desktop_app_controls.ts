/**
 * ⚡ Bun RAD Studio Demo 12: Advanced Desktop Application Controls Studio
 * 
 * Demonstrates:
 * - 5 Additional Desktop Controls:
 *   1. property_grid: Two-column key-value property inspector table widget
 *   2. popup_menu: Desktop context & action popup menu
 *   3. calendar_view: Full month calendar grid view widget
 *   4. color_swatch: Color palette swatch selection grid
 *   5. file_path_bar: Desktop location address bar with Browse button
 * - Backend IPC Event Bindings & Live Status Updates
 * - Dynamic Helper Functions: setPropertyGridData, setPopupMenuItems, setCalendarDate, setColorSwatchColor, setFilePathBarPath, setToast, setStatusBarText
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative } from "../index.ts";

const formSpec = {
    title: "Demo 12 - Advanced Desktop Application Controls Studio",
    width: 980,
    height: 720,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 20,
    controls: [
        // App Action Toolbar
        {
            id: "desktop_toolbar",
            control_type: "tool_bar",
            x: 20, y: 15, width: 940, height: 40,
            text: "⚡ RAD Inspector, 📋 Update Specs, 📅 Today's Date, 🎨 Theme Swatch, 📁 Change Path, 🔔 Test Toast",
            event_handlers: { onClick: "on_desktop_toolbar_click" }
        },

        // Section 1 Header: Desktop Inspector & Actions
        { id: "lbl_sec1", control_type: "label", x: 20, y: 65, width: 450, height: 24, text: "📋 Desktop Property Grid & Context Action Menu", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        // 1. Property Grid Inspector
        {
            id: "prop_inspector",
            control_type: "property_grid",
            x: 20, y: 95, width: 450, height: 230,
            text: "Application: Bun RAD Studio, Version: 1.4.0, Runtime: Bun v1.3.14, Platform: macOS arm64, Theme: Dark Slate, Memory Usage: 34.2 MB, Active License: Enterprise",
            caption: "System & Application Property Inspector",
            event_handlers: { onClick: "on_prop_inspector_click" }
        },

        // 2. Popup Context Menu
        {
            id: "ctx_menu",
            control_type: "popup_menu",
            x: 490, y: 95, width: 220, height: 230,
            text: "✂️ Cut  ⌘X, 📋 Copy  ⌘C, 📄 Paste  ⌘V, ---, 🔍 Search Symbol  ⌘F, 🛠️ Refactor Code, ---, 🗑️ Delete Item  ⌫",
            event_handlers: { onClick: "on_ctx_menu_click" }
        },

        // Notification Toast
        {
            id: "status_toast",
            control_type: "toast_card",
            x: 725, y: 95, width: 235, height: 230,
            text: "Desktop Controls Active",
            placeholder: "All 5 advanced desktop controls initialized cleanly.",
            alert_type: "success"
        },

        // Divider
        { id: "div_mid", control_type: "divider", x: 20, y: 340, width: 940, height: 2 },

        // Section 2 Header: Calendar, Color Swatch & Location Bar
        { id: "lbl_sec2", control_type: "label", x: 20, y: 355, width: 450, height: 24, text: "📅 Month Calendar, Swatch Palette & Location Path", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        // 3. Calendar View Widget
        {
            id: "app_calendar",
            control_type: "calendar_view",
            x: 20, y: 385, width: 280, height: 220,
            text: "July 2026",
            event_handlers: { onChange: "on_app_calendar_change" }
        },

        // 4. Color Swatch Palette Grid
        {
            id: "color_palette",
            control_type: "color_swatch",
            x: 320, y: 385, width: 320, height: 90,
            text: "#0284c7, #38bdf8, #10b981, #f59e0b, #ef4444, #7c3aed, #ec4899",
            caption: "Active Theme Swatch Palette",
            value: "#38bdf8",
            event_handlers: { onChange: "on_color_palette_change" }
        },

        // 5. File Path Location Bar
        {
            id: "path_bar",
            control_type: "file_path_bar",
            x: 320, y: 490, width: 640, height: 40,
            text: "/Users/codecaine/bun_rad_studio/demos/12_advanced_desktop_app_controls.ts",
            event_handlers: { onClick: "on_path_bar_click" }
        },

        // Action Buttons Row
        {
            id: "btn_inspect_update",
            control_type: "button",
            x: 320, y: 550, width: 200, height: 38,
            text: "🔄 Update Inspector",
            background_color: "#0284c7",
            event_handlers: { onClick: "on_btn_inspect_update_click" }
        },
        {
            id: "btn_calendar_today",
            control_type: "button",
            x: 535, y: 550, width: 200, height: 38,
            text: "📅 Jump to August 2026",
            background_color: "#7c3aed",
            event_handlers: { onClick: "on_btn_calendar_today_click" }
        },
        {
            id: "btn_path_reset",
            control_type: "button",
            x: 750, y: 550, width: 210, height: 38,
            text: "📁 Reset Project Path",
            background_color: "#059669",
            event_handlers: { onClick: "on_btn_path_reset_click" }
        },

        // Window Status Bar
        {
            id: "desktop_status_bar",
            control_type: "status_bar",
            x: 20, y: 625, width: 940, height: 32,
            text: "Ready | 5 Desktop Controls Active",
            event_handlers: { onClick: "on_status_bar_click" }
        }
    ]
};

console.log("⚡ Launching Bun RAD Studio Demo 12: Advanced Desktop Application Controls Studio...");

const htmlContent = generatePreviewHtml(formSpec);
const webview = new Webview(true, {
    width: formSpec.width,
    height: formSpec.height,
    title: formSpec.title,
    hints: SizeHint.NONE
});

webview.setHTML(htmlContent);

// Helper script execution
function execJS(code: string) {
    try {
        webview.eval(code);
    } catch (err) {
        console.error("ExecJS Error:", err);
    }
}

// Backend IPC Event Handlers
webview.bind("on_desktop_toolbar_click", (action?: string) => {
    const act = action || "Action";
    console.log(`[IPC] Desktop Toolbar Clicked: ${act}`);
    
    if (act.includes("Inspector")) {
        execJS(`if (window.setPropertyGridData) window.setPropertyGridData("prop_inspector", "Mode: Live Production, Threads: 8, FFI Window: Native Cocoa, FPS: 60");`);
        execJS(`if (window.setToast) window.setToast("status_toast", "Inspector Updated", "Set live production metrics.", "info");`);
    } else if (act.includes("Date")) {
        execJS(`if (window.setCalendarDate) window.setCalendarDate("app_calendar", "August 2026");`);
    } else if (act.includes("Swatch")) {
        execJS(`if (window.setColorSwatchColor) window.setColorSwatchColor("color_palette", "#10b981");`);
    } else if (act.includes("Path")) {
        execJS(`if (window.setFilePathBarPath) window.setFilePathBarPath("path_bar", "/usr/local/bin/bun");`);
    } else if (act.includes("Toast")) {
        execJS(`if (window.setToast) window.setToast("status_toast", "Test Trigger", "Notification alert popped successfully!", "warning");`);
    }

    execJS(`if (window.setStatusBarText) window.setStatusBarText("desktop_status_bar", "Toolbar Action: ${act}");`);
});

webview.bind("on_ctx_menu_click", (item?: string) => {
    const it = item || "Action";
    console.log(`[IPC] Context Menu Action: ${it}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("desktop_status_bar", "Context Menu Action: ${it}");
        if (window.setToast) window.setToast("status_toast", "Menu Action", "Executed ${it} action.", "success");
    `);
});

webview.bind("on_app_calendar_change", (day?: number | string) => {
    const d = day || 25;
    console.log(`[IPC] Calendar Selected Day: ${d}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("desktop_status_bar", "Selected Date: July ${d}, 2026");
    `);
});

webview.bind("on_color_palette_change", (colorHex?: string) => {
    const hex = colorHex || "#0284c7";
    console.log(`[IPC] Color Swatch Changed: ${hex}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("desktop_status_bar", "Active Theme Accent Color: ${hex}");
        if (window.setToast) window.setToast("status_toast", "Color Updated", "Selected accent color: ${hex}", "info");
    `);
});

webview.bind("on_path_bar_click", (pathStr?: string) => {
    const pathVal = pathStr || "Path";
    console.log(`[IPC] Browse Location Clicked: ${pathVal}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("desktop_status_bar", "Opening File Dialog for: ${pathVal}");
        if (window.setToast) window.setToast("status_toast", "Browse Triggered", "Opened file picker dialog.", "info");
    `);
});

webview.bind("on_btn_inspect_update_click", () => {
    console.log("[IPC] Button Clicked: Update Inspector");
    execJS(`
        if (window.setPropertyGridData) window.setPropertyGridData("prop_inspector", "Build Target: Bun Native, CPU Usage: 1.2%, Heap: 14.8 MB, Status: Healthy");
        if (window.setStatusBarText) window.setStatusBarText("desktop_status_bar", "Property Inspector Refreshed.");
    `);
});

webview.bind("on_btn_calendar_today_click", () => {
    console.log("[IPC] Button Clicked: Jump to August 2026");
    execJS(`
        if (window.setCalendarDate) window.setCalendarDate("app_calendar", "August 2026");
        if (window.setStatusBarText) window.setStatusBarText("desktop_status_bar", "Calendar set to August 2026.");
    `);
});

webview.bind("on_btn_path_reset_click", () => {
    console.log("[IPC] Button Clicked: Reset Project Path");
    execJS(`
        if (window.setFilePathBarPath) window.setFilePathBarPath("path_bar", "/Users/codecaine/bun_rad_studio");
        if (window.setStatusBarText) window.setStatusBarText("desktop_status_bar", "File path reset to project root.");
    `);
});

// Run window loop
webview.run();
