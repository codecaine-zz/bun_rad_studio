import { describe, test, expect } from "bun:test";
import { simplegui, SimpleWindow, createWindow, listThemes, getTheme, homeDir, documentsDir } from "../index.ts";

describe("⚡ SimpleGUI Declarative Module Specification Suite", () => {

    test("1. Window Initialization & Theme Resolution", () => {
        const win = createWindow("Test Application", 840, 600, {
            theme: "dracula",
            alwaysOnTop: true
        });

        expect(win.title).toBe("Test Application");
        expect(win.width).toBe(840);
        expect(win.height).toBe(600);
        expect(win.theme).toBe("dracula");
        expect(win.backgroundColor).toBe("#282a36");
        expect(win.fontColor).toBe("#f8f8f2");
        expect(win.alwaysOnTop).toBe(true);

        win.setTheme("nord");
        expect(win.backgroundColor).toBe("#2e3440");
        expect(win.fontColor).toBe("#eceff4");
    });

    test("2. Fluent Control Builder & Property Chaining", () => {
        const win = new SimpleWindow("Fluent Test", 800, 600);

        const lbl = win.addLabel("Welcome to SimpleGUI")
            .id("lbl_welcome")
            .font(20, "#38bdf8", "700")
            .align("center")
            .tooltip("Greeting label");

        expect(lbl.spec.id).toBe("lbl_welcome");
        expect(lbl.spec.text).toBe("Welcome to SimpleGUI");
        expect(lbl.spec.font_size).toBe(20);
        expect(lbl.spec.font_color).toBe("#38bdf8");
        expect(lbl.spec.font_weight).toBe("700");
        expect(lbl.spec.text_align).toBe("center");
        expect(lbl.spec.tooltip).toBe("Greeting label");

        const btn = win.addButton("Click Me")
            .id("btn_click")
            .width(160)
            .height(40)
            .bg("#10b981")
            .color("#ffffff")
            .bold();

        expect(btn.spec.id).toBe("btn_click");
        expect(btn.spec.width).toBe(160);
        expect(btn.spec.height).toBe(40);
        expect(btn.spec.background_color).toBe("#10b981");
        expect(btn.spec.font_color).toBe("#ffffff");
        expect(btn.spec.font_weight).toBe("700");
    });

    test("3. Auto Layout Containers (Rows, Grids, Cards)", () => {
        const win = createWindow("Layout Test", 800, 600);

        // Row Container
        win.beginRow();
        const input1 = win.addTextInput("First Name", "Alex").width(200);
        const input2 = win.addTextInput("Last Name", "Mercer").width(200);
        win.endRow();

        expect(input1.spec.left).toBe(20);
        expect(input2.spec.left).toBe(232); // 20 + 200 + spacing(12)

        // Grid Container
        win.beginGrid(2, 16);
        const cell1 = win.addTextInput("Grid Item 1");
        const cell2 = win.addTextInput("Grid Item 2");
        win.endGrid();

        expect(cell1.spec.width).toBe(Math.floor((800 - 40 - 16) / 2)); // (800 - padding*2 - gap)/2
        expect(cell2.spec.left).toBe(20 + cell1.spec.width + 16);

        // Card Panel Container
        win.beginCard("User Settings");
        const cardInput = win.addTextInput("Setting Key");
        win.endCard();

        expect(cardInput.spec.left).toBe(36); // Card indent
    });

    test("4. Form Value Serialization & Batch Operations", () => {
        const win = createWindow("Form Values Test", 800, 600);

        win.addTextInput("Full Name", "Sarah Connor").id("txtName");
        win.addTextInput("Email", "sarah@cyberdyne.com").id("txtEmail");
        win.addCheckbox("Subscribed", true).id("chkSub");
        win.addDropdown(["Standard", "Pro", "Enterprise"], "Pro").id("cmbPlan");

        const formVals = win.getFormValues();
        expect(formVals.txtName).toBe("Sarah Connor");
        expect(formVals.txtEmail).toBe("sarah@cyberdyne.com");
        expect(formVals.chkSub).toBe(true);
        expect(formVals.cmbPlan).toBe("Pro");

        win.setValue("txtName", "John Connor");
        expect(win.getValue("txtName")).toBe("John Connor");

        win.setFormValues({
            txtEmail: "john@resistance.org",
            chkSub: false
        });
        expect(win.getValue("txtEmail")).toBe("john@resistance.org");
        expect(win.getValue("chkSub")).toBe(false);

        win.clearForm();
        expect(win.getValue("txtName")).toBe("");
        expect(win.getValue("txtEmail")).toBe("");
    });

    test("5. FormSpec & HTML Generation Engine", () => {
        const win = simplegui.createWindow("HTML Engine Test", 600, 400);
        win.addLabel("Header Label").id("lblHeader");
        win.addButton("Submit Button").id("btnSubmit");
        win.addDatePicker("2026-07-27").id("dtPicker");
        win.addColorWell("#0284c7").id("colPicker");
        win.addTimer(1000, () => {}, { id: "timerClock" });

        const spec = win.buildFormSpec();
        expect(spec.title).toBe("HTML Engine Test");
        expect(spec.controls.length).toBe(4);
        expect(spec.non_visual_controls.length).toBe(1);
        expect(spec.non_visual_controls[0].interval).toBe(1000);

        const html = win.generateHtml();
        expect(html).toContain("HTML Engine Test");
        expect(html).toContain("lblHeader");
        expect(html).toContain("btnSubmit");
        expect(html).toContain('type="date"');
        expect(html).toContain('type="color"');
        expect(html).toContain("window.onSimpleguiPromptResult");
    });

    test("6. vlang_simplegui API Parity & Extended Features", () => {
        const win = simplegui.new_simple_window("V API Parity Window", 640, 480);

        // Inspection & Control Verification
        win.addFormField("Full Name", "txtName", "Ada Lovelace");
        win.addFormPassword("Password", "txtPass", "secret");
        win.addFormDropdown("Role", "cmbRole", ["Developer", "Admin"], "Developer");

        expect(win.hasControl("txtName")).toBe(true);
        expect(win.requireControl("txtName")).toBe("txtName");
        expect(win.getControlKind("txtName")).toBe("input");
        expect(win.listControls()).toContain("txtName");
        expect(win.getTitle()).toBe("V API Parity Window");

        // Typed Getters & Setters
        win.setBool("chkOpt", true);
        expect(win.getBool("chkOpt")).toBe(true);

        win.setInt("numAge", 42);
        expect(win.getInt("numAge")).toBe(42);

        win.setFloat("fltScale", 3.14);
        expect(win.getFloat("fltScale")).toBe(3.14);

        // Nameless Control Helpers
        win.input("Nameless Val");
        expect(win.hasControl("default_input")).toBe(true);

        win.button("Nameless Btn");
        expect(win.hasControl("default_button")).toBe(true);

        // Themes & Paths
        expect(listThemes()).toContain("Apple Dark");
        const theme = getTheme("Dracula");
        expect(theme.name).toBe("Dracula");
        expect(homeDir()).toBeDefined();
        expect(documentsDir()).toContain("Documents");
    });

    test("7. Ergonomics API & Beginner Helpers (Parity with ergonomics.v)", async () => {
        const win = simplegui.createWindow("Ergonomics Test", 800, 600);

        // Control registration
        const txtA = win.addTextInput("Text A", "Initial A").id("txtA");
        const txtB = win.addTextInput("Text B", "Initial B").id("txtB");
        const chkOpt = win.addCheckbox("Option", false).id("chkOpt");
        const numCount = win.addStepper(0, 100, 10).id("numCount");
        const cmbList = win.addDropdown(["Apple", "Banana", "Cherry"], "Banana").id("cmbList");

        // Batch Visibility & Enabled Operations
        win.disableControls(["txtA", "txtB"]);
        expect(win.getControlEnabled("txtA")).toBe(false);
        expect(win.getControlEnabled("txtB")).toBe(false);

        win.enableAllControls();
        expect(win.getControlEnabled("txtA")).toBe(true);
        expect(win.getControlEnabled("txtB")).toBe(true);

        win.hideControls(["txtA"]);
        expect(win.getControlVisible("txtA")).toBe(false);

        win.showControls(["txtA"]);
        expect(win.getControlVisible("txtA")).toBe(true);

        win.toggleVisible("txtA");
        expect(win.getControlVisible("txtA")).toBe(false);

        win.toggleEnabled("txtB");
        expect(win.getControlEnabled("txtB")).toBe(false);

        // Value Convenience Accessors & Modifiers
        expect(win.increment("numCount", 5)).toBe(15);
        expect(win.getInt("numCount")).toBe(15);

        expect(numCount.increment(5)).toBe(20);

        expect(win.toggleChecked("chkOpt")).toBe(true);
        expect(win.getBool("chkOpt")).toBe(true);

        win.appendText("txtB", " Appended");
        expect(win.getText("txtB")).toBe("Initial B Appended");

        win.appendLine("txtB", "Line 2");
        expect(win.getText("txtB")).toBe("Initial B Appended\nLine 2");

        // Batch Setters & Getters
        win.setManyTexts({ txtA: "New A", txtB: "New B" });
        expect(win.getManyTexts(["txtA", "txtB"])).toEqual({ txtA: "New A", txtB: "New B" });

        win.setAll({ txtA: "Batch A", txtB: "Batch B" });
        expect(win.getAll(["txtA", "txtB"])).toEqual({ txtA: "Batch A", txtB: "Batch B" });

        // List Item Management (Dropdown & ListBox)
        const lstFw = win.addListBox(["React", "Vue", "Svelte"], "React", undefined, { size: 4 }).id("lstFw");
        expect(win.getListItems("cmbList")).toEqual(["Apple", "Banana", "Cherry"]);
        expect(win.getListCount("cmbList")).toBe(3);
        expect(win.getListItems("lstFw")).toEqual(["React", "Vue", "Svelte"]);

        win.addListItem("cmbList", "Dragonfruit");
        expect(win.getListItems("cmbList")).toEqual(["Apple", "Banana", "Cherry", "Dragonfruit"]);

        win.removeListItem("cmbList", 0);
        expect(win.getListItems("cmbList")).toEqual(["Banana", "Cherry", "Dragonfruit"]);

        win.setValue("lstFw", "Vue");
        expect(win.getListSelectedText("lstFw")).toBe("Vue");

        win.removeSelectedListItem("lstFw");
        expect(win.getListItems("lstFw")).toEqual(["React", "Svelte"]);
        expect(win.getListSelectedText("lstFw")).toBe("React");

        // Busy State Handler & Async Delays
        await win.withBusyState(["txtA", "txtB"], "Processing...", async (w) => {
            expect(w.getControlEnabled("txtA")).toBe(false);
            expect(w.statusText).toBe("Processing...");
            await w.delay(10);
            await w.sleep(10);
        });
        expect(win.getControlEnabled("txtA")).toBe(true);

        // Settings Persistence (JSON)
        const tempPath = `/tmp/test_simplegui_settings_${Date.now()}.json`;
        win.saveValuesToFile(tempPath);

        win.setAll({ txtA: "Modified A", txtB: "Modified B" });
        expect(win.getText("txtA")).toBe("Modified A");

        win.loadValuesFromFile(tempPath);
        expect(win.getText("txtA")).toBe("Batch A");
    });
});

