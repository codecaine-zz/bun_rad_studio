# 🛠️ DevTools Studio Pro -- User Guide

**DevTools Studio Pro** is a unified 6-in-1 developer workstation combining the most essential day-to-day command-line developer utilities into a single high-speed desktop interface. Powered by pure Bun and Node subsystem primitives, it replaces 6 separate CLI packages (`ripgrep`, `fd`, `sd`, `watchexec`, `rm-improved/rip`, and `jq`) with zero external binary requirements.

---

## ⚡ Quick Start

```bash
# Launch DevTools Studio Pro
bun run app:devtools

# Launch backwards-compatible alias
bun run app:omnitool
```

---

## 🖥️ The 6 Integrated Developer Engines

DevTools Studio Pro provides six specialized operating modes selectable via the top navigation dropdown:

| Mode | Engine Name | Replaces Tool | Primary Use Case |
| :-: | :--- | :--- | :--- |
| **1** | **Ripgrep (rg)** | `rg` (ripgrep) | Ultra-fast recursive regex pattern search across codebases. |
| **2** | **Fd (fd)** | `fd-find` | Fast file and directory discovery by name, regex, or extension. |
| **3** | **Sd (sd)** | `sd` | Safe in-place regex find & replace with automatic backups. |
| **4** | **Watchexec** | `watchexec` | Continuous filesystem watcher and automated command runner. |
| **5** | **Rip (rip)** | `rm-improved` | Safe graveyard trash: moves files to `~/.Trash` instead of permanent deletion. |
| **6** | **JQ** | `jq` | High-throughput JSON selector, path extraction, and formatting. |

---

## 🖥️ User Interface Overview

1. **Tool Switcher & Mode Bar**:
   - Select any of the 6 engines from the dropdown. The control panels dynamically adapt to the active mode.
   - Live readiness status pills for all 6 engines (`RG: Ready`, `FD: Ready`, `SD: Ready`, etc.).
2. **Parameters & Search Input**:
   - **Pattern / Query**: Enter regex search patterns, file masks, replacement strings, or JSON selectors.
   - **Target Path**: Directory or file path to operate on (defaults to current project `./`).
   - **Options**: Recursive search, case-sensitivity toggle, file extension filters.
3. **Action Controls**:
   - **⚡ Run Tool**: Executes the selected engine immediately.
   - **Clear Output**: Resets the log display.
   - **Copy Results**: Copies the formatted findings or execution log to clipboard.
4. **Execution Console**:
   - Terminal-style high-contrast output with line numbers, file paths, match highlights, and execution latency.

---

## 📖 Practical Tutorials

### 1. Searching Code with the Ripgrep Engine
1. Select **1. Ripgrep (rg) - Code Search** in the dropdown.
2. In **Pattern**, type:
   ```text
   newSimpleWindow|addHeading
   ```
3. Set **Target Path** to `./applications`.
4. Click **⚡ Run Tool**.
5. Matches appear in the console with filename, line numbers, and syntax snippets.

### 2. Finding Files with the Fd Engine
1. Select **2. Fd (fd) - File & Directory Finder**.
2. In **Pattern**, type:
   ```text
   *.test.ts
   ```
3. Click **⚡ Run Tool**.
4. DevTools traverses the directory tree using fast native readdir primitives and lists all matching test suites.

### 3. Safe Deletion with the Rip Graveyard Engine
1. Select **5. Rip - Safe Trash Graveyard**.
2. In **Target Path**, enter a temporary file (e.g. `./scratch/temp.log`).
3. Click **⚡ Run Tool**.
4. Rather than executing an irreversible `rm -rf`, Rip moves the item to macOS `~/.Trash`, allowing full recovery if needed.

---

## 🛡️ Enterprise Resilience Features
- **100% Native Bun & OS Primitives**: All 6 engines run in-process using `Bun.file`, `Bun.write`, `node:fs`, and regular expressions.
- **Accidental Loss Prevention**: Mode 5 defaults to safe system trash. File replacements in Mode 3 verify file existence and permissions before writing.
- **Large Codebase Safeguards**: Traversal depth limits and match caps prevent runaway searches from consuming excessive memory.
