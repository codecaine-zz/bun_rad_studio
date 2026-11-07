# SimpleGUI desktop RAD cheat sheet

A beginner-friendly, step-by-step cheat sheet for building cross-platform desktop applications with **SimpleGUI** (`src/simplegui.ts`), including **tabs & multi-view switching**, **live keystroke search filtering**, **charts & real-time telemetry**, **35 enterprise components**, **reactive state & OS persistence**, **133 themes**, and a **complete copy-paste Studio Workspace Template**.

---

## How SimpleGUI works in 30 seconds (The 4 Golden Rules)

1. **Create a window:** Call `const win = newSimpleWindow("App Title", width, height, options)`.
2. **Add controls in the order they appear on screen:** Every `win.add*()` call stacks controls top-to-bottom automatically (or wrap them in `win.beginRow() ... win.endRow()` to place them side-by-side).
3. **Give interactive controls an `.id("myId")` so you can read or update them later:**
   - **Read text or dropdown:** `win.getText("txtName")` (`string`).
   - **Change text, label, or badge:** `win.setText("lblStatus", "Saved!")`.
   - **Read checkbox/switch or slider:** `win.getBool("chkAgree")` (`boolean`) or `win.getNumber("sldVol")` (`number`).
   - **React to clicks or typing:** Every callback receives `(w, value)` where `w` is the window and `value` is the latest control value!
4. **Launch the window at the very end:** Call `win.run()` on the last line of your file.

---

## Contents

- [Step 1: Window creation and lifecycle](#step-1-window-creation-and-lifecycle)
- [Step 2: Layout and container systems](#step-2-layout-and-container-systems)
- [Step 3: Fluent method chaining (`SimpleControlRef`)](#step-3-fluent-method-chaining-simplecontrolref)
- [Step 4: Standard controls and compound form builders](#step-4-standard-controls-and-compound-form-builders)
- [Step 5: Tabs, segmented controls, and multi-view switching](#step-5-tabs-segmented-controls-and-multi-view-switching)
- [Step 6: Live search filtering and dynamic tables](#step-6-live-search-filtering-and-dynamic-tables)
- [Step 7: Charts, gauges, sparklines, and live telemetry](#step-7-charts-gauges-sparklines-and-live-telemetry)
- [Step 8: VLang parity, Studio extended, and 35 enterprise components](#step-8-vlang-parity-studio-extended-and-35-enterprise-components)
- [Step 9: Reactive state, two-way binding, and OS persistence](#step-9-reactive-state-two-way-binding-and-os-persistence)
- [Step 10: Menus, context menus, SweetAlert2 `fire()`, modals, and file pickers](#step-10-menus-context-menus-sweetalert2-fire-modals-and-file-pickers)
- [Step 11: 133 built-in themes and 12 FX shader themes](#step-11-133-built-in-themes-and-12-fx-shader-themes)
- [Step 12: Pro SimpleGUI RAD tips and tricks](#step-12-pro-simplegui-rad-tips-and-tricks)
- [Complete full-featured Studio Workspace Template](#complete-full-featured-studio-workspace-template)

---

## Step 1: Window creation and lifecycle

> 📖 **Learn more:** [Window Creation (`SIMPLEGUI_API.md#window-creation`)](../SIMPLEGUI_API.md#window-creation) · [Window Options Table (`SIMPLEGUI_API.md#window-options-table`)](../SIMPLEGUI_API.md#window-options-table) · [Window State & Lifecycle (`SIMPLEGUI_API.md#window-state-methods`)](../SIMPLEGUI_API.md#window-state-methods) · [Quick Start (`SIMPLEGUI_API.md#quick-start`)](../SIMPLEGUI_API.md#quick-start)

```typescript
import { newSimpleWindow, createWindow } from "../../src/simplegui";

const win = newSimpleWindow("Developer Studio", 1040, 720, {
  theme: "apple_dark",      // Any of 133 built-in themes
  padding: 20,              // Canvas edge margin in pixels
  spacing: 12,              // Vertical spacing between stacked items
  alwaysOnTop: false,       // Pin floating window on top
  fullscreen: false,        // Start windowed or fullscreen
  responsive: true,         // Enable responsive flex/grid wrapping
  autoSaveState: true,      // Auto-persist window geometry, theme & inputs
  appId: "dev_studio_v1",   // Unique key for OS state directory persistence
  effects: "full",          // FX shader theme mode: "full" | "reduced" | "off"
});

// Dynamic runtime window mutations
win.setTheme("nord");
win.setAlwaysOnTop(true);
win.toggleFullscreen();
win.minimize();
win.setSize(1200, 800);
win.addStatusBar("Ready");
win.setStatusBarText("Connected to local SQLite engine");

// Start the event loop (always call at the end of your script)
win.run();
```

---

## Step 2: Layout and container systems

> 📖 **Learn more:** [Layout Systems (`SIMPLEGUI_API.md#layout-systems`)](../SIMPLEGUI_API.md#layout-systems) · [Vertical Stack (`SIMPLEGUI_API.md#layout-vertical`)](../SIMPLEGUI_API.md#layout-vertical) · [Horizontal Rows (`SIMPLEGUI_API.md#layout-row`)](../SIMPLEGUI_API.md#layout-row) · [Multi-Column Grid (`SIMPLEGUI_API.md#layout-grid`)](../SIMPLEGUI_API.md#layout-grid) · [Cards (`SIMPLEGUI_API.md#layout-card`)](../SIMPLEGUI_API.md#layout-card) · [Absolute Positioning (`SIMPLEGUI_API.md#layout-absolute`)](../SIMPLEGUI_API.md#layout-absolute)

SimpleGUI stacks controls vertically by default and provides **balanced container blocks** so you never have to calculate manual X/Y coordinates.

```typescript
// 1. Headings, Subheadings, Captions & Dividers
win.addHeading("🚀 Control Center", "Real-time service monitoring & management");
win.addSubheading("Active Cluster");
win.addCaption("All sensors report every 1000ms.");
win.addDivider();

// 2. Horizontal Row (Side-by-Side)
win.beginRow();
  win.addLabel("Query:").width(65);
  win.addSearchInput("Filter logs...").id("txtQuery").width(280);
  win.addButton("🔍 Run", (w) => w.toast(`Query: ${w.getText("txtQuery")}`));
win.endRow();

// 3. Multi-Column Grid (Equal-width auto-wrapping columns)
win.beginGrid(3, 16); // 3 columns, 16px gap
  win.addTextInput("Host").id("txtHost");
  win.addTextInput("Port").id("txtPort");
  win.addTextInput("Database").id("txtDb");
  win.addSwitch("Use TLS", true).id("swtTls"); // Wraps to Row 2, Col 1
win.endGrid();

// 4. Visual Card Container (Framed box with header & subtitle)
win.beginCard("🔐 Credentials", "Encrypted in local OS state");
  win.addFormField("Username:", "fUser", "postgres");
  win.addFormPassword("Password:", "fPass", "placeholder-password");
win.endCard();

// 5. Absolute Pixel Positioning (Optional override)
win.addButton("❓ Help").at(920, 18).size(88, 32);
```

---

## Step 3: Fluent method chaining (`SimpleControlRef`)

> 📖 **Learn more:** [Fluent Method Chaining (`SIMPLEGUI_API.md#method-chaining`)](../SIMPLEGUI_API.md#method-chaining) · [Fluent Methods Table (`SIMPLEGUI_API.md#fluent-methods-table`)](../SIMPLEGUI_API.md#fluent-methods-table)

Every `win.add*()` call returns a `SimpleControlRef` builder:

```typescript
win.addButton("🚀 Deploy Now", (w) => w.toast("Deploying..."))
  .id("btnDeploy")
  .size(160, 40)
  .bg("#0284c7")
  .color("#ffffff")
  .font(14, "#ffffff", "700")
  .bold()
  .tooltip("Trigger production build")
  .expandFill(false)
  .enabled(true)
  .visible(true)
  .bindState("deploy_btn_state")
  .onDoubleClick((w) => w.toast("Double-clicked!"))
  .contextMenu(["🚀 Deploy Staging", "🔥 Force Rollback"], (w, act) => w.toast(act));
```

---

## Step 4: Standard controls and compound form builders

> 📖 **Learn more:** [Controls Reference (`SIMPLEGUI_API.md#controls-reference`)](../SIMPLEGUI_API.md#controls-reference) · [Compound Form Fields (`SIMPLEGUI_API.md#compound-form-fields`)](../SIMPLEGUI_API.md#compound-form-fields) · [101 Control Catalog (`API.md#3-supported-component-reference`)](../API.md#3-supported-component-reference)

### Standard controls

```typescript
// Inputs (All text inputs sync on every keystroke in real time)
win.addLabel("Ready").id("lblState");
win.addTextInput("Type name...", "Ada Lovelace").id("txtName");
win.addPasswordInput("••••••••").id("txtSecret");
win.addSearchInput("Search...", (w, val) => {}).id("txtSearch");
win.addTextArea("Notes...", "").id("txtNotes").height(100);

// Toggles & Pickers
win.addCheckbox("Enable audit log", true, (w, checked) => {}).id("chkAudit");
win.addSwitch("Live Stream", true, (w, on) => {}).id("swtLive");
win.addDropdown(["Dev", "Staging", "Prod"], "Prod", (w, env) => {}).id("cmbEnv");
win.addListBox(["node-01", "node-02", "node-03"], 0, (w, node) => {}).id("lstNodes");
win.addSlider(0, 100, 70, (w, val) => {}).id("sldCpu");
win.addStepper(1, 16, 4, (w, val) => {}).id("stpWorkers");
win.addProgressBar(75, 100).id("prgSync");
win.addDatePicker("2026-11-07", (w, d) => {}).id("dtStart");
win.addTimePicker("09:00", (w, t) => {}).id("tmStart");
win.addColorWell("#38bdf8", (w, hex) => {}).id("clrPrimary");
win.addBadge("ONLINE", "success").id("bdgStatus");

// Data & Code Views
win.addTable("tblData", ["ID", "Name", "Status"], [["1", "API", "OK"]], (w, rowId) => {});
win.addTreeView([{ label: "src", children: ["index.ts", "simplegui.ts"] }], (w, node) => {});
win.addCodeView("export const port = 3000;", "typescript").id("codeBox");
win.addHtmlView("<b>Rich HTML Preview</b>", 400, 80).id("htmlBox");
```

### Compound labeled form builders (`addForm*`)

```typescript
win.beginCard("📝 Project Settings");
  win.addFormField("Project Name:", "fProj", "bun-rad-app");
  win.addFormDropdown("Target OS:", "fOs", ["macOS", "Linux", "Windows"], "macOS");
  win.addFormNumber("Max Threads:", "fThreads", 8);
  win.addFormSlider("Compression Level:", "fComp", 6);
  win.addFormSwitch("Minify Bundle:", "fMinify", "Strip debug symbols", true);
  win.addFormDatePicker("Target Release:", "fDate", "2026-12-15");
  win.addFormProgress("Build Readiness:", "fReady", 90);
  win.addFormTextarea("Release Notes:", "fReleaseNotes", "Initial RAD release.");
  win.addFormLink("Repository:", "fRepo", "Open GitHub", "https://github.com/codecaine-zz/bun_rad_studio");
win.endCard();
```

---

## Step 5: Tabs, segmented controls, and multi-view switching

> 📖 **Learn more:** [Tabs & Navigation Controls (`SIMPLEGUI_API.md#controls-reference`)](../SIMPLEGUI_API.md#controls-reference) · [Batch Visibility (`SIMPLEGUI_API.md#batch-operations`)](../SIMPLEGUI_API.md#batch-operations) · [Production App Walkthrough (`SIMPLEGUI_API.md#production-app`)](../SIMPLEGUI_API.md#production-app)

Use `addTabs` together with `showControls` / `hideControls` (or `.bindViews()`) to switch cleanly between multiple workspace panels inside a single window:

```typescript
// Map each tab label to the control IDs belonging to that view
const VIEWS: Record<string, string[]> = {
  "🗂 Records": ["cardSearch", "tblRecords", "cardAddRecord"],
  "📊 Analytics": ["cardKpis", "crtTrend", "spkRps"],
  "⚙️ Settings": ["cardPreferences"],
};

function setActiveTabView(w: SimpleWindow, activeTab: string) {
  for (const [tabName, ids] of Object.entries(VIEWS)) {
    if (tabName === activeTab) w.showControls(ids);
    else w.hideControls(ids);
  }
  w.setStatusBarText(`Switched to ${activeTab}`);
}

// 1. Standard Tab Bar (or 1-line .bindViews(VIEWS))
win.addTabs(["🗂 Records", "📊 Analytics", "⚙️ Settings"], 0)
  .id("mainTabs")
  .bindViews(VIEWS, (w, activeTab) => w.setStatusBarText(`Switched to ${activeTab}`));

// 2. Closable Document Tabs (with × button and onTabClose callback)
win.addTabs(["query_1.sql", "schema.sql", "seed.sql"], 0, {
  closable: true,
  onTabClose: (w, closedTab) => w.toast(`Closed ${closedTab}`),
}).id("sqlTabs");

// 3. Segmented Pill Selector & Mode Switcher
win.addSegmentedControl(["Hourly", "Daily", "Weekly"], 1, (w, period) => {
  w.toast(`Period: ${period}`);
}).id("segPeriod");

win.addModeControl("modeLayout", ["Split", "Grid", "List"], "Grid", (w, mode) => {
  w.toast(`Layout mode: ${mode}`);
});
```

---

## Step 6: Live search filtering and dynamic tables

> 📖 **Learn more:** [Real-Time Keystroke Sync (`SIMPLEGUI_API.md#real-time-keystroke--input-synchronization`)](../SIMPLEGUI_API.md#real-time-keystroke--input-synchronization) · [Data & Event Binding (`SIMPLEGUI_API.md#data-event-binding`)](../SIMPLEGUI_API.md#data-event-binding) · [Complete Databases Guide (`databases/complete-databases-guide.md`)](../databases/complete-databases-guide.md)

Because `addSearchInput` fires `onChange` on **every keystroke**, you can filter in-memory arrays or SQLite queries and call `w.setTableRows(id, rows)` for instant live filtering:

```typescript
const RECORDS = [
  ["101", "Ada Lovelace", "Principal Engineer", "London", "Active"],
  ["102", "Alan Turing", "Security Architect", "Manchester", "Active"],
  ["103", "Grace Hopper", "Compiler Lead", "New York", "Active"],
  ["104", "Margaret Hamilton", "Flight Systems", "Boston", "Away"],
];

function applyLiveFilter(w: SimpleWindow) {
  const q = (w.getText("txtFilter") || "").trim().toLowerCase();
  const status = w.getText("cmbStatus") || "All";

  const matched = RECORDS.filter(([id, name, role, city, st]) => {
    const statusOk = status === "All" || st === status;
    const queryOk =
      !q ||
      name.toLowerCase().includes(q) ||
      role.toLowerCase().includes(q) ||
      city.toLowerCase().includes(q);
    return statusOk && queryOk;
  });

  w.setTableRows("tblDirectory", matched);
  w.setText("bdgMatched", `${matched.length} shown`);
}

win.beginRow();
  win.addSearchInput("🔍 Filter by name, role, or city...", (w) => applyLiveFilter(w))
    .id("txtFilter")
    .width(340);
  win.addDropdown(["All", "Active", "Away"], "All", (w) => applyLiveFilter(w))
    .id("cmbStatus")
    .width(140);
  win.addBadge("4 shown", "info").id("bdgMatched");
win.endRow();

win.addTable(
  "tblDirectory",
  ["ID", "Name", "Role", "Location", "Status"],
  RECORDS,
  (w, rowId) => w.setStatusBarText(`Selected ID: ${rowId}`),
).onDoubleClick((w, rowId) => w.info("Member Profile", `Opening profile #${rowId}`));

// Or bind a search input to a table in 1 line:
win.bindTableFilter("txtFilter", "tblDirectory", () => RECORDS, {
  countControlId: "bdgMatched",
  countFormat: (matched) => `${matched} shown`,
});

// Bind table row clicks to form inputs in 1 line (Master-Detail pattern):
win.bindMasterDetail("tblDirectory", ["txtId", "txtName", "txtRole", "txtCity", "cmbStatus"]);

// Read or export current table rows as CSV or JSON:
const objects = win.getTableObjects("tblDirectory");
const csv = win.exportTableCsv("tblDirectory");
const json = win.exportTableJson("tblDirectory");
```

---

## Step 7: Charts, gauges, sparklines, and live telemetry

> 📖 **Learn more:** [Dashboard & Telemetry Controls (`SIMPLEGUI_API.md#dashboard-controls`)](../SIMPLEGUI_API.md#dashboard-controls) · [Timers & Async Busy State (`SIMPLEGUI_API.md#async-busy-timers`)](../SIMPLEGUI_API.md#async-busy-timers) · [Timers API (`SIMPLEGUI_API.md#timers-api`)](../SIMPLEGUI_API.md#timers-api)

```typescript
// 1. KPI Score Cards, Donut Chart & Concentric Activity Rings
win.beginRow();
  win.addScoreCard("API Reliability", 99.95, "Zero SLA breaches", "A+").width(190);
  win.addDonutChart("donutMem", "Memory Pool", 68, "10.8 / 16 GB").width(180);
  win.addActivityRings("ringsNode", [
    { label: "CPU", percent: 78, color: "#fa114f" },
    { label: "RAM", percent: 64, color: "#a1ff00" },
    { label: "Net", percent: 92, color: "#00f0ff" },
  ]).width(175);
  win.statistic("Active Sessions", 4820, { trend: "+14.2%", width: 190 });
win.endRow();

// 2. Vector Line/Bar Chart, Circular Ring, Gauge & Inline Sparkline
win.beginRow();
  win.addChart("crtRps", "line", 140).width(360);
  win.addCircularProgress("cprCpu", 71);
  win.addGauge("ggeDisk", "Disk IOPS", 54);
  win.addSparkline("spkLatency", [12, 15, 19, 14, 22, 18, 25, 21], 38);
win.endRow();

// 3. Segment Distribution Bar & Activity Heatmap
win.addSegmentDistributionBar("segTraffic", [
  { label: "HTTPS", value: 72, color: "#38bdf8" },
  { label: "gRPC", value: 20, color: "#a78bfa" },
  { label: "WS", value: 8, color: "#10b981" },
]);
win.addActivityHeatmap("heatDeploys", 14);

// 4. Push Real-Time Updates with addTimer
const history = [25, 32, 40, 38, 52, 48, 60, 55];
win.addTimer(1000, (w) => {
  const sample = Math.floor(30 + Math.random() * 55);
  history.push(sample);
  if (history.length > 8) history.shift();

  w.setChartData("crtRps", history);
  w.setSparklineData("spkLatency", history);
  w.setCircularProgress("cprCpu", sample);
  w.setGaugeValue("ggeDisk", Math.min(100, sample + 8));
}, { id: "liveMetricsTimer" });
```

---

## Step 8: VLang parity, Studio extended, and 35 enterprise components

> 📖 **Learn more:** [VLang 55+ Control Parity (`SIMPLEGUI_API.md#-vlang-simplegui-control-parity-55-controls--nameless-shorthands`)](../SIMPLEGUI_API.md#-vlang-simplegui-control-parity-55-controls--nameless-shorthands) · [Enterprise Components (`SIMPLEGUI_API.md#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have`)](../SIMPLEGUI_API.md#enterprise-components-muiant-style-only-what-simplegui-did-not-already-have)

| Category | Methods on `SimpleWindow` |
| :--- | :--- |
| **Enterprise Inputs** | `win.autocomplete(options, cfg)` · `win.cascader(tree, cfg)` · `win.treeSelect(tree, cfg)` · `win.mentions(users, cfg)` · `win.richText(cfg)` · `win.signaturePad(cfg)` |
| **Enterprise Actions & Overlays** | `win.copyButton(label, text, cfg)` · `win.loadingButton(label, cfg)` · `win.popconfirm(label, title, cfg)` · `win.popover(label, cfg)` · `win.hoverCard(handle, cfg)` · `win.fab(icon, cfg)` · `win.speedDial(actions, cfg)` · `win.drawer(title, cfg)` · `win.backdrop(cfg)` · `win.tour(steps, cfg)` |
| **Enterprise Navigation & Display** | `win.appBar(title, items, cfg)` · `win.bottomNav(items, cfg)` · `win.statistic(title, val, cfg)` · `win.countdown(title, cfg)` · `win.avatarGroup(names, cfg)` · `win.chips(items, cfg)` · `win.descriptions(title, rows, cfg)` · `win.result(status, title, sub, cfg)` · `win.emptyState(title, text, cfg)` · `win.skeleton(cfg)` · `win.paper(title, text, cfg)` · `win.watermark(mark, body, cfg)` · `win.marquee(items, cfg)` · `win.masonry(items, cfg)` · `win.virtualList(rows, cfg)` · `win.scrollProgress(cfg)` · `win.backToTop(cfg)` |
| **Studio Extended & Parity** | `win.addHeroBanner(title, sub, badge)` · `win.addCalloutPanel(id, title, msg, type)` · `win.addAnimatedInput(id, placeholder, val)` · `win.addButtonGroup(id, buttons)` · `win.addCountBadge(id, label, count, variant)` · `win.addKanbanBoard(id, cols)` · `win.addCommandPalette(id, placeholder)` · `win.addSplitButton(caption, items, cb)` · `win.addKnob(id, min, max, val)` · `win.addStatusDock(items)` |

---

## Step 9: Reactive state, two-way binding, and OS persistence

> 📖 **Learn more:** [Form State & Serialization (`SIMPLEGUI_API.md#form-state-serialization`)](../SIMPLEGUI_API.md#form-state-serialization) · [Reactive State Store (`SIMPLEGUI_API.md#reactive-state-store`)](../SIMPLEGUI_API.md#reactive-state-store) · [App State Persistence (`SIMPLEGUI_API.md#app-state-persistence`)](../SIMPLEGUI_API.md#app-state-persistence) · [File Persistence (`SIMPLEGUI_API.md#file-persistence`)](../SIMPLEGUI_API.md#file-persistence)

```typescript
// 1. Two-way bind UI controls to reactive state keys
win.addTextInput("Cluster Name", "prod-east").id("txtCluster").bindState("cluster_name");
win.addSlider(1, 32, 8).id("sldNodes").bindState("node_count");

// 2. Subscribe to state changes
win.onStateChange("cluster_name", (w, val) => w.setStatusBarText(`Cluster: ${val}`));
win.onStateChange("node_count", (w, val) => w.setStatusBarText(`Nodes: ${val}`));

// 3. Mutate state from code (bound controls update automatically)
win.setState("cluster_name", "eu-central");
win.setStateInt("node_count", 16);

// 4. Declarative Form Validation (auto-highlights & focuses first invalid control)
const check = win.validateForm({
  txtCluster: { required: true, minLength: 3, label: "Cluster Name" },
  sldNodes: { min: 1, max: 32, label: "Node Count" },
});

// 5. Persist to standard OS directories or custom JSON files
win.saveAppFormState();                        // Saves geometry, theme & form inputs
win.saveAppState("my_studio");                 // Saves state store to OS app support dir
win.saveValuesToFile("./backup_settings.json"); // Saves all form values to a JSON file
```

---

## Step 10: Menus, context menus, SweetAlert2 `fire()`, modals, and file pickers

> 📖 **Learn more:** [Dialogs & Alerts (`SIMPLEGUI_API.md#dialogs-alerts`)](../SIMPLEGUI_API.md#dialogs-alerts) · [Menu Bar, Toolbars & Context Menus (`SIMPLEGUI_API.md#15--desktop-menu-bar-toolbars--context-menus`)](../SIMPLEGUI_API.md#15--desktop-menu-bar-toolbars--context-menus) · [SweetAlert2 `fire()` Dialog (`SIMPLEGUI_API.md#dialogs-sweetalert2-style`)](../SIMPLEGUI_API.md#dialogs-sweetalert2-style)

```typescript
// Top Menu Bar & Toolbar
win.addMenuBar("mainMenu", [
  { label: "File", items: ["📄 New", "📂 Open...", "💾 Save", "---", "🚪 Exit"] },
]);
win.addToolBar("mainTb", ["📄 New", "📂 Open", "💾 Save"]);

// Right-Click Context Menu on any control
win.addTextInput("Right-click me", "sample text")
  .id("txtSample")
  .contextMenu(["🔤 UPPERCASE", "🧹 Clear"], (w, act) => {
    w.setText("txtSample", act.includes("UPPER") ? w.getText("txtSample").toUpperCase() : "");
  });

// SweetAlert2-style fire() Dialog
win.fire(
  {
    title: "Deploy to Production?",
    text: "All 12 health checks passed.",
    icon: "question",
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: "🚀 Deploy",
    denyButtonText: "📝 Stage Only",
  },
  (res) => {
    if (res.isConfirmed) win.toast("Deploying...", 2000, "success");
  },
);

// Guaranteed In-Webview File & Folder Pickers
win.open_webview_file_dialog("Select Database", ".sqlite,.db", (p) => p && win.toast(String(p)));
win.open_webview_folder_dialog("Select Workspace", (dir) => dir && win.toast(String(dir)));
win.save_webview_file_dialog("Save Export", "export.json", (dest) => dest && win.toast(String(dest)));
```

---

## Step 11: 133 built-in themes and 12 FX shader themes

> 📖 **Learn more:** [Visual Themes (`SIMPLEGUI_API.md#visual-themes`)](../SIMPLEGUI_API.md#visual-themes) · [Complete Theme Catalog (`THEMES.md`)](../THEMES.md) · [Futuristic FX Shader Themes (`developer/fx-themes.md`)](../developer/fx-themes.md)

```typescript
// Add a 1-line theme selector dropdown that switches & persists themes automatically:
win.addThemeSelector("dd_theme", "Theme:");

// Switch themes or FX motion mode at runtime:
win.setTheme("cyberpunk_hologram");
win.setEffects("full"); // "full" | "reduced" | "off"
```

---

## Step 12: Pro SimpleGUI RAD tips and tricks

> 📖 **Learn more:** [Async Busy State (`SIMPLEGUI_API.md#async-busy-state`)](../SIMPLEGUI_API.md#async-busy-state) · [Batch Operations (`SIMPLEGUI_API.md#batch-operations`)](../SIMPLEGUI_API.md#batch-operations) · [Testing Guide (`testing/index.md`)](../testing/index.md) · [Troubleshooting (`SIMPLEGUI_API.md#troubleshooting`)](../SIMPLEGUI_API.md#troubleshooting)

1. **1-Line Multi-View Navigation (`.bindViews`)**: Chain `.bindViews({ "🗂 Tasks": ["cardSearch", "tblTasks"], "📊 Metrics": ["cardCharts"] })` onto `win.addTabs(...)` or `win.addNavigationMenu(...)` to toggle view groups automatically without manual `showControls`/`hideControls` loops.
2. **1-Line Live Table Search (`.filterTable` & `.debounceChange`)**: Chain `.filterTable("tblUsers", (visible, total) => ...)` onto `win.addSearchInput(...)` for instant in-memory row filtering, or use `.debounceChange(200, (w, q) => ...)` when querying SQLite or remote REST endpoints.
3. **Coalesce High-Frequency UI Updates (`batchUpdate` & `patchState`)**: Wrap multiple `setText`, `setTableRows`, `setChartData`, and `setGaugeValue` calls inside `win.batchUpdate((w) => { ... })` so all DOM updates execute in a single WebView IPC frame.
4. **Safe Async Buttons (`withBusyState`)**: Wrap async button callbacks in `await win.withBusyState(["btnDeploy"], "⏳ Deploying...", async (ctx) => { ... })` to prevent duplicate clicks and auto-restore button state even on errors.
5. **Headless Unit Testing in `bun test`**: Export a factory function (`export function createMyWindow(): SimpleWindow`) and guard `win.run()` behind `if (import.meta.main)`. Drive controls headlessly with `await win.triggerClick("btnSave")` and `await win.triggerChange("txtSearch", "term")` with zero WebView overhead.

---

## Complete full-featured Studio Workspace Template

You can run this complete workspace directly with:

```bash
bun run examples/rad_tutorial/12_full_studio_workspace_template.ts
```

See the full source in [`examples/rad_tutorial/12_full_studio_workspace_template.ts`](../../examples/rad_tutorial/12_full_studio_workspace_template.ts) or [`CHEATSHEET.md`](../../CHEATSHEET.md#template-1-full-featured-simplegui-studio-workspace).
