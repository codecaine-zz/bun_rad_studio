# Windows ARM64 Runtime & Application Runner

This folder contains the Windows ARM64 runtime setup and runner for `webview-bun` and Edge WebView2, including Windows 11 ARM64 in Parallels Desktop on Apple Silicon and ARM64 hardware (Surface Pro, Qualcomm Snapdragon X Elite/Plus, Dev Kit).

## Start Here: Command-Line & GUI Launchers

The launchers are the easiest way to discover the project's apps, demos, and CLI tools. Run these commands from the **repository root**, not from `windows-arm`:

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

If your terminal is already in `windows-arm`, use `..\run.cmd -Cli` or `..\run.cmd -Gui` instead.

### Windows Compatibility & Testing

**Being listed in a launcher does not mean an app is Windows-compatible.** Some apps were built around Unix/macOS/Linux commands and may fail to start or have unavailable features on Windows. For example, Task Manager uses `ps`, `lsof`, `kill`, `renice`, and Unix signals for process management; its GUI opening is not proof that those features work.

Parallels runs a real Windows guest, so test inside Windows rather than treating results from the macOS host as Windows results. Start with the launchers and a UI-focused demo such as `.\run.cmd 23` or `.\run.cmd calculator`. Check window opening, rendering, resizing, controls, and closing, then test each app's functionality separately. Record Unix-dependent failures separately from Bun/WebView2 setup failures; do not assume all catalog entries work on Windows.

## Quick Start: Running Apps & Demos

### File Manager: Windows terminal and conversion helpers

Launch with `.\run.cmd filemanager`. The **Terminal** toolbar button (or **Ctrl+`**)
opens an embedded Windows PowerShell session in the current folder. It uses Windows
ConPTY, supports interactive commands, Ctrl+C and resizing, and needs no additional
terminal package. The first terminal takes a moment to compile its small local
bridge using Windows PowerShell's built-in C# compiler. Hiding the panel keeps the
shell running; Restart replaces it, and closing the app ends its terminal sessions.
Commands run with your user permissions and bypass the File Manager's Recycle Bin
and confirmations. **Follow terminal** also works on Windows: when PowerShell returns
to its prompt after `cd`, `Set-Location`, `Push-Location` or `Pop-Location`, the file
list follows its filesystem folder. Untick it to keep browsing independently.
Registry and other non-filesystem PowerShell providers do not change the file list.

In **Convert > Helper programs**, **Download** opens the program's official website
in your default browser. Windows installs use WinGet when available; manual commands
can also be typed into the embedded terminal. **Check again** searches both PATH and
known install locations, including nested user/machine WinGet package directories
(FFmpeg and Poppler), WindowsApps, Scoop shims, and common program folders. New
portable WinGet installs can be detected without restarting the File Manager.
Custom portable locations outside these folders still need to be added to PATH
before launching the app, or supplied with `--tool-dirs` (semicolon-separated on Windows).

You can select demos and applications using `run.ps1` or `run.cmd` from the repository root, or `.\run-demo-arm.ps1` from this folder. Actual functionality depends on the app's Windows compatibility.

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

### 3. Using `windows-arm\run-demo-arm.ps1` Directly
`run-demo-arm.ps1` accepts app or demo targets; it does not make Unix-dependent apps Windows-compatible. These examples run from the repository root:
```powershell
# Run default showcase demo 23
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1

# Run any specific app or demo
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1 calculator
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1 pacman
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1 -List
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1 -Interactive
```

---

## 💡 Windows ARM64 Architecture & Zero-Config Setup

### Why Does ARM64 Require Bun x64 for GUI Apps?
- The `webview-bun` npm package ships with a precompiled `libwebview.dll` targeting **x86_64 (x64)**.
- If native Bun ARM64 attempts to `dlopen` an x64 DLL, Windows throws:
  `error: Failed to open library "...libwebview.dll": error code 193 (ERR_DLOPEN_FAILED)`
  because a 64-bit ARM process cannot load an x86_64 PE dynamic link library into its address space.
- **The Solution**: Windows 11 ARM64 features a built-in, hardware-accelerated x64 binary emulation layer (Prism).

### How `run.ps1` Solves This Automatically
When you run `run.ps1` or `run-demo-arm.ps1` on an ARM64 system:
1. It automatically detects `ARM64` CPU architecture.
2. It looks for an x64 Bun runtime (`C:\Tools\bun-x64\bun-windows-x64\bun.exe` or `%LOCALAPPDATA%\bun-x64\bun.exe`).
3. If not already installed, it **automatically downloads and configures official `bun-windows-x64`** (~25 MB one-time setup).
4. It launches the application through Windows 11's built-in emulation layer, completely eliminating `error code 193` and opening desktop windows smoothly.

---

## Execution Policy Tip
If Windows displays `running scripts is disabled on this system`, run this once in PowerShell:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
```
Or simply use `.\run.cmd <app>` or `powershell -ExecutionPolicy Bypass -File .\run.ps1 <app>`.

---

## Files in this Folder

- `run-demo-arm.ps1` — Runner script targeting Windows ARM64 with auto-detection and parameter support.
- `install-arm64-webview2.ps1` — Extracts a downloaded WebView2 ARM64 runtime and copies `WebView2Loader.dll` to `node_modules\webview-bun\build\`.
- `set-bun-arm64.ps1` — Points Bun to an ARM64 Bun installation if available.
