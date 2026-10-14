# Windows x64 Runtime & Application Runner

This folder contains the Windows x64 runtime setup and runner for `webview-bun` and Edge WebView2.

## Start Here: Command-Line & GUI Launchers

The launchers are the easiest way to discover the project's apps, demos, and CLI tools. Run these commands from the **repository root**, not from `windows-x64`:

```powershell
# Command-line launcher: discover and launch apps from the terminal
.\run.cmd -Cli

# GUI launcher: open Launcher Studio Pro
.\run.cmd -Gui

# Interactive Windows app picker
.\run.cmd

# Print the complete app, demo, and CLI tool catalog
.\run.cmd -List
```

PowerShell equivalents for the two launchers:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1 -Cli
powershell -ExecutionPolicy Bypass -File .\run.ps1 -Gui
```

If your terminal is already in `windows-x64`, use `..\run.cmd -Cli` or `..\run.cmd -Gui` instead.

### Windows Compatibility & Testing

**Being listed in a launcher does not mean an app is Windows-compatible.** Some apps were built around Unix/macOS/Linux commands and may fail to start or have unavailable features on Windows. For example, Task Manager uses `ps`, `lsof`, `kill`, `renice`, and Unix signals for process management; its GUI opening is not proof that those features work.

Test window opening, rendering, resizing, controls, and closing with the GUI launcher and a UI-focused demo such as `.\run.cmd 23` or `.\run.cmd calculator`, then test each app's functionality separately. Record Unix-dependent failures separately from Bun/WebView2 setup failures; do not assume all catalog entries work on Windows.

## Quick Start: Running Apps & Demos

You can select demos and applications using `run.ps1` or `run.cmd` from the repository root, or `.\run-demo-x64.ps1` from this folder. Actual functionality depends on the app's Windows compatibility.

### 1. Interactive Menu (Pick from any app/demo)
```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
# or simply (via CMD/PowerShell):
.\run.cmd
```

### 2. Launch Specific Apps & Demos
```powershell
# Run the Universal Calculator & STEM Studio
powershell -ExecutionPolicy Bypass -File .\run.ps1 calculator

# Run Games & Arcade
powershell -ExecutionPolicy Bypass -File .\run.ps1 pacman
powershell -ExecutionPolicy Bypass -File .\run.ps1 pong
powershell -ExecutionPolicy Bypass -File .\run.ps1 connect4

# Run Showcases by number or name (01 - 25)
powershell -ExecutionPolicy Bypass -File .\run.ps1 23          # Universal 42 Themes
powershell -ExecutionPolicy Bypass -File .\run.ps1 05          # CRUD Task Table
powershell -ExecutionPolicy Bypass -File .\run.ps1 ide         # File Explorer Mini IDE

# Open the Full GUI Launcher Studio Hub
powershell -ExecutionPolicy Bypass -File .\run.ps1 -Gui

# List All Available Apps, Demos & CLI Tools
powershell -ExecutionPolicy Bypass -File .\run.ps1 -List
```

### 3. Using `windows-x64\run-demo-x64.ps1` Directly
`run-demo-x64.ps1` accepts app or demo targets; it does not make Unix-dependent apps Windows-compatible. These examples run from the repository root:
```powershell
# Run default showcase demo 23
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1

# Run any specific app or demo
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1 calculator
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1 pacman
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1 -List
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1 -Interactive
```

## Files in this Folder

- `run-demo-x64.ps1` — Runner script targeting Windows x64, with auto-detection and parameter support.
- `install-x64-webview2.ps1` — Finds or installs the x64 WebView2 runtime and copies `WebView2Loader.dll` into `node_modules\webview-bun\build\`.
- `set-bun-x64.ps1` — Prepends Bun installation directories to `PATH`.

## When to use manual setup

Use `install-x64-webview2.ps1` if:
- `ERR_DLOPEN_FAILED` is thrown when loading `libwebview.dll`
- `WebView2Loader.dll` is missing in `node_modules\webview-bun\build`
- `WEBVIEW_PATH` points to the wrong library or stale runtime
