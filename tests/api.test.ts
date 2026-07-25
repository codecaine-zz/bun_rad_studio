import { describe, test, expect, afterAll } from "bun:test";
import { readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { generatePreviewHtml, exportProjectHelper, setAlwaysOnTopNative, setWindowPositionNative, toggleFullscreenNative } from "../index.ts";

const TEST_EXPORT_DIR = join(process.cwd(), ".test_export_output");

afterAll(() => {
    if (existsSync(TEST_EXPORT_DIR)) {
        rmSync(TEST_EXPORT_DIR, { recursive: true, force: true });
    }
});

describe("⚡ Bun RAD Studio API & Data Specification Suite", () => {

    test("1. FormSpec Data Model Schema Validation", () => {
        const sampleSpec = {
            title: "Test CRUD Form",
            width: 860,
            height: 580,
            background_color: "#0f172a",
            font_color: "#f8fafc",
            padding: 20,
            spacing: 12,
            controls: [
                {
                    id: "btn_submit",
                    control_type: "button",
                    x: 40,
                    y: 50,
                    width: 140,
                    height: 36,
                    text: "Submit Record",
                    anchors: { top: true, left: true, right: false, bottom: false },
                    dock: "none",
                    event_handlers: { onClick: "on_submit_click" }
                },
                {
                    id: "db_grid_1",
                    control_type: "db_grid",
                    x: 200,
                    y: 50,
                    width: 400,
                    height: 250,
                    text: "Dataset1 Grid",
                    data_source: "Dataset1"
                },
                {
                    id: "db_input_name",
                    control_type: "db_input",
                    x: 40,
                    y: 100,
                    width: 240,
                    height: 44,
                    text: "Customer Name",
                    data_source: "Dataset1",
                    data_field: "company_name"
                }
            ],
            non_visual_controls: [
                {
                    id: "timer1",
                    control_type: "timer",
                    interval: 1000,
                    enabled: true,
                    event_handlers: { onTimer: "on_timer_tick" }
                },
                {
                    id: "dbConn1",
                    control_type: "db_connection",
                    text: "customers.db"
                }
            ]
        };

        expect(sampleSpec.title).toBe("Test CRUD Form");
        expect(sampleSpec.controls.length).toBe(3);
        expect(sampleSpec.non_visual_controls.length).toBe(2);
        expect(sampleSpec.controls[0]?.anchors?.top).toBe(true);
        expect(sampleSpec.controls[1]?.control_type).toBe("db_grid");
        expect(sampleSpec.controls[2]?.data_field).toBe("company_name");
        expect(sampleSpec.non_visual_controls?.[0]?.interval).toBe(1000);
    });

    test("2. Backend HTML Preview Generator (generatePreviewHtml)", () => {
        const spec = {
            title: "Preview Test Form",
            width: 800,
            height: 600,
            background_color: "#1e293b",
            font_color: "#ffffff",
            controls: [
                { id: "btn1", control_type: "button", x: 10, y: 10, width: 100, height: 30, text: "Click Me", event_handlers: { onClick: "onBtnClick" } },
                { id: "lbl1", control_type: "label", x: 10, y: 50, width: 100, height: 30, text: "Status Label" },
                { id: "db_grid_1", control_type: "db_grid", x: 10, y: 100, width: 300, height: 150, text: "Dataset1" },
                { id: "db_nav_1", control_type: "db_navigator", x: 10, y: 260, width: 300, height: 36, text: "Dataset1" },
                { id: "db_input_1", control_type: "db_input", x: 10, y: 310, width: 200, height: 40, text: "Email" },
                { id: "db_drop_1", control_type: "db_dropdown", x: 10, y: 360, width: 200, height: 40, text: "Category" },
                { id: "seg_1", control_type: "segmented_control", x: 10, y: 410, width: 240, height: 36, text: "Overview, Analytics, Reports" },
                { id: "tree_1", control_type: "tree_view", x: 10, y: 450, width: 220, height: 140, text: "Project Root, 📂 src, 📄 index.ts" },
                { id: "av_1", control_type: "avatar_group", x: 10, y: 600, width: 160, height: 38, text: "JD, AS, MK, +3" },
                { id: "stat_1", control_type: "stat_chart", x: 10, y: 650, width: 200, height: 90, text: "Revenue" },
                { id: "acc_1", control_type: "accordion", x: 10, y: 750, width: 280, height: 100, text: "Section 1" },
                { id: "crumb_1", control_type: "breadcrumb", x: 10, y: 860, width: 260, height: 32, text: "Home, Projects, Settings" },
                { id: "time_1", control_type: "timeline", x: 10, y: 900, width: 280, height: 110, text: "Step 1, Step 2, Step 3" },
                { id: "toast_1", control_type: "toast_card", x: 10, y: 1020, width: 260, height: 64, text: "Saved!" },
                { id: "tp_1", control_type: "time_picker", x: 10, y: 1090, width: 150, height: 36, value: "09:41" },
                { id: "sel_1", control_type: "rich_select", x: 10, y: 1130, width: 200, height: 36, text: "Choose User..." },
                { id: "inp_dev", control_type: "input", x: 10, y: 1180, width: 200, height: 36, text: "Dev Value", read_only: true, required: true, max_length: 50, auto_focus: true },
                { id: "num_dev", control_type: "number", x: 10, y: 1220, width: 200, height: 36, value: 25, min_value: 0, max_value: 100, step: 5 }
            ]
        };

        const html = generatePreviewHtml(spec);

        expect(typeof html).toBe("string");
        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("Preview Test Form");
        expect(html).toContain("id=\"btn1\"");
        expect(html).toContain("onBtnClick");
        expect(html).toContain("Dataset1");
        expect(html).toContain("🗄️");
        expect(html).toContain("⏮"); // DB Navigator button
        expect(html).toContain("Email");
        expect(html).toContain("Category");
        expect(html).toContain("id=\"seg_1\"");
        expect(html).toContain("Overview");
        expect(html).toContain("id=\"tree_1\"");
        expect(html).toContain("Project Root");
        expect(html).toContain("id=\"av_1\"");
        expect(html).toContain("JD");
        expect(html).toContain("id=\"stat_1\"");
        expect(html).toContain("Revenue");
        expect(html).toContain("id=\"acc_1\"");
        expect(html).toContain("Section 1");
        expect(html).toContain("id=\"crumb_1\"");
        expect(html).toContain("Home");
        expect(html).toContain("id=\"time_1\"");
        expect(html).toContain("Step 1");
        expect(html).toContain("id=\"toast_1\"");
        expect(html).toContain("Saved!");
        expect(html).toContain("id=\"tp_1\"");
        expect(html).toContain("09:41");
        expect(html).toContain("id=\"sel_1\"");
        expect(html).toContain("Choose User...");
        expect(html).toContain("id=\"inp_dev\"");
        expect(html).toContain(" readonly");
        expect(html).toContain(" required");
        expect(html).toContain("maxlength=\"50\"");
        expect(html).toContain(" autofocus");
        expect(html).toContain("id=\"num_dev\"");
        expect(html).toContain("min=\"0\"");
        expect(html).toContain("max=\"100\"");
        expect(html).toContain("step=\"5\"");

        // Verify Custom Control Colors & Themes propagate to Preview HTML
        const lightSpec = {
            title: "Light Theme Form",
            background_color: "#f8fafc",
            font_color: "#0f172a",
            controls: [
                { id: "inp_custom", control_type: "form_field", x: 10, y: 10, width: 200, height: 40, text: "Custom Input", background_color: "#ff007f", font_color: "#00f6ff" }
            ]
        };
        const lightHtml = generatePreviewHtml(lightSpec);
        expect(lightHtml).toContain("background: #f8fafc;");
        expect(lightHtml).toContain("background:#ff007f");
        expect(lightHtml).toContain("color:#00f6ff");
        // Ensure inline style attributes do not contain unescaped double quotes that break HTML parsing
        expect(lightHtml).not.toMatch(/style="[^"]*font-family:[^"]*"[^"]*;/);

        // Verify Enabled State (enabled: false) propagation
        const disabledSpec = {
            controls: [
                { id: "btn_dis", control_type: "button", enabled: false, x: 10, y: 10, width: 100, height: 30, text: "Disabled Btn" }
            ]
        };
        const disabledHtml = generatePreviewHtml(disabledSpec);
        expect(disabledHtml).toContain("opacity:0.55;pointer-events:none;");
        expect(disabledHtml).toContain("disabled");

        // Verify Border, Radius, Elevation Shadow, Text Alignment & Opacity propagation
        const styledSpec = {
            controls: [
                { 
                    id: "btn_styled", 
                    control_type: "button", 
                    x: 10, y: 10, width: 120, height: 40, text: "Styled Btn", 
                    border_radius: 12, 
                    border_width: 2, 
                    border_color: "#38bdf8", 
                    border_style: "dashed", 
                    box_shadow: "glow", 
                    text_align: "center", 
                    opacity: 90 
                }
            ]
        };
        const styledHtml = generatePreviewHtml(styledSpec);
        expect(styledHtml).toContain("border-radius:12px;");
        expect(styledHtml).toContain("border-width:2px;");
        expect(styledHtml).toContain("border-color:#38bdf8;");
        expect(styledHtml).toContain("border-style:dashed;");
        expect(styledHtml).toContain("box-shadow:0 0 15px #38bdf8;");
        expect(styledHtml).toContain("text-align:center;");
        expect(styledHtml).toContain("opacity:0.9;");
    });

    test("3. Project Exporter Engine (exportProjectHelper)", () => {
        const spec = {
            title: "Exported Test App",
            width: 840,
            height: 560,
            controls: [
                { id: "btn_export", control_type: "button", x: 50, y: 50, width: 120, height: 36, text: "Exported Button" }
            ]
        };

        const res = exportProjectHelper(JSON.stringify(spec), TEST_EXPORT_DIR);

        expect(res.success).toBe(true);
        expect(res.dir).toBe(TEST_EXPORT_DIR);

        const htmlPath = join(TEST_EXPORT_DIR, "index.html");
        const tsPath = join(TEST_EXPORT_DIR, "index.ts");
        const pkgPath = join(TEST_EXPORT_DIR, "package.json");

        expect(existsSync(htmlPath)).toBe(true);
        expect(existsSync(tsPath)).toBe(true);
        expect(existsSync(pkgPath)).toBe(true);

        const htmlContent = readFileSync(htmlPath, "utf-8");
        const tsContent = readFileSync(tsPath, "utf-8");
        const pkgContent = JSON.parse(readFileSync(pkgPath, "utf-8"));

        expect(htmlContent).toContain("Exported Test App");
        expect(tsContent).toContain("import { SizeHint, Webview } from \"webview-bun\";");
        expect(tsContent).toContain("export function setControlValue");
        expect(tsContent).toContain("export function setSegmentedSelected");
        expect(tsContent).toContain("export function setStatChart");
        expect(tsContent).toContain("export function setToast");
        expect(tsContent).toContain("export function setAccordionOpen");
        expect(pkgContent.dependencies["webview-bun"]).toBeDefined();
        expect(pkgContent.scripts.start).toBe("bun run index.ts");
    });

    test("4. IDE Visual Frontend File Integrity (ide.html)", () => {
        const idePath = join(process.cwd(), "src", "ide.html");
        expect(existsSync(idePath)).toBe(true);

        const ideContent = readFileSync(idePath, "utf-8");

        // Verify key RAD categories
        expect(ideContent).toContain("Standard Controls");
        expect(ideContent).toContain("Database & Data Controls");
        expect(ideContent).toContain("Non-Visual Component Tray");
        expect(ideContent).toContain("Advanced Modern Controls");

        // Verify key toolbar actions
        expect(ideContent).toContain("launchAccessCrudWizard()");
        expect(ideContent).toContain("alignSelectedControls('left')");
        expect(ideContent).toContain("equalizeSize('width')");
        expect(ideContent).toContain("window.quitApp");
        expect(ideContent).toContain("Cmd + Q");
        expect(ideContent).toContain("toggleAlwaysOnTop()");
        expect(ideContent).toContain("toggleFullscreen()");
        expect(ideContent).toContain("stayOnTopBtn");
        expect(ideContent).toContain("Fn + F");
        expect(ideContent).toContain("winPosSelect");
        expect(ideContent).toContain("changeWindowPosition(this.value)");

        // Verify Object Inspector & Code Editor Modal
        expect(ideContent).toContain("id=\"nonVisualTray\"");
        expect(ideContent).toContain("id=\"eventEditorModal\"");
        expect(ideContent).toContain("id=\"anchorTopBtn\"");
        expect(ideContent).toContain("id=\"propDock\"");
        expect(ideContent).toContain("id=\"propDataSource\"");

        // Verify Exporter tabs & Copy Toast Notifications
        expect(ideContent).toContain("switchTab('tabReact', event)");
        expect(ideContent).toContain("switchTab('tabVue', event)");
        expect(ideContent).toContain("switchTab('tabPython', event)");
        expect(ideContent).toContain("generateReactTailwindCode()");
        expect(ideContent).toContain("generateVueCode()");
        expect(ideContent).toContain("generatePythonTkinterCode()");
        expect(ideContent).toContain("id=\"copyNotificationToast\"");
        expect(ideContent).toContain("flashCopyButton");
        expect(ideContent).toContain("showCopyToast");
    });

    test("5. Interactive Demos Suite Integrity (demos/)", () => {
        const demo1Path = join(process.cwd(), "demos", "01_standard_controls.ts");
        const demo2Path = join(process.cwd(), "demos", "02_advanced_modern_controls.ts");
        const demo3Path = join(process.cwd(), "demos", "03_data_and_non_visual.ts");
        const demo4Path = join(process.cwd(), "demos", "04_window_placement_and_pin.ts");
        const demo5Path = join(process.cwd(), "demos", "05_crud_todo_table.ts");
        const demo6Path = join(process.cwd(), "demos", "06_timer_control_studio.ts");
        const demo7Path = join(process.cwd(), "demos", "07_labeled_form_and_desktop_controls.ts");
        const demo8Path = join(process.cwd(), "demos", "08_analytics_dashboard_template.ts");
        const demo9Path = join(process.cwd(), "demos", "09_file_explorer_ide_template.ts");
        const demo10Path = join(process.cwd(), "demos", "10_db_studio_query_editor_template.ts");
        const demo11Path = join(process.cwd(), "demos", "11_app_settings_preferences_template.ts");

        expect(existsSync(demo1Path)).toBe(true);
        expect(existsSync(demo2Path)).toBe(true);
        expect(existsSync(demo3Path)).toBe(true);
        expect(existsSync(demo4Path)).toBe(true);
        expect(existsSync(demo5Path)).toBe(true);
        expect(existsSync(demo6Path)).toBe(true);
        expect(existsSync(demo7Path)).toBe(true);
        expect(existsSync(demo8Path)).toBe(true);
        expect(existsSync(demo9Path)).toBe(true);
        expect(existsSync(demo10Path)).toBe(true);
        expect(existsSync(demo11Path)).toBe(true);

        const d1 = readFileSync(demo1Path, "utf-8");
        const d2 = readFileSync(demo2Path, "utf-8");
        const d3 = readFileSync(demo3Path, "utf-8");
        const d4 = readFileSync(demo4Path, "utf-8");
        const d5 = readFileSync(demo5Path, "utf-8");
        const d6 = readFileSync(demo6Path, "utf-8");
        const d8 = readFileSync(demo8Path, "utf-8");
        const d9 = readFileSync(demo9Path, "utf-8");
        const d10 = readFileSync(demo10Path, "utf-8");
        const d11 = readFileSync(demo11Path, "utf-8");

        expect(d1).toContain("generatePreviewHtml");
        expect(d2).toContain("segmented_control");
        expect(d2).toContain("stat_chart");
        expect(d2).toContain("toast_card");
        expect(d3).toContain("db_grid");
        expect(d3).toContain("code_view");
        expect(d4).toContain("setWindowPositionNative");
        expect(d4).toContain("setAlwaysOnTopNative");
        expect(d5).toContain("on_btnAddRow_click");
        expect(d6).toContain("timer");

        // Demos 8-11 Templates Integrity
        expect(d8).toContain("stat_chart");
        expect(d8).toContain("circular_progress");
        expect(d9).toContain("tree_view");
        expect(d9).toContain("form_code");
        expect(d10).toContain("db_navigator");
        expect(d10).toContain("db_grid");
        expect(d11).toContain("form_color");
        expect(d11).toContain("form_drop_zone");
        expect(d5).toContain("table");
        expect(d5).toContain("columns");
        expect(d5).toContain("rows");
        expect(d6).toContain("timer");
        expect(d6).toContain("onTimer");
    });

    test("6. Cross-Platform Native Window Helpers Validation", () => {
        const dummyWebview = { unsafeWindowHandle: null } as any;
        expect(() => setAlwaysOnTopNative(dummyWebview, true)).not.toThrow();
        expect(() => toggleFullscreenNative(dummyWebview)).not.toThrow();
        expect(() => setWindowPositionNative(dummyWebview, "center", 800, 600)).not.toThrow();
        expect(() => setWindowPositionNative(dummyWebview, { x: 100, y: 100 }, 800, 600)).not.toThrow();
    });

    test("7. Control HTML Translation Validation", () => {
        const spec = {
            title: "HTML Translation Test",
            controls: [
                { id: "src_1", control_type: "search", x: 10, y: 10, width: 200, height: 36, text: "Filter...", placeholder: "Search items..." },
                { id: "num_1", control_type: "number", x: 10, y: 50, width: 200, height: 36, value: 42 },
                { id: "date_1", control_type: "date", x: 10, y: 90, width: 200, height: 36 },
                { id: "col_1", control_type: "color", x: 10, y: 130, width: 200, height: 36, value: "#0284c7" },
                { id: "sld_1", control_type: "slider", x: 10, y: 170, width: 200, height: 36, value: 75 }
            ]
        };

        const html = generatePreviewHtml(spec);

        // Search control must translate to <input type="search">
        expect(html).toContain('id="src_1"');
        expect(html).toContain('type="search"');
        expect(html).toContain('placeholder="Search items..."');

        // Verify other input controls translate properly
        expect(html).toContain('id="num_1"');
        expect(html).toContain('type="number"');

        expect(html).toContain('id="date_1"');
        expect(html).toContain('type="date"');

        expect(html).toContain('id="col_1"');
        expect(html).toContain('type="color"');

        expect(html).toContain('id="sld_1"');
        expect(html).toContain('type="range"');

        // Verify ide.html contains proper search input translation handling
        const idePath = join(process.cwd(), "src", "ide.html");
        const ideContent = readFileSync(idePath, "utf-8");
        expect(ideContent).toContain('c.control_type === "search"');
        expect(ideContent).toContain('type="search"');
    });

    test("8. Labeled Controls & Desktop App Controls Suite Validation", () => {
        const spec = {
            title: "Labeled & Desktop App Suite",
            controls: [
                { id: "fc_1", control_type: "form_checkbox", x: 10, y: 10, width: 220, height: 44, text: "Labeled Checkbox", placeholder: "Enable SSL" },
                { id: "fr_1", control_type: "form_radio", x: 10, y: 60, width: 220, height: 44, text: "Labeled Radio", placeholder: "Radio Opt 1" },
                { id: "fs_1", control_type: "form_search", x: 10, y: 110, width: 220, height: 44, text: "Labeled Search", placeholder: "Find files..." },
                { id: "fclr_1", control_type: "form_color", x: 10, y: 160, width: 220, height: 44, text: "Labeled Color", value: "#0284c7" },
                { id: "ft_1", control_type: "form_time", x: 10, y: 210, width: 220, height: 44, text: "Labeled Time", value: "12:00" },
                { id: "fstep_1", control_type: "form_stepper", x: 10, y: 260, width: 220, height: 44, text: "Labeled Stepper", value: 10 },
                { id: "fcode_1", control_type: "form_code", x: 10, y: 310, width: 280, height: 140, text: "Labeled Code View", code: "const x = 42;" },
                { id: "fdrop_1", control_type: "form_drop_zone", x: 10, y: 460, width: 280, height: 120, text: "Labeled Drop Zone", placeholder: "Drop PDF here" },
                { id: "tabs_1", control_type: "tabs", x: 10, y: 590, width: 320, height: 40, text: "Tab 1, Tab 2, Tab 3", value: "Tab 1" },
                { id: "tb_1", control_type: "tool_bar", x: 10, y: 640, width: 400, height: 40, text: "📄 New, 📂 Open, 💾 Save" },
                { id: "sb_1", control_type: "status_bar", x: 10, y: 690, width: 400, height: 28, text: "UTF-8 | Line 1" },
                { id: "sp_1", control_type: "split_pane", x: 10, y: 730, width: 320, height: 160, text: "Left Tree | Right View" },
                { id: "pag_1", control_type: "pagination", x: 10, y: 900, width: 260, height: 36 },
                { id: "cp_1", control_type: "command_palette", x: 10, y: 945, width: 320, height: 40, placeholder: "Type command..." },
                { id: "tog_1", control_type: "toggle_button", x: 10, y: 995, width: 120, height: 36, text: "🔒 Locked", checked: true }
            ]
        };

        const html = generatePreviewHtml(spec);

        expect(html).toContain('id="fc_1"');
        expect(html).toContain('Labeled Checkbox');
        expect(html).toContain('Enable SSL');
        expect(html).toContain('id="fr_1"');
        expect(html).toContain('Radio Opt 1');
        expect(html).toContain('id="fs_1"');
        expect(html).toContain('Find files...');
        expect(html).toContain('id="fclr_1"');
        expect(html).toContain('#0284c7');
        expect(html).toContain('id="ft_1"');
        expect(html).toContain('12:00');
        expect(html).toContain('id="fstep_1"');
        expect(html).toContain('10');
        expect(html).toContain('id="fcode_1"');
        expect(html).toContain('const x = 42;');
        expect(html).toContain('id="fdrop_1"');
        expect(html).toContain('Drop PDF here');
        expect(html).toContain('id="tabs_1"');
        expect(html).toContain('Tab 1');
        expect(html).toContain('id="tb_1"');
        expect(html).toContain('📄 New');
        expect(html).toContain('id="sb_1"');
        expect(html).toContain('UTF-8 | Line 1');
        expect(html).toContain('id="sp_1"');
        expect(html).toContain('Left Tree');
        expect(html).toContain('id="pag_1"');
        expect(html).toContain('« Prev');
        expect(html).toContain('id="cp_1"');
        expect(html).toContain('Type command...');
        expect(html).toContain('id="tog_1"');
        expect(html).toContain('🔒 Locked');

        // Check index.ts helper exports
        const indexTsContent = readFileSync(join(process.cwd(), "index.ts"), "utf-8");
        expect(indexTsContent).toContain("export function setTabsActive");
        expect(indexTsContent).toContain("export function setStatusBarText");
        expect(indexTsContent).toContain("export function setPaginationPage");
        expect(indexTsContent).toContain("export function setToggleButtonState");

        // Check Demo 7 integrity
        const demo7Path = join(process.cwd(), "demos", "07_labeled_form_and_desktop_controls.ts");
        expect(existsSync(demo7Path)).toBe(true);
        const demo7Content = readFileSync(demo7Path, "utf-8");
        expect(demo7Content).toContain("form_checkbox");
        expect(demo7Content).toContain("command_palette");
        expect(demo7Content).toContain("setTabsActive");

        // Check ide.html palette
        const idePath = join(process.cwd(), "src", "ide.html");
        const ideContent = readFileSync(idePath, "utf-8");
        expect(ideContent).toContain("form_checkbox");
        expect(ideContent).toContain("Desktop App Controls");
        expect(ideContent).toContain("command_palette");
    });

    test("9. Additional 5 Desktop Application Controls Suite Validation", () => {
        const spec = {
            title: "Advanced Desktop Controls Suite",
            controls: [
                { id: "pg_1", control_type: "property_grid", x: 10, y: 10, width: 240, height: 140, text: "Theme: Dark, Font Size: 13px, Version: 1.4.0", caption: "Property Inspector" },
                { id: "pm_1", control_type: "popup_menu", x: 10, y: 160, width: 200, height: 130, text: "✂️ Cut ⌘X, 📋 Copy ⌘C, ---, 🗑️ Delete ⌫" },
                { id: "cal_1", control_type: "calendar_view", x: 10, y: 300, width: 240, height: 180, text: "July 2026" },
                { id: "sw_1", control_type: "color_swatch", x: 10, y: 490, width: 200, height: 70, text: "#0284c7, #38bdf8, #10b981", value: "#0284c7" },
                { id: "fp_1", control_type: "file_path_bar", x: 10, y: 570, width: 280, height: 36, text: "/Users/codecaine/bun_rad_studio/src" }
            ]
        };

        const html = generatePreviewHtml(spec);

        expect(html).toContain('id="pg_1"');
        expect(html).toContain('Property Inspector');
        expect(html).toContain('Theme');
        expect(html).toContain('id="pm_1"');
        expect(html).toContain('✂️ Cut');
        expect(html).toContain('id="cal_1"');
        expect(html).toContain('July 2026');
        expect(html).toContain('id="sw_1"');
        expect(html).toContain('#0284c7');
        expect(html).toContain('id="fp_1"');
        expect(html).toContain('/Users/codecaine/bun_rad_studio/src');

        // Check index.ts helper exports
        const indexTsContent = readFileSync(join(process.cwd(), "index.ts"), "utf-8");
        expect(indexTsContent).toContain("export function setPropertyGridData");
        expect(indexTsContent).toContain("export function setPopupMenuItems");
        expect(indexTsContent).toContain("export function setCalendarDate");
        expect(indexTsContent).toContain("export function setColorSwatchColor");
        expect(indexTsContent).toContain("export function setFilePathBarPath");

        // Check Demo 12 file integrity
        const demo12Path = join(process.cwd(), "demos", "12_advanced_desktop_app_controls.ts");
        expect(existsSync(demo12Path)).toBe(true);
        const demo12Content = readFileSync(demo12Path, "utf-8");
        expect(demo12Content).toContain("property_grid");
        expect(demo12Content).toContain("popup_menu");
        expect(demo12Content).toContain("calendar_view");
        expect(demo12Content).toContain("color_swatch");
        expect(demo12Content).toContain("file_path_bar");
        expect(demo12Content).toContain("setPropertyGridData");

        // Check ide.html palette items
        const idePath = join(process.cwd(), "src", "ide.html");
        const ideContent = readFileSync(idePath, "utf-8");
        expect(ideContent).toContain("property_grid");
        expect(ideContent).toContain("popup_menu");
        expect(ideContent).toContain("calendar_view");
        expect(ideContent).toContain("color_swatch");
        expect(ideContent).toContain("file_path_bar");
    });

});

