/**
 * ⚡ Bun RAD Studio Demo 2: Advanced Modern Visual Controls & Helpers
 * 
 * Demonstrates:
 * - 10 Advanced Modern Controls (segmented_control, tree_view, avatar_group, stat_chart, accordion, breadcrumb, timeline, toast_card, time_picker, rich_select)
 * - Helper wrappers (setSegmentedSelected, setStatChart, setToast, setTimePickerValue, setAccordionOpen, setTimelineSteps, setBreadcrumbs, setTreeNodes, setAvatarGroup, setRichSelectText)
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml } from "../index.ts";

const formSpec = {
    title: "Demo 2 - Advanced Modern Controls & Helper Wrappers",
    width: 960,
    height: 720,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 24,
    spacing: 14,
    controls: [
        { id: "lblHeader", type: "label", caption: "🚀 Advanced Modern Control Palette & Dynamic Helpers", left: 24, top: 20, width: 550, height: 28, font_size: 18, font_weight: "700" },

        // 1. Segmented Control
        { id: "lblSeg", type: "label", caption: "Segmented Filter Selector:", left: 24, top: 60, width: 200, height: 20, font_weight: "600" },
        { id: "segFilter", type: "segmented_control", caption: "Overview, Analytics, Realtime, Reports", left: 24, top: 85, width: 420, height: 38 },

        // 2. Stat Chart Card
        { id: "statKpi", type: "stat_chart", caption: "Monthly Active Users", value: "48,290", trend: "+14.8%", left: 470, top: 85, width: 220, height: 90 },

        // 3. Toast Card
        { id: "toastAlert", type: "toast_card", title: "System Update Available", message: "Bun RAD Studio v1.3.14 is ready to install.", left: 705, top: 85, width: 230, height: 90 },

        // 4. Breadcrumbs & Searchable Rich Select
        { id: "crumbNav", type: "breadcrumb", caption: "Home, Projects, RAD Studio, Dashboard", left: 24, top: 140, width: 420, height: 32 },

        { id: "lblSelect", type: "label", caption: "Searchable Combobox:", left: 470, top: 190, width: 160, height: 20, font_weight: "600" },
        { id: "cmbFramework", type: "rich_select", text: "⚡ Bun Runtime (Default)", left: 470, top: 215, width: 220, height: 36 },

        // 5. Precision Time Picker
        { id: "lblTime", type: "label", caption: "Time Picker:", left: 705, top: 190, width: 120, height: 20, font_weight: "600" },
        { id: "pkTime", type: "time_picker", value: "09:41", left: 705, top: 215, width: 140, height: 36 },

        // 6. Tree View & Avatars
        { id: "lblTree", type: "label", caption: "Directory Tree Explorer:", left: 24, top: 190, width: 200, height: 20, font_weight: "600" },
        { id: "treeFiles", type: "tree_view", text: "📁 src/, 📄 index.ts, 📄 ide.html, 📁 tests/, 📄 api.test.ts", left: 24, top: 215, width: 420, height: 140 },

        // 7. Avatar Group
        { id: "lblAvatars", type: "label", caption: "Active Team Members:", left: 470, top: 265, width: 200, height: 20, font_weight: "600" },
        { id: "avGroup", type: "avatar_group", text: "JD, AM, SK, DL, +4", left: 470, top: 290, width: 220, height: 42 },

        // 8. Timeline
        { id: "lblTimeline", type: "label", caption: "Activity Progress Timeline:", left: 705, top: 265, width: 200, height: 20, font_weight: "600" },
        { id: "tmLine", type: "timeline", text: "Design Completed, Tests Passed, Deployment Ready", left: 705, top: 290, width: 230, height: 110 },

        // 9. Accordion
        { id: "accPanel", type: "accordion", title: "📌 Component Configuration & Specs", text: "All 10 modern visual controls are styled with dark/light themes, HSL accent colors, and CSS micro-animations.", left: 24, top: 370, width: 665, height: 90 },

        // Dynamic Action Control Panel
        { id: "pnlActions", type: "groupbox", title: "⚡ Live Dynamic Helper Wrapper Tester", left: 24, top: 480, width: 910, height: 200 },

        { id: "btnUpdateSeg", type: "button", caption: "1. Select 'Analytics'", left: 40, top: 515, width: 160, height: 36, background_color: "#38bdf8", font_color: "#0f172a", event_handlers: { onClick: "on_btnUpdateSeg_click" } },
        { id: "btnUpdateStat", type: "button", caption: "2. Update KPI Stat", left: 210, top: 515, width: 160, height: 36, background_color: "#38bdf8", font_color: "#0f172a", event_handlers: { onClick: "on_btnUpdateStat_click" } },
        { id: "btnUpdateToast", type: "button", caption: "3. Trigger Error Toast", left: 380, top: 515, width: 170, height: 36, background_color: "#ef4444", event_handlers: { onClick: "on_btnUpdateToast_click" } },
        { id: "btnUpdateTimeline", type: "button", caption: "4. Advance Timeline", left: 560, top: 515, width: 170, height: 36, background_color: "#10b981", event_handlers: { onClick: "on_btnUpdateTimeline_click" } },
        { id: "btnUpdateTree", type: "button", caption: "5. Update Tree Nodes", left: 740, top: 515, width: 170, height: 36, background_color: "#6366f1", event_handlers: { onClick: "on_btnUpdateTree_click" } },

        { id: "lblHelperLog", type: "label", caption: "Click any helper button above to dynamically update controls via TypeScript wrappers...", left: 40, top: 570, width: 870, height: 90, font_size: 13, font_color: "#38bdf8" }
    ]
};

const html = generatePreviewHtml(formSpec);
const wv = new Webview();
wv.setHTML(html);
wv.title = "Bun RAD Studio - Demo 2: Advanced Modern Controls";
wv.size = { width: 960, height: 720, hint: SizeHint.NONE };

function execJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("JS Error:", e); }
}

// 1. Select 'Analytics' in Segmented Control
wv.bind("on_btnUpdateSeg_click", () => {
    console.log("⚡ [IPC] Selecting Analytics tab in Segmented Control...");
    execJS(`
        if (window.setSegmentedSelected) {
            window.setSegmentedSelected("segFilter", "Analytics");
        } else {
            const container = document.getElementById("segFilter");
            if (container) {
                container.dataset.value = "Analytics";
                container.querySelectorAll("button").forEach(b => {
                    const isSel = b.textContent.trim() === "Analytics";
                    b.style.background = isSel ? "#38bdf8" : "transparent";
                    b.style.color = isSel ? "#ffffff" : "inherit";
                });
            }
        }
        document.getElementById("lblHelperLog").textContent = "✅ Segmented Control updated: Selected 'Analytics' tab via setSegmentedSelected helper.";
    `);
});

// 2. Update KPI Stat Chart
wv.bind("on_btnUpdateStat_click", () => {
    console.log("⚡ [IPC] Updating Stat Chart...");
    execJS(`
        if (window.setStatChart) {
            window.setStatChart("statKpi", "Quarterly Revenue", "$1,248,900", "+32.4%");
        } else {
            const c = document.getElementById("statKpi");
            if (c) {
                const t = c.querySelector(".stat-title") || c.querySelector("span"); if (t) t.textContent = "Quarterly Revenue";
                const v = c.querySelector(".stat-val") || c.querySelector("div:nth-child(2)"); if (v) v.textContent = "$1,248,900";
                const tr = c.querySelector(".stat-trend") || c.querySelectorAll("span")[1]; if (tr) tr.textContent = "+32.4%";
            }
        }
        document.getElementById("lblHelperLog").textContent = "📈 Stat Chart updated: Revenue = $1,248,900 (+32.4%) via setStatChart helper.";
    `);
});

// 3. Trigger Error Toast
wv.bind("on_btnUpdateToast_click", () => {
    console.log("⚡ [IPC] Triggering Toast Alert...");
    execJS(`
        if (window.setToast) {
            window.setToast("toastAlert", "Database Alert", "High latency detected on primary read replica.", "error");
        } else {
            const c = document.getElementById("toastAlert");
            if (c) {
                const t = c.querySelector("span:nth-child(1)"); if (t) t.textContent = "Database Alert";
                const m = c.querySelector("span:nth-child(2)"); if (m) m.textContent = "High latency detected on primary read replica.";
                c.style.borderLeftColor = "#ef4444";
            }
        }
        document.getElementById("lblHelperLog").textContent = "⚠️ Toast Card updated: Border set to red alert color via setToast helper.";
    `);
});

// 4. Advance Activity Timeline Steps
wv.bind("on_btnUpdateTimeline_click", () => {
    console.log("⚡ [IPC] Advancing Timeline Steps...");
    execJS(`
        if (window.setTimelineSteps) {
            window.setTimelineSteps("tmLine", ["Build Passed", "Tests Verified", "Deployed to Prod"]);
        } else {
            const c = document.getElementById("tmLine");
            if (c) {
                c.innerHTML = '<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><span style="color:#10b981">✓</span> Build Passed</div><div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;"><span style="color:#10b981">✓</span> Tests Verified</div><div style="display:flex; align-items:center; gap:8px;"><span style="color:#38bdf8">⚡</span> Deployed to Prod</div>';
            }
        }
        document.getElementById("lblHelperLog").textContent = "🚀 Timeline steps updated: Build Passed → Tests Verified → Deployed to Prod via setTimelineSteps helper.";
    `);
});

// 5. Update Directory Tree Nodes
wv.bind("on_btnUpdateTree_click", () => {
    console.log("⚡ [IPC] Updating Tree Nodes with pulse glow & badges...");
    execJS(`
        const newNodes = ["📁 demos/ [UPDATED]", "📄 01_standard_controls.ts", "📄 02_advanced_modern_controls.ts", "📄 03_data_and_non_visual.ts", "📄 04_window_placement_and_pin.ts"];
        if (typeof window.setTreeNodes === "function") {
            window.setTreeNodes("treeFiles", newNodes);
        } else {
            const container = document.getElementById("treeFiles");
            if (container) {
                let h = "";
                newNodes.forEach((nodeText, idx) => {
                    const isFolder = nodeText.includes("📁") || idx === 0;
                    const indent = idx === 0 ? 0 : (idx === 1 ? 16 : 32);
                    const arrow = isFolder ? "▼" : " ";
                    const selStyle = idx === 0 ? "background:rgba(56,189,248,0.25);color:#38bdf8;font-weight:700;" : "";
                    const badge = idx === 0
                        ? '<span style="font-size:9px;font-weight:800;background:#0284c7;color:#fff;padding:2px 8px;border-radius:10px;margin-left:8px;flex-shrink:0;">UPDATED</span>'
                        : '<span style="font-size:9px;font-weight:800;background:#10b981;color:#fff;padding:2px 8px;border-radius:10px;margin-left:8px;flex-shrink:0;">NEW</span>';
                    h += '<div class="tree-node" style="padding:6px 10px;padding-left:' + (indent + 8) + 'px;border-radius:6px;display:flex;align-items:center;justify-content:space-between;width:100%;box-sizing:border-box;cursor:pointer;' + selStyle + '"><div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden;"><span style="width:12px;font-size:9px;opacity:0.8;flex-shrink:0;">' + arrow + '</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + nodeText + '</span></div>' + badge + '</div>';
                });
                container.innerHTML = h;
                container.style.transition = "box-shadow 0.3s, border-color 0.3s";
                container.style.boxShadow = "0 0 25px #38bdf8";
                container.style.borderColor = "#38bdf8";
                setTimeout(() => { container.style.boxShadow = ""; container.style.borderColor = ""; }, 1500);
            }
        }
        document.getElementById("lblHelperLog").textContent = "📁 Directory Tree updated with vibrant pulse highlight & NEW badges via setTreeNodes helper.";
    `);
});

console.log("🚀 Running Bun RAD Studio Demo 2: Advanced Modern Controls...");
wv.run();
