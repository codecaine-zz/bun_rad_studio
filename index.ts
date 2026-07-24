import { SizeHint, Webview } from "webview-bun";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { join } from "path";

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
    execJS(\`const el=document.getElementById("\${controlId}");if(el){if("value" in el)el.value=\${escaped};else el.textContent=\${escaped};}\`);
}

export function setControlEnabled(controlId: string, enabled: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){el.disabled=\${!enabled};el.style.opacity=\${enabled ? "1" : "0.55"};el.style.pointerEvents=\${enabled ? "auto" : "none"};}\`);
}

export function setControlVisible(controlId: string, visible: boolean) {
    execJS(\`const el=document.getElementById("\${controlId}");if(el){el.style.display=\${visible ? "" : "none"};}\`);
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

    webview.bind("exportProject", (specJson: string) => {
        return exportProjectHelper(specJson);
    });

    webview.run();
}



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
        if (!c.event_handlers) return ev;
        for (const [evtName, handler] of Object.entries(c.event_handlers)) {
            if (!handler || typeof handler !== 'string' || !handler.trim()) continue;
            const clean = (handler as string).trim();
            let attrName = evtName.toLowerCase();
            if (attrName === 'onhover' || attrName === 'onmouseenter') attrName = 'onmouseover';
            if (attrName === 'onhoverexit' || attrName === 'onmouseleave') attrName = 'onmouseout';
            if (attrName === 'ondoubleclick') attrName = 'ondblclick';

            const isFuncName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean);
            let codeToExec = '';
            if (isFuncName) {
                codeToExec = `if(window['${clean}']){window['${clean}'](this.value||'')}else if(window.backendAlert){window.backendAlert('Event: ${clean}')}`;
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
        return `position:absolute;left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px;` +
            `font-size:${c.font_size || 13}px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;` +
            `box-sizing:border-box;transition:background 0.15s,color 0.15s,filter 0.15s,transform 0.1s;${bw}${bc}${bs}${br}${sh}${ta}${op}${pe}${cur}${extra}`;
    };

    let controls = '';
    let hoverStyles = '';
    for (const c of (spec.controls || [])) {
        if (c.visible === false) continue;
        const t = c.control_type;
        const text = c.text || '';
        const color = c.font_color || fg;
        const rawCbg = c.background_color || 'transparent';
        const cbg = c.background_color && c.background_color !== 'transparent'
            ? c.background_color
            : (isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)');
        const ev = buildEvents(c);
        const id = ` id="${c.id}"`;
        const disabled = c.enabled === false ? ' disabled' : '';
        const titleAttr = c.tooltip ? ` title="${c.tooltip.replace(/"/g, '&quot;')}"` : '';

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
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled} type="${t === 'search' ? 'search' : 'text'}" value="${text}" placeholder="${c.placeholder || ''}" style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;">\n`;
        } else if (t === 'password') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled} type="password" value="${text}" placeholder="${c.placeholder || ''}" style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;">\n`;
        } else if (t === 'textarea') {
            controls += `<textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${titleAttr}${ev}${disabled} style="${base(c)}background:${cbg};color:${color};${defBorder}${defRadius}padding:8px;resize:none;outline:none;">${text}</textarea>\n`;
        } else if (t === 'checkbox') {
            const chk = c.checked ? 'checked' : '';
            controls += `<label${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};color:${color};"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="checkbox" ${chk}${disabled}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${text}</label>\n`;
        } else if (t === 'radio') {
            const chk = c.checked ? 'checked' : '';
            controls += `<label${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:8px;cursor:${c.cursor||'pointer'};color:${color};"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="radio" ${chk}${disabled}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:${c.cursor||'pointer'};">${text}</label>\n`;
        } else if (t === 'switch' || t === 'form_switch') {
            const on = c.checked;
            const trackCol = on ? accent : (isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)');
            const thumbX = on ? '22px' : '2px';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:10px;color:${color};cursor:${c.cursor||'pointer'};" onclick="this.querySelector('.sw-track').style.background=this.querySelector('.sw-thumb').style.left==='2px'?'${accent}':'${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}';this.querySelector('.sw-thumb').style.left=this.querySelector('.sw-thumb').style.left==='2px'?'22px':'2px';">${t === 'form_switch' ? `<span>${text}</span>` : ''}<div class="sw-track" style="width:44px;height:24px;background:${trackCol};border-radius:12px;position:relative;flex-shrink:0;transition:background 0.2s;"><div class="sw-thumb" style="position:absolute;left:${thumbX};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.2s;"></div></div>${t !== 'form_switch' ? `<span>${text}</span>` : ''}</div>\n`;
        } else if (t === 'slider' || t === 'form_slider') {
            const val = c.value !== undefined ? c.value : 50;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><${t.startsWith('form') ? `span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><` : ''}input type="range" min="0" max="100" value="${val}"${ev} style="width:100%;accent-color:${accent};cursor:${c.cursor||'pointer'};"></div>\n`;
        } else if (t === 'number' || t === 'form_number') {
            const val = c.value !== undefined ? c.value : 0;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span>` : ''}<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="number" value="${val}"${ev} style="background:${cbg};color:${color};${defBorder}${defRadius}padding:4px 8px;outline:none;font-size:${c.font_size||13}px;"></div>\n`;
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
            const starBg = isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:4px;font-size:${Math.max(c.height-8,16)}px;">${[1,2,3,4,5].map(i=>`<span style="cursor:pointer;color:${i<=3?'#f59e0b':starBg};transition:color 0.1s;" onmouseover="this.parentNode.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<${i}?'#f59e0b':'${starBg}'})" onmouseout="this.parentNode.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<3?'#f59e0b':'${starBg}'})">★</span>`).join('')}</div>\n`;
        } else if (t === 'stepper') {
            const val = c.value !== undefined ? c.value : 5;
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg};${defBorder}${defRadius}padding:0 8px;color:${color};"><button onclick="const v=this.nextSibling;v.textContent=parseInt(v.textContent)-1;" style="background:none;border:none;color:${color};font-size:18px;cursor:pointer;line-height:1;">−</button><span style="font-weight:bold;">${val}</span><button onclick="const v=this.previousSibling;v.textContent=parseInt(v.textContent)+1;" style="background:none;border:none;color:${color};font-size:18px;cursor:pointer;line-height:1;">+</button></div>\n`;
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
            controls += `<textarea${id}${titleAttr}${ev} style="${base(c)}background:${codeBg};${defBorder}${cdRadius}padding:12px;color:${codeFg};font-family:'Fira Code','Courier New',monospace;font-size:${c.font_size||12}px;overflow:auto;margin:0;resize:none;outline:none;white-space:pre;" autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'>${text}</textarea>\n`;
        } else if (t === 'metric_meter') {
            const val = c.value !== undefined ? c.value : 65;
            const meterBg = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;"><span>${text}</span><span>${val}%</span></div><div style="width:100%;height:6px;background:${meterBg};border-radius:3px;overflow:hidden;"><div style="width:${val}%;height:100%;background:${c.background_color && c.background_color !== 'transparent' ? c.background_color : `linear-gradient(to right, ${accent}, #818cf8)`};border-radius:3px;"></div></div></div>\n`;
        } else if (t === 'tag') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 8px;">${(text||'tag1,tag2').split(',').map((tg: string)=>`<span style="background:${cbg};color:${accent};${defBorder}${defRadius}padding:2px 10px;font-size:11px;font-weight:600;">${tg.trim()}</span>`).join('')}</div>\n`;
        } else if (t === 'form_field' || t === 'form_password' || t === 'form_textarea') {
            const inputType = t === 'form_password' ? 'password' : (t === 'form_textarea' ? 'textarea' : 'text');
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;"><label style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</label>${inputType === 'textarea' ? `<textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${ev} style="flex:1;background:${cbg};color:${color};${defBorder}${defRadius}padding:6px 10px;resize:none;outline:none;font-size:${c.font_size||13}px;font-family:inherit;"></textarea>` : `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="${inputType}"${ev} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;font-size:${c.font_size||13}px;">`}</div>\n`;
        } else if (t === 'form_dropdown') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;"><label style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</label><select${ev} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 8px;outline:none;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><option>Option 1</option><option>Option 2</option><option>Option 3</option></select></div>\n`;
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
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:3px;"><label style="font-size:10px;font-weight:700;color:${accent};">🗄️ ${text||'DBField'}</label><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="text" value="Sample Record Data"${ev} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 10px;outline:none;font-size:${c.font_size||13}px;"></div>\n`;
        } else if (t === 'db_dropdown') {
            controls += `<div${id}${titleAttr} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:3px;"><label style="font-size:10px;font-weight:700;color:${accent};">🗄️ ${text||'DBLookup'}</label><select${ev} style="height:32px;background:${cbg};color:${color};${defBorder}${defRadius}padding:0 8px;outline:none;cursor:${c.cursor||'pointer'};font-size:${c.font_size||13}px;"><option>Acme Corp</option><option>Starlight Ltd</option><option>Nexus Tech</option></select></div>\n`;
        } else if (t === 'open_dialog') {
            controls += `<input type="file"${id}${ev} style="display:none;" onchange="if(this.files&&this.files[0]){const p=this.files[0].name;if(window['${c.id}_onSelect'])window['${c.id}_onSelect'](p);else if(window.backendAlert)window.backendAlert('File Selected: '+p);}">\n`;
        } else if (t === 'save_dialog') {
            controls += `<input type="file"${id}${ev} style="display:none;">\n`;
        } else if (t === 'table') {
            controls += `<div${id}${titleAttr} style="${base(c)}overflow:auto;${defBorder}${defRadius}background:${cbg};"><table style="width:100%;border-collapse:collapse;font-size:12px;color:${color};"><thead><tr style="background:${isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'};">${['ID','Name','Value','Status'].map(h=>`<th style="padding:8px 12px;text-align:left;font-weight:700;color:${accent};border-bottom:1px solid ${border};">${h}</th>`).join('')}</tr></thead><tbody>${[1,2,3].map(r=>`<tr style="border-bottom:1px solid ${border};" onmouseover="this.style.background='${isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'}'" onmouseout="this.style.background=''">${['#'+r,'Item '+r,(r*100).toFixed(0),'Active'].map(cell=>`<td style="padding:8px 12px;">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>\n`;
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
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body {
    background: ${bg};
    color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    position: relative;
    width: ${w}px;
    height: ${h}px;
    overflow: hidden;
  }
  input, textarea, select, button { font-family: inherit; } * { spellcheck: false; }
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

