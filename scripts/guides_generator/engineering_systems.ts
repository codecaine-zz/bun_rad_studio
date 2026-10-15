import { writeFileSync } from "fs";
import { join } from "path";

export function generateEngineeringSystems(outDir: string) {
  // 11_app_bundler_studio.md
  writeFileSync(join(outDir, "11_app_bundler_studio.md"), `# 📦 App Bundler Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native bun build --compile  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:bundler]  •  [Terminal CLI: bun run cli:bundler]
\`\`\`

---

## 🌟 Executive Overview
**App Bundler Studio Pro** is an enterprise packaging, single-file compilation, and native desktop app builder built on Bun's ultra-fast \`bun build --compile\` engine. It allows developers to bundle full TypeScript, JavaScript, and Webview projects into standalone, self-contained executable binaries that run on machines without Bun or Node installed.

Additionally, on macOS it automatically generates ready-to-distribute \`.app\` application bundles complete with \`Info.plist\`, bundle identifiers, high-resolution application icons (\`.icns\`), and notarization-ready directory structures.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:bundler
\`\`\`

### 2. Launch Terminal CLI Compilation Mode
\`\`\`bash
# Compile single entry point to standalone binary
bun run cli:bundler ./src/index.ts -o ./dist/my_app

# Cross-compile for Linux x64
bun run cli:bundler ./src/index.ts --target bun-linux-x64 -o ./dist/my_app_linux
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![App Bundler Desktop](../../screenshots/apps/app_bundler_studio_desktop.png) | ![App Bundler Responsive](../../screenshots/apps/app_bundler_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Project Source & Target Configuration
- **Entrypoint File Input**: Path to main entry script (e.g. \`./index.ts\` or \`./applications/calculator_studio.ts\`).
- **Output Binary Name**: Target name of the compiled binary or \`.app\` bundle.
- **Output Directory**: Target distribution folder (default \`./dist\`).
- **Cross-Compilation Target Dropdown**:
  - \`bun-darwin-arm64\` (Apple Silicon M1/M2/M3/M4)
  - \`bun-darwin-x64\` (Intel macOS)
  - \`bun-linux-x64\` (Standard Linux servers / containers)
  - \`bun-linux-arm64\` (Linux ARM servers / AWS Graviton / Raspberry Pi)
  - \`bun-windows-x64\` (Windows 10 / 11 64-bit)

### 2. Desktop macOS .app Packaging Engine
- **Bundle Identifier**: Reverse domain identifier (e.g. \`com.codefreelance.studio\`).
- **Application Display Name**: Formatted name shown in macOS Dock and Finder.
- **Icon Selector**: Path to \`.png\` or \`.icns\` icon to embed into the bundle.
- **Generate .app Bundle Toggle**: Automatically generates \`Contents/MacOS\` and \`Contents/Info.plist\`.

### 3. Build Telemetry & Streaming Console
- **⚡ Compile Binary Button**: Triggers compilation with real-time log streaming.
- **Build Metrics Card**: Shows compilation time, output file size (MB), and bytecode compression ratio.
- **File Explorer Reveal**: One-click button to reveal compiled binary in macOS Finder or open destination folder.

---

## 🛠️ Step-by-Step Practical Tutorials

### Tutorial: Building a Standalone macOS Desktop Application
1. Launch App Bundler Studio: \`bun run app:bundler\`.
2. Set **Entrypoint File**: \`./applications/calculator_studio.ts\`.
3. Set **Output Binary Name**: \`CalculatorStudio\`.
4. Enable **Generate macOS .app Bundle**.
5. Set **Bundle ID**: \`com.codecaine.calculator\`.
6. Click **⚡ Compile Binary**.
7. In under 2 seconds, your complete self-contained \`dist/CalculatorStudio.app\` is created. You can drag and drop it directly into your \`/Applications\` folder or share it with anyone.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Cmd + B** / **Ctrl + B** | Global | Start Compilation |
| **Cmd + O** / **Ctrl + O** | File Picker | Browse for Entrypoint file |
| **Cmd + R** / **Ctrl + R** | Post-Build | Reveal output in Finder / Explorer |
| **F11** or **F** | Global | Toggle borderless fullscreen |
`);

  // 12_network_forensics_studio.md
  writeFileSync(join(outDir, "12_network_forensics_studio.md"), `# 📡 Network Forensics Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native node:net, node:tls & node:dns  •  Dependencies: 0  •  Port scans work offline; DNS/HTTP need internet
Launchers: [Desktop GUI: bun run app:network]  •  [Terminal CLI: bun run cli:network]
\`\`\`

---

## 🌟 Executive Overview
**Network Forensics Studio** is a multi-dimensional network diagnostics, socket auditing, DNS reconnaissance, and latency analysis workstation. Built directly on Bun's native \`node:net\` and \`node:dns\` subsystems, it eliminates heavy networking packages and command-line tools like \`nmap\`, \`dig\`, and \`traceroute\` for standard developer workflows.

It features parallel TCP port scanning, DNS record inspection (\`A\`, \`AAAA\`, \`MX\`, \`TXT\`, \`NS\`, \`SOA\`, \`CAA\`, reverse \`PTR\`), HTTP timing breakdowns, TLS certificate inspection and TCP latency measurement.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:network
\`\`\`

### 2. Launch Terminal CLI Network Scanner
\`\`\`bash
# Scan common development ports on localhost
bun run cli:network scan localhost --ports 3000,5432,6379,8080

# Resolve all DNS records for a domain
bun run cli:network dns example.com
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Network Forensics Desktop](../../screenshots/apps/network_studio_desktop.png) | ![Network Forensics Responsive](../../screenshots/apps/network_studio_responsive.png) |

---

## 🧭 Diagnostic Tools

Set the **Target** (host name, IP or URL) and **Port**, then pick a tool. A target that is not a valid host name or IP is rejected with an error instead of silently scanning something else.

| Tool | What it does |
| :--- | :--- |
| **HTTP Probe** | Sends a HEAD request, follows redirects and shows the status, response headers and timings (DNS, TCP connect, TLS, time to first byte, total), the redirect count and the remote IP. |
| **Scan Port** | Tests one TCP port and reports OPEN, CLOSED or TIMEOUT with latency. |
| **Scan Top Ports** | Checks 12 common service ports (FTP, SSH, DNS, HTTP, HTTPS, dev servers, MySQL, PostgreSQL, Redis, MongoDB). |
| **Full DNS Audit** | Queries A, AAAA, MX, TXT, NS, SOA and CNAME records together. |
| **A / AAAA / MX / TXT / NS / SOA / CAA** | Query one record type. |
| **Reverse DNS (PTR)** | Finds the host name for an IP address. |
| **Presets** | Localhost, Cloudflare, Google and GitHub fill in the target and port. |

---

## 🧰 Productivity Toolkit

- **Scan Port List**: scan your own ports, such as \`22,80,443,8000-8010\`. Separate entries with commas, spaces or semicolons. Ranges are expanded, duplicates removed, and a list is capped at 1024 ports.
- **Timeout (ms)**: per-port wait, 100-5000 (default 500). Raise it for slow or distant hosts.
- **Show open ports only**: hides closed and timed-out ports from the Scan Top Ports and Scan Port List results. The report notes how many were hidden.
- **SSL Certificate**: connects to the host and port (default 443) and shows the subject, issuer, validity dates, a days-left verdict (valid, expiring within 14 days, or expired), whether the system trusts it, protocol, cipher, alternative names and SHA-256 fingerprint. It inspects self-signed and expired certificates too, so you can see why a site fails.
- **TCP Ping x5**: five TCP connections to the host and port, with replies, packet loss, min/avg/max and jitter. This measures TCP connect time, not ICMP ping.
- **Copy Report** copies the raw text report.
- **Save Report...** opens a save dialog. Name the file \`.csv\` after a port scan to get a spreadsheet-friendly list; any other name saves the text report.

> Scans and checks run one after another and the window waits while they do, so a large list or slow host can pause the UI briefly.

> Only scan hosts you own or are authorised to test.

---

## 🛡️ Safety

- Everything shown from the network (DNS records, HTTP headers, error text) is HTML-escaped before display, so a hostile server cannot inject markup into the results panel.
- Your own addresses and MAC addresses are masked in the interface table.

---

## 🛠️ Step-by-Step Tutorial: Check a Certificate and a Port Range
1. Launch with \`bun run app:network\`.
2. Enter \`example.com\` as the target and \`443\` as the port, then click **SSL Certificate**.
3. Read the **Expiry Status** row: it tells you how many days remain.
4. Enter \`127.0.0.1\` as the target, set Ports to \`3000,5432,6379,8000-8010\`, tick **Show open ports only** and click **Scan Port List** to see which local services are running.
5. Click **Save Report...** and name it \`ports.csv\`.

---

## 💡 Pro Tips & Best Practices
- A TIMEOUT usually means a firewall is dropping packets; CLOSED means the host actively refused the connection.
- DNS and HTTP probes need an internet connection; local port scans and TCP ping to localhost work offline.
- Typed values are kept in the saved form state, so avoid putting sensitive hostnames on a shared machine.
`);

  // 13_git_workbench_studio.md
  writeFileSync(join(outDir, "13_git_workbench_studio.md"), `# 🌿 Git Workbench Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Git Subsystem & Diff Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:git]  •  [Terminal CLI: bun run cli:git]
\`\`\`

---

## 🌟 Executive Overview
**Git Workbench Pro** is an enterprise-grade visual Git repository manager and diff inspector built natively for Bun RAD Studio. It provides a visual workspace for tracking working tree changes, viewing colorized side-by-side diffs, reviewing commit log histories, staging files, and crafting clean, conventional commit messages.

It provides lightning-fast Git operations with zero heavy web wrappers or cloud bloat, keeping your repository state strictly local and offline.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch (in active repo directory)
bun run app:git
\`\`\`

### 2. Launch Terminal CLI Git Assistant
\`\`\`bash
# Quick status and visual diff summary
bun run cli:git status

# Commit history tree in terminal
bun run cli:git log -n 10
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Git Workbench Desktop](../../screenshots/apps/git_studio_desktop.png) | ![Git Workbench Responsive](../../screenshots/apps/git_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Repository Header & Branch Navigator
- **Active Branch Badge**: Displays current git branch with status indicator (clean vs dirty).
- **Branch Switcher**: Dropdown list of local branches with one-click checkout.
- **Fetch / Pull / Push Actions**: Safe status synchronization buttons.

### 2. Working Tree & Staging Area
- **Modified Files Table**: Displays status badges: \`M\` (Modified), \`A\` (Added), \`D\` (Deleted), \`U\` (Untracked).
- **Stage / Unstage Checkboxes**: Click any file to toggle staged status.
- **Discard Changes**: Safe rollback button for unstaged edits.

### 3. Visual Diff Viewer
- **Unified & Split Diff Modes**: High-contrast syntax highlighting showing additions (green) and deletions (red).
- **Line Numbers & Hunk Headers**: Precise diff hunk navigation.

### 4. Commit Composer & Conventional Commits Helper
- **Commit Type Selector**: \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`perf\`, \`test\`, \`chore\`.
- **Commit Message Input**: Formatted message composer with 50/72 rule character counter.
- **Commit Button (Cmd+Enter)**: Creates commit with clean GPG/sign-off support.
`);

  // 14_markdown_studio.md
  writeFileSync(join(outDir, "14_markdown_studio.md"), `# 📝 Markdown Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native GFM Parser & HTML Renderer  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:markdown]  •  [Terminal CLI: bun run cli:markdown]
\`\`\`

---

## 🌟 Executive Overview
**Markdown Studio Pro** is an Apple-grade split-pane Markdown editor, document generator, and technical documentation studio built natively for Bun RAD Studio. It combines a distraction-free monospace Markdown editor with a synchronized, pixel-perfect GitHub Flavored Markdown (GFM) preview pane.

It features live word and character counters, estimated reading times, interactive task lists, syntax-highlighted code blocks, and one-click export to standalone, beautifully styled HTML documents.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:markdown
\`\`\`

### 2. Launch Terminal CLI Markdown Exporter
\`\`\`bash
# Render markdown file to styled standalone HTML
bun run cli:markdown README.md -o ./dist/README.html
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Markdown Studio Desktop](../../screenshots/apps/markdown_studio_desktop.png) | ![Markdown Studio Responsive](../../screenshots/apps/markdown_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Editor Toolbar & Document Statistics
- **Document Telemetry Pill**: Live count of Words, Characters, Paragraphs, and Estimated Reading Time (e.g. \`1,240 words • 5 min read\`).
- **Formatting Chips**: One-click insertion chips for Bold (\`**\`), Italic (\`*\`), Headers (\`#\`), Tables, Code Blocks (\`\`\`\`), and Checkboxes (\`- [ ]\`).
- **💾 Export HTML**: Generates a self-contained, offline HTML file with embedded typography and dark-mode styles.

### 2. Synchronized Dual-Pane Workspace
- **Editor (Left Pane)**: Fast textarea with line wrapping, tab indentation, and undo/redo support.
- **Live Preview (Right Pane)**: Rendered GFM preview with custom typography, clean tables, blockquotes, and alerts.
`);

  // 15_color_token_studio.md
  writeFileSync(join(outDir, "15_color_token_studio.md"), `# 🎨 Color & Design Token Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Color Space & WCAG 2.1 Math Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:color]  •  [Terminal CLI: bun run cli:color]
\`\`\`

---

## 🌟 Executive Overview
**Color & Design Token Studio** is an enterprise color space converter, accessibility contrast auditor, and design token generator built natively for Bun RAD Studio. It empowers UI/UX designers, design engineers, and frontend developers to construct harmonious, accessible color palettes adhering to **WCAG 2.1 AA and AAA accessibility standards**.

It provides bidirectional conversion across **HEX, RGB, HSL, and OKLCH**, generates complete 50–950 tonal shade scales, audits foreground/background contrast ratios in real time, and exports production-ready tokens for Tailwind CSS, CSS Custom Properties, and TypeScript.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:color
\`\`\`

### 2. Launch Terminal CLI Color Inspector
\`\`\`bash
# Check contrast between two colors
bun run cli:color contrast "#a855f7" "#0f172a"

# Generate 50-950 scale for a hex color
bun run cli:color scale "#3b82f6"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Color Studio Desktop](../../screenshots/apps/color_studio_desktop.png) | ![Color Studio Responsive](../../screenshots/apps/color_studio_responsive.png) |

---

## 🧭 Core Workspaces & Capabilities

### 1. 🌈 Color Converter & Channel Inspector
- **Inputs**: Supports \`#hex\`, \`rgb(r, g, b)\`, \`hsl(h, s%, l%)\`, and \`oklch(l, c, h)\`.
- **Live Color Chip**: Displays high-DPI color swatch with one-click clipboard copy.

### 2. 👁️ WCAG 2.1 Contrast Auditor
- Evaluates contrast ratio between Foreground and Background (e.g. \`12.4:1\`).
- Visual badges for:
  - **Normal Text AA** (Requires $\ge 4.5:1$)
  - **Large Text AA** (Requires $\ge 3.0:1$)
  - **Normal Text AAA** (Requires $\ge 7.0:1$)
  - **Large Text AAA** (Requires $\ge 4.5:1$)

### 3. 🎨 50–950 Tonal Scale Generator
- Generates 10 harmonious shades: \`50\`, \`100\`, \`200\`, \`300\`, \`400\`, \`500\`, \`600\`, \`700\`, \`800\`, \`900\`, \`950\`.
- Exports directly to Tailwind CSS configuration format or CSS Variables.
`);

  // 16_environment_vault_studio.md
  writeFileSync(join(outDir, "16_environment_vault_studio.md"), `# 🔑 Environment Vault Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native .env Parser & TypeScript Schema Gen  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:env]  •  [Terminal CLI: bun run cli:env]
\`\`\`

---

## 🌟 Executive Overview
**Environment Vault Studio** is a secure desktop configuration editor, secret validator, and diff workbench for \`.env\` files. Designed to prevent production outages caused by missing environment variables, syntax errors, or mismatched \`.env.example\` keys, it gives developers a visual, audited interface for managing local secrets safely.

It includes secret masking toggles, duplicate key detection, automatic diffing against template files, and one-click generation of typed TypeScript configuration schemas (compatible with Zod and clean interfaces).

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:env
\`\`\`

### 2. Launch Terminal CLI Environment Validator
\`\`\`bash
# Validate .env against .env.example
bun run cli:env check .env --template .env.example

# Generate TypeScript types from .env
bun run cli:env types .env
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Environment Vault Desktop](../../screenshots/apps/env_studio_desktop.png) | ![Environment Vault Responsive](../../screenshots/apps/env_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### The four steps
1. **Open or paste** your settings: press **📂 Open .env…** and choose a file, or paste into the *Your settings* box. (The window starts with sample settings; **🧹 Clear** empties the box.)
2. **Check** them with **⚡ Audit & Validate**. *Errors* (a line without \`=\`, an invalid name, an unclosed quote) and *notes* (an empty value, a secret that still looks like a placeholder, a name that is not UPPER_CASE, a value with spaces that is not in quotes, a name that appears twice) are listed in the log at the bottom, and the three labels at the top count them.
3. **Make an example** with **✨ Generate .env.example**. Every name is kept once and every value is blanked; only plain settings (a name with the word PORT, HOST or NODE_ENV in it, and a simple value) keep theirs, and never a secret. Comments are left out because they can hold secrets.
4. **Copy or save** it: **📋 Copy example** puts it on the clipboard; **💾 Save example…** asks where to save it (suggesting \`.env.example\`).

### Buttons
| Where | Button | What it does |
|---|---|---|
| Your settings | 📂 Open .env… | Loads a file (up to 1 MB, text only). The file is not changed until you save. |
| | 🔒 Mask Secrets / 👁️ Unmask Secrets | Shows secret values (names with SECRET, PASSWORD, TOKEN, KEY, AUTH ...) as dots, for screen sharing. **Copy and Save always use the real values**, and a line you edit while masked keeps your edit. |
| | 📋 Copy .env | Copies the real text to the clipboard. |
| | 💾 Save .env… | Asks where to save. The file is written so only you can read it. Your computer asks before replacing a file. |
| Example file | 📂 Open example… | Loads an existing \`.env.example\` to compare with. |
| | ⚖️ Compare with .env.example | Fills the *Comparison report* box: names missing from your settings, names only you have, and names that are empty. The example box is not changed. |

### Good to know
- Nothing is sent anywhere; the file is read and written on your computer only.
- Opening, comparing and generating never change a file. Only the two **Save** buttons write, and only where you choose.
- The command-line version (\`bun run cli:env check .env --template .env.example\`) does the same checks without a window.
`);

  console.log("✔ Engineering Systems (11 to 16) generated with AAA quality.");
}
