#!/usr/bin/env bun
/**
 * ⚡ Codecaine Utility Suite - Master CLI & Application Hub
 * Unified command-line runner and package manager companion for macOS, Linux, and Windows.
 *
 * Provides unified access to all Desktop Studio Applications, CLI Utilities, and Showcase Demos
 * across source checkouts, Homebrew Formula/Tap installs, and global npm/Bun packages.
 */

import { sys } from "../src/index.ts";
import {
  scanAllApplications,
  type DetectedApp,
} from "../applications/launcher_studio.ts";
import { resolve, join } from "path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from "fs";
import * as os from "os";

const SUITE_NAME = "Codecaine Utility Suite";
const FALLBACK_VERSION = "1.5.4";

/**
 * Verifies that a candidate directory is an authentic `bun_rad_studio` / `bun-rad-studio`
 * suite installation root (source checkout, global npm/Bun package, or pre-built release archive).
 */
export function isValidSuiteProjectRoot(candidate: string): boolean {
  if (!candidate) return false;
  try {
    const pkgPath = join(candidate, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name?: unknown;
      };
      if (pkg?.name === "bun_rad_studio" || pkg?.name === "bun-rad-studio") {
        return (
          existsSync(join(candidate, "cli_apps")) ||
          existsSync(join(candidate, "cli"))
        );
      }
      return false;
    }
    // Pre-built release / Homebrew Cellar layout has VERSION + cli/ + runtime/
    if (
      existsSync(join(candidate, "VERSION")) &&
      existsSync(join(candidate, "cli")) &&
      existsSync(join(candidate, "runtime"))
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Finds the suite root directory whether running from in-repo, Homebrew libexec, or global npm/Bun node_modules.
 * Checks `CODECAINE_HOME` and binary-adjacent directories before falling back to `process.cwd()`,
 * verifying authenticity via `isValidSuiteProjectRoot` to prevent CWD hijacking.
 */
export function getProjectRoot(
  cwdOverride?: string,
  envHomeOverride?: string,
): string {
  const envHome =
    envHomeOverride ??
    process.env.CODECAINE_HOME ??
    process.env.CODECAINE_ROOT ??
    "";
  const candidates = [
    envHome ? resolve(envHome) : "",
    resolve(import.meta.dir, ".."),
    resolve(cwdOverride ?? process.cwd()),
  ];
  for (const c of candidates) {
    if (c && isValidSuiteProjectRoot(c)) {
      return c;
    }
  }
  return resolve(import.meta.dir, "..");
}

/**
 * Reads the suite version dynamically from `package.json` or `VERSION` in the installation root.
 */
export function resolveSuiteVersion(rootOverride?: string): string {
  const root = rootOverride ?? getProjectRoot();
  try {
    const pkgPath = join(root, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        version?: unknown;
      };
      if (typeof pkg?.version === "string" && pkg.version.trim()) {
        return pkg.version.trim();
      }
    }
    const verPath = join(root, "VERSION");
    if (existsSync(verPath)) {
      const ver = readFileSync(verPath, "utf8").trim();
      if (ver) return ver;
    }
  } catch {}
  return FALLBACK_VERSION;
}

export type InstallMethod =
  | "homebrew-formula"
  | "homebrew-link"
  | "bun-global"
  | "npm-global"
  | "release-archive"
  | "source";

/**
 * Detects how the user installed the suite so `doctor` and `upgrade` give tailored commands.
 */
export function detectInstallMethod(rootOverride?: string): InstallMethod {
  const rawRoot = rootOverride ?? getProjectRoot();
  const root = rawRoot.replace(/\\/g, "/");
  if (root.includes("/Cellar/") || root.includes("/Homebrew/")) {
    return "homebrew-formula";
  }
  if (root.includes("/.bun/install/global/")) {
    return "bun-global";
  }
  if (
    root.includes("/node_modules/bun-rad-studio") ||
    existsSync(join(rawRoot, "bin", "_runner.mjs"))
  ) {
    return "npm-global";
  }
  if (
    existsSync(join(rawRoot, "VERSION")) &&
    existsSync(join(rawRoot, "runtime")) &&
    !existsSync(join(rawRoot, ".git"))
  ) {
    return "release-archive";
  }
  try {
    const whichCodecaine = Bun.which("codecaine") || "";
    if (
      whichCodecaine.includes("homebrew") ||
      whichCodecaine.startsWith("/usr/local/bin/codecaine")
    ) {
      const resolvedBin = realpathSync(whichCodecaine).replace(/\\/g, "/");
      if (resolvedBin.startsWith(`${root}/`)) {
        return "homebrew-link";
      }
    }
  } catch {}
  return "source";
}

const SUITE_VERSION = resolveSuiteVersion();

const rawArgs = process.argv.slice(2);
const firstArg = rawArgs[0]?.toLowerCase() ?? "";

// Fast path for --version / -v
if (
  import.meta.main &&
  (firstArg === "--version" || firstArg === "-v" || firstArg === "version")
) {
  console.log(
    `${SUITE_NAME} v${SUITE_VERSION} (Bun v${Bun.version}, ${process.platform}-${process.arch})`,
  );
  process.exit(0);
}

// Fast path for --help / -h / help
if (
  import.meta.main &&
  (firstArg === "--help" || firstArg === "-h" || firstArg === "help")
) {
  printHelp();
  process.exit(0);
}

function printBanner() {
  console.log(
    `\x1b[1m\x1b[36m⚡ ${SUITE_NAME}\x1b[0m \x1b[33mv${SUITE_VERSION}\x1b[0m — \x1b[2mComplete Desktop & CLI Suite for macOS, Linux & Windows\x1b[0m`,
  );
}

function printHelp() {
  printBanner();
  console.log(
    `
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
  \x1b[32mcodecaine doctor\x1b[0m                 Run installation, runtime, and desktop environment health checks
  \x1b[32mcodecaine upgrade\x1b[0m                Show or run (` +
      "`--yes`" +
      `) the upgrade command for your install method
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
  \x1b[32mcodecaine brew status\x1b[0m            Show Homebrew environment, tap, Formula, and Cask status
  \x1b[32mcodecaine brew doctor\x1b[0m            Verify Homebrew & suite installation health
  \x1b[32mcodecaine brew check\x1b[0m             Check external dependencies from Brewfile
  \x1b[32mcodecaine brew install-deps\x1b[0m      Install optional dependencies via Homebrew bundle
  \x1b[32mcodecaine brew cask\x1b[0m              Install Codecaine File Manager.app via Homebrew Cask (macOS)
  \x1b[32mcodecaine brew link\x1b[0m              Symlink all suite binaries into Homebrew prefix
  \x1b[32mcodecaine brew unlink\x1b[0m            Remove symlinks from Homebrew prefix

\x1b[1mEXAMPLES:\x1b[0m
  $ codecaine list --cli
  $ codecaine search sqlite
  $ codecaine run database --db :memory: --query "SELECT 42 as ans"
  $ codecaine app file_manager_studio
  $ codecaine cli calc "sqrt(144) + 10"
  $ codecaine doctor
`,
  );
}

/**
 * Matches target tool by name, id, or alias.
 */
function findTool(query: string, apps: DetectedApp[]): DetectedApp | null {
  const q = query
    .toLowerCase()
    .trim()
    .replace(/^codecaine[-_]/, "")
    .replace(/-/g, "_");

  // Exact ID match
  let found = apps.find(
    (a) =>
      a.id.toLowerCase() === q ||
      a.id.toLowerCase() === `rad_${q}` ||
      a.id.toLowerCase() === `cli_${q}` ||
      a.id.toLowerCase() === `demo_${q}`,
  );
  if (found) return found;

  // Exact name match
  found = apps.find((a) => a.name.toLowerCase() === q);
  if (found) return found;

  // Base filename match (e.g. 'sqlite_studio', 'database_cli')
  found = apps.find((a) => {
    const base = a.displayPath
      .replace(/^.*[\\/]/, "")
      .replace(/\.(ts|js)$/i, "")
      .replace(/-/g, "_")
      .toLowerCase();
    return (
      base === q ||
      base.replace(/_studio$/, "") === q ||
      base.replace(/_cli$/, "") === q
    );
  });
  if (found) return found;

  // DisplayName contains
  const rawQuery = query.toLowerCase().trim();
  found = apps.find(
    (a) =>
      a.displayName.toLowerCase().includes(rawQuery) ||
      a.displayName.toLowerCase().includes(q.replace(/_/g, " ")),
  );
  if (found) return found;

  return null;
}

function resolveRuntimeForTool(
  root: string,
  isGui: boolean,
): { bunExec: string; extraEnv: Record<string, string> } {
  const extraEnv: Record<string, string> = {
    CODECAINE_SUITE: "1",
    CODECAINE_HOME: root,
    CODECAINE_ROOT: root,
  };

  // Native webview library path for bundled installs (Homebrew tarball / npm package)
  const libDir = join(root, "lib");
  if (isGui && !process.env.WEBVIEW_PATH && existsSync(libDir)) {
    const libName =
      process.platform === "win32"
        ? "libwebview.dll"
        : process.platform === "darwin"
          ? "libwebview.dylib"
          : `libwebview-${process.arch}.so`;
    const libCandidate = join(libDir, libName);
    if (existsSync(libCandidate)) {
      extraEnv.WEBVIEW_PATH = libCandidate;
    }
  }

  // Bundled compiled Bun runtime stub (used in pre-built release & Homebrew archives)
  const runtimeDir = join(root, "runtime");
  if (existsSync(runtimeDir)) {
    const exeName =
      process.platform === "win32"
        ? isGui && existsSync(join(runtimeDir, "bun-gui.exe"))
          ? "bun-gui.exe"
          : "bun.exe"
        : "bun";
    const bundledBun = join(runtimeDir, exeName);
    if (existsSync(bundledBun)) {
      extraEnv.BUN_BE_BUN = "1";
      return { bunExec: bundledBun, extraEnv };
    }
  }

  if (process.env.BUN_BE_BUN === "1") {
    extraEnv.BUN_BE_BUN = "1";
  }

  if (process.execPath && existsSync(process.execPath)) {
    return { bunExec: process.execPath, extraEnv };
  }

  const bunExec =
    Bun.which("bun") || (process.platform === "win32" ? "bun.exe" : "bun");
  return { bunExec, extraEnv };
}

function prepareGuiWorkingDir(root: string, appName: string): string {
  // In source checkouts, running from root gives direct access to ./resources and writable state.
  if (existsSync(join(root, "applications"))) {
    return root;
  }
  // In read-only bundled installs (Homebrew Cellar or global node_modules), give each GUI app a writable folder with ./resources linked.
  const home = os.homedir();
  if (!home) return root;
  try {
    const workDir = join(
      home,
      ".bun_rad_studio",
      "run",
      `${appName}-${SUITE_VERSION}`,
    );
    mkdirSync(workDir, { recursive: true });
    const srcRes = join(root, "resources");
    const dstRes = join(workDir, "resources");
    if (existsSync(srcRes) && !existsSync(dstRes)) {
      try {
        unlinkSync(dstRes);
      } catch {}
      symlinkSync(
        srcRes,
        dstRes,
        process.platform === "win32" ? "junction" : "dir",
      );
    }
    return workDir;
  } catch {
    return root;
  }
}

/**
 * Executes a target application or CLI tool with forwarded arguments.
 */
async function executeTool(
  tool: DetectedApp,
  extraArgs: string[] = [],
): Promise<number> {
  const root = getProjectRoot();
  const scriptPath =
    tool.path && existsSync(tool.path)
      ? tool.path
      : join(root, tool.displayPath);

  if (!existsSync(scriptPath)) {
    console.error(`\x1b[31m❌ Target script not found:\x1b[0m ${scriptPath}`);
    return 1;
  }

  const isGui = tool.source === "rad_studio" || tool.source === "rad_demo";
  const { bunExec, extraEnv } = resolveRuntimeForTool(root, isGui);

  if (isGui) {
    console.log(
      `\x1b[36m🚀 Launching ${tool.displayName}\x1b[0m (${tool.sourceLabel})...`,
    );
  }

  const runCwd = isGui ? prepareGuiWorkingDir(root, tool.name) : process.cwd();
  const spawnCmd = extraEnv.BUN_BE_BUN
    ? [bunExec, scriptPath, ...extraArgs]
    : [bunExec, "run", scriptPath, ...extraArgs];

  const proc = Bun.spawn(spawnCmd, {
    cwd: runCwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...extraEnv },
  });

  return await proc.exited;
}

function runDoctorReport() {
  const root = getProjectRoot();
  const method = detectInstallMethod(root);
  const { kpis } = scanAllApplications(root);
  const whichCodecaine = Bun.which("codecaine");
  const hasBrew = Bun.which("brew") !== null;

  printBanner();
  console.log("\n\x1b[1m🩺 Codecaine Utility Suite Health Check:\x1b[0m");
  console.log("─".repeat(58));
  console.log(`  • Suite Version:      \x1b[32mv${SUITE_VERSION}\x1b[0m`);
  console.log(`  • Install Method:     \x1b[36m${method}\x1b[0m`);
  console.log(`  • Install Root:       ${root}`);
  console.log(
    `  • Bun Runtime:        \x1b[32m✔ v${Bun.version}\x1b[0m (${process.platform}-${process.arch})`,
  );
  console.log(
    `  • Detected Catalog:   \x1b[32m✔ ${kpis.total} tools\x1b[0m (${kpis.radStudios} GUI Studios, ${kpis.cliTools} CLI Tools, ${kpis.demos} Demos)`,
  );
  console.log(
    `  • Global PATH:        ${whichCodecaine ? `\x1b[32m✔ ${whichCodecaine}\x1b[0m` : "\x1b[33m○ 'codecaine' not on PATH\x1b[0m"}`,
  );

  // Check native WebView library
  const bundledLibDir = join(root, "lib");
  const sourceLibDir = join(root, "node_modules", "webview-bun", "build");
  const libFile =
    process.platform === "win32"
      ? "libwebview.dll"
      : process.platform === "darwin"
        ? "libwebview.dylib"
        : `libwebview-${process.arch}.so`;
  const hasNativeLib =
    Boolean(process.env.WEBVIEW_PATH && existsSync(process.env.WEBVIEW_PATH)) ||
    existsSync(join(bundledLibDir, libFile)) ||
    existsSync(join(sourceLibDir, libFile));
  console.log(
    `  • Desktop WebView:    ${hasNativeLib ? `\x1b[32m✔ ${libFile} ready\x1b[0m` : `\x1b[33m○ ${libFile} not found (CLI & --server modes still work)\x1b[0m`}`,
  );

  if (process.platform === "linux") {
    const [ldOut, ldCode] = sys.exec("ldconfig -p 2>/dev/null || true");
    const hasWebkit =
      ldCode === 0 &&
      (ldOut.includes("webkitgtk-6.0") || ldOut.includes("webkit2gtk"));
    console.log(
      `  • Linux WebKitGTK:    ${hasWebkit ? "\x1b[32m✔ Installed\x1b[0m" : "\x1b[33m○ Missing (install libgtk-4-1 libwebkitgtk-6.0-4 for native GUI windows)\x1b[0m"}`,
    );
  }

  if (process.platform !== "win32") {
    console.log(
      `  • Homebrew Status:    ${hasBrew ? `\x1b[32m✔ ${sys.execOr("brew --prefix", "/opt/homebrew")}\x1b[0m` : "\x1b[2mNot installed (optional)\x1b[0m"}`,
    );
  }

  console.log(
    "\n\x1b[32m✔ Diagnostic check complete — Codecaine Utility Suite is ready!\x1b[0m\n",
  );
}

async function handleUpgradeCommand(subArgs: string[]) {
  const autoRun = subArgs.includes("--yes") || subArgs.includes("-y");
  const root = getProjectRoot();
  const method = detectInstallMethod(root);

  const cmdByMethod: Record<InstallMethod, { label: string; cmd: string[] }> = {
    "homebrew-formula": {
      label: "Homebrew Formula",
      cmd: ["brew", "upgrade", "codecaine-utility-suite"],
    },
    "homebrew-link": {
      label: "Source + Homebrew Symlink",
      cmd: ["git", "-C", root, "pull", "--ff-only"],
    },
    "bun-global": {
      label: "Bun Global Package",
      cmd: ["bun", "update", "-g", "bun-rad-studio"],
    },
    "npm-global": {
      label: "npm Global Package",
      cmd: ["npm", "install", "-g", "bun-rad-studio@latest"],
    },
    "release-archive": {
      label: "Standalone Release Archive",
      cmd: [],
    },
    source: {
      label: "Git Source Checkout",
      cmd: ["git", "-C", root, "pull", "--ff-only"],
    },
  };

  const info = cmdByMethod[method];
  printBanner();
  console.log(`\n\x1b[1m🔄 Upgrade Guide (${info.label}):\x1b[0m\n`);

  if (info.cmd.length === 0) {
    console.log(
      "  Download the latest release from:\n  \x1b[36mhttps://github.com/codecaine-zz/bun_rad_studio/releases/latest\x1b[0m\n",
    );
    console.log(
      "  Or switch to 1-command updates via Homebrew or Bun/npm:\n  • \x1b[32mbrew tap codecaine-zz/tap https://github.com/codecaine-zz/bun_rad_studio.git && brew install codecaine\x1b[0m\n  • \x1b[32mbun add -g bun-rad-studio\x1b[0m  (or \x1b[32mnpm install -g bun-rad-studio\x1b[0m)\n",
    );
    return;
  }

  console.log(`  Recommended command: \x1b[32m${info.cmd.join(" ")}\x1b[0m`);
  if (!autoRun) {
    console.log(
      `  \x1b[2mTip: Pass --yes (-y) to run this upgrade command automatically.\x1b[0m\n`,
    );
    return;
  }

  console.log("\n\x1b[36m⬇️ Running upgrade...\x1b[0m\n");
  const proc = Bun.spawn(info.cmd, {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code === 0 && method === "homebrew-link") {
    const installer = join(root, "install_homebrew_suite.sh");
    if (existsSync(installer)) {
      const linkProc = Bun.spawn([installer, "--link"], {
        cwd: root,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      await linkProc.exited;
    }
  }
  process.exit(code);
}

// -------------------------------------------------------------------------------------------------
// Subcommand Dispatcher
// -------------------------------------------------------------------------------------------------

async function main() {
  const root = getProjectRoot();
  const { apps, kpis, categories } = scanAllApplications(root);

  switch (firstArg) {
    case "list":
    case "ls": {
      const isJson = rawArgs.includes("--json") || rawArgs.includes("-j");
      const appsOnly = rawArgs.includes("--apps") || rawArgs.includes("-a");
      const cliOnly = rawArgs.includes("--cli") || rawArgs.includes("-c");
      const demosOnly = rawArgs.includes("--demos") || rawArgs.includes("-d");

      const catIdx = Math.max(
        rawArgs.indexOf("--category"),
        rawArgs.indexOf("-C"),
      );
      const catFilter =
        catIdx !== -1 ? (rawArgs[catIdx + 1]?.toLowerCase() ?? "") : "";

      const searchIdx = Math.max(
        rawArgs.indexOf("--search"),
        rawArgs.indexOf("-s"),
      );
      const searchFilter =
        searchIdx !== -1 ? (rawArgs[searchIdx + 1]?.toLowerCase() ?? "") : "";

      let filtered = apps;
      if (appsOnly)
        filtered = filtered.filter((a) => a.source === "rad_studio");
      if (cliOnly) filtered = filtered.filter((a) => a.source === "cli_tool");
      if (demosOnly) filtered = filtered.filter((a) => a.source === "rad_demo");
      if (catFilter)
        filtered = filtered.filter((a) =>
          a.category.toLowerCase().includes(catFilter),
        );
      if (searchFilter) {
        filtered = filtered.filter(
          (a) =>
            a.displayName.toLowerCase().includes(searchFilter) ||
            a.name.toLowerCase().includes(searchFilter) ||
            a.category.toLowerCase().includes(searchFilter) ||
            a.description.toLowerCase().includes(searchFilter),
        );
      }

      if (isJson) {
        console.log(
          JSON.stringify(
            {
              suite: SUITE_NAME,
              version: SUITE_VERSION,
              count: filtered.length,
              kpis,
              categories,
              tools: filtered.map((t) => ({
                id: t.id,
                name: t.name,
                displayName: t.displayName,
                type: t.sourceLabel,
                category: t.category,
                description: t.description,
                command: `codecaine run ${t.name}`,
                script: t.displayPath,
              })),
            },
            null,
            2,
          ),
        );
        process.exit(0);
      }

      printBanner();
      console.log(
        `\x1b[1m📊 Catalog Overview:\x1b[0m ${kpis.total} Total Tools (\x1b[32m${kpis.radStudios} GUI Studios\x1b[0m | \x1b[34m${kpis.cliTools} CLI Tools\x1b[0m | \x1b[35m${kpis.demos} Demos\x1b[0m)\n`,
      );
      console.log(`Showing ${filtered.length} matching tools:\n`);

      console.log(
        " " +
          "TYPE".padEnd(12) +
          " | " +
          "NAME".padEnd(32) +
          " | " +
          "CATEGORY".padEnd(24) +
          " | " +
          "RUN COMMAND",
      );
      console.log(
        "-".repeat(12) +
          "-+-" +
          "-".repeat(32) +
          "-+-" +
          "-".repeat(24) +
          "-+-" +
          "-".repeat(30),
      );

      for (const t of filtered) {
        const typeColor =
          t.source === "rad_studio"
            ? "\x1b[32m"
            : t.source === "cli_tool"
              ? "\x1b[34m"
              : "\x1b[35m";
        const typeStr = `${typeColor}${t.sourceLabel.padEnd(12)}\x1b[0m`;
        const nameStr = t.displayName.slice(0, 32).padEnd(32);
        const catStr = t.category.slice(0, 24).padEnd(24);
        const cmdStr = `\x1b[33mcodecaine run ${t.name}\x1b[0m`;
        console.log(` ${typeStr} | ${nameStr} | ${catStr} | ${cmdStr}`);
      }

      console.log(
        `\n\x1b[2mTip: Run any tool with: codecaine run <name>\x1b[0m\n`,
      );
      process.exit(0);
    }

    case "search":
    case "find": {
      const term = rawArgs.slice(1).join(" ").trim().toLowerCase();
      if (!term) {
        console.error("\x1b[31mUsage:\x1b[0m codecaine search <term>");
        process.exit(1);
      }
      const matches = apps.filter(
        (a) =>
          a.displayName.toLowerCase().includes(term) ||
          a.name.toLowerCase().includes(term) ||
          a.category.toLowerCase().includes(term) ||
          a.description.toLowerCase().includes(term),
      );
      printBanner();
      console.log(
        `\x1b[1mSearch results for "${term}" (${matches.length} matches):\x1b[0m\n`,
      );
      for (const m of matches) {
        const icon = m.icon || "⚡";
        console.log(
          ` ${icon} \x1b[1m${m.displayName}\x1b[0m (\x1b[36m${m.sourceLabel}\x1b[0m) [${m.category}]`,
        );
        console.log(`    \x1b[2m${m.description}\x1b[0m`);
        console.log(`    \x1b[33mcodecaine run ${m.name}\x1b[0m\n`);
      }
      process.exit(0);
    }

    case "run": {
      const target = rawArgs[1];
      if (!target) {
        console.error(
          "\x1b[31mUsage:\x1b[0m codecaine run <tool_name_or_id> [arguments...]",
        );
        process.exit(1);
      }
      const tool = findTool(target, apps);
      if (!tool) {
        console.error(
          `\x1b[31m❌ Error:\x1b[0m Tool '${target}' not found in Codecaine Utility Suite.`,
        );
        console.error(
          `Run \x1b[33mcodecaine search ${target}\x1b[0m or \x1b[33mcodecaine list\x1b[0m to find available tools.`,
        );
        process.exit(1);
      }
      const exitCode = await executeTool(tool, rawArgs.slice(2));
      process.exit(exitCode);
    }

    case "app": {
      const target = rawArgs[1];
      if (!target) {
        console.error(
          "\x1b[31mUsage:\x1b[0m codecaine app <studio_name> [arguments...]",
        );
        process.exit(1);
      }
      const studios = apps.filter((a) => a.source === "rad_studio");
      const tool = findTool(target, studios) || findTool(target, apps);
      if (!tool) {
        console.error(
          `\x1b[31m❌ Error:\x1b[0m Studio application '${target}' not found.`,
        );
        process.exit(1);
      }
      const exitCode = await executeTool(tool, rawArgs.slice(2));
      process.exit(exitCode);
    }

    case "cli": {
      const target = rawArgs[1];
      if (!target) {
        console.error(
          "\x1b[31mUsage:\x1b[0m codecaine cli <tool_name> [arguments...]",
        );
        process.exit(1);
      }
      const cliTools = apps.filter((a) => a.source === "cli_tool");
      const tool = findTool(target, cliTools) || findTool(target, apps);
      if (!tool) {
        console.error(
          `\x1b[31m❌ Error:\x1b[0m CLI utility '${target}' not found.`,
        );
        process.exit(1);
      }
      const exitCode = await executeTool(tool, rawArgs.slice(2));
      process.exit(exitCode);
    }

    case "demo": {
      const target = rawArgs[1];
      if (!target) {
        console.error(
          "\x1b[31mUsage:\x1b[0m codecaine demo <demo_name> [arguments...]",
        );
        process.exit(1);
      }
      const demos = apps.filter((a) => a.source === "rad_demo");
      const tool = findTool(target, demos) || findTool(target, apps);
      if (!tool) {
        console.error(`\x1b[31m❌ Error:\x1b[0m Demo '${target}' not found.`);
        process.exit(1);
      }
      const exitCode = await executeTool(tool, rawArgs.slice(2));
      process.exit(exitCode);
    }

    case "launcher": {
      const launcherScript = existsSync(
        join(root, "applications", "launcher_studio.ts"),
      )
        ? join(root, "applications", "launcher_studio.ts")
        : join(root, "apps", "launcher-studio.js");
      if (existsSync(launcherScript)) {
        const exitCode = await executeTool(
          {
            id: "rad_launcher_studio",
            name: "launcher_studio",
            displayName: "Launcher Studio Pro",
            category: "Developer Tools",
            source: "rad_studio",
            sourceLabel: "App Studio",
            path: launcherScript,
            displayPath: "./applications/launcher_studio.ts",
            icon: "⚡",
            version: SUITE_VERSION,
            description: "Unified Project Workstation Launcher",
            command: "codecaine launcher",
            isRunning: false,
            isFavorite: false,
            launchCount: 0,
          },
          rawArgs.slice(1),
        );
        process.exit(exitCode);
      }
      break;
    }

    case "launcher-cli": {
      const launcherCli = apps.find((a) => a.name === "launcher_cli");
      if (launcherCli) {
        const exitCode = await executeTool(launcherCli, rawArgs.slice(1));
        process.exit(exitCode);
      }
      break;
    }

    case "doctor": {
      runDoctorReport();
      process.exit(0);
    }

    case "upgrade":
    case "update": {
      await handleUpgradeCommand(rawArgs.slice(1));
      process.exit(0);
    }

    case "brew": {
      await handleBrewSubcommand(rawArgs.slice(1));
      process.exit(0);
    }

    case "info": {
      printBanner();
      const hasBrew = Bun.which("brew") !== null;
      const brewPrefix = hasBrew
        ? sys.execOr("brew --prefix", "/opt/homebrew")
        : "N/A";
      const method = detectInstallMethod(root);
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
  Install Method:     ${method}
  Install Root:       ${root}
  Total Tools:        ${kpis.total}
  • GUI Studios:      ${kpis.radStudios}
  • CLI Utilities:    ${kpis.cliTools}
  • Showcase Demos:   ${kpis.demos}
  • Active Favorites: ${kpis.favorites}

\x1b[1mHomebrew Integration:\x1b[0m
  Homebrew Installed: ${hasBrew ? "\x1b[32m✔ YES\x1b[0m" : "\x1b[31m✖ NO\x1b[0m"}
  Homebrew Prefix:    ${brewPrefix}
  Formula Directory:  ${join(root, "Formula")}
  Casks Directory:    ${join(root, "Casks")}
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
      const hasGui =
        process.platform === "darwin" ||
        process.platform === "win32" ||
        Boolean(process.env.DISPLAY) ||
        Boolean(process.env.WAYLAND_DISPLAY);
      if (hasGui && process.stdout.isTTY && !rawArgs.includes("--cli")) {
        const launcherScript = existsSync(
          join(root, "applications", "launcher_studio.ts"),
        )
          ? join(root, "applications", "launcher_studio.ts")
          : join(root, "apps", "launcher-studio.js");
        if (existsSync(launcherScript)) {
          const code = await executeTool({
            id: "rad_launcher_studio",
            name: "launcher_studio",
            displayName: "Launcher Studio Pro",
            category: "Developer Tools",
            source: "rad_studio",
            sourceLabel: "App Studio",
            path: launcherScript,
            displayPath: "./applications/launcher_studio.ts",
            icon: "⚡",
            version: SUITE_VERSION,
            description: "Unified Project Workstation Launcher",
            command: "codecaine launcher",
            isRunning: false,
            isFavorite: false,
            launchCount: 0,
          });
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
      console.log("\n\x1b[1m🍺 Homebrew Integration Status:\x1b[0m\n");
      const [brewVer, bCode] = sys.exec("brew --version");
      if (bCode !== 0) {
        console.log(
          "\x1b[31m✖ Homebrew is not installed or not in PATH.\x1b[0m",
        );
        console.log(
          "Visit https://brew.sh to install Homebrew on macOS or Linux, or install via npm/Bun:\n  bun add -g bun-rad-studio\n  npm install -g bun-rad-studio\n",
        );
        return;
      }
      const [prefix] = sys.exec("brew --prefix");
      const [tapList] = sys.exec("brew tap");
      const formulaFile = join(root, "Formula", "codecaine-utility-suite.rb");
      const caskFile = join(root, "Casks", "codecaine-file-manager.rb");

      console.log(`  • Homebrew Version:  ${brewVer.split("\n")[0]}`);
      console.log(`  • Homebrew Prefix:   ${prefix.trim()}`);
      console.log(
        `  • Formula Present:   ${existsSync(formulaFile) ? "\x1b[32m✔ Formula/codecaine-utility-suite.rb\x1b[0m" : "\x1b[2m(Installed from pre-built archive)\x1b[0m"}`,
      );
      console.log(
        `  • macOS Cask:        ${existsSync(caskFile) ? "\x1b[32m✔ Casks/codecaine-file-manager.rb\x1b[0m" : "\x1b[2m(Available via codecaine-zz/tap)\x1b[0m"}`,
      );
      console.log(
        `  • Active Taps:       ${tapList.trim().replace(/\n/g, ", ") || "None"}\n`,
      );
      break;
    }

    case "doctor": {
      runDoctorReport();
      break;
    }

    case "check": {
      console.log(
        "\x1b[36m🔍 Checking Homebrew dependencies from Brewfile...\x1b[0m\n",
      );
      const checkScript = join(root, "scripts", "install_dependencies.ts");
      if (existsSync(checkScript)) {
        const proc = Bun.spawn([process.execPath, "run", checkScript], {
          stdout: "inherit",
          stderr: "inherit",
          cwd: root,
        });
        await proc.exited;
      } else if (existsSync(join(root, "Brewfile"))) {
        const proc = Bun.spawn(
          ["brew", "bundle", "check", "--file", join(root, "Brewfile")],
          { stdout: "inherit", stderr: "inherit", cwd: root },
        );
        await proc.exited;
      } else {
        console.log(
          "No local Brewfile in bundled distribution. Optional external CLI tools: sqlite, jq, ripgrep, fd, ffmpeg, imagemagick.",
        );
      }
      break;
    }

    case "install-deps":
    case "bundle": {
      console.log(
        "\x1b[36m⬇️ Installing Homebrew dependencies from Brewfile...\x1b[0m\n",
      );
      const installScript = join(root, "install_homebrew_dependencies.sh");
      if (existsSync(installScript)) {
        const proc = Bun.spawn([installScript], {
          stdout: "inherit",
          stderr: "inherit",
          cwd: root,
        });
        await proc.exited;
      } else if (existsSync(join(root, "Brewfile"))) {
        const proc = Bun.spawn(
          ["brew", "bundle", "--file", join(root, "Brewfile")],
          { stdout: "inherit", stderr: "inherit", cwd: root },
        );
        await proc.exited;
      } else {
        const proc = Bun.spawn(
          ["brew", "install", "sqlite", "jq", "ripgrep", "fd", "ffmpeg"],
          { stdout: "inherit", stderr: "inherit" },
        );
        await proc.exited;
      }
      break;
    }

    case "cask": {
      if (process.platform !== "darwin") {
        console.error("Homebrew Casks are only supported on macOS.");
        break;
      }
      const installerScript = join(root, "install_homebrew_suite.sh");
      if (existsSync(installerScript)) {
        const proc = Bun.spawn([installerScript, "--cask"], {
          stdout: "inherit",
          stderr: "inherit",
          cwd: root,
        });
        await proc.exited;
      } else {
        const proc = Bun.spawn(
          [
            "brew",
            "install",
            "--cask",
            "codecaine-zz/tap/codecaine-file-manager",
          ],
          { stdout: "inherit", stderr: "inherit" },
        );
        await proc.exited;
      }
      break;
    }

    case "link": {
      console.log(
        "\x1b[36m🔗 Linking Codecaine Utility Suite binaries to Homebrew prefix...\x1b[0m\n",
      );
      const installerScript = join(root, "install_homebrew_suite.sh");
      if (existsSync(installerScript)) {
        const proc = Bun.spawn([installerScript, "--link"], {
          stdout: "inherit",
          stderr: "inherit",
          cwd: root,
        });
        await proc.exited;
      } else {
        console.error(
          "Local wrapper linking is only used for git source checkouts.",
        );
      }
      break;
    }

    case "unlink": {
      console.log(
        "\x1b[33mUnlinking Codecaine Utility Suite binaries from Homebrew prefix...\x1b[0m\n",
      );
      const installerScript = join(root, "install_homebrew_suite.sh");
      if (existsSync(installerScript)) {
        const proc = Bun.spawn([installerScript, "--unlink"], {
          stdout: "inherit",
          stderr: "inherit",
          cwd: root,
        });
        await proc.exited;
      } else {
        console.error(
          "Local wrapper unlinking is only used for git source checkouts.",
        );
      }
      break;
    }

    default:
      console.error(
        `Unknown brew subcommand: ${sub}. Valid: status | doctor | check | install-deps | cask | link | unlink`,
      );
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error in codecaine CLI:", err);
    process.exit(1);
  });
}
