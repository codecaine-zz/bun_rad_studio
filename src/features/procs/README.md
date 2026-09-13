# `procs`: Modern Process Table & Tree Viewer API

A modern replacement for `ps` that presents system processes in clean, color-coded tables or hierarchical trees.

---

## 1. CLI Usage

```bash
# View process table
bun run procs [keyword]

# Common Flags
-i, --interactive       Launch interactive TUI process explorer (arrow navigation, kill, refresh)
-u, --user <user>       Filter processes belonging to specific username
-P, --ports             Inspect and display active listening TCP ports per process
-n, --limit <n>         Limit process output to top N rows
-j, --json              Output processes in structured JSON format
-k, --kill <PID>        Send signal to terminate specified PID
--signal <SIG>          Signal to send with --kill (default: SIGTERM)
-t, --tree              Display processes in a hierarchical tree based on PPID
--sort-cpu              Sort processes by CPU usage descending
--sort-mem              Sort processes by memory usage descending
--sort-pid              Sort processes by PID ascending
-w, --watch             Watch mode (refresh display every second)
-h, --help              Show help information
```

### Interactive TUI Controls

When running `bun run procs -i [keyword]` in a terminal:

| Key | Action |
| :--- | :--- |
| `↑` / `k` | Move selection up |
| `↓` / `j` | Move selection down |
| `PageUp` / `PageDown` | Scroll 10 rows up / down |
| `/` / `f` | Start live process filter (matches name, PID, user; `Enter`: save, `Esc`: clear) |
| `c` | Sort processes by CPU usage descending |
| `m` | Sort processes by Memory usage descending |
| `p` | Sort processes by PID ascending |
| `u` | Sort processes by User alphabetically |
| `Space` | Pause / resume live 2-second background auto-refresh |
| `Enter` / `d` | Inspect process details modal (child PIDs, listening ports, full command) |
| `x` / `K` | Terminate selected process (`SIGTERM`) with auto-refresh |
| `9` / `X` | Force kill selected process (`SIGKILL`) |
| `r` | Refresh process table immediately from OS |
| `q` / `Ctrl+C` | Exit interactive mode (or close details modal) |

---

## 2. Type Definitions

```typescript
export type SortField = "cpu" | "mem" | "pid" | "user";

export interface ProcessInfo {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  stat: string;
  time: string;
  command: string;
  ports?: string[];
}

export interface ProcessTreeNode {
  process: ProcessInfo;
  children: ProcessTreeNode[];
}

export interface ProcsOptions {
  keyword?: string;
  user?: string;
  tree: boolean;
  sortBy?: SortField;
  watch: boolean;
  limit?: number;
  json?: boolean;
  ports?: boolean;
  killPid?: number;
  signal?: string;
  interactive?: boolean;
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Query Processes by Keyword and Sort
```typescript
import { getProcesses } from "./procsCoordinator.ts";

// Fetch processes matching "bun" sorted by CPU usage
const procs = await getProcesses("bun", "cpu");

for (const p of procs) {
  console.log(`[PID ${p.pid}] ${p.user}: ${p.cpu}% CPU, ${p.mem}% MEM | ${p.command}`);
}
```

### Example 2: Build & Traverse Hierarchical Process Tree
```typescript
import { getProcesses } from "./procsCoordinator.ts";
import { buildProcessTree, formatTreeLines } from "./procsDoers.ts";

const allProcs = await getProcesses();
const tree = buildProcessTree(allProcs);

// Format tree using Unicode branch characters
const lines = formatTreeLines(tree);
console.log(lines.slice(0, 25).join("\n"));
```

### Example 3: Render Process Table Directly
```typescript
import { runProcsCoordinator } from "./procsCoordinator.ts";

const tableOutput = await runProcsCoordinator({
  keyword: "node",
  tree: false,
  sortBy: "mem",
  watch: false,
});

console.log(tableOutput);
```

### Example 4: Low-Level Process Fetching & Parsing
```typescript
import { fetchRawProcessList, parsePsOutput, sortProcesses } from "./procsDoers.ts";

const rawPs = await fetchRawProcessList();
const processes = parsePsOutput(rawPs);

const topCpu = sortProcesses(processes, "cpu").slice(0, 3);
console.log("Top 3 CPU Consumers:");
for (const p of topCpu) {
  console.log(`- PID ${p.pid} (${p.cpu}%): ${p.command}`);
}
```

### Example 5: Stream Process List as JSON with Limits
```typescript
import { runProcsCoordinator } from "./procsCoordinator.ts";

const jsonOutput = await runProcsCoordinator({
  keyword: "bun",
  limit: 5,
  json: true,
});

const processes = JSON.parse(jsonOutput);
console.log(`Retrieved ${processes.length} bun process(es).`);
```

### Example 6: Terminate a Runaway Process by PID
```typescript
import { runProcsCoordinator } from "./procsCoordinator.ts";

// Safely signal PID 12345 to terminate
const result = await runProcsCoordinator({
  killPid: 12345,
  signal: "SIGTERM",
});
console.log(result);
```

### Example 7: Interactive TUI State, Live Filtering & Action API
```typescript
import { getProcesses } from "./procsCoordinator.ts";
import {
  applyProcsTuiAction,
  handleProcsTuiKey,
  renderProcsTuiFrame,
  type ProcsTuiState,
} from "./procsTui.ts";

const processes = await getProcesses();
let state: ProcsTuiState = {
  allProcesses: processes,
  filteredProcesses: processes,
  selectedIndex: 0,
  scrollOffset: 0,
  sortBy: "cpu",
  filterQuery: "",
  isFiltering: false,
  isPaused: false,
  showingDetails: false,
  shouldExit: false,
};

// Start live filtering for "bun"
state = applyProcsTuiAction(state, { type: "START_FILTER" });
state = applyProcsTuiAction(state, { type: "FILTER_CHAR", char: "b" });
state = applyProcsTuiAction(state, { type: "FILTER_CHAR", char: "u" });
state = applyProcsTuiAction(state, { type: "FILTER_CHAR", char: "n" });

// Switch sort to Memory descending
state = applyProcsTuiAction(state, { type: "SET_SORT", sortBy: "mem" });

// Render the current view frame
const frame = renderProcsTuiFrame(state);
console.log(frame);
```



