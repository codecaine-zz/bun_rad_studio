# SimpleCLI: Headless Console & RAD Toolkit for Bun

`SimpleCLI` (`src/simplecli/`) is a comprehensive, zero-window console utility framework and Rapid Application Development (RAD) toolkit for Bun and TypeScript. It brings cross-platform OS system calls, hardware resource monitoring, desktop notifications, speech synthesis, standard path resolvers, cryptography, HTTP client utilities, generic data structures, string similarity metrics, multi-level logging, CLI flag & subcommand parsing, shell completion generators, and persistent configuration stores directly to command-line utilities and automation scripts without requiring a graphical window backend.

> [!NOTE]
> **Related Guides:** See also the [System Utilities & Standard Library Reference](./SYSTEM_UTILITIES_API.md) for the GUI-integrated `App` equivalents and the [Full API Reference](./API.md) for the complete studio catalog.

---

## Table of Contents

1. [Architecture & Application Lifecycle](#1-architecture--application-lifecycle)
2. [CLI Flags & Argument Parsing](#2-cli-flags--argument-parsing)
3. [Console UI & RAD Components](#3-console-ui--rad-components)
4. [Interactive Prompts, Menus & Input Validation](#4-interactive-prompts-menus--input-validation)
5. [Multi-Step Task Pipeline Runner](#5-multi-step-task-pipeline-runner)
6. [Structured Multi-Level Logging & File Logging](#6-structured-multi-level-logging--file-logging)
7. [Benchmark & Execution Timing](#7-benchmark--execution-timing)
8. [Reactive State Store, Config & Namespaced Redis](#8-reactive-state-store-config--namespaced-redis)
9. [Safe Process Execution & Subprocess Control](#9-safe-process-execution--subprocess-control)
10. [Hardware Telemetry & Resource Probing](#10-hardware-telemetry--resource-probing)
11. [Standard OS Directory Resolution & File System](#11-standard-os-directory-resolution--file-system)
12. [Network, Wi-Fi & TCP Port Diagnostics](#12-network-wi-fi--tcp-port-diagnostics)
13. [Desktop Notifications, Speech & Audio Utilities](#13-desktop-notifications-speech--audio-utilities)
14. [System Clipboard & OS URL / File Openers](#14-system-clipboard--os-url--file-openers)
15. [HTTP Client, Micro Server & REST APIs](#15-http-client-micro-server--rest-apis)
16. [Cryptography, Hashing & Random Utilities](#16-cryptography-hashing--random-utilities)
17. [Encodings, Data Formats & Serialization](#17-encodings-data-formats--serialization)
18. [Validation Engine](#18-validation-engine)
19. [Generic Collections, Queues & String Metrics](#19-generic-collections-queues--string-metrics)
20. [Statistical Math Calculations](#20-statistical-math-calculations)
21. [Shell Completions, Man Pages & Single-Binary Compilation](#21-shell-completions-man-pages--single-binary-compilation)
22. [Type, Struct & Enum Reference Index](#22-type-struct--enum-reference-index)

---

## 1. Architecture & Application Lifecycle

### Constructors

```ts
import SimpleCLI, { newApp, createApp, initApp } from "../src/simplecli";

// Standard constructor
const app1 = SimpleCLI.new("MyTool");

// Constructor with explicit version
const app2 = newApp("DeployPilot", "2.1.0");
const app3 = createApp("DeployPilot", "2.1.0");

// Quick default constructor (infers app name from process.argv[1])
const app4 = initApp();
```

### Configuration & Fluent Setup

```ts
import { SimpleCLI, LogLevel } from "../src/simplecli";

const app = SimpleCLI.new("Sentinel")
  .setVersion("1.5.0")
  .setAuthor("DevOps Core Team")
  .setDescription("High-performance endpoint guardian & telemetry reporter")
  .setDebug(true)
  .setNoColor(false)
  .setSilent(false)
  .setLogLevel(LogLevel.INFO)
  .setLogFile("/tmp/sentinel.log")
  .handleErrors();
```

---

## 2. CLI Flags & Argument Parsing

Define typed CLI flags with long names, short aliases, default values, optional choice constraints, and subcommands:

```ts
import { newApp } from "../src/simplecli";

const app = newApp("Migrator", "2.0.0")
  .setDescription("Database schema migration and verification tool")
  .addFlagString("config", "c", "app.config.json", "Path to JSON configuration")
  .addFlagInt("port", "p", 5432, "Target database port")
  .addFlagBool("dry-run", "d", false, "Simulate execution without modifying state")
  .addFlagFloat("timeout", "t", 30.0, "Network timeout in seconds")
  .addFlagArray("tag", "T", [], "Repeatable deployment tags");

// Optional subcommands with dedicated flags and action handlers
app.command("up", "Apply all pending migrations", (sub) => {
  sub.addFlagBool("force", "f", false, "Force migration even if dirty");
  sub.action(async (flags, args) => {
    sub.success(`Applying migrations (force=${flags.force}) for targets: ${args.join(", ")}`);
  });
});

// Parse command line arguments from process.argv.slice(2)
if (!app.parseCli()) {
  // Automatically outputs flag usage or version if --help/-h or --version/-v was passed
  process.exit(0);
}

// Access parsed flag values
const cfgFile = app.getFlagString("config");
const dbPort = app.getFlagInt("port");
const isDryRun = app.getFlagBool("dry-run");
const timeout = app.getFlagFloat("timeout");
const tags = app.getFlagArray("tag");
const extraArgs = app.getPositionalArgs();

// Or execute subcommands and registered action handler asynchronously
await app.run();
```

Custom argument slices can also be parsed directly via `app.parseArgs(args)`:

```ts
app.parseArgs(["--config", "custom.json", "--port", "8080", "deploy", "target1"]);
```

Unknown commands or flags automatically compute Levenshtein similarity via `app.suggestMatch(input, choices)` and print a helpful `"Did you mean ...?"` hint.

---

## 3. Console UI & RAD Components

### Terminal ANSI Styling

```ts
app.print("Inline output without newline: ");
app.println(app.bold("Bold headline text"));
app.println(app.dim("Muted debug commentary"));
app.println(app.italic("Italicized note"));
app.println(app.underline("Underlined link"));
app.println(app.green("✓ All 48 tests passed successfully"));
app.println(app.cyan("ℹ Connecting to database cluster..."));
app.println(app.yellow("⚠ High disk usage detected"));
app.println(app.red("✖ Fatal connection drop"));
app.println(app.blue("⚡ Initializing thread pool"));
app.println(app.magenta("◆ Deployment tag v2.4.0"));
app.println(app.rgb(56, 189, 248, "Truecolor RGB text"));
app.println(app.hex("#38bdf8", "Truecolor Hex text"));
app.println(app.hsl(199, 89, 60, "Truecolor HSL text"));
```

### Steps, Dividers, Banners & Panels

```ts
// Step indicator with number and title
app.step(1, "Compiling Native Binaries");
app.step(2, "Running Static Analysis Checks");

// Horizontal dividers
app.divider("─", 60);
app.divider("=", 80);

// Header banner with title and subtitle
app.banner("Sentinel Infrastructure Pilot", "Production Node 04 - us-east-1");

// Framed panel with bordered title
app.panel("Cluster Health", "All 12 nodes reporting healthy heartbeat (RTT < 4ms).");

// Card style panel (alias for panel)
app.card("Security Status", "TLS 1.3 Strict Mode enforced. Certificates valid for 84 days.");
```

### Key-Value Pairs, Formatted Tables & Smart Output

```ts
// Output aligned key-value status dictionary
app.printKv({
  "Host Name": "srv-prod-api-01",
  "IP Address": "10.0.4.18",
  Architecture: "aarch64 (Apple Silicon)",
  Uptime: "14 days, 6 hours",
});

// Output formatted data grid with aligned column widths and Unicode box borders
app.table(
  ["Endpoint", "Protocol", "Latency", "Status"],
  [
    ["https://api.internal/v1", "HTTP/2", "12.4 ms", "200 OK"],
    ["https://auth.internal", "HTTP/2", "8.1 ms", "200 OK"],
    ["postgres://10.0.0.5:5432", "TCP", "1.2 ms", "CONNECTED"],
    ["redis://10.0.0.9:6379", "TCP", "0.4 ms", "CONNECTED"],
  ],
);

// Smart output: renders a table/KV in interactive TTY, or JSON when piped / --json is set
app.output(
  [
    { service: "api", status: "healthy", latencyMs: 12.4 },
    { service: "auth", status: "healthy", latencyMs: 8.1 },
  ],
  { title: "Service Health" },
);
```

### Dynamic Progress Bars & Spinners

```ts
// Render progress bars in long-running loops
const totalItems = 100;
for (let i = 1; i <= totalItems; i++) {
  app.progressBar(i, totalItems, "Migrating database tables");
  await app.sleep(10);
}

// Display animated terminal spinner during async operations
await app.spinner("Synchronizing repository submodules...", 1200);
```

### Unicode Sparklines

Render inline high-density trend visualizations using Unicode block elements (` ▂▃▄▅▆▇█`):

```ts
const latencies = [12, 15, 45, 90, 120, 80, 30, 14];
const spark = app.sparkline(latencies);
app.info(`Latency Trend (last 8 ticks): ${spark}`);
```

### Horizontal Bar Charts

Visualize distributions, resource utilization, or benchmark comparative results:

```ts
app.barChart(
  "Resource Allocation (%)",
  {
    "CPU Core 0": 42.5,
    "CPU Core 1": 89.0,
    Memory: 64.2,
    "Disk /": 23.8,
  },
  30,
);
```

### Meter Gauges

Display single-metric gauges with automatic `OK` / `WARN` / `CRITICAL` threshold badges:

```ts
app.gauge("PostgreSQL Connection Pool", 48, 50, "conns");
app.gauge("Storage Capacity", 34.2, 100, "GB");
```

### Hierarchical Tree Visualizer

Render nested dependency graphs, filesystem trees, or structured schemas with Unicode branch glyphs (`├──`, `└──`, `│   `):

```ts
import { TreeNode } from "../src/simplecli";

const root = new TreeNode("production-cluster");
const db = root.addChild("postgres-db");
db.addChild("replica-01 (read-only)");
db.addChild("replica-02 (standby)");
root.addChild("redis-cache");
const api = root.addChild("api-gateway");
api.addChild("auth-service");
api.addChild("payment-service");
root.addNode(new TreeNode("monitoring-agent"));

app.tree(root);
```

### Colorized Line Diff Viewer

Generate and display unified line-by-line diffs with colored change annotations:

```ts
const oldConfig = "port: 8080\nworkers: 4\nenv: staging";
const newConfig = "port: 8080\nworkers: 8\nenv: production\ntls: true";

// Output colorized line diff to console:
app.diff(oldConfig, newConfig);

// Or retrieve formatted diff string:
const diffText = app.diffText(oldConfig, newConfig);
```

### Status Badges & Alert Callout Boxes

```ts
import { AlertKind } from "../src/simplecli";

// Inverted status badges
const prodBadge = app.badge("ENV", "PRODUCTION", AlertKind.WARNING);
app.println(`${prodBadge} Initializing migration sequence...`);

// Styled alert boxes (INFO, SUCCESS, WARNING, CAUTION, TIP, NOTE)
app.alert(AlertKind.INFO, "Configuration Loaded", "Loaded 42 rules from settings.json.");
app.alert(AlertKind.WARNING, "High Memory Threshold", "Memory utilization exceeded 85%.");
app.alert(AlertKind.CAUTION, "Destructive Action", "Dropping database table `audit_logs`.");
app.alert(AlertKind.TIP, "Pro Tip", "Pass `--silent` to disable interactive output.");
```

### Task Checklist Items

Format structured task execution checklists:

```ts
import { TaskStatus } from "../src/simplecli";

app.taskItem("Compile TypeScript sources", TaskStatus.DONE, 140);
app.taskItem("Run static analysis", TaskStatus.RUNNING, 0);
app.taskItem("Deploy image to registry", TaskStatus.PENDING, 0);
app.taskItem("Run smoke tests", TaskStatus.FAILED, 55);
app.taskItem("Upload optional symbols", TaskStatus.SKIPPED, 0);
```

### Table Data Format Exporters & Markdown Rendering

Convert table data structures to standard formats or render Markdown inside the terminal:

```ts
const headers = ["ID", "Name", "Role"];
const rows = [
  ["1", "Alice, VP", "Admin"],
  ["2", "Bob", "Developer"],
];

// Convert to CSV string:
const csvData = app.tableToCsv(headers, rows);

// Convert to Markdown table:
const mdTable = app.tableToMarkdown(headers, rows);

// Convert to JSON array of objects:
const jsonData = app.tableToJson(headers, rows);

// Syntax-highlight JSON with ANSI colors in terminal:
app.println(app.jsonHighlight('{"status": "healthy", "uptime_sec": 86400, "debug": false}'));

// Render Markdown document to terminal with styled headings and lists:
app.renderMarkdown("# Release Notes\n## Improvements\n* Faster CLI startup\n* Zero-window RAD components\n> Ready for production.");
```

---

## 4. Interactive Prompts, Menus & Input Validation

### Text, Secret & Typed Prompts

```ts
// Plain string prompt
const username = await app.prompt("Enter admin username: ", "admin");

// Hidden / masked password prompt
const apiToken = await app.promptPassword("Enter secret API access token: ");

// Validated email prompt (re-prompts until a valid email syntax is entered)
const email = await app.promptEmail("Enter alert recipient email: ", "dev@domain.com");

// Validated URL prompt (re-prompts until a valid http/https URL is entered)
const webhook = await app.promptUrl("Enter Slack Webhook URL: ", "https://hooks.slack.com/...");

// Constrained numeric prompt between min and max bounds
const threads = await app.promptNumber("Worker thread concurrency", 8, 1, 64);

// Yes/No confirmation prompt (returns boolean)
const proceed = await app.confirm("Do you want to apply migrations to production?", false);
```

### Single, Multi-Select & Fuzzy Search Menus

```ts
// Single selection menu
const choice = await app.select("Choose build target environment:", [
  "Local Development",
  "Staging Integration",
  "Production Release",
]);

// Multi-select menu
const selected = await app.multiSelect("Select deployment components to verify:", [
  "PostgreSQL Database",
  "Redis Cache",
  "Kafka Event Streams",
  "Elasticsearch Index",
]);

// Interactive Fuzzy Selector with query typing and similarity ranking
const branch = await app.fuzzySelect("Search and checkout Git branch:", [
  "main",
  "feature/rad-components",
  "feature/graphql-api",
  "bugfix/state-persistence",
]);
```

### Interactive Form / Wizard Builder

Collect multi-field configuration forms inside a framed console wizard:

```ts
import { FormFieldKind } from "../src/simplecli";

const formData = await app.form("Deploy Microservice Wizard", [
  {
    key: "name",
    label: "Service Name",
    kind: FormFieldKind.TEXT,
    required: true,
  },
  {
    key: "port",
    label: "Listen Port",
    kind: FormFieldKind.NUMBER,
    defaultVal: "8080",
  },
  {
    key: "secret",
    label: "Master API Key",
    kind: FormFieldKind.PASSWORD,
    required: true,
  },
]);
```

### Path Validation Prompt & Interactive File Picker

Prompt for user file paths with automatic `~` expansion and existence mode checks (`PathMode.ANY`, `PathMode.MUST_EXIST`, `PathMode.FILE`, `PathMode.DIRECTORY`), or launch an interactive terminal file picker:

```ts
import { PathMode } from "../src/simplecli";

const certPath = await app.promptPath("Enter path to TLS certificate:", "~/.config/certs/app.pem", PathMode.FILE);
const targetDir = await app.promptPath("Enter deployment directory:", "/var/www/app", PathMode.DIRECTORY);

// Interactive directory/file browser
const chosenFile = await app.filePicker("Select a configuration file:", {
  baseDir: process.cwd(),
  extensions: [".json", ".toml"],
});
```

---

## 5. Multi-Step Task Pipeline Runner

Execute multi-stage automation workflows with live step indicators, step timers, and summary reporting:

```ts
const pipeline = app.newPipeline("Production Release Pipeline");

pipeline.addStep("Clean temporary build artifacts", async () => {
  return true;
});

pipeline.addStep("Compile TypeScript bundles", async () => {
  await app.sleep(150);
  return true;
});

pipeline.addStep("Run security vulnerability scan", async () => {
  await app.sleep(100);
  return true;
});

// Run pipeline: displays live checkmarks, spinners, and duration summary
const success = await pipeline.run();
```

---

## 6. Structured Multi-Level Logging & File Logging

`SimpleCLI` provides structured logging with timestamps, level tags, ANSI colors, and optional file log streaming:

```ts
import { SimpleCLI, LogLevel } from "../src/simplecli";

const app = SimpleCLI.new("Runner")
  .setLogLevel(LogLevel.TRACE)
  .setLogFile("/tmp/runner.log");

app.trace("Fine-grained trace message");
app.debug("Debugging connection pool state");
app.info("Server listening on port 3000");
app.success("Database migration completed");
app.warn("Disk usage above 80%");
app.error("Failed to reach upstream cache");
// app.fatal("Unrecoverable configuration error"); // logs and exits with code 1
```

---

## 7. Benchmark & Execution Timing

Measure wall-clock execution time with sub-millisecond and nanosecond precision:

```ts
import { sys } from "../src/simplecli";

app.resetTimer();
// ... perform workload ...
const ms = app.elapsedMs();
const sec = app.elapsedSeconds();

// High-precision synchronous & async function benchmarking
const syncMetric = app.measure(() => JSON.stringify({ hello: "world" }));
app.info(`Serialized in ${syncMetric.durationMs} ms (${syncMetric.durationNs} ns)`);

const asyncMetric = await app.measureAsync(async () => {
  await sys.sleep(50);
  return 42;
});
```

---

## 8. Reactive State Store, Config & Namespaced Redis

```ts
// In-memory state dictionary with JSON file persistence
app.setState("last_deploy", new Date().toISOString());
const lastDeploy = app.getState("last_deploy", "never");

const stateFile = app.getAppStateFile("Sentinel", "state.json");
app.saveState(stateFile);
app.loadState(stateFile);

// Persistent per-application ConfigStore (~/.config/<app>/config.json)
app.config.set("region", "us-east-1");
const region = app.config.get("region", "us-west-2");

// Namespaced Redis helper (automatically prefixes keys with "<namespace>:")
const cache = app.redis("sentinel");
```

---

## 9. Safe Process Execution & Subprocess Control

Execute shell commands synchronously, in the background, with timeouts, automatic retries, or bounded concurrency via `sys`:

```ts
import { sys } from "../src/simplecli";

// Synchronous execution returning [output, exitCode]
const [out, code] = sys.exec("git status --short");

// Execute with fallback string on non-zero exit
const branch = sys.execOr("git rev-parse --abbrev-ref HEAD", "main");

// Detached background process returning PID
const pid = sys.execBg("bun run docs:check");

// Execute with strict timeout (ms)
const timed = await sys.execTimeout("curl -s https://example.com", 3000);

// Execute with automatic retries and delay
const retried = await sys.execRetry("flaky-network-cmd", 3, 500);

// Execute multiple commands in parallel with concurrency limit
const batchResults = await sys.execParallel(["echo one", "echo two", "echo three"], 2);
```

---

## 10. Hardware Telemetry & Resource Probing

```ts
import { sys } from "../src/simplecli";

const cores = sys.cpuCount();
const model = sys.cpuModel();
const [load1, load5, load15] = sys.cpuLoad();

const totalRam = sys.ramTotal();
const freeRam = sys.ramFree();
const usedRam = sys.ramUsed();
const ramPct = sys.ramPercent();

const platform = sys.osPlatform();
const arch = sys.osArch();
const release = sys.osRelease();
const host = sys.osHostname();
const uptimeSec = sys.osUptime();
const battery = sys.batteryPercent();
const charging = sys.isCharging();
```

---

## 11. Standard OS Directory Resolution & File System

```ts
import { sys } from "../src/simplecli";

const home = sys.osHomedir();
const tmp = sys.osTmpdir();
const fullPath = sys.expandTilde("~/Documents/report.json");

// Disk usage statistics for a mount path
const disk = sys.diskStats("/");

// File metadata inspection
const meta = sys.fileMetadata(fullPath);

// High-speed Bun file I/O helpers
await sys.writeJson(fullPath, { ok: true });
const data = await sys.readJson(fullPath, { ok: false });
const text = await sys.readText(fullPath);
const exists = await sys.fileExists(fullPath);
const files = sys.findFiles("./src", /\.ts$/);
```

---

## 12. Network, Wi-Fi & TCP Port Diagnostics

```ts
import { sys } from "../src/simplecli";

const ifaces = sys.networkInterfaces();
const ip = sys.localIp();
const mac = sys.macAddress();
const ssid = sys.wifiSsid();

const reachable = await sys.pingCheck("8.8.8.8", 2000);
const portOpen = await sys.checkPort("127.0.0.1", 5432, 1000);
const openPorts = await sys.portScan("127.0.0.1", 3000, 3010, 500);
const addresses = await sys.dnsLookup("example.com");
```

---

## 13. Desktop Notifications, Speech & Audio Utilities

```ts
import { sys } from "../src/simplecli";

// Native OS desktop notification (macOS osascript / Linux notify-send)
sys.notify("Build Complete", "All targets compiled with zero warnings.", true);

// Background text-to-speech synthesis (macOS say / Linux spd-say / espeak)
sys.say("Deployment finished successfully");

// Terminal bell alert
sys.beep();
```

---

## 14. System Clipboard & OS URL / File Openers

```ts
import { sys } from "../src/simplecli";

// Copy and paste text using native OS clipboard (pbcopy/pbpaste or xclip)
sys.clipboardCopy("https://localhost:3000");
const clipText = sys.clipboardPaste();

// Open a URL or file in the default OS application
sys.openUrl("https://bun.sh");
```

---

## 15. HTTP Client, Micro Server & REST APIs

```ts
import { stdlib, sys } from "../src/simplecli";

// Simple GET and POST helpers
const body = await stdlib.httpGet("https://httpbin.org/get");
const postResp = await stdlib.httpPost("https://httpbin.org/post", { event: "deploy" });

// Full HTTP request with status code and headers
const response = await stdlib.httpRequest("PUT", "https://httpbin.org/put", { ok: true });

// Stream file download with progress callback
await stdlib.downloadFile("https://example.com/archive.tar.gz", "/tmp/archive.tar.gz", (dl, total) => {
  app.progressBar(dl, total, "Downloading");
});

// Instant static file server or custom micro HTTP server via Bun.serve
const server = sys.serveStatic("./public", 3000, "127.0.0.1");
```

---

## 16. Cryptography, Hashing & Random Utilities

```ts
import { stdlib, sys } from "../src/simplecli";

const digest256 = stdlib.sha256("payload");
const digest512 = stdlib.sha512("payload");
const hmac = stdlib.hmacSha256("secret-key", "payload");

// AES-256-CBC authenticated payload encryption & decryption
const cipher = stdlib.aesEncrypt("sensitive token", "master-passphrase");
const plain = stdlib.aesDecrypt(cipher, "master-passphrase");

// Password hashing & verification (Bun.password bcrypt with PBKDF2 fallback)
const pwHash = await stdlib.bcryptHash("correct-horse-battery-staple");
const isValid = await stdlib.bcryptVerify("correct-horse-battery-staple", pwHash);

// UUIDv4, time-ordered UUIDv7, random hex & tokens
const id4 = stdlib.uuid();
const id7 = stdlib.uuidV7();
const hexToken = stdlib.randomHex(16);
const apiToken = stdlib.randomToken(32);

// Fast non-cryptographic checksums (Bun.hash, CRC32, Adler32)
const crc = sys.crc32("payload");
const adler = sys.adler32("payload");
```

---

## 17. Encodings, Data Formats & Serialization

```ts
import { stdlib, sys } from "../src/simplecli";

const b64 = stdlib.base64Encode("hello world");
const raw = stdlib.base64Decode(b64);

const hex = stdlib.hexEncode("hello");
const unhex = stdlib.hexDecode(hex);

const rows = stdlib.csvParse("id,name\n1,Alice\n2,Bob");
const cfg = stdlib.tomlParse('[server]\nhost = "127.0.0.1"\nport = 8080');

// Native Gzip / Deflate compression
const compressed = sys.gzip("repetitive payload ".repeat(50));
const decompressed = new TextDecoder().decode(sys.gunzip(compressed));
```

---

## 18. Validation Engine

```ts
import { stdlib } from "../src/simplecli";

stdlib.isEmail("ops@example.com");      // true
stdlib.isUrl("https://example.com");    // true
stdlib.isIPv4("192.168.1.1");           // true
stdlib.isIPv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334"); // true
stdlib.isPort(8080);                    // true
stdlib.isSemver("2.4.1-beta.1");        // true
stdlib.isJson('{"valid": true}');       // true
stdlib.isHex("deadbeef");               // true
stdlib.isAlphanumeric("Bun2026");       // true
stdlib.isUUID(stdlib.uuid());           // true
```

---

## 19. Generic Collections, Queues & String Metrics

```ts
import { Stack, Queue, SetCollection, RingBuffer, MinHeap, PriorityQueue, LRUCache, stdlib } from "../src/simplecli";

const stack = new Stack<number>();
const queue = new Queue<string>();
const ring = new RingBuffer<number>(128);
const heap = new MinHeap<number>();
const pq = new PriorityQueue<string>();
const lru = new LRUCache<string, object>(256);
const setA = new SetCollection<string>();

// String similarity, casing & formatting helpers
const dist = stdlib.levenshteinDistance("kitten", "sitting");
const sim = stdlib.jaroWinklerSimilarity("martha", "marhta");
const matched = stdlib.fuzzyMatch("rdc", "rad-components");
const slug = stdlib.slugify("3. Console UI & RAD Components");
const sizeStr = stdlib.humanSize(10485760); // "10.00 MB"
const durStr = stdlib.humanDuration(125000); // "2m 5s"
```

---

## 20. Statistical Math Calculations

```ts
import { stdlib } from "../src/simplecli";

const samples = [10, 12, 23, 23, 16, 23, 21, 16];

const total = stdlib.sum(samples);
const avg = stdlib.mean(samples);
const med = stdlib.median(samples);
const mod = stdlib.mode(samples);
const vari = stdlib.variance(samples);
const sd = stdlib.stddev(samples);
const rmsVal = stdlib.rms(samples);
const p95 = stdlib.percentile(samples, 95);
const clamped = stdlib.clamp(120, 0, 100);
const interpolated = stdlib.lerp(0, 100, 0.25);
```

---

## 21. Shell Completions, Man Pages & Single-Binary Compilation

```ts
import { SimpleCLI } from "../src/simplecli";

const app = SimpleCLI.new("deploy-ctl").setVersion("1.2.0");

// Generate shell completion scripts for zsh, bash, or fish
const zshScript = app.generateCompletions("zsh");
const bashScript = app.generateCompletions("bash");
const fishScript = app.generateCompletions("fish");

// Generate Markdown CLI reference documentation and troff man-page output
const markdownDoc = app.generateMarkdownDocs();
const manPage = app.generateManPage();

// Compile a TypeScript entrypoint into a standalone native binary via `bun build --compile`
// await SimpleCLI.compileBinary("./apps/cli.ts", "./dist/deploy-ctl");
```

---

## 22. Type, Struct & Enum Reference Index

| Symbol | Kind | Module | Description |
| :--- | :--- | :--- | :--- |
| `SimpleCLI` | `class` | `src/simplecli/core/SimpleCLI.ts` | Main headless CLI & RAD console application class |
| `Sys` / `sys` | `class` | `src/simplecli/sys/index.ts` | Cross-platform OS, process, hardware, file, and network toolkit |
| `Stdlib` / `stdlib` | `class` | `src/simplecli/stdlib/index.ts` | Cryptography, HTTP client, statistics, string metrics, and validators |
| `Ansi` | `class` | `src/simplecli/core/ansi.ts` | Zero-dependency ANSI escape sequence and 24-bit color builder |
| `Logger` | `class` | `src/simplecli/core/logger.ts` | Multi-level console and file logger |
| `Prompts` | `class` | `src/simplecli/core/prompts.ts` | Interactive terminal prompt, menu, fuzzy selector, and form engine |
| `Pipeline` | `class` | `src/simplecli/core/pipeline.ts` | Multi-step sequential task runner with timing and status reporting |
| `ConfigStore` | `class` | `src/simplecli/core/config.ts` | Persistent JSON configuration store in user home config directory |
| `NamespacedRedis` | `class` | `src/simplecli/core/redis.ts` | Key-prefixed Redis client wrapper with in-memory fallback |
| `TreeNode` | `class` | `src/simplecli/core/types.ts` | Node structure for hierarchical `app.tree(root)` visualizations |
| `LogLevel` | `enum` | `src/simplecli/core/types.ts` | `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `SILENT` |
| `AlertKind` | `enum` | `src/simplecli/core/types.ts` | `INFO`, `SUCCESS`, `WARNING`, `CAUTION`, `TIP`, `NOTE` |
| `TaskStatus` | `enum` | `src/simplecli/core/types.ts` | `PENDING`, `RUNNING`, `DONE`, `FAILED`, `SKIPPED` |
| `FormFieldKind` | `enum` | `src/simplecli/core/types.ts` | `TEXT`, `NUMBER`, `BOOLEAN`, `PASSWORD`, `SELECT` |
| `PathMode` | `enum` | `src/simplecli/core/types.ts` | `ANY`, `MUST_EXIST`, `FILE`, `DIRECTORY` |
| `FlagOption` | `interface` | `src/simplecli/core/types.ts` | Metadata definition for registered CLI flags |
| `ExecResult` | `interface` | `src/simplecli/core/types.ts` | Result object for `sys.execTimeout` and `sys.execRetry` |
| `DiskStats` | `interface` | `src/simplecli/core/types.ts` | Disk capacity and utilization metrics returned by `sys.diskStats` |
| `FileMetadata` | `interface` | `src/simplecli/core/types.ts` | File stat & permission summary returned by `sys.fileMetadata` |
| `SimpleHttpResponse` | `interface` | `src/simplecli/core/types.ts` | HTTP response structure returned by `stdlib.httpRequest` |
| `SimpleURL` | `interface` | `src/simplecli/core/types.ts` | Parsed URL components returned by `stdlib.parseUrl` |
| `Stack<T>` | `class` | `src/simplecli/stdlib/index.ts` | Generic LIFO stack collection |
| `Queue<T>` | `class` | `src/simplecli/stdlib/index.ts` | Generic FIFO queue collection |
| `SetCollection<T>` | `class` | `src/simplecli/stdlib/index.ts` | Generic mathematical set with `union`, `intersect`, `difference` |
| `RingBuffer<T>` | `class` | `src/simplecli/stdlib/index.ts` | Fixed-capacity circular buffer |
| `MinHeap<T>` | `class` | `src/simplecli/stdlib/index.ts` | Generic binary min-heap |
| `PriorityQueue<T>` | `class` | `src/simplecli/stdlib/index.ts` | Priority-ordered queue backed by `MinHeap` |
| `LRUCache<K, V>` | `class` | `src/simplecli/stdlib/index.ts` | Least-Recently-Used bounded cache |
