import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative, setWindowPositionNative } from "../index.ts";
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
        "file_picker", "date_picker", "time_picker", "number", "stepper",
        "dropdown", "select", "combobox", "segmented", "radio",
        "checkbox", "switch", "toggle",
        "slider", "step_slider", "range_slider", "rating",
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

        const savedGlobalTheme = getSavedTheme();
        const preferredTheme = options.theme || (savedGlobalTheme ? savedGlobalTheme : "sonoma_emerald");
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

        if (this.isWindowRunning) {
            const themeObj = getTheme(themeName);
            const isLight = !themeObj.is_dark;
            const isCf = themeName.toLowerCase() === "codefreelance";
            const fieldsetBg = isCf ? "rgba(18, 18, 18, 0.75)" : (isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.03)");
            const fieldsetBorder = isCf ? "#2a2a2a" : (isLight ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.12)");
            const cardBg = isCf ? "#121212" : (isLight ? "#ffffff" : "#1e293b");
            const inputBg = isLight ? "#ffffff" : (isCf ? "#0f0f0f" : "rgba(0, 0, 0, 0.25)");
            const inputBorder = isCf ? "#2a2a2a" : (isLight ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.18)");

            this.evalJS(`
                (function() {
                    document.body.style.backgroundColor = "${colors.bg}";
                    document.body.style.color = "${colors.fg}";
                    let styleEl = document.getElementById("simplegui-theme-dyn");
                    if (!styleEl) {
                        styleEl = document.createElement("style");
                        styleEl.id = "simplegui-theme-dyn";
                        document.head.appendChild(styleEl);
                    }
                    styleEl.textContent = \`
                        body { background-color: ${colors.bg} !important; color: ${colors.fg} !important; }
                        fieldset { background-color: ${fieldsetBg} !important; border-color: ${fieldsetBorder} !important; }
                        legend { color: ${colors.accent} !important; }
                        .simplegui-card, [data-card] { background-color: ${cardBg} !important; border-color: ${fieldsetBorder} !important; }
                        input:not([type="checkbox"]):not([type="radio"]), textarea, select {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border-color: ${inputBorder} !important;
                        }
                        select:not([size]), .simplegui-select {
                            background-color: ${inputBg} !important;
                            color: ${colors.fg} !important;
                            border-color: ${inputBorder} !important;
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
                            background-color: ${themeName === 'codefreelance' ? '#121212' : (isLight ? '#ffffff' : '#1e293b')} !important;
                            color: ${colors.fg} !important;
                        }
                        :focus-visible { outline-color: ${colors.accent} !important; }
                    \`;
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
            let maxX = this.width - (this.padding * 2);
            if (parentFrame && parentFrame.type === "card" && parentFrame.cardSpec) {
                maxX = (parentFrame.cardSpec.left || this.padding) + (parentFrame.cardSpec.width || (this.width - (this.padding * 2))) - 36;
            }

            // Prevent control from exceeding the entire container width
            const maxContainerW = Math.max(80, maxX - activeFrame.startX);
            if (ctrl.width > maxContainerW && !ctrl.user_explicit_width) {
                ctrl.width = maxContainerW;
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
        const diff = newWidth - oldWidth;
        const activeFrame = this.layoutStack[this.layoutStack.length - 1];
        if (activeFrame && activeFrame.type === "row") {
            activeFrame.currentX += diff;
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

        const defaultBtnBg = opts.background_color || this.accentColor || "#0284c7";
        const isBrightGreen = defaultBtnBg === "#0fb36a" || defaultBtnBg === "#30d158" || defaultBtnBg === "#00ff00" || defaultBtnBg === "#4ade80";
        const defaultBtnFg = opts.font_color || (isBrightGreen ? "#000000" : "#ffffff");
        const ctrlOpts: Record<string, any> = {
            text,
            caption: text,
            background_color: defaultBtnBg,
            font_color: defaultBtnFg,
            font_weight: "700",
            border_radius: 6,
            cursor: "pointer",
            ...opts
        };
        if (explicitId) ctrlOpts.id = explicitId;
        const ref = this.addVisualControl("button", 140, 36, ctrlOpts);
        if (onClick) ref.onClick(onClick);
        return ref;
    }

    public addTextInput(placeholder = "", arg2: string | EventCallback | Partial<any> = "", arg3: EventCallback | Partial<any> = {}): SimpleControlRef {
        let initialValue = "";
        let onChange: EventCallback | undefined;
        let opts: Partial<any> = {};

        if (typeof arg2 === "function") {
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

        const ref = this.addVisualControl("input", 280, 36, { placeholder, value: initialValue, ...opts });
        if (initialValue) this.formValuesStore[ref.spec.id] = initialValue;
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addPasswordInput(placeholder = "••••••••", opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("password", 280, 36, { placeholder, ...opts });
    }

    public addTextArea(placeholder = "", initialValue = "", opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("textarea", 340, 80, { placeholder, value: initialValue, ...opts });
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

    public addThemeSelector(id = "dd_theme", label = "Theme:", popularOnly = false, width = 160): SimpleControlRef {
        const popularThemes = [
            "sonoma_emerald",
            "codefreelance",
            "apple_dark",
            "midnight",
            "dracula",
            "nord",
            "cyberpunk",
            "apple_light",
            "github_dark"
        ];
        const allThemes = Object.keys(SIMPLEGUI_THEMES);
        const themeList = popularOnly ? popularThemes : allThemes;

        if (label && label.length > 0) {
            this.addLabel("lbl_" + id, label);
        }

        const initialTheme = themeList.includes(this.theme) ? this.theme : (themeList[0] || "sonoma_emerald");
        const ref = this.addDropdown(id, themeList, initialTheme);
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
                w.toast(`Theme updated to: ${chosen}`);
            }
        });

        return ref;
    }
    public add_theme_selector(id = "dd_theme", label = "Theme:", popularOnly = false, width = 135): SimpleControlRef {
        return this.addThemeSelector(id, label, popularOnly, width);
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

    public getValue(id: string): any {
        return this.formValuesStore[id];
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
                    const el = (rawEl.tagName === "INPUT" || rawEl.tagName === "SELECT" || rawEl.tagName === "TEXTAREA")
                        ? rawEl
                        : (rawEl.querySelector("input, select, textarea") || rawEl);

                    if (el.type === "checkbox" || el.type === "radio") {
                        el.checked = Boolean(${val});
                    } else if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
                        el.value = ${escaped};
                    } else {
                        const swThumb = rawEl.querySelector(".sw-thumb");
                        const swTrack = rawEl.querySelector(".sw-track");
                        const span = rawEl.querySelector("span");
                        const innerBar = rawEl.querySelector("div > div");

                        if (swThumb && swTrack) {
                            const on = Boolean(${val});
                            swThumb.style.left = on ? "22px" : "2px";
                            swTrack.style.background = on ? "var(--accent, #0284c7)" : "rgba(255,255,255,0.15)";
                        } else if (span && rawEl.querySelectorAll("button").length >= 2) {
                            span.textContent = String(${escaped});
                        } else if (innerBar && rawEl.classList.contains("rad-progress")) {
                            innerBar.style.width = String(${escaped}) + "%";
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
        return {
            title: this.title,
            width: this.width,
            height: this.height,
            background_color: this.backgroundColor,
            font_color: this.fontColor,
            accent_color: this.accentColor,
            padding: this.padding,
            spacing: this.spacing,
            controls: this.controls,
            non_visual_controls: this.nonVisualControls
        };
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

                document.addEventListener("keydown", function(e) {
                    if ((e.metaKey || e.ctrlKey) && (e.key === "q" || e.key === "Q" || e.key === "w" || e.key === "W")) {
                        e.preventDefault();
                        if (window.quitApp) window.quitApp();
                        else if (window.handleWindowCloseIPC) window.handleWindowCloseIPC();
                    }
                });

                document.addEventListener("change", function(e) {
                    const target = e.target;
                    if (target && target.id) {
                        const val = target.type === "checkbox" ? target.checked : target.value;
                        const eventName = "on_" + target.id + "_change";
                        if (window[eventName]) {
                            window[eventName](val);
                        }
                    }
                });
            </script>
        `;
        html = html.replace("</body>", `${scriptInject}</body>`);
        return html;
    }

    public evalJS(code: string): void {
        if (this.webview) {
            try {
                this.webview.eval(code);
            } catch (e) {
                console.error("evalJS Error:", e);
            }
        }
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

        const html = this.generateHtml();
        this.webview = new Webview();
        this.webview.title = this.title;
        this.webview.size = { width: this.width, height: this.height, hint: SizeHint.NONE };

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

        this.webview.bind("handleWindowCloseIPC", () => {
            this.handleClose();
        });

        const watchdog = setInterval(() => {
            if (this.isWindowRunning && Date.now() - lastHeartbeat > 800) {
                clearInterval(watchdog);
                this.handleClose();
            }
        }, 300);

        // Auto-bind state synchronization IPC handlers for all controls BEFORE setHTML
        for (const ctrl of this.controls) {
            if (!ctrl || !ctrl.id) continue;
            const cid = ctrl.id;

            const changeBind = `on_${cid}_change`;
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
            } catch (e) {
                // Ignore duplicate binds
            }

            const clickBind = `on_${cid}_click`;
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
            } catch (e) {
                // Ignore duplicate binds
            }
        }

        // Bind any remaining explicitly registered control events to Webview IPC BEFORE setHTML
        for (const [key, callback] of this.eventHandlersMap.entries()) {
            const [controlId, eventType] = key.split(":");
            if (!controlId || !eventType) continue;
            const eventLower = eventType.replace(/^on/i, "").toLowerCase();
            if (eventLower === "change" || eventLower === "click") continue; // Already bound above

            const bindName = `on_${controlId}_${eventLower}`;
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
        clearInterval(watchdog);
        this.handleClose();
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

    public addPropertyGrid(id: string, props: Record<string, string>): SimpleControlRef {
        const text = Object.entries(props).map(([k, v]) => `${k}:${v}`).join(", ");
        return this.addVisualControl("property_grid", 320, 160, { id, text, caption: text });
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
        return this.addTextArea(placeholder || initialValue, initialValue).id(id);
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
    public is_fullscreen(): boolean { return false; }
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
        console.log(`[setStatus] Called with text: "${text}"`);
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
        sessionData["__win_fullscreen"] = false;
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
                    // fullscreen flag
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
        data["__win_fullscreen"] = false;

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
        if (this.webview) {
            try { this.webview.destroy(); } catch (e) {}
            this.webview = null;
        }
        forceExit(0);
    }
}

// Production Theme Specification Lookup Table
export interface SimpleGUITheme {
    name: string;
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
        background_color: "#050505",
        font_color: "#ffffff",
        accent_color: "#0fb36a",
        secondary_accent: "#bd00ff",
        card_background: "#121212",
        card_border: "#2a2a2a",
        description: "Official CodeFreelance dark theme: #050505 obsidian canvas, #121212 cards, #0fb36a neon emerald green & #bd00ff purple accents (codefreelance.net)",
        is_dark: true
    },
    "apple_light": { name: "Apple Light", background_color: "#ffffff", font_color: "#1c1c1e", accent_color: "#007aff", description: "Clean macOS Aqua light canvas", is_dark: false },
    "apple_dark": { name: "Apple Dark", background_color: "#1c1c1e", font_color: "#f2f2f7", accent_color: "#0a84ff", description: "Vibrant macOS Dark Mode surface", is_dark: true },
    "midnight": { name: "Midnight Space Gray", background_color: "#161618", font_color: "#ebebf5", accent_color: "#0a84ff", description: "Pro dark titanium space gray theme", is_dark: true },
    "apple_sunset": { name: "Apple Sunset", background_color: "#281a24", font_color: "#fdf7f4", accent_color: "#ff6b00", description: "Warm macOS Mojave twilight sunset hues", is_dark: true },
    "sonoma_emerald": { name: "Sonoma Emerald", background_color: "#0d1f18", font_color: "#f0fdf4", accent_color: "#30d158", description: "macOS Sonoma dark forest glass palette", is_dark: true },
    "ventura_amber": { name: "Ventura Amber", background_color: "#211815", font_color: "#fff8f0", accent_color: "#ff9500", description: "macOS Ventura golden sunset dark hues", is_dark: true },
    "soft_pastel": { name: "Soft Pastel", background_color: "#faf6f0", font_color: "#2d2b2a", accent_color: "#e07a5f", description: "Apple Studio warm soft light theme", is_dark: false },
    "catppuccin": { name: "Catppuccin Mocha", background_color: "#1e1e2e", font_color: "#cdd6f4", accent_color: "#cba6f7", description: "Soothing lavender catppuccin dark mode", is_dark: true },
    "nord": { name: "Nord", background_color: "#2e3440", font_color: "#eceff4", accent_color: "#88c0d0", description: "Arctic frost nord developer palette", is_dark: true },
    "dracula": { name: "Dracula", background_color: "#282a36", font_color: "#f8f8f2", accent_color: "#bd93f9", description: "High-contrast vampire purple palette", is_dark: true },
    "cyberpunk": { name: "Cyberpunk", background_color: "#0d0d15", font_color: "#00f5d4", accent_color: "#ff007f", description: "Neon glow dark contrast palette", is_dark: true },
    "solarized_light": { name: "Solarized Light", background_color: "#fdf6e3", font_color: "#657b83", accent_color: "#268bd2", description: "Precision engineered light palette", is_dark: false },
    "solarized_dark": { name: "Solarized Dark", background_color: "#002b36", font_color: "#839496", accent_color: "#2aa198", description: "Precision engineered dark palette", is_dark: true },
    "github_dark": { name: "GitHub Dark", background_color: "#0d1117", font_color: "#c9d1d9", accent_color: "#58a6ff", description: "Official GitHub dark interface palette", is_dark: true },
    "github_light": { name: "GitHub Light", background_color: "#ffffff", font_color: "#24292f", accent_color: "#0969da", description: "Clean GitHub light canvas palette", is_dark: false },
    "navy_blue": { name: "Navy Blue", background_color: "#0f172a", font_color: "#f8fafc", accent_color: "#38bdf8", description: "Deep slate navy dark theme", is_dark: true },
    "forest_green": { name: "Forest Green", background_color: "#14532d", font_color: "#f0fdf4", accent_color: "#4ade80", description: "Rich emerald green dark theme", is_dark: true }
};

export function listThemes(): string[] {
    return Object.values(SIMPLEGUI_THEMES).map(t => t.name);
}

export function getThemeKeys(): string[] {
    return Object.keys(SIMPLEGUI_THEMES);
}
export function get_theme_keys(): string[] {
    return getThemeKeys();
}

export function getTheme(themeName: string): SimpleGUITheme {
    const key = themeName.toLowerCase().replace(/[\s\-_]+/g, "_");
    return SIMPLEGUI_THEMES[key] || SIMPLEGUI_THEMES["apple_light"]!;
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

