# 🛠️ DevTools Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: 6-in-1 Native Bun Subsystems  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:devtools]  •  [Terminal CLI: bun run cli:devtools]
```

---

## 🌟 Executive Overview
**DevTools Studio Pro** is a unified 6-in-1 developer workstation combining the most essential day-to-day command-line developer utilities into a single high-speed desktop interface. Powered by pure Bun and Node subsystem primitives, it replaces 6 separate CLI packages (`ripgrep`, `fd`, `sd`, `watchexec`, `rm-improved/rip`, and `jq`) with **zero external binary requirements**.

Instead of switching between disjointed terminal tabs and memorizing conflicting flags, DevTools Studio Pro gives developers a cohesive GUI cockpit for searching, replacing, watching, querying, and managing project files.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:devtools

# Shorthand alias
bun run app:omnitool
```

### 2. Launch Terminal CLI Multi-Tool
```bash
# Search using ripgrep mode
bun run cli:devtools search "TODO" ./src

# Find files using fd mode
bun run cli:devtools find "*.test.ts"
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![DevTools Studio Desktop](../../screenshots/apps/devtools_studio_desktop.png) | ![DevTools Studio Responsive](../../screenshots/apps/devtools_studio_responsive.png) |

---

## 🧭 The 6 Integrated Developer Engines

| Mode | Engine Name | Replaces Tool | What it does |
| :-: | :--- | :--- | :--- |
| **1** | **Ripgrep (rg)** | `rg` | Recursive regex search with line numbers, optional context lines and a files-only summary. |
| **2** | **Fd** | `fd` | Find files and folders by regex or literal text, filtered to files only or folders only. |
| **3** | **Sd** | `sd` | Regex find-and-replace with a dry-run preview of the changed lines. |
| **4** | **Watchexec** | `watchexec` | Points you to Watcher Studio for continuous file watching. |
| **5** | **Rip** | `rip` | Moves a file or folder to the macOS Trash, with **Undo Last Trash**. |
| **6** | **JQ** | `jq` | JSON queries against a file or inline JSON. |

Choose the engine from the dropdown at the top, set a **Target Path** and **Pattern**, then click **Execute Tool Command**.

---

## 🧰 Search Controls

- **Folder... / File...**: pick the target with a native dialog instead of typing a path.
- **Case Sensitive**, **Whole Word**, **Literal (not regex)**: apply to rg, fd and sd. Literal mode lets you search for text such as `foo(` without escaping it. Sd also treats `$` in the replacement literally in this mode.
- **Include / !Exclude globs**: for example `*.ts *.{js,jsx} !*.test.ts`. Separate patterns with spaces, `;` or `|`. A pattern with no `/` matches the file name; one with a `/` matches the path relative to the target.
- **Include Hidden**: also search dotfiles and dot-folders (off by default).
- **Respect .gitignore**: skips what the target folder's own `.gitignore` ignores (on by default). Negated (`!`) rules are not supported. `node_modules`, `.git` and `dist` are always skipped.
- **Max results**: caps output (1-100000, default 200).
- **Context lines (rg)**: shows N lines around each match (0-20).
- **Files With Matches Only (rg)**: lists each matching file with its match count.
- Binary files and files over 1.5 MB (1 MB for sd) are skipped.

## 🔁 Safe Replace (Sd)

- **Dry Run (sd)** is on by default and shows up to 3 before/after lines per file without touching anything.
- Untick it to apply. You are asked to confirm first.
- **Backup .bak (sd)** writes `<file>.bak` with the original content before each change.
- Regex mode supports capture groups such as `$1`.

## 📋 Results

- **Copy Results** copies the output; **Save Results...** writes it to a file.
- **Undo Last Trash** restores the most recent item moved by Rip. It refuses to overwrite a path that already exists again.
- A target path that does not exist shows an error instead of running.

---

## 🛠️ Step-by-Step Tutorial: Find and Rename an API Name Safely
1. Launch with `bun run app:devtools`.
2. Click **Folder...** and choose your project.
3. In **Ripgrep** mode, enter `oldApiEndpoint`, tick **Whole Word** and **Literal**, set the include globs to `*.ts`, and run it to review every hit.
4. Switch to **Sd**, enter `newSecureApiEndpoint` as the replacement, and run it with **Dry Run** still ticked.
5. Check the previewed lines. Untick **Dry Run**, tick **Backup .bak** if you want one, and run again to confirm.

---

## 💡 Pro Tips & Best Practices
- Run a Ripgrep search with the same options before every Sd replace, so you know the scope.
- Without the **Case Sensitive** box ticked, Sd also replaces differently-cased matches (for example `Foo` when you search `foo`).
- Values typed into the app are kept in the saved form state, so avoid putting secrets in the pattern or replacement.
