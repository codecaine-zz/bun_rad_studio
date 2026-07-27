import { new_simple_window, listThemes, getTheme, homeDir, tempDir, desktopDir, documentsDir, downloadsDir } from "../src/simplegui.ts";

// Create window using vlang_simplegui snake_case constructor
const win = new_simple_window("vlang_simplegui Parity API Test Studio", 860, 740);
win.set_theme("Catppuccin Mocha");
win.set_padding(20);
win.set_spacing(12);

win.addHeading("⚡ vlang_simplegui API Parity & System Test Suite", "Full test suite for all ported window, control, typed accessor & OS path APIs");

// --- Card 1: Typed Accessors & Form Inputs ---
win.beginCard("1. Typed Accessor & Value Manipulation", "Testing get_text, set_text, get_bool, set_bool, get_int, set_int, get_float, set_float");

win.addFormField("User Name", "txtUserName", "Ada Lovelace");
win.addFormSwitch("Account Active Status", "swActive", "Active", true);
win.addFormNumber("User Age", "numAge", 36);
win.addFormSlider("Performance Score", "numScore", 94);

win.beginRow();
win.addButton("🔄 Test Typed Accessors", (w) => {
    // Test typed getters
    const name = w.get_text("txtUserName");
    const active = w.get_bool("swActive");
    const age = w.get_int("numAge");
    const score = w.get_float("numScore");

    w.showAlert(`[Typed Getters Success]\n• Name: "${name}"\n• Active: ${active}\n• Age: ${age}\n• Score: ${score}`, "Typed Values Read");
    
    // Mutate using typed setters
    w.set_text("txtUserName", name.toUpperCase());
    w.set_int("numAge", age + 1);
    w.set_float("numScore", Math.min(100, score + 2.5));
}).bg("#0284c7").color("#ffffff").bold().width(180).height(36);

win.addButton("📝 Set Preset Values", (w) => {
    w.set_text("txtUserName", "Grace Hopper");
    w.set_bool("swActive", true);
    w.set_int("numAge", 85);
    w.set_float("numScore", 99.8);
    w.setText("lblStatus", "Preset values applied via set_text, set_bool, set_int, set_float");
}).bg("#334155").color("#f8fafc").width(170).height(36);

win.endRow();
win.endCard();

// --- Card 2: Window Sizing, Placement & Opacity ---
win.beginCard("2. Window Lifecycle, Sizing & Alignment", "Testing set_size, align, set_position, set_opacity, close, exit");
win.beginRow();

win.addButton("📏 Resize (920x760)", (w) => {
    w.set_size(920, 760);
    w.setText("lblStatus", `Resized to ${w.get_width()}x${w.get_height()}`);
}).bg("#0d9488").color("#ffffff").width(150).height(36);

win.addButton("📍 Snap Top-Right", (w) => {
    w.align("top-right");
    w.setText("lblStatus", "Window aligned to top-right screen boundary");
}).bg("#7c3aed").color("#ffffff").width(150).height(36);

win.addButton("🎯 Center Window", (w) => {
    w.center_window();
    w.setText("lblStatus", "Window centered on active screen");
}).bg("#4f46e5").color("#ffffff").width(140).height(36);

win.addButton("👻 Opacity (85%)", (w) => {
    w.set_opacity(0.85);
    w.setText("lblStatus", `Opacity set to ${w.get_opacity()}`);
}).bg("#0284c7").color("#ffffff").width(140).height(36);

win.endRow();
win.endCard();

// --- Card 3: Developer Inspection & System Paths ---
win.beginCard("3. Developer Inspection & System Paths", "Testing has_control, list_controls, get_control_kind, require_control, homeDir, listThemes");

win.addLabel("lblStatus", "Status: Ready for test execution.", { font_size: 13, font_color: "#38bdf8", bold: true });

win.beginRow();
win.addButton("🔍 Run Control Audit", (w) => {
    const exists = w.has_control("txtUserName");
    const count = w.list_controls().length;
    const kind = w.get_control_kind("txtUserName");
    const req = w.require_control("txtUserName");
    const title = w.get_title();
    
    w.showAlert(`[Inspection Audit]\n• Total Registered Controls: ${count}\n• txtUserName Exists: ${exists}\n• Kind: ${kind}\n• Required Name: ${req}\n• Window Title: "${title}"`, "Audit Passed");
}).bg("#059669").color("#ffffff").bold().width(170).height(36);

win.addButton("📁 Print OS Paths", (w) => {
    const pathsInfo = `[OS System Paths]\n• Home: ${homeDir()}\n• Temp: ${tempDir()}\n• Desktop: ${desktopDir()}\n• Documents: ${documentsDir()}\n• Downloads: ${downloadsDir()}`;
    w.showAlert(pathsInfo, "System Paths Info");
}).bg("#334155").color("#f8fafc").width(150).height(36);

let themeToggle = 0;
win.addButton("🎨 Cycle Theme", (w) => {
    const themesList = ["Sonoma Emerald", "Apple Light", "Catppuccin Mocha", "Midnight Space Gray", "Nord"];
    themeToggle = (themeToggle + 1) % themesList.length;
    const selectedTheme = themesList[themeToggle];
    w.set_theme(selectedTheme);
    w.setText("lblStatus", `Applied theme preset: "${selectedTheme}"`);
}).bg("#d97706").color("#ffffff").bold().width(150).height(36);

win.endRow();
win.endCard();

// --- Card 4: Dialog Overlays & Termination Controls ---
win.beginCard("4. Dialog Popups & Application Lifecycle", "Testing showConfirm, showPrompt, win.close (window frame), win.exit (process)");
win.beginRow();

win.addButton("💬 Test Confirm Dialog", (w) => {
    w.showConfirm("Would you like to reset all input values?", "Confirm Reset");
}).bg("#0284c7").color("#ffffff").width(170).height(38);

win.addButton("🚪 Close Window Frame", (w) => {
    w.showAlert("Closing this window frame only (win.close())...", "Close Window");
    w.close_window();
}).bg("#ea580c").color("#ffffff").bold().width(170).height(38);

win.addButton("❌ Exit Application Process", (w) => {
    w.exit();
}).bg("#dc2626").color("#ffffff").bold().width(180).height(38);

win.endRow();
win.endCard();

console.log("⚡ Launching SimpleGUI Demo 16 (vlang_simplegui Parity API Test Studio)...");
win.run();
