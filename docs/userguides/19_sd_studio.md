# 🔄 Sd Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Regex Stream Substitution  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:sd]  •  [Terminal CLI: bun run cli:sd]
```

---

## 🌟 Executive Overview
**Sd Studio Pro** is an intuitive, visual find-and-replace desktop workstation built natively for Bun. Designed as a modern, safe, and visual replacement for `sed`, it features real-time regular expression substitution with capture groups (`$1`, `$2`), literal string mode, unified side-by-side diff previews, automatic `.bak` backups, and batch file modifications across projects.

No more deciphering cryptic sed escaping like `sed -i '' 's/old/new/g'`. Sd Studio Pro gives you a visual preview of every change before writing a single byte to disk.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:sd
```

### 2. Launch Terminal CLI Find-and-Replace
```bash
# Replace text across files with preview
bun run cli:sd "oldEndpoint" "newEndpoint" ./src/*.ts --preview

# Apply replacement with automatic backup
bun run cli:sd "http://localhost:3000" "https://api.prod.com" config.json --backup
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Sd Studio Desktop](../../screenshots/apps/sd_studio_desktop.png) | ![Sd Studio Responsive](../../screenshots/apps/sd_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Pattern & Replacement Bar
- **Find Pattern**: Regular expression or literal text to search.
- **Replace With**: New replacement text (supports `$1`, `$2` backreferences).
- **Target Files / Glob**: Target files to modify (e.g. `./src/**/*.ts`).
- **Options**:
  - **Literal Mode (-s)**: Disables regex meta-characters for exact string replacements.
  - **Create Backup (-b)**: Writes original copy to `<file>.bak` before replacing.
  - **Case-Insensitive (-i)**: Matches regardless of capitalization.

### 2. Live Unified Diff Preview Pane
- Shows exact diff hunks with colored line additions (green) and deletions (red).
- Match count indicator and file count summary.

### 3. Execution Action Bar
- **🔍 Preview Changes**: Evaluates replacements in memory without touching files.
- **⚡ Apply Replacements**: Writes modified files to disk safely.

### 4. Productivity Features
- **📄 Browse File… / 📁 Browse Folder…**: Pick the target with native dialogs instead of typing a path.
- **Preset dropdown**: One-click recipes that fill Find, Replace, flags and options — Trim trailing whitespace, Tabs → 4 spaces, Collapse 3+ blank lines, Windows (CRLF) → Unix (LF), Remove console.log lines, http:// → https://, and Rename identifier (whole word). Review with **Preview Diffs** before applying.
- **⇄ Swap Find/Replace**: Reverse a replacement in one click.
- **Replacement escapes (\n \t)**: When ticked, `\n`, `\t` and `\r` in *Replace With* become real newlines/tabs/carriage returns (`$1` captures still work).
- **Only extensions / Exclude**: Limit a run to certain file types (`ts,tsx,md`) and skip paths by glob (`*.min.js`, `vendor`, `test/**`).
- **Safety**: Binary files and files over 5 MB are skipped automatically (the status bar says how many), so they cannot be corrupted by a text replace.
- **↶ Undo Last Replace**: Restores every file changed by the most recent *Replace In Files* to its previous content (kept for the current session, no backup files needed).
- **📋 Copy Diff / 💾 Save Diff As… / 📊 Save Report As…**: Copy or save the unified diff of the last preview/replace, or save a Markdown report listing each file's matches and hunks.
- **Feedback**: A toast summarises each run (matches and files), warns when nothing matched, and shows regex errors immediately.
