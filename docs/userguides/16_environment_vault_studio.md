# 🔑 Environment Vault Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native .env Parser & TypeScript Schema Gen  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:env]  •  [Terminal CLI: bun run cli:env]
```

---

## 🌟 Executive Overview
**Environment Vault Studio** is a secure desktop configuration editor, secret validator, and diff workbench for `.env` files. Designed to prevent production outages caused by missing environment variables, syntax errors, or mismatched `.env.example` keys, it gives developers a visual, audited interface for managing local secrets safely.

It includes secret masking toggles, duplicate key detection, automatic diffing against template files, and one-click generation of typed TypeScript configuration schemas (compatible with Zod and clean interfaces).

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:env
```

### 2. Launch Terminal CLI Environment Validator
```bash
# Validate .env against .env.example
bun run cli:env check .env --template .env.example

# Generate TypeScript types from .env
bun run cli:env types .env
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Environment Vault Desktop](../../screenshots/apps/env_studio_desktop.png) | ![Environment Vault Responsive](../../screenshots/apps/env_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### The four steps
1. **Open or paste** your settings: press **📂 Open .env…** and choose a file, or paste into the *Your settings* box. (The window starts with sample settings; **🧹 Clear** empties the box.)
2. **Check** them with **⚡ Audit & Validate**. *Errors* (a line without `=`, an invalid name, an unclosed quote) and *notes* (an empty value, a secret that still looks like a placeholder, a name that is not UPPER_CASE, a value with spaces that is not in quotes, a name that appears twice) are listed in the log at the bottom, and the three labels at the top count them.
3. **Make an example** with **✨ Generate .env.example**. Every name is kept once and every value is blanked; only plain settings (a name with the word PORT, HOST or NODE_ENV in it, and a simple value) keep theirs, and never a secret. Comments are left out because they can hold secrets.
4. **Copy or save** it: **📋 Copy example** puts it on the clipboard; **💾 Save example…** asks where to save it (suggesting `.env.example`).

### Buttons
| Where | Button | What it does |
|---|---|---|
| Your settings | 📂 Open .env… | Loads a file (up to 1 MB, text only). The file is not changed until you save. |
| | 🔒 Mask Secrets / 👁️ Unmask Secrets | Shows secret values (names with SECRET, PASSWORD, TOKEN, KEY, AUTH ...) as dots, for screen sharing. **Copy and Save always use the real values**, and a line you edit while masked keeps your edit. |
| | 📋 Copy .env | Copies the real text to the clipboard. |
| | 💾 Save .env… | Asks where to save. The file is written so only you can read it. Your computer asks before replacing a file. |
| Example file | 📂 Open example… | Loads an existing `.env.example` to compare with. |
| | ⚖️ Compare with .env.example | Fills the *Comparison report* box: names missing from your settings, names only you have, and names that are empty. The example box is not changed. |

### Good to know
- Nothing is sent anywhere; the file is read and written on your computer only.
- Opening, comparing and generating never change a file. Only the two **Save** buttons write, and only where you choose.
- The command-line version (`bun run cli:env check .env --template .env.example`) does the same checks without a window.
