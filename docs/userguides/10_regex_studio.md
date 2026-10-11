# 🎯 Regex Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native V8 ECMAScript RegExp Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:regex]  •  [Terminal CLI: bun run cli:regex]
```

---

## 🌟 Executive Overview
**Regex Studio Pro** is an interactive regular expression testing, evaluation, match group dissection, and code generation workbench built natively for Bun RAD Studio. Designed to replace ad-supported online regex testers, it evaluates complex regular expressions in real time directly against your sample text with zero latency.

It features capture group breakdown tables, visual match highlighting, real-time string substitution previews, a built-in library of common production regex patterns, and instant code generation for TypeScript and JavaScript.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:regex
```

### 2. Launch Terminal CLI Regex Evaluator
```bash
# Test regex pattern against string in terminal
bun run cli:regex -p "\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b" -t "test@example.com"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Regex Studio Desktop](../../screenshots/apps/regex_studio_desktop.png) | ![Regex Studio Responsive](../../screenshots/apps/regex_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Regex Pattern & Flags Toolbar
- **Regular Expression Pattern Input**: Text input for regex pattern (e.g. `(\w+):\s*(\d+)`).
- **Flags Toggles**:
  - `g` (Global): Find all matches rather than stopping at the first.
  - `i` (Ignore Case): Case-insensitive matching.
  - `m` (Multiline): `^` and `$` match beginning and end of each line.
  - `s` (DotAll): Dot (`.`) matches newline characters.
  - `u` (Unicode): Full Unicode character class matching.
- **Pattern Presets Dropdown**: Instant presets for Email, URL, IPv4, UUID, SemVer, Dates, and Hex Colors.

### 2. Test String & Live Visual Match Inspector
- **Test String Editor**: Multi-line textarea to paste log files, source code, or sample inputs.
- **Visual Match Highlighting**: Matches are color-coded in yellow/cyan with clear boundary markers.
- **Match Telemetry Pill**: Displays total match count and evaluation duration in microseconds.

### 3. Match Groups & Capture Table
- **Interactive Match Table**: Lists Match Index, Full Match String, Start Index, End Index, and individual Capture Groups (`$1`, `$2`, etc.).
- **Named Capture Groups**: Automatically detects and displays `(?<name>...)` capture groups by name.

### 4. String Substitution & Code Generator
- **Replacement String Input**: Type substitution pattern with capture references (`$1`, `$2`, `$<name>`).
- **Substitution Preview Pane**: Live display of the replaced string.
- **TypeScript Code Generator**: Instant code snippet ready to paste into your codebase.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Parsing Key-Value Configurations with Capture Groups
1. Launch Regex Studio Pro: `bun run app:regex`.
2. In the **Pattern** field, enter:
   ```regex
   ^([A-Z_]+)=["']?([^"'
]+)["']?$
   ```
3. Enable flags: `g` (Global) and `m` (Multiline).
4. Paste sample `.env` text into **Test String**:
   ```text
   DATABASE_PORT=5432
   NODE_ENV="production"
   API_KEY='secret_token_123'
   ```
5. Review the **Capture Groups Table**:
   - Match 1: `$1 = DATABASE_PORT`, `$2 = 5432`
   - Match 2: `$1 = NODE_ENV`, `$2 = production`
   - Match 3: `$1 = API_KEY`, `$2 = secret_token_123`
6. Click **Copy TypeScript Snippet** to paste working parser code into your project.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Pattern / Test String | Force immediate re-evaluation |
| **Cmd + Shift + P** | Pattern Bar | Open Pattern Presets menu |
| **Cmd + Shift + C** | Generator | Copy TypeScript code snippet |
| **F11** or **F** | Global | Toggle borderless fullscreen |
