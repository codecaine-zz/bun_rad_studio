import { describe, test, expect } from "bun:test";
import { simplegui, SimpleWindow, createWindow, listThemes, getTheme, saveTheme, homeDir, documentsDir, autoShortThemeName, listShortThemes, isBrightAccentColor } from "../index.ts";
import { SIMPLEGUI_THEMES } from "../src/simplegui.ts";
import { createThemeShowcase } from "../demos/23_all_themes_all_controls_showcase.ts";

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

    test("5b. Dropdowns render with dark native styling on Linux", () => {
        const win = simplegui.createWindow("Linux Dropdown Theme Test", 600, 400);
        win.addDropdown(["Alpha", "Beta", "Gamma"], "Beta").id("cmbOS");

        const html = win.generateHtml();
        expect(html).toContain("color-scheme: dark");
        expect(html).toContain("select option");
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
        expect(listThemes()).toContain("CodeFreelance");
        const cfTheme = getTheme("codefreelance");
        expect(cfTheme.name).toBe("CodeFreelance");
        expect(cfTheme.background_color).toBe("#050505");
        expect(cfTheme.accent_color).toBe("#0fb36a");
        expect(cfTheme.font_color).toBe("#ffffff");

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

    test("8. Refactored Flexible Overloads & SimpleControlRef Ergonomics", () => {
        const win = simplegui.createWindow("Refactor Test", 600, 400);

        let cbTriggered = false;
        const txtOverload = win.addTextInput("Enter text...", (w, val) => {
            cbTriggered = true;
        }).id("txtOverload");

        expect(txtOverload.spec.placeholder).toBe("Enter text...");
        expect(txtOverload.spec.value).toBe("");

        let dropdownTriggered = false;
        const cmbOverload = win.addDropdown(["Option 1", "Option 2"], (w, val) => {
            dropdownTriggered = true;
        }).id("cmbOverload");

        expect(cmbOverload.spec.value).toBe("Option 1");

        // Fluent methods on SimpleControlRef
        const sld = win.addSlider(0, 100, 50).id("sldRef")
            .min(10)
            .max(200)
            .step(5)
            .disabled(true)
            .readOnly(true);

        expect(sld.spec.min_value).toBe(10);
        expect(sld.spec.max_value).toBe(200);
        expect(sld.spec.step).toBe(5);
        expect(sld.spec.enabled).toBe(false);
        expect(sld.spec.readonly).toBe(true);

        sld.value(75);
        expect(sld.value()).toBe(75);

        const txtRef = win.addTextInput("Text Ref").id("txtRef");
        txtRef.text("Hello World");
        expect(txtRef.text()).toBe("Hello World");

        cmbOverload.options(["New Opt A", "New Opt B"]);
        expect(win.getListItems("cmbOverload")).toEqual(["New Opt A", "New Opt B"]);

        // Form reset and clear helpers
        win.clearInput("txtRef");
        expect(txtRef.text()).toBe("");

        win.setValue("txtOverload", "Test Content");
        win.resetForm();
        expect(win.getText("txtOverload")).toBe("");
    });

    test("9. Interactive Theme Selector & Dynamic Theme Switching (addThemeSelector, getThemeKeys)", () => {
        const win = createWindow("Theme Selector Test", 900, 700, {
            appId: "theme_selector_test",
            theme: "apple_dark",
            autoSaveState: true
        });

        const themeKeys = simplegui.getThemeKeys();
        expect(themeKeys).toContain("codefreelance");
        expect(themeKeys).toContain("apple_dark");
        expect(themeKeys).toContain("apple_light");
        expect(themeKeys).toContain("midnight");

        // Add theme selector and buttons
        const selectorRef = win.addThemeSelector("dd_theme", "Theme:", false);
        expect(selectorRef.spec.id).toBe("dd_theme");
        expect(win.getValue("dd_theme")).toBe("apple_dark");

        const themeBtn = win.addButton("btn_theme", "Theme Button");
        const aliasBtn = win.add_button("btn_alias", "Alias Button");
        const customBtn = win.addButton("btn_custom", "Delete", { background_color: "#ef4444", font_color: "#ffffff" });

        // Initially in apple_dark (#0a84ff)
        expect(themeBtn.spec.background_color).toBe("#0a84ff");
        expect(aliasBtn.spec.background_color).toBe("#0a84ff");
        expect(customBtn.spec.background_color).toBe("#ef4444");

        // Simulate theme change to codefreelance (#0fb36a neon emerald)
        win.setTheme("codefreelance", true);
        expect(win.theme).toBe("codefreelance");
        expect(win.backgroundColor).toBe("#050505");
        expect(win.fontColor).toBe("#ffffff");
        expect(win.accentColor).toBe("#0fb36a");

        // Standard buttons MUST update to CodeFreelance accent (#0fb36a) and bold black text (#000000)
        expect(themeBtn.spec.background_color).toBe("#0fb36a");
        expect(themeBtn.spec.font_color).toBe("#000000");
        expect(aliasBtn.spec.background_color).toBe("#0fb36a");
        expect(aliasBtn.spec.font_color).toBe("#000000");

        // Custom colored buttons MUST preserve their custom color
        expect(customBtn.spec.background_color).toBe("#ef4444");

        // Switch to dracula (#bd93f9)
        win.setTheme("dracula", false);
        expect(themeBtn.spec.background_color).toBe("#bd93f9");
        expect(themeBtn.spec.font_color).toBe("#ffffff");
        expect(customBtn.spec.background_color).toBe("#ef4444");

        // Verify HTML generated reflects theme variables & classes
        const html = win.generateHtml();
        expect(html).toContain("--btn-bg: #bd93f9;");
        expect(html).toContain("btn-theme-accent");
        expect(html).toContain('data-custom-bg="true"');

        // Restore codefreelance for subsequent tests
        win.setTheme("codefreelance", true);

        // Save form state and ensure __win_theme is preserved
        win.saveAppFormState("theme_selector_test");
        const newWin = createWindow("New Theme Window", 900, 700, {
            appId: "theme_selector_test",
            autoSaveState: true
        });
        newWin.addThemeSelector("dd_theme", "Theme:");
        newWin.restoreAppFormState("theme_selector_test");

        expect(newWin.theme).toBe("codefreelance");
        expect(newWin.getValue("dd_theme")).toBe("codefreelance");
        newWin.clearAppFormState("theme_selector_test");
        saveTheme("midnight");
    });

    test("9b. Nostalgic Special Themes & Auto Short Theme Names (win95, gameboy, c64, matrix, amber_crt, synthwave)", () => {
        // 1. Check existence of nostalgic themes
        const themes = listThemes();
        expect(themes).toContain("Windows 95");
        expect(themes).toContain("Game Boy 1989");
        expect(themes).toContain("Commodore 64");
        expect(themes).toContain("Phosphor Amber CRT");
        expect(themes).toContain("Matrix Phosphor");
        expect(themes).toContain("Synthwave '84");
        expect(themes).toContain("Amiga Workbench");
        expect(themes).toContain("Macintosh System 7");
        expect(themes).toContain("Mac OS X Aqua");
        expect(themes).toContain("NeXTSTEP 1989");
        expect(themes).toContain("PlayStation 1994");
        expect(themes).toContain("Hot Dog Stand");

        // 2. Test auto short theme names
        expect(autoShortThemeName("win95")).toBe("Win95");
        expect(autoShortThemeName("Windows 95")).toBe("Win95");
        expect(autoShortThemeName("gameboy")).toBe("Game Boy");
        expect(autoShortThemeName("c64")).toBe("C64");
        expect(autoShortThemeName("Commodore 64")).toBe("C64");
        expect(autoShortThemeName("Phosphor Amber CRT")).toBe("Amber CRT");
        expect(autoShortThemeName("Matrix Phosphor")).toBe("Matrix");
        expect(autoShortThemeName("Synthwave '84")).toBe("Synthwave");
        expect(autoShortThemeName("Sonoma Emerald")).toBe("Emerald");
        expect(autoShortThemeName("Apple Dark")).toBe("Dark");
        expect(autoShortThemeName("Midnight Space Gray")).toBe("Midnight");

        const shortThemes = listShortThemes();
        expect(shortThemes).toContain("Win95");
        expect(shortThemes).toContain("Game Boy");
        expect(shortThemes).toContain("C64");
        expect(shortThemes).toContain("Amber CRT");
        expect(shortThemes).toContain("Matrix");
        expect(shortThemes).toContain("Synthwave");

        // 3. getTheme resolution by key, alias, and short name
        expect(getTheme("win95").name).toBe("Windows 95");
        expect(getTheme("windows_95").name).toBe("Windows 95");
        expect(getTheme("Win95").name).toBe("Windows 95");
        expect(getTheme("gameboy").name).toBe("Game Boy 1989");
        expect(getTheme("Game Boy").name).toBe("Game Boy 1989");
        expect(getTheme("c64").name).toBe("Commodore 64");
        expect(getTheme("C64").name).toBe("Commodore 64");
        expect(getTheme("amber_crt").name).toBe("Phosphor Amber CRT");
        expect(getTheme("Amber CRT").name).toBe("Phosphor Amber CRT");
        expect(getTheme("matrix").name).toBe("Matrix Phosphor");
        expect(getTheme("Matrix").name).toBe("Matrix Phosphor");

        // 4. Test dynamic button contrast when switching to nostalgic themes
        const win = createWindow("Retro Theme Test", 800, 600, { theme: "win95" });
        const btn = win.addButton("btn_retro", "Start");
        expect(win.theme).toBe("win95");
        expect(win.accentColor).toBe("#000080"); // Classic Win95 Titlebar Navy
        expect(btn.spec.background_color).toBe("#000080");
        expect(btn.spec.font_color).toBe("#ffffff");

        // Switch to Game Boy: lime accent #8bac0f with black font contrast
        win.setTheme("gameboy", false);
        expect(win.theme).toBe("gameboy");
        expect(win.accentColor).toBe("#8bac0f");
        expect(btn.spec.background_color).toBe("#8bac0f");
        expect(btn.spec.font_color).toBe("#000000");

        // Switch to Matrix: bright green accent #00ff41 with black font contrast
        win.setTheme("matrix", false);
        expect(win.theme).toBe("matrix");
        expect(win.accentColor).toBe("#00ff41");
        expect(btn.spec.background_color).toBe("#00ff41");
        expect(btn.spec.font_color).toBe("#000000");

        // Switch to Amber CRT: warm phosphor #ffb000 with black font contrast
        win.setTheme("amber_crt", false);
        expect(win.theme).toBe("amber_crt");
        expect(win.accentColor).toBe("#ffb000");
        expect(btn.spec.background_color).toBe("#ffb000");
        expect(btn.spec.font_color).toBe("#000000");

        // Switch to Synthwave: hot pink #ff2a85 with white font contrast
        win.setTheme("synthwave", false);
        expect(win.theme).toBe("synthwave");
        expect(win.accentColor).toBe("#ff2a85");
        expect(btn.spec.background_color).toBe("#ff2a85");
        expect(btn.spec.font_color).toBe("#ffffff");

        // 5. Check addThemeSelector with autoShortNames rendering
        const retroWin = createWindow("Retro Selector Window", 800, 600, { theme: "win95" });
        const selRef = retroWin.addThemeSelector("dd_retro_theme", "Theme:", false, 140, true);
        expect(selRef.spec.id).toBe("dd_retro_theme");
        expect(selRef.spec.item_labels["win95"]).toBe("Win95");
        expect(selRef.spec.item_labels["gameboy"]).toBe("Game Boy");
        expect(selRef.spec.item_labels["c64"]).toBe("C64");
        expect(selRef.spec.item_labels["matrix"]).toBe("Matrix");

        const previewHtml = retroWin.getHtml();
        expect(previewHtml).toContain('<option value="win95" selected>Win95</option>');
        expect(previewHtml).toContain('<option value="gameboy">Game Boy</option>');
        expect(previewHtml).toContain('<option value="c64">C64</option>');
        expect(previewHtml).toContain('<option value="matrix">Matrix</option>');
    });

    test("9c. High-Quality Modern & Developer Themes & All Controls Showcase Studio", () => {
        // 1. Check existence of all 12 new high-quality themes
        const themes = listThemes();
        expect(themes).toContain("Monokai Pro");
        expect(themes).toContain("Tokyo Night");
        expect(themes).toContain("One Dark Pro");
        expect(themes).toContain("Gruvbox Dark");
        expect(themes).toContain("Gruvbox Light");
        expect(themes).toContain("Rosé Pine");
        expect(themes).toContain("Everforest Dark");
        expect(themes).toContain("Kanagawa");
        expect(themes).toContain("Cobalt2");
        expect(themes).toContain("Windows 11 Fluent Slate");
        expect(themes).toContain("Windows 11 Mica Light");
        expect(themes).toContain("Aura Dark");

        // 2. Test auto short theme names
        expect(autoShortThemeName("monokai_pro")).toBe("Monokai");
        expect(autoShortThemeName("tokyo_night")).toBe("Tokyo Night");
        expect(autoShortThemeName("one_dark_pro")).toBe("One Dark");
        expect(autoShortThemeName("gruvbox_dark")).toBe("Gruvbox");
        expect(autoShortThemeName("gruvbox_light")).toBe("Gruv Light");
        expect(autoShortThemeName("rose_pine")).toBe("Rosé Pine");
        expect(autoShortThemeName("everforest")).toBe("Everforest");
        expect(autoShortThemeName("kanagawa")).toBe("Kanagawa");
        expect(autoShortThemeName("cobalt2")).toBe("Cobalt2");
        expect(autoShortThemeName("win11_slate")).toBe("Win11 Slate");
        expect(autoShortThemeName("win11_light")).toBe("Mica Light");
        expect(autoShortThemeName("aura")).toBe("Aura");

        // 3. Test theme retrieval by key and alias
        expect(getTheme("monokai").name).toBe("Monokai Pro");
        expect(getTheme("tokyo_night").name).toBe("Tokyo Night");
        expect(getTheme("one_dark").name).toBe("One Dark Pro");
        expect(getTheme("gruvbox").name).toBe("Gruvbox Dark");
        expect(getTheme("cobalt").name).toBe("Cobalt2");
        expect(getTheme("fluent_slate").name).toBe("Windows 11 Fluent Slate");
        expect(getTheme("mica_light").name).toBe("Windows 11 Mica Light");
        expect(getTheme("aura_dark").name).toBe("Aura Dark");

        // 4. Test button contrast on bright accents
        const win = createWindow("Modern Theme Contrast", 800, 600, { theme: "monokai_pro" });
        const btn = win.addButton("btn_action", "Execute");
        expect(win.accentColor).toBe("#ffd866");
        expect(btn.spec.background_color).toBe("#ffd866");
        expect(btn.spec.font_color).toBe("#000000");

        win.setTheme("cobalt2", false);
        expect(win.accentColor).toBe("#ffc600");
        expect(btn.spec.background_color).toBe("#ffc600");
        expect(btn.spec.font_color).toBe("#000000");

        win.setTheme("win11_slate", false);
        expect(win.accentColor).toBe("#60cdff");
        expect(btn.spec.background_color).toBe("#60cdff");
        expect(btn.spec.font_color).toBe("#000000");

        // 5. Test createThemeShowcase generation with all controls
        const showcase = createThemeShowcase("tokyo_night");
        expect(showcase.theme).toBe("tokyo_night");
        const html = showcase.generateHtml();
        expect(html).toContain("Tokyo Night");
        expect(html).toContain("tblServices");
        expect(html).toContain("treeWorkspace");
        expect(html).toContain("txtInput");
        expect(html).toContain("txtPass");
        expect(html).toContain("swtDaemon");
        expect(html).toContain("segMode");
        expect(html).toContain("dd_theme_selector");
    });

    test("9d. AAA Designer Themes Overhaul & Verification (14 New Themes & Enhanced Styling)", () => {
        // 1. Check existence of all 14 new AAA themes
        const themes = listThemes();
        const expectedNewThemes = [
            "Raycast Dark",
            "Linear Studio",
            "Vercel Geist",
            "Unreal Engine 5",
            "Arc Velvet",
            "Abyss Bioluminescence",
            "Cyberpunk Night City",
            "Horizon Sunset",
            "Tailwind Slate Emerald",
            "Supabase Dark",
            "OLED Laser Black",
            "Titanium Slate Pro",
            "JetBrains Darcula",
            "Nordic Paper Light",
        ];
        for (const t of expectedNewThemes) {
            expect(themes).toContain(t);
        }

        // 2. Test auto short theme names for new themes
        expect(autoShortThemeName("raycast_dark")).toBe("Raycast");
        expect(autoShortThemeName("linear_dark")).toBe("Linear");
        expect(autoShortThemeName("vercel_dark")).toBe("Geist");
        expect(autoShortThemeName("unreal_engine")).toBe("UE5");
        expect(autoShortThemeName("arc_velvet")).toBe("Arc Velvet");
        expect(autoShortThemeName("abyss_bio")).toBe("Abyss");
        expect(autoShortThemeName("night_city")).toBe("Night City");
        expect(autoShortThemeName("horizon")).toBe("Horizon");
        expect(autoShortThemeName("tailwind_emerald")).toBe("Tailwind");
        expect(autoShortThemeName("supabase_dark")).toBe("Supabase");
        expect(autoShortThemeName("oled_laser")).toBe("OLED Laser");
        expect(autoShortThemeName("titanium_slate")).toBe("Titanium");
        expect(autoShortThemeName("jetbrains_darcula")).toBe("Darcula");
        expect(autoShortThemeName("nordic_paper")).toBe("Nordic Paper");

        // 3. Test theme retrieval by key and alias
        expect(getTheme("raycast").name).toBe("Raycast Dark");
        expect(getTheme("linear").name).toBe("Linear Studio");
        expect(getTheme("vercel").name).toBe("Vercel Geist");
        expect(getTheme("ue5").name).toBe("Unreal Engine 5");
        expect(getTheme("cyberpunk_2077").name).toBe("Cyberpunk Night City");
        expect(getTheme("darcula").name).toBe("JetBrains Darcula");
        expect(getTheme("nordic").name).toBe("Nordic Paper Light");

        // 4. Verify all canonical themes have card_background, card_border, and secondary_accent
        for (const [key, theme] of Object.entries(SIMPLEGUI_THEMES)) {
            expect(theme.card_background).toBeDefined();
            expect(theme.card_border).toBeDefined();
            expect(theme.secondary_accent).toBeDefined();
            expect(theme.card_background?.startsWith("#") || theme.card_background?.startsWith("rgba")).toBe(true);
            expect(theme.card_border?.startsWith("#") || theme.card_border?.startsWith("rgba")).toBe(true);
            expect(theme.secondary_accent?.startsWith("#") || theme.secondary_accent?.startsWith("rgba")).toBe(true);
        }

        // 5. Test createThemeShowcase generation on new AAA themes
        const cyberShowcase = createThemeShowcase("night_city");
        expect(cyberShowcase.theme).toBe("night_city");
        const cyberHtml = cyberShowcase.generateHtml();
        expect(cyberHtml).toContain("Cyberpunk Night City");
        expect(cyberHtml).toContain("#ff003c");
        expect(cyberHtml).toContain("#00f0ff");

        const nordicShowcase = createThemeShowcase("nordic_paper");
        expect(nordicShowcase.theme).toBe("nordic_paper");
        const nordicHtml = nordicShowcase.generateHtml();
        expect(nordicHtml).toContain("Nordic Paper Light");
        expect(nordicHtml).toContain("#2b5c8f");
    });

    test("10. Full VLang SimpleGUI Control Parity Suite (Visual Controls, Sizing, Props & Aliases)", () => {
        const win = createWindow("VLang Parity Test Window", 1000, 800);

        // 1. Text & Inputs
        const search = win.addSearchField("fld_search", "Search packages...", "bun");
        expect(search.spec.control_type).toBe("search_field");
        expect(search.spec.placeholder).toBe("Search packages...");

        const searchAlias = win.add_search_field("fld_search2", "Search query...");
        expect(searchAlias.spec.control_type).toBe("search_field");

        const pwd = win.addPassword("fld_pwd", "Secret key");
        expect(pwd.spec.control_type).toBe("password_input");

        const cmd = win.addCommandPalette("cmd_pal");
        expect(cmd.spec.control_type).toBe("command_palette");

        const tokens = win.addTokenField("tok_field", ["vlang", "typescript", "bun"]);
        expect(tokens.spec.control_type).toBe("token_field");
        expect(tokens.spec.tags).toContain("vlang");

        const tagInput = win.addTagInputField("tag_field", ["gui", "rad"]);
        expect(tagInput.spec.control_type).toBe("tag_input");

        const masked = win.addMaskedInput("mask_phone", "(999) 999-9999", "5551234567");
        expect(masked.spec.control_type).toBe("masked_input");

        const inlineLbl = win.addInlineEditableLabel("lbl_inline", "Editable title");
        expect(inlineLbl.spec.control_type).toBe("inline_editable_label");

        // 2. Typography & Banners
        const secHdr = win.addSectionHeader("Main Section", "Section subtitle");
        expect(secHdr.spec.control_type).toBe("section_header");

        const hotkey = win.addHotkeyBadge(["Ctrl", "Shift", "P"]);
        expect(hotkey.spec.control_type).toBe("hotkey_badge");

        const link = win.addLink("Documentation", "https://codefreelance.net");
        expect(link.spec.control_type).toBe("link");

        const banner = win.addBanner("Update downloaded successfully", "success");
        expect(banner.spec.control_type).toBe("banner");

        const statusBanner = win.addStatusBanner("Connecting to cluster...", "warning");
        expect(statusBanner.spec.control_type).toBe("status_banner");

        const callout = win.addInfoCallout("Quick Tip", "Use hotkeys to quickly navigate.");
        expect(callout.spec.control_type).toBe("info_callout");

        const hero = win.addHeroBanner("RAD Studio v2.0", "Fast desktop prototyping", "PRO");
        expect(hero.spec.control_type).toBe("hero_banner");

        // 3. Buttons & Toolbars
        const imgBtn = win.addImageButton("logo.png", "Launch");
        expect(imgBtn.spec.control_type).toBe("image_button");

        const helpBtn = win.addHelpButton("Click for quick reference");
        expect(helpBtn.spec.control_type).toBe("help_button");

        const splitBtn = win.addSplitButton("Export", ["JSON", "CSV", "PDF"]);
        expect(splitBtn.spec.control_type).toBe("split_button");

        const badgeBtn = win.addBadgeButton("Messages", 5);
        expect(badgeBtn.spec.control_type).toBe("badge_button");

        const qab = win.addQuickActionBar(["Deploy", "Build", "Test"]);
        expect(qab.spec.control_type).toBe("quick_action_bar");

        const ftool = win.addFloatingToolbar(["🔍", "✏️", "🗑️"]);
        expect(ftool.spec.control_type).toBe("floating_toolbar");

        // 4. Selection & Pickers
        const rad = win.addRadio("Option A", "grp_options", true);
        expect(rad.spec.control_type).toBe("radio");

        const radGrp = win.addRadioGroup("grp_modes", ["Fast", "Balanced", "Strict"], "Fast");
        expect(radGrp.spec.control_type).toBe("radio_group");

        const pullDown = win.addPullDown("pull_lang", ["TypeScript", "V", "Go", "Rust"], "V");
        expect(pullDown.spec.control_type).toBe("pull_down");

        const comboBox = win.addComboBox("combo_city", ["San Francisco", "Austin", "New York"]);
        expect(comboBox.spec.control_type).toBe("combo_box");

        const themeMenu = win.addThemeMenu("thm_menu");
        expect(themeMenu.spec.control_type).toBe("theme_menu");

        const modeCtrl = win.addModeControl("mode_app", ["Light", "Dark", "Auto"], "Dark");
        expect(modeCtrl.spec.control_type).toBe("mode_control");

        const iconSeg = win.addIconSegments("seg_nav", ["Home", "Settings", "Profile"], 0);
        expect(iconSeg.spec.control_type).toBe("icon_segments");

        const pill = win.addPillToggle("pill_sound", ["Mute", "Unmute"], 1);
        expect(pill.spec.control_type).toBe("pill_toggle");

        const tagCloud = win.addTagCloud("cloud_tags", ["bun", "vlang", "typescript", "rad"]);
        expect(tagCloud.spec.control_type).toBe("tag_cloud");

        const transfer = win.addTransferList("trans_items", ["Item 1", "Item 2"], ["Item 3"]);
        expect(transfer.spec.control_type).toBe("transfer_list");

        // 5. Sliders, Numbers & Progress
        const vSlider = win.addVerticalSlider("vol_slider", 0, 100, 75);
        expect(vSlider.spec.control_type).toBe("vertical_slider");

        const rSlider = win.addRangeSlider("price_range", 0, 500, 50, 350);
        expect(rSlider.spec.control_type).toBe("range_slider");

        const knob = win.addKnob("knob_pan", -50, 50, 0);
        expect(knob.spec.control_type).toBe("knob");

        const progInd = win.addProgressIndicator("prog_task", 45, 100);
        expect(progInd.spec.control_type).toBe("progress_bar");

        const level = win.addLevelIndicator("lvl_battery", 8, 10);
        expect(level.spec.control_type).toBe("level_indicator");

        const spinner = win.addSpinner(32, "Syncing data...");
        expect(spinner.spec.control_type).toBe("spinner");

        const rating = win.addRating("rate_app", 5, 5);
        expect(rating.spec.control_type).toBe("rating");

        const donut = win.addDonutChart("chart_disk", "Disk Usage", 82, "420 GB / 512 GB");
        expect(donut.spec.control_type).toBe("donut_chart");

        const rings = win.addActivityRings("rings_act", [
            { label: "Move", percent: 90, color: "#fa114f" },
            { label: "Exercise", percent: 75, color: "#a1ff00" }
        ]);
        expect(rings.spec.control_type).toBe("activity_rings");

        const segDist = win.addSegmentDistributionBar("dist_mem", [
            { label: "System", value: 30, color: "#3b82f6" },
            { label: "Apps", value: 45, color: "#10b981" }
        ]);
        expect(segDist.spec.control_type).toBe("segment_distribution_bar");

        const mood = win.addFeedbackMood("feedback_ui", "happy");
        expect(mood.spec.control_type).toBe("feedback_mood");

        const heatmap = win.addActivityHeatmap("act_map", 16);
        expect(heatmap.spec.control_type).toBe("activity_heatmap");

        // 6. Pickers & File / Path
        const dateRange = win.addDateRangePicker("dt_range", "2026-01-01", "2026-09-09");
        expect(dateRange.spec.control_type).toBe("date_range_picker");

        const dateTime = win.addDateTimePicker("dt_event", "2026-09-09T14:30");
        expect(dateTime.spec.control_type).toBe("date_time_picker");

        const colorGrid = win.addColorGrid("grid_colors", ["#ef4444", "#3b82f6", "#10b981"], "#10b981");
        expect(colorGrid.spec.control_type).toBe("color_grid");

        const filePicker = win.addFilePickerField("file_in", "Choose bundle file...", "*.zip");
        expect(filePicker.spec.control_type).toBe("file_picker_field");

        const pathCtrl = win.addPathControl("path_loc", ["Root", "Volumes", "SSD"]);
        expect(pathCtrl.spec.control_type).toBe("path_control");

        const dropZone = win.addDropZone("drop_box", "Drop archives here");
        expect(dropZone.spec.control_type).toBe("drop_zone");

        // 7. Media, Code & Views
        const htmlView = win.addHtmlView("<p>Rendered HTML content</p>");
        expect(htmlView.spec.control_type).toBe("html_view");

        const browser = win.addBrowserView("https://bun.sh");
        expect(browser.spec.control_type).toBe("browser_view");

        const codeEditor = win.addCodeEditor("const x = 42;", "typescript");
        expect(codeEditor.spec.control_type).toBe("code_editor");

        const codeStudio = win.addCodeStudio("Main.ts", "console.log('Hello');");
        expect(codeStudio.spec.control_type).toBe("code_studio");

        const diffView = win.addDiffView("- old line\n+ new line", "+ modified code");
        expect(diffView.spec.control_type).toBe("diff_view");

        const terminal = win.addTerminalView(["$ bun install", "Installed in 40ms"]);
        expect(terminal.spec.control_type).toBe("terminal_view");

        const jsonTree = win.addJsonTree({ name: "RAD Studio", version: "2.0" });
        expect(jsonTree.spec.control_type).toBe("json_tree");

        const audio = win.addAudioWaveform("audio_preview", 24);
        expect(audio.spec.control_type).toBe("audio_waveform");

        const gallery = win.addImageGallery(["pic1.png", "pic2.png"]);
        expect(gallery.spec.control_type).toBe("image_gallery");

        const mediaPlayer = win.addMediaPlayer("podcast.mp3", "Episode 42");
        expect(mediaPlayer.spec.control_type).toBe("media_player");

        // 8. Cards & Complex Dashboard Tiles
        const statGrid = win.addStatGrid([
            { label: "Active Users", value: "1,240", delta: "+15%", trend: "up" },
            { label: "Avg Latency", value: "12ms", delta: "-4ms", trend: "up" }
        ]);
        expect(statGrid.spec.control_type).toBe("stat_grid");

        const scoreCard = win.addScoreCard("Code Quality", 98, "Passing all checks", "A+");
        expect(scoreCard.spec.control_type).toBe("score_card");

        const avatar = win.addAvatarCard("Alice Dev", "Principal Engineer", "", "online");
        expect(avatar.spec.control_type).toBe("avatar_card");

        const profile = win.addUserProfileCard({
            name: "John Doe",
            handle: "@johndoe",
            bio: "Fullstack Architect"
        });
        expect(profile.spec.control_type).toBe("user_profile_card");

        const product = win.addProductCard({
            title: "Pro License",
            price: "$99/mo",
            rating: 4.9
        });
        expect(product.spec.control_type).toBe("product_card");

        const appLauncher = win.addAppLauncherTile("SQLite Studio", "🗄️", "Database Explorer");
        expect(appLauncher.spec.control_type).toBe("app_launcher_tile");

        const httpCard = win.addHttpRequestCard("POST", "/api/v2/deploy", 201, "34ms");
        expect(httpCard.spec.control_type).toBe("http_request_card");

        const resMon = win.addResourceMonitor("res_monitor", 45, 60, 30);
        expect(resMon.spec.control_type).toBe("resource_monitor");

        const envVars = win.addEnvVars("env_settings", { PORT: "8080", ENV: "production" });
        expect(envVars.spec.control_type).toBe("env_vars");

        const statusInd = win.addStatusIndicator("Cluster Node #1", "active");
        expect(statusInd.spec.control_type).toBe("status_indicator");

        const dock = win.addStatusDock([
            { icon: "⚡", label: "Server", value: "Running" }
        ]);
        expect(dock.spec.control_type).toBe("status_dock");

        // 9. Navigation & Accordion Containers
        const nav = win.addNavRail([
            { icon: "🏠", label: "Home", active: true },
            { icon: "⚙️", label: "Settings" }
        ]);
        expect(nav.spec.control_type).toBe("nav_rail");

        const disc = win.addDisclosure("Advanced Configuration", "Detailed configuration settings");
        expect(disc.spec.control_type).toBe("disclosure");

        const accordion = win.addAccordionGroup([
            { title: "General", content: "General options", expanded: true },
            { title: "Security", content: "Security options" }
        ]);
        expect(accordion.spec.control_type).toBe("accordion_group");

        const kanban = win.addKanbanBoard([
            { title: "To Do", items: ["Task 1", "Task 2"] },
            { title: "Done", items: ["Task 3"] }
        ]);
        expect(kanban.spec.control_type).toBe("kanban_board");

        const actRow = win.addActionRow([
            { label: "Cancel" },
            { label: "Confirm", primary: true }
        ]);
        expect(actRow.spec.control_type).toBe("action_row");

        const fldsRow = win.addFieldsRow([
            { label: "First Name", id: "fld_first" },
            { label: "Last Name", id: "fld_last" }
        ]);
        expect(fldsRow.spec.control_type).toBe("fields_row");

        const grp = win.addGroupBox("Database Credentials", 400, 200);
        expect(grp.spec.control_type).toBe("group_box");

        const tabs = win.addTabs(["Overview", "Logs", "Metrics"], 0);
        expect(tabs.spec.control_type).toBe("tabs");

        const scroll = win.addScrollView(500, 300);
        expect(scroll.spec.control_type).toBe("scroll_view");

        const vSpacer = win.addVerticalSpacer(24);
        expect(vSpacer.spec.control_type).toBe("spacer_v");

        const hSpacer = win.addHorizontalSpacer(20);
        expect(hSpacer.spec.control_type).toBe("spacer_h");

        const sep = win.addSeparator();
        expect(sep.spec.control_type).toBe("separator");

        const tbItem = win.addToolbarItem("Refresh", "🔄");
        expect(tbItem.spec.control_type).toBe("toolbar_item");

        const tray = win.addTrayIcon("Bun RAD Studio", "⚡");
        expect(tray.spec.control_type).toBe("tray_icon");

        const grid = win.addGrid(3, 16);
        expect(grid.spec.control_type).toBe("grid");

        const tree = win.addTreeNode("Project Root", ["src", "tests", "package.json"]);
        expect(tree.spec.control_type).toBe("tree_node");
    });

    test("11. VLang Nameless Shorthand Helpers & Preview HTML Generation Parity", () => {
        const win = createWindow("Nameless Parity Window", 900, 700);

        const d = win.donut("Memory Usage", 64, "16 GB RAM");
        expect(d.spec.control_type).toBe("donut_chart");

        const s = win.score_card("System Health", "99.8%", "All nodes healthy", "A+");
        expect(s.spec.control_type).toBe("score_card");

        const sf = win.search_field("Search assets...");
        expect(sf.spec.control_type).toBe("search_field");

        const cb = win.code_box("console.log('hi');", "javascript");
        expect(cb.spec.control_type).toBe("code_editor");

        const b = win.banner("Parity Verified", "success");
        expect(b.spec.control_type).toBe("banner");

        const sc = win.stat_card("Requests/sec", "4,210", "+8%");
        expect(sc.spec.control_type).toBe("stat_card");

        const sg = win.stat_grid([{ label: "Uptime", value: "99.99%" }]);
        expect(sg.spec.control_type).toBe("stat_grid");

        const up = win.user_profile("Jane Engineer", "@jane");
        expect(up.spec.control_type).toBe("user_profile_card");

        const pc = win.product_card({ title: "Bun RAD Studio", price: "Free" });
        expect(pc.spec.control_type).toBe("product_card");

        const hm = win.heatmap(8);
        expect(hm.spec.control_type).toBe("activity_heatmap");

        const rg = win.radial_gauge("CPU Temp", 42);
        expect(rg.spec.control_type).toBe("circular_progress");

        const nr = win.nav_rail([{ icon: "⚡", label: "Dashboard" }]);
        expect(nr.spec.control_type).toBe("nav_rail");

        const mp = win.media_player("stream.m3u8", "Live Stream");
        expect(mp.spec.control_type).toBe("media_player");

        const ar = win.activity_rings();
        expect(ar.spec.control_type).toBe("activity_rings");

        const k = win.knob(75, 0, 100);
        expect(k.spec.control_type).toBe("knob");

        const ft = win.floating_toolbar(["➕", "➖", "✖️"]);
        expect(ft.spec.control_type).toBe("floating_toolbar");

        const pwd = win.password("secret123");
        expect(pwd.spec.control_type).toBe("password_input");

        // Verify HTML Preview Generation works seamlessly and contains our new controls
        const html = win.toHtml();
        expect(html).toContain("Memory Usage");
        expect(html).toContain("System Health");
        expect(html).toContain("Search assets...");
        expect(html).toContain("Parity Verified");
        expect(html).toContain("Bun RAD Studio");
        expect(html).toContain("Free");
        expect(html).toContain("All nodes healthy");
    });

    test("12. Right-Click Context Menu & Browser Reload Suppression", () => {
        const win = createWindow("No Reload Window", 800, 600);
        win.addLabel("Safe from accidental reload");

        const html = win.toHtml();
        expect(html).toContain('oncontextmenu="return false;"');
        expect(html).toContain('addEventListener("contextmenu"');
        expect(html).toContain('e.preventDefault()');
        expect(html).toContain('F5');
    });

    test("13. Comprehensive Desktop & Parity Controls HTML & File Browse Functionality", () => {
        const win = createWindow("All Controls Verification", 1000, 800);

        // File controls with Browse buttons
        const fpb = win.addFilePathBar("/Users/demo/project", "browse_path").id("fpb_ctrl");
        const fpf = win.addFilePickerField("fpf_ctrl", "/Users/demo/document.pdf", "Choose Document...");
        const dz = win.addDropZone("dz_ctrl", "Drop source files here");
        const fdz = win.addFormDropZone("fdz_ctrl", "Upload Asset", { placeholder: "Drop bundle archive" });

        // Productivity & Input controls
        const sf = win.addSearchField("sf_ctrl", "Search items...", "app");
        const mi = win.addMaskedInput("mi_ctrl", "(555) 000-0000", "(555) 123-4567");
        const tf = win.addTokenField("tok_ctrl", ["react", "bun", "typescript"]);
        const ti = win.addTagInput("ti_ctrl", ["ui", "desktop"]);
        const iel = win.addInlineEditableLabel("iel_ctrl", "Editable Title");
        const hb = win.addHeroBanner("Banner Title", "Banner Subtitle", "v2.0");
        const sb = win.addStatusBanner("System operational", "success").id("sb_ctrl");
        const qab = win.addQuickActionBar(["Action A", "Action B"]).id("qab_ctrl");
        const mc = win.addModeControl("mc_ctrl", ["Tab1", "Tab2"], "Tab1");
        const is = win.addIconSegments("is_ctrl", [{ icon: "A", label: "OptA" }, { icon: "B", label: "OptB" }], 0);
        const pt = win.addPillToggle("pt_ctrl", ["Off", "On"], 1);
        const tl = win.addTransferList("tl_ctrl", ["Item 1"], ["Item 2"]);
        const vs = win.addVerticalSlider("vs_ctrl", 0, 100, 45);
        const rs = win.addRangeSlider("rs_ctrl", 0, 100, 10, 90);
        const kn = win.addKnob("kn_ctrl", 0, 100, 80);
        const fm = win.addFeedbackMood("fm_ctrl", "good");
        const drp = win.addDateRangePicker("drp_ctrl", "2026-01-01", "2026-01-31");
        const dtp = win.addDateTimePicker("dtp_ctrl", "2026-07-27T12:00");
        const cg = win.addColorGrid("cg_ctrl", ["#ff0000", "#00ff00", "#0000ff"], "#00ff00");
        const cal = win.addCalendarView("cal_ctrl", "August 2026");
        const csw = win.addColorSwatch("csw_ctrl", ["#111111", "#222222", "#333333"], "#222222");
        const pg = win.addPropertyGrid("pg_ctrl", "Key1: Val1, Key2: Val2");
        const pm = win.addPopupMenu("pm_ctrl", "Option 1, Option 2");

        const html = win.toHtml();

        // 1. Check file browsing and hidden native file inputs
        expect(html).toContain('id="fpb_ctrl_native_file"');
        expect(html).toContain('id="fpf_ctrl_native_file"');
        expect(html).toContain('id="dz_ctrl_file"');
        expect(html).toContain('id="fdz_ctrl_file"');
        expect(html).toContain('Browse...');
        expect(html).toContain('Choose Document...');
        expect(html).toContain('/Users/demo/project');
        expect(html).toContain('/Users/demo/document.pdf');
        expect(html).toContain('Drop source files here');

        // 2. Check input and interaction tags
        expect(html).toContain('id="sf_ctrl"');
        expect(html).toContain('id="mi_ctrl"');
        expect(html).toContain('id="tok_ctrl"');
        expect(html).toContain('id="ti_ctrl"');
        expect(html).toContain('id="iel_ctrl"');
        expect(html).toContain('Banner Title');
        expect(html).toContain('Banner Subtitle');
        expect(html).toContain('System operational');
        expect(html).toContain('Action A');
        expect(html).toContain('id="mc_ctrl"');
        expect(html).toContain('id="is_ctrl"');
        expect(html).toContain('id="pt_ctrl"');
        expect(html).toContain('id="tl_ctrl"');
        expect(html).toContain('id="vs_ctrl"');
        expect(html).toContain('id="kn_ctrl"');
        expect(html).toContain('id="fm_ctrl"');
        expect(html).toContain('id="drp_ctrl"');
        expect(html).toContain('id="dtp_ctrl"');
        expect(html).toContain('id="cg_ctrl"');
        expect(html).toContain('August 2026');
        expect(html).toContain('id="csw_ctrl"');
        expect(html).toContain('Key1: Val1');
        expect(html).toContain('Option 1');
    });

    test("14. Value Store Initial Population & Programmatic Set/Get", () => {
        const win = createWindow("Value Store Test", 800, 600);

        win.addSearchField("search1", "Search query", "test").setValue("Bun Engine");
        win.addMaskedInput("phone1", "(000) 000-0000", "(555) 999-8888");
        win.addKnob("knob1", 0, 100, 75);
        win.addPillToggle("toggle1", ["Dark", "Light"], 0);
        win.addColorGrid("grid1", ["#ff0000", "#00ff00"], "#ff0000");
        win.addTokenField("tokens1", ["alpha", "beta"]);
        win.addFilePathBar("/home/user/code", "path1").id("path1");

        const vals = win.getFormValues();
        expect(vals.search1).toBe("Bun Engine");
        expect(vals.phone1).toBe("(555) 999-8888");
        expect(vals.knob1).toBe(75);
        expect(vals.toggle1).toBe(0);
        expect(vals.grid1).toBe("#ff0000");
        expect(vals.tokens1).toEqual(["alpha", "beta"]);
        expect(vals.path1).toBe("/home/user/code");

        // Test programmatic mutations
        win.setValue("search1", "Zig Native");
        expect(win.getValue("search1")).toBe("Zig Native");

        win.setValue("knob1", 90);
        expect(win.getValue("knob1")).toBe(90);

        win.setValue("tokens1", ["gamma", "delta"]);
        expect(win.getValue("tokens1")).toEqual(["gamma", "delta"]);
    });

    test("15. Row Layout Auto-Wrap and Chained Width Handling", () => {
        const win = createWindow("Row Layout Wrap Test", 1000, 600);

        win.beginRow();
        const f1 = win.addSearchField("fld_s", "Search...").width(300);
        const b1 = win.addStatusBanner("Status OK", "info").width(400);
        const btn = win.addButton("btn_act", "Action").width(150);
        win.endRow();

        // 300 + 400 + 150 = 850 + spacing <= 1000, all should stay on the same row!
        expect(f1.spec.left).toBe(20);
        expect(f1.spec.top).toBe(20);
        expect(b1.spec.left).toBe(20 + 300 + 12);
        expect(b1.spec.top).toBe(20);
        expect(btn.spec.left).toBe(b1.spec.left + 400 + 12);
        expect(btn.spec.top).toBe(20);
    });

    test("16. Native Dialog and File Chooser API Signatures", () => {
        const win = createWindow("Dialog Test", 600, 400);

        expect(typeof win.openFileDialog).toBe("function");
        expect(typeof win.saveFileDialog).toBe("function");
        expect(typeof win.openFolderDialog).toBe("function");
        expect(typeof win.open_file_dialog).toBe("function");
        expect(typeof win.save_file_dialog).toBe("function");
        expect(typeof win.browse_file).toBe("function");
        expect(typeof win.browse_folder).toBe("function");
    });

    test("17. Application Menu Bar and Right-Click Context Menu Parity Engine", () => {
        const win = createWindow("Menu & Context Menu Engine Test", 1000, 700);

        // 1. Menu Bar
        const mb = win.addMenuBar("main_mb", [
            { label: "File", items: ["New File  ⌘N", "Open...  ⌘O", "---", "Exit  ⌘Q"] },
            { label: "Edit", items: ["Undo  ⌘Z", "Redo  ⌘⇧Z", "---", "Cut  ⌘X", "Copy  ⌘C"] }
        ]);
        expect(mb.spec.control_type).toBe("menu_bar");
        expect(mb.spec.id).toBe("main_mb");
        expect(Array.isArray(mb.spec.menus)).toBe(true);
        expect(mb.spec.menus.length).toBe(2);

        // 2. Toolbar
        const tb = win.addToolBar("main_tb", ["New", "Open", "Save"]);
        expect(tb.spec.control_type).toBe("tool_bar");
        expect(tb.spec.id).toBe("main_tb");

        // 3. Global Context Menu
        win.setGlobalContextMenu(["Refresh", "Copy Coords", "Inspect"]);
        expect((win as any)._globalContextMenuItems).toEqual(["Refresh", "Copy Coords", "Inspect"]);

        let globalSelected = "";
        win.onGlobalContextMenu((_w, item) => {
            globalSelected = item;
        });
        expect(win.eventHandlersMap.has("global:context_menu_select")).toBe(true);

        // 4. Control-Specific Context Menu
        let controlSelected = "";
        const fld = win.addTextInput("Type here...", "Initial Value")
            .id("fld_test")
            .contextMenu(["Cut  ⌘X", "Copy  ⌘C", "Paste  ⌘V"], (_w, item) => {
                controlSelected = item;
            });

        expect(fld.spec.context_menu_items).toEqual(["Cut  ⌘X", "Copy  ⌘C", "Paste  ⌘V"]);
        expect(win.eventHandlersMap.has("fld_test:context_select")).toBe(true);

        // 5. HTML Preview Integrity
        const html = win.generateHtml();
        expect(html).toContain("rad-menu-bar");
        expect(html).toContain("menu-dropdown");
        expect(html).toContain("File");
        expect(html).toContain("New File");
        expect(html).toContain("⌘N");
        expect(html).toContain("window.globalContextMenuItems = [\"Refresh\",\"Copy Coords\",\"Inspect\"];");
expect(html).toContain("data-context-menu=\"Cut  ⌘X|Copy  ⌘C|Paste  ⌘V\"");
        expect(html).toContain("data-ctrl-id=\"fld_test\"");
        expect(html).toContain("showContextMenu");
        expect(html).toContain("hideContextMenu");
    });

    test("18. Enhanced Controls: Multi-Select ListBox, Dual Transfer List & Multi-Row Table Selection", () => {
        const win = createWindow("Controls Enhancement Test", 1000, 800);

        // --- A. Multi-Select ListBox Verification ---
        const multiList = win.addMultiListBox(
            ["Service A", "Service B", "Service C", "Service D"],
            ["Service A", "Service C"]
        ).id("lst_services");

        expect(multiList.spec.control_type).toBe("listbox");
        expect(multiList.spec.multiple).toBe(true);
        expect(multiList.spec.multi_select).toBe(true);
        expect(multiList.spec.selection_mode).toBe("multiple");
        expect(win.getFormValues().lst_services).toEqual(["Service A", "Service C"]);
        expect(multiList.getSelectedItems()).toEqual(["Service A", "Service C"]);

        // Fluent chaining
        const singleList = win.addListBox(["Option 1", "Option 2"]).id("lst_single");
        expect(singleList.spec.multiple).toBeUndefined();
        singleList.multiSelect(true);
        expect(singleList.spec.multiple).toBe(true);

        // --- B. Dual Transfer List Verification ---
        let transferChangeFired = false;
        let lastTransSelected: any = null;
        const transfer = win.addTransferList(
            "transfer_apps",
            ["Photoshop", "Illustrator", "Premiere", "AfterEffects"],
            ["Visual Studio Code", "Sublime Text"],
            (_w, sel, avail) => {
                transferChangeFired = true;
                lastTransSelected = sel;
            },
            { height: 160 }
        );

        expect(transfer.spec.control_type).toBe("transfer_list");
        expect(transfer.spec.id).toBe("transfer_apps");
        expect(win.getFormValues().transfer_apps).toBe("Visual Studio Code,Sublime Text");
        expect(win.getFormValues().transfer_apps_available).toBe("Photoshop,Illustrator,Premiere,AfterEffects");

        // --- C. Multi-Select Table with Checkboxes Verification ---
        let tableSelectionFired = false;
        let selectedPids: string[] = [];
        const table = win.addTable(
            "tbl_users",
            ["User ID", "Name", "Role", "Status"],
            [
                ["usr_01", "Alice Johnson", "Admin", "Active"],
                ["usr_02", "Bob Smith", "Developer", "Active"],
                ["usr_03", "Charlie Brown", "Reviewer", "Inactive"]
            ],
            {
                multiSelect: true,
                checkboxSelection: true,
                onSelectionChange: (_w: any, pids: string[]) => {
                    tableSelectionFired = true;
                    selectedPids = pids;
                }
            }
        );

        expect(table.spec.control_type).toBe("data_table");
        expect(table.spec.id).toBe("tbl_users");
        expect(table.spec.multi_select).toBe(true);
        expect(table.spec.checkbox_selection).toBe(true);

        // Alias validation: addDataTable and add_data_table
        const dtAlias = win.addDataTable(
            ["ID", "Val"],
            [["1", "Test"]]
        ).checkboxSelection(true).multiSelect(true);
        expect(dtAlias.spec.control_type).toBe("data_table");
        expect(dtAlias.spec.checkbox_selection).toBe(true);
        expect(dtAlias.spec.multi_select).toBe(true);

        // --- D. HTML Preview Generation & DOM Contract Checks ---
        const html = win.toHtml();

        // 1. Listbox HTML checks
        expect(html).toContain('<select id="lst_services" class="simplegui-listbox" size="5" multiple');
        expect(html).toContain('value="Service A" selected');
        expect(html).toContain('value="Service B"');
        expect(html).toContain('value="Service C" selected');

        // 2. Transfer List HTML checks
        expect(html).toContain('id="transfer_apps_container"');
        expect(html).toContain('id="transfer_apps" name="transfer_apps" value="Visual Studio Code,Sublime Text"');
        expect(html).toContain('id="transfer_apps_available" name="transfer_apps_available" value="Photoshop,Illustrator,Premiere,AfterEffects"');
        expect(html).toContain('class="transfer-avail-count"');
        expect(html).toContain('class="transfer-sel-count"');
        expect(html).toContain('title="Move Selected to Selected"');
        expect(html).toContain('title="Move All to Selected"');
        expect(html).toContain('title="Move Selected to Available"');
        expect(html).toContain('title="Move All to Available"');
        expect(html).toContain('ondblclick="const cont=this.closest(\'.transfer-container\');');
        expect(html).toContain("window['transfer_apps_sync']");

        // 3. Table Multi-Row HTML checks
        expect(html).toContain('id="tbl_users_selected" name="tbl_users_selected"');
        expect(html).toContain('class="table-select-all"');
        expect(html).toContain('class="row-chk"');
        expect(html).toContain('data-pid="usr_01"');
        expect(html).toContain('data-row-index="0"');
        expect(html).toContain("window['tbl_users_syncTable']");
        expect(html).toContain("event.ctrlKey||event.metaKey");
        expect(html).toContain("event.shiftKey");
        expect(html).toContain("selected-tr");
    });

    test("19. TreeGrid Control: Hierarchical multi-column tables, expand/collapse toggles, and selection", () => {
        const win = createWindow("TreeGrid Test Window", 900, 700);

        let toggleEventFired = false;
        let lastToggledId = "";
        let lastToggledState = false;

        // 1. Nested TreeGrid definition
        const tg = win.addTreeGrid(
            "tg_files",
            ["Name", "Type", "Size", "Modified", "Status"],
            [
                {
                    id: "root_src",
                    cells: ["src", "Folder", "--", "Today", "Active"],
                    icon: "📂",
                    expanded: true,
                    children: [
                        { id: "file_gui", cells: ["simplegui.ts", "TypeScript", "148 KB", "Today", "Modified"], icon: "📄" },
                        { id: "file_idx", cells: ["index.ts", "TypeScript", "102 KB", "Today", "Clean"], icon: "📄" }
                    ]
                },
                {
                    id: "root_docs",
                    cells: ["docs", "Folder", "--", "Yesterday", "Published"],
                    icon: "📁",
                    expanded: false,
                    children: [
                        { id: "doc_readme", cells: ["README.md", "Markdown", "16 KB", "Yesterday", "Published"], icon: "📄" }
                    ]
                },
                { id: "file_pkg", cells: ["package.json", "JSON", "1.8 KB", "2 days ago", "Locked"], icon: "📄" }
            ],
            (_w, id, state) => {
                toggleEventFired = true;
                lastToggledId = id;
                lastToggledState = state;
            },
            { multiSelect: true, checkboxSelection: true }
        );

        expect(tg.spec.control_type).toBe("tree_grid");
        expect(tg.spec.id).toBe("tg_files");
        expect(tg.spec.multi_select).toBe(true);
        expect(tg.spec.checkbox_selection).toBe(true);
        expect(tg.spec.headers).toEqual(["Name", "Type", "Size", "Modified", "Status"]);

        // 2. Alias checks: add_tree_grid, addTreeTable, add_tree_table
        const tgAlias1 = win.add_tree_grid(["Col A", "Col B"]).id("tg_alias1");
        expect(tgAlias1.spec.control_type).toBe("tree_grid");

        const tgAlias2 = win.addTreeTable(["Col A", "Col B"]).id("tg_alias2");
        expect(tgAlias2.spec.control_type).toBe("tree_grid");

        const tgAlias3 = win.add_tree_table(["Col A", "Col B"]).id("tg_alias3");
        expect(tgAlias3.spec.control_type).toBe("tree_grid");

        // 3. Fluent chaining & helper methods
        tg.onToggle((_w, id, state) => {
            toggleEventFired = true;
        });
        expect(win.eventHandlersMap.has("tg_files:toggle")).toBe(true);

        // 4. HTML generation and contract validation
        const html = win.toHtml();

        // Check container and hidden selection state input
        expect(html).toContain('class="rad-treegrid-container"');
        expect(html).toContain('id="tg_files_selected" name="tg_files_selected"');

        // Check headers
        expect(html).toContain('class="treegrid-select-all"');
        expect(html).toContain('<span>Name</span>');
        expect(html).toContain('<span>Type</span>');
        expect(html).toContain('<span>Size</span>');
        expect(html).toContain('<span>Modified</span>');
        expect(html).toContain('<span>Status</span>');

        // Check hierarchical row attributes
        expect(html).toContain('data-tree-id="root_src"');
        expect(html).toContain('data-has-children="true"');
        expect(html).toContain('data-depth="0"');
        expect(html).toContain('data-expanded="true"');

        expect(html).toContain('data-tree-id="file_gui"');
        expect(html).toContain('data-parent-id="root_src"');
        expect(html).toContain('data-depth="1"');
        expect(html).toContain('data-has-children="false"');

        expect(html).toContain('data-tree-id="root_docs"');
        expect(html).toContain('data-expanded="false"');

        // Check UI elements (arrows, icons, labels, indentations)
        expect(html).toContain('class="treegrid-toggle"');
        expect(html).toContain('class="treegrid-spacer"');
        expect(html).toContain('class="treegrid-node-icon"');
        expect(html).toContain('class="treegrid-node-label"');
        expect(html).toContain('class="treegrid-row-chk"');

        // Check client-side scripts
        expect(html).toContain("window['tg_files_syncTable']");
        expect(html).toContain("window['tg_files_toggleRow']");
        expect(html).toContain("window['tg_files_expandAll']");
        expect(html).toContain("window['tg_files_collapseAll']");
        expect(html).toContain("window['tg_files_sortTreeGrid']");
    });

    test("20. Pro UI & Developer Controls Suite: Command Palette, Diff Viewer, Toolbar, Splitter, Closable Tabs & Kanban DND", () => {
        const win = createWindow("Pro UI Controls Test Window", 1200, 800);

        // 1. Command Palette / Quick Open
        let executedCommand = "";
        const cmdPalette = win.addCommandPalette(
            "cmd_main",
            [
                { id: "cmd_save", label: "File: Save All", category: "File", shortcut: "⌘S" },
                { id: "cmd_theme", label: "Preferences: Color Theme", category: "Preferences", shortcut: "⌘K ⌘T" },
                { id: "cmd_term", label: "Terminal: Create New", category: "View", shortcut: "⌃`" }
            ],
            (_w, id) => {
                executedCommand = id;
            },
            { placeholder: "Type a command or search...", shortcut: "⌘K" }
        );

        expect(cmdPalette.spec.control_type).toBe("command_palette");
        expect(cmdPalette.spec.id).toBe("cmd_main");
        expect(cmdPalette.spec.commands.length).toBe(3);
        expect(cmdPalette.spec.placeholder).toBe("Type a command or search...");
        expect(cmdPalette.spec.shortcut).toBe("⌘K");

        // Alias checks for Command Palette
        const cmdAlias1 = win.add_command_palette("cmd_alias1");
        expect(cmdAlias1.spec.control_type).toBe("command_palette");
        const cmdAlias2 = win.addQuickOpen("cmd_alias2");
        expect(cmdAlias2.spec.control_type).toBe("command_palette");

        // 2. Side-by-Side Diff Viewer
        const origCode = "function greet(name) {\n    console.log('Hello, ' + name);\n}";
        const modCode = "function greet(name: string): void {\n    console.log(`Hello, ${name}!`);\n    return;\n}";
        const diffView = win.addDiffView(
            "diff_editor",
            origCode,
            modCode,
            { language: "typescript", originalTitle: "index.ts (v1.0.0)", modifiedTitle: "index.ts (Current)" }
        );

        expect(diffView.spec.control_type).toBe("diff_view");
        expect(diffView.spec.id).toBe("diff_editor");
        expect(diffView.spec.original).toBe(origCode);
        expect(diffView.spec.modified).toBe(modCode);
        expect(diffView.spec.language).toBe("typescript");
        expect(diffView.spec.original_title).toBe("index.ts (v1.0.0)");
        expect(diffView.spec.modified_title).toBe("index.ts (Current)");

        // Alias checks for Diff Viewer
        const diffAlias1 = win.add_diff_view("diff_alias1", "a", "b");
        expect(diffAlias1.spec.control_type).toBe("diff_view");
        const diffAlias2 = win.addDiffEditor("diff_alias2", "a", "b");
        expect(diffAlias2.spec.control_type).toBe("diff_view");

        // 3. Desktop Toolbar / Action Bar
        let toolbarClicked = "";
        const toolbar = win.addToolBar(
            "tb_editor",
            [
                { id: "tb_new", label: "New", icon: "📄" },
                { id: "tb_open", label: "Open", icon: "📂" },
                "---",
                { id: "tb_bold", label: "Bold", icon: "𝗕", toggle: true, active: true },
                { id: "tb_italic", label: "Italic", icon: "𝘐", toggle: true, active: false },
                "---",
                { id: "tb_run", label: "Run", icon: "▶" }
            ],
            (_w, id) => {
                toolbarClicked = id;
            }
        );

        expect(toolbar.spec.control_type).toBe("tool_bar");
        expect(toolbar.spec.id).toBe("tb_editor");
        expect(toolbar.spec.items.length).toBe(7);

        // Alias checks for Toolbar
        const tbAlias1 = win.add_tool_bar("tb_alias1");
        expect(tbAlias1.spec.control_type).toBe("tool_bar");
        const tbAlias2 = win.addToolbar("tb_alias2");
        expect(tbAlias2.spec.control_type).toBe("tool_bar");
        const tbAlias3 = win.addActionBar("tb_alias3");
        expect(tbAlias3.spec.control_type).toBe("tool_bar");

        // 4. Resizable Splitter Panes
        let splitResized = false;
        let lastSplitRatio = 0;
        const splitter = win.addSplitPane(
            "split_main",
            {
                orientation: "horizontal",
                initialSplit: 0.35,
                minLeft: 180,
                minRight: 250,
                onResize: (_w, ratio) => {
                    splitResized = true;
                    lastSplitRatio = ratio;
                }
            }
        );

        expect(splitter.spec.control_type).toBe("split_pane");
        expect(splitter.spec.id).toBe("split_main");
        expect(splitter.spec.orientation).toBe("horizontal");
        expect(splitter.spec.initial_split).toBe(0.35);

        // Alias checks for Split Pane
        const splitAlias1 = win.add_split_pane("split_alias1");
        expect(splitAlias1.spec.control_type).toBe("split_pane");
        const splitAlias2 = win.addSplitter("split_alias2");
        expect(splitAlias2.spec.control_type).toBe("split_pane");

        // 5. Upgraded Closable Tabs
        let closedTabTitle = "";
        const closableTabs = win.addTabs(
            ["Dashboard", "Settings", "Analytics"],
            {
                closable: true,
                onTabClose: (_w: any, title: string) => {
                    closedTabTitle = title;
                }
            }
        ).id("tabs_closable");

        expect(closableTabs.spec.closable).toBe(true);

        // 6. Upgraded Kanban Board with Drag & Drop
        let movedCardId = "";
        let targetColId = "";
        const kanban = win.addKanbanBoard(
            "kanban_sprint",
            [
                { id: "todo", title: "To Do", cards: [{ id: "c1", title: "Task 1", tag: "Dev" }] },
                { id: "inprogress", title: "In Progress", cards: [{ id: "c2", title: "Task 2", tag: "Design" }] },
                { id: "done", title: "Done", cards: [{ id: "c3", title: "Task 3", tag: "QA" }] }
            ],
            (_w, cardId, colId) => {
                movedCardId = cardId;
                targetColId = colId;
            }
        );

        expect(kanban.spec.control_type).toBe("kanban_board");
        expect(kanban.spec.id).toBe("kanban_sprint");

        // 7. Fluent Chaining Helpers Verification
        const chainedRef = win.addButton("btn_chain", "Test")
            .closable(true)
            .sortable(true)
            .resizable(true)
            .onCommand((_w, cmd) => { executedCommand = cmd; })
            .onTabClose((_w, t) => { closedTabTitle = t; })
            .onCardMove((_w, c, col) => { movedCardId = c; targetColId = col; })
            .onResize((_w, r) => { lastSplitRatio = r; })
            .onSort((_w, col, dir) => {});

        expect(chainedRef.spec.closable).toBe(true);
        expect(chainedRef.spec.sortable).toBe(true);
        expect(chainedRef.spec.resizable).toBe(true);
        expect(win.eventHandlersMap.has("btn_chain:command")).toBe(true);
        expect(win.eventHandlersMap.has("btn_chain:tab_close")).toBe(true);
        expect(win.eventHandlersMap.has("btn_chain:card_move")).toBe(true);
        expect(win.eventHandlersMap.has("btn_chain:resize")).toBe(true);
        expect(win.eventHandlersMap.has("btn_chain:sort")).toBe(true);

        // 8. HTML Preview Generation & DOM Integrity Verification
        const html = win.toHtml();

        // Command Palette DOM validation
        expect(html).toContain('id="cmd_main_backdrop"');
        expect(html).toContain('rad-cmd-palette-backdrop');
        expect(html).toContain('class="cmd-palette-input"');
        expect(html).toContain('Type a command or search...');
        expect(html).toContain('File: Save All');
        expect(html).toContain('Preferences: Color Theme');
        expect(html).toContain('Terminal: Create New');
        expect(html).toContain('⌘K ⌘T');
        expect(html).toContain("window['cmd_main_open']");
        expect(html).toContain("window['cmd_main_close']");
        expect(html).toContain("window['cmd_main_filter']");
        expect(html).toContain("window['cmd_main_select']");

        // Diff Viewer DOM validation
        expect(html).toContain('id="diff_editor"');
        expect(html).toContain('rad-diff-container');
        expect(html).toContain('index.ts (v1.0.0)');
        expect(html).toContain('index.ts (Current)');
        expect(html).toContain('diff-line-num');
        expect(html).toContain('diff-del');
        expect(html).toContain('diff-add');
        expect(html).toContain('greet(name: string)');

        // Toolbar DOM validation
        expect(html).toContain('id="tb_editor"');
        expect(html).toContain('class="rad-toolbar"');
        expect(html).toContain('class="toolbar-separator"');
        expect(html).toContain('data-toggle="true"');
        expect(html).toContain('window[\'tb_editor_click\']');

        // Splitter DOM validation
        expect(html).toContain('id="split_main"');
        expect(html).toContain('class="rad-split-pane"');
        expect(html).toContain('class="split-pane-handle"');
        expect(html).toContain("cursor:col-resize;");
        expect(html).toContain('onSplitMove');

        // Closable Tabs DOM validation
        expect(html).toContain('class="tab-close-btn"');
        expect(html).toContain('window[\'tabs_closable_closeTab\']');

        // Kanban HTML5 Drag & Drop DOM validation
        expect(html).toContain('class="rad-kanban-board"');
        expect(html).toContain('draggable="true"');
        expect(html).toContain('ondragstart="window[\'kanban_sprint_dragStart\'](event, \'c1\')"');
        expect(html).toContain('ondrop="window[\'kanban_sprint_drop\'](event, \'todo\')"');
    });
});

