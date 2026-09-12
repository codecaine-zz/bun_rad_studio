/**
 * ⚡ Bun RAD Studio Demo 23: Complete Theme & All Controls Showcase Studio
 * 
 * Demonstrates:
 * - Every type of SimpleGUI control rendered simultaneously on a single unified form
 * - Comprehensive support for all 30+ visual & data controls:
 *   • Title & Section Headers, Theme Selector & Badges
 *   • Single-line Text, Password, Search, Masked Input, Tag & Token Fields, Inline Editable Label, Textarea
 *   • Checkboxes, Toggles/Switches, Segmented Control, Dropdowns, Listbox, Number Stepper
 *   • Color Well, Date Picker, Time Picker, Sliders, Progress Bar, Hotkey Badges, Status Badges
 *   • Formatted Data Table, Workspace Tree View, Syntax Code View
 *   • Primary Theme-Accent Button, Secondary Button, Modal Dialog Button, Clipboard Export, Exit
 * - Instant runtime dynamic theme switching across all built-in high-quality themes
 */

import { simplegui, SimpleWindow, getTheme, autoShortThemeName } from "../index.ts";

export function createThemeShowcase(themeName: string = "midnight"): SimpleWindow {
    const themeObj = getTheme(themeName);

    const win = simplegui.createWindow(
        `⚡ Bun RAD Studio - All Controls Form Showcase [Theme: ${themeObj.name}]`,
        1180,
        1260,
        {
            theme: themeName
        }
    );

    // ==========================================
    // 1. TOP HEADER & THEME SWITCHER BAR
    // ==========================================
    win.beginRow();
    win.addLabel("lbl_theme_title", `🎨 ${themeObj.name}`)
        .font(20, themeObj.accent_color, "800")
        .width(280);

    win.addBadge(themeObj.is_dark ? "🌙 DARK" : "☀️ LIGHT", themeObj.is_dark ? "info" : "warning")
        .id("bdg_theme_mode")
        .width(100);

    win.addBadge(`PRI ${themeObj.accent_color}`, "success")
        .id("bdg_theme_pri")
        .width(120);

    if (themeObj.secondary_accent) {
        win.addBadge(`SEC ${themeObj.secondary_accent}`, "info")
            .id("bdg_theme_sec")
            .width(125);
    }

    // Live interactive theme selector
    win.addThemeSelector("dd_theme_selector", "Theme:", false, 170);
    win.endRow();

    win.addLabel("lbl_theme_desc", `${themeObj.description} • Unified single-form showcase with all 30+ RAD controls`)
        .font(12, themeObj.is_dark ? "#94a3b8" : "#334155");

    win.addDivider();

    // ==========================================
    // 2. MAIN 2-COLUMN GRID (INPUTS & SELECTORS)
    // ==========================================
    win.beginGrid(2, 16);

    // --- COLUMN 1: TEXT & INPUT CONTROLS ---
    win.beginCard("Text & Data Input Controls", "Comprehensive single & multi-line inputs, tags, masking & inline editing");

    win.beginRow();
    win.addLabel("Text Input:").width(120);
    win.addTextInput("Type user handle or email...").id("txtInput").value("alex.mercer@codefreelance.net").width(390);
    win.endRow();

    win.beginRow();
    win.addLabel("Password:").width(120);
    win.addPasswordInput("••••••••••••").id("txtPass").value("Sup3rS3cretKey!").width(390);
    win.endRow();

    win.beginRow();
    win.addLabel("Search Field:").width(120);
    win.addSearchInput("Filter symbols, files, records...").id("txtSearch").width(390);
    win.endRow();

    win.beginRow();
    win.addLabel("Masked Phone:").width(120);
    win.addMaskedInput("inpPhone", "(999) 999-9999", "(555) 234-8901").width(390);
    win.endRow();

    win.beginRow();
    win.addLabel("Tag / Tokens:").width(120);
    win.addTagInput("inpTags", ["TypeScript", "Bun", "Desktop-RAD", "SimpleGUI"]).width(390);
    win.endRow();

    win.beginRow();
    win.addLabel("Editable Label:").width(120);
    win.addInlineEditableLabel("lblProject", "⚡ Project Alpha: Production Cluster v2.4").width(390);
    win.endRow();

    win.beginRow();
    win.addLabel("Multi-line Text:").width(120);
    win.addTextArea("txtNotes", "// System configuration directives\ncluster.mode = 'distributed'\ntelemetry.enabled = true\nworkers.count = 8\nstorage.engine = 'sqlite-wal'").width(390).height(65);
    win.endRow();

    win.endCard();

    // --- COLUMN 2: SELECTORS, TOGGLES & METERS ---
    win.beginCard("Selectors, Toggles & Gauges", "State switches, multi-choice radios, sliders, steppers & progress");

    win.beginRow();
    win.addCheckbox("Hardware Acceleration (GPU)", true).id("chkGpu").width(240);
    win.addCheckbox("Verbose IPC Logging", false).id("chkLog").width(230);
    win.endRow();

    win.beginRow();
    win.addSwitch("Live Telemetry Daemon", true).id("swtDaemon").width(240);
    win.addSwitch("Auto-Save Preferences", true).id("swtAutoSave").width(230);
    win.endRow();

    win.beginRow();
    win.addLabel("Segmented:").width(100);
    win.addSegmentedControl(["Metrics", "Diagnostics", "Security", "Logs"], 0).id("segMode").width(370);
    win.endRow();

    win.beginRow();
    win.addLabel("Dropdown:").width(100);
    win.addDropdown(
        ["Production Gateway (US-East)", "Failover Node (EU-West)", "Development Sandbox", "Edge Cluster (AP-Tokyo)"],
        "Production Gateway (US-East)"
    ).id("ddServer").width(370);
    win.endRow();

    win.beginRow();
    win.addLabel("Multi-List Box:").width(100);
    win.addMultiListBox([
        "Worker Pool: 16 Cores Active",
        "Memory Allocator: Mimalloc",
        "Network Engine: POSIX Async",
        "Compiler: Bun Native AST"
    ], ["Worker Pool: 16 Cores Active", "Memory Allocator: Mimalloc"]).id("lstWorkers").width(370).height(62);
    win.endRow();

    win.beginRow();
    win.addLabel("Threads Stepper:").width(120);
    win.addStepper(1, 64, 16).id("stpThreads").width(120);
    win.addLabel("Max Limit: 64").font(11, themeObj.is_dark ? "#94a3b8" : "#334155");
    win.endRow();

    win.endCard();

    win.endGrid();

    // ==========================================
    // 3. SECOND ROW (PICKERS, SLIDERS & METRICS)
    // ==========================================
    win.beginGrid(3, 16);

    // Pickers Card
    win.beginCard("Pickers & Swatches", "Color, calendar dates & 24h clock");
    win.beginRow();
    win.addLabel("Color Well:").width(90);
    win.addColorWell(themeObj.accent_color).id("cpAccent").width(180);
    win.endRow();

    win.beginRow();
    win.addLabel("Date Picker:").width(90);
    win.addDatePicker("2026-09-10").id("dpSchedule").width(180);
    win.endRow();

    win.beginRow();
    win.addLabel("Time Picker:").width(90);
    win.addTimePicker("14:30").id("tpSchedule").width(180);
    win.endRow();
    win.endCard();

    // Sliders & Meters Card
    win.beginCard("Sliders & Meters", "Variable range tracking & telemetry");
    win.beginRow();
    win.addLabel("Volume Slider:").width(110);
    win.addSlider(0, 100, 78).id("sldVol").width(180);
    win.endRow();

    win.beginRow();
    win.addLabel("System Load:").width(110);
    win.addProgressBar(82, 100).id("prgLoad").width(180);
    win.endRow();

    win.beginRow();
    win.addLabel("Buffer Cache:").width(110);
    win.addProgressBar(45, 100).id("prgBuffer").width(180);
    win.endRow();
    win.endCard();

    // Badges & Keyboard Shortcuts Card
    win.beginCard("Status & Hotkey Badges", "Semantic tags & key combinations");
    win.beginRow();
    win.addBadge("CONNECTED", "success").width(110);
    win.addBadge("TLS 1.3", "info").width(90);
    win.addBadge("HIGH LOAD", "warning").width(100);
    win.endRow();

    win.beginRow();
    win.addLabel("Command Bar:").width(110);
    win.addHotkeyBadge(["⌘", "K"]).width(100);
    win.endRow();

    win.beginRow();
    win.addLabel("Action Palette:").width(110);
    win.addHotkeyBadge(["Ctrl", "Shift", "P"]).width(120);
    win.endRow();
    win.endCard();

    win.endGrid();

    // ==========================================
    // 4. DATA TABLES, DUAL TRANSFER & WORKSPACE
    // ==========================================
    win.beginGrid(2, 16);

    win.beginCard("Multi-Select Data Table", "Row checkboxes, Ctrl/Shift range & header select-all");
    win.addTable(
        ["ID", "Service Node", "Protocol", "Port", "Latency", "Health"],
        [
            [101, "API Gateway Core", "HTTP/2", "8080", "0.4 ms", "Healthy"],
            [102, "Auth & Session Vault", "gRPC", "8443", "1.1 ms", "Healthy"],
            [103, "Redis Distributed Cache", "RESP3", "6379", "0.2 ms", "Optimal"],
            [104, "Postgres Analytics Replica", "TCP", "5432", "2.8 ms", "Syncing"]
        ],
        { multiSelect: true, checkboxSelection: true }
    ).id("tblServices").height(130);
    win.endCard();

    win.beginCard("Dual Transfer List", "Double-click item transfer, 4-button bar & live item counts");
    win.addTransferList(
        "transServices",
        ["Kafka Broker", "Elasticsearch", "Prometheus", "MinIO Storage"],
        ["API Gateway", "Redis Cache"],
        { height: 130 }
    );
    win.endCard();

    win.beginCard("Hierarchical TreeGrid", "Multi-column tree table, expand/collapse toggles & selection");
    win.addTreeGrid(
        ["Name", "Type", "Size", "Modified", "Status"],
        [
            { id: "proj_root", cells: ["bun_rad_studio", "Project Root", "--", "Today", "Active"], icon: "📦", expanded: true, children: [
                { id: "dir_src", cells: ["src", "Directory", "--", "Today", "Active"], icon: "📂", expanded: true, children: [
                    { id: "file_simplegui", cells: ["simplegui.ts", "TypeScript", "148 KB", "Today", "Modified"], icon: "📄" },
                    { id: "file_index", cells: ["index.ts", "TypeScript", "102 KB", "Today", "Modified"], icon: "📄" }
                ]},
                { id: "dir_demos", cells: ["demos", "Directory", "--", "Today", "Active"], icon: "📂", expanded: true, children: [
                    { id: "demo_showcase", cells: ["23_all_themes_all_controls_showcase.ts", "TypeScript", "12 KB", "Today", "Active"], icon: "📄" }
                ]},
                { id: "pkg_json", cells: ["package.json", "JSON Config", "1.8 KB", "Yesterday", "Locked"], icon: "📄" },
                { id: "readme_md", cells: ["README.md", "Documentation", "16 KB", "Today", "Published"], icon: "📄" }
            ]}
        ],
        { multiSelect: true }
    ).id("treegridWorkspace").height(130);
    win.endCard();

    win.beginCard("Project Workspace Tree", "Hierarchical file explorer tree navigation");
    win.addTreeView([
        "📦 bun_rad_studio",
        " 📂 src",
        "   📄 simplegui.ts",
        "   📄 index.ts",
        " 📂 demos",
        "   📄 23_all_themes_all_controls_showcase.ts",
        " 📂 screenshots",
        "   📂 themes"
    ]).id("treeWorkspace").height(130);
    win.endCard();

    win.endGrid();

    // ==========================================
    // 5. ACTION FOOTER BUTTONS
    // ==========================================
    win.beginRow();

    win.addButton("⚡ Primary Theme Action", (w) => {
        w.showAlert(`Executed action with active theme: ${w.theme}!`, "Theme Action");
    }).id("btnPrimaryAction").width(200).height(38);

    win.addButton("💬 Prompt Modal Dialog", (w) => {
        w.showPrompt("Enter updated workspace namespace:", "DefaultNamespace", (ans) => {
            if (ans) w.showAlert(`Namespace set to: ${ans}`, "Configuration Updated");
        });
    }).bg("#334155").color("#f8fafc").width(190).height(38);

    win.addButton("📋 Copy Form Values JSON", (w) => {
        const json = JSON.stringify(w.getFormValues(), null, 2);
        w.copyToClipboard(json);
        w.showAlert("Form values serialized and copied to clipboard!", "Clipboard Export");
    }).bg("#1e293b").color("#38bdf8").width(210).height(38);

    win.addButton("✨ Switch Random Theme", (w) => {
        const keys = [
            "codefreelance", "midnight", "raycast_dark", "linear_dark", "vercel_dark",
            "unreal_engine", "arc_velvet", "abyss", "night_city", "horizon",
            "tailwind_dark", "supabase", "oled_black", "titanium_slate", "jetbrains_darcula",
            "nordic_paper", "sonoma_emerald", "monokai_pro", "tokyo_night", "one_dark_pro",
            "gruvbox_dark", "rose_pine", "everforest", "kanagawa", "cobalt2",
            "win11_slate", "apple_dark", "dracula", "nord", "cyberpunk", "apple_light",
            "win95", "gameboy", "c64", "matrix", "synthwave",
            "mac_os_aqua", "win11_light", "github_light", "solarized_light", "soft_pastel"
        ];
        const next = keys[Math.floor(Math.random() * keys.length)] || "sonoma_emerald";
        w.setTheme(next, true);
        w.setValue("dd_theme_selector", next);
    }).bg("#475569").color("#ffffff").width(190).height(38);

    win.addButton("❌ Close Window", (w) => {
        w.exit();
    }).bg("#ef4444").color("#ffffff").bold().width(140).height(38);

    win.endRow();

    return win;
}

// Interactive Standalone Execution
if (import.meta.main) {
    console.log("⚡ Launching Bun RAD Studio Demo 23: Complete All Controls & Theme Studio...");
    const defaultTheme = process.argv[2] || "midnight";
    const app = createThemeShowcase(defaultTheme);
    app.run();
}
