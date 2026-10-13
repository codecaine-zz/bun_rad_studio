/**
 * ⚡ Bun RAD Studio - Postgres Studio Pro
 * 
 * Enterprise-Grade Embedded PostgreSQL Database Workstation & Query IDE
 * Powered by 100% native Bun SQL PostgreSQL client with sub-millisecond execution latency.
 * 
 * Architecture:
 * - Dedicated Background Worker & HTTP Telemetry Server (`postgres_studio_server.ts`)
 * - Native WebKit / Webview Desktop GUI with zero FFI deadlock and instant UI updates
 * - Also accessible in any browser via local workstation URL
 * 
 * Advanced PostgreSQL Features over MySQL:
 * - Schema Namespaces: Multi-schema switching (public, analytics, custom), schema creation & isolation
 * - Materialized Views: Dedicated section in Object Tree, inspection & 1-click REFRESH MATERIALIZED VIEW
 * - Extensions Manager: Browse available extensions (pg_available_extensions), 1-click install/remove
 * - Live Activity & Diagnostics: Real-time pg_stat_activity monitor with 1-click terminate & cancel
 * - Rich Native Types: UUID (gen_random_uuid), JSONB with deep inspection, native ARRAY types, TIMESTAMPTZ
 * - Visual Relational Canvas: Access-style joins, deep zoom (50%-250%), room presets & FULL OUTER JOIN Venn diagram
 * - Interactive Connection Workbench: Form/URL sync, cloud presets, live test with latency & version, .env reset
 */

import { Webview, SizeHint } from "webview-bun";
import { resolve } from "path";
import { dlopen, FFIType } from "bun:ffi";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  toggleFullscreenNative,
  attachWindowShortcuts,
} from "../index.ts";
import {
  startPostgresStudioServer,
  type PostgresConnectionConfig,
  type PostgresConnectionConfigSanitized,
} from "./postgres_studio_server.ts";

export interface PostgresStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  initialDbPath?: string;
  initialSchema?: string;
  port?: number;
  // Manual connection configuration options
  host?: string;
  pgPort?: number;
  user?: string;
  password?: string;
  database?: string;
  schema?: string;
  tls?: boolean;
  url?: string;
  config?: Partial<PostgresConnectionConfig>;
}

export type SystemStudioOptions = PostgresStudioOptions;
export type { PostgresConnectionConfig, PostgresConnectionConfigSanitized };

export interface PostgresStudioInstance {
  title: string;
  width: number;
  height: number;
  fullscreen: boolean;
  activeDbPath: string;
  activeSchema: string;
  webview?: Webview;
  server?: any;
  worker?: Worker;
  port?: number;
  url?: string;
  run: () => Promise<void> | void;
  generateHtml: () => string;
}

// -------------------------------------------------------------------------------------------------
// PostgreSQL SQL Presets Registry
// -------------------------------------------------------------------------------------------------

export const POSTGRES_SQL_PRESETS = [
  {
    name: "1. ⚡ Refresh Materialized View (Concurrent)",
    sql: "REFRESH MATERIALIZED VIEW mv_customer_monthly_revenue;\nSELECT * FROM mv_customer_monthly_revenue ORDER BY total_spend DESC;",
  },
  {
    name: "2. 🔍 JSONB Deep Querying (Operators ->> and @>)",
    sql: "SELECT \n  sku, \n  name, \n  specs->>'cores' AS cores, \n  specs->>'ram_gb' AS ram_gb\nFROM products\nWHERE specs @> '{\"cores\": 96}'::jsonb\nORDER BY price DESC;",
  },
  {
    name: "3. 📦 Native Array Operators (Tags contains 'gpu')",
    sql: "SELECT \n  name, \n  category, \n  tags, \n  price\nFROM products\nWHERE tags @> ARRAY['gpu']::text[]\nORDER BY price DESC;",
  },
  {
    name: "4. 🔀 Array Unnesting (Relational Flattening)",
    sql: "SELECT \n  name, \n  category, \n  unnest(tags) AS individual_tag\nFROM products\nLIMIT 20;",
  },
  {
    name: "5. 🌐 FULL OUTER JOIN (Postgres Native Feature)",
    sql: "SELECT \n  COALESCE(c.name, '[No Customer]') AS customer_name,\n  c.email,\n  o.order_number,\n  o.total_amount,\n  o.status\nFROM customers c\nFULL OUTER JOIN orders o ON o.customer_id = c.id\nORDER BY o.total_amount DESC NULLS LAST;",
  },
  {
    name: "6. 📊 CTE & Window Functions (Ranked VIP Spending)",
    sql: "WITH ranked_orders AS (\n  SELECT \n    c.name AS customer,\n    c.tier,\n    o.order_number,\n    o.total_amount,\n    ROW_NUMBER() OVER (PARTITION BY c.tier ORDER BY o.total_amount DESC) as tier_rank\n  FROM customers c\n  JOIN orders o ON o.customer_id = c.id\n)\nSELECT * FROM ranked_orders WHERE tier_rank <= 3;",
  },
  {
    name: "7. 🔑 UUID Generation & Type Inspection",
    sql: "SELECT \n  gen_random_uuid() AS new_v4_uuid,\n  current_database() AS database,\n  current_schema() AS schema,\n  version() AS pg_version;",
  },
  {
    name: "8. ⚡ Live Active Backend Queries (pg_stat_activity)",
    sql: "SELECT \n  pid, \n  usename, \n  datname, \n  client_addr, \n  state, \n  now() - query_start AS duration,\n  query\nFROM pg_stat_activity\nWHERE state != 'idle'\nORDER BY duration DESC;",
  },
  {
    name: "9. 📈 Table & Index Disk Bloat (pg_size_pretty)",
    sql: "SELECT \n  relname AS table_name,\n  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,\n  pg_size_pretty(pg_relation_size(relid)) AS data_size,\n  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size\nFROM pg_catalog.pg_statio_user_tables\nORDER BY pg_total_relation_size(relid) DESC;",
  },
  {
    name: "10. 🧩 Installed Extensions Catalog",
    sql: "SELECT \n  e.extname AS extension,\n  e.extversion AS version,\n  a.comment\nFROM pg_extension e\nJOIN pg_available_extensions a ON a.name = e.extname\nORDER BY e.extname ASC;",
  },
  {
    name: "11. 🔍 EXPLAIN (ANALYZE, BUFFERS, VERBOSE)",
    sql: "EXPLAIN (ANALYZE, BUFFERS, VERBOSE)\nSELECT c.name, COUNT(o.id) AS order_count, SUM(o.total_amount) AS spend\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nGROUP BY c.name\nORDER BY spend DESC NULLS LAST;",
  },
  {
    name: "12. 📜 System Schemas & Table Counts",
    sql: "SELECT \n  table_schema AS schema_name,\n  COUNT(*) AS total_tables\nFROM information_schema.tables\nGROUP BY table_schema\nORDER BY total_tables DESC;",
  },
];

// -------------------------------------------------------------------------------------------------
// Screen Dimensions Helper
// -------------------------------------------------------------------------------------------------

function getScreenDimensions(): { width: number; height: number } {
  let screenW = 1440;
  let screenH = 900;
  try {
    if (process.platform === "darwin") {
      const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
        CGMainDisplayID: { args: [], returns: FFIType.u32 },
        CGDisplayPixelsWide: { args: [FFIType.u32], returns: FFIType.u64 },
        CGDisplayPixelsHigh: { args: [FFIType.u32], returns: FFIType.u64 },
      });
      const mainId = cg.symbols.CGMainDisplayID();
      screenW = Number(cg.symbols.CGDisplayPixelsWide(mainId));
      screenH = Number(cg.symbols.CGDisplayPixelsHigh(mainId));
    } else if (process.platform === "win32") {
      const user32 = dlopen("user32.dll", {
        GetSystemMetrics: { args: [FFIType.i32], returns: FFIType.i32 },
      });
      screenW = user32.symbols.GetSystemMetrics(0);
      screenH = user32.symbols.GetSystemMetrics(1);
    }
  } catch {}
  return { width: screenW, height: screenH };
}

// -------------------------------------------------------------------------------------------------
// HTML UI Generation
// -------------------------------------------------------------------------------------------------

export function generatePostgresStudioHtml(): string {
  const presetsJson = JSON.stringify(POSTGRES_SQL_PRESETS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Postgres Studio Pro - Enterprise Database Workstation</title>
  <style>
    :root {
      --bg-base: #060b14;
      --bg-surface: #0a1120;
      --bg-card: rgba(13, 22, 40, 0.88);
      --bg-glass: rgba(19, 32, 58, 0.65);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-focus: #38bdf8;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --pg-blue: #336791;
      --pg-blue-light: #4b89bf;
      --cyan: #38bdf8;
      --cyan-glow: rgba(56, 189, 248, 0.25);
      --sapphire: #3b82f6;
      --indigo: #818cf8;
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.25);
      --amber: #f59e0b;
      --rose: #f43f5e;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    select, optgroup, option { color-scheme: dark; }
    select {
      appearance: none;
      -webkit-appearance: none;
      background-color: rgba(15, 25, 46, 0.95);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 12px 12px;
      padding-right: 30px;
      cursor: pointer;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
    }
    select:hover {
      border-color: var(--cyan);
      box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.2), 0 0 0 1px rgba(56, 189, 248, 0.15);
    }
    option, optgroup {
      background: rgba(13, 22, 40, 0.98);
      color: var(--text-main);
    }
    body {
      background-color: var(--bg-base);
      background-image: 
        radial-gradient(circle at 10% 10%, rgba(51, 103, 145, 0.15) 0%, transparent 45%),
        radial-gradient(circle at 90% 90%, rgba(16, 185, 129, 0.08) 0%, transparent 45%);
      color: var(--text-main);
      font-family: var(--font-sans);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      user-select: none;
    }

    /* Header */
    header {
      height: 56px;
      background: rgba(6, 11, 20, 0.95);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      flex-shrink: 0;
      z-index: 100;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-logo {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #336791, #38bdf8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 0 14px rgba(51, 103, 145, 0.5);
    }

    .brand-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: #fff;
    }

    .brand-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(51, 103, 145, 0.35);
      color: #7dd3fc;
      border: 1px solid rgba(56, 189, 248, 0.3);
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 12px;
      color: var(--text-main);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: var(--cyan);
    }
    .btn-primary {
      background: linear-gradient(135deg, #336791, #0284c7);
      border-color: #38bdf8;
      color: #fff;
      font-weight: 600;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #25537b, #0369a1);
      box-shadow: 0 0 14px rgba(56, 189, 248, 0.4);
    }
    .btn-sm { padding: 4px 8px; font-size: 11px; }

    /* Schema Switcher in Header */
    .schema-switcher {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(51, 103, 145, 0.18);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 6px;
      padding: 3px 8px;
    }
    .schema-switcher select {
      border: none;
      background: transparent;
      font-size: 12px;
      font-weight: 600;
      color: #7dd3fc;
      outline: none;
      box-shadow: none;
      padding-right: 22px;
    }

    /* KPI Bar */
    .kpi-bar {
      height: 40px;
      background: rgba(10, 17, 32, 0.85);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 16px;
      font-size: 11px;
      overflow-x: auto;
      flex-shrink: 0;
    }
    .kpi-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--text-muted);
      white-space: nowrap;
    }
    .kpi-value {
      font-weight: 700;
      color: var(--text-main);
      font-family: var(--font-mono);
    }
    .kpi-badge {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 6px var(--emerald-glow);
    }

    /* Workspace Body */
    .workspace {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    /* Sidebar */
    aside {
      width: 270px;
      background: rgba(10, 17, 32, 0.95);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      transition: width 0.2s ease;
    }
    aside.collapsed {
      width: 0;
      overflow: hidden;
      border-right: none;
    }

    .sidebar-header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sidebar-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
    }
    .sidebar-search {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sidebar-search input {
      width: 100%;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 5px 8px;
      color: var(--text-main);
      font-size: 11px;
      outline: none;
    }
    .sidebar-search input:focus { border-color: var(--cyan); }

    .sidebar-tree {
      flex: 1;
      overflow-y: auto;
      padding: 8px 6px;
    }
    .tree-section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-dim);
      padding: 8px 8px 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .tree-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-muted);
      transition: background 0.1s ease;
      margin-bottom: 1px;
    }
    .tree-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
    }
    .tree-item.active {
      background: rgba(51, 103, 145, 0.35);
      color: #fff;
      font-weight: 600;
      border-left: 3px solid var(--cyan);
    }
    .tree-item-name {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tree-item-badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-dim);
      font-family: var(--font-mono);
    }
    .matview-refresh-btn {
      background: transparent;
      border: none;
      color: var(--cyan);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 4px;
      opacity: 0.7;
    }
    .matview-refresh-btn:hover {
      opacity: 1;
      background: rgba(56, 189, 248, 0.15);
    }

    .sidebar-actions {
      padding: 8px 10px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      gap: 4px;
    }
    .sidebar-mini-btn {
      flex: 1;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 10px;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .sidebar-mini-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
    }

    /* Main Content Area */
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: rgba(6, 11, 20, 0.6);
    }

    /* Tabs Bar */
    .tabs-bar {
      height: 42px;
      background: rgba(10, 17, 32, 0.95);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 4px;
      overflow-x: auto;
      flex-shrink: 0;
    }
    .tab-btn {
      padding: 6px 12px;
      border-radius: 6px 6px 0 0;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid transparent;
      border-bottom: none;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }
    .tab-btn.active {
      color: #38bdf8;
      background: var(--bg-base);
      border-color: var(--border-subtle);
      border-top: 2px solid var(--cyan);
      font-weight: 600;
    }

    /* Tab Panes */
    .tab-pane {
      display: none;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
    }
    .tab-pane.active {
      display: flex;
    }

    /* SQL Editor Section */
    .editor-section {
      height: 220px;
      background: rgba(8, 14, 26, 0.95);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .editor-toolbar {
      height: 36px;
      padding: 0 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(13, 22, 40, 0.5);
    }
    .editor-textarea {
      flex: 1;
      width: 100%;
      background: transparent;
      border: none;
      padding: 10px 14px;
      color: #e2e8f0;
      font-family: var(--font-mono);
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      outline: none;
    }

    /* Data Grid */
    .grid-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }
    .grid-toolbar {
      height: 36px;
      padding: 0 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(10, 17, 32, 0.7);
      flex-shrink: 0;
    }
    .grid-scroll {
      flex: 1;
      overflow: auto;
    }
    table.data-grid {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      text-align: left;
    }
    table.data-grid th {
      position: sticky;
      top: 0;
      background: rgba(13, 22, 40, 0.98);
      padding: 8px 10px;
      font-weight: 600;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-subtle);
      border-right: 1px solid rgba(255, 255, 255, 0.04);
      white-space: nowrap;
      z-index: 10;
    }
    table.data-grid td {
      padding: 6px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      border-right: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--font-mono);
      font-size: 11px;
    }
    table.data-grid tr:hover td {
      background: rgba(51, 103, 145, 0.15);
    }

    /* Postgres Rich Type Badges */
    .cell-uuid {
      color: #38bdf8;
      font-size: 10px;
      background: rgba(56, 189, 248, 0.1);
      padding: 1px 4px;
      border-radius: 3px;
      cursor: pointer;
    }
    .cell-jsonb {
      color: #f59e0b;
      background: rgba(245, 158, 11, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid rgba(245, 158, 11, 0.25);
    }
    .cell-jsonb:hover {
      background: rgba(245, 158, 11, 0.2);
    }
    .cell-array {
      color: #a78bfa;
      background: rgba(167, 139, 250, 0.1);
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 10px;
    }
    .cell-null {
      color: var(--text-dim);
      font-style: italic;
    }

    /* Visual Query Designer Ribbon & Canvas */
    .qbe-ribbon {
      background: rgba(10, 17, 32, 0.95);
      border-bottom: 1px solid var(--border-subtle);
      padding: 8px 12px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }
    .qbe-ribbon-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .qbe-view-switch {
      display: flex;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 2px;
    }
    .qbe-view-btn {
      padding: 4px 10px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 500;
      border-radius: 4px;
      cursor: pointer;
    }
    .qbe-view-btn.active {
      background: var(--pg-blue);
      color: #fff;
      font-weight: 600;
    }

    .qbe-viewport {
      flex: 1;
      overflow: auto;
      position: relative;
      background-color: #060b14;
      background-image: 
        radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .qbe-canvas-stage {
      position: relative;
      min-width: 2200px;
      min-height: 1400px;
      transform-origin: 0 0;
    }
    .qbe-svg-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 5;
    }

    /* Table Cards on Canvas */
    .qbe-table-card {
      position: absolute;
      width: 230px;
      background: rgba(13, 22, 40, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      z-index: 10;
      overflow: hidden;
    }
    .qbe-table-card-header {
      background: linear-gradient(135deg, rgba(51, 103, 145, 0.7), rgba(2, 132, 199, 0.5));
      padding: 7px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: move;
      border-bottom: 1px solid var(--border-subtle);
    }
    .qbe-table-card-fields {
      max-height: 220px;
      overflow-y: auto;
      padding: 4px 0;
    }
    .qbe-field-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 10px;
      font-size: 11px;
      color: var(--text-muted);
      cursor: pointer;
    }
    .qbe-field-row:hover {
      background: rgba(56, 189, 248, 0.15);
      color: var(--text-main);
    }
    .qbe-field-connector {
      color: var(--cyan);
      font-size: 9px;
      margin-right: 4px;
    }

    /* Lower QBE Matrix Grid */
    .qbe-lower-pane {
      height: 250px;
      background: rgba(10, 17, 32, 0.98);
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .qbe-matrix-container {
      flex: 1;
      overflow: auto;
    }
    table.qbe-matrix {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    table.qbe-matrix td {
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 4px 6px;
    }
    .qbe-matrix-header-cell {
      width: 90px;
      background: rgba(13, 22, 40, 0.95);
      font-weight: 700;
      color: var(--text-dim);
      text-transform: uppercase;
      font-size: 10px;
      white-space: nowrap;
    }
    .qbe-matrix-col-cell select, .qbe-matrix-col-cell input {
      width: 100%;
      background: transparent;
      border: none;
      color: var(--text-main);
      font-size: 11px;
      outline: none;
    }

    /* Extensions Manager Tab */
    .ext-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 12px;
      padding: 16px;
      overflow-y: auto;
    }
    .ext-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: all 0.15s ease;
    }
    .ext-card:hover {
      border-color: var(--cyan);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .ext-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ext-name {
      font-weight: 700;
      font-size: 13px;
      color: #fff;
    }
    .ext-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
      flex: 1;
    }
    .ext-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--text-dim);
      font-family: var(--font-mono);
      margin-top: 4px;
    }

    /* Activity Monitor Tab */
    .activity-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .activity-toolbar {
      padding: 8px 14px;
      background: rgba(10, 17, 32, 0.9);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .state-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .state-active { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .state-idle { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
    .state-idle-txn { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }

    /* Modals & Dialogs */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal-card {
      background: rgba(13, 22, 40, 0.98);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.8);
      width: 90%;
      max-width: 680px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .modal-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-title {
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 16px;
      cursor: pointer;
    }
    .modal-close:hover { color: #fff; }
    .modal-body {
      padding: 16px 20px;
      overflow-y: auto;
      max-height: 70vh;
    }
    .modal-footer {
      padding: 12px 18px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      background: rgba(8, 14, 26, 0.5);
    }

    /* Toast notification */
    #toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(13, 22, 40, 0.95);
      border: 1px solid var(--cyan);
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 12px;
      display: none;
      z-index: 2000;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body>

  <!-- Top Header Bar -->
  <header>
    <div class="brand">
      <div class="brand-logo">🐘</div>
      <div>
        <div class="brand-title">Postgres Studio Pro</div>
      </div>
      <span class="brand-badge" id="pgVersionBadge">PG 18.6 Enterprise</span>
      <span class="brand-badge" id="connSourceBadge" style="text-transform: uppercase;">ENV</span>
    </div>

    <!-- Active Schema Switcher -->
    <div class="schema-switcher" title="Active Schema Namespace (search_path)">
      <span style="font-size: 11px; color: var(--text-dim);">Schema:</span>
      <select id="schemaSelect" onchange="handleSchemaSwitch(this.value)">
        <option value="public">public</option>
      </select>
      <button class="btn btn-sm" onclick="openCreateSchemaModal()" title="Create New PostgreSQL Schema" style="padding: 1px 6px; font-size: 11px;">+ New</button>
    </div>

    <!-- Action Toolbar -->
    <div class="header-actions">
      <button class="btn" onclick="openConnectionModal()" title="Configure manual host/credentials or switch databases">🔌 Connection Config...</button>
      <button class="btn" onclick="openDatabaseBrowser()" title="Browse and switch server databases">📂 Databases...</button>
      <button class="btn" onclick="seedSampleDatabase()" title="Create rich PostgreSQL sample tables with UUID, JSONB, native Arrays and Materialized Views">🌱 Seed Sample DB</button>
      <button class="btn" onclick="triggerVacuumAnalyze()" title="Run VACUUM ANALYZE to reclaim storage and update planner statistics">🧹 VACUUM ANALYZE</button>
      <button class="btn btn-primary" onclick="executeCurrentQuery()">▶ Run SQL (Cmd+Enter)</button>
    </div>
  </header>

  <!-- Live KPI Bar -->
  <div class="kpi-bar">
    <div class="kpi-item">
      <span class="kpi-badge"></span>
      <span>Database:</span>
      <span class="kpi-value" id="kpiDbName">mydb</span>
    </div>
    <div class="kpi-item">
      <span>Latency:</span>
      <span class="kpi-value" id="kpiLatency">0.4ms</span>
    </div>
    <div class="kpi-item">
      <span>Connections:</span>
      <span class="kpi-value" id="kpiConnections">1</span>
    </div>
    <div class="kpi-item">
      <span>Tables:</span>
      <span class="kpi-value" id="kpiTables">0</span>
    </div>
    <div class="kpi-item">
      <span>Views:</span>
      <span class="kpi-value" id="kpiViews">0</span>
    </div>
    <div class="kpi-item">
      <span style="color: var(--cyan);">⚡ MatViews:</span>
      <span class="kpi-value" id="kpiMatViews" style="color: var(--cyan);">0</span>
    </div>
    <div class="kpi-item">
      <span>Total Rows:</span>
      <span class="kpi-value" id="kpiRows">0</span>
    </div>
    <div class="kpi-item">
      <span>Shared Buffers:</span>
      <span class="kpi-value" id="kpiBuffers">128MB</span>
    </div>
  </div>

  <!-- Workspace Body -->
  <div class="workspace">
    <!-- Left Object Explorer Sidebar -->
    <aside id="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">🐘 PostgreSQL Explorer</span>
        <button class="sidebar-mini-btn" onclick="loadSchema()" title="Refresh Explorer">🔄</button>
      </div>

      <div class="sidebar-search">
        <input type="text" placeholder="Filter tables, views, matviews..." oninput="filterSidebarTree(this.value)">
      </div>

      <div class="sidebar-tree" id="sidebarTree">
        <!-- Tables Section -->
        <div class="tree-section-title">
          <span>📋 Tables</span>
          <span id="sidebarTableCount" class="tree-item-badge">0</span>
        </div>
        <div id="sidebarTablesList"></div>

        <!-- Materialized Views Section (Postgres Special) -->
        <div class="tree-section-title" style="color: var(--cyan);">
          <span>⚡ Materialized Views</span>
          <span id="sidebarMatViewCount" class="tree-item-badge">0</span>
        </div>
        <div id="sidebarMatViewsList"></div>

        <!-- Standard Views Section -->
        <div class="tree-section-title">
          <span>👁️ Standard Views</span>
          <span id="sidebarViewCount" class="tree-item-badge">0</span>
        </div>
        <div id="sidebarViewsList"></div>

        <!-- Extensions Summary -->
        <div class="tree-section-title" style="margin-top: 8px;">
          <span>🧩 Extensions</span>
          <button class="sidebar-mini-btn" onclick="switchTab('extensions')" style="padding: 1px 6px;">Manage</button>
        </div>
        <div style="padding: 4px 8px; font-size: 11px; color: var(--text-dim);" id="sidebarExtSummary">
          Click Manage to view pg_available_extensions
        </div>
      </div>

      <div class="sidebar-actions">
        <button class="sidebar-mini-btn" onclick="openCreateSchemaModal()">+ Schema</button>
        <button class="sidebar-mini-btn" onclick="openCreateTableModal()">+ Table</button>
        <button class="sidebar-mini-btn" onclick="toggleSidebarCollapse()">◀▶ Fold</button>
      </div>
    </aside>

    <!-- Main Workstation View Area -->
    <main>
      <!-- Workstation Navigation Tabs -->
      <div class="tabs-bar">
        <div class="tab-btn active" id="tabBtnGrid" onclick="switchTab('grid')">📊 Data Grid</div>
        <div class="tab-btn" id="tabBtnSql" onclick="switchTab('sql')">⚡ SQL Query IDE</div>
        <div class="tab-btn" id="tabBtnDesigner" onclick="switchTab('designer')">📐 Visual Query Designer</div>
        <div class="tab-btn" id="tabBtnExtensions" onclick="switchTab('extensions')">🧩 Extensions Manager</div>
        <div class="tab-btn" id="tabBtnActivity" onclick="switchTab('activity')">⚡ Live Activity Monitor</div>
        <div class="tab-btn" id="tabBtnExplain" onclick="switchTab('explain')">🔍 Query Plan (EXPLAIN)</div>
        <div class="tab-btn" id="tabBtnJson" onclick="switchTab('json')">💻 Raw JSON Inspector</div>
      </div>

      <!-- TAB 1: Tabular Data Grid -->
      <div class="tab-pane active" id="tabGrid">
        <div class="grid-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--cyan);" id="gridTargetTitle">No table selected</span>
            <input type="text" id="gridSearchInput" placeholder="Search rows..." oninput="onGridSearch(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 3px 8px; color: #fff; font-size: 11px; outline: none; width: 140px;">
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="gridPageInfo" style="font-size: 11px; color: var(--text-dim);">Page 1 of 1</span>
            <button class="btn btn-sm" onclick="gridChangePage(-1)">◀ Prev</button>
            <button class="btn btn-sm" onclick="gridChangePage(1)">Next ▶</button>
            <button class="btn btn-sm" onclick="exportGridData('csv')">CSV</button>
            <button class="btn btn-sm" onclick="exportGridData('json')">JSON</button>
          </div>
        </div>
        <div class="grid-scroll" id="gridTableContainer">
          <table class="data-grid" id="mainDataGrid">
            <thead><tr id="gridHeaderRow"><th>Status</th></tr></thead>
            <tbody id="gridBody"><tr><td>Select a table from the sidebar or run a query.</td></tr></tbody>
          </table>
        </div>
      </div>

      <!-- TAB 2: SQL Query IDE -->
      <div class="tab-pane" id="tabSql">
        <div class="editor-section">
          <div class="editor-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; font-size: 11px; color: var(--cyan);">PostgreSQL Query IDE</span>
              <select onchange="applySqlPreset(this.value)" style="max-width: 280px; font-size: 11px; padding: 2px 20px 2px 6px;">
                <option value="">⚡ PostgreSQL Presets &amp; Templates...</option>
                ${POSTGRES_SQL_PRESETS.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
              </select>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <button class="btn btn-sm" onclick="clearSqlEditor()">Clear</button>
              <button class="btn btn-sm" onclick="explainCurrentQuery()">Explain</button>
              <button class="btn btn-sm btn-primary" onclick="executeCurrentQuery()">▶ Execute</button>
            </div>
          </div>
          <textarea class="editor-textarea" id="sqlEditorTextarea" spellcheck="false" placeholder="Enter PostgreSQL SQL queries here... (Press Cmd+Enter or Ctrl+Enter to execute)">SELECT * FROM products LIMIT 25;</textarea>
        </div>
        <div class="grid-container">
          <div class="grid-toolbar">
            <span style="font-size: 11px; color: var(--text-muted);" id="sqlResultStatus">Ready.</span>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm" onclick="copySqlResultsMarkdown()">📋 Markdown</button>
              <button class="btn btn-sm" onclick="exportSqlResultsCsv()">Export CSV</button>
            </div>
          </div>
          <div class="grid-scroll">
            <table class="data-grid" id="sqlResultsGrid">
              <thead><tr id="sqlResultsHeaderRow"><th>Results</th></tr></thead>
              <tbody id="sqlResultsBody"><tr><td style="color: var(--text-dim);">No query executed yet.</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: Visual Query Designer (Access Style Relational Canvas) -->
      <div class="tab-pane" id="tabDesigner">
        <div class="qbe-ribbon">
          <div class="qbe-ribbon-group">
            <div class="qbe-view-switch">
              <button class="qbe-view-btn active" id="btnDesignerDesign" onclick="setDesignerActiveView('design')">📐 Design</button>
              <button class="qbe-view-btn" id="btnDesignerSql" onclick="setDesignerActiveView('sql')">💻 SQL</button>
              <button class="qbe-view-btn" id="btnDesignerDatasheet" onclick="setDesignerActiveView('datasheet')">📋 Datasheet</button>
            </div>
            <div style="width: 1px; height: 18px; background: var(--border-subtle); margin: 0 4px;"></div>
            <button class="btn btn-sm btn-primary" onclick="runDesignerQuery()">! Run</button>
            <button class="btn btn-sm" id="btnDesignerTotals" onclick="toggleDesignerTotals()">Σ Totals</button>
            <button class="btn btn-sm" id="btnDesignerDistinct" onclick="toggleDesignerDistinct()">Distinct</button>
            <select class="btn btn-sm" onchange="applyDesignerPreset(this.value); this.value='';" style="color: var(--amber);">
              <option value="">⚡ Relational Presets</option>
              <option value="ecommerce_4table">🛒 4-Table Full Relational (Customers + Orders + Items + Products)</option>
              <option value="vip_customers">👑 VIP High-Spend Customers</option>
              <option value="full_join">🌐 FULL OUTER JOIN (Postgres Native)</option>
              <option value="reset">Clear Canvas</option>
            </select>
          </div>
          <div class="qbe-ribbon-group">
            <select id="designerTablePicker" style="max-width: 160px; font-size: 11px;">
              <option value="">+ Add Table / View</option>
            </select>
            <button class="btn btn-sm" onclick="addDesignerTableFromPicker()">Add</button>
            <button class="btn btn-sm" onclick="openJoinPropertiesModal()">+ Link / Join</button>
            <button class="btn btn-sm" onclick="autoJoinDesignerTables()" title="Auto-detect relationships from Foreign Keys">⚡ Auto-Joins</button>
            <button class="btn btn-sm" onclick="autoArrangeDesignerTables()">📐 Arrange</button>
            <button class="btn btn-sm" onclick="addDesignerQbeColumn()">+ Column</button>
            <button class="btn btn-sm" onclick="toggleSidebarCollapse()">◀▶ Sidebar</button>
          </div>
        </div>

        <!-- Designer Main Content Area -->
        <div id="designerContainer" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative;">
          <!-- Loaded dynamically: Viewport, Canvas, and Lower QBE Matrix -->
        </div>
      </div>

      <!-- TAB 4: Extensions Manager (Postgres Specialty) -->
      <div class="tab-pane" id="tabExtensions">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--cyan);">PostgreSQL Extensions Catalog (pg_available_extensions)</span>
            <input type="text" id="extSearchInput" placeholder="Filter extensions (e.g. uuid, trgm, vector)..." oninput="filterExtensions(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px; width: 220px; outline: none;">
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="setExtensionsFilter('all')" id="btnExtFilterAll">All</button>
            <button class="btn btn-sm btn-primary" onclick="setExtensionsFilter('installed')" id="btnExtFilterInstalled">Installed Only</button>
            <button class="btn btn-sm" onclick="loadExtensions()">🔄 Refresh</button>
          </div>
        </div>
        <div class="ext-grid" id="extensionsGrid">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- TAB 5: Live Activity Monitor (Postgres Specialty) -->
      <div class="tab-pane" id="tabActivity">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--emerald);">Live Sessions &amp; Processes (pg_stat_activity)</span>
            <span id="activityCountBadge" class="brand-badge">0 active</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 4px;">
              <input type="checkbox" id="chkAutoRefreshActivity" onchange="toggleActivityAutoRefresh(this.checked)">
              <span>Auto-refresh (3s)</span>
            </label>
            <button class="btn btn-sm" onclick="loadActivity()">🔄 Refresh Now</button>
          </div>
        </div>
        <div class="grid-scroll">
          <table class="data-grid" id="activityGrid">
            <thead>
              <tr>
                <th style="width: 70px;">PID</th>
                <th style="width: 90px;">User</th>
                <th style="width: 100px;">Database</th>
                <th style="width: 100px;">Client</th>
                <th style="width: 120px;">State</th>
                <th style="width: 100px;">Duration</th>
                <th>Current Query</th>
                <th style="width: 140px; text-align: center;">Actions</th>
              </tr>
            </thead>
            <tbody id="activityBody">
              <tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">Loading PostgreSQL processes...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB 6: Query Plan Visualizer -->
      <div class="tab-pane" id="tabExplain">
        <div class="activity-toolbar">
          <span style="font-weight: 700; color: var(--cyan);">PostgreSQL Execution Plan (EXPLAIN ANALYZE, BUFFERS)</span>
          <button class="btn btn-sm btn-primary" onclick="explainCurrentQuery()">Re-run Explain</button>
        </div>
        <div style="flex: 1; padding: 16px; overflow: auto;">
          <div class="modal-card" style="max-width: 100%; border: 1px solid var(--border-subtle); padding: 14px; background: rgba(8, 14, 26, 0.8);">
            <pre id="explainOutput" style="font-family: var(--font-mono); font-size: 12px; color: #a5f3fc; line-height: 1.6; white-space: pre-wrap;">Run "Explain" on any SQL query to visualize the execution plan tree, actual vs estimated row counts, cost metrics, and buffer cache hits.</pre>
          </div>
        </div>
      </div>

      <!-- TAB 7: Raw JSON Inspector -->
      <div class="tab-pane" id="tabJson">
        <div class="activity-toolbar">
          <span style="font-weight: 700; color: var(--amber);">Raw JSON Telemetry Inspector</span>
          <button class="btn btn-sm" onclick="copyJsonInspector()">📋 Copy JSON</button>
        </div>
        <div style="flex: 1; padding: 14px; overflow: auto;">
          <pre id="rawJsonBox" style="font-family: var(--font-mono); font-size: 12px; color: #fde68a; line-height: 1.5; white-space: pre-wrap;">{\n  "status": "ready"\n}</pre>
        </div>
      </div>
    </main>
  </div>

  <!-- MODAL: PostgreSQL Connection & Database Manager -->
  <div class="modal-overlay" id="connModal" onclick="if(event.target === this) closeConnectionModal()">
    <div class="modal-card" style="max-width: 740px;">
      <div class="modal-header">
        <div class="modal-title">
          <span>🔌</span>
          <span>PostgreSQL Connection &amp; Database Manager</span>
          <span id="modalConnBadge" class="brand-badge">ENV</span>
        </div>
        <button class="modal-close" onclick="closeConnectionModal()">✕</button>
      </div>

      <!-- Modal Sub-Tabs -->
      <div style="display: flex; gap: 4px; padding: 10px 18px 0; background: rgba(0,0,0,0.25); border-bottom: 1px solid var(--border-subtle);">
        <button class="tab-btn active" id="btnModalTabConfig" onclick="switchModalTab('config')">🔌 Manual Config</button>
        <button class="tab-btn" id="btnModalTabDatabases" onclick="switchModalTab('databases')">🗄️ Server Databases</button>
        <button class="tab-btn" id="btnModalTabProfiles" onclick="switchModalTab('profiles')">💾 Saved Profiles</button>
      </div>

      <div class="modal-body" style="padding: 16px 20px; gap: 14px;">
        <!-- TAB 1: Manual Config -->
        <div id="panelModalConfig">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 11px; color: var(--text-dim);">
              Configure PostgreSQL host, port, credentials, database and schema directly without needing <code>.env</code>.
            </div>
            <div style="display: flex; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 2px;">
              <button class="btn btn-sm btn-primary" id="btnModeForm" onclick="setConnInputMode('form')">📋 Form</button>
              <button class="btn btn-sm" id="btnModeUrl" onclick="setConnInputMode('url')">🔗 URL</button>
            </div>
          </div>

          <!-- Presets Bar -->
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid var(--border-subtle);">
            <span style="font-size: 10px; font-weight: 700; color: var(--text-dim);">Presets:</span>
            <button class="sidebar-mini-btn" onclick="applyPgConnPreset('localhost')">🏠 Localhost (5432)</button>
            <button class="sidebar-mini-btn" onclick="applyPgConnPreset('docker')">🐳 Docker (127.0.0.1:5432)</button>
            <button class="sidebar-mini-btn" onclick="applyPgConnPreset('alt_port')">🔌 Port 5433</button>
            <button class="sidebar-mini-btn" onclick="applyPgConnPreset('cloud')">☁️ Cloud (Supabase/Neon)</button>
            <button class="sidebar-mini-btn" onclick="resetToEnvConfig()" style="color: var(--amber);" title="Restore configuration from current .env file">↺ Reset to .env</button>
          </div>

          <!-- Form Fields Container -->
          <div id="connModeFormContainer">
            <div style="display: grid; grid-template-columns: 1fr 120px; gap: 10px; margin-bottom: 10px;">
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Host / IP</label>
                <input type="text" id="cfgHost" class="qbe-input" placeholder="localhost or 127.0.0.1" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 10px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
              </div>
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Port</label>
                <input type="number" id="cfgPort" class="qbe-input" placeholder="5432" value="5432" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 10px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Username</label>
                <input type="text" id="cfgUser" class="qbe-input" placeholder="postgres" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 10px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
              </div>
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Password</label>
                <div style="position: relative;">
                  <input type="password" id="cfgPass" class="qbe-input" placeholder="Password (blank if none)" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 32px 7px 10px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
                  <button type="button" onclick="togglePasswordVisibility()" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; color: var(--text-dim);">👁️</button>
                </div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Database</label>
                <input type="text" id="cfgDb" class="qbe-input" placeholder="mydb" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 10px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
              </div>
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Default Schema</label>
                <input type="text" id="cfgSchema" class="qbe-input" placeholder="public" value="public" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 10px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
              </div>
            </div>

            <div style="margin-bottom: 12px;">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted); cursor: pointer;">
                <input type="checkbox" id="cfgTls" onchange="syncFieldsToUrl()">
                <span>Enable SSL / TLS Encryption (sslmode=require)</span>
              </label>
            </div>
          </div>

          <!-- URL Mode Container -->
          <div id="connModeUrlContainer" style="display: none; margin-bottom: 12px;">
            <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">PostgreSQL Connection URL</label>
            <input type="text" id="cfgUrl" class="qbe-input" placeholder="postgresql://user:password@localhost:5432/mydb?schema=public&sslmode=prefer" oninput="parseUrlIntoFields(this.value)" style="width: 100%; padding: 8px 10px; font-family: var(--font-mono); font-size: 11px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
          </div>

          <!-- Live Test Diagnostic Banner -->
          <div id="connTestResult" style="display: none; border-radius: 6px; padding: 8px 12px; font-size: 11px; margin-bottom: 12px; line-height: 1.5;"></div>

          <!-- Actions Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm" onclick="testManualConnection()">⚡ Test Connection</button>
              <button class="btn btn-sm" onclick="promptSaveProfile()">💾 Save Profile</button>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-sm" onclick="closeConnectionModal()">Cancel</button>
              <button class="btn btn-sm btn-primary" onclick="applyManualConnection()">🔌 Connect &amp; Apply</button>
            </div>
          </div>
        </div>

        <!-- TAB 2: Server Databases -->
        <div id="panelModalDatabases" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 11px; color: var(--text-dim);">Databases on active PostgreSQL cluster:</span>
            <button class="sidebar-mini-btn" onclick="loadServerDatabases()">🔄 Refresh List</button>
          </div>
          <div id="serverDatabasesList" style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; margin-bottom: 14px;"></div>

          <div style="border-top: 1px solid var(--border-subtle); padding-top: 12px;">
            <div style="font-size: 11px; font-weight: 600; margin-bottom: 6px;">➕ Create New Database on Cluster</div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="txtNewDbName" placeholder="new_database_name" style="flex: 1; padding: 6px 10px; font-size: 11px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
              <button class="btn btn-sm btn-primary" onclick="handleCreateDatabase()">Create &amp; Switch</button>
            </div>
          </div>
        </div>

        <!-- TAB 3: Saved Profiles -->
        <div id="panelModalProfiles" style="display: none;">
          <div id="profilesList" style="display: flex; flex-direction: column; gap: 6px; max-height: 250px; overflow-y: auto;"></div>
        </div>
      </div>
    </div>
  </div>

  <!-- MODAL: Create New PostgreSQL Schema -->
  <div class="modal-overlay" id="createSchemaModal" onclick="if(event.target === this) closeCreateSchemaModal()">
    <div class="modal-card" style="max-width: 440px;">
      <div class="modal-header">
        <div class="modal-title"><span>🏛️</span><span>Create PostgreSQL Schema</span></div>
        <button class="modal-close" onclick="closeCreateSchemaModal()">✕</button>
      </div>
      <div class="modal-body">
        <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Schema Name</label>
        <input type="text" id="txtNewSchemaName" placeholder="e.g. analytics, staging, auth" style="width: 100%; padding: 8px 10px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; outline: none;">
        <div style="font-size: 10px; color: var(--text-dim); margin-top: 6px;">Executes: <code>CREATE SCHEMA "name";</code></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm" onclick="closeCreateSchemaModal()">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="submitCreateSchema()">Create Schema</button>
      </div>
    </div>
  </div>

  <!-- MODAL: JSONB Deep Inspector -->
  <div class="modal-overlay" id="jsonbModal" onclick="if(event.target === this) closeJsonbModal()">
    <div class="modal-card" style="max-width: 600px;">
      <div class="modal-header">
        <div class="modal-title"><span>📦</span><span id="jsonbModalTitle">JSONB Object Inspector</span></div>
        <button class="modal-close" onclick="closeJsonbModal()">✕</button>
      </div>
      <div class="modal-body">
        <pre id="jsonbModalContent" style="font-family: var(--font-mono); font-size: 12px; color: #fde68a; line-height: 1.5; white-space: pre-wrap; max-height: 380px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle);"></pre>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm" onclick="copyJsonbContent()">📋 Copy JSON</button>
        <button class="btn btn-sm btn-primary" onclick="closeJsonbModal()">Done</button>
      </div>
    </div>
  </div>

  <!-- MODAL: Venn Diagram Join Properties Dialog -->
  <div class="modal-overlay" id="joinPropertiesModal" onclick="if(event.target === this) closeJoinPropertiesModal()">
    <div class="modal-card" style="max-width: 580px;">
      <div class="modal-header">
        <div class="modal-title"><span>📐</span><span>Join Properties (Microsoft Access Style)</span></div>
        <button class="modal-close" onclick="closeJoinPropertiesModal()">✕</button>
      </div>
      <div class="modal-body" style="gap: 12px; display: flex; flex-direction: column;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">Left Table</label>
            <select id="joinLeftTable" onchange="onJoinTableChange('left')" style="width: 100%; padding: 6px; font-size: 11px;"></select>
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">Right Table</label>
            <select id="joinRightTable" onchange="onJoinTableChange('right')" style="width: 100%; padding: 6px; font-size: 11px;"></select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">Left Field</label>
            <select id="joinLeftField" style="width: 100%; padding: 6px; font-size: 11px;"></select>
          </div>
          <div>
            <label style="font-size: 11px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 4px;">Right Field</label>
            <select id="joinRightField" style="width: 100%; padding: 6px; font-size: 11px;"></select>
          </div>
        </div>

        <!-- Join Type Radio Options with Venn Diagrams -->
        <div style="border-top: 1px solid var(--border-subtle); padding-top: 10px;">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-main); display: block; margin-bottom: 8px;">Relational Join Mode:</label>

          <label style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.02); margin-bottom: 4px;">
            <input type="radio" name="joinTypeRadio" value="INNER" checked>
            <span style="font-size: 11px; color: var(--text-main);"><strong>1: Only include rows where the joined fields from both tables are equal (INNER JOIN)</strong></span>
          </label>

          <label style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.02); margin-bottom: 4px;">
            <input type="radio" name="joinTypeRadio" value="LEFT">
            <span style="font-size: 11px; color: var(--text-main);"><strong>2: Include ALL records from <span id="lblLeftTableJoin">Left Table</span> and only matching records from Right Table (LEFT JOIN)</strong></span>
          </label>

          <label style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.02); margin-bottom: 4px;">
            <input type="radio" name="joinTypeRadio" value="RIGHT">
            <span style="font-size: 11px; color: var(--text-main);"><strong>3: Include ALL records from <span id="lblRightTableJoin">Right Table</span> and only matching records from Left Table (RIGHT JOIN)</strong></span>
          </label>

          <label style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); margin-bottom: 4px;">
            <input type="radio" name="joinTypeRadio" value="FULL">
            <span style="font-size: 11px; color: #7dd3fc;"><strong>4: 🐘 FULL OUTER JOIN (Postgres Native) - Include ALL records from BOTH tables whether they match or not</strong></span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-sm" onclick="closeJoinPropertiesModal()">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="submitJoinProperties()">Apply Join</button>
      </div>
    </div>
  </div>

  <!-- Toast Notification -->
  <div id="toast"></div>

  <!-- Core Interactive Script -->
  <script>
    const SQL_PRESETS = ${presetsJson};

    let currentSchema = null;
    let activeTable = null;
    let currentGridData = null;
    let gridCurrentPage = 1;
    let gridPageSize = 50;
    let gridSearchQuery = "";
    let activeExtensionsFilter = "installed";
    let allExtensions = [];
    let activityTimer = null;

    // Visual Query Designer State
    let queryDesignerState = {
      activeView: "design",
      selectedTables: [],
      tablePositions: {},
      joins: [],
      columns: [],
      showTotals: false,
      distinct: false,
      topLimit: 0,
      canvasZoom: 1.0,
      datasheet: null,
      datasheetLoading: false,
    };

    // Helper: Toast message
    function showToast(msg, duration = 3000) {
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.innerText = msg;
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, duration);
    }

    // Helper: Safe fetch API wrapper
    async function apiRequest(endpoint, method = "GET", body = null) {
      const opts = { method, headers: { "Content-Type": "application/json" } };
      if (body) opts.body = JSON.stringify(body);
      try {
        const res = await fetch(endpoint, opts);
        const data = await res.json();
        return data;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // Tab Switching
    function switchTab(tabId) {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      const btnMap = {
        grid: "tabBtnGrid",
        sql: "tabBtnSql",
        designer: "tabBtnDesigner",
        extensions: "tabBtnExtensions",
        activity: "tabBtnActivity",
        explain: "tabBtnExplain",
        json: "tabBtnJson"
      };

      const paneMap = {
        grid: "tabGrid",
        sql: "tabSql",
        designer: "tabDesigner",
        extensions: "tabExtensions",
        activity: "tabActivity",
        explain: "tabExplain",
        json: "tabJson"
      };

      if (btnMap[tabId]) document.getElementById(btnMap[tabId])?.classList.add("active");
      if (paneMap[tabId]) document.getElementById(paneMap[tabId])?.classList.add("active");

      if (tabId === "extensions") loadExtensions();
      if (tabId === "activity") loadActivity();
      if (tabId === "designer") renderQueryDesigner();
    }

    // Load KPIs & Telemetry
    async function loadKpis() {
      const res = await apiRequest("/api/kpis");
      if (res.success && res.kpis) {
        const k = res.kpis;
        document.getElementById("kpiDbName").innerText = k.dbName || "mydb";
        document.getElementById("kpiLatency").innerText = k.latencyMs + "ms";
        document.getElementById("kpiConnections").innerText = k.activeConnections || 1;
        document.getElementById("kpiTables").innerText = k.tableCount || 0;
        document.getElementById("kpiViews").innerText = k.viewCount || 0;
        document.getElementById("kpiMatViews").innerText = k.matViewCount || 0;
        document.getElementById("kpiRows").innerText = (k.totalRows || 0).toLocaleString();
        document.getElementById("kpiBuffers").innerText = k.sharedBuffers || "128MB";
        if (k.pgVersion) {
          const v = k.pgVersion.split(" ")[1] || k.pgVersion.slice(0, 14);
          document.getElementById("pgVersionBadge").innerText = "PG " + v;
        }
      }
    }

    // Load Database Schema (Tables, Views, MatViews, Schemas)
    async function loadSchema() {
      const res = await apiRequest("/api/schema");
      if (res.success) {
        currentSchema = res;
        renderSidebarTree();
        renderSchemaDropdown(res.schemas || ["public"], res.activeSchema || "public");
        loadKpis();
      } else {
        showToast("Error loading schema: " + (res.error || "Unknown error"));
      }
    }

    // Render Schema Dropdown in Header
    function renderSchemaDropdown(schemas, active) {
      const sel = document.getElementById("schemaSelect");
      if (!sel) return;
      sel.innerHTML = schemas.map(s => \`<option value="\${s}" \${s === active ? 'selected' : ''}>\${s}</option>\`).join('');
    }

    // Switch Schema
    async function handleSchemaSwitch(schema) {
      const res = await apiRequest("/api/set-schema", "POST", { schema });
      if (res.success) {
        showToast("Active schema switched to: " + schema);
        loadSchema();
      } else {
        showToast("Failed to switch schema: " + res.error);
      }
    }

    // Render Sidebar Tree
    function renderSidebarTree() {
      if (!currentSchema) return;
      const tablesList = document.getElementById("sidebarTablesList");
      const viewsList = document.getElementById("sidebarViewsList");
      const matViewsList = document.getElementById("sidebarMatViewsList");

      document.getElementById("sidebarTableCount").innerText = (currentSchema.tables || []).length;
      document.getElementById("sidebarViewCount").innerText = (currentSchema.views || []).length;
      document.getElementById("sidebarMatViewCount").innerText = (currentSchema.matviews || []).length;

      // Tables
      tablesList.innerHTML = (currentSchema.tables || []).map(t => \`
        <div class="tree-item \${activeTable === t.name ? 'active' : ''}" onclick="selectEntity('\${t.name}', 'table')">
          <div class="tree-item-name">
            <span>📋</span>
            <span>\${t.name}</span>
          </div>
          <span class="tree-item-badge">\${t.rowCount || 0}</span>
        </div>
      \`).join('') || '<div style="padding: 4px 8px; font-size: 11px; color: var(--text-dim);">No tables</div>';

      // Materialized Views (with 1-click refresh button!)
      matViewsList.innerHTML = (currentSchema.matviews || []).map(m => \`
        <div class="tree-item \${activeTable === m.name ? 'active' : ''}" onclick="selectEntity('\${m.name}', 'materialized_view')">
          <div class="tree-item-name">
            <span style="color: var(--cyan);">⚡</span>
            <span>\${m.name}</span>
          </div>
          <button class="matview-refresh-btn" onclick="event.stopPropagation(); refreshMatView('\${m.name}')" title="Refresh Materialized View">🔄</button>
        </div>
      \`).join('') || '<div style="padding: 4px 8px; font-size: 11px; color: var(--text-dim);">No materialized views</div>';

      // Standard Views
      viewsList.innerHTML = (currentSchema.views || []).map(v => \`
        <div class="tree-item \${activeTable === v.name ? 'active' : ''}" onclick="selectEntity('\${v.name}', 'view')">
          <div class="tree-item-name">
            <span>👁️</span>
            <span>\${v.name}</span>
          </div>
          <span class="tree-item-badge">view</span>
        </div>
      \`).join('') || '<div style="padding: 4px 8px; font-size: 11px; color: var(--text-dim);">No views</div>';
    }

    // Refresh Materialized View
    async function refreshMatView(name) {
      showToast("Refreshing Materialized View: " + name + "...");
      const res = await apiRequest("/api/matviews/refresh", "POST", { name, concurrently: true });
      if (res.success) {
        showToast("✓ Materialized View " + name + " refreshed!");
        loadKpis();
        if (activeTable === name) loadTableData(name);
      } else {
        // Fallback standard refresh if concurrent requires unique index
        const res2 = await apiRequest("/api/matviews/refresh", "POST", { name, concurrently: false });
        if (res2.success) {
          showToast("✓ Materialized View " + name + " refreshed!");
          loadKpis();
          if (activeTable === name) loadTableData(name);
        } else {
          showToast("Error refreshing materialized view: " + res2.error);
        }
      }
    }

    // Select Entity & Load in Data Grid
    function selectEntity(name, type) {
      activeTable = name;
      renderSidebarTree();
      document.getElementById("gridTargetTitle").innerText = name + " (" + type + ")";
      switchTab("grid");
      loadTableData(name);
    }

    // Load Table Data (Paginated & Filtered)
    async function loadTableData(tableName, page = 1) {
      gridCurrentPage = page;
      const res = await apiRequest("/api/table/data", "POST", {
        table: tableName,
        page: gridCurrentPage,
        pageSize: gridPageSize,
        search: gridSearchQuery
      });

      if (res.success) {
        currentGridData = res;
        renderGridTable(res.rows, res.columns, res.total, res.page, res.pageSize);
        document.getElementById("rawJsonBox").innerText = JSON.stringify(res, null, 2);
      } else {
        showToast("Error loading data: " + res.error);
      }
    }

    // Render Data Grid Rows with Rich PostgreSQL Type Handling
    function renderGridTable(rows, columns, total, page, pageSize) {
      const thead = document.getElementById("gridHeaderRow");
      const tbody = document.getElementById("gridBody");

      if (!columns || columns.length === 0) {
        thead.innerHTML = "<th>Status</th>";
        tbody.innerHTML = "<tr><td style='color: var(--text-dim);'>No columns found</td></tr>";
        return;
      }

      thead.innerHTML = "<th style='width: 36px; text-align: center;'>#</th>" + columns.map(c => "<th>" + c + "</th>").join('');

      if (!rows || rows.length === 0) {
        tbody.innerHTML = "<tr><td colspan='" + (columns.length + 1) + "' style='text-align: center; color: var(--text-dim); padding: 24px;'>No rows returned</td></tr>";
        return;
      }

      tbody.innerHTML = rows.map((r, idx) => {
        const rowNum = ((page - 1) * pageSize) + idx + 1;
        const cells = columns.map(c => {
          const val = r[c];
          if (val === null || val === undefined) {
            return "<td class='cell-null'>NULL</td>";
          }
          if (typeof val === "object") {
            const jsonStr = JSON.stringify(val);
            if (Array.isArray(val)) {
              return "<td><span class='cell-array'>" + escapeHtml(jsonStr) + "</span></td>";
            }
            return "<td><span class='cell-jsonb' onclick='openJsonbInspector(\\"" + c + "\\", " + escapeHtml(JSON.stringify(jsonStr)) + ")'>{JSON}</span></td>";
          }
          const str = String(val);
          // Check for UUID format
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
            return "<td><span class='cell-uuid' title='Click to copy UUID' onclick='navigator.clipboard.writeText(\\"" + str + "\\"); showToast(\\"Copied UUID!\\")'>" + str + "</span></td>";
          }
          return "<td>" + escapeHtml(str) + "</td>";
        }).join('');

        return "<tr><td style='color: var(--text-dim); text-align: center;'>" + rowNum + "</td>" + cells + "</tr>";
      }).join('');

      const totalPages = Math.ceil(total / pageSize) || 1;
      document.getElementById("gridPageInfo").innerText = "Page " + page + " of " + totalPages + " (" + total.toLocaleString() + " rows)";
    }

    function gridChangePage(delta) {
      if (!activeTable || !currentGridData) return;
      const totalPages = Math.ceil(currentGridData.total / gridPageSize) || 1;
      const newPage = gridCurrentPage + delta;
      if (newPage >= 1 && newPage <= totalPages) {
        loadTableData(activeTable, newPage);
      }
    }

    function onGridSearch(val) {
      gridSearchQuery = val;
      if (activeTable) loadTableData(activeTable, 1);
    }

    // Execute SQL in Editor
    async function executeCurrentQuery() {
      const sql = document.getElementById("sqlEditorTextarea").value.trim();
      if (!sql) return;
      document.getElementById("sqlResultStatus").innerText = "Executing query...";
      const start = performance.now();
      const res = await apiRequest("/api/query", "POST", { sql });
      const elapsed = Math.round(performance.now() - start);

      if (res.success) {
        const rows = res.rows || [];
        const cols = res.columns || (rows.length ? Object.keys(rows[0]) : []);
        document.getElementById("sqlResultStatus").innerText = "✓ Executed in " + elapsed + "ms (" + rows.length + " rows)";
        renderSqlResults(rows, cols);
        document.getElementById("rawJsonBox").innerText = JSON.stringify(res, null, 2);
        switchTab("sql");
      } else {
        document.getElementById("sqlResultStatus").innerText = "⚠️ Error: " + res.error;
        showToast("Query error: " + res.error);
      }
    }

    // Explain Current Query (EXPLAIN ANALYZE)
    async function explainCurrentQuery() {
      const sql = document.getElementById("sqlEditorTextarea").value.trim();
      if (!sql) return;
      showToast("Generating query execution plan...");
      const res = await apiRequest("/api/query", "POST", { sql: "EXPLAIN (ANALYZE, BUFFERS, VERBOSE) " + sql });
      if (res.success && res.rows) {
        const planText = res.rows.map(r => Object.values(r)[0]).join('\\n');
        document.getElementById("explainOutput").innerText = planText;
        switchTab("explain");
      } else {
        showToast("Explain error: " + (res.error || "Unknown"));
      }
    }

    function renderSqlResults(rows, cols) {
      const thead = document.getElementById("sqlResultsHeaderRow");
      const tbody = document.getElementById("sqlResultsBody");

      if (!cols.length) {
        thead.innerHTML = "<th>Result</th>";
        tbody.innerHTML = "<tr><td style='color: var(--emerald);'>Query completed successfully.</td></tr>";
        return;
      }

      thead.innerHTML = "<th style='width: 36px; text-align: center;'>#</th>" + cols.map(c => "<th>" + c + "</th>").join('');
      tbody.innerHTML = rows.map((r, idx) => {
        const cells = cols.map(c => {
          const val = r[c];
          if (val === null || val === undefined) return "<td class='cell-null'>NULL</td>";
          if (typeof val === "object") return "<td><span class='cell-jsonb'>" + escapeHtml(JSON.stringify(val)) + "</span></td>";
          return "<td>" + escapeHtml(String(val)) + "</td>";
        }).join('');
        return "<tr><td style='color: var(--text-dim); text-align: center;'>" + (idx + 1) + "</td>" + cells + "</tr>";
      }).join('');
    }

    function applySqlPreset(idx) {
      if (idx === "" || !SQL_PRESETS[idx]) return;
      document.getElementById("sqlEditorTextarea").value = SQL_PRESETS[idx].sql;
      executeCurrentQuery();
    }

    function clearSqlEditor() {
      document.getElementById("sqlEditorTextarea").value = "";
      document.getElementById("sqlEditorTextarea").focus();
    }

    // Extensions Manager Functions
    async function loadExtensions() {
      const res = await apiRequest("/api/extensions");
      if (res.success && res.extensions) {
        allExtensions = res.extensions;
        renderExtensionsGrid();
        const installedCount = allExtensions.filter(e => e.isInstalled).length;
        document.getElementById("sidebarExtSummary").innerText = installedCount + " installed / " + allExtensions.length + " available";
      }
    }

    function renderExtensionsGrid() {
      const grid = document.getElementById("extensionsGrid");
      const q = (document.getElementById("extSearchInput")?.value || "").toLowerCase();

      let list = allExtensions;
      if (activeExtensionsFilter === "installed") {
        list = list.filter(e => e.isInstalled);
      }
      if (q) {
        list = list.filter(e => e.name.toLowerCase().includes(q) || (e.comment || "").toLowerCase().includes(q));
      }

      grid.innerHTML = list.map(ext => \`
        <div class="ext-card">
          <div class="ext-card-header">
            <span class="ext-name">\${ext.name}</span>
            <span class="brand-badge" style="\${ext.isInstalled ? 'background: rgba(16, 185, 129, 0.25); color: #34d399; border-color: #10b981;' : 'background: rgba(255,255,255,0.05); color: var(--text-dim);'}">
              \${ext.isInstalled ? 'v' + ext.installedVersion + ' Installed' : 'Available'}
            </span>
          </div>
          <div class="ext-desc">\${ext.comment || 'No description provided.'}</div>
          <div class="ext-meta">
            <span>Default: v\${ext.defaultVersion}</span>
            <button class="btn btn-sm \${ext.isInstalled ? '' : 'btn-primary'}" onclick="toggleExtension('\${ext.name}', \${!ext.isInstalled})">
              \${ext.isInstalled ? '✕ Remove' : '+ Install'}
            </button>
          </div>
        </div>
      \`).join('') || '<div style="color: var(--text-dim); padding: 20px;">No extensions match criteria</div>';
    }

    async function toggleExtension(name, enable) {
      showToast((enable ? "Installing " : "Removing ") + name + "...");
      const res = await apiRequest("/api/extensions/toggle", "POST", { name, enable });
      if (res.success) {
        showToast("✓ Extension " + name + (enable ? " installed!" : " removed!"));
        loadExtensions();
      } else {
        showToast("Error: " + res.error);
      }
    }

    function filterExtensions(q) {
      renderExtensionsGrid();
    }

    function setExtensionsFilter(filter) {
      activeExtensionsFilter = filter;
      document.getElementById("btnExtFilterAll").className = filter === "all" ? "btn btn-sm btn-primary" : "btn btn-sm";
      document.getElementById("btnExtFilterInstalled").className = filter === "installed" ? "btn btn-sm btn-primary" : "btn btn-sm";
      renderExtensionsGrid();
    }

    // Live Activity Monitor
    async function loadActivity() {
      const res = await apiRequest("/api/activity");
      if (res.success && res.activity) {
        renderActivityGrid(res.activity);
      }
    }

    function renderActivityGrid(processes) {
      const tbody = document.getElementById("activityBody");
      document.getElementById("activityCountBadge").innerText = processes.length + " active";

      if (!processes.length) {
        tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--text-dim); padding: 20px;'>No active processes</td></tr>";
        return;
      }

      tbody.innerHTML = processes.map(p => {
        const stateClass = p.state === "active" ? "state-active" : (p.state.includes("txn") ? "state-idle-txn" : "state-idle");
        return \`
          <tr>
            <td style="font-family: var(--font-mono); color: var(--cyan);">\${p.pid}</td>
            <td>\${p.usename || 'postgres'}</td>
            <td>\${p.datname || '-'}</td>
            <td>\${p.client_addr || 'local'}</td>
            <td><span class="state-badge \${stateClass}">\${p.state || 'active'}</span></td>
            <td style="font-family: var(--font-mono); color: var(--amber);">\${p.duration || '0s'}</td>
            <td style="font-family: var(--font-mono); max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${escapeHtml(p.query || '-')}</td>
            <td style="text-align: center; display: flex; gap: 4px; justify-content: center;">
              <button class="btn btn-sm" onclick="cancelProcess(\${p.pid})" title="Cancel Query (pg_cancel_backend)">🛑 Cancel</button>
              <button class="btn btn-sm" onclick="terminateProcess(\${p.pid})" title="Terminate Connection (pg_terminate_backend)" style="color: var(--rose);">⚡ Kill</button>
            </td>
          </tr>
        \`;
      }).join('');
    }

    async function cancelProcess(pid) {
      const res = await apiRequest("/api/activity/cancel", "POST", { pid });
      if (res.success) {
        showToast("Query canceled for PID: " + pid);
        loadActivity();
      } else {
        showToast("Error canceling query: " + res.error);
      }
    }

    async function terminateProcess(pid) {
      const res = await apiRequest("/api/activity/terminate", "POST", { pid });
      if (res.success) {
        showToast("Process terminated for PID: " + pid);
        loadActivity();
      } else {
        showToast("Error terminating process: " + res.error);
      }
    }

    function toggleActivityAutoRefresh(enabled) {
      if (activityTimer) clearInterval(activityTimer);
      if (enabled) {
        activityTimer = setInterval(loadActivity, 3000);
      }
    }

    // VACUUM ANALYZE
    async function triggerVacuumAnalyze() {
      showToast("Running VACUUM ANALYZE on PostgreSQL cluster...");
      const res = await apiRequest("/api/vacuum", "POST", { full: false, analyze: true });
      if (res.success) {
        showToast("✓ VACUUM ANALYZE completed successfully!");
        loadKpis();
      } else {
        showToast("Error during VACUUM: " + res.error);
      }
    }

    // Seed Sample Database
    async function seedSampleDatabase() {
      if (!confirm("Seed rich PostgreSQL sample dataset (UUIDs, JSONB, native Arrays, Products, Customers, Orders, Materialized Views)?")) return;
      showToast("Seeding rich PostgreSQL dataset...");
      const res = await apiRequest("/api/seed-sample", "POST");
      if (res.success) {
        showToast("✓ PostgreSQL sample database seeded successfully!");
        loadSchema();
      } else {
        showToast("Seed error: " + res.error);
      }
    }

    // JSONB Inspector Modal
    let activeJsonbString = "";
    function openJsonbInspector(columnName, jsonStr) {
      activeJsonbString = jsonStr;
      document.getElementById("jsonbModalTitle").innerText = "JSONB Column: " + columnName;
      try {
        const parsed = JSON.parse(jsonStr);
        document.getElementById("jsonbModalContent").innerText = JSON.stringify(parsed, null, 2);
      } catch {
        document.getElementById("jsonbModalContent").innerText = jsonStr;
      }
      document.getElementById("jsonbModal").classList.add("active");
    }

    function closeJsonbModal() {
      document.getElementById("jsonbModal").classList.remove("active");
    }

    function copyJsonbContent() {
      navigator.clipboard.writeText(activeJsonbString);
      showToast("Copied JSON to clipboard!");
    }

    // Create Schema Modal
    function openCreateSchemaModal() {
      document.getElementById("txtNewSchemaName").value = "";
      document.getElementById("createSchemaModal").classList.add("active");
      setTimeout(() => document.getElementById("txtNewSchemaName").focus(), 50);
    }

    function closeCreateSchemaModal() {
      document.getElementById("createSchemaModal").classList.remove("active");
    }

    async function submitCreateSchema() {
      const name = document.getElementById("txtNewSchemaName").value.trim();
      if (!name) return;
      const res = await apiRequest("/api/create-schema", "POST", { name });
      if (res.success) {
        showToast("✓ Schema '" + name + "' created!");
        closeCreateSchemaModal();
        loadSchema();
      } else {
        showToast("Error creating schema: " + res.error);
      }
    }

    // Connection Configuration Modal Handling
    function openConnectionModal() {
      loadConnectionConfig();
      document.getElementById("connModal").classList.add("active");
    }

    function closeConnectionModal() {
      document.getElementById("connModal").classList.remove("active");
    }

    function switchModalTab(tabId) {
      document.getElementById("btnModalTabConfig").classList.remove("active");
      document.getElementById("btnModalTabDatabases").classList.remove("active");
      document.getElementById("btnModalTabProfiles").classList.remove("active");

      document.getElementById("panelModalConfig").style.display = "none";
      document.getElementById("panelModalDatabases").style.display = "none";
      document.getElementById("panelModalProfiles").style.display = "none";

      if (tabId === "config") {
        document.getElementById("btnModalTabConfig").classList.add("active");
        document.getElementById("panelModalConfig").style.display = "block";
      } else if (tabId === "databases") {
        document.getElementById("btnModalTabDatabases").classList.add("active");
        document.getElementById("panelModalDatabases").style.display = "block";
        loadServerDatabases();
      } else if (tabId === "profiles") {
        document.getElementById("btnModalTabProfiles").classList.add("active");
        document.getElementById("panelModalProfiles").style.display = "block";
        renderProfilesList();
      }
    }

    async function loadConnectionConfig() {
      const res = await apiRequest("/api/config");
      if (res.success && res.config) {
        const c = res.config;
        document.getElementById("cfgHost").value = c.host || "localhost";
        document.getElementById("cfgPort").value = c.port || 5432;
        document.getElementById("cfgUser").value = c.user || "postgres";
        document.getElementById("cfgDb").value = c.database || "mydb";
        document.getElementById("cfgSchema").value = c.schema || "public";
        document.getElementById("cfgTls").checked = Boolean(c.tls);
        document.getElementById("modalConnBadge").innerText = c.source;
        syncFieldsToUrl();
      }
    }

    function setConnInputMode(mode) {
      if (mode === "form") {
        document.getElementById("btnModeForm").classList.add("btn-primary");
        document.getElementById("btnModeUrl").classList.remove("btn-primary");
        document.getElementById("connModeFormContainer").style.display = "block";
        document.getElementById("connModeUrlContainer").style.display = "none";
      } else {
        document.getElementById("btnModeUrl").classList.add("btn-primary");
        document.getElementById("btnModeForm").classList.remove("btn-primary");
        document.getElementById("connModeFormContainer").style.display = "none";
        document.getElementById("connModeUrlContainer").style.display = "block";
      }
    }

    function syncFieldsToUrl() {
      const h = document.getElementById("cfgHost").value || "localhost";
      const p = document.getElementById("cfgPort").value || "5432";
      const u = document.getElementById("cfgUser").value || "postgres";
      const pass = document.getElementById("cfgPass").value;
      const db = document.getElementById("cfgDb").value || "mydb";
      const s = document.getElementById("cfgSchema").value || "public";
      const tls = document.getElementById("cfgTls").checked;

      const auth = u + (pass ? ":" + pass : "");
      let url = "postgresql://" + auth + "@" + h + ":" + p + "/" + db + "?schema=" + s;
      if (tls) url += "&sslmode=require";
      document.getElementById("cfgUrl").value = url;
    }

    function parseUrlIntoFields(val) {
      try {
        const u = new URL(val.replace(/^postgres(ql)?:\/\//, "http://"));
        if (u.hostname) document.getElementById("cfgHost").value = u.hostname;
        if (u.port) document.getElementById("cfgPort").value = u.port;
        if (u.username) document.getElementById("cfgUser").value = decodeURIComponent(u.username);
        if (u.password) document.getElementById("cfgPass").value = decodeURIComponent(u.password);
        if (u.pathname && u.pathname.length > 1) document.getElementById("cfgDb").value = decodeURIComponent(u.pathname.slice(1));
        if (u.searchParams.get("schema")) document.getElementById("cfgSchema").value = u.searchParams.get("schema");
        if (u.searchParams.get("sslmode") === "require") document.getElementById("cfgTls").checked = true;
      } catch {}
    }

    function applyPgConnPreset(preset) {
      if (preset === "localhost") {
        document.getElementById("cfgHost").value = "localhost";
        document.getElementById("cfgPort").value = "5432";
        document.getElementById("cfgUser").value = "postgres";
        document.getElementById("cfgDb").value = "mydb";
        document.getElementById("cfgSchema").value = "public";
        document.getElementById("cfgTls").checked = false;
      } else if (preset === "docker") {
        document.getElementById("cfgHost").value = "127.0.0.1";
        document.getElementById("cfgPort").value = "5432";
        document.getElementById("cfgUser").value = "postgres";
        document.getElementById("cfgDb").value = "mydb";
        document.getElementById("cfgSchema").value = "public";
      } else if (preset === "alt_port") {
        document.getElementById("cfgPort").value = "5433";
      } else if (preset === "cloud") {
        document.getElementById("cfgHost").value = "ep-cool-fog-12345.us-east-2.aws.neon.tech";
        document.getElementById("cfgPort").value = "5432";
        document.getElementById("cfgTls").checked = true;
      }
      syncFieldsToUrl();
    }

    async function resetToEnvConfig() {
      showToast("Resetting to environment variables (PG_HOST, PG_PORT, etc.)...");
      const res = await apiRequest("/api/config", "POST", { resetToEnv: true });
      if (res.success) {
        showToast("✓ Restored configuration from .env!");
        loadConnectionConfig();
        loadSchema();
      } else {
        showToast("Error resetting to .env: " + res.error);
      }
    }

    async function testManualConnection() {
      const banner = document.getElementById("connTestResult");
      banner.style.display = "block";
      banner.style.background = "rgba(56, 189, 248, 0.1)";
      banner.style.color = "var(--cyan)";
      banner.style.border = "1px solid rgba(56, 189, 248, 0.3)";
      banner.innerText = "Testing PostgreSQL connection...";

      const config = {
        host: document.getElementById("cfgHost").value,
        port: Number(document.getElementById("cfgPort").value),
        user: document.getElementById("cfgUser").value,
        password: document.getElementById("cfgPass").value,
        database: document.getElementById("cfgDb").value,
        schema: document.getElementById("cfgSchema").value,
        tls: document.getElementById("cfgTls").checked,
        url: document.getElementById("cfgUrl").value,
      };

      const res = await apiRequest("/api/test-config", "POST", config);
      if (res.success) {
        banner.style.background = "rgba(16, 185, 129, 0.15)";
        banner.style.color = "#34d399";
        banner.style.border = "1px solid rgba(16, 185, 129, 0.4)";
        banner.innerText = "✓ Connection Successful! (" + res.latencyMs + "ms) - " + res.serverVersion;
      } else {
        banner.style.background = "rgba(244, 63, 94, 0.15)";
        banner.style.color = "#fb7185";
        banner.style.border = "1px solid rgba(244, 63, 94, 0.4)";
        banner.innerText = "✕ Connection Failed: " + res.error;
      }
    }

    async function applyManualConnection() {
      const config = {
        host: document.getElementById("cfgHost").value,
        port: Number(document.getElementById("cfgPort").value),
        user: document.getElementById("cfgUser").value,
        password: document.getElementById("cfgPass").value,
        database: document.getElementById("cfgDb").value,
        schema: document.getElementById("cfgSchema").value,
        tls: document.getElementById("cfgTls").checked,
        url: document.getElementById("cfgUrl").value,
      };

      const res = await apiRequest("/api/config", "POST", config);
      if (res.success) {
        showToast("✓ Connected & updated configuration!");
        closeConnectionModal();
        loadSchema();
      } else {
        showToast("Connection failed: " + res.error);
      }
    }

    // Server Databases Tab
    async function loadServerDatabases() {
      const list = document.getElementById("serverDatabasesList");
      list.innerHTML = "<div style='color: var(--text-dim); font-size: 11px;'>Loading databases...</div>";
      const res = await apiRequest("/api/workspace-databases");
      if (res.success && res.databases) {
        list.innerHTML = res.databases.map(db => \`
          <div class="tree-item" style="padding: 6px 10px; border: 1px solid var(--border-subtle); border-radius: 6px;">
            <div class="tree-item-name">
              <span>🐘</span>
              <strong style="color: #fff;">\${db.name}</strong>
              <span style="font-size: 10px; color: var(--text-dim);">(\${db.size})</span>
            </div>
            <button class="btn btn-sm btn-primary" onclick="switchServerDatabase('\${db.name}')">Switch</button>
          </div>
        \`).join('') || '<div style="color: var(--text-dim); font-size: 11px;">No databases found</div>';
      }
    }

    async function switchServerDatabase(dbName) {
      showToast("Switching database to: " + dbName + "...");
      const res = await apiRequest("/api/connect", "POST", { database: dbName });
      if (res.success) {
        showToast("✓ Switched to database: " + dbName);
        closeConnectionModal();
        loadSchema();
      } else {
        showToast("Failed to switch database: " + res.error);
      }
    }

    async function handleCreateDatabase() {
      const name = document.getElementById("txtNewDbName").value.trim();
      if (!name) return;
      showToast("Creating database: " + name + "...");
      const res = await apiRequest("/api/create-database", "POST", { name });
      if (res.success) {
        showToast("✓ Database created: " + name);
        document.getElementById("txtNewDbName").value = "";
        switchServerDatabase(name);
      } else {
        showToast("Error creating database: " + res.error);
      }
    }

    // Visual Query Designer Implementation
    function renderQueryDesigner() {
      const container = document.getElementById("designerContainer");
      if (!container || !currentSchema) return;

      const selectedTables = queryDesignerState.selectedTables;
      const allTables = (currentSchema.tables || []).map(t => t.name);
      const allViews = (currentSchema.views || []).map(v => v.name);

      // Populate Table Picker Dropdown
      const picker = document.getElementById("designerTablePicker");
      if (picker) {
        picker.innerHTML = "<option value=''>+ Add Table / View</option>" +
          (allTables.length ? "<optgroup label='📋 Tables'>" + allTables.map(t => "<option value='" + t + "'>" + t + "</option>").join('') + "</optgroup>" : "") +
          (allViews.length ? "<optgroup label='👁️ Views'>" + allViews.map(v => "<option value='" + v + "'>" + v + " (view)</option>").join('') + "</optgroup>" : "");
      }

      // If in SQL View mode
      if (queryDesignerState.activeView === "sql") {
        const sql = generateDesignerSql();
        container.innerHTML = \`
          <div style="flex: 1; padding: 16px; display: flex; flex-direction: column;">
            <div style="font-size: 11px; font-weight: 700; color: var(--cyan); margin-bottom: 8px;">Generated PostgreSQL SQL (Double-Quoted Identifiers):</div>
            <pre style="flex: 1; background: rgba(8, 14, 26, 0.95); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 14px; font-family: var(--font-mono); font-size: 12px; color: #7dd3fc; line-height: 1.5; white-space: pre-wrap;">\${escapeHtml(sql)}</pre>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
              <button class="btn btn-sm btn-primary" onclick="runDesignerQuery()">! Execute Query</button>
              <button class="btn btn-sm" onclick="navigator.clipboard.writeText('\${sql.replace(/'/g, "\\\\'")}'); showToast('Copied SQL to clipboard!')">📋 Copy SQL</button>
              <button class="btn btn-sm" onclick="setDesignerActiveView('design')">📐 Back to Design</button>
            </div>
          </div>
        \`;
        return;
      }

      // If in Datasheet View mode
      if (queryDesignerState.activeView === "datasheet") {
        const ds = queryDesignerState.datasheet;
        let content = "";
        if (queryDesignerState.datasheetLoading) {
          content = "<div style='text-align: center; padding: 40px; color: var(--cyan); font-size: 13px;'>⚡ Executing query against PostgreSQL...</div>";
        } else if (ds && ds.error) {
          content = "<div style='padding: 20px; color: var(--rose); font-family: var(--font-mono);'>⚠️ Error: " + ds.error + "</div>";
        } else if (ds && ds.rows) {
          const cols = ds.columns || (ds.rows.length ? Object.keys(ds.rows[0]) : []);
          content = \`
            <div class="grid-scroll" style="flex: 1;">
              <table class="data-grid">
                <thead><tr>\${cols.map(c => '<th>' + c + '</th>').join('')}</tr></thead>
                <tbody>
                  \${ds.rows.map(r => '<tr>' + cols.map(c => '<td>' + (r[c] !== null && r[c] !== undefined ? escapeHtml(String(r[c])) : '<span class=\"cell-null\">NULL</span>') + '</td>').join('') + '</tr>').join('')}
                </tbody>
              </table>
            </div>
          \`;
        } else {
          content = "<div style='text-align: center; padding: 40px; color: var(--text-dim);'>Click ! Run to execute query</div>";
        }

        container.innerHTML = \`
          <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
            <div style="padding: 8px 12px; background: rgba(10, 17, 32, 0.9); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700; color: var(--cyan);">📋 Datasheet View \${ds ? '(' + ds.rows.length + ' rows, ' + ds.latencyMs + 'ms)' : ''}</span>
              <button class="btn btn-sm btn-primary" onclick="setDesignerActiveView('design')">📐 Design View</button>
            </div>
            \${content}
          </div>
        \`;
        return;
      }

      // Design View Mode: Top Viewport Canvas + Lower Matrix
      const tableCardsHtml = selectedTables.map(tName => {
        const meta = (currentSchema.tables || []).find(t => t.name === tName) || (currentSchema.views || []).find(v => v.name === tName);
        if (!meta) return "";
        const pos = queryDesignerState.tablePositions[tName] || { x: 40, y: 30 };
        return \`
          <div class="qbe-table-card" id="qbeCard_\${tName}" style="left: \${pos.x}px; top: \${pos.y}px;">
            <div class="qbe-table-card-header" onmousedown="startDragTableCard(event, '\${tName}')">
              <span>📋 \${tName}</span>
              <button class="sidebar-mini-btn" onclick="removeDesignerTable('\${tName}')" style="padding: 1px 4px;">✕</button>
            </div>
            <div class="qbe-table-card-fields">
              \${(meta.columns || []).map(c => \`
                <div class="qbe-field-row" onclick="addDesignerQbeColumn('\${tName}', '\${c.name}')" title="Click to add field to QBE Grid">
                  <div style="display: flex; align-items: center;">
                    <span class="qbe-field-connector">●</span>
                    <span>\${c.pk ? '🔑 ' : ''}\${c.name}</span>
                  </div>
                  <span style="font-size: 9px; color: var(--text-dim);">\${c.type || 'ANY'}</span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`;
      }).join('') || \`
        <div style="text-align: center; padding: 40px; color: var(--text-dim); max-width: 440px; margin: 40px auto; border: 1px dashed var(--border-subtle); border-radius: 8px;">
          <div style="font-size: 24px; margin-bottom: 8px;">🗄️</div>
          <div style="font-weight: 700; color: var(--text-main); margin-bottom: 4px;">Relational Canvas Ready</div>
          <div style="font-size: 11px; margin-bottom: 12px;">Add tables using the selector above or pick a pre-configured relational template:</div>
          <button class="btn btn-sm btn-primary" onclick="applyDesignerPreset('ecommerce_4table')">🛒 Load 4-Table E-Commerce</button>
        </div>
      \`;

      // Matrix Columns Row
      const qbeColumns = queryDesignerState.columns;
      const matrixHeaders = \`
        <tr>
          <td class="qbe-matrix-header-cell">Field:</td>
          \${qbeColumns.map((col, idx) => \`
            <td class="qbe-matrix-col-cell">
              <input type="text" value="\${col.field}" onchange="updateQbeColumn(\${idx}, 'field', this.value)" style="font-weight: 600; color: var(--cyan);">
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell" style="width: 50px;"></td>
        </tr>
      \`;

      const matrixTables = \`
        <tr>
          <td class="qbe-matrix-header-cell">Table:</td>
          \${qbeColumns.map((col, idx) => \`
            <td class="qbe-matrix-col-cell">
              <input type="text" value="\${col.table}" onchange="updateQbeColumn(\${idx}, 'table', this.value)">
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const matrixTotals = queryDesignerState.showTotals ? \`
        <tr>
          <td class="qbe-matrix-header-cell" style="color: var(--emerald);">Total:</td>
          \${qbeColumns.map((col, idx) => \`
            <td class="qbe-matrix-col-cell">
              <select onchange="updateQbeColumn(\${idx}, 'total', this.value)" style="color: var(--emerald); font-weight: 600;">
                <option value="GroupBy" \${col.total === 'GroupBy' ? 'selected' : ''}>GroupBy</option>
                <option value="Sum" \${col.total === 'Sum' ? 'selected' : ''}>Sum</option>
                <option value="Avg" \${col.total === 'Avg' ? 'selected' : ''}>Avg</option>
                <option value="Count" \${col.total === 'Count' ? 'selected' : ''}>Count</option>
                <option value="Min" \${col.total === 'Min' ? 'selected' : ''}>Min</option>
                <option value="Max" \${col.total === 'Max' ? 'selected' : ''}>Max</option>
              </select>
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \` : "";

      const matrixSort = \`
        <tr>
          <td class="qbe-matrix-header-cell">Sort:</td>
          \${qbeColumns.map((col, idx) => \`
            <td class="qbe-matrix-col-cell">
              <select onchange="updateQbeColumn(\${idx}, 'sort', this.value)">
                <option value="" \${!col.sort ? 'selected' : ''}>(None)</option>
                <option value="ASC" \${col.sort === 'ASC' ? 'selected' : ''}>Ascending</option>
                <option value="DESC" \${col.sort === 'DESC' ? 'selected' : ''}>Descending</option>
              </select>
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const matrixShow = \`
        <tr>
          <td class="qbe-matrix-header-cell">Show:</td>
          \${qbeColumns.map((col, idx) => \`
            <td class="qbe-matrix-col-cell" style="text-align: center;">
              <input type="checkbox" \${col.show !== false ? 'checked' : ''} onchange="updateQbeColumn(\${idx}, 'show', this.checked)">
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const matrixCriteria = \`
        <tr>
          <td class="qbe-matrix-header-cell">Criteria:</td>
          \${qbeColumns.map((col, idx) => \`
            <td class="qbe-matrix-col-cell">
              <input type="text" placeholder="e.g. > 1000" value="\${col.criteria || ''}" onchange="updateQbeColumn(\${idx}, 'criteria', this.value)">
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      container.innerHTML = \`
        <div class="qbe-viewport" id="qbeViewport">
          <div class="qbe-canvas-stage" id="qbeStage" style="transform: scale(\${queryDesignerState.canvasZoom});">
            <svg class="qbe-svg-layer" id="qbeSvgLayer"></svg>
            \${tableCardsHtml}
          </div>
        </div>
        <div class="qbe-lower-pane">
          <div class="qbe-matrix-container">
            <table class="qbe-matrix">
              \${matrixHeaders}
              \${matrixTables}
              \${matrixTotals}
              \${matrixSort}
              \${matrixShow}
              \${matrixCriteria}
            </table>
          </div>
        </div>
      \`;

      drawJoinLines();
    }

    function setDesignerActiveView(view) {
      queryDesignerState.activeView = view;
      document.getElementById("btnDesignerDesign").className = view === "design" ? "qbe-view-btn active" : "qbe-view-btn";
      document.getElementById("btnDesignerSql").className = view === "sql" ? "qbe-view-btn active" : "qbe-view-btn";
      document.getElementById("btnDesignerDatasheet").className = view === "datasheet" ? "qbe-view-btn active" : "qbe-view-btn";
      renderQueryDesigner();
    }

    function addDesignerTableFromPicker() {
      const picker = document.getElementById("designerTablePicker");
      const val = picker.value;
      if (!val || queryDesignerState.selectedTables.includes(val)) return;
      queryDesignerState.selectedTables.push(val);
      const count = queryDesignerState.selectedTables.length;
      queryDesignerState.tablePositions[val] = { x: 30 + ((count - 1) * 260) % 1200, y: 30 + Math.floor((count - 1) / 4) * 220 };
      renderQueryDesigner();
      autoJoinDesignerTables();
    }

    function removeDesignerTable(name) {
      queryDesignerState.selectedTables = queryDesignerState.selectedTables.filter(t => t !== name);
      queryDesignerState.joins = queryDesignerState.joins.filter(j => j.leftTable !== name && j.rightTable !== name);
      queryDesignerState.columns = queryDesignerState.columns.filter(c => c.table !== name);
      renderQueryDesigner();
    }

    function addDesignerQbeColumn(table = "", field = "") {
      if (!table && queryDesignerState.selectedTables.length) {
        table = queryDesignerState.selectedTables[0];
      }
      queryDesignerState.columns.push({
        table,
        field: field || "*",
        total: "GroupBy",
        sort: "",
        show: true,
        criteria: ""
      });
      renderQueryDesigner();
    }

    function updateQbeColumn(idx, prop, val) {
      if (queryDesignerState.columns[idx]) {
        queryDesignerState.columns[idx][prop] = val;
      }
    }

    function toggleDesignerTotals() {
      queryDesignerState.showTotals = !queryDesignerState.showTotals;
      document.getElementById("btnDesignerTotals").className = queryDesignerState.showTotals ? "btn btn-sm btn-primary" : "btn btn-sm";
      renderQueryDesigner();
    }

    function toggleDesignerDistinct() {
      queryDesignerState.distinct = !queryDesignerState.distinct;
      document.getElementById("btnDesignerDistinct").className = queryDesignerState.distinct ? "btn btn-sm btn-primary" : "btn btn-sm";
    }

    // Auto-Detect Joins from foreign keys
    function autoJoinDesignerTables() {
      if (!currentSchema || !queryDesignerState.selectedTables.length) return;
      const tables = queryDesignerState.selectedTables;

      tables.forEach(tName => {
        const meta = (currentSchema.tables || []).find(t => t.name === tName);
        if (!meta || !meta.foreignKeys) return;
        meta.foreignKeys.forEach(fk => {
          if (tables.includes(fk.table)) {
            const exists = queryDesignerState.joins.some(j => 
              (j.leftTable === tName && j.rightTable === fk.table && j.leftField === fk.from && j.rightField === fk.to) ||
              (j.leftTable === fk.table && j.rightTable === tName && j.leftField === fk.to && j.rightField === fk.from)
            );
            if (!exists) {
              queryDesignerState.joins.push({
                leftTable: tName,
                leftField: fk.from,
                rightTable: fk.table,
                rightField: fk.to,
                type: "INNER"
              });
            }
          }
        });
      });
      renderQueryDesigner();
    }

    function autoArrangeDesignerTables() {
      const tables = queryDesignerState.selectedTables;
      tables.forEach((t, idx) => {
        queryDesignerState.tablePositions[t] = {
          x: 40 + (idx % 3) * 280,
          y: 30 + Math.floor(idx / 3) * 240
        };
      });
      renderQueryDesigner();
    }

    // Drag Table Cards on Canvas
    let dragTableState = null;
    function startDragTableCard(e, tableName) {
      dragTableState = {
        tableName,
        startX: e.clientX,
        startY: e.clientY,
        initialPos: queryDesignerState.tablePositions[tableName] || { x: 40, y: 30 }
      };

      const onMouseMove = (ev) => {
        if (!dragTableState) return;
        const zoom = queryDesignerState.canvasZoom || 1.0;
        const dx = (ev.clientX - dragTableState.startX) / zoom;
        const dy = (ev.clientY - dragTableState.startY) / zoom;
        const card = document.getElementById("qbeCard_" + dragTableState.tableName);
        const newX = Math.max(10, Math.round(dragTableState.initialPos.x + dx));
        const newY = Math.max(10, Math.round(dragTableState.initialPos.y + dy));
        if (card) {
          card.style.left = newX + "px";
          card.style.top = newY + "px";
        }
        queryDesignerState.tablePositions[dragTableState.tableName] = { x: newX, y: newY };
        drawJoinLines();
      };

      const onMouseUp = () => {
        dragTableState = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }

    // Draw SVG Relational Join Lines
    function drawJoinLines() {
      const svg = document.getElementById("qbeSvgLayer");
      if (!svg) return;
      svg.innerHTML = "";

      queryDesignerState.joins.forEach(j => {
        const leftCard = document.getElementById("qbeCard_" + j.leftTable);
        const rightCard = document.getElementById("qbeCard_" + j.rightTable);
        if (!leftCard || !rightCard) return;

        const leftPos = queryDesignerState.tablePositions[j.leftTable] || { x: 0, y: 0 };
        const rightPos = queryDesignerState.tablePositions[j.rightTable] || { x: 0, y: 0 };

        const x1 = leftPos.x + 230;
        const y1 = leftPos.y + 60;
        const x2 = rightPos.x;
        const y2 = rightPos.y + 60;
        const cx1 = x1 + Math.abs(x2 - x1) * 0.4;
        const cy1 = y1;
        const cx2 = x2 - Math.abs(x2 - x1) * 0.4;
        const cy2 = y2;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M " + x1 + " " + y1 + " C " + cx1 + " " + cy1 + ", " + cx2 + " " + cy2 + ", " + x2 + " " + y2);
        path.setAttribute("stroke", j.type === "FULL" ? "#818cf8" : (j.type === "LEFT" || j.type === "RIGHT" ? "#f59e0b" : "#38bdf8"));
        path.setAttribute("stroke-width", "2.5");
        path.setAttribute("fill", "none");
        svg.appendChild(path);
      });
    }

    // Generate Double-Quoted PostgreSQL SQL from Visual Query
    function generateDesignerSql() {
      const tables = queryDesignerState.selectedTables;
      if (!tables.length) return "-- Add tables to generate SQL query";

      const showCols = queryDesignerState.columns.filter(c => c.show !== false);
      let selectClause = "*";

      if (showCols.length) {
        selectClause = showCols.map(c => {
          const colIdent = c.field === "*" ? "*" : '"' + c.field + '"';
          const tableIdent = c.table ? '"' + c.table + '".' : "";
          if (queryDesignerState.showTotals && c.total && c.total !== "GroupBy") {
            return c.total.toUpperCase() + "(" + tableIdent + colIdent + ") AS " + '"' + c.total.toLowerCase() + "_" + c.field + '"';
          }
          return tableIdent + colIdent;
        }).join(',\\n  ');
      }

      let fromClause = '"' + tables[0] + '"';
      const joins = queryDesignerState.joins;

      joins.forEach(j => {
        let joinKeyword = "JOIN";
        if (j.type === "LEFT") joinKeyword = "LEFT JOIN";
        if (j.type === "RIGHT") joinKeyword = "RIGHT JOIN";
        if (j.type === "FULL") joinKeyword = "FULL OUTER JOIN";

        fromClause += "\\n" + joinKeyword + ' "' + j.rightTable + '" ON "' + j.leftTable + '"."' + j.leftField + '" = "' + j.rightTable + '"."' + j.rightField + '"';
      });

      let whereClause = "";
      const criteriaCols = queryDesignerState.columns.filter(c => c.criteria && c.criteria.trim());
      if (criteriaCols.length) {
        whereClause = "\\nWHERE " + criteriaCols.map(c => '"' + c.table + '"."' + c.field + '" ' + c.criteria).join(' AND ');
      }

      let groupByClause = "";
      if (queryDesignerState.showTotals) {
        const groupCols = queryDesignerState.columns.filter(c => c.total === "GroupBy" && c.field !== "*");
        if (groupCols.length) {
          groupByClause = "\\nGROUP BY " + groupCols.map(c => '"' + c.table + '"."' + c.field + '"').join(', ');
        }
      }

      let orderByClause = "";
      const sortCols = queryDesignerState.columns.filter(c => c.sort);
      if (sortCols.length) {
        orderByClause = "\\nORDER BY " + sortCols.map(c => '"' + c.table + '"."' + c.field + '" ' + c.sort).join(', ');
      }

      const distinctStr = queryDesignerState.distinct ? "DISTINCT " : "";
      return "SELECT " + distinctStr + "\\n  " + selectClause + "\\nFROM " + fromClause + whereClause + groupByClause + orderByClause + ";";
    }

    async function runDesignerQuery() {
      const sql = generateDesignerSql();
      setDesignerActiveView("datasheet");
      queryDesignerState.datasheetLoading = true;
      renderQueryDesigner();

      const start = performance.now();
      const res = await apiRequest("/api/query", "POST", { sql });
      const elapsed = Math.round(performance.now() - start);

      queryDesignerState.datasheetLoading = false;
      if (res.success) {
        queryDesignerState.datasheet = {
          rows: res.rows || [],
          columns: res.columns,
          latencyMs: elapsed
        };
      } else {
        queryDesignerState.datasheet = { error: res.error };
      }
      renderQueryDesigner();
    }

    function applyDesignerPreset(preset) {
      if (preset === "ecommerce_4table") {
        queryDesignerState.selectedTables = ["customers", "orders", "order_items", "products"];
        queryDesignerState.tablePositions = {
          customers: { x: 30, y: 30 },
          orders: { x: 290, y: 30 },
          order_items: { x: 550, y: 30 },
          products: { x: 810, y: 30 }
        };
        queryDesignerState.joins = [
          { leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "INNER" },
          { leftTable: "orders", leftField: "id", rightTable: "order_items", rightField: "order_id", type: "INNER" },
          { leftTable: "order_items", leftField: "product_id", rightTable: "products", rightField: "id", type: "INNER" }
        ];
        queryDesignerState.columns = [
          { table: "customers", field: "name", total: "GroupBy", sort: "", show: true },
          { table: "orders", field: "order_number", total: "GroupBy", sort: "", show: true },
          { table: "products", field: "name", total: "GroupBy", sort: "", show: true },
          { table: "order_items", field: "quantity", total: "Sum", sort: "", show: true },
          { table: "order_items", field: "line_total", total: "Sum", sort: "DESC", show: true }
        ];
        queryDesignerState.showTotals = true;
        renderQueryDesigner();
        showToast("Loaded 4-Table E-Commerce relational query!");
      } else if (preset === "full_join") {
        queryDesignerState.selectedTables = ["customers", "orders"];
        queryDesignerState.tablePositions = { customers: { x: 40, y: 40 }, orders: { x: 320, y: 40 } };
        queryDesignerState.joins = [
          { leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "FULL" }
        ];
        queryDesignerState.columns = [
          { table: "customers", field: "name", show: true },
          { table: "customers", field: "email", show: true },
          { table: "orders", field: "order_number", show: true },
          { table: "orders", field: "total_amount", show: true }
        ];
        renderQueryDesigner();
        showToast("Loaded PostgreSQL FULL OUTER JOIN query!");
      } else if (preset === "reset") {
        queryDesignerState.selectedTables = [];
        queryDesignerState.joins = [];
        queryDesignerState.columns = [];
        renderQueryDesigner();
      }
    }

    // Join Properties Dialog
    function openJoinPropertiesModal() {
      const leftSel = document.getElementById("joinLeftTable");
      const rightSel = document.getElementById("joinRightTable");
      const tables = queryDesignerState.selectedTables;

      if (tables.length < 2) {
        showToast("Please add at least 2 tables to canvas first.");
        return;
      }

      leftSel.innerHTML = tables.map(t => "<option value='" + t + "'>" + t + "</option>").join('');
      rightSel.innerHTML = tables.map(t => "<option value='" + t + "'>" + t + "</option>").join('');
      rightSel.selectedIndex = 1;

      onJoinTableChange('left');
      onJoinTableChange('right');

      document.getElementById("joinPropertiesModal").classList.add("active");
    }

    function closeJoinPropertiesModal() {
      document.getElementById("joinPropertiesModal").classList.remove("active");
    }

    function onJoinTableChange(side) {
      const tName = document.getElementById(side === 'left' ? "joinLeftTable" : "joinRightTable").value;
      const fSel = document.getElementById(side === 'left' ? "joinLeftField" : "joinRightField");
      const meta = (currentSchema.tables || []).find(t => t.name === tName) || (currentSchema.views || []).find(v => v.name === tName);
      if (meta && meta.columns) {
        fSel.innerHTML = meta.columns.map(c => "<option value='" + c.name + "'>" + c.name + "</option>").join('');
      }
      if (side === 'left') document.getElementById("lblLeftTableJoin").innerText = tName;
      if (side === 'right') document.getElementById("lblRightTableJoin").innerText = tName;
    }

    function submitJoinProperties() {
      const leftTable = document.getElementById("joinLeftTable").value;
      const rightTable = document.getElementById("joinRightTable").value;
      const leftField = document.getElementById("joinLeftField").value;
      const rightField = document.getElementById("joinRightField").value;
      const joinType = document.querySelector("input[name='joinTypeRadio']:checked")?.value || "INNER";

      if (leftTable === rightTable) {
        showToast("Cannot join a table to itself in this mode.");
        return;
      }

      queryDesignerState.joins.push({ leftTable, rightTable, leftField, rightField, type: joinType });
      closeJoinPropertiesModal();
      renderQueryDesigner();
      showToast("✓ Joined " + leftTable + " and " + rightTable + " (" + joinType + ")");
    }

    // Helper: HTML Escaping
    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function toggleSidebarCollapse() {
      document.getElementById("sidebar").classList.toggle("collapsed");
    }

    function filterSidebarTree(q) {
      const text = q.toLowerCase();
      document.querySelectorAll("#sidebarTree .tree-item").forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(text) ? "flex" : "none";
      });
    }

    function togglePasswordVisibility() {
      const p = document.getElementById("cfgPass");
      p.type = p.type === "password" ? "text" : "password";
    }

    // Saved Profiles in localStorage
    function promptSaveProfile() {
      const name = prompt("Enter profile name for this PostgreSQL connection:", "Postgres Cluster " + (document.getElementById("cfgDb").value || "mydb"));
      if (!name) return;
      const config = {
        name,
        host: document.getElementById("cfgHost").value,
        port: Number(document.getElementById("cfgPort").value),
        user: document.getElementById("cfgUser").value,
        database: document.getElementById("cfgDb").value,
        schema: document.getElementById("cfgSchema").value,
        tls: document.getElementById("cfgTls").checked,
        url: document.getElementById("cfgUrl").value,
      };
      const profiles = JSON.parse(localStorage.getItem("pg_studio_profiles") || "[]");
      profiles.push(config);
      localStorage.setItem("pg_studio_profiles", JSON.stringify(profiles));
      showToast("✓ Saved profile: " + name);
    }

    function renderProfilesList() {
      const list = document.getElementById("profilesList");
      const profiles = JSON.parse(localStorage.getItem("pg_studio_profiles") || "[]");
      if (!profiles.length) {
        list.innerHTML = "<div style='color: var(--text-dim); font-size: 11px;'>No saved profiles. Use 'Save Profile' in Manual Config tab.</div>";
        return;
      }
      list.innerHTML = profiles.map((p, idx) => \`
        <div class="tree-item" style="padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: 6px;">
          <div>
            <div style="font-weight: 700; color: #fff;">\${escapeHtml(p.name)}</div>
            <div style="font-size: 10px; color: var(--text-dim);">\${p.user}@\${p.host}:\${p.port}/\${p.database}</div>
          </div>
          <div style="display: flex; gap: 4px;">
            <button class="btn btn-sm btn-primary" onclick="loadSavedProfile(\${idx})">Load</button>
            <button class="sidebar-mini-btn" onclick="deleteSavedProfile(\${idx})">✕</button>
          </div>
        </div>
      \`).join('');
    }

    function loadSavedProfile(idx) {
      const profiles = JSON.parse(localStorage.getItem("pg_studio_profiles") || "[]");
      const p = profiles[idx];
      if (!p) return;
      document.getElementById("cfgHost").value = p.host || "localhost";
      document.getElementById("cfgPort").value = p.port || 5432;
      document.getElementById("cfgUser").value = p.user || "postgres";
      document.getElementById("cfgDb").value = p.database || "mydb";
      document.getElementById("cfgSchema").value = p.schema || "public";
      document.getElementById("cfgTls").checked = Boolean(p.tls);
      syncFieldsToUrl();
      switchModalTab("config");
      showToast("Loaded profile: " + p.name);
    }

    function deleteSavedProfile(idx) {
      const profiles = JSON.parse(localStorage.getItem("pg_studio_profiles") || "[]");
      profiles.splice(idx, 1);
      localStorage.setItem("pg_studio_profiles", JSON.stringify(profiles));
      renderProfilesList();
    }

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        executeCurrentQuery();
      }
    });

    // Auto-initialize on load
    window.addEventListener("DOMContentLoaded", () => {
      loadSchema();
      loadKpis();
    });
  </script>
</body>
</html>`;
}

// -------------------------------------------------------------------------------------------------
// Desktop Workstation Application Factory
// -------------------------------------------------------------------------------------------------

export function createPostgresStudio(options: PostgresStudioOptions = {}): PostgresStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1260);
  const height = options.height ?? (fullscreen ? screen.height : 900);
  const activeDbPath = options.initialDbPath 
    || options.database 
    || process.env.PG_DATABASE 
    || process.env.PG_NAME 
    || process.env.PG_DB 
    || process.env.POSTGRES_DB 
    || "mydb";
  const activeSchema = options.initialSchema 
    || options.schema 
    || process.env.PG_SCHEMA 
    || "public";
  const title = "Postgres Studio Pro -- Enterprise Database Workstation";

  const app: PostgresStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    activeDbPath,
    activeSchema,
    generateHtml: () => generatePostgresStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Postgres Studio Pro (Enterprise Database Workstation)...");

      // 1. Launch Isolated Background Database Worker Engine
      process.env.STUDIO_WORKER = "postgres_studio";
      if (activeDbPath) process.env.PG_DB_PATH = activeDbPath;
      if (activeSchema) process.env.PG_SCHEMA = activeSchema;

      const customConfig: Partial<PostgresConnectionConfig> = options.config || {
        host: options.host,
        port: options.pgPort || (options.port && options.port !== 5432 ? options.port : undefined),
        user: options.user,
        password: options.password,
        database: options.database,
        schema: options.schema,
        tls: options.tls,
        url: options.url,
      };

      if (customConfig.host) process.env.PG_HOST = customConfig.host;
      if (customConfig.port) process.env.PG_PORT = String(customConfig.port);
      if (customConfig.user) process.env.PG_USER = customConfig.user;
      if (customConfig.password !== undefined) process.env.PG_PASSWORD = customConfig.password;
      if (customConfig.database) process.env.PG_DATABASE = customConfig.database;
      if (customConfig.schema) process.env.PG_SCHEMA = customConfig.schema;
      if (customConfig.tls !== undefined) process.env.PG_TLS = customConfig.tls ? "true" : "false";
      if (customConfig.url) process.env.PG_URL = customConfig.url;

      let info: { ready: boolean; port: number; url: string; type?: string };
      let serverProc: any = null;

      try {
        const workerUrl = new URL("./postgres_studio_server.ts", import.meta.url);
        const worker = new Worker(workerUrl);
        app.worker = worker;

        info = await new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error("Timeout initializing background database engine")), 1500);
          worker.onmessage = (e) => {
            if (!e.data?.type || e.data.type === "postgres_studio") {
              clearTimeout(timer);
              res(e.data);
            }
          };
          worker.onerror = (err) => {
            clearTimeout(timer);
            rej(err);
          };
        });
      } catch {
        // Subprocess fallback
        const serverArgs = process.execPath.endsWith("bun")
          ? [process.execPath, process.argv[1] || resolve(import.meta.dir, "postgres_studio.ts"), "--server"]
          : [process.execPath, "--server"];

        const proc = Bun.spawn(serverArgs, {
          stdout: "pipe",
          stderr: "ignore",
          env: { ...process.env, PG_STUDIO_DB: activeDbPath, PG_SCHEMA: activeSchema },
        });
        serverProc = proc;

        const reader = proc.stdout.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let detectedPort = 0;

        const timeout = setTimeout(() => {
          try { reader.cancel(); } catch {}
        }, 5000);

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value);
          const m = buffer.match(/READY:(\d+)/);
          if (m && m[1]) {
            detectedPort = parseInt(m[1], 10);
            break;
          }
        }
        clearTimeout(timeout);

        if (detectedPort > 0) {
          info = {
            ready: true,
            port: detectedPort,
            url: `http://127.0.0.1:${detectedPort}`,
            type: "postgres_studio",
          };
        } else {
          const srv = startPostgresStudioServer({
            port: 0,
            host: "127.0.0.1",
            initialDbPath: activeDbPath,
            initialSchema: activeSchema,
            config: customConfig,
          });
          app.server = srv;
          const serverPort = srv.port ?? 0;
          info = {
            ready: true,
            port: serverPort,
            url: `http://127.0.0.1:${serverPort}`,
            type: "postgres_studio",
          };
        }
      }

      app.port = info.port;
      app.url = info.url;
      console.log(`⚡ Background Database Server active at: ${info.url}`);

      // Ensure server is accepting requests before Webview navigates
      try {
        await fetch(info.url);
      } catch {}

      // 2. Native Webview Window
      try {
        const webview = new Webview(true, {
          width,
          height,
          hint: SizeHint.NONE,
        });

        app.webview = webview;
        webview.title = title;

        try {
          if (fullscreen) {
            setWindowPositionNative(webview, { x: 0, y: 0 }, width, height);
          } else {
            setWindowPositionNative(webview, "center", width, height);
          }
          setAlwaysOnTopNative(webview, options.alwaysOnTop ?? false);
        } catch {}

        attachWindowShortcuts(webview, {
          onQuit: () => {
            try { app.worker?.terminate(); } catch {}
            try { serverProc?.kill(); } catch {}
            process.exit(0);
          },
          onClose: () => {
            try { app.worker?.terminate(); } catch {}
            try { serverProc?.kill(); } catch {}
            process.exit(0);
          },
          onFullscreen: () => {
            toggleFullscreenNative(webview);
          },
          fullscreen,
        });

        webview.navigate(info.url);
        console.log(`⚡ Native desktop workstation window open. (Also accessible in any browser at: ${info.url})`);

        // Start native desktop message loop on main thread
        webview.run();
        try { app.worker?.terminate(); } catch {}
        try { serverProc?.kill(); } catch {}
        process.exit(0);
      } catch (err: any) {
        console.warn(`Desktop Webview unavailable (${err?.message || err}). Application running as web workstation at: ${info.url}`);
      } finally {
        try { app.worker?.terminate(); } catch {}
        try { serverProc?.kill(); } catch {}
        process.exit(0);
      }
    },
  };

  return app;
}

// -------------------------------------------------------------------------------------------------
// Standalone Invocation
// -------------------------------------------------------------------------------------------------

if (process.argv.includes("--server")) {
  const initialDb = process.env.PG_STUDIO_DB || "mydb";
  const initialSchema = process.env.PG_SCHEMA || "public";
  const srv = startPostgresStudioServer({
    port: 0,
    host: "127.0.0.1",
    initialDbPath: initialDb,
    initialSchema: initialSchema,
  });
  console.log(`READY:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const initialDb = process.argv[2] || "mydb";
  const app = createPostgresStudio({ initialDbPath: initialDb, fullscreen: true });
  await app.run();
  process.exit(0);
}
