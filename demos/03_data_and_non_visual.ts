/**
 * ⚡ Bun RAD Studio Demo 3: Data-Aware Controls, Timer & Monospaced Code View
 * 
 * Demonstrates:
 * - Data-Aware Controls (db_grid, db_navigator, db_input)
 * - Non-Visual Component (timer with onTimer event)
 * - Interactive Code Editor View (code_view)
 * - Progress Bars, Gauges, Ratings, and File Dialogs
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml } from "../index.ts";

const formSpec = {
    title: "Demo 3 - Data Grid, Timer & Code View",
    width: 960,
    height: 700,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 24,
    spacing: 14,
    controls: [
        { id: "lblTitle", type: "label", caption: "🗄️ Enterprise Data Grid & Live Timer Controls", left: 24, top: 20, width: 550, height: 28, font_size: 18, font_weight: "700" },

        // DB Navigator Controls
        { id: "dbNav", type: "db_navigator", left: 24, top: 60, width: 340, height: 38 },
        { id: "btnRefreshDb", type: "button", caption: "↻ Refresh Data", left: 375, top: 60, width: 120, height: 38, background_color: "#334155" },

        // Enterprise DB Grid
        { 
            id: "dbGridCustomers", 
            type: "db_grid", 
            left: 24, 
            top: 110, 
            width: 470, 
            height: 240,
            dataset: [
                { ID: 101, Customer: "Acme Corp", Industry: "SaaS", ARR: "$120,000", Status: "Active" },
                { ID: 102, Customer: "Stark Tech", Industry: "Robotics", ARR: "$450,000", Status: "Enterprise" },
                { ID: 103, Customer: "Cyberdyne", Industry: "AI & ML", ARR: "$280,000", Status: "Active" },
                { ID: 104, Customer: "Wayne Enterprises", Industry: "Defense", ARR: "$890,000", Status: "VIP" },
                { ID: 105, Customer: "Hooli", Industry: "Cloud", ARR: "$310,000", Status: "Trial" }
            ] 
        },

        // Monospaced Code View Component
        { id: "lblCode", type: "label", caption: "Interactive Monospaced Code View (code_view):", left: 515, top: 60, width: 300, height: 20, font_weight: "600" },
        { 
            id: "codeScript", 
            type: "code_view", 
            text: `// Live Bun TypeScript Query Script\nimport { Database } from "bun:sqlite";\nconst db = new Database("customers.sqlite");\nconst query = db.query("SELECT * FROM customers WHERE status = 'Active'");\nconsole.log(query.all());`, 
            left: 515, 
            top: 85, 
            width: 420, 
            height: 265 
        },

        // Timer, Progress Bar & Circular Gauge Section
        { id: "lblGauge", type: "label", caption: "Non-Visual Timer (1000ms Interval) & Live Gauge Progress:", left: 24, top: 370, width: 500, height: 20, font_weight: "600" },
        { id: "prgProgress", type: "progress_bar", value: 45, left: 24, top: 395, width: 340, height: 24 },
        { id: "lblPrgVal", type: "label", caption: "CPU Load: 45%", left: 375, top: 395, width: 120, height: 24, font_weight: "700", font_color: "#38bdf8" },

        { id: "gauCpu", type: "gauge", value: 68, caption: "System Load", left: 515, top: 370, width: 130, height: 110 },
        { id: "ratQuality", type: "rating", value: 5, caption: "Customer Satisfaction", left: 665, top: 370, width: 180, height: 50 },

        // Action Log
        { id: "pnlLog", type: "groupbox", title: "⚡ Timer & Database Event Log", left: 24, top: 500, width: 910, height: 160 },
        { id: "lblTimerLog", type: "label", caption: "Timer event ticks every 1000ms. Watch the CPU load metric update automatically...", left: 40, top: 535, width: 870, height: 100, font_size: 13, font_color: "#38bdf8" }
    ]
};

const html = generatePreviewHtml(formSpec);
const wv = new Webview();
wv.setHTML(html);
wv.title = "Bun RAD Studio - Demo 3: DB Grid, Timer & Code View";
wv.size = { width: 960, height: 700, hint: SizeHint.NONE };

let loadVal = 45;
let tickCount = 0;

function execJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("JS Error:", e); }
}

// Simulate Non-Visual Timer Event Tick (1000ms)
setInterval(() => {
    tickCount++;
    loadVal = (loadVal + Math.floor(Math.random() * 11) - 5);
    if (loadVal < 20) loadVal = 25;
    if (loadVal > 95) loadVal = 90;

    execJS(`
        const bar = document.getElementById("prgProgress");
        if (bar) {
            const fill = bar.querySelector("div");
            if (fill) fill.style.width = "${loadVal}%";
        }
        document.getElementById("lblPrgVal").textContent = "CPU Load: ${loadVal}%";
        document.getElementById("lblTimerLog").textContent = "⏱️ [onTimer Event Tick #${tickCount}] CPU Load = ${loadVal}% | Grid Status = Active | Dataset Rows = 5 | Time: " + new Date().toLocaleTimeString();
    `);
}, 1000);

// DB Navigator Refresh
wv.bind("on_btnRefreshDb_click", () => {
    execJS(`
        document.getElementById("lblTimerLog").textContent = "↻ [Database] Refreshed dataset connection. All 5 records re-indexed.";
    `);
});

console.log("🚀 Running Bun RAD Studio Demo 3: DB Grid, Timer & Code View...");
wv.run();
