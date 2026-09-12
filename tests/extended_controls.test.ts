import { describe, test, expect } from "bun:test";
import { generatePreviewHtml, createWindow } from "../index.ts";
import { readFileSync } from "fs";
import { join } from "path";

describe("✨ Studio Extended Controls Suite", () => {

    test("1. Preview HTML Generator renders all 13 Studio Extended Controls", () => {
        const spec = {
            title: "Extended Controls Showcase",
            width: 900,
            height: 700,
            background_color: "#0f172a",
            font_color: "#f8fafc",
            controls: [
                {
                    id: "ctrl_sidebar",
                    control_type: "sidebar",
                    x: 20,
                    y: 20,
                    width: 200,
                    height: 260,
                    title: "Main Navigation",
                    items: ["Dashboard", "Settings", "Analytics"]
                },
                {
                    id: "ctrl_modal",
                    control_type: "modal",
                    x: 240,
                    y: 20,
                    width: 320,
                    height: 180,
                    title: "Confirm Action",
                    message: "Are you sure you want to proceed?"
                },
                {
                    id: "ctrl_dropdown",
                    control_type: "dropdown_menu",
                    x: 580,
                    y: 20,
                    width: 160,
                    height: 36,
                    text: "Quick Actions",
                    items: ["Edit", "Duplicate", "Delete"]
                },
                {
                    id: "ctrl_list",
                    control_type: "list_group",
                    x: 20,
                    y: 300,
                    width: 280,
                    height: 160,
                    items: [
                        { title: "Item 1", subtext: "Sub 1", badge: "New" },
                        { title: "Item 2", subtext: "Sub 2", badge: "Active" }
                    ]
                },
                {
                    id: "ctrl_card",
                    control_type: "content_card",
                    x: 320,
                    y: 300,
                    width: 240,
                    height: 220,
                    title: "Featured Article",
                    description: "Modern desktop apps with Bun and Webview."
                },
                {
                    id: "ctrl_panel",
                    control_type: "callout_panel",
                    x: 580,
                    y: 80,
                    width: 280,
                    height: 80,
                    title: "Security Notice",
                    message: "Two-factor authentication is recommended.",
                    alert_type: "warning"
                },
                {
                    id: "ctrl_tooltip",
                    control_type: "tooltip_box",
                    x: 580,
                    y: 180,
                    width: 140,
                    height: 36,
                    text: "Info Trigger",
                    tooltip: "This is helpful contextual documentation"
                },
                {
                    id: "ctrl_anim_input",
                    control_type: "animated_input",
                    x: 580,
                    y: 230,
                    width: 240,
                    height: 36,
                    placeholder: "Search telemetry logs..."
                },
                {
                    id: "ctrl_display",
                    control_type: "hero_display",
                    x: 20,
                    y: 480,
                    width: 280,
                    height: 160,
                    title: "Cloud Infrastructure"
                },
                {
                    id: "ctrl_code",
                    control_type: "code_snippet",
                    x: 320,
                    y: 540,
                    width: 300,
                    height: 110,
                    code: "console.log('Bun RAD Studio');"
                },
                {
                    id: "ctrl_badge",
                    control_type: "count_badge",
                    x: 740,
                    y: 180,
                    width: 32,
                    height: 32,
                    count: 9
                },
                {
                    id: "ctrl_btngroup",
                    control_type: "button_group",
                    x: 580,
                    y: 280,
                    width: 240,
                    height: 36,
                    buttons: ["Day", "Week", "Month"]
                },
                {
                    id: "ctrl_slideshow",
                    control_type: "slideshow",
                    x: 640,
                    y: 480,
                    width: 240,
                    height: 180,
                    slides: [
                        { caption: "First Slide", desc: "First Description" },
                        { caption: "Second Slide", desc: "Second Description" }
                    ]
                }
            ]
        };

        const html = generatePreviewHtml(spec);

        expect(html).toContain("rad-sidebar");
        expect(html).toContain("Main Navigation");
        expect(html).toContain("rad-modal");
        expect(html).toContain("Confirm Action");
        expect(html).toContain("rad-dropdown-host");
        expect(html).toContain("Quick Actions");
        expect(html).toContain("rad-list-group");
        expect(html).toContain("Item 1");
        expect(html).toContain("rad-content-card");
        expect(html).toContain("Featured Article");
        expect(html).toContain("rad-callout-panel");
        expect(html).toContain("Security Notice");
        expect(html).toContain("rad-tooltip-container");
        expect(html).toContain("Info Trigger");
        expect(html).toContain("rad-anim-input");
        expect(html).toContain("rad-display-hero");
        expect(html).toContain("Cloud Infrastructure");
        expect(html).toContain("rad-code-box");
        expect(html).toContain("Bun RAD Studio");
        expect(html).toContain("rad-count-badge");
        expect(html).toContain("rad-btn-bar");
        expect(html).toContain("rad-slideshow");
        expect(html).toContain("First Slide");
    });

    test("2. SimpleWindow exposes fluent methods for all extended controls", () => {
        const win = createWindow("Extended Controls Window", 800, 600, { theme: "apple_dark" });

        const sb = win.addSidebar("Side Menu", ["Overview", "Deployments", "Audit"]);
        expect(sb).toBeDefined();

        const modal = win.addModal("Delete Database", "This cannot be undone.");
        expect(modal).toBeDefined();

        const dd = win.addDropdownMenu("Actions", ["Export CSV", "Export JSON"]);
        expect(dd).toBeDefined();

        const list = win.addListGroup([{ title: "Service Worker", badge: "Running" }]);
        expect(list).toBeDefined();

        const card = win.addContentCard("Server Node A", "Located in us-east-1");
        expect(card).toBeDefined();

        const panel = win.addCalloutPanel("Notice", "System maintenance at midnight", "warning");
        expect(panel).toBeDefined();

        const tip = win.addTooltipBox("Status Help", "Indicates worker thread status");
        expect(tip).toBeDefined();

        const animInput = win.addAnimatedInput("Type to search records...");
        expect(animInput).toBeDefined();

        const hero = win.addHeroDisplay("Mission Control");
        expect(hero).toBeDefined();

        const code = win.addCodeSnippet("import { createWindow } from 'bun-rad-studio';");
        expect(code).toBeDefined();

        const badge = win.addCountBadge(42);
        expect(badge).toBeDefined();

        const btnGrp = win.addButtonGroup(["Standard", "Pro", "Enterprise"]);
        expect(btnGrp).toBeDefined();

        const slide = win.addSlideshow([{ caption: "Slide A" }, { caption: "Slide B" }]);
        expect(slide).toBeDefined();

        // Verify HTML generated by SimpleWindow contains all elements
        const preview = win.generateHtml();
        expect(preview).toContain("Side Menu");
        expect(preview).toContain("Delete Database");
        expect(preview).toContain("Export CSV");
        expect(preview).toContain("Service Worker");
        expect(preview).toContain("Server Node A");
        expect(preview).toContain("System maintenance at midnight");
        expect(preview).toContain("Status Help");
        expect(preview).toContain("Type to search records...");
        expect(preview).toContain("Mission Control");
        expect(preview).toContain("createWindow");
        expect(preview).toContain("42");
        expect(preview).toContain("Enterprise");
        expect(preview).toContain("Slide A");
    });

    test("3. SimpleWindow snake_case aliases work interchangeably", () => {
        const win = createWindow("Aliases Window", 700, 500, { theme: "dracula" });

        win.add_sidebar("Navigation Drawer");
        win.add_modal("Alert Box", "Attention required.");
        win.add_dropdown_menu("Filter", ["Active", "Archived"]);
        win.add_list_group(["Item Alpha", "Item Beta"]);
        win.add_content_card("Card Title", "Card description");
        win.add_callout_panel("Info Box", "Panel message");
        win.add_tooltip_box("Tooltip Trigger", "Popup details");
        win.add_animated_input("Search...");
        win.add_hero_display("Hero Display Title");
        win.add_code_snippet("const x = 10;");
        win.add_count_badge(5);
        win.add_button_group(["1", "2", "3"]);
        win.add_slideshow([{ caption: "First" }]);

        const html = win.generateHtml();
        expect(html).toContain("Navigation Drawer");
        expect(html).toContain("Alert Box");
        expect(html).toContain("Filter");
        expect(html).toContain("Card Title");
        expect(html).toContain("Info Box");
        expect(html).toContain("Hero Display Title");
        expect(html).toContain("const x = 10;");
    });

    test("4. Event handlers can be wired to extended controls", () => {
        const win = createWindow("Events Window", 600, 400);

        let clickedItem = "";
        win.addSidebar("Nav", ["Home", "Profile"], (w, val) => {
            clickedItem = val;
        }).id("test_sidebar");

        let confirmed = false;
        win.addModal("Confirm", "Are you sure?", () => {
            confirmed = true;
        }).id("test_modal");

        let selectedAction = "";
        win.addDropdownMenu("Options", ["Delete"], (w, val) => {
            selectedAction = val;
        }).id("test_dropdown");

        let inputVal = "";
        win.addAnimatedInput("Search...", "", (w, val) => {
            inputVal = val;
        }).id("test_input");

        // Verify handlers are registered in eventHandlersMap
        expect(win.eventHandlersMap.has("test_sidebar:onclick")).toBe(true);
        expect(win.eventHandlersMap.has("test_modal:onconfirm")).toBe(true);
        expect(win.eventHandlersMap.has("test_dropdown:onselect")).toBe(true);
        expect(win.eventHandlersMap.has("test_input:onchange")).toBe(true);
    });

    test("5. IDE Visual Frontend integrity for Extended Controls palette", () => {
        const idePath = join(process.cwd(), "src", "ide.html");
        const ideContent = readFileSync(idePath, "utf-8");

        expect(ideContent).toContain("✨ Extended Controls");
        expect(ideContent).toContain("spawnControl('sidebar')");
        expect(ideContent).toContain("spawnControl('modal')");
        expect(ideContent).toContain("spawnControl('dropdown_menu')");
        expect(ideContent).toContain("spawnControl('list_group')");
        expect(ideContent).toContain("spawnControl('content_card')");
        expect(ideContent).toContain("spawnControl('callout_panel')");
        expect(ideContent).toContain("spawnControl('tooltip_box')");
        expect(ideContent).toContain("spawnControl('animated_input')");
        expect(ideContent).toContain("spawnControl('hero_display')");
        expect(ideContent).toContain("spawnControl('code_snippet')");
        expect(ideContent).toContain("spawnControl('count_badge')");
        expect(ideContent).toContain("spawnControl('button_group')");
        expect(ideContent).toContain("spawnControl('slideshow')");
    });

    test("6. Developer ergonomics: win.on() registers event callbacks cleanly", () => {
        const win = createWindow("Ergonomics Test", 500, 300);
        let clicked = false;
        win.on("my_btn", "click", () => {
            clicked = true;
        });

        expect(win.eventHandlersMap.has("my_btn:onclick")).toBe(true);
        const cb = win.eventHandlersMap.get("my_btn:onclick");
        expect(cb).toBeDefined();
        cb!(win, null);
        expect(clicked).toBe(true);
    });

    test("7. Demo 24 Extended Controls Showcase executes cleanly", async () => {
        const { createExtendedControlsShowcase } = await import("../demos/24_extended_controls_showcase.ts");
        const win = createExtendedControlsShowcase();
        expect(win).toBeDefined();
        const controls = win.getControls();
        expect(controls.length).toBeGreaterThanOrEqual(13);

        const types = new Set(controls.map(c => c.control_type));
        expect(types.has("hero_display")).toBe(true);
        expect(types.has("sidebar")).toBe(true);
        expect(types.has("dropdown_menu")).toBe(true);
        expect(types.has("list_group")).toBe(true);
        expect(types.has("content_card")).toBe(true);
        expect(types.has("callout_panel")).toBe(true);
        expect(types.has("tooltip_box")).toBe(true);
        expect(types.has("animated_input")).toBe(true);
        expect(types.has("code_snippet")).toBe(true);
        expect(types.has("count_badge")).toBe(true);
        expect(types.has("button_group")).toBe(true);
        expect(types.has("slideshow")).toBe(true);
        expect(types.has("modal")).toBe(true);
    });

    test("8. Theme Visual Harmony: Extended Controls render cleanly across Light, Dark, and Retro styles", async () => {
        const { SIMPLEGUI_THEMES } = await import("../src/simplegui");
        const keyThemes = ["codefreelance", "apple_light", "amber_crt", "matrix", "dracula", "nord", "win95", "ubuntu_dark", "adwaita_dark"];

        for (const themeKey of keyThemes) {
            const theme = SIMPLEGUI_THEMES[themeKey];
            expect(theme).toBeDefined();

            const win = createWindow(`Theme Test - ${theme.name}`, 1000, 800, { theme: themeKey });
            win.addHeroDisplay("h1", "Test Hero", "Subtitle");
            win.addSidebar("sb1", "Nav", ["Item 1", "Item 2"]);
            win.addDropdownMenu("dd1", "Action", ["A", "B"]);
            win.addListGroup("lg1", [{ title: "T1", badge: "OK" }]);
            win.addContentCard("cc1", "Card", "Desc", "Foot", "Click");
            win.addCalloutPanel("cp1", "Note", "Content", "info");
            win.addTooltipBox("tb1", "Tip", "Target");
            win.addAnimatedInput("ai1", "Placeholder");
            win.addCodeSnippet("cs1", "console.log('hi');");
            win.addCountBadge("cb1", "Badge", 5, "primary");
            win.addButtonGroup("bg1", ["Prev", "Next"]);
            win.addSlideshow("ss1", [{ caption: "Slide 1" }, { caption: "Slide 2" }]);
            win.addModal("m1", "Modal", "Msg");

            const html = win.toHtml();

            expect(html).toContain("<!DOCTYPE html>");
            expect(html).toContain("rad-sidebar");
            expect(html).toContain("rad-modal");
            expect(html).toContain("rad-dropdown-menu");
            expect(html).toContain("rad-list-group");
            expect(html).toContain("rad-content-card");
            expect(html).toContain("rad-callout-panel");
            expect(html).toContain("rad-tooltip-container");
            expect(html).toContain("rad-anim-input");
            expect(html).toContain("rad-code-box");
            expect(html).toContain("rad-btn-bar");
            expect(html).toContain("rad-slideshow");

            // Verify no unrendered or broken style tokens
            expect(html).not.toContain("background: undefined");
            expect(html).not.toContain("color: undefined");
            expect(html).not.toContain("border: undefined");

            // Verify card background matches theme's card_background
            if (theme.card_background) {
                expect(html).toContain(`--card-bg: ${theme.card_background}`);
            }

            // Light vs Dark dot contrast in slideshow based on card background brightness
            const isCardLight = !theme.is_dark || (theme.card_background && (theme.card_background === "#ffffff" || theme.card_background === "#c0c0c0"));
            if (isCardLight) {
                expect(html).toContain("rgba(0,0,0,0.22)");
            } else {
                expect(html).toContain("rgba(255,255,255,0.3)");
            }
        }
    });

    test("9. Full Theme Spectrum: All built-in SimpleGUI themes render without color clashing", async () => {
        const { SIMPLEGUI_THEMES } = await import("../src/simplegui");
        const themeKeys = Object.keys(SIMPLEGUI_THEMES);
        expect(themeKeys.length).toBeGreaterThanOrEqual(90);

        for (const key of themeKeys) {
            const theme = SIMPLEGUI_THEMES[key];
            const spec = {
                title: `Theme Spectrum - ${key}`,
                width: 800,
                height: 600,
                background_color: theme.background_color,
                font_color: theme.font_color,
                accent_color: theme.accent_color,
                secondary_accent: theme.secondary_accent,
                card_background: theme.card_background,
                card_border: theme.card_border,
                controls: [
                    { id: "ctrl_btn_grp", control_type: "button_group", x: 10, y: 10, width: 200, height: 32, buttons: ["A", "B"] },
                    { id: "ctrl_card", control_type: "content_card", x: 10, y: 50, width: 200, height: 150, title: "Card", button_text: "Go" },
                    { id: "ctrl_modal", control_type: "modal", x: 10, y: 210, width: 300, height: 180, title: "Modal" },
                    { id: "ctrl_dd", control_type: "dropdown_menu", x: 220, y: 10, width: 140, height: 32, text: "Menu" },
                    { id: "ctrl_sb", control_type: "sidebar", x: 220, y: 50, width: 180, height: 200, title: "Sidebar" },
                    { id: "ctrl_slides", control_type: "slideshow", x: 10, y: 400, width: 250, height: 120 },
                ]
            };

            const html = generatePreviewHtml(spec);
            expect(html.length).toBeGreaterThan(500);
            expect(html).not.toContain("background: undefined");
            expect(html).not.toContain("color: undefined");
            expect(html).not.toContain("border: undefined");

            // Buttons on bright accents (e.g. matrix, amber CRT, yellow/green neon) should use dark text (#000000)
            const isBright = ["#0fb36a", "#30d158", "#00ff00", "#00ff41", "#ffb000", "#ffd866"].includes(theme.accent_color);
            if (isBright) {
                // Should use black font on active elements
                expect(html).toContain('color:#000000');
            }
        }
    });
});
