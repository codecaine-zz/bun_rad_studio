# `fd`: Fast File & Directory Search API

A fast, intuitive, and user-friendly alternative to `find` built natively in TypeScript for Bun.

---

## 1. CLI Usage

```bash
# Basic search
bun run fd <pattern> [path]

# Common Flags
-t, --type <f|d|l|x>    Filter by entry type (file, directory, symlink, executable)
-e, --extension <ext>   Filter by file extension
-d, --max-depth <n>     Limit directory traversal depth
    --min-depth <n>     Skip directory levels shallower than n
    --changed-within <t> Filter by modification time (e.g. 10m, 2h, 7d, 1w)
    --empty             Filter for empty files (0 bytes)
-S, --size <size>       Filter by size (e.g. +5M, -100k, 1G)
-E, --exclude <pat>     Exclude matching path patterns
-H, --hidden            Include hidden files and directories
-a, --absolute          Print absolute file paths
-s, --case-sensitive    Case-sensitive search
-i, --ignore-case       Case-insensitive search (default is smart-case)
-x, --exec <cmd>        Execute command for each result ({} is replaced by path)
-h, --help              Show help information
```

---

## 2. Type Definitions

```typescript
export type EntryTypeFilter = "f" | "d" | "l" | "x";

export interface FdOptions {
  pattern?: string;
  rootPath: string;
  typeFilter?: EntryTypeFilter;
  extension?: string;
  hidden: boolean;
  maxDepth?: number;
  minDepth?: number;
  changedWithin?: string;
  empty?: boolean;
  sizeFilter?: string;
  exclude?: string[];
  absolute: boolean;
  caseSensitive?: boolean;
  execCmd?: string[];
}

export interface FdEntry {
  path: string;           // Full absolute path
  displayPath: string;    // Relative path for display
  name: string;           // Filename or dirname
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  isExecutable: boolean;
  depth: number;          // Traversal depth from root
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Search Files by Regex with Extension Filter
```typescript
import { searchFiles } from "./fdCoordinator.ts";

const results = await searchFiles({
  pattern: "^[a-z_]+\\.test",
  rootPath: "src",
  extension: "ts",
  hidden: false,
  absolute: false,
});

for (const entry of results) {
  console.log(`${entry.displayPath} (Depth: ${entry.depth})`);
}
```

### Example 2: Find Executable Files Only
```typescript
import { searchFiles } from "./fdCoordinator.ts";

const executables = await searchFiles({
  rootPath: ".",
  typeFilter: "x",
  hidden: false,
  absolute: true,
});

console.log(`Found ${executables.length} executable(s):`);
for (const exe of executables) {
  console.log(exe.path);
}
```

### Example 3: Limit Search Depth & Include Hidden Files
```typescript
import { searchFiles } from "./fdCoordinator.ts";

const topLevelHidden = await searchFiles({
  pattern: ".*",
  rootPath: ".",
  maxDepth: 1,
  hidden: true,
  absolute: false,
});

for (const entry of topLevelHidden) {
  if (entry.name.startsWith(".")) {
    console.log(`Hidden entry: ${entry.name}`);
  }
}
```

### Example 4: Execute Commands on Matched Results (Programmatic `-x`)
```typescript
import { runFdCoordinator } from "./fdCoordinator.ts";

// Runs "ls -lh <matched-path>" on all package.json files
await runFdCoordinator({
  pattern: "package.json",
  rootPath: ".",
  hidden: false,
  absolute: true,
  execCmd: ["ls", "-lh", "{}"],
});
```

### Example 5: Low-Level Doer Composition
```typescript
import {
  buildMatcher,
  collectAllEntries,
  matchesExtension,
  matchesType,
} from "./fdDoers.ts";

const matcher = buildMatcher("config");
const entries = await collectAllEntries(".", 1, ".", 2, false);

const configFiles = entries.filter(
  (e) => matcher(e.name, e.displayPath) && matchesType(e, "f")
);

console.log(configFiles.map((e) => e.displayPath));
```

### Example 6: Modern Filter Doers (Size, Duration, Exclusions, Empty, MinDepth)
```typescript
import {
  matchesSize,
  parseSizeFilter,
  matchesExclude,
  parseDurationMs,
  matchesChangedWithin,
  matchesEmpty,
  matchesMinDepth,
} from "./fdDoers.ts";

// Size filter checking (+5M: > 5MB, -100k: < 100KB)
const sizeParsed = parseSizeFilter("+5M");
const isLarge = matchesSize(10 * 1024 * 1024, "+5M"); // true

// Pattern exclusion checking
const isIgnored = matchesExclude("node_modules/bun/index.d.ts", ["node_modules"]); // true

// Duration parsing and modification time checks
const oneDayMs = parseDurationMs("24h"); // 86400000 ms
const isRecentlyModified = matchesChangedWithin(new Date(), "10m"); // true

// Min-depth and empty file checks
const satisfiesMinDepth = matchesMinDepth(3, 2); // true
const satisfiesEmpty = matchesEmpty({
  name: "empty.txt",
  path: "/path/empty.txt",
  displayPath: "empty.txt",
  isDirectory: false,
  isFile: true,
  isSymlink: false,
  isExecutable: false,
  depth: 1,
  size: 0,
}, true); // true
```

