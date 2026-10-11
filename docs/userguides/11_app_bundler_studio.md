# 📦 App Bundler Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native bun build --compile  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:bundler]  •  [Terminal CLI: bun run cli:bundler]
```

---

## 🌟 Executive Overview
**App Bundler Studio Pro** is an enterprise packaging, single-file compilation, and native desktop app builder built on Bun's ultra-fast `bun build --compile` engine. It allows developers to bundle full TypeScript, JavaScript, and Webview projects into standalone, self-contained executable binaries that run on machines without Bun or Node installed.

Additionally, on macOS it automatically generates ready-to-distribute `.app` application bundles complete with `Info.plist`, bundle identifiers, high-resolution application icons (`.icns`), and notarization-ready directory structures.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:bundler
```

### 2. Launch Terminal CLI Compilation Mode
```bash
# Compile single entry point to standalone binary
bun run cli:bundler ./src/index.ts -o ./dist/my_app

# Cross-compile for Linux x64
bun run cli:bundler ./src/index.ts --target bun-linux-x64 -o ./dist/my_app_linux
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![App Bundler Desktop](../../screenshots/apps/app_bundler_studio_desktop.png) | ![App Bundler Responsive](../../screenshots/apps/app_bundler_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Project Source & Target Configuration
- **Entrypoint File Input**: Path to main entry script (e.g. `./index.ts` or `./applications/calculator_studio.ts`).
- **Output Binary Name**: Target name of the compiled binary or `.app` bundle.
- **Output Directory**: Target distribution folder (default `./dist`).
- **Cross-Compilation Target Dropdown**:
  - `bun-darwin-arm64` (Apple Silicon M1/M2/M3/M4)
  - `bun-darwin-x64` (Intel macOS)
  - `bun-linux-x64` (Standard Linux servers / containers)
  - `bun-linux-arm64` (Linux ARM servers / AWS Graviton / Raspberry Pi)
  - `bun-windows-x64` (Windows 10 / 11 64-bit)

### 2. Desktop macOS .app Packaging Engine
- **Bundle Identifier**: Reverse domain identifier (e.g. `com.codefreelance.studio`).
- **Application Display Name**: Formatted name shown in macOS Dock and Finder.
- **Icon Selector**: Path to `.png` or `.icns` icon to embed into the bundle.
- **Generate .app Bundle Toggle**: Automatically generates `Contents/MacOS` and `Contents/Info.plist`.

### 3. Build Telemetry & Streaming Console
- **⚡ Compile Binary Button**: Triggers compilation with real-time log streaming.
- **Build Metrics Card**: Shows compilation time, output file size (MB), and bytecode compression ratio.
- **File Explorer Reveal**: One-click button to reveal compiled binary in macOS Finder or open destination folder.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Building a Standalone macOS Desktop Application
1. Launch App Bundler Studio: `bun run app:bundler`.
2. Set **Entrypoint File**: `./applications/calculator_studio.ts`.
3. Set **Output Binary Name**: `CalculatorStudio`.
4. Enable **Generate macOS .app Bundle**.
5. Set **Bundle ID**: `com.codecaine.calculator`.
6. Click **⚡ Compile Binary**.
7. In under 2 seconds, your complete self-contained `dist/CalculatorStudio.app` is created. You can drag and drop it directly into your `/Applications` folder or share it with anyone.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + B** / **Ctrl + B** | Global | Start Compilation |
| **Cmd + O** / **Ctrl + O** | File Picker | Browse for Entrypoint file |
| **Cmd + R** / **Ctrl + R** | Post-Build | Reveal output in Finder / Explorer |
| **F11** or **F** | Global | Toggle borderless fullscreen |
