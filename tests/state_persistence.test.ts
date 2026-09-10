import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
    simplegui,
    SimpleWindow,
    createWindow,
    new_simple_window,
    resolveUserPath,
    resolve_user_path,
    getAppConfigDir,
    getAppDataDir,
    getAppCacheDir,
    getAppStateDir,
    getAppLogDir,
    getAppRuntimeDir,
    getAppConfigFile,
    getAppStateFile,
    writeFileAtomic,
    write_file_atomic,
    saveStateToFile,
    save_state_to_file,
    loadStateFromFile,
    load_state_from_file,
    saveTheme,
    save_theme,
    getSavedTheme,
    get_saved_theme,
    shouldPersistControl,
    should_persist_control
} from "../index.ts";

describe("⚡ Reactive State Store & State Persistence Suite (Parity with simple_gg)", () => {

    test("1. User Path & Environment Variable Expansion", () => {
        const home = os.homedir() || process.env.HOME || "/Users";
        expect(resolveUserPath("~")).toBe(home);
        expect(resolveUserPath("~/test_file.json")).toBe(path.join(home, "test_file.json"));
        expect(resolve_user_path("~/my_app/state.json")).toBe(path.join(home, "my_app", "state.json"));

        // Environment variable expansion
        process.env.TEST_SIMPLEGUI_VAR = "custom_path";
        expect(resolveUserPath("/tmp/$TEST_SIMPLEGUI_VAR/data.json")).toBe(path.resolve("/tmp/custom_path/data.json"));
        expect(resolveUserPath("/tmp/${TEST_SIMPLEGUI_VAR}/sub/data.json")).toBe(path.resolve("/tmp/custom_path/sub/data.json"));
    });

    test("2. Standard OS Application Directory Resolvers", () => {
        const appName = "studio_unit_test";

        const configDir = getAppConfigDir(appName);
        expect(configDir).toContain(appName);

        const dataDir = getAppDataDir(appName);
        expect(dataDir).toContain(appName);

        const cacheDir = getAppCacheDir(appName);
        expect(cacheDir).toContain(appName);

        const stateDir = getAppStateDir(appName);
        expect(stateDir).toContain(appName);

        const logDir = getAppLogDir(appName);
        expect(logDir).toContain(appName);

        const runtimeDir = getAppRuntimeDir(appName);
        expect(runtimeDir).toContain(appName);

        const configFile = getAppConfigFile(appName, "settings.json");
        expect(configFile.endsWith("settings.json")).toBe(true);

        const stateFile = getAppStateFile(appName, "state.json");
        expect(stateFile.endsWith("state.json")).toBe(true);
    });

    test("3. Atomic File Writing & Safe JSON State Serialization", () => {
        const testDir = path.join(os.tmpdir(), `simplegui_atomic_test_${Date.now()}`);
        const testFile = path.join(testDir, "nested", "atomic_test.txt");

        try {
            writeFileAtomic(testFile, "hello atomic world");
            expect(fs.existsSync(testFile)).toBe(true);
            expect(fs.readFileSync(testFile, "utf-8")).toBe("hello atomic world");

            // JSON State store serialization
            const jsonFile = path.join(testDir, "state_store.json");
            const sampleStore = { username: "Ada", role: "admin", counter: "42" };
            saveStateToFile(jsonFile, sampleStore);

            const loaded = loadStateFromFile(jsonFile);
            expect(loaded).toEqual(sampleStore);
        } finally {
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        }
    });

    test("4. Reactive Key-Value State Store & Type Accessors", () => {
        const win = createWindow("State Test Window", 800, 600);

        // String state
        win.setState("username", "Ada Lovelace");
        expect(win.hasState("username")).toBe(true);
        expect(win.getState("username")).toBe("Ada Lovelace");
        expect(win.getStateOr("username", "Guest")).toBe("Ada Lovelace");
        expect(win.getStateOr("missing_key", "DefaultVal")).toBe("DefaultVal");

        // Integer state
        win.setStateInt("counter", 10);
        expect(win.getStateInt("counter")).toBe(10);
        expect(win.getStateIntOr("counter", 0)).toBe(10);
        expect(win.getStateIntOr("unset_counter", 99)).toBe(99);

        // Integer increment
        expect(win.incrementStateInt("counter", 5)).toBe(15);
        expect(win.getStateInt("counter")).toBe(15);

        // Boolean state & toggle
        win.setStateBool("is_dark", true);
        expect(win.getStateBool("is_dark")).toBe(true);
        expect(win.toggleStateBool("is_dark")).toBe(false);
        expect(win.getStateBool("is_dark")).toBe(false);
        expect(win.getStateBoolOr("missing_bool", true)).toBe(true);

        // Float state
        win.setStateFloat("scale", 1.75);
        expect(win.getStateFloat("scale")).toBe(1.75);
        expect(win.getStateFloatOr("missing_scale", 2.5)).toBe(2.5);

        // Remove & clear state
        win.removeState("scale");
        expect(win.hasState("scale")).toBe(false);

        win.clearState();
        expect(win.hasState("username")).toBe(false);
        expect(win.hasState("counter")).toBe(false);
    });

    test("5. Reactive State Listeners (onStateChange)", () => {
        const win = createWindow("State Listener Test", 800, 600);
        let listenerValue = "";
        let callCount = 0;

        // Listener attached before state is set
        win.onStateChange("active_tab", (w, val) => {
            listenerValue = val;
            callCount++;
        });

        win.setState("active_tab", "Dashboard");
        expect(listenerValue).toBe("Dashboard");
        expect(callCount).toBe(1);

        win.setState("active_tab", "Settings");
        expect(listenerValue).toBe("Settings");
        expect(callCount).toBe(2);

        // Listener attached after state already exists should fire immediately with current value
        let immediateValue = "";
        win.onStateChange("active_tab", (w, val) => {
            immediateValue = val;
        });
        expect(immediateValue).toBe("Settings");
    });

    test("6. App State Persistence Lifecycle (saveAppState / loadAppState)", () => {
        const appId = `simplegui_test_app_${Date.now()}`;
        const win = createWindow("App State Test", 800, 600, { appId });

        try {
            expect(win.hasSavedAppState(appId)).toBe(false);

            win.setState("user_name", "Grace Hopper");
            win.setStateInt("tasks_done", 8);
            win.setStateBool("logged_in", true);
            win.setStateFloat("version", 2.1);

            win.saveAppState(appId);
            expect(win.hasSavedAppState(appId)).toBe(true);

            // Fresh window loading the saved state
            const win2 = createWindow("App State Test 2", 800, 600, { appId });
            let reactiveTriggered = false;
            win2.onStateChange("user_name", (w, val) => {
                if (val === "Grace Hopper") reactiveTriggered = true;
            });

            const loaded = win2.loadAppState(appId);
            expect(loaded).toBe(true);

            expect(win2.getState("user_name")).toBe("Grace Hopper");
            expect(win2.getStateInt("tasks_done")).toBe(8);
            expect(win2.getStateBool("logged_in")).toBe(true);
            expect(win2.getStateFloat("version")).toBe(2.1);
            expect(reactiveTriggered).toBe(true);

            // Clear state
            win.clearAppState(appId);
            expect(win.hasSavedAppState(appId)).toBe(false);
        } finally {
            win.clearAppState(appId);
        }
    });

    test("7. Window Session Persistence (saveWindowSession / restoreWindowSession)", () => {
        const appId = `session_test_${Date.now()}`;
        const win = createWindow("Session Window 1", 1024, 768, { appId, theme: "dracula" });
        win.setState("active_view", "editor");

        try {
            win.saveWindowSession(appId);

            const win2 = createWindow("Session Window 2", 640, 480, { appId });
            const restored = win2.restoreWindowSession(appId);
            expect(restored).toBe(true);

            expect(win2.width).toBe(1024);
            expect(win2.height).toBe(768);
            expect(win2.theme).toBe("dracula");
            expect(win2.getState("active_view")).toBe("editor");
        } finally {
            const sessionFile = getAppStateFile(appId, "session.json");
            if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
        }
    });

    test("8. Universal Theme Persistence & Saved Theme Resolution", () => {
        const origTheme = getSavedTheme();
        try {
            expect(saveTheme("cyberpunk")).toBe(true);
            expect(getSavedTheme()).toBe("cyberpunk");

            const win = createWindow("Theme Persistence Test", 800, 600);
            win.restoreSavedTheme();
            expect(win.theme).toBe("cyberpunk");
        } finally {
            if (origTheme) saveTheme(origTheme);
            else saveTheme("midnight");
        }
    });

    test("9. Control Persistence Filtering (shouldPersistControl)", () => {
        // Persistent controls
        expect(shouldPersistControl({ id: "txt_workspace", kind: "input" })).toBe(true);
        expect(shouldPersistControl({ id: "txt_search", kind: "search_bar" })).toBe(true);
        expect(shouldPersistControl({ id: "chk_recursive", kind: "checkbox" })).toBe(true);
        expect(shouldPersistControl({ id: "dd_mode", kind: "dropdown" })).toBe(true);
        expect(shouldPersistControl({ id: "sl_depth", kind: "slider" })).toBe(true);
        expect(shouldPersistControl({ id: "txt_notes", kind: "textarea" })).toBe(true);

        // Ephemeral controls (consoles, terminals, diffs, outputs)
        expect(shouldPersistControl({ id: "txt_output", kind: "textarea" })).toBe(false);
        expect(shouldPersistControl({ id: "txt_stdout", kind: "textarea" })).toBe(false);
        expect(shouldPersistControl({ id: "txt_terminal", kind: "textarea" })).toBe(false);
        expect(shouldPersistControl({ id: "txt_console", kind: "textarea" })).toBe(false);
        expect(shouldPersistControl({ id: "app_status_bar", kind: "input" })).toBe(false);

        // Passwords & credentials
        expect(shouldPersistControl({ id: "txt_password", kind: "password" })).toBe(false);
        expect(shouldPersistControl({ id: "txt_secret", kind: "input" })).toBe(false);
        expect(shouldPersistControl({ id: "auth_token", kind: "input" })).toBe(false);

        // Buttons and stateless elements
        expect(shouldPersistControl({ id: "btn_save", kind: "button" })).toBe(false);
        expect(shouldPersistControl({ id: "lbl_header", kind: "label" })).toBe(false);
    });

    test("10. App Form State Auto-Persistence Roundtrip (saveAppFormState / restoreAppFormState)", () => {
        const appId = `form_state_test_${Date.now()}`;
        const win = createWindow("Form Auto-Persistence App", 960, 680, { appId, theme: "dracula" });

        try {
            win.addTextInput("Workspace Path", "/Users/developer/code").id("txt_workspace");
            win.addTextInput("Search Query", "function main").id("txt_query");
            win.addCheckbox("Recursive Search", true).id("chk_recursive");
            win.addDropdown(["Standard", "Expert", "Audit"], "Expert").id("dd_mode");
            win.addDropdown(["apple_dark", "dracula", "nord"], "dracula").id("dd_app_theme");
            win.addSlider(1, 10, 8).id("sl_depth");
            win.addTextArea("", "Project dev notes").id("txt_notes");
            win.addTextArea("", "Execution stdout log...").id("txt_output"); // Ephemeral, shouldn't persist

            win.saveAppFormState();

            const stateFile = getAppStateFile(appId, "form_state.json");
            expect(fs.existsSync(stateFile)).toBe(true);

            // Fresh window restoring the form state
            const win2 = createWindow("Form Auto-Persistence App", 800, 600, { appId, theme: "apple_light" });
            win2.addTextInput("Workspace Path", "").id("txt_workspace");
            win2.addTextInput("Search Query", "").id("txt_query");
            win2.addCheckbox("Recursive Search", false).id("chk_recursive");
            win2.addDropdown(["Standard", "Expert", "Audit"], "Standard").id("dd_mode");
            win2.addDropdown(["apple_dark", "dracula", "nord"], "apple_light").id("dd_app_theme");
            win2.addSlider(1, 10, 1).id("sl_depth");
            win2.addTextArea("", "").id("txt_notes");
            win2.addTextArea("", "Fresh output").id("txt_output");

            const restored = win2.restoreAppFormState();
            expect(restored).toBe(true);

            // Form inputs restored
            expect(win2.getText("txt_workspace")).toBe("/Users/developer/code");
            expect(win2.getText("txt_query")).toBe("function main");
            expect(win2.getBool("chk_recursive")).toBe(true);
            expect(win2.getText("dd_mode")).toBe("Expert");
            expect(win2.getInt("sl_depth")).toBe(8);
            expect(win2.getText("txt_notes")).toBe("Project dev notes");

            // Ephemeral output preserved as clean
            expect(win2.getText("txt_output")).toBe("Fresh output");

            // Theme and dropdown synchronized
            expect(win2.theme).toBe("dracula");
            expect(win2.getText("dd_app_theme")).toBe("dracula");

            // Dimensions restored
            expect(win2.width).toBe(960);
            expect(win2.height).toBe(680);
        } finally {
            win.clearAppFormState();
        }
    });

    test("11. Two-Way Data Binding (bindState / bindControl / bindValue)", () => {
        const win = createWindow("Two-Way Binding Test", 800, 600);

        const txtName = win.addTextInput("Name", "Initial Name").id("txtName");
        const chkNotify = win.addCheckbox("Notifications", false).id("chkNotify");

        // Two-way binding
        win.bindState("txtName", "user_name");
        win.bindControl("chkNotify", "notify_enabled");

        // Initial binding synced from control to state store
        expect(win.getState("user_name")).toBe("Initial Name");
        expect(win.getState("notify_enabled")).toBe("false");

        // Updating state store updates UI control
        win.setState("user_name", "Katherine Johnson");
        expect(win.getText("txtName")).toBe("Katherine Johnson");

        win.setStateBool("notify_enabled", true);
        expect(win.getBool("chkNotify")).toBe(true);

        // Updating control updates state store
        win.setValue("txtName", "Margaret Hamilton");
        expect(win.getState("user_name")).toBe("Margaret Hamilton");

        // Fluent chaining on SimpleControlRef
        const numCount = win.addStepper(0, 100, 5).id("numCount");
        numCount.bindState("count_val");
        expect(win.getState("count_val")).toBe("5");

        win.setState("count_val", "25");
        expect(win.getValue("numCount")).toBe("25");
    });

    test("12. Fluent Event Binding & Window Close Callbacks", () => {
        const win = createWindow("Event Binding Test", 800, 600);

        let clickFired = false;
        let changeFired = false;

        win.addButton("Save Button").id("btnSave");
        win.bindClick("btnSave", () => {
            clickFired = true;
        });

        win.addTextInput("Input Field").id("txtField");
        win.bindChange("txtField", () => {
            changeFired = true;
        });

        // Trigger handlers via eventHandlersMap
        const clickCb = win.eventHandlersMap.get("btnSave:onclick");
        expect(clickCb).toBeDefined();
        clickCb!(win);
        expect(clickFired).toBe(true);

        const changeCb = win.eventHandlersMap.get("txtField:onchange");
        expect(changeCb).toBeDefined();
        changeCb!(win, "New Value");
        expect(changeFired).toBe(true);

        // Close hook registration
        let closeHookCalled = false;
        win.onClose((w) => {
            closeHookCalled = true;
        });
        expect(win.closeListeners.length).toBe(1);
    });

    test("13. App ID Derivation & Custom Setting", () => {
        const win1 = new_simple_window("OmniTool Studio Pro", 1000, 700);
        expect(win1.getAppId()).toBe("omnitool_studio_pro");

        const win2 = new_simple_window("My Super-App 2026", 800, 600);
        expect(win2.getAppId()).toBe("my_super_app_2026");

        win2.setAppId("custom_namespace_xyz");
        expect(win2.getAppId()).toBe("custom_namespace_xyz");
    });

    test("14. Typography Helpers, Status Bar & Subtitle Cards (Parity with simple_gg)", () => {
        const win = createWindow("Typography & Status Bar Studio", 800, 600);

        // Heading & Caption
        win.addHeading("System Control Hub", "Realtime Telemetry & Diagnostics");
        win.addSubheading("Section 1: Engine Diagnostics");
        win.addCaption("Values reflect sensor readings taken at 50ms intervals.");

        // snake_case aliases
        win.add_heading("Sub-System Monitor");
        win.add_subheading("Section 2: Secondary Pumps");
        win.add_caption("Secondary pump status caption.");

        // Card with subtitle
        win.beginCard("Network Settings", "Configure local interface adapters and DNS");
        win.endCard();
        win.begin_card("Storage Settings", "Configure NVMe and local mount points");
        win.end_card();

        // Status Bar
        const sb = win.addStatusBar("System Ready | 100% Operational");
        expect(sb).toBeDefined();
        win.setStatusBarText("Updated: Background Sync Completed");

        const sb2 = win.add_status_bar("custom_sb", "Secondary Status Bar");
        expect(sb2).toBeDefined();
        win.set_status_bar_text("custom_sb", "Secondary Status Updated");

        const controls = win.getControls();
        const hasCaption = controls.some(c => (c.text || c.caption || "").includes("sensor readings"));
        const hasSubheading = controls.some(c => (c.text || c.caption || "").includes("Engine Diagnostics"));
        const hasStatusBar = controls.some(c => c.control_type === "status_bar");

        expect(hasCaption).toBe(true);
        expect(hasSubheading).toBe(true);
        expect(hasStatusBar).toBe(true);
    });
});
