# 🔤 Regex Studio Pro -- User Guide

**Regex Studio Pro** is an interactive regular expression testing, debugging, and code generation workbench. Built on V8/JSC's native RegExp engine, it provides real-time pattern matching, named and indexed capture group extraction, live substitution previews, and production-ready TypeScript code generation.

---

## ⚡ Quick Start

```bash
bun run app:regex
```

---

## 🖥️ User Interface Overview

1. **Pattern & Flags Configuration**:
   - **Regular Expression**: Enter regex pattern (e.g. `([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})`).
   - **Regex Flags Toggles**:
     - `g` (Global - match all occurrences)
     - `i` (Case Insensitive)
     - `m` (Multiline)
     - `s` (DotAll - allow `.` to match newlines)
     - `u` (Unicode)
   - **Preset Patterns**:
     - Email Address
     - Semantic Version (`v1.2.3`)
     - URL / Web Address
     - IPv4 Address
     - ISO 8601 Date
     - Slug / Identifier
2. **Test String & Live Match Inspector**:
   - **Test String Editor**: Multi-line area for sample text.
   - **Match Count & Telemetry**: Reports total matches and capture groups with match indexes (`index`, `length`).
   - **Capture Groups Table**: Shows each match, its full matched text, and individual capturing groups ($1, $2, etc.).
3. **Regex Substitution Preview**:
   - **Replacement Pattern**: Supports literal text and group placeholders (`$1`, `$2`, `$&`).
   - **Substituted Result**: Displays real-time preview of the string after regex replacement.
4. **Code Generator & Export**:
   - **📋 Generate TypeScript Code**: Generates production-ready TypeScript snippets with error handling and types.
   - **Export Matches to JSON**: Saves matches and capture groups to disk or clipboard.

---

## 📖 Practical Tutorials

### 1. Extracting Email Usernames and Domains
1. Select the **Email Address** preset or enter:
   ```regex
   ([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})
   ```
2. Paste a list of emails into the **Test String**:
   ```text
   support@company.com
   dev-lead_99@subdomain.example.org
   ```
3. Enable flags `g` and `i`.
4. Click **⚡ Evaluate Regex**.
5. The capture group table will separate:
   - Match 1: Full `support@company.com` | Group 1: `support` | Group 2: `company.com`
   - Match 2: Full `dev-lead_99@subdomain.example.org` | Group 1: `dev-lead_99` | Group 2: `subdomain.example.org`

### 2. Performing Pattern Replacements
1. In **Replacement Pattern**, enter:
   ```text
   user: $1 (domain: $2)
   ```
2. The substitution preview immediately renders:
   ```text
   user: support (domain: company.com)
   user: dev-lead_99 (domain: subdomain.example.org)
   ```

### 3. Generating TypeScript Code
1. Click **📋 Generate TypeScript Code**.
2. Regex Studio Pro outputs ready-to-use code:
   ```ts
   const pattern = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
   const matches = Array.from(input.matchAll(pattern)).map(match => ({
     fullMatch: match[0],
     group1: match[1],
     group2: match[2],
     index: match.index,
   }));
   ```

---

## 🛡️ Enterprise Resilience Features
- **ReDoS (Catastrophic Backtracking) Protection**: Evaluates patterns with safety bounds to protect the UI from malicious exponential backtracking patterns.
- **Instant Syntax Validation**: Incomplete or invalid regex patterns display detailed syntax error messages immediately without crashing the application.
