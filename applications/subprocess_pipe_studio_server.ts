/**
 * ⚡ Bun RAD Studio - Subprocess Pipe Pro Server Engine & Enterprise Web Workstation
 * 
 * Standalone high-performance HTTP server & live web workstation for Subprocess Pipe Pro.
 * Provides real-time pipeline execution, stage-by-stage stepping, Sudo/privilege elevation
 * checks, named pipeline library persistence, visual topology flow, and interactive inspection.
 */

import { guardLocalRequest } from "../src/localGuard";
import {
  type SubprocessStage,
  PipelineLibrary,
  getDefaultPipelinePresets,
  executePipeline,
  executePipelineStage,
  generateShellScript,
  generatePipelineShellCommand,
  checkSudoPreflight,
  withAskpass,
  // @ts-ignore: Bun handles .ts imports natively
} from "./subprocess_pipe_studio.ts";

export interface ServerOptions {
  port?: number;
  host?: string;
}

/**
 * Generates the complete, rich, standalone HTML shell for Subprocess Pipe Pro Enterprise Workstation.
 */
export function generateSubprocessPipeStudioHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subprocess Pipe Pro — Enterprise Shell Process Master & Multi-Stage Stream Workstation</title>
  <style>
    :root {
      --bg-base: #070a12;
      --bg-primary: #0a0f1d;
      --bg-surface: #0f172a;
      --bg-card: #141e33;
      --bg-card-hover: #1b2844;
      --bg-glass: rgba(20, 30, 51, 0.75);
      --border-subtle: #1e293b;
      --border-color: #24344d;
      --border-glow: #06b6d4;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --accent-cyan: #06b6d4;
      --accent-blue: #3b82f6;
      --accent-indigo: #6366f1;
      --accent-purple: #8b5cf6;
      --accent-green: #10b981;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
      --code-bg: #050811;
      --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: "JetBrains Mono", "SF Mono", Menlo, Monaco, Consolas, monospace;
      --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.35);
      --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.45);
      --shadow-lg: 0 10px 30px rgba(0, 0, 0, 0.6);
      --shadow-glow: 0 0 20px rgba(6, 182, 212, 0.25);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* Custom Modern Scrollbars */
    ::-webkit-scrollbar {
      width: 7px;
      height: 7px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg-base);
    }
    ::-webkit-scrollbar-thumb {
      background: #25334c;
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #3b5072;
    }

    /* Enterprise Navigation Header */
    header {
      background: linear-gradient(180deg, #111a2f 0%, var(--bg-surface) 100%);
      border-bottom: 1px solid var(--border-color);
      padding: 10px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      box-shadow: var(--shadow-md);
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(12px);
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-icon-box {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%);
      border: 1px solid rgba(56, 189, 248, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 0 16px rgba(6, 182, 212, 0.3);
    }

    .brand-titles h1 {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(90deg, #38bdf8 0%, #a78bfa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-tag {
      font-size: 9px;
      padding: 2px 6px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--accent-cyan);
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 4px;
      letter-spacing: 0.05em;
      font-weight: 700;
      -webkit-text-fill-color: var(--accent-cyan);
    }

    .brand-titles .subtitle {
      font-size: 11px;
      color: var(--text-muted);
      letter-spacing: 0.04em;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .header-actions select {
      width: auto;
      min-width: 165px;
      max-width: 220px;
    }

    .controls-bar select {
      width: auto;
      min-width: 200px;
      max-width: 260px;
    }

    .panel-header input {
      width: auto;
    }

    /* Status Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .badge-status {
      background: rgba(16, 185, 129, 0.12);
      color: var(--accent-green);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-green);
      box-shadow: 0 0 8px var(--accent-green);
      animation: pulseAnim 2s infinite;
    }

    @keyframes pulseAnim {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    .badge-sudo {
      background: rgba(245, 158, 11, 0.12);
      color: var(--accent-amber);
      border: 1px solid rgba(245, 158, 11, 0.3);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .badge-sudo:hover {
      background: rgba(245, 158, 11, 0.22);
      border-color: var(--accent-amber);
      box-shadow: 0 0 10px rgba(245, 158, 11, 0.25);
    }

    /* Form Controls */
    select, input[type="text"], input[type="number"], textarea {
      background: #0b1220;
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 7px 11px;
      border-radius: 6px;
      font-size: 12px;
      outline: none;
      transition: all 0.2s ease;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      min-width: 0;
    }

    select:focus, input[type="text"]:focus, input[type="number"]:focus, textarea:focus {
      border-color: var(--border-glow);
      box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.25);
      background: #0e1728;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 13px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-card);
      color: var(--text-main);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      user-select: none;
      white-space: nowrap;
    }

    .btn:hover {
      background: var(--bg-card-hover);
      border-color: #3b5072;
      transform: translateY(-1px);
    }

    .btn:active {
      transform: translateY(0) scale(0.98);
    }

    .btn-primary {
      background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
      border-color: #38bdf8;
      color: #fff;
      box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #0369a1 0%, #1d4ed8 100%);
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.55);
    }

    .btn-purple {
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
      border-color: #a78bfa;
      color: #fff;
      box-shadow: 0 2px 10px rgba(124, 58, 237, 0.35);
    }
    .btn-purple:hover {
      background: linear-gradient(135deg, #6d28d9 0%, #5b21b6 100%);
      box-shadow: 0 4px 16px rgba(124, 58, 237, 0.5);
    }

    .btn-success {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      border-color: #34d399;
      color: #fff;
    }

    .btn-danger {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.3);
      color: #fca5a5;
    }
    .btn-danger:hover {
      background: rgba(239, 68, 68, 0.25);
      border-color: var(--accent-red);
    }

    .btn-sm {
      padding: 4px 9px;
      font-size: 11px;
    }

    .kbd-shortcut {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 4px;
      padding: 1px 4px;
      font-size: 9px;
      font-family: var(--font-mono);
      color: rgba(255, 255, 255, 0.7);
    }

    /* Interactive Visual Topology Pipeline Flow Ribbon */
    .flow-topology-bar {
      background: #090e1a;
      border-bottom: 1px solid var(--border-subtle);
      padding: 10px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      overflow-x: auto;
      white-space: nowrap;
    }

    .flow-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .flow-sequence {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .flow-node {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-size: 11px;
      font-family: var(--font-mono);
      cursor: pointer;
      transition: all 0.2s ease;
      color: var(--text-main);
    }

    .flow-node:hover {
      border-color: var(--accent-cyan);
      background: #1c2b48;
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
    }

    .flow-node.active {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 1px var(--accent-cyan);
      background: #192842;
    }

    .flow-arrow {
      color: #3b5072;
      font-size: 11px;
      font-weight: 700;
    }

    /* Sub-bar / Command & Mode Controls */
    .controls-bar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      padding: 10px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .pipeline-name-box {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      max-width: 340px;
    }

    .pipeline-name-box label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
    }

    .controls-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* KPI Bar */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
      padding: 12px 24px;
      background: #080d17;
      border-bottom: 1px solid var(--border-color);
    }

    .kpi-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      position: relative;
      overflow: hidden;
      box-shadow: var(--shadow-sm);
    }

    .kpi-card::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      height: 2px;
      width: 100%;
      background: linear-gradient(90deg, transparent, var(--border-glow), transparent);
    }

    .kpi-title {
      font-size: 11px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }

    .kpi-value {
      font-size: 17px;
      font-weight: 700;
      color: var(--text-main);
      font-family: var(--font-mono);
    }

    /* Main Grid Layout */
    .workspace-layout {
      display: grid;
      grid-template-columns: minmax(520px, 1.15fr) minmax(460px, 1.35fr);
      gap: 16px;
      padding: 16px 24px;
      flex: 1;
      min-width: 0;
      box-sizing: border-box;
      max-width: 100%;
      transition: grid-template-columns 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .workspace-layout.wide-sequence {
      grid-template-columns: minmax(640px, 1.55fr) minmax(420px, 1fr);
    }

    @media (max-width: 1220px) {
      .workspace-layout, .workspace-layout.wide-sequence {
        grid-template-columns: 1fr;
      }
    }

    .panel {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: var(--shadow-md);
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }

    .panel.maximized {
      position: fixed;
      inset: 16px;
      z-index: 999;
      box-shadow: 0 0 50px rgba(0, 0, 0, 0.85);
    }

    .panel-header {
      background: #131c2d;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }

    .panel-title {
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #e2e8f0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .panel-body {
      padding: 14px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
    }

    /* Stages Table / Cards */
    .stages-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 580px;
      overflow-y: auto;
    }

    .stage-item {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .stage-item:hover {
      background: var(--bg-card-hover);
      border-color: #3b5072;
      transform: translateX(2px);
    }

    .stage-item.selected {
      border-color: var(--accent-cyan);
      box-shadow: 0 0 0 1px var(--accent-cyan), 0 0 14px rgba(6, 182, 212, 0.2);
      background: #17253b;
    }

    .stage-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .stage-order-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      background: #090f1a;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 2px 7px;
      color: var(--accent-cyan);
      white-space: nowrap;
    }

    .stage-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }

    .stage-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .stage-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 440px;
    }

    .stage-cmd {
      font-family: var(--font-mono);
      font-size: 11.5px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: #080d16;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid #1a2538;
      width: fit-content;
      max-width: 100%;
    }

    .stage-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .tag {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
    }

    .tag-sudo {
      background: rgba(245, 158, 11, 0.18);
      color: #fcd34d;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }

    .tag-status-idle {
      background: #1e293b;
      color: #cbd5e1;
    }
    .tag-status-running {
      background: rgba(59, 130, 246, 0.3);
      color: #93c5fd;
      animation: pulse 1.5s infinite;
    }
    .tag-status-success {
      background: rgba(16, 185, 129, 0.2);
      color: #6ee7b7;
    }
    .tag-status-error {
      background: rgba(239, 68, 68, 0.25);
      color: #fca5a5;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .stage-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* Form Fields */
    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      min-width: 0;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 0;
    }

    .form-group.full-width {
      grid-column: 1 / -1;
      min-width: 0;
    }

    .form-group label {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    .checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-main);
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .checkbox-label input[type="checkbox"] {
      width: auto;
      cursor: pointer;
    }

    /* Output Inspector */
    .inspector-tabs {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-color);
      background: #0d1524;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 4px;
      min-width: 0;
    }

    .inspector-tabs-scroll {
      display: flex;
      overflow-x: auto;
      white-space: nowrap;
      min-width: 0;
      flex: 1;
    }

    .inspector-actions {
      display: flex;
      gap: 6px;
      align-items: center;
      padding: 6px 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .tab-btn {
      padding: 9px 15px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.03);
    }

    .tab-btn.active {
      color: var(--accent-cyan);
      border-bottom-color: var(--accent-cyan);
      background: rgba(6, 182, 212, 0.08);
    }

    .inspector-sub-bar {
      background: #090f1b;
      padding: 6px 14px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .code-viewer {
      background: var(--code-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 12px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #a5f3fc;
      white-space: pre-wrap;
      word-break: break-all;
      min-height: 200px;
      max-height: 380px;
      overflow-y: auto;
      line-height: 1.6;
    }

    /* Section Cards View */
    .sections-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 380px;
      overflow-y: auto;
    }

    /* Console Logs */
    .console-box {
      background: #04070d;
      border: 1px solid #1a2538;
      border-radius: 6px;
      padding: 10px 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: #94a3b8;
      max-height: 160px;
      min-height: 100px;
      overflow-y: auto;
      line-height: 1.5;
    }

    .log-line {
      display: flex;
      gap: 8px;
      margin-bottom: 2px;
    }
    .log-time { color: #475569; }
    .log-info { color: #38bdf8; }
    .log-success { color: #34d399; }
    .log-warn { color: #fbbf24; }
    .log-error { color: #f87171; }

    /* Floating Toast System */
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 9999;
      pointer-events: none;
    }

    .toast-item {
      background: #142036;
      border: 1px solid var(--border-glow);
      color: #fff;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5), 0 0 14px rgba(6, 182, 212, 0.3);
      animation: toastIn 0.25s ease-out;
      pointer-events: auto;
    }

    @keyframes toastIn {
      from { transform: translateY(12px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    /* Modal */
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(5px);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .modal-backdrop.show {
      display: flex;
    }

    .modal-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      width: 90%;
      max-width: 620px;
      box-shadow: var(--shadow-lg);
      overflow: hidden;
      animation: modalIn 0.2s ease-out;
    }

    @keyframes modalIn {
      from { transform: scale(0.96); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-header {
      padding: 14px 20px;
      background: #131c2e;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 700;
      font-size: 14px;
    }

    .modal-body {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .modal-footer {
      padding: 12px 20px;
      background: #0b1220;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .empty-placeholder {
      text-align: center;
      padding: 30px;
      color: var(--text-dim);
      font-size: 13px;
    }
  </style>
</head>
<body>

  <!-- Floating Toast Notifications -->
  <div id="toast_container" class="toast-container"></div>

  <!-- Enterprise Navigation Header -->
  <header>
    <div class="brand-section">
      <div class="brand-icon-box">⚡</div>
      <div class="brand-titles">
        <h1 id="app_title">
          Subprocess Pipe Pro
          <span class="brand-tag">ENTERPRISE PRO</span>
        </h1>
        <div class="subtitle">Multi-Stage Shell Process &amp; High-Throughput Stream Pipeline Workstation</div>
      </div>
    </div>

    <div class="header-actions">
      <span id="app_status" class="badge badge-status">
        <span class="pulse-dot"></span>
        <span id="app_status_text">System Ready</span>
      </span>

      <span id="badge_sudo_status" class="badge badge-sudo" title="Click to inspect Sudo elevation preflight">
        🛡️ Sudo Ticket: Checking...
      </span>

      <button id="btn_sudo_preflight" class="btn btn-sm">🛡️ Preflight Sudo</button>
      <button id="btn_sudo_clear" class="btn btn-sm" style="display:none;" title="Clear volatile session sudo credentials">🔒 Clear Sudo</button>

      <select id="sel_preset" title="Load Pipeline Preset">
        <option value="">-- Presets Library --</option>
      </select>

      <select id="sel_pipeline" title="Load Saved Pipeline">
        <option value="">-- Saved Pipelines --</option>
      </select>

      <button id="btn_pipeline_save" class="btn btn-sm" title="Save current pipeline (⌘S)">💾 Save</button>
      <button id="btn_pipeline_save_as" class="btn btn-sm" title="Save pipeline under a new name">➕ Save As...</button>
      <button id="btn_pipeline_delete" class="btn btn-sm btn-danger" title="Delete pipeline">🗑️</button>
      <button id="btn_library_export" class="btn btn-sm" title="Export pipeline collection or script (Download or Copy to Clipboard)">📦 Export</button>
      <button id="btn_copy_json_quick" class="btn btn-sm" title="Quickly copy active pipeline JSON directly to clipboard">📋 Copy JSON</button>
      <button id="btn_library_import" class="btn btn-sm" title="Import pipeline collection JSON">📥 Import</button>
      <button id="btn_shortcuts_help" class="btn btn-sm" title="Keyboard Shortcuts (?)">⌨ Shortcuts</button>
      <button id="btn_user_guide" class="btn btn-sm btn-purple" title="Read the Enterprise User Guide">📖 User Guide</button>
      <input type="file" id="file_library_import" accept=".json" style="display: none;">
    </div>
  </header>

  <!-- Interactive Pipeline Flow Topology Ribbon (Visual DAG) -->
  <div class="flow-topology-bar">
    <div class="flow-title">
      <span>🔀</span> Pipeline Flow:
    </div>
    <div id="pipeline_flow_sequence" class="flow-sequence">
      <!-- Populated dynamically: [📥 Stdin] ➔ [1️⃣ ps aux] ➔ [2️⃣ grep] ➔ [🎯 Final Output] -->
    </div>
  </div>

  <!-- Execution Controls Bar -->
  <div class="controls-bar">
    <div class="pipeline-name-box">
      <label for="txt_pipeline_name">Active:</label>
      <input type="text" id="txt_pipeline_name" value="Process Filter &amp; Telemetry" placeholder="Pipeline Name">
    </div>

    <div class="controls-group">
      <label for="sel_execution_mode" style="font-size: 11px; color: var(--text-dim); font-weight: 700; text-transform: uppercase;">Mode:</label>
      <select id="sel_execution_mode">
        <option value="piped">Piped Stream (stdout ➔ stdin)</option>
        <option value="sequential">Sequential Chained (&amp;&amp;)</option>
      </select>

      <button id="btn_run_all" class="btn btn-primary" title="Execute all pipeline stages in sequence (⌘+Enter)">
        ▶ Run Full Pipeline <span class="kbd-shortcut">⌘↵</span>
      </button>

      <button id="btn_step_next" class="btn btn-purple" title="Execute next stage in order (⌘+Shift+Enter)">
        ⏭ Step Next Stage <span class="kbd-shortcut">⌘⇧↵</span>
      </button>

      <button id="btn_reset_pipeline" class="btn" title="Reset pipeline execution state">🔄 Reset</button>
      <button id="btn_export_script" class="btn" title="Generate standalone bash script">📜 Export Script</button>
    </div>
  </div>

  <!-- KPI Overview Grid -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-title">Total Stages</div>
      <div id="kpi_stages_count" class="kpi-value">0</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Pipeline Mode</div>
      <div id="kpi_mode" class="kpi-value" style="color: var(--accent-cyan);">PIPED</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Execution State</div>
      <div id="kpi_status" class="kpi-value" style="color: var(--accent-green);">IDLE</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Runtime Latency</div>
      <div id="kpi_duration" class="kpi-value">0 ms</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Stream Throughput</div>
      <div id="kpi_bytes" class="kpi-value">0 B</div>
    </div>
  </div>

  <!-- Main Workspace -->
  <div class="workspace-layout">

    <!-- Left Column: Stages Sequence & Initial Stdin -->
    <div style="display: flex; flex-direction: column; gap: 16px;">
      
      <!-- Stages Master Panel -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <span>⚙️</span> Stages Sequence (<span id="lbl_stages_header_count">0</span>)
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" id="txt_search_stages" placeholder="Filter stages..." style="padding: 3px 8px; font-size: 11px; width: 120px; height: 26px;">
            <button id="btn_toggle_sequence_width" class="btn btn-sm" title="Toggle extra-wide vs balanced stage sequence layout">⇹ Wide</button>
            <button id="btn_add_stage" class="btn btn-sm btn-primary">➕ Add Stage</button>
          </div>
        </div>
        <div class="panel-body">
          <div id="stages_container" class="stages-list">
            <!-- Dynamically populated stages -->
          </div>
        </div>
      </div>

      <!-- Initial Stdin Panel -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-title">
            <span>📥</span> Pipeline Initial Stdin Payload
          </div>
          <div style="display: flex; gap: 6px;">
            <button id="btn_sample_json" class="btn btn-sm">Sample JSON</button>
            <button id="btn_sample_words" class="btn btn-sm">Sample Words</button>
            <button id="btn_clear_stdin" class="btn btn-sm">Clear</button>
          </div>
        </div>
        <div class="panel-body" style="padding: 12px;">
          <textarea id="txt_initial_stdin" rows="4" placeholder="Enter optional text/JSON payload piped directly into Stage #1's stdin..." style="width: 100%; font-family: var(--font-mono); font-size: 12px; resize: vertical;"></textarea>
        </div>
      </div>

    </div>

    <!-- Right Column: Stage Editor & Multi-View Inspector -->
    <div style="display: flex; flex-direction: column; gap: 16px;">

      <!-- Stage Editor Card -->
      <div class="panel">
        <div class="panel-header" style="flex-wrap: wrap; gap: 8px;">
          <div id="editor_stage_order_title" class="panel-title" style="flex-shrink: 0;">
            <span>✏️</span> Editing Stage #1
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <button id="btn_stage_update" class="btn btn-sm btn-success">💾 Save Changes</button>
            <button id="btn_stage_new" class="btn btn-sm">➕ Add As New</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="form-grid">
            <div class="form-group">
              <label for="txt_stage_name">Stage Name</label>
              <input type="text" id="txt_stage_name" placeholder="e.g. List Active Processes">
            </div>
            <div class="form-group">
              <label for="sel_stage_input_mode">Input Mode</label>
              <select id="sel_stage_input_mode">
                <option value="piped">Piped (From Previous Stage)</option>
                <option value="initial">Initial Stdin Only</option>
                <option value="custom">Custom Inline Stdin</option>
                <option value="none">None (Ignore Stdin)</option>
              </select>
            </div>
            <div class="form-group full-width">
              <label for="txt_stage_cmd">Shell Command</label>
              <input type="text" id="txt_stage_cmd" placeholder="e.g. ps aux | head -n 20" style="font-family: var(--font-mono);">
            </div>
            <div class="form-group full-width" id="custom_stdin_group" style="display: none;">
              <label for="txt_stage_custom_stdin">Custom Stdin Payload</label>
              <textarea id="txt_stage_custom_stdin" rows="3" placeholder="Enter custom stdin payload for this stage..." style="font-family: var(--font-mono); font-size: 12px;"></textarea>
            </div>
            <div class="form-group">
              <label for="txt_stage_cwd">Working Directory (cwd)</label>
              <input type="text" id="txt_stage_cwd" placeholder="Default (workspace root)">
            </div>
            <div class="form-group">
              <label for="sel_stage_sudo_mode">Sudo Elevation Mode</label>
              <select id="sel_stage_sudo_mode">
                <option value="auto">Auto (Askpass with fallback)</option>
                <option value="askpass">Askpass (Non-blocking GUI)</option>
                <option value="macos_prompt">macOS osascript Prompt</option>
                <option value="non_interactive">Non-Interactive (sudo -n)</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
            <div class="form-group">
              <label for="num_stage_timeout">Timeout (ms)</label>
              <input type="number" id="num_stage_timeout" value="30000" min="500" step="500">
            </div>
            <div class="form-group full-width" style="margin-top: 2px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.07);">
              <div class="checkbox-row" style="gap: 24px;">
                <label class="checkbox-label" title="Run this stage with elevated root privileges">
                  <input type="checkbox" id="chk_stage_sudo">
                  <span>🛡️ Run with Sudo</span>
                </label>
                <label class="checkbox-label" title="Enable or disable execution of this stage in the pipeline">
                  <input type="checkbox" id="chk_stage_enabled" checked>
                  <span>Active</span>
                </label>
                <label class="checkbox-label" title="Continue pipeline execution even if this stage exits with an error code">
                  <input type="checkbox" id="chk_stage_ignore_error">
                  <span>Ignore Errors</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Output Workstation & Multi-View Inspector -->
      <div id="inspector_panel" class="panel" style="flex: 1;">
        <div class="inspector-tabs">
          <div class="inspector-tabs-scroll">
            <button id="tab_final" class="tab-btn active">🎯 Final Output</button>
            <button id="tab_sections" class="tab-btn">📑 Stage Sections</button>
            <button id="tab_stdout" class="tab-btn">STDOUT (Stage)</button>
            <button id="tab_stderr" class="tab-btn">STDERR</button>
            <button id="tab_stdin" class="tab-btn">STDIN</button>
            <button id="tab_diff" class="tab-btn">🔄 Stream Diff</button>
            <button id="tab_script" class="tab-btn">Script</button>
            <button id="tab_report" class="tab-btn">Report JSON</button>
          </div>
          <div class="inspector-actions">
            <button id="btn_copy_final" class="btn btn-sm btn-primary" title="Copy pure final pipe output to clipboard">🎯 Copy Final Output</button>
            <button id="btn_download_final" class="btn btn-sm" title="Download final output as a file">💾 Download</button>
            <button id="btn_copy_inspector" class="btn btn-sm" title="Copy current view text">📋 Copy Active</button>
            <button id="btn_maximize_inspector" class="btn btn-sm" title="Toggle Fullscreen Inspector">⛶ Maximize</button>
            <button id="btn_clear_inspector" class="btn btn-sm">Clear</button>
          </div>
        </div>

        <!-- Inspector Sub-Bar (Counts, Wrap, Filter) -->
        <div class="inspector-sub-bar">
          <div id="lbl_inspector_stats" style="font-size: 11px; color: var(--accent-cyan); font-family: var(--font-mono);">
            🎯 Clean Final Stream Output (Ready)
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-size: 11px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
              <input type="checkbox" id="chk_wrap_text" checked> Wrap Text
            </label>
            <input type="text" id="txt_filter_output" placeholder="Filter lines..." style="padding: 2px 8px; font-size: 11px; width: 150px; height: 24px;">
          </div>
        </div>

        <div class="panel-body" style="padding: 12px; gap: 10px;">
          <div id="inspector_content" class="code-viewer">Output will appear here after executing stages or pipelines...</div>
          <div id="sections_container_inspector" class="sections-container" style="display: none;">
            <!-- Dynamic stage sections rendered here -->
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <div style="font-size: 11px; font-weight: 700; color: var(--text-dim); text-transform: uppercase;">
              🖥️ Live Execution Logs &amp; Audit Trail
            </div>
            <button id="btn_clear_logs" class="btn btn-sm">Clear Logs</button>
          </div>
          <div id="console_logs" class="console-box">
            <!-- Dynamic logs -->
          </div>
        </div>
      </div>

    </div>

  </div>

  <!-- Modal: Save As New Pipeline -->
  <div id="modal_save_as" class="modal-backdrop">
    <div class="modal-box">
      <div class="modal-header">
        <div>💾 Save Pipeline As New</div>
        <button id="btn_modal_save_close" class="btn btn-sm" style="border:none; background:transparent;">✕</button>
      </div>
      <div class="modal-body">
        <label for="txt_save_as_name" style="font-size: 12px; font-weight: 700; color: var(--text-muted);">Pipeline Name:</label>
        <input type="text" id="txt_save_as_name" placeholder="Enter a unique name for this pipeline...">
      </div>
      <div class="modal-footer">
        <button id="btn_modal_save_cancel" class="btn">Cancel</button>
        <button id="btn_modal_save_confirm" class="btn btn-primary">Save Pipeline</button>
      </div>
    </div>
  </div>

  <!-- Modal: Sudo Preflight & Session Manager Dialog -->
  <div id="modal_sudo" class="modal-backdrop">
    <div class="modal-box" style="max-width: 580px;">
      <div class="modal-header">
        <div>🛡️ Sudo Privilege Elevation &amp; Security Manager</div>
        <button id="btn_modal_sudo_close_x" class="btn btn-sm" style="border:none; background:transparent;">✕</button>
      </div>
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
        <div id="sudo_preflight_info" style="font-family: var(--font-mono); font-size: 12px; line-height: 1.6; background: #050811; padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
          Querying Sudo subsystem status...
        </div>

        <div style="background: rgba(30, 41, 59, 0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
          <div style="font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: space-between;">
            <span>🔑 Volatile Session Sudo Authentication</span>
            <span id="txt_session_sudo_status" style="font-size: 11px; color: var(--accent-amber);">Not Authenticated</span>
          </div>
          <p style="font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.4;">
            Pre-authenticate or cache your sudo password for this browser session. Held exclusively in volatile RAM and used with ephemeral askpass scripts.
          </p>
          <div class="form-group" style="margin: 0;">
            <div style="display: flex; gap: 8px;">
              <input type="password" id="txt_session_sudo_pass" placeholder="Enter sudo password..." style="flex: 1;" autocomplete="current-password">
              <button id="btn_session_sudo_auth" class="btn btn-primary" style="white-space: nowrap;">🔑 Authenticate (-v)</button>
              <button id="btn_session_sudo_clear" class="btn" style="white-space: nowrap;">Clear</button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="btn_modal_sudo_refresh" class="btn">Re-Check</button>
        <button id="btn_modal_sudo_close" class="btn btn-primary">Done</button>
      </div>
    </div>
  </div>

  <!-- Modal: Sudo Authentication Required Prompt -->
  <div id="modal_sudo_prompt" class="modal-backdrop">
    <div class="modal-box" style="max-width: 500px;">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>🛡️</span>
          <span>Sudo Authentication Required</span>
        </div>
        <button id="btn_modal_sudo_prompt_close_x" class="btn btn-sm" style="border:none; background:transparent;">✕</button>
      </div>
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
        <p id="txt_sudo_prompt_desc" style="font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.5;">
          This stage requires elevated root privileges. Enter your administrator / sudo password to continue:
        </p>
        <div id="txt_sudo_prompt_cmd" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 6px; padding: 10px 12px; font-family: var(--font-mono); font-size: 12px; color: #fbbf24;">
          sudo ps aux
        </div>
        <div class="form-group" style="margin: 0;">
          <label for="txt_sudo_prompt_password" style="font-size: 12px; font-weight: 600;">Sudo Password</label>
          <div style="position: relative;">
            <input type="password" id="txt_sudo_prompt_password" placeholder="Enter sudo password..." style="width: 100%; padding-right: 40px;" autocomplete="current-password">
            <button type="button" id="btn_toggle_prompt_pass" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 14px;" title="Toggle visibility">👁️</button>
          </div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-muted);">
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" id="chk_remember_sudo_pass" checked>
            <span>Remember for this session (volatile RAM only)</span>
          </label>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="btn_sudo_prompt_macos" class="btn" title="Use native macOS Administrator prompt (osascript)">🍏 macOS Dialog</button>
        <button id="btn_sudo_prompt_cancel" class="btn">Cancel</button>
        <button id="btn_sudo_prompt_confirm" class="btn btn-primary" style="background: #10b981; border-color: #059669;">🔑 Authorize &amp; Run</button>
      </div>
    </div>
  </div>

  <!-- Modal: Pipeline / Library Export Options -->
  <div id="modal_export" class="modal-backdrop">
    <div class="modal-box" style="max-width: 780px;">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>📦 Export Pipeline &amp; Library</span>
          <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: rgba(59, 130, 246, 0.2); color: var(--accent-blue); border: 1px solid rgba(59, 130, 246, 0.4);">
            Download or Copy to Clipboard
          </span>
        </div>
        <button id="btn_modal_export_close_x" class="btn btn-sm" style="border:none; background:transparent;">✕</button>
      </div>
      <div class="modal-body" style="padding: 16px 20px; gap: 12px;">
        <div style="display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button id="btn_export_tab_active" class="btn btn-sm btn-primary">📄 Active Pipeline JSON</button>
            <button id="btn_export_tab_library" class="btn btn-sm">📦 Entire Library JSON</button>
            <button id="btn_export_tab_oneliner" class="btn btn-sm">⚡ Shell One-Liner</button>
            <button id="btn_export_tab_script" class="btn btn-sm">📜 Standalone Bash Script</button>
          </div>
          <span id="export_format_badge" style="font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);">Format: JSON</span>
        </div>
        <textarea id="txt_export_preview" rows="14" readonly style="font-family: var(--font-mono); font-size: 12px; width: 100%; resize: vertical; background: var(--bg-surface); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;"></textarea>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <span id="export_status_hint" style="font-size: 11px; color: var(--text-dim);">Select an export action: Copy to Clipboard or Download File</span>
        <div style="display: flex; gap: 8px;">
          <button id="btn_export_copy_clipboard" class="btn btn-primary" title="Copy current export payload to clipboard">📋 Copy to Clipboard</button>
          <button id="btn_export_download_file" class="btn" title="Download payload as a local file">💾 Download File</button>
          <button id="btn_modal_export_close" class="btn">Close</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Export Script Preview -->
  <div id="modal_script" class="modal-backdrop">
    <div class="modal-box" style="max-width: 760px;">
      <div class="modal-header">
        <div>📜 Exported Standalone Bash Script</div>
        <button id="btn_modal_script_close_x" class="btn btn-sm" style="border:none; background:transparent;">✕</button>
      </div>
      <div class="modal-body">
        <textarea id="txt_exported_script" rows="15" readonly style="font-family: var(--font-mono); font-size: 12px; width: 100%; resize: vertical;"></textarea>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 11px; color: var(--text-dim);">Standalone bash script executable across macOS and Linux</span>
        <div style="display: flex; gap: 8px;">
          <button id="btn_copy_script" class="btn btn-primary" title="Copy script to clipboard">📋 Copy to Clipboard</button>
          <button id="btn_download_script" class="btn" title="Download standalone bash script file">💾 Download .sh</button>
          <button id="btn_modal_script_close" class="btn">Close</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal: Keyboard Shortcuts Cheat Sheet -->
  <div id="modal_shortcuts" class="modal-backdrop">
    <div class="modal-box" style="max-width: 520px;">
      <div class="modal-header">
        <div>⌨️ Enterprise Keyboard Shortcuts</div>
        <button id="btn_modal_shortcuts_close_x" class="btn btn-sm" style="border:none; background:transparent;">✕</button>
      </div>
      <div class="modal-body">
        <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px 4px; font-weight: 600;">Run Full Pipeline</td>
            <td style="text-align: right;"><span class="kbd-shortcut">⌘ + Enter</span> / <span class="kbd-shortcut">Ctrl + Enter</span></td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px 4px; font-weight: 600;">Step Next Stage</td>
            <td style="text-align: right;"><span class="kbd-shortcut">⌘ + Shift + Enter</span></td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px 4px; font-weight: 600;">Save Pipeline</td>
            <td style="text-align: right;"><span class="kbd-shortcut">⌘ + S</span> / <span class="kbd-shortcut">Ctrl + S</span></td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px 4px; font-weight: 600;">Copy Final Output</td>
            <td style="text-align: right;"><span class="kbd-shortcut">⌘ + Shift + C</span></td>
          </tr>
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 8px 4px; font-weight: 600;">Shortcuts Help</td>
            <td style="text-align: right;"><span class="kbd-shortcut">?</span></td>
          </tr>
          <tr>
            <td style="padding: 8px 4px; font-weight: 600;">Close Modals</td>
            <td style="text-align: right;"><span class="kbd-shortcut">Esc</span></td>
          </tr>
        </table>
      </div>
      <div class="modal-footer">
        <button id="btn_modal_shortcuts_close" class="btn">Close</button>
      </div>
    </div>
  </div>

  <!-- Modal: Enterprise User Guide -->
  <div id="modal_user_guide" class="modal-backdrop">
    <div class="modal-box" style="max-width: 800px; max-height: 90vh;">
      <div class="modal-header">
        <div>📖 Subprocess Pipe Pro - Enterprise User Guide</div>
        <button id="btn_modal_guide_close_x" class="btn btn-sm" style="border:none; background:transparent;">✕</button>
      </div>
      <div class="modal-body" style="overflow-y: auto; font-size: 14px; line-height: 1.7; color: var(--text-main); padding-bottom: 24px;">
        <h2 style="color: var(--accent-cyan); border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px;">⚡ Overview</h2>
        <p>Subprocess Pipe Pro lets you visually construct complex chains of shell commands. Split your logic into independent <strong>Stages</strong> with real-time streaming, stdout/stderr isolation, interactive Sudo management, and detailed pipeline execution reports.</p>

        <h2 style="color: var(--accent-cyan); border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; margin-top: 24px;">🛠 Features at a Glance</h2>
        <ul style="padding-left: 24px; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px;">
          <li><strong style="color: var(--text-main);">Multi-Stage Processing</strong>: Build pipelines block-by-block. Pass <code>stdout</code> of one stage directly into the <code>stdin</code> of the next.</li>
          <li><strong style="color: var(--text-main);">Enterprise UI Layout</strong>: Real-time Interactive DAG flow, Key Performance Indicators (KPIs), and specialized Multi-View Inspector tabs.</li>
          <li><strong style="color: var(--text-main);">Secure Sudo Authentication</strong>: Volatile in-memory credentials using temporary <code>askpass</code> helpers.</li>
          <li><strong style="color: var(--text-main);">Library Persistence</strong>: Save pipelines and reload them instantly, or export/import collections as JSON.</li>
          <li><strong style="color: var(--text-main);">Standalone Export</strong>: Generate a portable standalone <code>bash</code> script of your configured pipeline to run anywhere.</li>
        </ul>

        <h2 style="color: var(--accent-cyan); border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; margin-top: 24px;">🎛 UI Controls Reference</h2>
        <h3 style="color: var(--text-main); font-size: 13px; margin-bottom: 8px;">Top Navigation Bar</h3>
        <ul style="padding-left: 24px; color: var(--text-muted); display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
          <li><strong style="color: var(--text-main);">System Ready / Completed</strong>: Engine status indicator.</li>
          <li><strong style="color: var(--text-main);">Sudo Ticket</strong>: Indicates if an elevated Sudo session is currently stored in memory.</li>
          <li><strong style="color: var(--text-main);">🔒 Preflight Sudo</strong>: Prompts for sudo password preemptively. Caches in volatile memory for background <code>askpass</code> injection.</li>
          <li><strong style="color: var(--text-main);">🔒 Clear Sudo</strong>: Instantly purges the stored sudo password from memory.</li>
          <li><strong style="color: var(--text-main);">Presets / Saved</strong>: Load pre-configured examples or your own saved pipelines.</li>
          <li><strong style="color: var(--text-main);">💾 Save / Save As...</strong>: Save pipeline configuration to local storage.</li>
          <li><strong style="color: var(--text-main);">🗑️ Delete</strong>: Delete the currently active saved pipeline.</li>
          <li><strong style="color: var(--text-main);">📦 Export</strong>: Opens the Export Center to either <strong>Copy to Clipboard</strong> or <strong>Download</strong> Active Pipeline JSON, Library JSON, Shell One-Liner, or Standalone Bash Script.</li>
          <li><strong style="color: var(--text-main);">📋 Copy JSON</strong>: Instant 1-click clipboard copy of the active pipeline configuration.</li>
          <li><strong style="color: var(--text-main);">📥 Import</strong>: Import pipeline JSON collection files.</li>
        </ul>

        <h3 style="color: var(--text-main); font-size: 13px; margin-bottom: 8px;">Stage Sequence Controls</h3>
        <ul style="padding-left: 24px; color: var(--text-muted); display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
          <li><strong style="color: var(--text-main);">⇹ Wide / ⇹ Balanced</strong>: Toggle the Stages Sequence between the spacious balanced view (~50% width) and extra-wide view (~62% width) to see long command strings and stage titles with zero truncation.</li>
          <li><strong style="color: var(--text-main);">➕ Add Stage</strong>: Add a new stage block into the pipeline flow.</li>
          <li><strong style="color: var(--text-main);">Filter stages...</strong>: Instantly search and filter stage cards by name or shell command.</li>
          <li><strong style="color: var(--text-main);">⬆️ / ⬇️</strong>: Move the stage up or down in execution order.</li>
          <li><strong style="color: var(--text-main);">▶️ (Play)</strong>: Execute *only* this specific stage in isolation.</li>
          <li><strong style="color: var(--text-main);">📋 (Clone)</strong>: Duplicate the stage.</li>
          <li><strong style="color: var(--text-main);">📄 (Copy)</strong>: Copy the raw shell command to your clipboard.</li>
          <li><strong style="color: var(--text-main);">🗑️ (Trash)</strong>: Delete the stage.</li>
        </ul>

        <h3 style="color: var(--text-main); font-size: 13px; margin-bottom: 8px;">Stage Configuration (Inspector)</h3>
        <ul style="padding-left: 24px; color: var(--text-muted); display: flex; flex-direction: column; gap: 8px;">
          <li><strong style="color: var(--text-main);">Input Mode</strong>: Determines <code>stdin</code> source (Pass from Previous, Type Stdin, None).</li>
          <li><strong style="color: var(--text-main);">Working Directory (CWD)</strong>: Directory where the command executes.</li>
          <li><strong style="color: var(--text-main);">Timeout (MS)</strong>: Max execution time before the process is killed.</li>
          <li><strong style="color: var(--text-main);">Run With Sudo / Active</strong>: Elevate privileges or bypass the stage.</li>
        </ul>

        <h2 style="color: var(--accent-cyan); border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; margin-top: 24px;">📖 Using the Workspace</h2>
        <ol style="padding-left: 24px; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px;">
          <li><strong style="color: var(--text-main);">Interactive Topology Ribbon (Visual DAG)</strong>: Shows the sequence of active stages. Click any node to instantly scroll to it.</li>
          <li><strong style="color: var(--text-main);">Modes of Execution</strong>: 
            <br>• <em>Piped Mode</em> (A ➔ B ➔ C)
            <br>• <em>Sequential Mode</em> (A, B, C)
            <br>• <em>Parallel Mode</em> (A || B || C)
          </li>
          <li><strong style="color: var(--text-main);">Running</strong>: Run the entire pipeline at once by clicking "▶ Run Full Pipeline" or pressing <code>⌘ + Enter</code>. Or, use Step Controls for step-by-step inspection.</li>
        </ol>

        <h2 style="color: var(--accent-cyan); border-bottom: 1px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px; margin-top: 24px;">🔎 The Multi-View Inspector</h2>
        <ul style="padding-left: 24px; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px;">
          <li><strong style="color: var(--text-main);">🎯 Final Output</strong>: Clean <code>stdout</code> of the absolute final stage of your pipeline.</li>
          <li><strong style="color: var(--text-main);">📑 Stage Sections</strong>: Output of every individual stage. Copy <code>stdin</code>, <code>stdout</code>, or <code>command</code> with a single click.</li>
          <li><strong style="color: var(--text-main);">🔄 Stream Diff</strong>: Compare input vs. output for the selected stage.</li>
          <li><strong style="color: var(--text-main);">Script</strong>: Valid <code>bash</code> script representation of your pipeline.</li>
        </ul>
      </div>
      <div class="modal-footer">
        <button id="btn_modal_guide_close" class="btn btn-primary">Close Guide</button>
      </div>
    </div>
  </div>

  <script>
    // Application State
    let currentPipeline = {
      id: "pipeline_default",
      name: "Process Filter & Telemetry",
      mode: "piped",
      initialStdin: "",
      stages: []
    };

    let selectedStageIndex = 0;
    let nextStepIndex = 0;
    let stageResults = {};
    let latestReport = null;
    let inspectorView = "final"; // "final" | "sections" | "stdout" | "stderr" | "stdin" | "diff" | "script" | "report"
    let presetsMap = {};
    let pipelinesList = [];

    // Toast Notification System
    function showToast(message, type = "info") {
      const container = document.getElementById("toast_container");
      if (!container) return;
      const toast = document.createElement("div");
      toast.className = "toast-item";
      toast.textContent = message;
      if (type === "success") toast.style.borderColor = "var(--accent-green)";
      if (type === "error") toast.style.borderColor = "var(--accent-red)";
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    // Monospace Logger
    function logMessage(text, type = "info") {
      const container = document.getElementById("console_logs");
      const line = document.createElement("div");
      line.className = "log-line";
      const now = new Date();
      const timeStr = now.toTimeString().split(" ")[0] + "." + String(now.getMilliseconds()).padStart(3, "0");
      line.innerHTML = \`<span class="log-time">[\${timeStr}]</span> <span class="log-\${type}">\${escapeHtml(text)}</span>\`;
      container.appendChild(line);
      container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    // API Helper
    async function apiRequest(endpoint, method = "GET", body = null) {
      try {
        const options = {
          method,
          headers: { "Content-Type": "application/json" }
        };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(endpoint, options);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || "Request failed (" + res.status + ")");
        }
        return await res.json();
      } catch (err) {
        logMessage("[API Error] " + err.message, "error");
        throw err;
      }
    }

    // Get Clean Final Output
    function getFinalOutput() {
      if (latestReport && typeof latestReport.finalStdout === "string" && latestReport.finalStdout.length > 0) {
        return latestReport.finalStdout;
      }
      const enabled = currentPipeline.stages.filter(s => s.enabled);
      for (let i = enabled.length - 1; i >= 0; i--) {
        const s = enabled[i];
        if (s && stageResults[s.id] && stageResults[s.id].stdout) {
          return stageResults[s.id].stdout;
        }
      }
      return "";
    }

    // Copy to Clipboard Helper
    function copyToClipboard(text, label = "Text") {
      if (!text && text !== "") {
        showToast("Nothing to copy for " + label, "error");
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        logMessage(\`[Clipboard] 📋 Copied \${label} (\${text.length} chars) to clipboard!\`, "success");
        showToast(\`Copied \${label} (\${text.length} chars)\`, "success");
      }).catch(err => {
        logMessage(\`[Clipboard] Failed to copy \${label}: \${err.message}\`, "error");
        showToast("Failed to copy to clipboard", "error");
      });
    }

    // Refresh KPI Dashboard
    function updateKpis() {
      const count = currentPipeline.stages.length;
      document.getElementById("kpi_stages_count").textContent = count;
      document.getElementById("lbl_stages_header_count").textContent = count;
      document.getElementById("kpi_mode").textContent = currentPipeline.mode.toUpperCase();
      
      let totalDuration = 0;
      let totalBytes = 0;
      let hasError = false;
      let isRunning = false;

      Object.values(stageResults).forEach(res => {
        if (res.durationMs) totalDuration += res.durationMs;
        if (res.stdout) totalBytes += res.stdout.length;
        if (res.status === "error") hasError = true;
        if (res.status === "running") isRunning = true;
      });

      document.getElementById("kpi_duration").textContent = totalDuration + " ms";
      document.getElementById("kpi_bytes").textContent = totalBytes + " B";

      const statusEl = document.getElementById("kpi_status");
      const appStatusText = document.getElementById("app_status_text");

      if (isRunning) {
        statusEl.textContent = "RUNNING";
        statusEl.style.color = "var(--accent-blue)";
        appStatusText.textContent = "Executing...";
      } else if (hasError) {
        statusEl.textContent = "ERROR";
        statusEl.style.color = "var(--accent-red)";
        appStatusText.textContent = "Stage Failed";
      } else if (Object.keys(stageResults).length > 0) {
        statusEl.textContent = "SUCCESS";
        statusEl.style.color = "var(--accent-green)";
        appStatusText.textContent = "Completed";
      } else {
        statusEl.textContent = "IDLE";
        statusEl.style.color = "var(--text-muted)";
        appStatusText.textContent = "System Ready";
      }

      renderFlowSequence();
    }

    // Render Visual Pipeline Topology Sequence
    function renderFlowSequence() {
      const container = document.getElementById("pipeline_flow_sequence");
      container.innerHTML = "";

      // Stdin Node
      const stdinNode = document.createElement("div");
      stdinNode.className = "flow-node";
      stdinNode.innerHTML = '<span>📥</span> <span>Stdin</span>';
      stdinNode.onclick = () => {
        document.getElementById("txt_initial_stdin").focus();
      };
      container.appendChild(stdinNode);

      currentPipeline.stages.forEach((st, idx) => {
        const arrow = document.createElement("span");
        arrow.className = "flow-arrow";
        arrow.textContent = "➔";
        container.appendChild(arrow);

        const res = stageResults[st.id];
        const node = document.createElement("div");
        node.className = "flow-node" + (idx === selectedStageIndex ? " active" : "");
        if (res) {
          if (res.status === "success") node.style.borderColor = "var(--accent-green)";
          if (res.status === "error") node.style.borderColor = "var(--accent-red)";
          if (res.status === "running") node.style.borderColor = "var(--accent-blue)";
        }

        const isSudo = st.runWithSudo || st.command.trim().startsWith("sudo ");
        node.innerHTML = \`
          <span>#\${idx + 1}</span>
          <span style="font-weight: 600;">\${escapeHtml(st.name || "Stage")}</span>
          \${isSudo ? '<span>🛡️</span>' : ''}
        \`;

        node.onclick = () => selectStage(idx);
        container.appendChild(node);
      });

      // Final Output Node
      const finalArrow = document.createElement("span");
      finalArrow.className = "flow-arrow";
      finalArrow.textContent = "➔";
      container.appendChild(finalArrow);

      const finalNode = document.createElement("div");
      finalNode.className = "flow-node" + (inspectorView === "final" ? " active" : "");
      finalNode.style.borderColor = "var(--accent-cyan)";
      finalNode.innerHTML = '<span>🎯</span> <span style="font-weight: 700; color: var(--accent-cyan);">Final Output</span>';
      finalNode.onclick = () => setInspectorTab("final");
      container.appendChild(finalNode);
    }

    // Render Stages List
    function renderStagesList() {
      const container = document.getElementById("stages_container");
      container.innerHTML = "";

      const filterText = (document.getElementById("txt_search_stages") ? document.getElementById("txt_search_stages").value : "").toLowerCase();

      if (currentPipeline.stages.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No stages in pipeline. Click "➕ Add Stage" to get started.</div>';
        updateKpis();
        return;
      }

      currentPipeline.stages.forEach((st, idx) => {
        if (filterText) {
          const matchName = (st.name || "").toLowerCase().includes(filterText);
          const matchCmd = (st.command || "").toLowerCase().includes(filterText);
          if (!matchName && !matchCmd) return;
        }

        const isSelected = idx === selectedStageIndex;
        const res = stageResults[st.id];

        const card = document.createElement("div");
        card.id = "stage_row_" + idx;
        card.className = "stage-item" + (isSelected ? " selected" : "");
        card.onclick = (e) => {
          if (e.target.closest("button")) return;
          selectStage(idx);
        };

        const isSudo = st.runWithSudo || st.command.trim().startsWith("sudo ");
        const statusClass = !st.enabled ? "idle" : res ? res.status : "idle";
        const statusLabel = !st.enabled ? "Disabled" : res ? res.status.toUpperCase() : "PENDING";

        card.innerHTML = \`
          <div class="stage-left">
            <span style="color: var(--text-dim); font-size: 13px; cursor: grab;" title="Drag handle">⠿</span>
            <span class="stage-order-badge">#\${idx + 1}</span>
            <div class="stage-info">
              <div class="stage-title-row">
                <span id="stage_name_\${idx}" class="stage-name">\${escapeHtml(st.name || "Untitled Stage")}</span>
                <div class="stage-badges">
                  \${isSudo ? '<span class="tag tag-sudo">🛡️ SUDO</span>' : ''}
                  <span id="stage_badge_\${idx}" class="tag tag-status-\${statusClass}">\${statusLabel}</span>
                  \${res && res.exitCode !== null ? \`<span class="tag" style="background:#1e293b; color:#94a3b8;">exit: \${res.exitCode}</span>\` : ''}
                  \${res ? \`<span class="tag" style="background:#1e293b; color:#38bdf8;">\${res.durationMs}ms</span>\` : ''}
                </div>
              </div>
              <span id="stage_cmd_\${idx}" class="stage-cmd">\${escapeHtml(st.command)}</span>
            </div>
          </div>
          <div class="stage-actions">
            <button id="btn_move_up_\${idx}" class="btn btn-sm" title="Move Up" \${idx === 0 ? 'disabled' : ''}>⬆</button>
            <button id="btn_move_down_\${idx}" class="btn btn-sm" title="Move Down" \${idx === currentPipeline.stages.length - 1 ? 'disabled' : ''}>⬇</button>
            <button id="btn_test_stage_\${idx}" class="btn btn-sm btn-primary" title="Test This Stage Only">▶</button>
            <button id="btn_copy_stage_cmd_\${idx}" class="btn btn-sm" title="Copy Command">📋</button>
            <button id="btn_dup_stage_\${idx}" class="btn btn-sm" title="Duplicate Stage">📑</button>
            <button id="btn_del_stage_\${idx}" class="btn btn-sm btn-danger" title="Delete Stage">🗑️</button>
          </div>
        \`;

        container.appendChild(card);

        // Bind buttons
        card.querySelector(\`#btn_move_up_\${idx}\`).onclick = (e) => { e.stopPropagation(); moveStage(idx, -1); };
        card.querySelector(\`#btn_move_down_\${idx}\`).onclick = (e) => { e.stopPropagation(); moveStage(idx, 1); };
        card.querySelector(\`#btn_test_stage_\${idx}\`).onclick = (e) => { e.stopPropagation(); testSingleStage(idx); };
        card.querySelector(\`#btn_copy_stage_cmd_\${idx}\`).onclick = (e) => {
          e.stopPropagation();
          copyToClipboard(st.command, \`Stage #\${idx + 1} Command\`);
        };
        card.querySelector(\`#btn_dup_stage_\${idx}\`).onclick = (e) => { e.stopPropagation(); duplicateStage(idx); };
        card.querySelector(\`#btn_del_stage_\${idx}\`).onclick = (e) => { e.stopPropagation(); deleteStage(idx); };
      });

      updateKpis();
    }

    // Select Stage
    function selectStage(index) {
      if (index < 0 || index >= currentPipeline.stages.length) return;
      selectedStageIndex = index;

      const st = currentPipeline.stages[index];
      document.getElementById("editor_stage_order_title").innerHTML = \`<span>✏️</span> Editing Stage #\${index + 1} of \${currentPipeline.stages.length}\`;
      document.getElementById("txt_stage_name").value = st.name || "";
      document.getElementById("txt_stage_cmd").value = st.command || "";
      document.getElementById("txt_stage_cwd").value = st.cwd || "";
      document.getElementById("sel_stage_input_mode").value = st.inputMode || "piped";
      document.getElementById("txt_stage_custom_stdin").value = st.customStdin || "";
      document.getElementById("chk_stage_sudo").checked = !!st.runWithSudo;
      document.getElementById("sel_stage_sudo_mode").value = st.sudoElevationMode || "auto";
      document.getElementById("num_stage_timeout").value = st.timeoutMs || 30000;
      document.getElementById("chk_stage_enabled").checked = st.enabled !== false;
      document.getElementById("chk_stage_ignore_error").checked = !!st.ignoreError;

      toggleCustomStdinVisibility();
      renderStagesList();
      updateInspector();
    }

    function toggleCustomStdinVisibility() {
      const mode = document.getElementById("sel_stage_input_mode").value;
      const group = document.getElementById("custom_stdin_group");
      group.style.display = mode === "custom" ? "flex" : "none";
    }

    // Save changes to selected stage
    function saveStageChanges() {
      if (selectedStageIndex < 0 || selectedStageIndex >= currentPipeline.stages.length) return;
      const st = currentPipeline.stages[selectedStageIndex];
      st.name = document.getElementById("txt_stage_name").value.trim();
      st.command = document.getElementById("txt_stage_cmd").value.trim();
      st.cwd = document.getElementById("txt_stage_cwd").value.trim() || undefined;
      st.inputMode = document.getElementById("sel_stage_input_mode").value;
      st.customStdin = document.getElementById("txt_stage_custom_stdin").value;
      st.runWithSudo = document.getElementById("chk_stage_sudo").checked;
      st.sudoElevationMode = document.getElementById("sel_stage_sudo_mode").value;
      st.timeoutMs = parseInt(document.getElementById("num_stage_timeout").value) || 30000;
      st.enabled = document.getElementById("chk_stage_enabled").checked;
      st.ignoreError = document.getElementById("chk_stage_ignore_error").checked;

      logMessage(\`[Stage Editor] Saved changes to Stage #\${selectedStageIndex + 1} (\${st.name})\`, "success");
      showToast(\`Updated Stage #\${selectedStageIndex + 1}\`, "success");
      renderStagesList();
      updateInspector();
    }

    // Add stage from editor
    function addStageFromEditor() {
      const newStage = {
        id: "stage_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        name: document.getElementById("txt_stage_name").value.trim() || "New Stage",
        command: document.getElementById("txt_stage_cmd").value.trim() || "echo 'new stage'",
        cwd: document.getElementById("txt_stage_cwd").value.trim() || undefined,
        inputMode: document.getElementById("sel_stage_input_mode").value,
        customStdin: document.getElementById("txt_stage_custom_stdin").value,
        runWithSudo: document.getElementById("chk_stage_sudo").checked,
        sudoElevationMode: document.getElementById("sel_stage_sudo_mode").value,
        timeoutMs: parseInt(document.getElementById("num_stage_timeout").value) || 30000,
        enabled: document.getElementById("chk_stage_enabled").checked,
        ignoreError: document.getElementById("chk_stage_ignore_error").checked,
      };

      currentPipeline.stages.push(newStage);
      selectedStageIndex = currentPipeline.stages.length - 1;
      logMessage(\`[Stage Editor] Added new Stage #\${currentPipeline.stages.length} (\${newStage.name})\`, "success");
      showToast(\`Added Stage #\${currentPipeline.stages.length}\`, "success");
      selectStage(selectedStageIndex);
    }

    // Add blank stage
    function addBlankStage() {
      const count = currentPipeline.stages.length + 1;
      const stage = {
        id: "stage_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        name: "Stage " + count,
        command: "grep -v 'pattern'",
        inputMode: "piped",
        enabled: true,
        timeoutMs: 30000,
      };
      currentPipeline.stages.push(stage);
      selectedStageIndex = currentPipeline.stages.length - 1;
      logMessage(\`[Stage] Added blank Stage #\${count}\`, "info");
      selectStage(selectedStageIndex);
    }

    // Duplicate stage
    function duplicateStage(index) {
      if (index < 0 || index >= currentPipeline.stages.length) return;
      const orig = currentPipeline.stages[index];
      const dup = {
        ...JSON.parse(JSON.stringify(orig)),
        id: "stage_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        name: orig.name + " (Copy)",
      };
      currentPipeline.stages.splice(index + 1, 0, dup);
      selectedStageIndex = index + 1;
      logMessage(\`[Stage] Duplicated Stage #\${index + 1} to #\${index + 2}\`, "info");
      showToast(\`Duplicated Stage #\${index + 1}\`, "info");
      selectStage(selectedStageIndex);
    }

    // Delete stage
    function deleteStage(index) {
      if (index < 0 || index >= currentPipeline.stages.length) return;
      const removed = currentPipeline.stages.splice(index, 1)[0];
      delete stageResults[removed.id];
      if (selectedStageIndex >= currentPipeline.stages.length) {
        selectedStageIndex = Math.max(0, currentPipeline.stages.length - 1);
      }
      logMessage(\`[Stage] Deleted Stage #\${index + 1} (\${removed.name})\`, "warn");
      showToast(\`Deleted Stage #\${index + 1}\`, "info");
      if (currentPipeline.stages.length > 0) {
        selectStage(selectedStageIndex);
      } else {
        renderStagesList();
        updateInspector();
      }
    }

    // Move Stage
    function moveStage(index, direction) {
      const target = index + direction;
      if (target < 0 || target >= currentPipeline.stages.length) return;
      const temp = currentPipeline.stages[index];
      currentPipeline.stages[index] = currentPipeline.stages[target];
      currentPipeline.stages[target] = temp;
      selectedStageIndex = target;
      logMessage(\`[Stage] Moved Stage #\${index + 1} to #\${target + 1}\`, "info");
      selectStage(selectedStageIndex);
    }

    // Render Stage Sections Container
    function renderSectionsContainer() {
      const container = document.getElementById("sections_container_inspector");
      container.innerHTML = "";
      if (currentPipeline.stages.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">No stages configured.</div>';
        return;
      }

      currentPipeline.stages.forEach((st, idx) => {
        const res = stageResults[st.id];
        const card = document.createElement("div");
        card.style.cssText = "border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-card); overflow: hidden; margin-bottom: 8px;";

        const statusClass = !st.enabled ? "idle" : res ? res.status : "idle";
        const statusLabel = !st.enabled ? "Disabled" : res ? res.status.toUpperCase() : "PENDING";
        const isSudo = st.runWithSudo || st.command.trim().startsWith("sudo ");

        card.innerHTML = \`
          <div style="background: #131c2e; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="stage-order-badge">#\${idx + 1}</span>
              <strong style="font-size: 13px;">\${escapeHtml(st.name)}</strong>
              <code style="font-family: var(--font-mono); font-size: 11px; background: #080d16; padding: 2px 6px; border-radius: 4px; color: #94a3b8;">\${escapeHtml(st.command)}</code>
              \${isSudo ? '<span class="tag tag-sudo">🛡️ SUDO</span>' : ''}
              <span class="tag tag-status-\${statusClass}">\${statusLabel}</span>
              \${res && res.exitCode !== null ? \`<span class="tag" style="background:#1e293b; color:#94a3b8;">exit: \${res.exitCode}</span>\` : ''}
              \${res ? \`<span class="tag" style="background:#1e293b; color:#38bdf8;">\${res.durationMs}ms</span>\` : ''}
              \${res ? \`<span class="tag" style="background:#1e293b; color:#a5f3fc;">\${res.stdout.length} B</span>\` : ''}
            </div>
            <div style="display: flex; gap: 6px;">
              <button id="btn_sec_copy_out_\${idx}" class="btn btn-sm btn-primary">📋 Copy Output</button>
              <button id="btn_sec_copy_in_\${idx}" class="btn btn-sm">📋 Copy Input</button>
              <button id="btn_sec_copy_cmd_\${idx}" class="btn btn-sm">📋 Copy Cmd</button>
            </div>
          </div>
          <pre style="margin: 0; padding: 10px; font-family: var(--font-mono); font-size: 11px; max-height: 180px; overflow-y: auto; color: #a5f3fc; background: var(--code-bg); white-space: pre-wrap; word-break: break-all;">\${escapeHtml(res ? res.stdout || "(Empty stdout)" : "(Stage not executed yet)")}</pre>
        \`;

        container.appendChild(card);

        card.querySelector(\`#btn_sec_copy_out_\${idx}\`).onclick = () => {
          const txt = res ? res.stdout : "";
          copyToClipboard(txt, \`Stage #\${idx + 1} Output\`);
        };
        card.querySelector(\`#btn_sec_copy_in_\${idx}\`).onclick = () => {
          const txt = res ? res.stdinUsed : "";
          copyToClipboard(txt, \`Stage #\${idx + 1} Input\`);
        };
        card.querySelector(\`#btn_sec_copy_cmd_\${idx}\`).onclick = () => {
          copyToClipboard(st.command, \`Stage #\${idx + 1} Command\`);
        };
      });
    }

    // Update Output Inspector Content
    async function updateInspector() {
      const viewer = document.getElementById("inspector_content");
      const secContainer = document.getElementById("sections_container_inspector");
      const stats = document.getElementById("lbl_inspector_stats");
      const filterInput = (document.getElementById("txt_filter_output") ? document.getElementById("txt_filter_output").value : "").toLowerCase();

      const st = currentPipeline.stages[selectedStageIndex];
      const res = st ? stageResults[st.id] : null;

      if (inspectorView === "sections") {
        viewer.style.display = "none";
        secContainer.style.display = "flex";
        renderSectionsContainer();
        stats.textContent = \`📑 \${currentPipeline.stages.length} Stage Output Sections (Copy any section independently)\`;
        return;
      }

      viewer.style.display = "block";
      secContainer.style.display = "none";

      if (inspectorView === "final") {
        const finalOut = getFinalOutput();
        if (!finalOut) {
          viewer.textContent = "Pipeline has not been executed yet.\\nClick '▶ Run Full Pipeline' to see the clean final output here.";
          stats.textContent = "🎯 Clean Final Stream Output (Pending Run)";
        } else {
          let displayText = finalOut;
          if (filterInput) {
            displayText = finalOut.split("\\n").filter(l => l.toLowerCase().includes(filterInput)).join("\\n");
          }
          viewer.textContent = displayText || "(No matching lines found)";
          const lines = finalOut.split("\\n").length;
          const words = finalOut.trim() ? finalOut.trim().split(/\\s+/).length : 0;
          stats.textContent = \`🎯 Clean Final Output: \${lines} lines · \${words} words · \${finalOut.length} bytes\`;
        }
      } else if (inspectorView === "diff") {
        if (!st) {
          viewer.textContent = "No stage selected.";
          stats.textContent = "Stream Diff: No stage selected";
        } else {
          const inputVal = st.inputMode === "custom" ? st.customStdin : res ? res.stdinUsed : "(No input)";
          const outputVal = res ? res.stdout : "(Not run)";
          viewer.textContent = \`=== STAGE #\${selectedStageIndex + 1} INPUT (STDIN) ===\\n\${inputVal || "(empty)"}\\n\\n=== STAGE #\${selectedStageIndex + 1} OUTPUT (STDOUT) ===\\n\${outputVal || "(empty)"}\`;
          stats.textContent = \`Stream Diff: Stage #\${selectedStageIndex + 1} (\${st.name})\`;
        }
      } else if (inspectorView === "stdout") {
        if (!st) {
          viewer.textContent = "No stage selected.";
          stats.textContent = "Stage STDOUT: No selection";
        } else if (!res) {
          viewer.textContent = \`Stage #\${selectedStageIndex + 1} (\${st.name}) has not been executed yet.\\nClick "▶ Run Full Pipeline" or "▶" to test.\`;
          stats.textContent = \`Stage #\${selectedStageIndex + 1}: \${st.name} (Pending)\`;
        } else {
          viewer.textContent = res.stdout || "(stdout was empty)";
          stats.textContent = \`Stage #\${selectedStageIndex + 1}: \${res.stdout.length} bytes · \${res.durationMs}ms · exit \${res.exitCode ?? 0}\`;
        }
      } else if (inspectorView === "stderr") {
        if (!st) {
          viewer.textContent = "No stage selected.";
        } else if (!res) {
          viewer.textContent = "No stderr recorded.";
        } else {
          viewer.textContent = res.stderr || "(stderr was empty)";
        }
        stats.textContent = \`STDERR: \${st ? st.name : ''}\`;
      } else if (inspectorView === "stdin") {
        if (!st) {
          viewer.textContent = "No stage selected.";
        } else if (st.inputMode === "custom") {
          viewer.textContent = st.customStdin || "(custom stdin is empty)";
        } else if (st.inputMode === "initial") {
          viewer.textContent = document.getElementById("txt_initial_stdin").value || "(initial stdin is empty)";
        } else if (selectedStageIndex === 0) {
          viewer.textContent = document.getElementById("txt_initial_stdin").value || "(initial stdin is empty)";
        } else {
          const prevStage = currentPipeline.stages[selectedStageIndex - 1];
          const prevRes = prevStage ? stageResults[prevStage.id] : null;
          viewer.textContent = prevRes ? prevRes.stdout : \`[Piped Stdin will come from previous stage #\${selectedStageIndex}: \${prevStage ? prevStage.name : ''}]\`;
        }
        stats.textContent = \`STDIN Payload: \${st ? st.name : ''}\`;
      } else if (inspectorView === "script") {
        try {
          const data = await apiRequest("/api/script/export", "POST", {
            stages: currentPipeline.stages,
            mode: currentPipeline.mode,
            initialStdin: document.getElementById("txt_initial_stdin").value
          });
          viewer.textContent = data.script;
          stats.textContent = "Generated Standalone Shell Script";
        } catch (e) {
          viewer.textContent = "Error generating script: " + e.message;
        }
      } else if (inspectorView === "report") {
        viewer.textContent = latestReport ? JSON.stringify(latestReport, null, 2) : "No execution report available. Run pipeline to generate.";
        stats.textContent = "Pipeline Execution Report JSON";
      }
    }

    // Set Inspector Tab
    function setInspectorTab(tab) {
      inspectorView = tab;
      ["final", "sections", "stdout", "stderr", "stdin", "diff", "script", "report"].forEach(t => {
        const btn = document.getElementById("tab_" + t);
        if (btn) btn.className = "tab-btn" + (t === tab ? " active" : "");
      });
      updateInspector();
    }

    // Run Full Pipeline
    async function runFullPipeline() {
      syncPipelineForm();
      if (currentPipeline.stages.length === 0) {
        logMessage("Cannot run pipeline: no stages defined.", "warn");
        showToast("Cannot run pipeline: no stages defined", "error");
        return;
      }

      const enabledStages = currentPipeline.stages.filter(s => s.enabled);
      let sudoPass = "";
      if (enabledStages.some(isStageNeedingSudo)) {
        try {
          sudoPass = await ensureSudoPassword(enabledStages);
        } catch {
          logMessage("[Run] Sudo authorization cancelled by user.", "warn");
          showToast("Execution cancelled (Sudo password required)", "info");
          return;
        }
      }

      const runBtn = document.getElementById("btn_run_all");
      if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = '⏳ Running Pipeline...';
      }

      logMessage(\`[Run] ▶ Executing full pipeline '\${currentPipeline.name}' (\${currentPipeline.stages.length} stages, mode=\${currentPipeline.mode})...\`, "info");
      
      currentPipeline.stages.forEach(st => {
        if (st.enabled) {
          stageResults[st.id] = { status: "running", stdout: "", stderr: "", exitCode: null, durationMs: 0 };
        }
      });
      renderStagesList();

      try {
        const payload = {
          stages: currentPipeline.stages,
          mode: currentPipeline.mode,
          initialStdin: currentPipeline.initialStdin,
          sudoPassword: sessionSudoPassword || sudoPass || undefined,
        };

        const res = await apiRequest("/api/execute/full", "POST", payload);
        latestReport = res.report;

        if (res.report && res.report.stageResults) {
          if (Array.isArray(res.report.stageResults)) {
            res.report.stageResults.forEach(sr => {
              if (sr && sr.stageId) stageResults[sr.stageId] = sr;
            });
          } else {
            Object.values(res.report.stageResults).forEach(sr => {
              if (sr && sr.stageId) stageResults[sr.stageId] = sr;
            });
          }
        }

        // If returned error mentions sudo credentials required, invalidate volatile pass
        const hasSudoAuthError = Object.values(stageResults).some(
          sr => sr && sr.stderr && (sr.stderr.includes("a password is required") || sr.stderr.includes("Sudo credentials required"))
        );
        if (hasSudoAuthError) {
          sessionSudoPassword = "";
          updateSudoBadge(false, false);
          showToast("Sudo password rejected or expired. Please re-authenticate.", "error");
        }

        const totalOutputBytes = res.report && res.report.finalStdout ? res.report.finalStdout.length : 0;
        nextStepIndex = 0;
        logMessage(\`[Run] ✅ Finished pipeline in \${res.report ? res.report.totalDurationMs : 0}ms (Status: \${res.report ? res.report.status : 'complete'}, Output: \${totalOutputBytes} bytes)\`, res.report && res.report.status === "success" ? "success" : "error");
        showToast(\`Pipeline \${res.report && res.report.status === "success" ? "Finished Successfully" : "Encountered Errors"} (\${res.report ? res.report.totalDurationMs : 0}ms)\`, res.report && res.report.status === "success" ? "success" : "error");
      } catch (err) {
        logMessage("[Run] ❌ Pipeline execution error: " + err.message, "error");
        showToast("Pipeline execution error: " + err.message, "error");
        currentPipeline.stages.forEach(st => {
          if (stageResults[st.id] && stageResults[st.id].status === "running") {
            stageResults[st.id] = {
              stageId: st.id,
              stageName: st.name,
              command: st.command,
              status: "error",
              exitCode: 1,
              durationMs: 0,
              stdout: "",
              stderr: err.message,
              stdinUsed: "",
              timestamp: new Date().toISOString(),
            };
          }
        });
      } finally {
        if (runBtn) {
          runBtn.disabled = false;
          runBtn.innerHTML = '▶ Run Full Pipeline <span class="kbd-shortcut">⌘↵</span>';
        }
        renderStagesList();
        updateInspector();
      }
    }

    // Step / Test Next Stage
    async function stepNextStage() {
      syncPipelineForm();
      const enabledStages = currentPipeline.stages.filter(s => s.enabled);
      if (enabledStages.length === 0) {
        logMessage("Cannot step: no enabled stages.", "warn");
        return;
      }

      if (nextStepIndex >= currentPipeline.stages.length) {
        logMessage("Pipeline reached the end. Resetting step index to 0.", "info");
        nextStepIndex = 0;
      }

      const stage = currentPipeline.stages[nextStepIndex];
      const idx = nextStepIndex;
      nextStepIndex++;

      logMessage(\`[Step] ⏭ Stepping Stage #\${idx + 1} of \${currentPipeline.stages.length} (\${stage.name})...\`, "info");
      selectStage(idx);
      await testSingleStage(idx);
    }

    // Test a Single Stage
    async function testSingleStage(index) {
      if (index < 0 || index >= currentPipeline.stages.length) return;
      const stage = currentPipeline.stages[index];

      let sudoPass = "";
      if (isStageNeedingSudo(stage)) {
        try {
          sudoPass = await ensureSudoPassword([stage], stage.command, stage.name);
        } catch {
          logMessage(\`[Test Stage] Sudo authorization cancelled for Stage #\${index + 1}.\`, "warn");
          showToast("Stage test cancelled (Sudo required)", "info");
          return;
        }
      }

      let stdinPayload = "";
      if (stage.inputMode === "custom") {
        stdinPayload = stage.customStdin || "";
      } else if (stage.inputMode === "initial") {
        stdinPayload = document.getElementById("txt_initial_stdin").value;
      } else if (index === 0) {
        stdinPayload = document.getElementById("txt_initial_stdin").value;
      } else {
        const prev = currentPipeline.stages[index - 1];
        const prevRes = prev ? stageResults[prev.id] : null;
        stdinPayload = prevRes ? prevRes.stdout : document.getElementById("txt_initial_stdin").value;
      }

      stageResults[stage.id] = { status: "running", stdout: "", stderr: "", exitCode: null, durationMs: 0 };
      renderStagesList();

      try {
        logMessage(\`[Test Stage] Executing Stage #\${index + 1}: \${stage.command}\`, "info");
        const res = await apiRequest("/api/execute/stage", "POST", {
          stage,
          stdinPayload,
          sudoPassword: sessionSudoPassword || sudoPass || undefined,
        });
        stageResults[stage.id] = res.result;

        // If returned sudo authentication error, reset session pass
        if (res.result.stderr && (res.result.stderr.includes("a password is required") || res.result.stderr.includes("Sudo credentials required"))) {
          sessionSudoPassword = "";
          updateSudoBadge(false, false);
          showToast("Sudo password rejected or expired. Please re-enter.", "error");
        }

        logMessage(\`[Test Stage] \${res.result.status === "success" ? "✅" : "❌"} Stage #\${index + 1} completed: exit \${res.result.exitCode} in \${res.result.durationMs}ms, \${res.result.stdout.length} bytes\`, res.result.status === "success" ? "success" : "error");
        showToast(\`Stage #\${index + 1} \${res.result.status.toUpperCase()} (exit: \${res.result.exitCode})\`, res.result.status === "success" ? "success" : "error");
      } catch (err) {
        stageResults[stage.id] = { status: "error", stdout: "", stderr: err.message, exitCode: 1, durationMs: 0 };
        logMessage(\`[Test Stage] ❌ Execution failed: \${err.message}\`, "error");
        showToast("Execution failed: " + err.message, "error");
      } finally {
        renderStagesList();
        updateInspector();
      }
    }

    // Reset Pipeline Execution State
    function resetPipeline() {
      stageResults = {};
      nextStepIndex = 0;
      latestReport = null;
      logMessage("[Pipeline] Reset execution state and telemetry.", "info");
      showToast("Pipeline state reset", "info");
      renderStagesList();
      updateInspector();
    }

    // Sync pipeline metadata
    function syncPipelineForm() {
      currentPipeline.name = document.getElementById("txt_pipeline_name").value.trim() || "Untitled Pipeline";
      currentPipeline.mode = document.getElementById("sel_execution_mode").value;
      currentPipeline.initialStdin = document.getElementById("txt_initial_stdin").value;
    }

    // Load Presets
    async function loadPresets() {
      try {
        presetsMap = await apiRequest("/api/presets");
        const sel = document.getElementById("sel_preset");
        sel.innerHTML = '<option value="">-- Presets Library --</option>';
        Object.keys(presetsMap).forEach(key => {
          const opt = document.createElement("option");
          opt.value = key;
          opt.textContent = key;
          sel.appendChild(opt);
        });
      } catch (e) {
        logMessage("Failed to load presets: " + e.message, "error");
      }
    }

    // Apply selected Preset
    function applyPreset(presetName) {
      if (!presetName || !presetsMap[presetName]) return;
      const p = presetsMap[presetName];
      currentPipeline = {
        id: "pipeline_" + Date.now(),
        name: p.name,
        mode: p.mode,
        initialStdin: p.initialStdin || "",
        stages: JSON.parse(JSON.stringify(p.stages))
      };

      document.getElementById("txt_pipeline_name").value = currentPipeline.name;
      document.getElementById("sel_execution_mode").value = currentPipeline.mode;
      document.getElementById("txt_initial_stdin").value = currentPipeline.initialStdin;

      stageResults = {};
      nextStepIndex = 0;
      selectedStageIndex = 0;

      logMessage(\`[Preset] Loaded preset '\${p.name}' with \${p.stages.length} stages.\`, "success");
      showToast(\`Loaded Preset: \${p.name}\`, "success");
      selectStage(0);
    }

    // Load Saved Pipelines
    async function loadSavedPipelines() {
      try {
        pipelinesList = await apiRequest("/api/pipelines");
        const sel = document.getElementById("sel_pipeline");
        sel.innerHTML = '<option value="">-- Saved Pipelines --</option>';
        pipelinesList.forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.name;
          sel.appendChild(opt);
        });
      } catch (e) {
        logMessage("Failed to load saved pipelines: " + e.message, "error");
      }
    }

    // Select Saved Pipeline
    async function selectSavedPipeline(id) {
      if (!id) return;
      try {
        const p = await apiRequest("/api/pipelines/" + id);
        currentPipeline = {
          id: p.id,
          name: p.name,
          mode: p.mode,
          initialStdin: p.initialStdin || "",
          stages: p.stages || []
        };

        document.getElementById("txt_pipeline_name").value = currentPipeline.name;
        document.getElementById("sel_execution_mode").value = currentPipeline.mode;
        document.getElementById("txt_initial_stdin").value = currentPipeline.initialStdin;

        stageResults = {};
        nextStepIndex = 0;
        selectedStageIndex = 0;

        logMessage(\`[Library] Loaded saved pipeline '\${p.name}'\`, "success");
        showToast(\`Loaded Pipeline: \${p.name}\`, "success");
        if (currentPipeline.stages.length > 0) {
          selectStage(0);
        } else {
          renderStagesList();
        }
      } catch (e) {
        logMessage("Failed to load pipeline: " + e.message, "error");
      }
    }

    // Save Pipeline to Library
    async function saveCurrentPipeline() {
      syncPipelineForm();
      try {
        const res = await apiRequest("/api/pipelines/save", "POST", currentPipeline);
        logMessage(\`[Library] 💾 Saved pipeline '\${currentPipeline.name}' (ID: \${res.id})\`, "success");
        showToast(\`Saved: \${currentPipeline.name}\`, "success");
        await loadSavedPipelines();
        document.getElementById("sel_pipeline").value = res.id;
      } catch (e) {
        logMessage("Failed to save pipeline: " + e.message, "error");
        showToast("Save failed: " + e.message, "error");
      }
    }

    // Save As New Pipeline Modal
    function openSaveAsModal() {
      syncPipelineForm();
      document.getElementById("txt_save_as_name").value = currentPipeline.name + " (Copy)";
      document.getElementById("modal_save_as").classList.add("show");
      document.getElementById("txt_save_as_name").focus();
    }

    async function confirmSaveAs() {
      const newName = document.getElementById("txt_save_as_name").value.trim();
      if (!newName) return;
      syncPipelineForm();

      try {
        const payload = {
          ...currentPipeline,
          name: newName
        };
        const res = await apiRequest("/api/pipelines/save-as", "POST", payload);
        currentPipeline.id = res.id;
        currentPipeline.name = res.name;
        document.getElementById("txt_pipeline_name").value = res.name;

        document.getElementById("modal_save_as").classList.remove("show");
        logMessage(\`[Library] ➕ Created new named pipeline '\${res.name}'\`, "success");
        showToast(\`Created: \${res.name}\`, "success");
        await loadSavedPipelines();
        document.getElementById("sel_pipeline").value = res.id;
      } catch (e) {
        logMessage("Save As failed: " + e.message, "error");
      }
    }

    // Delete Saved Pipeline
    async function deleteCurrentPipeline() {
      const sel = document.getElementById("sel_pipeline");
      const id = sel.value || currentPipeline.id;
      if (!id) {
        logMessage("No saved pipeline selected for deletion.", "warn");
        return;
      }

      if (!confirm(\`Are you sure you want to delete pipeline '\${currentPipeline.name}' from your saved library?\`)) {
        return;
      }

      try {
        await apiRequest("/api/pipelines/" + id, "DELETE");
        logMessage(\`[Library] 🗑️ Deleted pipeline '\${currentPipeline.name}'\`, "warn");
        showToast(\`Deleted: \${currentPipeline.name}\`, "info");
        await loadSavedPipelines();
      } catch (e) {
        logMessage("Failed to delete pipeline: " + e.message, "error");
      }
    }

    // =============================================================================================
    // Pipeline & Library Export System (Download File & Copy to Clipboard)
    // =============================================================================================
    let currentExportTab = "active"; // "active" | "library" | "oneliner" | "script"
    let currentExportPayload = {
      text: "",
      filename: "pipeline.json",
      mime: "application/json",
      label: "Active Pipeline JSON"
    };

    function sanitizeExportFilename(name) {
      return (name || "pipeline")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_");
    }

    async function updateExportModalView(tab = currentExportTab) {
      currentExportTab = tab;
      syncPipelineForm();
      const txtPreview = document.getElementById("txt_export_preview");
      const badge = document.getElementById("export_format_badge");
      const hint = document.getElementById("export_status_hint");
      
      const tabButtons = {
        active: document.getElementById("btn_export_tab_active"),
        library: document.getElementById("btn_export_tab_library"),
        oneliner: document.getElementById("btn_export_tab_oneliner"),
        script: document.getElementById("btn_export_tab_script"),
      };

      Object.entries(tabButtons).forEach(([key, btn]) => {
        if (btn) {
          if (key === tab) {
            btn.className = "btn btn-sm btn-primary";
          } else {
            btn.className = "btn btn-sm";
          }
        }
      });

      const safeName = sanitizeExportFilename(currentPipeline.name);
      txtPreview.value = "Loading export payload...";

      if (tab === "active") {
        const json = JSON.stringify(currentPipeline, null, 2);
        currentExportPayload = {
          text: json,
          filename: safeName + ".json",
          mime: "application/json",
          label: "Active Pipeline JSON"
        };
        txtPreview.value = json;
        badge.textContent = "Format: JSON (Pipeline)";
        hint.textContent = 'Active pipeline: "' + currentPipeline.name + '" (' + currentPipeline.stages.length + ' stages)';
      } else if (tab === "library") {
        try {
          const res = await apiRequest("/api/pipelines/export");
          currentExportPayload = {
            text: res.json,
            filename: "subprocess_pipe_library.json",
            mime: "application/json",
            label: "Entire Pipeline Library JSON"
          };
          txtPreview.value = res.json;
          badge.textContent = "Format: JSON (Library Collection)";
          hint.textContent = "Complete library with all saved pipelines & presets";
        } catch (e) {
          txtPreview.value = "// Error loading library JSON: " + e.message;
        }
      } else if (tab === "oneliner") {
        try {
          const res = await apiRequest("/api/script/export", "POST", {
            stages: currentPipeline.stages,
            mode: currentPipeline.mode,
            initialStdin: currentPipeline.initialStdin
          });
          const cmd = res.oneLiner || "# No active stages configured";
          currentExportPayload = {
            text: cmd,
            filename: safeName + "_oneliner.sh",
            mime: "text/x-shellscript",
            label: "Pipeline Shell One-Liner"
          };
          txtPreview.value = cmd;
          badge.textContent = "Format: Shell Command (One-Liner)";
          hint.textContent = "Executable pipe stream command for terminal or shell scripts";
        } catch (e) {
          txtPreview.value = "# Error generating one-liner: " + e.message;
        }
      } else if (tab === "script") {
        try {
          const res = await apiRequest("/api/script/export", "POST", {
            stages: currentPipeline.stages,
            mode: currentPipeline.mode,
            initialStdin: currentPipeline.initialStdin
          });
          currentExportPayload = {
            text: res.script,
            filename: safeName + "_master.sh",
            mime: "text/x-shellscript",
            label: "Standalone Bash Script"
          };
          txtPreview.value = res.script;
          badge.textContent = "Format: Bash Script (Portable)";
          hint.textContent = "Autonomous executable shell script with error handling and traps";
        } catch (e) {
          txtPreview.value = "# Error generating script: " + e.message;
        }
      }
    }

    function openExportModal(tab = "active") {
      updateExportModalView(tab);
      document.getElementById("modal_export").classList.add("show");
    }

    function copyCurrentExportToClipboard() {
      if (!currentExportPayload.text) {
        showToast("Nothing to copy", "error");
        return;
      }
      copyToClipboard(currentExportPayload.text, currentExportPayload.label);
      const hint = document.getElementById("export_status_hint");
      if (hint) {
        const orig = hint.textContent;
        hint.textContent = "📋 Copied " + currentExportPayload.label + " to clipboard!";
        hint.style.color = "var(--accent-green)";
        setTimeout(() => {
          hint.textContent = orig;
          hint.style.color = "var(--text-dim)";
        }, 2500);
      }
    }

    function downloadCurrentExportFile() {
      if (!currentExportPayload.text) {
        showToast("Nothing to download", "error");
        return;
      }
      try {
        const blob = new Blob([currentExportPayload.text], { type: currentExportPayload.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = currentExportPayload.filename;
        a.click();
        URL.revokeObjectURL(url);
        logMessage("[Export] 💾 Downloaded " + currentExportPayload.filename + " successfully.", "success");
        showToast("Downloaded " + currentExportPayload.filename, "success");
      } catch (e) {
        logMessage("Download failed: " + e.message, "error");
      }
    }

    function quickCopyActivePipelineJson() {
      syncPipelineForm();
      const json = JSON.stringify(currentPipeline, null, 2);
      copyToClipboard(json, 'Pipeline "' + currentPipeline.name + '" JSON');
      logMessage('[Clipboard] 📋 Quick-copied active pipeline "' + currentPipeline.name + '" JSON to clipboard.', "success");
    }

    function downloadStandaloneScript() {
      const script = document.getElementById("txt_exported_script").value;
      if (!script || script.startsWith("# Error")) {
        showToast("No valid script to download", "error");
        return;
      }
      const safeName = sanitizeExportFilename(currentPipeline.name);
      const filename = safeName + "_master.sh";
      const blob = new Blob([script], { type: "text/x-shellscript" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      logMessage("[Script] 💾 Downloaded standalone script " + filename + " successfully.", "success");
      showToast("Downloaded " + filename, "success");
    }

    // Import Library JSON
    function triggerLibraryImport() {
      document.getElementById("file_library_import").click();
    }

    async function handleLibraryFile(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const res = await apiRequest("/api/pipelines/import", "POST", { json: text });
        logMessage(\`[Library] 📥 Imported \${res.importedCount} pipelines successfully.\`, "success");
        showToast(\`Imported \${res.importedCount} pipelines\`, "success");
        await loadSavedPipelines();
      } catch (err) {
        logMessage("Import failed: " + err.message, "error");
        showToast("Import failed: " + err.message, "error");
      } finally {
        e.target.value = "";
      }
    }

    // Sudo Session & Interactive Prompt Management
    let sessionSudoPassword = "";
    let sudoPromptResolve = null;
    let sudoPromptReject = null;

    function isStageNeedingSudo(st) {
      if (!st) return false;
      if (st.runWithSudo) return true;
      const cmd = (st.command || "").trim();
      return cmd.startsWith("sudo ") || /^sudo(\s+|$)/i.test(cmd) || /\|\s*sudo(\s+|$)/i.test(cmd) || /&&\s*sudo(\s+|$)/i.test(cmd) || /;\s*sudo(\s+|$)/i.test(cmd);
    }

    function updateSudoBadge(isCached, hasSessionPass) {
      const badge = document.getElementById("badge_sudo_status");
      const clearBtn = document.getElementById("btn_sudo_clear");
      const sessStatus = document.getElementById("txt_session_sudo_status");
      if (!badge) return;

      if (hasSessionPass || sessionSudoPassword) {
        badge.textContent = "🛡️ Sudo: Active (RAM)";
        badge.style.background = "rgba(16, 185, 129, 0.2)";
        badge.style.color = "var(--accent-green)";
        badge.style.borderColor = "var(--accent-green)";
        if (clearBtn) clearBtn.style.display = "inline-flex";
        if (sessStatus) {
          sessStatus.textContent = "🟢 Active (Held in Volatile RAM)";
          sessStatus.style.color = "var(--accent-green)";
        }
      } else if (isCached) {
        badge.textContent = "🛡️ Sudo Ticket: Active";
        badge.style.background = "rgba(16, 185, 129, 0.2)";
        badge.style.color = "var(--accent-green)";
        badge.style.borderColor = "var(--accent-green)";
        if (clearBtn) clearBtn.style.display = "none";
        if (sessStatus) {
          sessStatus.textContent = "🟢 Host System Ticket Cached";
          sessStatus.style.color = "var(--accent-green)";
        }
      } else {
        badge.textContent = "🛡️ Sudo Ticket: Inactive";
        badge.style.background = "rgba(245, 158, 11, 0.15)";
        badge.style.color = "var(--accent-amber)";
        badge.style.borderColor = "rgba(245, 158, 11, 0.3)";
        if (clearBtn) clearBtn.style.display = "none";
        if (sessStatus) {
          sessStatus.textContent = "🔒 Not Authenticated";
          sessStatus.style.color = "var(--accent-amber)";
        }
      }
    }

    async function checkSudoStatus() {
      try {
        const status = await apiRequest("/api/sudo/status");
        updateSudoBadge(status.isCached, !!sessionSudoPassword);
        return status;
      } catch (e) {
        const badge = document.getElementById("badge_sudo_status");
        if (badge) {
          badge.textContent = "🛡️ Sudo Ticket: Error";
          badge.style.color = "var(--accent-red)";
        }
      }
    }

    function openSudoPromptModal(cmdHint, stageName) {
      return new Promise((resolve, reject) => {
        sudoPromptResolve = resolve;
        sudoPromptReject = reject;
        const modal = document.getElementById("modal_sudo_prompt");
        const desc = document.getElementById("txt_sudo_prompt_desc");
        const cmdEl = document.getElementById("txt_sudo_prompt_cmd");
        const passIn = document.getElementById("txt_sudo_prompt_password");
        
        desc.textContent = stageName 
          ? "Stage \\"" + stageName + "\\" requires elevated root privileges. Enter your administrator / sudo password to continue:"
          : "Elevated root privileges are required to run this command. Enter your administrator / sudo password to continue:";
        cmdEl.textContent = cmdHint || "sudo <command>";
        passIn.value = "";
        modal.classList.add("show");
        setTimeout(() => passIn.focus(), 80);
      });
    }

    function closeSudoPromptModal() {
      const modal = document.getElementById("modal_sudo_prompt");
      if (modal) modal.classList.remove("show");
    }

    async function ensureSudoPassword(stages, cmdHint, stageName) {
      const needsSudo = stages.some(isStageNeedingSudo);
      if (!needsSudo) return "";

      if (sessionSudoPassword) return sessionSudoPassword;

      try {
        const st = await apiRequest("/api/sudo/status");
        if (st && st.isCached) {
          updateSudoBadge(true, false);
          return "";
        }
      } catch {}

      const firstSudoStage = stages.find(isStageNeedingSudo);
      const pass = await openSudoPromptModal(cmdHint || (firstSudoStage ? firstSudoStage.command : "sudo"), stageName || (firstSudoStage ? firstSudoStage.name : ""));
      return pass;
    }

    async function showSudoModal() {
      const modal = document.getElementById("modal_sudo");
      const info = document.getElementById("sudo_preflight_info");
      modal.classList.add("show");
      info.textContent = "Querying host sudo subsystem status...";

      try {
        const st = await checkSudoStatus();
        let html = "";
        html += "<strong>OS Platform:</strong> " + escapeHtml(st.osPlatform || navigator.platform) + "\\n";
        html += "<strong>Sudo Binary Available:</strong> " + (st.hasSudoBinary ? "Yes" : "No") + "\\n";
        html += "<strong>Current Host User:</strong> " + escapeHtml(st.user || "unknown") + "\\n";
        html += "<strong>Ticket Cached (sudo -n):</strong> " + (st.isCached ? "Active (Cached)" : "Inactive / Expired") + "\\n";
        html += "<strong>Volatile Session Password:</strong> " + (sessionSudoPassword ? "Authenticated in RAM" : "None") + "\\n";
        html += "\\n<strong>Enterprise Subprocess Elevation Architecture:</strong>\\n";
        html += " • Mode 0700 temporary secure askpass script execution\\n";
        html += " • Zero stdin pollution: stream pipeline stdin data preserved completely\\n";
        html += " • Interactive in-browser password prompt modal on elevation triggers\\n";
        html += " • macOS native osascript administrator dialog fallback supported\\n";
        html += " • Destructive command guardrail with preflight warnings enabled\\n";
        info.innerHTML = html.replace(/\\n/g, "<br>");
      } catch (e) {
        info.textContent = "Error inspecting sudo subsystem: " + e.message;
      }
    }

    // Export Bash Script Preview Modal
    async function showScriptModal() {
      syncPipelineForm();
      const modal = document.getElementById("modal_script");
      const txt = document.getElementById("txt_exported_script");
      modal.classList.add("show");
      txt.value = "Generating standalone script...";

      try {
        const res = await apiRequest("/api/script/export", "POST", {
          stages: currentPipeline.stages,
          mode: currentPipeline.mode,
          initialStdin: currentPipeline.initialStdin
        });
        txt.value = res.script;
      } catch (e) {
        txt.value = "# Error generating script: " + e.message;
      }
    }

    // Toggle Maximize Inspector
    function toggleMaximizeInspector() {
      const panel = document.getElementById("inspector_panel");
      panel.classList.toggle("maximized");
      const isMax = panel.classList.contains("maximized");
      document.getElementById("btn_maximize_inspector").textContent = isMax ? "⛶ Restore" : "⛶ Maximize";
    }

    // Toggle Sequence Width (Wide vs Balanced)
    function toggleSequenceWidth() {
      const layout = document.querySelector(".workspace-layout");
      const btn = document.getElementById("btn_toggle_sequence_width");
      if (!layout || !btn) return;
      layout.classList.toggle("wide-sequence");
      const isWide = layout.classList.contains("wide-sequence");
      btn.textContent = isWide ? "⇹ Balanced" : "⇹ Wide";
      btn.title = isWide ? "Switch to balanced layout" : "Switch to extra-wide stage sequence";
      showToast(isWide ? "Stage sequence expanded to wide view" : "Stage sequence restored to balanced view", "info");
      try {
        localStorage.setItem("subproc_sequence_width", isWide ? "wide" : "balanced");
      } catch (_) {}
    }

    function initSequenceWidth() {
      try {
        if (localStorage.getItem("subproc_sequence_width") === "wide") {
          const layout = document.querySelector(".workspace-layout");
          const btn = document.getElementById("btn_toggle_sequence_width");
          if (layout && btn) {
            layout.classList.add("wide-sequence");
            btn.textContent = "⇹ Balanced";
            btn.title = "Switch to balanced layout";
          }
        }
      } catch (_) {}
    }

    // Keyboard Shortcuts Setup
    function setupKeyboardShortcuts() {
      window.addEventListener("keydown", (e) => {
        // Run Full Pipeline: ⌘ + Enter or Ctrl + Enter
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          runFullPipeline();
          return;
        }

        // Step Next Stage: ⌘ + Shift + Enter
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
          e.preventDefault();
          stepNextStage();
          return;
        }

        // Save: ⌘ + S or Ctrl + S
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          saveCurrentPipeline();
          return;
        }

        // Copy Final Output: ⌘ + Shift + C
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C")) {
          e.preventDefault();
          const finalOut = getFinalOutput();
          if (finalOut) copyToClipboard(finalOut, "Final Pipeline Output");
          return;
        }

        // Help Modal: ?
        if (e.key === "?" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
          e.preventDefault();
          document.getElementById("modal_shortcuts").classList.add("show");
          return;
        }

        // Close Modals: Escape
        if (e.key === "Escape") {
          document.querySelectorAll(".modal-backdrop").forEach(m => m.classList.remove("show"));
          const panel = document.getElementById("inspector_panel");
          if (panel.classList.contains("maximized")) toggleMaximizeInspector();
        }
      });
    }

    // Initialization & Event Listeners
    window.addEventListener("DOMContentLoaded", async () => {
      // Load initial state
      await loadPresets();
      await loadSavedPipelines();
      await checkSudoStatus();
      setupKeyboardShortcuts();

      // Apply default preset
      const defaultPresetName = "Process Filter & Telemetry";
      if (presetsMap[defaultPresetName]) {
        applyPreset(defaultPresetName);
      } else if (Object.keys(presetsMap).length > 0) {
        applyPreset(Object.keys(presetsMap)[0]);
      } else {
        addBlankStage();
      }

      // Presets & Pipelines Listeners
      document.getElementById("sel_preset").addEventListener("change", (e) => {
        applyPreset(e.target.value);
      });
      document.getElementById("sel_pipeline").addEventListener("change", (e) => {
        selectSavedPipeline(e.target.value);
      });
      document.getElementById("btn_pipeline_save").addEventListener("click", saveCurrentPipeline);
      document.getElementById("btn_pipeline_save_as").addEventListener("click", openSaveAsModal);
      document.getElementById("btn_pipeline_delete").addEventListener("click", deleteCurrentPipeline);
      document.getElementById("btn_library_export").addEventListener("click", () => openExportModal("active"));
      document.getElementById("btn_copy_json_quick").addEventListener("click", quickCopyActivePipelineJson);
      document.getElementById("btn_library_import").addEventListener("click", triggerLibraryImport);
      document.getElementById("file_library_import").addEventListener("change", handleLibraryFile);
      document.getElementById("btn_shortcuts_help").addEventListener("click", () => {
        document.getElementById("modal_shortcuts").classList.add("show");
      });
      document.getElementById("btn_user_guide").addEventListener("click", () => {
        document.getElementById("modal_user_guide").classList.add("show");
      });

      // Execution Controls
      document.getElementById("btn_run_all").addEventListener("click", runFullPipeline);
      document.getElementById("btn_step_next").addEventListener("click", stepNextStage);
      document.getElementById("btn_reset_pipeline").addEventListener("click", resetPipeline);
      document.getElementById("btn_export_script").addEventListener("click", showScriptModal);
      document.getElementById("sel_execution_mode").addEventListener("change", (e) => {
        currentPipeline.mode = e.target.value;
        updateKpis();
        logMessage(\`[Mode] Switched execution mode to: \${e.target.value}\`, "info");
      });

      // Stage Editor Controls
      document.getElementById("btn_add_stage").addEventListener("click", addBlankStage);
      document.getElementById("btn_stage_update").addEventListener("click", saveStageChanges);
      document.getElementById("btn_stage_new").addEventListener("click", addStageFromEditor);
      document.getElementById("sel_stage_input_mode").addEventListener("change", toggleCustomStdinVisibility);
      document.getElementById("txt_search_stages").addEventListener("input", renderStagesList);

      // Live two-way synchronization for Stage Editor inputs
      const syncActiveStageLive = () => {
        if (selectedStageIndex >= 0 && selectedStageIndex < currentPipeline.stages.length) {
          const st = currentPipeline.stages[selectedStageIndex];
          st.name = document.getElementById("txt_stage_name").value.trim();
          st.command = document.getElementById("txt_stage_cmd").value.trim();
          st.cwd = document.getElementById("txt_stage_cwd").value.trim() || undefined;
          st.inputMode = document.getElementById("sel_stage_input_mode").value;
          st.customStdin = document.getElementById("txt_stage_custom_stdin").value;
          st.runWithSudo = document.getElementById("chk_stage_sudo").checked;
          st.sudoElevationMode = document.getElementById("sel_stage_sudo_mode").value;
          st.timeoutMs = parseInt(document.getElementById("num_stage_timeout").value) || 30000;
          st.enabled = document.getElementById("chk_stage_enabled").checked;
          st.ignoreError = document.getElementById("chk_stage_ignore_error").checked;
          renderStagesList();
          updateInspector();
        }
      };

      ["txt_stage_name", "txt_stage_cmd", "txt_stage_cwd", "txt_stage_custom_stdin"].forEach(id => {
        document.getElementById(id)?.addEventListener("input", syncActiveStageLive);
      });
      ["chk_stage_sudo", "sel_stage_sudo_mode", "num_stage_timeout", "chk_stage_enabled", "chk_stage_ignore_error", "sel_stage_input_mode"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", syncActiveStageLive);
      });

      // Stdin Samples
      document.getElementById("btn_sample_json").addEventListener("click", () => {
        const sample = JSON.stringify([
          { "user": "alice", "score": 92, "active": true },
          { "user": "bob", "score": 67, "active": false },
          { "user": "carol", "score": 85, "active": true },
          { "user": "dave", "score": 43, "active": true }
        ], null, 2);
        document.getElementById("txt_initial_stdin").value = sample;
        logMessage("[Stdin] Inserted sample JSON payload.", "info");
      });

      document.getElementById("btn_sample_words").addEventListener("click", () => {
        const sample = "apple\\nbanana\\napple\\ncherry\\ndate\\nbanana\\napple\\nfig\\ngrape\\nbanana";
        document.getElementById("txt_initial_stdin").value = sample;
        logMessage("[Stdin] Inserted sample words payload.", "info");
      });

      document.getElementById("btn_clear_stdin").addEventListener("click", () => {
        document.getElementById("txt_initial_stdin").value = "";
        logMessage("[Stdin] Cleared initial stdin.", "info");
      });

      // Inspector Tabs & Controls
      ["final", "sections", "stdout", "stderr", "stdin", "diff", "script", "report"].forEach(t => {
        const btn = document.getElementById("tab_" + t);
        if (btn) btn.addEventListener("click", () => setInspectorTab(t));
      });

      document.getElementById("btn_copy_final").addEventListener("click", () => {
        const finalOut = getFinalOutput();
        if (!finalOut) {
          logMessage("No final output available to copy. Run the pipeline first.", "warn");
          showToast("No final output to copy", "error");
          return;
        }
        copyToClipboard(finalOut, "Final Pipeline Output");
      });

      document.getElementById("btn_download_final").addEventListener("click", () => {
        const finalOut = getFinalOutput();
        if (!finalOut) {
          logMessage("No final output available to download. Run the pipeline first.", "warn");
          showToast("No final output to download", "error");
          return;
        }
        const blob = new Blob([finalOut], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safeName = currentPipeline.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
        a.download = \`\${safeName}_final_output.txt\`;
        a.click();
        URL.revokeObjectURL(url);
        logMessage(\`[Download] 💾 Downloaded final output to \${safeName}_final_output.txt (\${finalOut.length} bytes)\`, "success");
        showToast("Downloaded final output file", "success");
      });

      document.getElementById("chk_wrap_text").addEventListener("change", (e) => {
        document.getElementById("inspector_content").style.whiteSpace = e.target.checked ? "pre-wrap" : "pre";
      });

      document.getElementById("txt_filter_output").addEventListener("input", () => {
        updateInspector();
      });

      document.getElementById("btn_copy_inspector").addEventListener("click", () => {
        const text = document.getElementById("inspector_content").textContent;
        copyToClipboard(text, "Active Inspector View");
      });

      document.getElementById("btn_maximize_inspector").addEventListener("click", toggleMaximizeInspector);
      document.getElementById("btn_toggle_sequence_width").addEventListener("click", toggleSequenceWidth);
      initSequenceWidth();
      document.getElementById("btn_clear_inspector").addEventListener("click", () => {
        document.getElementById("inspector_content").textContent = "";
      });
      document.getElementById("btn_clear_logs").addEventListener("click", () => {
        document.getElementById("console_logs").innerHTML = "";
      });

      // Modals Listeners
      document.getElementById("badge_sudo_status").addEventListener("click", showSudoModal);
      document.getElementById("btn_sudo_preflight").addEventListener("click", showSudoModal);
      document.getElementById("btn_modal_sudo_close").addEventListener("click", () => {
        document.getElementById("modal_sudo").classList.remove("show");
      });
      document.getElementById("btn_modal_sudo_close_x").addEventListener("click", () => {
        document.getElementById("modal_sudo").classList.remove("show");
      });
      document.getElementById("btn_modal_sudo_refresh").addEventListener("click", showSudoModal);

      // Sudo Prompt Modal Handlers
      const confirmSudoPrompt = () => {
        const passIn = document.getElementById("txt_sudo_prompt_password");
        const pass = passIn ? passIn.value : "";
        const remember = document.getElementById("chk_remember_sudo_pass")?.checked;
        if (!pass) {
          showToast("Please enter a sudo password or click Cancel", "warn");
          passIn?.focus();
          return;
        }
        if (remember) {
          sessionSudoPassword = pass;
          updateSudoBadge(false, true);
        }
        closeSudoPromptModal();
        if (sudoPromptResolve) {
          sudoPromptResolve(pass);
          sudoPromptResolve = null;
        }
      };

      document.getElementById("btn_sudo_prompt_confirm").addEventListener("click", confirmSudoPrompt);
      const onSudoPromptEnter = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmSudoPrompt();
        }
      };
      document.getElementById("txt_sudo_prompt_password").addEventListener("keydown", onSudoPromptEnter);
      document.getElementById("txt_sudo_prompt_password").addEventListener("keypress", onSudoPromptEnter);

      document.getElementById("btn_toggle_prompt_pass").addEventListener("click", () => {
        const input = document.getElementById("txt_sudo_prompt_password");
        if (input.type === "password") {
          input.type = "text";
        } else {
          input.type = "password";
        }
      });
      document.getElementById("btn_sudo_prompt_macos").addEventListener("click", () => {
        const st = currentPipeline.stages[currentStageIndex];
        if (st) {
          st.sudoElevationMode = "macos_prompt";
          const sel = document.getElementById("sel_stage_sudo_mode");
          if (sel) sel.value = "macos_prompt";
        }
        closeSudoPromptModal();
        if (sudoPromptResolve) {
          sudoPromptResolve("");
          sudoPromptResolve = null;
        }
      });
      const cancelSudoPrompt = () => {
        closeSudoPromptModal();
        if (sudoPromptReject) {
          sudoPromptReject(new Error("User cancelled sudo authorization"));
          sudoPromptReject = null;
        }
      };
      document.getElementById("btn_sudo_prompt_cancel").addEventListener("click", cancelSudoPrompt);
      document.getElementById("btn_modal_sudo_prompt_close_x").addEventListener("click", cancelSudoPrompt);

      // Sudo Preflight & Session Manager Handlers
      const triggerSessionSudoAuth = async () => {
        const passInput = document.getElementById("txt_session_sudo_pass");
        const pass = passInput ? passInput.value.trim() : "";
        if (!pass) {
          showToast("Please enter your sudo password to authenticate", "warn");
          passInput?.focus();
          return;
        }
        try {
          const res = await apiRequest("/api/sudo/auth", "POST", { password: pass });
          if (res.success) {
            sessionSudoPassword = pass;
            updateSudoBadge(true, true);
            showToast("✅ Sudo session authenticated! Ticket active.", "success");
            passInput.value = "";
            checkSudoStatus();
          } else {
            showToast("❌ Sudo authentication failed. Incorrect password.", "error");
          }
        } catch (e) {
          showToast("❌ Authentication error: " + e.message, "error");
        }
      };

      document.getElementById("btn_session_sudo_auth").addEventListener("click", triggerSessionSudoAuth);
      document.getElementById("txt_session_sudo_pass").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          triggerSessionSudoAuth();
        }
      });

      const clearSudoSession = () => {
        sessionSudoPassword = "";
        updateSudoBadge(false, false);
        const passInput = document.getElementById("txt_session_sudo_pass");
        if (passInput) passInput.value = "";
        showToast("🔒 Sudo session password cleared from RAM", "info");
      };
      document.getElementById("btn_session_sudo_clear").addEventListener("click", clearSudoSession);
      document.getElementById("btn_sudo_clear").addEventListener("click", clearSudoSession);

      // Save As Modal Handlers
      document.getElementById("btn_modal_save_confirm").addEventListener("click", confirmSaveAs);
      document.getElementById("txt_save_as_name").addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmSaveAs();
        }
      });
      document.getElementById("btn_modal_save_cancel").addEventListener("click", () => {
        document.getElementById("modal_save_as").classList.remove("show");
      });
      document.getElementById("btn_modal_save_close").addEventListener("click", () => {
        document.getElementById("modal_save_as").classList.remove("show");
      });

      // Universal enter-key submission for all modal dialog inputs
      document.querySelectorAll(".modal-backdrop input").forEach((input) => {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const modal = input.closest(".modal-backdrop");
            if (!modal) return;
            const primaryBtn = modal.querySelector(".btn-primary");
            if (primaryBtn) primaryBtn.click();
          }
        });
      });

      // Export Dialog Listeners
      document.getElementById("btn_modal_export_close").addEventListener("click", () => {
        document.getElementById("modal_export").classList.remove("show");
      });
      document.getElementById("btn_modal_export_close_x").addEventListener("click", () => {
        document.getElementById("modal_export").classList.remove("show");
      });
      document.getElementById("btn_export_tab_active").addEventListener("click", () => updateExportModalView("active"));
      document.getElementById("btn_export_tab_library").addEventListener("click", () => updateExportModalView("library"));
      document.getElementById("btn_export_tab_oneliner").addEventListener("click", () => updateExportModalView("oneliner"));
      document.getElementById("btn_export_tab_script").addEventListener("click", () => updateExportModalView("script"));
      document.getElementById("btn_export_copy_clipboard").addEventListener("click", copyCurrentExportToClipboard);
      document.getElementById("btn_export_download_file").addEventListener("click", downloadCurrentExportFile);

      // Standalone Script Modal Listeners
      document.getElementById("btn_modal_script_close").addEventListener("click", () => {
        document.getElementById("modal_script").classList.remove("show");
      });
      document.getElementById("btn_modal_script_close_x").addEventListener("click", () => {
        document.getElementById("modal_script").classList.remove("show");
      });
      document.getElementById("btn_copy_script").addEventListener("click", () => {
        const txt = document.getElementById("txt_exported_script").value;
        copyToClipboard(txt, "Exported Shell Script");
      });
      document.getElementById("btn_download_script").addEventListener("click", downloadStandaloneScript);

      document.getElementById("btn_modal_shortcuts_close").addEventListener("click", () => {
        document.getElementById("modal_shortcuts").classList.remove("show");
      });
      document.getElementById("btn_modal_shortcuts_close_x").addEventListener("click", () => {
        document.getElementById("modal_shortcuts").classList.remove("show");
      });
      document.getElementById("btn_modal_guide_close").addEventListener("click", () => {
        document.getElementById("modal_user_guide").classList.remove("show");
      });
      document.getElementById("btn_modal_guide_close_x").addEventListener("click", () => {
        document.getElementById("modal_user_guide").classList.remove("show");
      });

      logMessage("⚡ Subprocess Pipe Pro Enterprise Workstation ready.", "success");
    });
  </script>
</body>
</html>`;
}

/**
 * Starts the Subprocess Pipe Pro HTTP server.
 */
export function startSubprocessPipeStudioServer(options: ServerOptions = {}) {
  const port = options.port ?? 9095;
  const hostname = options.host ?? "127.0.0.1";
  const library = new PipelineLibrary();

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // Local loopback guard
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Root HTML Application Shell
      if (pathname === "/" || pathname === "/index.html") {
        return new Response(generateSubprocessPipeStudioHtml(), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...corsHeaders,
          },
        });
      }

      // Health Check
      if (pathname === "/api/health") {
        return Response.json({
          status: "ok",
          app: "subprocess_pipe_studio",
          name: "Subprocess Pipe Pro",
          timestamp: Date.now(),
        }, { headers: corsHeaders });
      }

      // Presets List
      if (pathname === "/api/presets") {
        const presets = getDefaultPipelinePresets();
        return Response.json(presets, { headers: corsHeaders });
      }

      // Pipelines List
      if (pathname === "/api/pipelines" && req.method === "GET") {
        const pipelines = library.listPipelines();
        return Response.json(pipelines, { headers: corsHeaders });
      }

      // Load Single Pipeline
      if (pathname.startsWith("/api/pipelines/") && req.method === "GET") {
        const id = pathname.replace("/api/pipelines/", "");
        const pipeline = library.getPipeline(id);
        if (!pipeline) {
          return Response.json({ error: "Pipeline not found" }, { status: 404, headers: corsHeaders });
        }
        return Response.json(pipeline, { headers: corsHeaders });
      }

      // Save Pipeline
      if (pathname === "/api/pipelines/save" && req.method === "POST") {
        try {
          const body: any = await req.json();
          const saved = library.savePipeline(body);
          return Response.json(saved, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Save As New Pipeline
      if (pathname === "/api/pipelines/save-as" && req.method === "POST") {
        try {
          const body: any = await req.json();
          if (!body.id) body.id = "pipeline_" + Date.now();
          library.savePipeline(body);
          return Response.json(body, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Delete Pipeline
      if (pathname.startsWith("/api/pipelines/") && req.method === "DELETE") {
        const id = pathname.replace("/api/pipelines/", "");
        const deleted = library.deletePipeline(id);
        return Response.json({ success: deleted }, { headers: corsHeaders });
      }

      // Export Library JSON
      if (pathname === "/api/pipelines/export") {
        const json = library.exportJson();
        return Response.json({ json }, { headers: corsHeaders });
      }

      // Import Library JSON
      if (pathname === "/api/pipelines/import" && req.method === "POST") {
        try {
          const body: any = await req.json();
          const count = library.importJson(body.json);
          return Response.json({ success: true, importedCount: count }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Execute Full Pipeline
      if (pathname === "/api/execute/full" && req.method === "POST") {
        try {
          const body: any = await req.json();
          const stages: SubprocessStage[] = body.stages || [];
          const mode = body.mode || "piped";
          const initialStdin = body.initialStdin || "";
          const sudoPassword = body.sudoPassword || "";

          const report = await executePipeline(stages, initialStdin, {
            mode,
            sudoPassword: sudoPassword || undefined,
          });

          return Response.json({ success: true, report }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Execute Single Stage
      if (pathname === "/api/execute/stage" && req.method === "POST") {
        try {
          const body: any = await req.json();
          const stage: SubprocessStage = body.stage;
          const stdinPayload: string = body.stdinPayload || "";
          const sudoPassword: string = body.sudoPassword || "";

          const result = await executePipelineStage(stage, stdinPayload, {
            sudoPassword: sudoPassword || undefined,
            elevationMode: stage.runWithSudo ? "askpass" : "disabled",
          });
          return Response.json({ success: true, result }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Export Bash Script
      if (pathname === "/api/script/export" && req.method === "POST") {
        try {
          const body: any = await req.json();
          const stages: SubprocessStage[] = body.stages || [];
          const mode = body.mode || "piped";
          const initialStdin = body.initialStdin || "";

          const script = generateShellScript(stages, { mode, initialStdin });
          const oneLiner = generatePipelineShellCommand(stages, { mode, initialStdin });
          return Response.json({ success: true, script, oneLiner }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 400, headers: corsHeaders });
        }
      }

      // Sudo Status & Preflight
      if (pathname === "/api/sudo/status" || pathname === "/api/sudo/preflight") {
        try {
          const status = await checkSudoPreflight();
          return Response.json(status, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      // Sudo Authentication & Session Verification
      if (pathname === "/api/sudo/auth" && req.method === "POST") {
        try {
          const body: any = await req.json();
          const password = (body.password || "").trim();
          if (!password) {
            return Response.json({ success: false, error: "Password cannot be empty" }, { status: 400, headers: corsHeaders });
          }

          const isValid = await withAskpass(password, async (_askpassPath, extraEnv) => {
            const proc = Bun.spawn(["sudo", "-A", "-v"], {
              env: { ...process.env, ...extraEnv },
              stdout: "ignore",
              stderr: "pipe",
            });
            const exitCode = await proc.exited;
            return exitCode === 0;
          });

          return Response.json({ success: isValid, isCached: isValid }, { headers: corsHeaders });
        } catch (err: any) {
          return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
        }
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

// Standalone CLI invocation
// @ts-ignore: import.meta is available in Bun
if (import.meta.main) {
  const port = parseInt(process.env.PORT || "9095", 10);
  const server = startSubprocessPipeStudioServer({ port });
  console.log(`⚡ Subprocess Pipe Pro Server running at: http://${server.hostname}:${server.port}`);
}
