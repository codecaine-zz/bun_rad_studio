import { describe, it, expect } from "bun:test";
import {
    simplegui,
    SimpleWindow,
    getTheme,
    getThemeNames,
    get_theme_names,
    VLANG_THEME_NAMES,
    generatePreviewHtml
} from "../index.ts";

describe("👑 Vlang Webview RAD Studio Complete Parity Suite", () => {
    const EXPECTED_76_THEMES = [
        'monokai_pro', 'tokyo_night', 'one_dark_pro', 'gruvbox_dark', 'gruvbox_light',
        'rose_pine', 'everforest', 'kanagawa', 'dracula', 'nord',
        'catppuccin', 'solarized_dark', 'solarized_light', 'github_dark', 'github_light',
        'sonoma_dark', 'sonoma_light', 'sonoma_emerald', 'codefreelance', 'fluent_dark',
        'fluent_light', 'win95', 'commodore64', 'amiga', 'macintosh_system7',
        'gameboy', 'matrix_phosphor', 'amber_crt', 'synthwave84', 'cyberpunk',
        'navy_blue', 'forest_green', 'sunset_orange', 'crimson', 'emerald',
        'sapphire', 'amethyst', 'midnight', 'charcoal', 'slate',
        'dark', 'light', 'raycast_dark', 'linear_dark', 'vercel_dark',
        'unreal_engine', 'arc_velvet', 'abyss', 'night_city', 'horizon',
        'tailwind_dark', 'supabase', 'oled_black', 'titanium_slate', 'jetbrains_darcula',
        'nordic_paper', 'cobalt2', 'win11_slate', 'win11_light', 'ubuntu_dark',
        'ubuntu_light', 'adwaita_dark', 'adwaita_light', 'linux_mint', 'pop_os',
        'fedora_dark', 'aura', 'apple_dark', 'apple_light', 'ventura_amber',
        'apple_sunset', 'soft_pastel', 'nextstep', 'mac_os_aqua', 'hotdog_stand',
        'playstation'
    ];

    it("1. getThemeNames() returns all 76 canonical V themes in exact order", () => {
        const names = getThemeNames();
        expect(names.length).toBe(76);
        expect(names).toEqual(EXPECTED_76_THEMES);

        const namesSnake = get_theme_names();
        expect(namesSnake).toEqual(EXPECTED_76_THEMES);
        expect(VLANG_THEME_NAMES).toEqual(EXPECTED_76_THEMES);
    });

    it("2. getTheme() resolves every one of the 76 themes with valid palettes", () => {
        for (const name of EXPECTED_76_THEMES) {
            const theme = getTheme(name);
            expect(theme).toBeDefined();
            expect(theme.name).toBeTruthy();
            expect(theme.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(theme.font_color).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(theme.accent_color).toMatch(/^#[0-9a-fA-F]{6}$/);
            expect(typeof theme.is_dark).toBe("boolean");
        }
    });

    it("3. getTheme() resolves Vlang aliases cleanly", () => {
        expect(getTheme("gruvbox").name).toBe("Gruvbox Dark");
        expect(getTheme("one_dark").name).toBe("One Dark Pro");
        expect(getTheme("synthwave_84").name).toBe("Synthwave '84");
        expect(getTheme("macos_sonoma").name).toBe("macOS Sonoma Dark");
        expect(getTheme("windows_11_fluent").name).toBe("Windows 11 Fluent Dark");
        expect(getTheme("commodore_64").name).toBe("Commodore 64");
        expect(getTheme("c64").name).toBe("Commodore 64");
        expect(getTheme("amiga_workbench").name).toBe("Amiga Workbench");
        expect(getTheme("mac_system_7").name).toBe("Macintosh System 7");
        expect(getTheme("matrix").name).toBe("Matrix Phosphor");
        expect(getTheme("amber").name).toBe("Amber CRT Monochrome");
        expect(getTheme("vibrant_neon").name).toBe("Cyberpunk 2077");
        expect(getTheme("vscode_dark").name).toBe("One Dark Pro");
    });

    it("4. SimpleControlRef methods support font, color, and expand fill", () => {
        const win = simplegui.createWindow("Test ControlRef", 800, 600);
        const ref = win.addLabel("lblRef", "Reference Label");

        ref.fontSize(18)
           .font_size(20)
           .fontColor("#ff0000")
           .font_color("#00ff00")
           .backgroundColor("#0000ff")
           .background_color("#333333")
           .expandFill(true)
           .expand_fill(true);

        expect(ref.spec.font_size).toBe(20);
        expect(ref.spec.fontSize).toBe(20);
        expect(ref.spec.font_color).toBe("#00ff00");
        expect(ref.spec.background_color).toBe("#333333");
        expect(ref.spec.expand_fill).toBe(true);
    });

    it("5. SimpleWindow fluent chaining operates on lastControlId", () => {
        const win = simplegui.createWindow("Test Fluent Chaining", 800, 600);

        win.addTextInput("User Input", "admin")
           .width(320)
           .height(44)
           .fontSize(15)
           .font_size(16)
           .fontColor("#e2e8f0")
           .backgroundColor("#1e293b")
           .tooltip("Enter your credentials")
           .placeholder("Type here...")
           .bold(true)
           .expandFill(true);

        const ctrl = win.hasControl("default_input") ? win.getControlSpec("default_input") : (win as any).getLastControl();
        expect(ctrl).toBeDefined();
        expect(ctrl.width).toBe(320);
        expect(ctrl.height).toBe(44);
        expect(ctrl.fontSize).toBe(16);
        expect(ctrl.tooltip).toBe("Enter your credentials");
        expect(ctrl.placeholder).toBe("Type here...");
        expect(ctrl.is_bold).toBe(true);
        expect(ctrl.expand_fill).toBe(true);
    });

    it("6. SimpleWindow direct chaining builders (heading, subheading, divider, kpi_card, etc.)", () => {
        const win = simplegui.createWindow("Direct Chaining", 800, 600);

        win.heading("👑 Ultimate RAD Studio Mega-Showcase");
        win.subheading("70+ Delphi/VB Style Native Controls across all 42 Desktop Themes:");
        win.divider();
        win.kpi_card("Visual Controls", "70+ Types", "Anchors & Docking");
        win.statusBar("Vlang Webview RAD Studio Pro v2.0 | All systems operational");
        win.raw_html("<div id=\"customHtml\">Custom Raw Content</div>");

        const spec = win.buildFormSpec();
        const types = spec.controls.map((c: any) => c.control_type || c.type);
        expect(types).toContain("heading");
        expect(types).toContain("subheading");
        expect(types).toContain("divider");
        expect(types).toContain("kpi_card");
        expect(types).toContain("status_bar");
        expect(types).toContain("raw_html");

        const html = generatePreviewHtml(spec);
        expect(html).toContain("Ultimate RAD Studio Mega-Showcase");
        expect(html).toContain("70+ Delphi/VB Style Native Controls");
        expect(html).toContain("sg-kpi-card");
        expect(html).toContain("Custom Raw Content");
    });

    it("7. Layout containers: row_start/end, box_start/end, begin_flex_box/end_flex_box, card_with_title", () => {
        const win = simplegui.createWindow("Containers", 800, 600);

        win.row_start();
        win.addLabel("Row Item 1");
        win.addLabel("Row Item 2");
        win.row_end();

        win.box_start("Settings Box");
        win.addTextInput("pref_key", "pref_val");
        win.box_end();

        win.begin_flex_box("flex1", "row", "center", "center");
        win.addButton("Flex Button");
        win.end_flex_box();

        let cardCallbackFired = false;
        win.card_with_title("Security", "Security Settings", (w) => {
            cardCallbackFired = true;
            w.addCheckbox("chk2FA", "Enable 2FA", true);
        });
        expect(cardCallbackFired).toBe(true);
    });

    it("8. Table operations parity: setTableRows, addTableRow, removeTableRow, tableRowCount", () => {
        const win = simplegui.createWindow("Table Operations", 800, 600);

        const headers = ["Subsystem", "Engine Driver", "Status", "Parity"];
        const rows = [
            ["Webview FFI", "C/C++ Native Wrapper", "Active", "100%"],
            ["Window Management", "Cocoa / Win32 / GTK", "Active", "100%"],
            ["Hardware Telemetry", "sysctl / wmic / /proc", "Active", "100%"]
        ];

        win.addTable("tblParity", headers, rows);
        expect(win.tableRowCount("tblParity")).toBe(3);
        expect(win.table_row_count("tblParity")).toBe(3);

        win.addTableRow("tblParity", ["Theme Catalog", "42 Built-in CSS Engines", "Active", "100%"]);
        expect(win.tableRowCount("tblParity")).toBe(4);

        win.removeTableRow("tblParity", 1);
        expect(win.tableRowCount("tblParity")).toBe(3);

        win.setTableRows("tblParity", [
            ["Single Subsystem", "Custom Driver", "Ready", "100%"]
        ]);
        expect(win.tableRowCount("tblParity")).toBe(1);
    });

    it("9. Value accessors and typed helpers", () => {
        const win = simplegui.createWindow("Value Accessors", 800, 600);

        win.addInput("txtAge", "42");
        expect(win.getValueInt("txtAge")).toBe(42);
        expect(win.get_value_int("txtAge")).toBe(42);

        win.addCheckbox("chkNotify", "Receive Notifications", true);
        expect(win.getChecked("chkNotify")).toBe(true);
        expect(win.get_checked("chkNotify")).toBe(true);

        win.setChecked("chkNotify", false);
        expect(win.getChecked("chkNotify")).toBe(false);
        expect(win.get_checked("chkNotify")).toBe(false);

        win.set("txtAge", "99");
        expect(win.get("txtAge")).toBe("99");
    });

    it("10. Full Theme Switching operations parity", () => {
        const win = simplegui.createWindow("Theme Switcher", 800, 600, { theme: "monokai_pro" });
        expect(win.isDarkTheme()).toBe(true);
        expect(win.is_dark_theme()).toBe(true);

        win.applyTheme("apple_light");
        expect(win.theme).toBe("apple_light");
        expect(win.isDarkTheme()).toBe(false);

        win.apply_theme("sonoma_dark");
        expect(win.theme).toBe("sonoma_dark");
        expect(win.isDarkTheme()).toBe(true);

        win.applyThemeByName("commodore64");
        expect(win.theme).toBe("commodore64");
    });
});
