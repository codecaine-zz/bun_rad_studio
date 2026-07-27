/**
 * ⚡ Bun RAD Studio Demo 17: SimpleGUI Layout Systems & Containers Showcase
 * 
 * Demonstrates the 5 distinct layout paradigms supported by SimpleGUI:
 * 1. Default Vertical Flow Layout (Automatic top-to-bottom auto-spacing)
 * 2. Horizontal Row Flex Layout (beginRow / endRow side-by-side alignment)
 * 3. Responsive Multi-Column Grid Layout (beginGrid / endGrid columnar auto-wrap)
 * 4. Group Card Panel Containers (beginCard / endCard with auto-calculated height)
 * 5. Nested / Hybrid Layouts (Grids inside Cards, Rows inside Cards)
 */

import { simplegui } from "../index.ts";

const win = simplegui.createWindow("SimpleGUI - Comprehensive Layout Systems Showcase", 900, 780, {
    theme: "apple_dark",
    padding: 20,
    spacing: 12,
    alwaysOnTop: true
});

// Header
win.addLabel("📐 SimpleGUI Layout & Container Architecture")
    .font(20, "#38bdf8", "700");

win.addLabel("SimpleGUI supports vertical flow, horizontal rows, multi-column grids, and nested group cards.")
    .font(13, "#94a3b8");

win.addDivider();

// ---------------------------------------------------------
// 1. HORIZONTAL ROW LAYOUT DEMO (beginRow / endRow)
// ---------------------------------------------------------
win.beginCard("1. Horizontal Row Layout (beginRow / endRow)");

win.addLabel("Controls placed inside beginRow() / endRow() align horizontally side-by-side:")
    .font(12, "#cbd5e1");

win.beginRow();
win.addLabel("Search:").width(60);
win.addTextInput("Type keywords...").id("txtSearchRow").width(240);
win.addDropdown(["All Categories", "Documents", "Images", "Code"], "All Categories").id("cmbCategoryRow").width(160);
win.addButton("🔍 Search", (w) => {
    const query = w.getValue("txtSearchRow") || "all";
    w.showAlert(`Searching for: '${query}'`, "Row Action");
}).bg("#0284c7").color("#ffffff").width(120);
win.endRow();

win.endCard();

// ---------------------------------------------------------
// 2. MULTI-COLUMN GRID LAYOUT DEMO (beginGrid / endGrid)
// ---------------------------------------------------------
win.beginCard("2. Multi-Column Grid Layout (beginGrid(cols, gap) / endGrid)");

win.addLabel("Controls inside beginGrid(cols) automatically compute cell widths and wrap into rows:")
    .font(12, "#cbd5e1");

win.beginGrid(3, 16);

// Cell 1
win.addTextInput("Grid Item 1 (Col 1)").id("grid_1");
// Cell 2
win.addTextInput("Grid Item 2 (Col 2)").id("grid_2");
// Cell 3
win.addTextInput("Grid Item 3 (Col 3)").id("grid_3");
// Cell 4 (wraps to row 2)
win.addDropdown(["Option A", "Option B", "Option C"], "Option A").id("grid_4");
// Cell 5
win.addSwitch("Grid Switch", true).id("grid_5");
// Cell 6
win.addButton("⚡ Grid Action", (w) => {
    w.showAlert("Grid button clicked!", "Grid Layout");
}).bg("#059669").color("#ffffff");

win.endGrid();

win.endCard();

// ---------------------------------------------------------
// 3. HYBRID NESTED CARDS IN GRID (2-Column Dashboard Cards)
// ---------------------------------------------------------
win.beginCard("3. Nested Hybrid Layout (Cards inside 2-Column Grid)");

win.beginGrid(2, 16);

// Column 1 Card: User Settings
win.beginCard("👤 Account Settings");
win.beginRow();
win.addLabel("Username:").width(90);
win.addTextInput("dev_user_99").id("txtUser").width(200);
win.endRow();

win.beginRow();
win.addLabel("Status:").width(90);
win.addSegmentedControl(["Offline", "Online", "Busy"], 1).id("segStatus").width(200);
win.endRow();
win.endCard();

// Column 2 Card: Quick Controls
win.beginCard("⚙️ System Preferences");
win.beginRow();
win.addLabel("Dark Mode:").width(100);
win.addSwitch("Enabled", true).id("swtDarkMode");
win.endRow();

win.beginRow();
win.addLabel("Volume:").width(100);
win.addSlider(0, 100, 75).id("sldVolume").width(180);
win.endRow();
win.endCard();

win.endGrid();

win.endCard();

// ---------------------------------------------------------
// 4. ACTION BAR & FOOTER STATUS (Row Layout)
// ---------------------------------------------------------
win.beginRow();
win.addButton("🎨 Toggle Dark/Light Theme", (w) => {
    const nextTheme = w.theme === "apple_dark" ? "apple_light" : "apple_dark";
    w.setTheme(nextTheme);
}).bg("#475569").color("#ffffff").width(220).height(38);

win.addButton("📋 Print Form State", (w) => {
    const vals = w.getFormValues();
    console.log("Current Layout Demo Form Values:", vals);
    w.showAlert(`Collected Form Values:\n` + JSON.stringify(vals, null, 2), "Form State");
}).bg("#0f766e").color("#ffffff").width(180).height(38);

win.addButton("❌ Close", (w) => {
    w.close();
}).bg("#dc2626").color("#ffffff").width(120).height(38);
win.endRow();

console.log("⚡ Launching SimpleGUI Layout Systems Demo 17...");
win.run();
