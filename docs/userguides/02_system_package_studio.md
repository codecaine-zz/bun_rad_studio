# 💻 System Information Studio Pro -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: systeminformation (60 APIs) via a local Bun telemetry server  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:system]  •  [Terminal CLI: bun run cli:system]
```

---

## 🌟 Executive Overview
**System Information Studio Pro** is a hardware and OS intelligence workstation. It exposes the entire `systeminformation` API surface (60 methods across 10 domains: hardware, OS, CPU, memory/battery, graphics, disks, network, processes, peripherals and virtualization) through a fast desktop UI with live KPI cards, visual smart cards, a raw JSON inspector and a telemetry log.

The studio runs a background telemetry server on a local loopback port, so the window never blocks while a slow query (for example a full audit) is running.

---

## 🚀 Quick Start & Launch

```bash
# Desktop GUI
bun run app:system

# Programmatic launch
import { createSystemStudio } from "./applications/system_studio";
await createSystemStudio({ fullscreen: false }).run();
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![System Studio Desktop](../../screenshots/apps/system_studio_desktop.png) | ![System Studio Responsive](../../screenshots/apps/system_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Header & KPI Cards
- **Full System Audit / Static Hardware / Dynamic Telemetry**: one-click presets (`getAllData`, `getStaticData`, `getDynamicData`).
- **KPI cards**: CPU cores and speed, live CPU load, memory used / total, primary network gateway and battery or AC power. **Load and Memory show a rolling sparkline** of the last 60 samples.
- **🌓 Theme**: switch between the dark and light theme (remembered). **⌨ Shortcuts** lists every keyboard shortcut.

### 2. Quick Bar
- **Favorites (★) and Recents**: chips for the methods you pinned and the ones you used last; click a chip to run it.
- **Auto-refresh**: refresh the KPI cards every 1, 2, 5, 10 or 30 seconds. Tick **Re-run method** to also re-run the selected method each time.
- **Alerts (90%)**: shows a warning toast and a log entry when CPU load or memory reaches 90% (at most once per minute per metric).

### 3. API Sidebar
- Search box, collapsible categories, category pills and a resizable width. Every method shows its description and, where relevant, a parameter box.

### 4. Method Toolbar
- **🚀 Run Method / 📋 Run Entire Category / ⏱️ Live Stream (1s) / 📋 Copy JSON / 💾 Save Report / 🧹 Clear**.
- **☆ Favorite**: pin the current method to the quick bar.
- **📸 Snapshot and 🔀 Compare**: remember a result, then re-run the method and see exactly which values **changed, were added or were removed** (for example before and after plugging in a drive or joining a network).
- **⬇ Export**: save the current result as **JSON, CSV, Markdown or an HTML report** into the `reports/` folder.
- **📄 Full Report**: runs a complete system audit and saves it as a single readable HTML report.

### 5. Result Tabs
- **📊 Visual Smart Cards**: human-readable cards, tables and gauges.
- **💻 Raw JSON Inspector**: syntax-highlighted JSON with a **search box** that filters to matching lines and highlights hits.
- **⚡ Telemetry Log**: timestamped record of every query, export, alert and refresh.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial 1: Spot What Changed After a Hardware or Network Event
1. Select a method such as `networkInterfaces` or `blockDevices`.
2. Click **📸 Snapshot**.
3. Make the change (connect a USB drive, switch Wi-Fi, ...).
4. Click **🔀 Compare**. A dialog lists every changed, added and removed field.

### Tutorial 2: Create a Shareable System Report
1. Click **📄 Full Report**.
2. Open the HTML file shown in the toast (inside `reports/`) in any browser, or attach it to a support ticket.
3. For a single method, choose **CSV**, **Markdown** or **HTML report** in the export menu and click **⬇ Export**.

### Tutorial 3: Watch for Resource Pressure
1. Set **Auto-refresh** to 2s and tick **Alerts (90%)**.
2. Start a heavy build. The sparklines show the trend and you get a warning if CPU or memory reaches 90%.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| **Cmd/Ctrl + Enter** or **R** | Run the selected method |
| **Cmd/Ctrl + K** or **/** | Focus the API filter |
| **Cmd/Ctrl + S** | Export in the chosen format |
| **Cmd/Ctrl + Shift + C** | Copy JSON |
| **1 / 2 / 3** | Visual / JSON / Log tab |
| ***** | Toggle favorite |
| **?** | Show shortcuts |
| **Esc** | Close dialogs |
| **F11** or **F** | Toggle fullscreen |

---

## 💡 Pro Tips
- Favorites, recent methods, theme and export settings are stored locally in the window and survive restarts.
- Exported reports contain hardware serial numbers and UUIDs for some methods (for example `system`, `uuid`) -- review them before sharing publicly.

---

## ❓ Troubleshooting & FAQs

| Question | Answer |
| :--- | :--- |
| **A method shows an error or empty values.** | Some APIs need OS permissions or are not available on every platform (for example temperatures on some machines). The Telemetry Log shows the exact error. |
| **Where are exported files saved?** | In the `reports/` folder of the directory the studio was launched from. |
| **Compare is greyed out.** | Take a **📸 Snapshot** first; the button enables once a snapshot exists. |
