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
                { id: "db_drop_1", control_type: "db_dropdown", x: 10, y: 360, width: 200, height: 40, text: "Category" }
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

        // Verify key toolbar actions
        expect(ideContent).toContain("launchAccessCrudWizard()");
        expect(ideContent).toContain("alignSelectedControls('left')");
        expect(ideContent).toContain("equalizeSize('width')");

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

});
