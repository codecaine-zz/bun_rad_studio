import { SizeHint, Webview } from "webview-bun";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { join } from "path";
import { dlopen, FFIType } from "bun:ffi";

const fullscreenStateMap = new WeakMap<Webview, boolean>();

export function setAlwaysOnTopNative(wv: Webview, onTop: boolean) {
    try {
        const handle = wv.unsafeWindowHandle;
        if (!handle) return;

        if (process.platform === "darwin") {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.i64],
                    returns: FFIType.void,
                },
                sel_registerName: {
                    args: [FFIType.cstring],
                    returns: FFIType.pointer,
                }
            });
            const sel_setLevel = libobjc.symbols.sel_registerName(Buffer.from("setLevel:\0"));
            // Level 5 = NSFloatingWindowLevel (Always On Top), 0 = NSNormalWindowLevel
            const level = onTop ? 5n : 0n;
            libobjc.symbols.objc_msgSend(handle, sel_setLevel, level);
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                SetWindowPos: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32],
                    returns: FFIType.bool,
                }
            });
            // HWND_TOPMOST = -1, HWND_NOTOPMOST = -2
            // SWP_NOMOVE (2) | SWP_NOSIZE (1) = 3
            const insertAfter = onTop ? -1 : -2;
            user32.symbols.SetWindowPos(handle, insertAfter, 0, 0, 0, 0, 3);
        } else if (process.platform === "linux") {
            const gtk = dlopen("libgtk-3.so.0", {
                gtk_window_set_keep_above: {
                    args: [FFIType.pointer, FFIType.i32],
                    returns: FFIType.void,
                }
            });
            gtk.symbols.gtk_window_set_keep_above(handle, onTop ? 1 : 0);
        }
    } catch (e) {
        console.warn("Could not set window level:", e);
    }
}

export function toggleFullscreenNative(wv: Webview) {
    try {
        const handle = wv.unsafeWindowHandle;
        if (!handle) return;

        if (process.platform === "darwin") {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: {
                    args: [FFIType.pointer, FFIType.pointer, FFIType.u64],
                    returns: FFIType.u64,
                },
                sel_registerName: {
                    args: [FFIType.cstring],
                    returns: FFIType.pointer,
                }
            });
            const sel_cb = libobjc.symbols.sel_registerName(Buffer.from("collectionBehavior\0"));
            const sel_scb = libobjc.symbols.sel_registerName(Buffer.from("setCollectionBehavior:\0"));
            const sel_toggle = libobjc.symbols.sel_registerName(Buffer.from("toggleFullScreen:\0"));

            // Enable NSWindowCollectionBehaviorFullScreenPrimary (128) on NSWindow
            const cb = BigInt(libobjc.symbols.objc_msgSend(handle, sel_cb, 0n));
            libobjc.symbols.objc_msgSend(handle, sel_scb, cb | 128n);

            // Perform Cocoa toggleFullScreen:
            libobjc.symbols.objc_msgSend(handle, sel_toggle, 0n);
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                IsZoomed: {
                    args: [FFIType.pointer],
                    returns: FFIType.bool,
                },
                ShowWindow: {
                    args: [FFIType.pointer, FFIType.i32],
                    returns: FFIType.bool,
                }
            });
            const isZoomed = user32.symbols.IsZoomed(handle);
            // SW_MAXIMIZE = 3, SW_RESTORE = 9
            user32.symbols.ShowWindow(handle, isZoomed ? 9 : 3);
        } else if (process.platform === "linux") {
            const gtk = dlopen("libgtk-3.so.0", {
                gtk_window_fullscreen: {
                    args: [FFIType.pointer],
                    returns: FFIType.void,
                },
                gtk_window_unfullscreen: {
                    args: [FFIType.pointer],
                    returns: FFIType.void,
                }
            });
            const isFS = fullscreenStateMap.get(wv) ?? false;
            if (isFS) {
                gtk.symbols.gtk_window_unfullscreen(handle);
                fullscreenStateMap.set(wv, false);
            } else {
                gtk.symbols.gtk_window_fullscreen(handle);
                fullscreenStateMap.set(wv, true);
            }
        }
    } catch (e) {
        console.warn("Could not toggle native window fullscreen:", e);
    }
}

export type WindowPositionPreset = 
    | "center" | "screen_center"
    | "upper_left" | "top_left"
    | "upper_right" | "top_right"
    | "bottom_left" | "lower_left"
    | "bottom_right" | "lower_right"
    | "top_center" | "upper_center"
    | "bottom_center" | "lower_center"
    | "center_left"
    | "center_right";

export function setWindowPositionNative(wv: Webview, pos: WindowPositionPreset | { x: number, y: number }, winWidth = 1400, winHeight = 900) {
    try {
        let screenW = 1920;
        let screenH = 1080;

        if (process.platform === "darwin") {
            const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
                CGMainDisplayID: { args: [], returns: FFIType.u32 },
                CGDisplayPixelsWide: { args: [FFIType.u32], returns: FFIType.u64 },
                CGDisplayPixelsHigh: { args: [FFIType.u32], returns: FFIType.u64 }
            });
            const mainId = cg.symbols.CGMainDisplayID();
            screenW = Number(cg.symbols.CGDisplayPixelsWide(mainId));
            screenH = Number(cg.symbols.CGDisplayPixelsHigh(mainId));
        } else if (process.platform === "win32") {
            const user32 = dlopen("user32.dll", {
                GetSystemMetrics: { args: [FFIType.i32], returns: FFIType.i32 }
            });
            // SM_CXSCREEN = 0, SM_CYSCREEN = 1
            screenW = user32.symbols.GetSystemMetrics(0);
            screenH = user32.symbols.GetSystemMetrics(1);
        } else if (process.platform === "linux") {
            try {
                const gdk = dlopen("libgdk-3.so.0", {
                    gdk_screen_get_default: { args: [], returns: FFIType.pointer },
                    gdk_screen_get_width: { args: [FFIType.pointer], returns: FFIType.i32 },
                    gdk_screen_get_height: { args: [FFIType.pointer], returns: FFIType.i32 },
                });
                const defaultScreen = gdk.symbols.gdk_screen_get_default();
                if (defaultScreen) {
                    screenW = gdk.symbols.gdk_screen_get_width(defaultScreen);
                    screenH = gdk.symbols.gdk_screen_get_height(defaultScreen);
                }
            } catch (e) {
                // Fallback resolution 1920x1080 if GDK display query fails
            }
        }

        let targetX = 40;
        let targetTopY = 40;

        if (typeof pos === "object" && pos !== null) {
            targetX = pos.x;
            targetTopY = pos.y;
        } else {
            const preset = String(pos || "center").toLowerCase();
            const margin = 30;
            if (preset === "upper_left" || preset === "top_left") {
                targetX = margin;
                targetTopY = margin + 30;
            } else if (preset === "upper_right" || preset === "top_right") {
                targetX = screenW - winWidth - margin;
                targetTopY = margin + 30;
            } else if (preset === "bottom_left" || preset === "lower_left") {
                targetX = margin;
                targetTopY = screenH - winHeight - margin;
            } else if (preset === "bottom_right" || preset === "lower_right") {
                targetX = screenW - winWidth - margin;
                targetTopY = screenH - winHeight - margin;
            } else if (preset === "top_center" || preset === "upper_center") {
                targetX = Math.round((screenW - winWidth) / 2);
                targetTopY = margin + 30;
            } else if (preset === "bottom_center" || preset === "lower_center") {
                targetX = Math.round((screenW - winWidth) / 2);
                targetTopY = screenH - winHeight - margin;
            } else if (preset === "center_left") {
                targetX = margin;
                targetTopY = Math.round((screenH - winHeight) / 2);
            } else if (preset === "center_right") {
                targetX = screenW - winWidth - margin;
                targetTopY = Math.round((screenH - winHeight) / 2);
            } else {
                // "center" default
                targetX = Math.round((screenW - winWidth) / 2);
                targetTopY = Math.round((screenH - winHeight) / 2);
            }
        }

        const handle = wv.unsafeWindowHandle;
        if (handle) {
            if (process.platform === "darwin") {
                const libobjc = dlopen("libobjc.dylib", {
                    objc_msgSend: {
                        args: [FFIType.pointer, FFIType.pointer, FFIType.f64, FFIType.f64],
                        returns: FFIType.void,
                    },
                    sel_registerName: {
                        args: [FFIType.cstring],
                        returns: FFIType.pointer,
                    }
                });
                const sel_setFrameTopLeft = libobjc.symbols.sel_registerName(Buffer.from("setFrameTopLeftPoint:\0"));
                libobjc.symbols.objc_msgSend(handle, sel_setFrameTopLeft, Number(targetX), Number(screenH - targetTopY));
            } else if (process.platform === "win32") {
                const user32 = dlopen("user32.dll", {
                    SetWindowPos: {
                        args: [FFIType.pointer, FFIType.pointer, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32],
                        returns: FFIType.bool,
                    }
                });
                // SWP_NOSIZE (1) | SWP_NOZORDER (4) = 5
                user32.symbols.SetWindowPos(handle, null, Number(targetX), Number(targetTopY), 0, 0, 5);
            } else if (process.platform === "linux") {
                const gtk = dlopen("libgtk-3.so.0", {
                    gtk_window_move: {
                        args: [FFIType.pointer, FFIType.i32, FFIType.i32],
                        returns: FFIType.void,
                    }
                });
                gtk.symbols.gtk_window_move(handle, Number(targetX), Number(targetTopY));
            }
        }
    } catch (e) {
        console.warn("Could not set window position:", e);
    }
}

// Main IDE entry point
const htmlPath = join(process.cwd(), "src", "ide.html");
let html = readFileSync(htmlPath, "utf-8");

// Inject the default empty FormSpec so the JS initialises properly
const defaultSpec = JSON.stringify({
    title: "Form1",
    width: 800,
    height: 600,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 20,
    spacing: 12,
    controls: []
});
html = html.replace("__SPEC_JSON__", defaultSpec);

// Helper function for exporting project structure
export function exportProjectHelper(specJson: string, customExportDir?: string) {
    try {
        const spec = JSON.parse(specJson);
        const exportDir = customExportDir || join(process.cwd(), "exported_project");
        mkdirSync(exportDir, { recursive: true });
        
        const previewHtml = generatePreviewHtml(spec);
        writeFileSync(join(exportDir, "index.html"), previewHtml);

        let boundMethods: string[] = [];
        let customHandlers: { name: string, ctrlId: string, type: string, evt: string }[] = [];
        (spec.controls || []).forEach((c: any) => {
            if (!c.event_handlers) return;
            for (let evtName in c.event_handlers) {
                let handler = c.event_handlers[evtName];
                if (handler && typeof handler === "string" && handler.trim()) {
                    const clean = handler.trim();
                    const isFuncName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean);
                    if (isFuncName && !boundMethods.includes(clean)) {
                        boundMethods.push(clean);
                        customHandlers.push({ name: clean, ctrlId: c.id, type: c.control_type || "control", evt: evtName });
                    }
                }
            }
        });

        let handlersCode = "";
        if (customHandlers.length > 0) {
            handlersCode += '\n// ==========================================\n';
            handlersCode += '// 🔌 RAD COMPONENT EVENT HANDLERS (' + customHandlers.length + ' active binding(s))\n';
            handlersCode += '// ==========================================\n';
            customHandlers.forEach(h => {
                handlersCode += 'wv.bind("' + h.name + '", (data?: any) => {\n';
                handlersCode += '    console.log("⚡ RAD Event [' + h.evt + '] on #' + h.ctrlId + ' (' + h.type + '):", data || "");\n';
                if (h.evt === "onChange" || h.evt === "onInput") {
                    handlersCode += '    return { success: true, value: data };\n';
                } else {
                    handlersCode += '    return { success: true, timestamp: Date.now() };\n';
                }
                handlersCode += '});\n\n';
            });
        }

        const appTs = `
import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";

// Initialize Webview Window
const wv = new Webview();
wv.title = "${spec.title || 'Exported App'}";
wv.size = { width: ${spec.width || 800}, height: ${spec.height || 600}, hint: SizeHint.NONE };

// Load HTML UI Spec
const html = readFileSync(join(import.meta.dir, "index.html"), "utf-8");
wv.setHTML(html);

// ==========================================
// 🛠️ RAD BACKEND HELPER UTILITIES
// ==========================================

export function execJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("❌ JS Exec Error:", e); }
}

export function setControlText(controlId: string, text: string) {
    const escaped = JSON.stringify(text);
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.tagName==="SELECT")el.value=\${escaped};else{el.textContent=\${escaped};el.innerText=\${escaped};}}\`);
}

export function setControlValue(controlId: string, value: any) {
    const escaped = JSON.stringify(value);
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if(el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.tagName==="SELECT")el.value=\${escaped};else{el.textContent=\${escaped};el.innerText=\${escaped};if(el.dataset)el.dataset.value=\${escaped};}}\`);
}

export function setControlPlaceholder(controlId: string, placeholder: string) {
    const escaped = JSON.stringify(placeholder);
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("placeholder" in el)el.placeholder=\${escaped};else{const inp=el.querySelector("input, textarea");if(inp)inp.placeholder=\${escaped};}}\`);
}

export function setControlReadOnly(controlId: string, readOnly: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("readOnly" in el)el.readOnly=\${readOnly};else{const inp=el.querySelector("input, textarea");if(inp)inp.readOnly=\${readOnly};}}\`);
}

export function setControlRequired(controlId: string, required: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("required" in el)el.required=\${required};else{const inp=el.querySelector("input, textarea, select");if(inp)inp.required=\${required};}}\`);
}

export function setControlMaxLength(controlId: string, maxLength: number) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("maxLength" in el)el.maxLength=\${maxLength};else{const inp=el.querySelector("input, textarea");if(inp)inp.maxLength=\${maxLength};}}\`);
}

export function setControlEnabled(controlId: string, enabled: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){el.disabled=\${!enabled};el.style.opacity=\${enabled ? "1" : "0.55"};el.style.pointerEvents=\${enabled ? "auto" : "none"};}\`);
}

export function setControlVisible(controlId: string, visible: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){el.style.display=\${visible ? "" : "none"};}\`);
}

export function setSegmentedSelected(controlId: string, itemText: string) {
    const escaped = JSON.stringify(itemText);
    execJS(\`const container=document.getElementById("\${controlId}");if(container){container.querySelectorAll("button").forEach(b=>{const isSel=b.textContent.trim()===\${escaped};b.style.background=isSel?"var(--accent, #38bdf8)":"transparent";b.style.color=isSel?"#ffffff":"inherit";});}\`);
}

export function setStatChart(controlId: string, opts: { title?: string; value?: string; trend?: string }) {
    const title = opts.title !== undefined ? JSON.stringify(opts.title) : "null";
    const value = opts.value !== undefined ? JSON.stringify(opts.value) : "null";
    const trend = opts.trend !== undefined ? JSON.stringify(opts.trend) : "null";
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const tEl=c.querySelector("span");const vEl=c.querySelector("div:nth-child(2)");const trEl=c.querySelectorAll("span")[1];if(tEl&&\${title}!==null)tEl.textContent=\${title};if(vEl&&\${value}!==null)vEl.textContent=\${value};if(trEl&&\${trend}!==null)trEl.textContent=\${trend};}\`);
}

export function setToast(controlId: string, title: string, message?: string, alertType?: string) {
    const tStr = JSON.stringify(title);
    const mStr = message !== undefined ? JSON.stringify(message) : "null";
    const aStr = alertType !== undefined ? JSON.stringify(alertType) : "null";
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const tEl=c.querySelector("span:nth-child(1)");const mEl=c.querySelector("span:nth-child(2)");if(tEl&&\${tStr}!==null)tEl.textContent=\${tStr};if(mEl&&\${mStr}!==null)mEl.textContent=\${mStr};if(\${aStr}!==null){const col=\${aStr}==='error'?'#ef4444':\${aStr}==='warning'?'#f59e0b':'#10b981';c.style.borderLeftColor=col;}}\`);
}

export function setTimePickerValue(controlId: string, timeStr: string) {
    const escaped = JSON.stringify(timeStr);
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const inp=c.querySelector("input[type=time]");if(inp)inp.value=\${escaped};}\`);
}

export function setAccordionOpen(controlId: string, open: boolean) {
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const body=c.querySelector("div:nth-child(2)");const arrow=c.querySelector(".acc-arrow");if(body)body.style.display=\${open ? "'block'" : "'none'"};if(arrow)arrow.textContent=\${open ? "'▼'" : "'▶'"};}\`);
}

export function setTimelineSteps(controlId: string, stepsCSV: string) {
    const escaped = JSON.stringify(stepsCSV);
    execJS(\`const c=document.getElementById("\${controlId}");if(c&&\${escaped}){const steps=\${escaped}.split(",").map(s=>s.trim());c.innerHTML=steps.map((st,i)=>\`<div style="display:flex;align-items:center;gap:10px;font-size:11px;"><div style="width:10px;height:10px;border-radius:50%;background:\\\${i<=1?'var(--accent, #38bdf8)':'rgba(255,255,255,0.2)'};"></div><span>\\\${st}</span></div>\`).join("");}\`);
}

export function setBreadcrumbs(controlId: string, crumbsCSV: string) {
    const escaped = JSON.stringify(crumbsCSV);
    execJS(\`const c=document.getElementById("\${controlId}");if(c&&\${escaped}){const crumbs=\${escaped}.split(",").map(s=>s.trim());c.innerHTML=crumbs.map((cr,i)=>\`\\\${i>0?'<span style="opacity:0.4;">›</span>':''}<span style="\\\${i===crumbs.length-1?'font-weight:700;color:var(--accent,#38bdf8);':'opacity:0.7;'}">\\\${cr}</span>\`).join("");}\`);
}

export function setTreeNodes(controlId: string, nodesCSV: string) {
    const escaped = JSON.stringify(nodesCSV);
    execJS(\`const c=document.getElementById("\${controlId}");if(c&&\${escaped}){const nodes=\${escaped}.split(",").map(s=>s.trim());c.innerHTML=nodes.map((n,i)=>\`<div style="padding-left:\\\${i===0?0:16}px;display:flex;align-items:center;gap:6px;"><span style="opacity:0.6;">\\\${i===0?'▼ 📁':'├─'}</span><span>\\\${n}</span></div>\`).join("");}\`);
}

export function setAvatarGroup(controlId: string, avatarsCSV: string) {
    const escaped = JSON.stringify(avatarsCSV);
    execJS(\`const c=document.getElementById("\${controlId}");if(c&&\${escaped}){const avs=\${escaped}.split(",").map(s=>s.trim());const avCols=['#0284c7','#7c3aed','#059669','#d97706','#dc2626'];c.innerHTML=avs.map((av,i)=>\`<div style="width:32px;height:32px;border-radius:50%;background:\\\${av.startsWith('+')?'rgba(255,255,255,0.2)':avCols[i%avCols.length]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid transparent;margin-left:\\\${i===0?0:-8}px;">\\\${av}</div>\`).join("");}\`);
}

export function setRichSelectText(controlId: string, text: string) {
    const escaped = JSON.stringify(text);
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const span=c.querySelector("span:nth-child(2)");if(span)span.textContent=\${escaped};}\`);
}

export function setTabsActive(controlId: string, tabName: string) {
    const escaped = JSON.stringify(tabName);
    execJS(\`const container=document.getElementById("\${controlId}");if(container){container.dataset.value=\${escaped};container.querySelectorAll("button").forEach(b=>{const isSel=b.textContent.trim()===\${escaped};b.style.borderBottom=isSel?"2px solid var(--accent, #38bdf8)":"none";b.style.color=isSel?"var(--accent, #38bdf8)":"inherit";b.style.fontWeight=isSel?"700":"normal";});}\`);
}

export function setStatusBarText(controlId: string, statusText: string) {
    const escaped = JSON.stringify(statusText);
    execJS(\`const c=document.getElementById("\${controlId}");if(c){const span=c.querySelector("div:nth-child(1) span:nth-child(3)");if(span)span.textContent=\${escaped};}\`);
}

export function setPaginationPage(controlId: string, pageNum: number | string) {
    const pageStr = String(pageNum);
    const escaped = JSON.stringify(pageStr);
    execJS(\`const c=document.getElementById("\${controlId}");if(c){c.querySelectorAll("button").forEach(b=>{if(!isNaN(parseInt(b.textContent.trim()))){const isSel=b.textContent.trim()===\${escaped};b.style.background=isSel?"var(--accent, #38bdf8)":"rgba(255,255,255,0.06)";b.style.color=isSel?"#ffffff":"inherit";b.style.fontWeight=isSel?"700":"normal";}});}\`);
}

export function setToggleButtonState(controlId: string, active: boolean, labelText?: string) {
    const label = labelText !== undefined ? JSON.stringify(labelText) : "null";
    execJS(\`const btn=document.getElementById("\${controlId}");if(btn){btn.dataset.checked="\${active}";btn.style.background=\${active}?"var(--accent, #38bdf8)":"rgba(255,255,255,0.08)";btn.style.color=\${active}?"#ffffff":"inherit";if(\${label}!==null)btn.textContent=\${label};}\`);
}

export function setPropertyGridData(controlId: string, properties: string | Record<string, string>) {
    const raw = typeof properties === 'string' ? properties : Object.entries(properties).map(([k, v]) => \`\${k}: \${v}\`).join(', ');
    const escaped = JSON.stringify(raw);
    execJS(\`if(window.setPropertyGridData)window.setPropertyGridData(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setPopupMenuItems(controlId: string, itemsCSV: string) {
    const escaped = JSON.stringify(itemsCSV);
    execJS(\`if(window.setPopupMenuItems)window.setPopupMenuItems(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setCalendarDate(controlId: string, yearMonthStr: string) {
    const escaped = JSON.stringify(yearMonthStr);
    execJS(\`if(window.setCalendarDate)window.setCalendarDate(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setColorSwatchColor(controlId: string, hexColor: string) {
    const escaped = JSON.stringify(hexColor);
    execJS(\`if(window.setColorSwatchColor)window.setColorSwatchColor(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setFilePathBarPath(controlId: string, pathStr: string) {
    const escaped = JSON.stringify(pathStr);
    execJS(\`if(window.setFilePathBarPath)window.setFilePathBarPath(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setKanbanColumns(controlId: string, columnsData: string) {
    const escaped = JSON.stringify(columnsData);
    execJS(\`if(window.setKanbanColumns)window.setKanbanColumns(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setShortcutRecorderValue(controlId: string, shortcutStr: string) {
    const escaped = JSON.stringify(shortcutStr);
    execJS(\`if(window.setShortcutRecorderValue)window.setShortcutRecorderValue(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setSplitButtonAction(controlId: string, text: string) {
    const escaped = JSON.stringify(text);
    execJS(\`if(window.setSplitButtonAction)window.setSplitButtonAction(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setSparklineTableData(controlId: string, rowsCSV: string) {
    const escaped = JSON.stringify(rowsCSV);
    execJS(\`if(window.setSparklineTableData)window.setSparklineTableData(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setMetricComparison(controlId: string, title: string, curVal: string, targetStr: string, changeStr: string) {
    const opts = JSON.stringify({ title, curVal, targetStr, changeStr });
    execJS(\`if(window.setMetricComparison)window.setMetricComparison(\${JSON.stringify(controlId)}, \${opts});\`);
}

export function setActivityFeedItems(controlId: string, itemsCSV: string) {
    const escaped = JSON.stringify(itemsCSV);
    execJS(\`if(window.setActivityFeedItems)window.setActivityFeedItems(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setWorkspaceTabs(controlId: string, filesCSV: string) {
    const escaped = JSON.stringify(filesCSV);
    execJS(\`if(window.setWorkspaceTabs)window.setWorkspaceTabs(\${JSON.stringify(controlId)}, \${escaped});\`);
}

export function setWindowPosition(pos: "center" | "upper_left" | "upper_right" | "bottom_left" | "bottom_right" | "top_center" | "bottom_center" | "center_left" | "center_right" | { x: number, y: number }) {
    execJS(\`if(window.setWindowPosition)window.setWindowPosition(\${JSON.stringify(pos)});\`);
}

// ==========================================
// 🪟 WINDOW EVENT LIFECYCLE HOOKS
// ==========================================

wv.bind("onFormLoad", () => {
    console.log("⚡ Window Lifecycle [onFormLoad]: Application initialized successfully.");
});

wv.bind("onFormResize", (size?: { width: number, height: number }) => {
    console.log("⚡ Window Lifecycle [onFormResize]: New window dimensions:", size || "");
});

wv.bind("onFormClose", () => {
    console.log("⚡ Window Lifecycle [onFormClose]: Application closing...");
});

wv.bind("backendAlert", (msg: string) => {
    console.log("⚡ Backend Alert:", msg);
});
${handlersCode}
console.log("🚀 Starting Bun RAD Studio App: ${spec.title || 'Exported App'}...");
wv.run();
        `;
        writeFileSync(join(exportDir, "index.ts"), appTs.trim());

        const pkgJson = {
            name: "exported-rad-project",
            version: "1.0.0",
            scripts: {
                start: "bun run index.ts"
            },
            dependencies: {
                "webview-bun": "^2.4.0"
            }
        };
        writeFileSync(join(exportDir, "package.json"), JSON.stringify(pkgJson, null, 2));

        return { success: true, dir: exportDir };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// Only launch main Webview IDE window when run as primary entrypoint (not imported during bun test)
if (import.meta.main) {
    const webview = new Webview();
    webview.setHTML(html);
    webview.title = "Bun RAD Studio (Delphi/VB Style)";
    webview.size = { width: 1400, height: 900, hint: SizeHint.NONE };

    if (process.platform === "darwin" && webview.unsafeWindowHandle) {
        try {
            const libobjc = dlopen("libobjc.dylib", {
                objc_msgSend: { args: [FFIType.pointer, FFIType.pointer, FFIType.u64], returns: FFIType.u64 },
                sel_registerName: { args: [FFIType.cstring], returns: FFIType.pointer }
            });
            const sel_cb = libobjc.symbols.sel_registerName(Buffer.from("collectionBehavior\0"));
            const sel_scb = libobjc.symbols.sel_registerName(Buffer.from("setCollectionBehavior:\0"));
            const cb = BigInt(libobjc.symbols.objc_msgSend(webview.unsafeWindowHandle, sel_cb, 0n));
            libobjc.symbols.objc_msgSend(webview.unsafeWindowHandle, sel_scb, cb | 128n);
        } catch (e) {}
    }

    webview.bind("runPreview", (specJson: string) => {
        try {
            const spec = JSON.parse(specJson);
            const tempDir = join(process.cwd(), ".rad_preview");
            mkdirSync(tempDir, { recursive: true });

            const previewHtml = generatePreviewHtml(spec);
            writeFileSync(join(tempDir, "preview.html"), previewHtml);

            const safeTitle = (spec.title || "Preview").replace(/"/g, '\\"');
            const previewTs = `
import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(import.meta.dir, "preview.html"), "utf-8");
const wv = new Webview();
wv.setHTML(html);
wv.title = "${safeTitle} - Live Preview";
wv.size = { width: ${spec.width || 800}, height: ${spec.height || 600}, hint: SizeHint.NONE };

wv.bind("backendAlert", (msg: string) => {
    console.log("Backend alert:", msg);
});

wv.run();
            `;
            const previewTsPath = join(tempDir, "preview.ts");
            writeFileSync(previewTsPath, previewTs);

            const bunBin = process.execPath || "bun";
            const proc = spawn(bunBin, ["run", previewTsPath], {
                cwd: process.cwd(),
                stdio: "ignore",
                detached: true
            });
            proc.unref();

            return { success: true };
        } catch (err: any) {
            console.error("Preview failed:", err);
            return { success: false, error: err.message };
        }
    });

    webview.bind("quitApp", () => {
        process.exit(0);
    });

    let isAlwaysOnTopState = false;
    webview.bind("setAlwaysOnTop", (onTop?: boolean) => {
        isAlwaysOnTopState = onTop !== undefined ? onTop : !isAlwaysOnTopState;
        setAlwaysOnTopNative(webview, isAlwaysOnTopState);
        return { success: true, onTop: isAlwaysOnTopState };
    });

    webview.bind("toggleNativeFullscreen", () => {
        toggleFullscreenNative(webview);
        return { success: true };
    });

    webview.bind("toggleFullscreen", () => {
        toggleFullscreenNative(webview);
        return { success: true };
    });

    webview.bind("setWindowPosition", (pos: any) => {
        setWindowPositionNative(webview, pos);
        return { success: true, position: pos };
    });

    webview.bind("exportProject", (specJson: string) => {
        return exportProjectHelper(specJson);
    });

    webview.run();
}



export function setStatusBarText(controlId: string, statusText: string) {}
export function setKanbanColumns(controlId: string, columnsData: string) {}
export function setShortcutRecorderValue(controlId: string, shortcutStr: string) {}
export function setSplitButtonAction(controlId: string, text: string) {}
export function setSparklineTableData(controlId: string, rowsCSV: string) {}
export function setMetricComparison(controlId: string, title: string, curVal: string, targetStr: string, changeStr: string) {}
export function setActivityFeedItems(controlId: string, itemsCSV: string) {}
export function setWorkspaceTabs(controlId: string, filesCSV: string) {}

export function generatePreviewHtml(spec: any): string {
    const bg = spec.background_color || '#0f172a';
    const fg = spec.font_color || '#e2e8f0';

    const isLight = bg === '#f8fafc' || bg === '#ffffff' || (bg.startsWith('#') && bg.length >= 7 && (parseInt(bg.slice(1,3), 16)*0.299 + parseInt(bg.slice(3,5), 16)*0.587 + parseInt(bg.slice(5,7), 16)*0.114) > 160);

    let accent = '#38bdf8';
    if (bg === '#000000' || fg === '#00ff00') {
        accent = '#00ff00';
    } else if (bg === '#0d0221' || fg === '#00f6ff') {
        accent = '#00f6ff';
    } else if (isLight) {
        accent = '#0284c7';
    } else if (bg === '#090d16') {
        accent = '#3b82f6';
    }

    const border = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.12)';
    const w = spec.width || 800;
    const h = spec.height || 600;

    const buildEvents = (c: any) => {
        let ev = '';
        const handlers: Record<string, string> = { ...(c.event_handlers || {}) };
        if (c.id) {
            const ctrlType = (c.control_type || c.type || '').toLowerCase();
            const isInputType = ['input', 'search', 'form_search', 'textarea', 'form_textarea', 'select', 'form_dropdown', 'checkbox', 'form_checkbox', 'radio', 'form_radio', 'slider', 'form_slider', 'number', 'form_number', 'date', 'form_date', 'time_picker', 'form_time', 'color', 'form_color', 'form_code', 'form_stepper', 'form_drop_zone', 'tabs', 'pagination', 'toggle_button'].includes(ctrlType);
            if (isInputType) {
                if (!handlers.onChange && !handlers.onchange && !handlers.onClick && !handlers.onclick) {
                    handlers.onChange = `on_${c.id}_change`;
                }
            } else {
                if (!handlers.onClick && !handlers.onclick) {
                    handlers.onClick = `on_${c.id}_click`;
                }
            }
        }
        for (const [evtName, handler] of Object.entries(handlers)) {
            if (!handler || typeof handler !== 'string' || !handler.trim()) continue;
            const clean = (handler as string).trim();
            let attrName = evtName.toLowerCase();
            if (attrName === 'onhover' || attrName === 'onmouseenter') attrName = 'onmouseover';
            if (attrName === 'onhoverexit' || attrName === 'onmouseleave') attrName = 'onmouseout';
            if (attrName === 'ondoubleclick') attrName = 'ondblclick';

            const isFuncName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean);
            let codeToExec = '';
            if (isFuncName) {
                const valExpr = "this.dataset&&this.dataset.page?parseInt(this.dataset.page):(this.value!==undefined?this.value:'')";
                codeToExec = `if(window['${clean}']){window['${clean}'](${valExpr})}else if(window['${clean}']===undefined&&window.backendAlert){window.backendAlert('Event: ${clean}')}`;
            } else {
                codeToExec = clean;
            }

            const safeCode = codeToExec.replace(/"/g, '&quot;');
            ev += ` ${attrName}="try{${safeCode}}catch(e){console.error(e)}"`;
        }
        return ev;
    };

    const getShadowCss = (s?: string, bCol?: string) => {
        if (s === 'subtle') return 'box-shadow:0 2px 4px rgba(0,0,0,0.15);';
        if (s === 'medium') return 'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        if (s === 'deep') return 'box-shadow:0 10px 25px rgba(0,0,0,0.5);';
        if (s === 'glow') return `box-shadow:0 0 15px ${bCol || '#38bdf8'};`;
        return '';
    };

    const base = (c: any, extra = '') => {
        let bw = c.border_width !== undefined && c.border_width !== null && c.border_width !== '' ? `border-width:${c.border_width}px;` : '';
        let bc = c.border_color ? `border-color:${c.border_color};` : '';
        let bs = c.border_style ? `border-style:${c.border_style};` : '';
        let br = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : '';
        let sh = getShadowCss(c.box_shadow, c.border_color || c.font_color);
        let ta = c.text_align ? `text-align:${c.text_align};` : '';
        let op = c.opacity !== undefined && c.opacity !== null && c.opacity !== '' ? `opacity:${c.opacity / 100};` : (c.enabled === false ? 'opacity:0.55;' : '');
        let pe = c.enabled === false ? 'pointer-events:none;' : '';
        let cur = c.cursor ? `cursor:${c.cursor};` : '';
        const posX = c.left !== undefined ? c.left : (c.x !== undefined ? c.x : 0);
        const posY = c.top !== undefined ? c.top : (c.y !== undefined ? c.y : 0);

        let posStyle = `position:absolute;left:${posX}px;top:${posY}px;width:${c.width}px;height:${c.height}px;`;
        if (c.dock === 'bottom' || c.control_type === 'status_bar' || (c.type === 'status_bar')) {
            posStyle = `position:fixed;bottom:0;left:0;right:0;width:100%;height:${c.height || 28}px;z-index:9999;`;
        } else if (c.dock === 'top') {
            posStyle = `position:fixed;top:0;left:0;right:0;width:100%;height:${c.height || 40}px;z-index:9999;`;
        } else if (c.dock === 'fill') {
            posStyle = `position:absolute;top:0;bottom:0;left:0;right:0;width:100%;height:100%;`;
        }

        return `${posStyle}` +
            `font-size:${c.font_size || 13}px;` +
            `box-sizing:border-box;transition:background 0.15s,color 0.15s,filter 0.15s,transform 0.1s;${bw}${bc}${bs}${br}${sh}${ta}${op}${pe}${cur}${extra}`;
    };

    let controls = '';
    let hoverStyles = '';
    for (const c of (spec.controls || [])) {
        if (c.visible === false) continue;
        const t = c.control_type || c.type;
        const text = c.text !== undefined ? c.text : (c.caption !== undefined ? c.caption : (c.title !== undefined ? c.title : ''));
        const color = c.font_color || fg;
        const rawCbg = c.background_color || 'transparent';
        const cbg = c.background_color && c.background_color !== 'transparent'
            ? c.background_color
            : (isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)');
        const ev = buildEvents(c);
        const id = ` id="${c.id}"`;
        const disabled = c.enabled === false ? ' disabled' : '';
        const titleAttr = c.tooltip ? ` title="${c.tooltip.replace(/"/g, '&quot;')}"` : '';
        const roAttr = c.read_only ? ' readonly' : '';
        const reqAttr = c.required ? ' required' : '';
        const maxLenAttr = c.max_length !== undefined && c.max_length !== null && c.max_length !== '' ? ` maxlength="${c.max_length}"` : '';
        const autoFocusAttr = c.auto_focus ? ' autofocus' : '';
        const minAttr = c.min_value !== undefined && c.min_value !== null && c.min_value !== '' ? ` min="${c.min_value}"` : '';
        const maxAttr = c.max_value !== undefined && c.max_value !== null && c.max_value !== '' ? ` max="${c.max_value}"` : '';
        const stepAttr = c.step !== undefined && c.step !== null && c.step !== '' ? ` step="${c.step}"` : '';

        if (c.hover_color || c.hover_text_color) {
            let rules = '';
            if (c.hover_color) rules += `background-color:${c.hover_color} !important;background:${c.hover_color} !important;`;
            if (c.hover_text_color) rules += `color:${c.hover_text_color} !important;`;
            hoverStyles += `#${c.id}:hover { ${rules} }\n#${c.id}:hover input, #${c.id}:hover textarea, #${c.id}:hover select, #${c.id}:hover button { ${rules} }\n`;
        }

        const hasCustomBorder = c.border_width !== undefined || c.border_color || c.border_style;
        const defBorder = hasCustomBorder ? `border-width:${c.border_width || 1}px;border-color:${c.border_color || border};border-style:${c.border_style || 'solid'};` : `border:1px solid ${border};`;
        const defRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:5px;';

        if (t === 'button') {
            const btnBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : '#0284c7';
            const bBorder = hasCustomBorder ? `border-width:${c.border_width || 1}px;border-color:${c.border_color || border};border-style:${c.border_style || 'solid'};` : 'border:none;';
            const bRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const mouseOverFilter = c.hover_color || c.hover_text_color ? '' : ` onmouseover="this.style.filter='brightness(1.2)'" onmouseout="this.style.filter=''"`;
            controls += `<button${id}${titleAttr}${ev}${disabled} style="${base(c)}background:${btnBg};color:${color};${bBorder}${bRadius}cursor:${c.cursor||'pointer'};font-weight:600;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);"${mouseOverFilter} onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''">${text}</button>\n`;
        } else if (t === 'label') {
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}color:${color};display:flex;align-items:center;background:${rawCbg};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${text}</div>\n`;
        } else if (t === 'input' || t === 'search') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} type="${t === 'search' ? 'search' : 'text'}" value="${text}" placeholder="${c.placeholder || ''}" style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;">\n`;
        } else if (t === 'password') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} type="password" value="${text}" placeholder="${c.placeholder || ''}" style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;">\n`;
        } else if (t === 'textarea') {
            controls += `<textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} placeholder="${c.placeholder || ''}" style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:8px;resize:none;outline:none;">${text}</textarea>\n`;
        } else if (t === 'checkbox') {
            const chk = c.checked ? 'checked' : '';
            controls += `<label${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};color:${color};"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="checkbox" ${chk}${disabled}${reqAttr}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${text}</label>\n`;
        } else if (t === 'radio') {
            const chk = c.checked ? 'checked' : '';
            controls += `<label${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};color:${color};"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="radio" ${chk}${disabled}${reqAttr}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${text}</label>\n`;
        } else if (t === 'switch' || t === 'form_switch') {
            const on = c.checked;
            const trackCol = on ? accent : (isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)');
            const thumbX = on ? '22px' : '2px';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:10px;color:${color};cursor:${c.cursor||'pointer'};" onclick="this.querySelector('.sw-track').style.background=this.querySelector('.sw-thumb').style.left==='2px'?'${accent}':'${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}';this.querySelector('.sw-thumb').style.left=this.querySelector('.sw-thumb').style.left==='2px'?'22px':'2px';">${t === 'form_switch' ? `<span>${text}</span>` : ''}<div class="sw-track" style="width:44px;height:24px;background:${trackCol};border-radius:12px;position:relative;flex-shrink:0;transition:background 0.2s;"><div class="sw-thumb" style="position:absolute;left:${thumbX};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.2s;"></div></div>${t !== 'form_switch' ? `<span>${text}</span>` : ''}</div>\n`;
        } else if (t === 'slider' || t === 'form_slider') {
            const val = c.value !== undefined ? c.value : 50;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><${t.startsWith('form') ? `span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><` : ''}input type="range"${minAttr || ' min="0"'}${maxAttr || ' max="100"'}${stepAttr} value="${val}"${ev} style="width:100%;accent-color:${accent};cursor:${c.cursor||'pointer'};"></div>\n`;
        } else if (t === 'number' || t === 'form_number') {
            const val = c.value !== undefined ? c.value : 0;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span>` : ''}<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="number" value="${val}" placeholder="${c.placeholder || ''}"${ev}${roAttr}${reqAttr}${minAttr}${maxAttr}${stepAttr}${autoFocusAttr} style="background:${cbg};color:${color};${defBorder}${defRadius}padding:4px 8px;outline:none;font-size:${c.font_size||13}px;"></div>\n`;
        } else if (t === 'date' || t === 'form_date') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span>` : ''}<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="date"${ev} style="background:${cbg};color:${color};${defBorder}${defRadius}padding:4px 8px;outline:none;font-size:${c.font_size||13}px;color-scheme:${isLight ? 'light' : 'dark'};"></div>\n`;
        } else if (t === 'color') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr} type="color" value="${c.value||'#38bdf8'}"${ev} style="${base(c)}padding:2px;${defBorder}${defRadius}cursor:${c.cursor||'pointer'};background:${rawCbg};">\n`;
        } else if (t === 'progress' || t === 'form_progress') {
            const val = c.value !== undefined ? c.value : 60;
            const progBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;"><span>${text}</span><span>${val}%</span></div>` : ''}<div style="width:100%;height:8px;background:${progBg};border-radius:4px;overflow:hidden;"><div style="width:${val}%;height:100%;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : accent};border-radius:4px;transition:width 0.3s;"></div></div></div>\n`;
        } else if (t === 'circular_progress') {
            const val = c.value !== undefined ? c.value : 75;
            const r = 36; const circ = 2 * Math.PI * r;
            const dash = circ * val / 100;
            const circBg = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 100 100" width="${Math.min(c.width,c.height)}" height="${Math.min(c.width,c.height)}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="${circBg}" stroke-width="10"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${accent}" stroke-width="10" stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}" stroke-dashoffset="${circ*0.25}" stroke-linecap="round" transform="rotate(-90 50 50)"/><text x="50" y="54" text-anchor="middle" font-size="18" fill="${color}" font-weight="bold">${val}%</text></svg></div>\n`;
        } else if (t === 'rating') {
            const val = c.value !== undefined ? c.value : 3;
            const starBg = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
            controls += `<div${id}${titleAttr} data-value="${val}" style="${base(c)}display:flex;align-items:center;gap:4px;font-size:${Math.max(c.height-8,16)}px;">${[1,2,3,4,5].map(i=>`<span style="cursor:pointer;color:${i<=val?'#f59e0b':starBg};transition:color 0.1s;" onclick="const parent=this.parentNode;parent.dataset.value='${i}';parent.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<${i}?'#f59e0b':'${starBg}'});if(window['${c.id}_onChange'])window['${c.id}_onChange'](${i});else if(window['on_${c.id}_change'])window['on_${c.id}_change'](${i});" onmouseover="this.parentNode.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<${i}?'#f59e0b':'${starBg}'})" onmouseout="const cur=parseInt(this.parentNode.dataset.value||'${val}');this.parentNode.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<cur?'#f59e0b':'${starBg}'})">★</span>`).join('')}</div>\n`;
        } else if (t === 'stepper') {
            const val = c.value !== undefined ? c.value : 5;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg};${defBorder}${defRadius}padding:0 6px;color:${color};"><button onclick="const s=this.nextElementSibling;const n=parseInt(s.textContent||'0')-1;s.textContent=n;if(window['${c.id}_onChange'])window['${c.id}_onChange'](n);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](n);" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color='${accent}';" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${accent};font-size:16px;font-weight:bold;cursor:pointer;line-height:1;user-select:none;transition:all 0.15s;">−</button><span style="font-weight:bold;font-size:12px;">${val}</span><button onclick="const s=this.previousElementSibling;const n=parseInt(s.textContent||'0')+1;s.textContent=n;if(window['${c.id}_onChange'])window['${c.id}_onChange'](n);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](n);" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color='${accent}';" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${accent};font-size:16px;font-weight:bold;cursor:pointer;line-height:1;user-select:none;transition:all 0.15s;">+</button></div>\n`;
        } else if (t === 'badge') {
            const badgeBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : '#10b981';
            const bRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:20px;';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${badgeBg};color:${color};${bRadius}display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;">${text}</div>\n`;
        } else if (t === 'image') {
            const imgBorder = hasCustomBorder ? `border-width:${c.border_width || 1}px;border-color:${c.border_color || border};border-style:${c.border_style || 'dashed'};` : `border:1px dashed ${border};`;
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};${imgBorder}${defRadius}display:flex;align-items:center;justify-content:center;color:${color};font-size:11px;">🖼️ ${text||'Image'}</div>\n`;
        } else if (t === 'divider') {
            controls += `<hr${id}${titleAttr} style="${base(c)}height:1px;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : border};border:none;padding:0;margin:0;">\n`;
        } else if (t === 'panel') {
            const panelBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : (isLight ? '#e2e8f0' : '#1e293b');
            const pRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${panelBg};color:${color};${defBorder}${pRadius}overflow:hidden;"><div style="padding:8px 12px;font-weight:700;font-size:11px;text-transform:uppercase;color:${accent};border-bottom:1px solid ${border};letter-spacing:0.5px;">${text}</div></div>\n`;
        } else if (t === 'groupbox') {
            const gbTitle = c.title || c.caption || text || 'Group';
            const gbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<fieldset${id}${titleAttr}${ev} style="${base(c)}background:${cbg};${defBorder}${gbRadius}padding:12px;box-sizing:border-box;"><legend style="padding:0 8px;font-size:11px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:0.5px;">${gbTitle}</legend></fieldset>\n`;
        } else if (t === 'drop_zone') {
            const dzBorder = hasCustomBorder ? `border-width:${c.border_width || 2}px;border-color:${c.border_color || accent};border-style:${c.border_style || 'dashed'};` : `border:2px dashed ${accent};`;
            const dzRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};${dzBorder}${dzRadius}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:${color};opacity:0.85;cursor:${c.cursor||'pointer'};" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter=''"><span style="font-size:24px;">📥</span><span style="font-size:11px;">${text||'Drop files here'}</span></div>\n`;
        } else if (t === 'status_indicator') {
            const statusColor = c.status === 'error' ? '#ef4444' : c.status === 'warning' ? '#f59e0b' : c.status === 'inactive' ? (isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)') : '#10b981';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;color:${color};"><div style="width:10px;height:10px;background:${statusColor};border-radius:50%;box-shadow:0 0 6px ${statusColor};flex-shrink:0;"></div><span style="font-size:12px;font-weight:600;">${text}</span></div>\n`;
        } else if (t === 'metric_card') {
            const mRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg};${defBorder}${mRadius}padding:12px;display:flex;flex-direction:column;justify-content:space-between;"><div style="font-size:10px;color:${color};opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">${text}</div><div style="font-size:22px;font-weight:800;color:${color};">${c.value||'—'}</div><div style="font-size:10px;color:#10b981;">↑ ${c.trend||'0%'}</div></div>\n`;
        } else if (t === 'alert_banner') {
            const alertCol = c.alert_type === 'error' ? '#ef4444' : c.alert_type === 'warning' ? '#f59e0b' : c.alert_type === 'success' ? '#10b981' : accent;
            const alertIcon = c.alert_type === 'error' ? '❌' : c.alert_type === 'warning' ? '⚠️' : c.alert_type === 'success' ? '✅' : 'ℹ️';
            const aRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:0 6px 6px 0;';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : alertCol + '22'};border-left:4px solid ${alertCol};${aRadius}display:flex;align-items:center;gap:10px;padding:0 12px;color:${color};"><span>${alertIcon}</span><span style="font-size:12px;">${text}</span></div>\n`;
        } else if (t === 'code_view') {
            const codeBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : '#0d1117';
            const codeFg = c.font_color && c.font_color !== fg ? c.font_color : '#7dd3fc';
            const cdRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<textarea${id}${titleAttr}${ev}${roAttr}${autoFocusAttr} placeholder="${c.placeholder || ''}" style="${base(c)}background:${codeBg};${defBorder}${cdRadius}padding:12px;color:${codeFg};font-family:'Fira Code','Courier New',monospace;font-size:${c.font_size||12}px;overflow:auto;margin:0;resize:none;outline:none;white-space:pre;" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'>${text}</textarea>\n`;
        } else if (t === 'metric_meter') {
            const val = c.value !== undefined ? c.value : 65;
            const meterBg = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;"><span>${text}</span><span>${val}%</span></div><div style="width:100%;height:6px;background:${meterBg};border-radius:3px;overflow:hidden;"><div style="width:${val}%;height:100%;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : `linear-gradient(to right, ${accent}, #818cf8)`};border-radius:3px;"></div></div></div>\n`;
        } else if (t === 'tag') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 8px;">${(text||'tag1,tag2').split(',').map((tg: string)=>`<span style="background:${cbg};color:${accent};${defBorder}${defRadius}padding:2px 10px;font-size:11px;font-weight:600;">${tg.trim()}</span>`).join('')}</div>\n`;
        } else if (t === 'form_field' || t === 'form_password' || t === 'form_textarea') {
            const inputType = t === 'form_password' ? 'password' : (t === 'form_textarea' ? 'textarea' : 'text');
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;"><label style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</label>${inputType === 'textarea' ? `<textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${ev}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} placeholder="${c.placeholder || ''}" style="flex:1;background:${cbg};color:${color};${defBorder}${defRadius}padding:6px 10px;resize:none;outline:none;font-size:${c.font_size||13}px;"></textarea>` : `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="${inputType}"${ev}${roAttr}${reqAttr}${maxLenAttr}${autoFocusAttr} placeholder="${c.placeholder || ''}" style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;font-size:${c.font_size||13}px;">`}</div>\n`;
        } else if (t === 'form_dropdown') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;"><label style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</label><select${ev}${reqAttr} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 8px;outline:none;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><option>Option 1</option><option>Option 2</option><option>Option 3</option></select></div>\n`;
        } else if (t === 'form_link') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;justify-content:space-between;align-items:center;color:${color};"><span style="font-size:11px;opacity:0.8;">${text}</span><a href="#"${ev} style="color:${accent};text-decoration:none;font-size:11px;font-weight:700;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">View Link 🔗</a></div>\n`;
        } else if (t === 'path') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;background:${cbg};${defBorder}${defRadius}padding:0 10px;color:${color};font-size:11px;overflow:hidden;">📁 ${(text||'Users › developer › project').replace(/›/g,'<span style="opacity:0.4;margin:0 4px;">›</span>')}</div>\n`;
        } else if (t === 'db_grid') {
            const gridBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : (isLight ? '#ffffff' : 'rgba(15,23,42,0.8)');
            const dbBorder = hasCustomBorder ? `border-width:${c.border_width || 1}px;border-color:${c.border_color || accent};border-style:${c.border_style || 'solid'};` : `border:1px solid ${accent};`;
            const dbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<div${id}${titleAttr} style="${base(c)}overflow:auto;${dbBorder}${dbRadius}background:${gridBg};box-shadow:0 4px 12px rgba(0,0,0,0.3);"><div style="padding:6px 12px;background:${isLight ? 'rgba(2,132,199,0.1)' : 'rgba(56,189,248,0.1)'};font-size:11px;font-weight:700;color:${accent};border-bottom:1px solid ${border};display:flex;justify-content:space-between;"><span>🗄️ ${text||'DBGrid: Dataset1'}</span><span>3 Records</span></div><table style="width:100%;border-collapse:collapse;font-size:11px;color:${color};"><thead><tr style="background:${cbg};">${['ID','Customer Name','Email','Balance'].map(h=>`<th style="padding:6px 10px;text-align:left;font-weight:700;color:${accent};border-bottom:1px solid ${border};">${h}</th>`).join('')}</tr></thead><tbody>${[['101','Acme Corp','sales@acme.com','$12,450'],['102','Starlight Ltd','info@starlight.io','$8,900'],['103','Nexus Tech','contact@nexus.dev','$15,200']].map(r=>`<tr style="border-bottom:1px solid ${border};" onmouseover="this.style.background='${isLight ? 'rgba(2,132,199,0.08)' : 'rgba(56,189,248,0.08)'}'" onmouseout="this.style.background=''">${r.map(cell=>`<td style="padding:6px 10px;">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>\n`;
        } else if (t === 'db_navigator') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg};${defBorder}${defRadius}padding:2px;gap:2px;">${[['⏮','First'],['◀','Prev'],['▶','Next'],['⏭','Last'],['➕','Add'],['✖','Delete'],['💾','Post'],['🔄','Refresh']].map(b=>`<button title="${b[1]}" style="flex:1;height:100%;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'};border:none;border-radius:4px;color:${color};font-size:12px;cursor:pointer;" onmouseover="this.style.background='${isLight ? 'rgba(2,132,199,0.2)' : 'rgba(56,189,248,0.2)'}'" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'}'">${b[0]}</button>`).join('')}</div>\n`;
        } else if (t === 'db_input') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:3px;"><label style="font-size:10px;font-weight:700;color:${accent};">🗄️ ${text||'DBField'}</label><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" value="Sample Record Data" placeholder="${c.placeholder || ''}"${ev}${roAttr}${reqAttr}${maxLenAttr} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;font-size:${c.font_size||13}px;"></div>\n`;
        } else if (t === 'db_dropdown') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:3px;"><label style="font-size:10px;font-weight:700;color:${accent};">🗄️ ${text||'DBLookup'}</label><select${ev} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 8px;outline:none;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><option>Acme Corp</option><option>Starlight Ltd</option><option>Nexus Tech</option></select></div>\n`;
        } else if (t === 'open_dialog') {
            controls += `<input type="file"${id}${ev} style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;if(window['${c.id}_onSelect'])window['${c.id}_onSelect'](p);else if(window.backendAlert)window.backendAlert('File Selected: '+p);}">\n`;
        } else if (t === 'save_dialog') {
            controls += `<input type="file"${id}${ev} style="display:none;">\n`;
        } else if (t === 'table') {
            const rawHeaders = c.columns || c.headers || ['ID', 'Name', 'Value', 'Status'];
            const headers = Array.isArray(rawHeaders) ? rawHeaders : String(rawHeaders).split(',').map(s => s.trim());
            const rawRows = c.rows || c.data || c.dataset || [
                ['#1', 'Item 1', '100', 'Active'],
                ['#2', 'Item 2', '200', 'Active'],
                ['#3', 'Item 3', '300', 'Active']
            ];
            const tableBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : cbg;
            const selBg = isLight ? 'rgba(2,132,199,0.18)' : 'rgba(56,189,248,0.22)';
            const hoverBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
            controls += `<div${id}${titleAttr} style="${base(c)}overflow:auto;${defBorder}${defRadius}background:${tableBg};"><table style="width:100%;border-collapse:collapse;font-size:12px;color:${color};"><thead><tr style="background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};">${headers.map((h: any)=>`<th style="padding:8px 12px;text-align:left;font-weight:700;color:${accent};border-bottom:1px solid ${border};">${h}</th>`).join('')}</tr></thead><tbody>${rawRows.map((r: any)=>{
                const cells = Array.isArray(r) ? r : Object.values(r);
                return `<tr style="border-bottom:1px solid ${border};cursor:pointer;transition:background 0.12s;" onclick="const tbody=this.closest('tbody');if(tbody){tbody.querySelectorAll('tr').forEach(tr=>{tr.classList.remove('selected-tr');tr.style.background=''});this.classList.add('selected-tr');this.style.background='${selBg}';window.selectedRowElement=this;if(window.onTableRowClick)window.onTableRowClick(this);}" onmouseover="if(!this.classList.contains('selected-tr'))this.style.background='${hoverBg}'" onmouseout="if(!this.classList.contains('selected-tr'))this.style.background=''">${cells.map((cell: any)=>`<td style="padding:8px 12px;">${cell}</td>`).join('')}</tr>`;
            }).join('')}</tbody></table></div>\n`;
        } else if (t === 'segmented_control') {
            const items = (text || 'Overview, Analytics, Reports').split(',').map((s: string) => s.trim());
            const sel = c.value || items[0] || '';
            const segBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
            const segRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const activeBg = c.background_color && c.background_color !== 'transparent' ? c.background_color : accent;
            controls += `<div${id}${titleAttr}${ev} data-value="${sel}" style="${base(c)}display:flex;align-items:center;background:${cbg !== 'transparent' ? cbg : segBg};padding:3px;${defBorder}${segRadius}gap:3px;">${items.map((item: string) => {
                const isSel = item === sel;
                const itemBg = isSel ? activeBg : 'transparent';
                const itemFg = isSel ? '#ffffff' : color;
                return `<button onclick="this.parentNode.querySelectorAll('button').forEach(b=>{b.style.background='transparent';b.style.color='${color}'});this.style.background='${activeBg}';this.style.color='#ffffff';this.parentNode.dataset.value='${item}';if(window['${c.id}_onChange'])window['${c.id}_onChange']('${item}');else if(window['on_${c.id}_change'])window['on_${c.id}_change']('${item}');" style="flex:1;height:100%;border:none;border-radius:6px;background:${itemBg};color:${itemFg};font-weight:600;font-size:11px;cursor:${c.cursor||'pointer'};transition:all 0.15s;">${item}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'tree_view') {
            const rawNodes = (text || '📂 Project Root, 📂 src, 📄 index.ts, 📄 styles.css, 📁 assets, 🖼️ logo.png').split(',').map((n: string) => n.trim());
            const treeBg = cbg;
            const selBg = isLight ? 'rgba(2,132,199,0.15)' : 'rgba(56,189,248,0.2)';
            controls += `<div${id}${titleAttr}${ev} class="rad-tree-container" data-selected="" style="${base(c)}background:${treeBg};${defBorder}${defRadius}padding:6px 8px;overflow:auto;display:flex;flex-direction:column;gap:2px;font-size:12px;color:${color};">${rawNodes.map((nodeText: string, idx: number) => {
                const isFolder = nodeText.includes('📁') || nodeText.includes('Project Root') || nodeText.includes('src') || nodeText.includes('assets') || idx === 0;
                const indent = idx === 0 ? 0 : (idx === 1 || idx === 4 ? 16 : 32);
                const arrowIcon = isFolder ? '▼' : ' ';
                const cleanName = nodeText;
                return `<div class="tree-node${idx===0?' selected-tree-node':''}" data-node="${cleanName}" style="padding:4px 8px;padding-left:${indent + 8}px;border-radius:4px;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;transition:background 0.12s;${idx===0 ? `background:${selBg};color:${accent};font-weight:600;` : ''}" onclick="event.stopPropagation();const container=this.closest('.rad-tree-container');container.querySelectorAll('.tree-node').forEach(n=>{n.style.background='transparent';n.style.color='${color}';n.style.fontWeight='normal';});this.style.background='${selBg}';this.style.color='${accent}';this.style.fontWeight='600';container.dataset.selected=this.dataset.node;if(window['${c.id}_onSelect'])window['${c.id}_onSelect'](this.dataset.node);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](this.dataset.node);if(window['${c.id}_onNodeClick'])window['${c.id}_onNodeClick'](this.dataset.node);" onmouseover="if(!this.style.background.includes('rgba')){this.style.background='${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'}'}" onmouseout="if(!this.style.background.includes('rgba(56')&&!this.style.background.includes('rgba(2,132')){this.style.background='transparent';}"><span class="tree-arrow" onclick="event.stopPropagation();const isCollapsed=this.textContent==='▶';this.textContent=isCollapsed?'▼':'▶';let curr=this.closest('.tree-node').nextElementSibling;while(curr){const currIndent=parseInt(curr.style.paddingLeft||'0');if(currIndent<=${indent + 8})break;curr.style.display=isCollapsed?'flex':'none';curr=curr.nextElementSibling;}" style="width:12px;font-size:9px;opacity:0.7;display:inline-block;cursor:pointer;">${arrowIcon}</span><span>${cleanName}</span></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'avatar_group') {
            const avatars = (text || 'JD, AS, MK, +3').split(',').map((a: string) => a.trim());
            const avColors = ['#0284c7', '#7c3aed', '#059669', '#d97706', '#dc2626'];
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;padding:0 4px;">${avatars.map((av: string, i: number) => {
                const bgCol = av.startsWith('+') ? (isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.2)') : avColors[i % avColors.length];
                return `<div style="width:32px;height:32px;border-radius:50%;background:${bgCol};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid ${bg};margin-left:${i === 0 ? '0' : '-8px'};box-shadow:0 2px 4px rgba(0,0,0,0.2);flex-shrink:0;" title="${av}">${av}</div>`;
            }).join('')}</div>\n`;
        } else if (t === 'stat_chart') {
            const val = c.value !== undefined ? c.value : '$48,290';
            const trend = c.trend || '+18.4%';
            const scRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg};${defBorder}${scRadius}padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:10px;font-weight:700;color:${color};opacity:0.7;text-transform:uppercase;">${text||'Monthly Revenue'}</span><span style="font-size:10px;font-weight:700;color:#10b981;background:rgba(16,185,129,0.15);padding:2px 6px;border-radius:4px;">${trend}</span></div><div style="font-size:20px;font-weight:800;color:${color};">${val}</div><svg viewBox="0 0 100 24" style="width:100%;height:24px;overflow:visible;"><path d="M0 20 L20 14 L40 17 L60 8 L80 12 L100 2" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/><path d="M0 20 L20 14 L40 17 L60 8 L80 12 L100 2 L100 24 L0 24 Z" fill="${accent}" opacity="0.15"/></svg></div>\n`;
        } else if (t === 'accordion') {
            const accRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg};${defBorder}${accRadius}overflow:hidden;display:flex;flex-direction:column;"><div onclick="const body=this.nextElementSibling;const arrow=this.querySelector('.acc-arrow');if(body.style.display==='none'){body.style.display='block';arrow.textContent='▼';}else{body.style.display='none';arrow.textContent='▶';}" style="padding:8px 12px;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};font-weight:700;font-size:12px;color:${color};display:flex;justify-content:space-between;align-items:center;cursor:pointer;"><span>${text||'Accordion Section'}</span><span class="acc-arrow" style="font-size:10px;opacity:0.7;">▼</span></div><div style="padding:10px 12px;font-size:11px;color:${color};opacity:0.85;border-top:1px solid ${border};">${c.placeholder||'Collapsible accordion content panel details.'}</div></div>\n`;
        } else if (t === 'breadcrumb') {
            const crumbs = (text || 'Home, Projects, App Settings').split(',').map((cr: string) => cr.trim());
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;gap:6px;font-size:11px;color:${color};">${crumbs.map((crumb: string, i: number) => {
                const isLast = i === crumbs.length - 1;
                const colStyle = isLast ? `font-weight:700;color:${accent};` : `opacity:0.7;cursor:pointer;`;
                return `${i > 0 ? `<span style="opacity:0.4;">›</span>` : ''}<span style="${colStyle}">${crumb}</span>`;
            }).join('')}</div>\n`;
        } else if (t === 'timeline') {
            const steps = (text || 'Order Placed, Payment Verified, In Transit, Delivered').split(',').map((st: string) => st.trim());
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:8px;padding:6px 8px;">${steps.map((step: string, i: number) => {
                const active = i <= 1;
                const nodeCol = active ? accent : (isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)');
                return `<div style="display:flex;align-items:center;gap:10px;font-size:11px;color:${color};"><div style="width:10px;height:10px;border-radius:50%;background:${nodeCol};box-shadow:${active ? `0 0 6px ${accent}` : 'none'};flex-shrink:0;"></div><span style="font-weight:${active ? '700' : 'normal'};opacity:${active ? '1' : '0.6'};">${step}</span></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'toast_card') {
            const tCol = c.alert_type === 'error' ? '#ef4444' : c.alert_type === 'warning' ? '#f59e0b' : c.alert_type === 'info' ? accent : '#10b981';
            const tIcon = c.alert_type === 'error' ? '❌' : c.alert_type === 'warning' ? '⚠️' : c.alert_type === 'info' ? 'ℹ️' : '✅';
            const tRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};border-left:4px solid ${tCol};${defBorder}${tRadius}padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;box-shadow:0 4px 14px rgba(0,0,0,0.25);"><div style="display:flex;align-items:center;gap:10px;"><span style="font-size:16px;">${tIcon}</span><div style="display:flex;flex-direction:column;"><span style="font-weight:700;font-size:12px;color:${color};">${text||'Notification'}</span><span style="font-size:10px;color:${color};opacity:0.7;">${c.placeholder||'Action performed successfully.'}</span></div></div><button onclick="this.parentNode.style.display='none'" style="background:none;border:none;color:${color};opacity:0.5;cursor:pointer;font-size:14px;">✕</button></div>\n`;
        } else if (t === 'time_picker') {
            const val = c.value || '09:30';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;gap:8px;background:${cbg};${defBorder}${defRadius}padding:0 10px;color:${color};"><span style="font-size:14px;opacity:0.7;">🕒</span><input type="time" value="${val}" style="background:none;border:none;color:inherit;font-family:inherit;font-size:${c.font_size||13}px;outline:none;width:100%;color-scheme:${isLight ? 'light' : 'dark'};"></div>\n`;
        } else if (t === 'rich_select') {
            const optList = c.options || 'React.js, Vue.js, Angular, Svelte, Next.js, Bun RAD Studio, TypeScript';
            controls += `<div${id}${titleAttr}${ev} class="rad-rich-select" style="${base(c)}background:${cbg};${defBorder}${defRadius}display:flex;align-items:center;gap:6px;padding:0 8px;color:${color};"><span style="opacity:0.6;font-size:13px;flex-shrink:0;">🔍</span><input type="text" value="${text || ''}" placeholder="${c.placeholder || 'Type to search options...'}" style="flex:1;background:none;border:none;color:inherit;font-family:inherit;font-size:${c.font_size||12}px;outline:none;width:100%;" oninput="const val=this.value.toLowerCase();const dropdown=this.parentNode.querySelector('.rich-select-dropdown');if(dropdown){dropdown.style.display='block';dropdown.querySelectorAll('.rich-select-option').forEach(opt=>{opt.style.display=opt.textContent.toLowerCase().includes(val)?'block':'none';});}if(window['${c.id}_onChange'])window['${c.id}_onChange'](this.value);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](this.value);" onfocus="const dropdown=this.parentNode.querySelector('.rich-select-dropdown');if(dropdown)dropdown.style.display='block';" onblur="setTimeout(()=>{const dropdown=this.parentNode.querySelector('.rich-select-dropdown');if(dropdown)dropdown.style.display='none';},200)"><span style="font-size:10px;opacity:0.5;cursor:pointer;flex-shrink:0;" onclick="const input=this.parentNode.querySelector('input');input.focus();">▼</span><div class="rich-select-dropdown" style="display:none;position:absolute;left:0;top:100%;width:100%;max-height:160px;overflow-y:auto;background:${isLight?'#ffffff':'#1e293b'};border:1px solid ${border};border-radius:6px;margin-top:4px;box-shadow:0 6px 16px rgba(0,0,0,0.3);z-index:999;">${optList.split(',').map((opt: string) => { const clean = opt.trim(); return `<div class="rich-select-option" style="padding:6px 10px;font-size:11px;cursor:pointer;color:${color};" onmouseover="this.style.background='${isLight?'rgba(2,132,199,0.1)':'rgba(56,189,248,0.15)'}'" onmouseout="this.style.background='transparent'" onmousedown="event.preventDefault()" onclick="const input=this.closest('.rad-rich-select').querySelector('input');input.value='${clean}';this.parentNode.style.display='none';if(window['${c.id}_onChange'])window['${c.id}_onChange']('${clean}');else if(window['on_${c.id}_change'])window['on_${c.id}_change']('${clean}');">${clean}</div>`; }).join('')}</div></div>\n`;
        } else if (t === 'property_grid') {
            const rawProps = text || 'Theme: Dark, Font Size: 13px, Auto Save: True, Version: 1.4.0';
            const propsList = rawProps.split(',').map((s: string) => s.trim().split(':')).filter((arr: string[]) => arr.length === 2);
            const pgRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${pgRadius}display:flex;flex-direction:column;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.2);"><div style="padding:6px 10px;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};font-weight:700;font-size:11px;color:${accent};border-bottom:1px solid ${border};display:flex;align-items:center;gap:6px;"><span>📋</span><span>${c.caption || 'Property Inspector'}</span></div><div class="prop-grid-body" style="display:flex;flex-direction:column;overflow-y:auto;flex:1;">${propsList.map((pair: string[]) => {
                const k = pair[0].trim(); const v = pair[1].trim();
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-bottom:1px solid ${border};font-size:11px;" onmouseover="this.style.background='${isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'}'" onmouseout="this.style.background=''"><span style="font-weight:600;color:${color};opacity:0.85;">${k}</span><span style="font-size:11px;color:${accent};font-weight:600;font-family:monospace;">${v}</span></div>`;
            }).join('')}</div></div>\n`;
        } else if (t === 'popup_menu') {
            const rawItems = text || '✂️ Cut  ⌘X, 📋 Copy  ⌘C, 📄 Paste  ⌘V, ---, 🗑️ Delete  ⌫';
            const items = rawItems.split(',').map((s: string) => s.trim());
            const pmRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            controls += `<div${id}${titleAttr}${ev} class="rad-popup-menu" style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${pmRadius}padding:6px;display:flex;flex-direction:column;gap:2px;box-shadow:0 10px 25px rgba(0,0,0,0.4);">${items.map((it: string) => {
                if (it === '---') return `<div style="height:1px;background:${border};margin:4px 0;"></div>`;
                const parts = it.split(/\s{2,}/);
                const label = parts[0] || it;
                const shortcut = parts[1] || '';
                return `<div class="popup-item" style="padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:${color};cursor:pointer;transition:background 0.12s;" onmouseover="this.style.background='${isLight ? 'rgba(2,132,199,0.12)' : 'rgba(56,189,248,0.18)'}'" onmouseout="this.style.background=''" onclick="if(window['${c.id}_onClick'])window['${c.id}_onClick']('${label}');else if(window['on_${c.id}_click'])window['on_${c.id}_click']('${label}');"><span>${label}</span>${shortcut ? `<span style="font-size:10px;opacity:0.5;font-family:monospace;">${shortcut}</span>` : ''}</div>`;
            }).join('')}</div>\n`;
        } else if (t === 'calendar_view') {
            const calRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:12px;';
            const calBg = cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b');
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${calBg};${defBorder}${calRadius}padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 4px 14px rgba(0,0,0,0.25);"><div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:12px;color:${color};border-bottom:1px solid ${border};padding-bottom:6px;"><button style="background:none;border:none;color:inherit;cursor:pointer;font-size:12px;opacity:0.7;" onclick="if(window['${c.id}_onPrev'])window['${c.id}_onPrev']();">◄</button><span>${text || 'July 2026'}</span><button style="background:none;border:none;color:inherit;cursor:pointer;font-size:12px;opacity:0.7;" onclick="if(window['${c.id}_onNext'])window['${c.id}_onNext']();">►</button></div><div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:10px;font-weight:700;color:${accent};margin-top:6px;opacity:0.8;"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div><div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:11px;color:${color};gap:2px;margin-top:4px;">${[28,29,30,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28].slice(0,21).map((d: number, idx: number) => {
                const isCurMonth = idx >= 3;
                const isSelected = d === 25;
                const bgStyle = isSelected ? `background:${accent};color:#ffffff;font-weight:700;border-radius:50%;` : '';
                return `<span style="padding:4px 0;opacity:${isCurMonth ? (isSelected ? 1 : 0.9) : 0.35};cursor:pointer;${bgStyle}" onclick="if(window['${c.id}_onChange'])window['${c.id}_onChange'](${d});else if(window['on_${c.id}_change'])window['on_${c.id}_change'](${d});">${d}</span>`;
            }).join('')}</div></div>\n`;
        } else if (t === 'color_swatch') {
            const colorsList = (text || '#0284c7, #38bdf8, #10b981, #f59e0b, #ef4444, #7c3aed, #ec4899').split(',').map((s: string) => s.trim());
            const curCol = c.value || colorsList[0] || '#0284c7';
            controls += `<div${id}${titleAttr}${ev} data-value="${curCol}" style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:6px;padding:4px;"><span style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${c.caption || 'Color Palette Swatch'}</span><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${colorsList.map((hex: string) => {
                const isSel = hex.toLowerCase() === curCol.toLowerCase();
                return `<div class="swatch-chip" data-color="${hex}" style="width:24px;height:24px;border-radius:50%;background:${hex};cursor:pointer;transition:transform 0.15s, box-shadow 0.15s;box-shadow:${isSel ? `0 0 0 3px ${isLight ? '#ffffff' : '#0f172a'}, 0 0 0 5px ${hex}` : '0 2px 6px rgba(0,0,0,0.3)'};transform:${isSel ? 'scale(1.15)' : 'scale(1)'};" onclick="this.parentNode.querySelectorAll('.swatch-chip').forEach(s=>{s.style.transform='scale(1)';s.style.boxShadow='0 2px 6px rgba(0,0,0,0.3)';});this.style.transform='scale(1.15)';this.style.boxShadow='0 0 0 3px ${isLight ? '#ffffff' : '#0f172a'}, 0 0 0 5px ${hex}';this.parentNode.parentNode.dataset.value='${hex}';if(window['${c.id}_onChange'])window['${c.id}_onChange']('${hex}');else if(window['on_${c.id}_change'])window['on_${c.id}_change']('${hex}');"></div>`;
            }).join('')}</div></div>\n`;
        } else if (t === 'file_path_bar') {
            const pathVal = text || '/Users/codecaine/bun_rad_studio/src';
            const fRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${fRadius}padding:0 8px;gap:8px;box-shadow:0 2px 6px rgba(0,0,0,0.15);color:${color};"><div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;"><span style="font-size:14px;opacity:0.75;flex-shrink:0;">📁</span><span class="path-text" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:0.9;font-family:monospace;">${pathVal}</span></div><button onclick="if(window['${c.id}_onClick'])window['${c.id}_onClick']('${pathVal}');else if(window['on_${c.id}_click'])window['on_${c.id}_click']('${pathVal}');" style="padding:4px 10px;background:${accent};color:#ffffff;border:none;border-radius:4px;font-size:10px;font-weight:700;cursor:pointer;flex-shrink:0;transition:filter 0.15s;" onmouseover="this.style.filter='brightness(1.15)'" onmouseout="this.style.filter=''">Browse...</button></div>\n`;
        } else if (t === 'kanban_board') {
            const rawCols = text || 'To Do (3) | In Progress (2) | Done (4)';
            const cols = rawCols.split('|').map((s: string) => s.trim());
            const kbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            const sampleCards = [
                ['● Design Specs', '● IPC Handlers', '● State Sync'],
                ['● HTML Generator', '● UI Canvas'],
                ['● Unit Tests', '● API Docs', '● Themes', '● Exporter']
            ];
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#f8fafc' : '#0f172a')};${defBorder}${kbRadius}padding:8px;display:flex;gap:8px;box-shadow:0 4px 14px rgba(0,0,0,0.25);overflow-x:auto;">${cols.map((colStr: string, idx: number) => {
                const cards = sampleCards[idx % sampleCards.length];
                return `<div style="flex:1;min-width:90px;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'};border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:6px;"><div style="font-size:10px;font-weight:700;color:${accent};border-bottom:1px solid ${border};padding-bottom:4px;display:flex;justify-content:space-between;align-items:center;"><span>${colStr}</span></div><div style="display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto;">${cards.map((card: string) => `<div onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${card.replace(/'/g, "\\'")}');" style="background:${isLight ? '#ffffff' : '#1e293b'};border:1px solid ${border};border-radius:4px;padding:4px 6px;font-size:10px;color:${color};font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.1);cursor:pointer;">${card}</div>`).join('')}</div></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'shortcut_recorder') {
            const scVal = text || c.value || '⌘ Shift P';
            const keys = scVal.split(/\s+|\+|\-/).filter(Boolean);
            const srRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${srRadius}padding:0 8px;gap:6px;box-shadow:0 2px 6px rgba(0,0,0,0.15);color:${color};cursor:pointer;" onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${scVal}');"><div style="display:flex;align-items:center;gap:4px;">${keys.map((k: string) => `<kbd class="rad-mono" style="background:${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'};border:1px solid ${border};border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;color:${accent};">${k}</kbd>`).join('')}</div><span style="font-size:10px;opacity:0.5;">⌨️ Edit</span></div>\n`;
        } else if (t === 'split_button') {
            const mainText = text || 'Save Changes';
            const sbRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            const customMenuHandler = c.event_handlers?.onMenu || c.event_handlers?.onmenu || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:inline-flex;align-items:stretch;background:${cbg !== 'transparent' ? cbg : accent};${defBorder}${sbRadius}overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.2);"><button onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${mainText}');" style="flex:1;padding:0 12px;background:none;border:none;color:#ffffff;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;">${mainText}</button><div style="width:1px;background:rgba(255,255,255,0.25);"></div><button onclick="const fn=window['${customMenuHandler}']||window['${c.id}_onMenu']||window['on_${c.id}_menu'];if(fn)fn();" style="padding:0 8px;background:none;border:none;color:#ffffff;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">▼</button></div>\n`;
        } else if (t === 'sparkline_table') {
            const rawRows = text || 'Revenue: $48k [↗], Active Users: 1.2k [→], Errors: 0.01% [↘]';
            const rows = rawRows.split(',').map((s: string) => s.trim());
            const stRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:8px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${stRadius}padding:6px 10px;display:flex;flex-direction:column;justify-content:space-around;box-shadow:0 4px 12px rgba(0,0,0,0.2);color:${color};">${rows.map((row: string, i: number) => {
                const parts = row.split(':');
                const label = parts[0] || 'Metric';
                const val = parts[1] || '$10k';
                const isUp = i % 3 === 0; const isFlat = i % 3 === 1;
                const sparkColor = isUp ? '#10b981' : isFlat ? accent : '#ef4444';
                const points = isUp ? '0,14 10,12 20,8 30,10 40,4 50,2' : isFlat ? '0,8 10,10 20,7 30,9 40,8 50,8' : '0,2 10,5 20,8 30,6 40,12 50,14';
                return `<div onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${label.replace(/'/g, "\\'")}');" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:${i < rows.length - 1 ? `1px solid ${border}` : 'none'};cursor:pointer;"><span style="font-weight:600;opacity:0.85;">${label}</span><div style="display:flex;align-items:center;gap:8px;"><svg width="50" height="16" style="overflow:visible;"><polyline fill="none" stroke="${sparkColor}" stroke-width="2" points="${points}" /></svg><span class="rad-mono" style="font-weight:700;color:${sparkColor};">${val}</span></div></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'metric_comparison') {
            const mTitle = text || 'Monthly Recurring Revenue';
            const mVal = c.value || '$84,250';
            const targetStr = c.placeholder || 'vs $75,000 target';
            const mcRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${mcRadius}padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 4px 14px rgba(0,0,0,0.25);color:${color};cursor:pointer;" onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${mTitle.replace(/'/g, "\\'")}');"><div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:700;opacity:0.8;"><span>${mTitle}</span><span style="background:rgba(16,185,129,0.15);color:#10b981;padding:2px 6px;border-radius:4px;font-weight:bold;">▲ +12.3%</span></div><div style="display:flex;align-items:baseline;gap:8px;margin:4px 0;"><span style="font-size:20px;font-weight:800;color:${accent};">${mVal}</span><span style="font-size:10px;opacity:0.6;">${targetStr}</span></div><div style="width:100%;height:4px;background:${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'};border-radius:2px;overflow:hidden;"><div style="width:82%;height:100%;background:#10b981;"></div></div></div>\n`;
        } else if (t === 'activity_feed') {
            const rawItems = text || 'Alice deployed v1.4 (2m ago), Bob pushed fix (15m ago), Charlie opened PR #42 (1h ago)';
            const items = rawItems.split(',').map((s: string) => s.trim());
            const afRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:10px;';
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};${defBorder}${afRadius}padding:8px 10px;display:flex;flex-direction:column;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,0.2);color:${color};"><div style="font-weight:700;font-size:11px;color:${accent};border-bottom:1px solid ${border};padding-bottom:4px;display:flex;align-items:center;gap:6px;"><span>⚡</span><span>${c.caption || 'Activity Stream'}</span></div><div style="display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;">${items.map((it: string) => {
                const initial = it.charAt(0).toUpperCase();
                return `<div onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${it.replace(/'/g, "\\'")}');" style="display:flex;align-items:center;gap:8px;font-size:10px;cursor:pointer;"><div style="width:20px;height:20px;border-radius:50%;background:${accent};color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:9px;flex-shrink:0;">${initial}</div><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${it}</span></div>`;
            }).join('')}</div></div>\n`;
        } else if (t === 'file_tree_tabs') {
            const rawFiles = text || '⚡ index.ts*, 📄 API.md, 🎨 styles.css';
            const files = rawFiles.split(',').map((s: string) => s.trim());
            const ftRadius = c.border_radius !== undefined && c.border_radius !== null && c.border_radius !== '' ? `border-radius:${c.border_radius}px;` : 'border-radius:6px;';
            const customHandler = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;background:${cbg !== 'transparent' ? cbg : (isLight ? '#e2e8f0' : '#090d16')};${defBorder}${ftRadius}padding:0 4px;gap:2px;overflow-x:auto;">${files.map((file: string, idx: number) => {
                const isSel = idx === 0;
                return `<div style="padding:4px 10px;background:${isSel ? (isLight ? '#ffffff' : '#1e293b') : 'transparent'};border-radius:4px 4px 0 0;font-size:11px;font-weight:${isSel ? '700' : 'normal'};color:${isSel ? accent : color};display:flex;align-items:center;gap:6px;cursor:pointer;border-bottom:${isSel ? `2px solid ${accent}` : 'none'};" onclick="const fn=window['${customHandler}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fn)fn('${file}');"><span>${file}</span><span style="font-size:9px;opacity:0.5;" onclick="event.stopPropagation();this.parentNode.style.display='none';">✕</span></div>`;
            }).join('')}</div>\n`;
        } else if (t === 'form_checkbox') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><label style="display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="checkbox" ${c.checked ? 'checked' : ''}${disabled}${reqAttr}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${c.placeholder || 'Enable option toggle'}</label></div>\n`;
        } else if (t === 'form_radio') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><label style="display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="radio" ${c.checked ? 'checked' : ''}${disabled}${reqAttr}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${c.placeholder || 'Select option'}</label></div>\n`;
        } else if (t === 'form_search') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><div style="display:flex;align-items:center;gap:6px;background:${cbg};${defBorder}${defRadius}padding:0 8px;height:32px;"><span style="opacity:0.6;font-size:13px;">🔍</span><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="search" value="" placeholder="${c.placeholder || 'Search records...'}"${disabled}${roAttr}${ev} style="flex:1;background:none;border:none;color:${color};outline:none;font-size:${c.font_size||13}px;width:100%;"></div></div>\n`;
        } else if (t === 'form_color') {
            const hexVal = c.value || '#38bdf8';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><div style="display:flex;align-items:center;gap:8px;"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="color" value="${hexVal}"${disabled}${ev} style="width:36px;height:28px;padding:2px;${defBorder}${defRadius}cursor:${c.cursor||'pointer'};background:${rawCbg};"><span style="font-family:monospace;font-size:12px;opacity:0.9;">${hexVal}</span></div></div>\n`;
        } else if (t === 'form_time') {
            const timeVal = c.value || '09:30';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><div style="display:flex;align-items:center;gap:8px;background:${cbg};${defBorder}${defRadius}padding:0 8px;height:32px;"><span style="font-size:14px;opacity:0.7;">🕒</span><input type="time" value="${timeVal}"${disabled}${roAttr}${ev} style="background:none;border:none;color:inherit;font-family:inherit;font-size:${c.font_size||13}px;outline:none;width:100%;color-scheme:${isLight ? 'light' : 'dark'};"></div></div>\n`;
        } else if (t === 'form_stepper') {
            const stepVal = c.value !== undefined ? c.value : 5;
            const customHandler = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;gap:8px;color:${color};"><span style="font-size:11px;font-weight:700;opacity:0.8;">${text}</span><div style="display:flex;align-items:center;justify-content:space-between;background:${cbg};${defBorder}${defRadius}padding:0 6px;height:32px;min-width:110px;"><button onclick="const s=this.nextElementSibling;const n=parseInt(s.textContent||'0')-1;s.textContent=n;const fn=window['${customHandler}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fn)fn(n);" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color='${accent}';" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${accent};font-size:16px;font-weight:bold;cursor:pointer;line-height:1;user-select:none;transition:all 0.15s;">−</button><span style="font-weight:bold;font-size:12px;padding:0 8px;">${stepVal}</span><button onclick="const s=this.previousElementSibling;const n=parseInt(s.textContent||'0')+1;s.textContent=n;const fn=window['${customHandler}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fn)fn(n);" onmouseover="this.style.background='${accent}';this.style.color='#fff';" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}';this.style.color='${accent}';" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${accent};font-size:16px;font-weight:bold;cursor:pointer;line-height:1;user-select:none;transition:all 0.15s;">+</button></div></div>\n`;
        } else if (t === 'form_code') {
            const codeFg = c.font_color && c.font_color !== fg ? c.font_color : '#7dd3fc';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;gap:4px;"><span style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</span><textarea${disabled}${roAttr}${autoFocusAttr}${ev} placeholder="${c.placeholder || '// Enter script code...'}" style="flex:1;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : '#0d1117'};${defBorder}${defRadius}padding:8px;color:${codeFg};font-family:'Fira Code','Courier New',monospace;font-size:${c.font_size||12}px;overflow:auto;margin:0;resize:none;outline:none;white-space:pre;" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'>${c.value || c.code || ''}</textarea></div>\n`;
        } else if (t === 'form_drop_zone') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;gap:4px;"><span style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</span><div style="flex:1;background:${cbg};border:2px dashed ${accent};${defRadius}display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:${color};opacity:0.85;cursor:${c.cursor||'pointer'};"><span style="font-size:20px;">📥</span><span style="font-size:11px;">${c.placeholder || 'Drop files here or click to browse'}</span></div></div>\n`;
        } else if (t === 'tabs') {
            const tabItems = (text || 'General, Security, Advanced').split(',').map((tb: string) => tb.trim());
            const activeTab = c.value || tabItems[0] || '';
            const customHandler = c.event_handlers?.onChange || c.event_handlers?.onchange || '';
            controls += `<div${id}${titleAttr} data-value="${activeTab}" style="${base(c)}display:flex;align-items:center;background:${cbg !== 'transparent' ? cbg : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)')};border-bottom:2px solid ${border};padding:0 4px;gap:2px;">${tabItems.map((tb: string, idx: number) => {
                const isSel = tb === activeTab || (idx === 0 && !c.value);
                return `<button onclick="this.parentNode.querySelectorAll('button').forEach(b=>{b.style.borderBottom='none';b.style.color='${color}';b.style.fontWeight='normal'});this.style.borderBottom='2px solid ${accent}';this.style.color='${accent}';this.style.fontWeight='700';this.parentNode.dataset.value='${tb}';const fn=window['${customHandler}']||window['${c.id}_onChange']||window['on_${c.id}_change'];if(fn)fn('${tb}');" style="height:100%;padding:0 14px;background:none;border:none;border-bottom:${isSel ? `2px solid ${accent}` : 'none'};color:${isSel ? accent : color};font-weight:${isSel ? '700' : 'normal'};font-size:12px;cursor:pointer;transition:all 0.15s;">${tb}</button>`;
            }).join('')}</div>\n`;
        } else if (t === 'tool_bar') {
            const barItems = (text || '📄 New, 📂 Open, 💾 Save, ⚙️ Settings, 🔍 Search').split(',').map((item: string) => item.trim());
            const customHandler = c.event_handlers?.onClick || c.event_handlers?.onclick || '';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;background:${cbg !== 'transparent' ? cbg : (isLight ? '#f1f5f9' : '#1e293b')};${defBorder}${defRadius}padding:0 8px;box-shadow:0 2px 6px rgba(0,0,0,0.15);">${barItems.map((item: string) => `<button style="height:28px;padding:0 10px;background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)'};border:none;border-radius:4px;color:${color};font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;" onmouseover="this.style.background='${isLight ? 'rgba(2,132,199,0.15)' : 'rgba(56,189,248,0.2)'}'" onmouseout="this.style.background='${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)'}'" onclick="const fn=window['${customHandler}']||window['${c.id}_onClick']||window['on_${c.id}_click'];if(fn)fn('${item.replace(/'/g, "\\'")}');">${item}</button>`).join('')}</div>\n`;
        } else if (t === 'status_bar') {
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg !== 'transparent' ? cbg : (isLight ? '#e2e8f0' : '#090d16')};border-top:1px solid ${border};padding:0 12px;font-size:11px;color:${color};"><div style="display:flex;align-items:center;gap:8px;"><span style="color:#10b981;font-weight:bold;">🟢 Ready</span><span style="opacity:0.4;">|</span><span>${text || 'UTF-8 | Line 1, Col 1'}</span></div><div style="display:flex;align-items:center;gap:8px;opacity:0.75;"><span>Bun RAD v1.3</span><span>100%</span></div></div>\n`;
        } else if (t === 'split_pane') {
            const parts = (text || 'Navigation Sidebar | Main Detail Area').split('|');
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;background:${cbg !== 'transparent' ? cbg : (isLight ? '#f8fafc' : '#0f172a')};${defBorder}${defRadius}overflow:hidden;"><div style="flex:1;padding:8px 12px;font-size:11px;color:${color};background:${isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)'};overflow:auto;"><div style="font-weight:700;color:${accent};margin-bottom:4px;">Left Pane</div><div>${parts[0].trim()}</div></div><div style="width:4px;background:${accent};cursor:col-resize;opacity:0.75;flex-shrink:0;"></div><div style="flex:2;padding:8px 12px;font-size:11px;color:${color};overflow:auto;"><div style="font-weight:700;color:${accent};margin-bottom:4px;">Main Area</div><div>${parts[1] ? parts[1].trim() : 'Detail content panel'}</div></div></div>\n`;
        } else if (t === 'pagination') {
            const curPage = Number(c.value) || 1;
            const pagId = c.id;
            const pagInactBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
            const pagActiveBg = accent;

            const updateJs = (pageExpr: string) => `
                var p=this.parentNode;
                var targetP=${pageExpr};
                p.dataset.page=String(targetP);
                p.querySelectorAll('button[data-pag-num]').forEach(function(b){
                    var sel=b.dataset.pagNum===String(targetP);
                    b.dataset.active=sel?'true':'false';
                    b.style.background=sel?'${pagActiveBg}':'${pagInactBg}';
                    b.style.color=sel?'#ffffff':'inherit';
                    b.style.fontWeight=sel?'bold':'normal';
                    b.style.border=sel?'none':'1px solid ${border}';
                });
                if(window['${pagId}_onChange']) window['${pagId}_onChange'](targetP);
                else if(window['on_${pagId}_change']) window['on_${pagId}_change'](targetP);
                if(window['${pagId}_onClick']) window['${pagId}_onClick'](targetP);
                else if(window['on_${pagId}_click']) window['on_${pagId}_click'](targetP);
            `.replace(/\s+/g, ' ').trim();

            const makePageBtn = (n: number) => {
                const isActive = curPage === n;
                return `<button data-pag-num="${n}" data-active="${isActive ? 'true' : 'false'}" onclick="${updateJs(String(n))}" style="padding:4px 10px;background:${isActive ? pagActiveBg : pagInactBg};border:${isActive ? 'none' : '1px solid ' + border};border-radius:4px;color:${isActive ? '#fff' : 'inherit'};font-weight:${isActive ? 'bold' : 'normal'};cursor:pointer;transition:all 0.15s;">${n}</button>`;
            };

            const prevJs = updateJs("Math.max(1, parseInt(this.parentNode.dataset.page||'1', 10) - 1)");
            const nextJs = updateJs("Math.min(this.parentNode.querySelectorAll('button[data-pag-num]').length||3, parseInt(this.parentNode.dataset.page||'1', 10) + 1)");

            controls += `<div${id}${titleAttr} data-page="${curPage}" style="${base(c)}display:flex;align-items:center;justify-content:center;gap:4px;color:${color};font-size:12px;"><button onclick="${prevJs}" style="padding:4px 8px;background:${pagInactBg};border:1px solid ${border};border-radius:4px;color:inherit;cursor:pointer;transition:all 0.15s;">« Prev</button>${makePageBtn(1)}${makePageBtn(2)}${makePageBtn(3)}<button onclick="${nextJs}" style="padding:4px 8px;background:${pagInactBg};border:1px solid ${border};border-radius:4px;color:inherit;cursor:pointer;transition:all 0.15s;">Next »</button></div>\n`;
        } else if (t === 'command_palette') {
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}display:flex;align-items:center;gap:8px;background:${cbg !== 'transparent' ? cbg : (isLight ? '#ffffff' : '#1e293b')};border:1px solid ${accent};${defRadius}padding:0 12px;box-shadow:0 4px 16px rgba(0,0,0,0.3);color:${color};"><span style="font-size:14px;color:${accent};">⌘</span><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" placeholder="${c.placeholder || 'Type a command or search actions...'}" value="${text || ''}" style="flex:1;background:none;border:none;color:inherit;font-family:inherit;font-size:12px;outline:none;" ${disabled}${roAttr}><span style="font-size:10px;font-weight:700;background:${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'};padding:2px 6px;border-radius:4px;opacity:0.8;">ESC</span></div>\n`;
        } else if (t === 'toggle_button') {
            const isChecked = c.checked;
            controls += `<button id="${c.id}" ${titleAttr}${ev}${disabled} style="${base(c)}background:${isChecked ? accent : (cbg !== 'transparent' ? cbg : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'))};color:${isChecked ? '#ffffff' : color};${defBorder}${defRadius}font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;cursor:${c.cursor||'pointer'};" onclick="const isChk=this.dataset.checked==='true';this.dataset.checked=!isChk;this.style.background=!isChk?'${accent}':'${cbg !== 'transparent' ? cbg : (isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)')}';this.style.color=!isChk?'#ffffff':'${color}';if(window['${c.id}_onChange'])window['${c.id}_onChange'](!isChk);else if(window['on_${c.id}_change'])window['on_${c.id}_change'](!isChk);" data-checked="${isChecked ? 'true' : 'false'}">${isChecked ? '🔒 Locked' : (text || '🔓 Unlocked')}</button>\n`;
        } else {
            // Fallback for any other type
            controls += `<div${id}${titleAttr}${ev} style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}display:flex;align-items:center;justify-content:center;">${text}</div>\n`;
        }
    }

    // Process non_visual_controls array if present
    for (const nv of (spec.non_visual_controls || [])) {
        const nvt = nv.control_type;
        const nvid = ` id="${nv.id}"`;
        const nvev = buildEvents(nv);
        if (nvt === 'open_dialog') {
            controls += `<input type="file"${nvid}${nvev} style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;if(window['${nv.id}_onSelect'])window['${nv.id}_onSelect'](p);else if(window.backendAlert)window.backendAlert('File Selected: '+p);}">\n`;
        } else if (nvt === 'save_dialog') {
            controls += `<input type="file"${nvid}${nvev} style="display:none;">\n`;
        } else if (nvt === 'timer') {
            const interval = nv.interval || 1000;
            const handler = nv.event_handlers?.onTimer || nv.event_handlers?.ontimer || `on_${nv.id}_timer`;
            const autoStart = nv.enabled !== false;
            controls += `<script>
                (function() {
                    window['__timer_interval_${nv.id}'] = ${interval};
                    window['__timer_func_${nv.id}'] = function() {
                        if (window['${handler}']) { try{ window['${handler}'](); } catch(e){ console.error(e); } }
                        else if (window['on_${nv.id}_timer']) { try{ window['on_${nv.id}_timer'](); } catch(e){ console.error(e); } }
                        else if (window['on_${nv.id}_tick']) { try{ window['on_${nv.id}_tick'](); } catch(e){ console.error(e); } }
                    };
                    if (${autoStart}) {
                        window['__timer_id_${nv.id}'] = setInterval(window['__timer_func_${nv.id}'], ${interval});
                    }
                })();
            </script>\n`;
        }
    }

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${spec.title || 'Preview'}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: auto; }
  body {
    background: ${bg};
    color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    position: relative;
    width: 100%;
    min-height: 100%;
    overflow-x: hidden;
  }
  input, textarea, select, button { font-family: inherit; } .rad-mono { font-family: monospace; } * { spellcheck: false; }
  input[type=range] { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.12); outline: none; cursor: pointer; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: ${accent}; cursor: pointer; box-shadow: 0 0 6px rgba(56,189,248,0.5); }
  :focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
  ::selection { background: rgba(56,189,248,0.3); }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
  ${hoverStyles}
</style>
<body spellcheck="false" autocapitalize="none" autocorrect="off">
${controls}
<script>
  window.showOpenDialog = function(id) { const el = document.getElementById(id); if (el) el.click(); };
  window.showSaveDialog = function(id) { const el = document.getElementById(id); if (el) el.click(); };
  window.startTimer = function(id, ms) {
    if (window['__timer_id_' + id]) clearInterval(window['__timer_id_' + id]);
    const interval = ms || window['__timer_interval_' + id] || 1000;
    window['__timer_interval_' + id] = interval;
    const runner = function() {
      if (window['__timer_func_' + id]) { try { window['__timer_func_' + id](); } catch(e){} }
      else if (window['on_' + id + '_tick']) { try { window['on_' + id + '_tick'](); } catch(e){} }
      else if (window['on_' + id + '_timer']) { try { window['on_' + id + '_timer'](); } catch(e){} }
    };
    window['__timer_id_' + id] = setInterval(runner, interval);
  };
  window.stopTimer = function(id) {
    if (window['__timer_id_' + id]) {
      clearInterval(window['__timer_id_' + id]);
      window['__timer_id_' + id] = null;
    }
  };
  window.setTimerInterval = function(id, ms) {
    const newMs = ms || 1000;
    window['__timer_interval_' + id] = newMs;
    window.startTimer(id, newMs);
  };
  window.getControlValue = function(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if ("value" in el) return el.value;
    if (el.dataset && el.dataset.value) return el.dataset.value;
    return el.textContent ? el.textContent.trim() : null;
  };
  window.setControlText = function(id, text) {
    const el = document.getElementById(id);
    if (el) { if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") el.value = text; else { el.textContent = text; el.innerText = text; } }
  };
  window.setControlValue = function(id, val) {
    const el = document.getElementById(id);
    if (el) { if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") el.value = val; else { el.textContent = val; el.innerText = val; if (el.dataset) el.dataset.value = val; } }
  };
  window.setControlPlaceholder = function(id, placeholder) {
    const el = document.getElementById(id);
    if (el) {
      if ("placeholder" in el) el.placeholder = placeholder;
      else { const inp = el.querySelector("input, textarea"); if (inp) inp.placeholder = placeholder; }
    }
  };
  window.setControlReadOnly = function(id, readOnly) {
    const el = document.getElementById(id);
    if (el) { if ("readOnly" in el) el.readOnly = readOnly; else { const inp = el.querySelector("input, textarea"); if (inp) inp.readOnly = readOnly; } }
  };
  window.setControlRequired = function(id, required) {
    const el = document.getElementById(id);
    if (el) { if ("required" in el) el.required = required; else { const inp = el.querySelector("input, textarea, select"); if (inp) inp.required = required; } }
  };
  window.setControlMaxLength = function(id, maxLength) {
    const el = document.getElementById(id);
    if (el) { if ("maxLength" in el) el.maxLength = maxLength; else { const inp = el.querySelector("input, textarea"); if (inp) inp.maxLength = maxLength; } }
  };
  window.setControlEnabled = function(id, enabled) {
    const el = document.getElementById(id);
    if (el) { el.disabled = !enabled; el.style.opacity = enabled ? "1" : "0.55"; el.style.pointerEvents = enabled ? "auto" : "none"; }
  };
  window.setControlVisible = function(id, visible) {
    const el = document.getElementById(id);
    if (el) { el.style.display = visible ? "" : "none"; }
  };
  window.setStatChart = function(id, titleOrOpts, valStr, trendStr) {
    const c = document.getElementById(id);
    if (!c) return;
    let title = '', value = '', trend = '';
    if (typeof titleOrOpts === 'object' && titleOrOpts !== null) {
      title = titleOrOpts.title || '';
      value = titleOrOpts.value || '';
      trend = titleOrOpts.trend || '';
    } else {
      title = String(titleOrOpts || '');
      value = String(valStr || '');
      trend = String(trendStr || '');
    }
    if (title) { const t = c.querySelector(".stat-title") || c.querySelector("span"); if (t) t.textContent = title; }
    if (value) { const v = c.querySelector(".stat-val") || c.querySelector("div:nth-child(2)"); if (v) v.textContent = value; }
    if (trend) { const tr = c.querySelector(".stat-trend") || c.querySelectorAll("span")[1]; if (tr) tr.textContent = trend; }
    c.style.transition = "box-shadow 0.3s, border-color 0.3s";
    c.style.boxShadow = "0 0 22px #38bdf8";
    c.style.borderColor = "#38bdf8";
    setTimeout(function() { c.style.boxShadow = ""; c.style.borderColor = ""; }, 1500);
  };
  window.setTimelineSteps = function(id, stepsList) {
    const c = document.getElementById(id);
    if (!c) return;
    const steps = Array.isArray(stepsList) ? stepsList : String(stepsList || '').split(',').map(function(s){ return s.trim(); });
    const accent = '#38bdf8';
    let html = '';
    steps.forEach(function(stepText, idx) {
      const active = idx <= 1 || stepText.includes('Passed') || stepText.includes('Verified') || stepText.includes('Deployed');
      const nodeCol = active ? '#10b981' : (idx === 0 ? accent : 'rgba(255,255,255,0.3)');
      const icon = active ? '✓' : '•';
      html += '<div style="display:flex;align-items:center;gap:10px;font-size:11px;margin-bottom:6px;"><span style="color:' + nodeCol + ';font-weight:bold;">' + icon + '</span><span style="font-weight:' + (active?'700':'400') + ';">' + stepText + '</span></div>';
    });
    c.innerHTML = html;
    c.style.transition = "box-shadow 0.3s";
    c.style.boxShadow = "0 0 20px #10b981";
    setTimeout(function() { c.style.boxShadow = ""; }, 1400);
  };
  window.setToast = function(id, title, msg, alertType) {
    const c = document.getElementById(id);
    if (c) {
      if (title) { const tEl = c.querySelector("span:nth-child(1)"); if (tEl) tEl.textContent = title; }
      if (msg) { const mEl = c.querySelector("span:nth-child(2)"); if (mEl) mEl.textContent = msg; }
      if (alertType) { c.style.borderLeftColor = alertType==='error'?'#ef4444':alertType==='warning'?'#f59e0b':'#10b981'; }
      c.style.transition = "box-shadow 0.3s, border-color 0.3s";
      c.style.boxShadow = "0 0 18px " + (alertType==='error'?'#ef4444':alertType==='warning'?'#f59e0b':'#10b981');
      setTimeout(function() { c.style.boxShadow = ""; }, 1400);
    }
  };
  window.setSegmentedSelected = function(id, labelText) {
    const container = document.getElementById(id);
    if (!container) return;
    const accent = '#38bdf8';
    container.dataset.value = labelText;
    container.querySelectorAll('button').forEach(function(b) {
      const isSel = b.textContent.trim() === labelText;
      b.style.background = isSel ? accent : 'transparent';
      b.style.color = isSel ? '#ffffff' : 'inherit';
    });
  };
  window.setTreeNodes = function(id, nodesList) {
    const container = document.getElementById(id);
    if (!container) return;
    const nodes = Array.isArray(nodesList) ? nodesList : String(nodesList || '').split(',').map(function(s){ return s.trim(); });
    const accent = '#38bdf8';
    const selBg = 'rgba(56,189,248,0.25)';
    let html = '';
    nodes.forEach(function(nodeText, idx) {
      const isFolder = nodeText.includes('📁') || nodeText.includes('📂') || nodeText.includes('demos') || nodeText.includes('src') || idx === 0;
      const indent = idx === 0 ? 0 : (idx === 1 ? 16 : 32);
      const arrow = isFolder ? '▼' : ' ';
      const selStyle = idx === 0 ? 'background:' + selBg + ';color:' + accent + ';font-weight:700;' : '';
      const isUpdatedFolder = nodeText.includes('UPDATED') || nodeText.includes('[');
      const isNewFile = nodeText.endsWith('.ts') || nodeText.includes('.js') || nodeText.includes('.json');
      let badgeHtml = '';
      if (isUpdatedFolder) {
        badgeHtml = '<span style="font-size:9px;font-weight:800;background:#0284c7;color:#ffffff;padding:2px 8px;border-radius:10px;box-shadow:0 0 8px rgba(2,132,199,0.6);flex-shrink:0;margin-left:8px;">UPDATED</span>';
      } else if (isNewFile) {
        badgeHtml = '<span style="font-size:9px;font-weight:800;background:#10b981;color:#ffffff;padding:2px 8px;border-radius:10px;box-shadow:0 0 8px rgba(16,185,129,0.6);flex-shrink:0;margin-left:8px;">NEW</span>';
      }
      html += '<div class="tree-node' + (idx===0?' selected-tree-node':'') + '" data-node="' + nodeText + '" style="padding:6px 10px;padding-left:' + (indent + 8) + 'px;border-radius:6px;display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;cursor:pointer;user-select:none;transition:all 0.2s;' + selStyle + '"' +
        ' onclick="event.stopPropagation();const parent=this.closest(\'.rad-tree-container\');parent.querySelectorAll(\'.tree-node\').forEach(function(n){n.style.background=\'transparent\';n.style.color=\'inherit\';n.style.fontWeight=\'normal\';});this.style.background=\'' + selBg + '\';this.style.color=\'' + accent + '\';this.style.fontWeight=\'700\';if(window[\'' + id + '_onSelect\'])window[\'' + id + '_onSelect\'](this.dataset.node);"' +
        ' onmouseover="if(!this.style.background.includes(\'rgba\')){this.style[\'background\']=\'rgba(255,255,255,0.08)\'}"' +
        ' onmouseout="if(!this.style.background.includes(\'rgba(56\')){this.style[\'background\']=\'transparent\';}">' +
        '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden;">' +
        '<span class="tree-arrow" onclick="event.stopPropagation();const isCol=this.textContent===\'▶\';this.textContent=isCol?\'▼\':\'▶\';let curr=this.closest(\'.tree-node\').nextElementSibling;while(curr){const currInd=parseInt(curr.style.paddingLeft||\'0\');if(currInd<=' + (indent + 8) + ')break;curr.style.display=isCol?\'flex\':\'none\';curr=curr.nextElementSibling;}" style="width:12px;font-size:9px;opacity:0.8;cursor:pointer;flex-shrink:0;">' + arrow + '</span>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + nodeText + '</span></div>' +
        badgeHtml +
        '</div>';
    });
    container.innerHTML = html;
    container.style.transition = "box-shadow 0.3s, border-color 0.3s";
    container.style.boxShadow = "0 0 25px #38bdf8";
    container.style.borderColor = "#38bdf8";
    setTimeout(function() {
      container.style.boxShadow = "";
      container.style.borderColor = "";
    }, 1500);
  };
  window.setTabsActive = function(id, tabName) {
    const c = document.getElementById(id);
    if (!c) return;
    const accent = '#38bdf8';
    c.dataset.value = tabName;
    c.querySelectorAll('button').forEach(function(b) {
      const isSel = b.textContent.trim() === tabName;
      b.style.borderBottom = isSel ? '2px solid ' + accent : 'none';
      b.style.color = isSel ? accent : 'inherit';
      b.style.fontWeight = isSel ? '700' : 'normal';
    });
  };
  window.setStatusBarText = function(id, textStr) {
    const c = document.getElementById(id);
    if (!c) return;
    const span = c.querySelector('div:nth-child(1) span:nth-child(3)');
    if (span) span.textContent = textStr;
  };
  window.setPropertyGridData = function(id, rawProps) {
    const c = document.getElementById(id);
    if (!c) return;
    const body = c.querySelector('.prop-grid-body');
    if (!body) return;
    const propsList = String(rawProps || '').split(',').map(function(s){ return s.trim().split(':'); }).filter(function(arr){ return arr.length === 2; });
    const accent = '#38bdf8';
    let html = '';
    propsList.forEach(function(pair) {
      const k = pair[0].trim(); const v = pair[1].trim();
      html += '<div style=\'display:flex;justify-content:space-between;align-items:center;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.08);font-size:11px;\'><span style=\'font-weight:600;opacity:0.85;\'>' + k + '</span><span style=\'font-size:11px;color:' + accent + ';font-weight:600;font-family:monospace;\'>' + v + '</span></div>';
    });
    body.innerHTML = html;
  };
  window.setPopupMenuItems = function(id, itemsCSV) {
    const c = document.getElementById(id);
    if (!c) return;
    const items = String(itemsCSV || '').split(',').map(function(s){ return s.trim(); });
    let html = '';
    items.forEach(function(it) {
      if (it === '---') { html += '<div style=\'height:1px;background:rgba(255,255,255,0.1);margin:4px 0;\'></div>'; return; }
      const parts = it.split(/\s{2,}/);
      const label = parts[0] || it; const shortcut = parts[1] || '';
      html += '<div class="popup-item" style=\'padding:6px 10px;border-radius:6px;display:flex;justify-content:space-between;align-items:center;font-size:11px;cursor:pointer;\' onclick="if(window[\'' + id + '_onClick\'])window[\'' + id + '_onClick\'](\'' + label + '\');else if(window[\'on_' + id + '_click\'])window[\'on_' + id + '_click\'](\'' + label + '\');"><span>' + label + '</span>' + (shortcut ? '<span style=\'font-size:10px;opacity:0.5;font-family:monospace;\'>' + shortcut + '</span>' : '') + '</div>';
    });
    c.innerHTML = html;
  };
  window.setCalendarDate = function(id, headerText) {
    const c = document.getElementById(id);
    if (!c) return;
    const span = c.querySelector('div:nth-child(1) span:nth-child(2)');
    if (span) span.textContent = headerText;
  };
  window.setColorSwatchColor = function(id, hexColor) {
    const c = document.getElementById(id);
    if (!c) return;
    c.dataset.value = hexColor;
    c.querySelectorAll('.swatch-chip').forEach(function(chip) {
      const isSel = chip.dataset.color.toLowerCase() === hexColor.toLowerCase();
      chip.style.transform = isSel ? 'scale(1.15)' : 'scale(1)';
      chip.style.boxShadow = isSel ? '0 0 0 3px #0f172a, 0 0 0 5px ' + hexColor : '0 2px 6px rgba(0,0,0,0.3)';
    });
  };
  window.setFilePathBarPath = function(id, pathStr) {
    const c = document.getElementById(id);
    if (!c) return;
    const span = c.querySelector('.path-text');
    if (span) span.textContent = pathStr;
  };
  window.setKanbanColumns = function(id, rawCols) {
    const c = document.getElementById(id);
    if (!c) return;
    const cols = String(rawCols || '').split('|').map(function(s){ return s.trim(); });
    const sampleCards = [
      ['● Design Specs', '● IPC Handlers', '● State Sync'],
      ['● HTML Generator', '● UI Canvas'],
      ['● Unit Tests', '● API Docs', '● Themes', '● Exporter']
    ];
    let html = '';
    const accent = '#38bdf8';
    cols.forEach(function(colStr, idx) {
      const cards = sampleCards[idx % sampleCards.length];
      html += '<div style="flex:1;min-width:90px;background:rgba(255,255,255,0.05);border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:6px;"><div style="font-size:10px;font-weight:700;color:' + accent + ';border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;display:flex;justify-content:space-between;align-items:center;"><span>' + colStr + '</span></div><div style="display:flex;flex-direction:column;gap:4px;flex:1;overflow-y:auto;">' + cards.map(function(card){ return '<div onclick="const fn=window[' + JSON.stringify(id + '_onClick') + ']||window[' + JSON.stringify('on_' + id + '_click') + '];if(fn)fn(' + JSON.stringify(card) + ');" style="background:#1e293b;border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:4px 6px;font-size:10px;color:inherit;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.1);cursor:pointer;">' + card + '</div>'; }).join('') + '</div></div>';
    });
    c.innerHTML = html;
  };
  window.setShortcutRecorderValue = function(id, shortcutStr) {
    const c = document.getElementById(id);
    if (!c) return;
    c.dataset.value = shortcutStr;
    const keys = String(shortcutStr || '').split(/\s+|\+|\-/).filter(Boolean);
    const accent = '#38bdf8';
    const keysContainer = c.querySelector('div');
    if (keysContainer) {
      keysContainer.innerHTML = keys.map(function(k){ return '<kbd class="rad-mono" style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.1);border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;color:' + accent + ';">' + k + '</kbd>'; }).join('');
    }
  };
  window.setSplitButtonAction = function(id, textStr) {
    const c = document.getElementById(id);
    if (!c) return;
    const btn = c.querySelector('button:first-child');
    if (btn) btn.textContent = textStr;
  };
  window.setSparklineTableData = function(id, rowsCSV) {
    const c = document.getElementById(id);
    if (!c) return;
    const rows = String(rowsCSV || '').split(',').map(function(s){ return s.trim(); });
    const accent = '#38bdf8';
    let html = '';
    rows.forEach(function(row, i) {
      const parts = row.split(':');
      const label = parts[0] || 'Metric';
      const val = parts[1] || '$10k';
      const isUp = i % 3 === 0; const isFlat = i % 3 === 1;
      const sparkColor = isUp ? '#10b981' : isFlat ? accent : '#ef4444';
      const points = isUp ? '0,14 10,12 20,8 30,10 40,4 50,2' : isFlat ? '0,8 10,10 20,7 30,9 40,8 50,8' : '0,2 10,5 20,8 30,6 40,12 50,14';
      html += '<div onclick="const fn=window[' + JSON.stringify(id + '_onClick') + ']||window[' + JSON.stringify('on_' + id + '_click') + '];if(fn)fn(' + JSON.stringify(label) + ');" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:' + (i < rows.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none') + ';cursor:pointer;"><span style="font-weight:600;opacity:0.85;">' + label + '</span><div style="display:flex;align-items:center;gap:8px;"><svg width="50" height="16" style="overflow:visible;"><polyline fill="none" stroke="' + sparkColor + '" stroke-width="2" points="' + points + '" /></svg><span class="rad-mono" style="font-weight:700;color:' + sparkColor + ';">' + val + '</span></div></div>';
    });
    c.innerHTML = html;
  };
  window.setMetricComparison = function(id, opts) {
    const c = document.getElementById(id);
    if (!c) return;
    const titleSpan = c.querySelector('div:first-child span:first-child');
    if (titleSpan && opts.title) titleSpan.textContent = opts.title;
    const valSpan = c.querySelector('div:nth-child(2) span:first-child');
    if (valSpan && opts.curVal) valSpan.textContent = opts.curVal;
    const targetSpan = c.querySelector('div:nth-child(2) span:nth-child(2)');
    if (targetSpan && opts.targetStr) targetSpan.textContent = opts.targetStr;
    const changeSpan = c.querySelector('div:first-child span:nth-child(2)');
    if (changeSpan && opts.changeStr) changeSpan.textContent = opts.changeStr;
  };
  window.setActivityFeedItems = function(id, itemsCSV) {
    const c = document.getElementById(id);
    if (!c) return;
    const items = String(itemsCSV || '').split(',').map(function(s){ return s.trim(); });
    const stream = c.querySelector('div:nth-child(2)');
    if (!stream) return;
    const accent = '#38bdf8';
    let html = '';
    items.forEach(function(it) {
      const initial = it.charAt(0).toUpperCase();
      html += '<div onclick="const fn=window[' + JSON.stringify(id + '_onClick') + ']||window[' + JSON.stringify('on_' + id + '_click') + '];if(fn)fn(' + JSON.stringify(it) + ');" style="display:flex;align-items:center;gap:8px;font-size:10px;cursor:pointer;"><div style="width:20px;height:20px;border-radius:50%;background:' + accent + ';color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:9px;flex-shrink:0;">' + initial + '</div><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + it + '</span></div>';
    });
    stream.innerHTML = html;
  };
  window.setWorkspaceTabs = function(id, filesCSV) {
    const c = document.getElementById(id);
    if (!c) return;
    const files = String(filesCSV || '').split(',').map(function(s){ return s.trim(); });
    const accent = '#38bdf8';
    let html = '';
    files.forEach(function(file, idx) {
      const isSel = idx === 0;
      html += '<div style="padding:4px 10px;background:' + (isSel ? '#1e293b' : 'transparent') + ';border-radius:4px 4px 0 0;font-size:11px;font-weight:' + (isSel ? '700' : 'normal') + ';color:' + (isSel ? accent : 'inherit') + ';display:flex;align-items:center;gap:6px;cursor:pointer;border-bottom:' + (isSel ? '2px solid ' + accent : 'none') + ';" onclick="const fn=window[' + JSON.stringify(id + '_onChange') + ']||window[' + JSON.stringify('on_' + id + '_change') + '];if(fn)fn(' + JSON.stringify(file) + ');"><span>' + file + '</span><span style="font-size:9px;opacity:0.5;" onclick="event.stopPropagation();this.parentNode.style.display=\'none\';">✕</span></div>';
    });
    c.innerHTML = html;
  };
  window.__handlePagClick = function(btn, id, accent, border, isLight, e) {
    var log = function(msg) {
      if (window.backendAlert) window.backendAlert("PagClick Log: " + msg);
      else console.log("PagClick Log: " + msg);
    };
    try {
      if (e && e.stopPropagation) e.stopPropagation();
      var parent = btn.closest ? btn.closest('[data-page]') : btn.parentNode;
      if (!parent) parent = btn.parentNode;
      var numBtns = Array.from(parent.querySelectorAll('button[data-pag-num]'));
      var currentPageStr = parent.dataset.page || '1';
      var currentPage = parseInt(currentPageStr, 10) || 1;
      var targetPage = currentPage;

      if (btn.dataset && btn.dataset.pagNum) {
        targetPage = parseInt(btn.dataset.pagNum, 10);
      } else if (btn.dataset && btn.dataset.pagPrev) {
        targetPage = Math.max(1, currentPage - 1);
      } else if (btn.dataset && btn.dataset.pagNext) {
        targetPage = Math.min(numBtns.length || 3, currentPage + 1);
      }

      parent.dataset.page = String(targetPage);

      numBtns.forEach(function(b) {
        var pn = parseInt(b.dataset.pagNum, 10);
        var isSel = pn === targetPage;
        b.dataset.active = isSel ? 'true' : 'false';
        b.style.background = isSel ? accent : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)');
        b.style.color = isSel ? '#ffffff' : 'inherit';
        b.style.fontWeight = isSel ? 'bold' : 'normal';
        b.style.border = isSel ? 'none' : '1px solid ' + border;
      });

      var pageArg = targetPage;
      if (typeof window[id + '_onChange'] === 'function') { window[id + '_onChange'](pageArg); }
      else if (typeof window['on_' + id + '_change'] === 'function') { window['on_' + id + '_change'](pageArg); }
      if (typeof window[id + '_onClick'] === 'function') { window[id + '_onClick'](pageArg); }
      else if (typeof window['on_' + id + '_click'] === 'function') { window['on_' + id + '_click'](pageArg); }
    } catch (err) {
      log(err.message + " " + err.stack);
    }
  };
  window.setControlText = function(id, text) {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
        el.value = text;
      } else {
        const targetSpan = el.querySelector("span:nth-child(2)");
        if (targetSpan) {
          targetSpan.textContent = text;
        } else {
          el.textContent = text;
        }
      }
    }
  };
  window.setAlertBannerText = function(id, textStr) {
    const el = document.getElementById(id);
    if (!el) return;
    const span = el.querySelector("span:nth-child(2)");
    if (span) span.textContent = textStr;
    else el.textContent = textStr;
  };
  window.setPaginationPage = function(id, pageNum) {
    const c = document.getElementById(id);
    if (!c) return;
    const pNum = parseInt(String(pageNum), 10);
    if (isNaN(pNum)) return;
    const accent = '#38bdf8';
    c.dataset.page = String(pNum);
    const numBtns = Array.from(c.querySelectorAll('button[data-pag-num]'));
    const fallbackBtns = numBtns.length === 0
      ? Array.from(c.querySelectorAll('button')).filter(function(b) { return !isNaN(parseInt(b.textContent.trim(), 10)); })
      : numBtns;
    fallbackBtns.forEach(function(b) {
      const bn = b.dataset.pagNum ? parseInt(b.dataset.pagNum, 10) : parseInt(b.textContent.trim(), 10);
      const isSel = bn === pNum;
      b.dataset.active = isSel ? 'true' : 'false';
      b.style.background = isSel ? accent : 'rgba(255,255,255,0.06)';
      b.style.color = isSel ? '#ffffff' : 'inherit';
      b.style.fontWeight = isSel ? '700' : 'normal';
      b.style.border = isSel ? 'none' : '1px solid rgba(255,255,255,0.12)';
    });
  };
  window.setToggleButtonState = function(id, active, labelText) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const accent = '#38bdf8';
    btn.dataset.checked = active ? 'true' : 'false';
    btn.style.background = active ? accent : 'rgba(255,255,255,0.08)';
    btn.style.color = active ? '#ffffff' : 'inherit';
    if (labelText !== undefined && labelText !== null) btn.textContent = labelText;
  };
  window.toggleFullscreen = function() {
    if (window.toggleFullscreenBackend) try { window.toggleFullscreenBackend(); } catch(e){}
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{});
      else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  };
  window.addEventListener("keydown", (e) => {
    if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "q") || (e.altKey && (e.key === "F4" || e.code === "F4"))) {
      e.preventDefault();
      if (window.quitApp) window.quitApp();
      else window.close();
    } else if (e.key === "F11" || e.code === "F11" || ((e.key.toLowerCase() === "f" || e.code === "KeyF") && (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey))) {
      e.preventDefault();
      window.toggleFullscreen();
    }
  });
  window.addEventListener("DOMContentLoaded", () => {
    if (window.onFormLoad) window.onFormLoad();
  });
  window.addEventListener("resize", () => {
    if (window.onFormResize) window.onFormResize({ width: window.innerWidth, height: window.innerHeight });
  });
  window.addEventListener("beforeunload", () => {
    if (window.onFormClose) window.onFormClose();
  });
</script>
</body>
</html>`;
}

