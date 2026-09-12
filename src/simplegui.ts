import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative, setFullscreenNative, isFullscreenNative, setWindowPositionNative, minimizeWindowNative, hideAppNative, closeWindowNative, attachWindowShortcuts, getScreenDimensions } from "../index.ts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export function forceExit(code = 0): void {
    process.exit(code);
}

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
    autoSave?: boolean;
    auto_save?: boolean;
    autoSaveState?: boolean;
    auto_save_state?: boolean;
    fullscreen?: boolean;
}

export type EventCallback = (win: SimpleWindow, val?: any) => void;

export class SimpleControlRef {
    public spec: any;
    public window: SimpleWindow;

    constructor(spec: any, window: SimpleWindow) {
        this.spec = spec;
        this.window = window;
    }

    id(idStr: string): this {
        const oldId = this.spec.id;
        if (oldId && oldId !== idStr) {
            const val = this.window.getValue(oldId);
            if (val !== undefined) {
                this.window.setValue(idStr, val);
                delete this.window.formValuesStore[oldId];
            }
            if (this.window.listItemsStore && this.window.listItemsStore[oldId] !== undefined) {
                this.window.listItemsStore[idStr] = this.window.listItemsStore[oldId];
                delete this.window.listItemsStore[oldId];
            }
            if (this.window.eventHandlersMap) {
                const prefix = `${oldId}:`;
                for (const [key, callback] of Array.from(this.window.eventHandlersMap.entries())) {
                    if (key.startsWith(prefix)) {
                        const eventType = key.slice(prefix.length);
                        this.window.eventHandlersMap.delete(key);
                        this.window.eventHandlersMap.set(`${idStr}:${eventType}`, callback);
                    }
                }
            }
        }
        this.spec.id = idStr;
        this.spec.name = idStr;
        return this;
    }

    at(x: number, y: number): this {
        this.spec.left = x;
        this.spec.top = y;
        this.spec.x = x;
        this.spec.y = y;
        return this;
    }

    pos(x: number, y: number): this {
        return this.at(x, y);
    }

    size(width: number, height: number): this {
        this.width(width);
        this.height(height);
        return this;
    }

    width(w: number): this {
        const oldW = this.spec.width;
        this.spec.width = w;
        if (oldW && oldW !== w && this.window) {
            this.window.recalculateRowX(this.spec, oldW, w);
        }
        return this;
    }

    height(h: number): this {
        const oldH = this.spec.height;
        this.spec.height = h;
        if (oldH && oldH !== h && this.window) {
            this.window.recalculateHeightY(this.spec, oldH, h);
        }
        return this;
    }

    bg(color: string): this {
        this.spec.background_color = color;
        return this;
    }

    color(color: string): this {
        this.spec.font_color = color;
        return this;
    }

    font(size: number, color?: string, weight?: string): this {
        this.spec.font_size = size;
        this.spec.fontSize = size;
        if (color) this.spec.font_color = color;
        if (weight) this.spec.font_weight = weight;
        return this;
    }

    fontSize(size: number): this {
        return this.font(size);
    }

    font_size(size: number): this {
        return this.font(size);
    }

    fontColor(c: string): this {
        return this.color(c);
    }

    font_color(c: string): this {
        return this.color(c);
    }

    backgroundColor(c: string): this {
        return this.bg(c);
    }

    background_color(c: string): this {
        return this.bg(c);
    }

    expandFill(expand: boolean = true): this {
        this.spec.expandFill = expand;
        this.spec.expand_fill = expand;
        return this;
    }

    expand_fill(expand: boolean = true): this {
        return this.expandFill(expand);
    }

    bold(isBold = true): this {
        this.spec.font_weight = isBold ? "700" : "400";
        this.spec.is_bold = isBold;
        this.spec.bold = isBold;
        return this;
    }

    italic(isItalic = true): this {
        this.spec.font_style = isItalic ? "italic" : "normal";
        return this;
    }

    align(textAlignment: "left" | "center" | "right"): this {
        this.spec.text_align = textAlignment;
        return this;
    }

    tooltip(hint: string): this {
        this.spec.tooltip = hint;
        return this;
    }

    placeholder(ph: string): this {
        this.spec.placeholder = ph;
        return this;
    }

    opacity(percent: number): this {
        this.spec.opacity = percent;
        return this;
    }

    enabled(flag = true): this {
        this.spec.enabled = flag;
        this.window.setControlEnabled(this.spec.id, flag);
        return this;
    }

    visible(flag = true): this {
        this.spec.visible = flag;
        this.window.setControlVisible(this.spec.id, flag);
        return this;
    }

    onClick(handler: EventCallback): this {
        this.window.bindControlEvent(this.spec.id, "onClick", handler);
        return this;
    }

    onChange(handler: EventCallback): this {
        this.window.bindControlEvent(this.spec.id, "onChange", handler);
        return this;
    }

    onHover(handler: EventCallback): this {
        this.window.bindControlEvent(this.spec.id, "onHover", handler);
        return this;
    }

    onHoverExit(handler: EventCallback): this {
        this.window.bindControlEvent(this.spec.id, "onHoverExit", handler);
        return this;
    }

    on(event: string, handler: EventCallback): this {
        this.window.bindControlEvent(this.spec.id, event, handler);
        return this;
    }

    onSelectionChange(handler: EventCallback): this {
        return this.on("selection_change", handler);
    }
    on_selection_change(handler: EventCallback): this {
        return this.on("selection_change", handler);
    }

    contextMenu(items: string[] | string, onSelect?: EventCallback): this {
        const itemsArr = Array.isArray(items) ? items : items.split(",").map(s => s.trim());
        this.spec.context_menu_items = itemsArr;
        if (onSelect) {
            this.window.bindControlEvent(this.spec.id, "context_select", onSelect);
        }
        return this;
    }
    context_menu(items: string[] | string, onSelect?: EventCallback): this {
        return this.contextMenu(items, onSelect);
    }

    bindState(key: string): this {
        this.window.bindState(this.spec.id, key);
        return this;
    }
    bind_state(key: string): this {
        return this.bindState(key);
    }
    bindControl(key: string): this {
        return this.bindState(key);
    }
    bind_control(key: string): this {
        return this.bindState(key);
    }
    bindValue(key: string): this {
        return this.bindState(key);
    }
    bind_value(key: string): this {
        return this.bindState(key);
    }
    bindClick(cb: EventCallback): this {
        this.window.bindClick(this.spec.id, cb);
        return this;
    }
    bind_click(cb: EventCallback): this {
        return this.bindClick(cb);
    }
    bindChange(cb: EventCallback): this {
        this.window.bindChange(this.spec.id, cb);
        return this;
    }
    bind_change(cb: EventCallback): this {
        return this.bindChange(cb);
    }
    bindEnter(cb: EventCallback): this {
        this.window.bindEnter(this.spec.id, cb);
        return this;
    }
    bind_enter(cb: EventCallback): this {
        return this.bindEnter(cb);
    }

    getValue(): any {
        return this.window.getValue(this.spec.id);
    }

    setValue(val: any): this {
        this.window.setValue(this.spec.id, val);
        return this;
    }

    getText(): string {
        return this.window.getText(this.spec.id);
    }

    setText(text: string): this {
        this.window.setText(this.spec.id, text);
        return this;
    }

    show(): this { return this.visible(true); }
    hide(): this { return this.visible(false); }
    openModal(): this { this.window.openModal(this.spec.id); return this; }
    closeModal(): this { this.window.closeModal(this.spec.id); return this; }
    open_modal(): this { return this.openModal(); }
    close_modal(): this { return this.closeModal(); }
    enable(): this { return this.enabled(true); }
    disable(): this { return this.enabled(false); }
    disabled(flag = true): this { return this.enabled(!flag); }
    readOnly(flag = true): this { this.spec.readonly = flag; return this; }
    focus(): this { this.window.setFocus(this.spec.id); return this; }
    flash(): this { this.window.flashControl(this.spec.id); return this; }
    highlight(durationMs = 1000): this { this.window.highlightControl(this.spec.id, durationMs); return this; }
    increment(delta = 1): number { return this.window.increment(this.spec.id, delta); }
    toggleChecked(): boolean { return this.window.toggleChecked(this.spec.id); }
    appendText(text: string): this { this.window.appendText(this.spec.id, text); return this; }
    appendLine(line: string): this { this.window.appendLine(this.spec.id, line); return this; }
    
    value(val?: any): any | this {
        if (val === undefined) return this.getValue();
        return this.setValue(val);
    }
    text(txt?: string): string | this {
        if (txt === undefined) return this.getText();
        return this.setText(txt);
    }
    options(items: string[]): this {
        this.window.setListItems(this.spec.id, items);
        return this;
    }
    min(val: number): this { this.spec.min_value = val; return this; }
    max(val: number): this { this.spec.max_value = val; return this; }
    step(val: number): this { this.spec.step = val; return this; }

    multiSelect(enable = true): this {
        this.spec.multiple = enable;
        this.spec.multi_select = enable;
        this.spec.selection_mode = enable ? "multiple" : "single";
        return this;
    }
    multi_select(enable = true): this { return this.multiSelect(enable); }

    checkboxSelection(enable = true): this {
        this.spec.checkbox_selection = enable;
        this.spec.selectable_checkbox = enable;
        return this;
    }
    checkbox_selection(enable = true): this { return this.checkboxSelection(enable); }

    getSelectedItems(): string[] {
        const val = this.getValue();
        if (Array.isArray(val)) return val.map(String);
        if (typeof val === "string" && val.length > 0) return val.split(",").map(s => s.trim());
        return [];
    }
    get_selected_items(): string[] { return this.getSelectedItems(); }

    getSelectedRows(): any[] {
        const val = this.getValue();
        if (Array.isArray(val)) return val;
        return [];
    }
    get_selected_rows(): any[] { return this.getSelectedRows(); }

    onToggle(handler: EventCallback): this {
        return this.on("toggle", handler);
    }
    on_toggle(handler: EventCallback): this {
        return this.onToggle(handler);
    }

    expandAll(): this {
        if (this.window && (this.window as any).evalJs) {
            (this.window as any).evalJs(`if(window['${this.spec.id}_expandAll'])window['${this.spec.id}_expandAll']();`);
        }
        return this;
    }
    collapseAll(): this {
        if (this.window && (this.window as any).evalJs) {
            (this.window as any).evalJs(`if(window['${this.spec.id}_collapseAll'])window['${this.spec.id}_collapseAll']();`);
        }
        return this;
    }

    closable(enable = true): this {
        this.spec.closable = enable;
        this.spec.closeable = enable;
        return this;
    }
    sortable(enable = true): this {
        this.spec.sortable = enable;
        return this;
    }
    resizable(enable = true): this {
        this.spec.resizable = enable;
        return this;
    }

    onCommand(handler: EventCallback): this {
        this.on("command", handler);
        return this.on("select", handler);
    }
    onTabClose(handler: EventCallback): this {
        return this.on("tab_close", handler);
    }
    onCardMove(handler: EventCallback): this {
        return this.on("card_move", handler);
    }
    onResize(handler: EventCallback): this {
        return this.on("resize", handler);
    }
    onSort(handler: EventCallback): this {
        return this.on("sort", handler);
    }

    on_click(handler: EventCallback): this { return this.onClick(handler); }
    on_change(handler: EventCallback): this { return this.onChange(handler); }
    on_hover(handler: EventCallback): this { return this.onHoverExit ? this.onHover(handler) : this; }
    on_hover_exit(handler: EventCallback): this { return this.onHoverExit(handler); }
    get_value(): any { return this.getValue(); }
    set_value(val: any): this { return this.setValue(val); }
    get_text(): string { return this.getText(); }
    set_text(text: string): this { return this.setText(text); }
    set_enabled(flag = true): this { return this.enabled(flag); }
    set_visible(flag = true): this { return this.visible(flag); }
    read_only(flag = true): this { return this.readOnly(flag); }
    toggle_checked(): boolean { return this.toggleChecked(); }
    append_text(text: string): this { return this.appendText(text); }
    append_line(line: string): this { return this.appendLine(line); }
    set_options(items: string[]): this { return this.options(items); }
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

// =============================================================================
// Path, Directory & Atomic File Utilities
// =============================================================================

export function resolveUserPath(filePath: string): string {
    if (!filePath) return "";
    let p = filePath;
    const home = os.homedir() || process.env.HOME || process.env.USERPROFILE || "/Users";
    if (p === "~") return home;
    if (p.startsWith("~/") || p.startsWith("~\\")) {
        p = path.join(home, p.slice(2));
    }
    p = p.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || "");
    p = p.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => process.env[name] || "");
    return path.resolve(p);
}
export const resolve_user_path = resolveUserPath;

export function getAppConfigDir(appName: string): string {
    const home = os.homedir() || process.env.HOME || "/Users";
    if (process.platform === "win32") {
        const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
        return path.join(appData, appName);
    }
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
    return path.join(xdgConfig, appName);
}
export const get_app_config_dir = getAppConfigDir;

export function getAppDataDir(appName: string): string {
    const home = os.homedir() || process.env.HOME || "/Users";
    if (process.platform === "darwin") {
        return path.join(home, "Library", "Application Support", appName);
    }
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
        return path.join(localAppData, appName);
    }
    const xdgData = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
    return path.join(xdgData, appName);
}
export const get_app_data_dir = getAppDataDir;

export function getAppCacheDir(appName: string): string {
    const home = os.homedir() || process.env.HOME || "/Users";
    if (process.platform === "darwin") {
        return path.join(home, "Library", "Caches", appName);
    }
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
        return path.join(localAppData, appName, "Cache");
    }
    const xdgCache = process.env.XDG_CACHE_HOME || path.join(home, ".cache");
    return path.join(xdgCache, appName);
}
export const get_app_cache_dir = getAppCacheDir;

export function getAppStateDir(appName: string): string {
    const home = os.homedir() || process.env.HOME || "/Users";
    if (process.platform === "darwin") {
        return path.join(home, "Library", "Application Support", appName);
    }
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
        return path.join(localAppData, appName);
    }
    const xdgState = process.env.XDG_STATE_HOME || path.join(home, ".local", "state");
    return path.join(xdgState, appName);
}
export const get_app_state_dir = getAppStateDir;

export function getAppLogDir(appName: string): string {
    const home = os.homedir() || process.env.HOME || "/Users";
    if (process.platform === "darwin") {
        return path.join(home, "Library", "Logs", appName);
    }
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
        return path.join(localAppData, appName, "Logs");
    }
    return path.join(getAppStateDir(appName), "log");
}
export const get_app_log_dir = getAppLogDir;

export function getAppRuntimeDir(appName: string): string {
    if (process.platform !== "win32" && process.env.XDG_RUNTIME_DIR) {
        return path.join(process.env.XDG_RUNTIME_DIR, appName);
    }
    return path.join(os.tmpdir(), `${appName}_runtime`);
}
export const get_app_runtime_dir = getAppRuntimeDir;

export function getAppConfigFile(appName: string, filename = "settings.json"): string {
    return path.join(getAppConfigDir(appName), filename);
}
export const get_app_config_file = getAppConfigFile;

export function getAppStateFile(appName: string, filename = "state.json"): string {
    return path.join(getAppStateDir(appName), filename);
}
export const get_app_state_file = getAppStateFile;

export function writeFileAtomic(filePath: string, content: string): void {
    const resolved = resolveUserPath(filePath);
    const parentDir = path.dirname(resolved);
    if (parentDir && !fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
    }
    const randId = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const tmpPath = `${resolved}.${randId}.tmp`;
    fs.writeFileSync(tmpPath, content, "utf-8");
    try {
        if (process.platform === "win32" && fs.existsSync(resolved)) {
            try { fs.unlinkSync(resolved); } catch (e) {}
        }
        fs.renameSync(tmpPath, resolved);
    } catch (err) {
        try { fs.unlinkSync(tmpPath); } catch (e) {}
        throw err;
    }
}
export const write_file_atomic = writeFileAtomic;

export function saveStateToFile(filePath: string, store: Record<string, any>): void {
    const json = JSON.stringify(store, null, 2);
    writeFileAtomic(filePath, json);
}
export const save_state_to_file = saveStateToFile;

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
export const load_state_from_file = loadStateFromFile;

export function saveTheme(themeName: string): boolean {
    try {
        const themeDir = path.join(os.homedir() || process.env.HOME || "/Users", ".config", "simplegui");
        const themeFile = path.join(themeDir, "theme.txt");
        writeFileAtomic(themeFile, themeName.trim());
        return true;
    } catch (e) {
        return false;
    }
}
export const save_theme = saveTheme;

export function getSavedTheme(): string {
    try {
        const themeFile = path.join(os.homedir() || process.env.HOME || "/Users", ".config", "simplegui", "theme.txt");
        if (fs.existsSync(themeFile)) {
            const content = fs.readFileSync(themeFile, "utf-8").trim();
            if (content.length > 0) return content;
        }
    } catch (e) {}
    return "";
}
export const get_saved_theme = getSavedTheme;

export function shouldPersistControl(ctrl: any): boolean {
    if (!ctrl) return false;
    const name = ctrl.id || ctrl.name;
    if (!name || typeof name !== "string" || name.length === 0 || name.startsWith("__")) {
        return false;
    }
    const kind = String(ctrl.kind || ctrl.type || "").toLowerCase();
    const supportedKinds = [
        "input", "textbox", "textinput", "search_bar", "search", "search_field",
        "file_picker", "file_picker_field", "date_picker", "time_picker", "date_range_picker", "date_time_picker",
        "number", "stepper", "dropdown", "select", "combobox", "combo_box", "pull_down", "segmented", "radio", "radio_group",
        "checkbox", "switch", "toggle", "pill_toggle", "mode_control",
        "slider", "vertical_slider", "step_slider", "range_slider", "rating",
        "knob", "token_field", "tag_input", "masked_input", "inline_editable_label",
        "textarea"
    ];
    if (!supportedKinds.includes(kind)) {
        return false;
    }

    const lower = name.toLowerCase();

    // Exclude output consoles, logs, terminals, diffs, previews
    if (
        lower.includes("output") || lower.includes("stdout") || lower.includes("stderr") ||
        lower.includes("terminal") || lower.includes("console") || lower.includes("live_output") ||
        lower.includes("preview") || lower.includes("diff") || lower.includes("logs") ||
        lower.includes("log_area") || lower.includes("results") || lower.includes("msg_box") ||
        lower.includes("status_bar") || lower.includes("status_lbl") || lower.includes("telemetry") ||
        lower.includes("summary_card")
    ) {
        return false;
    }

    // Exclude sensitive credentials, passwords, tokens
    if (
        lower.includes("password") || lower.includes("secret") ||
        lower.includes("auth_token") || lower.includes("private_key")
    ) {
        return false;
    }

    return true;
}
export const should_persist_control = shouldPersistControl;

export function isBrightColor(hex?: string): boolean {
    if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return false;
    const clean = hex.slice(1);
    let r = 0, g = 0, b = 0;
    if (clean.length === 3) {
        r = parseInt(clean[0] + clean[0], 16);
        g = parseInt(clean[1] + clean[1], 16);
        b = parseInt(clean[2] + clean[2], 16);
    } else if (clean.length >= 6) {
        r = parseInt(clean.slice(0, 2), 16);
        g = parseInt(clean.slice(2, 4), 16);
        b = parseInt(clean.slice(4, 6), 16);
    } else {
        return false;
    }
    return (r * 0.299 + g * 0.587 + b * 0.114) > 180;
}
export const is_bright_color = isBrightColor;

export function isBrightAccentColor(hex?: string): boolean {
    if (!hex) return false;
    const lower = hex.toLowerCase();
    const brights = new Set([
        "#0fb36a", "#30d158", "#00ff00", "#00ff41", "#4ade80",
        "#8bac0f", "#ffb000", "#ff9900", "#ffff00", "#00d2c4", "#ff8800",
        "#ffd866", "#fabd2f", "#ffc600", "#60cdff", "#a7c080"
    ]);
    return brights.has(lower) || isBrightColor(hex);
}
export const is_bright_accent_color = isBrightAccentColor;

export class SimpleWindow {
    public title: string;
    public width: number;
    public height: number;
    public padding: number;
    public spacing: number;
    public theme: string;
    public backgroundColor: string;
    public fontColor: string;
    public alwaysOnTop: boolean;

    public stateStore: Record<string, string> = {};
    public stateListeners: Map<string, Array<(win: SimpleWindow, val: string) => void>> = new Map();
    public closeListeners: Array<(win: SimpleWindow) => boolean | void> = [];
    public appId = "";
    public autoSaveState = true;
    public fullscreen = true;
    public controlStateBindings: Map<string, string> = new Map();
    public customScripts: string[] = [];

    private controls: any[] = [];
    private nonVisualControls: any[] = [];
    private controlIdCounter: Record<string, number> = {};
    private webview: Webview | null = null;
    private isWindowRunning = false;
    public formValuesStore: Record<string, any> = {};
    public eventHandlersMap: Map<string, EventCallback> = new Map();
    private promptResolversMap: Map<string, (val: any) => void> = new Map();

    public accentColor = "#0a84ff";
    public lastControlId: string = "";
    private layoutStack: LayoutFrame[] = [];
    private currentY = 20;

    constructor(title = "SimpleGUI Application", width = 800, height = 600, options: SimpleWindowOptions = {}) {
        this.title = options.title || title;
        this.width = options.width || width;
        this.height = options.height || height;
        this.padding = options.padding !== undefined ? options.padding : 20;
        this.spacing = options.spacing !== undefined ? options.spacing : 12;
        this.appId = options.appId || options.app_id || "";
        this.autoSaveState = options.autoSave ?? options.auto_save ?? options.autoSaveState ?? options.auto_save_state ?? true;
        this.fullscreen = options.fullscreen ?? true;

        const savedGlobalTheme = getSavedTheme();
        const preferredTheme = options.theme || (savedGlobalTheme ? savedGlobalTheme : "midnight");
        this.theme = preferredTheme;
        this.alwaysOnTop = options.alwaysOnTop || false;

        const resolvedTheme = this.resolveThemeColors(this.theme, options.background_color, options.font_color);
        this.backgroundColor = resolvedTheme.bg;
        this.fontColor = resolvedTheme.fg;
        this.accentColor = resolvedTheme.accent;

        this.currentY = this.padding;
    }

    private resolveThemeColors(name: string, customBg?: string, customFg?: string): { bg: string; fg: string; accent: string } {
        const theme = getTheme(name);
        return {
            bg: customBg || theme.background_color,
            fg: customFg || theme.font_color,
            accent: theme.accent_color || "#0a84ff"
        };
    }

    public setTheme(themeName: string, persist = true): this {
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
            } else if ((type === "groupbox" || type === "card") && !ctrl.custom_card_background) {
                ctrl.background_color = themeObj.card_background || (themeObj.is_dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)");
                ctrl.border_color = themeObj.card_border || (themeObj.is_dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)");
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
            const cardBg = themeObj.card_background || (isCf ? "#121212" : (isLight ? "#ffffff" : "#1e293b"));
            const cardBorder = themeObj.card_border || (isCf ? "#242424" : (isLight ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.12)"));
            const fieldsetBg = cardBg;
            const fieldsetBorder = cardBorder;
            const inputBg = isLight ? "#ffffff" : (themeObj.is_dark ? (themeObj.background_color === "#000000" ? "#0f0f0f" : "rgba(0, 0, 0, 0.28)") : "rgba(0, 0, 0, 0.04)");
            const inputBorder = cardBorder;
            const secAccent = themeObj.secondary_accent || colors.accent;

            this.evalJS(`
                (function() {
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
                            --editable-bg: ${isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.04)'};
                            --editable-border: ${isLight ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.22)'};
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
                            background-color: ${isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.04)'} !important;
                            border: 1px dashed ${isLight ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.22)'} !important;
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
                            background-color: ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} !important;
                            border: 1px solid ${isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)'} !important;
                        }
                        .rad-editable-input {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border: 1px solid ${colors.accent} !important;
                            box-shadow: 0 0 0 2px ${colors.accent}44 !important;
                        }

                        table th { color: ${isLight ? '#0f172a' : colors.accent} !important; }
                        table tr { border-color: ${cardBorder} !important; }
                        table tr:hover:not(.selected-tr) { background: ${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'} !important; }
                        .selected-tree-node { color: ${isLight ? '#0f172a' : colors.accent} !important; font-weight: 700 !important; }

                        input:not([type="checkbox"]):not([type="radio"]), textarea, select {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border-color: ${inputBorder} !important;
                            color-scheme: ${isLight ? 'light' : 'dark'} !important;
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
                            color-scheme: ${isLight ? 'light' : 'dark'} !important;
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
                        .rad-code-box { background-color: ${isLight ? '#f8fafc' : (colors.bg === '#050505' ? '#0d1117' : (colors.bg === '#0a0600' || colors.bg === '#040a05' ? cardBg : '#0f172a'))} !important; border-color: ${cardBorder} !important; border-left-color: ${colors.accent} !important; }
                        .rad-code-box pre { color: ${isLight ? '#0f172a' : (colors.bg === '#0a0600' ? '#ffb000' : (colors.bg === '#040a05' ? '#00ff66' : '#a7f3d0'))} !important; }
                        .rad-pill-tag { background: ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} !important; color: ${colors.accent} !important; }
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
                        th.style.color = '${isLight ? '#0f172a' : colors.accent}';
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
                    var tTitle = document.getElementById("lbl_theme_title");
                    if (tTitle) {
                        tTitle.textContent = "🎨 ${themeObj.name}";
                        tTitle.style.color = "${themeObj.accent_color}";
                    }
                    var bMode = document.getElementById("bdg_theme_mode");
                    if (bMode) {
                        bMode.textContent = "${themeObj.is_dark ? '🌙 DARK' : '☀️ LIGHT'}";
                        bMode.style.background = "${themeObj.is_dark ? 'rgba(14,165,233,0.2)' : '#fef3c7'}";
                        bMode.style.color = "${themeObj.is_dark ? '#38bdf8' : '#92400e'}";
                        bMode.style.border = "${themeObj.is_dark ? '1px solid rgba(14,165,233,0.4)' : '1px solid #fde68a'}";
                    }
                    var bPri = document.getElementById("bdg_theme_pri");
                    if (bPri) {
                        bPri.textContent = "PRI ${themeObj.accent_color}";
                        bPri.style.background = "${themeObj.is_dark ? 'rgba(16,185,129,0.2)' : '#dcfce7'}";
                        bPri.style.color = "${themeObj.is_dark ? '#34d399' : '#15803d'}";
                        bPri.style.border = "${themeObj.is_dark ? '1px solid rgba(16,185,129,0.4)' : '1px solid #86efac'}";
                    }
                    var bSec = document.getElementById("bdg_theme_sec");
                    if (bSec) {
                        bSec.textContent = "SEC ${themeObj.secondary_accent || themeObj.accent_color}";
                        bSec.style.background = "${themeObj.is_dark ? 'rgba(14,165,233,0.2)' : '#e0f2fe'}";
                        bSec.style.color = "${themeObj.is_dark ? '#38bdf8' : '#0369a1'}";
                        bSec.style.border = "${themeObj.is_dark ? '1px solid rgba(14,165,233,0.4)' : '1px solid #7dd3fc'}";
                    }
                    var tDesc = document.getElementById("lbl_theme_desc");
                    if (tDesc) {
                        tDesc.textContent = "${themeObj.description.replace(/"/g, '\\"')} • Unified single-form showcase with all 30+ RAD controls";
                        tDesc.style.color = "${mutedColor}";
                    }
                })();
            `);
        }
        return this;
    }
    public set_theme(themeName: string, persist = true): this {
        return this.setTheme(themeName, persist);
    }

    public setAlwaysOnTop(onTop: boolean): this {
        this.alwaysOnTop = onTop;
        if (this.webview) {
            setAlwaysOnTopNative(this.webview, onTop);
        }
        return this;
    }

    public setFullscreen(fullscreen = true): this {
        this.fullscreen = fullscreen;
        if (this.webview) {
            setFullscreenNative(this.webview, fullscreen);
        }
        return this;
    }

    public isFullscreen(): boolean {
        if (this.webview) {
            return isFullscreenNative(this.webview);
        }
        return this.fullscreen;
    }

    public toggleFullscreen(): this {
        if (this.webview) {
            toggleFullscreenNative(this.webview);
        }
        return this;
    }

    public isRunning(): boolean {
        return this.isWindowRunning;
    }

    // --- Layout Containers ---
    public beginRow(): this {
        const parentFrame = this.layoutStack[this.layoutStack.length - 1];
        const startX = parentFrame ? (parentFrame.type === "card" ? parentFrame.startX : (parentFrame.startX || this.padding)) : this.padding;
        const startY = parentFrame ? parentFrame.currentY : this.currentY;

        this.layoutStack.push({
            type: "row",
            startX,
            startY,
            currentX: startX,
            currentY: startY,
            rowHeight: 0
        });
        return this;
    }
    public begin_row(): this { return this.beginRow(); }

    public endRow(): this {
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
    public end_row(): this { return this.endRow(); }

    public beginGrid(cols = 2, gap = 12): this {
        const parentFrame = this.layoutStack[this.layoutStack.length - 1];
        const startX = parentFrame ? (parentFrame.type === "card" ? parentFrame.startX : (parentFrame.startX || this.padding)) : this.padding;
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
            gap
        });
        return this;
    }
    public begin_grid(cols = 2, gap = 12): this { return this.beginGrid(cols, gap); }

    public endGrid(): this {
        const frame = this.layoutStack.pop();
        if (frame && frame.type === "grid") {
            const gridH = frame.rowHeight > 0 ? (frame.rowHeight + (frame.gap || 12)) : 0;
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
    public end_grid(): this { return this.endGrid(); }

    public beginCard(title?: string, subtitle?: string): this {
        const theme = getTheme(this.theme);
        const cardBg = theme.card_background || "rgba(255,255,255,0.03)";
        const cardBorder = theme.card_border || "rgba(255,255,255,0.08)";
        const cardSpec: any = {
            id: this.generateUniqueId("groupbox"),
            control_type: "groupbox",
            type: "groupbox",
            title: title || "Group Panel",
            text: title || "Group Panel",
            background_color: cardBg,
            border_color: cardBorder,
            border_radius: 10
        };

        this.allocateControlPosition(cardSpec, this.width - (this.padding * 2), 100);
        this.controls.push(cardSpec);

        const cardLeft = cardSpec.left !== undefined ? cardSpec.left : this.padding;
        const cardTop = cardSpec.top !== undefined ? cardSpec.top : this.currentY;

        this.layoutStack.push({
            type: "card",
            startX: cardLeft + 16,
            startY: cardTop + 34,
            currentX: cardLeft + 16,
            currentY: cardTop + 34,
            rowHeight: 0,
            cardSpec
        });
        if (subtitle) {
            const cap = this.addCaption(subtitle);
            cap.spec.is_card_subtitle = true;
        }
        return this;
    }
    public begin_card(title?: string, subtitle?: string): this { return this.beginCard(title, subtitle); }

    public endCard(): this {
        const frame = this.layoutStack.pop();
        if (frame && frame.type === "card" && frame.cardSpec) {
            const innerHeight = frame.currentY - frame.cardSpec.top + 12;
            frame.cardSpec.height = Math.max(60, innerHeight);

            const cardBottom = frame.cardSpec.top + frame.cardSpec.height + this.spacing;
            const parentFrame = this.layoutStack[this.layoutStack.length - 1];

            if (parentFrame && parentFrame.type === "grid") {
                parentFrame.rowHeight = Math.max(parentFrame.rowHeight, frame.cardSpec.height);
                parentFrame.colIndex = ((parentFrame.colIndex || 0) + 1) % (parentFrame.cols || 2);

                if (parentFrame.colIndex === 0) {
                    parentFrame.currentY += parentFrame.rowHeight + (parentFrame.gap || 12);
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
    public end_card(): this { return this.endCard(); }

    public beginFlex(direction: "row" | "column" = "row", justify = "start", align = "center"): this {
        if (direction === "row") {
            return this.beginRow();
        } else {
            return this;
        }
    }
    public begin_flex(direction: "row" | "column" = "row", justify = "start", align = "center"): this {
        return this.beginFlex(direction, justify, align);
    }

    public endFlex(): this {
        if (this.layoutStack.length > 0 && this.layoutStack[this.layoutStack.length - 1]?.type === "row") {
            return this.endRow();
        }
        return this;
    }
    public end_flex(): this { return this.endFlex(); }

    private generateUniqueId(type: string): string {
        const count = (this.controlIdCounter[type] || 0) + 1;
        this.controlIdCounter[type] = count;
        return `${type}_${count}`;
    }

    private allocateControlPosition(ctrl: any, defaultW: number, defaultH: number): void {
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
            ctrl.left = this.padding;
            ctrl.top = this.currentY;
            ctrl.x = ctrl.left;
            ctrl.y = ctrl.top;
            this.currentY += ctrl.height + this.spacing;
        } else if (activeFrame.type === "card") {
            // Vertical Flow inside Card Container
            const cardW = activeFrame.cardSpec?.width || (this.width - (this.padding * 2));
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
                maxX = (parentFrame.cardSpec.left || this.padding) + (parentFrame.cardSpec.width || (this.width - (this.padding * 2))) - 20;
            }

            // In a row, if control doesn't have an explicit width specified in opts:
            // Prevent wide default width (e.g. full window width) from causing premature wrap
            // when there is still reasonable space on this row.
            const remainingW = maxX - activeFrame.currentX;
            if (!ctrl.user_explicit_width) {
                if (ctrl.width > remainingW && remainingW >= 140 && activeFrame.currentX > activeFrame.startX) {
                    ctrl.width = remainingW;
                } else if (ctrl.width > (maxX - activeFrame.startX)) {
                    ctrl.width = Math.max(80, maxX - activeFrame.startX);
                }
            }

            // Auto-wrap to next line if exceeding container bounds
            if (activeFrame.currentX + ctrl.width > maxX && activeFrame.currentX > activeFrame.startX) {
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
            let containerW = this.width - (this.padding * 2);

            if (parentFrame && parentFrame.type === "card" && parentFrame.cardSpec) {
                gridLeft = parentFrame.startX;
                containerW = Math.max(100, (parentFrame.cardSpec.width || (this.width - (this.padding * 2))) - 32);
            }

            const availableW = containerW - ((cols - 1) * gap);
            const cellW = Math.floor(availableW / cols);

            if (!ctrl.user_explicit_width) {
                ctrl.width = cellW;
            }
            ctrl.left = gridLeft + (colIndex * (cellW + gap));
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

    public recalculateRowX(spec: any, oldWidth: number, newWidth: number): void {
        const activeFrame = this.layoutStack[this.layoutStack.length - 1];
        if (activeFrame && activeFrame.type === "row") {
            const parentFrame = this.layoutStack[this.layoutStack.length - 2];
            let maxX = this.width - this.padding;
            if (parentFrame && parentFrame.type === "card" && parentFrame.cardSpec) {
                maxX = (parentFrame.cardSpec.left || this.padding) + (parentFrame.cardSpec.width || (this.width - (this.padding * 2))) - 20;
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

    public recalculateHeightY(spec: any, oldHeight: number, newHeight: number): void {
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

    private addVisualControl(type: string, defaultW: number, defaultH: number, opts: any = {}): SimpleControlRef {
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
            text: opts.text || opts.caption || "",
            caption: opts.caption || opts.text || "",
            font_size: opts.font_size || 13,
            font_color: opts.font_color || this.fontColor,
            background_color: opts.background_color,
            enabled: opts.enabled !== undefined ? opts.enabled : true,
            visible: opts.visible !== undefined ? opts.visible : true,
            event_handlers: opts.event_handlers || {},
            ...opts
        };

        this.lastControlId = id;
        this.allocateControlPosition(spec, width, height);
        this.controls.push(spec);

        // Store initial value in formValuesStore if provided
        if (opts.value !== undefined) {
            this.formValuesStore[id] = opts.value;
        } else if (opts.checked !== undefined) {
            this.formValuesStore[id] = opts.checked;
        } else if (opts.selected !== undefined) {
            this.formValuesStore[id] = opts.selected;
        } else if (opts.text !== undefined && (type === "textbox" || type === "input" || type === "search_field" || type === "masked_input" || type === "file_path_bar" || type === "file_picker_field" || type === "inline_editable_label")) {
            this.formValuesStore[id] = opts.text;
        } else if (opts.tags !== undefined) {
            this.formValuesStore[id] = opts.tags;
        } else if (opts.rightItems !== undefined) {
            this.formValuesStore[id] = opts.rightItems;
        }

        return new SimpleControlRef(spec, this);
    }

    // --- Control Builder Methods ---
    public addLabel(idOrText: string, textOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let text = idOrText;
        let explicitId: string | undefined;
        let finalOpts: Partial<any> = opts;

        if (typeof textOrOpts === "string") {
            explicitId = idOrText;
            text = textOrOpts;
        } else if (textOrOpts && typeof textOrOpts === "object") {
            finalOpts = textOrOpts;
        }

        const inRow = this.layoutStack.length > 0 && this.layoutStack[this.layoutStack.length - 1]?.type === "row";
        const isStatus = (explicitId && (explicitId.toLowerCase().includes("status") || explicitId.toLowerCase().includes("telemetry"))) ||
                         text.toLowerCase().startsWith("status:") ||
                         text.toLowerCase().startsWith("status :") ||
                         text.toLowerCase().startsWith("matches found:") ||
                         text.toLowerCase().startsWith("ready  |") ||
                         text.toLowerCase().startsWith("codefreelance engine:");

        let defaultW: number;
        if (isStatus) {
            defaultW = Math.max(600, this.width - (this.padding * 2) - 10);
        } else if (inRow) {
            defaultW = Math.max(20, Math.ceil(text.length * 7.2 + 6));
        } else {
            defaultW = Math.max(300, Math.ceil(text.length * 7.2 + 6));
        }

        const ctrlOpts: Record<string, any> = { text, caption: text, ...finalOpts };
        if (explicitId) ctrlOpts.id = explicitId;
        return this.addVisualControl("label", defaultW, 24, ctrlOpts);
    }

    public addButton(idOrText: string, textOrOnClick?: string | EventCallback, onClickOrOpts?: EventCallback | Partial<any>, optsArg: Partial<any> = {}): SimpleControlRef {
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
            if (typeof onClickOrOpts === "object" && onClickOrOpts !== null) opts = onClickOrOpts;
        } else if (typeof textOrOnClick === "object" && textOrOnClick !== null) {
            opts = textOrOnClick;
        }

        const hasCustomBg = !!opts.background_color;
        const hasCustomFg = !!opts.font_color;
        const defaultBtnBg = opts.background_color || this.accentColor || "#0284c7";
        const isBrightGreen = isBrightAccentColor(defaultBtnBg);
        const defaultBtnFg = opts.font_color || (isBrightGreen ? "#000000" : "#ffffff");
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
            ...opts
        };
        if (explicitId) ctrlOpts.id = explicitId;
        const ref = this.addVisualControl("button", 140, 36, ctrlOpts);
        if (onClick) ref.onClick(onClick);
        return ref;
    }

    public add_button(idOrText: string, textOrOnClick?: string | EventCallback, onClickOrOpts?: EventCallback | Partial<any>, optsArg: Partial<any> = {}): SimpleControlRef {
        return this.addButton(idOrText, textOrOnClick, onClickOrOpts, optsArg);
    }

    public addTextInput(placeholder = "", arg2: string | EventCallback | Partial<any> = "", arg3: string | EventCallback | Partial<any> = {}): SimpleControlRef {
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
        const ref = this.addVisualControl("input", 280, 36, { placeholder: finalPlaceholder, value: initialValue, ...opts });
        if (initialValue) this.formValuesStore[ref.spec.id] = initialValue;
        if (onChange) ref.onChange(onChange);
        return ref;
    }
    public add_text_input(placeholder = "", arg2: string | EventCallback | Partial<any> = "", arg3: EventCallback | Partial<any> = {}): SimpleControlRef {
        return this.addTextInput(placeholder, arg2, arg3);
    }
    public addTextField(placeholder = "", arg2: string | EventCallback | Partial<any> = "", arg3: string | EventCallback | Partial<any> = {}): SimpleControlRef {
        return this.addTextInput(placeholder, arg2, arg3);
    }
    public add_text_field(placeholder = "", arg2: string | EventCallback | Partial<any> = "", arg3: string | EventCallback | Partial<any> = {}): SimpleControlRef {
        return this.addTextInput(placeholder, arg2, arg3);
    }

    public addPasswordInput(placeholder = "••••••••", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("password", 280, 36, { placeholder, ...opts });
    }

    public addTextArea(idOrPlaceholder = "", initialValueOrPlaceholder = "", optsOrPlaceholder: string | Partial<any> = {}): SimpleControlRef {
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
            ...opts
        });
        if (id) ref.spec.id = id;
        if (initialValue) this.formValuesStore[ref.spec.id] = initialValue;
        return ref;
    }

    public addCheckbox(idOrLabel: string, labelOrChecked: string | boolean = false, checkedOrOnChange: boolean | EventCallback = false, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
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

        const ctrlOpts: Record<string, any> = { text: label, caption: label, value: checked, checked, ...opts };
        if (explicitId) ctrlOpts.id = explicitId;
        const inRow = this.layoutStack.length > 0 && this.layoutStack[this.layoutStack.length - 1]?.type === "row";
        const defaultW = inRow ? Math.min(220, Math.max(90, (label || "").length * 8 + 36)) : 260;
        const ref = this.addVisualControl("checkbox", defaultW, 24, ctrlOpts);
        this.formValuesStore[ref.spec.id] = checked;
        if (changeHandler) ref.onChange(changeHandler);
        return ref;
    }

    public addSwitch(label: string, checked = false, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("switch", 260, 26, { text: label, caption: label, value: checked, checked, ...opts });
        this.formValuesStore[ref.spec.id] = checked;
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addSlider(min = 0, max = 100, value = 50, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("slider", 280, 24, { min_value: min, max_value: max, value, ...opts });
        this.formValuesStore[ref.spec.id] = value;
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addStepper(min = 0, max = 100, value = 1, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("number_stepper", 140, 36, { min_value: min, max_value: max, value, ...opts });
        this.formValuesStore[ref.spec.id] = value;
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addProgressBar(value = 50, max = 100, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("progress_bar", 280, 20, { value, max_value: max, ...opts });
    }

    public addDropdown(idOrItems: string | string[], itemsOrSelected?: string[] | string | number | EventCallback, selectedOrOnChange?: string | number | EventCallback, onChangeOrOpts?: EventCallback | Record<string, any>, optsArg: Record<string, any> = {}): SimpleControlRef {
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
                } else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null) {
                    opts = onChangeOrOpts;
                } else if (typeof optsArg === "object" && optsArg !== null) {
                    opts = optsArg;
                }
            }
        } else if (Array.isArray(idOrItems)) {
            items = idOrItems;
            if (typeof itemsOrSelected === "function") {
                onChange = itemsOrSelected as EventCallback;
                if (typeof selectedOrOnChange === "object") opts = selectedOrOnChange as Record<string, any>;
            } else {
                selected = itemsOrSelected as string | number;
                if (typeof selectedOrOnChange === "function") {
                    onChange = selectedOrOnChange as EventCallback;
                    if (typeof onChangeOrOpts === "object") opts = onChangeOrOpts;
                } else if (typeof selectedOrOnChange === "object" && selectedOrOnChange !== null) {
                    opts = selectedOrOnChange as Record<string, any>;
                }
            }
        }

        const text = items.join(", ");
        const initialVal = typeof selected === "number" ? (items[selected] || "") : (selected || items[0] || "");
        const ctrlOpts: Record<string, any> = { text, caption: text, value: initialVal, items: [...items], options: [...items], ...opts };
        if (explicitId) ctrlOpts.id = explicitId;
        const ref = this.addVisualControl("select", 240, 36, ctrlOpts);
        this.formValuesStore[ref.spec.id] = initialVal;
        this.listItemsStore[ref.spec.id] = [...items];
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addThemeSelector(id = "dd_theme", label = "Theme:", popularOnly = false, width = 160, autoShortNames = true): SimpleControlRef {
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
            "c64",
            "synthwave",
            "mac_classic",
            "amber_crt",
            "matrix",
            "amiga"
        ];
        const canonicalKeys = [
            "codefreelance", "midnight",
            "raycast_dark", "linear_dark", "vercel_dark", "unreal_engine", "arc_velvet",
            "abyss", "night_city", "horizon", "tailwind_dark", "supabase", "oled_black", "titanium_slate", "jetbrains_darcula", "nordic_paper",
            "sonoma_emerald", "apple_dark", "apple_light",
            "monokai_pro", "tokyo_night", "one_dark_pro", "gruvbox_dark", "gruvbox_light",
            "rose_pine", "everforest", "kanagawa", "cobalt2", "aura",
            "win11_slate", "win11_light",
            "ubuntu_dark", "ubuntu_light", "adwaita_dark", "adwaita_light", "linux_mint", "pop_os", "fedora_dark",
            "dracula", "nord", "cyberpunk", "github_dark", "github_light",
            "solarized_dark", "solarized_light", "navy_blue", "forest_green",
            "apple_sunset", "ventura_amber", "soft_pastel", "catppuccin",
            "win95", "gameboy", "c64", "mac_classic", "amber_crt", "matrix",
            "synthwave", "amiga", "nextstep", "mac_os_aqua", "hotdog_stand", "playstation"
        ];
        const allThemes = canonicalKeys.filter(k => SIMPLEGUI_THEMES[k]);
        const themeList = popularOnly ? popularThemes : (allThemes.length > 0 ? allThemes : Object.keys(SIMPLEGUI_THEMES));

        if (label && label.length > 0) {
            this.addLabel("lbl_" + id, label);
        }

        const initialTheme = themeList.includes(this.theme) ? this.theme : (themeList[0] || "midnight");
        
        const itemLabels: Record<string, string> = {};
        for (const k of themeList) {
            itemLabels[k] = autoShortNames ? autoShortThemeName(k) : (SIMPLEGUI_THEMES[k]?.name || k);
        }

        const ref = this.addDropdown(id, themeList, initialTheme, { item_labels: itemLabels });
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
                const display = autoShortNames ? autoShortThemeName(chosen) : chosen;
                w.toast(`Theme updated to: ${display}`);
            }
        });

        return ref;
    }
    public add_theme_selector(id = "dd_theme", label = "Theme:", popularOnly = false, width = 135, autoShortNames = true): SimpleControlRef {
        return this.addThemeSelector(id, label, popularOnly, width, autoShortNames);
    }

    public addListBox(items: string[], selectedOrOnChange?: string | string[] | number | EventCallback, onChangeOrOpts?: EventCallback | Record<string, any>, optsArg: Record<string, any> = {}): SimpleControlRef {
        let selected: string | string[] | number | undefined;
        let onChange: EventCallback | undefined;
        let opts: Record<string, any> = {};

        if (typeof selectedOrOnChange === "function") {
            onChange = selectedOrOnChange;
            if (typeof onChangeOrOpts === "object") opts = onChangeOrOpts;
        } else {
            selected = selectedOrOnChange;
            if (typeof onChangeOrOpts === "function") {
                onChange = onChangeOrOpts as EventCallback;
                opts = optsArg;
            } else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null) {
                opts = onChangeOrOpts;
            }
        }

        const isMulti = Boolean(opts.multiple || opts.multi_select || opts.selection_mode === "multiple");
        const text = items.join(", ");
        const initialVal = isMulti
            ? (Array.isArray(selected) ? selected : (typeof selected === "string" ? selected.split(",").map(s => s.trim()) : (items.length > 0 ? [items[0]] : [])))
            : (typeof selected === "number" ? (items[selected] || "") : (selected || items[0] || ""));
        const height = opts.height || (opts.size ? opts.size * 24 + 10 : 120);
        const ref = this.addVisualControl("listbox", 240, height, {
            text,
            caption: text,
            value: initialVal,
            items,
            size: opts.size || 5,
            ...(isMulti ? { multiple: true, multi_select: true, selection_mode: "multiple" } : {}),
            ...opts
        });
        this.formValuesStore[ref.spec.id] = initialVal;
        this.listItemsStore[ref.spec.id] = [...items];
        if (onChange) ref.onChange(onChange);
        return ref;
    }
    public add_list_box(items: string[], selected?: string | string[] | number, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addListBox(items, selected, onChange, opts);
    }

    public addMultiListBox(items: string[], selectedOrOnChange?: string[] | string | EventCallback, onChangeOrOpts?: EventCallback | Record<string, any>, optsArg: Record<string, any> = {}): SimpleControlRef {
        let selected: string[] | string | undefined;
        let onChange: EventCallback | undefined;
        let opts: Record<string, any> = {};

        if (typeof selectedOrOnChange === "function") {
            onChange = selectedOrOnChange;
            if (typeof onChangeOrOpts === "object") opts = onChangeOrOpts;
        } else {
            selected = selectedOrOnChange;
            if (typeof onChangeOrOpts === "function") {
                onChange = onChangeOrOpts as EventCallback;
                opts = optsArg;
            } else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null) {
                opts = onChangeOrOpts;
            }
        }

        const initialVal = Array.isArray(selected)
            ? selected
            : (typeof selected === "string" ? selected.split(",").map(s => s.trim()) : (items.length > 0 ? [items[0]] : []));
        const height = opts.height || (opts.size ? opts.size * 24 + 10 : 130);
        const ref = this.addVisualControl("listbox", 240, height, {
            text: items.join(", "),
            caption: items.join(", "),
            value: initialVal,
            items,
            size: opts.size || 5,
            multiple: true,
            multi_select: true,
            selection_mode: "multiple",
            ...opts
        });
        this.formValuesStore[ref.spec.id] = initialVal;
        this.listItemsStore[ref.spec.id] = [...items];
        if (onChange) ref.onChange(onChange);
        return ref;
    }
    public add_multi_list_box(items: string[], selected?: string[] | string, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addMultiListBox(items, selected, onChange, opts);
    }

    public addSegmentedControl(items: string[], selectedIndex = 0, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const text = items.join(", ");
        const initialVal = items[selectedIndex] || "";
        const ref = this.addVisualControl("segmented_control", 280, 36, { text, caption: text, value: initialVal, ...opts });
        this.formValuesStore[ref.spec.id] = initialVal;
        this.listItemsStore[ref.spec.id] = [...items];
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addSearchInput(placeholder = "Search...", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("search", 260, 36, { placeholder, ...opts });
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addColorWell(initialColor = "#0284c7", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("color_picker", 120, 36, { value: initialColor, ...opts });
        this.formValuesStore[ref.spec.id] = initialColor;
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addDatePicker(initialDate = "2026-07-27", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("date_picker", 180, 36, { value: initialDate, ...opts });
        this.formValuesStore[ref.spec.id] = initialDate;
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addTimePicker(initialTime = "12:00", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("time_picker", 140, 36, { value: initialTime, ...opts });
        this.formValuesStore[ref.spec.id] = initialTime;
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addBadge(text: string, type: "info" | "success" | "warning" | "error" = "info", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("status_badge", 120, 26, { text, caption: text, alert_type: type, ...opts });
    }

    public addTable(idOrHeaders: string | string[], headersOrRows?: string[] | any[][], rowsOrOnSelect?: any[][] | EventCallback | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
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
                clickHandler = rowsOrOnSelect;
            } else if (typeof rowsOrOnSelect === "object" && rowsOrOnSelect !== null) {
                finalOpts = { ...rowsOrOnSelect, ...finalOpts };
            }
        } else if (Array.isArray(idOrHeaders)) {
            headers = idOrHeaders as string[];
            if (Array.isArray(headersOrRows)) {
                rows = headersOrRows as any[][];
                if (typeof rowsOrOnSelect === "function") clickHandler = rowsOrOnSelect;
                else if (typeof rowsOrOnSelect === "object" && rowsOrOnSelect !== null) finalOpts = { ...rowsOrOnSelect, ...finalOpts };
            }
        }

        if (finalOpts.multiSelect !== undefined) {
            finalOpts.multi_select = finalOpts.multiSelect;
        }
        if (finalOpts.checkboxSelection !== undefined) {
            finalOpts.checkbox_selection = finalOpts.checkboxSelection;
        }
        const onSelChange = finalOpts.onSelectionChange || finalOpts.on_selection_change;

        const headerCsv = headers.join(", ");
        const ctrlOpts: Record<string, any> = { text: headerCsv, caption: headerCsv, value: rows, rows, headers: [...headers], columns: [...headers], ...finalOpts };
        if (explicitId) ctrlOpts.id = explicitId;
        const defaultH = finalOpts.height !== undefined ? finalOpts.height : 180;
        const defaultW = finalOpts.width !== undefined ? finalOpts.width : 540;
        const ref = this.addVisualControl("data_table", defaultW, defaultH, ctrlOpts);
        if (clickHandler) ref.onClick(clickHandler);
        if (onSelChange && typeof onSelChange === "function") {
            ref.on("selection_change", onSelChange);
        }
        return ref;
    }

    public addDataTable(idOrHeaders: string | string[], headersOrRows?: string[] | any[][], rowsOrOnSelect?: any[][] | EventCallback | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTable(idOrHeaders, headersOrRows, rowsOrOnSelect, onSelect, opts);
    }
    public add_data_table(idOrHeaders: string | string[], headersOrRows?: string[] | any[][], rowsOrOnSelect?: any[][] | EventCallback | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTable(idOrHeaders, headersOrRows, rowsOrOnSelect, onSelect, opts);
    }
    public add_table(idOrHeaders: string | string[], headersOrRows?: string[] | any[][], rowsOrOnSelect?: any[][] | EventCallback | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTable(idOrHeaders, headersOrRows, rowsOrOnSelect, onSelect, opts);
    }

    public addTreeGrid(idOrHeaders: string | string[], headersOrRows?: string[] | any[], rowsOrOnSelect?: any[] | EventCallback | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
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
                clickHandler = rowsOrOnSelect;
            } else if (typeof rowsOrOnSelect === "object" && rowsOrOnSelect !== null) {
                finalOpts = { ...rowsOrOnSelect, ...finalOpts };
            }
        } else if (Array.isArray(idOrHeaders)) {
            headers = idOrHeaders as string[];
            if (Array.isArray(headersOrRows)) {
                rows = headersOrRows as any[];
                if (typeof rowsOrOnSelect === "function") clickHandler = rowsOrOnSelect;
                else if (typeof rowsOrOnSelect === "object" && rowsOrOnSelect !== null) finalOpts = { ...rowsOrOnSelect, ...finalOpts };
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
        const onSelChange = finalOpts.onSelectionChange || finalOpts.on_selection_change;
        const onToggleHandler = finalOpts.onToggle || finalOpts.on_toggle;

        const headerCsv = headers.join(", ");
        const ctrlOpts: Record<string, any> = { text: headerCsv, caption: headerCsv, value: rows, rows, headers: [...headers], columns: [...headers], ...finalOpts };
        if (explicitId) ctrlOpts.id = explicitId;
        const defaultH = finalOpts.height !== undefined ? finalOpts.height : 200;
        const defaultW = finalOpts.width !== undefined ? finalOpts.width : 560;
        const ref = this.addVisualControl("tree_grid", defaultW, defaultH, ctrlOpts);
        if (clickHandler) ref.onClick(clickHandler);
        if (onSelChange && typeof onSelChange === "function") {
            ref.on("selection_change", onSelChange);
        }
        if (onToggleHandler && typeof onToggleHandler === "function") {
            ref.on("toggle", onToggleHandler);
        }
        return ref;
    }

    public add_tree_grid(idOrHeaders: string | string[], headersOrRows?: string[] | any[], rowsOrOnSelect?: any[] | EventCallback | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTreeGrid(idOrHeaders, headersOrRows, rowsOrOnSelect, onSelect, opts);
    }
    public addTreeTable(idOrHeaders: string | string[], headersOrRows?: string[] | any[], rowsOrOnSelect?: any[] | EventCallback | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTreeGrid(idOrHeaders, headersOrRows, rowsOrOnSelect, onSelect, opts);
    }
    public add_tree_table(idOrHeaders: string | string[], headersOrRows?: string[] | any[], rowsOrOnSelect?: any[] | EventCallback | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTreeGrid(idOrHeaders, headersOrRows, rowsOrOnSelect, onSelect, opts);
    }

    public addTreeView(nodes: string[], onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const text = nodes.join(", ");
        const ref = this.addVisualControl("tree_view", 240, 160, { text, caption: text, ...opts });
        if (onSelect) ref.onClick(onSelect);
        return ref;
    }

    public addCodeView(code: string, language = "typescript", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("code_view", 520, 140, { text: code, caption: code, placeholder: language, ...opts });
    }

    public addImage(src: string, width = 200, height = 150, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("image", width, height, { text: src, caption: src, ...opts });
    }

    public addDivider(opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("separator", this.width - (this.padding * 2), 2, { ...opts });
    }

    public addCommandPalette(idOrItems?: string | any[], itemsOrOnSelect?: any[] | EventCallback | string | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let explicitId: string | undefined;
        let items: any[] = [];
        let selectHandler: EventCallback | undefined;
        let finalOpts: Record<string, any> = { ...opts };

        if (typeof onSelect === "function") {
            selectHandler = onSelect;
        } else if (typeof onSelect === "object" && onSelect !== null) {
            finalOpts = { ...onSelect, ...finalOpts };
        }

        if (typeof idOrItems === "string") {
            explicitId = idOrItems;
            if (Array.isArray(itemsOrOnSelect)) {
                items = itemsOrOnSelect;
            } else if (typeof itemsOrOnSelect === "function") {
                selectHandler = itemsOrOnSelect;
            } else if (typeof itemsOrOnSelect === "string") {
                finalOpts.placeholder = itemsOrOnSelect;
            } else if (typeof itemsOrOnSelect === "object" && itemsOrOnSelect !== null) {
                finalOpts = { ...itemsOrOnSelect, ...finalOpts };
            }
        } else if (Array.isArray(idOrItems)) {
            items = idOrItems;
            if (typeof itemsOrOnSelect === "function") selectHandler = itemsOrOnSelect;
            else if (typeof itemsOrOnSelect === "object" && itemsOrOnSelect !== null) finalOpts = { ...itemsOrOnSelect, ...finalOpts };
        }

        const ctrlOpts: Record<string, any> = { items, commands: items, ...finalOpts };
        if (explicitId) ctrlOpts.id = explicitId;
        const ref = this.addVisualControl("command_palette", finalOpts.width || Math.min(480, this.width - 40), finalOpts.height || 44, ctrlOpts);
        if (selectHandler) ref.on("select", selectHandler);
        return ref;
    }
    public add_command_palette(idOrItems?: string | any[], itemsOrOnSelect?: any[] | EventCallback | string | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addCommandPalette(idOrItems, itemsOrOnSelect, onSelect, opts);
    }
    public addQuickOpen(idOrItems?: string | any[], itemsOrOnSelect?: any[] | EventCallback | string | Partial<any>, onSelect?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addCommandPalette(idOrItems, itemsOrOnSelect, onSelect, opts);
    }

    public addDiffView(idOrOriginal?: string, originalOrModified?: string | Partial<any>, modifiedOrOpts?: string | number | Partial<any>, widthOrOpts?: number | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let explicitId: string | undefined;
        let originalText = "";
        let modifiedText = "";
        let finalOpts: Record<string, any> = {};
        let width = 540;
        let height = 200;

        if (typeof idOrOriginal === "string" && typeof originalOrModified === "string" && typeof modifiedOrOpts === "string") {
            explicitId = idOrOriginal;
            originalText = originalOrModified;
            modifiedText = modifiedOrOpts;
            if (typeof widthOrOpts === "object" && widthOrOpts !== null) finalOpts = { ...widthOrOpts };
            else if (typeof opts === "object" && opts !== null) finalOpts = { ...opts };
        } else if (typeof idOrOriginal === "string" && typeof originalOrModified === "string") {
            originalText = idOrOriginal;
            modifiedText = originalOrModified;
            if (typeof modifiedOrOpts === "number") width = modifiedOrOpts;
            else if (typeof modifiedOrOpts === "object" && modifiedOrOpts !== null) finalOpts = { ...modifiedOrOpts };

            if (typeof widthOrOpts === "number") height = widthOrOpts;
            else if (typeof widthOrOpts === "object" && widthOrOpts !== null) finalOpts = { ...finalOpts, ...widthOrOpts };

            if (typeof opts === "object" && opts !== null) finalOpts = { ...finalOpts, ...opts };
        } else if (typeof idOrOriginal === "string") {
            explicitId = idOrOriginal;
            if (typeof originalOrModified === "object" && originalOrModified !== null) finalOpts = { ...originalOrModified };
        }

        const ctrlOpts: Record<string, any> = {
            text: originalText,
            caption: modifiedText,
            original: originalText,
            modified: modifiedText,
            value: modifiedText,
            original_title: finalOpts.original_title || finalOpts.originalTitle,
            modified_title: finalOpts.modified_title || finalOpts.modifiedTitle,
            ...finalOpts
        };
        if (explicitId) ctrlOpts.id = explicitId;
        return this.addVisualControl("diff_view", finalOpts.width || width, finalOpts.height || height, ctrlOpts);
    }
    public add_diff_view(idOrOriginal?: string, originalOrModified?: string | Partial<any>, modifiedOrOpts?: string | number | Partial<any>, widthOrOpts?: number | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addDiffView(idOrOriginal, originalOrModified, modifiedOrOpts, widthOrOpts, opts);
    }
    public addDiffEditor(idOrOriginal?: string, originalOrModified?: string | Partial<any>, modifiedOrOpts?: string | number | Partial<any>, widthOrOpts?: number | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addDiffView(idOrOriginal, originalOrModified, modifiedOrOpts, widthOrOpts, opts);
    }

    public addToolBar(idOrItems?: string | any[], itemsOrOnClick?: any[] | string | EventCallback | Partial<any>, onClick?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let explicitId: string | undefined;
        let items: any[] = [];
        let clickHandler: EventCallback | undefined;
        let finalOpts: Record<string, any> = { ...opts };

        if (typeof onClick === "function") clickHandler = onClick;
        else if (typeof onClick === "object" && onClick !== null) finalOpts = { ...onClick, ...finalOpts };

        if (typeof idOrItems === "string" && (Array.isArray(itemsOrOnClick) || typeof itemsOrOnClick === "string")) {
            explicitId = idOrItems;
            items = Array.isArray(itemsOrOnClick) ? itemsOrOnClick : String(itemsOrOnClick).split(",").map(s => s.trim());
        } else if (Array.isArray(idOrItems)) {
            items = idOrItems;
            if (typeof itemsOrOnClick === "function") clickHandler = itemsOrOnClick;
            else if (typeof itemsOrOnClick === "object" && itemsOrOnClick !== null) finalOpts = { ...itemsOrOnClick, ...finalOpts };
        } else if (typeof idOrItems === "string") {
            explicitId = idOrItems;
            if (typeof itemsOrOnClick === "function") clickHandler = itemsOrOnClick;
            else if (typeof itemsOrOnClick === "object" && itemsOrOnClick !== null) finalOpts = { ...itemsOrOnClick, ...finalOpts };
        } else {
            items = ["📄 New", "📂 Open", "💾 Save", "⚙️ Settings"];
        }

        const ctrlOpts: Record<string, any> = { items, text: Array.isArray(items) ? items.map(it => typeof it === "string" ? it : (it.label || it.name || it.id)).join(", ") : String(items), ...finalOpts };
        if (explicitId) ctrlOpts.id = explicitId;
        const ref = this.addVisualControl("tool_bar", finalOpts.width || (this.width - (this.padding * 2)), finalOpts.height || 36, ctrlOpts);
        if (clickHandler) ref.onClick(clickHandler);
        return ref;
    }
    public add_tool_bar(idOrItems?: string | any[], itemsOrOnClick?: any[] | string | EventCallback | Partial<any>, onClick?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addToolBar(idOrItems, itemsOrOnClick, onClick, opts);
    }
    public addToolbar(idOrItems?: string | any[], itemsOrOnClick?: any[] | string | EventCallback | Partial<any>, onClick?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addToolBar(idOrItems, itemsOrOnClick, onClick, opts);
    }
    public addActionBar(idOrItems?: string | any[], itemsOrOnClick?: any[] | string | EventCallback | Partial<any>, onClick?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addToolBar(idOrItems, itemsOrOnClick, onClick, opts);
    }
    public tool_bar(idOrItems?: any, itemsOrOpts?: any, opts: Partial<any> = {}): SimpleControlRef {
        return this.addToolBar(idOrItems, itemsOrOpts, opts);
    }

    public addSplitPane(idOrLeft?: string, leftOrRight?: string | Partial<any>, rightOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let explicitId: string | undefined;
        let left = "";
        let right = "";
        let finalOpts: Record<string, any> = { ...opts };

        if (typeof idOrLeft === "string" && (typeof leftOrRight === "string" || typeof rightOrOpts === "string")) {
            if (typeof rightOrOpts === "string") {
                explicitId = idOrLeft;
                left = String(leftOrRight || "");
                right = rightOrOpts;
            } else {
                left = idOrLeft;
                right = String(leftOrRight || "");
                if (typeof rightOrOpts === "object" && rightOrOpts !== null) finalOpts = { ...rightOrOpts, ...finalOpts };
            }
        } else if (typeof idOrLeft === "string") {
            explicitId = idOrLeft;
            if (typeof leftOrRight === "object" && leftOrRight !== null) finalOpts = { ...leftOrRight, ...finalOpts };
        }

        const text = `${left} | ${right}`;
        const ctrlOpts: Record<string, any> = {
            text,
            left_content: left,
            right_content: right,
            initial_split: finalOpts.initial_split !== undefined ? finalOpts.initial_split : finalOpts.initialSplit,
            ...finalOpts
        };
        if (explicitId) ctrlOpts.id = explicitId;
        const ref = this.addVisualControl("split_pane", finalOpts.width || 540, finalOpts.height || 180, ctrlOpts);
        const onResize = finalOpts.onResize || finalOpts.on_resize;
        if (onResize && typeof onResize === "function") ref.on("resize", onResize);
        return ref;
    }
    public add_split_pane(idOrLeft?: string, leftOrRight?: string | Partial<any>, rightOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addSplitPane(idOrLeft, leftOrRight, rightOrOpts, opts);
    }
    public addSplitter(idOrLeft?: string, leftOrRight?: string | Partial<any>, rightOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addSplitPane(idOrLeft, leftOrRight, rightOrOpts, opts);
    }

    // ==========================================
    // --- VLang SimpleGUI Control Parity API ---
    // ==========================================

    // 1. Text & Input Controls
    public addSearchField(id?: string, placeholder = "Search...", initialVal = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("search_field", Math.min(320, this.width - 40), 38, {
            id,
            placeholder,
            text: initialVal,
            caption: placeholder,
            ...opts
        });
    }
    public add_search_field(id?: string, placeholder = "Search...", initialVal = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addSearchField(id, placeholder, initialVal, opts);
    }

    public addPassword(id?: string, placeholder = "Enter password...", initialVal = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("password_input", Math.min(280, this.width - 40), 38, {
            id,
            placeholder,
            text: initialVal,
            caption: placeholder,
            ...opts
        });
    }
    public add_password(id?: string, placeholder = "Enter password...", initialVal = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addPassword(id, placeholder, initialVal, opts);
    }

    public addTokenField(id?: string, tokens: string[] = ["Bun", "TypeScript", "VLang"], opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("token_field", Math.min(380, this.width - 40), 40, {
            id,
            tags: tokens,
            text: tokens.join(", "),
            ...opts
        });
    }
    public add_token_field(id?: string, tokens: string[] = ["Bun", "TypeScript", "VLang"], opts: Partial<any> = {}): SimpleControlRef {
        return this.addTokenField(id, tokens, opts);
    }

    public addTagInputField(id?: string, tags: string[] = ["gui", "desktop", "rad"], opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("tag_input", Math.min(380, this.width - 40), 40, {
            id,
            tags,
            text: tags.join(", "),
            ...opts
        });
    }
    public add_tag_input_field(id?: string, tags: string[] = ["gui", "desktop", "rad"], opts: Partial<any> = {}): SimpleControlRef {
        return this.addTagInputField(id, tags, opts);
    }
    public addTagInput(id?: string, tags: string[] = ["gui", "desktop", "rad"], opts: Partial<any> = {}): SimpleControlRef {
        return this.addTagInputField(id, tags, opts);
    }
    public add_tag_input(id?: string, tags: string[] = ["gui", "desktop", "rad"], opts: Partial<any> = {}): SimpleControlRef {
        return this.addTagInputField(id, tags, opts);
    }
    public tag_input(id?: string, tags: string[] = ["gui", "desktop", "rad"], opts: Partial<any> = {}): SimpleControlRef {
        return this.addTagInputField(id, tags, opts);
    }

    public addMaskedInput(id?: string, mask = "(999) 999-9999", initialVal = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("masked_input", Math.min(240, this.width - 40), 38, {
            id,
            placeholder: mask,
            text: initialVal,
            caption: mask,
            ...opts
        });
    }
    public add_masked_input(id?: string, mask = "(999) 999-9999", initialVal = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addMaskedInput(id, mask, initialVal, opts);
    }

    public addInlineEditableLabel(id?: string, text = "Click to edit text", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("inline_editable_label", Math.min(280, this.width - 40), 32, {
            id,
            text,
            caption: text,
            ...opts
        });
    }
    public add_inline_editable_label(id?: string, text = "Click to edit text", opts: Partial<any> = {}): SimpleControlRef {
        return this.addInlineEditableLabel(id, text, opts);
    }

    // 2. Typography, Banners & Callouts
    public addSectionHeader(title: string, subtitle = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("section_header", this.width - (this.padding * 2), 48, {
            caption: title,
            text: subtitle,
            ...opts
        });
    }
    public add_section_header(title: string, subtitle = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addSectionHeader(title, subtitle, opts);
    }

    public addHotkeyBadge(keys: string | string[], opts: Partial<any> = {}): SimpleControlRef {
        const keyText = Array.isArray(keys) ? keys.join(" + ") : String(keys);
        const count = Array.isArray(keys) ? keys.length : keyText.split(/\s+|\+/).filter(Boolean).length;
        const defaultW = Math.max(90, count * 36 + 20);
        return this.addVisualControl("hotkey_badge", defaultW, 28, {
            text: keyText,
            caption: keyText,
            ...opts
        });
    }
    public add_hotkey_badge(keys: string | string[], opts: Partial<any> = {}): SimpleControlRef {
        return this.addHotkeyBadge(keys, opts);
    }

    public addLink(text: string, url = "#", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("link", 180, 24, {
            text,
            caption: url,
            ...opts
        });
    }
    public add_link(text: string, url = "#", opts: Partial<any> = {}): SimpleControlRef {
        return this.addLink(text, url, opts);
    }

    public addBanner(message: string, style: "info" | "success" | "warning" | "error" = "info", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("banner", this.width - (this.padding * 2), 44, {
            text: message,
            caption: message,
            style,
            ...opts
        });
    }
    public add_banner(message: string, style: "info" | "success" | "warning" | "error" = "info", opts: Partial<any> = {}): SimpleControlRef {
        return this.addBanner(message, style, opts);
    }

    public addStatusBanner(message: string, style: "info" | "success" | "warning" | "error" = "info", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("status_banner", this.width - (this.padding * 2), 44, {
            text: message,
            caption: message,
            style,
            ...opts
        });
    }
    public add_status_banner(message: string, style: "info" | "success" | "warning" | "error" = "info", opts: Partial<any> = {}): SimpleControlRef {
        return this.addStatusBanner(message, style, opts);
    }

    public addInfoCallout(title: string, body: string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("info_callout", this.width - (this.padding * 2), 68, {
            caption: title,
            text: body,
            ...opts
        });
    }
    public add_info_callout(title: string, body: string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addInfoCallout(title, body, opts);
    }

    public addHeroBanner(title: string, subtitle = "", badge = "NEW", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("hero_banner", this.width - (this.padding * 2), 110, {
            caption: title,
            text: subtitle,
            placeholder: badge,
            ...opts
        });
    }
    public add_hero_banner(title: string, subtitle = "", badge = "NEW", opts: Partial<any> = {}): SimpleControlRef {
        return this.addHeroBanner(title, subtitle, badge, opts);
    }

    // 3. Buttons & Toolbars
    public addImageButton(src: string, caption = "", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("image_button", 140, 42, {
            caption: caption || src,
            text: src,
            onClick,
            ...opts
        });
    }
    public add_image_button(src: string, caption = "", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addImageButton(src, caption, onClick, opts);
    }

    public addHelpButton(tooltipText = "Help information", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("help_button", 36, 36, {
            tooltip: tooltipText,
            caption: "?",
            text: tooltipText,
            onClick,
            ...opts
        });
    }
    public add_help_button(tooltipText = "Help information", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addHelpButton(tooltipText, onClick, opts);
    }

    public addSplitButton(caption: string, menuItems: string[] = ["Action 1", "Action 2"], onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("split_button", 160, 38, {
            caption,
            text: caption,
            items: menuItems,
            onClick,
            ...opts
        });
    }
    public add_split_button(caption: string, menuItems: string[] = ["Action 1", "Action 2"], onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addSplitButton(caption, menuItems, onClick, opts);
    }

    public addBadgeButton(caption: string, badgeCount: number | string = "1", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("badge_button", 130, 38, {
            caption,
            text: String(badgeCount),
            onClick,
            ...opts
        });
    }
    public add_badge_button(caption: string, badgeCount: number | string = "1", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addBadgeButton(caption, badgeCount, onClick, opts);
    }

    public addQuickActionBar(actions: Array<{ label: string; icon?: string; actionId?: string } | string>, onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("quick_action_bar", this.width - (this.padding * 2), 48, {
            items: actions,
            onClick: onSelect,
            ...opts
        });
    }
    public add_quick_action_bar(actions: Array<{ label: string; icon?: string; actionId?: string } | string>, onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addQuickActionBar(actions, onSelect, opts);
    }

    public addFloatingToolbar(tools: Array<{ icon?: string; label?: string; actionId?: string } | string>, onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("floating_toolbar", Math.min(380, this.width - 40), 46, {
            items: tools,
            onClick: onSelect,
            ...opts
        });
    }
    public add_floating_toolbar(tools: Array<{ icon?: string; label?: string; actionId?: string } | string>, onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addFloatingToolbar(tools, onSelect, opts);
    }

    // 4. Selection & Pickers
    public addRadio(label: string, groupName: string, checked = false, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("radio", 180, 28, {
            caption: label,
            text: label,
            group: groupName,
            value: checked,
            ...opts
        });
    }
    public add_radio(label: string, groupName: string, checked = false, opts: Partial<any> = {}): SimpleControlRef {
        return this.addRadio(label, groupName, checked, opts);
    }

    public addRadioGroup(groupName: string, options: string[], selected = "", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const initial = selected || options[0] || "";
        return this.addVisualControl("radio_group", 240, Math.max(36, options.length * 30), {
            id: groupName,
            group: groupName,
            items: options,
            value: initial,
            onChange,
            ...opts
        });
    }
    public add_radio_group(groupName: string, options: string[], selected = "", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addRadioGroup(groupName, options, selected, onChange, opts);
    }

    public addPullDown(id: string, options: string[], selected = "", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("pull_down", 220, 36, {
            id,
            items: options,
            value: selected || options[0] || "",
            onChange,
            ...opts
        });
    }
    public add_pull_down(id: string, options: string[], selected = "", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addPullDown(id, options, selected, onChange, opts);
    }

    public addComboBox(id: string, options: string[], initialVal = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("combo_box", 240, 38, {
            id,
            items: options,
            text: initialVal || options[0] || "",
            value: initialVal || options[0] || "",
            ...opts
        });
    }
    public add_combo_box(id: string, options: string[], initialVal = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addComboBox(id, options, initialVal, opts);
    }

    public addThemeMenu(id = "theme_menu", selected = "", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("theme_menu", 180, 36, {
            id,
            value: selected || this.theme,
            onChange,
            ...opts
        });
    }
    public add_theme_menu(id = "theme_menu", selected = "", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addThemeMenu(id, selected, onChange, opts);
    }

    public addModeControl(id: string, modes = ["System", "Dark", "Light"], selected = "Dark", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("mode_control", 240, 36, {
            id,
            items: modes,
            value: selected,
            onChange,
            ...opts
        });
    }
    public add_mode_control(id: string, modes = ["System", "Dark", "Light"], selected = "Dark", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addModeControl(id, modes, selected, onChange, opts);
    }

    public addIconSegments(id: string, items: Array<{ icon: string; label: string } | string>, selectedIdx = 0, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("icon_segments", Math.min(320, this.width - 40), 38, {
            id,
            items,
            value: selectedIdx,
            onChange,
            ...opts
        });
    }
    public add_icon_segments(id: string, items: Array<{ icon: string; label: string } | string>, selectedIdx = 0, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addIconSegments(id, items, selectedIdx, onChange, opts);
    }

    public addPillToggle(id: string, options: string[] = ["On", "Off"], selectedIdx = 0, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("pill_toggle", 180, 34, {
            id,
            items: options,
            value: selectedIdx,
            onChange,
            ...opts
        });
    }
    public add_pill_toggle(id: string, options: string[] = ["On", "Off"], selectedIdx = 0, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addPillToggle(id, options, selectedIdx, onChange, opts);
    }

    public addTagCloud(id: string, tags: string[], selected: string[] = [], onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("tag_cloud", Math.min(420, this.width - 40), 72, {
            id,
            tags,
            selectedTags: selected,
            onClick: onSelect,
            ...opts
        });
    }
    public add_tag_cloud(id: string, tags: string[], selected: string[] = [], onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTagCloud(id, tags, selected, onSelect, opts);
    }

    public addTransferList(id: string, leftItems: string[] = [], rightItems: string[] = [], onChangeOrOpts?: EventCallback | Partial<any>, optsArg: Partial<any> = {}): SimpleControlRef {
        let onChange: EventCallback | undefined;
        let opts: Partial<any> = {};
        if (typeof onChangeOrOpts === "function") {
            onChange = onChangeOrOpts;
            opts = optsArg;
        } else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null) {
            opts = onChangeOrOpts;
        }
        const ref = this.addVisualControl("transfer_list", Math.min(480, this.width - 40), opts.height || 170, {
            id,
            leftItems,
            rightItems,
            ...opts
        });
        this.formValuesStore[id] = rightItems.join(",");
        this.formValuesStore[`${id}_available`] = leftItems.join(",");
        if (onChange) ref.onChange(onChange);
        return ref;
    }
    public add_transfer_list(id: string, leftItems: string[] = [], rightItems: string[] = [], onChangeOrOpts?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTransferList(id, leftItems, rightItems, onChangeOrOpts, opts);
    }

    // 5. Sliders, Numbers & Progress
    public addVerticalSlider(id: string, min = 0, max = 100, val = 50, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("vertical_slider", 48, 160, {
            id,
            min,
            max,
            value: val,
            ...opts
        });
    }
    public add_vertical_slider(id: string, min = 0, max = 100, val = 50, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVerticalSlider(id, min, max, val, opts);
    }

    public addRangeSlider(id: string, min = 0, max = 100, low = 25, high = 75, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("range_slider", Math.min(300, this.width - 40), 44, {
            id,
            min,
            max,
            lowValue: low,
            highValue: high,
            value: `${low}-${high}`,
            ...opts
        });
    }
    public add_range_slider(id: string, min = 0, max = 100, low = 25, high = 75, opts: Partial<any> = {}): SimpleControlRef {
        return this.addRangeSlider(id, min, max, low, high, opts);
    }

    public addKnob(id: string, min = 0, max = 100, val = 50, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("knob", 80, 80, {
            id,
            min,
            max,
            value: val,
            ...opts
        });
    }
    public add_knob(id: string, min = 0, max = 100, val = 50, opts: Partial<any> = {}): SimpleControlRef {
        return this.addKnob(id, min, max, val, opts);
    }

    public addProgressIndicator(id: string, value = 0, max = 100, opts: Partial<any> = {}): SimpleControlRef {
        return this.addProgressBar(value, max, { id, ...opts });
    }
    public add_progress_indicator(id: string, value = 0, max = 100, opts: Partial<any> = {}): SimpleControlRef {
        return this.addProgressIndicator(id, value, max, opts);
    }

    public addLevelIndicator(id: string, value = 5, max = 10, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("level_indicator", 160, 24, {
            id,
            value,
            max,
            ...opts
        });
    }
    public add_level_indicator(id: string, value = 5, max = 10, opts: Partial<any> = {}): SimpleControlRef {
        return this.addLevelIndicator(id, value, max, opts);
    }

    public addSpinner(size = 28, text = "Loading...", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("spinner", 120, size + 8, {
            caption: text,
            text,
            width: size,
            height: size,
            ...opts
        });
    }
    public add_spinner(size = 28, text = "Loading...", opts: Partial<any> = {}): SimpleControlRef {
        return this.addSpinner(size, text, opts);
    }

    public addRating(id: string, value = 4, max = 5, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("rating", 140, 32, {
            id,
            value,
            max,
            ...opts
        });
    }
    public add_rating(id: string, value = 4, max = 5, opts: Partial<any> = {}): SimpleControlRef {
        return this.addRating(id, value, max, opts);
    }

    public addStarRating(id: string, value = 4, max = 5, opts: Partial<any> = {}): SimpleControlRef {
        return this.addRating(id, value, max, opts);
    }
    public add_star_rating(id: string, value = 4, max = 5, opts: Partial<any> = {}): SimpleControlRef {
        return this.addStarRating(id, value, max, opts);
    }

    public addDonutChart(id: string, title: string, percent = 75, subtitle = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("donut_chart", 180, 160, {
            id,
            caption: title,
            value: percent,
            text: subtitle,
            ...opts
        });
    }
    public add_donut_chart(id: string, title: string, percent = 75, subtitle = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addDonutChart(id, title, percent, subtitle, opts);
    }

    public addActivityRings(id: string, rings: Array<{ label: string; percent: number; color?: string }> = [
        { label: "Move", percent: 85, color: "#fa114f" },
        { label: "Exercise", percent: 62, color: "#a1ff00" },
        { label: "Stand", percent: 90, color: "#00f0ff" }
    ], opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("activity_rings", 160, 160, {
            id,
            rings,
            ...opts
        });
    }
    public add_activity_rings(id: string, rings?: Array<{ label: string; percent: number; color?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addActivityRings(id, rings, opts);
    }

    public addSegmentDistributionBar(id: string, segments: Array<{ label: string; value: number; color?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("segment_distribution_bar", Math.min(380, this.width - 40), 38, {
            id,
            segments,
            ...opts
        });
    }
    public add_segment_distribution_bar(id: string, segments: Array<{ label: string; value: number; color?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addSegmentDistributionBar(id, segments, opts);
    }

    public addSegmentedProgress(id: string, segments: Array<{ label: string; value: number; color?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addSegmentDistributionBar(id, segments, opts);
    }
    public add_segmented_progress(id: string, segments: Array<{ label: string; value: number; color?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addSegmentedProgress(id, segments, opts);
    }

    public addFeedbackMood(id: string, selected = "neutral", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("feedback_mood", 240, 44, {
            id,
            value: selected,
            onChange,
            ...opts
        });
    }
    public add_feedback_mood(id: string, selected = "neutral", onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addFeedbackMood(id, selected, onChange, opts);
    }

    public addActivityHeatmap(id: string, weeks = 12, data?: number[][], opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("activity_heatmap", Math.min(480, this.width - 40), 120, {
            id,
            weeks,
            heatmapData: data,
            ...opts
        });
    }
    public add_activity_heatmap(id: string, weeks = 12, data?: number[][], opts: Partial<any> = {}): SimpleControlRef {
        return this.addActivityHeatmap(id, weeks, data, opts);
    }

    // 6. Pickers & File / Path
    public addDateRangePicker(id: string, startDate = "", endDate = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("date_range_picker", 280, 40, {
            id,
            startDate,
            endDate,
            value: `${startDate} - ${endDate}`,
            ...opts
        });
    }
    public add_date_range_picker(id: string, startDate = "", endDate = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addDateRangePicker(id, startDate, endDate, opts);
    }

    public addDateTimePicker(id: string, initialDate = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("date_time_picker", 260, 40, {
            id,
            value: initialDate,
            text: initialDate,
            ...opts
        });
    }
    public add_date_time_picker(id: string, initialDate = "", opts: Partial<any> = {}): SimpleControlRef {
        return this.addDateTimePicker(id, initialDate, opts);
    }

    public addColorGrid(id: string, colors: string[] = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#a855f7"], selected = "#10b981", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("color_grid", 240, 44, {
            id,
            colors,
            value: selected,
            ...opts
        });
    }
    public add_color_grid(id: string, colors?: string[], selected?: string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addColorGrid(id, colors, selected, opts);
    }

    public addColorSwatchPanel(id: string, colors?: string[], selected?: string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addColorGrid(id, colors, selected, opts);
    }
    public add_color_swatch_panel(id: string, colors?: string[], selected?: string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addColorSwatchPanel(id, colors, selected, opts);
    }

    public addFilePickerField(id: string, placeholder = "Select a file...", filter = "*.*", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("file_picker_field", Math.min(380, this.width - 40), 38, {
            id,
            placeholder,
            caption: filter,
            ...opts
        });
    }
    public add_file_picker_field(id: string, placeholder = "Select a file...", filter = "*.*", opts: Partial<any> = {}): SimpleControlRef {
        return this.addFilePickerField(id, placeholder, filter, opts);
    }

    public addPathControl(id: string, segments: string[] = ["Macintosh HD", "Users", "codecaine", "Projects"], opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("path_control", Math.min(420, this.width - 40), 34, {
            id,
            segments,
            text: segments.join("/"),
            ...opts
        });
    }
    public add_path_control(id: string, segments?: string[], opts: Partial<any> = {}): SimpleControlRef {
        return this.addPathControl(id, segments, opts);
    }

    public addDropZone(id: string, promptText = "Drag & Drop files here or click to browse", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("drop_zone", Math.min(480, this.width - 40), 100, {
            id,
            caption: promptText,
            text: promptText,
            ...opts
        });
    }
    public add_drop_zone(id: string, promptText = "Drag & Drop files here or click to browse", opts: Partial<any> = {}): SimpleControlRef {
        return this.addDropZone(id, promptText, opts);
    }
    public drop_zone(id: string, promptText = "Drag & Drop files here or click to browse", opts: Partial<any> = {}): SimpleControlRef {
        return this.addDropZone(id, promptText, opts);
    }

    public addFormDropZone(id: string, promptText = "Drop files here or click to browse", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("form_drop_zone", Math.min(480, this.width - 40), 90, {
            id,
            text: promptText,
            placeholder: promptText,
            ...opts
        });
    }
    public add_form_drop_zone(id: string, promptText = "Drop files here or click to browse", opts: Partial<any> = {}): SimpleControlRef {
        return this.addFormDropZone(id, promptText, opts);
    }
    public form_drop_zone(id: string, promptText = "Drop files here or click to browse", opts: Partial<any> = {}): SimpleControlRef {
        return this.addFormDropZone(id, promptText, opts);
    }

    public addFilePathBar(pathOrId: string, idOrPath?: string, opts: Partial<any> = {}): SimpleControlRef {
        let id: string;
        let path: string;
        if (idOrPath !== undefined && typeof idOrPath === "string") {
            if (pathOrId.startsWith("/") || pathOrId.includes("\\") || pathOrId.includes(".")) {
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
        return this.addVisualControl("file_path_bar", Math.min(640, this.width - 40), 40, {
            id,
            text: path,
            caption: path,
            value: path,
            ...opts
        });
    }
    public add_file_path_bar(pathOrId: string, idOrPath?: string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addFilePathBar(pathOrId, idOrPath, opts);
    }
    public file_path_bar(pathOrId: string, idOrPath?: string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addFilePathBar(pathOrId, idOrPath, opts);
    }

    public addColorSwatch(idOrColors: string | string[], colorsOrSelected?: string[] | string, selectedOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let id: string;
        let colors: string[];
        let selected: string;
        let finalOpts: Partial<any> = opts;

        if (Array.isArray(idOrColors)) {
            id = this.generateUniqueId("color_swatch");
            colors = idOrColors;
            selected = typeof colorsOrSelected === "string" ? colorsOrSelected : colors[0] || "#0284c7";
            if (typeof selectedOrOpts === "object") finalOpts = selectedOrOpts;
        } else {
            id = idOrColors;
            colors = Array.isArray(colorsOrSelected) ? colorsOrSelected : ["#0284c7", "#38bdf8", "#10b981", "#f59e0b", "#ef4444", "#7c3aed", "#ec4899"];
            selected = typeof selectedOrOpts === "string" ? selectedOrOpts : colors[0] || "#0284c7";
            if (typeof opts === "object") finalOpts = opts;
        }

        return this.addVisualControl("color_swatch", Math.min(320, this.width - 40), 90, {
            id,
            text: colors.join(", "),
            value: selected,
            caption: finalOpts.caption || "Color Palette Swatch",
            ...finalOpts
        });
    }
    public add_color_swatch(idOrColors: string | string[], colorsOrSelected?: string[] | string, selectedOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addColorSwatch(idOrColors, colorsOrSelected, selectedOrOpts, opts);
    }
    public color_swatch(idOrColors: string | string[], colorsOrSelected?: string[] | string, selectedOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addColorSwatch(idOrColors, colorsOrSelected, selectedOrOpts, opts);
    }

    public addCalendarView(idOrDate: string, dateOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let id: string;
        let dateVal: string;
        let finalOpts: Partial<any> = opts;

        if (typeof dateOrOpts === "string") {
            id = idOrDate;
            dateVal = dateOrOpts;
        } else {
            if (idOrDate.includes(" ") || idOrDate.includes("-") || idOrDate.includes(",")) {
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
            ...finalOpts
        });
    }
    public add_calendar_view(idOrDate: string, dateOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addCalendarView(idOrDate, dateOrOpts, opts);
    }
    public calendar_view(idOrDate: string, dateOrOpts?: string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addCalendarView(idOrDate, dateOrOpts, opts);
    }

    public addPopupMenu(idOrItems: string | string[], itemsOrOpts?: string[] | string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let id: string;
        let items: string[];
        let finalOpts: Partial<any> = opts;

        if (Array.isArray(idOrItems)) {
            id = this.generateUniqueId("popup_menu");
            items = idOrItems;
            if (typeof itemsOrOpts === "object" && !Array.isArray(itemsOrOpts)) finalOpts = itemsOrOpts;
        } else {
            id = idOrItems;
            if (Array.isArray(itemsOrOpts)) {
                items = itemsOrOpts;
            } else if (typeof itemsOrOpts === "string") {
                items = itemsOrOpts.split(",").map(s => s.trim());
            } else {
                items = ["✂️ Cut  ⌘X", "📋 Copy  ⌘C", "📄 Paste  ⌘V", "---", "🗑️ Delete  ⌫"];
                if (typeof itemsOrOpts === "object") finalOpts = itemsOrOpts;
            }
        }

        return this.addVisualControl("popup_menu", 220, 230, {
            id,
            text: items.join(", "),
            items,
            ...finalOpts
        });
    }
    public add_popup_menu(idOrItems: string | string[], itemsOrOpts?: string[] | string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addPopupMenu(idOrItems, itemsOrOpts, opts);
    }
    public popup_menu(idOrItems: string | string[], itemsOrOpts?: string[] | string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addPopupMenu(idOrItems, itemsOrOpts, opts);
    }

    public addMenuBar(idOrMenus?: string | Array<{ label: string; items: string[] }>, menusOrOpts?: Array<{ label: string; items: string[] }> | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let id: string;
        let menus: Array<{ label: string; items: string[] }>;
        let finalOpts: Partial<any> = opts;

        if (typeof idOrMenus === "string") {
            id = idOrMenus;
            if (Array.isArray(menusOrOpts)) {
                menus = menusOrOpts;
            } else {
                menus = [
                    { label: "File", items: ["📄 New File  ⌘N", "📂 Open...  ⌘O", "💾 Save  ⌘S", "---", "🚪 Exit  ⌘Q"] },
                    { label: "Edit", items: ["↩️ Undo  ⌘Z", "↪️ Redo  ⌘⇧Z", "---", "✂️ Cut  ⌘X", "📋 Copy  ⌘C", "📄 Paste  ⌘V"] },
                    { label: "View", items: ["🔍 Zoom In  ⌘+", "🔎 Zoom Out  ⌘-", "---", "🖥️ Fullscreen  ⌃⌘F"] },
                    { label: "Help", items: ["📖 Documentation", "---", "ℹ️ About Bun RAD Studio"] }
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
                { label: "File", items: ["📄 New File  ⌘N", "📂 Open...  ⌘O", "💾 Save  ⌘S", "---", "🚪 Exit  ⌘Q"] },
                { label: "Edit", items: ["↩️ Undo  ⌘Z", "↪️ Redo  ⌘⇧Z", "---", "✂️ Cut  ⌘X", "📋 Copy  ⌘C", "📄 Paste  ⌘V"] },
                { label: "View", items: ["🔍 Zoom In  ⌘+", "🔎 Zoom Out  ⌘-", "---", "🖥️ Fullscreen  ⌃⌘F"] },
                { label: "Help", items: ["📖 Documentation", "---", "ℹ️ About Bun RAD Studio"] }
            ];
            if (typeof idOrMenus === "object") finalOpts = idOrMenus;
        }

        return this.addVisualControl("menu_bar", this.width - (this.padding * 2), 36, {
            id,
            menus,
            items: menus,
            ...finalOpts
        });
    }
    public add_menu_bar(idOrMenus?: any, menusOrOpts?: any, opts: Partial<any> = {}): SimpleControlRef {
        return this.addMenuBar(idOrMenus, menusOrOpts, opts);
    }
    public menu_bar(idOrMenus?: any, menusOrOpts?: any, opts: Partial<any> = {}): SimpleControlRef {
        return this.addMenuBar(idOrMenus, menusOrOpts, opts);
    }

    public setGlobalContextMenu(items: string[]): this {
        (this as any)._globalContextMenuItems = items;
        if (this.isWindowRunning) {
            this.evalJS(`window.globalContextMenuItems = ${JSON.stringify(items)};`);
        }
        return this;
    }
    public onGlobalContextMenu(callback: EventCallback): this {
        this.eventHandlersMap.set("global:context_menu_select", callback);
        this.eventHandlersMap.set("global:oncontextmenuselect", callback);
        return this;
    }
    public on_global_context_menu(callback: EventCallback): this {
        return this.onGlobalContextMenu(callback);
    }

    // 7. Media, Code & Views
    public addHtmlView(html: string, width = 520, height = 220, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("html_view", Math.min(width, this.width - 40), height, {
            text: html,
            caption: html,
            ...opts
        });
    }
    public add_html_view(html: string, width = 520, height = 220, opts: Partial<any> = {}): SimpleControlRef {
        return this.addHtmlView(html, width, height, opts);
    }

    public addBrowserView(url: string, width = 520, height = 260, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("browser_view", Math.min(width, this.width - 40), height, {
            caption: url,
            text: url,
            ...opts
        });
    }
    public add_browser_view(url: string, width = 520, height = 260, opts: Partial<any> = {}): SimpleControlRef {
        return this.addBrowserView(url, width, height, opts);
    }

    public addCodeEditor(code: string, language = "typescript", width = 520, height = 220, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("code_editor", Math.min(width, this.width - 40), height, {
            text: code,
            placeholder: language,
            caption: language,
            ...opts
        });
    }
    public add_code_editor(code: string, language = "typescript", width = 520, height = 220, opts: Partial<any> = {}): SimpleControlRef {
        return this.addCodeEditor(code, language, width, height, opts);
    }

    public addCodeStudio(title: string, code: string, language = "typescript", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("code_studio", this.width - (this.padding * 2), 240, {
            caption: title,
            text: code,
            placeholder: language,
            ...opts
        });
    }
    public add_code_studio(title: string, code: string, language = "typescript", opts: Partial<any> = {}): SimpleControlRef {
        return this.addCodeStudio(title, code, language, opts);
    }

    public addTerminalView(lines: string[] = ["$ bun --version", "1.2.4", "$ ready in 12ms"], width = 520, height = 180, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("terminal_view", Math.min(width, this.width - 40), height, {
            items: lines,
            text: lines.join("\n"),
            ...opts
        });
    }
    public add_terminal_view(lines?: string[], width = 520, height = 180, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTerminalView(lines, width, height, opts);
    }

    public addJsonTree(data: any, width = 520, height = 200, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("json_tree", Math.min(width, this.width - 40), height, {
            jsonData: data,
            text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
            ...opts
        });
    }
    public add_json_tree(data: any, width = 520, height = 200, opts: Partial<any> = {}): SimpleControlRef {
        return this.addJsonTree(data, width, height, opts);
    }

    public addAudioWaveform(id: string, bars = 32, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("audio_waveform", Math.min(340, this.width - 40), 64, {
            id,
            bars,
            ...opts
        });
    }
    public add_audio_waveform(id: string, bars = 32, opts: Partial<any> = {}): SimpleControlRef {
        return this.addAudioWaveform(id, bars, opts);
    }

    public addImageGallery(images: Array<{ src: string; caption?: string } | string>, width = 520, height = 180, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("image_gallery", Math.min(width, this.width - 40), height, {
            images,
            ...opts
        });
    }
    public add_image_gallery(images: Array<{ src: string; caption?: string } | string>, width = 520, height = 180, opts: Partial<any> = {}): SimpleControlRef {
        return this.addImageGallery(images, width, height, opts);
    }

    public addMediaPlayer(src: string, title = "Media Playback", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("media_player", Math.min(420, this.width - 40), 96, {
            caption: title,
            text: src,
            ...opts
        });
    }
    public add_media_player(src: string, title = "Media Playback", opts: Partial<any> = {}): SimpleControlRef {
        return this.addMediaPlayer(src, title, opts);
    }

    // 8. Cards & Complex Dashboard Tiles
    public addStatGrid(stats: Array<{ label: string; value: string; delta?: string; trend?: "up" | "down" }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("stat_grid", this.width - (this.padding * 2), 100, {
            stats,
            ...opts
        });
    }
    public add_stat_grid(stats: Array<{ label: string; value: string; delta?: string; trend?: "up" | "down" }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addStatGrid(stats, opts);
    }

    public addScoreCard(title: string, score: number | string, subtitle = "", grade = "A+", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("score_card", 220, 110, {
            caption: title,
            value: score,
            text: subtitle,
            placeholder: grade,
            ...opts
        });
    }
    public add_score_card(title: string, score: number | string, subtitle = "", grade = "A+", opts: Partial<any> = {}): SimpleControlRef {
        return this.addScoreCard(title, score, subtitle, grade, opts);
    }

    public addAvatarCard(name: string, role: string, avatarUrl = "", status = "online", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("avatar_card", 240, 80, {
            caption: name,
            text: role,
            placeholder: avatarUrl,
            status,
            ...opts
        });
    }
    public add_avatar_card(name: string, role: string, avatarUrl = "", status = "online", opts: Partial<any> = {}): SimpleControlRef {
        return this.addAvatarCard(name, role, avatarUrl, status, opts);
    }

    public addUserProfileCard(user: { name: string; handle: string; avatar?: string; bio?: string; stats?: { followers: string; following: string; posts: string } }, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("user_profile_card", 280, 150, {
            userProfile: user,
            caption: user.name,
            text: user.handle,
            ...opts
        });
    }
    public add_user_profile_card(user: { name: string; handle: string; avatar?: string; bio?: string; stats?: { followers: string; following: string; posts: string } }, opts: Partial<any> = {}): SimpleControlRef {
        return this.addUserProfileCard(user, opts);
    }

    public addProductCard(product: { title: string; price: string; rating?: number; reviews?: number; tag?: string; image?: string; description?: string }, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("product_card", 260, 220, {
            productData: product,
            caption: product.title,
            value: product.price,
            ...opts
        });
    }
    public add_product_card(product: { title: string; price: string; rating?: number; reviews?: number; tag?: string; image?: string; description?: string }, opts: Partial<any> = {}): SimpleControlRef {
        return this.addProductCard(product, opts);
    }

    public addAppLauncherTile(title: string, icon = "⚡", description = "", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("app_launcher_tile", 180, 100, {
            caption: title,
            placeholder: icon,
            text: description,
            onClick,
            ...opts
        });
    }
    public add_app_launcher_tile(title: string, icon = "⚡", description = "", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addAppLauncherTile(title, icon, description, onClick, opts);
    }

    public addHttpRequestCard(method = "GET", url = "https://api.example.com/v1/data", status = 200, latency = "42ms", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("http_request_card", Math.min(440, this.width - 40), 96, {
            method,
            url,
            status,
            latency,
            caption: `${method} ${url}`,
            ...opts
        });
    }
    public add_http_request_card(method = "GET", url = "https://api.example.com/v1/data", status = 200, latency = "42ms", opts: Partial<any> = {}): SimpleControlRef {
        return this.addHttpRequestCard(method, url, status, latency, opts);
    }

    public addResourceMonitor(id = "sys_res", cpu = 38, ram = 54, disk = 68, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("resource_monitor", Math.min(360, this.width - 40), 100, {
            id,
            cpu,
            ram,
            disk,
            ...opts
        });
    }
    public add_resource_monitor(id = "sys_res", cpu = 38, ram = 54, disk = 68, opts: Partial<any> = {}): SimpleControlRef {
        return this.addResourceMonitor(id, cpu, ram, disk, opts);
    }

    public addEnvVars(id = "env_list", vars: Record<string, string> = { NODE_ENV: "development", BUN_PORT: "3000", APP_DEBUG: "true" }, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("env_vars", Math.min(420, this.width - 40), 140, {
            id,
            envVars: vars,
            ...opts
        });
    }
    public add_env_vars(id = "env_list", vars?: Record<string, string>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addEnvVars(id, vars, opts);
    }

    public addStatusIndicator(label: string, status: "active" | "warning" | "error" | "offline" = "active", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("status_indicator", 160, 28, {
            caption: label,
            text: label,
            status,
            ...opts
        });
    }
    public add_status_indicator(label: string, status?: "active" | "warning" | "error" | "offline", opts: Partial<any> = {}): SimpleControlRef {
        return this.addStatusIndicator(label, status, opts);
    }

    public addStatusDock(items: Array<{ icon: string; label: string; value: string }> = [
        { icon: "🟢", label: "Backend", value: "Online" },
        { icon: "⚡", label: "Latency", value: "18ms" },
        { icon: "💾", label: "Memory", value: "48 MB" }
    ], opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("status_dock", this.width - (this.padding * 2), 48, {
            dockItems: items,
            ...opts
        });
    }
    public add_status_dock(items?: Array<{ icon: string; label: string; value: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addStatusDock(items, opts);
    }

    // 9. Navigation & Accordion Containers
    public addNavRail(items: Array<{ icon: string; label: string; id?: string; active?: boolean }>, onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("nav_rail", 72, Math.max(200, items.length * 60), {
            navItems: items,
            onClick: onSelect,
            ...opts
        });
    }
    public add_nav_rail(items: Array<{ icon: string; label: string; id?: string; active?: boolean }>, onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addNavRail(items, onSelect, opts);
    }

    public addDisclosure(title: string, content: string, expanded = false, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("disclosure", this.width - (this.padding * 2), expanded ? 120 : 42, {
            caption: title,
            text: content,
            expanded,
            ...opts
        });
    }
    public add_disclosure(title: string, content: string, expanded = false, opts: Partial<any> = {}): SimpleControlRef {
        return this.addDisclosure(title, content, expanded, opts);
    }

    public addCollapsibleSection(title: string, content: string, expanded = false, opts: Partial<any> = {}): SimpleControlRef {
        return this.addDisclosure(title, content, expanded, opts);
    }
    public add_collapsible_section(title: string, content: string, expanded = false, opts: Partial<any> = {}): SimpleControlRef {
        return this.addCollapsibleSection(title, content, expanded, opts);
    }

    public addAccordionGroup(items: Array<{ title: string; content: string; expanded?: boolean }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("accordion_group", this.width - (this.padding * 2), items.length * 48 + 60, {
            accordionItems: items,
            ...opts
        });
    }
    public add_accordion_group(items: Array<{ title: string; content: string; expanded?: boolean }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addAccordionGroup(items, opts);
    }

    public addKanbanBoard(idOrColumns: string | Array<any>, columnsOrOnMove?: Array<any> | EventCallback | Partial<any>, onMoveOrOpts?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let explicitId: string | undefined;
        let cols: any[] = [];
        let moveHandler: EventCallback | undefined;
        let finalOpts: Record<string, any> = { ...opts };

        if (typeof onMoveOrOpts === "function") moveHandler = onMoveOrOpts;
        else if (typeof onMoveOrOpts === "object" && onMoveOrOpts !== null) finalOpts = { ...onMoveOrOpts, ...finalOpts };

        if (typeof idOrColumns === "string") {
            explicitId = idOrColumns;
            if (Array.isArray(columnsOrOnMove)) cols = columnsOrOnMove;
            else if (typeof columnsOrOnMove === "function") moveHandler = columnsOrOnMove;
            else if (typeof columnsOrOnMove === "object" && columnsOrOnMove !== null) finalOpts = { ...columnsOrOnMove, ...finalOpts };
        } else if (Array.isArray(idOrColumns)) {
            cols = idOrColumns;
            if (typeof columnsOrOnMove === "function") moveHandler = columnsOrOnMove;
            else if (typeof columnsOrOnMove === "object" && columnsOrOnMove !== null) finalOpts = { ...columnsOrOnMove, ...finalOpts };
        }

        const ctrlOpts: Record<string, any> = {
            kanbanColumns: cols,
            columns: cols,
            ...finalOpts
        };
        if (explicitId) ctrlOpts.id = explicitId;
        const ref = this.addVisualControl("kanban_board", finalOpts.width || (this.width - (this.padding * 2)), finalOpts.height || 220, ctrlOpts);
        if (moveHandler) ref.on("card_move", moveHandler);
        return ref;
    }
    public add_kanban_board(idOrColumns: string | Array<any>, columnsOrOnMove?: Array<any> | EventCallback | Partial<any>, onMoveOrOpts?: EventCallback | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addKanbanBoard(idOrColumns, columnsOrOnMove, onMoveOrOpts, opts);
    }

    public addActionRow(buttons: Array<{ label: string; onClick?: EventCallback; primary?: boolean; style?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("action_row", this.width - (this.padding * 2), 48, {
            actionButtons: buttons,
            ...opts
        });
    }
    public add_action_row(buttons: Array<{ label: string; onClick?: EventCallback; primary?: boolean; style?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addActionRow(buttons, opts);
    }

    public addFieldsRow(fields: Array<{ label: string; id: string; placeholder?: string; value?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("fields_row", this.width - (this.padding * 2), 68, {
            rowFields: fields,
            ...opts
        });
    }
    public add_fields_row(fields: Array<{ label: string; id: string; placeholder?: string; value?: string }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addFieldsRow(fields, opts);
    }

    public addGroupBox(title: string, width?: number, height = 180, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("group_box", width || (this.width - (this.padding * 2)), height, {
            caption: title,
            text: title,
            ...opts
        });
    }
    public add_group_box(title: string, width?: number, height = 180, opts: Partial<any> = {}): SimpleControlRef {
        return this.addGroupBox(title, width, height, opts);
    }

    public addTabs(tabNames: string[], selectedIdxOrOpts: number | Partial<any> = 0, opts: Partial<any> = {}): SimpleControlRef {
        let selectedIdx = 0;
        let finalOpts: Record<string, any> = { ...opts };
        if (typeof selectedIdxOrOpts === "number") {
            selectedIdx = selectedIdxOrOpts;
        } else if (typeof selectedIdxOrOpts === "object" && selectedIdxOrOpts !== null) {
            finalOpts = { ...selectedIdxOrOpts, ...finalOpts };
        }
        return this.addVisualControl("tabs", this.width - (this.padding * 2), 40, {
            items: tabNames,
            value: selectedIdx,
            ...finalOpts
        });
    }
    public add_tabs(tabNames: string[], selectedIdxOrOpts: number | Partial<any> = 0, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTabs(tabNames, selectedIdxOrOpts, opts);
    }

    public addScrollView(width?: number, height = 240, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("scroll_view", width || (this.width - (this.padding * 2)), height, {
            ...opts
        });
    }
    public add_scroll_view(width?: number, height = 240, opts: Partial<any> = {}): SimpleControlRef {
        return this.addScrollView(width, height, opts);
    }

    public addVerticalSpacer(height = 16): SimpleControlRef {
        return this.addVisualControl("spacer_v", 1, height);
    }
    public add_vertical_spacer(height = 16): SimpleControlRef {
        return this.addVerticalSpacer(height);
    }

    public addHorizontalSpacer(width = 16): SimpleControlRef {
        return this.addVisualControl("spacer_h", width, 1);
    }
    public add_horizontal_spacer(width = 16): SimpleControlRef {
        return this.addHorizontalSpacer(width);
    }

    public addSeparator(): SimpleControlRef {
        return this.addDivider();
    }
    public add_separator(): SimpleControlRef {
        return this.addSeparator();
    }

    public addToolbarItem(label: string, icon = "", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("toolbar_item", 100, 32, {
            caption: label,
            placeholder: icon,
            onClick,
            ...opts
        });
    }
    public add_toolbar_item(label: string, icon = "", onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addToolbarItem(label, icon, onClick, opts);
    }

    public addTrayIcon(tooltip: string, icon = "⚡", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("tray_icon", 36, 36, {
            caption: tooltip,
            placeholder: icon,
            ...opts
        });
    }
    public add_tray_icon(tooltip: string, icon = "⚡", opts: Partial<any> = {}): SimpleControlRef {
        return this.addTrayIcon(tooltip, icon, opts);
    }

    public addGrid(columns = 2, gap = 12, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("grid", this.width - (this.padding * 2), 120, {
            columns,
            gap,
            ...opts
        });
    }
    public add_grid(columns = 2, gap = 12, opts: Partial<any> = {}): SimpleControlRef {
        return this.addGrid(columns, gap, opts);
    }

    public addTreeNode(label: string, children: string[] = [], opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("tree_node", 220, 32 + children.length * 24, {
            caption: label,
            items: children,
            ...opts
        });
    }
    public add_tree_node(label: string, children: string[] = [], opts: Partial<any> = {}): SimpleControlRef {
        return this.addTreeNode(label, children, opts);
    }

    public addTimer(intervalMs: number, onTick: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const id = opts.id || this.generateUniqueId("timer");
        const spec: any = {
            id,
            control_type: "timer",
            type: "timer",
            interval: intervalMs,
            enabled: opts.enabled !== undefined ? opts.enabled : true,
            event_handlers: { onTimer: `on_${id}_tick` },
            ...opts
        };
        this.nonVisualControls.push(spec);

        this.bindControlEvent(id, "onTimer", onTick);
        return new SimpleControlRef(spec, this);
    }

    // ==============================================================
    // ✨ STUDIO EXTENDED CONTROLS: MODERN ERGONOMIC FLUENT APIS
    // ==============================================================

    public addSidebar(
        idOrTitleOrItems: string | any[] = "Navigation",
        titleOrItemsOrOnClick?: string | any[] | EventCallback,
        itemsOrOnClickOrOpts?: any[] | EventCallback | Partial<any>,
        onClickOrOpts?: EventCallback | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let title = "Navigation";
        let items = ["🏠 Dashboard", "📁 Projects", "👥 Team", "⚙️ Preferences", "❓ Help & Docs"];
        let onClick: EventCallback | undefined;
        let opts: Partial<any> = {};

        if (Array.isArray(idOrTitleOrItems)) {
            items = idOrTitleOrItems;
            if (typeof titleOrItemsOrOnClick === "function") onClick = titleOrItemsOrOnClick as EventCallback;
            else if (typeof titleOrItemsOrOnClick === "object" && titleOrItemsOrOnClick !== null) opts = titleOrItemsOrOnClick;
        } else if (typeof idOrTitleOrItems === "string") {
            if (typeof titleOrItemsOrOnClick === "string") {
                explicitId = idOrTitleOrItems;
                title = titleOrItemsOrOnClick;
                if (Array.isArray(itemsOrOnClickOrOpts)) items = itemsOrOnClickOrOpts;
                if (typeof onClickOrOpts === "function") onClick = onClickOrOpts;
                else if (typeof onClickOrOpts === "object" && onClickOrOpts !== null) opts = onClickOrOpts;
                if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
            } else if (Array.isArray(titleOrItemsOrOnClick)) {
                title = idOrTitleOrItems;
                items = titleOrItemsOrOnClick;
                if (typeof itemsOrOnClickOrOpts === "function") onClick = itemsOrOnClickOrOpts as EventCallback;
                else if (typeof itemsOrOnClickOrOpts === "object" && itemsOrOnClickOrOpts !== null) opts = itemsOrOnClickOrOpts;
            } else {
                title = idOrTitleOrItems;
                if (typeof titleOrItemsOrOnClick === "function") onClick = titleOrItemsOrOnClick as EventCallback;
                else if (typeof titleOrItemsOrOnClick === "object" && titleOrItemsOrOnClick !== null) opts = titleOrItemsOrOnClick;
            }
        }

        const id = explicitId || opts.id || this.generateUniqueId("sidebar");
        const ref = this.addVisualControl("sidebar", 200, 260, {
            id,
            title,
            caption: title,
            text: title,
            items,
            ...opts
        });
        if (onClick) {
            this.bindControlEvent(id, "onClick", onClick);
        }
        return ref;
    }
    public add_sidebar(...args: any[]) { return (this.addSidebar as any)(...args); }
    public addW3Sidebar(...args: any[]) { return (this.addSidebar as any)(...args); }
    public add_w3_sidebar(...args: any[]) { return (this.addSidebar as any)(...args); }

    public addModal(
        idOrTitleOrMsg = "Modal Dialog",
        titleOrMsgOrOnConfirm?: string | EventCallback,
        msgOrOnConfirmOrIsOpen?: string | EventCallback | boolean,
        isOpenOrOnConfirmOrOpts?: boolean | EventCallback | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let title = "Modal Dialog";
        let message = "This is a modal dialog container.";
        let isOpen = false;
        let onConfirm: EventCallback | undefined;
        let opts: Partial<any> = {};

        if (typeof idOrTitleOrMsg === "string" && typeof titleOrMsgOrOnConfirm === "string" && typeof msgOrOnConfirmOrIsOpen === "string") {
            explicitId = idOrTitleOrMsg;
            title = titleOrMsgOrOnConfirm;
            message = msgOrOnConfirmOrIsOpen;
            if (typeof isOpenOrOnConfirmOrOpts === "boolean") isOpen = isOpenOrOnConfirmOrOpts;
            else if (typeof isOpenOrOnConfirmOrOpts === "function") onConfirm = isOpenOrOnConfirmOrOpts;
            else if (typeof isOpenOrOnConfirmOrOpts === "object" && isOpenOrOnConfirmOrOpts !== null) opts = isOpenOrOnConfirmOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else if (typeof idOrTitleOrMsg === "string" && typeof titleOrMsgOrOnConfirm === "string") {
            title = idOrTitleOrMsg;
            message = titleOrMsgOrOnConfirm;
            if (typeof msgOrOnConfirmOrIsOpen === "boolean") isOpen = msgOrOnConfirmOrIsOpen;
            else if (typeof msgOrOnConfirmOrIsOpen === "function") onConfirm = msgOrOnConfirmOrIsOpen;
            else if (typeof msgOrOnConfirmOrIsOpen === "object" && msgOrOnConfirmOrIsOpen !== null) opts = msgOrOnConfirmOrIsOpen;
        } else {
            message = idOrTitleOrMsg;
            if (typeof titleOrMsgOrOnConfirm === "function") onConfirm = titleOrMsgOrOnConfirm;
            else if (typeof titleOrMsgOrOnConfirm === "object" && titleOrMsgOrOnConfirm !== null) opts = titleOrMsgOrOnConfirm;
        }

        const id = explicitId || opts.id || this.generateUniqueId("modal");
        const prevCursorX = this.cursorX;
        const prevCursorY = this.cursorY;
        const ref = this.addVisualControl("modal", 480, 200, {
            id,
            title,
            caption: title,
            text: title,
            message,
            content: message,
            is_open: isOpen,
            isOpen,
            ...opts
        });
        // Modals are fixed overlay backdrops and do not consume canvas vertical flow
        this.cursorX = prevCursorX;
        this.cursorY = prevCursorY;
        if (onConfirm) {
            this.bindControlEvent(id, "onConfirm", onConfirm);
            this.bindControlEvent(id, "onClick", onConfirm);
        }
        return ref;
    }
    public add_modal(...args: any[]) { return (this.addModal as any)(...args); }
    public addModalDialog(...args: any[]) { return (this.addModal as any)(...args); }
    public add_modal_dialog(...args: any[]) { return (this.addModal as any)(...args); }
    public addW3Modal(...args: any[]) { return (this.addModal as any)(...args); }
    public add_w3_modal(...args: any[]) { return (this.addModal as any)(...args); }

    public addDropdownMenu(
        idOrLabelOrItems: string | any[] = "Select Action",
        labelOrItemsOrOnSelect?: string | any[] | EventCallback,
        itemsOrOnSelectOrOpts?: any[] | EventCallback | Partial<any>,
        onSelectOrOpts?: EventCallback | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let label = "Select Action";
        let items = ["Action 1", "Action 2", "Settings"];
        let onSelect: EventCallback | undefined;
        let opts: Partial<any> = {};

        if (Array.isArray(idOrLabelOrItems)) {
            items = idOrLabelOrItems;
            if (typeof labelOrItemsOrOnSelect === "function") onSelect = labelOrItemsOrOnSelect as EventCallback;
            else if (typeof labelOrItemsOrOnSelect === "object" && labelOrItemsOrOnSelect !== null) opts = labelOrItemsOrOnSelect;
        } else if (typeof idOrLabelOrItems === "string") {
            if (typeof labelOrItemsOrOnSelect === "string") {
                explicitId = idOrLabelOrItems;
                label = labelOrItemsOrOnSelect;
                if (Array.isArray(itemsOrOnSelectOrOpts)) items = itemsOrOnSelectOrOpts;
                if (typeof onSelectOrOpts === "function") onSelect = onSelectOrOpts;
                else if (typeof onSelectOrOpts === "object" && onSelectOrOpts !== null) opts = onSelectOrOpts;
                if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
            } else if (Array.isArray(labelOrItemsOrOnSelect)) {
                label = idOrLabelOrItems;
                items = labelOrItemsOrOnSelect;
                if (typeof itemsOrOnSelectOrOpts === "function") onSelect = itemsOrOnSelectOrOpts as EventCallback;
                else if (typeof itemsOrOnSelectOrOpts === "object" && itemsOrOnSelectOrOpts !== null) opts = itemsOrOnSelectOrOpts;
            } else {
                label = idOrLabelOrItems;
                if (typeof labelOrItemsOrOnSelect === "function") onSelect = labelOrItemsOrOnSelect as EventCallback;
                else if (typeof labelOrItemsOrOnSelect === "object" && labelOrItemsOrOnSelect !== null) opts = labelOrItemsOrOnSelect;
            }
        }

        const id = explicitId || opts.id || this.generateUniqueId("dropdown");
        const ref = this.addVisualControl("dropdown_menu", 160, 36, {
            id,
            text: label,
            caption: label,
            items,
            ...opts
        });
        if (onSelect) {
            this.bindControlEvent(id, "onSelect", onSelect);
            this.bindControlEvent(id, "onClick", onSelect);
        }
        return ref;
    }
    public add_dropdown_menu(...args: any[]) { return (this.addDropdownMenu as any)(...args); }
    public addW3Dropdown(...args: any[]) { return (this.addDropdownMenu as any)(...args); }
    public add_w3_dropdown(...args: any[]) { return (this.addDropdownMenu as any)(...args); }

    public addListGroup(
        idOrItems: string | any[] = [],
        itemsOrOnSelect?: any[] | EventCallback,
        onSelectOrOpts?: EventCallback | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let items: any[] = [];
        let onSelect: EventCallback | undefined;
        let opts: Partial<any> = {};

        if (typeof idOrItems === "string" && Array.isArray(itemsOrOnSelect)) {
            explicitId = idOrItems;
            items = itemsOrOnSelect;
            if (typeof onSelectOrOpts === "function") onSelect = onSelectOrOpts;
            else if (typeof onSelectOrOpts === "object" && onSelectOrOpts !== null) opts = onSelectOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else if (Array.isArray(idOrItems)) {
            items = idOrItems;
            if (typeof itemsOrOnSelect === "function") onSelect = itemsOrOnSelect as EventCallback;
            else if (typeof itemsOrOnSelect === "object" && itemsOrOnSelect !== null) opts = itemsOrOnSelect;
        }

        const id = explicitId || opts.id || this.generateUniqueId("list_group");
        const ref = this.addVisualControl("list_group", 280, 160, {
            id,
            items,
            ...opts
        });
        if (onSelect) {
            this.bindControlEvent(id, "onSelect", onSelect);
            this.bindControlEvent(id, "onClick", onSelect);
        }
        return ref;
    }
    public add_list_group(...args: any[]) { return (this.addListGroup as any)(...args); }
    public addBadgedList(...args: any[]) { return (this.addListGroup as any)(...args); }
    public add_badged_list(...args: any[]) { return (this.addListGroup as any)(...args); }
    public addW3List(...args: any[]) { return (this.addListGroup as any)(...args); }
    public add_w3_list(...args: any[]) { return (this.addListGroup as any)(...args); }

    public addContentCard(
        idOrTitle = "Card Title",
        titleOrDesc?: string | Partial<any>,
        descOrFooter?: string | Partial<any>,
        footerOrOpts?: string | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let title = "Card Title";
        let desc = "Cards provide a clean container with elevation shadow, header banner, and action buttons.";
        let footer = "";
        let opts: Partial<any> = {};

        if (typeof idOrTitle === "string" && typeof titleOrDesc === "string" && typeof descOrFooter === "string") {
            explicitId = idOrTitle;
            title = titleOrDesc;
            desc = descOrFooter;
            if (typeof footerOrOpts === "string") footer = footerOrOpts;
            else if (typeof footerOrOpts === "object" && footerOrOpts !== null) opts = footerOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else if (typeof idOrTitle === "string" && typeof titleOrDesc === "string") {
            title = idOrTitle;
            desc = titleOrDesc;
            if (typeof descOrFooter === "string") footer = descOrFooter;
            else if (typeof descOrFooter === "object" && descOrFooter !== null) opts = descOrFooter;
        } else {
            title = idOrTitle;
            if (typeof titleOrDesc === "object" && titleOrDesc !== null) opts = titleOrDesc;
        }

        const id = explicitId || opts.id || this.generateUniqueId("card");
        return this.addVisualControl("content_card", 240, 220, {
            id,
            title,
            caption: title,
            text: title,
            description: desc,
            footer,
            ...opts
        });
    }
    public add_content_card(...args: any[]) { return (this.addContentCard as any)(...args); }
    public addCard(...args: any[]) { return (this.addContentCard as any)(...args); }
    public add_card(...args: any[]) { return (this.addContentCard as any)(...args); }
    public addW3Card(...args: any[]) { return (this.addContentCard as any)(...args); }
    public add_w3_card(...args: any[]) { return (this.addContentCard as any)(...args); }

    public addCalloutPanel(
        idOrTitleOrMsg = "Important Note",
        titleOrMsgOrType?: string,
        msgOrTypeOrOpts?: string | Partial<any>,
        typeOrOpts?: string | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let title = "Important Note";
        let message = "";
        let alertType = "info";
        let opts: Partial<any> = {};

        if (typeof idOrTitleOrMsg === "string" && typeof titleOrMsgOrType === "string" && typeof msgOrTypeOrOpts === "string") {
            explicitId = idOrTitleOrMsg;
            title = titleOrMsgOrType;
            message = msgOrTypeOrOpts;
            if (typeof typeOrOpts === "string") alertType = typeOrOpts;
            else if (typeof typeOrOpts === "object" && typeOrOpts !== null) opts = typeOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else if (typeof idOrTitleOrMsg === "string" && typeof titleOrMsgOrType === "string") {
            title = idOrTitleOrMsg;
            message = titleOrMsgOrType;
            if (typeof msgOrTypeOrOpts === "string") alertType = msgOrTypeOrOpts;
            else if (typeof msgOrTypeOrOpts === "object" && msgOrTypeOrOpts !== null) opts = msgOrTypeOrOpts;
        } else {
            message = idOrTitleOrMsg;
            if (typeof titleOrMsgOrType === "object" && titleOrMsgOrType !== null) opts = titleOrMsgOrType;
        }

        const id = explicitId || opts.id || this.generateUniqueId("callout");
        return this.addVisualControl("callout_panel", 280, 80, {
            id,
            title,
            caption: title,
            message,
            text: message,
            alert_type: opts.alert_type || alertType,
            ...opts
        });
    }
    public add_callout_panel(...args: any[]) { return (this.addCalloutPanel as any)(...args); }
    public addNotePanel(...args: any[]) { return (this.addCalloutPanel as any)(...args); }
    public add_note_panel(...args: any[]) { return (this.addCalloutPanel as any)(...args); }
    public addW3Panel(...args: any[]) { return (this.addCalloutPanel as any)(...args); }
    public add_w3_panel(...args: any[]) { return (this.addCalloutPanel as any)(...args); }

    public addTooltipBox(
        idOrTrigger = "Hover Me ℹ️",
        triggerOrTooltip?: string,
        tooltipOrOpts?: string | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let triggerText = "Hover Me ℹ️";
        let tooltipText = "Helpful information popup";
        let opts: Partial<any> = {};

        if (typeof idOrTrigger === "string" && typeof triggerOrTooltip === "string" && typeof tooltipOrOpts === "string") {
            explicitId = idOrTrigger;
            triggerText = triggerOrTooltip;
            tooltipText = tooltipOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = optsArg;
        } else if (typeof idOrTrigger === "string" && typeof triggerOrTooltip === "string") {
            triggerText = idOrTrigger;
            tooltipText = triggerOrTooltip;
            if (typeof tooltipOrOpts === "object" && tooltipOrOpts !== null) opts = tooltipOrOpts;
        } else {
            triggerText = idOrTrigger;
            if (typeof triggerOrTooltip === "object" && triggerOrTooltip !== null) opts = triggerOrTooltip;
        }

        const id = explicitId || opts.id || this.generateUniqueId("tooltip");
        return this.addVisualControl("tooltip_box", 140, 36, {
            id,
            text: triggerText,
            caption: triggerText,
            tooltip: tooltipText,
            content: tooltipText,
            ...opts
        });
    }
    public add_tooltip_box(...args: any[]) { return (this.addTooltipBox as any)(...args); }
    public addW3Tooltip(...args: any[]) { return (this.addTooltipBox as any)(...args); }
    public add_w3_tooltip(...args: any[]) { return (this.addTooltipBox as any)(...args); }

    public addAnimatedInput(
        idOrPlaceholder = "Click to expand...",
        placeholderOrVal?: string,
        valOrOnChange?: string | EventCallback,
        onChangeOrOpts?: EventCallback | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let placeholder = "Click to expand...";
        let val = "";
        let onChange: EventCallback | undefined;
        let opts: Partial<any> = {};

        if (typeof idOrPlaceholder === "string" && typeof placeholderOrVal === "string") {
            explicitId = idOrPlaceholder;
            placeholder = placeholderOrVal;
            if (typeof valOrOnChange === "string") val = valOrOnChange;
            else if (typeof valOrOnChange === "function") onChange = valOrOnChange;
            if (typeof onChangeOrOpts === "function") onChange = onChangeOrOpts;
            else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null) opts = onChangeOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else {
            placeholder = idOrPlaceholder;
            if (typeof placeholderOrVal === "string") val = placeholderOrVal;
            else if (typeof placeholderOrVal === "function") onChange = placeholderOrVal;
            else if (typeof placeholderOrVal === "object" && placeholderOrVal !== null) opts = placeholderOrVal;
        }

        const id = explicitId || opts.id || this.generateUniqueId("anim_input");
        const ref = this.addVisualControl("animated_input", 240, 36, {
            id,
            placeholder,
            value: val,
            text: val,
            ...opts
        });
        if (onChange) {
            this.bindControlEvent(id, "onChange", onChange);
        }
        return ref;
    }
    public add_animated_input(...args: any[]) { return (this.addAnimatedInput as any)(...args); }
    public addW3AnimatedInput(...args: any[]) { return (this.addAnimatedInput as any)(...args); }
    public add_w3_animated_input(...args: any[]) { return (this.addAnimatedInput as any)(...args); }

    public addHeroDisplay(
        idOrTitle = "Hero Display",
        titleOrSubtitle?: string,
        subtitleOrOpts?: string | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let title = "Hero Display";
        let subtitle = "Modern visual container with high contrast typography and responsive layout.";
        let opts: Partial<any> = {};

        if (typeof idOrTitle === "string" && typeof titleOrSubtitle === "string" && typeof subtitleOrOpts === "string") {
            explicitId = idOrTitle;
            title = titleOrSubtitle;
            subtitle = subtitleOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = optsArg;
        } else if (typeof idOrTitle === "string" && typeof titleOrSubtitle === "string") {
            title = idOrTitle;
            subtitle = titleOrSubtitle;
            if (typeof subtitleOrOpts === "object" && subtitleOrOpts !== null) opts = subtitleOrOpts;
        } else {
            title = idOrTitle;
            if (typeof titleOrSubtitle === "object" && titleOrSubtitle !== null) opts = titleOrSubtitle;
        }

        const id = explicitId || opts.id || this.generateUniqueId("display");
        const w = this.width - (this.padding * 2);
        return this.addVisualControl("hero_display", w, 160, {
            id,
            title,
            caption: title,
            text: title,
            subtitle,
            description: subtitle,
            ...opts
        });
    }
    public add_hero_display(...args: any[]) { return (this.addHeroDisplay as any)(...args); }
    public addDisplayContainer(...args: any[]) { return (this.addHeroDisplay as any)(...args); }
    public add_display_container(...args: any[]) { return (this.addHeroDisplay as any)(...args); }
    public addW3Display(...args: any[]) { return (this.addHeroDisplay as any)(...args); }
    public add_w3_display(...args: any[]) { return (this.addHeroDisplay as any)(...args); }

    public addCodeSnippet(
        idOrCode = "const app = new StudioApp();",
        codeOrLang?: string,
        langOrOpts?: string | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let code = "const app = new StudioApp();";
        let language = "typescript";
        let opts: Partial<any> = {};

        if (typeof idOrCode === "string" && typeof codeOrLang === "string") {
            explicitId = idOrCode;
            code = codeOrLang;
            if (typeof langOrOpts === "string") language = langOrOpts;
            else if (typeof langOrOpts === "object" && langOrOpts !== null) opts = langOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else {
            code = idOrCode;
            if (typeof codeOrLang === "string") language = codeOrLang;
            else if (typeof codeOrLang === "object" && codeOrLang !== null) opts = codeOrLang;
        }

        const id = explicitId || opts.id || this.generateUniqueId("code_snippet");
        return this.addVisualControl("code_snippet", 300, 110, {
            id,
            code,
            text: code,
            language,
            ...opts
        });
    }
    public add_code_snippet(...args: any[]) { return (this.addCodeSnippet as any)(...args); }
    public addCodeBlock(...args: any[]) { return (this.addCodeSnippet as any)(...args); }
    public add_code_block(...args: any[]) { return (this.addCodeSnippet as any)(...args); }
    public addW3Code(...args: any[]) { return (this.addCodeSnippet as any)(...args); }
    public add_w3_code(...args: any[]) { return (this.addCodeSnippet as any)(...args); }

    public addCountBadge(
        idOrLabelOrCount: string | number = 1,
        labelOrCountOrColor?: string | number,
        countOrColorOrOpts?: string | number | Partial<any>,
        colorOrOpts?: string | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let label = "";
        let count: string | number = 1;
        let color = "primary";
        let opts: Partial<any> = {};

        if (typeof idOrLabelOrCount === "string" && typeof labelOrCountOrColor === "string" && (typeof countOrColorOrOpts === "number" || typeof countOrColorOrOpts === "string")) {
            explicitId = idOrLabelOrCount;
            label = labelOrCountOrColor;
            count = countOrColorOrOpts;
            if (typeof colorOrOpts === "string") color = colorOrOpts;
            else if (typeof colorOrOpts === "object" && colorOrOpts !== null) opts = colorOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else if (typeof idOrLabelOrCount === "string" && (typeof labelOrCountOrColor === "number" || typeof labelOrCountOrColor === "string")) {
            label = idOrLabelOrCount;
            count = labelOrCountOrColor;
            if (typeof countOrColorOrOpts === "string") color = countOrColorOrOpts;
            else if (typeof countOrColorOrOpts === "object" && countOrColorOrOpts !== null) opts = countOrColorOrOpts;
        } else {
            count = idOrLabelOrCount;
            if (typeof labelOrCountOrColor === "string") color = labelOrCountOrColor;
            else if (typeof labelOrCountOrColor === "object" && labelOrCountOrColor !== null) opts = labelOrCountOrColor;
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
            ...opts
        });
    }
    public add_count_badge(...args: any[]) { return (this.addCountBadge as any)(...args); }
    public addCircularBadge(...args: any[]) { return (this.addCountBadge as any)(...args); }
    public add_circular_badge(...args: any[]) { return (this.addCountBadge as any)(...args); }
    public addW3Badge(...args: any[]) { return (this.addCountBadge as any)(...args); }
    public add_w3_badge(...args: any[]) { return (this.addCountBadge as any)(...args); }

    public addButtonGroup(
        idOrButtons: string | any[] = ["Left", "Center", "Right"],
        buttonsOrOnClick?: any[] | EventCallback,
        onClickOrOpts?: EventCallback | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let buttons = ["Left", "Center", "Right"];
        let onClick: EventCallback | undefined;
        let opts: Partial<any> = {};

        if (typeof idOrButtons === "string" && Array.isArray(buttonsOrOnClick)) {
            explicitId = idOrButtons;
            buttons = buttonsOrOnClick;
            if (typeof onClickOrOpts === "function") onClick = onClickOrOpts;
            else if (typeof onClickOrOpts === "object" && onClickOrOpts !== null) opts = onClickOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else if (Array.isArray(idOrButtons)) {
            buttons = idOrButtons;
            if (typeof buttonsOrOnClick === "function") onClick = buttonsOrOnClick as EventCallback;
            else if (typeof buttonsOrOnClick === "object" && buttonsOrOnClick !== null) opts = buttonsOrOnClick;
        }

        const id = explicitId || opts.id || this.generateUniqueId("button_group");
        const ref = this.addVisualControl("button_group", 240, 36, {
            id,
            buttons,
            ...opts
        });
        if (onClick) {
            this.bindControlEvent(id, "onClick", onClick);
        }
        return ref;
    }
    public add_button_group(...args: any[]) { return (this.addButtonGroup as any)(...args); }
    public addButtonBar(...args: any[]) { return (this.addButtonGroup as any)(...args); }
    public add_button_bar(...args: any[]) { return (this.addButtonGroup as any)(...args); }
    public addW3ButtonGroup(...args: any[]) { return (this.addButtonGroup as any)(...args); }
    public add_w3_button_group(...args: any[]) { return (this.addButtonGroup as any)(...args); }

    public addSlideshow(
        idOrSlides: string | any[] = [],
        slidesOrOnChange?: any[] | EventCallback,
        onChangeOrOpts?: EventCallback | Partial<any>,
        optsArg: Partial<any> = {}
    ): SimpleControlRef {
        let explicitId: string | undefined;
        let slides: any[] = [];
        let onChange: EventCallback | undefined;
        let opts: Partial<any> = {};

        if (typeof idOrSlides === "string" && Array.isArray(slidesOrOnChange)) {
            explicitId = idOrSlides;
            slides = slidesOrOnChange;
            if (typeof onChangeOrOpts === "function") onChange = onChangeOrOpts;
            else if (typeof onChangeOrOpts === "object" && onChangeOrOpts !== null) opts = onChangeOrOpts;
            if (typeof optsArg === "object" && optsArg !== null) opts = { ...opts, ...optsArg };
        } else if (Array.isArray(idOrSlides)) {
            slides = idOrSlides;
            if (typeof slidesOrOnChange === "function") onChange = slidesOrOnChange as EventCallback;
            else if (typeof slidesOrOnChange === "object" && slidesOrOnChange !== null) opts = slidesOrOnChange;
        }

        const id = explicitId || opts.id || this.generateUniqueId("slideshow");
        const ref = this.addVisualControl("slideshow", 300, 180, {
            id,
            slides,
            ...opts
        });
        if (onChange) {
            this.bindControlEvent(id, "onChange", onChange);
        }
        return ref;
    }
    public add_slideshow(...args: any[]) { return (this.addSlideshow as any)(...args); }
    public addCarousel(...args: any[]) { return (this.addSlideshow as any)(...args); }
    public add_carousel(...args: any[]) { return (this.addSlideshow as any)(...args); }
    public addW3Slideshow(...args: any[]) { return (this.addSlideshow as any)(...args); }
    public add_w3_slideshow(...args: any[]) { return (this.addSlideshow as any)(...args); }

    public openModal(modalId: string): this {
        this.evalJS(`if(window.openModal)window.openModal('${modalId}');else{const el=document.getElementById('${modalId}');if(el)el.style.display='flex';}`);
        return this;
    }
    public closeModal(modalId: string): this {
        this.evalJS(`if(window.closeModal)window.closeModal('${modalId}');else{const el=document.getElementById('${modalId}');if(el)el.style.display='none';}`);
        return this;
    }


    // --- IPC Event Registration & Dispatching ---
    public bindControlEvent(controlId: string, eventType: string, callback: EventCallback): void {
        const raw = eventType.toLowerCase();
        const norm = raw.startsWith("on") ? raw : `on${raw}`;
        this.eventHandlersMap.set(`${controlId}:${norm}`, callback);
        this.eventHandlersMap.set(`${controlId}:${raw}`, callback);

        if (this.webview) {
            const bindName = `on_${controlId}_${eventType.replace(/^on/i, "").toLowerCase()}`;
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
                // Ignore if already bound
            }
        }
    }

    public evalJS(code: string): void {
        if (this.webview) {
            try {
                this.webview.eval(code);
            } catch (e) {
                console.error("[SimpleWindow.evalJS error]:", e);
            }
        }
    }

    public eval(code: string): void {
        this.evalJS(code);
    }

    public getValue(id: string): any {
        if (this.formValuesStore[id] !== undefined) {
            return this.formValuesStore[id];
        }
        const ctrl = this.controls.find(c => c && (c.id === id || c.name === id));
        if (ctrl) {
            return ctrl.text ?? ctrl.caption ?? ctrl.value ?? "";
        }
        return undefined;
    }

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
            const escaped = typeof val === "string" ? JSON.stringify(val) : val;
            this.evalJS(`
                (function() {
                    const rawEl = document.getElementById("${id}");
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
                        } else if (rawEl.querySelector("table")) {
                            // Guard against overwriting table containers with textContent
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

    public setHtml(id: string, htmlContent: string): this {
        this.formValuesStore[id] = htmlContent;
        const ctrl = this.controls.find(c => c && (c.id === id || c.name === id));
        if (ctrl) {
            ctrl.text = htmlContent;
            ctrl.caption = htmlContent;
        }
        if (this.isWindowRunning) {
            const escaped = JSON.stringify(htmlContent);
            this.evalJS(`
                (function() {
                    const el = document.getElementById("${id}");
                    if (el) {
                        el.innerHTML = ${escaped};
                    }
                })();
            `);
        }
        return this;
    }
    public set_html(id: string, htmlContent: string): this {
        return this.setHtml(id, htmlContent);
    }

    public getText(id: string): string {
        return String(this.formValuesStore[id] || "");
    }

    public setText(id: string, text: string): this {
        return this.setValue(id, text);
    }

    public getFormValues(): Record<string, any> {
        return { ...this.formValuesStore };
    }

    public setFormValues(values: Record<string, any>): this {
        for (const [id, val] of Object.entries(values)) {
            this.setValue(id, val);
        }
        return this;
    }

    public clearForm(): this {
        for (const id of Object.keys(this.formValuesStore)) {
            this.setValue(id, "");
        }
        return this;
    }

    public resetForm(): this {
        return this.clearForm();
    }

    public clearInput(id: string): this {
        this.setValue(id, "");
        return this;
    }

    public clearInputs(ids: string[]): this {
        for (const id of ids) {
            this.setValue(id, "");
        }
        return this;
    }

    // --- Dialogs & Native Integration ---
    public showAlert(message: string, title = "Alert"): void {
        if (this.isWindowRunning) {
            const safeMsg = JSON.stringify(message);
            const safeTitle = JSON.stringify(title);
            this.evalJS(`if(window.showSimpleguiModalDialog){window.showSimpleguiModalDialog({type:"alert",title:${safeTitle},message:${safeMsg}});}else{alert(${safeMsg});}`);
        } else {
            console.log(`[Alert - ${title}] ${message}`);
        }
    }

    public async showConfirm(message: string, title = "Confirm"): Promise<boolean> {
        if (!this.isWindowRunning) return true;
        const reqId = `confirm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        return new Promise((resolve) => {
            this.promptResolversMap.set(reqId, resolve);
            const safeMsg = JSON.stringify(message);
            const safeTitle = JSON.stringify(title);
            this.evalJS(`
                if(window.showSimpleguiModalDialog){
                    window.showSimpleguiModalDialog({type:"confirm",title:${safeTitle},message:${safeMsg},reqId:"${reqId}"});
                } else {
                    const res = confirm(${safeMsg});
                    const fn = window.handlePromptResultIPC || window.onSimpleguiPromptResult;
                    if (fn) fn("${reqId}", res);
                }
            `);
        });
    }

    public async showPrompt(message: string, defaultVal = "", title = "Prompt"): Promise<string | null> {
        if (!this.isWindowRunning) return defaultVal;
        const reqId = `prompt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        return new Promise((resolve) => {
            this.promptResolversMap.set(reqId, resolve);
            const safeMsg = JSON.stringify(message);
            const safeDef = JSON.stringify(defaultVal);
            const safeTitle = JSON.stringify(title);
            this.evalJS(`
                if(window.showSimpleguiModalDialog){
                    window.showSimpleguiModalDialog({type:"prompt",title:${safeTitle},message:${safeMsg},defaultVal:${safeDef},reqId:"${reqId}"});
                } else {
                    const res = prompt(${safeMsg}, ${safeDef});
                    const fn = window.handlePromptResultIPC || window.onSimpleguiPromptResult;
                    if (fn) fn("${reqId}", res);
                }
            `);
        });
    }

    public alert(message: string, title = "Alert"): void {
        this.showAlert(message, title);
    }

    public copyToClipboard(text: string): void {
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

    public async getClipboardText(): Promise<string> {
        if (!this.isWindowRunning) return "";
        const reqId = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        return new Promise((resolve) => {
            this.promptResolversMap.set(reqId, resolve);
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

    public async openFileDialog(title = "Open File", filter = ""): Promise<string | null> {
        try {
            if (process.platform === "darwin") {
                const safeTitle = title.replace(/"/g, '\\"');
                const script = `try\nactivate\nPOSIX path of (choose file with prompt "${safeTitle}")\non error\nreturn ""\nend try`;
                const proc = Bun.spawnSync(["osascript", "-e", script]);
                const out = proc.stdout.toString().trim();
                return out || null;
            } else if (process.platform === "linux") {
                const proc = Bun.spawnSync(["zenity", "--file-selection", `--title=${title}`]);
                const out = proc.stdout.toString().trim();
                return out || null;
            } else if (process.platform === "win32") {
                const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = '${title}'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$f.FileName}`;
                const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", psScript]);
                const out = proc.stdout.toString().trim();
                return out || null;
            }
        } catch {
            // fallback
        }
        return null;
    }

    public async saveFileDialog(title = "Save File", defaultName = "untitled.txt"): Promise<string | null> {
        try {
            if (process.platform === "darwin") {
                const safeTitle = title.replace(/"/g, '\\"');
                const safeName = defaultName.replace(/"/g, '\\"');
                const script = `try\nactivate\nPOSIX path of (choose file name with prompt "${safeTitle}" default name "${safeName}")\non error\nreturn ""\nend try`;
                const proc = Bun.spawnSync(["osascript", "-e", script]);
                const out = proc.stdout.toString().trim();
                return out || null;
            } else if (process.platform === "linux") {
                const proc = Bun.spawnSync(["zenity", "--file-selection", "--save", "--confirm-overwrite", `--title=${title}`, `--filename=${defaultName}`]);
                const out = proc.stdout.toString().trim();
                return out || null;
            } else if (process.platform === "win32") {
                const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.SaveFileDialog; $f.Title = '${title}'; $f.FileName = '${defaultName}'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$f.FileName}`;
                const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", psScript]);
                const out = proc.stdout.toString().trim();
                return out || null;
            }
        } catch {
            // fallback
        }
        return null;
    }

    public async openFolderDialog(title = "Select Folder"): Promise<string | null> {
        try {
            if (process.platform === "darwin") {
                const safeTitle = title.replace(/"/g, '\\"');
                const script = `try\nactivate\nPOSIX path of (choose folder with prompt "${safeTitle}")\non error\nreturn ""\nend try`;
                const proc = Bun.spawnSync(["osascript", "-e", script]);
                const out = proc.stdout.toString().trim();
                return out || null;
            } else if (process.platform === "linux") {
                const proc = Bun.spawnSync(["zenity", "--file-selection", "--directory", `--title=${title}`]);
                const out = proc.stdout.toString().trim();
                return out || null;
            } else if (process.platform === "win32") {
                const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = '${title}'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$f.SelectedPath}`;
                const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", psScript]);
                const out = proc.stdout.toString().trim();
                return out || null;
            }
        } catch {
            // fallback
        }
        return null;
    }

    public open_file_dialog(title = "Open File", filter = ""): Promise<string | null> {
        return this.openFileDialog(title, filter);
    }
    public save_file_dialog(title = "Save File", defaultName = "untitled.txt"): Promise<string | null> {
        return this.saveFileDialog(title, defaultName);
    }
    public open_folder_dialog(title = "Select Folder"): Promise<string | null> {
        return this.openFolderDialog(title);
    }
    public browse_file(title = "Open File", filter = ""): Promise<string | null> {
        return this.openFileDialog(title, filter);
    }
    public browse_folder(title = "Select Folder"): Promise<string | null> {
        return this.openFolderDialog(title);
    }

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

    public async sleep(ms: number): Promise<void> {
        return this.delay(ms) as Promise<void>;
    }

    public async withBusyState(names: string[], statusText: string, callback: (win: SimpleWindow, done: (completionStatus?: string) => void) => any | Promise<any>): Promise<this> {
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
            console.log(`[withBusyState] Finished callback. Restoring control states...`);
            for (const [name, enabled] of Object.entries(originalStates)) {
                this.setControlEnabled(name, enabled);
            }
            
            const finalStatus = completionStatus || "Task completed";
            this.setStatus(finalStatus);

            // Keep the completion status visible for 3 seconds before reverting to original status
            setTimeout(() => {
                if (this.isWindowRunning) {
                    console.log(`[withBusyState] Reverting status label to: ${originalStatus}`);
                    this.setStatus(originalStatus);
                }
            }, 3000);
        };

        try {
            const result = callback(this, done);
            if (result && typeof result.then === 'function') {
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
    public buildFormSpec(): any {
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
            padding: this.padding,
            spacing: this.spacing,
            controls: specControls,
            non_visual_controls: this.nonVisualControls,
            menu_bar: (this as any)._menuBarSpec,
            global_context_menu_items: (this as any)._globalContextMenuItems || []
        };
    }

    public toHtml(): string {
        return this.generateHtml();
    }

    public to_html(): string {
        return this.generateHtml();
    }

    public getHtml(): string {
        return this.generateHtml();
    }

    public get_html(): string {
        return this.generateHtml();
    }

    public generateHtml(): string {
        const spec = this.buildFormSpec();
        let html = generatePreviewHtml(spec);

        // Inject SimpleGUI modal dialog & IPC scripts
        const scriptInject = `
            <div id="simplegui-dialog-backdrop" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:999999;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;">
              <div id="simplegui-dialog-box" style="background:#1e293b;color:#f8fafc;border:1px solid rgba(255,255,255,0.18);border-radius:12px;padding:20px;width:340px;box-shadow:0 20px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:12px;">
                <div id="simplegui-dialog-title" style="font-weight:700;font-size:15px;color:#38bdf8;display:flex;align-items:center;gap:8px;"></div>
                <div id="simplegui-dialog-msg" style="font-size:13px;line-height:1.4;opacity:0.9;white-space:pre-wrap;color:#e2e8f0;"></div>
                <input id="simplegui-dialog-input" type="text" style="display:none;background:rgba(0,0,0,0.3);color:#fff;border:1px solid rgba(56,189,248,0.4);border-radius:6px;padding:6px 10px;font-size:13px;outline:none;" />
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
                  <button id="simplegui-dialog-cancel" style="display:none;padding:6px 14px;background:rgba(255,255,255,0.1);color:#cbd5e1;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Cancel</button>
                  <button id="simplegui-dialog-ok" style="padding:6px 16px;background:#0284c7;color:#ffffff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">OK</button>
                </div>
              </div>
            </div>
            <script>
            (function() {
                window.onSimpleguiPromptResult = function(reqId, result) {
                    if (window.handlePromptResultIPC) {
                        window.handlePromptResultIPC(reqId, result);
                    }
                };

                window.showSimpleguiModalDialog = function(opts) {
                    const backdrop = document.getElementById("simplegui-dialog-backdrop");
                    const titleEl = document.getElementById("simplegui-dialog-title");
                    const msgEl = document.getElementById("simplegui-dialog-msg");
                    const inputEl = document.getElementById("simplegui-dialog-input");
                    const cancelBtn = document.getElementById("simplegui-dialog-cancel");
                    const okBtn = document.getElementById("simplegui-dialog-ok");
                    if (!backdrop) return;

                    titleEl.textContent = opts.title || "Information";
                    msgEl.textContent = opts.message || "";
                    
                    if (opts.type === "prompt") {
                      inputEl.style.display = "block";
                      inputEl.value = opts.defaultVal || "";
                      setTimeout(() => inputEl.focus(), 50);
                    } else {
                      inputEl.style.display = "none";
                    }

                    if (opts.type === "confirm" || opts.type === "prompt") {
                      cancelBtn.style.display = "inline-block";
                    } else {
                      cancelBtn.style.display = "none";
                    }

                    backdrop.style.display = "flex";

                    const cleanup = () => {
                      backdrop.style.display = "none";
                      okBtn.onclick = null;
                      cancelBtn.onclick = null;
                    };

                    okBtn.onclick = () => {
                      cleanup();
                      const val = opts.type === "prompt" ? inputEl.value : true;
                      if (opts.reqId && window.onSimpleguiPromptResult) window.onSimpleguiPromptResult(opts.reqId, val);
                    };

                    cancelBtn.onclick = () => {
                      cleanup();
                      const val = opts.type === "prompt" ? null : false;
                      if (opts.reqId && window.onSimpleguiPromptResult) window.onSimpleguiPromptResult(opts.reqId, val);
                    };
                };

                setInterval(function() {
                    if (window.handleHeartbeatIPC) window.handleHeartbeatIPC();
                }, 50);

                window.addEventListener("beforeunload", function() {
                    if (window.handleWindowCloseIPC) window.handleWindowCloseIPC();
                });
                window.addEventListener("unload", function() {
                    if (window.handleWindowCloseIPC) window.handleWindowCloseIPC();
                });

                ${(this as any)._globalContextMenuItems ? `window.globalContextMenuItems = ${JSON.stringify((this as any)._globalContextMenuItems)};` : ''}

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
                    if (typeof window.closeWindow === "function") {
                        try { window.closeWindow(); return; } catch(e) {}
                    }
                    if (typeof window.handleWindowCloseIPC === "function") {
                        try { window.handleWindowCloseIPC(); return; } catch(e) {}
                    }
                    try { window.close(); } catch(e) {}
                    try { fetch("/api/shutdown", { method: "POST" }); } catch(e) {}
                    try { fetch("/api/close", { method: "POST" }); } catch(e) {}
                }

                let lastFullscreenTime = 0;
                function doToggleFullscreen() {
                    const now = Date.now();
                    if (now - lastFullscreenTime < 500) return;
                    lastFullscreenTime = now;

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
                ${this.fullscreen ? `
                triggerInitialFullscreen();
                ` : ""}

                let isFnPressed = false;
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

                    if ((e.key === "Alt" || e.code === "AltLeft" || e.code === "AltRight")) {
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
                    const isCmdOrCtrlF = (e.metaKey || e.ctrlKey) && isF;

                    if (
                        isCmdOrCtrlF ||
                        (!isInput && isBareF) ||
                        (isFn && isF) ||
                        e.key === "F11" || e.code === "F11" ||
                        (e.altKey && (e.key === "Enter" || e.code === "Enter"))
                    ) {
                        e.preventDefault();
                        doToggleFullscreen();
                        return;
                    }

                    if (e.key === "Escape" || e.code === "Escape") {
                        try {
                            if (document.fullscreenElement || document.webkitFullscreenElement) {
                                if (document.exitFullscreen) document.exitFullscreen().catch(function() {});
                                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                            }
                            if (typeof window.toggleNativeFullscreen === "function") {
                                try { window.toggleNativeFullscreen(); } catch(e) {}
                            }
                        } catch(e) {}
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
                    const active = document.activeElement;
                    if (active && active.id && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) {
                        const val = active.type === "checkbox" ? active.checked : active.value;
                        const eventName = "on_" + active.id + "_change";
                        if (window[eventName]) {
                            window[eventName](val);
                        }
                    }
                });

                document.addEventListener("change", function(e) {
                    const active = document.activeElement;
                    if (active && active.id && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) {
                        const val = active.type === "checkbox" ? active.checked : active.value;
                        const eventName = "on_" + active.id + "_change";
                        if (window[eventName]) {
                            window[eventName](val);
                        }
                    }
                });

                document.addEventListener("click", function(e) {
                    const active = document.activeElement;
                    if (active && active.id && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT")) {
                        const val = active.type === "checkbox" ? active.checked : active.value;
                        const eventName = "on_" + active.id + "_change";
                        if (window[eventName]) {
                            window[eventName](val);
                        }
                    }
                });
            })();
            </script>
            ${this.customScripts.length > 0 ? this.customScripts.map(s => `<script>\n${s}\n</script>`).join("\n") : ""}
        `;

        const lastBodyIdx = html.lastIndexOf("</body>");
        if (lastBodyIdx !== -1) {
            html = html.substring(0, lastBodyIdx) + scriptInject + html.substring(lastBodyIdx);
        } else {
            html += scriptInject;
        }

        return html;
    }

    public addScript(script: string): this {
        this.customScripts.push(script);
        if (this.isWindowRunning) {
            this.evalJS(script);
        }
        return this;
    }

    public getControls(): any[] {
        return [...this.controls];
    }

    public getNonVisualControls(): any[] {
        return [...this.nonVisualControls];
    }

    public getFormSpec(): FormSpec {
        return this.buildFormSpec();
    }


    public getWebview(): Webview | null {
        return this.webview;
    }

    public run(): void {
        this.show();
    }

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
        this.webview = new Webview();
        this.webview.title = this.title;
        this.webview.size = { width: this.width, height: this.height, hint: SizeHint.NONE };
        if (this.fullscreen) {
            try { setWindowPositionNative(this.webview, { x: 0, y: 0 }, this.width, this.height); } catch {}
        }
        attachWindowShortcuts(this.webview, {
            onQuit: () => this.handleClose(),
            onClose: () => this.handleClose(),
            onMinimize: () => { if (this.webview) minimizeWindowNative(this.webview); },
            onFullscreen: () => { if (this.webview) toggleFullscreenNative(this.webview); },
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
        try { this.webview.bind("onSimpleguiPromptResult", handlePrompt); } catch (e) {}

        let lastHeartbeat = Date.now();
        this.webview.bind("handleHeartbeatIPC", () => {
            lastHeartbeat = Date.now();
        });

        this.webview.bind("quitApp", () => {
            this.handleClose();
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
            if (this.webview) setWindowPositionNative(this.webview, "center", this.width, this.height);
            return { success: true };
        });

        this.webview.bind("setWindowPosition", (pos: any) => {
            if (this.webview) setWindowPositionNative(this.webview, pos, this.width, this.height);
            return { success: true, position: pos };
        });

        // Auto-bind state synchronization IPC handlers for all controls BEFORE setHTML
        const boundHandlers = new Set<string>();

        const bindControlIpc = (ctrl: any) => {
            if (!ctrl || !ctrl.id) return;
            const cid = ctrl.id;

            const changeBind = `on_${cid}_change`;
            if (!boundHandlers.has(changeBind)) {
                boundHandlers.add(changeBind);
                try {
                    this.webview.bind(changeBind, async (val: any) => {
                        if (val !== undefined && val !== null) {
                            this.formValuesStore[cid] = val;
                        }
                        const cb = this.eventHandlersMap.get(`${cid}:onchange`);
                        if (cb) {
                            try { await cb(this, val); } catch (err) { console.error(`Error in IPC event ${changeBind}:`, err); }
                        }
                    });
                } catch (e) {}
            }

            const clickBind = `on_${cid}_click`;
            if (!boundHandlers.has(clickBind)) {
                boundHandlers.add(clickBind);
                try {
                    this.webview.bind(clickBind, async (val: any) => {
                        if (val !== undefined && val !== null) {
                            this.formValuesStore[cid] = val;
                        }
                        const cb = this.eventHandlersMap.get(`${cid}:onclick`);
                        if (cb) {
                            try { await cb(this, val); } catch (err) { console.error(`Error in IPC event ${clickBind}:`, err); }
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

        this.webview.run();
        this.isWindowRunning = false;
        this.handleClose();
        forceExit(0);
    }

    // --- Developer Helpers & Inspection Methods ---
    public findControl(id: string, list: any[] = this.controls): any | null {
        for (const item of list) {
            if (item.id === id) return item;
            if (item.children) {
                const found = this.findControl(id, item.children);
                if (found) return found;
            }
        }
        return this.nonVisualControls.find(c => c.id === id) || null;
    }

    public hasControl(id: string): boolean {
        return this.findControl(id) !== null;
    }

    public listControls(list: any[] = this.controls): string[] {
        let ids: string[] = [];
        for (const item of list) {
            if (item.id) ids.push(item.id);
            if (item.children) ids = ids.concat(this.listControls(item.children));
        }
        if (list === this.controls) {
            ids = ids.concat(this.nonVisualControls.map(c => c.id));
        }
        return ids;
    }

    public getControlKind(id: string): string {
        const ctrl = this.findControl(id);
        return ctrl ? (ctrl.control_type || ctrl.type || "unknown") : "unknown";
    }

    public requireControl(id: string): string {
        if (!this.hasControl(id)) {
            throw new Error(`[SimpleGUI] Required control '${id}' not found on window '${this.title}'`);
        }
        return id;
    }

    public getTitle(): string {
        return this.title;
    }

    public setDebugMode(enabled: boolean): this {
        if (enabled) console.log(`[SimpleGUI Debug] Debug mode enabled on window '${this.title}'`);
        return this;
    }

    public getDebugMode(): boolean {
        return true;
    }

    public setResponsiveLayout(enabled: boolean): this {
        return this;
    }

    public getResponsiveLayout(): boolean {
        return true;
    }

    public setMinSize(width: number, height: number): this {
        return this;
    }

    public setMaxSize(width: number, height: number): this {
        return this;
    }

    public setResizable(enabled: boolean): this {
        return this;
    }

    public getResizable(): boolean {
        return true;
    }

    public setMinimizable(enabled: boolean): this {
        return this;
    }

    public getMinimizable(): boolean {
        return true;
    }

    public setMaximizable(enabled: boolean): this {
        return this;
    }

    public getMaximizable(): boolean {
        return true;
    }

    public center(): this {
        if (this.webview) {
            setWindowPositionNative(this.webview, "center", this.width, this.height);
        }
        return this;
    }

    public centerWindow(): this {
        return this.center();
    }

    public alignWindow(position: string): this {
        return this.setPositionPreset(position);
    }

    public setSize(width: number, height: number): this {
        this.width = width;
        this.height = height;
        if (this.webview) {
            this.webview.size = { width, height, hint: SizeHint.NONE };
        }
        return this;
    }

    public resize(width: number, height: number): this {
        return this.setSize(width, height);
    }

    public getWidth(): number {
        return this.width;
    }

    public getHeight(): number {
        return this.height;
    }

    public setPosition(x: number, y: number): this {
        return this;
    }

    public getPosition(): [number, number] {
        return [100, 100];
    }

    public getX(): number { return 100; }
    public getY(): number { return 100; }

    public setOpacity(opacity: number): this {
        if (this.isWindowRunning) {
            this.evalJS(`document.body.style.opacity = "${opacity}";`);
        }
        return this;
    }

    public getOpacity(): number { return 1.0; }

    public setTitlebarVisible(visible: boolean): this {
        return this;
    }

    public isTitlebarVisible(): boolean { return true; }

    public setCursor(cursorName: string): this {
        if (this.isWindowRunning) {
            this.evalJS(`document.body.style.cursor = "${cursorName}";`);
        }
        return this;
    }

    public getCursor(): string { return "default"; }

    public resetCursor(): this {
        return this.setCursor("default");
    }

    public setControlCursor(controlId: string, cursorName: string): this {
        if (this.isWindowRunning) {
            this.evalJS(`
                const el = document.getElementById("${controlId}");
                if (el) el.style.cursor = "${cursorName}";
            `);
        }
        return this;
    }

    public bounceDockIcon(critical = false): this {
        return this;
    }

    public requestAttention(critical = false): this {
        return this.bounceDockIcon(critical);
    }

    public setClosable(enabled: boolean): this { return this; }
    public getClosable(): boolean { return true; }

    public setHasShadow(enabled: boolean): this { return this; }
    public getHasShadow(): boolean { return true; }

    public setMovableByWindowBackground(enabled: boolean): this { return this; }
    public getMovableByWindowBackground(): boolean { return true; }

    public isVisible(): boolean { return this.isWindowRunning; }
    public setTitleVisible(visible: boolean): this { return this; }
    public isTitleVisible(): boolean { return true; }
    public setSubtitle(subtitle: string): this { return this; }
    public getSubtitle(): string { return ""; }
    public setMovable(enabled: boolean): this { return this; }
    public getMovable(): boolean { return true; }

    public snapToEdge(edge: string): this { return this; }
    public setBounds(x: number, y: number, w: number, h: number): this {
        return this.setSize(w, h);
    }

    public getBounds(): [number, number, number, number] {
        return [100, 100, this.width, this.height];
    }

    public setFixedSize(width: number, height: number): this {
        return this.setSize(width, height);
    }

    public setSizePreset(preset: string): this {
        const presets: Record<string, [number, number]> = {
            small: [400, 300], compact: [400, 300],
            medium: [640, 480], standard: [640, 480],
            large: [800, 600], xlarge: [1024, 768],
            hd: [1280, 720], full_hd: [1920, 1080],
            dialog: [420, 220], login: [380, 450],
            settings: [550, 400], sidebar: [300, 600],
            splash: [500, 300], square: [500, 500]
        };
        const dims = presets[preset.toLowerCase()] || [800, 600];
        return this.setSize(dims[0], dims[1]);
    }

    public setPositionPreset(preset: string): this {
        if (this.webview) {
            setWindowPositionNative(this.webview, preset as any, this.width, this.height);
        }
        return this;
    }

    public makeFixedDialog(title: string, width: number, height: number): this {
        this.title = title;
        return this.setFixedSize(width, height);
    }

    public makeSplashScreen(width: number, height: number): this {
        return this.setFixedSize(width, height);
    }

    public makeUtilityPanel(): this {
        return this;
    }

    public makeFrameless(): this {
        return this;
    }

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

    public triggerShake(): this {
        return this.shakeWindow();
    }

    public flashAndShake(): this {
        return this.shakeWindow();
    }

    public setPadding(padding: number): this {
        this.padding = padding;
        return this;
    }

    public getPadding(): number {
        return this.padding;
    }

    public setSpacing(spacing: number): this {
        this.spacing = spacing;
        return this;
    }

    public getSpacing(): number {
        return this.spacing;
    }

    // --- Form Labeled Control Helpers ---
    public addFormField(label: string, id: string, value = ""): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addTextInput("", value).id(id).width(220);
        this.endRow();
        return ref;
    }

    public addFormTextarea(label: string, id: string, value = ""): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addTextArea("", value).id(id).width(220);
        this.endRow();
        return ref;
    }

    public addFormPassword(label: string, id: string, value = ""): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addPasswordInput("••••••••").id(id).width(220);
        if (value) this.setValue(id, value);
        this.endRow();
        return ref;
    }

    public addFormSlider(label: string, id: string, value = 50): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addSlider(0, 100, value).id(id).width(220);
        this.endRow();
        return ref;
    }

    public addFormNumber(label: string, id: string, value = 0): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addStepper(0, 9999, value).id(id).width(140);
        this.endRow();
        return ref;
    }

    public addFormDropdown(label: string, id: string, items: string[], selected = ""): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addDropdown(items, selected).id(id).width(220);
        this.endRow();
        return ref;
    }

    public addFormDatePicker(label: string, id: string, date = "2026-07-27"): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addDatePicker(date).id(id).width(220);
        this.endRow();
        return ref;
    }

    public addFormProgress(label: string, id: string, value = 50): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addProgressBar(value).id(id).width(220);
        this.endRow();
        return ref;
    }

    public addFormSwitch(label: string, id: string, switchLabel: string, checked = false): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(130);
        const ref = this.addSwitch(switchLabel, checked).id(id).width(220);
        this.endRow();
        return ref;
    }

    public addFormLink(label: string, id: string, linkText: string, url = "#"): SimpleControlRef {
        this.beginRow();
        this.addLabel(label).width(120);
        const ref = this.addVisualControl("form_link", 240, 24, { id, text: linkText, caption: linkText, placeholder: url });
        this.endRow();
        return ref;
    }

    public addHeading(title: string, subtitle?: string): this {
        const theme = getTheme(this.theme);
        const muted = theme.is_dark ? "#94a3b8" : "#334155";
        const headingColor = this.accentColor || (theme.is_dark ? "#38bdf8" : "#0066cc");
        const isInRow = this.layoutStack[this.layoutStack.length - 1]?.type === "row";
        if (isInRow) {
            const compactW = Math.max(160, Math.ceil(title.length * 9.5) + 12);
            this.addLabel(title).font(18, headingColor, "700").width(compactW);
            if (subtitle) {
                const sub = this.addLabel(subtitle).font(12, muted, "500");
                sub.spec.is_caption = true;
            }
            return this;
        }
        const fullW = Math.max(300, this.width - (this.padding * 2));
        this.addLabel(title).font(18, headingColor, "700").width(fullW);
        if (subtitle) {
            const sub = this.addLabel(subtitle).font(12, muted, "500").width(fullW);
            sub.spec.is_caption = true;
        }
        this.addDivider();
        return this;
    }
    public add_heading(title: string, subtitle?: string): this { return this.addHeading(title, subtitle); }
    public addHeader(title: string, subtitle?: string): this { return this.addHeading(title, subtitle); }
    public add_header(title: string, subtitle?: string): this { return this.addHeading(title, subtitle); }

    public addSubheading(text: string, color?: string): SimpleControlRef {
        const theme = getTheme(this.theme);
        const defaultSub = theme.is_dark ? "#e2e8f0" : "#0f172a";
        const finalColor = color || defaultSub;
        const fullW = Math.max(300, this.width - (this.padding * 2));
        const ref = this.addLabel(text).font(14, finalColor, "600").width(fullW);
        if (!color) {
            ref.spec.is_subheading = true;
        }
        return ref;
    }
    public add_subheading(text: string, color?: string): SimpleControlRef { return this.addSubheading(text, color); }

    public addCaption(text: string, color?: string): SimpleControlRef {
        const theme = getTheme(this.theme);
        const defaultMuted = theme.is_dark ? "#94a3b8" : "#334155";
        const finalColor = color || defaultMuted;
        const fullW = Math.max(300, this.width - (this.padding * 2));
        const ref = this.addLabel(text).font(12, finalColor, "500").width(fullW);
        ref.spec.is_caption = true;
        if (color) {
            ref.spec.custom_color = true;
        }
        return ref;
    }
    public add_caption(text: string, color?: string): SimpleControlRef { return this.addCaption(text, color); }

    public addStatusBar(idOrText: string, textOrBadge?: string, badge?: string): SimpleControlRef {
        let id = "status_bar";
        let text = "";
        if (textOrBadge !== undefined) {
            id = idOrText;
            text = textOrBadge;
        } else {
            text = idOrText;
            id = this.generateUniqueId("status_bar");
        }
        const fullW = Math.max(300, this.width - (this.padding * 2));
        return this.addVisualControl("status_bar", fullW, 28, { id, text, caption: text, dock: "bottom" });
    }
    public add_status_bar(idOrText: string, textOrBadge?: string, badge?: string): SimpleControlRef {
        return this.addStatusBar(idOrText, textOrBadge, badge);
    }

    public addStatusLabel(idOrText = "lbl_status", text?: string): SimpleControlRef {
        let id = "lbl_status";
        let content = idOrText;
        if (text !== undefined) {
            id = idOrText;
            content = text;
        }
        const fullW = Math.max(600, this.width - (this.padding * 2) - 10);
        return this.addLabel(id, content).width(fullW);
    }
    public add_status_label(idOrText = "lbl_status", text?: string): SimpleControlRef {
        return this.addStatusLabel(idOrText, text);
    }

    public setStatusBarText(idOrText: string, text?: string): this {
        let targetId = "status_bar";
        let newText = "";
        if (text !== undefined) {
            targetId = idOrText;
            newText = text;
        } else {
            newText = idOrText;
            const existing = this.controls.find(c => c.control_type === "status_bar" || c.id.includes("status_bar"));
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
    public set_status_bar_text(idOrText: string, text?: string): this {
        return this.setStatusBarText(idOrText, text);
    }

    public addBreadcrumbs(id: string, segments: string[]): SimpleControlRef {
        const text = segments.join(" › ");
        return this.addVisualControl("breadcrumb", 320, 28, { id, text, caption: text });
    }

    public setBreadcrumbs(id: string, segments: string[]): this {
        return this.setText(id, segments.join(" › "));
    }

    public addShortcutRecorder(id: string): SimpleControlRef {
        return this.addVisualControl("shortcut_recorder", 180, 36, { id, placeholder: "Press Shortcut..." });
    }

    public addChart(id: string, type = "line", height = 140): SimpleControlRef {
        return this.addVisualControl("stat_chart", 360, height, { id, caption: type });
    }

    public setChartData(id: string, values: number[]): this {
        return this.setValue(id, values.join(", "));
    }

    public addCircularProgress(id: string, value = 50): SimpleControlRef {
        return this.addVisualControl("circular_progress", 100, 100, { id, value });
    }

    public setCircularProgress(id: string, value: number): this {
        return this.setValue(id, value);
    }

    public addPropertyGrid(id: string, props: Record<string, string> | string, opts: Partial<any> = {}): SimpleControlRef {
        const text = typeof props === "string" ? props : Object.entries(props).map(([k, v]) => `${k}:${v}`).join(", ");
        return this.addVisualControl("property_grid", Math.min(450, this.width - 40), 230, {
            id,
            text,
            caption: opts.caption || "Property Inspector",
            ...opts
        });
    }
    public add_property_grid(id: string, props: Record<string, string> | string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addPropertyGrid(id, props, opts);
    }
    public property_grid(id: string, props: Record<string, string> | string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addPropertyGrid(id, props, opts);
    }

    public setPropertyGridValue(id: string, key: string, value: string): this {
        if (this.isWindowRunning) {
            this.evalJS(`
                const grid = document.getElementById("${id}");
                if (grid) {
                    const row = Array.from(grid.querySelectorAll('.prop-row')).find(r => r.textContent.includes("${key}"));
                    if (row) {
                        const valEl = row.querySelector('.prop-val');
                        if (valEl) valEl.textContent = "${value}";
                    }
                }
            `);
        }
        return this;
    }

    public addInput(id: string, initialValue = "", placeholder = "", opts: any = {}): SimpleControlRef {
        const optObj = typeof opts === "number" ? { width: opts } : (opts || {});
        const width = optObj.width !== undefined ? optObj.width : 280;
        const ref = this.addVisualControl("input", width, 36, { id, value: initialValue, text: initialValue, placeholder: placeholder || initialValue, ...optObj });
        if (initialValue) this.formValuesStore[id] = initialValue;
        return ref;
    }
    public add_input(id: string, initialValue = "", placeholder = "", opts: any = {}): SimpleControlRef {
        return this.addInput(id, initialValue, placeholder, opts);
    }
    public addTextarea(id: string, initialValue = "", placeholder = ""): SimpleControlRef {
        return this.addTextArea(id, initialValue, placeholder);
    }
    public add_textarea(id: string, initialValue = "", placeholder = ""): SimpleControlRef {
        return this.addTextarea(id, initialValue, placeholder);
    }
    public beginGroupBox(title?: string, subtitle?: string): this {
        return this.beginCard(title, subtitle);
    }
    public begin_group_box(title?: string, subtitle?: string): this {
        return this.beginCard(title, subtitle);
    }
    public endGroupBox(): this {
        return this.endCard();
    }
    public end_group_box(): this {
        return this.endCard();
    }
    public setTableData(id: string, headersOrRows: string[] | any[][], maybeRows?: any[][]): this {
        let headers: string[];
        let rows: any[][];
        if (maybeRows !== undefined && Array.isArray(headersOrRows)) {
            headers = headersOrRows as string[];
            rows = maybeRows;
        } else if (Array.isArray(headersOrRows)) {
            const ctrl = this.controls.find(c => c && (c.id === id || c.name === id));
            headers = ctrl && ctrl.text ? ctrl.text.split(",").map((s: string) => s.trim()) : [];
            rows = headersOrRows as any[][];
        } else {
            headers = [];
            rows = [];
        }
        const headerCsv = headers.join(", ");
        this.formValuesStore[id] = rows;
        const ctrl = this.controls.find(c => c && (c.id === id || c.name === id));
        if (ctrl) {
            ctrl.text = headerCsv;
            ctrl.value = rows;
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
                        const cells = Array.isArray(r) ? r : Object.values(r);
                        const rowPid = String(cells[0] || '').trim();
                        const isSelected = activePid && rowPid === activePid;
                        const bgStyle = isSelected ? ('background:' + selBg + ';') : '';
                        const selClass = isSelected ? ' selected-tr' : '';

                        return '<tr class="' + selClass + '" style="border-bottom:1px solid ' + border + ';cursor:pointer;transition:background 0.12s;' + bgStyle + '" ' +
                            'data-pid="' + esc(rowPid) + '" ' +
                            'onclick="const tb=this.closest(\\'tbody\\');if(tb){tb.querySelectorAll(\\'tr\\').forEach(tr=>{tr.classList.remove(\\'selected-tr\\');tr.style.background=\\'\\'});this.classList.add(\\'selected-tr\\');this.style.background=\\'' + selBg + '\\';window.selectedRowElement=this;window.selectedRowPid=\\'' + esc(rowPid) + '\\';if(window.onTableRowClick)window.onTableRowClick(this);const fn=window[ctrlId + \\'_onClick\\']||window[\\'on_\\' + ctrlId + \\'_click\\'];if(fn)fn(\\'' + esc(rowPid) + '\\');}" ' +
                            'onmouseover="if(!this.classList.contains(\\'selected-tr\\'))this.style.background=\\'' + hoverBg + '\\'" ' +
                            'onmouseout="if(!this.classList.contains(\\'selected-tr\\'))this.style.background=\\'\\'">' +
                            cells.map((c, i) => {
                                const alignStyle = (i >= 3 && i <= 5) ? 'text-align:right;' : 'text-align:left;';
                                const monoStyle = (i === 0 || (i >= 3 && i <= 5)) ? 'font-family:monospace;' : '';
                                return '<td style="padding:8px 12px;white-space:nowrap;' + alignStyle + monoStyle + '">' + esc(c) + '</td>';
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
    public toast(message: string, durationMs = 3000): this {
        if (this.isWindowRunning) {
            this.evalJS(`
                let t = document.getElementById("__simplegui_toast");
                if (!t) {
                    t = document.createElement("div");
                    t.id = "__simplegui_toast";
                    t.style.position = "fixed";
                    t.style.bottom = "20px";
                    t.style.right = "20px";
                    t.style.backgroundColor = "rgba(15, 23, 42, 0.9)";
                    t.style.color = "#f8fafc";
                    t.style.padding = "10px 16px";
                    t.style.borderRadius = "8px";
                    t.style.boxShadow = "0 10px 25px rgba(0,0,0,0.5)";
                    t.style.zIndex = "99999";
                    t.style.transition = "opacity 0.3s ease";
                    t.style.fontFamily = "sans-serif";
                    t.style.fontSize = "13px";
                    t.style.pointerEvents = "none";
                    document.body.appendChild(t);
                }
                t.textContent = "${message.replace(/"/g, '\\"')}";
                t.style.opacity = "1";
                setTimeout(() => { if (t) t.style.opacity = "0"; }, ${durationMs});
            `);
        }
        return this;
    }

    public addGridTable(id: string, headers: string[], initialRows: string[][]): SimpleControlRef {
        return this.addTable(headers, initialRows).id(id);
    }

    public gridAddRow(id: string, row: string[]): this {
        return this;
    }

    public gridDeleteRow(id: string, idx: number): this {
        return this;
    }

    public addConsole(id: string, height = 120): SimpleControlRef {
        return this.addVisualControl("code_view", 520, height, { id, placeholder: "Console Log Output" });
    }

    public appendConsole(id: string, text: string, level = 0): this {
        const current = this.getText(id);
        let prefix = "";
        if (!text.trim().startsWith("[")) {
            prefix = level === 1 ? "[WARN] " : (level === 2 ? "[SUCCESS] " : (level === 3 ? "[ERROR] " : "[INFO] "));
        }
        return this.setText(id, current ? `${current}\n${prefix}${text}` : `${prefix}${text}`);
    }

    public logConsole(id: string, text: string, level = 0): this {
        return this.appendConsole(id, text, level);
    }

    public clearConsole(id: string): this {
        return this.setText(id, "");
    }

    public addGauge(id: string, title: string, value = 50): SimpleControlRef {
        return this.addVisualControl("metric_comparison", 240, 80, { id, caption: title, value });
    }

    public setGaugeValue(id: string, val: number): this {
        return this.setValue(id, val);
    }

    public addPagination(id: string, totalPages: number, currentPage = 1): SimpleControlRef {
        return this.addVisualControl("pagination", 300, 36, { id, value: currentPage, caption: String(totalPages) });
    }

    public setPaginationPage(id: string, page: number): this {
        return this.setValue(id, page);
    }

    public addActivityFeed(id: string, height = 140): SimpleControlRef {
        return this.addVisualControl("activity_feed", 320, height, { id, caption: "Activity Stream" });
    }

    public addActivityFeedItem(id: string, time: string, message: string): this {
        const current = this.getText(id);
        const item = `[${time}] ${message}`;
        return this.setText(id, current ? `${current}, ${item}` : item);
    }

    public addMarkdownView(id: string, markdownText: string, height = 140): SimpleControlRef {
        return this.addVisualControl("code_view", 520, height, { id, text: markdownText, caption: markdownText, placeholder: "markdown" });
    }

    public setMarkdownViewText(id: string, text: string): this {
        return this.setText(id, text);
    }

    public addSparkline(id: string, values: number[], height = 30): SimpleControlRef {
        return this.addVisualControl("sparkline_table", 200, height, { id, value: values.join(",") });
    }

    public setSparklineData(id: string, values: number[]): this {
        return this.setValue(id, values.join(","));
    }

    public addPinCode(id: string, digits = 4): SimpleControlRef {
        return this.addVisualControl("input", digits * 40, 40, { id, placeholder: "••••", font_size: 18, text_align: "center" });
    }

    public setPinCodeValue(id: string, code: string): this {
        return this.setValue(id, code);
    }

    public getPinCodeValue(id: string): string {
        return String(this.getValue(id) || "");
    }

    public addColorPalette(id: string, hexColors: string[], selected = ""): SimpleControlRef {
        const text = hexColors.join(", ");
        return this.addVisualControl("color_swatch", 280, 50, { id, text, caption: text, value: selected || hexColors[0] });
    }

    public addTimeline(id: string, height = 160): SimpleControlRef {
        return this.addVisualControl("timeline", 320, height, { id, caption: "Project Milestones" });
    }

    public addTimelineItem(id: string, title: string, subtitle: string, time: string, status = "active"): this {
        const current = this.getText(id);
        const item = `${title} (${time})`;
        return this.setText(id, current ? `${current}, ${item}` : item);
    }

    public addMetricCard(id: string, title: string, value: string, badge = "+12.3%", subtitle = ""): SimpleControlRef {
        return this.addVisualControl("stat_card", 220, 90, { id, caption: title, value, placeholder: badge });
    }

    public setMetricCardValue(id: string, val: string, badge = ""): this {
        return this.setValue(id, val);
    }

    public addTabPills(id: string, items: string[], selected = ""): SimpleControlRef {
        return this.addSegmentedControl(items, items.indexOf(selected) >= 0 ? items.indexOf(selected) : 0).id(id);
    }

    public addRatingBreakdown(id: string, score: number, reviews: number, percentages: number[]): SimpleControlRef {
        return this.addVisualControl("rating_stars", 200, 36, { id, value: Math.round(score) });
    }

    public addAlertBanner(id: string, title: string, message: string, style: "info" | "success" | "warning" | "error" = "info"): SimpleControlRef {
        return this.addBadge(`${title}: ${message}`, style).id(id);
    }

    public addStepTracker(id: string, steps: string[], currentStep = 0): SimpleControlRef {
        return this.addSegmentedControl(steps, currentStep).id(id);
    }

    public addFilterChips(id: string, chips: string[], selected: string[] = []): SimpleControlRef {
        return this.addSegmentedControl(chips, 0).id(id);
    }

    public addFilePathField(id: string, initialPath = ""): SimpleControlRef {
        return this.addVisualControl("file_path_bar", 360, 36, { id, text: initialPath, caption: initialPath });
    }

    public addRadialGauge(id: string, title: string, value = 50): SimpleControlRef {
        return this.addCircularProgress(id, value);
    }

    public addKeyValueCard(id: string, title: string, keys: string[], values: string[]): SimpleControlRef {
        const props: Record<string, string> = {};
        keys.forEach((k, idx) => { props[k] = values[idx] || ""; });
        return this.addPropertyGrid(id, props);
    }

    // --- Nameless Control Helpers ---
    public input(placeholderOrInitial = "", defaultValOrOnChange?: string | EventCallback, maybeOnChange?: EventCallback): SimpleControlRef {
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

    public button(caption: string, onClick?: EventCallback): SimpleControlRef {
        const ref = this.addButton(caption).id("default_button");
        if (onClick) ref.onClick(onClick);
        return ref;
    }

    public textarea(placeholderOrInitial = "", defaultValOrOnChange?: string | EventCallback, maybeOnChange?: EventCallback): SimpleControlRef {
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

    public checkbox(label: string, checkedOrOnChange?: boolean | EventCallback, maybeOnChange?: EventCallback): SimpleControlRef {
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

    public radio(groupOrLabel: string, labelOrChecked?: string | boolean | EventCallback, checkedOrOnChange?: boolean | EventCallback, maybeOnChange?: EventCallback): SimpleControlRef {
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
        const ref = this.addVisualControl("radio", 180, 24, { text: label, caption: label, secondary_text: group, checked, value: label });
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public toggle(label: string, checkedOrOnChange?: boolean | EventCallback, maybeOnChange?: EventCallback): SimpleControlRef {
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

    public slider(minOrOnChange?: number | EventCallback, maxOrVal?: number, defaultValOrOnChange?: number | EventCallback, maybeOnChange?: EventCallback): SimpleControlRef {
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
            else if (typeof defaultValOrOnChange === "function") onChange = defaultValOrOnChange;
            if (maybeOnChange) onChange = maybeOnChange;
        }
        const ref = this.addSlider(min, max, val);
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public table(headersOrRows: string[] | any[][], rowsOrOnSelect?: any[][] | EventCallback, maybeOnSelect?: EventCallback): SimpleControlRef {
        let headers: string[] = [];
        let rows: any[][] = [];
        let onSelect: EventCallback | undefined;
        if (Array.isArray(headersOrRows) && headersOrRows.length > 0 && Array.isArray(headersOrRows[0])) {
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

    public number(value = 0): SimpleControlRef {
        return this.addStepper(0, 9999, value).id("default_number");
    }

    public dropdown(items: string[], selectedOrOnChange?: string | EventCallback, maybeOnChange?: EventCallback): SimpleControlRef {
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

    public segmented(items: string[], selected = ""): SimpleControlRef {
        return this.addSegmentedControl(items, items.indexOf(selected) >= 0 ? items.indexOf(selected) : 0).id("default_segmented");
    }

    public toggleSwitch(label: string, checked = false): SimpleControlRef {
        return this.addSwitch(label, checked).id("default_switch");
    }

    public searchField(placeholder = ""): SimpleControlRef {
        return this.addSearchInput(placeholder).id("default_search");
    }

    public donut(title: string, percent = 75, subtitle = ""): SimpleControlRef {
        return this.addDonutChart("donut_" + Date.now(), title, percent, subtitle);
    }

    public score_card(title: string, score: number | string, subtitle = "", grade = "A+"): SimpleControlRef {
        return this.addScoreCard(title, score, subtitle, grade);
    }

    public search_field(placeholder = "Search..."): SimpleControlRef {
        return this.addSearchField("search_" + Date.now(), placeholder);
    }

    public code_box(code: string, language = "typescript"): SimpleControlRef {
        return this.addCodeEditor(code, language);
    }

    public banner(message: string, style: "info" | "success" | "warning" | "error" = "info"): SimpleControlRef {
        return this.addBanner(message, style);
    }

    public stat_card(title: string, value: string, badge = "+12%"): SimpleControlRef {
        return this.addMetricCard("stat_" + Date.now(), title, value, badge);
    }

    public stat_grid(stats: Array<{ label: string; value: string; delta?: string; trend?: "up" | "down" }>): SimpleControlRef {
        return this.addStatGrid(stats);
    }

    public user_profile(name: string, handle: string, avatar = ""): SimpleControlRef {
        return this.addUserProfileCard({ name, handle, avatar });
    }

    public product_card(product: { title: string; price: string; rating?: number; reviews?: number; tag?: string; image?: string; description?: string }): SimpleControlRef {
        return this.addProductCard(product);
    }

    public heatmap(weeks = 12, data?: number[][]): SimpleControlRef {
        return this.addActivityHeatmap("heatmap_" + Date.now(), weeks, data);
    }

    public radial_gauge(title: string, value = 50): SimpleControlRef {
        return this.addRadialGauge("gauge_" + Date.now(), title, value);
    }

    public nav_rail(items: Array<{ icon: string; label: string; id?: string; active?: boolean }>): SimpleControlRef {
        return this.addNavRail(items);
    }

    public media_player(src: string, title = "Media Playback"): SimpleControlRef {
        return this.addMediaPlayer(src, title);
    }

    public activity_rings(rings?: Array<{ label: string; percent: number; color?: string }>): SimpleControlRef {
        return this.addActivityRings("rings_" + Date.now(), rings);
    }

    public knob(val = 50, min = 0, max = 100): SimpleControlRef {
        return this.addKnob("knob_" + Date.now(), min, max, val);
    }

    public floating_toolbar(tools: Array<{ icon?: string; label?: string; actionId?: string } | string>): SimpleControlRef {
        return this.addFloatingToolbar(tools);
    }

    public password(placeholderOrInitial = "", defaultValOrOnChange?: string | EventCallback, maybeOnChange?: EventCallback): SimpleControlRef {
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
    public getBool(id: string): boolean {
        return Boolean(this.getValue(id));
    }

    public setBool(id: string, val: boolean): this {
        return this.setValue(id, val);
    }

    public getInt(id: string): number {
        const val = parseInt(String(this.getValue(id) || "0"), 10);
        return isNaN(val) ? 0 : val;
    }

    public setInt(id: string, val: number): this {
        return this.setValue(id, val);
    }

    public getFloat(id: string): number {
        const val = parseFloat(String(this.getValue(id) || "0"));
        return isNaN(val) ? 0 : val;
    }

    public setFloat(id: string, val: number): this {
        return this.setValue(id, val);
    }

    public get_text(id: string): string { return this.getText(id); }
    public set_text(id: string, val: string): this { return this.setText(id, val); }
    public get_bool(id: string): boolean { return this.getBool(id); }
    public set_bool(id: string, val: boolean): this { return this.setBool(id, val); }
    public get_int(id: string): number { return this.getInt(id); }
    public set_int(id: string, val: number): this { return this.setInt(id, val); }
    public get_float(id: string): number { return this.getFloat(id); }
    public set_float(id: string, val: number): this { return this.setFloat(id, val); }
    public get_value(id: string): any { return this.getValue(id); }
    public set_value(id: string, val: any): this { return this.setValue(id, val); }

    public close_window(): void {
        this.close();
    }

    public hide_window(): void {
        if (this.isWindowRunning) {
            this.evalJS(`if(window.close) window.close();`);
        }
    }

    public center_window(): this {
        return this.center();
    }

    public close(): void {
        this.handleClose();
    }
    
    public exit(code = 0): void {
        this.isWindowRunning = false;
        process.exit(code);
    }

    public exitApp(code = 0): void {
        this.exit(code);
    }

    public exit_app(code = 0): void {
        this.exit(code);
    }

    public exit_application(code = 0): void {
        this.exit(code);
    }

    public quit(code = 0): void {
        this.exit(code);
    }

    public quit_application(code = 0): void {
        this.exit(code);
    }

    // --- vlang_simplegui API Parity Window Methods ---
    public has_control(id: string): boolean { return this.hasControl(id); }
    public list_controls(): string[] { return this.listControls(); }
    public getControls(): any[] { return this.controls; }
    public get_controls(): any[] { return this.controls; }
    public get_control_kind(id: string): string { return this.getControlKind(id); }
    public require_control(id: string): string { return this.requireControl(id); }
    public get_title(): string { return this.getTitle(); }

    public set_title(titleStr: string): this {
        this.title = titleStr;
        if (this.webview) this.webview.title = titleStr;
        return this;
    }

    public set_always_on_top(enabled: boolean): this { return this.setAlwaysOnTop(enabled); }
    public get_always_on_top(): boolean { return this.alwaysOnTop; }
    public getAlwaysOnTop(): boolean { return this.alwaysOnTop; }

    public set_background_color(hexColor: string): this {
        this.backgroundColor = hexColor;
        this.evalJS(`document.body.style.backgroundColor = "${hexColor}";`);
        return this;
    }

    public set_font_color(colorStr: string): this {
        this.fontColor = colorStr;
        this.evalJS(`document.body.style.color = "${colorStr}";`);
        return this;
    }

    public set_padding(pad: number): this { return this.setPadding(pad); }
    public get_padding(): number { return this.getPadding(); }
    public set_spacing(space: number): this { return this.setSpacing(space); }
    public get_spacing(): number { return this.getSpacing(); }

    public set_responsive_layout(enabled: boolean): this { return this; }
    public get_responsive_layout(): boolean { return true; }

    public set_min_size(w: number, h: number): this { return this; }
    public set_max_size(w: number, h: number): this { return this; }
    public set_resizable(enabled: boolean): this { return this; }
    public get_resizable(): boolean { return true; }
    public set_minimizable(enabled: boolean): this { return this; }
    public get_minimizable(): boolean { return true; }
    public set_maximizable(enabled: boolean): this { return this; }
    public get_maximizable(): boolean { return true; }

    public align(position: string): this { return this.setPositionPreset(position); }
    public align_window(position: string): this { return this.setPositionPreset(position); }
    public snap_to_edge(edge: string): this { return this.setPositionPreset(edge); }

    public set_size(w: number, h: number): this {
        this.width = w;
        this.height = h;
        if (this.webview) this.webview.size = { width: w, height: h, hint: SizeHint.NONE };
        return this;
    }

    public get_width(): number { return this.width; }
    public get_height(): number { return this.height; }

    public set_position(x: number, y: number): this { return this; }
    public get_x(): number { return 100; }
    public get_y(): number { return 100; }

    public set_opacity(opacity: number): this {
        this.evalJS(`document.body.style.opacity = "${opacity}";`);
        return this;
    }
    public get_opacity(): number { return 1.0; }

    public set_titlebar_visible(visible: boolean): this { return this; }
    public is_titlebar_visible(): boolean { return true; }

    public set_subtitle(subtitleStr: string): this { return this; }
    public get_subtitle(): string { return ""; }

    public set_closable(enabled: boolean): this { return this; }
    public get_closable(): boolean { return true; }

    public set_movable(enabled: boolean): this { return this; }
    public get_movable(): boolean { return true; }

    public set_has_shadow(enabled: boolean): this { return this; }
    public get_has_shadow(): boolean { return true; }

    public is_visible(): boolean { return this.isWindowRunning; }
    public is_minimized(): boolean { return false; }
    public is_maximized(): boolean { return false; }
    public is_fullscreen(): boolean { return this.fullscreen; }
    public isFullscreen(): boolean { return this.fullscreen; }
    public setFullscreen(val = true): this {
        this.fullscreen = val;
        if (this.isWindowRunning && this.webview) {
            try { setFullscreenNative(this.webview, val); } catch {}
        }
        return this;
    }
    public set_fullscreen(val = true): this { return this.setFullscreen(val); }
    public is_active(): boolean { return this.isWindowRunning; }

    public bounce_dock(critical = false): this { return this; }
    public bounce_dock_icon(critical = false): this { return this; }
    public request_attention(critical = false): this { return this; }

    public set_bounds(x: number, y: number, w: number, h: number): this {
        return this.set_size(w, h);
    }
    public get_bounds(): [number, number, number, number] {
        return [100, 100, this.width, this.height];
    }

    public set_aspect_ratio(wRatio: number, hRatio: number): this { return this; }
    public reset_aspect_ratio(): this { return this; }
    public has_aspect_ratio(): boolean { return false; }

    public set_vibrancy(material: string): this { return this; }
    public set_corner_radius(r: number): this { return this; }
    public get_corner_radius(): number { return 12; }
    public set_background_blur(enabled: boolean): this { return this; }

    public set_window_level(level: string): this { return this; }
    public get_window_level(): string { return "normal"; }
    public set_level_type(level: string): this { return this; }

    public set_ignores_mouse_events(enabled: boolean): this { return this; }
    public get_ignores_mouse_events(): boolean { return false; }

    public apply_theme(theme: string | SimpleGUITheme): this {
        if (typeof theme === "string") {
            return this.setTheme(theme);
        }
        this.backgroundColor = theme.background_color;
        this.fontColor = theme.font_color;
        this.evalJS(`document.body.style.backgroundColor = "${theme.background_color}"; document.body.style.color = "${theme.font_color}";`);
        return this;
    }

    public set_debug_mode(enabled: boolean): this { return this.setDebugMode(enabled); }
    public get_debug_mode(): boolean { return this.getDebugMode(); }

    // =========================================================================
    // ⚡ Ergonomic Helpers & Beginner Shortcuts (Parity with ergonomics.v)
    // =========================================================================
    public listItemsStore: Record<string, string[]> = {};
    public statusText = "";

    // 1. Dialog Shortcuts
    public info(titleOrMessage: string, message?: string): this {
        const title = message ? titleOrMessage : "Information";
        const msg = message ? message : titleOrMessage;
        this.showAlert(msg, title);
        return this;
    }

    public warn(titleOrMessage: string, message?: string): this {
        const title = message ? titleOrMessage : "Warning";
        const msg = message ? message : titleOrMessage;
        this.showAlert(`⚠️ ${msg}`, title);
        return this;
    }

    public errorDialog(titleOrMessage: string, message?: string): this {
        const title = message ? titleOrMessage : "Error";
        const msg = message ? message : titleOrMessage;
        this.showAlert(`❌ ${msg}`, title);
        return this;
    }

    public error_dialog(titleOrMessage: string, message?: string): this {
        return this.errorDialog(titleOrMessage, message);
    }

    public error(titleOrMessage: string, message?: string): this {
        return this.errorDialog(titleOrMessage, message);
    }

    public confirm(question: string, title = "Confirm"): Promise<boolean> {
        return this.showConfirm(question, title);
    }

    public ask(question: string, title = "Confirm"): Promise<boolean> {
        return this.showConfirm(question, title);
    }

    public prompt(message: string, defaultVal = "", title = "Prompt"): Promise<string | null> {
        return this.showPrompt(message, defaultVal, title);
    }

    // 2. Control Enabled / Visible & Batch Operations
    public setControlEnabled(id: string, enabled: boolean): this {
        const ctrl = this.controls.find(c => c.id === id);
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

    public set_control_enabled(id: string, enabled: boolean): this { return this.setControlEnabled(id, enabled); }

    public setControlVisible(id: string, visible: boolean): this {
        const ctrl = this.controls.find(c => c.id === id);
        if (ctrl) ctrl.visible = visible;
        if (this.isWindowRunning) {
            this.evalJS(`
                (function() {
                    const el = document.getElementById("${id}");
                    if (el) el.style.display = "${visible ? 'block' : 'none'}";
                })();
            `);
        }
        return this;
    }

    public set_control_visible(id: string, visible: boolean): this { return this.setControlVisible(id, visible); }

    public getControlEnabled(id: string): boolean {
        const ctrl = this.controls.find(c => c.id === id);
        return ctrl ? ctrl.enabled !== false : true;
    }

    public get_control_enabled(id: string): boolean { return this.getControlEnabled(id); }

    public getControlVisible(id: string): boolean {
        const ctrl = this.controls.find(c => c.id === id);
        return ctrl ? ctrl.visible !== false : true;
    }

    public get_control_visible(id: string): boolean { return this.getControlVisible(id); }

    public showControls(names: string[]): this {
        names.forEach(name => this.setControlVisible(name, true));
        return this;
    }
    public show_controls(names: string[]): this { return this.showControls(names); }
    public batch_show_controls(names: string[]): this { return this.showControls(names); }

    public hideControls(names: string[]): this {
        names.forEach(name => this.setControlVisible(name, false));
        return this;
    }
    public hide_controls(names: string[]): this { return this.hideControls(names); }
    public batch_hide_controls(names: string[]): this { return this.hideControls(names); }

    public enableControls(names: string[]): this {
        names.forEach(name => this.setControlEnabled(name, true));
        return this;
    }
    public enable_controls(names: string[]): this { return this.enableControls(names); }
    public batch_enable_controls(names: string[]): this { return this.enableControls(names); }

    public disableControls(names: string[]): this {
        names.forEach(name => this.setControlEnabled(name, false));
        return this;
    }
    public disable_controls(names: string[]): this { return this.disableControls(names); }
    public batch_disable_controls(names: string[]): this { return this.disableControls(names); }

    public enableAllControls(): this {
        this.controls.forEach(c => this.setControlEnabled(c.id, true));
        return this;
    }
    public enable_all_controls(): this { return this.enableAllControls(); }
    public enableAll(): this { return this.enableAllControls(); }
    public enable_all(): this { return this.enableAllControls(); }

    public disableAllControls(): this {
        this.controls.forEach(c => this.setControlEnabled(c.id, false));
        return this;
    }
    public disable_all_controls(): this { return this.disableAllControls(); }
    public disableAll(): this { return this.disableAllControls(); }
    public disable_all(): this { return this.disableAllControls(); }

    public setAll(values: Record<string, any>): this {
        for (const [k, v] of Object.entries(values)) {
            this.setValue(k, v);
        }
        return this;
    }
    public set_all(values: Record<string, any>): this { return this.setAll(values); }

    public getAll(names: string[]): Record<string, any> {
        const result: Record<string, any> = {};
        for (const name of names) {
            result[name] = this.getValue(name);
        }
        return result;
    }
    public get_all(names: string[]): Record<string, any> { return this.getAll(names); }

    public toggleControlsEnabled(names: string[]): this {
        names.forEach(n => this.toggleEnabled(n));
        return this;
    }
    public toggle_controls_enabled(names: string[]): this { return this.toggleControlsEnabled(names); }

    public toggleControlsVisible(names: string[]): this {
        names.forEach(n => this.toggleVisible(n));
        return this;
    }
    public toggle_controls_visible(names: string[]): this { return this.toggleControlsVisible(names); }

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
    public flash_control(id: string): this { return this.flashControl(id); }

    public flashControls(names: string[]): this {
        names.forEach(n => this.flashControl(n));
        return this;
    }
    public flash_controls(names: string[]): this { return this.flashControls(names); }

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
    public highlight_control(id: string, durationMs = 1000): this { return this.highlightControl(id, durationMs); }

    public highlightControls(names: string[], durationMs = 1000): this {
        names.forEach(n => this.highlightControl(n, durationMs));
        return this;
    }
    public highlight_controls(names: string[], durationMs = 1000): this { return this.highlightControls(names, durationMs); }

    public toggleVisible(id: string): boolean {
        const next = !this.getControlVisible(id);
        this.setControlVisible(id, next);
        return next;
    }
    public toggle_visible(id: string): boolean { return this.toggleVisible(id); }

    public toggleEnabled(id: string): boolean {
        const next = !this.getControlEnabled(id);
        this.setControlEnabled(id, next);
        return next;
    }
    public toggle_enabled(id: string): boolean { return this.toggleEnabled(id); }

    // 3. Value Convenience Accessors & Modifiers
    public increment(id: string, delta = 1): number {
        const current = this.getInt(id);
        const next = current + delta;
        this.setInt(id, next);
        return next;
    }
    public increment_value(id: string, delta = 1): number { return this.increment(id, delta); }

    public toggleChecked(id: string): boolean {
        const current = this.getBool(id);
        const next = !current;
        this.setBool(id, next);
        return next;
    }
    public toggle_checked(id: string): boolean { return this.toggleChecked(id); }

    public setProgress(id: string, value: number): this {
        return this.setValue(id, value);
    }
    public set_progress(id: string, value: number): this { return this.setProgress(id, value); }

    public getProgress(id: string): number {
        return this.getInt(id);
    }
    public get_progress(id: string): number { return this.getProgress(id); }

    public appendText(id: string, text: string): this {
        const current = this.getText(id);
        return this.setText(id, current + text);
    }
    public append_text(id: string, text: string): this { return this.appendText(id, text); }

    public appendLine(id: string, line: string): this {
        const current = this.getText(id);
        return this.setText(id, current ? `${current}\n${line}` : line);
    }
    public append_line(id: string, line: string): this { return this.appendLine(id, line); }

    public setManyTexts(values: Record<string, string>): this {
        for (const [id, val] of Object.entries(values)) this.setText(id, val);
        return this;
    }
    public set_many_texts(values: Record<string, string>): this { return this.setManyTexts(values); }

    public getManyTexts(names: string[]): Record<string, string> {
        const res: Record<string, string> = {};
        for (const name of names) res[name] = this.getText(name);
        return res;
    }
    public get_many_texts(names: string[]): Record<string, string> { return this.getManyTexts(names); }

    public setManyChecked(values: Record<string, boolean>): this {
        for (const [id, val] of Object.entries(values)) this.setBool(id, val);
        return this;
    }
    public set_many_checked(values: Record<string, boolean>): this { return this.setManyChecked(values); }

    public getManyChecked(names: string[]): Record<string, boolean> {
        const res: Record<string, boolean> = {};
        for (const name of names) res[name] = this.getBool(name);
        return res;
    }
    public get_many_checked(names: string[]): Record<string, boolean> { return this.getManyChecked(names); }

    public setManyNumbers(values: Record<string, number>): this {
        for (const [id, val] of Object.entries(values)) this.setInt(id, val);
        return this;
    }
    public set_many_numbers(values: Record<string, number>): this { return this.setManyNumbers(values); }

    public getManyNumbers(names: string[]): Record<string, number> {
        const res: Record<string, number> = {};
        for (const name of names) res[name] = this.getInt(name);
        return res;
    }
    public get_many_numbers(names: string[]): Record<string, number> { return this.getManyNumbers(names); }

    public setManyVisibility(values: Record<string, boolean>): this {
        for (const [id, val] of Object.entries(values)) this.setControlVisible(id, val);
        return this;
    }
    public set_many_visibility(values: Record<string, boolean>): this { return this.setManyVisibility(values); }

    public getManyVisibility(names: string[]): Record<string, boolean> {
        const res: Record<string, boolean> = {};
        for (const name of names) res[name] = this.getControlVisible(name);
        return res;
    }
    public get_many_visibility(names: string[]): Record<string, boolean> { return this.getManyVisibility(names); }

    public setManyEnabled(values: Record<string, boolean>): this {
        for (const [id, val] of Object.entries(values)) this.setControlEnabled(id, val);
        return this;
    }
    public set_many_enabled(values: Record<string, boolean>): this { return this.setManyEnabled(values); }

    public getManyEnabled(names: string[]): Record<string, boolean> {
        const res: Record<string, boolean> = {};
        for (const name of names) res[name] = this.getControlEnabled(name);
        return res;
    }
    public get_many_enabled(names: string[]): Record<string, boolean> { return this.getManyEnabled(names); }

    public setManyErrors(values: Record<string, string>): this {
        for (const [id, err] of Object.entries(values)) {
            const ctrl = this.controls.find(c => c.id === id);
            if (ctrl) ctrl.error = err;
        }
        return this;
    }
    public set_many_errors(values: Record<string, string>): this { return this.setManyErrors(values); }

    public setManyPlaceholders(values: Record<string, string>): this {
        for (const [id, ph] of Object.entries(values)) {
            const ctrl = this.controls.find(c => c.id === id);
            if (ctrl) ctrl.placeholder = ph;
        }
        return this;
    }
    public set_many_placeholders(values: Record<string, string>): this { return this.setManyPlaceholders(values); }

    public setManyTooltips(values: Record<string, string>): this {
        for (const [id, hint] of Object.entries(values)) {
            const ctrl = this.controls.find(c => c.id === id);
            if (ctrl) ctrl.tooltip = hint;
        }
        return this;
    }
    public set_many_tooltips(values: Record<string, string>): this { return this.setManyTooltips(values); }

    public setStatus(text: string): this {
        this.statusText = text;
        const targetIds = ["lbl_status", "lblStatus", "status", "lbl_status_bar", "status_bar"];
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
    public set_status(text: string): this { return this.setStatus(text); }

    public with_busy_state(names: string[], statusText: string, callback: (win: SimpleWindow) => any | Promise<any>): Promise<this> {
        return this.withBusyState(names, statusText, callback);
    }

    public clearMany(names: string[]): this {
        names.forEach(name => this.setValue(name, ""));
        return this;
    }
    public clear_many(names: string[]): this { return this.clearMany(names); }

    public resetMany(names: string[]): this {
        for (const name of names) {
            const ctrl = this.controls.find(c => c.id === name);
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
    public reset_many(names: string[]): this { return this.resetMany(names); }

    public setFocus(id: string): this {
        if (this.isWindowRunning) {
            this.evalJS(`const el = document.getElementById("${id}"); if(el) el.focus();`);
        }
        return this;
    }
    public set_focus(id: string): this { return this.setFocus(id); }
    public focus(id: string): this { return this.setFocus(id); }

    // 4. List Box & Dynamic Item Management
    public getListItems(id: string): string[] {
        return this.listItemsStore[id] || [];
    }
    public get_list_items(id: string): string[] { return this.getListItems(id); }

    public setListItems(id: string, items: string[]): this {
        this.listItemsStore[id] = [...items];
        const currentVal = this.getValue(id);
        let nextVal = currentVal;
        if (Array.isArray(currentVal)) {
            nextVal = currentVal.filter(v => items.includes(v));
        } else if (currentVal && !items.includes(currentVal)) {
            nextVal = items[0] || "";
        } else if (!currentVal && items.length > 0) {
            nextVal = items[0];
        }
        this.formValuesStore[id] = nextVal;

        if (this.isWindowRunning) {
            const selectedSet = new Set(Array.isArray(nextVal) ? nextVal : [nextVal]);
            const optsHtml = items.map(it => {
                const sel = selectedSet.has(it) ? ' selected="selected"' : '';
                return `<option value="${it.replace(/"/g, '&quot;')}"${sel}>${it}</option>`;
            }).join("");

            this.evalJS(`
                (function() {
                    let el = document.getElementById("${id}");
                    if (el && el.tagName !== "SELECT") el = el.querySelector("select") || el;
                    if (el && el.tagName === "SELECT") {
                        el.innerHTML = ${JSON.stringify(optsHtml)};
                    }
                })();
            `);
        }
        return this;
    }
    public set_list_items(id: string, items: string[]): this { return this.setListItems(id, items); }
    public updateListItems(id: string, items: string[]): this { return this.setListItems(id, items); }
    public update_list_items(id: string, items: string[]): this { return this.setListItems(id, items); }

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
    public add_list_item(id: string, item: string): this { return this.addListItem(id, item); }

    public addListItems(id: string, newItems: string[]): this {
        const items = this.getListItems(id);
        const valid = newItems.map(i => (i || "").trim()).filter(Boolean);
        valid.forEach(v => {
            if (!items.includes(v)) items.push(v);
        });
        if (valid.length > 0) {
            this.setValue(id, valid[valid.length - 1]);
        }
        return this.setListItems(id, items);
    }
    public add_list_items(id: string, newItems: string[]): this { return this.addListItems(id, newItems); }

    public removeListItem(id: string, index: number): this {
        const items = this.getListItems(id);
        if (index >= 0 && index < items.length) {
            items.splice(index, 1);
            this.setListItems(id, items);
        }
        return this;
    }
    public remove_list_item(id: string, index: number): this { return this.removeListItem(id, index); }

    public clearListItems(id: string): this {
        return this.setListItems(id, []);
    }
    public clear_list_items(id: string): this { return this.clearListItems(id); }

    public getListCount(id: string): number {
        return this.getListItems(id).length;
    }
    public get_list_count(id: string): number { return this.getListCount(id); }

    public getListSelectedText(id: string): string {
        const val = this.getValue(id);
        if (Array.isArray(val)) return val[0] || "";
        return String(val || "");
    }
    public get_list_selected_text(id: string): string { return this.getListSelectedText(id); }

    public removeSelectedListItem(id: string): this {
        const selectedText = this.getListSelectedText(id);
        const items = this.getListItems(id);
        const idx = items.indexOf(selectedText);
        if (idx >= 0) {
            this.removeListItem(id, idx);
        }
        return this;
    }
    public remove_selected_list_item(id: string): this { return this.removeSelectedListItem(id); }

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
    public set_list_multi_select(id: string, enabled: boolean): this { return this.setListMultiSelect(id, enabled); }

    public getListSelectedIndexes(id: string): number[] {
        const items = this.getListItems(id);
        const val = this.getValue(id);
        if (Array.isArray(val)) {
            return val.map(v => items.indexOf(v)).filter(i => i >= 0);
        } else if (typeof val === "string") {
            const idx = items.indexOf(val);
            return idx >= 0 ? [idx] : [];
        }
        return [];
    }
    public get_list_selected_indexes(id: string): number[] { return this.getListSelectedIndexes(id); }

    public setListSelectedIndexes(id: string, indexes: number[]): this {
        const items = this.getListItems(id);
        const selectedVals = indexes.map(i => items[i]).filter(Boolean);
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
    public set_list_selected_indexes(id: string, indexes: number[]): this { return this.setListSelectedIndexes(id, indexes); }

    public getListSelectedTexts(id: string): string[] {
        const items = this.getListItems(id);
        return this.getListSelectedIndexes(id).map(i => items[i]).filter((x): x is string => Boolean(x));
    }
    public get_list_selected_texts(id: string): string[] { return this.getListSelectedTexts(id); }

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
    public select_all_list_items(id: string): this { return this.selectAllListItems(id); }

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
    public clear_list_selection(id: string): this { return this.clearListSelection(id); }

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
    public remove_selected_list_items(id: string): string[] { return this.removeSelectedListItems(id); }

    public onListDoubleClick(id: string, callback: EventCallback): this {
        this.bindControlEvent(id, "onDoubleClick", callback);
        return this;
    }
    public on_list_double_click(id: string, callback: EventCallback): this { return this.onListDoubleClick(id, callback); }

    // 5. Settings Persistence (JSON File)
    public saveValuesToFile(filePath: string): void {
        const values = this.getFormValues();
        fs.writeFileSync(filePath, JSON.stringify(values, null, 2), "utf-8");
    }
    public save_values_to_file(pathStr: string): void { this.saveValuesToFile(pathStr); }

    public loadValuesFromFile(filePath: string): void {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            const values = JSON.parse(content);
            for (const [id, val] of Object.entries(values)) {
                if (this.hasControl(id)) {
                    this.setValue(id, val);
                }
            }
        }
    }
    public load_values_from_file(pathStr: string): void { this.loadValuesFromFile(pathStr); }

    // =========================================================================
    // Reactive & Key-Value State Store API
    // =========================================================================

    public setState(key: string, val: any): this {
        const strVal = String(val ?? "");
        this.stateStore[key] = strVal;

        // Trigger registered state listeners
        const listeners = this.stateListeners.get(key);
        if (listeners) {
            for (const cb of [...listeners]) {
                try { cb(this, strVal); } catch (e) { console.error(`Error in state listener for '${key}':`, e); }
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
    public set_state(key: string, val: any): this { return this.setState(key, val); }

    public getState(key: string, defaultVal = ""): string {
        return this.getStateOr(key, defaultVal);
    }
    public get_state(key: string, defaultVal = ""): string { return this.getState(key, defaultVal); }

    public getStateOr(key: string, fallback: string): string {
        if (key in this.stateStore) {
            const val = this.stateStore[key];
            if (val !== undefined && val !== "") return val;
        }
        return fallback;
    }
    public get_state_or(key: string, fallback: string): string { return this.getStateOr(key, fallback); }

    public hasState(key: string): boolean {
        return key in this.stateStore;
    }
    public has_state(key: string): boolean { return this.hasState(key); }

    public removeState(key: string): this {
        delete this.stateStore[key];
        return this;
    }
    public remove_state(key: string): this { return this.removeState(key); }

    public clearState(): this {
        this.stateStore = {};
        return this;
    }
    public clear_state(): this { return this.clearState(); }

    public setStateInt(key: string, val: number): this {
        return this.setState(key, String(Math.floor(val)));
    }
    public set_state_int(key: string, val: number): this { return this.setStateInt(key, val); }

    public getStateInt(key: string, defaultVal = 0): number {
        return this.getStateIntOr(key, defaultVal);
    }
    public get_state_int(key: string, defaultVal = 0): number { return this.getStateInt(key, defaultVal); }

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
    public get_state_int_or(key: string, fallback: number): number { return this.getStateIntOr(key, fallback); }

    public setStateBool(key: string, val: boolean): this {
        return this.setState(key, val ? "true" : "false");
    }
    public set_state_bool(key: string, val: boolean): this { return this.setStateBool(key, val); }

    public getStateBool(key: string, defaultVal = false): boolean {
        return this.getStateBoolOr(key, defaultVal);
    }
    public get_state_bool(key: string, defaultVal = false): boolean { return this.getStateBool(key, defaultVal); }

    public getStateBoolOr(key: string, fallback: boolean): boolean {
        if (key in this.stateStore) {
            const val = (this.stateStore[key] || "").toLowerCase().trim();
            if (val === "true" || val === "1" || val === "yes" || val === "on") return true;
            if (val === "false" || val === "0" || val === "no" || val === "off") return false;
        }
        return fallback;
    }
    public get_state_bool_or(key: string, fallback: boolean): boolean { return this.getStateBoolOr(key, fallback); }

    public setStateFloat(key: string, val: number): this {
        return this.setState(key, String(val));
    }
    public setStateF64(key: string, val: number): this { return this.setStateFloat(key, val); }
    public set_state_f64(key: string, val: number): this { return this.setStateFloat(key, val); }

    public getStateFloat(key: string, defaultVal = 0.0): number {
        return this.getStateFloatOr(key, defaultVal);
    }
    public getStateF64(key: string, defaultVal = 0.0): number { return this.getStateFloat(key, defaultVal); }
    public get_state_f64(key: string, defaultVal = 0.0): number { return this.getStateFloat(key, defaultVal); }

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
    public getStateF64Or(key: string, fallback: number): number { return this.getStateFloatOr(key, fallback); }
    public get_state_f64_or(key: string, fallback: number): number { return this.getStateFloatOr(key, fallback); }

    public toggleStateBool(key: string): boolean {
        const next = !this.getStateBool(key);
        this.setStateBool(key, next);
        return next;
    }
    public toggle_state_bool(key: string): boolean { return this.toggleStateBool(key); }

    public incrementStateInt(key: string, delta = 1): number {
        const curr = this.getStateInt(key);
        const next = curr + delta;
        this.setStateInt(key, next);
        return next;
    }
    public increment_state_int(key: string, delta = 1): number { return this.incrementStateInt(key, delta); }

    public onStateChange(key: string, cb: (win: SimpleWindow, val: string) => void): this {
        let list = this.stateListeners.get(key);
        if (!list) {
            list = [];
            this.stateListeners.set(key, list);
        }
        list.push(cb);
        if (key in this.stateStore) {
            try { cb(this, this.stateStore[key] ?? ""); } catch (e) { console.error(e); }
        }
        return this;
    }
    public on_state_change(key: string, cb: (win: SimpleWindow, val: string) => void): this {
        return this.onStateChange(key, cb);
    }

    // =========================================================================
    // App State & Window Session Persistence API
    // =========================================================================

    public saveStateJson(filePath: string): void {
        const resolved = resolveUserPath(filePath);
        saveStateToFile(resolved, this.stateStore);
    }
    public save_state_json(filePath: string): void { this.saveStateJson(filePath); }

    public loadStateJson(filePath: string): void {
        const resolved = resolveUserPath(filePath);
        const loaded = loadStateFromFile(resolved);
        for (const [k, v] of Object.entries(loaded)) {
            this.setState(k, v);
        }
    }
    public load_state_json(filePath: string): void { this.loadStateJson(filePath); }

    public saveAppState(appName?: string, fileName = "state.json"): void {
        const appId = appName || this.getAppId();
        const targetFile = getAppStateFile(appId, fileName);
        this.saveStateJson(targetFile);
    }
    public save_app_state(appName?: string, fileName = "state.json"): void { this.saveAppState(appName, fileName); }

    public saveAppStateOr(appName?: string, fileName = "state.json"): boolean {
        try {
            this.saveAppState(appName, fileName);
            return true;
        } catch (e) {
            return false;
        }
    }
    public save_app_state_or(appName?: string, fileName = "state.json"): boolean { return this.saveAppStateOr(appName, fileName); }

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
    public load_app_state(appName?: string, fileName = "state.json"): boolean { return this.loadAppState(appName, fileName); }

    public loadAppStateOr(appName?: string, fileName = "state.json"): boolean {
        try {
            return this.loadAppState(appName, fileName);
        } catch (e) {
            return false;
        }
    }
    public load_app_state_or(appName?: string, fileName = "state.json"): boolean { return this.loadAppStateOr(appName, fileName); }

    public hasSavedAppState(appName?: string, fileName = "state.json"): boolean {
        const appId = appName || this.getAppId();
        const targetFile = getAppStateFile(appId, fileName);
        if (fs.existsSync(targetFile)) return true;
        const configFile = getAppConfigFile(appId, fileName);
        return fs.existsSync(configFile);
    }
    public has_saved_app_state(appName?: string, fileName = "state.json"): boolean { return this.hasSavedAppState(appName, fileName); }

    public clearAppState(appName?: string, fileName = "state.json"): void {
        const appId = appName || this.getAppId();
        const targetFile = getAppStateFile(appId, fileName);
        if (fs.existsSync(targetFile)) {
            try { fs.unlinkSync(targetFile); } catch (e) {}
        }
        const configFile = getAppConfigFile(appId, fileName);
        if (fs.existsSync(configFile)) {
            try { fs.unlinkSync(configFile); } catch (e) {}
        }
    }
    public clear_app_state(appName?: string, fileName = "state.json"): void { this.clearAppState(appName, fileName); }

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
    public save_window_session(appName?: string): void { this.saveWindowSession(appName); }

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
                    if (typeof v === "boolean" && this.fullscreen === false) this.fullscreen = v;
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
    public restore_window_session(appName?: string): boolean { return this.restoreWindowSession(appName); }

    public enableAutoSaveState(appName?: string, fileName = "state.json"): this {
        const appId = appName || this.getAppId();
        this.onClose((w) => {
            w.saveAppStateOr(appId, fileName);
        });
        return this;
    }
    public enable_auto_save_state(appName?: string, fileName = "state.json"): this {
        return this.enableAutoSaveState(appName, fileName);
    }

    // =========================================================================
    // Universal Theme & Form State Auto-Persistence API
    // =========================================================================

    public restoreSavedTheme(): this {
        const saved = getSavedTheme();
        if (saved) {
            this.setTheme(saved, false);
        }
        return this;
    }
    public restore_saved_theme(): this { return this.restoreSavedTheme(); }

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
    public get_app_id(): string { return this.getAppId(); }

    public setAppId(id: string): this {
        this.appId = id;
        return this;
    }
    public set_app_id(id: string): this { return this.setAppId(id); }

    public enableAutoSave(): this {
        this.autoSaveState = true;
        return this;
    }
    public enable_auto_save(): this { return this.enableAutoSave(); }

    public disableAutoSave(): this {
        this.autoSaveState = false;
        return this;
    }
    public disable_auto_save(): this { return this.disableAutoSave(); }

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
    public save_app_form_state(appName?: string): void { this.saveAppFormState(appName); }

    public saveAppFormStateOr(appName?: string): boolean {
        try {
            this.saveAppFormState(appName);
            return true;
        } catch (e) {
            return false;
        }
    }
    public save_app_form_state_or(appName?: string): boolean { return this.saveAppFormStateOr(appName); }

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

            if (["dd_app_theme", "dd_theme", "dd_theme_selector", "theme_picker"].includes(cid)) {
                this.setValue(cid, this.theme);
            }
        }

        return true;
    }
    public restore_app_form_state(appName?: string): boolean { return this.restoreAppFormState(appName); }

    public clearAppFormState(appName?: string): void {
        const appId = appName || this.getAppId();
        const stateFile = getAppStateFile(appId, "form_state.json");
        if (fs.existsSync(stateFile)) {
            try { fs.unlinkSync(stateFile); } catch (e) {}
        }
        const configFile = getAppConfigFile(appId, "form_state.json");
        if (fs.existsSync(configFile)) {
            try { fs.unlinkSync(configFile); } catch (e) {}
        }
    }
    public clear_app_form_state(appName?: string): void { this.clearAppFormState(appName); }

    // =========================================================================
    // Two-Way Data & Event Binding API
    // =========================================================================

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

        this.onStateChange(stateKey, (w, val) => {
            if (String(w.getValue(controlName) ?? "") !== val) {
                w.setValue(controlName, val);
            }
        });

        this.onChange(controlName, (w, val) => {
            const strVal = String(val ?? "");
            if (w.getState(stateKey) !== strVal) {
                w.setState(stateKey, strVal);
            }
        });

        return this;
    }
    public bind_state(controlName: string, stateKey: string): this { return this.bindState(controlName, stateKey); }
    public bindControl(controlName: string, stateKey: string): this { return this.bindState(controlName, stateKey); }
    public bind_control(controlName: string, stateKey: string): this { return this.bindState(controlName, stateKey); }
    public bindValue(controlName: string, stateKey: string): this { return this.bindState(controlName, stateKey); }
    public bind_value(controlName: string, stateKey: string): this { return this.bindState(controlName, stateKey); }

    public onClick(controlId: string, callback: EventCallback): this {
        this.bindControlEvent(controlId, "onClick", callback);
        return this;
    }
    public on_click(controlId: string, callback: EventCallback): this { return this.onClick(controlId, callback); }
    public bindClick(controlId: string, callback: EventCallback): this { return this.onClick(controlId, callback); }
    public bind_click(controlId: string, callback: EventCallback): this { return this.onClick(controlId, callback); }

    public onChange(controlId: string, callback: EventCallback): this {
        this.bindControlEvent(controlId, "onChange", callback);
        return this;
    }
    public on_change(controlId: string, callback: EventCallback): this { return this.onChange(controlId, callback); }
    public bindChange(controlId: string, callback: EventCallback): this { return this.onChange(controlId, callback); }
    public bind_change(controlId: string, callback: EventCallback): this { return this.onChange(controlId, callback); }

    public onEnter(controlId: string, callback: EventCallback): this {
        this.bindControlEvent(controlId, "onEnter", callback);
        return this;
    }
    public on_enter(controlId: string, callback: EventCallback): this { return this.onEnter(controlId, callback); }
    public bindEnter(controlId: string, callback: EventCallback): this { return this.onEnter(controlId, callback); }
    public bind_enter(controlId: string, callback: EventCallback): this { return this.onEnter(controlId, callback); }

    public onHover(controlId: string, callback: EventCallback): this {
        this.bindControlEvent(controlId, "onHover", callback);
        return this;
    }
    public on_hover(controlId: string, callback: EventCallback): this { return this.onHover(controlId, callback); }
    public bindHover(controlId: string, callback: EventCallback): this { return this.onHover(controlId, callback); }
    public bind_hover(controlId: string, callback: EventCallback): this { return this.onHover(controlId, callback); }

    public onDblClick(controlId: string, callback: EventCallback): this {
        this.bindControlEvent(controlId, "onDoubleClick", callback);
        return this;
    }
    public on_dblclick(controlId: string, callback: EventCallback): this { return this.onDblClick(controlId, callback); }
    public bindDblClick(controlId: string, callback: EventCallback): this { return this.onDblClick(controlId, callback); }
    public bind_dblclick(controlId: string, callback: EventCallback): this { return this.onDblClick(controlId, callback); }

    public onRightClick(controlId: string, callback: EventCallback): this {
        this.bindControlEvent(controlId, "onContextMenu", callback);
        return this;
    }
    public on_right_click(controlId: string, callback: EventCallback): this { return this.onRightClick(controlId, callback); }
    public bindRightClick(controlId: string, callback: EventCallback): this { return this.onRightClick(controlId, callback); }
    public bind_right_click(controlId: string, callback: EventCallback): this { return this.onRightClick(controlId, callback); }

    public onEvent(controlId: string, eventName: string, callback: EventCallback): this {
        this.bindControlEvent(controlId, eventName, callback);
        return this;
    }
    public on(controlId: string, eventName: string, callback: EventCallback): this { return this.onEvent(controlId, eventName, callback); }
    public on_event(controlId: string, eventName: string, callback: EventCallback): this { return this.onEvent(controlId, eventName, callback); }
    public bindEvent(controlId: string, eventName: string, callback: EventCallback): this { return this.onEvent(controlId, eventName, callback); }
    public bind_event(controlId: string, eventName: string, callback: EventCallback): this { return this.onEvent(controlId, eventName, callback); }

    public onShortcut(shortcut: string, callback: EventCallback): this {
        const key = `shortcut_${shortcut.toLowerCase()}`;
        this.eventHandlersMap.set(key, callback);
        return this;
    }
    public on_shortcut(shortcut: string, callback: EventCallback): this { return this.onShortcut(shortcut, callback); }
    public bindShortcut(shortcut: string, callback: EventCallback): this { return this.onShortcut(shortcut, callback); }
    public bind_shortcut(shortcut: string, callback: EventCallback): this { return this.onShortcut(shortcut, callback); }
    public bindKey(key: string, callback: EventCallback): this { return this.onShortcut(key, callback); }
    public bind_key(key: string, callback: EventCallback): this { return this.bindKey(key, callback); }

    // =========================================================================
    // Window Lifecycle & Close Handling API
    // =========================================================================

    public onClose(cb: (win: SimpleWindow) => boolean | void): this {
        this.closeListeners.push(cb);
        return this;
    }
    public on_close(cb: (win: SimpleWindow) => boolean | void): this { return this.onClose(cb); }

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
        this.webview = null;
        forceExit(0);
    }

    // =========================================================================
    // Vlang Webview RAD Studio Complete Parity Controls & API Methods
    // =========================================================================

    private getLastControl(): any {
        if (!this.lastControlId) return null;
        return this.controls.find(c => c && (c.id === this.lastControlId || c.name === this.lastControlId)) || null;
    }

    // --- Window-Level Fluent Modifiers (operate on last created control) ---
    public width(w: number): this {
        const ctrl = this.getLastControl();
        if (ctrl) {
            ctrl.width = w;
            ctrl.user_explicit_width = true;
        }
        return this;
    }

    public height(h: number): this {
        const ctrl = this.getLastControl();
        if (ctrl) ctrl.height = h;
        return this;
    }

    public placeholder(p: string): this {
        const ctrl = this.getLastControl();
        if (ctrl) ctrl.placeholder = p;
        return this;
    }

    public tooltip(t: string): this {
        const ctrl = this.getLastControl();
        if (ctrl) ctrl.tooltip = t;
        return this;
    }

    public fontSize(sz: number): this {
        const ctrl = this.getLastControl();
        if (ctrl) {
            ctrl.fontSize = sz;
            ctrl.font_size = sz;
        }
        return this;
    }
    public font_size(sz: number): this {
        return this.fontSize(sz);
    }

    public bold(b: boolean = true): this {
        const ctrl = this.getLastControl();
        if (ctrl) {
            ctrl.is_bold = b;
            ctrl.bold = b;
        }
        return this;
    }

    public fontColor(color: string): this {
        const ctrl = this.getLastControl();
        if (ctrl) {
            ctrl.font_color = color;
            ctrl.color = color;
        }
        return this;
    }
    public font_color(color: string): this {
        return this.fontColor(color);
    }

    public backgroundColor(color: string): this {
        const ctrl = this.getLastControl();
        if (ctrl) {
            ctrl.background_color = color;
            ctrl.bg = color;
        }
        return this;
    }
    public background_color(color: string): this {
        return this.backgroundColor(color);
    }

    public expandFill(expand: boolean = true): this {
        const ctrl = this.getLastControl();
        if (ctrl) {
            ctrl.expandFill = expand;
            ctrl.expand_fill = expand;
        }
        return this;
    }
    public expand_fill(expand: boolean = true): this {
        return this.expandFill(expand);
    }

    public onclick(cb: EventCallback): this {
        if (this.lastControlId) {
            this.eventHandlersMap.set(`${this.lastControlId}:click`, cb);
            this.eventHandlersMap.set(`click_${this.lastControlId}`, cb);
        }
        return this;
    }

    public onchange(cb: EventCallback): this {
        if (this.lastControlId) {
            this.eventHandlersMap.set(`${this.lastControlId}:change`, cb);
            this.eventHandlersMap.set(`change_${this.lastControlId}`, cb);
        }
        return this;
    }

    public onenter(cb: EventCallback): this {
        if (this.lastControlId) {
            this.eventHandlersMap.set(`${this.lastControlId}:enter`, cb);
            this.eventHandlersMap.set(`enter_${this.lastControlId}`, cb);
        }
        return this;
    }

    public onSelectItem(name: string, cb: EventCallback): this {
        return this.on_change(name, cb);
    }
    public on_select_item(name: string, cb: EventCallback): this {
        return this.onSelectItem(name, cb);
    }

    public setControlAlignment(name: string, alignment: string): this {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name));
        if (ctrl) ctrl.alignment = alignment;
        return this;
    }
    public set_control_alignment(name: string, alignment: string): this {
        return this.setControlAlignment(name, alignment);
    }
    public getControlAlignment(name: string): string {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name));
        return ctrl ? (ctrl.alignment || "left") : "left";
    }
    public get_control_alignment(name: string): string {
        return this.getControlAlignment(name);
    }

    public setControlExpandFill(name: string, expand: boolean): this {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name));
        if (ctrl) {
            ctrl.expandFill = expand;
            ctrl.expand_fill = expand;
        }
        return this;
    }
    public set_control_expand_fill(name: string, expand: boolean): this {
        return this.setControlExpandFill(name, expand);
    }
    public getControlExpandFill(name: string): boolean {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name));
        return !!(ctrl && (ctrl.expandFill || ctrl.expand_fill));
    }
    public get_control_expand_fill(name: string): boolean {
        return this.getControlExpandFill(name);
    }

    public setDefaultButton(name: string): this {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name));
        if (ctrl) ctrl.is_default = true;
        return this;
    }
    public set_default_button(name: string): this {
        return this.setDefaultButton(name);
    }

    // --- Containers & Layout Helpers ---
    public beginFlexBox(name = "", direction: "row" | "column" = "row", justify = "start", align = "center"): this {
        return this.beginFlex(direction, justify, align);
    }
    public begin_flex_box(name = "", direction: "row" | "column" = "row", justify = "start", align = "center"): this {
        return this.beginFlexBox(name, direction, justify, align);
    }
    public endFlexBox(): this {
        return this.endFlex();
    }
    public end_flex_box(): this {
        return this.endFlex();
    }

    public row(nameOrCallback: string | ((win: SimpleWindow) => void), maybeCallback?: (win: SimpleWindow) => void): this {
        const cb = typeof nameOrCallback === "function" ? nameOrCallback : maybeCallback;
        this.beginRow();
        if (cb) cb(this);
        this.endRow();
        return this;
    }

    public card(nameOrCallback: string | ((win: SimpleWindow) => void), maybeCallback?: (win: SimpleWindow) => void): this {
        const cb = typeof nameOrCallback === "function" ? nameOrCallback : maybeCallback;
        this.beginCard();
        if (cb) cb(this);
        this.endCard();
        return this;
    }

    public cardWithTitle(nameOrTitle: string, titleOrCallback?: string | ((win: SimpleWindow) => void), maybeCallback?: (win: SimpleWindow) => void): this {
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
    public card_with_title(nameOrTitle: string, titleOrCallback?: string | ((win: SimpleWindow) => void), maybeCallback?: (win: SimpleWindow) => void): this {
        return this.cardWithTitle(nameOrTitle, titleOrCallback, maybeCallback);
    }

    public group(name: string, title: string, callback: (win: SimpleWindow) => void): this {
        return this.cardWithTitle(name, title, callback);
    }

    public rowStart(): this { return this.beginRow(); }
    public row_start(): this { return this.beginRow(); }
    public rowEnd(): this { return this.endRow(); }
    public row_end(): this { return this.endRow(); }
    public boxStart(title = ""): this {
        this.beginCard();
        if (title) {
            this.addLabel(title, { font_size: 14, is_bold: true, margin_bottom: 8 });
        }
        return this;
    }
    public box_start(title = ""): this { return this.boxStart(title); }
    public boxEnd(): this { return this.endCard(); }
    public box_end(): this { return this.endCard(); }

    // --- Control Addition Parity Methods ---
    public add_label(name: string, text: string): SimpleControlRef {
        return this.addLabel(text).id(name);
    }

    public add_checkbox(name: string, label: string, checked = false): SimpleControlRef {
        return this.addCheckbox(label, checked).id(name);
    }

    public add_switch(name: string, label: string, checked = false): SimpleControlRef {
        return this.addSwitch(label, checked).id(name);
    }

    public addToggle(name: string, label: string, checked = false): SimpleControlRef {
        return this.addSwitch(label, checked).id(name);
    }
    public add_toggle(name: string, label: string, checked = false): SimpleControlRef {
        return this.addToggle(name, label, checked);
    }

    public add_slider(nameOrMin: string | number = 0, minOrMax: number = 100, maxOrVal: number = 50, val?: number): SimpleControlRef {
        if (typeof nameOrMin === "string") {
            const min = minOrMax;
            const max = maxOrVal;
            const value = val !== undefined ? val : min;
            return this.addSlider(min, max, value).id(nameOrMin);
        }
        return this.addSlider(nameOrMin, minOrMax, maxOrVal);
    }

    public add_stepper(name: string, min = 0, max = 100, value = 0): SimpleControlRef {
        return this.addStepper(min, max, value).id(name);
    }

    public addNumberInput(name: string, min = 0, max = 100, value = 0): SimpleControlRef {
        return this.addVisualControl("input", 120, 32, { id: name, min, max, value: String(value), text: String(value) });
    }
    public add_number_input(name: string, min = 0, max = 100, value = 0): SimpleControlRef {
        return this.addNumberInput(name, min, max, value);
    }

    public add_progress_bar(name: string, value = 0): SimpleControlRef {
        return this.addProgressIndicator(name, value, 100);
    }
    public addProgress(name: string, value = 0, max = 100): SimpleControlRef {
        return this.addProgressIndicator(name, value, max);
    }
    public add_progress(name: string, value = 0, max = 100): SimpleControlRef {
        return this.addProgress(name, value, max);
    }

    public add_circular_progress(name: string, value = 50): SimpleControlRef {
        return this.addCircularProgress(name, value);
    }

    public addKpiCard(name: string, title: string, value: string, subtitle = ""): SimpleControlRef {
        return this.addVisualControl("kpi_card", 220, 90, { id: name, text: title, caption: title, value, secondary_text: subtitle, change: subtitle });
    }
    public add_kpi_card(name: string, title: string, value: string, subtitle = ""): SimpleControlRef {
        return this.addKpiCard(name, title, value, subtitle);
    }

    public add_badge(name: string, text: string, color = "#0a84ff"): SimpleControlRef {
        return this.addBadge(name, text, color);
    }

    public add_divider(name = ""): SimpleControlRef {
        return this.addVisualControl("divider", 400, 2, { id: name || undefined });
    }
    public addDividerLine(): SimpleControlRef {
        return this.add_divider();
    }
    public add_divider_line(): SimpleControlRef {
        return this.addDividerLine();
    }

    public addSpacer(nameOrHeight: string | number = 16, height = 16): SimpleControlRef {
        let h = typeof nameOrHeight === "number" ? nameOrHeight : height;
        let id = typeof nameOrHeight === "string" ? nameOrHeight : "";
        return this.addVisualControl("raw_html", 100, h, { id: id || undefined, text: `<div style="height:${h}px;"></div>` });
    }
    public add_spacer(nameOrHeight: string | number = 16, height = 16): SimpleControlRef {
        return this.addSpacer(nameOrHeight, height);
    }
    public addSpace(height = 16): SimpleControlRef {
        return this.addSpacer("", height);
    }
    public add_space(height = 16): SimpleControlRef {
        return this.addSpace(height);
    }

    public add_date_picker(name: string, date = ""): SimpleControlRef {
        return this.addDatePicker(date).id(name);
    }

    public addColorPicker(name: string, defaultColor = "#0a84ff"): SimpleControlRef {
        return this.addColorWell(name, defaultColor);
    }
    public add_color_picker(name: string, defaultColor = "#0a84ff"): SimpleControlRef {
        return this.addColorPicker(name, defaultColor);
    }

    public add_image(name: string, src: string, width = 200, height = 150): SimpleControlRef {
        return this.addImage(name, src, width, height);
    }

    public addMarkdown(name: string, mdText: string): SimpleControlRef {
        return this.addVisualControl("markdown", 400, 100, { id: name, text: mdText, caption: mdText });
    }
    public add_markdown(name: string, mdText: string): SimpleControlRef {
        return this.addMarkdown(name, mdText);
    }

    public add_code_view(name: string, code: string, language = "typescript"): SimpleControlRef {
        return this.addCodeView(name, code, language);
    }

    public add_alert_banner(name: string, title: string, message: string, level = "info"): SimpleControlRef {
        return this.addAlertBanner(name, title, message, level);
    }

    // --- Direct Chaining Helpers ---
    public label(text: string): SimpleControlRef {
        return this.addLabel(text);
    }

    public heading(title: string): SimpleControlRef {
        return this.addVisualControl("heading", 400, 36, { text: title, caption: title, font_size: 22, is_bold: true });
    }

    public subheading(title: string): SimpleControlRef {
        return this.addVisualControl("subheading", 400, 28, { text: title, caption: title, font_size: 16, is_bold: true });
    }

    public divider(): SimpleControlRef {
        return this.add_divider();
    }

    public statusBar(text: string): SimpleControlRef {
        return this.addStatusBar(text);
    }
    public status_bar(text: string): SimpleControlRef {
        return this.statusBar(text);
    }

    public kpiCard(title: string, value: string, change = ""): SimpleControlRef {
        return this.addKpiCard("", title, value, change);
    }
    public kpi_card(title: string, value: string, change = ""): SimpleControlRef {
        return this.kpiCard(title, value, change);
    }

    public progress(val: number, max = 100): SimpleControlRef {
        return this.addProgress("", val, max);
    }

    public rawHtml(html: string): SimpleControlRef {
        return this.addVisualControl("raw_html", 400, 40, { text: html });
    }
    public raw_html(html: string): SimpleControlRef {
        return this.rawHtml(html);
    }

    public input_named(name: string, placeholder = "", defaultVal = "", onChange?: EventCallback): SimpleControlRef {
        const ref = this.addTextInput(placeholder, defaultVal).id(name);
        if (onChange) ref.onChange(onChange);
        return ref;
    }
    public inputNamed(name: string, placeholder = "", defaultVal = "", onChange?: EventCallback): SimpleControlRef {
        return this.input_named(name, placeholder, defaultVal, onChange);
    }

    public textarea_named(name: string, placeholder = "", defaultVal = "", onChange?: EventCallback): SimpleControlRef {
        const ref = this.addTextArea(placeholder, defaultVal).id(name);
        if (onChange) ref.onChange(onChange);
        return ref;
    }
    public textareaNamed(name: string, placeholder = "", defaultVal = "", onChange?: EventCallback): SimpleControlRef {
        return this.textarea_named(name, placeholder, defaultVal, onChange);
    }

    public table_named(name: string, headers: string[], rows: any[][], onSelect?: EventCallback): SimpleControlRef {
        return this.addTable(name, headers, rows, onSelect);
    }
    public tableNamed(name: string, headers: string[], rows: any[][], onSelect?: EventCallback): SimpleControlRef {
        return this.table_named(name, headers, rows, onSelect);
    }

    // --- Table Operations ---
    public setTableRows(name: string, rows: any[][]): this {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name || (!name && (c.type === "table" || c.type === "data_table"))));
        if (ctrl) {
            ctrl.rows = rows;
            ctrl.value = rows;
            this.setTableData(ctrl.id, rows);
        }
        return this;
    }
    public set_table_rows(name: string, rows: any[][]): this {
        return this.setTableRows(name, rows);
    }

    public addTableRow(name: string, row: any[]): this {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name));
        if (ctrl) {
            const existing = ctrl.rows || (Array.isArray(ctrl.value) ? ctrl.value : []);
            const rows = Array.isArray(existing) ? [...existing, row] : [row];
            ctrl.rows = rows;
            ctrl.value = rows;
            return this.setTableRows(ctrl.id, rows);
        }
        return this;
    }
    public add_table_row(name: string, row: any[]): this {
        return this.addTableRow(name, row);
    }

    public removeTableRow(name: string, rowIndex: number): this {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name));
        if (ctrl) {
            const existing = ctrl.rows || (Array.isArray(ctrl.value) ? ctrl.value : []);
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
    public remove_table_row(name: string, rowIndex: number): this {
        return this.removeTableRow(name, rowIndex);
    }

    public tableRowCount(name: string): number {
        const ctrl = this.controls.find(c => c && (c.id === name || c.name === name));
        if (ctrl) {
            const r = ctrl.rows || (Array.isArray(ctrl.value) ? ctrl.value : null);
            if (Array.isArray(r)) return r.length;
        }
        return 0;
    }
    public table_row_count(name: string): number {
        return this.tableRowCount(name);
    }

    public selectTableRow(name: string, rowIndex: number): this {
        if (this.webview) {
            this.webview.eval(`const t=document.getElementById("${name}");if(t){t.querySelectorAll("tbody tr").forEach((r,i)=>r.classList.toggle("sg-table-selected", i===${rowIndex}));}`);
        }
        return this;
    }
    public select_table_row(name: string, rowIndex: number): this {
        return this.selectTableRow(name, rowIndex);
    }

    // --- Value Accessors ---
    public getValueInt(name: string): number {
        const val = this.getValue(name);
        return parseInt(String(val ?? 0), 10) || 0;
    }
    public get_value_int(name: string): number {
        return this.getValueInt(name);
    }

    public getChecked(name: string): boolean {
        const val = this.getValue(name);
        return val === true || val === "true" || val === 1 || val === "1";
    }
    public get_checked(name: string): boolean {
        return this.getChecked(name);
    }

    public setChecked(name: string, val: boolean): this {
        return this.setValue(name, val);
    }
    public set_checked(name: string, val: boolean): this {
        return this.setChecked(name, val);
    }

    public get(name: string): string {
        return String(this.getValue(name) ?? "");
    }
    public set(name: string, val: string): this {
        return this.setValue(name, val);
    }

    // --- Theming Operations ---
    public applyTheme(themeName: string): this {
        return this.setTheme(themeName);
    }
    public applyThemeByName(themeName: string): this {
        return this.applyTheme(themeName);
    }
    public apply_theme_by_name(themeName: string): this {
        return this.applyThemeByName(themeName);
    }

    public isDarkTheme(): boolean {
        const t = getTheme(this.theme);
        return t ? t.is_dark : true;
    }
    public is_dark_theme(): boolean {
        return this.isDarkTheme();
    }

    public setDarkTheme(dark: boolean): this {
        return this.setTheme(dark ? "monokai_pro" : "apple_light");
    }
    public set_dark_theme(dark: boolean): this {
        return this.setDarkTheme(dark);
    }

    public toggleWindowTheme(): this {
        return this.setDarkTheme(!this.isDarkTheme());
    }
    public toggle_window_theme(): this {
        return this.toggleWindowTheme();
    }
}

// Production Theme Specification Lookup Table
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
}

export const SIMPLEGUI_THEMES: Record<string, SimpleGUITheme> = {
    // ==========================================
    // 3. V-LANG RAD STUDIO 42 PORTED THEMES
    // ==========================================
    "sonoma_dark": {
        name: "macOS Sonoma Dark",
        short_name: "Sonoma Dark",
        background_color: "#1e1e1e",
        font_color: "#ffffff",
        accent_color: "#007aff",
        secondary_accent: "#5ac8fa",
        card_background: "#2c2c2e",
        card_border: "#3a3a3c",
        description: "macOS Sonoma dark translucent acrylic interface",
        is_dark: true
    },
    "sonoma_light": {
        name: "macOS Sonoma Light",
        short_name: "Sonoma Light",
        background_color: "#f6f6f6",
        font_color: "#1d1d1f",
        accent_color: "#007aff",
        secondary_accent: "#5ac8fa",
        card_background: "#ffffff",
        card_border: "#d1d1d6",
        description: "macOS Sonoma crisp light mode with vibrant blue accents",
        is_dark: false
    },
    "fluent_dark": {
        name: "Windows 11 Fluent Dark",
        short_name: "Fluent Dark",
        background_color: "#202020",
        font_color: "#ffffff",
        accent_color: "#60cdff",
        secondary_accent: "#76b9ed",
        card_background: "#2c2c2c",
        card_border: "#383838",
        description: "Windows 11 Fluent Design dark acrylic Mica theme with cyan accent",
        is_dark: true
    },
    "fluent_light": {
        name: "Windows 11 Fluent Light",
        short_name: "Fluent Light",
        background_color: "#f3f3f3",
        font_color: "#1b1b1b",
        accent_color: "#005fb8",
        secondary_accent: "#0078d4",
        card_background: "#ffffff",
        card_border: "#e5e5e5",
        description: "Windows 11 Fluent Design light canvas with signature blue",
        is_dark: false
    },
    "commodore64": {
        name: "Commodore 64",
        short_name: "C64",
        background_color: "#40318d",
        font_color: "#8b80db",
        accent_color: "#8b80db",
        secondary_accent: "#a098eb",
        card_background: "#352874",
        card_border: "#5c48b8",
        description: "8-bit nostalgic purple and lavender CRT monitor aesthetic",
        is_dark: true
    },
    "macintosh_system7": {
        name: "Macintosh System 7",
        short_name: "System 7",
        background_color: "#ffffff",
        font_color: "#000000",
        accent_color: "#000000",
        secondary_accent: "#666666",
        card_background: "#f0f0f0",
        card_border: "#000000",
        description: "Classic 1991 Apple Macintosh System 7 platinum desktop UI",
        is_dark: false
    },
    "matrix_phosphor": {
        name: "Matrix Phosphor",
        short_name: "Matrix",
        background_color: "#0d1117",
        font_color: "#00ff41",
        accent_color: "#00ff41",
        secondary_accent: "#008f11",
        card_background: "#080c08",
        card_border: "#003b00",
        description: "Digital rain monochrome green phosphor terminal",
        is_dark: true
    },
    "synthwave84": {
        name: "Synthwave '84",
        short_name: "Synthwave",
        background_color: "#262335",
        font_color: "#f92aad",
        accent_color: "#f92aad",
        secondary_accent: "#36f9f6",
        card_background: "#1a1824",
        card_border: "#ff7edb",
        description: "Retro 80s neon grid sunset with hot pink and laser cyan",
        is_dark: true
    },
    "sunset_orange": {
        name: "Sunset Orange",
        short_name: "Sunset",
        background_color: "#1a1412",
        font_color: "#fff3e0",
        accent_color: "#ff6f00",
        secondary_accent: "#ff9800",
        card_background: "#261e1b",
        card_border: "#3d302a",
        description: "Warm dusk twilight with glowing tangerine amber",
        is_dark: true
    },
    "crimson": {
        name: "Crimson Velvet",
        short_name: "Crimson",
        background_color: "#1a0c0e",
        font_color: "#ffebee",
        accent_color: "#ef4444",
        secondary_accent: "#f43f5e",
        card_background: "#261216",
        card_border: "#3d1c23",
        description: "Dramatic dark luxury crimson ruby and scarlet",
        is_dark: true
    },
    "emerald": {
        name: "Emerald Matrix",
        short_name: "Emerald",
        background_color: "#0a1a12",
        font_color: "#e8f5e9",
        accent_color: "#10b981",
        secondary_accent: "#34d399",
        card_background: "#10261b",
        card_border: "#1b4332",
        description: "Lush botanical forest emerald with jade highlights",
        is_dark: true
    },
    "sapphire": {
        name: "Sapphire Deep",
        short_name: "Sapphire",
        background_color: "#0a121e",
        font_color: "#e3f2fd",
        accent_color: "#3b82f6",
        secondary_accent: "#60a5fa",
        card_background: "#101d30",
        card_border: "#1e3a5f",
        description: "Deep oceanic midnight blue with bright cobalt accents",
        is_dark: true
    },
    "amethyst": {
        name: "Amethyst Royal",
        short_name: "Amethyst",
        background_color: "#140e1e",
        font_color: "#f3e8ff",
        accent_color: "#a855f7",
        secondary_accent: "#c084fc",
        card_background: "#1f1530",
        card_border: "#3b2361",
        description: "Regal dark violet and lavender crystal ambiance",
        is_dark: true
    },
    "charcoal": {
        name: "Charcoal Dark",
        short_name: "Charcoal",
        background_color: "#1c1c1e",
        font_color: "#ebebf5",
        accent_color: "#636366",
        secondary_accent: "#8e8e93",
        card_background: "#2c2c2e",
        card_border: "#3a3a3c",
        description: "Neutral graphite slate with minimalist monochrome tone",
        is_dark: true
    },
    "slate": {
        name: "Slate Modern",
        short_name: "Slate",
        background_color: "#0f172a",
        font_color: "#f1f5f9",
        accent_color: "#64748b",
        secondary_accent: "#94a3b8",
        card_background: "#1e293b",
        card_border: "#334155",
        description: "Modern cool slate with balanced low-fatigue contrast",
        is_dark: true
    },
    "dark": {
        name: "Default Dark",
        short_name: "Dark",
        background_color: "#1e1e2e",
        font_color: "#cdd6f4",
        accent_color: "#cba6f7",
        secondary_accent: "#f38ba8",
        card_background: "#181825",
        card_border: "#313244",
        description: "Default fallback theme",
        is_dark: true
    },
    "light": {
        name: "Default Light",
        short_name: "Light",
        background_color: "#ffffff",
        font_color: "#1a1a1a",
        accent_color: "#007aff",
        secondary_accent: "#5856d6",
        card_background: "#f2f2f7",
        card_border: "#c6c6c8",
        description: "Default standard clean light theme",
        is_dark: false
    },
    // V-Lang Compatibility Aliases
    "gruvbox": {
        name: "Gruvbox Dark",
        short_name: "Gruvbox",
        background_color: "#282828",
        font_color: "#ebdbb2",
        accent_color: "#fabd2f",
        secondary_accent: "#fe8019",
        card_background: "#1d2021",
        card_border: "#504945",
        description: "Warm retro groove aesthetic with vivid yellow and orange accents",
        is_dark: true
    },
    "one_dark": {
        name: "One Dark Pro",
        short_name: "One Dark",
        background_color: "#21252b",
        font_color: "#abb2bf",
        accent_color: "#61afef",
        secondary_accent: "#98c379",
        card_background: "#282c34",
        card_border: "#3e4451",
        description: "Iconic Atom & VS Code One Dark Pro deep slate canvas with vibrant syntax hues",
        is_dark: true
    },
    "synthwave_84": {
        name: "Synthwave '84",
        short_name: "Synthwave",
        background_color: "#262335",
        font_color: "#f92aad",
        accent_color: "#f92aad",
        secondary_accent: "#36f9f6",
        card_background: "#1a1824",
        card_border: "#ff7edb",
        description: "Retro 80s neon grid sunset with hot pink and laser cyan",
        is_dark: true
    },
    "catppuccin_mocha": {
        name: "Catppuccin Mocha",
        short_name: "Catppuccin",
        background_color: "#1e1e2e",
        font_color: "#cdd6f4",
        accent_color: "#cba6f7",
        secondary_accent: "#f38ba8",
        card_background: "#181825",
        card_border: "#313244",
        description: "Soothing pastel high-contrast dark palette crafted for developer wellbeing",
        is_dark: true
    },
    "macos_sonoma": {
        name: "macOS Sonoma Dark",
        short_name: "Sonoma Dark",
        background_color: "#1e1e1e",
        font_color: "#ffffff",
        accent_color: "#007aff",
        secondary_accent: "#5ac8fa",
        card_background: "#2c2c2e",
        card_border: "#3a3a3c",
        description: "macOS Sonoma dark translucent acrylic interface",
        is_dark: true
    },
    "macos_dark": {
        name: "macOS Sonoma Dark",
        short_name: "Sonoma Dark",
        background_color: "#1e1e1e",
        font_color: "#ffffff",
        accent_color: "#007aff",
        secondary_accent: "#5ac8fa",
        card_background: "#2c2c2e",
        card_border: "#3a3a3c",
        description: "macOS Sonoma dark translucent acrylic interface",
        is_dark: true
    },
    "macos_light": {
        name: "macOS Sonoma Light",
        short_name: "Sonoma Light",
        background_color: "#f6f6f6",
        font_color: "#1d1d1f",
        accent_color: "#007aff",
        secondary_accent: "#5ac8fa",
        card_background: "#ffffff",
        card_border: "#d1d1d6",
        description: "macOS Sonoma crisp light mode with vibrant blue accents",
        is_dark: false
    },
    "windows_11_fluent": {
        name: "Windows 11 Fluent Dark",
        short_name: "Fluent Dark",
        background_color: "#202020",
        font_color: "#ffffff",
        accent_color: "#60cdff",
        secondary_accent: "#76b9ed",
        card_background: "#2c2c2c",
        card_border: "#383838",
        description: "Windows 11 Fluent Design dark acrylic Mica theme with cyan accent",
        is_dark: true
    },
    "windows_11_dark": {
        name: "Windows 11 Fluent Dark",
        short_name: "Fluent Dark",
        background_color: "#202020",
        font_color: "#ffffff",
        accent_color: "#60cdff",
        secondary_accent: "#76b9ed",
        card_background: "#2c2c2c",
        card_border: "#383838",
        description: "Windows 11 Fluent Design dark acrylic Mica theme with cyan accent",
        is_dark: true
    },
    "windows_11_light": {
        name: "Windows 11 Fluent Light",
        short_name: "Fluent Light",
        background_color: "#f3f3f3",
        font_color: "#1b1b1b",
        accent_color: "#005fb8",
        secondary_accent: "#0078d4",
        card_background: "#ffffff",
        card_border: "#e5e5e5",
        description: "Windows 11 Fluent Design light canvas with signature blue",
        is_dark: false
    },
    "windows_95": {
        name: "Windows 95 Classic",
        short_name: "Win95",
        background_color: "#008080",
        font_color: "#000000",
        accent_color: "#000080",
        secondary_accent: "#c0c0c0",
        card_background: "#c0c0c0",
        card_border: "#ffffff",
        description: "Classic Redmond 1995 teal desktop with beveled 3D borders",
        is_dark: false
    },
    "commodore_64": {
        name: "Commodore 64",
        short_name: "C64",
        background_color: "#40318d",
        font_color: "#8b80db",
        accent_color: "#8b80db",
        secondary_accent: "#a098eb",
        card_background: "#352874",
        card_border: "#5c48b8",
        description: "8-bit nostalgic purple and lavender CRT monitor aesthetic",
        is_dark: true
    },
    "c64": {
        name: "Commodore 64",
        short_name: "C64",
        background_color: "#40318d",
        font_color: "#8b80db",
        accent_color: "#8b80db",
        secondary_accent: "#a098eb",
        card_background: "#352874",
        card_border: "#5c48b8",
        description: "8-bit nostalgic purple and lavender CRT monitor aesthetic",
        is_dark: true
    },
    "amiga_workbench": {
        name: "Amiga Workbench",
        short_name: "Amiga",
        background_color: "#0055aa",
        font_color: "#ffffff",
        accent_color: "#ffaa00",
        secondary_accent: "#ffffff",
        card_background: "#003366",
        card_border: "#ffaa00",
        description: "AmigaOS 1.3 deep royal blue canvas with striking amber orange accents",
        is_dark: true
    },
    "atari_st": {
        name: "Amiga Workbench",
        short_name: "Amiga",
        background_color: "#0055aa",
        font_color: "#ffffff",
        accent_color: "#ffaa00",
        secondary_accent: "#ffffff",
        card_background: "#003366",
        card_border: "#ffaa00",
        description: "AmigaOS 1.3 deep royal blue canvas with striking amber orange accents",
        is_dark: true
    },
    "mac_system_7": {
        name: "Macintosh System 7",
        short_name: "System 7",
        background_color: "#ffffff",
        font_color: "#000000",
        accent_color: "#000000",
        secondary_accent: "#666666",
        card_background: "#f0f0f0",
        card_border: "#000000",
        description: "Classic 1991 Apple Macintosh System 7 platinum desktop UI",
        is_dark: false
    },
    "mac_classic": {
        name: "Macintosh System 7",
        short_name: "System 7",
        background_color: "#ffffff",
        font_color: "#000000",
        accent_color: "#000000",
        secondary_accent: "#666666",
        card_background: "#f0f0f0",
        card_border: "#000000",
        description: "Classic 1991 Apple Macintosh System 7 platinum desktop UI",
        is_dark: false
    },
    "matrix": {
        name: "Matrix Phosphor",
        short_name: "Matrix",
        background_color: "#0d1117",
        font_color: "#00ff41",
        accent_color: "#00ff41",
        secondary_accent: "#008f11",
        card_background: "#080c08",
        card_border: "#003b00",
        description: "Digital rain monochrome green phosphor terminal",
        is_dark: true
    },
    "amber": {
        name: "Amber CRT Monochrome",
        short_name: "Amber CRT",
        background_color: "#0a0600",
        font_color: "#ffb000",
        accent_color: "#ffb000",
        secondary_accent: "#ff8800",
        card_background: "#160d00",
        card_border: "#472800",
        description: "Vintage amber phosphor monochrome terminal with warm tungsten glow",
        is_dark: true
    },
    "vibrant_neon": {
        name: "Cyberpunk 2077",
        short_name: "Cyberpunk",
        background_color: "#0d0221",
        font_color: "#00f6ff",
        accent_color: "#ff007f",
        secondary_accent: "#ffe600",
        card_background: "#19053b",
        card_border: "#7b2cbf",
        description: "High-voltage synthwave night city with radioactive cyan and hot magenta",
        is_dark: true
    },
    "vscode_dark": {
        name: "One Dark Pro",
        short_name: "One Dark",
        background_color: "#21252b",
        font_color: "#abb2bf",
        accent_color: "#61afef",
        secondary_accent: "#98c379",
        card_background: "#282c34",
        card_border: "#3e4451",
        description: "Iconic Atom & VS Code One Dark Pro deep slate canvas with vibrant syntax hues",
        is_dark: true
    },
    "sublime_text": {
        name: "Monokai Pro",
        short_name: "Monokai",
        background_color: "#2d2a2e",
        font_color: "#fcfcfa",
        accent_color: "#ffd866",
        secondary_accent: "#ff6188",
        card_background: "#221f22",
        card_border: "#403e41",
        description: "Monokai Pro refined dark spectrum with warm yellow and vivid magenta accents",
        is_dark: true
    },
    "material_dark": {
        name: "One Dark Pro",
        short_name: "One Dark",
        background_color: "#21252b",
        font_color: "#abb2bf",
        accent_color: "#61afef",
        secondary_accent: "#98c379",
        card_background: "#282c34",
        card_border: "#3e4451",
        description: "Iconic Atom & VS Code One Dark Pro deep slate canvas with vibrant syntax hues",
        is_dark: true
    },

    // ==========================================
    // 1. SIGNATURE BRAND THEME
    // ==========================================
    "codefreelance": {
        name: "CodeFreelance",
        short_name: "CodeFreelance",
        background_color: "#050505",
        font_color: "#ffffff",
        accent_color: "#0fb36a",
        secondary_accent: "#bd00ff",
        card_background: "#121212",
        card_border: "#242424",
        description: "Official CodeFreelance dark theme: #050505 obsidian canvas, #121212 cards, #0fb36a neon emerald green & #bd00ff purple accents (codefreelance.net)",
        is_dark: true
    },
    "code_freelance": {
        name: "CodeFreelance",
        short_name: "CodeFreelance",
        background_color: "#050505",
        font_color: "#ffffff",
        accent_color: "#0fb36a",
        secondary_accent: "#bd00ff",
        card_background: "#121212",
        card_border: "#242424",
        description: "Official CodeFreelance dark theme: #050505 obsidian canvas, #121212 cards, #0fb36a neon emerald green & #bd00ff purple accents (codefreelance.net)",
        is_dark: true
    },

    // ==========================================
    // 2. APPLE & MACOS FLAGSHIP THEMES
    // ==========================================
    "apple_light": {
        name: "Apple Light",
        short_name: "Light",
        background_color: "#f5f5f7",
        font_color: "#1d1d1f",
        accent_color: "#0071e3",
        secondary_accent: "#5e5ce6",
        card_background: "#ffffff",
        card_border: "#e5e5e7",
        description: "Clean Apple macOS Aqua light canvas with SF Pro typography and Cupertino system blue",
        is_dark: false
    },
    "apple_dark": {
        name: "Apple Dark",
        short_name: "Dark",
        background_color: "#161618",
        font_color: "#f5f5f7",
        accent_color: "#0a84ff",
        secondary_accent: "#bf5af2",
        card_background: "#242426",
        card_border: "#38383a",
        description: "Vibrant Apple macOS Dark Mode surface with titanium gray cards and iOS system blue",
        is_dark: true
    },
    "midnight": {
        name: "Midnight Space Gray",
        short_name: "Midnight",
        background_color: "#0f1115",
        font_color: "#e6edf3",
        accent_color: "#38bdf8",
        secondary_accent: "#818cf8",
        card_background: "#161922",
        card_border: "#232936",
        description: "Pro dark titanium space gray theme with deep slate surfaces and luminous sky blue",
        is_dark: true
    },
    "apple_sunset": {
        name: "Apple Sunset",
        short_name: "Sunset",
        background_color: "#221526",
        font_color: "#fdf4f8",
        accent_color: "#ff7733",
        secondary_accent: "#e056fd",
        card_background: "#2d1e33",
        card_border: "#46314f",
        description: "Warm macOS Mojave twilight sunset hues with rich plum surfaces and neon amber accents",
        is_dark: true
    },
    "sonoma_emerald": {
        name: "Sonoma Emerald",
        short_name: "Emerald",
        background_color: "#091811",
        font_color: "#ecfdf5",
        accent_color: "#30d158",
        secondary_accent: "#34d399",
        card_background: "#10261c",
        card_border: "#1a3d2c",
        description: "macOS Sonoma dark forest glass palette with radiant emerald and mint accents",
        is_dark: true
    },
    "ventura_amber": {
        name: "Ventura Amber",
        short_name: "Ventura",
        background_color: "#1c140e",
        font_color: "#fffbeb",
        accent_color: "#ff9500",
        secondary_accent: "#f97316",
        card_background: "#281e16",
        card_border: "#3d2f24",
        description: "macOS Ventura golden sunset dark hues with warm amber and roasted espresso cards",
        is_dark: true
    },
    "soft_pastel": {
        name: "Soft Pastel",
        short_name: "Pastel",
        background_color: "#f9f6f0",
        font_color: "#1c1917",
        accent_color: "#c05638",
        secondary_accent: "#3d405b",
        card_background: "#ffffff",
        card_border: "#e7dfd5",
        description: "Apple Studio warm soft linen light theme with terracotta coral and artisan cards",
        is_dark: false
    },

    // ==========================================
    // 3. HIGH-CRAFT DEVELOPER & STUDIO THEMES
    // ==========================================
    "raycast_dark": {
        name: "Raycast Dark",
        short_name: "Raycast",
        background_color: "#0e0f12",
        font_color: "#f3f4f6",
        accent_color: "#ff6363",
        secondary_accent: "#ff9494",
        card_background: "#18191e",
        card_border: "#282a32",
        description: "Silicon Valley developer command palette with ultra-slick charcoal surfaces and laser red",
        is_dark: true
    },
    "raycast": {
        name: "Raycast Dark",
        short_name: "Raycast",
        background_color: "#0e0f12",
        font_color: "#f3f4f6",
        accent_color: "#ff6363",
        secondary_accent: "#ff9494",
        card_background: "#18191e",
        card_border: "#282a32",
        description: "Silicon Valley developer command palette with ultra-slick charcoal surfaces and laser red",
        is_dark: true
    },
    "linear_dark": {
        name: "Linear Studio",
        short_name: "Linear",
        background_color: "#0f1015",
        font_color: "#e2e4ed",
        accent_color: "#5e6ad2",
        secondary_accent: "#8e9df6",
        card_background: "#181922",
        card_border: "#282a3a",
        description: "High-craft Linear project workspace with deep obsidian cards and electric indigo accents",
        is_dark: true
    },
    "linear": {
        name: "Linear Studio",
        short_name: "Linear",
        background_color: "#0f1015",
        font_color: "#e2e4ed",
        accent_color: "#5e6ad2",
        secondary_accent: "#8e9df6",
        card_background: "#181922",
        card_border: "#282a3a",
        description: "High-craft Linear project workspace with deep obsidian cards and electric indigo accents",
        is_dark: true
    },
    "vercel_dark": {
        name: "Vercel Geist",
        short_name: "Geist",
        background_color: "#000000",
        font_color: "#ededed",
        accent_color: "#ffffff",
        secondary_accent: "#0070f3",
        card_background: "#0a0a0a",
        card_border: "#242424",
        description: "Ultra-minimalist Next.js & Vercel design system with pure monochrome contrast and electric blue",
        is_dark: true
    },
    "vercel": {
        name: "Vercel Geist",
        short_name: "Geist",
        background_color: "#000000",
        font_color: "#ededed",
        accent_color: "#ffffff",
        secondary_accent: "#0070f3",
        card_background: "#0a0a0a",
        card_border: "#242424",
        description: "Ultra-minimalist Next.js & Vercel design system with pure monochrome contrast and electric blue",
        is_dark: true
    },
    "geist": {
        name: "Vercel Geist",
        short_name: "Geist",
        background_color: "#000000",
        font_color: "#ededed",
        accent_color: "#ffffff",
        secondary_accent: "#0070f3",
        card_background: "#0a0a0a",
        card_border: "#242424",
        description: "Ultra-minimalist Next.js & Vercel design system with pure monochrome contrast and electric blue",
        is_dark: true
    },
    "unreal_engine": {
        name: "Unreal Engine 5",
        short_name: "UE5",
        background_color: "#18191c",
        font_color: "#e1e2e6",
        accent_color: "#0e86d4",
        secondary_accent: "#e5a93c",
        card_background: "#222328",
        card_border: "#33353e",
        description: "Epic Games Unreal Engine 5 professional workstation with dark graphite & Blueprint blue",
        is_dark: true
    },
    "ue5": {
        name: "Unreal Engine 5",
        short_name: "UE5",
        background_color: "#18191c",
        font_color: "#e1e2e6",
        accent_color: "#0e86d4",
        secondary_accent: "#e5a93c",
        card_background: "#222328",
        card_border: "#33353e",
        description: "Epic Games Unreal Engine 5 professional workstation with dark graphite & Blueprint blue",
        is_dark: true
    },
    "arc_velvet": {
        name: "Arc Velvet",
        short_name: "Arc Velvet",
        background_color: "#170f26",
        font_color: "#f8f6fc",
        accent_color: "#f72585",
        secondary_accent: "#4cc9f0",
        card_background: "#23183a",
        card_border: "#3d2b63",
        description: "Arc Browser velvet aesthetic with deep plum indigo and luminous neon magenta accents",
        is_dark: true
    },
    "arc_browser": {
        name: "Arc Velvet",
        short_name: "Arc Velvet",
        background_color: "#170f26",
        font_color: "#f8f6fc",
        accent_color: "#f72585",
        secondary_accent: "#4cc9f0",
        card_background: "#23183a",
        card_border: "#3d2b63",
        description: "Arc Browser velvet aesthetic with deep plum indigo and luminous neon magenta accents",
        is_dark: true
    },
    "abyss": {
        name: "Abyss Bioluminescence",
        short_name: "Abyss",
        background_color: "#030712",
        font_color: "#f0fdfa",
        accent_color: "#06b6d4",
        secondary_accent: "#3b82f6",
        card_background: "#0b1329",
        card_border: "#16274e",
        description: "Deep oceanic trench dark theme with radiant bioluminescent cyan and marine slate",
        is_dark: true
    },
    "abyss_bio": {
        name: "Abyss Bioluminescence",
        short_name: "Abyss",
        background_color: "#030712",
        font_color: "#f0fdfa",
        accent_color: "#06b6d4",
        secondary_accent: "#3b82f6",
        card_background: "#0b1329",
        card_border: "#16274e",
        description: "Deep oceanic trench dark theme with radiant bioluminescent cyan and marine slate",
        is_dark: true
    },
    "deep_ocean": {
        name: "Abyss Bioluminescence",
        short_name: "Abyss",
        background_color: "#030712",
        font_color: "#f0fdfa",
        accent_color: "#06b6d4",
        secondary_accent: "#3b82f6",
        card_background: "#0b1329",
        card_border: "#16274e",
        description: "Deep oceanic trench dark theme with radiant bioluminescent cyan and marine slate",
        is_dark: true
    },
    "night_city": {
        name: "Cyberpunk Night City",
        short_name: "Night City",
        background_color: "#0e0e13",
        font_color: "#fcee0a",
        accent_color: "#ff003c",
        secondary_accent: "#00f0ff",
        card_background: "#171720",
        card_border: "#2e2e3f",
        description: "AAA Cyberpunk 2077 Night City HUD with Trauma Team red, Samurai yellow and chrome cards",
        is_dark: true
    },
    "cyberpunk_2077": {
        name: "Cyberpunk Night City",
        short_name: "Night City",
        background_color: "#0e0e13",
        font_color: "#fcee0a",
        accent_color: "#ff003c",
        secondary_accent: "#00f0ff",
        card_background: "#171720",
        card_border: "#2e2e3f",
        description: "AAA Cyberpunk 2077 Night City HUD with Trauma Team red, Samurai yellow and chrome cards",
        is_dark: true
    },
    "horizon": {
        name: "Horizon Sunset",
        short_name: "Horizon",
        background_color: "#1c1e26",
        font_color: "#fdf0ed",
        accent_color: "#e95678",
        secondary_accent: "#fab795",
        card_background: "#232530",
        card_border: "#34384a",
        description: "Warm twilight horizon spectrum with glowing neon coral, peach and dusk plum",
        is_dark: true
    },
    "solar_dusk": {
        name: "Horizon Sunset",
        short_name: "Horizon",
        background_color: "#1c1e26",
        font_color: "#fdf0ed",
        accent_color: "#e95678",
        secondary_accent: "#fab795",
        card_background: "#232530",
        card_border: "#34384a",
        description: "Warm twilight horizon spectrum with glowing neon coral, peach and dusk plum",
        is_dark: true
    },
    "tailwind_dark": {
        name: "Tailwind Slate Emerald",
        short_name: "Tailwind",
        background_color: "#0b1120",
        font_color: "#f1f5f9",
        accent_color: "#10b981",
        secondary_accent: "#06b6d4",
        card_background: "#151e32",
        card_border: "#24324f",
        description: "Modern Tailwind CSS flagship developer theme with deep slate 950 and vibrant emerald",
        is_dark: true
    },
    "tailwind_emerald": {
        name: "Tailwind Slate Emerald",
        short_name: "Tailwind",
        background_color: "#0b1120",
        font_color: "#f1f5f9",
        accent_color: "#10b981",
        secondary_accent: "#06b6d4",
        card_background: "#151e32",
        card_border: "#24324f",
        description: "Modern Tailwind CSS flagship developer theme with deep slate 950 and vibrant emerald",
        is_dark: true
    },
    "tailwind": {
        name: "Tailwind Slate Emerald",
        short_name: "Tailwind",
        background_color: "#0b1120",
        font_color: "#f1f5f9",
        accent_color: "#10b981",
        secondary_accent: "#06b6d4",
        card_background: "#151e32",
        card_border: "#24324f",
        description: "Modern Tailwind CSS flagship developer theme with deep slate 950 and vibrant emerald",
        is_dark: true
    },
    "supabase": {
        name: "Supabase Dark",
        short_name: "Supabase",
        background_color: "#121212",
        font_color: "#f8fafc",
        accent_color: "#3ecf8e",
        secondary_accent: "#70e1a5",
        card_background: "#1c1c1c",
        card_border: "#2e2e2e",
        description: "Supabase cloud database dashboard with sleek dark obsidian and signature emerald",
        is_dark: true
    },
    "supabase_dark": {
        name: "Supabase Dark",
        short_name: "Supabase",
        background_color: "#121212",
        font_color: "#f8fafc",
        accent_color: "#3ecf8e",
        secondary_accent: "#70e1a5",
        card_background: "#1c1c1c",
        card_border: "#2e2e2e",
        description: "Supabase cloud database dashboard with sleek dark obsidian and signature emerald",
        is_dark: true
    },
    "oled_black": {
        name: "OLED Laser Black",
        short_name: "OLED Laser",
        background_color: "#000000",
        font_color: "#ffffff",
        accent_color: "#00e676",
        secondary_accent: "#2979ff",
        card_background: "#0a0a0a",
        card_border: "#222222",
        description: "Zero-power pure OLED black canvas with ultra-sharp laser green and high-contrast cards",
        is_dark: true
    },
    "oled_laser": {
        name: "OLED Laser Black",
        short_name: "OLED Laser",
        background_color: "#000000",
        font_color: "#ffffff",
        accent_color: "#00e676",
        secondary_accent: "#2979ff",
        card_background: "#0a0a0a",
        card_border: "#222222",
        description: "Zero-power pure OLED black canvas with ultra-sharp laser green and high-contrast cards",
        is_dark: true
    },
    "pure_black": {
        name: "OLED Laser Black",
        short_name: "OLED Laser",
        background_color: "#000000",
        font_color: "#ffffff",
        accent_color: "#00e676",
        secondary_accent: "#2979ff",
        card_background: "#0a0a0a",
        card_border: "#222222",
        description: "Zero-power pure OLED black canvas with ultra-sharp laser green and high-contrast cards",
        is_dark: true
    },
    "titanium_slate": {
        name: "Titanium Slate Pro",
        short_name: "Titanium",
        background_color: "#131417",
        font_color: "#e5e5ea",
        accent_color: "#ff6b22",
        secondary_accent: "#98989d",
        card_background: "#1c1d22",
        card_border: "#2f3038",
        description: "Apple Pro hardware grade aerospace titanium space black with aviation orange accents",
        is_dark: true
    },
    "titanium": {
        name: "Titanium Slate Pro",
        short_name: "Titanium",
        background_color: "#131417",
        font_color: "#e5e5ea",
        accent_color: "#ff6b22",
        secondary_accent: "#98989d",
        card_background: "#1c1d22",
        card_border: "#2f3038",
        description: "Apple Pro hardware grade aerospace titanium space black with aviation orange accents",
        is_dark: true
    },
    "jetbrains_darcula": {
        name: "JetBrains Darcula",
        short_name: "Darcula",
        background_color: "#2b2b2b",
        font_color: "#a9b7c6",
        accent_color: "#cc7832",
        secondary_accent: "#6897bb",
        card_background: "#313335",
        card_border: "#45484a",
        description: "Iconic JetBrains IntelliJ IDEA / PyCharm Darcula IDE workspace with warm syntax orange",
        is_dark: true
    },
    "darcula_ide": {
        name: "JetBrains Darcula",
        short_name: "Darcula",
        background_color: "#2b2b2b",
        font_color: "#a9b7c6",
        accent_color: "#cc7832",
        secondary_accent: "#6897bb",
        card_background: "#313335",
        card_border: "#45484a",
        description: "Iconic JetBrains IntelliJ IDEA / PyCharm Darcula IDE workspace with warm syntax orange",
        is_dark: true
    },
    "jetbrains": {
        name: "JetBrains Darcula",
        short_name: "Darcula",
        background_color: "#2b2b2b",
        font_color: "#a9b7c6",
        accent_color: "#cc7832",
        secondary_accent: "#6897bb",
        card_background: "#313335",
        card_border: "#45484a",
        description: "Iconic JetBrains IntelliJ IDEA / PyCharm Darcula IDE workspace with warm syntax orange",
        is_dark: true
    },
    "nordic_paper": {
        name: "Nordic Paper Light",
        short_name: "Nordic Paper",
        background_color: "#f7f7f5",
        font_color: "#202124",
        accent_color: "#2b5c8f",
        secondary_accent: "#c2593f",
        card_background: "#ffffff",
        card_border: "#e0ded8",
        description: "Nordic editorial paper light canvas with deep fjord blue and crisp typographic elegance",
        is_dark: false
    },
    "nordic": {
        name: "Nordic Paper Light",
        short_name: "Nordic Paper",
        background_color: "#f7f7f5",
        font_color: "#202124",
        accent_color: "#2b5c8f",
        secondary_accent: "#c2593f",
        card_background: "#ffffff",
        card_border: "#e0ded8",
        description: "Nordic editorial paper light canvas with deep fjord blue and crisp typographic elegance",
        is_dark: false
    },
    "paper_light": {
        name: "Nordic Paper Light",
        short_name: "Nordic Paper",
        background_color: "#f7f7f5",
        font_color: "#202124",
        accent_color: "#2b5c8f",
        secondary_accent: "#c2593f",
        card_background: "#ffffff",
        card_border: "#e0ded8",
        description: "Nordic editorial paper light canvas with deep fjord blue and crisp typographic elegance",
        is_dark: false
    },
    "paper": {
        name: "Nordic Paper Light",
        short_name: "Nordic Paper",
        background_color: "#f7f7f5",
        font_color: "#202124",
        accent_color: "#2b5c8f",
        secondary_accent: "#c2593f",
        card_background: "#ffffff",
        card_border: "#e0ded8",
        description: "Nordic editorial paper light canvas with deep fjord blue and crisp typographic elegance",
        is_dark: false
    },

    // ==========================================
    // 4. ICONIC COMMUNITY DEVELOPER PALETTES
    // ==========================================
    "monokai_pro": {
        name: "Monokai Pro",
        short_name: "Monokai",
        background_color: "#2d2a2e",
        font_color: "#fcfcfa",
        accent_color: "#ffd866",
        secondary_accent: "#ff6188",
        card_background: "#221f22",
        card_border: "#403e41",
        description: "Monokai Pro refined dark spectrum with warm yellow and vivid magenta accents",
        is_dark: true
    },
    "monokai": {
        name: "Monokai Pro",
        short_name: "Monokai",
        background_color: "#2d2a2e",
        font_color: "#fcfcfa",
        accent_color: "#ffd866",
        secondary_accent: "#ff6188",
        card_background: "#221f22",
        card_border: "#403e41",
        description: "Monokai Pro refined dark spectrum with warm yellow and vivid magenta accents",
        is_dark: true
    },
    "tokyo_night": {
        name: "Tokyo Night",
        short_name: "Tokyo Night",
        background_color: "#1a1b26",
        font_color: "#c0caf5",
        accent_color: "#7aa2f7",
        secondary_accent: "#bb9af7",
        card_background: "#24283b",
        card_border: "#414868",
        description: "Tokyo Night dark neon indigo city theme with vibrant blue and lavender accents",
        is_dark: true
    },
    "one_dark_pro": {
        name: "One Dark Pro",
        short_name: "One Dark",
        background_color: "#21252b",
        font_color: "#abb2bf",
        accent_color: "#61afef",
        secondary_accent: "#98c379",
        card_background: "#282c34",
        card_border: "#3e4451",
        description: "Iconic Atom & VS Code One Dark Pro deep slate canvas with vibrant syntax hues",
        is_dark: true
    },
    "one_dark": {
        name: "One Dark Pro",
        short_name: "One Dark",
        background_color: "#21252b",
        font_color: "#abb2bf",
        accent_color: "#61afef",
        secondary_accent: "#98c379",
        card_background: "#282c34",
        card_border: "#3e4451",
        description: "Iconic Atom & VS Code One Dark Pro deep slate canvas with vibrant syntax hues",
        is_dark: true
    },
    "gruvbox_dark": {
        name: "Gruvbox Dark",
        short_name: "Gruvbox",
        background_color: "#282828",
        font_color: "#ebdbb2",
        accent_color: "#fabd2f",
        secondary_accent: "#fe8019",
        card_background: "#1d2021",
        card_border: "#504945",
        description: "Retro groove warm earthy dark palette with amber gold and terracotta orange",
        is_dark: true
    },
    "gruvbox": {
        name: "Gruvbox Dark",
        short_name: "Gruvbox",
        background_color: "#282828",
        font_color: "#ebdbb2",
        accent_color: "#fabd2f",
        secondary_accent: "#fe8019",
        card_background: "#1d2021",
        card_border: "#504945",
        description: "Retro groove warm earthy dark palette with amber gold and terracotta orange",
        is_dark: true
    },
    "gruvbox_light": {
        name: "Gruvbox Light",
        short_name: "Gruv Light",
        background_color: "#fbf1c7",
        font_color: "#3c3836",
        accent_color: "#b57614",
        secondary_accent: "#af3a03",
        card_background: "#f2e5bc",
        card_border: "#d5c4a1",
        description: "Retro groove parchment light canvas with earthy amber and walnut tones",
        is_dark: false
    },
    "rose_pine": {
        name: "Rosé Pine",
        short_name: "Rosé Pine",
        background_color: "#191724",
        font_color: "#e0def4",
        accent_color: "#eb6f92",
        secondary_accent: "#9ccfd8",
        card_background: "#21202e",
        card_border: "#403d52",
        description: "All-natural soft dark palette with dusty rose, pine foam, and warm gold",
        is_dark: true
    },
    "everforest": {
        name: "Everforest Dark",
        short_name: "Everforest",
        background_color: "#2d353b",
        font_color: "#d3c6aa",
        accent_color: "#a7c080",
        secondary_accent: "#7fbbb3",
        card_background: "#232a2e",
        card_border: "#475258",
        description: "Natural comfort forest dark mode engineered for zero eye strain",
        is_dark: true
    },
    "everforest_dark": {
        name: "Everforest Dark",
        short_name: "Everforest",
        background_color: "#2d353b",
        font_color: "#d3c6aa",
        accent_color: "#a7c080",
        secondary_accent: "#7fbbb3",
        card_background: "#232a2e",
        card_border: "#475258",
        description: "Natural comfort forest dark mode engineered for zero eye strain",
        is_dark: true
    },
    "kanagawa": {
        name: "Kanagawa",
        short_name: "Kanagawa",
        background_color: "#1f1f28",
        font_color: "#dcd7ba",
        accent_color: "#7e9cd8",
        secondary_accent: "#ffa066",
        card_background: "#16161d",
        card_border: "#2a2a37",
        description: "Japanese ukiyo-e wave art inspired dark sumi ink palette",
        is_dark: true
    },
    "cobalt2": {
        name: "Cobalt2",
        short_name: "Cobalt2",
        background_color: "#193549",
        font_color: "#ffffff",
        accent_color: "#ffc600",
        secondary_accent: "#0088ff",
        card_background: "#15232d",
        card_border: "#1f4662",
        description: "Wes Bos official Cobalt2 deep navy blue with brilliant canary yellow accents",
        is_dark: true
    },
    "cobalt": {
        name: "Cobalt2",
        short_name: "Cobalt2",
        background_color: "#193549",
        font_color: "#ffffff",
        accent_color: "#ffc600",
        secondary_accent: "#0088ff",
        card_background: "#15232d",
        card_border: "#1f4662",
        description: "Wes Bos official Cobalt2 deep navy blue with brilliant canary yellow accents",
        is_dark: true
    },
    "win11_slate": {
        name: "Windows 11 Fluent Slate",
        short_name: "Win11 Slate",
        background_color: "#202020",
        font_color: "#ffffff",
        accent_color: "#60cdff",
        secondary_accent: "#0078d4",
        card_background: "#2c2c2c",
        card_border: "#383838",
        description: "Modern Windows 11 Fluent Dark Acrylic with vibrant sky blue accents",
        is_dark: true
    },
    "fluent_slate": {
        name: "Windows 11 Fluent Slate",
        short_name: "Win11 Slate",
        background_color: "#202020",
        font_color: "#ffffff",
        accent_color: "#60cdff",
        secondary_accent: "#0078d4",
        card_background: "#2c2c2c",
        card_border: "#383838",
        description: "Modern Windows 11 Fluent Dark Acrylic with vibrant sky blue accents",
        is_dark: true
    },
    "win11_light": {
        name: "Windows 11 Mica Light",
        short_name: "Mica Light",
        background_color: "#f3f3f3",
        font_color: "#1b1b1b",
        accent_color: "#005fb8",
        secondary_accent: "#0078d4",
        card_background: "#ffffff",
        card_border: "#e5e5e5",
        description: "Modern Windows 11 Mica Light desktop with crisp Fluent typography",
        is_dark: false
    },
    "mica_light": {
        name: "Windows 11 Mica Light",
        short_name: "Mica Light",
        background_color: "#f3f3f3",
        font_color: "#1b1b1b",
        accent_color: "#005fb8",
        secondary_accent: "#0078d4",
        card_background: "#ffffff",
        card_border: "#e5e5e5",
        description: "Modern Windows 11 Mica Light desktop with crisp Fluent typography",
        is_dark: false
    },

    // ==========================================
    // MODERN LINUX DESKTOP THEMES
    // ==========================================
    "ubuntu_dark": {
        name: "Ubuntu Yaru Dark",
        short_name: "Ubuntu Dark",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#e95420",
        secondary_accent: "#77216f",
        card_background: "#303030",
        card_border: "#424242",
        description: "Official Ubuntu Yaru modern Linux dark desktop with warm aubergine charcoal surfaces and signature Ubuntu orange accents",
        is_dark: true
    },
    "ubuntu": {
        name: "Ubuntu Yaru Dark",
        short_name: "Ubuntu",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#e95420",
        secondary_accent: "#77216f",
        card_background: "#303030",
        card_border: "#424242",
        description: "Official Ubuntu Yaru modern Linux dark desktop with warm aubergine charcoal surfaces and signature Ubuntu orange accents",
        is_dark: true
    },
    "ubuntu_yaru": {
        name: "Ubuntu Yaru Dark",
        short_name: "Ubuntu",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#e95420",
        secondary_accent: "#77216f",
        card_background: "#303030",
        card_border: "#424242",
        description: "Official Ubuntu Yaru modern Linux dark desktop with warm aubergine charcoal surfaces and signature Ubuntu orange accents",
        is_dark: true
    },
    "yaru_dark": {
        name: "Ubuntu Yaru Dark",
        short_name: "Yaru Dark",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#e95420",
        secondary_accent: "#77216f",
        card_background: "#303030",
        card_border: "#424242",
        description: "Official Ubuntu Yaru modern Linux dark desktop with warm aubergine charcoal surfaces and signature Ubuntu orange accents",
        is_dark: true
    },
    "yaru": {
        name: "Ubuntu Yaru Dark",
        short_name: "Yaru",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#e95420",
        secondary_accent: "#77216f",
        card_background: "#303030",
        card_border: "#424242",
        description: "Official Ubuntu Yaru modern Linux dark desktop with warm aubergine charcoal surfaces and signature Ubuntu orange accents",
        is_dark: true
    },
    "ubuntu_light": {
        name: "Ubuntu Yaru Light",
        short_name: "Ubuntu Light",
        background_color: "#f7f7f7",
        font_color: "#1e1e1e",
        accent_color: "#e95420",
        secondary_accent: "#77216f",
        card_background: "#ffffff",
        card_border: "#dedede",
        description: "Clean Ubuntu Yaru modern Linux light desktop with crisp white surfaces, warm gray borders, and vibrant Ubuntu orange",
        is_dark: false
    },
    "yaru_light": {
        name: "Ubuntu Yaru Light",
        short_name: "Yaru Light",
        background_color: "#f7f7f7",
        font_color: "#1e1e1e",
        accent_color: "#e95420",
        secondary_accent: "#77216f",
        card_background: "#ffffff",
        card_border: "#dedede",
        description: "Clean Ubuntu Yaru modern Linux light desktop with crisp white surfaces, warm gray borders, and vibrant Ubuntu orange",
        is_dark: false
    },
    "adwaita_dark": {
        name: "GNOME Adwaita Dark",
        short_name: "Adwaita Dark",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#3584e4",
        secondary_accent: "#1c71d8",
        card_background: "#303030",
        card_border: "#3d3d3d",
        description: "Modern GNOME Libadwaita desktop theme with deep slate surfaces and signature Adwaita blue accents",
        is_dark: true
    },
    "adwaita": {
        name: "GNOME Adwaita Dark",
        short_name: "Adwaita",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#3584e4",
        secondary_accent: "#1c71d8",
        card_background: "#303030",
        card_border: "#3d3d3d",
        description: "Modern GNOME Libadwaita desktop theme with deep slate surfaces and signature Adwaita blue accents",
        is_dark: true
    },
    "gnome_dark": {
        name: "GNOME Adwaita Dark",
        short_name: "GNOME Dark",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#3584e4",
        secondary_accent: "#1c71d8",
        card_background: "#303030",
        card_border: "#3d3d3d",
        description: "Modern GNOME Libadwaita desktop theme with deep slate surfaces and signature Adwaita blue accents",
        is_dark: true
    },
    "gnome": {
        name: "GNOME Adwaita Dark",
        short_name: "GNOME",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#3584e4",
        secondary_accent: "#1c71d8",
        card_background: "#303030",
        card_border: "#3d3d3d",
        description: "Modern GNOME Libadwaita desktop theme with deep slate surfaces and signature Adwaita blue accents",
        is_dark: true
    },
    "libadwaita": {
        name: "GNOME Adwaita Dark",
        short_name: "Libadwaita",
        background_color: "#242424",
        font_color: "#ffffff",
        accent_color: "#3584e4",
        secondary_accent: "#1c71d8",
        card_background: "#303030",
        card_border: "#3d3d3d",
        description: "Modern GNOME Libadwaita desktop theme with deep slate surfaces and signature Adwaita blue accents",
        is_dark: true
    },
    "adwaita_light": {
        name: "GNOME Adwaita Light",
        short_name: "Adwaita Light",
        background_color: "#fafafa",
        font_color: "#2e3436",
        accent_color: "#3584e4",
        secondary_accent: "#1c71d8",
        card_background: "#ffffff",
        card_border: "#dcdcdc",
        description: "Clean GNOME Libadwaita light desktop with neutral paper surfaces and signature blue controls",
        is_dark: false
    },
    "gnome_light": {
        name: "GNOME Adwaita Light",
        short_name: "GNOME Light",
        background_color: "#fafafa",
        font_color: "#2e3436",
        accent_color: "#3584e4",
        secondary_accent: "#1c71d8",
        card_background: "#ffffff",
        card_border: "#dcdcdc",
        description: "Clean GNOME Libadwaita light desktop with neutral paper surfaces and signature blue controls",
        is_dark: false
    },
    "linux_mint": {
        name: "Linux Mint Dark",
        short_name: "Linux Mint",
        background_color: "#2f343f",
        font_color: "#e0e2e4",
        accent_color: "#87a556",
        secondary_accent: "#2ebd59",
        card_background: "#242831",
        card_border: "#3e4453",
        description: "Modern Linux Mint Cinnamon desktop theme with slate graphite surfaces and signature mint green accents",
        is_dark: true
    },
    "mint_dark": {
        name: "Linux Mint Dark",
        short_name: "Mint Dark",
        background_color: "#2f343f",
        font_color: "#e0e2e4",
        accent_color: "#87a556",
        secondary_accent: "#2ebd59",
        card_background: "#242831",
        card_border: "#3e4453",
        description: "Modern Linux Mint Cinnamon desktop theme with slate graphite surfaces and signature mint green accents",
        is_dark: true
    },
    "mint": {
        name: "Linux Mint Dark",
        short_name: "Mint",
        background_color: "#2f343f",
        font_color: "#e0e2e4",
        accent_color: "#87a556",
        secondary_accent: "#2ebd59",
        card_background: "#242831",
        card_border: "#3e4453",
        description: "Modern Linux Mint Cinnamon desktop theme with slate graphite surfaces and signature mint green accents",
        is_dark: true
    },
    "pop_os": {
        name: "Pop!_OS Dark",
        short_name: "Pop!_OS",
        background_color: "#202222",
        font_color: "#f6f6f6",
        accent_color: "#48b9c7",
        secondary_accent: "#faa41a",
        card_background: "#2c2e2e",
        card_border: "#3d4040",
        description: "System76 Pop!_OS and COSMIC modern Linux desktop with dark charcoal surfaces and signature teal and amber accents",
        is_dark: true
    },
    "cosmic_dark": {
        name: "Pop!_OS Dark",
        short_name: "COSMIC",
        background_color: "#202222",
        font_color: "#f6f6f6",
        accent_color: "#48b9c7",
        secondary_accent: "#faa41a",
        card_background: "#2c2e2e",
        card_border: "#3d4040",
        description: "System76 Pop!_OS and COSMIC modern Linux desktop with dark charcoal surfaces and signature teal and amber accents",
        is_dark: true
    },
    "pop_dark": {
        name: "Pop!_OS Dark",
        short_name: "Pop!_OS",
        background_color: "#202222",
        font_color: "#f6f6f6",
        accent_color: "#48b9c7",
        secondary_accent: "#faa41a",
        card_background: "#2c2e2e",
        card_border: "#3d4040",
        description: "System76 Pop!_OS and COSMIC modern Linux desktop with dark charcoal surfaces and signature teal and amber accents",
        is_dark: true
    },
    "fedora_dark": {
        name: "Fedora Blue",
        short_name: "Fedora",
        background_color: "#1f232a",
        font_color: "#ffffff",
        accent_color: "#51a2da",
        secondary_accent: "#294172",
        card_background: "#292e38",
        card_border: "#3b4250",
        description: "Official Fedora Workstation modern Linux theme with navy graphite cards and crisp Fedora blue",
        is_dark: true
    },
    "fedora": {
        name: "Fedora Blue",
        short_name: "Fedora",
        background_color: "#1f232a",
        font_color: "#ffffff",
        accent_color: "#51a2da",
        secondary_accent: "#294172",
        card_background: "#292e38",
        card_border: "#3b4250",
        description: "Official Fedora Workstation modern Linux theme with navy graphite cards and crisp Fedora blue",
        is_dark: true
    },

    "aura": {
        name: "Aura Dark",
        short_name: "Aura",
        background_color: "#15141b",
        font_color: "#edecee",
        accent_color: "#a277ff",
        secondary_accent: "#61ffca",
        card_background: "#1f1d2b",
        card_border: "#322f44",
        description: "Lush mystical dark theme with ethereal neon purple and mint green accents",
        is_dark: true
    },
    "aura_dark": {
        name: "Aura Dark",
        short_name: "Aura",
        background_color: "#15141b",
        font_color: "#edecee",
        accent_color: "#a277ff",
        secondary_accent: "#61ffca",
        card_background: "#1f1d2b",
        card_border: "#322f44",
        description: "Lush mystical dark theme with ethereal neon purple and mint green accents",
        is_dark: true
    },
    "catppuccin": {
        name: "Catppuccin Mocha",
        short_name: "Catppuccin",
        background_color: "#1e1e2e",
        font_color: "#cdd6f4",
        accent_color: "#cba6f7",
        secondary_accent: "#f5c2e7",
        card_background: "#242438",
        card_border: "#363753",
        description: "Soothing lavender Catppuccin Mocha dark mode with pastel mauve and pink accents",
        is_dark: true
    },
    "nord": {
        name: "Nord",
        short_name: "Nord",
        background_color: "#2e3440",
        font_color: "#eceff4",
        accent_color: "#88c0d0",
        secondary_accent: "#81a1c1",
        card_background: "#3b4252",
        card_border: "#4c566a",
        description: "Arctic frost Nord developer palette with icy cyan and polar slate surfaces",
        is_dark: true
    },
    "dracula": {
        name: "Dracula",
        short_name: "Dracula",
        background_color: "#282a36",
        font_color: "#f8f8f2",
        accent_color: "#bd93f9",
        secondary_accent: "#ff79c6",
        card_background: "#21222c",
        card_border: "#44475a",
        description: "High-contrast vampire purple palette with gothic violet and neon pink accents",
        is_dark: true
    },
    "cyberpunk": {
        name: "Cyberpunk",
        short_name: "Cyberpunk",
        background_color: "#0a0b12",
        font_color: "#00f5d4",
        accent_color: "#ff007f",
        secondary_accent: "#fee440",
        card_background: "#121320",
        card_border: "#282944",
        description: "Neon glow dark contrast palette with electric magenta and laser cyan",
        is_dark: true
    },
    "solarized_light": {
        name: "Solarized Light",
        short_name: "Solar Light",
        background_color: "#fdf6e3",
        font_color: "#073642",
        accent_color: "#268bd2",
        secondary_accent: "#2aa198",
        card_background: "#eee8d5",
        card_border: "#d3cbb7",
        description: "Precision engineered light palette for maximum reading comfort",
        is_dark: false
    },
    "solarized_dark": {
        name: "Solarized Dark",
        short_name: "Solar Dark",
        background_color: "#002b36",
        font_color: "#eee8d5",
        accent_color: "#2aa198",
        secondary_accent: "#268bd2",
        card_background: "#073642",
        card_border: "#0b4c5c",
        description: "Precision engineered dark palette with optimized teal-slate contrast",
        is_dark: true
    },
    "github_dark": {
        name: "GitHub Dark",
        short_name: "GitHub Dark",
        background_color: "#0d1117",
        font_color: "#e6edf3",
        accent_color: "#58a6ff",
        secondary_accent: "#3fb950",
        card_background: "#161b22",
        card_border: "#30363d",
        description: "Official GitHub dark interface palette with refined code repository slate cards",
        is_dark: true
    },
    "github_light": {
        name: "GitHub Light",
        short_name: "GitHub Light",
        background_color: "#f6f8fa",
        font_color: "#1f2328",
        accent_color: "#0969da",
        secondary_accent: "#1a7f37",
        card_background: "#ffffff",
        card_border: "#d0d7de",
        description: "Clean official GitHub light canvas palette with crisp borders and classic blue",
        is_dark: false
    },
    "navy_blue": {
        name: "Navy Blue",
        short_name: "Navy",
        background_color: "#0a0f1d",
        font_color: "#f8fafc",
        accent_color: "#38bdf8",
        secondary_accent: "#6366f1",
        card_background: "#111c33",
        card_border: "#1e2f54",
        description: "Executive maritime deep slate navy dark theme with oceanic blue surfaces",
        is_dark: true
    },
    "forest_green": {
        name: "Forest Green",
        short_name: "Forest",
        background_color: "#0b1f14",
        font_color: "#f0fdf4",
        accent_color: "#4ade80",
        secondary_accent: "#86efac",
        card_background: "#122e1f",
        card_border: "#1a452f",
        description: "Rich botanical evergreen forest dark theme with moss cards and radiant jade accents",
        is_dark: true
    },

    // ==========================================
    // 5. NOSTALGIC & VINTAGE RETRO PALETTES
    // ==========================================
    "win95": {
        name: "Windows 95",
        short_name: "Win95",
        background_color: "#008080",
        font_color: "#000000",
        accent_color: "#000080",
        secondary_accent: "#c0c0c0",
        card_background: "#c0c0c0",
        card_border: "#808080",
        description: "Iconic Windows 95 classic teal desktop with silver 3D beveled cards and titlebar navy",
        is_dark: false
    },
    "windows_95": {
        name: "Windows 95",
        short_name: "Win95",
        background_color: "#008080",
        font_color: "#000000",
        accent_color: "#000080",
        secondary_accent: "#c0c0c0",
        card_background: "#c0c0c0",
        card_border: "#808080",
        description: "Iconic Windows 95 classic teal desktop with silver 3D beveled cards and titlebar navy",
        is_dark: false
    },
    "gameboy": {
        name: "Game Boy 1989",
        short_name: "Game Boy",
        background_color: "#0f380f",
        font_color: "#9bbc0f",
        accent_color: "#8bac0f",
        secondary_accent: "#306230",
        card_background: "#1c4a1c",
        card_border: "#306230",
        description: "Nostalgic 4-shade monochrome dot matrix Game Boy DMG-01 screen",
        is_dark: true
    },
    "game_boy": {
        name: "Game Boy 1989",
        short_name: "Game Boy",
        background_color: "#0f380f",
        font_color: "#9bbc0f",
        accent_color: "#8bac0f",
        secondary_accent: "#306230",
        card_background: "#1c4a1c",
        card_border: "#306230",
        description: "Nostalgic 4-shade monochrome dot matrix Game Boy DMG-01 screen",
        is_dark: true
    },
    "c64": {
        name: "Commodore 64",
        short_name: "C64",
        background_color: "#40318d",
        font_color: "#b8b5ff",
        accent_color: "#7974ff",
        secondary_accent: "#a09eff",
        card_background: "#281b5c",
        card_border: "#5848aa",
        description: "Legendary 1982 Commodore 64 READY prompt and VIC-II blue palette",
        is_dark: true
    },
    "commodore_64": {
        name: "Commodore 64",
        short_name: "C64",
        background_color: "#40318d",
        font_color: "#b8b5ff",
        accent_color: "#7974ff",
        secondary_accent: "#a09eff",
        card_background: "#281b5c",
        card_border: "#5848aa",
        description: "Legendary 1982 Commodore 64 READY prompt and VIC-II blue palette",
        is_dark: true
    },
    "mac_classic": {
        name: "Macintosh System 7",
        short_name: "System 7",
        background_color: "#ebe7df",
        font_color: "#1c1b18",
        accent_color: "#5555aa",
        secondary_accent: "#ded9cf",
        card_background: "#ffffff",
        card_border: "#a8a49c",
        description: "Vintage 1991 System 7 Platinum desktop with Chicago typography and pinstripe accents",
        is_dark: false
    },
    "system7": {
        name: "Macintosh System 7",
        short_name: "System 7",
        background_color: "#ebe7df",
        font_color: "#1c1b18",
        accent_color: "#5555aa",
        secondary_accent: "#ded9cf",
        card_background: "#ffffff",
        card_border: "#a8a49c",
        description: "Vintage 1991 System 7 Platinum desktop with Chicago typography and pinstripe accents",
        is_dark: false
    },
    "amber_crt": {
        name: "Phosphor Amber CRT",
        short_name: "Amber CRT",
        background_color: "#0a0600",
        font_color: "#ffb000",
        accent_color: "#ffb000",
        secondary_accent: "#ff9000",
        card_background: "#160d00",
        card_border: "#472800",
        description: "Warm VT220 / Pip-Boy amber phosphor monochrome terminal cathode glow",
        is_dark: true
    },
    "vt220": {
        name: "Phosphor Amber CRT",
        short_name: "Amber CRT",
        background_color: "#0a0600",
        font_color: "#ffb000",
        accent_color: "#ffb000",
        secondary_accent: "#ff9000",
        card_background: "#160d00",
        card_border: "#472800",
        description: "Warm VT220 / Pip-Boy amber phosphor monochrome terminal cathode glow",
        is_dark: true
    },
    "matrix": {
        name: "Matrix Phosphor",
        short_name: "Matrix",
        background_color: "#040a05",
        font_color: "#00ff66",
        accent_color: "#00ff41",
        secondary_accent: "#03a628",
        card_background: "#08140a",
        card_border: "#123d18",
        description: "Iconic 1999 digital rain phosphor green mainframe terminal",
        is_dark: true
    },
    "green_crt": {
        name: "Matrix Phosphor",
        short_name: "Matrix",
        background_color: "#040a05",
        font_color: "#00ff66",
        accent_color: "#00ff41",
        secondary_accent: "#03a628",
        card_background: "#08140a",
        card_border: "#123d18",
        description: "Iconic 1999 digital rain phosphor green mainframe terminal",
        is_dark: true
    },
    "synthwave": {
        name: "Synthwave '84",
        short_name: "Synthwave",
        background_color: "#130924",
        font_color: "#fce7f3",
        accent_color: "#ff2a85",
        secondary_accent: "#05d9e8",
        card_background: "#22113d",
        card_border: "#5c2494",
        description: "1980s neon synthwave, sunset magenta grid, and retro arcade glow",
        is_dark: true
    },
    "outrun": {
        name: "Synthwave '84",
        short_name: "Synthwave",
        background_color: "#130924",
        font_color: "#fce7f3",
        accent_color: "#ff2a85",
        secondary_accent: "#05d9e8",
        card_background: "#22113d",
        card_border: "#5c2494",
        description: "1980s neon synthwave, sunset magenta grid, and retro arcade glow",
        is_dark: true
    },
    "amiga": {
        name: "Amiga Workbench",
        short_name: "Amiga",
        background_color: "#0055aa",
        font_color: "#ffffff",
        accent_color: "#ff8800",
        secondary_accent: "#003b77",
        card_background: "#003870",
        card_border: "#0077ee",
        description: "Retro Amiga 500 Workbench 1.3 royal blue, orange buttons, and Topaz white",
        is_dark: true
    },
    "workbench": {
        name: "Amiga Workbench",
        short_name: "Amiga",
        background_color: "#0055aa",
        font_color: "#ffffff",
        accent_color: "#ff8800",
        secondary_accent: "#003b77",
        card_background: "#003870",
        card_border: "#0077ee",
        description: "Retro Amiga 500 Workbench 1.3 royal blue, orange buttons, and Topaz white",
        is_dark: true
    },
    "nextstep": {
        name: "NeXTSTEP 1989",
        short_name: "NeXTSTEP",
        background_color: "#262626",
        font_color: "#dedede",
        accent_color: "#4a90e2",
        secondary_accent: "#707070",
        card_background: "#333333",
        card_border: "#4d4d4d",
        description: "Steve Jobs 1989 NeXTSTEP UNIX workstation dark minimalist elegance",
        is_dark: true
    },
    "mac_os_aqua": {
        name: "Mac OS X Aqua",
        short_name: "OS X Aqua",
        background_color: "#e6ebed",
        font_color: "#0f172a",
        accent_color: "#0066cc",
        secondary_accent: "#ff9500",
        card_background: "#ffffff",
        card_border: "#bac7cd",
        description: "Early 2001 OS X Cheetah glossy gel buttons and brushed pinstripes",
        is_dark: false
    },
    "aqua_os_x": {
        name: "Mac OS X Aqua",
        short_name: "OS X Aqua",
        background_color: "#e6ebed",
        font_color: "#0f172a",
        accent_color: "#0066cc",
        secondary_accent: "#ff9500",
        card_background: "#ffffff",
        card_border: "#bac7cd",
        description: "Early 2001 OS X Cheetah glossy gel buttons and brushed pinstripes",
        is_dark: false
    },
    "hotdog_stand": {
        name: "Hot Dog Stand",
        short_name: "Hot Dog",
        background_color: "#000000",
        font_color: "#ffffff",
        accent_color: "#ff0000",
        secondary_accent: "#ffff00",
        card_background: "#1c0000",
        card_border: "#ffff00",
        description: "Unforgettable Windows 3.1 1992 Hot Dog Stand high-contrast yellow & red",
        is_dark: true
    },
    "playstation": {
        name: "PlayStation 1994",
        short_name: "PlayStation",
        background_color: "#1e1e24",
        font_color: "#e4e5eb",
        accent_color: "#00d2c4",
        secondary_accent: "#f44336",
        card_background: "#2a2b34",
        card_border: "#3f414f",
        description: "1994 PSX console grey with iconic geometric controller accents",
        is_dark: true
    },
    "psx": {
        name: "PlayStation 1994",
        short_name: "PlayStation",
        background_color: "#1e1e24",
        font_color: "#e4e5eb",
        accent_color: "#00d2c4",
        secondary_accent: "#f44336",
        card_background: "#2a2b34",
        card_border: "#3f414f",
        description: "1994 PSX console grey with iconic geometric controller accents",
        is_dark: true
    }
};

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
        .replace(/\b(?:Space Gray|Mocha|Phosphor|Monochrome|Palette|Terminal|Classic|Workstation)\b/gi, "")
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
export const auto_short_theme_name = autoShortThemeName;
export const getShortThemeName = autoShortThemeName;
export const get_short_theme_name = autoShortThemeName;

export function listThemes(): string[] {
    return Array.from(new Set(Object.values(SIMPLEGUI_THEMES).map(t => t.name)));
}
export const list_themes = listThemes;

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
    return res;
}
export const list_short_themes = listShortThemes;

export function getThemeKeys(): string[] {
    return Object.keys(SIMPLEGUI_THEMES);
}
export function get_theme_keys(): string[] {
    return getThemeKeys();
}

export const VLANG_THEME_NAMES: string[] = [
    'monokai_pro', 'tokyo_night', 'one_dark_pro', 'gruvbox_dark', 'gruvbox_light',
    'rose_pine', 'everforest', 'kanagawa', 'dracula', 'nord',
    'catppuccin', 'solarized_dark', 'solarized_light', 'github_dark', 'github_light',
    'sonoma_dark', 'sonoma_light', 'sonoma_emerald', 'codefreelance', 'fluent_dark',
    'fluent_light', 'win95', 'commodore64', 'amiga', 'macintosh_system7',
    'gameboy', 'matrix_phosphor', 'amber_crt', 'synthwave84', 'cyberpunk',
    'navy_blue', 'forest_green', 'sunset_orange', 'crimson', 'emerald',
    'sapphire', 'amethyst', 'midnight', 'charcoal', 'slate',
    'dark', 'light', 'raycast_dark', 'linear_dark', 'vercel_dark',
    'unreal_engine', 'arc_velvet', 'abyss', 'night_city', 'horizon',
    'tailwind_dark', 'supabase', 'oled_black', 'titanium_slate', 'jetbrains_darcula',
    'nordic_paper', 'cobalt2', 'win11_slate', 'win11_light', 'ubuntu_dark',
    'ubuntu_light', 'adwaita_dark', 'adwaita_light', 'linux_mint', 'pop_os',
    'fedora_dark', 'aura', 'apple_dark', 'apple_light', 'ventura_amber',
    'apple_sunset', 'soft_pastel', 'nextstep', 'mac_os_aqua', 'hotdog_stand',
    'playstation'
];

export function getThemeNames(): string[] {
    return VLANG_THEME_NAMES;
}
export const get_theme_names = getThemeNames;

export function getTheme(themeName: string): SimpleGUITheme {
    if (!themeName) return SIMPLEGUI_THEMES["monokai_pro"] || SIMPLEGUI_THEMES["apple_light"]!;
    const key = themeName.toLowerCase().trim().replace(/[\s\-_]+/g, "_");
    if (SIMPLEGUI_THEMES[key]) return SIMPLEGUI_THEMES[key]!;

    const aliasMap: Record<string, string> = {
        'gruvbox': 'gruvbox_dark',
        'one_dark': 'one_dark_pro',
        'synthwave_84': 'synthwave84',
        'catppuccin_mocha': 'catppuccin',
        'macos_sonoma': 'sonoma_dark',
        'macos_dark': 'sonoma_dark',
        'macos_light': 'sonoma_light',
        'windows_11_fluent': 'fluent_dark',
        'windows_11_dark': 'fluent_dark',
        'windows_11_light': 'fluent_light',
        'windows_95': 'win95',
        'commodore_64': 'commodore64',
        'c64': 'commodore64',
        'amiga_workbench': 'amiga',
        'atari_st': 'amiga',
        'mac_system_7': 'macintosh_system7',
        'mac_classic': 'macintosh_system7',
        'matrix': 'matrix_phosphor',
        'amber': 'amber_crt',
        'vibrant_neon': 'cyberpunk',
        'vscode_dark': 'one_dark_pro',
        'sublime_text': 'monokai_pro',
        'material_dark': 'one_dark_pro',
    };

    if (aliasMap[key] && SIMPLEGUI_THEMES[aliasMap[key]]) {
        return SIMPLEGUI_THEMES[aliasMap[key]]!;
    }

    const lower = themeName.toLowerCase().trim();
    for (const t of Object.values(SIMPLEGUI_THEMES)) {
        if (t.short_name && (t.short_name.toLowerCase() === lower || t.short_name.toLowerCase().replace(/[\s\-_]+/g, "_") === key)) {
            return t;
        }
        if (t.name.toLowerCase() === lower || t.name.toLowerCase().replace(/[\s\-_]+/g, "_") === key) {
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

// OS Path Utilities
export function homeDir(): string { return process.env.HOME || "/Users"; }
export function tempDir(): string { return process.env.TMPDIR || "/tmp"; }
export function desktopDir(): string { return `${homeDir()}/Desktop`; }
export function documentsDir(): string { return `${homeDir()}/Documents`; }
export function downloadsDir(): string { return `${homeDir()}/Downloads`; }

// Global Factory & Alias Exports matching vlang_simplegui API style
export function createWindow(title = "SimpleGUI Application", width = 800, height = 600, options: SimpleWindowOptions = {}): SimpleWindow {
    return new SimpleWindow(title, width, height, options);
}

export function newWindow(title = "SimpleGUI Application", width = 800, height = 600, options: SimpleWindowOptions = {}): SimpleWindow {
    return createWindow(title, width, height, options);
}

export function newSimpleWindow(title = "SimpleGUI Application", width = 800, height = 600, options: SimpleWindowOptions = {}): SimpleWindow {
    return createWindow(title, width, height, options);
}

export function new_simple_window(title = "SimpleGUI Application", width = 800, height = 600, options: SimpleWindowOptions = {}): SimpleWindow {
    return createWindow(title, width, height, options);
}

export const simplegui = {
    createWindow,
    newWindow,
    newSimpleWindow,
    new_simple_window,
    listThemes,
    list_themes,
    getThemeNames,
    get_theme_names,
    VLANG_THEME_NAMES,
    getThemeKeys,
    get_theme_keys,
    getTheme,
    saveTheme,
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
    SimpleControlRef
};

