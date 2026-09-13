# 📊 Procs Studio Pro -- User Guide

**Procs Studio Pro** is a modern, high-performance process monitor and system task management workstation built natively for Bun. As a visual desktop replacement for `ps` and macOS Activity Monitor, it offers instant process telemetry, CPU/Memory resource sorting, active TCP listening port detection (`lsof`), process hierarchy tree navigation, and Unix signal termination (`SIGTERM`, `SIGKILL`).

---

## ⚡ Quick Start

```bash
# Launch Procs Studio Pro desktop workstation
bun run app:procs
bun run app:process

# Launch CLI mode directly
bun run cli:procs
bun run cli:procs --tree
bun run cli:procs -P
```

You can also launch programmatically in TypeScript:
```ts
import { createProcsStudio } from "./applications/procs_studio";
const win = createProcsStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

1. **Header & Navigation Toolbar**:
   - Dynamic theme selector, Fullscreen toggle, Save Config, and Window Centering.
2. **Process & Resource Telemetry**:
   - Total processes, Top CPU consumer, Top Memory consumer, Active network port listeners, and Engine status.
3. **Filter & Process Management Controls**:
   - **Filter**: Filter processes by PID, username, or command keyword.
   - **Sort Dropdown**: Sort by CPU (Desc), Memory (Desc), PID (Asc), or User (Asc).
   - **Limit**: Restrict table size to top N processes.
   - **Inspect Ports (-P)**: Attaches real-time listening TCP sockets to each process.
   - **Signal Actions**: Send `SIGTERM` (graceful stop) or `SIGKILL` (force terminate).
   - **Tree View**: Toggles hierarchical parent/child process tree in the inspector console.
4. **Active Operating System Processes Table**:
   - Real-time grid displaying PID, PPID, User, CPU %, MEM %, State, CPU Time, Ports, and Command.
5. **Process Hierarchy & Detailed Telemetry Console**:
   - Displays full command line, listening ports, parent PID, user owner, and execution stats.
