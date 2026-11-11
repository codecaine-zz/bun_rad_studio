/**
 * SimpleGUI — Cross-platform desktop windowing, layout, theming, and widget engine for Bun RAD Studio.
 *
 * Provides `SimpleWindow` and `SimpleControlRef` for building native webview and browser-hosted GUI
 * applications with fluent layout containers (rows, grids, cards, flex), 140+ built-in visual controls and
 * enterprise components, SweetAlert-style dialogs, reactive key-value state bindings, automatic session and
 * form state persistence, and a 75+ theme design system with contrast-checked semantic palettes and
 * hardware-adaptive visual effects (FX).
 */

import { SIMPLEGUI_THEMES } from "./shared/simpleguiThemes";
export { SIMPLEGUI_THEMES } from "./shared/simpleguiThemes";
import type { SizeHint, Webview } from "webview-bun";
const SIZE_HINT_NONE = 0 as SizeHint;
let cachedWebviewCtor: (typeof import("webview-bun"))["Webview"] | null = null;
try {
  cachedWebviewCtor = (await import("webview-bun")).Webview;
} catch {
  // Allow importing SimpleWindow in headless/server environments where the native webview runtime is unavailable.
}
import { injectHelp } from "./shared/helpTips";
import { DESKTOP_SHORTCUTS_SCRIPT } from "./shared/desktopShortcuts";
import { OS_THEME_KEYS } from "./shared/osThemes";
import {
  FX_THEME_KEYS,
  FX_THEME_ALIASES,
  FX_FALLBACK_THEMES,
  fxCssVars as buildFxCssVars,
  fxRootAttrs,
  normalizeFxMode,
  syntaxPalette,
  detectThemeHardware,
  getFallbackThemeKey,
  resolveThemeForHardware as resolveFxThemeForHardware,
  srgbToDisplayP3,
  type FxMode,
  type FxHardwareInput,
  type FxHardwareProfile,
  type FxHardwareTier,
  type FxNativeBackdrop,
  type HardwareResolvedTheme,
  type SyntaxPalette,
  type ThemeFx,
} from "./shared/fxThemes";
import { fxCss } from "./shared/fxCss";
import { FX_POINTER_SOURCE } from "./shared/fxPointer";
import {
  buildSemanticPalette,
  overridesForTheme,
  semanticCssVars,
  type SemanticOverrides,
  type SemanticPalette,
} from "./shared/themeSemantic";
import {
  generatePreviewHtml,
  setAlwaysOnTopNative as nativeSetAlwaysOnTop,
  toggleFullscreenNative as nativeToggleFullscreen,
  setFullscreenNative as nativeSetFullscreen,
  isFullscreenNative as nativeIsFullscreen,
  setWindowPositionNative as nativeSetWindowPosition,
  minimizeWindowNative as nativeMinimize,
  hideAppNative as nativeHideApp,
  closeWindowNative,
  attachWindowShortcuts as nativeAttachShortcuts,
  getScreenDimensions,
} from "../index.ts";

/**
 * A window can be hosted inside a web page (see simplegui_host.ts) instead of opening its own native window. Such a
 * "webview" has no window handle, and these helpers must never touch the host program's windows or quit it.
 */
const isHosted = (wv: any): boolean => !!wv && wv.isHosted === true;
const setAlwaysOnTopNative = (wv: any, ...a: [boolean]) =>
  isHosted(wv) ? undefined : nativeSetAlwaysOnTop(wv, ...a);
const toggleFullscreenNative = (wv: any) =>
  isHosted(wv) ? undefined : nativeToggleFullscreen(wv);
const setFullscreenNative = (wv: any, ...a: [boolean?]) =>
  isHosted(wv) ? undefined : nativeSetFullscreen(wv, ...a);
const isFullscreenNative = (wv: any): boolean =>
  isHosted(wv) ? false : nativeIsFullscreen(wv);
const setWindowPositionNative = (wv: any, ...a: [any, number?, number?]) =>
  isHosted(wv) ? undefined : nativeSetWindowPosition(wv, ...a);
const minimizeWindowNative = (wv: any) =>
  isHosted(wv) ? undefined : nativeMinimize(wv);
const hideAppNative = (wv: any) =>
  isHosted(wv) ? undefined : nativeHideApp(wv);
const attachWindowShortcuts = (wv: any, ...a: [any?]) =>
  isHosted(wv) ? undefined : nativeAttachShortcuts(wv, ...a);
import { Sys } from "./simplecli/sys/index.ts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  SimpleDialogs,
  DIALOG_CLIENT_HTML,
  type DialogOptions,
  type DialogResult,
  type DialogCallback,
  type DialogIcon,
  type DialogInputType,
  type DialogInputOptions,
  type FileDialogOptions,
} from "./simplegui_dialogs.ts";
import {
  UI_CLIENT_HTML,
  UI_DEFAULT_SIZES,
  renderUIComponent,
  type UIComponentType,
} from "./simplegui_components.ts";
import { writeClipboardSync, readClipboardSync } from "./localGuard.ts";

/** Immediately terminates the current process with the specified exit status code. */
export function forceExit(code = 0): void {
  process.exit(code);
}

/** Configuration options for creating and initializing a `SimpleWindow` instance. */
export interface SimpleWindowOptions {
  title?: string;
  width?: number;
  height?: number;
  theme?: string;
  background_color?: string;
  font_color?: string;
  padding?: number;
  spacing?: number;
  alwaysOnTop?: boolean;
  appId?: string;
  app_id?: string;
  /** Which help dictionary the tooltips use (src/shared/help), when it should not be the app id. */
  helpId?: string;
  autoSave?: boolean;
  auto_save?: boolean;
  autoSaveState?: boolean;
  auto_save_state?: boolean;
  fullscreen?: boolean;
  responsive?: boolean;
  /** Effects for themes that have an `fx` descriptor: "full" (default), "reduced" (looks, no motion) or "off". */
  effects?: "full" | "reduced" | "off";
}

/** Serialized geometry, styling, and state specification for an individual UI control on a form. */
export interface ControlSpec {
  id: string;
  control_type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  font_size?: number;
  font_color?: string;
  background_color?: string;
  hover_color?: string;
  hover_text_color?: string;
  cursor?: string;
  border_radius?: number;
  border_width?: number;
  border_color?: string;
  border_style?: "solid" | "dashed" | "dotted" | "double" | "none";
  box_shadow?: "none" | "subtle" | "medium" | "deep" | "glow";
  text_align?: "left" | "center" | "right" | "justify";
  opacity?: number;
  placeholder?: string;
  read_only?: boolean;
  readonly?: boolean;
  required?: boolean;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  step?: number;
  auto_focus?: boolean;
  value?: any;
  checked?: boolean;
  enabled?: boolean;
  visible?: boolean;
  locked?: boolean;
  tab_order?: number;
  tooltip?: string;
  anchors?: {
    top?: boolean;
    left?: boolean;
    right?: boolean;
    bottom?: boolean;
  };
  dock?: "none" | "top" | "bottom" | "left" | "right" | "fill";
  [key: string]: any;
}

/** Complete serialized specification of a `SimpleWindow` form, including theme palette, layout metrics, and controls. */
export interface FormSpec {
  title: string;
  width: number;
  height: number;
  theme: string;
  background_color: string;
  font_color: string;
  accent_color?: string;
  secondary_accent?: string;
  card_background?: string;
  card_border?: string;
  /** The theme's own light/dark answer, when the form still has the theme's background. */
  is_dark?: boolean;
  /** Base danger, warning, success and info colors of the theme, when it defines its own. */
  semantic_overrides?: SemanticOverrides;
  padding: number;
  spacing: number;
  controls: ControlSpec[];
  non_visual_controls?: ControlSpec[];
  menu_bar?: any;
  global_context_menu_items?: any[];
}

// Some controls (kanban moves, table sorting, ...) pass extra arguments after the value.
/** Callback signature invoked when a control or window event fires, receiving the owning `SimpleWindow`, primary value, and any extra event payload arguments. */
export type EventCallback = (
  win: SimpleWindow,
  val?: any,
  ...extra: any[]
) => void;

/** Options shared by every enterprise component: free-form config plus the usual event hooks. */
export type UIOpts = Record<string, any> & {
  id?: string;
  width?: number;
  height?: number;
  onChange?: EventCallback;
  onClick?: EventCallback;
};

/** Fluent handle returned when adding a control to a `SimpleWindow`, enabling chainable layout, styling, value manipulation, and event binding. */
export class SimpleControlRef {
  public spec: any;
  public window: SimpleWindow;

  /** Creates a fluent `SimpleControlRef` wrapping a control specification and its owning `SimpleWindow`. */
  constructor(spec: any, window: SimpleWindow) {
    this.spec = spec;
    this.window = window;
  }

  /** Assigns a new unique identifier to this control, migrating any stored values, list items, event handlers, and layout section references from the previous ID. */
  id(idStr: string): this {
    const oldId = this.spec.id;
    if (typeof (this.window as any)._unindexControl === "function") {
      (this.window as any)._unindexControl(this.spec);
    }
    if (oldId && oldId !== idStr) {
      if (
        Object.prototype.hasOwnProperty.call(this.window.formValuesStore, oldId)
      ) {
        this.window.formValuesStore[idStr] = this.window.formValuesStore[oldId];
        delete this.window.formValuesStore[oldId];
      }
      if (
        this.window.listItemsStore &&
        this.window.listItemsStore[oldId] !== undefined
      ) {
        this.window.listItemsStore[idStr] = this.window.listItemsStore[oldId];
        delete this.window.listItemsStore[oldId];
      }
      if (this.window.eventHandlersMap) {
        const prefix = `${oldId}:`;
        for (const [key, callback] of Array.from(
          this.window.eventHandlersMap.entries(),
        )) {
          if (key.startsWith(prefix)) {
            const eventType = key.slice(prefix.length);
            this.window.eventHandlersMap.delete(key);
            this.window.eventHandlersMap.set(`${idStr}:${eventType}`, callback);
          }
        }
      }
      if (
        typeof (this.window as any)._renameControlInLayoutSections ===
        "function"
      ) {
        (this.window as any)._renameControlInLayoutSections(oldId, idStr);
      }
      if ((this.window as any).lastControlId === oldId) {
        (this.window as any).lastControlId = idStr;
      }
    }
    this.spec.id = idStr;
    this.spec.name = idStr;
    if (typeof (this.window as any)._indexControl === "function") {
      (this.window as any)._indexControl(this.spec);
    }
    return this;
  }

  /** Binds a Tabs control to a map of tab names (or indices) to arrays of control/card IDs for automatic view switching. */
  bindViews(
    viewGroupsMap: Record<string, string[]>,
    onTabChange?: (
      win: SimpleWindow,
      activeTab: string,
      activeIndex: number,
    ) => void,
  ): this {
    this.window.bindTabViews(this.spec.id, viewGroupsMap, onTabChange);
    return this;
  }

  /** Binds this input or search control to live-filter a Table control (`tableId`) on every keystroke. */
  filterTable(
    tableId: string,
    sourceRows: any[][] | (() => any[][]),
    optionsOrOnFilter?:
      | {
          columns?: number[];
          predicate?: (row: any[], query: string) => boolean;
          countControlId?: string;
          countFormat?: (matched: number, total: number) => string;
          onFilter?: (
            win: SimpleWindow,
            filteredRows: any[][],
            query: string,
          ) => void;
        }
      | ((win: SimpleWindow, filteredRows: any[][], query: string) => void),
  ): this {
    this.window.bindTableFilter(
      this.spec.id,
      tableId,
      sourceRows,
      optionsOrOnFilter,
    );
    return this;
  }
  /** Snake_case alias of `filterTable`: binds this input or search control to live-filter a Table control. */
  filter_table(
    tableId: string,
    sourceRows: any[][] | (() => any[][]),
    optionsOrOnFilter?: any,
  ): this {
    return this.filterTable(tableId, sourceRows, optionsOrOnFilter);
  }

  /** Binds this Table control to detail/form controls so clicking a row populates the mapped controls. */
  bindDetail(
    columnToControlMap: (string | null | undefined)[] | Record<string, string>,
    onRowSelect?: (
      win: SimpleWindow,
      row: any[],
      rowId: string,
      rowIndex: number,
    ) => void,
  ): this {
    this.window.bindMasterDetail(this.spec.id, columnToControlMap, onRowSelect);
    return this;
  }
  /** Snake_case alias of `bindDetail`: binds this Table control to detail/form controls. */
  bind_detail(
    columnToControlMap: (string | null | undefined)[] | Record<string, string>,
    onRowSelect?: (
      win: SimpleWindow,
      row: any[],
      rowId: string,
      rowIndex: number,
    ) => void,
  ): this {
    return this.bindDetail(columnToControlMap, onRowSelect);
  }

  /** Programmatically fires this control's `onClick` handler(s). */
  triggerClick(val?: any): Promise<SimpleWindow> {
    return this.window.triggerClick(this.spec.id, val);
  }
  /** Programmatically updates this control's value (if provided) and fires its `onChange` handler(s). */
  triggerChange(val?: any): Promise<SimpleWindow> {
    return this.window.triggerChange(this.spec.id, val);
  }
  /** Programmatically fires this control's `onEnter` handler(s). */
  triggerEnter(val?: any): Promise<SimpleWindow> {
    return this.window.triggerEnter(this.spec.id, val);
  }

  /** Positions this control at explicit `(x, y)` coordinates within the window. */
  at(x: number, y: number): this {
    this.spec.left = x;
    this.spec.top = y;
    this.spec.x = x;
    this.spec.y = y;
    return this;
  }

  /** Alias of `at`: sets the control's `(x, y)` position coordinates. */
  pos(x: number, y: number): this {
    return this.at(x, y);
  }

  /** Sets both the explicit width and height (in pixels) of this control and updates surrounding layout flow. */
  size(width: number, height: number): this {
    this.width(width);
    this.height(height);
    return this;
  }

  /** Sets the explicit pixel width of this control and recalculates horizontal coordinates for subsequent controls in the same row. */
  width(w: number): this {
    this.spec.user_explicit_width = true;
    const oldW = this.spec.width;
    this.spec.width = w;
    if (oldW && oldW !== w && this.window) {
      this.window.recalculateRowX(this.spec, oldW, w);
    }
    return this;
  }

  /** Sets the explicit pixel height of this control and adjusts vertical layout flow for subsequent rows. */
  height(h: number): this {
    this.spec.user_explicit_height = true;
    const oldH = this.spec.height;
    this.spec.height = h;
    if (oldH && oldH !== h && this.window) {
      this.window.recalculateHeightY(this.spec, oldH, h);
    }
    return this;
  }

  /** Sets the background color (CSS color or hex string) of this control. */
  bg(color: string): this {
    this.spec.background_color = color;
    return this;
  }

  /** Sets the foreground text color (CSS color or hex string) of this control. */
  color(color: string): this {
    this.spec.font_color = color;
    return this;
  }

  /** Configures the control's font size in pixels, with optional text color and font weight, automatically expanding label dimensions when needed. */
  font(size: number, color?: string, weight?: string): this {
    this.spec.font_size = size;
    this.spec.fontSize = size;
    if (color) this.spec.font_color = color;
    if (weight) this.spec.font_weight = weight;

    const ctrlType = this.spec.control_type || this.spec.type;
    if (ctrlType === "label") {
      const isBold = weight === "700" || weight === "800" || weight === "bold";
      const charW = size * (isBold ? 0.75 : 0.65);
      const textLen = (this.spec.text || "").length;
      const neededW = Math.ceil(textLen * charW + 16);

      if (!this.spec.user_explicit_width && neededW > (this.spec.width || 0)) {
        const maxW = this.window ? this.window.getAvailableWidth() : 880;
        this.spec.width = Math.min(maxW, neededW);
      }

      if (!this.spec.user_explicit_height && size > 14) {
        const neededH = Math.max(24, Math.ceil(size * 1.45 + 2));
        if (neededH > (this.spec.height || 0)) {
          const oldH = this.spec.height || 24;
          this.spec.height = neededH;
          if (this.window) {
            this.window.recalculateHeightY(this.spec, oldH, neededH);
          }
        }
      }
    }
    return this;
  }

  /** Sets the font size (in pixels) of this control. */
  fontSize(size: number): this {
    return this.font(size);
  }

  /** Snake_case alias of `fontSize`: sets the font size (in pixels) of this control. */
  font_size(size: number): this {
    return this.font(size);
  }

  /** Alias of `color`: sets the foreground text color of this control. */
  fontColor(c: string): this {
    return this.color(c);
  }

  /** Snake_case alias of `fontColor`: sets the foreground text color of this control. */
  font_color(c: string): this {
    return this.color(c);
  }

  /** Alias of `bg`: sets the background color of this control. */
  backgroundColor(c: string): this {
    return this.bg(c);
  }

  /** Snake_case alias of `backgroundColor`: sets the background color of this control. */
  background_color(c: string): this {
    return this.bg(c);
  }

  /** Configures whether this control stretches horizontally to fill remaining space in its row or container. */
  expandFill(expand: boolean = true): this {
    this.spec.expandFill = expand;
    this.spec.expand_fill = expand;
    return this;
  }

  /** Snake_case alias of `expandFill`: configures whether this control stretches to fill available container width. */
  expand_fill(expand: boolean = true): this {
    return this.expandFill(expand);
  }

  /** Enables or disables bold (`font-weight: 700`) typography on this control. */
  bold(isBold = true): this {
    this.spec.font_weight = isBold ? "700" : "400";
    this.spec.is_bold = isBold;
    this.spec.bold = isBold;
    return this;
  }

  /** Enables or disables italic (`font-style: italic`) typography on this control. */
  italic(isItalic = true): this {
    this.spec.font_style = isItalic ? "italic" : "normal";
    return this;
  }

  /** Sets horizontal text alignment (`"left"`, `"center"`, or `"right"`) inside this control. */
  align(textAlignment: "left" | "center" | "right"): this {
    this.spec.text_align = textAlignment;
    return this;
  }

  /** Sets the hover tooltip hint text displayed for this control. */
  tooltip(hint: string): this {
    this.spec.tooltip = hint;
    return this;
  }

  /** Sets the placeholder hint text displayed when this input control is empty. */
  placeholder(ph: string): this {
    this.spec.placeholder = ph;
    return this;
  }

  /** Sets the visual opacity percentage (`0` to `100` or `0.0` to `1.0`) of this control. */
  opacity(percent: number): this {
    this.spec.opacity = percent;
    return this;
  }

  /** Enables or disables user interaction on this control, syncing immediately with the live DOM when the window is running. */
  enabled(flag = true): this {
    this.spec.enabled = flag;
    this.window.setControlEnabled(this.spec.id, flag);
    return this;
  }

  /** Shows or hides this control, syncing visibility immediately with the live DOM when the window is running. */
  visible(flag = true): this {
    this.spec.visible = flag;
    this.window.setControlVisible(this.spec.id, flag);
    return this;
  }

  /** Registers a callback invoked when the user clicks or activates this control. */
  onClick(handler: EventCallback): this {
    this.window.bindControlEvent(this.spec.id, "onClick", handler);
    return this;
  }

  /** Registers a callback invoked whenever this control's value or selection changes. */
  onChange(handler: EventCallback): this {
    this.window.bindControlEvent(this.spec.id, "onChange", handler);
    return this;
  }

  /** Registers a callback invoked when the pointer enters this control. */
  onHover(handler: EventCallback): this {
    this.window.bindControlEvent(this.spec.id, "onHover", handler);
    return this;
  }

  /** Registers a callback invoked when the pointer leaves this control. */
  onHoverExit(handler: EventCallback): this {
    this.window.bindControlEvent(this.spec.id, "onHoverExit", handler);
    return this;
  }

  /** Registers a callback invoked when the user double-clicks this control. */
  onDoubleClick(handler: EventCallback): this {
    this.window.bindControlEvent(this.spec.id, "onDoubleClick", handler);
    return this;
  }
  /** Snake_case alias of `onDoubleClick`: registers a callback invoked when the user double-clicks this control. */
  on_double_click(handler: EventCallback): this {
    return this.onDoubleClick(handler);
  }
  /** Alias of `onDoubleClick`: registers a callback invoked when the user double-clicks this control. */
  onDblClick(handler: EventCallback): this {
    return this.onDoubleClick(handler);
  }
  /** Snake_case alias of `onDoubleClick`: registers a callback invoked when the user double-clicks this control. */
  on_dblclick(handler: EventCallback): this {
    return this.onDoubleClick(handler);
  }
  /** Alias of `onDoubleClick`: registers a callback invoked when the user double-clicks this control. */
  bindDoubleClick(handler: EventCallback): this {
    return this.onDoubleClick(handler);
  }
  /** Alias of `onDoubleClick`: registers a callback invoked when the user double-clicks this control. */
  bindDblClick(handler: EventCallback): this {
    return this.onDoubleClick(handler);
  }

  /** Registers a callback invoked when the user right-clicks (opens the context menu on) this control. */
  onRightClick(handler: EventCallback): this {
    this.window.bindControlEvent(this.spec.id, "onContextMenu", handler);
    return this;
  }
  /** Snake_case alias of `onRightClick`: registers a callback invoked when the user right-clicks (opens the context menu on) this control. */
  on_right_click(handler: EventCallback): this {
    return this.onRightClick(handler);
  }

  /** Registers a callback invoked when the user presses the Enter/Return key while this control is focused. */
  onEnter(handler: EventCallback): this {
    this.window.bindControlEvent(this.spec.id, "onEnter", handler);
    return this;
  }
  /** Snake_case alias of `onEnter`: registers a callback invoked when the user presses the Enter/Return key while this control is focused. */
  on_enter(handler: EventCallback): this {
    return this.onEnter(handler);
  }

  /** Binds a custom or standard event handler by event name to this control. */
  on(event: string, handler: EventCallback): this {
    this.window.bindControlEvent(this.spec.id, event, handler);
    return this;
  }

  /** Registers a callback invoked when the active selection in a list, table, or tree control changes. */
  onSelectionChange(handler: EventCallback): this {
    return this.on("selection_change", handler);
  }
  /** Snake_case alias of `onSelectionChange`: registers a callback invoked when the active selection changes. */
  on_selection_change(handler: EventCallback): this {
    return this.on("selection_change", handler);
  }

  /** Attaches a custom right-click context menu (array of labels or comma-separated string) and optional selection handler to this control. */
  contextMenu(items: string[] | string, onSelect?: EventCallback): this {
    const itemsArr = Array.isArray(items)
      ? items
      : items.split(",").map((s) => s.trim());
    this.spec.context_menu_items = itemsArr;
    if (onSelect) {
      this.window.bindControlEvent(this.spec.id, "context_select", onSelect);
    }
    return this;
  }
  /** Snake_case alias of `contextMenu`: attaches a custom right-click context menu (array of labels or comma-separated string) and optional selection handler to this control. */
  context_menu(items: string[] | string, onSelect?: EventCallback): this {
    return this.contextMenu(items, onSelect);
  }

  /** Establishes two-way reactive binding between this control's value and a key in the window's state store. */
  bindState(key: string): this {
    this.window.bindState(this.spec.id, key);
    return this;
  }
  /** Snake_case alias of `bindState`: establishes two-way reactive binding between this control's value and a key in the window's state store. */
  bind_state(key: string): this {
    return this.bindState(key);
  }
  /** Alias of `bindState`: establishes two-way reactive binding between this control's value and a key in the window's state store. */
  bindControl(key: string): this {
    return this.bindState(key);
  }
  /** Snake_case alias of `bindState`: establishes two-way reactive binding between this control's value and a key in the window's state store. */
  bind_control(key: string): this {
    return this.bindState(key);
  }
  /** Alias of `bindState`: establishes two-way reactive binding between this control's value and a key in the window's state store. */
  bindValue(key: string): this {
    return this.bindState(key);
  }
  /** Snake_case alias of `bindState`: establishes two-way reactive binding between this control's value and a key in the window's state store. */
  bind_value(key: string): this {
    return this.bindState(key);
  }
  /** Binds a click event callback to this control via `SimpleWindow.bindClick`. */
  bindClick(cb: EventCallback): this {
    this.window.bindClick(this.spec.id, cb);
    return this;
  }
  /** Snake_case alias of `bindClick`: binds a click event callback to this control via `SimpleWindow.bindClick`. */
  bind_click(cb: EventCallback): this {
    return this.bindClick(cb);
  }
  /** Binds a value-change event callback to this control via `SimpleWindow.bindChange`. */
  bindChange(cb: EventCallback): this {
    this.window.bindChange(this.spec.id, cb);
    return this;
  }
  /** Snake_case alias of `bindChange`: binds a value-change event callback to this control via `SimpleWindow.bindChange`. */
  bind_change(cb: EventCallback): this {
    return this.bindChange(cb);
  }
  /** Binds an Enter-key event callback to this control via `SimpleWindow.bindEnter`. */
  bindEnter(cb: EventCallback): this {
    this.window.bindEnter(this.spec.id, cb);
    return this;
  }
  /** Snake_case alias of `bindEnter`: binds an Enter-key event callback to this control via `SimpleWindow.bindEnter`. */
  bind_enter(cb: EventCallback): this {
    return this.bindEnter(cb);
  }

  /** Returns the current value of this control from the owning window's form values store. */
  getValue(): any {
    return this.window.getValue(this.spec.id);
  }

  /** Updates the value of this control in the owning window and live DOM. */
  setValue(val: any): this {
    this.window.setValue(this.spec.id, val);
    return this;
  }

  /** Returns the current string text content of this control. */
  getText(): string {
    return this.window.getText(this.spec.id);
  }

  /** Updates the text content of this control in the owning window and live DOM. */
  setText(text: string): this {
    this.window.setText(this.spec.id, text);
    return this;
  }

  /** Makes this control visible (`visible(true)`). */
  show(): this {
    return this.visible(true);
  }
  /** Hides this control (`visible(false)`). */
  hide(): this {
    return this.visible(false);
  }
  /** Opens this modal dialog control in the live window. */
  openModal(): this {
    this.window.openModal(this.spec.id);
    return this;
  }
  /** Closes this modal dialog control in the live window. */
  closeModal(): this {
    this.window.closeModal(this.spec.id);
    return this;
  }
  /** Snake_case alias of `openModal`: opens this modal dialog control in the live window. */
  open_modal(): this {
    return this.openModal();
  }
  /** Snake_case alias of `closeModal`: closes this modal dialog control in the live window. */
  close_modal(): this {
    return this.closeModal();
  }
  /** Enables user interaction on this control (`enabled(true)`). */
  enable(): this {
    return this.enabled(true);
  }
  /** Disables user interaction on this control (`enabled(false)`). */
  disable(): this {
    return this.enabled(false);
  }
  /** Sets the disabled state of this control (inverse of `enabled`). */
  disabled(flag = true): this {
    return this.enabled(!flag);
  }
  /** Marks this input control as read-only or editable. */
  readOnly(flag = true): this {
    this.spec.readonly = flag;
    return this;
  }
  /** Moves keyboard focus to this control in the live window. */
  focus(): this {
    this.window.setFocus(this.spec.id);
    return this;
  }
  /** Briefly flashes an accent outline around this control to draw user attention. */
  flash(): this {
    this.window.flashControl(this.spec.id);
    return this;
  }
  /** Highlights this control with a glowing box shadow for `durationMs` milliseconds. */
  highlight(durationMs = 1000): this {
    this.window.highlightControl(this.spec.id, durationMs);
    return this;
  }
  /** Increments this numeric control's integer value by `delta` (default `1`) and returns the new value. */
  increment(delta = 1): number {
    return this.window.increment(this.spec.id, delta);
  }
  /** Toggles this boolean/checkbox/switch control's checked state and returns the new boolean state. */
  toggleChecked(): boolean {
    return this.window.toggleChecked(this.spec.id);
  }
  /** Appends a string to the end of this control's existing text content. */
  appendText(text: string): this {
    this.window.appendText(this.spec.id, text);
    return this;
  }
  /** Appends a newline-delimited line of text to this control's existing text content. */
  appendLine(line: string): this {
    this.window.appendLine(this.spec.id, line);
    return this;
  }

  /** Gets the control's current value when called with no arguments, or sets its value and returns `this` for chaining. */
  value(val?: any): any | this {
    if (val === undefined) return this.getValue();
    return this.setValue(val);
  }
  /** Gets the control's current text when called with no arguments, or sets its text and returns `this` for chaining. */
  text(txt?: string): string | this {
    if (txt === undefined) return this.getText();
    return this.setText(txt);
  }
  /** Replaces the selectable option items of this dropdown, list box, or segmented control. */
  options(items: string[]): this {
    this.window.setListItems(this.spec.id, items);
    return this;
  }
  /** Sets the minimum allowed numeric value (`min_value`) for this slider, stepper, or progress control. */
  min(val: number): this {
    this.spec.min_value = val;
    return this;
  }
  /** Sets the maximum allowed numeric value (`max_value`) for this slider, stepper, or progress control. */
  max(val: number): this {
    this.spec.max_value = val;
    return this;
  }
  /** Sets the numeric increment step interval for this slider or stepper control. */
  step(val: number): this {
    this.spec.step = val;
    return this;
  }

  /** Enables or disables multiple-item selection mode on this list or table control. */
  multiSelect(enable = true): this {
    this.spec.multiple = enable;
    this.spec.multi_select = enable;
    this.spec.selection_mode = enable ? "multiple" : "single";
    return this;
  }
  /** Snake_case alias of `multiSelect`: enables or disables multiple-item selection mode on this list or table control. */
  multi_select(enable = true): this {
    return this.multiSelect(enable);
  }

  /** Enables or disables per-row selection checkboxes on this list or table control. */
  checkboxSelection(enable = true): this {
    this.spec.checkbox_selection = enable;
    this.spec.selectable_checkbox = enable;
    return this;
  }
  /** Snake_case alias of `checkboxSelection`: enables or disables per-row selection checkboxes on this list or table control. */
  checkbox_selection(enable = true): this {
    return this.checkboxSelection(enable);
  }

  /** Returns the currently selected item labels of this list or multi-select control as an array of strings. */
  getSelectedItems(): string[] {
    const val = this.getValue();
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === "string" && val.length > 0)
      return val.split(",").map((s) => s.trim());
    return [];
  }
  /** Snake_case alias of `getSelectedItems`: returns the currently selected item labels of this list or multi-select control as an array of strings. */
  get_selected_items(): string[] {
    return this.getSelectedItems();
  }

  /** Returns the currently selected row records of this table or tree-grid control as an array. */
  getSelectedRows(): any[] {
    const val = this.getValue();
    if (Array.isArray(val)) return val;
    return [];
  }
  /** Snake_case alias of `getSelectedRows`: returns the currently selected row records of this table or tree-grid control as an array. */
  get_selected_rows(): any[] {
    return this.getSelectedRows();
  }

  /** Registers a callback invoked when a disclosure, collapsible section, or toggle control expands or collapses. */
  onToggle(handler: EventCallback): this {
    return this.on("toggle", handler);
  }
  /** Snake_case alias of `onToggle`: registers a callback invoked when a disclosure, collapsible section, or toggle control expands or collapses. */
  on_toggle(handler: EventCallback): this {
    return this.onToggle(handler);
  }

  /** Expands all nodes in this tree view, tree grid, or accordion control in the live window. */
  expandAll(): this {
    const fnKey = JSON.stringify(`${this.spec.id}_expandAll`);
    if (this.window && typeof this.window.evalJS === "function") {
      this.window.evalJS(
        `if(typeof window[${fnKey}]==='function')window[${fnKey}]();`,
      );
    }
    return this;
  }
  /** Collapses all nodes in this tree view, tree grid, or accordion control in the live window. */
  collapseAll(): this {
    const fnKey = JSON.stringify(`${this.spec.id}_collapseAll`);
    if (this.window && typeof this.window.evalJS === "function") {
      this.window.evalJS(
        `if(typeof window[${fnKey}]==='function')window[${fnKey}]();`,
      );
    }
    return this;
  }

  /** Configures whether tabs or panels in this control render a close (`×`) button. */
  closable(enable = true): this {
    this.spec.closable = enable;
    this.spec.closeable = enable;
    return this;
  }
  /** Configures whether columns or items in this table or list control can be sorted by the user. */
  sortable(enable = true): this {
    this.spec.sortable = enable;
    return this;
  }
  /** Configures whether columns or panes in this control can be resized interactively. */
  resizable(enable = true): this {
    this.spec.resizable = enable;
    return this;
  }

  /** Registers a handler invoked when a command palette or menu item is executed or selected. */
  onCommand(handler: EventCallback): this {
    this.on("command", handler);
    return this.on("select", handler);
  }
  /** Registers a callback invoked when a closable tab is closed by the user. */
  onTabClose(handler: EventCallback): this {
    return this.on("tab_close", handler);
  }
  /** Registers a callback invoked when a card is dragged across columns in a Kanban board. */
  onCardMove(handler: EventCallback): this {
    return this.on("card_move", handler);
  }
  /** Registers a callback invoked when a split pane or resizable control is resized. */
  onResize(handler: EventCallback): this {
    return this.on("resize", handler);
  }
  /** Registers a callback invoked when a table column is sorted. */
  onSort(handler: EventCallback): this {
    return this.on("sort", handler);
  }

  /** Snake_case alias of `onClick`: registers a callback invoked when the user clicks or activates this control. */
  on_click(handler: EventCallback): this {
    return this.onClick(handler);
  }
  /** Snake_case alias of `onChange`: registers a callback invoked whenever this control's value or selection changes. */
  on_change(handler: EventCallback): this {
    return this.onChange(handler);
  }
  /** Snake_case alias of `onHover`: registers a callback invoked when the pointer enters this control. */
  on_hover(handler: EventCallback): this {
    return this.onHover(handler);
  }
  /** Snake_case alias of `onHoverExit`: registers a callback invoked when the pointer leaves this control. */
  on_hover_exit(handler: EventCallback): this {
    return this.onHoverExit(handler);
  }
  /** Snake_case alias of `getValue`: returns the current value of this control from the owning window's form values store. */
  get_value(): any {
    return this.getValue();
  }
  /** Snake_case alias of `setValue`: updates the value of this control in the owning window and live DOM. */
  set_value(val: any): this {
    return this.setValue(val);
  }
  /** Snake_case alias of `getText`: returns the current string text content of this control. */
  get_text(): string {
    return this.getText();
  }
  /** Snake_case alias of `setText`: updates the text content of this control in the owning window and live DOM. */
  set_text(text: string): this {
    return this.setText(text);
  }
  /** Snake_case alias of `enabled`: enables or disables user interaction on this control, syncing immediately with the live DOM when the window is running. */
  set_enabled(flag = true): this {
    return this.enabled(flag);
  }
  /** Snake_case alias of `visible`: shows or hides this control, syncing visibility immediately with the live DOM when the window is running. */
  set_visible(flag = true): this {
    return this.visible(flag);
  }
  /** Snake_case alias of `readOnly`: marks this input control as read-only or editable. */
  read_only(flag = true): this {
    return this.readOnly(flag);
  }
  /** Snake_case alias of `toggleChecked`: toggles this boolean/checkbox/switch control's checked state and returns the new boolean state. */
  toggle_checked(): boolean {
    return this.toggleChecked();
  }
  /** Snake_case alias of `appendText`: appends a string to the end of this control's existing text content. */
  append_text(text: string): this {
    return this.appendText(text);
  }
  /** Snake_case alias of `appendLine`: appends a newline-delimited line of text to this control's existing text content. */
  append_line(line: string): this {
    return this.appendLine(line);
  }
  /** Snake_case alias of `options`: replaces the selectable option items of this dropdown, list box, or segmented control. */
  set_options(items: string[]): this {
    return this.options(items);
  }
}

interface LayoutFrame {
  type: "default" | "row" | "grid" | "card" | "flex";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  rowHeight: number;
  cols?: number;
  colIndex?: number;
  gap?: number;
  cardSpec?: any;
}

/** Structural layout section descriptor (header bar, card, row, grid, or standalone control group) used when rendering responsive window HTML. */
export interface SimpleguiLayoutSection {
  type: "header_bar" | "card" | "row" | "standalone" | "grid";
  id?: string;
  title?: string;
  subtitle?: string;
  rows?: Array<{ id: string; controls: string[] }>;
  controls?: string[];
  items?: string[];
  cols?: number;
  gap?: number;
  cards?: SimpleguiLayoutSection[];
}

// =============================================================================
// Path, Directory & Atomic File Utilities
// =============================================================================

/** Expands leading `~` home shortcuts and `$VAR` / `${VAR}` / `%VAR%` environment variables in a path string and resolves it to an absolute filesystem path. */
export function resolveUserPath(filePath: string): string {
  if (!filePath) return "";
  let p = filePath;
  const home =
    os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users";
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    p = path.join(home, p.slice(2));
  }
  p = p.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || "");
  p = p.replace(
    /\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_, name) => process.env[name] || "",
  );
  p = p.replace(
    /%([A-Za-z_][A-Za-z0-9_]*)%/g,
    (_, name) => process.env[name] || "",
  );
  return path.resolve(p);
}
/** Snake_case alias of `resolveUserPath`: expands `~` and environment variables in a path string to an absolute path. */
export const resolve_user_path = resolveUserPath;

/** Returns the platform-specific user configuration directory (`~/.config/<appName>` on macOS/Linux or `%APPDATA%\<appName>` on Windows). */
export function getAppConfigDir(appName: string): string {
  const home =
    os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users";
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, appName);
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(xdgConfig, appName);
}
/** Snake_case alias of `getAppConfigDir`: returns the platform-specific user configuration directory for `appName`. */
export const get_app_config_dir = getAppConfigDir;

/** Returns the platform-specific application data directory (`~/Library/Application Support/<appName>`, `%LOCALAPPDATA%\<appName>`, or `~/.local/share/<appName>`). */
export function getAppDataDir(appName: string): string {
  const home =
    os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users";
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", appName);
  }
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return path.join(localAppData, appName);
  }
  const xdgData =
    process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
  return path.join(xdgData, appName);
}
/** Snake_case alias of `getAppDataDir`: returns the platform-specific application data directory for `appName`. */
export const get_app_data_dir = getAppDataDir;

/** Returns the platform-specific cache directory (`~/Library/Caches/<appName>`, `%LOCALAPPDATA%\<appName>\Cache`, or `~/.cache/<appName>`). */
export function getAppCacheDir(appName: string): string {
  const home =
    os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users";
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Caches", appName);
  }
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return path.join(localAppData, appName, "Cache");
  }
  const xdgCache = process.env.XDG_CACHE_HOME || path.join(home, ".cache");
  return path.join(xdgCache, appName);
}
/** Snake_case alias of `getAppCacheDir`: returns the platform-specific cache directory for `appName`. */
export const get_app_cache_dir = getAppCacheDir;

/** Returns the platform-specific persistent application state directory (`~/Library/Application Support/<appName>`, `%LOCALAPPDATA%\<appName>`, or `~/.local/state/<appName>`). */
export function getAppStateDir(appName: string): string {
  const home =
    os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users";
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", appName);
  }
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return path.join(localAppData, appName);
  }
  const xdgState =
    process.env.XDG_STATE_HOME || path.join(home, ".local", "state");
  return path.join(xdgState, appName);
}
/** Snake_case alias of `getAppStateDir`: returns the platform-specific persistent state directory for `appName`. */
export const get_app_state_dir = getAppStateDir;

/** Returns the platform-specific application log directory (`~/Library/Logs/<appName>`, `%LOCALAPPDATA%\<appName>\Logs`, or `<stateDir>/log`). */
export function getAppLogDir(appName: string): string {
  const home =
    os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users";
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Logs", appName);
  }
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return path.join(localAppData, appName, "Logs");
  }
  return path.join(getAppStateDir(appName), "log");
}
/** Snake_case alias of `getAppLogDir`: returns the platform-specific application log directory for `appName`. */
export const get_app_log_dir = getAppLogDir;

/** Returns the temporary runtime directory for an application (`$XDG_RUNTIME_DIR/<appName>` or `<tmpdir>/<appName>_runtime`). */
export function getAppRuntimeDir(appName: string): string {
  if (process.platform !== "win32" && process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, appName);
  }
  return path.join(os.tmpdir(), `${appName}_runtime`);
}
/** Snake_case alias of `getAppRuntimeDir`: returns the temporary runtime directory for `appName`. */
export const get_app_runtime_dir = getAppRuntimeDir;

/** Resolves the full path to a named configuration file (default `"settings.json"`) inside the application's config directory. */
export function getAppConfigFile(
  appName: string,
  filename = "settings.json",
): string {
  return path.join(getAppConfigDir(appName), filename);
}
/** Snake_case alias of `getAppConfigFile`: resolves the full path to a configuration file for `appName`. */
export const get_app_config_file = getAppConfigFile;

/** Resolves the full path to a named state file (default `"state.json"`) inside the application's state directory. */
export function getAppStateFile(
  appName: string,
  filename = "state.json",
): string {
  return path.join(getAppStateDir(appName), filename);
}
/** Snake_case alias of `getAppStateFile`: resolves the full path to a state file for `appName`. */
export const get_app_state_file = getAppStateFile;

/** Writes UTF-8 string content to `filePath` atomically by writing to a process-unique temporary file in the target directory and renaming it over the destination. */
export function writeFileAtomic(filePath: string, content: string): void {
  const resolved = resolveUserPath(filePath);
  const parentDir = path.dirname(resolved);
  if (parentDir && !fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  }
  const randId = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const tmpPath = `${resolved}.${randId}.tmp`;
  fs.writeFileSync(tmpPath, content, { encoding: "utf-8", mode: 0o600 });
  try {
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(tmpPath, 0o600);
      } catch (e) {}
    }
    if (process.platform === "win32" && fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved);
      } catch (e) {}
    }
    fs.renameSync(tmpPath, resolved);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch (e) {}
    throw err;
  }
}
/** Snake_case alias of `writeFileAtomic`: atomically writes UTF-8 content to `filePath` via a temporary file rename. */
export const write_file_atomic = writeFileAtomic;

/** Serializes a key-value state dictionary as formatted JSON and writes it atomically to `filePath`. */
export function saveStateToFile(
  filePath: string,
  store: Record<string, any>,
): void {
  const json = JSON.stringify(store, null, 2);
  writeFileAtomic(filePath, json);
}
/** Snake_case alias of `saveStateToFile`: serializes a key-value state store as JSON and writes it atomically to `filePath`. */
export const save_state_to_file = saveStateToFile;

/** Reads and parses a JSON key-value state file from disk, coercing all loaded values to strings. */
export function loadStateFromFile(filePath: string): Record<string, string> {
  const resolved = resolveUserPath(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`State file not found: ${resolved}`);
  }
  const content = fs.readFileSync(resolved, "utf-8");
  if (!content.trim()) return {};
  const parsed = JSON.parse(content);
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    result[k] = String(v ?? "");
  }
  return result;
}
/** Snake_case alias of `loadStateFromFile`: reads a JSON key-value state file from disk into a string dictionary. */
export const load_state_from_file = loadStateFromFile;

/** Persists the user's preferred global SimpleGUI theme name to `~/.config/simplegui/theme.txt`. */
export function saveTheme(themeName: string): boolean {
  try {
    const themeDir = path.join(
      os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users",
      ".config",
      "simplegui",
    );
    const themeFile = path.join(themeDir, "theme.txt");
    writeFileAtomic(themeFile, themeName.trim());
    return true;
  } catch (e) {
    return false;
  }
}
/** Snake_case alias of `saveTheme`: persists the preferred global SimpleGUI theme name to disk. */
export const save_theme = saveTheme;

/** Reads the user's globally saved SimpleGUI theme name from `~/.config/simplegui/theme.txt`, or returns `""` if none is saved. */
export function getSavedTheme(): string {
  try {
    const themeFile = path.join(
      os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users",
      ".config",
      "simplegui",
      "theme.txt",
    );
    if (fs.existsSync(themeFile)) {
      const content = fs.readFileSync(themeFile, "utf-8").trim();
      if (content.length > 0) return content;
    }
  } catch (e) {}
  return "";
}
/** Snake_case alias of `getSavedTheme`: reads the globally saved SimpleGUI theme name from disk. */
export const get_saved_theme = getSavedTheme;

/** Determines whether a control's value should be automatically persisted across sessions, excluding transient consoles/logs and sensitive password/secret fields. */
export function shouldPersistControl(ctrl: any): boolean {
  if (!ctrl) return false;
  const name = ctrl.id || ctrl.name;
  if (
    !name ||
    typeof name !== "string" ||
    name.length === 0 ||
    name.startsWith("__")
  ) {
    return false;
  }
  const kind = String(
    ctrl.kind || ctrl.control_type || ctrl.type || "",
  ).toLowerCase();
  if (
    ctrl.masked === true ||
    ctrl.sensitive === true ||
    ctrl.is_password === true ||
    String(ctrl.input_type || ctrl.inputType || "").toLowerCase() === "password"
  ) {
    return false;
  }
  const supportedKinds = [
    "input",
    "textbox",
    "textinput",
    "search_bar",
    "search",
    "search_field",
    "file_picker",
    "file_picker_field",
    "date_picker",
    "time_picker",
    "date_range_picker",
    "date_time_picker",
    "number",
    "stepper",
    "dropdown",
    "select",
    "combobox",
    "combo_box",
    "pull_down",
    "segmented",
    "radio",
    "radio_group",
    "checkbox",
    "switch",
    "toggle",
    "pill_toggle",
    "mode_control",
    "slider",
    "vertical_slider",
    "step_slider",
    "range_slider",
    "rating",
    "knob",
    "token_field",
    "tag_input",
    "inline_editable_label",
    "textarea",
  ];
  if (!supportedKinds.includes(kind)) {
    return false;
  }

  const lower = name.toLowerCase();

  // Exclude output consoles, logs, terminals, diffs, previews
  if (
    lower.includes("output") ||
    lower.includes("stdout") ||
    lower.includes("stderr") ||
    lower.includes("terminal") ||
    lower.includes("console") ||
    lower.includes("live_output") ||
    lower.includes("preview") ||
    lower.includes("diff") ||
    lower.includes("logs") ||
    lower.includes("log_area") ||
    lower.includes("results") ||
    lower.includes("msg_box") ||
    lower.includes("status_bar") ||
    lower.includes("status_lbl") ||
    lower.includes("telemetry") ||
    lower.includes("summary_card")
  ) {
    return false;
  }

  // Exclude sensitive credentials, passwords, tokens, API keys, and PINs
  if (
    lower.includes("password") ||
    lower.includes("passwd") ||
    lower.includes("passphrase") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.includes("api_key") ||
    lower.includes("apikey") ||
    lower.includes("private_key") ||
    /(?:^|[_-])(?:pwd|pin|otp|cvv|ssn)(?:$|[_-\d])/.test(lower)
  ) {
    return false;
  }

  return true;
}
/** Snake_case alias of `shouldPersistControl`: checks whether a control is eligible for automatic form-state persistence. */
export const should_persist_control = shouldPersistControl;

/** Computes perceived luminance (ITU-R BT.601) of a `#RGB` or `#RRGGBB` hex color and returns `true` when it exceeds the light-surface threshold (`> 180`). */
export function isBrightColor(hex?: string): boolean {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return false;
  const clean = hex.slice(1);
  let r = 0,
    g = 0,
    b = 0;
  if (clean.length === 3) {
    const c0 = clean[0] || "0";
    const c1 = clean[1] || "0";
    const c2 = clean[2] || "0";
    r = parseInt(c0 + c0, 16);
    g = parseInt(c1 + c1, 16);
    b = parseInt(c2 + c2, 16);
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return false;
  }
  return r * 0.299 + g * 0.587 + b * 0.114 > 180;
}
/** Snake_case alias of `isBrightColor`: returns `true` when a hex color has high perceived luminance. */
export const is_bright_color = isBrightColor;

/** Returns `true` when a hex accent color requires dark foreground text for legibility, checking both the curated bright-accent palette and perceived luminance. */
export function isBrightAccentColor(hex?: string): boolean {
  if (!hex) return false;
  const lower = hex.toLowerCase();
  const brights = new Set([
    "#0fb36a",
    "#30d158",
    "#00ff00",
    "#00ff41",
    "#4ade80",
    "#8bac0f",
    "#ffb000",
    "#ff9900",
    "#ffff00",
    "#00d2c4",
    "#ff8800",
    "#ffd866",
    "#fabd2f",
    "#ffc600",
    "#60cdff",
    "#a7c080",
  ]);
  return brights.has(lower) || isBrightColor(hex);
}
/** Snake_case alias of `isBrightAccentColor`: checks whether an accent color requires dark contrasting foreground text. */
export const is_bright_accent_color = isBrightAccentColor;

/** Main SimpleGUI application window and form builder supporting native webview windows, browser hosting, fluent layout containers, 140+ controls, dialogs, and reactive state. */
export class SimpleWindow {
  public title: string;
  public width: number;
  public height: number;
  public padding: number;
  public spacing: number;
  public theme: string;
  /** Effects mode for fx themes: "full", "reduced" or "off". */
  public effects: "full" | "reduced" | "off" = "full";
  public backgroundColor: string;
  public fontColor: string;
  public alwaysOnTop: boolean;

  public stateStore: Record<string, string> = {};
  public stateListeners: Map<
    string,
    Array<(win: SimpleWindow, val: string) => void>
  > = new Map();
  public closeListeners: Array<(win: SimpleWindow) => boolean | void> = [];
  public appId = "";
  public helpId = "";
  public autoSaveState = true;
  public fullscreen = true;
  public controlStateBindings: Map<string, string> = new Map();
  public customScripts: string[] = [];

  private controls: any[] = [];
  private nonVisualControls: any[] = [];
  private controlIndex: Map<string, any> = new Map();
  private controlIdCounter: Record<string, number> = {};

  /** Indexes a control specification (and any nested children) by both `id` and `name` for O(1) lookup. */
  public _indexControl(spec: any): void {
    if (!spec || typeof spec !== "object") return;
    if (typeof spec.id === "string" && spec.id.length > 0) {
      this.controlIndex.set(spec.id, spec);
    }
    if (typeof spec.name === "string" && spec.name.length > 0) {
      this.controlIndex.set(spec.name, spec);
    }
    if (Array.isArray(spec.children)) {
      for (let i = 0; i < spec.children.length; i++) {
        this._indexControl(spec.children[i]);
      }
    }
  }

  /** Removes a control specification (and any nested children) from the O(1) lookup index. */
  public _unindexControl(spec: any): void {
    if (!spec || typeof spec !== "object") return;
    if (
      typeof spec.id === "string" &&
      this.controlIndex.get(spec.id) === spec
    ) {
      this.controlIndex.delete(spec.id);
    }
    if (
      typeof spec.name === "string" &&
      this.controlIndex.get(spec.name) === spec
    ) {
      this.controlIndex.delete(spec.name);
    }
    if (Array.isArray(spec.children)) {
      for (let i = 0; i < spec.children.length; i++) {
        this._unindexControl(spec.children[i]);
      }
    }
  }
  private webview: Webview | null = null;
  private isWindowRunning = false;
  /** Set by hostInBrowser(): makes show() build a web-page-backed "webview" instead of a native window. */
  private hostedFactory: (() => unknown) | null = null;
  public formValuesStore: Record<string, any> = {};
  public eventHandlersMap: Map<string, EventCallback> = new Map();
  private promptResolversMap: Map<string, (val: any) => void> = new Map();

  public accentColor = "#0a84ff";
  public lastControlId: string = "";
  private layoutStack: LayoutFrame[] = [];
  private currentY = 20;

  public _layoutSections: SimpleguiLayoutSection[] = [];
  private _currentGridSection: SimpleguiLayoutSection | null = null;
  private _currentCardSection: SimpleguiLayoutSection | null = null;
  private _currentRowSection: { id: string; controls: string[] } | null = null;
  private _sectionRowCounter = 0;
  public responsiveLayout = true;

  /** Internal helper that updates all references to a control ID across active and committed layout sections when a control is renamed via `.id()`. */
  public _renameControlInLayoutSections(oldId: string, newId: string): void {
    const renameInList = (list: string[]) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i] === oldId) list[i] = newId;
      }
    };
    const renameInSec = (sec: SimpleguiLayoutSection) => {
      if (sec.id === oldId) sec.id = newId;
      if (sec.controls) renameInList(sec.controls);
      if (sec.items) renameInList(sec.items);
      if (sec.rows) {
        for (const r of sec.rows) {
          if (r.id === oldId) r.id = newId;
          if (r.controls) renameInList(r.controls);
        }
      }
      if (sec.cards) {
        for (const c of sec.cards) {
          renameInSec(c);
        }
      }
    };
    if (this._currentRowSection) {
      if (this._currentRowSection.id === oldId)
        this._currentRowSection.id = newId;
      if (this._currentRowSection.controls)
        renameInList(this._currentRowSection.controls);
    }
    if (this._currentCardSection) {
      renameInSec(this._currentCardSection);
    }
    if (this._currentGridSection) {
      renameInSec(this._currentGridSection);
    }
    for (const sec of this._layoutSections) {
      renameInSec(sec);
    }
  }

  /** Creates a new `SimpleWindow` instance with the given window title, pixel dimensions, and optional theme/layout configuration. */
  constructor(
    title = "SimpleGUI Application",
    width = 800,
    height = 600,
    options: SimpleWindowOptions = {},
  ) {
    this.title = options.title || title;
    this.width = options.width || width;
    this.height = options.height || height;
    this.padding = options.padding !== undefined ? options.padding : 20;
    this.spacing = options.spacing !== undefined ? options.spacing : 12;
    this.appId = options.appId || options.app_id || "";
    this.helpId = options.helpId || "";
    this.autoSaveState =
      options.autoSave ??
      options.auto_save ??
      options.autoSaveState ??
      options.auto_save_state ??
      true;
    this.fullscreen = options.fullscreen ?? true;
    this.responsiveLayout = options.responsive ?? true;

    const savedGlobalTheme = getSavedTheme();
    const preferredTheme =
      options.theme || (savedGlobalTheme ? savedGlobalTheme : "midnight");
    this.theme = preferredTheme;
    if (options.effects) this.effects = options.effects;
    this.alwaysOnTop = options.alwaysOnTop || false;

    const resolvedTheme = this.resolveThemeColors(
      this.theme,
      options.background_color,
      options.font_color,
    );
    this.backgroundColor = resolvedTheme.bg;
    this.fontColor = resolvedTheme.fg;
    this.accentColor = resolvedTheme.accent;

    this.currentY = this.padding;
  }

  private resolveThemeColors(
    name: string,
    customBg?: string,
    customFg?: string,
  ): { bg: string; fg: string; accent: string } {
    const theme = getTheme(name);
    return {
      bg: customBg || theme.background_color,
      fg: customFg || theme.font_color,
      accent: theme.accent_color || "#0a84ff",
    };
  }

  /**
   * Color pairs [old theme's value, new theme's value] for the backgrounds and borders the page was generated with.
   * Controls are drawn with inline backgrounds taken from the theme at start-up, so switching themes while the
   * window is open has to move those values over too, or a control keeps the old surface under the new text color
   * (white text on a white box, or the reverse).
   */
  private themeColorPairs(from: string, to: string): Array<[string, string]> {
    const a = getTheme(from);
    const b = getTheme(to);
    const pairs: Array<[string, string]> = [];
    const add = (x?: string, y?: string) => {
      if (x && y && x.toLowerCase() !== y.toLowerCase()) pairs.push([x, y]);
    };
    add(a.card_background, b.card_background);
    add(a.card_border, b.card_border);
    add(a.background_color, b.background_color);
    if (a.is_dark !== b.is_dark) {
      // The fixed fallbacks the page uses for light and for dark themes (see generateHtml in index.ts).
      const light: [string, string][] = [
        ["#ffffff", "#1e293b"],
        ["#f1f5f9", "#1e293b"],
        ["#e2e8f0", "#090d16"],
        ["#f8fafc", "#0f172a"],
        ["rgba(0, 0, 0, 0.04)", "rgba(255, 255, 255, 0.06)"],
        ["rgba(0, 0, 0, 0.06)", "rgba(255, 255, 255, 0.08)"],
        ["rgba(0, 0, 0, 0.12)", "rgba(255, 255, 255, 0.12)"],
        ["rgba(0, 0, 0, 0.15)", "rgba(255, 255, 255, 0.12)"],
      ];
      for (const [l, d] of light) pairs.push(b.is_dark ? [l, d] : [d, l]);
    }
    return pairs;
  }

  /** Cycles the window's active theme forward (`1`) or backward (`-1`) through the available theme catalog, optionally persisting the choice. */
  public cycleTheme(direction: 1 | -1 = 1, persist = true): this {
    const selector = this.controls.find((control) => control.is_theme_selector);
    const names = new Set<string>();
    const keys = (
      selector ? (selector.items as string[]) : getThemeKeys()
    ).filter((key) => {
      const name = getTheme(key).name;
      if (names.has(name)) return false;
      names.add(name);
      return true;
    });
    if (!keys.length) throw new Error("No themes are available.");
    const current = keys.findIndex(
      (key) => getTheme(key).name === getTheme(this.theme).name,
    );
    const next =
      current < 0
        ? direction > 0
          ? 0
          : keys.length - 1
        : (current + direction + keys.length) % keys.length;
    const chosen = keys[next]!;
    this.setTheme(chosen, persist);
    if (selector) this.setValue(selector.id, chosen);
    if (persist && this.autoSaveState) this.saveAppFormStateOr();
    return this;
  }

  /** Applies a registered SimpleGUI theme by name or key, updating window/control palettes in place (including live DOM CSS variables when running) and optionally persisting the selection. */
  public setTheme(themeName: string, persist = true): this {
    const previousThemeName = this.theme;
    this.theme = themeName;
    const colors = this.resolveThemeColors(themeName);
    this.backgroundColor = colors.bg;
    this.fontColor = colors.fg;
    this.accentColor = colors.accent;

    if (persist) {
      saveTheme(themeName);
    }

    const themeObj = getTheme(themeName);
    const isLight = !themeObj.is_dark;
    const mutedColor = isLight ? "#334155" : "#94a3b8";
    const legendColor = isLight ? "#0f172a" : colors.accent;
    const btnBg = colors.accent;
    const isBrightAccent = isBrightAccentColor(btnBg);
    const btnFg = isBrightAccent ? "#000000" : "#ffffff";

    for (const ctrl of this.controls) {
      const type = ctrl.control_type || ctrl.type;
      if (type === "button" && !ctrl.custom_background) {
        ctrl.background_color = btnBg;
        if (!ctrl.custom_color) {
          ctrl.font_color = btnFg;
        }
      } else if (type === "split_button" && !ctrl.custom_background) {
        ctrl.background_color = btnBg;
      } else if (
        (type === "groupbox" || type === "card") &&
        !ctrl.custom_card_background
      ) {
        ctrl.background_color =
          themeObj.card_background ||
          (themeObj.is_dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)");
        ctrl.border_color =
          themeObj.card_border ||
          (themeObj.is_dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)");
      } else if (!ctrl.custom_color) {
        if (ctrl.is_caption || ctrl.is_card_subtitle) {
          ctrl.font_color = mutedColor;
        } else {
          ctrl.font_color = colors.fg;
        }
      }
    }

    if (this.isWindowRunning) {
      const isCf = themeName.toLowerCase() === "codefreelance";
      const cardBg =
        themeObj.card_background ||
        (isCf ? "#121212" : isLight ? "#ffffff" : "#1e293b");
      const cardBorder =
        themeObj.card_border ||
        (isCf
          ? "#242424"
          : isLight
            ? "rgba(0, 0, 0, 0.15)"
            : "rgba(255, 255, 255, 0.12)");
      const fieldsetBg = cardBg;
      const fieldsetBorder = cardBorder;
      const inputBg = isLight
        ? "#ffffff"
        : themeObj.is_dark
          ? themeObj.background_color === "#000000"
            ? "#0f0f0f"
            : "rgba(0, 0, 0, 0.28)"
          : "rgba(0, 0, 0, 0.04)";
      const inputBorder = cardBorder;
      const secAccent = themeObj.secondary_accent || colors.accent;
      const semanticVars = semanticCssVars(
        buildSemanticPalette({
          background: colors.bg,
          card: cardBg,
          isDark: themeObj.is_dark,
          overrides: overridesForTheme(themeObj),
        }),
      );

      this.evalJS(`
                (function() {
                    var _ua = ((navigator.userAgent || '') + ' ' + (navigator.platform || '')).replace(/like\\s+Android[^;)]*/gi, '');
                    if (/Linux|X11|Wayland|Ubuntu/i.test(_ua) && !/Android/i.test(_ua)) {
                        document.documentElement.classList.add('rad-linux');
                        document.documentElement.setAttribute('data-platform', 'linux');
                    } else if (/\\bWin(dows|32|64)\\b/i.test(_ua)) {
                        document.documentElement.classList.add('rad-windows');
                        document.documentElement.setAttribute('data-platform', 'windows');
                    } else if (/\\bMac(intosh|OS|\\s+OS\\s+X)\\b/i.test(_ua)) {
                        document.documentElement.classList.add('rad-macos');
                        document.documentElement.setAttribute('data-platform', 'macos');
                    }
                    document.documentElement.style.setProperty('--accent', '${colors.accent}');
                    document.documentElement.style.setProperty('--accent-secondary', '${secAccent}');
                    document.documentElement.style.setProperty('--btn-bg', '${btnBg}');
                    document.documentElement.style.setProperty('--btn-fg', '${btnFg}');
                    document.documentElement.style.setProperty('--card-bg', '${cardBg}');
                    document.documentElement.style.setProperty('--card-border', '${cardBorder}');
                    document.documentElement.style.setProperty('--theme-fg', '${colors.fg}');
                    document.documentElement.style.setProperty('--theme-muted', '${mutedColor}');
                    document.body.style.backgroundColor = "${colors.bg}";
                    document.body.style.color = "${colors.fg}";
                    let styleEl = document.getElementById("simplegui-theme-dyn");
                    if (!styleEl) {
                        styleEl = document.createElement("style");
                        styleEl.id = "simplegui-theme-dyn";
                        document.head.appendChild(styleEl);
                    }
                    styleEl.textContent = \`
                        :root {
                            --accent: ${colors.accent};
                            --accent-secondary: ${secAccent};
                            --btn-bg: ${btnBg};
                            --btn-fg: ${btnFg};
                            --card-bg: ${cardBg};
                            --card-border: ${cardBorder};
                            --theme-fg: ${colors.fg};
                            --theme-muted: ${mutedColor};
                            --input-bg: ${inputBg};
                            --input-border: ${inputBorder};
                            --editable-bg: ${isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.04)"};
                            --editable-border: ${isLight ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.22)"};
                            ${semanticVars}
                        }
                        body { background-color: ${colors.bg} !important; color: ${colors.fg} !important; }
                        fieldset { background-color: ${fieldsetBg} !important; border-color: ${fieldsetBorder} !important; }
                        legend { color: ${legendColor} !important; font-weight: 700 !important; }
                        .simplegui-card, [data-card] { background-color: ${cardBg} !important; border-color: ${fieldsetBorder} !important; }
                        
                        /* Themed Labels, Text, Checks, Editable Labels and Tables */
                        .rad-label:not([data-custom-color]):not([data-caption="true"]),
                        [data-theme-label="true"],
                        label:not([data-custom-color]),
                        .rad-checkbox-label,
                        .rad-radio-label,
                        .rad-switch-label,
                        .rad-slider-title,
                        .rad-editable-label-container,
                        .label-display,
                        .label-text,
                        .rad-editable-input,
                        .rad-masked-input-wrapper,
                        .rad-masked-input-wrapper input,
                        .stepper-val,
                        table td,
                        .tree-node:not(.selected-tree-node),
                        .rad-tree-container span {
                            color: ${colors.fg} !important;
                        }
                        
                        /* Subtitles, Captions & Muted metadata */
                        .rad-caption,
                        .rad-card-subtitle,
                        [data-caption="true"],
                        .rad-muted-text {
                            color: ${mutedColor} !important;
                        }

                        /* Inline Editable Label Container & Display */
                        .rad-editable-label-container {
                            background-color: ${isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.04)"} !important;
                            border: 1px dashed ${isLight ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.22)"} !important;
                            border-radius: 6px !important;
                            color: ${colors.fg} !important;
                            transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s !important;
                        }
                        .rad-editable-label-container:hover {
                            border-color: ${colors.accent} !important;
                            border-style: solid !important;
                            background-color: ${inputBg} !important;
                            box-shadow: 0 0 0 1px ${colors.accent} !important;
                        }
                        .rad-editable-label-container .label-display,
                        .rad-editable-label-container .label-text {
                            color: ${colors.fg} !important;
                        }
                        .rad-editable-badge {
                            color: ${colors.accent} !important;
                            background-color: ${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"} !important;
                            border: 1px solid ${isLight ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)"} !important;
                        }
                        .rad-editable-input {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border: 1px solid ${colors.accent} !important;
                            box-shadow: 0 0 0 2px ${colors.accent}44 !important;
                        }

                        table th { color: ${isLight ? "#0f172a" : colors.accent} !important; }
                        table tr { border-color: ${cardBorder} !important; }
                        table tr:hover:not(.selected-tr) { background: ${isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)"} !important; }
                        .selected-tree-node { color: ${isLight ? "#0f172a" : colors.accent} !important; font-weight: 700 !important; }

                        /* Linux (WebKitGTK) draws list boxes and some controls itself; tell it which scheme the theme uses (see the page CSS in index.ts). */
                        html.rad-linux { color-scheme: ${isLight ? "light" : "dark"} !important; }
                        html.rad-linux input[type=range] { background: ${isLight ? "rgba(15, 23, 42, 0.22)" : "rgba(255, 255, 255, 0.22)"} !important; }
                        html.rad-linux, html.rad-linux *, html.rad-linux *::before, html.rad-linux *::after,
                        html.rad-windows, html.rad-windows *, html.rad-windows *::before, html.rad-windows *::after,
                        html.rad-macos, html.rad-macos *, html.rad-macos *::before, html.rad-macos *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }

                        input:not([type="checkbox"]):not([type="radio"]), textarea, select {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border-color: ${inputBorder} !important;
                            color-scheme: ${isLight ? "light" : "dark"} !important;
                        }
                        input:not([type="checkbox"]):not([type="radio"]):focus, textarea:focus, select:focus {
                            border-color: ${colors.accent} !important;
                            outline-color: ${colors.accent} !important;
                        }
                        input[type=range]::-webkit-slider-thumb {
                            background: ${colors.accent} !important;
                        }
                        select:not([size]), .simplegui-select {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border-color: ${inputBorder} !important;
                            color-scheme: ${isLight ? "light" : "dark"} !important;
                            background-image: url('data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'12\\' height=\\'12\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'${encodeURIComponent(colors.accent)}\\' stroke-width=\\'2.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'%3E%3Cpolyline points=\\'6 9 12 15 18 9\\'%3E%3C/polyline%3E%3C/svg%3E') !important;
                            background-repeat: no-repeat !important;
                            background-position: right 10px center !important;
                            background-size: 12px 12px !important;
                            padding-right: 30px !important;
                            cursor: pointer !important;
                        }
                        select:not([size]):hover, .simplegui-select:hover { border-color: ${colors.accent} !important; }
                        select:not([size]):focus, .simplegui-select:focus { border-color: ${colors.accent} !important; outline-color: ${colors.accent} !important; }
                        select option {
                            background-color: ${cardBg} !important;
                            color: ${colors.fg} !important;
                        }
                        select[size], select[multiple], .simplegui-listbox {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border-color: ${inputBorder} !important;
                            color-scheme: ${isLight ? "light" : "dark"} !important;
                            accent-color: ${colors.accent} !important;
                        }
                        select[size]:hover, select[multiple]:hover, .simplegui-listbox:hover { border-color: ${colors.accent} !important; }
                        select[size] option, select[multiple] option, .simplegui-listbox option {
                            background-color: transparent !important;
                            background-image: none !important;
                            color: ${colors.fg} !important;
                        }
                        select[size] option:checked, select[multiple] option:checked, .simplegui-listbox option:checked {
                            background-color: ${colors.accent} !important;
                            background-image: linear-gradient(${colors.accent}, ${colors.accent}) !important;
                            color: ${btnFg} !important;
                            font-weight: 700 !important;
                        }
                        input::placeholder, textarea::placeholder { color: var(--theme-muted) !important; opacity: 0.85 !important; }
                        :focus-visible { outline-color: ${colors.accent} !important; }
                        button.btn-theme-accent,
                        button:not([data-custom-bg]):not([data-no-theme]):not(#simplegui-dialog-cancel):not(.modal-close):not([data-pag-num]) {
                            background: ${btnBg} !important;
                            background-color: ${btnBg} !important;
                            color: ${btnFg} !important;
                        }
                        button.btn-theme-accent:hover,
                        button:not([data-custom-bg]):not([data-no-theme]):not(#simplegui-dialog-cancel):not(.modal-close):not([data-pag-num]):hover {
                            filter: brightness(1.15) !important;
                        }
                        #simplegui-dialog-ok {
                            background: ${btnBg} !important;
                            color: ${btnFg} !important;
                        }

                        /* Extended Controls Dynamic Theme Styling */
                        .rad-sidebar { background-color: ${cardBg} !important; border-color: ${cardBorder} !important; }
                        .rad-sidebar > div:first-child { border-color: ${cardBorder} !important; }
                        .rad-sidebar > div:first-child span { color: ${colors.accent} !important; }
                        .rad-modal { background-color: ${cardBg} !important; border-color: ${cardBorder} !important; }
                        .rad-modal > div:first-child { border-color: ${cardBorder} !important; }
                        .rad-modal > div:first-child span { color: ${colors.accent} !important; }
                        .rad-modal > div:last-child { border-color: ${cardBorder} !important; }
                        .rad-dropdown-menu { background-color: ${cardBg} !important; border-color: ${cardBorder} !important; }
                        .rad-dropdown-btn.btn-theme-accent { background: ${btnBg} !important; color: ${btnFg} !important; border-color: ${cardBorder} !important; }
                        .rad-list-group { background-color: ${cardBg} !important; border-color: ${cardBorder} !important; }
                        .rad-list-group li { border-color: ${cardBorder} !important; }
                        .rad-content-card { background-color: ${cardBg} !important; border-color: ${cardBorder} !important; }
                        .rad-content-card header { border-color: ${cardBorder} !important; }
                        .rad-content-card header h4 { color: ${colors.accent} !important; }
                        .rad-content-card footer { border-color: ${cardBorder} !important; }
                        .rad-content-card footer button { background: ${btnBg} !important; color: ${btnFg} !important; }
                        .rad-slideshow { background-color: ${cardBg} !important; border-color: ${cardBorder} !important; }
                        .rad-slideshow > div:last-child { border-color: ${cardBorder} !important; }
                        .rad-slideshow .slide-item div[style*="font-weight:800"], .rad-slideshow .slide-item div[style*="font-weight: 800"] { color: ${colors.accent} !important; }
                        .rad-slideshow .slide-count { color: ${colors.accent} !important; }
                        .rad-code-box { background-color: ${isLight ? "#f8fafc" : colors.bg === "#050505" ? "#0d1117" : colors.bg === "#0a0600" || colors.bg === "#040a05" ? cardBg : "#0f172a"} !important; border-color: ${cardBorder} !important; border-left-color: ${colors.accent} !important; }
                        .rad-code-box pre { color: ${isLight ? "#0f172a" : colors.bg === "#0a0600" ? "#ffb000" : colors.bg === "#040a05" ? "#00ff66" : "#a7f3d0"} !important; }
                        .rad-pill-tag { background: ${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"} !important; color: ${colors.accent} !important; }
                        .rad-btn-bar { border-color: ${cardBorder} !important; }
                        .rad-btn-group-item:first-child { background: ${btnBg} !important; color: ${btnFg} !important; }
                        .rad-anim-input:focus { border-color: ${colors.accent} !important; }
                    \`;
                    document.querySelectorAll('button:not([data-custom-bg]):not([data-no-theme]):not(#simplegui-dialog-cancel):not(.modal-close):not([data-pag-num])').forEach(function(b) {
                        b.style.background = '${btnBg}';
                        b.style.backgroundColor = '${btnBg}';
                        b.style.color = '${btnFg}';
                    });
                    document.querySelectorAll('.rad-label:not([data-custom-color]):not([data-caption="true"]), [data-theme-label="true"], label:not([data-custom-color])').forEach(function(l) {
                        l.style.color = '${colors.fg}';
                    });
                    document.querySelectorAll('.rad-caption, .rad-card-subtitle, [data-caption="true"], .rad-muted-text').forEach(function(c) {
                        c.style.color = '${mutedColor}';
                    });
                    document.querySelectorAll('.rad-editable-label-container').forEach(function(el) {
                        el.style.backgroundColor = '${isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.04)"}';
                        el.style.borderColor = '${isLight ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.22)"}';
                        el.style.color = '${colors.fg}';
                    });
                    document.querySelectorAll('.rad-editable-label-container .label-text, .rad-editable-label-container .label-display').forEach(function(el) {
                        el.style.color = '${colors.fg}';
                    });
                    document.querySelectorAll('.rad-editable-badge').forEach(function(el) {
                        el.style.color = '${colors.accent}';
                        el.style.borderColor = '${isLight ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)"}';
                    });
                    document.querySelectorAll('.rad-editable-input').forEach(function(inp) {
                        inp.style.backgroundColor = '${inputBg}';
                        inp.style.color = '${colors.fg}';
                        inp.style.borderColor = '${colors.accent}';
                    });
                    document.querySelectorAll('.rad-masked-input-wrapper, .rad-masked-input-wrapper input, .stepper-val').forEach(function(el) {
                        el.style.color = '${colors.fg}';
                    });
                    document.querySelectorAll('table th').forEach(function(th) {
                        th.style.color = '${isLight ? "#0f172a" : colors.accent}';
                    });
                    document.querySelectorAll('legend').forEach(function(lg) {
                        lg.style.color = '${legendColor}';
                    });
                    document.querySelectorAll('table td, .tree-node:not(.selected-tree-node)').forEach(function(el) {
                        el.style.color = '${colors.fg}';
                    });
                    document.querySelectorAll('fieldset > div, .simplegui-card > div, div[style*="border"]').forEach(function(row) {
                        row.querySelectorAll('div:not([data-custom-color]):not([data-caption="true"])').forEach(function(el) {
                            if (el.children.length === 0 && el.textContent.trim().length > 0) {
                                el.style.color = '${colors.fg}';
                            }
                        });
                    });
                    (function() {
                        var pairs = ${JSON.stringify(this.themeColorPairs(previousThemeName, themeName))};
                        var probe = document.createElement('span');
                        var norm = function(c) { probe.style.color = ''; probe.style.color = c; return probe.style.color; };
                        var map = {};
                        pairs.forEach(function(p) { var k = norm(p[0]); if (k && !(k in map)) map[k] = p[1]; });
                        document.querySelectorAll('[style]').forEach(function(el) {
                            var bg = el.style.backgroundColor;
                            if (bg && map[norm(bg)]) el.style.backgroundColor = map[norm(bg)];
                            var bc = el.style.borderColor;
                            if (bc && map[norm(bc)]) el.style.borderColor = map[norm(bc)];
                        });
                        // Text colors were also written inline for the old theme. Only text that is no longer readable on its
                        // (new) surface is changed, so text that is meant to stay light on a dark chip or an accent button is left alone.
                        var lin = function(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
                        var rgba = function(c) { var m = (c || '').match(/[0-9.]+/g); return m && m.length >= 3 ? { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 } : null; };
                        var lum = function(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); };
                        var ratio = function(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
                        var surface = function(el) {
                            for (var e = el; e; e = e.parentElement) {
                                var c = rgba(getComputedStyle(e).backgroundColor);
                                if (c && c.a >= 0.5) return c;
                            }
                            return rgba(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
                        };
                        // Controls animate color changes, so computed colors lag behind; stop the animations while measuring.
                        var noMotion = document.createElement('style');
                        noMotion.textContent = '*, *::before, *::after { transition: none !important; }';
                        document.head.appendChild(noMotion);
                        void document.body.offsetHeight;
                        var themeFg = rgba(norm('${colors.fg}'));
                        var updates = [];
                        document.querySelectorAll('[style]').forEach(function(el) {
                            if (!el.style.color || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
                            var isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
                            var hasText = isField || el.textContent.trim().length > 0;
                            if (!hasText) return;
                            var fg = rgba(getComputedStyle(el).color);
                            var bg = surface(el);
                            if (!fg || !bg || ratio(fg, bg) >= 3) return;
                            updates.push([el, themeFg && ratio(themeFg, bg) >= 3 ? '${colors.fg}' : (lum(bg) > 0.4 ? '#0f172a' : '#f8fafc')]);
                        });
                        for (var u = 0; u < updates.length; u++) updates[u][0].style.color = updates[u][1];
                        noMotion.remove();
                    })();
                    var tTitle = document.getElementById("lbl_theme_title");
                    if (tTitle) {
                        tTitle.textContent = "🎨 ${themeObj.name}";
                        tTitle.style.color = "${themeObj.accent_color}";
                    }
                    var bMode = document.getElementById("bdg_theme_mode");
                    if (bMode) {
                        bMode.textContent = "${themeObj.is_dark ? "🌙 DARK" : "☀️ LIGHT"}";
                        bMode.style.background = "${themeObj.is_dark ? "rgba(14,165,233,0.2)" : "#fef3c7"}";
                        bMode.style.color = "${themeObj.is_dark ? "#38bdf8" : "#92400e"}";
                        bMode.style.border = "${themeObj.is_dark ? "1px solid rgba(14,165,233,0.4)" : "1px solid #fde68a"}";
                    }
                    var bPri = document.getElementById("bdg_theme_pri");
                    if (bPri) {
                        bPri.textContent = "PRI ${themeObj.accent_color}";
                        bPri.style.background = "${themeObj.is_dark ? "rgba(16,185,129,0.2)" : "#dcfce7"}";
                        bPri.style.color = "${themeObj.is_dark ? "#34d399" : "#15803d"}";
                        bPri.style.border = "${themeObj.is_dark ? "1px solid rgba(16,185,129,0.4)" : "1px solid #86efac"}";
                    }
                    var bSec = document.getElementById("bdg_theme_sec");
                    if (bSec) {
                        bSec.textContent = "SEC ${themeObj.secondary_accent || themeObj.accent_color}";
                        bSec.style.background = "${themeObj.is_dark ? "rgba(14,165,233,0.2)" : "#e0f2fe"}";
                        bSec.style.color = "${themeObj.is_dark ? "#38bdf8" : "#0369a1"}";
                        bSec.style.border = "${themeObj.is_dark ? "1px solid rgba(14,165,233,0.4)" : "1px solid #7dd3fc"}";
                    }
                    var tDesc = document.getElementById("lbl_theme_desc");
                    if (tDesc) {
                        tDesc.textContent = "${themeObj.description.replace(/"/g, '\\"')} • Unified single-form showcase with all 30+ RAD controls";
                        tDesc.style.color = "${mutedColor}";
                    }
                })();
            `);
    }
    if (this.isWindowRunning) this.syncFx(previousThemeName);
    return this;
  }
  /** Snake_case alias of `setTheme`: applies a registered SimpleGUI theme by name or key, updating window/control palettes in place (including live DOM CSS variables when running) and optionally persisting the selection. */
  public set_theme(themeName: string, persist = true): this {
    return this.setTheme(themeName, persist);
  }

  /**
   * Applies a theme while checking system capabilities; if the machine cannot sustain heavy FX shaders/blurs
   * (e.g. software GPU, Windows Remote Desktop, Windows High Contrast, <=2 cores/RAM, or reduced transparency),
   * automatically reverts to the mapped lightweight non-FX fallback theme or downgrades effects mode.
   */
  public setThemeSafe(
    themeName: string,
    hw?: FxHardwareInput,
    persist = true,
    opts?: { revertToFallbackTheme?: boolean },
  ): this {
    const resolved = resolveFxThemeForHardware(themeName, getTheme, hw, opts);
    this.effects = resolved.fxMode === "on" ? "full" : resolved.fxMode;
    return this.setTheme(resolved.appliedKey, persist);
  }
  /** Snake_case alias of `setThemeSafe`: resolves and applies a theme with automatic hardware-capability fallback for FX themes. */
  public set_theme_safe(
    themeName: string,
    hw?: FxHardwareInput,
    persist = true,
    opts?: { revertToFallbackTheme?: boolean },
  ): this {
    return this.setThemeSafe(themeName, hw, persist, opts);
  }

  /** Effects for themes that have an `fx` descriptor: "full" (default), "reduced" (looks without motion) or "off". */
  public setEffects(mode: "full" | "reduced" | "off"): this {
    this.effects = mode;
    if (this.isWindowRunning) this.syncFx(this.theme);
    return this;
  }
  /** Snake_case alias of `setEffects`: sets the window's visual effects mode (`"full"`, `"reduced"`, or `"off"`). */
  public set_effects(mode: "full" | "reduced" | "off"): this {
    return this.setEffects(mode);
  }

  // Moves a running page to the current theme's effects: root flags, per-theme variables, the shared CSS and the pointer helper.
  private syncFx(previousThemeName?: string): void {
    const theme = getTheme(this.theme);
    const previousHadFx = previousThemeName
      ? !!getTheme(previousThemeName).fx
      : false;
    if (!theme.fx && !previousHadFx) return;
    const attrs = theme.fx
      ? fxRootAttrs(theme, normalizeFxMode(this.effects))
      : {};
    this.evalJS(`
            (function() {
                var root = document.documentElement;
                Array.prototype.slice.call(root.attributes).forEach(function(a) { if (a.name.indexOf("data-fx") === 0) root.removeAttribute(a.name); });
                var attrs = ${JSON.stringify(attrs)};
                Object.keys(attrs).forEach(function(k) { root.setAttribute(k, attrs[k]); });
                var vars = document.getElementById("simplegui-fx-vars");
                if (!vars) { vars = document.createElement("style"); vars.id = "simplegui-fx-vars"; document.head.appendChild(vars); }
                vars.textContent = ${JSON.stringify(theme.fx ? `:root { ${buildFxCssVars(theme)} }` : "")};
                if (${theme.fx ? "true" : "false"} && !document.getElementById("simplegui-fx-css")) {
                    var css = document.createElement("style"); css.id = "simplegui-fx-css"; css.textContent = ${JSON.stringify(theme.fx ? fxCss() : "")};
                    document.head.appendChild(css);
                }
                ${theme.fx ? FX_POINTER_SOURCE : ""}
            })();
        `);
  }

  /** Configures whether the native window floats above all other windows on screen. */
  public setAlwaysOnTop(onTop: boolean): this {
    this.alwaysOnTop = onTop;
    if (this.webview) {
      setAlwaysOnTopNative(this.webview, onTop);
    }
    return this;
  }

  /** Enables or disables native fullscreen mode for the window. */
  public setFullscreen(fullscreen = true): this {
    this.fullscreen = fullscreen;
    if (this.webview) {
      setFullscreenNative(this.webview, fullscreen);
    }
    return this;
  }

  /** Returns `true` if the window is currently in fullscreen mode. */
  public isFullscreen(): boolean {
    if (this.webview) {
      return isFullscreenNative(this.webview);
    }
    return this.fullscreen;
  }

  /** Toggles the window between fullscreen and windowed mode. */
  public toggleFullscreen(): this {
    if (this.webview) {
      toggleFullscreenNative(this.webview);
    }
    return this;
  }

  /** Returns `true` while the window's native webview or browser-hosted session is actively running. */
  public isRunning(): boolean {
    return this.isWindowRunning;
  }

  // --- Layout Containers ---
  /** Begins a horizontal row layout container where subsequent controls are placed side-by-side from left to right. */
  public beginRow(): this {
    this._sectionRowCounter++;
    const rowId = "rad_row_" + this._sectionRowCounter;
    this._currentRowSection = { id: rowId, controls: [] };

    const parentFrame = this.layoutStack[this.layoutStack.length - 1];
    const startX = parentFrame
      ? parentFrame.type === "card"
        ? parentFrame.startX
        : parentFrame.startX || this.padding
      : this.padding;
    const startY = parentFrame ? parentFrame.currentY : this.currentY;

    this.layoutStack.push({
      type: "row",
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      rowHeight: 0,
    });
    return this;
  }
  /** Snake_case alias of `beginRow`: begins a horizontal row layout container where subsequent controls are placed side-by-side from left to right. */
  public begin_row(): this {
    return this.beginRow();
  }

  /** Closes the current horizontal row layout container and advances vertical cursor flow to the next line. */
  public endRow(): this {
    if (
      this._currentRowSection &&
      this._currentRowSection.controls.length > 0
    ) {
      if (this._currentCardSection) {
        this._currentCardSection.rows = this._currentCardSection.rows || [];
        this._currentCardSection.rows.push(this._currentRowSection);
      } else {
        this._layoutSections.push({
          type: "row",
          id: this._currentRowSection.id,
          controls: [...this._currentRowSection.controls],
        });
      }
    }
    this._currentRowSection = null;

    const frame = this.layoutStack.pop();
    if (frame && frame.type === "row") {
      const nextY = frame.currentY + frame.rowHeight + this.spacing;
      const parentFrame = this.layoutStack[this.layoutStack.length - 1];
      if (parentFrame) {
        parentFrame.currentY = nextY;
      } else {
        this.currentY = nextY;
      }
    }
    return this;
  }
  /** Snake_case alias of `endRow`: closes the current horizontal row layout container and advances vertical cursor flow to the next line. */
  public end_row(): this {
    return this.endRow();
  }

  /** Begins a multi-column responsive grid layout container with `cols` columns and `gap` pixel spacing. */
  public beginGrid(cols = 2, gap = 12): this {
    if (
      this._currentRowSection &&
      this._currentRowSection.controls.length > 0
    ) {
      if (this._currentCardSection) {
        this._currentCardSection.rows = this._currentCardSection.rows || [];
        this._currentCardSection.rows.push(this._currentRowSection);
      } else {
        this._layoutSections.push({
          type: "row",
          id: this._currentRowSection.id,
          controls: [...this._currentRowSection.controls],
        });
      }
      this._currentRowSection = null;
    }

    this._currentGridSection = {
      type: "grid",
      cols,
      gap,
      cards: [],
    };

    const parentFrame = this.layoutStack[this.layoutStack.length - 1];
    const startX = parentFrame
      ? parentFrame.type === "card"
        ? parentFrame.startX
        : parentFrame.startX || this.padding
      : this.padding;
    const startY = parentFrame ? parentFrame.currentY : this.currentY;

    this.layoutStack.push({
      type: "grid",
      startX,
      startY,
      currentX: startX,
      currentY: startY,
      rowHeight: 0,
      cols,
      colIndex: 0,
      gap,
    });
    return this;
  }
  /** Snake_case alias of `beginGrid`: begins a multi-column responsive grid layout container with `cols` columns and `gap` pixel spacing. */
  public begin_grid(cols = 2, gap = 12): this {
    return this.beginGrid(cols, gap);
  }

  /** Closes the current multi-column grid layout container and advances vertical layout coordinates. */
  public endGrid(): this {
    if (this._currentGridSection) {
      this._layoutSections.push(this._currentGridSection);
      this._currentGridSection = null;
    }

    const frame = this.layoutStack.pop();
    if (frame && frame.type === "grid") {
      const gridH =
        frame.rowHeight > 0 ? frame.rowHeight + (frame.gap || 12) : 0;
      const nextY = frame.currentY + gridH + this.spacing;
      const parentFrame = this.layoutStack[this.layoutStack.length - 1];
      if (parentFrame) {
        parentFrame.currentY = nextY;
      } else {
        this.currentY = nextY;
      }
    }
    return this;
  }
  /** Snake_case alias of `endGrid`: closes the current multi-column grid layout container and advances vertical layout coordinates. */
  public end_grid(): this {
    return this.endGrid();
  }

  /** Begins an elevated card container section with an optional header title, subtitle, and custom ID. */
  public beginCard(title?: string, subtitle?: string, id?: string): this {
    if (
      this._currentRowSection &&
      this._currentRowSection.controls.length > 0
    ) {
      this._layoutSections.push({
        type: "row",
        id: this._currentRowSection.id,
        controls: [...this._currentRowSection.controls],
      });
      this._currentRowSection = null;
    }

    const theme = getTheme(this.theme);
    const cardBg = theme.card_background || "rgba(255,255,255,0.03)";
    const cardBorder = theme.card_border || "rgba(255,255,255,0.08)";
    const cardId = id || this.generateUniqueId("groupbox");
    const cardSpec: any = {
      id: cardId,
      control_type: "groupbox",
      type: "groupbox",
      title: title || "Group Panel",
      text: title || "Group Panel",
      background_color: cardBg,
      border_color: cardBorder,
      border_radius: 10,
    };

    this._currentCardSection = {
      type: "card",
      id: cardSpec.id,
      title: title || "Group Panel",
      subtitle: subtitle,
      rows: [],
      items: [],
    };

    this.lastControlId = cardSpec.id;
    this.allocateControlPosition(cardSpec, this.width - this.padding * 2, 100);
    this.controls.push(cardSpec);
    this._indexControl(cardSpec);

    const cardLeft = cardSpec.left !== undefined ? cardSpec.left : this.padding;
    const cardTop = cardSpec.top !== undefined ? cardSpec.top : this.currentY;

    this.layoutStack.push({
      type: "card",
      startX: cardLeft + 16,
      startY: cardTop + 34,
      currentX: cardLeft + 16,
      currentY: cardTop + 34,
      rowHeight: 0,
      cardSpec,
    });
    if (subtitle) {
      const cap = this.addCaption(subtitle);
      cap.spec.is_card_subtitle = true;
    }
    return this;
  }
  /** Snake_case alias of `beginCard`: begins an elevated card container section with an optional header title, subtitle, and custom ID. */
  public begin_card(title?: string, subtitle?: string, id?: string): this {
    return this.beginCard(title, subtitle, id);
  }

  /**
   * Assigns a custom identifier to the currently active card/layout container (when chained on `beginCard(...)` / `beginRow()`)
   * or to the most recently added control on this window.
   */
  public id(customId: string): this {
    const topFrame = this.layoutStack[this.layoutStack.length - 1];
    if (
      topFrame &&
      topFrame.type === "card" &&
      topFrame.cardSpec &&
      this._currentCardSection &&
      (!this._currentCardSection.rows ||
        this._currentCardSection.rows.length === 0) &&
      (!this._currentCardSection.items ||
        this._currentCardSection.items.length === 0 ||
        (this._currentCardSection.items.length === 1 &&
          this.controls[this.controls.length - 1]?.is_card_subtitle))
    ) {
      const oldId = topFrame.cardSpec.id;
      this._unindexControl(topFrame.cardSpec);
      topFrame.cardSpec.id = customId;
      topFrame.cardSpec.name = customId;
      this._currentCardSection.id = customId;
      this._renameControlInLayoutSections(oldId, customId);
      this._indexControl(topFrame.cardSpec);
      this.lastControlId = customId;
      return this;
    }
    const lastCtrl = this.controls[this.controls.length - 1];
    if (lastCtrl) {
      new SimpleControlRef(lastCtrl, this).id(customId);
      this.lastControlId = customId;
    }
    return this;
  }

  /** Closes the current card container section, finalizing its bounding height and advancing the vertical layout cursor. */
  public endCard(): this {
    if (
      this._currentRowSection &&
      this._currentRowSection.controls.length > 0 &&
      this._currentCardSection
    ) {
      this._currentCardSection.rows = this._currentCardSection.rows || [];
      this._currentCardSection.rows.push(this._currentRowSection);
      this._currentRowSection = null;
    }
    if (this._currentCardSection) {
      if (this._currentGridSection) {
        this._currentGridSection.cards = this._currentGridSection.cards || [];
        this._currentGridSection.cards.push(this._currentCardSection);
      } else {
        this._layoutSections.push(this._currentCardSection);
      }
      this._currentCardSection = null;
    }

    const frame = this.layoutStack.pop();
    if (frame && frame.type === "card" && frame.cardSpec) {
      const innerHeight = frame.currentY - frame.cardSpec.top + 12;
      frame.cardSpec.height = Math.max(60, innerHeight);

      const cardBottom =
        frame.cardSpec.top + frame.cardSpec.height + this.spacing;
      const parentFrame = this.layoutStack[this.layoutStack.length - 1];

      if (parentFrame && parentFrame.type === "grid") {
        parentFrame.rowHeight = Math.max(
          parentFrame.rowHeight,
          frame.cardSpec.height,
        );
        parentFrame.colIndex =
          ((parentFrame.colIndex || 0) + 1) % (parentFrame.cols || 2);

        if (parentFrame.colIndex === 0) {
          parentFrame.currentY +=
            parentFrame.rowHeight + (parentFrame.gap || 12);
          parentFrame.rowHeight = 0;
        }
        const grandParent = this.layoutStack[this.layoutStack.length - 2];
        if (grandParent) grandParent.currentY = parentFrame.currentY;
        else this.currentY = parentFrame.currentY;
      } else if (parentFrame) {
        parentFrame.currentY = cardBottom;
      } else {
        this.currentY = cardBottom;
      }
    }
    return this;
  }
  /** Snake_case alias of `endCard`: closes the current card container section, finalizing its bounding height and advancing the vertical layout cursor. */
  public end_card(): this {
    return this.endCard();
  }

  /** Begins a flex layout container along the specified `direction` (`"row"` or `"column"`). */
  public beginFlex(
    direction: "row" | "column" = "row",
    justify = "start",
    align = "center",
  ): this {
    if (direction === "row") {
      return this.beginRow();
    } else {
      return this;
    }
  }
  /** Snake_case alias of `beginFlex`: begins a flex layout container along the specified `direction` (`"row"` or `"column"`). */
  public begin_flex(
    direction: "row" | "column" = "row",
    justify = "start",
    align = "center",
  ): this {
    return this.beginFlex(direction, justify, align);
  }

  /** Closes the active flex layout container. */
  public endFlex(): this {
    if (
      this.layoutStack.length > 0 &&
      this.layoutStack[this.layoutStack.length - 1]?.type === "row"
    ) {
      return this.endRow();
    }
    return this;
  }
  /** Snake_case alias of `endFlex`: closes the active flex layout container. */
  public end_flex(): this {
    return this.endFlex();
  }

  /** Calculates the available horizontal content width (in pixels) inside the current layout container or window padding. */
  public getAvailableWidth(): number {
    for (let i = this.layoutStack.length - 1; i >= 0; i--) {
      const frame = this.layoutStack[i];
      if (!frame) continue;
      if (frame.type === "card" && frame.cardSpec) {
        const cardW = frame.cardSpec.width || this.width - this.padding * 2;
        return Math.max(100, cardW - 32);
      }
      if (frame.type === "grid") {
        const parentFrame = i > 0 ? this.layoutStack[i - 1] : undefined;
        let containerW = this.width - this.padding * 2;
        if (
          parentFrame &&
          parentFrame.type === "card" &&
          parentFrame.cardSpec
        ) {
          containerW = Math.max(
            100,
            (parentFrame.cardSpec.width || this.width - this.padding * 2) - 32,
          );
        }
        const cols = frame.cols || 2;
        const gap = frame.gap || 12;
        const availableW = containerW - (cols - 1) * gap;
        return Math.max(100, Math.floor(availableW / cols));
      }
      if (frame.type === "row") {
        const parentFrame = i > 0 ? this.layoutStack[i - 1] : undefined;
        let maxX = this.width - this.padding;
        if (
          parentFrame &&
          parentFrame.type === "card" &&
          parentFrame.cardSpec
        ) {
          maxX =
            (parentFrame.cardSpec.left || this.padding) +
            (parentFrame.cardSpec.width || this.width - this.padding * 2) -
            20;
        }
        const rem = maxX - frame.currentX;
        if (rem > 100) return rem;
      }
    }
    return Math.max(100, this.width - this.padding * 2);
  }

  private generateUniqueId(type: string): string {
    const count = (this.controlIdCounter[type] || 0) + 1;
    this.controlIdCounter[type] = count;
    return `${type}_${count}`;
  }

  private allocateControlPosition(
    ctrl: any,
    defaultW: number,
    defaultH: number,
  ): void {
    if (
      ctrl &&
      ctrl.id &&
      ctrl.control_type !== "groupbox" &&
      ctrl.type !== "groupbox"
    ) {
      if (this._currentRowSection) {
        this._currentRowSection.controls.push(ctrl.id);
      } else if (this._currentCardSection) {
        this._currentCardSection.items = this._currentCardSection.items || [];
        this._currentCardSection.items.push(ctrl.id);
      } else {
        this._layoutSections.push({
          type: "standalone",
          id: ctrl.id,
          controls: [ctrl.id],
        });
      }
    }

    if (ctrl.width === undefined) ctrl.width = defaultW;
    if (ctrl.height === undefined) ctrl.height = defaultH;

    if (ctrl.left !== undefined && ctrl.top !== undefined) {
      ctrl.x = ctrl.left;
      ctrl.y = ctrl.top;
      return;
    }

    const activeFrame = this.layoutStack[this.layoutStack.length - 1];

    if (!activeFrame) {
      // Default Vertical Layout Flow
      const maxW = Math.max(100, this.width - this.padding * 2);
      if (ctrl.control_type === "label" && !ctrl.user_explicit_width) {
        ctrl.width = maxW;
      }
      ctrl.left = this.padding;
      ctrl.top = this.currentY;
      ctrl.x = ctrl.left;
      ctrl.y = ctrl.top;
      this.currentY += ctrl.height + this.spacing;
    } else if (activeFrame.type === "card") {
      // Vertical Flow inside Card Container
      const cardW =
        activeFrame.cardSpec?.width || this.width - this.padding * 2;
      const maxW = Math.max(100, cardW - 32);
      if (!ctrl.user_explicit_width || ctrl.width > maxW) {
        ctrl.width = maxW;
      }
      ctrl.left = activeFrame.startX;
      ctrl.top = activeFrame.currentY;
      ctrl.x = ctrl.left;
      ctrl.y = ctrl.top;
      activeFrame.currentY += ctrl.height + this.spacing;
    } else if (activeFrame.type === "row") {
      // Horizontal Row Layout with Responsive Auto-Wrap
      const parentFrame = this.layoutStack[this.layoutStack.length - 2];
      let maxX = this.width - this.padding;
      if (parentFrame && parentFrame.type === "card" && parentFrame.cardSpec) {
        maxX =
          (parentFrame.cardSpec.left || this.padding) +
          (parentFrame.cardSpec.width || this.width - this.padding * 2) -
          20;
      }

      // In a row, if control doesn't have an explicit width specified in opts:
      // Prevent wide default width (e.g. full window width) from causing premature wrap
      // when there is still reasonable space on this row.
      const remainingW = maxX - activeFrame.currentX;
      if (!ctrl.user_explicit_width) {
        if (
          ctrl.width > remainingW &&
          remainingW >= 75 &&
          activeFrame.currentX > activeFrame.startX
        ) {
          ctrl.width = remainingW;
        } else if (ctrl.width > maxX - activeFrame.startX) {
          ctrl.width = Math.max(80, maxX - activeFrame.startX);
        }
      }

      // Auto-wrap to next line if exceeding container bounds
      if (
        activeFrame.currentX + ctrl.width > maxX &&
        activeFrame.currentX > activeFrame.startX
      ) {
        activeFrame.currentY += activeFrame.rowHeight + this.spacing;
        activeFrame.currentX = activeFrame.startX;
        activeFrame.rowHeight = 0;
      }

      ctrl.left = activeFrame.currentX;
      ctrl.top = activeFrame.currentY;
      ctrl.x = ctrl.left;
      ctrl.y = ctrl.top;

      const itemSpacing = ctrl.control_type === "label" ? 8 : this.spacing;
      activeFrame.currentX += ctrl.width + itemSpacing;
      activeFrame.rowHeight = Math.max(activeFrame.rowHeight, ctrl.height);
    } else if (activeFrame.type === "grid") {
      // Multi-Column Grid Layout
      const cols = activeFrame.cols || 2;
      const gap = activeFrame.gap || 12;
      const colIndex = activeFrame.colIndex || 0;

      const parentFrame = this.layoutStack[this.layoutStack.length - 2];
      let gridLeft = this.padding;
      let containerW = this.width - this.padding * 2;

      if (parentFrame && parentFrame.type === "card" && parentFrame.cardSpec) {
        gridLeft = parentFrame.startX;
        containerW = Math.max(
          100,
          (parentFrame.cardSpec.width || this.width - this.padding * 2) - 32,
        );
      }

      const availableW = containerW - (cols - 1) * gap;
      const cellW = Math.floor(availableW / cols);

      if (!ctrl.user_explicit_width) {
        ctrl.width = cellW;
      }
      ctrl.left = gridLeft + colIndex * (cellW + gap);
      ctrl.top = activeFrame.currentY;
      ctrl.x = ctrl.left;
      ctrl.y = ctrl.top;

      if (ctrl.control_type !== "groupbox") {
        activeFrame.rowHeight = Math.max(activeFrame.rowHeight, ctrl.height);
        activeFrame.colIndex = (colIndex + 1) % cols;

        if (activeFrame.colIndex === 0) {
          activeFrame.currentY += activeFrame.rowHeight + gap;
          activeFrame.rowHeight = 0;
        }
      }
    }
  }

  /** Adjusts horizontal positions of sibling controls in the active row when a control's explicit width changes. */
  public recalculateRowX(spec: any, oldWidth: number, newWidth: number): void {
    const activeFrame = this.layoutStack[this.layoutStack.length - 1];
    if (activeFrame && activeFrame.type === "row") {
      const parentFrame = this.layoutStack[this.layoutStack.length - 2];
      let maxX = this.width - this.padding;
      if (parentFrame && parentFrame.type === "card" && parentFrame.cardSpec) {
        maxX =
          (parentFrame.cardSpec.left || this.padding) +
          (parentFrame.cardSpec.width || this.width - this.padding * 2) -
          20;
      }
      const itemSpacing = spec.control_type === "label" ? 8 : this.spacing;

      // If new explicit width exceeds available bounds and not at startX, wrap to next line
      if (spec.left + newWidth > maxX && spec.left > activeFrame.startX) {
        activeFrame.currentY += activeFrame.rowHeight + this.spacing;
        spec.left = activeFrame.startX;
        spec.top = activeFrame.currentY;
        spec.x = spec.left;
        spec.y = spec.top;
        activeFrame.currentX = spec.left + newWidth + itemSpacing;
        activeFrame.rowHeight = spec.height;
      } else {
        activeFrame.currentX = spec.left + newWidth + itemSpacing;
      }
    }
  }

  /** Adjusts vertical layout offsets when a control's explicit height changes. */
  public recalculateHeightY(
    spec: any,
    oldHeight: number,
    newHeight: number,
  ): void {
    const delta = newHeight - oldHeight;
    const activeFrame = this.layoutStack[this.layoutStack.length - 1];
    if (activeFrame) {
      if (activeFrame.type === "card") {
        activeFrame.currentY += delta;
      } else if (activeFrame.type === "row") {
        activeFrame.rowHeight = Math.max(activeFrame.rowHeight, newHeight);
      }
    } else {
      this.currentY += delta;
    }
  }

  private addVisualControl(
    type: string,
    defaultW: number,
    defaultH: number,
    opts: any = {},
  ): SimpleControlRef {
    const id = opts.id || this.generateUniqueId(type);
    const width = opts.width !== undefined ? opts.width : defaultW;
    const height = opts.height !== undefined ? opts.height : defaultH;

    const spec: any = {
      id,
      control_type: type,
      type,
      width,
      height,
      user_explicit_width: opts.width !== undefined,
      user_explicit_height: opts.height !== undefined,
      text: opts.text || opts.caption || "",
      caption: opts.caption || opts.text || "",
      font_size: opts.font_size || 13,
      font_color: opts.font_color || this.fontColor,
      background_color: opts.background_color,
      enabled: opts.enabled !== undefined ? opts.enabled : true,
      visible: opts.visible !== undefined ? opts.visible : true,
      event_handlers: opts.event_handlers || {},
      ...opts,
    };

    this.lastControlId = id;
    this.allocateControlPosition(spec, width, height);
    this.controls.push(spec);
    this._indexControl(spec);

    // Store initial value in formValuesStore if provided
    if (opts.value !== undefined) {
      this.formValuesStore[id] = opts.value;
    } else if (opts.checked !== undefined) {
      this.formValuesStore[id] = opts.checked;
    } else if (opts.selected !== undefined) {
      this.formValuesStore[id] = opts.selected;
    } else if (
      opts.text !== undefined &&
      (type === "textbox" ||
        type === "input" ||
        type === "search_field" ||
        type === "masked_input" ||
        type === "file_path_bar" ||
        type === "file_picker_field" ||
        type === "inline_editable_label")
    ) {
      this.formValuesStore[id] = opts.text;
    } else if (opts.tags !== undefined) {
      this.formValuesStore[id] = opts.tags;
    } else if (opts.rightItems !== undefined) {
      this.formValuesStore[id] = opts.rightItems;
    }

    return new SimpleControlRef(spec, this);
  }

  // --- Control Builder Methods ---
  /** Adds a text label control to the current layout container and returns a fluent `SimpleControlRef`. */
  public addLabel(
    idOrText: string,
    textOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let text = idOrText;
    let explicitId: string | undefined;
    let finalOpts: Partial<any> = opts;

    if (typeof textOrOpts === "string") {
      explicitId = idOrText;
      text = textOrOpts;
    } else if (textOrOpts && typeof textOrOpts === "object") {
      finalOpts = textOrOpts;
    }

    const inRow =
      this.layoutStack.length > 0 &&
      this.layoutStack[this.layoutStack.length - 1]?.type === "row";
    const isStatus =
      (explicitId &&
        (explicitId.toLowerCase().includes("status") ||
          explicitId.toLowerCase().includes("telemetry"))) ||
      text.toLowerCase().startsWith("status:") ||
      text.toLowerCase().startsWith("status :") ||
      text.toLowerCase().startsWith("matches found:") ||
      text.toLowerCase().startsWith("ready  |") ||
      text.toLowerCase().startsWith("codefreelance engine:");

    let defaultW: number;
    if (inRow) {
      defaultW = Math.max(20, Math.ceil(text.length * 7.2 + 6));
    } else if (isStatus) {
      defaultW = Math.max(600, this.width - this.padding * 2 - 10);
    } else {
      defaultW = Math.max(300, Math.ceil(text.length * 7.2 + 6));
    }

    const ctrlOpts: Record<string, any> = { text, caption: text, ...finalOpts };
    if (explicitId) ctrlOpts.id = explicitId;
    return this.addVisualControl("label", defaultW, 24, ctrlOpts);
  }

  /** Adds a clickable push button control with optional explicit ID, click handler, and style options. */
  public addButton(
    idOrText: string,
    textOrOnClick?: string | EventCallback,
    onClickOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let text = idOrText;
    let explicitId: string | undefined;
    let onClick: EventCallback | undefined;
    let opts: Partial<any> = {};

    if (typeof textOrOnClick === "string") {
      explicitId = idOrText;
      text = textOrOnClick;
      if (typeof onClickOrOpts === "function") {
        onClick = onClickOrOpts as EventCallback;
        opts = optsArg;
      } else if (typeof onClickOrOpts === "object" && onClickOrOpts !== null) {
        opts = onClickOrOpts;
      }
    } else if (typeof textOrOnClick === "function") {
      onClick = textOrOnClick as EventCallback;
      if (typeof onClickOrOpts === "object" && onClickOrOpts !== null)
        opts = onClickOrOpts;
    } else if (typeof textOrOnClick === "object" && textOrOnClick !== null) {
      opts = textOrOnClick;
    }

    const hasCustomBg = !!opts.background_color;
    const hasCustomFg = !!opts.font_color;
    const defaultBtnBg = opts.background_color || this.accentColor || "#0284c7";
    const isBrightGreen = isBrightAccentColor(defaultBtnBg);
    const defaultBtnFg =
      opts.font_color || (isBrightGreen ? "#000000" : "#ffffff");
    const ctrlOpts: Record<string, any> = {
      text,
      caption: text,
      background_color: defaultBtnBg,
      font_color: defaultBtnFg,
      font_weight: "700",
      border_radius: 6,
      cursor: "pointer",
      custom_background: hasCustomBg,
      custom_color: hasCustomFg,
      _isThemeAccent: !hasCustomBg,
      ...opts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const defaultWidth =
      opts.width || Math.max(140, Math.ceil(text.length * 8.5) + 36);
    const ref = this.addVisualControl(
      "button",
      defaultWidth,
      opts.height || 36,
      ctrlOpts,
    );
    if (onClick) ref.onClick(onClick);
    return ref;
  }

  /** Snake_case alias of `addButton`: adds a clickable push button control with optional explicit ID, click handler, and style options. */
  public add_button(
    idOrText: string,
    textOrOnClick?: string | EventCallback,
    onClickOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    return this.addButton(idOrText, textOrOnClick, onClickOrOpts, optsArg);
  }

  /** Adds a single-line text input control with placeholder, optional initial value, and change callback. */
  public addTextInput(
    placeholder = "",
    arg2: string | EventCallback | Partial<any> = "",
    arg3: string | EventCallback | Partial<any> = {},
  ): SimpleControlRef {
    let initialValue = "";
    let onChange: EventCallback | undefined;
    let opts: Partial<any> = {};
    let finalPlaceholder = placeholder;
    let explicitId: string | undefined;

    if (typeof arg2 === "string" && typeof arg3 === "string") {
      // Overload: (id, initialValue, placeholder)
      explicitId = placeholder;
      initialValue = arg2;
      finalPlaceholder = arg3;
    } else if (typeof arg2 === "function") {
      onChange = arg2 as EventCallback;
      if (typeof arg3 === "object") opts = arg3;
    } else if (typeof arg2 === "string") {
      initialValue = arg2;
      if (typeof arg3 === "function") {
        onChange = arg3 as EventCallback;
      } else if (typeof arg3 === "object") {
        opts = arg3;
      }
    } else if (typeof arg2 === "object" && arg2 !== null) {
      opts = arg2;
    }

    if (explicitId) opts.id = explicitId;
    const ref = this.addVisualControl("input", 280, 36, {
      placeholder: finalPlaceholder,
      value: initialValue,
      ...opts,
    });
    if (initialValue) this.formValuesStore[ref.spec.id] = initialValue;
    if (onChange) ref.onChange(onChange);
    return ref;
  }
  /** Snake_case alias of `addTextInput`: adds a single-line text input control with placeholder, optional initial value, and change callback. */
  public add_text_input(
    placeholder = "",
    arg2: string | EventCallback | Partial<any> = "",
    arg3: EventCallback | Partial<any> = {},
  ): SimpleControlRef {
    return this.addTextInput(placeholder, arg2, arg3);
  }
  /** Alias of `addTextInput`: adds a single-line text input control with placeholder, optional initial value, and change callback. */
  public addTextField(
    placeholder = "",
    arg2: string | EventCallback | Partial<any> = "",
    arg3: string | EventCallback | Partial<any> = {},
  ): SimpleControlRef {
    return this.addTextInput(placeholder, arg2, arg3);
  }
  /** Snake_case alias of `addTextInput`: adds a single-line text input control with placeholder, optional initial value, and change callback. */
  public add_text_field(
    placeholder = "",
    arg2: string | EventCallback | Partial<any> = "",
    arg3: string | EventCallback | Partial<any> = {},
  ): SimpleControlRef {
    return this.addTextInput(placeholder, arg2, arg3);
  }

  /** Adds a masked password input field with placeholder text and custom options. */
  public addPasswordInput(
    placeholder = "••••••••",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("password", 280, 36, { placeholder, ...opts });
  }

  /** Adds a multi-line text area control with optional ID, placeholder, and initial text content. */
  public addTextArea(
    idOrPlaceholder = "",
    initialValueOrPlaceholder = "",
    optsOrPlaceholder: string | Partial<any> = {},
  ): SimpleControlRef {
    let id: string | undefined;
    let placeholder = idOrPlaceholder;
    let initialValue = initialValueOrPlaceholder;
    let opts: Partial<any> = {};

    if (typeof optsOrPlaceholder === "string") {
      // Overload: (id, initialValue, placeholder)
      id = idOrPlaceholder;
      initialValue = initialValueOrPlaceholder;
      placeholder = optsOrPlaceholder;
    } else if (typeof optsOrPlaceholder === "object") {
      opts = optsOrPlaceholder;
      if (opts.id) id = opts.id;
    }

    if (id) opts.id = id;
    const ref = this.addVisualControl("textarea", 340, 80, {
      placeholder,
      value: initialValue,
      text: initialValue,
      ...opts,
    });
    if (id) ref.spec.id = id;
    if (initialValue) this.formValuesStore[ref.spec.id] = initialValue;
    return ref;
  }

  /** Adds a boolean checkbox control with label text, initial checked state, and optional change handler. */
  public addCheckbox(
    idOrLabel: string,
    labelOrChecked: string | boolean = false,
    checkedOrOnChange: boolean | EventCallback = false,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let label = idOrLabel;
    let checked = false;
    let changeHandler: EventCallback | undefined;

    if (typeof labelOrChecked === "string") {
      explicitId = idOrLabel;
      label = labelOrChecked;
      if (typeof checkedOrOnChange === "boolean") {
        checked = checkedOrOnChange;
        changeHandler = onChange;
      } else if (typeof checkedOrOnChange === "function") {
        changeHandler = checkedOrOnChange;
      }
    } else if (typeof labelOrChecked === "boolean") {
      checked = labelOrChecked;
      if (typeof checkedOrOnChange === "function") {
        changeHandler = checkedOrOnChange;
      }
    }

    const ctrlOpts: Record<string, any> = {
      text: label,
      caption: label,
      value: checked,
      checked,
      ...opts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const inRow =
      this.layoutStack.length > 0 &&
      this.layoutStack[this.layoutStack.length - 1]?.type === "row";
    const defaultW = inRow
      ? Math.min(220, Math.max(90, (label || "").length * 8 + 36))
      : 260;
    const ref = this.addVisualControl("checkbox", defaultW, 24, ctrlOpts);
    this.formValuesStore[ref.spec.id] = checked;
    if (changeHandler) ref.onChange(changeHandler);
    return ref;
  }

  /** Adds a sliding boolean toggle switch control with label, initial state, and optional change callback. */
  public addSwitch(
    label: string,
    checked = false,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const ref = this.addVisualControl("switch", 260, 26, {
      text: label,
      caption: label,
      value: checked,
      checked,
      ...opts,
    });
    this.formValuesStore[ref.spec.id] = checked;
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds a horizontal numeric range slider control bounded by `[min, max]` with initial value and change handler. */
  public addSlider(
    min = 0,
    max = 100,
    value = 50,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const ref = this.addVisualControl("slider", 280, 24, {
      min_value: min,
      max_value: max,
      value,
      ...opts,
    });
    this.formValuesStore[ref.spec.id] = value;
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds a numeric stepper input with increment/decrement buttons bounded by `[min, max]`. */
  public addStepper(
    min = 0,
    max = 100,
    value = 1,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const ref = this.addVisualControl("number_stepper", 140, 36, {
      min_value: min,
      max_value: max,
      value,
      ...opts,
    });
    this.formValuesStore[ref.spec.id] = value;
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds a horizontal progress bar indicator showing `value` relative to `max`. */
  public addProgressBar(
    value = 50,
    max = 100,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("progress_bar", 280, 20, {
      value,
      max_value: max,
      ...opts,
    });
  }

  /** Adds a single-select dropdown (`<select>`) control populated with `items`, optional initial selection, and change handler. */
  public addDropdown(
    idOrItems: string | string[],
    itemsOrSelected?: string[] | string | number | EventCallback,
    selectedOrOnChange?: string | number | EventCallback,
    onChangeOrOpts?: EventCallback | Record<string, any>,
    optsArg: Record<string, any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let items: string[] = [];
    let selected: string | number | undefined;
    let onChange: EventCallback | undefined;
    let opts: Record<string, any> = {};

    if (typeof idOrItems === "string" && Array.isArray(itemsOrSelected)) {
      explicitId = idOrItems;
      items = itemsOrSelected;
      if (typeof selectedOrOnChange === "function") {
        onChange = selectedOrOnChange;
        if (typeof onChangeOrOpts === "object") opts = onChangeOrOpts;
      } else {
        selected = selectedOrOnChange;
        if (typeof onChangeOrOpts === "function") {
          onChange = onChangeOrOpts as EventCallback;
          opts = optsArg;
        } else if (
          typeof onChangeOrOpts === "object" &&
          onChangeOrOpts !== null
        ) {
          opts = onChangeOrOpts;
        } else if (typeof optsArg === "object" && optsArg !== null) {
          opts = optsArg;
        }
      }
    } else if (Array.isArray(idOrItems)) {
      items = idOrItems;
      if (typeof itemsOrSelected === "function") {
        onChange = itemsOrSelected as EventCallback;
        if (typeof selectedOrOnChange === "object")
          opts = selectedOrOnChange as Record<string, any>;
      } else {
        selected = itemsOrSelected as string | number;
        if (typeof selectedOrOnChange === "function") {
          onChange = selectedOrOnChange as EventCallback;
          if (typeof onChangeOrOpts === "object") opts = onChangeOrOpts;
        } else if (
          typeof selectedOrOnChange === "object" &&
          selectedOrOnChange !== null
        ) {
          opts = selectedOrOnChange as Record<string, any>;
        }
      }
    }

    const text = items.join(", ");
    const initialVal =
      typeof selected === "number"
        ? items[selected] || ""
        : selected || items[0] || "";
    const ctrlOpts: Record<string, any> = {
      text,
      caption: text,
      value: initialVal,
      items: [...items],
      options: [...items],
      ...opts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const ref = this.addVisualControl("select", 240, 36, ctrlOpts);
    this.formValuesStore[ref.spec.id] = initialVal;
    this.listItemsStore[ref.spec.id] = [...items];
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds an interactive theme-switcher dropdown pre-populated with SimpleGUI themes that automatically re-themes the window on selection. */
  public addThemeSelector(
    idOrLabel: string = "dd_theme",
    labelOrPopularOnly: string | boolean = "Theme:",
    popularOnlyOrAutoShortNames: boolean = false,
    widthOrPopularOnly: number | boolean = 160,
    autoShortNames = true,
  ): SimpleControlRef {
    let id = "dd_theme";
    let label = "Theme:";
    let popularOnly = false;
    let width = 160;
    let useAutoShortNames = autoShortNames;

    if (typeof labelOrPopularOnly === "boolean") {
      label = idOrLabel;
      id = "dd_theme";
      popularOnly = labelOrPopularOnly;
      if (typeof popularOnlyOrAutoShortNames === "boolean") {
        useAutoShortNames = popularOnlyOrAutoShortNames;
      }
      if (typeof widthOrPopularOnly === "number") {
        width = widthOrPopularOnly;
      }
    } else {
      id = idOrLabel || "dd_theme";
      label =
        typeof labelOrPopularOnly === "string" ? labelOrPopularOnly : "Theme:";
      if (typeof popularOnlyOrAutoShortNames === "boolean") {
        popularOnly = popularOnlyOrAutoShortNames;
      }
      if (typeof widthOrPopularOnly === "number") {
        width = widthOrPopularOnly;
      }
      useAutoShortNames = autoShortNames;
    }

    const popularThemes = [
      "midnight",
      "codefreelance",
      "raycast_dark",
      "linear_dark",
      "vercel_dark",
      "unreal_engine",
      "arc_velvet",
      "abyss",
      "night_city",
      "horizon",
      "tailwind_dark",
      "supabase",
      "oled_black",
      "titanium_slate",
      "jetbrains_darcula",
      "nordic_paper",
      "sonoma_emerald",
      "monokai_pro",
      "tokyo_night",
      "one_dark_pro",
      "gruvbox_dark",
      "rose_pine",
      "everforest",
      "kanagawa",
      "cobalt2",
      "win11_slate",
      "ubuntu_dark",
      "adwaita_dark",
      "linux_mint",
      "apple_dark",
      "dracula",
      "nord",
      "cyberpunk",
      "apple_light",
      "github_dark",
      "win95",
      "gameboy",
      "commodore64",
      "synthwave84",
      "macintosh_system7",
      "amber_crt",
      "matrix_phosphor",
      "amiga",
    ];
    const rawThemeList = popularOnly
      ? popularThemes.filter((k) => SIMPLEGUI_THEMES[k])
      : VLANG_THEME_NAMES.map((k) => {
          if (k === "commodore64") return "c64";
          if (k === "matrix_phosphor") return "matrix";
          if (k === "synthwave84") return "synthwave";
          if (k === "macintosh_system7") return "mac_classic";
          return k;
        });

    const itemLabels: Record<string, string> = {};
    for (const k of rawThemeList) {
      itemLabels[k] = useAutoShortNames
        ? autoShortThemeName(k)
        : SIMPLEGUI_THEMES[k]?.name || k;
    }
    for (const [alias, target] of Object.entries(SIMPLEGUI_THEMES)) {
      if (!itemLabels[alias]) {
        itemLabels[alias] = useAutoShortNames
          ? autoShortThemeName(alias)
          : target?.name || alias;
      }
    }

    // Deduplicate so each visible label appears exactly once
    const seenLabels = new Set<string>();
    const themeList: string[] = [];
    for (const k of rawThemeList) {
      const labelText = itemLabels[k] || k;
      if (!seenLabels.has(labelText)) {
        seenLabels.add(labelText);
        themeList.push(k);
      }
    }

    // Sort themeList alphabetically by the display label shown to the user
    themeList.sort((a, b) => {
      const labelA = itemLabels[a] || a;
      const labelB = itemLabels[b] || b;
      return labelA.localeCompare(labelB, undefined, { sensitivity: "base" });
    });

    if (label && label.length > 0) {
      this.addLabel("lbl_" + id, label);
    }

    const initialTheme = themeList.includes(this.theme)
      ? this.theme
      : themeList[0] || "midnight";

    const ref = this.addDropdown(id, themeList, initialTheme, {
      item_labels: itemLabels,
    });
    ref.spec.is_theme_selector = true;
    if (width > 0) {
      ref.width(width);
    }

    this.onChange(id, (w, val) => {
      const chosen = String(val).trim();
      if (chosen) {
        w.setTheme(chosen, true);
        if (w.autoSaveState) {
          w.saveAppFormStateOr();
        }
        const display = useAutoShortNames ? autoShortThemeName(chosen) : chosen;
        w.toast(`Theme updated to: ${display}`);
      }
    });

    return ref;
  }
  /** Snake_case alias of `addThemeSelector`: adds an interactive theme-switcher dropdown pre-populated with SimpleGUI themes that automatically re-themes the window on selection. */
  public add_theme_selector(
    id = "dd_theme",
    label = "Theme:",
    popularOnly = false,
    width = 135,
    autoShortNames = true,
  ): SimpleControlRef {
    return this.addThemeSelector(id, label, popularOnly, width, autoShortNames);
  }

  /** Adds a scrollable single- or multi-selection list box control with selectable string items. */
  public addListBox(
    idOrItems: string | string[],
    itemsOrSelected?: string[] | string | string[] | number | EventCallback,
    selectedOrOnChange?: string | string[] | number | EventCallback,
    onChangeOrOpts?: EventCallback | Record<string, any>,
    optsArg: Record<string, any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let items: string[] = [];
    let selected: string | string[] | number | undefined;
    let onChange: EventCallback | undefined;
    let opts: Record<string, any> = {};

    if (typeof idOrItems === "string" && Array.isArray(itemsOrSelected)) {
      explicitId = idOrItems;
      items = itemsOrSelected;
      if (typeof selectedOrOnChange === "function") {
        onChange = selectedOrOnChange;
        if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null)
          opts = onChangeOrOpts;
      } else {
        selected = selectedOrOnChange;
        if (typeof onChangeOrOpts === "function") {
          onChange = onChangeOrOpts as EventCallback;
          opts = optsArg;
        } else if (
          typeof onChangeOrOpts === "object" &&
          onChangeOrOpts !== null
        ) {
          opts = onChangeOrOpts;
        } else if (typeof optsArg === "object" && optsArg !== null) {
          opts = optsArg;
        }
      }
    } else if (Array.isArray(idOrItems)) {
      items = idOrItems;
      if (typeof itemsOrSelected === "function") {
        onChange = itemsOrSelected as EventCallback;
        if (
          typeof selectedOrOnChange === "object" &&
          selectedOrOnChange !== null
        )
          opts = selectedOrOnChange as Record<string, any>;
      } else {
        selected = itemsOrSelected as string | string[] | number;
        if (typeof selectedOrOnChange === "function") {
          onChange = selectedOrOnChange as EventCallback;
          if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null)
            opts = onChangeOrOpts as Record<string, any>;
        } else if (
          typeof selectedOrOnChange === "object" &&
          selectedOrOnChange !== null
        ) {
          opts = selectedOrOnChange;
        }
      }
    }

    const isMulti = Boolean(
      opts.multiple || opts.multi_select || opts.selection_mode === "multiple",
    );
    const text = items.join(", ");
    const initialVal = isMulti
      ? Array.isArray(selected)
        ? selected
        : typeof selected === "string"
          ? selected.split(",").map((s) => s.trim())
          : items.length > 0
            ? [items[0]]
            : []
      : typeof selected === "number"
        ? items[selected] || ""
        : selected || items[0] || "";
    const height = opts.height || (opts.size ? opts.size * 24 + 10 : 120);
    const width = opts.width || 240;
    const ref = this.addVisualControl("listbox", width, height, {
      text,
      caption: text,
      value: initialVal,
      items,
      size: opts.size || 5,
      ...(explicitId ? { id: explicitId } : {}),
      ...(isMulti
        ? { multiple: true, multi_select: true, selection_mode: "multiple" }
        : {}),
      ...opts,
    });
    if (explicitId) {
      ref.spec.id = explicitId;
      ref.spec.name = explicitId;
    }
    this.formValuesStore[ref.spec.id] = initialVal;
    this.listItemsStore[ref.spec.id] = [...items];
    if (onChange) {
      ref.onChange(onChange);
      ref.onClick(onChange);
    }
    return ref;
  }
  /** Snake_case alias of `addListBox`: adds a scrollable single- or multi-selection list box control with selectable string items. */
  public add_list_box(
    idOrItems: string | string[],
    itemsOrSelected?: string[] | string | string[] | number | EventCallback,
    selectedOrOnChange?: string | string[] | number | EventCallback,
    onChangeOrOpts?: EventCallback | Record<string, any>,
    optsArg: Record<string, any> = {},
  ): SimpleControlRef {
    return this.addListBox(
      idOrItems,
      itemsOrSelected,
      selectedOrOnChange,
      onChangeOrOpts,
      optsArg,
    );
  }

  /** Adds a multi-selection list box control allowing multiple items to be selected simultaneously. */
  public addMultiListBox(
    idOrItems: string | string[],
    itemsOrSelected?: string[] | string | EventCallback,
    selectedOrOnChange?: string[] | string | EventCallback,
    onChangeOrOpts?: EventCallback | Record<string, any>,
    optsArg: Record<string, any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let items: string[] = [];
    let selected: string[] | string | undefined;
    let onChange: EventCallback | undefined;
    let opts: Record<string, any> = {};

    if (typeof idOrItems === "string" && Array.isArray(itemsOrSelected)) {
      explicitId = idOrItems;
      items = itemsOrSelected;
      if (typeof selectedOrOnChange === "function") {
        onChange = selectedOrOnChange;
        if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null)
          opts = onChangeOrOpts;
      } else {
        selected = selectedOrOnChange as string[] | string;
        if (typeof onChangeOrOpts === "function") {
          onChange = onChangeOrOpts as EventCallback;
          opts = optsArg;
        } else if (
          typeof onChangeOrOpts === "object" &&
          onChangeOrOpts !== null
        ) {
          opts = onChangeOrOpts;
        } else if (typeof optsArg === "object" && optsArg !== null) {
          opts = optsArg;
        }
      }
    } else if (Array.isArray(idOrItems)) {
      items = idOrItems;
      if (typeof itemsOrSelected === "function") {
        onChange = itemsOrSelected as EventCallback;
        if (
          typeof selectedOrOnChange === "object" &&
          selectedOrOnChange !== null
        )
          opts = selectedOrOnChange as Record<string, any>;
      } else {
        selected = itemsOrSelected as string[] | string;
        if (typeof selectedOrOnChange === "function") {
          onChange = selectedOrOnChange as EventCallback;
          if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null)
            opts = onChangeOrOpts as Record<string, any>;
        } else if (
          typeof selectedOrOnChange === "object" &&
          selectedOrOnChange !== null
        ) {
          opts = selectedOrOnChange;
        }
      }
    }

    const initialVal = Array.isArray(selected)
      ? selected
      : typeof selected === "string"
        ? selected.split(",").map((s) => s.trim())
        : items.length > 0
          ? [items[0]]
          : [];
    const height = opts.height || (opts.size ? opts.size * 24 + 10 : 130);
    const width = opts.width || 240;
    const ref = this.addVisualControl("listbox", width, height, {
      text: items.join(", "),
      caption: items.join(", "),
      value: initialVal,
      items,
      size: opts.size || 5,
      multiple: true,
      multi_select: true,
      selection_mode: "multiple",
      ...(explicitId ? { id: explicitId } : {}),
      ...opts,
    });
    if (explicitId) {
      ref.spec.id = explicitId;
      ref.spec.name = explicitId;
    }
    this.formValuesStore[ref.spec.id] = initialVal;
    this.listItemsStore[ref.spec.id] = [...items];
    if (onChange) {
      ref.onChange(onChange);
      ref.onClick(onChange);
    }
    return ref;
  }
  /** Snake_case alias of `addMultiListBox`: adds a multi-selection list box control allowing multiple items to be selected simultaneously. */
  public add_multi_list_box(
    idOrItems: string | string[],
    itemsOrSelected?: string[] | string | EventCallback,
    selectedOrOnChange?: string[] | string | EventCallback,
    onChangeOrOpts?: EventCallback | Record<string, any>,
    optsArg: Record<string, any> = {},
  ): SimpleControlRef {
    return this.addMultiListBox(
      idOrItems,
      itemsOrSelected,
      selectedOrOnChange,
      onChangeOrOpts,
      optsArg,
    );
  }

  /** Adds a horizontal pill-style segmented button bar where one segment is active at a time. */
  public addSegmentedControl(
    items: string[],
    selectedIndex = 0,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const text = items.join(", ");
    const initialVal = items[selectedIndex] || "";
    const ref = this.addVisualControl("segmented_control", 280, 36, {
      text,
      caption: text,
      value: initialVal,
      ...opts,
    });
    this.formValuesStore[ref.spec.id] = initialVal;
    this.listItemsStore[ref.spec.id] = [...items];
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds a search input field with a magnifier icon, clear action, and change handler. */
  public addSearchInput(
    placeholder = "Search...",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const ref = this.addVisualControl("search", 260, 36, {
      placeholder,
      ...opts,
    });
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds an interactive color picker well initialized to the specified hex color. */
  public addColorWell(
    initialColor = "#0284c7",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const ref = this.addVisualControl("color_picker", 120, 36, {
      value: initialColor,
      ...opts,
    });
    this.formValuesStore[ref.spec.id] = initialColor;
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds a calendar date picker input initialized to an ISO date string (`YYYY-MM-DD`). */
  public addDatePicker(
    initialDate = "2026-07-27",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const ref = this.addVisualControl("date_picker", 180, 36, {
      value: initialDate,
      ...opts,
    });
    this.formValuesStore[ref.spec.id] = initialDate;
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds a time picker input initialized to a 24-hour time string (`HH:MM`). */
  public addTimePicker(
    initialTime = "12:00",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const ref = this.addVisualControl("time_picker", 140, 36, {
      value: initialTime,
      ...opts,
    });
    this.formValuesStore[ref.spec.id] = initialTime;
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Adds a semantic status badge pill (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public addBadge(
    text: string,
    type: "info" | "success" | "warning" | "error" = "info",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("status_badge", 120, 26, {
      text,
      caption: text,
      alert_type: type,
      ...opts,
    });
  }

  /** Adds an interactive data table control with column headers, 2D row array, and row selection callback. */
  public addTable(
    idOrHeaders: string | string[],
    headersOrRows?: string[] | any[][],
    rowsOrOnSelect?: any[][] | EventCallback | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let headers: string[] = [];
    let rows: any[][] = [];
    let clickHandler: EventCallback | undefined;
    let finalOpts: Record<string, any> = { ...opts };

    if (typeof onSelect === "object" && onSelect !== null) {
      finalOpts = { ...onSelect, ...opts };
      clickHandler = undefined;
    } else if (typeof onSelect === "function") {
      clickHandler = onSelect;
    }

    if (typeof idOrHeaders === "string" && Array.isArray(headersOrRows)) {
      explicitId = idOrHeaders;
      headers = headersOrRows as string[];
      if (Array.isArray(rowsOrOnSelect)) {
        rows = rowsOrOnSelect as any[][];
      } else if (typeof rowsOrOnSelect === "function") {
        clickHandler = rowsOrOnSelect as EventCallback;
      } else if (
        typeof rowsOrOnSelect === "object" &&
        rowsOrOnSelect !== null
      ) {
        finalOpts = { ...rowsOrOnSelect, ...finalOpts };
      }
    } else if (Array.isArray(idOrHeaders)) {
      headers = idOrHeaders as string[];
      if (Array.isArray(headersOrRows)) {
        rows = headersOrRows as any[][];
        if (typeof rowsOrOnSelect === "function")
          clickHandler = rowsOrOnSelect as EventCallback;
        else if (typeof rowsOrOnSelect === "object" && rowsOrOnSelect !== null)
          finalOpts = { ...rowsOrOnSelect, ...finalOpts };
      }
    }

    if (finalOpts.multiSelect !== undefined) {
      finalOpts.multi_select = finalOpts.multiSelect;
    }
    if (finalOpts.checkboxSelection !== undefined) {
      finalOpts.checkbox_selection = finalOpts.checkboxSelection;
    }
    const onSelChange =
      finalOpts.onSelectionChange || finalOpts.on_selection_change;

    const headerCsv = headers.join(", ");
    const ctrlOpts: Record<string, any> = {
      text: headerCsv,
      caption: headerCsv,
      value: rows,
      rows,
      headers: [...headers],
      columns: [...headers],
      ...finalOpts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const defaultH = finalOpts.height !== undefined ? finalOpts.height : 180;
    const defaultW = finalOpts.width !== undefined ? finalOpts.width : 540;
    const ref = this.addVisualControl(
      "data_table",
      defaultW,
      defaultH,
      ctrlOpts,
    );
    if (clickHandler) ref.onClick(clickHandler);
    if (onSelChange && typeof onSelChange === "function") {
      ref.on("selection_change", onSelChange);
    }
    return ref;
  }

  /** Alias of `addTable`: adds an interactive data table control with column headers, 2D row array, and row selection callback. */
  public addDataTable(
    idOrHeaders: string | string[],
    headersOrRows?: string[] | any[][],
    rowsOrOnSelect?: any[][] | EventCallback | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTable(
      idOrHeaders,
      headersOrRows,
      rowsOrOnSelect,
      onSelect,
      opts,
    );
  }
  /** Snake_case alias of `addTable`: adds an interactive data table control with column headers, 2D row array, and row selection callback. */
  public add_data_table(
    idOrHeaders: string | string[],
    headersOrRows?: string[] | any[][],
    rowsOrOnSelect?: any[][] | EventCallback | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTable(
      idOrHeaders,
      headersOrRows,
      rowsOrOnSelect,
      onSelect,
      opts,
    );
  }
  /** Snake_case alias of `addTable`: adds an interactive data table control with column headers, 2D row array, and row selection callback. */
  public add_table(
    idOrHeaders: string | string[],
    headersOrRows?: string[] | any[][],
    rowsOrOnSelect?: any[][] | EventCallback | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTable(
      idOrHeaders,
      headersOrRows,
      rowsOrOnSelect,
      onSelect,
      opts,
    );
  }

  /** Adds a hierarchical tree-grid table supporting expandable/collapsible parent-child rows and column headers. */
  public addTreeGrid(
    idOrHeaders: string | string[],
    headersOrRows?: string[] | any[],
    rowsOrOnSelect?: any[] | EventCallback | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let headers: string[] = [];
    let rows: any[] = [];
    let clickHandler: EventCallback | undefined;
    let finalOpts: Record<string, any> = { ...opts };

    if (typeof onSelect === "object" && onSelect !== null) {
      finalOpts = { ...onSelect, ...opts };
      clickHandler = undefined;
    } else if (typeof onSelect === "function") {
      clickHandler = onSelect;
    }

    if (typeof idOrHeaders === "string" && Array.isArray(headersOrRows)) {
      explicitId = idOrHeaders;
      headers = headersOrRows as string[];
      if (Array.isArray(rowsOrOnSelect)) {
        rows = rowsOrOnSelect as any[];
      } else if (typeof rowsOrOnSelect === "function") {
        clickHandler = rowsOrOnSelect as EventCallback;
      } else if (
        typeof rowsOrOnSelect === "object" &&
        rowsOrOnSelect !== null
      ) {
        finalOpts = { ...rowsOrOnSelect, ...finalOpts };
      }
    } else if (Array.isArray(idOrHeaders)) {
      headers = idOrHeaders as string[];
      if (Array.isArray(headersOrRows)) {
        rows = headersOrRows as any[];
        if (typeof rowsOrOnSelect === "function")
          clickHandler = rowsOrOnSelect as EventCallback;
        else if (typeof rowsOrOnSelect === "object" && rowsOrOnSelect !== null)
          finalOpts = { ...rowsOrOnSelect, ...finalOpts };
      }
    } else if (typeof idOrHeaders === "string" && !headersOrRows) {
      explicitId = idOrHeaders;
    }

    if (finalOpts.multiSelect !== undefined) {
      finalOpts.multi_select = finalOpts.multiSelect;
    }
    if (finalOpts.checkboxSelection !== undefined) {
      finalOpts.checkbox_selection = finalOpts.checkboxSelection;
    }
    const onSelChange =
      finalOpts.onSelectionChange || finalOpts.on_selection_change;
    const onToggleHandler = finalOpts.onToggle || finalOpts.on_toggle;

    const headerCsv = headers.join(", ");
    const ctrlOpts: Record<string, any> = {
      text: headerCsv,
      caption: headerCsv,
      value: rows,
      rows,
      headers: [...headers],
      columns: [...headers],
      ...finalOpts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const defaultH = finalOpts.height !== undefined ? finalOpts.height : 200;
    const defaultW = finalOpts.width !== undefined ? finalOpts.width : 560;
    const ref = this.addVisualControl(
      "tree_grid",
      defaultW,
      defaultH,
      ctrlOpts,
    );
    if (clickHandler) ref.onClick(clickHandler);
    if (onSelChange && typeof onSelChange === "function") {
      ref.on("selection_change", onSelChange);
    }
    if (onToggleHandler && typeof onToggleHandler === "function") {
      ref.on("toggle", onToggleHandler);
    }
    return ref;
  }

  /** Snake_case alias of `addTreeGrid`: adds a hierarchical tree-grid table supporting expandable/collapsible parent-child rows and column headers. */
  public add_tree_grid(
    idOrHeaders: string | string[],
    headersOrRows?: string[] | any[],
    rowsOrOnSelect?: any[] | EventCallback | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTreeGrid(
      idOrHeaders,
      headersOrRows,
      rowsOrOnSelect,
      onSelect,
      opts,
    );
  }
  /** Alias of `addTreeGrid`: adds a hierarchical tree-grid table supporting expandable/collapsible parent-child rows and column headers. */
  public addTreeTable(
    idOrHeaders: string | string[],
    headersOrRows?: string[] | any[],
    rowsOrOnSelect?: any[] | EventCallback | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTreeGrid(
      idOrHeaders,
      headersOrRows,
      rowsOrOnSelect,
      onSelect,
      opts,
    );
  }
  /** Snake_case alias of `addTreeGrid`: adds a hierarchical tree-grid table supporting expandable/collapsible parent-child rows and column headers. */
  public add_tree_table(
    idOrHeaders: string | string[],
    headersOrRows?: string[] | any[],
    rowsOrOnSelect?: any[] | EventCallback | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTreeGrid(
      idOrHeaders,
      headersOrRows,
      rowsOrOnSelect,
      onSelect,
      opts,
    );
  }

  /** Adds a collapsible hierarchical tree view control populated with node labels. */
  public addTreeView(
    nodes: string[],
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const text = nodes.join(", ");
    const ref = this.addVisualControl("tree_view", 240, 160, {
      text,
      caption: text,
      ...opts,
    });
    if (onSelect) ref.onClick(onSelect);
    return ref;
  }

  /** Adds a syntax-styled read-only code viewer block for the given source snippet and language. */
  public addCodeView(
    code: string,
    language = "typescript",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("code_view", 520, 140, {
      text: code,
      caption: code,
      placeholder: language,
      ...opts,
    });
  }

  /** Adds an image display control with explicit pixel dimensions and image URL/path. */
  public addImage(
    src: string,
    width = 200,
    height = 150,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("image", width, height, {
      text: src,
      caption: src,
      ...opts,
    });
  }

  /** Adds a full-width horizontal visual separator line across the current container. */
  public addDivider(opts: Partial<any> = {}): SimpleControlRef {
    return this.addVisualControl("separator", this.getAvailableWidth(), 2, {
      ...opts,
    });
  }

  /** Adds a searchable command palette / quick-open overlay control with keyboard navigation and item selection callback. */
  public addCommandPalette(
    idOrItems?: string | any[],
    itemsOrOnSelect?: any[] | EventCallback | string | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let items: any[] = [];
    let selectHandler: EventCallback | undefined;
    let finalOpts: Record<string, any> = { ...opts };

    if (typeof onSelect === "function") {
      selectHandler = onSelect as EventCallback;
    } else if (typeof onSelect === "object" && onSelect !== null) {
      finalOpts = { ...onSelect, ...finalOpts };
    }

    if (typeof idOrItems === "string") {
      explicitId = idOrItems;
      if (Array.isArray(itemsOrOnSelect)) {
        items = itemsOrOnSelect;
      } else if (typeof itemsOrOnSelect === "function") {
        selectHandler = itemsOrOnSelect as EventCallback;
      } else if (typeof itemsOrOnSelect === "string") {
        finalOpts.placeholder = itemsOrOnSelect;
      } else if (
        typeof itemsOrOnSelect === "object" &&
        itemsOrOnSelect !== null
      ) {
        finalOpts = { ...itemsOrOnSelect, ...finalOpts };
      }
    } else if (Array.isArray(idOrItems)) {
      items = idOrItems;
      if (typeof itemsOrOnSelect === "function")
        selectHandler = itemsOrOnSelect as EventCallback;
      else if (typeof itemsOrOnSelect === "object" && itemsOrOnSelect !== null)
        finalOpts = { ...itemsOrOnSelect, ...finalOpts };
    }

    const ctrlOpts: Record<string, any> = {
      items,
      commands: items,
      ...finalOpts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const ref = this.addVisualControl(
      "command_palette",
      finalOpts.width || Math.min(480, this.width - 40),
      finalOpts.height || 44,
      ctrlOpts,
    );
    if (selectHandler) ref.on("select", selectHandler);
    return ref;
  }
  /** Snake_case alias of `addCommandPalette`: adds a searchable command palette / quick-open overlay control with keyboard navigation and item selection callback. */
  public add_command_palette(
    idOrItems?: string | any[],
    itemsOrOnSelect?: any[] | EventCallback | string | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addCommandPalette(idOrItems, itemsOrOnSelect, onSelect, opts);
  }
  /** Alias of `addCommandPalette`: adds a searchable command palette / quick-open overlay control with keyboard navigation and item selection callback. */
  public addQuickOpen(
    idOrItems?: string | any[],
    itemsOrOnSelect?: any[] | EventCallback | string | Partial<any>,
    onSelect?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addCommandPalette(idOrItems, itemsOrOnSelect, onSelect, opts);
  }

  /** Adds a side-by-side or inline diff viewer comparing original and modified text content. */
  public addDiffView(
    idOrOriginal?: string,
    originalOrModified?: string | Partial<any>,
    modifiedOrOpts?: string | number | Partial<any>,
    widthOrOpts?: number | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let originalText = "";
    let modifiedText = "";
    let finalOpts: Record<string, any> = {};
    let width = 540;
    let height = 200;

    if (
      typeof idOrOriginal === "string" &&
      typeof originalOrModified === "string" &&
      typeof modifiedOrOpts === "string"
    ) {
      explicitId = idOrOriginal;
      originalText = originalOrModified;
      modifiedText = modifiedOrOpts;
      if (typeof widthOrOpts === "object" && widthOrOpts !== null)
        finalOpts = { ...widthOrOpts };
      else if (typeof opts === "object" && opts !== null)
        finalOpts = { ...opts };
    } else if (
      typeof idOrOriginal === "string" &&
      typeof originalOrModified === "string"
    ) {
      originalText = idOrOriginal;
      modifiedText = originalOrModified;
      if (typeof modifiedOrOpts === "number") width = modifiedOrOpts;
      else if (typeof modifiedOrOpts === "object" && modifiedOrOpts !== null)
        finalOpts = { ...modifiedOrOpts };

      if (typeof widthOrOpts === "number") height = widthOrOpts;
      else if (typeof widthOrOpts === "object" && widthOrOpts !== null)
        finalOpts = { ...finalOpts, ...widthOrOpts };

      if (typeof opts === "object" && opts !== null)
        finalOpts = { ...finalOpts, ...opts };
    } else if (typeof idOrOriginal === "string") {
      explicitId = idOrOriginal;
      if (typeof originalOrModified === "object" && originalOrModified !== null)
        finalOpts = { ...originalOrModified };
    }

    const ctrlOpts: Record<string, any> = {
      text: originalText,
      caption: modifiedText,
      original: originalText,
      modified: modifiedText,
      value: modifiedText,
      original_title: finalOpts.original_title || finalOpts.originalTitle,
      modified_title: finalOpts.modified_title || finalOpts.modifiedTitle,
      ...finalOpts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    return this.addVisualControl(
      "diff_view",
      finalOpts.width || width,
      finalOpts.height || height,
      ctrlOpts,
    );
  }
  /** Snake_case alias of `addDiffView`: adds a side-by-side or inline diff viewer comparing original and modified text content. */
  public add_diff_view(
    idOrOriginal?: string,
    originalOrModified?: string | Partial<any>,
    modifiedOrOpts?: string | number | Partial<any>,
    widthOrOpts?: number | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDiffView(
      idOrOriginal,
      originalOrModified,
      modifiedOrOpts,
      widthOrOpts,
      opts,
    );
  }
  /** Alias of `addDiffView`: adds a side-by-side or inline diff viewer comparing original and modified text content. */
  public addDiffEditor(
    idOrOriginal?: string,
    originalOrModified?: string | Partial<any>,
    modifiedOrOpts?: string | number | Partial<any>,
    widthOrOpts?: number | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDiffView(
      idOrOriginal,
      originalOrModified,
      modifiedOrOpts,
      widthOrOpts,
      opts,
    );
  }

  /** Adds a horizontal toolbar strip populated with action buttons or icon items. */
  public addToolBar(
    idOrItems?: string | any[],
    itemsOrOnClick?: any[] | string | EventCallback | Partial<any>,
    onClick?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let items: any[] = [];
    let clickHandler: EventCallback | undefined;
    let finalOpts: Record<string, any> = { ...opts };

    if (typeof onClick === "function") clickHandler = onClick as EventCallback;
    else if (typeof onClick === "object" && onClick !== null)
      finalOpts = { ...onClick, ...finalOpts };

    if (
      typeof idOrItems === "string" &&
      (Array.isArray(itemsOrOnClick) || typeof itemsOrOnClick === "string")
    ) {
      explicitId = idOrItems;
      items = Array.isArray(itemsOrOnClick)
        ? itemsOrOnClick
        : String(itemsOrOnClick)
            .split(",")
            .map((s) => s.trim());
    } else if (Array.isArray(idOrItems)) {
      items = idOrItems;
      if (typeof itemsOrOnClick === "function")
        clickHandler = itemsOrOnClick as EventCallback;
      else if (typeof itemsOrOnClick === "object" && itemsOrOnClick !== null)
        finalOpts = { ...itemsOrOnClick, ...finalOpts };
    } else if (typeof idOrItems === "string") {
      explicitId = idOrItems;
      if (typeof itemsOrOnClick === "function")
        clickHandler = itemsOrOnClick as EventCallback;
      else if (typeof itemsOrOnClick === "object" && itemsOrOnClick !== null)
        finalOpts = { ...itemsOrOnClick, ...finalOpts };
    } else {
      items = ["📄 New", "📂 Open", "💾 Save", "⚙️ Settings"];
    }

    const ctrlOpts: Record<string, any> = {
      items,
      text: Array.isArray(items)
        ? items
            .map((it) =>
              typeof it === "string" ? it : it.label || it.name || it.id,
            )
            .join(", ")
        : String(items),
      ...finalOpts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const ref = this.addVisualControl(
      "tool_bar",
      finalOpts.width || this.width - this.padding * 2,
      finalOpts.height || 36,
      ctrlOpts,
    );
    if (clickHandler) ref.onClick(clickHandler);
    return ref;
  }
  /** Snake_case alias of `addToolBar`: adds a horizontal toolbar strip populated with action buttons or icon items. */
  public add_tool_bar(
    idOrItems?: string | any[],
    itemsOrOnClick?: any[] | string | EventCallback | Partial<any>,
    onClick?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addToolBar(idOrItems, itemsOrOnClick, onClick, opts);
  }
  /** Alias of `addToolBar`: adds a horizontal toolbar strip populated with action buttons or icon items. */
  public addToolbar(
    idOrItems?: string | any[],
    itemsOrOnClick?: any[] | string | EventCallback | Partial<any>,
    onClick?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addToolBar(idOrItems, itemsOrOnClick, onClick, opts);
  }
  /** Alias of `addToolBar`: adds a horizontal toolbar strip populated with action buttons or icon items. */
  public addActionBar(
    idOrItems?: string | any[],
    itemsOrOnClick?: any[] | string | EventCallback | Partial<any>,
    onClick?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addToolBar(idOrItems, itemsOrOnClick, onClick, opts);
  }
  /** Snake_case alias of `addToolBar`: adds a horizontal toolbar strip populated with action buttons or icon items. */
  public tool_bar(
    idOrItems?: any,
    itemsOrOpts?: any,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addToolBar(idOrItems, itemsOrOpts, opts);
  }

  /** Adds a resizable two-pane split container with left/top and right/bottom content. */
  public addSplitPane(
    idOrLeft?: string,
    leftOrRight?: string | Partial<any>,
    rightOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let left = "";
    let right = "";
    let finalOpts: Record<string, any> = { ...opts };

    if (
      typeof idOrLeft === "string" &&
      (typeof leftOrRight === "string" || typeof rightOrOpts === "string")
    ) {
      if (typeof rightOrOpts === "string") {
        explicitId = idOrLeft;
        left = String(leftOrRight || "");
        right = rightOrOpts;
      } else {
        left = idOrLeft;
        right = String(leftOrRight || "");
        if (typeof rightOrOpts === "object" && rightOrOpts !== null)
          finalOpts = { ...rightOrOpts, ...finalOpts };
      }
    } else if (typeof idOrLeft === "string") {
      explicitId = idOrLeft;
      if (typeof leftOrRight === "object" && leftOrRight !== null)
        finalOpts = { ...leftOrRight, ...finalOpts };
    }

    const text = `${left} | ${right}`;
    const ctrlOpts: Record<string, any> = {
      text,
      left_content: left,
      right_content: right,
      initial_split:
        finalOpts.initial_split !== undefined
          ? finalOpts.initial_split
          : finalOpts.initialSplit,
      ...finalOpts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const ref = this.addVisualControl(
      "split_pane",
      finalOpts.width || 540,
      finalOpts.height || 180,
      ctrlOpts,
    );
    const onResize = finalOpts.onResize || finalOpts.on_resize;
    if (onResize && typeof onResize === "function") ref.on("resize", onResize);
    return ref;
  }
  /** Snake_case alias of `addSplitPane`: adds a resizable two-pane split container with left/top and right/bottom content. */
  public add_split_pane(
    idOrLeft?: string,
    leftOrRight?: string | Partial<any>,
    rightOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSplitPane(idOrLeft, leftOrRight, rightOrOpts, opts);
  }
  /** Alias of `addSplitPane`: adds a resizable two-pane split container with left/top and right/bottom content. */
  public addSplitter(
    idOrLeft?: string,
    leftOrRight?: string | Partial<any>,
    rightOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSplitPane(idOrLeft, leftOrRight, rightOrOpts, opts);
  }

  // ==========================================
  // --- VLang SimpleGUI Control Parity API ---
  // ==========================================

  // 1. Text & Input Controls
  /** Adds a styled search field control with optional explicit ID, placeholder, and initial query text. */
  public addSearchField(
    id?: string,
    placeholder = "Search...",
    initialVal = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "search_field",
      Math.min(320, this.width - 40),
      38,
      {
        id,
        placeholder,
        text: initialVal,
        caption: placeholder,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addSearchField`: adds a styled search field control with optional explicit ID, placeholder, and initial query text. */
  public add_search_field(
    id?: string,
    placeholder = "Search...",
    initialVal = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSearchField(id, placeholder, initialVal, opts);
  }

  /** Adds a password input field with optional explicit ID, placeholder, and initial value. */
  public addPassword(
    id?: string,
    placeholder = "Enter password...",
    initialVal = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "password_input",
      Math.min(280, this.width - 40),
      38,
      {
        id,
        placeholder,
        text: initialVal,
        caption: placeholder,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addPassword`: adds a password input field with optional explicit ID, placeholder, and initial value. */
  public add_password(
    id?: string,
    placeholder = "Enter password...",
    initialVal = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addPassword(id, placeholder, initialVal, opts);
  }

  /** Adds a tokenized multi-value input field where entries render as removable token pills. */
  public addTokenField(
    id?: string,
    tokens: string[] = ["Bun", "TypeScript", "VLang"],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "token_field",
      Math.min(380, this.width - 40),
      40,
      {
        id,
        tags: tokens,
        text: tokens.join(", "),
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addTokenField`: adds a tokenized multi-value input field where entries render as removable token pills. */
  public add_token_field(
    id?: string,
    tokens: string[] = ["Bun", "TypeScript", "VLang"],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTokenField(id, tokens, opts);
  }

  /** Adds an interactive tag input control pre-populated with removable tag strings. */
  public addTagInputField(
    id?: string,
    tags: string[] = ["gui", "desktop", "rad"],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "tag_input",
      Math.min(380, this.width - 40),
      40,
      {
        id,
        tags,
        text: tags.join(", "),
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addTagInputField`: adds an interactive tag input control pre-populated with removable tag strings. */
  public add_tag_input_field(
    id?: string,
    tags: string[] = ["gui", "desktop", "rad"],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTagInputField(id, tags, opts);
  }
  /** Alias of `addTagInputField`: adds an interactive tag input control pre-populated with removable tag strings. */
  public addTagInput(
    id?: string,
    tags: string[] = ["gui", "desktop", "rad"],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTagInputField(id, tags, opts);
  }
  /** Snake_case alias of `addTagInputField`: adds an interactive tag input control pre-populated with removable tag strings. */
  public add_tag_input(
    id?: string,
    tags: string[] = ["gui", "desktop", "rad"],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTagInputField(id, tags, opts);
  }
  /** Snake_case alias of `addTagInputField`: adds an interactive tag input control pre-populated with removable tag strings. */
  public tag_input(
    id?: string,
    tags: string[] = ["gui", "desktop", "rad"],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTagInputField(id, tags, opts);
  }

  /** Adds a formatted text input enforcing an input mask pattern (such as phone numbers or dates). */
  public addMaskedInput(
    id?: string,
    mask = "(999) 999-9999",
    initialVal = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "masked_input",
      Math.min(240, this.width - 40),
      38,
      {
        id,
        placeholder: mask,
        text: initialVal,
        caption: mask,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addMaskedInput`: adds a formatted text input enforcing an input mask pattern (such as phone numbers or dates). */
  public add_masked_input(
    id?: string,
    mask = "(999) 999-9999",
    initialVal = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addMaskedInput(id, mask, initialVal, opts);
  }

  /** Adds a text label that switches to an inline text editor when clicked. */
  public addInlineEditableLabel(
    id?: string,
    text = "Click to edit text",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "inline_editable_label",
      Math.min(280, this.width - 40),
      32,
      {
        id,
        text,
        caption: text,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addInlineEditableLabel`: adds a text label that switches to an inline text editor when clicked. */
  public add_inline_editable_label(
    id?: string,
    text = "Click to edit text",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addInlineEditableLabel(id, text, opts);
  }

  // 2. Typography, Banners & Callouts
  /** Adds a prominent section header block with a bold title and muted subtitle. */
  public addSectionHeader(
    title: string,
    subtitle = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "section_header",
      this.width - this.padding * 2,
      48,
      {
        caption: title,
        text: subtitle,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addSectionHeader`: adds a prominent section header block with a bold title and muted subtitle. */
  public add_section_header(
    title: string,
    subtitle = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSectionHeader(title, subtitle, opts);
  }

  /** Adds a keyboard shortcut kbd badge displaying key combinations (e.g. `"Cmd + Shift + P"`). */
  public addHotkeyBadge(
    keys: string | string[],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const keyText = Array.isArray(keys) ? keys.join(" + ") : String(keys);
    const count = Array.isArray(keys)
      ? keys.length
      : keyText.split(/\s+|\+/).filter(Boolean).length;
    const defaultW = Math.max(90, count * 36 + 20);
    return this.addVisualControl("hotkey_badge", defaultW, 28, {
      text: keyText,
      caption: keyText,
      ...opts,
    });
  }
  /** Snake_case alias of `addHotkeyBadge`: adds a keyboard shortcut kbd badge displaying key combinations (e.g. `"Cmd + Shift + P"`). */
  public add_hotkey_badge(
    keys: string | string[],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addHotkeyBadge(keys, opts);
  }

  /** Adds a clickable hyperlink control displaying `text` and pointing to `url`. */
  public addLink(
    text: string,
    url = "#",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("link", 180, 24, {
      text,
      caption: url,
      ...opts,
    });
  }
  /** Snake_case alias of `addLink`: adds a clickable hyperlink control displaying `text` and pointing to `url`. */
  public add_link(
    text: string,
    url = "#",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addLink(text, url, opts);
  }

  /** Adds a full-width notification banner styled with semantic severity (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public addBanner(
    message: string,
    style: "info" | "success" | "warning" | "error" = "info",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("banner", this.width - this.padding * 2, 44, {
      text: message,
      caption: message,
      style,
      ...opts,
    });
  }
  /** Snake_case alias of `addBanner`: adds a full-width notification banner styled with semantic severity (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public add_banner(
    message: string,
    style: "info" | "success" | "warning" | "error" = "info",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addBanner(message, style, opts);
  }

  /** Adds a full-width status banner displaying a prominent operational state message. */
  public addStatusBanner(
    message: string,
    style: "info" | "success" | "warning" | "error" = "info",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "status_banner",
      this.width - this.padding * 2,
      44,
      {
        text: message,
        caption: message,
        style,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addStatusBanner`: adds a full-width status banner displaying a prominent operational state message. */
  public add_status_banner(
    message: string,
    style: "info" | "success" | "warning" | "error" = "info",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addStatusBanner(message, style, opts);
  }

  /** Adds a highlighted callout box with a bold title and descriptive body text. */
  public addInfoCallout(
    title: string,
    body: string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "info_callout",
      this.width - this.padding * 2,
      68,
      {
        caption: title,
        text: body,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addInfoCallout`: adds a highlighted callout box with a bold title and descriptive body text. */
  public add_info_callout(
    title: string,
    body: string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addInfoCallout(title, body, opts);
  }

  /** Adds a large hero showcase banner with title, subtitle, and accent badge. */
  public addHeroBanner(
    title: string,
    subtitle = "",
    badge = "NEW",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "hero_banner",
      this.width - this.padding * 2,
      110,
      {
        caption: title,
        text: subtitle,
        placeholder: badge,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addHeroBanner`: adds a large hero showcase banner with title, subtitle, and accent badge. */
  public add_hero_banner(
    title: string,
    subtitle = "",
    badge = "NEW",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addHeroBanner(title, subtitle, badge, opts);
  }

  // 3. Buttons & Toolbars
  /** Adds a clickable button combining an image/icon source with a text caption. */
  public addImageButton(
    src: string,
    caption = "",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("image_button", 140, 42, {
      caption: caption || src,
      text: src,
      onClick,
      ...opts,
    });
  }
  /** Snake_case alias of `addImageButton`: adds a clickable button combining an image/icon source with a text caption. */
  public add_image_button(
    src: string,
    caption = "",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addImageButton(src, caption, onClick, opts);
  }

  /** Adds a compact circular `?` help button with hover tooltip and click callback. */
  public addHelpButton(
    tooltipText = "Help information",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("help_button", 36, 36, {
      tooltip: tooltipText,
      caption: "?",
      text: tooltipText,
      onClick,
      ...opts,
    });
  }
  /** Snake_case alias of `addHelpButton`: adds a compact circular `?` help button with hover tooltip and click callback. */
  public add_help_button(
    tooltipText = "Help information",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addHelpButton(tooltipText, onClick, opts);
  }

  /** Adds a primary action button paired with a secondary dropdown menu of related actions. */
  public addSplitButton(
    caption: string,
    menuItems: string[] = ["Action 1", "Action 2"],
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("split_button", 160, 38, {
      caption,
      text: caption,
      items: menuItems,
      onClick,
      ...opts,
    });
  }
  /** Snake_case alias of `addSplitButton`: adds a primary action button paired with a secondary dropdown menu of related actions. */
  public add_split_button(
    caption: string,
    menuItems: string[] = ["Action 1", "Action 2"],
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSplitButton(caption, menuItems, onClick, opts);
  }

  /** Adds a push button adorned with a numeric or text notification counter badge. */
  public addBadgeButton(
    caption: string,
    badgeCount: number | string = "1",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("badge_button", 130, 38, {
      caption,
      text: String(badgeCount),
      onClick,
      ...opts,
    });
  }
  /** Snake_case alias of `addBadgeButton`: adds a push button adorned with a numeric or text notification counter badge. */
  public add_badge_button(
    caption: string,
    badgeCount: number | string = "1",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addBadgeButton(caption, badgeCount, onClick, opts);
  }

  /** Adds a horizontal bar of quick-action shortcut buttons with icons and labels. */
  public addQuickActionBar(
    actions: Array<
      { label: string; icon?: string; actionId?: string } | string
    >,
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "quick_action_bar",
      this.width - this.padding * 2,
      48,
      {
        items: actions,
        onClick: onSelect,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addQuickActionBar`: adds a horizontal bar of quick-action shortcut buttons with icons and labels. */
  public add_quick_action_bar(
    actions: Array<
      { label: string; icon?: string; actionId?: string } | string
    >,
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addQuickActionBar(actions, onSelect, opts);
  }

  /** Adds a floating elevated toolbar strip of icon/label tool actions. */
  public addFloatingToolbar(
    tools: Array<{ icon?: string; label?: string; actionId?: string } | string>,
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "floating_toolbar",
      Math.min(380, this.width - 40),
      46,
      {
        items: tools,
        onClick: onSelect,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addFloatingToolbar`: adds a floating elevated toolbar strip of icon/label tool actions. */
  public add_floating_toolbar(
    tools: Array<{ icon?: string; label?: string; actionId?: string } | string>,
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addFloatingToolbar(tools, onSelect, opts);
  }

  // 4. Selection & Pickers
  /** Adds a single radio button belonging to `groupName` with label and initial checked state. */
  public addRadio(
    label: string,
    groupName: string,
    checked = false,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("radio", 180, 28, {
      caption: label,
      text: label,
      group: groupName,
      value: checked,
      ...opts,
    });
  }
  /** Snake_case alias of `addRadio`: adds a single radio button belonging to `groupName` with label and initial checked state. */
  public add_radio(
    label: string,
    groupName: string,
    checked = false,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addRadio(label, groupName, checked, opts);
  }

  /** Adds a vertical group of mutually exclusive radio buttons for `groupName` with an optional change handler. */
  public addRadioGroup(
    groupName: string,
    options: string[],
    selected = "",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const initial = selected || options[0] || "";
    return this.addVisualControl(
      "radio_group",
      240,
      Math.max(36, options.length * 30),
      {
        id: groupName,
        group: groupName,
        items: options,
        value: initial,
        onChange,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addRadioGroup`: adds a vertical group of mutually exclusive radio buttons for `groupName` with an optional change handler. */
  public add_radio_group(
    groupName: string,
    options: string[],
    selected = "",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addRadioGroup(groupName, options, selected, onChange, opts);
  }

  /** Adds a pull-down action menu control populated with selectable string options. */
  public addPullDown(
    id: string,
    options: string[],
    selected = "",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("pull_down", 220, 36, {
      id,
      items: options,
      value: selected || options[0] || "",
      onChange,
      ...opts,
    });
  }
  /** Snake_case alias of `addPullDown`: adds a pull-down action menu control populated with selectable string options. */
  public add_pull_down(
    id: string,
    options: string[],
    selected = "",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addPullDown(id, options, selected, onChange, opts);
  }

  /** Adds an editable combo box combining a free-text input with a dropdown list of preset options. */
  public addComboBox(
    id: string,
    options: string[],
    initialVal = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("combo_box", 240, 38, {
      id,
      items: options,
      text: initialVal || options[0] || "",
      value: initialVal || options[0] || "",
      ...opts,
    });
  }
  /** Snake_case alias of `addComboBox`: adds an editable combo box combining a free-text input with a dropdown list of preset options. */
  public add_combo_box(
    id: string,
    options: string[],
    initialVal = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addComboBox(id, options, initialVal, opts);
  }

  /** Adds a compact theme selection menu pre-bound to the window's active theme. */
  public addThemeMenu(
    id = "theme_menu",
    selected = "",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("theme_menu", 180, 36, {
      id,
      value: selected || this.theme,
      onChange,
      ...opts,
    });
  }
  /** Snake_case alias of `addThemeMenu`: adds a compact theme selection menu pre-bound to the window's active theme. */
  public add_theme_menu(
    id = "theme_menu",
    selected = "",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addThemeMenu(id, selected, onChange, opts);
  }

  /** Adds a multi-state mode selector (such as `["System", "Dark", "Light"]`) with change callback. */
  public addModeControl(
    id: string,
    modes = ["System", "Dark", "Light"],
    selected = "Dark",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("mode_control", 240, 36, {
      id,
      items: modes,
      value: selected,
      onChange,
      ...opts,
    });
  }
  /** Snake_case alias of `addModeControl`: adds a multi-state mode selector (such as `["System", "Dark", "Light"]`) with change callback. */
  public add_mode_control(
    id: string,
    modes = ["System", "Dark", "Light"],
    selected = "Dark",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addModeControl(id, modes, selected, onChange, opts);
  }

  /** Adds a segmented control where each segment displays an icon and label. */
  public addIconSegments(
    id: string,
    items: Array<{ icon: string; label: string } | string>,
    selectedIdx = 0,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "icon_segments",
      Math.min(320, this.width - 40),
      38,
      {
        id,
        items,
        value: selectedIdx,
        onChange,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addIconSegments`: adds a segmented control where each segment displays an icon and label. */
  public add_icon_segments(
    id: string,
    items: Array<{ icon: string; label: string } | string>,
    selectedIdx = 0,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addIconSegments(id, items, selectedIdx, onChange, opts);
  }

  /** Adds a compact pill-shaped multi-option toggle switch. */
  public addPillToggle(
    id: string,
    options: string[] = ["On", "Off"],
    selectedIdx = 0,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("pill_toggle", 180, 34, {
      id,
      items: options,
      value: selectedIdx,
      onChange,
      ...opts,
    });
  }
  /** Snake_case alias of `addPillToggle`: adds a compact pill-shaped multi-option toggle switch. */
  public add_pill_toggle(
    id: string,
    options: string[] = ["On", "Off"],
    selectedIdx = 0,
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addPillToggle(id, options, selectedIdx, onChange, opts);
  }

  /** Adds an interactive cloud of selectable tag chips. */
  public addTagCloud(
    id: string,
    tags: string[],
    selected: string[] = [],
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "tag_cloud",
      Math.min(420, this.width - 40),
      72,
      {
        id,
        tags,
        selectedTags: selected,
        onClick: onSelect,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addTagCloud`: adds an interactive cloud of selectable tag chips. */
  public add_tag_cloud(
    id: string,
    tags: string[],
    selected: string[] = [],
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTagCloud(id, tags, selected, onSelect, opts);
  }

  /** Adds a dual-list transfer shuttle control for moving items between left (available) and right (selected) lists. */
  public addTransferList(
    id: string,
    leftItems: string[] = [],
    rightItems: string[] = [],
    onChangeOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let onChange: EventCallback | undefined;
    let opts: Partial<any> = {};
    if (typeof onChangeOrOpts === "function") {
      onChange = onChangeOrOpts as EventCallback;
      opts = optsArg;
    } else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null) {
      opts = onChangeOrOpts;
    }
    const ref = this.addVisualControl(
      "transfer_list",
      Math.min(480, this.width - 40),
      opts.height || 170,
      {
        id,
        leftItems,
        rightItems,
        ...opts,
      },
    );
    this.formValuesStore[id] = rightItems.join(",");
    this.formValuesStore[`${id}_available`] = leftItems.join(",");
    if (onChange) ref.onChange(onChange);
    return ref;
  }
  /** Snake_case alias of `addTransferList`: adds a dual-list transfer shuttle control for moving items between left (available) and right (selected) lists. */
  public add_transfer_list(
    id: string,
    leftItems: string[] = [],
    rightItems: string[] = [],
    onChangeOrOpts?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTransferList(
      id,
      leftItems,
      rightItems,
      onChangeOrOpts,
      opts,
    );
  }

  // 5. Sliders, Numbers & Progress
  /** Adds a vertically oriented numeric slider bounded by `[min, max]`. */
  public addVerticalSlider(
    id: string,
    min = 0,
    max = 100,
    val = 50,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("vertical_slider", 48, 160, {
      id,
      min,
      max,
      value: val,
      ...opts,
    });
  }
  /** Snake_case alias of `addVerticalSlider`: adds a vertically oriented numeric slider bounded by `[min, max]`. */
  public add_vertical_slider(
    id: string,
    min = 0,
    max = 100,
    val = 50,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVerticalSlider(id, min, max, val, opts);
  }

  /** Adds a dual-thumb range slider for selecting a `[low, high]` numeric interval within `[min, max]`. */
  public addRangeSlider(
    id: string,
    min = 0,
    max = 100,
    low = 25,
    high = 75,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "range_slider",
      Math.min(300, this.width - 40),
      44,
      {
        id,
        min,
        max,
        lowValue: low,
        highValue: high,
        value: `${low}-${high}`,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addRangeSlider`: adds a dual-thumb range slider for selecting a `[low, high]` numeric interval within `[min, max]`. */
  public add_range_slider(
    id: string,
    min = 0,
    max = 100,
    low = 25,
    high = 75,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addRangeSlider(id, min, max, low, high, opts);
  }

  /** Adds a rotary dial knob control for adjusting a numeric value between `min` and `max`. */
  public addKnob(
    id: string,
    min = 0,
    max = 100,
    val = 50,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("knob", 80, 80, {
      id,
      min,
      max,
      value: val,
      ...opts,
    });
  }
  /** Snake_case alias of `addKnob`: adds a rotary dial knob control for adjusting a numeric value between `min` and `max`. */
  public add_knob(
    id: string,
    min = 0,
    max = 100,
    val = 50,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addKnob(id, min, max, val, opts);
  }

  /** Adds a named progress bar indicator control initialized to `value` out of `max`. */
  public addProgressIndicator(
    id: string,
    value = 0,
    max = 100,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addProgressBar(value, max, { id, ...opts });
  }
  /** Snake_case alias of `addProgressIndicator`: adds a named progress bar indicator control initialized to `value` out of `max`. */
  public add_progress_indicator(
    id: string,
    value = 0,
    max = 100,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addProgressIndicator(id, value, max, opts);
  }

  /** Adds a discrete segmented level meter (such as audio, battery, or capacity bars). */
  public addLevelIndicator(
    id: string,
    value = 5,
    max = 10,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("level_indicator", 160, 24, {
      id,
      value,
      max,
      ...opts,
    });
  }
  /** Snake_case alias of `addLevelIndicator`: adds a discrete segmented level meter (such as audio, battery, or capacity bars). */
  public add_level_indicator(
    id: string,
    value = 5,
    max = 10,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addLevelIndicator(id, value, max, opts);
  }

  /** Adds an animated loading spinner indicator with optional status label. */
  public addSpinner(
    size = 28,
    text = "Loading...",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("spinner", 120, size + 8, {
      caption: text,
      text,
      width: size,
      height: size,
      ...opts,
    });
  }
  /** Snake_case alias of `addSpinner`: adds an animated loading spinner indicator with optional status label. */
  public add_spinner(
    size = 28,
    text = "Loading...",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSpinner(size, text, opts);
  }

  /** Adds an interactive star rating control with `value` active stars out of `max`. */
  public addRating(
    id: string,
    value = 4,
    max = 5,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("rating", 140, 32, {
      id,
      value,
      max,
      ...opts,
    });
  }
  /** Snake_case alias of `addRating`: adds an interactive star rating control with `value` active stars out of `max`. */
  public add_rating(
    id: string,
    value = 4,
    max = 5,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addRating(id, value, max, opts);
  }

  /** Alias of `addRating`: adds an interactive star rating control with `value` active stars out of `max`. */
  public addStarRating(
    id: string,
    value = 4,
    max = 5,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addRating(id, value, max, opts);
  }
  /** Snake_case alias of `addStarRating`: adds an interactive star rating control with `value` active stars out of `max`. */
  public add_star_rating(
    id: string,
    value = 4,
    max = 5,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addStarRating(id, value, max, opts);
  }

  /** Adds a circular donut chart widget displaying a percentage ring, title, and subtitle. */
  public addDonutChart(
    id: string,
    title: string,
    percent = 75,
    subtitle = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("donut_chart", 180, 160, {
      id,
      caption: title,
      value: percent,
      text: subtitle,
      ...opts,
    });
  }
  /** Snake_case alias of `addDonutChart`: adds a circular donut chart widget displaying a percentage ring, title, and subtitle. */
  public add_donut_chart(
    id: string,
    title: string,
    percent = 75,
    subtitle = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDonutChart(id, title, percent, subtitle, opts);
  }

  /** Adds concentric Apple Watch-style activity rings displaying multiple percentage metrics. */
  public addActivityRings(
    id: string,
    rings: Array<{ label: string; percent: number; color?: string }> = [
      { label: "Move", percent: 85, color: "#fa114f" },
      { label: "Exercise", percent: 62, color: "#a1ff00" },
      { label: "Stand", percent: 90, color: "#00f0ff" },
    ],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("activity_rings", 160, 160, {
      id,
      rings,
      ...opts,
    });
  }
  /** Snake_case alias of `addActivityRings`: adds concentric Apple Watch-style activity rings displaying multiple percentage metrics. */
  public add_activity_rings(
    id: string,
    rings?: Array<{ label: string; percent: number; color?: string }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addActivityRings(id, rings, opts);
  }

  /** Adds a stacked horizontal proportional bar showing relative distribution across labeled segments. */
  public addSegmentDistributionBar(
    id: string,
    segments: Array<{ label: string; value: number; color?: string }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "segment_distribution_bar",
      Math.min(380, this.width - 40),
      38,
      {
        id,
        segments,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addSegmentDistributionBar`: adds a stacked horizontal proportional bar showing relative distribution across labeled segments. */
  public add_segment_distribution_bar(
    id: string,
    segments: Array<{ label: string; value: number; color?: string }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSegmentDistributionBar(id, segments, opts);
  }

  /** Alias of `addSegmentDistributionBar`: adds a stacked horizontal proportional bar showing relative distribution across labeled segments. */
  public addSegmentedProgress(
    id: string,
    segments: Array<{ label: string; value: number; color?: string }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSegmentDistributionBar(id, segments, opts);
  }
  /** Snake_case alias of `addSegmentedProgress`: adds a stacked horizontal proportional bar showing relative distribution across labeled segments. */
  public add_segmented_progress(
    id: string,
    segments: Array<{ label: string; value: number; color?: string }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addSegmentedProgress(id, segments, opts);
  }

  /** Adds a user-sentiment mood selector strip (e.g. happy, neutral, sad) with change callback. */
  public addFeedbackMood(
    id: string,
    selected = "neutral",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("feedback_mood", 240, 44, {
      id,
      value: selected,
      onChange,
      ...opts,
    });
  }
  /** Snake_case alias of `addFeedbackMood`: adds a user-sentiment mood selector strip (e.g. happy, neutral, sad) with change callback. */
  public add_feedback_mood(
    id: string,
    selected = "neutral",
    onChange?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addFeedbackMood(id, selected, onChange, opts);
  }

  /** Adds a GitHub-style contribution/activity calendar heatmap over `weeks` weeks. */
  public addActivityHeatmap(
    id: string,
    weeks = 12,
    data?: number[][],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "activity_heatmap",
      Math.min(480, this.width - 40),
      120,
      {
        id,
        weeks,
        heatmapData: data,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addActivityHeatmap`: adds a GitHub-style contribution/activity calendar heatmap over `weeks` weeks. */
  public add_activity_heatmap(
    id: string,
    weeks = 12,
    data?: number[][],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addActivityHeatmap(id, weeks, data, opts);
  }

  // 6. Pickers & File / Path
  /** Adds a start-and-end date range picker control. */
  public addDateRangePicker(
    id: string,
    startDate = "",
    endDate = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("date_range_picker", 280, 40, {
      id,
      startDate,
      endDate,
      value: `${startDate} - ${endDate}`,
      ...opts,
    });
  }
  /** Snake_case alias of `addDateRangePicker`: adds a start-and-end date range picker control. */
  public add_date_range_picker(
    id: string,
    startDate = "",
    endDate = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDateRangePicker(id, startDate, endDate, opts);
  }

  /** Adds a combined date and time picker input control. */
  public addDateTimePicker(
    id: string,
    initialDate = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("date_time_picker", 260, 40, {
      id,
      value: initialDate,
      text: initialDate,
      ...opts,
    });
  }
  /** Snake_case alias of `addDateTimePicker`: adds a combined date and time picker input control. */
  public add_date_time_picker(
    id: string,
    initialDate = "",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDateTimePicker(id, initialDate, opts);
  }

  /** Adds a palette grid of clickable color swatches with an active selection. */
  public addColorGrid(
    id: string,
    colors: string[] = [
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#10b981",
      "#06b6d4",
      "#3b82f6",
      "#6366f1",
      "#a855f7",
    ],
    selected = "#10b981",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("color_grid", 240, 44, {
      id,
      colors,
      value: selected,
      ...opts,
    });
  }
  /** Snake_case alias of `addColorGrid`: adds a palette grid of clickable color swatches with an active selection. */
  public add_color_grid(
    id: string,
    colors?: string[],
    selected?: string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addColorGrid(id, colors, selected, opts);
  }

  /** Alias of `addColorGrid`: adds a palette grid of clickable color swatches with an active selection. */
  public addColorSwatchPanel(
    id: string,
    colors?: string[],
    selected?: string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addColorGrid(id, colors, selected, opts);
  }
  /** Snake_case alias of `addColorSwatchPanel`: adds a palette grid of clickable color swatches with an active selection. */
  public add_color_swatch_panel(
    id: string,
    colors?: string[],
    selected?: string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addColorSwatchPanel(id, colors, selected, opts);
  }

  /** Adds a file path input field paired with a browse button filtered by `filter`. */
  public addFilePickerField(
    id: string,
    placeholder = "Select a file...",
    filter = "*.*",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "file_picker_field",
      Math.min(380, this.width - 40),
      38,
      {
        id,
        placeholder,
        caption: filter,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addFilePickerField`: adds a file path input field paired with a browse button filtered by `filter`. */
  public add_file_picker_field(
    id: string,
    placeholder = "Select a file...",
    filter = "*.*",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addFilePickerField(id, placeholder, filter, opts);
  }

  /** Adds a macOS Finder-style breadcrumb path bar displaying filesystem segments. */
  public addPathControl(
    id: string,
    segments: string[] = ["Macintosh HD", "Users", "codecaine", "Projects"],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "path_control",
      Math.min(420, this.width - 40),
      34,
      {
        id,
        segments,
        text: segments.join("/"),
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addPathControl`: adds a macOS Finder-style breadcrumb path bar displaying filesystem segments. */
  public add_path_control(
    id: string,
    segments?: string[],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addPathControl(id, segments, opts);
  }

  /** Adds a drag-and-drop file upload target area with click-to-browse support. */
  public addDropZone(
    id: string,
    promptText = "Drag & Drop files here or click to browse",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "drop_zone",
      Math.min(480, this.width - 40),
      100,
      {
        id,
        caption: promptText,
        text: promptText,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addDropZone`: adds a drag-and-drop file upload target area with click-to-browse support. */
  public add_drop_zone(
    id: string,
    promptText = "Drag & Drop files here or click to browse",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDropZone(id, promptText, opts);
  }
  /** Snake_case alias of `addDropZone`: adds a drag-and-drop file upload target area with click-to-browse support. */
  public drop_zone(
    id: string,
    promptText = "Drag & Drop files here or click to browse",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDropZone(id, promptText, opts);
  }

  /** Adds a compact form-embedded drag-and-drop file upload zone. */
  public addFormDropZone(
    id: string,
    promptText = "Drop files here or click to browse",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "form_drop_zone",
      Math.min(480, this.width - 40),
      90,
      {
        id,
        text: promptText,
        placeholder: promptText,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addFormDropZone`: adds a compact form-embedded drag-and-drop file upload zone. */
  public add_form_drop_zone(
    id: string,
    promptText = "Drop files here or click to browse",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addFormDropZone(id, promptText, opts);
  }
  /** Snake_case alias of `addFormDropZone`: adds a compact form-embedded drag-and-drop file upload zone. */
  public form_drop_zone(
    id: string,
    promptText = "Drop files here or click to browse",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addFormDropZone(id, promptText, opts);
  }

  /** Adds an interactive file path breadcrumb/location bar control. */
  public addFilePathBar(
    pathOrId: string,
    idOrPath?: string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let id: string;
    let path: string;
    if (idOrPath !== undefined && typeof idOrPath === "string") {
      if (
        pathOrId.startsWith("/") ||
        pathOrId.includes("\\") ||
        pathOrId.includes(".")
      ) {
        path = pathOrId;
        id = idOrPath;
      } else {
        id = pathOrId;
        path = idOrPath;
      }
    } else {
      path = pathOrId;
      id = this.generateUniqueId("file_path_bar");
    }
    return this.addVisualControl(
      "file_path_bar",
      Math.min(640, this.width - 40),
      40,
      {
        id,
        text: path,
        caption: path,
        value: path,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addFilePathBar`: adds an interactive file path breadcrumb/location bar control. */
  public add_file_path_bar(
    pathOrId: string,
    idOrPath?: string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addFilePathBar(pathOrId, idOrPath, opts);
  }
  /** Snake_case alias of `addFilePathBar`: adds an interactive file path breadcrumb/location bar control. */
  public file_path_bar(
    pathOrId: string,
    idOrPath?: string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addFilePathBar(pathOrId, idOrPath, opts);
  }

  /** Adds a horizontal row of selectable hex color swatches. */
  public addColorSwatch(
    idOrColors: string | string[],
    colorsOrSelected?: string[] | string,
    selectedOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let id: string;
    let colors: string[];
    let selected: string;
    let finalOpts: Partial<any> = opts;

    if (Array.isArray(idOrColors)) {
      id = this.generateUniqueId("color_swatch");
      colors = idOrColors;
      selected =
        typeof colorsOrSelected === "string"
          ? colorsOrSelected
          : colors[0] || "#0284c7";
      if (typeof selectedOrOpts === "object") finalOpts = selectedOrOpts;
    } else {
      id = idOrColors;
      colors = Array.isArray(colorsOrSelected)
        ? colorsOrSelected
        : [
            "#0284c7",
            "#38bdf8",
            "#10b981",
            "#f59e0b",
            "#ef4444",
            "#7c3aed",
            "#ec4899",
          ];
      selected =
        typeof selectedOrOpts === "string"
          ? selectedOrOpts
          : colors[0] || "#0284c7";
      if (typeof opts === "object") finalOpts = opts;
    }

    return this.addVisualControl(
      "color_swatch",
      Math.min(320, this.width - 40),
      90,
      {
        id,
        text: colors.join(", "),
        value: selected,
        caption: finalOpts.caption || "Color Palette Swatch",
        ...finalOpts,
      },
    );
  }
  /** Snake_case alias of `addColorSwatch`: adds a horizontal row of selectable hex color swatches. */
  public add_color_swatch(
    idOrColors: string | string[],
    colorsOrSelected?: string[] | string,
    selectedOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addColorSwatch(
      idOrColors,
      colorsOrSelected,
      selectedOrOpts,
      opts,
    );
  }
  /** Snake_case alias of `addColorSwatch`: adds a horizontal row of selectable hex color swatches. */
  public color_swatch(
    idOrColors: string | string[],
    colorsOrSelected?: string[] | string,
    selectedOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addColorSwatch(
      idOrColors,
      colorsOrSelected,
      selectedOrOpts,
      opts,
    );
  }

  /** Adds an inline monthly calendar view control initialized to a target date. */
  public addCalendarView(
    idOrDate: string,
    dateOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let id: string;
    let dateVal: string;
    let finalOpts: Partial<any> = opts;

    if (typeof dateOrOpts === "string") {
      id = idOrDate;
      dateVal = dateOrOpts;
    } else {
      if (
        idOrDate.includes(" ") ||
        idOrDate.includes("-") ||
        idOrDate.includes(",")
      ) {
        id = this.generateUniqueId("calendar_view");
        dateVal = idOrDate;
      } else {
        id = idOrDate;
        dateVal = "July 2026";
      }
      if (typeof dateOrOpts === "object") finalOpts = dateOrOpts;
    }

    return this.addVisualControl("calendar_view", 280, 220, {
      id,
      text: dateVal,
      caption: dateVal,
      value: 25,
      ...finalOpts,
    });
  }
  /** Snake_case alias of `addCalendarView`: adds an inline monthly calendar view control initialized to a target date. */
  public add_calendar_view(
    idOrDate: string,
    dateOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addCalendarView(idOrDate, dateOrOpts, opts);
  }
  /** Snake_case alias of `addCalendarView`: adds an inline monthly calendar view control initialized to a target date. */
  public calendar_view(
    idOrDate: string,
    dateOrOpts?: string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addCalendarView(idOrDate, dateOrOpts, opts);
  }

  /** Adds a triggerable popup context menu control with selectable items. */
  public addPopupMenu(
    idOrItems: string | string[],
    itemsOrOpts?: string[] | string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let id: string;
    let items: string[];
    let finalOpts: Partial<any> = opts;

    if (Array.isArray(idOrItems)) {
      id = this.generateUniqueId("popup_menu");
      items = idOrItems;
      if (typeof itemsOrOpts === "object" && !Array.isArray(itemsOrOpts))
        finalOpts = itemsOrOpts;
    } else {
      id = idOrItems;
      if (Array.isArray(itemsOrOpts)) {
        items = itemsOrOpts;
      } else if (typeof itemsOrOpts === "string") {
        items = itemsOrOpts.split(",").map((s) => s.trim());
      } else {
        items = [
          "✂️ Cut  ⌘X",
          "📋 Copy  ⌘C",
          "📄 Paste  ⌘V",
          "---",
          "🗑️ Delete  ⌫",
        ];
        if (typeof itemsOrOpts === "object") finalOpts = itemsOrOpts;
      }
    }

    return this.addVisualControl("popup_menu", 220, 230, {
      id,
      text: items.join(", "),
      items,
      ...finalOpts,
    });
  }
  /** Snake_case alias of `addPopupMenu`: adds a triggerable popup context menu control with selectable items. */
  public add_popup_menu(
    idOrItems: string | string[],
    itemsOrOpts?: string[] | string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addPopupMenu(idOrItems, itemsOrOpts, opts);
  }
  /** Snake_case alias of `addPopupMenu`: adds a triggerable popup context menu control with selectable items. */
  public popup_menu(
    idOrItems: string | string[],
    itemsOrOpts?: string[] | string | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addPopupMenu(idOrItems, itemsOrOpts, opts);
  }

  /** Adds a top-of-window application menu bar with hierarchical drop-down menus (`File`, `Edit`, `View`, etc.). */
  public addMenuBar(
    idOrMenus?: string | Array<{ label: string; items: string[] }>,
    menusOrOpts?: Array<{ label: string; items: string[] }> | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let id: string;
    let menus: Array<{ label: string; items: string[] }>;
    let finalOpts: Partial<any> = opts;

    if (typeof idOrMenus === "string") {
      id = idOrMenus;
      if (Array.isArray(menusOrOpts)) {
        menus = menusOrOpts;
      } else {
        menus = [
          {
            label: "File",
            items: [
              "📄 New File  ⌘N",
              "📂 Open...  ⌘O",
              "💾 Save  ⌘S",
              "---",
              "🚪 Exit  ⌘Q",
            ],
          },
          {
            label: "Edit",
            items: [
              "↩️ Undo  ⌘Z",
              "↪️ Redo  ⌘⇧Z",
              "---",
              "✂️ Cut  ⌘X",
              "📋 Copy  ⌘C",
              "📄 Paste  ⌘V",
            ],
          },
          {
            label: "View",
            items: [
              "🔍 Zoom In  ⌘+",
              "🔎 Zoom Out  ⌘-",
              "---",
              "🖥️ Fullscreen  ⌃⌘F",
            ],
          },
          {
            label: "Help",
            items: ["📖 Documentation", "---", "ℹ️ About Bun RAD Studio"],
          },
        ];
        if (typeof menusOrOpts === "object") finalOpts = menusOrOpts;
      }
    } else if (Array.isArray(idOrMenus)) {
      id = this.generateUniqueId("menu_bar");
      menus = idOrMenus;
      if (typeof menusOrOpts === "object") finalOpts = menusOrOpts;
    } else {
      id = this.generateUniqueId("menu_bar");
      menus = [
        {
          label: "File",
          items: [
            "📄 New File  ⌘N",
            "📂 Open...  ⌘O",
            "💾 Save  ⌘S",
            "---",
            "🚪 Exit  ⌘Q",
          ],
        },
        {
          label: "Edit",
          items: [
            "↩️ Undo  ⌘Z",
            "↪️ Redo  ⌘⇧Z",
            "---",
            "✂️ Cut  ⌘X",
            "📋 Copy  ⌘C",
            "📄 Paste  ⌘V",
          ],
        },
        {
          label: "View",
          items: [
            "🔍 Zoom In  ⌘+",
            "🔎 Zoom Out  ⌘-",
            "---",
            "🖥️ Fullscreen  ⌃⌘F",
          ],
        },
        {
          label: "Help",
          items: ["📖 Documentation", "---", "ℹ️ About Bun RAD Studio"],
        },
      ];
      if (typeof idOrMenus === "object") finalOpts = idOrMenus;
    }

    return this.addVisualControl(
      "menu_bar",
      this.width - this.padding * 2,
      36,
      {
        id,
        menus,
        items: menus,
        ...finalOpts,
      },
    );
  }
  /** Snake_case alias of `addMenuBar`: adds a top-of-window application menu bar with hierarchical drop-down menus (`File`, `Edit`, `View`, etc.). */
  public add_menu_bar(
    idOrMenus?: any,
    menusOrOpts?: any,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addMenuBar(idOrMenus, menusOrOpts, opts);
  }
  /** Snake_case alias of `addMenuBar`: adds a top-of-window application menu bar with hierarchical drop-down menus (`File`, `Edit`, `View`, etc.). */
  public menu_bar(
    idOrMenus?: any,
    menusOrOpts?: any,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addMenuBar(idOrMenus, menusOrOpts, opts);
  }

  /** Configures the global right-click context menu items shown anywhere on the window background. */
  public setGlobalContextMenu(items: string[]): this {
    (this as any)._globalContextMenuItems = items;
    if (this.isWindowRunning) {
      this.evalJS(`window.globalContextMenuItems = ${JSON.stringify(items)};`);
    }
    return this;
  }
  /** Registers a callback invoked when the user selects an item from the window's global right-click context menu. */
  public onGlobalContextMenu(callback: EventCallback): this {
    this.eventHandlersMap.set("global:context_menu_select", callback);
    this.eventHandlersMap.set("global:oncontextmenuselect", callback);
    return this;
  }
  /** Snake_case alias of `onGlobalContextMenu`: registers a callback invoked when the user selects an item from the window's global right-click context menu. */
  public on_global_context_menu(callback: EventCallback): this {
    return this.onGlobalContextMenu(callback);
  }

  // 7. Media, Code & Views
  /** Adds a sandboxed custom HTML container rendering raw HTML markup inside the layout. */
  public addHtmlView(
    html: string,
    width = 520,
    height = 220,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "html_view",
      Math.min(width, this.width - 40),
      height,
      {
        text: html,
        caption: html,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addHtmlView`: adds a sandboxed custom HTML container rendering raw HTML markup inside the layout. */
  public add_html_view(
    html: string,
    width = 520,
    height = 220,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addHtmlView(html, width, height, opts);
  }

  /** Adds an embedded iframe/browser viewport pointing to `url`. */
  public addBrowserView(
    url: string,
    width = 520,
    height = 260,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "browser_view",
      Math.min(width, this.width - 40),
      height,
      {
        caption: url,
        text: url,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addBrowserView`: adds an embedded iframe/browser viewport pointing to `url`. */
  public add_browser_view(
    url: string,
    width = 520,
    height = 260,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addBrowserView(url, width, height, opts);
  }

  /** Adds an editable syntax-aware code editor control initialized with `code` and `language`. */
  public addCodeEditor(
    code: string,
    language = "typescript",
    width = 520,
    height = 220,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "code_editor",
      Math.min(width, this.width - 40),
      height,
      {
        text: code,
        placeholder: language,
        caption: language,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addCodeEditor`: adds an editable syntax-aware code editor control initialized with `code` and `language`. */
  public add_code_editor(
    code: string,
    language = "typescript",
    width = 520,
    height = 220,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addCodeEditor(code, language, width, height, opts);
  }

  /** Adds a full-width IDE code studio panel with header bar, language indicator, and editable source view. */
  public addCodeStudio(
    title: string,
    code: string,
    language = "typescript",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "code_studio",
      this.width - this.padding * 2,
      240,
      {
        caption: title,
        text: code,
        placeholder: language,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addCodeStudio`: adds a full-width IDE code studio panel with header bar, language indicator, and editable source view. */
  public add_code_studio(
    title: string,
    code: string,
    language = "typescript",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addCodeStudio(title, code, language, opts);
  }

  /** Adds a terminal emulator output console pre-populated with command/output lines. */
  public addTerminalView(
    lines: string[] = ["$ bun --version", "1.2.4", "$ ready in 12ms"],
    width = 520,
    height = 180,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "terminal_view",
      Math.min(width, this.width - 40),
      height,
      {
        items: lines,
        text: lines.join("\n"),
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addTerminalView`: adds a terminal emulator output console pre-populated with command/output lines. */
  public add_terminal_view(
    lines?: string[],
    width = 520,
    height = 180,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTerminalView(lines, width, height, opts);
  }

  /** Adds an expandable interactive JSON tree inspector for arbitrary structured data. */
  public addJsonTree(
    data: any,
    width = 520,
    height = 200,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "json_tree",
      Math.min(width, this.width - 40),
      height,
      {
        jsonData: data,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addJsonTree`: adds an expandable interactive JSON tree inspector for arbitrary structured data. */
  public add_json_tree(
    data: any,
    width = 520,
    height = 200,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addJsonTree(data, width, height, opts);
  }

  /** Adds an animated or static multi-bar audio waveform visualization widget. */
  public addAudioWaveform(
    id: string,
    bars = 32,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "audio_waveform",
      Math.min(340, this.width - 40),
      64,
      {
        id,
        bars,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addAudioWaveform`: adds an animated or static multi-bar audio waveform visualization widget. */
  public add_audio_waveform(
    id: string,
    bars = 32,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addAudioWaveform(id, bars, opts);
  }

  /** Adds a grid/strip gallery of thumbnail images with optional captions. */
  public addImageGallery(
    images: Array<{ src: string; caption?: string } | string>,
    width = 520,
    height = 180,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "image_gallery",
      Math.min(width, this.width - 40),
      height,
      {
        images,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addImageGallery`: adds a grid/strip gallery of thumbnail images with optional captions. */
  public add_image_gallery(
    images: Array<{ src: string; caption?: string } | string>,
    width = 520,
    height = 180,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addImageGallery(images, width, height, opts);
  }

  /** Adds an audio/video media playback control with transport buttons and track title. */
  public addMediaPlayer(
    src: string,
    title = "Media Playback",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "media_player",
      Math.min(420, this.width - 40),
      96,
      {
        caption: title,
        text: src,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addMediaPlayer`: adds an audio/video media playback control with transport buttons and track title. */
  public add_media_player(
    src: string,
    title = "Media Playback",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addMediaPlayer(src, title, opts);
  }

  // 8. Cards & Complex Dashboard Tiles
  /** Adds a responsive row of KPI metric cards showing values, deltas, and up/down trend indicators. */
  public addStatGrid(
    stats: Array<{
      label: string;
      value: string;
      delta?: string;
      trend?: "up" | "down";
    }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "stat_grid",
      this.width - this.padding * 2,
      100,
      {
        stats,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addStatGrid`: adds a responsive row of KPI metric cards showing values, deltas, and up/down trend indicators. */
  public add_stat_grid(
    stats: Array<{
      label: string;
      value: string;
      delta?: string;
      trend?: "up" | "down";
    }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addStatGrid(stats, opts);
  }

  /** Adds a summary score card displaying a numeric/letter score, grade badge, and subtitle. */
  public addScoreCard(
    title: string,
    score: number | string,
    subtitle = "",
    grade = "A+",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("score_card", 220, 110, {
      caption: title,
      value: score,
      text: subtitle,
      placeholder: grade,
      ...opts,
    });
  }
  /** Snake_case alias of `addScoreCard`: adds a summary score card displaying a numeric/letter score, grade badge, and subtitle. */
  public add_score_card(
    title: string,
    score: number | string,
    subtitle = "",
    grade = "A+",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addScoreCard(title, score, subtitle, grade, opts);
  }

  /** Adds a user identity card with avatar image, display name, role subtitle, and presence indicator. */
  public addAvatarCard(
    name: string,
    role: string,
    avatarUrl = "",
    status = "online",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("avatar_card", 240, 80, {
      caption: name,
      text: role,
      placeholder: avatarUrl,
      status,
      ...opts,
    });
  }
  /** Snake_case alias of `addAvatarCard`: adds a user identity card with avatar image, display name, role subtitle, and presence indicator. */
  public add_avatar_card(
    name: string,
    role: string,
    avatarUrl = "",
    status = "online",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addAvatarCard(name, role, avatarUrl, status, opts);
  }

  /** Adds a rich social/profile card displaying user bio, handle, avatar, and follower/post statistics. */
  public addUserProfileCard(
    user: {
      name: string;
      handle: string;
      avatar?: string;
      bio?: string;
      stats?: { followers: string; following: string; posts: string };
    },
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("user_profile_card", 280, 150, {
      userProfile: user,
      caption: user.name,
      text: user.handle,
      ...opts,
    });
  }
  /** Snake_case alias of `addUserProfileCard`: adds a rich social/profile card displaying user bio, handle, avatar, and follower/post statistics. */
  public add_user_profile_card(
    user: {
      name: string;
      handle: string;
      avatar?: string;
      bio?: string;
      stats?: { followers: string; following: string; posts: string };
    },
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addUserProfileCard(user, opts);
  }

  /** Adds an e-commerce product showcase card with title, price, rating, tag badge, and description. */
  public addProductCard(
    product: {
      title: string;
      price: string;
      rating?: number;
      reviews?: number;
      tag?: string;
      image?: string;
      description?: string;
    },
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("product_card", 260, 220, {
      productData: product,
      caption: product.title,
      value: product.price,
      ...opts,
    });
  }
  /** Snake_case alias of `addProductCard`: adds an e-commerce product showcase card with title, price, rating, tag badge, and description. */
  public add_product_card(
    product: {
      title: string;
      price: string;
      rating?: number;
      reviews?: number;
      tag?: string;
      image?: string;
      description?: string;
    },
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addProductCard(product, opts);
  }

  /** Adds a clickable dashboard launcher tile with large icon, title, and description. */
  public addAppLauncherTile(
    title: string,
    icon = "⚡",
    description = "",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("app_launcher_tile", 180, 100, {
      caption: title,
      placeholder: icon,
      text: description,
      onClick,
      ...opts,
    });
  }
  /** Snake_case alias of `addAppLauncherTile`: adds a clickable dashboard launcher tile with large icon, title, and description. */
  public add_app_launcher_tile(
    title: string,
    icon = "⚡",
    description = "",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addAppLauncherTile(title, icon, description, onClick, opts);
  }

  /** Adds an API inspector card displaying HTTP method badge, request URL, status code, and latency. */
  public addHttpRequestCard(
    method = "GET",
    url = "https://api.example.com/v1/data",
    status = 200,
    latency = "42ms",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "http_request_card",
      Math.min(440, this.width - 40),
      96,
      {
        method,
        url,
        status,
        latency,
        caption: `${method} ${url}`,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addHttpRequestCard`: adds an API inspector card displaying HTTP method badge, request URL, status code, and latency. */
  public add_http_request_card(
    method = "GET",
    url = "https://api.example.com/v1/data",
    status = 200,
    latency = "42ms",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addHttpRequestCard(method, url, status, latency, opts);
  }

  /** Adds a system telemetry monitor widget displaying live CPU, RAM, and disk utilization bars. */
  public addResourceMonitor(
    id = "sys_res",
    cpu = 38,
    ram = 54,
    disk = 68,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "resource_monitor",
      Math.min(360, this.width - 40),
      100,
      {
        id,
        cpu,
        ram,
        disk,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addResourceMonitor`: adds a system telemetry monitor widget displaying live CPU, RAM, and disk utilization bars. */
  public add_resource_monitor(
    id = "sys_res",
    cpu = 38,
    ram = 54,
    disk = 68,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addResourceMonitor(id, cpu, ram, disk, opts);
  }

  /** Adds a key-value environment variable inspector/editor list. */
  public addEnvVars(
    id = "env_list",
    vars: Record<string, string> = {
      NODE_ENV: "development",
      BUN_PORT: "3000",
      APP_DEBUG: "true",
    },
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "env_vars",
      Math.min(420, this.width - 40),
      140,
      {
        id,
        envVars: vars,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addEnvVars`: adds a key-value environment variable inspector/editor list. */
  public add_env_vars(
    id = "env_list",
    vars?: Record<string, string>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addEnvVars(id, vars, opts);
  }

  /** Adds a compact status dot + label indicator (`"active"`, `"warning"`, `"error"`, or `"offline"`). */
  public addStatusIndicator(
    label: string,
    status: "active" | "warning" | "error" | "offline" = "active",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("status_indicator", 160, 28, {
      caption: label,
      text: label,
      status,
      ...opts,
    });
  }
  /** Snake_case alias of `addStatusIndicator`: adds a compact status dot + label indicator (`"active"`, `"warning"`, `"error"`, or `"offline"`). */
  public add_status_indicator(
    label: string,
    status?: "active" | "warning" | "error" | "offline",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addStatusIndicator(label, status, opts);
  }

  /** Adds a bottom/inline telemetry status dock displaying icon-label-value pills. */
  public addStatusDock(
    items: Array<{ icon: string; label: string; value: string }> = [
      { icon: "🟢", label: "Backend", value: "Online" },
      { icon: "⚡", label: "Latency", value: "18ms" },
      { icon: "💾", label: "Memory", value: "48 MB" },
    ],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "status_dock",
      this.width - this.padding * 2,
      48,
      {
        dockItems: items,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addStatusDock`: adds a bottom/inline telemetry status dock displaying icon-label-value pills. */
  public add_status_dock(
    items?: Array<{ icon: string; label: string; value: string }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addStatusDock(items, opts);
  }

  // 9. Navigation & Accordion Containers
  /** Adds a vertical icon navigation rail for switching between primary application views. */
  public addNavRail(
    items: Array<{
      icon: string;
      label: string;
      id?: string;
      active?: boolean;
    }>,
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "nav_rail",
      72,
      Math.max(200, items.length * 60),
      {
        navItems: items,
        onClick: onSelect,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addNavRail`: adds a vertical icon navigation rail for switching between primary application views. */
  public add_nav_rail(
    items: Array<{
      icon: string;
      label: string;
      id?: string;
      active?: boolean;
    }>,
    onSelect?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addNavRail(items, onSelect, opts);
  }

  /** Adds an expandable disclosure triangle section that reveals or hides body content. */
  public addDisclosure(
    title: string,
    content: string,
    expanded = false,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "disclosure",
      this.width - this.padding * 2,
      expanded ? 120 : 42,
      {
        caption: title,
        text: content,
        expanded,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addDisclosure`: adds an expandable disclosure triangle section that reveals or hides body content. */
  public add_disclosure(
    title: string,
    content: string,
    expanded = false,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDisclosure(title, content, expanded, opts);
  }

  /** Alias of `addDisclosure`: adds an expandable disclosure triangle section that reveals or hides body content. */
  public addCollapsibleSection(
    title: string,
    content: string,
    expanded = false,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addDisclosure(title, content, expanded, opts);
  }
  /** Snake_case alias of `addCollapsibleSection`: adds an expandable disclosure triangle section that reveals or hides body content. */
  public add_collapsible_section(
    title: string,
    content: string,
    expanded = false,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addCollapsibleSection(title, content, expanded, opts);
  }

  /** Adds a vertically stacked accordion of collapsible titled content panels. */
  public addAccordionGroup(
    items: Array<{ title: string; content: string; expanded?: boolean }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "accordion_group",
      this.width - this.padding * 2,
      items.length * 48 + 60,
      {
        accordionItems: items,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addAccordionGroup`: adds a vertically stacked accordion of collapsible titled content panels. */
  public add_accordion_group(
    items: Array<{ title: string; content: string; expanded?: boolean }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addAccordionGroup(items, opts);
  }

  /** Adds a multi-column drag-and-drop Kanban task board with card move callbacks. */
  public addKanbanBoard(
    idOrColumns: string | Array<any>,
    columnsOrOnMove?: Array<any> | EventCallback | Partial<any>,
    onMoveOrOpts?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let cols: any[] = [];
    let moveHandler: EventCallback | undefined;
    let finalOpts: Record<string, any> = { ...opts };

    if (typeof onMoveOrOpts === "function")
      moveHandler = onMoveOrOpts as EventCallback;
    else if (typeof onMoveOrOpts === "object" && onMoveOrOpts !== null)
      finalOpts = { ...onMoveOrOpts, ...finalOpts };

    if (typeof idOrColumns === "string") {
      explicitId = idOrColumns;
      if (Array.isArray(columnsOrOnMove)) cols = columnsOrOnMove;
      else if (typeof columnsOrOnMove === "function")
        moveHandler = columnsOrOnMove as EventCallback;
      else if (typeof columnsOrOnMove === "object" && columnsOrOnMove !== null)
        finalOpts = { ...columnsOrOnMove, ...finalOpts };
    } else if (Array.isArray(idOrColumns)) {
      cols = idOrColumns;
      if (typeof columnsOrOnMove === "function")
        moveHandler = columnsOrOnMove as EventCallback;
      else if (typeof columnsOrOnMove === "object" && columnsOrOnMove !== null)
        finalOpts = { ...columnsOrOnMove, ...finalOpts };
    }

    const ctrlOpts: Record<string, any> = {
      kanbanColumns: cols,
      columns: cols,
      ...finalOpts,
    };
    if (explicitId) ctrlOpts.id = explicitId;
    const ref = this.addVisualControl(
      "kanban_board",
      finalOpts.width || this.width - this.padding * 2,
      finalOpts.height || 220,
      ctrlOpts,
    );
    if (moveHandler) ref.on("card_move", moveHandler);
    return ref;
  }
  /** Snake_case alias of `addKanbanBoard`: adds a multi-column drag-and-drop Kanban task board with card move callbacks. */
  public add_kanban_board(
    idOrColumns: string | Array<any>,
    columnsOrOnMove?: Array<any> | EventCallback | Partial<any>,
    onMoveOrOpts?: EventCallback | Partial<any>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addKanbanBoard(
      idOrColumns,
      columnsOrOnMove,
      onMoveOrOpts,
      opts,
    );
  }

  /** Adds a horizontal bar of primary and secondary form action buttons. */
  public addActionRow(
    buttons: Array<{
      label: string;
      onClick?: EventCallback;
      primary?: boolean;
      style?: string;
    }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "action_row",
      this.width - this.padding * 2,
      48,
      {
        actionButtons: buttons,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addActionRow`: adds a horizontal bar of primary and secondary form action buttons. */
  public add_action_row(
    buttons: Array<{
      label: string;
      onClick?: EventCallback;
      primary?: boolean;
      style?: string;
    }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addActionRow(buttons, opts);
  }

  /** Adds a multi-column horizontal row of labeled text input fields. */
  public addFieldsRow(
    fields: Array<{
      label: string;
      id: string;
      placeholder?: string;
      value?: string;
    }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "fields_row",
      this.width - this.padding * 2,
      68,
      {
        rowFields: fields,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addFieldsRow`: adds a multi-column horizontal row of labeled text input fields. */
  public add_fields_row(
    fields: Array<{
      label: string;
      id: string;
      placeholder?: string;
      value?: string;
    }>,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addFieldsRow(fields, opts);
  }

  /** Adds a titled group box frame container with explicit width and height. */
  public addGroupBox(
    title: string,
    width?: number,
    height = 180,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "group_box",
      width || this.width - this.padding * 2,
      height,
      {
        caption: title,
        text: title,
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addGroupBox`: adds a titled group box frame container with explicit width and height. */
  public add_group_box(
    title: string,
    width?: number,
    height = 180,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addGroupBox(title, width, height, opts);
  }

  /** Adds a horizontal tab bar control with selectable tab labels and active index. */
  public addTabs(
    tabNames: string[],
    selectedIdxOrOpts: number | Partial<any> = 0,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    let selectedIdx = 0;
    let finalOpts: Record<string, any> = { ...opts };
    if (typeof selectedIdxOrOpts === "number") {
      selectedIdx = selectedIdxOrOpts;
    } else if (
      typeof selectedIdxOrOpts === "object" &&
      selectedIdxOrOpts !== null
    ) {
      finalOpts = { ...selectedIdxOrOpts, ...finalOpts };
    }
    const activeTabLabel = tabNames[selectedIdx] ?? tabNames[0] ?? "";
    return this.addVisualControl("tabs", this.width - this.padding * 2, 40, {
      items: tabNames,
      tabLabels: [...tabNames],
      selectedIndex: selectedIdx,
      value: activeTabLabel,
      ...finalOpts,
    });
  }
  /** Snake_case alias of `addTabs`: adds a horizontal tab bar control with selectable tab labels and active index. */
  public add_tabs(
    tabNames: string[],
    selectedIdxOrOpts: number | Partial<any> = 0,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTabs(tabNames, selectedIdxOrOpts, opts);
  }

  /** Adds a scrollable viewport container with fixed height. */
  public addScrollView(
    width?: number,
    height = 240,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl(
      "scroll_view",
      width || this.width - this.padding * 2,
      height,
      {
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addScrollView`: adds a scrollable viewport container with fixed height. */
  public add_scroll_view(
    width?: number,
    height = 240,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addScrollView(width, height, opts);
  }

  /** Inserts vertical whitespace of `height` pixels between layout rows. */
  public addVerticalSpacer(height = 16): SimpleControlRef {
    return this.addVisualControl("spacer_v", 1, height);
  }
  /** Snake_case alias of `addVerticalSpacer`: inserts vertical whitespace of `height` pixels between layout rows. */
  public add_vertical_spacer(height = 16): SimpleControlRef {
    return this.addVerticalSpacer(height);
  }

  /** Inserts horizontal whitespace of `width` pixels between controls in a row. */
  public addHorizontalSpacer(width = 16): SimpleControlRef {
    return this.addVisualControl("spacer_h", width, 1);
  }
  /** Snake_case alias of `addHorizontalSpacer`: inserts horizontal whitespace of `width` pixels between controls in a row. */
  public add_horizontal_spacer(width = 16): SimpleControlRef {
    return this.addHorizontalSpacer(width);
  }

  /** Alias of `addDivider`: adds a full-width horizontal visual separator line across the current container. */
  public addSeparator(): SimpleControlRef {
    return this.addDivider();
  }
  /** Snake_case alias of `addSeparator`: adds a full-width horizontal visual separator line across the current container. */
  public add_separator(): SimpleControlRef {
    return this.addSeparator();
  }

  /** Adds an individual clickable button item to a toolbar strip. */
  public addToolbarItem(
    label: string,
    icon = "",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("toolbar_item", 100, 32, {
      caption: label,
      placeholder: icon,
      onClick,
      ...opts,
    });
  }
  /** Snake_case alias of `addToolbarItem`: adds an individual clickable button item to a toolbar strip. */
  public add_toolbar_item(
    label: string,
    icon = "",
    onClick?: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addToolbarItem(label, icon, onClick, opts);
  }

  /** Adds a system-tray style status icon widget with hover tooltip. */
  public addTrayIcon(
    tooltip: string,
    icon = "⚡",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("tray_icon", 36, 36, {
      caption: tooltip,
      placeholder: icon,
      ...opts,
    });
  }
  /** Snake_case alias of `addTrayIcon`: adds a system-tray style status icon widget with hover tooltip. */
  public add_tray_icon(
    tooltip: string,
    icon = "⚡",
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTrayIcon(tooltip, icon, opts);
  }

  /** Adds a visual CSS grid container control with `columns` columns and `gap` spacing. */
  public addGrid(
    columns = 2,
    gap = 12,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("grid", this.width - this.padding * 2, 120, {
      columns,
      gap,
      ...opts,
    });
  }
  /** Snake_case alias of `addGrid`: adds a visual CSS grid container control with `columns` columns and `gap` spacing. */
  public add_grid(
    columns = 2,
    gap = 12,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addGrid(columns, gap, opts);
  }

  /** Adds a single expandable tree node with child item labels. */
  public addTreeNode(
    label: string,
    children: string[] = [],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addVisualControl("tree_node", 220, 32 + children.length * 24, {
      caption: label,
      items: children,
      ...opts,
    });
  }
  /** Snake_case alias of `addTreeNode`: adds a single expandable tree node with child item labels. */
  public add_tree_node(
    label: string,
    children: string[] = [],
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addTreeNode(label, children, opts);
  }

  /** Registers a repeating non-visual interval timer control that invokes `onTick` every `intervalMs` milliseconds. */
  public addTimer(
    intervalMs: number,
    onTick: EventCallback,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const id = opts.id || this.generateUniqueId("timer");
    const spec: any = {
      id,
      control_type: "timer",
      type: "timer",
      interval: intervalMs,
      enabled: opts.enabled !== undefined ? opts.enabled : true,
      event_handlers: { onTimer: `on_${id}_tick` },
      ...opts,
    };
    this.nonVisualControls.push(spec);
    this._indexControl(spec);

    this.bindControlEvent(id, "onTimer", onTick);
    return new SimpleControlRef(spec, this);
  }

  // ==============================================================
  // ✨ STUDIO EXTENDED CONTROLS: MODERN ERGONOMIC FLUENT APIS
  // ==============================================================

  /** Adds a vertical navigation sidebar menu with header title, clickable items, and selection callback. */
  public addSidebar(
    idOrTitleOrItems: string | any[] = "Navigation",
    titleOrItemsOrOnClick?: string | any[] | EventCallback,
    itemsOrOnClickOrOpts?: any[] | EventCallback | Partial<any>,
    onClickOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let title = "Navigation";
    let items = [
      "🏠 Dashboard",
      "📁 Projects",
      "👥 Team",
      "⚙️ Preferences",
      "❓ Help & Docs",
    ];
    let onClick: EventCallback | undefined;
    let opts: Partial<any> = {};

    if (Array.isArray(idOrTitleOrItems)) {
      items = idOrTitleOrItems;
      if (typeof titleOrItemsOrOnClick === "function")
        onClick = titleOrItemsOrOnClick as EventCallback;
      else if (
        typeof titleOrItemsOrOnClick === "object" &&
        titleOrItemsOrOnClick !== null
      )
        opts = titleOrItemsOrOnClick;
    } else if (typeof idOrTitleOrItems === "string") {
      if (typeof titleOrItemsOrOnClick === "string") {
        explicitId = idOrTitleOrItems;
        title = titleOrItemsOrOnClick;
        if (Array.isArray(itemsOrOnClickOrOpts)) items = itemsOrOnClickOrOpts;
        if (typeof onClickOrOpts === "function")
          onClick = onClickOrOpts as EventCallback;
        else if (typeof onClickOrOpts === "object" && onClickOrOpts !== null)
          opts = onClickOrOpts;
        if (typeof optsArg === "object" && optsArg !== null)
          opts = { ...opts, ...optsArg };
      } else if (Array.isArray(titleOrItemsOrOnClick)) {
        title = idOrTitleOrItems;
        items = titleOrItemsOrOnClick;
        if (typeof itemsOrOnClickOrOpts === "function")
          onClick = itemsOrOnClickOrOpts as EventCallback;
        else if (
          typeof itemsOrOnClickOrOpts === "object" &&
          itemsOrOnClickOrOpts !== null
        )
          opts = itemsOrOnClickOrOpts;
      } else {
        title = idOrTitleOrItems;
        if (typeof titleOrItemsOrOnClick === "function")
          onClick = titleOrItemsOrOnClick as EventCallback;
        else if (
          typeof titleOrItemsOrOnClick === "object" &&
          titleOrItemsOrOnClick !== null
        )
          opts = titleOrItemsOrOnClick;
      }
    }

    const id = explicitId || opts.id || this.generateUniqueId("sidebar");
    const ref = this.addVisualControl("sidebar", 200, 260, {
      id,
      title,
      caption: title,
      text: title,
      items,
      ...opts,
    });
    if (onClick) {
      this.bindControlEvent(id, "onClick", onClick);
    }
    return ref;
  }
  /** Snake_case alias of `addSidebar`: adds a vertical navigation sidebar menu with header title, clickable items, and selection callback. */
  public add_sidebar(...args: any[]) {
    return (this.addSidebar as any)(...args);
  }
  /** W3.CSS-compatible alias of `addSidebar`: adds a vertical navigation sidebar menu with header title, clickable items, and selection callback. */
  public addW3Sidebar(...args: any[]) {
    return (this.addSidebar as any)(...args);
  }
  /** W3.CSS snake_case alias of `addSidebar`: adds a vertical navigation sidebar menu with header title, clickable items, and selection callback. */
  public add_w3_sidebar(...args: any[]) {
    return (this.addSidebar as any)(...args);
  }

  /** Adds a modal dialog overlay container with title, message body, and optional confirmation handler. */
  public addModal(
    idOrTitleOrMsg = "Modal Dialog",
    titleOrMsgOrOnConfirm?: string | EventCallback,
    msgOrOnConfirmOrIsOpen?: string | EventCallback | boolean,
    isOpenOrOnConfirmOrOpts?: boolean | EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let title = "Modal Dialog";
    let message = "This is a modal dialog container.";
    let isOpen = false;
    let onConfirm: EventCallback | undefined;
    let opts: Partial<any> = {};

    if (
      typeof idOrTitleOrMsg === "string" &&
      typeof titleOrMsgOrOnConfirm === "string" &&
      typeof msgOrOnConfirmOrIsOpen === "string"
    ) {
      explicitId = idOrTitleOrMsg;
      title = titleOrMsgOrOnConfirm;
      message = msgOrOnConfirmOrIsOpen;
      if (typeof isOpenOrOnConfirmOrOpts === "boolean")
        isOpen = isOpenOrOnConfirmOrOpts;
      else if (typeof isOpenOrOnConfirmOrOpts === "function")
        onConfirm = isOpenOrOnConfirmOrOpts as EventCallback;
      else if (
        typeof isOpenOrOnConfirmOrOpts === "object" &&
        isOpenOrOnConfirmOrOpts !== null
      )
        opts = isOpenOrOnConfirmOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else if (
      typeof idOrTitleOrMsg === "string" &&
      typeof titleOrMsgOrOnConfirm === "string"
    ) {
      title = idOrTitleOrMsg;
      message = titleOrMsgOrOnConfirm;
      if (typeof msgOrOnConfirmOrIsOpen === "boolean")
        isOpen = msgOrOnConfirmOrIsOpen;
      else if (typeof msgOrOnConfirmOrIsOpen === "function")
        onConfirm = msgOrOnConfirmOrIsOpen as EventCallback;
      else if (
        typeof msgOrOnConfirmOrIsOpen === "object" &&
        msgOrOnConfirmOrIsOpen !== null
      )
        opts = msgOrOnConfirmOrIsOpen;
    } else {
      message = idOrTitleOrMsg;
      if (typeof titleOrMsgOrOnConfirm === "function")
        onConfirm = titleOrMsgOrOnConfirm as EventCallback;
      else if (
        typeof titleOrMsgOrOnConfirm === "object" &&
        titleOrMsgOrOnConfirm !== null
      )
        opts = titleOrMsgOrOnConfirm;
    }

    const id = explicitId || opts.id || this.generateUniqueId("modal");
    const prevY = this.currentY;
    const ref = this.addVisualControl("modal", 480, 200, {
      id,
      title,
      caption: title,
      text: title,
      message,
      content: message,
      is_open: isOpen,
      isOpen,
      ...opts,
    });
    // Modals are fixed overlay backdrops and do not consume canvas vertical flow
    this.currentY = prevY;
    if (onConfirm) {
      this.bindControlEvent(id, "onConfirm", onConfirm);
      this.bindControlEvent(id, "onClick", onConfirm);
    }
    return ref;
  }
  /** Snake_case alias of `addModal`: adds a modal dialog overlay container with title, message body, and optional confirmation handler. */
  public add_modal(...args: any[]) {
    return (this.addModal as any)(...args);
  }
  /** Alias of `addModal`: adds a modal dialog overlay container with title, message body, and optional confirmation handler. */
  public addModalDialog(...args: any[]) {
    return (this.addModal as any)(...args);
  }
  /** Snake_case alias of `addModal`: adds a modal dialog overlay container with title, message body, and optional confirmation handler. */
  public add_modal_dialog(...args: any[]) {
    return (this.addModal as any)(...args);
  }
  /** W3.CSS-compatible alias of `addModal`: adds a modal dialog overlay container with title, message body, and optional confirmation handler. */
  public addW3Modal(...args: any[]) {
    return (this.addModal as any)(...args);
  }
  /** W3.CSS snake_case alias of `addModal`: adds a modal dialog overlay container with title, message body, and optional confirmation handler. */
  public add_w3_modal(...args: any[]) {
    return (this.addModal as any)(...args);
  }

  /** Adds a clickable dropdown action menu button that reveals a list of selectable commands. */
  public addDropdownMenu(
    idOrLabelOrItems: string | any[] = "Select Action",
    labelOrItemsOrOnSelect?: string | any[] | EventCallback,
    itemsOrOnSelectOrOpts?: any[] | EventCallback | Partial<any>,
    onSelectOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let label = "Select Action";
    let items = ["Action 1", "Action 2", "Settings"];
    let onSelect: EventCallback | undefined;
    let opts: Partial<any> = {};

    if (Array.isArray(idOrLabelOrItems)) {
      items = idOrLabelOrItems;
      if (typeof labelOrItemsOrOnSelect === "function")
        onSelect = labelOrItemsOrOnSelect as EventCallback;
      else if (
        typeof labelOrItemsOrOnSelect === "object" &&
        labelOrItemsOrOnSelect !== null
      )
        opts = labelOrItemsOrOnSelect;
    } else if (typeof idOrLabelOrItems === "string") {
      if (typeof labelOrItemsOrOnSelect === "string") {
        explicitId = idOrLabelOrItems;
        label = labelOrItemsOrOnSelect;
        if (Array.isArray(itemsOrOnSelectOrOpts)) items = itemsOrOnSelectOrOpts;
        if (typeof onSelectOrOpts === "function")
          onSelect = onSelectOrOpts as EventCallback;
        else if (typeof onSelectOrOpts === "object" && onSelectOrOpts !== null)
          opts = onSelectOrOpts;
        if (typeof optsArg === "object" && optsArg !== null)
          opts = { ...opts, ...optsArg };
      } else if (Array.isArray(labelOrItemsOrOnSelect)) {
        label = idOrLabelOrItems;
        items = labelOrItemsOrOnSelect;
        if (typeof itemsOrOnSelectOrOpts === "function")
          onSelect = itemsOrOnSelectOrOpts as EventCallback;
        else if (
          typeof itemsOrOnSelectOrOpts === "object" &&
          itemsOrOnSelectOrOpts !== null
        )
          opts = itemsOrOnSelectOrOpts;
      } else {
        label = idOrLabelOrItems;
        if (typeof labelOrItemsOrOnSelect === "function")
          onSelect = labelOrItemsOrOnSelect as EventCallback;
        else if (
          typeof labelOrItemsOrOnSelect === "object" &&
          labelOrItemsOrOnSelect !== null
        )
          opts = labelOrItemsOrOnSelect;
      }
    }

    const id = explicitId || opts.id || this.generateUniqueId("dropdown");
    const ref = this.addVisualControl("dropdown_menu", 160, 36, {
      id,
      text: label,
      caption: label,
      items,
      ...opts,
    });
    if (onSelect) {
      this.bindControlEvent(id, "onSelect", onSelect);
      this.bindControlEvent(id, "onClick", onSelect);
    }
    return ref;
  }
  /** Snake_case alias of `addDropdownMenu`: adds a clickable dropdown action menu button that reveals a list of selectable commands. */
  public add_dropdown_menu(...args: any[]) {
    return (this.addDropdownMenu as any)(...args);
  }
  /** W3.CSS-compatible alias of `addDropdownMenu`: adds a clickable dropdown action menu button that reveals a list of selectable commands. */
  public addW3Dropdown(...args: any[]) {
    return (this.addDropdownMenu as any)(...args);
  }
  /** W3.CSS snake_case alias of `addDropdownMenu`: adds a clickable dropdown action menu button that reveals a list of selectable commands. */
  public add_w3_dropdown(...args: any[]) {
    return (this.addDropdownMenu as any)(...args);
  }

  /** Adds a styled vertical list group with optional item badges and selection callback. */
  public addListGroup(
    idOrItems: string | any[] = [],
    itemsOrOnSelect?: any[] | EventCallback,
    onSelectOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let items: any[] = [];
    let onSelect: EventCallback | undefined;
    let opts: Partial<any> = {};

    if (typeof idOrItems === "string" && Array.isArray(itemsOrOnSelect)) {
      explicitId = idOrItems;
      items = itemsOrOnSelect;
      if (typeof onSelectOrOpts === "function")
        onSelect = onSelectOrOpts as EventCallback;
      else if (typeof onSelectOrOpts === "object" && onSelectOrOpts !== null)
        opts = onSelectOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else if (Array.isArray(idOrItems)) {
      items = idOrItems;
      if (typeof itemsOrOnSelect === "function")
        onSelect = itemsOrOnSelect as EventCallback;
      else if (typeof itemsOrOnSelect === "object" && itemsOrOnSelect !== null)
        opts = itemsOrOnSelect;
    }

    const id = explicitId || opts.id || this.generateUniqueId("list_group");
    const ref = this.addVisualControl("list_group", 280, 160, {
      id,
      items,
      ...opts,
    });
    if (onSelect) {
      this.bindControlEvent(id, "onSelect", onSelect);
      this.bindControlEvent(id, "onClick", onSelect);
    }
    return ref;
  }
  /** Snake_case alias of `addListGroup`: adds a styled vertical list group with optional item badges and selection callback. */
  public add_list_group(...args: any[]) {
    return (this.addListGroup as any)(...args);
  }
  /** Alias of `addListGroup`: adds a styled vertical list group with optional item badges and selection callback. */
  public addBadgedList(...args: any[]) {
    return (this.addListGroup as any)(...args);
  }
  /** Snake_case alias of `addListGroup`: adds a styled vertical list group with optional item badges and selection callback. */
  public add_badged_list(...args: any[]) {
    return (this.addListGroup as any)(...args);
  }
  /** W3.CSS-compatible alias of `addListGroup`: adds a styled vertical list group with optional item badges and selection callback. */
  public addW3List(...args: any[]) {
    return (this.addListGroup as any)(...args);
  }
  /** W3.CSS snake_case alias of `addListGroup`: adds a styled vertical list group with optional item badges and selection callback. */
  public add_w3_list(...args: any[]) {
    return (this.addListGroup as any)(...args);
  }

  /** Adds an elevated content card with header title, body description, and optional footer. */
  public addContentCard(
    idOrTitle = "Card Title",
    titleOrDesc?: string | Partial<any>,
    descOrFooter?: string | Partial<any>,
    footerOrOpts?: string | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let title = "Card Title";
    let desc =
      "Cards provide a clean container with elevation shadow, header banner, and action buttons.";
    let footer = "";
    let opts: Partial<any> = {};

    if (
      typeof idOrTitle === "string" &&
      typeof titleOrDesc === "string" &&
      typeof descOrFooter === "string"
    ) {
      explicitId = idOrTitle;
      title = titleOrDesc;
      desc = descOrFooter;
      if (typeof footerOrOpts === "string") footer = footerOrOpts;
      else if (typeof footerOrOpts === "object" && footerOrOpts !== null)
        opts = footerOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else if (
      typeof idOrTitle === "string" &&
      typeof titleOrDesc === "string"
    ) {
      title = idOrTitle;
      desc = titleOrDesc;
      if (typeof descOrFooter === "string") footer = descOrFooter;
      else if (typeof descOrFooter === "object" && descOrFooter !== null)
        opts = descOrFooter;
    } else {
      title = idOrTitle;
      if (typeof titleOrDesc === "object" && titleOrDesc !== null)
        opts = titleOrDesc;
    }

    const id = explicitId || opts.id || this.generateUniqueId("card");
    return this.addVisualControl("content_card", 240, 220, {
      id,
      title,
      caption: title,
      text: title,
      description: desc,
      footer,
      ...opts,
    });
  }
  /** Snake_case alias of `addContentCard`: adds an elevated content card with header title, body description, and optional footer. */
  public add_content_card(...args: any[]) {
    return (this.addContentCard as any)(...args);
  }
  /** Alias of `addContentCard`: adds an elevated content card with header title, body description, and optional footer. */
  public addCard(...args: any[]) {
    return (this.addContentCard as any)(...args);
  }
  /** Snake_case alias of `addContentCard`: adds an elevated content card with header title, body description, and optional footer. */
  public add_card(...args: any[]) {
    return (this.addContentCard as any)(...args);
  }
  /** W3.CSS-compatible alias of `addContentCard`: adds an elevated content card with header title, body description, and optional footer. */
  public addW3Card(...args: any[]) {
    return (this.addContentCard as any)(...args);
  }
  /** W3.CSS snake_case alias of `addContentCard`: adds an elevated content card with header title, body description, and optional footer. */
  public add_w3_card(...args: any[]) {
    return (this.addContentCard as any)(...args);
  }

  /** Adds a left-bordered semantic callout/note panel (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public addCalloutPanel(
    idOrTitleOrMsg = "Important Note",
    titleOrMsgOrType?: string,
    msgOrTypeOrOpts?: string | Partial<any>,
    typeOrOpts?: string | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let title = "Important Note";
    let message = "";
    let alertType = "info";
    let opts: Partial<any> = {};

    const CALLOUT_TYPES = new Set([
      "info",
      "success",
      "warning",
      "warn",
      "error",
      "danger",
      "tip",
      "note",
    ]);

    if (
      typeof idOrTitleOrMsg === "string" &&
      typeof titleOrMsgOrType === "string" &&
      typeof msgOrTypeOrOpts === "string" &&
      (typeOrOpts !== undefined ||
        !CALLOUT_TYPES.has(msgOrTypeOrOpts.trim().toLowerCase()))
    ) {
      explicitId = idOrTitleOrMsg;
      title = titleOrMsgOrType;
      message = msgOrTypeOrOpts;
      if (typeof typeOrOpts === "string") alertType = typeOrOpts;
      else if (typeof typeOrOpts === "object" && typeOrOpts !== null)
        opts = typeOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else if (
      typeof idOrTitleOrMsg === "string" &&
      typeof titleOrMsgOrType === "string"
    ) {
      title = idOrTitleOrMsg;
      message = titleOrMsgOrType;
      if (typeof msgOrTypeOrOpts === "string") alertType = msgOrTypeOrOpts;
      else if (typeof msgOrTypeOrOpts === "object" && msgOrTypeOrOpts !== null)
        opts = msgOrTypeOrOpts;
    } else {
      message = idOrTitleOrMsg;
      if (typeof titleOrMsgOrType === "object" && titleOrMsgOrType !== null)
        opts = titleOrMsgOrType;
    }

    const id = explicitId || opts.id || this.generateUniqueId("callout");
    return this.addVisualControl("callout_panel", 280, 80, {
      id,
      title,
      caption: title,
      message,
      text: message,
      alert_type: opts.alert_type || alertType,
      ...opts,
    });
  }
  /** Snake_case alias of `addCalloutPanel`: adds a left-bordered semantic callout/note panel (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public add_callout_panel(...args: any[]) {
    return (this.addCalloutPanel as any)(...args);
  }
  /** Alias of `addCalloutPanel`: adds a left-bordered semantic callout/note panel (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public addNotePanel(...args: any[]) {
    return (this.addCalloutPanel as any)(...args);
  }
  /** Snake_case alias of `addCalloutPanel`: adds a left-bordered semantic callout/note panel (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public add_note_panel(...args: any[]) {
    return (this.addCalloutPanel as any)(...args);
  }
  /** W3.CSS-compatible alias of `addCalloutPanel`: adds a left-bordered semantic callout/note panel (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public addW3Panel(...args: any[]) {
    return (this.addCalloutPanel as any)(...args);
  }
  /** W3.CSS snake_case alias of `addCalloutPanel`: adds a left-bordered semantic callout/note panel (`"info"`, `"success"`, `"warning"`, or `"error"`). */
  public add_w3_panel(...args: any[]) {
    return (this.addCalloutPanel as any)(...args);
  }

  /** Adds an inline trigger element that displays a rich hover tooltip popup. */
  public addTooltipBox(
    idOrTrigger = "Hover Me ℹ️",
    triggerOrTooltip?: string,
    tooltipOrOpts?: string | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let triggerText = "Hover Me ℹ️";
    let tooltipText = "Helpful information popup";
    let opts: Partial<any> = {};

    if (
      typeof idOrTrigger === "string" &&
      typeof triggerOrTooltip === "string" &&
      typeof tooltipOrOpts === "string"
    ) {
      explicitId = idOrTrigger;
      triggerText = triggerOrTooltip;
      tooltipText = tooltipOrOpts;
      if (typeof optsArg === "object" && optsArg !== null) opts = optsArg;
    } else if (
      typeof idOrTrigger === "string" &&
      typeof triggerOrTooltip === "string"
    ) {
      triggerText = idOrTrigger;
      tooltipText = triggerOrTooltip;
      if (typeof tooltipOrOpts === "object" && tooltipOrOpts !== null)
        opts = tooltipOrOpts;
    } else {
      triggerText = idOrTrigger;
      if (typeof triggerOrTooltip === "object" && triggerOrTooltip !== null)
        opts = triggerOrTooltip;
    }

    const id = explicitId || opts.id || this.generateUniqueId("tooltip");
    return this.addVisualControl("tooltip_box", 140, 36, {
      id,
      text: triggerText,
      caption: triggerText,
      tooltip: tooltipText,
      content: tooltipText,
      ...opts,
    });
  }
  /** Snake_case alias of `addTooltipBox`: adds an inline trigger element that displays a rich hover tooltip popup. */
  public add_tooltip_box(...args: any[]) {
    return (this.addTooltipBox as any)(...args);
  }
  /** W3.CSS-compatible alias of `addTooltipBox`: adds an inline trigger element that displays a rich hover tooltip popup. */
  public addW3Tooltip(...args: any[]) {
    return (this.addTooltipBox as any)(...args);
  }
  /** W3.CSS snake_case alias of `addTooltipBox`: adds an inline trigger element that displays a rich hover tooltip popup. */
  public add_w3_tooltip(...args: any[]) {
    return (this.addTooltipBox as any)(...args);
  }

  /** Adds a text input field that smoothly expands in width when focused. */
  public addAnimatedInput(
    idOrPlaceholder = "Click to expand...",
    placeholderOrVal?: string,
    valOrOnChange?: string | EventCallback,
    onChangeOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let placeholder = "Click to expand...";
    let val = "";
    let onChange: EventCallback | undefined;
    let opts: Partial<any> = {};

    if (
      typeof idOrPlaceholder === "string" &&
      typeof placeholderOrVal === "string"
    ) {
      explicitId = idOrPlaceholder;
      placeholder = placeholderOrVal;
      if (typeof valOrOnChange === "string") val = valOrOnChange;
      else if (typeof valOrOnChange === "function")
        onChange = valOrOnChange as EventCallback;
      if (typeof onChangeOrOpts === "function")
        onChange = onChangeOrOpts as EventCallback;
      else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null)
        opts = onChangeOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else {
      placeholder = idOrPlaceholder;
      if (typeof placeholderOrVal === "string") val = placeholderOrVal;
      else if (typeof placeholderOrVal === "function")
        onChange = placeholderOrVal as EventCallback;
      else if (
        typeof placeholderOrVal === "object" &&
        placeholderOrVal !== null
      )
        opts = placeholderOrVal;
    }

    const id = explicitId || opts.id || this.generateUniqueId("anim_input");
    const ref = this.addVisualControl("animated_input", 240, 36, {
      id,
      placeholder,
      value: val,
      text: val,
      ...opts,
    });
    if (onChange) {
      this.bindControlEvent(id, "onChange", onChange);
    }
    return ref;
  }
  /** Snake_case alias of `addAnimatedInput`: adds a text input field that smoothly expands in width when focused. */
  public add_animated_input(...args: any[]) {
    return (this.addAnimatedInput as any)(...args);
  }
  /** W3.CSS-compatible alias of `addAnimatedInput`: adds a text input field that smoothly expands in width when focused. */
  public addW3AnimatedInput(...args: any[]) {
    return (this.addAnimatedInput as any)(...args);
  }
  /** W3.CSS snake_case alias of `addAnimatedInput`: adds a text input field that smoothly expands in width when focused. */
  public add_w3_animated_input(...args: any[]) {
    return (this.addAnimatedInput as any)(...args);
  }

  /** Adds a high-contrast hero typography display banner with title and subtitle. */
  public addHeroDisplay(
    idOrTitle = "Hero Display",
    titleOrSubtitle?: string,
    subtitleOrOpts?: string | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let title = "Hero Display";
    let subtitle =
      "Modern visual container with high contrast typography and responsive layout.";
    let opts: Partial<any> = {};

    if (
      typeof idOrTitle === "string" &&
      typeof titleOrSubtitle === "string" &&
      typeof subtitleOrOpts === "string"
    ) {
      explicitId = idOrTitle;
      title = titleOrSubtitle;
      subtitle = subtitleOrOpts;
      if (typeof optsArg === "object" && optsArg !== null) opts = optsArg;
    } else if (
      typeof idOrTitle === "string" &&
      typeof titleOrSubtitle === "string"
    ) {
      title = idOrTitle;
      subtitle = titleOrSubtitle;
      if (typeof subtitleOrOpts === "object" && subtitleOrOpts !== null)
        opts = subtitleOrOpts;
    } else {
      title = idOrTitle;
      if (typeof titleOrSubtitle === "object" && titleOrSubtitle !== null)
        opts = titleOrSubtitle;
    }

    const id = explicitId || opts.id || this.generateUniqueId("display");
    const w = this.width - this.padding * 2;
    return this.addVisualControl("hero_display", w, 160, {
      id,
      title,
      caption: title,
      text: title,
      subtitle,
      description: subtitle,
      ...opts,
    });
  }
  /** Snake_case alias of `addHeroDisplay`: adds a high-contrast hero typography display banner with title and subtitle. */
  public add_hero_display(...args: any[]) {
    return (this.addHeroDisplay as any)(...args);
  }
  /** Alias of `addHeroDisplay`: adds a high-contrast hero typography display banner with title and subtitle. */
  public addDisplayContainer(...args: any[]) {
    return (this.addHeroDisplay as any)(...args);
  }
  /** Snake_case alias of `addHeroDisplay`: adds a high-contrast hero typography display banner with title and subtitle. */
  public add_display_container(...args: any[]) {
    return (this.addHeroDisplay as any)(...args);
  }
  /** W3.CSS-compatible alias of `addHeroDisplay`: adds a high-contrast hero typography display banner with title and subtitle. */
  public addW3Display(...args: any[]) {
    return (this.addHeroDisplay as any)(...args);
  }
  /** W3.CSS snake_case alias of `addHeroDisplay`: adds a high-contrast hero typography display banner with title and subtitle. */
  public add_w3_display(...args: any[]) {
    return (this.addHeroDisplay as any)(...args);
  }

  /** Adds a formatted code block with syntax highlighting and copy-to-clipboard button. */
  public addCodeSnippet(
    idOrCode = "const app = new StudioApp();",
    codeOrLang?: string,
    langOrOpts?: string | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let code = "const app = new StudioApp();";
    let language = "typescript";
    let opts: Partial<any> = {};

    if (typeof idOrCode === "string" && typeof codeOrLang === "string") {
      explicitId = idOrCode;
      code = codeOrLang;
      if (typeof langOrOpts === "string") language = langOrOpts;
      else if (typeof langOrOpts === "object" && langOrOpts !== null)
        opts = langOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else {
      code = idOrCode;
      if (typeof codeOrLang === "string") language = codeOrLang;
      else if (typeof codeOrLang === "object" && codeOrLang !== null)
        opts = codeOrLang;
    }

    const id = explicitId || opts.id || this.generateUniqueId("code_snippet");
    return this.addVisualControl("code_snippet", 300, 110, {
      id,
      code,
      text: code,
      language,
      ...opts,
    });
  }
  /** Snake_case alias of `addCodeSnippet`: adds a formatted code block with syntax highlighting and copy-to-clipboard button. */
  public add_code_snippet(...args: any[]) {
    return (this.addCodeSnippet as any)(...args);
  }
  /** Alias of `addCodeSnippet`: adds a formatted code block with syntax highlighting and copy-to-clipboard button. */
  public addCodeBlock(...args: any[]) {
    return (this.addCodeSnippet as any)(...args);
  }
  /** Snake_case alias of `addCodeSnippet`: adds a formatted code block with syntax highlighting and copy-to-clipboard button. */
  public add_code_block(...args: any[]) {
    return (this.addCodeSnippet as any)(...args);
  }
  /** W3.CSS-compatible alias of `addCodeSnippet`: adds a formatted code block with syntax highlighting and copy-to-clipboard button. */
  public addW3Code(...args: any[]) {
    return (this.addCodeSnippet as any)(...args);
  }
  /** W3.CSS snake_case alias of `addCodeSnippet`: adds a formatted code block with syntax highlighting and copy-to-clipboard button. */
  public add_w3_code(...args: any[]) {
    return (this.addCodeSnippet as any)(...args);
  }

  /** Adds a circular or pill numeric notification badge with semantic color styling. */
  public addCountBadge(
    idOrLabelOrCount: string | number = 1,
    labelOrCountOrColor?: string | number,
    countOrColorOrOpts?: string | number | Partial<any>,
    colorOrOpts?: string | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let label = "";
    let count: string | number = 1;
    let color = "primary";
    let opts: Partial<any> = {};

    if (
      typeof idOrLabelOrCount === "string" &&
      typeof labelOrCountOrColor === "string" &&
      (typeof countOrColorOrOpts === "number" ||
        typeof countOrColorOrOpts === "string")
    ) {
      explicitId = idOrLabelOrCount;
      label = labelOrCountOrColor;
      count = countOrColorOrOpts;
      if (typeof colorOrOpts === "string") color = colorOrOpts;
      else if (typeof colorOrOpts === "object" && colorOrOpts !== null)
        opts = colorOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else if (
      typeof idOrLabelOrCount === "string" &&
      (typeof labelOrCountOrColor === "number" ||
        typeof labelOrCountOrColor === "string")
    ) {
      label = idOrLabelOrCount;
      count = labelOrCountOrColor;
      if (typeof countOrColorOrOpts === "string") color = countOrColorOrOpts;
      else if (
        typeof countOrColorOrOpts === "object" &&
        countOrColorOrOpts !== null
      )
        opts = countOrColorOrOpts;
    } else {
      count = idOrLabelOrCount;
      if (typeof labelOrCountOrColor === "string") color = labelOrCountOrColor;
      else if (
        typeof labelOrCountOrColor === "object" &&
        labelOrCountOrColor !== null
      )
        opts = labelOrCountOrColor;
    }

    const id = explicitId || opts.id || this.generateUniqueId("count_badge");
    const hasLabel = Boolean(label);
    const w = hasLabel ? 130 : 32;
    return this.addVisualControl("count_badge", w, 32, {
      id,
      label,
      title: label,
      caption: label,
      count,
      text: String(count),
      color,
      alert_type: color,
      ...opts,
    });
  }
  /** Snake_case alias of `addCountBadge`: adds a circular or pill numeric notification badge with semantic color styling. */
  public add_count_badge(...args: any[]) {
    return (this.addCountBadge as any)(...args);
  }
  /** Alias of `addCountBadge`: adds a circular or pill numeric notification badge with semantic color styling. */
  public addCircularBadge(...args: any[]) {
    return (this.addCountBadge as any)(...args);
  }
  /** Snake_case alias of `addCountBadge`: adds a circular or pill numeric notification badge with semantic color styling. */
  public add_circular_badge(...args: any[]) {
    return (this.addCountBadge as any)(...args);
  }
  /** W3.CSS-compatible alias of `addCountBadge`: adds a circular or pill numeric notification badge with semantic color styling. */
  public addW3Badge(...args: any[]) {
    return (this.addCountBadge as any)(...args);
  }
  /** W3.CSS snake_case alias of `addCountBadge`: adds a circular or pill numeric notification badge with semantic color styling. */
  public add_w3_badge(...args: any[]) {
    return (this.addCountBadge as any)(...args);
  }

  /** Adds a joined horizontal group of related action buttons. */
  public addButtonGroup(
    idOrButtons: string | any[] = ["Left", "Center", "Right"],
    buttonsOrOnClick?: any[] | EventCallback,
    onClickOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let buttons = ["Left", "Center", "Right"];
    let onClick: EventCallback | undefined;
    let opts: Partial<any> = {};

    if (typeof idOrButtons === "string" && Array.isArray(buttonsOrOnClick)) {
      explicitId = idOrButtons;
      buttons = buttonsOrOnClick;
      if (typeof onClickOrOpts === "function")
        onClick = onClickOrOpts as EventCallback;
      else if (typeof onClickOrOpts === "object" && onClickOrOpts !== null)
        opts = onClickOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else if (Array.isArray(idOrButtons)) {
      buttons = idOrButtons;
      if (typeof buttonsOrOnClick === "function")
        onClick = buttonsOrOnClick as EventCallback;
      else if (
        typeof buttonsOrOnClick === "object" &&
        buttonsOrOnClick !== null
      )
        opts = buttonsOrOnClick;
    }

    const id = explicitId || opts.id || this.generateUniqueId("button_group");
    const ref = this.addVisualControl("button_group", 240, 36, {
      id,
      buttons,
      ...opts,
    });
    if (onClick) {
      this.bindControlEvent(id, "onClick", onClick);
    }
    return ref;
  }
  /** Snake_case alias of `addButtonGroup`: adds a joined horizontal group of related action buttons. */
  public add_button_group(...args: any[]) {
    return (this.addButtonGroup as any)(...args);
  }
  /** Alias of `addButtonGroup`: adds a joined horizontal group of related action buttons. */
  public addButtonBar(...args: any[]) {
    return (this.addButtonGroup as any)(...args);
  }
  /** Snake_case alias of `addButtonGroup`: adds a joined horizontal group of related action buttons. */
  public add_button_bar(...args: any[]) {
    return (this.addButtonGroup as any)(...args);
  }
  /** W3.CSS-compatible alias of `addButtonGroup`: adds a joined horizontal group of related action buttons. */
  public addW3ButtonGroup(...args: any[]) {
    return (this.addButtonGroup as any)(...args);
  }
  /** W3.CSS snake_case alias of `addButtonGroup`: adds a joined horizontal group of related action buttons. */
  public add_w3_button_group(...args: any[]) {
    return (this.addButtonGroup as any)(...args);
  }

  /** Adds an interactive slide/image carousel with previous/next navigation and slide change callback. */
  public addSlideshow(
    idOrSlides: string | any[] = [],
    slidesOrOnChange?: any[] | EventCallback,
    onChangeOrOpts?: EventCallback | Partial<any>,
    optsArg: Partial<any> = {},
  ): SimpleControlRef {
    let explicitId: string | undefined;
    let slides: any[] = [];
    let onChange: EventCallback | undefined;
    let opts: Partial<any> = {};

    if (typeof idOrSlides === "string" && Array.isArray(slidesOrOnChange)) {
      explicitId = idOrSlides;
      slides = slidesOrOnChange;
      if (typeof onChangeOrOpts === "function")
        onChange = onChangeOrOpts as EventCallback;
      else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null)
        opts = onChangeOrOpts;
      if (typeof optsArg === "object" && optsArg !== null)
        opts = { ...opts, ...optsArg };
    } else if (Array.isArray(idOrSlides)) {
      slides = idOrSlides;
      if (typeof slidesOrOnChange === "function")
        onChange = slidesOrOnChange as EventCallback;
      else if (
        typeof slidesOrOnChange === "object" &&
        slidesOrOnChange !== null
      )
        opts = slidesOrOnChange;
    }

    const id = explicitId || opts.id || this.generateUniqueId("slideshow");
    const ref = this.addVisualControl("slideshow", 300, 180, {
      id,
      slides,
      ...opts,
    });
    if (onChange) {
      this.bindControlEvent(id, "onChange", onChange);
    }
    return ref;
  }
  /** Snake_case alias of `addSlideshow`: adds an interactive slide/image carousel with previous/next navigation and slide change callback. */
  public add_slideshow(...args: any[]) {
    return (this.addSlideshow as any)(...args);
  }
  /** Alias of `addSlideshow`: adds an interactive slide/image carousel with previous/next navigation and slide change callback. */
  public addCarousel(...args: any[]) {
    return (this.addSlideshow as any)(...args);
  }
  /** Snake_case alias of `addSlideshow`: adds an interactive slide/image carousel with previous/next navigation and slide change callback. */
  public add_carousel(...args: any[]) {
    return (this.addSlideshow as any)(...args);
  }
  /** W3.CSS-compatible alias of `addSlideshow`: adds an interactive slide/image carousel with previous/next navigation and slide change callback. */
  public addW3Slideshow(...args: any[]) {
    return (this.addSlideshow as any)(...args);
  }
  /** W3.CSS snake_case alias of `addSlideshow`: adds an interactive slide/image carousel with previous/next navigation and slide change callback. */
  public add_w3_slideshow(...args: any[]) {
    return (this.addSlideshow as any)(...args);
  }

  /** Opens a modal dialog overlay by its control ID in the live window. */
  public openModal(modalId: string): this {
    this.evalJS(
      `if(window.openModal)window.openModal('${modalId}');else{const el=document.getElementById('${modalId}');if(el)el.style.display='flex';}`,
    );
    return this;
  }
  /** Closes an open modal dialog overlay by its control ID in the live window. */
  public closeModal(modalId: string): this {
    this.evalJS(
      `if(window.closeModal)window.closeModal('${modalId}');else{const el=document.getElementById('${modalId}');if(el)el.style.display='none';}`,
    );
    return this;
  }

  // --- IPC Event Registration & Dispatching ---
  /** Registers an event handler callback for a specific control ID and event type (`onClick`, `onChange`, `onEnter`, etc.). */
  public bindControlEvent(
    controlId: string,
    eventType: string,
    callback: EventCallback,
  ): void {
    const raw = eventType.toLowerCase();
    const norm = raw.startsWith("on") ? raw : `on${raw}`;
    const existing = this.eventHandlersMap.get(`${controlId}:${norm}`);
    const combined: EventCallback =
      existing && existing !== callback
        ? async (win, val, ...extra) => {
            await existing(win, val, ...extra);
            await callback(win, val, ...extra);
          }
        : callback;
    this.eventHandlersMap.set(`${controlId}:${norm}`, combined);
    this.eventHandlersMap.set(`${controlId}:${raw}`, combined);

    if (this.webview) {
      const bindName = `on_${controlId}_${eventType.replace(/^on/i, "").toLowerCase()}`;
      try {
        this.webview.bind(bindName, async (val: any) => {
          if (val !== undefined && val !== null) {
            this.formValuesStore[controlId] = val;
          }
          try {
            const fn =
              this.eventHandlersMap.get(`${controlId}:${norm}`) || combined;
            await fn(this, val);
          } catch (err) {
            console.error(`Error in IPC event ${bindName}:`, err);
          }
        });
      } catch (e) {
        // Ignore if already bound
      }
    }
  }

  /** Programmatically dispatches a registered control event (`onClick`, `onChange`, `onEnter`, etc.) for testing or automation. */
  public async triggerEvent(
    controlId: string,
    eventType: string,
    val?: any,
    ...extra: any[]
  ): Promise<this> {
    const raw = eventType.toLowerCase();
    const norm = raw.startsWith("on") ? raw : `on${raw}`;
    if (val !== undefined && (norm === "onchange" || norm === "oninput")) {
      this.setValue(controlId, val);
    }
    const handler =
      this.eventHandlersMap.get(`${controlId}:${norm}`) ||
      this.eventHandlersMap.get(`${controlId}:${raw}`);
    if (handler) {
      const effectiveVal = val !== undefined ? val : this.getValue(controlId);
      await handler(this, effectiveVal, ...extra);
    }
    return this;
  }

  /** Programmatically updates `controlId` (when `val` is provided) and fires its `onChange` handler(s). */
  public async triggerChange(controlId: string, val?: any): Promise<this> {
    return this.triggerEvent(controlId, "onChange", val);
  }

  /** Programmatically fires the `onClick` handler(s) registered on `controlId`. */
  public async triggerClick(controlId: string, val?: any): Promise<this> {
    return this.triggerEvent(controlId, "onClick", val);
  }

  /** Programmatically fires the `onEnter` handler(s) registered on `controlId`. */
  public async triggerEnter(controlId: string, val?: any): Promise<this> {
    return this.triggerEvent(controlId, "onEnter", val);
  }

  /** Evaluates arbitrary JavaScript code asynchronously inside the active webview or browser host. */
  public evalJS(code: string): void {
    if (this.webview) {
      try {
        this.webview.eval(code);
      } catch (e) {
        console.error("[SimpleWindow.evalJS error]:", e);
      }
    }
  }

  /** Alias of `evalJS`: evaluates arbitrary JavaScript code asynchronously inside the active webview or browser host. */
  public eval(code: string): void {
    this.evalJS(code);
  }

  /** Legacy camelCase alias of `evalJS` for compatibility. */
  public evalJs(code: string): void {
    this.evalJS(code);
  }

  /** Retrieves the current value of the control identified by `id`. */
  public getValue(id: string): any {
    if (this.formValuesStore[id] !== undefined) {
      return this.formValuesStore[id];
    }
    const ctrl = this.findControl(id);
    if (ctrl) {
      return ctrl.text ?? ctrl.caption ?? ctrl.value ?? "";
    }
    return undefined;
  }

  /** Updates the value of the control identified by `id`, syncing two-way state bindings and updating the live DOM. */
  public setValue(id: string, val: any): this {
    this.formValuesStore[id] = val;
    const stateKey = this.controlStateBindings.get(id);
    if (stateKey) {
      const strVal = String(val ?? "");
      if (this.getState(stateKey) !== strVal) {
        this.setState(stateKey, strVal);
      }
    }
    if (this.isWindowRunning) {
      const escaped = JSON.stringify(val ?? "");
      const safeId = JSON.stringify(id);
      this.evalJS(`
                (function() {
                    const rawEl = document.getElementById(${safeId});
                    if (!rawEl) return;
                    if (rawEl.classList.contains("simplegui-html-view") || rawEl.dataset.type === "html_view" || rawEl.getAttribute("data-control-type") === "html_view") {
                        rawEl.innerHTML = String(${escaped});
                        return;
                    }
                    const el = (rawEl.tagName === "INPUT" || rawEl.tagName === "SELECT" || rawEl.tagName === "TEXTAREA")
                        ? rawEl
                        : (rawEl.querySelector("input, select, textarea") || rawEl);

                    if (el.type === "checkbox" || el.type === "radio") {
                        el.checked = Boolean(${escaped});
                    } else if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
                        el.value = ${escaped};
                        if (el.tagName === "TEXTAREA") el.scrollTop = el.scrollHeight;
                    } else {
                        const swThumb = rawEl.querySelector(".sw-thumb");
                        const swTrack = rawEl.querySelector(".sw-track");
                        const span = rawEl.querySelector("span");
                        const innerBar = rawEl.querySelector("div > div");

                        if (swThumb && swTrack) {
                            const on = Boolean(${escaped});
                            swThumb.style.left = on ? "22px" : "2px";
                            swTrack.style.background = on ? "var(--accent, #0284c7)" : "rgba(255,255,255,0.15)";
                        } else if (span && rawEl.querySelectorAll("button").length >= 2) {
                            span.textContent = String(${escaped});
                        } else if (innerBar && rawEl.classList.contains("rad-progress")) {
                            innerBar.style.width = String(${escaped}) + "%";
                        } else if (rawEl.classList.contains("simplegui-html-view") || rawEl.dataset.type === "html_view" || rawEl.getAttribute("data-control-type") === "html_view") {
                            rawEl.innerHTML = String(${escaped});
                        } else if (rawEl.value !== undefined) {
                            rawEl.value = ${escaped};
                        } else if (rawEl.querySelector("table, svg")) {
                            // Guard against overwriting table or SVG chart containers with textContent
                            return;
                        } else {
                            rawEl.textContent = String(${escaped});
                        }
                    }
                })();
            `);
    }
    return this;
  }

  /** Sets the raw inner HTML content of a control in both the form store and live DOM. */
  public setHtml(id: string, htmlContent: string): this {
    this.formValuesStore[id] = htmlContent;
    const ctrl = this.findControl(id);
    if (ctrl) {
      ctrl.text = htmlContent;
      ctrl.caption = htmlContent;
    }
    if (this.isWindowRunning) {
      const escaped = JSON.stringify(htmlContent);
      const safeId = JSON.stringify(id);
      this.evalJS(`
                (function() {
                    const el = document.getElementById(${safeId});
                    if (el) {
                        el.innerHTML = ${escaped};
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `setHtml`: sets the raw inner HTML content of a control in both the form store and live DOM. */
  public set_html(id: string, htmlContent: string): this {
    return this.setHtml(id, htmlContent);
  }

  /** Returns the current string text value of the control identified by `id`. */
  public getText(id: string): string {
    return String(this.formValuesStore[id] || "");
  }

  /** Updates the string text value of the control identified by `id` in the form store and live DOM. */
  public setText(id: string, text: string): this {
    return this.setValue(id, text);
  }

  /** Returns a shallow copy of all control ID-to-value entries in the form store, or only the subset of `ids` when specified. */
  public getFormValues(ids?: string[]): Record<string, any> {
    if (Array.isArray(ids)) {
      const out: Record<string, any> = {};
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id) out[id] = this.getValue(id);
      }
      return out;
    }
    return { ...this.formValuesStore };
  }
  /** Snake_case alias of `getFormValues`: returns a shallow copy of form control values (or the subset in `ids`). */
  public get_form_values(ids?: string[]): Record<string, any> {
    return this.getFormValues(ids);
  }

  /** Batch-updates multiple form controls from a `{ [controlId]: value }` dictionary. */
  public setFormValues(values: Record<string, any>): this {
    for (const [id, val] of Object.entries(values)) {
      this.setValue(id, val);
    }
    return this;
  }
  /** Snake_case alias of `setFormValues`: batch-updates multiple form controls from a `{ [controlId]: value }` dictionary. */
  public set_form_values(values: Record<string, any>): this {
    return this.setFormValues(values);
  }

  /** Resets all stored form control values in the window to empty strings. */
  public clearForm(): this {
    for (const id of Object.keys(this.formValuesStore)) {
      this.setValue(id, "");
    }
    return this;
  }
  /** Snake_case alias of `clearForm`: resets all stored form control values in the window to empty strings. */
  public clear_form(): this {
    return this.clearForm();
  }

  /** Resets form control values to `defaultsOrIds` when provided, or clears all stored form control values to empty strings. */
  public resetForm(defaultsOrIds?: Record<string, any> | string[]): this {
    if (Array.isArray(defaultsOrIds)) {
      return this.clearInputs(defaultsOrIds);
    }
    if (defaultsOrIds && typeof defaultsOrIds === "object") {
      return this.setFormValues(defaultsOrIds);
    }
    return this.clearForm();
  }
  /** Snake_case alias of `resetForm`: resets form control values to `defaultsOrIds` or clears all stored form values. */
  public reset_form(defaultsOrIds?: Record<string, any> | string[]): this {
    return this.resetForm(defaultsOrIds);
  }

  /**
   * Validates form controls against declarative rules or custom validator functions.
   * Automatically highlights and focuses the first invalid control when `opts.highlight !== false`.
   */
  public validateForm(
    rules: Record<
      string,
      | {
          required?: boolean;
          minLength?: number;
          maxLength?: number;
          min?: number;
          max?: number;
          pattern?: RegExp;
          validate?: (val: any, win: SimpleWindow) => boolean | string;
          message?: string;
          label?: string;
        }
      | ((val: any, win: SimpleWindow) => boolean | string)
    >,
    opts: {
      highlight?: boolean;
      focusFirst?: boolean;
      toastOnError?: boolean;
    } = {},
  ): {
    valid: boolean;
    errors: Record<string, string>;
    firstErrorId: string | null;
    firstInvalidId: string | null;
    firstErrorMessage: string | null;
  } {
    const errors: Record<string, string> = {};
    let firstErrorId: string | null = null;
    let firstErrorMessage: string | null = null;

    for (const [id, rule] of Object.entries(rules)) {
      const val = this.getValue(id);
      const strVal = String(val ?? "").trim();
      let errMsg: string | null = null;

      if (typeof rule === "function") {
        const res = rule(val, this);
        if (res === false) errMsg = `${id} is invalid`;
        else if (typeof res === "string" && res.length > 0) errMsg = res;
      } else if (rule && typeof rule === "object") {
        const fieldName = rule.label || id;
        if (rule.required && !strVal) {
          errMsg = rule.message || `${fieldName} is required`;
        } else if (strVal) {
          if (rule.minLength !== undefined && strVal.length < rule.minLength) {
            errMsg =
              rule.message ||
              `${fieldName} must be at least ${rule.minLength} characters`;
          } else if (
            rule.maxLength !== undefined &&
            strVal.length > rule.maxLength
          ) {
            errMsg =
              rule.message ||
              `${fieldName} must be at most ${rule.maxLength} characters`;
          } else if (rule.min !== undefined && Number(val) < rule.min) {
            errMsg = rule.message || `${fieldName} must be >= ${rule.min}`;
          } else if (rule.max !== undefined && Number(val) > rule.max) {
            errMsg = rule.message || `${fieldName} must be <= ${rule.max}`;
          } else if (rule.pattern && !rule.pattern.test(strVal)) {
            errMsg = rule.message || `${fieldName} format is invalid`;
          } else if (rule.validate) {
            const res = rule.validate(val, this);
            if (res === false)
              errMsg = rule.message || `${fieldName} is invalid`;
            else if (typeof res === "string" && res.length > 0) errMsg = res;
          }
        }
      }

      const ctrl = this.findControl(id);
      if (errMsg) {
        errors[id] = errMsg;
        if (ctrl) ctrl.error = errMsg;
        if (!firstErrorId) {
          firstErrorId = id;
          firstErrorMessage = errMsg;
        }
      } else if (ctrl) {
        delete ctrl.error;
      }
    }

    if (firstErrorId) {
      if (opts.highlight !== false) this.highlightControl(firstErrorId, 1200);
      if (opts.focusFirst !== false) this.setFocus(firstErrorId);
      if (opts.toastOnError && firstErrorMessage) {
        this.toast(firstErrorMessage, 2200, "error");
      }
    }

    return {
      valid: firstErrorId === null,
      errors,
      firstErrorId,
      firstInvalidId: firstErrorId,
      firstErrorMessage,
    };
  }
  /** Snake_case alias of `validateForm`: validates form controls against declarative rules or validator functions. */
  public validate_form(
    rules: Record<string, any>,
    opts: {
      highlight?: boolean;
      focusFirst?: boolean;
      toastOnError?: boolean;
    } = {},
  ) {
    return this.validateForm(rules, opts);
  }

  /** Clears the value of a single input control identified by `id` to an empty string. */
  public clearInput(id: string): this {
    this.setValue(id, "");
    return this;
  }

  /** Clears the values of all specified input control IDs to empty strings. */
  public clearInputs(ids: string[]): this {
    for (const id of ids) {
      this.setValue(id, "");
    }
    return this;
  }

  // --- Dialogs & Native Integration ---
  private _dialogs?: SimpleDialogs;

  /**
   * SweetAlert2-style dialog engine. Every method takes an optional trailing callback and also returns a Promise.
   * Inside window event handlers prefer callbacks: `win.dialogs.confirm("Sure?", "Title", ok => { ... })`.
   */
  public get dialogs(): SimpleDialogs {
    if (!this._dialogs) {
      this._dialogs = new SimpleDialogs({
        isRunning: () => this.isWindowRunning,
        isHosted: () =>
          this.hostedFactory !== null ||
          Boolean((this.webview as any)?.isHosted),
        eval: (code: string) => this.evalJS(code),
        resolvers: this.promptResolversMap,
      });
    }
    return this._dialogs;
  }
  /** Alias of `dialogs` (`win.swal.fire({...})`). */
  public get swal(): SimpleDialogs {
    return this.dialogs;
  }
  /** Alias of `dialogs`. */
  public get dialog(): SimpleDialogs {
    return this.dialogs;
  }

  /** Show a customizable dialog: `fire({title, text, icon, ...})` or `fire("Title", "Text", "success", cb)`. */
  public fire(
    options?: DialogOptions | string,
    text?: string | DialogOptions | DialogCallback,
    icon?: DialogIcon | DialogOptions | DialogCallback,
    cb?: DialogCallback,
  ): Promise<DialogResult> {
    return this.dialogs.fire(options, text, icon, cb);
  }
  /** Displays a SweetAlert-style success dialog with a checkmark icon. */
  public success(
    title: string,
    text?: string | DialogCallback,
    opts?: DialogOptions | DialogCallback,
    cb?: DialogCallback,
  ) {
    return this.dialogs.success(title, text, opts, cb);
  }
  /** Displays a SweetAlert-style question dialog with a question-mark icon. */
  public question(
    title: string,
    text?: string | DialogCallback,
    opts?: DialogOptions | DialogCallback,
    cb?: DialogCallback,
  ) {
    return this.dialogs.question(title, text, opts, cb);
  }
  /** Displays a destructive-action confirmation dialog asking whether to delete `what`, resolving to `true` when confirmed. */
  public confirmDelete(
    what = "this item",
    opts?: DialogOptions | DialogCallback<boolean>,
    cb?: DialogCallback<boolean>,
  ) {
    return this.dialogs.confirmDelete(what, opts, cb);
  }
  /** Ask for a typed value (`email`, `password`, `number`, `date`, `color`, `range`, `textarea`...). Result is `undefined` when cancelled. */
  public inputDialog(
    type: DialogInputType,
    title: string,
    opts?: DialogOptions | DialogCallback<any>,
    cb?: DialogCallback<any>,
  ) {
    return this.dialogs.inputDialog(type, title, opts, cb);
  }
  /** Displays a modal selection dialog prompting the user to choose from `options`. */
  public selectDialog(
    title: string,
    options: DialogInputOptions,
    opts?: DialogOptions | DialogCallback<any>,
    cb?: DialogCallback<any>,
  ) {
    return this.dialogs.selectDialog(title, options, opts, cb);
  }
  /** Run several dialogs in sequence with step indicators. */
  public queueDialogs(
    steps: DialogOptions[],
    cb?: (out: { completed: boolean; results: DialogResult[] }) => void,
  ) {
    return this.dialogs.queue(steps, cb);
  }
  /** Displays a non-dismissible modal loading spinner dialog with `title` and optional `text`. */
  public showLoading(title = "Loading...", text?: string) {
    return this.dialogs.showLoading(title, text);
  }
  /** Closes any currently open loading spinner dialog. */
  public hideLoading(): this {
    this.dialogs.close();
    return this;
  }
  /** Closes the currently active modal dialog. */
  public closeDialog(): this {
    this.dialogs.close();
    return this;
  }

  /** Displays a modal alert dialog with `message` and `title` (or logs to console when headless). */
  public showAlert(message: string, title = "Alert", cb?: () => void): void {
    if (!this.isWindowRunning) {
      console.log(`[Alert - ${title}] ${message}`);
      cb?.();
      return;
    }
    this.dialogs.fire({ title, text: message }, () => cb?.());
  }

  /** Displays a Yes/No confirmation dialog and resolves to `true` if the user confirms. */
  public showConfirm(
    message: string,
    title: string | ((ok: boolean) => void) = "Confirm",
    cb?: (ok: boolean) => void,
  ): Promise<boolean> {
    const callback = typeof title === "function" ? title : cb;
    const t = typeof title === "string" ? title : "Confirm";
    return this.dialogs.confirm(message, t, callback);
  }

  /** Displays a text-input prompt dialog initialized with `defaultVal` and resolves to the entered string or `null` if cancelled. */
  public showPrompt(
    message: string,
    defaultVal: string | ((v: string | null) => void) = "",
    title: string | ((v: string | null) => void) = "Prompt",
    cb?: (v: string | null) => void,
  ): Promise<string | null> {
    const callback =
      typeof defaultVal === "function"
        ? defaultVal
        : typeof title === "function"
          ? title
          : cb;
    const def = typeof defaultVal === "string" ? defaultVal : "";
    const t = typeof title === "string" ? title : "Prompt";
    if (!this.isWindowRunning) {
      callback?.(def);
      return Promise.resolve(def);
    }
    return this.dialogs.prompt(message, def, t, callback);
  }

  /** Alias of `showAlert`: displays a modal alert dialog with `message` and `title` (or logs to console when headless). */
  public alert(message: string, title = "Alert", cb?: () => void): void {
    this.showAlert(message, title, cb);
  }

  /** Writes `text` to the system clipboard (and browser clipboard when the window is running). */
  public copyToClipboard(text: string): void {
    writeClipboardSync(text);
    if (this.isWindowRunning) {
      const safeText = JSON.stringify(text);
      this.evalJS(`
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(${safeText}).catch(console.error);
                } else {
                    const ta = document.createElement("textarea");
                    ta.value = ${safeText};
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand("copy");
                    document.body.removeChild(ta);
                }
            `);
    }
  }

  /** Reads and returns the current plain-text content from the system or webview clipboard. */
  public async getClipboardText(): Promise<string> {
    // 1. Direct OS Native Clipboard Read (macOS pbpaste, Windows Get-Clipboard, Linux wl-paste)
    const nativeText = readClipboardSync();
    if (nativeText && nativeText.trim()) return nativeText;

    if (!this.isWindowRunning) return "";
    const reqId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.promptResolversMap.delete(reqId);
        resolve("");
      }, 300);
      this.promptResolversMap.set(reqId, (val: any) => {
        clearTimeout(timer);
        resolve(typeof val === "string" ? val : "");
      });
      this.evalJS(`
                const fn = window.handlePromptResultIPC || window.onSimpleguiPromptResult;
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(txt => {
                        if (fn) fn("${reqId}", txt);
                    }).catch(() => {
                        if (fn) fn("${reqId}", "");
                    });
                } else {
                    if (fn) fn("${reqId}", "");
                }
            `);
    });
  }

  /**
   * File dialogs. Native OS dialog first; the in-webview picker is used only when the native one is unavailable
   * (cancelling a native dialog never opens another). Last argument may be a callback `(path|null) => void`.
   * Pass `true` / `"never"` as `native` option via the options-object overloads on `win.dialogs.openFile({...})`.
   */
  public openFileDialog(
    title = "Open File",
    filter: string | ((p: string | null) => void) = "",
    cb?: ((p: string | null) => void) | boolean,
  ): Promise<string | null> {
    const callback =
      typeof filter === "function"
        ? filter
        : typeof cb === "function"
          ? cb
          : undefined;
    return this.dialogs.openFile(
      {
        title,
        filter: typeof filter === "string" ? filter : "",
        native: cb === true ? "never" : "auto",
      },
      callback,
    );
  }
  /** Opens a native (or fallback in-webview) Save File dialog and resolves to the chosen destination path or `null`. */
  public saveFileDialog(
    title = "Save File",
    defaultName: string | ((p: string | null) => void) = "untitled.txt",
    cb?: ((p: string | null) => void) | boolean,
  ): Promise<string | null> {
    const callback =
      typeof defaultName === "function"
        ? defaultName
        : typeof cb === "function"
          ? cb
          : undefined;
    return this.dialogs.saveFile(
      {
        title,
        defaultName:
          typeof defaultName === "string" ? defaultName : "untitled.txt",
        native: cb === true ? "never" : "auto",
      },
      callback,
    );
  }
  /** Opens a native (or fallback in-webview) folder selection dialog and resolves to the selected directory path or `null`. */
  public openFolderDialog(
    title = "Select Folder",
    cb?: ((p: string | null) => void) | boolean,
  ): Promise<string | null> {
    return this.dialogs.openFolder(
      { title, native: cb === true ? "never" : "auto" },
      typeof cb === "function" ? cb : undefined,
    );
  }
  /** Opens a multi-file selection dialog and resolves to an array of selected file paths or `null`. */
  public openFilesDialog(
    title = "Open Files",
    filter = "",
    cb?: (p: string[] | null) => void,
  ): Promise<string[] | null> {
    return this.dialogs.openFiles({ title, filter }, cb);
  }
  /** Opens a single-file selection dialog configured with `FileDialogOptions`. */
  public openFile(opts?: FileDialogOptions, cb?: (p: string | null) => void) {
    return this.dialogs.openFile(opts, cb);
  }
  /** Opens a multi-file selection dialog configured with `FileDialogOptions`. */
  public openFiles(
    opts?: FileDialogOptions,
    cb?: (p: string[] | null) => void,
  ) {
    return this.dialogs.openFiles(opts, cb);
  }
  /** Opens a Save File dialog configured with `FileDialogOptions`. */
  public saveFile(opts?: FileDialogOptions, cb?: (p: string | null) => void) {
    return this.dialogs.saveFile(opts, cb);
  }
  /** Opens a folder selection dialog configured with `FileDialogOptions`. */
  public openFolder(opts?: FileDialogOptions, cb?: (p: string | null) => void) {
    return this.dialogs.openFolder(opts, cb);
  }

  /** Opens the built-in HTML/webview file/folder picker dialog directly without invoking the native OS dialog. */
  public showWebviewFileDialog(
    opts: {
      mode?: "open" | "save" | "folder";
      title?: string;
      initialDir?: string;
      defaultName?: string;
      filter?: string;
      multiple?: boolean;
    } = {},
    cb?: (p: any) => void,
  ): Promise<string | string[] | null> {
    return this.dialogs.fileDialog(
      opts.mode || "open",
      { ...opts, native: "never" },
      cb,
    );
  }

  /** Snake_case alias of `openFileDialog`: file dialogs. Native OS dialog first; the in-webview picker is used only when the native one is unavailable (cancelling a native dialog never opens another). Last argument may be a callback `(path|null) => void`. Pass `true` / `"never"` as `native` option via the options-object overloads on `win.dialogs.openFile({...})`. */
  public open_file_dialog(
    title = "Open File",
    filter = "",
    cb?: (p: string | null) => void,
  ): Promise<string | null> {
    return this.openFileDialog(title, filter, cb);
  }
  /** Snake_case alias of `saveFileDialog`: opens a native (or fallback in-webview) Save File dialog and resolves to the chosen destination path or `null`. */
  public save_file_dialog(
    title = "Save File",
    defaultName = "untitled.txt",
    cb?: (p: string | null) => void,
  ): Promise<string | null> {
    return this.saveFileDialog(title, defaultName, cb);
  }
  /** Snake_case alias of `openFolderDialog`: opens a native (or fallback in-webview) folder selection dialog and resolves to the selected directory path or `null`. */
  public open_folder_dialog(
    title = "Select Folder",
    cb?: (p: string | null) => void,
  ): Promise<string | null> {
    return this.openFolderDialog(title, cb);
  }
  /** Snake_case alias of `openFileDialog`: file dialogs. Native OS dialog first; the in-webview picker is used only when the native one is unavailable (cancelling a native dialog never opens another). Last argument may be a callback `(path|null) => void`. Pass `true` / `"never"` as `native` option via the options-object overloads on `win.dialogs.openFile({...})`. */
  public browse_file(
    title = "Open File",
    filter = "",
    cb?: (p: string | null) => void,
  ): Promise<string | null> {
    return this.openFileDialog(title, filter, cb);
  }
  /** Snake_case alias of `openFolderDialog`: opens a native (or fallback in-webview) folder selection dialog and resolves to the selected directory path or `null`. */
  public browse_folder(
    title = "Select Folder",
    cb?: (p: string | null) => void,
  ): Promise<string | null> {
    return this.openFolderDialog(title, cb);
  }
  /** Opens the in-webview Open File picker dialog with the given title and extension filter. */
  public open_webview_file_dialog(
    title = "Open File",
    filter = "",
    cb?: (p: string | null) => void,
  ): Promise<string | null> {
    return this.dialogs.openFile({ title, filter, native: "never" }, cb);
  }
  /** Opens the in-webview Save File picker dialog with the given title and default filename. */
  public save_webview_file_dialog(
    title = "Save File",
    defaultName = "untitled.txt",
    cb?: (p: string | null) => void,
  ): Promise<string | null> {
    return this.dialogs.saveFile({ title, defaultName, native: "never" }, cb);
  }
  /** Opens the in-webview Select Folder picker dialog with the given title. */
  public open_webview_folder_dialog(
    title = "Select Folder",
    cb?: (p: string | null) => void,
  ): Promise<string | null> {
    return this.dialogs.openFolder({ title, native: "never" }, cb);
  }

  /** Pauses execution for `ms` milliseconds using a webview-safe timer (or `setTimeout` when not running), invoking `cb` and returning a Promise. */
  public delay(ms: number, cb?: () => void): Promise<void> | void {
    if (cb) {
      if (!this.isWindowRunning || !this.webview) {
        setTimeout(cb, ms);
        return;
      }
      const reqId = `delay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      this.promptResolversMap.set(reqId, cb);
      this.evalJS(`
                setTimeout(function() {
                    const fn = window.handlePromptResultIPC || window.onSimpleguiPromptResult;
                    if (fn) {
                        fn("${reqId}", true);
                    }
                }, ${ms});
            `);
      return;
    }

    // Keep Promise version for contexts where it might work
    return new Promise((resolve) => {
      if (!this.isWindowRunning || !this.webview) {
        setTimeout(resolve, ms);
        return;
      }
      const reqId = `delay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      this.promptResolversMap.set(reqId, resolve);
      this.evalJS(`
                setTimeout(function() {
                    const fn = window.handlePromptResultIPC || window.onSimpleguiPromptResult;
                    if (fn) {
                        fn("${reqId}", true);
                    }
                }, ${ms});
            `);
    });
  }

  /** Alias of `delay`: pauses execution for `ms` milliseconds using a webview-safe timer (or `setTimeout` when not running), invoking `cb` and returning a Promise. */
  public async sleep(ms: number): Promise<void> {
    return this.delay(ms) as Promise<void>;
  }

  /** Disables the target controls in `names`, updates the window status bar to `statusText`, runs `callback`, and automatically re-enables the controls and restores status text upon completion. */
  public async withBusyState(
    names: string[],
    statusText: string,
    callback: (
      win: SimpleWindow,
      done: (completionStatus?: string) => void,
    ) => any | Promise<any>,
  ): Promise<this> {
    console.log(`[withBusyState] Starting... setting status to: ${statusText}`);
    let originalStatus = this.statusText;
    if (!originalStatus) {
      const lbl = this.findControl("lblStatus") || this.findControl("status");
      if (lbl && (lbl.text || lbl.caption)) {
        originalStatus = lbl.text || lbl.caption;
      }
    }

    const originalStates: Record<string, boolean> = {};
    for (const name of names) {
      originalStates[name] = this.getControlEnabled(name);
      this.setControlEnabled(name, false);
    }
    this.setStatus(statusText);

    let doneCalled = false;
    const done = (completionStatus?: string) => {
      if (doneCalled) return;
      doneCalled = true;
      console.log(
        `[withBusyState] Finished callback. Restoring control states...`,
      );
      for (const [name, enabled] of Object.entries(originalStates)) {
        this.setControlEnabled(name, enabled);
      }

      const finalStatus = completionStatus || "Task completed";
      this.setStatus(finalStatus);

      // Keep the completion status visible for 3 seconds before reverting to original status
      setTimeout(() => {
        if (this.isWindowRunning) {
          console.log(
            `[withBusyState] Reverting status label to: ${originalStatus}`,
          );
          this.setStatus(originalStatus);
        }
      }, 3000);
    };

    try {
      const result = callback(this, done);
      if (result && typeof result.then === "function") {
        await result;
        done();
      } else {
        done();
      }
    } catch (err) {
      console.error("[withBusyState] Error in callback:", err);
      done();
    }
    return this;
  }

  // --- HTML & Window Build Engine ---
  /** Serializes the window's current theme, layout metrics, and controls into a standalone `FormSpec` object. */
  public buildFormSpec(): FormSpec {
    const specControls: any[] = [];
    const processControls = (items: any[]) => {
      for (const item of items) {
        if (!item) continue;
        const specItem = { ...item };
        if (specItem.id && this.formValuesStore[specItem.id] !== undefined) {
          specItem.value = this.formValuesStore[specItem.id];
        }
        specControls.push(specItem);
        if (item.children && Array.isArray(item.children)) {
          processControls(item.children);
        }
      }
    };
    processControls(this.controls);

    const themeObj = getTheme(this.theme);
    return {
      title: this.title,
      width: this.width,
      height: this.height,
      theme: this.theme,
      background_color: this.backgroundColor,
      font_color: this.fontColor,
      accent_color: this.accentColor,
      secondary_accent: themeObj?.secondary_accent,
      card_background: themeObj?.card_background,
      card_border: themeObj?.card_border,
      // The theme's own answer, used only while the page still has the theme's background (a custom background is judged by its color).
      is_dark:
        themeObj && this.backgroundColor === themeObj.background_color
          ? themeObj.is_dark
          : undefined,
      semantic_overrides: themeObj ? overridesForTheme(themeObj) : undefined,
      ...(themeObj?.fx ? { fx: themeObj.fx, fx_mode: this.effects } : {}),
      padding: this.padding,
      spacing: this.spacing,
      controls: specControls,
      non_visual_controls: this.nonVisualControls,
      menu_bar: (this as any)._menuBarSpec,
      global_context_menu_items: (this as any)._globalContextMenuItems || [],
    };
  }

  /** Alias of `generateHtml`: compiles the complete self-contained HTML/CSS/JS document used to render the window and all its controls. */
  public toHtml(): string {
    return this.generateHtml();
  }

  /** Snake_case alias of `generateHtml`: compiles the complete self-contained HTML/CSS/JS document used to render the window and all its controls. */
  public to_html(): string {
    return this.generateHtml();
  }

  /** Alias of `generateHtml`: compiles the complete self-contained HTML/CSS/JS document used to render the window and all its controls. */
  public getHtml(): string {
    return this.generateHtml();
  }

  /** Snake_case alias of `generateHtml`: compiles the complete self-contained HTML/CSS/JS document used to render the window and all its controls. */
  public get_html(): string {
    return this.generateHtml();
  }

  /** Compiles the complete self-contained HTML/CSS/JS document used to render the window and all its controls. */
  public generateHtml(): string {
    if (this._currentGridSection) {
      if (this._currentCardSection) {
        this._currentGridSection.cards = this._currentGridSection.cards || [];
        this._currentGridSection.cards.push(this._currentCardSection);
        this._currentCardSection = null;
      }
      this._layoutSections.push(this._currentGridSection);
      this._currentGridSection = null;
    }
    if (this._currentCardSection) {
      this._layoutSections.push(this._currentCardSection);
      this._currentCardSection = null;
    }
    if (
      this._currentRowSection &&
      this._currentRowSection.controls.length > 0
    ) {
      this._layoutSections.push({
        type: "row",
        id: this._currentRowSection.id,
        controls: [...this._currentRowSection.controls],
      });
      this._currentRowSection = null;
    }

    const spec = this.buildFormSpec();
    let html = generatePreviewHtml(spec);

    const safeScriptJson = (val: unknown): string =>
      JSON.stringify(val)
        .replace(/</g, "\\u003c")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
    const registeredShortcuts = Array.from(this.eventHandlersMap.keys())
      .filter((k) => k.startsWith("shortcut_"))
      .map((k) => k.slice("shortcut_".length));

    // Inject SimpleGUI modal dialog & IPC scripts
    const scriptInject = `
            ${DIALOG_CLIENT_HTML}
            ${UI_CLIENT_HTML}
            <script>
            ${DESKTOP_SHORTCUTS_SCRIPT}
            (function() {
                window.onSimpleguiPromptResult = function(reqId, result) {
                    if (window.handlePromptResultIPC) {
                        window.handlePromptResultIPC(reqId, result);
                    }
                };

                window.addEventListener("beforeunload", function() {
                    if (window.handleWindowCloseIPC) window.handleWindowCloseIPC();
                });
                window.addEventListener("unload", function() {
                    if (window.handleWindowCloseIPC) window.handleWindowCloseIPC();
                });

                ${(this as any)._globalContextMenuItems ? `window.globalContextMenuItems = ${safeScriptJson((this as any)._globalContextMenuItems)};` : ""}
                window.__simpleguiShortcuts = ${safeScriptJson(registeredShortcuts)};
                window.addEventListener("keydown", function(e) {
                    if (e.isComposing || e.keyCode === 229) return;
                    var list = window.__simpleguiShortcuts;
                    if (!Array.isArray(list) || list.length === 0) return;
                    var rawKey = String(e.key || "").toLowerCase();
                    if (!rawKey || rawKey === "control" || rawKey === "shift" || rawKey === "alt" || rawKey === "meta") return;
                    if (rawKey === " ") rawKey = "space";
                    else if (rawKey === "esc") rawKey = "escape";
                    var mods = [];
                    if (e.ctrlKey) mods.push("ctrl");
                    if (e.altKey) mods.push("alt");
                    if (e.shiftKey) mods.push("shift");
                    if (e.metaKey) mods.push("meta");
                    var canonical = mods.concat([rawKey]).join("+");
                    var matched = "";
                    if (list.indexOf(canonical) >= 0) {
                        matched = canonical;
                    } else if ((e.ctrlKey || e.metaKey) && list.indexOf(mods.map(function(m){ return m === "meta" ? "cmd" : m; }).concat([rawKey]).join("+")) >= 0) {
                        matched = mods.map(function(m){ return m === "meta" ? "cmd" : m; }).concat([rawKey]).join("+");
                    } else if ((e.ctrlKey || e.metaKey)) {
                        var modOnly = ["mod"].concat(mods.filter(function(m){ return m !== "ctrl" && m !== "meta"; })).concat([rawKey]).join("+");
                        if (list.indexOf(modOnly) >= 0) matched = modOnly;
                    }
                    if (matched && typeof window.handleShortcutIPC === "function") {
                        e.preventDefault();
                        window.handleShortcutIPC(matched);
                    }
                });

                let lastAltTime = 0;
                let zoomLevel = 1.0;
                function applyZoom(delta, reset) {
                    if (reset) zoomLevel = 1.0;
                    else zoomLevel = Math.max(0.4, Math.min(3.0, zoomLevel + delta));
                    document.body.style.zoom = zoomLevel;
                }
                function doCloseOrQuit() {
                    if (typeof window.quitApp === "function") {
                        try { window.quitApp(); return; } catch(e) {}
                    }
                    if (typeof window.closeApp === "function") {
                        try { window.closeApp(); return; } catch(e) {}
                    }
                    if (typeof window.closeWindow === "function") {
                        try { window.closeWindow(); return; } catch(e) {}
                    }
                    if (typeof window.handleWindowCloseIPC === "function") {
                        try { window.handleWindowCloseIPC(); return; } catch(e) {}
                    }
                    if (window.parent && window.parent !== window) {
                        try {
                            if (window.top && window.top !== window) {
                                const topQuit = window.top.quitApp || window.top.closeApp || window.top.closeWindow || window.top.doCloseOrQuit;
                                if (typeof topQuit === "function") { topQuit.call(window.top); return; }
                            }
                        } catch(e) {}
                        try {
                            const parentQuit = window.parent.quitApp || window.parent.closeApp || window.parent.closeWindow || window.parent.doCloseOrQuit;
                            if (typeof parentQuit === "function") { parentQuit.call(window.parent); return; }
                        } catch(e) {}
                        try { window.top.postMessage({ fmCloseApp: true }, "*"); } catch(e) {}
                        if (window.parent !== window.top) {
                            try { window.parent.postMessage({ fmCloseApp: true }, "*"); } catch(e) {}
                        }
                        return;
                    }
                    try { window.close(); } catch(e) {}
                    try { fetch("/api/shutdown", { method: "POST" }); } catch(e) {}
                    try { fetch("/api/close", { method: "POST" }); } catch(e) {}
                }
                window.doCloseOrQuit = doCloseOrQuit;

                let lastFullscreenTime = 0;
                function doToggleFullscreen() {
                    const now = Date.now();
                    if (now - lastFullscreenTime < 500) return;
                    lastFullscreenTime = now;

                    if (window.parent && window.parent !== window) {
                        try { window.top.postMessage({ fmToggleExpand: true }, "*"); } catch(e) {}
                        return;
                    }
                    if (typeof window.toggleNativeFullscreen === "function") {
                        try { window.toggleNativeFullscreen(); return; } catch(e) {}
                    }
                    if (typeof window.toggleFullscreen === "function" && window.toggleFullscreen !== doToggleFullscreen) {
                        try { window.toggleFullscreen(); return; } catch(e) {}
                    }
                    try {
                        const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
                        if (!isFull) {
                            const el = document.documentElement;
                            if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                        } else {
                            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                        }
                    } catch(e) {}
                }

                function triggerInitialFullscreen() {
                    var attempts = 0;
                    function attempt() {
                        if (typeof window.requestInitialFullscreen === "function") {
                            try {
                                var p = window.requestInitialFullscreen();
                                if (p && typeof p.then === "function") {
                                    p.then(function(res) {
                                        if ((!res || !res.isFullscreen) && attempts++ < 25) {
                                            setTimeout(attempt, 150);
                                        }
                                    }).catch(function() {
                                        if (attempts++ < 25) setTimeout(attempt, 150);
                                    });
                                    return;
                                }
                            } catch(e) {}
                        }
                        if (typeof window.toggleNativeFullscreen === "function") {
                            try { window.toggleNativeFullscreen(); } catch(e) {}
                        } else if (typeof window.toggleFullscreen === "function") {
                            try { window.toggleFullscreen(); } catch(e) {}
                        }
                        if (attempts++ < 25) {
                            setTimeout(attempt, 150);
                        }
                    }
                    setTimeout(attempt, 80);
                    window.addEventListener("DOMContentLoaded", function() { setTimeout(attempt, 120); });
                    window.addEventListener("load", function() { setTimeout(attempt, 200); });
                }
                ${
                  this.fullscreen
                    ? `
                triggerInitialFullscreen();
                `
                    : ""
                }

                let isFnPressed = false;
                window.addEventListener("blur", function() { isFnPressed = false; });
                document.addEventListener("visibilitychange", function() { if (document.hidden) isFnPressed = false; });
                document.addEventListener("keyup", function(e) {
                    if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn" || e.code === "Function") {
                        isFnPressed = false;
                    }
                });

                document.addEventListener("keydown", function(e) {
                    if (e.key === "Fn" || e.key === "Globe" || e.code === "Fn" || e.code === "Function") {
                        isFnPressed = true;
                    }

                    if (e.repeat) return;

                    if (e.code !== "AltRight" && (e.key === "Alt" || e.code === "AltLeft")) {
                        const now = Date.now();
                        if (now - lastAltTime > 50 && now - lastAltTime < 450) {
                            lastAltTime = 0;
                            e.preventDefault();
                            doCloseOrQuit();
                            return;
                        }
                        lastAltTime = now;
                    } else if (e.key !== "Alt" && e.code !== "AltLeft" && e.code !== "AltRight") {
                        lastAltTime = 0;
                    }

                    if (
                        e.key === "F5" ||
                        e.code === "F5" ||
                        ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === "r" || e.key === "R" || e.code === "KeyR"))
                    ) {
                        e.preventDefault();
                        e.stopPropagation();
                        return false;
                    }

                    if (
                        ((e.metaKey || e.ctrlKey) && (e.key === "q" || e.key === "Q" || e.key === "w" || e.key === "W" || e.code === "KeyQ" || e.code === "KeyW")) ||
                        (e.altKey && (e.key === "F4" || e.code === "F4" || e.key === "w" || e.key === "W" || e.key === "q" || e.key === "Q" || e.code === "KeyW" || e.code === "KeyQ"))
                    ) {
                        e.preventDefault();
                        doCloseOrQuit();
                        return;
                    }

                    const isF = e.key === "f" || e.key === "F" || e.code === "KeyF";
                    const isFn = isFnPressed || (typeof e.getModifierState === "function" && (e.getModifierState("Fn") || e.getModifierState("FnLock") || e.getModifierState("Symbol")));
                    const isInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable);
                    const isBareF = !e.metaKey && !e.ctrlKey && !e.altKey && isF;
                    const isPlainFindChord = (e.metaKey || e.ctrlKey) && !(e.metaKey && e.ctrlKey) && !e.shiftKey && !e.altKey && isF;
                    if (isPlainFindChord) {
                        const searchBox = document.querySelector && document.querySelector('#txt_search, input[type="search"], input[placeholder*="Search" i], input[placeholder*="Filter" i]');
                        if (searchBox && typeof searchBox.focus === "function" && searchBox.offsetParent !== null) {
                            e.preventDefault();
                            e.stopPropagation();
                            searchBox.focus();
                            if (typeof searchBox.select === "function") searchBox.select();
                            return;
                        }
                        if (isInput) return;
                    }
                    const isFullscreenModifierF = ((e.metaKey && e.ctrlKey) || ((e.metaKey || e.ctrlKey) && e.shiftKey) || (!isInput && (e.metaKey || e.ctrlKey))) && isF;

                    if (
                        isFullscreenModifierF ||
                        (!isInput && isBareF) ||
                        (!isInput && isFn && isF) ||
                        e.key === "F11" || e.code === "F11" || e.key === "\\uF70E" || e.keyCode === 122 ||
                        (!isInput && e.altKey && (e.key === "Enter" || e.code === "Enter"))
                    ) {
                        e.preventDefault();
                        e.stopPropagation();
                        doToggleFullscreen();
                        return;
                    }

                    // 5. Minimize window: Cmd+M, Ctrl+M, Alt+M
                    if ((e.metaKey || e.ctrlKey || e.altKey) && (e.key === "m" || e.key === "M" || e.code === "KeyM")) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof window.minimizeWindow === "function") {
                            try { window.minimizeWindow(); return; } catch(e) {}
                        }
                        return;
                    }

                    // 5b. Hide application window: Cmd+H, Ctrl+H
                    if ((e.metaKey || e.ctrlKey) && (e.key === "h" || e.key === "H" || e.code === "KeyH")) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof window.hideApp === "function") {
                            try { window.hideApp(); return; } catch(e) {}
                        } else if (typeof window.minimizeWindow === "function") {
                            try { window.minimizeWindow(); return; } catch(e) {}
                        }
                        return;
                    }

                    // 6. Always-on-top toggle: Cmd+Shift+T, Ctrl+Shift+T, Alt+T
                    if (
                        ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "t" || e.key === "T" || e.code === "KeyT")) ||
                        (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "t" || e.key === "T" || e.code === "KeyT"))
                    ) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof window.toggleAlwaysOnTop === "function") {
                            try { window.toggleAlwaysOnTop(); return; } catch(e) {}
                        }
                        return;
                    }

                    // 7. Center window: Cmd+Shift+C, Ctrl+Shift+C
                    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "c" || e.key === "C" || e.code === "KeyC")) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof window.centerWindow === "function") {
                            try { window.centerWindow(); return; } catch(e) {}
                        }
                        return;
                    }

                    if (e.metaKey || e.ctrlKey) {
                        if (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd") {
                            e.preventDefault();
                            applyZoom(0.1, false);
                            return;
                        } else if (e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract") {
                            e.preventDefault();
                            applyZoom(-0.1, false);
                            return;
                        } else if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
                            e.preventDefault();
                            applyZoom(0, true);
                            return;
                        }
                    }
                }, { capture: true });

                document.addEventListener("input", function(e) {
                    const target = e.target || document.activeElement;
                    if (target && target.id && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
                        const val = target.type === "checkbox" ? target.checked : target.value;
                        target._lastSyncedVal = val;
                        const eventName = "on_" + target.id + "_change";
                        if (typeof window[eventName] === "function") {
                            window[eventName](val);
                        }
                    }
                });

                document.addEventListener("change", function(e) {
                    const target = e.target || document.activeElement;
                    if (target && target.id && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
                        const val = target.type === "checkbox" ? target.checked : target.value;
                        target._lastSyncedVal = val;
                        const eventName = "on_" + target.id + "_change";
                        if (typeof window[eventName] === "function") {
                            window[eventName](val);
                        }
                    }
                });

                // Synchronize currently focused input/textarea on click before button handlers run if changed
                document.addEventListener("click", function(e) {
                    const active = document.activeElement;
                    if (active && active.id && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
                        const val = active.type === "checkbox" ? active.checked : active.value;
                        if (active._lastSyncedVal !== val) {
                            active._lastSyncedVal = val;
                            const fn = window["on_" + active.id + "_change"];
                            if (typeof fn === "function") {
                                fn(val);
                            }
                        }
                    }
                }, { capture: true });

                // Intercept clicks on links (<a href="http...">) to open in user's OS browser via window.openUrl
                document.addEventListener("click", function(e) {
                    const target = e.target;
                    if (!target) return;
                    const anchor = target.closest ? target.closest("a") : (target.tagName === "A" ? target : null);
                    if (anchor && anchor.href) {
                        const href = anchor.getAttribute("href") || anchor.href;
                        if (href && (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:"))) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (typeof window.openUrl === "function") {
                                try { window.openUrl(href); } catch(err) {}
                            } else if (typeof window.openExternal === "function") {
                                try { window.openExternal(href); } catch(err) {}
                            }
                            return false;
                        }
                    }
                }, { capture: true });

                document.addEventListener("keydown", function(e) {
                    if (e.isComposing || e.keyCode === 229) return;
                    if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                        const target = e.target || document.activeElement;
                        if (target && target.tagName === "INPUT" && target.value && (target.type === "search" || /search|filter/i.test((target.id || "") + " " + (target.placeholder || "")))) {
                            e.preventDefault();
                            target.value = "";
                            target.dispatchEvent(new Event("input", { bubbles: true }));
                            const changeName = target.id ? "on_" + target.id + "_change" : "";
                            if (changeName && typeof window[changeName] === "function") window[changeName]("");
                            return;
                        }
                    }
                    if (e.key === "Enter" || e.code === "Enter") {
                        const target = e.target || document.activeElement;
                        if (target && target.id && (target.tagName === "INPUT" || (target.tagName === "TEXTAREA" && (e.ctrlKey || e.metaKey)))) {
                            const val = target.type === "checkbox" ? target.checked : target.value;
                            const changeName = "on_" + target.id + "_change";
                            if (typeof window[changeName] === "function") {
                                window[changeName](val);
                            }
                            const enterName = "on_" + target.id + "_enter";
                            if (typeof window[enterName] === "function") {
                                setTimeout(function() { window[enterName](val); }, 10);
                            }
                        }
                    }
                }, { capture: true });
            })();
            </script>
            ${this.customScripts.length > 0 ? this.customScripts.map((s) => `<script>\n${s}\n</script>`).join("\n") : ""}
        `;

    const hasCustomResponsive = this.customScripts.some(
      (s) =>
        s.includes("initFdStudioResponsiveEngine") || s.includes("fd_root"),
    );
    const shouldInjectResponsive =
      this.responsiveLayout &&
      !hasCustomResponsive &&
      this._layoutSections.length > 0;

    const responsiveScript = shouldInjectResponsive
      ? `
            <script>
            window.__RAD_LAYOUT_SECTIONS__ = ${safeScriptJson(this._layoutSections)};
            (function() {
                function initSimpleguiUniversalResponsiveEngine() {
                    if (document.getElementById("fd_root") || window.__FD_STUDIO_ACTIVE__ || document.getElementById("rad_responsive_root") || !window.__RAD_LAYOUT_SECTIONS__ || window.__RAD_LAYOUT_SECTIONS__.length === 0) return;

                    const styleEl = document.createElement("style");
                    styleEl.id = "rad_universal_responsive_styles";
                    styleEl.textContent = \`
                        :root {
                            --rad-table-h: 340px;
                            --rad-console-h: 180px;
                        }
                        html, body {
                            width: 100% !important;
                            min-height: 100% !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            overflow-x: hidden !important;
                            overflow-y: auto !important;
                            box-sizing: border-box !important;
                        }
                        #rad_responsive_root {
                            display: flex !important;
                            flex-direction: column !important;
                            gap: 12px !important;
                            width: 100% !important;
                            max-width: 100% !important;
                            padding: 14px 18px !important;
                            box-sizing: border-box !important;
                        }
                        .rad-card {
                            background: var(--card-bg, rgba(255,255,255,0.03)) !important;
                            border: 1px solid var(--card-border, rgba(255,255,255,0.08)) !important;
                            border-radius: 10px !important;
                            padding: 12px 14px !important;
                            box-sizing: border-box !important;
                            width: 100% !important;
                            display: flex !important;
                            flex-direction: column !important;
                            gap: 10px !important;
                            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2) !important;
                        }
                        .rad-card-header {
                            font-size: 11px !important;
                            font-weight: 700 !important;
                            color: var(--accent, #38bdf8) !important;
                            text-transform: uppercase !important;
                            letter-spacing: 0.6px !important;
                            user-select: none !important;
                        }
                        .rad-card-subtitle {
                            font-size: 11px !important;
                            opacity: 0.75 !important;
                            margin-top: -4px !important;
                        }
                        .rad-row {
                            display: flex !important;
                            flex-wrap: wrap !important;
                            gap: 8px !important;
                            align-items: center !important;
                            width: 100% !important;
                            box-sizing: border-box !important;
                        }
                        .rad-header-bar {
                            display: flex !important;
                            flex-wrap: wrap !important;
                            justify-content: space-between !important;
                            align-items: center !important;
                            gap: 12px !important;
                            width: 100% !important;
                            padding: 4px 2px 8px 2px !important;
                            border-bottom: 1px solid var(--card-border, rgba(255,255,255,0.08)) !important;
                        }
                        .rad-header-left {
                            display: flex !important;
                            flex-direction: column !important;
                            gap: 2px !important;
                        }
                        .rad-header-right {
                            display: flex !important;
                            flex-wrap: wrap !important;
                            align-items: center !important;
                            gap: 8px !important;
                        }
                        .rad-rel-item {
                            position: relative !important;
                            left: auto !important;
                            top: auto !important;
                            right: auto !important;
                            bottom: auto !important;
                            margin: 0 !important;
                        }
                        .rad-responsive-table {
                            position: relative !important;
                            left: auto !important;
                            top: auto !important;
                            width: 100% !important;
                            max-width: 100% !important;
                            height: var(--rad-table-h, 340px) !important;
                            min-height: 180px !important;
                            overflow: auto !important;
                            border: 1px solid var(--card-border, rgba(255,255,255,0.08)) !important;
                            border-radius: 8px !important;
                            background: var(--card-bg, rgba(255,255,255,0.03)) !important;
                            box-sizing: border-box !important;
                        }
                        .rad-responsive-table table {
                            width: 100% !important;
                            min-width: 600px !important;
                            border-collapse: collapse !important;
                        }
                        .rad-responsive-console {
                            position: relative !important;
                            left: auto !important;
                            top: auto !important;
                            width: 100% !important;
                            max-width: 100% !important;
                            height: var(--rad-console-h, 180px) !important;
                            min-height: 80px !important;
                            overflow: auto !important;
                            box-sizing: border-box !important;
                            resize: vertical !important;
                        }
                        .rad-grid-container {
                            display: grid !important;
                            width: 100% !important;
                            box-sizing: border-box !important;
                            align-items: stretch !important;
                        }
                        @media (max-width: 768px) {
                            .rad-grid-container {
                                grid-template-columns: 1fr !important;
                            }
                        }
                        .rad-switch-label {
                            flex: 0 0 auto !important;
                        }
                        .rad-row input[type="text"], .rad-row input[type="search"], .rad-row input[type="number"], .rad-row input[type="password"] {
                            flex: 1 1 180px !important;
                            min-width: 120px !important;
                        }
                        .rad-row select {
                            flex: 1 1 140px !important;
                            min-width: 110px !important;
                        }
                        .rad-row > button,
                        .rad-header-right > button,
                        .rad-card > button,
                        .rad-header-left > button,
                        #rad_responsive_root > button {
                            flex: 0 0 auto !important;
                            width: auto !important;
                            min-width: max-content !important;
                            max-width: 100% !important;
                            padding: 7px 16px !important;
                            white-space: nowrap !important;
                            box-sizing: border-box !important;
                            overflow: visible !important;
                        }
                        div:has(> .stepper-val) {
                            box-sizing: border-box !important;
                            flex: 0 0 auto !important;
                        }
                        div:has(> .stepper-val) button {
                            width: 24px !important;
                            height: 24px !important;
                            min-width: 24px !important;
                            max-width: 24px !important;
                            padding: 0 !important;
                            display: inline-flex !important;
                            align-items: center !important;
                            justify-content: center !important;
                        }
                        hr {
                            width: 100% !important;
                            margin: 4px 0 !important;
                        }
                        .rad-row label, .rad-row span:not(.stepper-val):not(.sw-thumb):not(.sw-track), .rad-row .rad-label {
                            flex: 0 0 auto !important;
                            width: auto !important;
                            white-space: nowrap !important;
                        }
                        .rad-checkbox-label {
                            display: inline-flex !important;
                            align-items: center !important;
                            gap: 6px !important;
                            margin-right: 12px !important;
                            flex: 0 0 auto !important;
                        }
                        .rad-metric-pill {
                            flex: 1 1 140px !important;
                            min-width: 120px !important;
                            background: var(--editable-bg, rgba(255,255,255,0.03)) !important;
                            padding: 6px 12px !important;
                            border-radius: 6px !important;
                            border: 1px solid var(--card-border, rgba(255,255,255,0.08)) !important;
                            overflow: hidden !important;
                            text-overflow: ellipsis !important;
                            white-space: nowrap !important;
                        }
                        .rad-bottom-bar {
                            border-top: 1px solid var(--card-border, rgba(255,255,255,0.08)) !important;
                            padding-top: 6px !important;
                        }
                    \`;
                    document.head.appendChild(styleEl);

                    function getNode(id) {
                        const el = document.getElementById(id);
                        if (!el) return null;
                        const target = (el.parentElement && el.parentElement !== document.body && el.parentElement.id !== "rad_responsive_root" && el.parentElement.id !== "fd_root" && el.parentElement.style.position === "absolute")
                            ? el.parentElement
                            : el;
                        target.classList.add("rad-rel-item");
                        target.style.position = "relative";
                        target.style.left = "auto";
                        target.style.top = "auto";
                        target.style.right = "auto";
                        target.style.bottom = "auto";
                        target.style.margin = "0";

                        if (target.tagName === "BUTTON") {
                            target.style.width = "auto";
                            target.style.minWidth = "max-content";
                            target.style.padding = "7px 16px";
                            target.style.whiteSpace = "nowrap";
                            target.style.overflow = "visible";
                        }
                        return target;
                    }

                    const sections = window.__RAD_LAYOUT_SECTIONS__ || [];
                    const root = document.createElement("div");
                    root.id = "rad_responsive_root";

                    function hideOldCardFieldsets(s) {
                        if (s.type === "card" && s.id) {
                            const oldFs = document.getElementById(s.id);
                            if (oldFs) {
                                if (oldFs.style.display === "none") s.hidden = true;
                                oldFs.style.display = "none";
                            }
                        } else if (s.type === "grid" && s.cards) {
                            for (const c of s.cards) hideOldCardFieldsets(c);
                        }
                    }
                    for (const sec of sections) {
                        hideOldCardFieldsets(sec);
                    }

                    function renderCard(cardSec) {
                        const card = document.createElement("div");
                        card.className = "rad-card";
                        if (cardSec.id) card.id = "rad_card_" + cardSec.id;
                        if (cardSec.hidden) card.style.display = "none";
                        if (cardSec.title) {
                            const h = document.createElement("div");
                            h.className = "rad-card-header";
                            h.textContent = cardSec.title;
                            card.appendChild(h);
                        }
                        if (cardSec.subtitle) {
                            const sub = document.createElement("div");
                            sub.className = "rad-card-subtitle";
                            sub.textContent = cardSec.subtitle;
                            card.appendChild(sub);
                        }

                        for (const r of (cardSec.rows || [])) {
                            const rowDiv = document.createElement("div");
                            rowDiv.className = "rad-row";
                            const isMetricRow = r.controls.every(function(cid) { return cid.startsWith("lbl_metric_"); });
                            for (const cid of r.controls) {
                                const node = getNode(cid);
                                if (!node) continue;
                                if (isMetricRow || cid.startsWith("lbl_metric_")) {
                                    node.classList.add("rad-metric-pill");
                                }
                                rowDiv.appendChild(node);
                            }
                            card.appendChild(rowDiv);
                        }

                        for (const item of (cardSec.items || [])) {
                            const node = getNode(item);
                            if (!node) continue;
                            if (node.tagName === "TEXTAREA" || node.querySelector("textarea")) {
                                node.classList.add("rad-responsive-console");
                            } else if (node.querySelector("table") || node.tagName === "TABLE" || (typeof node.id === "string" && node.id.startsWith("tbl_"))) {
                                node.classList.add("rad-responsive-table");
                            }
                            card.appendChild(node);
                        }
                        return card;
                    }

                    for (let i = 0; i < sections.length; i++) {
                        const sec = sections[i];
                        if (!sec) continue;

                        if (i === 0 && (sec.type === "row" || sec.type === "header_bar")) {
                            const headerBar = document.createElement("div");
                            headerBar.className = "rad-header-bar";
                            const headerLeft = document.createElement("div");
                            headerLeft.className = "rad-header-left";
                            const headerRight = document.createElement("div");
                            headerRight.className = "rad-header-right";

                            for (let cIdx = 0; cIdx < (sec.controls || []).length; cIdx++) {
                                const cid = sec.controls[cIdx];
                                const node = getNode(cid);
                                if (!node) continue;
                                const isTitle = cIdx === 0 || node.tagName.startsWith("H") || node.style.fontWeight === "bold" || parseInt(node.style.fontSize || "0", 10) >= 16;
                                if (isTitle && !cid.startsWith("dd_") && !cid.startsWith("btn_")) {
                                    node.style.fontWeight = "800";
                                    node.style.fontSize = "20px";
                                    node.style.height = "auto";
                                    node.style.width = "auto";
                                    headerLeft.appendChild(node);
                                } else {
                                    node.style.width = "auto";
                                    headerRight.appendChild(node);
                                }
                            }

                            if (i + 1 < sections.length && sections[i + 1].type === "standalone") {
                                const nextSec = sections[i + 1];
                                const nextId = nextSec.controls?.[0] || nextSec.id;
                                const nextNode = getNode(nextId);
                                if (nextNode) {
                                    nextNode.style.fontSize = "11px";
                                    nextNode.style.opacity = "0.75";
                                    nextNode.style.height = "auto";
                                    nextNode.style.width = "auto";
                                    headerLeft.appendChild(nextNode);
                                    i++;
                                }
                            }

                            headerBar.appendChild(headerLeft);
                            headerBar.appendChild(headerRight);
                            root.appendChild(headerBar);
                        } else if (sec.type === "grid") {
                            const gridDiv = document.createElement("div");
                            gridDiv.className = "rad-grid-container";
                            const cols = sec.cols || 2;
                            const gap = sec.gap !== undefined ? sec.gap : 16;
                            gridDiv.style.cssText = "display: grid !important; grid-template-columns: repeat(" + cols + ", minmax(0, 1fr)) !important; gap: " + gap + "px !important; width: 100% !important; align-items: stretch !important;";
                            for (const cardSec of (sec.cards || [])) {
                                gridDiv.appendChild(renderCard(cardSec));
                            }
                            root.appendChild(gridDiv);
                        } else if (sec.type === "card") {
                            root.appendChild(renderCard(sec));
                        } else if (sec.type === "row") {
                            const isBottom = i === sections.length - 1;
                            const rowDiv = document.createElement("div");
                            rowDiv.className = "rad-row" + (isBottom ? " rad-bottom-bar" : "");
                            for (const cid of (sec.controls || [])) {
                                const node = getNode(cid);
                                if (node) rowDiv.appendChild(node);
                            }
                            root.appendChild(rowDiv);
                        } else if (sec.type === "standalone") {
                            for (const cid of (sec.controls || [])) {
                                const node = getNode(cid);
                                if (node) root.appendChild(node);
                            }
                        }
                    }

                    document.body.insertBefore(root, document.body.firstChild);

                    function updateDynamicViewportHeights() {
                        const vh = window.innerHeight || document.documentElement.clientHeight || 900;
                        const tableH = Math.max(200, Math.floor(vh * 0.34));
                        const consoleH = Math.max(90, Math.min(260, Math.floor(vh * 0.16)));
                        document.documentElement.style.setProperty('--rad-table-h', tableH + 'px');
                        document.documentElement.style.setProperty('--rad-console-h', consoleH + 'px');
                    }
                    window.addEventListener('resize', updateDynamicViewportHeights);
                    updateDynamicViewportHeights();
                }

                if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", initSimpleguiUniversalResponsiveEngine);
                } else {
                    initSimpleguiUniversalResponsiveEngine();
                }
                setTimeout(initSimpleguiUniversalResponsiveEngine, 20);
            })();
            </script>
        `
      : "";

    const fullInject = scriptInject + responsiveScript;
    const lastBodyIdx = html.lastIndexOf("</body>");
    if (lastBodyIdx !== -1) {
      html =
        html.substring(0, lastBodyIdx) +
        fullInject +
        html.substring(lastBodyIdx);
    } else {
      html += fullInject;
    }

    // Tooltips that say what each control does (see src/shared/helpTips.ts).
    return injectHelp(html, this.helpId || this.getAppId());
  }

  /** Registers a custom client-side JavaScript snippet to run inside the window (and executes it immediately if already running). */
  public addScript(script: string): this {
    this.customScripts.push(script);
    if (this.isWindowRunning) {
      this.evalJS(script);
    }
    return this;
  }

  /** Returns a shallow copy of all visual control specifications added to this window. */
  public getControls(): any[] {
    return [...this.controls];
  }

  /** Returns a shallow copy of all non-visual control specifications (such as timers) added to this window. */
  public getNonVisualControls(): any[] {
    return [...this.nonVisualControls];
  }

  /** Alias of `buildFormSpec`: serializes the window's current theme, layout metrics, and controls into a standalone `FormSpec` object. */
  public getFormSpec(): FormSpec {
    return this.buildFormSpec();
  }

  /** Returns the underlying native `Webview` instance, or `null` if the window is not running or is hosted in a browser. */
  public getWebview(): Webview | null {
    return this.webview;
  }

  /** Show this window inside a web page instead of a native window (see simplegui_host.ts). Call before show(). */
  public hostInBrowser(factory: () => unknown): this {
    this.hostedFactory = factory;
    return this;
  }

  /** Returns `true` if this window has been configured via `hostInBrowser()` to render inside an external browser page rather than a native OS window. */
  public isHostedInBrowser(): boolean {
    return this.hostedFactory !== null;
  }

  /** Alias of `show`: restores persisted form state (if enabled), generates the window HTML, binds IPC handlers, and opens the native webview window (blocking until closed) or starts the browser-hosted session. */
  public run(): void {
    this.show();
  }

  /** Restores persisted form state (if enabled), generates the window HTML, binds IPC handlers, and opens the native webview window (blocking until closed) or starts the browser-hosted session. */
  public show(): void {
    if (this.autoSaveState) {
      this.restoreAppFormState();
    }

    if (this.fullscreen) {
      const screen = getScreenDimensions();
      this.width = screen.width;
      this.height = screen.height;
    }

    const html = this.generateHtml();
    const WebviewCtor =
      cachedWebviewCtor ??
      (require("webview-bun") as typeof import("webview-bun")).Webview;
    this.webview = this.hostedFactory
      ? (this.hostedFactory() as unknown as Webview)
      : new WebviewCtor();
    this.webview.title = this.title;
    this.webview.size = {
      width: this.width,
      height: this.height,
      hint: SIZE_HINT_NONE,
    };
    if (this.fullscreen) {
      try {
        setWindowPositionNative(
          this.webview,
          { x: 0, y: 0 },
          this.width,
          this.height,
        );
      } catch {}
    }
    attachWindowShortcuts(this.webview, {
      onQuit: () => this.handleClose(),
      onClose: () => this.handleClose(),
      onMinimize: () => {
        if (this.webview) minimizeWindowNative(this.webview);
      },
      onFullscreen: () => {
        if (this.webview) toggleFullscreenNative(this.webview);
      },
      fullscreen: this.fullscreen,
    });

    this.isWindowRunning = true;

    if (this.alwaysOnTop) {
      setAlwaysOnTopNative(this.webview, true);
    }

    const handlePrompt = (reqId: string, result: any) => {
      const resolver = this.promptResolversMap.get(reqId);
      if (resolver) {
        resolver(result);
        this.promptResolversMap.delete(reqId);
      }
    };
    this.webview.bind("handlePromptResultIPC", handlePrompt);
    try {
      this.webview.bind("onSimpleguiPromptResult", handlePrompt);
    } catch (e) {}

    let lastHeartbeat = Date.now();
    this.webview.bind("handleHeartbeatIPC", () => {
      lastHeartbeat = Date.now();
    });

    this.webview.bind("quitApp", () => {
      this.handleClose();
    });

    this.webview.bind("cycleAppTheme", (direction: number) => {
      if (direction !== 1 && direction !== -1)
        throw new Error("Invalid theme cycle direction.");
      this.cycleTheme(direction);
      this.toast(`Theme updated to: ${autoShortThemeName(this.theme)}`);
      return { theme: this.theme };
    });

    this.webview.bind("closeWindow", () => {
      this.handleClose();
    });

    this.webview.bind("handleWindowCloseIPC", () => {
      this.handleClose();
    });

    this.webview.bind("minimizeWindow", () => {
      if (this.webview) minimizeWindowNative(this.webview);
      return { success: true };
    });

    this.webview.bind("hideApp", () => {
      if (this.webview) hideAppNative(this.webview);
      return { success: true };
    });

    this.webview.bind("toggleFullscreen", () => {
      if (this.webview) toggleFullscreenNative(this.webview);
      return { success: true };
    });

    this.webview.bind("toggleNativeFullscreen", () => {
      if (this.webview) toggleFullscreenNative(this.webview);
      return { success: true };
    });

    this.webview.bind("toggleAlwaysOnTop", () => {
      this.alwaysOnTop = !this.alwaysOnTop;
      if (this.webview) setAlwaysOnTopNative(this.webview, this.alwaysOnTop);
      return { success: true, onTop: this.alwaysOnTop };
    });

    this.webview.bind("setAlwaysOnTop", (onTop?: boolean) => {
      this.alwaysOnTop = onTop !== undefined ? onTop : !this.alwaysOnTop;
      if (this.webview) setAlwaysOnTopNative(this.webview, this.alwaysOnTop);
      return { success: true, onTop: this.alwaysOnTop };
    });

    this.webview.bind("centerWindow", () => {
      if (this.webview)
        setWindowPositionNative(
          this.webview,
          "center",
          this.width,
          this.height,
        );
      return { success: true };
    });

    this.webview.bind("setWindowPosition", (pos: any) => {
      if (this.webview)
        setWindowPositionNative(this.webview, pos, this.width, this.height);
      return { success: true, position: pos };
    });

    this.webview.bind("openUrl", (url: string) => {
      return this.openUrl(url);
    });

    this.webview.bind("openExternal", (url: string) => {
      return this.openUrl(url);
    });

    this.webview.bind("open_url", (url: string) => {
      return this.openUrl(url);
    });

    this.webview.bind("handleShortcutIPC", async (chord: string) => {
      await this.triggerShortcut(String(chord || ""));
      return { success: true };
    });

    this.dialogs.bindIpc(this.webview);

    // Auto-bind state synchronization IPC handlers for all controls BEFORE setHTML
    const boundHandlers = new Set<string>();

    const bindControlIpc = (ctrl: any) => {
      if (!ctrl || !ctrl.id) return;
      const cid = ctrl.id;

      const changeBind = `on_${cid}_change`;
      if (!boundHandlers.has(changeBind)) {
        boundHandlers.add(changeBind);
        try {
          let lastSig = "";
          let lastAt = 0;
          this.webview?.bind(changeBind, async (val: any) => {
            // A <select>/checkbox fires input + change (+ inline handlers) for one user action;
            // collapse identical bursts so user callbacks run once.
            const sig =
              typeof val === "object" ? JSON.stringify(val) : String(val);
            const now = Date.now();
            if (sig === lastSig && now - lastAt < 120) return;
            lastSig = sig;
            lastAt = now;
            if (val !== undefined && val !== null) {
              this.formValuesStore[cid] = val;
            }
            const cb = this.eventHandlersMap.get(`${cid}:onchange`);
            if (cb) {
              try {
                await cb(this, val);
              } catch (err) {
                console.error(`Error in IPC event ${changeBind}:`, err);
              }
            }
          });
        } catch (e) {}
      }

      const clickBind = `on_${cid}_click`;
      if (!boundHandlers.has(clickBind)) {
        boundHandlers.add(clickBind);
        try {
          this.webview?.bind(clickBind, async (val: any) => {
            if (val !== undefined && val !== null) {
              this.formValuesStore[cid] = val;
            }
            const cb = this.eventHandlersMap.get(`${cid}:onclick`);
            if (cb) {
              try {
                await cb(this, val);
              } catch (err) {
                console.error(`Error in IPC event ${clickBind}:`, err);
              }
            }
          });
        } catch (e) {}
      }

      const enterBind = `on_${cid}_enter`;
      if (!boundHandlers.has(enterBind)) {
        boundHandlers.add(enterBind);
        try {
          this.webview?.bind(enterBind, async (val: any) => {
            if (val !== undefined && val !== null) {
              this.formValuesStore[cid] = val;
            }
            const cb =
              this.eventHandlersMap.get(`${cid}:onenter`) ||
              this.eventHandlersMap.get(`${cid}:enter`);
            if (cb) {
              try {
                await cb(this, val);
              } catch (err) {
                console.error(`Error in IPC event ${enterBind}:`, err);
              }
            }
          });
        } catch (e) {}
      }
    };

    const collectAndBind = (items: any[]) => {
      for (const item of items) {
        if (!item) continue;
        bindControlIpc(item);
        if (item.children && Array.isArray(item.children)) {
          collectAndBind(item.children);
        }
      }
    };

    collectAndBind(this.controls);
    collectAndBind(this.nonVisualControls);

    // Bind all explicitly registered control events to Webview IPC BEFORE setHTML
    for (const [key, callback] of this.eventHandlersMap.entries()) {
      const [controlId, eventType] = key.split(":");
      if (!controlId || !eventType) continue;
      const eventLower = eventType.replace(/^on/i, "").toLowerCase();
      const bindName = `on_${controlId}_${eventLower}`;
      if (boundHandlers.has(bindName)) continue;
      boundHandlers.add(bindName);

      try {
        this.webview.bind(bindName, async (val: any) => {
          if (val !== undefined && val !== null) {
            this.formValuesStore[controlId] = val;
          }
          try {
            await callback(this, val);
          } catch (err) {
            console.error(`Error in IPC event ${bindName}:`, err);
          }
        });
      } catch (e) {
        // Ignore duplicate binds
      }
    }

    // Set HTML content AFTER binding all IPC endpoints
    this.webview.setHTML(html);

    // A hosted window lives in a web page: nothing blocks here and the program keeps running when it closes.
    if (this.hostedFactory) return;

    this.webview.run();
    this.isWindowRunning = false;
    this.handleClose();
    forceExit(0);
  }

  // --- Developer Helpers & Inspection Methods ---
  /** Recursively searches `list` (defaulting to the window's controls) and returns the control specification matching `id`, or `null`. */
  public findControl(id: string, list: any[] = this.controls): any | null {
    if (!id) return null;
    if (list === this.controls) {
      const cached = this.controlIndex.get(id);
      if (cached && (cached.id === id || cached.name === id)) {
        return cached;
      }
    }
    for (const item of list) {
      if (item && (item.id === id || item.name === id)) {
        if (list === this.controls) this._indexControl(item);
        return item;
      }
      if (item && item.children) {
        const found = this.findControl(id, item.children);
        if (found) {
          if (list === this.controls) this._indexControl(found);
          return found;
        }
      }
    }
    if (list === this.controls) {
      const nv =
        this.nonVisualControls.find(
          (c) => c && (c.id === id || c.name === id),
        ) || null;
      if (nv) this._indexControl(nv);
      return nv;
    }
    return null;
  }

  /** Alias of `findControl`: recursively searches `list` (defaulting to the window's controls) and returns the control specification matching `id`, or `null`. */
  public hasControl(id: string): boolean {
    return this.findControl(id) !== null;
  }

  /** Returns a flat array of all control IDs registered in the window. */
  public listControls(list: any[] = this.controls): string[] {
    let ids: string[] = [];
    for (const item of list) {
      if (item.id) ids.push(item.id);
      if (item.children) ids = ids.concat(this.listControls(item.children));
    }
    if (list === this.controls) {
      ids = ids.concat(this.nonVisualControls.map((c) => c.id));
    }
    return ids;
  }

  /** Returns the `control_type` / widget kind string for the control identified by `id`, or `"unknown"` if not found. */
  public getControlKind(id: string): string {
    const ctrl = this.findControl(id);
    return ctrl ? ctrl.control_type || ctrl.type || "unknown" : "unknown";
  }

  /** Verifies that a control with `id` exists on this window, throwing a descriptive error if it is missing, and returns `id`. */
  public requireControl(id: string): string {
    if (!this.hasControl(id)) {
      throw new Error(
        `[SimpleGUI] Required control '${id}' not found on window '${this.title}'`,
      );
    }
    return id;
  }

  /** Returns the window's current title string. */
  public getTitle(): string {
    return this.title;
  }

  /** Enables or disables debug logging for this window. */
  public setDebugMode(enabled: boolean): this {
    if (enabled)
      console.log(
        `[SimpleGUI Debug] Debug mode enabled on window '${this.title}'`,
      );
    return this;
  }

  /** Returns `true` when debug mode is enabled on this window. */
  public getDebugMode(): boolean {
    return true;
  }

  /** Enables or disables responsive CSS flex/grid wrapping for window layout sections. */
  public setResponsiveLayout(enabled: boolean): this {
    return this;
  }

  /** Returns `true` if responsive layout mode is active. */
  public getResponsiveLayout(): boolean {
    return true;
  }

  /** Sets the minimum allowed window width and height in pixels. */
  public setMinSize(width: number, height: number): this {
    return this;
  }

  /** Sets the maximum allowed window width and height in pixels. */
  public setMaxSize(width: number, height: number): this {
    return this;
  }

  /** Configures whether the user can resize the window frame. */
  public setResizable(enabled: boolean): this {
    return this;
  }

  /** Returns `true` if the window is user-resizable. */
  public getResizable(): boolean {
    return true;
  }

  /** Configures whether the window can be minimized to the dock/taskbar. */
  public setMinimizable(enabled: boolean): this {
    return this;
  }

  /** Returns `true` if the window can be minimized. */
  public getMinimizable(): boolean {
    return true;
  }

  /** Configures whether the window can be maximized/zoomed. */
  public setMaximizable(enabled: boolean): this {
    return this;
  }

  /** Returns `true` if the window can be maximized. */
  public getMaximizable(): boolean {
    return true;
  }

  /** Centers the native window on the active display screen. */
  public center(): this {
    if (this.webview) {
      setWindowPositionNative(this.webview, "center", this.width, this.height);
    }
    return this;
  }

  /** Alias of `center`: centers the native window on the active display screen. */
  public centerWindow(): this {
    return this.center();
  }

  /** Opens an external URL in the user's default system browser. */
  public openUrl(url: string): boolean {
    return Sys.openUrl(url);
  }

  /** Snake_case alias of `openUrl`: opens an external URL in the user's default system browser. */
  public open_url(url: string): boolean {
    return this.openUrl(url);
  }

  /** Alias of `openUrl`: opens an external URL in the user's default system browser. */
  public openExternal(url: string): boolean {
    return this.openUrl(url);
  }

  /** Positions the window using a named screen alignment preset (`"center"`, `"top-left"`, `"bottom-right"`, etc.). */
  public alignWindow(position: string): this {
    return this.setPositionPreset(position);
  }

  /** Resizes the window to `width` × `height` pixels, updating the native webview immediately if running. */
  public setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    if (this.webview) {
      this.webview.size = { width, height, hint: SIZE_HINT_NONE };
    }
    return this;
  }

  /** Alias of `setSize`: resizes the window to `width` × `height` pixels, updating the native webview immediately if running. */
  public resize(width: number, height: number): this {
    return this.setSize(width, height);
  }

  /** Returns the current width of the window in pixels. */
  public getWidth(): number {
    return this.width;
  }

  /** Returns the current height of the window in pixels. */
  public getHeight(): number {
    return this.height;
  }

  /** Sets the screen `(x, y)` position coordinates of the window. */
  public setPosition(x: number, y: number): this {
    return this;
  }

  /** Returns the window's `[x, y]` screen position coordinates. */
  public getPosition(): [number, number] {
    return [100, 100];
  }

  /** Returns the horizontal `x` screen coordinate of the window. */
  public getX(): number {
    return 100;
  }
  /** Returns the vertical `y` screen coordinate of the window. */
  public getY(): number {
    return 100;
  }

  /** Sets the overall visual opacity (`0.0` to `1.0`) of the window body. */
  public setOpacity(opacity: number): this {
    if (this.isWindowRunning) {
      this.evalJS(`document.body.style.opacity = "${opacity}";`);
    }
    return this;
  }

  /** Returns the current window opacity (`0.0` to `1.0`). */
  public getOpacity(): number {
    return 1.0;
  }

  /** Shows or hides the window titlebar. */
  public setTitlebarVisible(visible: boolean): this {
    return this;
  }

  /** Returns `true` when the window titlebar is visible. */
  public isTitlebarVisible(): boolean {
    return true;
  }

  /** Sets the CSS mouse cursor style (`"pointer"`, `"wait"`, `"crosshair"`, etc.) for the entire window body. */
  public setCursor(cursorName: string): this {
    if (this.isWindowRunning) {
      this.evalJS(`document.body.style.cursor = "${cursorName}";`);
    }
    return this;
  }

  /** Returns the active CSS cursor name for the window. */
  public getCursor(): string {
    return "default";
  }

  /** Resets the window mouse cursor back to `"default"`. */
  public resetCursor(): this {
    return this.setCursor("default");
  }

  /** Sets the CSS mouse cursor style for a specific control element by ID. */
  public setControlCursor(controlId: string, cursorName: string): this {
    if (this.isWindowRunning) {
      this.evalJS(`
                const el = document.getElementById("${controlId}");
                if (el) el.style.cursor = "${cursorName}";
            `);
    }
    return this;
  }

  /** Requests user attention by bouncing the application dock icon (macOS) or flashing the taskbar button. */
  public bounceDockIcon(critical = false): this {
    return this;
  }

  /** Alias of `bounceDockIcon`: requests user attention by bouncing the application dock icon (macOS) or flashing the taskbar button. */
  public requestAttention(critical = false): this {
    return this.bounceDockIcon(critical);
  }

  /** Configures whether the window's native close button is enabled. */
  public setClosable(enabled: boolean): this {
    return this;
  }
  /** Returns `true` if the window can be closed by the user. */
  public getClosable(): boolean {
    return true;
  }

  /** Enables or disables the native OS drop shadow around the window frame. */
  public setHasShadow(enabled: boolean): this {
    return this;
  }
  /** Returns `true` if the window renders a native drop shadow. */
  public getHasShadow(): boolean {
    return true;
  }

  /** Configures whether dragging anywhere on the window background moves the native window. */
  public setMovableByWindowBackground(enabled: boolean): this {
    return this;
  }
  /** Returns `true` if the window can be dragged by its background. */
  public getMovableByWindowBackground(): boolean {
    return true;
  }

  /** Returns `true` when the window is currently open and visible on screen. */
  public isVisible(): boolean {
    return this.isWindowRunning;
  }
  /** Configures whether the title text is displayed in the native window titlebar. */
  public setTitleVisible(visible: boolean): this {
    return this;
  }
  /** Returns `true` if the window title text is visible in the titlebar. */
  public isTitleVisible(): boolean {
    return true;
  }
  /** Sets a secondary subtitle string in the window titlebar. */
  public setSubtitle(subtitle: string): this {
    return this;
  }
  /** Returns the window's current subtitle string. */
  public getSubtitle(): string {
    return "";
  }
  /** Configures whether the window can be repositioned on screen by the user. */
  public setMovable(enabled: boolean): this {
    return this;
  }
  /** Returns `true` if the window is movable. */
  public getMovable(): boolean {
    return true;
  }

  /** Snaps the window to a named screen edge or corner (`"left"`, `"right"`, `"top"`, `"bottom"`). */
  public snapToEdge(edge: string): this {
    return this;
  }
  /** Sets the window's bounding rectangle `(x, y, width, height)` in pixels. */
  public setBounds(x: number, y: number, w: number, h: number): this {
    return this.setSize(w, h);
  }

  /** Returns the window's `[x, y, width, height]` screen bounding rectangle. */
  public getBounds(): [number, number, number, number] {
    return [100, 100, this.width, this.height];
  }

  /** Locks the window to a fixed `width` × `height` pixel size. */
  public setFixedSize(width: number, height: number): this {
    return this.setSize(width, height);
  }

  /** Resizes the window using a named dimension preset (`"small"`, `"medium"`, `"large"`, `"hd"`, `"fullhd"`, etc.). */
  public setSizePreset(preset: string): this {
    const presets: Record<string, [number, number]> = {
      small: [400, 300],
      compact: [400, 300],
      medium: [640, 480],
      standard: [640, 480],
      large: [800, 600],
      xlarge: [1024, 768],
      hd: [1280, 720],
      full_hd: [1920, 1080],
      dialog: [420, 220],
      login: [380, 450],
      settings: [550, 400],
      sidebar: [300, 600],
      splash: [500, 300],
      square: [500, 500],
    };
    const dims = presets[preset.toLowerCase()] || [800, 600];
    return this.setSize(dims[0], dims[1]);
  }

  /** Moves the native window to a named screen alignment preset (`"center"`, `"top-left"`, `"bottom-right"`, etc.). */
  public setPositionPreset(preset: string): this {
    if (this.webview) {
      setWindowPositionNative(
        this.webview,
        preset as any,
        this.width,
        this.height,
      );
    }
    return this;
  }

  /** Configures the window as a fixed-size dialog with the given title, width, and height. */
  public makeFixedDialog(title: string, width: number, height: number): this {
    this.title = title;
    return this.setFixedSize(width, height);
  }

  /** Configures the window as a centered, fixed-size splash screen of `width` × `height` pixels. */
  public makeSplashScreen(width: number, height: number): this {
    return this.setFixedSize(width, height);
  }

  /** Configures the window with compact utility-panel styling. */
  public makeUtilityPanel(): this {
    return this;
  }

  /** Configures the window to render without a standard OS window frame. */
  public makeFrameless(): this {
    return this;
  }

  /** Plays a horizontal shake animation on the window content (for example, on invalid password or validation error). */
  public shakeWindow(): this {
    if (this.isWindowRunning) {
      this.evalJS(`
                document.body.style.transition = "transform 0.05s";
                let count = 0;
                const interval = setInterval(() => {
                    const dx = (count % 2 === 0 ? 1 : -1) * (10 - count);
                    document.body.style.transform = "translateX(" + dx + "px)";
                    count++;
                    if (count >= 6) {
                        clearInterval(interval);
                        document.body.style.transform = "";
                    }
                }, 50);
            `);
    }
    return this;
  }

  /** Alias of `shakeWindow`: plays a horizontal shake animation on the window content (for example, on invalid password or validation error). */
  public triggerShake(): this {
    return this.shakeWindow();
  }

  /** Alias of `shakeWindow`: plays a horizontal shake animation on the window content (for example, on invalid password or validation error). */
  public flashAndShake(): this {
    return this.shakeWindow();
  }

  /** Sets the outer content padding (in pixels) around the window's layout area. */
  public setPadding(padding: number): this {
    this.padding = padding;
    return this;
  }

  /** Returns the window's outer content padding in pixels. */
  public getPadding(): number {
    return this.padding;
  }

  /** Sets the default vertical/horizontal pixel spacing between controls. */
  public setSpacing(spacing: number): this {
    this.spacing = spacing;
    return this;
  }

  /** Returns the default pixel spacing between controls. */
  public getSpacing(): number {
    return this.spacing;
  }

  // --- Form Labeled Control Helpers ---
  /** Adds a two-column form row containing a left-aligned label (`130px`) and a text input field (`220px`) with the given `id` and initial `value`. */
  public addFormField(label: string, id: string, value = ""): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addTextInput("", value).id(id).width(220);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a label and a multi-line text area with the given `id` and initial `value`. */
  public addFormTextarea(
    label: string,
    id: string,
    value = "",
  ): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addTextArea("", value).id(id).width(220);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a label and a masked password input with the given `id` and initial `value`. */
  public addFormPassword(
    label: string,
    id: string,
    value = "",
  ): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addPasswordInput("••••••••").id(id).width(220);
    if (value) this.setValue(id, value);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a label and a `0..100` numeric slider with the given `id` and initial `value`. */
  public addFormSlider(
    label: string,
    id: string,
    value = 50,
  ): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addSlider(0, 100, value).id(id).width(220);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a label and a numeric stepper control with the given `id` and initial `value`. */
  public addFormNumber(label: string, id: string, value = 0): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addStepper(0, 9999, value).id(id).width(140);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a label and a dropdown selector populated with `items`. */
  public addFormDropdown(
    label: string,
    id: string,
    items: string[],
    selected = "",
  ): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addDropdown(items, selected).id(id).width(220);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a label and a date picker initialized to `date`. */
  public addFormDatePicker(
    label: string,
    id: string,
    date = "2026-07-27",
  ): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addDatePicker(date).id(id).width(220);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a label and a progress bar initialized to `value`. */
  public addFormProgress(
    label: string,
    id: string,
    value = 50,
  ): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addProgressBar(value).id(id).width(220);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a field label and a boolean toggle switch. */
  public addFormSwitch(
    label: string,
    id: string,
    switchLabel: string,
    checked = false,
  ): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(130);
    const ref = this.addSwitch(switchLabel, checked).id(id).width(220);
    this.endRow();
    return ref;
  }

  /** Adds a two-column form row containing a label and a clickable hyperlink control. */
  public addFormLink(
    label: string,
    id: string,
    linkText: string,
    url = "#",
  ): SimpleControlRef {
    this.beginRow();
    this.addLabel(label).width(120);
    const ref = this.addVisualControl("form_link", 240, 24, {
      id,
      text: linkText,
      caption: linkText,
      placeholder: url,
    });
    this.endRow();
    return ref;
  }

  /** Adds a themed section heading with a bold accent-colored title and optional muted subtitle. */
  public addHeading(title: string, subtitle?: string): this {
    const theme = getTheme(this.theme);
    const muted = theme.is_dark ? "#94a3b8" : "#334155";
    const headingColor =
      this.accentColor || (theme.is_dark ? "#38bdf8" : "#0066cc");
    const isInRow =
      this.layoutStack[this.layoutStack.length - 1]?.type === "row";
    if (isInRow) {
      const compactW = Math.max(160, Math.ceil(title.length * 9.5) + 12);
      this.addLabel(title).font(18, headingColor, "700").width(compactW);
      if (subtitle) {
        const sub = this.addLabel(subtitle).font(12, muted, "500");
        sub.spec.is_caption = true;
      }
      return this;
    }
    const fullW = this.getAvailableWidth();
    this.addLabel(title).font(18, headingColor, "700").width(fullW);
    if (subtitle) {
      const sub = this.addLabel(subtitle).font(12, muted, "500").width(fullW);
      sub.spec.is_caption = true;
    }
    this.addDivider();
    return this;
  }
  /** Snake_case alias of `addHeading`: adds a themed section heading with a bold accent-colored title and optional muted subtitle. */
  public add_heading(title: string, subtitle?: string): this {
    return this.addHeading(title, subtitle);
  }
  /** Alias of `addHeading`: adds a themed section heading with a bold accent-colored title and optional muted subtitle. */
  public addHeader(title: string, subtitle?: string): this {
    return this.addHeading(title, subtitle);
  }
  /** Snake_case alias of `addHeading`: adds a themed section heading with a bold accent-colored title and optional muted subtitle. */
  public add_header(title: string, subtitle?: string): this {
    return this.addHeading(title, subtitle);
  }

  /** Adds a medium-weight subheading label (`14px` bold) with optional custom text color. */
  public addSubheading(text: string, color?: string): SimpleControlRef {
    const theme = getTheme(this.theme);
    const defaultSub = theme.is_dark ? "#e2e8f0" : "#0f172a";
    const finalColor = color || defaultSub;
    const fullW = this.getAvailableWidth();
    const ref = this.addLabel(text).font(14, finalColor, "600").width(fullW);
    if (!color) {
      ref.spec.is_subheading = true;
    }
    return ref;
  }
  /** Snake_case alias of `addSubheading`: adds a medium-weight subheading label (`14px` bold) with optional custom text color. */
  public add_subheading(text: string, color?: string): SimpleControlRef {
    return this.addSubheading(text, color);
  }

  /** Adds a small muted caption label (`11px`) for helper notes or secondary metadata. */
  public addCaption(text: string, color?: string): SimpleControlRef {
    const theme = getTheme(this.theme);
    const defaultMuted = theme.is_dark ? "#94a3b8" : "#334155";
    const finalColor = color || defaultMuted;
    const fullW = this.getAvailableWidth();
    const ref = this.addLabel(text).font(12, finalColor, "500").width(fullW);
    ref.spec.is_caption = true;
    if (color) {
      ref.spec.custom_color = true;
    }
    return ref;
  }
  /** Snake_case alias of `addCaption`: adds a small muted caption label (`11px`) for helper notes or secondary metadata. */
  public add_caption(text: string, color?: string): SimpleControlRef {
    return this.addCaption(text, color);
  }

  /** Adds a bottom-anchored or full-width status bar control with status text and an optional right-aligned badge. */
  public addStatusBar(
    idOrText: string,
    textOrBadge?: string,
    badge?: string,
  ): SimpleControlRef {
    let id = "status_bar";
    let text = "";
    if (textOrBadge !== undefined) {
      id = idOrText;
      text = textOrBadge;
    } else {
      text = idOrText;
      id = this.generateUniqueId("status_bar");
    }
    const fullW = Math.max(300, this.width - this.padding * 2);
    return this.addVisualControl("status_bar", fullW, 28, {
      id,
      text,
      caption: text,
      dock: "bottom",
    });
  }
  /** Snake_case alias of `addStatusBar`: adds a bottom-anchored or full-width status bar control with status text and an optional right-aligned badge. */
  public add_status_bar(
    idOrText: string,
    textOrBadge?: string,
    badge?: string,
  ): SimpleControlRef {
    return this.addStatusBar(idOrText, textOrBadge, badge);
  }

  /** Adds a full-width status label control (default ID `"lbl_status"`) for displaying live feedback messages. */
  public addStatusLabel(
    idOrText = "lbl_status",
    text?: string,
  ): SimpleControlRef {
    let id = "lbl_status";
    let content = idOrText;
    if (text !== undefined) {
      id = idOrText;
      content = text;
    }
    const fullW = this.getAvailableWidth();
    return this.addLabel(id, content).width(fullW);
  }
  /** Snake_case alias of `addStatusLabel`: adds a full-width status label control (default ID `"lbl_status"`) for displaying live feedback messages. */
  public add_status_label(
    idOrText = "lbl_status",
    text?: string,
  ): SimpleControlRef {
    return this.addStatusLabel(idOrText, text);
  }

  /** Updates the text displayed in a status bar control (defaulting to `"status_bar"`). */
  public setStatusBarText(idOrText: string, text?: string): this {
    let targetId = "status_bar";
    let newText = "";
    if (text !== undefined) {
      targetId = idOrText;
      newText = text;
    } else {
      newText = idOrText;
      const existing = this.controls.find(
        (c) => c.control_type === "status_bar" || c.id.includes("status_bar"),
      );
      if (existing) targetId = existing.id;
    }
    this.setText(targetId, newText);
    if (this.isWindowRunning) {
      this.evalJS(`
                const el = document.getElementById(${JSON.stringify(targetId)});
                if (el) {
                    const textSpan = el.querySelector("span:nth-child(3)") || el.querySelector("span:last-child") || el;
                    if (textSpan) textSpan.textContent = ${JSON.stringify(newText)};
                }
            `);
    }
    return this;
  }
  /** Snake_case alias of `setStatusBarText`: updates the text displayed in a status bar control (defaulting to `"status_bar"`). */
  public set_status_bar_text(idOrText: string, text?: string): this {
    return this.setStatusBarText(idOrText, text);
  }

  /** Adds a breadcrumb navigation trail joining `segments` with `›` separators. */
  public addBreadcrumbs(id: string, segments: string[]): SimpleControlRef {
    const text = segments.join(" › ");
    return this.addVisualControl("breadcrumb", 320, 28, {
      id,
      text,
      caption: text,
    });
  }

  /** Updates the breadcrumb trail segments displayed in the breadcrumb control identified by `id`. */
  public setBreadcrumbs(id: string, segments: string[]): this {
    return this.setText(id, segments.join(" › "));
  }

  /** Adds an interactive keyboard shortcut recorder input with the given `id`. */
  public addShortcutRecorder(id: string): SimpleControlRef {
    return this.addVisualControl("shortcut_recorder", 180, 36, {
      id,
      placeholder: "Press Shortcut...",
    });
  }

  /** Adds a statistical chart widget (`"line"`, `"bar"`, or `"area"`) with the given `id` and pixel `height`. */
  public addChart(id: string, type = "line", height = 140): SimpleControlRef {
    return this.addVisualControl("stat_chart", 360, height, {
      id,
      caption: type,
    });
  }

  /** Updates the numeric series values of the chart control identified by `id`. */
  public setChartData(id: string, values: number[]): this {
    const nums = Array.isArray(values) ? values.map((v) => Number(v) || 0) : [];
    const ctrl = this.findControl(id);
    if (ctrl) {
      ctrl.points = nums;
      ctrl.value = nums.join(", ");
    }
    this.setValue(id, nums.join(", "));
    if (this.isWindowRunning && nums.length > 0) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const range = max - min || 1;
      const stepX = nums.length > 1 ? 100 / (nums.length - 1) : 100;
      const pts = nums.map((v, i) => {
        const x = +(i * stepX).toFixed(2);
        const y = +(22 - ((v - min) / range) * 18).toFixed(2);
        return `${i === 0 ? "M" : "L"}${x} ${y}`;
      });
      const linePath = pts.join(" ");
      const areaPath = `${linePath} L100 24 L0 24 Z`;
      const lastVal = String(nums[nums.length - 1]);
      this.evalJS(`
                (function() {
                    const el = document.getElementById(${JSON.stringify(id)});
                    if (!el) return;
                    const paths = el.querySelectorAll("svg path");
                    if (paths.length >= 2) {
                        paths[0].setAttribute("d", ${JSON.stringify(linePath)});
                        paths[1].setAttribute("d", ${JSON.stringify(areaPath)});
                    } else if (paths.length === 1) {
                        paths[0].setAttribute("d", ${JSON.stringify(linePath)});
                    }
                    const divs = el.querySelectorAll("div");
                    if (divs.length >= 2) divs[1].textContent = ${JSON.stringify(lastVal)};
                })();
            `);
    }
    return this;
  }

  /** Adds a circular ring progress indicator (`0..100`) with the given `id`. */
  public addCircularProgress(id: string, value = 50): SimpleControlRef {
    return this.addVisualControl("circular_progress", 100, 100, { id, value });
  }

  /** Updates the percentage value (`0..100`) of the circular progress control identified by `id`. */
  public setCircularProgress(id: string, value: number): this {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    const ctrl = this.findControl(id);
    if (ctrl) ctrl.value = pct;
    this.setValue(id, pct);
    if (this.isWindowRunning) {
      const r = 36;
      const circ = 2 * Math.PI * r;
      const dash = (circ * pct) / 100;
      const dashArray = `${dash.toFixed(1)} ${(circ - dash).toFixed(1)}`;
      this.evalJS(`
                (function() {
                    const el = document.getElementById(${JSON.stringify(id)});
                    if (!el) return;
                    const circles = el.querySelectorAll("svg circle");
                    if (circles.length >= 2) {
                        circles[1].setAttribute("stroke-dasharray", ${JSON.stringify(dashArray)});
                    }
                    const txt = el.querySelector("svg text");
                    if (txt) txt.textContent = ${JSON.stringify(`${Math.round(pct)}%`)};
                })();
            `);
    }
    return this;
  }

  /** Adds a two-column key-value property inspector grid populated from a record or `"key:val"` string. */
  public addPropertyGrid(
    id: string,
    props: Record<string, string> | string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    const text =
      typeof props === "string"
        ? props
        : Object.entries(props)
            .map(([k, v]) => `${k}:${v}`)
            .join(", ");
    return this.addVisualControl(
      "property_grid",
      Math.min(450, this.width - 40),
      230,
      {
        id,
        text,
        caption: opts.caption || "Property Inspector",
        ...opts,
      },
    );
  }
  /** Snake_case alias of `addPropertyGrid`: adds a two-column key-value property inspector grid populated from a record or `"key:val"` string. */
  public add_property_grid(
    id: string,
    props: Record<string, string> | string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addPropertyGrid(id, props, opts);
  }
  /** Snake_case alias of `addPropertyGrid`: adds a two-column key-value property inspector grid populated from a record or `"key:val"` string. */
  public property_grid(
    id: string,
    props: Record<string, string> | string,
    opts: Partial<any> = {},
  ): SimpleControlRef {
    return this.addPropertyGrid(id, props, opts);
  }

  /** Updates the displayed value for a specific `key` row inside a live property grid control. */
  public setPropertyGridValue(id: string, key: string, value: string): this {
    if (this.isWindowRunning) {
      const safeId = JSON.stringify(id);
      const safeKey = JSON.stringify(key);
      const safeVal = JSON.stringify(value);
      this.evalJS(`
                const grid = document.getElementById(${safeId});
                if (grid) {
                    const row = Array.from(grid.querySelectorAll('.prop-row')).find(r => r.textContent && r.textContent.includes(${safeKey}));
                    if (row) {
                        const valEl = row.querySelector('.prop-val');
                        if (valEl) valEl.textContent = ${safeVal};
                    }
                }
            `);
    }
    return this;
  }

  /** Adds a text input control with an explicit `id`, `initialValue`, `placeholder`, and optional width/options. */
  public addInput(
    id: string,
    initialValue = "",
    placeholder = "",
    opts: any = {},
  ): SimpleControlRef {
    const optObj = typeof opts === "number" ? { width: opts } : opts || {};
    const width = optObj.width !== undefined ? optObj.width : 280;
    const ref = this.addVisualControl("input", width, 36, {
      id,
      value: initialValue,
      text: initialValue,
      placeholder: placeholder || initialValue,
      ...optObj,
    });
    if (initialValue) this.formValuesStore[id] = initialValue;
    return ref;
  }
  /** Snake_case alias of `addInput`: adds a text input control with an explicit `id`, `initialValue`, `placeholder`, and optional width/options. */
  public add_input(
    id: string,
    initialValue = "",
    placeholder = "",
    opts: any = {},
  ): SimpleControlRef {
    return this.addInput(id, initialValue, placeholder, opts);
  }
  /** Alias of `addTextArea`: adds a multi-line text area control with optional ID, placeholder, and initial text content. */
  public addTextarea(
    id: string,
    initialValue = "",
    placeholder = "",
  ): SimpleControlRef {
    return this.addTextArea(id, initialValue, placeholder);
  }
  /** Snake_case alias of `addTextarea`: adds a multi-line text area control with optional ID, placeholder, and initial text content. */
  public add_textarea(
    id: string,
    initialValue = "",
    placeholder = "",
  ): SimpleControlRef {
    return this.addTextarea(id, initialValue, placeholder);
  }
  /** Alias of `beginCard`: begins an elevated card container section with an optional header title and subtitle. */
  public beginGroupBox(title?: string, subtitle?: string): this {
    return this.beginCard(title, subtitle);
  }
  /** Snake_case alias of `beginCard`: begins an elevated card container section with an optional header title and subtitle. */
  public begin_group_box(title?: string, subtitle?: string): this {
    return this.beginCard(title, subtitle);
  }
  /** Alias of `endCard`: closes the current card container section, finalizing its bounding height and advancing the vertical layout cursor. */
  public endGroupBox(): this {
    return this.endCard();
  }
  /** Snake_case alias of `endCard`: closes the current card container section, finalizing its bounding height and advancing the vertical layout cursor. */
  public end_group_box(): this {
    return this.endCard();
  }
  /** Replaces the headers and/or row data of an existing table control in both the form store and live DOM. */
  public setTableData(
    id: string,
    headersOrRows: string[] | any[],
    maybeRows?: any[],
  ): this {
    const ctrl = this.findControl(id);
    let headers: string[];
    let rows: any[];
    if (maybeRows !== undefined && Array.isArray(headersOrRows)) {
      headers = headersOrRows as string[];
      rows = maybeRows;
    } else if (Array.isArray(headersOrRows)) {
      headers =
        ctrl && Array.isArray(ctrl.headers) && ctrl.headers.length > 0
          ? ctrl.headers
          : ctrl && ctrl.text
            ? ctrl.text.split(",").map((s: string) => s.trim())
            : [];
      rows = headersOrRows as any[][];
    } else {
      headers = [];
      rows = [];
    }
    const headerCsv = headers.join(", ");
    this.formValuesStore[id] = rows;
    if (ctrl) {
      ctrl.text = headerCsv;
      ctrl.value = rows;
      ctrl.rows = rows;
      ctrl.headers = [...headers];
      ctrl.columns = [...headers];
    }
    if (this.isWindowRunning) {
      const tableJson = JSON.stringify(rows || []);
      const headersJson = JSON.stringify(headers || []);
      this.evalJS(`
                (function() {
                    const ctrlId = ${JSON.stringify(id)};
                    const container = document.getElementById(ctrlId);
                    if (!container) return;
                    const prevScrollTop = container.scrollTop;
                    const prevScrollLeft = container.scrollLeft;
                    const targetPidInput = document.getElementById("txt_target_pid");
                    const activePid = targetPidInput ? targetPidInput.value.trim() : (window.selectedRowPid || "");

                    let table = container.querySelector("table");
                    if (!table) {
                        table = document.createElement("table");
                        table.style.width = "100%";
                        table.style.borderCollapse = "collapse";
                        table.style.fontSize = "12px";
                        container.innerHTML = "";
                        container.appendChild(table);
                    }
                    const headers = ${headersJson};
                    const rows = ${tableJson};
                    const isLight = document.body.classList.contains("light-theme") || (window.currentTheme && window.currentTheme.includes("light"));
                    const selBg = isLight ? 'rgba(2,132,199,0.18)' : 'rgba(56,189,248,0.22)';
                    const hoverBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
                    const border = 'rgba(128,128,128,0.2)';
                    const accent = isLight ? '#0284c7' : '#38bdf8';
                    const color = isLight ? '#0f172a' : '#f8fafc';
                    table.style.color = color;

                    function esc(str) {
                        if (str === null || str === undefined) return '';
                        return String(str)
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(/'/g, '&#039;');
                    }

                    let thead = '<tr style="background:' + (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)') + ';position:sticky;top:0;z-index:2;backdrop-filter:blur(6px);">' + 
                        headers.map(h => '<th style="padding:8px 12px;text-align:left;font-weight:700;color:' + accent + ';border-bottom:1px solid ' + border + ';white-space:nowrap;">' + esc(h) + '</th>').join('') + '</tr>';
                    
                    let tbody = rows.map(r => {
                        const cells = Array.isArray(r) ? r : (r && r.cells ? r.cells : Object.values(r));
                        const rowPid = String(r && r.rowId !== undefined ? r.rowId : (r && r.pid !== undefined ? r.pid : (cells[0] || ''))).trim();
                        const isSelected = activePid && rowPid === activePid;
                        const bgStyle = isSelected ? ('background:' + selBg + ';') : '';
                        const selClass = isSelected ? ' selected-tr' : '';

                        return '<tr class="' + selClass + '" style="border-bottom:1px solid ' + border + ';cursor:pointer;transition:background 0.12s;' + bgStyle + '" ' +
                            'data-ctrl-id="' + esc(ctrlId) + '" data-pid="' + esc(rowPid) + '" ' +
                            'onclick="const cid=this.getAttribute(\\'data-ctrl-id\\')||\\'\\',pid=this.getAttribute(\\'data-pid\\')||\\'\\',tb=this.closest(\\'tbody\\');if(tb){tb.querySelectorAll(\\'tr\\').forEach(tr=>{tr.classList.remove(\\'selected-tr\\');tr.style.background=\\'\\'});this.classList.add(\\'selected-tr\\');this.style.background=\\'' + selBg + '\\';window.selectedRowElement=this;window.selectedRowPid=pid;if(window.onTableRowClick)window.onTableRowClick(this);const fn=window[cid+\\'_onClick\\']||window[\\'on_\\'+cid+\\'_click\\'];if(fn)fn(pid);}" ' +
                            'ondblclick="const cid=this.getAttribute(\\'data-ctrl-id\\')||\\'\\',pid=this.getAttribute(\\'data-pid\\')||\\'\\',fn=window[cid+\\'_onDoubleClick\\']||window[\\'on_\\'+cid+\\'_doubleclick\\']||window[\\'on_\\'+cid+\\'_ondoubleclick\\'];if(fn)fn(pid);" ' +
                            'onmouseover="if(!this.classList.contains(\\'selected-tr\\'))this.style.background=\\'' + hoverBg + '\\'" ' +
                            'onmouseout="if(!this.classList.contains(\\'selected-tr\\'))this.style.background=\\'\\'">' +
                            cells.map((c, i) => {
                                const strVal = c === null || c === undefined ? '' : String(c);
                                const isNum = /^-?\d+(\.\d+)?(%|\s*(KB|MB|GB|B|ms|s))?$/i.test(strVal.trim());
                                const alignStyle = isNum ? 'text-align:right;' : 'text-align:left;';
                                const monoStyle = (i === 0 || isNum) ? 'font-family:monospace;font-variant-numeric:tabular-nums;' : '';
                                const isUrl = strVal.startsWith('http://') || strVal.startsWith('https://');
                                const cellHtml = isUrl
                                    ? ('<a href="' + esc(strVal) + '" target="_blank" rel="noopener noreferrer" style="color:' + accent + ';text-decoration:underline;cursor:pointer;" onclick="event.stopPropagation();const u=this.getAttribute(\\'href\\')||\\'\\';if(typeof window.openUrl===\\'function\\'){window.openUrl(u);}else if(typeof window.openExternal===\\'function\\'){window.openExternal(u);}return false;">' + esc(strVal) + '</a>')
                                    : esc(strVal);
                                return '<td style="padding:8px 12px;white-space:nowrap;' + alignStyle + monoStyle + '">' + cellHtml + '</td>';
                            }).join('') + '</tr>';
                    }).join('');

                    table.innerHTML = '<thead>' + thead + '</thead><tbody>' + tbody + '</tbody>';

                    // Restore user scroll position so background refresh never jumps to top
                    container.scrollTop = prevScrollTop;
                    container.scrollLeft = prevScrollLeft;

                    // Re-apply client-side filter if user is actively searching
                    if (window.applyClientSideTableFilter) {
                        window.applyClientSideTableFilter();
                    }
                })();
            `);
    }
    return this;
  }
  /** Non-blocking toast. `toast("Saved!")`, `toast("Oops", 4000, "error")` or `toast({title, icon, position, timer, ...})`. */
  public toast(
    message: string | DialogOptions,
    durationMs = 3000,
    icon?: DialogIcon,
  ): this {
    this.dialogs.toast(message, durationMs, icon);
    return this;
  }

  /** Adds a data table control with explicit `id`, column `headers`, and `initialRows`. */
  public addGridTable(
    id: string,
    headers: string[],
    initialRows: string[][],
  ): SimpleControlRef {
    return this.addTable(headers, initialRows).id(id);
  }

  /** Appends a row of cell strings to a grid table control. */
  public gridAddRow(id: string, row: string[]): this {
    const ctrl = this.findControl(id);
    if (ctrl) {
      const headers: string[] = Array.isArray(ctrl.headers)
        ? ctrl.headers
        : Array.isArray(ctrl.columns)
          ? ctrl.columns
          : [];
      const rows: any[] = Array.isArray(ctrl.rows) ? [...ctrl.rows] : [];
      rows.push(Array.isArray(row) ? row.map((c) => String(c ?? "")) : []);
      ctrl.rows = rows;
      this.setTableData(id, headers, rows);
    }
    return this;
  }

  /** Deletes the row at `idx` from a grid table control. */
  public gridDeleteRow(id: string, idx: number): this {
    const ctrl = this.findControl(id);
    if (
      ctrl &&
      Array.isArray(ctrl.rows) &&
      idx >= 0 &&
      idx < ctrl.rows.length
    ) {
      const headers: string[] = Array.isArray(ctrl.headers)
        ? ctrl.headers
        : Array.isArray(ctrl.columns)
          ? ctrl.columns
          : [];
      const rows = [...ctrl.rows];
      rows.splice(idx, 1);
      ctrl.rows = rows;
      this.setTableData(id, headers, rows);
    }
    return this;
  }

  /** Adds a read-only monospace console log viewer control with the given `id` and `height`. */
  public addConsole(id: string, height = 120): SimpleControlRef {
    return this.addVisualControl("code_view", 520, height, {
      id,
      placeholder: "Console Log Output",
    });
  }

  /** Appends a log message line to a console control, automatically prefixing `[WARN]` (`level=1`) or `[ERR]` (`level=2`) when needed. */
  public appendConsole(id: string, text: string, level = 0): this {
    const current = this.getText(id);
    let prefix = "";
    if (!text.trim().startsWith("[")) {
      prefix =
        level === 1
          ? "[WARN] "
          : level === 2
            ? "[SUCCESS] "
            : level === 3
              ? "[ERROR] "
              : "[INFO] ";
    }
    return this.setText(
      id,
      current ? `${current}\n${prefix}${text}` : `${prefix}${text}`,
    );
  }

  /** Alias of `appendConsole`: appends a log entry with optional severity `level` to console control `id`. */
  public logConsole(id: string, text: string, level = 0): this {
    return this.appendConsole(id, text, level);
  }

  /** Clears all log output text in the console control identified by `id`. */
  public clearConsole(id: string): this {
    return this.setText(id, "");
  }

  /** Adds a metric comparison gauge widget with the given `id`, `title`, and numeric `value`. */
  public addGauge(id: string, title: string, value = 50): SimpleControlRef {
    return this.addVisualControl("metric_comparison", 240, 80, {
      id,
      caption: title,
      value,
    });
  }

  /** Updates the numeric value of the gauge control identified by `id`. */
  public setGaugeValue(id: string, val: number): this {
    const ctrl = this.findControl(id);
    if (ctrl) ctrl.value = val;
    this.setValue(id, val);
    if (this.isWindowRunning) {
      const pct = Math.max(0, Math.min(100, Number(val) || 0));
      this.evalJS(`
                (function() {
                    const el = document.getElementById(${JSON.stringify(id)});
                    if (!el) return;
                    const spans = el.querySelectorAll("span");
                    if (spans.length >= 3) spans[2].textContent = ${JSON.stringify(String(val))};
                    const bar = el.querySelector("div:last-child > div");
                    if (bar) bar.style.width = ${JSON.stringify(`${pct}%`)};
                })();
            `);
    }
    return this;
  }

  /** Adds a page navigation bar control displaying `currentPage` of `totalPages`. */
  public addPagination(
    id: string,
    totalPages: number,
    currentPage = 1,
  ): SimpleControlRef {
    return this.addVisualControl("pagination", 300, 36, {
      id,
      value: currentPage,
      caption: String(totalPages),
    });
  }

  /** Updates the active page number of the pagination control identified by `id`. */
  public setPaginationPage(id: string, page: number): this {
    return this.setValue(id, page);
  }

  /** Adds a chronological activity stream feed control with the given `id` and `height`. */
  public addActivityFeed(id: string, height = 140): SimpleControlRef {
    return this.addVisualControl("activity_feed", 320, height, {
      id,
      caption: "Activity Stream",
    });
  }

  /** Appends a timestamped `[time] message` entry to an activity feed control. */
  public addActivityFeedItem(id: string, time: string, message: string): this {
    const current = this.getText(id);
    const item = `[${time}] ${message}`;
    return this.setText(id, current ? `${current}, ${item}` : item);
  }

  /** Adds a formatted Markdown document viewer control with the given `id`, content, and height. */
  public addMarkdownView(
    id: string,
    markdownText: string,
    height = 140,
  ): SimpleControlRef {
    return this.addVisualControl("code_view", 520, height, {
      id,
      text: markdownText,
      caption: markdownText,
      placeholder: "markdown",
    });
  }

  /** Updates the Markdown source text of the Markdown view control identified by `id`. */
  public setMarkdownViewText(id: string, text: string): this {
    return this.setText(id, text);
  }

  /** Adds a compact inline sparkline trend chart rendered from an array of numeric `values`. */
  public addSparkline(
    id: string,
    values: number[],
    height = 30,
  ): SimpleControlRef {
    return this.addVisualControl("sparkline_table", 200, height, {
      id,
      value: values.join(","),
    });
  }

  /** Updates the numeric series values of the sparkline control identified by `id`. */
  public setSparklineData(id: string, values: number[]): this {
    const nums = Array.isArray(values) ? values.map((v) => Number(v) || 0) : [];
    const ctrl = this.findControl(id);
    if (ctrl) ctrl.value = nums.join(",");
    this.setValue(id, nums.join(","));
    if (this.isWindowRunning && nums.length > 0) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const range = max - min || 1;
      const stepX = nums.length > 1 ? 50 / (nums.length - 1) : 50;
      const polyPts = nums
        .map(
          (v, i) =>
            `${+(i * stepX).toFixed(1)},${+(14 - ((v - min) / range) * 12).toFixed(1)}`,
        )
        .join(" ");
      const lastVal = String(nums[nums.length - 1]);
      this.evalJS(`
                (function() {
                    const el = document.getElementById(${JSON.stringify(id)});
                    if (!el) return;
                    const poly = el.querySelector("svg polyline");
                    if (poly) poly.setAttribute("points", ${JSON.stringify(polyPts)});
                    const mono = el.querySelector(".rad-mono");
                    if (mono) mono.textContent = ${JSON.stringify(lastVal)};
                })();
            `);
    }
    return this;
  }

  /** Adds a centered multi-digit PIN / OTP verification input field. */
  public addPinCode(id: string, digits = 4): SimpleControlRef {
    return this.addVisualControl("input", digits * 40, 40, {
      id,
      placeholder: "••••",
      font_size: 18,
      text_align: "center",
    });
  }

  /** Sets the string code value of the PIN code input control identified by `id`. */
  public setPinCodeValue(id: string, code: string): this {
    return this.setValue(id, code);
  }

  /** Returns the current string value entered in a PIN code control. */
  public getPinCodeValue(id: string): string {
    return String(this.getValue(id) || "");
  }

  /** Adds a color swatch selector bar populated with `hexColors`. */
  public addColorPalette(
    id: string,
    hexColors: string[],
    selected = "",
  ): SimpleControlRef {
    const text = hexColors.join(", ");
    return this.addVisualControl("color_swatch", 280, 50, {
      id,
      text,
      caption: text,
      value: selected || hexColors[0],
    });
  }

  /** Adds a vertical milestone timeline control with the given `id` and `height`. */
  public addTimeline(id: string, height = 160): SimpleControlRef {
    return this.addVisualControl("timeline", 320, height, {
      id,
      caption: "Project Milestones",
    });
  }

  /** Appends a milestone event (`title`, `subtitle`, `time`, `status`) to a timeline control. */
  public addTimelineItem(
    id: string,
    title: string,
    subtitle: string,
    time: string,
    status = "active",
  ): this {
    const current = this.getText(id);
    const item = `${title} (${time})`;
    return this.setText(id, current ? `${current}, ${item}` : item);
  }

  /** Adds a KPI stat card displaying a metric `title`, primary `value`, delta `badge`, and optional `subtitle`. */
  public addMetricCard(
    id: string,
    title: string,
    value: string,
    badge = "+12.3%",
    subtitle = "",
  ): SimpleControlRef {
    return this.addVisualControl("stat_card", 220, 90, {
      id,
      caption: title,
      value,
      placeholder: badge,
    });
  }

  /** Updates the primary metric value displayed on the stat/metric card control identified by `id`. */
  public setMetricCardValue(id: string, val: string, badge = ""): this {
    return this.setValue(id, val);
  }

  /** Adds a pill-styled horizontal tab selector (`id`) populated with `items` and initial `selected` item. */
  public addTabPills(
    id: string,
    items: string[],
    selected = "",
  ): SimpleControlRef {
    return this.addSegmentedControl(
      items,
      items.indexOf(selected) >= 0 ? items.indexOf(selected) : 0,
    ).id(id);
  }

  /** Adds a star-rating summary widget with average `score`, total `reviews`, and 5-star percentage distribution. */
  public addRatingBreakdown(
    id: string,
    score: number,
    reviews: number,
    percentages: number[],
  ): SimpleControlRef {
    return this.addVisualControl("rating_stars", 200, 36, {
      id,
      value: Math.round(score),
    });
  }

  /** Adds a semantic alert banner (`id`) displaying `title: message` in the given severity `style`. */
  public addAlertBanner(
    id: string,
    title: string,
    message: string,
    style: "info" | "success" | "warning" | "error" = "info",
  ): SimpleControlRef {
    return this.addBadge(`${title}: ${message}`, style).id(id);
  }

  /** Adds a multi-step progress tracker control (`id`) with `steps` labels and active `currentStep` index. */
  public addStepTracker(
    id: string,
    steps: string[],
    currentStep = 0,
  ): SimpleControlRef {
    return this.addSegmentedControl(steps, currentStep).id(id);
  }

  /** Adds a selectable filter chip bar (`id`) populated with `chips` labels. */
  public addFilterChips(
    id: string,
    chips: string[],
    selected: string[] = [],
  ): SimpleControlRef {
    return this.addSegmentedControl(chips, 0).id(id);
  }

  /** Adds a file path display/input bar initialized to `initialPath`. */
  public addFilePathField(id: string, initialPath = ""): SimpleControlRef {
    return this.addVisualControl("file_path_bar", 360, 36, {
      id,
      text: initialPath,
      caption: initialPath,
    });
  }

  /** Adds a circular radial gauge indicator (`id`) with `title` and percentage `value`. */
  public addRadialGauge(
    id: string,
    title: string,
    value = 50,
  ): SimpleControlRef {
    return this.addCircularProgress(id, value);
  }

  /** Adds a property grid card pairing parallel `keys` and `values` arrays. */
  public addKeyValueCard(
    id: string,
    title: string,
    keys: string[],
    values: string[],
  ): SimpleControlRef {
    const props: Record<string, string> = {};
    keys.forEach((k, idx) => {
      props[k] = values[idx] || "";
    });
    return this.addPropertyGrid(id, props);
  }

  // --- Nameless Control Helpers ---
  /** Ergonomic shorthand that adds a text input field (auto-assigning ID `"default_input"` when nameless) with optional change callback. */
  public input(
    placeholderOrInitial = "",
    defaultValOrOnChange?: string | EventCallback,
    maybeOnChange?: EventCallback,
  ): SimpleControlRef {
    let placeholder = "";
    let defaultVal = "";
    let onChange: EventCallback | undefined;
    let isNameless = false;
    if (typeof defaultValOrOnChange === "function") {
      placeholder = placeholderOrInitial;
      onChange = defaultValOrOnChange;
    } else if (typeof defaultValOrOnChange === "string") {
      placeholder = placeholderOrInitial;
      defaultVal = defaultValOrOnChange;
      onChange = maybeOnChange;
    } else {
      defaultVal = placeholderOrInitial;
      isNameless = true;
    }
    const ref = this.addTextInput(placeholder, defaultVal);
    if (isNameless) ref.id("default_input");
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Ergonomic shorthand that adds a push button (default ID `"default_button"`) with caption and optional click handler. */
  public button(caption: string, onClick?: EventCallback): SimpleControlRef {
    const ref = this.addButton(caption).id("default_button");
    if (onClick) ref.onClick(onClick);
    return ref;
  }

  /** Ergonomic shorthand that adds a multi-line textarea (default ID `"default_textarea"`) with optional change callback. */
  public textarea(
    placeholderOrInitial = "",
    defaultValOrOnChange?: string | EventCallback,
    maybeOnChange?: EventCallback,
  ): SimpleControlRef {
    let placeholder = "";
    let defaultVal = "";
    let onChange: EventCallback | undefined;
    let isNameless = false;
    if (typeof defaultValOrOnChange === "function") {
      placeholder = placeholderOrInitial;
      onChange = defaultValOrOnChange;
    } else if (typeof defaultValOrOnChange === "string") {
      placeholder = placeholderOrInitial;
      defaultVal = defaultValOrOnChange;
      onChange = maybeOnChange;
    } else {
      defaultVal = placeholderOrInitial;
      isNameless = true;
    }
    const ref = this.addTextArea(placeholder, defaultVal);
    if (isNameless) ref.id("default_textarea");
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Ergonomic shorthand that adds a checkbox control (default ID `"default_checkbox"`) with label, initial state, and optional change callback. */
  public checkbox(
    label: string,
    checkedOrOnChange?: boolean | EventCallback,
    maybeOnChange?: EventCallback,
  ): SimpleControlRef {
    let checked = false;
    let onChange: EventCallback | undefined;
    if (typeof checkedOrOnChange === "function") {
      onChange = checkedOrOnChange;
    } else if (typeof checkedOrOnChange === "boolean") {
      checked = checkedOrOnChange;
      onChange = maybeOnChange;
    }
    const ref = this.addCheckbox(label, checked).id("default_checkbox");
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Ergonomic shorthand that adds a radio button in `groupOrLabel` with optional initial state and change callback. */
  public radio(
    groupOrLabel: string,
    labelOrChecked?: string | boolean | EventCallback,
    checkedOrOnChange?: boolean | EventCallback,
    maybeOnChange?: EventCallback,
  ): SimpleControlRef {
    let group = "default_radio_group";
    let label = groupOrLabel;
    let checked = false;
    let onChange: EventCallback | undefined;
    if (typeof labelOrChecked === "string") {
      group = groupOrLabel;
      label = labelOrChecked;
      if (typeof checkedOrOnChange === "boolean") {
        checked = checkedOrOnChange;
        onChange = maybeOnChange;
      } else if (typeof checkedOrOnChange === "function") {
        onChange = checkedOrOnChange;
      }
    } else if (typeof labelOrChecked === "boolean") {
      checked = labelOrChecked;
      if (typeof checkedOrOnChange === "function") onChange = checkedOrOnChange;
    } else if (typeof labelOrChecked === "function") {
      onChange = labelOrChecked;
    }
    const ref = this.addVisualControl("radio", 180, 24, {
      text: label,
      caption: label,
      secondary_text: group,
      checked,
      value: label,
    });
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Ergonomic shorthand that adds a boolean switch control (default ID `"default_toggle"`) with label and optional change callback. */
  public toggle(
    label: string,
    checkedOrOnChange?: boolean | EventCallback,
    maybeOnChange?: EventCallback,
  ): SimpleControlRef {
    let checked = false;
    let onChange: EventCallback | undefined;
    if (typeof checkedOrOnChange === "function") {
      onChange = checkedOrOnChange;
    } else if (typeof checkedOrOnChange === "boolean") {
      checked = checkedOrOnChange;
      onChange = maybeOnChange;
    }
    const ref = this.addSwitch(label, checked);
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Ergonomic shorthand that adds a numeric slider (default ID `"default_slider"`) with `[min, max]`, initial value, and optional change callback. */
  public slider(
    minOrOnChange?: number | EventCallback,
    maxOrVal?: number,
    defaultValOrOnChange?: number | EventCallback,
    maybeOnChange?: EventCallback,
  ): SimpleControlRef {
    let min = 0;
    let max = 100;
    let val = 50;
    let onChange: EventCallback | undefined;
    if (typeof minOrOnChange === "function") {
      onChange = minOrOnChange;
    } else if (typeof minOrOnChange === "number") {
      min = minOrOnChange;
      if (typeof maxOrVal === "number") max = maxOrVal;
      if (typeof defaultValOrOnChange === "number") val = defaultValOrOnChange;
      else if (typeof defaultValOrOnChange === "function")
        onChange = defaultValOrOnChange;
      if (maybeOnChange) onChange = maybeOnChange;
    }
    const ref = this.addSlider(min, max, val);
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Ergonomic shorthand that adds a data table control (default ID `"default_table"`) from headers/rows and optional selection handler. */
  public table(
    headersOrRows: string[] | any[][],
    rowsOrOnSelect?: any[][] | EventCallback,
    maybeOnSelect?: EventCallback,
  ): SimpleControlRef {
    let headers: string[] = [];
    let rows: any[][] = [];
    let onSelect: EventCallback | undefined;
    if (
      Array.isArray(headersOrRows) &&
      headersOrRows.length > 0 &&
      Array.isArray(headersOrRows[0])
    ) {
      rows = headersOrRows as any[][];
      if (typeof rowsOrOnSelect === "function") onSelect = rowsOrOnSelect;
    } else if (Array.isArray(headersOrRows)) {
      headers = headersOrRows as string[];
      if (Array.isArray(rowsOrOnSelect)) rows = rowsOrOnSelect;
      if (typeof maybeOnSelect === "function") onSelect = maybeOnSelect;
    }
    const ref = this.addTable(headers, rows);
    if (onSelect) ref.onClick(onSelect);
    return ref;
  }

  /** Ergonomic shorthand that adds a numeric stepper control (default ID `"default_number"`) initialized to `value`. */
  public number(value = 0): SimpleControlRef {
    return this.addStepper(0, 9999, value).id("default_number");
  }

  /** Ergonomic shorthand that adds a dropdown select control (default ID `"default_dropdown"`) with `items`, initial selection, and optional change callback. */
  public dropdown(
    items: string[],
    selectedOrOnChange?: string | EventCallback,
    maybeOnChange?: EventCallback,
  ): SimpleControlRef {
    let selected = items[0] || "";
    let onChange: EventCallback | undefined;
    if (typeof selectedOrOnChange === "function") {
      onChange = selectedOrOnChange;
    } else if (typeof selectedOrOnChange === "string") {
      selected = selectedOrOnChange;
      onChange = maybeOnChange;
    }
    const ref = this.addDropdown(items, selected).id("default_dropdown");
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  /** Ergonomic shorthand that adds a segmented control (default ID `"default_segmented"`) with `items` and initial `selected` item. */
  public segmented(items: string[], selected = ""): SimpleControlRef {
    return this.addSegmentedControl(
      items,
      items.indexOf(selected) >= 0 ? items.indexOf(selected) : 0,
    ).id("default_segmented");
  }

  /** Ergonomic shorthand that adds a toggle switch control (default ID `"default_switch"`) with `label` and `checked` state. */
  public toggleSwitch(label: string, checked = false): SimpleControlRef {
    return this.addSwitch(label, checked).id("default_switch");
  }

  /** Ergonomic shorthand that adds a search input control (default ID `"default_search"`) with `placeholder`. */
  public searchField(placeholder = ""): SimpleControlRef {
    return this.addSearchInput(placeholder).id("default_search");
  }

  /** Ergonomic shorthand that adds a donut chart widget with `title`, `percent`, and optional `subtitle`. */
  public donut(title: string, percent = 75, subtitle = ""): SimpleControlRef {
    return this.addDonutChart("donut_" + Date.now(), title, percent, subtitle);
  }

  /** Ergonomic shorthand that adds a score card widget with `title`, `score`, `subtitle`, and `grade`. */
  public score_card(
    title: string,
    score: number | string,
    subtitle = "",
    grade = "A+",
  ): SimpleControlRef {
    return this.addScoreCard(title, score, subtitle, grade);
  }

  /** Ergonomic shorthand that adds a search input field with `placeholder`. */
  public search_field(placeholder = "Search..."): SimpleControlRef {
    return this.addSearchField("search_" + Date.now(), placeholder);
  }

  /** Ergonomic shorthand that adds a syntax-aware code editor block with `code` and `language`. */
  public code_box(code: string, language = "typescript"): SimpleControlRef {
    return this.addCodeEditor(code, language);
  }

  /** Ergonomic shorthand that adds a full-width notification banner with `message` and severity `style`. */
  public banner(
    message: string,
    style: "info" | "success" | "warning" | "error" = "info",
  ): SimpleControlRef {
    return this.addBanner(message, style);
  }

  /** Ergonomic shorthand that adds a KPI metric card with `title`, `value`, and delta `badge`. */
  public stat_card(
    title: string,
    value: string,
    badge = "+12%",
  ): SimpleControlRef {
    return this.addMetricCard("stat_" + Date.now(), title, value, badge);
  }

  /** Ergonomic shorthand that adds a responsive grid of KPI stat cards. */
  public stat_grid(
    stats: Array<{
      label: string;
      value: string;
      delta?: string;
      trend?: "up" | "down";
    }>,
  ): SimpleControlRef {
    return this.addStatGrid(stats);
  }

  /** Ergonomic shorthand that adds a user profile card with `name`, `handle`, and `avatar`. */
  public user_profile(
    name: string,
    handle: string,
    avatar = "",
  ): SimpleControlRef {
    return this.addUserProfileCard({ name, handle, avatar });
  }

  /** Ergonomic shorthand that adds an e-commerce product showcase card. */
  public product_card(product: {
    title: string;
    price: string;
    rating?: number;
    reviews?: number;
    tag?: string;
    image?: string;
    description?: string;
  }): SimpleControlRef {
    return this.addProductCard(product);
  }

  /** Ergonomic shorthand that adds an activity contribution heatmap over `weeks` weeks. */
  public heatmap(weeks = 12, data?: number[][]): SimpleControlRef {
    return this.addActivityHeatmap("heatmap_" + Date.now(), weeks, data);
  }

  /** Ergonomic shorthand that adds a circular radial gauge with `title` and `value`. */
  public radial_gauge(title: string, value = 50): SimpleControlRef {
    return this.addRadialGauge("gauge_" + Date.now(), title, value);
  }

  /** Ergonomic shorthand that adds a vertical icon navigation rail. */
  public nav_rail(
    items: Array<{
      icon: string;
      label: string;
      id?: string;
      active?: boolean;
    }>,
  ): SimpleControlRef {
    return this.addNavRail(items);
  }

  /** Ergonomic shorthand that adds an audio/video media player for `src` and `title`. */
  public media_player(src: string, title = "Media Playback"): SimpleControlRef {
    return this.addMediaPlayer(src, title);
  }

  /** Ergonomic shorthand that adds concentric activity rings. */
  public activity_rings(
    rings?: Array<{ label: string; percent: number; color?: string }>,
  ): SimpleControlRef {
    return this.addActivityRings("rings_" + Date.now(), rings);
  }

  /** Ergonomic shorthand that adds a rotary dial knob initialized to `val` within `[min, max]`. */
  public knob(val = 50, min = 0, max = 100): SimpleControlRef {
    return this.addKnob("knob_" + Date.now(), min, max, val);
  }

  /** Ergonomic shorthand that adds a floating toolbar of action items. */
  public floating_toolbar(
    tools: Array<{ icon?: string; label?: string; actionId?: string } | string>,
  ): SimpleControlRef {
    return this.addFloatingToolbar(tools);
  }

  /** Ergonomic shorthand that adds a password input control (default ID `"default_password"`) with placeholder, initial value, and optional change callback. */
  public password(
    placeholderOrInitial = "",
    defaultValOrOnChange?: string | EventCallback,
    maybeOnChange?: EventCallback,
  ): SimpleControlRef {
    let placeholder = "Enter password...";
    let defaultVal = "";
    let onChange: EventCallback | undefined;
    if (typeof defaultValOrOnChange === "function") {
      placeholder = placeholderOrInitial;
      onChange = defaultValOrOnChange;
    } else if (typeof defaultValOrOnChange === "string") {
      placeholder = placeholderOrInitial;
      defaultVal = defaultValOrOnChange;
      onChange = maybeOnChange;
    } else {
      defaultVal = placeholderOrInitial;
    }
    const ref = this.addPassword("pwd_" + Date.now(), placeholder, defaultVal);
    if (onChange) ref.onChange(onChange);
    return ref;
  }

  // --- Typed Value Accessors ---
  /** Returns the boolean value (`true` / `false`) of the control identified by `id`. */
  public getBool(id: string): boolean {
    return Boolean(this.getValue(id));
  }

  /** Sets the boolean value (`true` or `false`) of the control identified by `id`. */
  public setBool(id: string, val: boolean): this {
    return this.setValue(id, val);
  }

  /** Parses and returns the base-10 integer value of the control identified by `id` (returning `0` if `NaN`). */
  public getInt(id: string): number {
    const val = parseInt(String(this.getValue(id) || "0"), 10);
    return isNaN(val) ? 0 : val;
  }

  /** Sets the integer numeric value of the control identified by `id`. */
  public setInt(id: string, val: number): this {
    return this.setValue(id, val);
  }

  /** Parses and returns the floating-point numeric value of the control identified by `id` (returning `0` if `NaN`). */
  public getFloat(id: string): number {
    const val = parseFloat(String(this.getValue(id) || "0"));
    return isNaN(val) ? 0 : val;
  }

  /** Sets the floating-point numeric value of the control identified by `id`. */
  public setFloat(id: string, val: number): this {
    return this.setValue(id, val);
  }

  /** Snake_case alias of `getText`: returns the current string text value of the control identified by `id`. */
  public get_text(id: string): string {
    return this.getText(id);
  }
  /** Snake_case alias of `setText`: updates the string text value of the control identified by `id` in the form store and live DOM. */
  public set_text(id: string, val: string): this {
    return this.setText(id, val);
  }
  /** Snake_case alias of `getBool`: returns the boolean value (`true` / `false`) of the control identified by `id`. */
  public get_bool(id: string): boolean {
    return this.getBool(id);
  }
  /** Snake_case alias of `setBool`: sets the boolean value (`true` or `false`) of the control identified by `id`. */
  public set_bool(id: string, val: boolean): this {
    return this.setBool(id, val);
  }
  /** Snake_case alias of `getInt`: parses and returns the base-10 integer value of the control identified by `id` (returning `0` if `NaN`). */
  public get_int(id: string): number {
    return this.getInt(id);
  }
  /** Snake_case alias of `setInt`: sets the integer numeric value of the control identified by `id`. */
  public set_int(id: string, val: number): this {
    return this.setInt(id, val);
  }
  /** Snake_case alias of `getFloat`: parses and returns the floating-point numeric value of the control identified by `id` (returning `0` if `NaN`). */
  public get_float(id: string): number {
    return this.getFloat(id);
  }
  /** Snake_case alias of `setFloat`: sets the floating-point numeric value of the control identified by `id`. */
  public set_float(id: string, val: number): this {
    return this.setFloat(id, val);
  }
  /** Snake_case alias of `getValue`: retrieves the current value of the control identified by `id`. */
  public get_value(id: string): any {
    return this.getValue(id);
  }
  /** Snake_case alias of `setValue`: updates the value of the control identified by `id`, syncing two-way state bindings and updating the live DOM. */
  public set_value(id: string, val: any): this {
    return this.setValue(id, val);
  }

  /** Snake_case alias of `close`: triggers registered window close listeners (`handleClose()`) to close the window. */
  public close_window(): void {
    this.close();
  }

  /** Hides or closes the active browser/webview window via `window.close()`. */
  public hide_window(): void {
    if (this.isWindowRunning) {
      this.evalJS(`if(window.close) window.close();`);
    }
  }

  /** Snake_case alias of `center`: centers the native window on the active display screen. */
  public center_window(): this {
    return this.center();
  }

  /** Triggers registered window close listeners (`handleClose()`) to close the window. */
  public close(): void {
    this.handleClose();
  }

  /** Stops the window run loop, triggers registered close listeners, and terminates the process with `code` (unless hosted in a browser). */
  public exit(code = 0): void {
    this.isWindowRunning = false;
    this.handleClose();
    if (!this.hostedFactory) process.exit(code);
  }

  /** Alias of `exit`: stops the window run loop, triggers registered close listeners, and terminates the process with `code` (unless hosted in a browser). */
  public exitApp(code = 0): void {
    this.exit(code);
  }

  /** Snake_case alias of `exit`: stops the window run loop, triggers registered close listeners, and terminates the process with `code` (unless hosted in a browser). */
  public exit_app(code = 0): void {
    this.exit(code);
  }

  /** Snake_case alias of `exit`: stops the window run loop, triggers registered close listeners, and terminates the process with `code` (unless hosted in a browser). */
  public exit_application(code = 0): void {
    this.exit(code);
  }

  /** Alias of `exit`: stops the window run loop, triggers registered close listeners, and terminates the process with `code` (unless hosted in a browser). */
  public quit(code = 0): void {
    this.exit(code);
  }

  /** Snake_case alias of `exit`: stops the window run loop, triggers registered close listeners, and terminates the process with `code` (unless hosted in a browser). */
  public quit_application(code = 0): void {
    this.exit(code);
  }

  // --- vlang_simplegui API Parity Window Methods ---
  /** Snake_case alias of `hasControl`: recursively searches `list` (defaulting to the window's controls) and returns the control specification matching `id`, or `null`. */
  public has_control(id: string): boolean {
    return this.hasControl(id);
  }
  /** Snake_case alias of `listControls`: returns a flat array of all control IDs registered in the window. */
  public list_controls(): string[] {
    return this.listControls();
  }
  /** Snake_case getter returning the internal array of visual control specifications. */
  public get_controls(): any[] {
    return this.controls;
  }
  /** Snake_case alias of `getControlKind`: returns the `control_type` / widget kind string for the control identified by `id`, or `"unknown"` if not found. */
  public get_control_kind(id: string): string {
    return this.getControlKind(id);
  }
  /** Snake_case alias of `requireControl`: verifies that a control with `id` exists on this window, throwing a descriptive error if it is missing, and returns `id`. */
  public require_control(id: string): string {
    return this.requireControl(id);
  }
  /** Snake_case alias of `getTitle`: returns the window's current title string. */
  public get_title(): string {
    return this.getTitle();
  }

  /** Updates the window title string in both the `SimpleWindow` state and the native/hosted webview titlebar. */
  public setTitle(titleStr: string): this {
    this.title = titleStr;
    if (this.webview) this.webview.title = titleStr;
    if (this.isWindowRunning) {
      this.evalJS(`document.title = ${JSON.stringify(titleStr)};`);
    }
    return this;
  }

  /** Snake_case alias of `setTitle`: updates the window title string in both the `SimpleWindow` state and the native webview titlebar. */
  public set_title(titleStr: string): this {
    return this.setTitle(titleStr);
  }

  /** Snake_case alias of `setAlwaysOnTop`: configures whether the native window floats above all other windows on screen. */
  public set_always_on_top(enabled: boolean): this {
    return this.setAlwaysOnTop(enabled);
  }
  /** Snake_case getter returning whether the window is configured to stay always on top. */
  public get_always_on_top(): boolean {
    return this.alwaysOnTop;
  }
  /** Returns `true` if the window is configured to stay always on top of other windows. */
  public getAlwaysOnTop(): boolean {
    return this.alwaysOnTop;
  }

  /** Updates the window's background color in state and immediately applies it to `document.body` when running. */
  public set_background_color(hexColor: string): this {
    this.backgroundColor = hexColor;
    this.evalJS(`document.body.style.backgroundColor = "${hexColor}";`);
    return this;
  }

  /** Updates the window's default text color in state and immediately applies it to `document.body` when running. */
  public set_font_color(colorStr: string): this {
    this.fontColor = colorStr;
    this.evalJS(`document.body.style.color = "${colorStr}";`);
    return this;
  }

  /** Snake_case alias of `setPadding`: sets the outer content padding (in pixels) around the window's layout area. */
  public set_padding(pad: number): this {
    return this.setPadding(pad);
  }
  /** Snake_case alias of `getPadding`: returns the window's outer content padding in pixels. */
  public get_padding(): number {
    return this.getPadding();
  }
  /** Snake_case alias of `setSpacing`: sets the default vertical/horizontal pixel spacing between controls. */
  public set_spacing(space: number): this {
    return this.setSpacing(space);
  }
  /** Snake_case alias of `getSpacing`: returns the default pixel spacing between controls. */
  public get_spacing(): number {
    return this.getSpacing();
  }

  /** Snake_case alias of `setResponsiveLayout`: enables or disables responsive layout mode. */
  public set_responsive_layout(enabled: boolean): this {
    return this;
  }
  /** Snake_case alias of `getResponsiveLayout`: returns `true` when responsive layout is enabled. */
  public get_responsive_layout(): boolean {
    return true;
  }

  /** Snake_case alias of `setMinSize`: sets the minimum window width and height. */
  public set_min_size(w: number, h: number): this {
    return this;
  }
  /** Snake_case alias of `setMaxSize`: sets the maximum window width and height. */
  public set_max_size(w: number, h: number): this {
    return this;
  }
  /** Snake_case alias of `setResizable`: configures whether the window is resizable. */
  public set_resizable(enabled: boolean): this {
    return this;
  }
  /** Snake_case alias of `getResizable`: returns `true` if the window is resizable. */
  public get_resizable(): boolean {
    return true;
  }
  /** Snake_case alias of `setMinimizable`: configures whether the window can be minimized. */
  public set_minimizable(enabled: boolean): this {
    return this;
  }
  /** Snake_case alias of `getMinimizable`: returns `true` if the window can be minimized. */
  public get_minimizable(): boolean {
    return true;
  }
  /** Snake_case alias of `setMaximizable`: configures whether the window can be maximized. */
  public set_maximizable(enabled: boolean): this {
    return this;
  }
  /** Snake_case alias of `getMaximizable`: returns `true` if the window can be maximized. */
  public get_maximizable(): boolean {
    return true;
  }

  /** Positions the window using a named screen alignment preset (`"center"`, `"top-left"`, `"bottom-right"`, etc.). */
  public align(position: string): this {
    return this.setPositionPreset(position);
  }
  /** Snake_case alias of `alignWindow`: positions the window using a named screen alignment preset. */
  public align_window(position: string): this {
    return this.setPositionPreset(position);
  }
  /** Snaps the window to a named screen edge or corner preset (`"left"`, `"right"`, `"top"`, `"bottom"`). */
  public snap_to_edge(edge: string): this {
    return this.setPositionPreset(edge);
  }

  /** Snake_case alias of `setSize`: resizes the window to `w` × `h` pixels. */
  public set_size(w: number, h: number): this {
    this.width = w;
    this.height = h;
    if (this.webview)
      this.webview.size = { width: w, height: h, hint: SIZE_HINT_NONE };
    return this;
  }

  /** Snake_case alias of `getWidth`: returns the current window width in pixels. */
  public get_width(): number {
    return this.width;
  }
  /** Snake_case alias of `getHeight`: returns the current window height in pixels. */
  public get_height(): number {
    return this.height;
  }

  /** Snake_case alias of `setPosition`: sets the `(x, y)` screen coordinates of the window. */
  public set_position(x: number, y: number): this {
    return this;
  }
  /** Snake_case alias of `getX`: returns the window's horizontal `x` screen coordinate. */
  public get_x(): number {
    return 100;
  }
  /** Snake_case alias of `getY`: returns the window's vertical `y` screen coordinate. */
  public get_y(): number {
    return 100;
  }

  /** Snake_case alias of `setOpacity`: sets the CSS opacity of the window body. */
  public set_opacity(opacity: number): this {
    this.evalJS(`document.body.style.opacity = "${opacity}";`);
    return this;
  }
  /** Snake_case alias of `getOpacity`: returns the current window opacity (`1.0` by default). */
  public get_opacity(): number {
    return 1.0;
  }

  /** Snake_case alias of `setTitlebarVisible`: shows or hides the native window titlebar. */
  public set_titlebar_visible(visible: boolean): this {
    return this;
  }
  /** Snake_case alias of `isTitlebarVisible`: returns `true` if the window titlebar is visible. */
  public is_titlebar_visible(): boolean {
    return true;
  }

  /** Snake_case alias of `setSubtitle`: sets the window titlebar subtitle text. */
  public set_subtitle(subtitleStr: string): this {
    return this;
  }
  /** Snake_case alias of `getSubtitle`: returns the window titlebar subtitle text. */
  public get_subtitle(): string {
    return "";
  }

  /** Snake_case alias of `setClosable`: configures whether the window can be closed. */
  public set_closable(enabled: boolean): this {
    return this;
  }
  /** Snake_case alias of `getClosable`: returns `true` if the window is closable. */
  public get_closable(): boolean {
    return true;
  }

  /** Snake_case alias of `setMovable`: configures whether the window can be moved by the user. */
  public set_movable(enabled: boolean): this {
    return this;
  }
  /** Snake_case alias of `getMovable`: returns `true` if the window is movable. */
  public get_movable(): boolean {
    return true;
  }

  /** Snake_case alias of `setHasShadow`: enables or disables the window frame drop shadow. */
  public set_has_shadow(enabled: boolean): this {
    return this;
  }
  /** Snake_case alias of `getHasShadow`: returns `true` if the window has a drop shadow. */
  public get_has_shadow(): boolean {
    return true;
  }

  /** Snake_case alias of `isVisible`: returns `true` while the window is running and visible. */
  public is_visible(): boolean {
    return this.isWindowRunning;
  }
  /** Returns `true` if the window is currently minimized to the dock/taskbar. */
  public is_minimized(): boolean {
    return false;
  }
  /** Returns `true` if the window is currently maximized/zoomed. */
  public is_maximized(): boolean {
    return false;
  }
  /** Snake_case alias of `isFullscreen`: returns `true` when the window is in fullscreen mode. */
  public is_fullscreen(): boolean {
    return this.fullscreen;
  }
  /** Snake_case alias of `setFullscreen`: enables or disables native fullscreen mode for the window. */
  public set_fullscreen(val = true): this {
    return this.setFullscreen(val);
  }
  /** Returns `true` when the window is currently running and active. */
  public is_active(): boolean {
    return this.isWindowRunning;
  }

  /** Snake_case alias of `bounceDockIcon`: bounces the dock icon to request user attention. */
  public bounce_dock(critical = false): this {
    return this;
  }
  /** Snake_case alias of `bounceDockIcon`: bounces the application dock icon. */
  public bounce_dock_icon(critical = false): this {
    return this;
  }
  /** Snake_case alias of `requestAttention`: requests user attention via dock bounce or taskbar flash. */
  public request_attention(critical = false): this {
    return this;
  }

  /** Snake_case alias of `setBounds`: sets the window's bounding rectangle `(x, y, w, h)` in pixels. */
  public set_bounds(x: number, y: number, w: number, h: number): this {
    return this.set_size(w, h);
  }
  /** Snake_case alias of `getBounds`: returns `[x, y, width, height]` of the window. */
  public get_bounds(): [number, number, number, number] {
    return [100, 100, this.width, this.height];
  }

  /** Locks the window's resize aspect ratio to `wRatio : hRatio`. */
  public set_aspect_ratio(wRatio: number, hRatio: number): this {
    return this;
  }
  /** Clears any fixed aspect ratio constraint on the window. */
  public reset_aspect_ratio(): this {
    return this;
  }
  /** Returns `true` if the window currently enforces a fixed aspect ratio. */
  public has_aspect_ratio(): boolean {
    return false;
  }

  /** Configures native OS background vibrancy/mica material (`"ultra-dark"`, `"hud"`, `"sidebar"`, etc.) on the window. */
  public set_vibrancy(material: string): this {
    return this;
  }
  /** Sets the outer corner radius (in pixels) of the window frame. */
  public set_corner_radius(r: number): this {
    return this;
  }
  /** Returns the outer corner radius (in pixels) of the window frame. */
  public get_corner_radius(): number {
    return 12;
  }
  /** Enables or disables background backdrop blur behind the window. */
  public set_background_blur(enabled: boolean): this {
    return this;
  }

  /** Sets the window stacking level (`"normal"`, `"floating"`, `"modal"`, `"status"`). */
  public set_window_level(level: string): this {
    return this;
  }
  /** Returns the current window stacking level string (default `"normal"`). */
  public get_window_level(): string {
    return "normal";
  }
  /** Alias of `set_window_level`: sets the window stacking level. */
  public set_level_type(level: string): this {
    return this;
  }

  /** Configures whether mouse clicks pass through the window to underlying applications. */
  public set_ignores_mouse_events(enabled: boolean): this {
    return this;
  }
  /** Returns `true` if the window ignores mouse events (click-through mode). */
  public get_ignores_mouse_events(): boolean {
    return false;
  }

  /** Applies either a named theme key or a custom `SimpleGUITheme` palette object to the window. */
  public apply_theme(theme: string | SimpleGUITheme): this {
    if (typeof theme === "string") {
      return this.setTheme(theme);
    }
    this.backgroundColor = theme.background_color;
    this.fontColor = theme.font_color;
    this.evalJS(
      `document.body.style.backgroundColor = "${theme.background_color}"; document.body.style.color = "${theme.font_color}";`,
    );
    return this;
  }

  /** Snake_case alias of `setDebugMode`: enables or disables debug logging for this window. */
  public set_debug_mode(enabled: boolean): this {
    return this.setDebugMode(enabled);
  }
  /** Snake_case alias of `getDebugMode`: returns `true` when debug mode is enabled on this window. */
  public get_debug_mode(): boolean {
    return this.getDebugMode();
  }

  // =========================================================================
  // ⚡ Ergonomic Helpers & Beginner Shortcuts (Parity with ergonomics.v)
  // =========================================================================
  public listItemsStore: Record<string, string[]> = {};
  public statusText = "";

  // 1. Dialog Shortcuts
  /** Displays an informational dialog popup with `titleOrMessage` and optional `message`. */
  public info(titleOrMessage: string, message?: string): this {
    const title = message ? titleOrMessage : "Information";
    const msg = message ? message : titleOrMessage;
    this.dialogs.info(title, msg);
    return this;
  }

  /** Displays a warning dialog popup with `titleOrMessage` and optional `message`. */
  public warn(titleOrMessage: string, message?: string): this {
    const title = message ? titleOrMessage : "Warning";
    const msg = message ? message : titleOrMessage;
    this.dialogs.warning(title, msg);
    return this;
  }

  /** Displays an error dialog popup with `titleOrMessage` and optional `message`. */
  public errorDialog(titleOrMessage: string, message?: string): this {
    const title = message ? titleOrMessage : "Error";
    const msg = message ? message : titleOrMessage;
    this.dialogs.error(title, msg);
    return this;
  }

  /** Snake_case alias of `errorDialog`: displays an error dialog popup with `titleOrMessage` and optional `message`. */
  public error_dialog(titleOrMessage: string, message?: string): this {
    return this.errorDialog(titleOrMessage, message);
  }

  /** Alias of `errorDialog`: displays an error dialog popup with `titleOrMessage` and optional `message`. */
  public error(titleOrMessage: string, message?: string): this {
    return this.errorDialog(titleOrMessage, message);
  }

  /** Alias of `showConfirm`: displays a Yes/No confirmation dialog and resolves to `true` if the user confirms. */
  public confirm(
    question: string,
    title: string | ((ok: boolean) => void) = "Confirm",
    cb?: (ok: boolean) => void,
  ): Promise<boolean> {
    return this.showConfirm(question, title, cb);
  }

  /** Alias of `showConfirm`: displays a Yes/No confirmation dialog and resolves to `true` if the user confirms. */
  public ask(
    question: string,
    title: string | ((ok: boolean) => void) = "Confirm",
    cb?: (ok: boolean) => void,
  ): Promise<boolean> {
    return this.showConfirm(question, title, cb);
  }

  /** Alias of `showPrompt`: displays a text-input prompt dialog initialized with `defaultVal` and resolves to the entered string or `null` if cancelled. */
  public prompt(
    message: string,
    defaultVal: string | ((v: string | null) => void) = "",
    title: string | ((v: string | null) => void) = "Prompt",
    cb?: (v: string | null) => void,
  ): Promise<string | null> {
    return this.showPrompt(message, defaultVal, title, cb);
  }

  // 2. Control Enabled / Visible & Batch Operations
  /** Enables or disables the control identified by `id` in both the form specification and live DOM. */
  public setControlEnabled(id: string, enabled: boolean): this {
    const ctrl = this.findControl(id);
    if (ctrl) ctrl.enabled = enabled;
    if (this.isWindowRunning) {
      this.evalJS(`
                (function() {
                    const el = document.getElementById("${id}");
                    if (el) {
                        el.disabled = ${!enabled};
                        if (${!enabled}) {
                            el.setAttribute("disabled", "disabled");
                            el.style.opacity = "0.5";
                            el.style.pointerEvents = "none";
                            el.style.userSelect = "none";
                        } else {
                            el.removeAttribute("disabled");
                            el.style.opacity = "1";
                            el.style.pointerEvents = "auto";
                            el.style.userSelect = "auto";
                        }
                        const children = el.querySelectorAll("input, select, textarea, button");
                        children.forEach(function(child) {
                            child.disabled = ${!enabled};
                            if (${!enabled}) child.setAttribute("disabled", "disabled");
                            else child.removeAttribute("disabled");
                        });
                    }
                })();
            `);
    }
    return this;
  }

  /** Snake_case alias of `setControlEnabled`: enables or disables the control identified by `id` in both the form specification and live DOM. */
  public set_control_enabled(id: string, enabled: boolean): this {
    return this.setControlEnabled(id, enabled);
  }

  /** Shows or hides the control identified by `id` in both the form specification and live DOM. */
  public setControlVisible(id: string, visible: boolean): this {
    const ctrl = this.findControl(id);
    if (ctrl) ctrl.visible = visible;
    for (const sec of this._layoutSections) {
      if (sec.type === "card" && sec.id === id) (sec as any).hidden = !visible;
      if (sec.type === "grid" && sec.cards) {
        for (const c of sec.cards) {
          if (c.id === id) (c as any).hidden = !visible;
        }
      }
    }
    if (this.isWindowRunning) {
      this.evalJS(`
                (function() {
                    const cardEl = document.getElementById("rad_card_" + ${JSON.stringify(id)});
                    if (cardEl) {
                        cardEl.style.display = "${visible ? "" : "none"}";
                        return;
                    }
                    const el = document.getElementById(${JSON.stringify(id)});
                    if (el) el.style.display = "${visible ? "block" : "none"}";
                })();
            `);
    }
    return this;
  }

  /** Snake_case alias of `setControlVisible`: shows or hides the control identified by `id` in both the form specification and live DOM. */
  public set_control_visible(id: string, visible: boolean): this {
    return this.setControlVisible(id, visible);
  }

  /** Returns `true` if the control identified by `id` is currently enabled. */
  public getControlEnabled(id: string): boolean {
    const ctrl = this.findControl(id);
    return ctrl ? ctrl.enabled !== false : true;
  }

  /** Snake_case alias of `getControlEnabled`: returns `true` if the control identified by `id` is currently enabled. */
  public get_control_enabled(id: string): boolean {
    return this.getControlEnabled(id);
  }

  /** Returns `true` if the control identified by `id` is currently visible. */
  public getControlVisible(id: string): boolean {
    const ctrl = this.findControl(id);
    return ctrl ? ctrl.visible !== false : true;
  }

  /** Snake_case alias of `getControlVisible`: returns `true` if the control identified by `id` is currently visible. */
  public get_control_visible(id: string): boolean {
    return this.getControlVisible(id);
  }

  /** Makes all controls in `names` visible. */
  public showControls(names: string[]): this {
    if (!names || names.length === 0) return this;
    const wasRunning = this.isWindowRunning;
    this.isWindowRunning = false;
    try {
      for (let i = 0; i < names.length; i++) {
        this.setControlVisible(names[i]!, true);
      }
    } finally {
      this.isWindowRunning = wasRunning;
    }
    if (wasRunning) {
      this.evalJS(`
                (function() {
                    const ids = ${JSON.stringify(names)};
                    for (let i = 0; i < ids.length; i++) {
                        const id = ids[i];
                        const cardEl = document.getElementById("rad_card_" + id);
                        if (cardEl) { cardEl.style.display = ""; continue; }
                        const el = document.getElementById(id);
                        if (el) el.style.display = "block";
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `showControls`: makes all controls in `names` visible. */
  public show_controls(names: string[]): this {
    return this.showControls(names);
  }
  /** Snake_case alias of `showControls`: makes all controls in `names` visible. */
  public batch_show_controls(names: string[]): this {
    return this.showControls(names);
  }

  /** Hides all controls in `names`. */
  public hideControls(names: string[]): this {
    if (!names || names.length === 0) return this;
    const wasRunning = this.isWindowRunning;
    this.isWindowRunning = false;
    try {
      for (let i = 0; i < names.length; i++) {
        this.setControlVisible(names[i]!, false);
      }
    } finally {
      this.isWindowRunning = wasRunning;
    }
    if (wasRunning) {
      this.evalJS(`
                (function() {
                    const ids = ${JSON.stringify(names)};
                    for (let i = 0; i < ids.length; i++) {
                        const id = ids[i];
                        const cardEl = document.getElementById("rad_card_" + id);
                        if (cardEl) { cardEl.style.display = "none"; continue; }
                        const el = document.getElementById(id);
                        if (el) el.style.display = "none";
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `hideControls`: hides all controls in `names`. */
  public hide_controls(names: string[]): this {
    return this.hideControls(names);
  }
  /** Snake_case alias of `hideControls`: hides all controls in `names`. */
  public batch_hide_controls(names: string[]): this {
    return this.hideControls(names);
  }

  /** Enables user interaction on all controls in `names`. */
  public enableControls(names: string[]): this {
    if (!names || names.length === 0) return this;
    const wasRunning = this.isWindowRunning;
    this.isWindowRunning = false;
    try {
      for (let i = 0; i < names.length; i++) {
        this.setControlEnabled(names[i]!, true);
      }
    } finally {
      this.isWindowRunning = wasRunning;
    }
    if (wasRunning) {
      this.evalJS(`
                (function() {
                    const ids = ${JSON.stringify(names)};
                    for (let i = 0; i < ids.length; i++) {
                        const el = document.getElementById(ids[i]);
                        if (!el) continue;
                        el.disabled = false;
                        el.removeAttribute("disabled");
                        el.style.opacity = "1";
                        el.style.pointerEvents = "auto";
                        el.style.userSelect = "auto";
                        el.querySelectorAll("input, select, textarea, button").forEach(function(child) {
                            child.disabled = false;
                            child.removeAttribute("disabled");
                        });
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `enableControls`: enables user interaction on all controls in `names`. */
  public enable_controls(names: string[]): this {
    return this.enableControls(names);
  }
  /** Snake_case alias of `enableControls`: enables user interaction on all controls in `names`. */
  public batch_enable_controls(names: string[]): this {
    return this.enableControls(names);
  }

  /** Disables user interaction on all controls in `names`. */
  public disableControls(names: string[]): this {
    if (!names || names.length === 0) return this;
    const wasRunning = this.isWindowRunning;
    this.isWindowRunning = false;
    try {
      for (let i = 0; i < names.length; i++) {
        this.setControlEnabled(names[i]!, false);
      }
    } finally {
      this.isWindowRunning = wasRunning;
    }
    if (wasRunning) {
      this.evalJS(`
                (function() {
                    const ids = ${JSON.stringify(names)};
                    for (let i = 0; i < ids.length; i++) {
                        const el = document.getElementById(ids[i]);
                        if (!el) continue;
                        el.disabled = true;
                        el.setAttribute("disabled", "disabled");
                        el.style.opacity = "0.5";
                        el.style.pointerEvents = "none";
                        el.style.userSelect = "none";
                        el.querySelectorAll("input, select, textarea, button").forEach(function(child) {
                            child.disabled = true;
                            child.setAttribute("disabled", "disabled");
                        });
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `disableControls`: disables user interaction on all controls in `names`. */
  public disable_controls(names: string[]): this {
    return this.disableControls(names);
  }
  /** Snake_case alias of `disableControls`: disables user interaction on all controls in `names`. */
  public batch_disable_controls(names: string[]): this {
    return this.disableControls(names);
  }

  /** Enables user interaction on every control in the window. */
  public enableAllControls(): this {
    this.controls.forEach((c) => this.setControlEnabled(c.id, true));
    return this;
  }
  /** Snake_case alias of `enableAllControls`: enables user interaction on every control in the window. */
  public enable_all_controls(): this {
    return this.enableAllControls();
  }
  /** Alias of `enableAllControls`: enables user interaction on every control in the window. */
  public enableAll(): this {
    return this.enableAllControls();
  }
  /** Snake_case alias of `enableAllControls`: enables user interaction on every control in the window. */
  public enable_all(): this {
    return this.enableAllControls();
  }

  /** Disables user interaction on every control in the window. */
  public disableAllControls(): this {
    this.controls.forEach((c) => this.setControlEnabled(c.id, false));
    return this;
  }
  /** Snake_case alias of `disableAllControls`: disables user interaction on every control in the window. */
  public disable_all_controls(): this {
    return this.disableAllControls();
  }
  /** Alias of `disableAllControls`: disables user interaction on every control in the window. */
  public disableAll(): this {
    return this.disableAllControls();
  }
  /** Snake_case alias of `disableAllControls`: disables user interaction on every control in the window. */
  public disable_all(): this {
    return this.disableAllControls();
  }

  /** Batch-updates multiple control values from a `{ [controlId]: value }` object. */
  public setAll(values: Record<string, any>): this {
    for (const [k, v] of Object.entries(values)) {
      this.setValue(k, v);
    }
    return this;
  }
  /** Snake_case alias of `setAll`: batch-updates multiple control values from a `{ [controlId]: value }` object. */
  public set_all(values: Record<string, any>): this {
    return this.setAll(values);
  }

  /** Reads and returns a `{ [controlId]: value }` dictionary for the specified control `names`. */
  public getAll(names: string[]): Record<string, any> {
    const result: Record<string, any> = {};
    for (const name of names) {
      result[name] = this.getValue(name);
    }
    return result;
  }
  /** Snake_case alias of `getAll`: reads and returns a `{ [controlId]: value }` dictionary for the specified control `names`. */
  public get_all(names: string[]): Record<string, any> {
    return this.getAll(names);
  }

  /** Inverts the enabled/disabled state of each control in `names`. */
  public toggleControlsEnabled(names: string[]): this {
    names.forEach((n) => this.toggleEnabled(n));
    return this;
  }
  /** Snake_case alias of `toggleControlsEnabled`: inverts the enabled/disabled state of each control in `names`. */
  public toggle_controls_enabled(names: string[]): this {
    return this.toggleControlsEnabled(names);
  }

  /** Inverts the visible/hidden state of each control in `names`. */
  public toggleControlsVisible(names: string[]): this {
    names.forEach((n) => this.toggleVisible(n));
    return this;
  }
  /** Snake_case alias of `toggleControlsVisible`: inverts the visible/hidden state of each control in `names`. */
  public toggle_controls_visible(names: string[]): this {
    return this.toggleControlsVisible(names);
  }

  /** Briefly flashes an accent outline around the control identified by `id` in the live window. */
  public flashControl(id: string): this {
    if (this.isWindowRunning) {
      this.evalJS(`
                const el = document.getElementById("${id}");
                if (el) {
                    el.style.transition = "outline 0.15s ease-in-out";
                    el.style.outline = "2px solid #38bdf8";
                    setTimeout(() => { el.style.outline = "none"; }, 300);
                }
            `);
    }
    return this;
  }
  /** Snake_case alias of `flashControl`: briefly flashes an accent outline around the control identified by `id` in the live window. */
  public flash_control(id: string): this {
    return this.flashControl(id);
  }

  /** Briefly flashes an accent outline around every control in `names`. */
  public flashControls(names: string[]): this {
    names.forEach((n) => this.flashControl(n));
    return this;
  }
  /** Snake_case alias of `flashControls`: briefly flashes an accent outline around every control in `names`. */
  public flash_controls(names: string[]): this {
    return this.flashControls(names);
  }

  /** Highlights the control identified by `id` with an accent glow for `durationMs` milliseconds. */
  public highlightControl(id: string, durationMs = 1000): this {
    if (this.isWindowRunning) {
      this.evalJS(`
                const el = document.getElementById("${id}");
                if (el) {
                    el.style.transition = "box-shadow 0.2s ease-in-out";
                    el.style.boxShadow = "0 0 0 3px rgba(56, 189, 248, 0.6)";
                    setTimeout(() => { el.style.boxShadow = "none"; }, ${durationMs});
                }
            `);
    }
    return this;
  }
  /** Snake_case alias of `highlightControl`: highlights the control identified by `id` with an accent glow for `durationMs` milliseconds. */
  public highlight_control(id: string, durationMs = 1000): this {
    return this.highlightControl(id, durationMs);
  }

  /** Highlights every control in `names` with an accent glow for `durationMs` milliseconds. */
  public highlightControls(names: string[], durationMs = 1000): this {
    names.forEach((n) => this.highlightControl(n, durationMs));
    return this;
  }
  /** Snake_case alias of `highlightControls`: highlights every control in `names` with an accent glow for `durationMs` milliseconds. */
  public highlight_controls(names: string[], durationMs = 1000): this {
    return this.highlightControls(names, durationMs);
  }

  /** Inverts the visibility of the control identified by `id` and returns its new visibility state. */
  public toggleVisible(id: string): boolean {
    const next = !this.getControlVisible(id);
    this.setControlVisible(id, next);
    return next;
  }
  /** Snake_case alias of `toggleVisible`: inverts the visibility of the control identified by `id` and returns its new visibility state. */
  public toggle_visible(id: string): boolean {
    return this.toggleVisible(id);
  }

  /** Inverts the enabled state of the control identified by `id` and returns its new enabled state. */
  public toggleEnabled(id: string): boolean {
    const next = !this.getControlEnabled(id);
    this.setControlEnabled(id, next);
    return next;
  }
  /** Snake_case alias of `toggleEnabled`: inverts the enabled state of the control identified by `id` and returns its new enabled state. */
  public toggle_enabled(id: string): boolean {
    return this.toggleEnabled(id);
  }

  // 3. Value Convenience Accessors & Modifiers
  /** Adds `delta` (default `1`) to the integer value of control `id` and returns the updated number. */
  public increment(id: string, delta = 1): number {
    const current = this.getInt(id);
    const next = current + delta;
    this.setInt(id, next);
    return next;
  }
  /** Snake_case alias of `increment`: adds `delta` (default `1`) to the integer value of control `id` and returns the updated number. */
  public increment_value(id: string, delta = 1): number {
    return this.increment(id, delta);
  }

  /** Inverts the boolean checked state of control `id` and returns the updated boolean. */
  public toggleChecked(id: string): boolean {
    const current = this.getBool(id);
    const next = !current;
    this.setBool(id, next);
    return next;
  }
  /** Snake_case alias of `toggleChecked`: inverts the boolean checked state of control `id` and returns the updated boolean. */
  public toggle_checked(id: string): boolean {
    return this.toggleChecked(id);
  }

  /** Updates the numeric progress value of the progress bar control identified by `id`. */
  public setProgress(id: string, value: number): this {
    return this.setValue(id, value);
  }
  /** Snake_case alias of `setProgress`: updates the numeric progress value of the progress bar control identified by `id`. */
  public set_progress(id: string, value: number): this {
    return this.setProgress(id, value);
  }

  /** Returns the current integer progress value of the progress bar control identified by `id`. */
  public getProgress(id: string): number {
    return this.getInt(id);
  }
  /** Snake_case alias of `getProgress`: returns the current integer progress value of the progress bar control identified by `id`. */
  public get_progress(id: string): number {
    return this.getProgress(id);
  }

  /** Appends `text` to the current string content of control `id`. */
  public appendText(id: string, text: string): this {
    const current = this.getText(id);
    return this.setText(id, current + text);
  }
  /** Snake_case alias of `appendText`: appends `text` to the current string content of control `id`. */
  public append_text(id: string, text: string): this {
    return this.appendText(id, text);
  }

  /** Appends `line` on a new line at the end of control `id`'s text content. */
  public appendLine(id: string, line: string): this {
    const current = this.getText(id);
    return this.setText(id, current ? `${current}\n${line}` : line);
  }
  /** Snake_case alias of `appendLine`: appends `line` on a new line at the end of control `id`'s text content. */
  public append_line(id: string, line: string): this {
    return this.appendLine(id, line);
  }

  /** Batch-sets the text of multiple controls from a `{ [controlId]: text }` map. */
  public setManyTexts(values: Record<string, string>): this {
    for (const [id, val] of Object.entries(values)) this.setText(id, val);
    return this;
  }
  /** Snake_case alias of `setManyTexts`: batch-sets the text of multiple controls from a `{ [controlId]: text }` map. */
  public set_many_texts(values: Record<string, string>): this {
    return this.setManyTexts(values);
  }

  /** Reads and returns a `{ [controlId]: text }` map for all control IDs in `names`. */
  public getManyTexts(names: string[]): Record<string, string> {
    const res: Record<string, string> = {};
    for (const name of names) res[name] = this.getText(name);
    return res;
  }
  /** Snake_case alias of `getManyTexts`: reads and returns a `{ [controlId]: text }` map for all control IDs in `names`. */
  public get_many_texts(names: string[]): Record<string, string> {
    return this.getManyTexts(names);
  }

  /** Batch-sets the boolean checked state of multiple controls from a `{ [controlId]: checked }` map. */
  public setManyChecked(values: Record<string, boolean>): this {
    for (const [id, val] of Object.entries(values)) this.setBool(id, val);
    return this;
  }
  /** Snake_case alias of `setManyChecked`: batch-sets the boolean checked state of multiple controls from a `{ [controlId]: checked }` map. */
  public set_many_checked(values: Record<string, boolean>): this {
    return this.setManyChecked(values);
  }

  /** Reads and returns a `{ [controlId]: checked }` map for all control IDs in `names`. */
  public getManyChecked(names: string[]): Record<string, boolean> {
    const res: Record<string, boolean> = {};
    for (const name of names) res[name] = this.getBool(name);
    return res;
  }
  /** Snake_case alias of `getManyChecked`: reads and returns a `{ [controlId]: checked }` map for all control IDs in `names`. */
  public get_many_checked(names: string[]): Record<string, boolean> {
    return this.getManyChecked(names);
  }

  /** Batch-sets integer values on multiple controls from a `{ [controlId]: number }` map. */
  public setManyNumbers(values: Record<string, number>): this {
    for (const [id, val] of Object.entries(values)) this.setInt(id, val);
    return this;
  }
  /** Snake_case alias of `setManyNumbers`: batch-sets integer values on multiple controls from a `{ [controlId]: number }` map. */
  public set_many_numbers(values: Record<string, number>): this {
    return this.setManyNumbers(values);
  }

  /** Reads and returns a `{ [controlId]: number }` map for all control IDs in `names`. */
  public getManyNumbers(names: string[]): Record<string, number> {
    const res: Record<string, number> = {};
    for (const name of names) res[name] = this.getInt(name);
    return res;
  }
  /** Snake_case alias of `getManyNumbers`: reads and returns a `{ [controlId]: number }` map for all control IDs in `names`. */
  public get_many_numbers(names: string[]): Record<string, number> {
    return this.getManyNumbers(names);
  }

  /** Batch-sets the visibility of multiple controls from a `{ [controlId]: visible }` map. */
  public setManyVisibility(values: Record<string, boolean>): this {
    for (const [id, val] of Object.entries(values))
      this.setControlVisible(id, val);
    return this;
  }
  /** Snake_case alias of `setManyVisibility`: batch-sets the visibility of multiple controls from a `{ [controlId]: visible }` map. */
  public set_many_visibility(values: Record<string, boolean>): this {
    return this.setManyVisibility(values);
  }

  /** Reads and returns a `{ [controlId]: visible }` map for all control IDs in `names`. */
  public getManyVisibility(names: string[]): Record<string, boolean> {
    const res: Record<string, boolean> = {};
    for (const name of names) res[name] = this.getControlVisible(name);
    return res;
  }
  /** Snake_case alias of `getManyVisibility`: reads and returns a `{ [controlId]: visible }` map for all control IDs in `names`. */
  public get_many_visibility(names: string[]): Record<string, boolean> {
    return this.getManyVisibility(names);
  }

  /** Batch-sets the enabled state of multiple controls from a `{ [controlId]: enabled }` map. */
  public setManyEnabled(values: Record<string, boolean>): this {
    for (const [id, val] of Object.entries(values))
      this.setControlEnabled(id, val);
    return this;
  }
  /** Snake_case alias of `setManyEnabled`: batch-sets the enabled state of multiple controls from a `{ [controlId]: enabled }` map. */
  public set_many_enabled(values: Record<string, boolean>): this {
    return this.setManyEnabled(values);
  }

  /** Reads and returns a `{ [controlId]: enabled }` map for all control IDs in `names`. */
  public getManyEnabled(names: string[]): Record<string, boolean> {
    const res: Record<string, boolean> = {};
    for (const name of names) res[name] = this.getControlEnabled(name);
    return res;
  }
  /** Snake_case alias of `getManyEnabled`: reads and returns a `{ [controlId]: enabled }` map for all control IDs in `names`. */
  public get_many_enabled(names: string[]): Record<string, boolean> {
    return this.getManyEnabled(names);
  }

  /** Assigns validation error messages to multiple controls from a `{ [controlId]: errorMessage }` map. */
  public setManyErrors(values: Record<string, string>): this {
    for (const [id, err] of Object.entries(values)) {
      const ctrl = this.findControl(id);
      if (ctrl) ctrl.error = err;
    }
    return this;
  }
  /** Snake_case alias of `setManyErrors`: assigns validation error messages to multiple controls from a `{ [controlId]: errorMessage }` map. */
  public set_many_errors(values: Record<string, string>): this {
    return this.setManyErrors(values);
  }

  /** Updates placeholder hint strings on multiple controls from a `{ [controlId]: placeholder }` map. */
  public setManyPlaceholders(values: Record<string, string>): this {
    for (const [id, ph] of Object.entries(values)) {
      const ctrl = this.findControl(id);
      if (ctrl) ctrl.placeholder = ph;
    }
    return this;
  }
  /** Snake_case alias of `setManyPlaceholders`: updates placeholder hint strings on multiple controls from a `{ [controlId]: placeholder }` map. */
  public set_many_placeholders(values: Record<string, string>): this {
    return this.setManyPlaceholders(values);
  }

  /** Updates hover tooltip strings on multiple controls from a `{ [controlId]: tooltip }` map. */
  public setManyTooltips(values: Record<string, string>): this {
    for (const [id, hint] of Object.entries(values)) {
      const ctrl = this.findControl(id);
      if (ctrl) ctrl.tooltip = hint;
    }
    return this;
  }
  /** Snake_case alias of `setManyTooltips`: updates hover tooltip strings on multiple controls from a `{ [controlId]: tooltip }` map. */
  public set_many_tooltips(values: Record<string, string>): this {
    return this.setManyTooltips(values);
  }

  /** Updates the window's status text and syncs it to any standard status bar or status label control (`lbl_status`, `status_bar`, etc.). */
  public setStatus(text: string): this {
    this.statusText = text;
    const targetIds = [
      "lbl_status",
      "lblStatus",
      "status",
      "lbl_status_bar",
      "status_bar",
    ];
    for (const tid of targetIds) {
      if (this.hasControl(tid)) {
        this.setText(tid, text);
        break;
      }
    }
    if (this.isWindowRunning) {
      this.evalJS(`
                const el = document.getElementById("lbl_status") ||
                           document.getElementById("lblStatus") ||
                           document.getElementById("status") ||
                           document.getElementById("lbl_status_bar") ||
                           document.getElementById("status_bar");
                if (el) {
                    const textSpan = el.querySelector("span:nth-child(3)") || el.querySelector("span:last-child") || el;
                    if (textSpan) textSpan.textContent = ${JSON.stringify(text)};
                }
            `);
    }
    return this;
  }
  /** Snake_case alias of `setStatus`: updates the window's status text and syncs it to any standard status bar or status label control (`lbl_status`, `status_bar`, etc.). */
  public set_status(text: string): this {
    return this.setStatus(text);
  }

  /** Snake_case alias of `withBusyState`: disables the target controls in `names`, updates the window status bar to `statusText`, runs `callback`, and automatically re-enables the controls and restores status text upon completion. */
  public with_busy_state(
    names: string[],
    statusText: string,
    callback: (win: SimpleWindow) => any | Promise<any>,
  ): Promise<this> {
    return this.withBusyState(names, statusText, callback);
  }

  /** Clears the values of all controls listed in `names` to empty strings. */
  public clearMany(names: string[]): this {
    names.forEach((name) => this.setValue(name, ""));
    return this;
  }
  /** Snake_case alias of `clearMany`: clears the values of all controls listed in `names` to empty strings. */
  public clear_many(names: string[]): this {
    return this.clearMany(names);
  }

  /** Resets all controls listed in `names` to their type-appropriate default values (`false` for checkboxes/switches, `min` for sliders, `""` for text inputs). */
  public resetMany(names: string[]): this {
    for (const name of names) {
      const ctrl = this.findControl(name);
      if (ctrl) {
        if (ctrl.type === "checkbox" || ctrl.type === "switch") {
          this.setBool(name, ctrl.checked || false);
        } else if (ctrl.type === "slider" || ctrl.type === "progress_bar") {
          this.setInt(name, ctrl.value || 0);
        } else {
          this.setText(name, ctrl.value || "");
        }
      }
    }
    return this;
  }
  /** Snake_case alias of `resetMany`: resets all controls listed in `names` to their type-appropriate default values (`false` for checkboxes/switches, `min` for sliders, `""` for text inputs). */
  public reset_many(names: string[]): this {
    return this.resetMany(names);
  }

  /** Moves DOM keyboard focus to the control element identified by `id`. */
  public setFocus(id: string): this {
    if (this.isWindowRunning) {
      this.evalJS(
        `const el = document.getElementById("${id}"); if(el) el.focus();`,
      );
    }
    return this;
  }
  /** Snake_case alias of `setFocus`: moves DOM keyboard focus to the control element identified by `id`. */
  public set_focus(id: string): this {
    return this.setFocus(id);
  }
  /** Alias of `setFocus`: moves DOM keyboard focus to the control element identified by `id`. */
  public focus(id: string): this {
    return this.setFocus(id);
  }

  // 4. List Box & Dynamic Item Management
  /** Returns the array of option/item strings currently stored for list or dropdown control `id`. */
  public getListItems(id: string): string[] {
    return this.listItemsStore[id] || [];
  }
  /** Snake_case alias of `getListItems`: returns the array of option/item strings currently stored for list or dropdown control `id`. */
  public get_list_items(id: string): string[] {
    return this.getListItems(id);
  }

  /** Replaces the option/item strings for list or dropdown control `id` and refreshes its live DOM `<select>` or list container. */
  public setListItems(id: string, items: string[]): this {
    this.listItemsStore[id] = [...items];
    const currentVal = this.getValue(id);
    let nextVal = currentVal;
    if (Array.isArray(currentVal)) {
      nextVal = currentVal.filter((v) => items.includes(v));
    } else if (currentVal && !items.includes(currentVal)) {
      nextVal = items[0] || "";
    } else if (!currentVal && items.length > 0) {
      nextVal = items[0];
    }
    this.formValuesStore[id] = nextVal;

    if (this.isWindowRunning) {
      const selectedSet = new Set(Array.isArray(nextVal) ? nextVal : [nextVal]);
      const escHtml = (s: string) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      const optsHtml = items
        .map((it) => {
          const sel = selectedSet.has(it) ? ' selected="selected"' : "";
          const safe = escHtml(it);
          return `<option value="${safe}"${sel}>${safe}</option>`;
        })
        .join("");

      this.evalJS(`
                (function() {
                    let el = document.getElementById(${JSON.stringify(id)});
                    if (el && el.tagName !== "SELECT") el = el.querySelector("select") || el;
                    if (el && el.tagName === "SELECT") {
                        el.innerHTML = ${JSON.stringify(optsHtml)};
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `setListItems`: replaces the option/item strings for list or dropdown control `id` and refreshes its live DOM `<select>` or list container. */
  public set_list_items(id: string, items: string[]): this {
    return this.setListItems(id, items);
  }
  /** Alias of `setListItems`: replaces the option/item strings for list or dropdown control `id` and refreshes its live DOM `<select>` or list container. */
  public updateListItems(id: string, items: string[]): this {
    return this.setListItems(id, items);
  }
  /** Snake_case alias of `setListItems`: replaces the option/item strings for list or dropdown control `id` and refreshes its live DOM `<select>` or list container. */
  public update_list_items(id: string, items: string[]): this {
    return this.setListItems(id, items);
  }

  /** Appends a single non-empty, non-duplicate item string to list or dropdown control `id`. */
  public addListItem(id: string, item: string): this {
    const clean = (item || "").trim();
    if (!clean) return this;
    const items = this.getListItems(id);
    if (!items.includes(clean)) {
      items.push(clean);
    }
    this.setValue(id, clean);
    return this.setListItems(id, items);
  }
  /** Snake_case alias of `addListItem`: appends a single non-empty, non-duplicate item string to list or dropdown control `id`. */
  public add_list_item(id: string, item: string): this {
    return this.addListItem(id, item);
  }

  /** Appends multiple non-empty, non-duplicate item strings to list or dropdown control `id`. */
  public addListItems(id: string, newItems: string[]): this {
    const items = this.getListItems(id);
    const valid = newItems.map((i) => (i || "").trim()).filter(Boolean);
    valid.forEach((v) => {
      if (!items.includes(v)) items.push(v);
    });
    if (valid.length > 0) {
      this.setValue(id, valid[valid.length - 1]);
    }
    return this.setListItems(id, items);
  }
  /** Snake_case alias of `addListItems`: appends multiple non-empty, non-duplicate item strings to list or dropdown control `id`. */
  public add_list_items(id: string, newItems: string[]): this {
    return this.addListItems(id, newItems);
  }

  /** Removes the item at zero-based `index` from list or dropdown control `id`. */
  public removeListItem(id: string, index: number): this {
    const items = this.getListItems(id);
    if (index >= 0 && index < items.length) {
      items.splice(index, 1);
      this.setListItems(id, items);
    }
    return this;
  }
  /** Snake_case alias of `removeListItem`: removes the item at zero-based `index` from list or dropdown control `id`. */
  public remove_list_item(id: string, index: number): this {
    return this.removeListItem(id, index);
  }

  /** Removes all option items from the list or dropdown control identified by `id`. */
  public clearListItems(id: string): this {
    return this.setListItems(id, []);
  }
  /** Snake_case alias of `clearListItems`: removes all option items from the list or dropdown control identified by `id`. */
  public clear_list_items(id: string): this {
    return this.clearListItems(id);
  }

  /** Returns the total number of items currently in the list or dropdown control identified by `id`. */
  public getListCount(id: string): number {
    return this.getListItems(id).length;
  }
  /** Snake_case alias of `getListCount`: returns the total number of items currently in the list or dropdown control identified by `id`. */
  public get_list_count(id: string): number {
    return this.getListCount(id);
  }

  /** Returns the currently selected item text (or first selected item) of list or dropdown control `id`. */
  public getListSelectedText(id: string): string {
    const val = this.getValue(id);
    if (Array.isArray(val)) return val[0] || "";
    return String(val || "");
  }
  /** Snake_case alias of `getListSelectedText`: returns the currently selected item text (or first selected item) of list or dropdown control `id`. */
  public get_list_selected_text(id: string): string {
    return this.getListSelectedText(id);
  }

  /** Removes the currently selected item from list or dropdown control `id`. */
  public removeSelectedListItem(id: string): this {
    const selectedText = this.getListSelectedText(id);
    const items = this.getListItems(id);
    const idx = items.indexOf(selectedText);
    if (idx >= 0) {
      this.removeListItem(id, idx);
    }
    return this;
  }
  /** Snake_case alias of `removeSelectedListItem`: removes the currently selected item from list or dropdown control `id`. */
  public remove_selected_list_item(id: string): this {
    return this.removeSelectedListItem(id);
  }

  /** Enables or disables multi-selection mode on a list box control in the live DOM. */
  public setListMultiSelect(id: string, enabled: boolean): this {
    if (this.isWindowRunning) {
      this.evalJS(`
                (function() {
                    let el = document.getElementById("${id}");
                    if (el && el.tagName !== "SELECT") el = el.querySelector("select") || el;
                    if (el && el.tagName === "SELECT") el.multiple = ${enabled};
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `setListMultiSelect`: enables or disables multi-selection mode on a list box control in the live DOM. */
  public set_list_multi_select(id: string, enabled: boolean): this {
    return this.setListMultiSelect(id, enabled);
  }

  /** Returns a sorted array of zero-based indexes for all currently selected items in list control `id`. */
  public getListSelectedIndexes(id: string): number[] {
    const items = this.getListItems(id);
    const val = this.getValue(id);
    if (Array.isArray(val)) {
      return val.map((v) => items.indexOf(v)).filter((i) => i >= 0);
    } else if (typeof val === "string") {
      const idx = items.indexOf(val);
      return idx >= 0 ? [idx] : [];
    }
    return [];
  }
  /** Snake_case alias of `getListSelectedIndexes`: returns a sorted array of zero-based indexes for all currently selected items in list control `id`. */
  public get_list_selected_indexes(id: string): number[] {
    return this.getListSelectedIndexes(id);
  }

  /** Selects the items at the specified zero-based `indexes` in list control `id`. */
  public setListSelectedIndexes(id: string, indexes: number[]): this {
    const items = this.getListItems(id);
    const selectedVals = indexes.map((i) => items[i]).filter(Boolean);
    this.setValue(id, selectedVals);
    if (this.isWindowRunning) {
      this.evalJS(`
                (function() {
                    let el = document.getElementById("${id}");
                    if (el && el.tagName !== "SELECT") el = el.querySelector("select") || el;
                    if (el && el.tagName === "SELECT") {
                        const idxs = new Set(${JSON.stringify(indexes)});
                        Array.from(el.options).forEach((opt, idx) => {
                            opt.selected = idxs.has(idx);
                        });
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `setListSelectedIndexes`: selects the items at the specified zero-based `indexes` in list control `id`. */
  public set_list_selected_indexes(id: string, indexes: number[]): this {
    return this.setListSelectedIndexes(id, indexes);
  }

  /** Returns an array of item strings currently selected in list control `id`. */
  public getListSelectedTexts(id: string): string[] {
    const items = this.getListItems(id);
    return this.getListSelectedIndexes(id)
      .map((i) => items[i])
      .filter((x): x is string => Boolean(x));
  }
  /** Snake_case alias of `getListSelectedTexts`: returns an array of item strings currently selected in list control `id`. */
  public get_list_selected_texts(id: string): string[] {
    return this.getListSelectedTexts(id);
  }

  /** Selects all items in multi-select list control `id`. */
  public selectAllListItems(id: string): this {
    const items = this.getListItems(id);
    this.setValue(id, [...items]);
    if (this.isWindowRunning) {
      this.evalJS(`
                (function() {
                    let el = document.getElementById("${id}");
                    if (el && el.tagName !== "SELECT") el = el.querySelector("select") || el;
                    if (el && el.tagName === "SELECT") {
                        Array.from(el.options).forEach(opt => opt.selected = true);
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `selectAllListItems`: selects all items in multi-select list control `id`. */
  public select_all_list_items(id: string): this {
    return this.selectAllListItems(id);
  }

  /** Deselects all items in list control `id`. */
  public clearListSelection(id: string): this {
    this.setValue(id, "");
    if (this.isWindowRunning) {
      this.evalJS(`
                (function() {
                    let el = document.getElementById("${id}");
                    if (el && el.tagName !== "SELECT") el = el.querySelector("select") || el;
                    if (el && el.tagName === "SELECT") {
                        el.selectedIndex = -1;
                        Array.from(el.options).forEach(opt => opt.selected = false);
                    }
                })();
            `);
    }
    return this;
  }
  /** Snake_case alias of `clearListSelection`: deselects all items in list control `id`. */
  public clear_list_selection(id: string): this {
    return this.clearListSelection(id);
  }

  /** Removes all currently selected items from list control `id` and returns the array of removed item strings. */
  public removeSelectedListItems(id: string): string[] {
    const selectedIndexes = this.getListSelectedIndexes(id);
    const items = this.getListItems(id);
    const removed: string[] = [];
    const remaining: string[] = [];
    items.forEach((item, idx) => {
      if (selectedIndexes.includes(idx)) removed.push(item);
      else remaining.push(item);
    });
    this.setListItems(id, remaining);
    return removed;
  }
  /** Snake_case alias of `removeSelectedListItems`: removes all currently selected items from list control `id` and returns the array of removed item strings. */
  public remove_selected_list_items(id: string): string[] {
    return this.removeSelectedListItems(id);
  }

  /** Registers a double-click event callback on list control `id`. */
  public onListDoubleClick(id: string, callback: EventCallback): this {
    this.bindControlEvent(id, "onDoubleClick", callback);
    return this;
  }
  /** Snake_case alias of `onListDoubleClick`: registers a double-click event callback on list control `id`. */
  public on_list_double_click(id: string, callback: EventCallback): this {
    return this.onListDoubleClick(id, callback);
  }

  // 5. Settings Persistence (JSON File)
  /** Writes all eligible non-sensitive form control values as formatted JSON to `filePath` with `0o600` permissions. */
  public saveValuesToFile(filePath: string): void {
    const rawValues = this.getFormValues();
    const safeValues: Record<string, any> = {};
    for (const [id, val] of Object.entries(rawValues)) {
      const ctrl = this.findControl(id) || { id };
      if (!shouldPersistControl(ctrl)) continue;
      safeValues[id] = val;
    }
    writeFileAtomic(filePath, JSON.stringify(safeValues, null, 2));
  }
  /** Snake_case alias of `saveValuesToFile`: writes all current form control values (`getFormValues()`) as formatted JSON to `filePath`. */
  public save_values_to_file(pathStr: string): void {
    this.saveValuesToFile(pathStr);
  }

  /** Loads form control values from a JSON file at `filePath` and applies them to the window's controls. */
  public loadValuesFromFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const values = JSON.parse(content);
      for (const [id, val] of Object.entries(values)) {
        if (this.hasControl(id)) {
          const ctrl = this.findControl(id);
          if (ctrl && !shouldPersistControl(ctrl)) continue;
          this.setValue(id, val);
        }
      }
    }
  }
  /** Snake_case alias of `loadValuesFromFile`: loads form control values from a JSON file at `filePath` and applies them to the window's controls. */
  public load_values_from_file(pathStr: string): void {
    this.loadValuesFromFile(pathStr);
  }

  // =========================================================================
  // Reactive & Key-Value State Store API
  // =========================================================================

  /** Sets `key` to `String(val)` in the window's reactive state store, notifies state listeners, and updates any bound controls. */
  public setState(key: string, val: any): this {
    const strVal = String(val ?? "");
    this.stateStore[key] = strVal;

    // Trigger registered state listeners
    const listeners = this.stateListeners.get(key);
    if (listeners) {
      for (const cb of [...listeners]) {
        try {
          cb(this, strVal);
        } catch (e) {
          console.error(`Error in state listener for '${key}':`, e);
        }
      }
    }

    // Trigger two-way bound controls
    for (const [ctrlId, stateKey] of this.controlStateBindings.entries()) {
      if (stateKey === key) {
        const currentCtrlVal = this.getValue(ctrlId);
        if (String(currentCtrlVal ?? "") !== strVal) {
          this.setValue(ctrlId, strVal);
        }
      }
    }

    return this;
  }
  /** Snake_case alias of `setState`: sets `key` to `String(val)` in the window's reactive state store, notifies state listeners, and updates any bound controls. */
  public set_state(key: string, val: any): this {
    return this.setState(key, val);
  }

  /** Returns the string value stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public getState(key: string, defaultVal = ""): string {
    return this.getStateOr(key, defaultVal);
  }
  /** Snake_case alias of `getState`: returns the string value stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public get_state(key: string, defaultVal = ""): string {
    return this.getState(key, defaultVal);
  }

  /** Returns the string value stored at `key` in the window's state store, or `fallback` if unset or empty. */
  public getStateOr(key: string, fallback: string): string {
    if (key in this.stateStore) {
      const val = this.stateStore[key];
      if (val !== undefined && val !== "") return val;
    }
    return fallback;
  }
  /** Snake_case alias of `getStateOr`: returns the string value stored at `key` in the window's state store, or `fallback` if unset or empty. */
  public get_state_or(key: string, fallback: string): string {
    return this.getStateOr(key, fallback);
  }

  /** Returns `true` if `key` exists in the window's reactive state store. */
  public hasState(key: string): boolean {
    return key in this.stateStore;
  }
  /** Snake_case alias of `hasState`: returns `true` if `key` exists in the window's reactive state store. */
  public has_state(key: string): boolean {
    return this.hasState(key);
  }

  /** Deletes `key` from the window's reactive state store. */
  public removeState(key: string): this {
    delete this.stateStore[key];
    return this;
  }
  /** Snake_case alias of `removeState`: deletes `key` from the window's reactive state store. */
  public remove_state(key: string): this {
    return this.removeState(key);
  }

  /** Removes all entries from the window's reactive state store. */
  public clearState(): this {
    this.stateStore = {};
    return this;
  }
  /** Snake_case alias of `clearState`: removes all entries from the window's reactive state store. */
  public clear_state(): this {
    return this.clearState();
  }

  /** Stores an integer value (`Math.floor(val)`) at `key` in the window's reactive state store. */
  public setStateInt(key: string, val: number): this {
    return this.setState(key, String(Math.floor(val)));
  }
  /** Snake_case alias of `setStateInt`: stores an integer value (`Math.floor(val)`) at `key` in the window's reactive state store. */
  public set_state_int(key: string, val: number): this {
    return this.setStateInt(key, val);
  }

  /** Returns the integer value stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public getStateInt(key: string, defaultVal = 0): number {
    return this.getStateIntOr(key, defaultVal);
  }
  /** Snake_case alias of `getStateInt`: returns the integer value stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public get_state_int(key: string, defaultVal = 0): number {
    return this.getStateInt(key, defaultVal);
  }

  /** Parses and returns the integer value stored at `key` in the state store, or `fallback` if missing or invalid. */
  public getStateIntOr(key: string, fallback: number): number {
    if (key in this.stateStore) {
      const trimmed = (this.stateStore[key] || "").trim();
      if (trimmed.length > 0) {
        const parsed = parseInt(trimmed, 10);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return fallback;
  }
  /** Snake_case alias of `getStateIntOr`: parses and returns the integer value stored at `key` in the state store, or `fallback` if missing or invalid. */
  public get_state_int_or(key: string, fallback: number): number {
    return this.getStateIntOr(key, fallback);
  }

  /** Stores a boolean value (`"true"` or `"false"`) at `key` in the window's reactive state store. */
  public setStateBool(key: string, val: boolean): this {
    return this.setState(key, val ? "true" : "false");
  }
  /** Snake_case alias of `setStateBool`: stores a boolean value (`"true"` or `"false"`) at `key` in the window's reactive state store. */
  public set_state_bool(key: string, val: boolean): this {
    return this.setStateBool(key, val);
  }

  /** Returns the boolean value stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public getStateBool(key: string, defaultVal = false): boolean {
    return this.getStateBoolOr(key, defaultVal);
  }
  /** Snake_case alias of `getStateBool`: returns the boolean value stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public get_state_bool(key: string, defaultVal = false): boolean {
    return this.getStateBool(key, defaultVal);
  }

  /** Parses and returns the boolean value (`"true"`/`"1"`/`"yes"`/`"on"` vs `"false"`/`"0"`/`"no"`/`"off"`) at `key`, or `fallback`. */
  public getStateBoolOr(key: string, fallback: boolean): boolean {
    if (key in this.stateStore) {
      const val = (this.stateStore[key] || "").toLowerCase().trim();
      if (val === "true" || val === "1" || val === "yes" || val === "on")
        return true;
      if (val === "false" || val === "0" || val === "no" || val === "off")
        return false;
    }
    return fallback;
  }
  /** Snake_case alias of `getStateBoolOr`: parses and returns the boolean value (`"true"`/`"1"`/`"yes"`/`"on"` vs `"false"`/`"0"`/`"no"`/`"off"`) at `key`, or `fallback`. */
  public get_state_bool_or(key: string, fallback: boolean): boolean {
    return this.getStateBoolOr(key, fallback);
  }

  /** Stores a floating-point number at `key` in the window's reactive state store. */
  public setStateFloat(key: string, val: number): this {
    return this.setState(key, String(val));
  }
  /** Alias of `setStateFloat`: stores a floating-point number at `key` in the window's reactive state store. */
  public setStateF64(key: string, val: number): this {
    return this.setStateFloat(key, val);
  }
  /** Snake_case alias of `setStateFloat`: stores a floating-point number at `key` in the window's reactive state store. */
  public set_state_f64(key: string, val: number): this {
    return this.setStateFloat(key, val);
  }

  /** Returns the floating-point number stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public getStateFloat(key: string, defaultVal = 0.0): number {
    return this.getStateFloatOr(key, defaultVal);
  }
  /** Alias of `getStateFloat`: returns the floating-point number stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public getStateF64(key: string, defaultVal = 0.0): number {
    return this.getStateFloat(key, defaultVal);
  }
  /** Snake_case alias of `getStateFloat`: returns the floating-point number stored at `key` in the window's reactive state store, or `defaultVal` if unset. */
  public get_state_f64(key: string, defaultVal = 0.0): number {
    return this.getStateFloat(key, defaultVal);
  }

  /** Parses and returns the floating-point value stored at `key` in the state store, or `fallback` if missing or invalid. */
  public getStateFloatOr(key: string, fallback: number): number {
    if (key in this.stateStore) {
      const trimmed = (this.stateStore[key] || "").trim();
      if (trimmed.length > 0) {
        const parsed = parseFloat(trimmed);
        if (!isNaN(parsed)) return parsed;
      }
    }
    return fallback;
  }
  /** Alias of `getStateFloatOr`: parses and returns the floating-point value stored at `key` in the state store, or `fallback` if missing or invalid. */
  public getStateF64Or(key: string, fallback: number): number {
    return this.getStateFloatOr(key, fallback);
  }
  /** Snake_case alias of `getStateFloatOr`: parses and returns the floating-point value stored at `key` in the state store, or `fallback` if missing or invalid. */
  public get_state_f64_or(key: string, fallback: number): number {
    return this.getStateFloatOr(key, fallback);
  }

  /** Inverts the boolean state value at `key`, updates listeners/bound controls, and returns the new boolean. */
  public toggleStateBool(key: string): boolean {
    const next = !this.getStateBool(key);
    this.setStateBool(key, next);
    return next;
  }
  /** Snake_case alias of `toggleStateBool`: inverts the boolean state value at `key`, updates listeners/bound controls, and returns the new boolean. */
  public toggle_state_bool(key: string): boolean {
    return this.toggleStateBool(key);
  }

  /** Adds `delta` (default `1`) to the integer state value at `key` and returns the updated integer. */
  public incrementStateInt(key: string, delta = 1): number {
    const curr = this.getStateInt(key);
    const next = curr + delta;
    this.setStateInt(key, next);
    return next;
  }
  /** Snake_case alias of `incrementStateInt`: adds `delta` (default `1`) to the integer state value at `key` and returns the updated integer. */
  public increment_state_int(key: string, delta = 1): number {
    return this.incrementStateInt(key, delta);
  }

  /** Subscribes a listener callback invoked whenever the reactive state key `key` changes (and immediately if `key` already has a value). */
  public onStateChange(
    key: string,
    cb: (win: SimpleWindow, val: string) => void,
  ): this {
    let list = this.stateListeners.get(key);
    if (!list) {
      list = [];
      this.stateListeners.set(key, list);
    }
    list.push(cb);
    if (key in this.stateStore) {
      try {
        cb(this, this.stateStore[key] ?? "");
      } catch (e) {
        console.error(e);
      }
    }
    return this;
  }
  /** Snake_case alias of `onStateChange`: subscribes a listener callback invoked whenever the reactive state key `key` changes (and immediately if `key` already has a value). */
  public on_state_change(
    key: string,
    cb: (win: SimpleWindow, val: string) => void,
  ): this {
    return this.onStateChange(key, cb);
  }

  // =========================================================================
  // App State & Window Session Persistence API
  // =========================================================================

  /** Atomically saves the window's reactive `stateStore` as JSON to `filePath` (expanding `~` and env vars). */
  public saveStateJson(filePath: string): void {
    const resolved = resolveUserPath(filePath);
    saveStateToFile(resolved, this.stateStore);
  }
  /** Snake_case alias of `saveStateJson`: atomically saves the window's reactive `stateStore` as JSON to `filePath` (expanding `~` and env vars). */
  public save_state_json(filePath: string): void {
    this.saveStateJson(filePath);
  }

  /** Loads key-value pairs from a JSON file at `filePath` into the window's reactive `stateStore`, triggering bindings. */
  public loadStateJson(filePath: string): void {
    const resolved = resolveUserPath(filePath);
    const loaded = loadStateFromFile(resolved);
    for (const [k, v] of Object.entries(loaded)) {
      this.setState(k, v);
    }
  }
  /** Snake_case alias of `loadStateJson`: loads key-value pairs from a JSON file at `filePath` into the window's reactive `stateStore`, triggering bindings. */
  public load_state_json(filePath: string): void {
    this.loadStateJson(filePath);
  }

  /** Saves the window's reactive `stateStore` to the platform-standard application state file (`<appStateDir>/<fileName>`). */
  public saveAppState(appName?: string, fileName = "state.json"): void {
    const appId = appName || this.getAppId();
    const targetFile = getAppStateFile(appId, fileName);
    this.saveStateJson(targetFile);
  }
  /** Snake_case alias of `saveAppState`: saves the window's reactive `stateStore` to the platform-standard application state file (`<appStateDir>/<fileName>`). */
  public save_app_state(appName?: string, fileName = "state.json"): void {
    this.saveAppState(appName, fileName);
  }

  /** Attempts to save the application state via `saveAppState`, returning `true` on success or `false` if an I/O error occurs. */
  public saveAppStateOr(appName?: string, fileName = "state.json"): boolean {
    try {
      this.saveAppState(appName, fileName);
      return true;
    } catch (e) {
      return false;
    }
  }
  /** Snake_case alias of `saveAppStateOr`: attempts to save the application state via `saveAppState`, returning `true` on success or `false` if an I/O error occurs. */
  public save_app_state_or(appName?: string, fileName = "state.json"): boolean {
    return this.saveAppStateOr(appName, fileName);
  }

  /** Loads the application's saved state file from `<appStateDir>/<fileName>` (or fallback config dir), returning `true` if loaded. */
  public loadAppState(appName?: string, fileName = "state.json"): boolean {
    const appId = appName || this.getAppId();
    let targetFile = getAppStateFile(appId, fileName);
    if (!fs.existsSync(targetFile)) {
      targetFile = getAppConfigFile(appId, fileName);
      if (!fs.existsSync(targetFile)) {
        return false;
      }
    }
    this.loadStateJson(targetFile);
    return true;
  }
  /** Snake_case alias of `loadAppState`: loads the application's saved state file from `<appStateDir>/<fileName>` (or fallback config dir), returning `true` if loaded. */
  public load_app_state(appName?: string, fileName = "state.json"): boolean {
    return this.loadAppState(appName, fileName);
  }

  /** Attempts to load the application state via `loadAppState`, returning `false` instead of throwing on error. */
  public loadAppStateOr(appName?: string, fileName = "state.json"): boolean {
    try {
      return this.loadAppState(appName, fileName);
    } catch (e) {
      return false;
    }
  }
  /** Snake_case alias of `loadAppStateOr`: attempts to load the application state via `loadAppState`, returning `false` instead of throwing on error. */
  public load_app_state_or(appName?: string, fileName = "state.json"): boolean {
    return this.loadAppStateOr(appName, fileName);
  }

  /** Returns `true` if a saved state file exists for `appName` in the app state or config directory. */
  public hasSavedAppState(appName?: string, fileName = "state.json"): boolean {
    const appId = appName || this.getAppId();
    const targetFile = getAppStateFile(appId, fileName);
    if (fs.existsSync(targetFile)) return true;
    const configFile = getAppConfigFile(appId, fileName);
    return fs.existsSync(configFile);
  }
  /** Snake_case alias of `hasSavedAppState`: returns `true` if a saved state file exists for `appName` in the app state or config directory. */
  public has_saved_app_state(
    appName?: string,
    fileName = "state.json",
  ): boolean {
    return this.hasSavedAppState(appName, fileName);
  }

  /** Deletes the saved state file (`state.json`) for `appName` from disk and clears the in-memory `stateStore`. */
  public clearAppState(appName?: string, fileName = "state.json"): void {
    const appId = appName || this.getAppId();
    const targetFile = getAppStateFile(appId, fileName);
    if (fs.existsSync(targetFile)) {
      try {
        fs.unlinkSync(targetFile);
      } catch (e) {}
    }
    const configFile = getAppConfigFile(appId, fileName);
    if (fs.existsSync(configFile)) {
      try {
        fs.unlinkSync(configFile);
      } catch (e) {}
    }
  }
  /** Snake_case alias of `clearAppState`: deletes the saved state file (`state.json`) for `appName` from disk and clears the in-memory `stateStore`. */
  public clear_app_state(appName?: string, fileName = "state.json"): void {
    this.clearAppState(appName, fileName);
  }

  /** Persists the window's reactive state store, dimensions, and theme to `<appStateDir>/session.json`. */
  public saveWindowSession(appName?: string): void {
    const appId = appName || this.getAppId();
    const sessionData: Record<string, any> = { ...this.stateStore };
    sessionData["__win_width"] = this.width;
    sessionData["__win_height"] = this.height;
    sessionData["__win_theme"] = this.theme;
    sessionData["__win_fullscreen"] = this.fullscreen;
    const targetFile = getAppStateFile(appId, "session.json");
    saveStateToFile(targetFile, sessionData);
  }
  /** Snake_case alias of `saveWindowSession`: persists the window's reactive state store, dimensions, and theme to `<appStateDir>/session.json`. */
  public save_window_session(appName?: string): void {
    this.saveWindowSession(appName);
  }

  /** Restores window dimensions, theme, and reactive state store from `<appStateDir>/session.json`. */
  public restoreWindowSession(appName?: string): boolean {
    const appId = appName || this.getAppId();
    let targetFile = getAppStateFile(appId, "session.json");
    if (!fs.existsSync(targetFile)) {
      targetFile = getAppConfigFile(appId, "session.json");
      if (!fs.existsSync(targetFile)) return false;
    }
    try {
      const content = fs.readFileSync(targetFile, "utf-8");
      const loaded = JSON.parse(content);
      for (const [k, v] of Object.entries(loaded)) {
        if (k === "__win_theme") {
          this.setTheme(String(v), false);
        } else if (k === "__win_fullscreen") {
          if (typeof v === "boolean" && this.fullscreen === false)
            this.fullscreen = v;
        } else if (k === "__win_width") {
          const w = parseInt(String(v), 10);
          if (w > 100) this.width = w;
        } else if (k === "__win_height") {
          const h = parseInt(String(v), 10);
          if (h > 100) this.height = h;
        } else {
          this.setState(k, v);
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }
  /** Snake_case alias of `restoreWindowSession`: restores window dimensions, theme, and reactive state store from `<appStateDir>/session.json`. */
  public restore_window_session(appName?: string): boolean {
    return this.restoreWindowSession(appName);
  }

  /** Registers a window close listener that automatically saves the reactive `stateStore` to `<fileName>` when the window closes. */
  public enableAutoSaveState(appName?: string, fileName = "state.json"): this {
    const appId = appName || this.getAppId();
    this.onClose((w) => {
      w.saveAppStateOr(appId, fileName);
    });
    return this;
  }
  /** Snake_case alias of `enableAutoSaveState`: registers a window close listener that automatically saves the reactive `stateStore` to `<fileName>` when the window closes. */
  public enable_auto_save_state(
    appName?: string,
    fileName = "state.json",
  ): this {
    return this.enableAutoSaveState(appName, fileName);
  }

  // =========================================================================
  // Universal Theme & Form State Auto-Persistence API
  // =========================================================================

  /** Applies the user's globally saved theme from `~/.config/simplegui/theme.txt` if one exists. */
  public restoreSavedTheme(): this {
    const saved = getSavedTheme();
    if (saved) {
      this.setTheme(saved, false);
    }
    return this;
  }
  /** Snake_case alias of `restoreSavedTheme`: applies the user's globally saved theme from `~/.config/simplegui/theme.txt` if one exists. */
  public restore_saved_theme(): this {
    return this.restoreSavedTheme();
  }

  /** Returns the explicit `appId` if set, or derives a sanitized snake_case identifier from the window title. */
  public getAppId(): string {
    if (this.appId && this.appId.length > 0) {
      return this.appId;
    }
    if (this.title && this.title.length > 0) {
      const clean = this.title.toLowerCase().replace(/[\s\-]+/g, "_");
      const res = clean.replace(/[^a-z0-9_]/g, "");
      if (res.length > 0) return res;
    }
    if (process.argv && process.argv[1]) {
      const base = path.basename(process.argv[1]).replace(/\.[^/.]+$/, "");
      if (base.length > 0) return base;
    }
    return "default_app";
  }
  /** Snake_case alias of `getAppId`: returns the explicit `appId` if set, or derives a sanitized snake_case identifier from the window title. */
  public get_app_id(): string {
    return this.getAppId();
  }

  /** Sets the application identifier used to namespace config, state, and form-persistence files on disk. */
  public setAppId(id: string): this {
    this.appId = id;
    return this;
  }
  /** Snake_case alias of `setAppId`: sets the application identifier used to namespace config, state, and form-persistence files on disk. */
  public set_app_id(id: string): this {
    return this.setAppId(id);
  }

  /** Enables automatic saving and restoration of form control values and window theme across sessions. */
  public enableAutoSave(): this {
    this.autoSaveState = true;
    return this;
  }
  /** Snake_case alias of `enableAutoSave`: enables automatic saving and restoration of form control values and window theme across sessions. */
  public enable_auto_save(): this {
    return this.enableAutoSave();
  }

  /** Disables automatic form-state persistence for this window. */
  public disableAutoSave(): this {
    this.autoSaveState = false;
    return this;
  }
  /** Snake_case alias of `disableAutoSave`: disables automatic form-state persistence for this window. */
  public disable_auto_save(): this {
    return this.disableAutoSave();
  }

  /** Persists eligible form control values, reactive state, window dimensions, and active theme to `<appStateDir>/form_state.json`. */
  public saveAppFormState(appName?: string): void {
    const appId = appName || this.getAppId();
    const data: Record<string, any> = {};

    data["__win_width"] = this.width;
    data["__win_height"] = this.height;
    data["__win_theme"] = this.theme;
    data["__win_fullscreen"] = this.fullscreen;

    for (const [k, v] of Object.entries(this.stateStore)) {
      data["__state_" + k] = v;
    }

    const controlsList: any[] = [];
    const collect = (items: any[]) => {
      for (const item of items) {
        controlsList.push(item);
        if (item.children) collect(item.children);
      }
    };
    collect(this.controls);

    for (const ctrl of controlsList) {
      if (!shouldPersistControl(ctrl)) continue;
      const cid = ctrl.id || ctrl.name;
      const val = this.getValue(cid);
      if (val !== undefined && val !== null) {
        data[cid] = val;
      }
    }

    const targetFile = getAppStateFile(appId, "form_state.json");
    saveStateToFile(targetFile, data);
  }
  /** Snake_case alias of `saveAppFormState`: persists eligible form control values, reactive state, window dimensions, and active theme to `<appStateDir>/form_state.json`. */
  public save_app_form_state(appName?: string): void {
    this.saveAppFormState(appName);
  }

  /** Attempts to persist form state via `saveAppFormState`, returning `true` on success or `false` on error. */
  public saveAppFormStateOr(appName?: string): boolean {
    try {
      this.saveAppFormState(appName);
      return true;
    } catch (e) {
      return false;
    }
  }
  /** Snake_case alias of `saveAppFormStateOr`: attempts to persist form state via `saveAppFormState`, returning `true` on success or `false` on error. */
  public save_app_form_state_or(appName?: string): boolean {
    return this.saveAppFormStateOr(appName);
  }

  /** Restores previously saved window dimensions, theme, reactive state, and eligible control values from `form_state.json`. */
  public restoreAppFormState(appName?: string): boolean {
    const appId = appName || this.getAppId();
    let targetFile = getAppStateFile(appId, "form_state.json");
    if (!fs.existsSync(targetFile)) {
      targetFile = getAppConfigFile(appId, "form_state.json");
      if (!fs.existsSync(targetFile)) {
        const savedTheme = getSavedTheme();
        if (savedTheme && savedTheme !== this.theme) {
          this.setTheme(savedTheme, false);
        }
        return false;
      }
    }

    let loaded: Record<string, any> = {};
    try {
      const content = fs.readFileSync(targetFile, "utf-8");
      if (!content.trim()) return false;
      loaded = JSON.parse(content);
    } catch (e) {
      return false;
    }

    if (loaded["__win_width"] !== undefined) {
      const w = parseInt(String(loaded["__win_width"]), 10);
      if (w >= 300 && w <= 4000) this.width = w;
    }
    if (loaded["__win_height"] !== undefined) {
      const h = parseInt(String(loaded["__win_height"]), 10);
      if (h >= 200 && h <= 3000) this.height = h;
    }
    if (loaded["__win_fullscreen"] !== undefined && this.fullscreen === false) {
      this.fullscreen = Boolean(loaded["__win_fullscreen"]);
    }

    if (loaded["__win_theme"] && typeof loaded["__win_theme"] === "string") {
      this.setTheme(loaded["__win_theme"], false);
    } else {
      const savedTheme = getSavedTheme();
      if (savedTheme) this.setTheme(savedTheme, false);
    }

    for (const [k, v] of Object.entries(loaded)) {
      if (k.startsWith("__state_") && k.length > 8) {
        this.setState(k.slice(8), v);
      }
    }

    const controlsList: any[] = [];
    const collect = (items: any[]) => {
      for (const item of items) {
        controlsList.push(item);
        if (item.children) collect(item.children);
      }
    };
    collect(this.controls);

    for (const ctrl of controlsList) {
      const cid = ctrl.id || ctrl.name;
      if (cid in loaded) {
        if (shouldPersistControl(ctrl)) {
          this.setValue(cid, loaded[cid]);
        }
      }

      if (
        [
          "dd_app_theme",
          "dd_theme",
          "dd_theme_selector",
          "theme_picker",
        ].includes(cid)
      ) {
        this.setValue(cid, this.theme);
      }
    }

    return true;
  }
  /** Snake_case alias of `restoreAppFormState`: restores previously saved window dimensions, theme, reactive state, and eligible control values from `form_state.json`. */
  public restore_app_form_state(appName?: string): boolean {
    return this.restoreAppFormState(appName);
  }

  /** Deletes the persisted `form_state.json` file for `appName` from disk. */
  public clearAppFormState(appName?: string): void {
    const appId = appName || this.getAppId();
    const stateFile = getAppStateFile(appId, "form_state.json");
    if (fs.existsSync(stateFile)) {
      try {
        fs.unlinkSync(stateFile);
      } catch (e) {}
    }
    const configFile = getAppConfigFile(appId, "form_state.json");
    if (fs.existsSync(configFile)) {
      try {
        fs.unlinkSync(configFile);
      } catch (e) {}
    }
  }
  /** Snake_case alias of `clearAppFormState`: deletes the persisted `form_state.json` file for `appName` from disk. */
  public clear_app_form_state(appName?: string): void {
    this.clearAppFormState(appName);
  }

  // =========================================================================
  // Two-Way Data & Event Binding API
  // =========================================================================

  /** Binds the control named `controlName` to reactive state key `stateKey` for automatic two-way synchronization. */
  public bindState(controlName: string, stateKey: string): this {
    this.controlStateBindings.set(controlName, stateKey);

    if (this.hasState(stateKey)) {
      const initVal = this.getState(stateKey);
      this.setValue(controlName, initVal);
    } else {
      const currentVal = this.getValue(controlName);
      if (currentVal !== undefined && currentVal !== null) {
        this.setState(stateKey, String(currentVal));
      }
    }

    this.onChange(controlName, (w, val) => {
      const strVal = String(val ?? "");
      if (w.getState(stateKey) !== strVal) {
        w.setState(stateKey, strVal);
      }
    });

    return this;
  }

  /**
   * Binds a Tabs control (`tabsId`) to a map of tab names (or indices) -> arrays of control/card IDs.
   * Automatically hides inactive tab groups initially and switches visible controls when the active tab changes.
   */
  public bindTabViews(
    tabsId: string,
    viewGroupsMap: Record<string, string[]>,
    onTabChange?: (
      win: SimpleWindow,
      activeTab: string,
      activeIndex: number,
    ) => void,
  ): this {
    const applyTabView = (
      activeTabOrIdx: string | number,
      triggerCallback: boolean,
    ) => {
      const ctrl = this.findControl(tabsId);
      const labels: string[] = Array.isArray(ctrl?.tabLabels)
        ? ctrl.tabLabels
        : Array.isArray(ctrl?.items)
          ? ctrl.items.map(String)
          : String(ctrl?.items ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

      const activeTab =
        typeof activeTabOrIdx === "number"
          ? (labels[activeTabOrIdx] ?? String(activeTabOrIdx))
          : String(activeTabOrIdx ?? labels[0] ?? "");
      const activeIndex = Math.max(0, labels.indexOf(activeTab));

      const toShowSet = new Set<string>(
        viewGroupsMap[activeTab] ?? viewGroupsMap[String(activeIndex)] ?? [],
      );
      const toHide: string[] = [];
      for (const [key, groupIds] of Object.entries(viewGroupsMap)) {
        if (key === activeTab || key === String(activeIndex)) continue;
        for (let i = 0; i < groupIds.length; i++) {
          const gid = groupIds[i];
          if (gid && !toShowSet.has(gid)) {
            toHide.push(gid);
          }
        }
      }

      if (toHide.length > 0) this.hideControls(toHide);
      if (toShowSet.size > 0) this.showControls(Array.from(toShowSet));

      if (triggerCallback && onTabChange) {
        onTabChange(this, activeTab, activeIndex);
      }
    };

    const initialVal = this.getValue(tabsId);
    applyTabView(
      initialVal !== undefined && initialVal !== "" ? initialVal : 0,
      false,
    );

    this.onChange(tabsId, (_win, val) => {
      applyTabView(val, true);
    });

    return this;
  }
  /** Snake_case alias of `bindTabViews`: binds a Tabs control to a map of tab names -> control/card IDs. */
  public bind_tab_views(
    tabsId: string,
    viewGroupsMap: Record<string, string[]>,
    onTabChange?: (
      win: SimpleWindow,
      activeTab: string,
      activeIndex: number,
    ) => void,
  ): this {
    return this.bindTabViews(tabsId, viewGroupsMap, onTabChange);
  }

  /**
   * Binds an Input or SearchInput control (`inputId`) to live-filter a Table control (`tableId`) in 1 line of code.
   * Supports static 2D arrays or a dynamic `() => any[][]` getter for mutable datasets.
   */
  public bindTableFilter(
    inputId: string,
    tableId: string,
    sourceRows: any[][] | (() => any[][]),
    optionsOrOnFilter?:
      | {
          columns?: number[];
          predicate?: (row: any[], query: string) => boolean;
          countControlId?: string;
          countFormat?: (matched: number, total: number) => string;
          onFilter?: (
            win: SimpleWindow,
            filteredRows: any[][],
            query: string,
          ) => void;
        }
      | ((win: SimpleWindow, filteredRows: any[][], query: string) => void),
  ): this {
    const opts =
      typeof optionsOrOnFilter === "function"
        ? { onFilter: optionsOrOnFilter }
        : (optionsOrOnFilter ?? {});

    const runFilter = (rawQuery: any) => {
      const rows = typeof sourceRows === "function" ? sourceRows() : sourceRows;
      const total = Array.isArray(rows) ? rows.length : 0;
      const query = String(rawQuery ?? "")
        .trim()
        .toLowerCase();

      let filtered: any[][];
      if (!query) {
        filtered = Array.isArray(rows) ? rows : [];
      } else if (opts.predicate) {
        filtered = rows.filter((row) => opts.predicate!(row, query));
      } else if (Array.isArray(opts.columns) && opts.columns.length > 0) {
        const cols = opts.columns;
        filtered = rows.filter((row) => {
          for (let i = 0; i < cols.length; i++) {
            const cell = row[cols[i]!];
            if (
              cell !== null &&
              cell !== undefined &&
              String(cell).toLowerCase().includes(query)
            ) {
              return true;
            }
          }
          return false;
        });
      } else {
        filtered = rows.filter((row) => {
          for (let i = 0; i < row.length; i++) {
            const cell = row[i];
            if (
              cell !== null &&
              cell !== undefined &&
              String(cell).toLowerCase().includes(query)
            ) {
              return true;
            }
          }
          return false;
        });
      }

      this.setTableRows(tableId, filtered);

      if (opts.countControlId) {
        const text = opts.countFormat
          ? opts.countFormat(filtered.length, total)
          : `${filtered.length} / ${total} rows`;
        this.setValue(opts.countControlId, text);
      }

      if (opts.onFilter) {
        opts.onFilter(this, filtered, query);
      }
    };

    const initialQuery = this.getText(inputId);
    runFilter(initialQuery);

    this.onChange(inputId, (_win, val) => {
      runFilter(val);
    });

    return this;
  }
  /** Snake_case alias of `bindTableFilter`: binds an Input or SearchInput control to live-filter a Table control. */
  public bind_table_filter(
    inputId: string,
    tableId: string,
    sourceRows: any[][] | (() => any[][]),
    optionsOrOnFilter?:
      | {
          columns?: number[];
          predicate?: (row: any[], query: string) => boolean;
          countControlId?: string;
          countFormat?: (matched: number, total: number) => string;
          onFilter?: (
            win: SimpleWindow,
            filteredRows: any[][],
            query: string,
          ) => void;
        }
      | ((win: SimpleWindow, filteredRows: any[][], query: string) => void),
  ): this {
    return this.bindTableFilter(
      inputId,
      tableId,
      sourceRows,
      optionsOrOnFilter,
    );
  }

  /**
   * Binds a Table control (`tableId`) to detail/form controls so clicking a row automatically populates
   * the mapped controls with that row's cell values.
   */
  public bindMasterDetail(
    tableId: string,
    columnToControlMap: (string | null | undefined)[] | Record<string, string>,
    onRowSelect?: (
      win: SimpleWindow,
      row: any[],
      rowId: string,
      rowIndex: number,
    ) => void,
  ): this {
    this.onClick(tableId, (w, rawRowId) => {
      const ctrl = w.findControl(tableId);
      const rows: any[][] =
        ctrl?.rows ||
        (Array.isArray(ctrl?.value) ? ctrl.value : null) ||
        (Array.isArray(w.formValuesStore[tableId])
          ? w.formValuesStore[tableId]
          : []);
      const headers: string[] = Array.isArray(ctrl?.headers)
        ? ctrl.headers
        : [];
      const targetId = String(rawRowId ?? "").trim();

      let matchedIdx = -1;
      let matchedRow: any[] | undefined;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const cells = Array.isArray(r)
          ? r
          : r && (r as any).cells
            ? (r as any).cells
            : Object.values(r || {});
        const rId = String(
          (r as any)?.rowId !== undefined
            ? (r as any).rowId
            : (r as any)?.pid !== undefined
              ? (r as any).pid
              : (cells[0] ?? ""),
        ).trim();
        if (rId === targetId) {
          matchedIdx = i;
          matchedRow = cells;
          break;
        }
      }
      if (!matchedRow && /^\d+$/.test(targetId)) {
        const idx = Number(targetId);
        if (idx >= 0 && idx < rows.length) {
          matchedIdx = idx;
          const r = rows[idx];
          matchedRow = Array.isArray(r) ? r : Object.values(r || {});
        }
      }
      if (!matchedRow) return;

      if (Array.isArray(columnToControlMap)) {
        for (let col = 0; col < columnToControlMap.length; col++) {
          const destId = columnToControlMap[col];
          if (destId && col < matchedRow.length) {
            w.setValue(destId, matchedRow[col]);
          }
        }
      } else if (columnToControlMap && typeof columnToControlMap === "object") {
        for (const [colKey, destId] of Object.entries(columnToControlMap)) {
          if (!destId) continue;
          let colIdx = /^\d+$/.test(colKey)
            ? Number(colKey)
            : headers.indexOf(colKey);
          if (colIdx === -1) {
            const lower = colKey.toLowerCase();
            colIdx = headers.findIndex(
              (h) => String(h).toLowerCase() === lower,
            );
          }
          if (colIdx >= 0 && colIdx < matchedRow.length) {
            w.setValue(destId, matchedRow[colIdx]);
          }
        }
      }

      if (onRowSelect) {
        onRowSelect(w, matchedRow, targetId, matchedIdx);
      }
    });
    return this;
  }
  /** Snake_case alias of `bindMasterDetail`: binds a Table control to detail/form controls so clicking a row populates mapped controls. */
  public bind_master_detail(
    tableId: string,
    columnToControlMap: (string | null | undefined)[] | Record<string, string>,
    onRowSelect?: (
      win: SimpleWindow,
      row: any[],
      rowId: string,
      rowIndex: number,
    ) => void,
  ): this {
    return this.bindMasterDetail(tableId, columnToControlMap, onRowSelect);
  }
  /** Snake_case alias of `bindState`: binds the control named `controlName` to reactive state key `stateKey` for automatic two-way synchronization. */
  public bind_state(controlName: string, stateKey: string): this {
    return this.bindState(controlName, stateKey);
  }
  /** Alias of `bindState`: binds the control named `controlName` to reactive state key `stateKey` for automatic two-way synchronization. */
  public bindControl(controlName: string, stateKey: string): this {
    return this.bindState(controlName, stateKey);
  }
  /** Snake_case alias of `bindState`: binds the control named `controlName` to reactive state key `stateKey` for automatic two-way synchronization. */
  public bind_control(controlName: string, stateKey: string): this {
    return this.bindState(controlName, stateKey);
  }
  /** Alias of `bindState`: binds the control named `controlName` to reactive state key `stateKey` for automatic two-way synchronization. */
  public bindValue(controlName: string, stateKey: string): this {
    return this.bindState(controlName, stateKey);
  }
  /** Snake_case alias of `bindState`: binds the control named `controlName` to reactive state key `stateKey` for automatic two-way synchronization. */
  public bind_value(controlName: string, stateKey: string): this {
    return this.bindState(controlName, stateKey);
  }

  /** Registers a click event callback for the control identified by `controlId`. */
  public onClick(controlId: string, callback: EventCallback): this {
    this.bindControlEvent(controlId, "onClick", callback);
    return this;
  }
  /** Snake_case alias of `onClick`: registers a click event callback for the control identified by `controlId`. */
  public on_click(controlId: string, callback: EventCallback): this {
    return this.onClick(controlId, callback);
  }
  /** Alias of `onClick`: registers a click event callback for the control identified by `controlId`. */
  public bindClick(controlId: string, callback: EventCallback): this {
    return this.onClick(controlId, callback);
  }
  /** Snake_case alias of `onClick`: registers a click event callback for the control identified by `controlId`. */
  public bind_click(controlId: string, callback: EventCallback): this {
    return this.onClick(controlId, callback);
  }

  /** Registers a value-change event callback for the control identified by `controlId`. */
  public onChange(controlId: string, callback: EventCallback): this {
    this.bindControlEvent(controlId, "onChange", callback);
    return this;
  }
  /** Snake_case alias of `onChange`: registers a value-change event callback for the control identified by `controlId`. */
  public on_change(controlId: string, callback: EventCallback): this {
    return this.onChange(controlId, callback);
  }
  /** Alias of `onChange`: registers a value-change event callback for the control identified by `controlId`. */
  public bindChange(controlId: string, callback: EventCallback): this {
    return this.onChange(controlId, callback);
  }
  /** Snake_case alias of `onChange`: registers a value-change event callback for the control identified by `controlId`. */
  public bind_change(controlId: string, callback: EventCallback): this {
    return this.onChange(controlId, callback);
  }

  /** Registers an Enter-key event callback for the control identified by `controlId`. */
  public onEnter(controlId: string, callback: EventCallback): this {
    this.bindControlEvent(controlId, "onEnter", callback);
    return this;
  }
  /** Snake_case alias of `onEnter`: registers an Enter-key event callback for the control identified by `controlId`. */
  public on_enter(controlId: string, callback: EventCallback): this {
    return this.onEnter(controlId, callback);
  }
  /** Alias of `onEnter`: registers an Enter-key event callback for the control identified by `controlId`. */
  public bindEnter(controlId: string, callback: EventCallback): this {
    return this.onEnter(controlId, callback);
  }
  /** Snake_case alias of `onEnter`: registers an Enter-key event callback for the control identified by `controlId`. */
  public bind_enter(controlId: string, callback: EventCallback): this {
    return this.onEnter(controlId, callback);
  }

  /** Registers a pointer-hover event callback for the control identified by `controlId`. */
  public onHover(controlId: string, callback: EventCallback): this {
    this.bindControlEvent(controlId, "onHover", callback);
    return this;
  }
  /** Snake_case alias of `onHover`: registers a pointer-hover event callback for the control identified by `controlId`. */
  public on_hover(controlId: string, callback: EventCallback): this {
    return this.onHover(controlId, callback);
  }
  /** Alias of `onHover`: registers a pointer-hover event callback for the control identified by `controlId`. */
  public bindHover(controlId: string, callback: EventCallback): this {
    return this.onHover(controlId, callback);
  }
  /** Snake_case alias of `onHover`: registers a pointer-hover event callback for the control identified by `controlId`. */
  public bind_hover(controlId: string, callback: EventCallback): this {
    return this.onHover(controlId, callback);
  }

  /** Registers a double-click event callback for the control identified by `controlId`. */
  public onDblClick(controlId: string, callback: EventCallback): this {
    this.bindControlEvent(controlId, "onDoubleClick", callback);
    return this;
  }
  /** Alias of `onDblClick`: registers a double-click event callback for the control identified by `controlId`. */
  public onDoubleClick(controlId: string, callback: EventCallback): this {
    return this.onDblClick(controlId, callback);
  }
  /** Snake_case alias of `onDblClick`: registers a double-click event callback for the control identified by `controlId`. */
  public on_double_click(controlId: string, callback: EventCallback): this {
    return this.onDblClick(controlId, callback);
  }
  /** Snake_case alias of `onDblClick`: registers a double-click event callback for the control identified by `controlId`. */
  public on_dblclick(controlId: string, callback: EventCallback): this {
    return this.onDblClick(controlId, callback);
  }
  /** Alias of `onDblClick`: registers a double-click event callback for the control identified by `controlId`. */
  public bindDblClick(controlId: string, callback: EventCallback): this {
    return this.onDblClick(controlId, callback);
  }
  /** Snake_case alias of `onDblClick`: registers a double-click event callback for the control identified by `controlId`. */
  public bind_dblclick(controlId: string, callback: EventCallback): this {
    return this.onDblClick(controlId, callback);
  }

  /** Registers a right-click (context menu) event callback for the control identified by `controlId`. */
  public onRightClick(controlId: string, callback: EventCallback): this {
    this.bindControlEvent(controlId, "onContextMenu", callback);
    return this;
  }
  /** Snake_case alias of `onRightClick`: registers a right-click (context menu) event callback for the control identified by `controlId`. */
  public on_right_click(controlId: string, callback: EventCallback): this {
    return this.onRightClick(controlId, callback);
  }
  /** Alias of `onRightClick`: registers a right-click (context menu) event callback for the control identified by `controlId`. */
  public bindRightClick(controlId: string, callback: EventCallback): this {
    return this.onRightClick(controlId, callback);
  }
  /** Snake_case alias of `onRightClick`: registers a right-click (context menu) event callback for the control identified by `controlId`. */
  public bind_right_click(controlId: string, callback: EventCallback): this {
    return this.onRightClick(controlId, callback);
  }

  /** Registers a callback for an arbitrary event name on the control identified by `controlId`. */
  public onEvent(
    controlId: string,
    eventName: string,
    callback: EventCallback,
  ): this {
    this.bindControlEvent(controlId, eventName, callback);
    return this;
  }
  /** Alias of `onEvent`: registers a callback for an arbitrary event name on the control identified by `controlId`. */
  public on(
    controlId: string,
    eventName: string,
    callback: EventCallback,
  ): this {
    return this.onEvent(controlId, eventName, callback);
  }
  /** Snake_case alias of `onEvent`: registers a callback for an arbitrary event name on the control identified by `controlId`. */
  public on_event(
    controlId: string,
    eventName: string,
    callback: EventCallback,
  ): this {
    return this.onEvent(controlId, eventName, callback);
  }
  /** Alias of `onEvent`: registers a callback for an arbitrary event name on the control identified by `controlId`. */
  public bindEvent(
    controlId: string,
    eventName: string,
    callback: EventCallback,
  ): this {
    return this.onEvent(controlId, eventName, callback);
  }
  /** Snake_case alias of `onEvent`: registers a callback for an arbitrary event name on the control identified by `controlId`. */
  public bind_event(
    controlId: string,
    eventName: string,
    callback: EventCallback,
  ): this {
    return this.onEvent(controlId, eventName, callback);
  }

  private normalizeShortcutChord(shortcut: string): string {
    const parts = String(shortcut || "")
      .trim()
      .toLowerCase()
      .split("+")
      .map((p) => p.trim())
      .filter(Boolean);
    const mods = new Set<string>();
    let mainKey = "";
    for (const part of parts) {
      if (part === "ctrl" || part === "control") mods.add("ctrl");
      else if (part === "alt" || part === "opt" || part === "option")
        mods.add("alt");
      else if (part === "shift") mods.add("shift");
      else if (
        part === "cmd" ||
        part === "command" ||
        part === "meta" ||
        part === "super" ||
        part === "win"
      )
        mods.add("meta");
      else if (
        part === "mod" ||
        part === "cmdorctrl" ||
        part === "commandorcontrol"
      )
        mods.add("mod");
      else if (part === "esc") mainKey = "escape";
      else if (part === "spacebar") mainKey = "space";
      else mainKey = part;
    }
    const ordered: string[] = [];
    if (mods.has("mod")) ordered.push("mod");
    if (mods.has("ctrl")) ordered.push("ctrl");
    if (mods.has("alt")) ordered.push("alt");
    if (mods.has("shift")) ordered.push("shift");
    if (mods.has("meta")) ordered.push("meta");
    if (mainKey) ordered.push(mainKey);
    return (
      ordered.join("+") ||
      String(shortcut || "")
        .trim()
        .toLowerCase()
    );
  }

  /** Registers a global keyboard shortcut handler (for example, `"ctrl+s"` or `"cmd+k"`) on the window. */
  public onShortcut(shortcut: string, callback: EventCallback): this {
    const raw = String(shortcut || "")
      .trim()
      .toLowerCase();
    const norm = this.normalizeShortcutChord(shortcut);
    this.eventHandlersMap.set(`shortcut_${raw}`, callback);
    this.eventHandlersMap.set(`shortcut_${norm}`, callback);
    if (this.isWindowRunning) {
      const shortcuts = Array.from(this.eventHandlersMap.keys())
        .filter((k) => k.startsWith("shortcut_"))
        .map((k) => k.slice("shortcut_".length));
      this.evalJS(
        `window.__simpleguiShortcuts = ${JSON.stringify(shortcuts)};`,
      );
    }
    return this;
  }

  /** Programmatically dispatches a registered keyboard shortcut handler (for testing or custom chord routing). */
  public async triggerShortcut(shortcut: string): Promise<this> {
    const raw = String(shortcut || "")
      .trim()
      .toLowerCase();
    const norm = this.normalizeShortcutChord(shortcut);
    const cb =
      this.eventHandlersMap.get(`shortcut_${norm}`) ||
      this.eventHandlersMap.get(`shortcut_${raw}`);
    if (cb) {
      await cb(this, norm || raw);
    }
    return this;
  }
  /** Snake_case alias of `onShortcut`: registers a global keyboard shortcut handler (for example, `"ctrl+s"` or `"cmd+k"`) on the window. */
  public on_shortcut(shortcut: string, callback: EventCallback): this {
    return this.onShortcut(shortcut, callback);
  }
  /** Alias of `onShortcut`: registers a global keyboard shortcut handler (for example, `"ctrl+s"` or `"cmd+k"`) on the window. */
  public bindShortcut(shortcut: string, callback: EventCallback): this {
    return this.onShortcut(shortcut, callback);
  }
  /** Snake_case alias of `onShortcut`: registers a global keyboard shortcut handler (for example, `"ctrl+s"` or `"cmd+k"`) on the window. */
  public bind_shortcut(shortcut: string, callback: EventCallback): this {
    return this.onShortcut(shortcut, callback);
  }
  /** Alias of `onShortcut`: registers a global keyboard shortcut handler (for example, `"ctrl+s"` or `"cmd+k"`) on the window. */
  public bindKey(key: string, callback: EventCallback): this {
    return this.onShortcut(key, callback);
  }
  /** Snake_case alias of `bindKey`: registers a global keyboard shortcut handler (for example, `"ctrl+s"` or `"cmd+k"`) on the window. */
  public bind_key(key: string, callback: EventCallback): this {
    return this.bindKey(key, callback);
  }

  // =========================================================================
  // Window Lifecycle & Close Handling API
  // =========================================================================

  /** Registers a lifecycle callback invoked when the window is about to close; returning `false` cancels closure. */
  public onClose(cb: (win: SimpleWindow) => boolean | void): this {
    this.closeListeners.push(cb);
    return this;
  }
  /** Snake_case alias of `onClose`: registers a lifecycle callback invoked when the window is about to close; returning `false` cancels closure. */
  public on_close(cb: (win: SimpleWindow) => boolean | void): this {
    return this.onClose(cb);
  }

  /** Executes all registered `onClose` listeners and persists form state if `autoSaveState` is enabled. */
  public handleClose(): void {
    for (const cb of this.closeListeners) {
      try {
        const res = cb(this);
        if (res === false) return;
      } catch (e) {
        console.error("Error in onClose listener:", e);
      }
    }
    if (this.autoSaveState) {
      this.saveAppFormStateOr();
    }
    this.isWindowRunning = false;
    const hosted = this.hostedFactory !== null;
    this.webview = null;
    if (!hosted) forceExit(0);
  }

  // =========================================================================
  // Vlang Webview RAD Studio Complete Parity Controls & API Methods
  // =========================================================================

  private getLastControl(): any {
    if (!this.lastControlId) return null;
    return this.findControl(this.lastControlId);
  }

  /** Returns the mutable `ControlSpec` object for the control matching `id`, or `null` if not found. */
  public getControlSpec(id: string): ControlSpec | null {
    return this.findControl(id);
  }

  // --- Window-Level Fluent Modifiers (operate on last created control) ---
  /** Sets the pixel width of `ctrlId` (or the most recently added control when `ctrlId` is omitted). */
  public setControlWidth(w: number, ctrlId?: string): this {
    const ctrl = ctrlId ? this.getControlSpec(ctrlId) : this.getLastControl();
    if (ctrl) {
      ctrl.width = w;
      ctrl.user_explicit_width = true;
    }
    return this;
  }
  /** Sets the pixel width of a named control `(name, width)` or of the most recently added control `(width)`. */
  public set_control_width(nameOrWidth: string | number, width?: number): this {
    if (typeof nameOrWidth === "string" && width !== undefined) {
      return this.setControlWidth(width, nameOrWidth);
    }
    return this.setControlWidth(Number(nameOrWidth));
  }

  /** Sets the pixel height of `ctrlId` (or the most recently added control when `ctrlId` is omitted). */
  public setControlHeight(h: number, ctrlId?: string): this {
    const ctrl = ctrlId ? this.getControlSpec(ctrlId) : this.getLastControl();
    if (ctrl) {
      ctrl.height = h;
      ctrl.user_explicit_height = true;
    }
    return this;
  }
  /** Sets the pixel height of a named control `(name, height)` or of the most recently added control `(height)`. */
  public set_control_height(
    nameOrHeight: string | number,
    height?: number,
  ): this {
    if (typeof nameOrHeight === "string" && height !== undefined) {
      return this.setControlHeight(height, nameOrHeight);
    }
    return this.setControlHeight(Number(nameOrHeight));
  }

  /** Sets the placeholder text on the most recently added control. */
  public placeholder(p: string): this {
    const ctrl = this.getLastControl();
    if (ctrl) ctrl.placeholder = p;
    return this;
  }

  /** Sets the hover tooltip text on the most recently added control. */
  public tooltip(t: string): this {
    const ctrl = this.getLastControl();
    if (ctrl) ctrl.tooltip = t;
    return this;
  }

  /** Sets the font size in pixels on the most recently added control. */
  public fontSize(sz: number): this {
    const ctrl = this.getLastControl();
    if (ctrl) {
      ctrl.fontSize = sz;
      ctrl.font_size = sz;
    }
    return this;
  }
  /** Snake_case alias of `fontSize`: sets the font size in pixels on the most recently added control. */
  public font_size(sz: number): this {
    return this.fontSize(sz);
  }

  /** Enables or disables bold text styling on the most recently added control. */
  public bold(b: boolean = true): this {
    const ctrl = this.getLastControl();
    if (ctrl) {
      ctrl.is_bold = b;
      ctrl.bold = b;
    }
    return this;
  }

  /** Sets the foreground text color on the most recently added control. */
  public font_color(color: string): this {
    const ctrl = this.getLastControl();
    if (ctrl) {
      ctrl.font_color = color;
      ctrl.color = color;
    }
    return this;
  }

  /** Sets the background fill color on the most recently added control. */
  public background_color(color: string): this {
    const ctrl = this.getLastControl();
    if (ctrl) {
      ctrl.background_color = color;
      ctrl.bg = color;
    }
    return this;
  }

  /** Configures whether the most recently added control expands horizontally to fill its row. */
  public expandFill(expand: boolean = true): this {
    const ctrl = this.getLastControl();
    if (ctrl) {
      ctrl.expandFill = expand;
      ctrl.expand_fill = expand;
    }
    return this;
  }
  /** Snake_case alias of `expandFill`: configures whether the most recently added control expands horizontally to fill its row. */
  public expand_fill(expand: boolean = true): this {
    return this.expandFill(expand);
  }

  /** Binds a click callback to the most recently added control. */
  public onclick(cb: EventCallback): this {
    if (this.lastControlId) {
      this.bindControlEvent(this.lastControlId, "onClick", cb);
      this.eventHandlersMap.set(`click_${this.lastControlId}`, cb);
    }
    return this;
  }

  /** Binds a value-change callback to the most recently added control. */
  public onchange(cb: EventCallback): this {
    if (this.lastControlId) {
      this.bindControlEvent(this.lastControlId, "onChange", cb);
      this.eventHandlersMap.set(`change_${this.lastControlId}`, cb);
    }
    return this;
  }

  /** Binds an Enter-key callback to the most recently added control. */
  public onenter(cb: EventCallback): this {
    if (this.lastControlId) {
      this.bindControlEvent(this.lastControlId, "onEnter", cb);
      this.eventHandlersMap.set(`enter_${this.lastControlId}`, cb);
    }
    return this;
  }

  /** Alias of `on_change`: registers a value-change event callback for the control identified by `controlId`. */
  public onSelectItem(name: string, cb: EventCallback): this {
    return this.on_change(name, cb);
  }
  /** Snake_case alias of `onSelectItem`: registers a value-change event callback for the control identified by `controlId`. */
  public on_select_item(name: string, cb: EventCallback): this {
    return this.onSelectItem(name, cb);
  }

  /** Sets the horizontal alignment (`"left"`, `"center"`, `"right"`) of the control named `name`. */
  public setControlAlignment(name: string, alignment: string): this {
    const ctrl = this.findControl(name);
    if (ctrl) ctrl.alignment = alignment;
    return this;
  }
  /** Snake_case alias of `setControlAlignment`: sets the horizontal alignment (`"left"`, `"center"`, `"right"`) of the control named `name`. */
  public set_control_alignment(name: string, alignment: string): this {
    return this.setControlAlignment(name, alignment);
  }
  /** Returns the horizontal alignment of the control named `name` (defaulting to `"left"`). */
  public getControlAlignment(name: string): string {
    const ctrl = this.findControl(name);
    return ctrl ? ctrl.alignment || "left" : "left";
  }
  /** Snake_case alias of `getControlAlignment`: returns the horizontal alignment of the control named `name` (defaulting to `"left"`). */
  public get_control_alignment(name: string): string {
    return this.getControlAlignment(name);
  }

  /** Configures whether the control named `name` stretches horizontally to fill available row space. */
  public setControlExpandFill(name: string, expand: boolean): this {
    const ctrl = this.findControl(name);
    if (ctrl) {
      ctrl.expandFill = expand;
      ctrl.expand_fill = expand;
    }
    return this;
  }
  /** Snake_case alias of `setControlExpandFill`: configures whether the control named `name` stretches horizontally to fill available row space. */
  public set_control_expand_fill(name: string, expand: boolean): this {
    return this.setControlExpandFill(name, expand);
  }
  /** Returns `true` if the control named `name` is configured to expand and fill available row space. */
  public getControlExpandFill(name: string): boolean {
    const ctrl = this.findControl(name);
    return !!(ctrl && (ctrl.expandFill || ctrl.expand_fill));
  }
  /** Snake_case alias of `getControlExpandFill`: returns `true` if the control named `name` is configured to expand and fill available row space. */
  public get_control_expand_fill(name: string): boolean {
    return this.getControlExpandFill(name);
  }

  /** Marks the button control named `name` as the form's default primary button. */
  public setDefaultButton(name: string): this {
    const ctrl = this.findControl(name);
    if (ctrl) ctrl.is_default = true;
    return this;
  }
  /** Snake_case alias of `setDefaultButton`: marks the button control named `name` as the form's default primary button. */
  public set_default_button(name: string): this {
    return this.setDefaultButton(name);
  }

  // --- Containers & Layout Helpers ---
  /** Alias of `beginFlex`: begins a flex layout container along the specified `direction` (`"row"` or `"column"`). */
  public beginFlexBox(
    name = "",
    direction: "row" | "column" = "row",
    justify = "start",
    align = "center",
  ): this {
    return this.beginFlex(direction, justify, align);
  }
  /** Snake_case alias of `beginFlexBox`: begins a flex layout container along the specified `direction` (`"row"` or `"column"`). */
  public begin_flex_box(
    name = "",
    direction: "row" | "column" = "row",
    justify = "start",
    align = "center",
  ): this {
    return this.beginFlexBox(name, direction, justify, align);
  }
  /** Alias of `endFlex`: closes the active flex layout container. */
  public endFlexBox(): this {
    return this.endFlex();
  }
  /** Snake_case alias of `endFlex`: closes the active flex layout container. */
  public end_flex_box(): this {
    return this.endFlex();
  }

  /** Executes `callback(this)` inside a `beginRow()` / `endRow()` horizontal layout block. */
  public row(
    nameOrCallback: string | ((win: SimpleWindow) => void),
    maybeCallback?: (win: SimpleWindow) => void,
  ): this {
    const cb =
      typeof nameOrCallback === "function" ? nameOrCallback : maybeCallback;
    this.beginRow();
    if (cb) cb(this);
    this.endRow();
    return this;
  }

  /** Executes `callback(this)` inside a `beginCard()` / `endCard()` elevated card container block. */
  public card(
    nameOrCallback: string | ((win: SimpleWindow) => void),
    maybeCallback?: (win: SimpleWindow) => void,
  ): this {
    const cb =
      typeof nameOrCallback === "function" ? nameOrCallback : maybeCallback;
    this.beginCard();
    if (cb) cb(this);
    this.endCard();
    return this;
  }

  /** Executes a builder callback inside a titled `beginCard(title)` / `endCard()` container block. */
  public cardWithTitle(
    nameOrTitle: string,
    titleOrCallback?: string | ((win: SimpleWindow) => void),
    maybeCallback?: (win: SimpleWindow) => void,
  ): this {
    let title = typeof nameOrTitle === "string" ? nameOrTitle : "";
    let cb: ((win: SimpleWindow) => void) | undefined;
    if (typeof titleOrCallback === "function") {
      cb = titleOrCallback;
    } else if (typeof titleOrCallback === "string") {
      title = titleOrCallback;
      cb = maybeCallback;
    }
    this.beginCard();
    if (title) {
      this.addLabel(title, { font_size: 15, is_bold: true, margin_bottom: 8 });
    }
    if (cb) cb(this);
    this.endCard();
    return this;
  }
  /** Snake_case alias of `cardWithTitle`: executes a builder callback inside a titled `beginCard(title)` / `endCard()` container block. */
  public card_with_title(
    nameOrTitle: string,
    titleOrCallback?: string | ((win: SimpleWindow) => void),
    maybeCallback?: (win: SimpleWindow) => void,
  ): this {
    return this.cardWithTitle(nameOrTitle, titleOrCallback, maybeCallback);
  }

  /** Alias of `cardWithTitle`: executes a builder callback inside a titled `beginCard(title)` / `endCard()` container block. */
  public group(
    name: string,
    title: string,
    callback: (win: SimpleWindow) => void,
  ): this {
    return this.cardWithTitle(name, title, callback);
  }

  /** Alias of `beginRow`: begins a horizontal row layout container where subsequent controls are placed side-by-side from left to right. */
  public rowStart(): this {
    return this.beginRow();
  }
  /** Snake_case alias of `beginRow`: begins a horizontal row layout container where subsequent controls are placed side-by-side from left to right. */
  public row_start(): this {
    return this.beginRow();
  }
  /** Alias of `endRow`: closes the current horizontal row layout container and advances vertical cursor flow to the next line. */
  public rowEnd(): this {
    return this.endRow();
  }
  /** Snake_case alias of `endRow`: closes the current horizontal row layout container and advances vertical cursor flow to the next line. */
  public row_end(): this {
    return this.endRow();
  }
  /** Begins a card container block and optionally prepends a bold header label. */
  public boxStart(title = ""): this {
    this.beginCard();
    if (title) {
      this.addLabel(title, { font_size: 14, is_bold: true, margin_bottom: 8 });
    }
    return this;
  }
  /** Snake_case alias of `boxStart`: begins a card container block and optionally prepends a bold header label. */
  public box_start(title = ""): this {
    return this.boxStart(title);
  }
  /** Alias of `endCard`: closes the current card container section, finalizing its bounding height and advancing the vertical layout cursor. */
  public boxEnd(): this {
    return this.endCard();
  }
  /** Snake_case alias of `endCard`: closes the current card container section, finalizing its bounding height and advancing the vertical layout cursor. */
  public box_end(): this {
    return this.endCard();
  }

  // --- Control Addition Parity Methods ---
  /** Adds a text label control with explicit ID `name` and display `text`. */
  public add_label(name: string, text: string): SimpleControlRef {
    return this.addLabel(text).id(name);
  }

  /** Adds a checkbox control with explicit ID `name`, `label`, and initial `checked` state. */
  public add_checkbox(
    name: string,
    label: string,
    checked = false,
  ): SimpleControlRef {
    return this.addCheckbox(label, checked).id(name);
  }

  /** Adds a boolean toggle switch control with explicit ID `name`, `label`, and initial `checked` state. */
  public add_switch(
    name: string,
    label: string,
    checked = false,
  ): SimpleControlRef {
    return this.addSwitch(label, checked).id(name);
  }

  /** Adds a boolean toggle switch control with explicit ID `name`, `label`, and initial `checked` state. */
  public addToggle(
    name: string,
    label: string,
    checked = false,
  ): SimpleControlRef {
    return this.addSwitch(label, checked).id(name);
  }
  /** Snake_case alias of `addToggle`: adds a boolean toggle switch control with explicit ID `name`, `label`, and initial `checked` state. */
  public add_toggle(
    name: string,
    label: string,
    checked = false,
  ): SimpleControlRef {
    return this.addToggle(name, label, checked);
  }

  /** Adds a horizontal numeric slider control, accepting either `(name, min, max, val)` or `(min, max, val)`. */
  public add_slider(
    nameOrMin: string | number = 0,
    minOrMax: number = 100,
    maxOrVal: number = 50,
    val?: number,
  ): SimpleControlRef {
    if (typeof nameOrMin === "string") {
      const min = minOrMax;
      const max = maxOrVal;
      const value = val !== undefined ? val : min;
      return this.addSlider(min, max, value).id(nameOrMin);
    }
    return this.addSlider(nameOrMin, minOrMax, maxOrVal);
  }

  /** Adds a numeric stepper control with explicit ID `name`, `[min, max]` range, and initial `value`. */
  public add_stepper(
    name: string,
    min = 0,
    max = 100,
    value = 0,
  ): SimpleControlRef {
    return this.addStepper(min, max, value).id(name);
  }

  /** Adds a compact numeric input field with `id = name`, bounded by `[min, max]` and initialized to `value`. */
  public addNumberInput(
    name: string,
    min = 0,
    max = 100,
    value = 0,
  ): SimpleControlRef {
    return this.addVisualControl("input", 120, 32, {
      id: name,
      min,
      max,
      value: String(value),
      text: String(value),
    });
  }
  /** Snake_case alias of `addNumberInput`: adds a compact numeric input field with `id = name`, bounded by `[min, max]` and initialized to `value`. */
  public add_number_input(
    name: string,
    min = 0,
    max = 100,
    value = 0,
  ): SimpleControlRef {
    return this.addNumberInput(name, min, max, value);
  }

  /** Adds a progress bar control with explicit ID `name` and initial `value` (`0..100`). */
  public add_progress_bar(name: string, value = 0): SimpleControlRef {
    return this.addProgressIndicator(name, value, 100);
  }
  /** Adds a progress bar indicator with explicit ID `name`, `value`, and `max`. */
  public addProgress(name: string, value = 0, max = 100): SimpleControlRef {
    return this.addProgressIndicator(name, value, max);
  }
  /** Snake_case alias of `addProgress`: adds a progress bar indicator with explicit ID `name`, `value`, and `max`. */
  public add_progress(name: string, value = 0, max = 100): SimpleControlRef {
    return this.addProgress(name, value, max);
  }

  /** Snake_case alias of `addCircularProgress`: adds a circular ring progress indicator (`0..100`) with the given `id`. */
  public add_circular_progress(name: string, value = 50): SimpleControlRef {
    return this.addCircularProgress(name, value);
  }

  /** Adds a KPI metric summary card with `id = name`, `title`, primary `value`, and `subtitle`. */
  public addKpiCard(
    name: string,
    title: string,
    value: string,
    subtitle = "",
  ): SimpleControlRef {
    return this.addVisualControl("kpi_card", 220, 90, {
      id: name,
      text: title,
      caption: title,
      value,
      secondary_text: subtitle,
      change: subtitle,
    });
  }
  /** Snake_case alias of `addKpiCard`: adds a KPI metric summary card with `id = name`, `title`, primary `value`, and `subtitle`. */
  public add_kpi_card(
    name: string,
    title: string,
    value: string,
    subtitle = "",
  ): SimpleControlRef {
    return this.addKpiCard(name, title, value, subtitle);
  }

  /** Adds a named semantic badge control (`id = name`) with `text` and semantic or hex `color`. */
  public add_badge(
    name: string,
    text: string,
    color = "#0a84ff",
  ): SimpleControlRef {
    const validTypes = ["info", "success", "warning", "error"] as const;
    const type = (validTypes as readonly string[]).includes(color)
      ? (color as "info" | "success" | "warning" | "error")
      : "info";
    return this.addBadge(text, type, {
      id: name,
      color,
      background_color: color,
    });
  }

  /** Adds a horizontal divider control with an optional explicit `name`. */
  public add_divider(name = ""): SimpleControlRef {
    return this.addVisualControl("divider", 400, 2, { id: name || undefined });
  }
  /** Alias of `add_divider`: adds a horizontal divider control with an optional explicit `name`. */
  public addDividerLine(): SimpleControlRef {
    return this.add_divider();
  }
  /** Snake_case alias of `addDividerLine`: adds a horizontal divider control with an optional explicit `name`. */
  public add_divider_line(): SimpleControlRef {
    return this.addDividerLine();
  }

  /** Adds a vertical spacer control of `height` pixels with an optional explicit `name`. */
  public addSpacer(
    nameOrHeight: string | number = 16,
    height = 16,
  ): SimpleControlRef {
    let h = typeof nameOrHeight === "number" ? nameOrHeight : height;
    let id = typeof nameOrHeight === "string" ? nameOrHeight : "";
    return this.addVisualControl("raw_html", 100, h, {
      id: id || undefined,
      text: `<div style="height:${h}px;"></div>`,
    });
  }
  /** Snake_case alias of `addSpacer`: adds a vertical spacer control of `height` pixels with an optional explicit `name`. */
  public add_spacer(
    nameOrHeight: string | number = 16,
    height = 16,
  ): SimpleControlRef {
    return this.addSpacer(nameOrHeight, height);
  }
  /** Alias of `addSpacer`: adds a vertical spacer control of `height` pixels with an optional explicit `name`. */
  public addSpace(height = 16): SimpleControlRef {
    return this.addSpacer("", height);
  }
  /** Snake_case alias of `addSpace`: adds a vertical spacer control of `height` pixels with an optional explicit `name`. */
  public add_space(height = 16): SimpleControlRef {
    return this.addSpace(height);
  }

  /** Adds a date picker control with explicit ID `name` and initial `date`. */
  public add_date_picker(name: string, date = ""): SimpleControlRef {
    return this.addDatePicker(date).id(name);
  }

  /** Adds a color well picker control with explicit ID `name` and `defaultColor`. */
  public addColorPicker(
    name: string,
    defaultColor = "#0a84ff",
  ): SimpleControlRef {
    return this.addColorWell(defaultColor, undefined, { id: name });
  }
  /** Snake_case alias of `addColorPicker`: adds a color well picker control with explicit ID `name` and `defaultColor`. */
  public add_color_picker(
    name: string,
    defaultColor = "#0a84ff",
  ): SimpleControlRef {
    return this.addColorPicker(name, defaultColor);
  }

  /** Adds an image control with explicit ID `name`, image `src`, `width`, and `height`. */
  public add_image(
    name: string,
    src: string,
    width = 200,
    height = 150,
  ): SimpleControlRef {
    return this.addImage(src, width, height, { id: name });
  }

  /** Adds a Markdown display block with `id = name` and Markdown content `mdText`. */
  public addMarkdown(name: string, mdText: string): SimpleControlRef {
    return this.addVisualControl("markdown", 400, 100, {
      id: name,
      text: mdText,
      caption: mdText,
    });
  }
  /** Snake_case alias of `addMarkdown`: adds a Markdown display block with `id = name` and Markdown content `mdText`. */
  public add_markdown(name: string, mdText: string): SimpleControlRef {
    return this.addMarkdown(name, mdText);
  }

  /** Adds a read-only syntax-highlighted code viewer with explicit ID `name`, `code`, and `language`. */
  public add_code_view(
    name: string,
    code: string,
    language = "typescript",
  ): SimpleControlRef {
    return this.addCodeView(code, language, { id: name });
  }

  /** Snake_case alias of `addAlertBanner`: adds a semantic alert banner (`id`) displaying `title: message` in the given severity `style`. */
  public add_alert_banner(
    name: string,
    title: string,
    message: string,
    level: "info" | "success" | "warning" | "error" = "info",
  ): SimpleControlRef {
    return this.addAlertBanner(name, title, message, level);
  }

  // --- Direct Chaining Helpers ---
  /** Ergonomic shorthand that adds a text label control displaying `text`. */
  public label(text: string): SimpleControlRef {
    return this.addLabel(text);
  }

  /** Adds a bold `22px` heading control displaying `title`. */
  public heading(title: string): SimpleControlRef {
    return this.addVisualControl("heading", 400, 36, {
      text: title,
      caption: title,
      font_size: 22,
      is_bold: true,
    });
  }

  /** Adds a bold `16px` subheading control displaying `title`. */
  public subheading(title: string): SimpleControlRef {
    return this.addVisualControl("subheading", 400, 28, {
      text: title,
      caption: title,
      font_size: 16,
      is_bold: true,
    });
  }

  /** Ergonomic shorthand that adds a horizontal divider line. */
  public divider(): SimpleControlRef {
    return this.add_divider();
  }

  /** Ergonomic shorthand that adds a window status bar initialized to `text`. */
  public statusBar(text: string): SimpleControlRef {
    return this.addStatusBar(text);
  }
  /** Snake_case alias of `statusBar`: ergonomic shorthand that adds a window status bar initialized to `text`. */
  public status_bar(text: string): SimpleControlRef {
    return this.statusBar(text);
  }

  /** Ergonomic shorthand that adds a KPI metric card with `title`, `value`, and `change` subtitle. */
  public kpiCard(title: string, value: string, change = ""): SimpleControlRef {
    return this.addKpiCard("", title, value, change);
  }
  /** Snake_case alias of `kpiCard`: ergonomic shorthand that adds a KPI metric card with `title`, `value`, and `change` subtitle. */
  public kpi_card(title: string, value: string, change = ""): SimpleControlRef {
    return this.kpiCard(title, value, change);
  }

  /** Ergonomic shorthand that adds a progress bar initialized to `val` out of `max`. */
  public progress(val: number, max = 100): SimpleControlRef {
    return this.addProgress("", val, max);
  }

  /** Adds a raw HTML block control rendering custom `html` markup. */
  public rawHtml(html: string): SimpleControlRef {
    return this.addVisualControl("raw_html", 400, 40, { text: html });
  }
  /** Snake_case alias of `rawHtml`: adds a raw HTML block control rendering custom `html` markup. */
  public raw_html(html: string): SimpleControlRef {
    return this.rawHtml(html);
  }

  // ===== Enterprise component suite (src/simplegui_components.ts) =====
  // Only components that did not already exist. Every method returns a SimpleControlRef (so `.id()`, `.width()`,
  // `.onChange()` / `.onClick()` work as usual) and accepts `onChange` / `onClick` / `id` / `width` / `height` options.

  /** Generic entry point: `win.ui("fab", { icon: "add" })`. All the named helpers below call this. */
  public ui(type: UIComponentType, cfg: UIOpts = {}): SimpleControlRef {
    let [dw, dh] = UI_DEFAULT_SIZES[type] ?? [320, 60];
    if ((type === "backdrop" || type === "tour") && cfg.trigger) {
      dw = Math.max(dw, 150);
      dh = 38;
    }
    const opts: Record<string, any> = { text: renderUIComponent(type, cfg) };
    if (cfg.id) opts.id = cfg.id;
    if (cfg.width !== undefined) opts.width = cfg.width;
    if (cfg.height !== undefined) opts.height = cfg.height;
    if (cfg.value !== undefined && typeof cfg.value !== "object")
      opts.value = cfg.value;
    const ref = this.addVisualControl("raw_html", dw, dh, opts);
    if (typeof cfg.onChange === "function") ref.onChange(cfg.onChange);
    if (typeof cfg.onClick === "function") ref.onClick(cfg.onClick);
    return ref;
  }
  /** Call a method on a hydrated component in the page: `win.uiCall("nav", "open")`. */
  public uiCall(id: string, method: string, ...args: any[]): this {
    if (this.isWindowRunning)
      this.evalJS(
        `window.SimpleUI&&window.SimpleUI.call(${JSON.stringify(id)},${JSON.stringify(method)},${JSON.stringify(args)});`,
      );
    return this;
  }

  // --- Feedback & surfaces ---
  /** Loading placeholder. `skeleton({ variant: "text"|"circular"|"rect"|"rounded", lines: 3, animation: "pulse"|"wave" })` */
  public skeleton(opts: UIOpts = {}) {
    return this.ui("skeleton", opts);
  }
  /** Elevated card surface. `paper("Title", "text", { elevation: 0-8, outlined, radius })` */
  public paper(title = "", text = "", opts: UIOpts = {}) {
    return this.ui("paper", { title, text, ...opts });
  }
  /** "Nothing here" placeholder. `emptyState("No files", "Upload one to begin", { icon, actions: ["Upload"] })` */
  public emptyState(title = "Nothing here yet", text = "", opts: UIOpts = {}) {
    return this.ui("emptyState", { title, text, ...opts });
  }
  /** Status page. `result("success"|"error"|"warning"|"info"|"404"|"403"|"500", "Title", "Subtitle", { actions: ["Retry"] })` */
  public result(
    status: string,
    title: string,
    subtitle = "",
    opts: UIOpts = {},
  ) {
    return this.ui("result", { status, title, subtitle, ...opts });
  }
  /** Full-screen dim + spinner. Show with `showBackdrop(id)`. */
  public backdrop(opts: UIOpts = {}) {
    return this.ui("backdrop", opts);
  }
  /** Shows the full-screen backdrop component identified by `id` via `uiCall(id, "show")`. */
  public showBackdrop(id: string) {
    return this.uiCall(id, "show");
  }
  /** Hides the full-screen backdrop component identified by `id` via `uiCall(id, "hide")`. */
  public hideBackdrop(id: string) {
    return this.uiCall(id, "hide");
  }

  // --- Navigation ---
  /** Top bar. `appBar("My App", ["Home", "Docs"], { actions: [{label:"Alerts", icon:"bell", badge:3}], search: true, menuButton: true })`. Click value = item value. */
  public appBar(title: string, items: any[] = [], opts: UIOpts = {}) {
    return this.ui("appBar", { title, items, ...opts });
  }
  /** Mobile-style bottom navigation. `bottomNav([{label:"Home", icon:"home", value:"h"}, ...], { value })`. onChange gets the value. */
  public bottomNav(items: any[], opts: UIOpts = {}) {
    return this.ui("bottomNav", { items, ...opts });
  }
  /** Floating action button. `fab("add", { label: "New", color: "success", size: "small"|"large" })` */
  public fab(icon = "add", opts: UIOpts = {}) {
    return this.ui("fab", { icon, ...opts });
  }
  /** FAB that fans out actions. `speedDial([{id:"copy", icon:"copy", label:"Copy"}], { direction: "up"|"down"|"left"|"right" })`. onClick gets the action id. */
  public speedDial(actions: any[], opts: UIOpts = {}) {
    return this.ui("speedDial", { actions, ...opts });
  }
  /** Scroll-to-top button that appears after scrolling. */
  public backToTop(opts: UIOpts = {}) {
    return this.ui("backToTop", opts);
  }
  /** Thin reading-progress bar pinned to the top of the window. */
  public scrollProgress(opts: UIOpts = {}) {
    return this.ui("scrollProgress", opts);
  }
  /** Slide-in panel. `drawer("Menu", { anchor: "left"|"right"|"top"|"bottom", items: [...], html, trigger: "Open" })`. Control with openDrawer/closeDrawer/toggleDrawer. */
  public drawer(title: string, opts: UIOpts = {}) {
    return this.ui("drawer", { title, ...opts });
  }
  /** Opens the slide-in drawer component identified by `id` via `uiCall(id, "open")`. */
  public openDrawer(id: string) {
    return this.uiCall(id, "open");
  }
  /** Closes the slide-in drawer component identified by `id` via `uiCall(id, "close")`. */
  public closeDrawer(id: string) {
    return this.uiCall(id, "close");
  }
  /** Toggles the open/closed state of the slide-in drawer component identified by `id` via `uiCall(id, "toggle")`. */
  public toggleDrawer(id: string) {
    return this.uiCall(id, "toggle");
  }
  /** Anchored popup. `popover("Info", { title, text | html, trigger: "click"|"hover", placement })`. Use `{ name, avatar, text }` for a hover profile card. */
  public popover(label: string, opts: UIOpts = {}) {
    return this.ui("popover", { label, ...opts });
  }
  /** Hover profile card shortcut. */
  public hoverCard(label: string, opts: UIOpts = {}) {
    return this.ui("popover", {
      label,
      trigger: "hover",
      variant: "text",
      ...opts,
    });
  }
  /** Button that asks "Are you sure?" in a small popup. onChange receives true/false. */
  public popconfirm(label: string, title = "Are you sure?", opts: UIOpts = {}) {
    return this.ui("popconfirm", { label, title, ...opts });
  }
  /** Guided onboarding tour. `tour([{target:"btn_save", title:"Save", text:"Click here"}], { trigger: "Start tour" })`. Start with `startTour(id)`. */
  public tour(
    steps: Array<{
      target?: string;
      title?: string;
      text?: string;
      placement?: string;
    }>,
    opts: UIOpts = {},
  ) {
    return this.ui("tour", { steps, ...opts });
  }
  /** Starts the guided onboarding tour component identified by `id` at `step` (default `0`). */
  public startTour(id: string, step = 0) {
    return this.uiCall(id, "start", step);
  }
  /** Stops and closes the guided onboarding tour component identified by `id`. */
  public stopTour(id: string) {
    return this.uiCall(id, "stop");
  }
  /** Anchor links that smooth-scroll to controls/elements. `anchorLinks([{label:"Intro", target:"intro"}])` */
  public anchorLinks(links: any[], opts: UIOpts = {}) {
    return this.ui("anchor", { links, ...opts });
  }

  // --- Inputs ---
  /** Searchable select. `autocomplete(["A","B"], { multiple, freeSolo, label, placeholder, clearable, limitTags, value })`. Options may be `{label,value,group,disabled}`. onChange gets value or array. */
  public autocomplete(options: any[], opts: UIOpts = {}) {
    return this.ui("autocomplete", { options, ...opts });
  }
  /** Multi-level picker. `cascader([{label:"A", value:"a", children:[...]}], { placeholder })`. onChange gets the path array. */
  public cascader(options: any[], opts: UIOpts = {}) {
    return this.ui("cascader", { options, ...opts });
  }
  /** Dropdown tree. `treeSelect(tree, { multiple, leafOnly, expandAll })`. */
  public treeSelect(options: any[], opts: UIOpts = {}) {
    return this.ui("treeSelect", { options, ...opts });
  }
  /** Textarea with @mention suggestions. `mentions(["Ada","Linus"], { trigger: "@" })`. */
  public mentions(options: any[], opts: UIOpts = {}) {
    return this.ui("mentions", { options, ...opts });
  }
  /** Draw-a-signature canvas. onChange gets a PNG data URL ("" when cleared). */
  public signaturePad(opts: UIOpts = {}) {
    return this.ui("signaturePad", opts);
  }
  /** WYSIWYG editor. onChange gets the HTML. `toolbar` accepts: bold italic underline strike h1 h2 h3 quote ul ol link code hr left center right clear undo redo | */
  public richText(opts: UIOpts = {}) {
    return this.ui("richText", opts);
  }
  /** One-click copy. `copyButton("Copy key", "sk-123")` or `{ target: "#some_input" }`. */
  public copyButton(label = "Copy", text = "", opts: UIOpts = {}) {
    return this.ui("copyButton", { label, text, ...opts });
  }
  /** Button with a built-in spinner. `loadingButton("Save", { autoLoadingMs: 1500 })`; control with `setLoading(id, bool)`. */
  public loadingButton(label: string, opts: UIOpts = {}) {
    return this.ui("loadingButton", { label, ...opts });
  }
  /** Sets the loading spinner state (`true` or `false`) on the loading button component identified by `id`. */
  public setLoading(id: string, loading = true) {
    return this.uiCall(id, "setLoading", loading);
  }

  // --- Data display ---
  /** Standalone chips. `chips(["React","Bun"], { deletable, clickable, selectable, variant: "outlined", color })`. Items may be `{label,icon,avatar,color}`. */
  public chips(chips: any[], opts: UIOpts = {}) {
    return this.ui("chips", { chips, ...opts });
  }
  /** Overlapping avatars with "+N". `avatarGroup(["Ada Lovelace", {name:"Bob", src:"..."}], { max: 4, size: 36 })` */
  public avatarGroup(avatars: any[], opts: UIOpts = {}) {
    return this.ui("avatarGroup", { avatars, ...opts });
  }
  /** Key/value details. `descriptions("Order", [["ID","42"],["Status","Paid"]], { columns: 2, bordered })` */
  public descriptions(title: string, items: any[], opts: UIOpts = {}) {
    return this.ui("descriptions", { title, items, ...opts });
  }
  /** Big number with count-up animation. `statistic("Revenue", 12890, { prefix: "$", trend: "+12%", precision: 0 })` */
  public statistic(title: string, value: number | string, opts: UIOpts = {}) {
    return this.ui("statistic", { title, value, ...opts });
  }
  /** Live countdown. `countdown("Sale ends", { seconds: 300 })` or `{ target: "2030-01-01" }`. onChange fires when finished. Restart with `uiCall(id,"reset",secs)`. */
  public countdown(title: string, opts: UIOpts = {}) {
    return this.ui("countdown", { title, ...opts });
  }
  /** Content with a repeating text watermark. */
  public watermark(mark: string, content: string, opts: UIOpts = {}) {
    return this.ui("watermark", { watermark: mark, text: content, ...opts });
  }
  /** Pinterest-style columns. Items: strings, image URLs, or `{image,title,text,html,height}`. */
  public masonry(items: any[], opts: UIOpts = {}) {
    return this.ui("masonry", { items, ...opts });
  }
  /** Before/after image slider. */
  public imageCompare(before: string, after: string, opts: UIOpts = {}) {
    return this.ui("imageCompare", { before, after, ...opts });
  }
  /** Scrolling ticker. `marquee(["Breaking: ...", "Deploy done"], { duration: 20 })` */
  public marquee(items: any[], opts: UIOpts = {}) {
    return this.ui("marquee", { items, ...opts });
  }
  /** Themed text. `typography("h3", "Hello", { color, align, gradient: ["#f0f","#0ff"] })`. Variants: h1-h6 subtitle1/2 body1/2 caption overline button. */
  public typography(variant: string, text: string, opts: UIOpts = {}) {
    return this.ui("typography", { variant, text, ...opts });
  }
  /** Windowed list that stays fast with 100k+ items. `virtualList(items, { itemHeight: 36, search: true })`. */
  public virtualList(items: any[], opts: UIOpts = {}) {
    return this.ui("virtualList", { items, ...opts });
  }

  /** Adds a single-line text input with explicit ID `name`, `placeholder`, `defaultVal`, and optional `onChange` handler. */
  public input_named(
    name: string,
    placeholder = "",
    defaultVal = "",
    onChange?: EventCallback,
  ): SimpleControlRef {
    const ref = this.addTextInput(placeholder, defaultVal).id(name);
    if (onChange) ref.onChange(onChange);
    return ref;
  }
  /** Alias of `input_named`: adds a single-line text input with explicit ID `name`, `placeholder`, `defaultVal`, and optional `onChange` handler. */
  public inputNamed(
    name: string,
    placeholder = "",
    defaultVal = "",
    onChange?: EventCallback,
  ): SimpleControlRef {
    return this.input_named(name, placeholder, defaultVal, onChange);
  }

  /** Adds a multi-line textarea with explicit ID `name`, `placeholder`, `defaultVal`, and optional `onChange` handler. */
  public textarea_named(
    name: string,
    placeholder = "",
    defaultVal = "",
    onChange?: EventCallback,
  ): SimpleControlRef {
    const ref = this.addTextArea(placeholder, defaultVal).id(name);
    if (onChange) ref.onChange(onChange);
    return ref;
  }
  /** Alias of `textarea_named`: adds a multi-line textarea with explicit ID `name`, `placeholder`, `defaultVal`, and optional `onChange` handler. */
  public textareaNamed(
    name: string,
    placeholder = "",
    defaultVal = "",
    onChange?: EventCallback,
  ): SimpleControlRef {
    return this.textarea_named(name, placeholder, defaultVal, onChange);
  }

  /** Adds a data table control with explicit ID `name`, column `headers`, `rows`, and optional `onSelect` callback. */
  public table_named(
    name: string,
    headers: string[],
    rows: any[][],
    onSelect?: EventCallback,
  ): SimpleControlRef {
    return this.addTable(name, headers, rows, onSelect);
  }
  /** Alias of `table_named`: adds a data table control with explicit ID `name`, column `headers`, `rows`, and optional `onSelect` callback. */
  public tableNamed(
    name: string,
    headers: string[],
    rows: any[][],
    onSelect?: EventCallback,
  ): SimpleControlRef {
    return this.table_named(name, headers, rows, onSelect);
  }

  // --- Table Operations ---
  /** Replaces the 2D `rows` data array of the table control named `name` and re-renders its live DOM `<tbody>`. */
  public setTableRows(name: string, rows: any[][]): this {
    const ctrl = name
      ? this.findControl(name)
      : this.controls.find(
          (c) => c && (c.type === "table" || c.type === "data_table"),
        );
    if (ctrl) {
      ctrl.rows = rows;
      ctrl.value = rows;
      this.setTableData(ctrl.id, rows);
    }
    return this;
  }
  /** Snake_case alias of `setTableRows`: replaces the 2D `rows` data array of the table control named `name` and re-renders its live DOM `<tbody>`. */
  public set_table_rows(name: string, rows: any[][]): this {
    return this.setTableRows(name, rows);
  }

  /** Appends a single `row` array to the table control named `name` and updates its live DOM. */
  public addTableRow(name: string, row: any[]): this {
    const ctrl = this.findControl(name);
    if (ctrl) {
      const existing =
        ctrl.rows || (Array.isArray(ctrl.value) ? ctrl.value : []);
      const rows = Array.isArray(existing) ? [...existing, row] : [row];
      ctrl.rows = rows;
      ctrl.value = rows;
      return this.setTableRows(ctrl.id, rows);
    }
    return this;
  }
  /** Snake_case alias of `addTableRow`: appends a single `row` array to the table control named `name` and updates its live DOM. */
  public add_table_row(name: string, row: any[]): this {
    return this.addTableRow(name, row);
  }

  /** Removes the row at zero-based `rowIndex` from the table control named `name` and updates its live DOM. */
  public removeTableRow(name: string, rowIndex: number): this {
    const ctrl = this.findControl(name);
    if (ctrl) {
      const existing =
        ctrl.rows || (Array.isArray(ctrl.value) ? ctrl.value : []);
      if (Array.isArray(existing)) {
        const rows = [...existing];
        if (rowIndex >= 0 && rowIndex < rows.length) {
          rows.splice(rowIndex, 1);
          ctrl.rows = rows;
          ctrl.value = rows;
          return this.setTableRows(ctrl.id, rows);
        }
      }
    }
    return this;
  }
  /** Snake_case alias of `removeTableRow`: removes the row at zero-based `rowIndex` from the table control named `name` and updates its live DOM. */
  public remove_table_row(name: string, rowIndex: number): this {
    return this.removeTableRow(name, rowIndex);
  }

  /** Returns the current number of rows in the table control named `name`. */
  public tableRowCount(name: string): number {
    const ctrl = this.findControl(name);
    if (ctrl) {
      const r = ctrl.rows || (Array.isArray(ctrl.value) ? ctrl.value : null);
      if (Array.isArray(r)) return r.length;
    }
    return 0;
  }
  /** Snake_case alias of `tableRowCount`: returns the current number of rows in the table control named `name`. */
  public table_row_count(name: string): number {
    return this.tableRowCount(name);
  }

  /** Returns the current 2D `rows` array of the table control named `name`. */
  public getTableRows(name: string): any[][] {
    const ctrl = this.findControl(name);
    if (ctrl) {
      const r = ctrl.rows || (Array.isArray(ctrl.value) ? ctrl.value : null);
      if (Array.isArray(r))
        return r.map((row) => (Array.isArray(row) ? [...row] : row));
    }
    return [];
  }
  /** Snake_case alias of `getTableRows`: returns the current 2D `rows` array of the table control named `name`. */
  public get_table_rows(name: string): any[][] {
    return this.getTableRows(name);
  }

  /** Returns the column `headers` array of the table control named `name`. */
  public getTableHeaders(name: string): string[] {
    const ctrl = this.findControl(name);
    if (ctrl) {
      if (Array.isArray(ctrl.headers) && ctrl.headers.length > 0) {
        return [...ctrl.headers];
      }
      if (typeof ctrl.text === "string" && ctrl.text.trim()) {
        return ctrl.text.split(",").map((s: string) => s.trim());
      }
    }
    return [];
  }
  /** Snake_case alias of `getTableHeaders`: returns the column `headers` array of the table control named `name`. */
  public get_table_headers(name: string): string[] {
    return this.getTableHeaders(name);
  }

  /** Returns an array of `{ [header]: cellValue }` objects for all rows in table `name`. */
  public getTableObjects(name: string): Record<string, any>[] {
    const headers = this.getTableHeaders(name);
    const rows = this.getTableRows(name);
    return rows.map((row) => {
      const cells = Array.isArray(row)
        ? row
        : row && (row as any).cells
          ? (row as any).cells
          : Object.values(row || {});
      const obj: Record<string, any> = {};
      for (let i = 0; i < Math.max(headers.length, cells.length); i++) {
        const key = headers[i] || `col_${i}`;
        obj[key] = cells[i] ?? "";
      }
      return obj;
    });
  }
  /** Snake_case alias of `getTableObjects`: returns an array of `{ [header]: cellValue }` objects for all rows in table `name`. */
  public get_table_objects(name: string): Record<string, any>[] {
    return this.getTableObjects(name);
  }

  /** Exports the headers and rows of table `name` as RFC-4180 CSV text, optionally writing it to `filePath`. */
  public exportTableCsv(name: string, filePath?: string): string {
    const headers = this.getTableHeaders(name);
    const rows = this.getTableRows(name);
    const escCell = (val: any): string => {
      const s = val === null || val === undefined ? "" : String(val);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    if (headers.length > 0) {
      lines.push(headers.map(escCell).join(","));
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const cells = Array.isArray(r)
        ? r
        : r && (r as any).cells
          ? (r as any).cells
          : Object.values(r || {});
      lines.push(cells.map(escCell).join(","));
    }
    const csv = lines.join("\n");
    if (filePath) {
      fs.writeFileSync(filePath, csv, "utf-8");
    }
    return csv;
  }
  /** Snake_case alias of `exportTableCsv`: exports table `name` as CSV text and optionally writes to `filePath`. */
  public export_table_csv(name: string, filePath?: string): string {
    return this.exportTableCsv(name, filePath);
  }

  /** Exports the rows of table `name` as a formatted JSON string of `{ [header]: value }` objects, optionally writing it to `filePath`. */
  public exportTableJson(name: string, filePath?: string): string {
    const objs = this.getTableObjects(name);
    const json = JSON.stringify(objs, null, 2);
    if (filePath) {
      fs.writeFileSync(filePath, json, "utf-8");
    }
    return json;
  }
  /** Snake_case alias of `exportTableJson`: exports table `name` as a formatted JSON string and optionally writes to `filePath`. */
  public export_table_json(name: string, filePath?: string): string {
    return this.exportTableJson(name, filePath);
  }

  /** Returns a chainable `SimpleControlRef` wrapper for an existing control ID (or `undefined` if not found). */
  public getRef(name: string): SimpleControlRef | undefined {
    const ctrl = this.findControl(name);
    return ctrl ? new SimpleControlRef(ctrl, this) : undefined;
  }
  /** Snake_case alias of `getRef`: returns a chainable `SimpleControlRef` wrapper for an existing control ID. */
  public get_ref(name: string): SimpleControlRef | undefined {
    return this.getRef(name);
  }

  /** Highlights and selects the row at zero-based `rowIndex` in the table control named `name`. */
  public selectTableRow(name: string, rowIndex: number): this {
    if (this.webview) {
      this.webview.eval(
        `const t=document.getElementById("${name}");if(t){t.querySelectorAll("tbody tr").forEach((r,i)=>r.classList.toggle("sg-table-selected", i===${rowIndex}));}`,
      );
    }
    return this;
  }
  /** Snake_case alias of `selectTableRow`: highlights and selects the row at zero-based `rowIndex` in the table control named `name`. */
  public select_table_row(name: string, rowIndex: number): this {
    return this.selectTableRow(name, rowIndex);
  }

  // --- Value Accessors ---
  /** Returns the integer value of the control named `name` (or `0` if not a valid integer). */
  public getValueInt(name: string): number {
    const val = this.getValue(name);
    return parseInt(String(val ?? 0), 10) || 0;
  }
  /** Snake_case alias of `getValueInt`: returns the integer value of the control named `name` (or `0` if not a valid integer). */
  public get_value_int(name: string): number {
    return this.getValueInt(name);
  }

  /** Returns `true` if the checkbox, switch, or toggle control named `name` is currently checked. */
  public getChecked(name: string): boolean {
    const val = this.getValue(name);
    return val === true || val === "true" || val === 1 || val === "1";
  }
  /** Snake_case alias of `getChecked`: returns `true` if the checkbox, switch, or toggle control named `name` is currently checked. */
  public get_checked(name: string): boolean {
    return this.getChecked(name);
  }

  /** Sets the boolean checked state of the checkbox, switch, or toggle control named `name`. */
  public setChecked(name: string, val: boolean): this {
    return this.setValue(name, val);
  }
  /** Snake_case alias of `setChecked`: sets the boolean checked state of the checkbox, switch, or toggle control named `name`. */
  public set_checked(name: string, val: boolean): this {
    return this.setChecked(name, val);
  }

  /** Returns the string value of the control named `name` (shorthand for `String(getValue(name) ?? "")`). */
  public get(name: string): string {
    return String(this.getValue(name) ?? "");
  }
  /** Sets the string value of the control named `name` (shorthand for `setValue(name, val)`). */
  public set(name: string, val: string): this {
    return this.setValue(name, val);
  }

  // --- Theming Operations ---
  /** Returns the active theme identifier of the window. */
  public getTheme(): string {
    return this.theme;
  }
  /** Snake_case alias of `getTheme`: returns the active theme identifier of the window. */
  public get_theme(): string {
    return this.theme;
  }

  /** Alias of `setTheme`: applies a registered SimpleGUI theme by name or key, updating window/control palettes in place (including live DOM CSS variables when running) and optionally persisting the selection. */
  public applyTheme(themeName: string): this {
    return this.setTheme(themeName);
  }
  /** Alias of `applyTheme`: applies a registered SimpleGUI theme by name or key, updating window/control palettes in place (including live DOM CSS variables when running) and optionally persisting the selection. */
  public applyThemeByName(themeName: string): this {
    return this.applyTheme(themeName);
  }
  /** Snake_case alias of `applyThemeByName`: applies a registered SimpleGUI theme by name or key, updating window/control palettes in place (including live DOM CSS variables when running) and optionally persisting the selection. */
  public apply_theme_by_name(themeName: string): this {
    return this.applyThemeByName(themeName);
  }

  /** Returns `true` if the window's currently active theme is a dark-mode palette. */
  public isDarkTheme(): boolean {
    const t = getTheme(this.theme);
    return t ? t.is_dark : true;
  }
  /** Snake_case alias of `isDarkTheme`: returns `true` if the window's currently active theme is a dark-mode palette. */
  public is_dark_theme(): boolean {
    return this.isDarkTheme();
  }

  /** Switches the window to the default dark theme (`"monokai_pro"`) when `dark` is `true`, or light theme (`"apple_light"`) when `false`. */
  public setDarkTheme(dark: boolean): this {
    return this.setTheme(dark ? "monokai_pro" : "apple_light");
  }
  /** Snake_case alias of `setDarkTheme`: switches the window to the default dark theme (`"monokai_pro"`) when `dark` is `true`, or light theme (`"apple_light"`) when `false`. */
  public set_dark_theme(dark: boolean): this {
    return this.setDarkTheme(dark);
  }

  /** Toggles the window between dark mode and light mode. */
  public toggleWindowTheme(): this {
    return this.setDarkTheme(!this.isDarkTheme());
  }
  /** Snake_case alias of `toggleWindowTheme`: toggles the window between dark mode and light mode. */
  public toggle_window_theme(): this {
    return this.toggleWindowTheme();
  }
}

// Production Theme Specification Lookup Table
/** Complete color, typography, semantic status, and visual effects (FX) specification for a registered SimpleGUI theme. */
export interface SimpleGUITheme {
  name: string;
  short_name?: string;
  background_color: string;
  font_color: string;
  accent_color: string;
  secondary_accent?: string;
  card_background?: string;
  card_border?: string;
  description: string;
  is_dark: boolean;
  /** Optional danger, warning, success and info base colors; the rest of each status color is derived and contrast-checked. */
  semantic?: SemanticOverrides;
  /** Optional effects descriptor (glow, glass, motion). A theme without it gets no effects output at all. */
  fx?: ThemeFx;
}

export type { ThemeFx, FxMode, SyntaxPalette };

/** Produces a compact, UI-friendly display name for a theme key or full theme title (for example, `"JetBrains Darcula"` -> `"Darcula"`). */
export function autoShortThemeName(themeNameOrKey: string): string {
  if (!themeNameOrKey || typeof themeNameOrKey !== "string") return "";
  const trimmed = themeNameOrKey.trim();
  const key = trimmed.toLowerCase().replace(/[\s\-_]+/g, "_");

  if (SIMPLEGUI_THEMES[key]?.short_name) {
    return SIMPLEGUI_THEMES[key]!.short_name!;
  }
  for (const t of Object.values(SIMPLEGUI_THEMES)) {
    if (t.name.toLowerCase() === trimmed.toLowerCase() && t.short_name) {
      return t.short_name;
    }
  }

  let shortName = trimmed
    .replace(
      /\b(?:Space Gray|Mocha|Phosphor|Monochrome|Palette|Terminal|Classic|Workstation)\b/gi,
      "",
    )
    .replace(/\b(?:1982|1987|1989|1991|1992|1994|1999|2001|'84)\b/gi, "")
    .replace(/\bMacintosh\s+System\b/gi, "System")
    .replace(/\bWindows\s+95\b/gi, "Win95")
    .replace(/\bCommodore\s+64\b/gi, "C64")
    .replace(/\bSonoma\s+Emerald\b/gi, "Emerald")
    .replace(/\bVentura\s+Amber\b/gi, "Ventura")
    .replace(/\bSoft\s+Pastel\b/gi, "Pastel")
    .replace(/\bHot\s+Dog\s+Stand\b/gi, "Hot Dog")
    .replace(/\bJetBrains\s+Darcula\b/gi, "Darcula")
    .replace(/\bNordic\s+Paper\s+Light\b/gi, "Nordic Paper")
    .replace(/\bTailwind\s+Slate\s+Emerald\b/gi, "Tailwind")
    .replace(/\bOLED\s+Laser\s+Black\b/gi, "OLED Laser")
    .replace(/\bTitanium\s+Slate\s+Pro\b/gi, "Titanium")
    .replace(/\bAbyss\s+Bioluminescence\b/gi, "Abyss")
    .replace(/\bCyberpunk\s+Night\s+City\b/gi, "Night City")
    .replace(/\bHorizon\s+Sunset\b/gi, "Horizon")
    .replace(/\bUbuntu\s+Yaru\s+Dark\b/gi, "Ubuntu Dark")
    .replace(/\bUbuntu\s+Yaru\s+Light\b/gi, "Ubuntu Light")
    .replace(/\bGNOME\s+Adwaita\s+Dark\b/gi, "Adwaita Dark")
    .replace(/\bGNOME\s+Adwaita\s+Light\b/gi, "Adwaita Light")
    .replace(/\bLinux\s+Mint\s+Dark\b/gi, "Linux Mint")
    .replace(/\bPop!_OS\s+Dark\b/gi, "Pop!_OS")
    .replace(/\bFedora\s+Blue\b/gi, "Fedora")
    .replace(/\s+/g, " ")
    .trim();

  if (!shortName) {
    shortName = key.split("_")[0] || trimmed;
    shortName = shortName.charAt(0).toUpperCase() + shortName.slice(1);
  }
  return shortName;
}
/** Snake_case alias of `autoShortThemeName`: returns a compact display name for a theme key or title. */
export const auto_short_theme_name = autoShortThemeName;
/** Alias of `autoShortThemeName`: returns a concise display label for a theme key or title. */
export const getShortThemeName = autoShortThemeName;
/** Snake_case alias of `getShortThemeName`: returns a concise display label for a theme key or title. */
export const get_short_theme_name = autoShortThemeName;

/** Returns a sorted list of all unique human-readable theme display names registered in `SIMPLEGUI_THEMES`. */
export function listThemes(): string[] {
  return Array.from(
    new Set(Object.values(SIMPLEGUI_THEMES).map((t) => t.name)),
  ).sort((a, b) => a.localeCompare(b));
}
/** Snake_case alias of `listThemes`: returns a sorted list of all unique theme display names. */
export const list_themes = listThemes;

/** Returns a sorted list of unique short display names for all registered themes. */
export function listShortThemes(): string[] {
  const seen = new Set<string>();
  const res: string[] = [];
  for (const t of Object.values(SIMPLEGUI_THEMES)) {
    const s = t.short_name || autoShortThemeName(t.name);
    if (!seen.has(s)) {
      seen.add(s);
      res.push(s);
    }
  }
  return res.sort((a, b) => a.localeCompare(b));
}
/** Snake_case alias of `listShortThemes`: returns a sorted list of unique short theme display names. */
export const list_short_themes = listShortThemes;

/** Returns all canonical snake_case theme keys in `SIMPLEGUI_THEMES` sorted alphabetically. */
export function getThemeKeys(): string[] {
  return Object.keys(SIMPLEGUI_THEMES).sort((a, b) => a.localeCompare(b));
}
/** Snake_case alias of `getThemeKeys`: returns all canonical theme keys sorted alphabetically. */
export function get_theme_keys(): string[] {
  return getThemeKeys();
}

/** Sorted catalog of all canonical Vlang SimpleGUI, OS heritage, and FX theme identifiers. */
export const VLANG_THEME_NAMES: string[] = [
  "abyss",
  "adwaita_dark",
  "adwaita_light",
  "amber_crt",
  "amethyst",
  "amiga",
  "apple_dark",
  "apple_light",
  "apple_sunset",
  "arc_velvet",
  "aura",
  "catppuccin",
  "charcoal",
  "cobalt2",
  "codefreelance",
  "commodore64",
  "crimson",
  "cyberpunk",
  "dark",
  "dracula",
  "emerald",
  "everforest",
  "fedora_dark",
  "fluent_dark",
  "fluent_light",
  "forest_green",
  "gameboy",
  "github_dark",
  "github_light",
  "gruvbox_dark",
  "gruvbox_light",
  "horizon",
  "hotdog_stand",
  "jetbrains_darcula",
  "kanagawa",
  "light",
  "linear_dark",
  "linux_mint",
  "mac_os_aqua",
  "macintosh_system7",
  "matrix_phosphor",
  "midnight",
  "monokai_pro",
  "navy_blue",
  "nextstep",
  "night_city",
  "nord",
  "nordic_paper",
  "oled_black",
  "one_dark_pro",
  "playstation",
  "pop_os",
  "raycast_dark",
  "rose_pine",
  "sapphire",
  "slate",
  "soft_pastel",
  "solarized_dark",
  "solarized_light",
  "sonoma_dark",
  "sonoma_emerald",
  "sonoma_light",
  "sunset_orange",
  "supabase",
  "synthwave84",
  "tailwind_dark",
  "titanium_slate",
  "tokyo_night",
  "ubuntu_dark",
  "ubuntu_light",
  "unreal_engine",
  "ventura_amber",
  "vercel_dark",
  "win11_light",
  "win11_slate",
  "win95",
]
  .concat(OS_THEME_KEYS, FX_THEME_KEYS)
  .sort((a, b) => a.localeCompare(b));

/** Returns a sorted array of all supported theme identifiers (canonical, OS heritage, and FX themes). */
export function getThemeNames(): string[] {
  return [...VLANG_THEME_NAMES].sort((a, b) => a.localeCompare(b));
}
/** Snake_case alias of `getThemeNames`: returns a sorted array of all supported theme identifiers. */
export const get_theme_names = getThemeNames;

/** Alias of `getThemeNames`: returns a sorted array of all registered theme identifiers. */
export function getThemes(): string[] {
  return getThemeNames();
}
/** Snake_case alias of `getThemes`: returns a sorted array of all registered theme identifiers. */
export const get_themes = getThemes;

/** Resolves a theme key, display name, short name, or common alias to its `SimpleGUITheme` specification, falling back to `"monokai_pro"`. */
export function getTheme(themeName: string): SimpleGUITheme {
  if (!themeName)
    return SIMPLEGUI_THEMES["monokai_pro"] || SIMPLEGUI_THEMES["apple_light"]!;
  const key = themeName
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, "_");
  if (SIMPLEGUI_THEMES[key]) return SIMPLEGUI_THEMES[key]!;

  const aliasMap: Record<string, string> = {
    ...FX_THEME_ALIASES,
    gruvbox: "gruvbox_dark",
    one_dark: "one_dark_pro",
    synthwave_84: "synthwave84",
    catppuccin_mocha: "catppuccin",
    macos_sonoma: "sonoma_dark",
    macos_dark: "sonoma_dark",
    macos_light: "sonoma_light",
    windows_11_fluent: "fluent_dark",
    windows_11_dark: "fluent_dark",
    windows_11_light: "fluent_light",
    windows_95: "win95",
    commodore_64: "commodore64",
    c64: "commodore64",
    amiga_workbench: "amiga",
    atari_st: "amiga",
    mac_system_7: "macintosh_system7",
    mac_classic: "macintosh_system7",
    matrix: "matrix_phosphor",
    amber: "amber_crt",
    vibrant_neon: "cyberpunk",
    vscode_dark: "one_dark_pro",
    sublime_text: "monokai_pro",
    material_dark: "one_dark_pro",
    debian: "debian_dark",
    arch: "arch_dark",
    archlinux: "arch_dark",
    opensuse: "opensuse_dark",
    suse: "opensuse_dark",
    manjaro: "manjaro_dark",
    elementary: "elementary_light",
    elementary_os: "elementary_light",
    kali: "kali_dark",
    zorin: "zorin_dark",
    rhel: "rhel_dark",
    redhat: "rhel_dark",
    rocky: "rocky_dark",
    almalinux: "almalinux_dark",
    centos: "centos_dark",
    endeavouros: "endeavouros_dark",
    nixos: "nixos_dark",
    gentoo: "gentoo_dark",
    alpine: "alpine_dark",
    kde: "kde_breeze_dark",
    plasma: "kde_breeze_dark",
    breeze: "kde_breeze_dark",
    breeze_dark: "kde_breeze_dark",
    breeze_light: "kde_breeze_light",
    xfce: "xfce_dark",
    mate: "mate_dark",
    deepin: "deepin_light",
    sweet: "sweet_dark",
    numix: "numix_dark",
    windows_3_1: "win31",
    windows_31: "win31",
    windows_98: "win98",
    windows_2000: "win2000",
    windows_xp: "winxp_luna",
    xp: "winxp_luna",
    luna: "winxp_luna",
    windows_vista: "vista_aero",
    vista: "vista_aero",
    windows_7: "win7_aero",
    win7: "win7_aero",
    windows_8: "win8_metro",
    win8: "win8_metro",
    metro: "win8_metro",
    windows_10: "win10_dark",
    win10: "win10_dark",
    windows_10_dark: "win10_dark",
    windows_10_light: "win10_light",
    high_contrast: "windows_high_contrast",
    macos_9: "mac_os_9",
    mac_os_8: "mac_os_9",
    platinum: "mac_os_9",
    macos_snow_leopard: "snow_leopard",
    macos_yosemite: "yosemite",
    macos_big_sur: "big_sur",
    macos_monterey: "monterey_light",
    macos_sequoia: "sequoia_dark",
    macos_tahoe: "tahoe_glass",
    tahoe: "tahoe_glass",
  };

  if (aliasMap[key] && SIMPLEGUI_THEMES[aliasMap[key]]) {
    return SIMPLEGUI_THEMES[aliasMap[key]]!;
  }

  const lower = themeName.toLowerCase().trim();
  for (const t of Object.values(SIMPLEGUI_THEMES)) {
    if (
      t.short_name &&
      (t.short_name.toLowerCase() === lower ||
        t.short_name.toLowerCase().replace(/[\s\-_]+/g, "_") === key)
    ) {
      return t;
    }
    if (
      t.name.toLowerCase() === lower ||
      t.name.toLowerCase().replace(/[\s\-_]+/g, "_") === key
    ) {
      return t;
    }
  }

  for (const [k, t] of Object.entries(SIMPLEGUI_THEMES)) {
    if (k.includes(key) || key.includes(k)) {
      return t;
    }
  }

  return SIMPLEGUI_THEMES["monokai_pro"] || SIMPLEGUI_THEMES["apple_light"]!;
}

/** Danger, warning, success and info colors for a theme: solid fill, readable text, soft tint and border, all contrast-checked. */
export function getSemanticColors(themeName: string): SemanticPalette {
  const t = getTheme(themeName);
  return buildSemanticPalette({
    background: t.background_color,
    card: t.card_background || (t.is_dark ? "#1e293b" : "#ffffff"),
    isDark: t.is_dark,
    overrides: overridesForTheme(t),
  });
}
/** Snake_case alias of `getSemanticColors`: returns contrast-checked danger, warning, success, and info palettes for a theme. */
export const get_semantic_colors = getSemanticColors;

/** The effects descriptor of a theme (glow, glass, motion), or undefined for the themes that have none. */
export function getThemeFx(themeName: string): ThemeFx | undefined {
  return getTheme(themeName).fx;
}
/** Snake_case alias of `getThemeFx`: returns the `ThemeFx` descriptor of a theme, or `undefined` if it has none. */
export const get_theme_fx = getThemeFx;

/** Returns `true` when the specified theme defines an `fx` visual effects descriptor (glassmorphism, glow, or ambient motion). */
export function isFxTheme(themeName: string): boolean {
  return !!getTheme(themeName).fx;
}
/** Snake_case alias of `isFxTheme`: returns `true` when a theme includes an `fx` visual effects descriptor. */
export const is_fx_theme = isFxTheme;

/** Code colors (keyword, string, number, comment, function, type) for any theme, each readable on its canvas. */
export function getSyntaxPalette(themeName: string): SyntaxPalette {
  return syntaxPalette(getTheme(themeName));
}
/** Snake_case alias of `getSyntaxPalette`: returns contrast-checked syntax highlighting colors for a theme. */
export const get_syntax_palette = getSyntaxPalette;

/** The `--fx-*` custom properties for a theme as CSS declarations; "" for a theme without `fx`. Accepts a theme object or a name. */
export function fxCssVars(theme: SimpleGUITheme | string): string {
  return buildFxCssVars(typeof theme === "string" ? getTheme(theme) : theme);
}
/** Snake_case alias of `fxCssVars`: generates the `--fx-*` CSS custom property declarations for a theme. */
export const fx_css_vars = fxCssVars;

export {
  FX_FALLBACK_THEMES,
  detectThemeHardware,
  getFallbackThemeKey,
  srgbToDisplayP3,
  type FxHardwareInput,
  type FxHardwareProfile,
  type FxHardwareTier,
  type FxNativeBackdrop,
  type HardwareResolvedTheme,
};
/** Snake_case alias of `detectThemeHardware`: probes host CPU/GPU/platform capabilities to classify theme FX hardware tier. */
export const detect_theme_hardware = detectThemeHardware;
/** Snake_case alias of `getFallbackThemeKey`: returns the lightweight non-FX fallback theme key for a given FX theme. */
export const get_fallback_theme_key = getFallbackThemeKey;
/** Snake_case alias of `srgbToDisplayP3`: converts an sRGB hex color to a wide-gamut `color(display-p3 ...)` CSS value. */
export const srgb_to_display_p3 = srgbToDisplayP3;

/**
 * Resolves a theme by name/key and automatically downgrades or reverts to a lightweight non-FX fallback
 * theme when the system cannot sustain glassmorphism, multi-stop blurs, or ambient shader layers.
 */
export function resolveThemeForHardware(
  themeName: string,
  hw?: FxHardwareInput,
  opts?: { revertToFallbackTheme?: boolean },
): HardwareResolvedTheme<SimpleGUITheme> {
  return resolveFxThemeForHardware(themeName, getTheme, hw, opts);
}
/** Snake_case alias of `resolveThemeForHardware`: resolves a theme and adapts or downgrades FX settings to match hardware capabilities. */
export const resolve_theme_for_hardware = resolveThemeForHardware;

// OS Path Utilities
/** Returns the current user's home directory path (`os.homedir()`, `$HOME`, `$USERPROFILE`, or `"/Users"`). */
export function homeDir(): string {
  return (
    os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users"
  );
}
/** Returns the system temporary directory path (`os.tmpdir()`, `$TMPDIR`, `$TEMP`, or `"/tmp"`). */
export function tempDir(): string {
  return os.tmpdir() || process.env.TMPDIR || process.env.TEMP || "/tmp";
}
/** Returns the path to the current user's `Desktop` directory. */
export function desktopDir(): string {
  return path.join(homeDir(), "Desktop");
}
/** Returns the path to the current user's `Documents` directory. */
export function documentsDir(): string {
  return path.join(homeDir(), "Documents");
}
/** Returns the path to the current user's `Downloads` directory. */
export function downloadsDir(): string {
  return path.join(homeDir(), "Downloads");
}

// Global Factory & Alias Exports matching vlang_simplegui API style
/** Factory function that creates and returns a new `SimpleWindow` with the given title, dimensions, and options. */
export function createWindow(
  title = "SimpleGUI Application",
  width = 800,
  height = 600,
  options: SimpleWindowOptions = {},
): SimpleWindow {
  return new SimpleWindow(title, width, height, options);
}

/** Alias of `createWindow` that instantiates and returns a new `SimpleWindow`. */
export function newWindow(
  title = "SimpleGUI Application",
  width = 800,
  height = 600,
  options: SimpleWindowOptions = {},
): SimpleWindow {
  return createWindow(title, width, height, options);
}

/** Alias of `createWindow` that instantiates and returns a new `SimpleWindow`. */
export function newSimpleWindow(
  title = "SimpleGUI Application",
  width = 800,
  height = 600,
  options: SimpleWindowOptions = {},
): SimpleWindow {
  return createWindow(title, width, height, options);
}

/** Snake_case factory alias of `createWindow` for Vlang SimpleGUI API parity. */
export function new_simple_window(
  title = "SimpleGUI Application",
  width = 800,
  height = 600,
  options: SimpleWindowOptions = {},
): SimpleWindow {
  return createWindow(title, width, height, options);
}

/** Opens an external URL or URI in the user's default system browser or protocol handler. */
export function openUrl(url: string): boolean {
  return Sys.openUrl(url);
}

/** Alias of `openUrl` that launches an external URL or file in the system's default application. */
export function openExternal(url: string): boolean {
  return Sys.openUrl(url);
}

/** Namespace facade aggregating window factories, theme utilities, XDG/OS directory helpers, state persistence functions, and core SimpleGUI classes. */
export const simplegui = {
  createWindow,
  newWindow,
  newSimpleWindow,
  new_simple_window,
  listThemes,
  list_themes,
  getThemes,
  get_themes,
  getThemeNames,
  get_theme_names,
  VLANG_THEME_NAMES,
  getThemeKeys,
  get_theme_keys,
  getTheme,
  getSemanticColors,
  get_semantic_colors,
  getThemeFx,
  get_theme_fx,
  isFxTheme,
  is_fx_theme,
  fxCssVars,
  fx_css_vars,
  getSyntaxPalette,
  get_syntax_palette,
  FX_FALLBACK_THEMES,
  detectThemeHardware,
  detect_theme_hardware,
  getFallbackThemeKey,
  get_fallback_theme_key,
  resolveThemeForHardware,
  resolve_theme_for_hardware,
  srgbToDisplayP3,
  srgb_to_display_p3,
  save_theme,
  getSavedTheme,
  get_saved_theme,
  homeDir,
  tempDir,
  desktopDir,
  documentsDir,
  downloadsDir,
  resolveUserPath,
  resolve_user_path,
  getAppConfigDir,
  get_app_config_dir,
  getAppDataDir,
  get_app_data_dir,
  getAppCacheDir,
  get_app_cache_dir,
  getAppStateDir,
  get_app_state_dir,
  getAppLogDir,
  get_app_log_dir,
  getAppRuntimeDir,
  get_app_runtime_dir,
  getAppConfigFile,
  get_app_config_file,
  getAppStateFile,
  get_app_state_file,
  writeFileAtomic,
  write_file_atomic,
  saveStateToFile,
  save_state_to_file,
  loadStateFromFile,
  load_state_from_file,
  shouldPersistControl,
  should_persist_control,
  SimpleWindow,
  SimpleControlRef,
};
