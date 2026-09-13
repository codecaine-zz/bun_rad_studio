# 📈 Tokei Studio Pro -- User Guide

**Tokei Studio Pro** is a fast, multi-language code counter and lines-of-code (LOC) metrics workstation built natively for Bun. Designed as a visual counterpart to `tokei`, it analyzes software repositories across 50+ programming languages, calculating total files, blank lines, comments, code lines, comment-to-code ratios, and per-file breakdowns—with instant export to GitHub-flavored Markdown and JSON.

---

## ⚡ Quick Start

```bash
# Launch Tokei Studio Pro desktop workstation
bun run app:tokei

# Launch CLI mode directly
bun run cli:tokei .
bun run cli:tokei --sort code .
bun run cli:tokei -m .
bun run cli:tokei -j .
```

You can also launch programmatically in TypeScript:
```ts
import { createTokeiStudio } from "./applications/tokei_studio";
const win = createTokeiStudio({ fullscreen: true });
win.run();
```

---

## 🖥️ User Interface Overview

1. **Header Toolbar**:
   - 63 visual themes, Fullscreen toggle, Save Config, and Window Centering.
2. **Codebase Metrics Telemetry**:
   - Detected Languages count, Total Files scanned, Total Lines, Code Lines, and Comments ratio.
3. **Scan Target & Analyzer Settings**:
   - **Scan Directory**: Target folder to inspect recursively (defaults to current project).
   - **Sort Column**: Sort results by Code, Files, Lines, Comments, or Blank lines.
   - **Exclude**: Comma-separated ignore patterns (e.g. `node_modules,dist,.git`).
   - **Hidden Files (-H)**: Count hidden files and directories.
   - **Per-File Breakdown**: Include breakdown for individual files in each language.
4. **Language Breakdown Table**:
   - Data grid showing Language, Files, Total Lines, Code, Comments, Blanks, and Code Percentage.
5. **Export & Preview Console**:
   - Formatted GitHub-flavored Markdown table and structured JSON export viewer.
