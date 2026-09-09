# 📊 Process Monitor Studio -- User Guide

**Process Monitor Studio** is a native macOS process explorer and activity monitor designed for developers. It provides real-time visibility into running operating system processes, memory footprint, CPU utilization, parent PIDs, and process management controls with zero third-party dependencies.

---

## ⚡ Quick Start

```bash
# Launch Process Monitor Studio
bun run app:process

# Launch backwards-compatible alias
bun run app:tasks
```

---

## 🖥️ User Interface Overview

1. **Header Bar & Global Metrics**:
   - System CPU architecture, active process count, total system memory allocation.
   - Theme switcher, auto-save window state, and window centering.
2. **Process Search & Filters**:
   - **Filter Query**: Filter process table in real time by process name or executable command (e.g. `bun`, `node`, `chrome`, `postgres`, `python`).
   - **Sort By**: Sort by PID, CPU %, Memory RSS, or Process Name.
   - **Show Only Current User**: Toggle to display only processes owned by the current developer account.
3. **Process Control Actions**:
   - **🔄 Refresh Process List**: Instant re-scan of operating system process table.
   - **⏸️ Send SIGTERM (Graceful)**: Requests polite shutdown of the selected process.
   - **🛑 Send SIGKILL (Force)**: Immediately halts runaway or hung developer processes.
4. **Interactive Process Grid**:
   - Multi-column table displaying:
     - `PID` (Process Identifier)
     - `USER` (Owner)
     - `%CPU` (CPU core utilization)
     - `MEM (MB)` (Resident Set Size memory consumption)
     - `COMMAND` (Full binary path and startup flags)
5. **Process Diagnostics & Telemetry Card**:
   - Inspects selected process threads, open file handles, and working directory.

---

## 📖 Practical Tutorials

### 1. Identifying and Terminating Stale Node/Bun Servers
1. In the **Filter Query** box, type:
   ```text
   bun
   ```
2. Inspect the returned list. If a background dev server or test process is occupying your dev port (e.g. `3000` or `4567`), note its PID.
3. Select the row and click **⏸️ Send SIGTERM (Graceful)**.
4. If the process is unresponsive, click **🛑 Send SIGKILL (Force)**.
5. The process list refreshes automatically, confirming termination.

### 2. Auditing High-Memory Dev Tools
1. Set the **Sort By** dropdown to `Memory RSS (Descending)`.
2. Click **🔄 Refresh Process List**.
3. Review the top entries to detect memory leaks in background test runners or container daemons.

---

## 🛡️ Enterprise Resilience Features
- **Accidental System Kill Protection**: Prevents sending kill signals to core macOS system daemons (PID 0, 1, `launchd`, `kernel_task`).
- **Clean OS Process Spawning**: Gathers process statistics via fast native `ps -eo pid,user,%cpu,rss,comm` queries with automatic output sanitization.
- **Non-Blocking UI Thread**: Process table parsing occurs asynchronously, ensuring UI interactions remain fluid even when thousands of processes are running.
