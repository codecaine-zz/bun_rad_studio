/**
 * ⚡ Bun RAD Studio Demo 6: Non-Visual Timer Control & Telemetry Studio
 * 
 * Demonstrates:
 * - Non-visual `timer` component running periodic background execution loops (`onTimer`) in Webview
 * - Real-time digital clock, uptime counter, and radial SVG circular gauges
 * - Interactive timer controls: Start (Resume/Start from Beginning), Pause, Reset, Interval Speed Slider (100ms – 2000ms)
 * - Continuous 60 FPS looping event ticks on WebKit native GUI timer loop
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml } from "../index.ts";

const formSpec = {
    title: "Demo 6 - Timer Control & Real-Time Telemetry Studio",
    width: 960,
    height: 700,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 24,
    spacing: 14,
    controls: [
        // Title Header
        { id: "lblTitle", type: "label", caption: "⏱️ Timer Control & Real-Time Telemetry Studio", left: 24, top: 16, width: 440, height: 26, font_size: 18, font_weight: "700" },
        { id: "lblSub", type: "label", caption: "Periodic background event ticks (`onTimer`), live metrics, progress meters, and dynamic speed adjustment", left: 24, top: 44, width: 440, height: 18, font_size: 11, font_color: "#38bdf8" },

        // Top Clock & Status KPI Cards (Spacious, perfectly fitted, no wrapping or truncation)
        { id: "metClock", type: "metric_card", text: "System Clock", value: "--:--:--", left: 475, top: 14, width: 145, height: 54, border_radius: 8, value_font_size: 16, value_color: "#38bdf8", background_color: "rgba(30, 41, 59, 0.75)", border_color: "rgba(56, 189, 248, 0.3)" },
        { id: "metTicks", type: "metric_card", text: "Total Ticks", value: "0", left: 630, top: 14, width: 145, height: 54, border_radius: 8, value_font_size: 19, value_color: "#c084fc", background_color: "rgba(30, 41, 59, 0.75)", border_color: "rgba(168, 85, 247, 0.3)" },
        { id: "metCountdown", type: "metric_card", text: "Cycle Countdown", value: "00:30", left: 785, top: 14, width: 150, height: 54, border_radius: 8, value_font_size: 19, value_color: "#34d399", background_color: "rgba(30, 41, 59, 0.75)", border_color: "rgba(16, 185, 129, 0.3)" },

        // Left Panel: Timer Controls & Speed Panel
        { id: "grpControls", type: "groupbox", title: "⚙️ Timer Execution & Speed Controls", left: 24, top: 80, width: 280, height: 420 },

        { id: "btnStart", type: "button", caption: "▶ Start / Resume", left: 40, top: 112, width: 118, height: 38, background_color: "#10b981", font_weight: "700" },
        { id: "btnPause", type: "button", caption: "⏸ Pause Timer", left: 166, top: 112, width: 118, height: 38, background_color: "#f59e0b", font_weight: "700" },
        { id: "btnReset", type: "button", caption: "↻ Reset to Beginning", left: 40, top: 158, width: 244, height: 36, background_color: "#334155" },

        { id: "lblSpeedTitle", type: "label", caption: "Timer Interval Speed (ms): 500ms", left: 40, top: 206, width: 244, height: 18, font_size: 11, font_weight: "600" },
        { id: "sldInterval", type: "slider", value: 500, min: 100, max: 2000, step: 50, left: 40, top: 226, width: 244, height: 26 },

        // Quick Preset Buttons
        { id: "lblPresets", type: "label", caption: "QUICK INTERVAL PRESETS:", left: 40, top: 260, width: 244, height: 14, font_size: 10, font_weight: "700", font_color: "#94a3b8" },
        { id: "btnSpd1", type: "button", caption: "⚡ 100ms", left: 40, top: 278, width: 76, height: 28, background_color: "#334155", font_size: 11, font_weight: "600" },
        { id: "btnSpd2", type: "button", caption: "⏱️ 500ms", left: 124, top: 278, width: 76, height: 28, background_color: "#0284c7", font_size: 11, font_weight: "600" },
        { id: "btnSpd3", type: "button", caption: "🐢 1000ms", left: 208, top: 278, width: 76, height: 28, background_color: "#334155", font_size: 11, font_weight: "600" },

        { id: "lblTimerStatus", type: "label", caption: "Status: 🟢 RUNNING (Tick interval: 500ms)", left: 40, top: 316, width: 244, height: 22, font_size: 11, font_weight: "600", font_color: "#10b981" },

        { id: "lblTaskProgress", type: "label", caption: "Automated Task Cycle Progress:", left: 40, top: 346, width: 244, height: 16, font_size: 11, font_weight: "600" },
        { id: "prgTask", type: "progress_bar", value: 0, left: 40, top: 366, width: 244, height: 18 },

        { id: "lblCountdown", type: "label", caption: "⏱️ Active Cycle Countdown: 00:30", left: 40, top: 396, width: 244, height: 32, font_size: 12, font_weight: "700", font_color: "#38bdf8", background_color: "rgba(56, 189, 248, 0.08)", border_color: "rgba(56, 189, 248, 0.25)", border_width: 1, border_radius: 6, text_align: "center" },
        { id: "lblEngineInfo", type: "label", caption: "⚡ WebKit requestAnimationFrame event loop", left: 40, top: 440, width: 244, height: 32, font_size: 10, font_color: "#64748b", text_align: "center" },

        // Center / Right Panel: Live Visual Dashboard
        { id: "grpDashboard", type: "groupbox", title: "📊 Live Telemetry Dashboard", left: 320, top: 80, width: 615, height: 420 },

        { id: "gauCpu", type: "circular_progress", value: 45, left: 360, top: 115, width: 130, height: 130 },
        { id: "lblCpuTitle", type: "label", caption: "CPU Load Telemetry", left: 360, top: 250, width: 130, height: 20, font_weight: "700", text_align: "center" },

        { id: "gauRam", type: "circular_progress", value: 62, left: 550, top: 115, width: 130, height: 130 },
        { id: "lblRamTitle", type: "label", caption: "RAM Memory Usage", left: 550, top: 250, width: 130, height: 20, font_weight: "700", text_align: "center" },

        { id: "gauNetwork", type: "circular_progress", value: 88, left: 740, top: 115, width: 130, height: 130 },
        { id: "lblNetTitle", type: "label", caption: "Network Bandwidth", left: 740, top: 250, width: 130, height: 20, font_weight: "700", text_align: "center" },

        { id: "lblTimelineHeader", type: "label", caption: "Live Process Pipeline Timeline:", left: 350, top: 285, width: 300, height: 20, font_weight: "600" },
        { id: "tmlPipeline", type: "timeline", text: "1. Poll Hardware Data, 2. Compute Statistics, 3. Sync Webview State, 4. Flush Telemetry Log", left: 350, top: 312, width: 555, height: 165 },

        // Bottom Action & Event Log Box
        { id: "grpLog", type: "groupbox", title: "⚡ Non-Visual Timer IPC Event Log (`onTimer`)", left: 24, top: 515, width: 911, height: 150 },
        { id: "lblTimerLog", type: "label", caption: "⏱️ [Timer Initialized] Ticking every 500ms. Watch the CPU load, RAM usage, circular gauges, and task progress update automatically...", left: 40, top: 545, width: 880, height: 100, font_size: 12, font_color: "#38bdf8" }
    ],
    non_visual_controls: [
        {
            id: "timer1",
            control_type: "timer",
            interval: 500,
            enabled: true,
            event_handlers: { onTimer: "on_timer1_tick" }
        }
    ]
};

let html = generatePreviewHtml(formSpec);

// Embed Self-Contained Client Timer Engine Script directly into HTML
const clientTimerScript = `
<script>
(function() {
    window.timerRunning = true;
    window.tickCounter = 0;
    window.countdownSeconds = 30;
    window.currentIntervalMs = 500;
    window.timer1_interval_id = null;

    window.setGaugeValue = function(containerId, value) {
        try {
            const c = document.getElementById(containerId);
            if (!c) return;
            const circles = c.querySelectorAll("circle");
            const text = c.querySelector("text");
            if (circles && circles.length >= 2) {
                const r = 36;
                const circ = 2 * Math.PI * r;
                const dash = circ * (value / 100);
                circles[1].setAttribute("stroke-dasharray", dash.toFixed(1) + " " + (circ - dash).toFixed(1));
            }
            if (text) text.textContent = value + "%";
        } catch(e) {}
    };

    window.runTimerLoop = function(ms) {
        if (window.timer1_interval_id) clearInterval(window.timer1_interval_id);
        const interval = ms || window.currentIntervalMs || 500;
        window.currentIntervalMs = interval;
        window.timer1_interval_id = setInterval(function() {
            if (window.on_timer1_tick) window.on_timer1_tick();
        }, interval);
    };

    window.startTimerStudio = function() {
        const wasPaused = (window.tickCounter > 0);
        window.timerRunning = true;
        const ms = window.currentIntervalMs || 500;
        window.runTimerLoop(ms);
        if (window.on_timer1_tick) window.on_timer1_tick();
        const statusEl = document.getElementById("lblTimerStatus");
        if (statusEl) {
            statusEl.textContent = "Status: 🟢 RUNNING (Tick interval: " + ms + "ms)";
            statusEl.style.color = "#10b981";
        }
        const logEl = document.getElementById("lblTimerLog");
        if (logEl) {
            const actionMsg = wasPaused ? "▶ [Timer Resumed] Resumed ticking from tick #" + window.tickCounter : "▶ [Timer Started] Started ticking from tick #1";
            logEl.textContent = actionMsg;
        }
    };

    window.pauseTimerStudio = function() {
        window.timerRunning = false;
        const statusEl = document.getElementById("lblTimerStatus");
        if (statusEl) {
            statusEl.textContent = "Status: ⏸ PAUSED (Tick #" + window.tickCounter + ")";
            statusEl.style.color = "#f59e0b";
        }
        const logEl = document.getElementById("lblTimerLog");
        if (logEl) logEl.textContent = "⏸ [Timer Paused] Loop paused at tick #" + window.tickCounter + ". Click Start / Resume to continue.";
    };

    window.resetTimerStudio = function() {
        window.timerRunning = false;
        window.tickCounter = 0;
        window.countdownSeconds = 30;

        const clockEl = document.getElementById("metClock");
        if (clockEl && clockEl.children && clockEl.children[1]) clockEl.children[1].textContent = "--:--:--";

        const ticksEl = document.getElementById("metTicks");
        if (ticksEl && ticksEl.children && ticksEl.children[1]) ticksEl.children[1].textContent = "0";

        if (window.setGaugeValue) {
            window.setGaugeValue("gauCpu", 45);
            window.setGaugeValue("gauRam", 62);
            window.setGaugeValue("gauNetwork", 88);
        }

        const prgFill = document.querySelector("#prgTask > div > div");
        if (prgFill) prgFill.style.width = "0%";

        const cdLabel = document.getElementById("lblCountdown");
        if (cdLabel) cdLabel.textContent = "⏱️ Active Cycle Countdown: 00:30";

        const cdCard = document.getElementById("metCountdown");
        if (cdCard && cdCard.children && cdCard.children[1]) cdCard.children[1].textContent = "00:30";

        const statusEl = document.getElementById("lblTimerStatus");
        if (statusEl) {
            statusEl.textContent = "Status: ⏹ RESET (Click Start / Resume to begin)";
            statusEl.style.color = "#38bdf8";
        }

        const logEl = document.getElementById("lblTimerLog");
        if (logEl) logEl.textContent = "↻ [Timer Reset] Counter reset to tick #0. Click Start to run from beginning.";
    };

    window.on_timer1_tick = function() {
        if (!window.timerRunning) return;
        window.tickCounter++;

        const now = new Date();
        const clockStr = now.toLocaleTimeString();

        const clockEl = document.getElementById("metClock");
        if (clockEl && clockEl.children && clockEl.children[1]) clockEl.children[1].textContent = clockStr;

        const ticksEl = document.getElementById("metTicks");
        if (ticksEl && ticksEl.children && ticksEl.children[1]) ticksEl.children[1].textContent = String(window.tickCounter);

        const cpu = Math.floor(35 + Math.random() * 45);
        const ram = Math.floor(55 + Math.random() * 20);
        const net = Math.floor(70 + Math.random() * 25);

        window.setGaugeValue("gauCpu", cpu);
        window.setGaugeValue("gauRam", ram);
        window.setGaugeValue("gauNetwork", net);

        const taskProg = (window.tickCounter * 5) % 105;
        const prgFill = document.querySelector("#prgTask > div > div");
        if (prgFill) prgFill.style.width = taskProg + "%";

        if (window.tickCounter % 2 === 0) {
            window.countdownSeconds = window.countdownSeconds > 0 ? window.countdownSeconds - 1 : 30;
            const cdStr = window.countdownSeconds < 10 ? "0" + window.countdownSeconds : String(window.countdownSeconds);
            const cdLabel = document.getElementById("lblCountdown");
            if (cdLabel) cdLabel.textContent = "⏱️ Active Cycle Countdown: 00:" + cdStr;
            const cdCard = document.getElementById("metCountdown");
            if (cdCard && cdCard.children && cdCard.children[1]) cdCard.children[1].textContent = "00:" + cdStr;
        }

        const log = document.getElementById("lblTimerLog");
        if (log) log.textContent = "⏱️ [onTimer Tick #" + window.tickCounter + "] Clock: " + clockStr + " | CPU: " + cpu + "% | RAM: " + ram + "% | Net: " + net + "% | Speed: " + window.currentIntervalMs + "ms";
    };

    window.setSpeed = function(ms) {
        window.currentIntervalMs = ms;
        window.runTimerLoop(ms);
        const sld = document.getElementById("sldInterval");
        if (sld) {
            const range = sld.querySelector("input[type='range']") || sld;
            range.value = ms;
            const valSpan = sld.querySelector(".slider-val");
            if (valSpan) valSpan.textContent = ms;
        }
        const titleEl = document.getElementById("lblSpeedTitle");
        if (titleEl) titleEl.textContent = "Timer Interval Speed (ms): " + ms + "ms";
        if (window.timerRunning) {
            const statusEl = document.getElementById("lblTimerStatus");
            if (statusEl) statusEl.textContent = "Status: 🟢 RUNNING (Tick interval: " + ms + "ms)";
        }
        const logEl = document.getElementById("lblTimerLog");
        if (logEl) logEl.textContent = "⚙️ [Interval Speed] Background timer tick rate set to " + ms + "ms.";
    };

    // Auto-start loop on load
    window.runTimerLoop(500);
})();
</script>
`;

html = html.replace("</body>", clientTimerScript + "\n</body>");

const wv = new Webview();
wv.title = "Bun RAD Studio - Demo 6: Timer Control & Telemetry Studio";
wv.size = { width: 960, height: 700, hint: SizeHint.NONE };

function execJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("JS Error:", e); }
}

// 1. Start / Resume Timer IPC Event
wv.bind("on_btnStart_click", () => {
    console.log("⚡ [IPC] on_btnStart_click triggered");
    execJS("if (window.startTimerStudio) window.startTimerStudio();");
});

// 2. Pause Timer IPC Event
wv.bind("on_btnPause_click", () => {
    console.log("⚡ [IPC] on_btnPause_click triggered");
    execJS("if (window.pauseTimerStudio) window.pauseTimerStudio();");
});

// 3. Reset Counter & Telemetry IPC Event (Resets to beginning)
wv.bind("on_btnReset_click", () => {
    console.log("⚡ [IPC] on_btnReset_click triggered");
    execJS("if (window.resetTimerStudio) window.resetTimerStudio();");
});

// 4. Interval Speed Slider Handler
wv.bind("on_sldInterval_change", (val: any) => {
    console.log("⚡ [IPC] on_sldInterval_change:", val);
    execJS(`
        (function() {
            const sld = document.getElementById("sldInterval");
            const range = sld ? (sld.querySelector("input[type='range']") || sld) : null;
            const ms = range ? (parseInt(range.value) || 500) : 500;
            if (window.setSpeed) window.setSpeed(ms);
        })();
    `);
});

// 5. Preset Speed Buttons
wv.bind("on_btnSpd1_click", () => {
    execJS("if (window.setSpeed) window.setSpeed(100);");
});
wv.bind("on_btnSpd2_click", () => {
    execJS("if (window.setSpeed) window.setSpeed(500);");
});
wv.bind("on_btnSpd3_click", () => {
    execJS("if (window.setSpeed) window.setSpeed(1000);");
});

// Set HTML AFTER all binds are registered
wv.setHTML(html);

console.log("🚀 Running Bun RAD Studio Demo 6: Non-Visual Timer Control & Telemetry Studio...");
wv.run();
process.exit(0);
