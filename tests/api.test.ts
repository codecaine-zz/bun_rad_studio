import { describe, test, expect, afterAll } from "bun:test";
import { readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { generatePreviewHtml, exportProjectHelper } from "../index.ts";

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
        expect(sampleSpec.controls[0].anchors?.top).toBe(true);
        expect(sampleSpec.controls[1].control_type).toBe("db_grid");
        expect(sampleSpec.controls[2].data_field).toBe("company_name");
        expect(sampleSpec.non_visual_controls[0].interval).toBe(1000);
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
                { id: "sel_1", control_type: "rich_select", x: 10, y: 1130, width: 200, height: 36, text: "Choose User..." }
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

        // Verify Exporter tabs
        expect(ideContent).toContain("switchTab('tabReact', event)");
        expect(ideContent).toContain("switchTab('tabVue', event)");
        expect(ideContent).toContain("switchTab('tabPython', event)");
        expect(ideContent).toContain("generateReactTailwindCode()");
        expect(ideContent).toContain("generateVueCode()");
        expect(ideContent).toContain("generatePythonTkinterCode()");
    });

    test("5. Interactive Demos Suite Integrity (demos/)", () => {
        const demo1Path = join(process.cwd(), "demos", "01_standard_controls.ts");
        const demo2Path = join(process.cwd(), "demos", "02_advanced_modern_controls.ts");
        const demo3Path = join(process.cwd(), "demos", "03_data_and_non_visual.ts");
        const demo4Path = join(process.cwd(), "demos", "04_window_placement_and_pin.ts");
        const demo5Path = join(process.cwd(), "demos", "05_crud_todo_table.ts");
        const demo6Path = join(process.cwd(), "demos", "06_timer_control_studio.ts");

        expect(existsSync(demo1Path)).toBe(true);
        expect(existsSync(demo2Path)).toBe(true);
        expect(existsSync(demo3Path)).toBe(true);
        expect(existsSync(demo4Path)).toBe(true);
        expect(existsSync(demo5Path)).toBe(true);
        expect(existsSync(demo6Path)).toBe(true);

        const d1 = readFileSync(demo1Path, "utf-8");
        const d2 = readFileSync(demo2Path, "utf-8");
        const d3 = readFileSync(demo3Path, "utf-8");
        const d4 = readFileSync(demo4Path, "utf-8");
        const d5 = readFileSync(demo5Path, "utf-8");
        const d6 = readFileSync(demo6Path, "utf-8");

        expect(d1).toContain("generatePreviewHtml");
        expect(d2).toContain("segmented_control");
        expect(d2).toContain("stat_chart");
        expect(d2).toContain("toast_card");
        expect(d3).toContain("db_grid");
        expect(d3).toContain("code_view");
        expect(d4).toContain("setWindowPositionNative");
        expect(d4).toContain("setAlwaysOnTopNative");
        expect(d5).toContain("table");
        expect(d5).toContain("columns");
        expect(d5).toContain("rows");
        expect(d6).toContain("timer");
        expect(d6).toContain("onTimer");
    });

});
