# `sd`: Search & Displace (Find and Replace API)

An intuitive find & replace utility and modern `sed` alternative built natively in TypeScript for Bun.

---

## 1. CLI Usage

```bash
# In-place file replacement
bun run sd <find> <replace> [files...]

# Stdin replacement
echo "hello world" | bun run sd "world" "bun" -

# Common Flags
-s, --string-mode       Treat find pattern as literal string (disables regex)
-f, --flags <flags>     Regex flags (default: "g")
-p, --preview           Preview replacements as unified diff without writing to disk
-w, --word              Match whole words only (\b pattern \b)
-b, --backup <ext>      Create backup file with given extension (e.g. .bak) before writing
-q, --quiet             Suppress diff preview output
-i, --ignore-case       Case-insensitive matching
-c, --count             Only count matches without modifying files
-h, --help              Show help information
```

---

## 2. Type Definitions

```typescript
export interface SdOptions {
  findPattern: string;
  replacePattern: string;
  files: string[];
  stringMode: boolean;
  flags: string;
  preview: boolean;
  wordMode?: boolean;
  backup?: string;
  quiet?: boolean;
  ignoreCase?: boolean;
  countOnly?: boolean;
}

export interface DiffHunk {
  lineNumber: number;
  original: string;
  modified: string;
}

export interface FileTransformResult {
  filePath: string;
  hasChanged: boolean;
  originalContent: string;
  newContent: string;
  diffHunks: DiffHunk[];
}
```

---

## 3. Comprehensive Code Examples

### Example 1: In-Place File Replacement with Capture Groups
```typescript
import { runSdCoordinator } from "./sdCoordinator.ts";

const summaries = await runSdCoordinator({
  findPattern: "version: (\\d+)\\.(\\d+)\\.(\\d+)",
  replacePattern: "version: 2.0.0",
  files: ["package.json"],
  stringMode: false,
  flags: "g",
  preview: false,
});

console.log(summaries); // ["Updated package.json (1 changes)"]
```

### Example 2: Dry-Run Diff Preview Without Writing to Disk
```typescript
import { runSdCoordinator } from "./sdCoordinator.ts";

const diffOutputs = await runSdCoordinator({
  findPattern: "foo",
  replacePattern: "bar",
  files: ["index.ts"],
  stringMode: true,
  flags: "g",
  preview: true,
});

for (const diff of diffOutputs) {
  console.log(diff);
}
```

### Example 3: Transform Single File & Inspect Line Diff Hunks
```typescript
import { processFile } from "./sdCoordinator.ts";
import { buildReplacerRegex } from "./sdDoers.ts";

const regex = buildReplacerRegex("http://localhost:(\\d+)", false, "g");
const result = await processFile("config.json", regex, "https://api.domain.com");

if (result.hasChanged) {
  console.log(`File: ${result.filePath}`);
  console.log(`Total changed lines: ${result.diffHunks.length}`);
  for (const hunk of result.diffHunks) {
    console.log(`  Line ${hunk.lineNumber}:`);
    console.log(`    - ${hunk.original}`);
    console.log(`    + ${hunk.modified}`);
  }
}
```

### Example 4: Literal String Replacement (Auto-Escape)
```typescript
import { buildReplacerRegex, replaceText } from "./sdDoers.ts";

// Safely escapes dots, brackets, and stars
const rawPattern = "api.url[0]*test";
const regex = buildReplacerRegex(rawPattern, true, "g");
const replaced = replaceText("Connecting to api.url[0]*test now", regex, "new_endpoint");
console.log(replaced); // "Connecting to new_endpoint now"
```

### Example 5: In-Memory Text Diff Generation
```typescript
import { computeDiffHunks, formatDiffPreview } from "./sdDoers.ts";

const oldText = "line 1\nline 2\nline 3";
const newText = "line 1\nchanged line 2\nline 3";

const hunks = computeDiffHunks(oldText, newText);
console.log(hunks);
// [{ lineNumber: 2, original: "line 2", modified: "changed line 2" }]

const preview = formatDiffPreview("test.txt", hunks);
console.log(preview);
```

### Example 6: File Backup, Match Counting & Target Directory Expansion
```typescript
import { createBackup, countMatches, expandTargets, buildReplacerRegex } from "./sdDoers.ts";

// Create backup file before modifying (e.g. file.txt.bak)
// const backupPath = await createBackup("config.json", ".bak");

// Count matches across file content without replacing
const regex = buildReplacerRegex("export", false, "g");
const matchCount = countMatches("export const a = 1; export const b = 2;", regex);
console.log(`Total exports found: ${matchCount}`); // 2

// Recursively expand directory paths, skipping node_modules and .git
const filePaths = await expandTargets(["src"]);
console.log(`Discovered ${filePaths.length} file(s) for replacement`);
```

