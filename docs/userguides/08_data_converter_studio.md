# 🔄 Data Converter Studio -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Pure TypeScript Data Transformers  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:convert]  •  [Terminal CLI: bun run cli:convert]
```

---

## 🌟 Executive Overview
**Data Converter Studio** is a multi-format data interchange workstation designed to seamlessly convert structured datasets across **CSV, TSV, JSON, YAML, Base64, and Markdown Tables**. Engineered with pure TypeScript data transformers, it eliminates external online conversion sites that compromise data privacy.

Whether converting spreadsheet exports into typed JSON, transforming API payloads into Markdown documentation tables, or encoding assets to Base64, Data Converter Studio provides instant, real-time bidirectional conversion.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
```bash
# Standard desktop launch
bun run app:convert

# Shorthand alias
bun run app:dataconvert
```

### 2. Launch Terminal CLI Converter Mode
```bash
# Convert CSV file to JSON in terminal
bun run cli:convert input.csv --to json

# Convert JSON to Markdown table
bun run cli:convert users.json --to markdown
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Data Converter Desktop](../../screenshots/apps/dataconvert_studio_desktop.png) | ![Data Converter Responsive](../../screenshots/apps/dataconvert_studio_responsive.png) |

---

## 🧭 Supported Data Formats & Matrix

| Input Format | Output Formats Supported | Key Feature |
| :--- | :--- | :--- |
| **JSON** | CSV, TSV, YAML, Markdown Table, Base64 | Auto-detects array of objects vs nested trees. |
| **CSV** | JSON, TSV, YAML, Markdown Table | RFC 4180 compliant with escaped commas & quotes. |
| **TSV** | JSON, CSV, YAML, Markdown Table | Tab-delimited parsing ideal for spreadsheet copy-paste. |
| **YAML** | JSON, CSV, Markdown Table | Clean YAML 1.2 parsing and indentation formatting. |
| **Markdown** | JSON, CSV, TSV | Parses GitHub Flavored Markdown (GFM) pipe tables. |
| **Base64** | UTF-8 Text, Hex, Binary | Safe encoding/decoding with URL-safe variants. |

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Converting CSV to a Markdown Documentation Table
1. Launch Data Converter Studio: `bun run app:convert`.
2. Select **Source Format**: `CSV`.
3. Select **Target Format**: `Markdown Table`.
4. Paste your CSV data into the left pane:
   ```csv
   id,feature,status,priority
   1,OAuth 2.0,Completed,High
   2,Dark Mode,In Progress,Medium
   3,Stripe Billing,Pending,Critical
   ```
5. The right pane instantly renders a formatted GitHub-compatible Markdown table:
   ```markdown
   | id | feature | status | priority |
   | -- | ------- | ------ | -------- |
   | 1 | OAuth 2.0 | Completed | High |
   | 2 | Dark Mode | In Progress | Medium |
   | 3 | Stripe Billing | Pending | Critical |
   ```
6. Click **📋 Copy Output** to paste directly into your README or pull request description.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + Enter** / **Ctrl + Enter** | Input Pane | Force immediate conversion |
| **Cmd + Shift + C** | Output Pane | Copy converted data to clipboard |
| **Cmd + Shift + X** | Global | Swap Source and Target formats |
| **F11** or **F** | Global | Toggle borderless fullscreen |

---

## 💡 Pro Tips & Enterprise Best Practices
- **Never Upload Sensitive Data to Web Converters**: Commercial web converters frequently log user data. Data Converter Studio runs 100% offline in local memory—ideal for converting proprietary databases, PII, financial spreadsheets, and credentials safely.
