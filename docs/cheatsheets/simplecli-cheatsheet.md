# SimpleCLI console and backend RAD cheat sheet

A beginner-friendly, step-by-step cheat sheet for building zero-window command-line applications, interactive terminal wizards, multi-step automation pipelines, hardware/network diagnostic tools, and REST API clients using **SimpleCLI** (`src/simplecli/`).

---

## How SimpleCLI works in 30 seconds (The 4 Golden Rules)

1. **Create the CLI app:** Call `const app = newApp("tool-name", "1.0.0")`.
2. **Register `--flags` and subcommands:** Chain `.addFlagString("env", "e", "staging", "Help text")`, `.addFlagInt(...)`, or `.addFlagBool(...)`. This automatically gives your tool `-e` / `--env`, `--help`, `--version`, and typo suggestions!
3. **Parse command-line arguments:** Call `if (!app.parseCli()) process.exit(0);` (or `app.parseArgs(argv)` in unit tests), then read values with `app.getFlagString("env")`.
4. **Use built-in terminal UI & OS helpers:** Print tables (`app.table`), ask interactive questions (`await app.select(...)`), run shell commands (`sys.execSafe(...)`), or call REST APIs (`createApiClient(...)`).

---

## Contents

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

> 📖 **Learn more:** [Architecture & Lifecycle (`CLI_API.md#1-architecture--application-lifecycle`)](../CLI_API.md#1-architecture--application-lifecycle) · [CLI Flags & Argument Parsing (`CLI_API.md#2-cli-flags--argument-parsing`)](../CLI_API.md#2-cli-flags--argument-parsing) · [Complete SimpleCLI API (`CLI_API.md`)](../CLI_API.md)

```typescript
import SimpleCLI, { newApp, LogLevel } from "../../src/simplecli";

const app = newApp("sentinel", "1.5.0")
  .setAuthor("Platform Engineering")
  .setDescription("Cluster diagnostics & deployment automation CLI")
  .setLogLevel(LogLevel.INFO)
  .handleErrors()
  .addFlagString("env", "e", "staging", "Target environment", ["dev", "staging", "prod"])
  .addFlagInt("port", "p", 8080, "Service listen port")
  .addFlagBool("dry-run", "d", false, "Simulate execution without mutating state")
  .addFlagFloat("timeout", "t", 15.0, "Request timeout in seconds")
  .addFlagArray("tag", "T", [], "Repeatable deployment tags");

// Subcommand with its own flags and async action handler
app.command("deploy", "Deploy service to target environment", (sub) => {
  sub.addFlagBool("force", "f", false, "Force rollout even if warnings exist");
  sub.action(async (flags, args) => {
    sub.success(`Deploying ${args.join(", ") || "all"} (force=${flags.force})`);
  });
});

// Parse process.argv (handles --help, --version, and Levenshtein "Did you mean...?")
if (!app.parseCli()) process.exit(0);

const env = app.getFlagString("env");
const port = app.getFlagInt("port");
const isDryRun = app.getFlagBool("dry-run");
const extraArgs = app.getPositionalArgs();

await app.run();
```

---

## Step 2: Console UI, tables, sparklines, bar charts, trees, and diffs

> 📖 **Learn more:** [Console UI & RAD Components (`CLI_API.md#3-console-ui--rad-components`)](../CLI_API.md#3-console-ui--rad-components) · [Key-Value Pairs, Tables & Smart Output (`CLI_API.md#key-value-pairs-formatted-tables--smart-output`)](../CLI_API.md#key-value-pairs-formatted-tables--smart-output) · [Unicode Sparklines (`CLI_API.md#unicode-sparklines`)](../CLI_API.md#unicode-sparklines)

```typescript
import { AlertKind, TaskStatus, TreeNode } from "../../src/simplecli";

// 1. ANSI Truecolor & Typography Helpers
app.println(app.bold(app.cyan("⚡ Sentinel Diagnostics")));
app.println(app.hex("#38bdf8", "Truecolor hex text") + " · " + app.rgb(16, 185, 129, "RGB text"));

// 2. Banners, Steps, Dividers & Framed Panels
app.banner("Sentinel CLI v1.5", "Node: prod-us-east-1");
app.step(1, "Checking Cluster Health");
app.divider("─", 60);
app.panel("Certificate Status", "TLS 1.3 active. Expires in 84 days.");

// 3. Aligned Key-Value Dictionary & Unicode Data Tables
app.printKv({
  "Host": "srv-api-01",
  "IPv4": "10.0.4.18",
  "Uptime": "14d 6h",
});

app.table(
  ["Endpoint", "Protocol", "Latency", "Status"],
  [
    ["https://api.internal/v1", "HTTP/2", "4.1 ms", app.green("200 OK")],
    ["postgres://10.0.0.5:5432", "TCP", "1.2 ms", app.green("READY")],
  ],
);

// 4. Smart TTY / JSON Output (Table in terminal, JSON when piped or --json passed)
app.output(
  [
    { service: "api", status: "healthy", latencyMs: 4.1 },
    { service: "db", status: "healthy", latencyMs: 1.2 },
  ],
  { title: "Service Matrix" },
);

// 5. Progress Bars, Spinners, Sparklines, Bar Charts & Meter Gauges
for (let i = 1; i <= 50; i++) app.progressBar(i, 50, "Syncing shards");
await app.spinner("Verifying checksums...", 400);

app.info(`Latency Trend: ${app.sparkline([10, 14, 22, 18, 45, 30, 12])}`);
app.barChart("Resource Load (%)", { "CPU Core 0": 42, "CPU Core 1": 78, "RAM": 64 }, 26);
app.gauge("DB Connections", 44, 50, "conns");

// 6. Hierarchical Tree & Unified Colorized Diff
const root = new TreeNode("production-stack");
root.addChild("api-gateway").addChild("auth-worker");
root.addChild("redis-cluster");
app.tree(root);

app.diff("replicas: 2\nenv: staging", "replicas: 6\nenv: production");

// 7. Badges, Alerts, Task Items & Terminal Markdown
app.println(`${app.badge("STATE", "READY", AlertKind.SUCCESS)} All checks green.`);
app.alert(AlertKind.INFO, "Config Loaded", "Applied 18 routing rules.");
app.taskItem("Build container image", TaskStatus.DONE, 240);
app.renderMarkdown("# Release Summary\n- **Zero** downtime\n- Fast SQLite WAL");
```

---

## Step 3: Interactive prompts, fuzzy menus, form wizards, and file picker

> 📖 **Learn more:** [Interactive Prompts & Menus (`CLI_API.md#4-interactive-prompts-menus--input-validation`)](../CLI_API.md#4-interactive-prompts-menus--input-validation) · [Select & Fuzzy Search (`CLI_API.md#single-multi-select--fuzzy-search-menus`)](../CLI_API.md#single-multi-select--fuzzy-search-menus) · [Form Wizard (`CLI_API.md#interactive-form--wizard-builder`)](../CLI_API.md#interactive-form--wizard-builder) · [File Picker (`CLI_API.md#path-validation-prompt--interactive-file-picker`)](../CLI_API.md#path-validation-prompt--interactive-file-picker)

```typescript
import { FormFieldKind, PathMode } from "../../src/simplecli";

// Validated Prompts
const user = await app.prompt("Admin username:", "admin");
const token = await app.promptPassword("API token:");
const email = await app.promptEmail("Alert email:", "ops@example.com");
const url = await app.promptUrl("Webhook URL:", "https://example.com/hook");
const workers = await app.promptNumber("Worker threads (1-64):", 8, 1, 64);
const ok = await app.confirm("Apply changes now?", false);

// Single Select, Multi-Select & Interactive Fuzzy Search
const region = await app.select("Select region:", ["us-east-1", "eu-west-1", "ap-Tokyo"]);
const features = await app.multiSelect("Enable features:", ["TLS", "Metrics", "RateLimit"]);
const branch = await app.fuzzySelect("Pick Git branch:", ["main", "feat/cli", "fix/timeout"]);

// Framed Multi-Field Console Form Wizard
const form = await app.form("Service Bootstrapper", [
  { key: "name", label: "Service Name", kind: FormFieldKind.TEXT, required: true },
  { key: "port", label: "Listen Port", kind: FormFieldKind.NUMBER, defaultVal: "3000" },
]);

// Path Validation & Terminal File Browser
const cfgPath = await app.promptPath("Config file:", "./package.json", PathMode.FILE);
const picked = await app.filePicker("Choose JSON file:", {
  baseDir: process.cwd(),
  extensions: [".json"],
});
```

---

## Step 4: Multi-step task pipelines, logging, and benchmarking

> 📖 **Learn more:** [Task Pipeline Runner (`CLI_API.md#5-multi-step-task-pipeline-runner`)](../CLI_API.md#5-multi-step-task-pipeline-runner) · [Structured Multi-Level Logging (`CLI_API.md#6-structured-multi-level-logging--file-logging`)](../CLI_API.md#6-structured-multi-level-logging--file-logging) · [Benchmark & Execution Timing (`CLI_API.md#7-benchmark--execution-timing`)](../CLI_API.md#7-benchmark--execution-timing)

```typescript
// 1. Multi-Step Pipeline Runner
const pipeline = app.newPipeline("Production Preflight");
pipeline.addStep("Clean build directory", async () => true);
pipeline.addStep("Run static analysis", async () => {
  await app.sleep(80);
  return true;
});
const passed = await pipeline.run();

// 2. Structured Multi-Level Logging
app.trace("Detailed trace");
app.debug("Pool state initialized");
app.info("Listening on :8080");
app.success("Migration applied");
app.warn("Disk usage at 81%");
app.error("Upstream timeout");

// 3. Sub-Millisecond Benchmarking
const m = app.measure(() => JSON.stringify({ ok: true }));
app.info(`Took ${m.durationMs.toFixed(3)} ms (${m.durationNs} ns)`);
```

---

## Step 5: `sys` subprocesses, hardware telemetry, network, and OS integration

> 📖 **Learn more:** [Safe Process Execution (`CLI_API.md#9-safe-process-execution--subprocess-control`)](../CLI_API.md#9-safe-process-execution--subprocess-control) · [Hardware Telemetry (`CLI_API.md#10-hardware-telemetry--resource-probing`)](../CLI_API.md#10-hardware-telemetry--resource-probing) · [OS Directories (`CLI_API.md#11-standard-os-directory-resolution--file-system`)](../CLI_API.md#11-standard-os-directory-resolution--file-system) · [Network & TCP (`CLI_API.md#12-network-wi-fi--tcp-port-diagnostics`)](../CLI_API.md#12-network-wi-fi--tcp-port-diagnostics) · [Notifications & Clipboard (`CLI_API.md#13-desktop-notifications-speech--audio-utilities`)](../CLI_API.md#13-desktop-notifications-speech--audio-utilities)

```typescript
import { sys } from "../../src/simplecli";

// Safe Subprocess Execution
const [out, code] = sys.exec("git status --short");
const branch = sys.execOr("git rev-parse --abbrev-ref HEAD", "main");
const timed = await sys.execTimeout("bun --version", 2000);
const retried = await sys.execRetry("echo ok", 3, 200);
const batch = await sys.execParallel(["echo 1", "echo 2"], 2);

// Hardware & OS Probing
const cpu = `${sys.cpuModel()} (${sys.cpuCount()} cores)`;
const [load1, load5, load15] = sys.cpuLoad();
const ramPct = sys.ramPercent();
const disk = sys.diskStats("/");

// Network & Readiness Checks
const ip = sys.localIp();
const portOpen = await sys.checkPort("127.0.0.1", 5432, 500);
const ready = await sys.waitForPort("127.0.0.1", 5432, 5000);

// Desktop Notification, TTS Speech & Clipboard
sys.notify("Sentinel", "Health check completed", true);
sys.clipboardCopy("https://localhost:8080");
```

---

## Step 6: `ApiClient` REST CRUD, non-throwing `try*` calls, and Redis

> 📖 **Learn more:** [HTTP Client & Micro-Server (`CLI_API.md#15-http-client-micro-server--rest-apis`)](../CLI_API.md#15-http-client-micro-server--rest-apis) · [Non-Throwing `try*` Calls (`CLI_API.md#unwrapped-data-fallbacks--non-throwing-try-calls`)](../CLI_API.md#unwrapped-data-fallbacks--non-throwing-try-calls) · [CRUD `api.resource<T>` (`CLI_API.md#zero-boilerplate-crud-resource-client-apiresource`)](../CLI_API.md#zero-boilerplate-crud-resource-client-apiresource) · [Reactive Store & Redis (`CLI_API.md#8-reactive-state-store-config--namespaced-redis`)](../CLI_API.md#8-reactive-state-store-config--namespaced-redis)

```typescript
import { createApiClient } from "../../src/simplecli";

const api = createApiClient("https://api.example.com/v1")
  .withBearer("my-api-key")
  .setTimeout(8000)
  .setRetries(3, 200)
  .enableCache(30_000, 128);

// Non-throwing call (returns { ok, statusCode, data, error })
const res = await api.tryGet<{ healthy: boolean }>("/status");
if (!res.ok) app.warn(`Status check failed (${res.statusCode}): ${res.error}`);

// Zero-boilerplate CRUD Resource Client
interface Item { id: number; name: string }
const items = api.resource<Item, number>("/items");
// await items.list(); await items.get(1); await items.create({ name: "Box" });

// Namespaced Redis with Automatic In-Memory Fallback
const cache = app.redis("sentinel", { fallbackToMemory: true });
await cache.connect();
const data = await cache.getOrSet("metrics", async () => ({ cpu: 12.4 }), 60);
await cache.close();
```

---

## Step 7: Shell completions, man pages, and single-binary compilation

> 📖 **Learn more:** [Shell Completions, Man Pages & Compilation (`CLI_API.md#21-shell-completions-man-pages--single-binary-compilation`)](../CLI_API.md#21-shell-completions-man-pages--single-binary-compilation) · [System Utilities Autocompletion (`SYSTEM_UTILITIES_API.md#12-shell-autocompletions-api`)](../SYSTEM_UTILITIES_API.md#12-shell-autocompletions-api) · [Releasing Binaries (`developer/releasing.md`)](../developer/releasing.md)

```typescript
// Generate Bash, Zsh, or Fish completion scripts and man pages directly from flag specs:
const bashComp = app.generateCompletion("bash");
const zshComp = app.generateCompletion("zsh");
const fishComp = app.generateCompletion("fish");
const manPage = app.generateManPage();
```

Compile any SimpleCLI script into a standalone native executable:

```bash
bun build --compile cli_apps/tokei_cli.ts --outfile tokei-bun
```

---

## Step 8: Pro SimpleCLI RAD tips and tricks

> 📖 **Learn more:** [Validation Engine (`CLI_API.md#18-validation-engine`)](../CLI_API.md#18-validation-engine) · [Collections & String Metrics (`CLI_API.md#19-generic-collections-queues--string-metrics`)](../CLI_API.md#19-generic-collections-queues--string-metrics) · [Statistical Math (`CLI_API.md#20-statistical-math-calculations`)](../CLI_API.md#20-statistical-math-calculations)

1. **Auto-Adapt Output for Terminal vs. Pipe (`smartOutput` & `output`)**: Use `app.output(records)` or `app.smartOutput(rows, headers)` so human users see a rich Unicode table in interactive terminals while CI pipelines (`my-cli --json | jq`) automatically receive clean JSON or TSV.
2. **Shell-Free Subprocess Execution (`sys.execSafe`)**: Whenever arguments come from user input or file paths with spaces, prefer `await sys.execSafe(["git", "commit", "-m", msg], { timeoutMs: 5000 })` over `sys.exec(...)` to prevent shell injection and hangs.
3. **Interactive Object Selection (`selectFromObjects`)**: Pass an array of typed records directly to `await app.selectFromObjects("Pick server:", servers, ["name", "ip", "region"])` to render an aligned multi-column selector and receive the chosen object `T` back.
4. **Automatic Progress Bar Loops (`forEachWithProgress`)**: Wrap batch jobs in `await app.forEachWithProgress(items, "Processing batch", async (item, i) => { ... })` to display a live terminal progress bar and item counter automatically.
5. **1-Line `--completions` and `--man` Support (`enableCompletions`)**: Call `app.enableCompletions()` before `app.parseArgs()` to register built-in `--completions bash|zsh|fish|powershell` and `--man` flags automatically.

---

## Complete SimpleCLI workspace template

See the complete runnable template in [`CHEATSHEET.md`](../../CHEATSHEET.md#template-2-full-featured-simplecli--rad-devops-automation-tool) and the full API documentation in [`docs/CLI_API.md`](../CLI_API.md).
