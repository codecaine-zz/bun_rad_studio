# ⚰️ Rip Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native File Quarantine & Graveyard Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:rip]  •  [Terminal CLI: bun run cli:rip]
```

---

## 🌟 Executive Overview
**Rip Studio Pro** is an ergonomic, safe replacement for `rm` and `rm -rf`. Instead of permanently destroying files with irreversible deletion, Rip Studio Pro moves targeted files and directories into a date-stamped, tracked local **Graveyard Quarantine** (`~/.local/share/rip/graveyard`, or the folder in the `GRAVEYARD` environment variable).

> **Also available inside the File Manager.** The [Codecaine File Manager](43_file_manager.md#graveyard-rip) has a **Graveyard** tab (Find & more → Graveyard) and a right-click **Bury (Rip)** that use this same graveyard: bury there and restore here, or the other way round. The Homebrew `rip` command keeps a different graveyard layout and does not share items with this one.

Every buried file retains its original absolute path metadata, deletion timestamp, and file permissions, allowing instant, one-click **Unbury Restoration** to resurrect accidentally deleted source code, databases, or documents.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:rip
```

### 2. Launch Terminal CLI Safe Removal
```bash
# Safely bury a file (replaces rm file.txt)
bun run cli:rip bury file.txt

# Inspect graveyard items
bun run cli:rip list

# Unbury / restore the last deleted item
bun run cli:rip unbury
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Rip Studio Desktop](../../screenshots/apps/rip_studio_desktop.png) | ![Rip Studio Responsive](../../screenshots/apps/rip_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Bury Target Panel
- **Target File/Folder Input**: Path to file or directory to bury.
- **⚰️ Bury Target Button**: Atomically moves the item into the Graveyard with metadata manifest.

### 2. Graveyard Archive Table
- **Original Path**: The exact filesystem path where the file lived.
- **Buried Date & Time**: Timestamp of quarantine.
- **Size**: Disk space consumed by quarantined file.
- **Actions**:
  - **♻️ Unbury (Restore)**: Resurrects file back to original location.
  - **🔥 Permanently Shred**: Irreversibly purges single item from disk.

### 3. Graveyard Storage Maintenance
- **Graveyard Size Pill**: Total disk space occupied by quarantined files.
- **🧹 Empty Graveyard Button**: Purges items older than 30 days or clears entire archive.
