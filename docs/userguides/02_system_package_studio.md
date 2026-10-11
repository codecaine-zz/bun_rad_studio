# 💻 System & Package Workstation -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Node:os & Bun Package Subsystem  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:system]  •  [Terminal CLI: bun run cli:system]
```

---

## 🌟 Executive Overview
**System & Package Workstation** is an enterprise hardware diagnostics, memory telemetry, and package exploration control center built natively for Bun RAD Studio. It replaces external, slow package manager utilities with real-time access to machine hardware telemetry, local Bun module cache footprint analysis, and lightning-fast package search directly against the npm/bun registries.

Designed for software engineers, systems architects, and DevOps professionals, this workstation gives you complete visibility into system load, CPU architecture, memory pressure, and package dependencies in a unified cockpit.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:system

# Backwards-compatible alias
bun run app:brew
```

### 2. Launch Terminal CLI Diagnostic Mode
```bash
# Print machine telemetry and cache stats to terminal
bun run cli:system

# Search packages from the command line
bun run cli:system --search "express"
```

### 3. Launch Programmatically in TypeScript
```typescript
import { createSystemStudio } from "./applications/system_studio";

const app = createSystemStudio({ fullscreen: false });
await app.run();
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![System Workstation Desktop](../../screenshots/apps/system_studio_desktop.png) | ![System Workstation Responsive](../../screenshots/apps/system_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Hardware Telemetry Bento Grid
- **RAM Usage Gauge**: Displays total physical memory, active consumption, free buffer memory, and dynamic percentage utilization bar.
- **CPU Architecture Card**: Displays CPU model string (e.g. Apple M1/M2/M3 or Intel x86_64), core count, logical thread topology, and system architecture.
- **System Uptime Counter**: Formatted live display of system uptime (Days, Hours, Minutes, Seconds).
- **OS Platform Badge**: Shows kernel version, macOS/Darwin build number, and host architecture.

### 2. Bun Module Cache Diagnostics Panel
- **Global Cache Directory**: Displays the exact filesystem location of Bun's global package cache (`~/.bun/install/cache`).
- **Cache Size Footprint**: Calculates total disk space consumed by cached tarballs and unpacked module dependencies.
- **Cached Package Count**: Total count of unique dependency versions currently cached offline.
- **🧹 Clean Cache Button**: Triggers safe removal of stale, dangling packages to reclaim gigabytes of drive space.

### 3. Package Registry Explorer & Search
- **Search Package Input**: Type any keyword (e.g. `typescript`, `zod`, `tailwind`, `drizzle`).
- **🔎 Search Registry Button**: Queries registry API asynchronously with zero blocking.
- **Package Results Table**: Lists package name, latest semver version, package description, weekly downloads, license, and repository URL.
- **Install Command Generator**: Click any row to generate one-click `bun add <package>` installation snippets.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial 1: Checking System Memory Pressure During Heavy Builds
1. Launch the workstation: `bun run app:system`.
2. Observe the **RAM Usage Gauge** before starting your build or container cluster.
3. Launch your compilation or test suite in the background.
4. Watch the memory percentage bar update live; identify if your workstation is approaching swap memory pressure.

### Tutorial 2: Auditing and Cleaning Bun Package Cache
1. Open the workstation and navigate to the **Bun Module Cache** card.
2. Review the **Cache Size Footprint** (often 5GB–15GB after working on multiple projects).
3. Click **🧹 Clean Cache**.
4. The workstation safely purges orphaned packages while keeping your project-level `node_modules` intact.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + R** / **Ctrl + R** | Global | Refresh telemetry & metrics |
| **Cmd + F** / **Ctrl + F** | Package Search | Focus package search bar |
| **Cmd + S** / **Ctrl + S** | Window | Save window state & theme |
| **F11** or **F** | Global | Toggle borderless fullscreen |
| **Escape** | Window | Cancel search or close modal |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Zero Homebrew Dependency**: This workstation uses native `node:os`, `node:v8`, and Bun C++ APIs. It will run on a brand-new pristine macOS machine without Homebrew or Xcode command line tools installed.
- **Fast Package Discovery**: When evaluating dependencies for a new project, use the package registry search to compare download trends, bundle size impact, and open-source licenses before running `bun add`.

---

## ❓ Troubleshooting & FAQs

| Question | Answer |
| :--- | :--- |
| **Why is cache size showing 0 bytes?** | You have not yet run `bun install` or `bun add` on this user profile. Once you install any package, Bun populates its global cache. |
| **Does Clean Cache break my existing projects?** | No. Your project's local `node_modules` directory contains all installed files. Cleaning the global cache only frees up downloaded tarballs. |
