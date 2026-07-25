/**
 * ⚡ Bun RAD Studio Demo 13: Modern Productivity UI Controls Studio
 * 
 * Demonstrates:
 * - 7 Modern Productivity UI Controls:
 *   1. kanban_board: Multi-column task board with status cards & badges
 *   2. shortcut_recorder: Hotkey shortcut recorder & key badge viewer
 *   3. split_button: Dual-segment button with primary action + sub-menu arrow
 *   4. sparkline_table: Multi-row data grid with embedded SVG mini trend sparklines
 *   5. metric_comparison: Executive KPI card comparing current value vs target with delta
 *   6. activity_feed: Timestamped activity audit log stream with user avatars & status
 *   7. file_tree_tabs: Multi-file IDE workspace tab bar with file icons & modified state
 * - Direct Visual On-Form Actions: Live Alert Banners, Code Inspector, Status Bar & Control Mutations
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml } from "../index.ts";

const formSpec = {
    title: "Demo 13 - Modern Productivity UI Controls Studio",
    width: 1000,
    height: 750,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 20,
    controls: [
        // App Action Toolbar
        {
            id: "productivity_toolbar",
            control_type: "tool_bar",
            x: 20, y: 12, width: 960, height: 38,
            text: "📋 Update Kanban, ⌨️ Set Hotkey, ➗ Split Action, 📈 Update Sparkline, 📊 Change Metric, ⚡ Log Activity, 📑 Switch Tab",
            event_handlers: { onClick: "on_toolbar_click" }
        },

        // Live Action Alert Banner (Visually displays click feedback right on the form!)
        {
            id: "live_alert_banner",
            control_type: "alert_banner",
            x: 20, y: 56, width: 960, height: 36,
            text: "💡 Live Interaction Active: Click any toolbar action, Kanban card, workspace tab, hotkey badge, split button, sparkline row, or activity feed item!",
            background_color: "#0284c7"
        },

        // Section 1: Task Management & IDE Workspace Tabs
        { id: "lbl_sec1", control_type: "label", x: 20, y: 102, width: 460, height: 22, text: "📋 Kanban Task Board", font_size: 13, font_weight: "700", font_color: "#38bdf8" },

        // 1. Kanban Board
        {
            id: "kanban_1",
            control_type: "kanban_board",
            x: 20, y: 128, width: 460, height: 202,
            text: "Backlog (4) | In Progress (2) | Verified (5)",
            event_handlers: { onClick: "on_kanban_click" }
        },

        // 2. Workspace Tabs
        { id: "lbl_sec2", control_type: "label", x: 500, y: 102, width: 480, height: 22, text: "📑 IDE Workspace Tabs & Hotkeys", font_size: 13, font_weight: "700", font_color: "#38bdf8" },
        {
            id: "tabs_1",
            control_type: "file_tree_tabs",
            x: 500, y: 128, width: 480, height: 36,
            text: "⚡ index.ts*, 📄 API.md, 🎨 styles.css, 🛠️ config.json",
            event_handlers: { onChange: "on_tabs_change" }
        },

        // 3. Shortcut Recorder & 4. Split Button
        {
            id: "shortcut_1",
            control_type: "shortcut_recorder",
            x: 500, y: 172, width: 230, height: 36,
            text: "⌘ Shift P",
            value: "⌘ Shift P",
            event_handlers: { onClick: "on_shortcut_click" }
        },
        {
            id: "split_btn_1",
            control_type: "split_button",
            x: 750, y: 172, width: 230, height: 36,
            text: "🚀 Deploy Application",
            event_handlers: { onClick: "on_split_btn_click", onMenu: "on_split_btn_menu" }
        },

        // Live Event Payload Inspector Box
        {
            id: "code_inspector",
            control_type: "code_view",
            x: 500, y: 216, width: 480, height: 114,
            text: "// 🔍 Live Action Payload Stream\n// Click controls on screen to see interactive event feedback!\n{\n  \"status\": \"ready\",\n  \"controls_active\": 7\n}",
            background_color: "#0d1117"
        },

        // Section 2: Metrics, Trends & Activity Streams
        { id: "lbl_sec3", control_type: "label", x: 20, y: 342, width: 460, height: 22, text: "📈 Sparkline Trends & Executive KPI Comparison", font_size: 13, font_weight: "700", font_color: "#38bdf8" },

        // 5. Sparkline Table
        {
            id: "sparkline_1",
            control_type: "sparkline_table",
            x: 20, y: 368, width: 460, height: 155,
            text: "Monthly ARR: $128k [↗], Active Workspaces: 3.4k [→], CPU Latency: 1.2ms [↘], Error Rate: 0.02% [↘]",
            event_handlers: { onClick: "on_sparkline_click" }
        },

        // 6. Metric Comparison Card
        {
            id: "metric_cmp_1",
            control_type: "metric_comparison",
            x: 500, y: 368, width: 480, height: 155,
            text: "Annual Recurring Revenue (ARR)",
            value: "$1,248,500",
            placeholder: "Target Goal: $1,000,000",
            event_handlers: { onClick: "on_metric_cmp_click" }
        },

        // Section 3: Timestamped Activity Feed Stream
        { id: "lbl_sec4", control_type: "label", x: 20, y: 535, width: 960, height: 22, text: "⚡ Audit Stream & Operations Feed", font_size: 13, font_weight: "700", font_color: "#38bdf8" },

        // 7. Activity Feed
        {
            id: "activity_1",
            control_type: "activity_feed",
            x: 20, y: 561, width: 960, height: 125,
            text: "Alice published v1.5.0 release build (2m ago), Bob pushed 4 commits to main (12m ago), Charlie resolved Issue #108 (35m ago), System auto-backup completed successfully (1h ago)",
            caption: "Live Team Operations Audit Stream",
            event_handlers: { onClick: "on_activity_click" }
        },

        // Bottom Status Bar
        {
            id: "app_status_bar",
            control_type: "status_bar",
            x: 0, y: 710, width: 1000, height: 28,
            text: "Demo 13 | All 7 Modern Productivity UI Controls Operational | Bun RAD v1.3",
            dock: "bottom"
        }
    ]
};

const htmlContent = generatePreviewHtml(formSpec as any);

const wv = new Webview(true);
wv.title = formSpec.title;
wv.size = { width: formSpec.width, height: formSpec.height, hint: SizeHint.NONE };

// Helper to evaluate JS in the active demo window
function evalJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("JS Eval Error:", e); }
}

function updateAlertBanner(msg: string) {
    evalJS(`
        const el = document.getElementById("live_alert_banner");
        if (el) {
            const span = el.querySelector("span:nth-child(2)") || el.querySelector("span");
            if (span) span.textContent = ${JSON.stringify(msg)};
            else el.textContent = ${JSON.stringify(msg)};
            el.style.transition = "background 0.2s, box-shadow 0.2s";
            el.style.background = "#0284c7";
            el.style.boxShadow = "0 0 16px rgba(56,189,248,0.6)";
            setTimeout(() => { el.style.boxShadow = ""; }, 800);
        }
    `);
}

function updateCodeInspector(titleStr: string, payload: any) {
    const codeContent = `// ⚡ [Action]: ${titleStr}\n` + JSON.stringify(payload, null, 2);
    evalJS(`
        const el = document.getElementById("code_inspector");
        if (el) {
            const ta = el.querySelector("textarea");
            if (ta) ta.value = ${JSON.stringify(codeContent)};
            else el.textContent = ${JSON.stringify(codeContent)};
        }
    `);
}

function updateStatusBar(msg: string) {
    evalJS(`
        const c = document.getElementById("app_status_bar");
        if (c) {
            const spans = c.querySelectorAll("span");
            if (spans.length >= 3) {
                spans[2].textContent = ${JSON.stringify(msg)};
            } else if (spans.length > 0) {
                spans[spans.length - 1].textContent = ${JSON.stringify(msg)};
            }
        }
    `);
}

function updateKanbanCols(cols: string) {
    evalJS(`if(window.setKanbanColumns)window.setKanbanColumns("kanban_1", ${JSON.stringify(cols)});`);
}

function updateHotkey(sc: string) {
    evalJS(`if(window.setShortcutRecorderValue)window.setShortcutRecorderValue("shortcut_1", ${JSON.stringify(sc)});`);
}

function updateSplitAction(act: string) {
    evalJS(`if(window.setSplitButtonAction)window.setSplitButtonAction("split_btn_1", ${JSON.stringify(act)});`);
}

function updateSparklines(rows: string) {
    evalJS(`if(window.setSparklineTableData)window.setSparklineTableData("sparkline_1", ${JSON.stringify(rows)});`);
}

function updateMetricCard(title: string, curVal: string, targetStr: string, changeStr: string) {
    const opts = JSON.stringify({ title, curVal, targetStr, changeStr });
    evalJS(`if(window.setMetricComparison)window.setMetricComparison("metric_cmp_1", ${opts});`);
}

function updateActivityFeed(items: string) {
    evalJS(`if(window.setActivityFeedItems)window.setActivityFeedItems("activity_1", ${JSON.stringify(items)});`);
}

function updateWorkspaceTabs(files: string) {
    evalJS(`if(window.setWorkspaceTabs)window.setWorkspaceTabs("tabs_1", ${JSON.stringify(files)});`);
}

// Demo State Variables
let shortcutIdx = 0;
const hotkeys = ["⌘ Shift P", "Ctrl + Alt + T", "⌘ K ⌘ S", "Alt + F12", "Ctrl + Shift + F"];

let splitActionIdx = 0;
const splitActions = ["🚀 Deploy Application", "💾 Save Workspace", "⚡ Build Production", "📦 Export Package"];

let kanbanToggle = false;
let sparklineToggle = false;
let metricToggle = false;

let activityCount = 1;

// Handler logic functions
function handleToolbarClick(item: string) {
    console.log(`[IPC Action]: Toolbar action triggered -> "${item}"`);
    const actStr = String(item || '');

    if (actStr.includes("Update Kanban")) {
        kanbanToggle = !kanbanToggle;
        const cols = kanbanToggle
            ? "Sprint 14 (5) | Code Review (3) | Verified (8)"
            : "Backlog (4) | In Progress (2) | Verified (5)";
        updateKanbanCols(cols);
        updateAlertBanner(`📋 [Toolbar Action]: Updated Kanban columns to '${cols}'`);
        updateCodeInspector("Toolbar - Update Kanban", { action: "setKanbanColumns", columns: cols });
        updateStatusBar(`Kanban updated: ${cols}`);
    } else if (actStr.includes("Set Hotkey")) {
        shortcutIdx = (shortcutIdx + 1) % hotkeys.length;
        const newHotkey = hotkeys[shortcutIdx];
        updateHotkey(newHotkey);
        updateAlertBanner(`⌨️ [Toolbar Action]: Set active keyboard shortcut to '${newHotkey}'`);
        updateCodeInspector("Toolbar - Set Hotkey", { action: "setShortcutRecorderValue", value: newHotkey });
        updateStatusBar(`Shortcut set to: ${newHotkey}`);
    } else if (actStr.includes("Split Action")) {
        splitActionIdx = (splitActionIdx + 1) % splitActions.length;
        const newAction = splitActions[splitActionIdx];
        updateSplitAction(newAction);
        updateAlertBanner(`➗ [Toolbar Action]: Changed Split Button primary action to '${newAction}'`);
        updateCodeInspector("Toolbar - Split Action", { action: "setSplitButtonAction", text: newAction });
        updateStatusBar(`Split action changed: ${newAction}`);
    } else if (actStr.includes("Update Sparkline")) {
        sparklineToggle = !sparklineToggle;
        const sparkData = sparklineToggle
            ? "Q3 ARR: $184k [↗], Active Users: 8.9k [↗], Build Time: 42ms [↘]"
            : "Monthly ARR: $128k [↗], Active Workspaces: 3.4k [→], CPU Latency: 1.2ms [↘]";
        updateSparklines(sparkData);
        updateAlertBanner(`📈 [Toolbar Action]: Updated sparkline trend table data!`);
        updateCodeInspector("Toolbar - Update Sparkline", { action: "setSparklineTableData", data: sparkData });
        updateStatusBar(`Sparkline table updated!`);
    } else if (actStr.includes("Change Metric")) {
        metricToggle = !metricToggle;
        if (metricToggle) {
            updateMetricCard("Quarterly Revenue Goal", "$1,850,000", "Target Goal: $1,500,000", "▲ +23.3%");
            updateAlertBanner(`📊 [Toolbar Action]: Swapped KPI card to Quarterly Goal ($1.85M)`);
            updateCodeInspector("Toolbar - Change Metric", { action: "setMetricComparison", title: "Quarterly Revenue Goal", curVal: "$1,850,000" });
            updateStatusBar(`Metric card set to Quarterly Goal ($1.85M)`);
        } else {
            updateMetricCard("Annual Recurring Revenue (ARR)", "$1,248,500", "Target Goal: $1,000,000", "▲ +12.3%");
            updateAlertBanner(`📊 [Toolbar Action]: Swapped KPI card to Annual ARR ($1.25M)`);
            updateCodeInspector("Toolbar - Change Metric", { action: "setMetricComparison", title: "Annual Recurring Revenue (ARR)", curVal: "$1,248,500" });
            updateStatusBar(`Metric card set to Annual ARR ($1.25M)`);
        }
    } else if (actStr.includes("Log Activity")) {
        activityCount++;
        const newItems = `Dave merged PR #${140 + activityCount} (just now), Alice published release v1.5.${activityCount} (2m ago), Bob pushed 4 commits (12m ago)`;
        updateActivityFeed(newItems);
        updateAlertBanner(`⚡ [Toolbar Action]: Appended audit log entry for PR #${140 + activityCount}`);
        updateCodeInspector("Toolbar - Log Activity", { action: "setActivityFeedItems", newActivity: `Dave merged PR #${140 + activityCount}` });
        updateStatusBar(`Logged activity #${activityCount}: PR #${140 + activityCount} merged`);
    } else if (actStr.includes("Switch Tab")) {
        const tabs = "🚀 main.ts*, ⚙️ env.d.ts, 📄 README.md, 🛠️ build.ts";
        updateWorkspaceTabs(tabs);
        updateAlertBanner(`📑 [Toolbar Action]: Switched workspace tab list to '${tabs}'`);
        updateCodeInspector("Toolbar - Switch Tab", { action: "setWorkspaceTabs", tabs: tabs });
        updateStatusBar(`Workspace tabs refreshed: ${tabs}`);
    }
}

function handleKanbanClick(cardName: string) {
    console.log(`[IPC Action]: Kanban card clicked -> "${cardName}"`);
    updateAlertBanner(`📋 [Kanban Event]: Card '${cardName || 'Card'}' selected! Moved status to In Progress.`);
    updateCodeInspector("Kanban Card Clicked", { control_id: "kanban_1", card_selected: cardName });
    updateStatusBar(`Kanban card clicked: ${cardName || 'Card'}`);
}

function handleTabsChange(fileName: string) {
    console.log(`[IPC Action]: Workspace tab selected -> "${fileName}"`);
    updateAlertBanner(`📑 [Workspace Tab Event]: Active file changed to '${fileName || 'File'}'`);
    updateCodeInspector("Workspace Tab Switched", { control_id: "tabs_1", file_opened: fileName });
    updateStatusBar(`Active editor file: ${fileName || 'File'}`);
}

function handleShortcutClick(shortcut: string) {
    console.log(`[IPC Action]: Shortcut recorder clicked -> "${shortcut}"`);
    shortcutIdx = (shortcutIdx + 1) % hotkeys.length;
    const nextKey = hotkeys[shortcutIdx];
    updateHotkey(nextKey);
    updateAlertBanner(`⌨️ [Shortcut Recorder Event]: Recorded new hotkey binding -> '${nextKey}'`);
    updateCodeInspector("Shortcut Recorder Clicked", { control_id: "shortcut_1", old_key: shortcut, new_key: nextKey });
    updateStatusBar(`Recorded new hotkey: ${nextKey}`);
}

function handleSplitClick(action: string) {
    console.log(`[IPC Action]: Primary Split Action Clicked -> "${action}"`);
    updateAlertBanner(`🚀 [Split Button Event]: Executed main primary action -> '${action || 'Primary Action'}'`);
    updateCodeInspector("Split Button Action Executed", { control_id: "split_btn_1", executed_action: action || "Primary Action" });
    updateStatusBar(`Executed action: ${action || 'Primary Action'}`);
}

function handleSplitMenu() {
    console.log(`[IPC Action]: Split Button Dropdown Menu Arrow Clicked!`);
    splitActionIdx = (splitActionIdx + 1) % splitActions.length;
    const nextAct = splitActions[splitActionIdx];
    updateSplitAction(nextAct);
    updateAlertBanner(`➗ [Split Button Menu Event]: Dropdown selected option -> '${nextAct}'`);
    updateCodeInspector("Split Button Sub-Menu Selected", { control_id: "split_btn_1", new_selected_option: nextAct });
    updateStatusBar(`Menu selected option: ${nextAct}`);
}

function handleSparklineClick(rowLabel: string) {
    console.log(`[IPC Action]: Sparkline row clicked -> "${rowLabel}"`);
    updateAlertBanner(`📈 [Sparkline Row Event]: Trend metric '${rowLabel || 'Row'}' inspected -> Executive KPI updated`);
    updateCodeInspector("Sparkline Row Clicked", { control_id: "sparkline_1", metric_selected: rowLabel });
    updateMetricCard(`${rowLabel || 'CPU Latency'} (p99)`, "1.2ms", "Target Goal: < 5.0ms", "▼ -3.4ms");
    updateStatusBar(`Sparkline trend metric: ${rowLabel || 'Row'}`);
}

function handleMetricClick(title: string) {
    console.log(`[IPC Action]: Metric card clicked -> "${title}"`);
    updateAlertBanner(`📊 [Metric Comparison Event]: Opened detailed analytics for '${title || 'KPI'}'`);
    updateCodeInspector("Executive KPI Card Clicked", { control_id: "metric_cmp_1", title: title });
    updateStatusBar(`Metric card details inspector opened for: ${title || 'MRR'}`);
}

function handleActivityClick(itemText: string) {
    console.log(`[IPC Action]: Activity item clicked -> "${itemText}"`);
    updateAlertBanner(`⚡ [Audit Stream Event]: Selected activity -> '${itemText || 'Activity'}'`);
    updateCodeInspector("Activity Audit Log Selected", { control_id: "activity_1", log_entry: itemText });
    updateStatusBar(`Audit detail: ${itemText || 'Activity'}`);
}

// Bind all candidate event names to guarantee execution under any naming convention
const bindAll = (names: string[], fn: any) => {
    for (const name of names) {
        try { wv.bind(name, fn); } catch (e) {}
    }
};

bindAll(["on_toolbar_click", "productivity_toolbar_onClick", "on_productivity_toolbar_click"], handleToolbarClick);
bindAll(["on_kanban_click", "kanban_1_onClick", "on_kanban_1_click"], handleKanbanClick);
bindAll(["on_tabs_change", "tabs_1_onChange", "on_tabs_1_change"], handleTabsChange);
bindAll(["on_shortcut_click", "shortcut_1_onClick", "on_shortcut_1_click"], handleShortcutClick);
bindAll(["on_split_btn_click", "split_btn_1_onClick", "on_split_btn_1_click"], handleSplitClick);
bindAll(["on_split_btn_menu", "split_btn_1_onMenu", "on_split_btn_1_menu"], handleSplitMenu);
bindAll(["on_sparkline_click", "sparkline_1_onClick", "on_sparkline_1_click"], handleSparklineClick);
bindAll(["on_metric_cmp_click", "metric_cmp_1_onClick", "on_metric_cmp_1_click"], handleMetricClick);
bindAll(["on_activity_click", "activity_1_onClick", "on_activity_1_click"], handleActivityClick);

wv.setHTML(htmlContent);

if (process.env.TEST_MODE === "1") {
    console.log("⚡ Demo 13 compiled successfully in TEST_MODE.");
    process.exit(0);
} else {
    wv.run();
}
