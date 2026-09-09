# 💻 System & Package Workstation -- User Guide

**System & Package Workstation** is a hardware telemetry and package exploration dashboard that relies on native Bun and Node subsystem primitives. It replaces external package manager CLIs with direct access to machine diagnostics, Bun module cache inspection, and the public npm/bun registry API.

---

## ⚡ Quick Start

```bash
# Launch modern workstation
bun run app:system

# Launch backwards-compatible alias
bun run app:brew
```

---

## 🖥️ User Interface Overview

1. **Header & Theme Bar**:
   - Dynamic theme switching, persistent window configuration, and display centering.
2. **Telemetry Dashboard**:
   - **RAM Consumption**: Displays total physical memory, free memory, and percentage currently allocated.
   - **CPU Core Topology**: Detects CPU model, core counts, and system architecture (`arm64` / `x64`).
   - **System Uptime & OS Release**: Reads macOS kernel version and system uptime formatted in days/hours/minutes.
   - **🔄 Refresh Telemetry**: Updates memory allocation and hardware stats in real time.
3. **Bun Global Cache Inspector**:
   - **📦 Bun Cache Info**: Inspects Bun's internal global module store (`~/.bun/install/cache/`), reporting size, disk footprint, and cached package counts.
   - **🧹 Clean Bun Cache**: Flushes unreferenced package artifacts to reclaim disk space.
4. **Package Registry Search & Manifest Explorer**:
   - **Search Query**: Enter package names or keywords (e.g. `sqlite`, `elysia`, `tailwind`, `zod`).
   - **🔍 Search Packages**: Queries the registry directly via Bun `fetch()` with zero latency.
   - **Package Details View**: Displays package description, author, latest semantic version, homepage link, license, and download statistics.
5. **Console Output**:
   - Detailed terminal-style telemetry output for deep diagnostic analysis.

---

## 📖 Practical Tutorials

### 1. Diagnosing Developer Machine Memory Pressure
1. Launch the workstation:
   ```bash
   bun run app:system
   ```
2. Check the **System Telemetry** card to review current RAM consumption.
3. When running memory-intensive compilation tasks, click **🔄 Refresh Telemetry** to track swap memory and resident memory growth.

### 2. Searching & Inspecting Packages for a New Project
1. In the **Search Query** field, type:
   ```text
   elysia
   ```
2. Click **🔍 Search Packages**.
3. Examine the returned packages in the results view. You will see author info, publish dates, latest version, and license compatibility for your enterprise project.

### 3. Auditing the Bun Global Package Cache
1. Click **📦 Bun Cache Info**.
2. The console reports the full path to `~/.bun/install/cache`, the number of compressed tarballs stored, and the total megabytes occupied.
3. If disk space is needed, click **🧹 Clean Bun Cache** to purge stale caches safely.

---

## 🛡️ Enterprise Resilience Features
- **Pure Node/Bun System Primitives**: Queries `node:os` and `node:fs` directly. No `brew` or external shell dependencies required.
- **Graceful Network Fallback**: If offline, registry searches display cached package lists and clear connectivity alerts without crashing.
