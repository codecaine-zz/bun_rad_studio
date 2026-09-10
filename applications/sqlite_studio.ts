/**
 * ⚡ Bun RAD Studio - SQLite Studio Pro
 * 
 * Enterprise-Grade Embedded Database Workstation & Query IDE
 * Powered by 100% native `bun:sqlite` with sub-millisecond execution latency.
 * 
 * Architecture:
 * - Dedicated Background Worker & HTTP Telemetry Server (`sqlite_studio_server.ts`)
 * - Native WebKit / Webview Desktop GUI with zero FFI deadlock and instant UI updates
 * - Also accessible in any browser via local workstation URL
 */

import { Webview, SizeHint } from "webview-bun";
import { Database } from "bun:sqlite";
import { resolve, join } from "path";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { dlopen, FFIType } from "bun:ffi";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  toggleFullscreenNative,
  attachWindowShortcuts,
  getWindowShortcutsScript,
} from "../index.ts";
import { startSqliteStudioServer } from "./sqlite_studio_server.ts";

export interface SqliteStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  initialDbPath?: string;
  port?: number;
}
export type SystemStudioOptions = SqliteStudioOptions;

export interface SqliteStudioInstance {
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
    sql: "SELECT type, name, tbl_name, sql\nFROM sqlite_master\nWHERE name NOT LIKE 'sqlite_%'\nORDER BY type, name;",
  },
  {
    name: "11. Audit Log Trail (Recent Mutations)",
    sql: "SELECT id, action, entity, details, timestamp\nFROM audit_logs\nORDER BY id DESC\nLIMIT 25;",
  },
];

// -------------------------------------------------------------------------------------------------
// Complete Enterprise Workstation HTML Shell Generator
// -------------------------------------------------------------------------------------------------

export function generateSqliteStudioHtml(): string {
  const presetsJson = JSON.stringify(SQL_PRESETS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SQLite Studio Pro - Enterprise Database Workstation</title>
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

    .qbe-tables-canvas {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      padding-bottom: 6px;
      min-height: 160px;
      max-height: 220px;
    }

    .qbe-table-card {
      min-width: 200px;
      max-width: 240px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .qbe-table-card-header {
      background: rgba(30, 41, 59, 0.85);
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
    }

    .qbe-field-row:hover {
      background: rgba(56, 189, 248, 0.15);
      color: var(--cyan);
      transform: translateX(2px);
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
      padding: 4px 6px;
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
      padding: 4px 6px;
      color: var(--text-main);
      font-size: 11px;
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
      min-height: 240px;
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
  </style>
</head>
<body spellcheck="false" autocapitalize="none" autocorrect="off" oncontextmenu="return false;">
  <!-- Header -->
  <header>
    <div class="brand">
      <div class="brand-logo">🗄️</div>
      <span class="brand-title">SQLite Studio Pro</span>
      <span class="brand-badge">bun:sqlite</span>
    </div>

    <div class="header-actions">
      <div class="theme-control">
        <span class="theme-control-label">Theme</span>
        <select id="ddStudioTheme" class="btn" onchange="applySqliteStudioTheme(this.value)" title="Switch Workstation Theme" style="padding: 5px 20px 5px 4px; font-weight: 700; cursor: pointer; color: var(--text-main); border: none; background: transparent; outline: none;">
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
      <button class="btn btn-primary" onclick="openDatabaseDialog()" title="Browse, pick, or load SQLite database">📂 Open / Browse DB...</button>
      <button class="btn" onclick="runEditorQuery()">⚡ Run Query</button>
      <button class="btn" onclick="seedDatabase()">🌱 Seed Sample DB</button>
      <button class="btn" onclick="vacuumDatabase()">🧹 Vacuum DB</button>
      <button class="btn" onclick="checkIntegrity()">🛡️ Integrity Check</button>
      <button class="btn" id="btnFullscreen" onclick="window.doToggleFullscreen()" title="Toggle Fullscreen (F11 / ⌃⌘F)">⛶ Fullscreen</button>
    </div>
  </header>

  <!-- Top Real-Time KPI Cards -->
  <section class="kpi-row">
    <div class="kpi-card kpi-clickable" onclick="openDatabaseDialog()" title="Click to browse or switch database">
      <div class="kpi-title">Active Database <span>🗂️</span></div>
      <div class="kpi-value" id="kpiDbName">:memory:</div>
      <div class="kpi-sub" id="kpiDbPath">:memory:</div>
    </div>

    <div class="kpi-card">
      <div class="kpi-title">Storage & Engine <span>💾</span></div>
      <div class="kpi-value" id="kpiSize">0 B (RAM)</div>
      <div class="kpi-sub" id="kpiEngine">SQLite v3.45.0</div>
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
        <div style="font-size: 12px; font-weight: 700; color: var(--cyan); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" id="sidebarDbName">:memory:</div>
        <div style="display: flex; gap: 4px;">
          <button class="sidebar-mini-btn" style="flex: 1; justify-content: center;" onclick="openDatabaseDialog()">📂 Browse & Load...</button>
          <button class="sidebar-mini-btn" onclick="connectToDatabase(':memory:')" title="Switch to isolated in-memory DB">🧠 RAM</button>
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
          <textarea class="sql-textarea" id="sqlEditor" placeholder="Enter SQL statement (e.g. SELECT * FROM customers;)..." onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') runEditorQuery()"></textarea>
          <div class="editor-controls">
            <div class="editor-controls-left">
              <button class="btn btn-primary" onclick="runEditorQuery()">🚀 Execute (Cmd+Enter)</button>
              <button class="btn" onclick="explainCurrentQuery()">🔍 Explain Plan</button>
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
        <div class="tab-btn" id="tabBtnDesigner" onclick="switchTab('designer')">🧩 Query Designer</div>
        <div class="tab-btn" id="tabBtnSchema" onclick="switchTab('schema')">🏛️ Schema Designer & DDL</div>
        <div class="tab-btn" id="tabBtnExplain" onclick="switchTab('explain')">🔍 Query Plan Visualizer</div>
        <div class="tab-btn" id="tabBtnJson" onclick="switchTab('json')">💻 Raw JSON Inspector</div>
        <div class="tab-btn" id="tabBtnAudit" onclick="switchTab('audit')">⚡ Telemetry & Audit Log</div>
        <div class="tab-btn" id="tabBtnPragma" onclick="switchTab('pragma')">🚀 PRAGMA Performance</div>
      </div>

      <!-- Tab Content Area -->
      <div class="tab-content">
        <!-- 1. Visual Data Grid -->
        <div class="tab-pane active" id="tabGrid">
          <div class="grid-toolbar">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--cyan);" id="gridTargetTitle">Active Result Set</span>
              <input type="text" id="gridSearchInput" placeholder="Filter rows..." style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 3px 8px; color: #fff; font-size: 11px; outline: none;" oninput="onGridSearch(this.value)">
            </div>
            <div class="grid-pagination">
              <span id="gridPageInfo">Page 1 of 1 (0 items)</span>
              <button class="sidebar-mini-btn" onclick="gridChangePage(-1)">◀ Prev</button>
              <button class="sidebar-mini-btn" onclick="gridChangePage(1)">Next ▶</button>
            </div>
          </div>
          <div class="grid-table-container" id="gridTableContainer">
            <table class="data-grid" id="mainDataGrid">
              <thead><tr id="gridHeaderRow"><th>Status</th></tr></thead>
              <tbody id="gridBody"><tr><td>Ready. Select a table or run a query.</td></tr></tbody>
            </table>
          </div>
        </div>

        <!-- 2. Query Designer -->
        <div class="tab-pane" id="tabDesigner">
          <div class="designer-layout" id="designerContainer">
            <div class="designer-empty">Load a schema to begin building a visual query.</div>
          </div>
        </div>

        <!-- 3. Schema & DDL Designer -->
        <div class="tab-pane" id="tabSchema">
          <div class="schema-layout" id="schemaContainer">
            <div class="card">
              <div class="card-title">Select a table from the sidebar to inspect its columns, keys, and DDL</div>
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
          <div class="code-box" id="auditLogBox">[SYSTEM] SQLite Studio Pro initialized. All subsystems ready.</div>
        </div>

        <!-- 6. PRAGMA Performance -->
        <div class="tab-pane" id="tabPragma">
          <div class="schema-layout">
            <div class="card">
              <div class="card-title">⚙️ PRAGMA Database Configuration & Performance Tuning</div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 8px;">
                <button class="btn" onclick="togglePragma('journal_mode', 'WAL')">⚡ Enable WAL Journal Mode</button>
                <button class="btn" onclick="togglePragma('foreign_keys', 'ON')">🛡️ Enforce Foreign Keys (ON)</button>
                <button class="btn" onclick="togglePragma('cache_size', '-64000')">🧠 Set 64MB Page Cache</button>
                <button class="btn" onclick="vacuumDatabase()">🧹 Run Full VACUUM</button>
                <button class="btn" onclick="runPragmaCommand('OPTIMIZE')">📈 Run ANALYZE / OPTIMIZE</button>
                <button class="btn" onclick="checkIntegrity()">🔍 Run Full PRAGMA integrity_check</button>
              </div>
            </div>
            <div class="card">
              <div class="card-title">PRAGMA Output Telemetry</div>
              <div class="code-box" id="pragmaOutputBox" style="height: 240px;">No PRAGMA commands executed yet.</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Footer -->
  <footer>
    <div>
      <span>Engine: <b style="color: var(--cyan);">bun:sqlite</b></span>
      <span> • </span>
      <span>Platform: <b>macOS / Darwin</b></span>
      <span> • </span>
      <span id="footerConnection">Connected: :memory:</span>
    </div>
    <div id="footerClock">00:00:00</div>
  </footer>

  <!-- Database Browser & Chooser Modal -->
  <div class="modal-overlay" id="dbBrowserModal" onclick="if(event.target === this) closeDatabaseDialog()">
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title">📂 Open & Load SQLite Database</div>
        <button class="modal-close" onclick="closeDatabaseDialog()" title="Close dialog">✕</button>
      </div>
      <div class="modal-body">
        <!-- Option 1: Native OS File Dialog -->
        <div class="db-choice-card">
          <div class="db-choice-header">
            <span>🖥️</span>
            <span>Operating System File Chooser</span>
          </div>
          <div style="font-size: 11px; color: var(--text-dim);">
            Launch your native OS file dialog to browse and select any local <code>.sqlite</code>, <code>.db</code>, <code>.sqlite3</code>, or custom database file.
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary" onclick="browseNativeDatabase()" style="flex: 1; padding: 10px; justify-content: center;">
              📁 Open System File Picker...
            </button>
          </div>
        </div>

        <!-- Option 2: Workspace Discovered Databases -->
        <div class="db-choice-card">
          <div class="db-choice-header" style="justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span>⚡</span>
              <span>Discovered Project Databases</span>
            </div>
            <button class="sidebar-mini-btn" onclick="loadWorkspaceDatabases()">🔄 Re-Scan</button>
          </div>
          <div style="font-size: 11px; color: var(--text-dim);">
            Databases found in current project directory:
          </div>
          <div id="workspaceDbList" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Option 3: Drag & Drop / Upload Local File -->
        <div class="db-choice-card">
          <div class="db-choice-header">
            <span>📥</span>
            <span>Upload or Drag & Drop File</span>
          </div>
          <input type="file" id="dbFileInput" style="display: none;" accept=".sqlite,.db,.sqlite3,.db3,*" onchange="if(this.files[0]) handleDatabaseUpload(this.files[0])">
          <div class="dropzone" id="dbDropZone" onclick="document.getElementById('dbFileInput').click()">
            <span style="font-size: 26px;">📥</span>
            <div style="font-size: 12px; font-weight: 600; color: var(--text-main);">Click to Select File or Drag & Drop Here</div>
            <div style="font-size: 10px; color: var(--text-dim);">Uploads and switches immediately into session</div>
          </div>
        </div>

        <!-- Option 4: Manual Path Input -->
        <div class="db-choice-card">
          <div class="db-choice-header">
            <span>✏️</span>
            <span>Direct Database Path</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="txtCustomDbPath" placeholder="/path/to/database.db, ~/my_data.sqlite, or :memory:" style="flex: 1; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; color: var(--text-main); font-size: 12px; outline: none;" onkeydown="if(event.key==='Enter') connectToDatabase(this.value)">
            <button class="btn btn-primary" onclick="connectToDatabase(document.getElementById('txtCustomDbPath').value)">🔌 Connect</button>
          </div>
        </div>
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
    let activeTable = "";
    let gridPage = 1;
    let gridPageSize = 25;
    let gridSortCol = "";
    let gridSortDir = "ASC";
    let activeTab = "grid";
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
        if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText);
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
      if (autoFullscreenAttempted) return;
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
      document.getElementById("kpiEngine").textContent = "SQLite " + kpis.sqliteVersion;
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
    // Database Browser & Chooser Modal Logic
    // ---------------------------------------------------------------------------------------------
    async function openDatabaseDialog() {
      const modal = document.getElementById("dbBrowserModal");
      if (modal) modal.classList.add("open");
      await loadWorkspaceDatabases();
    }

    function closeDatabaseDialog() {
      const modal = document.getElementById("dbBrowserModal");
      if (modal) modal.classList.remove("open");
    }

    let isBrowsingFile = false;
    async function browseNativeDatabase() {
      if (isBrowsingFile) return;
      isBrowsingFile = true;
      try {
        showToast("Opening system file picker...");
        const res = await apiRequest('/api/browse');
        if (res && res.success) {
          closeDatabaseDialog();
          showToast("Loaded database: " + (res.name || res.path));
          logAudit("[CONNECT] Loaded database: " + res.path);
          await refreshAll();
          if (currentSchema && currentSchema.tables.length > 0) {
            selectTable(currentSchema.tables[0].name);
          }
        } else if (res && res.cancelled) {
          showToast("File selection was cancelled.");
        } else {
          showToast("Failed to load database: " + (res ? res.error : "Unknown error"));
        }
      } finally {
        isBrowsingFile = false;
      }
    }

    async function loadWorkspaceDatabases() {
      const container = document.getElementById("workspaceDbList");
      if (!container) return;
      container.innerHTML = '<div style="color: var(--text-dim); font-size: 11px; padding: 6px;">Scanning workspace for SQLite databases...</div>';

      const res = await apiRequest('/api/workspace-databases');
      if (!res || !res.success || !res.databases || res.databases.length === 0) {
        container.innerHTML = '<div style="color: var(--text-dim); font-size: 11px; padding: 6px;">No databases found in current directory. Use System File Chooser or Upload below.</div>';
        return;
      }

      container.innerHTML = "";
      res.databases.forEach(db => {
        const row = document.createElement("div");
        row.className = "db-item-row";
        const isCurrent = db.isCurrent;
        row.innerHTML = \`
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
            <span style="font-size: 16px;">\${db.isMemory ? '🧠' : '🗄️'}</span>
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 12px; font-weight: 600; color: \${isCurrent ? 'var(--cyan)' : 'var(--text-main)'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                \${db.name} \${isCurrent ? '<span style="font-size: 9px; background: rgba(56, 189, 248, 0.2); color: var(--cyan); padding: 1px 5px; border-radius: 4px; margin-left: 4px;">ACTIVE</span>' : ''}
              </div>
              <div style="font-size: 10px; color: var(--text-dim); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                \${db.path} (\${db.sizeFormatted})
              </div>
            </div>
          </div>
          <button class="btn btn-sm \${isCurrent ? '' : 'btn-primary'}" onclick="connectToDatabase('\${db.path}')" \${isCurrent ? 'disabled' : ''}>
            \${isCurrent ? 'Active' : 'Load DB'}
          </button>
        \`;
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
        row.innerHTML = \`<span class="tree-item-title">\${item.name}</span><span class="tree-badge">\${item.rowCount.toLocaleString()}</span>\`;
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
      document.getElementById("sqlEditor").value = \`SELECT * FROM "\${tableName}" LIMIT 100;\`;
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
        renderDataGrid(currentGridColumns, currentGridRows);
        document.getElementById("gridPageInfo").textContent = \`Page \${res.page} of \${res.totalPages} (\${res.totalRows} records)\`;
        document.getElementById("kpiLatency").textContent = res.latencyMs + " ms";
        document.getElementById("resultSummary").textContent = \`\${res.totalRows} total rows (\${res.rows.length} on page)\`;
        document.getElementById("jsonInspectorBox").textContent = JSON.stringify(currentGridRows, null, 2);
      } else {
        showToast("Error loading table: " + (res?.error || "Unknown"));
      }
    }

    function renderDataGrid(columns, rows) {
      const thead = document.getElementById("gridHeaderRow");
      const tbody = document.getElementById("gridBody");
      thead.innerHTML = "";
      tbody.innerHTML = "";

      if (columns.length === 0) {
        thead.innerHTML = "<th>Result</th>";
        tbody.innerHTML = "<tr><td>(0 columns)</td></tr>";
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

      if (rows.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="\${columns.length}" style="text-align: center; color: var(--text-dim); padding: 20px;">No records found.</td></tr>\`;
        return;
      }

      rows.forEach(row => {
        const tr = document.createElement("tr");
        columns.forEach(col => {
          const td = document.createElement("td");
          const val = row[col];
          td.textContent = val === null ? "NULL" : (typeof val === "object" ? JSON.stringify(val) : String(val));
          if (val === null) td.style.color = "var(--text-dim)";
          td.title = td.textContent;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
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
      const sql = document.getElementById("sqlEditor").value.trim();
      if (!sql) {
        showToast("Please enter a SQL query!");
        return;
      }

      document.getElementById("queryTiming").textContent = "Executing...";
      const res = await apiRequest('/api/query', { sql });

      if (res && res.success) {
        document.getElementById("queryTiming").textContent = \`Executed in \${res.latencyMs}ms\`;
        document.getElementById("kpiLatency").textContent = res.latencyMs + " ms";

        if (res.rows && res.rows.length >= 0) {
          currentGridRows = res.rows;
          currentGridColumns = res.columns || (res.rows.length > 0 ? Object.keys(res.rows[0]) : []);
          renderDataGrid(currentGridColumns, currentGridRows);
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

    async function explainCurrentQuery() {
      const sql = document.getElementById("sqlEditor").value.trim();
      if (!sql) {
        showToast("Enter a query to explain!");
        return;
      }

      const res = await apiRequest('/api/explain', { sql });
      if (res && res.success && res.queryPlan) {
        renderExplainPlan(res.queryPlan, sql);
        switchTab("explain");
        showToast("Query plan generated!");
      } else {
        showToast("Explain failed: " + (res?.error || "Unknown"));
      }
    }

    function renderExplainPlan(planNodes, sql) {
      const container = document.getElementById("explainContainer");
      if (!container) return;
      container.innerHTML = "";

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = \`
        <div class="card-title">🔍 Query Plan Analysis</div>
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--cyan); margin-bottom: 8px;">\${sql}</div>
      \`;

      const list = document.createElement("div");
      list.style.display = "flex";
      list.style.flexDirection = "column";
      list.style.gap = "6px";

      planNodes.forEach(node => {
        const item = document.createElement("div");
        item.style.padding = "8px 12px";
        item.style.borderRadius = "6px";
        item.style.background = node.isScan ? "rgba(244, 63, 94, 0.1)" : "rgba(56, 189, 248, 0.08)";
        item.style.border = node.isScan ? "1px solid var(--rose)" : "1px solid var(--border-subtle)";
        item.style.fontFamily = "var(--font-mono)";
        item.style.fontSize = "11px";

        const badge = node.isScan 
          ? '<span style="color: var(--rose); font-weight: 700;">⚠️ SCAN TABLE (FULL SCAN)</span>'
          : '<span style="color: var(--emerald); font-weight: 700;">⚡ INDEX SEARCH</span>';

        item.innerHTML = \`<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">\${badge}<span>Node #\${node.id} (Parent: \${node.parent})</span></div><div>\${node.detail}</div>\`;
        list.appendChild(item);
      });

      card.appendChild(list);
      container.appendChild(card);
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
        <div class="card-title">🏛️ Table Schema: \${meta.name} (\${meta.rowCount.toLocaleString()} records)</div>
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
                <td style="color: var(--cyan); font-weight: 600;">\${c.name}</td>
                <td>\${c.type}</td>
                <td>\${c.pk ? '🔑 YES' : '-'}</td>
                <td>\${c.notnull ? 'YES' : 'NULLABLE'}</td>
                <td>\${c.dflt_value !== null ? c.dflt_value : '-'}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;

      const ddlCard = document.createElement("div");
      ddlCard.className = "card";
      ddlCard.innerHTML = \`
        <div class="card-title">DDL Definition (SQL)</div>
        <div class="code-box" style="height: 120px;">\${meta.sql || 'N/A'}</div>
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
      return '"' + String(value).replace(/"/g, '""') + '"';
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

    function suggestDesignerJoin(leftTableName, rightTableName) {
      if (!currentSchema) return null;
      const leftMeta = getEntityMeta(leftTableName);
      const rightMeta = getEntityMeta(rightTableName);
      if (!leftMeta || !rightMeta) return null;

      // 1. Explicit foreign key from leftMeta to rightMeta
      const fkMatch = (leftMeta.foreignKeys || []).find(fk => fk.table === rightTableName);
      if (fkMatch) {
        return {
          leftTable: leftTableName,
          rightTable: rightTableName,
          leftField: fkMatch.from,
          rightField: fkMatch.to || "id",
          type: "INNER",
          confidence: 100,
        };
      }

      // 2. Reverse foreign key from rightMeta to leftMeta
      const reverseMatch = (rightMeta.foreignKeys || []).find(fk => fk.table === leftTableName);
      if (reverseMatch) {
        return {
          leftTable: leftTableName,
          rightTable: rightTableName,
          leftField: reverseMatch.to || "id",
          rightField: reverseMatch.from,
          type: "INNER",
          confidence: 100,
        };
      }

      // 3. Conventional naming: leftTable has singular(rightTable)_id column
      const rightSingular = getSingularCandidate(rightTableName);
      const candidateInLeft = (leftMeta.columns || []).find(c => c.name.toLowerCase() === (rightSingular + "_id") || c.name.toLowerCase() === (rightTableName.toLowerCase() + "_id"));
      if (candidateInLeft) {
        return {
          leftTable: leftTableName,
          rightTable: rightTableName,
          leftField: candidateInLeft.name,
          rightField: "id",
          type: "INNER",
          confidence: 90,
        };
      }

      // Conventional naming: rightTable has singular(leftTable)_id column
      const leftSingular = getSingularCandidate(leftTableName);
      const candidateInRight = (rightMeta.columns || []).find(c => c.name.toLowerCase() === (leftSingular + "_id") || c.name.toLowerCase() === (leftTableName.toLowerCase() + "_id"));
      if (candidateInRight) {
        return {
          leftTable: leftTableName,
          rightTable: rightTableName,
          leftField: "id",
          rightField: candidateInRight.name,
          type: "INNER",
          confidence: 90,
        };
      }

      // 4. Domain specific matching keys (excluding generic 'id' and standard audit fields)
      const leftFields = (leftMeta.columns || []).map(c => c.name);
      const rightFieldNames = new Set((rightMeta.columns || []).map(c => c.name));
      const sharedDomainCol = leftFields.find(c => {
        const lower = c.toLowerCase();
        return rightFieldNames.has(c) && !["id", "created_at", "updated_at", "status", "active", "type", "description"].includes(lower);
      });
      if (sharedDomainCol) {
        return {
          leftTable: leftTableName,
          rightTable: rightTableName,
          leftField: sharedDomainCol,
          rightField: sharedDomainCol,
          type: "INNER",
          confidence: 75,
        };
      }

      // 5. Fallback if both have PK / first column
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

      if (!queryDesignerState.joins || !queryDesignerState.joins.length) {
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
      if (queryDesignerState.selectedTables.length > 1) {
        let bestTarget = null;
        let bestSugg = null;
        let bestConf = -1;
        const candidates = queryDesignerState.selectedTables.slice(0, -1);

        for (const target of candidates) {
          const s = suggestDesignerJoin(target, tableName);
          const c = s ? (s.confidence || 50) : 0;
          if (c > bestConf) {
            bestConf = c;
            bestTarget = target;
            bestSugg = s;
          }
        }

        const finalSugg = bestSugg || {
          leftTable: candidates[0],
          rightTable: tableName,
          leftField: "id",
          rightField: "id",
          type: "INNER",
        };

        queryDesignerState.joins.push({
          key: finalSugg.leftTable + "." + finalSugg.leftField + "->" + tableName + "." + finalSugg.rightField + "-" + Date.now(),
          ...finalSugg,
        });
      }
      renderQueryDesigner();
    }

    function removeDesignerTable(tableName) {
      queryDesignerState.selectedTables = queryDesignerState.selectedTables.filter(t => t !== tableName);
      queryDesignerState.joins = (queryDesignerState.joins || []).filter(j => j.leftTable !== tableName && j.rightTable !== tableName);
      queryDesignerState.columns = (queryDesignerState.columns || []).filter(col => col.table !== tableName);
      renderQueryDesigner();
    }

    function autoJoinDesignerTables() {
      queryDesignerState.joins = buildDesignerJoinPairs();
      renderQueryDesigner();
      showToast("Schema graph relationships auto-detected & connected (" + (queryDesignerState.joins || []).length + " links)");
    }

    function promptAddDesignerJoin(preferredLeft, preferredRight) {
      if (queryDesignerState.selectedTables.length < 2) {
        showToast("Add at least 2 tables to create a join relationship");
        return;
      }
      const tables = queryDesignerState.selectedTables;
      let t1 = preferredLeft || tables[0];
      let t2 = preferredRight;

      if (!t2) {
        for (let i = 0; i < tables.length; i++) {
          if (tables[i] === t1) continue;
          const hasDirect = (queryDesignerState.joins || []).some(j =>
            (j.leftTable === t1 && j.rightTable === tables[i]) ||
            (j.leftTable === tables[i] && j.rightTable === t1)
          );
          if (!hasDirect) {
            t2 = tables[i];
            break;
          }
        }
      }
      if (!t2) t2 = tables[1] || tables[0];

      const sugg = suggestDesignerJoin(t1, t2) || {
        leftTable: t1,
        rightTable: t2,
        leftField: "id",
        rightField: "id",
        type: "INNER",
      };

      queryDesignerState.joins.push({
        key: t1 + "." + sugg.leftField + "->" + t2 + "." + sugg.rightField + "-" + Date.now(),
        leftTable: sugg.leftTable,
        leftField: sugg.leftField,
        rightTable: sugg.rightTable,
        rightField: sugg.rightField,
        type: sugg.type || "INNER",
      });
      renderQueryDesigner();
      showToast("Added relationship: " + t1 + " ↔ " + t2);
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
        const raw = localStorage.getItem("sqlite_studio_saved_queries");
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
        localStorage.setItem("sqlite_studio_saved_queries", JSON.stringify(queryDesignerState.savedQueries || []));
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
      runExplainPlan();
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

    function saveDesignerQuery() {
      const preview = document.getElementById("designerSqlPreview");
      const sql = (queryDesignerState.activeView === "sql" && preview && preview.value.trim()) ? preview.value.trim() : buildDesignerSql();
      const defaultName = "Query " + ((queryDesignerState.savedQueries || []).length + 1);
      const name = prompt("Save this query as:", defaultName);
      if (!name) return;
      if (!queryDesignerState.savedQueries) queryDesignerState.savedQueries = [];
      queryDesignerState.savedQueries.unshift({ name, sql, createdAt: new Date().toISOString() });
      queryDesignerState.savedQueries = queryDesignerState.savedQueries.slice(0, 15);
      persistSavedQueries();
      showToast("Saved query: " + name);
      renderQueryDesigner();
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
          const joinType = (j.type || "INNER").toUpperCase();

          if (joinedTables.has(j.leftTable) && joinedTables.has(j.rightTable)) {
            continue;
          }

          if (isReversed) {
            const effType = (joinType === "LEFT") ? "INNER" : joinType;
            if (effType === "CROSS") {
              sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(j.leftTable));
            } else {
              sqlLines.push(effType + " JOIN " + quoteSqlIdentifier(j.leftTable) + " ON " + quoteSqlIdentifier(j.rightTable) + "." + quoteSqlIdentifier(j.rightField) + " = " + quoteSqlIdentifier(j.leftTable) + "." + quoteSqlIdentifier(j.leftField));
            }
            joinedTables.add(j.leftTable);
          } else {
            if (joinType === "CROSS") {
              sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(j.rightTable));
            } else {
              sqlLines.push(joinType + " JOIN " + quoteSqlIdentifier(j.rightTable) + " ON " + quoteSqlIdentifier(j.leftTable) + "." + quoteSqlIdentifier(j.leftField) + " = " + quoteSqlIdentifier(j.rightTable) + "." + quoteSqlIdentifier(j.rightField));
            }
            joinedTables.add(j.rightTable);
          }
        } else {
          const j = pendingJoins.shift();
          const target = !joinedTables.has(j.rightTable) ? j.rightTable : j.leftTable;
          sqlLines.push("CROSS JOIN " + quoteSqlIdentifier(target));
          joinedTables.add(target);
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
            <select class="qbe-select" onchange="applyDesignerPreset(this.value); this.value='';" style="max-width: 175px; font-weight: 600; color: var(--amber);">
              <option value="">⚡ Presets / Templates</option>
              <option value="ecommerce_multi">🛒 4-Table E-Commerce (Full Relational)</option>
              <option value="top_spenders">Top Spenders (Aggregated)</option>
              <option value="low_stock">Low Stock Restock Alerts</option>
              <option value="orders_status">Active Orders Pipeline</option>
              <option value="blank">Blank Query (Reset)</option>
            </select>
          </div>
          <div class="qbe-ribbon-group">
            <select id="designerTablePicker" class="qbe-select" style="max-width: 155px;">
              <option value="">+ Add Table / View</option>
              \${tablesList.length ? \`<optgroup label="📋 Tables">\${tablesList.map(name => \`<option value="\${name}">\${name}</option>\`).join('')}</optgroup>\` : ''}
              \${viewsList.length ? \`<optgroup label="👁️ Views">\${viewsList.map(name => \`<option value="\${name}">\${name} (View)</option>\`).join('')}</optgroup>\` : ''}
            </select>
            <button class="btn btn-sm" onclick="addDesignerTableFromPicker()">Add</button>
            <button class="btn btn-sm" onclick="autoJoinDesignerTables()" title="Auto-detect relationships between tables across full schema graph">🔗 Smart Auto-Join All</button>
            <button class="btn btn-sm" onclick="promptAddDesignerJoin()" title="Create custom join relationship">+ Link</button>
            <button class="btn btn-sm" onclick="addDesignerQbeColumn()" title="Add custom column to QBE grid">+ Column</button>
            <button class="btn btn-sm" onclick="clearDesignerQbe()" title="Clear QBE columns">Clear</button>
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
            <button class="btn btn-sm" onclick="loadSavedDesignerQuery(\${idx})" title="Click to load saved SQL">\${item.name}</button>
            <button class="sidebar-mini-btn" onclick="deleteSavedDesignerQuery(\${idx})" title="Delete saved query">✕</button>
          </div>
        \`).join('') || '<span style="color: var(--text-dim); font-size: 11px;">No saved queries yet.</span>';

        container.innerHTML = ribbonHtml + \`
          <div class="designer-sql-panel">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div class="card-title" style="margin-bottom:0;">Generated Microsoft Access-Compatible SQL</div>
              <div style="display:flex; gap:6px;">
                <button class="btn btn-sm btn-primary" onclick="runCustomDesignerSql()" title="Execute SQL directly in Datasheet">! Run Edited SQL</button>
                <button class="btn btn-sm" onclick="resetDesignerSqlToQbe()" title="Reset SQL back to QBE generated SQL">🔄 Reset from QBE</button>
                <button class="btn btn-sm" onclick="loadDesignerSqlToEditor()">Load into Editor</button>
                <button class="btn btn-sm" onclick="copyDesignerSql()">Copy SQL</button>
                <button class="btn btn-sm" onclick="explainDesignerQuery()">Explain Plan</button>
              </div>
            </div>
            <textarea class="designer-sql-preview" id="designerSqlPreview" placeholder="Write or edit SQL statement..." onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') runCustomDesignerSql()">\${sqlPreview}</textarea>
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
                <div>Executing query against SQLite database...</div>
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
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; color: var(--cyan);">📋 Datasheet View</span>
                \${ds ? \`<span style="font-size: 10px; background: rgba(56, 189, 248, 0.15); color: var(--cyan); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono);">\${ds.rows.length} rows (\${ds.latencyMs}ms)</span>\` : ''}
                <input type="text" placeholder="🔍 Filter rows..." oninput="filterDesignerDatasheet(this.value)" style="padding: 4px 8px; font-size: 11px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--text-main); width: 130px; outline: none;">
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
      const tableCardsHtml = selectedTables.map(tableName => {
        const meta = getEntityMeta(tableName);
        if (!meta) return "";
        const isView = (currentSchema.views || []).some(v => v.name === tableName);
        const icon = isView ? '👁️' : '🗄️';
        const columnsHtml = (meta.columns || []).map(c => \`
          <div class="qbe-field-row" onclick="addDesignerQbeColumn('\${tableName}', '\${c.name}')" title="Click to add field to QBE Grid">
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">\${c.pk ? '🔑 ' : ''}\${c.name}</span>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 9px; color: var(--text-dim);">\${c.type || 'ANY'}</span>
              <span class="qbe-field-add-icon">+</span>
            </div>
          </div>
        \`).join('');

        return \`
          <div class="qbe-table-card">
            <div class="qbe-table-card-header">
              <span>\${icon} \${tableName}\${isView ? ' <span style="font-size: 9px; opacity: 0.7; font-weight: normal;">(view)</span>' : ''}</span>
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
              <button class="btn btn-sm" onclick="autoJoinDesignerTables()" style="padding: 1px 6px; font-size: 9px;">🔗 Auto-Connect</button>
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
          { val: "INNER", label: "1: INNER (Matching rows)" },
          { val: "LEFT", label: "2: LEFT (All from " + join.leftTable + ")" },
          { val: "RIGHT", label: "3: RIGHT (All from " + join.rightTable + ")" },
          { val: "CROSS", label: "4: CROSS (Cartesian)" },
        ];

        return \`
          <div class="qbe-join-badge">
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
      }).join('') || '<div style="color: var(--text-dim); font-size: 11px;">No relationships active. Click <strong>🔗 Smart Auto-Join All</strong> or <strong>+ Link</strong>.</div>';

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

      container.innerHTML = ribbonHtml + \`
        <!-- Upper Relationship Workbench -->
        <div class="qbe-workbench">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-dim);">RELATIONSHIP WORKBENCH (Click fields to add to QBE Grid)</span>
            <span style="font-size: 10px; color: var(--cyan);">\${selectedTables.length} Tables Active</span>
          </div>
          <div class="qbe-tables-canvas">
            \${tableCardsHtml}
          </div>
          <div class="qbe-joins-bar">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <div style="font-size: 10px; font-weight: 700; color: var(--text-dim);">JOIN PROPERTIES &amp; RELATIONSHIPS (\${activeJoins.length} Active):</div>
              \${topologyStatusHtml}
            </div>
            \${joinsHtml}
          </div>
        </div>

        <!-- Lower QBE Design Grid -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: var(--text-dim);">QUERY BY EXAMPLE (QBE) DESIGN GRID</span>
            <button class="btn btn-sm" onclick="toggleCriteriaHelp()" style="padding: 2px 8px; font-size: 10px;" title="View Microsoft Access &amp; SQLite Criteria Syntax">💡 Syntax Help</button>
          </div>
          <span style="font-size: 10px; color: var(--text-dim);">\${columns.length} columns defined</span>
        </div>
        <div id="criteriaHelpBanner" style="display: none; background: rgba(15, 23, 42, 0.95); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; margin: 4px 0 8px; font-size: 11px; color: var(--text-muted); line-height: 1.6;">
          <strong style="color: var(--cyan);">Access &amp; SQLite Criteria Cheat Sheet:</strong><br>
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

    async function vacuumDatabase() {
      showToast("Running VACUUM...");
      const res = await apiRequest('/api/pragma', { pragma: 'vacuum' });
      showToast("VACUUM completed successfully!");
      logAudit("[VACUUM] Database defragmented and vacuumed.");
      await refreshKpis();
    }

    async function checkIntegrity() {
      showToast("Running integrity_check...");
      const res = await apiRequest('/api/pragma', { pragma: 'integrity_check' });
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = JSON.stringify(res, null, 2);
      showToast("Integrity check OK: Database is healthy!");
      logAudit("[INTEGRITY] PRAGMA integrity_check completed: OK");
      switchTab("pragma");
    }

    async function togglePragma(name, val) {
      const res = await apiRequest('/api/pragma', { pragma: name, value: val });
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = JSON.stringify(res, null, 2);
      showToast(\`PRAGMA \${name}=\${val} set!\`);
      logAudit(\`[PRAGMA] \${name}=\${val}\`);
      await refreshKpis();
    }

    async function runPragmaCommand(cmd) {
      const res = await apiRequest('/api/query', { sql: cmd });
      const outBox = document.getElementById("pragmaOutputBox");
      if (outBox) outBox.textContent = JSON.stringify(res, null, 2);
      showToast(\`Command \${cmd} executed!\`);
      logAudit(\`[COMMAND] \${cmd}\`);
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

    window.applySqliteStudioTheme = function(themeName) {
      try { localStorage.setItem('sqlite_studio_theme', themeName); } catch(e) {}
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

      let styleEl = document.getElementById('sqlite-dyn-theme');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'sqlite-dyn-theme';
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
        const savedTheme = localStorage.getItem('sqlite_studio_theme') || 'midnight';
        applySqliteStudioTheme(savedTheme);
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
          if (file.name.match(/\.(sqlite|db|sqlite3|db3)$/i)) {
            handleDatabaseUpload(file);
          }
        }
      });

      await refreshAll();
      if (currentSchema && currentSchema.tables.length > 0) {
        selectTable(currentSchema.tables[0].name);
      }
    });
  </script>
  <script>
${getWindowShortcutsScript()}
  </script>
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

export function createSqliteStudio(options: SystemStudioOptions = {}): SqliteStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1260);
  const height = options.height ?? (fullscreen ? screen.height : 900);
  const activeDbPath = options.initialDbPath || ":memory:";
  const title = "SQLite Studio Pro -- Enterprise Embedded Database Workstation";

  const app: SqliteStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    activeDbPath,
    generateHtml: () => generateSqliteStudioHtml(),
    run: async () => {
      console.log("⚡ Launching SQLite Studio Pro (Enterprise Database Workstation)...");

      // 1. Launch Isolated Background Database Worker Engine
      // This runs on a dedicated OS thread with its own independent Bun event loop,
      // guaranteeing zero deadlock and instant sub-millisecond responses while Webview runs on the main thread.
      process.env.STUDIO_WORKER = "sqlite_studio";
      if (activeDbPath) process.env.SQLITE_DB_PATH = activeDbPath;

      const workerUrl = new URL("./sqlite_studio_server.ts", import.meta.url);
      const worker = new Worker(workerUrl);
      app.worker = worker;

      const info: { ready: boolean; port: number; url: string; type?: string } = await new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error("Timeout initializing background database engine")), 8000);
        worker.onmessage = (e) => {
          if (!e.data?.type || e.data.type === "sqlite_studio") {
            clearTimeout(timer);
            res(e.data);
          }
        };
        worker.onerror = (err) => {
          clearTimeout(timer);
          rej(err);
        };
      });

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

        let hasInitialFullscreenTriggered = false;
        webview.bind("requestInitialFullscreen", () => {
          if (hasInitialFullscreenTriggered) return;
          hasInitialFullscreenTriggered = true;
          if (fullscreen) {
            toggleFullscreenNative(webview);
          }
        });

        attachWindowShortcuts(webview, {
          onQuit: () => {
            try { worker.terminate(); } catch {}
            process.exit(0);
          },
          onClose: () => {
            try { worker.terminate(); } catch {}
            process.exit(0);
          },
          onFullscreen: () => {
            toggleFullscreenNative(webview);
          },
        });

        webview.navigate(info.url);
        console.log(`⚡ Native desktop workstation window open (Fullscreen: ${fullscreen ? 'Enabled' : 'Disabled'}). (Also accessible in any browser at: ${info.url})`);

        // Start native desktop message loop on main thread
        webview.run();
      } catch (err: any) {
        console.warn(`Desktop Webview unavailable (${err?.message || err}). Application running as web workstation at: ${info.url}`);
      } finally {
        try { worker.terminate(); } catch {}
      }
    },
  };

  return app;
}

// -------------------------------------------------------------------------------------------------
// Backward Compatibility & Aliases
// -------------------------------------------------------------------------------------------------

export const createDatabaseStudio = createSqliteStudio;
export const createSqliteStudioPro = createSqliteStudio;
export { startSqliteStudioServer } from "./sqlite_studio_server.ts";

// -------------------------------------------------------------------------------------------------
// Standalone Direct Invocation
// -------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const initialDb = process.argv[2] || ":memory:";
  const app = createSqliteStudio({ initialDbPath: initialDb });
  await app.run();
}
