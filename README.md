# ⚡ Bun RAD Studio (Delphi / Visual Basic Style IDE)

A high-performance Rapid Application Development (RAD) Visual IDE for **Bun** and **Webview-Bun**, inspired by classic Borland Delphi and Visual Basic 6, built with modern web technologies.

[![Bun](https://img.shields.io/badge/Bun-v1.3.14-orange?style=for-the-badge&logo=bun)](https://bun.sh)
[![Webview-Bun](https://img.shields.io/badge/Webview--Bun-v2.4.0-blue?style=for-the-badge)](https://github.com/codecaine-zz/bun_webview)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org)
[![RAD Designer](https://img.shields.io/badge/RAD%20Designer-Included-10b981?style=for-the-badge)](API.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

> 📖 **Quick Links:** [Application User Guides](docs/userguides/README.md) • [API Specification](API.md) • [SimpleGUI Manual](SIMPLEGUI_API.md) • [Interactive Demos](#3-run-interactive-feature-demos) • [Enterprise Applications](#16-enterprise-production-workstations--utilities) • [Ecosystem Projects](#related-rad--gui-ecosystem-projects)

![Bun RAD Studio Application Screenshot](screenshot.png)

### ⚡ Modern Productivity UI Controls Studio (`demo:productivity`)

![Modern Productivity UI Controls Studio Screenshot](screenshot_productivity.png)

### ⚡ SimpleGUI Ergonomics & Shortcuts API Showcase (`demos/18_simplegui_ergonomics_demo.ts`)

![SimpleGUI Ergonomics & Shortcuts Demo Screenshot](screenshot_ergonomics.png)

### 🎨 Complete All-Controls Single-Form Theme Showcase (`bun run demo:themes`)

![Theme Showcase - Monokai Pro Single Form](screenshots/themes/monokai_pro.png)

---

## 📑 Table of Contents

- [🌟 Highlights & Features](#highlights--features)
  - [🚀 Visual RAD Form Designer](#visual-rad-form-designer)
  - [🖼️ Native Window Management & Placement API](#native-window-management--placement-api)
  - [🗄️ MS Access & Delphi Data-Aware RAD Controls](#ms-access--delphi-data-aware-rad-controls)
  - [🎨 70+ Modern UI & RAD Controls](#70-modern-ui--rad-controls)
  - [🎨 Built-in Desktop Form Themes & Visual Gallery (63 Themes)](#built-in-desktop-form-themes--visual-gallery-63-themes)
  - [🛠️ High-Level Backend & Client Helper Utilities](#high-level-backend--client-helper-utilities)
  - [⚡ Auto-Generated Code & Multi-Target Exporters](#auto-generated-code--multi-target-exporters)
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
- [📦 Compiling Standalone macOS Binaries (.app) with Custom Icons](#compiling-standalone-macos-binaries-app-with-custom-icons)
  - [Option 1: Native Single-File Executable via `build:binary`](#option-1-native-single-file-executable-via-buildbinary)
  - [Option 2: Full macOS `.app` Bundle with Custom Icons](#option-2-full-macos-app-bundle-with-custom-icons)
- [🎨 Declarative SimpleGUI Module (`simplegui`)](#declarative-simplegui-module-simplegui)
  - [Key Features](#key-features)
- [📚 Documentation Reference: API.md vs. SIMPLEGUI_API.md](#documentation-reference-apimd-vs-simplegui_apimd)
  - [📖 Summary of API Files](#summary-of-api-files)
- [⌨️ Keyboard Shortcuts & Power Actions](#keyboard-shortcuts--power-actions)
- [📂 Project Structure](#project-structure)
- [🌟 Related RAD & GUI Ecosystem Projects](#related-rad--gui-ecosystem-projects)
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

<a id="built-in-desktop-form-themes--visual-gallery-63-themes"></a>

### 🎨 Built-in Desktop Form Themes & Visual Gallery (63 Themes)

Bun RAD Studio and SimpleGUI feature **63 built-in, pixel-perfect desktop UI themes** covering signature developer aesthetics, modern operating system environments (macOS Sonoma, Windows 11 Fluent Acrylic & Mica, Ubuntu Yaru, GNOME Libadwaita, Linux Mint Cinnamon, System76 Pop!\_OS, Fedora Workstation), popular syntax themes (Monokai Pro, Tokyo Night, One Dark Pro, Gruvbox, Rosé Pine, Everforest, Kanagawa, Dracula, Nord, Catppuccin), and authentic nostalgic retro platforms (Windows 95, Commodore 64, Amiga, Macintosh System 7, Game Boy, Matrix Phosphor, Amber CRT, Synthwave '84, NeXTSTEP, Mac OS X Aqua, Hot Dog Stand, PlayStation 1994).

👉 **[🖼️ View the Complete 63-Theme Visual Screenshot Gallery in THEMES.md](THEMES.md)** for direct side-by-side screenshots, color palettes, and quick launch commands for every theme!

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

#### 📸 Featured Theme Visual Showcases (All Controls on a Single Form)

##### 1. CodeFreelance Signature Dark Theme (`codefreelance`)

_#050505 obsidian base, #121212 cards, #0fb36a neon emerald green & #bd00ff purple accents ([codefreelance.net](https://codefreelance.net))_
![CodeFreelance Theme Showcase](screenshots/themes/codefreelance.png)

##### 2. Monokai Pro (`monokai_pro`)

_Refined dark spectrum with warm canary yellow, vivid magenta, and charcoal card surfaces_
![Monokai Pro Theme Showcase](screenshots/themes/monokai_pro.png)

##### 3. Tokyo Night (`tokyo_night`)

_Dark neon indigo city atmosphere with vibrant electric cyan blue and lavender accents_
![Tokyo Night Theme Showcase](screenshots/themes/tokyo_night.png)

##### 4. One Dark Pro (`one_dark_pro`)

_Atom & VS Code iconic deep slate canvas with vibrant sky blue and syntax hues_
![One Dark Pro Theme Showcase](screenshots/themes/one_dark_pro.png)

##### 5. Gruvbox Dark (`gruvbox_dark`) & Gruvbox Light (`gruvbox_light`)

_Retro groove warm earthy dark palette with amber gold & warm parchment light mode_
![Gruvbox Dark Theme Showcase](screenshots/themes/gruvbox_dark.png)
![Gruvbox Light Theme Showcase](screenshots/themes/gruvbox_light.png)

##### 6. Rosé Pine (`rose_pine`) & Everforest Dark (`everforest`)

_Natural minimalist aesthetic with dusty rose & soothing low-strain dark forest green_
![Rosé Pine Theme Showcase](screenshots/themes/rose_pine.png)
![Everforest Dark Theme Showcase](screenshots/themes/everforest.png)

##### 7. Windows 11 Fluent Slate (`win11_slate`) & Windows 11 Mica Light (`win11_light`)

_Modern Windows 11 Fluent Acrylic dark and crisp Mica light desktop styling_
![Windows 11 Fluent Slate Theme Showcase](screenshots/themes/win11_slate.png)
![Windows 11 Mica Light Theme Showcase](screenshots/themes/win11_light.png)

##### 8. Modern Linux Desktop Themes (Ubuntu Yaru, GNOME Libadwaita, Linux Mint & Pop!\_OS)

_Authentic Linux desktop styling with Ubuntu Yaru Dark/Light, GNOME Adwaita Dark/Light, Linux Mint Cinnamon, and System76 Pop!\_OS_
![Ubuntu Yaru Dark Theme Showcase](screenshots/themes/ubuntu_dark.png)
![GNOME Adwaita Dark Theme Showcase](screenshots/themes/adwaita_dark.png)
![Linux Mint Dark Theme Showcase](screenshots/themes/linux_mint.png)
![Pop!_OS Dark Theme Showcase](screenshots/themes/pop_os.png)

##### 9. Retro & Nostalgic Computing ("Bring Back Memories")

_Windows 95 classic teal desktop, 1999 Matrix digital rain, and Synthwave '84 arcade neon_
![Windows 95 Theme Showcase](screenshots/themes/win95.png)
![Matrix Phosphor Theme Showcase](screenshots/themes/matrix.png)
![Synthwave '84 Theme Showcase](screenshots/themes/synthwave.png)
![Game Boy 1989 Theme Showcase](screenshots/themes/gameboy.png)

#### 📋 Complete Built-in Themes Directory (63 Themes)

|   #    | Theme Key           | Name                        | Palette Type | Primary Accent |                    Screenshot                    | Vibe & Aesthetic                                                                                                         |
| :----: | :------------------ | :-------------------------- | :----------: | :------------: | :----------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------- |
| **01** | `codefreelance`     | **CodeFreelance**           |   🌙 Dark    |   `#0fb36a`    |   [View](screenshots/themes/codefreelance.png)   | Official obsidian canvas, neon emerald & purple accents                                                                  |
| **02** | `raycast_dark`      | **Raycast Dark**            |   🌙 Dark    |   `#ff6363`    |   [View](screenshots/themes/raycast_dark.png)    | Silicon Valley dev command palette with laser red                                                                        |
| **03** | `linear_dark`       | **Linear Studio**           |   🌙 Dark    |   `#5e6ad2`    |    [View](screenshots/themes/linear_dark.png)    | High-craft Linear workspace with electric indigo                                                                         |
| **04** | `vercel_dark`       | **Vercel Geist**            |   🌙 Dark    |   `#ffffff`    |    [View](screenshots/themes/vercel_dark.png)    | Ultra-minimalist monochrome Next.js & Vercel contrast                                                                    |
| **05** | `unreal_engine`     | **Unreal Engine 5**         |   🌙 Dark    |   `#0e86d4`    |   [View](screenshots/themes/unreal_engine.png)   | Epic Games 3D workstation dark graphite & Blueprint blue                                                                 |
| **06** | `arc_velvet`        | **Arc Velvet**              |   🌙 Dark    |   `#f72585`    |    [View](screenshots/themes/arc_velvet.png)     | Arc Browser velvet aesthetic with plum & neon magenta                                                                    |
| **07** | `abyss`             | **Abyss Bioluminescence**   |   🌙 Dark    |   `#06b6d4`    |       [View](screenshots/themes/abyss.png)       | Deep oceanic trench with glowing bioluminescent cyan                                                                     |
| **08** | `night_city`        | **Cyberpunk Night City**    |   🌙 Dark    |   `#ff003c`    |    [View](screenshots/themes/night_city.png)     | AAA Cyberpunk 2077 HUD with Trauma Team red & yellow                                                                     |
| **09** | `horizon`           | **Horizon Sunset**          |   🌙 Dark    |   `#e95678`    |      [View](screenshots/themes/horizon.png)      | Warm twilight horizon with neon peach, coral & dusk plum                                                                 |
| **10** | `tailwind_dark`     | **Tailwind Slate Emerald**  |   🌙 Dark    |   `#10b981`    |   [View](screenshots/themes/tailwind_dark.png)   | Modern Tailwind CSS flagship slate 950 & emerald                                                                         |
| **11** | `supabase`          | **Supabase Dark**           |   🌙 Dark    |   `#3ecf8e`    |     [View](screenshots/themes/supabase.png)      | Supabase cloud database obsidian & signature brand emerald                                                               |
| **12** | `oled_black`        | **OLED Laser Black**        |   🌙 Dark    |   `#00e676`    |    [View](screenshots/themes/oled_black.png)     | Zero-power pure OLED black canvas with laser green                                                                       |
| **13** | `titanium_slate`    | **Titanium Slate Pro**      |   🌙 Dark    |   `#ff6b22`    |  [View](screenshots/themes/titanium_slate.png)   | Apple Pro titanium space black & aviation orange                                                                         |
| **14** | `jetbrains_darcula` | **JetBrains Darcula**       |   🌙 Dark    |   `#cc7832`    | [View](screenshots/themes/jetbrains_darcula.png) | Iconic IntelliJ IDEA & PyCharm Darcula IDE workspace                                                                     |
| **15** | `nordic_paper`      | **Nordic Paper Light**      |   ☀️ Light   |   `#2b5c8f`    |   [View](screenshots/themes/nordic_paper.png)    | Nordic editorial paper light canvas & deep fjord blue                                                                    |
| **16** | `monokai_pro`       | **Monokai Pro**             |   🌙 Dark    |   `#ffd866`    |    [View](screenshots/themes/monokai_pro.png)    | Refined charcoal spectrum with vivid warm yellow                                                                         |
| **17** | `tokyo_night`       | **Tokyo Night**             |   🌙 Dark    |   `#7aa2f7`    |    [View](screenshots/themes/tokyo_night.png)    | Neon indigo city night with cyan and lavender accents                                                                    |
| **18** | `one_dark_pro`      | **One Dark Pro**            |   🌙 Dark    |   `#61afef`    |   [View](screenshots/themes/one_dark_pro.png)    | Iconic Atom/VS Code deep slate with syntax sky blue                                                                      |
| **19** | `gruvbox_dark`      | **Gruvbox Dark**            |   🌙 Dark    |   `#fabd2f`    |   [View](screenshots/themes/gruvbox_dark.png)    | Retro groove warm earthy dark palette with amber gold                                                                    |
| **20** | `gruvbox_light`     | **Gruvbox Light**           |   ☀️ Light   |   `#b57614`    |   [View](screenshots/themes/gruvbox_light.png)   | Retro groove parchment light canvas with walnut tones                                                                    |
| **21** | `rose_pine`         | **Rosé Pine**               |   🌙 Dark    |   `#eb6f92`    |     [View](screenshots/themes/rose_pine.png)     | All-natural soft dark palette with dusty rose & pine foam                                                                |
| **22** | `everforest`        | **Everforest Dark**         |   🌙 Dark    |   `#a7c080`    |    [View](screenshots/themes/everforest.png)     | Natural comfort forest dark mode for zero eye strain                                                                     |
| **23** | `kanagawa`          | **Kanagawa**                |   🌙 Dark    |   `#7e9cd8`    |     [View](screenshots/themes/kanagawa.png)      | Japanese ukiyo-e wave art inspired dark sumi ink palette                                                                 |
| **24** | `cobalt2`           | **Cobalt2**                 |   🌙 Dark    |   `#ffc600`    |      [View](screenshots/themes/cobalt2.png)      | Wes Bos official deep cobalt navy with brilliant yellow                                                                  |
| **25** | `win11_slate`       | **Windows 11 Fluent Slate** |   🌙 Dark    |   `#60cdff`    |    [View](screenshots/themes/win11_slate.png)    | Modern Windows 11 Fluent Dark Acrylic with sky cyan                                                                      |
| **26** | `win11_light`       | **Windows 11 Mica Light**   |   ☀️ Light   |   `#005fb8`    |    [View](screenshots/themes/win11_light.png)    | Modern Windows 11 Mica Light desktop with Fluent typography                                                              |
| **27** | `ubuntu_dark`       | **Ubuntu Yaru Dark**        |   🌙 Dark    |   `#e95420`    |    [View](screenshots/themes/ubuntu_dark.png)    | Official Ubuntu Yaru modern Linux dark desktop with warm aubergine charcoal surfaces and signature Ubuntu orange accents |
| **28** | `ubuntu_light`      | **Ubuntu Yaru Light**       |   ☀️ Light   |   `#e95420`    |   [View](screenshots/themes/ubuntu_light.png)    | Clean Ubuntu Yaru modern Linux light desktop with crisp white surfaces, warm gray borders, and vibrant Ubuntu orange     |
| **29** | `adwaita_dark`      | **GNOME Adwaita Dark**      |   🌙 Dark    |   `#3584e4`    |   [View](screenshots/themes/adwaita_dark.png)    | Modern GNOME Libadwaita desktop theme with deep slate surfaces and signature Adwaita blue accents                        |
| **30** | `adwaita_light`     | **GNOME Adwaita Light**     |   ☀️ Light   |   `#3584e4`    |   [View](screenshots/themes/adwaita_light.png)   | Clean GNOME Libadwaita light desktop with neutral paper surfaces and signature blue controls                             |
| **31** | `linux_mint`        | **Linux Mint Dark**         |   🌙 Dark    |   `#87a556`    |    [View](screenshots/themes/linux_mint.png)     | Modern Linux Mint Cinnamon desktop theme with slate graphite surfaces and signature mint green accents                   |
| **32** | `pop_os`            | **Pop!\_OS Dark**           |   🌙 Dark    |   `#48b9c7`    |      [View](screenshots/themes/pop_os.png)       | System76 Pop!\_OS and COSMIC modern Linux desktop with dark charcoal surfaces and signature teal and amber accents       |
| **33** | `fedora_dark`       | **Fedora Blue**             |   🌙 Dark    |   `#51a2da`    |    [View](screenshots/themes/fedora_dark.png)    | Official Fedora Workstation modern Linux theme with navy graphite cards and crisp Fedora blue                            |
| **34** | `aura`              | **Aura Dark**               |   🌙 Dark    |   `#a277ff`    |       [View](screenshots/themes/aura.png)        | Lush mystical dark theme with neon purple & mint accents                                                                 |
| **35** | `sonoma_emerald`    | **Sonoma Emerald**          |   🌙 Dark    |   `#30d158`    |  [View](screenshots/themes/sonoma_emerald.png)   | macOS Sonoma dark forest glass palette                                                                                   |
| **36** | `apple_dark`        | **Apple Dark**              |   🌙 Dark    |   `#0a84ff`    |    [View](screenshots/themes/apple_dark.png)     | Vibrant macOS Dark Mode surface (Default)                                                                                |
| **37** | `apple_light`       | **Apple Light**             |   ☀️ Light   |   `#0071e3`    |    [View](screenshots/themes/apple_light.png)    | Clean, bright macOS Aqua light canvas                                                                                    |
| **38** | `midnight`          | **Midnight Space Gray**     |   🌙 Dark    |   `#38bdf8`    |     [View](screenshots/themes/midnight.png)      | Pro dark titanium space gray workstation theme                                                                           |
| **39** | `apple_sunset`      | **Apple Sunset**            |   🌙 Dark    |   `#ff7733`    |   [View](screenshots/themes/apple_sunset.png)    | Warm macOS Mojave twilight sunset hues                                                                                   |
| **40** | `ventura_amber`     | **Ventura Amber**           |   🌙 Dark    |   `#ff9500`    |   [View](screenshots/themes/ventura_amber.png)   | macOS Ventura golden sunset dark hues                                                                                    |
| **41** | `soft_pastel`       | **Soft Pastel**             |   ☀️ Light   |   `#e07a5f`    |    [View](screenshots/themes/soft_pastel.png)    | Apple Studio warm soft light canvas                                                                                      |
| **42** | `catppuccin`        | **Catppuccin Mocha**        |   🌙 Dark    |   `#cba6f7`    |    [View](screenshots/themes/catppuccin.png)     | Soothing lavender catppuccin dark mode                                                                                   |
| **43** | `nord`              | **Nord**                    |   🌙 Dark    |   `#88c0d0`    |       [View](screenshots/themes/nord.png)        | Arctic frost nord developer palette                                                                                      |
| **44** | `dracula`           | **Dracula**                 |   🌙 Dark    |   `#bd93f9`    |      [View](screenshots/themes/dracula.png)      | High-contrast vampire purple palette                                                                                     |
| **45** | `cyberpunk`         | **Cyberpunk**               |   🌙 Dark    |   `#ff007f`    |     [View](screenshots/themes/cyberpunk.png)     | Neon glow dark contrast palette                                                                                          |
| **46** | `github_dark`       | **GitHub Dark**             |   🌙 Dark    |   `#58a6ff`    |    [View](screenshots/themes/github_dark.png)    | Official GitHub dark interface palette                                                                                   |
| **47** | `github_light`      | **GitHub Light**            |   ☀️ Light   |   `#0969da`    |   [View](screenshots/themes/github_light.png)    | Clean GitHub light canvas palette                                                                                        |
| **48** | `solarized_dark`    | **Solarized Dark**          |   🌙 Dark    |   `#2aa198`    |  [View](screenshots/themes/solarized_dark.png)   | Precision engineered solarized dark palette                                                                              |
| **49** | `solarized_light`   | **Solarized Light**         |   ☀️ Light   |   `#268bd2`    |  [View](screenshots/themes/solarized_light.png)  | Precision engineered solarized light palette                                                                             |
| **50** | `navy_blue`         | **Navy Blue**               |   🌙 Dark    |   `#38bdf8`    |     [View](screenshots/themes/navy_blue.png)     | Deep slate navy dark theme                                                                                               |
| **51** | `forest_green`      | **Forest Green**            |   🌙 Dark    |   `#4ade80`    |   [View](screenshots/themes/forest_green.png)    | Rich emerald green dark theme                                                                                            |
| **52** | `win95`             | **Windows 95**              |   ☀️ Retro   |   `#000080`    |       [View](screenshots/themes/win95.png)       | Iconic Windows 95 classic teal desktop & silver 3D cards                                                                 |
| **53** | `gameboy`           | **Game Boy 1989**           |   🌙 Retro   |   `#8bac0f`    |      [View](screenshots/themes/gameboy.png)      | Nostalgic 4-shade monochrome dot matrix DMG-01 screen                                                                    |
| **54** | `c64`               | **Commodore 64**            |   🌙 Retro   |   `#7974ff`    |        [View](screenshots/themes/c64.png)        | Legendary 1982 Commodore 64 READY prompt & VIC-II blue                                                                   |
| **55** | `mac_classic`       | **Macintosh System 7**      |   ☀️ Retro   |   `#5555aa`    |    [View](screenshots/themes/mac_classic.png)    | Vintage 1991 System 7 Platinum desktop with Chicago font                                                                 |
| **56** | `amber_crt`         | **Phosphor Amber CRT**      |   🌙 Retro   |   `#ffb000`    |     [View](screenshots/themes/amber_crt.png)     | Warm VT220 / Pip-Boy amber phosphor monochrome terminal                                                                  |
| **57** | `matrix`            | **Matrix Phosphor**         |   🌙 Retro   |   `#00ff41`    |      [View](screenshots/themes/matrix.png)       | Iconic 1999 digital rain phosphor green mainframe terminal                                                               |
| **58** | `synthwave`         | **Synthwave '84**           |   🌙 Retro   |   `#ff2a85`    |     [View](screenshots/themes/synthwave.png)     | 1980s neon synthwave, sunset magenta grid & arcade glow                                                                  |
| **59** | `amiga`             | **Amiga Workbench**         |   🌙 Retro   |   `#ff8800`    |       [View](screenshots/themes/amiga.png)       | Retro Amiga 500 Workbench 1.3 royal blue & orange buttons                                                                |
| **60** | `nextstep`          | **NeXTSTEP 1989**           |   🌙 Retro   |   `#4a90e2`    |     [View](screenshots/themes/nextstep.png)      | Steve Jobs 1989 NeXTSTEP UNIX workstation dark elegance                                                                  |
| **61** | `mac_os_aqua`       | **Mac OS X Aqua**           |   ☀️ Retro   |   `#0076fe`    |    [View](screenshots/themes/mac_os_aqua.png)    | Early 2001 OS X Cheetah glossy gel buttons & pinstripes                                                                  |
| **62** | `hotdog_stand`      | **Hot Dog Stand**           |   🌙 Retro   |   `#ff0000`    |   [View](screenshots/themes/hotdog_stand.png)    | Unforgettable Windows 3.1 1992 high-contrast yellow & red                                                                |
| **63** | `playstation`       | **PlayStation 1994**        |   🌙 Retro   |   `#00d2c4`    |    [View](screenshots/themes/playstation.png)    | 1994 PSX console grey with geometric controller accents                                                                  |

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

Typical fix flow:

```powershell
Remove-Item Env:WEBVIEW_PATH -ErrorAction SilentlyContinue
bun install
bun run .\demos\23_all_themes_all_controls_showcase.ts
```

If the loader is still missing, run the architecture-specific helper script:

```powershell
# Standard Windows x64
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1

# Windows ARM64
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1
```

> [!IMPORTANT]
> Windows ARM64 machines must use an ARM64-compatible WebView2 runtime and a compatible native library. A 64-bit x64 library can fail on ARM64 hardware even when the rest of the app is otherwise correct.
>
> For most Windows users, the x64 path is the easiest and most broadly compatible option.

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

### 2. Launch RAD Studio

```bash
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

## ⚡ 26 Enterprise Production Workstations & Utilities

In addition to RAD form design and UI demos, Bun RAD Studio provides a comprehensive suite of **26 production-grade developer desktop workstations** engineered with zero Homebrew/external binary reliance. Each application includes detailed documentation in the [User Guides Directory](docs/userguides/README.md).

|   #    | Application                        | User Guide                                                   | Focus & Capabilities                                                                                                        | Launch Command          |
| :----: | :--------------------------------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :---------------------- |
| **01** | **Database Studio Pro**            | [User Guide](docs/userguides/01_database_studio.md)          | SQLite editor, schema DDL introspection, query plans (`EXPLAIN`), CSV/JSON/SQL export.                                      | `bun run app:database`  |
| **02** | **System & Package Workstation**   | [User Guide](docs/userguides/02_system_package_studio.md)    | Hardware telemetry (RAM/CPUs/Uptime), Bun global cache analysis, npm/bun registry search.                                   | `bun run app:system`    |
| **03** | **Task Watcher Studio**            | [User Guide](docs/userguides/03_task_watcher_studio.md)      | Native `fs.watch` event pipeline, extension filters, ignore rules, continuous build console.                                | `bun run app:watcher`   |
| **04** | **JSON Query Studio Pro**          | [User Guide](docs/userguides/04_json_query_studio.md)        | High-throughput JSON query engine, nested selectors, key projections, live query telemetry.                                 | `bun run app:json`      |
| **05** | **DevTools Studio Pro**            | [User Guide](docs/userguides/05_devtools_studio.md)          | 6-in-1 suite: Ripgrep code search, Fd file tree finder, Sd regex replace, Watcher, Trash, JQ.                               | `bun run app:devtools`  |
| **06** | **Process Monitor Studio**         | [User Guide](docs/userguides/06_process_monitor_studio.md)   | macOS Activity Monitor inspection, PID search, CPU/RSS memory consumption, signal dispatch.                                 | `bun run app:process`   |
| **07** | **API Studio Pro**                 | [User Guide](docs/userguides/07_api_studio.md)               | HTTP/REST client (GET/POST/PUT/DELETE/PATCH), Bearer/Basic/ApiKey auth, cURL generator.                                     | `bun run app:api`       |
| **08** | **Data Converter Studio**          | [User Guide](docs/userguides/08_data_converter_studio.md)    | Bidirectional transformer across CSV, TSV, JSON, YAML, Base64, and Markdown tables.                                         | `bun run app:convert`   |
| **09** | **Crypto Studio Pro**              | [User Guide](docs/userguides/09_crypto_studio.md)            | SHA-256/512, MD5, HMAC, AES-256-GCM encryption/decryption, JWT decoder, password entropy.                                   | `bun run app:crypto`    |
| **10** | **Regex Studio Pro**               | [User Guide](docs/userguides/10_regex_studio.md)             | Live regular expression tester, capture groups table, substitution preview, TypeScript export.                              | `bun run app:regex`     |
| **11** | **App Bundler Studio**             | [User Guide](docs/userguides/11_app_bundler_studio.md)       | Standalone binary compiler via `bun build --compile`, cross-platform targets, macOS `.app`.                                 | `bun run app:bundler`   |
| **12** | **Network Forensics Studio**       | [User Guide](docs/userguides/12_network_forensics_studio.md) | TCP socket port scanner (`node:net`), DNS records lookup (`A/AAAA/MX/TXT/NS`), HTTP TTFB.                                   | `bun run app:network`   |
| **13** | **Git Workbench Pro**              | [User Guide](docs/userguides/13_git_workbench_studio.md)     | Working tree status, visual diff viewer (`git diff / --staged`), commit log, stage, commit.                                 | `bun run app:git`       |
| **14** | **Markdown Studio Pro**            | [User Guide](docs/userguides/14_markdown_studio.md)          | Split-pane Markdown editor, instant live HTML preview, reading stats, standalone HTML export.                               | `bun run app:markdown`  |
| **15** | **Color & Design Token Studio**    | [User Guide](docs/userguides/15_color_token_studio.md)       | HEX/RGB/HSL converter, WCAG 2.1 AA/AAA contrast auditor, 50–950 tonal scale, token export.                                  | `bun run app:color`     |
| **16** | **Environment Vault Studio**       | [User Guide](docs/userguides/16_environment_vault_studio.md) | `.env` parser & validator, secret key detection & masking, diff against `.env.example`.                                     | `bun run app:env`       |
| **17** | **Fd Studio Pro**                  | [User Guide](docs/userguides/17_fd_studio.md)                | Native Bun ultra-fast filesystem search (`fd-find` replacement), regex/glob filters, Rip safe burial quarantine & recovery, batch exec. | `bun run app:fd`        |
| **18** | **Rip Studio Pro**                 | [User Guide](docs/userguides/18_rip_studio.md)               | Safe & ergonomic alternative to `rm`, graveyard quarantine, instant undo restoration, pre-deletion inspect.                 | `bun run app:rip`       |
| **19** | **Sd Studio Pro**                  | [User Guide](docs/userguides/19_sd_studio.md)                | Intuitive find & replace (`sed` alternative) with live unified diffs, regex capture groups, and backup files.               | `bun run app:sd`        |
| **20** | **Procs Monitor Studio Pro**       | [User Guide](docs/userguides/20_procs_studio.md)             | Modern `ps` replacement with live process table, CPU/Memory telemetry, listening TCP ports, signal control, and tree view.  | `bun run app:procs`     |
| **21** | **Watchexec Studio Pro**           | [User Guide](docs/userguides/21_watchexec_studio.md)         | Continuous file watcher and command runner with debounce, pattern filters, ignore rules, and streaming console.             | `bun run app:watchexec` |
| **22** | **Tokei Studio Pro**               | [User Guide](docs/userguides/22_tokei_studio.md)             | Fast code & LOC counter across 50+ languages with comment ratios, per-file breakdown, Markdown and JSON export.             | `bun run app:tokei`     |
| **23** | **Gdu Disk Studio Pro**            | [User Guide](docs/userguides/23_gdu_studio.md)               | Fast disk usage analyzer and mounted disk explorer with visual proportion bars, directory drill-down, and cleanup.          | `bun run app:gdu`       |
| **24** | **IpInfo Forensics Studio Pro**    | [User Guide](docs/userguides/24_ipinfo_studio.md)            | IP address geolocation, ASN details, CIDR subnet calculator, and local network interfaces.                                  | `bun run app:ipinfo`    |
| **25** | **Subfinder Discovery Studio Pro** | [User Guide](docs/userguides/25_subfinder_studio.md)         | Passive multi-source subdomain discovery with active DNS verification and HTTP/HTTPS probing.                               | `bun run app:subfinder` |
| **26** | **Doggo DNS Studio Pro**           | [User Guide](docs/userguides/26_doggo_studio.md)             | Modern DNS client for humans with standard record queries, custom resolvers, DNS-over-HTTPS (DoH), and reverse PTR lookups. | `bun run app:doggo`     |

<a id="application-visual-gallery--screenshots"></a>

### 📸 Application Visual Gallery & Screenshots

Explore live desktop and responsive viewport previews for all 26 enterprise production workstations:

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
| :--- | :--- | :--- |
| **Database Studio Pro**<br>[User Guide](docs/userguides/01_database_studio.md)<br>`bun run app:database` | ![Database Studio Desktop](screenshots/apps/database_studio_desktop.png) | ![Database Studio Responsive](screenshots/apps/database_studio_responsive.png) |
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
├── API.md                # Visual RAD Designer API reference
├── SIMPLEGUI_API.md      # SimpleGUI API reference
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

Build native desktop GUIs directly in TypeScript using an intuitive, fluent, event-driven API inspired by [vlang_simplegui](https://github.com/codecaine-zz/vlang_simplegui) — no visual designer required! For complete API docs, see the dedicated [SIMPLEGUI_API.md](SIMPLEGUI_API.md) reference.

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

## 📚 Documentation Reference: API.md vs. SIMPLEGUI_API.md

**Bun RAD Studio** provides two distinct documentation guides depending on whether you are using the **Visual RAD Designer IDE** or the **Declarative `simplegui` Code-First Module**:

| Feature / Topic       | 📖 [API.md](API.md)                                                                    | 🎨 [SIMPLEGUI_API.md](SIMPLEGUI_API.md)                                                   |
| --------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Primary Scope**     | **Visual RAD Studio IDE & Core Engine**                                                | **Declarative Code-First `simplegui` Module**                                             |
| **Approach**          | Drag-and-drop canvas, Object Inspector, visual layout grid                             | Pure TypeScript code layout with fluent method chaining                                   |
| **Data Architecture** | `FormSpec` JSON schema, visual control properties, anchors & docking                   | `SimpleWindow` instance, auto-reflowing containers (`beginRow`, `beginCard`, `beginGrid`) |
| **IPC & Backend**     | Low-level Webview IPC bindings (`wv.bind(...)`), runtime helper methods                | High-level TypeScript methods (`getFormValues()`, `showAlert()`, `saveFormToFile()`)      |
| **Code Exporters**    | Multi-target generators (Bun TS, React + Tailwind, Vue 3, Python CustomTkinter, HTML5) | Direct native execution via Bun (`win.run()`)                                             |
| **Target Use Case**   | Visual app design, form spec JSON inspection, multi-framework exporting                | Rapid code-driven desktop app development without a visual designer                       |

<a id="summary-of-api-files"></a>

### 📖 Summary of API Files

- **[API.md](API.md)**: Technical specification for the **Visual RAD Designer Studio**. Documents the `FormSpec` JSON data schema, 70+ visual component definitions, low-level Webview IPC protocol, window placement APIs, and code generator architectures.
- **[SIMPLEGUI_API.md](SIMPLEGUI_API.md)**: Beginner-friendly developer reference for the **Declarative `simplegui` Module**. Documents window creation, reflowing card/grid/row layouts, fluent styling modifiers, popups/dialogs, timers, group operations, state helpers, and JSON settings persistence.

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
├── API.md             # Visual RAD Designer API & FormSpec JSON Schema Specification
├── SIMPLEGUI_API.md   # Declarative Code-First SimpleGUI API Guide & Reference
├── README.md          # Main Documentation & User Guide
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

<a id="license"></a>

## 📄 License

MIT License © Codecaine
