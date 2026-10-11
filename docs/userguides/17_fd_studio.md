# 🔎 Fd Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Recursive Filesystem Traversal  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:fd]  •  [Terminal CLI: bun run cli:fd]
```

---

## 🌟 Executive Overview
**Fd Studio Pro** is an ultra-fast, intuitive filesystem search, file discovery, and batch manipulation workbench engineered natively for Bun RAD Studio. Designed as a modern, friendly replacement for GNU/BSD `find`, it provides lightning-fast file searching with smart defaults: case-insensitivity by default, automatic respect for `.gitignore`, and clean colorized output.

In addition to searching, Fd Studio Pro integrates directly with **Rip Studio Pro** to provide one-click safe file burial into a recoverable graveyard quarantine, plus a batch execution builder to run shell commands across all discovered files.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:fd

# Shorthand alias
bun run app:find
```

### 2. Launch Terminal CLI File Finder
```bash
# Find files matching pattern in current directory
bun run cli:fd "*.ts"

# Search for exact file name ignoring case
bun run cli:fd "package.json"

# Search within specific directory
bun run cli:fd "*.sqlite" ./data
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Fd Studio Desktop](../../screenshots/apps/fd_studio_desktop.png) | ![Fd Studio Responsive](../../screenshots/apps/fd_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Search Query & Target Toolbar
- **Search Pattern Input**: Glob pattern (e.g. `*.png`) or regular expression (e.g. `test_.*\.ts$`).
- **Search Directory Input**: Path to start recursive traversal (default `./`).
- **File Type Filter**: All Types, Files Only, Directories Only, or Symlinks.
- **Hidden Files & Gitignore Checkboxes**:
  - `Show Hidden (-H)`: Include dotfiles (`.env`, `.gitignore`).
  - `Respect .gitignore (-I)`: Skips `node_modules`, `dist`, and gitignored artifacts.
- **⚡ Search Files Button (Enter)**: Traverses folders in parallel.

### 2. Discovered Files Table
- **File Path**: Relative or absolute path with file type icon.
- **File Size**: Formatted byte size (B, KB, MB, GB).
- **Modified Date**: Last modification timestamp.
- **Permissions**: POSIX permissions octal string (e.g. `0755`, `0644`).
- **Row Actions**:
  - **📂 Open in Finder**: Reveals file in system file manager.
  - **⚰️ Bury File**: Safely quarantines file into the Rip Graveyard.

### 3. Batch Command Execution Builder
- **Exec Command Template**: Command string using `{}` as placeholder for file path (e.g. `bun build {}`, `wc -l {}`).
- **⚡ Execute Across All Matches**: Runs command for each matching file and streams output to log.
