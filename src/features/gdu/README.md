# `gdu` / `gdu-go`: Fast Disk Usage Analyzer API

A fast disk usage analyzer and mounted disk explorer written in TypeScript for Bun.

---

## 1. CLI Usage

```bash
# Scan directory
bun run gdu [directory_to_scan]

# Common Flags
-n, --non-interactive        Do not run in interactive mode (print report)
-C, --show-item-count        Show number of items in directory
-B, --show-relative-size     Show relative size visual bar [##########]
-s, --summarize              Show only a total summary
-d, --show-disks             Show all mounted disks and capacities
-t, --top <int>              Show only top X largest files/dirs
-L, --max-depth <n>          Maximum directory recursion depth
-S, --sort <size|name|count> Sort items by size, name, or item count
-j, --json                   Output directory tree in structured JSON format
-m, --min-size <size>        Filter out items smaller than size (e.g. 10M, 1G)
-H, --no-hidden              Ignore hidden directories (beginning with dot)
-i, --ignore-dirs <paths>    Paths to ignore (comma-separated)
    --si                     Show sizes with decimal SI prefixes (kB, MB, GB)
-h, --help                   Show help information
```

### Interactive TUI Controls

When launched in an interactive terminal (default when running `gdu` without `-n`), `gdu` enters interactive TUI mode:

| Key | Action |
| :--- | :--- |
| `↑` / `k` | Move cursor up |
| `↓` / `j` | Move cursor down |
| `PageUp` / `PageDown` | Scroll 10 rows up / down |
| `Enter` / `→` / `l` | Drill into directory (or inspect file details) |
| `←` / `h` / `Backspace` | Drill up into parent directory |
| `d` / `Delete` | **Delete selected file or folder** (prompts `[y/N]` confirmation, frees disk space) |
| `/` / `f` | Start live filter search (`Enter`: save, `Esc`: clear) |
| `s` | Cycle sort mode (Size → Name → Count → Modified Time) |
| `i` | Inspect detailed item card (exact bytes, parent percentage, mtime) |
| `o` | Open file or directory with system default viewer |
| `r` | Rescan current directory |
| `q` / `Ctrl+C` | Exit interactive TUI (or close inspection modal) |

---

## 2. Type Definitions

```typescript
export interface DiskUsageItem {
  name: string;
  path: string;
  size: number;
  itemCount: number;
  isDirectory: boolean;
  mtime: Date;
  children?: DiskUsageItem[];
}

export interface MountedDisk {
  filesystem: string;
  size: number;
  used: number;
  available: number;
  percentUsed: string;
  mountPoint: string;
}

export type GduSortBy = "size" | "name" | "count" | "mtime";

export interface GduOptions {
  targetDir: string;
  nonInteractive: boolean;
  showItemCount: boolean;
  showRelativeSize: boolean;
  showDisks: boolean;
  summarize: boolean;
  noHidden: boolean;
  top?: number;
  si: boolean;
  ignoreDirs: string[];
  maxDepth?: number;
  sortBy?: GduSortBy;
  minSize?: number | string;
  json?: boolean;
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Scan Directory & Inspect Top Largest Subdirectories
```typescript
import { analyzeDirectory } from "./gduCoordinator.ts";
import { formatBytes } from "./gduDoers.ts";

const root = await analyzeDirectory({
  targetDir: ".",
  nonInteractive: true,
  showItemCount: true,
  showRelativeSize: true,
  showDisks: false,
  summarize: false,
  noHidden: true,
  si: false,
  ignoreDirs: [],
});

console.log(`Directory: ${root.name} (${formatBytes(root.size)}, ${root.itemCount} items)`);

// Top 5 largest items:
const top5 = (root.children ?? []).slice(0, 5);
for (const item of top5) {
  console.log(`${formatBytes(item.size)} - ${item.name} (${item.itemCount} items)`);
}
```

### Example 2: Inspect Mounted Disks and Storage Free Space
```typescript
import { fetchMountedDisks, formatBytes } from "./gduDoers.ts";

const disks = await fetchMountedDisks();
for (const disk of disks) {
  console.log(`${disk.mountPoint} (${disk.filesystem}): ${formatBytes(disk.used)} used / ${formatBytes(disk.size)} total (${disk.percentUsed})`);
}
```

### Example 3: Get Formatted Output Lines
```typescript
import { runGduCoordinator } from "./gduCoordinator.ts";

const lines = await runGduCoordinator({
  targetDir: ".",
  nonInteractive: true,
  showItemCount: true,
  showRelativeSize: true,
  showDisks: false,
  summarize: false,
  noHidden: false,
  top: 10,
  si: false,
  ignoreDirs: [],
});

console.log(lines.join("\n"));
```

### Example 4: Pure Formatting Helpers
```typescript
import { formatBytes, formatCount, formatRelativeBar } from "./gduDoers.ts";

console.log(formatBytes(1024 * 1024 * 50));        // "  50.0 MiB"
console.log(formatBytes(1000 * 1000 * 50, true));  // "  50.0 MB"
console.log(formatCount(12500));                   // "     12.5k"
console.log(formatRelativeBar(0.75, 10));          // "[########  ]"
```

### Example 5: Interactive TUI State, File Deletion & Search API
```typescript
import { analyzeDirectory } from "./gduCoordinator.ts";
import {
  applyGduTuiAction,
  handleGduTuiKey,
  renderGduTuiFrame,
  type GduTuiState,
} from "./gduTui.ts";

const root = await analyzeDirectory({
  targetDir: ".",
  nonInteractive: true,
  showItemCount: true,
  showRelativeSize: true,
  showDisks: false,
  summarize: false,
  noHidden: true,
  si: false,
  ignoreDirs: [],
});

let state: GduTuiState = {
  currentDir: root,
  history: [],
  selectedIndex: 0,
  scrollOffset: 0,
  sortBy: "size",
  filterQuery: "",
  isFiltering: false,
  confirmingDelete: false,
  showingDetails: false,
  shouldExit: false,
};

// Start live search for "src"
state = applyGduTuiAction(state, { type: "START_FILTER" });
state = applyGduTuiAction(state, { type: "FILTER_CHAR", char: "s" });
state = applyGduTuiAction(state, { type: "FILTER_CHAR", char: "r" });
state = applyGduTuiAction(state, { type: "FILTER_CHAR", char: "c" });

// Cycle sort mode to name
state = applyGduTuiAction(state, { type: "CYCLE_SORT" });

// Render the current view frame
const frame = renderGduTuiFrame(state);
console.log(frame);
```

### Example 6: Pure Doers: File Operations & Byte Parsing
```typescript
import {
  parseByteSize,
  formatGduJson,
  deleteDiskItem,
  openItemInDefaultApp,
} from "./gduDoers.ts";

// Parse human readable byte sizes
const fiveGigs = parseByteSize("5G"); // 5368709120
const fiftyMb = parseByteSize("50M"); // 52428800

// In-place deletion and default app launcher (Doers)
// deleteDiskItem("/tmp/unwanted-cache");
// openItemInDefaultApp("./README.md");
```
