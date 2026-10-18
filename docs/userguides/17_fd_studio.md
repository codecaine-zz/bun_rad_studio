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

| High-Resolution Desktop (1400×2350, full page) | Responsive Viewport (960×1500) |
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

### 4. File Operations & Analysis Toolkit (no terminal needed)
A beginner-friendly file-manager layer on top of search — everything is a button, every change is logged in the console.
- **📄 New File / 📁 New Folder**: Type a name in **Name** and click; created in the **Search Root**.
- **✏️ Rename Selected / ⧉ Duplicate / ↗ Open**: Act on the row selected in the results table (Duplicate makes `name copy.ext`; Open uses the default app).
- **🔐 Set Permissions / 🔢 Hex View**: Set `chmod` as octal (`644`, `755`) or symbolic (`rwxr-xr-x`); inspect binary files as a hex dump.
- **↶ Undo Last Change (N)**: Reverses renames, new files/folders and duplicates, newest first. (Deletes use the 🪦 Rip graveyard, which is also recoverable.)
- **Batch Rename (all matches)**: Find/replace (plain or Regex), lowercase/UPPERCASE/Title Case, prefix, suffix, numbering (`_001`), spaces→underscores. **👁 Preview Rename** shows old → new names and flags conflicts without touching disk; **✅ Apply Rename** asks for confirmation, then renames safely (swap/chain-proof).
- **🔎 Search Contents**: Grep inside every matched text file (plain/Regex, optional case-sensitive) with `file:line` results; binaries are skipped.
- **👯 Find Duplicates**: Groups identical files (size, then SHA-256) and reports reclaimable space.
- **🐘 Largest Files / 📊 Usage by Type**: Top files and size-per-extension breakdown of the current matches.
- **📑 Export TSV / 📝 Export Markdown / 🗒 Export Path List**: Saved into the *Target Destination Folder* and copied to the clipboard (JSON and CSV exports are still available).
- **Min Depth filter**: Skip the top N folder levels (companion to Max Depth).

### 5. Productivity Features
- **📁 Browse… (Search Root / Destination Folder)**: Pick folders with a native dialog instead of typing paths. Picking a new Search Root re-runs the search (and restarts the live watcher if it is on).
- **Preset dropdown**: One-click saved searches — Large files (>10M), Recently modified (24h), Images, Source code, Documents, Logs, Empty files & folders, Directories only. A preset fills the extension, size, age and type filters and searches immediately.
- **Recent searches**: The last 15 distinct patterns are kept for the session; choose one to re-run it.
- **Max results**: Cap the number of matches (default `1500`, up to `20000`). The status bar tells you when results were capped.
- **Sort**: Default, Name A→Z / Z→A, Size largest / smallest, Modified newest / oldest — applied instantly without rescanning.
- **Filter results**: Type to narrow the current results by name or path (case-insensitive) without rescanning. Batch actions, exports and copies use exactly what is shown.
- **💾 Save Results As…**: Native Save dialog; the format follows the extension you choose — `.json`, `.csv`, `.tsv`, `.md` or `.txt` (path list).
- **Feedback**: A toast summarizes each search (count and time), and a missing Search Root shows a clear error instead of an empty result.
