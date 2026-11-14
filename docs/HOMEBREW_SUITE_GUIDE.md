# ⚡ Codecaine Utility Suite — Homebrew, Bun & npm Installation Guide

The **Codecaine Utility Suite** (`bun-rad-studio`) is a unified desktop application and command-line workstation suite for **macOS**, **Linux**, and **Windows**, powered by [Bun](https://bun.sh) and [Webview-Bun](https://github.com/codecaine-zz/bun_webview).

It bundles **215+ developer workstations, system diagnostics, database IDEs, arcade games, and CLI utilities**:
- **108+ Desktop Studio Applications** (`applications/*.ts`)
- **80 Terminal CLI Utilities** (`cli_apps/*.ts`)
- **27 Interactive Feature Showcases & Demos** (`demos/*.ts`)

---

## 📦 Option 1: Install Globally with Bun or npm (macOS, Linux & Windows)

The fastest cross-platform way to install the suite is via **`bun`** or **`npm`**:

```bash
# Using Bun (recommended):
bun add -g bun-rad-studio

# Using npm / Node.js (automatically installs the official `bun` runtime dependency):
npm install -g bun-rad-studio

# Zero-install one-shot execution:
bunx bun-rad-studio --help
npx bun-rad-studio list
```

To build or pack the npm/Bun distribution locally from a source checkout:

```bash
bun run npm:build    # Builds code-split multi-OS package into dist/npm/
bun run npm:pack     # Builds dist/npm/ and packs dist/bun-rad-studio-<version>.tgz
```

---

## 🍺 Option 2: Install via Homebrew (macOS & Linux — Homebrew 7+ Ready)

### 2A. One-Line Remote Installer (Pre-Built Formula + Optional macOS `.app` Cask)

No git clone or compilation required — configures and trusts `codecaine-zz/tap` automatically (including **Homebrew 7+** tap trust) and installs pre-built release binaries:

```bash
# Install pre-built CLI + Desktop Suite Formula (macOS arm64/x64 & Linux arm64/x64):
curl -fsSL https://raw.githubusercontent.com/codecaine-zz/bun_rad_studio/main/install_homebrew_suite.sh | bash

# macOS only — install native "Codecaine File Manager.app" into /Applications (clears Gatekeeper quarantine):
curl -fsSL https://raw.githubusercontent.com/codecaine-zz/bun_rad_studio/main/install_homebrew_suite.sh | bash -s -- --cask
```

### 2B. Manual Homebrew Tap Commands (`codecaine-zz/tap`)

> **Homebrew 7+ Note:** Homebrew 7 removed direct `./Formula/*.rb` path installs and requires `brew trust` for third-party taps. Run `./install_homebrew_suite.sh --tap` (from a checkout) or tap your published tap repository and trust it first:

```bash
# Configure and trust the tap from a local checkout:
./install_homebrew_suite.sh --tap

# Or if using a remote tap repository:
brew tap codecaine-zz/tap https://github.com/codecaine-zz/bun_rad_studio.git
brew trust codecaine-zz/tap   # Required on Homebrew 7+

# Install the pre-built suite (or short alias `codecaine`):
brew install codecaine-zz/tap/codecaine-utility-suite
# Alias:
brew install codecaine-zz/tap/codecaine

# macOS native app bundle in /Applications:
brew install --cask codecaine-zz/tap/codecaine-file-manager

# Build bleeding-edge --HEAD from source:
brew install --HEAD codecaine-zz/tap/codecaine-utility-suite
```

### 2C. Link Directly from a Local Source Checkout

If you cloned the repository locally for development, symlink all `codecaine-*` wrappers directly into Homebrew's `bin` directory (`/opt/homebrew/bin`, `/usr/local/bin`, or `/home/linuxbrew/.linuxbrew/bin`):

```bash
./install_homebrew_suite.sh --link

# Optional: also install recommended companion CLI tools from Brewfile (jq, ripgrep, fd, ffmpeg, etc.):
./install_homebrew_suite.sh --link --deps
```

---

## 💻 System Prerequisites

### macOS
- **macOS 12 Monterey+** (Apple Silicon `arm64` or Intel `x86_64`)
- Uses macOS's built-in Apple WebKit framework for desktop windows (zero extra GUI packages needed)

### Linux (Ubuntu / Debian / Fedora / Arch)
- **CLI Utilities:** Run 100% headless with zero GUI libraries required.
- **Desktop Studio Windows:** Require **GTK 4** and **WebKitGTK 6.0**:
  ```bash
  # Ubuntu 24.04+ / Debian:
  sudo apt install -y libgtk-4-1 libwebkitgtk-6.0-4

  # Fedora:
  sudo dnf install -y gtk4 webkitgtk6.0

  # Arch Linux:
  sudo pacman -S gtk4 webkitgtk-6.0
  ```

### Windows
- **Windows 10 / 11** (`x64` or `arm64`) via `bun add -g bun-rad-studio`, `npm install -g bun-rad-studio`, or the standalone `.zip` installer in GitHub Releases.
- Uses Microsoft Edge WebView2 (pre-installed on Windows 11).

---

## ⚡ Master `codecaine` Command Reference

Once installed via Homebrew, `bun`, or `npm`, the `codecaine` (and `bun-rad-studio`) master executable is on your `$PATH`:

```bash
# 1. Version, health diagnostics & one-step upgrades
codecaine --version
codecaine doctor              # Full health check (install method, runtime, WebView, PATH)
codecaine upgrade             # Upgrades via Homebrew, bun, npm, or git automatically

# 2. Launch Unified Workstation GUI
codecaine gui                 # Opens Launcher Studio Pro desktop window
codecaine-file-manager        # Opens Codecaine File Manager Studio

# 3. Catalog and search tools
codecaine list                # Table of all 215+ tools
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
codecaine brew doctor         # Run Homebrew suite diagnostics
codecaine brew cask           # Install Codecaine File Manager.app Cask on macOS
codecaine brew check          # Check optional companion Homebrew tools
codecaine brew install-deps   # Auto-install external tools from Brewfile
codecaine brew link           # Re-link local checkout binaries into Homebrew prefix
codecaine brew unlink         # Unlink local checkout binaries from Homebrew prefix
```

---

## 🛠️ Direct Executables on `$PATH`

In addition to `codecaine run <name>`, tools are exposed as collision-free standalone commands prefixed with `codecaine-`:

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
| `codecaine-file-manager` | GUI | Featured Dual-Pane File Manager, Media Deck, Secrets Vault & Dev IDE |
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

## 🩺 Diagnostics, Maintainer Sync & Uninstallation

### Diagnostics
```bash
codecaine doctor
# Or via shell installer:
./install_homebrew_suite.sh --doctor
```

Sample output:
```text
🩺 Codecaine Utility Suite Health Check:
──────────────────────────────────────────────────────────
  • Suite Version:      v1.5.4
  • Install Method:     homebrew-formula
  • Install Root:       /opt/homebrew/Cellar/codecaine-utility-suite/1.5.4/libexec
  • Bun Runtime:        ✔ v1.4.4 (darwin-arm64)
  • Detected Catalog:   ✔ 215 tools (108 GUI Studios, 80 CLI Tools, 27 Demos)
  • Global PATH:        ✔ /opt/homebrew/bin/codecaine
  • Desktop WebView:    ✔ libwebview.dylib ready
  • Homebrew Status:    ✔ /opt/homebrew
```

### Keeping Homebrew Formulae & Casks Synced on Release
`bun run release:publish` automatically updates `Formula/codecaine-utility-suite.rb`, `Formula/codecaine.rb`, `Casks/codecaine-file-manager.rb`, and `dist/homebrew-tap/` with verified `SHA256SUMS.txt` hashes. You can also sync or verify them manually anytime:

```bash
bun run brew:sync          # Syncs Formula/*.rb, Casks/*.rb, and dist/homebrew-tap/
bun run brew:sync:check    # Verifies Homebrew files match current version & SHA256SUMS
```

### Uninstallation
```bash
# Homebrew (Formula, Cask, or local symlinks):
./install_homebrew_suite.sh --uninstall

# Global Bun / npm:
bun remove -g bun-rad-studio
npm uninstall -g bun-rad-studio
```
