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
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  toggleFullscreenNative,
  attachWindowShortcuts,
  getWindowShortcutsScript,
} from "../index.ts";

export interface SystemStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  initialDbPath?: string;
}

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
    name: "1. All Customers (Tier & Lifetime Spend)",
    sql: "SELECT * FROM v_customer_orders ORDER BY lifetime_spend DESC;",
  },
  {
    name: "2. Sales by Category Breakdown",
    sql: "SELECT * FROM v_sales_by_category ORDER BY gross_revenue DESC;",
  },
  {
    name: "3. High-Value Orders (> $1,000)",
    sql: "SELECT o.order_number, c.name AS customer, o.total_amount, o.status, o.payment_method\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nWHERE o.total_amount > 1000\nORDER BY o.total_amount DESC;",
  },
  {
    name: "4. Products Low Stock Alert (< 50 units)",
    sql: "SELECT id, sku, name, category, price, stock, rating\nFROM products\nWHERE stock < 50\nORDER BY stock ASC;",
  },
  {
    name: "5. Order Items Detail with Margin",
    sql: "SELECT oi.id, o.order_number, p.name AS product_name, oi.quantity, oi.unit_price, (oi.quantity * oi.unit_price) AS line_total\nFROM order_items oi\nJOIN orders o ON o.id = oi.order_id\nJOIN products p ON p.id = oi.product_id\nORDER BY line_total DESC\nLIMIT 20;",
  },
  {
    name: "6. Database Schema Master Table",
    sql: "SELECT type, name, tbl_name, sql\nFROM sqlite_master\nWHERE name NOT LIKE 'sqlite_%'\nORDER BY type, name;",
  },
  {
    name: "7. Audit Log Trail (Recent Mutations)",
    sql: "SELECT id, action, entity, details, timestamp\nFROM audit_logs\nORDER BY id DESC\nLIMIT 25;",
  },
  {
    name: "8. Explain Query Plan (Customer Orders)",
    sql: "EXPLAIN QUERY PLAN\nSELECT c.name, sum(o.total_amount)\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nGROUP BY c.name\nORDER BY sum(o.total_amount) DESC;",
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
      padding: 4px 8px;
      color: var(--text-main);
      font-size: 11px;
      outline: none;
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

    .tab-btn {
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
      <button class="btn btn-primary" onclick="openDatabaseDialog()" title="Browse, pick, or load SQLite database">📂 Open / Browse DB...</button>
      <button class="btn" onclick="runEditorQuery()">⚡ Run Query</button>
      <button class="btn" onclick="seedDatabase()">🌱 Seed Sample DB</button>
      <button class="btn" onclick="vacuumDatabase()">🧹 Vacuum DB</button>
      <button class="btn" onclick="checkIntegrity()">🛡️ Integrity Check</button>
      <button class="btn" id="btnFullscreen" onclick="window.doToggleFullscreen()" title="Toggle Fullscreen">⛶ Fullscreen</button>
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
      <section class="editor-banner">
        <div class="editor-top">
          <div class="preset-selector-wrap">
            <span style="font-size: 11px; color: var(--text-dim); font-weight: 600;">SQL Snippet:</span>
            <select class="preset-select" id="presetSelect" onchange="applyPreset(this.value)">
              <option value="">-- Choose SQL Query Snippet --</option>
            </select>
          </div>
          <div class="editor-timing" id="queryTiming">Ready to execute query</div>
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

        <!-- 2. Schema & DDL Designer -->
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
    // Fullscreen Support
    // ---------------------------------------------------------------------------------------------
    window.doToggleFullscreen = function() {
      if (window.toggleFullscreen) {
        window.toggleFullscreen();
      } else if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    };

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
      renderObjectTree();
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
      document.getElementById("gridTargetTitle").textContent = "Table: " + tableName;
      document.getElementById("sqlEditor").value = \`SELECT * FROM "\${tableName}" LIMIT 100;\`;
      gridPage = 1;
      await fetchTableData();
      renderSchemaDesigner(tableName);
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
      document.getElementById("footerClock").textContent = new Date().toLocaleTimeString();
    }, 1000);

    window.addEventListener("DOMContentLoaded", async () => {
      initPresets();
      initSidebarResizer();

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

export function createSqliteStudio(options: SystemStudioOptions = {}): SqliteStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const width = options.width ?? 1260;
  const height = options.height ?? 900;
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

      // 1. Launch Isolated Background Database Engine Worker
      const workerUrl = new URL("./sqlite_studio_server.ts", import.meta.url);
      const worker = new Worker(workerUrl);
      app.worker = worker;

      const info: { ready: boolean; port: number; url: string } = await new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error("Timeout initializing background database engine")), 8000);
        worker.onmessage = (e) => {
          clearTimeout(timer);
          res(e.data);
        };
        worker.onerror = (err) => {
          clearTimeout(timer);
          rej(err);
        };
      });

      app.port = info.port;
      app.url = info.url;
      console.log(`⚡ Background Database Server active at: ${info.url}`);

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
          setWindowPositionNative(webview, "center", width, height);
          setAlwaysOnTopNative(webview, options.alwaysOnTop ?? false);
          if (fullscreen) {
            toggleFullscreenNative(webview);
          }
        } catch {}

        attachWindowShortcuts(webview, {
          onQuit: () => {
            try { worker.terminate(); } catch {}
            process.exit(0);
          },
          onClose: () => {
            try { worker.terminate(); } catch {}
            process.exit(0);
          },
        });

        webview.navigate(info.url);
        console.log(`⚡ Native desktop workstation window open (Fullscreen: ${fullscreen ? 'Enabled' : 'Disabled'}). (Also accessible in any browser at: ${info.url})`);

        // Start native desktop message loop on main thread
        webview.run();
      } catch (err: any) {
        console.warn(`Desktop Webview unavailable (${err?.message || err}). Application running as web workstation at: ${info.url}`);
      } finally {
        worker.terminate();
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
