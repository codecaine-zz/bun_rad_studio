/**
 * Chapter 3B — VLang Parity, Studio Extended & Enterprise Controls
 *
 * Run:  bun run examples/rad_tutorial/08_parity_and_extended.ts
 */
import { newSimpleWindow, SimpleWindow } from "../../src/simplegui";

export function createParityAndExtended(opts: { fullscreen?: boolean } = {}): SimpleWindow {
  const win = newSimpleWindow("Parity, Extended & Enterprise Controls", 760, 620, {
    theme: "apple_dark", padding: 14, spacing: 8, ...opts,
  });

  win.addHeroBanner(
    "Extended & Enterprise Gallery",
    "VLang SimpleGUI parity widgets, Studio extended controls, and enterprise components",
    "100+ WIDGETS",
  );

  win.beginCard("🎛️ VLang Parity & Telemetry Controls");
  win.beginRow();
  win.addScoreCard("Architecture", 99.4, "All suites green", "A+").width(175);
  win.addDonutChart("donutMem", "Memory", 68, "10.8 / 16 GB").width(175);
  win.addActivityRings("ringsLoad", [
    { label: "IPC", percent: 94, color: "#fa114f" },
    { label: "UI", percent: 88, color: "#a1ff00" },
  ]).width(175);
  win.addKnob("knobGain", 0, 100, 75).width(95);
  win.endRow();

  win.beginRow();
  win.addModeControl("modeEnv", ["Dev", "Stage", "Prod"], "Dev").width(210);
  win.addPillToggle("pillLive", ["Paused", "Live"], 1).width(150);
  win.addTagCloud("tags", ["Bun", "TypeScript", "SQLite", "WebView"]).width(270);
  win.endRow();
  win.endCard();

  win.beginCard("✨ Studio Extended & Enterprise Components");
  win.beginRow();
  win.addAnimatedInput("txtFilter", "⚡ Filter widgets...", "").width(190);
  win.addButtonGroup("grpView", [
    { label: "🎛 Grid", value: "grid" },
    { label: "📋 List", value: "list" },
  ]).width(150);
  win.addCountBadge("bAlerts", "Alerts", 3, "danger").width(95);
  win.copyButton("Copy Key", "sk-rad-2026", { width: 140 });
  win.endRow();

  win.beginRow();
  win.statistic("Throughput", 12840, { suffix: " req/s", trend: "+14%", width: 190 });
  win.chips(
    [{ label: "Zero Config", color: "primary" }, { label: "133 Themes", color: "success" }, "Single Binary"],
    { clickable: true, selectable: true, width: 430 },
  );
  win.endRow();

  win.addCalloutPanel(
    "calloutTip",
    "Unified Fluent API",
    "Every VLang parity, Studio extended, and enterprise widget chains and follows the active window theme.",
    "info",
  );
  win.endCard();

  win.addStatusDock([
    { icon: "🟢", label: "Widgets", value: "100+ Ready" },
    { icon: "⚡", label: "Engine", value: "Bun RAD v1.4" },
  ]);
  return win;
}

if (import.meta.main) createParityAndExtended({ fullscreen: false }).run();
