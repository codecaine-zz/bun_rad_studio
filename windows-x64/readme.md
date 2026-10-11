# Windows x64 Runtime & Application Runner

This folder contains the Windows x64 runtime setup and runner for `webview-bun` and Edge WebView2.

## Quick Start: Running Apps & Demos

You can run any demo or application directly from the root using `run.ps1` or `run.cmd`, or from this folder using `run-demo-x64.ps1`:

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
`run-demo-x64.ps1` supports running any app or demo:
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
