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
- **Subprocess Supervision**: Gracefully terminates prior execution before restarting tasks (toggle with **Restart on Change**).
- **Folder Browsers**: 📁 Browse buttons for the **Watch Directory** and the new **Run In** working directory.
- **Command Presets**: Dropdown of common commands (tests, type-check, lint, build) that fills the command box.
- **Live Console Streaming**: stdout/stderr appear as they are produced, with **Copy Log** and **Export Log** buttons.
- **Run History with Duration**: Status and duration per run, a **Clear History** button, and optional success/failure toasts (**Notify When Done**).
- **Path Validation**: Missing watch or working directories raise a clear error instead of failing silently.
