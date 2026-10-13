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
import { CRUD_STYLE, CRUD_SCRIPT } from "./postgres_studio_crud.ts";
import { POSTGRES_DESIGNER_SCRIPT } from "./postgres_studio_designer.ts";
import { MACRO_STYLE, MACRO_TAB_BTN, MACRO_HTML, buildMacroScript } from "./sqlite_studio_macros.ts";

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

    .theme-control {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px 4px 10px;
      border-radius: 8px;
      border: 1px solid rgba(56, 189, 248, 0.35);
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.92), rgba(12, 18, 29, 0.96));
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 0 1px rgba(56, 189, 248, 0.12);
    }

    .theme-control-label {
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: 700;
      user-select: none;
      pointer-events: none;
    }

    .theme-control::after {
      content: "";
      position: absolute;
      right: 10px;
      width: 10px;
      height: 10px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: center;
      background-size: 10px 10px;
      color: var(--text-main);
      pointer-events: none;
    }

    .btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 12px;
      color: var(--text-main);
      font-size: 12px;
      font-weight: 600;
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
    .btn-success {
      background: linear-gradient(135deg, #059669, #047857);
      border-color: var(--emerald);
      color: #ffffff;
      box-shadow: 0 0 10px var(--emerald-glow);
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

    /* Top KPI Telemetry Banner (5 Enterprise Cards) */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      padding: 8px 16px;
      background: rgba(10, 15, 28, 0.85);
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .kpi-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .kpi-title {
      font-size: 10px;
      font-weight: 700;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .kpi-value {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
      font-family: var(--font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kpi-sub {
      font-size: 10px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kpi-clickable:hover {
      border-color: var(--cyan);
      box-shadow: 0 0 12px var(--cyan-glow);
    }

    /* Workspace Body */
    .workspace {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }

    /* Left Sidebar */
    aside, #sidebar, #mainSidebar {
      width: 360px;
      min-width: 260px;
      max-width: 650px;
      background: rgba(10, 17, 32, 0.98);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
      position: relative;
      transition: width 0.15s ease;
    }
    aside.collapsed, #sidebar.collapsed, #mainSidebar.collapsed {
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      padding: 0 !important;
      border: none !important;
      overflow: hidden;
    }

    .sidebar-resizer {
      width: 6px;
      margin-left: -3px;
      cursor: col-resize;
      background: transparent;
      position: relative;
      flex-shrink: 0;
      z-index: 60;
      transition: background 0.15s ease;
    }

    .sidebar-resizer:hover,
    .sidebar-resizer.resizing {
      background: var(--cyan);
      box-shadow: 0 0 10px var(--cyan-glow);
    }

    .sidebar-db-card {
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-subtle);
      background: rgba(255, 255, 255, 0.02);
      display: flex;
      flex-direction: column;
      gap: 5px;
      flex-shrink: 0;
    }

    .sidebar-search-box {
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }

    .sidebar-search-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 6px 10px;
      color: var(--text-main);
      font-size: 12px;
      outline: none;
    }
    .sidebar-search-input:focus {
      border-color: var(--cyan);
    }

    .sidebar-subbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
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

    /* SQL Editor Banner */
    .editor-banner {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .editor-top {
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .preset-selector-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      max-width: 500px;
    }

    .preset-select {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 4px 28px 4px 8px;
      color: var(--text-main);
      font-size: 11px;
      outline: none;
      color-scheme: dark;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 12px 12px;
      appearance: none;
      -webkit-appearance: none;
      cursor: pointer;
    }

    .sql-input-box {
      padding: 8px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .sql-textarea {
      width: 100%;
      height: 72px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 8px 10px;
      color: #38bdf8;
      font-family: var(--font-mono);
      font-size: 12px;
      resize: vertical;
      outline: none;
      line-height: 1.4;
    }
    .sql-textarea:focus {
      border-color: var(--cyan);
    }

    .editor-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .editor-controls-left {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .editor-timing {
      font-size: 11px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    .editor-banner.collapsed .sql-input-box {
      display: none;
    }

    /* Tabs Bar */
    .tabs-bar, .view-tabs {
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

    /* Microsoft Access Form View & Record Navigator Styling */
    .access-form-layout {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-surface);
      overflow: hidden;
    }
    .access-form-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 18px 24px;
    }
    .access-form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 14px;
      max-width: 1200px;
    }
    .access-field-card {
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .access-field-card:focus-within {
      border-color: var(--cyan);
      box-shadow: 0 0 0 2px var(--cyan-glow);
    }
    .access-field-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .access-field-name {
      font-weight: 700;
      font-size: 12px;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .access-field-type {
      font-size: 10px;
      font-family: var(--font-mono);
      color: var(--cyan);
      background: rgba(56, 189, 248, 0.1);
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    .access-field-pk {
      font-size: 9px;
      font-weight: 700;
      color: #fbbf24;
      background: rgba(245, 158, 11, 0.15);
      padding: 1px 5px;
      border-radius: 4px;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .access-record-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(10, 17, 32, 0.95);
      border-top: 1px solid var(--border-subtle);
      flex-shrink: 0;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
    }

    /* Microsoft Access Query Designer (QBE) Styling */
    .designer-layout {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px 14px 14px;
      height: 100%;
      overflow: auto;
    }

    .qbe-ribbon {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      padding: 8px 12px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      flex-shrink: 0;
    }

    .qbe-ribbon-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .qbe-divider {
      width: 1px;
      height: 22px;
      background: var(--border-subtle);
      margin: 0 4px;
    }

    .qbe-view-switch {
      display: inline-flex;
      background: rgba(0, 0, 0, 0.4);
      padding: 2px;
      border-radius: 6px;
      border: 1px solid var(--border-subtle);
    }

    .qbe-view-btn {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }

    .qbe-view-btn:hover {
      color: var(--text-main);
    }

    .qbe-view-btn.active {
      background: rgba(56, 189, 248, 0.18);
      color: var(--cyan);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .qbe-btn-toggle {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-dim);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }

    .qbe-btn-toggle:hover {
      color: var(--text-main);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .qbe-btn-toggle.active {
      background: rgba(56, 189, 248, 0.2);
      color: var(--cyan);
      border-color: var(--cyan);
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
    }

    .qbe-btn-run {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff !important;
      border: none;
      font-weight: 700;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
    }

    .qbe-btn-run:hover {
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.5);
      transform: translateY(-1px);
    }

    .qbe-select, .qbe-input {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 5px 28px 5px 8px;
      font-size: 11px;
      outline: none;
      color-scheme: dark;
    }
    .qbe-select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 12px 12px;
      cursor: pointer;
    }

    .qbe-select:focus, .qbe-input:focus {
      border-color: var(--cyan);
    }

    /* Relationship Canvas (Upper Pane) */
    .qbe-workbench {
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: rgba(10, 15, 29, 0.7);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 10px;
    }

    :root {
      --qbe-canvas-height: 480px;
      --qbe-grid-font-size: 11px;
      --qbe-grid-cell-padding: 4px 6px;
      --sql-editor-height: 380px;
      --ds-font-size: 11px;
      --ds-cell-padding: 5px 8px;
    }

    .qbe-canvas-viewport {
      position: relative;
      overflow: auto;
      min-height: 240px;
      height: var(--qbe-canvas-height, 480px);
      background: radial-gradient(circle at 50% 50%, rgba(30, 41, 59, 0.25) 0%, rgba(10, 15, 29, 0.95) 100%);
      background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1.2px, transparent 1.2px);
      background-size: 20px 20px;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      transition: height 0.15s ease-out;
    }

    .qbe-canvas-viewport.panning {
      cursor: grab !important;
      user-select: none;
    }
    .qbe-canvas-viewport.panning:active {
      cursor: grabbing !important;
    }

    .qbe-canvas-stage {
      position: relative;
      min-width: 3400px;
      min-height: 2400px;
      transform-origin: 0 0;
      transition: transform 0.08s ease-out;
    }

    .qbe-resizer-bar {
      height: 9px;
      margin: 4px 0;
      cursor: row-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      transition: background 0.15s ease;
      user-select: none;
      z-index: 10;
    }
    .qbe-resizer-bar:hover, .qbe-resizer-bar.resizing {
      background: rgba(56, 189, 248, 0.15);
    }
    .qbe-resizer-handle {
      width: 52px;
      height: 4px;
      background: var(--border-subtle);
      border-radius: 2px;
      transition: background 0.15s ease, width 0.15s ease;
    }
    .qbe-resizer-bar:hover .qbe-resizer-handle, .qbe-resizer-bar.resizing .qbe-resizer-handle {
      background: var(--cyan);
      width: 76px;
    }

    .qbe-zoom-controls, .qbe-room-controls {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .qbe-canvas-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: visible;
      z-index: 2;
    }

    .qbe-svg-join-halo {
      fill: none;
      stroke: transparent;
      stroke-width: 18;
      cursor: pointer;
      pointer-events: stroke;
    }

    .qbe-svg-join-halo:hover + .qbe-svg-join-line {
      stroke-width: 4px;
      filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.8));
    }

    .qbe-svg-join-line {
      fill: none;
      stroke-width: 2.5;
      cursor: pointer;
      pointer-events: stroke;
      transition: stroke-width 0.15s ease, filter 0.15s ease;
    }

    .qbe-svg-join-line:hover {
      stroke-width: 4px;
      filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.8));
    }

    .qbe-svg-join-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 8px;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid var(--cyan);
      border-radius: 12px;
      font-size: 10px;
      font-weight: 700;
      color: var(--cyan);
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
      transition: all 0.15s ease;
      white-space: nowrap;
      user-select: none;
      pointer-events: auto;
    }

    .qbe-svg-join-badge:hover {
      transform: scale(1.08);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
    }

    .qbe-tables-canvas {
      position: relative;
      display: flex;
      gap: 24px;
      padding: 16px;
      min-height: 230px;
      z-index: 3;
    }

    .qbe-table-card {
      min-width: 210px;
      max-width: 250px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      user-select: none;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
    }

    .qbe-table-card:hover {
      border-color: rgba(56, 189, 248, 0.4);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 10px rgba(56, 189, 248, 0.15);
    }

    .qbe-table-card.dragging {
      opacity: 0.65;
    }

    .qbe-table-card-header {
      background: rgba(30, 41, 59, 0.9);
      border-bottom: 1px solid var(--border-subtle);
      padding: 6px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 700;
      color: var(--cyan);
    }

    .qbe-table-card-fields {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      flex: 1;
      padding: 4px;
      gap: 2px;
      max-height: 170px;
    }

    .qbe-field-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-main);
      cursor: pointer;
      transition: all 0.12s ease;
      user-select: none;
    }

    .qbe-field-row:hover {
      background: rgba(56, 189, 248, 0.15);
      color: var(--cyan);
      transform: translateX(2px);
    }

    .qbe-field-connector {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.25);
      margin-right: 4px;
      flex-shrink: 0;
      transition: all 0.12s ease;
    }

    .qbe-field-row:hover .qbe-field-connector {
      background: var(--cyan);
      transform: scale(1.3);
      box-shadow: 0 0 6px var(--cyan);
    }

    .qbe-field-drop-target {
      background: rgba(56, 189, 248, 0.28) !important;
      outline: 2px dashed var(--cyan) !important;
      outline-offset: -2px;
      transform: scale(1.02);
    }

    .qbe-field-add-icon {
      opacity: 0;
      transition: opacity 0.15s ease;
      color: var(--cyan);
      font-weight: bold;
      font-size: 11px;
    }

    .qbe-field-row:hover .qbe-field-add-icon {
      opacity: 1;
    }

    /* Active Joins Bar */
    .qbe-joins-bar {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 6px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }

    .qbe-join-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 5px 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 5px;
      font-size: 11px;
      font-family: var(--font-mono);
      flex-wrap: wrap;
    }

    /* Microsoft Access Join Properties Modal */
    .access-join-table-row {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 12px;
      align-items: center;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 12px;
    }
    .access-join-table-col {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .access-join-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--cyan);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .access-join-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .access-join-radio-card {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .access-join-radio-card:hover {
      background: rgba(56, 189, 248, 0.06);
      border-color: rgba(56, 189, 248, 0.3);
    }
    .access-join-radio-card.selected {
      background: rgba(56, 189, 248, 0.12);
      border-color: var(--cyan);
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.15);
    }
    .access-join-radio-card input[type="radio"] {
      margin-top: 3px;
      accent-color: var(--cyan);
      cursor: pointer;
    }
    .access-join-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .access-join-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-main);
    }
    .access-join-desc {
      font-size: 11px;
      color: var(--text-dim);
      line-height: 1.35;
    }
    .access-venn-preview-row {
      display: grid;
      grid-template-columns: 160px 1fr;
      gap: 12px;
      align-items: center;
      background: rgba(10, 15, 29, 0.8);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 10px 14px;
    }
    .access-venn-svg {
      width: 150px;
      height: 90px;
    }
    .access-sql-box {
      font-family: var(--font-mono);
      font-size: 11px;
      color: #38bdf8;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 8px 10px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* QBE Matrix Grid (Lower Pane) */
    .qbe-matrix-container {
      background: rgba(10, 15, 29, 0.85);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow-x: auto;
      flex: 1;
      min-height: 240px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    }

    .qbe-matrix-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }

    .qbe-matrix-table tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .qbe-matrix-header-cell {
      position: sticky;
      left: 0;
      z-index: 5;
      background: rgba(15, 23, 42, 0.98);
      font-weight: 700;
      color: var(--cyan);
      padding: 6px 12px;
      border-right: 2px solid var(--cyan);
      white-space: nowrap;
      min-width: 110px;
      max-width: 110px;
      box-shadow: 2px 0 6px rgba(0, 0, 0, 0.3);
    }

    .qbe-matrix-col-cell {
      padding: var(--qbe-grid-cell-padding, 4px 6px);
      min-width: 160px;
      max-width: 220px;
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      vertical-align: middle;
    }

    .qbe-matrix-col-cell select,
    .qbe-matrix-col-cell input {
      width: 100%;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      padding: var(--qbe-grid-cell-padding, 4px 6px);
      color: var(--text-main);
      font-size: var(--qbe-grid-font-size, 11px);
      font-family: inherit;
      outline: none;
    }

    .qbe-matrix-col-cell select:focus,
    .qbe-matrix-col-cell input:focus {
      border-color: var(--cyan);
      background: rgba(0, 0, 0, 0.45);
    }

    .qbe-show-checkbox {
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .qbe-show-checkbox input[type="checkbox"] {
      width: 15px;
      height: 15px;
      accent-color: var(--cyan);
      cursor: pointer;
    }

    /* Datasheet View Table */
    .qbe-datasheet-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: rgba(10, 15, 29, 0.85);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      overflow: hidden;
    }

    .qbe-datasheet-container table.data-grid {
      font-size: var(--ds-font-size, 11px);
    }

    .qbe-datasheet-container table.data-grid td,
    .qbe-datasheet-container table.data-grid th {
      padding: var(--ds-cell-padding, 5px 8px);
      font-size: var(--ds-font-size, 11px);
    }

    .qbe-datasheet-toolbar {
      padding: 8px 12px;
      background: rgba(15, 23, 42, 0.9);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }

    .designer-sql-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: rgba(15, 23, 42, 0.82);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 12px;
      flex: 1;
    }

    .designer-sql-preview {
      width: 100%;
      min-height: var(--sql-editor-height, 240px);
      background: rgba(0, 0, 0, 0.45);
      color: #7dd3fc;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 12px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      resize: vertical;
      line-height: 1.5;
      outline: none;
    }

    .qbe-saved-chip {
      display: inline-flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    .qbe-saved-chip .btn {
      border: none;
      border-radius: 0;
      background: transparent;
      padding: 4px 8px;
      font-size: 11px;
    }

    .qbe-saved-chip .sidebar-mini-btn:hover {
      background: rgba(244, 63, 94, 0.3);
    }

    .designer-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 220px;
      border: 1px dashed var(--border-subtle);
      border-radius: 8px;
      color: var(--text-dim);
      background: rgba(15, 23, 42, 0.5);
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
    .modal-overlay.active,
    .modal-overlay.open {
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


    /* Microsoft Access Totals Row */
    .access-totals-foot {
      position: sticky;
      bottom: 0;
      background: rgba(15, 23, 42, 0.98);
      backdrop-filter: blur(10px);
      border-top: 2px solid var(--accent);
      z-index: 5;
    }
    .access-totals-foot td {
      padding: 6px 10px;
      font-weight: 700;
      font-size: 11px;
      color: var(--text-main);
      border-right: 1px solid var(--border-subtle);
    }
    .access-total-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--cyan);
      font-size: 10px;
      font-family: var(--font-mono);
    }

    /* Microsoft Access Quick Filter Bar */
    .access-filter-row {
      background: rgba(15, 23, 42, 0.95);
      border-bottom: 1px solid var(--border-subtle);
    }
    .access-filter-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border-subtle);
      border-radius: 3px;
      color: #fff;
      font-size: 11px;
      padding: 2px 6px;
      outline: none;
      box-sizing: border-box;
    }
    .access-filter-input:focus {
      border-color: var(--accent);
    }

    /* Microsoft Access Publication Report Styles & @media print */
    .access-report-sheet {
      background: #ffffff;
      color: #0f172a;
      padding: 32px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      max-width: 900px;
      margin: 0 auto;
    }
    .access-report-header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .access-report-title {
      font-size: 24px;
      font-weight: 800;
      color: #0369a1;
      letter-spacing: -0.5px;
    }
    .access-report-meta {
      font-size: 11px;
      color: #64748b;
      line-height: 1.5;
      text-align: right;
    }
    .access-report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-bottom: 20px;
    }
    .access-report-table th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
      text-align: left;
      padding: 8px 10px;
      border-bottom: 2px solid #cbd5e1;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .access-report-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }
    .access-report-table tr:nth-child(even) td {
      background: #f8fafc;
    }
    .access-report-summary {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 600;
      color: #1e293b;
    }

    @media print {
      body * {
        visibility: hidden;
      }
      #accessReportModal, #accessReportModal * {
        visibility: visible;
      }
      #accessReportModal {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        background: transparent !important;
        display: block !important;
      }
      .modal-header, .modal-footer, .modal-close {
        display: none !important;
      }
      .modal-card {
        box-shadow: none !important;
        border: none !important;
        background: transparent !important;
        max-width: 100% !important;
        padding: 0 !important;
      }
      .access-report-sheet {
        box-shadow: none !important;
        padding: 0 !important;
      }
    }

    /* Enum Cards & Partition Cards */
    .enum-card {
      background: var(--surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: border-color 0.2s;
    }
    .enum-card:hover {
      border-color: var(--accent);
    }
    .enum-badge {
      display: inline-block;
      padding: 3px 8px;
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.4);
      border-radius: 12px;
      color: #d8b4fe;
      font-size: 11px;
      font-weight: 600;
    }

    ${CRUD_STYLE}
    ${MACRO_STYLE}

    /* Saved Queries / Macros groups appended to the sidebar tree */
    #sidebarMacroGroups .tree-group { margin: 6px 0; border-radius: 6px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.04); }
    #sidebarMacroGroups .tree-header { padding: 6px 8px; font-size: 11px; font-weight: 700; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
    #sidebarMacroGroups .tree-header:hover { background: rgba(255, 255, 255, 0.04); color: var(--text-main); }
    #sidebarMacroGroups .tree-header-left { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; }
    #sidebarMacroGroups .tree-arrow { font-size: 8px; color: var(--text-dim); width: 12px; text-align: center; }
    #sidebarMacroGroups .tree-badge { font-size: 9px; background: rgba(255, 255, 255, 0.08); padding: 1px 6px; border-radius: 10px; color: var(--text-dim); font-family: var(--font-mono); }
    #sidebarMacroGroups .tree-items { display: flex; flex-direction: column; padding: 3px 6px; gap: 2px; }
    #sidebarMacroGroups .tree-item-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
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

    <!-- Action Toolbar with 22 Theme Switcher -->
    <div class="header-actions">
      <div class="theme-control">
        <span class="theme-control-label">Theme</span>
        <select id="ddStudioTheme" class="btn" onchange="applyPostgresStudioTheme(this.value)" title="Switch Workstation Theme" style="padding: 5px 20px 5px 4px; font-weight: 700; cursor: pointer; color: var(--text-main); border: none; background: transparent; outline: none;">
          <option value="midnight">🌙 Midnight Modern (Dark)</option>
          <option value="codefreelance">💚 CodeFreelance (Hacker Green)</option>
          <option value="sonoma_emerald">🌲 Sonoma Emerald (macOS Dark)</option>
          <option value="dracula">🧛 Dracula Pro (Purple Dark)</option>
          <option value="nord">❄️ Nord Arctic (Frosted Slate)</option>
          <option value="cyberpunk">⚡ Cyberpunk Neon (Pink / Yellow)</option>
          <option value="apple_dark">🍎 Apple Dark (San Francisco)</option>
          <option value="apple_light">🍏 Apple Light (Clean Cupertino)</option>
          <option value="solarized_dark">☀️ Solarized Dark (Teal Classic)</option>
          <option value="github_dark">🐙 GitHub Dark (Dimmed Enterprise)</option>
          <option value="win95">💾 Windows 95 (Teal / Classic Gray)</option>
          <option value="gameboy">🎮 Game Boy (DMG-01 Classic Dot Matrix)</option>
          <option value="c64">🕹️ Commodore 64 (Indigo / Retro Lavender)</option>
          <option value="mac_classic">🖥️ Mac Classic / System 7 (Platinum Gray)</option>
          <option value="amber_crt">📟 Amber CRT / VT220 (Phosphor Monochrome)</option>
          <option value="matrix">🟢 The Matrix / Green CRT (Phosphor Terminal)</option>
          <option value="synthwave">🌆 Synthwave '84 / Outrun (Neon Magenta)</option>
          <option value="amiga">✨ Commodore Amiga Workbench (Topaz Blue)</option>
          <option value="nextstep">⬛ NeXTSTEP / Steve Jobs Black (Display PostScript)</option>
          <option value="mac_os_aqua">💧 Mac OS X Aqua (Brushed Metal / Glossy Blue)</option>
          <option value="hotdog_stand">🌭 Windows 3.1 Hot Dog Stand (High-Contrast Red &amp; Yellow)</option>
          <option value="playstation">🎮 Sony PlayStation 1 BIOS (Midnight Titanium)</option>
        </select>
      </div>

      <button class="btn btn-primary" onclick="openConnectionModal()" title="Configure manual host/credentials or switch databases">🔌 Connection Config...</button>
      <button class="btn" onclick="openDatabaseBrowser()" title="Browse and switch server databases">📂 Databases...</button>
      <button id="btnSeedDatabase" class="btn" onclick="seedSampleDatabase()" title="Create rich PostgreSQL sample tables with UUID, JSONB, native Arrays and Materialized Views">🌱 Seed Sample DB</button>
      <button class="btn" onclick="triggerVacuumAnalyze()" title="Run VACUUM ANALYZE to reclaim storage and update planner statistics">🧹 VACUUM ANALYZE</button>
      <button class="btn" onclick="checkIntegrity()" title="Run schema-wide foreign key, table, and index integrity verification">🛡️ Integrity Check</button>
      <button class="btn" id="btnDbBackupDump" onclick="openDatabaseDumpModal()" title="1-Click PostgreSQL Database Backup &amp; SQL Dump Generator (Schema &amp; Data)">💾 DB Backup / Dump</button>
      <button class="btn" id="btnFullscreen" onclick="window.doToggleFullscreen()" title="Toggle Fullscreen (F11 / ⌃⌘F)">⛶ Fullscreen</button>
      <button class="btn btn-primary" onclick="runEditorQuery()">▶ Run SQL (Cmd+Enter)</button>
    </div>
  </header>

  <!-- Top KPI Telemetry Banner (5 Enterprise Cards matching MySQL Studio) -->
  <section class="kpi-row" id="kpiRow">
    <div class="kpi-card kpi-clickable" onclick="openDatabaseDialog('config')" title="Click to view or edit PostgreSQL connection configuration" style="cursor: pointer;">
      <div class="kpi-title">Database Profile <span>🐘</span></div>
      <div class="kpi-value" id="kpiDbName">mydb</div>
      <div class="kpi-sub" id="kpiDbPath">localhost:5432 • public</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Storage Footprint <span>💾</span></div>
      <div class="kpi-value" id="kpiSize">0 B (Cluster)</div>
      <div class="kpi-sub" id="kpiEngine">PostgreSQL 18.6 • bun:postgres</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Schema Objects <span>📊</span></div>
      <div class="kpi-value" id="kpiTables">0 Tables</div>
      <div class="kpi-sub" id="kpiViewsIndices"><span id="kpiViews">0</span> Views • <span id="kpiMatViews" style="color: var(--cyan);">0</span> MatViews</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Total Records <span>📈</span></div>
      <div class="kpi-value" id="kpiRows">0 Rows</div>
      <div class="kpi-sub" id="kpiJournal">Buffers: <span id="kpiBuffers">128MB</span> • <span id="kpiConnections">1</span> Conn</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Execution Latency <span>⚡</span></div>
      <div class="kpi-value" id="kpiLatency" style="color: var(--emerald);">0.00 ms</div>
      <div class="kpi-sub" id="kpiLatencySub">Native sub-ms execution</div>
    </div>
  </section>

  <!-- Workspace Body -->
  <div class="workspace">
    <!-- Left Object Explorer Sidebar -->
    <aside id="sidebar">
      <!-- Database Connection Status & Browse -->
      <div class="sidebar-db-card">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 10px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">Active Database</span>
          <span class="brand-badge" id="sidebarDbBadge">CONNECTED</span>
        </div>
        <div style="font-size: 12px; font-weight: 700; color: var(--cyan); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" id="sidebarDbName">mydb</div>
        <div style="display: flex; gap: 4px;">
          <button class="sidebar-mini-btn" style="flex: 1; justify-content: center;" onclick="openDatabaseDialog('config')">🔌 Config...</button>
          <button class="sidebar-mini-btn" style="flex: 1; justify-content: center;" onclick="openDatabaseDialog('databases')">📂 Databases</button>
        </div>
      </div>

      <div class="sidebar-search-box">
        <input type="text" class="sidebar-search-input" id="searchObjects" placeholder="Search tables, views, matviews..." oninput="filterSidebarTree(this.value)">
        <div class="sidebar-subbar">
          <button class="sidebar-mini-btn" onclick="toggleAllGroups()">📁 Toggle All</button>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="sidebar-mini-btn" onclick="adjustSidebarWidth(-30)" title="Shrink sidebar">◀</button>
            <button class="sidebar-mini-btn" onclick="toggleSidebarWidth()" title="Toggle standard/wide">↔ Width</button>
            <button class="sidebar-mini-btn" onclick="adjustSidebarWidth(30)" title="Expand sidebar">▶</button>
          </div>
        </div>
      </div>

      <div class="sidebar-tree object-tree" id="sidebarTree">
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

        <!-- Saved Queries & Macros (rendered by the macro designer script) -->
        <div id="sidebarMacroGroups"></div>

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

    <!-- Draggable Sidebar Resizer Handle -->
    <div class="sidebar-resizer" id="sidebarResizer" title="Drag to resize sidebar width"></div>

    <!-- Main Workstation View Area -->
    <main>
      <!-- SQL Query Banner (Persistent Top Collapsible Editor) -->
      <section class="editor-banner" id="editorBanner">
        <div class="editor-top">
          <div class="preset-selector-wrap">
            <span style="font-size: 11px; color: var(--text-dim); font-weight: 600;">SQL Snippet:</span>
            <select class="preset-select" id="presetSelect" onchange="applyPreset(this.value)">
              <option value="">-- Choose PostgreSQL Query Snippet --</option>
            </select>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="editor-timing" id="queryTiming">Ready to execute query</div>
            <button class="sidebar-mini-btn" id="btnToggleEditor" onclick="toggleEditorCollapse()" title="Toggle SQL Editor visibility" style="padding: 2px 8px; font-size: 10px;">▲ Minimize</button>
          </div>
        </div>

        <div class="sql-input-box">
          <textarea class="sql-textarea" id="sqlEditor" placeholder="Enter PostgreSQL SQL statement (e.g. SELECT * FROM customers;)..." onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') runEditorQuery()">SELECT * FROM products LIMIT 25;</textarea>
          <div class="editor-controls">
            <div class="editor-controls-left">
              <button class="btn btn-primary" onclick="runEditorQuery()">🚀 Execute (Cmd+Enter)</button>
              <button class="btn" onclick="explainCurrentQuery()">🔍 Explain Plan</button>
              <button class="btn" onclick="openCodeGenFromEditor()" title="Translate this SQL to Python / Bun / V using native SQLite">🧬 Code</button>
              <button class="btn" onclick="clearEditor()">🧹 Clear</button>
              <button class="btn" onclick="exportResults('csv')">📋 Export CSV</button>
              <button class="btn" onclick="exportResults('json')">💾 Export JSON</button>
              <button class="btn" onclick="exportResults('sql')">📝 Export SQL</button>
            </div>
            <div style="font-size: 11px; color: var(--text-dim);" id="resultSummary">0 rows returned</div>
          </div>
        </div>
      </section>

      <!-- Workstation Navigation Tabs -->
      <div class="tabs-bar view-tabs" id="tabsBar">
        <div class="tab-btn active" id="tabBtnGrid" onclick="switchTab('grid')">📊 Data Grid</div>
        <div class="tab-btn" id="tabBtnSql" onclick="switchTab('sql')">⚡ SQL Query Console</div>
        <div class="tab-btn" id="tabBtnDesigner" onclick="switchTab('designer')">📐 Visual Query Designer</div>
        ${MACRO_TAB_BTN}
        <div class="tab-btn" id="tabBtnSchema" onclick="switchTab('schema')">🏛️ Schema Designer &amp; DDL</div>
        <div class="tab-btn" id="tabBtnTypes" onclick="switchTab('types')">🏷️ Custom Types &amp; Enums</div>
        <div class="tab-btn" id="tabBtnPartitions" onclick="switchTab('partitions')">📦 Partition Trees</div>
        <div class="tab-btn" id="tabBtnExtensions" onclick="switchTab('extensions')">🧩 Extensions Manager</div>
        <div class="tab-btn" id="tabBtnActivity" onclick="switchTab('activity')">⚡ Live Activity Monitor</div>
        <div class="tab-btn" id="tabBtnReplication" onclick="switchTab('replication')">🔄 Streaming Replication &amp; WAL</div>
        <div class="tab-btn" id="tabBtnExplain" onclick="switchTab('explain')">🔍 Query Plan (EXPLAIN)</div>
        <div class="tab-btn" id="tabBtnSequences" onclick="switchTab('sequences')">🔢 Sequences</div>
        <div class="tab-btn" id="tabBtnRoles" onclick="switchTab('roles')">👥 Roles &amp; Grants</div>
        <div class="tab-btn" id="tabBtnTriggers" onclick="switchTab('triggers')">⚡ Triggers &amp; Functions</div>
        <div class="tab-btn" id="tabBtnTelemetry" onclick="switchTab('telemetry')">🚀 Performance &amp; Telemetry</div>
        <div class="tab-btn" id="tabBtnAudit" onclick="switchTab('audit')">⚡ Telemetry &amp; Audit Log</div>
        <div class="tab-btn" id="tabBtnPragma" onclick="switchTab('pragma')">⚙️ Engine Tuning (PRAGMA)</div>
        <div class="tab-btn" id="tabBtnJson" onclick="switchTab('json')">💻 Raw JSON Inspector</div>
      </div>

      <!-- TAB 1: Tabular Data Grid & Access Form View -->
      <div class="tab-pane active" id="tabGrid">
        <div class="grid-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--cyan);" id="gridTargetTitle">No table selected</span>
            <div style="display: flex; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 2px;">
              <button class="btn btn-sm btn-primary" id="btnViewDatasheet" onclick="switchGridMode('datasheet')">📋 Datasheet</button>
              <button class="btn btn-sm" id="btnViewForm" onclick="switchGridMode('form')">📑 Form View</button>
            </div>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-sm" id="btnToggleTotals" onclick="toggleAccessTotalsRow()" title="Toggle Microsoft Access Totals Row (Sum, Avg, Count, Min, Max)">🧮 Totals</button>
              <button class="btn btn-sm" id="btnToggleFilterBar" onclick="toggleQuickFilterBar()" title="Toggle Access Column Filter Bar">⚡ Filter Bar</button>
              <button class="btn btn-sm" id="btnAccessReport" onclick="openAccessReportModal()" title="Generate Microsoft Access Printable Report / PDF">🖨️ Report</button>
            </div>
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
            <thead>
              <tr id="gridHeaderRow"><th>Status</th></tr>
              <tr id="gridFilterBarRow" class="access-filter-row" style="display: none;"><th>⚡</th></tr>
            </thead>
            <tbody id="gridBody"><tr><td>Select a table from the sidebar or run a query.</td></tr></tbody>
            <tfoot id="gridTotalsFoot" class="access-totals-foot" style="display: none;"></tfoot>
          </table>
        </div>
        <div id="gridFormContainer" class="access-form-layout" style="display: none;">
          <div class="access-form-scroll" id="accessFormFields">
            <div style="color: var(--text-dim); text-align: center; padding: 40px;">Select a table or record to inspect in Form View.</div>
          </div>
          <div class="access-record-nav" id="gridFormNavBar">
            <button class="btn btn-sm" onclick="formNavRecord('first')" title="First Record (Home)">|◀</button>
            <button class="btn btn-sm" onclick="formNavRecord('prev')" title="Previous Record (PageUp)">◀</button>
            <span style="font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 4px;">
              Record: <input type="number" id="formCurrentRecordInput" min="1" value="1" onchange="formJumpToRecord(parseInt(this.value, 10))" style="width: 50px; text-align: center; padding: 2px 4px; font-size: 11px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); border-radius: 4px; color: #fff;"> of <span id="formTotalRecords">0</span>
            </span>
            <button class="btn btn-sm" onclick="formNavRecord('next')" title="Next Record (PageDown)">▶</button>
            <button class="btn btn-sm" onclick="formNavRecord('last')" title="Last Record (End)">▶|</button>
            <button class="btn btn-sm btn-primary" onclick="formNewRecord()" title="New Blank Record">➕ New</button>
            <div style="width: 1px; height: 16px; background: var(--border-subtle); margin: 0 4px;"></div>
            <button class="btn btn-sm btn-primary" onclick="formSaveRecord()" title="Save Record (Update/Insert)">💾 Save</button>
            <button class="btn btn-sm btn-danger" onclick="formDeleteRecord()" title="Delete Record">🗑️ Delete</button>
            <button class="btn btn-sm" onclick="formDuplicateRecord()" title="Duplicate Record">📄 Duplicate</button>
            <span id="formStatusBadge" class="brand-badge" style="margin-left: 8px; font-size: 10px;">Ready</span>
          </div>
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
        <div class="designer-layout" id="designerContainer">
          <div class="designer-empty">Load a schema from the sidebar to begin building a visual query.</div>
        </div>
      </div>

      ${MACRO_HTML}

      <!-- TAB: Schema Designer & DDL -->
      <div class="tab-pane" id="tabSchema">
        <div class="schema-layout" id="schemaContainer" style="padding: 14px; overflow-y: auto;">
          <div class="card" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 16px;">
            <div class="card-title">Select a table or view from the sidebar to inspect its columns, keys, and DDL</div>
          </div>
        </div>
      </div>

      <!-- TAB: Custom Types & ENUMs Explorer (Postgres Specialty) -->
      <div class="tab-pane" id="tabTypes">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--cyan);">PostgreSQL Custom ENUM Types (pg_enum &amp; pg_type)</span>
            <input type="text" id="enumSearchInput" placeholder="Filter enum types..." oninput="filterEnumTypes(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px; width: 200px; outline: none;">
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-primary" onclick="openCreateEnumModal()">➕ Create ENUM Type</button>
            <button class="btn btn-sm" onclick="loadEnumTypes()">🔄 Refresh</button>
          </div>
        </div>
        <div style="flex: 1; padding: 16px; overflow: auto;">
          <div class="ext-grid" id="enumTypesGrid">
            <!-- Populated dynamically -->
          </div>
        </div>
      </div>

      <!-- TAB: Partition Trees Explorer (Postgres Specialty) -->
      <div class="tab-pane" id="tabPartitions">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--amber);">Declarative Partition Trees (pg_partitioned_table &amp; pg_inherits)</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="loadPartitions()">🔄 Refresh</button>
          </div>
        </div>
        <div style="flex: 1; padding: 16px; overflow: auto;" id="partitionsContainer">
          <!-- Populated dynamically -->
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
        <div id="activityLocksAlert" style="margin: 8px 12px 0 12px;"></div>
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

      <!-- TAB: Streaming Replication & WAL Status (Postgres Specialty) -->
      <div class="tab-pane" id="tabReplication">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--emerald);">Physical &amp; Logical Replication Diagnostics (pg_stat_replication)</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="loadReplicationStatus()">🔄 Refresh</button>
          </div>
        </div>
        <div style="flex: 1; padding: 16px; overflow: auto; display: flex; flex-direction: column; gap: 14px;" id="replicationContainer">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- TAB 6: Query Plan Visualizer -->
      <div class="tab-pane" id="tabExplain">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--cyan);">PostgreSQL Execution Plan (EXPLAIN ANALYZE, BUFFERS)</span>
            <span id="explainLatencyBadge" class="brand-badge" style="display: none;">0ms</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-primary" onclick="explainCurrentQuery()">Re-run Explain</button>
          </div>
        </div>
        <div style="flex: 1; padding: 16px; overflow: auto; display: flex; flex-direction: column; gap: 14px;">
          <div id="explainContainer" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="card">
              <div class="card-title">Run "Explain" on any SQL query to visualize the execution plan tree, actual vs estimated row counts, cost metrics, and buffer cache hits.</div>
            </div>
          </div>
          <div class="card" style="border: 1px solid var(--border-subtle); padding: 14px; background: rgba(8, 14, 26, 0.85);">
            <div class="card-title" style="margin-bottom: 8px; color: var(--cyan); font-size: 11px;">RAW EXPLAIN ANALYZE OUTPUT</div>
            <pre id="explainOutput" style="font-family: var(--font-mono); font-size: 12px; color: #a5f3fc; line-height: 1.6; white-space: pre-wrap; margin: 0;">Run "Explain" on any SQL query to visualize the execution plan tree, actual vs estimated row counts, cost metrics, and buffer cache hits.</pre>
          </div>
        </div>
      </div>

      <!-- TAB: Sequences Manager -->
      <div class="tab-pane" id="tabSequences">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--cyan);">PostgreSQL Sequences Manager</span>
            <input type="text" id="seqSearchInput" placeholder="Filter sequences..." oninput="filterSequences(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px; width: 180px; outline: none;">
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="loadSequences()">🔄 Refresh</button>
          </div>
        </div>
        <div class="grid-scroll">
          <table class="data-grid" id="sequencesGrid">
            <thead>
              <tr>
                <th style="width: 220px;">Sequence Name</th>
                <th style="width: 120px;">Schema</th>
                <th style="width: 120px; text-align: right;">Current Value</th>
                <th style="width: 100px; text-align: right;">Min Value</th>
                <th style="width: 160px; text-align: right;">Max Value</th>
                <th style="width: 100px; text-align: right;">Increment</th>
                <th style="width: 80px; text-align: center;">Cycled</th>
                <th style="width: 140px; text-align: center;">Actions</th>
              </tr>
            </thead>
            <tbody id="sequencesBody">
              <tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">Loading sequences...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB: Roles & Privileges -->
      <div class="tab-pane" id="tabRoles">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--emerald);">PostgreSQL Roles &amp; Privileges (pg_roles)</span>
            <input type="text" id="roleSearchInput" placeholder="Filter roles..." oninput="filterRoles(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px; width: 180px; outline: none;">
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="loadRoles()">🔄 Refresh</button>
          </div>
        </div>
        <div class="grid-scroll">
          <table class="data-grid" id="rolesGrid">
            <thead>
              <tr>
                <th style="width: 180px;">Role Name</th>
                <th style="width: 110px; text-align: center;">Superuser</th>
                <th style="width: 110px; text-align: center;">Can Login</th>
                <th style="width: 110px; text-align: center;">Create DB</th>
                <th style="width: 110px; text-align: center;">Create Role</th>
                <th style="width: 110px; text-align: center;">Replication</th>
                <th style="width: 120px; text-align: right;">Conn Limit</th>
                <th>Valid Until</th>
              </tr>
            </thead>
            <tbody id="rolesBody">
              <tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">Loading roles...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB: Triggers & Functions -->
      <div class="tab-pane" id="tabTriggers">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--amber);">Triggers &amp; Stored Functions Catalog</span>
            <div style="display: flex; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 2px;">
              <button class="btn btn-sm btn-primary" id="btnToggleTriggers" onclick="setTriggersSubTab('triggers')">⚡ Triggers</button>
              <button class="btn btn-sm" id="btnToggleFunctions" onclick="setTriggersSubTab('functions')">📦 Functions</button>
            </div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="loadTriggersAndFunctions()">🔄 Refresh</button>
          </div>
        </div>
        <div class="grid-scroll" id="triggersContainer">
          <table class="data-grid" id="triggersGrid">
            <thead>
              <tr>
                <th style="width: 200px;">Trigger Name</th>
                <th style="width: 180px;">Target Table</th>
                <th style="width: 120px;">Event</th>
                <th style="width: 120px;">Timing</th>
                <th style="width: 120px;">Orientation</th>
                <th>Action Statement / Routine</th>
              </tr>
            </thead>
            <tbody id="triggersBody">
              <tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 20px;">Loading triggers...</td></tr>
            </tbody>
          </table>
          <table class="data-grid" id="functionsGrid" style="display: none;">
            <thead>
              <tr>
                <th style="width: 220px;">Routine / Function Name</th>
                <th style="width: 120px;">Schema</th>
                <th style="width: 140px;">Return Type</th>
                <th style="width: 100px;">Type</th>
                <th style="width: 100px;">Language</th>
                <th>Argument Types</th>
              </tr>
            </thead>
            <tbody id="functionsBody">
              <tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 20px;">Loading functions...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- TAB: Performance & Telemetry -->
      <div class="tab-pane" id="tabTelemetry">
        <div class="activity-toolbar">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: var(--rose);">PostgreSQL Performance &amp; Bloat Telemetry</span>
            <span id="telemetryStatusBadge" class="brand-badge">Optimal</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm" onclick="runGlobalVacuumAnalyze()">🧹 VACUUM ANALYZE</button>
            <button class="btn btn-sm" onclick="loadTelemetry()">🔄 Refresh</button>
          </div>
        </div>
        <div style="flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px;">
          <!-- Telemetry KPI Cards -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
            <div class="kpi-card" style="border-left: 3px solid var(--cyan);">
              <div class="kpi-title">Buffer Cache Hit Ratio</div>
              <div class="kpi-value" id="kpiHitRatio" style="color: var(--cyan);">--%</div>
              <div style="font-size: 10px; color: var(--text-dim);" id="kpiHitRatioSub">Blocks read from RAM</div>
            </div>
            <div class="kpi-card" style="border-left: 3px solid var(--emerald);">
              <div class="kpi-title">Database Total Size</div>
              <div class="kpi-value" id="kpiDbSize" style="color: var(--emerald);">--</div>
              <div style="font-size: 10px; color: var(--text-dim);">On-disk footprint</div>
            </div>
            <div class="kpi-card" style="border-left: 3px solid var(--amber);">
              <div class="kpi-title">Active Locks</div>
              <div class="kpi-value" id="kpiActiveLocks" style="color: var(--amber);">0</div>
              <div style="font-size: 10px; color: var(--text-dim);" id="kpiGrantedLocks">0 granted</div>
            </div>
            <div class="kpi-card" style="border-left: 3px solid #a855f7;">
              <div class="kpi-title">Transactions (Commits / Rollbacks)</div>
              <div class="kpi-value" id="kpiTxSummary" style="color: #a855f7; font-size: 16px;">--</div>
              <div style="font-size: 10px; color: var(--text-dim);" id="kpiTxSub">Commit Success Rate: --%</div>
            </div>
            <div class="kpi-card" style="border-left: 3px solid var(--rose);">
              <div class="kpi-title">Total Dead Tuples (Bloat)</div>
              <div class="kpi-value" id="kpiTotalDeadTuples" style="color: var(--rose);">0</div>
              <div style="font-size: 10px; color: var(--text-dim);" id="kpiTotalLiveTuples">0 live tuples</div>
            </div>
          </div>

          <!-- Table Bloat & Dead Tuples Table -->
          <div style="background: rgba(8, 14, 26, 0.7); border: 1px solid var(--border-subtle); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 10px 14px; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; font-weight: 700; color: var(--text-main);">User Tables Dead Tuples &amp; Maintenance Diagnostics</span>
              <span style="font-size: 11px; color: var(--text-dim);">Shows bloat, vacuum history, and autovacuum status</span>
            </div>
            <div style="overflow-x: auto;">
              <table class="data-grid" id="tableStatsGrid">
                <thead>
                  <tr>
                    <th>Table Name</th>
                    <th>Schema</th>
                    <th style="text-align: right;">Live Tuples</th>
                    <th style="text-align: right;">Dead Tuples</th>
                    <th style="text-align: right;">Bloat %</th>
                    <th>Last Vacuum</th>
                    <th>Last AutoVacuum</th>
                    <th>Last Analyze</th>
                    <th style="text-align: center; width: 140px;">Maintenance</th>
                  </tr>
                </thead>
                <tbody id="tableStatsBody">
                  <tr><td colspan="9" style="text-align: center; color: var(--text-dim); padding: 20px;">Loading maintenance telemetry...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB: Telemetry & Audit Log -->
      <div class="tab-pane" id="tabAudit">
        <div style="padding: 16px; display: flex; flex-direction: column; gap: 10px; height: 100%;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 700; font-size: 13px; color: var(--cyan);">⚡ Audit Trail &amp; Workstation Telemetry</div>
            <button class="btn btn-sm" onclick="loadAuditLogs()">🔄 Refresh Audit Trail</button>
          </div>
          <div class="code-box" id="auditLogBox" style="flex: 1; overflow-y: auto; font-family: var(--font-mono); font-size: 11px; line-height: 1.6; background: rgba(0,0,0,0.4); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle); color: #cbd5e1; white-space: pre-wrap;">[SYSTEM] Postgres Studio Pro initialized. All subsystems ready.</div>
        </div>
      </div>

      <!-- TAB: Engine Tuning & Server Settings (PRAGMA / SHOW) -->
      <div class="tab-pane" id="tabPragma">
        <div class="schema-layout" style="padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
          <div class="card" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 14px;">
            <div class="card-title" style="font-weight: 700; color: var(--cyan); margin-bottom: 8px;">⚙️ PostgreSQL Engine Configuration &amp; Performance Tuning</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px;">
              <button class="btn" onclick="togglePragma('work_mem', '64MB')">🧠 Set 64MB work_mem</button>
              <button class="btn" onclick="togglePragma('statement_timeout', '30000')">⏱️ Set 30s Statement Timeout</button>
              <button class="btn" onclick="togglePragma('synchronous_commit', 'off')">⚡ Tune synchronous_commit=off</button>
              <button class="btn" onclick="triggerVacuumAnalyze()">🧹 Run Full VACUUM ANALYZE</button>
              <button class="btn" onclick="runPragmaCommand('ANALYZE')">📈 Run Planner ANALYZE</button>
              <button class="btn" onclick="checkIntegrity()">🛡️ Run Schema Integrity Check</button>
            </div>
          </div>
          <!-- PostgreSQL GUC Configuration Tuner Card -->
          <div class="card" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: var(--cyan);">PostgreSQL GUC Parameter Catalog (pg_settings)</span>
                <span id="gucSettingsCountBadge" class="brand-badge">0 settings</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="text" id="gucSearchInput" placeholder="Filter parameters (e.g. buffers, mem, timeout)..." oninput="filterGucSettings(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px; width: 220px; outline: none;">
                <button class="btn btn-sm" onclick="loadPragmaSettings()">🔄 Refresh</button>
              </div>
            </div>
            
            <div style="display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-primary" id="btnGucAll" onclick="setGucCategory('all')">All</button>
              <button class="btn btn-sm" id="btnGucMem" onclick="setGucCategory('memory')">🧠 Memory</button>
              <button class="btn btn-sm" id="btnGucPlan" onclick="setGucCategory('planner')">🎯 Query Planner</button>
              <button class="btn btn-sm" id="btnGucWal" onclick="setGucCategory('wal')">💾 WAL &amp; Checkpoints</button>
              <button class="btn btn-sm" id="btnGucConn" onclick="setGucCategory('connections')">🔌 Connections</button>
              <button class="btn btn-sm" id="btnGucVac" onclick="setGucCategory('autovacuum')">🧹 Autovacuum</button>
            </div>

            <div style="overflow: auto; max-height: 380px; border: 1px solid var(--border-subtle); border-radius: 6px;">
              <table class="data-grid" id="gucSettingsTable">
                <thead>
                  <tr>
                    <th style="width: 220px;">Parameter Name</th>
                    <th style="width: 140px;">Current Setting</th>
                    <th style="width: 80px;">Unit</th>
                    <th style="width: 130px;">Category</th>
                    <th style="width: 90px;">Context</th>
                    <th>Description</th>
                    <th style="width: 80px; text-align: center;">Action</th>
                  </tr>
                </thead>
                <tbody id="gucSettingsBody">
                  <tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 18px;">Click "Load pg_settings" or select a category to view PostgreSQL runtime configuration.</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <div class="card-title" style="font-weight: 700; color: var(--text-muted); margin-bottom: 0;">Server Tuning Output &amp; Diagnostics</div>
            </div>
            <pre class="code-box" id="pragmaOutputBox" style="height: 120px; overflow-y: auto; background: rgba(0,0,0,0.4); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); margin: 0; white-space: pre-wrap;">Ready.</pre>
          </div>
        </div>
      </div>

      <!-- TAB: Raw JSON Inspector -->
      <div class="tab-pane" id="tabJson">
        <div class="activity-toolbar">
          <span style="font-weight: 700; color: var(--amber);">Raw JSON Telemetry Inspector</span>
          <button class="btn btn-sm" onclick="copyJsonInspector()">📋 Copy JSON</button>
        </div>
        <div style="flex: 1; padding: 14px; overflow: auto;">
          <pre id="rawJsonBox" class="code-box" style="font-family: var(--font-mono); font-size: 12px; color: #fde68a; line-height: 1.5; white-space: pre-wrap;">{\n  "status": "ready"\n}</pre>
          <div id="jsonInspectorBox" style="display: none;">{\n  "status": "ready"\n}</div>
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

  <!-- MODAL: Access Join Properties Dialog with SVG Venn Preview -->
  <div class="modal-overlay" id="accessJoinPropertiesModal" onclick="if(event.target === this) closeJoinPropertiesModal()">
    <div class="modal-card" style="max-width: 680px;">
      <div class="modal-header">
        <div class="modal-title">
          <span>📐</span>
          <span>Join Properties (Microsoft Access Relational Editor)</span>
        </div>
        <button class="modal-close" onclick="closeJoinPropertiesModal()" title="Close dialog">✕</button>
      </div>
      <div class="modal-body" style="gap: 14px;">
        <div style="font-size: 11px; color: var(--text-dim);">
          Specify the relationship between fields in both tables. Choose how matched and unmatched rows are included in the result set.
        </div>

        <!-- Table and Field Selection -->
        <div class="access-join-table-row">
          <div class="access-join-table-col">
            <span class="access-join-label">Left Table Name</span>
            <select id="jpLeftTable" class="qbe-select" onchange="onJoinPropTableChange('left')" style="font-weight: 700;"></select>
            <span class="access-join-label" style="margin-top: 4px;">Left Column</span>
            <select id="jpLeftField" class="qbe-select" onchange="updateJoinPropPreview()"></select>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
            <button class="btn btn-sm" onclick="swapJoinPropDirection()" title="Swap Left and Right Tables" style="padding: 6px 10px; font-weight: bold;">⇄ Swap</button>
            <span style="font-size: 11px; color: var(--cyan); font-weight: bold;">=</span>
          </div>
          <div class="access-join-table-col">
            <span class="access-join-label">Right Table Name</span>
            <select id="jpRightTable" class="qbe-select" onchange="onJoinPropTableChange('right')" style="font-weight: 700;"></select>
            <span class="access-join-label" style="margin-top: 4px;">Right Column</span>
            <select id="jpRightField" class="qbe-select" onchange="updateJoinPropPreview()"></select>
          </div>
        </div>

        <!-- Access 5 Join Types (INNER, LEFT, RIGHT, FULL OUTER, CROSS) -->
        <div class="access-join-options">
          <label class="access-join-radio-card" id="cardJpInner" onclick="selectJoinPropType('INNER')">
            <input type="radio" name="accessJoinType" id="radioJpInner" value="INNER" onchange="onJoinPropTypeChange('INNER')">
            <div class="access-join-text">
              <span class="access-join-title">1: Only include rows where the joined fields from both tables are equal.</span>
              <span class="access-join-desc">INNER JOIN — Returns only records where a match is found in both '<span class="jp-left-name">Left</span>' and '<span class="jp-right-name">Right</span>'.</span>
            </div>
          </label>

          <label class="access-join-radio-card" id="cardJpLeft" onclick="selectJoinPropType('LEFT')">
            <input type="radio" name="accessJoinType" id="radioJpLeft" value="LEFT" onchange="onJoinPropTypeChange('LEFT')">
            <div class="access-join-text">
              <span class="access-join-title">2: Include ALL records from '<span class="jp-left-name">Left</span>' and only those records from '<span class="jp-right-name">Right</span>' where the joined fields are equal.</span>
              <span class="access-join-desc">LEFT OUTER JOIN — Preserves all records from '<span class="jp-left-name">Left</span>', filling in NULLs for non-matching records from '<span class="jp-right-name">Right</span>'.</span>
            </div>
          </label>

          <label class="access-join-radio-card" id="cardJpRight" onclick="selectJoinPropType('RIGHT')">
            <input type="radio" name="accessJoinType" id="radioJpRight" value="RIGHT" onchange="onJoinPropTypeChange('RIGHT')">
            <div class="access-join-text">
              <span class="access-join-title">3: Include ALL records from '<span class="jp-right-name">Right</span>' and only those records from '<span class="jp-left-name">Left</span>' where the joined fields are equal.</span>
              <span class="access-join-desc">RIGHT OUTER JOIN — Preserves all records from '<span class="jp-right-name">Right</span>', filling in NULLs for non-matching records from '<span class="jp-left-name">Left</span>'.</span>
            </div>
          </label>

          <label class="access-join-radio-card" id="cardJpFull" onclick="selectJoinPropType('FULL')">
            <input type="radio" name="accessJoinType" id="radioJpFull" value="FULL" onchange="onJoinPropTypeChange('FULL')">
            <div class="access-join-text">
              <span class="access-join-title">4: 🐘 FULL OUTER JOIN (Postgres Native) — Include ALL records from BOTH tables whether or not there are matching records.</span>
              <span class="access-join-desc">FULL OUTER JOIN (Postgres Native) — Complete PostgreSQL symmetric join with NULLs where keys do not match.</span>
            </div>
          </label>

          <label class="access-join-radio-card" id="cardJpCross" onclick="selectJoinPropType('CROSS')">
            <input type="radio" name="accessJoinType" id="radioJpCross" value="CROSS" onchange="onJoinPropTypeChange('CROSS')">
            <div class="access-join-text">
              <span class="access-join-title">5: Produce the Cartesian product of all rows between '<span class="jp-left-name">Left</span>' and '<span class="jp-right-name">Right</span>'.</span>
              <span class="access-join-desc">CROSS JOIN — Pairs every row from '<span class="jp-left-name">Left</span>' with every row from '<span class="jp-right-name">Right</span>' without matching condition.</span>
            </div>
          </label>
        </div>

        <!-- Live Venn Diagram & SQL Preview -->
        <div class="access-venn-preview-row">
          <div style="display:flex; flex-direction:column; align-items:center;">
            <svg class="access-venn-svg" viewBox="0 0 160 90" id="jpVennSvg">
              <!-- Rendered dynamically by updateJoinPropVennDiagram -->
            </svg>
            <span id="jpVennBadge" style="font-size:10px; font-weight:700; color:var(--cyan); margin-top:2px;">INNER JOIN</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
            <span style="font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase;">Generated SQL JOIN Clause</span>
            <div class="access-sql-box" id="jpSqlSnippet">FROM "table1" INNER JOIN "table2" ON "table1"."id" = "table2"."id"</div>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--border-subtle);">
          <button class="btn btn-sm btn-danger" id="btnDeleteJoinProp" onclick="deleteCurrentJoinFromProperties()">🗑️ Delete Join</button>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-sm" onclick="closeJoinPropertiesModal()">Cancel</button>
            <button class="btn btn-sm btn-primary" onclick="saveJoinProperties()">✓ OK / Apply Join</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Microsoft Access Printable Publication Report Modal -->
  <div class="modal-overlay" id="accessReportModal" onclick="if(event.target === this) closeAccessReportModal()">
    <div class="modal-card" style="max-width: 960px; max-height: 90vh;">
      <div class="modal-header">
        <div class="modal-title">
          <span>📑</span>
          <span>Microsoft Access Publication Report Preview</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-sm btn-primary" onclick="printAccessReport()">🖨️ Print / Save PDF</button>
          <button class="btn btn-sm" onclick="exportAccessReportHtml()">📥 Export HTML</button>
          <button class="modal-close" onclick="closeAccessReportModal()">✕</button>
        </div>
      </div>
      <div class="modal-body" style="padding: 20px; overflow-y: auto; background: #e2e8f0;">
        <div id="accessReportContent"></div>
      </div>
    </div>
  </div>

  <!-- PostgreSQL Database Backup & SQL Dump Modal -->
  <div class="modal-overlay" id="dumpModal" onclick="if(event.target === this) closeDatabaseDumpModal()">
    <div class="modal-card" style="max-width: 900px; max-height: 90vh;">
      <div class="modal-header">
        <div class="modal-title">
          <span>💾</span>
          <span>PostgreSQL Database Backup &amp; SQL Dump Generator</span>
        </div>
        <button class="modal-close" onclick="closeDatabaseDumpModal()">✕</button>
      </div>
      <div class="modal-body" style="padding: 16px 20px; gap: 12px; overflow-y: auto;">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-dim);">Dump Mode:</label>
          <select id="dumpModeSelect" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 11px;">
            <option value="all">Complete (Schema DDL + Table Data)</option>
            <option value="schema">Schema Only (DDL, Indexes, Keys, Views, Sequences)</option>
            <option value="data">Data Only (INSERT Statements)</option>
          </select>
          <button class="btn btn-sm btn-primary" onclick="runGenerateDump()">⚡ Generate Dump</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span style="font-size: 11px; font-weight: 700; color: var(--text-dim);">Tables to Include:</span>
          <div id="dumpTablesList" style="display: flex; gap: 8px; flex-wrap: wrap; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; border: 1px solid var(--border-subtle); max-height: 90px; overflow-y: auto;">
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: var(--cyan);">SQL DUMP PREVIEW</span>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm" onclick="copyDumpSql()">📋 Copy SQL</button>
              <button class="btn btn-sm" onclick="downloadDumpFile()">📥 Download .sql</button>
              <button class="btn btn-sm btn-primary" onclick="openDumpInSqlIde()">🚀 Open in SQL IDE</button>
            </div>
          </div>
          <textarea id="dumpSqlPreview" readonly style="width: 100%; height: 260px; font-family: var(--font-mono); font-size: 11px; background: rgba(6,11,20,0.95); color: #a5f3fc; border: 1px solid var(--border-subtle); border-radius: 4px; padding: 10px; resize: none; outline: none; white-space: pre;"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Custom ENUM Type Modal -->
  <div class="modal-overlay" id="createEnumModal" onclick="if(event.target === this) closeCreateEnumModal()">
    <div class="modal-card" style="max-width: 480px;">
      <div class="modal-header">
        <div class="modal-title">
          <span>🏷️</span>
          <span>Create PostgreSQL ENUM Type</span>
        </div>
        <button class="modal-close" onclick="closeCreateEnumModal()">✕</button>
      </div>
      <div class="modal-body" style="padding: 16px 20px; gap: 12px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; color: var(--text-dim); font-weight: 700;">Type Name (e.g. order_status, priority_level):</label>
          <input type="text" id="enumNewName" placeholder="e.g. order_status" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; outline: none;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; color: var(--text-dim); font-weight: 700;">Allowed Values (comma separated):</label>
          <input type="text" id="enumNewValues" placeholder="e.g. pending, processing, completed, refunded" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; outline: none;">
        </div>
      </div>
      <div class="modal-footer" style="padding: 12px 20px; display: flex; justify-content: flex-end; gap: 8px;">
        <button class="btn btn-sm" onclick="closeCreateEnumModal()">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="submitCreateEnum()">Create Type</button>
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
    let activeTab = "grid";
    window.activeTab = "grid";
    let currentGridData = null;
    // Macro Designer reads/writes the visible grid through these aliases
    Object.defineProperty(window, "currentGridRows", {
      configurable: true,
      get: () => (currentGridData && currentGridData.rows) || [],
      set: (v) => { currentGridData = Object.assign(currentGridData || {}, { rows: v }); }
    });
    Object.defineProperty(window, "currentGridColumns", {
      configurable: true,
      get: () => (currentGridData && currentGridData.columns) || [],
      set: (v) => { currentGridData = Object.assign(currentGridData || {}, { columns: v }); }
    });
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
      showTotals: true,
      distinct: false,
      topLimit: 100,
      savedQueries: [],
      datasheet: null,
      datasheetLoading: false,
      canvasZoom: 1.0,
      canvasHeight: 480,
      canvasViewMode: "split",
      gridDensity: "normal",
      sqlFontSize: 13,
      datasheetFontSize: 11,
      datasheetDensity: "normal",
      selectedFields: {},
      aggregates: {},
      groupBy: {},
      orderBy: "",
      filters: [],
      havingFilters: [],
    };

    // Helper: Toast message
    function showToast(msg, duration = 3000) {
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.innerText = msg;
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, duration);
    }

    // Helper: Safe fetch API wrapper (supports both (url, method, body) and (url, bodyObj))
    async function apiRequest(endpoint, methodOrBody = "GET", maybeBody = null) {
      let method = "GET";
      let body = null;
      if (typeof methodOrBody === "string") {
        method = methodOrBody.toUpperCase();
        body = maybeBody;
      } else if (methodOrBody && typeof methodOrBody === "object") {
        method = "POST";
        body = methodOrBody;
      }
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
      activeTab = tabId;
      window.activeTab = tabId;
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      const btnMap = {
        grid: "tabBtnGrid",
        sql: "tabBtnSql",
        designer: "tabBtnDesigner",
        macros: "tabBtnMacros",
        schema: "tabBtnSchema",
        types: "tabBtnTypes",
        partitions: "tabBtnPartitions",
        extensions: "tabBtnExtensions",
        activity: "tabBtnActivity",
        replication: "tabBtnReplication",
        explain: "tabBtnExplain",
        sequences: "tabBtnSequences",
        roles: "tabBtnRoles",
        triggers: "tabBtnTriggers",
        telemetry: "tabBtnTelemetry",
        audit: "tabBtnAudit",
        pragma: "tabBtnPragma",
        json: "tabBtnJson"
      };

      const paneMap = {
        grid: "tabGrid",
        sql: "tabSql",
        designer: "tabDesigner",
        macros: "tabMacros",
        schema: "tabSchema",
        types: "tabTypes",
        partitions: "tabPartitions",
        extensions: "tabExtensions",
        activity: "tabActivity",
        replication: "tabReplication",
        explain: "tabExplain",
        sequences: "tabSequences",
        roles: "tabRoles",
        triggers: "tabTriggers",
        telemetry: "tabTelemetry",
        audit: "tabAudit",
        pragma: "tabPragma",
        json: "tabJson"
      };

      if (btnMap[tabId]) document.getElementById(btnMap[tabId])?.classList.add("active");
      if (paneMap[tabId]) document.getElementById(paneMap[tabId])?.classList.add("active");

      if (tabId === "schema") renderSchemaDesigner(activeTable);
      if (tabId === "types") loadEnumTypes();
      if (tabId === "partitions") loadPartitions();
      if (tabId === "extensions") loadExtensions();
      if (tabId === "activity") loadActivity();
      if (tabId === "replication") loadReplicationStatus();
      if (tabId === "designer") renderQueryDesigner();
      if (tabId === "macros" && typeof renderMacroDesigner === "function") renderMacroDesigner();
      if (tabId === "sequences") loadSequences();
      if (tabId === "roles") loadRoles();
      if (tabId === "triggers") loadTriggersAndFunctions();
      if (tabId === "telemetry") loadTelemetry();
      if (tabId === "audit") loadAuditLogs();
      if (tabId === "pragma") loadPragmaSettings();
    }

    // Load KPIs & Telemetry
    async function loadKpis() {
      const res = await apiRequest("/api/kpis");
      const k = (res && res.kpis) || res;
      if (k && (k.tableCount !== undefined || (res && res.success))) {
        window.currentKpis = k;
        if (document.getElementById("kpiDbName")) document.getElementById("kpiDbName").innerText = k.dbName || "mydb";
        if (document.getElementById("sidebarDbName")) document.getElementById("sidebarDbName").innerText = k.dbName || "mydb";
        if (document.getElementById("kpiDbPath")) {
          const host = document.getElementById("cfgHost")?.value || "localhost";
          const port = document.getElementById("cfgPort")?.value || "5432";
          const schema = currentSchema?.activeSchema || "public";
          document.getElementById("kpiDbPath").innerText = host + ":" + port + " • " + schema;
        }
        if (document.getElementById("kpiSize")) {
          document.getElementById("kpiSize").innerText = k.databaseSize || k.dbSize || "42 MB (Cluster)";
        }
        if (document.getElementById("kpiLatency")) document.getElementById("kpiLatency").innerText = (k.latencyMs !== undefined ? k.latencyMs : 0.4) + " ms";
        if (document.getElementById("kpiConnections")) document.getElementById("kpiConnections").innerText = k.activeConnections || 1;
        if (document.getElementById("kpiTables")) document.getElementById("kpiTables").innerText = (k.tableCount || (currentSchema?.tables || []).length) + " Tables";
        if (document.getElementById("kpiViews")) document.getElementById("kpiViews").innerText = k.viewCount || (currentSchema?.views || []).length;
        if (document.getElementById("kpiMatViews")) document.getElementById("kpiMatViews").innerText = k.matViewCount || (currentSchema?.matviews || []).length;
        if (document.getElementById("kpiRows")) document.getElementById("kpiRows").innerText = (k.totalRows || 0).toLocaleString() + " Rows";
        if (document.getElementById("kpiBuffers")) document.getElementById("kpiBuffers").innerText = k.sharedBuffers || "128MB";
        if (k.pgVersion) {
          const v = k.pgVersion.split(" ")[1] || k.pgVersion.slice(0, 14);
          if (document.getElementById("pgVersionBadge")) document.getElementById("pgVersionBadge").innerText = "PG " + v;
          if (document.getElementById("kpiEngine")) document.getElementById("kpiEngine").innerText = "PostgreSQL " + v + " • bun:postgres";
        }
      }
    }

    // Load Database Schema (Tables, Views, MatViews, Schemas)
    async function loadSchema() {
      const res = await apiRequest("/api/schema");
      if (res && (res.success || Array.isArray(res.tables))) {
        currentSchema = res;
        renderSidebarTree();
        renderSchemaDropdown(res.schemas || ["public"], res.activeSchema || "public");
        if (document.getElementById("kpiTables")) {
          document.getElementById("kpiTables").innerText = (currentSchema.tables || []).length;
          document.getElementById("kpiViews").innerText = (currentSchema.views || []).length;
          document.getElementById("kpiMatViews").innerText = (currentSchema.matviews || []).length;
        }
        loadKpis();
        const allItems = [...(currentSchema.tables || []), ...(currentSchema.views || []), ...(currentSchema.matviews || [])];
        if (!activeTable || !allItems.find(item => item.name === activeTable)) {
          if (currentSchema.tables && currentSchema.tables.length > 0) {
            const cust = currentSchema.tables.find(t => t.name === "customers") || currentSchema.tables[0];
            selectEntity(cust.name, cust.type || "table", { switchTab: false });
          }
        }
        if (typeof ensureQueryDesignerState === "function") ensureQueryDesignerState();
        if (typeof renderQueryDesigner === "function" && activeTab === "designer") {
          renderQueryDesigner();
        }
      } else {
        showToast("Error loading schema: " + ((res && res.error) || "Unknown error"));
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
        if (typeof loadMacrosFromServer === "function") loadMacrosFromServer();
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
      \`).join('') || '<div style="padding: 10px 8px; font-size: 11px; color: var(--text-dim); text-align: center;">No tables yet.<br><button class="btn btn-sm btn-primary" onclick="seedSampleDatabase()" style="margin-top: 6px; width: 100%; font-size: 10px; padding: 4px 6px;">🌱 Seed Sample DB</button></div>';

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

      // Saved Queries & Macros groups
      const macroGroups = document.getElementById("sidebarMacroGroups");
      if (macroGroups) {
        macroGroups.innerHTML = "";
        const q = (document.getElementById("searchObjects")?.value || "").toLowerCase();
        if (typeof renderQueryTreeGroup === "function") renderQueryTreeGroup(macroGroups, q);
        if (typeof renderMacroTreeGroup === "function") renderMacroTreeGroup(macroGroups, q);
      }
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
    function selectEntity(name, type, options = {}) {
      activeTable = name;
      renderSidebarTree();
      const gridTarget = document.getElementById("gridTargetTitle");
      if (gridTarget) gridTarget.innerText = name + " (" + type + ")";
      const sqlEditor = document.getElementById("sqlEditorTextarea") || document.getElementById("sqlEditor");
      if (sqlEditor && !sqlEditor.value.trim()) {
        sqlEditor.value = 'SELECT * FROM "' + name.replace(/"/g, '""') + '" LIMIT 100;';
      }
      if (typeof queryDesignerState !== "undefined" && queryDesignerState && queryDesignerState.selectedTables) {
        if (!queryDesignerState.selectedTables.includes(name)) {
          queryDesignerState.selectedTables = [name, ...queryDesignerState.selectedTables.filter(n => n !== name)];
        }
      }
      if (options.switchTab !== false && activeTab !== "designer" && activeTab !== "schema") {
        switchTab("grid");
      }
      loadTableData(name);
      if (typeof renderSchemaDesigner === "function") renderSchemaDesigner(name);
      if (typeof renderQueryDesigner === "function" && activeTab === "designer") renderQueryDesigner();
    }

    function selectTable(tableName) {
      selectEntity(tableName, 'table');
    }
    window.selectTable = selectTable;

    async function refreshAll() {
      await loadSchema();
      await loadKpis();
      if (typeof renderQueryDesigner === "function" && activeTab === "designer") {
        renderQueryDesigner();
      }
    }
    window.refreshAll = refreshAll;

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
        currentGridData.rawRows = [...(res.rows || [])];
        renderGridTable(res.rows, res.columns, res.total, res.page, res.pageSize);
        if (typeof gridDisplayMode !== "undefined" && gridDisplayMode === "form") {
          renderCurrentFormRecord();
        }
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

      const filterRow = document.getElementById("gridFilterBarRow");
      if (filterRow) {
        filterRow.style.display = accessFilterBarVisible ? "table-row" : "none";
        filterRow.innerHTML = "<th style='text-align: center; color: var(--accent);'>⚡</th>" + columns.map(c => {
          const curVal = activeColumnFilters[c] || "";
          return "<th><input type='text' class='access-filter-input' placeholder='Filter " + escapeHtml(c) + "...' value='" + escapeHtml(curVal) + "' oninput='onColumnFilterInput(&quot;" + escapeHtml(c) + "&quot;, this.value)'></th>";
        }).join('');
      }

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
      updateAccessTotalsRow(rows, columns, total);
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

    // ---------------------------------------------------------------------------------------------
    // Microsoft Access Form View Implementation
    // ---------------------------------------------------------------------------------------------
    let gridDisplayMode = "datasheet";
    let currentFormRecordIndex = 0;
    let formIsNew = false;

    function switchGridMode(mode) {
      gridDisplayMode = mode;
      const btnData = document.getElementById("btnViewDatasheet");
      const btnForm = document.getElementById("btnViewForm");
      const tableContainer = document.getElementById("gridTableContainer");
      const formContainer = document.getElementById("gridFormContainer");

      if (mode === "form") {
        if (btnData) btnData.classList.remove("btn-primary");
        if (btnForm) btnForm.classList.add("btn-primary");
        if (tableContainer) tableContainer.style.display = "none";
        if (formContainer) {
          formContainer.style.display = "flex";
          renderCurrentFormRecord();
        }
      } else {
        if (btnForm) btnForm.classList.remove("btn-primary");
        if (btnData) btnData.classList.add("btn-primary");
        if (formContainer) formContainer.style.display = "none";
        if (tableContainer) tableContainer.style.display = "block";
      }
    }

    function renderCurrentFormRecord() {
      const container = document.getElementById("accessFormFields");
      const recordInput = document.getElementById("formCurrentRecordInput");
      const totalSpan = document.getElementById("formTotalRecords");
      const statusBadge = document.getElementById("formStatusBadge");
      if (!container) return;

      if (!activeTable || !currentGridData || !Array.isArray(currentGridData.rows) || currentGridData.rows.length === 0) {
        if (formIsNew && currentGridData && currentGridData.columns) {
          // Proceed with blank fields for new draft
        } else {
          container.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 48px;">No records available for table "' + escapeHtml(activeTable || 'none') + '". Click "➕ New" below to add a record.</div>';
          if (recordInput) recordInput.value = 0;
          if (totalSpan) totalSpan.innerText = "0";
          if (statusBadge) statusBadge.innerText = "No Records";
          return;
        }
      }

      const rows = currentGridData ? (currentGridData.rows || []) : [];
      const total = rows.length;

      if (!formIsNew) {
        if (currentFormRecordIndex < 0) currentFormRecordIndex = 0;
        if (currentFormRecordIndex >= total && total > 0) currentFormRecordIndex = total - 1;
      }

      const activeRow = formIsNew ? {} : (rows[currentFormRecordIndex] || {});
      const columns = (currentGridData && currentGridData.columns) ? currentGridData.columns : Object.keys(activeRow);
      
      const meta = currentSchema && currentSchema.tables ? currentSchema.tables.find(t => t.name === activeTable) : null;
      const colMetaMap = {};
      if (meta && meta.columns) {
        meta.columns.forEach(c => { colMetaMap[c.name] = c; });
      }

      if (recordInput) recordInput.value = formIsNew ? "*" : (currentFormRecordIndex + 1);
      if (totalSpan) totalSpan.innerText = String(total);
      if (statusBadge) {
        statusBadge.innerText = formIsNew ? "New Record (Unsaved)" : "Record " + (currentFormRecordIndex + 1) + " of " + total;
        statusBadge.style.color = formIsNew ? "var(--amber)" : "var(--cyan)";
      }

      let formHtml = '<div style="font-weight: 700; color: var(--cyan); font-size: 13px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">' +
        '<span>📑 Form Record: ' + escapeHtml(activeTable || '') + '</span>' +
        '<span style="font-size: 11px; color: var(--text-dim); font-weight: 400;">Access-Style Single Record Inspector</span>' +
        '</div>' +
        '<div class="access-form-grid">';

      columns.forEach(col => {
        const cMeta = colMetaMap[col] || {};
        const colType = cMeta.type || (typeof activeRow[col] === 'number' ? 'numeric' : (typeof activeRow[col] === 'boolean' ? 'boolean' : 'text'));
        const isPk = Boolean(cMeta.pk);
        const val = activeRow[col];
        const valStr = val === null || val === undefined ? '' : (typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val));

        formHtml += '<div class="access-field-card">' +
          '<div class="access-field-header">' +
          '<span class="access-field-name">' + (isPk ? '🔑 ' : '') + escapeHtml(col) + '</span>' +
          '<div style="display: flex; gap: 4px;">' +
          (isPk ? '<span class="access-field-pk">PK</span>' : '') +
          '<span class="access-field-type">' + escapeHtml(colType) + '</span>' +
          '</div></div>';

        if (/bool/i.test(colType)) {
          const isTrue = val === true || val === 'true' || val === 't';
          formHtml += '<select class="form-field-input" data-col="' + escapeHtml(col) + '" style="font-size: 12px; padding: 6px 10px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff;">' +
            '<option value="true" ' + (isTrue ? 'selected' : '') + '>TRUE</option>' +
            '<option value="false" ' + (!isTrue ? 'selected' : '') + '>FALSE</option>' +
            '<option value="" ' + (val === null || val === undefined ? 'selected' : '') + '>NULL</option>' +
            '</select>';
        } else if (/json/i.test(colType)) {
          formHtml += '<textarea class="form-field-input" data-col="' + escapeHtml(col) + '" style="font-family: var(--font-mono); font-size: 11px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fde68a; padding: 8px; min-height: 70px; resize: vertical;">' + escapeHtml(valStr) + '</textarea>';
        } else if (/uuid/i.test(colType)) {
          formHtml += '<div style="display: flex; gap: 6px;">' +
            '<input type="text" class="form-field-input" data-col="' + escapeHtml(col) + '" value="' + escapeHtml(valStr) + '" style="font-family: var(--font-mono); font-size: 11px; flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color: #a5f3fc; padding: 6px 8px;">' +
            '<button class="btn btn-sm" onclick="this.previousElementSibling.value = crypto.randomUUID()">🎲 UUID</button>' +
            '</div>';
        } else if (/timestamp|date/i.test(colType)) {
          formHtml += '<div style="display: flex; gap: 6px;">' +
            '<input type="text" class="form-field-input" data-col="' + escapeHtml(col) + '" value="' + escapeHtml(valStr) + '" style="font-family: var(--font-mono); font-size: 11px; flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; padding: 6px 8px;">' +
            '<button class="btn btn-sm" onclick="this.previousElementSibling.value = new Date().toISOString()">⏱️ Now</button>' +
            '</div>';
        } else if (/int|num|float|double|decimal|serial/i.test(colType)) {
          formHtml += '<input type="number" step="any" class="form-field-input" data-col="' + escapeHtml(col) + '" value="' + escapeHtml(valStr) + '" style="font-family: var(--font-mono); font-size: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; padding: 6px 8px;">';
        } else {
          if (valStr.length > 80) {
            formHtml += '<textarea class="form-field-input" data-col="' + escapeHtml(col) + '" style="font-size: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; padding: 6px 8px; min-height: 50px; resize: vertical;">' + escapeHtml(valStr) + '</textarea>';
          } else {
            formHtml += '<input type="text" class="form-field-input" data-col="' + escapeHtml(col) + '" value="' + escapeHtml(valStr) + '" style="font-size: 12px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; color: #fff; padding: 6px 8px;">';
          }
        }

        formHtml += '</div>';
      });

      formHtml += '</div>';
      container.innerHTML = formHtml;
    }

    function formNavRecord(action) {
      if (!currentGridData || !currentGridData.rows || currentGridData.rows.length === 0) return;
      formIsNew = false;
      const total = currentGridData.rows.length;
      if (action === "first") currentFormRecordIndex = 0;
      else if (action === "prev" && currentFormRecordIndex > 0) currentFormRecordIndex--;
      else if (action === "next" && currentFormRecordIndex < total - 1) currentFormRecordIndex++;
      else if (action === "last") currentFormRecordIndex = total - 1;
      renderCurrentFormRecord();
    }

    function formJumpToRecord(idx) {
      if (!currentGridData || !currentGridData.rows) return;
      const total = currentGridData.rows.length;
      if (isNaN(idx) || idx < 1) idx = 1;
      if (idx > total) idx = total;
      formIsNew = false;
      currentFormRecordIndex = idx - 1;
      renderCurrentFormRecord();
    }

    function formNewRecord() {
      formIsNew = true;
      renderCurrentFormRecord();
      showToast("Ready to enter new record. Fill fields and click Save.");
    }

    function formDuplicateRecord() {
      if (!currentGridData || !currentGridData.rows || currentGridData.rows.length === 0) return;
      formIsNew = true;
      renderCurrentFormRecord();
      const meta = currentSchema && currentSchema.tables ? currentSchema.tables.find(t => t.name === activeTable) : null;
      if (meta && meta.columns) {
        const pkCol = meta.columns.find(c => c.pk);
        if (pkCol) {
          const input = document.querySelector('.form-field-input[data-col="' + pkCol.name + '"]');
          if (input) input.value = "";
        }
      }
      showToast("Duplicated record as new draft. Click Save to insert.");
    }

    async function formSaveRecord() {
      if (!activeTable) return;
      const inputs = document.querySelectorAll("#accessFormFields .form-field-input");
      const record = {};
      inputs.forEach(inp => {
        const col = inp.dataset.col;
        if (!col) return;
        let v = inp.value;
        if (v === "" && inp.type === "number") v = null;
        record[col] = v;
      });

      const meta = currentSchema && currentSchema.tables ? currentSchema.tables.find(t => t.name === activeTable) : null;
      const pkColObj = meta && meta.columns ? (meta.columns.find(c => c.pk) || meta.columns[0]) : null;

      if (formIsNew) {
        showToast("Inserting new record into " + activeTable + "...");
        const res = await apiRequest("/api/rows/insert", "POST", { table: activeTable, row: record });
        if (res && res.success) {
          showToast("✓ New record inserted successfully!");
          formIsNew = false;
          await loadTableData(activeTable, gridCurrentPage);
          if (currentGridData && currentGridData.rows) {
            currentFormRecordIndex = currentGridData.rows.length - 1;
          }
          renderCurrentFormRecord();
        } else {
          showToast("Error inserting record: " + (res?.error || "Failed"));
        }
      } else {
        if (!pkColObj) {
          showToast("Cannot update: no primary key identified for table " + activeTable);
          return;
        }
        const currentRow = currentGridData.rows[currentFormRecordIndex];
        const pkVal = currentRow ? currentRow[pkColObj.name] : record[pkColObj.name];
        showToast("Saving changes to record (PK: " + pkVal + ")...");
        const res = await apiRequest("/api/rows/update", "POST", { table: activeTable, pkCol: pkColObj.name, pkVal: pkVal, row: record });
        if (res && res.success) {
          showToast("✓ Record updated successfully!");
          await loadTableData(activeTable, gridCurrentPage);
          renderCurrentFormRecord();
        } else {
          showToast("Error updating record: " + (res?.error || "Failed"));
        }
      }
    }

    async function formDeleteRecord() {
      if (!activeTable || !currentGridData || !currentGridData.rows || currentGridData.rows.length === 0) return;
      const meta = currentSchema && currentSchema.tables ? currentSchema.tables.find(t => t.name === activeTable) : null;
      const pkColObj = meta && meta.columns ? (meta.columns.find(c => c.pk) || meta.columns[0]) : null;
      if (!pkColObj) {
        showToast("Cannot delete: no primary key identified");
        return;
      }
      const currentRow = currentGridData.rows[currentFormRecordIndex];
      const pkVal = currentRow ? currentRow[pkColObj.name] : null;
      if (pkVal === null || pkVal === undefined) return;

      if (!confirm("Are you sure you want to delete this record (PK: " + pkVal + ")?")) return;
      showToast("Deleting record " + pkVal + "...");
      const res = await apiRequest("/api/rows/delete", "POST", { table: activeTable, pkCol: pkColObj.name, pkVal: pkVal });
      if (res && res.success) {
        showToast("✓ Record deleted");
        await loadTableData(activeTable, gridCurrentPage);
        if (currentFormRecordIndex > 0) currentFormRecordIndex--;
        renderCurrentFormRecord();
      } else {
        showToast("Error deleting record: " + (res?.error || "Failed"));
      }
    }


    // ---------------------------------------------------------------------------------------------
    // Fullscreen Support & Browser Auto-Fullscreen
    // ---------------------------------------------------------------------------------------------
    window.doToggleFullscreen = function() {
      if (typeof window.toggleFullscreen === "function") {
        try { window.toggleFullscreen(); return; } catch(e) {}
      }
      if (typeof window.toggleNativeFullscreen === "function") {
        try { window.toggleNativeFullscreen(); return; } catch(e) {}
      }
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    };

    // ---------------------------------------------------------------------------------------------
    // Theme Engine (22 Curated & Nostalgic Workstation Themes)
    // ---------------------------------------------------------------------------------------------
    window.applyPostgresStudioTheme = function(themeName) {
      try { localStorage.setItem('postgres_studio_theme', themeName); } catch(e) {}
      const themes = {
        midnight: { bg: '#060b14', surface: '#0a1120', accent: '#38bdf8', accentGlow: 'rgba(56, 189, 248, 0.25)', btnColor: '#ffffff' },
        codefreelance: { bg: '#050505', surface: '#121212', accent: '#0fb36a', accentGlow: 'rgba(15, 179, 106, 0.35)', btnColor: '#000000' },
        sonoma_emerald: { bg: '#0d1f18', surface: '#132e24', accent: '#30d158', accentGlow: 'rgba(48, 209, 88, 0.35)', btnColor: '#000000' },
        dracula: { bg: '#1e1f29', surface: '#282a36', accent: '#bd93f9', accentGlow: 'rgba(189, 147, 249, 0.3)', btnColor: '#ffffff' },
        nord: { bg: '#242933', surface: '#2e3440', accent: '#88c0d0', accentGlow: 'rgba(136, 192, 208, 0.3)', btnColor: '#000000' },
        cyberpunk: { bg: '#08080f', surface: '#121220', accent: '#ff007f', accentGlow: 'rgba(255, 0, 127, 0.35)', btnColor: '#ffffff' },
        apple_dark: { bg: '#161618', surface: '#242426', accent: '#0a84ff', accentGlow: 'rgba(10, 132, 255, 0.3)', btnColor: '#ffffff' },
        apple_light: { bg: '#f5f5f7', surface: '#ffffff', accent: '#007aff', accentGlow: 'rgba(0, 122, 255, 0.25)', btnColor: '#ffffff', textMain: '#1d1d1f', textMuted: '#6e6e73' },
        solarized_dark: { bg: '#00212b', surface: '#002b36', accent: '#2aa198', accentGlow: 'rgba(42, 161, 152, 0.3)', btnColor: '#ffffff' },
        github_dark: { bg: '#0d1117', surface: '#161b22', accent: '#58a6ff', accentGlow: 'rgba(88, 166, 255, 0.3)', btnColor: '#ffffff' },
        win95: { bg: '#008080', surface: '#c0c0c0', accent: '#000080', accentGlow: 'rgba(0, 0, 128, 0.4)', btnColor: '#ffffff', textMain: '#000000', textMuted: '#333333' },
        windows_95: { bg: '#008080', surface: '#c0c0c0', accent: '#000080', accentGlow: 'rgba(0, 0, 128, 0.4)', btnColor: '#ffffff', textMain: '#000000', textMuted: '#333333' },
        gameboy: { bg: '#0f380f', surface: '#1c4a1c', accent: '#8bac0f', accentGlow: 'rgba(139, 172, 15, 0.45)', btnColor: '#000000', textMain: '#9bbc0f', textMuted: '#8bac0f' },
        game_boy: { bg: '#0f380f', surface: '#1c4a1c', accent: '#8bac0f', accentGlow: 'rgba(139, 172, 15, 0.45)', btnColor: '#000000', textMain: '#9bbc0f', textMuted: '#8bac0f' },
        c64: { bg: '#40318d', surface: '#281b5c', accent: '#7974ff', accentGlow: 'rgba(121, 116, 255, 0.45)', btnColor: '#000000', textMain: '#7974ff', textMuted: '#a09eff' },
        commodore_64: { bg: '#40318d', surface: '#281b5c', accent: '#7974ff', accentGlow: 'rgba(121, 116, 255, 0.45)', btnColor: '#000000', textMain: '#7974ff', textMuted: '#a09eff' },
        mac_classic: { bg: '#ebe7df', surface: '#ffffff', accent: '#5555aa', accentGlow: 'rgba(85, 85, 170, 0.35)', btnColor: '#ffffff', textMain: '#1c1b18', textMuted: '#55524c' },
        system7: { bg: '#ebe7df', surface: '#ffffff', accent: '#5555aa', accentGlow: 'rgba(85, 85, 170, 0.35)', btnColor: '#ffffff', textMain: '#1c1b18', textMuted: '#55524c' },
        amber_crt: { bg: '#0a0600', surface: '#160d00', accent: '#ffb000', accentGlow: 'rgba(255, 176, 0, 0.45)', btnColor: '#000000', textMain: '#ffb000', textMuted: '#cc8c00' },
        vt220: { bg: '#0a0600', surface: '#160d00', accent: '#ffb000', accentGlow: 'rgba(255, 176, 0, 0.45)', btnColor: '#000000', textMain: '#ffb000', textMuted: '#cc8c00' },
        matrix: { bg: '#040a05', surface: '#08140a', accent: '#00ff41', accentGlow: 'rgba(0, 255, 65, 0.45)', btnColor: '#000000', textMain: '#00ff66', textMuted: '#00cc52' },
        green_crt: { bg: '#040a05', surface: '#08140a', accent: '#00ff41', accentGlow: 'rgba(0, 255, 65, 0.45)', btnColor: '#000000', textMain: '#00ff66', textMuted: '#00cc52' },
        synthwave: { bg: '#130924', surface: '#22113d', accent: '#ff2a85', accentGlow: 'rgba(255, 42, 133, 0.45)', btnColor: '#ffffff', textMain: '#fce7f3', textMuted: '#d946ef' },
        outrun: { bg: '#130924', surface: '#22113d', accent: '#ff2a85', accentGlow: 'rgba(255, 42, 133, 0.45)', btnColor: '#ffffff', textMain: '#fce7f3', textMuted: '#d946ef' },
        amiga: { bg: '#0055aa', surface: '#003870', accent: '#ff8800', accentGlow: 'rgba(255, 136, 0, 0.45)', btnColor: '#000000', textMain: '#ffffff', textMuted: '#ffcc88' },
        workbench: { bg: '#0055aa', surface: '#003870', accent: '#ff8800', accentGlow: 'rgba(255, 136, 0, 0.45)', btnColor: '#000000', textMain: '#ffffff', textMuted: '#ffcc88' },
        nextstep: { bg: '#262626', surface: '#333333', accent: '#4a90e2', accentGlow: 'rgba(74, 144, 226, 0.35)', btnColor: '#ffffff', textMain: '#dedede', textMuted: '#999999' },
        mac_os_aqua: { bg: '#e6ebed', surface: '#ffffff', accent: '#0076fe', accentGlow: 'rgba(0, 118, 254, 0.35)', btnColor: '#ffffff', textMain: '#1d2429', textMuted: '#64748b' },
        aqua_os_x: { bg: '#e6ebed', surface: '#ffffff', accent: '#0076fe', accentGlow: 'rgba(0, 118, 254, 0.35)', btnColor: '#ffffff', textMain: '#1d2429', textMuted: '#64748b' },
        hotdog_stand: { bg: '#000000', surface: '#1c0000', accent: '#ff0000', accentGlow: 'rgba(255, 0, 0, 0.5)', btnColor: '#ffffff', textMain: '#ffffff', textMuted: '#ffff00' },
        playstation: { bg: '#1e1e24', surface: '#2a2b34', accent: '#00d2c4', accentGlow: 'rgba(0, 210, 196, 0.4)', btnColor: '#000000', textMain: '#e4e5eb', textMuted: '#94a3b8' },
        psx: { bg: '#1e1e24', surface: '#2a2b34', accent: '#00d2c4', accentGlow: 'rgba(0, 210, 196, 0.4)', btnColor: '#000000', textMain: '#e4e5eb', textMuted: '#94a3b8' }
      };
      const t = themes[themeName] || themes.midnight;
      document.documentElement.style.setProperty('--bg-base', t.bg);
      document.documentElement.style.setProperty('--bg-surface', t.surface);
      document.documentElement.style.setProperty('--cyan', t.accent);
      document.documentElement.style.setProperty('--cyan-glow', t.accentGlow);
      document.documentElement.style.setProperty('--border-focus', t.accent);
      if (t.textMain) document.documentElement.style.setProperty('--text-main', t.textMain);
      else document.documentElement.style.setProperty('--text-main', '#f8fafc');
      if (t.textMuted) document.documentElement.style.setProperty('--text-muted', t.textMuted);
      else document.documentElement.style.setProperty('--text-muted', '#94a3b8');

      let styleEl = document.getElementById('pg-dyn-theme');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'pg-dyn-theme';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = \`
        .btn-primary, .qbe-btn-run, .btn-highlight {
          background: \${t.accent} !important;
          color: \${t.btnColor} !important;
          border-color: \${t.accent} !important;
          box-shadow: 0 0 10px \${t.accentGlow} !important;
        }
        .btn-primary:hover, .qbe-btn-run:hover, .btn-highlight:hover {
          filter: brightness(1.15) !important;
        }
        .qbe-view-btn.active, .qbe-btn-toggle.active {
          background: \${t.accent} !important;
          color: \${t.btnColor} !important;
          border-color: \${t.accent} !important;
        }
      \`;
      const sel = document.getElementById('ddStudioTheme');
      if (sel && sel.value !== themeName) sel.value = themeName;
    };
    window.applyMysqlStudioTheme = window.applyPostgresStudioTheme;

    // ---------------------------------------------------------------------------------------------
    // Presets & Editor Helpers
    // ---------------------------------------------------------------------------------------------
    function initPresets() {
      const select = document.getElementById("presetSelect");
      if (!select) return;
      select.innerHTML = '<option value="">-- Choose PostgreSQL Query Snippet --</option>';
      SQL_PRESETS.forEach((p, idx) => {
        const opt = document.createElement("option");
        opt.value = p.sql;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
    }

    function applyPreset(sql) {
      if (!sql) return;
      const el1 = document.getElementById("sqlEditor");
      const el2 = document.getElementById("sqlEditorTextarea");
      if (el1) el1.value = sql;
      if (el2) el2.value = sql;
      runEditorQuery();
    }

    function applySqlPreset(idx) {
      if (idx === "" || idx === undefined || !SQL_PRESETS[idx]) return;
      const sql = SQL_PRESETS[idx].sql;
      applyPreset(sql);
    }

    function clearEditor() {
      const el1 = document.getElementById("sqlEditor");
      const el2 = document.getElementById("sqlEditorTextarea");
      if (el1) el1.value = "";
      if (el2) el2.value = "";
    }

    function toggleEditorCollapse() {
      const banner = document.getElementById("editorBanner");
      const btn = document.getElementById("btnToggleEditor");
      if (!banner) return;
      banner.classList.toggle("collapsed");
      const isCollapsed = banner.classList.contains("collapsed");
      if (btn) btn.textContent = isCollapsed ? "▼ Expand" : "▲ Minimize";
    }

    // ---------------------------------------------------------------------------------------------
    // SQL Execution (Persistent & Tab)
    // ---------------------------------------------------------------------------------------------
    async function runEditorQuery() {
      const sqlEl = document.getElementById("sqlEditor") || document.getElementById("sqlEditorTextarea");
      let sql = sqlEl ? sqlEl.value.trim() : "";
      if ((!sql || activeTab === "designer") && typeof buildDesignerSql === "function") {
        const designerSql = buildDesignerSql();
        if (designerSql) {
          sql = designerSql;
          if (sqlEl) sqlEl.value = sql;
          const otherEl = document.getElementById("sqlEditorTextarea");
          if (otherEl) otherEl.value = sql;
        }
      }
      if (!sql) {
        showToast("Please enter a SQL query!");
        return;
      }

      // Sync both editor textareas
      const e1 = document.getElementById("sqlEditor");
      const e2 = document.getElementById("sqlEditorTextarea");
      if (e1 && e1 !== sqlEl) e1.value = sql;
      if (e2 && e2 !== sqlEl) e2.value = sql;

      const timingEl = document.getElementById("queryTiming");
      const statusEl = document.getElementById("sqlResultStatus");
      if (timingEl) timingEl.textContent = "Executing...";
      if (statusEl) statusEl.textContent = "Executing query...";

      const start = performance.now();
      const res = await apiRequest("/api/query", "POST", { sql });
      const elapsed = Math.round(performance.now() - start);

      if (res && res.success) {
        const latency = res.latencyMs !== undefined ? res.latencyMs : elapsed;
        if (timingEl) timingEl.textContent = "Executed in " + latency + "ms";
        const kpiLat = document.getElementById("kpiLatency");
        if (kpiLat) kpiLat.textContent = latency + " ms";

        const rows = res.rows || [];
        const cols = res.columns || (rows.length > 0 ? Object.keys(rows[0]) : []);

        if (res.rowsAffected === undefined && res.rows) {
          currentGridData = res;
          renderGridTable(rows, cols, rows.length, 1, 100);
          renderSqlResults(rows, cols);

          const targetTitle = document.getElementById("gridTargetTitle");
          if (targetTitle) targetTitle.textContent = "Ad-Hoc Query Result";
          const pageInfo = document.getElementById("gridPageInfo");
          if (pageInfo) pageInfo.textContent = rows.length + " rows returned";
          const resSum = document.getElementById("resultSummary");
          if (resSum) resSum.textContent = rows.length + " rows (" + latency + "ms)";
          if (statusEl) statusEl.textContent = "✓ Executed in " + latency + "ms (" + rows.length + " rows)";

          const jsonBox = document.getElementById("rawJsonBox");
          if (jsonBox) jsonBox.textContent = JSON.stringify(res, null, 2);
          const jsonInsp = document.getElementById("jsonInspectorBox");
          if (jsonInsp) jsonInsp.textContent = JSON.stringify(rows, null, 2);

          switchTab("grid");
          logAudit("[QUERY OK] " + sql.replace(/\\n/g, ' ').slice(0, 100) + " (" + latency + "ms, " + rows.length + " rows)");
        } else {
          showToast("Statement executed (" + (res.rowsAffected ?? 0) + " rows affected)");
          const resSum = document.getElementById("resultSummary");
          if (resSum) resSum.textContent = "Rows affected: " + (res.rowsAffected ?? 0);
          if (statusEl) statusEl.textContent = "✓ Executed (" + (res.rowsAffected ?? 0) + " rows affected)";
          logAudit("[MUTATION OK] " + sql.replace(/\\n/g, ' ').slice(0, 100) + " (" + latency + "ms)");
          await loadSchema();
          await loadKpis();
        }
      } else {
        if (timingEl) timingEl.textContent = "Execution Error";
        if (statusEl) statusEl.textContent = "⚠️ Error: " + (res?.error || "Unknown error");
        showToast("SQL Error: " + (res?.error || "Unknown error"));
        logAudit("[ERROR] " + (res?.error || "Execution failed"));
      }
    }

    const executeCurrentQuery = runEditorQuery;
    window.runEditorQuery = runEditorQuery;
    window.executeCurrentQuery = runEditorQuery;
    const runExplainPlan = explainCurrentQuery;
    window.runExplainPlan = explainCurrentQuery;

    // ---------------------------------------------------------------------------------------------
    // Results File Export (CSV / JSON / SQL)
    // ---------------------------------------------------------------------------------------------
    async function exportResults(format) {
      let rows = [];
      if (currentGridData && Array.isArray(currentGridData.rows) && currentGridData.rows.length > 0) {
        rows = currentGridData.rows;
      }
      if (!rows || rows.length === 0) {
        showToast("No records available to export!");
        return;
      }

      const res = await apiRequest("/api/export", "POST", {
        format,
        tableName: activeTable || "query_results",
        rows,
      });

      if (res && res.success) {
        showToast("Exported " + res.rowCount + " rows to " + res.filename);
        logAudit("[EXPORT] Saved " + res.path);
      } else {
        showToast("Export failed: " + (res?.error || "Unknown"));
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Microsoft Access Table Design View & DDL Visualizer
    // ---------------------------------------------------------------------------------------------
    function renderSchemaDesigner(tableName) {
      const container = document.getElementById("schemaContainer");
      if (!container || !currentSchema) return;
      container.innerHTML = "";

      const name = tableName || activeTable || (currentSchema.tables && currentSchema.tables[0]?.name);
      if (!name) {
        container.innerHTML = '<div class="card" style="background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 16px;"><div class="card-title">Select a table or view from the sidebar to inspect its design, columns, keys, and DDL</div></div>';
        return;
      }

      const meta = (currentSchema.tables || []).find(t => t.name === name) 
        || (currentSchema.views || []).find(v => v.name === name)
        || (currentSchema.matviews || []).find(m => m.name === name);

      if (!meta) return;

      const numRows = (meta.rowCount || meta.rows || 0).toLocaleString();
      const isTable = meta.type === "table" || !meta.type;

      // 1. Table Header & Ribbon
      const headerCard = document.createElement("div");
      headerCard.className = "card";
      headerCard.style.background = "var(--bg-card)";
      headerCard.style.border = "1px solid var(--border-subtle)";
      headerCard.style.borderRadius = "8px";
      headerCard.style.padding = "14px 18px";
      headerCard.style.marginBottom = "12px";

      headerCard.innerHTML = '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
        '<div style="display: flex; align-items: center; gap: 10px;">' +
        '<span style="font-size: 20px;">📐</span>' +
        '<div>' +
        '<div style="font-weight: 700; color: var(--cyan); font-size: 15px;">Table Design View: ' + escapeHtml(meta.name) + '</div>' +
        '<div style="font-size: 11px; color: var(--text-dim);">' + (meta.type || 'table').toUpperCase() + ' · ' + numRows + ' records · ' + (meta.columns || []).length + ' fields · ' + (meta.indices || []).length + ' indexes</div>' +
        '</div></div>' +
        '<div style="display: flex; gap: 6px;">' +
        '<button class="btn btn-sm btn-primary" onclick="selectEntity(&quot;' + escapeHtml(meta.name) + '&quot;, &quot;' + (meta.type || 'table') + '&quot;)">📋 Open Datasheet</button>' +
        '<button class="btn btn-sm" onclick="switchGridMode(&quot;form&quot;); switchTab(&quot;grid&quot;);">📑 Open Form View</button>' +
        '<button class="btn btn-sm" onclick="renderSchemaDesigner(&quot;' + escapeHtml(meta.name) + '&quot;)">🔄 Refresh Design</button>' +
        '</div></div>';
      container.appendChild(headerCard);

      // 2. Access-Style Fields Grid Card
      const fieldsCard = document.createElement("div");
      fieldsCard.className = "card";
      fieldsCard.style.background = "var(--bg-card)";
      fieldsCard.style.border = "1px solid var(--border-subtle)";
      fieldsCard.style.borderRadius = "8px";
      fieldsCard.style.padding = "16px";
      fieldsCard.style.marginBottom = "12px";

      let fieldsHtml = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">' +
        '<div class="card-title" style="font-weight: 700; color: var(--cyan); margin-bottom: 0;">🏛️ Table Fields (Columns Specification)</div>' +
        '<span style="font-size: 11px; color: var(--text-dim);">PostgreSQL Schema Definition</span>' +
        '</div>' +
        '<div style="overflow-x: auto;">' +
        '<table class="data-grid" style="margin-top: 4px;">' +
        '<thead><tr><th style="width: 40px; text-align: center;">#</th><th>Field Name</th><th>Data Type</th><th style="width: 90px; text-align: center;">Primary Key</th><th style="width: 90px; text-align: center;">Not Null</th><th>Default Value</th><th style="width: 80px; text-align: center;">Actions</th></tr></thead>' +
        '<tbody>';

      (meta.columns || []).forEach((c, i) => {
        fieldsHtml += '<tr>' +
          '<td style="text-align: center; color: var(--text-dim);">' + (c.cid ?? (i + 1)) + '</td>' +
          '<td style="color: var(--cyan); font-weight: 600; font-family: var(--font-mono);">' + escapeHtml(c.name) + '</td>' +
          '<td><span class="access-field-type">' + escapeHtml(c.type || c.data_type || 'text') + '</span></td>' +
          '<td style="text-align: center;">' + (c.pk || c.is_primary ? '<span class="access-field-pk">🔑 YES</span>' : '<span style="color: var(--text-dim);">-</span>') + '</td>' +
          '<td style="text-align: center;">' + (c.notnull || !c.is_nullable ? '<span class="brand-badge" style="background: rgba(244,63,94,0.12); color: var(--rose); font-size: 9px;">NOT NULL</span>' : '<span style="color: var(--text-dim); font-size: 10px;">NULLABLE</span>') + '</td>' +
          '<td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">' + (c.dflt_value !== null && c.dflt_value !== undefined ? escapeHtml(c.dflt_value) : (c.column_default ? escapeHtml(c.column_default) : '<span style="color: var(--text-dim); font-style: italic;">none</span>')) + '</td>' +
          '<td style="text-align: center;">' + (isTable ? '<button class="btn btn-sm btn-danger" onclick="executeDropColumn(&quot;' + escapeHtml(meta.name) + '&quot;, &quot;' + escapeHtml(c.name) + '&quot;)" title="Drop Column">🗑️</button>' : '-') + '</td>' +
          '</tr>';
      });
      fieldsHtml += '</tbody></table></div>';

      // Inline Add Column for tables
      if (isTable) {
        fieldsHtml += '<div style="margin-top: 14px; padding: 12px; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-subtle); border-radius: 6px;">' +
          '<div style="font-size: 11px; font-weight: 700; color: var(--cyan); margin-bottom: 8px;">➕ Add Field to Table (ALTER TABLE ADD COLUMN)</div>' +
          '<div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">' +
          '<input type="text" id="addColName" placeholder="Column name (e.g. status, total_cents)..." style="font-size: 11px; padding: 5px 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; color: #fff; width: 180px;">' +
          '<select id="addColType" style="font-size: 11px; padding: 4px 20px 4px 8px; width: 150px;">' +
          '<option value="text">text</option>' +
          '<option value="varchar(255)">varchar(255)</option>' +
          '<option value="integer">integer</option>' +
          '<option value="bigint">bigint</option>' +
          '<option value="numeric(12,2)">numeric(12,2)</option>' +
          '<option value="boolean">boolean</option>' +
          '<option value="timestamp with time zone">timestamptz</option>' +
          '<option value="date">date</option>' +
          '<option value="jsonb">jsonb</option>' +
          '<option value="uuid">uuid</option>' +
          '<option value="bytea">bytea</option>' +
          '</select>' +
          '<label style="font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 4px;"><input type="checkbox" id="addColNotNull"> Not Null</label>' +
          '<input type="text" id="addColDefault" placeholder="Default (e.g. NOW(), 0)..." style="font-size: 11px; padding: 5px 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; color: #fff; width: 140px;">' +
          '<button class="btn btn-sm btn-primary" onclick="executeAddColumn(&quot;' + escapeHtml(meta.name) + '&quot;)">➕ Add Column</button>' +
          '</div></div>';
      }

      fieldsCard.innerHTML = fieldsHtml;
      container.appendChild(fieldsCard);

      // 3. Table Indexes Card
      const idxCard = document.createElement("div");
      idxCard.className = "card";
      idxCard.style.background = "var(--bg-card)";
      idxCard.style.border = "1px solid var(--border-subtle)";
      idxCard.style.borderRadius = "8px";
      idxCard.style.padding = "16px";
      idxCard.style.marginBottom = "12px";

      let idxHtml = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">' +
        '<div class="card-title" style="font-weight: 700; color: var(--amber); margin-bottom: 0;">🏷️ Table Indexes (' + (meta.indices || []).length + ')</div>' +
        '<span style="font-size: 11px; color: var(--text-dim);">PostgreSQL Index Catalog (pg_indexes)</span>' +
        '</div>';

      if (!meta.indices || meta.indices.length === 0) {
        idxHtml += '<div style="color: var(--text-dim); font-size: 11px; padding: 12px 0;">No indexes registered on this relation.</div>';
      } else {
        idxHtml += '<table class="data-grid">' +
          '<thead><tr><th>Index Name</th><th style="width: 90px; text-align: center;">Unique</th><th>Index Definition (SQL)</th><th style="width: 80px; text-align: center;">Action</th></tr></thead>' +
          '<tbody>';
        meta.indices.forEach(idx => {
          idxHtml += '<tr>' +
            '<td style="font-family: var(--font-mono); color: var(--amber); font-weight: 600;">' + escapeHtml(idx.name) + '</td>' +
            '<td style="text-align: center;">' + (idx.unique ? '<span class="brand-badge" style="background: rgba(245,158,11,0.2); color: #fbbf24; font-size: 9px;">UNIQUE</span>' : '<span style="color: var(--text-dim);">-</span>') + '</td>' +
            '<td style="font-family: var(--font-mono); font-size: 11px; color: #94a3b8;">' + escapeHtml(idx.indexDef || '-') + '</td>' +
            '<td style="text-align: center;">' + (!idx.name.endsWith("_pkey") ? '<button class="btn btn-sm btn-danger" onclick="executeDropIndex(&quot;' + escapeHtml(meta.name) + '&quot;, &quot;' + escapeHtml(idx.name) + '&quot;)" title="Drop Index">🗑️</button>' : '<span style="color: var(--text-dim); font-size: 10px;">PK</span>') + '</td>' +
            '</tr>';
        });
        idxHtml += '</tbody></table>';
      }

      if (isTable) {
        idxHtml += '<div style="margin-top: 14px; padding: 12px; background: rgba(0,0,0,0.25); border: 1px dashed var(--border-subtle); border-radius: 6px;">' +
          '<div style="font-size: 11px; font-weight: 700; color: var(--amber); margin-bottom: 8px;">➕ Create Table Index (CREATE INDEX ON...)</div>' +
          '<div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">' +
          '<input type="text" id="addIdxName" placeholder="Index name (e.g. idx_' + meta.name + '_col)..." style="font-size: 11px; padding: 5px 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; color: #fff; width: 200px;">' +
          '<select id="addIdxCol" style="font-size: 11px; padding: 4px 20px 4px 8px; width: 140px;">' +
          (meta.columns || []).map(c => '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>').join('') +
          '</select>' +
          '<select id="addIdxType" style="font-size: 11px; padding: 4px 20px 4px 8px; width: 110px;">' +
          '<option value="btree">BTREE</option>' +
          '<option value="gin">GIN</option>' +
          '<option value="hash">HASH</option>' +
          '<option value="brin">BRIN</option>' +
          '</select>' +
          '<label style="font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 4px;"><input type="checkbox" id="addIdxUnique"> Unique</label>' +
          '<button class="btn btn-sm btn-primary" onclick="executeCreateIndex(&quot;' + escapeHtml(meta.name) + '&quot;)">➕ Create Index</button>' +
          '</div></div>';
      }

      idxCard.innerHTML = idxHtml;
      container.appendChild(idxCard);

      // 4. Foreign Keys Card
      if (meta.foreignKeys && meta.foreignKeys.length > 0) {
        const fkCard = document.createElement("div");
        fkCard.className = "card";
        fkCard.style.background = "var(--bg-card)";
        fkCard.style.border = "1px solid var(--border-subtle)";
        fkCard.style.borderRadius = "8px";
        fkCard.style.padding = "16px";
        fkCard.style.marginBottom = "12px";

        let fkHtml = '<div class="card-title" style="font-weight: 700; color: var(--indigo); margin-bottom: 10px;">🔗 Foreign Key Relationships (' + meta.foreignKeys.length + ')</div>' +
          '<table class="data-grid">' +
          '<thead><tr><th>Constraint</th><th>Source Column</th><th>Referenced Target Table</th><th>Referenced Target Column</th></tr></thead>' +
          '<tbody>';
        meta.foreignKeys.forEach(fk => {
          fkHtml += '<tr>' +
            '<td style="font-family: var(--font-mono); color: #cbd5e1;">' + escapeHtml(fk.constraint_name || fk.id || 'fk') + '</td>' +
            '<td style="color: var(--cyan); font-weight: 600;">' + escapeHtml(fk.from || fk.column_name || '-') + '</td>' +
            '<td style="color: var(--indigo); font-weight: 600;">' + escapeHtml(fk.table || fk.foreign_table_name || '-') + '</td>' +
            '<td style="color: var(--emerald); font-weight: 600;">' + escapeHtml(fk.to || fk.foreign_column_name || '-') + '</td>' +
            '</tr>';
        });
        fkHtml += '</tbody></table>';
        fkCard.innerHTML = fkHtml;
        container.appendChild(fkCard);
      }

      // 5. Live DDL Definition Card
      const ddlCard = document.createElement("div");
      ddlCard.className = "card";
      ddlCard.style.background = "var(--bg-card)";
      ddlCard.style.border = "1px solid var(--border-subtle)";
      ddlCard.style.borderRadius = "8px";
      ddlCard.style.padding = "16px";
      const defaultDdl = '-- Schema definition for "' + meta.name + '"\\nCREATE TABLE "' + meta.name + '" (\\n' +
        (meta.columns || []).map(c => '  "' + c.name + '" ' + (c.type || 'text') + (c.pk ? ' PRIMARY KEY' : '') + (c.notnull ? ' NOT NULL' : '') + (c.dflt_value ? ' DEFAULT ' + c.dflt_value : '')).join(',\\n') + '\\n);';
      const ddlContent = meta.sql || meta.definition || defaultDdl;
      ddlCard.innerHTML = '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
        '<div class="card-title" style="font-weight: 700; margin-bottom: 0;">DDL Definition (SQL)</div>' +
        '<div style="display: flex; gap: 6px;">' +
        '<button class="btn btn-sm" onclick="navigator.clipboard.writeText(' + JSON.stringify(ddlContent) + '); showToast(&quot;DDL copied to clipboard!&quot;);">📋 Copy DDL</button>' +
        '<button class="btn btn-sm btn-primary" onclick="openDdlInSqlEditor(' + JSON.stringify(ddlContent) + ')">⚡ Open in SQL IDE</button>' +
        '</div></div>' +
        '<div class="code-box" style="height: 140px; overflow-y: auto; font-family: var(--font-mono); font-size: 11px; background: rgba(0,0,0,0.35); padding: 12px; border-radius: 6px; border: 1px solid var(--border-subtle); color: #cbd5e1; white-space: pre-wrap;">' + escapeHtml(ddlContent) + '</div>';

      container.appendChild(ddlCard);
    }

    function openDdlInSqlEditor(ddl) {
      const sqlEditor = document.getElementById("sqlEditorTextarea") || document.getElementById("sqlEditor");
      if (sqlEditor) sqlEditor.value = ddl;
      switchTab("sql");
    }

    async function executeAddColumn(tableName) {
      const nameInput = document.getElementById("addColName");
      const typeSelect = document.getElementById("addColType");
      const notNullCheck = document.getElementById("addColNotNull");
      const defaultInput = document.getElementById("addColDefault");

      const colName = nameInput?.value?.trim();
      if (!colName) {
        showToast("Please enter a column name");
        return;
      }

      const colPayload = {
        name: colName,
        type: typeSelect?.value || "text",
        notnull: Boolean(notNullCheck?.checked),
        dflt_value: defaultInput?.value?.trim() || undefined
      };

      showToast("Adding column " + colName + " to " + tableName + "...");
      const res = await apiRequest("/api/schema/add-column", "POST", { table: tableName, column: colPayload });
      if (res && res.success) {
        showToast("✓ Column " + colName + " added successfully!");
        await loadSchema();
        renderSchemaDesigner(tableName);
      } else {
        showToast("Error adding column: " + (res?.error || "Failed"));
      }
    }

    async function executeDropColumn(tableName, columnName) {
      if (!confirm("Are you sure you want to drop column \\"" + columnName + "\\" from table \\"" + tableName + "\\"?\\nThis action cannot be undone.")) {
        return;
      }
      showToast("Dropping column " + columnName + "...");
      const res = await apiRequest("/api/schema/drop-column", "POST", { table: tableName, column: columnName, cascade: true });
      if (res && res.success) {
        showToast("✓ Column " + columnName + " dropped");
        await loadSchema();
        renderSchemaDesigner(tableName);
      } else {
        showToast("Error dropping column: " + (res?.error || "Failed"));
      }
    }

    async function executeCreateIndex(tableName) {
      const nameInput = document.getElementById("addIdxName");
      const colSelect = document.getElementById("addIdxCol");
      const typeSelect = document.getElementById("addIdxType");
      const uniqueCheck = document.getElementById("addIdxUnique");

      const idxName = nameInput?.value?.trim() || ("idx_" + tableName + "_" + colSelect?.value);
      const col = colSelect?.value;
      if (!col) {
        showToast("Select a column to index");
        return;
      }

      showToast("Creating index " + idxName + "...");
      const res = await apiRequest("/api/indexes/create", "POST", {
        name: idxName,
        table: tableName,
        columns: [col],
        type: typeSelect?.value || "btree",
        unique: Boolean(uniqueCheck?.checked)
      });

      if (res && res.success) {
        showToast("✓ Index " + idxName + " created!");
        await loadSchema();
        renderSchemaDesigner(tableName);
      } else {
        showToast("Error creating index: " + (res?.error || "Failed"));
      }
    }

    async function executeDropIndex(tableName, indexName) {
      if (!confirm("Drop index \\"" + indexName + "\\"?")) return;
      showToast("Dropping index " + indexName + "...");
      const res = await apiRequest("/api/indexes/drop", "POST", { name: indexName });
      if (res && res.success) {
        showToast("✓ Index dropped");
        await loadSchema();
        renderSchemaDesigner(tableName);
      } else {
        showToast("Error dropping index: " + (res?.error || "Failed"));
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Audit Logging
    // ---------------------------------------------------------------------------------------------
    async function loadAuditLogs() {
      const box = document.getElementById("auditLogBox");
      if (!box) return;
      const res = await apiRequest("/api/audit-logs");
      if (res && res.success && Array.isArray(res.logs)) {
        if (res.logs.length === 0) {
          box.textContent = "[SYSTEM] No audit logs recorded yet in database.";
        } else {
          box.textContent = res.logs.map(l => {
            const timeStr = new Date(l.timestamp || Date.now()).toLocaleTimeString();
            const actionStr = l.action || 'MUTATION';
            const entityStr = l.entity || 'cluster';
            const detailsStr = typeof l.details === 'object' ? JSON.stringify(l.details) : (l.details || '');
            return '[' + timeStr + '] ' + actionStr + ' on ' + entityStr + ': ' + detailsStr;
          }).join('\\n');
        }
      } else {
        box.textContent = "[SYSTEM] Postgres Studio Pro initialized. All subsystems ready.";
      }
    }

    function logAudit(msg) {
      const box = document.getElementById("auditLogBox");
      if (!box) return;
      const line = "[" + new Date().toLocaleTimeString() + "] " + msg;
      box.textContent = line + "\\n" + box.textContent;
    }

    // ---------------------------------------------------------------------------------------------
    // Integrity & Server Settings / PRAGMA
    // ---------------------------------------------------------------------------------------------
    async function checkIntegrity() {
      showToast("Running PostgreSQL schema integrity check...");
      const res = await apiRequest("/api/integrity");
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);
      const healthy = !!res && res.success !== false && (!res.issues || res.issues.length === 0);
      showToast(healthy ? "Integrity check OK: All tables and indexes are healthy!" : "Integrity check reported issues - see Output");
      logAudit(healthy ? "[INTEGRITY] Schema integrity check passed: OK" : "[INTEGRITY] Schema integrity check found issues");
      switchTab("pragma");
    }

    async function togglePragma(name, val) {
      const res = await apiRequest("/api/pragma", "POST", { pragma: name, value: val });
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);
      if (!res || res.success === false) {
        showToast("Setting " + name + " failed: " + (res?.error || "Unknown"));
        return;
      }
      showToast("Setting " + name + "=" + val + " applied!");
      logAudit("[SETTING] " + name + "=" + val);
      await loadKpis();
    }

    async function runPragmaCommand(cmd) {
      const res = await apiRequest("/api/query", "POST", { sql: cmd });
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);
      showToast("Command " + cmd + " executed!");
      logAudit("[COMMAND] " + cmd);
    }

    // ---------------------------------------------------------------------------------------------
    // PostgreSQL GUC Configuration Tuner (pg_settings)
    // ---------------------------------------------------------------------------------------------
    let allGucSettings = [];
    let currentGucCategory = "all";

    async function loadPragmaSettings() {
      const res = await apiRequest("/api/pragma");
      if (res && res.success) {
        if (Array.isArray(res.settings)) {
          allGucSettings = res.settings;
          renderGucSettingsTable();
        }
        const outBox = document.getElementById("pragmaOutputBox");
        if (outBox) {
          outBox.textContent = typeof res.result === "string" ? res.result : JSON.stringify(res.result || res.settings || res, null, 2);
        }
      }
    }

    function renderGucSettingsTable() {
      const tbody = document.getElementById("gucSettingsBody");
      const badge = document.getElementById("gucSettingsCountBadge");
      if (!tbody) return;

      let filtered = allGucSettings;
      if (currentGucCategory === "memory") {
        filtered = filtered.filter(s => /mem|buffer|cache/i.test(s.name) || /memory|resource/i.test(s.category || ""));
      } else if (currentGucCategory === "planner") {
        filtered = filtered.filter(s => /cost|scan|join|plan|geqo/i.test(s.name) || /planner/i.test(s.category || ""));
      } else if (currentGucCategory === "wal") {
        filtered = filtered.filter(s => /wal|checkpoint|archive/i.test(s.name) || /write-ahead/i.test(s.category || ""));
      } else if (currentGucCategory === "connections") {
        filtered = filtered.filter(s => /conn|listen|port|socket|auth/i.test(s.name) || /connection/i.test(s.category || ""));
      } else if (currentGucCategory === "autovacuum") {
        filtered = filtered.filter(s => /vacuum|analyze/i.test(s.name) || /autovacuum/i.test(s.category || ""));
      }

      const q = (document.getElementById("gucSearchInput")?.value || "").toLowerCase().trim();
      if (q) {
        filtered = filtered.filter(s => (s.name || "").toLowerCase().includes(q) || (s.short_desc || "").toLowerCase().includes(q));
      }

      if (badge) badge.innerText = filtered.length + " settings";

      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 20px;">No parameters match the current filter</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.map(s => {
        return '<tr>' +
          '<td style="font-family: var(--font-mono); color: var(--cyan); font-weight: 600;">' + escapeHtml(s.name) + '</td>' +
          '<td><span class="brand-badge" style="background: rgba(56, 189, 248, 0.15); color: #7dd3fc;">' + escapeHtml(String(s.setting ?? '')) + '</span></td>' +
          '<td style="font-size: 10px; color: var(--text-dim);">' + escapeHtml(s.unit || '-') + '</td>' +
          '<td style="font-size: 11px; color: var(--text-muted);">' + escapeHtml(s.category || 'General') + '</td>' +
          '<td><span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.05); color: var(--text-dim);">' + escapeHtml(s.context || 'user') + '</span></td>' +
          '<td style="font-size: 11px; color: var(--text-dim); max-width: 300px;">' + escapeHtml(s.short_desc || '-') + '</td>' +
          '<td style="text-align: center;"><button class="btn btn-sm" onclick="editGucSetting(&quot;' + escapeHtml(s.name) + '&quot;, &quot;' + escapeHtml(String(s.setting ?? '')) + '&quot;, &quot;' + escapeHtml(s.unit || '') + '&quot;)">✎ Edit</button></td>' +
          '</tr>';
      }).join('');
    }

    function setGucCategory(cat) {
      currentGucCategory = cat;
      const cats = ["All", "Mem", "Plan", "Wal", "Conn", "Vac"];
      cats.forEach(c => {
        const btn = document.getElementById("btnGuc" + c);
        if (btn) btn.classList.remove("btn-primary");
      });
      const activeBtn = document.getElementById("btnGuc" + (cat === "all" ? "All" : cat === "memory" ? "Mem" : cat === "planner" ? "Plan" : cat === "wal" ? "Wal" : cat === "connections" ? "Conn" : "Vac"));
      if (activeBtn) activeBtn.classList.add("btn-primary");
      renderGucSettingsTable();
    }

    function filterGucSettings() {
      renderGucSettingsTable();
    }

    async function editGucSetting(paramName, currentVal, unit) {
      const promptMsg = "Enter new value for PostgreSQL parameter \\"" + paramName + "\\"" + (unit ? " (" + unit + ")" : "") + ":";
      const newVal = prompt(promptMsg, currentVal);
      if (newVal === null || newVal.trim() === "") return;
      showToast("Updating parameter " + paramName + " -> " + newVal + "...");
      const res = await apiRequest("/api/pragma", "POST", { pragma: paramName, value: newVal.trim() });
      if (res && res.success) {
        showToast("✓ Parameter updated: " + paramName + " = " + newVal);
        loadPragmaSettings();
      } else {
        showToast("Error updating parameter: " + (res?.error || "Failed"));
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Microsoft Access Totals Row & Quick Filter Bar
    // ---------------------------------------------------------------------------------------------
    let accessTotalsRowVisible = false;
    let accessFilterBarVisible = false;
    let activeColumnFilters = {};

    function toggleAccessTotalsRow() {
      accessTotalsRowVisible = !accessTotalsRowVisible;
      const btn = document.getElementById("btnToggleTotals");
      if (btn) {
        if (accessTotalsRowVisible) btn.classList.add("btn-primary");
        else btn.classList.remove("btn-primary");
      }
      if (currentGridData && currentGridData.rows && currentGridData.columns) {
        updateAccessTotalsRow(currentGridData.rows, currentGridData.columns, currentGridData.total);
      }
      showToast(accessTotalsRowVisible ? "Access Totals Row enabled" : "Access Totals Row disabled");
    }

    async function updateAccessTotalsRow(rows, columns, total) {
      const foot = document.getElementById("gridTotalsFoot");
      if (!foot) return;
      if (!accessTotalsRowVisible) {
        foot.style.display = "none";
        foot.innerHTML = "";
        return;
      }
      foot.style.display = "table-footer-group";

      if (!columns || columns.length === 0) {
        foot.innerHTML = "";
        return;
      }

      const stats = {};
      columns.forEach(c => {
        let isNum = true;
        let sum = 0;
        let count = 0;
        let min = null;
        let max = null;
        rows.forEach(r => {
          const val = r[c];
          if (val !== null && val !== undefined && val !== "") {
            const num = Number(val);
            if (!isNaN(num) && typeof val !== "boolean") {
              sum += num;
              count++;
              if (min === null || num < min) min = num;
              if (max === null || num > max) max = num;
            } else {
              isNum = false;
            }
          }
        });
        if (isNum && count > 0) {
          stats[c] = {
            count,
            sum: Math.round(sum * 100) / 100,
            avg: Math.round((sum / count) * 100) / 100,
            min,
            max
          };
        } else {
          stats[c] = { count: rows.length };
        }
      });

      const cellsHtml = columns.map(c => {
        const s = stats[c];
        if (s && s.sum !== undefined) {
          return "<td><div style='display:flex; flex-direction:column; gap:2px;'>" +
            "<span class='access-total-badge' title='Sum'>Σ " + s.sum.toLocaleString() + "</span>" +
            "<span style='font-size:9px; color:var(--text-dim);' title='Average'>x̄ " + s.avg.toLocaleString() + "</span>" +
            "</div></td>";
        }
        return "<td><span style='font-size:10px; color:var(--text-dim);'>Count: " + (s?.count ?? rows.length) + "</span></td>";
      }).join('');

      foot.innerHTML = "<tr><td style='color:var(--cyan); font-weight:800; text-align:center;'>Total: " + total.toLocaleString() + "</td>" + cellsHtml + "</tr>";
    }

    function toggleQuickFilterBar() {
      accessFilterBarVisible = !accessFilterBarVisible;
      const btn = document.getElementById("btnToggleFilterBar");
      const filterRow = document.getElementById("gridFilterBarRow");
      if (btn) {
        if (accessFilterBarVisible) btn.classList.add("btn-primary");
        else btn.classList.remove("btn-primary");
      }
      if (filterRow) {
        filterRow.style.display = accessFilterBarVisible ? "table-row" : "none";
      }
      if (!accessFilterBarVisible) {
        activeColumnFilters = {};
        if (activeTable) loadTableData(activeTable, 1);
      }
      showToast(accessFilterBarVisible ? "Quick Filter Bar opened" : "Quick Filter Bar cleared");
    }

    function onColumnFilterInput(colName, filterVal) {
      if (!filterVal || filterVal.trim() === "") {
        delete activeColumnFilters[colName];
      } else {
        activeColumnFilters[colName] = filterVal.trim();
      }
      filterLoadedRowsInMemory();
    }

    function filterByColumnValue(colName, colVal) {
      accessFilterBarVisible = true;
      const btn = document.getElementById("btnToggleFilterBar");
      if (btn) btn.classList.add("btn-primary");
      const filterRow = document.getElementById("gridFilterBarRow");
      if (filterRow) filterRow.style.display = "table-row";

      activeColumnFilters[colName] = String(colVal);
      showToast("Filtered by " + colName + " = " + colVal);
      filterLoadedRowsInMemory();
    }

    function filterLoadedRowsInMemory() {
      if (!currentGridData || !currentGridData.rawRows) return;
      const filterKeys = Object.keys(activeColumnFilters);
      if (filterKeys.length === 0) {
        currentGridData.rows = [...currentGridData.rawRows];
      } else {
        currentGridData.rows = currentGridData.rawRows.filter(row => {
          return filterKeys.every(k => {
            const needle = activeColumnFilters[k].toLowerCase();
            const val = row[k];
            if (val === null || val === undefined) return needle === "null";
            return String(val).toLowerCase().includes(needle);
          });
        });
      }
      renderGridTable(currentGridData.rows, currentGridData.columns, currentGridData.rows.length, 1, gridPageSize);
    }

    async function openAccessReportModal() {
      const modal = document.getElementById("accessReportModal");
      const content = document.getElementById("accessReportContent");
      if (!modal || !content) return;

      modal.style.display = "flex";
      modal.classList.add("active");

      if ((!currentGridData || !currentGridData.rows || !currentGridData.rows.length) && activeTable) {
        try { await loadTableData(activeTable); } catch(e) {}
      }

      const tblName = activeTable || "PostgreSQL Query Report";
      const rows = currentGridData && currentGridData.rows ? currentGridData.rows : [];
      let columns = currentGridData && currentGridData.columns ? currentGridData.columns : [];

      if (!columns.length && activeTable && currentSchema && currentSchema.tables) {
        const tbl = currentSchema.tables.find(t => t.name === activeTable);
        if (tbl && tbl.columns) columns = tbl.columns.map(c => c.name);
      }

      const dateStr = new Date().toLocaleString();
      const dbName = document.getElementById("kpiDbName")?.innerText || "mydb";

      let html = '<div class="access-report-sheet">';
      html += '<div class="access-report-header">';
      html += '  <div>';
      html += '    <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:#0284c7; letter-spacing:1px;">Microsoft Access Workstation Report</div>';
      html += '    <div class="access-report-title">' + escapeHtml(tblName) + '</div>';
      html += '  </div>';
      html += '  <div class="access-report-meta">';
      html += '    <div>Database: <strong>' + escapeHtml(dbName) + '</strong></div>';
      html += '    <div>Generated: <strong>' + dateStr + '</strong></div>';
      html += '    <div>Total Records: <strong>' + rows.length.toLocaleString() + '</strong></div>';
      html += '  </div>';
      html += '</div>';

      html += '<table class="access-report-table">';
      html += '  <thead><tr><th style="width:36px; text-align:center;">#</th>' + columns.map(c => '<th>' + escapeHtml(c) + '</th>').join('') + '</tr></thead>';
      html += '  <tbody>';
      rows.slice(0, 100).forEach((r, idx) => {
        html += '<tr><td style="text-align:center; color:#94a3b8; font-weight:600;">' + (idx + 1) + '</td>';
        columns.forEach(c => {
          const val = r[c];
          if (val === null || val === undefined) {
            html += '<td style="color:#94a3b8; font-style:italic;">NULL</td>';
          } else if (typeof val === 'object') {
            html += '<td><code>' + escapeHtml(JSON.stringify(val).slice(0, 40)) + '</code></td>';
          } else {
            html += '<td>' + escapeHtml(String(val)) + '</td>';
          }
        });
        html += '</tr>';
      });
      html += '  </tbody>';
      html += '</table>';

      html += '<div class="access-report-summary">';
      html += '  <span>End of Report: ' + rows.length.toLocaleString() + ' Records Processed</span>';
      html += '  <span>🐘 Postgres Studio Pro / Access Parity Engine</span>';
      html += '</div>';
      html += '</div>';

      content.innerHTML = html;
      modal.style.display = "flex";
      modal.classList.add("active");
    }

    function closeAccessReportModal() {
      const modal = document.getElementById("accessReportModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    }

    function printAccessReport() {
      window.print();
    }

    function exportAccessReportHtml() {
      const content = document.getElementById("accessReportContent");
      if (!content) return;
      const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report - ' + (activeTable || "Postgres") + '</title><style>' +
        (document.querySelector("style")?.innerText || "") +
        '</style></head><body style="background:#f1f5f9; padding:20px;">' +
        content.innerHTML +
        '</body></html>';

      const blob = new Blob([fullHtml], { type: "text/html" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "report_" + (activeTable || "query") + "_" + Date.now() + ".html";
      a.click();
      showToast("✓ Report HTML exported!");
    }

    // ---------------------------------------------------------------------------------------------
    // PostgreSQL Enterprise Database Backup & SQL Dump
    // ---------------------------------------------------------------------------------------------
    let currentDumpSql = "";

    async function openDatabaseDumpModal() {
      const modal = document.getElementById("dumpModal");
      const listEl = document.getElementById("dumpTablesList");
      if (!modal) return;

      if (listEl && currentSchema && currentSchema.tables) {
        listEl.innerHTML = currentSchema.tables.map(t => {
          return '<label style="display:flex; align-items:center; gap:4px; font-size:11px; color:#fff; cursor:pointer;">' +
            '<input type="checkbox" class="dump-table-chk" value="' + escapeHtml(t.name) + '" checked> ' +
            escapeHtml(t.name) +
            '</label>';
        }).join('');
      }

      modal.style.display = "flex";
      modal.classList.add("active");
      await runGenerateDump();
    }

    function closeDatabaseDumpModal() {
      const modal = document.getElementById("dumpModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    }

    async function runGenerateDump() {
      const mode = document.getElementById("dumpModeSelect")?.value || "all";
      const chks = document.querySelectorAll(".dump-table-chk:checked");
      const tables = Array.from(chks).map(c => c.value);

      const preview = document.getElementById("dumpSqlPreview");
      if (preview) preview.value = "-- Generating PostgreSQL SQL Dump...";

      showToast("Generating PostgreSQL database dump (" + mode + ")...");
      const res = await apiRequest("/api/database/dump", "POST", { mode, tables });
      if (res && res.success) {
        currentDumpSql = res.sql;
        if (preview) preview.value = currentDumpSql;
        showToast("✓ Database dump generated (" + currentDumpSql.length.toLocaleString() + " bytes)");
      } else {
        if (preview) preview.value = "-- Error generating dump: " + (res?.error || "Unknown error");
        showToast("Error generating dump: " + (res?.error || "Failed"));
      }
    }

    function copyDumpSql() {
      if (!currentDumpSql) return;
      navigator.clipboard.writeText(currentDumpSql);
      showToast("✓ SQL dump copied to clipboard!");
    }

    function downloadDumpFile() {
      if (!currentDumpSql) return;
      const dbName = document.getElementById("kpiDbName")?.innerText || "mydb";
      const blob = new Blob([currentDumpSql], { type: "application/sql" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "pg_dump_" + dbName + "_" + Date.now() + ".sql";
      a.click();
      showToast("✓ Downloaded SQL dump file!");
    }

    function openDumpInSqlIde() {
      if (!currentDumpSql) return;
      const sqlEl = document.getElementById("sqlEditorTextarea") || document.getElementById("sqlEditor");
      if (sqlEl) sqlEl.value = currentDumpSql.slice(0, 10000);
      closeDatabaseDumpModal();
      switchTab("sql");
      showToast("Opened dump in SQL Query Console!");
    }

    // ---------------------------------------------------------------------------------------------
    // PostgreSQL Custom ENUM Types Management
    // ---------------------------------------------------------------------------------------------
    let allEnumTypes = [];

    async function loadEnumTypes() {
      const res = await apiRequest("/api/types/enums");
      if (res && res.success) {
        allEnumTypes = res.enums || [];
        renderEnumTypesGrid(allEnumTypes);
      }
    }

    function renderEnumTypesGrid(enums) {
      const grid = document.getElementById("enumTypesGrid");
      if (!grid) return;

      if (!enums || enums.length === 0) {
        grid.innerHTML = '<div class="card" style="padding:24px; text-align:center; color:var(--text-dim); grid-column:1/-1;">' +
          'No custom ENUM types found in active schema. Click "+ Create ENUM Type" to define one.' +
          '</div>';
        return;
      }

      grid.innerHTML = enums.map(e => {
        const badges = (e.values || []).map(v => '<span class="enum-badge">' + escapeHtml(v) + '</span>').join(' ');
        return '<div class="enum-card">' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '  <div style="font-weight:700; color:var(--cyan); font-size:13px; font-family:var(--font-mono);">' + escapeHtml(e.name) + '</div>' +
          '  <span class="brand-badge">' + escapeHtml(e.schema || "public") + '</span>' +
          '</div>' +
          '<div style="display:flex; flex-wrap:wrap; gap:6px; margin:8px 0;">' + badges + '</div>' +
          '<div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:8px;">' +
          '  <button class="btn btn-sm" onclick="promptAddEnumValue(&quot;' + escapeHtml(e.name) + '&quot;)">➕ Add Value</button>' +
          '  <button class="btn btn-sm btn-danger" onclick="dropEnumType(&quot;' + escapeHtml(e.name) + '&quot;)">🗑️ Drop</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }

    function filterEnumTypes(q) {
      const needle = (q || "").toLowerCase();
      const filtered = allEnumTypes.filter(e => e.name.toLowerCase().includes(needle) || e.values.some(v => v.toLowerCase().includes(needle)));
      renderEnumTypesGrid(filtered);
    }

    function openCreateEnumModal() {
      const modal = document.getElementById("createEnumModal");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("active");
      }
    }

    function closeCreateEnumModal() {
      const modal = document.getElementById("createEnumModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
      }
    }

    async function submitCreateEnum() {
      const name = document.getElementById("enumNewName")?.value.trim();
      const rawVals = document.getElementById("enumNewValues")?.value.trim();
      if (!name || !rawVals) {
        showToast("Please provide enum name and at least one value!");
        return;
      }
      const values = rawVals.split(",").map(v => v.trim()).filter(Boolean);
      showToast("Creating ENUM type " + name + "...");
      const res = await apiRequest("/api/types/enums/create", "POST", { name, values });
      if (res && res.success) {
        showToast("✓ ENUM type " + name + " created successfully!");
        closeCreateEnumModal();
        loadEnumTypes();
      } else {
        showToast("Error creating enum: " + (res?.error || "Failed"));
      }
    }

    async function promptAddEnumValue(enumName) {
      const val = prompt("Enter new value to append to ENUM " + enumName + ":");
      if (!val || val.trim() === "") return;
      showToast("Adding value to " + enumName + "...");
      const res = await apiRequest("/api/types/enums/add-value", "POST", { name: enumName, value: val.trim() });
      if (res && res.success) {
        showToast("✓ Value added to ENUM " + enumName);
        loadEnumTypes();
      } else {
        showToast("Error adding value: " + (res?.error || "Failed"));
      }
    }

    async function dropEnumType(enumName) {
      if (!confirm("Are you sure you want to drop ENUM type " + enumName + " (CASCADE)?")) return;
      showToast("Dropping ENUM type " + enumName + "...");
      const res = await apiRequest("/api/types/enums/drop", "POST", { name: enumName });
      if (res && res.success) {
        showToast("✓ ENUM type " + enumName + " dropped");
        loadEnumTypes();
      } else {
        showToast("Error dropping enum: " + (res?.error || "Failed"));
      }
    }

    // ---------------------------------------------------------------------------------------------
    // PostgreSQL Declarative Partition Trees Explorer
    // ---------------------------------------------------------------------------------------------
    async function loadPartitions() {
      const container = document.getElementById("partitionsContainer");
      if (!container) return;
      container.innerHTML = '<div style="color:var(--text-dim); padding:20px; text-align:center;">Loading partitioned tables...</div>';

      const res = await apiRequest("/api/partitions");
      if (res && res.success) {
        const partitions = res.partitions || [];
        if (!partitions.length) {
          container.innerHTML = '<div class="card" style="padding:24px; text-align:center; color:var(--text-dim);">' +
            'No declarative partitioned tables found in the active schema.<br>' +
            '<span style="font-size:11px; color:var(--text-muted);">Use <code>PARTITION BY RANGE / LIST / HASH</code> in DDL to enable declarative table partitioning.</span>' +
            '</div>';
          return;
        }

        const grouped = {};
        partitions.forEach(p => {
          if (!grouped[p.parentTable]) grouped[p.parentTable] = [];
          grouped[p.parentTable].push(p);
        });

        container.innerHTML = Object.keys(grouped).map(parent => {
          const parts = grouped[parent];
          const strat = parts[0]?.partitionStrategy || "RANGE";
          const rows = parts.map(p => {
            return '<tr>' +
              '<td style="font-weight:600; color:var(--cyan);">' + escapeHtml(p.partitionName) + '</td>' +
              '<td><code>' + escapeHtml(p.partitionExpression) + '</code></td>' +
              '<td>' + escapeHtml(p.totalSize) + '</td>' +
              '<td>' + p.rowEstimate.toLocaleString() + '</td>' +
              '</tr>';
          }).join('');

          return '<div class="card" style="margin-bottom:16px;">' +
            '<div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">' +
            '  <span>📦 Table: <strong style="color:var(--cyan);">' + escapeHtml(parent) + '</strong></span>' +
            '  <span class="brand-badge" style="background:rgba(245,158,11,0.2); color:#fbbf24;">' + strat + ' PARTITIONED</span>' +
            '</div>' +
            '<table class="data-grid" style="margin-top:10px;">' +
            '  <thead><tr><th>Partition Name</th><th>Partition Bound Expression</th><th>Size</th><th>Estimated Rows</th></tr></thead>' +
            '  <tbody>' + rows + '</tbody>' +
            '</table>' +
            '</div>';
        }).join('');
      }
    }

    // ---------------------------------------------------------------------------------------------
    // PostgreSQL Streaming Replication & WAL Diagnostics
    // ---------------------------------------------------------------------------------------------
    async function loadReplicationStatus() {
      const container = document.getElementById("replicationContainer");
      if (!container) return;
      container.innerHTML = '<div style="color:var(--text-dim); padding:20px; text-align:center;">Querying replication catalog...</div>';

      const res = await apiRequest("/api/replication");
      if (res && res.success) {
        const repl = res.replication || {};
        const standbys = repl.standbys || [];
        const slots = repl.slots || [];
        const wal = repl.walStats || {};

        let standbysHtml = '';
        if (standbys.length === 0) {
          standbysHtml = '<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:16px;">No streaming standby replicas currently connected.</td></tr>';
        } else {
          standbysHtml = standbys.map(s => {
            return '<tr>' +
              '<td>' + s.pid + '</td>' +
              '<td>' + escapeHtml(s.clientAddr) + '</td>' +
              '<td>' + escapeHtml(s.applicationName) + '</td>' +
              '<td><span class="brand-badge">' + escapeHtml(s.state) + '</span></td>' +
              '<td>' + escapeHtml(s.syncState) + '</td>' +
              '<td>' + escapeHtml(s.writeLag) + '</td>' +
              '<td>' + escapeHtml(s.replayLag) + '</td>' +
              '</tr>';
          }).join('');
        }

        let slotsHtml = '';
        if (slots.length === 0) {
          slotsHtml = '<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:16px;">No physical or logical replication slots configured.</td></tr>';
        } else {
          slotsHtml = slots.map(sl => {
            return '<tr>' +
              '<td><strong>' + escapeHtml(sl.slotName) + '</strong></td>' +
              '<td>' + escapeHtml(sl.plugin) + '</td>' +
              '<td>' + escapeHtml(sl.slotType) + '</td>' +
              '<td><span class="brand-badge" style="background:' + (sl.active ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)') + '; color:' + (sl.active ? '#4ade80' : '#f87171') + ';">' + (sl.active ? 'ACTIVE' : 'INACTIVE') + '</span></td>' +
              '<td>' + escapeHtml(sl.walStatus) + '</td>' +
              '</tr>';
          }).join('');
        }

        container.innerHTML = '' +
          '<div class="card">' +
          '  <div class="card-title">📡 Streaming Standby Replicas (pg_stat_replication)</div>' +
          '  <table class="data-grid" style="margin-top:10px;">' +
          '    <thead><tr><th>PID</th><th>Client Address</th><th>App Name</th><th>State</th><th>Sync State</th><th>Write Lag</th><th>Replay Lag</th></tr></thead>' +
          '    <tbody>' + standbysHtml + '</tbody>' +
          '  </table>' +
          '</div>' +
          '<div class="card">' +
          '  <div class="card-title">🔒 Replication Slots (pg_replication_slots)</div>' +
          '  <table class="data-grid" style="margin-top:10px;">' +
          '    <thead><tr><th>Slot Name</th><th>Plugin</th><th>Type</th><th>Active</th><th>WAL Status</th></tr></thead>' +
          '    <tbody>' + slotsHtml + '</tbody>' +
          '  </table>' +
          '</div>' +
          '<div class="card">' +
          '  <div class="card-title">💾 Write-Ahead Logging (pg_stat_wal)</div>' +
          '  <div style="display:flex; gap:16px; margin-top:10px; flex-wrap:wrap;">' +
          '    <div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; flex:1; min-width:140px;">' +
          '      <div style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">WAL Records</div>' +
          '      <div style="font-size:16px; font-weight:800; color:var(--cyan);">' + (wal.wal_records !== undefined ? Number(wal.wal_records).toLocaleString() : '0') + '</div>' +
          '    </div>' +
          '    <div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; flex:1; min-width:140px;">' +
          '      <div style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">WAL Full Page Images</div>' +
          '      <div style="font-size:16px; font-weight:800; color:var(--emerald);">' + (wal.wal_fpi !== undefined ? Number(wal.wal_fpi).toLocaleString() : '0') + '</div>' +
          '    </div>' +
          '    <div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; flex:1; min-width:140px;">' +
          '      <div style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">WAL Buffers Full</div>' +
          '      <div style="font-size:16px; font-weight:800; color:var(--amber);">' + (wal.wal_buffers_full !== undefined ? Number(wal.wal_buffers_full).toLocaleString() : '0') + '</div>' +
          '    </div>' +
          '  </div>' +
          '</div>';
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Sidebar Resizer & Layout Helpers
    // ---------------------------------------------------------------------------------------------
    function initSidebarResizer() {
      const aside = document.getElementById("sidebar") || document.getElementById("mainSidebar");
      const resizer = document.getElementById("sidebarResizer");
      if (!aside || !resizer) return;

      let isResizing = false;
      let startX = 0;
      let startW = 0;

      resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        startX = e.clientX;
        startW = aside.getBoundingClientRect().width;
        resizer.classList.add("resizing");
        document.body.style.cursor = "col-resize";
        e.preventDefault();
      });

      window.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const delta = e.clientX - startX;
        const newW = Math.max(260, Math.min(650, startW + delta));
        aside.style.width = newW + "px";
      });

      window.addEventListener("mouseup", () => {
        if (isResizing) {
          isResizing = false;
          resizer.classList.remove("resizing");
          document.body.style.cursor = "";
        }
      });
    }

    function toggleSidebarWidth() {
      const aside = document.getElementById("sidebar") || document.getElementById("mainSidebar");
      if (!aside) return;
      const curW = aside.getBoundingClientRect().width;
      aside.style.width = (curW > 350 ? 280 : 480) + "px";
    }

    function adjustSidebarWidth(delta) {
      const aside = document.getElementById("sidebar") || document.getElementById("mainSidebar");
      if (!aside) return;
      const curW = aside.getBoundingClientRect().width;
      aside.style.width = Math.max(260, Math.min(650, curW + delta)) + "px";
    }

    function toggleAllGroups() {
      const lists = [
        document.getElementById("sidebarTablesList"),
        document.getElementById("sidebarMatViewsList"),
        document.getElementById("sidebarViewsList"),
      ];
      const anyHidden = lists.some(el => el && el.style.display === "none");
      lists.forEach(el => {
        if (el) el.style.display = anyHidden ? "block" : "none";
      });
    }

    // Explain Current Query (Visual Execution Tree & Raw Output)
    async function explainCurrentQuery() {
      const sqlEl = document.getElementById("sqlEditorTextarea") || document.getElementById("sqlEditor");
      let sql = sqlEl ? sqlEl.value.trim() : "";
      if ((!sql || activeTab === "designer") && typeof buildDesignerSql === "function") {
        const designerSql = buildDesignerSql();
        if (designerSql) {
          sql = designerSql;
          if (sqlEl) sqlEl.value = sql;
        }
      }
      if (!sql) {
        showToast("Enter a query to explain!");
        return;
      }
      showToast("Generating query execution plan...");
      const res = await apiRequest("/api/explain", "POST", { sql });
      if (res && res.success) {
        if (res.queryPlan) {
          renderExplainPlan(res.queryPlan, sql, res.rawPlan, res.rawText);
        }
        if (res.rawText) {
          const rawOut = document.getElementById("explainOutput");
          if (rawOut) rawOut.textContent = res.rawText;
        }
        const badge = document.getElementById("explainLatencyBadge");
        if (badge && res.latencyMs !== undefined) {
          badge.style.display = "inline-block";
          badge.textContent = res.latencyMs + "ms";
        }
        switchTab("explain");
        showToast("Query plan generated!");
      } else {
        showToast("Explain error: " + (res?.error || "Unknown"));
      }
    }

    function renderExplainPlan(planNodes, sql, rawPlan, rawText) {
      const container = document.getElementById("explainContainer");
      if (!container) return;
      container.innerHTML = "";

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = \`
        <div class="card-title">🔍 Query Plan Analysis</div>
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--cyan); margin-bottom: 8px;">\${escapeHtml(sql)}</div>
      \`;

      const list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "6px";

      planNodes.forEach(node => {
        const item = document.createElement("div");
        item.style.padding = "8px 12px";
        item.style.borderRadius = "6px";
        item.style.background = node.isScan ? "rgba(244, 63, 94, 0.1)" : (node.isIndex ? "rgba(16, 185, 129, 0.1)" : "rgba(56, 189, 248, 0.08)");
        item.style.border = node.isScan ? "1px solid var(--rose)" : (node.isIndex ? "1px solid var(--emerald)" : "1px solid var(--border-subtle)");
        item.style.fontFamily = "var(--font-mono)";
        item.style.fontSize = "11px";

        const badge = node.isScan 
          ? '<span style="color: var(--rose); font-weight: 700;">⚠️ SCAN TABLE (FULL SCAN)</span>'
          : (node.isIndex
            ? '<span style="color: var(--emerald); font-weight: 700;">⚡ INDEX SEARCH</span>'
            : '<span style="color: var(--cyan); font-weight: 700;">🔗 EXECUTION NODE</span>');

        item.innerHTML = \`
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            \${badge}
            <span style="color: var(--text-dim); font-size: 10px;">Node #\${node.id} \${node.parent ? '(Parent: #' + node.parent + ')' : '(Root)'}</span>
          </div>
          <div style="color: var(--text-main); line-height: 1.4;">\${escapeHtml(node.detail)}</div>
        \`;
        list.appendChild(item);
      });

      card.appendChild(list);
      container.appendChild(card);
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

    // Live Activity & Lock Contention Monitor
    async function loadActivity() {
      const res = await apiRequest("/api/activity");
      if (res && res.success) {
        renderActivityGrid(res.activity || [], res.blockedLocks || []);
      }
    }

    function renderActivityGrid(processes, blockedLocks) {
      const alertBox = document.getElementById("activityLocksAlert");
      if (alertBox) {
        if (blockedLocks && blockedLocks.length > 0) {
          let alertHtml = '<div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 12px 16px; margin-bottom: 12px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">' +
            '<div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #fca5a5;">' +
            '<span>⚠️ Active Lock Contention Detected</span>' +
            '<span class="brand-badge" style="background: rgba(239, 68, 68, 0.3); color: #f87171;">' + blockedLocks.length + ' Blocked Statement(s)</span>' +
            '</div>' +
            '<button class="btn btn-sm btn-danger" onclick="terminateAllBlockingProcesses()">⚡ Terminate All Blocking PIDs</button>' +
            '</div>' +
            '<table class="data-grid" style="margin-top: 6px;">' +
            '<thead><tr><th>Blocked PID</th><th>Blocked Query</th><th>Blocking PID</th><th>Blocking Query</th><th>Lock Type</th><th>Relation</th><th>Action</th></tr></thead>' +
            '<tbody>';
          blockedLocks.forEach(bl => {
            alertHtml += '<tr>' +
              '<td style="font-family: var(--font-mono); color: var(--rose); font-weight: 700;">' + bl.blocked_pid + '</td>' +
              '<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono);">' + escapeHtml(bl.blocked_query || '-') + '</td>' +
              '<td style="font-family: var(--font-mono); color: var(--amber); font-weight: 700;">' + bl.blocking_pid + '</td>' +
              '<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono);">' + escapeHtml(bl.blocking_query || '-') + '</td>' +
              '<td><span class="brand-badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">' + escapeHtml(bl.lock_type || 'relation') + '</span></td>' +
              '<td>' + escapeHtml(bl.relation || '-') + '</td>' +
              '<td><button class="btn btn-sm btn-danger" onclick="terminateProcess(' + bl.blocking_pid + ')">⚡ Kill ' + bl.blocking_pid + '</button></td>' +
              '</tr>';
          });
          alertHtml += '</tbody></table></div>';
          alertBox.innerHTML = alertHtml;
        } else {
          alertBox.innerHTML = '<div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 6px 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--emerald);">' +
            '<span>🟢</span><span>No active lock contention detected. All database queries and transactions are executing without blocking.</span>' +
            '</div>';
        }
      }

      const tbody = document.getElementById("activityBody");
      document.getElementById("activityCountBadge").innerText = processes.length + " active";

      if (!processes.length) {
        tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--text-dim); padding: 20px;'>No active processes</td></tr>";
        return;
      }

      tbody.innerHTML = processes.map(p => {
        const stateClass = p.state === "active" ? "state-active" : (p.state.includes("txn") ? "state-idle-txn" : "state-idle");
        return '<tr>' +
          '<td style="font-family: var(--font-mono); color: var(--cyan);">' + p.pid + '</td>' +
          '<td>' + (p.usename || 'postgres') + '</td>' +
          '<td>' + (p.datname || '-') + '</td>' +
          '<td>' + (p.client_addr || 'local') + '</td>' +
          '<td><span class="state-badge ' + stateClass + '">' + (p.state || 'active') + '</span></td>' +
          '<td style="font-family: var(--font-mono); color: var(--amber);">' + (p.duration || '0s') + '</td>' +
          '<td style="font-family: var(--font-mono); max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + escapeHtml(p.query || '-') + '</td>' +
          '<td style="text-align: center; display: flex; gap: 4px; justify-content: center;">' +
          '<button class="btn btn-sm" onclick="cancelProcess(' + p.pid + ')" title="Cancel Query (pg_cancel_backend)">🛑 Cancel</button>' +
          '<button class="btn btn-sm" onclick="terminateProcess(' + p.pid + ')" title="Terminate Connection (pg_terminate_backend)" style="color: var(--rose);">⚡ Kill</button>' +
          '</td></tr>';
      }).join('');
    }

    async function terminateAllBlockingProcesses() {
      const res = await apiRequest("/api/activity/locks");
      if (res && res.success && Array.isArray(res.blockedLocks) && res.blockedLocks.length > 0) {
        const pids = [...new Set(res.blockedLocks.map(bl => bl.blocking_pid))];
        showToast("Terminating " + pids.length + " blocking process(es)...");
        for (const pid of pids) {
          await apiRequest("/api/activity/terminate", "POST", { pid });
        }
        showToast("✓ All blocking processes terminated!");
        loadActivity();
      } else {
        showToast("No blocking processes to terminate.");
      }
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
      showToast("🌱 Seeding rich PostgreSQL dataset (UUIDs, JSONB, Arrays, Views)...");
      try {
        const schema = (currentSchema && currentSchema.activeSchema) || "public";
        const res = await apiRequest("/api/seed-sample", "POST", { schema });
        if (res && res.success) {
          showToast("✓ PostgreSQL sample database seeded successfully!");
          await loadSchema();
          await loadKpis();
          setTimeout(() => {
            selectEntity("customers", "table");
          }, 200);
        } else {
          showToast("Seed error: " + ((res && res.error) || "Failed to seed sample database"));
        }
      } catch (err) {
        showToast("Seed error: " + err.message);
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
    function openConnectionModal(initialTab) {
      loadConnectionConfig();
      if (initialTab) {
        switchModalTab(initialTab);
      }
      document.getElementById("connModal").classList.add("active");
    }

    function closeConnectionModal() {
      document.getElementById("connModal").classList.remove("active");
    }

    window.openConnectionModal = openConnectionModal;
    window.openDatabaseDialog = openConnectionModal;
    window.openDatabaseBrowser = function() {
      openConnectionModal("databases");
    };
    window.closeDatabaseDialog = closeConnectionModal;

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
        const u = new URL(val.replace(/^postgres(ql)?:[/][/]/, "http://"));
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
        if (typeof loadMacrosFromServer === "function") loadMacrosFromServer();
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
        if (typeof loadMacrosFromServer === "function") loadMacrosFromServer();
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
        if (typeof loadMacrosFromServer === "function") loadMacrosFromServer();
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

    ${POSTGRES_DESIGNER_SCRIPT}

    // Sequences Manager
    let allSequences = [];
    async function loadSequences() {
      const tbody = document.getElementById("sequencesBody");
      if (tbody) tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--text-dim); padding: 20px;'>Fetching sequences from pg_sequences...</td></tr>";
      const schemaName = currentSchema?.name || "public";
      const res = await apiRequest("/api/sequences?schema=" + encodeURIComponent(schemaName));
      if (res.success) {
        allSequences = res.sequences || [];
        renderSequencesTable(allSequences);
      } else {
        showToast("Error loading sequences: " + res.error);
        if (tbody) tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--rose); padding: 20px;'>Error: " + escapeHtml(res.error) + "</td></tr>";
      }
    }

    function renderSequencesTable(list) {
      const tbody = document.getElementById("sequencesBody");
      if (!tbody) return;
      if (!list || list.length === 0) {
        tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--text-dim); padding: 24px;'>No sequences found in schema " + escapeHtml(currentSchema?.name || "public") + "</td></tr>";
        return;
      }
      tbody.innerHTML = list.map(s => \`
        <tr>
          <td><strong style="color: var(--cyan);">\${escapeHtml(s.name)}</strong></td>
          <td style="color: var(--text-muted);">\${escapeHtml(s.schema)}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: #a5f3fc;">\${escapeHtml(String(s.last_value ?? "—"))}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--text-dim);">\${escapeHtml(String(s.min_value ?? 1))}</td>
          <td style="text-align: right; font-family: var(--font-mono); color: var(--text-dim);">\${escapeHtml(String(s.max_value ?? "—"))}</td>
          <td style="text-align: right; font-family: var(--font-mono);">\${escapeHtml(String(s.increment_by ?? 1))}</td>
          <td style="text-align: center;">\${s.cycle ? '<span style="color: var(--emerald);">✓</span>' : '<span style="color: var(--text-dim);">✕</span>'}</td>
          <td style="text-align: center;">
            <button class="btn btn-sm" onclick="restartSequenceModal('\${escapeHtml(s.name)}', \${s.last_value || 1})" style="padding: 1px 7px; font-size: 10px;">🔄 Restart</button>
          </td>
        </tr>
      \`).join('');
    }

    function filterSequences(q) {
      const term = (q || "").toLowerCase();
      const filtered = allSequences.filter(s => s.name.toLowerCase().includes(term) || s.schema.toLowerCase().includes(term));
      renderSequencesTable(filtered);
    }

    async function restartSequenceModal(name, currentVal) {
      const newVal = prompt("Restart sequence \\"" + name + "\\" at value:", "1");
      if (newVal === null) return;
      const num = parseInt(newVal, 10);
      if (isNaN(num)) {
        showToast("Invalid sequence number.");
        return;
      }
      showToast("Restarting sequence " + name + " at " + num + "...");
      const res = await apiRequest("/api/sequences/restart", "POST", {
        name,
        restartVal: num,
        schema: currentSchema?.name || "public"
      });
      if (res.success) {
        showToast("✓ Sequence \\"" + name + "\\" restarted at " + num);
        loadSequences();
      } else {
        showToast("Failed to restart sequence: " + res.error);
      }
    }

    // Roles & Privileges
    let allRoles = [];
    async function loadRoles() {
      const tbody = document.getElementById("rolesBody");
      if (tbody) tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--text-dim); padding: 20px;'>Querying pg_roles...</td></tr>";
      const res = await apiRequest("/api/roles");
      if (res.success) {
        allRoles = res.roles || [];
        renderRolesTable(allRoles);
      } else {
        showToast("Error loading roles: " + res.error);
        if (tbody) tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--rose); padding: 20px;'>Error: " + escapeHtml(res.error) + "</td></tr>";
      }
    }

    function renderRolesTable(list) {
      const tbody = document.getElementById("rolesBody");
      if (!tbody) return;
      if (!list || list.length === 0) {
        tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--text-dim); padding: 24px;'>No roles found.</td></tr>";
        return;
      }
      tbody.innerHTML = list.map(r => \`
        <tr>
          <td><strong style="color: \${r.is_superuser ? 'var(--rose)' : 'var(--emerald)'};">\${escapeHtml(r.name)}</strong></td>
          <td style="text-align: center;">\${r.is_superuser ? '<span class="crud-badge" style="border-color: var(--rose); color: var(--rose); background: rgba(244,63,94,0.15);">Superuser</span>' : '<span style="color: var(--text-dim);">—</span>'}</td>
          <td style="text-align: center;">\${r.can_login ? '<span style="color: var(--emerald); font-weight: 700;">✓ Yes</span>' : '<span style="color: var(--text-dim);">No</span>'}</td>
          <td style="text-align: center;">\${r.create_db ? '<span style="color: var(--cyan); font-weight: 600;">✓</span>' : '<span style="color: var(--text-dim);">—</span>'}</td>
          <td style="text-align: center;">\${r.create_role ? '<span style="color: var(--cyan); font-weight: 600;">✓</span>' : '<span style="color: var(--text-dim);">—</span>'}</td>
          <td style="text-align: center;">\${r.replication ? '<span style="color: var(--amber); font-weight: 600;">✓</span>' : '<span style="color: var(--text-dim);">—</span>'}</td>
          <td style="text-align: right; font-family: var(--font-mono);">\${r.connection_limit === -1 ? 'Unlimited' : r.connection_limit}</td>
          <td style="color: var(--text-dim); font-size: 11px;">\${escapeHtml(r.valid_until || 'Infinity')}</td>
        </tr>
      \`).join('');
    }

    function filterRoles(q) {
      const term = (q || "").toLowerCase();
      const filtered = allRoles.filter(r => r.name.toLowerCase().includes(term));
      renderRolesTable(filtered);
    }

    // Triggers & Functions
    let currentTriggersSubTab = "triggers";
    async function loadTriggersAndFunctions() {
      const schemaName = currentSchema?.name || "public";
      const trigRes = await apiRequest("/api/triggers?schema=" + encodeURIComponent(schemaName));
      const funcRes = await apiRequest("/api/functions?schema=" + encodeURIComponent(schemaName));

      const tBody = document.getElementById("triggersBody");
      const fBody = document.getElementById("functionsBody");

      if (trigRes.success && tBody) {
        const trigs = trigRes.triggers || [];
        if (trigs.length === 0) {
          tBody.innerHTML = "<tr><td colspan='6' style='text-align: center; color: var(--text-dim); padding: 24px;'>No triggers configured on tables in this schema.</td></tr>";
        } else {
          tBody.innerHTML = trigs.map(t => \`
            <tr>
              <td><strong style="color: var(--amber);">\${escapeHtml(t.name)}</strong></td>
              <td><span style="color: var(--cyan);">\${escapeHtml(t.table_name)}</span></td>
              <td><span class="crud-badge">\${escapeHtml(t.event)}</span></td>
              <td><span style="font-weight: 600; color: var(--text-muted);">\${escapeHtml(t.timing)}</span></td>
              <td style="color: var(--text-dim); font-size: 11px;">\${escapeHtml(t.orientation)}</td>
              <td style="font-family: var(--font-mono); font-size: 11px; color: #a5f3fc; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="\${escapeHtml(t.action)}">\${escapeHtml(t.action)}</td>
            </tr>
          \`).join('');
        }
      }

      if (funcRes.success && fBody) {
        const funcs = funcRes.functions || [];
        if (funcs.length === 0) {
          fBody.innerHTML = "<tr><td colspan='6' style='text-align: center; color: var(--text-dim); padding: 24px;'>No user functions found in this schema.</td></tr>";
        } else {
          fBody.innerHTML = funcs.map(f => \`
            <tr>
              <td><strong style="color: var(--indigo); font-family: var(--font-mono);">\${escapeHtml(f.name)}()</strong></td>
              <td style="color: var(--text-muted);">\${escapeHtml(f.schema)}</td>
              <td><span style="color: var(--emerald); font-weight: 600;">\${escapeHtml(f.return_type || 'void')}</span></td>
              <td style="font-size: 11px; color: var(--text-dim);">\${escapeHtml(f.type)}</td>
              <td><span class="crud-badge" style="border-color: var(--sapphire); color: var(--cyan);">\${escapeHtml(f.language)}</span></td>
              <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">\${escapeHtml(f.argument_types || 'none')}</td>
            </tr>
          \`).join('');
        }
      }
    }

    function setTriggersSubTab(sub) {
      currentTriggersSubTab = sub;
      document.getElementById("btnToggleTriggers")?.classList.toggle("btn-primary", sub === "triggers");
      document.getElementById("btnToggleFunctions")?.classList.toggle("btn-primary", sub === "functions");
      document.getElementById("triggersGrid").style.display = sub === "triggers" ? "table" : "none";
      document.getElementById("functionsGrid").style.display = sub === "functions" ? "table" : "none";
    }

    // Performance & Bloat Telemetry
    async function loadTelemetry() {
      const schemaName = currentSchema?.name || "public";
      const [telemetryRes, statsRes] = await Promise.all([
        apiRequest("/api/telemetry"),
        apiRequest("/api/table/stats?schema=" + encodeURIComponent(schemaName))
      ]);

      if (telemetryRes.success && telemetryRes.telemetry) {
        const m = telemetryRes.telemetry;
        const hitRatioEl = document.getElementById("kpiHitRatio");
        const hitRatio = Number(m.cacheHitRatio || 0);
        if (hitRatioEl) {
          hitRatioEl.innerText = hitRatio.toFixed(2) + "%";
          hitRatioEl.style.color = hitRatio >= 95 ? "var(--emerald)" : (hitRatio >= 85 ? "var(--amber)" : "var(--rose)");
        }
        document.getElementById("kpiHitRatioSub").innerText = (m.bufferBlocksHit || 0).toLocaleString() + " RAM hits / " + (m.bufferBlocksRead || 0).toLocaleString() + " disk reads";
        document.getElementById("kpiDbSize").innerText = m.databaseSizeBytesPretty || "--";
        document.getElementById("kpiActiveLocks").innerText = String(m.activeLocksCount || 0);
        document.getElementById("kpiGrantedLocks").innerText = (m.grantedLocksCount || 0) + " granted, " + (m.waitingLocksCount || 0) + " waiting";

        const totalTx = (m.xactCommit || 0) + (m.xactRollback || 0);
        const commitPct = totalTx > 0 ? (((m.xactCommit || 0) / totalTx) * 100).toFixed(1) : "100.0";
        document.getElementById("kpiTxSummary").innerText = (m.xactCommit || 0).toLocaleString() + " / " + (m.xactRollback || 0).toLocaleString();
        document.getElementById("kpiTxSub").innerText = "Commit Success Rate: " + commitPct + "%";

        document.getElementById("kpiTotalDeadTuples").innerText = (m.deadTuplesTotal || 0).toLocaleString();
        document.getElementById("kpiTotalLiveTuples").innerText = (m.liveTuplesTotal || 0).toLocaleString() + " live tuples";

        const badge = document.getElementById("telemetryStatusBadge");
        if (badge) {
          if (hitRatio >= 95 && (m.deadTuplesTotal || 0) < 5000) {
            badge.innerText = "Optimal";
            badge.style.borderColor = "var(--emerald)";
            badge.style.color = "var(--emerald)";
          } else {
            badge.innerText = "Needs Maintenance";
            badge.style.borderColor = "var(--amber)";
            badge.style.color = "var(--amber)";
          }
        }
      }

      if (statsRes.success && statsRes.stats) {
        renderTableStats(statsRes.stats);
      }
    }

    function renderTableStats(stats) {
      const tbody = document.getElementById("tableStatsBody");
      if (!tbody) return;
      if (!stats || stats.length === 0) {
        tbody.innerHTML = "<tr><td colspan='9' style='text-align: center; color: var(--text-dim); padding: 24px;'>No table statistics available.</td></tr>";
        return;
      }
      tbody.innerHTML = stats.map(s => {
        const live = s.n_live_tup || 0;
        const dead = s.n_dead_tup || 0;
        const total = live + dead;
        const bloatPct = total > 0 ? ((dead / total) * 100).toFixed(1) : "0.0";
        const bloatColor = Number(bloatPct) > 20 ? "var(--rose)" : (Number(bloatPct) > 10 ? "var(--amber)" : "var(--emerald)");

        return \`
          <tr>
            <td><strong style="color: var(--cyan);">\${escapeHtml(s.table_name)}</strong></td>
            <td style="color: var(--text-muted);">\${escapeHtml(s.schema)}</td>
            <td style="text-align: right; font-family: var(--font-mono);">\${live.toLocaleString()}</td>
            <td style="text-align: right; font-family: var(--font-mono); color: \${dead > 0 ? 'var(--rose)' : 'var(--text-dim)'};">\${dead.toLocaleString()}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: \${bloatColor};">\${bloatPct}%</td>
            <td style="font-size: 11px; color: var(--text-dim);">\${escapeHtml(s.last_vacuum ? new Date(s.last_vacuum).toLocaleString() : 'Never')}</td>
            <td style="font-size: 11px; color: var(--text-dim);">\${escapeHtml(s.last_autovacuum ? new Date(s.last_autovacuum).toLocaleString() : 'Never')}</td>
            <td style="font-size: 11px; color: var(--text-dim);">\${escapeHtml(s.last_analyze ? new Date(s.last_analyze).toLocaleString() : 'Never')}</td>
            <td style="text-align: center;">
              <button class="btn btn-sm" onclick="runTableVacuum('\${escapeHtml(s.table_name)}', '\${escapeHtml(s.schema)}')" style="padding: 1px 7px; font-size: 10px;">🧹 VACUUM</button>
            </td>
          </tr>
        \`;
      }).join('');
    }

    async function runTableVacuum(tableName, schema) {
      showToast("Running VACUUM ANALYZE on \\"" + tableName + "\\\"...");
      const res = await apiRequest("/api/vacuum", "POST", { table: tableName, schema });
      if (res.success) {
        showToast("✓ VACUUM completed on \\"" + tableName + "\\"");
        loadTelemetry();
      } else {
        showToast("VACUUM failed: " + res.error);
      }
    }

    async function runGlobalVacuumAnalyze() {
      showToast("Running global database VACUUM ANALYZE...");
      const res = await apiRequest("/api/vacuum", "POST", { full: false, analyze: true });
      if (res.success) {
        showToast("✓ Global VACUUM ANALYZE completed");
        loadTelemetry();
      } else {
        showToast("Global VACUUM failed: " + res.error);
      }
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
        // credentials in a connection URL are never stored in the browser
        url: String(document.getElementById("cfgUrl").value || "").replace(new RegExp("//[^@/]*@"), "//"),
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
    async function initPostgresStudio() {
      try {
        const savedTheme = localStorage.getItem('postgres_studio_theme') || 'midnight';
        applyPostgresStudioTheme(savedTheme);
      } catch(e) {}
      initPresets();
      initSidebarResizer();

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetTab = urlParams.get("tab");
        if (targetTab) {
          switchTab(targetTab);
        }
        const targetPreset = urlParams.get("preset");
        if (targetPreset && typeof applyDesignerPreset === "function") {
          applyDesignerPreset(targetPreset);
        }
        const targetModal = urlParams.get("modal");
        if (targetModal) {
          if (targetModal === "report" && typeof openAccessReportModal === "function") {
            openAccessReportModal();
          } else if (targetModal === "dump" && typeof openDatabaseDumpModal === "function") {
            openDatabaseDumpModal();
          } else if (targetModal === "create_enum" && typeof openCreateEnumModal === "function") {
            openCreateEnumModal();
          } else if (typeof openJoinPropertiesModal === "function") {
            openJoinPropertiesModal(targetModal === "new" ? null : targetModal);
          }
        }
        if (urlParams.get("totals") === "1" && typeof toggleGridTotalsRow === "function") {
          toggleGridTotalsRow();
        }
        if (urlParams.get("filter_bar") === "1" && typeof toggleGridFilterBar === "function") {
          toggleGridFilterBar();
        }
        const targetZoom = urlParams.get("zoom");
        if (targetZoom && typeof setDesignerCanvasZoom === "function") {
          setDesignerCanvasZoom(parseFloat(targetZoom));
        }
        const targetRoom = urlParams.get("room");
        if (targetRoom && typeof setDesignerRoomMode === "function") {
          setDesignerRoomMode(targetRoom);
        }
        const minEditor = urlParams.get("min_editor");
        if (minEditor && typeof toggleEditorCollapse === "function") {
          toggleEditorCollapse();
        }
        const hideSidebar = urlParams.get("sidebar");
        if (hideSidebar === "0" && typeof toggleSidebarCollapse === "function") {
          toggleSidebarCollapse();
        }
      } catch (e) {}

      await loadSchema();
      await loadKpis();
      if (typeof loadMacrosFromServer === "function") await loadMacrosFromServer();
    }
    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", initPostgresStudio);
    } else {
      initPostgresStudio();
    }
  </script>
  <script>
    ${CRUD_SCRIPT}
  </script>
  <script>
    ${buildMacroScript("postgres")}
  </script>
<a id="openWorkbench" href="/workbench" target="_blank" rel="noopener" title="Open the shared Database Workbench: saved connections, safe row editing, read-only and production safeguards" style="position:fixed;right:12px;bottom:12px;z-index:9999;padding:6px 12px;border-radius:999px;background:#0369a1;color:#fff;font:600 12px system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.4)">🧰 Workbench</a>
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
  const port = parseInt(process.env.PG_STUDIO_PORT || process.env.PORT || "54321", 10);
  const srv = startPostgresStudioServer({
    port,
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
