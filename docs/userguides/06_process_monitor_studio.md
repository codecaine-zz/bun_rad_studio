# 📊 Process Monitor Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native macOS ps / sysinfo Subsystem  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:process]  •  [Terminal CLI: bun run cli:process]
```

---

## 🌟 Executive Overview
**Process Monitor Studio** is an enterprise-grade desktop system task manager and process telemetry workstation built natively for Bun RAD Studio. Designed as a developer-focused alternative to macOS Activity Monitor and Linux `htop`, it provides live process inspection, PID search, CPU% and RSS memory telemetry, listening socket discovery, and safe process termination signals (`SIGTERM`, `SIGKILL`).

It allows developers to instantly pinpoint runaway development servers, orphan background tasks, memory leaks, and port conflicts without navigating cryptic terminal commands.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:process

# Shorthand alias
bun run app:procs
```

### 2. Launch Terminal CLI Process Inspector
```bash
# List top CPU processes in terminal
bun run cli:process --top cpu

# Search process by name or PID
bun run cli:process --search "node"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Process Monitor Desktop](../../screenshots/apps/process_studio_desktop.png) | ![Process Monitor Responsive](../../screenshots/apps/process_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Real-time Telemetry Status Bar
- **Total Process Count**: Live tally of active system processes.
- **Aggregated CPU Load**: Overall user and system CPU load percentage.
- **Physical Memory Bar**: System-wide RAM consumption and available buffer space.
- **Auto-Refresh Switcher**: Toggle polling intervals (1s, 2s, 5s, or Manual Pause).

### 2. Process Search & Filter Toolbar
- **Search Process / PID Input**: Real-time filtering by process name, command arguments, or numeric PID.
- **Sort Dropdown**: Sort by CPU (High to Low), Memory/RSS (High to Low), PID, or Name.
- **User Mode Toggle**: Filter between "All System Processes" and "My User Processes Only".

### 3. Interactive Process Data Table
- **PID**: Process Identification number.
- **User / Owner**: Operating system user account executing the task.
- **CPU %**: Real-time CPU core utilization.
- **RSS Memory**: Resident Set Size physical memory consumption formatted in MB/GB.
- **Command / Path**: Full binary path and invocation arguments.
- **Action Buttons**: One-click **Terminate (SIGTERM)** and **Force Kill (SIGKILL)** buttons.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Finding and Killing a Stale Server Holding a Port
1. Launch Process Monitor Studio: `bun run app:process`.
2. In the search bar, type the name of your server runtime: `bun` or `node`.
3. Locate the rogue process in the filtered list.
4. Review the **RSS Memory** and **CPU%** columns to confirm it is the orphaned task.
5. Click **Terminate (SIGTERM)** to shut it down gracefully.
6. If the process does not terminate within 3 seconds, click **Force Kill (SIGKILL)** to release the port immediately.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + F** / **Ctrl + F** | Toolbar | Focus process search bar |
| **Cmd + R** / **Ctrl + R** | Global | Force immediate process list refresh |
| **Cmd + K** / **Ctrl + K** | Selected Row | Send SIGTERM signal |
| **Cmd + Shift + K** | Selected Row | Send SIGKILL signal |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Graceful vs Force Kill**: Always attempt `SIGTERM` (Terminate) first. This allows databases (like SQLite or Postgres) and node apps to flush writes to disk and close open sockets cleanly before exiting.
