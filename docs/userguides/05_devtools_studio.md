# 🛠️ DevTools Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: 6-in-1 Native Bun Subsystems  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:devtools]  •  [Terminal CLI: bun run cli:devtools]
```

---

## 🌟 Executive Overview
**DevTools Studio Pro** is a unified 6-in-1 developer workstation combining the most essential day-to-day command-line developer utilities into a single high-speed desktop interface. Powered by pure Bun and Node subsystem primitives, it replaces 6 separate CLI packages (`ripgrep`, `fd`, `sd`, `watchexec`, `rm-improved/rip`, and `jq`) with **zero external binary requirements**.

Instead of switching between disjointed terminal tabs and memorizing conflicting flags, DevTools Studio Pro gives developers a cohesive GUI cockpit for searching, replacing, watching, querying, and managing project files.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:devtools

# Shorthand alias
bun run app:omnitool
```

### 2. Launch Terminal CLI Multi-Tool
```bash
# Search using ripgrep mode
bun run cli:devtools search "TODO" ./src

# Find files using fd mode
bun run cli:devtools find "*.test.ts"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![DevTools Studio Desktop](../../screenshots/apps/devtools_studio_desktop.png) | ![DevTools Studio Responsive](../../screenshots/apps/devtools_studio_responsive.png) |

---

## 🧭 The 6 Integrated Developer Engines

| Mode | Engine Name | Replaces Tool | Primary Use Case |
| :-: | :--- | :--- | :--- |
| **1** | **Ripgrep (rg)** | `rg` (ripgrep) | Ultra-fast recursive regex pattern search across codebases. |
| **2** | **Fd Search** | `fd` (fd-find) | Lightning-fast glob/regex file & folder discovery. |
| **3** | **Sd Replace** | `sd` (sed alternative) | Interactive regex find-and-replace with live visual diffs. |
| **4** | **Rip Graveyard** | `rip` (rm-improved) | Safe file deletion with quarantine graveyard & unbury recovery. |
| **5** | **Watchexec** | `watchexec` / `chokidar` | Automated task runner triggering tests/builds on file save. |
| **6** | **JQ Query** | `jq` CLI | High-speed JSON inspection, projection, and formatting. |

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Switching Between Ripgrep and Sd in One Workspace
1. Launch DevTools Studio Pro: `bun run app:devtools`.
2. Select **Ripgrep (rg)** mode from the top navigation tabs.
3. Search for `oldApiEndpoint` across `./src`. Notice matching lines appear with file paths and line numbers.
4. Switch to **Sd Replace** mode.
5. Enter `oldApiEndpoint` in Find and `newSecureApiEndpoint` in Replace.
6. Review the unified diff preview showing green additions and red deletions.
7. Click **Apply Replacement** to update files safely with automatic `.bak` backups.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + 1..6** / **Ctrl + 1..6** | Global | Switch directly between the 6 engine modes |
| **Cmd + Enter** / **Ctrl + Enter** | Active Mode | Execute search, replace, or query |
| **Cmd + K** / **Ctrl + K** | Active Mode | Clear results table |
| **Cmd + S** / **Ctrl + S** | Window | Save window configuration |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Zero Toolchain Drift**: Because DevTools Studio Pro uses self-contained Bun primitives, your entire engineering team shares identical search, replace, and watch behavior across macOS (Apple Silicon & Intel), Linux, and Windows.
