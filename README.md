# ⚡ Bun RAD Studio (Delphi / Visual Basic Style IDE)

A high-performance Rapid Application Development (RAD) Visual IDE for **Bun** and **Webview-Bun**, inspired by classic Borland Delphi and Visual Basic 6, built with modern web technologies.

[![Bun](https://img.shields.io/badge/Bun-v1.3.14-orange?style=for-the-badge&logo=bun)](https://bun.sh)
[![Webview-Bun](https://img.shields.io/badge/Webview--Bun-v2.4.0-blue?style=for-the-badge)](https://github.com/codecaine-zz/bun_webview)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![RAD Designer](https://img.shields.io/badge/RAD%20Designer-Included-10b981?style=for-the-badge)](docs/API.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)
[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-00457C?style=flat-square&logo=paypal&logoColor=white)](https://paypal.me/codecaine81)

> 📖 **Quick Links:** [📚 Documentation handbook](docs/index.md) • [🛠️ Developer handbook](docs/developer/handbook.md) • [🔒 Security](docs/security.md) • [🩺 Troubleshooting](docs/troubleshooting.md) • [📖 Glossary](docs/glossary.md) • [🍺 Homebrew Suite Guide](docs/HOMEBREW_SUITE_GUIDE.md) • [🗂️ File Manager](#codecaine-file-manager) • [⚡ Project Launcher](#-quick-start-clone-install--launch) • [Application User Guides](docs/userguides/README.md) • [API Specification](docs/API.md) • [SimpleGUI Manual](docs/SIMPLEGUI_API.md) • [Theme Gallery (76 Themes)](docs/THEMES.md) • [Interactive Demos](#3-run-interactive-feature-demos) • [Enterprise Applications](#-39-enterprise-production-workstations--utilities) • [Ecosystem Projects](#related-rad--gui-ecosystem-projects)

---

<a id="download"></a>

## ⬇️ Download (no coding, no compiling)

**[→ Latest release](https://github.com/codecaine-zz/bun_rad_studio/releases/latest)**: pick the file for your computer, unzip it, open it.

| You have | Download |
|---|---|
| 🍎 **Mac** (M1 or newer / Intel) | `Codecaine-File-Manager-…-macos-arm64.zip` / `…-macos-x64.zip`: a double-click `.app` with its own icon |
| 🪟 **Windows** (most PCs / ARM / pre-2013 CPUs) | `Codecaine-File-Manager-…-windows-x64.zip` / `…-windows-arm64.zip` / `…-windows-x64-baseline.zip` |
| 🐧 **Linux** (Intel/AMD / ARM / pre-2013 CPUs) | `Codecaine-File-Manager-…-linux-x64.zip` / `…-linux-arm64.zip` / `…-linux-x64-baseline.zip` |

The same release also has **every desktop app as a Mac `.app`** (65 apps, in three zips per Mac type) and **the whole suite** (every desktop app and command-line tool) for each platform. Each file's checksum is in `SHA256SUMS.txt`. The apps are not signed with an Apple or Microsoft certificate, so the first launch shows a security prompt (Mac: right-click → **Open**; Windows: **More info → Run anyway**).

Maintainers: `bun run release:file-manager`, `bun run release:build -- --mac-apps` (and `bun run build:mac-apps -- --arch x64 --zip --out release/mac-apps-x64`), then `bun run release:publish` creates the GitHub Release and points the website page (`release/file-manager/index.html`) at it. Add `-- --dry-run` to preview.

---

<a id="codecaine-file-manager"></a>

## 🗂️ Featured: Codecaine File Manager

**A friendly, safe file manager for macOS, Windows and Linux, with a whole toolbox built in.** It looks after your files first (every delete can be undone, risky actions are explained in plain words) and then gives you the tools you would otherwise install ten programs for.

| Browse and preview | Convert in batches |
| :--- | :--- |
| ![Codecaine File Manager showing a selected picture and its preview](screenshots/apps/file_manager_studio_desktop.png) | ![The Convert and process window listing what can be done with three selected pictures](screenshots/apps/file_manager_studio_convert.png) |
| **Terminal in the current folder** | **Fits a smaller window** |
| ![Codecaine File Manager with its terminal open](screenshots/apps/file_manager_studio_terminal.png) | ![Codecaine File Manager in a narrow window](screenshots/apps/file_manager_studio_responsive.png) |

```bash
bun run app:files            # open the desktop app
bun run app:files --reset-window   # forget the saved window size and position
```

Downloaded a release instead? Run `./bin/file-manager-studio`. Everything below is in [the File Manager user guide](docs/userguides/43_file_manager.md).

| | What you get |
| :--- | :--- |
| 🗃️ **Everyday files** | Sidebar and address bar anyone can read, previews, drag and drop, a **dual view** whose right pane has every option of the left, favorites, workspace views, an undoable Recycle Bin, **New SQLite database** from the right-click menu, one-click shortcuts to every tool, and **Permissions** (a Read/Write/Run grid with a preview and one-step Undo, plus macOS Locked/Hidden and Windows attributes). |
| 🪟 **A window that remembers** | Opens filling the screen; once you resize or move it, it remembers, and **Reset window to default** is always one click away. |
| 🔄 **Convert and process** | Batch conversion of pictures, video, sound, documents and archives (Zstandard built in), with **one-click setup** of the helper programs through Homebrew, apt, dnf, pacman, winget or Scoop. |
| 🔐 **Secrets** | An encrypted password manager and secure notes: AES-256-GCM, Argon2id, optional key file and recovery key (copy it or save it to a file instead of typing it), one-time codes, importers, auto-locking clipboard. [How it works](docs/security.md#secrets-vault-radsec) |
| 🔒 **Encrypt files and folders** | Lock any file or folder with a password. |
| 🗄️ **Databases** | SQLite, MySQL/MariaDB, PostgreSQL and Redis studios built in, with saved connection profiles (passwords in your system keychain) that take priority over environment variables, auto-detect from your environment and `.env` files, and quick-open shortcuts in a window or your browser. The SQL studios have a datasheet (hide, resize, rename and freeze columns), a Create view dialog, a Focus mode, **11 production-style sample databases** (such as a Medicare Part D formulary builder, hospital records, banking and e-commerce) and a guided **load into staging first** import with checks, dry run and undo. [Sample datasets](docs/databases/sample-datasets.md) · [Staging import](docs/databases/staging-import.md) |
| 🪦 **Graveyard** | Bury files with Rip (Alt+Delete), browse, restore or delete them for good. |
| 🔭 **Subdomains** | Passive subdomain discovery from several sources, with safe, opt-in DNS, HTTP and port checks. |
| 🧑‍💻 **For developers** | A terminal that opens in the folder you are looking at, a Code editor, code statistics (Dev tab), a live server and PHP server, Find, Replace, Watch, Network, IP info, Crypto (UUID v7 and more) and Bun's own built-in utilities. |
| 🎨 **135 themes** | Including futuristic themes with a motion layer, and a theme editor. |
| ℹ️ **Know your files** | Warns when a file isn't what its name says, and shows image and file details and metadata. |

> Built with care but not independently audited. Read [what was and was not verified](docs/userguides/43_file_manager.md#what-was-verified-and-what-was-not) before trusting it with anything you cannot replace.

Made by [codecaine](https://www.codefreelance.net) · [YouTube](https://www.youtube.com/@codecaine) · [Markdown Tutorials app](https://codefreelance.net/apps/markdown_tutorials/) · [Donate with PayPal](https://paypal.me/codecaine81)

---

## 🚀 Quick Start: Clone, Install & Launch

### 🍺 Install Codecaine Utility Suite with Homebrew (macOS & Linux)

Install and expose all 170+ applications and CLI tools directly on your system `$PATH`:

```bash
# 1. 1-Click Homebrew setup (symlinks all 140+ tools into Homebrew bin):
./install_homebrew_suite.sh

# 2. Or install via Homebrew Formula:
brew install --build-from-source ./Formula/codecaine-utility-suite.rb

# 3. Test the master executable anywhere in your terminal:
codecaine --version
codecaine list
codecaine run database --db :memory: --query "SELECT 'Hello from Codecaine!' as msg"
```

> 📘 *See the full [Homebrew Suite Guide (docs/HOMEBREW_SUITE_GUIDE.md)](docs/HOMEBREW_SUITE_GUIDE.md) for tap instructions, Linux WebKitGTK prerequisites, and complete binary reference.*

### 🛠️ Standard Repository Quick Start

First thing when cloning this repository from GitHub, run `bun install` to install all dependencies, then launch the project workstation:

```bash
# 1. Clone repository & install dependencies
git clone https://github.com/codecaine-zz/bun_rad_studio.git
cd bun_rad_studio
bun install

# 2. Open the Unified Project Workstation Launcher (170+ Tools Auto-Detected)
bun run app:launcher

# 🛠️ Or search & run from Terminal (CLI Companion)
bun run cli:launcher --list
bun run cli:launcher --search sqlite
```

> [!TIP]
> ### ⚡ Instant Unified Project Workstation Launcher (`bun run app:launcher`)
> **Quickly test and launch every single tool in this repository with 1-click:**
> *Auto-detects and launches all **65 Studio Applications**, **77 CLI Utilities**, and **27 Showcase Demos** (169+ tools total) with real-time process monitoring, 1-click quick execution, category filtering, and native Terminal client spawning!*

### ⚡ Launcher Studio Pro (`bun run app:launcher`)

![Launcher Studio Pro Desktop Screenshot](screenshots/apps/launcher_studio_desktop.png)

> **✨ New in Launcher Studio Pro:**
> - **⚡ 1-Click Quick Launch Toolbars**: Instant 1-click execution buttons for **Core & Featured Studios** (SQLite, Redis, API, Task Manager, App Bundler, NovaCode, Env Studio, IP Geolocation, Interval Timer, Dr. Codecaine, Lolo, Tetris), matching **GUI Studio Versions of CLI Tools** (System Studio, Database Studio, Fd Studio, Git Studio, Tokei Studio, Gdu Studio, Network Studio, Crypto Studio), and **Terminal CLI Companions** (System CLI, Database CLI, Fd CLI, Git CLI, Tokei CLI, Gdu CLI, Network CLI, Crypto CLI).
> - **⌨️ Return / Enter Key Launch**: Pressing <kbd>Enter</kbd> or <kbd>Return</kbd> while navigating or selecting any tool in the interactive ListBox (`lst_apps`) instantly auto-launches the application.
> - **📁 1-Click Category Filter Strip**: Filter tools with 1-click buttons: All Tools, Database, DevTools, System, Files, Network, Productivity, Games, Security, Design, Demos, CLI with live count badges.
> - **⭐ Pinned Favorites & 1-Click Launch**: Star any tool with the `⭐ Favorite` (`btn_fav`) toggle button. Telemetry card tracks live `⭐ Favorites: N`. Launch your highest priority tool with a single click via `🚀 Launch Top Favorite` (`btn_quick_launch_fav1`).
> - **⚡ 1-Click Favorites Filter**: Instantly isolate your pinned tools using the dedicated `⭐ Favorites Only` filter button in the search toolbar or `⭐ Filter to Favorites` in the quick launch strip.
> - **🎯 Rock-Solid Top ⇄ Bottom Selection Stability**: Selection across Top controls (`dd_select_app` dropdown and `lst_apps` listbox) and the Bottom table catalog (`tbl_apps`) stays 100% synchronized and stable. Applying any filter, search query, or category preserves your active selection if it still matches, without jumping or desynchronizing.
> - **⚡ Double-Click Auto-Launch**: Double-clicking any list item in the top ListBox or any row in the bottom Catalog Table immediately launches the selected application or CLI tool.
> - **💻 CLI Companion with Favorites**: `bun run cli:launcher -f` filters pinned favorites right in your terminal, and `-F <id>` toggles star status from any script.

### 🎨 Visual RAD Form Designer & IDE (`bun start`)

![Bun RAD Studio Application Screenshot](screenshot.png)

### ⚡ Modern Productivity UI Controls Studio (`demo:productivity`)

![Modern Productivity UI Controls Studio Screenshot](screenshot_productivity.png)

### ⚡ SimpleGUI Ergonomics & Shortcuts API Showcase (`demos/18_simplegui_ergonomics_demo.ts`)

![SimpleGUI Ergonomics & Shortcuts Demo Screenshot](screenshot_ergonomics.png)

<a id="build-binaries-for-every-platform"></a>

### 📦 Compile binaries for every platform (`bun run release:build`)

One command builds every desktop app and every command-line tool for **macOS, Linux and Windows, on ARM and Intel**, as archives you can attach to a GitHub release. You need [Bun](https://bun.sh) and the internet the first time (Bun downloads one small runtime per platform, then caches it). Run it from a clone with `bun install` done.

```bash
bun run release:build                              # all platforms -> release/
bun run release:build -- --targets linux-arm64,windows-x64   # only some of them
bun run release:build -- --list                    # show every platform and what it needs
bun run release:build -- --mac-apps                # also the Mac .app files (needs a Mac)
bun run build:mac-apps                             # only the Mac .app files, each with its own icon
bun run release:file-manager                       # File Manager only: one zip per OS/CPU + a download page -> release/file-manager/
```

`release:file-manager` makes the downloads for a website (`bun run release:publish` then uploads everything to a GitHub Release and rewrites `index.html` so its buttons download from there): a macOS `.app` (with its icon, Apple silicon and Intel), Windows (x64, ARM64, older x64) and Linux (x86-64, ARM64, older x86-64), each in its own zip, plus `index.html` (one button per zip, highlights the right one for the visitor) and `SHA256SUMS.txt`. Upload the whole `release/file-manager/` folder. Build it on a Mac: the `.app` needs macOS tools.

**What you get** in `release/` (about 130 MB per platform, 37 MB for the command-line-only ones):

| File | For | Desktop apps |
| :--- | :--- | :---: |
| `bun-rad-studio-v1.0.0-macos-arm64.tar.gz` | Apple silicon Macs | yes |
| `…-macos-x64.tar.gz` | Intel Macs | yes |
| `…-linux-x64.tar.gz`, `…-linux-x64-baseline.tar.gz` | 64-bit Intel/AMD Linux (baseline = CPUs from before 2013) | yes |
| `…-linux-arm64.tar.gz` | 64-bit ARM Linux (Raspberry Pi OS 64-bit, Graviton …) | yes |
| `…-linux-x64-musl.tar.gz`, `…-linux-arm64-musl.tar.gz` | Alpine and other musl Linux | tools only |
| `…-windows-x64.zip`, `…-windows-x64-baseline.zip` | 64-bit Windows 10/11 | yes |
| `…-windows-arm64.zip` | Windows on ARM (the desktop apps run from the x64 file by emulation) | tools only |
| `…-macos-arm64-apps-1of3.zip` … | the Mac `.app` bundles (with `--mac-apps`) | yes |
| `SHA256SUMS.txt`, `RELEASE_NOTES.md` | checksums and a ready-made "which one do I pick" page | |

Each archive holds the platform's Bun runtime, every app bundled to one file, the window library, the resources and a launcher per app (`bin/file-manager-studio`, `bin/fd-cli` …), so people can run it **without installing Bun or this project**. 32-bit processors are not offered (Bun does not support them).

**Publish it:**

```bash
gh release create v1.0.0 release/*.tar.gz release/*.zip release/SHA256SUMS.txt -F release/RELEASE_NOTES.md
```

Change `version` in `package.json` first; it names every file.

**Using a download** (this is also in each archive's `README.txt`):

```bash
tar -xzf bun-rad-studio-v1.0.0-linux-arm64.tar.gz && cd bun-rad-studio-v1.0.0-linux-arm64
./bin/file-manager-studio          # a desktop app
./bin/fd-cli --help                # a command-line tool
sh install.sh                      # optional: put everything on your PATH and in the Linux applications menu
```

| Platform | Needs |
| :--- | :--- |
| macOS | Nothing. For downloaded files run `xattr -dr com.apple.quarantine .` once (the apps are signed ad hoc, not notarized) |
| Linux (glibc) | GTK 4 and WebKitGTK 6.0 for the desktop apps: `sudo apt install libgtk-4-1 libwebkitgtk-6.0-4` (Debian/Ubuntu 24.04+), `sudo dnf install gtk4 webkitgtk6.0` (Fedora) |
| Alpine / musl | `apk add libstdc++ libgcc` (command-line tools only) |
| Windows | The Microsoft WebView2 runtime (already part of Windows 11) |

**One app as a single-file executable** (any Bun target, cross-compiled from any computer): Bun can also embed a program and its runtime into one file, for example the command-line tools:

```bash
bun build --compile --target=bun-linux-arm64 --outfile=dist/fd-cli cli_apps/fd_cli.ts
bun build --compile --target=bun-windows-x64 --outfile=dist/fd-cli.exe cli_apps/fd_cli.ts
```

Targets: `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-linux-x64-baseline`, `bun-linux-arm64`, `bun-linux-x64-musl`, `bun-linux-arm64-musl`, `bun-windows-x64`, `bun-windows-x64-baseline`, `bun-windows-arm64`. Desktop apps also need their window library and `resources/` folder next to them, which is why the archives above are the recommended way to ship them. The [App Bundler Studio](docs/userguides/11_app_bundler_studio.md) (`bun run app:bundler`) wraps the single-file compile in a window.

What was verified (macOS and Linux ARM) and what was not (Intel, Windows), plus how it works inside: [Building releases](docs/developer/releasing.md).

### 🎨 Complete All-Controls Single-Form Theme Showcase (`bun run demo:themes`)

![Theme Showcase - Monokai Pro Single Form](screenshots/themes/monokai_pro.png)

---

## 📑 Table of Contents

- [🗂️ Featured: Codecaine File Manager](#codecaine-file-manager)
- [🌟 Highlights & Features](#highlights--features)
  - [🚀 Visual RAD Form Designer](#visual-rad-form-designer)
  - [🖼️ Native Window Management & Placement API](#native-window-management--placement-api)
  - [🗄️ MS Access & Delphi Data-Aware RAD Controls](#ms-access--delphi-data-aware-rad-controls)
  - [🎨 70+ Modern UI & RAD Controls](#70-modern-ui--rad-controls)
  - [🎨 Built-in Desktop Form Themes & Visual Gallery (133 Themes)](#built-in-desktop-form-themes--visual-gallery-133-themes)
  - [🛠️ High-Level Backend & Client Helper Utilities](#high-level-backend--client-helper-utilities)
  - [⚡ Auto-Generated Code & Multi-Target Exporters](#auto-generated-code--multi-target-exporters)
- [📦 Compile binaries for every platform](#build-binaries-for-every-platform)
- [💻 Installation & Quick Start](#installation--quick-start)
  - [Prerequisites](#prerequisites)
  - [Linux System Dependencies (`libwebkitgtk-6.0-4`)](#linux-system-dependencies-libwebkitgtk-60-4)
  - [1. Clone & Install Dependencies](#1-clone--install-dependencies)
  - [2. Launch RAD Studio](#2-launch-rad-studio)
  - [3. Run Interactive Feature Demos](#3-run-interactive-feature-demos)
- [⚡ 26 Enterprise Production Workstations & Utilities](#26-enterprise-production-workstations--utilities)
  - [📸 Application Visual Gallery & Screenshots](#application-visual-gallery--screenshots)
- [📦 Dist Build Process](#dist-build-process)
  - [Commands](#commands)
  - [`dist/` Output Structure](#dist-output-structure)
  - [Importing from `dist/` in Another Bun Project](#importing-from-dist-in-another-bun-project)
- [📦 Compiling Standalone macOS Binaries (.app) with Custom Icons](#-compiling-standalone-macos-binaries-app-with-custom-icons)
  - [Option 1: Native Single-File Executable via `build:binary`](#option-1-native-single-file-executable-via-buildbinary)
  - [Option 2: Full macOS `.app` Bundle with Custom Icons](#option-2-full-macos-app-bundle-with-custom-icons)
- [🎨 Declarative SimpleGUI Module (`simplegui`)](#-declarative-simplegui-module-simplegui)
  - [Key Features](#key-features)
- [📚 Documentation Reference: API.md vs. SIMPLEGUI_API.md](#documentation-reference-apimd-vs-simplegui_apimd)
  - [📖 Summary of API Files](#summary-of-api-files)
- [⌨️ Keyboard Shortcuts & Power Actions](#keyboard-shortcuts--power-actions)
- [📂 Project Structure](#project-structure)
- [🌟 Related RAD & GUI Ecosystem Projects](#related-rad--gui-ecosystem-projects)
- [💙 Support & Donations](#support--donations)
- [📄 License](#license)

---

<a id="highlights--features"></a>

## 🌟 Highlights & Features

<a id="visual-rad-form-designer"></a>

### 🚀 Visual RAD Form Designer

- **Interactive Canvas**: Drag, nudge, resize, and align components visually on a high-DPI scaled canvas with pixel rulers and smart grid snapping (8px, 16px, 4px, or off).
- **Delphi Anchors & Docking System**: Full support for component `Anchors` (`Top`, `Left`, `Right`, `Bottom`) and `Dock` modes (`None`, `Top`, `Bottom`, `Left`, `Right`, `Fill`) so forms dynamically reflow when resized.
- **Non-Visual Component Tray**: Visual bottom tray below the form canvas for non-visual RAD controls (`Timer`, `OpenFileDialog`, `SaveFileDialog`, `DBConnection`, `HTTPClient`, `Notification`) just like Borland Delphi and Lazarus.
- **Delphi Placement Mode**: Click any palette component to arm the placement crosshairs, then click anywhere on the canvas to place it at exact coordinates. Hold `Shift` while clicking to place multiple controls sequentially.
- **Marquee Multi-Selection**: Left-click and drag across the canvas background to marquee select groups of components.
- **Component Hierarchy & Tree**: View, filter, and select components in a real-time DOM hierarchy tree.

<a id="native-window-management--placement-api"></a>

### 🖼️ Native Window Management & Placement API

- **Native Fullscreen Mode & Startup**: Every studio application launches in native fullscreen by default (`{ fullscreen: true }`) with automatic CoreGraphics/Win32 screen resolution auto-fitting (`(0,0)` origin) and a promise-aware verification loop. Press **<kbd>Cmd</kbd> + <kbd>F</kbd>** / **<kbd>Ctrl</kbd> + <kbd>F</kbd>** / **<kbd>Fn</kbd> + <kbd>F</kbd>** / **<kbd>F11</kbd>**, or click `⛶ Fullscreen` to toggle native borderless fullscreen mode.
- **Smart Minimize & Hide**: Press **<kbd>Cmd</kbd> + <kbd>M</kbd>** / **<kbd>Ctrl</kbd> + <kbd>M</kbd>** to minimize the window. If the application is in a native macOS fullscreen space, it automatically exits fullscreen before miniaturizing to the Dock. Press **<kbd>Cmd</kbd> + <kbd>H</kbd>** / **<kbd>Ctrl</kbd> + <kbd>H</kbd>** to hide the application window (`[NSApp hide:]`).
- **Stay On Top (Window Pinning)**: Click `📌 Pin: ON / OFF`, press **<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>** / **<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>**, or call `setAlwaysOnTop(true)` to float the application window above all other desktop applications (`NSFloatingWindowLevel`).
- **Window Placement & Centering API**: Position application windows anywhere on screen using `setWindowPosition(pos)`, press **<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>** / **<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>C</kbd>** to center, or use the `📍 Position` toolbar dropdown across 9 screen presets (`"center"`, `"upper_left"`, `"upper_right"`, `"top_center"`, `"bottom_left"`, `"bottom_right"`, `"bottom_center"`, `"center_left"`, `"center_right"`).
- **Guaranteed Process Termination**: Press **<kbd>Cmd</kbd> + <kbd>Q</kbd>** / **<kbd>Cmd</kbd> + <kbd>W</kbd>** (macOS) or **<kbd>Alt</kbd> + <kbd>F4</kbd>** / **<kbd>Ctrl</kbd> + <kbd>Q</kbd>** / **<kbd>Ctrl</kbd> + <kbd>W</kbd>** (Windows/Linux), or double-tap **<kbd>Alt</kbd>** to immediately close the window and cleanly exit the terminal process (`process.exit(0)`).

<a id="ms-access--delphi-data-aware-rad-controls"></a>

### 🗄️ MS Access & Delphi Data-Aware RAD Controls

- **Data-Aware Controls**: Access & Delphi style DB controls including `DBGrid` with sorting/paging, `DBNavigator` (First/Prev/Next/Last/Add/Delete/Post/Refresh), `DBInput`, and `DBDropdown` with live dataset field bindings.
- **1-Click Database CRUD Form Wizard**: Instant 1-click wizard button that auto-generates a complete, ready-to-run Customer Accounts Database CRUD layout.

<a id="70-modern-ui--rad-controls"></a>

### 🎨 70+ Modern UI & RAD Controls

- **Standard Controls**: Buttons, Labels, Single-Line Inputs, Password Inputs, Textareas, Checkboxes, Radio Buttons, Toggles/Switches, Sliders, Number Steppers, Color Wells, Date Pickers, and File Pickers.
- **Integrated Labeled Form Controls**: Form Field (`form_field`), Labeled Password (`form_password`), Labeled Textarea (`form_textarea`), Labeled Checkbox (`form_checkbox`), Labeled Radio (`form_radio`), Labeled Search Bar (`form_search`), Labeled Color Well (`form_color`), Labeled Time Picker (`form_time`), Labeled Stepper (`form_stepper`), Labeled Code Editor (`form_code`), Labeled File Drop Zone (`form_drop_zone`), Labeled Switch (`form_switch`), Labeled Slider (`form_slider`), Labeled Number (`form_number`), Labeled Date (`form_date`), Labeled Dropdown (`form_dropdown`), Labeled Link (`form_link`), and Labeled Progress (`form_progress`).
- **Desktop Application UI Controls**: Tab Container (`tabs`), Action Toolbar (`tool_bar`), Window Status Bar (`status_bar`), Split View Panel (`split_pane`), Pagination Bar (`pagination`), Command Palette Search (`command_palette`), Icon Toggle Button (`toggle_button`), Property Inspector Grid (`property_grid`), Popup Context Menu (`popup_menu`), Month Calendar View (`calendar_view`), Color Palette Swatch (`color_swatch`), File Path Location Bar (`file_path_bar`), Kanban Task Board (`kanban_board`), Keyboard Shortcut Recorder (`shortcut_recorder`), Split Action Button (`split_button`), Sparkline Data Table (`sparkline_table`), KPI Metric Comparison (`metric_comparison`), Activity Feed Stream (`activity_feed`), and Workspace Tab Bar (`file_tree_tabs`).
- **Advanced Modern Controls**: Segmented Control (`segmented_control`), Directory Tree Explorer (`tree_view`), Stacked User Profile Avatars (`avatar_group`), Executive KPI Stat Card with SVG Sparkline (`stat_chart`), Collapsible Accordion Panel (`accordion`), Step Navigation Breadcrumbs (`breadcrumb`), Step Activity Timeline (`timeline`), Floating Notification Toast Alert (`toast_card`), Precision Clock Time Picker (`time_picker`), and Searchable Combobox (`rich_select`).
- **Data & Non-Visual Controls**: DB Grid, DB Navigator, DB Field, DB Lookup, Timer, File Dialogs, DB Connection, REST HTTP Client, Notification.
- **Containers & Layout**: Group Box Panels, Data Tables, and Horizontal Dividers.
- **Form Presets & Templates**: Includes pre-built templates for Customer Registration, Auth Login, Executive Analytics Dashboard, User Profile, Data CRUD Manager, Help Desk Support Tickets, REST API Tester, Media Player, and E-Commerce Checkout.

<a id="built-in-desktop-form-themes--visual-gallery-133-themes"></a>

### 🎨 Built-in Desktop Form Themes & Visual Gallery (133 Themes)

Bun RAD Studio and SimpleGUI feature **63 built-in, pixel-perfect desktop UI themes** covering signature developer aesthetics, modern operating system environments (macOS Sonoma, Windows 11 Fluent Acrylic & Mica, Ubuntu Yaru, GNOME Libadwaita, Linux Mint Cinnamon, System76 Pop!\_OS, Fedora Workstation), popular syntax themes (Monokai Pro, Tokyo Night, One Dark Pro, Gruvbox, Rosé Pine, Everforest, Kanagawa, Dracula, Nord, Catppuccin), and authentic nostalgic retro platforms (Windows 95, Commodore 64, Amiga, Macintosh System 7, Game Boy, Matrix Phosphor, Amber CRT, Synthwave '84, NeXTSTEP, Mac OS X Aqua, Hot Dog Stand, PlayStation 1994).

> [!TIP]
> ### 🖼️ Complete Visual Gallery & Theme Catalog in `docs/THEMES.md`
> **Instead of listing all 133 themes and screenshots here, the complete visual catalog, side-by-side screenshots, color hex codes, and quick launch commands are thoroughly documented in:**
> 👉 **[🖼️ View the Complete 63-Theme Visual Gallery in docs/THEMES.md](docs/THEMES.md)**

Every theme automatically harmonizes:

- Form canvas backgrounds and typography foregrounds
- Inset input backgrounds, focus rings, and selection accents
- Card, panel, and groupbox container borders and background tints
- Primary action button contrast (auto-calculated black or white text based on accent luminance)
- Dropdown select chevron arrows and option menus
- Data table headers, alternate zebra row shading, and hover highlights
- Sliders, range thumbs, progress meters, and status badge colorways

#### ⚡ Interactive All-Controls Theme Studio (`bun run demo:themes`)

Test and preview every theme interactively with all 30+ controls on a single unified form:

```bash
# Launch interactive theme studio with live dropdown switcher:
bun run demo:themes

# Or launch directly with a specific theme:
bun run demos/23_all_themes_all_controls_showcase.ts tokyo_night
bun run demos/23_all_themes_all_controls_showcase.ts win95
bun run demos/23_all_themes_all_controls_showcase.ts gruvbox_dark
bun run demos/23_all_themes_all_controls_showcase.ts ubuntu_dark
```

#### 🎨 Built-in Theme Categories Overview (133 Themes)

| Category | Count | Highlight Themes | Vibe & Aesthetic |
| :--- | :---: | :--- | :--- |
| **🌟 Signature Brand** | 1 | `codefreelance` | Official obsidian canvas (`#050505`), neon emerald & purple accents |
| **🍏 Modern macOS & Apple** | 9 | `apple_dark`, `apple_light`, `sonoma_emerald`, `ventura_amber`, `apple_sunset`, `midnight` | Clean Cupertino glass, vibrant dark mode, and Mojave sunsets |
| **🚀 Windows 11 Fluent** | 2 | `win11_slate`, `win11_light` | Fluent Acrylic dark slate and crisp Mica light desktop styling |
| **🐧 Modern Linux Desktops** | 7 | `ubuntu_dark`, `ubuntu_light`, `adwaita_dark`, `adwaita_light`, `linux_mint`, `pop_os`, `fedora_dark` | Canonical Yaru aubergine & orange, GNOME Libadwaita, Mint Cinnamon, Pop!\_OS COSMIC, and Fedora Workstation |
| **💻 IDE & Syntax Favorites** | 16 | `monokai_pro`, `tokyo_night`, `one_dark_pro`, `gruvbox_dark`, `rose_pine`, `everforest`, `kanagawa`, `cobalt2`, `catppuccin`, `nord`, `dracula` | Iconic developer editor themes with tuned syntax token contrast |
| **🐧 Linux Distros & Desktops** | 28 | `debian_dark`, `arch_dark`, `kali_dark`, `kde_breeze_dark`, `rhel_dark`, `nixos_dark`, `arc_dark`, `elementary_light` | One theme per major distribution, desktop environment and popular GTK theme |
| **🪟 Windows Versions** | 11 | `win31`, `win98`, `winxp_luna`, `vista_aero`, `win7_aero`, `win10_dark`, `windows_high_contrast` | Windows 3.1 to Windows 10, Terminal and High Contrast |
| **🍎 macOS Versions** | 7 | `mac_os_9`, `snow_leopard`, `yosemite`, `big_sur`, `monterey_light`, `sequoia_dark`, `tahoe_glass` | Mac OS 9 Platinum to macOS Tahoe |
| **🌌 Futuristic (glass, glow, motion)** | 12 | `cyberpunk_hologram`, `neon_hud`, `quantum_obsidian`, `deep_space`, `liquid_metal`, `titanium_aurora`, `liquid_metal_light`, `neo_tokyo_dark`, `synthetic_solar`, `neo_tokyo_day`, `aurora_glass`, `plasma_violet` | Translucent glass, neon and bioluminescent edges, brushed metal, and a compositor-only motion layer that respects reduced motion ([guide](docs/developer/fx-themes.md)) |
| **🕹️ Retro & Nostalgic Computing** | 10 | `win95`, `gameboy`, `c64`, `mac_classic`, `amber_crt`, `matrix`, `synthwave`, `amiga`, `nextstep`, `mac_os_aqua`, `hotdog_stand`, `playstation` | Authentic Windows 95 3D bevels, 1989 Game Boy DMG-01, Commodore 64, Matrix digital rain, and Synthwave neon |
| **🚀 AAA Studio & Cloud Dark** | 14 | `raycast_dark`, `linear_dark`, `vercel_dark`, `unreal_engine`, `arc_velvet`, `abyss`, `night_city`, `horizon`, `tailwind_dark`, `supabase`, `oled_black` | Sleek dark-mode surfaces for modern engineering tools and cloud consoles |

👉 **[🖼️ View All 63 Theme Screenshots, Hex Palettes & Details in docs/THEMES.md →](docs/THEMES.md)**

#### 💻 How to Use Themes in SimpleGUI

```typescript
import { simplegui } from "bun_rad_studio";

// Option A: Set theme on window initialization
const win = simplegui.createWindow("My Application", 900, 600, {
  theme: "monokai_pro", // or "tokyo_night", "one_dark_pro", "gruvbox_dark", "win95", etc.
});

// Option B: Add a 1-line interactive theme selector to your toolbar
win.addThemeSelector("dd_theme", "Theme:");

// Option C: Programmatically switch active theme at runtime
win.setTheme("tokyo_night");
```

<a id="high-level-backend--client-helper-utilities"></a>

### 🛠️ High-Level Backend & Client Helper Utilities

Programmatically interact with and control form state from Bun TypeScript or client scripts:

- `getControlValue(id)` / `setControlText(id, text)` / `setControlValue(id, value)` / `setControlHtml(id, html)`
- `setControlEnabled(id, enabled)` / `setControlVisible(id, visible)`
- `setSegmentedSelected(id, text)` / `setStatChart(id, opts)` / `setToast(id, title, msg, alertType)`
- `setTimePickerValue(id, timeStr)` / `setAccordionOpen(id, open)` / `setTimelineSteps(id, stepsCSV)`
- `setBreadcrumbs(id, crumbsCSV)` / `setTreeNodes(id, nodesCSV)` / `setAvatarGroup(id, avatarsCSV)` / `setRichSelectText(id, text)`
- `setTabsActive(id, tabName)` / `setStatusBarText(id, text)` / `setPaginationPage(id, pageNum)` / `setToggleButtonState(id, active, labelText)`
- `setPropertyGridData(id, properties)` / `setPopupMenuItems(id, itemsCSV)` / `setCalendarDate(id, dateStr)` / `setColorSwatchColor(id, hex)` / `setFilePathBarPath(id, pathStr)`
- `setKanbanColumns(id, colsCSV)` / `setShortcutRecorderValue(id, shortcutStr)` / `setSplitButtonAction(id, text)` / `setSparklineTableData(id, rowsCSV)` / `setMetricComparison(id, title, val, target, change)` / `setActivityFeedItems(id, itemsCSV)` / `setWorkspaceTabs(id, filesCSV)`
- `setAlwaysOnTop(onTop)` / `setWindowPosition(pos)` / `quitApp()`

<a id="auto-generated-code--multi-target-exporters"></a>

### ⚡ Auto-Generated Code & Multi-Target Exporters

- **Live Bun TypeScript Exporter**: Real-time auto-generated Bun + `webview-bun` TypeScript code (`index.ts`) complete with typed backend method bindings (`wv.bind(...)`).
- **React + Tailwind Exporter**: Export modern React TSX component code styled with Tailwind CSS.
- **Vue 3 SFC Exporter**: Export Vue 3 Single File Components (`.vue`) using `<script setup>`.
- **Python CustomTkinter Exporter**: Export standalone executable Python GUI desktop app code.
- **Standalone HTML5 Export**: Export clean, responsive HTML5 + CSS standalone web templates.
- **1-Click App Exporter**: Export a complete, runnable Bun project folder to disk (`/exported_project`).

---

<a id="installation--quick-start"></a>

## 💻 Installation & Quick Start

<a id="prerequisites"></a>

### Prerequisites

- [Bun Runtime](https://bun.sh) (v1.0.0 or higher)
- macOS, Windows, or Linux with WebKit/Webview support

#### 🪟 Windows Runtime Note (ARM64 / x64 compatibility)

On Windows, the native webview layer must match the machine architecture exactly. If you see a native load error such as `ERR_DLOPEN_FAILED`, `libwebview.dll` not loading, or a missing `WebView2Loader.dll`, the issue is usually not the app code itself but a mismatch between:

- the Bun runtime architecture (`x64` vs `arm64`)
- the bundled native `webview-bun` DLL
- the installed Microsoft Edge WebView2 runtime
- a stale `WEBVIEW_PATH` environment variable

The project includes a repair script at [scripts/fix_windows_webview_runtime.ts](scripts/fix_windows_webview_runtime.ts) that searches for the WebView2 loader and copies it into the expected build folder. There are also helper bundles for both architectures:

- [windows-x64/readme.md](windows-x64/readme.md) for standard Windows x64 machines
- [windows-arm/readme.md](windows-arm/readme.md) for Windows ARM64 devices

### 🪟 Universal Windows Runner (`run.ps1` & `run.cmd`)

For Windows users, we provide a **Universal Runner** that auto-detects system architecture (x64 / ARM64), locates Bun, automatically verifies or installs `WebView2Loader.dll`, and lets you run **any application, demo, or CLI tool** with zero friction:

```powershell
# 1. Interactive Menu (browse, search, and run everything):
.\run.ps1
# or simply in Command Prompt / PowerShell:
run

# 2. Run Any Application Directly by Name or Alias:
.\run.ps1 calculator         # Universal Calculator & STEM Studio
.\run.ps1 pacman             # Cyberpunk Pac-Man Arcade
.\run.ps1 pong               # Neon Cyber Pong
.\run.ps1 connect4           # Cyberpunk Connect 4
.\run.ps1 devtools           # DevTools & OmniTool Studio
.\run.ps1 db                 # Unified Database Studio (SQLite & Redis)

# 3. Run Any Showcase Demo (01 - 25) by Number or Name:
.\run.ps1 23                 # Universal 42 Themes & Controls Showcase
.\run.ps1 05                 # CRUD Task Table & State Management
.\run.ps1 ide                # File Explorer Mini IDE Template
.\run.ps1 crud               # CRUD Task Table

# 4. Open Launcher Studio Pro (Full Desktop Workstation GUI):
.\run.ps1 -Gui

# 5. List All Available Items in the Workspace Catalog:
.\run.ps1 -List

# 6. Search for Apps or Demos:
.\run.ps1 -Search game
```

You can also use npm / bun scripts:
```powershell
bun run win          # Interactive menu
bun run win:list     # Catalog list
bun run win:gui      # Open Launcher Studio GUI
```

Architecture-specific helper scripts in `windows-x64\` and `windows-arm\` also support all arguments:
```powershell
# Standard Windows x64 (runs demo 23 by default, or any app/demo specified):
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1 calculator

# Windows ARM64 (Surface Pro, Qualcomm Snapdragon X Elite, Dev Kit):
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1 pacman
```

> [!TIP]
> **PowerShell Execution Policy**: If Windows displays `running scripts is disabled on this system`, run this once in PowerShell:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
> ```
> Or invoke via [run.cmd](run.cmd) (`.\run.cmd pacman`), which automatically bypasses execution policy restrictions.

> [!IMPORTANT]
> **Windows ARM64 Support (Snapdragon X Elite / Surface Pro)**: The native webview library (`libwebview.dll`) in `webview-bun` targets x86_64. Attempting to load an x64 DLL in native ARM64 Bun results in `error code 193 (ERR_DLOPEN_FAILED)`.
>
> The universal runner (`run.ps1`) detects ARM64 hardware automatically, locates or downloads an official x64 Bun runtime into `%LOCALAPPDATA%\bun-x64`, and runs it seamlessly under Windows 11's built-in x64 emulation layer (Prism)—requiring zero manual configuration!

<a id="linux-system-dependencies-libwebkitgtk-60-4"></a>

#### 🐧 Linux System Dependencies (`libwebkitgtk-6.0-4`)

When running the application directly from source with Bun (`bun start`, `bun run index.ts`, or any demo script) on Debian/Ubuntu-based distributions, `libwebkitgtk-6.0-4` is required for the webview window to initialize:

```bash
sudo apt install libwebkitgtk-6.0-4
```

> [!NOTE]
> **Tested & Verified**: Tested on **Ubuntu** and **Kali Linux** in Parallels Desktop.
>
> **Pre-compiled Binaries**: If the code is already compiled into a standalone binary (e.g. via `bun run build:binary` or `bun build --compile`), the binary will run out of the box without needing the WebKit library (`libwebkitgtk-6.0-4`) to be installed!

<a id="1-clone--install-dependencies"></a>

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/codecaine-zz/bun_rad_studio.git
cd bun_rad_studio
bun install
```

<a id="2-launch-rad-studio"></a>

### 2. Launch RAD Studio & Workstations

```bash
# ⚡ A. Quick Launch Any Tool via Launcher Studio Pro:
bun run app:launcher

# 🚀 B. Launch the Visual RAD IDE Designer:
bun run index.ts
# or
bun start
```

<a id="3-run-interactive-feature-demos"></a>

### 3. Run Interactive Feature Demos

Explore pre-built executable demo applications demonstrating controls, events, dynamic helper functions, and the Declarative SimpleGUI engine:

| Demo Script                                                                                          | NPM Command                                | Description                                                                                                                             |
| :--------------------------------------------------------------------------------------------------- | :----------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **[demos/01_standard_controls.ts](demos/01_standard_controls.ts)**                                   | `bun run demo:standard`                    | Standard UI controls, `onClick`/`onChange` events, input validation, and control locking.                                               |
| **[demos/02_advanced_modern_controls.ts](demos/02_advanced_modern_controls.ts)**                     | `bun run demo:modern`                      | 10 modern visual controls & helper wrappers (Segmented, Stat Chart, Toast, Timeline, Tree View).                                        |
| **[demos/03_data_and_non_visual.ts](demos/03_data_and_non_visual.ts)**                               | `bun run demo:data`                        | Data-Aware `DBGrid`, `DBNavigator`, non-visual `Timer` component (1000ms ticks), and Code View.                                         |
| **[demos/04_window_placement_and_pin.ts](demos/04_window_placement_and_pin.ts)**                     | `bun run demo:window`                      | Native Window Placement API (9 screen presets), Always On Top pinning, and Fullscreen.                                                  |
| **[demos/05_crud_todo_table.ts](demos/05_crud_todo_table.ts)**                                       | `bun run demo:table` / `bun run demo:crud` | Dynamic Table Control Studio (Add/Remove Rows & Columns, Filtering, Sorting, Payroll Stats).                                            |
| **[demos/06_timer_control_studio.ts](demos/06_timer_control_studio.ts)**                             | `bun run demo:timer`                       | Non-Visual Timer Control Studio (onTimer tick loops, Clock, Telemetry Gauges, Countdown).                                               |
| **[demos/07_labeled_form_and_desktop_controls.ts](demos/07_labeled_form_and_desktop_controls.ts)**   | `bun run demo:desktop`                     | Labeled Form Controls (`form_field`, `form_password`) & Desktop Application UI Controls Studio.                                         |
| **[demos/08_analytics_dashboard_template.ts](demos/08_analytics_dashboard_template.ts)**             | `bun run demo:dashboard`                   | Executive Analytics Dashboard Template (Metric KPI Cards, Stat Charts, Alert Banners).                                                  |
| **[demos/09_file_explorer_ide_template.ts](demos/09_file_explorer_ide_template.ts)**                 | `bun run demo:ide`                         | Developer File Explorer & IDE Studio Template (Tree View, Workspace Tabs, Code View).                                                   |
| **[demos/10_db_studio_query_editor_template.ts](demos/10_db_studio_query_editor_template.ts)**       | `bun run demo:db`                          | Database Studio & Query Editor Template (DB Navigator, DB-bound Data Grids, SQL View).                                                  |
| **[demos/11_app_settings_preferences_template.ts](demos/11_app_settings_preferences_template.ts)**   | `bun run demo:settings`                    | Desktop Application Settings & Preferences Template (Tabs, Toggles, Sliders, Time Pickers).                                             |
| **[demos/12_advanced_desktop_app_controls.ts](demos/12_advanced_desktop_app_controls.ts)**           | `bun run demo:app_controls`                | Additional 5 Desktop Application Controls Studio (Property Grid, Popup Menu, Calendar View).                                            |
| **[demos/13_productivity_controls_studio.ts](demos/13_productivity_controls_studio.ts)**             | `bun run demo:productivity`                | Modern Productivity UI Controls Studio (Kanban Board, Hotkeys, Split Button, Sparklines).                                               |
| **[demos/14_simplegui_fluent_form_demo.ts](demos/14_simplegui_fluent_form_demo.ts)**                 | `bun run demo:simplegui`                   | Declarative SimpleGUI Fluent Form Demo with method chaining and interactive events.                                                     |
| **[demos/15_simplegui_all_controls_showcase.ts](demos/15_simplegui_all_controls_showcase.ts)**       | `bun run demo:simplegui_all`               | Comprehensive SimpleGUI All-Controls Showcase across standard, labeled, and dashboard widgets.                                          |
| **[demos/16_simplegui_parity_api_demo.ts](demos/16_simplegui_parity_api_demo.ts)**                   | `bun run demo:parity`                      | `vlang_simplegui` 100% API Parity showcase (`new_simple_window`, `add_input`, OS directories).                                          |
| **[demos/17_simplegui_layout_types_showcase.ts](demos/17_simplegui_layout_types_showcase.ts)**       | `bun run demo:layouts`                     | SimpleGUI Layout Showcase (Rows, Grids, Cards, Absolute Positioning, and Resizing).                                                     |
| **[demos/18_simplegui_ergonomics_demo.ts](demos/18_simplegui_ergonomics_demo.ts)**                   | `bun run demo:ergonomics`                  | SimpleGUI Ergonomics & Shortcuts API Showcase (Batch ops, value modifiers, JSON persistence).                                           |
| **[demos/19_state_persistence_and_binding_demo.ts](demos/19_state_persistence_and_binding_demo.ts)** | `bun run demo:persistence`                 | State Persistence & Two-Way Binding Showcase (Auto-save form state, custom storage).                                                    |
| **[demos/20_codefreelance_theme_demo.ts](demos/20_codefreelance_theme_demo.ts)**                     | `bun run demo:codefreelance`               | Official CodeFreelance Obsidian & Emerald Theme Demonstration.                                                                          |
| **[demos/21_vlang_parity_controls_showcase.ts](demos/21_vlang_parity_controls_showcase.ts)**         | `bun run demo:vlang_parity`                | Extended VLang Parity Visual Controls & NAMED/NAMELESS shorthand helpers.                                                               |
| **[demos/22_context_menu_and_menu_demo.ts](demos/22_context_menu_and_menu_demo.ts)**                 | `bun run demo:menu`                        | Native Application Menu Bar & Right-Click Context Menu Engine Showcase.                                                                 |
| **[demos/23_all_themes_all_controls_showcase.ts](demos/23_all_themes_all_controls_showcase.ts)**     | `bun run demo:themes`                      | Complete Themes & All Controls Studio: renders all 30+ controls on a single unified form with runtime theme switching across 42 themes. |

```bash
# Run any demo directly with Bun:
bun run demo:productivity
bun run demo:ergonomics
bun run demo:simplegui
```

---

<a id="26-enterprise-production-workstations--utilities"></a>
<a id="enterprise-applications"></a>

## ⚡ 39 Enterprise Production Workstations & Utilities

> **Databases:** the SQLite, MySQL and Postgres studios share a **Database Workbench** (🧰 button, or `bun run src/db/workbench_server.ts`) with keychain-stored credentials, read-only/production safeguards and conflict-safe row editing. See [docs/databases/workbench.md](docs/databases/workbench.md); tests: [docs/testing/database-tests.md](docs/testing/database-tests.md).

In addition to RAD form design and UI demos, Bun RAD Studio provides a comprehensive suite of **39 production-grade developer desktop workstations and arcade games** engineered with zero Homebrew/external binary reliance. Each application includes detailed documentation in the [User Guides Directory](docs/userguides/README.md).

|   #    | Application                        | User Guide                                                   | Focus & Capabilities                                                                                                        | Launch Command          |
| **01** | **SQLite Studio Pro**              | [User Guide](docs/userguides/01_sqlite_studio.md)          | Full desktop-database workflow: live totals row, quick filter bar, report generator, backup/dump, QBE designer with cardinality badges. | `bun run app:sqlite`    |
| **02** | **System & Package Workstation**   | [User Guide](docs/userguides/02_system_package_studio.md)    | Hardware telemetry (RAM/CPUs/Uptime), Bun global cache analysis, npm/bun registry search.                                   | `bun run app:system`    |
| **03** | **Task Watcher Studio**            | [User Guide](docs/userguides/03_task_watcher_studio.md)      | Native `fs.watch` event pipeline, extension filters, ignore rules, continuous build console.                                | `bun run app:watcher`   |
| **04** | **JSON Query Studio Pro**          | [User Guide](docs/userguides/04_json_query_studio.md)        | High-throughput JSON query engine, nested selectors, key projections, live query telemetry.                                 | `bun run app:json`      |
| **05** | **DevTools Studio Pro**            | [User Guide](docs/userguides/05_devtools_studio.md)          | 6-in-1 suite: Ripgrep code search, Fd file tree finder, Sd regex replace, Watcher, Trash, JQ.                               | `bun run app:devtools`  |
| **06** | **Process Monitor Studio**         | [User Guide](docs/userguides/06_process_monitor_studio.md)   | macOS Activity Monitor inspection, PID search, CPU/RSS memory consumption, signal dispatch.                                 | `bun run app:process`   |
| **07** | **API Studio Pro**                 | [User Guide](docs/userguides/07_api_studio.md)               | HTTP/REST client (GET/POST/PUT/DELETE/PATCH), Bearer/Basic/ApiKey auth, cURL generator.                                     | `bun run app:api`       |
| **08** | **Data Converter Studio Pro**      | [User Guide](docs/userguides/08_data_converter_studio.md)    | Enterprise multi-format transformer across CSV, TSV, JSON, ndjson, YAML, TOML, XML, SQL, and Markdown with undo, paste, and file import. | `bun run app:convert`   |
| **09** | **Crypto Studio Pro**              | [User Guide](docs/userguides/09_crypto_studio.md)            | SHA-256/512, MD5, HMAC, AES-256-GCM encryption/decryption, JWT decoder, password entropy.                                   | `bun run app:crypto`    |
| **10** | **Regex Studio Pro**               | [User Guide](docs/userguides/10_regex_studio.md)             | Live regular expression tester, capture groups table, substitution preview, TypeScript export.                              | `bun run app:regex`     |
| **11** | **App Bundler Studio**             | [User Guide](docs/userguides/11_app_bundler_studio.md)       | Standalone binary compiler via `bun build --compile`, cross-platform targets, macOS `.app`.                                 | `bun run app:bundler`   |
| **12** | **Network Forensics Studio**       | [User Guide](docs/userguides/12_network_forensics_studio.md) | TCP socket port scanner (`node:net`), DNS records lookup (`A/AAAA/MX/TXT/NS`), HTTP TTFB.                                   | `bun run app:network`   |
| **13** | **Git Workbench Pro**              | [User Guide](docs/userguides/13_git_workbench_studio.md)     | Working tree status, visual diff viewer (`git diff / --staged`), commit log, stage, commit.                                 | `bun run app:git`       |
| **14** | **Markdown Studio Pro**            | [User Guide](docs/userguides/14_markdown_studio.md)          | Split-pane Markdown editor, instant live HTML preview, reading stats, standalone HTML export.                               | `bun run app:markdown`  |
| **15** | **Color & Design Token Studio**    | [User Guide](docs/userguides/15_color_token_studio.md)       | HEX/RGB/HSL converter, WCAG 2.1 AA/AAA contrast auditor, 50–950 tonal scale, token export.                                  | `bun run app:color`     |
| **16** | **Environment Vault Studio**       | [User Guide](docs/userguides/16_environment_vault_studio.md) | `.env` parser & validator, secret key detection & masking, diff against `.env.example`.                                     | `bun run app:env`       |
| **17** | **Fd Studio Pro**                  | [User Guide](docs/userguides/17_fd_studio.md)                | Native Bun ultra-fast filesystem search (`fd-find` replacement), regex/glob filters, GUI file operations (new/rename/duplicate/chmod/undo), batch rename with preview, content search, duplicate finder, Rip safe burial quarantine & recovery, batch exec. | `bun run app:fd`        |
| **18** | **Rip Studio Pro**                 | [User Guide](docs/userguides/18_rip_studio.md)               | Safe & ergonomic alternative to `rm`, graveyard quarantine, instant undo restoration, pre-deletion inspect.                 | `bun run app:rip`       |
| **19** | **Sd Studio Pro**                  | [User Guide](docs/userguides/19_sd_studio.md)                | Intuitive find & replace (`sed` alternative) with live unified diffs, regex capture groups, and backup files.               | `bun run app:sd`        |
| **20** | **Procs Monitor Studio Pro**       | [User Guide](docs/userguides/20_procs_studio.md)             | Modern `ps` replacement with live process table, CPU/Memory telemetry, listening TCP ports, signal control, and tree view.  | `bun run app:procs`     |
| **21** | **Watchexec Studio Pro**           | [User Guide](docs/userguides/21_watchexec_studio.md)         | Continuous file watcher and command runner with debounce, pattern filters, ignore rules, and streaming console.             | `bun run app:watchexec` |
| **22** | **Tokei Studio Pro**               | [User Guide](docs/userguides/22_tokei_studio.md)             | Fast code & LOC counter across 50+ languages with comment ratios, per-file breakdown, Markdown and JSON export.             | `bun run app:tokei`     |
| **23** | **Gdu Disk Studio Pro**            | [User Guide](docs/userguides/23_gdu_studio.md)               | Fast disk usage analyzer and mounted disk explorer with visual proportion bars, directory drill-down, and cleanup.          | `bun run app:gdu`       |
| **24** | **IpInfo Forensics Studio Pro**    | [User Guide](docs/userguides/24_ipinfo_studio.md)            | IP address geolocation, ASN details, CIDR subnet calculator, and local network interfaces.                                  | `bun run app:ipinfo`    |
| **25** | **Subfinder Discovery Studio Pro** | [User Guide](docs/userguides/25_subfinder_studio.md)         | Passive multi-source subdomain discovery with active DNS verification and HTTP/HTTPS probing.                               | `bun run app:subfinder` |
| **26** | **Doggo DNS Studio Pro**           | [User Guide](docs/userguides/26_doggo_studio.md)             | Modern DNS client for humans with standard record queries, custom resolvers, DNS-over-HTTPS (DoH), and reverse PTR lookups. | `bun run app:doggo`     |
| **27** | **Universal Calculator Studio Pro** | [User Guide](docs/userguides/27_calculator_studio.md)         | Apple-grade scientific calculator, 17-unit converter, time-series charts, 64-bit programmer lab & **6-engine STEM IntuitionLab**. | `bun run app:calculator`|
| **28** | **Dr. Codecaine Arcade**           | [User Guide](docs/userguides/28_dr_codecaine_arcade.md)      | Triple-A remastered capsule puzzle game with polyphonic 8-bit synthesizers, expressive pathogen AI & touch/keyboard controls. | `bun run app:dr_codecaine`|
| **29** | **Interval Timer Suite**           | [User Guide](docs/userguides/29_interval_timer_suite.md)      | High-performance interval timer with Keith Baar isometric tendon training protocols, animated guides & **Codecaine Music Deck**. | `bun run app:interval_timer`|
| **30** | **Adventures of Lolo Remaster**    | [User Guide](docs/userguides/30_lolo_remaster.md)             | Cyberpunk remastered Adventures of Lolo with 100 room puzzles, retro audio engine & integrated field manual.                | `bun run app:lolo`      |
| **31** | **Rodent's Revenge Deluxe**        | [User Guide](docs/userguides/31_rodents_revenge_deluxe.md)    | Deluxe arcade revival of Rodent's Revenge with neon retro maze, cat trapping, high-DPI canvas & power-ups.                    | `bun run app:rodents_revenge`|
| **32** | **Neon Word Search Labyrinth**     | [User Guide](docs/userguides/32_word_search_labyrinth.md)     | AAA cyber word search with Web Audio synthesizer, neon particle visual effects & procedural dictionaries.                   | `bun run app:word_search`|
| **33** | **World Time Zones Studio Pro**    | [User Guide](docs/userguides/33_world_time_zones_studio.md)   | Real-time global time zones workstation with interactive search, UTC offsets & local clock synchronization.                  | `bun run app:world_time_zones`|
| **34** | **Cyberpunk Pac-Man Arcade**       | [User Guide](docs/userguides/34_pacman_arcade.md)             | Authentic Cyberpunk Pac-Man arcade remaster with 4-ghost AI personalities, sound synthesis & particle effects.               | `bun run app:pacman`    |
| **35** | **Codecaine Bros. Arcade**         | [User Guide](docs/userguides/35_codecaine_bros_arcade.md)     | 1983 Mario Bros. sewer arcade remaster with high-speed bumping physics, interactive POW block & 2-player mode.              | `bun run app:codecaine_bros` |
| **36** | **Connect 4 Champion**             | [User Guide](docs/userguides/36_connect4_studio.md)          | Tactical 2-player & Minimax AI board game with column hover preview, falling disc physics & particle celebrations.          | `bun run app:connect4`  |
| **37** | **Maze Generator & Solver**        | [User Guide](docs/userguides/37_maze_generator_studio.md)     | Procedural maze generation (Backtracker, Prim, Kruskal, Wilson) & real-time A*/Dijkstra visual solvers.                    | `bun run app:maze`      |
| **38** | **Cyber Pong Neo**                 | [User Guide](docs/userguides/38_pong_arcade.md)              | High-speed kinetic arcade tennis with responsive paddle spin deflection physics & 3-tier AI opponents.                      | `bun run app:pong`      |
| **39** | **Tic Tac Toe Master**             | [User Guide](docs/userguides/39_tictactoe_studio.md)         | Unbeatable Minimax AI mode, casual mode & local 2-player battle with scoreboard and glowing neon visuals.                   | `bun run app:tictactoe` |
| **40** | **RAD Utilities Studio Pro**       | [Feature Docs](src/features/rad/README.md)                   | 44 high-velocity development modules for Rapid Application Development with live playground, recipes & benchmark suite.      | `bun run app:rad`       |
| **41** | **MySQL Studio Pro**               | [User Guide](docs/userguides/41_mysql_studio.md)             | Enterprise MySQL database workstation, query IDE, schema visualizer & InnoDB performance suite via native Bun SQL.          | `bun run app:mysql`     |

<a id="application-visual-gallery--screenshots"></a>

### 📸 Application Visual Gallery & Screenshots

> **Want the pictures first?** [SHOWCASE.md](SHOWCASE.md) presents every application with its screenshot, what it does and how to start it.

Explore live desktop and responsive viewport previews for all 28 enterprise production workstations:

#### 🔍 Filesystem, Search & Process Operations

| Workstation | Desktop Preview (1200×850) | Responsive Preview (960×720) |
| :--- | :--- | :--- |
| **Fd Studio Pro**<br>[User Guide](docs/userguides/17_fd_studio.md)<br>`bun run app:fd` | ![Fd Studio Desktop](screenshots/apps/fd_studio_desktop.png) | ![Fd Studio Responsive](screenshots/apps/fd_studio_responsive.png) |
| **Rip Studio Pro**<br>[User Guide](docs/userguides/18_rip_studio.md)<br>`bun run app:rip` | ![Rip Studio Desktop](screenshots/apps/rip_studio_desktop.png) | ![Rip Studio Responsive](screenshots/apps/rip_studio_responsive.png) |
| **Sd Studio Pro**<br>[User Guide](docs/userguides/19_sd_studio.md)<br>`bun run app:sd` | ![Sd Studio Desktop](screenshots/apps/sd_studio_desktop.png) | ![Sd Studio Responsive](screenshots/apps/sd_studio_responsive.png) |
| **Procs Studio Pro**<br>[User Guide](docs/userguides/20_procs_studio.md)<br>`bun run app:procs` | ![Procs Studio Desktop](screenshots/apps/procs_studio_desktop.png) | ![Procs Studio Responsive](screenshots/apps/procs_studio_responsive.png) |
| **Watchexec Studio Pro**<br>[User Guide](docs/userguides/21_watchexec_studio.md)<br>`bun run app:watchexec` | ![Watchexec Studio Desktop](screenshots/apps/watchexec_studio_desktop.png) | ![Watchexec Studio Responsive](screenshots/apps/watchexec_studio_responsive.png) |
| **Gdu Disk Studio Pro**<br>[User Guide](docs/userguides/23_gdu_studio.md)<br>`bun run app:gdu` | ![Gdu Studio Desktop](screenshots/apps/gdu_studio_desktop.png) | ![Gdu Studio Responsive](screenshots/apps/gdu_studio_responsive.png) |

#### 🗄️ Data, Storage & Query Engines

| Workstation | Desktop Preview (1200×850) | Responsive Preview (960×720) |
| **SQLite Studio Pro**<br>[User Guide](docs/userguides/01_sqlite_studio.md)<br>`bun run app:sqlite` | ![SQLite Totals Row & Quick Filter Bar](screenshots/apps/sqlite_totals_filter_verified.png) | ![Visual Query Designer](screenshots/apps/sqlite_visual_designer_cardinality_verified.png) |
| **MySQL Studio Pro**<br>[User Guide](docs/userguides/41_mysql_studio.md)<br>`bun run app:mysql` | ![MySQL Studio Desktop](screenshots/apps/mysql_studio_desktop.png) | ![MySQL Studio Responsive](screenshots/apps/mysql_studio_responsive.png) |
| **JSON Query Studio Pro**<br>[User Guide](docs/userguides/04_json_query_studio.md)<br>`bun run app:json` | ![JSON Query Studio Desktop](screenshots/apps/json_studio_desktop.png) | ![JSON Query Studio Responsive](screenshots/apps/json_studio_responsive.png) |
| **Data Converter Studio**<br>[User Guide](docs/userguides/08_data_converter_studio.md)<br>`bun run app:convert` | ![Data Converter Studio Desktop](screenshots/apps/dataconvert_studio_desktop.png) | ![Data Converter Studio Responsive](screenshots/apps/dataconvert_studio_responsive.png) |

#### 🌐 Networking, DNS & Security Forensics

| Workstation | Desktop Preview (1200×850) | Responsive Preview (960×720) |
| :--- | :--- | :--- |
| **Network Forensics Studio**<br>[User Guide](docs/userguides/12_network_forensics_studio.md)<br>`bun run app:network` | ![Network Forensics Studio Desktop](screenshots/apps/network_studio_desktop.png) | ![Network Forensics Studio Responsive](screenshots/apps/network_studio_responsive.png) |
| **IpInfo Forensics Studio Pro**<br>[User Guide](docs/userguides/24_ipinfo_studio.md)<br>`bun run app:ipinfo` | ![IpInfo Studio Desktop](screenshots/apps/ipinfo_studio_desktop.png) | ![IpInfo Studio Responsive](screenshots/apps/ipinfo_studio_responsive.png) |
| **Subfinder Discovery Studio Pro**<br>[User Guide](docs/userguides/25_subfinder_studio.md)<br>`bun run app:subfinder` | ![Subfinder Studio Desktop](screenshots/apps/subfinder_studio_desktop.png) | ![Subfinder Studio Responsive](screenshots/apps/subfinder_studio_responsive.png) |
| **Doggo DNS Studio Pro**<br>[User Guide](docs/userguides/26_doggo_studio.md)<br>`bun run app:doggo` | ![Doggo Studio Desktop](screenshots/apps/doggo_studio_desktop.png) | ![Doggo Studio Responsive](screenshots/apps/doggo_studio_responsive.png) |
| **Crypto Studio Pro**<br>[User Guide](docs/userguides/09_crypto_studio.md)<br>`bun run app:crypto` | ![Crypto Studio Desktop](screenshots/apps/crypto_studio_desktop.png) | ![Crypto Studio Responsive](screenshots/apps/crypto_studio_responsive.png) |
| **Environment Vault Studio**<br>[User Guide](docs/userguides/16_environment_vault_studio.md)<br>`bun run app:env` | ![Environment Vault Studio Desktop](screenshots/apps/env_studio_desktop.png) | ![Environment Vault Studio Responsive](screenshots/apps/env_studio_responsive.png) |

#### 🛠️ Developer Productivity, Code & System Workstations

| Workstation | Desktop Preview (1200×850) | Responsive Preview (960×720) |
| :--- | :--- | :--- |
| **DevTools Studio Pro (6-in-1)**<br>[User Guide](docs/userguides/05_devtools_studio.md)<br>`bun run app:devtools` | ![DevTools Studio Desktop](screenshots/apps/devtools_studio_desktop.png) | ![DevTools Studio Responsive](screenshots/apps/devtools_studio_responsive.png) |
| **System & Package Workstation**<br>[User Guide](docs/userguides/02_system_package_studio.md)<br>`bun run app:system` | ![System Studio Desktop](screenshots/apps/system_studio_desktop.png) | ![System Studio Responsive](screenshots/apps/system_studio_responsive.png) |
| **Task Watcher Studio**<br>[User Guide](docs/userguides/03_task_watcher_studio.md)<br>`bun run app:watcher` | ![Watcher Studio Desktop](screenshots/apps/watcher_studio_desktop.png) | ![Watcher Studio Responsive](screenshots/apps/watcher_studio_responsive.png) |
| **Process Monitor Studio**<br>[User Guide](docs/userguides/06_process_monitor_studio.md)<br>`bun run app:process` | ![Process Monitor Desktop](screenshots/apps/process_studio_desktop.png) | ![Process Monitor Responsive](screenshots/apps/process_studio_responsive.png) |
| **API Studio Pro**<br>[User Guide](docs/userguides/07_api_studio.md)<br>`bun run app:api` | ![API Studio Desktop](screenshots/apps/api_studio_desktop.png) | ![API Studio Responsive](screenshots/apps/api_studio_responsive.png) |
| **Regex Studio Pro**<br>[User Guide](docs/userguides/10_regex_studio.md)<br>`bun run app:regex` | ![Regex Studio Desktop](screenshots/apps/regex_studio_desktop.png) | ![Regex Studio Responsive](screenshots/apps/regex_studio_responsive.png) |
| **App Bundler Studio**<br>[User Guide](docs/userguides/11_app_bundler_studio.md)<br>`bun run app:bundler` | ![App Bundler Studio Desktop](screenshots/apps/app_bundler_studio_desktop.png) | ![App Bundler Studio Responsive](screenshots/apps/app_bundler_studio_responsive.png) |
| **Git Workbench Pro**<br>[User Guide](docs/userguides/13_git_workbench_studio.md)<br>`bun run app:git` | ![Git Workbench Desktop](screenshots/apps/git_studio_desktop.png) | ![Git Workbench Responsive](screenshots/apps/git_studio_responsive.png) |
| **Markdown Studio Pro**<br>[User Guide](docs/userguides/14_markdown_studio.md)<br>`bun run app:markdown` | ![Markdown Studio Desktop](screenshots/apps/markdown_studio_desktop.png) | ![Markdown Studio Responsive](screenshots/apps/markdown_studio_responsive.png) |
| **Color & Design Token Studio**<br>[User Guide](docs/userguides/15_color_token_studio.md)<br>`bun run app:color` | ![Color Studio Desktop](screenshots/apps/color_studio_desktop.png) | ![Color Studio Responsive](screenshots/apps/color_studio_responsive.png) |
| **Tokei Studio Pro**<br>[User Guide](docs/userguides/22_tokei_studio.md)<br>`bun run app:tokei` | ![Tokei Studio Desktop](screenshots/apps/tokei_studio_desktop.png) | ![Tokei Studio Responsive](screenshots/apps/tokei_studio_responsive.png) |
| **Universal Calculator & Computing Studio**<br>[User Guide](docs/userguides/27_calculator_studio.md)<br>`bun run app:calculator` | ![Universal Calculator Desktop](screenshots/apps/calculator_studio_desktop.png) | ![Universal Calculator Responsive](screenshots/apps/calculator_studio_responsive.png) |

#### 🎮 Arcade Games, Health Training & Global Time Workstations

| Workstation | Desktop Preview (1280×850) | Responsive Preview (960×720) |
| :--- | :--- | :--- |
| **Dr. Codecaine Arcade**<br>[User Guide](docs/userguides/28_dr_codecaine_arcade.md)<br>`bun run app:dr_codecaine` | ![Dr. Codecaine Desktop](screenshots/apps/dr_codecaine_desktop.png) | ![Dr. Codecaine Responsive](screenshots/apps/dr_codecaine_responsive.png) |
| **Interval Timer & Workout Suite**<br>[User Guide](docs/userguides/29_interval_timer_suite.md)<br>`bun run app:interval_timer` | ![Interval Timer Desktop](screenshots/apps/interval_timer_desktop.png) | ![Interval Timer Responsive](screenshots/apps/interval_timer_responsive.png) |
| **Adventures of Lolo Remaster**<br>[User Guide](docs/userguides/30_lolo_remaster.md)<br>`bun run app:lolo` | ![Adventures of Lolo Desktop](screenshots/apps/lolo_desktop.png) | ![Adventures of Lolo Responsive](screenshots/apps/lolo_responsive.png) |
| **Rodent's Revenge Deluxe**<br>[User Guide](docs/userguides/31_rodents_revenge_deluxe.md)<br>`bun run app:rodents_revenge` | ![Rodent's Revenge Desktop](screenshots/apps/rodents_revenge_desktop.png) | ![Rodent's Revenge Responsive](screenshots/apps/rodents_revenge_responsive.png) |
| **Neon Word Search Labyrinth**<br>[User Guide](docs/userguides/32_word_search_labyrinth.md)<br>`bun run app:word_search` | ![Neon Word Search Desktop](screenshots/apps/word_search_desktop.png) | ![Neon Word Search Responsive](screenshots/apps/word_search_responsive.png) |
| **World Time Zones Studio Pro**<br>[User Guide](docs/userguides/33_world_time_zones_studio.md)<br>`bun run app:world_time_zones` | ![World Time Zones Desktop](screenshots/apps/world_time_zones_desktop.png) | ![World Time Zones Responsive](screenshots/apps/world_time_zones_responsive.png) |
| **Cyberpunk Pac-Man Arcade**<br>[User Guide](docs/userguides/34_pacman_arcade.md)<br>`bun run app:pacman` | ![Cyberpunk Pac-Man Desktop](screenshots/apps/pacman_desktop.png) | ![Cyberpunk Pac-Man Responsive](screenshots/apps/pacman_responsive.png) |
| **Codecaine Bros. Arcade**<br>[User Guide](docs/userguides/35_codecaine_bros_arcade.md)<br>`bun run app:codecaine_bros` | ![Codecaine Bros Desktop](screenshots/apps/codecaine_bros_desktop.png) | ![Codecaine Bros Responsive](screenshots/apps/codecaine_bros_responsive.png) |
| **Connect 4 Champion**<br>[User Guide](docs/userguides/36_connect4_studio.md)<br>`bun run app:connect4` | ![Connect 4 Desktop](screenshots/apps/connect4_desktop.png) | ![Connect 4 Responsive](screenshots/apps/connect4_responsive.png) |
| **Maze Generator & Solver**<br>[User Guide](docs/userguides/37_maze_generator_studio.md)<br>`bun run app:maze` | ![Maze Generator Desktop](screenshots/apps/maze_generator_desktop.png) | ![Maze Generator Responsive](screenshots/apps/maze_generator_responsive.png) |
| **Cyber Pong Neo**<br>[User Guide](docs/userguides/38_pong_arcade.md)<br>`bun run app:pong` | ![Cyber Pong Desktop](screenshots/apps/pong_desktop.png) | ![Cyber Pong Responsive](screenshots/apps/pong_responsive.png) |
| **Tic Tac Toe Master**<br>[User Guide](docs/userguides/39_tictactoe_studio.md)<br>`bun run app:tictactoe` | ![Tic Tac Toe Desktop](screenshots/apps/tictactoe_desktop.png) | ![Tic Tac Toe Responsive](screenshots/apps/tictactoe_responsive.png) |

---

<a id="44-rad-development-utilities"></a>

## ⚡ 44 RAD Development Utilities (`bun_sys_utils`)

To supercharge Rapid Application Development (RAD), Bun RAD Studio incorporates the full **44-module utility suite** from [`codecaine-zz/bun_sys_utils`](https://github.com/codecaine-zz/bun_sys_utils). Designed to eliminate boilerplate code forever, it integrates ergonomic primitives inspired by [`toss/es-toolkit`](https://github.com/toss/es-toolkit) with native Bun standard library superpowers (`Bun.Glob`, `Bun.$`, `Bun.serve`, `Bun.hash`, `Bun.Transpiler`, and `bun:sqlite` FTS5).

All 44 modules run zero-latency unit tests in **~8ms** with zero external npm dependencies.

### 🚀 Quick Start Commands

```bash
# ⚡ Run the 44-Module Benchmark Showcase
bun run rad

# 📚 Run the End-to-End Dual Cookbook (10 CLI Tools + 44 RAD Modules)
bun run rad:cookbook

# 🖥️ Launch the Desktop GUI Workstation (Interactive Tester & Code Playground)
bun run app:rad

# 🛠️ Command-Line Utility Companion
bun run cli:rad --list
bun run cli:rad --recipe arrutils
bun run cli:rad --module fileutils
```

### 📦 Importing in Your Applications

You can import `rad` or individual utility modules directly from the project root or feature registry:

```typescript
import {
  rad,
  fileutils,
  sqliteutils,
  arrutils,
  objutils,
  fnutils,
  globutils,
  shellutils,
  hashutils,
} from "./src/index.ts";

// Or import from the dedicated feature hub:
// import { rad, fileutils } from "./src/features/rad/index.ts";
```

### 🛠️ Featured Capabilities & Code Recipes

#### 1. `arrutils` & Modern Collection Helpers (`es-toolkit`)
```typescript
import { arrutils } from "./src/features/rad/index.ts";

const items = ["alpha", "beta", "gamma", "delta"];

// Safe negative index retrieval (arrutils.at)
console.log(arrutils.at(items, -1)); // "delta"
console.log(arrutils.at(items, -2)); // "gamma"

// Chunking, Compact & KeyBy
const chunks = arrutils.chunk(items, 2); // [["alpha", "beta"], ["gamma", "delta"]]
const clean = arrutils.compact([0, 1, false, 2, "", 3, null, undefined]); // [1, 2, 3]
const users = [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }];
const userMap = arrutils.keyBy(users, u => u.id); // { u1: {...}, u2: {...} }
```

#### 2. `objutils` Deep Path & Immutability (`es-toolkit`)
```typescript
import { objutils } from "./src/features/rad/index.ts";

const user = { profile: { address: { city: "Tokyo" } }, roles: ["admin"] };

// Safe nested path traversal & updates
const city = objutils.get(user, "profile.address.city"); // "Tokyo"
objutils.set(user, "profile.address.postal", "100-0001");

// Deep equality & property picking
const same = objutils.isEqual({ a: [1, 2] }, { a: [1, 2] }); // true
const subset = objutils.pick(user, ["roles"]); // { roles: ["admin"] }
```

#### 3. `fnutils` Functional Primitives (`es-toolkit`)
```typescript
import { fnutils } from "./src/features/rad/index.ts";

// Memoization with O(1) cache lookups
const fib = fnutils.memoize((n: number): number => n <= 1 ? n : fib(n - 1) + fib(n - 2));

// Functional composition pipeline
const transform = fnutils.pipe(
  10,
  (n: number) => n * 2,
  (n: number) => n + 5,
  (n: number) => `Computed: ${n}`
); // "Computed: 25"
```

#### 4. `sqliteutils` Native `bun:sqlite` KV & Document Store
```typescript
import { sqliteutils } from "./src/features/rad/index.ts";

const db = sqliteutils.openDb(":memory:");

// Instant Key-Value persistence
sqliteutils.createKvTable(db, "app_settings");
sqliteutils.setKv(db, "app_settings", "theme", "midnight");
console.log(sqliteutils.getKv(db, "app_settings", "theme")); // "midnight"

// JSON document store with FTS5 search
sqliteutils.createJsonStore(db, "documents");
sqliteutils.saveDoc(db, "documents", "doc_1", { title: "Release Notes", version: "1.0" });

sqliteutils.closeDb(db);
```

#### 5. Native Bun Superpowers: `globutils`, `shellutils`, `hashutils`
```typescript
import { globutils, shellutils, hashutils } from "./src/features/rad/index.ts";

// High-speed globbing via native Bun.Glob
const jsonFiles = await globutils.glob("*.json");

// Subprocess execution via Bun.$ and PATH resolution via Bun.which
const bunPath = shellutils.which("bun");
const version = await shellutils.exec(["bun", "--version"]);

// Ultra-fast 64-bit hashing (wyhash) & in-memory Bloom filter via Bun.hash
const hash = hashutils.wyhash("instant-seed");
const bloom = hashutils.createBloomFilter(1000);
bloom.add("user:101");
console.log(bloom.has("user:101")); // true
```

### 📋 Complete 45-Module Index (44 Core + sliceutils alias)

👉 **[📖 View the Exhaustive 45-Module API Specification & Code Recipes in src/features/rad/README.md](src/features/rad/README.md)** for complete function signatures, parameter types, and practical examples across all 370+ utility methods!

| Domain | Modules Included |
| :--- | :--- |
| **File & Storage (8)** | `fileutils`, `sqliteutils`, `tomlutils` (`Bun.TOML`), `archiveutils`, `compressutils`, `tarutils`, `stateutils`, `cacheutils` |
| **Data Structures (8)** | `arrutils` / `sliceutils`, `objutils`, `structutils` (Stack/Queue/RingBuffer/Heap), `statutils`, `mathutils`, `bitutils`, `graphutils` |
| **Strings & Formats (6)** | `strutils`, `regexutils`, `templateutils`, `colorutils`, `htmlutils`, `diffutils` |
| **System & Runtime (9)** | `sysutils`, `cliutils`, `envutils`, `shellutils` (`Bun.$`), `globutils` (`Bun.Glob`), `transpileutils` (`Bun.Transpiler`), `logutils`, `cronutils`, `semverutils` |
| **Network & Web (7)** | `netutils`, `httputils`, `serverutils` (`Bun.serve`), `urlutils`, `jwtutils`, `cryptoutils`, `hashutils` (`Bun.hash`) |
| **Functions & Logic (7)** | `asyncutils`, `flowutils`, `fnutils`, `eventutils`, `validutils`, `mockutils`, `timeutils` |

---


<a id="dist-build-process"></a>

## 📦 Dist Build Process

Bun RAD Studio ships a full distribution build pipeline powered by [scripts/build.ts](scripts/build.ts). Three build targets are available:

<a id="commands"></a>

### Commands

| Command                | Description                                                     |
| ---------------------- | --------------------------------------------------------------- |
| `bun run build`        | Bundle the library to `dist/` (ESM + source maps)               |
| `bun run build:binary` | Compile a standalone native executable to `dist/bun_rad_studio` |
| `bun run build:all`    | Run both library and binary targets                             |
| `bun run clean`        | Remove the `dist/` directory                                    |

### `dist/` Output Structure

```
dist/
├── index.js              # Main library bundle (ESM, minified)
├── index.js.map          # Source map
├── simplegui.js          # SimpleGUI standalone module bundle (ESM, minified)
├── simplegui.js.map      # Source map
├── libwebview-*.dll      # Native webview asset (Windows)
├── libwebview-*.dylib    # Native webview asset (macOS)
├── package.json          # Dist-ready manifest with exports map
├── README.md             # Documentation
├── docs/                 # Documentation directory
│   ├── API.md            # Visual RAD Designer API reference
│   ├── SIMPLEGUI_API.md  # SimpleGUI API reference
│   ├── THEMES.md         # Theme visual gallery & reference
│   └── SYSTEM_UTILITIES_API.md # CLI & system utilities reference
├── src/
│   └── ide.html          # Complete RAD Designer Studio HTML5/CSS3/JS application
└── bun_rad_studio        # (build:binary only) standalone self-contained executable
```

### Importing from `dist/` in Another Bun Project

```typescript
// Main library (RAD Studio core + all helpers)
import { simplegui, setControlText, setWindowPosition } from "./dist/index.js";

// SimpleGUI module only
import { simplegui } from "./dist/simplegui.js";
```

The `dist/package.json` includes a full `exports` map so the package can be consumed with standard subpath imports after publishing:

```typescript
import { simplegui } from "bun_rad_studio"; // → dist/index.js
import { simplegui } from "bun_rad_studio/simplegui"; // → dist/simplegui.js
```

---

## 📦 Compiling Standalone macOS Binaries (.app) with Custom Icons

To package your applications into standalone, distribution-ready macOS `.app` bundles with custom application icons, display names, and `Info.plist` metadata, leverage the companion project [bun_webview](https://github.com/codecaine-zz/bun_webview).

### Option 1: Native Single-File Executable via `build:binary`

Use the built-in build script to compile a self-contained binary to `dist/`:

```bash
bun run build:binary
# → dist/bun_rad_studio  (native executable, no Bun runtime required)
```

Or using the Bun CLI directly without a macOS `.app` bundle structure:

```bash
bun build --compile index.ts
```

> [!TIP]
> **Linux Standalone Portability**: Once compiled into a standalone binary, the executable will work on Linux without needing `libwebkitgtk-6.0-4` to be installed on the host machine.

### Option 2: Full macOS `.app` Bundle with Custom Icons

To package your project into a complete macOS `.app` application bundle using [bun_webview](https://github.com/codecaine-zz/bun_webview):

1. **Clone the `bun_webview` builder repository**:

   ```bash
   git clone https://github.com/codecaine-zz/bun_webview.git
   cd bun_webview
   bun install
   ```

2. **Package your RAD application**:
   ```bash
   bun run build-app /path/to/your/index.ts --name "My Application" --icon /path/to/icon.png --identifier "com.example.myapp"
   ```

#### CLI Options:

- `-i, --icon <path>`: Path to a PNG icon (defaults to `resources/icon.png` or pre-built Apple-style glassmorphism icon templates).
- `-n, --name <name>`: Custom display name for the `.app` bundle (e.g. `--name "Customer Studio"`).
- `-d, --identifier <id>`: `CFBundleIdentifier` (e.g. `--identifier "com.company.app"`).
- `-v, --version <version>`: App version string (defaults to `package.json` version or `1.0.0`).
- `-o, --out <dir>`: Output directory for the `.app` bundle (defaults to `dist`).

#### Launching the Compiled App:

Launch your compiled `.app` bundle from macOS Finder in `dist/` or via terminal:

```bash
open "dist/My Application.app"
```

---

## 🎨 Declarative SimpleGUI Module (`simplegui`)

Build native desktop GUIs directly in TypeScript using an intuitive, fluent, event-driven API inspired by [vlang_simplegui](https://github.com/codecaine-zz/vlang_simplegui) — no visual designer required! For complete API docs, see the dedicated [docs/SIMPLEGUI_API.md](docs/SIMPLEGUI_API.md) reference.

![SimpleGUI Ergonomics & Shortcuts Showcase Screenshot](screenshot_ergonomics.png)

```typescript
import { simplegui } from "bun_rad_studio";

// 1. Create a SimpleGUI window
const win = simplegui.createWindow("My SimpleGUI App", 760, 520, {
  theme: "apple_dark",
});

// 2. Add controls with fluent method chaining
win.addLabel("👤 User Account & Profile Setup").font(20, "#38bdf8", "700");

win.beginCard("Personal Details");

win.beginRow();
win.addLabel("Full Name:").width(120);
win.addTextInput("e.g. Alex Mercer").id("txtName").width(260);
win.endRow();

win.beginRow();
win.addLabel("Plan:").width(120);
win
  .addDropdown(
    ["Developer (Free)", "Pro ($19/mo)", "Enterprise ($99/mo)"],
    "Pro",
  )
  .id("cmbPlan")
  .width(260);
win.endRow();

win.endCard();

// 3. Add interactive button with event callback & dialog prompt
win
  .addButton("🚀 Submit Profile", (w) => {
    const vals = w.getFormValues();
    w.showAlert(
      `✅ Profile created for ${vals.txtName || "User"} (${vals.cmbPlan})!`,
    );
  })
  .bg("#0284c7")
  .color("#ffffff")
  .bold()
  .width(180)
  .height(40);

// 4. Launch window
win.run();
```

### Key Features:

- **`vlang_simplegui` API Parity**: 100% API compatibility with `vlang_simplegui` (`new_simple_window()`, `add_input()`, `add_button()`, `hasControl()`, `listControls()`, `requireControl()`, `listThemes()`, `getTheme()`, `homeDir()`, `tempDir()`, `desktopDir()`, `documentsDir()`, `downloadsDir()`).
- **Multi-Window & Application Lifecycle**: Distinct `win.close()` / `win.close_window()` (closes current window handle without terminating process for multi-window support) and `win.exit()` / `win.quit()` / `win.exitApp()` / `win.quit_application()` (terminates process via `process.exit(code)`).
- **Fluent Method Chaining**: Chain styling & behavior modifiers (`.width()`, `.height()`, `.bg()`, `.color()`, `.bold()`, `.align()`, `.tooltip()`, `.onClick()`, `.onChange()`).
- **Form & Labeled Helpers**: `addFormField()`, `addFormPassword()`, `addFormDropdown()`, `addFormDatePicker()`, `addFormSwitch()`, `addFormSlider()`, `addFormNumber()`, `addHeading()`.
- **Typed Value Accessors**: `getText(id)`, `setText(id, val)`, `setHtml(id, html)`, `getBool(id)`, `setBool(id, val)`, `getInt(id)`, `setInt(id, val)`, `getFloat(id)`, `setFloat(id, val)`.
- **Media, Code & HTML Views**: `addHtmlView(id, initialHtml)` / `add_html_view(...)` for dedicated rich HTML/Markdown renderers, `addCodeView()`, `addImageView()`.
- **Real-Time Keystroke & Input Synchronization**: Immediate `oninput` bridge synchronization for `<input>` and `<textarea>` controls ensures typed values sync instantly to Bun's `formValuesStore` and trigger `onChange` listeners without requiring focus loss / blur.
- **Auto-Reflowing Layout Containers**: `beginRow()` / `endRow()`, `beginGrid(cols)`, `endGrid()`, `beginCard(title)`, `endCard()`, `beginFlex()`, `endFlex()`.
- **Form Value Serialization**: `win.getFormValues()`, `win.setFormValues()`, `win.getValue(id)`, `win.setValue(id, val)`.
- **Native Dialogs & OS APIs**: `showAlert()`, `showConfirm()`, `showPrompt()`, `copyToClipboard()`, `setAlwaysOnTop()`, `toggleFullscreen()`.
- **Non-Visual Timer Loop**: `win.addTimer(intervalMs, onTick)`.
- **Demos**: `bun run demo:simplegui`, `bun run demo:simplegui_all`, or `bun run demo:ergonomics`.

---

<a id="documentation-reference-apimd-vs-simplegui_apimd"></a>
<a id="documentation-reference--apimd-vs-simplegui_apimd"></a>

## 📚 Documentation Reference: docs/API.md vs. docs/SIMPLEGUI_API.md

**Bun RAD Studio** provides dedicated documentation guides inside the `docs/` folder:

| Feature / Topic       | 📖 [docs/API.md](docs/API.md)                                                          | 🎨 [docs/SIMPLEGUI_API.md](docs/SIMPLEGUI_API.md)                                         |
| --------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Primary Scope**     | **Visual RAD Studio IDE & Core Engine**                                                | **Declarative Code-First `simplegui` Module**                                             |
| **Approach**          | Drag-and-drop canvas, Object Inspector, visual layout grid                             | Pure TypeScript code layout with fluent method chaining                                   |
| **Data Architecture** | `FormSpec` JSON schema, visual control properties, anchors & docking                   | `SimpleWindow` instance, auto-reflowing containers (`beginRow`, `beginCard`, `beginGrid`) |
| **IPC & Backend**     | Low-level Webview IPC bindings (`wv.bind(...)`), runtime helper methods                | High-level TypeScript methods (`getFormValues()`, `showAlert()`, `saveFormToFile()`)      |
| **Code Exporters**    | Multi-target generators (Bun TS, React + Tailwind, Vue 3, Python CustomTkinter, HTML5) | Direct native execution via Bun (`win.run()`)                                             |
| **Target Use Case**   | Visual app design, form spec JSON inspection, multi-framework exporting                | Rapid code-driven desktop app development without a visual designer                       |

<a id="summary-of-api-files"></a>

### 📖 Summary of Documentation in `docs/`

- **[docs/API.md](docs/API.md)**: Technical specification for the **Visual RAD Designer Studio**. Documents the `FormSpec` JSON data schema, 70+ visual component definitions, low-level Webview IPC protocol, window placement APIs, and code generator architectures.
- **[docs/SIMPLEGUI_API.md](docs/SIMPLEGUI_API.md)**: Beginner-friendly developer reference for the **Declarative `simplegui` Module**. Documents window creation, reflowing card/grid/row layouts, fluent styling modifiers, popups/dialogs, timers, group operations, state helpers, and JSON settings persistence.
- **[docs/THEMES.md](docs/THEMES.md)**: Complete visual gallery of all 63 built-in themes with screenshots, color palettes, launch commands, and categorized breakdowns.
- **[docs/SYSTEM_UTILITIES_API.md](docs/SYSTEM_UTILITIES_API.md)**: Reference guide for embedded system utilities and command-line companion tools.
- **[docs/userguides/](docs/userguides/README.md)**: Step-by-step user guides and screenshots for every desktop workstation application.

---

<a id="keyboard-shortcuts--power-actions"></a>

## ⌨️ Keyboard Shortcuts & Power Actions

| Shortcut                                               | Action                                                    |
| ------------------------------------------------------ | --------------------------------------------------------- |
| **F5**                                                 | Launch Live App Preview Window                            |
| **⌘ + F** / **Ctrl + F** / **Fn + F** / **F11**        | Toggle Native Borderless Fullscreen Mode                  |
| **⌘ + M** / **Ctrl + M** / **Alt + M**                 | Minimize Application Window (auto-exits fullscreen space) |
| **⌘ + H** / **Ctrl + H**                               | Hide Application Window (`[NSApp hide:]`)                 |
| **⌘ + Shift + T** / **Ctrl + Shift + T** / **Alt + T** | Toggle Always on Top (Window Pinning)                     |
| **⌘ + Shift + C** / **Ctrl + Shift + C**               | Center Window on Screen                                   |
| **⌘ + Q** / **⌘ + W** / **Alt + F4** / **Ctrl + Q**    | Terminate & Quit Application (`process.exit(0)`)          |
| **Alt + Alt** (Double-tap Alt)                         | Fast Close & Terminate Application                        |
| **Cmd / Ctrl + (+ / - / 0)**                           | Zoom in, Zoom out, Reset zoom (100%)                      |
| **⌘ + C** / **Ctrl + C**                               | Copy selected control(s) to clipboard buffer              |
| **⌘ + V** / **Ctrl + V**                               | Paste copied control(s) at cursor position                |
| **⌘ + D** / **Ctrl + D**                               | Duplicate selected control(s)                             |
| **⌘ + A** / **Ctrl + A**                               | Select all controls on canvas                             |
| **⌘ + Z** / **Ctrl + Z**                               | Undo action                                               |
| **⌘ + Shift + Z**                                      | Redo action                                               |
| **Delete** / **Backspace**                             | Delete selected control(s)                                |
| **Arrow Keys**                                         | Nudge selected control(s) position by 1px                 |
| **Shift + Arrow Keys**                                 | Nudge selected control(s) position by 8px (Grid snap)     |
| **Space + Mouse Drag**                                 | Pan canvas workspace view                                 |
| **Cmd / Ctrl + Mouse Wheel**                           | Zoom canvas workspace (50% – 200%)                        |
| **Escape**                                             | Exit Fullscreen / Deselect controls / Close modals        |

---

<a id="project-structure"></a>

## 📂 Project Structure

```
bun_rad_studio/
├── index.ts           # Main Bun entry point, FFI Window Manager & Webview IPC runner
├── package.json       # Dependencies, scripts (build, build:binary, build:all, clean, demos)
├── tsconfig.json      # TypeScript compiler settings
├── README.md          # Main Documentation & User Guide
├── docs/              # Documentation Directory (all guides except README.md)
│   ├── API.md             # Visual RAD Designer API & FormSpec JSON Schema Specification
│   ├── SIMPLEGUI_API.md   # Declarative Code-First SimpleGUI API Guide & Reference
│   ├── THEMES.md          # Complete 63-Theme Visual Gallery & Reference
│   ├── SYSTEM_UTILITIES_API.md # CLI & System Utilities Reference
│   └── userguides/        # Application User Guides & Screenshots
├── scripts/
│   └── build.ts       # Dist build orchestrator (lib + binary targets)
├── src/
│   ├── ide.html       # Complete RAD Designer Studio HTML5/CSS3/JS Application
│   └── simplegui.ts   # Declarative SimpleGUI module
├── demos/             # 18 Executable demo applications (bun run demo:*)
├── tests/             # Comprehensive test suite (bun test)
└── dist/              # Build output (generated by bun run build)
    ├── index.js       # Bundled ESM library
    ├── simplegui.js   # Bundled SimpleGUI module
    ├── src/ide.html   # Copied RAD Studio asset
    └── bun_rad_studio # Standalone binary (bun run build:binary)
```

---

<a id="related-rad--gui-ecosystem-projects"></a>

## 🌟 Related RAD & GUI Ecosystem Projects

Explore sister projects and complementary GUI frameworks, templates, and RAD visual design suites:

| Project                                                                                                  | Primary Stack                 | Architecture & Description                                                                                                                                                                                                                                                |
| :------------------------------------------------------------------------------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **[simple_gg](https://github.com/codecaine-zz/simple_gg)**                                               | V (vlang) + Sokol / gg        | Lightweight, cross-platform hardware-accelerated GUI framework with zero C/Obj-C dependencies. Delivers 47 desktop studio workstations, 49 companion CLIs, 34 themes, and reactive state persistence.                                                                     |
| **[Vlang Webview RAD Studio](https://github.com/codecaine-zz/vlang_webview_rad_studio)**                 | V (vlang) + Native OS Webview | Cross-platform visual Rapid Application Development (RAD) IDE & enterprise desktop suite. Borland Delphi/VB-inspired form designer with 70+ controls, 42 desktop themes, 16 enterprise studio applications, 16 companion CLIs, and standalone `.app`/`.exe`/ELF packager. |
| **[Vlang macOS Webview App Template](https://github.com/codecaine-zz/vlang_macos_webview_app_template)** | V (vlang) + Cocoa Webview     | Standalone native macOS `.app` desktop application template for V using `ttytm.webview`, Cocoa Objective-C window helper integration (`window_helper.m`), 9-point screen placement geometry, stay-on-top pinning, and two-way IPC.                                        |
| **[vlang_simplegui](https://github.com/codecaine-zz/vlang_simplegui)**                                   | V (vlang) + Native GUI        | Declarative macOS-native GUI starter framework written in V, featuring fluent builder syntax, reactive two-way value synchronization, KPI dashboards, sortable tables, and dynamic live theme switching across 42 themes.                                                 |

### Notable Open-Source Webview Frameworks

- **[pywebview](https://github.com/r0x0r/pywebview)** - Lightweight, cross-platform native GUI window wrapper around OS webviews for Python applications by Roman Sirokov (`r0x0r`) and community.
- **[Neutralinojs](https://github.com/neutralinojs/neutralinojs)** - Portable, lightweight cross-platform desktop application development framework using web technologies and native webview by the Neutralinojs organization.

---

<a id="support--donations"></a>

## 💙 Support & Donations

Bun RAD Studio is free and MIT licensed. If it saves you time and you would like to help keep it going, you can donate with PayPal. Thank you! Starring the repository and reporting problems helps just as much.

| Click | Scan with your phone | In a terminal |
| :---: | :---: | :---: |
| [**paypal.me/codecaine81**](https://paypal.me/codecaine81) | <a href="https://paypal.me/codecaine81"><img src="docs/images/donate-paypal-qr.png" alt="QR code for paypal.me/codecaine81" width="140"></a> | `bun run donate` |

GitHub also shows a **Sponsor** button on the repository page (from `.github/FUNDING.yml`).

---

<a id="license"></a>

## 📄 License

MIT License © Jerome Scott. See [LICENSE](LICENSE).

Dependencies installed by `bun install` (for example `webview-bun`) keep their own licenses. Third-party code or media inside `resources/` was **not** audited for license terms.
