# 📈 Procs Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Process Table Telemetry  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:procs]  •  [Terminal CLI: bun run cli:procs]
```

---

## 🌟 Executive Overview
**Procs Studio Pro** is a modern, high-contrast process inspector and system visualizer built as an ergonomic replacement for standard `ps`. It translates raw POSIX process tables into human-readable tables displaying CPU utilization, RSS memory footprint, listening TCP/UDP ports, process tree hierarchies, and operating system user contexts.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:procs
```

### 2. Launch Terminal CLI Process Explorer
```bash
# List top 10 memory-heavy processes
bun run cli:procs --sort mem --limit 10

# Search processes by keyword
bun run cli:procs --search "chrome"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Procs Studio Desktop](../../screenshots/apps/procs_studio_desktop.png) | ![Procs Studio Responsive](../../screenshots/apps/procs_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide
- **Process Table**: Lists PID, Parent PID (PPID), User, CPU%, RSS RAM, Listening Ports, and Command.
- **Process Tree View**: Collapsible tree visualizing parent-child relationship (e.g., Terminal -> zsh -> Bun -> Webview).
- **Port Correlation**: Highlights which specific PID is listening on port 3000, 5432, or 8080.
- **Signal Dispatcher**: Send `SIGTERM` (graceful) or `SIGKILL` (forceful) directly from UI.
