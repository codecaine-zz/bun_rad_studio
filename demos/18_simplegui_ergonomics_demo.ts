import { simplegui } from "../index.ts";

const win = simplegui.createWindow("⚡ SimpleGUI Ergonomics & Shortcuts Demo", 960, 730, {
    theme: "apple_dark"
});

// Title Banner
win.addLabel("🚀 SimpleGUI Ergonomics & Shortcuts API Showcase")
    .font(20, "#38bdf8", "700")
    .width(900);

win.addLabel("High-level shortcuts, batch operations, value modifiers, dynamic listbox/dropdown managers, and JSON settings persistence.")
    .font(12, "#94a3b8")
    .width(900);

win.addDivider();

// Grid Layout (2 columns, 16px gap)
win.beginGrid(2, 16);

// Card 1: Batch Control & State Management
win.beginCard("1. Batch Operations & State Modifiers");

win.beginRow();
win.addLabel("Input A:").width(65);
win.addTextInput("Field A", "Hello World").id("txtA").width(290);
win.endRow();

win.beginRow();
win.addLabel("Input B:").width(65);
win.addTextInput("Field B", "Ergonomics API").id("txtB").width(290);
win.endRow();

win.beginRow();
win.addLabel("Score:").width(65);
win.addStepper(0, 100, 10).id("numScore").width(100);
win.addButton("➕ Inc (+5)", (w) => {
    const val = w.increment("numScore", 5);
    w.setStatus(`Score incremented to: ${val}`);
}).width(95).bg("#0284c7");
win.addButton("➖ Dec (-5)", (w) => {
    const val = w.increment("numScore", -5);
    w.setStatus(`Score decremented to: ${val}`);
}).width(95).bg("#475569");
win.endRow();

win.beginRow();
win.addSwitch("Enable Notifications", true).id("swtNotify");
win.addButton("🔄 Toggle Switch", (w) => {
    const isChecked = w.toggleChecked("swtNotify");
    w.setStatus(`Notification switch toggled to: ${isChecked ? "ON" : "OFF"}`);
}).width(130).bg("#475569");
win.endRow();

win.beginRow();
win.addButton("🔒 Disable Fields", (w) => {
    w.disableControls(["txtA", "txtB"]);
    w.setStatus("Input fields disabled");
}).width(140).bg("#ef4444");

win.addButton("🔓 Enable Fields", (w) => {
    w.enableControls(["txtA", "txtB"]);
    w.setStatus("Input fields enabled");
}).width(140).bg("#10b981");
win.endRow();

win.endCard();

// Card 2: Dynamic List Box & Item Management
win.beginCard("2. Dynamic List Box & Dropdown Manager");

win.beginRow();
win.addLabel("New Item:").width(65);
win.addTextInput("Item name (e.g. Rust)...").id("txtNewItem").width(190);
win.addButton("➕ Add Item", async (w) => {
    let item = w.getText("txtNewItem").trim();
    if (!item) {
        const inputPrompt = await w.prompt("Enter new item name:", "Rust", "Add Item");
        item = (inputPrompt || "").trim();
    }
    if (item) {
        w.addListItem("cmbTech", item);
        w.addListItem("lstFrameworks", item);
        w.setValue("txtNewItem", "");
        w.setStatus(`Added "${item}" to Dropdown & ListBox`);
    } else {
        w.setStatus("Add item cancelled");
    }
}).width(100).bg("#0284c7");
win.endRow();

win.beginRow();
win.addLabel("Dropdown:").width(65);
win.addDropdown(["TypeScript", "Bun", "SimpleGUI", "V-Lang"], "SimpleGUI", (w, val) => {
    w.setStatus(`Selected Dropdown: ${val}`);
}).id("cmbTech").width(190);

win.addButton("❌ Remove", (w) => {
    const sel = w.getListSelectedText("cmbTech");
    if (sel) {
        w.removeSelectedListItem("cmbTech");
        w.setStatus(`Removed "${sel}" from Dropdown`);
    } else {
        w.setStatus("No item selected in Dropdown");
    }
}).width(100).bg("#dc2626");
win.endRow();

win.beginRow();
win.addLabel("ListBox:").width(65);
win.addListBox(["React", "Vue", "Svelte", "Solid", "Angular"], "React", (w, val) => {
    const sel = Array.isArray(val) ? val.join(", ") : val;
    w.setStatus(`Selected ListBox: ${sel}`);
}, { size: 4 }).id("lstFrameworks").width(190);

win.addButton("❌ Remove", (w) => {
    const sel = w.getListSelectedText("lstFrameworks");
    if (sel) {
        w.removeSelectedListItem("lstFrameworks");
        w.setStatus(`Removed "${sel}" from ListBox`);
    } else {
        w.setStatus("No item selected in ListBox");
    }
}).width(100).bg("#dc2626");
win.endRow();

win.beginRow();
win.addButton("🧹 Clear Dropdown", (w) => {
    w.clearListItems("cmbTech");
    w.setStatus("Cleared all items from Dropdown");
}).width(140).bg("#64748b");

win.addButton("🧹 Clear ListBox", (w) => {
    w.clearListItems("lstFrameworks");
    w.setStatus("Cleared all items from ListBox");
}).width(140).bg("#64748b");
win.endRow();

win.endCard();

win.endGrid();

// Card 3: Dialog Shortcuts & Settings Persistence
win.beginCard("3. Dialog Shortcuts, Busy Task & Settings Persistence");

win.beginRow();
win.addLabel("Status:").width(60);
win.addLabel("System Ready").id("lblStatus").font(13, "#38bdf8", "600").width(500);
win.endRow();

win.beginRow();
win.addButton("ℹ️ Info Popup", (w) => {
    w.info("Information", "This is an ergonomic native alert popup!");
}).width(120).bg("#0284c7");

win.addButton("⚠️ Warning Popup", (w) => {
    w.warn("Warning", "Caution: Storage utilization reached 88%");
}).width(130).bg("#f59e0b");

win.addButton("❌ Error Popup", (w) => {
    w.error("Error", "Critical process crashed");
}).width(120).bg("#ef4444");

win.addButton("❓ Ask Confirm", async (w) => {
    const confirmed = await w.ask("Proceed with administrative operation?", "Confirmation");
    w.setStatus(`Confirmation result: ${confirmed ? "ACCEPTED" : "CANCELLED"}`);
}).width(130).bg("#8b5cf6");
win.endRow();

win.beginRow();
win.addButton("⏳ Run Async Busy Task (2s)", (w) => {
    w.withBusyState(["txtA", "txtB", "cmbTech", "lstFrameworks", "numScore"], "⏳ Processing background sync (2s)...", (wApp, done) => {
        wApp.delay(2000, () => {
            done("✅ Background Sync Completed! (All systems updated)");
        });
    });
}).width(210).bg("#8b5cf6");

win.addButton("💾 Save JSON State", (w) => {
    const tempPath = `/tmp/simplegui_demo_settings.json`;
    w.saveValuesToFile(tempPath);
    w.info("Settings Saved", `Saved form values to JSON file:\n${tempPath}`);
    w.setStatus(`Saved state to ${tempPath}`);
}).width(140).bg("#059669");

win.addButton("📂 Load JSON State", (w) => {
    const tempPath = `/tmp/simplegui_demo_settings.json`;
    w.loadValuesFromFile(tempPath);
    w.info("Settings Restored", `Restored form values from JSON file:\n${tempPath}`);
    w.setStatus(`Loaded state from ${tempPath}`);
}).width(140).bg("#0284c7");

win.addButton("❌ Exit App", (w) => {
    w.quit();
}).width(100).bg("#dc2626");
win.endRow();

win.endCard();

// Run application event loop
win.run();
