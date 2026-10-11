# 💽 Gdu Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Recursive Disk Walker  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:gdu]  •  [Terminal CLI: bun run cli:gdu]
```

---

## 🌟 Executive Overview
**Gdu Studio Pro** is an interactive disk usage analyzer and storage reclamation workstation designed as a modern replacement for `gdu`, `ncdu`, and `du`. It crawls directories in parallel, calculates exact disk space usage, renders visual proportional storage bars, and allows engineers to drill down into folders to find massive cache directories and space hogs.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:gdu

# Terminal CLI disk usage inspector
bun run cli:gdu ./
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Gdu Studio Desktop](../../screenshots/apps/gdu_studio_desktop.png) | ![Gdu Studio Responsive](../../screenshots/apps/gdu_studio_responsive.png) |

---

## 🧭 Key Capabilities
- **Proportional Storage Bars**: Instantly spot which folder consumes 80% of your disk space.
- **Directory Drill-down**: Click any folder to dive deeper into subtrees.
- **Clean Reclamation**: Directly bury large temporary folders into the Rip Graveyard.
