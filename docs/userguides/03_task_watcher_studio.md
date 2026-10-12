# ⏱️ Task Watcher Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native fs.watch & Bun.spawn  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:watcher]  •  [Terminal CLI: bun run cli:watcher]
```

---

## 🌟 Executive Overview
**Task Watcher Studio** is an ultra-fast, native filesystem watcher, automated test runner, and task execution workstation. Engineered on top of Node's recursive `fs.watch` primitive and `Bun.spawn`, it completely eliminates heavyweight third-party watcher dependencies like `chokidar` or `watchexec`.

It provides sub-millisecond file change detection, smart debounce buffers, customizable extension white-lists, directory exclusion rules, and a streaming desktop console with microsecond execution timings.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:watcher

# Shorthand alias
bun run app:watch
```

### 2. Launch Terminal CLI Watcher Mode
```bash
# Watch current directory and run tests on save
bun run cli:watcher -d ./src -e "bun test"

# Watch with specific extension filters
bun run cli:watcher -d ./ -x "ts,js,json" -e "bun run build"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Task Watcher Desktop](../../screenshots/apps/watcher_studio_desktop.png) | ![Task Watcher Responsive](../../screenshots/apps/watcher_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Watch Target Configuration Bar
- **Watch Directory Path**: Input folder to monitor recursively (e.g. `./src`, `./applications`, or absolute path).
- **Execution Command**: Shell command to trigger whenever a matching file changes (e.g., `bun test`, `bun run build`, `tsc --noEmit`).
- **File Extensions Filter**: Comma-separated list of extensions to monitor (e.g., `ts,tsx,js,json,css,html`).
- **Ignore Patterns**: Comma-separated list of paths or subdirectories to ignore (e.g. `node_modules,.git,dist,.temp,build`).
- **Debounce Delay (ms)**: Debounce buffer window (default `300ms`) to coalesce rapid multi-file IDE saves into a single run.
- **📁 Browse... (Watch Directory / Run In)**: Opens a folder picker so you never have to type a path. **Run In** sets the working directory the command executes in (blank = current directory).
- **Preset Dropdown**: One-click commands (`bun test`, `tsc --noEmit`, `eslint`, `bun build`, `npm test`, ...) that fill the Execute Command box; you can still edit it afterwards.
- **Restart on Change**: When on, a new file change kills the running command and restarts it. When off, the running command finishes and extra changes are logged and ignored.
- **Notify When Done**: Shows a success or failure toast (with run number and duration) when a run ends.
- **Copy Log / Export Log**: Copy the console output to the clipboard or save it to a file through a save dialog.
- **Clear History**: Empties the File Modification History table (which now includes a **Duration** column).
- **Live Streaming & Validation**: Output streams into the console as it is produced, and a missing watch or working directory shows an error toast instead of failing silently.

### 2. Execution Control Panel
- **▶ Start Watching Button**: Starts the native background recursive file watcher.
- **⏹ Stop Watching Button**: Gracefully stops the watcher and clears active timeouts.
- **⚡ Trigger Now Button**: Manually forces an immediate execution of the configured command without touching files.
- **🧹 Clear Console Button**: Wipes the streaming terminal output log.

### 3. Live Streaming Terminal Console
- **Output Window**: High-contrast, dark-mode terminal screen streaming `stdout` and `stderr` from the spawned process.
- **Status Badges**: Shows whether the last execution passed (green check) or failed with non-zero exit code (red alert).
- **Execution History Table**: Records timestamp, changed file path, event type (`change`, `rename`, `add`), and process duration in milliseconds.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Setting Up Instant Test-Driven Development (TDD)
1. Launch Task Watcher Studio: `bun run app:watcher`.
2. Set **Watch Directory**: `./src`.
3. Set **Execution Command**: `bun test`.
4. Set **File Extensions**: `ts,tsx`.
5. Set **Ignore Patterns**: `node_modules,dist,.git`.
6. Click **▶ Start Watching**.
7. Edit any test file in your editor and hit save. Task Watcher Studio instantly captures the event, runs your test suite, and displays colored terminal output in the GUI.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Space** / **Enter** | Toolbar | Toggle Watcher Start/Stop |
| **Cmd + T** / **Ctrl + T** | Toolbar | Trigger Command Immediately |
| **Cmd + K** / **Ctrl + K** | Console | Clear execution log |
| **Cmd + S** / **Ctrl + S** | Window | Save watcher presets |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Tune Debounce for IDEs**: Modern IDEs like VS Code often perform multi-stage saves (temp file write, rename, formatting). Setting debounce to `250ms–350ms` prevents duplicate execution runs.
- **Ignore Heavy Folders**: Always include `node_modules` and `.git` in your ignore list to save CPU cycles and prevent spurious file event storms.
