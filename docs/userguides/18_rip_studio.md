# 🪦 Rip Studio Pro -- User Guide

**Rip Studio Pro** is an enterprise desktop workstation providing a safe, reversible, and ergonomic alternative to the Unix `rm` command. Inspired by `rm-improved (rip)`, it quarantines deleted files and directories into an isolated, timestamped Graveyard directory rather than permanently destroying them—allowing instant one-click unbury / recovery, pre-deletion impact inspection, and automated decomposition policies.

---

## ⚡ Quick Start

```bash
# Launch Rip Studio Pro desktop workstation
bun run app:rip

# Launch CLI mode directly
bun run cli:rip
```

You can also launch programmatically in TypeScript:
```ts
import { createRipStudio } from "./applications/rip_studio";
const win = createRipStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

Rip Studio Pro features a comprehensive multi-panel safety management workstation:

1. **Header & Navigation Toolbar**:
   - **Theme Selector**: Dynamic theme switcher with full visual harmony across 42 themes.
   - **⛶ Fullscreen**: Toggle borderless fullscreen space.
   - **Center Window**: Center window on active display.
   - **Graveyard Status**: Real-time KPI counter displaying total buried items and total quarantined disk footprint.
2. **Target Staging & Deletion Safety Zone**:
   - **Target Path Input**: Specify files or folders to delete.
   - **📂 Browse Files / 📁 Browse Folder**: Native OS pickers to stage files and folders for deletion.
   - **🔍 Inspect Before Bury**: Runs a safety audit on targets—evaluating file sizes, child item counts, write permissions, and symlink targets before touching disk.
   - **🪦 Bury Targets (Safe Delete)**: Atomically relocates targets into the Graveyard quarantine with a cryptographically tracked manifest entry.
3. **Quarantine Graveyard Table**:
   - Lists all buried items with Original Path, Quarantined Filename, File Size, Buried Date, and Deletion Reason.
   - Client-side instant filter input to search through quarantined items by name or path.
4. **Restoration & Recovery Actions**:
   - **↺ Unbury / Restore Selected**: Restores the selected file or folder back to its exact original filesystem location.
   - **↺ Restore All from Current Project**: Bulk-recovers all items that originated from the active workspace.
5. **Graveyard Maintenance & Decomposition**:
   - **👻 Séance History Log**: View complete chronological audit trail of all delete and restore actions.
   - **🧹 Decompose Expired**: Permanently purges items older than the retention threshold (defaults to 14 days).
   - **Purge All**: Explicitly flushes the entire quarantine directory after two-step confirmation.

---

## 📖 Practical Tutorials

### 1. Safely Deleting Build Artifacts
1. Click **📁 Browse Folder...** and select your project's `./build` or `./dist` directory.
2. Click **🔍 Inspect Before Bury** to view the item count and size.
3. Click **🪦 Bury Targets**. The directory is safely removed from your project and moved to quarantine.

### 2. Restoring an Accidental Deletion
1. In the **Quarantine Graveyard Table**, locate your deleted file or directory.
2. Click to select the item row.
3. Click **↺ Unbury Selected**. The item is instantly restored to its original filesystem location.

---

## 💻 Headless CLI Mode

Run the companion CLI for terminal workflows and shell aliases (`alias rm="bun run cli:rip"`):
```bash
# Safely quarantine a file or folder
bun run cli:rip bury ./temp.log ./old_dir/

# Inspect graveyard contents
bun run cli:rip seance

# Undo the most recent deletion
bun run cli:rip unbury --last

# Restore specific item by original path
bun run cli:rip unbury ./temp.log

# Purge items older than 30 days
bun run cli:rip decompose --days 30
```
