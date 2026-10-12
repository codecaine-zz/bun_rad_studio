# 📊 Process Monitor Studio -- Complete Production User Guide

```
Engine: ps / lsof / Bun  •  Dependencies: 0  •  Network: none (everything runs locally)
Launchers: [Desktop GUI: bun run app:process]  •  [Alias: bun run app:taskmanager]
```

---

## 🌟 Executive Overview
**Process Monitor Studio** (window title *Task Manager Pro*) is a developer-focused alternative to Activity Monitor and `htop`. It lists every process with CPU, memory, state, uptime, owner and listening ports; lets you search, group and sort them; and sends signals safely, with confirmations for anything risky and hard protection for processes that must never be touched.

---

## 🚀 Quick Start
```bash
bun run app:process        # or: bun run app:taskmanager
```
Restart the app after updating so the new controls appear.

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop | Responsive Viewport |
| :---: | :---: |
| ![Process Monitor Desktop](../../screenshots/apps/process_studio_desktop.png) | ![Process Monitor Responsive](../../screenshots/apps/process_studio_responsive.png) |

---

## 🧭 UI Guide

### Header
- **Refresh** and **Auto: 1s / 2s / 5s / Off** control the live update interval.
- **Export List…** saves the *currently filtered* table as CSV or JSON (choose by file extension). Cells starting with `=`, `+`, `-` or `@` are neutralised so spreadsheets cannot run them as formulas.
- **Copy Table** puts the filtered table on the clipboard as tab-separated text.

### System Telemetry
Total/user/system process counts, top CPU process, active port listeners, platform, plus a **load line**: load average, CPU cores, summed process CPU and RSS, and Mac uptime.

### Categories
All, User Apps, High CPU (>1%), High RAM (>100 MB), Dev Servers and Port Listeners.

### Search, Sort & Limit
- The search box matches name, PID, port, user and command, tolerates small typos and understands aliases (for example `chrome`).
- **Sort** by CPU, memory or PID; **Limit** the number of rows.
- **Group by app** collapses processes into one row per application (with a process count and combined CPU/RSS). Clicking a group selects its busiest process.

### Kill by Port
Enter a port (1-65535) and click **Kill Port Process**. Only the process **listening** on that port is targeted, so a browser tab connected to it is never killed. You are asked to confirm.
**Clean Rogue Dev Servers** finds bun/node/python/go/docker/postgres processes that belong to you and are listening or orphaned, lists them, and only acts after you confirm. Processes in this app's own chain are skipped.

### Inspector & Signal Dispatcher
Click a row (or type a PID) then use:
- **Terminate (SIGTERM)**, **Force Kill (SIGKILL)**, **Suspend (SIGSTOP)**, **Resume (SIGCONT)**, **Reload (SIGHUP)**
- **Terminate Process Tree** -- the process and every descendant, deepest first.
- **Quit All With Same Name** -- every process of the selected application.
- **Inspect Details** -- owner, state, uptime, parent, ports and executable path in the console.
- **Reveal in Finder** -- opens the executable's folder.
- **Lower Priority** -- renices the process so it yields CPU.
- **Copy PID** / **Copy Command**.

### Process Table
PID, Name, Port, CPU %, MEM %, RSS, User, State, **Uptime**, Command.

---

## 🛡️ Safety Rules
- PID 1, launchd, kernel_task, WindowServer, loginwindow, systemd and init are **always refused**, as is this app's own process.
- Invalid PIDs are rejected before anything is sent.
- **Force Kill and Suspend** always ask for confirmation.
- Processes owned by another user, the parent of this app, and processes that hold ports ask for an extra confirmation naming the risk.
- Signals are sent directly (no shell), and signal numbers are correct per operating system.

---

## 🛠️ Tutorials

### Free a port held by a stale dev server
1. Type the port (for example 3000) in **Kill by Port** and click **Kill Port Process**.
2. Confirm. The listener receives SIGTERM; clients stay untouched.

### Kill a whole app and its helpers
1. Tick **Group by app**, click the app's row.
2. Click **Quit All With Same Name**, or **Terminate Process Tree** to also take its children.

### Hand a report to a colleague
1. Filter to the processes you care about.
2. **Export List…** and save as `.csv` or `.json`.

---

## 💡 Tips
- Try **Terminate (SIGTERM)** first so databases and servers can flush and close cleanly; use Force Kill only if that fails.
- **Lower Priority** is a safe way to calm a runaway build without killing it.
- Typed values (filter, port, PID) are stored in the saved form state; do not paste secrets into them.
