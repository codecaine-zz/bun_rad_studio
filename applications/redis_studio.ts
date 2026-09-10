/**
 * ⚡ Bun RAD Studio - Redis Studio Pro
 * 
 * Enterprise-Grade Redis Desktop Workstation & Telemetry Studio
 * Powered 100% by Bun's native C-speed Redis client (`bun:redis` / `RedisClient`).
 * 
 * Architecture:
 * - Dedicated Background Telemetry & Redis Engine Server (`redis_studio_server.ts`)
 * - Native WebKit Desktop GUI with default fullscreen & disabled right-click reload/inspect
 * - Accessible in any browser or as a standalone desktop application
 */

import { Webview, SizeHint } from "webview-bun";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  toggleFullscreenNative,
  setFullscreenNative,
  attachWindowShortcuts,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";
import { startRedisStudioServer } from "./redis_studio_server.ts";

export interface RedisStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  url?: string;
  db?: number;
  port?: number;
}

export interface RedisStudioInstance {
  title: string;
  width: number;
  height: number;
  fullscreen: boolean;
  activeUrl: string;
  webview?: Webview;
  server?: any;
  worker?: Worker;
  port?: number;
  url?: string;
  run: () => Promise<void> | void;
  generateHtml: () => string;
}

// -------------------------------------------------------------------------------------------------
// Common Redis CLI Presets Registry
// -------------------------------------------------------------------------------------------------

export const REDIS_CLI_PRESETS = [
  { name: "1. Server Information", cmd: "INFO SERVER" },
  { name: "2. Memory Telemetry", cmd: "INFO MEMORY" },
  { name: "3. Keyspace Overview", cmd: "DBSIZE" },
  { name: "4. All Scanned Keys", cmd: "KEYS *" },
  { name: "5. Active Clients", cmd: "CLIENT LIST" },
  { name: "6. Slow Query Log", cmd: "SLOWLOG GET 10" },
  { name: "7. Current Time", cmd: "TIME" },
  { name: "8. Latency Ping", cmd: "PING" },
];

// -------------------------------------------------------------------------------------------------
// Complete Enterprise Workstation HTML Shell Generator
// -------------------------------------------------------------------------------------------------

export function generateRedisStudioHtml(): string {
  const presetsJson = JSON.stringify(REDIS_CLI_PRESETS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redis Studio Pro - Enterprise In-Memory Workstation</title>
  <style>
    :root {
      --bg-base: #07090e;
      --bg-surface: #0e131f;
      --bg-card: rgba(18, 24, 38, 0.7);
      --bg-hover: rgba(30, 41, 59, 0.6);
      --border-color: rgba(255, 255, 255, 0.08);
      --border-glow: rgba(239, 68, 68, 0.3);
      --redis-red: #ef4444;
      --redis-glow: #f87171;
      --accent-cyan: #06b6d4;
      --accent-emerald: #10b981;
      --accent-amber: #f59e0b;
      --accent-purple: #8b5cf6;
      --accent-blue: #3b82f6;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", Helvetica, Arial, sans-serif;
      --font-mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, Monaco, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-user-select: none;
      user-select: none;
    }

    input, textarea, select, [contenteditable="true"], pre, code {
      -webkit-user-select: text;
      user-select: text;
    }

    body {
      background: radial-gradient(circle at 15% 15%, #131722 0%, var(--bg-base) 100%);
      color: var(--text-main);
      font-family: var(--font-sans);
      font-size: 13px;
      line-height: 1.4;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.25);
    }

    /* Header Bar */
    header {
      background: rgba(14, 19, 31, 0.9);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--border-color);
      padding: 8px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 20;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #ff4b4b 0%, #dc2626 100%);
      color: #fff;
      padding: 4px 10px;
      border-radius: 6px;
      box-shadow: 0 0 16px rgba(239, 68, 68, 0.35);
    }

    .brand-sub {
      font-size: 11px;
      font-weight: 600;
      color: var(--accent-cyan);
      background: rgba(6, 182, 212, 0.12);
      border: 1px solid rgba(6, 182, 212, 0.25);
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .kpi-strip {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow-x: auto;
    }

    .kpi-chip {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      padding: 4px 10px;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      min-width: 95px;
    }

    .kpi-chip-label {
      font-size: 10px;
      color: var(--text-dim);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    .kpi-chip-value {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 700;
      color: var(--text-main);
    }

    .kpi-chip-value.good { color: var(--accent-emerald); }
    .kpi-chip-value.warn { color: var(--accent-amber); }
    .kpi-chip-value.highlight { color: var(--accent-cyan); }

    /* Human Friendly Badges */
    .ttl-badge-persistent {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #6ee7b7;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .ttl-badge-expiring {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #fde68a;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .metric-progress-bar {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 4px;
    }

    .metric-progress-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .client-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11px;
      transition: background 0.15s;
    }
    .client-card:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .client-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .rank-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      font-size: 11px;
      font-weight: 700;
    }
    .rank-1 { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #fbbf24; }
    .rank-2 { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; border: 1px solid #cbd5e1; }
    .rank-3 { background: rgba(180, 83, 9, 0.2); color: #d97706; border: 1px solid #d97706; }
    .rank-other { background: rgba(255, 255, 255, 0.05); color: var(--text-dim); }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Buttons */
    .btn {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
      border: 1px solid var(--border-color);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn-primary {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
      color: #fff;
      border: 1px solid #f87171;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #f87171 0%, #dc2626 100%);
    }

    .btn-cyan {
      background: rgba(6, 182, 212, 0.15);
      border-color: rgba(6, 182, 212, 0.4);
      color: #67e8f9;
    }
    .btn-cyan:hover {
      background: rgba(6, 182, 212, 0.25);
    }

    .btn-emerald {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.4);
      color: #6ee7b7;
    }
    .btn-emerald:hover {
      background: rgba(16, 185, 129, 0.25);
    }

    .btn-danger {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }
    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.25);
    }

    /* Layout */
    .app-workspace {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* Sidebar */
    .sidebar {
      width: 320px;
      min-width: 280px;
      background: rgba(10, 14, 23, 0.85);
      backdrop-filter: blur(12px);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
    }

    .sidebar-header {
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .conn-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .conn-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-family: var(--font-mono);
      background: rgba(0, 0, 0, 0.3);
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--border-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-emerald);
      box-shadow: 0 0 8px var(--accent-emerald);
    }
    .status-dot.offline {
      background: var(--redis-red);
      box-shadow: 0 0 8px var(--redis-red);
    }

    .search-box {
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 4px 8px;
      gap: 6px;
    }

    .search-box input {
      background: transparent;
      border: none;
      outline: none;
      color: var(--text-main);
      font-size: 12px;
      width: 100%;
      font-family: var(--font-mono);
    }

    .type-filter-bar {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding: 4px 0;
    }

    .type-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
      text-transform: uppercase;
      white-space: nowrap;
    }

    .type-pill.active {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.5);
      color: #fff;
    }

    /* Key Tree List */
    .key-list-container {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
    }

    .key-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 2px;
      transition: background 0.1s;
      border: 1px solid transparent;
    }

    .key-item:hover {
      background: var(--bg-hover);
    }

    .key-item.selected {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.35);
    }

    .key-left {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }

    .key-type-badge {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 3px;
      text-transform: uppercase;
      font-family: var(--font-mono);
      min-width: 44px;
      text-align: center;
    }

    .type-string     { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); }
    .type-hash       { background: rgba(16, 185, 129, 0.2); color: #a7f3d0; border: 1px solid rgba(16, 185, 129, 0.4); }
    .type-list       { background: rgba(245, 158, 11, 0.2); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.4); }
    .type-set        { background: rgba(139, 92, 246, 0.2); color: #ddd6fe; border: 1px solid rgba(139, 92, 246, 0.4); }
    .type-zset       { background: rgba(236, 72, 153, 0.2); color: #fbcfe8; border: 1px solid rgba(236, 72, 153, 0.4); }
    .type-stream     { background: rgba(6, 182, 212, 0.2); color: #a5f3fc; border: 1px solid rgba(6, 182, 212, 0.4); }
    .type-hyperloglog{ background: rgba(249, 115, 22, 0.2); color: #fdba74; border: 1px solid rgba(249, 115, 22, 0.4); }
    .type-bitmap     { background: rgba(14, 165, 233, 0.2); color: #7dd3fc; border: 1px solid rgba(14, 165, 233, 0.4); }

    .key-name {
      font-family: var(--font-mono);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .key-ttl {
      font-size: 10px;
      color: var(--text-dim);
      font-family: var(--font-mono);
    }

    /* Main Area */
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: rgba(12, 16, 26, 0.6);
    }

    /* Tab Navigation */
    .tab-strip {
      display: flex;
      align-items: center;
      background: rgba(10, 14, 23, 0.6);
      border-bottom: 1px solid var(--border-color);
      padding: 0 16px;
      gap: 4px;
    }

    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }

    .tab-btn:hover {
      color: var(--text-main);
    }

    .tab-btn.active {
      color: #fff;
      border-bottom-color: var(--redis-red);
    }

    /* Tab Panels */
    .tab-panel {
      flex: 1;
      display: none;
      flex-direction: column;
      overflow: hidden;
      padding: 16px;
      gap: 16px;
    }

    .tab-panel.active {
      display: flex;
    }

    /* Key Editor View */
    .key-header-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .key-meta-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      overflow: hidden;
    }

    .key-title-display {
      font-family: var(--font-mono);
      font-size: 15px;
      font-weight: 700;
      color: var(--text-main);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .key-actions-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .data-viewer-card {
      flex: 1;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .data-toolbar {
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .data-content-area {
      flex: 1;
      overflow: auto;
      padding: 12px;
    }

    /* Tables & Grids */
    .pro-table {
      width: 100%;
      border-collapse: collapse;
      font-family: var(--font-mono);
      font-size: 12px;
    }

    .pro-table th {
      text-align: left;
      padding: 8px;
      background: rgba(0, 0, 0, 0.3);
      color: var(--text-dim);
      font-size: 11px;
      text-transform: uppercase;
      border-bottom: 1px solid var(--border-color);
    }

    .pro-table td {
      padding: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      vertical-align: top;
    }

    .pro-table tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    /* CLI Console */
    .cli-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #05070a;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      font-family: var(--font-mono);
    }

    .cli-history {
      flex: 1;
      padding: 12px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .cli-entry {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .cli-prompt-line {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--accent-cyan);
      font-weight: 600;
    }

    .cli-result-line {
      color: #cbd5e1;
      padding-left: 16px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .cli-result-line.error {
      color: #f87171;
    }

    .cli-result-line.timing {
      font-size: 10px;
      color: var(--text-dim);
      padding-left: 16px;
    }

    .cli-input-bar {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      background: rgba(0, 0, 0, 0.4);
      border-top: 1px solid var(--border-color);
      gap: 8px;
    }

    .cli-input-bar input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-family: var(--font-mono);
      font-size: 13px;
      color: #fff;
    }

    /* Telemetry Grid */
    .telemetry-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .telemetry-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .telemetry-card-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-dim);
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .telemetry-stat-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      font-family: var(--font-mono);
      font-size: 12px;
    }

    /* Pub/Sub View */
    .pubsub-grid {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 16px;
      flex: 1;
      overflow: hidden;
    }

    .messages-stream-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .pubsub-form-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Modals */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .modal-backdrop.active {
      display: flex;
    }

    .modal-window {
      background: #0f1422;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      width: 480px;
      max-width: 90vw;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
      overflow: hidden;
    }

    .modal-header {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 700;
    }

    .modal-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .modal-footer {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.02);
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-group label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase;
    }

    .form-group input, .form-group select, .form-group textarea {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px;
      color: #fff;
      font-family: var(--font-mono);
      font-size: 12px;
      outline: none;
    }

    .form-group input:focus, .form-group textarea:focus {
      border-color: var(--redis-red);
    }
  </style>
</head>
<body oncontextmenu="return false;">

  <!-- Header Bar -->
  <header>
    <div class="brand-section">
      <div class="brand-badge">⚡ REDIS STUDIO PRO</div>
      <div class="brand-sub">Bun Native Engine</div>
    </div>

    <!-- Live Telemetry KPI Strip -->
    <div class="kpi-strip">
      <div class="kpi-chip">
        <span class="kpi-chip-label">Total Keys</span>
        <span class="kpi-chip-value highlight" id="kpiKeys">0</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-chip-label">Memory</span>
        <span class="kpi-chip-value" id="kpiMem">0B</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-chip-label">Hit Ratio</span>
        <span class="kpi-chip-value good" id="kpiHit">100%</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-chip-label">Ops / Sec</span>
        <span class="kpi-chip-value" id="kpiOps">0</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-chip-label">Clients</span>
        <span class="kpi-chip-value" id="kpiClients">1</span>
      </div>
      <div class="kpi-chip">
        <span class="kpi-chip-label">Active DB</span>
        <span class="kpi-chip-value highlight" id="kpiDb">db0</span>
      </div>
    </div>

    <div class="header-actions">
      <button class="btn btn-emerald" onclick="seedSampleData()">🌱 Seed Sample DB</button>
      <button class="btn" onclick="openConnectModal()">🔌 Host / DB</button>
      <button class="btn btn-primary" onclick="openAddKeyModal()">＋ Add Key</button>
      <button class="btn" id="btnFullscreen" onclick="window.doToggleFullscreen ? window.doToggleFullscreen() : (window.toggleFullscreen && window.toggleFullscreen())" title="Toggle Fullscreen (Fn+F / F / F11 / Cmd+Ctrl+F)">⛶ Fullscreen</button>
    </div>
  </header>

  <!-- Main Workstation Layout -->
  <div class="app-workspace">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="conn-row">
          <div class="conn-pill" id="connPill">
            <div class="status-dot" id="statusDot"></div>
            <span id="connLabel">redis://127.0.0.1:6379</span>
          </div>
          <select id="dbSelect" onchange="switchDatabase(this.value)" style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); color: #fff; padding: 3px 6px; border-radius: 4px; font-family: var(--font-mono); font-size: 11px;">
            ${Array.from({ length: 16 })
              .map((_, i) => `<option value="${i}">DB ${i}</option>`)
              .join("")}
          </select>
        </div>

        <div class="search-box">
          <span>🔍</span>
          <input type="text" id="searchPattern" placeholder="Pattern (e.g. * or auth:*)" oninput="filterKeys()" />
        </div>

        <div class="type-filter-bar" id="typeFilterBar">
          <div class="type-pill active" onclick="setTypeFilter('ALL')">ALL</div>
          <div class="type-pill" onclick="setTypeFilter('STRING')">STR</div>
          <div class="type-pill" onclick="setTypeFilter('HASH')">HASH</div>
          <div class="type-pill" onclick="setTypeFilter('LIST')">LIST</div>
          <div class="type-pill" onclick="setTypeFilter('SET')">SET</div>
          <div class="type-pill" onclick="setTypeFilter('ZSET')">ZSET</div>
          <div class="type-pill" onclick="setTypeFilter('STREAM')">STREAM</div>
          <div class="type-pill" onclick="setTypeFilter('HYPERLOGLOG')">HLL</div>
          <div class="type-pill" onclick="setTypeFilter('BITMAP')">BIT</div>
        </div>
      </div>

      <div class="key-list-container" id="keyList">
        <!-- Dynamic keys list -->
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="main-content">
      <!-- Tabs -->
      <div class="tab-strip">
        <button class="tab-btn active" onclick="switchTab('data')">📊 Key & Data Editor</button>
        <button class="tab-btn" onclick="switchTab('cli')">💻 Interactive CLI Console</button>
        <button class="tab-btn" onclick="switchTab('telemetry')">📈 Server Telemetry & Metrics</button>
        <button class="tab-btn" onclick="switchTab('pubsub')">📡 Pub / Sub Live Monitor</button>
        <button class="tab-btn" onclick="switchTab('slowlog')">⏱️ Slowlog & Clients</button>
      </div>

      <!-- Tab 1: Key & Data Editor -->
      <div class="tab-panel active" id="tab-data">
        <div class="key-header-card" id="keyHeaderCard" style="display: none;">
          <div class="key-meta-left">
            <div class="key-type-badge" id="activeKeyType">STRING</div>
            <div class="key-title-display" id="activeKeyName">key_name</div>
            <div class="key-ttl" id="activeKeyTtl">TTL: -1 (No Expiry)</div>
          </div>
          <div class="key-actions-right">
            <button class="btn btn-cyan" onclick="openTtlModal()">⏱️ Set TTL</button>
            <button class="btn" onclick="openRenameModal()">✏️ Rename</button>
            <button class="btn btn-danger" onclick="deleteCurrentKey()">🗑️ Delete</button>
          </div>
        </div>

        <div class="data-viewer-card" id="dataViewerCard">
          <div class="data-toolbar">
            <span id="dataViewerMeta" style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">Select a key from the sidebar to inspect and edit</span>
            <div id="dataToolbarActions" style="display: none;">
              <button class="btn btn-emerald" onclick="saveKeyChanges()">💾 Save Changes</button>
            </div>
          </div>
          <div class="data-content-area" id="dataContentArea">
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-dim); gap: 12px;">
              <div style="font-size: 32px;">⚡</div>
              <div>Select a key to view or create one with <strong>＋ Add Key</strong></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Interactive CLI Console -->
      <div class="tab-panel" id="tab-cli">
        <div class="cli-container">
          <div class="cli-history" id="cliHistory">
            <div class="cli-entry">
              <div class="cli-prompt-line"># Bun Native Redis CLI Engine ready. Type any Redis command or pick a preset:</div>
            </div>
          </div>
          <div style="padding: 6px 12px; background: rgba(255,255,255,0.02); display: flex; gap: 6px; overflow-x: auto; border-top: 1px solid var(--border-color);">
            ${REDIS_CLI_PRESETS.map((p) => `<button class="btn" style="font-size: 10px; padding: 2px 8px;" onclick="runPreset('${p.cmd}')">${p.name}</button>`).join("")}
          </div>
          <div class="cli-input-bar">
            <span style="color: var(--accent-cyan); font-weight: 700;">redis&gt;</span>
            <input type="text" id="cliInput" placeholder="e.g. GET mykey, HGETALL myhash, ZRANGE myzset 0 -1 WITHSCORES" onkeydown="handleCliKeyDown(event)" />
            <button class="btn btn-primary" onclick="submitCli()">Run</button>
          </div>
        </div>
      </div>

      <!-- Tab 3: Telemetry Dashboard -->
      <div class="tab-panel" id="tab-telemetry">
        <div class="telemetry-grid">
          <div class="telemetry-card">
            <div class="telemetry-card-title">Memory Allocation <span>📊</span></div>
            <div class="telemetry-stat-row"><span>Used Memory:</span><strong id="telUsedMem">0B</strong></div>
            <div class="telemetry-stat-row"><span>Peak Memory:</span><strong id="telPeakMem">0B</strong></div>
            <div class="telemetry-stat-row"><span>Fragmentation Ratio:</span><strong id="telFragRatio">1.0</strong></div>
          </div>

          <div class="telemetry-card">
            <div class="telemetry-card-title">Throughput & Health <span>⚡</span></div>
            <div class="telemetry-stat-row"><span>Instantaneous Ops/sec:</span><strong id="telOps">0</strong></div>
            <div class="telemetry-stat-row"><span>Total Commands:</span><strong id="telTotalCmds">0</strong></div>
            <div class="telemetry-stat-row"><span>Cache Hit Ratio:</span><strong id="telHitRatio">100%</strong></div>
          </div>

          <div class="telemetry-card">
            <div class="telemetry-card-title">Server Specifications <span>🖥️</span></div>
            <div class="telemetry-stat-row"><span>Redis Version:</span><strong id="telVersion">8.x</strong></div>
            <div class="telemetry-stat-row"><span>Host OS:</span><strong id="telOs">Darwin</strong></div>
            <div class="telemetry-stat-row"><span>Architecture:</span><strong id="telArch">64-bit</strong></div>
            <div class="telemetry-stat-row"><span>Server Uptime:</span><strong id="telUptime">0s</strong></div>
          </div>
        </div>
      </div>

      <!-- Tab 4: Pub/Sub Broadcast Station -->
      <div class="tab-panel" id="tab-pubsub">
        <div class="pubsub-grid">
          <div class="messages-stream-card">
            <div class="data-toolbar">
              <span style="font-weight: 700; color: var(--accent-cyan);">📡 Live Message Feed</span>
              <button class="btn btn-danger" style="font-size: 10px; padding: 2px 6px;" onclick="clearPubSubLog()">Clear Feed</button>
            </div>
            <div class="data-content-area" id="pubsubMessagesList">
              <div style="color: var(--text-dim); text-align: center; padding: 20px;">No messages received yet. Subscribe to a channel below or publish a message.</div>
            </div>
          </div>

          <div class="pubsub-form-card">
            <div style="font-weight: 700; font-size: 13px; color: var(--text-main);">Publish Message</div>
            <div class="form-group">
              <label>Target Channel</label>
              <input type="text" id="pubChannel" value="notifications" />
            </div>
            <div class="form-group">
              <label>Payload / Message</label>
              <textarea id="pubPayload" rows="4" placeholder="Enter text or JSON payload...">{"event": "USER_SIGNUP", "userId": "usr_9021"}</textarea>
            </div>
            <button class="btn btn-primary" onclick="publishPubSub()">🚀 Publish Broadcast</button>

            <div style="margin-top: 16px; font-weight: 700; font-size: 13px; color: var(--text-main);">Subscribe Channel</div>
            <div class="form-group">
              <label>Channel Name</label>
              <input type="text" id="subChannelInput" value="notifications" />
            </div>
            <button class="btn btn-cyan" onclick="subscribePubSub()">📥 Subscribe Live</button>
          </div>
        </div>
      </div>

      <!-- Tab 5: Slowlog & Clients -->
      <div class="tab-panel" id="tab-slowlog">
        <div style="display: flex; gap: 16px; flex: 1; overflow: hidden;">
          <div class="telemetry-card" style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
            <div class="telemetry-card-title">Recent Slowlog Entries (Top 25) <span>⏱️</span></div>
            <div style="flex: 1; overflow-y: auto;">
              <table class="pro-table" id="slowlogTable">
                <thead><tr><th>ID</th><th>Execution (μs)</th><th>Command</th><th>Timestamp</th></tr></thead>
                <tbody><tr><td colspan="4" style="color: var(--text-dim); text-align: center;">No slow operations recorded</td></tr></tbody>
              </table>
            </div>
          </div>

          <div class="telemetry-card" style="width: 360px; overflow: hidden; display: flex; flex-direction: column;">
            <div class="telemetry-card-title">Active Connected Clients <span>👥</span></div>
            <div style="flex: 1; overflow-y: auto;" id="clientsContainer">
              <div style="color: var(--text-dim); padding: 8px;">Loading clients...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Modals -->

  <!-- Add Key Modal -->
  <div class="modal-backdrop" id="addKeyModal">
    <div class="modal-window">
      <div class="modal-header">
        <span>＋ Create New Redis Key</span>
        <button class="btn" onclick="closeModal('addKeyModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Data Structure Type</label>
          <select id="newKeyType">
            <option value="string">String</option>
            <option value="hash">Hash</option>
            <option value="list">List</option>
            <option value="set">Set</option>
            <option value="zset">Sorted Set (ZSet)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Key Name (Supports namespaces e.g. cache:user:101)</label>
          <input type="text" id="newKeyName" placeholder="e.g. app:session:tok_123" />
        </div>
        <div class="form-group">
          <label>Initial Value / Payload</label>
          <textarea id="newKeyValue" rows="5" placeholder="Value, JSON, or comma-separated list/set items"></textarea>
        </div>
        <div class="form-group">
          <label>Time to Live (Seconds, optional)</label>
          <input type="number" id="newKeyTtl" placeholder="Leave empty for persistent" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal('addKeyModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitAddKey()">Create Key</button>
      </div>
    </div>
  </div>

  <!-- Connection & DB Modal -->
  <div class="modal-backdrop" id="connectModal">
    <div class="modal-window">
      <div class="modal-header">
        <span>🔌 Connection & Database Config</span>
        <button class="btn" onclick="closeModal('connectModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Redis Connection URL</label>
          <input type="text" id="connectUrlInput" value="redis://127.0.0.1:6379" placeholder="redis://:password@host:port/db" />
        </div>
        <div class="form-group">
          <label>Select Target Database (0 - 15)</label>
          <select id="connectDbSelect">
            ${Array.from({ length: 16 })
              .map((_, i) => `<option value="${i}">Database ${i}</option>`)
              .join("")}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal('connectModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitConnect()">Connect</button>
      </div>
    </div>
  </div>

  <!-- TTL Modal -->
  <div class="modal-backdrop" id="ttlModal">
    <div class="modal-window">
      <div class="modal-header">
        <span>⏱️ Set Key Expiry (TTL)</span>
        <button class="btn" onclick="closeModal('ttlModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>TTL in Seconds (-1 for Persist / No Expiry)</label>
          <input type="number" id="ttlSecondsInput" placeholder="-1 to remove expiry, or seconds" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal('ttlModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitTtl()">Update TTL</button>
      </div>
    </div>
  </div>

  <!-- Rename Modal -->
  <div class="modal-backdrop" id="renameModal">
    <div class="modal-window">
      <div class="modal-header">
        <span>✏️ Rename Key</span>
        <button class="btn" onclick="closeModal('renameModal')">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>New Key Name</label>
          <input type="text" id="renameInput" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="closeModal('renameModal')">Cancel</button>
        <button class="btn btn-primary" onclick="submitRename()">Rename</button>
      </div>
    </div>
  </div>

  <!-- Script Engine -->
  <script>
    let activeKey = null;
    let activeKeyData = null;
    let allKeysList = [];
    let currentTypeFilter = 'ALL';

    // ---------------------------------------------------------------------------------------------
    // Human-Readable Formatting Helpers
    // ---------------------------------------------------------------------------------------------

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function formatTtlHuman(ttl) {
      if (ttl === -1) return '<span class="ttl-badge-persistent">🟢 Persistent (No Expiration)</span>';
      if (ttl === -2 || ttl <= 0) return '<span style="color: #f87171; font-weight: 600;">🔴 Expired / Missing</span>';
      if (ttl < 60) return \`<span class="ttl-badge-expiring">🟡 Expires in \${ttl} seconds</span>\`;
      if (ttl < 3600) {
        const mins = Math.floor(ttl / 60);
        const secs = ttl % 60;
        return \`<span class="ttl-badge-expiring">🟡 Expires in \${mins}m \${secs}s (\${ttl.toLocaleString()}s)</span>\`;
      }
      if (ttl < 86400) {
        const hrs = Math.floor(ttl / 3600);
        const mins = Math.floor((ttl % 3600) / 60);
        return \`<span class="ttl-badge-expiring">🟡 Expires in \${hrs}h \${mins}m (\${ttl.toLocaleString()}s)</span>\`;
      }
      const days = Math.floor(ttl / 86400);
      const hrs = Math.floor((ttl % 86400) / 3600);
      return \`<span class="ttl-badge-expiring">🟡 Expires in \${days}d \${hrs}h (\${ttl.toLocaleString()}s)</span>\`;
    }

    function formatTtlPill(ttl) {
      if (ttl === -1) return '∞';
      if (ttl === -2 || ttl <= 0) return '✕';
      if (ttl < 60) return ttl + 's';
      if (ttl < 3600) return Math.floor(ttl / 60) + 'm';
      if (ttl < 86400) return Math.floor(ttl / 3600) + 'h';
      return Math.floor(ttl / 86400) + 'd';
    }

    function findSidebarTtlPill(key) {
      const pills = document.querySelectorAll('.key-ttl[data-key]');
      for (const pill of pills) {
        if (pill.getAttribute('data-key') === key) {
          return pill;
        }
      }
      return null;
    }

    function formatBytesHuman(bytes) {
      if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
      const num = Number(bytes);
      if (num < 1024) return num + ' B';
      if (num < 1048576) return (num / 1024).toFixed(1) + ' KB';
      if (num < 1073741824) return (num / 1048576).toFixed(2) + ' MB';
      return (num / 1073741824).toFixed(2) + ' GB';
    }

    function formatTypeHuman(type) {
      const map = {
        'string': 'String (Key-Value)',
        'hash': 'Hash (Object / Fields)',
        'list': 'List (Queue / Array)',
        'set': 'Set (Unique Items)',
        'zset': 'Sorted Set (Leaderboard)',
        'stream': 'Stream (Event Feed)',
        'hyperloglog': 'HyperLogLog (Cardinality Counter)',
        'bitmap': 'Bitmap (Bitset Array)',
      };
      return map[type?.toLowerCase()] || (type?.toUpperCase() || 'UNKNOWN');
    }

    function formatElementsCount(type, length) {
      const count = length || 0;
      switch (type?.toLowerCase()) {
        case 'string':
          return \`\${count.toLocaleString()} characters (\${formatBytesHuman(count)})\`;
        case 'hash':
          return \`\${count.toLocaleString()} field\${count === 1 ? '' : 's'}\`;
        case 'list':
          return \`\${count.toLocaleString()} element\${count === 1 ? '' : 's'}\`;
        case 'set':
          return \`\${count.toLocaleString()} unique member\${count === 1 ? '' : 's'}\`;
        case 'zset':
          return \`\${count.toLocaleString()} ranked member\${count === 1 ? '' : 's'}\`;
        case 'stream':
          return \`\${count.toLocaleString()} stream event\${count === 1 ? '' : 's'}\`;
        case 'hyperloglog':
          return \`\${count.toLocaleString()} unique estimated items (PFCOUNT)\`;
        case 'bitmap':
          return \`\${count.toLocaleString()} set bits (BITCOUNT)\`;
        default:
          return \`\${count.toLocaleString()} items\`;
      }
    }

    function formatTimeAgo(isoString) {
      if (!isoString) return 'N/A';
      try {
        const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
        if (diff < 5) return 'Just now';
        if (diff < 60) return \`\${diff}s ago\`;
        if (diff < 3600) return \`\${Math.floor(diff / 60)}m ago\`;
        if (diff < 86400) return \`\${Math.floor(diff / 3600)}h ago\`;
        return \`\${Math.floor(diff / 86400)}d ago\`;
      } catch {
        return isoString;
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Initial Load & Telemetry Polling
    // ---------------------------------------------------------------------------------------------

    window.addEventListener('DOMContentLoaded', () => {
      refreshAll();
      setInterval(refreshTelemetry, 2500);
      setInterval(pollPubSubMessages, 2000);
      setInterval(tickTtls, 1000);
      setInterval(syncActiveTtl, 4000);
    });

    async function refreshAll() {
      await Promise.all([
        refreshTelemetry(),
        refreshKeysList(),
      ]);
    }

    async function refreshTelemetry() {
      try {
        const res = await fetch('/api/kpis');
        const kpis = await res.json();

        document.getElementById('kpiKeys').textContent = kpis.totalKeys.toLocaleString();
        document.getElementById('kpiMem').textContent = kpis.usedMemoryHuman;
        document.getElementById('kpiHit').textContent = kpis.hitRatioPercent + '%';
        document.getElementById('kpiOps').textContent = kpis.instantaneousOpsPerSec.toLocaleString();
        document.getElementById('kpiClients').textContent = kpis.connectedClients.toLocaleString();
        document.getElementById('kpiDb').textContent = 'db' + kpis.activeDb;

        document.getElementById('statusDot').className = 'status-dot ' + (kpis.connected ? '' : 'offline');
        document.getElementById('connLabel').textContent = kpis.url;

        // Telemetry tab values
        document.getElementById('telUsedMem').textContent = \`\${kpis.usedMemoryHuman} (\${kpis.usedMemoryBytes.toLocaleString()} bytes)\`;
        document.getElementById('telPeakMem').textContent = kpis.usedMemoryPeakHuman;
        document.getElementById('telFragRatio').textContent = \`\${kpis.memFragmentationRatio.toFixed(2)} (Memory Allocator Headroom)\`;
        document.getElementById('telOps').textContent = \`\${kpis.instantaneousOpsPerSec.toLocaleString()} ops/sec\`;
        document.getElementById('telTotalCmds').textContent = \`\${kpis.totalCommandsProcessed.toLocaleString()} commands executed\`;
        document.getElementById('telHitRatio').textContent = \`\${kpis.hitRatioPercent}% (Hits: \${kpis.keyspaceHits.toLocaleString()}, Misses: \${kpis.keyspaceMisses.toLocaleString()})\`;
        document.getElementById('telVersion').textContent = \`Redis v\${kpis.redisVersion}\`;
        document.getElementById('telOs').textContent = kpis.os;
        document.getElementById('telArch').textContent = kpis.arch;
        document.getElementById('telUptime').textContent = kpis.uptimeFormatted;
      } catch (err) {
        console.error('Failed to refresh telemetry:', err);
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Keys List & Filter
    // ---------------------------------------------------------------------------------------------

    async function refreshKeysList() {
      try {
        const pattern = document.getElementById('searchPattern').value || '*';
        const res = await fetch('/api/keys?pattern=' + encodeURIComponent(pattern));
        const data = await res.json();
        allKeysList = data.keys || [];
        renderKeysList();
      } catch (err) {
        console.error('Failed to load keys:', err);
      }
    }

    function renderKeysList() {
      const container = document.getElementById('keyList');
      const filtered = allKeysList.filter(k => {
        if (currentTypeFilter !== 'ALL' && k.type.toUpperCase() !== currentTypeFilter) {
          return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="color: var(--text-dim); padding: 16px; text-align: center;">No keys match current filter</div>';
        return;
      }

      container.innerHTML = filtered.map(item => {
        const isSelected = activeKey === item.key;
        const typeClass = 'type-' + item.type.toLowerCase();
        const ttlPill = formatTtlPill(item.ttl);
        const ttlTitle = item.ttl === -1 ? 'Persistent key' : \`Expires in \${item.ttl}s\`;

        return \`
          <div class="key-item \${isSelected ? 'selected' : ''}" onclick="selectKey('\${item.key}')" title="\${item.key}">
            <div class="key-left">
              <span class="key-type-badge \${typeClass}">\${item.type}</span>
              <span class="key-name">\${escapeHtml(item.key)}</span>
            </div>
            <span class="key-ttl" data-key="\${escapeHtml(item.key)}" title="\${ttlTitle}">\${ttlPill}</span>
          </div>
        \`;
      }).join('');
    }

    function setTypeFilter(type) {
      currentTypeFilter = type;
      document.querySelectorAll('#typeFilterBar .type-pill').forEach(pill => {
        pill.classList.toggle('active', pill.textContent === type || (type === 'STRING' && pill.textContent === 'STR'));
      });
      renderKeysList();
    }

    function filterKeys() {
      refreshKeysList();
    }

    function tickTtls() {
      // 1. Live countdown for currently inspected active key
      if (activeKeyData && activeKeyData.key === activeKey) {
        if (typeof activeKeyData.ttl === 'number' && activeKeyData.ttl > 0) {
          activeKeyData.ttl -= 1;
          const ttlEl = document.getElementById('activeKeyTtl');
          if (ttlEl) {
            ttlEl.innerHTML = formatTtlHuman(activeKeyData.ttl);
          }
          if (activeKeyData.ttl === 0) {
            activeKeyData.ttl = -2;
            if (ttlEl) ttlEl.innerHTML = formatTtlHuman(-2);
            setTimeout(refreshKeysList, 1000);
          }
        }
      }

      // 2. Live countdown for sidebar keys without causing list re-renders
      let anyExpired = false;
      for (const item of allKeysList) {
        if (typeof item.ttl === 'number' && item.ttl > 0) {
          item.ttl -= 1;
          const pill = findSidebarTtlPill(item.key);
          if (pill) {
            pill.textContent = formatTtlPill(item.ttl);
            pill.title = item.ttl > 0 ? \`Expires in \${item.ttl}s\` : 'Expired';
          }
          if (item.ttl === 0) {
            item.ttl = -2;
            anyExpired = true;
            if (pill) {
              pill.textContent = '✕';
              pill.title = 'Expired';
            }
          }
        }
      }

      if (anyExpired) {
        setTimeout(refreshKeysList, 1200);
      }
    }

    async function syncActiveTtl() {
      if (!activeKey) return;
      try {
        const res = await fetch('/api/key/ttl?key=' + encodeURIComponent(activeKey));
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && typeof data.ttl === 'number') {
          const serverTtl = data.ttl;
          if (activeKeyData && activeKeyData.key === activeKey && activeKeyData.ttl !== serverTtl) {
            activeKeyData.ttl = serverTtl;
            const ttlEl = document.getElementById('activeKeyTtl');
            if (ttlEl) ttlEl.innerHTML = formatTtlHuman(serverTtl);
          }
          const listItem = allKeysList.find(k => k.key === activeKey);
          if (listItem && listItem.ttl !== serverTtl) {
            listItem.ttl = serverTtl;
            const pill = findSidebarTtlPill(activeKey);
            if (pill) {
              pill.textContent = formatTtlPill(serverTtl);
              pill.title = serverTtl === -1 ? 'Persistent key' : (serverTtl <= 0 ? 'Expired' : \`Expires in \${serverTtl}s\`);
            }
          }
          if (serverTtl === -2) {
            refreshKeysList();
          }
        }
      } catch (err) {
        // quiet background sync
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Inspect Key Details
    // ---------------------------------------------------------------------------------------------

    async function selectKey(keyName) {
      activeKey = keyName;
      renderKeysList();

      try {
        const res = await fetch('/api/key/get?key=' + encodeURIComponent(keyName));
        const details = await res.json();
        activeKeyData = details;

        document.getElementById('keyHeaderCard').style.display = 'flex';
        if (details.type === 'hyperloglog' || details.type === 'bitmap') {
          document.getElementById('dataToolbarActions').style.display = 'none';
        } else {
          document.getElementById('dataToolbarActions').style.display = 'flex';
        }
        document.getElementById('activeKeyName').textContent = details.key;
        document.getElementById('activeKeyType').textContent = formatTypeHuman(details.type);
        document.getElementById('activeKeyType').className = 'key-type-badge type-' + details.type.toLowerCase();

        document.getElementById('activeKeyTtl').innerHTML = formatTtlHuman(details.ttl);
        document.getElementById('dataViewerMeta').textContent = \`Type: \${formatTypeHuman(details.type)} • Size: \${formatElementsCount(details.type, details.length)}\`;

        renderKeyEditor(details);
      } catch (err) {
        console.error('Failed to load key details:', err);
      }
    }

    function renderKeyEditor(details) {
      const area = document.getElementById('dataContentArea');

      if (details.type === 'string') {
        let displayVal = details.value ?? '';
        let jsonValidBadge = '';
        if (details.isJson) {
          try {
            displayVal = JSON.stringify(JSON.parse(displayVal), null, 2);
            jsonValidBadge = '<span style="color: var(--accent-emerald); font-weight: 600;">(✅ Valid Formatted JSON)</span>';
          } catch {}
        }
        const charCount = (details.value || '').length;
        const lineCount = (displayVal.split('\\n') || []).length;

        area.innerHTML = \`
          <div style="height: 100%; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: var(--text-dim);">String Payload • \${charCount.toLocaleString()} chars (\${formatBytesHuman(charCount)}) • \${lineCount.toLocaleString()} line\${lineCount === 1 ? '' : 's'} \${jsonValidBadge}</span>
              <div style="display: flex; gap: 6px;">
                <button class="btn" style="font-size: 10px; padding: 2px 8px;" onclick="formatStringJson()">✨ Prettify JSON</button>
                <button class="btn" style="font-size: 10px; padding: 2px 8px;" onclick="copyEditorContent()">📋 Copy Value</button>
              </div>
            </div>
            <textarea id="stringEditor" style="flex: 1; width: 100%; background: #05070a; border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; color: #a5f3fc; font-family: var(--font-mono); font-size: 13px; line-height: 1.5; resize: none;">\${escapeHtml(displayVal)}</textarea>
          </div>
        \`;
      } else if (details.type === 'hash') {
        const entries = Object.entries(details.value || {});
        area.innerHTML = \`
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: var(--text-dim);">Hash Dictionary • \${entries.length.toLocaleString()} key-value fields</span>
              <button class="btn btn-cyan" style="font-size: 11px;" onclick="addHashField()">＋ Add Field</button>
            </div>
            <table class="pro-table">
              <thead><tr><th style="width: 220px;">Field Name</th><th>Field Value</th><th style="width: 70px;">Action</th></tr></thead>
              <tbody id="hashRows">
                \${entries.map(([f, v]) => \`
                  <tr>
                    <td style="color: var(--accent-cyan); font-weight: 600;"><span style="background: rgba(6,182,212,0.1); padding: 2px 6px; border-radius: 4px;">\${escapeHtml(f)}</span></td>
                    <td><input type="text" value="\${escapeHtml(v)}" class="hash-field-input" data-field="\${escapeHtml(f)}" style="width: 100%; background: transparent; border: 1px solid transparent; color: #fff; font-family: var(--font-mono); font-size: 12px;" /></td>
                    <td><button class="btn btn-danger" style="font-size: 10px; padding: 2px 6px;" onclick="deleteHashField('\${escapeHtml(f)}')">Delete</button></td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } else if (details.type === 'list') {
        const items = details.value || [];
        area.innerHTML = \`
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: var(--text-dim);">Ordered List Queue • \${items.length.toLocaleString()} elements</span>
              <button class="btn btn-cyan" style="font-size: 11px;" onclick="pushListItem()">＋ Push Element</button>
            </div>
            <table class="pro-table">
              <thead><tr><th style="width: 70px;">Index</th><th>Element Value</th><th style="width: 90px;">Length</th></tr></thead>
              <tbody>
                \${items.map((it, idx) => \`
                  <tr>
                    <td style="color: var(--text-dim); font-weight: 700;">[\${idx}]</td>
                    <td style="color: #fff;">\${escapeHtml(it)}</td>
                    <td style="color: var(--text-dim);">\${(String(it) || '').length} chars</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } else if (details.type === 'set') {
        const members = details.value || [];
        area.innerHTML = \`
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: var(--text-dim);">Unique Set Collection • \${members.length.toLocaleString()} unique members</span>
              <button class="btn btn-cyan" style="font-size: 11px;" onclick="addSetMember()">＋ Add Member</button>
            </div>
            <table class="pro-table">
              <thead><tr><th style="width: 50px;">#</th><th>Unique Member Value</th></tr></thead>
              <tbody>
                \${members.map((m, idx) => \`
                  <tr>
                    <td style="color: var(--text-dim);">\${idx + 1}</td>
                    <td style="color: #fff;">\${escapeHtml(m)}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } else if (details.type === 'zset') {
        const items = details.value || [];
        area.innerHTML = \`
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: var(--text-dim);">Sorted Set Leaderboard • \${items.length.toLocaleString()} ranked members</span>
              <button class="btn btn-cyan" style="font-size: 11px;" onclick="addZsetMember()">＋ Add Ranked Item</button>
            </div>
            <table class="pro-table">
              <thead><tr><th style="width: 60px;">Rank</th><th style="width: 120px;">Score</th><th>Member Name</th></tr></thead>
              <tbody>
                \${items.map((it, idx) => {
                  const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-other';
                  return \`
                    <tr>
                      <td><span class="rank-pill \${rankClass}">\${idx + 1}</span></td>
                      <td style="color: var(--accent-amber); font-weight: 700;">\${Number(it.score).toLocaleString()}</td>
                      <td style="color: #fff; font-weight: 600;">\${escapeHtml(it.member)}</td>
                    </tr>
                  \`;
                }).join('')}
              </tbody>
            </table>
          </div>
        \`;
      } else if (details.type === 'hyperloglog' || details.isHyperLogLog) {
        const val = details.value || {};
        area.innerHTML = \`
          <div style="display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto;">
            <div style="background: rgba(249, 115, 22, 0.08); border: 1px solid rgba(249, 115, 22, 0.3); border-radius: 8px; padding: 18px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #fdba74; font-weight: 700; margin-bottom: 4px;">
                  📊 Estimated Unique Cardinality (PFCOUNT)
                </div>
                <div style="font-size: 34px; font-weight: 800; color: #fff; font-family: var(--font-mono); letter-spacing: -0.5px;">
                  \${val.cardinalityFormatted || (val.cardinality !== undefined ? Number(val.cardinality).toLocaleString() : '0')}
                  <span style="font-size: 14px; font-weight: 500; color: var(--text-muted); margin-left: 8px;">unique items / visitors</span>
                </div>
              </div>
              <div style="text-align: right;">
                <span class="key-type-badge type-hyperloglog" style="font-size: 12px; padding: 4px 10px;">HYLL Structure</span>
                <div style="font-size: 11px; color: var(--text-dim); margin-top: 6px;">Std. Error &lt; 0.81%</div>
              </div>
            </div>

            <!-- Architecture Specifications Card -->
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
              <h4 style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                <span>ℹ️</span> HyperLogLog Technical Architecture
              </h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                  <div style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Register Encoding</div>
                  <div style="font-size: 12px; font-weight: 600; color: #a5f3fc; margin-top: 2px;">\${escapeHtml(val.encoding || 'Dense / Sparse Register Array')}</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                  <div style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Allocated Memory</div>
                  <div style="font-size: 12px; font-weight: 600; color: var(--accent-emerald); margin-top: 2px;">\${escapeHtml(val.memoryUsageFormatted || '12 KB fixed')}</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                  <div style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Standard Error Limit</div>
                  <div style="font-size: 12px; font-weight: 600; color: #fdba74; margin-top: 2px;">&plusmn; 0.81%</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 10px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                  <div style="font-size: 10px; color: var(--text-dim); text-transform: uppercase;">Binary Magic Header</div>
                  <div style="font-size: 12px; font-weight: 600; color: #fff; font-family: var(--font-mono); margin-top: 2px;">HYLL (4 bytes)</div>
                </div>
              </div>
              <div style="margin-top: 12px; font-size: 11px; color: var(--text-muted); line-height: 1.5;">
                HyperLogLog is an advanced probabilistic algorithm in Redis used to count unique elements (such as unique visitors, IP addresses, or user sessions) using a constant ~12 KB memory footprint regardless of whether counting 10 or 10,000,000,000 items. Redis stores internal 16,384 6-bit registers with binary prefix <code>HYLL</code>.
              </div>
            </div>

            <!-- Quick Add Element / Tester -->
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
              <h4 style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
                ＋ Add Unique Item to HyperLogLog (PFADD)
              </h4>
              <div style="display: flex; gap: 8px;">
                <input id="hllNewItemInput" type="text" placeholder="e.g. usr_session_9921 or 192.168.1.55" style="flex: 1; background: #05070a; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: #fff; font-family: var(--font-mono); font-size: 12px;" />
                <button class="btn btn-cyan" onclick="addHllElement()">PFADD Element</button>
              </div>
            </div>
          </div>
        \`;
      } else if (details.type === 'bitmap' || details.isBitmap) {
        const val = details.value || {};
        const positions = val.activePositions || [];
        area.innerHTML = \`
          <div style="display: flex; flex-direction: column; gap: 16px; height: 100%; overflow-y: auto;">
            <div style="background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.3); border-radius: 8px; padding: 18px; display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #7dd3fc; font-weight: 700; margin-bottom: 4px;">
                  ⚡ Total Active Bits (BITCOUNT)
                </div>
                <div style="font-size: 34px; font-weight: 800; color: #fff; font-family: var(--font-mono); letter-spacing: -0.5px;">
                  \${val.setBits !== undefined ? Number(val.setBits).toLocaleString() : '0'}
                  <span style="font-size: 14px; font-weight: 500; color: var(--text-muted); margin-left: 8px;">bits set to 1</span>
                </div>
              </div>
              <div style="text-align: right;">
                <span class="key-type-badge type-bitmap" style="font-size: 12px; padding: 4px 10px;">Bitmap Array</span>
                <div style="font-size: 11px; color: var(--text-dim); margin-top: 6px;">Total Size: \${escapeHtml(val.memoryUsageFormatted || '0 bytes')}</div>
              </div>
            </div>

            <!-- Active Bit Positions Card -->
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
              <h4 style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
                Active Bit Offsets (Index Positions = 1)
              </h4>
              <div style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 180px; overflow-y: auto;">
                \${positions.length > 0 
                  ? positions.map(p => \`<span style="background: rgba(14, 165, 233, 0.15); border: 1px solid rgba(14, 165, 233, 0.3); color: #7dd3fc; font-family: var(--font-mono); font-size: 11px; padding: 4px 8px; border-radius: 4px;">Bit [\${p}]</span>\`).join('') 
                  : '<span style="color: var(--text-dim);">No bits are currently set to 1.</span>'}
              </div>
            </div>

            <!-- Toggle / Set Bit Tool -->
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
              <h4 style="font-size: 13px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
                Set Bit Offset (SETBIT)
              </h4>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input id="bitmapOffsetInput" type="number" min="0" placeholder="Bit Offset (e.g. 15)" style="width: 160px; background: #05070a; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: #fff; font-family: var(--font-mono); font-size: 12px;" />
                <select id="bitmapValueInput" style="background: #05070a; border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; color: #fff; font-size: 12px;">
                  <option value="1">1 (Set Active)</option>
                  <option value="0">0 (Clear)</option>
                </select>
                <button class="btn btn-cyan" onclick="applyBitmapBit()">SETBIT</button>
              </div>
            </div>
          </div>
        \`;
      } else {
        area.innerHTML = \`<pre style="color: #cbd5e1; font-family: var(--font-mono); font-size: 12px;">\${escapeHtml(JSON.stringify(details.value, null, 2))}</pre>\`;
      }
    }

    async function addHllElement() {
      const input = document.getElementById('hllNewItemInput');
      if (!input) return;
      const val = input.value.trim();
      if (!val) {
        alert('Please enter an element string (e.g. user ID or IP)');
        return;
      }
      try {
        const res = await fetch('/api/key/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: activeKey, type: 'hyperloglog', value: val }),
        });
        const result = await res.json();
        if (result.success) {
          input.value = '';
          await selectKey(activeKey);
        } else {
          alert('Error: ' + (result.error || 'Failed to add item'));
        }
      } catch (e) {
        alert('Request failed: ' + e.message);
      }
    }

    async function applyBitmapBit() {
      const offsetInput = document.getElementById('bitmapOffsetInput');
      const valSelect = document.getElementById('bitmapValueInput');
      if (!offsetInput || !valSelect) return;
      const offset = parseInt(offsetInput.value, 10);
      if (isNaN(offset) || offset < 0) {
        alert('Please enter a valid non-negative bit offset');
        return;
      }
      const bitVal = parseInt(valSelect.value, 10);
      try {
        const res = await fetch('/api/key/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: activeKey, type: 'bitmap', field: String(offset), value: bitVal }),
        });
        const result = await res.json();
        if (result.success) {
          offsetInput.value = '';
          await selectKey(activeKey);
        } else {
          alert('Error: ' + (result.error || 'Failed to set bit'));
        }
      } catch (e) {
        alert('Request failed: ' + e.message);
      }
    }

    function formatStringJson() {
      const editor = document.getElementById('stringEditor');
      if (!editor) return;
      try {
        const parsed = JSON.parse(editor.value);
        editor.value = JSON.stringify(parsed, null, 2);
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    }

    function copyEditorContent() {
      const editor = document.getElementById('stringEditor');
      if (!editor) return;
      navigator.clipboard.writeText(editor.value).then(() => {
        alert('Copied to clipboard!');
      });
    }

    async function saveKeyChanges() {
      if (!activeKey || !activeKeyData) return;

      if (activeKeyData.type === 'string') {
        const val = document.getElementById('stringEditor').value;
        const res = await fetch('/api/key/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: activeKey, type: 'string', value: val }),
        });
        const result = await res.json();
        if (result.success) {
          alert('Key saved successfully!');
          refreshAll();
        } else {
          alert('Error: ' + result.error);
        }
      }
    }

    async function deleteCurrentKey() {
      if (!activeKey) return;
      if (!confirm(\`Are you sure you want to delete key "\${activeKey}"?\`)) return;

      const res = await fetch('/api/key/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: activeKey }),
      });
      const result = await res.json();
      if (result.success) {
        activeKey = null;
        document.getElementById('keyHeaderCard').style.display = 'none';
        document.getElementById('dataToolbarActions').style.display = 'none';
        document.getElementById('dataContentArea').innerHTML = '<div style="text-align: center; color: var(--text-dim); padding: 40px;">Key deleted</div>';
        refreshAll();
      }
    }

    // ---------------------------------------------------------------------------------------------
    // CLI Terminal Console (Human-Friendly Formatter)
    // ---------------------------------------------------------------------------------------------

    function handleCliKeyDown(event) {
      if (event.key === 'Enter') {
        submitCli();
      }
    }

    function formatCliResultHuman(result) {
      if (result === null || result === undefined) {
        return '<span style="color: var(--text-dim); font-style: italic;">(nil) — Key does not exist or empty result</span>';
      }
      if (result === 'OK' || result === true) {
        return '<span style="color: var(--accent-emerald); font-weight: 700;">OK</span> <span style="color: var(--text-dim);">(Command executed successfully)</span>';
      }
      if (typeof result === 'number') {
        return \`<span style="color: var(--accent-cyan); font-weight: 700;">(integer)</span> <span style="color: #fff; font-weight: 700;">\${result.toLocaleString()}</span>\`;
      }
      if (Array.isArray(result)) {
        if (result.length === 0) {
          return '<span style="color: var(--text-dim);">(empty array / 0 elements)</span>';
        }
        return result.map((item, i) => {
          const valStr = typeof item === 'object' ? JSON.stringify(item) : String(item);
          return \`<div style="padding: 1px 0;"><span style="color: var(--text-dim);">\${i + 1})</span> <span style="color: #fff;">\${escapeHtml(valStr)}</span></div>\`;
        }).join('');
      }
      if (typeof result === 'object') {
        return \`<pre style="margin: 0; color: #a5f3fc;">\${escapeHtml(JSON.stringify(result, null, 2))}</pre>\`;
      }
      return \`<span style="color: #fff;">\${escapeHtml(String(result))}</span>\`;
    }

    async function submitCli() {
      const input = document.getElementById('cliInput');
      const cmd = (input.value || '').trim();
      if (!cmd) return;

      input.value = '';
      appendCliEntry(cmd, 'Running command...', 0);

      try {
        const res = await fetch('/api/cli', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd }),
        });
        const data = await res.json();

        updateLastCliEntry(cmd, data.result, data.executionTimeMs, data.error);
      } catch (err) {
        updateLastCliEntry(cmd, null, 0, err.message);
      }
    }

    function appendCliEntry(cmd, initialOutput, time) {
      const hist = document.getElementById('cliHistory');
      const div = document.createElement('div');
      div.className = 'cli-entry';
      div.id = 'lastCliEntry';
      div.innerHTML = \`
        <div class="cli-prompt-line">redis&gt; \${escapeHtml(cmd)}</div>
        <div class="cli-result-line">\${initialOutput}</div>
      \`;
      hist.appendChild(div);
      hist.scrollTop = hist.scrollHeight;
    }

    function updateLastCliEntry(cmd, result, timeMs, error) {
      const entry = document.getElementById('lastCliEntry');
      if (!entry) return;
      entry.removeAttribute('id');

      let outputHtml = '';
      if (error) {
        outputHtml = \`<div class="cli-result-line error">(error) \${escapeHtml(error)}</div>\`;
      } else {
        outputHtml = \`<div class="cli-result-line">\${formatCliResultHuman(result)}</div>\`;
      }

      outputHtml += \`<div class="cli-result-line timing">⚡ Execution time: \${timeMs} ms</div>\`;
      entry.innerHTML = \`
        <div class="cli-prompt-line">redis&gt; \${escapeHtml(cmd)}</div>
        \${outputHtml}
      \`;
      document.getElementById('cliHistory').scrollTop = document.getElementById('cliHistory').scrollHeight;
    }

    function runPreset(commandText) {
      document.getElementById('cliInput').value = commandText;
      submitCli();
    }

    // ---------------------------------------------------------------------------------------------
    // Pub/Sub Broadcast & Polling
    // ---------------------------------------------------------------------------------------------

    async function publishPubSub() {
      const channel = document.getElementById('pubChannel').value;
      const message = document.getElementById('pubPayload').value;

      try {
        const res = await fetch('/api/pubsub/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, message }),
        });
        const data = await res.json();
        pollPubSubMessages();
      } catch (err) {
        alert('Publish failed: ' + err.message);
      }
    }

    async function subscribePubSub() {
      const channel = document.getElementById('subChannelInput').value;
      try {
        const res = await fetch('/api/pubsub/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel }),
        });
        const data = await res.json();
        if (data.success) {
          alert(\`Subscribed to live channel: "\${channel}"\`);
        }
      } catch (err) {
        alert('Subscribe failed: ' + err.message);
      }
    }

    async function pollPubSubMessages() {
      try {
        const res = await fetch('/api/pubsub/messages');
        const data = await res.json();
        const list = document.getElementById('pubsubMessagesList');
        if (!data.messages || data.messages.length === 0) return;

        list.innerHTML = data.messages.map(m => \`
          <div style="padding: 8px; border-bottom: 1px solid var(--border-color); font-family: var(--font-mono); font-size: 11px;">
            <div style="display: flex; justify-content: space-between; color: var(--text-dim);">
              <span style="color: var(--accent-cyan); font-weight: 700;">#\${escapeHtml(m.channel)}</span>
              <span>\${escapeHtml(m.timestamp)}</span>
            </div>
            <div style="color: #fff; margin-top: 4px; white-space: pre-wrap;">\${escapeHtml(m.message)}</div>
          </div>
        \`).join('');
      } catch {}
    }

    function clearPubSubLog() {
      document.getElementById('pubsubMessagesList').innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 20px;">Feed cleared.</div>';
    }

    // ---------------------------------------------------------------------------------------------
    // Seed Sample Database
    // ---------------------------------------------------------------------------------------------

    async function seedSampleData() {
      try {
        const res = await fetch('/api/seed', { method: 'POST' });
        const result = await res.json();
        if (result.success) {
          alert('🌱 Successfully seeded 12 sample enterprise keys spanning Strings, Hashes, Lists, Sets, ZSets, and Streams!');
          refreshAll();
        } else {
          alert('Failed to seed: ' + result.error);
        }
      } catch (err) {
        alert('Seed error: ' + err.message);
      }
    }

    // ---------------------------------------------------------------------------------------------
    // Modal Helpers
    // ---------------------------------------------------------------------------------------------

    function openModal(id) { document.getElementById(id).classList.add('active'); }
    function closeModal(id) { document.getElementById(id).classList.remove('active'); }

    function openAddKeyModal() { openModal('addKeyModal'); }
    function openConnectModal() { openModal('connectModal'); }
    function openTtlModal() {
      if (activeKeyData && typeof activeKeyData.ttl === 'number') {
        const input = document.getElementById('ttlSecondsInput');
        if (input) input.value = activeKeyData.ttl > 0 ? activeKeyData.ttl : -1;
      }
      openModal('ttlModal');
    }
    function openRenameModal() {
      document.getElementById('renameInput').value = activeKey || '';
      openModal('renameModal');
    }

    async function submitAddKey() {
      const type = document.getElementById('newKeyType').value;
      const key = document.getElementById('newKeyName').value.trim();
      const val = document.getElementById('newKeyValue').value;
      const ttl = parseInt(document.getElementById('newKeyTtl').value, 10);

      if (!key) { alert('Key name is required'); return; }

      const res = await fetch('/api/key/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, type, value: val, ttl: isNaN(ttl) ? undefined : ttl }),
      });
      const data = await res.json();
      if (data.success) {
        closeModal('addKeyModal');
        refreshAll();
        selectKey(key);
      } else {
        alert('Error: ' + data.error);
      }
    }

    async function submitConnect() {
      const url = document.getElementById('connectUrlInput').value;
      const db = parseInt(document.getElementById('connectDbSelect').value, 10);
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, db }),
      });
      const data = await res.json();
      if (data.success) {
        closeModal('connectModal');
        refreshAll();
      } else {
        alert('Connection failed: ' + data.error);
      }
    }

    async function switchDatabase(dbIndex) {
      const res = await fetch('/api/select-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db: parseInt(dbIndex, 10) }),
      });
      const data = await res.json();
      if (data.success) {
        refreshAll();
      }
    }

    async function submitTtl() {
      const ttl = parseInt(document.getElementById('ttlSecondsInput').value, 10);
      if (isNaN(ttl)) return;
      const res = await fetch('/api/key/ttl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: activeKey, ttl }),
      });
      const data = await res.json();
      if (data.success) {
        closeModal('ttlModal');
        // Immediate local state update
        if (activeKeyData && activeKeyData.key === activeKey) {
          activeKeyData.ttl = ttl;
          const ttlEl = document.getElementById('activeKeyTtl');
          if (ttlEl) ttlEl.innerHTML = formatTtlHuman(ttl);
        }
        const listItem = allKeysList.find(k => k.key === activeKey);
        if (listItem) {
          listItem.ttl = ttl;
          const pill = findSidebarTtlPill(activeKey);
          if (pill) {
            pill.textContent = formatTtlPill(ttl);
            pill.title = ttl === -1 ? 'Persistent key' : (ttl <= 0 ? 'Expired' : \`Expires in \${ttl}s\`);
          }
        }
        selectKey(activeKey);
      }
    }

    async function submitRename() {
      const newKey = document.getElementById('renameInput').value.trim();
      if (!newKey || newKey === activeKey) return;
      const res = await fetch('/api/key/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldKey: activeKey, newKey }),
      });
      const data = await res.json();
      if (data.success) {
        closeModal('renameModal');
        activeKey = newKey;
        refreshAll();
        selectKey(newKey);
      } else {
        alert('Rename error: ' + data.error);
      }
    }

    // Tab Switching
    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      const target = document.getElementById('tab-' + tabId);
      if (target) target.classList.add('active');

      const buttons = document.querySelectorAll('.tab-strip .tab-btn');
      const tabs = ['data', 'cli', 'telemetry', 'pubsub', 'slowlog'];
      const idx = tabs.indexOf(tabId);
      if (idx !== -1 && buttons[idx]) {
        buttons[idx].classList.add('active');
      }

      if (tabId === 'slowlog') {
        loadSlowlog();
        loadClients();
      }
    }

    async function loadSlowlog() {
      try {
        const res = await fetch('/api/slowlog');
        const data = await res.json();
        const tbody = document.querySelector('#slowlogTable tbody');
        if (!data.slowlog || data.slowlog.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="color: var(--text-dim); text-align: center; padding: 24px;">No slow operations recorded (all queries execute in sub-millisecond time)</td></tr>';
          return;
        }
        tbody.innerHTML = data.slowlog.map(s => \`
          <tr>
            <td style="color: var(--text-dim); font-weight: 600;">#\${s.id}</td>
            <td style="color: var(--accent-amber); font-weight: 700;">\${s.executionFormatted || (s.executionTimeMicroseconds + ' μs')}</td>
            <td style="color: var(--accent-cyan); font-weight: 600;"><code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">\${escapeHtml(s.command)}</code></td>
            <td style="color: var(--text-dim);">\${s.timestampFormatted || new Date(s.timestamp).toLocaleTimeString()}</td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Failed to load slowlog:', err);
      }
    }

    async function loadClients() {
      try {
        const res = await fetch('/api/clients');
        const data = await res.json();
        const container = document.getElementById('clientsContainer');
        const list = data.parsedClients || [];
        if (list.length === 0) {
          container.innerHTML = '<div style="color: var(--text-dim); padding: 12px; text-align: center;">No active client connections</div>';
          return;
        }
        container.innerHTML = list.map(c => \`
          <div class="client-card">
            <div class="client-card-top">
              <span style="font-weight: 700; color: var(--accent-cyan);">Client #\${c.id}</span>
              <span style="color: var(--accent-emerald); font-weight: 600; font-size: 10px;">\${c.idleFormatted}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--text-muted); font-size: 10px;">
              <span>Host: <strong style="color: #fff;">\${escapeHtml(c.addr)}</strong></span>
              <span>DB: <strong style="color: var(--accent-cyan);">db\${c.db}</strong></span>
            </div>
            <div style="display: flex; justify-content: space-between; color: var(--text-dim); font-size: 10px;">
              <span>Connected: \${c.ageFormatted}</span>
              <span>Memory: \${c.memFormatted}</span>
            </div>
            <div style="margin-top: 2px; padding: 2px 6px; background: rgba(0,0,0,0.3); border-radius: 4px; font-family: var(--font-mono); font-size: 10px; color: var(--text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              Command: <code style="color: var(--accent-amber);">\${escapeHtml(c.cmd)}</code>
            </div>
          </div>
        \`).join('');
      } catch (err) {
        console.error('Failed to load clients:', err);
      }
    }
  </script>
  <script>
${getWindowShortcutsScript()}
  </script>
</body>
</html>`;
}

// -------------------------------------------------------------------------------------------------
// Redis Studio Desktop Instance Factory
// -------------------------------------------------------------------------------------------------

export function createRedisStudio(options: RedisStudioOptions = {}): RedisStudioInstance {
  const title = "Redis Studio Pro - Enterprise In-Memory Database Workstation";
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 820);
  const initialUrl = options.url || "redis://127.0.0.1:6379";
  const initialDb = options.db || 0;
  const port = options.port || 5820;

  const app: RedisStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    activeUrl: initialUrl,
    generateHtml: generateRedisStudioHtml,
    run: async () => {
      console.log("⚡ Launching Redis Studio Pro (Enterprise In-Memory Workstation)...");

      // 1. Launch Isolated Background Telemetry Worker Engine
      // This runs on a dedicated OS thread with its own independent Bun event loop,
      // guaranteeing zero deadlock and instant sub-millisecond responses while Webview runs on the main thread.
      process.env.STUDIO_WORKER = "redis_studio";
      if (initialUrl) process.env.REDIS_URL = initialUrl;
      if (initialDb !== undefined) process.env.REDIS_DB = String(initialDb);

      const workerUrl = new URL("./redis_studio_server.ts", import.meta.url);
      const worker = new Worker(workerUrl);
      app.worker = worker;

      const info: { ready: boolean; port: number; url: string; type?: string } = await new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error("Timeout initializing background Redis engine")), 8000);
        worker.onmessage = (e) => {
          if (!e.data?.type || e.data.type === "redis_studio") {
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
      console.log(`⚡ Redis Studio Pro background engine active at: ${info.url}`);

      // Warm check: Ensure TCP listener and HTTP server are accepting requests before Webview navigates
      try {
        await fetch(info.url);
      } catch {}

      // 2. Native Webview Desktop GUI
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
          fullscreen,
        });

        webview.navigate(info.url);
        console.log(`⚡ Native desktop Redis workstation open (Fullscreen: ${fullscreen ? 'Enabled' : 'Disabled'}). Accessible at: ${info.url}`);

        webview.run();
        try { worker.terminate(); } catch {}
        process.exit(0);
      } catch (err: any) {
        console.warn(`Desktop Webview unavailable (${err?.message || err}). Running in web mode at: ${info.url}`);
      } finally {
        try { worker.terminate(); } catch {}
        process.exit(0);
      }
    },
  };

  return app;
}

// -------------------------------------------------------------------------------------------------
// Aliases & Backward Compatibility
// -------------------------------------------------------------------------------------------------

export const createRedisStudioPro = createRedisStudio;
export { startRedisStudioServer } from "./redis_studio_server.ts";

// -------------------------------------------------------------------------------------------------
// Direct Standalone Execution
// -------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const url = process.argv[2] || "redis://127.0.0.1:6379";
  const app = createRedisStudio({ url, fullscreen: true });
  await app.run();
  process.exit(0);
}
