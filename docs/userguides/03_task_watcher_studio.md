# ⏱️ Task Watcher Studio -- User Guide

**Task Watcher Studio** is a native file-system change watcher, test runner, and task execution pipeline. Built entirely on Node's recursive `fs.watch` and `Bun.spawn`, it eliminates third-party watcher binaries (such as `watchexec` or `chokidar`) while providing sub-millisecond change detection, smart debounce buffers, and live execution logging.

---

## ⚡ Quick Start

```bash
# Launch task watcher
bun run app:watcher

# Launch backwards-compatible alias
bun run app:watchexec
```

---

## 🖥️ User Interface Overview

1. **Watch Target Configuration**:
   - **Watch Directory**: Relative or absolute path to the folder to monitor (e.g. `./src` or `./tests`).
   - **Execute Command**: The shell command or script to trigger on file changes (e.g. `bun test`, `bun run build`, `tsc --noEmit`).
   - **File Extensions**: Comma-separated list of extensions to include (e.g. `ts,js,json,html,css`).
   - **Ignore Patterns**: Comma-separated list of path substrings or directories to ignore (e.g. `node_modules,.git,dist,.temp`).
2. **Execution Options**:
   - **Clear Screen on Run**: Automatically clears the output log before each task execution for pristine readability.
   - **Show High-Resolution Timestamps**: Prepends ISO timestamps with millisecond precision to all execution logs.
3. **Control Actions**:
   - **▶️ Start Native Watcher**: Engages the recursive filesystem watcher and enters live monitoring mode.
   - **⏹️ Stop Watcher**: Disengages file handles and stops background triggers safely.
   - **⚡ Run Command Now**: Manually fires the configured command immediately without waiting for a file change.
   - **Clear Console**: Empties the execution log console.
4. **Execution Console & Status Bar**:
   - High-contrast scrollable log window displaying stdout, stderr, exit codes, and debounce timing.
   - Status bar indicating current watcher state (`Active` / `Idle`), trigger counts, and last execution latency.

---

## 📖 Practical Tutorials

### 1. Continuous Automated Test-Driven Development (TDD)
1. Set **Watch Directory** to:
   ```text
   ./src, ./tests
   ```
2. Set **Execute Command** to:
   ```text
   bun test
   ```
3. Set **File Extensions** to:
   ```text
   ts,tsx
   ```
4. Click **▶️ Start Native Watcher**.
5. Edit any file in your code editor. Task Watcher Studio will detect the file change, buffer events for 150ms to prevent duplicate triggers during editor saves, and run `bun test` in the execution console.

### 2. Continuous TypeScript Type Checking
1. Set **Execute Command** to:
   ```text
   bun x tsc --noEmit
   ```
2. Check **Clear Screen on Run**.
3. Click **▶️ Start Native Watcher**.
4. Any type errors or syntax mistakes will appear immediately in the console as soon as you save.

---

## 🛡️ Enterprise Resilience Features
- **Adaptive Event Debouncing**: Prevents cascading double-triggers when modern IDEs perform multi-file atomic saves or temporary file swaps.
- **Graceful Child Process Termination**: If a long-running test or build process is still running when a new file change occurs, Task Watcher terminates the stale process with `SIGTERM` before spawning the new run.
- **Recursive Directory Handling**: Handles deep project directory hierarchies safely on macOS FSEvents with zero external dependencies.
