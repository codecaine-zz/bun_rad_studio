# `tokei`: Fast Code & Lines of Code (LOC) Counter API

Fast code counter calculating total files, blank lines, comments, and lines of code (LOC) grouped by language.

---

## 1. CLI Usage

```bash
# Count lines of code in paths
bun run tokei [paths...]

# Common Flags
-s, --sort <col>        Sort table by: files, lines, blank, comment, code (default: "code")
--files                 Show individual file breakdown under each language
-H, --hidden            Count hidden files
-j, --json              Output stats in JSON format
-m, --markdown          Output stats as a Markdown table (ideal for CI/documentation)
-e, --exclude <pat>     Exclude file patterns (comma-separated)
-h, --help              Show help information
```

### Supported Languages
TypeScript, JavaScript, Rust, Python, Go, C/C++, Zig, Kotlin, Swift, Dart, Svelte, Vue, Astro, Nix, Shell, Markdown, JSON, HTML, CSS, YAML, SQL, TOML, GraphQL.

---

## 2. Type Definitions

```typescript
export interface LineStats {
  lines: number;
  blank: number;
  comment: number;
  code: number;
}

export interface FileStat {
  path: string;
  language: string;
  stats: LineStats;
}

export interface LanguageReport {
  language: string;
  files: number;
  stats: LineStats;
  fileDetails: FileStat[];
}

export type TokeiSortField = "files" | "lines" | "blank" | "comment" | "code";

export interface TokeiOptions {
  paths: string[];
  sort: TokeiSortField;
  showFiles: boolean;
  hidden: boolean;
  json?: boolean;
  markdown?: boolean;
  excludes?: string[];
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Compute Codebase Stats Programmatically
```typescript
import { computeCodeStats } from "./tokeiCoordinator.ts";

const reports = await computeCodeStats({
  paths: ["."],
  sort: "code",
  showFiles: false,
  hidden: false,
});

for (const r of reports) {
  console.log(`${r.language}: ${r.files} files | ${r.stats.code} code | ${r.stats.comment} comments | ${r.stats.blank} blank`);
}
```

### Example 2: Render Formatted ASCII Table Output
```typescript
import { runTokeiCoordinator } from "./tokeiCoordinator.ts";

const tableOutput = await runTokeiCoordinator({
  paths: ["src"],
  sort: "files",
  showFiles: false,
  hidden: false,
});

console.log(tableOutput);
```

### Example 3: Inspect Per-File Breakdown for a Language
```typescript
import { computeCodeStats } from "./tokeiCoordinator.ts";

const reports = await computeCodeStats({
  paths: ["src"],
  sort: "code",
  showFiles: true,
  hidden: false,
});

const tsReport = reports.find((r) => r.language === "TypeScript");
if (tsReport) {
  console.log(`TypeScript files breakdown:`);
  for (const file of tsReport.fileDetails) {
    console.log(`- ${file.path}: ${file.stats.code} LOC (${file.stats.lines} total)`);
  }
}
```

### Example 4: In-Memory String Code Counter Doer
```typescript
import { analyzeLines } from "./tokeiDoers.ts";

const codeSnippet = `
// Config options
const timeout = 5000;

/*
 Multi-line
 note
*/
export default timeout;
`;

const stats = analyzeLines(codeSnippet, {
  single: ["//"],
  multi: [["/*", "*/"]],
});

console.log(stats);
// { lines: 11, blank: 3, comment: 5, code: 2 }
```

### Example 5: Modern Language Detection, JSON & Markdown Tables
```typescript
import {
  detectLanguage,
  formatMarkdownTable,
  formatJsonReports,
} from "./tokeiDoers.ts";
import { computeCodeStats } from "./tokeiCoordinator.ts";

// Language detection from file extensions
const zig = detectLanguage("build.zig");
console.log(`Detected: ${zig?.name}`); // "Zig"

const svelte = detectLanguage("App.svelte");
console.log(`Detected: ${svelte?.name}`); // "Svelte"

// Format report as Markdown table or JSON
const reports = await computeCodeStats({ paths: ["src"], sort: "code", showFiles: false, hidden: false });
const mdTable = formatMarkdownTable(reports);
console.log(mdTable);

const jsonReports = formatJsonReports(reports);
console.log(`JSON length: ${jsonReports.length} bytes`);
```

