# Codecaine File Manager v1.5.1 — Security, Performance & Master Enhancements Demo (2:08)

## Video Output
- **MP4 Video:** `youtube_production/file_manager_v151_changes_demo_tutorial.mp4` (1920×1080 1080p widescreen, 30 fps, narrated with synchronized captions)
- **Workstation Hardware Mark:** `🍎 Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz`

## Highlights Covered in This Demo
1. **On-Demand Folder Sizes & Power Quick-Filter Predicates**:
   - Batched 64-entry async `fsp.lstat` folder sizing, `WeakMap` memoized `visibleEntries(pane)`, single-pass `KIND_CHIP_DEFS` counting, and power filter predicates (`is:dir`, `ext:md,json`, `-exclude`).
2. **Smart Selection & Atomic File Operations**:
   - Select Items by Pattern (glob/regex), Select Same Extension/Kind, marquee selection diff guard, New Folder with Selection + atomic Undo (`⌘Z`), and Paste Clipboard Text as File.
3. **Tabs, Dual-Pane Parity & Command Palette**:
   - Folder tabs with Reopen Closed Tab (`⇧⌘T`), middle-click breadcrumb navigation, and 1-click Swap Dual Panes.
4. **Full-Stack Security & Performance Hardening**:
   - `Sec-Fetch-Site: cross-site` & Origin guards, strict `/app/<id>/` alternate-loopback origin isolation, `deepestRealPath` symlink ancestor protection, prototype-pollution guards in `unflatten` / `parseTomlLite` / `normalizeDb`, `try/finally` cryptographic key zeroization, streaming 64 KB SHA-256 hashing, and parallel `ps`/`lsof` Task Manager inspection.

## Chapters
```text
0:00 Codecaine File Manager v1.5.1 — Master Features, Security & Performance Demo
0:15 On-Demand Recursive Folder Sizes, Power Filter Predicates & Single-Pass Kind Chips
0:46 Select by Pattern, New Folder with Selection + Atomic Undo & Paste Text as File
1:19 Reopen Closed Tab, Swap Dual Panes & Full-Stack Security Hardening
1:56 Download Codecaine File Manager v1.5.1 for macOS, Windows & Linux
```

## Download
- **GitHub Release v1.5.1:** https://github.com/codecaine-zz/bun_rad_studio/releases/tag/v1.5.1
