# 🔄 Sd Studio Pro -- User Guide

**Sd Studio Pro** is an intuitive, visual find-and-replace desktop workstation built natively for Bun. Designed as a modern, safe, and visual replacement for `sed`, it features real-time regular expression substitution with capture groups (`$1`, `$2`), literal string mode, unified side-by-side diff previews, automatic `.bak` backups, and batch file modifications across projects.

---

## ⚡ Quick Start

```bash
# Launch Sd Studio Pro desktop workstation
bun run app:sd

# Launch CLI mode directly
bun run cli:sd --help
bun run cli:sd "oldPattern" "newText" file.txt --preview
```

You can also launch programmatically in TypeScript:
```ts
import { createSdStudio } from "./applications/sd_studio";
const win = createSdStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

1. **Header & Navigation Toolbar**:
   - **Theme Selector**: Dynamic theme switching across 63 themes.
   - **⛶ Fullscreen**: Toggle borderless fullscreen mode.
   - **💾 Save Config**: Persists patterns, options, and preferences to disk.
   - **Center**: Centers the window on your primary display.
2. **Telemetry Cards**:
   - Total files analyzed, matches found, files modified, and engine status.
3. **Pattern & Replacement Configuration**:
   - **Find Pattern**: Regular expression or literal string to locate.
   - **Replace With**: Replacement text supporting capture references (`$1`, `$2`).
   - **Target Files / Dirs**: Comma-separated files or directories to process.
   - **Options**:
     - Literal String Mode (`-s`): Treats regex meta-characters literally.
     - Whole Word (`-w`): Matches word boundaries `\b`.
     - Ignore Case (`-i`): Case-insensitive matching.
     - Backup (`-b`): Automatically creates `.bak` backups before modifying files.
     - Regex Flags (`-f`): Regex execution flags (default `g`).
4. **Modified & Matching Files Table**:
   - Interactive table listing File Path, Matches count, Diff Hunks, and Status.
5. **Unified Diff Inspector Console**:
   - High-contrast unified diff viewer showing colored additions and deletions.
