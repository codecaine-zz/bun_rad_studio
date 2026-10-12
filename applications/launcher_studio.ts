/**
 * ⚡ Bun RAD Studio - Launcher Studio Pro
 * 
 * Unified Project Application & CLI Workstation Launcher
 * Automatically discovers, categorizes, monitors, and launches ALL tools in this project:
 * 1. Project Studio Applications (applications/*.ts)
 * 2. Project CLI Utilities (cli_apps/*.ts)
 * 3. Project Interactive Showcase Demos (demos/*.ts)
 * 
 * Scope: Exclusively tailored for applications and CLI tools inside this project repository.
 */

import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { writeClipboardSync } from "../src/localGuard";
import { resolve, join, basename } from "path";
import { existsSync, readdirSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import {
  parseArgs, buildShellCommand, buildWindowsCommand, windowsCmdQuote, searchScore, sortApps, sortModeFromLabel, SORT_LABELS, usageLabel, isScriptProcess,
  type SortMode,
} from "../src/launcher_tools";

// -------------------------------------------------------------------------------------------------
// Types & Interfaces
// -------------------------------------------------------------------------------------------------

export type AppSource = "rad_studio" | "cli_tool" | "rad_demo";

export interface DetectedApp {
  id: string;
  name: string;
  displayName: string;
  category: string;
  source: AppSource;
  sourceLabel: string;
  path: string;
  displayPath: string;
  icon: string;
  version: string;
  description: string;
  command: string;
  isRunning: boolean;
  pid?: number;
  instanceCount?: number;
  isFavorite: boolean;
  lastLaunched?: number;
  launchCount: number;
}

export interface LauncherKpis {
  total: number;
  radStudios: number;
  cliTools: number;
  demos: number;
  running: number;
  favorites: number;
  macApps?: number;
}

/**
 * Scans macOS system applications (Deprecated: Launcher is now strictly scoped to project tools).
 * Kept for test and caller compatibility; returns an empty array confirming external system apps are excluded.
 */
export function scanSystemApps(): DetectedApp[] {
  return [];
}

export interface HistoryData {
  favorites: string[];
  launchHistory: Record<string, { lastLaunched: number; count: number }>;
}

// -------------------------------------------------------------------------------------------------
// Known Metadata Registry for Workspace Apps
// -------------------------------------------------------------------------------------------------

const KNOWN_STUDIO_META: Record<
  string,
  { displayName: string; category: string; icon: string; description: string }
> = {
  sqlite_studio: {
    displayName: "SQLite Studio Pro",
    category: "Database & Storage",
    icon: "🗄️",
    description: "Enterprise embedded database workstation & query IDE with zero-latency execution",
  },
  mysql_studio: {
    displayName: "MySQL Studio Pro",
    category: "Database & Storage",
    icon: "🐬",
    description: "Enterprise MySQL database workstation, query IDE, schema visualizer & InnoDB performance suite",
  },
  redis_studio: {
    displayName: "Redis Studio Pro",
    category: "Database & Storage",
    icon: "⚡",
    description: "Real-time Redis telemetry, live key-value inspector & memory diagnostics",
  },
  system_studio: {
    displayName: "System Information Studio Pro",
    category: "System & Hardware",
    icon: "🖥️",
    description: "Hardware intelligence & telemetry workstation covering all 10 domain areas",
  },
  fd_studio: {
    displayName: "Fd Studio Pro",
    category: "File & Directory Tools",
    icon: "🔍",
    description: "Ultra-fast native Bun filesystem traversal, globbing & quarantine manager",
  },
  rip_studio: {
    displayName: "Rip Studio Pro",
    category: "File & Directory Tools",
    icon: "🪦",
    description: "Safe file quarantine, seance recovery & graveyard deletion workbench",
  },
  network_studio: {
    displayName: "Network Diagnostics Studio",
    category: "Network & Cloud",
    icon: "🌐",
    description: "Comprehensive socket inspector, port scanner, DNS testing & HTTP client",
  },
  api_studio: {
    displayName: "API Testing Studio Pro",
    category: "Developer Tools",
    icon: "📡",
    description: "REST & HTTP client with benchmark metrics, headers editor & response inspector",
  },
  git_studio: {
    displayName: "Git Version Control Studio",
    category: "Developer Tools",
    icon: "🌿",
    description: "Visual diff inspector, working tree controller & commit audit trail",
  },
  devtools_studio: {
    displayName: "DevTools & OmniTool Studio",
    category: "Developer Tools",
    icon: "🛠️",
    description: "Unified developer CLI toolkit with 6 developer engines powered natively",
  },
  omnitool_studio: {
    displayName: "OmniTool Studio Pro",
    category: "Developer Tools",
    icon: "🧰",
    description: "Swiss-army knife for encoding, decoding, hash generation & text processing",
  },
  rad_studio: {
    displayName: "RAD Utilities Studio Pro",
    category: "Developer Tools",
    icon: "⚡",
    description: "44 high-velocity development modules for Rapid Application Development with live recipes & testing",
  },
  task_manager: {
    displayName: "Task Manager & Process Studio",
    category: "System & Hardware",
    icon: "📊",
    description: "Live CPU/Memory monitor, process tree visualizer & port listener",
  },
  process_studio: {
    displayName: "Process Monitor Studio",
    category: "System & Hardware",
    icon: "📈",
    description: "Real-time process telemetry, signal dispatcher & TCP connection inspector",
  },
  procs_studio: {
    displayName: "Procs Process Workstation",
    category: "System & Hardware",
    icon: "⚙️",
    description: "Modern top/ps replacement with Docker container detection and tree view",
  },
  app_bundler_studio: {
    displayName: "App Bundler Studio Pro",
    category: "Developer Tools",
    icon: "📦",
    description: "Single-executable compiler & macOS .app bundle packager with icons",
  },
  markdown_studio: {
    displayName: "Markdown Live Editor Studio",
    category: "Productivity & Text",
    icon: "📝",
    description: "Real-time dual-pane WYSIWYG Markdown editor with live HTML preview & exports",
  },
  calculator_studio: {
    displayName: "Universal Calculator & IntuitionLab Studio",
    category: "Productivity & Text",
    icon: "🧮",
    description: "Apple-grade scientific calculator, unit converter, time-series charts, 64-bit programmer lab, calculus studio & IntuitionLab visual STEM simulations",
  },
  codecaine_bros_studio: {
    displayName: "Codecaine Bros. Arcade",
    category: "Games & Entertainment",
    icon: "🍄",
    description: "Authentic 1983 Mario Bros. arcade remaster with high-speed bumping physics, POW block & 4-channel sound",
  },
  connect4_studio: {
    displayName: "Cyberpunk Connect 4",
    category: "Games & Entertainment",
    icon: "🔴",
    description: "Neon Connect 4 arcade with minimax AI heuristics, 2-player local battle & particle drop physics",
  },
  dr_codecaine_studio: {
    displayName: "Dr. Codecaine Arcade",
    category: "Games & Entertainment",
    icon: "💊",
    description: "Triple-A remastered Dr. Codecaine capsule puzzle game with polyphonic synthesizers & pathogen AI",
  },
  interval_timer_studio: {
    displayName: "Interval Timer & Workout Suite",
    category: "Productivity & Text",
    icon: "⏱️",
    description: "High-performance interval timer with Keith Baar isometric tendon training protocols & audio engine",
  },
  lolo_studio: {
    displayName: "Adventures of Lolo Remaster",
    category: "Games & Entertainment",
    icon: "👾",
    description: "Cyberpunk remastered Adventures of Lolo with procedural puzzles, sound engine & visual manual",
  },
  maze_generator_studio: {
    displayName: "Cyberpunk Maze Runner",
    category: "Games & Entertainment",
    icon: "🌀",
    description: "Procedural neon labyrinth with Recursive Backtracking, Prim's, Wilson's, fog of war & A* AI solver",
  },
  pacman_studio: {
    displayName: "Cyberpunk Pac-Man Arcade",
    category: "Games & Entertainment",
    icon: "🟡",
    description: "Authentic Cyberpunk Pac-Man arcade remaster with 4-ghost AI personalities, sound synthesis & particle effects",
  },
  breakout_studio: {
    displayName: "Cyber Breakout Deluxe",
    category: "Games & Entertainment",
    icon: "🧱",
    description: "Deluxe Breakout arcade with continuous swept physics, 8 powerups, combo synth melodies & gamepad support",
  },
  skifree_studio: {
    displayName: "SkiFree Deluxe",
    category: "Games & Entertainment",
    icon: "⛷️",
    description: "Authentic downhill alpine skiing with freestyle tricks, slalom gates & the ravenous Yeti chase",
  },
  balatro_studio: {
    displayName: "Joker Royale (Balatro Deluxe)",
    category: "Games & Entertainment",
    icon: "🃏",
    description: "Roguelike poker deckbuilder with Ante & Blind runs, 30+ Jokers, 3D card tilt physics & synth audio",
  },
  rat_screw_studio: {
    displayName: "Egyptian Rat Screw Royale",
    category: "Games & Entertainment",
    icon: "🎴",
    description: "High-speed reflex card slapper with authentic Bicycle vector cards, face card challenges, customizable slap rules & multi-CPU AI",
  },
  poker_studio: {
    displayName: "Texas Hold'em & 5-Card Draw Poker Royale",
    category: "Games & Entertainment",
    icon: "♠️",
    description: "Deluxe casino poker table featuring No-Limit Texas Hold'em and 5-Card Draw, 6-max AI personalities, Bicycle cards & hand evaluation",
  },
  blackjack_studio: {
    displayName: "Blackjack Royale VIP",
    category: "Games & Entertainment",
    icon: "🪙",
    description: "High-roller multi-hand VIP casino Blackjack with 3-spot betting, Bicycle vector cards, 6-deck shoe Hi-Lo telemetry, split/double, & side bets",
  },
  yahtzee_studio: {
    displayName: "Yahtzee Royale Deluxe",
    category: "Games & Entertainment",
    icon: "🎲",
    description: "Deluxe classic Yahtzee dice board studio with 3D tactile dice, authentic Milton Bradley scorecard, +35 upper bonus, Yahtzee Jokers & AI opponent",
  },
  paint_studio: {
    displayName: "Chroma Studio Pro",
    category: "Design & Media",
    icon: "🎨",
    description: "Advanced paint & drawing workstation featuring 106+ vector coloring book graphics, multi-layer canvas, airbrush, flood fill & curated palettes",
  },
  code_studio: {
    displayName: "NovaCode Studio Pro",
    category: "Developer Tools",
    icon: "⚡",
    description: "Advanced developer-focused code editor & workstation with multi-file tabs, lexical syntax highlighting, interactive minimap, terminal runner, and split preview",
  },
  math_munchers_studio: {
    displayName: "Math Munchers Deluxe",
    category: "Games & Entertainment",
    icon: "👾",
    description: "Cyberpunk Math Munchers classic with Troggles AI, CRT shaders, pentatonic synth & multiple game modes",
  },
  flappy_bird_studio: {
    displayName: "Flappy Bird Deluxe",
    category: "Games & Entertainment",
    icon: "🐦",
    description: "Cyberpunk kinetic Flappy Bird arcade with energy conduits, medal achievements, parallax sky & WebAudio synth",
  },
  typing_studio: {
    displayName: "CyberType Deluxe",
    category: "Games & Entertainment",
    icon: "⌨️",
    description: "Cyberpunk typing tutor with haptic WebAudio mechanics, live dynamic keyboard, and biometric telemetry.",
  },
  minesweeper_studio: {
    displayName: "Minesweeper Pro Championship",
    category: "Games & Entertainment",
    icon: "💣",
    description: "Championship Minesweeper with safe first-click, chord clearing, 3BV benchmark & multi-theme engine",
  },
  pong_studio: {
    displayName: "Neon Cyber Pong",
    category: "Games & Entertainment",
    icon: "🏓",
    description: "High-speed kinetic Pong with fluid spin physics, multi-tier AI opponents & local 2-player battle",
  },
  rodents_revenge_studio: {
    displayName: "Rodent's Revenge Deluxe",
    category: "Games & Entertainment",
    icon: "🧀",
    description: "Deluxe arcade revival of Rodent's Revenge with neon retro maze, cat trapping & high scores",
  },
  tetris_studio: {
    displayName: "Tetris Ultra Deluxe",
    category: "Games & Entertainment",
    icon: "🧱",
    description: "Modern block puzzle with ghost piece, hold queue, SRS rotation, and neon synthwave theme",
  },
  snake_studio: {
    displayName: "Neon Snake Deluxe",
    category: "Games & Entertainment",
    icon: "🐍",
    description: "High-speed glowing cyber snake with looping walls and combo multipliers",
  },
  frogger_studio: {
    displayName: "CyberFrog Deluxe",
    category: "Games & Entertainment",
    icon: "🐸",
    description: "Navigate a cyberpunk highway and acid river with fluid interpolation physics",
  },
  tictactoe_studio: {
    displayName: "Neon Tic-Tac-Toe Arcade",
    category: "Games & Entertainment",
    icon: "❌",
    description: "Unbeatable Minimax AI and 2-player local versus battle with glowing neon canvas & audio synthesis",
  },
  word_search_studio: {
    displayName: "Neon Word Search Labyrinth",
    category: "Games & Entertainment",
    icon: "🔤",
    description: "AAA cyber word search with Web Audio synthesizer, neon particle visual effects & procedural dictionaries",
  },
  world_time_zones_studio: {
    displayName: "World Time Zones Studio Pro",
    category: "Productivity & Text",
    icon: "🌐",
    description: "Real-time global time zones workstation with interactive search, UTC offsets & local clock synchronization",
  },
  color_studio: {
    displayName: "Color Palette Studio Pro",
    category: "Design & UX",
    icon: "🎨",
    description: "Color token generator, WCAG contrast analyzer & palette harmonizer",
  },
  env_studio: {
    displayName: "Environment Variable Studio",
    category: "Developer Tools",
    icon: "🔐",
    description: "Secure .env configuration manager, secret vault & encryption workbench",
  },
  crypto_studio: {
    displayName: "Cryptography & Hashing Studio",
    category: "Security & Crypto",
    icon: "🔒",
    description: "SHA-256, HMAC, AES-GCM cipher workbench with password entropy testing",
  },
  dataconvert_studio: {
    displayName: "Data Format Converter Studio",
    category: "Developer Tools",
    icon: "🔄",
    description: "Instant converter between JSON, YAML, TOML, CSV, XML & TS interfaces",
  },
  regex_studio: {
    displayName: "Regex Pattern Testing Studio",
    category: "Developer Tools",
    icon: "🎯",
    description: "Interactive regex validator with match highlight, group capture & cheat-sheet",
  },
  jq_studio: {
    displayName: "JQ JSON Query Studio",
    category: "Developer Tools",
    icon: "📋",
    description: "Interactive JSON query & transformation workstation powered by native JQ filters",
  },
  json_studio: {
    displayName: "JSON Formatter & Validator",
    category: "Developer Tools",
    icon: "📄",
    description: "High-speed syntax validator, schema checker & minifier/beautifier",
  },
  gdu_studio: {
    displayName: "Disk Usage Studio (GDU)",
    category: "File & Directory Tools",
    icon: "💾",
    description: "Fast disk usage analyzer with interactive directory space allocation",
  },
  tokei_studio: {
    displayName: "Code Statistics Studio (Tokei)",
    category: "Developer Tools",
    icon: "📊",
    description: "Lines of code counter, comment-to-code ratio & language breakdown",
  },
  ipinfo_studio: {
    displayName: "IP Geolocation Studio",
    category: "Network & Cloud",
    icon: "🌍",
    description: "Public IP resolver, ASN lookup, geo-coordinates & WHOIS inspector",
  },
  doggo_studio: {
    displayName: "DNS Query Studio (Doggo)",
    category: "Network & Cloud",
    icon: "🐕",
    description: "Modern DNS lookup client with DoH, DoT, trace recursion & record browser",
  },
  subfinder_studio: {
    displayName: "Subdomain Finder Studio",
    category: "Security & Crypto",
    icon: "🕵️",
    description: "Passive DNS and Certificate Transparency subdomain discovery engine",
  },
  sd_studio: {
    displayName: "Stream Editor Studio (SD)",
    category: "Developer Tools",
    icon: "✏️",
    description: "Intuitive find & replace utility with string, regex & dry-run diff preview",
  },
  watcher_studio: {
    displayName: "Filesystem Watcher Studio",
    category: "Developer Tools",
    icon: "👀",
    description: "Live filesystem trigger dispatcher and task runner on file changes",
  },
  watchexec_studio: {
    displayName: "WatchExec Studio Pro",
    category: "Developer Tools",
    icon: "⏱️",
    description: "Automated command execution engine reacting to directory updates",
  },
  subprocess_pipe_studio: {
    displayName: "Subprocess Pipe Pro",
    category: "Developer Tools",
    icon: "🔀",
    description: "Multi-stage subprocess orchestrator, stream pipelining (stdout ➔ stdin), privilege elevation & shell master",
  },
  brew_studio: {
    displayName: "Homebrew Package Studio",
    category: "System & Hardware",
    icon: "🍺",
    description: "Package dependency manager & Bun ecosystem workstation",
  },
  database_studio: {
    displayName: "Unified Database Studio",
    category: "Database & Storage",
    icon: "🗄️",
    description: "Universal SQL query runner and connection dispatcher for SQLite & Redis",
  },
};

const KNOWN_DEMO_TITLES: Record<string, string> = {
  "01_standard_controls": "Standard UI Controls Showcase",
  "02_advanced_modern_controls": "Advanced Modern Desktop Controls",
  "03_data_and_non_visual": "Data Grids & Non-Visual Components",
  "04_window_placement_and_pin": "Window Placement & Pinning Workbench",
  "05_crud_todo_table": "CRUD Task Table & State Management",
  "06_timer_control_studio": "Timer & Asynchronous Workflows",
  "07_labeled_form_and_desktop_controls": "Compound Form Field Builders",
  "08_analytics_dashboard_template": "Analytics & KPI Dashboard Template",
  "09_file_explorer_ide_template": "File Explorer & Mini IDE Template",
  "10_db_studio_query_editor_template": "DB Query Editor & Schema Viewer",
  "11_app_settings_preferences_template": "App Preferences & Settings Modal",
  "12_advanced_desktop_app_controls": "Advanced Desktop Application Controls",
  "13_productivity_controls_studio": "Modern Productivity UI Controls (Kanban/Tabs)",
  "14_simplegui_fluent_form_demo": "SimpleGUI Fluent Form Builder",
  "15_simplegui_all_controls_showcase": "All SimpleGUI Controls Complete Showcase",
  "16_simplegui_parity_api_demo": "SimpleGUI Parity API Demo",
  "17_simplegui_layout_types_showcase": "Layout Systems (Stack/Row/Grid/Card)",
  "18_simplegui_ergonomics_demo": "Zero-Boilerplate Ergonomics Demo",
  "19_state_persistence_and_binding_demo": "State Persistence & Reactive Binding",
  "20_codefreelance_theme_demo": "CodeFreelance Theme Showcase",
  "21_vlang_parity_controls_showcase": "V-Lang GUI Parity Controls Showcase",
  "22_context_menu_and_menu_demo": "Native Menus & Context Menu Actions",
  "23_all_themes_all_controls_showcase": "Universal 42 Themes Showcase",
};

// -------------------------------------------------------------------------------------------------
// Persistence & History Management
// -------------------------------------------------------------------------------------------------

/** History lives next to the project; LAUNCHER_HISTORY_FILE overrides it (used by tests). */
function historyFile(): string {
  return process.env.LAUNCHER_HISTORY_FILE || resolve(process.cwd(), ".launcher_history.json");
}

export function loadHistory(): HistoryData {
  try {
    const file = historyFile();
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf-8"));
      // Tolerate hand-edited or older files with missing/invalid fields.
      return {
        favorites: Array.isArray(parsed?.favorites) ? parsed.favorites.filter((f: any) => typeof f === "string") : [],
        launchHistory: parsed?.launchHistory && typeof parsed.launchHistory === "object" ? parsed.launchHistory : {},
      };
    }
  } catch {}
  return { favorites: [], launchHistory: {} };
}

export function saveHistory(data: HistoryData): void {
  try {
    // Write-then-rename so a crash never leaves a truncated history file.
    const file = historyFile();
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmp, file);
  } catch {}
}

/** Forget launch counts and last-used times; favorites are kept. */
export function clearLaunchHistory(): void {
  const data = loadHistory();
  data.launchHistory = {};
  saveHistory(data);
}

export function toggleFavorite(appId: string): boolean {
  const data = loadHistory();
  const index = data.favorites.indexOf(appId);
  let isFav = false;
  if (index >= 0) {
    data.favorites.splice(index, 1);
    isFav = false;
  } else {
    data.favorites.push(appId);
    isFav = true;
  }
  saveHistory(data);
  return isFav;
}

export function recordLaunch(appId: string): void {
  const data = loadHistory();
  if (!data.launchHistory[appId]) {
    data.launchHistory[appId] = { lastLaunched: Date.now(), count: 1 };
  } else {
    data.launchHistory[appId]!.lastLaunched = Date.now();
    data.launchHistory[appId]!.count += 1;
  }
  saveHistory(data);
}

// -------------------------------------------------------------------------------------------------
// Process Telemetry & Live Status
// -------------------------------------------------------------------------------------------------

export interface RunningProcessInfo {
  pid: number;
  comm: string;
  args: string;
}

export function getRunningProcesses(): RunningProcessInfo[] {
  try {
    if (process.platform === "win32") {
      const proc = Bun.spawnSync([
        "powershell.exe",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId)`t$($_.Name)`t$($_.CommandLine)\" }",
      ]);
      if (proc.exitCode !== 0) {
        const tl = Bun.spawnSync(["tasklist.exe", "/fo", "csv", "/nh"]);
        if (tl.exitCode !== 0) return [];
        const lines = tl.stdout.toString().split("\n");
        const result: RunningProcessInfo[] = [];
        for (const line of lines) {
          const match = line.match(/^"([^"]+)","(\d+)"/);
          if (match) {
            const comm = match[1] || "";
            const pid = parseInt(match[2] || "0", 10);
            if (pid) result.push({ pid, comm, args: comm });
          }
        }
        return result;
      }
      const lines = proc.stdout.toString().split("\n");
      const result: RunningProcessInfo[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [pidStr, comm, ...rest] = trimmed.split("\t");
        const pid = parseInt(pidStr || "0", 10);
        if (!pid) continue;
        const args = rest.join("\t") || comm || "";
        result.push({ pid, comm: comm || "", args });
      }
      return result;
    }

    const proc = Bun.spawnSync(["ps", "-eo", "pid,comm,args"]);
    if (proc.exitCode !== 0) return [];
    const lines = proc.stdout.toString().split("\n");
    const result: RunningProcessInfo[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      const pid = parseInt(parts[0] || "0", 10);
      if (!pid) continue;
      const comm = parts[1] || "";
      const args = parts.slice(2).join(" ");
      result.push({ pid, comm, args });
    }
    return result;
  } catch {
    return [];
  }
}

export function isPidAlive(pid?: number): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface ActiveChildProcessInfo {
  pid: number;
  appName: string;
  startedAt: number;
}

const ACTIVE_CHILD_PROCESSES: Map<string, ActiveChildProcessInfo[]> = new Map();

export function getAliveChildren(id: string): ActiveChildProcessInfo[] {
  const list = ACTIVE_CHILD_PROCESSES.get(id);
  if (!list) return [];
  const alive = list.filter((item) => isPidAlive(item.pid));
  if (alive.length === 0) {
    ACTIVE_CHILD_PROCESSES.delete(id);
  } else if (alive.length !== list.length) {
    ACTIVE_CHILD_PROCESSES.set(id, alive);
  }
  return alive;
}

export function registerChildProcess(id: string, info: ActiveChildProcessInfo): void {
  const list = getAliveChildren(id);
  list.push(info);
  ACTIVE_CHILD_PROCESSES.set(id, list);
}

export function unregisterChildProcess(id: string, pid?: number): void {
  if (pid === undefined) {
    ACTIVE_CHILD_PROCESSES.delete(id);
    return;
  }
  const list = ACTIVE_CHILD_PROCESSES.get(id);
  if (!list) return;
  const remaining = list.filter((item) => item.pid !== pid && isPidAlive(item.pid));
  if (remaining.length === 0) {
    ACTIVE_CHILD_PROCESSES.delete(id);
  } else {
    ACTIVE_CHILD_PROCESSES.set(id, remaining);
  }
}

// -------------------------------------------------------------------------------------------------
// Application Auto-Detection Engine (Project Scoped)
// -------------------------------------------------------------------------------------------------

export function deriveAppMetadata(filePath: string): {
  name: string;
  displayName: string;
  category: string;
  icon: string;
  description: string;
  source: AppSource;
} {
  const base = basename(filePath).replace(/\.(ts|js|tsx|jsx)$/i, "");
  const lower = base.toLowerCase();

  // 1. Check known demo titles
  if (filePath.includes("/demos/") || filePath.includes("\\demos\\")) {
    const title = KNOWN_DEMO_TITLES[lower] || `Demo: ${formatHumanName(base)}`;
    return {
      name: lower,
      displayName: title,
      category: "Demos & Templates",
      icon: "🎮",
      description: `Bun RAD Studio visual showcase template (${base})`,
      source: "rad_demo",
    };
  }

  // 2. Check CLI apps
  if (filePath.includes("/cli_apps/") || filePath.includes("\\cli_apps\\")) {
    const cleanName = base.replace(/_cli$/, "");
    return {
      name: lower,
      displayName: `${formatHumanName(cleanName)} CLI`,
      category: "CLI Utilities",
      icon: "🛠️",
      description: `Command-line terminal utility for ${formatHumanName(cleanName)}`,
      source: "cli_tool",
    };
  }

  // 3. Check known studio meta
  if (KNOWN_STUDIO_META[lower]) {
    return {
      name: lower,
      ...KNOWN_STUDIO_META[lower],
      source: "rad_studio",
    };
  }

  // 4. Default Rad Studio fallback
  return {
    name: lower,
    displayName: formatHumanName(base),
    category: "RAD Studio",
    icon: "⚡",
    description: `Native Bun RAD Studio application (${base})`,
    source: "rad_studio",
  };
}

function formatHumanName(str: string): string {
  return str
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Returns a recognizable emoji icon corresponding to the tool's functional category.
 */
export function getCategoryIcon(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("database") || c.includes("storage")) return "🗄️";
  if (c.includes("developer") || c.includes("devtools")) return "🛠️";
  if (c.includes("system") || c.includes("hardware")) return "🖥️";
  if (c.includes("file") || c.includes("directory")) return "🔍";
  if (c.includes("network") || c.includes("cloud")) return "🌐";
  if (c.includes("productivity") || c.includes("text")) return "📝";
  if (c.includes("game") || c.includes("entertainment")) return "🎮";
  if (c.includes("security") || c.includes("crypto")) return "🔒";
  if (c.includes("design") && c.includes("media")) return "🎬";
  if (c.includes("design") || c.includes("ux")) return "🎨";
  if (c.includes("demo") || c.includes("template")) return "🧪";
  if (c.includes("cli")) return "💻";
  if (c.includes("rad")) return "⚡";
  return "📦";
}

/**
 * Resiliently tests whether an application's category matches the user-selected category choice,
 * supporting exact names, abbreviations, emojis, and aliases (e.g. Games, Game, Arcade, Database, DevTools).
 */
export function matchAppCategory(appCategory: string, selectedChoice: string): boolean {
  if (!selectedChoice || selectedChoice.includes("All Categories") || selectedChoice.includes("All Tools")) return true;
  const choiceLower = selectedChoice.toLowerCase();
  const appCatLower = appCategory.toLowerCase();

  // 1. Direct or substring match
  if (choiceLower.includes(appCatLower) || appCatLower.includes(choiceLower)) {
    return true;
  }

  // 2. Games & Entertainment aliases
  if (
    (choiceLower.includes("game") || choiceLower.includes("arcade")) &&
    appCatLower.includes("game")
  ) {
    return true;
  }

  // 3. Database & Storage aliases
  if (
    (choiceLower.includes("database") || choiceLower.includes("storage") || choiceLower.includes("db") || choiceLower.includes("sql")) &&
    appCatLower.includes("database")
  ) {
    return true;
  }

  // 4. Developer Tools aliases
  if (
    (choiceLower.includes("developer") || choiceLower.includes("devtools") || choiceLower.includes("dev")) &&
    appCatLower.includes("developer")
  ) {
    return true;
  }

  // 5. System & Hardware aliases
  if (
    (choiceLower.includes("system") || choiceLower.includes("hardware") || choiceLower.includes("sys")) &&
    appCatLower.includes("system")
  ) {
    return true;
  }

  // 6. File & Directory Tools aliases
  if (
    (choiceLower.includes("file") || choiceLower.includes("directory") || choiceLower.includes("dir") || choiceLower.includes("disk")) &&
    appCatLower.includes("file")
  ) {
    return true;
  }

  // 7. Network & Cloud aliases
  if (
    (choiceLower.includes("network") || choiceLower.includes("cloud") || choiceLower.includes("net")) &&
    appCatLower.includes("network")
  ) {
    return true;
  }

  // 8. Productivity & Text aliases
  if (
    (choiceLower.includes("productivity") || choiceLower.includes("text") || choiceLower.includes("prod")) &&
    appCatLower.includes("productivity")
  ) {
    return true;
  }

  // 9. Security & Crypto aliases
  if (
    (choiceLower.includes("security") || choiceLower.includes("crypto") || choiceLower.includes("sec")) &&
    appCatLower.includes("security")
  ) {
    return true;
  }

  // 10. Design & UX / Media aliases
  if (
    choiceLower.includes("design") &&
    appCatLower.includes("design")
  ) {
    return true;
  }

  // 11. Demos & Templates aliases
  if (
    (choiceLower.includes("demo") || choiceLower.includes("template")) &&
    appCatLower.includes("demo")
  ) {
    return true;
  }

  // 12. CLI Utilities aliases
  if (
    choiceLower.includes("cli") &&
    appCatLower.includes("cli")
  ) {
    return true;
  }

  // Fallback: strip leading non-alphanumeric chars (emojis, spaces) and count suffix
  const clean = choiceLower.replace(/^[^\p{L}\p{N}]+/u, "").replace(/\s*\(\d+\)\s*$/, "").trim();
  if (clean && (appCatLower.includes(clean) || clean.includes(appCatLower))) {
    return true;
  }

  return false;
}

/**
 * Scans all project applications, CLI tools, and demos
 */
export function scanWorkspaceApps(): DetectedApp[] {
  const cwd = process.cwd();
  const history = loadHistory();
  const runningProcs = getRunningProcesses();
  const apps: DetectedApp[] = [];

  // 1. Scan applications/*.ts
  const appsDir = resolve(cwd, "applications");
  if (existsSync(appsDir)) {
    try {
      const files = readdirSync(appsDir)
        .filter(
          (f) =>
            (f.endsWith(".ts") || f.endsWith(".js")) &&
            !f.endsWith(".d.ts") &&
            !f.includes("_server.") &&
            !f.includes("_crud.") &&
            !f.includes("_engine.") &&
            !f.includes("_ops.") &&
            f !== "launcher_studio.ts"
        )
        .sort();

      for (const file of files) {
        const fullPath = join(appsDir, file);
        const relPath = `./applications/${file}`;
        const meta = deriveAppMetadata(relPath);
        const id = `rad_${meta.name}`;

        const children = getAliveChildren(id);
        let isRunning = false;
        let pid: number | undefined = undefined;
        let instanceCount = 0;

        if (children.length > 0) {
          isRunning = true;
          pid = children[children.length - 1]!.pid;
          instanceCount = children.length;
        }
        if (!isRunning) {
          const matchedProc = runningProcs.find(
            (p) => isScriptProcess(p.comm, p.args, relPath)
          );
          if (matchedProc) {
            isRunning = true;
            pid = matchedProc.pid;
            instanceCount = 1;
          }
        }

        const hist = history.launchHistory[id];
        const isFavorite = history.favorites.includes(id);

        apps.push({
          id,
          name: meta.name,
          displayName: meta.displayName,
          category: meta.category,
          source: "rad_studio",
          sourceLabel: "App Studio",
          path: fullPath,
          displayPath: relPath,
          icon: meta.icon,
          version: "1.0.0",
          description: meta.description,
          command: `bun run ${relPath}`,
          isRunning,
          pid,
          instanceCount: instanceCount || undefined,
          isFavorite,
          lastLaunched: hist?.lastLaunched,
          launchCount: hist?.count || 0,
        });
      }
    } catch {}
  }

  // 2. Scan cli_apps/*.ts
  const cliDir = resolve(cwd, "cli_apps");
  if (existsSync(cliDir)) {
    try {
      const files = readdirSync(cliDir)
        .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"))
        .sort();

      for (const file of files) {
        const fullPath = join(cliDir, file);
        const relPath = `./cli_apps/${file}`;
        const meta = deriveAppMetadata(relPath);
        const id = `cli_${meta.name}`;

        const children = getAliveChildren(id);
        let isRunning = false;
        let pid: number | undefined = undefined;
        let instanceCount = 0;

        if (children.length > 0) {
          isRunning = true;
          pid = children[children.length - 1]!.pid;
          instanceCount = children.length;
        }
        if (!isRunning) {
          const matchedProc = runningProcs.find(
            (p) => isScriptProcess(p.comm, p.args, relPath)
          );
          if (matchedProc) {
            isRunning = true;
            pid = matchedProc.pid;
            instanceCount = 1;
          }
        }

        const hist = history.launchHistory[id];
        const isFavorite = history.favorites.includes(id);

        apps.push({
          id,
          name: meta.name,
          displayName: meta.displayName,
          category: meta.category,
          source: "cli_tool",
          sourceLabel: "CLI Tool",
          path: fullPath,
          displayPath: relPath,
          icon: meta.icon,
          version: "1.0.0",
          description: meta.description,
          command: `bun run ${relPath}`,
          isRunning,
          pid,
          instanceCount: instanceCount || undefined,
          isFavorite,
          lastLaunched: hist?.lastLaunched,
          launchCount: hist?.count || 0,
        });
      }
    } catch {}
  }

  // 3. Scan demos/*.ts
  const demosDir = resolve(cwd, "demos");
  if (existsSync(demosDir)) {
    try {
      const files = readdirSync(demosDir)
        .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"))
        .sort();

      for (const file of files) {
        const fullPath = join(demosDir, file);
        const relPath = `./demos/${file}`;
        const meta = deriveAppMetadata(relPath);
        const id = `demo_${meta.name}`;

        const children = getAliveChildren(id);
        let isRunning = false;
        let pid: number | undefined = undefined;
        let instanceCount = 0;

        if (children.length > 0) {
          isRunning = true;
          pid = children[children.length - 1]!.pid;
          instanceCount = children.length;
        }
        if (!isRunning) {
          const matchedProc = runningProcs.find(
            (p) => isScriptProcess(p.comm, p.args, relPath)
          );
          if (matchedProc) {
            isRunning = true;
            pid = matchedProc.pid;
            instanceCount = 1;
          }
        }

        const hist = history.launchHistory[id];
        const isFavorite = history.favorites.includes(id);

        apps.push({
          id,
          name: meta.name,
          displayName: meta.displayName,
          category: meta.category,
          source: "rad_demo",
          sourceLabel: "Showcase Demo",
          path: fullPath,
          displayPath: relPath,
          icon: meta.icon,
          version: "1.0.0",
          description: meta.description,
          command: `bun run ${relPath}`,
          isRunning,
          pid,
          instanceCount: instanceCount || undefined,
          isFavorite,
          lastLaunched: hist?.lastLaunched,
          launchCount: hist?.count || 0,
        });
      }
    } catch {}
  }

  return apps;
}

/**
 * Aggregates all project applications and CLI tools (Exclusively project scoped)
 */
export function scanAllApplications(): {
  apps: DetectedApp[];
  kpis: LauncherKpis;
  categories: string[];
} {
  const all = scanWorkspaceApps();

  const kpis: LauncherKpis = {
    total: all.length,
    radStudios: all.filter((a) => a.source === "rad_studio").length,
    cliTools: all.filter((a) => a.source === "cli_tool").length,
    demos: all.filter((a) => a.source === "rad_demo").length,
    running: all.filter((a) => a.isRunning).length,
    favorites: all.filter((a) => a.isFavorite).length,
    macApps: 0,
  };

  const categories = Array.from(new Set(all.map((a) => a.category))).sort();

  // Sort: Favorites first, then Running, then alphabetical
  all.sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    if (a.isRunning && !b.isRunning) return -1;
    if (!a.isRunning && b.isRunning) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return { apps: all, kpis, categories };
}

// -------------------------------------------------------------------------------------------------
// Launch, Kill & Reveal Operations
// -------------------------------------------------------------------------------------------------

/**
 * Resolves the absolute path to the Bun executable on the current system.
 * Guaranteed to find the running Bun binary across Windows, macOS, and Linux.
 */
export function getBunExecutable(): string {
  if (process.execPath && existsSync(process.execPath)) {
    return process.execPath;
  }
  const whichBun = Bun.which("bun") || (process.platform === "win32" ? Bun.which("bun.exe") : null);
  if (whichBun && existsSync(whichBun)) {
    return whichBun;
  }
  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE || "";
    const localApp = process.env.LOCALAPPDATA || "";
    const candidates = [
      "C:\\Tools\\bun-x64\\bun-windows-x64\\bun.exe",
      join(userProfile, ".bun", "bin", "bun.exe"),
      join(localApp, "bun", "bin", "bun.exe"),
      "C:\\Program Files\\Bun\\bun.exe",
      "C:\\Tools\\bun-x64\\bun.exe",
      "C:\\Tools\\bun-arm64\\bun.exe",
    ];
    for (const c of candidates) {
      if (c && existsSync(c)) return c;
    }
    return "bun.exe";
  }
  return "bun";
}

/**
 * Ensures WebView2Loader.dll is present in node_modules/webview-bun/build on Windows.
 * Automatically searches installed Edge and EdgeWebView locations.
 */
export function ensureWebView2Loader(projectRoot = process.cwd()): boolean {
  if (process.platform !== "win32") return true;

  const buildDir = join(projectRoot, "node_modules", "webview-bun", "build");
  const targetLoader = join(buildDir, "WebView2Loader.dll");

  if (existsSync(targetLoader)) {
    return true;
  }

  try { mkdirSync(buildDir, { recursive: true }); } catch {}

  const localApp = process.env.LOCALAPPDATA || "";
  const searchRoots = [
    "C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application",
    "C:\\Program Files\\Microsoft\\EdgeWebView\\Application",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application",
    "C:\\Program Files\\Microsoft\\Edge\\Application",
    "C:\\Program Files (x86)\\Microsoft\\EdgeWebView",
    "C:\\Program Files\\Microsoft\\EdgeWebView",
    "C:\\Program Files (x86)\\Microsoft\\Edge",
    "C:\\Program Files\\Microsoft\\Edge",
    ...(localApp ? [join(localApp, "Microsoft", "EdgeWebView")] : []),
    "C:\\Windows\\System32",
    "C:\\Windows\\SysWOW64",
    "C:\\Windows\\Arm64",
  ];

  for (const root of searchRoots) {
    if (!existsSync(root)) continue;
    try {
      const findDll = (dir: string, depth = 0): string | null => {
        if (depth > 4) return null;
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = join(dir, e.name);
          if (!e.isDirectory() && e.name.toLowerCase() === "webview2loader.dll") {
            return full;
          } else if (e.isDirectory()) {
            const res = findDll(full, depth + 1);
            if (res) return res;
          }
        }
        return null;
      };
      const found = findDll(root);
      if (found) {
        const data = readFileSync(found);
        writeFileSync(targetLoader, data);
        return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Detects the best available terminal emulator on Linux systems
 */
export function getAvailableLinuxTerminal(): {
  binary: string;
  buildArgs: (cmd: string, cwd: string) => string[];
} | null {
  const check = (bin: string): boolean => {
    try {
      const p = Bun.spawnSync(["which", bin]);
      return p.exitCode === 0;
    } catch {
      return false;
    }
  };

  const envTerm = process.env.TERMINAL;
  if (envTerm && check(envTerm)) {
    return {
      binary: envTerm,
      buildArgs: (cmd, cwd) => [envTerm, "-e", "bash", "-c", `cd "${cwd.replace(/"/g, '\\"')}" && ${cmd}; exec bash`],
    };
  }

  const terminals: Array<{
    binary: string;
    buildArgs: (cmd: string, cwd: string) => string[];
  }> = [
    {
      binary: "gnome-terminal",
      buildArgs: (cmd, cwd) => ["gnome-terminal", `--working-directory=${cwd}`, "--", "bash", "-c", `${cmd}; exec bash`],
    },
    {
      binary: "ptyxis",
      buildArgs: (cmd, cwd) => ["ptyxis", `--working-directory=${cwd}`, "--", "bash", "-c", `${cmd}; exec bash`],
    },
    {
      binary: "konsole",
      buildArgs: (cmd, cwd) => ["konsole", "--workdir", cwd, "-e", "bash", "-c", `${cmd}; exec bash`],
    },
    {
      binary: "xfce4-terminal",
      buildArgs: (cmd, cwd) => ["xfce4-terminal", `--working-directory=${cwd}`, "-e", `bash -c "${cmd.replace(/"/g, '\\"')}; exec bash"`],
    },
    {
      binary: "mate-terminal",
      buildArgs: (cmd, cwd) => ["mate-terminal", `--working-directory=${cwd}`, "-e", `bash -c "${cmd.replace(/"/g, '\\"')}; exec bash"`],
    },
    {
      binary: "kitty",
      buildArgs: (cmd, cwd) => ["kitty", "--directory", cwd, "bash", "-c", `${cmd}; exec bash`],
    },
    {
      binary: "alacritty",
      buildArgs: (cmd, cwd) => ["alacritty", "--working-directory", cwd, "-e", "bash", "-c", `${cmd}; exec bash`],
    },
    {
      binary: "foot",
      buildArgs: (cmd, cwd) => ["foot", "-D", cwd, "bash", "-c", `${cmd}; exec bash`],
    },
    {
      binary: "terminator",
      buildArgs: (cmd, cwd) => ["terminator", `--working-directory=${cwd}`, "-e", `bash -c "${cmd.replace(/"/g, '\\"')}; exec bash"`],
    },
    {
      binary: "tilix",
      buildArgs: (cmd, cwd) => ["tilix", `--working-directory=${cwd}`, "-e", `bash -c "${cmd.replace(/"/g, '\\"')}; exec bash"`],
    },
    {
      binary: "lxterminal",
      buildArgs: (cmd, cwd) => ["lxterminal", `--working-directory=${cwd}`, "-e", `bash -c "${cmd.replace(/"/g, '\\"')}; exec bash"`],
    },
    {
      binary: "x-terminal-emulator",
      buildArgs: (cmd, cwd) => ["x-terminal-emulator", "-e", "bash", "-c", `cd "${cwd.replace(/"/g, '\\"')}" && ${cmd}; exec bash`],
    },
    {
      binary: "xterm",
      buildArgs: (cmd, cwd) => ["xterm", "-e", "bash", "-c", `cd "${cwd.replace(/"/g, '\\"')}" && ${cmd}; exec bash`],
    },
  ];

  for (const term of terminals) {
    if (check(term.binary)) {
      return term;
    }
  }

  return null;
}

/**
 * Spawns an interactive Terminal window on the user's desktop running the given command.
 * Guarantees a single terminal window without opening extraneous blank windows on macOS & Linux.
 */
export function launchInTerminal(
  command: string,
  cwd = process.cwd(),
  options: { dryRun?: boolean } = {}
): { success: boolean; message: string; terminalEmulator?: string } {
  try {
    if (options.dryRun) {
      return { success: true, message: `[Dry Run] Validated terminal launch for: ${command}` };
    }

    if (process.platform === "darwin") {
      const cleanCmd = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const cleanCwd = cwd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      // Smart AppleScript:
      // 1. Checks if Terminal.app process is already running.
      // 2. If not running, activates it and waits briefly for the initial startup window.
      // 3. Reuses an idle/blank window if one is available, or opens exactly 1 new window.
      // 4. Eliminates the double-window bug (blank startup window + cli window).
      const script = `tell application "System Events"
  set terminalRunning to (exists (processes where bundle identifier is "com.apple.Terminal"))
end tell

tell application "Terminal"
  if not terminalRunning then
    activate
    repeat 20 times
      if (count of (windows whose visible is true)) > 0 then exit repeat
      delay 0.05
    end repeat
  end if
  
  set visWindows to (windows whose visible is true)
  if (count of visWindows) > 0 and not (busy of tab 1 of (item 1 of visWindows)) then
    do script "cd \\"${cleanCwd}\\" && ${cleanCmd}" in (item 1 of visWindows)
  else
    do script "cd \\"${cleanCwd}\\" && ${cleanCmd}"
  end if
  activate
end tell`;

      const proc = Bun.spawnSync(["osascript", "-e", script]);
      if (proc.exitCode === 0) {
        return { success: true, message: `Opened CLI in macOS Terminal: ${command}`, terminalEmulator: "Terminal.app" };
      } else {
        const err = proc.stderr?.toString() || proc.stdout?.toString() || "Unknown osascript error";
        return { success: false, message: `Failed to launch Terminal on macOS: ${err}` };
      }
    } else if (process.platform === "win32") {
      const title = (options as any).title || "Bun RAD Studio";
      const wt = Bun.which("wt.exe") || Bun.which("wt");
      if (wt) {
        Bun.spawn([wt, "-d", cwd, "cmd.exe", "/k", command], { cwd, detached: true });
        return { success: true, message: `Opened CLI in Windows Terminal: ${command}`, terminalEmulator: "wt.exe" };
      }
      Bun.spawn(["cmd.exe", "/c", "start", title, "cmd.exe", "/k", `cd /d "${cwd}" && ${command}`], { cwd, detached: true });
      return { success: true, message: `Opened CLI in Command Prompt: ${command}`, terminalEmulator: "cmd.exe" };
    } else {
      // Linux & Unix-like desktop environments
      const linuxTerm = getAvailableLinuxTerminal();
      if (linuxTerm) {
        const args = linuxTerm.buildArgs(command, cwd);
        Bun.spawn(args, { cwd, detached: true });
        return {
          success: true,
          message: `Opened CLI in ${linuxTerm.binary}: ${command}`,
          terminalEmulator: linuxTerm.binary,
        };
      }

      return {
        success: false,
        message: `No supported Linux terminal emulator found (tested gnome-terminal, ptyxis, konsole, xfce4-terminal, kitty, alacritty, foot, terminator, tilix, x-terminal-emulator, xterm). Please set the $TERMINAL environment variable.`,
      };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function launchApplication(
  appId: string,
  extraArgs = "",
  options: { openTerminal?: boolean; timeoutMs?: number; onExit?: () => void; earlyExitMs?: number } = {}
): Promise<{
  success: boolean;
  message: string;
  output?: string;
  pid?: number;
}> {
  const { apps } = scanAllApplications();
  const lowerTarget = appId.toLowerCase();
  const app =
    // 1. Exact ID or prefixed ID match
    apps.find(
      (a) =>
        a.id.toLowerCase() === lowerTarget ||
        a.id.toLowerCase() === `rad_${lowerTarget}` ||
        a.id.toLowerCase() === `cli_${lowerTarget}` ||
        a.id.toLowerCase() === `demo_${lowerTarget}`
    ) ||
    // 2. Exact script name match
    apps.find((a) => a.name.toLowerCase() === lowerTarget) ||
    // 3. Exact display name match
    apps.find((a) => a.displayName.toLowerCase() === lowerTarget) ||
    // 4. Substring fallback
    apps.find((a) => a.id.toLowerCase().includes(lowerTarget)) ||
    apps.find(
      (a) =>
        a.name.toLowerCase().includes(lowerTarget) ||
        a.displayName.toLowerCase().includes(lowerTarget)
    );

  if (!app) {
    return { success: false, message: `Tool '${appId}' not found in project.` };
  }

  try {
    const bunExe = getBunExecutable();
    const env = { ...process.env };
    if (process.platform === "win32") {
      const buildDir = resolve(process.cwd(), "node_modules", "webview-bun", "build");
      const bunDir = resolve(bunExe, "..");
      env.PATH = `${buildDir};${bunDir};${env.PATH || ""}`;
      ensureWebView2Loader(process.cwd());
    }

    if (app.source === "rad_studio" || app.source === "rad_demo") {
      // Launch GUI Studio application in independent detached process.
      // stderr goes to a log file so a crash on startup can be reported instead of silently vanishing.
      const logDir = join(tmpdir(), "rad_launcher_logs");
      try { mkdirSync(logDir, { recursive: true }); } catch {}
      const logPath = join(logDir, `${app.id}.log`);

      let proc;
      try {
        proc = Bun.spawn([bunExe, "run", app.path], {
          stdout: "ignore",
          stderr: Bun.file(logPath),
          detached: true,
          cwd: process.cwd(),
          env,
        });
      } catch (spawnErr: any) {
        if (process.platform === "win32") {
          const fallbackProc = Bun.spawn(
            ["cmd.exe", "/c", "start", "", bunExe, "run", app.path],
            { cwd: process.cwd(), detached: true, env }
          );
          const pid = fallbackProc.pid;
          registerChildProcess(app.id, {
            pid,
            appName: app.displayName,
            startedAt: Date.now(),
          });
          recordLaunch(app.id);
          return {
            success: true,
            message: `Started ${app.displayName} GUI via Windows start (PID: ${pid})`,
            pid,
          };
        }
        throw spawnErr;
      }

      const pid = proc.pid;
      registerChildProcess(app.id, {
        pid,
        appName: app.displayName,
        startedAt: Date.now(),
      });

      // Automatically prune child process record and notify when GUI app closes
      proc.exited.then(() => {
        unregisterChildProcess(app.id, pid);
        if (options.onExit) {
          try {
            options.onExit();
          } catch {}
        }
      }).catch(() => {});

      proc.unref();

      // If it dies almost immediately it crashed (syntax error, missing dependency, port clash...).
      const earlyMs = options.earlyExitMs ?? 800;
      if (earlyMs > 0) {
        const early = await Promise.race([proc.exited, Bun.sleep(earlyMs).then(() => null)]);
        if (early !== null && early !== 0) {
          let tail = "";
          try { tail = readFileSync(logPath, "utf-8").trim().split("\n").slice(-12).join("\n"); } catch {}
          return {
            success: false,
            message: `${app.displayName} exited immediately (code ${early}).`,
            output: `${tail || "(no error output captured)"}\n\nFull log: ${logPath}`,
            pid,
          };
        }
      }

      recordLaunch(app.id);
      return {
        success: true,
        message: `Started ${app.displayName} GUI (PID: ${pid})`,
        pid,
      };
    } else {
      // CLI Tool Execution
      // Quote-aware split; arguments are passed to the process directly (never through a shell).
      const parsed = parseArgs(extraArgs);
      const splitArgs = parsed.length ? parsed : ["--help"];
      const fullCmd = [bunExe, "run", app.path, ...splitArgs];
      // For the terminal, format command line appropriately for current OS
      const fullCmdStr = process.platform === "win32"
        ? buildWindowsCommand(fullCmd)
        : buildShellCommand(fullCmd);

      recordLaunch(app.id);

      if (options.openTerminal) {
        const termRes = launchInTerminal(fullCmdStr, process.cwd(), { title: app.displayName } as any);
        return {
          success: termRes.success,
          message: termRes.message,
          output: `[Launched in Terminal]\nApplication: ${app.displayName}\nCommand: ${fullCmdStr}\nStatus: ${termRes.message}`,
        };
      }

      // Execute inline with safety timeout so continuous/interactive CLI tools don't freeze the caller
      const timeoutMs = options.timeoutMs || 8000;
      const proc = Bun.spawn(fullCmd, {
        stdout: "pipe",
        stderr: "pipe",
        cwd: process.cwd(),
        env,
      });

      let timeoutHandle: any;
      const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      });

      const execPromise = Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]).then(([stdout, stderr, exitCode]) => ({ timedOut: false, stdout, stderr, exitCode }));

      const outcome = await Promise.race([execPromise, timeoutPromise]);
      clearTimeout(timeoutHandle);

      if (outcome.timedOut) {
        try { proc.kill(); } catch {}
        return {
          success: true,
          message: `Executed ${app.displayName} (Continuous / Interactive Process)`,
          output: `=== CLI Output: ${app.displayName} ===\nCommand: ${fullCmdStr}\n\n(Process is continuous or waiting for input. Use '🖥️ Open in Terminal' for full interactive access).`,
          pid: proc.pid,
        };
      }

      const output = (outcome.stdout || outcome.stderr || `(Command exited with code ${outcome.exitCode})`).trim();

      return {
        success: outcome.exitCode === 0,
        message: `Executed ${app.displayName} (exit ${outcome.exitCode})`,
        output,
        pid: proc.pid,
      };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export function killApplication(appId: string, pid?: number): { success: boolean; message: string } {
  if (pid !== undefined) {
    const targetPid = Number(pid);
    if (!Number.isInteger(targetPid) || targetPid <= 1 || targetPid === process.pid) {
      return { success: false, message: `Refusing to signal invalid or protected PID ${targetPid}.` };
    }
    try {
      process.kill(targetPid, "SIGTERM");
      unregisterChildProcess(appId, targetPid);
      return { success: true, message: `Terminated process PID ${targetPid}.` };
    } catch (err: any) {
      try {
        process.kill(targetPid, "SIGKILL");
        unregisterChildProcess(appId, targetPid);
        return { success: true, message: `Force-killed process PID ${targetPid}.` };
      } catch (e2: any) {
        unregisterChildProcess(appId, targetPid);
        return { success: false, message: e2.message };
      }
    }
  }

  // No specific PID specified: terminate all active instances of this app
  const aliveChildren = getAliveChildren(appId);
  if (aliveChildren.length > 0) {
    const killedPids: number[] = [];
    const errors: string[] = [];

    for (const child of aliveChildren) {
      const childPid = child.pid;
      if (!Number.isInteger(childPid) || childPid <= 1 || childPid === process.pid) continue;
      try {
        process.kill(childPid, "SIGTERM");
        killedPids.push(childPid);
      } catch {
        try {
          process.kill(childPid, "SIGKILL");
          killedPids.push(childPid);
        } catch (killError: any) {
          errors.push(`PID ${childPid}: ${killError.message}`);
        }
      }
    }
    unregisterChildProcess(appId);
    if (killedPids.length > 0) {
      return {
        success: true,
        message: `Terminated ${killedPids.length} active instance(s) [PIDs: ${killedPids.join(", ")}].`,
      };
    }
    return { success: false, message: errors.join("; ") || "Failed to terminate instances." };
  }

  // Fallback to external process scan
  const { apps } = scanAllApplications();
  const app = apps.find((a) => a.id === appId || a.name === appId);
  let targetPid = app?.pid;

  if (!targetPid) {
    return { success: false, message: "No active PID found for tool." };
  }

  targetPid = Number(targetPid);
  if (!Number.isInteger(targetPid) || targetPid <= 1 || targetPid === process.pid) {
    return { success: false, message: `Refusing to signal invalid or protected PID ${targetPid}.` };
  }

  try {
    if (process.platform === "win32") {
      try { Bun.spawnSync(["taskkill.exe", "/F", "/T", "/PID", String(targetPid)]); } catch {}
    } else {
      process.kill(targetPid, "SIGTERM");
    }
    unregisterChildProcess(appId);
    return { success: true, message: `Terminated process PID ${targetPid}.` };
  } catch (err: any) {
    try {
      if (process.platform === "win32") {
        try { Bun.spawnSync(["taskkill.exe", "/F", "/T", "/PID", String(targetPid)]); } catch {}
      } else {
        process.kill(targetPid, "SIGKILL");
      }
      unregisterChildProcess(appId);
      return { success: true, message: `Force-killed process PID ${targetPid}.` };
    } catch (e2: any) {
      unregisterChildProcess(appId);
      return { success: false, message: e2.message };
    }
  }
}

export function revealInFinder(filePath: string): { success: boolean; message: string } {
  try {
    if (process.platform === "darwin") {
      Bun.spawn(["open", "-R", filePath]);
      return { success: true, message: "Revealed in Finder" };
    } else if (process.platform === "win32") {
      const winPath = filePath.replace(/\//g, "\\");
      Bun.spawn(["explorer.exe", `/select,${winPath}`]);
      return { success: true, message: "Revealed in Explorer" };
    } else {
      Bun.spawn(["xdg-open", filePath]);
      return { success: true, message: "Opened directory" };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export function copyToClipboard(text: string): { success: boolean } {
  return { success: writeClipboardSync(text) };
}

/** Open a tool's source file in VS Code if installed, otherwise the OS default text editor. */
export function openInEditor(filePath: string): { success: boolean; message: string } {
  try {
    if (!existsSync(filePath)) return { success: false, message: `File not found: ${filePath}` };
    const code = Bun.which("code") || (process.platform === "win32" ? Bun.which("code.cmd") : null);
    if (code) {
      Bun.spawn([code, filePath], { stdout: "ignore", stderr: "ignore" });
      return { success: true, message: "Opened in VS Code" };
    }
    if (process.platform === "darwin") Bun.spawn(["open", "-t", filePath], { stdout: "ignore", stderr: "ignore" });
    else if (process.platform === "win32") Bun.spawn(["cmd.exe", "/c", "start", "", filePath.replace(/\//g, "\\")], { stdout: "ignore", stderr: "ignore" });
    else Bun.spawn(["xdg-open", filePath], { stdout: "ignore", stderr: "ignore" });
    return { success: true, message: "Opened in default editor" };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/** Stop every running tool (instances started here and externally-started ones). Returns how many were stopped. */
export function stopAllApplications(): { stopped: number; messages: string[] } {
  const messages: string[] = [];
  let stopped = 0;
  for (const a of scanAllApplications().apps) {
    if (!a.isRunning) continue;
    const r = killApplication(a.id, getAliveChildren(a.id).length ? undefined : a.pid);
    messages.push(`${a.displayName}: ${r.message}`);
    if (r.success) stopped++;
  }
  return { stopped, messages };
}

// -------------------------------------------------------------------------------------------------
// Primary SimpleGUI Desktop Application Window
// -------------------------------------------------------------------------------------------------

export function createLauncherStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const fullscreen = options.fullscreen ?? true;
  const initialData = scanAllApplications();
  let currentApps = initialData.apps;
  let selectedApp: DetectedApp | null = currentApps[0] || null;

  const catCounts: Record<string, number> = {};
  for (const a of initialData.apps) {
    catCounts[a.category] = (catCounts[a.category] || 0) + 1;
  }

  const categoryDropdownOptions = [
    `📁 All Categories (${initialData.apps.length})`,
    ...initialData.categories.map((cat) => `${getCategoryIcon(cat)} ${cat} (${catCounts[cat] || 0})`),
  ];

  const win = newSimpleWindow(
    "Project Application & CLI Launcher Pro -- Bun RAD Studio",
    1240,
    980,
    {
      appId: "launcher_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: false,
      fullscreen,
    }
  );

  // 1. Top Header Row
  win.beginRow();
  win.addHeading("⚡ Project Application & CLI Launcher");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_rescan", "🔄 Rescan Tools");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save Config");
  win.endRow();
  win.addCaption(
    `Dedicated Project Tool Workstation  |  ${initialData.kpis.radStudios} Studio Apps  |  ${initialData.kpis.cliTools} CLI Tools  |  ${initialData.kpis.demos} Demos  |  Zero External Clutter`
  );

  // 2. Telemetry Summary Cards Row
  win.beginGroupBox("Project Tools Telemetry & Workspace Scope");
  win.beginRow();
  win.addLabel("lbl_kpi_total", `⚡ Total Tools: ${initialData.kpis.total}`);
  win.addLabel("lbl_kpi_studios", `🖥️ Studio Applications: ${initialData.kpis.radStudios}`);
  win.addLabel("lbl_kpi_cli", `🛠️ CLI Utilities: ${initialData.kpis.cliTools}`);
  win.addLabel("lbl_kpi_demos", `🎮 Showcase Demos: ${initialData.kpis.demos}`);
  win.addLabel("lbl_kpi_running", `🟢 Active Running: ${initialData.kpis.running}`);
  win.addLabel("lbl_kpi_favs", `⭐ Favorites: ${initialData.kpis.favorites}`);
  win.endRow();
  win.endGroupBox();

  // 3. 1-Click Quick Launch Toolbar for Popular Tools & Pinned Favorites
  win.beginGroupBox("⚡ 1-Click Quick Launch: Popular Project Studios & CLI Tools");
  win.beginRow();
  win.addButton("btn_quick_sqlite", "🗄️ SQLite Studio");
  win.addButton("btn_quick_redis", "⚡ Redis Studio");
  win.addButton("btn_quick_api", "📡 API Studio");
  win.addButton("btn_quick_task", "📊 Task Manager");
  win.addButton("btn_quick_bundler", "📦 App Bundler");
  win.addButton("btn_quick_code", "💻 NovaCode");
  win.addButton("btn_quick_env", "⚙️ Env Studio");
  win.addButton("btn_quick_ipinfo", "🌍 IP Geolocation");
  win.endRow();

  win.beginRow();
  win.addButton("btn_quick_interval", "⏱️ Interval Timer");
  win.addButton("btn_quick_drcodecaine", "💊 Dr. Codecaine");
  win.addButton("btn_quick_lolo", "👾 Lolo Arcade");
  win.addButton("btn_quick_tetris", "🧱 Tetris Ultra");
  win.addButton("btn_quick_rad", "⚡ RAD Studio");
  win.addButton("btn_quick_calc", "🧮 Calculator");
  win.addButton("btn_quick_markdown", "📝 Markdown");
  win.addButton("btn_quick_paint", "🎨 Chroma Studio");
  win.endRow();

  // GUI Studio Versions of CLI Tools
  win.beginRow();
  win.addButton("btn_quick_system", "🖥️ System Studio");
  win.addButton("btn_quick_db", "🗄️ Database Studio");
  win.addButton("btn_quick_fd", "🔍 Fd Studio");
  win.addButton("btn_quick_git", "🌿 Git Studio");
  win.addButton("btn_quick_tokei", "📊 Tokei Studio");
  win.addButton("btn_quick_gdu", "💾 Gdu Studio");
  win.addButton("btn_quick_network", "🌐 Network Studio");
  win.addButton("btn_quick_crypto", "🔒 Crypto Studio");
  win.endRow();

  // Terminal CLI Tools Companion
  win.beginRow();
  win.addButton("btn_quick_sys_cli", "🖥️ System CLI");
  win.addButton("btn_quick_db_cli", "🗄️ Database CLI");
  win.addButton("btn_quick_fd_cli", "🔍 Fd CLI");
  win.addButton("btn_quick_git_cli", "🌿 Git CLI");
  win.addButton("btn_quick_tokei_cli", "📊 Tokei CLI");
  win.addButton("btn_quick_gdu_cli", "💾 Gdu CLI");
  win.addButton("btn_quick_net_cli", "🌐 Network CLI");
  win.addButton("btn_quick_crypto_cli", "🔒 Crypto CLI");
  win.endRow();

  // Quick Favorites Strip
  win.beginRow();
  win.addLabel("lbl_fav_toolbar", "⭐ Pinned Favorites:");
  win.addButton("btn_quick_favs_filter", "⭐ Filter to Favorites");
  win.addButton("btn_quick_launch_fav1", "🚀 Launch Top Favorite");
  win.addButton("btn_quick_toggle_fav", "⭐ Toggle Star for Selected");
  win.endRow();
  win.endGroupBox();

  // 4. Primary Tool Selector & Action Dispatcher
  const formatItemStr = (a: DetectedApp) =>
    `${a.isFavorite ? "⭐ " : ""}${a.isRunning && a.instanceCount && a.instanceCount > 1 ? `[${a.instanceCount}x] ` : ""}[${a.sourceLabel}] ${a.displayName} (${a.displayPath})`;

  const dropdownItems = currentApps.map(formatItemStr);

  win.beginGroupBox("Select & Launch Any Tool in this Project");

  // Action Dispatcher Buttons & CLI Arguments Row
  win.beginRow();
  win.addLabel("lbl_pick", "Selected Tool:");
  win.addDropdown("dd_select_app", dropdownItems, dropdownItems[0] || "None", { width: 390 });
  win.addLabel("lbl_args", "CLI Flags / Args:");
  win.addInput("txt_cli_args", "--help", "Arguments e.g. --telemetry, --search...", { width: 140 });
  win.addButton("btn_launch", "🚀 Launch");
  win.addButton("btn_fav", selectedApp?.isFavorite ? "★ Unfavorite" : "☆ Favorite");
  win.addButton("btn_terminal", "🖥️ Terminal");
  win.addButton("btn_run_inline", "⚡ Inline");
  win.addButton("btn_kill", "🛑 Stop");
  win.addButton("btn_reveal", "📂 Reveal");
  win.addButton("btn_copy", "📋 Copy Cmd");
  win.endRow();

  win.beginRow();
  win.addButton("btn_edit", "📝 Open Source");
  win.addButton("btn_copy_path", "📎 Copy Path");
  win.addButton("btn_stop_all", "⏹ Stop All Running");
  win.addButton("btn_clear_history", "🧹 Clear Usage History");
  win.endRow();

  // Interactive Workspace Tools ListBox Row
  win.beginRow();
  win.addLabel(
    "lbl_listbox_info",
    "📋 Interactive Project Tools ListBox (Click any item to select & sync, double-click or Enter to auto-launch):"
  );
  win.endRow();

  win.beginRow();
  win.addListBox(
    "lst_apps",
    dropdownItems,
    dropdownItems[0] || "None",
    (w, val: any) => {
      const found = findAppFromSelection(val);
      if (found) {
        selectedApp = found;
        updateSelectedView(w, found);
      }
    },
    {
      size: 6,
      width: 1180,
      height: 140,
      onDoubleClick: "on_lst_apps_doubleclick",
      ondblclick: "on_lst_apps_doubleclick",
      onEnter: "on_lst_apps_enter",
      onenter: "on_lst_apps_enter",
      onKeyDown: "if(event.key==='Enter'||event.keyCode===13){event.preventDefault();if(window.on_lst_apps_enter){window.on_lst_apps_enter(this.value);}else if(window.on_lst_apps_doubleclick){window.on_lst_apps_doubleclick(this.value);}}",
      event_handlers: {
        onKeyDown: "if(event.key==='Enter'||event.keyCode===13){event.preventDefault();if(window.on_lst_apps_enter){window.on_lst_apps_enter(this.value);}else if(window.on_lst_apps_doubleclick){window.on_lst_apps_doubleclick(this.value);}}",
      },
    }
  );
  win.endRow();

  win.endGroupBox();

  // 5. Search & Filter Bar
  win.beginGroupBox("Catalog Search & Category Filter");
  win.beginRow();
  win.addLabel("lbl_search", "🔍 Search:");
  win.addInput("txt_search", "", "Search tools by name, command, or keyword...", { width: 200 });
  win.addLabel("lbl_cat", "Scope:");
  win.addDropdown(
    "dd_category",
    [
      "🌟 All Project Tools",
      "⭐ Pinned Favorites",
      "🖥️ Studio Applications (applications/)",
      "🛠️ CLI Utilities (cli_apps/)",
      "🎮 Showcase Demos (demos/)",
      "🟢 Running Processes",
      "🕘 Recently Used",
    ],
    "🌟 All Project Tools",
    { width: 175 }
  );
  win.addLabel("lbl_app_cat", "Category:");
  win.addDropdown(
    "dd_app_category",
    categoryDropdownOptions,
    categoryDropdownOptions[0],
    { width: 220 }
  );
  win.addLabel("lbl_sort", "Sort:");
  win.addDropdown("dd_sort", Object.values(SORT_LABELS), SORT_LABELS.default, { width: 160 });
  win.addButton("btn_quick_favs", "⭐ Favs Only");
  win.addButton("btn_filter", "🔍 Apply");
  win.addButton("btn_clear_filter", "✕ Show All");
  win.endRow();

  // 1-Click Apps by Category Quick-Filter Bar
  win.beginRow();
  win.addLabel("lbl_quick_cats", "📂 Apps by Category:");
  win.addButton("btn_cat_all", "🌟 All Tools");
  win.addButton("btn_cat_db", `🗄️ Database (${catCounts["Database & Storage"] || 0})`);
  win.addButton("btn_cat_devtools", `🛠️ DevTools (${catCounts["Developer Tools"] || 0})`);
  win.addButton("btn_cat_system", `🖥️ System (${catCounts["System & Hardware"] || 0})`);
  win.addButton("btn_cat_files", `🔍 Files (${catCounts["File & Directory Tools"] || 0})`);
  win.addButton("btn_cat_network", `🌐 Network (${catCounts["Network & Cloud"] || 0})`);
  win.addButton("btn_cat_prod", `📝 Productivity (${catCounts["Productivity & Text"] || 0})`);
  win.addButton("btn_cat_games", `🎮 Games (${catCounts["Games & Entertainment"] || 0})`);
  win.addButton("btn_cat_security", `🔒 Security (${catCounts["Security & Crypto"] || 0})`);
  win.addButton("btn_cat_design", `🎨 Design (${(catCounts["Design & UX"] || 0) + (catCounts["Design & Media"] || 0)})`);
  win.addButton("btn_cat_demos", `🧪 Demos (${catCounts["Demos & Templates"] || 0})`);
  win.addButton("btn_cat_cli", `💻 CLI (${catCounts["CLI Utilities"] || 0})`);
  win.endRow();
  win.endGroupBox();

  // 6. Project Tools Data Table
  const tableHeaders = ["ID", "Fav", "Type", "Name", "Category", "Status", "Used", "Command Path"];
  const formatRow = (a: DetectedApp) => [
    a.id,
    a.isFavorite ? "⭐ Fav" : "☆ Regular",
    a.sourceLabel,
    `${a.icon || "⚡"} ${a.displayName}`,
    a.category,
    a.isRunning
      ? (a.instanceCount && a.instanceCount > 1
          ? `🟢 Running (${a.instanceCount}x)`
          : `🟢 Running (#${a.pid || "?"})`)
      : "⚪ Ready",
    a.launchCount ? usageLabel(a) : "0× (Never)",
    a.command,
  ];

  const initialRows = currentApps.map(formatRow);

  win.beginGroupBox(`Project Tools Catalog (${initialData.kpis.total} Total Tools in Workspace)`);
  win.addTable("tbl_apps", tableHeaders, initialRows, (w, rowPid: any) => {
    // Exact match on rowPid since cell[0] is app.id!
    const found = currentApps.find((a) => a.id === String(rowPid).trim()) || findAppFromSelection(rowPid);
    if (found) {
      selectedApp = found;
      updateSelectedView(w, found);
    }
  }, { height: 260 });
  win.endGroupBox();

  // 7. Real-Time Command Output & Execution Results
  win.beginGroupBox("Real-Time Command Output & Execution Results");
  win.addTextarea(
    "txt_output",
    `[Project Application & CLI Launcher Pro Initialized]\nTotal Tools Indexed: ${initialData.kpis.total}\n\nSelect any application or CLI tool above and click '🚀 Launch Selected Tool', or click any 1-Click Quick Launch button to run it immediately.`
  );
  win.endGroupBox();

  // 8. Console Telemetry
  win.beginGroupBox("Execution Telemetry Console");
  win.addConsole("launcher_console", 110);
  win.endGroupBox();

  // 9. Status Bar
  win.beginRow();
  win.addLabel(
    "lbl_status",
    `Ready  |  ${initialData.kpis.radStudios} Studio Apps  |  ${initialData.kpis.cliTools} CLI Tools  |  ${initialData.kpis.demos} Demos  |  ⭐ ${initialData.kpis.favorites} Favorites  |  Running: ${initialData.kpis.running}`
  );
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Helper Functions
  // -----------------------------------------------------------------------------------------------

  function findAppFromSelection(val: any): DetectedApp | null {
    if (val === null || val === undefined) return null;
    const str = Array.isArray(val) ? String(val[0] || "").trim() : String(val).trim();
    if (!str || str === "None") return null;

    // 1. Direct ID match
    let found = currentApps.find((a) => a.id === str || a.id.toLowerCase() === str.toLowerCase());
    if (found) return found;

    // 2. Exact displayPath match (e.g. within parentheses or trailing)
    found = currentApps.find((a) => str.includes(`(${a.displayPath})`) || str.endsWith(a.displayPath));
    if (found) return found;

    // 3. Match on full displayPath
    found = currentApps.find((a) => str.includes(a.displayPath));
    if (found) return found;

    // 4. Match on displayName
    found = currentApps.find((a) => str.includes(a.displayName));
    if (found) return found;

    // 5. Match on script name
    found = currentApps.find((a) => str.includes(a.name));
    if (found) return found;

    return null;
  }

  function updateSelectedView(w: SimpleWindow, app: DetectedApp) {
    selectedApp = app;
    const itemStr = formatItemStr(app);

    // Synchronize ListBox Selection
    w.setValue("lst_apps", itemStr);

    // Synchronize Dropdown Selection
    w.setValue("dd_select_app", itemStr);

    // Synchronize Favorite button
    const favLabel = app.isFavorite ? "★ Unfavorite" : "☆ Favorite";
    w.setValue("btn_fav", favLabel);
    w.setValue("btn_quick_toggle_fav", app.isFavorite ? "⭐ Unpin Favorite" : "⭐ Pin Favorite");

    // Set intelligent preset arguments if empty or default
    if (app.source === "cli_tool") {
      const curArgs = (w.getValue("txt_cli_args") || "").trim();
      if (!curArgs || curArgs === "--help") {
        if (app.id.includes("system")) {
          w.setValue("txt_cli_args", "--telemetry");
        } else {
          w.setValue("txt_cli_args", "--help");
        }
      }
    }

    w.setStatus(`Selected Tool: ${app.displayName} (${app.displayPath}) [${app.category}] ${app.isFavorite ? "⭐ [Favorite]" : ""}`);

    const summary = [
      `=== Tool Selected: ${app.displayName} ===`,
      `ID:          ${app.id}`,
      `Type:        ${app.sourceLabel}`,
      `Category:    ${app.category}`,
      `Script Path: ${app.path}`,
      `Run Command: ${app.command}`,
      `Description: ${app.description}`,
      `Status:      ${app.isRunning ? `🟢 Active Running (PID ${app.pid})` : "⚪ Ready to Launch"}`,
      `Favorite:    ${app.isFavorite ? "Yes (★ Pinned Favorite)" : "No (☆ Not Pinned)"}`,
    ].join("\n");

    w.setText("txt_output", summary);

    // Precise DOM synchronization across Top DropDown, Top ListBox, Bottom Table, and Favorite Buttons
    w.evalJS(`
      (function() {
        const appId = ${JSON.stringify(app.id)};
        const itemStr = ${JSON.stringify(itemStr)};
        const favLabel = ${JSON.stringify(favLabel)};
        window.selectedRowPid = appId;

        function syncUI() {
          // 1. Synchronize Top Dropdown
          const dd = document.getElementById("dd_select_app");
          if (dd) {
            const sel = dd.tagName === "SELECT" ? dd : dd.querySelector("select");
            if (sel) {
              for (let i = 0; i < sel.options.length; i++) {
                const opt = sel.options[i];
                if (opt.value === itemStr || opt.text === itemStr || opt.text.includes(appId) || opt.value.includes(appId)) {
                  sel.selectedIndex = i;
                  break;
                }
              }
            }
          }

          // 2. Synchronize Top ListBox
          const lst = document.getElementById("lst_apps");
          if (lst) {
            const sel = lst.tagName === "SELECT" ? lst : lst.querySelector("select");
            if (sel) {
              for (let i = 0; i < sel.options.length; i++) {
                const opt = sel.options[i];
                if (opt.value === itemStr || opt.text === itemStr || opt.text.includes(appId) || opt.value.includes(appId)) {
                  sel.selectedIndex = i;
                  opt.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  break;
                }
              }
            }
          }

          // 3. Synchronize Bottom Table
          const tbl = document.getElementById("tbl_apps");
          if (tbl) {
            const isLight = document.body.classList.contains("light-theme") || (window.currentTheme && window.currentTheme.includes("light"));
            const selBg = isLight ? 'rgba(2,132,199,0.18)' : 'rgba(56,189,248,0.22)';
            const rows = tbl.querySelectorAll("tbody tr");
            let targetTr = null;
            rows.forEach(tr => {
              if (tr.getAttribute("data-pid") === appId) {
                tr.classList.add("selected-tr");
                tr.style.background = selBg;
                targetTr = tr;
              } else {
                tr.classList.remove("selected-tr");
                tr.style.background = "";
              }
            });
            if (targetTr) {
              targetTr.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
          }

          // 4. Update Favorite button label in DOM
          const favBtn = document.getElementById("btn_fav");
          if (favBtn) {
            favBtn.textContent = favLabel;
          }

          // 5. Wrap IPC doubleclick callbacks on window to prevent duplicate rapid dispatches (< 300ms)
          if (window.on_lst_apps_doubleclick && !window._raw_lst_apps_dbl) {
            window._raw_lst_apps_dbl = window.on_lst_apps_doubleclick;
            let lastLstTime = 0;
            window.on_lst_apps_doubleclick = function(val) {
              const now = Date.now();
              if (now - lastLstTime < 200) return;
              lastLstTime = now;
              window._raw_lst_apps_dbl(val);
            };
          }

          if (window.on_lst_apps_enter && !window._raw_lst_apps_enter) {
            window._raw_lst_apps_enter = window.on_lst_apps_enter;
            let lastLstEnterTime = 0;
            window.on_lst_apps_enter = function(val) {
              const now = Date.now();
              if (now - lastLstEnterTime < 200) return;
              lastLstEnterTime = now;
              window._raw_lst_apps_enter(val);
            };
          }

          if (window.on_tbl_apps_doubleclick && !window._raw_tbl_apps_dbl) {
            window._raw_tbl_apps_dbl = window.on_tbl_apps_doubleclick;
            let lastTblTime = 0;
            window.on_tbl_apps_doubleclick = function(val) {
              const now = Date.now();
              if (now - lastTblTime < 200) return;
              lastTblTime = now;
              window._raw_tbl_apps_dbl(val);
            };
          }

          // 6. Rapid-click fallback & Return key detector for listbox
          if (lst && !lst.dataset.dblBound) {
            lst.dataset.dblBound = "true";
            let lastClickTime = 0;
            let lastClickedVal = null;
            let lastEnterTime = 0;

            lst.addEventListener("click", function() {
              const now = Date.now();
              const val = lst.value;
              if (now - lastClickTime < 350 && lastClickedVal === val) {
                lastClickTime = 0;
                lastClickedVal = null;
                if (window.on_lst_apps_doubleclick) {
                  window.on_lst_apps_doubleclick(val);
                }
              } else {
                lastClickTime = now;
                lastClickedVal = val;
              }
            });

            lst.addEventListener("keydown", function(e) {
              if (e.key === "Enter" || e.keyCode === 13) {
                const now = Date.now();
                if (now - lastEnterTime < 500) return;
                lastEnterTime = now;
                e.preventDefault();
                const val = lst.value;
                if (window.on_lst_apps_enter) {
                  window.on_lst_apps_enter(val);
                } else if (window.on_lst_apps_doubleclick) {
                  window.on_lst_apps_doubleclick(val);
                } else {
                  const btn = document.getElementById("btn_launch");
                  if (btn) btn.click();
                }
              }
            });
          }

          // 7. Rapid-click fallback detector for table rows
          if (tbl && !tbl.dataset.dblBound) {
            tbl.dataset.dblBound = "true";
            let lastRowClick = 0;
            let lastRowPid = null;

            tbl.addEventListener("click", function(e) {
              const tr = e.target.closest("tbody tr");
              if (!tr) return;
              const pid = tr.getAttribute("data-pid");
              if (!pid) return;
              const now = Date.now();
              if (now - lastRowClick < 350 && lastRowPid === pid) {
                lastRowClick = 0;
                lastRowPid = null;
                const fn = window.on_tbl_apps_doubleclick || window.tbl_apps_onDoubleClick;
                if (fn) fn(pid);
              } else {
                lastRowClick = now;
                lastRowPid = pid;
              }
            });
          }
        }

        syncUI();
        setTimeout(syncUI, 50);
      })();
    `);
  }

  const launchingApps = new Set<string>();
  const lastLaunchTimes = new Map<string, number>();

  async function executeToolLaunch(
    app: DetectedApp,
    w: SimpleWindow,
    overrideArgs?: string,
    inTerminal?: boolean
  ) {
    const now = Date.now();
    const lastLaunch = lastLaunchTimes.get(app.id) || 0;
    if (now - lastLaunch < 800) {
      return;
    }
    launchingApps.add(app.id);
    lastLaunchTimes.set(app.id, now);

    try {
      const rawArgs = overrideArgs !== undefined ? overrideArgs : (w.getValue("txt_cli_args") || "");
      const openInTerminal = inTerminal !== undefined ? inTerminal : (app.source === "cli_tool");

      w.appendConsole(
        "launcher_console",
        `[Launch Dispatcher] Executing ${app.displayName} ('${app.command} ${rawArgs}') [mode: ${openInTerminal ? "terminal" : "inline"}]...\n`,
        1
      );
      w.setStatus(`Running ${app.displayName}...`);

      const launchResult = await launchApplication(app.id, rawArgs, {
        openTerminal: openInTerminal,
        onExit: () => {
          setTimeout(() => {
            try {
              applyFilters(w, undefined, true);
            } catch {}
          }, 250);
        },
      });

      if (launchResult.success) {
        w.appendConsole("launcher_console", `[Success] ${launchResult.message}\n`, 2);
        w.toast(`✅ ${launchResult.message}`);

        if (app.source === "rad_studio" || app.source === "rad_demo") {
          w.setText(
            "txt_output",
            `[Desktop GUI Application Launched]\nApplication: ${app.displayName}\nPID: ${launchResult.pid}\nPath: ${app.path}\nCommand: bun run ${app.displayPath}\nStatus: The application window should now be open on your desktop!`
          );
        } else if (openInTerminal) {
          w.setText(
            "txt_output",
            `[Terminal Client Launched]\nApplication: ${app.displayName}\nCategory:    ${app.category}\nScript Path: ${app.path}\nCommand:     bun run ${app.displayPath} ${rawArgs || "--help"}\nStatus:      Active interactive Terminal session opened on your desktop!`
          );
        } else {
          w.setText(
            "txt_output",
            `=== CLI Output: ${app.displayName} ===\nCommand: bun run ${app.displayPath} ${rawArgs || "--help"}\n\n${launchResult.output || "(No console output returned)"}`
          );
        }
        setTimeout(() => applyFilters(w, undefined, true), 800);
      } else {
        w.appendConsole("launcher_console", `[Launch Error] ${launchResult.message}\n`, 3);
        w.setText("txt_output", `[Error Launching Tool]\n${launchResult.message}${launchResult.output ? `\n\n${launchResult.output}` : ""}`);
        w.toast(`❌ ${launchResult.message}`);
      }
    } finally {
      launchingApps.delete(app.id);
    }
  }

  // Debounced entry point: collapses rapid keystroke/dropdown events into one filter pass
  // so overlapping IPC callbacks cannot interleave DOM rebuilds.
  let filterTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleFilters(w: SimpleWindow, overrides?: { query?: string; cat?: string; appCat?: string }, delay = 120) {
    if (filterTimer) clearTimeout(filterTimer);
    filterTimer = setTimeout(() => {
      filterTimer = null;
      applyFilters(w, overrides);
    }, delay);
  }

  let cachedScan: ReturnType<typeof scanAllApplications> | null = null;
  let cachedScanAt = 0;
  function getScan(force: boolean) {
    const now = Date.now();
    if (force || !cachedScan || now - cachedScanAt > 3000) {
      cachedScan = scanAllApplications();
      cachedScanAt = now;
    }
    return cachedScan;
  }

  function updateKpiLabels(w: SimpleWindow, k: LauncherKpis) {
    w.setValue("lbl_kpi_total", `⚡ Total Tools: ${k.total}`);
    w.setValue("lbl_kpi_studios", `🖥️ Studio Applications: ${k.radStudios}`);
    w.setValue("lbl_kpi_cli", `🛠️ CLI Utilities: ${k.cliTools}`);
    w.setValue("lbl_kpi_demos", `🎮 Showcase Demos: ${k.demos}`);
    w.setValue("lbl_kpi_running", `🟢 Active Running: ${k.running}`);
    w.setValue("lbl_kpi_favs", `⭐ Favorites: ${k.favorites}`);
  }

  function applyFilters(w: SimpleWindow, overrides?: { query?: string; cat?: string; appCat?: string }, forceScan = false) {
    try {
      applyFiltersInner(w, overrides, forceScan);
    } catch (err) {
      console.error("[Launcher] applyFilters failed:", err);
    }
  }

  function applyFiltersInner(w: SimpleWindow, overrides?: { query?: string; cat?: string; appCat?: string }, forceScan = false) {
    const rawQuery = overrides?.query !== undefined ? overrides.query : w.getValue("txt_search");
    const query = String(rawQuery ?? "").trim().toLowerCase();
    const rawCat = overrides?.cat !== undefined ? overrides.cat : w.getValue("dd_category");
    const catChoice = String(rawCat || "🌟 All Project Tools");
    const rawAppCat = overrides?.appCat !== undefined ? overrides.appCat : w.getValue("dd_app_category");
    const appCatChoice = String(rawAppCat || "📁 All Categories");
    const sortMode: SortMode = sortModeFromLabel(String(w.getValue("dd_sort") || SORT_LABELS.default));

    const fresh = getScan(forceScan);

    const scores = new Map<string, number>();
    currentApps = fresh.apps.filter((a) => {
      // 1. Source Scope / State filter (do not restrict source scope if a specific functional category is selected)
      const isSpecificCat = Boolean(appCatChoice && !appCatChoice.includes("All Categories"));
      if (!isSpecificCat) {
        if (catChoice.includes("Studio Applications") && a.source !== "rad_studio") return false;
        if (catChoice.includes("CLI Utilities") && a.source !== "cli_tool") return false;
        if (catChoice.includes("Showcase Demos") && a.source !== "rad_demo") return false;
      }
      if (catChoice.includes("Running Processes") && !a.isRunning) return false;
      if (catChoice.includes("Pinned Favorites") && !a.isFavorite) return false;
      if (catChoice.includes("Recently Used") && !a.lastLaunched) return false;

      // Allow direct functional category in catChoice if not a known scope
      if (
        !catChoice.includes("All Project Tools") &&
        !catChoice.includes("Pinned Favorites") &&
        !catChoice.includes("Studio Applications") &&
        !catChoice.includes("CLI Utilities") &&
        !catChoice.includes("Showcase Demos") &&
        !catChoice.includes("Running Processes") &&
        !catChoice.includes("Recently Used")
      ) {
        if (!matchAppCategory(a.category, catChoice)) return false;
      }

      // 2. Functional Category Filter (dd_app_category)
      // When category choice is "Pinned Favorites", do not filter out favorites by dd_app_category
      if (!catChoice.includes("Pinned Favorites")) {
        if (appCatChoice && !appCatChoice.includes("All Categories")) {
          if (!matchAppCategory(a.category, appCatChoice)) return false;
        }
      }

      // 3. Multi-word AND search over name, id, category, path, description and command
      const s = searchScore(a, query);
      scores.set(a.id, s);
      return s > 0;
    });

    // "Recently Used" implies newest first unless the user picked another order.
    const effectiveSort: SortMode = catChoice.includes("Recently Used") && sortMode === "default" ? "recent" : sortMode;
    currentApps = sortApps(currentApps, effectiveSort);
    // With a search query the best match comes first (stable, keeps the chosen order for ties).
    if (query && effectiveSort === "default") {
      currentApps = currentApps.map((a, i) => ({ a, i })).sort((x, y) => (scores.get(y.a.id)! - scores.get(x.a.id)!) || x.i - y.i).map((x) => x.a);
    }

    const rows = currentApps.map(formatRow);
    w.setTableData("tbl_apps", tableHeaders, rows);

    const filteredItems = currentApps.map(formatItemStr);
    w.setListItems("lst_apps", filteredItems);
    w.setListItems("dd_select_app", filteredItems);

    updateKpiLabels(w, fresh.kpis);
    const catNotice = appCatChoice && !appCatChoice.includes("All Categories")
      ? `  |  Category: ${appCatChoice.replace(/\s*\(\d+\)\s*$/, "")}`
      : "";
    w.setText(
      "lbl_status",
      `Filtered: ${currentApps.length} / ${fresh.apps.length} project tools${catNotice}  |  Studios: ${fresh.kpis.radStudios}  |  CLI: ${fresh.kpis.cliTools}  |  Favorites: ${fresh.kpis.favorites}`
    );

    // Stable selection resolution:
    // If selectedApp is still present in currentApps, keep it selected!
    // Otherwise fallback to currentApps[0].
    if (currentApps.length > 0) {
      const stillPresent = selectedApp ? currentApps.find((a) => a.id === selectedApp?.id) : null;
      selectedApp = stillPresent || currentApps[0]!;
      updateSelectedView(w, selectedApp);
    } else {
      selectedApp = null;
      w.setText("txt_output", "No project tools matched the specified search and category filter criteria.");
      w.setStatus("No tools match filter");
      w.evalJS(`
        (function() {
          window.selectedRowPid = "";
          const tbl = document.getElementById("tbl_apps");
          if (tbl) {
            tbl.querySelectorAll("tbody tr").forEach(tr => {
              tr.classList.remove("selected-tr");
              tr.style.background = "";
            });
          }
        })();
      `);
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Event Bindings
  // -----------------------------------------------------------------------------------------------

  win.onClick("btn_center", (w) => w.center());
  win.onClick("btn_fullscreen", (w) => w.toggleFullscreen());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Configuration saved successfully!");
  });

  win.onClick("btn_filter", (w) => applyFilters(w, undefined, true));
  win.onClick("btn_clear_filter", (w) => {
    w.setValue("txt_search", "");
    w.setValue("dd_category", "🌟 All Project Tools");
    w.setValue("dd_app_category", categoryDropdownOptions[0]);
    applyFilters(w, { query: "", cat: "🌟 All Project Tools", appCat: "📁 All Categories" }, true);
  });

  // Category Quick Filter Buttons
  const filterByAppCategory = (w: SimpleWindow, categorySearch: string) => {
    // 1. Clear search input so stray search terms don't hide category items
    w.setValue("txt_search", "");
    // 2. Always reset scope to All Project Tools when filtering by a specific category
    w.setValue("dd_category", "🌟 All Project Tools");
    // 3. Set category dropdown value
    const matching =
      categoryDropdownOptions.find((opt) => !opt.includes("All Categories") && matchAppCategory(categorySearch, opt)) ||
      categoryDropdownOptions.find((opt) => !opt.includes("All Categories") && opt.toLowerCase().includes(categorySearch.toLowerCase())) ||
      categorySearch;
    w.setValue("dd_app_category", matching);
    // 4. Apply filter immediately
    applyFilters(w, { query: "", cat: "🌟 All Project Tools", appCat: matching }, true);
    w.toast(`📂 Filtered to Category: ${categorySearch}`);
  };

  win.onClick("btn_cat_all", (w) => {
    w.setValue("dd_app_category", categoryDropdownOptions[0]);
    applyFilters(w, { appCat: "📁 All Categories" }, true);
    w.toast("📂 Showing All Categories");
  });
  win.onClick("btn_cat_db", (w) => filterByAppCategory(w, "Database & Storage"));
  win.onClick("btn_cat_devtools", (w) => filterByAppCategory(w, "Developer Tools"));
  win.onClick("btn_cat_system", (w) => filterByAppCategory(w, "System & Hardware"));
  win.onClick("btn_cat_files", (w) => filterByAppCategory(w, "File & Directory Tools"));
  win.onClick("btn_cat_network", (w) => filterByAppCategory(w, "Network & Cloud"));
  win.onClick("btn_cat_prod", (w) => filterByAppCategory(w, "Productivity & Text"));
  win.onClick("btn_cat_games", (w) => filterByAppCategory(w, "Games & Entertainment"));
  win.onClick("btn_cat_security", (w) => filterByAppCategory(w, "Security & Crypto"));
  win.onClick("btn_cat_design", (w) => filterByAppCategory(w, "Design"));
  win.onClick("btn_cat_demos", (w) => filterByAppCategory(w, "Demos & Templates"));
  win.onClick("btn_cat_cli", (w) => filterByAppCategory(w, "CLI Utilities"));

  // Quick Favorites Filter Action
  const filterToFavorites = (w: SimpleWindow) => {
    w.setValue("txt_search", "");
    w.setValue("dd_category", "⭐ Pinned Favorites");
    w.setValue("dd_app_category", "📁 All Categories");
    applyFilters(w, { query: "", cat: "⭐ Pinned Favorites", appCat: "📁 All Categories" }, true);
    const count = currentApps.length;
    if (count === 0) {
      w.toast("No favorites pinned yet! Select any tool and click '☆ Favorite' to pin it.");
    } else {
      w.toast(`⭐ Filtered to ${count} Pinned Favorite${count === 1 ? "" : "s"}`);
    }
  };
  win.onClick("btn_quick_favs", filterToFavorites);
  win.onClick("btn_quick_favs_filter", filterToFavorites);

  // Quick Launch Top Favorite Action
  let favLaunchCooldown = 0;
  win.onClick("btn_quick_launch_fav1", async (w) => {
    const now = Date.now();
    if (now - favLaunchCooldown < 800) return;
    favLaunchCooldown = now;
    const fresh = getScan(true);
    const favs = fresh.apps.filter((a) => a.isFavorite);
    let target = favs[0];
    if (!target) {
      // Auto-fallback: pick SQLite Studio, selectedApp, or first studio tool
      target = selectedApp || fresh.apps.find((a) => a.id === "rad_sqlite_studio") || fresh.apps.find((a) => a.source === "rad_studio") || fresh.apps[0];
      if (target) {
        toggleFavorite(target.id);
        target.isFavorite = true;
        fresh.kpis.favorites++;
        w.setValue("lbl_kpi_favs", `⭐ Favorites: ${fresh.kpis.favorites}`);
        w.toast(`⭐ Auto-pinned and launching: ${target.displayName}...`);
      } else {
        w.toast("No applications available to launch.");
        return;
      }
    } else {
      w.toast(`🚀 Launching top favorite: ${target.displayName}...`);
    }
    updateSelectedView(w, target);
    await executeToolLaunch(target, w, undefined, target.source === "cli_tool");
  });

  // Quick Favorite Star/Unstar Toggle
  const handleToggleFavorite = (w: SimpleWindow) => {
    if (!selectedApp) {
      const lstVal = w.getValue("lst_apps");
      const ddVal = w.getValue("dd_select_app");
      selectedApp = findAppFromSelection(lstVal) || findAppFromSelection(ddVal) || currentApps[0] || null;
    }
    if (!selectedApp) {
      w.toast("No tool selected to favorite.");
      return;
    }
    const isFav = toggleFavorite(selectedApp.id);
    selectedApp.isFavorite = isFav;
    w.toast(isFav ? `⭐ Favorited: ${selectedApp.displayName}` : `☆ Removed Favorite: ${selectedApp.displayName}`);

    const fresh = getScan(true);
    w.setValue("lbl_kpi_favs", `⭐ Favorites: ${fresh.kpis.favorites}`);

    updateSelectedView(w, selectedApp);
    applyFilters(w, undefined, true);
  };
  win.onClick("btn_fav", handleToggleFavorite);
  win.onClick("btn_quick_toggle_fav", handleToggleFavorite);

  // Real-time filter reactivity on input / dropdown change
  win.onEnter("txt_search", (w, val: any) => scheduleFilters(w, { query: typeof val === "string" ? val : undefined }, 0));
  win.onChange("txt_search", (w, val: any) => scheduleFilters(w, { query: typeof val === "string" ? val : undefined }));
  win.onChange("dd_category", (w, val: any) => {
    const selected = typeof val === "string" ? val : "";
    if (selected && selected.includes("Pinned Favorites")) {
      w.setValue("dd_app_category", "📁 All Categories");
      w.setValue("txt_search", "");
      scheduleFilters(w, { query: "", cat: "⭐ Pinned Favorites", appCat: "📁 All Categories" }, 0);
    } else {
      scheduleFilters(w, { cat: selected || undefined }, 0);
    }
  });
  win.onChange("dd_app_category", (w, val: any) => {
    const selected = typeof val === "string" ? val : "";
    if (selected && !selected.includes("All Categories")) {
      w.setValue("txt_search", "");
      w.setValue("dd_category", "🌟 All Project Tools");
      scheduleFilters(w, { query: "", cat: "🌟 All Project Tools", appCat: selected }, 0);
    } else {
      scheduleFilters(w, { appCat: selected }, 0);
    }
  });
  win.onChange("dd_sort", (w) => scheduleFilters(w, undefined, 0));

  win.onClick("btn_rescan", (w) => {
    applyFilters(w, undefined, true);
    const fresh = getScan(false);
    w.appendConsole("launcher_console", `[Rescan] Discovered ${fresh.kpis.total} project tools (${fresh.kpis.radStudios} Studios, ${fresh.kpis.cliTools} CLI tools, ${fresh.kpis.favorites} Favorites).\n`, 2);
    w.toast(`Rescanned: ${fresh.kpis.total} tools ready`);
  });

  // Open the tool's source in an editor
  win.onClick("btn_edit", (w) => {
    if (!selectedApp) { w.toast("No tool selected."); return; }
    const r = openInEditor(selectedApp.path);
    w.appendConsole("launcher_console", `[Open Source] ${selectedApp.displayPath}: ${r.message}\n`, r.success ? 1 : 3);
    w.toast(r.success ? `📝 ${r.message}` : `❌ ${r.message}`);
  });

  win.onClick("btn_copy_path", (w) => {
    if (!selectedApp) { w.toast("No tool selected."); return; }
    copyToClipboard(selectedApp.path);
    w.toast(`Copied: ${selectedApp.path}`);
  });

  win.onClick("btn_stop_all", async (w) => {
    const running = getScan(true).apps.filter((a) => a.isRunning);
    if (running.length === 0) { w.toast("Nothing is running."); return; }
    const ok = await w.confirm(`Stop ${running.length} running tool(s)?\n\n${running.map((a) => `• ${a.displayName}`).join("\n")}`);
    if (!ok) { w.appendConsole("launcher_console", "[Stop All] Cancelled.\n", 1); return; }
    const res = stopAllApplications();
    w.appendConsole("launcher_console", `[Stop All] Stopped ${res.stopped} of ${running.length}.\n${res.messages.map((m) => `  ${m}\n`).join("")}`, res.stopped ? 2 : 3);
    w.toast(`⏹ Stopped ${res.stopped} of ${running.length}`);
    setTimeout(() => applyFilters(w, undefined, true), 600);
  });

  win.onClick("btn_clear_history", async (w) => {
    const ok = await w.confirm("Clear launch counts and last-used times for every tool? Favorites are kept.");
    if (!ok) return;
    clearLaunchHistory();
    w.appendConsole("launcher_console", "[History] Usage history cleared.\n", 2);
    w.toast("Usage history cleared");
    applyFilters(w, undefined, true);
  });

  // ListBox selection change and click
  win.onChange("lst_apps", (w, val: any) => {
    const matched = findAppFromSelection(val);
    if (matched) {
      selectedApp = matched;
      updateSelectedView(w, matched);
    }
  });

  win.onClick("lst_apps", (w, val: any) => {
    const matched = findAppFromSelection(val);
    if (matched) {
      selectedApp = matched;
      updateSelectedView(w, matched);
    }
  });

  const autoLaunchFromSelection = (w: SimpleWindow, val: any) => {
    const matched = findAppFromSelection(val) || selectedApp;
    if (matched) {
      selectedApp = matched;
      updateSelectedView(w, matched);
      w.toast(`🚀 Auto-launching: ${matched.displayName}...`);
      executeToolLaunch(matched, w, undefined, matched.source === "cli_tool");
    }
  };

  win.onDoubleClick("lst_apps", autoLaunchFromSelection);
  win.onEnter("lst_apps", autoLaunchFromSelection);
  win.on("lst_apps", "enter", autoLaunchFromSelection);
  win.on("lst_apps", "onEnter", autoLaunchFromSelection);

  // Table selection change and click
  win.onClick("tbl_apps", (w, val: any) => {
    const matched = currentApps.find((a) => a.id === String(val).trim()) || findAppFromSelection(val);
    if (matched) {
      selectedApp = matched;
      updateSelectedView(w, matched);
    }
  });

  win.onChange("tbl_apps", (w, val: any) => {
    const matched = currentApps.find((a) => a.id === String(val).trim()) || findAppFromSelection(val);
    if (matched) {
      selectedApp = matched;
      updateSelectedView(w, matched);
    }
  });

  win.onDoubleClick("tbl_apps", (w, val: any) => {
    const rawVal = String(val || "").trim();
    const matched = currentApps.find((a) => a.id === rawVal) || findAppFromSelection(rawVal) || selectedApp;
    if (matched) {
      selectedApp = matched;
      updateSelectedView(w, matched);
      w.toast(`🚀 Auto-launching: ${matched.displayName}...`);
      executeToolLaunch(matched, w, undefined, matched.source === "cli_tool");
    }
  });

  // Dropdown selection change
  win.onChange("dd_select_app", (w, val: any) => {
    const matched = findAppFromSelection(val);
    if (matched) {
      selectedApp = matched;
      updateSelectedView(w, matched);
    }
  });

  // Primary Launch Button
  win.onClick("btn_launch", (w) => {
    if (!selectedApp) {
      const lstVal = w.getValue("lst_apps");
      const ddVal = w.getValue("dd_select_app");
      selectedApp = findAppFromSelection(lstVal) || findAppFromSelection(ddVal) || currentApps[0] || null;
    }
    if (!selectedApp) {
      w.toast("Please select a tool to launch.");
      return;
    }
    executeToolLaunch(selectedApp, w, undefined, selectedApp.source === "cli_tool");
  });

  // Dedicated Open in Terminal Button
  win.onClick("btn_terminal", (w) => {
    if (!selectedApp) {
      const lstVal = w.getValue("lst_apps");
      const ddVal = w.getValue("dd_select_app");
      selectedApp = findAppFromSelection(lstVal) || findAppFromSelection(ddVal) || currentApps[0] || null;
    }
    if (!selectedApp) {
      w.toast("Please select a tool to launch.");
      return;
    }
    executeToolLaunch(selectedApp, w, undefined, true);
  });

  // Dedicated Run Inline Button
  win.onClick("btn_run_inline", (w) => {
    if (!selectedApp) {
      const lstVal = w.getValue("lst_apps");
      const ddVal = w.getValue("dd_select_app");
      selectedApp = findAppFromSelection(lstVal) || findAppFromSelection(ddVal) || currentApps[0] || null;
    }
    if (!selectedApp) {
      w.toast("Please select a tool to run.");
      return;
    }
    executeToolLaunch(selectedApp, w, undefined, false);
  });

  // Kill Button
  win.onClick("btn_kill", (w) => {
    if (!selectedApp) {
      const lstVal = w.getValue("lst_apps");
      const ddVal = w.getValue("dd_select_app");
      selectedApp = findAppFromSelection(lstVal) || findAppFromSelection(ddVal) || null;
    }
    if (!selectedApp) {
      w.toast("No tool selected.");
      return;
    }
    const res = killApplication(selectedApp.id, selectedApp.pid);
    if (res.success) {
      w.appendConsole("launcher_console", `[Process Terminated] ${res.message}\n`, 3);
      w.toast(`🛑 ${res.message}`);
      setTimeout(() => applyFilters(w, undefined, true), 600);
    } else {
      w.toast(`❌ ${res.message}`);
    }
  });

  // Reveal Button
  win.onClick("btn_reveal", (w) => {
    if (!selectedApp) {
      const lstVal = w.getValue("lst_apps");
      const ddVal = w.getValue("dd_select_app");
      selectedApp = findAppFromSelection(lstVal) || findAppFromSelection(ddVal) || null;
    }
    if (!selectedApp) {
      w.toast("No tool selected.");
      return;
    }
    revealInFinder(selectedApp.path);
    w.appendConsole("launcher_console", `[Reveal] Revealed in Finder: ${selectedApp.path}\n`, 1);
    w.toast(`Revealed: ${selectedApp.displayName}`);
  });

  // Copy Command Button
  win.onClick("btn_copy", (w) => {
    if (!selectedApp) {
      const lstVal = w.getValue("lst_apps");
      const ddVal = w.getValue("dd_select_app");
      selectedApp = findAppFromSelection(lstVal) || findAppFromSelection(ddVal) || null;
    }
    if (!selectedApp) {
      w.toast("No tool selected.");
      return;
    }
    const args = (w.getValue("txt_cli_args") || "").trim();
    const cmd = args ? `${selectedApp.command} ${args}` : selectedApp.command;
    copyToClipboard(cmd);
    w.toast(`Copied: ${cmd}`);
  });

  // Quick Launch Handlers for Common Studios
  const bindQuick = (btnId: string, appId: string, defaultArgs = "", inTerminal?: boolean) => {
    win.onClick(btnId, (w) => {
      const fresh = scanAllApplications();
      const lower = appId.toLowerCase();
      const app =
        currentApps.find(
          (a) =>
            a.id.toLowerCase() === `rad_${lower}` ||
            a.id.toLowerCase() === `cli_${lower}` ||
            a.name.toLowerCase() === lower ||
            a.id.toLowerCase() === lower
        ) ||
        fresh.apps.find(
          (a) =>
            a.id.toLowerCase() === `rad_${lower}` ||
            a.id.toLowerCase() === `cli_${lower}` ||
            a.name.toLowerCase() === lower ||
            a.id.toLowerCase() === lower
        ) ||
        currentApps.find((a) => a.id.toLowerCase().includes(lower)) ||
        fresh.apps.find((a) => a.id.toLowerCase().includes(lower));

      if (app) {
        updateSelectedView(w, app);
        if (defaultArgs) {
          w.setValue("txt_cli_args", defaultArgs);
        }
        executeToolLaunch(app, w, defaultArgs, inTerminal);
      } else {
        w.toast(`Tool '${appId}' not found.`);
      }
    });
  };

  bindQuick("btn_quick_sqlite", "sqlite_studio");
  bindQuick("btn_quick_redis", "redis_studio");
  bindQuick("btn_quick_api", "api_studio");
  bindQuick("btn_quick_task", "task_manager");
  bindQuick("btn_quick_bundler", "app_bundler_studio");
  bindQuick("btn_quick_code", "code_studio");
  bindQuick("btn_quick_env", "env_studio");
  bindQuick("btn_quick_ipinfo", "ipinfo_studio");

  bindQuick("btn_quick_interval", "interval_timer_studio");
  bindQuick("btn_quick_drcodecaine", "dr_codecaine_studio");
  bindQuick("btn_quick_lolo", "lolo_studio");
  bindQuick("btn_quick_tetris", "tetris_studio");
  bindQuick("btn_quick_rad", "rad_studio");
  bindQuick("btn_quick_calc", "calculator_studio");
  bindQuick("btn_quick_markdown", "markdown_studio");
  bindQuick("btn_quick_paint", "paint_studio");

  // GUI Studio Versions of CLI Tools
  bindQuick("btn_quick_system", "system_studio");
  bindQuick("btn_quick_db", "database_studio");
  bindQuick("btn_quick_database", "database_studio");
  bindQuick("btn_quick_fd", "fd_studio");
  bindQuick("btn_quick_git", "git_studio");
  bindQuick("btn_quick_tokei", "tokei_studio");
  bindQuick("btn_quick_gdu", "gdu_studio");
  bindQuick("btn_quick_network", "network_studio");
  bindQuick("btn_quick_crypto", "crypto_studio");

  // Terminal CLI Tools Companion
  bindQuick("btn_quick_sys_cli", "system_cli", "--telemetry", true);
  bindQuick("btn_quick_db_cli", "database_cli", "--help", true);
  bindQuick("btn_quick_fd_cli", "fd_cli", "--help", true);
  bindQuick("btn_quick_git_cli", "git_cli", "--help", true);
  bindQuick("btn_quick_tokei_cli", "tokei_cli", "--help", true);
  bindQuick("btn_quick_gdu_cli", "gdu_cli", "--help", true);
  bindQuick("btn_quick_net_cli", "network_cli", "--help", true);
  bindQuick("btn_quick_crypto_cli", "crypto_cli", "--help", true);
  // Client-side DOM reactive filtering for instant 0ms responses across all browser & webview runtimes
  const appsJsonData = JSON.stringify(
    initialData.apps.map((a) => ({
      id: a.id,
      name: a.displayName,
      cat: a.category,
      icon: a.icon || "⚡",
      sourceLabel: a.sourceLabel,
      path: a.displayPath,
      cmd: a.command,
      fav: a.isFavorite ? "⭐ Fav" : "☆ Regular",
      isFav: Boolean(a.isFavorite),
      status: a.isRunning
        ? (a.instanceCount && a.instanceCount > 1 ? `🟢 Running (${a.instanceCount}x)` : `🟢 Running (#${a.pid || "?"})`)
        : "⚪ Ready",
      used: a.launchCount ? usageLabel(a) : "0× (Never)",
      itemStr: formatItemStr(a),
    }))
  );

  win.addScript(`
    (function initClientCategoryFilter() {
      const ALL_APPS = ${appsJsonData};

      function matchesCat(appCat, targetChoice) {
        if (!targetChoice || targetChoice.includes("All Categories") || targetChoice.includes("All Tools")) return true;
        const cTarget = targetChoice.toLowerCase();
        const cl = (appCat || "").toLowerCase();
        if ((cTarget.includes("game") || cTarget.includes("arcade")) && cl.includes("game")) return true;
        if ((cTarget.includes("db") || cTarget.includes("database") || cTarget.includes("storage")) && cl.includes("database")) return true;
        if ((cTarget.includes("dev") || cTarget.includes("developer")) && cl.includes("developer")) return true;
        if ((cTarget.includes("sys") || cTarget.includes("system") || cTarget.includes("hardware")) && cl.includes("system")) return true;
        if (cTarget.includes("file") && cl.includes("file")) return true;
        if (cTarget.includes("net") && cl.includes("network")) return true;
        if (cTarget.includes("prod") && cl.includes("productivity")) return true;
        if (cTarget.includes("sec") && cl.includes("security")) return true;
        if (cTarget.includes("design") && cl.includes("design")) return true;
        if (cTarget.includes("demo") && cl.includes("demo")) return true;
        if (cTarget.includes("cli") && cl.includes("cli")) return true;
        if (cTarget.includes("rad") && cl.includes("rad")) return true;
        return cl.includes(cTarget) || cTarget.includes(cl);
      }

      function selectAppClient(appId) {
        window.selectedRowPid = appId;
        const app = ALL_APPS.find(a => a.id === appId);
        if (!app) return;

        // 1. Sync Table Row Highlight
        const tbl = document.getElementById("tbl_apps");
        if (tbl) {
          tbl.querySelectorAll("tbody tr").forEach(tr => {
            if (tr.getAttribute("data-pid") === appId) {
              tr.classList.add("selected-tr");
              tr.style.background = "rgba(56,189,248,0.22)";
              tr.scrollIntoView({ block: "nearest", behavior: "smooth" });
            } else {
              tr.classList.remove("selected-tr");
              tr.style.background = "";
            }
          });
        }

        // 2. Sync ListBox
        const lstEl = document.getElementById("lst_apps");
        if (lstEl) {
          const sel = lstEl.tagName === "SELECT" ? lstEl : lstEl.querySelector("select");
          if (sel) {
            for (let i = 0; i < sel.options.length; i++) {
              if (sel.options[i].value === app.itemStr || sel.options[i].text === app.itemStr || sel.options[i].value.includes(appId)) {
                sel.selectedIndex = i;
                break;
              }
            }
          }
        }

        // 3. Sync Dropdown
        const ddSelEl = document.getElementById("dd_select_app");
        if (ddSelEl) {
          const sel = ddSelEl.tagName === "SELECT" ? ddSelEl : ddSelEl.querySelector("select");
          if (sel) {
            for (let i = 0; i < sel.options.length; i++) {
              if (sel.options[i].value === app.itemStr || sel.options[i].text === app.itemStr || sel.options[i].value.includes(appId)) {
                sel.selectedIndex = i;
                break;
              }
            }
          }
        }

        // 4. Sync Output Box
        const out = document.getElementById("txt_output");
        if (out) {
          out.value = [
            "=== Tool Selected: " + app.name + " ===",
            "ID:          " + app.id,
            "Type:        " + app.sourceLabel,
            "Category:    " + app.cat,
            "Script Path: " + app.path,
            "Run Command: " + app.cmd,
            "Status:      " + app.status,
            "Favorite:    " + (app.isFav ? "Yes (★ Pinned Favorite)" : "No (☆ Not Pinned)"),
          ].join("\\n");
        }

        // 5. Sync Favorite Buttons
        const favBtn = document.getElementById("btn_fav");
        if (favBtn) favBtn.textContent = app.isFav ? "★ Unfavorite" : "☆ Favorite";
        const quickFavBtn = document.getElementById("btn_quick_toggle_fav");
        if (quickFavBtn) quickFavBtn.textContent = app.isFav ? "⭐ Unpin Favorite" : "⭐ Pin Favorite";
      }

      function runClientFilter(catName) {
        const searchInput = document.getElementById("txt_search");
        const ddAppCat = document.getElementById("dd_app_category");
        const ddCat = document.getElementById("dd_category");
        const statusEl = document.getElementById("lbl_status");
        const q = searchInput ? (searchInput.value || "").trim().toLowerCase() : "";
        const isFavFilter = Boolean(catName && (catName.includes("Favorite") || catName.includes("Fav")));
        const isAll = !isFavFilter && (!catName || catName.includes("All Categories") || catName.includes("All Tools"));

        const matched = ALL_APPS.filter(a => {
          if (isFavFilter) {
            if (!a.isFav && !a.fav.includes("Fav")) return false;
          } else if (!isAll && !matchesCat(a.cat, catName)) {
            return false;
          }
          if (q) {
            const hit = a.name.toLowerCase().includes(q) ||
                        a.id.toLowerCase().includes(q) ||
                        a.cat.toLowerCase().includes(q) ||
                        a.cmd.toLowerCase().includes(q) ||
                        a.path.toLowerCase().includes(q);
            if (!hit) return false;
          }
          return true;
        });

        // 1. Update Table (tbl_apps)
        const tbl = document.getElementById("tbl_apps");
        if (tbl) {
          const tbody = tbl.querySelector("tbody");
          if (tbody) {
            tbody.innerHTML = matched.map((a, idx) =>
              '<tr data-pid="' + a.id + '" data-row-index="' + idx + '" class="' + (idx === 0 ? 'selected-tr' : '') + '">' +
                '<td>' + a.id + '</td>' +
                '<td>' + a.fav + '</td>' +
                '<td>' + a.sourceLabel + '</td>' +
                '<td>' + a.icon + ' ' + a.name + '</td>' +
                '<td>' + a.cat + '</td>' +
                '<td>' + a.status + '</td>' +
                '<td>' + a.used + '</td>' +
                '<td style="font-family:monospace;font-size:11px;">' + a.cmd + '</td>' +
              '</tr>'
            ).join('');
          }
        }

        // 2. Update ListBox (lst_apps)
        const lstEl = document.getElementById("lst_apps");
        if (lstEl) {
          const sel = lstEl.tagName === "SELECT" ? lstEl : lstEl.querySelector("select");
          if (sel) {
            sel.innerHTML = matched.map(a => '<option value="' + a.itemStr.replace(/"/g, '&quot;') + '">' + a.itemStr + '</option>').join('');
            if (matched.length > 0) sel.value = matched[0].itemStr;
          }
        }

        // 3. Update Dropdown (dd_select_app)
        const ddSelEl = document.getElementById("dd_select_app");
        if (ddSelEl) {
          const sel = ddSelEl.tagName === "SELECT" ? ddSelEl : ddSelEl.querySelector("select");
          if (sel) {
            sel.innerHTML = matched.map(a => '<option value="' + a.itemStr.replace(/"/g, '&quot;') + '">' + a.itemStr + '</option>').join('');
            if (matched.length > 0) sel.value = matched[0].itemStr;
          }
        }

        // 4. Update Status Label
        if (statusEl) {
          const catLabel = isFavFilter ? "⭐ Pinned Favorites" : (isAll ? "All Categories" : catName);
          statusEl.textContent = "Filtered: " + matched.length + " / " + ALL_APPS.length + " project tools  |  Category: " + catLabel;
        }

        // 5. Synchronize Dropdown selections
        if (isFavFilter) {
          if (ddCat) {
            const sel = ddCat.tagName === "SELECT" ? ddCat : ddCat.querySelector("select");
            if (sel) {
              for (let i = 0; i < sel.options.length; i++) {
                if (sel.options[i].text.includes("Pinned Favorites") || sel.options[i].value.includes("Pinned Favorites")) {
                  sel.selectedIndex = i;
                  break;
                }
              }
            }
          }
          if (ddAppCat) {
            const sel = ddAppCat.tagName === "SELECT" ? ddAppCat : ddAppCat.querySelector("select");
            if (sel) sel.selectedIndex = 0;
          }
        } else if (ddAppCat) {
          const sel = ddAppCat.tagName === "SELECT" ? ddAppCat : ddAppCat.querySelector("select");
          if (sel) {
            for (let i = 0; i < sel.options.length; i++) {
              if (matchesCat(sel.options[i].text, catName) || (isAll && i === 0)) {
                sel.selectedIndex = i;
                break;
              }
            }
          }
        }

        // 6. Select first matched tool
        if (matched.length > 0) {
          selectAppClient(matched[0].id);
        }
      }

      window.filterByCategoryClient = runClientFilter;
      window.selectAppClient = selectAppClient;

      function bindListeners() {
        const catMap = {
          btn_cat_all: "All Categories",
          btn_cat_db: "Database & Storage",
          btn_cat_devtools: "Developer Tools",
          btn_cat_system: "System & Hardware",
          btn_cat_files: "File & Directory Tools",
          btn_cat_network: "Network & Cloud",
          btn_cat_prod: "Productivity & Text",
          btn_cat_games: "Games & Entertainment",
          btn_cat_security: "Security & Crypto",
          btn_cat_design: "Design",
          btn_cat_demos: "Demos & Templates",
          btn_cat_cli: "CLI Utilities",
        };

        for (const [id, catName] of Object.entries(catMap)) {
          const btn = document.getElementById(id);
          if (btn && !btn.dataset.clientFilterBound) {
            btn.dataset.clientFilterBound = "true";
            btn.addEventListener("click", function() {
              const searchInput = document.getElementById("txt_search");
              if (searchInput) searchInput.value = "";
              const ddCat = document.getElementById("dd_category");
              if (ddCat) {
                const s = ddCat.tagName === "SELECT" ? ddCat : ddCat.querySelector("select");
                if (s) s.selectedIndex = 0;
              }
              runClientFilter(catName);
            });
          }
        }

        // Favorites filter buttons
        function filterFavs() {
          const searchInput = document.getElementById("txt_search");
          if (searchInput) searchInput.value = "";
          runClientFilter("Favorites");
        }

        const btnFavsFilter = document.getElementById("btn_quick_favs_filter");
        if (btnFavsFilter && !btnFavsFilter.dataset.clientFilterBound) {
          btnFavsFilter.dataset.clientFilterBound = "true";
          btnFavsFilter.addEventListener("click", filterFavs);
        }

        const btnFavs = document.getElementById("btn_quick_favs");
        if (btnFavs && !btnFavs.dataset.clientFilterBound) {
          btnFavs.dataset.clientFilterBound = "true";
          btnFavs.addEventListener("click", filterFavs);
        }

        // Launch Top Favorite
        const btnLaunchFav1 = document.getElementById("btn_quick_launch_fav1");
        if (btnLaunchFav1 && !btnLaunchFav1.dataset.clientLaunchBound) {
          btnLaunchFav1.dataset.clientLaunchBound = "true";
          btnLaunchFav1.addEventListener("click", function() {
            const fav = ALL_APPS.find(a => a.isFav || a.fav.includes("Fav")) || ALL_APPS[0];
            if (fav) {
              selectAppClient(fav.id);
              const statusEl = document.getElementById("lbl_status");
              if (statusEl) statusEl.textContent = "🚀 Launching Top Favorite: " + fav.name + "...";
              const out = document.getElementById("txt_output");
              if (out) {
                out.value = "=== Top Favorite Selected & Launching ===\\nName: " + fav.name + "\\nID: " + fav.id + "\\nCommand: " + fav.cmd + "\\nPath: " + fav.path + "\\nStatus: 🚀 Executing launch...";
              }
            }
          });
        }

        // Toggle Favorite
        function toggleFavClient() {
          const activePid = window.selectedRowPid;
          const app = ALL_APPS.find(a => a.id === activePid) || ALL_APPS[0];
          if (!app) return;
          app.isFav = !app.isFav;
          app.fav = app.isFav ? "⭐ Fav" : "☆ Regular";
          selectAppClient(app.id);
          const tbl = document.getElementById("tbl_apps");
          if (tbl) {
            const row = tbl.querySelector('tr[data-pid="' + app.id + '"]');
            if (row && row.children[1]) {
              row.children[1].textContent = app.fav;
            }
          }
        }

        const btnToggleFav = document.getElementById("btn_quick_toggle_fav");
        if (btnToggleFav && !btnToggleFav.dataset.clientToggleBound) {
          btnToggleFav.dataset.clientToggleBound = "true";
          btnToggleFav.addEventListener("click", toggleFavClient);
        }

        const btnFav = document.getElementById("btn_fav");
        if (btnFav && !btnFav.dataset.clientToggleBound) {
          btnFav.dataset.clientToggleBound = "true";
          btnFav.addEventListener("click", toggleFavClient);
        }

        // Category dropdown
        const ddAppCat = document.getElementById("dd_app_category");
        if (ddAppCat && !ddAppCat.dataset.clientFilterBound) {
          ddAppCat.dataset.clientFilterBound = "true";
          const sel = ddAppCat.tagName === "SELECT" ? ddAppCat : ddAppCat.querySelector("select");
          if (sel) {
            sel.addEventListener("change", function() {
              const searchInput = document.getElementById("txt_search");
              if (searchInput && this.value && !this.value.includes("All Categories")) {
                searchInput.value = "";
              }
              const ddCat = document.getElementById("dd_category");
              if (ddCat && this.value && !this.value.includes("All Categories")) {
                const s = ddCat.tagName === "SELECT" ? ddCat : ddCat.querySelector("select");
                if (s) s.selectedIndex = 0;
              }
              runClientFilter(this.value);
            });
          }
        }

        // Scope dropdown
        const ddCat = document.getElementById("dd_category");
        if (ddCat && !ddCat.dataset.clientFilterBound) {
          ddCat.dataset.clientFilterBound = "true";
          const sel = ddCat.tagName === "SELECT" ? ddCat : ddCat.querySelector("select");
          if (sel) {
            sel.addEventListener("change", function() {
              if (this.value && this.value.includes("Pinned Favorites")) {
                runClientFilter("Favorites");
              } else if (this.value && this.value.includes("All Project Tools")) {
                runClientFilter("All Categories");
              }
            });
          }
        }

        // Clear filter button
        const clearBtn = document.getElementById("btn_clear_filter");
        if (clearBtn && !clearBtn.dataset.clientFilterBound) {
          clearBtn.dataset.clientFilterBound = "true";
          clearBtn.addEventListener("click", function() {
            const searchInput = document.getElementById("txt_search");
            if (searchInput) searchInput.value = "";
            const ddCatEl = document.getElementById("dd_category");
            if (ddCatEl) {
              const s = ddCatEl.tagName === "SELECT" ? ddCatEl : ddCatEl.querySelector("select");
              if (s) s.selectedIndex = 0;
            }
            runClientFilter("All Categories");
          });
        }

        // Table row click delegation
        const tblContainer = document.getElementById("tbl_apps");
        if (tblContainer && !tblContainer.dataset.rowClickBound) {
          tblContainer.dataset.rowClickBound = "true";
          tblContainer.addEventListener("click", function(e) {
            const tr = e.target.closest("tr");
            if (tr && tr.dataset.pid) {
              selectAppClient(tr.dataset.pid);
            }
          });
        }

        // Listbox change delegation
        const lstEl = document.getElementById("lst_apps");
        if (lstEl && !lstEl.dataset.changeBound) {
          lstEl.dataset.changeBound = "true";
          const sel = lstEl.tagName === "SELECT" ? lstEl : lstEl.querySelector("select");
          if (sel) {
            sel.addEventListener("change", function() {
              const val = this.value;
              const app = ALL_APPS.find(a => a.itemStr === val || val.includes(a.id));
              if (app) selectAppClient(app.id);
            });
          }
        }

        // Listbox Return/Enter key launch delegation
        if (lstEl && !lstEl.dataset.keyEnterBound) {
          lstEl.dataset.keyEnterBound = "true";
          const sel = lstEl.tagName === "SELECT" ? lstEl : lstEl.querySelector("select");
          const target = sel || lstEl;
          let lastEnterKeyTime = 0;

          const handleListboxEnter = function(e) {
            if (e.key === "Enter" || e.keyCode === 13) {
              const now = Date.now();
              if (now - lastEnterKeyTime < 600) return;
              lastEnterKeyTime = now;
              e.preventDefault();
              e.stopPropagation();

              const val = target.value || (sel ? sel.value : "") || "";
              const app = ALL_APPS.find(a => a.itemStr === val || val.includes(a.id)) ||
                          ALL_APPS.find(a => a.id === window.selectedRowPid) ||
                          ALL_APPS[0];
              if (app) {
                selectAppClient(app.id);
                const statusEl = document.getElementById("lbl_status");
                if (statusEl) statusEl.textContent = "🚀 Launching: " + app.name + "...";
                const out = document.getElementById("txt_output");
                if (out) {
                  out.value = "=== Application Launch Dispatched (Return Key) ===\\nName: " + app.name + "\\nID: " + app.id + "\\nCommand: " + app.cmd + "\\nPath: " + app.path + "\\nStatus: 🚀 Executing launch...";
                }
              }
              if (typeof window.on_lst_apps_enter === "function") {
                window.on_lst_apps_enter(val);
              } else if (typeof window.on_lst_apps_doubleclick === "function") {
                window.on_lst_apps_doubleclick(val);
              } else {
                const btnLaunch = document.getElementById("btn_launch");
                if (btnLaunch) btnLaunch.click();
              }
            }
          };

          target.addEventListener("keydown", handleListboxEnter);
          if (sel && sel !== lstEl) {
            lstEl.addEventListener("keydown", handleListboxEnter);
          }
        }
      }

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindListeners);
      } else {
        bindListeners();
        setTimeout(bindListeners, 250);
      }
    })();
  `);

  return win;
}

// -------------------------------------------------------------------------------------------------
// CLI / Main Entrypoint
// -------------------------------------------------------------------------------------------------

if (import.meta.main) {
  console.log("⚡ Launching Project Application & CLI Workstation Launcher...");
  const win = createLauncherStudio({ fullscreen: true });
  win.run();
}
