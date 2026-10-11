# 🌿 Git Workbench Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native Git Subsystem & Diff Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:git]  •  [Terminal CLI: bun run cli:git]
```

---

## 🌟 Executive Overview
**Git Workbench Pro** is an enterprise-grade visual Git repository manager and diff inspector built natively for Bun RAD Studio. It provides a visual workspace for tracking working tree changes, viewing colorized side-by-side diffs, reviewing commit log histories, staging files, and crafting clean, conventional commit messages.

It provides lightning-fast Git operations with zero heavy web wrappers or cloud bloat, keeping your repository state strictly local and offline.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch (in active repo directory)
bun run app:git
```

### 2. Launch Terminal CLI Git Assistant
```bash
# Quick status and visual diff summary
bun run cli:git status

# Commit history tree in terminal
bun run cli:git log -n 10
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Git Workbench Desktop](../../screenshots/apps/git_studio_desktop.png) | ![Git Workbench Responsive](../../screenshots/apps/git_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Repository Header & Branch Navigator
- **Active Branch Badge**: Displays current git branch with status indicator (clean vs dirty).
- **Branch Switcher**: Dropdown list of local branches with one-click checkout.
- **Fetch / Pull / Push Actions**: Safe status synchronization buttons.

### 2. Working Tree & Staging Area
- **Modified Files Table**: Displays status badges: `M` (Modified), `A` (Added), `D` (Deleted), `U` (Untracked).
- **Stage / Unstage Checkboxes**: Click any file to toggle staged status.
- **Discard Changes**: Safe rollback button for unstaged edits.

### 3. Visual Diff Viewer
- **Unified & Split Diff Modes**: High-contrast syntax highlighting showing additions (green) and deletions (red).
- **Line Numbers & Hunk Headers**: Precise diff hunk navigation.

### 4. Commit Composer & Conventional Commits Helper
- **Commit Type Selector**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.
- **Commit Message Input**: Formatted message composer with 50/72 rule character counter.
- **Commit Button (Cmd+Enter)**: Creates commit with clean GPG/sign-off support.
