/**
 * ⚡ Bun RAD Studio Demo 7: Labeled Form Controls & Desktop App UI Controls
 * 
 * Demonstrates:
 * - Integrated Labeled Controls: form_field, form_password, form_textarea, form_checkbox, form_radio, form_search, form_color, form_time, form_stepper, form_code, form_drop_zone
 * - Desktop Application UI Controls: tabs, tool_bar, status_bar, split_pane, pagination, command_palette, toggle_button
 * - Interactive event handlers & IPC bindings (onClick, onChange)
 * - Helper function calls: setTabsActive, setStatusBarText, setPaginationPage, setToggleButtonState, setToast
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative } from "../index.ts";

const formSpec = {
    title: "Demo 7 - Interactive Labeled & Desktop Application Controls",
    width: 960,
    height: 700,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 20,
    controls: [
        // Top Window Action Toolbar
        { 
            id: "app_toolbar", 
            control_type: "tool_bar", 
            x: 20, y: 15, width: 920, height: 40, 
            text: "📄 New Project, 📂 Open File, 💾 Save Spec, ⚙️ Settings, 🔍 Search, 🚀 Run App",
            event_handlers: { onClick: "on_app_toolbar_click" }
        },

        // Command Palette Search Bar
        { 
            id: "cmd_palette", 
            control_type: "command_palette", 
            x: 20, y: 65, width: 440, height: 40, 
            placeholder: "Type a command or search actions (⌘K)...", 
            text: "Open Customer Database",
            event_handlers: { onChange: "on_cmd_palette_change" }
        },
        
        // Navigation Tabs Bar
        { 
            id: "nav_tabs", 
            control_type: "tabs", 
            x: 480, y: 65, width: 460, height: 40, 
            text: "Customer Profile, Billing & Plan, Security, System Script", 
            value: "Customer Profile",
            event_handlers: { onChange: "on_nav_tabs_change" }
        },

        // Column 1: Labeled Form Inputs
        { id: "lbl_col1_header", control_type: "label", x: 20, y: 120, width: 440, height: 24, text: "📝 Integrated Labeled Form Controls", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        { 
            id: "form_name", 
            control_type: "form_field", 
            x: 20, y: 150, width: 210, height: 44, 
            text: "Full Name:", 
            placeholder: "e.g. Alex Mercer",
            event_handlers: { onChange: "on_form_name_change" }
        },
        { 
            id: "form_email", 
            control_type: "form_field", 
            x: 250, y: 150, width: 210, height: 44, 
            text: "Email Address:", 
            placeholder: "alex@example.com",
            event_handlers: { onChange: "on_form_email_change" }
        },

        { 
            id: "form_pwd", 
            control_type: "form_password", 
            x: 20, y: 205, width: 210, height: 44, 
            text: "Master Key Password:", 
            placeholder: "••••••••",
            event_handlers: { onChange: "on_form_pwd_change" }
        },
        { 
            id: "form_search_input", 
            control_type: "form_search", 
            x: 250, y: 205, width: 210, height: 44, 
            text: "Filter Database Records:", 
            placeholder: "Search keywords...",
            event_handlers: { onChange: "on_form_search_input_change" }
        },

        { 
            id: "form_chk", 
            control_type: "form_checkbox", 
            x: 20, y: 260, width: 210, height: 44, 
            text: "Two-Factor Auth:", 
            placeholder: "Enable SMS / OTP Validation", 
            checked: true,
            event_handlers: { onChange: "on_form_chk_change" }
        },
        { 
            id: "form_rad", 
            control_type: "form_radio", 
            x: 250, y: 260, width: 210, height: 44, 
            text: "Subscription Tier:", 
            placeholder: "Enterprise Pro Plan", 
            checked: true,
            event_handlers: { onChange: "on_form_rad_change" }
        },

        { 
            id: "form_clr", 
            control_type: "form_color", 
            x: 20, y: 315, width: 210, height: 44, 
            text: "Accent Theme Swatch:", 
            value: "#0284c7",
            event_handlers: { onChange: "on_form_clr_change" }
        },
        { 
            id: "form_clock", 
            control_type: "form_time", 
            x: 250, y: 315, width: 210, height: 44, 
            text: "Scheduled Backup Time:", 
            value: "14:30",
            event_handlers: { onChange: "on_form_clock_change" }
        },

        { 
            id: "form_num_step", 
            control_type: "form_stepper", 
            x: 20, y: 370, width: 440, height: 40, 
            text: "Max Parallel Worker Processes:", 
            value: 8,
            event_handlers: { onChange: "on_form_num_step_change" }
        },

        // Column 2: Advanced Containers & Layout Controls
        { id: "lbl_col2_header", control_type: "label", x: 480, y: 120, width: 460, height: 24, text: "🖥️ Desktop App Layout & Code Controls", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        // Labeled Code View
        { 
            id: "form_code_editor", 
            control_type: "form_code", 
            x: 480, y: 150, width: 460, height: 130, 
            text: "Active Tab Logic / Script:", 
            code: "// Customer Profile Tab Handler\nexport function onTabChange(tabName) {\n    console.log('⚡ Active Tab:', tabName);\n}" 
        },

        // Labeled Drop Zone File Target
        { 
            id: "form_upload_zone", 
            control_type: "form_drop_zone", 
            x: 480, y: 290, width: 460, height: 100, 
            text: "Attachment File Drop Zone:", 
            placeholder: "Drag & drop SSL certificates or SQLite database file..." 
        },

        // Split Pane Layout
        { 
            id: "desktop_split", 
            control_type: "split_pane", 
            x: 20, y: 425, width: 620, height: 140, 
            text: "📁 Project Explorer (index.ts, schema.sql, config.json) | ⚡ Interactive Webview Live Preview Details" 
        },

        // Action Controls & Toggle Button
        { 
            id: "btn_toggle_pin", 
            control_type: "toggle_button", 
            x: 655, y: 425, width: 140, height: 40, 
            text: "📌 Pin Window", 
            checked: true,
            event_handlers: { onClick: "on_btn_toggle_pin_click" }
        },
        { 
            id: "btn_prev_tab", 
            control_type: "button", 
            x: 805, y: 425, width: 135, height: 40, 
            text: "🔄 Next Tab", 
            background_color: "#0284c7",
            event_handlers: { onClick: "on_btn_prev_tab_click" }
        },

        // Pagination Navigation Bar
        { 
            id: "data_pagination", 
            control_type: "pagination", 
            x: 655, y: 475, width: 285, height: 36,
            event_handlers: { onClick: "on_data_pagination_click" }
        },

        // Status Card Result Box
        { id: "status_card", control_type: "alert_banner", x: 655, y: 520, width: 285, height: 45, alert_type: "success", text: "Ready: Click or edit any control!" },

        // Bottom Window Status Bar
        { id: "app_status_bar", control_type: "status_bar", x: 20, y: 580, width: 920, height: 28, text: "UTF-8 | Line 42, Col 18 | Desktop RAD Engine v1.3" }
    ]
};

console.log("⚡ Launching Bun RAD Studio Demo 7: Labeled & Desktop Controls Studio...");

const htmlContent = generatePreviewHtml(formSpec);

const webview = new Webview(true, {
    width: 960,
    height: 700,
    hint: SizeHint.NONE
});

webview.title = formSpec.title;

// Helper to safely execute JS in webview
function execJS(code: string) {
    try { webview.eval(code); } catch (e) { console.error("JS Execution Error:", e); }
}

// Track application state
let isWindowPinned = true;
let currentTabIndex = 0;
const tabsList = ["Customer Profile", "Billing & Plan", "Security", "System Script"];
const codeSnippets: Record<string, string> = {
    "Customer Profile": "// Customer Profile Tab Handler\nexport function onTabChange(tabName) {\n    console.log('⚡ Active Tab:', tabName);\n}",
    "Billing & Plan": "// Enterprise Billing & Subscription Manager\nexport function checkSubscription() {\n    return { plan: 'Enterprise Pro', active: true };\n}",
    "Security": "// 2FA Security & Master Key Validation\nexport function validateMasterKey(key) {\n    return key && key.length >= 8;\n}",
    "System Script": "// Bun System Worker Thread Pool\nexport function startWorkerPool(threads = 8) {\n    console.log('🚀 Spawning ' + threads + ' worker threads...');\n}"
};

// Bind native helpers
setAlwaysOnTopNative(webview, true);

webview.bind("toggleFullscreenBackend", () => {
    toggleFullscreenNative(webview);
});

webview.bind("quitApp", () => {
    console.log("👋 Application exit requested.");
    process.exit(0);
});

// IPC Event Handlers for UI Controls

// Toolbar Action Clicked
webview.bind("on_app_toolbar_click", (itemName?: string) => {
    const item = itemName || "Toolbar Item";
    console.log(`⚡ [IPC] Toolbar Action Clicked: ${item}`);
    execJS(`
        const msg = "🛠️ Toolbar Action: ${item}";
        if (window.setStatusBarText) window.setStatusBarText("app_status_bar", msg);
        const card = document.getElementById("status_card");
        if (card) {
            card.style.borderLeftColor = "#38bdf8";
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Tab Switch Handler
webview.bind("on_nav_tabs_change", (tabName?: string) => {
    const tab = tabName || "Customer Profile";
    console.log(`⚡ [IPC] Tab Changed to: ${tab}`);
    currentTabIndex = tabsList.indexOf(tab);
    if (currentTabIndex === -1) currentTabIndex = 0;
    const snippet = (codeSnippets[tab] || "// Tab script...").replace(/\n/g, "\\n").replace(/'/g, "\\'");
    execJS(`
        if (window.setTabsActive) window.setTabsActive("nav_tabs", "${tab}");
        const codeView = document.getElementById("form_code_editor");
        if (codeView) {
            const textarea = codeView.querySelector("textarea");
            if (textarea) textarea.value = '${snippet}';
        }
        const msg = "🗂️ Active Tab: ${tab}";
        if (window.setStatusBarText) window.setStatusBarText("app_status_bar", msg);
        const card = document.getElementById("status_card");
        if (card) {
            card.style.borderLeftColor = "#0284c7";
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Cycle Tab Button Clicked
webview.bind("on_btn_prev_tab_click", () => {
    currentTabIndex = (currentTabIndex + 1) % tabsList.length;
    const nextTab = tabsList[currentTabIndex] || "Customer Profile";
    console.log(`⚡ [IPC] Cycle Tab Button clicked -> Switching to ${nextTab}`);
    const snippet = (codeSnippets[nextTab] || "// Tab script...").replace(/\n/g, "\\n").replace(/'/g, "\\'");
    execJS(`
        if (window.setTabsActive) window.setTabsActive("nav_tabs", "${nextTab}");
        const codeView = document.getElementById("form_code_editor");
        if (codeView) {
            const textarea = codeView.querySelector("textarea");
            if (textarea) textarea.value = '${snippet}';
        }
        const msg = "🔄 Cycled to Tab: ${nextTab}";
        if (window.setStatusBarText) window.setStatusBarText("app_status_bar", msg);
        const card = document.getElementById("status_card");
        if (card) {
            card.style.borderLeftColor = "#10b981";
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Toggle Window Pin Button Clicked
webview.bind("on_btn_toggle_pin_click", () => {
    isWindowPinned = !isWindowPinned;
    console.log(`⚡ [IPC] Toggling Window Pin state: ${isWindowPinned}`);
    setAlwaysOnTopNative(webview, isWindowPinned);
    const label = isWindowPinned ? "🔒 Locked Pin" : "🔓 Unlocked Pin";
    execJS(`
        if (window.setToggleButtonState) window.setToggleButtonState("btn_toggle_pin", ${isWindowPinned}, "${label}");
        const msg = "${isWindowPinned ? "📌 Window Pinned Always On Top" : "🔓 Window Unpinned (Normal)"}";
        if (window.setStatusBarText) window.setStatusBarText("app_status_bar", msg);
        const card = document.getElementById("status_card");
        if (card) {
            card.style.borderLeftColor = ${isWindowPinned} ? "#10b981" : "#ef4444";
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Command Palette Search Handler
webview.bind("on_cmd_palette_change", (val?: string) => {
    const text = val || "";
    console.log(`⚡ [IPC] Command Palette input: ${text}`);
    execJS(`
        const msg = "⌘ Command Search: ${text}";
        if (window.setStatusBarText) window.setStatusBarText("app_status_bar", msg);
    `);
});

// Form Field Name Change
webview.bind("on_form_name_change", (val?: string) => {
    console.log(`⚡ [IPC] Full Name changed: ${val}`);
    execJS(`
        const msg = "✏️ Name Updated: ${val}";
        const card = document.getElementById("status_card");
        if (card) {
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Form Field Email Change
webview.bind("on_form_email_change", (val?: string) => {
    console.log(`⚡ [IPC] Email changed: ${val}`);
    execJS(`
        const msg = "📧 Email Updated: ${val}";
        const card = document.getElementById("status_card");
        if (card) {
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Form Field Password Change
webview.bind("on_form_pwd_change", (val?: string) => {
    console.log(`⚡ [IPC] Password field changed: ${val ? '••••••••' : ''}`);
    execJS(`
        const msg = "🔑 Password Field Updated";
        const card = document.getElementById("status_card");
        if (card) {
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Form Search Input Change
webview.bind("on_form_search_input_change", (val?: string) => {
    console.log(`⚡ [IPC] Filter Search input changed: ${val}`);
    execJS(`
        const msg = "🔍 Filter Search: ${val}";
        const card = document.getElementById("status_card");
        if (card) {
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Form Checkbox Toggled / Clicked
webview.bind("on_form_chk_change", (val?: any) => {
    console.log(`⚡ [IPC] Checkbox toggled/clicked: ${val}`);
    execJS(`
        const msg = "☑️ Checkbox Toggled: ${val}";
        const card = document.getElementById("status_card");
        if (card) {
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Form Radio Selected / Clicked
webview.bind("on_form_rad_change", (val?: any) => {
    console.log(`⚡ [IPC] Radio option selected/clicked: ${val}`);
    execJS(`
        const msg = "🔘 Radio Option Selected: ${val}";
        const card = document.getElementById("status_card");
        if (card) {
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Color Swatch Picker Change
webview.bind("on_form_clr_change", (colorHex?: string) => {
    const hex = colorHex || "#0284c7";
    console.log(`⚡ [IPC] Color Picker changed: ${hex}`);
    execJS(`
        const msg = "🎨 Color Swatch: ${hex}";
        const card = document.getElementById("status_card");
        if (card) {
            card.style.borderLeftColor = "${hex}";
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Time Picker Change
webview.bind("on_form_clock_change", (timeVal?: string) => {
    const t = timeVal || "14:30";
    console.log(`⚡ [IPC] Scheduled Time changed: ${t}`);
    execJS(`
        const msg = "🕒 Scheduled Backup Time: ${t}";
        const card = document.getElementById("status_card");
        if (card) {
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Stepper Value Change (Stepper buttons clicked)
webview.bind("on_form_num_step_change", (numVal?: any) => {
    console.log(`⚡ [IPC] Stepper Button Clicked -> New Value: ${numVal}`);
    execJS(`
        const msg = "🔢 Worker Processes: ${numVal}";
        const card = document.getElementById("status_card");
        if (card) {
            const span = card.querySelector("span:nth-child(2)");
            if (span) span.textContent = msg;
        }
    `);
});

// Pagination Click Handler
webview.bind("on_data_pagination_click", (pageNum?: any) => {
    console.log(`⚡ [IPC] Pagination Page Clicked: ${pageNum}`);
    execJS(`
        const page = ${JSON.stringify(pageNum)};
        const msg = "📄 Active Page: " + page;
        if (window.setAlertBannerText) window.setAlertBannerText("status_card", msg);
        else if (window.setControlText) window.setControlText("status_card", msg);
    `);
});

webview.setHTML(htmlContent);

// Background heartbeat sync for status bar telemetry
let tickCounter = 1;
setInterval(() => {
    tickCounter++;
    const pageNum = (tickCounter % 5) + 1;
    const timeStr = new Date().toLocaleTimeString();
    const statusMsg = `Bun Engine v1.3 | Telemetry Sync OK | Line ${tickCounter * 4}, Col 12 | ${timeStr}`;

    try {
        webview.eval(`
            if (window.setStatusBarText) window.setStatusBarText("app_status_bar", "${statusMsg}");
        `);
    } catch (e) {
        // Ignore during shutdown
    }
}, 4000);

webview.run();
