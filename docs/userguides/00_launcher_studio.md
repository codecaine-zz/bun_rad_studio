# ⚡ Launcher Studio Pro -- Complete Production User Guide

```
Engine: SimpleGUI Desktop WKWebView  •  Dependencies: 0  •  Network: none (everything runs locally)
Launchers: [Desktop GUI: bun run app:launcher]  •  [Terminal CLI: bun run cli:launcher]
```

---

## 🌟 Executive Overview
**Launcher Studio Pro** is the unified central command workstation for the entire **Bun RAD Studio** ecosystem. It dynamically auto-detects, catalogs, inspects, and launches all **150+ project tools**—including **39 full-featured Desktop Studio Applications**, **75+ Terminal CLI Utilities**, and **25+ Interactive Showcase Demos**—with zero external clutter and sub-second execution.

With its enterprise **Pinned Favorites** engine and **Rock-Solid Selection Stability Architecture**, Launcher Studio Pro guarantees that your working context is preserved whether you navigate from the top dropdown, the interactive listbox, or the catalog data table.

![Launcher Studio Pro Desktop Screenshot](../../screenshots/apps/launcher_studio_desktop.png)

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Workstation
```bash
# Standard desktop launch (Full workstation cockpit)
bun run app:launcher

# Direct execution via script path
bun run applications/launcher_studio.ts
```

### 2. Launch Terminal CLI Companion
```bash
# List all 150+ auto-detected tools
bun run cli:launcher --list

# Filter by Pinned Favorites
bun run cli:launcher --favorites

# Toggle favorite pin status from the CLI
bun run cli:launcher --fav-toggle sqlite_studio

# Search for any tool across the workspace
bun run cli:launcher --search redis

# Directly launch any tool by ID or name
bun run cli:launcher --launch sqlite_studio
```

### 3. Launch Programmatically in TypeScript
```typescript
import { createLauncherStudio } from "./applications/launcher_studio";

const launcher = createLauncherStudio({
  fullscreen: false,
  theme: "midnight"
});
await launcher.run();
```

---

## 🌟 Key Functional Pillars

### 1. ⭐ Pinned Favorites System
Launcher Studio Pro provides persistent, 1-click favorite bookmarking for your daily drivers:
- **⭐ Favorite / ★ Unfavorite Toggle (`btn_fav`)**: Select any tool from the top or bottom view and toggle its favorite status instantly. The button label and star badge update immediately in real time.
- **🚀 1-Click Launch Top Favorite (`btn_quick_launch_fav1`)**: Located right on the quick launch strip, this button immediately executes your #1 pinned favorite tool with zero clicks in navigation.
- **📊 Real-Time Telemetry KPI Card (`lbl_kpi_favs`)**: Dedicated KPI badge displays `⭐ Favorites: N`, updating instantly whenever tools are starred or unstarred.
- **⭐ Visual Badging**: Pinned tools are visibly badged with a bright `⭐` in the Top Dropdown, the Top ListBox, and the `Fav` column in the Bottom Catalog Table.
- **💾 Local Persistence (`.launcher_history.json`)**: Pinned favorites and launch metrics persist across sessions in your project folder. The file is written atomically and a damaged file is ignored rather than crashing the app.

### 2. ⚡ Quick Favorites & Category Filtering
- **⭐ Favorites Only (`btn_quick_favs` / `btn_quick_favs_filter`)**: A single click filters the entire workspace catalog down to your pinned favorites.
- **🔍 Real-Time Live Search (`txt_search`)**: Type any keywords in any order -- every word must match (name, id, category, path, description or command), so `task manager` and `manager task` both find Task Manager. Close matches rank first and even rough abbreviations such as `tskmgr` work. Filtering applies automatically with live debouncing.
- **🗂️ Category Selector (`dd_category`)**: Jump instantly between `🌟 All Project Tools`, `⭐ Pinned Favorites`, `🖥️ Studio Applications`, `🛠️ CLI Utilities`, `🎮 Showcase Demos`, `🟢 Running Processes` and `🕘 Recently Used`.
- **↕️ Sort (`dd_sort`)**: `Favorites, running, A-Z` (default), `Recently used`, `Most used` or `Name A-Z`.
- **✕ Show All (`btn_clear_filter`)**: Resets all filters and restores the full workspace catalog in one click.

### 3. 🎯 Rock-Solid Top ⇄ Bottom Selection Stability
In complex workstation UIs, applying filters often leads to desynchronized selections, lost focus, or jumping UI elements. Launcher Studio Pro guarantees 100% stable, bi-directional selection:
- **Zero-Drift Selection Preservation**: When you apply a search or filter, the system checks if your currently selected tool is still present in the results. If it is, **it stays selected and highlighted**! It never resets to the first item unexpectedly.
- **Graceful Fallback**: If your active tool does not match the active filter, the selection cleanly transitions to the first matching tool, updating both top and bottom views simultaneously.
- **Top ➔ Bottom Sync**: Selecting an item in the top dropdown (`dd_select_app`) or top listbox (`lst_apps`) automatically highlights the corresponding row in the bottom table (`tbl_apps`) with glowing cyan accenting and smoothly scrolls it into view.
- **Double-Click Auto-Launch**: Double-clicking any list item in the interactive top listbox (`lst_apps`) or row in the catalog table (`tbl_apps`) instantly auto-launches that tool with instant visual toast feedback.

### 4. ⚡ 1-Click Quick Launch Toolbars
Located right below telemetry cards, these high-density buttons trigger the most common engineering tools with optimal preset arguments:
- **Popular Studio Apps**: SQLite Studio, Redis Studio, System Studio, Fd Studio, Git Studio, API Studio, Task Manager, App Bundler.
- **Popular CLI Utilities**: System CLI (`--telemetry`), Database CLI (`--help`), Fd CLI, Git CLI, Tokei CLI, Gdu CLI, Network CLI, Crypto CLI.
- **Quick Favorites Strip**: `⭐ Filter to Favorites`, `🚀 Launch Top Favorite`, `⭐ Toggle Star for Selected`.

### 5. 🖥️ Multi-Mode Process Dispatcher
Every tool can be executed in the mode that best fits your workflow:
- **🚀 Launch**: Launches GUI applications in native desktop windows, or launches CLI tools in an interactive terminal.
- **🖥️ In Terminal**: Explicitly spawns the tool inside a new, fully interactive native Terminal window (`Terminal.app` on macOS, or detected Linux emulator).
- **⚡ Inline**: Executes CLI tools directly within Launcher Studio Pro's background process pool, capturing real-time stdout and stderr in the console area.
- **🛑 Stop / Kill**: Instantly terminates active child processes via SIGTERM / SIGKILL.
- **📂 Reveal**: Reveals the script file in Finder / file manager.
- **📋 Copy Cmd**: Copies the full execution command with custom CLI flags to your clipboard.
- **📝 Open Source (`btn_edit`)**: Opens the tool's script in VS Code (if installed) or your default text editor.
- **📎 Copy Path (`btn_copy_path`)**: Copies the script's absolute path.
- **⏹ Stop All Running (`btn_stop_all`)**: Stops every running tool after a confirmation that lists them.
- **🧹 Clear Usage History (`btn_clear_history`)**: Resets launch counts and last-used times after confirmation. Favorites are kept.

### 6. 🕘 Usage Tracking
The **Used** column shows how often and how recently you launched each tool (for example `14× · 10m ago`). Use `🕘 Recently Used` or the `Recently used` / `Most used` sort orders to bring your daily tools to the top. Only launches that actually start count -- a tool that crashes immediately is not recorded.

### 7. 🛡️ Reliable Launching
- **Crash reporting**: if a studio exits within a moment of starting (syntax error, missing dependency, port clash) the launcher reports it, shows the last lines of its error output and the log path (`rad_launcher_logs` in your temp folder) instead of claiming success.
- **Safe arguments**: `CLI Flags / Args` supports quotes (`--name "hello world"`). Arguments are passed to the tool directly, and in Terminal mode every argument is shell-quoted, so pasted text like `; rm -rf ~` stays harmless.
- **Accurate running status**: a tool shows as running only when Bun/Node is actually executing that script -- an editor with the file open or a look-alike filename no longer counts.

---

## 🎛️ User Interface & Control Reference

| Control ID | Label / Type | Purpose & Behavior |
| :--- | :--- | :--- |
| `dd_theme` | Theme Selector | Switch across 60+ desktop themes (Midnight, Emerald, Obsidian, Neon, Cyberpunk). |
| `btn_rescan` | 🔄 Rescan Tools | Re-indexes workspace files, detects running PIDs, and refreshes telemetry (the counters also refresh on every filter, launch and stop). |
| `lbl_kpi_favs` | ⭐ Favorites: N | Live counter of pinned favorite applications. |
| `btn_quick_favs_filter` | ⭐ Filter to Favorites | Instantly sets category filter to Pinned Favorites. |
| `btn_quick_launch_fav1` | 🚀 Launch Top Favorite | Executes the highest-priority pinned favorite tool in 1 click. |
| `btn_quick_toggle_fav` | ⭐ Toggle Star | Stars or unstars the currently selected tool. |
| `dd_select_app` | Top Tool Dropdown | Dropdown selector synchronized with listbox, table, and active tool. |
| `txt_cli_args` | CLI Flags / Args | Input box for custom runtime arguments (e.g. `--help`, `--telemetry`, `--search`). |
| `btn_launch` | 🚀 Launch | Primary launch trigger for the selected tool. |
| `btn_fav` | ⭐ Favorite / ★ Unfavorite | Dynamic star button showing live status for the active selection. |
| `btn_terminal` | 🖥️ Terminal | Spawns tool in an interactive native Terminal session. |
| `btn_run_inline` | ⚡ Inline | Executes tool in background and streams stdout to the text area. |
| `btn_kill` | 🛑 Stop | Kills active process for the selected application. |
| `btn_reveal` | 📂 Reveal | Opens enclosing folder in macOS Finder. |
| `btn_copy` | 📋 Copy Cmd | Copies `bun run ./path [args]` to clipboard. |
| `btn_edit` | 📝 Open Source | Opens the selected tool's script in your editor. |
| `btn_copy_path` | 📎 Copy Path | Copies the script's absolute path. |
| `btn_stop_all` | ⏹ Stop All Running | Confirms, then stops every running tool. |
| `btn_clear_history` | 🧹 Clear Usage History | Confirms, then resets launch counts and last-used times (favorites kept). |
| `dd_sort` | Sort Dropdown | Favorites/running/A-Z, Recently used, Most used, Name A-Z. |
| `lst_apps` | Top ListBox | Multi-row interactive selector (Click to sync, double-click to launch). |
| `txt_search` | 🔍 Filter Input | Real-time multi-word filter (name, id, category, path, description, command). |
| `dd_category` | Category Dropdown | Pre-configured filter categories including ⭐ Pinned Favorites. |
| `btn_quick_favs` | ⭐ Favorites Only | Quick filter button placed directly in the search toolbar. |
| `tbl_apps` | Catalog Table | Multi-column table (`ID`, `Fav`, `Type`, `Name`, `Category`, `Status`, `Used`, `Command Path`). |
| `txt_output` | Output View | Multi-line text display for metadata summary and inline CLI results. |
| `launcher_console` | Telemetry Console | Real-time log stream tracking process executions, PID assignments, and errors. |

---

## 💡 Operational Workflows

### Workflow 1: Pinning & Managing Your Favorites
1. Open Launcher Studio (`bun run app:launcher`).
2. Click any tool in the listbox or table (e.g. `SQLite Studio Pro`).
3. Click the **`⭐ Favorite`** button in the Action Dispatcher row.
4. The button changes to **`★ Unfavorite`**, a glowing **`⭐`** appears next to the tool name, and the **`⭐ Favorites`** KPI count increments.
5. Repeat for any other tools you use frequently (e.g. `Redis Studio Pro`, `System CLI`, `Git Workbench`).
6. Click **`⭐ Favorites Only`** or **`⭐ Filter to Favorites`** at any time to focus exclusively on your starred tools.

### Workflow 2: Rapid Keyboard & Filter Navigation
1. Click the **`🔍 Filter`** input or press Tab into it.
2. Type `sql`. The top dropdown, listbox, and bottom table instantly filter to show matching SQLite tools.
3. Notice that `SQLite Studio Pro` remains actively selected throughout the filtering process!
4. Double-click the table row or press the **`🚀 Launch`** button to open the studio immediately.

### Workflow 3: Running CLI Tools with Arguments
1. Select any CLI tool (e.g. `System CLI`).
2. Notice that intelligent preset arguments (`--telemetry`) are populated automatically.
3. Edit the flags in **`CLI Flags / Args`** (e.g. `--json` or `--memory`).
4. Click **`⚡ Inline`** to view output directly inside the launcher, or **`🖥️ In Terminal`** to launch a full interactive shell session.

---

## 🛠️ CLI Companion Reference (`launcher_cli.ts`)

| Flag | Shorthand | Type | Description |
| :--- | :---: | :---: | :--- |
| `--favorites` | `-f` | boolean | Show only pinned favorite applications. |
| `--fav-toggle` | `-F` | string | Toggle pinned favorite status for an application ID or name. |
| `--list` | `-l` | boolean | List all auto-detected project applications. |
| `--search` | `-s` | string | Search applications by name, category, or keyword. |
| `--source` | `-S` | string | Filter by source (`rad_studio`, `cli_tool`, `rad_demo`). |
| `--running` | `-r` | boolean | Show only currently active/running applications. |
| `--launch` | `-x` | string | Launch application by ID or partial name. |
| `--json` | `-j` | boolean | Output results as structured JSON. |

---

## 🧩 Architectural Integrity & Zero Dependencies
- **Sub-Second Boot Time**: Native macOS WKWebView bridge starts the window quickly.
- **Process Isolation**: Every launched tool runs in its own isolated process space, preventing crashes in one workstation from impacting others.
- **Zero External Runtimes**: Pure Bun and Node API primitives—no Electron bloat, no Python wrappers, no Docker requirements.
