/**
 * Step 2 & Step 3: Visual Theme Studio UI, Theme Customizer Drawer, and Live Preview Playground
 *
 * Provides:
 * 1. `mountThemeStudio(rootContainer, options)`: Programmatic DOM controller that mounts the
 *    Theme Customizer Drawer (Quick Studio + Pro Inspector) and Live Preview Playground into any DOM element.
 * 2. `generateThemeStudioStyles()`: Complete CSS stylesheet driven by the Layer 3 `:root` custom properties.
 * 3. `generateThemeStudioHtml()`: Standalone full-page HTML application with inline interactive engine.
 */

import {
  applyThemeToRoot,
  calculateThemeSystem,
  DEFAULT_SURFACE_CONFIG,
  getCatalogByCategory,
  normalizeHex,
  SHADE_STEPS_10,
  THEME_VARIABLE_CATALOG,
} from "./mathEngine";
import {
  deleteSavedTheme,
  exportThemeToJson,
  importThemeFromJson,
  loadActiveStudioState,
  loadSavedThemes,
  saveActiveStudioState,
  saveCustomTheme,
  type StorageLike,
} from "./persistence";
import { getThemePresetById, THEME_STUDIO_PRESETS } from "./presets";
import {
  type BaseMode,
  type CalculatedThemeSystem,
  INSPECTOR_CATEGORIES,
  type InspectorCategory,
  type InterfaceDensity,
  type SavedThemeDocument,
  type SurfaceVibe,
  type ThemeSurfaceConfig,
} from "./types";

export interface ThemeStudioMountOptions {
  initialSurface?: Partial<ThemeSurfaceConfig>;
  initialOverrides?: Record<string, string>;
  initialThemeName?: string;
  storage?: StorageLike;
  /** Target element where `--*` variables are written (defaults to `document.documentElement`). */
  cssRoot?: HTMLElement;
  onChange?: (system: CalculatedThemeSystem) => void;
}

export interface ThemeStudioController {
  getState: () => {
    name: string;
    activeTab: "quick" | "inspector";
    drawerOpen: boolean;
    surface: ThemeSurfaceConfig;
    overrides: Record<string, string>;
    system: CalculatedThemeSystem;
    savedThemes: SavedThemeDocument[];
  };
  setSurface: (patch: Partial<ThemeSurfaceConfig>) => CalculatedThemeSystem;
  setOverride: (variableName: string, value: string) => CalculatedThemeSystem;
  removeOverride: (variableName: string) => CalculatedThemeSystem;
  clearAllOverrides: () => CalculatedThemeSystem;
  applyPreset: (presetId: string) => CalculatedThemeSystem;
  switchTab: (tab: "quick" | "inspector") => void;
  toggleDrawer: (open?: boolean) => void;
  saveCurrentTheme: (customName?: string) => SavedThemeDocument;
  loadSavedThemeById: (id: string) => CalculatedThemeSystem | null;
  deleteSavedThemeById: (id: string) => SavedThemeDocument[];
  exportJson: () => string;
  importJson: (jsonString: string) => CalculatedThemeSystem;
}

/**
 * Generates the semantic CSS stylesheet that consumes the Layer 3 CSS Custom Properties.
 * Incorporates modern CSS best practices:
 * - `color-scheme` and `accent-color` for native browser UI theming (`browser-ui-theming`)
 * - `:user-invalid` / `:user-valid` for non-hostile form validation (`browser-ui-theming`)
 * - `scrollbar-color` and `scrollbar-width` with `@supports not (scrollbar-color: auto)` fallback (`customize-scrollbar-color-and-thickness`)
 */
export function generateThemeStudioStyles(): string {
  return `
*, *::before, *::after {
  box-sizing: border-box;
}

:root {
  color-scheme: var(--theme-color-scheme, dark);
  accent-color: var(--accent-color, #8b5cf6);
}

::selection {
  background: var(--primary-color, #3b82f6);
  color: var(--text-on-primary, #ffffff);
}

html, body {
  margin: 0;
  padding: 0;
  min-height: 100vh;
  background-color: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  -webkit-font-smoothing: antialiased;
}

/* Standard scrollbar properties per modern-web-guidance */
.ts-scrollable,
.ts-drawer-body,
.ts-code-pre,
.ts-table-wrap {
  scrollbar-width: var(--scrollbar-width-keyword, thin);
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

@supports not (scrollbar-color: auto) {
  .ts-scrollable::-webkit-scrollbar,
  .ts-drawer-body::-webkit-scrollbar,
  .ts-code-pre::-webkit-scrollbar,
  .ts-table-wrap::-webkit-scrollbar {
    width: var(--scrollbar-width, 8px);
    height: var(--scrollbar-width, 8px);
  }
  .ts-scrollable::-webkit-scrollbar-thumb,
  .ts-drawer-body::-webkit-scrollbar-thumb,
  .ts-code-pre::-webkit-scrollbar-thumb,
  .ts-table-wrap::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: var(--radius-pill);
  }
  .ts-scrollable::-webkit-scrollbar-thumb:hover,
  .ts-drawer-body::-webkit-scrollbar-thumb:hover,
  .ts-code-pre::-webkit-scrollbar-thumb:hover,
  .ts-table-wrap::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }
  .ts-scrollable::-webkit-scrollbar-track,
  .ts-drawer-body::-webkit-scrollbar-track,
  .ts-code-pre::-webkit-scrollbar-track,
  .ts-table-wrap::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
}

/* App Shell Layout */
.ts-app-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 430px;
  min-height: 100vh;
  background:
    radial-gradient(900px circle at 10% 0%, color-mix(in srgb, var(--primary-color) 11%, transparent), transparent 65%),
    radial-gradient(800px circle at 90% 100%, color-mix(in srgb, var(--accent-color) 10%, transparent), transparent 65%),
    var(--bg-app);
  transition: grid-template-columns 0.22s ease;
}

.ts-app-shell[data-drawer-open="false"] {
  grid-template-columns: minmax(0, 1fr) 0px;
}

@media (max-width: 1080px) {
  .ts-app-shell {
    grid-template-columns: 1fr;
  }
  .ts-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(440px, 94vw);
    z-index: 60;
  }
}

/* Top Workspace Header */
.ts-playground-main {
  display: flex;
  flex-direction: column;
  gap: var(--density-gap-lg);
  padding: var(--density-gap-xl);
  overflow-x: hidden;
}

.ts-topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--density-gap-md);
  padding: var(--density-panel-padding);
  background: var(--bg-panel);
  backdrop-filter: var(--surface-backdrop);
  -webkit-backdrop-filter: var(--surface-backdrop);
  border: var(--border-width) solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.ts-brand-cluster {
  display: flex;
  align-items: center;
  gap: var(--density-gap-md);
}

.ts-brand-orb {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
  box-shadow: var(--shadow-glow);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-on-primary);
  font-weight: 800;
  font-size: var(--font-size-lg);
  user-select: none;
}

.ts-title-stack h1 {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}

.ts-title-stack p {
  margin: 2px 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.ts-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--density-gap-sm);
}

/* Panels & Cards */
.ts-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--density-gap-lg);
}

.ts-panel {
  background: var(--bg-panel);
  backdrop-filter: var(--surface-backdrop);
  -webkit-backdrop-filter: var(--surface-backdrop);
  border: var(--border-width) solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--density-panel-padding);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--density-gap-md);
}

.ts-panel-elevated {
  background: var(--bg-elevated);
  box-shadow: var(--shadow-elevated);
  border-color: var(--border-strong);
}

.ts-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--density-gap-sm);
  border-bottom: var(--border-width) solid var(--border-subtle);
  padding-bottom: var(--density-gap-sm);
}

.ts-panel-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: 650;
  color: var(--text-primary);
}

.ts-panel-subtitle {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

/* Buttons */
.ts-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--density-gap-xs);
  height: var(--btn-height);
  padding: 0 var(--btn-padding-x);
  border-radius: var(--btn-radius);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 600;
  border: var(--border-width) solid transparent;
  cursor: pointer;
  transition: background-color 0.14s ease, border-color 0.14s ease, transform 0.1s ease, box-shadow 0.14s ease;
  user-select: none;
  white-space: nowrap;
}

.ts-btn:focus-visible {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: var(--focus-ring);
}

.ts-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.ts-btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border-color: var(--btn-primary-border);
  box-shadow: var(--shadow-xs);
}
.ts-btn-primary:hover:not(:disabled) {
  background: var(--btn-primary-hover);
}
.ts-btn-primary:active:not(:disabled) {
  background: var(--btn-primary-active);
}

.ts-btn-accent {
  background: var(--btn-accent-bg);
  color: var(--btn-accent-text);
  border-color: var(--btn-accent-bg);
  box-shadow: var(--shadow-xs);
}
.ts-btn-accent:hover:not(:disabled) {
  background: var(--btn-accent-hover);
}
.ts-btn-accent:active:not(:disabled) {
  background: var(--btn-accent-active);
}

.ts-btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  border-color: var(--btn-secondary-border);
}
.ts-btn-secondary:hover:not(:disabled) {
  background: var(--btn-secondary-hover);
  border-color: var(--border-strong);
}
.ts-btn-secondary:active:not(:disabled) {
  background: var(--btn-secondary-active);
}

.ts-btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: transparent;
}
.ts-btn-ghost:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.ts-btn-danger {
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border-color: var(--status-danger-border);
}
.ts-btn-danger:hover:not(:disabled) {
  filter: brightness(1.08);
}

.ts-btn:disabled,
.ts-btn[disabled] {
  background: var(--btn-disabled-bg);
  color: var(--btn-disabled-text);
  border-color: var(--border-subtle);
  cursor: not-allowed;
  box-shadow: none;
  opacity: 0.72;
}

.ts-btn-sm {
  height: var(--density-control-sm);
  padding: 0 var(--density-pad-x-sm);
  font-size: var(--font-size-xs);
}

/* Inputs, Selects & Textareas */
.ts-input,
.ts-select,
.ts-textarea {
  width: 100%;
  height: var(--input-height);
  padding: 0 var(--input-padding-x);
  background: var(--input-bg);
  color: var(--input-text);
  border: var(--border-width) solid var(--input-border);
  border-radius: var(--input-radius);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  transition: border-color 0.14s ease, box-shadow 0.14s ease, background-color 0.14s ease;
}

.ts-textarea {
  height: auto;
  min-height: 76px;
  padding: var(--density-pad-y-md) var(--input-padding-x);
  resize: vertical;
}

.ts-input::placeholder,
.ts-textarea::placeholder {
  color: var(--input-placeholder);
}

.ts-input:hover:not(:disabled),
.ts-select:hover:not(:disabled),
.ts-textarea:hover:not(:disabled) {
  background: var(--input-hover-bg);
  border-color: var(--input-hover-border);
}

.ts-input:focus,
.ts-select:focus,
.ts-textarea:focus {
  outline: none;
  background: var(--input-focus-bg);
  border-color: var(--input-focus-border);
  box-shadow: var(--input-focus-ring);
}

/* Use :user-invalid and :user-valid per modern-web-guidance */
.ts-input:user-invalid {
  border-color: var(--text-danger);
  box-shadow: 0 0 0 3px var(--status-danger-bg);
}

.ts-input:user-valid {
  border-color: var(--text-success);
}

.ts-input:disabled,
.ts-select:disabled,
.ts-textarea:disabled {
  background: var(--input-disabled-bg);
  color: var(--input-disabled-text);
  cursor: not-allowed;
}

.ts-field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.ts-check-label {
  display: inline-flex;
  align-items: center;
  gap: var(--density-gap-xs);
  padding: var(--density-pad-y-sm) var(--density-pad-x-sm);
  border-radius: var(--radius-sm);
  border: var(--border-width) solid var(--border-subtle);
  background: var(--bg-surface);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  cursor: pointer;
}

.ts-check-label:has(:checked) {
  background: var(--bg-selected);
  border-color: var(--primary-color);
  color: var(--text-primary);
}

/* Status Badges */
.ts-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: 600;
  border: 1px solid transparent;
  user-select: none;
}

.ts-badge-success {
  background: var(--status-success-bg);
  color: var(--status-success-text);
  border-color: var(--status-success-border);
}

.ts-badge-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning-text);
  border-color: var(--status-warning-border);
}

.ts-badge-danger {
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border-color: var(--status-danger-border);
}

.ts-badge-info {
  background: var(--status-info-bg);
  color: var(--status-info-text);
  border-color: var(--status-info-border);
}

.ts-badge-neutral {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-color: var(--border-subtle);
}

/* Tabs */
.ts-tabs-bar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--bg-surface);
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.ts-tab-btn {
  padding: var(--density-pad-y-sm) var(--density-pad-x-md);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.14s ease;
  user-select: none;
}

.ts-tab-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.ts-tab-btn[aria-selected="true"] {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  box-shadow: var(--shadow-xs);
}

/* Data Table */
.ts-table-wrap {
  overflow-x: auto;
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
}

.ts-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: var(--font-size-sm);
}

.ts-table th {
  padding: var(--density-table-cell-padding);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: var(--border-width) solid var(--border-default);
}

.ts-table td {
  padding: var(--density-table-cell-padding);
  border-bottom: var(--border-width) solid var(--border-subtle);
  color: var(--text-primary);
}

.ts-table tbody tr {
  transition: background-color 0.12s ease;
  cursor: pointer;
}

.ts-table tbody tr:hover {
  background: var(--bg-hover);
}

.ts-table tbody tr[data-selected="true"] {
  background: var(--bg-selected);
}

/* 10-Step Shade Strip */
.ts-shade-grid {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 6px;
}

.ts-shade-swatch {
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  padding: 10px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  box-shadow: var(--shadow-xs);
}

/* Code & Terminal Preview */
.ts-code-pre {
  margin: 0;
  padding: var(--density-panel-padding);
  background: var(--code-bg);
  color: var(--code-text);
  border: var(--border-width) solid var(--code-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  line-height: 1.55;
  overflow-x: auto;
}

.ts-tok-kw { color: var(--code-keyword); font-weight: 600; }
.ts-tok-fn { color: var(--code-function); }
.ts-tok-str { color: var(--code-string); }
.ts-tok-num { color: var(--code-number); }
.ts-tok-cmt { color: var(--code-comment); font-style: italic; }

.ts-terminal-box {
  padding: var(--density-panel-padding);
  background: var(--terminal-bg);
  color: var(--terminal-text);
  border: var(--border-width) solid var(--code-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.ts-terminal-cursor {
  display: inline-block;
  width: 8px;
  height: 14px;
  vertical-align: middle;
  background: var(--terminal-cursor);
}

/* Theme Customizer Drawer (Right Panel) */
.ts-drawer {
  background: var(--bg-panel);
  backdrop-filter: var(--surface-backdrop);
  -webkit-backdrop-filter: var(--surface-backdrop);
  border-left: var(--border-width) solid var(--border-default);
  box-shadow: var(--shadow-elevated);
  display: flex;
  flex-direction: column;
  height: 100vh;
  position: sticky;
  top: 0;
  overflow: hidden;
}

.ts-app-shell[data-drawer-open="false"] .ts-drawer {
  display: none;
}

.ts-drawer-header {
  padding: var(--density-panel-padding);
  border-bottom: var(--border-width) solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: var(--density-gap-sm);
}

.ts-drawer-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  background: var(--bg-surface);
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.ts-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--density-panel-padding);
  display: flex;
  flex-direction: column;
  gap: var(--density-gap-md);
}

.ts-drawer-footer {
  padding: var(--density-gap-md) var(--density-panel-padding);
  border-top: var(--border-width) solid var(--border-subtle);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  gap: var(--density-gap-sm);
}

/* Segmented Option Pills for Surface Controls */
.ts-segmented-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.ts-segmented-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.ts-seg-btn {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: var(--border-width) solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: all 0.14s ease;
}

.ts-seg-btn:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--bg-hover);
}

.ts-seg-btn[data-active="true"] {
  background: var(--bg-selected);
  border-color: var(--primary-color);
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px var(--primary-color);
}

/* Color Picker Row */
.ts-color-picker-row {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 8px;
  align-items: center;
}

.ts-color-swatch-input {
  width: 42px;
  height: var(--input-height);
  padding: 2px;
  border-radius: var(--input-radius);
  border: var(--border-width) solid var(--input-border);
  background: var(--input-bg);
  cursor: pointer;
}

/* Preset Cards */
.ts-preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ts-preset-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px;
  border-radius: var(--radius-md);
  border: var(--border-width) solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: all 0.14s ease;
}

.ts-preset-card:hover {
  border-color: var(--primary-color);
  background: var(--bg-hover);
}

.ts-preset-card[data-active="true"] {
  border-color: var(--primary-color);
  background: var(--bg-selected);
  box-shadow: var(--shadow-xs);
}

.ts-preset-dots {
  display: flex;
  align-items: center;
  gap: 5px;
}

.ts-preset-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

/* Pro Inspector Accordion */
.ts-accordion-item {
  border: var(--border-width) solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  overflow: hidden;
}

.ts-accordion-summary {
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 650;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.ts-accordion-summary:hover {
  background: var(--bg-hover);
}

.ts-accordion-body {
  padding: 10px 12px;
  border-top: var(--border-width) solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--bg-panel);
}

.ts-var-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--border-subtle);
}

.ts-var-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.ts-var-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.ts-var-code {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-link);
}

.ts-var-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Modal Dialog Overlay */
.ts-modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}

.ts-modal-backdrop[hidden] {
  display: none !important;
}

.ts-modal-dialog {
  width: min(560px, 95vw);
  background: var(--bg-elevated);
  color: var(--text-primary);
  border: var(--border-width) solid var(--border-strong);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-modal);
  padding: var(--density-panel-padding);
  display: flex;
  flex-direction: column;
  gap: var(--density-gap-md);
}

:root[data-platform="linux"] .ts-topbar,
:root[data-platform="linux"] .ts-panel,
:root[data-platform="linux"] .ts-preview-navbar,
:root[data-platform="linux"] .ts-modal-backdrop,
:root[data-platform="windows"] .ts-topbar,
:root[data-platform="windows"] .ts-panel,
:root[data-platform="windows"] .ts-preview-navbar,
:root[data-platform="windows"] .ts-modal-backdrop,
html.rad-linux .ts-topbar,
html.rad-linux .ts-panel,
html.rad-linux .ts-preview-navbar,
html.rad-linux .ts-modal-backdrop,
html.rad-windows .ts-topbar,
html.rad-windows .ts-panel,
html.rad-windows .ts-preview-navbar,
html.rad-windows .ts-modal-backdrop {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
`.trim();
}

function isSimpleHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

/**
 * Mounts the complete Visual Theme Studio & Live Preview Playground inside `container`.
 */
export function mountThemeStudio(
  container: HTMLElement,
  options: ThemeStudioMountOptions = {}
): ThemeStudioController {
  const doc = container.ownerDocument;
  const cssRoot = options.cssRoot ?? doc.documentElement;
  const persisted = loadActiveStudioState(options.storage);

  let currentName =
    options.initialThemeName ?? persisted?.name ?? "Obsidian Glass";
  let activePresetId: string | null = persisted?.activePresetId ?? "obsidian-glass";
  let activeTab: "quick" | "inspector" = "quick";
  let drawerOpen = true;
  let activePlaygroundTab: "components" | "data" | "code" = "components";
  let inspectorFilter = "";
  const expandedCategories = new Set<InspectorCategory>(["Backgrounds", "Typography"]);

  let surface: ThemeSurfaceConfig = {
    ...DEFAULT_SURFACE_CONFIG,
    ...(persisted?.surface ?? {}),
    ...(options.initialSurface ?? {}),
  };

  let overrides: Record<string, string> = {
    ...(persisted?.overrides ?? {}),
    ...(options.initialOverrides ?? {}),
  };

  let system = applyThemeToRoot(surface, overrides, cssRoot);

  // Inject styles into document head if not already present
  if (!doc.getElementById("bun-rad-theme-studio-styles")) {
    const styleEl = doc.createElement("style");
    styleEl.id = "bun-rad-theme-studio-styles";
    styleEl.textContent = generateThemeStudioStyles();
    doc.head.appendChild(styleEl);
  }

  // Build Shell Markup
  container.innerHTML = `
    <div class="ts-app-shell" id="tsAppShell" data-drawer-open="true">
      <!-- Left: Live Preview Playground -->
      <main class="ts-playground-main" id="tsPlaygroundMain">
        <!-- Header Bar -->
        <header class="ts-topbar">
          <div class="ts-brand-cluster">
            <div class="ts-brand-orb" aria-hidden="true">⚡</div>
            <div class="ts-title-stack">
              <h1>Visual Theme Studio &amp; Smart Math Engine</h1>
              <p id="tsHeaderSummary">3-Layer Architecture • Real-Time :root CSS Custom Properties • WCAG Auto-Contrast</p>
            </div>
          </div>
          <div class="ts-toolbar-actions">
            <span class="ts-badge ts-badge-info" id="tsContrastBadge">Contrast: --</span>
            <span class="ts-badge ts-badge-neutral" id="tsOverrideCountBadge">0 Overrides</span>
            <button type="button" class="ts-btn ts-btn-secondary" id="btnOpenJsonModal">⇄ Export / Import JSON</button>
            <button type="button" class="ts-btn ts-btn-secondary" id="btnOpenLiveModal">❐ Preview Modal</button>
            <button type="button" class="ts-btn ts-btn-primary" id="btnToggleDrawer">⚙ Toggle Studio Drawer</button>
          </div>
        </header>

        <!-- Playground Interactive View Tabs -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div class="ts-tabs-bar" role="tablist" aria-label="Playground Preview Sections">
            <button type="button" class="ts-tab-btn" role="tab" id="pgTabAll" data-pg-tab="components" aria-selected="true">All Components</button>
            <button type="button" class="ts-tab-btn" role="tab" id="pgTabData" data-pg-tab="data" aria-selected="false">Tables &amp; Badges</button>
            <button type="button" class="ts-tab-btn" role="tab" id="pgTabCode" data-pg-tab="code" aria-selected="false">10-Step Scale &amp; Code</button>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;" id="tsStatusBadgesStrip">
            <span class="ts-badge ts-badge-success">● System Healthy</span>
            <span class="ts-badge ts-badge-warning">▲ Latency 42ms</span>
            <span class="ts-badge ts-badge-danger">✖ 2 Build Alerts</span>
            <span class="ts-badge ts-badge-info">ℹ v1.4.9 Active</span>
          </div>
        </div>

        <!-- Section 1: Buttons & Interactive States + Form Inputs -->
        <div class="ts-grid-2" id="pgSectionComponents">
          <!-- Interactive Buttons Card -->
          <section class="ts-panel" aria-labelledby="headingButtons">
            <div class="ts-panel-header">
              <div>
                <h2 class="ts-panel-title" id="headingButtons">Interactive Buttons &amp; States</h2>
                <p class="ts-panel-subtitle">Auto-computed hover, active, focus-ring, and WCAG on-color tokens</p>
              </div>
              <span class="ts-badge ts-badge-info" id="tsBtnContrastReadout">AA Pass</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:var(--density-gap-sm);">
              <button type="button" class="ts-btn ts-btn-primary" id="previewBtnPrimary">Primary Action</button>
              <button type="button" class="ts-btn ts-btn-accent" id="previewBtnAccent">Accent CTA</button>
              <button type="button" class="ts-btn ts-btn-secondary" id="previewBtnSecondary">Secondary</button>
              <button type="button" class="ts-btn ts-btn-ghost" id="previewBtnGhost">Ghost Button</button>
              <button type="button" class="ts-btn ts-btn-danger" id="previewBtnDanger">Destructive</button>
              <button type="button" class="ts-btn ts-btn-primary" id="previewBtnDisabled" disabled>Disabled</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; padding-top:6px;">
              <div class="ts-field-label">
                <span>Inline Modal &amp; Surface Elevation Preview</span>
                <span id="tsVibeReadout" style="font-family:var(--font-mono);">frosted-glass</span>
              </div>
              <div class="ts-panel ts-panel-elevated" style="padding:var(--density-gap-md);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                  <strong>Elevated Dialog Card (--shadow-elevated)</strong>
                  <span class="ts-badge ts-badge-success">Live Surface</span>
                </div>
                <p style="margin:4px 0 0; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  Reacts immediately to Surface Vibe (Flat, Frosted Glass, Matte, Neon Border), Corner Sharpness, and Density.
                </p>
              </div>
            </div>
          </section>

          <!-- Form Controls & Inputs Card -->
          <section class="ts-panel" aria-labelledby="headingInputs">
            <div class="ts-panel-header">
              <div>
                <h2 class="ts-panel-title" id="headingInputs">Form Controls &amp; Validation</h2>
                <p class="ts-panel-subtitle">Themed inputs, native accent-color controls, and focus halos</p>
              </div>
              <span class="ts-badge ts-badge-neutral">Inputs</span>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--density-gap-sm);">
              <div>
                <label class="ts-field-label" for="previewInputName">Workspace Name</label>
                <input id="previewInputName" class="ts-input" type="text" value="Apollo Design System" placeholder="Enter workspace name..." />
              </div>
              <div>
                <label class="ts-field-label" for="previewSelectEnv">Target Environment</label>
                <select id="previewSelectEnv" class="ts-select">
                  <option value="prod">Production Cluster (US-East)</option>
                  <option value="staging">Staging Canary</option>
                  <option value="dev">Local Dev Sandbox</option>
                </select>
              </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--density-gap-sm);">
              <div>
                <label class="ts-field-label" for="previewInputEmail">Contact Email (:user-valid)</label>
                <input id="previewInputEmail" class="ts-input" type="email" value="architect@bunrad.dev" required placeholder="name@domain.com" />
              </div>
              <div>
                <label class="ts-field-label" for="previewInputDisabled">Read-Only Token</label>
                <input id="previewInputDisabled" class="ts-input" type="text" value="tok_live_98a7f6d5e4" disabled />
              </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:var(--density-gap-sm); align-items:center;">
              <label class="ts-check-label">
                <input type="checkbox" id="previewCheckAutoContrast" checked />
                <span>WCAG Auto-Contrast</span>
              </label>
              <label class="ts-check-label">
                <input type="checkbox" id="previewCheckGpuBlur" checked />
                <span>GPU Backdrop Filter</span>
              </label>
              <label class="ts-check-label">
                <input type="radio" name="previewRadioTier" id="previewRadioPro" checked />
                <span>Enterprise Tier</span>
              </label>
            </div>
          </section>
        </div>

        <!-- Section 2: Interactive Data Table & Status Badges -->
        <section class="ts-panel" id="pgSectionData" aria-labelledby="headingTable">
          <div class="ts-panel-header">
            <div>
              <h2 class="ts-panel-title" id="headingTable">Live Tokenized Data Table</h2>
              <p class="ts-panel-subtitle">Click any row to test selection state (--bg-selected) and hover highlights (--bg-hover)</p>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <span class="ts-badge ts-badge-success">4 Services Online</span>
              <span class="ts-badge ts-badge-warning">1 Degraded</span>
            </div>
          </div>
          <div class="ts-table-wrap">
            <table class="ts-table" id="previewDataTable">
              <thead>
                <tr>
                  <th>Service Node</th>
                  <th>Region</th>
                  <th>Surface Token</th>
                  <th>P95 Latency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr data-selected="true">
                  <td><strong>theme-math-engine-01</strong></td>
                  <td>us-east-va</td>
                  <td><code>--bg-selected</code></td>
                  <td>0.4 ms</td>
                  <td><span class="ts-badge ts-badge-success">Healthy</span></td>
                </tr>
                <tr>
                  <td><strong>token-compiler-edge</strong></td>
                  <td>eu-central-fra</td>
                  <td><code>--bg-panel</code></td>
                  <td>1.2 ms</td>
                  <td><span class="ts-badge ts-badge-info">Syncing</span></td>
                </tr>
                <tr>
                  <td><strong>wcag-contrast-auditor</strong></td>
                  <td>ap-northeast-tyo</td>
                  <td><code>--text-primary</code></td>
                  <td>18.7 ms</td>
                  <td><span class="ts-badge ts-badge-warning">Elevated Load</span></td>
                </tr>
                <tr>
                  <td><strong>legacy-stylesheet-proxy</strong></td>
                  <td>us-west-sfo</td>
                  <td><code>--status-danger-bg</code></td>
                  <td>142.0 ms</td>
                  <td><span class="ts-badge ts-badge-danger">Deprecated</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Section 3: 10-Step Shade Scale & Code / Terminal Preview -->
        <div class="ts-grid-2" id="pgSectionCode">
          <section class="ts-panel" aria-labelledby="headingShades">
            <div class="ts-panel-header">
              <div>
                <h2 class="ts-panel-title" id="headingShades">Auto-Generated 10-Step Shade Scale (50–950)</h2>
                <p class="ts-panel-subtitle">Derived from Base Mode + Primary Brand Color hue &amp; saturation</p>
              </div>
              <span class="ts-badge ts-badge-neutral" id="tsBaseModeBadge">dark</span>
            </div>
            <div class="ts-shade-grid" id="tsShadeScaleGrid"></div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <span class="ts-field-label">Terminal Output &amp; Custom Scrollbar Viewport</span>
              <div class="ts-terminal-box ts-scrollable" style="max-height:110px; overflow-y:auto;" id="previewTerminalBox">
                <div>$ bun run theme:compile --mode=<span id="termModeVal">dark</span> --vibe=<span id="termVibeVal">frosted-glass</span></div>
                <div style="color:var(--text-success);">✔ Generated 10-step neutral, primary &amp; accent shade scales (50..950)</div>
                <div style="color:var(--text-info);">ℹ Verified WCAG contrast ratio: <span id="termContrastVal">14.2:1</span> on panel surface</div>
                <div>✔ Applied <span id="termVarCount">112</span> CSS custom properties to :root in 0.2ms<span class="ts-terminal-cursor"></span></div>
              </div>
            </div>
          </section>

          <section class="ts-panel" aria-labelledby="headingCode">
            <div class="ts-panel-header">
              <div>
                <h2 class="ts-panel-title" id="headingCode">Live :root CSS Variables Stream</h2>
                <p class="ts-panel-subtitle">Real-time semantic output applied to document.documentElement</p>
              </div>
              <button type="button" class="ts-btn ts-btn-secondary ts-btn-sm" id="btnCopyRootCss">📋 Copy :root CSS</button>
            </div>
            <pre class="ts-code-pre" id="previewCodeBlock" style="max-height:210px; overflow:auto;"></pre>
          </section>
        </div>
      </main>

      <!-- Right: Theme Customizer Drawer -->
      <aside class="ts-drawer" id="tsCustomizerDrawer" aria-label="Theme Customizer Drawer">
        <div class="ts-drawer-header">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div>
              <strong style="font-size:var(--font-size-base);">Theme Customizer Drawer</strong>
              <div style="font-size:var(--font-size-xs); color:var(--text-muted);" id="tsActiveThemeLabel">Active: Obsidian Glass</div>
            </div>
            <button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="btnResetAllOverrides" title="Reset all deep overrides">↺ Reset</button>
          </div>
          <!-- Two Drawer Tabs: Tab 1 "Quick Studio" & Tab 2 "Pro Inspector" -->
          <div class="ts-drawer-tabs" role="tablist" aria-label="Theme Studio Modes">
            <button type="button" class="ts-tab-btn" role="tab" id="tabBtnQuickStudio" data-studio-tab="quick" aria-selected="true">
              ⚡ Quick Studio
            </button>
            <button type="button" class="ts-tab-btn" role="tab" id="tabBtnProInspector" data-studio-tab="inspector" aria-selected="false">
              🎛 Pro Inspector
            </button>
          </div>
        </div>

        <!-- Tab 1 Body: Quick Studio (Default) -->
        <div class="ts-drawer-body" id="tabPanelQuickStudio" role="tabpanel" aria-labelledby="tabBtnQuickStudio">
          <!-- One-Click Presets -->
          <div>
            <div class="ts-field-label">
              <span>One-Click Pro Presets</span>
              <span>8 Curated</span>
            </div>
            <div class="ts-preset-grid" id="tsPresetGrid"></div>
          </div>

          <!-- Control 1: Base Mode -->
          <div>
            <div class="ts-field-label">
              <span>1. Base Mode</span>
              <code id="lblBaseModeVal" style="font-family:var(--font-mono);">dark</code>
            </div>
            <div class="ts-segmented-grid" id="ctrlBaseModeGroup">
              <button type="button" class="ts-seg-btn" data-base-mode="light">☀ Light</button>
              <button type="button" class="ts-seg-btn" data-base-mode="dark">🌙 Dark</button>
              <button type="button" class="ts-seg-btn" data-base-mode="midnight">🌌 Midnight</button>
              <button type="button" class="ts-seg-btn" data-base-mode="high-contrast">◑ High-Contrast</button>
            </div>
          </div>

          <!-- Control 2: Primary Brand Color -->
          <div>
            <label class="ts-field-label" for="ctrlPrimaryColorHex">
              <span>2. Primary Brand Color</span>
              <code id="lblPrimaryColorVal" style="font-family:var(--font-mono);">#3b82f6</code>
            </label>
            <div class="ts-color-picker-row">
              <input type="color" id="ctrlPrimaryColorPicker" class="ts-color-swatch-input" value="#3b82f6" aria-label="Primary Brand Color Picker" />
              <input type="text" id="ctrlPrimaryColorHex" class="ts-input" value="#3b82f6" maxlength="7" aria-label="Primary Brand Color Hex" />
            </div>
          </div>

          <!-- Control 3: Accent / Action Color -->
          <div>
            <label class="ts-field-label" for="ctrlAccentColorHex">
              <span>3. Accent / Action Color</span>
              <code id="lblAccentColorVal" style="font-family:var(--font-mono);">#8b5cf6</code>
            </label>
            <div class="ts-color-picker-row">
              <input type="color" id="ctrlAccentColorPicker" class="ts-color-swatch-input" value="#8b5cf6" aria-label="Accent Action Color Picker" />
              <input type="text" id="ctrlAccentColorHex" class="ts-input" value="#8b5cf6" maxlength="7" aria-label="Accent Action Color Hex" />
            </div>
          </div>

          <!-- Control 4: Surface Vibe -->
          <div>
            <div class="ts-field-label">
              <span>4. Surface Vibe</span>
              <code id="lblSurfaceVibeVal" style="font-family:var(--font-mono);">frosted-glass</code>
            </div>
            <div class="ts-segmented-grid" id="ctrlSurfaceVibeGroup">
              <button type="button" class="ts-seg-btn" data-surface-vibe="flat">⬜ Flat</button>
              <button type="button" class="ts-seg-btn" data-surface-vibe="frosted-glass">🧊 Frosted Glass</button>
              <button type="button" class="ts-seg-btn" data-surface-vibe="matte">🪨 Matte</button>
              <button type="button" class="ts-seg-btn" data-surface-vibe="neon-border">⚡ Neon Border</button>
            </div>
          </div>

          <!-- Control 5: Corner Sharpness (0px to 24px) -->
          <div>
            <label class="ts-field-label" for="ctrlCornerSharpness">
              <span>5. Corner Sharpness</span>
              <code id="lblCornerSharpnessVal" style="font-family:var(--font-mono);">10px</code>
            </label>
            <input
              type="range"
              id="ctrlCornerSharpness"
              min="0"
              max="24"
              step="1"
              value="10"
              style="width:100%;"
              aria-label="Corner Sharpness Slider (0px sharp to 24px pill-shaped)"
            />
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted);">
              <span>0px Sharp</span>
              <span>8px Rounded</span>
              <span>16px Soft</span>
              <span>24px Pill</span>
            </div>
          </div>

          <!-- Control 6: Interface Density -->
          <div>
            <div class="ts-field-label">
              <span>6. Interface Density</span>
              <code id="lblDensityVal" style="font-family:var(--font-mono);">comfortable</code>
            </div>
            <div class="ts-segmented-grid-3" id="ctrlDensityGroup">
              <button type="button" class="ts-seg-btn" data-density="compact">Compact</button>
              <button type="button" class="ts-seg-btn" data-density="comfortable">Comfortable</button>
              <button type="button" class="ts-seg-btn" data-density="spacious">Spacious</button>
            </div>
          </div>
        </div>

        <!-- Tab 2 Body: Pro Inspector (Deep Override Accordion Tree) -->
        <div class="ts-drawer-body" id="tabPanelProInspector" role="tabpanel" aria-labelledby="tabBtnProInspector" hidden>
          <div>
            <label class="ts-field-label" for="ctrlInspectorSearch">
              <span>Filter Granular CSS Variables</span>
              <span id="lblCatalogCount">${THEME_VARIABLE_CATALOG.length} tokens</span>
            </label>
            <input
              type="search"
              id="ctrlInspectorSearch"
              class="ts-input"
              placeholder="Search --bg-app, --text-primary, --radius..."
            />
          </div>
          <div id="tsInspectorAccordionTree" style="display:flex; flex-direction:column; gap:8px;"></div>
        </div>

        <!-- Drawer Footer: Persistence & LocalStorage Library -->
        <div class="ts-drawer-footer">
          <div style="display:grid; grid-template-columns: 1fr auto; gap:6px;">
            <input
              type="text"
              id="ctrlSaveThemeName"
              class="ts-input"
              value="${currentName}"
              placeholder="Custom theme name..."
              aria-label="Custom theme name"
            />
            <button type="button" class="ts-btn ts-btn-primary" id="btnSaveThemeLocal">💾 Save Theme</button>
          </div>
          <div style="display:grid; grid-template-columns: 1fr auto auto; gap:6px; align-items:center;">
            <select id="ctrlSavedThemesSelect" class="ts-select" aria-label="Saved Custom Themes">
              <option value="">Saved Themes (localStorage)...</option>
            </select>
            <button type="button" class="ts-btn ts-btn-secondary ts-btn-sm" id="btnLoadSavedTheme">Load</button>
            <button type="button" class="ts-btn ts-btn-danger ts-btn-sm" id="btnDeleteSavedTheme">Delete</button>
          </div>
        </div>
      </aside>

      <!-- Interactive Live Preview Modal Dialog -->
      <div class="ts-modal-backdrop" id="tsLivePreviewModal" role="dialog" aria-modal="true" aria-labelledby="liveModalTitle" hidden>
        <div class="ts-modal-dialog">
          <div class="ts-panel-header">
            <h3 class="ts-panel-title" id="liveModalTitle">Live Themed Modal Dialog</h3>
            <button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="btnCloseLiveModal">✕ Close</button>
          </div>
          <p style="margin:0; color:var(--text-secondary); font-size:var(--font-size-sm);">
            This modal inherits <code>--bg-elevated</code>, <code>--shadow-modal</code>, <code>--radius-xl</code>, and <code>--bg-overlay</code> directly from the <code>:root</code> theme engine.
          </p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <span class="ts-badge ts-badge-success">Contrast Verified</span>
            <span class="ts-badge ts-badge-info">Zero-Lag :root Sync</span>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" class="ts-btn ts-btn-secondary" id="btnCancelLiveModal">Cancel</button>
            <button type="button" class="ts-btn ts-btn-primary" id="btnConfirmLiveModal">Confirm Action</button>
          </div>
        </div>
      </div>

      <!-- JSON Export / Import Modal Dialog -->
      <div class="ts-modal-backdrop" id="tsJsonModal" role="dialog" aria-modal="true" aria-labelledby="jsonModalTitle" hidden>
        <div class="ts-modal-dialog">
          <div class="ts-panel-header">
            <h3 class="ts-panel-title" id="jsonModalTitle">Export / Import Theme JSON</h3>
            <button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="btnCloseJsonModal">✕ Close</button>
          </div>
          <p style="margin:0; color:var(--text-secondary); font-size:var(--font-size-xs);">
            Copy or download the clean JSON definition, or paste/upload a theme JSON file to restore surface controls and Pro Inspector overrides.
          </p>
          <textarea id="txtThemeJsonPayload" class="ts-textarea" style="min-height:180px; font-family:var(--font-mono); font-size:12px;" aria-label="Theme JSON Payload"></textarea>
          <div id="tsJsonErrorBanner" class="ts-badge ts-badge-danger" style="display:none;"></div>
          <div style="display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px;">
            <div style="display:flex; gap:6px;">
              <button type="button" class="ts-btn ts-btn-secondary ts-btn-sm" id="btnDownloadJsonFile">⬇ Download .json</button>
              <label class="ts-btn ts-btn-secondary ts-btn-sm" for="fileImportThemeJson" style="cursor:pointer;">
                ⬆ Upload .json
                <input type="file" id="fileImportThemeJson" accept=".json,application/json" style="display:none;" />
              </label>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="ts-btn ts-btn-primary ts-btn-sm" id="btnApplyJsonPayload">✔ Import &amp; Apply JSON</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const q = <T extends HTMLElement>(selector: string): T =>
    container.querySelector(selector) as T;

  // Render Preset Cards
  function renderPresets(): void {
    const grid = q<HTMLDivElement>("#tsPresetGrid");
    grid.innerHTML = THEME_STUDIO_PRESETS.map((preset) => {
      const isActive = activePresetId === preset.id;
      return `
        <button
          type="button"
          class="ts-preset-card"
          data-preset-id="${preset.id}"
          data-active="${isActive ? "true" : "false"}"
          title="${preset.tagline}"
        >
          <div style="display:flex; width:100%; align-items:center; justify-content:space-between;">
            <strong style="font-size:var(--font-size-xs);">${preset.name}</strong>
            <div class="ts-preset-dots">
              <span class="ts-preset-dot" style="background:${preset.surface.primaryColor};"></span>
              <span class="ts-preset-dot" style="background:${preset.surface.accentColor};"></span>
            </div>
          </div>
          <span style="font-size:10.5px; color:var(--text-muted);">${preset.badge}</span>
        </button>
      `;
    }).join("");
  }

  // Render 10-step Shade Scale Swatches
  function renderShadeScale(): void {
    const shadeGrid = q<HTMLDivElement>("#tsShadeScaleGrid");
    shadeGrid.innerHTML = SHADE_STEPS_10.map((step) => {
      const hex = system.neutralScale[step];
      const fg = step <= 400 ? system.neutralScale[950] : system.neutralScale[50];
      return `
        <div class="ts-shade-swatch" data-shade-step="${step}" style="background:${hex}; color:${fg};">
          <strong>${step}</strong>
          <span>${hex}</span>
        </div>
      `;
    }).join("");
  }

  // Render Pro Inspector Collapsible Accordion Tree (8 Categories)
  function renderProInspector(): void {
    const tree = q<HTMLDivElement>("#tsInspectorAccordionTree");
    const grouped = getCatalogByCategory();
    const filter = inspectorFilter.trim().toLowerCase();

    tree.innerHTML = INSPECTOR_CATEGORIES.map((category) => {
      const items = grouped[category].filter(
        (d) =>
          !filter ||
          d.name.toLowerCase().includes(filter) ||
          d.label.toLowerCase().includes(filter) ||
          d.description.toLowerCase().includes(filter)
      );
      if (items.length === 0) return "";

      const isOpen = filter.length > 0 || expandedCategories.has(category);
      const overrideCountInCat = items.filter((d) => d.name in overrides).length;

      const rowsHtml = items
        .map((desc) => {
          const currentVal = system.variables[desc.name] ?? "";
          const isOverridden = desc.name in overrides;
          const showColorPicker = desc.kind === "color";
          const pickerHex = isSimpleHexColor(currentVal)
            ? currentVal
            : normalizeHex(currentVal, surface.primaryColor);

          return `
            <div class="ts-var-row" data-var-name="${desc.name}">
              <div class="ts-var-header">
                <div>
                  <div style="font-size:var(--font-size-xs); font-weight:600; color:var(--text-primary);">${desc.label}</div>
                  <code class="ts-var-code">${desc.name}</code>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  ${isOverridden ? '<span class="ts-badge ts-badge-warning" style="padding:1px 6px; font-size:10px;">Overridden</span>' : ""}
                  <button
                    type="button"
                    class="ts-btn ts-btn-ghost ts-btn-sm"
                    data-reset-var="${desc.name}"
                    ${isOverridden ? "" : "disabled"}
                    title="Reset ${desc.name} to computed value"
                  >↺</button>
                </div>
              </div>
              <div class="ts-var-controls">
                ${
                  showColorPicker
                    ? `<input type="color" class="ts-color-swatch-input" style="width:34px; height:30px;" data-var-color="${desc.name}" value="${pickerHex}" aria-label="${desc.label} color picker" />`
                    : ""
                }
                <input
                  type="text"
                  class="ts-input"
                  style="height:30px; font-family:var(--font-mono); font-size:11.5px;"
                  data-var-input="${desc.name}"
                  value="${currentVal.replace(/"/g, "&quot;")}"
                  aria-label="${desc.name} value"
                />
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="ts-accordion-item" data-inspector-category="${category}">
          <button
            type="button"
            class="ts-accordion-summary"
            data-toggle-category="${category}"
            aria-expanded="${isOpen ? "true" : "false"}"
          >
            <span>${isOpen ? "▾" : "▸"} ${category} <span style="color:var(--text-muted); font-weight:400;">(${items.length})</span></span>
            ${
              overrideCountInCat > 0
                ? `<span class="ts-badge ts-badge-warning">${overrideCountInCat} custom</span>`
                : `<span class="ts-badge ts-badge-neutral">Auto</span>`
            }
          </button>
          <div class="ts-accordion-body" ${isOpen ? "" : "hidden"}>
            ${rowsHtml}
          </div>
        </div>
      `;
    }).join("");
  }

  // Render Saved Themes Dropdown
  function renderSavedThemesDropdown(): void {
    const select = q<HTMLSelectElement>("#ctrlSavedThemesSelect");
    const saved = loadSavedThemes(options.storage);
    select.innerHTML =
      `<option value="">Saved Themes (${saved.length})...</option>` +
      saved
        .map(
          (t) =>
            `<option value="${t.id}">${t.name} (${t.surface.baseMode} • ${t.surface.surfaceVibe})</option>`
        )
        .join("");
  }

  // Sync UI Controls & Live Preview Readouts
  function syncUiFromState(rerenderInspector = true): void {
    // Sync Quick Studio surface inputs
    q<HTMLElement>("#lblBaseModeVal").textContent = surface.baseMode;
    q<HTMLElement>("#lblPrimaryColorVal").textContent = surface.primaryColor;
    q<HTMLElement>("#lblAccentColorVal").textContent = surface.accentColor;
    q<HTMLElement>("#lblSurfaceVibeVal").textContent = surface.surfaceVibe;
    q<HTMLElement>("#lblCornerSharpnessVal").textContent = `${surface.cornerSharpness}px`;
    q<HTMLElement>("#lblDensityVal").textContent = surface.density;

    q<HTMLInputElement>("#ctrlPrimaryColorPicker").value = surface.primaryColor;
    q<HTMLInputElement>("#ctrlPrimaryColorHex").value = surface.primaryColor;
    q<HTMLInputElement>("#ctrlAccentColorPicker").value = surface.accentColor;
    q<HTMLInputElement>("#ctrlAccentColorHex").value = surface.accentColor;
    q<HTMLInputElement>("#ctrlCornerSharpness").value = String(surface.cornerSharpness);

    container.querySelectorAll<HTMLButtonElement>("[data-base-mode]").forEach((btn) => {
      btn.dataset.active = btn.dataset.baseMode === surface.baseMode ? "true" : "false";
    });
    container.querySelectorAll<HTMLButtonElement>("[data-surface-vibe]").forEach((btn) => {
      btn.dataset.active = btn.dataset.surfaceVibe === surface.surfaceVibe ? "true" : "false";
    });
    container.querySelectorAll<HTMLButtonElement>("[data-density]").forEach((btn) => {
      btn.dataset.active = btn.dataset.density === surface.density ? "true" : "false";
    });

    // Header & Telemetry readouts
    const overrideCount = Object.keys(overrides).length;
    q<HTMLElement>("#tsContrastBadge").textContent = `Contrast: ${system.text.panelBgContrastRatio}:1 (${system.text.panelBgContrastRatio >= 7 ? "AAA" : "AA"})`;
    q<HTMLElement>("#tsOverrideCountBadge").textContent = `${overrideCount} Override${overrideCount === 1 ? "" : "s"}`;
    q<HTMLElement>("#tsBtnContrastReadout").textContent = `Primary ${system.text.primaryButtonContrastRatio}:1 • Accent ${system.text.accentButtonContrastRatio}:1`;
    q<HTMLElement>("#tsVibeReadout").textContent = `${surface.surfaceVibe} • ${surface.cornerSharpness}px • ${surface.density}`;
    q<HTMLElement>("#tsBaseModeBadge").textContent = surface.baseMode;
    q<HTMLElement>("#tsActiveThemeLabel").textContent = `Active: ${currentName}`;
    q<HTMLElement>("#termModeVal").textContent = surface.baseMode;
    q<HTMLElement>("#termVibeVal").textContent = surface.surfaceVibe;
    q<HTMLElement>("#termContrastVal").textContent = `${system.text.panelBgContrastRatio}:1`;
    q<HTMLElement>("#termVarCount").textContent = String(Object.keys(system.variables).length);

    // Code block preview
    const sampleVars: Array<`--${string}`> = [
      "--bg-app",
      "--bg-panel",
      "--bg-hover",
      "--border-subtle",
      "--border-focus",
      "--text-primary",
      "--text-muted",
      "--radius-sm",
      "--radius-md",
      "--shadow-elevated",
    ];
    const codeLines = sampleVars.map(
      (k) => `  <span class="ts-tok-fn">${k}</span>: <span class="ts-tok-str">${system.variables[k]}</span>;`
    );
    q<HTMLElement>("#previewCodeBlock").innerHTML =
      `<span class="ts-tok-cmt">/* Auto-generated by Smart Math Engine (${Object.keys(system.variables).length} total tokens) */</span>\n` +
      `<span class="ts-tok-kw">:root</span> {\n` +
      codeLines.join("\n") +
      `\n}`;

    renderPresets();
    renderShadeScale();
    if (rerenderInspector) {
      renderProInspector();
    }
    renderSavedThemesDropdown();
  }

  function recomputeAndApply(rerenderInspector = true): CalculatedThemeSystem {
    system = applyThemeToRoot(surface, overrides, cssRoot);
    saveActiveStudioState(
      {
        name: currentName,
        activePresetId,
        surface,
        overrides,
      },
      options.storage
    );
    syncUiFromState(rerenderInspector);
    options.onChange?.(system);
    return system;
  }

  // Wire Quick Studio Controls
  container.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      "button, tr"
    );
    if (!target) return;

    // Preset Card Click
    if (target.dataset.presetId) {
      controller.applyPreset(target.dataset.presetId);
      return;
    }

    // Base Mode
    if (target.dataset.baseMode) {
      activePresetId = null;
      surface = { ...surface, baseMode: target.dataset.baseMode as BaseMode };
      recomputeAndApply();
      return;
    }

    // Surface Vibe
    if (target.dataset.surfaceVibe) {
      activePresetId = null;
      surface = { ...surface, surfaceVibe: target.dataset.surfaceVibe as SurfaceVibe };
      recomputeAndApply();
      return;
    }

    // Density
    if (target.dataset.density) {
      activePresetId = null;
      surface = { ...surface, density: target.dataset.density as InterfaceDensity };
      recomputeAndApply();
      return;
    }

    // Drawer Tabs (Quick Studio vs Pro Inspector)
    if (target.dataset.studioTab) {
      controller.switchTab(target.dataset.studioTab as "quick" | "inspector");
      return;
    }

    // Playground Preview Tabs
    if (target.dataset.pgTab) {
      activePlaygroundTab = target.dataset.pgTab as "components" | "data" | "code";
      container.querySelectorAll<HTMLButtonElement>("[data-pg-tab]").forEach((btn) => {
        btn.setAttribute(
          "aria-selected",
          btn.dataset.pgTab === activePlaygroundTab ? "true" : "false"
        );
      });
      const showAll = activePlaygroundTab === "components";
      q<HTMLElement>("#pgSectionComponents").hidden = !showAll;
      q<HTMLElement>("#pgSectionData").hidden = !showAll && activePlaygroundTab !== "data";
      q<HTMLElement>("#pgSectionCode").hidden = !showAll && activePlaygroundTab !== "code";
      return;
    }

    // Pro Inspector Accordion Category Toggle
    if (target.dataset.toggleCategory) {
      const cat = target.dataset.toggleCategory as InspectorCategory;
      if (expandedCategories.has(cat)) {
        expandedCategories.delete(cat);
      } else {
        expandedCategories.add(cat);
      }
      renderProInspector();
      return;
    }

    // Pro Inspector Reset Single Variable
    if (target.dataset.resetVar) {
      controller.removeOverride(target.dataset.resetVar);
      return;
    }

    // Table Row Selection
    if (target.tagName === "TR" && target.closest("#previewDataTable tbody")) {
      container
        .querySelectorAll<HTMLTableRowElement>("#previewDataTable tbody tr")
        .forEach((row) => {
          row.dataset.selected = row === target ? "true" : "false";
        });
      return;
    }
  });

  // Color Pickers & Range Slider Input Events (Real-Time Zero-Lag)
  q<HTMLInputElement>("#ctrlPrimaryColorPicker").addEventListener("input", (e) => {
    const val = (e.target as HTMLInputElement).value;
    activePresetId = null;
    surface = { ...surface, primaryColor: normalizeHex(val, surface.primaryColor) };
    recomputeAndApply();
  });

  q<HTMLInputElement>("#ctrlPrimaryColorHex").addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    activePresetId = null;
    surface = { ...surface, primaryColor: normalizeHex(val, surface.primaryColor) };
    recomputeAndApply();
  });

  q<HTMLInputElement>("#ctrlAccentColorPicker").addEventListener("input", (e) => {
    const val = (e.target as HTMLInputElement).value;
    activePresetId = null;
    surface = { ...surface, accentColor: normalizeHex(val, surface.accentColor) };
    recomputeAndApply();
  });

  q<HTMLInputElement>("#ctrlAccentColorHex").addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value;
    activePresetId = null;
    surface = { ...surface, accentColor: normalizeHex(val, surface.accentColor) };
    recomputeAndApply();
  });

  q<HTMLInputElement>("#ctrlCornerSharpness").addEventListener("input", (e) => {
    const val = Number((e.target as HTMLInputElement).value);
    activePresetId = null;
    surface = { ...surface, cornerSharpness: val };
    recomputeAndApply();
  });

  // Pro Inspector Search & Variable Override Inputs
  q<HTMLInputElement>("#ctrlInspectorSearch").addEventListener("input", (e) => {
    inspectorFilter = (e.target as HTMLInputElement).value;
    renderProInspector();
  });

  q<HTMLDivElement>("#tsInspectorAccordionTree").addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.dataset.varColor) {
      const varName = target.dataset.varColor;
      const val = target.value;
      overrides = { ...overrides, [varName]: val };
      const textInput = container.querySelector<HTMLInputElement>(
        `[data-var-input="${varName}"]`
      );
      if (textInput) textInput.value = val;
      recomputeAndApply(false);
    } else if (target.dataset.varInput) {
      const varName = target.dataset.varInput;
      const val = target.value.trim();
      if (val) {
        overrides = { ...overrides, [varName]: val };
        recomputeAndApply(false);
      }
    }
  });

  q<HTMLDivElement>("#tsInspectorAccordionTree").addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.dataset.varInput || target.dataset.varColor) {
      renderProInspector();
    }
  });

  // Toolbar & Modal Buttons
  q<HTMLButtonElement>("#btnToggleDrawer").addEventListener("click", () => {
    controller.toggleDrawer();
  });

  q<HTMLButtonElement>("#btnResetAllOverrides").addEventListener("click", () => {
    controller.clearAllOverrides();
  });

  // Live Preview Modal
  const liveModal = q<HTMLDivElement>("#tsLivePreviewModal");
  q<HTMLButtonElement>("#btnOpenLiveModal").addEventListener("click", () => {
    liveModal.hidden = false;
  });
  q<HTMLButtonElement>("#btnCloseLiveModal").addEventListener("click", () => {
    liveModal.hidden = true;
  });
  q<HTMLButtonElement>("#btnCancelLiveModal").addEventListener("click", () => {
    liveModal.hidden = true;
  });
  q<HTMLButtonElement>("#btnConfirmLiveModal").addEventListener("click", () => {
    liveModal.hidden = true;
  });

  // JSON Export / Import Modal
  const jsonModal = q<HTMLDivElement>("#tsJsonModal");
  const jsonTextarea = q<HTMLTextAreaElement>("#txtThemeJsonPayload");
  const jsonErrorBanner = q<HTMLDivElement>("#tsJsonErrorBanner");

  q<HTMLButtonElement>("#btnOpenJsonModal").addEventListener("click", () => {
    jsonErrorBanner.style.display = "none";
    jsonTextarea.value = controller.exportJson();
    jsonModal.hidden = false;
  });

  q<HTMLButtonElement>("#btnCloseJsonModal").addEventListener("click", () => {
    jsonModal.hidden = true;
  });

  q<HTMLButtonElement>("#btnApplyJsonPayload").addEventListener("click", () => {
    try {
      jsonErrorBanner.style.display = "none";
      controller.importJson(jsonTextarea.value);
      jsonModal.hidden = true;
    } catch (err: any) {
      jsonErrorBanner.textContent = err?.message || "Invalid theme JSON";
      jsonErrorBanner.style.display = "inline-flex";
    }
  });

  q<HTMLButtonElement>("#btnDownloadJsonFile").addEventListener("click", () => {
    const json = controller.exportJson();
    jsonTextarea.value = json;
    if (typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = doc.createElement("a");
      const slug = currentName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "custom-theme";
      a.href = url;
      a.download = `${slug}.theme.json`;
      doc.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  });

  q<HTMLInputElement>("#fileImportThemeJson").addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      jsonTextarea.value = text;
      controller.importJson(text);
      jsonErrorBanner.style.display = "none";
      jsonModal.hidden = true;
    } catch (err: any) {
      jsonErrorBanner.textContent = err?.message || "Failed to import JSON file";
      jsonErrorBanner.style.display = "inline-flex";
    }
  });

  // Save / Load / Delete Custom Themes in localStorage
  q<HTMLButtonElement>("#btnSaveThemeLocal").addEventListener("click", () => {
    const inputName = q<HTMLInputElement>("#ctrlSaveThemeName").value.trim() || "Custom Theme";
    controller.saveCurrentTheme(inputName);
  });

  q<HTMLButtonElement>("#btnLoadSavedTheme").addEventListener("click", () => {
    const id = q<HTMLSelectElement>("#ctrlSavedThemesSelect").value;
    if (id) controller.loadSavedThemeById(id);
  });

  q<HTMLButtonElement>("#btnDeleteSavedTheme").addEventListener("click", () => {
    const id = q<HTMLSelectElement>("#ctrlSavedThemesSelect").value;
    if (id) controller.deleteSavedThemeById(id);
  });

  // Copy :root CSS button
  q<HTMLButtonElement>("#btnCopyRootCss").addEventListener("click", () => {
    try {
      navigator.clipboard?.writeText(system.cssText);
    } catch {
      // Ignore in headless environments
    }
  });

  const controller: ThemeStudioController = {
    getState: () => ({
      name: currentName,
      activeTab,
      drawerOpen,
      surface: { ...surface },
      overrides: { ...overrides },
      system,
      savedThemes: loadSavedThemes(options.storage),
    }),

    setSurface: (patch) => {
      activePresetId = null;
      surface = { ...surface, ...patch };
      return recomputeAndApply();
    },

    setOverride: (variableName, value) => {
      const key = variableName.trim();
      if (key.startsWith("--")) {
        overrides = { ...overrides, [key]: value.trim() };
      }
      return recomputeAndApply();
    },

    removeOverride: (variableName) => {
      const next = { ...overrides };
      delete next[variableName.trim()];
      overrides = next;
      return recomputeAndApply();
    },

    clearAllOverrides: () => {
      overrides = {};
      return recomputeAndApply();
    },

    applyPreset: (presetId) => {
      const preset = getThemePresetById(presetId);
      if (!preset) return system;
      activePresetId = preset.id;
      currentName = preset.name;
      surface = { ...preset.surface };
      overrides = { ...(preset.overrides ?? {}) };
      q<HTMLInputElement>("#ctrlSaveThemeName").value = currentName;
      return recomputeAndApply();
    },

    switchTab: (tab) => {
      activeTab = tab;
      const isQuick = tab === "quick";
      q<HTMLButtonElement>("#tabBtnQuickStudio").setAttribute(
        "aria-selected",
        isQuick ? "true" : "false"
      );
      q<HTMLButtonElement>("#tabBtnProInspector").setAttribute(
        "aria-selected",
        !isQuick ? "true" : "false"
      );
      q<HTMLElement>("#tabPanelQuickStudio").hidden = !isQuick;
      q<HTMLElement>("#tabPanelProInspector").hidden = isQuick;
      if (!isQuick) {
        renderProInspector();
      }
    },

    toggleDrawer: (open) => {
      drawerOpen = open !== undefined ? open : !drawerOpen;
      q<HTMLElement>("#tsAppShell").dataset.drawerOpen = drawerOpen ? "true" : "false";
    },

    saveCurrentTheme: (customName) => {
      if (customName && customName.trim()) {
        currentName = customName.trim();
        q<HTMLInputElement>("#ctrlSaveThemeName").value = currentName;
      }
      const { saved } = saveCustomTheme(
        {
          name: currentName,
          surface,
          overrides,
        },
        options.storage
      );
      syncUiFromState(false);
      return saved;
    },

    loadSavedThemeById: (id) => {
      const found = loadSavedThemes(options.storage).find((t) => t.id === id);
      if (!found) return null;
      currentName = found.name;
      activePresetId = null;
      surface = { ...found.surface };
      overrides = { ...found.overrides };
      q<HTMLInputElement>("#ctrlSaveThemeName").value = currentName;
      return recomputeAndApply();
    },

    deleteSavedThemeById: (id) => {
      const remaining = deleteSavedTheme(id, options.storage);
      renderSavedThemesDropdown();
      return remaining;
    },

    exportJson: () =>
      exportThemeToJson({
        name: currentName,
        surface,
        overrides,
      }),

    importJson: (jsonString) => {
      const imported = importThemeFromJson(jsonString);
      currentName = imported.name;
      activePresetId = null;
      surface = { ...imported.surface };
      overrides = { ...imported.overrides };
      q<HTMLInputElement>("#ctrlSaveThemeName").value = currentName;
      saveCustomTheme(
        {
          id: imported.id,
          name: imported.name,
          description: imported.description,
          surface: imported.surface,
          overrides: imported.overrides,
        },
        options.storage
      );
      return recomputeAndApply();
    },
  };

  // Initial render
  syncUiFromState(true);
  return controller;
}
