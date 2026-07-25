/**
 * ⚡ Bun RAD Studio Demo 8: Analytics & Operations Dashboard Template
 * 
 * Demonstrates:
 * - Enterprise Executive Dashboard & Real-Time Monitoring Template
 * - KPI Metric Cards (stat_chart, metric_card, circular_progress, metric_meter)
 * - System Status & Activity Timeline (status_indicator, timeline, alert_banner)
 * - Toolbar, Tab Navigation & Command Palette (tool_bar, tabs, command_palette)
 * - Server Log Table & Data Pagination (table, form_search, pagination)
 * - Interactive IPC Event Handlers with live window & webview state updates
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative } from "../index.ts";

const dashboardSpec = {
    title: "Demo 8 - Analytics & Operations Dashboard Template",
    width: 980,
    height: 720,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 20,
    controls: [
        // Top Action Bar / Tool Bar
        {
            id: "dash_toolbar",
            control_type: "tool_bar",
            x: 20, y: 15, width: 940, height: 40,
            text: "🔄 Refresh Metrics, 📊 Export PDF, 🔍 Audit Logs, ⚡ Live Sync, 📌 Pin Window, ⚙️ Settings",
            event_handlers: { onClick: "on_dash_toolbar_click" }
        },

        // Top Navigation Tabs
        {
            id: "dash_tabs",
            control_type: "tabs",
            x: 20, y: 65, width: 500, height: 40,
            text: "Overview, Server Fleet, Financials, System Audit",
            value: "Overview",
            event_handlers: { onChange: "on_dash_tabs_change" }
        },

        // Quick Search Command Palette
        {
            id: "dash_cmd",
            control_type: "command_palette",
            x: 535, y: 65, width: 425, height: 40,
            placeholder: "Search telemetry metrics or jump to cluster (⌘K)...",
            event_handlers: { onChange: "on_dash_cmd_change" }
        },

        // Header Section Title
        { id: "lbl_kpi_header", control_type: "label", x: 20, y: 118, width: 400, height: 24, text: "📈 System Performance & KPI Metrics", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        // KPI Row: Stat Chart & Metric Cards
        {
            id: "kpi_revenue",
            control_type: "stat_chart",
            x: 20, y: 148, width: 220, height: 100,
            text: "Monthly Cloud Revenue",
            value: "$128,450",
            trend: "+24.8%"
        },
        {
            id: "kpi_active_clusters",
            control_type: "metric_card",
            x: 255, y: 148, width: 220, height: 100,
            text: "Active Kubernetes Clusters",
            value: "42 Nodes",
            trend: "+5 this week"
        },
        {
            id: "kpi_latency",
            control_type: "metric_card",
            x: 490, y: 148, width: 220, height: 100,
            text: "P99 API Latency",
            value: "14.2 ms",
            trend: "-3.1 ms optimal"
        },
        {
            id: "kpi_cpu_load",
            control_type: "circular_progress",
            x: 725, y: 148, width: 235, height: 100,
            value: 68
        },

        // System Health & Timeline Panel (Left Column)
        { id: "lbl_fleet_header", control_type: "label", x: 20, y: 260, width: 455, height: 24, text: "🖥️ Infrastructure Health & Live Deployments", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        {
            id: "status_db",
            control_type: "status_indicator",
            x: 20, y: 290, width: 220, height: 32,
            text: "Primary DB Cluster: Healthy",
            status: "online"
        },
        {
            id: "status_redis",
            control_type: "status_indicator",
            x: 255, y: 290, width: 220, height: 32,
            text: "Redis Cache: High Load",
            status: "warning"
        },
        {
            id: "status_api",
            control_type: "status_indicator",
            x: 20, y: 328, width: 220, height: 32,
            text: "API Gateway US-East: Online",
            status: "online"
        },
        {
            id: "status_cdn",
            control_type: "status_indicator",
            x: 255, y: 328, width: 220, height: 32,
            text: "Edge CDN EU-Central: Synced",
            status: "online"
        },

        // Activity Timeline
        {
            id: "deployment_timeline",
            control_type: "timeline",
            x: 20, y: 370, width: 455, height: 145,
            text: "v2.4.0 Deployed to Prod, Redis Cluster Scaled (+4), TLS Cert Renewed, Backup Complete"
        },

        // Right Column: Server Log Table & Controls
        { id: "lbl_logs_header", control_type: "label", x: 490, y: 260, width: 470, height: 24, text: "📋 Server Audit Logs & Incident Telemetry", font_size: 14, font_weight: "700", font_color: "#38bdf8" },

        {
            id: "log_search",
            control_type: "form_search",
            x: 490, y: 290, width: 470, height: 44,
            text: "Filter Audit Logs:",
            placeholder: "Search endpoint, status code or IP...",
            event_handlers: { onChange: "on_log_search_change" }
        },

        // Log Data Table
        {
            id: "logs_table",
            control_type: "table",
            x: 490, y: 345, width: 470, height: 170,
            columns: ["Time", "Event", "Service", "Status"],
            rows: [
                ["14:32:01", "POST /api/v1/auth", "Auth-Service", "200 OK"],
                ["14:31:45", "GET /api/v1/clusters", "Fleet-Manager", "200 OK"],
                ["14:30:12", "DB Cache Hit Ratio 99.4%", "Redis-Primary", "INFO"],
                ["14:28:55", "SSL Certificate Refresh", "Security-Daemon", "SUCCESS"],
                ["14:25:30", "Worker Auto-Scale Trigger", "Kubernetes-Controller", "SCALED"]
            ]
        },

        // Quick Controls Row (Bottom Left)
        {
            id: "btn_toggle_pin",
            control_type: "toggle_button",
            x: 20, y: 530, width: 140, height: 38,
            text: "📌 Always On Top",
            checked: true,
            event_handlers: { onClick: "on_btn_toggle_pin_click" }
        },
        {
            id: "btn_cycle_tabs",
            control_type: "button",
            x: 170, y: 530, width: 140, height: 38,
            text: "🔄 Next Dashboard",
            background_color: "#0284c7",
            event_handlers: { onClick: "on_btn_cycle_tabs_click" }
        },
        {
            id: "meter_memory",
            control_type: "metric_meter",
            x: 320, y: 530, width: 155, height: 38,
            text: "RAM Allocation",
            value: 42
        },

        // Pagination & Alert Card (Bottom Right)
        {
            id: "logs_pagination",
            control_type: "pagination",
            x: 490, y: 530, width: 230, height: 38,
            event_handlers: { onClick: "on_logs_pagination_click" }
        },
        {
            id: "status_alert",
            control_type: "alert_banner",
            x: 730, y: 530, width: 230, height: 38,
            alert_type: "success",
            text: "All 42 Clusters Operational"
        },

        // Status Bar at the bottom
        {
            id: "dash_status_bar",
            control_type: "status_bar",
            x: 20, y: 585, width: 940, height: 28,
            text: "Cluster US-East-1 | Telemetry Stream: 120 msg/sec | Engine v1.3"
        }
    ]
};

console.log("⚡ Launching Bun RAD Studio Demo 8: Analytics & Operations Dashboard...");

const htmlContent = generatePreviewHtml(dashboardSpec);

const webview = new Webview(true, {
    width: 980,
    height: 720,
    hint: SizeHint.NONE
});

webview.title = dashboardSpec.title;

// Helper to safely execute JS in webview
function execJS(code: string) {
    try { webview.eval(code); } catch (e) { console.error("JS Execution Error:", e); }
}

let isWindowPinned = true;
let currentTabIndex = 0;
const tabsList = ["Overview", "Server Fleet", "Financials", "System Audit"];

// Bind native helpers
setAlwaysOnTopNative(webview, true);

webview.bind("toggleFullscreenBackend", () => {
    toggleFullscreenNative(webview);
});

webview.bind("quitApp", () => {
    console.log("👋 Application exit requested.");
    process.exit(0);
});

// IPC Event Handlers
webview.bind("on_dash_toolbar_click", (itemName?: string) => {
    const item = itemName || "Action";
    console.log(`⚡ [IPC] Toolbar Action Clicked: ${item}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("dash_status_bar", "🛠️ Action: ${item} executed");
        if (window.setAlertBannerText) window.setAlertBannerText("status_alert", "${item} Completed");
    `);
});

webview.bind("on_dash_tabs_change", (tabName?: string) => {
    const tab = tabName || "Overview";
    console.log(`⚡ [IPC] Dashboard Tab Changed: ${tab}`);
    currentTabIndex = tabsList.indexOf(tab);
    if (currentTabIndex === -1) currentTabIndex = 0;
    execJS(`
        if (window.setTabsActive) window.setTabsActive("dash_tabs", "${tab}");
        if (window.setStatusBarText) window.setStatusBarText("dash_status_bar", "📊 Dashboard View: ${tab}");
    `);
});

webview.bind("on_dash_cmd_change", (val?: string) => {
    console.log(`⚡ [IPC] Command Search Query: ${val}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("dash_status_bar", "🔍 Command Filter: ${val}");
    `);
});

webview.bind("on_log_search_change", (val?: string) => {
    console.log(`⚡ [IPC] Log Search Filter: ${val}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("dash_status_bar", "📋 Filtered logs matching '${val}'");
    `);
});

webview.bind("on_btn_toggle_pin_click", () => {
    isWindowPinned = !isWindowPinned;
    console.log(`⚡ [IPC] Toggling Window Pin state: ${isWindowPinned}`);
    setAlwaysOnTopNative(webview, isWindowPinned);
    const label = isWindowPinned ? "📌 Always On Top" : "🔓 Normal Window";
    execJS(`
        if (window.setToggleButtonState) window.setToggleButtonState("btn_toggle_pin", ${isWindowPinned}, "${label}");
        if (window.setStatusBarText) window.setStatusBarText("dash_status_bar", "${isWindowPinned ? "📌 Window Pinned Always On Top" : "🔓 Window Unpinned"}");
    `);
});

webview.bind("on_btn_cycle_tabs_click", () => {
    currentTabIndex = (currentTabIndex + 1) % tabsList.length;
    const nextTab = tabsList[currentTabIndex];
    console.log(`⚡ [IPC] Cycle Tab Clicked -> Switching to ${nextTab}`);
    execJS(`
        if (window.setTabsActive) window.setTabsActive("dash_tabs", "${nextTab}");
        if (window.setStatusBarText) window.setStatusBarText("dash_status_bar", "🔄 Switched to ${nextTab}");
    `);
});

webview.bind("on_logs_pagination_click", (pageNum?: any) => {
    console.log(`⚡ [IPC] Log Pagination Clicked: ${pageNum}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("dash_status_bar", "📄 Audit Log Page ${pageNum} Loaded");
    `);
});

webview.setHTML(htmlContent);

// Background heartbeat sync for dashboard telemetry
let heartbeatCounter = 0;
setInterval(() => {
    heartbeatCounter++;
    const timeStr = new Date().toLocaleTimeString();
    const statusMsg = `Cluster US-East-1 | Telemetry: ${120 + (heartbeatCounter % 15)} msg/sec | Sync OK | ${timeStr}`;
    try {
        webview.eval(`
            if (window.setStatusBarText) window.setStatusBarText("dash_status_bar", "${statusMsg}");
        `);
    } catch (e) {}
}, 3000);

webview.run();
