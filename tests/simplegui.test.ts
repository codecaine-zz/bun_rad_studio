import { describe, test, expect } from "bun:test";
import { simplegui, SimpleWindow, createWindow, listThemes, getTheme, saveTheme, homeDir, documentsDir } from "../index.ts";

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

        // Add theme selector
        const selectorRef = win.addThemeSelector("dd_theme", "Theme:", false);
        expect(selectorRef.spec.id).toBe("dd_theme");
        expect(win.getValue("dd_theme")).toBe("apple_dark");

        // Simulate theme change to codefreelance
        win.setTheme("codefreelance", true);
        expect(win.theme).toBe("codefreelance");
        expect(win.backgroundColor).toBe("#050505");
        expect(win.fontColor).toBe("#ffffff");
        expect(win.accentColor).toBe("#0fb36a");

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
        saveTheme("sonoma_emerald");
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
});



