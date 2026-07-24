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

const webview = new Webview();
webview.setHTML(html);
webview.title = "Bun RAD Studio (Delphi/VB Style)";
webview.size = { width: 1400, height: 900, hint: SizeHint.NONE };

// Bind a method to run the live preview
webview.bind("runPreview", (specJson: string) => {
    try {
        const spec = JSON.parse(specJson);
        const tempDir = join(process.cwd(), ".rad_preview");
        mkdirSync(tempDir, { recursive: true });

        // Generate preview HTML
        const previewHtml = generatePreviewHtml(spec);
        writeFileSync(join(tempDir, "preview.html"), previewHtml);

        // Generate preview runner TS
        const previewTs = `
import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(import.meta.dir, "preview.html"), "utf-8");
const wv = new Webview();
wv.setHTML(html);
wv.title = "${spec.title} - Live Preview";
wv.size = { width: ${spec.width || 800}, height: ${spec.height || 600}, hint: SizeHint.NONE };

// Expose backend capabilities to the preview
wv.bind("backendAlert", (msg: string) => {
    console.log("Backend alert:", msg);
});

wv.run();
        `;
        writeFileSync(join(tempDir, "preview.ts"), previewTs);

        // Run the preview using Bun in the background
        const proc = spawn("bun", ["run", "preview.ts"], {
            cwd: tempDir,
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

function generatePreviewHtml(spec: any): string {
    const bg = spec.background_color || '#0f172a';
    const fg = spec.font_color || '#e2e8f0';
    const accent = '#38bdf8';
    const border = 'rgba(255,255,255,0.12)';
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
    };;

    const base = (c: any, extra = '') =>
        `position:absolute;left:${c.x}px;top:${c.y}px;width:${c.width}px;height:${c.height}px;` +
        `font-size:${c.font_size || 13}px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;` +
        `box-sizing:border-box;${extra}`;

    let controls = '';
    for (const c of (spec.controls || [])) {
        if (c.visible === false) continue;
        const t = c.control_type;
        const text = c.text || '';
        const color = c.font_color || fg;
        const cbg = c.background_color || 'transparent';
        const ev = buildEvents(c);
        const id = ` id="${c.id}"`;
        const disabled = c.enabled === false ? ' disabled' : '';

        if (t === 'button') {
            controls += `<button${id}${ev}${disabled} style="${base(c)}background:${cbg};color:${color};border:none;border-radius:6px;cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:center;transition:filter 0.15s,transform 0.1s;box-shadow:0 2px 8px rgba(0,0,0,0.3);" onmouseover="this.style.filter='brightness(1.2)'" onmouseout="this.style.filter=''" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''">${text}</button>\n`;
        } else if (t === 'label') {
            controls += `<div${id}${ev} style="${base(c)}color:${color};display:flex;align-items:center;background:transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${text}</div>\n`;
        } else if (t === 'input' || t === 'search') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${ev}${disabled} type="${t === 'search' ? 'search' : 'text'}" value="${text}" placeholder="${c.placeholder || ''}" style="${base(c)}background:${cbg};color:${color};border:1px solid ${border};border-radius:5px;padding:0 10px;outline:none;">\n`;
        } else if (t === 'password') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${ev}${disabled} type="password" value="${text}" placeholder="${c.placeholder || ''}" style="${base(c)}background:${cbg};color:${color};border:1px solid ${border};border-radius:5px;padding:0 10px;outline:none;">\n`;
        } else if (t === 'textarea') {
            controls += `<textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id}${ev}${disabled} style="${base(c)}background:${cbg};color:${color};border:1px solid ${border};border-radius:5px;padding:8px;resize:none;outline:none;">${text}</textarea>\n`;
        } else if (t === 'checkbox') {
            const chk = c.checked ? 'checked' : '';
            controls += `<label${id} style="${base(c)}display:flex;align-items:center;gap:8px;cursor:pointer;color:${color};"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="checkbox" ${chk}${disabled}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:pointer;">${text}</label>\n`;
        } else if (t === 'radio') {
            const chk = c.checked ? 'checked' : '';
            controls += `<label${id} style="${base(c)}display:flex;align-items:center;gap:8px;cursor:pointer;color:${color};"><input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="radio" ${chk}${disabled}${ev} style="width:16px;height:16px;accent-color:${accent};cursor:pointer;">${text}</label>\n`;
        } else if (t === 'switch' || t === 'form_switch') {
            const on = c.checked;
            const trackCol = on ? accent : 'rgba(255,255,255,0.15)';
            const thumbX = on ? '22px' : '2px';
            controls += `<div${id} style="${base(c)}display:flex;align-items:center;gap:10px;color:${color};cursor:pointer;" onclick="this.querySelector('.sw-track').style.background=this.querySelector('.sw-thumb').style.left==='2px'?'${accent}':'rgba(255,255,255,0.15)';this.querySelector('.sw-thumb').style.left=this.querySelector('.sw-thumb').style.left==='2px'?'22px':'2px';">${t === 'form_switch' ? `<span>${text}</span>` : ''}<div class="sw-track" style="width:44px;height:24px;background:${trackCol};border-radius:12px;position:relative;flex-shrink:0;transition:background 0.2s;"><div class="sw-thumb" style="position:absolute;left:${thumbX};top:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:left 0.2s;"></div></div>${t !== 'form_switch' ? `<span>${text}</span>` : ''}</div>\n`;
        } else if (t === 'slider' || t === 'form_slider') {
            const val = c.value !== undefined ? c.value : 50;
            controls += `<div${id} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><${t.startsWith('form') ? `span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span><` : ''}input type="range" min="0" max="100" value="${val}"${ev} style="width:100%;accent-color:${accent};cursor:pointer;"></div>\n`;
        } else if (t === 'number' || t === 'form_number') {
            const val = c.value !== undefined ? c.value : 0;
            controls += `<div${id} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span>` : ''}<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="number" value="${val}"${ev} style="background:${cbg || 'rgba(255,255,255,0.06)'};color:${color};border:1px solid ${border};border-radius:5px;padding:4px 8px;outline:none;font-size:${c.font_size||13}px;"></div>\n`;
        } else if (t === 'date' || t === 'form_date') {
            controls += `<div${id} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<span style="font-size:10px;font-weight:700;opacity:0.8;">${text}</span>` : ''}<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="date"${ev} style="background:${cbg || 'rgba(255,255,255,0.06)'};color:${color};border:1px solid ${border};border-radius:5px;padding:4px 8px;outline:none;font-size:${c.font_size||13}px;color-scheme:dark;"></div>\n`;
        } else if (t === 'color') {
            controls += `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${id} type="color" value="${c.value||'#38bdf8'}"${ev} style="${base(c)}padding:2px;border:1px solid ${border};border-radius:5px;cursor:pointer;background:transparent;">\n`;
        } else if (t === 'progress' || t === 'form_progress') {
            const val = c.value !== undefined ? c.value : 60;
            controls += `<div${id} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};">${t.startsWith('form') ? `<div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;"><span>${text}</span><span>${val}%</span></div>` : ''}<div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;"><div style="width:${val}%;height:100%;background:${accent};border-radius:4px;transition:width 0.3s;"></div></div></div>\n`;
        } else if (t === 'circular_progress') {
            const val = c.value !== undefined ? c.value : 75;
            const r = 36; const circ = 2 * Math.PI * r;
            const dash = circ * val / 100;
            controls += `<div${id} style="${base(c)}display:flex;align-items:center;justify-content:center;"><svg viewBox="0 0 100 100" width="${Math.min(c.width,c.height)}" height="${Math.min(c.width,c.height)}"><circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="10"/><circle cx="50" cy="50" r="${r}" fill="none" stroke="${accent}" stroke-width="10" stroke-dasharray="${dash.toFixed(1)} ${(circ-dash).toFixed(1)}" stroke-dashoffset="${circ*0.25}" stroke-linecap="round" transform="rotate(-90 50 50)"/><text x="50" y="54" text-anchor="middle" font-size="18" fill="${color}" font-weight="bold">${val}%</text></svg></div>\n`;
        } else if (t === 'rating') {
            controls += `<div${id} style="${base(c)}display:flex;align-items:center;gap:4px;font-size:${Math.max(c.height-8,16)}px;">${[1,2,3,4,5].map(i=>`<span style="cursor:pointer;color:${i<=3?'#f59e0b':'rgba(255,255,255,0.2)'};transition:color 0.1s;" onmouseover="this.parentNode.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<${i}?'#f59e0b':'rgba(255,255,255,0.2)'})" onmouseout="this.parentNode.querySelectorAll('span').forEach((s,j)=>{s.style.color=j<3?'#f59e0b':'rgba(255,255,255,0.2)'})">★</span>`).join('')}</div>\n`;
        } else if (t === 'stepper') {
            const val = c.value !== undefined ? c.value : 5;
            controls += `<div${id} style="${base(c)}display:flex;align-items:center;justify-content:space-between;background:${cbg||'rgba(255,255,255,0.06)'};border:1px solid ${border};border-radius:6px;padding:0 8px;color:${color};"><button onclick="const v=this.nextSibling;v.textContent=parseInt(v.textContent)-1;" style="background:none;border:none;color:${color};font-size:18px;cursor:pointer;line-height:1;">−</button><span style="font-weight:bold;">${val}</span><button onclick="const v=this.previousSibling;v.textContent=parseInt(v.textContent)+1;" style="background:none;border:none;color:${color};font-size:18px;cursor:pointer;line-height:1;">+</button></div>\n`;
        } else if (t === 'badge') {
            controls += `<div${id} style="${base(c)}background:${cbg||'#10b981'};color:${color};border-radius:20px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;">${text}</div>\n`;
        } else if (t === 'image') {
            controls += `<div${id} style="${base(c)}background:rgba(255,255,255,0.05);border:1px dashed ${border};border-radius:5px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:11px;">🖼️ ${text||'Image'}</div>\n`;
        } else if (t === 'divider') {
            controls += `<hr${id} style="${base(c)}height:1px;background:${border};border:none;padding:0;margin:0;">\n`;
        } else if (t === 'panel') {
            controls += `<div${id} style="${base(c)}background:${cbg};border:1px solid ${border};border-radius:8px;overflow:hidden;"><div style="padding:8px 12px;font-weight:700;font-size:11px;text-transform:uppercase;color:${accent};border-bottom:1px solid ${border};letter-spacing:0.5px;">${text}</div></div>\n`;
        } else if (t === 'drop_zone') {
            controls += `<div${id} style="${base(c)}background:rgba(56,189,248,0.04);border:2px dashed ${accent};border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:${color};opacity:0.85;cursor:pointer;" onmouseover="this.style.background='rgba(56,189,248,0.08)'" onmouseout="this.style.background='rgba(56,189,248,0.04)'"><span style="font-size:24px;">📥</span><span style="font-size:11px;">${text||'Drop files here'}</span></div>\n`;
        } else if (t === 'status_indicator') {
            const statusColor = c.status === 'error' ? '#ef4444' : c.status === 'warning' ? '#f59e0b' : c.status === 'inactive' ? 'rgba(255,255,255,0.3)' : '#10b981';
            controls += `<div${id} style="${base(c)}display:flex;align-items:center;gap:8px;color:${color};"><div style="width:10px;height:10px;background:${statusColor};border-radius:50%;box-shadow:0 0 6px ${statusColor};flex-shrink:0;"></div><span style="font-size:12px;font-weight:600;">${text}</span></div>\n`;
        } else if (t === 'metric_card') {
            controls += `<div${id} style="${base(c)}background:${cbg||'rgba(255,255,255,0.05)'};border:1px solid ${border};border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;"><div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;">${text}</div><div style="font-size:22px;font-weight:800;color:${color};">${c.value||'—'}</div><div style="font-size:10px;color:#10b981;">↑ ${c.trend||'0%'}</div></div>\n`;
        } else if (t === 'alert_banner') {
            const alertCol = c.alert_type === 'error' ? '#ef4444' : c.alert_type === 'warning' ? '#f59e0b' : c.alert_type === 'success' ? '#10b981' : accent;
            const alertIcon = c.alert_type === 'error' ? '❌' : c.alert_type === 'warning' ? '⚠️' : c.alert_type === 'success' ? '✅' : 'ℹ️';
            controls += `<div${id} style="${base(c)}background:${alertCol}22;border-left:4px solid ${alertCol};border-radius:0 6px 6px 0;display:flex;align-items:center;gap:10px;padding:0 12px;color:${color};"><span>${alertIcon}</span><span style="font-size:12px;">${text}</span></div>\n`;
        } else if (t === 'code_view') {
            controls += `<pre${id} style="${base(c)}background:#0d1117;border:1px solid ${border};border-radius:8px;padding:12px;color:#7dd3fc;font-family:'Fira Code','Courier New',monospace;font-size:12px;overflow:auto;margin:0;white-space:pre-wrap;word-break:break-all;">${text||'// code here'}</pre>\n`;
        } else if (t === 'metric_meter') {
            const val = c.value !== undefined ? c.value : 65;
            controls += `<div${id} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;color:${color};"><div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;"><span>${text}</span><span>${val}%</span></div><div style="width:100%;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;"><div style="width:${val}%;height:100%;background:linear-gradient(to right,#38bdf8,#818cf8);border-radius:3px;"></div></div></div>\n`;
        } else if (t === 'tag') {
            controls += `<div${id} style="${base(c)}display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 8px;">${(text||'tag1,tag2').split(',').map((tg: string)=>`<span style="background:rgba(56,189,248,0.15);color:${accent};border:1px solid rgba(56,189,248,0.3);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;">${tg.trim()}</span>`).join('')}</div>\n`;
        } else if (t === 'form_field' || t === 'form_password' || t === 'form_textarea') {
            const inputType = t === 'form_password' ? 'password' : (t === 'form_textarea' ? 'textarea' : 'text');
            controls += `<div${id} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;"><label style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</label>${inputType === 'textarea' ? `<textarea autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off'${ev} style="flex:1;background:rgba(255,255,255,0.06);color:${color};border:1px solid ${border};border-radius:5px;padding:6px 10px;resize:none;outline:none;font-size:${c.font_size||13}px;font-family:inherit;"></textarea>` : `<input autocapitalize='none' autocorrect='off' spellcheck='false' autocomplete='off' type="${inputType}"${ev} style="height:32px;background:rgba(255,255,255,0.06);color:${color};border:1px solid ${border};border-radius:5px;padding:0 10px;outline:none;font-size:${c.font_size||13}px;">`}</div>\n`;
        } else if (t === 'form_dropdown') {
            controls += `<div${id} style="${base(c)}display:flex;flex-direction:column;justify-content:center;gap:4px;"><label style="font-size:10px;font-weight:700;color:${color};opacity:0.8;">${text}</label><select${ev} style="height:32px;background:rgba(255,255,255,0.06);color:${color};border:1px solid ${border};border-radius:5px;padding:0 8px;outline:none;cursor:pointer;font-size:${c.font_size||13}px;"><option>Option 1</option><option>Option 2</option><option>Option 3</option></select></div>\n`;
        } else if (t === 'form_link') {
            controls += `<div${id} style="${base(c)}display:flex;justify-content:space-between;align-items:center;color:${color};"><span style="font-size:11px;opacity:0.8;">${text}</span><a href="#"${ev} style="color:${accent};text-decoration:none;font-size:11px;font-weight:700;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">View Link 🔗</a></div>\n`;
        } else if (t === 'path') {
            controls += `<div${id} style="${base(c)}display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.04);border:1px solid ${border};border-radius:5px;padding:0 10px;color:rgba(255,255,255,0.6);font-size:11px;overflow:hidden;">📁 ${(text||'Users › developer › project').replace(/›/g,'<span style="opacity:0.4;margin:0 4px;">›</span>')}</div>\n`;
        } else if (t === 'table') {
            controls += `<div${id} style="${base(c)}overflow:auto;border:1px solid ${border};border-radius:8px;"><table style="width:100%;border-collapse:collapse;font-size:12px;color:${color};"><thead><tr style="background:rgba(255,255,255,0.06);">${['ID','Name','Value','Status'].map(h=>`<th style="padding:8px 12px;text-align:left;font-weight:700;color:${accent};border-bottom:1px solid ${border};">${h}</th>`).join('')}</tr></thead><tbody>${[1,2,3].map(r=>`<tr style="border-bottom:1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">${['#'+r,'Item '+r,(r*100).toFixed(0),'Active'].map(cell=>`<td style="padding:8px 12px;">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>\n`;
        } else {
            // Fallback for any other type
            controls += `<div${id}${ev} style="${base(c)}background:${cbg};color:${color};border:1px solid ${border};border-radius:5px;display:flex;align-items:center;justify-content:center;">${text}</div>\n`;
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
</style>
</head>
<body spellcheck="false" autocapitalize="none" autocorrect="off">
${controls}
</body>
</html>`;
}


// Bind quitApp to exit the IDE
webview.bind("quitApp", () => {
    process.exit(0);
});

// Bind exportProject to save generated app to disk
webview.bind("exportProject", (specJson: string) => {
    try {
        const spec = JSON.parse(specJson);
        const exportDir = join(process.cwd(), "exported_project");
        mkdirSync(exportDir, { recursive: true });
        
        const previewHtml = generatePreviewHtml(spec);
        writeFileSync(join(exportDir, "index.html"), previewHtml);

        const appTs = `
import { SizeHint, Webview } from "webview-bun";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(import.meta.dir, "index.html"), "utf-8");
const wv = new Webview();
wv.setHTML(html);
wv.title = "${spec.title}";
wv.size = { width: ${spec.width || 800}, height: ${spec.height || 600}, hint: SizeHint.NONE };

// Add your custom backend bindings here!
wv.bind("backendAlert", (msg: string) => {
    console.log("Backend alert:", msg);
});

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
});

webview.run();