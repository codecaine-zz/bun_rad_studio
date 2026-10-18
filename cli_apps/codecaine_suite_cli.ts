#!/usr/bin/env bun
/**
 * ⚡ Codecaine Utility Suite - Master CLI & Application Hub
 * Unified command-line runner and package manager companion for macOS and Linux.
 * 
 * Provides unified access to all 65+ Desktop Studio Applications and 77+ CLI Utilities.
 */

import { SimpleCLI, sys } from "../src/index.ts";
import { scanAllApplications, launchApplication, type DetectedApp } from "../applications/launcher_studio.ts";
import { resolve, join } from "path";
import { existsSync, readdirSync, readFileSync } from "fs";
import * as os from "os";

const SUITE_NAME = "Codecaine Utility Suite";
const SUITE_VERSION = "1.0.0";

const rawArgs = process.argv.slice(2);
const firstArg = rawArgs[0]?.toLowerCase() ?? "";

// Fast path for --version / -v
if (firstArg === "--version" || firstArg === "-v" || firstArg === "version") {
  console.log(`${SUITE_NAME} v${SUITE_VERSION} (Bun v${Bun.version}, ${process.platform}-${process.arch})`);
  process.exit(0);
}

// Fast path for --help / -h / help
if (firstArg === "--help" || firstArg === "-h" || firstArg === "help") {
  printHelp();
  process.exit(0);
}

function printBanner() {
  console.log(`\x1b[1m\x1b[36m⚡ ${SUITE_NAME}\x1b[0m \x1b[33mv${SUITE_VERSION}\x1b[0m — \x1b[2mComplete Desktop & CLI Suite for Linux & macOS\x1b[0m`);
}

function printHelp() {
  printBanner();
  console.log(`
\x1b[1mUSAGE:\x1b[0m
  codecaine [command] [options] [arguments...]

\x1b[1mCORE COMMANDS:\x1b[0m
  \x1b[32mcodecaine\x1b[0m                        Open Unified Launcher GUI (or CLI overview in terminal)
  \x1b[32mcodecaine list\x1b[0m                   List all available Studio applications and CLI utilities
  \x1b[32mcodecaine search <term>\x1b[0m          Search tools by name, keyword, or category
  \x1b[32mcodecaine run <name> [args...]\x1b[0m   Run any application or CLI utility with forwarded arguments
  \x1b[32mcodecaine app <name> [args...]\x1b[0m   Launch a GUI Studio application
  \x1b[32mcodecaine cli <name> [args...]\x1b[0m   Execute a CLI utility tool
  \x1b[32mcodecaine demo <name>\x1b[0m            Run a feature showcase demo
  \x1b[32mcodecaine launcher\x1b[0m               Launch the Launcher Studio Pro desktop workstation
  \x1b[32mcodecaine launcher-cli [args]\x1b[0m    Run the Launcher Studio CLI companion
  \x1b[32mcodecaine brew <subcommand>\x1b[0m      Homebrew suite integration & dependency management
  \x1b[32mcodecaine info\x1b[0m                   Show suite installation paths, system telemetry, and tool stats

\x1b[1mLIST OPTIONS:\x1b[0m
  \x1b[33m--apps\x1b[0m, \x1b[33m-a\x1b[0m                      Show only GUI Studio applications
  \x1b[33m--cli\x1b[0m, \x1b[33m-c\x1b[0m                       Show only CLI utilities
  \x1b[33m--demos\x1b[0m, \x1b[33m-d\x1b[0m                     Show showcase demos
  \x1b[33m--category <cat>\x1b[0m, \x1b[33m-C <cat>\x1b[0m        Filter by category
  \x1b[33m--search <query>\x1b[0m, \x1b[33m-s <query>\x1b[0m      Search query
  \x1b[33m--json\x1b[0m, \x1b[33m-j\x1b[0m                      Output results as JSON

\x1b[1mHOMEBREW SUBCOMMANDS:\x1b[0m
  \x1b[32mcodecaine brew status\x1b[0m            Show Homebrew environment and tap status
  \x1b[32mcodecaine brew check\x1b[0m             Check external dependencies from Brewfile
  \x1b[32mcodecaine brew install-deps\x1b[0m      Install optional dependencies via Homebrew bundle
  \x1b[32mcodecaine brew link\x1b[0m              Symlink all suite binaries into Homebrew prefix
  \x1b[32mcodecaine brew unlink\x1b[0m            Remove symlinks from Homebrew prefix

\x1b[1mEXAMPLES:\x1b[0m
  $ codecaine list --cli
  $ codecaine search sqlite
  $ codecaine run database --db :memory: --query "SELECT 42 as ans"
  $ codecaine app sqlite_studio
  $ codecaine cli calc "sqrt(144) + 10"
  $ codecaine brew check
`);
}

/**
 * Finds the project root directory whether running from in-repo or Homebrew libexec.
 */
function getProjectRoot(): string {
  const candidates = [
    resolve(import.meta.dir, ".."),
    process.cwd(),
    process.env.CODECAINE_HOME ?? "",
  ];
  for (const c of candidates) {
    if (c && existsSync(join(c, "package.json"))) {
      return c;
    }
  }
  return resolve(import.meta.dir, "..");
}

/**
 * Matches target tool by name, id, or alias.
 */
function findTool(query: string, apps: DetectedApp[]): DetectedApp | null {
  const q = query.toLowerCase().trim().replace(/^codecaine[-_]/, "");
  
  // Exact ID match
  let found = apps.find(a => a.id.toLowerCase() === q || a.id.toLowerCase() === `cli_${q}` || a.id.toLowerCase() === `demo_${q}`);
  if (found) return found;

  // Exact name match
  found = apps.find(a => a.name.toLowerCase() === q);
  if (found) return found;

  // Base filename match (e.g. 'sqlite_studio', 'database_cli')
  found = apps.find(a => {
    const base = a.displayPath.replace(/^.*[\\\/]/, "").replace(/\.ts$/, "").toLowerCase();
    return base === q || base.replace(/_studio$/, "") === q || base.replace(/_cli$/, "") === q;
  });
  if (found) return found;

  // DisplayName contains
  found = apps.find(a => a.displayName.toLowerCase().includes(q));
  if (found) return found;

  return null;
}

/**
 * Executes a target application or CLI tool with forwarded arguments.
 */
async function executeTool(tool: DetectedApp, extraArgs: string[] = []): Promise<number> {
  const root = getProjectRoot();
  const scriptPath = join(root, tool.displayPath);

  if (!existsSync(scriptPath)) {
    console.error(`\x1b[31m❌ Target script not found:\x1b[0m ${scriptPath}`);
    return 1;
  }

  const bunExec = Bun.which("bun") || (process.platform === "win32" ? "bun.exe" : "bun");
  const isGui = tool.source === "rad_studio" || tool.source === "rad_demo";

  if (isGui) {
    console.log(`\x1b[36m🚀 Launching ${tool.displayName}\x1b[0m (${tool.sourceLabel})...`);
  }

  const proc = Bun.spawn([bunExec, "run", scriptPath, ...extraArgs], {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, CODECAINE_SUITE: "1", CODECAINE_ROOT: root },
  });

  return await proc.exited;
}

// -------------------------------------------------------------------------------------------------
// Subcommand Dispatcher
// -------------------------------------------------------------------------------------------------

async function main() {
  const { apps, kpis, categories } = scanAllApplications();

  switch (firstArg) {
    case "list":
    case "ls": {
      const isJson = rawArgs.includes("--json") || rawArgs.includes("-j");
      const appsOnly = rawArgs.includes("--apps") || rawArgs.includes("-a");
      const cliOnly = rawArgs.includes("--cli") || rawArgs.includes("-c");
      const demosOnly = rawArgs.includes("--demos") || rawArgs.includes("-d");
      
      const catIdx = Math.max(rawArgs.indexOf("--category"), rawArgs.indexOf("-C"));
      const catFilter = catIdx !== -1 ? (rawArgs[catIdx + 1]?.toLowerCase() ?? "") : "";

      const searchIdx = Math.max(rawArgs.indexOf("--search"), rawArgs.indexOf("-s"));
      const searchFilter = searchIdx !== -1 ? (rawArgs[searchIdx + 1]?.toLowerCase() ?? "") : "";

      let filtered = apps;
      if (appsOnly) filtered = filtered.filter(a => a.source === "rad_studio");
      if (cliOnly) filtered = filtered.filter(a => a.source === "cli_tool");
      if (demosOnly) filtered = filtered.filter(a => a.source === "rad_demo");
      if (catFilter) filtered = filtered.filter(a => a.category.toLowerCase().includes(catFilter));
      if (searchFilter) {
        filtered = filtered.filter(a => 
          a.displayName.toLowerCase().includes(searchFilter) ||
          a.name.toLowerCase().includes(searchFilter) ||
          a.category.toLowerCase().includes(searchFilter) ||
          a.description.toLowerCase().includes(searchFilter)
        );
      }

      if (isJson) {
        console.log(JSON.stringify({
          suite: SUITE_NAME,
          version: SUITE_VERSION,
          count: filtered.length,
          kpis,
          categories,
          tools: filtered.map(t => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            type: t.sourceLabel,
            category: t.category,
            description: t.description,
            command: `codecaine run ${t.name}`,
            script: t.displayPath,
          })),
        }, null, 2));
        process.exit(0);
      }

      printBanner();
      console.log(`\x1b[1m📊 Catalog Overview:\x1b[0m ${kpis.total} Total Tools (\x1b[32m${kpis.radStudios} GUI Studios\x1b[0m | \x1b[34m${kpis.cliTools} CLI Tools\x1b[0m | \x1b[35m${kpis.demos} Demos\x1b[0m)\n`);
      console.log(`Showing ${filtered.length} matching tools:\n`);

      console.log(" " + "TYPE".padEnd(12) + " | " + "NAME".padEnd(32) + " | " + "CATEGORY".padEnd(24) + " | " + "RUN COMMAND");
      console.log("-".repeat(12) + "-+-" + "-".repeat(32) + "-+-" + "-".repeat(24) + "-+-" + "-".repeat(30));

      for (const t of filtered) {
        const typeColor = t.source === "rad_studio" ? "\x1b[32m" : (t.source === "cli_tool" ? "\x1b[34m" : "\x1b[35m");
        const typeStr = `${typeColor}${t.sourceLabel.padEnd(12)}\x1b[0m`;
        const nameStr = t.displayName.slice(0, 32).padEnd(32);
        const catStr = t.category.slice(0, 24).padEnd(24);
        const cmdStr = `\x1b[33mcodecaine run ${t.name}\x1b[0m`;
        console.log(` ${typeStr} | ${nameStr} | ${catStr} | ${cmdStr}`);
      }

      console.log(`\n\x1b[2mTip: Run any tool with: codecaine run <name>\x1b[0m\n`);
      process.exit(0);
    }

    case "search":
    case "find": {
      const term = rawArgs.slice(1).join(" ").trim().toLowerCase();
      if (!term) {
        console.error("\x1b[31mUsage:\x1b[0m codecaine search <term>");
        process.exit(1);
      }
      const matches = apps.filter(a =>
        a.displayName.toLowerCase().includes(term) ||
        a.name.toLowerCase().includes(term) ||
        a.category.toLowerCase().includes(term) ||
        a.description.toLowerCase().includes(term)
      );
      printBanner();
      console.log(`\x1b[1mSearch results for "${term}" (${matches.length} matches):\x1b[0m\n`);
      for (const m of matches) {
        const icon = m.icon || "⚡";
        console.log(` ${icon} \x1b[1m${m.displayName}\x1b[0m (\x1b[36m${m.sourceLabel}\x1b[0m) [${m.category}]`);
        console.log(`    \x1b[2m${m.description}\x1b[0m`);
        console.log(`    \x1b[33mcodecaine run ${m.name}\x1b[0m\n`);
      }
      process.exit(0);
    }

    case "run": {
      const target = rawArgs[1];
      if (!target) {
        console.error("\x1b[31mUsage:\x1b[0m codecaine run <tool_name_or_id> [arguments...]");
        process.exit(1);
      }
      const tool = findTool(target, apps);
      if (!tool) {
        console.error(`\x1b[31m❌ Error:\x1b[0m Tool '${target}' not found in Codecaine Utility Suite.`);
        console.error(`Run \x1b[33mcodecaine search ${target}\x1b[0m or \x1b[33mcodecaine list\x1b[0m to find available tools.`);
        process.exit(1);
      }
      const exitCode = await executeTool(tool, rawArgs.slice(2));
      process.exit(exitCode);
    }

    case "app": {
      const target = rawArgs[1];
      if (!target) {
        console.error("\x1b[31mUsage:\x1b[0m codecaine app <studio_name> [arguments...]");
        process.exit(1);
      }
      const studios = apps.filter(a => a.source === "rad_studio");
      const tool = findTool(target, studios) || findTool(target, apps);
      if (!tool) {
        console.error(`\x1b[31m❌ Error:\x1b[0m Studio application '${target}' not found.`);
        process.exit(1);
      }
      const exitCode = await executeTool(tool, rawArgs.slice(2));
      process.exit(exitCode);
    }

    case "cli": {
      const target = rawArgs[1];
      if (!target) {
        console.error("\x1b[31mUsage:\x1b[0m codecaine cli <tool_name> [arguments...]");
        process.exit(1);
      }
      const cliTools = apps.filter(a => a.source === "cli_tool");
      const tool = findTool(target, cliTools) || findTool(target, apps);
      if (!tool) {
        console.error(`\x1b[31m❌ Error:\x1b[0m CLI utility '${target}' not found.`);
        process.exit(1);
      }
      const exitCode = await executeTool(tool, rawArgs.slice(2));
      process.exit(exitCode);
    }

    case "demo": {
      const target = rawArgs[1];
      if (!target) {
        console.error("\x1b[31mUsage:\x1b[0m codecaine demo <demo_name> [arguments...]");
        process.exit(1);
      }
      const demos = apps.filter(a => a.source === "rad_demo");
      const tool = findTool(target, demos) || findTool(target, apps);
      if (!tool) {
        console.error(`\x1b[31m❌ Error:\x1b[0m Demo '${target}' not found.`);
        process.exit(1);
      }
      const exitCode = await executeTool(tool, rawArgs.slice(2));
      process.exit(exitCode);
    }

    case "launcher": {
      const launcherApp = apps.find(a => a.name === "launcher_studio");
      if (launcherApp) {
        const exitCode = await executeTool(launcherApp, rawArgs.slice(1));
        process.exit(exitCode);
      }
      break;
    }

    case "launcher-cli": {
      const launcherCli = apps.find(a => a.name === "launcher_cli");
      if (launcherCli) {
        const exitCode = await executeTool(launcherCli, rawArgs.slice(1));
        process.exit(exitCode);
      }
      break;
    }

    case "brew": {
      await handleBrewSubcommand(rawArgs.slice(1));
      process.exit(0);
    }

    case "info": {
      printBanner();
      const brewPrefix = sys.execOr("brew --prefix", "/opt/homebrew");
      const hasBrew = sys.exec("which brew")[1] === 0;
      console.log(`
\x1b[1mSystem Environment:\x1b[0m
  OS Platform:        ${os.type()} ${os.release()} (${os.arch()})
  Platform Tag:       ${process.platform}-${process.arch}
  Bun Runtime:        v${Bun.version} (${Bun.revision || "standard"})
  Node Compatibility: ${process.version}
  CPUs / Cores:       ${os.cpus().length}x (${os.cpus()[0]?.model || "Architecture Core"})
  Total System RAM:   ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB

\x1b[1mCodecaine Utility Suite:\x1b[0m
  Suite Version:      ${SUITE_VERSION}
  Install Root:       ${getProjectRoot()}
  Total Tools:        ${kpis.total}
  • GUI Studios:      ${kpis.radStudios}
  • CLI Utilities:    ${kpis.cliTools}
  • Showcase Demos:   ${kpis.demos}
  • Active Favorites: ${kpis.favorites}

\x1b[1mHomebrew Integration:\x1b[0m
  Homebrew Installed: ${hasBrew ? "\x1b[32m✔ YES\x1b[0m" : "\x1b[31m✖ NO\x1b[0m"}
  Homebrew Prefix:    ${brewPrefix}
  Formula Directory:  ${join(getProjectRoot(), "Formula")}
`);
      process.exit(0);
    }

    default: {
      // If user typed: codecaine <toolName> directly
      if (firstArg && !firstArg.startsWith("-")) {
        const tool = findTool(firstArg, apps);
        if (tool) {
          const exitCode = await executeTool(tool, rawArgs.slice(1));
          process.exit(exitCode);
        }
      }

      // No arguments: If GUI available, launch Launcher Studio Pro GUI
      const hasGui = process.platform === "darwin" || Boolean(process.env.DISPLAY) || Boolean(process.env.WAYLAND_DISPLAY);
      if (hasGui && process.stdout.isTTY && !rawArgs.includes("--cli")) {
        const launcherApp = apps.find(a => a.name === "launcher_studio");
        if (launcherApp) {
          const code = await executeTool(launcherApp);
          process.exit(code);
        }
      }

      // Fallback: show interactive overview / help
      printHelp();
      process.exit(0);
    }
  }
}

async function handleBrewSubcommand(subArgs: string[]) {
  const sub = subArgs[0]?.toLowerCase() ?? "status";
  const root = getProjectRoot();

  switch (sub) {
    case "status": {
      printBanner();
      console.log("\x1b[1m🍺 Homebrew Integration Status:\x1b[0m\n");
      const [brewVer, bCode] = sys.exec("brew --version");
      if (bCode !== 0) {
        console.log("\x1b[31m✖ Homebrew is not installed or not in PATH.\x1b[0m");
        console.log("Visit https://brew.sh to install Homebrew on macOS or Linux.\n");
        return;
      }
      const [prefix] = sys.exec("brew --prefix");
      const [tapList] = sys.exec("brew tap");
      const formulaFile = join(root, "Formula", "codecaine-utility-suite.rb");

      console.log(`  • Homebrew Version:  ${brewVer.split("\n")[0]}`);
      console.log(`  • Homebrew Prefix:   ${prefix.trim()}`);
      console.log(`  • Formula Present:   ${existsSync(formulaFile) ? "\x1b[32m✔ Formula/codecaine-utility-suite.rb\x1b[0m" : "\x1b[31m✖ Missing\x1b[0m"}`);
      console.log(`  • Active Taps:       ${tapList.trim().replace(/\n/g, ", ") || "None"}\n`);
      break;
    }

    case "check": {
      console.log("\x1b[36m🔍 Checking Homebrew dependencies from Brewfile...\x1b[0m\n");
      const checkScript = join(root, "scripts", "install_dependencies.ts");
      if (existsSync(checkScript)) {
        const proc = Bun.spawn(["bun", "run", checkScript], { stdout: "inherit", stderr: "inherit", cwd: root });
        await proc.exited;
      } else {
        const proc = Bun.spawn(["brew", "bundle", "check", "--file", join(root, "Brewfile")], { stdout: "inherit", stderr: "inherit", cwd: root });
        await proc.exited;
      }
      break;
    }

    case "install-deps":
    case "bundle": {
      console.log("\x1b[36m⬇️ Installing Homebrew dependencies from Brewfile...\x1b[0m\n");
      const installScript = join(root, "install_homebrew_dependencies.sh");
      if (existsSync(installScript)) {
        const proc = Bun.spawn([installScript], { stdout: "inherit", stderr: "inherit", cwd: root });
        await proc.exited;
      } else {
        const proc = Bun.spawn(["brew", "bundle", "--file", join(root, "Brewfile")], { stdout: "inherit", stderr: "inherit", cwd: root });
        await proc.exited;
      }
      break;
    }

    case "link": {
      console.log("\x1b[36m🔗 Linking Codecaine Utility Suite binaries to Homebrew prefix...\x1b[0m\n");
      const installerScript = join(root, "install_homebrew_suite.sh");
      if (existsSync(installerScript)) {
        const proc = Bun.spawn([installerScript, "--link"], { stdout: "inherit", stderr: "inherit", cwd: root });
        await proc.exited;
      } else {
        console.error("Installer script not found.");
      }
      break;
    }

    case "unlink": {
      console.log("\x1b[33mUnlinking Codecaine Utility Suite binaries from Homebrew prefix...\x1b[0m\n");
      const installerScript = join(root, "install_homebrew_suite.sh");
      if (existsSync(installerScript)) {
        const proc = Bun.spawn([installerScript, "--unlink"], { stdout: "inherit", stderr: "inherit", cwd: root });
        await proc.exited;
      } else {
        console.error("Installer script not found.");
      }
      break;
    }

    default:
      console.error(`Unknown brew subcommand: ${sub}. Valid: status | check | install-deps | link | unlink`);
  }
}

main().catch(err => {
  console.error("Fatal error in codecaine CLI:", err);
  process.exit(1);
});
