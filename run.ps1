<#
.SYNOPSIS
    Bun RAD Studio - Universal Windows Runner & Launcher
.DESCRIPTION
    Easily run any application, showcase demo, or CLI utility in Bun RAD Studio on Windows.
    Auto-detects architecture (x64 / ARM64), locates Bun, verifies Edge WebView2 runtime,
    and provides both direct execution and an interactive menu.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\run.ps1                 # Opens interactive menu
    powershell -ExecutionPolicy Bypass -File .\run.ps1 calculator      # Launches Calculator Studio
    powershell -ExecutionPolicy Bypass -File .\run.ps1 23              # Launches Demo 23 Showcase
    powershell -ExecutionPolicy Bypass -File .\run.ps1 pacman          # Launches Pac-Man Arcade
    powershell -ExecutionPolicy Bypass -File .\run.ps1 -Gui            # Launches GUI Launcher Studio
    powershell -ExecutionPolicy Bypass -File .\run.ps1 -List           # Lists all apps & demos
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Target,

    [Alias('l')]
    [switch]$List,

    [Alias('i')]
    [switch]$Interactive,

    [Alias('s')]
    [string]$Search,

    [Alias('g')]
    [switch]$Gui,

    [switch]$Cli,

    [switch]$CheckOnly,

    [switch]$InstallWebView,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Set-Location $projectRoot

# -------------------------------------------------------------------------------------------------
# 1. Environment & Architecture Detection
# -------------------------------------------------------------------------------------------------

Remove-Item Env:WEBVIEW_PATH -ErrorAction SilentlyContinue

$osArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
$osDesc = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription

function Write-BrandHeader {
    Write-Host ""
    Write-Host "========================================================================" -ForegroundColor Cyan
    Write-Host "            BUN RAD STUDIO - WINDOWS WORKSTATION RUNNER                 " -ForegroundColor White
    Write-Host "========================================================================" -ForegroundColor Cyan
}

# -------------------------------------------------------------------------------------------------
# 2. Bun Runtime Detection
# -------------------------------------------------------------------------------------------------

function Get-BunX64ForArm64 {
    $userProfile = 'C:\Users\Default'
    if ($env:USERPROFILE) { $userProfile = $env:USERPROFILE }
    $localApp = Join-Path $userProfile 'AppData\Local'
    if ($env:LOCALAPPDATA) { $localApp = $env:LOCALAPPDATA }

    $targetDir = Join-Path $localApp 'bun-x64'
    $targetExe = Join-Path $targetDir 'bun-windows-x64\bun.exe'
    if (Test-Path $targetExe) { return $targetExe }

    $altExe = Join-Path $targetDir 'bun.exe'
    if (Test-Path $altExe) { return $altExe }

    if (Test-Path 'C:\Tools\bun-x64\bun-windows-x64\bun.exe') {
        return 'C:\Tools\bun-x64\bun-windows-x64\bun.exe'
    }

    Write-Host ""
    Write-Host "[!] Windows ARM64 Architecture Notice:" -ForegroundColor Yellow
    Write-Host "    The desktop webview library (libwebview.dll) is an x86_64 DLL." -ForegroundColor Gray
    Write-Host "    Native Bun ARM64 cannot dlopen an x64 DLL (Windows error 193)." -ForegroundColor Gray
    Write-Host "    Windows ARM64 runs Bun x64 smoothly via built-in x64 emulation." -ForegroundColor Gray
    Write-Host "[+] Automatically setting up Bun x64 for Windows ARM64 (one-time setup)..." -ForegroundColor Cyan

    $tempDir = 'C:\Temp'
    if ($env:TEMP) { $tempDir = $env:TEMP }
    $zipPath = Join-Path $tempDir 'bun-windows-x64.zip'

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Write-Host "    Downloading bun-windows-x64 from GitHub releases (~25 MB)..." -ForegroundColor DarkGray
        Invoke-WebRequest -Uri 'https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip' -OutFile $zipPath -UseBasicParsing
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force
        Remove-Item $zipPath -ErrorAction SilentlyContinue

        if (Test-Path $targetExe) {
            Write-Host "[OK] Bun x64 configured at: $targetExe" -ForegroundColor Green
            return $targetExe
        }
        if (Test-Path $altExe) {
            Write-Host "[OK] Bun x64 configured at: $altExe" -ForegroundColor Green
            return $altExe
        }
    } catch {
        Write-Host "[!] Automatic download failed: $_" -ForegroundColor Red
        Write-Host "    You can manually extract bun-windows-x64.zip to $targetDir or C:\Tools\bun-x64" -ForegroundColor Yellow
    }

    return $null
}

function Find-BunRuntime {
    $isArm64 = $false
    if ($osArch) {
        if ($osArch.ToString().ToLower() -eq 'arm64') { $isArm64 = $true }
    }
    if ($env:PROCESSOR_ARCHITECTURE) {
        if ($env:PROCESSOR_ARCHITECTURE.ToLower() -eq 'arm64') { $isArm64 = $true }
    }

    $userProfile = 'C:\Users\Default'
    if ($env:USERPROFILE) {
        $userProfile = $env:USERPROFILE
    }

    $localApp = Join-Path $userProfile 'AppData\Local'
    if ($env:LOCALAPPDATA) {
        $localApp = $env:LOCALAPPDATA
    }

    # If running on ARM64, webview-bun's libwebview.dll is an x64 PE binary.
    # Native Bun ARM64 throws Error 193 (ERROR_BAD_EXE_FORMAT) trying to load it.
    # We must use Bun x64 running under Windows built-in emulation.
    if ($isArm64) {
        $x64Candidates = @(
            'C:\Tools\bun-x64\bun-windows-x64\bun.exe',
            'C:\Tools\bun-x64\bun.exe',
            (Join-Path $localApp 'bun-x64\bun-windows-x64\bun.exe'),
            (Join-Path $localApp 'bun-x64\bun.exe')
        )
        foreach ($c in $x64Candidates) {
            if ($c -and (Test-Path $c)) {
                return $c
            }
        }

        # Auto-download Bun x64 for Windows ARM64
        $armBunX64 = Get-BunX64ForArm64
        if ($armBunX64) {
            return $armBunX64
        }
    }

    # Standard candidate search for x64 or fallback
    $cmd = Get-Command bun -ErrorAction SilentlyContinue
    if ($cmd -and (Test-Path $cmd.Source)) {
        return $cmd.Source
    }

    $candidates = @(
        'C:\Tools\bun-x64\bun-windows-x64\bun.exe',
        (Join-Path $userProfile '.bun\bin\bun.exe'),
        (Join-Path $localApp 'bun\bin\bun.exe'),
        'C:\Program Files\Bun\bun.exe',
        'C:\Tools\bun-x64\bun.exe',
        'C:\Tools\bun-arm64\bun.exe',
        'C:\Users\codecaine\.bun\bin\bun.exe'
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return $null
}

$bunExe = Find-BunRuntime

if (-not $bunExe) {
    Write-BrandHeader
    Write-Host "[!] Error: Bun runtime was not found on your system." -ForegroundColor Red
    Write-Host ""
    Write-Host "To install Bun on Windows, run the following in PowerShell:" -ForegroundColor Yellow
    Write-Host "    powershell -c ""irm bun.sh/install.ps1 | iex""" -ForegroundColor Green
    Write-Host ""
    Write-Host "Or if using Winget:" -ForegroundColor DarkGray
    Write-Host "    winget install Oven-sh.Bun" -ForegroundColor DarkGray
    exit 1
}

# -------------------------------------------------------------------------------------------------
# 3. WebView2 Runtime & Loader Verification
# -------------------------------------------------------------------------------------------------

function Ensure-WebView2Loader {
    param([switch]$Force)

    $buildDir = Join-Path $projectRoot 'node_modules\webview-bun\build'
    $targetLoader = Join-Path $buildDir 'WebView2Loader.dll'

    if ((Test-Path $targetLoader) -and (-not $Force)) {
        return $true
    }

    Write-Host "[*] Locating WebView2Loader.dll for webview-bun..." -ForegroundColor Yellow

    $localApp = ''
    if ($env:LOCALAPPDATA) {
        $localApp = $env:LOCALAPPDATA
    }

    $searchRoots = [System.Collections.Generic.List[string]]::new()
    $searchRoots.Add('C:\Program Files (x86)\Microsoft\EdgeWebView\Application')
    $searchRoots.Add('C:\Program Files\Microsoft\EdgeWebView\Application')
    $searchRoots.Add('C:\Program Files (x86)\Microsoft\Edge\Application')
    $searchRoots.Add('C:\Program Files\Microsoft\Edge\Application')
    $searchRoots.Add('C:\Program Files (x86)\Microsoft\EdgeWebView')
    $searchRoots.Add('C:\Program Files\Microsoft\EdgeWebView')
    $searchRoots.Add('C:\Program Files (x86)\Microsoft\Edge')
    $searchRoots.Add('C:\Program Files\Microsoft\Edge')
    if ($localApp) {
        $searchRoots.Add((Join-Path $localApp 'Microsoft\EdgeWebView'))
    }
    $searchRoots.Add('C:\Windows\System32')
    $searchRoots.Add('C:\Windows\SysWOW64')
    $searchRoots.Add('C:\Windows\Arm64')

    $found = $null
    foreach ($root in $searchRoots) {
        if ($root -and (Test-Path $root)) {
            try {
                $hits = Get-ChildItem -Path $root -Recurse -Filter 'WebView2Loader.dll' -ErrorAction SilentlyContinue
                if ($hits -and $hits.Count -gt 0) {
                    $found = $hits[0].FullName
                    break
                }
            } catch {}
        }
    }

    if (-not $found) {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Host "[+] Installing Microsoft Edge WebView2 runtime via winget..." -ForegroundColor Cyan
            try {
                & winget install --id Microsoft.EdgeWebView2Runtime --exact --accept-source-agreements --accept-package-agreements
                foreach ($root in $searchRoots) {
                    if ($root -and (Test-Path $root)) {
                        $hits = Get-ChildItem -Path $root -Recurse -Filter 'WebView2Loader.dll' -ErrorAction SilentlyContinue
                        if ($hits -and $hits.Count -gt 0) {
                            $found = $hits[0].FullName
                            break
                        }
                    }
                }
            } catch {}
        }
    }

    if ($found) {
        try {
            if (-not (Test-Path $buildDir)) {
                New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
            }
            Copy-Item $found $targetLoader -Force
            Write-Host "[OK] WebView2Loader.dll installed to: $targetLoader" -ForegroundColor Green
            return $true
        } catch {
            Write-Host "[!] Note: Could not copy WebView2Loader.dll: $_" -ForegroundColor Yellow
            return $false
        }
    } else {
        Write-Host "[!] Warning: WebView2Loader.dll could not be automatically located." -ForegroundColor Yellow
        Write-Host "If desktop GUI windows fail to open, run: winget install Microsoft.EdgeWebView2Runtime" -ForegroundColor DarkGray
        return $false
    }
}

if ($InstallWebView) {
    Ensure-WebView2Loader -Force
    exit 0
}

# Auto-check loader existence
$hasWebView = Ensure-WebView2Loader

if ($CheckOnly) {
    Write-BrandHeader
    $bunVer = & $bunExe --version
    $webStatus = 'Missing/Warning'
    $webColor = 'Yellow'
    if ($hasWebView) {
        $webStatus = 'Ready'
        $webColor = 'Green'
    }
    Write-Host "Architecture:   $osArch ($osDesc)" -ForegroundColor Gray
    Write-Host "Bun Executable: $bunExe (v$bunVer)" -ForegroundColor Green
    Write-Host "WebView2:       $webStatus" -ForegroundColor $webColor
    exit 0
}

# -------------------------------------------------------------------------------------------------
# 4. Catalog & Metadata Definition (Pure ASCII for clean PowerShell 5.1/7 parsing)
# -------------------------------------------------------------------------------------------------

$metadataRegistry = @{
    # Applications
    'launcher_studio'      = @{ Name = 'Launcher Studio Pro'; Category = 'System Hub'; Icon = '[Hub]'; Desc = 'Unified workstation hub to launch and monitor all project apps, demos and CLI tools' }
    'calculator_studio'    = @{ Name = 'Universal Calculator and STEM Studio'; Category = 'Productivity'; Icon = '[Calc]'; Desc = 'Apple-grade calculator, unit converter, 64-bit programmer lab and STEM simulations' }
    'pacman_studio'        = @{ Name = 'Cyberpunk Pac-Man Arcade'; Category = 'Games'; Icon = '[Game]'; Desc = 'Authentic Pac-Man arcade with 4-ghost AI personalities, sound synthesis and particle effects' }
    'codecaine_bros_studio'= @{ Name = 'Codecaine Bros. Arcade'; Category = 'Games'; Icon = '[Game]'; Desc = '1983 Mario Bros. arcade remaster with platform physics, POW block and 4-channel sound' }
    'pong_studio'          = @{ Name = 'Neon Cyber Pong'; Category = 'Games'; Icon = '[Game]'; Desc = 'High-speed kinetic Pong with spin physics, multi-tier AI opponents and 2-player local battle' }
    'connect4_studio'      = @{ Name = 'Cyberpunk Connect 4'; Category = 'Games'; Icon = '[Game]'; Desc = 'Neon Connect 4 arcade with minimax AI heuristics, 2-player battle and particle drop physics' }
    'dr_codecaine_studio'  = @{ Name = 'Dr. Codecaine Arcade'; Category = 'Games'; Icon = '[Game]'; Desc = 'Remastered capsule puzzle game with polyphonic synthesizers and pathogen AI' }
    'lolo_studio'          = @{ Name = 'Adventures of Lolo Remaster'; Category = 'Games'; Icon = '[Game]'; Desc = 'Cyberpunk remastered Adventures of Lolo with procedural puzzles and sound engine' }
    'maze_generator_studio'= @{ Name = 'Cyberpunk Maze Runner'; Category = 'Games'; Icon = '[Game]'; Desc = 'Procedural neon labyrinth with Recursive Backtracking, fog of war and A* AI solver' }
    'rodents_revenge_studio'=@{ Name = 'Rodent''s Revenge Deluxe'; Category = 'Games'; Icon = '[Game]'; Desc = 'Deluxe arcade revival of Rodent''s Revenge with retro maze and cat trapping' }
    'minesweeper_studio'   = @{ Name = 'Minesweeper Pro Championship'; Category = 'Games'; Icon = '[Game]'; Desc = 'Championship Minesweeper with safe first-click, chord clearing, 3BV benchmark & multi-theme engine' }
    'breakout_studio'      = @{ Name = 'Cyber Breakout Deluxe'; Category = 'Games'; Icon = '[Game]'; Desc = 'Deluxe Breakout arcade with continuous swept physics, 8 powerups, combo synth melodies & gamepad support' }
    'skifree_studio'       = @{ Name = 'SkiFree Deluxe'; Category = 'Games'; Icon = '[Game]'; Desc = 'Authentic downhill alpine skiing with freestyle tricks, slalom gates & the ravenous Yeti chase' }
    'math_munchers_studio' = @{ Name = 'Math Munchers Deluxe'; Category = 'Games'; Icon = '[Game]'; Desc = 'Cyberpunk Math Munchers classic with Troggles AI, CRT shaders, pentatonic synth & multiple game modes' }
    'flappy_bird_studio'   = @{ Name = 'Flappy Bird Deluxe'; Category = 'Games'; Icon = '[Game]'; Desc = 'Cyberpunk kinetic Flappy Bird arcade with energy conduits, medal achievements, parallax sky & WebAudio synth' }
    'typing_studio'        = @{ Name = 'CyberType Deluxe — Mavis Edition'; Category = 'Games'; Icon = '[Game]'; Desc = 'Cyberpunk typing tutor with haptic WebAudio mechanics, live dynamic keyboard, and biometric telemetry.' }
    'tetris_studio'        = @{ Name = 'Tetris Ultra Deluxe'; Category = 'Games'; Icon = '[Game]'; Desc = 'Modern block puzzle with ghost piece, hold queue, SRS rotation, and neon synthwave theme.' }
    'snake_studio'         = @{ Name = 'Neon Snake Deluxe'; Category = 'Games'; Icon = '[Game]'; Desc = 'High-speed glowing cyber snake with looping walls and combo multipliers' }
    'frogger_studio'       = @{ Name = 'CyberFrog Deluxe'; Category = 'Games'; Icon = '[Game]'; Desc = 'Navigate a cyberpunk highway and acid river with fluid interpolation physics' }
    'tictactoe_studio'     = @{ Name = 'Neon Tic-Tac-Toe Arcade'; Category = 'Games'; Icon = '[Game]'; Desc = 'Unbeatable Minimax AI and 2-player local battle with glowing neon canvas' }
    'word_search_studio'   = @{ Name = 'Neon Word Search Labyrinth'; Category = 'Games'; Icon = '[Game]'; Desc = 'AAA cyber word search with Web Audio synthesizer and procedural dictionaries' }
    'world_time_zones_studio'=@{ Name = 'World Time Zones Studio Pro'; Category = 'Productivity'; Icon = '[App]'; Desc = 'Real-time global time zones with search, UTC offsets and clock synchronization' }
    'interval_timer_studio' =@{ Name = 'Interval Timer and Workout Suite'; Category = 'Productivity'; Icon = '[App]'; Desc = 'High-performance interval timer with Keith Baar isometric tendon training protocols' }
    'markdown_studio'      = @{ Name = 'Markdown Live Editor Studio'; Category = 'Productivity'; Icon = '[App]'; Desc = 'Real-time dual-pane WYSIWYG Markdown editor with live preview and exports' }
    'system_studio'        = @{ Name = 'System Information Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = 'Hardware intelligence and telemetry workstation covering all 10 domain areas' }
    'devtools_studio'      = @{ Name = 'DevTools and OmniTool Studio'; Category = 'Developer'; Icon = '[App]'; Desc = 'Unified developer CLI toolkit with 6 developer engines powered natively' }
    'database_studio'      = @{ Name = 'Unified Database Studio'; Category = 'Database'; Icon = '[App]'; Desc = 'Universal SQL query runner and connection dispatcher for SQLite, MySQL and Redis' }
    'sqlite_studio'        = @{ Name = 'SQLite Studio Pro'; Category = 'Database'; Icon = '[App]'; Desc = 'Enterprise embedded database workstation and query IDE with zero-latency execution' }
    'mysql_studio'         = @{ Name = 'MySQL Studio Pro'; Category = 'Database'; Icon = '[App]'; Desc = 'Enterprise MySQL database workstation, query IDE, schema visualizer & InnoDB performance suite' }
    'redis_studio'         = @{ Name = 'Redis Studio Pro'; Category = 'Database'; Icon = '[App]'; Desc = 'Real-time Redis telemetry, live key-value inspector and memory diagnostics' }
    'json_studio'          = @{ Name = 'JSON and JQ Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = 'Interactive JSON inspector, schema validator, live JQ filtering and formatter' }
    'process_studio'       = @{ Name = 'Process Monitor Studio'; Category = 'System'; Icon = '[App]'; Desc = 'Real-time process telemetry, signal dispatcher and TCP connection inspector' }
    'procs_studio'         = @{ Name = 'Procs Process Workstation'; Category = 'System'; Icon = '[App]'; Desc = 'Modern top/ps replacement with Docker container detection and tree view' }
    'watcher_studio'       = @{ Name = 'Filesystem Watcher Studio'; Category = 'Developer'; Icon = '[App]'; Desc = 'Live filesystem trigger dispatcher and task runner on file changes' }
    'watchexec_studio'     = @{ Name = 'WatchExec Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = 'Automated command execution engine reacting to directory updates' }
    'network_studio'       = @{ Name = 'Network Diagnostics Studio'; Category = 'Network'; Icon = '[App]'; Desc = 'Socket inspector, port scanner, DNS testing and HTTP benchmark client' }
    'api_studio'           = @{ Name = 'API Testing Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = 'REST and HTTP client with benchmark metrics, headers editor and response inspector' }
    'git_studio'           = @{ Name = 'Git Version Control Studio'; Category = 'Developer'; Icon = '[App]'; Desc = 'Visual diff inspector, working tree controller and commit audit trail' }
    'crypto_studio'        = @{ Name = 'Crypto and Hashing Studio Pro'; Category = 'Security'; Icon = '[App]'; Desc = 'Cryptographic hashes, cipher tools, key derivation and encoding workbench' }
    'regex_studio'         = @{ Name = 'Regular Expression Studio'; Category = 'Developer'; Icon = '[App]'; Desc = 'Live regex evaluator with syntax highlighting, capture groups and explanation' }
    'color_studio'         = @{ Name = 'Color Palette Studio Pro'; Category = 'Design'; Icon = '[App]'; Desc = 'Color token generator, WCAG contrast analyzer and palette harmonizer' }
    'env_studio'           = @{ Name = 'Environment Variable Studio'; Category = 'Developer'; Icon = '[App]'; Desc = 'Secure .env configuration manager, secret vault and encryption workbench' }
    'app_bundler_studio'   = @{ Name = 'App Bundler Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = 'Single-executable compiler and bundle packager with icons' }
    'dataconvert_studio'   = @{ Name = 'Data Convert Studio'; Category = 'Productivity'; Icon = '[App]'; Desc = 'Multi-format data converter (JSON, CSV, YAML, TOML, XML)' }
    'fd_studio'            = @{ Name = 'Fd Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = 'Ultra-fast native Bun filesystem traversal, globbing and search' }
    'sd_studio'            = @{ Name = 'Stream Editor Studio (SD)'; Category = 'Developer'; Icon = '[App]'; Desc = 'Intuitive find and replace utility with regex and dry-run diff preview' }
    'rip_studio'           = @{ Name = 'Rip Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = 'Safe file quarantine, seance recovery and graveyard deletion workbench' }
    'tokei_studio'         = @{ Name = 'Tokei Code Statistics Studio'; Category = 'Developer'; Icon = '[App]'; Desc = 'Lines of code counter, comment-to-code ratio and language breakdown' }
    'gdu_studio'           = @{ Name = 'Disk Usage Analyzer Studio'; Category = 'System'; Icon = '[App]'; Desc = 'Interactive terminal-grade visual disk usage explorer' }
    'ipinfo_studio'        = @{ Name = 'IP Geolocation Studio'; Category = 'Network'; Icon = '[App]'; Desc = 'Public IP resolver, ASN lookup, geo-coordinates and WHOIS inspector' }
    'doggo_studio'         = @{ Name = 'DNS Query Studio (Doggo)'; Category = 'Network'; Icon = '[App]'; Desc = 'Modern DNS lookup client with DoH, DoT, trace recursion and record browser' }
    'subfinder_studio'     = @{ Name = 'Subdomain Finder Studio'; Category = 'Security'; Icon = '[App]'; Desc = 'Passive DNS and Certificate Transparency subdomain discovery engine' }
    'rad_studio'           = @{ Name = 'RAD Utilities Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = '44 high-velocity development modules for Rapid Application Development' }
    'jq_studio'            = @{ Name = 'JQ JSON Query Studio'; Category = 'Developer'; Icon = '[App]'; Desc = 'Interactive JSON query and transformation workstation powered by native JQ filters' }
    'omnitool_studio'      = @{ Name = 'OmniTool Studio Pro'; Category = 'Developer'; Icon = '[App]'; Desc = 'Swiss-army knife for encoding, decoding, hash generation and text processing' }
    'task_manager'         = @{ Name = 'Task Manager & Process Studio'; Category = 'System'; Icon = '[App]'; Desc = 'Live CPU/Memory monitor, process tree visualizer and port listener' }
    'brew_studio'          = @{ Name = 'Homebrew Package Studio'; Category = 'System'; Icon = '[App]'; Desc = 'Package dependency manager and Bun ecosystem workstation' }

    # Demos
    '01_standard_controls'                 = @{ Name = 'Standard UI Controls Showcase'; Category = 'UI Controls'; Icon = '[Demo]'; Desc = 'Core buttons, inputs, checkboxes, radios, sliders and progress bars' }
    '02_advanced_modern_controls'          = @{ Name = 'Advanced Modern Desktop Controls'; Category = 'UI Controls'; Icon = '[Demo]'; Desc = 'Color pickers, toggles, badges, tags, breadcrumbs and accordions' }
    '03_data_and_non_visual'               = @{ Name = 'Data Grids and Non-Visual Components'; Category = 'Data and Storage'; Icon = '[Demo]'; Desc = 'Data tables, sorting, filtering, notifications and tray icons' }
    '04_window_placement_and_pin'          = @{ Name = 'Window Placement and Pinning Workbench'; Category = 'Window Management'; Icon = '[Demo]'; Desc = 'Monitor detection, positioning presets, always-on-top pinning' }
    '05_crud_todo_table'                   = @{ Name = 'CRUD Task Table and State Management'; Category = 'Productivity'; Icon = '[Demo]'; Desc = 'Full CRUD task manager with real-time reactive state updates' }
    '06_timer_control_studio'              = @{ Name = 'Timer and Asynchronous Workflows'; Category = 'Async and Timers'; Icon = '[Demo]'; Desc = 'Interval timers, debouncing, animations and countdown triggers' }
    '07_labeled_form_and_desktop_controls' = @{ Name = 'Compound Form Field Builders'; Category = 'Forms'; Icon = '[Demo]'; Desc = 'Auto-labeled inputs, field validation, hints and structured layout' }
    '08_analytics_dashboard_template'      = @{ Name = 'Analytics and KPI Dashboard Template'; Category = 'Templates'; Icon = '[Demo]'; Desc = 'Executive KPI tiles, real-time charts, metric cards and dark theme' }
    '09_file_explorer_ide_template'        = @{ Name = 'File Explorer and Mini IDE Template'; Category = 'Templates'; Icon = '[Demo]'; Desc = 'Project file tree navigator, dual-pane editor and tab strip' }
    '10_db_studio_query_editor_template'   = @{ Name = 'DB Query Editor and Schema Viewer'; Category = 'Templates'; Icon = '[Demo]'; Desc = 'Interactive SQL query editor with data grid result inspector' }
    '11_app_settings_preferences_template' = @{ Name = 'App Preferences and Settings Modal'; Category = 'Templates'; Icon = '[Demo]'; Desc = 'Tabbed settings dialog with instant preview and persistence' }
    '12_advanced_desktop_app_controls'     = @{ Name = 'Advanced Desktop Application Controls'; Category = 'UI Controls'; Icon = '[Demo]'; Desc = 'Splitters, tree views, collapsible sidebars, multi-view panes' }
    '13_productivity_controls_studio'      = @{ Name = 'Modern Productivity UI Controls'; Category = 'Productivity'; Icon = '[Demo]'; Desc = 'Kanban board cards, drag-and-drop slots, rich tab navigation' }
    '14_simplegui_fluent_form_demo'        = @{ Name = 'SimpleGUI Fluent Form Builder'; Category = 'SimpleGUI'; Icon = '[Demo]'; Desc = 'Zero-boilerplate fluent API form with automated reactive wiring' }
    '15_simplegui_all_controls_showcase'   = @{ Name = 'All SimpleGUI Controls Complete Showcase'; Category = 'SimpleGUI'; Icon = '[Demo]'; Desc = 'Every SimpleGUI control operating concurrently in single window' }
    '16_simplegui_parity_api_demo'         = @{ Name = 'SimpleGUI Parity API Demo'; Category = 'SimpleGUI'; Icon = '[Demo]'; Desc = 'Cross-platform API parity test suite and component verification' }
    '17_simplegui_layout_types_showcase'   = @{ Name = 'Layout Systems (Stack/Row/Grid/Card)'; Category = 'Layouts'; Icon = '[Demo]'; Desc = 'Responsive layout primitives, auto-wrapping flex and card decks' }
    '18_simplegui_ergonomics_demo'         = @{ Name = 'Zero-Boilerplate Ergonomics Demo'; Category = 'Ergonomics'; Icon = '[Demo]'; Desc = 'Ultra-clean ergonomic syntax requiring < 20 lines of code' }
    '19_state_persistence_and_binding_demo'= @{ Name = 'State Persistence and Reactive Binding'; Category = 'Data and State'; Icon = '[Demo]'; Desc = 'Automatic local storage persistence and two-way state binding' }
    '20_codefreelance_theme_demo'          = @{ Name = 'CodeFreelance Theme Showcase'; Category = 'Themes'; Icon = '[Demo]'; Desc = 'High-contrast cyberpunk hacker aesthetic with glowing accents' }
    '21_vlang_parity_controls_showcase'    = @{ Name = 'V-Lang GUI Parity Controls Showcase'; Category = 'Parity'; Icon = '[Demo]'; Desc = 'Pixel-perfect replication of V-Lang desktop UI components' }
    '22_context_menu_and_menu_demo'        = @{ Name = 'Native Menus and Context Menu Actions'; Category = 'Menus'; Icon = '[Demo]'; Desc = 'Right-click context menus, menu bars and accelerator shortcuts' }
    '23_all_themes_all_controls_showcase'  = @{ Name = 'Universal 42 Themes Showcase'; Category = 'Themes'; Icon = '[Demo]'; Desc = 'Master showcase of all 42 bespoke desktop themes and controls' }
    '24_extended_controls_showcase'        = @{ Name = 'Extended Controls Showcase'; Category = 'UI Controls'; Icon = '[Demo]'; Desc = 'Rich widgets, dial gauges, rating stars, timeline and stepper' }
    '25_vlang_all_themes_showcase'         = @{ Name = 'V-Lang All Themes Showcase'; Category = 'Themes'; Icon = '[Demo]'; Desc = 'Comprehensive theme engine applied to V-Lang parity controls' }
    '26_modal_and_non_modal_dialogs_demo'  = @{ Name = 'Modal & Non-Modal Dialogs Showcase'; Category = 'UI Controls'; Icon = '[Demo]'; Desc = 'Declarative modal dialogs, non-modal tool windows, drawer panels and backdrops' }
    '27_enterprise_components_demo'        = @{ Name = 'Enterprise Components Showcase'; Category = 'Enterprise'; Icon = '[Demo]'; Desc = 'AppBar, navigation drawer, autocomplete, tree view, stepper and metrics' }

    # CLI tools
    'launcher_cli'                         = @{ Name = 'Launcher CLI'; Category = 'CLI Tools'; Icon = '[CLI]'; Desc = 'Terminal companion to search, inspect and launch project apps' }
}

# -------------------------------------------------------------------------------------------------
# 5. Catalog Building (Dynamic Auto-Discovery)
# -------------------------------------------------------------------------------------------------

function Get-AppCatalog {
    $catalog = [System.Collections.Generic.List[PSCustomObject]]::new()

    # 1. Demos
    $demoFiles = Get-ChildItem -Path (Join-Path $projectRoot 'demos') -Filter '*.ts' -ErrorAction SilentlyContinue | Sort-Object Name
    foreach ($file in $demoFiles) {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
        $meta = $metadataRegistry[$base]
        $num = ""
        if ($base -match '^(\d+)') {
            $num = $matches[1]
        }

        $dispName = $file.Name
        $category = 'Showcase'
        $icon = '[Demo]'
        $desc = "Showcase Demo $base"
        if ($meta) {
            if ($meta.Name) { $dispName = $meta.Name }
            if ($meta.Category) { $category = $meta.Category }
            if ($meta.Icon) { $icon = $meta.Icon }
            if ($meta.Desc) { $desc = $meta.Desc }
        }

        $catalog.Add([PSCustomObject]@{
            Id          = $base
            Number      = $num
            Type        = 'Demo'
            TypeSort    = 1
            DisplayName = $dispName
            Category    = $category
            Icon        = $icon
            Description = $desc
            RelativePath= "demos/$($file.Name)"
            FullPath    = $file.FullName
        })
    }

    # 2. Studio Applications
    $appFiles = Get-ChildItem -Path (Join-Path $projectRoot 'applications') -Filter '*.ts' -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -notmatch '_server\.ts$' -and
            $_.Name -notmatch '_crud\.ts$' -and
            $_.Name -notmatch '_engine\.ts$' -and
            $_.Name -notmatch '_extras\.ts$' -and
            $_.Name -notmatch '_ops\.ts$'
        } |
        Sort-Object Name

    foreach ($file in $appFiles) {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
        $meta = $metadataRegistry[$base]

        $dispName = $file.Name
        $category = 'Studio App'
        $icon = '[App]'
        $desc = "RAD Studio Application"
        if ($meta) {
            if ($meta.Name) { $dispName = $meta.Name }
            if ($meta.Category) { $category = $meta.Category }
            if ($meta.Icon) { $icon = $meta.Icon }
            if ($meta.Desc) { $desc = $meta.Desc }
        }

        $catalog.Add([PSCustomObject]@{
            Id          = $base
            Number      = ""
            Type        = 'Application'
            TypeSort    = 2
            DisplayName = $dispName
            Category    = $category
            Icon        = $icon
            Description = $desc
            RelativePath= "applications/$($file.Name)"
            FullPath    = $file.FullName
        })
    }

    # 3. CLI Tools
    $cliFiles = Get-ChildItem -Path (Join-Path $projectRoot 'cli_apps') -Filter '*.ts' -ErrorAction SilentlyContinue | Sort-Object Name
    foreach ($file in $cliFiles) {
        $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
        $meta = $metadataRegistry[$base]

        $dispName = $file.Name
        $category = 'CLI Tool'
        $icon = '[CLI]'
        $desc = "CLI Utility"
        if ($meta) {
            if ($meta.Name) { $dispName = $meta.Name }
            if ($meta.Category) { $category = $meta.Category }
            if ($meta.Icon) { $icon = $meta.Icon }
            if ($meta.Desc) { $desc = $meta.Desc }
        }

        $catalog.Add([PSCustomObject]@{
            Id          = $base
            Number      = ""
            Type        = 'CLI'
            TypeSort    = 3
            DisplayName = $dispName
            Category    = $category
            Icon        = $icon
            Description = $desc
            RelativePath= "cli_apps/$($file.Name)"
            FullPath    = $file.FullName
        })
    }

    return $catalog
}

$allCatalog = Get-AppCatalog

# -------------------------------------------------------------------------------------------------
# 6. Target Matching & Resolution
# -------------------------------------------------------------------------------------------------

function Resolve-CatalogItem {
    param([string]$Query)

    $clean = $Query.Trim().ToLower()
    if (-not $clean) { return $null }

    # Clean prefixes like "demo:", "app:", "cli:"
    if ($clean -match '^(demo|app|cli):(.+)$') {
        $clean = $matches[2]
    }

    # Exact file path match
    $exactPath = $allCatalog | Where-Object { $_.RelativePath.ToLower() -eq $clean -or $_.FullPath.ToLower() -eq $clean }
    if ($exactPath) { return $exactPath[0] }

    # Direct ID match
    $exactId = $allCatalog | Where-Object { $_.Id.ToLower() -eq $clean }
    if ($exactId) { return $exactId[0] }

    # Demo number match (e.g. "23", "5", "05", "1")
    if ($clean -match '^\d+$') {
        $cleanNum = [int]$clean
        $demoMatch = $allCatalog | Where-Object {
            $_.Type -eq 'Demo' -and [int]$_.Number -eq $cleanNum
        }
        if ($demoMatch) { return $demoMatch[0] }
    }

    # Common friendly aliases
    $aliasMap = @{
        'calculator'    = 'calculator_studio'
        'calc'          = 'calculator_studio'
        'stem'          = 'calculator_studio'
        'launcher'      = 'launcher_studio'
        'gui'           = 'launcher_studio'
        'hub'           = 'launcher_studio'
        'pacman'        = 'pacman_studio'
        'mario'         = 'codecaine_bros_studio'
        'codecaine_bros'= 'codecaine_bros_studio'
        'bros'          = 'codecaine_bros_studio'
        'pong'          = 'pong_studio'
        'connect4'      = 'connect4_studio'
        'dr_codecaine'  = 'dr_codecaine_studio'
        'drcodecaine'   = 'dr_codecaine_studio'
        'lolo'          = 'lolo_studio'
        'maze'          = 'maze_generator_studio'
        'rodent'        = 'rodents_revenge_studio'
        'rodents'       = 'rodents_revenge_studio'
        'minesweeper'   = 'minesweeper_studio'
        'mines'         = 'minesweeper_studio'
        'breakout'      = 'breakout_studio'
        'arkanoid'      = 'breakout_studio'
        'skifree'       = 'skifree_studio'
        'ski'           = 'skifree_studio'
        'math_munchers' = 'math_munchers_studio'
        'munchers'      = 'math_munchers_studio'
        'munch'         = 'math_munchers_studio'
        'flappy'        = 'flappy_bird_studio'
        'flappybird'    = 'flappy_bird_studio'
        'bird'          = 'flappy_bird_studio'
        'typing'        = 'typing_studio'
        'type'          = 'typing_studio'
        'mavis'         = 'typing_studio'
        'tetris'        = 'tetris_studio'
        'snake'         = 'snake_studio'
        'frogger'       = 'frogger_studio'
        'tictactoe'     = 'tictactoe_studio'
        'wordsearch'    = 'word_search_studio'
        'word_search'   = 'word_search_studio'
        'timezone'      = 'world_time_zones_studio'
        'timezones'     = 'world_time_zones_studio'
        'time'          = 'world_time_zones_studio'
        'timer'         = 'interval_timer_studio'
        'interval'      = 'interval_timer_studio'
        'markdown'      = 'markdown_studio'
        'md'            = 'markdown_studio'
        'system'        = 'system_studio'
        'sys'           = 'system_studio'
        'devtools'      = 'devtools_studio'
        'omnitool'      = 'omnitool_studio'
        'omni'          = 'omnitool_studio'
        'omnitool_studio'= 'omnitool_studio'
        'database'      = 'database_studio'
        'db'            = 'database_studio'
        'sqlite'        = 'sqlite_studio'
        'sqlite_studio' = 'sqlite_studio'
        'mysql'         = 'mysql_studio'
        'mysql_studio'  = 'mysql_studio'
        'redis'         = 'redis_studio'
        'redis_studio'  = 'redis_studio'
        'json'          = 'json_studio'
        'jq'            = 'json_studio'
        'jq_studio'     = 'jq_studio'
        'process'       = 'process_studio'
        'processes'     = 'process_studio'
        'task'          = 'process_studio'
        'taskmanager'   = 'task_manager'
        'task_manager'  = 'task_manager'
        'tm'            = 'task_manager'
        'procs'         = 'procs_studio'
        'brew'          = 'brew_studio'
        'brew_studio'   = 'brew_studio'
        'homebrew'      = 'brew_studio'
        'watcher'       = 'watcher_studio'
        'watchexec'     = 'watchexec_studio'
        'network'       = 'network_studio'
        'net'           = 'network_studio'
        'api'           = 'api_studio'
        'git'           = 'git_studio'
        'crypto'        = 'crypto_studio'
        'regex'         = 'regex_studio'
        'color'         = 'color_studio'
        'colors'        = 'color_studio'
        'env'           = 'env_studio'
        'bundler'       = 'app_bundler_studio'
        'convert'       = 'dataconvert_studio'
        'dataconvert'   = 'dataconvert_studio'
        'fd'            = 'fd_studio'
        'find'          = 'fd_studio'
        'sd'            = 'sd_studio'
        'rip'           = 'rip_studio'
        'tokei'         = 'tokei_studio'
        'gdu'           = 'gdu_studio'
        'disk'          = 'gdu_studio'
        'ipinfo'        = 'ipinfo_studio'
        'ip'            = 'ipinfo_studio'
        'doggo'         = 'doggo_studio'
        'dns'           = 'doggo_studio'
        'subfinder'     = 'subfinder_studio'
        'rad'           = 'rad_studio'
        'themes'        = '23_all_themes_all_controls_showcase'
        'theme'         = '23_all_themes_all_controls_showcase'
        'crud'          = '05_crud_todo_table'
        'todo'          = '05_crud_todo_table'
        'table'         = '05_crud_todo_table'
        'ide'           = '09_file_explorer_ide_template'
        'explorer'      = '09_file_explorer_ide_template'
        'dashboard'     = '08_analytics_dashboard_template'
        'analytics'     = '08_analytics_dashboard_template'
        'settings'      = '11_app_settings_preferences_template'
        'preferences'   = '11_app_settings_preferences_template'
        'standard'      = '01_standard_controls'
        'dialog'        = '26_modal_and_non_modal_dialogs_demo'
        'dialogs'       = '26_modal_and_non_modal_dialogs_demo'
        'modal'         = '26_modal_and_non_modal_dialogs_demo'
        'enterprise'    = '27_enterprise_components_demo'
        'modern'        = '02_advanced_modern_controls'
        'data'          = '03_data_and_non_visual'
        'window'        = '04_window_placement_and_pin'
        'pin'           = '04_window_placement_and_pin'
        'simplegui'     = '15_simplegui_all_controls_showcase'
        'vlang'         = '21_vlang_parity_controls_showcase'
        'menu'          = '22_context_menu_and_menu_demo'
    }

    if ($aliasMap.ContainsKey($clean)) {
        $targetId = $aliasMap[$clean]
        $match = $allCatalog | Where-Object { $_.Id -eq $targetId }
        if ($match) { return $match[0] }
    }

    # Partial / fuzzy contains match
    $matchesList = $allCatalog | Where-Object {
        $_.Id.ToLower().Contains($clean) -or
        $_.DisplayName.ToLower().Contains($clean) -or
        $_.RelativePath.ToLower().Contains($clean)
    }

    if ($matchesList.Count -eq 1) {
        return $matchesList[0]
    } elseif ($matchesList.Count -gt 1) {
        $starts = $matchesList | Where-Object { $_.Id.ToLower().StartsWith($clean) }
        if ($starts.Count -eq 1) { return $starts[0] }
        return $matchesList
    }

    return $null
}

# -------------------------------------------------------------------------------------------------
# 7. Runner Function
# -------------------------------------------------------------------------------------------------

function Launch-Item {
    param([PSCustomObject]$Item, [string[]]$Arguments)

    if (-not $Item) { return }

    Write-Host ""
    Write-Host "==> Launching $($Item.Icon) $($Item.DisplayName) ($($Item.Type))..." -ForegroundColor Cyan
    Write-Host "    Path: .\$($Item.RelativePath)" -ForegroundColor DarkGray
    Write-Host "    Bun:  $bunExe" -ForegroundColor DarkGray
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan

    $targetFile = Join-Path $projectRoot $Item.RelativePath

    if (-not (Test-Path $targetFile)) {
        Write-Host "[!] Target script not found: $targetFile" -ForegroundColor Red
        return
    }

    if ($Arguments -and $Arguments.Count -gt 0) {
        & $bunExe run $targetFile @Arguments
    } else {
        & $bunExe run $targetFile
    }
}

# -------------------------------------------------------------------------------------------------
# 8. Listing & Searching Displays
# -------------------------------------------------------------------------------------------------

function Show-CatalogList {
    param([string]$Filter, [string]$TypeFilter)

    Write-BrandHeader
    $items = $allCatalog
    if ($TypeFilter) {
        $items = $items | Where-Object { $_.Type -eq $TypeFilter }
    }
    if ($Filter) {
        $q = $Filter.ToLower()
        $items = $items | Where-Object {
            $_.Id.ToLower().Contains($q) -or
            $_.DisplayName.ToLower().Contains($q) -or
            $_.Category.ToLower().Contains($q) -or
            $_.Description.ToLower().Contains($q)
        }
        Write-Host "[?] Showing results matching '$Filter' ($($items.Count) found):" -ForegroundColor Yellow
    } else {
        if ($TypeFilter) {
            Write-Host "[-] Bun RAD Studio $($TypeFilter)s ($($items.Count) items):" -ForegroundColor Green
        } else {
            Write-Host "[-] Complete Bun RAD Studio Workspace Catalog ($($items.Count) items):" -ForegroundColor Green
        }
    }
    Write-Host ""

    # Demos
    $demos = $items | Where-Object { $_.Type -eq 'Demo' }
    if ($demos) {
        Write-Host "[*] SHOWCASE DEMOS (Run with: .\run.ps1 <number> or .\run.ps1 <name>)" -ForegroundColor Cyan
        Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan
        foreach ($d in $demos) {
            $numPad = $d.Number.PadLeft(2, ' ')
            Write-Host "  [$numPad] $($d.DisplayName.PadRight(44)) " -NoNewline -ForegroundColor White
            Write-Host "($($d.Category))" -ForegroundColor Gray
            Write-Host "       |-- $($d.Description)" -ForegroundColor DarkGray
        }
        Write-Host ""
    }

    # Applications
    $apps = $items | Where-Object { $_.Type -eq 'Application' }
    if ($apps) {
        Write-Host "[*] STUDIO APPLICATIONS (Run with: .\run.ps1 <name>)" -ForegroundColor Magenta
        Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkMagenta
        foreach ($a in $apps) {
            Write-Host "  $($a.DisplayName.PadRight(44)) " -NoNewline -ForegroundColor White
            Write-Host "Key: $($a.Id.PadRight(24)) " -NoNewline -ForegroundColor Yellow
            Write-Host "[$($a.Category)]" -ForegroundColor Gray
            Write-Host "     |-- $($a.Description)" -ForegroundColor DarkGray
        }
        Write-Host ""
    }

    # CLI Tools
    $clis = $items | Where-Object { $_.Type -eq 'CLI' }
    if ($clis) {
        Write-Host "[*] CLI UTILITIES (Run with: .\run.ps1 cli:<name> or .\run.ps1 <name>)" -ForegroundColor Green
        Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkGreen
        foreach ($c in $clis) {
            Write-Host "  $($c.DisplayName.PadRight(35)) " -NoNewline -ForegroundColor White
            Write-Host "Key: $($c.Id.PadRight(25)) " -NoNewline -ForegroundColor Yellow
            Write-Host "[$($c.Category)]" -ForegroundColor Gray
        }
        Write-Host ""
    }
}

# -------------------------------------------------------------------------------------------------
# 9. Interactive Navigation Menus
# -------------------------------------------------------------------------------------------------

function Show-InteractiveMenu {
    while ($true) {
        Clear-Host
        Write-BrandHeader
        $bunVer = & $bunExe --version
        $webStatus = 'Warning: Loader Missing'
        $webColor = 'Yellow'
        if ($hasWebView) {
            $webStatus = 'Ready'
            $webColor = 'Green'
        }
        Write-Host "  Architecture: $osArch ($osDesc)" -ForegroundColor Gray
        Write-Host "  Bun Runtime:  $bunExe (v$bunVer)" -ForegroundColor Green
        Write-Host "  WebView2:     $webStatus" -ForegroundColor $webColor
        Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan
        Write-Host "  [1] Open Launcher Studio Pro (Full Desktop GUI Hub)" -ForegroundColor Yellow
        Write-Host "  [2] Showcase Demos (01 - 27: Controls, Themes, Dialogs, Enterprise)" -ForegroundColor Cyan
        Write-Host "  [3] Arcade and Games (Pacman, Mario Bros, Pong, Connect 4...)" -ForegroundColor Red
        Write-Host "  [4] Developer and System Studios (DevTools, Process, SQLite, MySQL...)" -ForegroundColor Green
        Write-Host "  [5] Productivity and Math (Universal Calculator, Markdown...)" -ForegroundColor Magenta
        Write-Host "  [6] CLI Tools and Utilities (Launcher CLI, DevTools CLI...)" -ForegroundColor Blue
        Write-Host "  [7] Search All Apps and Demos by keyword" -ForegroundColor White
        Write-Host "  [8] List All Available Items" -ForegroundColor Gray
        Write-Host "  [0] Exit" -ForegroundColor DarkGray
        Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan
        Write-Host " Tip: You can also directly type an app name or demo number (e.g. '23' or 'pacman')!" -ForegroundColor DarkYellow
        Write-Host ""

        $choice = Read-Host "Select option, app name, or demo number"
        $choice = $choice.Trim()

        if ($choice -eq '0' -or $choice -eq 'q' -or $choice -eq 'exit') {
            Write-Host "Goodbye!" -ForegroundColor Cyan
            break
        }

        if ($choice -eq '1') {
            $target = $allCatalog | Where-Object { $_.Id -eq 'launcher_studio' }
            Launch-Item $target
            break
        } elseif ($choice -eq '2') {
            Show-DemosMenu
        } elseif ($choice -eq '3') {
            Show-FilteredMenu -CategoryFilter 'Games' -Title '[*] ARCADE AND GAMES'
        } elseif ($choice -eq '4') {
            Show-FilteredMenu -CategoryFilter 'Developer|Database|System|Security|Network' -Title '[*] DEVELOPER AND SYSTEM STUDIOS'
        } elseif ($choice -eq '5') {
            Show-FilteredMenu -CategoryFilter 'Productivity|Design' -Title '[*] PRODUCTIVITY AND MATH STUDIOS'
        } elseif ($choice -eq '6') {
            Show-CliMenu
        } elseif ($choice -eq '7') {
            $q = Read-Host "Enter search query"
            if ($q) {
                Show-CatalogList -Filter $q
                $sub = Read-Host "Enter ID or number to launch (or press Enter to return)"
                if ($sub) {
                    $item = Resolve-CatalogItem $sub
                    if ($item -is [array]) {
                        Write-Host "Multiple matches found. Launching first: $($item[0].DisplayName)" -ForegroundColor Yellow
                        Launch-Item $item[0]
                        break
                    } elseif ($item) {
                        Launch-Item $item
                        break
                    }
                }
            }
        } elseif ($choice -eq '8') {
            Show-CatalogList
            Read-Host "Press Enter to return to main menu"
        } else {
            $item = Resolve-CatalogItem $choice
            if ($item -is [array]) {
                Write-Host ""
                Write-Host "Multiple items matched '$choice':" -ForegroundColor Yellow
                for ($i = 0; $i -lt $item.Count; $i++) {
                    Write-Host "  [$($i+1)] $($item[$i].DisplayName) ($($item[$i].RelativePath))"
                }
                $pick = Read-Host "Pick number (1-$($item.Count)) or Enter to cancel"
                if ($pick -match '^\d+$' -and [int]$pick -ge 1 -and [int]$pick -le $item.Count) {
                    Launch-Item $item[[int]$pick - 1]
                    break
                }
            } elseif ($item) {
                Launch-Item $item
                break
            } else {
                Write-Host "[!] Unrecognized option or target: '$choice'" -ForegroundColor Red
                Start-Sleep -Milliseconds 1200
            }
        }
    }
}

function Show-DemosMenu {
    Clear-Host
    Write-BrandHeader
    Write-Host "[*] SHOWCASE DEMOS (01 - 25)" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan
    $demos = $allCatalog | Where-Object { $_.Type -eq 'Demo' }
    foreach ($d in $demos) {
        $numPad = $d.Number.PadLeft(2, ' ')
        Write-Host "  [$numPad] $($d.DisplayName)" -ForegroundColor White
    }
    Write-Host "  [ 0] Back to Main Menu" -ForegroundColor DarkGray
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan

    $sub = Read-Host "Enter Demo number to launch (e.g. 23)"
    if ($sub -and $sub -ne '0') {
        $target = Resolve-CatalogItem $sub
        if ($target) {
            Launch-Item $target
            exit 0
        }
    }
}

function Show-FilteredMenu {
    param([string]$CategoryFilter, [string]$Title)
    Clear-Host
    Write-BrandHeader
    Write-Host "$Title" -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan

    $apps = $allCatalog | Where-Object {
        $_.Type -eq 'Application' -and ($_.Category -match $CategoryFilter)
    }

    for ($i = 0; $i -lt $apps.Count; $i++) {
        $num = ($i + 1).ToString().PadLeft(2, ' ')
        $a = $apps[$i]
        Write-Host "  [$num] $($a.DisplayName.PadRight(38))" -NoNewline -ForegroundColor White
        Write-Host "($($a.Id))" -ForegroundColor Gray
    }
    Write-Host "  [ 0] Back to Main Menu" -ForegroundColor DarkGray
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan

    $sub = Read-Host "Enter number or app key to launch"
    if ($sub -and $sub -ne '0') {
        if ($sub -match '^\d+$' -and [int]$sub -ge 1 -and [int]$sub -le $apps.Count) {
            Launch-Item $apps[[int]$sub - 1]
            exit 0
        } else {
            $target = Resolve-CatalogItem $sub
            if ($target) {
                Launch-Item $target
                exit 0
            }
        }
    }
}

function Show-CliMenu {
    Clear-Host
    Write-BrandHeader
    Write-Host "[*] CLI TOOLS AND UTILITIES" -ForegroundColor Blue
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan

    $clis = $allCatalog | Where-Object { $_.Type -eq 'CLI' }

    for ($i = 0; $i -lt [Math]::Min(30, $clis.Count); $i++) {
        $num = ($i + 1).ToString().PadLeft(2, ' ')
        $c = $clis[$i]
        Write-Host "  [$num] $($c.DisplayName.PadRight(30)) " -NoNewline -ForegroundColor White
        Write-Host "($($c.Id))" -ForegroundColor Gray
    }
    if ($clis.Count -gt 30) {
        Write-Host "  ... and $($clis.Count - 30) more CLI tools (use .\run.ps1 -List to see all)" -ForegroundColor DarkGray
    }
    Write-Host "  [ 0] Back to Main Menu" -ForegroundColor DarkGray
    Write-Host "------------------------------------------------------------------------" -ForegroundColor DarkCyan

    $sub = Read-Host "Enter number or CLI name to launch"
    if ($sub -and $sub -ne '0') {
        if ($sub -match '^\d+$' -and [int]$sub -ge 1 -and [int]$sub -le [Math]::Min(30, $clis.Count)) {
            Launch-Item $clis[[int]$sub - 1]
            exit 0
        } else {
            $target = Resolve-CatalogItem $sub
            if ($target) {
                Launch-Item $target
                exit 0
            }
        }
    }
}

# -------------------------------------------------------------------------------------------------
# 10. Execution Dispatcher
# -------------------------------------------------------------------------------------------------

# Explicit GUI launcher flag
if ($Gui) {
    $target = $allCatalog | Where-Object { $_.Id -eq 'launcher_studio' }
    Launch-Item $target $ExtraArgs
    exit 0
}

# Explicit CLI launcher flag
if ($Cli) {
    $target = $allCatalog | Where-Object { $_.Id -eq 'launcher_cli' }
    Launch-Item $target $ExtraArgs
    exit 0
}

# List catalog flag
if ($List) {
    Show-CatalogList
    exit 0
}

# Search flag
if ($Search) {
    Show-CatalogList -Filter $Search
    exit 0
}

# Direct list commands like "app list", "apps", "list", "ls", "demos list", "demos"
if ($Target -in @('list', 'ls', 'all')) {
    Show-CatalogList
    exit 0
}

if ($Target -in @('app', 'apps')) {
    if ($ExtraArgs -contains 'list' -or -not $ExtraArgs -or $Target -eq 'apps') {
        Show-CatalogList -TypeFilter 'Application'
        exit 0
    }
}

if ($Target -in @('demo', 'demos')) {
    if ($ExtraArgs -contains 'list' -or -not $ExtraArgs -or $Target -eq 'demos') {
        Show-CatalogList -TypeFilter 'Demo'
        exit 0
    }
}

# Direct target provided via CLI parameter
if ($Target) {
    $matched = Resolve-CatalogItem $Target

    if ($matched -is [array]) {
        Write-Host ""
        Write-Host "Multiple items matched '$Target':" -ForegroundColor Yellow
        for ($i = 0; $i -lt $matched.Count; $i++) {
            Write-Host "  [$($i+1)] $($matched[$i].DisplayName) ($($matched[$i].RelativePath))"
        }
        $pick = Read-Host "Pick a number (1-$($matched.Count))"
        if ($pick -match '^\d+$' -and [int]$pick -ge 1 -and [int]$pick -le $matched.Count) {
            Launch-Item $matched[[int]$pick - 1] $ExtraArgs
            exit 0
        } else {
            Write-Host "Launch cancelled." -ForegroundColor DarkGray
            exit 1
        }
    } elseif ($matched) {
        Launch-Item $matched $ExtraArgs
        exit 0
    } else {
        Write-Host ""
        Write-Host "[!] Target '$Target' was not recognized." -ForegroundColor Red
        Write-Host "Opening interactive browser..." -ForegroundColor Yellow
        Start-Sleep -Milliseconds 800
        Show-InteractiveMenu
        exit 0
    }
}

# Default: Interactive Mode
Show-InteractiveMenu
