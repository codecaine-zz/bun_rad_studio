# `watchexec`: File Watcher & Task Orchestrator API

Executes commands in response to file system modifications with debouncing, ignore patterns, and graceful process restart management.

---

## 1. CLI Usage

```bash
# Watch files and execute a command
bun run watchexec [options] [--] <command...>

# Common Flags
-w, --watch <path>      Path(s) to watch (comma-separated, default: ".")
-e, --exts <exts>       Comma-separated list of file extensions to watch (e.g. "ts,js,json")
-f, --filter <pat>      Pattern to filter filenames by (regex or glob)
-i, --ignore <pat>      Comma-separated list of path patterns to ignore
-d, --debounce <ms>     Debounce delay before triggering command (default: 100ms)
-c, --clear             Clear terminal screen before running command
-r, --restart           Restart command if already running (default: true)
-s, --shell <sh>        Execute command inside shell (e.g. bash, sh, zsh)
--no-restart            Do not restart command if already running
--postpone              Wait for first change event before running command
-h, --help              Show help information
```

### Injected Environment Variables
When a file change triggers command execution, `watchexec` automatically exposes the event context:
- `WATCHEXEC_WRITTEN_PATH`: Absolute/relative path of the file that triggered the change.
- `WATCHEXEC_TRIGGERED_PATH`: Mirror of the written path.
- `WATCHEXEC_COMMON_PATH`: The root directory being watched.

---

## 2. Type Definitions

```typescript
export interface WatchexecOptions {
  watchPaths: string[];
  command: string[];
  extensions?: string[];
  filterPatterns?: string[];
  ignorePatterns: string[];
  debounceMs: number;
  clear: boolean;
  restart: boolean;
  runOnStart: boolean;
  shell?: string;
}

export interface WatcherEvent {
  eventType: string;
  filename: string;
}

export interface ProcessState {
  currentProcess: Subprocess | null;
}
```

---

## 3. Comprehensive Code Examples

### Example 1: Watch Directory and Trigger Tests with Auto-Restart
```typescript
import { runWatchexecCoordinator } from "./watchexecCoordinator.ts";

const watcher = await runWatchexecCoordinator({
  watchPaths: ["src"],
  command: ["bun", "test"],
  extensions: ["ts", "json"],
  ignorePatterns: ["node_modules", ".git", "dist"],
  debounceMs: 150,
  clear: true,
  restart: true,
  runOnStart: true,
});

// To gracefully close the watcher:
// watcher.close();
```

### Example 2: Start Watcher with Custom Callback (No Subprocess)
```typescript
import { startWatcher } from "./watchexecCoordinator.ts";
import type { ProcessState, WatchexecOptions } from "./watchexecTypes.ts";

const state: ProcessState = { currentProcess: null };
const options: WatchexecOptions = {
  watchPaths: ["."],
  command: [],
  extensions: ["ts"],
  ignorePatterns: ["node_modules", ".git"],
  debounceMs: 100,
  clear: false,
  restart: false,
  runOnStart: false,
};

const watcher = startWatcher(options, state, () => {
  console.log("File change detected at:", new Date().toISOString());
});

// Process signal cleanup
process.on("SIGINT", () => {
  watcher.close();
  process.exit(0);
});
```

### Example 3: Filter Logic & Process Management Doers
```typescript
import {
  matchesExtension,
  shouldIgnore,
  shouldTrigger,
  spawnCommand,
  killRunningProcess,
} from "./watchexecDoers.ts";

// Pure filters
const triggers = shouldTrigger("src/models/user.ts", ["ts"], ["node_modules"]);
console.log(`Will trigger: ${triggers}`); // true

// Spawning and graceful killing
const proc = spawnCommand(["sleep", "10"]);
console.log(`Spawned child process with PID: ${proc.pid}`);
killRunningProcess(proc);
console.log("Terminated child process.");
```

### Example 4: Filter Matching, Environment Variables & Shell Execution Helpers
```typescript
import {
  matchesFilter,
  buildWatchexecEnv,
  formatShellCommand,
} from "./watchexecDoers.ts";

// Match file path against glob/regex patterns
const matches = matchesFilter("src/router/auth.ts", ["*auth*"]); // true

// Construct environment variables injected into executed subprocesses
const env = buildWatchexecEnv("src/index.ts", ".");
console.log(`Triggered path: ${env.WATCHEXEC_WRITTEN_PATH}`); // "src/index.ts"

// Format command arguments for execution in a shell (bash, sh, zsh)
const shellArgs = formatShellCommand(["echo", "Hello World"], "bash");
console.log(shellArgs); // ["bash", "-c", "echo Hello World"]
```

