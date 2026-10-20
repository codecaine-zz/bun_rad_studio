/**
 * God-Mode Tutorial 02 — VLang Parity, Enterprise Telemetry & Two-Way Reactive State
 *
 * Run:  bun run examples/god_mode_tutorial/02_enterprise_telemetry_reactive.ts
 */
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";

export function createEnterpriseTelemetryReactive(opts: { fullscreen?: boolean } = {}): SimpleWindow {
  const win = newSimpleWindow("Enterprise Telemetry & Reactive State Studio", 840, 640, {
    theme: "apple_dark", padding: 14, spacing: 8, ...opts,
  });

  win.addHeroBanner(
    "God-Mode Telemetry & Reactive Store",
    "VLang SimpleGUI parity widgets, Studio extended controls & two-way state bindings",
    "v1.5.0 RAD",
  );

  // VLang Parity & Telemetry Row
  win.beginCard("🎛️ VLang Parity & Multi-Rig Telemetry");
  win.beginRow();
  win.addScoreCard("Frame Pacing", 99.8, "120Hz ProMotion / OLED", "A+").width(180);
  win.addDonutChart("donutVram", "VRAM Pool", 74, "142 / 192 GB").width(180);
  win.addActivityRings("ringsRig", [
    { label: "M4", percent: 96, color: "#fa114f" },
    { label: "RTX", percent: 92, color: "#a1ff00" },
  ]).width(180);
  win.addKnob("knobOverclock", 0, 100, 85).width(95);
  win.endRow();

  win.beginRow();
  win.addModeControl("modeRig", ["Mac M4 Ultra", "Win11 RTX 5090", "Linux 96-Core"], "Mac M4 Ultra").width(265);
  win.addPillToggle("pillShader", ["Plain UI", "10-Engine FX"], 1).width(165);
  win.addCountBadge("badgeNodes", "Active Cores", 96, "success").width(120);
  win.copyButton("Copy Rig Token", "godmode-v1.5-xdr-5090", { width: 155 });
  win.endRow();
  win.endCard();

  // Two-Way Reactive State Store Card
  win.beginCard("🔄 Two-Way Reactive State Store (bindState + onStateChange)");
  win.setState("clusterName", "Omega-Singularity-Cluster");
  win.setState("powerTarget", 88);

  win.beginRow();
  win.addLabel("Cluster Name:").width(110);
  win.addTextInput("Omega-Singularity-Cluster", "Cluster name...")
    .id("txtCluster").width(260).bindState("clusterName");
  win.addLabel("Power Limit:").width(90);
  win.addSlider(0, 100, 88).id("sldPower").width(200).bindState("powerTarget");
  win.endRow();

  win.addLabel("Live State → Omega-Singularity-Cluster @ 88% TDP")
    .id("lblStateSummary").font(13, "#38bdf8").bold();

  const syncSummary = (w: SimpleWindow) => {
    const name = w.getStateOr("clusterName", "Cluster");
    const pwr = w.getState("powerTarget") ?? 0;
    w.setText("lblStateSummary", `Live State → ${name} @ ${pwr}% TDP`);
    w.setStatusBarText(`Reactive store synced: ${name} (${pwr}%)`);
  };
  win.onStateChange("clusterName", (w) => syncSummary(w));
  win.onStateChange("powerTarget", (w) => syncSummary(w));

  win.beginRow();
  win.addButton("⚡ Boost to 100% Overclock", (w) => {
    w.setState("clusterName", "Threadripper-7995WX-Extreme");
    w.setState("powerTarget", 100);
  }).bg("#0284c7").color("#ffffff").bold();
  win.addButton("🌌 Theme: Cyberpunk", (w) => w.setTheme("cyberpunk_hologram")).bg("#db2777").color("#ffffff");
  win.addButton("❄️ Theme: Nord", (w) => w.setTheme("nord")).bg("#0f766e").color("#ffffff");
  win.addButton("🍎 Theme: Apple Dark", (w) => w.setTheme("apple_dark")).bg("#334155").color("#ffffff");
  win.endRow();
  win.endCard();

  win.addStatusDock([
    { icon: "🍎", label: "macOS", value: "M4 Ultra 6K XDR" },
    { icon: "🪟", label: "Windows 11", value: "Dual RTX 5090" },
    { icon: "🐧", label: "Linux", value: "96-Core Wayland" },
  ]);
  return win;
}

if (import.meta.main) createEnterpriseTelemetryReactive({ fullscreen: false }).run();
