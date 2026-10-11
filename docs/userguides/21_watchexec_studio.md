# ⚡ Watchexec Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native fs.watch & Subprocess Pipeline  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:watchexec]  •  [Terminal CLI: bun run cli:watchexec]
```

---

## 🌟 Executive Overview
**Watchexec Studio Pro** is a standalone, continuous task execution workstation engineered on Bun's native filesystem event pipeline. As a direct replacement for external `watchexec` binaries, it monitors file trees, debounces rapid edits, and executes arbitrary developer commands (test suites, linters, compilers, dev servers) with zero external dependencies.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:watchexec

# Terminal CLI usage
bun run cli:watchexec -w ./src -e "bun test"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Watchexec Studio Desktop](../../screenshots/apps/watchexec_studio_desktop.png) | ![Watchexec Studio Responsive](../../screenshots/apps/watchexec_studio_responsive.png) |

---

## 🧭 Key Capabilities
- **Debounce Buffer**: Avoids multiple executions when saving multi-file projects.
- **Extension & Ignore Filters**: Focuses watcher on relevant source files only.
- **Subprocess Supervision**: Gracefully terminates prior execution before restarting tasks.
