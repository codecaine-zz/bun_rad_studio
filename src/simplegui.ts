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
        this.spec.width = width;
        this.spec.height = height;
        return this;
    }

    width(w: number): this {
        const oldW = this.spec.width;
        this.spec.width = w;
        if (oldW && oldW !== w) {
            this.window.recalculateRowX(this.spec, oldW, w);
        }
        return this;
    }

    height(h: number): this {
        this.spec.height = h;
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
        if (color) this.spec.font_color = color;
        if (weight) this.spec.font_weight = weight;
        return this;
    }

    bold(isBold = true): this {
        this.spec.font_weight = isBold ? "700" : "400";
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

    on_click(handler: EventCallback): this { return this.onClick(handler); }
    on_change(handler: EventCallback): this { return this.onChange(handler); }
    on_hover(handler: EventCallback): this { return this.onHover(handler); }
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

    private controls: any[] = [];
    private nonVisualControls: any[] = [];
    private controlIdCounter: Record<string, number> = {};
    private webview: Webview | null = null;
    private isWindowRunning = false;
    public formValuesStore: Record<string, any> = {};
    public eventHandlersMap: Map<string, EventCallback> = new Map();
    private promptResolversMap: Map<string, (val: any) => void> = new Map();

    public accentColor = "#0a84ff";
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
            }
        }

        if (this.isWindowRunning) {
            const isCf = themeName.toLowerCase() === "codefreelance";
            const fieldsetBg = isCf ? "rgba(18, 18, 18, 0.75)" : (isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.03)");
            const fieldsetBorder = themeObj.card_border || (isCf ? "#2a2a2a" : (isLight ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.12)"));
            const cardBg = themeObj.card_background || (isCf ? "#121212" : (isLight ? "#ffffff" : "#1e293b"));
            const inputBg = isLight ? "#ffffff" : (isCf ? "#0f0f0f" : "rgba(0, 0, 0, 0.25)");
            const inputBorder = isCf ? "#2a2a2a" : (isLight ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.18)");

            this.evalJS(`
                (function() {
                    document.documentElement.style.setProperty('--accent', '${colors.accent}');
                    document.documentElement.style.setProperty('--btn-bg', '${btnBg}');
                    document.documentElement.style.setProperty('--btn-fg', '${btnFg}');
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
                            --btn-bg: ${btnBg};
                            --btn-fg: ${btnFg};
                        }
                        body { background-color: ${colors.bg} !important; color: ${colors.fg} !important; }
                        fieldset { background-color: ${fieldsetBg} !important; border-color: ${fieldsetBorder} !important; }
                        legend { color: ${colors.accent} !important; }
                        .simplegui-card, [data-card] { background-color: ${cardBg} !important; border-color: ${fieldsetBorder} !important; }
                        input:not([type="checkbox"]):not([type="radio"]), textarea, select {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border-color: ${inputBorder} !important;
                            color-scheme: ${isLight ? 'light' : 'dark'} !important;
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
                            background-color: ${themeObj.card_background || (isCf ? '#121212' : (isLight ? '#ffffff' : '#1e293b'))} !important;
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
                    \`;
                    document.querySelectorAll('button:not([data-custom-bg]):not([data-no-theme]):not(#simplegui-dialog-cancel):not(.modal-close):not([data-pag-num])').forEach(function(b) {
                        b.style.background = '${btnBg}';
                        b.style.backgroundColor = '${btnBg}';
                        b.style.color = '${btnFg}';
                    });
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
            this.addCaption(subtitle);
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
        const ctrlOpts: Record<string, any> = { text, caption: text, value: initialVal, ...opts };
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
            "midnight", "codefreelance", "sonoma_emerald", "apple_dark", "apple_light",
            "monokai_pro", "tokyo_night", "one_dark_pro", "gruvbox_dark", "gruvbox_light",
            "rose_pine", "everforest", "kanagawa", "cobalt2", "aura",
            "win11_slate", "win11_light",
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

    public addListBox(items: string[], selectedOrOnChange?: string | number | EventCallback, onChangeOrOpts?: EventCallback | Record<string, any>, optsArg: Record<string, any> = {}): SimpleControlRef {
        let selected: string | number | undefined;
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

        const text = items.join(", ");
        const initialVal = typeof selected === "number" ? (items[selected] || "") : (selected || items[0] || "");
        const height = opts.height || (opts.size ? opts.size * 24 + 10 : 120);
        const ref = this.addVisualControl("listbox", 240, height, { text, caption: text, value: initialVal, items, size: opts.size || 5, ...opts });
        this.formValuesStore[ref.spec.id] = initialVal;
        this.listItemsStore[ref.spec.id] = [...items];
        if (onChange) ref.onChange(onChange);
        return ref;
    }
    public add_list_box(items: string[], selected?: string | number, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        return this.addListBox(items, selected, onChange, opts);
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

    public addTable(idOrHeaders: string | string[], headersOrRows?: string[] | any[][], rowsOrOnSelect?: any[][] | EventCallback, onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        let explicitId: string | undefined;
        let headers: string[] = [];
        let rows: any[][] = [];
        let clickHandler: EventCallback | undefined;

        if (typeof idOrHeaders === "string" && Array.isArray(headersOrRows)) {
            explicitId = idOrHeaders;
            headers = headersOrRows as string[];
            if (Array.isArray(rowsOrOnSelect)) {
                rows = rowsOrOnSelect as any[][];
                clickHandler = onSelect;
            } else if (typeof rowsOrOnSelect === "function") {
                clickHandler = rowsOrOnSelect;
            }
        } else if (Array.isArray(idOrHeaders)) {
            headers = idOrHeaders as string[];
            if (Array.isArray(headersOrRows)) {
                rows = headersOrRows as any[][];
                if (typeof rowsOrOnSelect === "function") clickHandler = rowsOrOnSelect;
            }
        }

        const headerCsv = headers.join(", ");
        const ctrlOpts: Record<string, any> = { text: headerCsv, value: rows, ...opts };
        if (explicitId) ctrlOpts.id = explicitId;
        const ref = this.addVisualControl("data_table", 540, 180, ctrlOpts);
        if (clickHandler) ref.onClick(clickHandler);
        return ref;
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

    public addCommandPalette(id?: string, placeholder = "Type a command or search (Ctrl+K)...", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("command_palette", Math.min(480, this.width - 40), 44, {
            id,
            placeholder,
            caption: placeholder,
            ...opts
        });
    }
    public add_command_palette(id?: string, placeholder = "Type a command or search (Ctrl+K)...", opts: Partial<any> = {}): SimpleControlRef {
        return this.addCommandPalette(id, placeholder, opts);
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

    public addTransferList(id: string, leftItems: string[] = [], rightItems: string[] = [], opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("transfer_list", Math.min(480, this.width - 40), 160, {
            id,
            leftItems,
            rightItems,
            ...opts
        });
    }
    public add_transfer_list(id: string, leftItems: string[] = [], rightItems: string[] = [], opts: Partial<any> = {}): SimpleControlRef {
        return this.addTransferList(id, leftItems, rightItems, opts);
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

    public addToolBar(idOrItems?: string | string[], itemsOrOpts?: string[] | string | Partial<any>, opts: Partial<any> = {}): SimpleControlRef {
        let id: string;
        let items: string[];
        let finalOpts: Partial<any> = opts;

        if (typeof idOrItems === "string" && (Array.isArray(itemsOrOpts) || typeof itemsOrOpts === "string")) {
            id = idOrItems;
            items = Array.isArray(itemsOrOpts) ? itemsOrOpts : itemsOrOpts.split(",").map(s => s.trim());
        } else if (Array.isArray(idOrItems)) {
            id = this.generateUniqueId("tool_bar");
            items = idOrItems;
            if (typeof itemsOrOpts === "object") finalOpts = itemsOrOpts;
        } else {
            id = typeof idOrItems === "string" ? idOrItems : this.generateUniqueId("tool_bar");
            items = ["📄 New", "📂 Open", "💾 Save", "⚙️ Settings"];
            if (typeof idOrItems === "object") finalOpts = idOrItems;
            else if (typeof itemsOrOpts === "object") finalOpts = itemsOrOpts;
        }

        return this.addVisualControl("tool_bar", this.width - (this.padding * 2), 36, {
            id,
            text: items.join(", "),
            items,
            ...finalOpts
        });
    }
    public add_tool_bar(idOrItems?: any, itemsOrOpts?: any, opts: Partial<any> = {}): SimpleControlRef {
        return this.addToolBar(idOrItems, itemsOrOpts, opts);
    }
    public tool_bar(idOrItems?: any, itemsOrOpts?: any, opts: Partial<any> = {}): SimpleControlRef {
        return this.addToolBar(idOrItems, itemsOrOpts, opts);
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

    public addDiffView(original: string, modified: string, width = 520, height = 200, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("diff_view", Math.min(width, this.width - 40), height, {
            text: original,
            caption: modified,
            ...opts
        });
    }
    public add_diff_view(original: string, modified: string, width = 520, height = 200, opts: Partial<any> = {}): SimpleControlRef {
        return this.addDiffView(original, modified, width, height, opts);
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

    public addKanbanBoard(columns: Array<{ title: string; items: string[] }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("kanban_board", this.width - (this.padding * 2), 220, {
            kanbanColumns: columns,
            ...opts
        });
    }
    public add_kanban_board(columns: Array<{ title: string; items: string[] }>, opts: Partial<any> = {}): SimpleControlRef {
        return this.addKanbanBoard(columns, opts);
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

    public addTabs(tabNames: string[], selectedIdx = 0, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("tabs", this.width - (this.padding * 2), 40, {
            items: tabNames,
            value: selectedIdx,
            ...opts
        });
    }
    public add_tabs(tabNames: string[], selectedIdx = 0, opts: Partial<any> = {}): SimpleControlRef {
        return this.addTabs(tabNames, selectedIdx, opts);
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

    // --- IPC Event Registration & Dispatching ---
    public bindControlEvent(controlId: string, eventType: string, callback: EventCallback): void {
        const key = `${controlId}:${eventType.toLowerCase()}`;
        this.eventHandlersMap.set(key, callback);

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
                const proc = Bun.spawnSync(["osascript", "-e", `POSIX path of (choose file with prompt "${safeTitle}")`]);
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
                const proc = Bun.spawnSync(["osascript", "-e", `POSIX path of (choose file name with prompt "${safeTitle}" default name "${safeName}")`]);
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
                const proc = Bun.spawnSync(["osascript", "-e", `POSIX path of (choose folder with prompt "${safeTitle}")`]);
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

        return {
            title: this.title,
            width: this.width,
            height: this.height,
            theme: this.theme,
            background_color: this.backgroundColor,
            font_color: this.fontColor,
            accent_color: this.accentColor,
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
        `;

        const lastBodyIdx = html.lastIndexOf("</body>");
        if (lastBodyIdx !== -1) {
            html = html.substring(0, lastBodyIdx) + scriptInject + html.substring(lastBodyIdx);
        } else {
            html += scriptInject;
        }

        return html;
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
        const isInRow = this.layoutStack[this.layoutStack.length - 1]?.type === "row";
        if (isInRow) {
            const compactW = Math.max(160, Math.ceil(title.length * 9.5) + 12);
            this.addLabel(title).font(18, this.accentColor || "#38bdf8", "700").width(compactW);
            if (subtitle) {
                this.addLabel(subtitle).font(12, "#94a3b8");
            }
            return this;
        }
        const fullW = Math.max(300, this.width - (this.padding * 2));
        this.addLabel(title).font(18, this.accentColor || "#38bdf8", "700").width(fullW);
        if (subtitle) {
            this.addLabel(subtitle).font(12, "#94a3b8").width(fullW);
        }
        this.addDivider();
        return this;
    }
    public add_heading(title: string, subtitle?: string): this { return this.addHeading(title, subtitle); }
    public addHeader(title: string, subtitle?: string): this { return this.addHeading(title, subtitle); }
    public add_header(title: string, subtitle?: string): this { return this.addHeading(title, subtitle); }

    public addSubheading(text: string, color = "#e2e8f0"): SimpleControlRef {
        const fullW = Math.max(300, this.width - (this.padding * 2));
        return this.addLabel(text).font(14, color, "600").width(fullW);
    }
    public add_subheading(text: string, color = "#e2e8f0"): SimpleControlRef { return this.addSubheading(text, color); }

    public addCaption(text: string, color = "#94a3b8"): SimpleControlRef {
        const fullW = Math.max(300, this.width - (this.padding * 2));
        return this.addLabel(text).font(12, color, "400").width(fullW);
    }
    public add_caption(text: string, color = "#94a3b8"): SimpleControlRef { return this.addCaption(text, color); }

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

    public addInput(id: string, initialValue = "", placeholder = ""): SimpleControlRef {
        return this.addTextInput(placeholder || initialValue, initialValue).id(id);
    }
    public add_input(id: string, initialValue = "", placeholder = ""): SimpleControlRef {
        return this.addInput(id, initialValue, placeholder);
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
    public setTableData(id: string, headers: string[], rows: any[][]): this {
        const headerCsv = headers.join(", ");
        this.setText(id, headerCsv);
        this.setValue(id, rows);
        if (this.isWindowRunning) {
            const tableJson = JSON.stringify(rows);
            const headersJson = JSON.stringify(headers);
            this.evalJS(`
                const container = document.getElementById("${id}");
                if (container) {
                    const table = container.querySelector("table") || container;
                    const headers = ${headersJson};
                    const rows = ${tableJson};
                    let thead = '<tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr>';
                    let tbody = rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('');
                    table.innerHTML = '<thead>' + thead + '</thead><tbody>' + tbody + '</tbody>';
                }
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
        const prefix = level === 1 ? "[WARN] " : (level === 2 ? "[ERROR] " : "[INFO] ");
        return this.setText(id, current ? `${current}\n${prefix}${text}` : `${prefix}${text}`);
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
    public input(initialVal = ""): SimpleControlRef {
        return this.addTextInput("", initialVal).id("default_input");
    }

    public button(caption: string): SimpleControlRef {
        return this.addButton(caption).id("default_button");
    }

    public textarea(initialVal = ""): SimpleControlRef {
        return this.addTextArea("", initialVal).id("default_textarea");
    }

    public checkbox(label: string, checked = false): SimpleControlRef {
        return this.addCheckbox(label, checked).id("default_checkbox");
    }

    public number(value = 0): SimpleControlRef {
        return this.addStepper(0, 9999, value).id("default_number");
    }

    public dropdown(items: string[], selected = ""): SimpleControlRef {
        return this.addDropdown(items, selected).id("default_dropdown");
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

    public password(initialVal = "", placeholder = "Enter password..."): SimpleControlRef {
        return this.addPassword("pwd_" + Date.now(), placeholder, initialVal);
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

    public apply_theme(theme: SimpleGUITheme): this {
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
    "codefreelance": {
        name: "CodeFreelance",
        short_name: "CodeFreelance",
        background_color: "#050505",
        font_color: "#ffffff",
        accent_color: "#0fb36a",
        secondary_accent: "#bd00ff",
        card_background: "#121212",
        card_border: "#2a2a2a",
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
        card_border: "#2a2a2a",
        description: "Official CodeFreelance dark theme: #050505 obsidian canvas, #121212 cards, #0fb36a neon emerald green & #bd00ff purple accents (codefreelance.net)",
        is_dark: true
    },
    "apple_light": { name: "Apple Light", short_name: "Light", background_color: "#ffffff", font_color: "#1c1c1e", accent_color: "#007aff", description: "Clean macOS Aqua light canvas", is_dark: false },
    "apple_dark": { name: "Apple Dark", short_name: "Dark", background_color: "#1c1c1e", font_color: "#f2f2f7", accent_color: "#0a84ff", description: "Vibrant macOS Dark Mode surface", is_dark: true },
    "midnight": { name: "Midnight Space Gray", short_name: "Midnight", background_color: "#161618", font_color: "#ebebf5", accent_color: "#0a84ff", description: "Pro dark titanium space gray theme", is_dark: true },
    "apple_sunset": { name: "Apple Sunset", short_name: "Sunset", background_color: "#281a24", font_color: "#fdf7f4", accent_color: "#ff6b00", description: "Warm macOS Mojave twilight sunset hues", is_dark: true },
    "sonoma_emerald": { name: "Sonoma Emerald", short_name: "Emerald", background_color: "#0d1f18", font_color: "#f0fdf4", accent_color: "#30d158", description: "macOS Sonoma dark forest glass palette", is_dark: true },
    "ventura_amber": { name: "Ventura Amber", short_name: "Ventura", background_color: "#211815", font_color: "#fff8f0", accent_color: "#ff9500", description: "macOS Ventura golden sunset dark hues", is_dark: true },
    "soft_pastel": { name: "Soft Pastel", short_name: "Pastel", background_color: "#faf6f0", font_color: "#2d2b2a", accent_color: "#e07a5f", description: "Apple Studio warm soft light theme", is_dark: false },
    "catppuccin": { name: "Catppuccin Mocha", short_name: "Catppuccin", background_color: "#1e1e2e", font_color: "#cdd6f4", accent_color: "#cba6f7", description: "Soothing lavender catppuccin dark mode", is_dark: true },
    "nord": { name: "Nord", short_name: "Nord", background_color: "#2e3440", font_color: "#eceff4", accent_color: "#88c0d0", description: "Arctic frost nord developer palette", is_dark: true },
    "dracula": { name: "Dracula", short_name: "Dracula", background_color: "#282a36", font_color: "#f8f8f2", accent_color: "#bd93f9", description: "High-contrast vampire purple palette", is_dark: true },
    "cyberpunk": { name: "Cyberpunk", short_name: "Cyberpunk", background_color: "#0d0d15", font_color: "#00f5d4", accent_color: "#ff007f", description: "Neon glow dark contrast palette", is_dark: true },
    "solarized_light": { name: "Solarized Light", short_name: "Solar Light", background_color: "#fdf6e3", font_color: "#657b83", accent_color: "#268bd2", description: "Precision engineered light palette", is_dark: false },
    "solarized_dark": { name: "Solarized Dark", short_name: "Solar Dark", background_color: "#002b36", font_color: "#839496", accent_color: "#2aa198", description: "Precision engineered dark palette", is_dark: true },
    "github_dark": { name: "GitHub Dark", short_name: "GitHub Dark", background_color: "#0d1117", font_color: "#c9d1d9", accent_color: "#58a6ff", description: "Official GitHub dark interface palette", is_dark: true },
    "github_light": { name: "GitHub Light", short_name: "GitHub Light", background_color: "#ffffff", font_color: "#24292f", accent_color: "#0969da", description: "Clean GitHub light canvas palette", is_dark: false },
    "navy_blue": { name: "Navy Blue", short_name: "Navy", background_color: "#0f172a", font_color: "#f8fafc", accent_color: "#38bdf8", description: "Deep slate navy dark theme", is_dark: true },
    "forest_green": { name: "Forest Green", short_name: "Forest", background_color: "#14532d", font_color: "#f0fdf4", accent_color: "#4ade80", description: "Rich emerald green dark theme", is_dark: true },

    // High-Quality Modern & Developer Themes
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

    // Nostalgic & Retro Themes ("Bring Back Memories")
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
        font_color: "#7974ff",
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
        font_color: "#7974ff",
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
        font_color: "#1d2429",
        accent_color: "#0076fe",
        secondary_accent: "#ffffff",
        card_background: "#ffffff",
        card_border: "#bac7cd",
        description: "Early 2001 OS X Cheetah glossy gel buttons and brushed pinstripes",
        is_dark: false
    },
    "aqua_os_x": {
        name: "Mac OS X Aqua",
        short_name: "OS X Aqua",
        background_color: "#e6ebed",
        font_color: "#1d2429",
        accent_color: "#0076fe",
        secondary_accent: "#ffffff",
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

export function getTheme(themeName: string): SimpleGUITheme {
    if (!themeName) return SIMPLEGUI_THEMES["apple_light"]!;
    const key = themeName.toLowerCase().replace(/[\s\-_]+/g, "_");
    if (SIMPLEGUI_THEMES[key]) return SIMPLEGUI_THEMES[key]!;

    const lower = themeName.toLowerCase().trim();
    for (const t of Object.values(SIMPLEGUI_THEMES)) {
        if (t.short_name && (t.short_name.toLowerCase() === lower || t.short_name.toLowerCase().replace(/[\s\-_]+/g, "_") === key)) {
            return t;
        }
        if (t.name.toLowerCase() === lower || t.name.toLowerCase().replace(/[\s\-_]+/g, "_") === key) {
            return t;
        }
    }

    return SIMPLEGUI_THEMES["apple_light"]!;
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

