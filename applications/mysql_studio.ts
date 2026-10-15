/**
 * ⚡ Bun RAD Studio - MySQL Studio Pro
 * 
 * Enterprise-Grade Embedded Database Workstation & Query IDE
 * Powered by 100% native `bun:mysql` with sub-millisecond execution latency.
 * 
 * Architecture:
 * - Dedicated Background Worker & HTTP Telemetry Server (`mysql_studio_server.ts`)
 * - Native WebKit / Webview Desktop GUI with zero FFI deadlock and instant UI updates
 * - Also accessible in any browser via local workstation URL
 */

import { injectHelp } from "../src/shared/helpTips";
import { Webview, SizeHint } from "webview-bun";

import { resolve, join } from "path";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { dlopen, FFIType } from "bun:ffi";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  toggleFullscreenNative,
  setFullscreenNative,
  attachWindowShortcuts,
  getWindowShortcutsScript,
} from "../index.ts";
import { startMysqlStudioServer, type MysqlConnectionConfig, type MysqlConnectionConfigSanitized } from "./mysql_studio_server.ts";
import { CRUD_STYLE, CRUD_SCRIPT } from "./mysql_studio_crud.ts";
import { watchParentProcess } from "../src/parentWatch";
import { MACRO_STYLE, MACRO_TAB_BTN, MACRO_HTML, buildMacroScript } from "./sqlite_studio_macros.ts";

const MACRO_SCRIPT = buildMacroScript("mysql");

export interface MysqlStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  initialDbPath?: string;
  port?: number;
  // Manual connection configuration options
  host?: string;
  mysqlPort?: number;
  user?: string;
  password?: string;
  database?: string;
  tls?: boolean;
  url?: string;
  config?: Partial<MysqlConnectionConfig>;
}
export type SystemStudioOptions = MysqlStudioOptions;
export type { MysqlConnectionConfig, MysqlConnectionConfigSanitized };

export interface MysqlStudioInstance {
  title: string;
  width: number;
  height: number;
  fullscreen: boolean;
  activeDbPath: string;
  webview?: Webview;
  server?: any;
  worker?: Worker;
  port?: number;
  url?: string;
  run: () => Promise<void> | void;
  generateHtml: () => string;
}

// -------------------------------------------------------------------------------------------------
// SQL Presets Registry
// -------------------------------------------------------------------------------------------------

export const SQL_PRESETS = [
  {
    name: "1. 4-Table Join View: Extended Order Details",
    sql: "SELECT * FROM v_order_details_extended ORDER BY line_total DESC LIMIT 50;",
  },
  {
    name: "2. 3-Table Join View: Customer Lifetime Orders & Spend",
    sql: "SELECT * FROM v_customer_order_summary ORDER BY total_spend DESC;",
  },
  {
    name: "3. 3-Table Join View: Product Sales & Stock Performance",
    sql: "SELECT * FROM v_product_sales_performance ORDER BY gross_revenue DESC;",
  },
  {
    name: "4. 3-Table Join View: Pending Shipments Pipeline",
    sql: "SELECT * FROM v_pending_shipments ORDER BY order_id ASC;",
  },
  {
    name: "5. 2-Table Join View: VIP Segment Completed Orders",
    sql: "SELECT * FROM v_vip_customer_analytics ORDER BY total_vip_revenue DESC;",
  },
  {
    name: "6. All Customers (Tier & Lifetime Spend)",
    sql: "SELECT * FROM v_customer_orders ORDER BY lifetime_spend DESC;",
  },
  {
    name: "7. Sales by Category Breakdown",
    sql: "SELECT * FROM v_sales_by_category ORDER BY gross_revenue DESC;",
  },
  {
    name: "8. High-Value Orders (> $1,000)",
    sql: "SELECT o.order_number, c.name AS customer, o.total_amount, o.status, o.payment_method\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nWHERE o.total_amount > 1000\nORDER BY o.total_amount DESC;",
  },
  {
    name: "9. Products Low Stock Alert (< 50 units)",
    sql: "SELECT id, sku, name, category, price, stock, rating\nFROM products\nWHERE stock < 50\nORDER BY stock ASC;",
  },
  {
    name: "10. Database Schema Master Table",
    sql: "SELECT table_type, table_name, engine, table_rows, data_length\nFROM information_schema.tables\nWHERE table_schema = DATABASE()\nORDER BY table_type, table_name;",
  },
  {
    name: "11. Audit Log Trail (Recent Mutations)",
    sql: "SELECT id, action, entity, details, timestamp\nFROM audit_logs\nORDER BY id DESC\nLIMIT 25;",
  },
];

// -------------------------------------------------------------------------------------------------
// Complete Enterprise Workstation HTML Shell Generator
// -------------------------------------------------------------------------------------------------

export function generateMysqlStudioHtml(): string {
  return injectHelp(buildMysqlHtml(), "mysql_studio");
}

function buildMysqlHtml(): string {
  const presetsJson = JSON.stringify(SQL_PRESETS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MySQL Studio Pro - Enterprise Database Workstation</title>
  <style>
    :root {
      --bg-base: #070a12;
      --bg-surface: #0e1526;
      --bg-card: rgba(15, 23, 42, 0.85);
      --bg-glass: rgba(30, 41, 59, 0.6);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-focus: #38bdf8;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --cyan: #38bdf8;
      --cyan-glow: rgba(56, 189, 248, 0.25);
      --emerald: #10b981;
      --emerald-glow: rgba(16, 185, 129, 0.25);
      --purple: #c084fc;
      --amber: #fbbf24;
      --rose: #f43f5e;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    select, optgroup, option {
      color-scheme: dark;
    }
    select {
      appearance: none;
      -webkit-appearance: none;
      background-color: rgba(15, 23, 42, 0.9);
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
      background: rgba(15, 23, 42, 0.98);
      color: var(--text-main);
    }
    body {
      background-color: var(--bg-base);
      background-image: 
        radial-gradient(circle at 10% 10%, rgba(56, 189, 248, 0.06) 0%, transparent 40%),
        radial-gradient(circle at 90% 90%, rgba(16, 185, 129, 0.06) 0%, transparent 40%);
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
      background: rgba(8, 12, 20, 0.94);
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
      background: linear-gradient(135deg, #0284c7, #10b981);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 0 12px var(--cyan-glow);
    }

    .brand-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.3px;
      background: linear-gradient(135deg, #ffffff 40%, var(--cyan) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .brand-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid var(--cyan);
      color: var(--cyan);
      font-family: var(--font-mono);
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
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid var(--border-subtle);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-primary {
      background: linear-gradient(135deg, #0284c7, #0369a1);
      border-color: var(--cyan);
      color: #ffffff;
      box-shadow: 0 0 10px var(--cyan-glow);
    }

    .btn-primary:hover {
      background: linear-gradient(135deg, #38bdf8, #0284c7);
    }

    .btn-success {
      background: linear-gradient(135deg, #059669, #047857);
      border-color: var(--emerald);
      color: #ffffff;
      box-shadow: 0 0 10px var(--emerald-glow);
    }

    /* Top KPI Telemetry Banner */
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

    /* Workspace */
    .workspace {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      position: relative;
    }

    /* Left Sidebar */
    aside {
      width: 360px;
      min-width: 260px;
      max-width: 650px;
      background: rgba(10, 15, 28, 0.98);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
      position: relative;
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

    .sidebar-mini-btn {
      font-size: 10px;
      padding: 2px 7px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border-subtle);
      border-radius: 4px;
      color: var(--text-dim);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .sidebar-mini-btn:hover {
      background: rgba(56, 189, 248, 0.12);
      border-color: var(--cyan);
      color: var(--cyan);
    }

    /* Database Object Tree */
    .object-tree {
      flex: 1 1 0;
      min-height: 0;
      height: 0;
      overflow-y: auto;
      overflow-x: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      scrollbar-gutter: stable;
    }

    .tree-group {
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.04);
      flex-shrink: 0;
      min-width: 100%;
      box-sizing: border-box;
    }

    .tree-header {
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 30px;
    }

    .tree-header:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-main);
    }

    .tree-header-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }

    .tree-arrow {
      font-size: 8px;
      color: var(--text-dim);
      width: 12px;
      text-align: center;
      flex-shrink: 0;
    }

    .tree-badge {
      font-size: 9px;
      background: rgba(255, 255, 255, 0.08);
      padding: 1px 6px;
      border-radius: 10px;
      color: var(--text-dim);
      font-family: var(--font-mono);
      flex-shrink: 0;
    }

    .tree-items {
      display: flex;
      flex-direction: column;
      padding: 3px 6px;
      gap: 2px;
    }

    .tree-item {
      padding: 5px 8px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-muted);
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      transition: all 0.1s ease;
      min-width: 0;
      white-space: nowrap;
    }

    .tree-item:hover {
      background: rgba(56, 189, 248, 0.08);
      color: var(--cyan);
    }

    .tree-item.active {
      background: rgba(56, 189, 248, 0.15);
      border-left: 3px solid var(--cyan);
      color: var(--cyan);
      font-weight: 700;
    }

    .tree-item-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }

    /* Main Area */
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-base);
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

    /* Tabs */
    .view-tabs {
      height: 38px;
      background: rgba(14, 21, 38, 0.95);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 4px;
      flex-shrink: 0;
    }

    .editor-banner.collapsed .sql-input-box {
      display: none;
    }

    .tab-btn {
      position: relative;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.12s ease;
    }

    .tab-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
    }

    .tab-btn.active {
      background: rgba(56, 189, 248, 0.15);
      color: var(--cyan);
      font-weight: 700;
      box-shadow: inset 0 -2px 0 var(--cyan);
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

    .qbe-saved-chip .sidebar-mini-btn {
      border: none;
      padding: 4px 6px;
      background: rgba(244, 63, 94, 0.12);
      color: var(--rose);
      cursor: pointer;
      font-size: 10px;
      line-height: 1;
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


    /* Tab Content Area */
    .tab-content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    .tab-pane {
      display: none;
      flex: 1;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
    }

    .tab-pane.active {
      display: flex;
    }

    /* Data Grid */
    .grid-toolbar {
      padding: 6px 16px;
      background: rgba(10, 15, 28, 0.6);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }

    .grid-pagination {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--text-muted);
    }

    .grid-table-container {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }

    table.data-grid {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      font-family: var(--font-mono);
    }

    table.data-grid th {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: var(--cyan);
      font-weight: 700;
      text-align: left;
      padding: 6px 12px;
      border-bottom: 2px solid var(--border-subtle);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      z-index: 10;
    }

    table.data-grid th:hover {
      background: #1e293b;
    }

    table.data-grid td {
      padding: 5px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      white-space: nowrap;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    table.data-grid tr:hover td {
      background: rgba(56, 189, 248, 0.06);
    }

    /* Schema Designer */
    .schema-layout {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .card-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--cyan);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* JSON Inspector & Console */
    .code-box {
      flex: 1;
      min-height: 0;
      background: #050811;
      padding: 14px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: #e2e8f0;
      overflow: auto;
      white-space: pre-wrap;
      line-height: 1.4;
    }

    /* Scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.15);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.18);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(56, 189, 248, 0.5);
    }

    /* Footer */
    footer {
      height: 28px;
      background: #060913;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      font-size: 10px;
      color: var(--text-dim);
      flex-shrink: 0;
    }

    .toast {
      position: fixed;
      bottom: 40px;
      right: 20px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid var(--cyan);
      color: var(--text-main);
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.2s ease;
      z-index: 9999;
    }
    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }

    /* Modal Dialog & File Chooser */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(3, 7, 18, 0.84);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 20px;
    }
    .modal-overlay.open {
      display: flex;
    }
    .modal-card {
      width: 100%;
      max-width: 680px;
      max-height: 88vh;
      background: #0d1527;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 35px rgba(56, 189, 248, 0.15);
      overflow: hidden;
      animation: modalPop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes modalPop {
      0% { opacity: 0; transform: scale(0.96) translateY(8px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    .modal-header {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.02);
    }
    .modal-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .modal-close {
      background: transparent;
      border: none;
      color: var(--text-dim);
      font-size: 18px;
      cursor: pointer;
      padding: 4px;
      line-height: 1;
      border-radius: 4px;
    }
    .modal-close:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.08);
    }
    .modal-body {
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .kpi-clickable {
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .kpi-clickable:hover {
      border-color: var(--cyan);
      background: rgba(56, 189, 248, 0.08);
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
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
    .dropzone {
      border: 2px dashed rgba(56, 189, 248, 0.4);
      border-radius: 8px;
      padding: 20px 16px;
      text-align: center;
      cursor: pointer;
      background: rgba(56, 189, 248, 0.03);
      transition: all 0.15s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .dropzone:hover, .dropzone.dragover {
      border-color: var(--cyan);
      background: rgba(56, 189, 248, 0.1);
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.15);
    }
    .db-choice-card {
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.02);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .db-choice-header {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .db-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.04);
      transition: all 0.12s ease;
    }
    .db-item-row:hover {
      background: rgba(56, 189, 248, 0.08);
      border-color: rgba(56, 189, 248, 0.3);
    }
    #ddStudioTheme {
      min-width: 170px;
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      padding-right: 26px;
      color-scheme: dark;
      cursor: pointer;
      border: none;
      box-shadow: none;
      outline: none;
      font-weight: 700;
    }
    #ddStudioTheme:hover,
    #ddStudioTheme:focus {
      outline: none;
      color: var(--text-main);
    }
    /* Microsoft Access Totals Row */
    .access-totals-foot {
      position: sticky;
      bottom: 0;
      background: rgba(15, 23, 42, 0.98);
      backdrop-filter: blur(10px);
      border-top: 2px solid var(--cyan);
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
      border-color: var(--cyan);
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

    /* Custom Enum Cards */
    .enum-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: all 0.15s ease;
    }
    .enum-card:hover {
      border-color: var(--cyan);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .enum-badge {
      display: inline-block;
      padding: 2px 7px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.3);
      color: var(--cyan);
      border-radius: 4px;
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 600;
    }

    /* Live Activity Monitor */
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

    /* QBE Cardinality Badges */
    .qbe-cardinality-badge {
      user-select: none;
      pointer-events: none;
    }
${CRUD_STYLE}
${MACRO_STYLE}
  </style>
</head>
<body spellcheck="false" autocapitalize="none" autocorrect="off" oncontextmenu="return false;">
  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-logo">🗄️</div>
      <span class="brand-title">MySQL Studio Pro</span>
      <span class="brand-badge">bun:mysql</span>
    </div>

    <div class="header-actions">
      <div class="theme-control">
        <span class="theme-control-label">Theme</span>
        <select id="ddStudioTheme" class="btn" onchange="applyMysqlStudioTheme(this.value)" title="Switch Workstation Theme" style="padding: 5px 20px 5px 4px; font-weight: 700; cursor: pointer; color: var(--text-main); border: none; background: transparent; outline: none;">
        <optgroup label="Modern Studio">
          <option value="midnight">🎨 Midnight</option>
          <option value="codefreelance">🎨 CodeFreelance</option>
          <option value="sonoma_emerald">🎨 Emerald</option>
          <option value="dracula">🎨 Dracula</option>
          <option value="nord">🎨 Nord</option>
          <option value="cyberpunk">🎨 Cyberpunk</option>
          <option value="apple_dark">🎨 Dark</option>
          <option value="apple_light">🎨 Light</option>
          <option value="solarized_dark">🎨 Solar Dark</option>
          <option value="github_dark">🎨 GitHub Dark</option>
        </optgroup>
        <optgroup label="Retro & Nostalgia">
          <option value="win95">💾 Win95</option>
          <option value="gameboy">👾 Game Boy</option>
          <option value="c64">🕹️ C64</option>
          <option value="synthwave">🌆 Synthwave</option>
          <option value="matrix">💻 Matrix</option>
          <option value="amber_crt">📟 Amber CRT</option>
          <option value="amiga">🎮 Amiga</option>
          <option value="mac_classic">🖥️ System 7</option>
          <option value="mac_os_aqua">💧 OS X Aqua</option>
          <option value="nextstep">⬛ NeXTSTEP</option>
          <option value="playstation">🎮 PlayStation</option>
          <option value="hotdog_stand">🌭 Hot Dog</option>
        </optgroup>
      </select>
      <button class="btn btn-primary" onclick="openDatabaseDialog('config')" title="Configure MySQL server connection, host, user, password, and database manually">🔌 Connection Config...</button>
      <button class="btn" onclick="openDatabaseDialog('databases')" title="Browse discovered databases on MySQL server">📂 Databases...</button>
      <button class="btn" id="btnDbBackupDump" onclick="openDatabaseDumpModal()" title="1-Click MySQL Database Backup & SQL Dump Generator">💾 DB Backup / Dump</button>
      <button class="btn" onclick="runEditorQuery()">⚡ Run Query</button>
      <button class="btn" onclick="seedDatabase()">🌱 Seed Sample DB</button>
      <button class="btn" onclick="optimizeMysqlTables()">🧹 Optimize Tables</button>
      <button class="btn" onclick="checkMysqlTables()">🛡️ Check Tables</button>
      <button class="btn" id="btnFullscreen" onclick="window.doToggleFullscreen()" title="Toggle Fullscreen (F11 / ⌃⌘F)">⛶ Fullscreen</button>
    </div>
  </header>

  <!-- Top Real-Time KPI Cards -->
  <section class="kpi-row">
    <div class="kpi-card kpi-clickable" onclick="openDatabaseDialog('config')" title="Click to view or edit MySQL connection configuration">
      <div class="kpi-title">Active Database <span>🗂️</span></div>
      <div class="kpi-value" id="kpiDbName">my_app_dev</div>
      <div class="kpi-sub" id="kpiDbPath">localhost:3306/my_app_dev</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Storage & Engine <span>💾</span></div>
      <div class="kpi-value" id="kpiSize">0 B (RAM)</div>
      <div class="kpi-sub" id="kpiEngine">MySQL v3.45.0</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Schema Objects <span>📊</span></div>
      <div class="kpi-value" id="kpiTables">0 Tables</div>
      <div class="kpi-sub" id="kpiViewsIndices">0 Views • 0 Indices</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Total Records <span>📈</span></div>
      <div class="kpi-value" id="kpiRows">0 Rows</div>
      <div class="kpi-sub" id="kpiJournal">Mode: WAL</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Execution Latency <span>⚡</span></div>
      <div class="kpi-value" id="kpiLatency" style="color: var(--emerald);">0.00 ms</div>
      <div class="kpi-sub" id="kpiLatencySub">Native sub-ms execution</div>
    </div>
  </section>

  <!-- Workspace -->
  <div class="workspace">
    <!-- Left Navigation Sidebar -->
    <aside id="mainSidebar">
      <!-- Database Connection Status & Browse -->
      <div class="sidebar-db-card">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 10px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">Active Database</span>
          <span class="badge" id="sidebarDbBadge">RAM</span>
        </div>
        <div style="font-size: 12px; font-weight: 700; color: var(--cyan); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" id="sidebarDbName">my_app_dev</div>
        <div style="display: flex; gap: 4px;">
          <button class="sidebar-mini-btn" style="flex: 1; justify-content: center;" onclick="openDatabaseDialog('config')">🔌 Config...</button>
          <button class="sidebar-mini-btn" style="flex: 1; justify-content: center;" onclick="openDatabaseDialog('databases')">📂 Databases</button>
        </div>
      </div>

      <div class="sidebar-search-box">
        <input type="text" class="sidebar-search-input" id="searchObjects" placeholder="Search tables, views, indices..." oninput="filterObjects(this.value)">
        <div class="sidebar-subbar">
          <button class="sidebar-mini-btn" onclick="toggleAllGroups()">📁 Toggle All</button>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="sidebar-mini-btn" onclick="adjustSidebarWidth(-30)" title="Shrink sidebar">◀</button>
            <button class="sidebar-mini-btn" onclick="toggleSidebarWidth()" title="Toggle standard/wide">↔ Width</button>
            <button class="sidebar-mini-btn" onclick="adjustSidebarWidth(30)" title="Expand sidebar">▶</button>
          </div>
        </div>
      </div>

      <div class="object-tree" id="objectTreeContainer">
        <!-- Rendered dynamically -->
      </div>
    </aside>

    <!-- Draggable Sidebar Resizer Handle -->
    <div class="sidebar-resizer" id="sidebarResizer" title="Drag to resize sidebar width"></div>

    <!-- Main Workspace -->
    <main>
      <!-- SQL Query Banner -->
      <section class="editor-banner" id="editorBanner">
        <div class="editor-top">
          <div class="preset-selector-wrap">
            <span style="font-size: 11px; color: var(--text-dim); font-weight: 600;">SQL Snippet:</span>
            <select class="preset-select" id="presetSelect" onchange="applyPreset(this.value)">
              <option value="">-- Choose SQL Query Snippet --</option>
            </select>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="editor-timing" id="queryTiming">Ready to execute query</div>
            <button class="sidebar-mini-btn" id="btnToggleEditor" onclick="toggleEditorCollapse()" title="Toggle SQL Editor visibility" style="padding: 2px 8px; font-size: 10px;">▲ Minimize</button>
          </div>
        </div>

        <div class="sql-input-box">
          <textarea class="sql-textarea" id="sqlEditor" placeholder="Enter SQL statement (e.g. SELECT * FROM customers;)..." onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') runEditorQuery()">SELECT c.id, c.name, c.email, c.tier, c.balance FROM customers c ORDER BY c.id LIMIT 25;</textarea>
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

      <!-- View Tabs -->
      <div class="view-tabs">
        <div class="tab-btn active" id="tabBtnGrid" onclick="switchTab('grid')">📊 Tabular Data Grid</div>
        <div class="tab-btn" id="tabBtnDesigner" onclick="switchTab('designer')">📐 Visual Query Designer</div>
        ${MACRO_TAB_BTN}
        <div class="tab-btn" id="tabBtnSchema" onclick="switchTab('schema')">🏛️ Schema Designer &amp; DDL</div>
        <div class="tab-btn" id="tabBtnTypes" onclick="switchTab('types')">🏷️ Custom Types &amp; ENUMs</div>
        <div class="tab-btn" id="tabBtnPartitions" onclick="switchTab('partitions')">📦 Partition Trees</div>
        <div class="tab-btn" id="tabBtnActivity" onclick="switchTab('activity')">⚡ Live Activity &amp; Locks</div>
        <div class="tab-btn" id="tabBtnReplication" onclick="switchTab('replication')">📡 Replication &amp; Binlog</div>
        <div class="tab-btn" id="tabBtnExplain" onclick="switchTab('explain')">🔍 Query Plan Visualizer</div>
        <div class="tab-btn" id="tabBtnJson" onclick="switchTab('json')">💻 Raw JSON Inspector</div>
        <div class="tab-btn" id="tabBtnAudit" onclick="switchTab('audit')">⚡ Telemetry &amp; Audit Log</div>
        <div class="tab-btn" id="tabBtnPragma" onclick="switchTab('pragma')">⚙️ MySQL Maintenance</div>
      </div>

      <!-- Tab Content Area -->
      <div class="tab-content">
        <!-- 1. Visual Data Grid -->
        <div class="tab-pane active" id="tabGrid">
          <div class="grid-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--cyan);" id="gridTargetTitle">Active Result Set</span>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-sm" id="btnToggleTotals" onclick="toggleAccessTotalsRow()" title="Toggle Microsoft Access Totals Row (Sum, Avg, Count, Min, Max)">🧮 Totals</button>
                <button class="btn btn-sm" id="btnToggleFilterBar" onclick="toggleQuickFilterBar()" title="Toggle Access Column Filter Bar">⚡ Filter Bar</button>
                <button class="btn btn-sm" id="btnAccessReport" onclick="openAccessReportModal()" title="Generate Microsoft Access Printable Report / PDF">🖨️ Report</button>
              </div>
              <input type="text" id="gridSearchInput" placeholder="Filter rows..." style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 3px 8px; color: #fff; font-size: 11px; outline: none; width: 140px;" oninput="onGridSearch(this.value)">
            </div>
            <div class="grid-pagination">
              <span id="gridPageInfo">Page 1 of 1 (0 items)</span>
              <button class="sidebar-mini-btn" onclick="gridChangePage(-1)">◀ Prev</button>
              <button class="sidebar-mini-btn" onclick="gridChangePage(1)">Next ▶</button>
            </div>
          </div>
          <div class="grid-table-container" id="gridTableContainer">
            <table class="data-grid" id="mainDataGrid">
              <thead>
                <tr id="gridHeaderRow"><th>Status</th></tr>
                <tr id="gridFilterBarRow" class="access-filter-row" style="display: none;"><th>⚡</th></tr>
              </thead>
              <tbody id="gridBody"><tr><td>Ready. Select a table or run a query.</td></tr></tbody>
              <tfoot id="gridTotalsFoot" class="access-totals-foot" style="display: none;"></tfoot>
            </table>
          </div>
        </div>

        <!-- 2. Query Designer -->
        <div class="tab-pane" id="tabDesigner">
          <div class="designer-layout" id="designerContainer">
            <div class="designer-empty">Load a schema to begin building a visual query.</div>
          </div>
        </div>

        ${MACRO_HTML}

        <!-- 3. Schema & DDL Designer -->
        <div class="tab-pane" id="tabSchema">
          <div class="schema-layout" id="schemaContainer">
            <div class="card">
              <div class="card-title">Select a table from the sidebar to inspect its columns, keys, and DDL</div>
            </div>
          </div>
        </div>

        <!-- 4. Custom Types & ENUMs Explorer -->
        <div class="tab-pane" id="tabTypes">
          <div class="activity-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; color: var(--cyan);">MySQL Custom ENUM &amp; SET Column Types</span>
              <input type="text" id="enumSearchInput" placeholder="Filter enum columns..." oninput="filterEnumTypes(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px; width: 200px; outline: none;">
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm" onclick="loadEnumTypes()">🔄 Refresh</button>
              <button class="btn btn-sm btn-primary" onclick="openCreateEnumModal()">➕ Add ENUM Column</button>
            </div>
          </div>
          <div id="enumTypesGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; padding: 14px; overflow-y: auto;">
            <div class="card" style="padding: 24px; text-align: center; color: var(--text-dim); grid-column: 1 / -1;">
              Loading ENUM and SET types...
            </div>
          </div>
        </div>

        <!-- 5. Partition Trees Explorer -->
        <div class="tab-pane" id="tabPartitions">
          <div class="activity-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; color: var(--amber);">MySQL Declarative Partition Trees (information_schema.PARTITIONS)</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm" onclick="loadPartitions()">🔄 Refresh</button>
            </div>
          </div>
          <div id="partitionsContainer" style="padding: 14px; overflow-y: auto;">
            <div class="card" style="padding: 24px; text-align: center; color: var(--text-dim);">
              Loading partition trees...
            </div>
          </div>
        </div>

        <!-- 6. Live Activity & Lock Contention Monitor -->
        <div class="tab-pane" id="tabActivity">
          <div class="activity-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; color: var(--rose);">Live Process &amp; Lock Contention Monitor</span>
              <span class="brand-badge" id="activityCountBadge">0 active</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm" onclick="loadActivity()">🔄 Refresh</button>
            </div>
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 14px; gap: 10px;">
            <div id="activityLocksAlert"></div>
            <div style="flex: 1; overflow: auto; border: 1px solid var(--border-subtle); border-radius: 6px;">
              <table class="data-grid" id="activityGrid">
                <thead>
                  <tr>
                    <th style="width: 70px;">PID</th>
                    <th style="width: 110px;">User</th>
                    <th style="width: 110px;">Database</th>
                    <th style="width: 110px;">Client Host</th>
                    <th style="width: 90px;">State</th>
                    <th style="width: 80px;">Time</th>
                    <th>Executing Query / Command</th>
                    <th style="width: 90px; text-align: center;">Action</th>
                  </tr>
                </thead>
                <tbody id="activityBody">
                  <tr><td colspan="8" style="text-align: center; color: var(--text-dim); padding: 20px;">Loading process activity...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 7. Streaming Replication & Binary Log Diagnostics -->
        <div class="tab-pane" id="tabReplication">
          <div class="activity-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; color: var(--emerald);">MySQL Binary Log &amp; Replication Diagnostics</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-sm" onclick="loadReplicationStatus()">🔄 Refresh</button>
            </div>
          </div>
          <div id="replicationContainer" style="padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
            <div class="card" style="padding: 24px; text-align: center; color: var(--text-dim);">
              Loading replication status...
            </div>
          </div>
        </div>

        <!-- 3. Query Plan Visualizer -->
        <div class="tab-pane" id="tabExplain">
          <div class="schema-layout" id="explainContainer">
            <div class="card">
              <div class="card-title">Run "Explain Plan" above to analyze query execution costs and index utilization.</div>
            </div>
          </div>
        </div>

        <!-- 4. Raw JSON Inspector -->
        <div class="tab-pane" id="tabJson">
          <div class="code-box" id="jsonInspectorBox">{\n  "status": "ready"\n}</div>
        </div>

        <!-- 5. Telemetry & Audit Log -->
        <div class="tab-pane" id="tabAudit">
          <div class="code-box" id="auditLogBox">[SYSTEM] MySQL Studio Pro initialized. All subsystems ready.</div>
        </div>

        <!-- 6. MySQL Maintenance & Tuning -->
        <div class="tab-pane" id="tabPragma">
          <div class="schema-layout">
            <div class="card">
              <div class="card-title">⚙️ MySQL Maintenance & Performance Tuning</div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px;">
                <button class="btn" onclick="showVariable('innodb_buffer_pool_size')">🧠 Inspect innodb_buffer_pool_size</button>
                <button class="btn" onclick="showVariable('sql_mode')">⚙️ Inspect sql_mode</button>
                <button class="btn" onclick="showVariable('max_connections')">🔌 Inspect max_connections</button>
                <button class="btn" onclick="optimizeMysqlTables()">🧹 Optimize all tables</button>
                <button class="btn" onclick="runMysqlMaintenance('ANALYZE TABLE')">📈 Run ANALYZE TABLE</button>
                <button class="btn" onclick="checkMysqlTables()">🔍 Run CHECK TABLE</button>
              </div>
            </div>
            <div class="card">
              <div class="card-title">MySQL Maintenance Output</div>
              <div class="code-box" id="pragmaOutputBox" style="height: 240px;">No MySQL maintenance commands executed yet.</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Footer -->
  <footer>
    <div>
      <span>Engine: <b style="color: var(--cyan);">bun:mysql</b></span>
      <span> • </span>
      <span>Platform: <b>macOS / Darwin</b></span>
      <span> • </span>
      <span id="footerConnection">Connected: my_app_dev</span>
    </div>
    <div id="footerClock">00:00:00</div>
  </footer>

  <!-- Microsoft Access Join Properties Modal -->
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

        <!-- Access 3-Option Join Types (Plus Full Outer & Cross) -->
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
              <span class="access-join-title">4: Include ALL records from both tables whether or not there are matching records.</span>
              <span class="access-join-desc">FULL OUTER JOIN — Complete union of all rows from both tables with NULLs where keys do not match.</span>
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

  <!-- MySQL Connection & Database Manager Modal -->
  <div class="modal-overlay" id="dbBrowserModal" onclick="if(event.target === this) closeDatabaseDialog()">
    <div class="modal-card" style="max-width: 740px;">
      <div class="modal-header">
        <div class="modal-title">
          <span>🔌</span>
          <span>MySQL Connection &amp; Database Manager</span>
          <span id="connSourceBadge" class="badge" style="font-size: 10px; font-weight: 600; text-transform: uppercase;">ENV</span>
        </div>
        <button class="modal-close" onclick="closeDatabaseDialog()" title="Close dialog">✕</button>
      </div>

      <!-- Modal Tabs -->
      <div style="display: flex; gap: 4px; padding: 10px 20px 0; background: rgba(0,0,0,0.25); border-bottom: 1px solid var(--border-subtle);">
        <button class="tab-btn active" id="btnConnTabConfig" onclick="switchConnectionModalTab('config')" style="padding: 6px 14px; font-size: 12px;">🔌 Manual Connection</button>
        <button class="tab-btn" id="btnConnTabDatabases" onclick="switchConnectionModalTab('databases')" style="padding: 6px 14px; font-size: 12px;">🗄️ Server Databases</button>
        <button class="tab-btn" id="btnConnTabProfiles" onclick="switchConnectionModalTab('profiles')" style="padding: 6px 14px; font-size: 12px;">💾 Saved Profiles</button>
      </div>

      <div class="modal-body" style="padding: 16px 20px; gap: 14px;">
        <!-- TAB 1: Manual Connection Config -->
        <div id="connPanelConfig">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
            <div style="font-size: 11px; color: var(--text-dim);">
              Configure MySQL host, port, credentials, and database directly without needing <code>.env</code>.
            </div>
            <!-- Input Format Toggle -->
            <div style="display: flex; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 2px;">
              <button class="btn btn-sm btn-primary" id="btnModeForm" onclick="setConnectionInputMode('form')" style="padding: 2px 8px; font-size: 10px;">📋 Form Fields</button>
              <button class="btn btn-sm" id="btnModeUrl" onclick="setConnectionInputMode('url')" style="padding: 2px 8px; font-size: 10px;">🔗 Connection URL</button>
            </div>
          </div>

          <!-- Quick Presets Bar -->
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; padding: 6px 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid var(--border-subtle);">
            <span style="font-size: 10px; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">Presets:</span>
            <button class="sidebar-mini-btn" onclick="applyConnPreset('localhost')">🏠 Localhost (3306)</button>
            <button class="sidebar-mini-btn" onclick="applyConnPreset('docker')">🐳 Docker (127.0.0.1:3306)</button>
            <button class="sidebar-mini-btn" onclick="applyConnPreset('alt_port')">🔌 Port 3307</button>
            <button class="sidebar-mini-btn" onclick="applyConnPreset('rds')">☁️ RDS Template</button>
            <button class="sidebar-mini-btn" onclick="resetToEnvConfig()" style="color: var(--amber);" title="Restore configuration from current .env file">↺ Reset to .env</button>
          </div>

          <!-- Form Fields Mode -->
          <div id="connModeFormContainer">
            <div style="display: grid; grid-template-columns: 1fr 120px; gap: 10px; margin-bottom: 10px;">
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Server Host / IP</label>
                <input type="text" id="cfgHost" class="qbe-input" placeholder="127.0.0.1 or localhost" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 10px; font-size: 12px;">
              </div>
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Port</label>
                <input type="number" id="cfgPort" class="qbe-input" placeholder="3306" value="3306" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 10px; font-size: 12px;">
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Username</label>
                <input type="text" id="cfgUser" class="qbe-input" placeholder="root" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 10px; font-size: 12px;">
              </div>
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Password</label>
                <div style="position: relative;">
                  <input type="password" id="cfgPass" class="qbe-input" placeholder="Password (blank if none)" oninput="syncFieldsToUrl()" style="width: 100%; padding: 7px 34px 7px 10px; font-size: 12px;">
                  <button type="button" onclick="togglePasswordVisibility()" title="Show/Hide Password" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; font-size: 13px; color: var(--text-dim);">👁️</button>
                </div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; align-items: end;">
              <div>
                <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Default Database / Schema</label>
                <div style="display: flex; gap: 6px;">
                  <input type="text" id="cfgDb" class="qbe-input" placeholder="e.g. my_app_dev" oninput="syncFieldsToUrl()" style="flex: 1; padding: 7px 10px; font-size: 12px;">
                  <button class="btn btn-sm" onclick="scanHostDatabasesForDropdown()" title="Scan databases on host" style="padding: 7px 10px; font-size: 11px; white-space: nowrap;">🔍 Scan</button>
                </div>
              </div>
              <div style="padding-bottom: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted); cursor: pointer;">
                  <input type="checkbox" id="cfgTls" onchange="syncFieldsToUrl()">
                  <span>Enable SSL / TLS Encryption</span>
                </label>
              </div>
            </div>
          </div>

          <!-- Connection URL Mode -->
          <div id="connModeUrlContainer" style="display: none; margin-bottom: 10px;">
            <label style="display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">MySQL Connection URL</label>
            <input type="text" id="cfgUrl" class="qbe-input" style="width: 100%; padding: 8px 10px; font-family: var(--font-mono); font-size: 11px;" placeholder="mysql://root:password@127.0.0.1:3306/my_app_dev" oninput="parseUrlIntoFields(this.value)">
            <div style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">Format: <code>mysql://[user[:password]@]host[:port][/database][?tls=true]</code></div>
          </div>

          <!-- Live Test Diagnostic Banner -->
          <div id="connTestResult" style="display: none; border-radius: 6px; padding: 8px 12px; font-size: 11px; margin-bottom: 12px; line-height: 1.5;"></div>

          <!-- Actions Bar -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px; margin-top: 4px;">
            <div style="display: flex; gap: 6px;">
              <button class="btn" id="btnTestConn" onclick="testManualConnection()" style="padding: 6px 12px; font-size: 11px;">⚡ Test Connection</button>
              <button class="btn" onclick="promptSaveProfile()" style="padding: 6px 12px; font-size: 11px;">💾 Save Profile</button>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn" onclick="closeDatabaseDialog()" style="padding: 6px 14px; font-size: 11px;">Cancel</button>
              <button class="btn btn-primary" id="btnApplyConn" onclick="applyManualConnection()" style="padding: 6px 16px; font-size: 11px; font-weight: 600;">🔌 Connect &amp; Apply</button>
            </div>
          </div>
        </div>

        <!-- TAB 2: Discovered Server Databases -->
        <div id="connPanelDatabases" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 11px; color: var(--text-dim);">
              Databases available on the active MySQL server (<code>SHOW DATABASES</code>):
            </div>
            <button class="sidebar-mini-btn" onclick="loadWorkspaceDatabases()">🔄 Refresh List</button>
          </div>
          <div id="workspaceDbList" style="display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; margin-bottom: 14px;">
            <!-- Populated dynamically -->
          </div>

          <!-- Create Database Card -->
          <div style="border-top: 1px solid var(--border-subtle); padding-top: 12px;">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-main); margin-bottom: 6px;">➕ Create New Database on Server</div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="txtNewDbName" class="qbe-input" placeholder="new_database_name" style="flex: 1; padding: 6px 10px; font-size: 11px;">
              <button class="btn btn-primary" onclick="handleCreateDatabase()" style="padding: 6px 12px; font-size: 11px; white-space: nowrap;">Create &amp; Switch</button>
            </div>
          </div>
        </div>

        <!-- TAB 3: Saved Profiles -->
        <div id="connPanelProfiles" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="font-size: 11px; color: var(--text-dim);">
              Saved connection profiles stored in local workstation storage:
            </div>
            <button class="sidebar-mini-btn" onclick="promptSaveProfile()">➕ Save Current Config</button>
          </div>
          <div id="savedProfilesList" style="display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto;">
            <!-- Populated dynamically from localStorage -->
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

  <!-- MySQL Database Backup & SQL Dump Modal -->
  <div class="modal-overlay" id="dumpModal" onclick="if(event.target === this) closeDatabaseDumpModal()">
    <div class="modal-card" style="max-width: 900px; max-height: 90vh;">
      <div class="modal-header">
        <div class="modal-title">
          <span>💾</span>
          <span>MySQL Database Backup &amp; SQL Dump Generator</span>
        </div>
        <button class="modal-close" onclick="closeDatabaseDumpModal()">✕</button>
      </div>
      <div class="modal-body" style="padding: 16px 20px; gap: 12px; overflow-y: auto;">
        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-dim);">Dump Mode:</label>
          <select id="dumpModeSelect" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 11px;">
            <option value="all">Complete (Schema DDL + Table Data)</option>
            <option value="schema">Schema Only (DDL, Indexes, Keys, Views)</option>
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

  <!-- Add/Create Custom ENUM Column Modal -->
  <div class="modal-overlay" id="createEnumModal" onclick="if(event.target === this) closeCreateEnumModal()">
    <div class="modal-card" style="max-width: 480px;">
      <div class="modal-header">
        <div class="modal-title">
          <span>🏷️</span>
          <span>Add MySQL ENUM Column</span>
        </div>
        <button class="modal-close" onclick="closeCreateEnumModal()">✕</button>
      </div>
      <div class="modal-body" style="padding: 16px 20px; gap: 12px;">
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; color: var(--text-dim); font-weight: 700;">Target Table &amp; Column (table.column, e.g. orders.status):</label>
          <input type="text" id="enumNewName" placeholder="e.g. orders.status" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; outline: none;">
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; color: var(--text-dim); font-weight: 700;">Allowed Values (comma separated):</label>
          <input type="text" id="enumNewValues" placeholder="e.g. Pending, Processing, Shipped, Delivered, Cancelled" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-subtle); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; outline: none;">
        </div>
      </div>
      <div class="modal-footer" style="padding: 12px 20px; display: flex; justify-content: flex-end; gap: 8px;">
        <button class="btn btn-sm" onclick="closeCreateEnumModal()">Cancel</button>
        <button class="btn btn-sm btn-primary" onclick="submitCreateEnum()">Save ENUM Column</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div class="toast" id="toastBox">Notification message</div>

  <script>
    const PRESETS = ${presetsJson};
    let currentSchema = null;
    let currentKpis = null;
    let currentGridRows = [];
    let currentGridColumns = [];
    let currentGridRawRows = [];
    let activeTable = "";
    let gridPage = 1;
    let gridPageSize = 25;
    let gridSortCol = "";
    let gridSortDir = "ASC";
    let activeTab = "grid";
    let accessTotalsRowVisible = false;
    let accessFilterBarVisible = false;
    let activeColumnFilters = {};
    let allEnumTypes = [];
    let currentDumpSql = "";
    let queryDesignerState = {
      activeView: "design",
      selectedTables: [],
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

    // ---------------------------------------------------------------------------------------------
    // Direct API Client
    // ---------------------------------------------------------------------------------------------
    async function apiRequest(endpoint, body) {
      try {
        const opts = body 
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : { method: 'GET' };
        const res = await fetch(endpoint, opts);
        if (!res.ok) {
          try {
            const errData = await res.json();
            if (errData && errData.error) return { success: false, error: errData.error };
          } catch {}
          throw new Error("HTTP " + res.status + " " + res.statusText);
        }
        return await res.json();
      } catch (err) {
        console.error("API Error (" + endpoint + "):", err);
        return { success: false, error: err.message };
      }
    }

    function showToast(msg) {
      const toast = document.getElementById("toastBox");
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2500);
    }

    function logAudit(msg) {
      const box = document.getElementById("auditLogBox");
      if (!box) return;
      const time = new Date().toLocaleTimeString();
      box.textContent = \`[\${time}] \${msg}\\n\` + box.textContent;
    }

    // ---------------------------------------------------------------------------------------------
    // Fullscreen Support & Browser Auto-Fullscreen
    // ---------------------------------------------------------------------------------------------
    // Inside the File Manager the studio sits in a frame: browser full screen would be left with Esc, which the studio needs.
    const insideFrame = window.parent !== window;
    window.doToggleFullscreen = function() {
      if (insideFrame) return;
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

    // Automatically trigger initial fullscreen once Webview DOM is ready and event loop is running
    function triggerInitialFullscreen() {
      setTimeout(() => {
        if (typeof window.requestInitialFullscreen === "function") {
          try { window.requestInitialFullscreen(); return; } catch(e) {}
        }
        if (typeof window.toggleFullscreen === "function") {
          try { window.toggleFullscreen(); return; } catch(e) {}
        }
      }, 150);
    }
    if (document.readyState === "loading") {
      window.addEventListener("DOMContentLoaded", triggerInitialFullscreen);
    } else {
      triggerInitialFullscreen();
    }

    // If accessed via external browser tab, automatically enter fullscreen on first user interaction
    let autoFullscreenAttempted = false;
    function attemptBrowserFullscreen() {
      if (autoFullscreenAttempted || insideFrame) return;
      autoFullscreenAttempted = true;
      if (!window.toggleFullscreen && !document.fullscreenElement && !document.webkitFullscreenElement && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else if (document.documentElement.webkitRequestFullscreen) {
          document.documentElement.webkitRequestFullscreen();
        }
      }
    }
    window.addEventListener("click", attemptBrowserFullscreen, { once: true });
    window.addEventListener("keydown", attemptBrowserFullscreen, { once: true });

    function toggleEditorCollapse() {
      const banner = document.getElementById("editorBanner");
      const btn = document.getElementById("btnToggleEditor");
      if (!banner || !btn) return;
      banner.classList.toggle("collapsed");
      const isCollapsed = banner.classList.contains("collapsed");
      btn.textContent = isCollapsed ? "▼ Expand" : "▲ Minimize";
      btn.title = isCollapsed ? "Expand SQL Editor" : "Minimize SQL Editor";
    }

    // ---------------------------------------------------------------------------------------------
    // Navigation & Tabs
    // ---------------------------------------------------------------------------------------------
    function switchTab(tabId) {
      activeTab = tabId;
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      const targetBtn = document.getElementById("tabBtn" + tabId.charAt(0).toUpperCase() + tabId.slice(1));
      const targetPane = document.getElementById("tab" + tabId.charAt(0).toUpperCase() + tabId.slice(1));
      if (targetBtn) targetBtn.classList.add("active");
      if (targetPane) targetPane.classList.add("active");

      if (tabId === "designer") {
        renderQueryDesigner();
      } else if (tabId === "macros" && typeof renderMacroDesigner === "function") {
        renderMacroDesigner();
      } else if (tabId === "types") {
        loadEnumTypes();
      } else if (tabId === "partitions") {
        loadPartitions();
      } else if (tabId === "activity") {
        loadActivity();
      } else if (tabId === "replication") {
        loadReplicationStatus();
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Database Refresh & KPIs
    // ---------------------------------------------------------------------------------------------
    async function refreshAll() {
      await refreshKpis();
      await refreshSchema();
    }

    async function refreshKpis() {
      const kpis = await apiRequest('/api/kpis');
      if (!kpis || !kpis.dbName) return;
      currentKpis = kpis;

      document.getElementById("kpiDbName").textContent = kpis.dbName;
      document.getElementById("kpiDbPath").textContent = kpis.dbPath;
      document.getElementById("kpiSize").textContent = kpis.fileSizeFormatted;
      document.getElementById("kpiEngine").textContent = "MySQL " + kpis.mysqlVersion;
      document.getElementById("kpiTables").textContent = kpis.tableCount + " Tables";
      document.getElementById("kpiViewsIndices").textContent = kpis.viewCount + " Views • " + kpis.indexCount + " Indices";
      document.getElementById("kpiRows").textContent = kpis.totalRows.toLocaleString() + " Rows";
      document.getElementById("kpiJournal").textContent = "Mode: " + kpis.journalMode + (kpis.walMode ? " (Optimized)" : "");
      document.getElementById("footerConnection").textContent = "Connected: " + kpis.dbName;

      const sidebarName = document.getElementById("sidebarDbName");
      if (sidebarName) sidebarName.textContent = kpis.dbName;
      const sidebarBadge = document.getElementById("sidebarDbBadge");
      if (sidebarBadge) sidebarBadge.textContent = kpis.isMemory ? "RAM" : (kpis.walMode ? "WAL" : "DISK");
    }

    async function refreshSchema() {
      const schema = await apiRequest('/api/schema');
      if (!schema || !schema.tables) return;
      currentSchema = schema;
      ensureQueryDesignerState();
      renderObjectTree();
      renderQueryDesigner();
    }

    // ---------------------------------------------------------------------------------------------
    // MySQL Connection & Database Manager Logic (Manual Configuration & Profiles)
    // ---------------------------------------------------------------------------------------------
    let currentConnConfig = null;
    const PROFILES_STORAGE_KEY = "mysql_studio_saved_profiles_v1";

    async function openDatabaseDialog(initialTab = 'config') {
      const modal = document.getElementById("dbBrowserModal");
      if (modal) modal.classList.add("open");
      switchConnectionModalTab(initialTab || 'config');
      await fetchCurrentConfig();
    }

    function closeDatabaseDialog() {
      const modal = document.getElementById("dbBrowserModal");
      if (modal) modal.classList.remove("open");
    }

    async function fetchCurrentConfig() {
      try {
        const res = await apiRequest('/api/config');
        if (res && res.success && res.config) {
          currentConnConfig = res.config;
          populateConfigFields(res.config);
          updateConnSourceBadge(res.config.source);
        }
      } catch (err) {
        console.warn("Could not fetch active config:", err);
      }
    }

    function updateConnSourceBadge(source) {
      const badge = document.getElementById("connSourceBadge");
      if (!badge) return;
      const isEnv = (source || "").toLowerCase() === "env";
      badge.textContent = isEnv ? "ENV" : "MANUAL";
      badge.style.background = isEnv ? "rgba(56, 189, 248, 0.2)" : "rgba(168, 85, 247, 0.25)";
      badge.style.color = isEnv ? "var(--cyan)" : "#c084fc";
      badge.style.border = isEnv ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid rgba(168, 85, 247, 0.4)";
    }

    function populateConfigFields(cfg) {
      if (!cfg) return;
      const hostInput = document.getElementById("cfgHost");
      const portInput = document.getElementById("cfgPort");
      const userInput = document.getElementById("cfgUser");
      const passInput = document.getElementById("cfgPass");
      const dbInput = document.getElementById("cfgDb");
      const tlsInput = document.getElementById("cfgTls");

      if (hostInput && !hostInput.matches(':focus')) hostInput.value = cfg.host || "127.0.0.1";
      if (portInput && !portInput.matches(':focus')) portInput.value = cfg.port || 3306;
      if (userInput && !userInput.matches(':focus')) userInput.value = cfg.user || "root";
      if (passInput && !passInput.matches(':focus')) {
        passInput.value = "";
        passInput.placeholder = cfg.hasPassword ? "•••••••• (Password configured)" : "Password (blank if none)";
      }
      if (dbInput && !dbInput.matches(':focus')) dbInput.value = cfg.database || "";
      if (tlsInput) tlsInput.checked = Boolean(cfg.tls);

      syncFieldsToUrl();
    }

    function switchConnectionModalTab(tabKey) {
      const tabs = {
        config: { btn: "btnConnTabConfig", panel: "connPanelConfig" },
        databases: { btn: "btnConnTabDatabases", panel: "connPanelDatabases" },
        profiles: { btn: "btnConnTabProfiles", panel: "connPanelProfiles" },
      };
      for (const [key, t] of Object.entries(tabs)) {
        const b = document.getElementById(t.btn);
        const p = document.getElementById(t.panel);
        const isActive = (key === tabKey);
        if (b) b.classList.toggle("active", isActive);
        if (p) p.style.display = isActive ? "block" : "none";
      }
      if (tabKey === "databases") {
        loadWorkspaceDatabases();
      } else if (tabKey === "profiles") {
        loadSavedProfiles();
      }
    }

    function setConnectionInputMode(mode) {
      const isForm = (mode === 'form');
      const btnForm = document.getElementById("btnModeForm");
      const btnUrl = document.getElementById("btnModeUrl");
      const panelForm = document.getElementById("connModeFormContainer");
      const panelUrl = document.getElementById("connModeUrlContainer");

      if (btnForm) btnForm.classList.toggle("btn-primary", isForm);
      if (btnUrl) btnUrl.classList.toggle("btn-primary", !isForm);
      if (panelForm) panelForm.style.display = isForm ? "block" : "none";
      if (panelUrl) panelUrl.style.display = isForm ? "none" : "block";

      if (isForm) {
        const urlVal = document.getElementById("cfgUrl")?.value;
        if (urlVal) parseUrlIntoFields(urlVal);
      } else {
        syncFieldsToUrl();
      }
    }

    function syncFieldsToUrl() {
      const host = (document.getElementById("cfgHost")?.value || "").trim() || "127.0.0.1";
      const port = (document.getElementById("cfgPort")?.value || "").trim() || "3306";
      const user = (document.getElementById("cfgUser")?.value || "").trim();
      const pass = document.getElementById("cfgPass")?.value || "";
      const db = (document.getElementById("cfgDb")?.value || "").trim();
      const tls = Boolean(document.getElementById("cfgTls")?.checked);

      let auth = "";
      if (user) {
        auth = encodeURIComponent(user);
        if (pass) {
          auth += ":" + encodeURIComponent(pass);
        }
        auth += "@";
      }

      const url = "mysql://" + auth + host + ":" + port + (db ? "/" + encodeURIComponent(db) : "") + (tls ? "?tls=true" : "");

      const urlInput = document.getElementById("cfgUrl");
      if (urlInput && document.activeElement !== urlInput) {
        urlInput.value = url;
      }
    }

    function parseUrlIntoFields(urlStr) {
      if (!urlStr || typeof urlStr !== "string") return;
      try {
        const trimmed = urlStr.trim();
        const normalized = trimmed.toLowerCase().startsWith("mysql://")
          ? "http://" + trimmed.slice(8)
          : trimmed;
        const dummyUrl = new URL(normalized);
        const host = dummyUrl.hostname || "127.0.0.1";
        const port = dummyUrl.port || "3306";
        const user = decodeURIComponent(dummyUrl.username || "");
        const pass = decodeURIComponent(dummyUrl.password || "");
        let db = dummyUrl.pathname || "";
        if (db.startsWith("/")) db = db.slice(1);
        db = decodeURIComponent(db);
        const tls = dummyUrl.searchParams.get("tls") === "true" || dummyUrl.searchParams.get("ssl") === "true";

        const hostInput = document.getElementById("cfgHost");
        const portInput = document.getElementById("cfgPort");
        const userInput = document.getElementById("cfgUser");
        const passInput = document.getElementById("cfgPass");
        const dbInput = document.getElementById("cfgDb");
        const tlsInput = document.getElementById("cfgTls");

        if (hostInput) hostInput.value = host;
        if (portInput) portInput.value = port;
        if (userInput) userInput.value = user;
        if (passInput && pass) passInput.value = pass;
        if (dbInput) dbInput.value = db;
        if (tlsInput) tlsInput.checked = tls;
      } catch {}
    }

    function togglePasswordVisibility() {
      const passInput = document.getElementById("cfgPass");
      if (!passInput) return;
      passInput.type = passInput.type === "password" ? "text" : "password";
    }

    function applyConnPreset(presetKey) {
      const presets = {
        localhost: { host: "127.0.0.1", port: 3306, user: "root", password: "", database: "my_app_dev", tls: false },
        docker: { host: "127.0.0.1", port: 3306, user: "root", password: "rootpassword", database: "my_app_dev", tls: false },
        alt_port: { host: "127.0.0.1", port: 3307, user: "root", password: "", database: "my_app_dev", tls: false },
        rds: { host: "database-1.cluster-xyz.us-east-1.rds.amazonaws.com", port: 3306, user: "admin", password: "", database: "production", tls: true },
      };
      const p = presets[presetKey];
      if (!p) return;

      const hostInput = document.getElementById("cfgHost");
      const portInput = document.getElementById("cfgPort");
      const userInput = document.getElementById("cfgUser");
      const passInput = document.getElementById("cfgPass");
      const dbInput = document.getElementById("cfgDb");
      const tlsInput = document.getElementById("cfgTls");

      if (hostInput) hostInput.value = p.host;
      if (portInput) portInput.value = p.port;
      if (userInput) userInput.value = p.user;
      if (passInput) passInput.value = p.password;
      if (dbInput) dbInput.value = p.database;
      if (tlsInput) tlsInput.checked = p.tls;

      syncFieldsToUrl();
      hideConnTestResult();
      showToast("Applied preset: " + presetKey);
    }

    async function resetToEnvConfig() {
      showToast("Resetting to .env configuration...");
      const res = await apiRequest('/api/config', { resetToEnv: true });
      if (res && res.success && res.config) {
        currentConnConfig = res.config;
        populateConfigFields(res.config);
        updateConnSourceBadge(res.config.source);
        hideConnTestResult();
        showToast("Configuration reset to .env file!");
        logAudit("[CONFIG] Reset MySQL connection parameters to .env");
        await refreshAll();
        if (typeof loadMacrosFromServer === "function") await loadMacrosFromServer();
      } else {
        showToast("Failed to reset to .env: " + (res ? res.error : "Unknown error"));
      }
    }

    function getEnteredConfig() {
      const host = (document.getElementById("cfgHost")?.value || "").trim() || "127.0.0.1";
      const port = parseInt(document.getElementById("cfgPort")?.value || "3306", 10) || 3306;
      const user = (document.getElementById("cfgUser")?.value || "").trim() || "root";
      const password = document.getElementById("cfgPass")?.value || "";
      const database = (document.getElementById("cfgDb")?.value || "").trim();
      const tls = Boolean(document.getElementById("cfgTls")?.checked);
      const url = (document.getElementById("cfgUrl")?.value || "").trim();

      return { host, port, user, password, database, tls, url };
    }

    function hideConnTestResult() {
      const banner = document.getElementById("connTestResult");
      if (banner) {
        banner.style.display = "none";
        banner.innerHTML = "";
      }
    }

    async function testManualConnection() {
      const btn = document.getElementById("btnTestConn");
      const banner = document.getElementById("connTestResult");
      if (!banner) return;

      const cfg = getEnteredConfig();
      if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Testing...";
      }

      banner.style.display = "block";
      banner.style.background = "rgba(56, 189, 248, 0.1)";
      banner.style.border = "1px solid rgba(56, 189, 248, 0.3)";
      banner.style.color = "var(--text-main)";
      banner.innerHTML = '<span>⏳ Testing connection to MySQL server at <code>' + escapeHtml(cfg.host) + ':' + cfg.port + '</code>...</span>';

      try {
        const res = await apiRequest('/api/test-config', cfg);
        if (res && res.success) {
          banner.style.background = "rgba(34, 197, 94, 0.12)";
          banner.style.border = "1px solid rgba(34, 197, 94, 0.4)";
          let html = '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">' +
            '<strong style="color: var(--emerald);">✅ Connection Successful!</strong>' +
            '<span style="font-size: 10px; color: var(--text-dim); font-family: var(--font-mono);">' + (res.latencyMs || 0) + ' ms roundtrip</span>' +
          '</div>';
          html += '<div style="font-size: 11px; color: var(--text-dim); margin-bottom: 6px;">Server: <code>' + escapeHtml(res.version || "MySQL") + '</code></div>';
          if (res.databases && res.databases.length > 0) {
            html += '<div style="margin-top: 6px; font-size: 10px; color: var(--text-dim); font-weight: 600;">DISCOVERED DATABASES ON HOST (click to select):</div>';
            html += '<div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; max-height: 80px; overflow-y: auto;">';
            res.databases.forEach(db => {
              html += '<button class="sidebar-mini-btn" type="button" data-db-name="' + escapeHtml(db) + '" onclick="selectDiscoveredDb(this.dataset.dbName)" style="padding: 2px 7px; font-size: 10px; font-family: var(--font-mono);">🗄️ ' + escapeHtml(db) + '</button>';
            });
            html += '</div>';
          }
          banner.innerHTML = html;
        } else {
          banner.style.background = "rgba(239, 68, 68, 0.12)";
          banner.style.border = "1px solid rgba(239, 68, 68, 0.4)";
          banner.innerHTML = '<div><strong style="color: var(--crimson);">❌ Connection Failed:</strong></div><div style="margin-top: 4px; font-family: var(--font-mono); font-size: 10px; color: #fca5a5;">' + escapeHtml(res ? res.error : "Unknown connection failure") + '</div>';
        }
      } catch (err) {
        banner.style.background = "rgba(239, 68, 68, 0.12)";
        banner.style.border = "1px solid rgba(239, 68, 68, 0.4)";
        banner.innerHTML = '<div><strong style="color: var(--crimson);">❌ Test Error:</strong></div><div style="margin-top: 4px; font-family: var(--font-mono); font-size: 10px; color: #fca5a5;">' + escapeHtml(err.message) + '</div>';
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "⚡ Test Connection";
        }
      }
    }

    function selectDiscoveredDb(dbName) {
      const dbInput = document.getElementById("cfgDb");
      if (dbInput) {
        dbInput.value = dbName;
        syncFieldsToUrl();
        showToast("Selected database: " + dbName);
      }
    }

    function scanHostDatabasesForDropdown() {
      testManualConnection();
    }

    async function applyManualConnection() {
      const btn = document.getElementById("btnApplyConn");
      const cfg = getEnteredConfig();

      if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Connecting...";
      }

      try {
        const res = await apiRequest('/api/config', cfg);
        if (res && res.success) {
          currentConnConfig = res.config;
          updateConnSourceBadge(res.config?.source);
          closeDatabaseDialog();
          showToast("Connected to MySQL: " + (res.config?.database || cfg.database || 'default'));
          logAudit("[CONNECT] Configured MySQL connection manually -> " + cfg.host + ":" + cfg.port + "/" + (cfg.database || ''));
          await refreshAll();
          if (typeof loadMacrosFromServer === "function") await loadMacrosFromServer();
          if (currentSchema && currentSchema.tables.length > 0) {
            selectTable(currentSchema.tables[0].name);
          }
        } else {
          showToast("Failed to connect: " + (res ? res.error : "Unknown error"));
          const banner = document.getElementById("connTestResult");
          if (banner) {
            banner.style.display = "block";
            banner.style.background = "rgba(239, 68, 68, 0.12)";
            banner.style.border = "1px solid rgba(239, 68, 68, 0.4)";
            banner.innerHTML = '<div><strong style="color: var(--crimson);">❌ Connection Failed:</strong></div><div style="margin-top: 4px; font-family: var(--font-mono); font-size: 10px; color: #fca5a5;">' + escapeHtml(res ? res.error : "Unknown error") + '</div>';
          }
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "🔌 Connect & Apply";
        }
      }
    }

    async function handleCreateDatabase() {
      const input = document.getElementById("txtNewDbName");
      const name = (input?.value || "").trim();
      if (!name) {
        showToast("Please enter a database name to create.");
        return;
      }
      showToast("Creating database '" + name + "'...");
      const res = await apiRequest('/api/create-database', { database: name });
      if (res && res.success) {
        if (input) input.value = "";
        showToast("Database '" + res.database + "' created and activated!");
        logAudit("[DATABASE] Created and switched to new database: " + res.database);
        closeDatabaseDialog();
        await refreshAll();
        if (typeof loadMacrosFromServer === "function") await loadMacrosFromServer();
      } else {
        showToast("Create database failed: " + (res ? res.error : "Unknown error"));
      }
    }

    // Saved Profiles in Local Workstation Storage
    function getStoredProfiles() {
      try {
        const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : [];
        // profiles saved by older versions may contain a password: remove it
        if (stored.some((p) => p && "password" in p)) {
          stored.forEach((p) => { if (p) delete p.password; });
          localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(stored));
        }
        return stored;
      } catch {
        return [];
      }
    }

    function saveStoredProfiles(profiles) {
      try {
        localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
      } catch {}
    }

    function promptSaveProfile() {
      const cfg = getEnteredConfig();
      const defaultName = (cfg.user || 'root') + '@' + cfg.host + ':' + cfg.port + '/' + (cfg.database || 'default');
      const name = prompt("Enter a profile name for this connection:", defaultName);
      if (!name) return;

      const profiles = getStoredProfiles();
      const profile = {
        id: "prof_" + Date.now(),
        name: name.trim(),
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        // the password is never kept in the browser; enter it when you load the profile
        database: cfg.database,
        tls: cfg.tls,
        createdAt: new Date().toISOString(),
      };
      profiles.unshift(profile);
      saveStoredProfiles(profiles);
      showToast("Saved profile: " + profile.name);
      loadSavedProfiles();
      switchConnectionModalTab('profiles');
    }

    function loadSavedProfiles() {
      const container = document.getElementById("savedProfilesList");
      if (!container) return;
      const profiles = getStoredProfiles();
      if (profiles.length === 0) {
        container.innerHTML = '<div style="color: var(--text-dim); font-size: 11px; padding: 14px; text-align: center;">No saved profiles yet. Configure a connection in <b>🔌 Manual Connection</b> and click <b>💾 Save Profile</b>.</div>';
        return;
      }

      container.innerHTML = "";
      profiles.forEach(p => {
        const card = document.createElement("div");
        card.className = "db-item-row";
        card.style.display = "flex";
        card.style.alignItems = "center";
        card.style.justifyContent = "space-between";
        card.style.padding = "8px 10px";
        card.style.background = "rgba(255,255,255,0.03)";
        card.style.borderRadius = "6px";
        card.style.border = "1px solid var(--border-subtle)";

        card.innerHTML = 
          '<div style="min-width: 0; flex: 1;">' +
            '<div style="display: flex; align-items: center; gap: 6px;">' +
              '<span style="font-size: 13px;">💾</span>' +
              '<span style="font-size: 12px; font-weight: 600; color: var(--text-main);">' + escapeHtml(p.name) + '</span>' +
              (p.tls ? '<span style="font-size: 9px; background: rgba(34, 197, 94, 0.2); color: var(--emerald); padding: 1px 4px; border-radius: 4px;">SSL</span>' : '') +
            '</div>' +
            '<div style="font-size: 10px; font-family: var(--font-mono); color: var(--text-dim); margin-top: 2px;">' +
              escapeHtml(p.user || 'root') + '@' + escapeHtml(p.host) + ':' + p.port + (p.database ? '/' + escapeHtml(p.database) : '') +
            '</div>' +
          '</div>' +
          '<div style="display: flex; gap: 6px;">' +
            '<button class="btn btn-sm btn-primary" data-prof-id="' + escapeHtml(p.id) + '" onclick="loadAndApplyProfile(this.dataset.profId)" style="padding: 4px 8px; font-size: 11px;">Connect</button>' +
            '<button class="sidebar-mini-btn" data-prof-id="' + escapeHtml(p.id) + '" onclick="deleteProfile(this.dataset.profId)" title="Delete Profile" style="padding: 4px 6px; color: var(--crimson);">🗑️</button>' +
          '</div>';
        container.appendChild(card);
      });
    }

    function loadAndApplyProfile(id) {
      const profiles = getStoredProfiles();
      const p = profiles.find(x => x.id === id);
      if (!p) return;
      populateConfigFields(p);
      switchConnectionModalTab('config');
      // Passwords are not stored in the browser: enter it, then connect.
      showToast("Profile loaded. Enter the password and press Connect.");
    }

    function deleteProfile(id) {
      let profiles = getStoredProfiles();
      profiles = profiles.filter(x => x.id !== id);
      saveStoredProfiles(profiles);
      loadSavedProfiles();
      showToast("Profile removed");
    }

    async function loadWorkspaceDatabases() {
      const container = document.getElementById("workspaceDbList");
      if (!container) return;
      container.innerHTML = '<div style="color: var(--text-dim); font-size: 11px; padding: 6px;">Scanning server databases (SHOW DATABASES)...</div>';

      const res = await apiRequest('/api/workspace-databases');
      if (!res || !res.success || !res.databases || res.databases.length === 0) {
        container.innerHTML = '<div style="color: var(--text-dim); font-size: 11px; padding: 6px;">No databases found on server. You can create a new database below.</div>';
        return;
      }

      container.innerHTML = "";
      res.databases.forEach(db => {
        const row = document.createElement("div");
        row.className = "db-item-row";
        const isCurrent = Boolean(db.isCurrent);
        row.innerHTML = 
          '<div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">' +
            '<span style="font-size: 16px;">🗄️</span>' +
            '<div style="min-width: 0; flex: 1;">' +
              '<div style="font-size: 12px; font-weight: 600; color: ' + (isCurrent ? 'var(--cyan)' : 'var(--text-main)') + '; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' +
                escapeHtml(db.name) + ' ' + (isCurrent ? '<span style="font-size: 9px; background: rgba(56, 189, 248, 0.2); color: var(--cyan); padding: 1px 5px; border-radius: 4px; margin-left: 4px;">ACTIVE</span>' : '') +
              '</div>' +
              '<div style="font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' +
                escapeHtml(db.path) + ' (' + escapeHtml(db.sizeFormatted) + ')' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<button class="btn btn-sm ' + (isCurrent ? '' : 'btn-primary') + '" data-path="' + escapeHtml(db.path) + '" onclick="connectToDatabase(this.dataset.path)" ' + (isCurrent ? 'disabled' : '') + '>' +
            (isCurrent ? 'Active' : 'Load DB') +
          '</button>';
        container.appendChild(row);
      });
    }

    async function connectToDatabase(path) {
      if (!path) return;
      showToast("Connecting to " + path + "...");
      const res = await apiRequest('/api/connect', { path });
      if (res && res.success) {
        closeDatabaseDialog();
        showToast("Connected: " + res.path);
        logAudit("[CONNECT] Switched active database to " + res.path);
        await refreshAll();
        if (typeof loadMacrosFromServer === "function") await loadMacrosFromServer();
        if (currentSchema && currentSchema.tables.length > 0) {
          selectTable(currentSchema.tables[0].name);
        }
      } else {
        showToast("Connection failed: " + (res ? res.error : "Unknown error"));
      }
    }

    async function handleDatabaseUpload(file) {
      if (!file) return;
      showToast("Uploading and loading " + file.name + "...");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch('/api/upload-database', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data && data.success) {
          closeDatabaseDialog();
          showToast("Loaded uploaded database: " + data.name);
          logAudit("[UPLOAD] Loaded database from upload: " + data.path);
          await refreshAll();
          if (typeof loadMacrosFromServer === "function") await loadMacrosFromServer();
          if (currentSchema && currentSchema.tables.length > 0) {
            selectTable(currentSchema.tables[0].name);
          }
        } else {
          showToast("Upload failed: " + (data ? data.error : "Invalid file"));
        }
      } catch (err) {
        showToast("Upload error: " + err.message);
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Object Tree Rendering
    // ---------------------------------------------------------------------------------------------
    function renderObjectTree() {
      const container = document.getElementById("objectTreeContainer");
      if (!container || !currentSchema) return;
      container.innerHTML = "";

      const query = (document.getElementById("searchObjects").value || "").toLowerCase().trim();

      // Group 1: Tables
      const tablesGroup = createTreeGroup("Tables", "📋", currentSchema.tables, (t) => {
        selectTable(t.name);
      }, query);
      container.appendChild(tablesGroup);

      // Group 2: Views
      const viewsGroup = createTreeGroup("Views", "👁️", currentSchema.views, (v) => {
        selectTable(v.name);
      }, query);
      container.appendChild(viewsGroup);

      // Saved Queries & Macros (Access-style)
      if (typeof renderQueryTreeGroup === "function") renderQueryTreeGroup(container, query);
      if (typeof renderMacroTreeGroup === "function") renderMacroTreeGroup(container, query);
    }

    function createTreeGroup(groupTitle, icon, items, onClickItem, query) {
      const group = document.createElement("div");
      group.className = "tree-group";

      const filteredItems = query 
        ? items.filter(i => i.name.toLowerCase().includes(query))
        : items;

      const header = document.createElement("div");
      header.className = "tree-header";
      header.innerHTML = \`<div class="tree-header-left"><span class="tree-arrow">▼</span><span>\${icon} \${groupTitle}</span></div><span class="tree-badge">\${filteredItems.length}</span>\`;
      
      const itemsList = document.createElement("div");
      itemsList.className = "tree-items";

      header.onclick = () => {
        const isHidden = itemsList.style.display === "none";
        itemsList.style.display = isHidden ? "flex" : "none";
        header.querySelector(".tree-arrow").textContent = isHidden ? "▼" : "▶";
      };

      filteredItems.forEach(item => {
        const row = document.createElement("div");
        row.className = "tree-item" + (item.name === activeTable ? " active" : "");
        row.innerHTML = \`<span class="tree-item-title">\${escapeHtml(item.name)}</span><span class="tree-badge">\${item.rowCount.toLocaleString()}</span>\`;
        row.onclick = () => {
          document.querySelectorAll(".tree-item").forEach(el => el.classList.remove("active"));
          row.classList.add("active");
          onClickItem(item);
        };
        itemsList.appendChild(row);
      });

      group.appendChild(header);
      group.appendChild(itemsList);
      return group;
    }

    function filterObjects(query) {
      renderObjectTree();
    }

    function toggleAllGroups() {
      document.querySelectorAll(".tree-items").forEach(el => {
        el.style.display = el.style.display === "none" ? "flex" : "none";
      });
    }

    // ---------------------------------------------------------------------------------------------
    // Table Selection & Data Grid
    // ---------------------------------------------------------------------------------------------
    async function selectTable(tableName) {
      activeTable = tableName;
      if (!queryDesignerState.selectedTables.includes(tableName)) {
        queryDesignerState.selectedTables = [tableName, ...queryDesignerState.selectedTables.filter(name => name !== tableName)];
      }
      document.getElementById("gridTargetTitle").textContent = "Table: " + tableName;
      document.getElementById("sqlEditor").value = \`SELECT * FROM \${quoteSqlIdentifier(tableName)} LIMIT 100;\`;
      gridPage = 1;
      await fetchTableData();
      renderSchemaDesigner(tableName);
      renderQueryDesigner();
    }

    async function fetchTableData() {
      if (!activeTable) return;
      const searchVal = document.getElementById("gridSearchInput")?.value || "";

      const res = await apiRequest('/api/table/data', {
        table: activeTable,
        page: gridPage,
        pageSize: gridPageSize,
        orderBy: gridSortCol || undefined,
        orderDir: gridSortDir,
        search: searchVal,
      });

      if (res && res.success) {
        currentGridRows = res.rows || [];
        currentGridColumns = res.columns || [];
        currentGridRawRows = [...currentGridRows];
        renderDataGrid(currentGridColumns, currentGridRows, true, res.totalRows);
        document.getElementById("gridPageInfo").textContent = \`Page \${res.page} of \${res.totalPages} (\${res.totalRows} records)\`;
        document.getElementById("kpiLatency").textContent = res.latencyMs + " ms";
        document.getElementById("resultSummary").textContent = \`\${res.totalRows} total rows (\${res.rows.length} on page)\`;
        document.getElementById("jsonInspectorBox").textContent = JSON.stringify(currentGridRows, null, 2);
      } else {
        showToast("Error loading table: " + (res?.error || "Unknown"));
      }
    }

    function renderDataGrid(columns, rows, updateFilter = true, totalCount = null) {
      const thead = document.getElementById("gridHeaderRow");
      const tbody = document.getElementById("gridBody");
      thead.innerHTML = "";
      tbody.innerHTML = "";

      if (columns.length === 0) {
        thead.innerHTML = "<th>Result</th>";
        tbody.innerHTML = "<tr><td>(0 columns)</td></tr>";
        const foot = document.getElementById("gridTotalsFoot");
        if (foot) { foot.style.display = "none"; foot.innerHTML = ""; }
        const filterRow = document.getElementById("gridFilterBarRow");
        if (filterRow) filterRow.style.display = "none";
        return;
      }

      columns.forEach(col => {
        const th = document.createElement("th");
        const sortIcon = gridSortCol === col ? (gridSortDir === "ASC" ? " ▲" : " ▼") : "";
        th.textContent = col + sortIcon;
        th.onclick = () => {
          if (gridSortCol === col) {
            gridSortDir = gridSortDir === "ASC" ? "DESC" : "ASC";
          } else {
            gridSortCol = col;
            gridSortDir = "ASC";
          }
          fetchTableData();
        };
        thead.appendChild(th);
      });

      if (updateFilter) {
        renderFilterBar(columns);
      }

      if (rows.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="\${columns.length}" style="text-align: center; color: var(--text-dim); padding: 20px;">No records found.</td></tr>\`;
      } else {
        rows.forEach(row => {
          const tr = document.createElement("tr");
          columns.forEach(col => {
            const td = document.createElement("td");
            const val = row[col];
            td.textContent = val === null ? "NULL" : (typeof val === "object" ? JSON.stringify(val) : String(val));
            if (val === null) td.style.color = "var(--text-dim)";
            td.title = \`\${col}: \${td.textContent} (Double-click or right-click to filter)\`;
            td.ondblclick = (e) => {
              e.preventDefault();
              filterByColumnValue(col, val);
            };
            td.oncontextmenu = (e) => {
              e.preventDefault();
              filterByColumnValue(col, val);
            };
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
      }

      updateAccessTotalsRow(rows, columns, totalCount !== null ? totalCount : rows.length);
    }

    // ---------------------------------------------------------------------------------------------
    // Microsoft Access Totals Row & Quick Filter Bar
    // ---------------------------------------------------------------------------------------------
    function toggleAccessTotalsRow() {
      accessTotalsRowVisible = !accessTotalsRowVisible;
      const btn = document.getElementById("btnToggleTotals");
      if (btn) {
        if (accessTotalsRowVisible) btn.classList.add("btn-primary");
        else btn.classList.remove("btn-primary");
      }
      if (currentGridRows && currentGridColumns) {
        updateAccessTotalsRow(currentGridRows, currentGridColumns, currentGridRows.length);
      }
      showToast(accessTotalsRowVisible ? "Access Totals Row enabled" : "Access Totals Row disabled");
    }

    function updateAccessTotalsRow(rows, columns, total) {
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
        if (currentGridRawRows.length > 0) {
          currentGridRows = [...currentGridRawRows];
          renderDataGrid(currentGridColumns, currentGridRows, false);
        } else if (activeTable) {
          fetchTableData();
        }
      } else {
        renderFilterBar(currentGridColumns);
      }
      showToast(accessFilterBarVisible ? "Quick Filter Bar opened" : "Quick Filter Bar cleared");
    }

    function renderFilterBar(columns) {
      const filterRow = document.getElementById("gridFilterBarRow");
      if (!filterRow) return;
      if (!accessFilterBarVisible) {
        filterRow.style.display = "none";
        return;
      }
      filterRow.style.display = "table-row";
      filterRow.innerHTML = (columns || []).map(col => {
        const currentVal = activeColumnFilters[col] || "";
        const safeCol = String(col || "").replace(/"/g, '&quot;');
        const safeVal = String(currentVal || "").replace(/"/g, '&quot;');
        return '<th style="padding: 2px 4px; vertical-align: middle;">' +
          '<input type="text" class="access-filter-input" placeholder="filter ' + safeCol + '..." value="' + safeVal + '" data-col="' + safeCol + '" oninput="onColumnFilterInput(this.dataset.col, this.value)">' +
          '</th>';
      }).join('');
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
      renderFilterBar(currentGridColumns);
      showToast("Filtered by " + colName + " = " + colVal);
      filterLoadedRowsInMemory();
    }

    function filterLoadedRowsInMemory() {
      if (!currentGridRawRows || currentGridRawRows.length === 0) return;
      const filterKeys = Object.keys(activeColumnFilters);
      if (filterKeys.length === 0) {
        currentGridRows = [...currentGridRawRows];
      } else {
        currentGridRows = currentGridRawRows.filter(row => {
          return filterKeys.every(k => {
            const needle = activeColumnFilters[k].toLowerCase();
            const val = row[k];
            if (val === null || val === undefined) return needle === "null";
            return String(val).toLowerCase().includes(needle);
          });
        });
      }
      renderDataGrid(currentGridColumns, currentGridRows, false);
    }

    // ---------------------------------------------------------------------------------------------
    // Microsoft Access Publication Report Preview & Print/Export
    // ---------------------------------------------------------------------------------------------
    async function openAccessReportModal() {
      const modal = document.getElementById("accessReportModal");
      const content = document.getElementById("accessReportContent");
      if (!modal || !content) return;

      modal.style.display = "flex";
      modal.classList.add("open");

      if ((!currentGridRows || !currentGridRows.length) && activeTable) {
        try { await fetchTableData(); } catch(e) {}
      }

      const tblName = activeTable || "MySQL Workstation Report";
      const rows = currentGridRows || [];
      let columns = currentGridColumns || [];

      if (!columns.length && activeTable && currentSchema && currentSchema.tables) {
        const tbl = currentSchema.tables.find(t => t.name === activeTable);
        if (tbl && tbl.columns) columns = tbl.columns.map(c => c.name);
      }

      const dateStr = new Date().toLocaleString();
      const dbName = document.getElementById("kpiDbName")?.textContent || "my_app_dev";

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
      html += '  <span>🐬 MySQL Studio Pro / Access Parity Engine</span>';
      html += '</div>';
      html += '</div>';

      content.innerHTML = html;
      modal.style.display = "flex";
      modal.classList.add("open");
    }

    function closeAccessReportModal() {
      const modal = document.getElementById("accessReportModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("open");
      }
    }

    function printAccessReport() {
      window.print();
    }

    function exportAccessReportHtml() {
      const content = document.getElementById("accessReportContent");
      if (!content) return;
      const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report - ' + (activeTable || "MySQL") + '</title><style>' +
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
    // MySQL Enterprise Database Backup & SQL Dump
    // ---------------------------------------------------------------------------------------------
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
      modal.classList.add("open");
      await runGenerateDump();
    }

    function closeDatabaseDumpModal() {
      const modal = document.getElementById("dumpModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("open");
      }
    }

    async function runGenerateDump() {
      const mode = document.getElementById("dumpModeSelect")?.value || "all";
      const chks = document.querySelectorAll(".dump-table-chk:checked");
      const tables = Array.from(chks).map(c => c.value);

      const preview = document.getElementById("dumpSqlPreview");
      if (preview) preview.value = "-- Generating MySQL Database SQL Dump...";

      showToast("Generating MySQL database dump (" + mode + ")...");
      const res = await apiRequest("/api/database/dump", { mode, tables });
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
      const dbName = document.getElementById("kpiDbName")?.textContent || "my_app_dev";
      const blob = new Blob([currentDumpSql], { type: "application/sql" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mysql_dump_" + dbName + "_" + Date.now() + ".sql";
      a.click();
      showToast("✓ Downloaded SQL dump file!");
    }

    function openDumpInSqlIde() {
      if (!currentDumpSql) return;
      const sqlEl = document.getElementById("sqlEditor");
      if (sqlEl) sqlEl.value = currentDumpSql.slice(0, 10000);
      closeDatabaseDumpModal();
      showToast("Opened dump in SQL Query Editor!");
    }

    // ---------------------------------------------------------------------------------------------
    // MySQL Custom ENUM/SET Columns Management
    // ---------------------------------------------------------------------------------------------
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
          'No custom ENUM or SET columns found in database. Click "+ Add ENUM Column" to define one.' +
          '</div>';
        return;
      }

      grid.innerHTML = enums.map(e => {
        const badges = (e.values || []).map(v => '<span class="enum-badge">' + escapeHtml(v) + '</span>').join(' ');
        return '<div class="enum-card">' +
          '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '  <div style="font-weight:700; color:var(--cyan); font-size:13px; font-family:var(--font-mono);">' + escapeHtml(e.name) + '</div>' +
          '  <span class="badge">' + escapeHtml(e.type || "ENUM") + '</span>' +
          '</div>' +
          '<div style="display:flex; flex-wrap:wrap; gap:6px; margin:8px 0;">' + badges + '</div>' +
          '<div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:8px;">' +
          '  <span style="font-size:10px; color:var(--text-dim);">' + escapeHtml(e.table) + ' &bull; ' + escapeHtml(e.column) + '</span>' +
          '  <button class="btn btn-sm" onclick="promptAddEnumValue(&quot;' + escapeHtml(e.table) + '&quot;, &quot;' + escapeHtml(e.column) + '&quot;)">➕ Add Value</button>' +
          '</div>' +
          '</div>';
      }).join('');
    }

    function filterEnumTypes(q) {
      const needle = (q || "").toLowerCase();
      const filtered = allEnumTypes.filter(e => e.name.toLowerCase().includes(needle) || (e.values || []).some(v => v.toLowerCase().includes(needle)));
      renderEnumTypesGrid(filtered);
    }

    function openCreateEnumModal() {
      const modal = document.getElementById("createEnumModal");
      if (modal) {
        modal.style.display = "flex";
        modal.classList.add("open");
      }
    }

    function closeCreateEnumModal() {
      const modal = document.getElementById("createEnumModal");
      if (modal) {
        modal.style.display = "none";
        modal.classList.remove("open");
      }
    }

    async function submitCreateEnum() {
      const name = document.getElementById("enumNewName")?.value.trim();
      const rawVals = document.getElementById("enumNewValues")?.value.trim();
      if (!name || !rawVals) {
        showToast("Please provide target column (e.g. orders.status) and allowed values!");
        return;
      }
      const values = rawVals.split(",").map(v => v.trim()).filter(Boolean);
      showToast("Creating ENUM column " + name + "...");
      const res = await apiRequest("/api/types/enums/create", { name, values });
      if (res && res.success) {
        showToast("✓ ENUM column " + name + " configured successfully!");
        closeCreateEnumModal();
        await refreshSchema();
        loadEnumTypes();
      } else {
        showToast("Error creating enum: " + (res?.error || "Failed"));
      }
    }

    async function promptAddEnumValue(tbl, col) {
      const val = prompt("Enter new value to append to ENUM " + tbl + "." + col + ":");
      if (!val || val.trim() === "") return;
      showToast("Adding value to " + tbl + "." + col + "...");
      const res = await apiRequest("/api/types/enums/add-value", { table: tbl, column: col, value: val.trim() });
      if (res && res.success) {
        showToast("✓ Value added to ENUM " + tbl + "." + col);
        loadEnumTypes();
      } else {
        showToast("Error adding value: " + (res?.error || "Failed"));
      }
    }

    // ---------------------------------------------------------------------------------------------
    // MySQL Declarative Partition Trees Explorer
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
            'No partitioned tables found in the active MySQL database.<br>' +
            '<span style="font-size:11px; color:var(--text-muted);">Use <code>PARTITION BY RANGE / LIST / HASH / KEY</code> in DDL to enable partitioned tables.</span>' +
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
            '  <span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24;">' + strat + ' PARTITIONED</span>' +
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
    // MySQL Streaming Replication & Binary Log Diagnostics
    // ---------------------------------------------------------------------------------------------
    async function loadReplicationStatus() {
      const container = document.getElementById("replicationContainer");
      if (!container) return;
      container.innerHTML = '<div style="color:var(--text-dim); padding:20px; text-align:center;">Querying replication status...</div>';

      const res = await apiRequest("/api/replication");
      if (res && res.success) {
        const repl = res.replication || {};
        const replicas = repl.replicas || [];
        const binLogs = repl.binaryLogs || [];
        const master = repl.masterStatus;

        let replicasHtml = '';
        if (replicas.length === 0) {
          replicasHtml = '<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:16px;">No replica / slave threads currently connected or configured.</td></tr>';
        } else {
          replicasHtml = replicas.map(s => {
            return '<tr>' +
              '<td>' + escapeHtml(s.Replica_IO_Running || s.Slave_IO_Running || '-') + '</td>' +
              '<td>' + escapeHtml(s.Replica_SQL_Running || s.Slave_SQL_Running || '-') + '</td>' +
              '<td>' + escapeHtml(s.Source_Host || s.Master_Host || '-') + '</td>' +
              '<td>' + escapeHtml(s.Source_Log_File || s.Master_Log_File || '-') + '</td>' +
              '<td>' + escapeHtml(String(s.Seconds_Behind_Source ?? s.Seconds_Behind_Master ?? '0')) + 's</td>' +
              '<td>' + escapeHtml(s.Last_IO_Error || 'None') + '</td>' +
              '</tr>';
          }).join('');
        }

        let logsHtml = '';
        if (binLogs.length === 0) {
          logsHtml = '<tr><td colspan="2" style="text-align:center; color:var(--text-dim); padding:16px;">Binary logging not enabled (log_bin = OFF) or no log files found.</td></tr>';
        } else {
          logsHtml = binLogs.map(l => {
            return '<tr>' +
              '<td><strong>' + escapeHtml(l.logName) + '</strong></td>' +
              '<td>' + escapeHtml(l.fileSize) + '</td>' +
              '</tr>';
          }).join('');
        }

        container.innerHTML = '' +
          '<div class="card">' +
          '  <div class="card-title">📡 MySQL Replica Status (SHOW REPLICA STATUS)</div>' +
          '  <table class="data-grid" style="margin-top:10px;">' +
          '    <thead><tr><th>IO Running</th><th>SQL Running</th><th>Source Host</th><th>Source Log File</th><th>Lag (Seconds)</th><th>Last Error</th></tr></thead>' +
          '    <tbody>' + replicasHtml + '</tbody>' +
          '  </table>' +
          '</div>' +
          '<div class="card">' +
          '  <div class="card-title">📜 Binary Log Files (SHOW BINARY LOGS)</div>' +
          '  <table class="data-grid" style="margin-top:10px;">' +
          '    <thead><tr><th>Log File Name</th><th>Size</th></tr></thead>' +
          '    <tbody>' + logsHtml + '</tbody>' +
          '  </table>' +
          '</div>' +
          '<div class="card">' +
          '  <div class="card-title">⚡ Master / Binary Log Coordinator Status</div>' +
          '  <div style="display:flex; gap:16px; margin-top:10px; flex-wrap:wrap;">' +
          '    <div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; flex:1; min-width:140px;">' +
          '      <div style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">Current Binlog File</div>' +
          '      <div style="font-size:14px; font-weight:800; color:var(--cyan);">' + (master?.File || master?.FILE || 'None (Disabled)') + '</div>' +
          '    </div>' +
          '    <div style="background:rgba(0,0,0,0.3); padding:12px; border-radius:6px; flex:1; min-width:140px;">' +
          '      <div style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">Binlog Position</div>' +
          '      <div style="font-size:14px; font-weight:800; color:var(--emerald);">' + (master?.Position || master?.POSITION || '0') + '</div>' +
          '    </div>' +
          '  </div>' +
          '</div>';
      }
    }

    // ---------------------------------------------------------------------------------------------
    // MySQL Live Process & Lock Contention Monitor
    // ---------------------------------------------------------------------------------------------
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
            '<span>⚠️ Active InnoDB Lock Contention Detected</span>' +
            '<span class="badge" style="background: rgba(239, 68, 68, 0.3); color: #f87171;">' + blockedLocks.length + ' Blocked Statement(s)</span>' +
            '</div>' +
            '<button class="btn btn-sm btn-danger" onclick="terminateAllBlockingProcesses()">⚡ Terminate All Blocking PIDs</button>' +
            '</div>' +
            '<table class="data-grid" style="margin-top: 6px;">' +
            '<thead><tr><th>Blocked PID</th><th>Blocked Query</th><th>Blocking PID</th><th>Blocking Query</th><th>Lock Type</th><th>Action</th></tr></thead>' +
            '<tbody>';
          blockedLocks.forEach(bl => {
            alertHtml += '<tr>' +
              '<td style="font-family: var(--font-mono); color: var(--rose); font-weight: 700;">' + bl.waitingPid + '</td>' +
              '<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono);">' + escapeHtml(bl.waitingQuery || '-') + '</td>' +
              '<td style="font-family: var(--font-mono); color: var(--amber); font-weight: 700;">' + bl.blockingPid + '</td>' +
              '<td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono);">' + escapeHtml(bl.blockingQuery || '-') + '</td>' +
              '<td><span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">EXCLUSIVE</span></td>' +
              '<td><button class="btn btn-sm btn-danger" onclick="terminateProcess(' + bl.blockingPid + ')">⚡ Kill ' + bl.blockingPid + '</button></td>' +
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
      const badge = document.getElementById("activityCountBadge");
      if (badge) badge.innerText = processes.length + " active";

      if (!tbody) return;
      if (!processes.length) {
        tbody.innerHTML = "<tr><td colspan='8' style='text-align: center; color: var(--text-dim); padding: 20px;'>No active processes</td></tr>";
        return;
      }

      tbody.innerHTML = processes.map(p => {
        const stateClass = p.state === "active" ? "state-active" : (p.state.includes("sleep") ? "state-idle" : "state-idle-txn");
        return '<tr>' +
          '<td style="font-family: var(--font-mono); color: var(--cyan);">' + p.pid + '</td>' +
          '<td>' + escapeHtml(p.user || 'root') + '</td>' +
          '<td>' + escapeHtml(p.database || '-') + '</td>' +
          '<td>' + escapeHtml(p.client || 'local') + '</td>' +
          '<td><span class="state-badge ' + stateClass + '">' + escapeHtml(p.state || 'sleep') + '</span></td>' +
          '<td style="font-family: var(--font-mono); color: var(--amber);">' + (p.duration || '0s') + '</td>' +
          '<td style="font-family: var(--font-mono); max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + escapeHtml(p.query || p.command || '-') + '</td>' +
          '<td style="text-align: center;">' +
          '<button class="btn btn-sm" onclick="terminateProcess(' + p.pid + ')" title="Terminate Connection (KILL PID)" style="color: var(--rose);">⚡ Kill</button>' +
          '</td></tr>';
      }).join('');
    }

    async function terminateAllBlockingProcesses() {
      const res = await apiRequest("/api/activity/locks");
      if (res && res.success && Array.isArray(res.blockedLocks) && res.blockedLocks.length > 0) {
        const pids = [...new Set(res.blockedLocks.map(bl => bl.blockingPid))];
        showToast("Terminating " + pids.length + " blocking process(es)...");
        for (const pid of pids) {
          await apiRequest("/api/activity/terminate", { pid });
        }
        showToast("✓ All blocking processes terminated!");
        loadActivity();
      } else {
        showToast("No blocking processes to terminate.");
      }
    }

    async function terminateProcess(pid) {
      if (!confirm("Terminate MySQL connection thread PID " + pid + "?")) return;
      const res = await apiRequest("/api/activity/terminate", { pid });
      if (res && res.success) {
        showToast("✓ Terminated PID: " + pid);
        loadActivity();
      } else {
        showToast("Error terminating PID: " + (res?.error || "Unknown"));
      }
    }

    function gridChangePage(delta) {
      gridPage = Math.max(1, gridPage + delta);
      fetchTableData();
    }

    function onGridSearch() {
      gridPage = 1;
      fetchTableData();
    }

    // ---------------------------------------------------------------------------------------------
    // SQL Query Execution
    // ---------------------------------------------------------------------------------------------
    async function runEditorQuery() {
      const sqlEl = document.getElementById("sqlEditor");
      let sql = sqlEl ? sqlEl.value.trim() : "";
      if (!sql && typeof buildDesignerSql === "function") {
        sql = buildDesignerSql();
        if (sqlEl) sqlEl.value = sql;
      }
      if (!sql) {
        showToast("Please enter a SQL query!");
        return;
      }

      document.getElementById("queryTiming").textContent = "Executing...";
      const res = await apiRequest('/api/query', { sql });

      if (res && res.success) {
        document.getElementById("queryTiming").textContent = \`Executed in \${res.latencyMs}ms\`;
        document.getElementById("kpiLatency").textContent = res.latencyMs + " ms";

        if (res.rowsAffected === undefined && res.rows) {
          currentGridRows = res.rows;
          currentGridColumns = res.columns || (res.rows.length > 0 ? Object.keys(res.rows[0]) : []);
          currentGridRawRows = [...currentGridRows];
          renderDataGrid(currentGridColumns, currentGridRows, true, res.rows.length);
          document.getElementById("gridTargetTitle").textContent = "Ad-Hoc Query Result";
          document.getElementById("gridPageInfo").textContent = \`\${res.rows.length} rows returned\`;
          document.getElementById("resultSummary").textContent = \`\${res.rows.length} rows (\${res.latencyMs}ms)\`;
          document.getElementById("jsonInspectorBox").textContent = JSON.stringify(res.rows, null, 2);
          switchTab("grid");
          logAudit(\`[QUERY OK] \${sql.replace(/\\n/g, ' ').slice(0, 100)} (\${res.latencyMs}ms, \${res.rows.length} rows)\`);
        } else {
          showToast(\`Statement executed (\${res.rowsAffected ?? 0} rows affected)\`);
          document.getElementById("resultSummary").textContent = \`Rows affected: \${res.rowsAffected ?? 0}\`;
          logAudit(\`[MUTATION OK] \${sql.replace(/\\n/g, ' ').slice(0, 100)} (\${res.latencyMs}ms)\`);
          await refreshAll();
        }
      } else {
        document.getElementById("queryTiming").textContent = "Execution Error";
        showToast("SQL Error: " + (res?.error || "Unknown"));
        logAudit(\`[ERROR] \${res?.error || "Execution failed"}\`);
      }
    }

    const runExplainPlan = explainCurrentQuery;
    const executeCurrentQuery = runEditorQuery;
    window.runExplainPlan = explainCurrentQuery;
    window.executeCurrentQuery = runEditorQuery;

    async function explainCurrentQuery() {
      const sqlEl = document.getElementById("sqlEditor");
      let sql = sqlEl ? sqlEl.value.trim() : "";
      if (!sql && typeof buildDesignerSql === "function") {
        sql = buildDesignerSql();
        if (sqlEl) sqlEl.value = sql;
      }
      if (!sql) {
        showToast("Enter a query to explain!");
        return;
      }

      showToast("Generating query execution plan...");
      const res = await apiRequest('/api/explain', { sql });
      if (res && res.success && res.queryPlan) {
        renderExplainPlan(res.queryPlan, sql, res.rawText);
        switchTab("explain");
        showToast("Query plan generated!");
      } else {
        showToast("Explain failed: " + (res?.error || "Unknown"));
      }
    }

    function renderExplainPlan(planNodes, sql, rawText) {
      const container = document.getElementById("explainContainer");
      if (!container) return;
      container.innerHTML = "";

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = \`
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div class="card-title" style="margin-bottom: 0;">🔍 MySQL Query Execution Plan (EXPLAIN FORMAT=TREE / ANALYZE)</div>
          <button class="btn btn-sm" onclick="explainCurrentQuery()">Re-run Explain</button>
        </div>
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--cyan); margin-bottom: 12px; background: rgba(0,0,0,0.25); padding: 8px 10px; border-radius: 4px; border: 1px solid var(--border-subtle); overflow-x: auto;">\${escapeHtml(sql)}</div>
      \`;

      const list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "6px";

      planNodes.forEach(node => {
        const item = document.createElement("div");
        const indentPx = (node.depth || 0) * 18;
        item.style.marginLeft = indentPx + "px";
        item.style.padding = "8px 12px";
        item.style.borderRadius = "6px";
        item.style.background = node.isScan 
          ? "rgba(244, 63, 94, 0.12)" 
          : (node.isIndex ? "rgba(16, 185, 129, 0.1)" : "rgba(56, 189, 248, 0.08)");
        item.style.border = node.isScan 
          ? "1px solid var(--rose)" 
          : (node.isIndex ? "1px solid rgba(16, 185, 129, 0.4)" : "1px solid var(--border-subtle)");
        item.style.fontFamily = "var(--font-mono)";
        item.style.fontSize = "11px";

        let badge = '<span style="color: var(--cyan); font-weight: 700;">🔗 EXECUTION NODE</span>';
        if (node.isScan) {
          badge = '<span style="color: var(--rose); font-weight: 700;">⚠️ SCAN TABLE (FULL SCAN)</span>';
        } else if (node.isIndex) {
          badge = '<span style="color: var(--emerald); font-weight: 700;">⚡ INDEX SEARCH / LOOKUP</span>';
        }

        const metrics = [];
        if (node.cost !== undefined) metrics.push("Cost: " + node.cost);
        if (node.rows !== undefined) metrics.push("Est. Rows: " + node.rows);
        if (node.actualTime) metrics.push("Actual: " + node.actualTime);
        const metricStr = metrics.length ? " | " + metrics.join(" | ") : "";

        item.innerHTML = \`
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            \${badge}
            <span style="font-size: 10px; color: var(--text-dim);">Node #\${node.id}\${node.parent ? " (Parent: #" + node.parent + ")" : " (Root)"}</span>
          </div>
          <div style="color: var(--text-main); font-weight: 500;">\${escapeHtml(node.detail)}\${escapeHtml(metricStr)}</div>
        \`;
        list.appendChild(item);
      });

      card.appendChild(list);

      if (rawText) {
        const rawCard = document.createElement("div");
        rawCard.style.marginTop = "16px";
        rawCard.innerHTML = \`
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">Raw Tree Output</span>
            <button class="btn btn-sm" onclick="copyRawExplainText()" style="padding: 2px 8px; font-size: 10px;">📋 Copy Text</button>
          </div>
          <pre id="rawExplainOutput" style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 12px; font-family: var(--font-mono); font-size: 11px; color: var(--text-dim); overflow-x: auto; white-space: pre-wrap; margin: 0;">\${escapeHtml(rawText)}</pre>
        \`;
        card.appendChild(rawCard);
      }

      container.appendChild(card);
    }

    function copyRawExplainText() {
      const el = document.getElementById("rawExplainOutput");
      if (el && navigator.clipboard) {
        navigator.clipboard.writeText(el.innerText);
        showToast("✓ Copied raw execution plan to clipboard");
      }
    }

    function renderSchemaDesigner(tableName) {
      const container = document.getElementById("schemaContainer");
      if (!container || !currentSchema) return;
      container.innerHTML = "";

      const meta = currentSchema.tables.find(t => t.name === tableName) || currentSchema.views.find(v => v.name === tableName);
      if (!meta) return;

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = \`
        <div class="card-title">🏛️ Table Schema: \${escapeHtml(meta.name)} (\${(meta.rowCount || 0).toLocaleString()} records)</div>
        <table class="data-grid" style="margin-top: 8px;">
          <thead>
            <tr>
              <th>#</th><th>Column Name</th><th>Data Type</th><th>Primary Key</th><th>Not Null</th><th>Default</th>
            </tr>
          </thead>
          <tbody>
            \${meta.columns.map(c => \`
              <tr>
                <td>\${c.cid}</td>
                <td style="color: var(--cyan); font-weight: 600;">\${escapeHtml(c.name)}</td>
                <td>\${escapeHtml(c.type)}</td>
                <td>\${c.pk ? '🔑 YES' : '-'}</td>
                <td>\${c.notnull ? 'YES' : 'NULLABLE'}</td>
                <td>\${c.dflt_value !== null && c.dflt_value !== undefined ? escapeHtml(c.dflt_value) : '-'}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;

      const ddlCard = document.createElement("div");
      ddlCard.className = "card";
      ddlCard.innerHTML = \`
        <div class="card-title">DDL Definition (SQL)</div>
        <div class="code-box" style="height: 120px;">\${escapeHtml(meta.sql || 'N/A')}</div>
      \`;

      container.appendChild(card);
      container.appendChild(ddlCard);
    }

    function escapeHtml(value) {
      if (value === null || value === undefined) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function quoteSqlIdentifier(value) {
      return "\`" + String(value).replace(/\`/g, "\`\`") + "\`";
    }

    function formatAccessCriterion(qualifiedField, criterionStr) {
      if (!criterionStr || !String(criterionStr).trim()) return "";
      const trimmed = String(criterionStr).trim();
      // Disallow semicolons and SQL comment markers to prevent statement injection
      if (trimmed.includes(";") || trimmed.includes("--") || trimmed.includes("/*")) {
        return qualifiedField + " = '" + trimmed.replace(/'/g, "''") + "'";
      }
      if (/^(=|<>|!=|>|<|>=|<=|LIKE|NOT LIKE|IN|NOT IN|BETWEEN|IS NULL|IS NOT NULL)/i.test(trimmed)) {
        return qualifiedField + " " + trimmed;
      }
      if (/^['"].*['"]$/.test(trimmed)) {
        return qualifiedField + " = " + trimmed;
      }
      if (!isNaN(Number(trimmed)) && trimmed !== "") {
        return qualifiedField + " = " + trimmed;
      }
      return qualifiedField + " = '" + trimmed.replace(/'/g, "''") + "'";
    }

    function getSingularCandidate(tableName) {
      if (!tableName) return "";
      const lower = tableName.toLowerCase();
      if (lower.endsWith("ies")) return lower.slice(0, -3) + "y";
      if (lower.endsWith("es")) return lower.slice(0, -2);
      if (lower.endsWith("s")) return lower.slice(0, -1);
      return lower;
    }

    function getEntityMeta(name) {
      if (!currentSchema) return null;
      return (currentSchema.tables || []).find(t => t.name === name) || (currentSchema.views || []).find(v => v.name === name) || null;
    }

    function findAllDesignerJoins(leftTableName, rightTableName) {
      if (!currentSchema || !leftTableName || !rightTableName || leftTableName === rightTableName) return [];
      const leftMeta = getEntityMeta(leftTableName);
      const rightMeta = getEntityMeta(rightTableName);
      if (!leftMeta || !rightMeta) return [];

      const results = [];
      const seen = new Set();
      function addCandidate(lT, lF, rT, rF, type, conf) {
        const id = lT + "." + lF + "<->" + rT + "." + rF;
        const revId = rT + "." + rF + "<->" + lT + "." + lF;
        if (seen.has(id) || seen.has(revId)) return;
        seen.add(id);
        seen.add(revId);
        results.push({
          leftTable: lT,
          leftField: lF,
          rightTable: rT,
          rightField: rF,
          type: type || "INNER",
          confidence: conf || 50,
        });
      }

      // 1. Explicit foreign key from leftMeta to rightMeta
      (leftMeta.foreignKeys || []).forEach(fk => {
        if (fk.table === rightTableName) {
          addCandidate(leftTableName, fk.from, rightTableName, fk.to || "id", "INNER", 100);
        }
      });

      // 2. Reverse foreign key from rightMeta to leftMeta
      (rightMeta.foreignKeys || []).forEach(fk => {
        if (fk.table === leftTableName) {
          addCandidate(leftTableName, fk.to || "id", rightTableName, fk.from, "INNER", 100);
        }
      });

      // 3. Conventional naming: leftTable has singular(rightTable)_id or rightTable_id column
      const rightSingular = getSingularCandidate(rightTableName).toLowerCase();
      const rightLower = rightTableName.toLowerCase();
      (leftMeta.columns || []).forEach(c => {
        const colLower = c.name.toLowerCase();
        if (colLower === (rightSingular + "_id") || colLower === (rightLower + "_id") || colLower === (rightSingular + "id")) {
          const targetPk = (rightMeta.columns || []).find(rc => rc.pk)?.name || "id";
          addCandidate(leftTableName, c.name, rightTableName, targetPk, "INNER", 90);
        }
      });

      // Conventional naming: rightTable has singular(leftTable)_id or leftTable_id column
      const leftSingular = getSingularCandidate(leftTableName).toLowerCase();
      const leftLower = leftTableName.toLowerCase();
      (rightMeta.columns || []).forEach(c => {
        const colLower = c.name.toLowerCase();
        if (colLower === (leftSingular + "_id") || colLower === (leftLower + "_id") || colLower === (leftSingular + "id")) {
          const targetPk = (leftMeta.columns || []).find(lc => lc.pk)?.name || "id";
          addCandidate(leftTableName, targetPk, rightTableName, c.name, "INNER", 90);
        }
      });

      // 4. Domain specific matching keys (excluding generic 'id' and standard audit fields)
      const leftFields = (leftMeta.columns || []).map(c => c.name);
      const rightFieldNames = new Set((rightMeta.columns || []).map(c => c.name));
      const ignoredCols = new Set(["id", "created_at", "updated_at", "deleted_at", "status", "active", "type", "description", "name", "notes", "data", "metadata"]);
      leftFields.forEach(c => {
        const lower = c.toLowerCase();
        if (rightFieldNames.has(c) && !ignoredCols.has(lower) && (lower.endsWith("_id") || lower.endsWith("_code") || lower.endsWith("_no") || lower.endsWith("_num") || lower.endsWith("_key"))) {
          addCandidate(leftTableName, c, rightTableName, c, "INNER", 80);
        }
      });

      return results.sort((a, b) => b.confidence - a.confidence);
    }

    function suggestDesignerJoin(leftTableName, rightTableName) {
      const all = findAllDesignerJoins(leftTableName, rightTableName);
      if (all && all.length > 0) return all[0];
      if (!currentSchema) return null;
      const leftMeta = getEntityMeta(leftTableName);
      const rightMeta = getEntityMeta(rightTableName);
      if (!leftMeta || !rightMeta) return null;
      const lf = (leftMeta.columns && leftMeta.columns[0]) ? leftMeta.columns[0].name : "id";
      const rf = (rightMeta.columns && rightMeta.columns[0]) ? rightMeta.columns[0].name : "id";
      return {
        leftTable: leftTableName,
        rightTable: rightTableName,
        leftField: lf,
        rightField: rf,
        type: "INNER",
        confidence: 10,
      };
    }

    function buildDesignerJoinPairs() {
      if (!currentSchema || !queryDesignerState.selectedTables || !queryDesignerState.selectedTables.length) return [];
      const tables = queryDesignerState.selectedTables;
      if (tables.length === 1) return [];

      // 1. Collect all pairwise relationship candidates with confidence scores
      const candidateEdges = [];
      for (let i = 0; i < tables.length; i++) {
        for (let j = i + 1; j < tables.length; j++) {
          const t1 = tables[i];
          const t2 = tables[j];
          const sugg = suggestDesignerJoin(t1, t2);
          if (sugg) {
            candidateEdges.push({
              key: t1 + "." + sugg.leftField + "->" + t2 + "." + sugg.rightField,
              leftTable: sugg.leftTable,
              leftField: sugg.leftField,
              rightTable: sugg.rightTable,
              rightField: sugg.rightField,
              type: sugg.type || "INNER",
              confidence: sugg.confidence || 50,
            });
          }
        }
      }

      // 2. Minimum Spanning Tree (Prim's Algorithm) starting from the primary table
      const connected = new Set([tables[0]]);
      const unvisited = new Set(tables.slice(1));
      const treeEdges = [];

      while (unvisited.size > 0) {
        let bestEdge = null;
        let highestConfidence = -1;

        for (const edge of candidateEdges) {
          const leftIn = connected.has(edge.leftTable);
          const rightIn = connected.has(edge.rightTable);
          if ((leftIn && !rightIn && unvisited.has(edge.rightTable)) ||
              (rightIn && !leftIn && unvisited.has(edge.leftTable))) {
            if (edge.confidence > highestConfidence) {
              highestConfidence = edge.confidence;
              bestEdge = edge;
            }
          }
        }

        if (bestEdge) {
          treeEdges.push(bestEdge);
          connected.add(bestEdge.leftTable);
          connected.add(bestEdge.rightTable);
          unvisited.delete(bestEdge.leftTable);
          unvisited.delete(bestEdge.rightTable);
        } else {
          // If a table is truly an isolated island, connect it to tables[0] via fallback
          const island = unvisited.values().next().value;
          const fallback = suggestDesignerJoin(tables[0], island) || {
            leftTable: tables[0],
            rightTable: island,
            leftField: "id",
            rightField: "id",
            type: "INNER",
          };
          treeEdges.push({
            key: tables[0] + "." + fallback.leftField + "->" + island + "." + fallback.rightField,
            leftTable: fallback.leftTable,
            leftField: fallback.leftField,
            rightTable: fallback.rightTable,
            rightField: fallback.rightField,
            type: fallback.type || "INNER",
            confidence: 10,
          });
          connected.add(island);
          unvisited.delete(island);
        }
      }

      return treeEdges;
    }

    function ensureQueryDesignerState() {
      if (!currentSchema || !currentSchema.tables || !currentSchema.tables.length) {
        queryDesignerState.selectedTables = [];
        queryDesignerState.joins = [];
        queryDesignerState.columns = [];
        return;
      }

      const tableNames = [
        ...(currentSchema.tables || []).map(t => t.name),
        ...(currentSchema.views || []).map(v => v.name)
      ];
      const selectedTables = (queryDesignerState.selectedTables || []).filter(name => tableNames.includes(name));
      if (!selectedTables.length) {
        selectedTables.push(tableNames[0] || (currentSchema.tables[0] && currentSchema.tables[0].name));
      }
      queryDesignerState.selectedTables = selectedTables;

      if (queryDesignerState.joins === undefined || queryDesignerState.joins === null) {
        queryDesignerState.joins = buildDesignerJoinPairs();
      } else {
        queryDesignerState.joins = queryDesignerState.joins.filter(j => selectedTables.includes(j.leftTable) && selectedTables.includes(j.rightTable));
      }

      if (!Array.isArray(queryDesignerState.columns)) {
        queryDesignerState.columns = [];
      }

      queryDesignerState.columns = queryDesignerState.columns.filter(col => selectedTables.includes(col.table));

      if (!queryDesignerState.columns.length && selectedTables.length > 0) {
        const primary = selectedTables[0];
        const meta = getEntityMeta(primary);
        if (meta && meta.columns) {
          meta.columns.slice(0, Math.min(5, meta.columns.length)).forEach(c => {
            queryDesignerState.columns.push({
              id: "col-" + Math.random().toString(16).slice(2),
              table: primary,
              field: c.name,
              alias: "",
              total: queryDesignerState.showTotals ? "GroupBy" : "None",
              sort: "",
              show: true,
              criteria: "",
              or1: "",
              or2: "",
            });
          });
        }
      }

      if (!queryDesignerState.savedQueries) {
        queryDesignerState.savedQueries = [];
      }
      if (!queryDesignerState.tablePositions) {
        queryDesignerState.tablePositions = {};
      }
      (selectedTables || []).forEach((t, i) => {
        if (!queryDesignerState.tablePositions[t]) {
          queryDesignerState.tablePositions[t] = {
            x: 20 + i * 270,
            y: 15,
          };
        }
      });
    }

    function setDesignerActiveView(view) {
      queryDesignerState.activeView = view;
      if (view === "datasheet" && (!queryDesignerState.datasheet || queryDesignerState.datasheetLoading)) {
        runDesignerQuery();
      } else {
        renderQueryDesigner();
      }
    }

    function toggleDesignerTotals() {
      queryDesignerState.showTotals = !queryDesignerState.showTotals;
      (queryDesignerState.columns || []).forEach(col => {
        if (queryDesignerState.showTotals) {
          if (!col.total || col.total === "None") col.total = "GroupBy";
        } else {
          col.total = "None";
        }
      });
      renderQueryDesigner();
    }

    function toggleDesignerDistinct() {
      queryDesignerState.distinct = !queryDesignerState.distinct;
      renderQueryDesigner();
    }

    function setDesignerTopLimit(limit) {
      queryDesignerState.topLimit = Number(limit) || 0;
      renderQueryDesigner();
    }

    function addDesignerTableFromPicker() {
      const picker = document.getElementById("designerTablePicker");
      if (picker && picker.value) {
        addDesignerTable(picker.value);
        picker.value = "";
      }
    }

    function addDesignerTable(tableName) {
      if (!tableName || queryDesignerState.selectedTables.includes(tableName)) return;
      queryDesignerState.selectedTables.push(tableName);
      if (!queryDesignerState.joins) queryDesignerState.joins = [];

      // Auto-detect join relationships between the newly added table and ALL tables already in query
      const existingTables = queryDesignerState.selectedTables.filter(t => t !== tableName);
      const addedJoins = [];

      for (const target of existingTables) {
        const found = findAllDesignerJoins(target, tableName);
        for (const rel of found) {
          const alreadyExists = queryDesignerState.joins.some(j =>
            (j.leftTable === rel.leftTable && j.rightTable === rel.rightTable && j.leftField === rel.leftField && j.rightField === rel.rightField) ||
            (j.leftTable === rel.rightTable && j.rightTable === rel.leftTable && j.leftField === rel.rightField && j.rightField === rel.leftField)
          );
          if (!alreadyExists) {
            const newJoin = {
              key: rel.leftTable + "." + rel.leftField + "->" + rel.rightTable + "." + rel.rightField + "-" + Date.now() + Math.random().toString(16).slice(2, 6),
              ...rel,
            };
            queryDesignerState.joins.push(newJoin);
            addedJoins.push(newJoin);
          }
        }
      }

      // Assign position on 2D visual canvas
      if (!queryDesignerState.tablePositions) queryDesignerState.tablePositions = {};
      const count = queryDesignerState.selectedTables.length - 1;
      queryDesignerState.tablePositions[tableName] = {
        x: 20 + (count % 4) * 280,
        y: 15 + Math.floor(count / 4) * 240,
      };

      renderQueryDesigner();
      if (addedJoins.length > 0) {
        showToast("Added table '" + tableName + "' (auto-connected " + addedJoins.length + " relationship" + (addedJoins.length > 1 ? "s" : "") + ")");
      } else {
        showToast("Added table '" + tableName + "' to visual canvas");
      }
    }

    function removeDesignerTable(tableName) {
      queryDesignerState.selectedTables = queryDesignerState.selectedTables.filter(t => t !== tableName);
      queryDesignerState.joins = (queryDesignerState.joins || []).filter(j => j.leftTable !== tableName && j.rightTable !== tableName);
      queryDesignerState.columns = (queryDesignerState.columns || []).filter(col => col.table !== tableName);
      renderQueryDesigner();
    }

    function autoJoinDesignerTables() {
      if (!currentSchema || !queryDesignerState.selectedTables || queryDesignerState.selectedTables.length < 2) {
        showToast("Add 2 or more tables to auto-detect joins");
        return;
      }
      const tables = queryDesignerState.selectedTables;
      let newCount = 0;
      if (!queryDesignerState.joins) queryDesignerState.joins = [];

      for (let i = 0; i < tables.length; i++) {
        for (let j = i + 1; j < tables.length; j++) {
          const t1 = tables[i];
          const t2 = tables[j];
          const rels = findAllDesignerJoins(t1, t2);
          for (const rel of rels) {
            const alreadyExists = queryDesignerState.joins.some(j =>
              (j.leftTable === rel.leftTable && j.rightTable === rel.rightTable && j.leftField === rel.leftField && j.rightField === rel.rightField) ||
              (j.leftTable === rel.rightTable && j.rightTable === rel.leftTable && j.leftField === rel.rightField && j.rightField === rel.leftField)
            );
            if (!alreadyExists) {
              queryDesignerState.joins.push({
                key: rel.leftTable + "." + rel.leftField + "->" + rel.rightTable + "." + rel.rightField + "-" + Date.now() + Math.random().toString(16).slice(2, 6),
                ...rel,
              });
              newCount++;
            }
          }
        }
      }

      // If still no joins and multiple tables, provide minimum spanning tree connection
      if (queryDesignerState.joins.length === 0 && tables.length > 1) {
        queryDesignerState.joins = buildDesignerJoinPairs();
        newCount = queryDesignerState.joins.length;
      }

      renderQueryDesigner();
      if (newCount > 0) {
        showToast("⚡ Auto-detected & linked " + newCount + " relationship" + (newCount > 1 ? "s" : "") + " across " + tables.length + " tables");
      } else {
        showToast("All schema relationships across " + tables.length + " tables are already linked (" + queryDesignerState.joins.length + " active joins)");
      }
    }

    let currentEditingJoinKey = null;
    let activeDraggingTable = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let cardStartLeft = 0;
    let cardStartTop = 0;

    function openJoinPropertiesModal(joinKey, preferredLeft, preferredRight, preferredLeftField, preferredRightField) {
      const modal = document.getElementById("accessJoinPropertiesModal");
      if (!modal) return;
      ensureQueryDesignerState();

      const selectedTables = queryDesignerState.selectedTables || [];
      if (selectedTables.length < 2) {
        showToast("Add at least 2 tables to the Query Designer first");
        return;
      }

      currentEditingJoinKey = joinKey || null;
      let leftTable = preferredLeft || selectedTables[0];
      let rightTable = preferredRight || selectedTables[1] || selectedTables[0];
      let leftField = preferredLeftField || "";
      let rightField = preferredRightField || "";
      let joinType = "INNER";

      if (currentEditingJoinKey) {
        const existing = (queryDesignerState.joins || []).find(j => j.key === currentEditingJoinKey);
        if (existing) {
          leftTable = existing.leftTable;
          rightTable = existing.rightTable;
          leftField = existing.leftField;
          rightField = existing.rightField;
          joinType = (existing.type || "INNER").toUpperCase();
        }
      }

      const leftSelect = document.getElementById("jpLeftTable");
      const rightSelect = document.getElementById("jpRightTable");
      if (leftSelect && rightSelect) {
        leftSelect.innerHTML = selectedTables.map(t => \`<option value="\${escapeHtml(t)}" \${t === leftTable ? 'selected' : ''}>\${escapeHtml(t)}</option>\`).join('');
        rightSelect.innerHTML = selectedTables.map(t => \`<option value="\${escapeHtml(t)}" \${t === rightTable ? 'selected' : ''}>\${escapeHtml(t)}</option>\`).join('');
      }

      onJoinPropTableChange("left", leftField);
      onJoinPropTableChange("right", rightField);

      selectJoinPropType(joinType);

      const delBtn = document.getElementById("btnDeleteJoinProp");
      if (delBtn) delBtn.style.display = currentEditingJoinKey ? "inline-flex" : "none";

      modal.classList.add("open");
    }

    function closeJoinPropertiesModal() {
      const modal = document.getElementById("accessJoinPropertiesModal");
      if (modal) modal.classList.remove("open");
      currentEditingJoinKey = null;
    }

    function onJoinPropTableChange(side, defaultField) {
      const tableSelect = document.getElementById(side === "left" ? "jpLeftTable" : "jpRightTable");
      const fieldSelect = document.getElementById(side === "left" ? "jpLeftField" : "jpRightField");
      if (!tableSelect || !fieldSelect) return;

      const tableName = tableSelect.value;
      const meta = getEntityMeta(tableName);
      const cols = meta && meta.columns ? meta.columns.map(c => c.name) : ["id"];

      let selectedCol = defaultField && cols.includes(defaultField) ? defaultField : "";
      if (!selectedCol) {
        const pkCol = meta && meta.columns ? meta.columns.find(c => c.pk) : null;
        selectedCol = pkCol ? pkCol.name : cols[0];
      }

      fieldSelect.innerHTML = cols.map(c => \`<option value="\${escapeHtml(c)}" \${c === selectedCol ? 'selected' : ''}>\${escapeHtml(c)}</option>\`).join('');

      updateJoinPropLabels();
      updateJoinPropVennDiagram(getSelectedJoinPropType(), document.getElementById("jpLeftTable")?.value || "Left", document.getElementById("jpRightTable")?.value || "Right");
      updateJoinPropPreview();
    }

    function updateJoinPropLabels() {
      const lt = document.getElementById("jpLeftTable")?.value || "Left";
      const rt = document.getElementById("jpRightTable")?.value || "Right";
      document.querySelectorAll(".jp-left-name").forEach(el => el.textContent = lt);
      document.querySelectorAll(".jp-right-name").forEach(el => el.textContent = rt);
    }

    function swapJoinPropDirection() {
      const leftTableSel = document.getElementById("jpLeftTable");
      const rightTableSel = document.getElementById("jpRightTable");
      const leftFieldSel = document.getElementById("jpLeftField");
      const rightFieldSel = document.getElementById("jpRightField");
      if (!leftTableSel || !rightTableSel || !leftFieldSel || !rightFieldSel) return;

      const oldLT = leftTableSel.value;
      const oldRT = rightTableSel.value;
      const oldLF = leftFieldSel.value;
      const oldRF = rightFieldSel.value;

      leftTableSel.value = oldRT;
      rightTableSel.value = oldLT;

      onJoinPropTableChange("left", oldRF);
      onJoinPropTableChange("right", oldLF);

      const curType = getSelectedJoinPropType();
      if (curType === "LEFT") selectJoinPropType("RIGHT");
      else if (curType === "RIGHT") selectJoinPropType("LEFT");
      else selectJoinPropType(curType);
    }

    function getSelectedJoinPropType() {
      const radio = document.querySelector('input[name="accessJoinType"]:checked');
      return radio ? radio.value.toUpperCase() : "INNER";
    }

    function selectJoinPropType(type) {
      const t = (type || "INNER").toUpperCase();
      const radio = document.querySelector(\`input[name="accessJoinType"][value="\${t}"]\`);
      if (radio) radio.checked = true;

      document.querySelectorAll(".access-join-radio-card").forEach(c => c.classList.remove("selected"));
      const card = document.getElementById("cardJp" + (t === "FULL" ? "Full" : (t.charAt(0) + t.slice(1).toLowerCase())));
      if (card) card.classList.add("selected");

      const lt = document.getElementById("jpLeftTable")?.value || "Left";
      const rt = document.getElementById("jpRightTable")?.value || "Right";
      updateJoinPropVennDiagram(t, lt, rt);
      updateJoinPropPreview();
    }

    function onJoinPropTypeChange(type) {
      selectJoinPropType(type);
    }

    function updateJoinPropVennDiagram(type, leftName, rightName) {
      const svg = document.getElementById("jpVennSvg");
      const badge = document.getElementById("jpVennBadge");
      if (!svg) return;

      const t = (type || "INNER").toUpperCase();
      const truncL = leftName.length > 9 ? leftName.slice(0, 8) + "…" : leftName;
      const truncR = rightName.length > 9 ? rightName.slice(0, 8) + "…" : rightName;

      let leftFill = "rgba(255,255,255,0.06)";
      let rightFill = "rgba(255,255,255,0.06)";
      let lensFill = "rgba(255,255,255,0.06)";
      let badgeText = "INNER JOIN (Matching records)";
      let badgeColor = "var(--cyan)";

      if (t === "INNER") {
        lensFill = "#38bdf8";
        badgeText = "INNER JOIN (=)";
        badgeColor = "#38bdf8";
      } else if (t === "LEFT") {
        leftFill = "#10b981";
        lensFill = "#10b981";
        badgeText = "LEFT OUTER (All " + truncL + ")";
        badgeColor = "#10b981";
      } else if (t === "RIGHT") {
        rightFill = "#f59e0b";
        lensFill = "#f59e0b";
        badgeText = "RIGHT OUTER (All " + truncR + ")";
        badgeColor = "#f59e0b";
      } else if (t === "FULL" || t === "FULL OUTER") {
        leftFill = "#a855f7";
        lensFill = "#a855f7";
        rightFill = "#a855f7";
        badgeText = "FULL OUTER (All from Both)";
        badgeColor = "#a855f7";
      } else if (t === "CROSS") {
        leftFill = "#ec4899";
        lensFill = "#ec4899";
        rightFill = "#ec4899";
        badgeText = "CROSS JOIN (Cartesian product)";
        badgeColor = "#ec4899";
      }

      if (badge) {
        badge.textContent = badgeText;
        badge.style.color = badgeColor;
      }

      svg.innerHTML = \`
        <rect x="0" y="0" width="160" height="90" fill="none" />
        <!-- Left Crescent -->
        <path d="M 80,25 A 32 32 0 0 1 80,65 A 32 32 0 1 1 80,25 Z" fill="\${leftFill}" fill-opacity="0.8" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
        <!-- Right Crescent -->
        <path d="M 80,25 A 32 32 0 0 0 80,65 A 32 32 0 1 0 80,25 Z" fill="\${rightFill}" fill-opacity="0.8" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
        <!-- Intersection Lens -->
        <path d="M 80,25 A 32 32 0 0 1 80,65 A 32 32 0 0 1 80,25 Z" fill="\${lensFill}" fill-opacity="0.9" stroke="\${badgeColor}" stroke-width="2" />
        <!-- Table Labels -->
        <text x="48" y="14" fill="#94a3b8" font-size="9" font-weight="700" text-anchor="middle" font-family="sans-serif">\${escapeHtml(truncL)}</text>
        <text x="112" y="14" fill="#94a3b8" font-size="9" font-weight="700" text-anchor="middle" font-family="sans-serif">\${escapeHtml(truncR)}</text>
      \`;
    }

    function updateJoinPropPreview() {
      const box = document.getElementById("jpSqlSnippet");
      if (!box) return;
      const lt = document.getElementById("jpLeftTable")?.value || "left_table";
      const rt = document.getElementById("jpRightTable")?.value || "right_table";
      const lf = document.getElementById("jpLeftField")?.value || "id";
      const rf = document.getElementById("jpRightField")?.value || "id";
      const type = getSelectedJoinPropType();

      let sql = "";
      if (type === "CROSS") {
        sql = "FROM " + quoteSqlIdentifier(lt) + " CROSS JOIN " + quoteSqlIdentifier(rt);
      } else {
        const effType = (type === "FULL" || type === "FULL OUTER") ? "LEFT" : type;
        sql = "FROM " + quoteSqlIdentifier(lt) + " " + effType + " JOIN " + quoteSqlIdentifier(rt) + "\\n  ON " + quoteSqlIdentifier(lt) + "." + quoteSqlIdentifier(lf) + " = " + quoteSqlIdentifier(rt) + "." + quoteSqlIdentifier(rf);
      }
      box.textContent = sql;
    }

    function saveJoinProperties() {
      const lt = document.getElementById("jpLeftTable")?.value;
      const rt = document.getElementById("jpRightTable")?.value;
      const lf = document.getElementById("jpLeftField")?.value;
      const rf = document.getElementById("jpRightField")?.value;
      const type = getSelectedJoinPropType();

      if (!lt || !rt || !lf || !rf) {
        showToast("Select tables and fields for both sides");
        return;
      }
      if (lt === rt && lf === rf) {
        showToast("Cannot join a field to itself");
        return;
      }

      if (!queryDesignerState.joins) queryDesignerState.joins = [];

      if (currentEditingJoinKey) {
        const idx = queryDesignerState.joins.findIndex(j => j.key === currentEditingJoinKey);
        if (idx !== -1) {
          queryDesignerState.joins[idx] = {
            key: lt + "." + lf + "->" + rt + "." + rf + "-" + Date.now(),
            leftTable: lt,
            leftField: lf,
            rightTable: rt,
            rightField: rf,
            type: type,
          };
        }
      } else {
        queryDesignerState.joins.push({
          key: lt + "." + lf + "->" + rt + "." + rf + "-" + Date.now(),
          leftTable: lt,
          leftField: lf,
          rightTable: rt,
          rightField: rf,
          type: type,
        });
      }

      closeJoinPropertiesModal();
      renderQueryDesigner();
      showToast("Updated relationship: " + lt + " ↔ " + rt + " (" + type + " JOIN)");
    }

    function deleteCurrentJoinFromProperties() {
      if (!currentEditingJoinKey) {
        closeJoinPropertiesModal();
        return;
      }
      queryDesignerState.joins = (queryDesignerState.joins || []).filter(j => j.key !== currentEditingJoinKey);
      closeJoinPropertiesModal();
      renderQueryDesigner();
      showToast("Deleted relationship");
    }

    function onDesignerFieldDragStart(e, table, field) {
      if (e.dataTransfer) {
        e.dataTransfer.setData("text/plain", JSON.stringify({ table, field }));
        e.dataTransfer.effectAllowed = "link";
      }
    }

    function onDesignerFieldDragOver(e) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "link";
      }
    }

    function onDesignerFieldDragEnter(e, table, field) {
      e.preventDefault();
      const el = document.getElementById("qbeFieldRow_" + table + "_" + field);
      if (el) el.classList.add("qbe-field-drop-target");
    }

    function onDesignerFieldDragLeave(e) {
      const el = e.currentTarget;
      if (el) el.classList.remove("qbe-field-drop-target");
    }

    function onDesignerFieldDrop(e, targetTable, targetField) {
      e.preventDefault();
      const targetEl = document.getElementById("qbeFieldRow_" + targetTable + "_" + targetField);
      if (targetEl) targetEl.classList.remove("qbe-field-drop-target");

      try {
        const raw = e.dataTransfer.getData("text/plain");
        if (!raw) return;
        const source = JSON.parse(raw);
        if (!source || !source.table || !source.field) return;

        if (source.table === targetTable) {
          showToast("Cannot create relationship within the same table");
          return;
        }

        openJoinPropertiesModal(null, source.table, targetTable, source.field, targetField);
      } catch (err) {
        console.error("Drop relationship error:", err);
      }
    }

    function onDesignerTableHeaderMouseDown(e, tableName) {
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) return;
      e.preventDefault();
      activeDraggingTable = tableName;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      if (!queryDesignerState.tablePositions) queryDesignerState.tablePositions = {};
      const pos = queryDesignerState.tablePositions[tableName] || { x: 20, y: 15 };
      cardStartLeft = pos.x;
      cardStartTop = pos.y;

      const card = document.getElementById("qbeTableCard_" + tableName);
      if (card) card.classList.add("dragging");

      function onMouseMove(ev) {
        if (!activeDraggingTable) return;
        const zoom = queryDesignerState.canvasZoom || 1.0;
        const dx = (ev.clientX - dragStartX) / zoom;
        const dy = (ev.clientY - dragStartY) / zoom;
        const newX = Math.max(10, cardStartLeft + dx);
        const newY = Math.max(10, cardStartTop + dy);
        queryDesignerState.tablePositions[activeDraggingTable] = { x: newX, y: newY };
        const c = document.getElementById("qbeTableCard_" + activeDraggingTable);
        if (c) {
          c.style.left = newX + "px";
          c.style.top = newY + "px";
        }
        updateCanvasSvg();
      }

      function onMouseUp() {
        if (activeDraggingTable) {
          const c = document.getElementById("qbeTableCard_" + activeDraggingTable);
          if (c) {
            c.classList.remove("dragging");
          }
          activeDraggingTable = null;
        }
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        updateCanvasSvg();
      }

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }

    function autoArrangeDesignerTables() {
      ensureQueryDesignerState();
      queryDesignerState.tablePositions = {};
      (queryDesignerState.selectedTables || []).forEach((t, i) => {
        queryDesignerState.tablePositions[t] = {
          x: 20 + i * 270,
          y: 15,
        };
      });
      renderQueryDesigner();
      showToast("Arranged tables across relationship canvas");
    }

    function setDesignerCanvasZoom(newZoom) {
      const clamped = Math.max(0.4, Math.min(2.5, Math.round(newZoom * 100) / 100));
      queryDesignerState.canvasZoom = clamped;
      const stage = document.getElementById("qbeCanvasStage");
      if (stage) {
        stage.style.transform = "scale(" + clamped + ")";
      }
      const select = document.getElementById("canvasZoomSelect");
      if (select) {
        select.value = clamped.toString();
        if (![0.5, 0.75, 0.9, 1.0, 1.25, 1.5, 2.0].includes(clamped)) {
          select.innerHTML = '<option value="' + clamped + '" selected>' + Math.round(clamped * 100) + '%</option>' +
            '<option value="0.5">50%</option><option value="0.75">75%</option><option value="0.9">90%</option><option value="1.0">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2.0">200%</option>';
        }
      }
      updateCanvasSvg();
    }

    function zoomInDesignerCanvas() {
      setDesignerCanvasZoom((queryDesignerState.canvasZoom || 1.0) + 0.15);
    }

    function zoomOutDesignerCanvas() {
      setDesignerCanvasZoom((queryDesignerState.canvasZoom || 1.0) - 0.15);
    }

    function resetDesignerCanvasZoom() {
      setDesignerCanvasZoom(1.0);
    }

    function fitDesignerCanvasZoom() {
      const viewport = document.getElementById("qbeCanvasViewport");
      const tables = queryDesignerState.selectedTables || [];
      if (!viewport || tables.length === 0) return;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      tables.forEach(t => {
        const pos = (queryDesignerState.tablePositions && queryDesignerState.tablePositions[t]) || { x: 20, y: 15 };
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + 240);
        maxY = Math.max(maxY, pos.y + 260);
      });

      const spanW = Math.max(200, maxX - minX + 60);
      const spanH = Math.max(200, maxY - minY + 60);
      const vW = viewport.clientWidth || 800;
      const vH = viewport.clientHeight || 400;

      const scaleX = vW / spanW;
      const scaleY = vH / spanH;
      const fitZoom = Math.min(1.4, Math.max(0.45, Math.min(scaleX, scaleY)));

      setDesignerCanvasZoom(fitZoom);
      viewport.scrollLeft = Math.max(0, (minX - 20) * fitZoom);
      viewport.scrollTop = Math.max(0, (minY - 20) * fitZoom);
      showToast("Canvas fitted to all " + tables.length + " tables (" + Math.round(fitZoom * 100) + "%)");
    }

    function setDesignerRoomMode(mode) {
      queryDesignerState.canvasViewMode = mode;
      const viewport = document.getElementById("qbeCanvasViewport");
      const grid = document.querySelector(".qbe-matrix-container");
      if (!viewport) return;

      let targetH = 480;
      if (mode === "canvas-max") {
        targetH = Math.max(550, (window.innerHeight || 800) - 320);
        if (grid) grid.style.maxHeight = "180px";
      } else if (mode === "grid-max") {
        targetH = 240;
        if (grid) grid.style.maxHeight = "none";
      } else {
        targetH = 480;
        if (grid) grid.style.maxHeight = "none";
      }

      queryDesignerState.canvasHeight = targetH;
      viewport.style.height = targetH + "px";
      viewport.style.maxHeight = targetH + "px";
      document.documentElement.style.setProperty("--qbe-canvas-height", targetH + "px");
      updateCanvasSvg();
      showToast("Room layout: " + (mode === "canvas-max" ? "Canvas Maximized" : mode === "grid-max" ? "Grid Focused" : "Balanced Split"));
    }

    function initQbeSplitter() {
      const splitter = document.getElementById("qbeResizerBar");
      const viewport = document.getElementById("qbeCanvasViewport");
      if (!splitter || !viewport || splitter.dataset.splitterInitialized) return;
      splitter.dataset.splitterInitialized = "true";

      let isDragging = false;
      let startY = 0;
      let startH = 0;

      splitter.addEventListener("mousedown", (e) => {
        isDragging = true;
        startY = e.clientY;
        startH = viewport.offsetHeight;
        splitter.classList.add("resizing");
        document.body.style.cursor = "row-resize";
        e.preventDefault();
      });

      window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const delta = e.clientY - startY;
        const newH = Math.max(200, Math.min(1200, startH + delta));
        queryDesignerState.canvasHeight = newH;
        viewport.style.height = newH + "px";
        viewport.style.maxHeight = newH + "px";
        document.documentElement.style.setProperty("--qbe-canvas-height", newH + "px");
        updateCanvasSvg();
      });

      window.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          splitter.classList.remove("resizing");
          document.body.style.cursor = "";
          updateCanvasSvg();
        }
      });
    }

    function initCanvasPanAndZoom() {
      const viewport = document.getElementById("qbeCanvasViewport");
      if (!viewport || viewport.dataset.zoomInitialized) return;
      viewport.dataset.zoomInitialized = "true";

      let isPanning = false;
      let startX = 0;
      let startY = 0;
      let scrollStartL = 0;
      let scrollStartT = 0;

      viewport.addEventListener("mousedown", (e) => {
        const target = e.target;
        if (target.closest(".qbe-table-card") || target.closest(".qbe-svg-join-badge") || target.closest("button") || target.closest("select") || target.closest("input")) {
          return;
        }
        isPanning = true;
        startX = e.clientX;
        startY = e.clientY;
        scrollStartL = viewport.scrollLeft;
        scrollStartT = viewport.scrollTop;
        viewport.classList.add("panning");
      });

      window.addEventListener("mousemove", (e) => {
        if (!isPanning) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        viewport.scrollLeft = scrollStartL - dx;
        viewport.scrollTop = scrollStartT - dy;
      });

      window.addEventListener("mouseup", () => {
        if (isPanning) {
          isPanning = false;
          viewport.classList.remove("panning");
        }
      });

      viewport.addEventListener("wheel", (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.12 : -0.12;
          const cur = queryDesignerState.canvasZoom || 1.0;
          setDesignerCanvasZoom(cur + delta);
        }
      }, { passive: false });
    }

    function setQbeGridDensity(density) {
      queryDesignerState.gridDensity = density;
      let fontSize = "11px";
      let padding = "4px 6px";
      if (density === "compact") {
        fontSize = "9.5px";
        padding = "2px 4px";
      } else if (density === "spacious") {
        fontSize = "13px";
        padding = "7px 10px";
      }
      document.documentElement.style.setProperty("--qbe-grid-font-size", fontSize);
      document.documentElement.style.setProperty("--qbe-grid-cell-padding", padding);
      renderQueryDesigner();
    }

    function adjustSqlFontSize(delta) {
      const cur = queryDesignerState.sqlFontSize || 13;
      const next = Math.max(10, Math.min(24, cur + delta));
      queryDesignerState.sqlFontSize = next;
      const area = document.getElementById("designerSqlPreview") || document.getElementById("customDesignerSqlArea");
      const badge = document.getElementById("sqlFontBadge");
      if (area) area.style.fontSize = next + "px";
      if (badge) badge.textContent = next + "px";
    }

    function toggleSqlEditorHeight() {
      const area = document.getElementById("designerSqlPreview") || document.getElementById("customDesignerSqlArea");
      if (!area) return;
      const curH = parseInt(area.style.height || "380", 10);
      const newH = curH > 450 ? 380 : 640;
      area.style.height = newH + "px";
    }

    function setDatasheetDensity(density) {
      queryDesignerState.datasheetDensity = density;
      let padding = "5px 8px";
      if (density === "compact") padding = "2px 6px";
      else if (density === "spacious") padding = "9px 12px";
      document.documentElement.style.setProperty("--ds-cell-padding", padding);
      renderQueryDesigner();
    }

    function adjustDatasheetFontSize(delta) {
      const cur = queryDesignerState.datasheetFontSize || 11;
      const next = Math.max(9, Math.min(20, cur + delta));
      queryDesignerState.datasheetFontSize = next;
      document.documentElement.style.setProperty("--ds-font-size", next + "px");
      const badge = document.getElementById("dsFontBadge");
      if (badge) badge.textContent = next + "px";
      renderQueryDesigner();
    }

    function toggleSidebarCollapse() {
      const aside = document.getElementById("mainSidebar");
      if (!aside) return;
      if (aside.style.display === "none") {
        aside.style.display = "flex";
      } else {
        aside.style.display = "none";
      }
      setTimeout(() => {
        if (activeTab === "designer") updateCanvasSvg();
      }, 40);
    }

    function updateCanvasSvg() {
      const canvas = document.getElementById("qbeCanvasViewport");
      const stage = document.getElementById("qbeCanvasStage") || canvas;
      const svg = document.getElementById("qbeCanvasSvg");
      if (!canvas || !svg) return;

      const joins = queryDesignerState.joins || [];
      if (!joins.length) {
        svg.innerHTML = "";
        return;
      }

      const zoom = queryDesignerState.canvasZoom || 1.0;
      const stageRect = stage.getBoundingClientRect();

      svg.style.width = Math.max(stage.scrollWidth, stage.offsetWidth, 3400) + "px";
      svg.style.height = Math.max(stage.scrollHeight, stage.offsetHeight, 2400) + "px";

      let svgContent = \`
        <defs>
          <marker id="marker-arrow-emerald" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <polygon points="0 1, 8 4, 0 7" fill="#10b981" />
          </marker>
          <marker id="marker-arrow-amber" markerWidth="8" markerHeight="8" refX="2" refY="4" orient="auto">
            <polygon points="8 1, 0 4, 8 7" fill="#f59e0b" />
          </marker>
          <marker id="marker-diamond-purple" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <polygon points="4 1, 7 4, 4 7, 1 4" fill="#a855f7" />
          </marker>
        </defs>
      \`;

      joins.forEach(j => {
        const fieldLeft = document.getElementById("qbeFieldRow_" + j.leftTable + "_" + j.leftField);
        const fieldRight = document.getElementById("qbeFieldRow_" + j.rightTable + "_" + j.rightField);
        const cardLeft = document.getElementById("qbeTableCard_" + j.leftTable);
        const cardRight = document.getElementById("qbeTableCard_" + j.rightTable);

        const targetL = fieldLeft || cardLeft;
        const targetR = fieldRight || cardRight;
        if (!targetL || !targetR) return;

        const rL = targetL.getBoundingClientRect();
        const rR = targetR.getBoundingClientRect();

        let x1, x2;
        if (rL.right <= rR.left) {
          x1 = (rL.right - stageRect.left) / zoom;
          x2 = (rR.left - stageRect.left) / zoom;
        } else if (rR.right <= rL.left) {
          x1 = (rL.left - stageRect.left) / zoom;
          x2 = (rR.right - stageRect.left) / zoom;
        } else {
          x1 = (rL.right - stageRect.left) / zoom;
          x2 = (rR.right - stageRect.left) / zoom;
        }

        const y1 = ((rL.top + rL.height / 2) - stageRect.top) / zoom;
        const y2 = ((rR.top + rR.height / 2) - stageRect.top) / zoom;

        const dx = Math.max(35, Math.abs(x2 - x1) * 0.45);
        const d = \`M \${x1} \${y1} C \${x1 + (x2 >= x1 ? dx : -dx)} \${y1}, \${x2 + (x2 >= x1 ? -dx : dx)} \${y2}, \${x2} \${y2}\`;

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;

        const type = (j.type || "INNER").toUpperCase();
        let stroke = "#38bdf8";
        let dash = "";
        let markerAttr = "";
        let badgeIcon = "=";

        if (type === "LEFT") {
          stroke = "#10b981";
          markerAttr = 'marker-end="url(#marker-arrow-emerald)"';
          badgeIcon = "⟵";
        } else if (type === "RIGHT") {
          stroke = "#f59e0b";
          markerAttr = 'marker-start="url(#marker-arrow-amber)"';
          badgeIcon = "⟶";
        } else if (type === "FULL" || type === "FULL OUTER") {
          stroke = "#a855f7";
          dash = 'stroke-dasharray="6,4"';
          markerAttr = 'marker-end="url(#marker-diamond-purple)" marker-start="url(#marker-diamond-purple)"';
          badgeIcon = "⟷";
        } else if (type === "CROSS") {
          stroke = "#f43f5e";
          dash = 'stroke-dasharray="3,3"';
          badgeIcon = "×";
        }

        // Determine Access Cardinality Badges (1 to ∞)
        const leftMeta = typeof getEntityMeta === "function" ? getEntityMeta(j.leftTable) : null;
        const rightMeta = typeof getEntityMeta === "function" ? getEntityMeta(j.rightTable) : null;
        const leftIsPk = Boolean(leftMeta && leftMeta.columns && leftMeta.columns.find(c => c.name === j.leftField)?.pk);
        const rightIsPk = Boolean(rightMeta && rightMeta.columns && rightMeta.columns.find(c => c.name === j.rightField)?.pk);

        let leftCard = leftIsPk ? "1" : "∞";
        let rightCard = rightIsPk ? "1" : "∞";
        if (!leftIsPk && !rightIsPk) {
          if (String(j.leftField).toLowerCase().endsWith("_id")) { leftCard = "∞"; rightCard = "1"; }
          else if (String(j.rightField).toLowerCase().endsWith("_id")) { leftCard = "1"; rightCard = "∞"; }
          else { leftCard = "1"; rightCard = "1"; }
        }

        const cardOff1 = (x2 >= x1 ? 16 : -16);
        const cardOff2 = (x2 >= x1 ? -16 : 16);

        svgContent += \`
          <path d="\${d}" class="qbe-svg-join-halo" onclick="openJoinPropertiesModal('\${j.key}')" title="Click to edit Join Properties (\${type} JOIN)"></path>
          <path d="\${d}" class="qbe-svg-join-line" stroke="\${stroke}" \${dash} \${markerAttr} onclick="openJoinPropertiesModal('\${j.key}')" title="Click to edit Join Properties (\${type} JOIN)"></path>

          <!-- MS Access Style Cardinality Indicators (1 to ∞) -->
          <foreignObject x="\${x1 + cardOff1 - 9}" y="\${y1 - 10}" width="18" height="18" style="overflow: visible; pointer-events: none;">
            <div xmlns="http://www.w3.org/1999/xhtml" class="qbe-cardinality-badge" style="background: rgba(15,23,42,0.92); border: 1px solid \${stroke}; color: \${stroke}; font-size: 10px; font-weight: 800; width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.6);" title="Access Cardinality: \${leftCard}">
              \${leftCard}
            </div>
          </foreignObject>
          <foreignObject x="\${x2 + cardOff2 - 9}" y="\${y2 - 10}" width="18" height="18" style="overflow: visible; pointer-events: none;">
            <div xmlns="http://www.w3.org/1999/xhtml" class="qbe-cardinality-badge" style="background: rgba(15,23,42,0.92); border: 1px solid \${stroke}; color: \${stroke}; font-size: 10px; font-weight: 800; width: 18px; height: 18px; border-radius: 9px; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.6);" title="Access Cardinality: \${rightCard}">
              \${rightCard}
            </div>
          </foreignObject>

          <foreignObject x="\${mx - 50}" y="\${my - 13}" width="100" height="26" style="overflow: visible;">
            <div xmlns="http://www.w3.org/1999/xhtml" class="qbe-svg-join-badge" style="border-color:\${stroke}; color:\${stroke};" onclick="openJoinPropertiesModal('\${j.key}')" title="Join Properties (\${type} JOIN): Click to configure">
              <span>\${badgeIcon}</span>
              <span>\${type}</span>
            </div>
          </foreignObject>
        \`;
      });

      svg.innerHTML = svgContent;
    }

    function promptAddDesignerJoin(preferredLeft, preferredRight) {
      if (queryDesignerState.selectedTables.length < 2) {
        showToast("Add at least 2 tables to create a join relationship");
        return;
      }
      openJoinPropertiesModal(null, preferredLeft, preferredRight);
    }

    function updateDesignerJoin(key, prop, value) {
      queryDesignerState.joins = (queryDesignerState.joins || []).map(j => {
        if (j.key === key) {
          return { ...j, [prop]: value };
        }
        return j;
      });
      renderQueryDesigner();
    }

    function updateDesignerJoinTable(key, side, newTableName) {
      const join = (queryDesignerState.joins || []).find(j => j.key === key);
      if (!join) return;
      if (side === "leftTable") {
        join.leftTable = newTableName;
        const otherTable = join.rightTable;
        const sugg = suggestDesignerJoin(newTableName, otherTable);
        if (sugg) {
          join.leftField = sugg.leftField;
          join.rightField = sugg.rightField;
        } else {
          const meta = getEntityMeta(newTableName);
          join.leftField = meta && meta.columns && meta.columns[0] ? meta.columns[0].name : "id";
        }
      } else {
        join.rightTable = newTableName;
        const otherTable = join.leftTable;
        const sugg = suggestDesignerJoin(otherTable, newTableName);
        if (sugg) {
          join.leftField = sugg.leftField;
          join.rightField = sugg.rightField;
        } else {
          const meta = getEntityMeta(newTableName);
          join.rightField = meta && meta.columns && meta.columns[0] ? meta.columns[0].name : "id";
        }
      }
      renderQueryDesigner();
    }

    function removeDesignerJoin(key) {
      queryDesignerState.joins = (queryDesignerState.joins || []).filter(j => j.key !== key);
      renderQueryDesigner();
    }

    function addDesignerQbeColumn(table, field) {
      if (!table) table = queryDesignerState.selectedTables[0] || "";
      if (!field) {
        const meta = getEntityMeta(table);
        field = meta && meta.columns && meta.columns[0] ? meta.columns[0].name : "*";
      }
      queryDesignerState.columns.push({
        id: "col-" + Date.now() + "-" + Math.random().toString(16).slice(2),
        table: table,
        field: field,
        alias: "",
        total: queryDesignerState.showTotals ? "GroupBy" : "None",
        sort: "",
        show: true,
        criteria: "",
        or1: "",
        or2: "",
      });
      renderQueryDesigner();
    }

    function updateDesignerQbeColumn(id, prop, value) {
      const col = (queryDesignerState.columns || []).find(c => c.id === id);
      if (!col) return;
      col[prop] = value;
      if (prop === "table") {
        const meta = getEntityMeta(value);
        if (meta && meta.columns && meta.columns.length) {
          col.field = meta.columns[0].name;
        }
      }
      renderQueryDesigner();
    }

    function moveDesignerQbeColumn(id, delta) {
      const idx = (queryDesignerState.columns || []).findIndex(c => c.id === id);
      if (idx === -1) return;
      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= queryDesignerState.columns.length) return;
      const temp = queryDesignerState.columns[idx];
      queryDesignerState.columns[idx] = queryDesignerState.columns[targetIdx];
      queryDesignerState.columns[targetIdx] = temp;
      renderQueryDesigner();
    }

    function removeDesignerQbeColumn(id) {
      queryDesignerState.columns = (queryDesignerState.columns || []).filter(c => c.id !== id);
      renderQueryDesigner();
    }

    function clearDesignerQbe() {
      queryDesignerState.columns = [];
      renderQueryDesigner();
      showToast("Cleared QBE grid columns");
    }

    function resetDesignerAll() {
      queryDesignerState.selectedTables = [];
      queryDesignerState.joins = [];
      queryDesignerState.columns = [];
      queryDesignerState.activeView = "design";
      queryDesignerState.datasheet = null;
      ensureQueryDesignerState();
      renderQueryDesigner();
      showToast("Reset Query Designer");
    }

    function runDesignerQuery() {
      const sql = buildDesignerSql();
      queryDesignerState.activeView = "datasheet";
      queryDesignerState.datasheetLoading = true;
      queryDesignerState.datasheetError = null;
      renderQueryDesigner();

      apiRequest('/api/query', { sql }).then(res => {
        if (res && res.success) {
          queryDesignerState.datasheet = {
            rows: res.rows || [],
            columns: res.columns || [],
            latencyMs: res.latencyMs || 0,
            error: null,
          };
        } else {
          queryDesignerState.datasheet = {
            rows: [],
            columns: [],
            latencyMs: 0,
            error: res ? res.error : "Execution failed",
          };
        }
      }).catch(err => {
        queryDesignerState.datasheet = {
          rows: [],
          columns: [],
          latencyMs: 0,
          error: err.message,
        };
      }).finally(() => {
        queryDesignerState.datasheetLoading = false;
        renderQueryDesigner();
      });
    }

    function loadSavedQueriesFromStorage() {
      try {
        const raw = localStorage.getItem("mysql_studio_saved_queries");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) return parsed;
        }
      } catch (e) {}
      return [
        {
          name: "Top Customers by Spend",
          sql: 'SELECT "customers"."name" AS "Customer", "customers"."tier" AS "Tier", SUM("orders"."total_amount") AS "TotalSpend", COUNT("orders"."id") AS "OrdersCount" FROM "customers" INNER JOIN "orders" ON "customers"."id" = "orders"."customer_id" GROUP BY "customers"."name", "customers"."tier" HAVING SUM("orders"."total_amount") > 0 ORDER BY "TotalSpend" DESC LIMIT 25;',
          createdAt: new Date().toISOString()
        },
        {
          name: "Low Stock Inventory Alert",
          sql: 'SELECT "products"."name" AS "Product", "products"."category" AS "Category", "products"."stock" AS "UnitsInStock", "products"."price" AS "Price" FROM "products" WHERE "products"."stock" < 50 ORDER BY "products"."stock" ASC LIMIT 50;',
          createdAt: new Date().toISOString()
        }
      ];
    }

    function persistSavedQueries() {
      try {
        localStorage.setItem("mysql_studio_saved_queries", JSON.stringify(queryDesignerState.savedQueries || []));
      } catch (e) {}
    }

    function applyDesignerPreset(presetKey) {
      if (!presetKey) return;
      if (presetKey === "blank") {
        resetDesignerAll();
        return;
      }
      if (!currentSchema || !currentSchema.tables || !currentSchema.tables.length) {
        showToast("Load or seed a database first");
        return;
      }

      const tableNames = currentSchema.tables.map(t => t.name);

      if (presetKey === "ecommerce_multi") {
        if (tableNames.includes("customers") && tableNames.includes("orders") && tableNames.includes("order_items") && tableNames.includes("products")) {
          queryDesignerState.selectedTables = ["customers", "orders", "order_items", "products"];
          queryDesignerState.showTotals = true;
          queryDesignerState.distinct = false;
          queryDesignerState.topLimit = 50;
          queryDesignerState.joins = buildDesignerJoinPairs();

          queryDesignerState.columns = [
            { id: "p1", table: "customers", field: "name", alias: "Customer", total: "GroupBy", sort: "ASC", show: true, criteria: "", or1: "", or2: "" },
            { id: "p2", table: "products", field: "category", alias: "Category", total: "GroupBy", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "p3", table: "products", field: "name", alias: "Product", total: "GroupBy", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "p4", table: "order_items", field: "quantity", alias: "TotalUnits", total: "Sum", sort: "", show: true, criteria: "> 0", or1: "", or2: "" },
            { id: "p5", table: "orders", field: "total_amount", alias: "Revenue", total: "Sum", sort: "DESC", show: true, criteria: "", or1: "", or2: "" }
          ];
          renderQueryDesigner();
          showToast("Loaded 4-Table Enterprise Template (Customers, Orders, Items, Products)");
          return;
        }
      }

      if (presetKey === "top_spenders") {
        if (tableNames.includes("customers") && tableNames.includes("orders")) {
          queryDesignerState.selectedTables = ["customers", "orders"];
          queryDesignerState.showTotals = true;
          queryDesignerState.distinct = false;
          queryDesignerState.topLimit = 25;
          queryDesignerState.joins = buildDesignerJoinPairs();
          const custMeta = currentSchema.tables.find(t => t.name === "customers");
          const ordMeta = currentSchema.tables.find(t => t.name === "orders");
          const segField = custMeta && custMeta.columns.some(c => c.name === "segment") ? "segment" : (custMeta && custMeta.columns.some(c => c.name === "tier") ? "tier" : "email");
          const amtField = ordMeta && ordMeta.columns.some(c => c.name === "total_amount") ? "total_amount" : "amount";

          queryDesignerState.columns = [
            { id: "p1", table: "customers", field: "name", alias: "Customer", total: "GroupBy", sort: "ASC", show: true, criteria: "", or1: "", or2: "" },
            { id: "p2", table: "customers", field: segField, alias: "Segment", total: "GroupBy", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "p3", table: "orders", field: amtField, alias: "TotalSpend", total: "Sum", sort: "DESC", show: true, criteria: "> 0", or1: "", or2: "" },
            { id: "p4", table: "orders", field: "id", alias: "OrdersCount", total: "Count", sort: "", show: true, criteria: "", or1: "", or2: "" }
          ];
          renderQueryDesigner();
          showToast("Loaded Template: Top Customers by Spend");
          return;
        }
      } else if (presetKey === "join_left") {
        if (tableNames.includes("customers") && tableNames.includes("orders")) {
          queryDesignerState.selectedTables = ["customers", "orders"];
          queryDesignerState.showTotals = false;
          queryDesignerState.distinct = false;
          queryDesignerState.topLimit = 50;
          queryDesignerState.joins = [
            { key: "customers.id->orders.customer_id-left", leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "LEFT" }
          ];
          queryDesignerState.columns = [
            { id: "jl1", table: "customers", field: "id", alias: "cust_id", total: "None", sort: "ASC", show: true, criteria: "", or1: "", or2: "" },
            { id: "jl2", table: "customers", field: "name", alias: "customer_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "jl3", table: "orders", field: "id", alias: "order_id", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "jl4", table: "orders", field: "total_amount", alias: "order_amount", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
          ];
          renderQueryDesigner();
          showToast("Loaded Access Option 2: LEFT OUTER JOIN (All Customers)");
          return;
        }
      } else if (presetKey === "join_right") {
        if (tableNames.includes("customers") && tableNames.includes("orders")) {
          queryDesignerState.selectedTables = ["customers", "orders"];
          queryDesignerState.showTotals = false;
          queryDesignerState.distinct = false;
          queryDesignerState.topLimit = 50;
          queryDesignerState.joins = [
            { key: "customers.id->orders.customer_id-right", leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "RIGHT" }
          ];
          queryDesignerState.columns = [
            { id: "jr1", table: "customers", field: "name", alias: "customer_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "jr2", table: "orders", field: "id", alias: "order_id", total: "None", sort: "ASC", show: true, criteria: "", or1: "", or2: "" },
            { id: "jr3", table: "orders", field: "total_amount", alias: "order_amount", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
          ];
          renderQueryDesigner();
          showToast("Loaded Access Option 3: RIGHT OUTER JOIN (All Orders)");
          return;
        }
      } else if (presetKey === "join_full") {
        if (tableNames.includes("customers") && tableNames.includes("orders")) {
          queryDesignerState.selectedTables = ["customers", "orders"];
          queryDesignerState.showTotals = false;
          queryDesignerState.distinct = false;
          queryDesignerState.topLimit = 50;
          queryDesignerState.joins = [
            { key: "customers.id->orders.customer_id-full", leftTable: "customers", leftField: "id", rightTable: "orders", rightField: "customer_id", type: "FULL" }
          ];
          queryDesignerState.columns = [
            { id: "jf1", table: "customers", field: "id", alias: "cust_id", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "jf2", table: "customers", field: "name", alias: "customer_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "jf3", table: "orders", field: "id", alias: "order_id", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "jf4", table: "orders", field: "total_amount", alias: "order_amount", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
          ];
          renderQueryDesigner();
          showToast("Loaded Access Option 4: FULL OUTER JOIN (All Records)");
          return;
        }
      } else if (presetKey === "join_cross") {
        if (tableNames.includes("customers") && tableNames.includes("products")) {
          queryDesignerState.selectedTables = ["customers", "products"];
          queryDesignerState.showTotals = false;
          queryDesignerState.distinct = false;
          queryDesignerState.topLimit = 25;
          queryDesignerState.joins = [
            { key: "customers->products-cross", leftTable: "customers", leftField: "id", rightTable: "products", rightField: "id", type: "CROSS" }
          ];
          queryDesignerState.columns = [
            { id: "jc1", table: "customers", field: "name", alias: "customer_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "jc2", table: "products", field: "name", alias: "product_name", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "jc3", table: "products", field: "price", alias: "unit_price", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
          ];
          renderQueryDesigner();
          showToast("Loaded Access Option 5: CROSS JOIN (Cartesian Matrix)");
          return;
        }
      } else if (presetKey === "low_stock") {
        if (tableNames.includes("products")) {
          queryDesignerState.selectedTables = ["products"];
          queryDesignerState.showTotals = false;
          queryDesignerState.distinct = false;
          queryDesignerState.topLimit = 50;
          queryDesignerState.joins = [];
          const prodMeta = currentSchema.tables.find(t => t.name === "products");
          const stockField = prodMeta && prodMeta.columns.some(c => c.name === "stock_quantity") ? "stock_quantity" : "stock";

          queryDesignerState.columns = [
            { id: "p1", table: "products", field: "name", alias: "Product", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "p2", table: "products", field: "category", alias: "Category", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "p3", table: "products", field: stockField, alias: "UnitsInStock", total: "None", sort: "ASC", show: true, criteria: "< 50", or1: "", or2: "" },
            { id: "p4", table: "products", field: "price", alias: "Price", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
          ];
          renderQueryDesigner();
          showToast("Loaded Template: Low Stock Inventory Alert");
          return;
        }
      } else if (presetKey === "orders_status") {
        if (tableNames.includes("customers") && tableNames.includes("orders")) {
          queryDesignerState.selectedTables = ["customers", "orders"];
          queryDesignerState.showTotals = false;
          queryDesignerState.distinct = false;
          queryDesignerState.topLimit = 50;
          queryDesignerState.joins = buildDesignerJoinPairs();
          const ordMeta = currentSchema.tables.find(t => t.name === "orders");
          const amtField = ordMeta && ordMeta.columns.some(c => c.name === "total_amount") ? "total_amount" : "amount";

          queryDesignerState.columns = [
            { id: "p1", table: "orders", field: "id", alias: "OrderID", total: "None", sort: "DESC", show: true, criteria: "", or1: "", or2: "" },
            { id: "p2", table: "customers", field: "name", alias: "Customer", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" },
            { id: "p3", table: "orders", field: "status", alias: "Status", total: "None", sort: "", show: true, criteria: "<> 'cancelled'", or1: "", or2: "" },
            { id: "p4", table: "orders", field: amtField, alias: "Amount", total: "None", sort: "", show: true, criteria: "", or1: "", or2: "" }
          ];
          renderQueryDesigner();
          showToast("Loaded Template: Active Orders Pipeline");
          return;
        }
      }

      // Generic fallback for any user database
      queryDesignerState.selectedTables = [tableNames[0]];
      if (tableNames.length > 1) queryDesignerState.selectedTables.push(tableNames[1]);
      queryDesignerState.joins = buildDesignerJoinPairs();
      queryDesignerState.columns = [];
      queryDesignerState.showTotals = false;
      queryDesignerState.distinct = false;
      ensureQueryDesignerState();
      renderQueryDesigner();
      showToast("Initialized query layout for " + queryDesignerState.selectedTables.join(" & "));
    }

    function exportDesignerDatasheet(format) {
      if (!queryDesignerState.datasheet || !queryDesignerState.datasheet.rows.length) {
        showToast("No data to export. Run the query first.");
        return;
      }
      const rows = queryDesignerState.datasheet.rows;
      const cols = queryDesignerState.datasheet.columns;
      let content = "";
      let filename = "query_results." + format;
      let mime = "text/plain";

      if (format === "json") {
        content = JSON.stringify(rows, null, 2);
        mime = "application/json";
      } else {
        const header = cols.join(",");
        const body = rows.map(r => cols.map(c => {
          const val = r[c] !== null && r[c] !== undefined ? String(r[c]) : "";
          return val.includes(",") || val.includes('"') || val.includes("\\n") ? '"' + val.replace(/"/g, '""') + '"' : val;
        }).join(",")).join("\\n");
        content = header + "\\n" + body;
        mime = "text/csv";
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Exported " + rows.length + " records as " + format.toUpperCase());
    }

    function copyDesignerDatasheetMarkdown() {
      if (!queryDesignerState.datasheet || !queryDesignerState.datasheet.rows.length) {
        showToast("No data to copy. Run the query first.");
        return;
      }
      const rows = queryDesignerState.datasheet.rows;
      const cols = queryDesignerState.datasheet.columns;
      const header = "| " + cols.join(" | ") + " |";
      const sep = "| " + cols.map(() => "---").join(" | ") + " |";
      const body = rows.map(r => "| " + cols.map(c => {
        const val = r[c] !== null && r[c] !== undefined ? String(r[c]) : "NULL";
        return val.replace(/\|/g, "\\\\|");
      }).join(" | ") + " |").join("\\n");
      const md = header + "\\n" + sep + "\\n" + body;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(md);
        showToast("Copied " + rows.length + " rows as Markdown table");
      }
    }

    function copyDesignerDatasheetSqlInsert() {
      if (!queryDesignerState.datasheet || !queryDesignerState.datasheet.rows.length) {
        showToast("No data to copy. Run the query first.");
        return;
      }
      const rows = queryDesignerState.datasheet.rows;
      const cols = queryDesignerState.datasheet.columns;
      const targetTable = queryDesignerState.selectedTables[0] || "results";
      const colList = cols.map(c => quoteSqlIdentifier(c)).join(", ");
      const inserts = rows.map(r => {
        const vals = cols.map(c => {
          const val = r[c];
          if (val === null || val === undefined) return "NULL";
          if (typeof val === "number") return val;
          return "'" + String(val).replace(/'/g, "''") + "'";
        }).join(", ");
        return "INSERT INTO " + quoteSqlIdentifier(targetTable) + " (" + colList + ") VALUES (" + vals + ");";
      }).join("\\n");
      if (navigator.clipboard) {
        navigator.clipboard.writeText(inserts);
        showToast("Copied " + rows.length + " SQL INSERT statements");
      }
    }

    function filterDesignerDatasheet(query) {
      const container = document.querySelector(".qbe-datasheet-container tbody");
      if (!container) return;
      const q = (query || "").toLowerCase().trim();
      const rows = container.querySelectorAll("tr");
      rows.forEach(r => {
        if (!q) {
          r.style.display = "";
          return;
        }
        r.style.display = r.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    }

    function toggleCriteriaHelp() {
      const banner = document.getElementById("criteriaHelpBanner");
      if (banner) {
        banner.style.display = banner.style.display === "none" ? "block" : "none";
      }
    }

    function loadDesignerSqlToEditor() {
      const value = buildDesignerSql();
      const editor = document.getElementById("sqlEditor");
      if (editor) editor.value = value;
      showToast("Designer SQL loaded into editor");
    }

    function copyDesignerSql() {
      const value = buildDesignerSql();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(value);
        showToast("SQL copied to clipboard");
      }
    }

    function explainDesignerQuery() {
      const sql = buildDesignerSql();
      const editor = document.getElementById("sqlEditor");
      if (editor) editor.value = sql;
      explainCurrentQuery();
    }

    function runCustomDesignerSql() {
      const preview = document.getElementById("designerSqlPreview");
      const sql = preview ? preview.value.trim() : buildDesignerSql();
      if (!sql) return;
      queryDesignerState.activeView = "datasheet";
      queryDesignerState.datasheetLoading = true;
      queryDesignerState.datasheetError = null;
      renderQueryDesigner();

      apiRequest('/api/query', { sql }).then(res => {
        if (res && res.success) {
          queryDesignerState.datasheet = {
            rows: res.rows || [],
            columns: res.columns || [],
            latencyMs: res.latencyMs || 0,
            error: null,
          };
        } else {
          queryDesignerState.datasheet = {
            rows: [],
            columns: [],
            latencyMs: 0,
            error: res ? res.error : "Execution failed",
          };
        }
      }).catch(err => {
        queryDesignerState.datasheet = {
          rows: [],
          columns: [],
          latencyMs: 0,
          error: err.message,
        };
      }).finally(() => {
        queryDesignerState.datasheetLoading = false;
        renderQueryDesigner();
      });
    }

    function resetDesignerSqlToQbe() {
      const preview = document.getElementById("designerSqlPreview");
      if (preview) {
        preview.value = buildDesignerSql();
        showToast("Reset SQL to QBE Designer query");
      }
    }

    async function saveDesignerQuery() {
      const preview = document.getElementById("designerSqlPreview");
      const sql = (queryDesignerState.activeView === "sql" && preview && preview.value.trim()) ? preview.value.trim() : buildDesignerSql();
      if (!sql || sql.startsWith("--")) {
        showToast("Cannot save empty query");
        return;
      }

      const defaultName = "Query_" + (((queryDesignerState.savedQueries || []).length) + 1);
      const name = prompt("Save query in database (Access Query Name):", defaultName);
      if (!name || !name.trim()) return;
      const cleanName = name.trim();
      const desc = prompt("Optional description / purpose for this query:", "") || "";

      // Capture QBE visual designer state so reopening can reconstruct visual diagram
      const designerStateJson = JSON.stringify({
        selectedTables: queryDesignerState.selectedTables || [],
        columns: queryDesignerState.columns || [],
        joins: queryDesignerState.joins || [],
        tablePositions: queryDesignerState.tablePositions || {},
        limit: queryDesignerState.limit || 50,
        distinct: !!queryDesignerState.distinct
      });

      const queryDef = {
        id: "query_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        name: cleanName,
        description: desc,
        sql: sql,
        designerStateJson: designerStateJson,
        createdAt: new Date().toISOString()
      };

      try {
        const res = await apiRequest('/api/queries/save', { query: queryDef });
        if (res && res.error) {
          showToast("Error saving query: " + res.error);
          return;
        }
      } catch (err) {
        console.warn("Could not persist to server, falling back to local store", err);
      }

      if (!queryDesignerState.savedQueries) queryDesignerState.savedQueries = [];
      queryDesignerState.savedQueries = queryDesignerState.savedQueries.filter(q => q.name !== cleanName);
      queryDesignerState.savedQueries.unshift(queryDef);
      queryDesignerState.savedQueries = queryDesignerState.savedQueries.slice(0, 30);
      persistSavedQueries();

      if (typeof loadSavedQueriesFromServer === "function") {
        try {
          await loadSavedQueriesFromServer();
        } catch (e) {}
      }

      showToast("Saved query: " + cleanName);
      renderQueryDesigner();
      renderObjectTree();
    }

    async function saveDesignerAsView() {
      const preview = document.getElementById("designerSqlPreview");
      let querySql = (queryDesignerState.activeView === "sql" && preview && preview.value.trim()) ? preview.value.trim() : buildDesignerSql();
      querySql = querySql.replace(/;+$/, "").trim();
      if (!querySql || querySql.startsWith("--")) {
        showToast("Cannot create view from empty query");
        return;
      }

      const defaultViewName = "v_" + (queryDesignerState.selectedTables && queryDesignerState.selectedTables[0] ? queryDesignerState.selectedTables[0] : "custom") + "_view";
      const viewName = prompt("Save query as a permanent SQL VIEW (enter view name):", defaultViewName);
      if (!viewName) return;

      const sanitized = viewName.trim().replace(/[^a-zA-Z0-9_]/g, "");
      if (!sanitized) {
        showToast("Invalid view name. Use letters, numbers, and underscores.");
        return;
      }

      const ddl = "CREATE VIEW IF NOT EXISTS " + sanitized + " AS " + querySql + ";";
      try {
        const res = await apiRequest('/api/query', { sql: ddl });
        if (res && res.error) {
          showToast("Error creating view: " + res.error);
        } else {
          showToast("View " + sanitized + " created successfully!");
          logAudit("[DDL] Created VIEW: " + sanitized);
          await refreshAll();
          selectTable(sanitized);
        }
      } catch (err) {
        showToast("Failed to create view: " + (err.message || String(err)));
      }
    }

    function loadSavedDesignerQuery(index) {
      const item = queryDesignerState.savedQueries && queryDesignerState.savedQueries[index];
      if (!item) return;
      const editor = document.getElementById("sqlEditor");
      if (editor) editor.value = item.sql;
      const preview = document.getElementById("designerSqlPreview");
      if (preview) preview.value = item.sql;
      showToast("Loaded saved query: " + item.name);
    }

    function deleteSavedDesignerQuery(index) {
      if (!queryDesignerState.savedQueries || index < 0 || index >= queryDesignerState.savedQueries.length) return;
      const removed = queryDesignerState.savedQueries.splice(index, 1);
      persistSavedQueries();
      renderQueryDesigner();
      showToast("Deleted query: " + (removed[0] ? removed[0].name : ""));
    }

    function buildDesignerSql() {
      ensureQueryDesignerState();
      if (!queryDesignerState.selectedTables || !queryDesignerState.selectedTables.length) {
        return "-- Add a table from the toolbar to start building your query";
      }

      const selectedTables = queryDesignerState.selectedTables;
      const baseTable = selectedTables[0];
      const showTotals = queryDesignerState.showTotals;

      const selectItems = [];
      const groupByItems = [];
      const whereConditions = [];
      const havingConditions = [];
      const orderByItems = [];

      const activeColumns = (queryDesignerState.columns || []).filter(col => selectedTables.includes(col.table));

      if (!activeColumns.length) {
        selectItems.push("*");
      } else {
        activeColumns.forEach(col => {
          const qualified = quoteSqlIdentifier(col.table) + "." + (col.field === "*" ? "*" : quoteSqlIdentifier(col.field));
          const alias = col.alias ? quoteSqlIdentifier(col.alias) : (selectedTables.length > 1 ? quoteSqlIdentifier(col.table + "_" + col.field) : quoteSqlIdentifier(col.field));
          const total = col.total || (showTotals ? "GroupBy" : "None");

          let expr = qualified;
          let isAggregate = false;

          if (showTotals) {
            if (["Sum", "Avg", "Min", "Max", "Count"].includes(total)) {
              expr = total.toUpperCase() + "(" + qualified + ")";
              isAggregate = true;
            } else if (total === "Where") {
              expr = null;
            } else if (total === "Expression") {
              expr = col.field;
            }
          }

          if (col.show !== false && expr !== null) {
            selectItems.push(expr + (alias ? " AS " + alias : ""));
          }

          if (showTotals && (total === "GroupBy" || (!isAggregate && total !== "Where" && total !== "Expression" && col.show !== false))) {
            if (!groupByItems.includes(qualified) && col.field !== "*") {
              groupByItems.push(qualified);
            }
          }

          const conds = [];
          if (col.criteria && col.criteria.trim()) conds.push(formatAccessCriterion(isAggregate ? expr : qualified, col.criteria));
          if (col.or1 && col.or1.trim()) conds.push(formatAccessCriterion(isAggregate ? expr : qualified, col.or1));
          if (col.or2 && col.or2.trim()) conds.push(formatAccessCriterion(isAggregate ? expr : qualified, col.or2));

          if (conds.length > 0) {
            const combined = conds.length === 1 ? conds[0] : "(" + conds.join(" OR ") + ")";
            if (isAggregate) {
              havingConditions.push(combined);
            } else {
              whereConditions.push(combined);
            }
          }

          if (col.sort === "ASC" || col.sort === "DESC") {
            orderByItems.push((isAggregate ? expr : qualified) + " " + col.sort);
          }
        });
      }

      if (!selectItems.length) selectItems.push("*");

      const sqlLines = [];
      sqlLines.push("SELECT" + (queryDesignerState.distinct ? " DISTINCT" : ""));
      sqlLines.push("  " + selectItems.join(", "));

      // Multi-table topological join resolution:
      // Start with baseTable (the primary table), track joined tables
      const joinedTables = new Set([baseTable]);
      sqlLines.push("FROM " + quoteSqlIdentifier(baseTable));

      const pendingJoins = [...(queryDesignerState.joins || []).filter(j => 
        selectedTables.includes(j.leftTable) && selectedTables.includes(j.rightTable)
      )];

      while (pendingJoins.length > 0) {
        let matchIdx = -1;
        let isReversed = false;

        for (let i = 0; i < pendingJoins.length; i++) {
          const j = pendingJoins[i];
          if (joinedTables.has(j.leftTable) && !joinedTables.has(j.rightTable)) {
            matchIdx = i;
            isReversed = false;
            break;
          } else if (joinedTables.has(j.rightTable) && !joinedTables.has(j.leftTable)) {
            matchIdx = i;
            isReversed = true;
            break;
          } else if (joinedTables.has(j.leftTable) && joinedTables.has(j.rightTable)) {
            matchIdx = i;
            isReversed = false;
            break;
          }
        }

        if (matchIdx !== -1) {
          const j = pendingJoins.splice(matchIdx, 1)[0];
          const rawJoinType = (j.type || "INNER").toUpperCase();

          if (joinedTables.has(j.leftTable) && joinedTables.has(j.rightTable)) {
            if (rawJoinType !== "CROSS") {
              whereConditions.push(quoteSqlIdentifier(j.leftTable) + "." + quoteSqlIdentifier(j.leftField) + " = " + quoteSqlIdentifier(j.rightTable) + "." + quoteSqlIdentifier(j.rightField));
            }
            continue;
          }

          if (isReversed) {
            let effType = "INNER";
            if (rawJoinType === "LEFT") effType = "RIGHT";
            else if (rawJoinType === "RIGHT") effType = "LEFT";
            else if (rawJoinType === "FULL" || rawJoinType === "FULL OUTER") effType = "LEFT";
            else if (rawJoinType === "CROSS") effType = "CROSS";
            else effType = "INNER";

            if (effType === "CROSS") {
              sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(j.leftTable));
            } else {
              sqlLines.push(effType + " JOIN " + quoteSqlIdentifier(j.leftTable) + " ON " + quoteSqlIdentifier(j.rightTable) + "." + quoteSqlIdentifier(j.rightField) + " = " + quoteSqlIdentifier(j.leftTable) + "." + quoteSqlIdentifier(j.leftField));
            }
            joinedTables.add(j.leftTable);
          } else {
            let effType = (rawJoinType === "FULL" || rawJoinType === "FULL OUTER") ? "LEFT" : rawJoinType;
            if (effType === "CROSS") {
              sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(j.rightTable));
            } else {
              sqlLines.push(effType + " JOIN " + quoteSqlIdentifier(j.rightTable) + " ON " + quoteSqlIdentifier(j.leftTable) + "." + quoteSqlIdentifier(j.leftField) + " = " + quoteSqlIdentifier(j.rightTable) + "." + quoteSqlIdentifier(j.rightField));
            }
            joinedTables.add(j.rightTable);
          }
        } else {
          const j = pendingJoins[0];
          sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(j.leftTable));
          joinedTables.add(j.leftTable);
        }
      }

      selectedTables.forEach(t => {
        if (!joinedTables.has(t)) {
          sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(t));
          joinedTables.add(t);
        }
      });

      if (whereConditions.length > 0) {
        sqlLines.push("WHERE " + whereConditions.join(" AND "));
      }

      if (showTotals && groupByItems.length > 0) {
        sqlLines.push("GROUP BY " + groupByItems.join(", "));
      }

      if (showTotals && havingConditions.length > 0) {
        sqlLines.push("HAVING " + havingConditions.join(" AND "));
      }

      if (orderByItems.length > 0) {
        sqlLines.push("ORDER BY " + orderByItems.join(", "));
      }

      if (queryDesignerState.topLimit && queryDesignerState.topLimit > 0) {
        sqlLines.push("LIMIT " + queryDesignerState.topLimit + ";");
      } else {
        sqlLines.push(";");
      }

      return sqlLines.join("\\n");
    }

    function renderQueryDesigner() {
      const container = document.getElementById("designerContainer");
      if (!container) return;
      ensureQueryDesignerState();

      if (!currentSchema || (!currentSchema.tables && !currentSchema.views)) {
        container.innerHTML = '<div class="designer-empty">Load a schema from the sidebar to begin building a query.</div>';
        return;
      }

      const selectedTables = queryDesignerState.selectedTables || [];
      const tablesList = (currentSchema.tables || [])
        .map(t => t.name)
        .filter(name => !selectedTables.includes(name));
      const viewsList = (currentSchema.views || [])
        .map(v => v.name)
        .filter(name => !selectedTables.includes(name));

      // 1. Access Ribbon Toolbar
      const ribbonHtml = \`
        <div class="qbe-ribbon">
          <div class="qbe-ribbon-group">
            <div class="qbe-view-switch">
              <button class="qbe-view-btn \${queryDesignerState.activeView === 'design' ? 'active' : ''}" onclick="setDesignerActiveView('design')" title="Design View (QBE Matrix & Relationships)">📐 Design</button>
              <button class="qbe-view-btn \${queryDesignerState.activeView === 'sql' ? 'active' : ''}" onclick="setDesignerActiveView('sql')" title="SQL View (Direct SQL Preview)">💻 SQL</button>
              <button class="qbe-view-btn \${queryDesignerState.activeView === 'datasheet' ? 'active' : ''}" onclick="setDesignerActiveView('datasheet')" title="Datasheet View (Live Data Results)">📋 Datasheet</button>
            </div>
            <div class="qbe-divider"></div>
            <button class="btn btn-sm qbe-btn-run" onclick="runDesignerQuery()" title="Run query and view Datasheet">! Run</button>
            <button class="qbe-btn-toggle \${queryDesignerState.showTotals ? 'active' : ''}" onclick="toggleDesignerTotals()" title="Toggle Totals (Group By, Sum, Avg, Count, etc.)">Σ Totals</button>
            <button class="qbe-btn-toggle \${queryDesignerState.distinct ? 'active' : ''}" onclick="toggleDesignerDistinct()" title="Unique Values (SELECT DISTINCT)">Distinct</button>
            <span style="font-size: 11px; color: var(--text-dim); margin-left: 2px;">Top:</span>
            <select class="qbe-select" onchange="setDesignerTopLimit(this.value)" style="width: 80px;">
              <option value="0" \${queryDesignerState.topLimit === 0 ? 'selected' : ''}>All</option>
              <option value="5" \${queryDesignerState.topLimit === 5 ? 'selected' : ''}>5</option>
              <option value="10" \${queryDesignerState.topLimit === 10 ? 'selected' : ''}>10</option>
              <option value="25" \${queryDesignerState.topLimit === 25 ? 'selected' : ''}>25</option>
              <option value="50" \${queryDesignerState.topLimit === 50 ? 'selected' : ''}>50</option>
              <option value="100" \${queryDesignerState.topLimit === 100 ? 'selected' : ''}>100</option>
              <option value="500" \${queryDesignerState.topLimit === 500 ? 'selected' : ''}>500</option>
              <option value="1000" \${queryDesignerState.topLimit === 1000 ? 'selected' : ''}>1000</option>
            </select>
            <select id="designerPresetSelect" class="qbe-select" onchange="applyDesignerPreset(this.value); this.value='';" style="max-width: 175px; font-weight: 600; color: var(--amber);">
              <option value="">⚡ Presets / Templates</option>
              <option value="ecommerce_multi">🛒 4-Table E-Commerce (Full Relational)</option>
              <option value="top_spenders">Top Spenders (Aggregated)</option>
              <option value="join_left">Access 2: Customers (LEFT JOIN)</option>
              <option value="join_right">Access 3: Orders (RIGHT JOIN)</option>
              <option value="join_full">Access 4: Customers & Orders (FULL JOIN)</option>
              <option value="join_cross">Access 5: Cross Cartesian Product</option>
              <option value="low_stock">Low Stock Restock Alerts</option>
              <option value="orders_status">Active Orders Pipeline</option>
              <option value="blank">Blank Query (Reset)</option>
            </select>
          </div>
          <div class="qbe-ribbon-group">
            <select id="designerTablePicker" class="qbe-select" style="max-width: 155px;">
              <option value="">+ Add Table / View</option>
              \${tablesList.length ? \`<optgroup label="📋 Tables">\${tablesList.map(name => \`<option value="\${escapeHtml(name)}">\${escapeHtml(name)}</option>\`).join('')}</optgroup>\` : ''}
              \${viewsList.length ? \`<optgroup label="👁️ Views">\${viewsList.map(name => \`<option value="\${escapeHtml(name)}">\${escapeHtml(name)} (View)</option>\`).join('')}</optgroup>\` : ''}
            </select>
            <button class="btn btn-sm" onclick="addDesignerTableFromPicker()">Add</button>
            <button class="btn btn-sm" onclick="openJoinPropertiesModal()" title="Open Microsoft Access Join Properties dialog">+ Link / Join</button>
            <button class="btn btn-sm" onclick="autoJoinDesignerTables()" title="Auto-detect relationships between tables across full schema graph">⚡ Auto-Detect Joins</button>
            <button class="btn btn-sm" onclick="autoArrangeDesignerTables()" title="Auto-arrange table layout on relationship canvas">📐 Auto-Arrange</button>
            <button class="btn btn-sm" onclick="addDesignerQbeColumn()" title="Add custom column to QBE grid">+ Column</button>
            <button class="btn btn-sm" onclick="clearDesignerQbe()" title="Clear QBE columns">Clear</button>
            <button class="btn btn-sm" onclick="toggleSidebarCollapse()" title="Toggle sidebar to maximize screen room for visual designer">◀▶ Sidebar</button>
            <button class="btn btn-sm" onclick="saveDesignerQuery()" title="Save query in workspace memory">💾 Save</button>
            <button class="btn btn-sm" onclick="saveDesignerAsView()" title="Persist this query as a permanent SQL VIEW in the database">👁️ Create View</button>
          </div>
        </div>
      \`;

      // 2. View: SQL View
      if (queryDesignerState.activeView === "sql") {
        const sqlPreview = buildDesignerSql();
        const savedList = (queryDesignerState.savedQueries || []).map((item, idx) => \`
          <div class="qbe-saved-chip">
            <button class="btn btn-sm" onclick="loadSavedDesignerQuery(\${idx})" title="Click to load saved SQL">\${escapeHtml(item.name)}</button>
            <button class="sidebar-mini-btn" onclick="deleteSavedDesignerQuery(\${idx})" title="Delete saved query">✕</button>
          </div>
        \`).join('') || '<span style="color: var(--text-dim); font-size: 11px;">No saved queries yet.</span>';

        container.innerHTML = ribbonHtml + \`
          <div class="designer-sql-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 6px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="card-title" style="margin-bottom:0;">Generated Microsoft Access-Compatible SQL</div>
                <div style="display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
                  <span style="font-size: 10px; color: var(--text-dim);">Text:</span>
                  <button class="btn btn-sm" onclick="adjustSqlFontSize(-1)" title="Decrease font size" style="padding: 1px 5px; font-size: 10px;">A−</button>
                  <span id="sqlFontBadge" style="font-size: 10px; color: var(--cyan); font-family: var(--font-mono);">\${queryDesignerState.sqlFontSize || 13}px</span>
                  <button class="btn btn-sm" onclick="adjustSqlFontSize(1)" title="Increase font size" style="padding: 1px 5px; font-size: 10px;">A+</button>
                  <button class="btn btn-sm" onclick="toggleSqlEditorHeight()" title="Expand / shrink editor height" style="padding: 1px 6px; font-size: 10px;">↕ Resize Editor</button>
                </div>
              </div>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-sm btn-primary" onclick="runCustomDesignerSql()" title="Execute SQL directly in Datasheet">! Run Edited SQL</button>
                <button class="btn btn-sm" onclick="resetDesignerSqlToQbe()" title="Reset SQL back to QBE generated SQL">🔄 Reset from QBE</button>
                <button class="btn btn-sm" onclick="loadDesignerSqlToEditor()">Load into Editor</button>
                <button class="btn btn-sm" onclick="copyDesignerSql()">Copy SQL</button>
                <button class="btn btn-sm" onclick="explainDesignerQuery()">Explain Plan</button>
              </div>
            </div>
            <textarea class="designer-sql-preview" id="designerSqlPreview" style="font-size: \${queryDesignerState.sqlFontSize || 13}px;" placeholder="Write or edit SQL statement..." onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') runCustomDesignerSql()">\${escapeHtml(sqlPreview)}</textarea>
            <div style="margin-top: 8px;">
              <div style="font-size: 11px; color: var(--text-dim); margin-bottom: 6px; font-weight: 600;">Saved Queries:</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">\${savedList}</div>
            </div>
          </div>
        \`;
        return;
      }

      // 3. View: Datasheet View
      if (queryDesignerState.activeView === "datasheet") {
        const ds = queryDesignerState.datasheet;
        let contentHtml = "";

        if (queryDesignerState.datasheetLoading) {
          contentHtml = \`
            <div class="designer-empty">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 10px;">
                <div style="font-size: 20px;">⚡</div>
                <div>Executing query against MySQL database...</div>
              </div>
            </div>
          \`;
        } else if (ds && ds.error) {
          contentHtml = \`
            <div style="padding: 20px;">
              <div class="card" style="border-color: var(--rose);">
                <div class="card-title" style="color: var(--rose);">⚠️ Query Execution Error</div>
                <div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-main); margin: 8px 0;">\${ds.error}</div>
                <button class="btn btn-sm btn-primary" onclick="setDesignerActiveView('design')">Return to Design View</button>
              </div>
            </div>
          \`;
        } else if (ds && ds.rows) {
          const rows = ds.rows;
          const cols = ds.columns || (rows.length ? Object.keys(rows[0]) : []);

          contentHtml = \`
            <div class="grid-table-container" style="flex: 1;">
              <table class="data-grid">
                <thead>
                  <tr>
                    <th style="width: 40px; text-align: center;">#</th>
                    \${cols.map(c => \`<th>\${c}</th>\`).join('')}
                  </tr>
                </thead>
                <tbody>
                  \${rows.length === 0 ? '<tr><td colspan="' + (cols.length + 1) + '" style="text-align:center; color:var(--text-dim); padding:20px;">0 records returned</td></tr>' : rows.map((r, idx) => \`
                    <tr>
                      <td style="color: var(--text-dim); font-size: 10px; text-align: center;">\${idx + 1}</td>
                      \${cols.map(c => \`<td>\${r[c] !== null && r[c] !== undefined ? escapeHtml(String(r[c])) : '<span style="color:var(--text-dim);">NULL</span>'}</td>\`).join('')}
                    </tr>
                  \`).join('')}
                </tbody>
              </table>
            </div>
          \`;
        } else {
          contentHtml = \`
            <div class="designer-empty">
              <div>Click <strong>! Run</strong> to execute your query and view live data.</div>
            </div>
          \`;
        }

        container.innerHTML = ribbonHtml + \`
          <div class="qbe-datasheet-container">
            <div class="qbe-datasheet-toolbar">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="font-weight: 700; color: var(--cyan);">📋 Datasheet View</span>
                \${ds ? \`<span style="font-size: 10px; background: rgba(56, 189, 248, 0.15); color: var(--cyan); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">\${ds.rows.length} rows (\${ds.latencyMs}ms)</span>\` : ''}
                <input type="text" placeholder="🔍 Filter rows..." oninput="filterDesignerDatasheet(this.value)" style="padding: 4px 8px; font-size: 11px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-main); width: 130px; outline: none;">
                <!-- Datasheet Density & Font -->
                <div style="display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
                  <span style="font-size: 10px; color: var(--text-dim);">Density:</span>
                  <button class="btn btn-sm \${queryDesignerState.datasheetDensity === 'compact' ? 'btn-primary' : ''}" onclick="setDatasheetDensity('compact')" style="padding: 1px 5px; font-size: 10px;">Compact</button>
                  <button class="btn btn-sm \${!queryDesignerState.datasheetDensity || queryDesignerState.datasheetDensity === 'normal' ? 'btn-primary' : ''}" onclick="setDatasheetDensity('normal')" style="padding: 1px 5px; font-size: 10px;">Normal</button>
                  <button class="btn btn-sm \${queryDesignerState.datasheetDensity === 'spacious' ? 'btn-primary' : ''}" onclick="setDatasheetDensity('spacious')" style="padding: 1px 5px; font-size: 10px;">Spacious</button>
                  <span style="font-size: 10px; color: var(--text-dim); margin-left: 4px;">Text:</span>
                  <button class="btn btn-sm" onclick="adjustDatasheetFontSize(-1)" style="padding: 1px 5px; font-size: 10px;">A−</button>
                  <span id="dsFontBadge" style="font-size: 10px; color: var(--cyan); font-family: var(--font-mono);">\${queryDesignerState.datasheetFontSize || 11}px</span>
                  <button class="btn btn-sm" onclick="adjustDatasheetFontSize(1)" style="padding: 1px 5px; font-size: 10px;">A+</button>
                </div>
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-sm" onclick="exportDesignerDatasheet('csv')" title="Download as CSV">Export CSV</button>
                <button class="btn btn-sm" onclick="exportDesignerDatasheet('json')" title="Download as JSON">Export JSON</button>
                <button class="btn btn-sm" onclick="copyDesignerDatasheetMarkdown()" title="Copy as Markdown table">📋 Markdown</button>
                <button class="btn btn-sm" onclick="copyDesignerDatasheetSqlInsert()" title="Copy as SQL INSERT statements">📥 SQL Inserts</button>
                <button class="btn btn-sm btn-primary" onclick="setDesignerActiveView('design')">📐 Design View</button>
              </div>
            </div>
            \${contentHtml}
          </div>
        \`;
        return;
      }

      // 4. View: Design View (Access Workbench + QBE Grid)
      // Top Workbench: Table Cards
      // 4. View: Design View (Access Workbench + QBE Grid)
      // Top Workbench: Table Cards
      const tableCardsHtml = selectedTables.map(tableName => {
        const meta = getEntityMeta(tableName);
        if (!meta) return "";
        const isView = (currentSchema.views || []).some(v => v.name === tableName);
        const icon = isView ? '👁️' : '🗄️';
        const pos = (queryDesignerState.tablePositions && queryDesignerState.tablePositions[tableName]) || { x: 20, y: 15 };
        const cardStyle = \`position: absolute; left: \${pos.x}px; top: \${pos.y}px; width: 230px;\`;
        const columnsHtml = (meta.columns || []).map(c => \`
          <div class="qbe-field-row" id="qbeFieldRow_\${tableName}_\${c.name}" draggable="true" ondragstart="onDesignerFieldDragStart(event, '\${tableName}', '\${c.name}')" ondragover="onDesignerFieldDragOver(event)" ondragenter="onDesignerFieldDragEnter(event, '\${tableName}', '\${c.name}')" ondragleave="onDesignerFieldDragLeave(event)" ondrop="onDesignerFieldDrop(event, '\${tableName}', '\${c.name}')" onclick="addDesignerQbeColumn('\${tableName}', '\${c.name}')" title="Drag to another field to link, or click to add to QBE Grid">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span class="qbe-field-connector" title="Drag to link this field">●</span>
              <span>\${c.pk ? '🔑 ' : ''}\${c.name}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 9px; color: var(--text-dim);">\${c.type || 'ANY'}</span>
              <span class="qbe-field-add-icon">+</span>
            </div>
          </div>
        \`).join('');

        return \`
          <div class="qbe-table-card" id="qbeTableCard_\${tableName}" style="\${cardStyle}">
            <div class="qbe-table-card-header" onmousedown="onDesignerTableHeaderMouseDown(event, '\${tableName}')" title="Drag header to move table on canvas">
              <span style="pointer-events: none;">\${icon} \${tableName}\${isView ? ' <span style="font-size: 9px; opacity: 0.7; font-weight: normal;">(view)</span>' : ''}</span>
              <button class="sidebar-mini-btn" onclick="removeDesignerTable('\${tableName}')" title="Remove table">✕</button>
            </div>
            <div class="qbe-table-card-fields">\${columnsHtml}</div>
          </div>
        \`;
      }).join('') || \`
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 22px 16px; background: rgba(255, 255, 255, 0.02); border: 1px dashed var(--border-subtle); border-radius: 8px; text-align: center; width: 100%;">
          <div style="font-size: 22px; margin-bottom: 6px;">🗂️</div>
          <div style="font-weight: 700; font-size: 13px; color: var(--text-main); margin-bottom: 4px;">Relationship Canvas Ready</div>
          <div style="font-size: 11px; color: var(--text-dim); max-width: 440px; margin-bottom: 12px;">Add tables using the &quot;+ Add Table&quot; selector above or load a pre-configured template:</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
            <button class="btn btn-sm" onclick="applyDesignerPreset('ecommerce_multi')" title="Load 4-table relational e-commerce query">🛒 4-Table E-Commerce</button>
            <button class="btn btn-sm" onclick="applyDesignerPreset('top_spenders')" title="Load Customer + Orders join query">🌟 Top Spenders</button>
            <button class="btn btn-sm" onclick="applyDesignerPreset('join_left')" title="Access 2: Customers (LEFT JOIN)">Access 2: Customers (LEFT)</button>
            <button class="btn btn-sm" onclick="applyDesignerPreset('join_right')" title="Access 3: Orders (RIGHT JOIN)">Access 3: Orders (RIGHT)</button>
            <button class="btn btn-sm" onclick="applyDesignerPreset('join_full')" title="Access 4: Customers & Orders (FULL JOIN)">Access 4: Customers & Orders (FULL)</button>
            <button class="btn btn-sm" onclick="applyDesignerPreset('low_stock')" title="Load Products restock alert">📦 Low Stock Alerts</button>
            <button class="btn btn-sm" onclick="applyDesignerPreset('orders_status')" title="Load Orders pipeline">📈 Orders Pipeline</button>
          </div>
        </div>
      \`;

      // Multi-table Topology Status
      const activeJoins = queryDesignerState.joins || [];
      const tablesInJoins = new Set();
      activeJoins.forEach(j => {
        tablesInJoins.add(j.leftTable);
        tablesInJoins.add(j.rightTable);
      });
      const unconnectedTables = selectedTables.filter(t => !tablesInJoins.has(t) && selectedTables.length > 1);

      let topologyStatusHtml = "";
      if (selectedTables.length > 1) {
        if (unconnectedTables.length === 0) {
          topologyStatusHtml = \`
            <div style="display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: var(--emerald); background: rgba(16, 185, 129, 0.1); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3);">
              <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--emerald);"></span>
              <span>All \${selectedTables.length} tables connected in relational graph</span>
            </div>
          \`;
        } else {
          topologyStatusHtml = \`
            <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: var(--amber); background: rgba(245, 158, 11, 0.1); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3);">
              <span>⚠️ \${unconnectedTables.join(', ')} unconnected</span>
              <button class="btn btn-sm" onclick="autoJoinDesignerTables()" style="padding: 1px 6px; font-size: 9px;">⚡ Auto-Detect Joins</button>
            </div>
          \`;
        }
      }

      // Active Joins Strip with Editable Tables & Fields
      const joinsHtml = activeJoins.map(join => {
        const leftMeta = getEntityMeta(join.leftTable);
        const rightMeta = getEntityMeta(join.rightTable);
        const leftFields = leftMeta && leftMeta.columns ? leftMeta.columns.map(c => c.name) : [];
        const rightFields = rightMeta && rightMeta.columns ? rightMeta.columns.map(c => c.name) : [];
        const joinTypes = [
          { val: "INNER", label: "1: Only matching rows (INNER)" },
          { val: "LEFT", label: "2: ALL records from " + join.leftTable + " (LEFT)" },
          { val: "RIGHT", label: "3: ALL records from " + join.rightTable + " (RIGHT)" },
          { val: "FULL", label: "4: ALL records from BOTH (FULL OUTER)" },
          { val: "CROSS", label: "5: Cartesian product (CROSS)" },
        ];

        return \`
          <div class="qbe-join-badge">
            <button class="btn btn-sm" onclick="openJoinPropertiesModal('\${join.key}')" title="Configure in Microsoft Access Join Properties dialog" style="padding: 2px 7px; font-size: 10px; font-weight: 700; color: var(--cyan); border-color: rgba(56, 189, 248, 0.4);">📐 Properties</button>
            <select class="qbe-select" onchange="updateDesignerJoin('\${join.key}', 'type', this.value)" style="font-weight: 600; color: var(--cyan);">
              \${joinTypes.map(j => \`<option value="\${j.val}" \${join.type === j.val ? 'selected' : ''}>\${j.label}</option>\`).join('')}
            </select>
            <select class="qbe-select" onchange="updateDesignerJoinTable('\${join.key}', 'leftTable', this.value)" style="font-weight: 700; color: var(--text-main);">
              \${selectedTables.map(t => \`<option value="\${t}" \${join.leftTable === t ? 'selected' : ''}>\${t}</option>\`).join('')}
            </select>
            <span style="color: var(--text-dim); font-weight: bold;">.</span>
            <select class="qbe-select" onchange="updateDesignerJoin('\${join.key}', 'leftField', this.value)">
              \${leftFields.map(f => \`<option value="\${f}" \${join.leftField === f ? 'selected' : ''}>\${f}</option>\`).join('')}
            </select>
            <span style="color: var(--cyan); font-weight: bold; margin: 0 4px;">=</span>
            <select class="qbe-select" onchange="updateDesignerJoinTable('\${join.key}', 'rightTable', this.value)" style="font-weight: 700; color: var(--text-main);">
              \${selectedTables.map(t => \`<option value="\${t}" \${join.rightTable === t ? 'selected' : ''}>\${t}</option>\`).join('')}
            </select>
            <span style="color: var(--text-dim); font-weight: bold;">.</span>
            <select class="qbe-select" onchange="updateDesignerJoin('\${join.key}', 'rightField', this.value)">
              \${rightFields.map(f => \`<option value="\${f}" \${join.rightField === f ? 'selected' : ''}>\${f}</option>\`).join('')}
            </select>
            <button class="sidebar-mini-btn" onclick="removeDesignerJoin('\${join.key}')" title="Delete join">✕</button>
          </div>
        \`;
      }).join('') || '<div style="color: var(--text-dim); font-size: 11px;">No relationships active. Click <strong>⚡ Auto-Detect Joins</strong> or <strong>+ Link / Join</strong>.</div>';

      // Lower Pane: Classic Microsoft Access QBE Matrix
      const columns = queryDesignerState.columns || [];
      const totalsList = ["GroupBy", "Sum", "Avg", "Min", "Max", "Count", "Where", "Expression"];

      // Generate rows of the matrix
      const headerRow = \`
        <tr>
          <td class="qbe-matrix-header-cell">Field:</td>
          \${columns.map(col => {
            const tableMeta = getEntityMeta(col.table);
            const fields = tableMeta && tableMeta.columns ? tableMeta.columns.map(c => c.name) : [];
            return \`
              <td class="qbe-matrix-col-cell">
                <select onchange="updateDesignerQbeColumn('\${col.id}', 'field', this.value)" style="font-weight: 600; color: var(--cyan);">
                  <option value="*" \${col.field === '*' ? 'selected' : ''}>* (All Fields)</option>
                  \${fields.map(f => \`<option value="\${f}" \${col.field === f ? 'selected' : ''}>\${f}</option>\`).join('')}
                </select>
              </td>
            \`;
          }).join('')}
          <td class="qbe-matrix-col-cell" style="width: 60px; min-width: 60px; text-align: center;"></td>
        </tr>
      \`;

      const tableRow = \`
        <tr>
          <td class="qbe-matrix-header-cell">Table:</td>
          \${columns.map(col => \`
            <td class="qbe-matrix-col-cell">
              <select onchange="updateDesignerQbeColumn('\${col.id}', 'table', this.value)">
                \${selectedTables.map(t => \`<option value="\${t}" \${col.table === t ? 'selected' : ''}>\${t}</option>\`).join('')}
              </select>
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const totalRow = queryDesignerState.showTotals ? \`
        <tr style="background: rgba(56, 189, 248, 0.03);">
          <td class="qbe-matrix-header-cell" style="color: var(--emerald);">Σ Total:</td>
          \${columns.map(col => \`
            <td class="qbe-matrix-col-cell">
              <select onchange="updateDesignerQbeColumn('\${col.id}', 'total', this.value)" style="font-weight: 600; color: \${col.total === 'GroupBy' ? 'var(--cyan)' : (['Sum', 'Count', 'Avg'].includes(col.total) ? 'var(--emerald)' : 'var(--text-main)')};">
                \${totalsList.map(tot => \`<option value="\${tot}" \${col.total === tot ? 'selected' : ''}>\${tot}</option>\`).join('')}
              </select>
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \` : "";

      const sortRow = \`
        <tr>
          <td class="qbe-matrix-header-cell">Sort:</td>
          \${columns.map(col => \`
            <td class="qbe-matrix-col-cell">
              <select onchange="updateDesignerQbeColumn('\${col.id}', 'sort', this.value)">
                <option value="" \${!col.sort ? 'selected' : ''}>(not sorted)</option>
                <option value="ASC" \${col.sort === 'ASC' ? 'selected' : ''}>Ascending</option>
                <option value="DESC" \${col.sort === 'DESC' ? 'selected' : ''}>Descending</option>
              </select>
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const showRow = \`
        <tr>
          <td class="qbe-matrix-header-cell">Show:</td>
          \${columns.map(col => \`
            <td class="qbe-matrix-col-cell qbe-show-checkbox">
              <input type="checkbox" \${col.show !== false ? 'checked' : ''} onchange="updateDesignerQbeColumn('\${col.id}', 'show', this.checked)">
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const criteriaRow = \`
        <tr>
          <td class="qbe-matrix-header-cell">Criteria:</td>
          \${columns.map(col => \`
            <td class="qbe-matrix-col-cell">
              <input value="\${(col.criteria || '').replace(/"/g, '&quot;')}" placeholder="e.g. > 100, VIP" onchange="updateDesignerQbeColumn('\${col.id}', 'criteria', this.value)">
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const or1Row = \`
        <tr>
          <td class="qbe-matrix-header-cell" style="color: var(--text-dim); font-size: 10px;">or:</td>
          \${columns.map(col => \`
            <td class="qbe-matrix-col-cell">
              <input value="\${(col.or1 || '').replace(/"/g, '&quot;')}" placeholder="or condition" onchange="updateDesignerQbeColumn('\${col.id}', 'or1', this.value)">
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const or2Row = \`
        <tr>
          <td class="qbe-matrix-header-cell" style="color: var(--text-dim); font-size: 10px;">or:</td>
          \${columns.map(col => \`
            <td class="qbe-matrix-col-cell">
              <input value="\${(col.or2 || '').replace(/"/g, '&quot;')}" placeholder="or condition" onchange="updateDesignerQbeColumn('\${col.id}', 'or2', this.value)">
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell"></td>
        </tr>
      \`;

      const actionsRow = \`
        <tr>
          <td class="qbe-matrix-header-cell" style="color: var(--text-dim); font-size: 10px;">Order / Del:</td>
          \${columns.map((col, idx) => \`
            <td class="qbe-matrix-col-cell" style="text-align: center;">
              <button class="sidebar-mini-btn" onclick="moveDesignerQbeColumn('\${col.id}', -1)" \${idx === 0 ? 'disabled' : ''} title="Move left">◀</button>
              <button class="sidebar-mini-btn" onclick="moveDesignerQbeColumn('\${col.id}', 1)" \${idx === columns.length - 1 ? 'disabled' : ''} title="Move right">▶</button>
              <button class="sidebar-mini-btn" onclick="removeDesignerQbeColumn('\${col.id}')" title="Remove column">✕</button>
            </td>
          \`).join('')}
          <td class="qbe-matrix-col-cell" style="text-align: center;">
            <button class="btn btn-sm btn-primary" onclick="addDesignerQbeColumn()" title="Add column">+ Add</button>
          </td>
        </tr>
      \`;

      const maxCanvasWidth = Math.max(
        800,
        selectedTables.reduce((max, t) => {
          const p = (queryDesignerState.tablePositions && queryDesignerState.tablePositions[t]) || { x: 20 };
          return Math.max(max, p.x + 280);
        }, 600)
      );

      container.innerHTML = ribbonHtml + \`
        <!-- Upper Relationship Workbench -->
        <div class="qbe-workbench">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px;">Microsoft Access Relationship Canvas</span>
              <span style="font-size: 10px; color: var(--text-dim);">(Drag headers to position, drag field to field to join, scroll or Ctrl+Wheel to zoom, drag empty space to pan)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <!-- Zoom Controls -->
              <div class="qbe-zoom-controls" style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
                <span style="font-size: 10px; color: var(--text-dim); margin-right: 2px;">Zoom:</span>
                <button class="btn btn-sm" onclick="zoomOutDesignerCanvas()" title="Zoom out canvas (Ctrl + Wheel Down)" style="padding: 1px 6px; font-size: 11px;">🔍−</button>
                <select id="canvasZoomSelect" class="qbe-select" onchange="setDesignerCanvasZoom(parseFloat(this.value))" style="padding: 1px 4px; font-size: 10px; width: 62px; height: 22px;">
                  <option value="0.5" \${queryDesignerState.canvasZoom === 0.5 ? 'selected' : ''}>50%</option>
                  <option value="0.75" \${queryDesignerState.canvasZoom === 0.75 ? 'selected' : ''}>75%</option>
                  <option value="0.9" \${queryDesignerState.canvasZoom === 0.9 ? 'selected' : ''}>90%</option>
                  <option value="1" \${!queryDesignerState.canvasZoom || queryDesignerState.canvasZoom === 1 ? 'selected' : ''}>100%</option>
                  <option value="1.25" \${queryDesignerState.canvasZoom === 1.25 ? 'selected' : ''}>125%</option>
                  <option value="1.5" \${queryDesignerState.canvasZoom === 1.5 ? 'selected' : ''}>150%</option>
                  <option value="2" \${queryDesignerState.canvasZoom === 2 ? 'selected' : ''}>200%</option>
                </select>
                <button class="btn btn-sm" onclick="zoomInDesignerCanvas()" title="Zoom in canvas (Ctrl + Wheel Up)" style="padding: 1px 6px; font-size: 11px;">🔍+</button>
                <button class="btn btn-sm" onclick="resetDesignerCanvasZoom()" title="Reset zoom to 100%" style="padding: 1px 6px; font-size: 10px;">1:1</button>
                <button class="btn btn-sm" onclick="fitDesignerCanvasZoom()" title="Fit all tables into viewport" style="padding: 1px 6px; font-size: 10px;">🎯 Fit</button>
              </div>

              <!-- Room Controls -->
              <div class="qbe-room-controls" style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
                <span style="font-size: 10px; color: var(--text-dim); margin-right: 2px;">Room:</span>
                <button class="btn btn-sm \${queryDesignerState.canvasViewMode === 'canvas-max' ? 'btn-primary' : ''}" onclick="setDesignerRoomMode('canvas-max')" title="Maximize Canvas room" style="padding: 1px 6px; font-size: 10px;">⤢ Canvas</button>
                <button class="btn btn-sm \${!queryDesignerState.canvasViewMode || queryDesignerState.canvasViewMode === 'split' ? 'btn-primary' : ''}" onclick="setDesignerRoomMode('split')" title="Balanced Split room" style="padding: 1px 6px; font-size: 10px;">⤡ Split</button>
                <button class="btn btn-sm \${queryDesignerState.canvasViewMode === 'grid-max' ? 'btn-primary' : ''}" onclick="setDesignerRoomMode('grid-max')" title="Maximize Grid room" style="padding: 1px 6px; font-size: 10px;">⤢ Grid</button>
              </div>

              <button class="btn btn-sm" onclick="autoArrangeDesignerTables()" style="padding: 1px 7px; font-size: 10px;" title="Reset and arrange cards neatly">📐 Reset</button>
              <span style="font-size: 10px; color: var(--cyan); font-weight: 600;">\${selectedTables.length} Tables Active</span>
            </div>
          </div>
          <div class="qbe-canvas-viewport" id="qbeCanvasViewport" onscroll="updateCanvasSvg()" style="height: \${queryDesignerState.canvasHeight || 480}px; max-height: \${queryDesignerState.canvasHeight || 480}px;">
            <div class="qbe-canvas-stage" id="qbeCanvasStage" style="transform: scale(\${queryDesignerState.canvasZoom || 1.0});">
              <svg class="qbe-canvas-svg" id="qbeCanvasSvg"></svg>
              <div class="qbe-tables-canvas" id="qbeTablesCanvas" style="min-width: \${maxCanvasWidth}px;">
                \${tableCardsHtml}
              </div>
            </div>
          </div>
          <div class="qbe-joins-bar">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <div style="font-size: 10px; font-weight: 700; color: var(--text-dim);">JOIN PROPERTIES &amp; RELATIONSHIPS (\${activeJoins.length} Active):</div>
              \${topologyStatusHtml}
            </div>
            \${joinsHtml}
          </div>
        </div>

        <!-- Draggable Resizer Splitter -->
        <div class="qbe-resizer-bar" id="qbeResizerBar" title="Drag to resize Canvas vs Grid room (200px - 1200px)">
          <div class="qbe-resizer-handle"></div>
        </div>

        <!-- Lower QBE Design Grid -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-dim);">QUERY BY EXAMPLE (QBE) DESIGN GRID</span>
            <button class="btn btn-sm" onclick="toggleCriteriaHelp()" style="padding: 2px 8px; font-size: 10px;" title="View Microsoft Access &amp; MySQL Criteria Syntax">💡 Syntax Help</button>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-subtle);">
              <span style="font-size: 10px; color: var(--text-dim);">Grid Density:</span>
              <button class="btn btn-sm \${queryDesignerState.gridDensity === 'compact' ? 'btn-primary' : ''}" onclick="setQbeGridDensity('compact')" style="padding: 1px 5px; font-size: 10px;">Compact</button>
              <button class="btn btn-sm \${!queryDesignerState.gridDensity || queryDesignerState.gridDensity === 'normal' ? 'btn-primary' : ''}" onclick="setQbeGridDensity('normal')" style="padding: 1px 5px; font-size: 10px;">Normal</button>
              <button class="btn btn-sm \${queryDesignerState.gridDensity === 'spacious' ? 'btn-primary' : ''}" onclick="setQbeGridDensity('spacious')" style="padding: 1px 5px; font-size: 10px;">Spacious</button>
            </div>
            <span style="font-size: 10px; color: var(--text-dim);">\${columns.length} columns defined</span>
          </div>
        </div>
        <div id="criteriaHelpBanner" style="display: none; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; margin: 4px 0 8px; font-size: 11px; color: var(--text-muted); line-height: 1.6;">
          <strong style="color: var(--cyan);">Access &amp; MySQL Criteria Cheat Sheet:</strong><br>
          • <strong>Comparison:</strong> <code>&gt; 100</code>, <code>&lt;= 50</code>, <code>&lt;&gt; 'cancelled'</code>, <code>!= 'inactive'</code><br>
          • <strong>Ranges:</strong> <code>BETWEEN 10 AND 50</code><br>
          • <strong>Pattern Matches:</strong> <code>LIKE 'A%'</code> (starts with A), <code>LIKE '%corp%'</code> (contains corp)<br>
          • <strong>Sets &amp; Nulls:</strong> <code>IN ('VIP', 'Enterprise')</code>, <code>IS NULL</code>, <code>IS NOT NULL</code><br>
          • <strong>Text Literals:</strong> <code>VIP</code> or <code>'VIP'</code> (quotes auto-formatted if omitted)
        </div>
        <div class="qbe-matrix-container">
          <table class="qbe-matrix-table">
            <tbody>
              \${headerRow}
              \${tableRow}
              \${totalRow}
              \${sortRow}
              \${showRow}
              \${criteriaRow}
              \${or1Row}
              \${or2Row}
              \${actionsRow}
            </tbody>
          </table>
        </div>
      \`;
      setTimeout(() => {
        updateCanvasSvg();
        initQbeSplitter();
        initCanvasPanAndZoom();
      }, 35);
    }

    // ---------------------------------------------------------------------------------------------
    // PRAGMAs & Operations
    // ---------------------------------------------------------------------------------------------
    async function seedDatabase() {
      showToast("Seeding realistic enterprise dataset...");
      const res = await apiRequest('/api/seed');
      if (res && res.success) {
        showToast(\`Database seeded (\${res.count} records)!\`);
        logAudit(\`[SEED] Seeded enterprise customers, products, and orders database\`);
        await refreshAll();
        if (currentSchema && currentSchema.tables.length > 0) {
          selectTable(currentSchema.tables[0].name);
        }
      }
    }

    async function optimizeMysqlTables() {
      showToast("Running OPTIMIZE TABLE...");
      const res = await apiRequest('/api/pragma', { pragma: 'vacuum' });
      if (!res || res.success === false) {
        showToast("OPTIMIZE TABLE failed: " + (res?.error || "Unknown error"));
        return;
      }
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = typeof res.result === "string" ? res.result : JSON.stringify(res, null, 2);
      showToast("MySQL table optimization completed successfully!");
      logAudit("[OPTIMIZE] MySQL tables optimized.");
      await refreshKpis();
    }

    async function checkMysqlTables() {
      showToast("Running CHECK TABLE...");
      const res = await apiRequest('/api/pragma', { pragma: 'integrity_check' });
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = JSON.stringify(res, null, 2);
      const rows = Array.isArray(res?.result) ? res.result : [];
      const healthy = !!res && res.success !== false && rows.length > 0 && rows.every((row) => {
        const values = Object.values(row || {});
        return values.length > 0 && String(values[0]).toLowerCase().includes("ok");
      });
      showToast(healthy ? "CHECK TABLE OK: MySQL tables are healthy!" : "CHECK TABLE reported problems - see maintenance output");
      logAudit(healthy ? "[CHECK TABLE] MySQL table validation completed: OK" : "[CHECK TABLE] MySQL table validation reported problems");
      switchTab("pragma");
    }

    async function showVariable(name) {
      const res = await apiRequest('/api/pragma', { pragma: name });
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = JSON.stringify(res, null, 2);
      if (!res || res.success === false) {
        showToast("SHOW VARIABLES LIKE '%" + name + "%' failed: " + (res?.error || "Unknown error"));
        return;
      }
      showToast("MySQL variable " + name + " inspected.");
      logAudit("[VARIABLE] SHOW VARIABLES LIKE '%" + name + "%'");
      switchTab("pragma");
    }

    async function runMysqlMaintenance(cmd) {
      const res = await apiRequest('/api/query', { sql: cmd });
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = JSON.stringify(res, null, 2);
      showToast("Command " + cmd + " executed!");
      logAudit("[COMMAND] " + cmd);
      switchTab("pragma");
    }

    // ---------------------------------------------------------------------------------------------
    // Presets & Exports
    // ---------------------------------------------------------------------------------------------
    function initPresets() {
      const select = document.getElementById("presetSelect");
      if (!select) return;
      PRESETS.forEach((p, idx) => {
        const opt = document.createElement("option");
        opt.value = p.sql;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
    }

    function applyPreset(sql) {
      if (!sql) return;
      document.getElementById("sqlEditor").value = sql;
      runEditorQuery();
    }

    function clearEditor() {
      document.getElementById("sqlEditor").value = "";
    }

    async function exportResults(format) {
      if (currentGridRows.length === 0) {
        showToast("No records available to export!");
        return;
      }

      const res = await apiRequest('/api/export', {
        format,
        tableName: activeTable || "query_results",
        rows: currentGridRows,
      });

      if (res && res.success) {
        showToast(\`Exported \${res.rowCount} rows to \${res.filename}\`);
        logAudit(\`[EXPORT] Saved \${res.path}\`);
      } else {
        showToast("Export failed: " + (res?.error || "Unknown"));
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Sidebar Resizer
    // ---------------------------------------------------------------------------------------------
    function initSidebarResizer() {
      const aside = document.getElementById("mainSidebar");
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
      const aside = document.getElementById("mainSidebar");
      if (!aside) return;
      const curW = aside.getBoundingClientRect().width;
      aside.style.width = (curW > 400 ? 360 : 520) + "px";
    }

    function adjustSidebarWidth(delta) {
      const aside = document.getElementById("mainSidebar");
      if (!aside) return;
      const curW = aside.getBoundingClientRect().width;
      aside.style.width = Math.max(260, Math.min(650, curW + delta)) + "px";
    }

    setInterval(() => {
      const el = document.getElementById("footerClock");
      if (el) el.textContent = new Date().toLocaleTimeString();
    }, 1000);

    window.applyMysqlStudioTheme = function(themeName) {
      try { localStorage.setItem('mysql_studio_theme', themeName); } catch(e) {}
      const themes = {
        midnight: { bg: '#070a12', surface: '#0e1526', accent: '#38bdf8', accentGlow: 'rgba(56, 189, 248, 0.25)', btnColor: '#ffffff' },
        codefreelance: { bg: '#050505', surface: '#121212', accent: '#0fb36a', accentGlow: 'rgba(15, 179, 106, 0.35)', btnColor: '#000000' },
        sonoma_emerald: { bg: '#0d1f18', surface: '#132e24', accent: '#30d158', accentGlow: 'rgba(48, 209, 88, 0.35)', btnColor: '#000000' },
        dracula: { bg: '#1e1f29', surface: '#282a36', accent: '#bd93f9', accentGlow: 'rgba(189, 147, 249, 0.3)', btnColor: '#ffffff' },
        nord: { bg: '#242933', surface: '#2e3440', accent: '#88c0d0', accentGlow: 'rgba(136, 192, 208, 0.3)', btnColor: '#000000' },
        cyberpunk: { bg: '#08080f', surface: '#121220', accent: '#ff007f', accentGlow: 'rgba(255, 0, 127, 0.35)', btnColor: '#ffffff' },
        apple_dark: { bg: '#161618', surface: '#242426', accent: '#0a84ff', accentGlow: 'rgba(10, 132, 255, 0.3)', btnColor: '#ffffff' },
        apple_light: { bg: '#f5f5f7', surface: '#ffffff', accent: '#007aff', accentGlow: 'rgba(0, 122, 255, 0.25)', btnColor: '#ffffff', textMain: '#1d1d1f', textMuted: '#6e6e73' },
        solarized_dark: { bg: '#00212b', surface: '#002b36', accent: '#2aa198', accentGlow: 'rgba(42, 161, 152, 0.3)', btnColor: '#ffffff' },
        github_dark: { bg: '#0d1117', surface: '#161b22', accent: '#58a6ff', accentGlow: 'rgba(88, 166, 255, 0.3)', btnColor: '#ffffff' },
        // Retro & Nostalgic Themes
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

      let styleEl = document.getElementById('mysql-dyn-theme');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'mysql-dyn-theme';
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

    window.addEventListener("DOMContentLoaded", async () => {
      try {
        const savedTheme = localStorage.getItem('mysql_studio_theme') || 'midnight';
        applyMysqlStudioTheme(savedTheme);
      } catch(e) {}
      initPresets();
      initSidebarResizer();
      queryDesignerState.savedQueries = loadSavedQueriesFromStorage();

      window.addEventListener("keydown", (e) => {
        if (e.key === "F11" || ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "F" || e.key === "f")) || (e.ctrlKey && e.metaKey && (e.key === "F" || e.key === "f"))) {
          e.preventDefault();
          window.doToggleFullscreen();
          return;
        }
        if (activeTab === "designer" && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (queryDesignerState.activeView === "sql") {
            runCustomDesignerSql();
          } else {
            runDesignerQuery();
          }
        }
      });

      window.addEventListener("resize", () => {
        if (activeTab === "designer") {
          updateCanvasSvg();
        }
      });

      // Drag and Drop support
      const dropZone = document.getElementById("dbDropZone");
      if (dropZone) {
        dropZone.addEventListener("dragover", (e) => {
          e.preventDefault();
          dropZone.classList.add("dragover");
        });
        dropZone.addEventListener("dragleave", () => {
          dropZone.classList.remove("dragover");
        });
        dropZone.addEventListener("drop", (e) => {
          e.preventDefault();
          dropZone.classList.remove("dragover");
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleDatabaseUpload(e.dataTransfer.files[0]);
          }
        });
      }

      window.addEventListener("dragover", (e) => e.preventDefault());
      window.addEventListener("drop", (e) => {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          const file = e.dataTransfer.files[0];
          if (file.name.match(/\.(mysql|db|mysql3|db3)$/i)) {
            handleDatabaseUpload(file);
          }
        }
      });

      await refreshAll();
      if (typeof loadSavedQueriesFromServer === "function") {
        try {
          await loadSavedQueriesFromServer();
          if (typeof savedQueriesStore !== "undefined" && Array.isArray(savedQueriesStore) && savedQueriesStore.length) {
            queryDesignerState.savedQueries = savedQueriesStore;
          }
        } catch (e) {}
      }
      if (currentSchema && currentSchema.tables.length > 0) {
        selectTable(currentSchema.tables[0].name);
      }

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
        if (targetModal && typeof openJoinPropertiesModal === "function") {
          openJoinPropertiesModal(targetModal === "new" ? null : targetModal);
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
    });
  </script>
  <script>
${CRUD_SCRIPT}
  </script>
  <script>
${MACRO_SCRIPT}
  </script>
  <script>
${getWindowShortcutsScript()}
  </script>
<a id="openWorkbench" href="/workbench" target="_blank" rel="noopener" title="Open the shared Database Workbench: saved connections, safe row editing, read-only and production safeguards" style="position:fixed;right:12px;bottom:12px;z-index:9999;padding:6px 12px;border-radius:999px;background:#0369a1;color:#fff;font:600 12px system-ui,sans-serif;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.4)">🧰 Workbench</a>
</body>
</html>`;
}

// -------------------------------------------------------------------------------------------------
// Desktop Workstation Window Factory
// -------------------------------------------------------------------------------------------------

function getScreenDimensions(): { width: number; height: number } {
  let screenW = 1920;
  let screenH = 1080;
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

export function createMysqlStudio(options: SystemStudioOptions = {}): MysqlStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1260);
  const height = options.height ?? (fullscreen ? screen.height : 900);
  const defaultDb = process.env.MSQL_NAME 
    || process.env.MYSQL_DATABASE 
    || process.env.MSQL_DB 
    || (process.env.MYSQL_DB_PATH && process.env.MYSQL_DB_PATH !== ":memory:" ? process.env.MYSQL_DB_PATH : "")
    || process.env.DB_NAME 
    || "my_app_dev";
  const activeDbPath = (options.initialDbPath && options.initialDbPath !== ":memory:") ? options.initialDbPath : defaultDb;
  const title = "MySQL Studio Pro -- Enterprise Embedded Database Workstation";

  const app: MysqlStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    activeDbPath,
    generateHtml: () => generateMysqlStudioHtml(),
    run: async () => {
      console.log("⚡ Launching MySQL Studio Pro (Enterprise Database Workstation)...");

      // 1. Launch Isolated Background Database Worker Engine
      // This runs on a dedicated OS thread with its own independent Bun event loop,
      // guaranteeing zero deadlock and instant sub-millisecond responses while Webview runs on the main thread.
      process.env.STUDIO_WORKER = "mysql_studio";
      if (activeDbPath && activeDbPath !== ":memory:") process.env.MYSQL_DB_PATH = activeDbPath;

      const customConfig: Partial<MysqlConnectionConfig> = options.config || {
        host: options.host,
        port: options.mysqlPort || (options.port && options.port !== 3306 ? options.port : undefined),
        user: options.user,
        password: options.password,
        database: options.database,
        tls: options.tls,
        url: options.url,
      };

      if (customConfig.host) {
        process.env.MSQL_HOST = customConfig.host;
        process.env.MYSQL_HOST = customConfig.host;
      }
      if (customConfig.port) {
        process.env.MSQL_PORT = String(customConfig.port);
        process.env.MYSQL_PORT = String(customConfig.port);
      }
      if (customConfig.user) {
        process.env.MSQL_USER = customConfig.user;
        process.env.MYSQL_USER = customConfig.user;
      }
      if (customConfig.password !== undefined) {
        process.env.MSQL_PASSWORD = customConfig.password;
        process.env.MYSQL_PASSWORD = customConfig.password;
      }
      if (customConfig.database) {
        process.env.MSQL_NAME = customConfig.database;
        process.env.MYSQL_DATABASE = customConfig.database;
        process.env.MYSQL_DB_PATH = customConfig.database;
      }
      if (customConfig.tls !== undefined) {
        const tlsStr = customConfig.tls ? "true" : "false";
        process.env.MSQL_TLS = tlsStr;
        process.env.MYSQL_TLS = tlsStr;
      }
      if (customConfig.url) {
        process.env.MSQL_URL = customConfig.url;
        process.env.DATABASE_URL = customConfig.url;
      }

      let info: { ready: boolean; port: number; url: string; type?: string };

      let serverProc: any = null;

      try {
        const workerUrl = new URL("./mysql_studio_server.ts", import.meta.url);
        const worker = new Worker(workerUrl);
        app.worker = worker;

        info = await new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error("Timeout initializing background database engine")), 1500);
          worker.onmessage = (e) => {
            if (!e.data?.type || e.data.type === "mysql_studio") {
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
        // Subprocess fallback: Spawns the server as an isolated OS process with an active Bun event loop
        const serverArgs = process.execPath.endsWith("bun")
          ? [process.execPath, process.argv[1] || resolve(import.meta.dir, "mysql_studio.ts"), "--server"]
          : [process.execPath, "--server"];

        const proc = Bun.spawn(serverArgs, {
          stdout: "pipe",
          stderr: "ignore",
          env: { ...process.env, MYSQL_STUDIO_DB: activeDbPath },
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
            type: "mysql_studio",
          };
        } else {
          const srv = startMysqlStudioServer({
            port: 0,
            host: "127.0.0.1",
            initialDbPath: activeDbPath,
            config: customConfig,
          });
          app.server = srv;
          const serverPort = srv.port ?? 0;
          info = {
            ready: true,
            port: serverPort,
            url: `http://127.0.0.1:${serverPort}`,
            type: "mysql_studio",
          };
        }
      }

      app.port = info.port;
      app.url = info.url;
      console.log(`⚡ Background Database Server active at: ${info.url}`);

      // Warm check: Ensure TCP listener and HTTP server are accepting requests before Webview navigates
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
        console.log(`⚡ Native desktop workstation window open (Fullscreen: ${fullscreen ? 'Enabled' : 'Disabled'}). (Also accessible in any browser at: ${info.url})`);

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
// Backward Compatibility & Aliases
// -------------------------------------------------------------------------------------------------

export const createDatabaseStudio = createMysqlStudio;
export const createMysqlStudioPro = createMysqlStudio;
export { startMysqlStudioServer } from "./mysql_studio_server.ts";

// -------------------------------------------------------------------------------------------------
// Standalone Direct Invocation
// -------------------------------------------------------------------------------------------------

if (process.argv.includes("--server")) {
  const initialDb = (process.env.MYSQL_STUDIO_DB && process.env.MYSQL_STUDIO_DB !== ":memory:")
    ? process.env.MYSQL_STUDIO_DB
    : (process.env.MSQL_NAME || process.env.MYSQL_DATABASE || process.env.MSQL_DB || process.env.DB_NAME || "my_app_dev");
  const srv = startMysqlStudioServer({
    port: 0,
    host: "127.0.0.1",
    initialDbPath: initialDb,
  });
  console.log(`READY:${srv.port}`);
  watchParentProcess();
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const argDb = process.argv[2];
  const initialDb = (argDb && argDb !== ":memory:")
    ? argDb
    : (process.env.MSQL_NAME || process.env.MYSQL_DATABASE || process.env.MSQL_DB || process.env.DB_NAME || "my_app_dev");
  const app = createMysqlStudio({ initialDbPath: initialDb, fullscreen: true });
  await app.run();
  process.exit(0);
}
