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
import { resolve, join, basename } from "path";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";

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

const HISTORY_FILE = resolve(process.cwd(), ".launcher_history.json");

export function loadHistory(): HistoryData {
  try {
    if (existsSync(HISTORY_FILE)) {
      const content = readFileSync(HISTORY_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch {}
  return { favorites: [], launchHistory: {} };
}

export function saveHistory(data: HistoryData): void {
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
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

const ACTIVE_CHILD_PROCESSES: Map<string, { pid: number; appName: string; startedAt: number }> =
  new Map();

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
            f !== "launcher_studio.ts"
        )
        .sort();

      for (const file of files) {
        const fullPath = join(appsDir, file);
        const relPath = `./applications/${file}`;
        const meta = deriveAppMetadata(relPath);
        const id = `rad_${meta.name}`;

        const child = ACTIVE_CHILD_PROCESSES.get(id);
        let isRunning = false;
        let pid: number | undefined = undefined;

        if (child) {
          isRunning = true;
          pid = child.pid;
        } else {
          const matchedProc = runningProcs.find(
            (p) => p.args.includes(file) || p.args.includes(relPath)
          );
          if (matchedProc) {
            isRunning = true;
            pid = matchedProc.pid;
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

        const child = ACTIVE_CHILD_PROCESSES.get(id);
        let isRunning = false;
        let pid: number | undefined = undefined;

        if (child) {
          isRunning = true;
          pid = child.pid;
        } else {
          const matchedProc = runningProcs.find(
            (p) => p.args.includes(file) || p.args.includes(relPath)
          );
          if (matchedProc) {
            isRunning = true;
            pid = matchedProc.pid;
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

        const child = ACTIVE_CHILD_PROCESSES.get(id);
        let isRunning = false;
        let pid: number | undefined = undefined;

        if (child) {
          isRunning = true;
          pid = child.pid;
        } else {
          const matchedProc = runningProcs.find(
            (p) => p.args.includes(file) || p.args.includes(relPath)
          );
          if (matchedProc) {
            isRunning = true;
            pid = matchedProc.pid;
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
 * Spawns an interactive Terminal window on the user's desktop running the given command
 */
export function launchInTerminal(
  command: string,
  cwd = process.cwd()
): { success: boolean; message: string } {
  try {
    if (process.platform === "darwin") {
      const cleanCmd = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const cleanCwd = cwd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script = `tell application "Terminal" to activate\ntell application "Terminal" to do script "cd \\"${cleanCwd}\\" && ${cleanCmd}"`;
      const proc = Bun.spawnSync(["osascript", "-e", script]);
      if (proc.exitCode === 0) {
        return { success: true, message: `Opened CLI in macOS Terminal: ${command}` };
      }
    } else if (process.platform === "win32") {
      Bun.spawn(["cmd.exe", "/c", "start", "cmd.exe", "/k", command], { cwd, detached: true });
      return { success: true, message: `Opened CLI in Command Prompt: ${command}` };
    } else {
      Bun.spawn(["x-terminal-emulator", "-e", command], { cwd, detached: true });
      return { success: true, message: `Opened CLI in Terminal: ${command}` };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
  return { success: false, message: `Terminal launch not supported on ${process.platform}` };
}

export async function launchApplication(
  appId: string,
  extraArgs = "",
  options: { openTerminal?: boolean; timeoutMs?: number } = {}
): Promise<{
  success: boolean;
  message: string;
  output?: string;
  pid?: number;
}> {
  const { apps } = scanAllApplications();
  const lowerTarget = appId.toLowerCase();
  const app = apps.find(
    (a) =>
      a.id.toLowerCase() === lowerTarget ||
      a.name.toLowerCase() === lowerTarget ||
      a.displayName.toLowerCase() === lowerTarget ||
      a.id.toLowerCase().includes(lowerTarget) ||
      a.name.toLowerCase().includes(lowerTarget) ||
      a.displayName.toLowerCase().includes(lowerTarget)
  );

  if (!app) {
    return { success: false, message: `Tool '${appId}' not found in project.` };
  }

  recordLaunch(app.id);

  try {
    if (app.source === "rad_studio" || app.source === "rad_demo") {
      // Launch GUI Studio application in independent detached process
      const proc = Bun.spawn(["bun", "run", app.path], {
        stdout: "ignore",
        stderr: "ignore",
        detached: true,
        cwd: process.cwd(),
        env: process.env,
      });

      proc.unref();

      const pid = proc.pid;
      ACTIVE_CHILD_PROCESSES.set(app.id, {
        pid,
        appName: app.displayName,
        startedAt: Date.now(),
      });

      return {
        success: true,
        message: `Started ${app.displayName} GUI (PID: ${pid})`,
        pid,
      };
    } else {
      // CLI Tool Execution
      const splitArgs = extraArgs.trim() ? extraArgs.trim().split(/\s+/) : ["--help"];
      const fullCmd = ["bun", "run", app.path, ...splitArgs];
      const fullCmdStr = fullCmd.join(" ");

      if (options.openTerminal) {
        const termRes = launchInTerminal(fullCmdStr);
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
        env: process.env,
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
  let targetPid = pid;

  if (!targetPid) {
    const child = ACTIVE_CHILD_PROCESSES.get(appId);
    if (child) targetPid = child.pid;
  }

  if (!targetPid) {
    const { apps } = scanAllApplications();
    const app = apps.find((a) => a.id === appId || a.name === appId);
    if (app && app.pid) targetPid = app.pid;
  }

  if (!targetPid) {
    return { success: false, message: "No active PID found for tool." };
  }

  try {
    process.kill(targetPid, "SIGTERM");
    ACTIVE_CHILD_PROCESSES.delete(appId);
    return { success: true, message: `Terminated process PID ${targetPid}.` };
  } catch (err: any) {
    try {
      process.kill(targetPid, "SIGKILL");
      ACTIVE_CHILD_PROCESSES.delete(appId);
      return { success: true, message: `Force-killed process PID ${targetPid}.` };
    } catch (e2: any) {
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
      Bun.spawn(["explorer", `/select,${filePath}`]);
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
  try {
    if (process.platform === "darwin") {
      const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
      proc.stdin.write(text);
      proc.stdin.end();
      return { success: true };
    }
  } catch {}
  return { success: false };
}

// -------------------------------------------------------------------------------------------------
// Primary SimpleGUI Desktop Application Window
// -------------------------------------------------------------------------------------------------

export function createLauncherStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const fullscreen = options.fullscreen ?? true;
  const initialData = scanAllApplications();
  let currentApps = initialData.apps;
  let selectedApp: DetectedApp | null = currentApps[0] || null;

  const win = newSimpleWindow(
    "Project Application & CLI Launcher Pro -- Bun RAD Studio",
    1240,
    980,
    {
      appId: "launcher_studio",
      theme: options.theme || getSavedTheme() || "midnight",
      autoSaveState: true,
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
  win.endRow();
  win.endGroupBox();

  // 3. 1-Click Quick Launch Toolbar for Popular Tools
  win.beginGroupBox("⚡ 1-Click Quick Launch: Popular Project Studios & CLI Tools");
  win.beginRow();
  win.addButton("btn_quick_sqlite", "🗄️ SQLite Studio");
  win.addButton("btn_quick_redis", "⚡ Redis Studio");
  win.addButton("btn_quick_system", "🖥️ System Studio");
  win.addButton("btn_quick_fd", "🔍 Fd Studio");
  win.addButton("btn_quick_git", "🌿 Git Studio");
  win.addButton("btn_quick_api", "📡 API Studio");
  win.addButton("btn_quick_task", "📊 Task Manager");
  win.addButton("btn_quick_bundler", "📦 App Bundler");
  win.endRow();

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
  win.endGroupBox();

  // 4. Primary Tool Selector & Action Dispatcher
  const dropdownItems = currentApps.map(
    (a) => `[${a.sourceLabel}] ${a.displayName} (${a.displayPath})`
  );

  win.beginGroupBox("Select & Launch Any Tool in this Project");
  win.beginRow();
  win.addLabel("lbl_pick", "Select Tool:");
  win.addDropdown("dd_select_app", dropdownItems, dropdownItems[0] || "None", { width: 440 });
  win.addLabel("lbl_args", "CLI Flags / Args:");
  win.addInput("txt_cli_args", "--help", "Arguments e.g. --telemetry, --search...", { width: 170 });
  win.addButton("btn_launch", "🚀 Launch Tool");
  win.addButton("btn_terminal", "🖥️ Open in Terminal");
  win.addButton("btn_run_inline", "⚡ Run Inline");
  win.addButton("btn_kill", "🛑 Stop / Kill");
  win.addButton("btn_reveal", "📂 Reveal Script");
  win.addButton("btn_copy", "📋 Copy Cmd");
  win.endRow();
  win.endGroupBox();

  // 5. Search & Filter Bar
  win.beginGroupBox("Catalog Search & Category Filter");
  win.beginRow();
  win.addLabel("lbl_search", "🔍 Filter:");
  win.addInput("txt_search", "", "Filter tools by name, category, or command...", { width: 340 });
  win.addLabel("lbl_cat", "Category:");
  win.addDropdown(
    "dd_category",
    [
      "🌟 All Project Tools",
      "🖥️ Studio Applications (applications/)",
      "🛠️ CLI Utilities (cli_apps/)",
      "🎮 Showcase Demos (demos/)",
      "🟢 Running Processes",
      "⭐ Pinned Favorites",
    ],
    "🌟 All Project Tools",
    { width: 260 }
  );
  win.addButton("btn_filter", "🔍 Apply Filter");
  win.addButton("btn_clear_filter", "✕ Reset Filter");
  win.endRow();
  win.endGroupBox();

  // 6. Project Tools Data Table
  const tableHeaders = ["ID", "Type", "Name", "Category", "Status", "Command Path"];
  const formatRow = (a: DetectedApp) => [
    a.id,
    a.sourceLabel,
    `${a.icon || "⚡"} ${a.displayName}`,
    a.category,
    a.isRunning ? `🟢 Running (#${a.pid || "?"})` : "⚪ Ready",
    a.command,
  ];

  const initialRows = currentApps.map(formatRow);

  win.beginGroupBox(`Project Tools Catalog (${initialData.kpis.total} Total Tools in Workspace)`);
  win.addTable("tbl_apps", tableHeaders, initialRows, (w, rowPid: any) => {
    // Exact match on rowPid since cell[0] is app.id!
    const found = currentApps.find((a) => a.id === String(rowPid).trim());
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
    `Ready  |  ${initialData.kpis.radStudios} Studio Apps  |  ${initialData.kpis.cliTools} CLI Tools  |  ${initialData.kpis.demos} Demos  |  Running: ${initialData.kpis.running}`
  );
  win.endRow();

  // -----------------------------------------------------------------------------------------------
  // Helper Functions
  // -----------------------------------------------------------------------------------------------

  function updateSelectedView(w: SimpleWindow, app: DetectedApp) {
    selectedApp = app;
    const itemStr = `[${app.sourceLabel}] ${app.displayName} (${app.displayPath})`;
    w.setValue("dd_select_app", itemStr);
    w.setStatus(`Selected: ${app.displayName} (${app.displayPath})`);

    const summary = [
      `=== Tool Selected: ${app.displayName} ===`,
      `ID:          ${app.id}`,
      `Type:        ${app.sourceLabel}`,
      `Category:    ${app.category}`,
      `Script Path: ${app.path}`,
      `Run Command: ${app.command}`,
      `Description: ${app.description}`,
      `Status:      ${app.isRunning ? `🟢 Active Running (PID ${app.pid})` : "⚪ Ready to Launch"}`,
      `Favorite:    ${app.isFavorite ? "Yes (★)" : "No (☆)"}`,
    ].join("\n");

    w.setText("txt_output", summary);
  }

  async function executeToolLaunch(
    app: DetectedApp,
    w: SimpleWindow,
    overrideArgs?: string,
    inTerminal?: boolean
  ) {
    const rawArgs = overrideArgs !== undefined ? overrideArgs : (w.getValue("txt_cli_args") || "");
    const openInTerminal = inTerminal !== undefined ? inTerminal : (app.source === "cli_tool");

    w.appendConsole(
      "launcher_console",
      `[Launch Dispatcher] Executing ${app.displayName} ('${app.command} ${rawArgs}') [mode: ${openInTerminal ? "terminal" : "inline"}]...\n`,
      1
    );
    w.setStatus(`Running ${app.displayName}...`);

    const res = await launchApplication(app.id, rawArgs, { openTerminal: openInTerminal });

    if (res.success) {
      w.appendConsole("launcher_console", `[Success] ${res.message}\n`, 2);
      w.toast(`✅ ${res.message}`);

      if (app.source === "rad_studio" || app.source === "rad_demo") {
        w.setText(
          "txt_output",
          `[Desktop GUI Application Launched]\nApplication: ${app.displayName}\nPID: ${res.pid}\nPath: ${app.path}\nCommand: bun run ${app.displayPath}\nStatus: The application window should now be open on your desktop!`
        );
      } else if (openInTerminal) {
        w.setText(
          "txt_output",
          `[Terminal Client Launched]\nApplication: ${app.displayName}\nCategory:    ${app.category}\nScript Path: ${app.path}\nCommand:     bun run ${app.displayPath} ${rawArgs || "--help"}\nStatus:      Active interactive Terminal session opened on your desktop!`
        );
      } else {
        w.setText(
          "txt_output",
          `=== CLI Output: ${app.displayName} ===\nCommand: bun run ${app.displayPath} ${rawArgs || "--help"}\n\n${res.output || "(No console output returned)"}`
        );
      }
      setTimeout(() => applyFilters(w), 800);
    } else {
      w.appendConsole("launcher_console", `[Launch Error] ${res.message}\n`, 3);
      w.setText("txt_output", `[Error Launching Tool]\n${res.message}`);
      w.toast(`❌ ${res.message}`);
    }
  }

  function applyFilters(w: SimpleWindow) {
    const query = (w.getValue("txt_search") || "").trim().toLowerCase();
    const catChoice = w.getValue("dd_category") || "🌟 All Project Tools";

    const fresh = scanAllApplications();

    currentApps = fresh.apps.filter((a) => {
      // Category filter
      if (catChoice.includes("Studio Applications") && a.source !== "rad_studio") return false;
      if (catChoice.includes("CLI Utilities") && a.source !== "cli_tool") return false;
      if (catChoice.includes("Showcase Demos") && a.source !== "rad_demo") return false;
      if (catChoice.includes("Running Processes") && !a.isRunning) return false;
      if (catChoice.includes("Pinned Favorites") && !a.isFavorite) return false;

      // Search query
      if (query) {
        const mName = a.displayName.toLowerCase().includes(query) || a.name.toLowerCase().includes(query);
        const mCat = a.category.toLowerCase().includes(query);
        const mPath = a.displayPath.toLowerCase().includes(query);
        return mName || mCat || mPath;
      }
      return true;
    });

    const rows = currentApps.map(formatRow);
    w.setTableData("tbl_apps", tableHeaders, rows);
    w.setText(
      "lbl_status",
      `Filtered: ${currentApps.length} / ${fresh.apps.length} project tools  |  Studios: ${fresh.kpis.radStudios}  |  CLI: ${fresh.kpis.cliTools}`
    );

    if (currentApps.length > 0 && (!selectedApp || !currentApps.some((a) => a.id === selectedApp?.id))) {
      selectedApp = currentApps[0]!;
      updateSelectedView(w, selectedApp);
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

  win.onClick("btn_filter", (w) => applyFilters(w));
  win.onClick("btn_clear_filter", (w) => {
    w.setValue("txt_search", "");
    w.setValue("dd_category", "🌟 All Project Tools");
    applyFilters(w);
  });

  win.onClick("btn_rescan", (w) => {
    const fresh = scanAllApplications();
    currentApps = fresh.apps;
    const rows = currentApps.map(formatRow);
    w.setTableData("tbl_apps", tableHeaders, rows);
    w.setValue("lbl_kpi_total", `⚡ Total Tools: ${fresh.kpis.total}`);
    w.setValue("lbl_kpi_studios", `🖥️ Studio Applications: ${fresh.kpis.radStudios}`);
    w.setValue("lbl_kpi_cli", `🛠️ CLI Utilities: ${fresh.kpis.cliTools}`);
    w.setValue("lbl_kpi_demos", `🎮 Showcase Demos: ${fresh.kpis.demos}`);
    w.setValue("lbl_kpi_running", `🟢 Active Running: ${fresh.kpis.running}`);
    w.appendConsole("launcher_console", `[Rescan] Discovered ${fresh.kpis.total} project tools (${fresh.kpis.radStudios} Studios, ${fresh.kpis.cliTools} CLI tools).\n`, 2);
    w.toast(`Rescanned: ${fresh.kpis.total} tools ready`);
  });

  // Dropdown selection change
  win.onChange("dd_select_app", (w, val: any) => {
    const str = String(val || "");
    const matched = currentApps.find((a) => str.includes(a.displayPath) || str.includes(a.displayName));
    if (matched) {
      selectedApp = matched;
      updateSelectedView(w, matched);
    }
  });

  // Primary Launch Button
  win.onClick("btn_launch", (w) => {
    if (!selectedApp) {
      const ddVal = w.getValue("dd_select_app") || "";
      selectedApp = currentApps.find((a) => ddVal.includes(a.displayPath) || ddVal.includes(a.displayName)) || currentApps[0] || null;
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
      const ddVal = w.getValue("dd_select_app") || "";
      selectedApp = currentApps.find((a) => ddVal.includes(a.displayPath) || ddVal.includes(a.displayName)) || currentApps[0] || null;
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
      const ddVal = w.getValue("dd_select_app") || "";
      selectedApp = currentApps.find((a) => ddVal.includes(a.displayPath) || ddVal.includes(a.displayName)) || currentApps[0] || null;
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
      w.toast("No tool selected.");
      return;
    }
    const res = killApplication(selectedApp.id, selectedApp.pid);
    if (res.success) {
      w.appendConsole("launcher_console", `[Process Terminated] ${res.message}\n`, 3);
      w.toast(`🛑 ${res.message}`);
      setTimeout(() => applyFilters(w), 600);
    } else {
      w.toast(`❌ ${res.message}`);
    }
  });

  // Reveal Button
  win.onClick("btn_reveal", (w) => {
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
      const app = currentApps.find((a) => a.id.includes(appId) || a.name === appId);
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
  bindQuick("btn_quick_system", "system_studio");
  bindQuick("btn_quick_fd", "fd_studio");
  bindQuick("btn_quick_git", "git_studio");
  bindQuick("btn_quick_api", "api_studio");
  bindQuick("btn_quick_task", "task_manager");
  bindQuick("btn_quick_bundler", "app_bundler_studio");

  bindQuick("btn_quick_sys_cli", "system_cli", "--telemetry", true);
  bindQuick("btn_quick_db_cli", "database_cli", "--help", true);
  bindQuick("btn_quick_fd_cli", "fd_cli", "--help", true);
  bindQuick("btn_quick_git_cli", "git_cli", "--help", true);
  bindQuick("btn_quick_tokei_cli", "tokei_cli", "--help", true);
  bindQuick("btn_quick_gdu_cli", "gdu_cli", "--help", true);
  bindQuick("btn_quick_net_cli", "network_cli", "--help", true);
  bindQuick("btn_quick_crypto_cli", "crypto_cli", "--help", true);

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
