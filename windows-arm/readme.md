# Windows ARM64 Runtime & Application Runner

This folder contains the Windows ARM64 runtime setup and runner for `webview-bun` and Edge WebView2 on ARM64 hardware (Surface Pro, Qualcomm Snapdragon X Elite/Plus, Dev Kit).

## Quick Start: Running Apps & Demos

You can run any demo or application directly from the root using `run.ps1` or `run.cmd`, or from this folder using `run-demo-arm.ps1`:

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
`run-demo-arm.ps1` supports running any app or demo:
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
