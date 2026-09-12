import { describe, it, expect } from "bun:test";
import {
    simplegui,
    SimpleWindow,
    getTheme,
    getThemes,
    get_themes,
    getThemeNames,
    get_theme_names,
    getThemeKeys,
    listThemes,
    VLANG_THEME_NAMES,
    generatePreviewHtml
} from "../index.ts";
import { createVlangShowcase } from "../demos/25_vlang_all_themes_showcase.ts";

describe("👑 Vlang Webview RAD Studio Complete Parity Suite", () => {
    const EXPECTED_76_THEMES = [
        'abyss',
        'adwaita_dark',
        'adwaita_light',
        'amber_crt',
        'amethyst',
        'amiga',
        'apple_dark',
        'apple_light',
        'apple_sunset',
        'arc_velvet',
        'aura',
        'catppuccin',
        'charcoal',
        'cobalt2',
        'codefreelance',
        'commodore64',
        'crimson',
        'cyberpunk',
        'dark',
        'dracula',
        'emerald',
        'everforest',
        'fedora_dark',
        'fluent_dark',
        'fluent_light',
        'forest_green',
        'gameboy',
        'github_dark',
        'github_light',
        'gruvbox_dark',
        'gruvbox_light',
        'horizon',
        'hotdog_stand',
        'jetbrains_darcula',
        'kanagawa',
        'light',
        'linear_dark',
        'linux_mint',
        'mac_os_aqua',
        'macintosh_system7',
        'matrix_phosphor',
        'midnight',
        'monokai_pro',
        'navy_blue',
        'nextstep',
        'night_city',
        'nord',
        'nordic_paper',
        'oled_black',
        'one_dark_pro',
        'playstation',
        'pop_os',
        'raycast_dark',
        'rose_pine',
        'sapphire',
        'slate',
        'soft_pastel',
        'solarized_dark',
        'solarized_light',
        'sonoma_dark',
        'sonoma_emerald',
        'sonoma_light',
        'sunset_orange',
        'supabase',
        'synthwave84',
        'tailwind_dark',
        'titanium_slate',
        'tokyo_night',
        'ubuntu_dark',
        'ubuntu_light',
        'unreal_engine',
        'ventura_amber',
        'vercel_dark',
        'win11_light',
        'win11_slate',
        'win95'
    ];

    it("1. getThemeNames() and getThemes() return all 76 canonical V themes sorted alphabetically", () => {
        const names = getThemeNames();
        expect(names.length).toBe(76);
        expect(names).toEqual(EXPECTED_76_THEMES);

        const namesSnake = get_theme_names();
        expect(namesSnake).toEqual(EXPECTED_76_THEMES);
        expect(VLANG_THEME_NAMES).toEqual(EXPECTED_76_THEMES);

        // getThemes() & get_themes()
        expect(getThemes()).toEqual(EXPECTED_76_THEMES);
        expect(get_themes()).toEqual(EXPECTED_76_THEMES);
        expect(simplegui.getThemes()).toEqual(EXPECTED_76_THEMES);
        expect(simplegui.get_themes()).toEqual(EXPECTED_76_THEMES);

        // Verify sorted ordering
        const isSorted = (arr: string[]) => arr.every((v, i) => i === 0 || arr[i - 1]!.localeCompare(v) <= 0);
        expect(isSorted(getThemeNames())).toBe(true);
        expect(isSorted(getThemes())).toBe(true);
        expect(isSorted(getThemeKeys())).toBe(true);
        expect(isSorted(listThemes())).toBe(true);
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

    it("11. Theme dropdowns are sorted alphabetically across all selectors and helpers", () => {
        const win = simplegui.createWindow("Sorted Theme Selectors", 800, 600);

        // 1. addThemeSelector dropdown items sorted alphabetically by display name
        const selRef = win.addThemeSelector("dd_theme", "Theme:");
        const items = selRef.spec.items || [];
        const labels = selRef.spec.item_labels || {};
        expect(items.length).toBeGreaterThanOrEqual(76);

        const displayNames = items.map((k: string) => labels[k] || k);
        const sortedDisplayNames = [...displayNames].sort((a: string, b: string) =>
            a.localeCompare(b, undefined, { sensitivity: "base" })
        );
        expect(displayNames).toEqual(sortedDisplayNames);

        // 2. addThemeSelector overload support (e.g., ("🎨 Theme", false, true))
        const customSel = win.addThemeSelector("🎨 Theme", false, true);
        expect(customSel).toBeDefined();
        const customItems = customSel.spec.items || [];
        const customLabels = customSel.spec.item_labels || {};
        const customDisplayNames = customItems.map((k: string) => customLabels[k] || k);
        const sortedCustomDisplayNames = [...customDisplayNames].sort((a: string, b: string) =>
            a.localeCompare(b, undefined, { sensitivity: "base" })
        );
        expect(customDisplayNames).toEqual(sortedCustomDisplayNames);

        // 3. getThemes() and listThemes() arrays are strictly sorted alphabetically
        const allThemes = getThemes();
        const sortedThemes = [...allThemes].sort((a, b) => a.localeCompare(b));
        expect(allThemes).toEqual(sortedThemes);

        const listThemesArr = listThemes();
        const sortedListThemes = [...listThemesArr].sort((a, b) => a.localeCompare(b));
        expect(listThemesArr).toEqual(sortedListThemes);

        // 4. Demo 25 theme dropdown has exactly 76 unique themes with zero duplicates
        const demo25Win = createVlangShowcase();
        const demo25Html = demo25Win.getHtml();
        const themeMatch = demo25Html.match(/<select[^>]*id="dd_theme_selector"[^>]*>([\s\S]*?)<\/select>/);
        expect(themeMatch).toBeTruthy();
        const demo25Options = [...themeMatch![1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(x => ({ val: x[1], text: x[2] }));
        expect(demo25Options.length).toBe(76);
        const uniqueValues = new Set(demo25Options.map(o => o.val));
        const uniqueTexts = new Set(demo25Options.map(o => o.text));
        expect(uniqueValues.size).toBe(76);
        expect(uniqueTexts.size).toBe(76);
    });
});

