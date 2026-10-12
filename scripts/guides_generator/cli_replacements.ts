import { writeFileSync } from "fs";
import { join } from "path";

export function generateCliReplacements(outDir: string) {
  // 17_fd_studio.md
  writeFileSync(join(outDir, "17_fd_studio.md"), `# 🔎 Fd Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Recursive Filesystem Traversal  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:fd]  •  [Terminal CLI: bun run cli:fd]
\`\`\`

---

## 🌟 Executive Overview
**Fd Studio Pro** is an ultra-fast, intuitive filesystem search, file discovery, and batch manipulation workbench engineered natively for Bun RAD Studio. Designed as a modern, friendly replacement for GNU/BSD \`find\`, it provides lightning-fast file searching with smart defaults: case-insensitivity by default, automatic respect for \`.gitignore\`, and clean colorized output.

In addition to searching, Fd Studio Pro integrates directly with **Rip Studio Pro** to provide one-click safe file burial into a recoverable graveyard quarantine, plus a batch execution builder to run shell commands across all discovered files.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:fd

# Shorthand alias
bun run app:find
\`\`\`

### 2. Launch Terminal CLI File Finder
\`\`\`bash
# Find files matching pattern in current directory
bun run cli:fd "*.ts"

# Search for exact file name ignoring case
bun run cli:fd "package.json"

# Search within specific directory
bun run cli:fd "*.sqlite" ./data
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×2350, full page) | Responsive Viewport (960×1500) |
| :---: | :---: |
| ![Fd Studio Desktop](../../screenshots/apps/fd_studio_desktop.png) | ![Fd Studio Responsive](../../screenshots/apps/fd_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Search Query & Target Toolbar
- **Search Pattern Input**: Glob pattern (e.g. \`*.png\`) or regular expression (e.g. \`test_.*\\.ts$\`).
- **Search Directory Input**: Path to start recursive traversal (default \`./\`).
- **File Type Filter**: All Types, Files Only, Directories Only, or Symlinks.
- **Hidden Files & Gitignore Checkboxes**:
  - \`Show Hidden (-H)\`: Include dotfiles (\`.env\`, \`.gitignore\`).
  - \`Respect .gitignore (-I)\`: Skips \`node_modules\`, \`dist\`, and gitignored artifacts.
- **⚡ Search Files Button (Enter)**: Traverses folders in parallel.

### 2. Discovered Files Table
- **File Path**: Relative or absolute path with file type icon.
- **File Size**: Formatted byte size (B, KB, MB, GB).
- **Modified Date**: Last modification timestamp.
- **Permissions**: POSIX permissions octal string (e.g. \`0755\`, \`0644\`).
- **Row Actions**:
  - **📂 Open in Finder**: Reveals file in system file manager.
  - **⚰️ Bury File**: Safely quarantines file into the Rip Graveyard.

### 3. Batch Command Execution Builder
- **Exec Command Template**: Command string using \`{}\` as placeholder for file path (e.g. \`bun build {}\`, \`wc -l {}\`).
- **⚡ Execute Across All Matches**: Runs command for each matching file and streams output to log.

### 4. File Operations & Analysis Toolkit (no terminal needed)
A beginner-friendly file-manager layer on top of search — everything is a button, every change is logged in the console.
- **📄 New File / 📁 New Folder**: Type a name in **Name** and click; created in the **Search Root**.
- **✏️ Rename Selected / ⧉ Duplicate / ↗ Open**: Act on the row selected in the results table (Duplicate makes \`name copy.ext\`; Open uses the default app).
- **🔐 Set Permissions / 🔢 Hex View**: Set \`chmod\` as octal (\`644\`, \`755\`) or symbolic (\`rwxr-xr-x\`); inspect binary files as a hex dump.
- **↶ Undo Last Change (N)**: Reverses renames, new files/folders and duplicates, newest first. (Deletes use the 🪦 Rip graveyard, which is also recoverable.)
- **Batch Rename (all matches)**: Find/replace (plain or Regex), lowercase/UPPERCASE/Title Case, prefix, suffix, numbering (\`_001\`), spaces→underscores. **👁 Preview Rename** shows old → new names and flags conflicts without touching disk; **✅ Apply Rename** asks for confirmation, then renames safely (swap/chain-proof).
- **🔎 Search Contents**: Grep inside every matched text file (plain/Regex, optional case-sensitive) with \`file:line\` results; binaries are skipped.
- **👯 Find Duplicates**: Groups identical files (size, then SHA-256) and reports reclaimable space.
- **🐘 Largest Files / 📊 Usage by Type**: Top files and size-per-extension breakdown of the current matches.
- **📑 Export TSV / 📝 Export Markdown / 🗒 Export Path List**: Saved into the *Target Destination Folder* and copied to the clipboard (JSON and CSV exports are still available).
- **Min Depth filter**: Skip the top N folder levels (companion to Max Depth).

### 5. Productivity Features
- **📁 Browse… (Search Root / Destination Folder)**: Pick folders with a native dialog instead of typing paths. Picking a new Search Root re-runs the search (and restarts the live watcher if it is on).
- **Preset dropdown**: One-click saved searches — Large files (>10M), Recently modified (24h), Images, Source code, Documents, Logs, Empty files & folders, Directories only. A preset fills the extension, size, age and type filters and searches immediately.
- **Recent searches**: The last 15 distinct patterns are kept for the session; choose one to re-run it.
- **Max results**: Cap the number of matches (default \`1500\`, up to \`20000\`). The status bar tells you when results were capped.
- **Sort**: Default, Name A→Z / Z→A, Size largest / smallest, Modified newest / oldest — applied instantly without rescanning.
- **Filter results**: Type to narrow the current results by name or path (case-insensitive) without rescanning. Batch actions, exports and copies use exactly what is shown.
- **💾 Save Results As…**: Native Save dialog; the format follows the extension you choose — \`.json\`, \`.csv\`, \`.tsv\`, \`.md\` or \`.txt\` (path list).
- **Feedback**: A toast summarises each search (count and time), and a missing Search Root shows a clear error instead of an empty result.
`);

  // 18_rip_studio.md
  writeFileSync(join(outDir, "18_rip_studio.md"), `# ⚰️ Rip Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native File Quarantine & Graveyard Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:rip]  •  [Terminal CLI: bun run cli:rip]
\`\`\`

---

## 🌟 Executive Overview
**Rip Studio Pro** is an ergonomic, safe replacement for \`rm\` and \`rm -rf\`. Instead of permanently destroying files with irreversible deletion, Rip Studio Pro moves targeted files and directories into a date-stamped, tracked local **Graveyard Quarantine** (\`~/.local/share/graveyard\`).

Every buried file retains its original absolute path metadata, deletion timestamp, and file permissions, allowing instant, one-click **Unbury Restoration** to resurrect accidentally deleted source code, databases, or documents.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:rip
\`\`\`

### 2. Launch Terminal CLI Safe Removal
\`\`\`bash
# Safely bury a file (replaces rm file.txt)
bun run cli:rip bury file.txt

# Inspect graveyard items
bun run cli:rip list

# Unbury / restore the last deleted item
bun run cli:rip unbury
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Rip Studio Desktop](../../screenshots/apps/rip_studio_desktop.png) | ![Rip Studio Responsive](../../screenshots/apps/rip_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Bury Target Panel
- **Target File/Folder Input**: Path to file or directory to bury.
- **⚰️ Bury Target Button**: Atomically moves the item into the Graveyard with metadata manifest.

### 2. Graveyard Archive Table
- **Original Path**: The exact filesystem path where the file lived.
- **Buried Date & Time**: Timestamp of quarantine.
- **Size**: Disk space consumed by quarantined file.
- **Actions**:
  - **♻️ Unbury (Restore)**: Resurrects file back to original location.
  - **🔥 Permanently Shred**: Irreversibly purges single item from disk.

### 3. Graveyard Storage Maintenance
- **Graveyard Size Pill**: Total disk space occupied by quarantined files.
- **🧹 Empty Graveyard Button**: Purges items older than 30 days or clears entire archive.
`);

  // 19_sd_studio.md
  writeFileSync(join(outDir, "19_sd_studio.md"), `# 🔄 Sd Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Regex Stream Substitution  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:sd]  •  [Terminal CLI: bun run cli:sd]
\`\`\`

---

## 🌟 Executive Overview
**Sd Studio Pro** is an intuitive, visual find-and-replace desktop workstation built natively for Bun. Designed as a modern, safe, and visual replacement for \`sed\`, it features real-time regular expression substitution with capture groups (\`$1\`, \`$2\`), literal string mode, unified side-by-side diff previews, automatic \`.bak\` backups, and batch file modifications across projects.

No more deciphering cryptic sed escaping like \`sed -i '' 's/old/new/g'\`. Sd Studio Pro gives you a visual preview of every change before writing a single byte to disk.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:sd
\`\`\`

### 2. Launch Terminal CLI Find-and-Replace
\`\`\`bash
# Replace text across files with preview
bun run cli:sd "oldEndpoint" "newEndpoint" ./src/*.ts --preview

# Apply replacement with automatic backup
bun run cli:sd "http://localhost:3000" "https://api.prod.com" config.json --backup
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Sd Studio Desktop](../../screenshots/apps/sd_studio_desktop.png) | ![Sd Studio Responsive](../../screenshots/apps/sd_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide

### 1. Pattern & Replacement Bar
- **Find Pattern**: Regular expression or literal text to search.
- **Replace With**: New replacement text (supports \`$1\`, \`$2\` backreferences).
- **Target Files / Glob**: Target files to modify (e.g. \`./src/**/*.ts\`).
- **Options**:
  - **Literal Mode (-s)**: Disables regex meta-characters for exact string replacements.
  - **Create Backup (-b)**: Writes original copy to \`<file>.bak\` before replacing.
  - **Case-Insensitive (-i)**: Matches regardless of capitalization.

### 2. Live Unified Diff Preview Pane
- Shows exact diff hunks with colored line additions (green) and deletions (red).
- Match count indicator and file count summary.

### 3. Execution Action Bar
- **🔍 Preview Changes**: Evaluates replacements in memory without touching files.
- **⚡ Apply Replacements**: Writes modified files to disk safely.

### 4. Productivity Features
- **📄 Browse File… / 📁 Browse Folder…**: Pick the target with native dialogs instead of typing a path.
- **Preset dropdown**: One-click recipes that fill Find, Replace, flags and options — Trim trailing whitespace, Tabs → 4 spaces, Collapse 3+ blank lines, Windows (CRLF) → Unix (LF), Remove console.log lines, http:// → https://, and Rename identifier (whole word). Review with **Preview Diffs** before applying.
- **⇄ Swap Find/Replace**: Reverse a replacement in one click.
- **Replacement escapes (\\n \\t)**: When ticked, \`\\n\`, \`\\t\` and \`\\r\` in *Replace With* become real newlines/tabs/carriage returns (\`$1\` captures still work).
- **Only extensions / Exclude**: Limit a run to certain file types (\`ts,tsx,md\`) and skip paths by glob (\`*.min.js\`, \`vendor\`, \`test/**\`).
- **Safety**: Binary files and files over 5 MB are skipped automatically (the status bar says how many), so they cannot be corrupted by a text replace.
- **↶ Undo Last Replace**: Restores every file changed by the most recent *Replace In Files* to its previous content (kept for the current session, no backup files needed).
- **📋 Copy Diff / 💾 Save Diff As… / 📊 Save Report As…**: Copy or save the unified diff of the last preview/replace, or save a Markdown report listing each file's matches and hunks.
- **Feedback**: A toast summarises each run (matches and files), warns when nothing matched, and shows regex errors immediately.
`);

  // 20_procs_studio.md
  writeFileSync(join(outDir, "20_procs_studio.md"), `# 📈 Procs Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Process Table Telemetry  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:procs]  •  [Terminal CLI: bun run cli:procs]
\`\`\`

---

## 🌟 Executive Overview
**Procs Studio Pro** is a modern, high-contrast process inspector and system visualizer built as an ergonomic replacement for standard \`ps\`. It translates raw POSIX process tables into human-readable tables displaying CPU utilization, RSS memory footprint, listening TCP/UDP ports, process tree hierarchies, and operating system user contexts.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:procs
\`\`\`

### 2. Launch Terminal CLI Process Explorer
\`\`\`bash
# List top 10 memory-heavy processes
bun run cli:procs --sort mem --limit 10

# Search processes by keyword
bun run cli:procs --search "chrome"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Procs Studio Desktop](../../screenshots/apps/procs_studio_desktop.png) | ![Procs Studio Responsive](../../screenshots/apps/procs_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide
- **Process Table**: Lists PID, Parent PID (PPID), User, CPU%, RSS RAM, Listening Ports, and Command.
- **Process Tree View**: Collapsible tree visualizing parent-child relationship (e.g., Terminal -> zsh -> Bun -> Webview).
- **Port Correlation**: Highlights which specific PID is listening on port 3000, 5432, or 8080.
- **Signal Dispatcher**: Send \`SIGTERM\` (graceful) or \`SIGKILL\` (forceful) directly from UI.
`);

  // 21_watchexec_studio.md
  writeFileSync(join(outDir, "21_watchexec_studio.md"), `# ⚡ Watchexec Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native fs.watch & Subprocess Pipeline  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:watchexec]  •  [Terminal CLI: bun run cli:watchexec]
\`\`\`

---

## 🌟 Executive Overview
**Watchexec Studio Pro** is a standalone, continuous task execution workstation engineered on Bun's native filesystem event pipeline. As a direct replacement for external \`watchexec\` binaries, it monitors file trees, debounces rapid edits, and executes arbitrary developer commands (test suites, linters, compilers, dev servers) with zero external dependencies.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:watchexec

# Terminal CLI usage
bun run cli:watchexec -w ./src -e "bun test"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Watchexec Studio Desktop](../../screenshots/apps/watchexec_studio_desktop.png) | ![Watchexec Studio Responsive](../../screenshots/apps/watchexec_studio_responsive.png) |

---

## 🧭 Key Capabilities
- **Debounce Buffer**: Avoids multiple executions when saving multi-file projects.
- **Extension & Ignore Filters**: Focuses watcher on relevant source files only.
- **Subprocess Supervision**: Gracefully terminates prior execution before restarting tasks (toggle with **Restart on Change**).
- **Folder Browsers**: 📁 Browse buttons for the **Watch Directory** and the new **Run In** working directory.
- **Command Presets**: Dropdown of common commands (tests, type-check, lint, build) that fills the command box.
- **Live Console Streaming**: stdout/stderr appear as they are produced, with **Copy Log** and **Export Log** buttons.
- **Run History with Duration**: Status and duration per run, a **Clear History** button, and optional success/failure toasts (**Notify When Done**).
- **Path Validation**: Missing watch or working directories raise a clear error instead of failing silently.
`);

  // 22_tokei_studio.md
  writeFileSync(join(outDir, "22_tokei_studio.md"), `# 📊 Tokei Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Multi-Language Code Classifier  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:tokei]  •  [Terminal CLI: bun run cli:tokei]
\`\`\`

---

## 🌟 Executive Overview
**Tokei Studio Pro** is a fast code statistics, lines of code (LOC), and codebase composition analyzer built natively for Bun RAD Studio. Replacing external \`tokei\` and \`cloc\` binaries, it rapidly classifies source files across **50+ programming languages**, counting total files, code lines, comment lines, and blank lines.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:tokei

# Terminal CLI code counter
bun run cli:tokei ./src
bun run cli:tokei ./ --json
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Tokei Studio Desktop](../../screenshots/apps/tokei_studio_desktop.png) | ![Tokei Studio Responsive](../../screenshots/apps/tokei_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide
- **Language Composition Chart**: Visual proportion breakdown showing percentage of TypeScript, V, C++, CSS, HTML, and Markdown.
- **Metrics Table**: Displays Language, Total Files, Blank Lines, Comment Lines, Code Lines, and Comment-to-Code ratio.
- **Export Options**: One-click export to Markdown summary tables or structured JSON reports.
`);

  // 23_gdu_studio.md
  writeFileSync(join(outDir, "23_gdu_studio.md"), `# 💽 Gdu Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Recursive Disk Walker  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:gdu]  •  [Terminal CLI: bun run cli:gdu]
\`\`\`

---

## 🌟 Executive Overview
**Gdu Studio Pro** is an interactive disk usage analyzer and storage reclamation workstation designed as a modern replacement for \`gdu\`, \`ncdu\`, and \`du\`. It crawls directories in parallel, calculates exact disk space usage, renders visual proportional storage bars, and allows engineers to drill down into folders to find massive cache directories and space hogs.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:gdu

# Terminal CLI disk usage inspector
bun run cli:gdu ./
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Gdu Studio Desktop](../../screenshots/apps/gdu_studio_desktop.png) | ![Gdu Studio Responsive](../../screenshots/apps/gdu_studio_responsive.png) |

---

## 🧭 Key Capabilities
- **Proportional Storage Bars**: Instantly spot which folder consumes 80% of your disk space.
- **Directory Drill-down**: Click any folder to dive deeper into subtrees.
- **Clean Reclamation**: Directly bury large temporary folders into the Rip Graveyard.
`);

  // 24_ipinfo_studio.md
  writeFileSync(join(outDir, "24_ipinfo_studio.md"), `# 🌍 IpInfo Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: IP Geolocation (ipinfo.io / ipwho.is) & Native CIDR Math  •  Dependencies: 0  •  Lookups need internet; subnet tools offline
Launchers: [Desktop GUI: bun run app:ipinfo]  •  [Terminal CLI: bun run cli:ipinfo]
\`\`\`

---

## 🌟 Executive Overview
**IpInfo Studio Pro** is a comprehensive IP address reconnaissance, geolocation, Autonomous System Number (ASN), and CIDR subnet calculation workstation. Designed to replace third-party IP lookups and online calculators, it resolves public and local network interfaces, computes subnet host ranges, and displays geolocation data.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:ipinfo

# Terminal CLI IP lookup
bun run cli:ipinfo 8.8.8.8
bun run cli:ipinfo --subnet "192.168.1.0/24"
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![IpInfo Studio Desktop](../../screenshots/apps/ipinfo_studio_desktop.png) | ![IpInfo Studio Responsive](../../screenshots/apps/ipinfo_studio_responsive.png) |

---

## 🧭 Core Features
- **Lookup Target**: enter an IP, domain, URL or CIDR. URLs are cleaned to the host, and domains are resolved first. Press Enter in the box to run it.
- **My Public IP**: looks up your own public address.
- **Details table**: IP, hostname, city, region, country, coordinates, organization/ASN, postal code, timezone and a Google Maps link. Private, loopback and reserved addresses are classified offline (for example RFC 1918).
- **CIDR Subnet Calculator**: network, broadcast, netmask, wildcard, first/last host and host counts for an IPv4 block.
- **Local Network Interfaces**: lists your adapters; click a row to look that address up.
- **Copy JSON / Copy CSV**, **Open in Google Maps** and an optional **API Token** for ipinfo.io.

> Public lookups need an internet connection and contact ipinfo.io (falling back to ipwho.is) and DNS-over-HTTPS resolvers. Private addresses and all the subnet tools work offline.

## 🧰 Productivity Toolkit

### Bulk lookup
- Paste one IP or domain per line, or click **Load List...** to read a text file. Lines starting with \`#\` are comments.
- Commas, spaces and semicolons also separate targets. Duplicates are removed and URLs are reduced to the host.
- Up to 50 targets per run; extras are skipped and the status bar says how many.
- Each row shows target, IP, city, region, country, organization and status. Failures appear as an error row and do not stop the run.
- CIDR blocks in the list are flagged, because bulk lookup is for addresses.

### Subnet and address tools (use the target box)
- **Is IP in Target CIDR?**: type a CIDR as the target and an address in **Test IP**.
- **Split CIDR**: split a block into smaller ones, for example a /24 into four /26 blocks (shows up to 256 blocks).
- **IP Formats**: shows an IPv4 address as dotted decimal, integer, hex, binary and octal, plus its reverse-DNS zone. Integer and \`0x\` hex input are accepted.
- **Mask ⇄ Prefix**: enter \`/24\` to get \`255.255.255.0\`, or a mask to get its prefix. Non-contiguous masks are rejected.
- These tools handle IPv4 only.

### Results
- **Copy IP**, **Copy Table** (tab-separated, ready for a spreadsheet) and **Save Results...** (choose a \`.csv\` or \`.json\` name).
- **ipinfo.io Page** and **BGP / ASN Page** open the current IP in your browser.
- **Recent Lookups** keeps your last 20 lookups for the session. Click a row to repeat it, or **Clear History**.

---

## 🛠️ Step-by-Step Tutorial: Audit a List of Hosts
1. Launch with \`bun run app:ipinfo\`.
2. Paste your hosts into the bulk box, or click **Load List...**.
3. Click **Bulk Lookup** and review the table.
4. Click **Save Results...** and name the file \`hosts.csv\`.

---

## 💡 Pro Tips & Best Practices
- Lookups run one after another and the window waits while they do, so large bulk lists can take a while.
- Typed values, including the **API Token**, are kept in the saved form state. Clear the token field if you share the machine.
`);

  // 25_subfinder_studio.md
  writeFileSync(join(outDir, "25_subfinder_studio.md"), `# 🔎 Subfinder Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Passive & Active DNS Reconnaissance  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:subfinder]  •  [Terminal CLI: bun run cli:subfinder]
\`\`\`

---

## 🌟 Executive Overview
**Subfinder Studio Pro** is a passive and active subdomain reconnaissance workbench built natively for Bun. Designed for security researchers, penetration testers, and system architects, it discovers subdomains across targeted apex domains using Certificate Transparency (CT) logs, passive DNS datasets, and direct authoritative DNS probing.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:subfinder

# Terminal CLI subdomain recon
bun run cli:subfinder example.com
bun run cli:subfinder example.com --probe-http
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Subfinder Studio Desktop](../../screenshots/apps/subfinder_studio_desktop.png) | ![Subfinder Studio Responsive](../../screenshots/apps/subfinder_studio_responsive.png) |

---

## 🧭 Key Capabilities
- **Multi-Source Subdomain Enumeration**: Extracts subdomains without sending intrusive traffic to target networks.
- **HTTP / HTTPS Live Probing**: Checks status codes (200, 301, 403, 500) and page titles.
- **Export Formats**: One-click CSV, TXT, or JSON export of valid targets.
`);

  // 26_doggo_studio.md
  writeFileSync(join(outDir, "26_doggo_studio.md"), `# 🐶 Doggo Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Modern DNS Client & DNS-over-HTTPS (DoH)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:doggo]  •  [Terminal CLI: bun run cli:doggo]
\`\`\`

---

## 🌟 Executive Overview
**Doggo Studio Pro** is a modern, human-friendly DNS client and resolution diagnostics workstation built natively for Bun. As a visual desktop counterpart to \`doggo\` and modern \`dig\`, it features multi-record type querying (\`A\`, \`AAAA\`, \`MX\`, \`TXT\`, \`CNAME\`, \`NS\`, \`SOA\`, \`CAA\`, \`PTR\`, \`SRV\`), parallel record resolution (\`ALL\`), custom nameserver specification (\`@1.1.1.1\`, \`@8.8.8.8\`), DNS-over-HTTPS (DoH) support via Cloudflare and Google, and reverse PTR lookups.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:doggo

# Terminal CLI DNS query
bun run cli:doggo example.com
bun run cli:doggo example.com MX
bun run cli:doggo example.com --all
bun run cli:doggo example.com @1.1.1.1
bun run cli:doggo example.com --doh
bun run cli:doggo 8.8.8.8 -x
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1400×920) | Responsive Viewport (960×760) |
| :---: | :---: |
| ![Doggo Studio Desktop](../../screenshots/apps/doggo_studio_desktop.png) | ![Doggo Studio Responsive](../../screenshots/apps/doggo_studio_responsive.png) |

---

## 🧭 Complete UI Tour & Element Guide
- **Target Domain & Record Selector**: Dropdown covering all standard DNS record types plus parallel \`ALL\`.
- **Custom Nameserver Bar**: Query specific resolvers (\`@1.1.1.1\`, \`@8.8.8.8\`, \`@9.9.9.9\`) or local routers.
- **DNS-over-HTTPS (DoH) Toggle**: Encrypts queries via HTTPS to bypass local DNS interception and filtering.
- **Answer Table**: Displays Record Type, Host Name, TTL (Time To Live), and Resolved Data.
`);

  console.log("✔ CLI Replacements (17 to 26) generated with AAA quality.");
}
