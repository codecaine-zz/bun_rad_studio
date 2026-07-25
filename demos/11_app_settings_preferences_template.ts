/**
 * ⚡ Bun RAD Studio Demo 11: Desktop App Settings & Preferences Studio Template
 * 
 * Demonstrates:
 * - Comprehensive Desktop Preferences & Application Configuration Window Template
 * - Tabbed Setting Categories (tabs, segmented_control, tool_bar, command_palette)
 * - Grouped Setting Sections (groupbox, panel, divider)
 * - Rich Labeled Form Controls (form_field, form_password, form_dropdown, form_color, form_stepper, form_slider, form_switch, form_checkbox, form_drop_zone)
 * - Action Controls & Status Banners (toggle_button, alert_banner, status_bar)
 * - Interactive IPC Handlers for setting changes, preset saves, and window pinning
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative } from "../index.ts";

const settingsSpec = {
    title: "Demo 11 - Desktop App Settings & Preferences Studio Template",
    width: 980,
    height: 720,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 20,
    controls: [
        // Top Action Bar
        {
            id: "settings_toolbar",
            control_type: "tool_bar",
            x: 20, y: 15, width: 940, height: 40,
            text: "💾 Save Preferences, 🔄 Reset Defaults, 📤 Export JSON, 📌 Pin Window, ⚙️ System Info",
            event_handlers: { onClick: "on_settings_toolbar_click" }
        },

        // Setting Category Tabs
        {
            id: "settings_tabs",
            control_type: "tabs",
            x: 20, y: 65, width: 520, height: 40,
            text: "General, Appearance & Theme, Security & API, Storage & Sync",
            value: "General",
            event_handlers: { onChange: "on_settings_tabs_change" }
        },

        // Setting Search Bar
        {
            id: "settings_cmd",
            control_type: "command_palette",
            x: 555, y: 65, width: 405, height: 40,
            placeholder: "Search settings (e.g. font size, API key, dark mode)...",
            event_handlers: { onChange: "on_settings_cmd_change" }
        },

        // Left Column: General & System Preferences
        { id: "lbl_general_header", control_type: "label", x: 20, y: 118, width: 450, height: 24, text: "⚙️ General Application & Identity Settings", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        {
            id: "pref_app_name",
            control_type: "form_field",
            x: 20, y: 150, width: 215, height: 44,
            text: "Application Title:",
            placeholder: "Bun RAD Desktop Studio",
            event_handlers: { onChange: "on_pref_change" }
        },
        {
            id: "pref_org_name",
            control_type: "form_field",
            x: 250, y: 150, width: 220, height: 44,
            text: "Organization Name:",
            placeholder: "Acme Enterprises Inc.",
            event_handlers: { onChange: "on_pref_change" }
        },

        {
            id: "pref_lang_dropdown",
            control_type: "form_dropdown",
            x: 20, y: 205, width: 450, height: 44,
            text: "Default Interface Language:",
            event_handlers: { onChange: "on_pref_change" }
        },

        {
            id: "pref_autostart_switch",
            control_type: "form_switch",
            x: 20, y: 260, width: 450, height: 32,
            text: "Launch App Automatically on System Startup",
            checked: true,
            event_handlers: { onClick: "on_pref_switch_toggle" }
        },
        {
            id: "pref_autoupdate_switch",
            control_type: "form_switch",
            x: 20, y: 300, width: 450, height: 32,
            text: "Automatically Download & Install Software Updates",
            checked: true,
            event_handlers: { onClick: "on_pref_switch_toggle" }
        },
        {
            id: "pref_telemetry_switch",
            control_type: "form_switch",
            x: 20, y: 340, width: 450, height: 32,
            text: "Send Anonymous Performance & Usage Analytics",
            checked: false,
            event_handlers: { onClick: "on_pref_switch_toggle" }
        },

        // Right Column: Appearance & Theme Controls
        { id: "lbl_theme_header", control_type: "label", x: 490, y: 118, width: 470, height: 24, text: "🎨 Appearance, Themes & Accessibility", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        {
            id: "pref_theme_color",
            control_type: "form_color",
            x: 490, y: 150, width: 225, height: 44,
            text: "Primary Accent Swatch:",
            value: "#0284c7",
            event_handlers: { onChange: "on_pref_color_change" }
        },
        {
            id: "pref_font_stepper",
            control_type: "form_stepper",
            x: 730, y: 150, width: 230, height: 44,
            text: "UI Font Size (px):",
            value: 14,
            event_handlers: { onChange: "on_pref_font_change" }
        },

        {
            id: "pref_opacity_slider",
            control_type: "form_slider",
            x: 490, y: 205, width: 470, height: 44,
            text: "Window Glassmorphism Transparency Level:",
            value: 90,
            event_handlers: { onChange: "on_pref_slider_change" }
        },

        // Security & API Section
        { id: "lbl_sec_header", control_type: "label", x: 490, y: 260, width: 470, height: 24, text: "🔒 Security & API Access Credentials", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        {
            id: "pref_api_key",
            control_type: "form_password",
            x: 490, y: 290, width: 225, height: 44,
            text: "Master Cloud API Secret Key:",
            placeholder: "••••••••••••",
            event_handlers: { onChange: "on_pref_change" }
        },
        {
            id: "pref_2fa_chk",
            control_type: "form_checkbox",
            x: 730, y: 290, width: 230, height: 44,
            text: "Multi-Factor Authentication:",
            placeholder: "Require SMS / TOTP",
            checked: true,
            event_handlers: { onChange: "on_pref_change" }
        },

        // Drop Zone for SSL / License Key
        {
            id: "pref_cert_drop",
            control_type: "form_drop_zone",
            x: 490, y: 345, width: 470, height: 85,
            text: "Security Certificate / License File Target:",
            placeholder: "Drag & drop SSL certificate (.pem, .crt) or license key..."
        },

        // Bottom Action Buttons
        {
            id: "btn_save_prefs",
            control_type: "button",
            x: 20, y: 525, width: 160, height: 38,
            text: "💾 Save Preferences",
            background_color: "#10b981",
            event_handlers: { onClick: "on_btn_save_prefs_click" }
        },
        {
            id: "btn_reset_prefs",
            control_type: "button",
            x: 190, y: 525, width: 150, height: 38,
            text: "🔄 Reset Defaults",
            background_color: "#64748b",
            event_handlers: { onClick: "on_btn_reset_prefs_click" }
        },
        {
            id: "btn_toggle_pin",
            control_type: "toggle_button",
            x: 350, y: 525, width: 140, height: 38,
            text: "📌 Pin Window",
            checked: true,
            event_handlers: { onClick: "on_btn_toggle_pin_click" }
        },
        {
            id: "prefs_alert_banner",
            control_type: "alert_banner",
            x: 500, y: 525, width: 460, height: 38,
            alert_type: "success",
            text: "All Preferences Saved & Applied to Runtime Engine"
        },

        // Status Bar
        {
            id: "settings_status_bar",
            control_type: "status_bar",
            x: 20, y: 585, width: 940, height: 28,
            text: "Config Target: ~/.config/bun_rad_studio.json | Theme: Dark | Bun RAD Engine v1.3"
        }
    ]
};

console.log("⚡ Launching Bun RAD Studio Demo 11: Desktop App Settings & Preferences Studio...");

const htmlContent = generatePreviewHtml(settingsSpec);

const webview = new Webview(true, {
    width: 980,
    height: 720,
    hint: SizeHint.NONE
});

webview.title = settingsSpec.title;

function execJS(code: string) {
    try { webview.eval(code); } catch (e) { console.error("JS Execution Error:", e); }
}

let isWindowPinned = true;

setAlwaysOnTopNative(webview, true);

webview.bind("toggleFullscreenBackend", () => {
    toggleFullscreenNative(webview);
});

webview.bind("quitApp", () => {
    console.log("👋 Application exit requested.");
    process.exit(0);
});

// IPC Event Handlers
webview.bind("on_settings_toolbar_click", (action?: string) => {
    console.log(`⚡ [IPC] Settings Toolbar Click: ${action}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "🛠️ Action: ${action || 'Action'}");
        if (window.setAlertBannerText) window.setAlertBannerText("prefs_alert_banner", "${action || 'Action'} Executed");
    `);
});

webview.bind("on_settings_tabs_change", (tabName?: string) => {
    console.log(`⚡ [IPC] Settings Tab Switch: ${tabName}`);
    execJS(`
        if (window.setTabsActive) window.setTabsActive("settings_tabs", "${tabName || 'General'}");
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "⚙️ Category: ${tabName || 'General'} Settings");
    `);
});

webview.bind("on_settings_cmd_change", (val?: string) => {
    console.log(`⚡ [IPC] Settings Search Query: ${val}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "🔍 Filtering settings matching '${val}'");
    `);
});

webview.bind("on_pref_change", (val?: any) => {
    console.log(`⚡ [IPC] Preference Value Changed: ${val}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "✏️ Modified Setting Value");
    `);
});

webview.bind("on_pref_switch_toggle", (val?: any) => {
    console.log(`⚡ [IPC] Preference Switch Toggled`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "🎛️ Toggle Setting Updated");
    `);
});

webview.bind("on_pref_color_change", (hex?: string) => {
    console.log(`⚡ [IPC] Accent Color Picker Changed: ${hex}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "🎨 Accent Theme Color: ${hex}");
    `);
});

webview.bind("on_pref_font_change", (size?: any) => {
    console.log(`⚡ [IPC] UI Font Size Changed: ${size}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "🔤 UI Font Size: ${size}px");
    `);
});

webview.bind("on_pref_slider_change", (val?: any) => {
    console.log(`⚡ [IPC] Transparency Level Changed: ${val}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "💧 Window Opacity: ${val}%");
    `);
});

webview.bind("on_btn_save_prefs_click", () => {
    console.log("⚡ [IPC] Saving Preferences to Disk...");
    execJS(`
        if (window.setAlertBannerText) window.setAlertBannerText("prefs_alert_banner", "💾 Preferences Saved to ~/.config/bun_rad_studio.json");
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "✅ Config File Written Successfully");
    `);
});

webview.bind("on_btn_reset_prefs_click", () => {
    console.log("⚡ [IPC] Resetting Preferences to Default Settings...");
    execJS(`
        if (window.setAlertBannerText) window.setAlertBannerText("prefs_alert_banner", "🔄 Restored Factory Default Settings");
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "⚠️ Settings Reset to Defaults");
    `);
});

webview.bind("on_btn_toggle_pin_click", () => {
    isWindowPinned = !isWindowPinned;
    console.log(`⚡ [IPC] Toggling Window Pin state: ${isWindowPinned}`);
    setAlwaysOnTopNative(webview, isWindowPinned);
    const label = isWindowPinned ? "📌 Pinned Window" : "🔓 Unpinned Window";
    execJS(`
        if (window.setToggleButtonState) window.setToggleButtonState("btn_toggle_pin", ${isWindowPinned}, "${label}");
        if (window.setStatusBarText) window.setStatusBarText("settings_status_bar", "${isWindowPinned ? "📌 Window Pinned Always On Top" : "🔓 Window Unpinned"}");
    `);
});

webview.setHTML(htmlContent);

webview.run();
