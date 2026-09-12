# 🔍 Fd Studio Pro -- User Guide

**Fd Studio Pro** is an enterprise-grade, ultra-fast filesystem traversal and search desktop workstation built natively for Bun. Designed as a high-performance, pure-TypeScript replacement for `fd-find`, it delivers instant directory scanning, glob/regex matching, size and modification-time filters, and interactive batch command execution—with zero third-party binary dependencies.

---

## ⚡ Quick Start

```bash
# Launch Fd Studio Pro desktop workstation
bun run app:fd

# Launch with alternative alias
bun run app:find

# Launch CLI mode directly
bun run cli:fd
```

You can also launch programmatically in TypeScript:
```ts
import { createFdStudio } from "./applications/fd_studio";
const win = createFdStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

Fd Studio Pro features an ergonomic, high-efficiency desktop layout:

1. **Header & Navigation Toolbar**:
   - **Theme Selector**: Dynamic theme switching across 42 themes (Sonoma Emerald, Midnight Indigo, Monokai Pro, etc.).
   - **⛶ Fullscreen**: Toggle borderless fullscreen mode.
   - **💾 Save Config**: Persists active filters, target paths, and layout preferences to disk.
   - **Center**: Centers the window on your primary display.
2. **Search Target & Pattern Panel**:
   - **Pattern**: Supports plain text substrings, glob wildcards (e.g. `*.ts`, `src/**/*.tsx`), and regular expressions.
   - **Target Root**: Root folder to search (defaults to current project directory `./`).
   - **Extension Filter**: Filter by extension without leading dot (e.g. `ts,js,json`).
3. **Type & Attribute Filters**:
   - **Type Toggles**: Filter by `All`, `Files Only` (`-t f`), `Directories Only` (`-t d`), or `Symlinks Only` (`-t l`).
   - **Hidden & Gitignore**: Toggle inclusion of hidden files (`.` prefix) and `.gitignore` ignored files.
   - **Depth Limit**: Restrict traversal depth (`--max-depth`).
   - **File Size Filter**: Restrict by size, e.g. `+10M` (greater than 10 MB) or `-100k` (smaller than 100 KB).
4. **Results Table & Live Telemetry**:
   - Interactive data grid displaying Relative Path, File Type, Human-Readable Size, Permissions (`rwxr-xr-x`), and Last Modified Timestamp.
   - High-contrast execution metrics: total matches found, directories scanned, and elapsed search duration.
5. **Batch Execution Command Builder**:
   - Construct batch commands using placeholders:
     - `{}`: Full item path.
     - `{/}`: Basename / filename only.
     - `//`: Parent directory path.
   - Execute commands in parallel or sequentially with live terminal output capture.

---

## 📖 Practical Tutorials

### 1. Finding All TypeScript Files Modified Recently
1. In **Pattern**, enter `*.ts`.
2. In **Target Root**, leave as `./` or browse to target project.
3. Toggle **Files Only**.
4. Click **⚡ Find Files**.

### 2. Batch Processing Discovered Files
1. Set your search pattern (e.g. `*.log`).
2. In **Batch Command**, enter:
   ```bash
   gzip {}
   ```
3. Click **▶ Run Batch Command** to compress all matching files in-place.

---

## 💻 Headless CLI Mode

Run the companion CLI for terminal scripting and CI/CD pipelines:
```bash
# Basic file search
bun run cli:fd "*.ts"

# Filter by extension and size
bun run cli:fd --extension json --size "+1M"

# Execute command on each result
bun run cli:fd "*.tmp" --exec "rm -f {}"
```
