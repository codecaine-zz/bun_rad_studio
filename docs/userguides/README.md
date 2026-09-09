# ⚡ Bun RAD Studio -- Enterprise Application User Guides

Welcome to the comprehensive documentation and user guides for the **Bun RAD Studio Enterprise Desktop Application Suite**. 

Each application in this suite is built to 30-year enterprise standards: zero external package dependencies (no Homebrew, no third-party native binaries), pure Bun and Node subsystem primitives, full macOS WKWebView integration, reactive state persistence, and instant visual feedback.

---

## 📑 Application Suite Directory

| # | Application Guide | Focus Area | GUI Launch | CLI Launch |
| :-: | :--- | :--- | :--- | :--- |
| **01** | [Database Studio Pro](01_database_studio.md) | SQLite query editor, schema DDL, query plan optimizer, CSV/JSON/SQL export. | `bun run app:database` | `bun run cli:database` |
| **02** | [System & Package Workstation](02_system_package_studio.md) | Hardware telemetry (RAM/CPU/Uptime), Bun cache analysis, npm/bun registry search. | `bun run app:system` | `bun run cli:system` |
| **03** | [Task Watcher Studio](03_task_watcher_studio.md) | Native `fs.watch` event pipeline, extension filters, ignore rules, build console. | `bun run app:watcher` | `bun run cli:watcher` |
| **04** | [JSON Query Studio Pro](04_json_query_studio.md) | High-throughput JSON query engine, nested selectors, key projection, formatting. | `bun run app:json` | `bun run cli:json` |
| **05** | [DevTools Studio Pro](05_devtools_studio.md) | 6-in-1 suite: Ripgrep search, Fd file finder, Sd regex replace, Trash, JQ. | `bun run app:devtools` | `bun run cli:devtools` |
| **06** | [Process Monitor Studio](06_process_monitor_studio.md) | macOS Activity Monitor inspection, PID search, CPU/RSS memory, signal control. | `bun run app:process` | `bun run cli:process` |
| **07** | [API Studio Pro](07_api_studio.md) | Full HTTP/REST client (GET/POST/PUT/DELETE/PATCH), auth presets, cURL generator. | `bun run app:api` | `bun run cli:api` |
| **08** | [Data Converter Studio](08_data_converter_studio.md) | Bidirectional transformer across CSV, TSV, JSON, YAML, Base64, and Markdown. | `bun run app:convert` | `bun run cli:convert` |
| **09** | [Crypto Studio Pro](09_crypto_studio.md) | SHA-256/512, MD5, HMAC, AES-256-GCM encryption/decryption, JWT decoder, UUID. | `bun run app:crypto` | `bun run cli:crypto` |
| **10** | [Regex Studio Pro](10_regex_studio.md) | Pattern evaluator, match group table, substitution preview, TypeScript code gen. | `bun run app:regex` | `bun run cli:regex` |
| **11** | [App Bundler Studio](11_app_bundler_studio.md) | `bun build --compile` single-file compilation, cross-compilation, macOS `.app`. | `bun run app:bundler` | `bun run cli:bundler` |
| **12** | [Network Forensics Studio](12_network_forensics_studio.md) | Multi-port TCP socket scanner (`node:net`), DNS records (`A/MX/TXT/NS`), TTFB. | `bun run app:network` | `bun run cli:network` |
| **13** | [Git Workbench Pro](13_git_workbench_studio.md) | Working tree status, visual diff viewer, commit log history, stage, commit. | `bun run app:git` | `bun run cli:git` |
| **14** | [Markdown Studio Pro](14_markdown_studio.md) | Split-pane Markdown editor, reading stats, standalone styled HTML document export. | `bun run app:markdown` | `bun run cli:markdown` |
| **15** | [Color & Design Token Studio](15_color_token_studio.md) | HEX/RGB/HSL converter, WCAG 2.1 contrast auditor, 50–950 tonal scale, token export. | `bun run app:color` | `bun run cli:color` |
| **16** | [Environment Vault Studio](16_environment_vault_studio.md) | `.env` parser & validator, secret key masking, diff against `.env.example`. | `bun run app:env` | `bun run cli:env` |

---

## 🚀 Quick Launch Cheat Sheet

### 🖼️ Desktop GUI Mode
```bash
# Core Workstations
bun run app:database   # Database Studio Pro (SQLite)
bun run app:system     # System & Package Workstation
bun run app:watcher    # Task Watcher Studio
bun run app:json       # JSON Query Studio Pro
bun run app:devtools   # DevTools Studio Pro (6-in-1)
bun run app:process    # Process Monitor Studio

# Developer Utilities
bun run app:api        # API Studio Pro
bun run app:convert    # Data Converter Studio
bun run app:crypto     # Crypto Studio Pro
bun run app:regex      # Regex Studio Pro
bun run app:bundler    # App Bundler Studio

# New Productivity Suites
bun run app:network    # Network Forensics Studio
bun run app:git        # Git Workbench Pro
bun run app:markdown   # Markdown Studio Pro
bun run app:color      # Color & Design Token Studio
bun run app:env        # Environment Vault Studio
```

### 💻 Headless / CI / Terminal CLI Mode
```bash
# Core Workstations
bun run cli:database   # Query SQLite, inspect schemas, generate explain plans
bun run cli:system     # Hardware memory telemetry, cache footprint, registry search
bun run cli:watcher    # Recursive file change watcher & automated test runner
bun run cli:json       # JQ-style query evaluator, format & minify
bun run cli:devtools   # 6-in-1 tool engine (rg, fd, sd, rip, jq)
bun run cli:process    # Process explorer, CPU/Memory sort & kill signals

# Developer Utilities
bun run cli:api        # HTTP/REST request runner, cURL generator & benchmarker
bun run cli:convert    # CSV, TSV, JSON, YAML, Base64 & Markdown converter
bun run cli:crypto     # Hashes, HMAC, AES-256-GCM, JWT decoder & UUID generator
bun run cli:regex      # Pattern evaluator, capture groups & TypeScript code generator
bun run cli:bundler    # Single-file native binary & macOS .app builder

# Productivity Suites
bun run cli:network    # TCP socket port scanner, DNS resolver & TTFB probe
bun run cli:git        # Working tree status table, color diffs & commit log
bun run cli:markdown   # Document stats, reading metrics & standalone HTML export
bun run cli:color      # Color converter, WCAG contrast auditor & design tokens
bun run cli:env        # .env validator, secret masker & .env.example diff inspector
```

### Backwards-Compatible Aliases
For muscle-memory compatibility with previous versions:
```bash
bun run app:sqlite      # -> app:database
bun run app:brew        # -> app:system
bun run app:watchexec   # -> app:watcher
bun run app:jq          # -> app:json
bun run app:omnitool    # -> app:devtools
bun run app:tasks       # -> app:process
bun run app:dataconvert # -> app:convert
```

---

## 🎨 Global Application Features
All 16 applications share standard enterprise features:
- **Dynamic Theming**: Instant theme switching (Sonoma Emerald, Cupertino Blue, Midnight Indigo, Cyberpunk Neon, Classic Delphi, Dracula Slate, CodeFreelance Obsidian, etc.).
- **Auto-Persistence**: Window position, geometry, and input values are automatically saved to standard OS application data paths (`~/.bun_rad_studio/state/`).
- **One-Click Centering**: The `Center` button immediately repositions the window to the exact center of the active display.
- **Zero Configuration**: Ready out of the box with zero npm packages or brew installations needed.
