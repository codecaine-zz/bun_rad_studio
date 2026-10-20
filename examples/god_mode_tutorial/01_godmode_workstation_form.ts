/**
 * God-Mode Tutorial 01 — Fluent Windows, Compound Form Builders, Grids & Cards
 *
 * Run:  bun run examples/god_mode_tutorial/01_godmode_workstation_form.ts
 */
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";

export function createGodModeWorkstationForm(opts: { fullscreen?: boolean } = {}): SimpleWindow {
  const win = newSimpleWindow("God-Mode Flagship Workstation Provisioner", 820, 620, {
    theme: "cyberpunk_hologram", padding: 14, spacing: 10, ...opts,
  });

  win.addHeading(
    "⚡ Flagship Workstation Provisioner v1.5",
    "120Hz ProMotion / DirectX 12 WebView2 / Wayland HiDPI Compositor",
  );

  // Side-by-side Row: Quick Search & Instant Filter
  win.beginRow();
  win.addLabel("Cluster Node:").bold().width(105);
  win.addTextInput("studio-m4-ultra-xdr.local", "Hostname or IP...").id("txtHost").width(320);
  win.addButton("⚡ Ping Rig", (w) => {
    const host = w.getText("txtHost").trim() || "localhost";
    w.setStatusBarText(`120Hz link active → ${host} (0.18 ms RTT)`);
    w.toast(`Verified ${host}`, 1800);
  }).bg("#0284c7").color("#ffffff").bold();
  win.endRow();

  // 4-Line Compound Form Builders inside a Card
  win.beginCard("🖥️ Hardware Rig Profile (4-Line Compound Form)");
  win.addFormField("Engineer Callsign:", "txtEngineer", "Ada Lovelace");
  win.addFormDropdown("Flagship Platform:", "cmbPlatform", [
    "macOS — Mac Studio M4 Ultra (80c GPU · 192GB · 6K XDR)",
    "Windows 11 — Threadripper PRO + Dual RTX 5090 (8K OLED)",
    "Linux — Threadripper PRO 7995WX 96-Core (Wayland 120Hz)",
  ], "macOS — Mac Studio M4 Ultra (80c GPU · 192GB · 6K XDR)");
  win.addFormSlider("Shader Pipeline Budget (%):", "sldGpu", 92);
  win.addFormSwitch("Smart Governor:", "swZeroWatt", "Enable 120Hz Zero-Watt Governor", true);
  win.endCard();

  // Multi-Column Auto-Wrapping Grid
  win.beginCard("🎛️ Multi-Column Telemetry & Launch Actions");
  win.beginGrid(2, 12);
  win.addCircularProgress("cpVram", 88);
  win.addGauge("ggClock", "120Hz Frame Lock", 94);
  win.endGrid();

  win.beginRow();
  win.addButton("🚀 Deploy Workstation Profile", (w) => {
    const eng = w.getText("txtEngineer").trim() || "Operator";
    const rig = w.getText("cmbPlatform");
    w.info("Profile Deployed", `Provisioned ${rig} for ${eng}.`);
  }).bg("#10b981").color("#ffffff").bold().height(38);
  win.addButton("🎨 Cycle God-Mode Theme", (w) => {
    w.setTheme("synthwave84");
    w.setStatusBarText("Theme switched to Synthwave '84 at 120Hz");
  }).bg("#7c3aed").color("#ffffff").height(38);
  win.endRow();
  win.endCard();

  win.addStatusBar("Ready — Mac M4 Ultra · Win11 Dual RTX 5090 · Linux 96-Core Threadripper PRO");
  return win;
}

if (import.meta.main) createGodModeWorkstationForm({ fullscreen: false }).run();
