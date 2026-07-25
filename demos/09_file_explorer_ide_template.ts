/**
 * ⚡ Bun RAD Studio Demo 9: File Explorer & Developer IDE Workspace Template
 * 
 * Demonstrates:
 * - Full-Featured Desktop IDE / Code Editor & File Manager Layout Template
 * - File Navigation Tree View (tree_view, path, breadcrumb)
 * - Multi-Tab Buffer Management (tabs, tool_bar, command_palette)
 * - Code Editor & Live Preview Split Pane (split_pane, form_code, panel)
 * - Build Telemetry, Status Indicator & Terminal Log Output (status_indicator, alert_banner, status_bar)
 * - IPC Handlers for file selection, code switching, build execution, and window pinning
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative } from "../index.ts";

const ideSpec = {
    title: "Demo 9 - Developer IDE & File Explorer Workspace Template",
    width: 980,
    height: 720,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 20,
    controls: [
        // IDE Top Action Toolbar
        {
            id: "ide_toolbar",
            control_type: "tool_bar",
            x: 20, y: 15, width: 940, height: 40,
            text: "📄 New File, 📂 Open Folder, 💾 Save File, 🚀 Run Script, 📦 Build Bundle, ⚙️ IDE Settings",
            event_handlers: { onClick: "on_ide_toolbar_click" }
        },

        // Search Commands & Actions
        {
            id: "ide_cmd",
            control_type: "command_palette",
            x: 20, y: 65, width: 440, height: 40,
            placeholder: "Search files or execute editor command (⌘P)...",
            event_handlers: { onChange: "on_ide_cmd_change" }
        },

        // Active File Tabs
        {
            id: "editor_tabs",
            control_type: "tabs",
            x: 475, y: 65, width: 485, height: 40,
            text: "App.ts, schema.sql, config.json, README.md",
            value: "App.ts",
            event_handlers: { onChange: "on_editor_tabs_change" }
        },

        // File Path Breadcrumb Navigation
        {
            id: "file_path",
            control_type: "path",
            x: 20, y: 115, width: 940, height: 32,
            text: "bun_rad_studio › src › components › App.ts"
        },

        // Left Column Header: File Explorer
        { id: "lbl_explorer", control_type: "label", x: 20, y: 155, width: 240, height: 24, text: "📁 Project Workspace", font_size: 13, font_weight: "700", font_color: "#38bdf8" },

        // File Tree View
        {
            id: "file_tree",
            control_type: "tree_view",
            x: 20, y: 185, width: 240, height: 330,
            text: "📂 bun_rad_studio, 📁 src, 📄 index.ts, 📄 App.ts, 📁 database, 📄 schema.sql, 📁 config, 📄 config.json, 📄 README.md",
            event_handlers: { onChange: "on_file_tree_select" }
        },

        // Git Status Tag & Project Stats
        {
            id: "git_branch_tag",
            control_type: "tag",
            x: 20, y: 525, width: 240, height: 35,
            text: "Git: main, ⚡ Bun 1.1, Clean"
        },

        // Center / Right Column Header: Code Editor & Inspection
        { id: "lbl_editor", control_type: "label", x: 275, y: 155, width: 685, height: 24, text: "💻 Code Editor & Workspace Preview Pane", font_size: 13, font_weight: "700", font_color: "#38bdf8" },

        // Code View / Split Pane Container
        {
            id: "code_editor_view",
            control_type: "form_code",
            x: 275, y: 185, width: 685, height: 330,
            text: "Active Buffer Code (TypeScript):",
            code: `/**\n * ⚡ Main Application Component\n */\nimport { Webview } from "webview-bun";\n\nexport function launchApp() {\n    console.log("🚀 Initializing RAD Studio Webview...");\n    const wv = new Webview(true);\n    wv.title = "Bun RAD App";\n    wv.run();\n}`
        },

        // Action Buttons Row below editor
        {
            id: "btn_toggle_pin",
            control_type: "toggle_button",
            x: 275, y: 525, width: 140, height: 38,
            text: "📌 Pin Window",
            checked: true,
            event_handlers: { onClick: "on_btn_toggle_pin_click" }
        },
        {
            id: "btn_run_build",
            control_type: "button",
            x: 425, y: 525, width: 140, height: 38,
            text: "🚀 Execute Script",
            background_color: "#10b981",
            event_handlers: { onClick: "on_btn_run_build_click" }
        },
        {
            id: "btn_next_buffer",
            control_type: "button",
            x: 575, y: 525, width: 140, height: 38,
            text: "🔄 Next Buffer",
            background_color: "#0284c7",
            event_handlers: { onClick: "on_btn_next_buffer_click" }
        },
        {
            id: "build_status_card",
            control_type: "alert_banner",
            x: 725, y: 525, width: 235, height: 38,
            alert_type: "success",
            text: "Build Ready: 0 Errors"
        },

        // Terminal & Output Status Bar
        {
            id: "ide_status_bar",
            control_type: "status_bar",
            x: 20, y: 585, width: 940, height: 28,
            text: "UTF-8 | Line 12, Col 8 | TypeScript | Git: main ⚡ | Bun RAD Engine v1.3"
        }
    ]
};

console.log("⚡ Launching Bun RAD Studio Demo 9: File Explorer & Developer IDE Workspace...");

const htmlContent = generatePreviewHtml(ideSpec);

const webview = new Webview(true, {
    width: 980,
    height: 720,
    hint: SizeHint.NONE
});

webview.title = ideSpec.title;

// Helper to execute JS
function execJS(code: string) {
    try { webview.eval(code); } catch (e) { console.error("JS Execution Error:", e); }
}

let isWindowPinned = true;
let currentBufferIndex = 0;
const bufferList = ["App.ts", "schema.sql", "config.json", "README.md"];
const bufferSnippets: Record<string, { path: string; code: string }> = {
    "App.ts": {
        path: "bun_rad_studio › src › components › App.ts",
        code: `/**\n * ⚡ Main Application Component\n */\nimport { Webview } from "webview-bun";\n\nexport function launchApp() {\n    console.log("🚀 Initializing RAD Studio Webview...");\n    const wv = new Webview(true);\n    wv.title = "Bun RAD App";\n    wv.run();\n}`
    },
    "schema.sql": {
        path: "bun_rad_studio › database › schema.sql",
        code: `-- 🗄️ SQLite Database Schema Spec\nCREATE TABLE IF NOT EXISTS users (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    name TEXT NOT NULL,\n    email TEXT UNIQUE NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`
    },
    "config.json": {
        path: "bun_rad_studio › config › config.json",
        code: `{\n  "appName": "Bun RAD Studio IDE",\n  "version": "1.3.0",\n  "theme": "dark",\n  "telemetry": true,\n  "port": 3000\n}`
    },
    "README.md": {
        path: "bun_rad_studio › README.md",
        code: `# ⚡ Bun RAD Studio IDE Demo\n\nRapid Application Development toolkit built with Bun & Native Webview.\n\n## Features\n- High Performance UI Rendering\n- Native FFI Window Control\n- Interactive IPC Bindings`
    }
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

// IPC Event Handlers
webview.bind("on_ide_toolbar_click", (action?: string) => {
    const act = action || "Action";
    console.log(`⚡ [IPC] IDE Toolbar Action: ${act}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("ide_status_bar", "🛠️ IDE Action: ${act}");
        if (window.setAlertBannerText) window.setAlertBannerText("build_status_card", "${act} executed");
    `);
});

webview.bind("on_editor_tabs_change", (bufferName?: string) => {
    const buf = bufferName || "App.ts";
    console.log(`⚡ [IPC] Editor Tab Switch: ${buf}`);
    currentBufferIndex = bufferList.indexOf(buf);
    if (currentBufferIndex === -1) currentBufferIndex = 0;
    const item = bufferSnippets[buf] || bufferSnippets["App.ts"];
    const escCode = item.code.replace(/\n/g, "\\n").replace(/'/g, "\\'");
    execJS(`
        if (window.setTabsActive) window.setTabsActive("editor_tabs", "${buf}");
        const pathEl = document.getElementById("file_path");
        if (pathEl) pathEl.innerHTML = "📁 ${item.path.replace(/›/g, '<span style=\"opacity:0.4;margin:0 4px;\">›</span>')}";
        const editor = document.getElementById("code_editor_view");
        if (editor) {
            const ta = editor.querySelector("textarea");
            if (ta) ta.value = '${escCode}';
        }
        if (window.setStatusBarText) window.setStatusBarText("ide_status_bar", "📄 Active Buffer: ${buf}");
    `);
});

webview.bind("on_file_tree_select", (nodeName?: string) => {
    const node = nodeName || "index.ts";
    console.log(`⚡ [IPC] File Tree Item Selected: ${node}`);
    const cleanName = node.replace(/^[\s📂📁📄🖼️]+/, '').trim();
    if (bufferList.includes(cleanName)) {
        currentBufferIndex = bufferList.indexOf(cleanName);
        const item = bufferSnippets[cleanName];
        const escCode = item.code.replace(/\n/g, "\\n").replace(/'/g, "\\'");
        execJS(`
            if (window.setTabsActive) window.setTabsActive("editor_tabs", "${cleanName}");
            const pathEl = document.getElementById("file_path");
            if (pathEl) pathEl.innerHTML = "📁 ${item.path.replace(/›/g, '<span style=\"opacity:0.4;margin:0 4px;\">›</span>')}";
            const editor = document.getElementById("code_editor_view");
            if (editor) {
                const ta = editor.querySelector("textarea");
                if (ta) ta.value = '${escCode}';
            }
            if (window.setStatusBarText) window.setStatusBarText("ide_status_bar", "📂 Opened File: ${cleanName}");
        `);
    }
});

webview.bind("on_ide_cmd_change", (val?: string) => {
    console.log(`⚡ [IPC] IDE Command Input: ${val}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("ide_status_bar", "⌘ Command Search: ${val}");
    `);
});

webview.bind("on_btn_toggle_pin_click", () => {
    isWindowPinned = !isWindowPinned;
    console.log(`⚡ [IPC] Toggling Window Pin state: ${isWindowPinned}`);
    setAlwaysOnTopNative(webview, isWindowPinned);
    const label = isWindowPinned ? "📌 Pinned Window" : "🔓 Unpinned Window";
    execJS(`
        if (window.setToggleButtonState) window.setToggleButtonState("btn_toggle_pin", ${isWindowPinned}, "${label}");
        if (window.setStatusBarText) window.setStatusBarText("ide_status_bar", "${isWindowPinned ? "📌 Window Pinned Always On Top" : "🔓 Window Unpinned"}");
    `);
});

webview.bind("on_btn_run_build_click", () => {
    console.log("⚡ [IPC] Executing Script / Build Command...");
    execJS(`
        if (window.setAlertBannerText) window.setAlertBannerText("build_status_card", "🚀 Script Executed OK");
        if (window.setStatusBarText) window.setStatusBarText("ide_status_bar", "⚡ Execution Finished in 18ms");
    `);
});

webview.bind("on_btn_next_buffer_click", () => {
    currentBufferIndex = (currentBufferIndex + 1) % bufferList.length;
    const nextBuf = bufferList[currentBufferIndex];
    console.log(`⚡ [IPC] Cycling Buffer to: ${nextBuf}`);
    const item = bufferSnippets[nextBuf];
    const escCode = item.code.replace(/\n/g, "\\n").replace(/'/g, "\\'");
    execJS(`
        if (window.setTabsActive) window.setTabsActive("editor_tabs", "${nextBuf}");
        const pathEl = document.getElementById("file_path");
        if (pathEl) pathEl.innerHTML = "📁 ${item.path.replace(/›/g, '<span style=\"opacity:0.4;margin:0 4px;\">›</span>')}";
        const editor = document.getElementById("code_editor_view");
        if (editor) {
            const ta = editor.querySelector("textarea");
            if (ta) ta.value = '${escCode}';
        }
        if (window.setStatusBarText) window.setStatusBarText("ide_status_bar", "🔄 Switched Buffer to ${nextBuf}");
    `);
});

webview.setHTML(htmlContent);

webview.run();
