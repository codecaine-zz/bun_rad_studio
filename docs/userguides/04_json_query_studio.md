# 🔍 JSON Query Studio Pro -- User Guide

**JSON Query Studio Pro** is a high-speed JSON inspection, query, and transformation workbench. Built with a pure TypeScript/Bun evaluation engine, it provides `jq`-like query capabilities (nested key lookups, array slices, key projections, object construction) without requiring Homebrew or external `jq` binaries.

---

## ⚡ Quick Start

```bash
# Launch JSON Query Studio Pro
bun run app:json

# Launch backwards-compatible alias
bun run app:jq
```

---

## 🖥️ User Interface Overview

1. **Query Configuration & Filter Presets**:
   - **JSON Query Input**: Enter standard selector expressions (`.`, `.users[]`, `.users[].name`, `keys`, `length`, `map(...)`).
   - **Engine Mode**: Select between `Bun Native Engine (Zero Homebrew)` (default) or external `jq` if detected.
   - **Preset Query Dropdown**: One-click quick presets:
     - Identity (`.`)
     - First Array Item (`.[0]`)
     - Extract Keys (`keys`)
     - Count Array Items (`length`)
     - Extract Names (`.[].name`)
     - Filter by Property (`.items[] | select(.active == true)`)
2. **Execution Actions**:
   - **⚡ Execute Query**: Evaluates the expression against the input JSON with sub-millisecond execution telemetry.
   - **Format JSON**: Auto-indents and standardizes input JSON to 2 spaces.
   - **Minify JSON**: Compacts input JSON into a single line for network efficiency.
   - **Load Sample Data**: Populates the editor with a structured multi-record dataset (users, roles, permissions, metrics).
   - **Copy Result**: Copies the transformed output directly to the system clipboard.
3. **Dual-Pane JSON Workspace**:
   - **Input JSON Pane**: Multi-line editor for pasting raw JSON payloads, API responses, or configuration files.
   - **Transformed Output Pane**: Formatted query output with syntax validation, line counts, and microsecond query timing.

---

## 📖 Practical Tutorials

### 1. Extracting Specific Nested Fields from an API Response
1. Paste your raw API payload into the **Input JSON** editor:
   ```json
   {
     "status": 200,
     "data": {
       "users": [
         { "id": 1, "name": "Alice", "role": "admin" },
         { "id": 2, "name": "Bob", "role": "developer" },
         { "id": 3, "name": "Charlie", "role": "designer" }
       ]
     }
   }
   ```
2. In the **JSON Query** field, type:
   ```text
   .data.users[].name
   ```
3. Click **⚡ Execute Query**.
4. The output pane will immediately display:
   ```json
   [
     "Alice",
     "Bob",
     "Charlie"
   ]
   ```

### 2. Projecting Custom Objects
1. With the same dataset, project only IDs and roles:
   ```text
   .data.users | map({ id: .id, role: .role })
   ```
2. Click **⚡ Execute Query**.
3. Resulting objects are projected instantly with zero overhead.

### 3. Calculating Summary Counts
1. Type `length` into the query input.
2. Click **⚡ Execute Query** to verify total array length.

---

## 🛡️ Enterprise Resilience Features
- **Zero Homebrew Reliance**: Built on Bun's ultra-fast native V8/JSC JavaScript parser.
- **Safe Expression Sandboxing**: Queries are executed in a safe evaluation context, preventing unauthorized code execution or prototype pollution.
- **Malformed Input Diagnostics**: If the input JSON has syntax errors, line and column numbers are reported in red with visual recovery hints.
