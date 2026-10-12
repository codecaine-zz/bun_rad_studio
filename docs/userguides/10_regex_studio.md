# 🎯 Regex Studio Pro -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: ECMAScript RegExp (Bun/JavaScriptCore)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:regex]  •  [Terminal CLI: bun run cli:regex]
```

---

## 🌟 Executive Overview
**Regex Studio Pro** is a desktop workbench for writing and debugging regular expressions. It uses the JavaScript (ECMAScript) regex engine built into Bun, so results match what your TypeScript or JavaScript code will do. Everything runs locally and nothing is uploaded.

You get live match results as you type, a highlighted view of matches in context, a capture-group table with line and column positions, substitution preview, a plain-English pattern explainer, a library of ready-made patterns and code snippets for six languages.

> Other languages use different regex dialects. Snippets for Python, Go, Java and PHP are translated where it is safe to do so, and Go snippets warn when your pattern uses features Go does not support.

---

## 🚀 Quick Start & Launch

```bash
# Desktop GUI
bun run app:regex

# Terminal evaluator
bun run cli:regex -p "\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b" -t "test@example.com"
```

1. Type a pattern, or pick one from **Preset Library**.
2. Paste or **load** your text into the corpus box. Matches update as you type.
3. Read the **Highlighted view** and the **matches table**.

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop | Responsive Viewport |
| :---: | :---: |
| ![Regex Studio Desktop](../../screenshots/apps/regex_studio_desktop.png) | ![Regex Studio Responsive](../../screenshots/apps/regex_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Pattern & Flags
- **Regex Pattern**: the expression, without surrounding slashes.
- **Flags**: Global (`g`), Case Insensitive (`i`), Multiline (`m`), DotAll (`s`) and Unicode (`u`).
- **Live results while typing**: re-evaluates on every edit. It pauses automatically for large text (over 100,000 characters) or patterns that look prone to catastrophic backtracking (nested quantifiers such as `(a+)+`). Click **⚡ Test Pattern** to run anyway.
- **🧠 Explain**: prints a token-by-token explanation of the pattern in the console.
- **📖 Cheat Sheet**: prints a quick syntax reference in the console.
- **Preset Library**: 14 patterns (email, IPv4, SemVer, UUID, URLs, ISO dates, hex colors, US phone numbers, HTML tags, duplicate words, MAC addresses, hashtags, quoted strings, surrounding whitespace). Picking one fills the pattern and tests it.
- The status bar shows pattern errors immediately, and the number of capture groups when the pattern is valid.

### 2. Test Corpus
- **Corpus box**: your sample text. **📂 Load Text File…** reads a file up to 5 MB.
- **Highlighted view**: your text with every match wrapped in ` « » ` so you can see matches in context.

### 3. Matches & Capture Groups
- The table lists match number, matched text, index, length, capture groups (numbered and named) and **Line:Col**. Results are capped at 1,000 matches.
- **Copy group #**: 0 copies every full match, one per line. A number copies that capture group from every match.
- **💾 Export Matches…** saves JSON, or CSV if you choose a `.csv` filename.
- **Preview Replace** applies the **Substitution** to the corpus. Use `$1`, `$<name>`, `$&` and `$$`. The result appears in the console. **Copy Replaced Text** and **Save Replaced Text…** keep it. Replace honours the Global flag, so without it only the first match changes.

### 4. Code Generator
- Choose TypeScript, JavaScript, Python, Go, Java or PHP and click **💻 Code Snippet**. The snippet is shown in the console and copied to your clipboard. Snippets always use global matching.

### 5. Workspaces
- **💾 Save Workspace** remembers the form for the next launch.
- **📄 Save Workspace File… / 📂 Open Workspace File…** store pattern, substitution, flags and corpus in a `.regex.json` file you can share.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Parsing Key-Value Configuration
1. Run `bun run app:regex`.
2. Enter the pattern `^([A-Z_]+)=["']?([^"'\r\n]+)["']?$` and turn on **Global** and **Multiline**.
3. Paste this into the corpus:
   ```text
   DATABASE_PORT=5432
   NODE_ENV="production"
   API_KEY='secret_token_123'
   ```
4. The table shows three matches with `G1` as the name and `G2` as the value.
5. Type `2` in **Copy group #** and click **Copy Matches** to copy just the values.
6. Choose **Python** and click **Code Snippet** to get ready-to-paste code.

### Tutorial: Understand an Unfamiliar Pattern
1. Paste the pattern into **Regex Pattern**.
2. Click **🧠 Explain** and read the indented breakdown in the console. Groups are indented so you can see the structure.

### Tutorial: Clean Up a File
1. **Load Text File…** and enter a pattern such as `^\s+|\s+$` (use the Multiline flag).
2. Leave **Substitution** empty and click **Preview Replace**, then **Save Replaced Text…**.

---

## 🔒 Safety Notes
- Evaluation runs in a background worker with a time limit (2 seconds for live results, 4 seconds for Test Pattern). If a pattern takes too long it is stopped and you get an error instead of a frozen window. The JavaScript engine also gives up on some runaway patterns by itself after about half a second, so a "no matches" result for a very complex pattern on long text may not be reliable.
- Your pattern and corpus are saved with the form state when you use **💾 Save Workspace**, so avoid putting secrets in the corpus.

---

## 💡 Pro Tips
- Turn off **Live results** when working with big files, then use **Test Pattern** when you are ready.
- Prefer lazy quantifiers (`.*?`) when matching between delimiters.
- A match with length 0 (for example `x*`) is normal: it means the pattern can match nothing at that position.
