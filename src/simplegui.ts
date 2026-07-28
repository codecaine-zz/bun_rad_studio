import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative, setWindowPositionNative } from "../index.ts";
import * as fs from "fs";

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
    focus(): this { this.window.setFocus(this.spec.id); return this; }
    flash(): this { this.window.flashControl(this.spec.id); return this; }
    highlight(durationMs = 1000): this { this.window.highlightControl(this.spec.id, durationMs); return this; }
    increment(delta = 1): number { return this.window.increment(this.spec.id, delta); }
    toggleChecked(): boolean { return this.window.toggleChecked(this.spec.id); }
    appendText(text: string): this { this.window.appendText(this.spec.id, text); return this; }
    appendLine(line: string): this { this.window.appendLine(this.spec.id, line); return this; }
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

    private controls: any[] = [];
    private nonVisualControls: any[] = [];
    private controlIdCounter: Record<string, number> = {};
    private webview: Webview | null = null;
    private isWindowRunning = false;
    private formValuesStore: Record<string, any> = {};
    private eventHandlersMap: Map<string, EventCallback> = new Map();
    private promptResolversMap: Map<string, (val: any) => void> = new Map();

    private layoutStack: LayoutFrame[] = [];
    private currentY = 20;

    constructor(title = "SimpleGUI Application", width = 800, height = 600, options: SimpleWindowOptions = {}) {
        this.title = options.title || title;
        this.width = options.width || width;
        this.height = options.height || height;
        this.padding = options.padding !== undefined ? options.padding : 20;
        this.spacing = options.spacing !== undefined ? options.spacing : 12;
        this.theme = options.theme || "apple_dark";
        this.alwaysOnTop = options.alwaysOnTop || false;

        const resolvedTheme = this.resolveThemeColors(this.theme, options.background_color, options.font_color);
        this.backgroundColor = resolvedTheme.bg;
        this.fontColor = resolvedTheme.fg;

        this.currentY = this.padding;
    }

    private resolveThemeColors(name: string): { bg: string; fg: string } {
        const theme = getTheme(name);
        return { bg: theme.background_color, fg: theme.font_color };
    }

    public setTheme(themeName: string): this {
        this.theme = themeName;
        const colors = this.resolveThemeColors(themeName);
        this.backgroundColor = colors.bg;
        this.fontColor = colors.fg;

        if (this.isWindowRunning) {
            this.evalJS(`
                document.body.style.backgroundColor = "${colors.bg}";
                document.body.style.color = "${colors.fg}";
            `);
        }
        return this;
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

    public beginCard(title?: string): this {
        const cardSpec: any = {
            id: this.generateUniqueId("groupbox"),
            control_type: "groupbox",
            type: "groupbox",
            title: title || "Group Panel",
            text: title || "Group Panel",
            background_color: "rgba(255,255,255,0.03)",
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
        return this;
    }

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

    public beginFlex(direction: "row" | "column" = "row", justify = "start", align = "center"): this {
        if (direction === "row") {
            return this.beginRow();
        } else {
            return this;
        }
    }

    public endFlex(): this {
        if (this.layoutStack.length > 0 && this.layoutStack[this.layoutStack.length - 1]?.type === "row") {
            return this.endRow();
        }
        return this;
    }

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
            // Horizontal Row Layout
            ctrl.left = activeFrame.currentX;
            ctrl.top = activeFrame.currentY;
            ctrl.x = ctrl.left;
            ctrl.y = ctrl.top;

            activeFrame.currentX += ctrl.width + this.spacing;
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
    public addLabel(text: string, opts: Partial<any> = {}): SimpleControlRef {
        return this.addVisualControl("label", 300, 24, { text, caption: text, ...opts });
    }

    public addButton(text: string, onClick?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("button", 140, 36, {
            text,
            caption: text,
            background_color: opts.background_color || "#0284c7",
            font_color: opts.font_color || "#ffffff",
            font_weight: "600",
            border_radius: 6,
            cursor: "pointer",
            ...opts
        });
        if (onClick) ref.onClick(onClick);
        return ref;
    }

    public addTextInput(placeholder = "", initialValue = "", opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("input", 280, 36, { placeholder, value: initialValue, ...opts });
        if (initialValue) this.formValuesStore[ref.spec.id] = initialValue;
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

    public addCheckbox(label: string, checked = false, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const ref = this.addVisualControl("checkbox", 260, 24, { text: label, caption: label, value: checked, checked, ...opts });
        this.formValuesStore[ref.spec.id] = checked;
        if (onChange) ref.onChange(onChange);
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

    public addDropdown(items: string[], selected?: string | number, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const text = items.join(", ");
        const initialVal = typeof selected === "number" ? (items[selected] || "") : (selected || items[0] || "");
        const ref = this.addVisualControl("select", 240, 36, { text, caption: text, value: initialVal, ...opts });
        this.formValuesStore[ref.spec.id] = initialVal;
        this.listItemsStore[ref.spec.id] = [...items];
        if (onChange) ref.onChange(onChange);
        return ref;
    }

    public addListBox(items: string[], selected?: string | number, onChange?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
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

    public addTable(headers: string[], rows: any[][], onSelect?: EventCallback, opts: Partial<any> = {}): SimpleControlRef {
        const headerCsv = headers.join(", ");
        const ref = this.addVisualControl("data_table", 540, 180, { text: headerCsv, value: rows, ...opts });
        if (onSelect) ref.onClick(onSelect);
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

    public withBusyState(names: string[], statusText: string, callback: (win: SimpleWindow, done: (completionStatus?: string) => void) => any | Promise<any>): this {
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
        
        const done = (completionStatus?: string) => {
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

        const result = callback(this, done);
        // If the callback is actually synchronous and didn't use callbacks
        if (result && typeof result.then === 'function') {
            result.then(done).catch((err: any) => {
                console.error("[withBusyState] Promise rejected:", err);
                done();
            });
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
                    if ((e.metaKey || e.ctrlKey) && (e.key === "q" || e.key === "Q")) {
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
            this.isWindowRunning = false;
            process.exit(0);
        });

        this.webview.bind("handleWindowCloseIPC", () => {
            this.isWindowRunning = false;
            process.exit(0);
        });

        const watchdog = setInterval(() => {
            if (this.isWindowRunning && Date.now() - lastHeartbeat > 800) {
                clearInterval(watchdog);
                this.isWindowRunning = false;
                if (this.webview) {
                    try {
                        this.webview.destroy();
                    } catch (e) {}
                    this.webview = null;
                }
                forceExit(0);
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
        const fullW = Math.max(300, this.width - (this.padding * 2));
        this.addLabel(title).font(18, "#38bdf8", "700").width(fullW);
        if (subtitle) {
            this.addLabel(subtitle).font(12, "#94a3b8").width(fullW);
        }
        this.addDivider();
        return this;
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
        this.isWindowRunning = false;
        if (this.webview) {
            try {
                this.webview.destroy();
            } catch (e) {
                // Already destroyed
            }
            this.webview = null;
        }
    }

    public close_window(): void {
        this.close();
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

    public resize(w: number, h: number): this { return this.set_size(w, h); }
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

    public set_theme(themeName: string): this { return this.setTheme(themeName); }
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
        return this.showAlert(msg, title);
    }

    public warn(titleOrMessage: string, message?: string): this {
        const title = message ? titleOrMessage : "Warning";
        const msg = message ? message : titleOrMessage;
        return this.showAlert(`⚠️ ${msg}`, title);
    }

    public errorDialog(titleOrMessage: string, message?: string): this {
        const title = message ? titleOrMessage : "Error";
        const msg = message ? message : titleOrMessage;
        return this.showAlert(`❌ ${msg}`, title);
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
        if (this.hasControl("lblStatus")) this.setText("lblStatus", text);
        else if (this.hasControl("status")) this.setText("status", text);
        if (this.isWindowRunning) {
            this.evalJS(`
                const el = document.getElementById("lblStatus") || document.getElementById("status");
                if (el) el.textContent = ${JSON.stringify(text)};
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
        return this.getListSelectedIndexes(id).map(i => items[i]).filter(Boolean);
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
}

// Production Theme Specification Lookup Table
export interface SimpleGUITheme {
    name: string;
    background_color: string;
    font_color: string;
    accent_color: string;
    description: string;
    is_dark: boolean;
}

export const SIMPLEGUI_THEMES: Record<string, SimpleGUITheme> = {
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

export function getTheme(themeName: string): SimpleGUITheme {
    const key = themeName.toLowerCase().replace(/[\s\-_]+/g, "_");
    return SIMPLEGUI_THEMES[key] || SIMPLEGUI_THEMES["apple_light"];
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

export function new_simple_window(title = "SimpleGUI Application", width = 800, height = 600): SimpleWindow {
    return createWindow(title, width, height);
}

export const simplegui = {
    createWindow,
    newWindow,
    new_simple_window,
    listThemes,
    getTheme,
    homeDir,
    tempDir,
    desktopDir,
    documentsDir,
    downloadsDir,
    SimpleWindow,
    SimpleControlRef
};

