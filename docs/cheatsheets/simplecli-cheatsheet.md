# SimpleCLI console and backend RAD cheat sheet

> **Navigation:** [Cheatsheets Hub](./index.md) · [SimpleGUI Cheat Sheet](./simplegui-cheatsheet.md) · [RAD Modules Cheat Sheet](./rad-modules-cheatsheet.md) · [Full CLI API Reference](../CLI_API.md) · [Combined Handbook](../../CHEATSHEET.md)

**SimpleCLI** is Bun RAD Studio's zero-dependency TypeScript toolkit for building **command-line tools, CI/CD automation scripts, interactive terminal wizards, backend API clients, Redis workers, and standalone compiled binaries** from one cohesive module (`src/simplecli/`).

---

## How SimpleCLI Works in 60 Seconds

Whether you are building your very first terminal command or a production deployment CLI, every SimpleCLI app follows the same straightforward lifecycle:

1. **Create an app** with `newApp("tool-name", "1.0.0")` (or `newSimpleCLI(...)` when you want a custom help description too).
2. **Register typed flags and subcommands** (`addFlagString`, `addFlagBool`, `command(...)`, `.action(...)`). SimpleCLI parses strings, integers, floats, booleans, repeatable arrays, and `choices` enums automatically—plus `-h`/`--help`, `-V`/`--version`, `--completion <shell>`, and typo `"Did you mean ...?"` suggestions.
3. **Run the parser**: call `await app.run()` to parse `process.argv.slice(2)` and invoke the matched `.action(flags, args)` handler, OR call `app.parseCli()` / `app.parseArgs(argv)` when you want manual control (and deterministic headless `bun test` unit tests!).
4. **Stay dual-mode (Human TTY vs CI Pipe)**: inspect `process.stdout.isTTY`, `process.stdin.isTTY`, and `--json` / `--yes` flags so humans see ANSI tables, progress bars, and fuzzy prompts while automated CI scripts (`bun run app.ts --json | jq`) receive clean JSON without hanging on input.
5. **Compose batteries-included engines**: chain `newPipeline()`, shell/hardware/network helpers (`sys`), shell-free safe process execution (`rad.sysutils.execSafe`), non-throwing HTTP CRUD (`createApiClient`), namespaced Redis (`app.redis`), crypto/math/collections (`stdlib`), and single-file binary builds (`bun build --compile`).

### CLI Execution Flow Diagram

```text
  bun run app.ts deploy --env prod --json   (or test: app.parseArgs([...]))
          │
          ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 1. Build App: newApp("deploy-cli", "1.0.0")                         │
  │    Register flags (addFlagString, addFlagBool, addFlagInt, ...)     │
  │    Register subcommands (command("deploy", ...).action(...))        │
  └───────────────────────────────┬─────────────────────────────────────┘
                                  │
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 2. Parse CLI: app.parseCli()  /  app.parseArgs(argv)  /  app.run()  │
  │    • Handles --help / -h, --version / -V, --completion bash|zsh|fish│
  │    • Validates int/float types & string choices; suggests typos     │
  │    • Returns false -> exit early (help printed or invalid input)    │
  └───────────────────────────────┬─────────────────────────────────────┘
                                  │ returns true
                                  ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │ 3. Dual-Mode Execution: Human Terminal (TTY) vs Automated CI / Pipe │
  │                                                                     │
  │   If process.stdin.isTTY && !flags.yes:                             │
  │     -> Interactive prompts, select(), fuzzySelect(), form(), picker │
  │   Else (CI / cron / piped stdin):                                   │
  │     -> Read flags/defaults without blocking on user input           │
  │                                                                     │
  │   Output via app.output(data, { format: "table" | "kv" | ... }):    │
  │     • flags.json === true OR !process.stdout.isTTY -> JSON stdout   │
  │     • Interactive TTY                              -> Styled UI     │
  └─────────────────────────────────────────────────────────────────────┘
```

### The 3 Import Scenarios

Use the import path that matches where your script lives—everything else in this cheat sheet stays identical:

| Scenario | Where Your Script Lives | Copy-Paste Import |
| :--- | :--- | :--- |
| **A. Installed npm Package** | External project using `bun add bun-rad-studio` | `import { newApp, createApiClient, sys, stdlib, rad } from "bun-rad-studio";` |
| **B. Repository Root** | Root script such as `app.ts` in this repo | `import { newApp, createApiClient, sys, stdlib } from "./src/simplecli";` |
| **C. Subfolder Script** | File under `examples/rad_tutorial/` or `tests/sub/` | `import { newApp, createApiClient, sys, stdlib } from "../../src/simplecli";` |

> **Hub Collision Note (`bun-rad-studio` / `"./src"`):** When importing from the unified root hub (`"bun-rad-studio"` or `"./src"`), **`LRUCache`**, **`Logger`**, **`LogLevel`**, and **`TreeNode`** resolve to **SimpleCLI**, while **`writeFileAtomic`** resolves to **SimpleGUI**. Keep using `rad.logutils`, `rad.cacheutils.LRUCache`, and `rad.fileutils.writeFileAtomic` (or import `"./src/simplecli"` directly) whenever you want the RAD-module variants.

### Hello CLI in 10 Lines

Create `app.ts` at the repo root and run `bun run app.ts greet --name Ada`:

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("hello-cli", "1.0.0");

app.command("greet", "Print a friendly greeting", (sub) => {
  sub.addFlagString("name", "n", "World", "Person to greet");
  sub.addFlagBool("json", "j", false, "Emit machine-readable JSON");
  sub.action((flags) => {
    sub.output({ greeting: `Hello, ${flags.name}!`, timestamp: new Date().toISOString() }, { format: "kv", title: "Greeting" });
  });
});

if (import.meta.main) {
  await app.run();
}
```

---

## Contents

- [How SimpleCLI Works in 60 Seconds](#how-simplecli-works-in-60-seconds)
  - [CLI Execution Flow Diagram](#cli-execution-flow-diagram)
  - [The 3 Import Scenarios](#the-3-import-scenarios)
- [Step 1: App initialization, typed flags, and subcommands](#step-1-app-initialization-typed-flags-and-subcommands)
- [Step 2: Console UI, tables, sparklines, bar charts, trees, and diffs](#step-2-console-ui-tables-sparklines-bar-charts-trees-and-diffs)
- [Step 3: Interactive prompts, fuzzy menus, form wizards, and file picker](#step-3-interactive-prompts-fuzzy-menus-form-wizards-and-file-picker)
- [Step 4: Multi-step task pipelines, logging, and benchmarking](#step-4-multi-step-task-pipelines-logging-and-benchmarking)
- [Step 5: `sys` subprocesses, hardware telemetry, network, and OS integration](#step-5-sys-subprocesses-hardware-telemetry-network-and-os-integration)
- [Step 6: `ApiClient` REST CRUD, non-throwing `try*` calls, and Redis](#step-6-apiclient-rest-crud-non-throwing-try-calls-and-redis)
- [Step 7: Shell completions, man pages, and single-binary compilation](#step-7-shell-completions-man-pages-and-single-binary-compilation)
- [Step 8: Pro SimpleCLI RAD tips and tricks](#step-8-pro-simplecli-rad-tips-and-tricks)
- [Complete SimpleCLI workspace template](#complete-simplecli-workspace-template)

---

## Step 1: App initialization, typed flags, and subcommands

Start by creating a `SimpleCLI` application instance, defining strongly typed flags (with optional single-character aliases and allowed-value enums), registering nested or sibling subcommands, and wiring error handlers.

### App Factories & Constructors

| Helper / Method | Signature | Notes |
| :--- | :--- | :--- |
| `newApp` / `createApp` | `newApp(name: string, version = "1.0.0"): SimpleCLI` | Standard fluent app factory (both names are aliases) |
| `newSimpleCLI` / `createCLI` | `newSimpleCLI(name: string, versionOrDescription = "1.0.0", version?: string): SimpleCLI` | Pass `("my-cli", "Description text", "2.0.0")` or `("my-cli", "2.0.0")` |
| `initApp` | `initApp(): SimpleCLI` | Auto-infers app name from `process.argv[1]` basename |
| `SimpleCLI.new` / `SimpleCLI.newApp` | `SimpleCLI.new(appName: string)` · `SimpleCLI.newApp(appName: string, version: string): SimpleCLI` | Static class factories on `SimpleCLI` (`version` is required on static `SimpleCLI.newApp`) |

### Typed Flags, Accessors & Positional Arguments

> **Watch Parameter #2 (`short`):** Every `addFlag*` method takes **`short`** as its **second parameter** (`"e"` for `-e`, or `""` for no short alias)—followed by `defaultVal`, `desc`, and optional `choices`. Passing the default value as the 2nd parameter is a common beginner bug!

| Method | Exact Signature | Behavior & Parsing Details |
| :--- | :--- | :--- |
| `addFlagString` | `addFlagString(name, short, defaultVal = "", desc = "", choices?: string[]): this` | Registers string option; if `choices` is supplied (e.g. `["dev", "staging", "prod"]`), invalid values fail parsing and return `false` |
| `addFlagInt` | `addFlagInt(name, short, defaultVal = 0, desc = ""): this` | Parses integer via `Number(val)` + `Number.isInteger(parsed)`; rejects floats and trailing text such as `"12px"` |
| `addFlagFloat` | `addFlagFloat(name, short, defaultVal = 0.0, desc = ""): this` | Parses floating-point number; rejects `NaN` |
| `addFlagBool` | `addFlagBool(name, short, defaultVal = false, desc = ""): this` | Supports `--verbose`, `--verbose=true\|1\|yes\|on`, `--verbose=false`, and bundled short flags (`-vf` = `-v -f`) |
| `addFlagArray` | `addFlagArray(name, short, defaultVal: string[] = [], desc = ""): this` | First CLI flag replaces `defaultVal`; repeated occurrences (`--tag api --tag v2` or `-t api -t v2`) append to the array |
| `getFlagString` | `getFlagString(name: string): string` | Reads parsed string flag (or default) |
| `getFlagInt` | `getFlagInt(name: string): number` | Reads parsed integer flag |
| `getFlagFloat` | `getFlagFloat(name: string): number` | Reads parsed float flag |
| `getFlagBool` | `getFlagBool(name: string): boolean` | Reads parsed boolean flag |
| `getFlagArray` | `getFlagArray(name: string): string[]` | Reads parsed `string[]` array flag (copy-safe usage) |
| `getAllFlags` | `getAllFlags(): Record<string, any>` | Snapshot dictionary of every flag passed to `.action(flags, args)` |
| `getPositionalArgs` | `getPositionalArgs(): string[]` | Remaining non-flag arguments (plus tokens after `--`) |

### Subcommands, Actions & Global Error Handling

| Method | Signature | Purpose |
| :--- | :--- | :--- |
| `command` | `command(name: string, descriptionOrSetup?: string \| ((sub: SimpleCLI) => void), maybeSetup?: (sub: SimpleCLI) => void): SimpleCLI` | Creates & configures a subcommand (`SimpleCLI` child inheriting `version` and `noColor`); returns the child instance |
| `action` | `action(fn: (flags: Record<string, any>, args: string[]) => void \| Promise<void>): this` | Registers execution handler for root app or subcommand |
| `run` | `run(rawArgs: string[] = process.argv.slice(2)): Promise<boolean>` | Parses `rawArgs`; if a subcommand matches, delegates to `sub.run(...)`, otherwise invokes root `.action(flags, args)` |
| `handleErrors` | `handleErrors(): this` | Installs friendly formatted handlers for uncaught exceptions and unhandled rejections |
| `formatError` | `formatError(err: unknown): string` | Formats `Error` / thrown value with optional debug stack trace |

### `app.parseCli()` vs `app.parseArgs(customArgv)` vs `app.run()`

Understanding which entry method to call prevents one of the biggest surprises for new users:

| Feature / Behavior | `app.parseCli(rawArgs?)` | `app.parseArgs(args: string[])` | `await app.run(rawArgs?)` |
| :--- | :--- | :--- | :--- |
| **Default input** | `process.argv.slice(2)` | Explicit `string[]` you supply | `process.argv.slice(2)` |
| **Invokes `.action(flags, args)`?** | **No** (parse only) | **No** (parse only) | **Yes** (matched subcommand or root `.action`) |
| **Resets state on each call?** | Yes (resets flags & positional args) | Yes (safe to call repeatedly in tests!) | Yes |
| **Built-in `--help`/`--version`/`--completion`?** | Yes (prints & returns `false`) | Yes (prints & returns `false`) | Yes (prints & returns `false`) |
| **Validates types, missing flag values & `choices`?** | Yes (prints error & returns `false`) | Yes (prints error & returns `false`) | Yes (returns `false`, skips `.action`) |
| **Primary use case** | Imperative scripts doing `if (!app.parseCli()) return;` | **Headless `bun test` unit tests** | Standard subcommand-driven CLIs |

> **Built-In Features & Flag Placement Rules:**
> - `--help` / `-h` and `--version` / `-V` / `-v` are handled inside `parseArgs()` immediately before returning `false`.
> - `--completion bash|zsh|fish` and `my-cli completion zsh` are built into `parseArgs()` automatically—there is **no** `app.enableCompletions()` method.
> - **Parent vs. Subcommand Flag Scope:** Flags registered on root `app` (`app.addFlagString("env", ...)`) MUST appear **before** the subcommand (`app.ts --env prod status`). Flags expected **after** a subcommand (`app.ts status --json`) must be registered directly on the child `sub` instance (`statusCmd.addFlagBool(...)`). Child subcommands only inherit `version` and `noColor`, not parent flags.
> - **Typo Suggestions ("Did you mean ...?"):** Unknown subcommands print `Did you mean '<match>'?` and return `false`. Unknown `--flag` tokens print a suggestion when close to a registered flag and pass into `getPositionalArgs()`.
> - Stop-parsing separator `--`: everything after `--` goes straight into `getPositionalArgs()` unchanged.

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("deploy-cli", "2.1.0").handleErrors();

// Global flags (pass "" for `short` if no single-letter alias is desired)
app.addFlagString("env", "e", "dev", "Target environment", ["dev", "staging", "prod"]);
app.addFlagInt("replicas", "r", 2, "Pod replica count");
app.addFlagFloat("canary", "", 0.1, "Canary traffic ratio (0.0 - 1.0)");
app.addFlagBool("verbose", "v", false, "Enable verbose logging");
app.addFlagArray("tag", "t", ["latest"], "Docker image tags (repeatable)");

const statusCmd = app.command("status", "Show cluster rollout status");
statusCmd.addFlagBool("json", "j", false, "Emit JSON output");
statusCmd.action((flags, args) => {
  statusCmd.output(
    {
      service: args[0] ?? "api-gateway",
      env: app.getFlagString("env"),
      replicas: app.getFlagInt("replicas"),
      tags: app.getFlagArray("tag"),
    },
    { format: "kv", title: "Rollout Status" },
  );
});

app.command("rollback", "Roll back a release", (sub) => {
  sub.addFlagInt("revision", "r", 1, "Target revision number");
  sub.action((flags, args) => {
    sub.info(`Rolling back ${args[0] ?? "all"} to revision ${flags.revision}`);
  });
});

// Option A: Let SimpleCLI parse argv and execute the matched .action():
// Example invocation: bun run app.ts --env prod --replicas 3 status --json
if (import.meta.main) {
  const ok = await app.run();
  if (!ok) process.exitCode = 1;
}

// Option B: Imperative parsing (remember parseCli() does NOT run .action()!):
// if (!app.parseCli()) process.exit(0);
// const env = app.getFlagString("env");
```

---

## Step 2: Console UI, tables, sparklines, bar charts, trees, and diffs

SimpleCLI ships a complete ANSI rendering engine that automatically respects `--no-color` (`app.setNoColor(true)`), `--silent` (`app.setSilent(true)`), and piped CI output (`!process.stdout.isTTY`).

### Interactive Terminal (TTY) vs Piped CI Output (`--json` and Pipes)

When a user runs your CLI in a terminal (`process.stdout.isTTY === true`), human-friendly banners, tables, and colors look great. When they pipe output to another tool (`bun run app.ts status | jq`) or pass `--json`, color escapes and ASCII borders break scripts.

Use **`app.output(data, options?)`** instead of hardcoding `console.log`:

| Scenario | Behavior of `app.output(data, { format, title })` |
| :--- | :--- |
| `--json` flag is `true` OR `options.format === "json"` | Prints clean `JSON.stringify(data, null, 2)` (no borders or ANSI noise) |
| `!process.stdout.isTTY` (piped / CI) AND `format` is not `"text"` or `"markdown"` | Automatically falls back to `JSON.stringify(data, null, 2)`! |
| Interactive TTY (`format: "table"`) | Renders an aligned ASCII table (`Array<Record<string, any>>` supported natively!) |
| Interactive TTY (`format: "kv"`) | Renders key-value pairs via `printKv(data)` (with optional `title` banner/step) |
| `format: "markdown"` or `"text"` | Skips auto-JSON conversion on pipes and prints strings via `println(String(data))` (call `app.renderMarkdown(md)` explicitly when you want styled Markdown rendering) |

> **Important API Clarity:** SimpleCLI does **not** have `app.isTty()`, `app.smartOutput()`, `app.printJson()`, or `app.forEachWithProgress()`. Check TTY natively with `process.stdout.isTTY` / `process.stdin.isTTY`, use **`app.output(data, { format, title })`** + **`app.tableToJson()`** + **`app.jsonHighlight()`** for dual-mode JSON output, and drive progress bars directly inside a standard `for` loop.

### Complete Console Visual Components Reference

| Category | Method & Exact Parameters | What It Renders |
| :--- | :--- | :--- |
| **Output & Dual-Mode** | `output(data: any, options?: { format?: OutputFormat; title?: string })` | Auto-switches between TTY `"table"`/`"kv"`/`"markdown"`/`"text"` and piped/flagged `"json"` |
| **Basic Printing** | `print(...args)` / `println(...args)` | Prints inline / newline (suppressed when `setSilent(true)`) |
| **Text Styles** | `bold(t)` `dim(t)` `italic(t)` `underline(t)` `inverse(t)` `strike(t)` | ANSI text modifiers (strip cleanly when `setNoColor(true)`) |
| **Colors** | `red(t)` `green(t)` `yellow(t)` `blue(t)` `magenta(t)` `cyan(t)` `white(t)` `gray(t)` `brightRed(t)`..`brightWhite(t)` | Named foreground colors |
| **Truecolor** | `rgb(r, g, b, t)` · `hex(hexCode, t)` · `hsl(h, s, l, t)` | 24-bit RGB / hex (`"#38bdf8"`) / HSL foreground colors |
| **Layout** | `banner(title, subtitle = "")` · `panel(title, content)` · `card(title, content)` | Boxed header banner, content panel, and compact card |
| **Dividers & Steps** | `step(num: number, title: string)` · `divider(char = "─", width = 60)` · `printKv(data)` | Numbered section heading, horizontal rule, aligned key-value list |
| **Tables** | `table(headers: string[], rows: (string \| number \| boolean)[][])` | Auto-sized ANSI-aware bordered table |
| **Table Exporters** | `tableToCsv(headers, rows)` · `tableToMarkdown(headers, rows)` · `tableToJson(headers, rows)` | Returns CSV, Markdown table, or pretty JSON strings for files/pipes |
| **Progress & Spinners** | `progressBar(current, total, label = "", width = 30)` · `await spinner(label, durationMs = 1000)` | Inline overwriting terminal bar with `%`; async Braille frame spinner |
| **Charts & Gauges** | `sparkline(values: number[]): string` · `barChart(title, data: Record<string, number>, maxBarWidth = 30)` · `gauge(label, value, max, unit = "")` | Unicode trend sparkline (`▁▂▃▄▅▆▇█`), horizontal bars, threshold meter (`OK` < 75%, `WARN` >= 75%, `CRITICAL` >= 90%) |
| **Trees** | `new TreeNode(label)` + `.addChild(labelOrNode)` / `.addNode(child)` + `app.tree(root)` | Nested `├──` / `└──` ASCII hierarchy tree |
| **Diffs** | `diffText(oldText, newText): string` · `diff(oldText, newText): void` | Colored `- removed` / `+ added` unified diff (auto-normalizes CRLF `\r\n`) |
| **Badges & Alerts** | `badge(prefix, text, kind = AlertKind.INFO): string` · `alert(kind: AlertKind, title, message)` | Styled pills and callout boxes (`INFO`, `SUCCESS`, `WARNING`, `CAUTION`, `TIP`, `NOTE`) |
| **Task Items** | `taskItem(name, status: TaskStatus, durationMs = 0)` | Status checklist line (`PENDING`, `RUNNING`, `DONE`, `FAILED`, `SKIPPED`) |
| **Code & Docs** | `jsonHighlight(jsonStr): string` · `renderMarkdown(markdownText): void` | Returns colorized JSON string; `renderMarkdown` prints styled terminal Markdown directly (`void`) |

```typescript
import { AlertKind, TaskStatus, TreeNode, newApp } from "./src/simplecli";

const app = newApp("ui-tour", "1.0.0");
app.addFlagBool("json", "j", false, "Emit JSON instead of terminal UI");
if (!app.parseCli()) process.exit(0);

// Dual-mode data: prints styled table in interactive TTY, clean JSON with `--json` or pipes (`| jq`)
const services = [
  { Service: "api-gateway", LatencyMs: 14, Status: "HEALTHY" },
  { Service: "worker-pool", LatencyMs: 42, Status: "HEALTHY" },
];
app.output(services, { format: "table", title: "Live Cluster Inventory" });

// Interactive-only dashboard widgets (skip decorative UI when piping JSON)
if (!app.getFlagBool("json") && process.stdout.isTTY) {
  app.banner("Release Telemetry", "Production Cluster • us-east");
  app.step(1, "Resource Gauges & Sparklines");
  app.println("CPU trend: " + app.cyan(app.sparkline([18, 22, 29, 44, 38, 27, 21])));
  app.gauge("Memory Usage", 78, 100, "%"); // 78% -> WARN (>= 75% WARN, >= 90% CRITICAL)
  app.barChart("Requests / sec by Route", { "/health": 1840, "/api/users": 920, "/graphql": 410 }, 24);

  app.step(2, "Dependency Tree & Config Diff");
  const root = new TreeNode("workspace/");
  root.addChild("src/").addChild("index.ts");
  root.addChild("tests/").addChild("cli.test.ts");
  app.tree(root);

  app.diff("port = 3000\ncache = false", "port = 8080\ncache = true");
  app.alert(AlertKind.TIP, "Fast Export", "Pipe with `| jq` to receive clean JSON automatically.");
  app.println(app.badge("BUILD", "v2.1.0", AlertKind.SUCCESS));
  app.taskItem("Compile bundle", TaskStatus.DONE, 412);

  // Progress bar loop (standard `for` loop — no `forEachWithProgress` wrapper)
  const items = ["migrations", "assets", "schema"];
  for (let i = 0; i < items.length; i++) {
    app.progressBar(i + 1, items.length, `Syncing ${items[i]}`, 28);
    await Bun.sleep(60);
  }
  await app.spinner("Finalizing checksums", 500);
}
```

---

## Step 3: Interactive prompts, fuzzy menus, form wizards, and file picker

SimpleCLI's prompt suite supports interactive raw-mode TTY controls (arrow keys, type-to-filter fuzzy search, directory browsing) AND automatic fallback behavior when `stdin` is piped in CI.

### Complete Prompt Method Table

| Method | Signature | Returns | Input Behavior & Validation |
| :--- | :--- | :--- | :--- |
| `prompt` | `prompt(message: string, defaultVal = ""): Promise<string>` | `string` | Single-line text input; empty line returns `defaultVal` |
| `promptPassword` | `promptPassword(message: string): Promise<string>` | `string` | Masks characters (`*`) in TTY raw mode (`Prompts.promptPassword(msg, "#")` customizes mask); exits `130` on Ctrl+C |
| `promptEmail` | `promptEmail(message: string, defaultVal = ""): Promise<string>` | `string` | Re-prompts until input matches email format (`x@y.zz`) |
| `promptUrl` | `promptUrl(message: string, defaultVal = ""): Promise<string>` | `string` | Re-prompts until valid `http:` or `https:` URL |
| `promptNumber` | `promptNumber(message: string, defaultVal = 0, min = -Infinity, max = Infinity): Promise<number>` | `number` | Parses numeric value and enforces inclusive `[min, max]` range |
| `confirm` | `confirm(message: string, defaultVal = false): Promise<boolean>` | `boolean` | Displays `(Y/n)` or `(y/N)`; accepts `y`, `yes`, `true`, `1` |
| `select` | `select(message: string, choices: string[], defaultIdx = 0): Promise<string>` | `string` | TTY arrow/`j`/`k` selector; numbered list fallback in non-TTY (`""` if `choices` empty) |
| `multiSelect` | `multiSelect(message: string, choices: string[], defaultSelected: number[] = []): Promise<string[]>` | `string[]` | TTY `Space` toggles, `a` toggles all, `Enter` confirms; comma-separated indices in non-TTY |
| `fuzzySelect` | `fuzzySelect(message: string, choices: string[]): Promise<string>` | `string` | Live substring filter (up to 8 visible rows) in TTY; falls back to `select` in non-TTY |
| `form` | `form(title: string, fields: FormField[]): Promise<Record<string, string>>` | `Record<string, string>` | Multi-step wizard collecting strings for `"text"`, `"number"`, `"boolean"`, `"password"`, `"select"` |
| `promptPath` | `promptPath(message: string, defaultVal = "", mode = PathMode.ANY): Promise<string>` | `string` | Expands `~`; validates against `PathMode` (`ANY`, `MUST_EXIST`, `FILE`, `DIRECTORY`) |
| `filePicker` | `filePicker(message = "Select a file or directory:", options?: FilePickerOptions): Promise<string>` | `string` | TTY interactive directory navigator (`Enter` open/select, `Space` pick dir, `Esc`/`q`/Ctrl+C -> `""`); falls back to `promptPath` in non-TTY |

### `FormFieldKind`, `PathMode`, and `FilePickerOptions` Reference

- **`FormFieldKind`** (use enum or lowercase string literal):
  - `FormFieldKind.TEXT` (`"text"`) -> delegates to `prompt`
  - `FormFieldKind.NUMBER` (`"number"`) -> delegates to `promptNumber` (still serialized as `string` in returned `Record<string, string>`, e.g. `"8080"`)
  - `FormFieldKind.BOOLEAN` (`"boolean"`) -> delegates to `confirm` (returns `"true"` or `"false"`)
  - `FormFieldKind.PASSWORD` (`"password"`) -> delegates to `promptPassword`
  - `FormFieldKind.SELECT` (`"select"`) -> delegates to `select(..., field.choices ?? [])`
- **`FormField` properties**: `{ key: string; label: string; kind?: FormFieldKind; defaultVal?: string; required?: boolean; choices?: string[] }`
- **`PathMode` values**: `PathMode.ANY` (default), `PathMode.MUST_EXIST`, `PathMode.FILE`, `PathMode.DIRECTORY`
- **`FilePickerOptions` properties**: `{ baseDir?: string; mode?: PathMode; extensions?: string[]; allowHidden?: boolean }`

### Selecting from Structured Objects (`select` + `Map` Pattern)

`select()`, `multiSelect()`, and `fuzzySelect()` take `string[]` labels (there is **no** `app.selectFromObjects()` method). To select a typed object cleanly, pair formatted choice strings with a `Map`:

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("picker-demo", "1.0.0");

const targets = [
  { id: "us-east-1", region: "Virginia", host: "10.0.1.24" },
  { id: "eu-west-1", region: "Dublin", host: "10.0.2.18" },
];

const byLabel = new Map(
  targets.map((t) => [`${t.id.padEnd(10)} | ${t.region.padEnd(10)} | ${t.host}`, t]),
);

const pickedLabel = await app.fuzzySelect("Select target cluster:", Array.from(byLabel.keys()));
const chosen = byLabel.get(pickedLabel);
app.info(`Chosen host: ${chosen?.host ?? "none"}`);
```

### Ctrl+C, Non-TTY Behavior, and CI Flag Fallbacks

Understanding exact edge-case behavior prevents frozen CI jobs:

1. **Ctrl+C (`\u0003`) in raw TTY menus**: `promptPassword`, `select`, `multiSelect`, and `fuzzySelect` restore terminal raw mode, print a newline, and call **`process.exit(130)`** (standard POSIX `SIGINT` exit code). `filePicker` returns `""` cleanly on `q`, `Esc`, or Ctrl+C so callers can check `if (!picked)`.
2. **Non-TTY `stdin` (`CI=true`, cron, piped scripts)**:
   - `select` / `multiSelect` automatically switch from arrow-key raw mode to numbered `readline` menus.
   - `fuzzySelect` delegates to `select`; `filePicker` delegates to `promptPath`.
   - `form()` stops retrying an empty `required` field after **2 failed attempts** so piped EOF does not infinite-loop.
3. **Recommended CI-Safe Pattern**: Always pair prompts with CLI flags and check `!process.stdin.isTTY` (or `--yes`):

```typescript
import { FormFieldKind, PathMode, newApp, type FilePickerOptions } from "./src/simplecli";

const app = newApp("init-wizard", "1.0.0");
app.addFlagString("env", "e", "", "Deployment environment", ["dev", "staging", "prod"]);
app.addFlagBool("yes", "y", false, "Non-interactive mode (use flags/defaults)");
if (!app.parseCli()) process.exit(0);

const nonInteractive = app.getFlagBool("yes") || !process.stdin.isTTY;

const env = app.getFlagString("env") || (nonInteractive
  ? "dev"
  : await app.select("Environment:", ["dev", "staging", "prod"], 0));

if (!nonInteractive) {
  const wizard = await app.form("Service Configuration", [
    { key: "service", label: "Service name", kind: FormFieldKind.TEXT, required: true, defaultVal: "api" },
    { key: "port", label: "Listen port", kind: FormFieldKind.NUMBER, defaultVal: "8080" },
    { key: "tls", label: "Enable TLS", kind: FormFieldKind.BOOLEAN, defaultVal: "true" },
    { key: "tier", label: "Plan tier", kind: FormFieldKind.SELECT, choices: ["starter", "pro"] },
    { key: "token", label: "Deploy token", kind: FormFieldKind.PASSWORD },
  ]);

  const pickerOpts: FilePickerOptions = { baseDir: ".", mode: PathMode.FILE, extensions: [".ts", ".json"] };
  const entry = await app.filePicker("Choose config or entry file (Esc to cancel):", pickerOpts);
  app.printKv({ env, ...wizard, entry: entry || "(cancelled)" });
}
```

---

## Step 4: Multi-step task pipelines, logging, and benchmarking

### Pipelines (`newPipeline`)

`app.newPipeline(title)` runs an ordered sequence of sync or async steps (`() => boolean | Promise<boolean>`), displays live status indicators and per-step timing, **aborts immediately if any step returns `false` or throws an `Error`**, and returns `Promise<boolean>`:

- `pipeline.addStep(name: string, stepFn: () => boolean | Promise<boolean>): this`
- `await pipeline.run(): Promise<boolean>` -> `true` if every step passed, `false` if aborted early.

> Note: `Pipeline.run()` writes progress lines directly to `stdout` (ignoring `setSilent(true)`), so in strict `--json | jq` scripts run the step functions directly instead of `pipe.run()` when `jsonMode` is active.

### Structured Logging, Levels & File Output

| Control / Method | Signature | Exact Behavior |
| :--- | :--- | :--- |
| `LogLevel` enum | `TRACE = 0`, `DEBUG = 1`, `INFO = 2`, `WARN = 3`, `ERROR = 4`, `SILENT = 5` | Also accepts lowercase `LogLevelName` strings (`"trace"` \| `"debug"` \| `"info"` \| `"warn"` \| `"error"` \| `"silent"`) |
| `setLogLevel` | `setLogLevel(level: LogLevel \| LogLevelName): this` | Sets minimum threshold written to console and log file |
| `setDebug` / `setSilent` | `setDebug(enabled: boolean): this` · `setSilent(enabled: boolean): this` | Shortcuts for `LogLevel.DEBUG` and `LogLevel.SILENT` |
| `setLogFile` | `setLogFile(filePath: string): this` | Appends timestamped, ANSI-stripped plain-text log lines to disk |
| Log emitters | `trace(msg)` `debug(msg)` `info(msg)` `success(msg)` `warn(msg)` `error(msg)` `fatal(msg)` | `success` logs at `INFO` with `OK` styling; `fatal` logs at `ERROR` and calls `process.exit(1)` |

### High-Resolution Timers & Benchmarking

| Method | Signature & Return Shape | Purpose |
| :--- | :--- | :--- |
| `resetTimer()` | `resetTimer(): void` | Resets the app's internal stopwatch |
| `elapsedMs()` | `elapsedMs(): number` | Milliseconds elapsed since construction or `resetTimer()` |
| `elapsedSeconds()` | `elapsedSeconds(): number` | Seconds elapsed since construction or `resetTimer()` |
| `measure<T>(fn)` | `measure<T>(fn: () => T): { result: T; durationMs: number; durationNs: number }` | Profiles a synchronous function at nanosecond precision |
| `measureAsync<T>(fn)` | `measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number; durationNs: number }>` | Profiles an async function or I/O call cleanly |

```typescript
import { LogLevel, newApp } from "./src/simplecli";

const app = newApp("release-runner", "1.0.0")
  .setLogLevel(LogLevel.INFO)
  .setLogFile("release-runner.log"); // strips ANSI colors before writing to disk

app.resetTimer();

const bench = await app.measureAsync(async () => {
  await Bun.sleep(25);
  return { compiledFiles: 18 };
});
app.info(`Scanned ${bench.result.compiledFiles} files in ${bench.durationMs.toFixed(2)}ms`);

const pipeline = app.newPipeline("Production Release Pipeline")
  .addStep("Verify workspace", () => true)
  .addStep("Run preflight latency check", async () => {
    await Bun.sleep(40);
    return true;
  })
  .addStep("Publish release manifest", () => true);

const passed = await pipeline.run();
app.info(`Pipeline finished in ${app.elapsedSeconds().toFixed(2)}s (ok=${passed})`);
```

---

## Step 5: `sys` subprocesses, hardware telemetry, network, and OS integration

`sys` (imported from `"./src/simplecli"` or `"bun-rad-studio"`) wraps Bun native APIs and OS commands into cross-platform static helpers.

### Subprocesses: `sys.exec*` (Shell Strings) vs Shell-Free `rad.sysutils.execSafe`

| Method | Signature | Return Shape / Behavior |
| :--- | :--- | :--- |
| `sys.exec` | `exec(cmd: string, cwd?: string): [string, number]` | Synchronous command returning `[combinedOutput, exitCode]` |
| `sys.execOr` | `execOr(cmd: string, fallback = "", cwd?: string): string` | Returns trimmed stdout, or `fallback` whenever `exitCode !== 0` |
| `sys.execBg` | `execBg(cmd: string, cwd?: string): number \| undefined` | Spawns detached background process; returns PID |
| `sys.execInDir` | `execInDir(dir: string, cmd: string): [string, number]` | Runs `cmd` inside `dir` synchronously |
| `sys.execTimeout` | `execTimeout(cmd: string, timeoutMs = 5000, cwd?: string): Promise<ExecResult>` | Async with hard kill on timeout (`exitCode: 124`, `timedOut: true`) |
| `sys.execRetry` | `execRetry(cmd: string, maxRetries = 3, delayMs = 500, cwd?: string): Promise<ExecResult>` | Async retry loop (`attempts` counts total tries) |
| `sys.execParallel` | `execParallel(commands: string[], concurrency = 4): Promise<[string, number][]>` | Runs batch of commands up to `concurrency` in parallel |
| `sys.killProcess` | `killProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): boolean` | Sends OS signal to PID; returns `false` on error |

`ExecResult` shape: `{ output: string; exitCode: number; durationMs: number; timedOut: boolean; attempts: number }`.

> **Security Warning — Shell-Free Execution (`rad.sysutils.execSafe` / `Bun.spawn`):**
> Every `sys.exec*` helper executes inside a shell (`shell: true`) and **`sys.execSafe()` does NOT exist on `sys`**.
> Whenever a command includes **user input, filenames, branch names, or commit messages**, use **`rad.sysutils.execSafe(cmd, args, opts?)`** (from `"bun-rad-studio"` or `"./src/features/rad/index.ts"`) or native **`Bun.spawn([...])`**! Both pass arguments as an argv array directly to the OS kernel with zero shell interpretation, eliminating command injection.

```typescript
import { sys } from "./src/simplecli";
import { rad } from "./src/features/rad/index.ts";

// 1. Static trusted check with sys.execOr / sys.execTimeout
const bunVer = sys.execOr("bun --version", "unknown");
const check = await sys.execTimeout("bun --version", 3000);
console.log({ bunVer, timedOut: check.timedOut, exitCode: check.exitCode });

// 2. Untrusted/dynamic args -> ALWAYS use array args via rad.sysutils.execSafe (shell-free)
const userMessage = "fix: quote; $(whoami) safely";
const safe = await rad.sysutils.execSafe("bun", ["--version"], { cwd: process.cwd() });
// Safe commit pattern: await rad.sysutils.execSafe("git", ["commit", "-m", userMessage]);
// With timeout: Bun.spawn(["git", "commit", "-m", userMessage], { signal: AbortSignal.timeout(5000) })
console.log({ exitCode: safe.exitCode, stdout: safe.stdout.trim(), userMessage });
```

### Hardware Telemetry, OS Info & Paths

| Category | Methods & Return Shapes |
| :--- | :--- |
| **CPU & Load** | `cpuCount(): number`, `cpuModel(): string`, `cpuLoad(): [number, number, number]` (1m/5m/15m) |
| **Memory** | `ramTotal(): number`, `ramFree(): number`, `ramUsed(): number`, `ramPercent(): number`, `memoryInfo(forceRefresh?): MemoryBreakdown` (byte/GB counters + `percent`) |
| **Disk** | `diskStats(targetPath = "/"): DiskStats` (`{ totalBytes, usedBytes, freeBytes, percent }`) |
| **Host & OS** | `osPlatform()`, `osArch()`, `osRelease()`, `osHostname()`, `osHomedir()`, `osTmpdir()`, `osUptime()` (seconds), `batteryPercent()`, `isCharging()` |
| **Paths & Temp** | `expandTilde("~/..." )` (`Prompts.expandPath` also exists), `tempFile(prefix = "tmp_", suffix = "")` (path string), `tempDir(prefix = "tmp_dir_")` (**creates unique directory on disk via `mkdtempSync`!**) |
| **Config & App State** | `app.config` (`ConfigStore` storing `0o600` JSON in XDG/APPDATA; supports dot-paths `.get("db.host")`, `.set(...)`, `.save()`, `.path`), `app.getAppStateFile(appName, fileName)` |

> **Method Naming Note:** `sys.homeDir()`, `sys.configDir()`, and `sys.expandPath()` do **not** exist in `src/simplecli/sys/index.ts`. Use **`sys.osHomedir()`**, **`app.config.path`**, and **`sys.expandTilde()`**! Also remember `sys.osTmpdir()` returns the OS temp root string, whereas **`sys.tempDir()` creates a new directory on disk**.

### Files, Environment, Binaries, Compression & Semver

| Category | Verified `sys` Methods |
| :--- | :--- |
| **File I/O (Async & Sync)** | `readText`, `readTextSync`, `readJson`, `readJsonSync`, `readBytes`, `write`, `writeSync`, `writeJson`, `append`, `touch`, `chmod`, `deleteFile`, `ensureDir` |
| **File Metadata & Search** | `fileExists`, `fileSize`, `fileMime`, `fileMetadata(path): FileMetadata \| null`, `findFiles(rootDir, pattern?): string[]` |
| **Binaries & Env** | `which(bin)`, `hasBinary(bin)`, `getEnv(k, fallback?)`, `setEnv(k, v)`, `requireEnv(k)` (throws if missing), `bunVersion()`, `bunRevision()` |
| **Compression & Checksums** | `gzip`, `gunzip`, `deflate`, `inflate`, `fastHash`, `crc32`, `adler32` |
| **Semver & Timing** | `semverCompare(a, b)`, `semverSatisfies(ver, range)`, `sleep(ms)`, `nanoseconds()`, `measure`, `measureAsync` |

### Networking, Port Probes, Embedded Servers & OS Desktop Integration

| Method | Signature & Purpose |
| :--- | :--- |
| `localIp()` / `macAddress()` | Primary non-internal IPv4 address / MAC address |
| `networkInterfaces()` / `wifiSsid()` | OS interface map / active Wi-Fi SSID (macOS/Linux/Windows) |
| `dnsLookup(hostname)` / `pingCheck(host?, timeoutMs?)` | Resolves host IPs / ICMP ping boolean check |
| `checkPort(host, port, timeoutMs = 1000): Promise<boolean>` | Non-blocking TCP port reachability test |
| `portScan(host, startPort, endPort, timeoutMs = 600): Promise<number[]>` | Scans inclusive range and returns open ports |
| `waitForPort(host, port, timeoutMs = 10000, intervalMs = 200): Promise<boolean>` | Polls TCP port until service accepts connections or timeout expires |
| `waitForHttp(url, timeoutMs = 10000, intervalMs = 250, expectedStatus?: number): Promise<boolean>` | Polls HTTP endpoint until expected status arrives (defaults to `undefined`, accepting any 2xx `res.ok`) |
| `serve` / `serveStatic` / `serveJson` | Starts embedded `Bun.serve` HTTP, static directory, or JSON router server (pass port `0` for an ephemeral test port!) |
| `notify(title, message, sound = true)` | Native desktop toast notification (macOS/Linux/Windows) |
| `say(text, voice?, rate?)` / `beep()` | OS text-to-speech / terminal bell |
| `clipboardCopy(text): boolean` / `clipboardPaste(): string` | Cross-platform system clipboard read/write |
| `openUrl(url): boolean` | Opens validated `http:`, `https:`, or `mailto:` URL in default browser |

---

## Step 6: `ApiClient` REST CRUD, non-throwing `try*` calls, and Redis

SimpleCLI embeds **`BackendClient`** (exported also as **`ApiClient`**, factory **`createApiClient`**, **`createBackendClient`**, or **`app.api(...)`**) alongside a namespaced Redis client with zero-dependency in-memory fallback.

### Client Initialization, Auth, Retries, Caching & Scoping

```typescript
import { createApiClient, newApp } from "./src/simplecli";

const app = newApp("api-worker", "1.0.0");

// Fluent builder (all placeholder tokens follow safe documentation conventions)
const api = createApiClient("https://api.example.invalid/{version}")
  .setVar("version", "v2")
  .withBearer("my-api-token")              // or .withApiKey("your-api-key") / .withBasicAuth("admin", "example-password")
  .setHeader("X-Client", "simplecli/1.0")
  .setTimeout(8000)
  .setRetries(3, 250)                      // retries [408, 425, 429, 500, 502, 503, 504] with backoff + Retry-After
  .enableCache(30_000, 128)                // caches GET/HEAD responses (bypass per-call with { cache: false })
  .setRateLimit(20, 1000);                 // sliding-window throttle: max 20 requests/sec

// Scoped child client inheriting auth, retries, and base headers
const adminApi = api.scope("/admin", { timeoutMs: 15_000 });
```

### Complete `ApiClient` Method Reference

| Group | Methods & Signatures | Return Shape / Behavior |
| :--- | :--- | :--- |
| **Standard Verbs** | `request`, `get`, `post`, `put`, `patch`, `delete`, `head`, `options` | `Promise<BackendResponse<T>>` (`{ ok, status, statusCode, statusText, headers, data, body, text(): string, url, durationMs, attempts, cached }`); throws `BackendApiError` on 4xx/5xx unless `setThrowOnError(false)` |
| **Unwrapped Helpers** | `getJson<T>(path, opts?)` · `postJson` · `putJson` · `patchJson` · `deleteJson` · `getText` · `getBytes` | Returns `T` directly; pass `{ fallback: defaultVal }` inside `opts: RequestOptions & { fallback?: T }` to swallow errors and return fallback |
| **Non-Throwing `try*`** | `tryRequest`, `tryGet`, `tryPost`, `tryPut`, `tryPatch`, `tryDelete` | Never throws! Resolves `SafeApiResult<T>`: `{ ok: boolean; data: T \| null; error: string \| null; statusCode: number; durationMs: number; response: BackendResponse<T> \| null }` |
| **Typed CRUD Resource** | `const users = api.resource<User, number>("/users")` | `.list(query?, opts?)`, `.get(id, query?, opts?)`, `.create(payload)`, `.update(id, payload)`, `.patch(id, payload)`, `.remove(id): Promise<boolean>`, `.action(id, "promote", body, "POST")` |
| **Interceptors** | `useRequestInterceptor(fn)` · `useResponseInterceptor(fn)` · `onError(fn)` | Inject dynamic auth headers, mutate/inspect responses, centralize error logging |
| **GraphQL** | `graphql<T>(query, variables?, operationName?, endpointPath = "/graphql", options?)` | Returns `GraphQLResult<T>` (`{ ok, data, errors, statusCode, headers, durationMs }`) |
| **Pagination** | `paginate<T>(path, opts?: PaginationOptions): AsyncGenerator<T[]>` · `fetchAllPages<T>(path, opts?): Promise<T[]>` | Streams pages or collects all records across `"page"`, `"offset"`, `"cursor"`, and RFC 8288 `"link"` headers |
| **Streaming** | `streamSse(path, onEvent, opts?)` · `streamLines(path, onLine, opts?)` · `streamJsonLines<T>(path, onItem, opts?)` | Incremental NDJSON, line-by-line logs, and Server-Sent Events (`SseEvent`) |
| **Forms & Files** | `postForm(path, form)` · `upload(targetPath, files, fields = {}, options?)` · `download(targetPath, destPath, onProgress?, options?)` | URL-encoded forms, `multipart/form-data` (`files` + separate `fields`), binary download to disk |
| **Ops & Diagnostics** | `healthCheck(path = "/health", expectedStatus = 200)` · `waitForReady(path = "/health", timeoutMs = 10000, intervalMs = 200)` · `probeEndpoints(paths[])` · `batch(reqs, concurrency)` · `benchmark(path, opts)` · `toCurl(method, path, opts?)` · `BackendClient.fromCurl(cmd)` | Operational checks, concurrent request batches, latency percentile stats (`p50`/`p95`/`p99`), cURL generation/import |

> **Non-Throwing Tip (`tryGet` vs `tryGetJson`):** Use **`api.tryGet<Release>("/releases/latest")`** (which parses JSON automatically into `res.data`)—there is **no** `tryGetJson()` method.

### End-to-End Mock Server + `tryGet` + `resource` Example

```typescript
import { createApiClient, sys } from "./src/simplecli";

// Port 0 binds an ephemeral free localhost port — ideal for scripts and `bun test`
const server = sys.serveJson(
  {
    "/health": { ok: true },
    "GET /items": () => [{ id: 1, name: "worker-a", healthy: true }],
    "POST /items": async (req: Request) => ({ id: 2, ...(await req.json()) }),
  },
  0,
  "127.0.0.1",
);

const client = createApiClient(server.url.toString());

const safe = await client.tryGet<{ ok: boolean }>("/health");
if (safe.ok) {
  console.log("API healthy:", safe.data, `(${safe.durationMs.toFixed(1)}ms)`);
}

interface Item { id: number; name: string; healthy?: boolean }
const items = client.resource<Item, number>("/items");
const list = await items.list();
const created = await items.create({ name: "worker-b", healthy: true });
console.log({ initialCount: list.length, created });

server.stop(true);
```

### Namespaced Redis + Automatic In-Memory Fallback + App State

`app.redis(namespace?, options?)` returns a `NamespacedRedis` client that prefixes keys automatically and seamlessly falls back to `InMemoryRedisClient` when `fallbackToMemory: true` (perfect for local dev and tests without a running Redis server):

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("cache-cli", "1.0.0");
const redis = app.redis("deploy-cli:", {
  url: process.env.REDIS_URL || "redis://:placeholder@127.0.0.1:6379",
  fallbackToMemory: true,
});
await redis.connect();
console.log("Using memory fallback?", redis.isMemoryFallback());

// KV, typed JSON, read-through cache, hashes, lists, sets, zsets, distributed locks & pub/sub
await redis.setJson("release:latest", { version: "2.1.0", sha: "abc1234" }, 300);
const cached = await redis.getOrSet("config:flags", async () => ({ canary: true }), 60);
await redis.withLock("migrate:prod", async () => {
  await redis.incr("migrations:count");
}, 5000);

// Child namespace sharing connection + clean teardown
const jobCache = redis.namespace("jobs:");
await jobCache.lpush("queue", "job-101");
await redis.close();

// Built-in per-app JSON state file (resolves to ~/.<app>/<fileName>; `app.config` uses ~/.config/<app>/)
const stateFile = app.getAppStateFile("cache-cli", "state.json");
app.loadState(stateFile);
app.setState("lastDeploy", new Date().toISOString());
app.saveState(stateFile);
```

---

## Step 7: Shell completions, man pages, and single-binary compilation

SimpleCLI generates shell autocomplete scripts, troff UNIX man pages, Markdown docs, standalone compiled executables, AND ships a standard library (`stdlib`) for cryptography, encodings, validation, generic collections, and statistics.

### Shell Completions, Man Pages & Native Binaries

| Feature | API / Command | Supported Options & Output |
| :--- | :--- | :--- |
| **Runtime Completions** | `--completion bash\|zsh\|fish` or `completion zsh` | Handled automatically inside `parseArgs()`/`parseCli()`! |
| **Programmatic Completions** | `app.generateCompletions(shell: "bash" \| "zsh" \| "fish" = "zsh")` | Notice plural `Completions`; returns shell completion script string (no PowerShell target built in) |
| **UNIX Man Page** | `app.generateManPage(): string` | Generates full troff `.TH` manual page from registered commands and flags |
| **Markdown Docs** | `app.generateMarkdownDocs(): string` | Generates Markdown CLI reference automatically |
| **Single-Binary Build (API)** | `await SimpleCLI.compileBinary(entrypoint, outName, target?)` | Wraps `bun build --compile` programmatically; returns `Promise<boolean>` |
| **Single-Binary Build (CLI)** | `bun build --compile app.ts --outfile my-cli` | Produces zero-runtime native binary; pass `--target=bun-linux-x64` / `bun-darwin-arm64` / `bun-windows-x64` to cross-compile |

```typescript
import { SimpleCLI, newApp } from "./src/simplecli";

const app = newApp("ops-cli", "1.0.0");
app.addFlagBool("man", "", false, "Print UNIX man page and exit");

app.command("completions", "Generate shell completions", (sub) => {
  sub.addFlagString("shell", "s", "zsh", "Target shell", ["bash", "zsh", "fish"]);
  sub.action((flags) => {
    sub.println(app.generateCompletions(flags.shell as "bash" | "zsh" | "fish"));
  });
});

if (!app.parseCli()) process.exit(0);
if (app.getFlagBool("man")) {
  app.println(app.generateManPage());
  process.exit(0);
}
// Optional programmatic compile:
// await SimpleCLI.compileBinary("app.ts", "./dist/ops-cli");
```

### Built-In `stdlib` Utilities (`src/simplecli/stdlib/index.ts`)

> **Warning – Encryption Key Hygiene:** `stdlib.aesEncrypt` uses authenticated AES-256-GCM (`<saltHex>:<base64Envelope>`). Always pass secrets from environment variables or prompt input—never commit real passphrases or API tokens in source files.

| Module Area | Verified Methods & Exported Classes (`stdlib` / named imports) |
| :--- | :--- |
| **Crypto & Tokens** | `sha256`, `sha512`, `sha1`, `md5`, `hmacSha256`, `aesEncrypt(text, key, ivHex?)`, `aesDecrypt(payload, key)`, `bcryptHash(pw: string): Promise<string>`, `bcryptVerify(pw, hash)`, `uuid()`, `uuidV7()`, `randomBytes(n)`, `randomHex(n)`, `randomToken(n)` |
| **Encodings & Parsers** | `base64Encode`/`Decode`, `hexEncode`/`Decode`, `urlEncode`/`Decode`, `rot13`, `csvParse(text, delim = ",")`, `tomlParse(tomlText)`, `humanSize`/`formatBytes`, `humanDuration`/`formatDuration`, `timeAgo`, `formatNumber` |
| **Validators** | `isEmail`, `isUrl`, `isIPv4`, `isIPv6`, `isPort`, `isSemver`, `isJson`, `isHex`, `isAlphanumeric`, `isUUID` |
| **Strings & Fuzzy Search** | `levenshteinDistance`, `jaroWinklerSimilarity`, `fuzzyMatch`, `slugify`, `truncate`, `wordWrap`, `titleCase`, `snakeCase`, `camelCase`, `kebabCase`, `padCenter` |
| **Generic Collections** | `Stack<T>`, `Queue<T>`, `SetCollection<T>` (`union`/`intersect`/`difference`), `RingBuffer<T>`, `MinHeap<T>`, `PriorityQueue<T>`, `LRUCache<K, V>` |
| **Math & Statistics** | `sum`, `mean`, `median`, `mode`, `variance`, `stddev`, `rms`, `percentile(nums, p)`, `clamp`, `lerp`, `roundPrecision` |

> Note: `stdlib` includes `csvParse` (returning `string[][]` rows including the header row) and `tomlParse` (there is no INI parser in `src/simplecli/stdlib/index.ts`).

```typescript
import { LRUCache, stdlib } from "./src/simplecli";

// Authenticated encryption & CSV/TOML parsing
const sealed = stdlib.aesEncrypt("database-connection-string", "placeholder-secret");
const plain = stdlib.aesDecrypt(sealed, "placeholder-secret");
const csvRows = stdlib.csvParse("host,port\napi.local,8080\ndb.local,5432");
const tomlObj = stdlib.tomlParse('[server]\nport = 8080\nhost = "127.0.0.1"');

// Stats, formatting, validation & bounded cache
const p95 = stdlib.percentile([12, 18, 22, 41, 195], 95);
const cache = new LRUCache<string, number>(100);
cache.set("p95", p95);

console.log({
  plainMatch: plain === "database-connection-string",
  csvCount: csvRows.length,
  tomlServer: tomlObj.server,
  sizeLabel: stdlib.humanSize(1_548_288),
  validEmail: stdlib.isEmail("ops@example.com"),
  p95: cache.get("p95"),
});
```

---

## Step 8: Pro SimpleCLI RAD tips and tricks

1. **Always Pair Interactive Prompts with Flags + TTY Checks**: Gate `select()`, `fuzzySelect()`, `form()`, and `filePicker()` behind `process.stdin.isTTY && !app.getFlagBool("yes")`, falling back to `--flag` values or safe defaults when running under CI.
2. **Use `app.output(data, { format })` Everywhere You Emit Structured Results**: Because `app.output()` switches automatically to `JSON.stringify(data, null, 2)` whenever `--json` is passed OR `!process.stdout.isTTY`, the same handler cleanly serves interactive terminal users and `| jq` scripts.
3. **Never Pass User Strings into `sys.exec*`**: `sys.exec*` invokes a shell (`shell: true`). Any untrusted branch name, commit message, path, or URL MUST go through **`rad.sysutils.execSafe(cmd, args)`** or **`Bun.spawn([...])`** with an argv array.
4. **Use `tryGet` / `tryPost` to Keep Command Handlers Flat**: Instead of nesting `try/catch` blocks for every HTTP call, check `const res = await api.tryGet<T>(path); if (!res.ok) { app.error(res.error); return; }`.
5. **Run Ephemeral `sys.serveJson(..., 0)` + `NamespacedRedis` (`fallbackToMemory: true`) in Local Dev & CI**: Binding port `0` assigns a free localhost port and memory fallback skips requiring a Redis container—giving zero-flake offline integration tests.
6. **Guard Entrypoint Execution with `if (import.meta.main)`**: Export a `createCli()` factory function and keep `await createCli().run()` inside `if (import.meta.main)` so `bun test` can import and invoke `app.parseArgs()` / `app.run()` directly.
7. **Distinguish `sys.osTmpdir()` from `sys.tempDir()`**: Call `sys.osTmpdir()` when you need the OS temp folder path, and `sys.tempDir("job_")` only when you intentionally want a new temporary directory created on disk.
8. **Use Built-In Typo & Help Hooks Instead of Custom Parsers**: Passing `"--help"`, `"-V"`, `"--completion zsh"`, or misspelled subcommands triggers built-in handlers and returns `false` from `parseArgs()`—simply exit cleanly when `parseCli()` / `run()` returns `false`.

### Headless CLI Unit Testing in `bun test`

Because **`app.parseArgs(customArgv)`** resets parsed state on every call without touching `process.argv` and **`await app.run(customArgv)`** runs subcommands deterministically, you can test CLI parsing, flag validation, and HTTP calls in milliseconds under `bun test`:

```typescript
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApiClient, newApp, sys, type SimpleCLI } from "./src/simplecli";

function createTestCli(apiBaseUrl: string): SimpleCLI {
  const app = newApp("svc-cli", "1.2.0").setSilent(true).setNoColor(true);
  app.addFlagString("env", "e", "dev", "Environment", ["dev", "prod"]);

  app.command("ping", "Probe service health", (sub) => {
    sub.addFlagInt("timeout", "t", 1500, "Timeout in ms");
    sub.action(async (flags, args) => {
      const target = args[0] ?? "/health";
      const client = createApiClient(apiBaseUrl).setTimeout(flags.timeout);
      const res = await client.tryGet<{ ok: boolean }>(target);
      if (!res.ok) throw new Error(res.error || "Health check failed");
      app.setState("lastTarget", target);
      app.setState("healthy", String(res.data?.ok ?? false));
    });
  });

  return app;
}

describe("svc-cli headless tests", () => {
  let server: ReturnType<typeof sys.serveJson>;
  let baseUrl = "";

  beforeAll(() => {
    server = sys.serveJson({ "/health": { ok: true } }, 0, "127.0.0.1");
    baseUrl = server.url.toString();
  });

  afterAll(() => server.stop(true));

  test("parseArgs validates choices and integer types without mutating process.argv", () => {
    const cli = createTestCli(baseUrl);
    expect(cli.parseArgs(["--env", "prod", "ping", "/health"])).toBe(true);
    expect(cli.getFlagString("env")).toBe("prod");

    // Invalid choice returns false cleanly
    expect(cli.parseArgs(["--env", "invalid-tier"])).toBe(false);
  });

  test("run() executes subcommand action against ephemeral mock API", async () => {
    const cli = createTestCli(baseUrl);
    const ok = await cli.run(["ping", "--timeout", "2000", "/health"]);
    expect(ok).toBe(true);
    expect(cli.getState("healthy")).toBe("true");
    expect(cli.getState("lastTarget")).toBe("/health");
  });
});
```

### Troubleshooting FAQ ("Why Did X Happen?")

1. **Why did `app.parseCli()` finish without running my `.action(...)` handler?**
   `parseCli()` and `parseArgs()` only parse argv, print `--help`/`--version`/`--completion`, and return `boolean`. Call **`await app.run()`** to parse AND execute the matched subcommand or root `.action(flags, args)`.
2. **Why did `app.addFlagString("env", "dev", "Environment")` use `"dev"` as a weird short flag?**
   Parameter #2 is **`short`** (`"e"`, or `""` for none), parameter #3 is `defaultVal`, and parameter #4 is `desc`: `app.addFlagString("env", "e", "dev", "Environment", ["dev", "prod"])`.
3. **Why did `Unknown flag '--env'` happen when I ran `bun run app.ts deploy --env prod`?**
   Flags registered on root `app` apply *before* the subcommand (`app.ts --env prod deploy`). Flags meant to follow a subcommand (`app.ts deploy --env prod`) must be registered on that child `sub` instance via `sub.addFlag*`.
4. **Why does `app.output(rows, { format: "table" })` emit JSON when piped (`| head` / `| jq` / CI)?**
   Whenever `!process.stdout.isTTY` (or `--json` is `true`), `app.output()` switches non-`"text"`/`"markdown"` formats to JSON so scripts never break on box-drawing borders or ANSI escapes.
5. **Why did Ctrl+C exit immediately with code `130`, or why did `form()` stop re-prompting in CI?**
   Raw TTY prompts (`promptPassword`, `select`, `multiSelect`, `fuzzySelect`) cleanly restore terminal mode and exit `130` (`SIGINT`) on Ctrl+C; `filePicker` returns `""`. When `stdin` is not a TTY, `form()` aborts failing `required` loops after 2 retries so pipelines never hang—always provide `--flag` / `--yes` fallbacks!
6. **Why did `TypeError: ... is not a function` happen for methods mentioned in older docs?**
   Use this exact mapping verified against `src/simplecli/`:

| Legacy / Misremembered Name | Real Verified Method in `src/simplecli/` (or `rad`) |
| :--- | :--- |
| `app.isTty()` | `Boolean(process.stdout.isTTY)` / `Boolean(process.stdin.isTTY)` |
| `app.smartOutput(rows, headers)` / `app.printJson(data)` | `app.output(data, { format: "table" \| "json" })`, `app.tableToJson()`, `app.jsonHighlight()` |
| `app.forEachWithProgress(items, label, fn)` | Standard `for` loop calling `app.progressBar(i + 1, items.length, label)` |
| `app.selectFromObjects(msg, objs, cols)` | `app.select()` or `app.fuzzySelect()` paired with a `Map<string, T>` |
| `app.enableCompletions()` / `app.generateCompletion()` | Completions (`--completion`) are automatic; generator is **`app.generateCompletions(shell)`** (plural) |
| `api.tryGetJson<T>(path)` | **`api.tryGet<T>(path)`** (parses JSON into `res.data`) |
| `sys.execSafe(argv)` | **`rad.sysutils.execSafe(cmd, args)`** (in `rad`) or **`Bun.spawn([cmd, ...args])`** |
| `sys.homeDir()` / `sys.configDir()` / `sys.expandPath()` | **`sys.osHomedir()`**, **`app.config.path`** (`ConfigStore`), **`sys.expandTilde()`** (`Prompts.expandPath`) |

---

## Complete SimpleCLI workspace template

Save this self-contained template as `app.ts` at the repo root and test it immediately:
- Interactive help: `bun run app.ts --help`
- Piped / JSON automation: `bun run app.ts deploy --env staging --yes --json`
- Man page output: `bun run app.ts --man`
- Completions: `bun run app.ts --completion zsh`

```typescript
import {
  AlertKind,
  LogLevel,
  TaskStatus,
  TreeNode,
  createApiClient,
  newApp,
  stdlib,
  sys,
  type SimpleCLI,
} from "./src/simplecli";
import { rad } from "./src/features/rad/index.ts";

export function buildDevopsCli(): SimpleCLI {
  const app = newApp("devops-rad", "2.0.0")
    .handleErrors()
    .setLogLevel(LogLevel.INFO);

  // Top-level flag (`bun run app.ts --man`)
  app.addFlagBool("man", "", false, "Print UNIX man page and exit");

  app.command("deploy", "Run end-to-end release pipeline against API & Redis", (sub) => {
    sub.addFlagString("env", "e", "staging", "Target environment", ["dev", "staging", "prod"]);
    sub.addFlagBool("json", "j", false, "Emit machine-readable JSON output");
    sub.addFlagBool("yes", "y", false, "Skip interactive prompts (CI mode)");
    sub.addFlagString("log-file", "", "", "Optional log file path");
    sub.addFlagInt("replicas", "r", 2, "Target replica count");
    sub.addFlagArray("tag", "t", ["latest"], "Container tags (repeatable)");

    sub.action(async (flags) => {
      const logFile = sub.getFlagString("log-file");
      if (logFile) sub.setLogFile(logFile);

      const jsonMode = sub.getFlagBool("json") || !process.stdout.isTTY;
      const nonInteractive = sub.getFlagBool("yes") || !process.stdin.isTTY;
      const env = sub.getFlagString("env");

      if (!nonInteractive) {
        const proceed = await sub.confirm(`Deploy ${env} with ${flags.replicas} replicas?`, true);
        if (!proceed) {
          sub.alert(AlertKind.WARNING, "Cancelled", "Deployment aborted by operator.");
          return;
        }
      }

      // Spin up local ephemeral JSON API (port 0) so template runs offline anywhere
      const mockApi = sys.serveJson(
        {
          "/health": { status: "ok", region: "us-east-1" },
          "GET /releases": () => [{ id: "rel-100", version: "1.9.0", env }],
          "POST /releases": async (req: Request) => ({ id: "rel-101", ...(await req.json()) }),
        },
        0,
        "127.0.0.1",
      );

      const api = createApiClient(mockApi.url.toString())
        .withBearer("my-api-token")
        .setRetries(2, 100);

      // Namespaced Redis with automatic in-memory fallback when no local Redis is running
      const cache = sub.redis(`devops:${env}:`, { fallbackToMemory: true });
      await cache.connect();

      try {
        const execMetric = await sub.measureAsync(async () => {
          let lastReleaseId = "";
          const checkToolchain = async () =>
            (await rad.sysutils.execSafe("bun", ["--version"])).exitCode === 0;
          const checkApiHealth = async () => {
            const health = await api.tryGet<{ status: string }>("/health");
            return health.ok && health.data?.status === "ok";
          };
          const publishRelease = async () => {
            interface Release { id: string; version: string; env: string }
            const releases = api.resource<Release, string>("/releases");
            const created = await releases.create({ version: "2.0.0", env } as Partial<Release>);
            lastReleaseId = created.id;
            await cache.setJson("release:latest", { ...created, checksum: stdlib.sha256("rel-2.0.0") }, 300);
            return Boolean(lastReleaseId);
          };

          if (jsonMode) {
            const ok = (await checkToolchain()) && (await checkApiHealth()) && (await publishRelease());
            return { ok, lastReleaseId };
          }

          const pipe = sub.newPipeline(`Release to ${env}`)
            .addStep("Safe toolchain check (shell-free execSafe)", checkToolchain)
            .addStep("Verify API health via non-throwing tryGet", checkApiHealth)
            .addStep("Publish release via typed CRUD resource", publishRelease);

          const ok = await pipe.run();
          return { ok, lastReleaseId };
        });

        const summary = {
          releaseId: execMetric.result.lastReleaseId,
          environment: env,
          replicas: flags.replicas,
          tags: sub.getFlagArray("tag"),
          pipelineOk: execMetric.result.ok,
          durationMs: Number(execMetric.durationMs.toFixed(2)),
          redisFallback: cache.isMemoryFallback(),
          hostCpuCores: sys.cpuCount(),
          ramUsedPercent: Number(sys.ramPercent().toFixed(1)),
        };

        if (jsonMode) {
          sub.output(summary, { format: "json" });
        } else {
          sub.banner("SimpleCLI DevOps RAD Summary", `${env.toUpperCase()} Rollout Complete`);
          sub.output(summary, { format: "kv", title: "Execution Metrics" });
          sub.gauge("Host RAM Utilization", summary.ramUsedPercent, 100, "%");
          sub.println("Latency trend: " + sub.sparkline([14, 18, 12, 22, 16, summary.durationMs]));

          const tree = new TreeNode("release-bundle/");
          tree.addChild("api/").addChild(`release-${summary.releaseId}.json`);
          tree.addChild("cache/").addChild("redis-key:release:latest");
          sub.tree(tree);

          sub.taskItem("Release pipeline", summary.pipelineOk ? TaskStatus.DONE : TaskStatus.FAILED, summary.durationMs);
        }
      } finally {
        await cache.close();
        mockApi.stop(true);
      }
    });
  });

  // Top-level utility flags (e.g. `bun run app.ts --man`)
  app.action((flags) => {
    if (flags.man) {
      app.println(app.generateManPage());
      return;
    }
    app.println("Run `bun run app.ts --help` to view available subcommands and flags.");
  });

  return app;
}

if (import.meta.main) {
  const cli = buildDevopsCli();
  const ok = await cli.run();
  if (!ok) process.exitCode = 1;
}
```
