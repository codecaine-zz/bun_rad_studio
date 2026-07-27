/**
 * ⚡ Bun RAD Studio Demo 15: SimpleGUI All Controls Showcase
 * 
 * Demonstrates:
 * - 30+ SimpleGUI controls in a single clean, beautifully aligned application
 * - Multi-column grid containers, cards, tables, tree views, code views, timers, badges, pickers
 * - Non-visual timer tick callbacks updating live clock & progress meters
 */

import { simplegui } from "../index.ts";

const win = simplegui.createWindow("SimpleGUI - All Controls Showcase", 920, 740, {
    theme: "midnight"
});

// Title Header
win.addLabel("⚡ SimpleGUI Complete Controls Suite")
    .font(20, "#38bdf8", "700")

win.addLabel("Comprehensive showcase of controls, layout containers, timers, and themes built with simplegui")
    .font(12, "#94a3b8");

win.addDivider();

// Grid Layout for Main Input Cards (2 Columns)
win.beginGrid(2, 16);

// Column 1: Standard & Labeled Inputs
win.beginCard("Input Controls");

win.beginRow();
win.addLabel("Text Input:").width(100);
win.addTextInput("Type text here...").id("inpText").width(250);
win.endRow();

win.beginRow();
win.addLabel("Password:").width(100);
win.addPasswordInput("••••••••").id("inpPass").width(250);
win.endRow();

win.beginRow();
win.addLabel("Search Bar:").width(100);
win.addSearchInput("Filter records...").id("inpSearch").width(250);
win.endRow();

win.beginRow();
win.addLabel("Date Picker:").width(100);
win.addDatePicker("2026-07-27").id("inpDate").width(250);
win.endRow();

win.beginRow();
win.addLabel("Color Well:").width(100);
win.addColorWell("#0284c7").id("inpColor").width(140);
win.endRow();

win.endCard();

// Column 2: Selectors, Sliders & Progress
win.beginCard("Selectors & Meters");

win.beginRow();
win.addCheckbox("Option A (Checked)", true).id("chkA").width(180);
win.addCheckbox("Option B", false).id("chkB").width(150);
win.endRow();

win.beginRow();
win.addSwitch("Live Telemetry Mode", true).id("swtTelemetry").width(260);
win.endRow();

win.beginRow();
win.addLabel("Segmented:").width(90);
win.addSegmentedControl(["Day", "Week", "Month", "Year"], 1).id("segRange").width(260);
win.endRow();

win.beginRow();
win.addLabel("Volume:").width(90);
win.addSlider(0, 100, 75).id("sldVol").width(260);
win.endRow();

win.beginRow();
win.addLabel("Progress:").width(90);
win.addProgressBar(65, 100).id("prgVal").width(260);
win.endRow();

win.endCard();

win.endGrid();

// Status Badges & Live Timer Panel
win.beginCard("Status Badges & Live Timer Loop");

win.beginRow();
win.addBadge("SYSTEM ACTIVE", "success").width(120);
win.addBadge("IPC CONNECTED", "info").width(120);
win.addBadge("HIGH LOAD", "warning").width(110);
const lblClock = win.addLabel("Clock: Initializing...").id("lblClock").font(13, "#38bdf8", "700").width(320);
win.endRow();

// Non-visual timer updating clock every 1 second
win.addTimer(1000, (w) => {
    const timeStr = new Date().toLocaleTimeString();
    w.setText("lblClock", `⏰ System Time: ${timeStr}`);
}, { id: "clockTimer" });

win.endCard();

// Data Table & Tree View Section (2 Columns)
win.beginGrid(2, 16);

win.beginCard("Data Table");
win.addTable(
    ["ID", "Name", "Role", "Status"],
    [
        [1, "Alex Mercer", "Developer", "Active"],
        [2, "Sarah Connor", "Architect", "Active"],
        [3, "John Doe", "Designer", "Offline"]
    ]
).id("tblUsers").height(120);
win.endCard();

win.beginCard("Project Workspace Tree");
win.addTreeView([
    "Project Root",
    " 📂 src",
    "   📄 index.ts",
    "   📄 simplegui.ts",
    " 📂 tests",
    "   📄 simplegui.test.ts"
]).id("treeProject").height(120);
win.endCard();

win.endGrid();

// Action Buttons Row
win.beginRow();
win.addButton("⚡ Action Dialog", (w) => {
    w.showAlert("SimpleGUI makes native desktop apps easy!", "Information");
}).bg("#0284c7").color("#ffffff").bold().width(160).height(38);

win.addButton("📋 Copy Form JSON", (w) => {
    const json = JSON.stringify(w.getFormValues(), null, 2);
    w.copyToClipboard(json);
    w.showAlert("Form values copied to system clipboard!", "Clipboard Export");
}).bg("#334155").color("#f8fafc").width(180).height(38);

win.addButton("❌ Exit Application", (w) => {
    w.exit();
}).bg("#ef4444").color("#ffffff").bold().width(150).height(38);

win.endRow();

console.log("⚡ Launching SimpleGUI Demo 15 (All Controls Showcase)...");
win.run();
