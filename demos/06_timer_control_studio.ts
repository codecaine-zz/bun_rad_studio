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
        { id: "lblTitle", type: "label", caption: "⏱️ Non-Visual Timer Control & Real-Time Telemetry Studio", left: 24, top: 18, width: 620, height: 28, font_size: 18, font_weight: "700" },
        { id: "lblSub", type: "label", caption: "Periodic background event ticks (`onTimer`), live metrics, progress meters, and dynamic speed adjustment", left: 24, top: 48, width: 620, height: 18, font_size: 11, font_color: "#38bdf8" },

        // Top Clock & Status KPI Cards
        { id: "metClock", type: "metric_card", text: "Digital System Clock", value: "--:--:--", trend: "500ms Sync", left: 660, top: 15, width: 135, height: 55, border_radius: 8 },
        { id: "metTicks", type: "metric_card", text: "Total Timer Ticks", value: "0", trend: "Active Loop", left: 805, top: 15, width: 130, height: 55, border_radius: 8 },

        // Left Panel: Timer Controls & Speed Panel
        { id: "grpControls", type: "groupbox", title: "⚙️ Timer Execution & Speed Controls", left: 24, top: 80, width: 280, height: 420 },

        { id: "btnStart", type: "button", caption: "▶ Start / Resume", left: 40, top: 115, width: 115, height: 38, background_color: "#10b981", font_weight: "700" },
        { id: "btnPause", type: "button", caption: "⏸ Pause Timer", left: 165, top: 115, width: 120, height: 38, background_color: "#f59e0b", font_weight: "700" },
        { id: "btnReset", type: "button", caption: "↻ Reset to Beginning", left: 40, top: 165, width: 245, height: 36, background_color: "#334155" },

        { id: "lblSpeedTitle", type: "label", caption: "Timer Interval Speed (ms): 500ms", left: 40, top: 220, width: 245, height: 18, font_size: 11, font_weight: "600" },
        { id: "sldInterval", type: "slider", value: 500, left: 40, top: 245, width: 245, height: 24 },

        { id: "lblTimerStatus", type: "label", caption: "Status: 🟢 RUNNING (Tick interval: 500ms)", left: 40, top: 285, width: 245, height: 24, font_size: 11, font_weight: "600", font_color: "#10b981" },

        { id: "lblTaskProgress", type: "label", caption: "Automated Task Cycle Progress:", left: 40, top: 325, width: 245, height: 16, font_size: 11, font_weight: "600" },
        { id: "prgTask", type: "progress_bar", value: 0, left: 40, top: 345, width: 245, height: 24 },

        { id: "lblCountdown", type: "label", caption: "Countdown Timer: 00:30", left: 40, top: 385, width: 245, height: 24, font_size: 13, font_weight: "700", font_color: "#38bdf8" },

        // Center / Right Panel: Live Visual Dashboard
        { id: "grpDashboard", type: "groupbox", title: "📊 Live Telemetry Dashboard", left: 320, top: 80, width: 615, height: 420 },

        { id: "gauCpu", type: "circular_progress", value: 45, left: 350, top: 115, width: 130, height: 130 },
        { id: "lblCpuTitle", type: "label", caption: "CPU Load Telemetry", left: 350, top: 255, width: 130, height: 20, font_weight: "700", text_align: "center" },

        { id: "gauRam", type: "circular_progress", value: 62, left: 510, top: 115, width: 130, height: 130 },
        { id: "lblRamTitle", type: "label", caption: "RAM Memory Usage", left: 510, top: 255, width: 130, height: 20, font_weight: "700", text_align: "center" },

        { id: "gauNetwork", type: "circular_progress", value: 88, left: 670, top: 115, width: 130, height: 130 },
        { id: "lblNetTitle", type: "label", caption: "Network Bandwidth", left: 670, top: 255, width: 130, height: 20, font_weight: "700", text_align: "center" },

        { id: "lblTimelineHeader", type: "label", caption: "Live Process Pipeline Timeline:", left: 350, top: 295, width: 250, height: 20, font_weight: "600" },
        { id: "tmlPipeline", type: "timeline", text: "1. Poll Hardware Data, 2. Compute Statistics, 3. Sync Webview State, 4. Flush Telemetry Log", left: 350, top: 320, width: 550, height: 160 },

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
        if (cdLabel) cdLabel.textContent = "Countdown Timer: 00:30";

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
            if (cdLabel) cdLabel.textContent = "Countdown Timer: 00:" + cdStr;
        }

        const log = document.getElementById("lblTimerLog");
        if (log) log.textContent = "⏱️ [onTimer Tick #" + window.tickCounter + "] Clock: " + clockStr + " | CPU: " + cpu + "% | RAM: " + ram + "% | Net: " + net + "% | Speed: " + window.currentIntervalMs + "ms";
    };

    // Auto-start loop on load
    window.runTimerLoop(500);
})();
</script>
`;

html = html.replace("</body>", clientTimerScript + "\n</body>");

const wv = new Webview();
wv.setHTML(html);
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
            const ms = sld ? (parseInt(sld.value) || 500) : 500;
            if (window.runTimerLoop) window.runTimerLoop(ms);
            document.getElementById("lblSpeedTitle").textContent = "Timer Interval Speed (ms): " + ms + "ms";
            if (window.timerRunning) {
                document.getElementById("lblTimerStatus").textContent = "Status: 🟢 RUNNING (Tick interval: " + ms + "ms)";
            }
            document.getElementById("lblTimerLog").textContent = "⚙️ [Interval Speed] Background timer tick rate set to " + ms + "ms.";
        })();
    `);
});

console.log("🚀 Running Bun RAD Studio Demo 6: Non-Visual Timer Control & Telemetry Studio...");
wv.run();
