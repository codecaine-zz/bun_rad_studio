/**
 * ⚡ Bun RAD Studio Demo 10: Database Studio & SQL Query Editor Template
 * 
 * Demonstrates:
 * - Desktop GUI SQL Database Manager & Query Studio Template
 * - Database Record Controls (db_navigator, db_grid, db_input, db_dropdown)
 * - Connection Selector & Command Bar (rich_select, command_palette, tabs)
 * - Database Schema Tree View (tree_view, form_search, form_stepper)
 * - Interactive SQL Console Code View (form_code, alert_banner, status_bar)
 * - IPC Handlers for table navigation, query execution, record filtering, and row clicks
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative } from "../index.ts";

const dbStudioSpec = {
    title: "Demo 10 - Database Studio & SQL Query Editor Template",
    width: 980,
    height: 720,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 20,
    controls: [
        // Top Toolbar: DB Navigation Bar
        {
            id: "db_nav_bar",
            control_type: "db_navigator",
            x: 20, y: 15, width: 440, height: 38,
            event_handlers: { onClick: "on_db_nav_bar_click" }
        },

        // Active Connection Dropdown
        {
            id: "db_conn_select",
            control_type: "rich_select",
            x: 475, y: 15, width: 240, height: 38,
            text: "production.sqlite",
            options: "production.sqlite, staging_postgres.db, analytics_dw.db, local_test.db",
            placeholder: "Select Active Connection...",
            event_handlers: { onChange: "on_db_conn_change" }
        },

        // Action Toolbar
        {
            id: "db_toolbar",
            control_type: "tool_bar",
            x: 725, y: 15, width: 235, height: 38,
            text: "⚡ Run SQL, 📥 Export CSV, ⚙️ Config",
            event_handlers: { onClick: "on_db_toolbar_click" }
        },

        // Command Palette & Search
        {
            id: "db_cmd",
            control_type: "command_palette",
            x: 20, y: 62, width: 440, height: 40,
            placeholder: "Search tables, indexes or SQL snippets (⌘K)...",
            event_handlers: { onChange: "on_db_cmd_change" }
        },

        // Navigation Tabs
        {
            id: "db_tabs",
            control_type: "tabs",
            x: 475, y: 62, width: 485, height: 40,
            text: "SQL Query Console, Table Data View, Schema Inspector",
            value: "SQL Query Console",
            event_handlers: { onChange: "on_db_tabs_change" }
        },

        // Left Column: Database Schema Explorer
        { id: "lbl_schema_header", control_type: "label", x: 20, y: 112, width: 240, height: 24, text: "🗄️ Database Schemas & Tables", font_size: 13, font_weight: "700", font_color: "#38bdf8" },

        {
            id: "schema_tree",
            control_type: "tree_view",
            x: 20, y: 140, width: 240, height: 375,
            text: "📂 production.sqlite, 📁 Tables (4), 📄 users (1,250 recs), 📄 orders (8,420 recs), 📄 products (340 recs), 📄 audit_logs (52,100 recs), 📁 Views (2), 📄 v_active_users, 📄 v_monthly_sales",
            event_handlers: { onChange: "on_schema_tree_select" }
        },

        {
            id: "max_rows_stepper",
            control_type: "form_stepper",
            x: 20, y: 525, width: 240, height: 38,
            text: "Row Fetch Limit:",
            value: 50,
            event_handlers: { onChange: "on_max_rows_change" }
        },

        // Right Column: SQL Query Editor & DB Grid
        { id: "lbl_query_header", control_type: "label", x: 275, y: 112, width: 685, height: 24, text: "⚡ SQL Query Editor & Record Set Grid", font_size: 13, font_weight: "700", font_color: "#38bdf8" },

        // SQL Query Code Editor
        {
            id: "sql_code_editor",
            control_type: "form_code",
            x: 275, y: 140, width: 685, height: 125,
            text: "Active SQL Command:",
            code: "SELECT id, customer_name, email, plan, balance FROM users WHERE status = 'active' ORDER BY id ASC LIMIT 50;"
        },

        // Record Filter Search Bar
        {
            id: "table_filter_search",
            control_type: "form_search",
            x: 275, y: 275, width: 685, height: 42,
            text: "Filter Dataset Results:",
            placeholder: "Search inside query result columns...",
            event_handlers: { onChange: "on_table_filter_change" }
        },

        // DB Grid / Dataset Table View
        {
            id: "users_db_grid",
            control_type: "db_grid",
            x: 275, y: 325, width: 685, height: 190,
            text: "Dataset: users (Filtered Result Set)"
        },

        // Bottom Action Controls & Status Banners
        {
            id: "btn_run_sql",
            control_type: "button",
            x: 275, y: 525, width: 135, height: 38,
            text: "▶ Execute SQL",
            background_color: "#10b981",
            event_handlers: { onClick: "on_btn_run_sql_click" }
        },
        {
            id: "btn_toggle_pin",
            control_type: "toggle_button",
            x: 420, y: 525, width: 135, height: 38,
            text: "📌 Pin Window",
            checked: true,
            event_handlers: { onClick: "on_btn_toggle_pin_click" }
        },
        {
            id: "db_status_card",
            control_type: "alert_banner",
            x: 565, y: 525, width: 395, height: 38,
            alert_type: "success",
            text: "Query Executed: 3 rows returned in 2.1ms"
        },

        // Status Bar
        {
            id: "db_status_bar",
            control_type: "status_bar",
            x: 20, y: 585, width: 940, height: 28,
            text: "SQLite 3.45 | Connected: production.sqlite | Read/Write | Bun RAD Engine v1.3"
        }
    ]
};

console.log("⚡ Launching Bun RAD Studio Demo 10: Database Studio & SQL Query Editor...");

const htmlContent = generatePreviewHtml(dbStudioSpec);

const webview = new Webview(true, {
    width: 980,
    height: 720,
    hint: SizeHint.NONE
});

webview.title = dbStudioSpec.title;

function execJS(code: string) {
    try { webview.eval(code); } catch (e) { console.error("JS Execution Error:", e); }
}

let isWindowPinned = true;
const sqlQueries: Record<string, string> = {
    "users": "SELECT id, customer_name, email, plan, balance FROM users WHERE status = 'active' ORDER BY id ASC LIMIT 50;",
    "orders": "SELECT id, user_id, amount, status, created_at FROM orders ORDER BY created_at DESC LIMIT 50;",
    "products": "SELECT id, title, price, stock_qty, category FROM products WHERE stock_qty > 0 LIMIT 50;",
    "audit_logs": "SELECT id, timestamp, event_type, ip_address FROM audit_logs ORDER BY id DESC LIMIT 50;"
};

setAlwaysOnTopNative(webview, true);

webview.bind("toggleFullscreenBackend", () => {
    toggleFullscreenNative(webview);
});

webview.bind("quitApp", () => {
    console.log("👋 Application exit requested.");
    process.exit(0);
});

// IPC Event Handlers
webview.bind("on_db_nav_bar_click", (action?: string) => {
    const act = action || "Action";
    console.log(`[IPC] DB Navigator Click: ${act}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("db_status_bar", "Navigator Action: ${act}");
    `);
});

webview.bind("on_db_conn_change", (connName?: string) => {
    const conn = connName || "database";
    console.log(`[IPC] Connection Changed: ${conn}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("db_status_bar", "Connected to: ${conn}");
        if (window.setAlertBannerText) window.setAlertBannerText("db_status_card", "Connected to ${conn}");
    `);
});

webview.bind("on_db_toolbar_click", (action?: string) => {
    const act = action || "Action";
    console.log(`[IPC] DB Toolbar Action: ${act}`);
    execJS(`
        if (window.setAlertBannerText) window.setAlertBannerText("db_status_card", "${act} completed");
    `);
});

webview.bind("on_db_tabs_change", (tabName?: string) => {
    const tab = tabName || "Console";
    console.log(`[IPC] DB Tab Switch: ${tab}`);
    execJS(`
        if (window.setTabsActive) window.setTabsActive("db_tabs", "${tab}");
        if (window.setStatusBarText) window.setStatusBarText("db_status_bar", "View Mode: ${tab}");
    `);
});

webview.bind("on_schema_tree_select", (nodeName?: string) => {
    const rawNode = nodeName || "users";
    const tableName = rawNode.replace(/^[\s📂📁📄]+/, '').split(' ')[0];
    console.log(`[IPC] Schema Tree Selected Table: ${tableName}`);
    if (sqlQueries[tableName]) {
        const query = sqlQueries[tableName].replace(/'/g, "\\'");
        execJS(`
            const ed = document.getElementById("sql_code_editor");
            if (ed) {
                const ta = ed.querySelector("textarea");
                if (ta) ta.value = '${query}';
            }
            if (window.setAlertBannerText) window.setAlertBannerText("db_status_card", "Selected Table: ${tableName}");
            if (window.setStatusBarText) window.setStatusBarText("db_status_bar", "Querying Table: ${tableName}");
        `);
    }
});

webview.bind("on_max_rows_change", (val?: any) => {
    console.log(`[IPC] Row Limit Changed: ${val}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("db_status_bar", "Row Fetch Limit set to ${val}");
    `);
});

webview.bind("on_btn_run_sql_click", () => {
    console.log("[IPC] Executing SQL Query...");
    execJS(`
        if (window.setAlertBannerText) window.setAlertBannerText("db_status_card", "Query Executed: 3 rows in 1.8ms");
        if (window.setStatusBarText) window.setStatusBarText("db_status_bar", "Query Execution Succeeded");
    `);
});

webview.bind("on_table_filter_change", (val?: string) => {
    console.log(`[IPC] Table Result Filter: ${val}`);
    execJS(`
        if (window.setStatusBarText) window.setStatusBarText("db_status_bar", "Grid Filter: ${val || ''}");
    `);
});

webview.bind("on_btn_toggle_pin_click", () => {
    isWindowPinned = !isWindowPinned;
    console.log(`[IPC] Toggling Window Pin state: ${isWindowPinned}`);
    setAlwaysOnTopNative(webview, isWindowPinned);
    const label = isWindowPinned ? "Pinned Window" : "Unpinned Window";
    execJS(`
        if (window.setToggleButtonState) window.setToggleButtonState("btn_toggle_pin", ${isWindowPinned}, "${label}");
        if (window.setStatusBarText) window.setStatusBarText("db_status_bar", "${isWindowPinned ? "Window Pinned Always On Top" : "Window Unpinned"}");
    `);
});

webview.setHTML(htmlContent);

webview.run();
