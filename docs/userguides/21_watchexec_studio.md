# ⏱️ Watchexec Studio Pro -- User Guide

**Watchexec Studio Pro** is an automated task runner and continuous file watcher desktop workstation built natively for Bun. Powered directly by native `fs.watch` system APIs and Bun's high-performance process spawner, it executes build scripts, test runners, and shell commands in response to filesystem modifications with configurable debouncing, extension filters, and streaming logs.

---

## ⚡ Quick Start

```bash
# Launch Watchexec Studio Pro desktop workstation
bun run app:watchexec
bun run app:watcher

# Launch CLI mode directly
bun run cli:watchexec -e ts -- bun test
bun run cli:watchexec -w src -c -d 200 -- bun run index.ts
```

You can also launch programmatically in TypeScript:
```ts
import { createWatchexecStudio } from "./applications/watchexec_studio";
const win = createWatchexecStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

1. **Header Toolbar**:
   - Dynamic theme selection, borderless fullscreen mode, and window placement controls.
2. **Watcher Telemetry**:
   - Watcher state (IDLE, ACTIVE, STOPPED), trigger count, last event filename, and active child process PID.
3. **Targets & Configuration**:
   - **Watch Directory**: Root path to monitor recursively (e.g. `./src`).
   - **Execute Command**: Command line to spawn upon changes (e.g. `bun test`).
   - **Extensions**: Comma-separated list of file extensions to trigger on (e.g. `ts,js,json`).
   - **Ignore Patterns**: Comma-separated folders or patterns to ignore (e.g. `node_modules,.git,dist`).
   - **Debounce**: Delay in milliseconds before firing the execution handler (default 150ms).
   - **Clear Console**: Automatically clears output console before each trigger.
4. **Continuous Execution & Build Console**:
   - Streaming stdout/stderr output from the spawned child processes with real-time timestamps.
5. **File Modification History Table**:
   - Record of timestamps, trigger indices, modified file paths, and exit statuses.
