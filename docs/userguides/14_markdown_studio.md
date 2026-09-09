# 📝 Markdown Studio Pro -- User Guide

**Markdown Studio Pro** is a split-pane technical documentation and release-notes authoring workstation. Built with native Bun file streaming and instant DOM synchronization, it provides a distraction-free Markdown editor, real-time formatted preview, document statistics, and standalone styled HTML report export.

---

## ⚡ Quick Start

```bash
bun run app:markdown
```

---

## 🖥️ User Interface Overview

1. **Document Toolbar & Markdown Helpers**:
   - Quick snippet injection buttons:
     - **# H1 / ## H2 / ### H3**: Headings
     - **Bold / Italic**: Text formatting
     - **`Code` / ``` Block**: Inline code and syntax-highlighted blocks
     - **Table**: Inserts an aligned 3x3 GitHub-flavored Markdown table
     - **Alert**: Inserts GitHub-style note/warning/important callouts
     - **Link / Image**: Markdown hyperlinking helpers
2. **Dual-Pane Live Authoring Canvas**:
   - **Left Pane (Markdown Editor)**: High-speed text editor with auto-indent, line numbers, and syntax ergonomics.
   - **Right Pane (Live Preview)**: Formatted, typography-styled HTML preview updated in real time as you type.
3. **Document Telemetry & Reading Metrics**:
   - **Word Count**: Real-time total word count.
   - **Character Count**: Exact character count including whitespace.
   - **Estimated Reading Time**: Calculated at standard 200 words-per-minute technical reading pace (e.g. `3 min read`).
4. **Export & Storage Actions**:
   - **💾 Save Markdown File**: Saves `.md` file to disk.
   - **🌐 Export Standalone HTML**: Compiles the document into a self-contained, beautifully styled HTML document with embedded CSS.
   - **📋 Copy Raw HTML**: Copies the converted HTML markup to clipboard.

---

## 📖 Practical Tutorials

### 1. Authoring API Documentation with Tables and Code Blocks
1. Launch Markdown Studio Pro:
   ```bash
   bun run app:markdown
   ```
2. Click **Table** on the toolbar. A template table is injected:
   ```markdown
   | Parameter | Type | Description | Required |
   | :--- | :--- | :--- | :--- |
   | `id` | `string` | Unique identifier | Yes |
   | `limit` | `number` | Maximum items to return | No |
   ```
3. Click **``` Block** to add a TypeScript request example:
   ```markdown
   ```typescript
   const response = await fetch("/api/v1/users?limit=10");
   const data = await response.json();
   ```
   ```
4. The right-hand preview instantly reflects your tables and code formatting.

### 2. Exporting a Styled Standalone HTML Report for Stakeholders
1. Author or paste your Markdown document.
2. Click **🌐 Export Standalone HTML**.
3. Choose your destination file (e.g. `./reports/architecture_review.html`).
4. The generated HTML file is fully self-contained with modern Inter typography, responsive tables, and dark/light mode compatibility. It can be opened in any browser or emailed to stakeholders without external dependencies.

---

## 🛡️ Enterprise Resilience Features
- **Local-Only Rendering**: Zero telemetry or document text is sent to third-party CDNs.
- **XSS Sanitization**: Script tags and unescaped dangerous HTML entities are safely stripped from the live preview.
- **Automatic Session Backup**: Unsaved edits are periodically persisted to application state storage to prevent accidental data loss.
