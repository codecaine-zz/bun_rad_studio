import { simplegui, listThemes } from "../index.ts";

/**
 * Demo 19: State Persistence, Reactive Store & Two-Way Data Binding Showcase
 * 
 * Demonstrates:
 * 1. Centralized Reactive State Store (setState, getState, onStateChange)
 * 2. Two-Way Data Binding between UI inputs and state keys (bindState)
 * 3. Atomic App Form State Persistence (restored automatically on startup)
 * 4. Universal Theme Persistence across window launches
 * 5. Crash-proof atomic state saving in standard OS directories
 */
function main() {
    const win = simplegui.createWindow("State Persistence & Reactive Binding Studio", 860, 680, {
        appId: "bun_state_persistence_demo"
    });

    win.addHeading("⚡ Reactive State Store & Persistence Studio");
    win.addCaption("Values entered here persist across application launches automatically in standard OS directories.");

    // Section 1: Universal Theme Selector (Auto-persisted to ~/.config/simplegui/theme.txt)
    win.beginCard("🎨 Global Theme Persistence");
    win.beginRow();
    win.addLabel("Window Theme:").width(120);
    win.addDropdown(listThemes(), win.theme, (w, selectedTheme) => {
        w.setTheme(selectedTheme);
        w.setStatus(`Theme switched to: ${selectedTheme}`);
    }).id("dd_app_theme").width(280);
    win.endRow();
    win.endCard();

    // Section 2: Two-Way Data Binding
    win.beginCard("🔗 Two-Way Data Binding (Control <-> Reactive State Store)");
    win.beginGrid(2, 16);

    const txtUser = win.addTextInput("User Name", "Ada Lovelace").id("txt_username");
    const txtJob = win.addTextInput("Job Title", "Lead Architect").id("txt_job");
    const chkSync = win.addCheckbox("Auto Sync to Cloud", true).id("chk_sync");
    const slRate = win.addSlider(1, 100, 75).id("sl_rate");

    win.endGrid();

    // Bind UI controls directly to reactive state keys
    win.bindState("txt_username", "profile_name");
    win.bindState("txt_job", "profile_job");
    win.bindState("chk_sync", "sync_enabled");
    win.bindState("sl_rate", "sync_rate");

    // Live state inspection display
    win.beginRow();
    const lblStatePreview = win.addLabel("Live State Store: [Initializing...]").id("lbl_preview").font(12, "#38bdf8");
    win.endRow();

    const updatePreview = () => {
        const u = win.getState("profile_name", "None");
        const j = win.getState("profile_job", "None");
        const s = win.getState("sync_enabled", "false");
        const r = win.getState("sync_rate", "0");
        win.setText("lbl_preview", `Live State: user="${u}" | job="${j}" | sync=${s} | rate=${r}`);
    };

    win.onStateChange("profile_name", updatePreview);
    win.onStateChange("profile_job", updatePreview);
    win.onStateChange("sync_enabled", updatePreview);
    win.onStateChange("sync_rate", updatePreview);
    updatePreview();
    win.endCard();

    // Section 3: Persistence Management Actions
    win.beginCard("💾 State Persistence Actions");
    win.beginRow();

    win.addButton("💾 Explicit Save State", (w) => {
        w.saveAppFormState();
        w.info("State Saved!", `Form state successfully persisted to OS user directory: ${w.getAppId()}`);
    }).width(180).bg("#0284c7").color("#ffffff");

    win.addButton("🔄 Restore Saved State", (w) => {
        if (w.restoreAppFormState()) {
            w.info("Restored!", "Loaded saved form inputs, active theme, and state keys.");
        } else {
            w.warn("No Saved State", "No previously saved state file was found.");
        }
    }).width(180);

    win.addButton("🗑️ Clear App State", (w) => {
        w.clearAppFormState();
        w.clearAppState();
        w.warn("Cleared", "Deleted persisted state files.");
    }).width(160).bg("#ef4444").color("#ffffff");

    win.addButton("🚪 Close Window", (w) => {
        w.close();
    }).width(140);

    win.endRow();
    win.endCard();

    // Status bar
    win.addStatusBar("Status: Ready | Form state auto-saves when window closes (Cmd+W or Close)");

    // Window close hook
    win.onClose((w) => {
        console.log(`[Demo 19] Window closing. Auto-persisting app state for: ${w.getAppId()}...`);
    });

    win.run();
}

if (import.meta.main) {
    main();
}
