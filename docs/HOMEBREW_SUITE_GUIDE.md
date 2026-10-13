# ⚡ Codecaine Utility Suite — Homebrew Installation & User Guide (macOS & Linux)

The **Codecaine Utility Suite** is a unified desktop application and command-line workstation suite engineered for **macOS** and **Linux**, powered by [Bun](https://bun.sh) and [Webview-Bun](https://github.com/codecaine-zz/bun_webview).

It bundles over **170+ total developer workstations, systems diagnostics, data query IDEs, and CLI utilities**:
- **68 Desktop Studio Applications** (`applications/*.ts`)
- **78 Terminal CLI Utilities** (`cli_apps/*.ts`)
- **27 Interactive Feature Showcases & Demos** (`demos/*.ts`)

---

## 🚀 Quick Install via Homebrew

### Option 1: 1-Click Interactive Shell Installer (Recommended)

Run the installer directly from the project directory:

```bash
# Link all 140+ applications and CLI utilities to your Homebrew environment:
./install_homebrew_suite.sh

# Or install with all external tools (ffmpeg, jq, ripgrep, sqlite, etc.):
./install_homebrew_suite.sh --deps
```

This generates standalone POSIX wrappers in `bin/` and symlinks them into your Homebrew binary directory (`/opt/homebrew/bin` on Apple Silicon, `/usr/local/bin` on Intel macOS, or `/home/linuxbrew/.linuxbrew/bin` on Linux).

---

### Option 2: Install via Homebrew Formula (`Formula/codecaine-utility-suite.rb`)

You can build and install the formula directly using Homebrew:

```bash
# Build from the local formula file
brew install --build-from-source ./Formula/codecaine-utility-suite.rb

# Or install with the short alias:
brew install --build-from-source ./Formula/codecaine.rb
```

---

### Option 3: Add as a Homebrew Tap

You can tap the repository locally or remotely:

```bash
# Tap the repository directly:
brew tap codecaine-zz/bun_rad_studio https://github.com/codecaine-zz/bun_rad_studio.git

# Install the suite:
brew install codecaine-utility-suite
```

---

## 💻 System Prerequisites

### macOS
- **macOS 12+** (Apple Silicon `arm64` or Intel `x86_64`)
- **Homebrew** (`/opt/homebrew` or `/usr/local`)
- **Bun runtime** (`brew install bun` or auto-installed by script)

### Linux (Ubuntu / Debian / Fedora / Arch)
- **Homebrew on Linux** (`/home/linuxbrew/.linuxbrew`)
- **Bun runtime** (`curl -fsSL https://bun.sh/install | bash` or `brew install bun`)
- **GTK3 & WebKitGTK runtime** (for GUI Studio desktop windows):
  ```bash
  # Ubuntu / Debian:
  sudo apt install -y libwebkitgtk-6.0-4 libgtk-3-0
  # Or WebKit2GTK 4.0:
  sudo apt install -y libwebkit2gtk-4.0-37

  # Fedora:
  sudo dnf install -y webkit2gtk4.0 gtk3

  # Arch Linux:
  sudo pacman -S webkit2gtk-4.1 gtk3
  ```
  *(Note: CLI utilities run completely headless without requiring any GUI or WebKit packages!)*

---

## ⚡ Master `codecaine` Command Reference

When installed, the `codecaine` master executable is directly on your `$PATH`:

```bash
# 1. Open the Unified Launcher Studio Pro GUI (or CLI overview if headless)
codecaine

# 2. View version and system runtime info
codecaine --version
codecaine info

# 3. Catalog and search tools
codecaine list                # Table of all 170+ tools
codecaine list --cli          # Show only CLI utility tools
codecaine list --apps         # Show only GUI Studio applications
codecaine list --json         # Export catalog as structured JSON
codecaine search sqlite       # Search by name, keyword, or category

# 4. Run any application or CLI utility with arguments
codecaine run database --db :memory: --query "SELECT 'Hello World' as greeting"
codecaine run system --telemetry
codecaine run calc "sqrt(144) + 12"
codecaine run redis --ping
codecaine run git --status

# 5. Shortcuts for GUI apps vs CLI tools
codecaine app sqlite_studio   # Explicitly launch a GUI Studio
codecaine cli calc            # Explicitly run a CLI utility
codecaine demo 05_crud_todo   # Run a showcase demo

# 6. Homebrew Suite Management
codecaine brew status         # View Homebrew environment and tap status
codecaine brew check          # Check required/recommended Homebrew tools
codecaine brew install-deps   # Auto-install external tools from Brewfile
codecaine brew link           # Re-link binaries into Homebrew prefix
codecaine brew unlink         # Unlink binaries from Homebrew prefix
```

---

## 🛠️ Direct Executables on `$PATH`

In addition to `codecaine run <name>`, all tools are exposed as standalone executable commands prefixed with `codecaine-`:

### 🗄️ Database, Storage & Backend Workstations
| Command | Mode | Description |
| :--- | :--- | :--- |
| `codecaine-database` | CLI | High-speed SQLite database query, migration & schema utility |
| `codecaine-sqlite-studio` | GUI | Enterprise SQLite query editor, table designer & visual join builder |
| `codecaine-mysql-studio` | GUI | Full-featured MySQL 8.x schema manager, query IDE & telemetry |
| `codecaine-postgres-studio` | GUI | Enterprise PostgreSQL workstation with Visual Query Designer |
| `codecaine-redis` | CLI | Redis telemetry, key-value inspector & latency benchmarks |
| `codecaine-redis-studio` | GUI | Real-time Redis desktop dashboard and key explorer |

### 🔍 Search, Filesystem & Process Operations
| Command | Mode | Description |
| :--- | :--- | :--- |
| `codecaine-fd` | CLI / GUI | Ultra-fast native recursive filesystem globbing & search |
| `codecaine-rip` | CLI / GUI | Safe file quarantine, seance recovery & graveyard deletion |
| `codecaine-sd` | CLI / GUI | Intuitive regex find & in-place file replacer |
| `codecaine-procs` | CLI / GUI | Modern tree process viewer and subsystem diagnostics |
| `codecaine-gdu` | CLI / GUI | Interactive disk usage analyzer & directory size profiler |
| `codecaine-tokei` | CLI / GUI | Fast source code line counter & statistics engine |
| `codecaine-watcher` | CLI / GUI | Continuous file-change watcher & automated task runner |
| `codecaine-watchexec` | CLI / GUI | Watchexec-compatible continuous process supervisor |

### 🛠️ Developer Productivity & Utilities
| Command | Mode | Description |
| :--- | :--- | :--- |
| `codecaine-api` | CLI / GUI | REST/HTTP API test client with latency profiling |
| `codecaine-system` | CLI / GUI | Hardware intelligence covering all 60 systeminformation APIs |
| `codecaine-calc` | CLI / GUI | Universal computing, bitwise & programmer calculator |
| `codecaine-crypto` | CLI / GUI | Hashing (SHA256/MD5/BLAKE), UUIDs, HMAC & token inspector |
| `codecaine-jwt` | CLI | JWT token signing, verification & expiration inspector |
| `codecaine-git` | CLI / GUI | Visual diff inspector, branch manager & working tree tool |
| `codecaine-convert` | CLI / GUI | Multi-format data converter (JSON, CSV, YAML, TOML, XML) |
| `codecaine-markdown` | CLI / GUI | Real-time Markdown live editor, viewer & exporter |
| `codecaine-env` | CLI / GUI | Environment variable vault & security auditor |
| `codecaine-devtools` | CLI / GUI | 6-in-1 OmniTool developer suite |
| `codecaine-network` | CLI / GUI | Socket inspector, port scanner, DNS diagnostics & speed test |
| `codecaine-ipinfo` | CLI / GUI | IP geolocation & network telemetry lookup |
| `codecaine-subfinder` | CLI / GUI | Subdomain reconnaissance & passive DNS scanner |
| `codecaine-doggo` | CLI / GUI | Modern DNS resolver companion |

### 🎮 Arcade & Entertainment Studios
| Command | Mode | Description |
| :--- | :--- | :--- |
| `dr-codecaine` / `codecaine-arcade` | GUI | Dr. Codecaine Overclocked Retro Arcade |
| `codecaine-minesweeper` | GUI | Minesweeper Pro Championship |
| `codecaine-tetris` | GUI | Tetris Ultra Deluxe |
| `codecaine-pacman` | GUI | Cyberpunk Pac-Man Arcade |
| `codecaine-breakout` | GUI | Cyber Breakout Deluxe |
| `codecaine-snake` | GUI | Neon Snake Deluxe |
| `codecaine-blackjack` | GUI | Blackjack Royale VIP |
| `codecaine-poker` | GUI | Texas Hold'em & 5-Card Draw Studio |
| `codecaine-word-search` | GUI | Neon Word Search Labyrinth |

---

## 🩺 Diagnostics & Health Check

Run the built-in diagnostic tool anytime:

```bash
# Check installation health:
./install_homebrew_suite.sh --doctor

# Or via master CLI:
codecaine brew status
```

Sample output:
```text
🩺 Running Codecaine Utility Suite Diagnostics:
--------------------------------------------------------
• Homebrew Prefix:  /opt/homebrew
• Homebrew Bin:     /opt/homebrew/bin
• Bun Version:      v1.4.2
• Suite Root:       /Users/codecaine/bun_rad_studio
• Local Wrappers:   256 executable binaries in bin/
• PATH Check:       ✔ 'codecaine' available at /opt/homebrew/bin/codecaine

Diagnostic check passed: Codecaine Utility Suite is active and ready to brew!
```

---

## 🧹 Uninstallation

To cleanly remove all Codecaine Utility Suite symlinks from your Homebrew environment:

```bash
./install_homebrew_suite.sh --unlink
# Or via CLI:
codecaine brew unlink
```
