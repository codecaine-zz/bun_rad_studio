# SimpleCLI console and backend RAD cheat sheet

> **Navigation:** [Cheatsheets Hub](./index.md) · [SimpleGUI Cheat Sheet](./simplegui-cheatsheet.md) · [RAD Modules Cheat Sheet](./rad-modules-cheatsheet.md) · [Full CLI API Reference](../CLI_API.md) · [Combined Handbook](../../CHEATSHEET.md)

**SimpleCLI** is Bun RAD Studio's zero-dependency TypeScript toolkit for building **command-line tools, CI/CD automation scripts, interactive terminal wizards, backend API clients, Redis workers, and standalone compiled binaries** from `src/simplecli/`.

---

## How SimpleCLI Works in 60 Seconds

Every SimpleCLI application follows one predictable lifecycle:

1. **Create an app** with `newApp("tool-name", "1.0.0")` (or `newSimpleCLI(...)` when you want a custom help description too).
2. **Register typed flags and subcommands** (`addFlagString`, `addFlagBool`, `command(...)`, `.action(...)`). SimpleCLI handles strings, integers, floats, booleans, repeatable arrays, and `choices` enums—plus built-in `-h`/`--help`, `-V`/`--version`, `--completion <shell>`, and typo `"Did you mean ...?"` hints.
3. **Run the parser**: call `await app.run()` to parse `process.argv.slice(2)` and invoke the matched `.action(flags, args)` handler, OR call `app.parseCli()` / `app.parseArgs(argv)` when you want manual control (and deterministic headless `bun test` unit tests!).
4. **Stay dual-mode (Human TTY vs CI Pipe)**: inspect `process.stdout.isTTY`, `process.stdin.isTTY`, and `--json` / `--yes` flags so interactive terminals see styled tables, charts, and prompts while automated CI pipelines (`bun run app.ts --json | jq`) receive clean JSON without hanging on stdin.
5. **Compose batteries-included engines**: combine `newPipeline()`, shell/hardware/network helpers (`sys`), shell-free safe process arrays (`rad.sysutils.execSafe`), non-throwing HTTP CRUD (`createApiClient`), namespaced Redis with in-memory fallback (`app.redis` / `createRedisNamespace`), crypto/math/collections (`stdlib`), and single-file binary compilation (`bun build --compile`).

### CLI Execution Flow Diagram

```text
  bun run app.ts --env prod deploy --json   (or test: app.parseArgs([...]))
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

| Scenario | Where Your Script Lives | Copy-Paste Import |
| :--- | :--- | :--- |
| **A. Installed npm Package** | External project using `bun add bun-rad-studio` | `import { newApp, createApiClient, sys, stdlib, rad } from "bun-rad-studio";` |
| **B. Repository Root** | Root script such as `app.ts` in this repo | `import { newApp, createApiClient, sys, stdlib } from "./src/simplecli";` |
| **C. Subfolder Script** | File under `examples/rad_tutorial/` or `tests/sub/` | `import { newApp, createApiClient, sys, stdlib } from "../../src/simplecli";` |

> **Hub Collision Note (`bun-rad-studio` / `"./src"`):** When importing from the unified root hub (`"bun-rad-studio"` or `"./src"`), **`LRUCache`**, **`Logger`**, **`LogLevel`**, and **`TreeNode`** resolve to **SimpleCLI**, while **`writeFileAtomic`** resolves to **SimpleGUI**. Use `rad.logutils`, `rad.cacheutils.LRUCache`, and `rad.fileutils.writeFileAtomic` (or import `"./src/simplecli"` directly) whenever you want the RAD-module variants.

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

Start by creating a `SimpleCLI` instance, defining strongly typed flags (with optional single-character aliases and `choices` enums), registering subcommands, and wiring actions or standalone `parseArgs()` calls.

### App Factories & Constructors

| Helper / Method | Signature | Notes |
| :--- | :--- | :--- |
| `newApp` / `createApp` | `newApp(name: string, version = "1.0.0"): SimpleCLI` | Standard fluent app factory (both names are aliases) |
| `newSimpleCLI` / `createCLI` | `newSimpleCLI(name: string, versionOrDescription = "1.0.0", version?: string): SimpleCLI` | Pass `("my-cli", "Description text", "2.0.0")` or `("my-cli", "2.0.0")` |
| `initApp` | `initApp(): SimpleCLI` | Auto-infers app name from `process.argv[1]` basename |
| `SimpleCLI.new` / `SimpleCLI.newApp` | `SimpleCLI.new(appName: string)` · `SimpleCLI.newApp(appName: string, version: string): SimpleCLI` | Static class factories (`version` is required on static `SimpleCLI.newApp`) |

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
| `getFlagArray` | `getFlagArray(name: string): string[]` | Reads parsed `string[]` array flag |
| `getAllFlags` | `getAllFlags(): Record<string, any>` | Snapshot dictionary of every flag passed to `.action(flags, args)` |
| `getPositionalArgs` | `getPositionalArgs(): string[]` | Remaining non-flag arguments (plus tokens after `--`) |

### Subcommands, Actions & Global Error Handling

| Method | Signature | Purpose |
| :--- | :--- | :--- |
| `command` | `command(name: string, descriptionOrSetup?: string \| ((sub: SimpleCLI) => void), maybeSetup?: (sub: SimpleCLI) => void): SimpleCLI` | Creates & configures a child `SimpleCLI` subcommand (inherits `version` and `noColor`); returns the child instance |
| `action` | `action(fn: (flags: Record<string, any>, args: string[]) => void \| Promise<void>): this` | Registers execution handler for root app or subcommand |
| `run` | `run(rawArgs: string[] = process.argv.slice(2)): Promise<boolean>` | Parses `rawArgs`; if a subcommand matches, delegates to `sub.run(...)`, otherwise invokes root `.action(flags, args)` |
| `handleErrors` | `handleErrors(): this` | Installs friendly formatted handlers for uncaught exceptions and unhandled rejections |
| `formatError` | `formatError(err: unknown): string` | Formats `Error` / thrown value with optional debug stack trace |

### `app.parseCli()` vs `app.parseArgs(customArgv)` vs `app.run()`

| Feature / Behavior | `app.parseCli(rawArgs?)` | `app.parseArgs(args: string[])` | `await app.run(rawArgs?)` |
| :--- | :--- | :--- | :--- |
| **Default input** | `process.argv.slice(2)` | Explicit `string[]` you supply | `process.argv.slice(2)` |
| **Invokes `.action(flags, args)`?** | **No** (parse only) | **No** (parse only) | **Yes** (matched subcommand or root `.action`) |
| **Resets state on each call?** | Yes (resets flags & positional args) | Yes (safe to call repeatedly in tests & handlers!) | Yes |
| **Built-in `--help`/`--version`/`--completion`?** | Yes (prints & returns `false`) | Yes (prints & returns `false`) | Yes (prints & returns `false`) |
| **Validates types, missing flag values & `choices`?** | Yes (prints error & returns `false`) | Yes (prints error & returns `false`) | Yes (returns `false`, skips `.action`) |
| **Primary use case** | Imperative scripts doing `if (!app.parseCli()) return;` | **Headless `bun test` tests & embedded HTTP/script parsers** | Standard subcommand-driven CLIs |

> **Built-In Features & Flag Placement Rules:**
> - `--help` / `-h` and `--version` / `-V` / `-v` are handled inside `parseArgs()` automatically before returning `false`.
> - `--completion bash|zsh|fish` and `my-cli completion zsh` work out of the box—there is **no** `app.enableCompletions()` method.
> - **Parent vs. Subcommand Flag Scope:** Flags registered on root `app` (`app.addFlagString("env", ...)`) MUST appear **before** the subcommand (`app.ts --env prod deploy`). Flags expected **after** a subcommand (`app.ts deploy --json`) must be registered directly on the child `sub` instance (`sub.addFlagBool(...)`). Child subcommands inherit `version` and `noColor`, not parent flags.
> - **Typo Suggestions ("Did you mean ...?"):** Unknown subcommands print `Did you mean '<match>'?` and return `false`. Unknown `--flag` tokens print a suggestion when close to a registered flag and pass into `getPositionalArgs()`. Everything after `--` passes verbatim into `getPositionalArgs()`.

### Example 1A: Minimal Single-Command CLI

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("hash-tool", "1.0.0").handleErrors();

app.addFlagString("algo", "a", "sha256", "Digest algorithm", ["sha256", "sha512"]);
app.addFlagBool("upper", "u", false, "Print uppercase hex digest");

app.action(async (flags, args) => {
  const inputPath = args[0];
  if (!inputPath) {
    app.warn("Pass a file path: bun run app.ts README.md");
    return;
  }
  const bytes = await Bun.file(inputPath).bytes();
  const hex = new Bun.CryptoHasher(flags.algo).update(bytes).digest("hex");
  app.println(flags.upper ? hex.toUpperCase() : hex);
});

if (import.meta.main) {
  const ok = await app.run();
  if (!ok) process.exitCode = 1;
}
```

### Example 1B: Multi-Subcommand CLI (`init`, `scan`, `deploy`)

```typescript
import { newApp, type SimpleCLI } from "./src/simplecli";

function createWorkspaceCli(): SimpleCLI {
  const app = newApp("studio-ops", "2.1.0").handleErrors();

  // Global flags go BEFORE the subcommand: `bun run app.ts --env prod --verbose deploy`
  app.addFlagString("env", "e", "dev", "Target environment", ["dev", "staging", "prod"]);
  app.addFlagBool("verbose", "v", false, "Enable verbose diagnostics");

  app.command("init", "Scaffold project workspace", (sub) => {
    sub.addFlagString("template", "t", "minimal", "Starter preset", ["minimal", "api", "worker"]);
    sub.addFlagBool("force", "f", false, "Overwrite existing config");
    sub.action((flags, args) => {
      const targetDir = args[0] ?? ".";
      sub.printKv({ action: "init", targetDir, template: flags.template, force: flags.force });
    });
  });

  app.command("scan", "Scan files with repeatable include tags", (sub) => {
    sub.addFlagArray("ext", "x", [".ts"], "File extensions to match (repeatable)");
    sub.addFlagInt("depth", "d", 4, "Maximum directory depth");
    sub.action((flags, args) => {
      const root = args[0] ?? "src";
      sub.output({ root, extensions: sub.getFlagArray("ext"), maxDepth: flags.depth, env: app.getFlagString("env") }, { format: "kv", title: "Scan Plan" });
    });
  });

  app.command("deploy", "Deploy service release", (sub) => {
    sub.addFlagInt("replicas", "r", 2, "Replica count");
    sub.addFlagFloat("canary", "c", 0.1, "Canary traffic ratio (0.0 - 1.0)");
    sub.addFlagBool("json", "j", false, "Emit machine-readable JSON");
    sub.action((flags, args) => {
      const service = args[0] ?? "api-gateway";
      // Pass global flags BEFORE `deploy` and command flags AFTER `deploy`:
      // e.g. `bun run app.ts --env prod deploy api-gateway --replicas 4 --json`
      sub.output(
        { service, env: app.getFlagString("env"), replicas: flags.replicas, canary: flags.canary },
        { format: "kv", title: "Deploy Plan" },
      );
    });
  });

  return app;
}

if (import.meta.main) {
  const ok = await createWorkspaceCli().run();
  if (!ok) process.exitCode = 1;
}
```

### Example 1C: Standalone `parseCli()` and Non-Exiting `parseArgs()` in Scripts / HTTP Handlers

Create a fresh parser instance inside helper functions or `sys.serveJson` HTTP handlers and call `parseArgs(argv)` (or `parseCli(argv)`)—neither mutates `process.argv` nor exits the process on bad input:

```typescript
import { SimpleCLI, newApp } from "./src/simplecli";

// Pattern 1: Imperative script using `parseCli()` (`process.argv.slice(2)` by default)
function parseFromArgv(customArgv?: string[]) {
  const cli = newApp("worker", "1.0.0").setSilent(true).setNoColor(true);
  cli.addFlagInt("concurrency", "c", 4, "Worker pool size");
  cli.addFlagBool("dry-run", "d", false, "Skip mutations");
  const ok = cli.parseCli(customArgv); // parses without triggering `.action()`
  return { ok, concurrency: cli.getFlagInt("concurrency"), dryRun: cli.getFlagBool("dry-run"), targets: cli.getPositionalArgs() };
}

// Pattern 2: Embedding a safe command parser inside an HTTP route handler (never exits on invalid input)
function handleAdminCommand(rawTokens: string[]) {
  const parser = SimpleCLI.newApp("admin-rpc", "1.0.0").setSilent(true).setNoColor(true);
  parser.addFlagString("action", "a", "status", "Operation", ["status", "reload", "drain"]);
  parser.addFlagInt("timeout", "t", 5000, "Timeout in ms");

  if (!parser.parseArgs(rawTokens)) {
    return { status: 400, body: { ok: false, error: "Invalid action or integer timeout" } };
  }
  return { status: 200, body: { ok: true, flags: parser.getAllFlags(), args: parser.getPositionalArgs() } };
}

console.log("Script parse:", parseFromArgv(["--concurrency", "8", "--dry-run", "src/", "--", "--raw-arg"]));
console.log("HTTP valid:", handleAdminCommand(["--action", "reload", "--timeout", "2500", "api-1"]));
console.log("HTTP invalid:", handleAdminCommand(["--timeout", "12px"])); // fails cleanly -> status 400
```

---

## Step 2: Console UI, tables, sparklines, bar charts, trees, and diffs

SimpleCLI includes an ANSI rendering engine that honors `setNoColor(true)`, `setSilent(true)`, and non-TTY piped streams (`!process.stdout.isTTY`).

### Interactive Terminal (TTY) vs Piped CI Output (`--json` and Pipes)

| Scenario | Behavior of `app.output(data, { format, title })` |
| :--- | :--- |
| `--json` flag is `true` OR `options.format === "json"` | Prints clean `JSON.stringify(data, null, 2)` (no borders or ANSI noise) |
| `!process.stdout.isTTY` (piped / CI) AND `format` is not `"text"` or `"markdown"` | Automatically falls back to `JSON.stringify(data, null, 2)`! |
| Interactive TTY (`format: "table"`) | Renders an aligned ASCII table (`Array<Record<string, any>>` supported natively!) |
| Interactive TTY (`format: "kv"`) | Renders key-value pairs via `printKv(data)` (with optional `title` banner/step) |
| `format: "markdown"` or `"text"` | Skips auto-JSON conversion on pipes and prints strings via `println(String(data))` (call `app.renderMarkdown(md)` explicitly when you want styled Markdown rendering) |

> **Important API Clarity:** SimpleCLI does **not** have `app.isTty()`, `app.smartOutput()`, `app.printJson()`, or `app.forEachWithProgress()`. Check TTY natively with `process.stdout.isTTY` / `process.stdin.isTTY`, use **`app.output(data, { format, title })`** + **`app.tableToJson()`** + **`app.jsonHighlight()`**, and drive progress bars inside a standard `for` loop.

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

### Example 2A: Styled Boxes, Panels, Cards, KV Layouts, Badges, Alerts & Tables

```typescript
import { AlertKind, TaskStatus, newApp } from "./src/simplecli";

const app = newApp("ui-cards", "1.0.0");

app.banner("Build Dashboard", "Bun RAD Studio • Release v2.1");
app.step(1, "Status Summary");
app.println(`${app.badge("ENV", "staging", AlertKind.WARNING)} ${app.badge("REGION", "us-east-1", AlertKind.INFO)}`);
app.println(app.hex("#38bdf8", "Truecolor heading") + " • " + app.bold(app.green("All checks green")));

app.panel("Deployment Notes", "Canary rollout at 10% weight with automated rollback.");
app.card("Active Build", "commit: 94af21c\ntarget: bun-darwin-arm64");
app.printKv({ Service: "billing-api", Port: 8080, TLS: true });

app.alert(AlertKind.TIP, "CSV / Markdown Export", "Use tableToCsv() or tableToMarkdown() for CI artifacts.");
app.taskItem("Compile TypeScript bundle", TaskStatus.DONE, 218);

const headers = ["Node", "Zone", "RPM", "Healthy"];
const rows = [
  ["edge-01", "us-east", 1420, true],
  ["edge-02", "eu-west", 980, true],
];
app.table(headers, rows);
app.divider("─", 52);
app.println("Markdown snapshot:\n" + app.tableToMarkdown(headers, rows));
```

### Example 2B: Terminal Charts (`sparkline`, `barChart`, `gauge`, `TreeNode`, `diff`, `renderMarkdown`)

```typescript
import { TreeNode, newApp } from "./src/simplecli";

const app = newApp("ui-charts", "1.0.0");

// Sparkline & threshold gauge (`OK` < 75%, `WARN` >= 75%, `CRITICAL` >= 90%)
app.println("Latency (ms): " + app.cyan(app.sparkline([11, 14, 19, 48, 29, 17, 15])));
app.gauge("Memory Pressure", 78, 100, "%");
app.barChart("Requests per Route", { "/health": 1840, "/api/users": 920, "/graphql": 410 }, 24);

// Hierarchical ASCII tree
const tree = new TreeNode("bun_rad_studio/");
const src = tree.addChild("src/");
src.addChild("simplecli/index.ts");
src.addChild("simplegui.ts");
tree.addChild("tests/").addChild("simplecli_backend_client.test.ts");
app.tree(tree);

// Line-by-line unified diff + syntax-highlighted JSON + rendered Markdown
app.diff("port = 3000\ncache = false", "port = 8080\ncache = true");
app.println(app.jsonHighlight(JSON.stringify({ status: "ok", workers: 4 }, null, 2)));
app.renderMarkdown("### Release Ready\n- **Zero** type errors\n- `bun build --compile` verified");
```

### Example 2C: Dual-Mode `app.output(data, options)` (Interactive TTY vs Piped `| jq` / `--json`)

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("inventory-cli", "1.0.0");
app.addFlagBool("json", "j", false, "Force machine-readable JSON output");
if (!app.parseCli()) process.exit(0);

const services = [
  { Service: "api-gateway", Replicas: 4, LatencyMs: 14, Status: "HEALTHY" },
  { Service: "worker-pool", Replicas: 2, LatencyMs: 42, Status: "HEALTHY" },
];

// `app.output(...)` automatically switches formats:
// 1) Interactive terminal (`bun run app.ts`) -> renders an aligned Unicode table with title
// 2) Piped CI or flagged (`bun run app.ts --json | jq '.[0].Service'` or `bun run app.ts | cat`):
//    emits clean JSON array:
//    [
//      { "Service": "api-gateway", "Replicas": 4, "LatencyMs": 14, "Status": "HEALTHY" },
//      ...
//    ]
app.output(services, { format: "table", title: "Live Cluster Inventory" });

// Gate extra human-only headers/spinners behind BOTH `!flags.json` AND `process.stdout.isTTY`:
if (!app.getFlagBool("json") && process.stdout.isTTY) {
  app.dim("Tip: pass --json or pipe to `jq` for automation.");
}
```

---

## Step 3: Interactive prompts, fuzzy menus, form wizards, and file picker

SimpleCLI prompts provide TTY raw-mode navigation (arrow keys, live substring fuzzy search, directory browsing) AND automatic fallback behavior when `stdin` is piped in CI.

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

> **Real Names Note:** SimpleCLI prompt methods are named `prompt`, `promptPassword`, `promptNumber`, `filePicker`, and `form` (there are **no** `ask()`, `password()`, `number()`, `pickFile()`, `wizard()`, or `selectFromObjects()` methods).

### `FormFieldKind`, `PathMode`, and `FilePickerOptions` Reference

- **`FormFieldKind`** (`enum` or lowercase string literal):
  - `FormFieldKind.TEXT` (`"text"`) -> `prompt`
  - `FormFieldKind.NUMBER` (`"number"`) -> `promptNumber` (serialized as `string` in returned `Record<string, string>`, e.g. `"8080"`)
  - `FormFieldKind.BOOLEAN` (`"boolean"`) -> `confirm` (returns `"true"` or `"false"`)
  - `FormFieldKind.PASSWORD` (`"password"`) -> `promptPassword`
  - `FormFieldKind.SELECT` (`"select"`) -> `select(..., field.choices ?? [])`
- **`FormField` properties**: `{ key: string; label: string; kind?: FormFieldKind; defaultVal?: string; required?: boolean; choices?: string[] }`
- **`PathMode` values**: `PathMode.ANY` (default), `PathMode.MUST_EXIST`, `PathMode.FILE`, `PathMode.DIRECTORY`
- **`FilePickerOptions` properties**: `{ baseDir?: string; mode?: PathMode; extensions?: string[]; allowHidden?: boolean }`

### Ctrl+C, Non-TTY Behavior, and CI Flag Fallbacks

1. **Ctrl+C (`\u0003`) in raw TTY menus**: `promptPassword`, `select`, `multiSelect`, and `fuzzySelect` restore terminal raw mode, print a newline, and call **`process.exit(130)`** (POSIX `SIGINT`). `filePicker` resolves `""` cleanly on `q`, `Esc`, or Ctrl+C so callers can check `if (!picked)`.
2. **Non-TTY `stdin` (`CI=true`, cron, piped input)**: `select` / `multiSelect` fall back to numbered `readline` menus, `fuzzySelect` delegates to `select`, `filePicker` delegates to `promptPath`, and `form()` exits a failing `required` retry loop after **2 failed attempts**.
3. **CI-Safe Pattern**: Always pair prompts with CLI flags and `!process.stdin.isTTY || flags.yes`.

### Example 3A: Typed Scalar Prompts with Validation

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("account-setup", "1.0.0");
app.addFlagBool("yes", "y", false, "Use defaults without prompting");
if (!app.parseCli()) process.exit(0);

if (app.getFlagBool("yes") || !process.stdin.isTTY) {
  app.printKv({ owner: "ops-bot", email: "ops@example.com", port: 8080, url: "https://api.example.invalid", confirmed: true });
} else {
  const owner = await app.prompt("Service owner name", "ops-bot");
  const email = await app.promptEmail("Alert email", "ops@example.com"); // re-prompts until valid email
  const url = await app.promptUrl("Webhook endpoint", "https://api.example.invalid"); // requires http:/https:
  const port = await app.promptNumber("Port (1024-65535)", 8080, 1024, 65535); // enforces numeric bounds
  const secret = await app.promptPassword("Operator passphrase"); // masked `*` in TTY; Ctrl+C -> exit 130
  const ok = await app.confirm("Save configuration?", true);
  app.printKv({ owner, email, url, port, hasSecret: secret.length > 0, ok });
}
```

### Example 3B: Interactive `select`, `multiSelect`, `fuzzySelect` (`Map`), `filePicker` & `form` Wizard

```typescript
import { FormFieldKind, PathMode, newApp, type FilePickerOptions } from "./src/simplecli";

const app = newApp("deploy-wizard", "1.0.0");
app.addFlagString("env", "e", "", "Target environment", ["dev", "staging", "prod"]);
app.addFlagBool("yes", "y", false, "Non-interactive CI mode");
if (!app.parseCli()) process.exit(0);

const targets = [
  { id: "us-east-1", region: "Virginia", host: "10.0.1.24" },
  { id: "eu-west-1", region: "Dublin", host: "10.0.2.18" },
  { id: "ap-south-1", region: "Mumbai", host: "10.0.3.42" },
];
const targetByLabel = new Map(
  targets.map((t) => [`${t.id.padEnd(10)} | ${t.region.padEnd(9)} | ${t.host}`, t]),
);

const nonInteractive = app.getFlagBool("yes") || !process.stdin.isTTY;

if (nonInteractive) {
  app.printKv({ env: app.getFlagString("env") || "staging", cluster: targets[0]?.id ?? "us-east-1", mode: "ci-non-interactive" });
} else {
  const env = app.getFlagString("env") || (await app.select("Environment:", ["dev", "staging", "prod"], 1));
  const pickedLabel = await app.fuzzySelect("Filter target cluster:", Array.from(targetByLabel.keys()));
  const chosenTarget = targetByLabel.get(pickedLabel);
  const features = await app.multiSelect("Enable add-ons:", ["metrics", "tracing", "autoscaling"], [0, 1]);

  const pickerOpts: FilePickerOptions = { baseDir: ".", mode: PathMode.FILE, extensions: [".ts", ".json"] };
  const configFile = await app.filePicker("Pick config file (Esc/q to skip):", pickerOpts);

  const wizard = await app.form("Service Configuration Wizard", [
    { key: "service", label: "Service name", kind: FormFieldKind.TEXT, required: true, defaultVal: "api" },
    { key: "port", label: "Listen port", kind: FormFieldKind.NUMBER, defaultVal: "8080" },
    { key: "tls", label: "Enable TLS", kind: FormFieldKind.BOOLEAN, defaultVal: "true" },
    { key: "tier", label: "Plan tier", kind: FormFieldKind.SELECT, choices: ["starter", "pro"] },
    { key: "token", label: "Deploy token", kind: FormFieldKind.PASSWORD },
  ]);

  app.printKv({ env, host: chosenTarget?.host ?? "none", features: features.join(","), configFile: configFile || "(skipped)", ...wizard });
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
| `Logger` class | `new Logger(level = LogLevel.INFO, logFile?, noColor = false)` | Standalone logger (`setLevel`, `getLevel`, `setLogFile`, `setNoColor`, `trace`..`fatal`); no `.child()` method—pass a tag prefix helper for scoped subsystems |
| `setLogLevel` | `setLogLevel(level: LogLevel \| LogLevelName): this` | Sets minimum threshold written to console and log file on `SimpleCLI` |
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

### Example 4A: `spinner`, `progressBar`, and Multi-Step `newPipeline` with Error Handling

```typescript
import { newApp } from "./src/simplecli";

const app = newApp("release-runner", "1.0.0");

// 1. Live progress loop (`for` + `app.progressBar`) + async spinner
const stages = ["migrations", "assets", "schema"];
for (let i = 0; i < stages.length; i++) {
  app.progressBar(i + 1, stages.length, `Syncing ${stages[i]}`, 26);
  await Bun.sleep(40);
}
await app.spinner("Warming cache", 300);

// 2. Multi-step Pipeline that short-circuits cleanly on `false` or thrown errors
const failingPipe = app.newPipeline("Preflight Gate")
  .addStep("Check Bun version", () => true)
  .addStep("Verify signing cert", () => false) // returning false aborts immediately!
  .addStep("Deploy artifacts (skipped on failure)", () => true);

const ok = await failingPipe.run();
app.warn(`Pipeline aborted cleanly (ok=${ok})`);
```

### Example 4B: Structured `Logger`, JSONL Audit Sink & Timing Benchmark Comparison

```typescript
import * as path from "node:path";
import { LogLevel, Logger, newApp, sys } from "./src/simplecli";

const app = newApp("bench-runner", "1.0.0").setLogLevel(LogLevel.DEBUG);
const logDir = sys.tempDir("cli_logs_");
const textLog = path.join(logDir, "app.log");
const jsonlLog = path.join(logDir, "events.jsonl");

// Standalone Logger (plain-text ANSI-stripped file log) + structured JSONL event helper
const logger = new Logger(LogLevel.INFO, textLog, false);
const writeJsonlEvent = async (scope: string, msg: string, data: Record<string, unknown>) => {
  logger.info(`[${scope}] ${msg}`);
  await sys.append(jsonlLog, JSON.stringify({ ts: new Date().toISOString(), scope, msg, ...data }) + "\n");
};

// Compare pre-indexed Set lookup vs linear Array.includes with nanosecond precision
app.resetTimer();
const data = Array.from({ length: 20_000 }, (_, i) => `item-${i}`);
const indexSet = new Set(data);
const setLookup = app.measure(() => indexSet.has("item-19999"));
const arrayScan = app.measure(() => data.includes("item-19999"));

await writeJsonlEvent("benchmark", "lookup comparison", {
  setMs: Number(setLookup.durationMs.toFixed(4)),
  arrayMs: Number(arrayScan.durationMs.toFixed(4)),
});

app.barChart("Lookup Time Comparison (microseconds)", {
  "Set.has": Math.max(1, Math.round(setLookup.durationNs / 1000)),
  "Array.includes": Math.max(1, Math.round(arrayScan.durationNs / 1000)),
});
app.info(`Total runtime: ${app.elapsedMs().toFixed(2)}ms • JSONL log saved to ${jsonlLog}`);
```

---

## Step 5: `sys` subprocesses, hardware telemetry, network, and OS integration

`sys` (exported from `"./src/simplecli"` or `"bun-rad-studio"`) wraps Bun native APIs and OS commands into cross-platform static helpers.

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
> Every `sys.exec*` helper invokes a shell (`shell: true`) and **`sys.execSafe()` does NOT exist on `sys`**.
> Whenever a command includes **user input, filenames, branch names, or commit messages**, use **`rad.sysutils.execSafe(cmd, args, opts?)`** (from `"bun-rad-studio"` or `"./src/features/rad/index.ts"`) or native **`Bun.spawn([...])`**! Both pass an argv array straight to the OS kernel with zero shell interpretation, eliminating command injection.

### Example 5A: Safe Subprocesses vs Shell String Execution

```typescript
import { sys } from "./src/simplecli";
import { rad } from "./src/features/rad/index.ts";

// 1. Static trusted commands with sys.execOr / sys.execTimeout / sys.execRetry
const bunVer = sys.execOr("bun --version", "unknown");
const check = await sys.execTimeout("bun --version", 3000);
const parallel = await sys.execParallel(["bun --version", "uname -s"], 2);
console.log({ bunVer, timedOut: check.timedOut, exitCode: check.exitCode, parallelCount: parallel.length });

// 2. Dynamic / untrusted args -> ALWAYS use array args via rad.sysutils.execSafe (shell-free)
const userMessage = "fix: quote; $(whoami) safely";
const safe = await rad.sysutils.execSafe("bun", ["--version"], { cwd: process.cwd() });
// Safe commit example (array args prevent `$(...)` expansion):
// await rad.sysutils.execSafe("git", ["commit", "-m", userMessage]);
// With timeout: Bun.spawn(["git", "commit", "-m", userMessage], { signal: AbortSignal.timeout(5000) });
console.log({ safeExit: safe.exitCode, stdout: safe.stdout.trim(), userMessage });
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

### Example 5B: Hardware Telemetry & Cross-Platform OS Info

```typescript
import { newApp, stdlib, sys } from "./src/simplecli";

const app = newApp("sys-telemetry", "1.0.0");
const mem = sys.memoryInfo();
const disk = sys.diskStats(process.cwd());

app.printKv({
  OS: `${sys.osPlatform()} (${sys.osArch()}) ${sys.osRelease()}`,
  Hostname: sys.osHostname(),
  CPU: `${sys.cpuModel()} x${sys.cpuCount()} (load1=${sys.cpuLoad()[0].toFixed(2)})`,
  RAM: `${stdlib.humanSize(sys.ramUsed())} / ${stdlib.humanSize(sys.ramTotal())} (${mem.percent.toFixed(1)}%)`,
  Disk: `${stdlib.humanSize(disk.usedBytes)} / ${stdlib.humanSize(disk.totalBytes)} (${disk.percent.toFixed(1)}%)`,
  Uptime: stdlib.humanDuration(sys.osUptime() * 1000),
  Home: sys.osHomedir(),
  TmpRoot: sys.osTmpdir(),
  ConfigPath: app.config.path,
  ExpandedTilde: sys.expandTilde("~/.config"),
});
```

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

### Example 5C: TCP Port Probing, HTTP Readiness, Local IP & OS Integration

```typescript
import { sys } from "./src/simplecli";

// Start an ephemeral local HTTP service on free port 0 and probe it cleanly
const server = sys.serveJson({ "/health": { ok: true } }, 0, "127.0.0.1");
const port = server.port ?? 0;

const tcpOpen = await sys.checkPort("127.0.0.1", port, 1000);
const portReady = await sys.waitForPort("127.0.0.1", port, 3000, 50);
const httpReady = await sys.waitForHttp(`${server.url}health`, 3000, 100, 200);
const openPorts = await sys.portScan("127.0.0.1", port, port, 300);

console.log({
  localIp: sys.localIp(),
  interfacesCount: Object.keys(sys.networkInterfaces()).length,
  port,
  tcpOpen,
  portReady,
  httpReady,
  openPorts,
  hasGitBinary: sys.hasBinary("git"),
});

// Cross-platform OS clipboard & desktop toast (safe no-op if headless)
// sys.clipboardCopy(server.url.toString());
// sys.notify("Service Ready", `Listening on port ${port}`);
server.stop(true);
```

---

## Step 6: `ApiClient` REST CRUD, non-throwing `try*` calls, and Redis

SimpleCLI embeds **`BackendClient`** (also exported as **`ApiClient`**, factories **`createApiClient`** / **`createBackendClient`** / **`app.api(...)`**) alongside **`NamespacedRedis`** (`app.redis()` / `createRedisNamespace()`) and **`InMemoryRedisClient`**.

### Complete `ApiClient` Method Reference

| Group | Methods & Signatures | Return Shape / Behavior |
| :--- | :--- | :--- |
| **Auth & Reliability** | `withBearer(tok)` · `withBasicAuth(u, p)` · `withApiKey(k, hdr = "X-API-Key")` · `setTimeout(ms)` · `setRetries(n, backoffMs?, codes?)` · `enableCache(ttlMs?, max?)` · `setRateLimit(max, windowMs)` · `setVar(k, v)` | Fluent configuration returning `this` |
| **Standard Verbs** | `request`, `get`, `post`, `put`, `patch`, `delete`, `head`, `options` | `Promise<BackendResponse<T>>` (`{ ok, status, statusCode, statusText, headers, data, body, text(): string, url, durationMs, attempts, cached }`); throws `BackendApiError` on 4xx/5xx unless `setThrowOnError(false)` |
| **Unwrapped Helpers** | `getJson<T>(path, opts?)` · `postJson` · `putJson` · `patchJson` · `deleteJson` · `getText` · `getBytes` | Returns `T` directly; pass `{ fallback: defaultVal }` inside `opts: RequestOptions & { fallback?: T }` to swallow errors and return fallback |
| **Non-Throwing `try*`** | `tryRequest`, `tryGet`, `tryPost`, `tryPut`, `tryPatch`, `tryDelete` | Never throws! Resolves `SafeApiResult<T>`: `{ ok: boolean; data: T \| null; error: string \| null; statusCode: number; durationMs: number; response: BackendResponse<T> \| null }` |
| **Typed CRUD Resource** | `const users = api.resource<User, number>("/users")` | `.list(query?, opts?)`, `.get(id, query?, opts?)`, `.create(payload)`, `.update(id, payload)`, `.patch(id, payload)`, `.remove(id): Promise<boolean>`, `.action(id, "promote", body, "POST")` |
| **Interceptors & Scope** | `useRequestInterceptor(fn)` · `useResponseInterceptor(fn)` · `onError(fn)` · `scope(subPath, overrides?)` | Inject dynamic auth headers, mutate/inspect responses, centralize error logging, fork scoped clients |
| **GraphQL** | `graphql<T>(query, variables?, operationName?, endpointPath = "/graphql", options?)` | Returns `GraphQLResult<T>` (`{ ok, data, errors, statusCode, headers, durationMs }`) |
| **Pagination** | `paginate<T>(path, opts?: PaginationOptions): AsyncGenerator<T[]>` · `fetchAllPages<T>(path, opts?): Promise<T[]>` | Streams pages or collects all records across `"page"`, `"offset"`, `"cursor"`, and RFC 8288 `"link"` headers |
| **Streaming** | `streamSse(path, onEvent, opts?)` · `streamLines(path, onLine, opts?)` · `streamJsonLines<T>(path, onItem, opts?)` | Incremental NDJSON, line-by-line logs, and Server-Sent Events (`SseEvent`) |
| **Forms & Files** | `postForm(path, form)` · `upload(targetPath, files, fields = {}, options?)` · `download(targetPath, destPath, onProgress?, options?)` | URL-encoded forms, `multipart/form-data` (`files` + separate `fields`), binary download to disk |
| **Ops & Diagnostics** | `healthCheck(path = "/health", expectedStatus = 200)` · `waitForReady(path = "/health", timeoutMs = 10000, intervalMs = 200)` · `probeEndpoints(paths[])` · `batch(reqs, concurrency)` · `benchmark(path, opts)` · `toCurl(method, path, opts?)` · `BackendClient.fromCurl(cmd)` | Operational checks, concurrent request batches, latency percentile stats (`p50`/`p95`/`p99`), cURL generation/import |

> **Non-Throwing Tip (`tryGet` vs `tryGetJson`):** Use **`api.tryGet<Release>("/releases/latest")`** (which parses JSON automatically into `res.data`)—there is **no** `tryGetJson()` method.

### Example 6A: `ApiClient` Bearer Auth, Retries, Typed CRUD (`get`, `post`, `put`, `delete`) & Non-Throwing `tryGet` / `tryPost`

```typescript
import { createApiClient, sys } from "./src/simplecli";

interface Item { id: number; name: string; role: string }
const store = new Map<number, Item>([[1, { id: 1, name: "worker-a", role: "runner" }]]);
let nextId = 2;

const server = sys.serveJson(
  {
    "/health": { ok: true },
    "GET /items": () => Array.from(store.values()),
    "GET /items/:id": (_req: Request, params: Record<string, string>) =>
      store.get(Number(params.id)) ?? new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
    "POST /items": async (req: Request) => {
      const created = { id: nextId++, ...(await req.json()) } as Item;
      store.set(created.id, created);
      return new Response(JSON.stringify(created), { status: 201, headers: { "Content-Type": "application/json" } });
    },
    "PUT /items/:id": async (req: Request, params: Record<string, string>) => {
      const updated = { id: Number(params.id), ...(await req.json()) } as Item;
      store.set(updated.id, updated);
      return updated;
    },
    "DELETE /items/:id": (_req: Request, params: Record<string, string>) => ({ deleted: store.delete(Number(params.id)) }),
  },
  0,
  "127.0.0.1",
);

const api = createApiClient(server.url.toString())
  .withBearer("your-api-token") // placeholder token
  .setTimeout(5000)
  .setRetries(2, 100);

// 1. Non-throwing `tryGet` & `tryPost` (never throws on 404/5xx or network error)
const missing = await api.tryGet<Item>("/items/999");
if (!missing.ok) console.log("Handled 404 safely:", missing.statusCode, missing.error);

const postSafe = await api.tryPost<Item>("/items", { name: "worker-b", role: "builder" });
console.log("Created via tryPost:", postSafe.ok, postSafe.data);

// 2. Direct verb calls (`get`, `put`, `delete`) + typed `api.resource()` CRUD
const fetched = await api.get<Item>(`/items/${postSafe.data!.id}`);
await api.put<Item>(`/items/${fetched.data.id}`, { name: "worker-b-v2", role: "primary" });

const items = api.resource<Item, number>("/items");
const allItems = await items.list();
const removed = await items.remove(fetched.data.id);
console.log({ countBeforeDelete: allItems.length, deleted: removed });

server.stop(true);
```

### Example 6B: Interceptors, Scoped Clients, GraphQL, Pagination, SSE Streaming & `toCurl()`

```typescript
import { createApiClient, sys } from "./src/simplecli";

const server = sys.serveJson(
  {
    "GET /v1/events": () =>
      new Response('id: 1\nevent: deploy\ndata: {"step":"done"}\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    "POST /v1/graphql": async (req: Request) => {
      const payload = (await req.json()) as { variables?: { app?: string } };
      return { data: { release: { app: payload.variables?.app ?? "api", status: "ACTIVE" } } };
    },
    "GET /v1/logs": (req: Request) => {
      const page = Number(new URL(req.url).searchParams.get("page") ?? "1");
      return { items: page === 1 ? ["boot", "ready"] : [], page, total: 2 };
    },
  },
  0,
  "127.0.0.1",
);

const rootClient = createApiClient(server.url.toString())
  .withApiKey("your-api-key")
  .enableCache(30_000, 128)
  .setRateLimit(25, 1000)
  .useRequestInterceptor((ctx) => {
    ctx.headers["X-Trace-Id"] = "trace-001";
    return ctx;
  })
  .onError((err, ctx) => console.error(`API fail on ${ctx.method} ${ctx.url}:`, err.message));

const v1 = rootClient.scope("/v1");
const gql = await v1.graphql<{ release: { app: string; status: string } }>(
  "query GetRelease($app: String!) { release(app: $app) { app status } }",
  { app: "studio" },
  "GetRelease",
);
const logs = await v1.fetchAllPages<string>("/logs", { mode: "page", pageSize: 2, maxPages: 3 });

const sseEvents: string[] = [];
await v1.streamSse("/events", (ev) => {
  sseEvents.push(`${ev.event}:${JSON.stringify(ev.json())}`);
});

console.log({
  gql: gql.data,
  logs,
  sseEvents,
  curlSnippet: v1.toCurl("POST", "/graphql", { body: { query: "{ health }" }, redactSecrets: true }),
});

server.stop(true);
```

### Example 6C: Namespaced Redis (`app.redis` / `createRedisNamespace`) Cache-Aside with In-Memory Fallback & App State

> **Redis Factory Note:** SimpleCLI creates Redis clients via **`app.redis(namespace, options)`** or **`createRedisNamespace(namespace, options)`** (or `new InMemoryRedisClient()`)—there is **no** `createRedisClient()` function or `src/features/redis/` folder. When `fallbackToMemory: true` is passed and Redis is offline, all operations transparently use `InMemoryRedisClient`.

```typescript
import { createRedisNamespace, newApp } from "./src/simplecli";

const app = newApp("cache-cli", "1.0.0");

// Connects to Redis if available, or falls back automatically to InMemoryRedisClient
const redis = app.redis("deploy-cli:", {
  url: process.env.REDIS_URL || "redis://:placeholder@127.0.0.1:6379",
  fallbackToMemory: true,
});
await redis.connect();
console.log("Memory fallback active?", redis.isMemoryFallback());

// 1. Cache-aside JSON + TTL strings (`set(key, val, { ex: seconds })` or numeric TTL seconds)
await redis.set("session:latest", "active", { ex: 60 });
await redis.setJson("release:latest", { version: "2.1.0", sha: "94af21c" }, 300);
const flags = await redis.getOrSet("config:flags", async () => ({ canary: true }), 60);

// 2. Hashes, Lists, Sets, Distributed Locks & Sub-Namespaces
await redis.hset("node:edge-01", { region: "us-east", status: "healthy" });
const nodeMeta = await redis.hgetall("node:edge-01");

const queue = createRedisNamespace("workers:", { fallbackToMemory: true });
await queue.connect();
await queue.lpush("jobs", "job-101");
await queue.sadd("tags", "bun", "rad");
const job = await queue.rpop("jobs");
const tags = await queue.smembers("tags");

await redis.withLock("migrate:prod", async () => {
  await redis.incr("migrations:count");
}, 5000);

console.log({ flags, nodeMeta, job, tags });
await queue.close();
await redis.close();

// 3. Built-in per-app JSON state file (resolves to ~/.<app>/<fileName>; `app.config` uses ~/.config/<app>/)
const stateFile = app.getAppStateFile("cache-cli", "state.json");
app.loadState(stateFile);
app.setState("lastDeploy", new Date().toISOString());
app.saveState(stateFile);
```

---

## Step 7: Shell completions, man pages, and single-binary compilation

SimpleCLI generates shell autocomplete scripts, troff UNIX man pages, Markdown docs, standalone compiled executables, AND ships built-in **`stdlib`** utilities (`src/simplecli/stdlib/index.ts`).

### Shell Completions, Man Pages & Native Binaries

| Feature | API / Command | Supported Options & Output |
| :--- | :--- | :--- |
| **Runtime Completions** | `--completion bash\|zsh\|fish` or `completion zsh` | Handled automatically inside `parseArgs()`/`parseCli()`! |
| **Programmatic Completions** | `app.generateCompletions(shell: "bash" \| "zsh" \| "fish" = "zsh")` | Notice plural `Completions`; returns shell completion script string (no PowerShell target built in) |
| **UNIX Man Page** | `app.generateManPage(): string` | Generates full troff `.TH` manual page from registered commands and flags |
| **Markdown Docs** | `app.generateMarkdownDocs(): string` | Generates Markdown CLI reference automatically |
| **Single-Binary Build (API)** | `await SimpleCLI.compileBinary(entrypoint, outName, target?)` | Wraps `bun build --compile` programmatically; returns `Promise<boolean>` |
| **Single-Binary Build (CLI)** | `bun build --compile app.ts --outfile my-cli` | Produces zero-runtime native binary; pass `--target=bun-linux-x64` / `bun-darwin-arm64` / `bun-windows-x64` to cross-compile |

### Example 7A: Programmatic Completions, UNIX Man Page & `compileBinary`

```typescript
import { SimpleCLI, newApp } from "./src/simplecli";

const app = newApp("ops-cli", "1.0.0");
app.addFlagBool("man", "", false, "Print UNIX man page and exit");
app.addFlagBool("docs", "", false, "Print Markdown CLI docs and exit");

app.command("completions", "Generate shell completions", (sub) => {
  sub.addFlagString("shell", "s", "zsh", "Target shell", ["bash", "zsh", "fish"]);
  sub.action((flags) => {
    sub.println(app.generateCompletions(flags.shell as "bash" | "zsh" | "fish"));
  });
});

if (import.meta.main) {
  if (!app.parseCli()) process.exit(0);
  if (app.getFlagBool("man")) {
    app.println(app.generateManPage());
    process.exit(0);
  }
  if (app.getFlagBool("docs")) {
    app.println(app.generateMarkdownDocs());
    process.exit(0);
  }
  // Optional programmatic binary compilation:
  // await SimpleCLI.compileBinary("app.ts", "./dist/ops-cli");
  await app.run();
}
```

### Example 7B: CLI Completion Install & Standalone Binary Cross-Compilation (`bash`)

```bash
# Install zsh or bash autocompletions directly from your CLI
bun run app.ts --completion zsh > ~/.zsh/completions/_app
bun run app.ts --completion bash > ~/.local/share/bash-completion/completions/app

# Compile zero-runtime native single-file executables
bun build --compile app.ts --outfile my-cli
bun build --compile --target=bun-linux-x64 app.ts --outfile my-cli-linux
bun build --compile --target=bun-darwin-arm64 app.ts --outfile my-cli-macos
```

### Built-In `stdlib` Utilities (`src/simplecli/stdlib/index.ts`)

> **Warning – Encryption Key Hygiene:** `stdlib.aesEncrypt` uses authenticated AES-256-GCM (`<saltHex>:<base64Envelope>`). Always supply passphrases via environment variables or interactive prompts—never commit real secrets or API keys in source files.

| Module Area | Verified Methods & Exported Classes (`stdlib` / named imports) |
| :--- | :--- |
| **Crypto & Tokens** | `sha256`, `sha512`, `sha1`, `md5`, `hmacSha256`, `aesEncrypt(text, key, ivHex?)`, `aesDecrypt(payload, key)`, `bcryptHash(pw: string): Promise<string>`, `bcryptVerify(pw, hash)`, `uuid()`, `uuidV7()`, `randomBytes(n)`, `randomHex(n)`, `randomToken(n)` |
| **Encodings & Parsers** | `base64Encode`/`Decode`, `hexEncode`/`Decode`, `urlEncode`/`Decode`, `rot13`, `csvParse(text, delim = ",")` (returns `string[][]`), `tomlParse(tomlText)`, `humanSize`/`formatBytes`, `humanDuration`/`formatDuration`, `timeAgo`, `formatNumber` |
| **Validators** | `isEmail`, `isUrl`, `isIPv4`, `isIPv6`, `isPort`, `isSemver`, `isJson`, `isHex`, `isAlphanumeric`, `isUUID` |
| **Strings & Fuzzy Search** | `levenshteinDistance`, `jaroWinklerSimilarity`, `fuzzyMatch`, `slugify`, `truncate`, `wordWrap`, `titleCase`, `snakeCase`, `camelCase`, `kebabCase`, `padCenter` |
| **Generic Collections** | `Stack<T>`, `Queue<T>`, `SetCollection<T>` (`union`/`intersect`/`difference`), `RingBuffer<T>`, `MinHeap<T>`, `PriorityQueue<T>`, `LRUCache<K, V>` |
| **Math & Statistics** | `sum`, `mean`, `median`, `mode`, `variance`, `stddev`, `rms`, `percentile(nums, p)`, `clamp`, `lerp`, `roundPrecision` |

> **Where Do Filesystem, Globs, `.env`, Paths, Retry & Concurrency Live?** `stdlib` covers crypto, encodings/CSV/TOML, validators, strings, collections, and stats math—it does **not** have `stdlib.fsx`, `stdlib.glob`, `stdlib.pathx`, or `stdlib.dotenv`. For those, use **`sys`** (`readText`, `writeJson`, `findFiles`, `semverSatisfies`), **`node:path`** (`join`, `resolve`), and **`rad`** (`rad.globutils`, `rad.envutils`, `rad.flowutils.retry`, `rad.asyncutils.parallelMap`, `rad.fileutils`) as shown in Example 7D.

### Example 7C: `stdlib` Crypto, Encodings, Validation, Text Matching, Collections & Stats

```typescript
import { LRUCache, PriorityQueue, stdlib } from "./src/simplecli";

// Crypto: AES-256-GCM authenticated encryption, HMAC-SHA256 & bcrypt password verification
const sealed = stdlib.aesEncrypt("database-connection-string", "placeholder-secret");
const unsealed = stdlib.aesDecrypt(sealed, "placeholder-secret");
const sig = stdlib.hmacSha256("webhook-payload", "placeholder-secret");
const pwHash = await stdlib.bcryptHash("example-password");
const pwValid = await stdlib.bcryptVerify("example-password", pwHash);

// Encodings, validation & fuzzy text matching
const csvRows = stdlib.csvParse("host,port\napi.local,8080\ndb.local,5432");
const tomlObj = stdlib.tomlParse('[server]\nport = 8080\nhost = "127.0.0.1"');
const p95 = stdlib.percentile([12, 18, 22, 41, 195], 95);

// Generic PriorityQueue & bounded LRUCache
const pq = new PriorityQueue<string>();
pq.enqueue("low-priority-report", 10);
pq.enqueue("critical-alert", 1);

const cache = new LRUCache<string, number>(64);
cache.set("p95", p95);

console.log({
  unsealedOk: unsealed === "database-connection-string",
  sigPrefix: sig.slice(0, 12),
  pwValid,
  csvRowsCount: csvRows.length,
  tomlServer: tomlObj.server,
  validators: { email: stdlib.isEmail("ops@example.com"), semver: stdlib.isSemver("2.1.0"), uuid: stdlib.isUUID(stdlib.uuidV7()) },
  fuzzy: stdlib.fuzzyMatch("dply", "deploy-worker"),
  nextJob: pq.dequeue(),
  p95: cache.get("p95"),
});
```

### Example 7D: Full CLI Automation Utilities Recipe (`sys` FS/Semver + `rad.globutils` + `rad.envutils` + `rad.flowutils.retry` + `rad.asyncutils.parallelMap`)

```typescript
import * as path from "node:path";
import { stdlib, sys } from "./src/simplecli";
import { rad } from "./src/features/rad/index.ts";

// 1. Parse `.env` text cleanly (`rad.envutils.parseEnvString` / `loadEnv`) + `node:path`
const envVars = rad.envutils.parseEnvString("PORT=8080\nLOG_LEVEL=info\nAPI_TOKEN=your-api-token");
const configDir = path.join(sys.osTmpdir(), "cli-rad-demo");
sys.ensureDir(configDir);

// 2. Native Bun.Glob discovery (`rad.globutils.findFiles`) + semver compatibility guard (`sys.semverSatisfies`)
const tsFiles = await rad.globutils.findFiles("src/simplecli/**/*.ts", process.cwd());
const bunCompatible = sys.semverSatisfies(sys.bunVersion(), ">=1.0.0");

// 3. Concurrency-limited processing (`rad.asyncutils.parallelMap`) with exponential retry (`rad.flowutils.retry`)
const sizes = await rad.asyncutils.parallelMap(tsFiles.slice(0, 5), 3, async (relPath) => {
  return await rad.flowutils.retry(async () => {
    const absPath = path.resolve(process.cwd(), relPath);
    return { file: relPath, bytes: sys.fileSize(absPath) };
  }, 2, 50);
});

const totalBytes = stdlib.sum(sizes.map((s) => s.bytes));
console.log({ parsedPort: Number(envVars.PORT), bunCompatible, sampleFiles: sizes.length, totalBytes: stdlib.humanSize(totalBytes) });
```

---

## Step 8: Pro SimpleCLI RAD tips and tricks

1. **Always Pair Interactive Prompts with Flags + TTY Checks**: Gate `select()`, `fuzzySelect()`, `form()`, and `filePicker()` behind `process.stdin.isTTY && !sub.getFlagBool("yes")`, falling back to `--flag` values or safe defaults in CI.
2. **Use `app.output(data, { format })` Everywhere You Emit Structured Results**: Because `app.output()` switches automatically to `JSON.stringify(data, null, 2)` whenever `--json` is passed OR `!process.stdout.isTTY`, the same handler cleanly serves interactive terminals and `| jq` scripts.
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
6. **Why did `TypeError: ... is not a function` happen for conceptual or legacy helper names?**
   Use this exact mapping verified against `src/simplecli/` and `src/features/rad/`:

| Legacy / Conceptual Name | Real Verified Method in `src/simplecli/` (or `rad`) |
| :--- | :--- |
| `app.isTty()` | `Boolean(process.stdout.isTTY)` / `Boolean(process.stdin.isTTY)` |
| `app.smartOutput(rows, headers)` / `app.printJson(data)` | `app.output(data, { format: "table" \| "json" })`, `app.tableToJson()`, `app.jsonHighlight()` |
| `app.forEachWithProgress(items, label, fn)` | Standard `for` loop calling `app.progressBar(i + 1, items.length, label)` |
| `app.selectFromObjects(msg, objs, cols)` | `app.select()` or `app.fuzzySelect()` paired with a `Map<string, T>` |
| `app.ask` / `password` / `number` / `pickFile` / `wizard` | `app.prompt()`, `app.promptPassword()`, `app.promptNumber()`, `app.filePicker()`, `app.form()` |
| `TaskPipeline` / `BenchmarkSuite` / `Logger.child` | `app.newPipeline()`, `app.measure()` / `measureAsync()`, separate `new Logger()` instances or tagged prefix helpers |
| `createRedisClient()` | `app.redis(ns, { fallbackToMemory: true })` / `createRedisNamespace(...)` / `new InMemoryRedisClient()` |
| `stdlib.fsx` / `glob` / `pathx` / `dotenv` | `sys` (`readText`, `writeJson`, `findFiles`), `rad.globutils`, `node:path`, `rad.envutils` |
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
        .withBearer("your-api-token")
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
