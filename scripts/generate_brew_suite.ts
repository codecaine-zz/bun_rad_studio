#!/usr/bin/env bun
/**
 * ⚡ Codecaine Utility Suite - Homebrew Binary Wrappers Generator
 * 
 * Generates standalone POSIX-compliant wrapper executables in `bin/` for:
 * 1. Master `codecaine` and `codecaine-suite` unified entrypoints
 * 2. All 77+ CLI utility tools from `cli_apps/*.ts`
 * 3. All 65+ Desktop Studio applications from `applications/*.ts`
 * 
 * Works seamlessly on macOS (Homebrew /opt/homebrew/bin) and Linux (Homebrew /home/linuxbrew/.linuxbrew/bin).
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, rmSync, unlinkSync, symlinkSync } from "fs";
import { resolve, join, basename } from "path";
import { scanAllApplications, type DetectedApp } from "../applications/launcher_studio.ts";

const ROOT = resolve(import.meta.dir, "..");
const BIN_DIR = join(ROOT, "bin");

interface WrapperDefinition {
  binName: string;
  targetScript: string; // relative to ROOT, e.g. "cli_apps/api_cli.ts"
  type: "cli" | "gui" | "suite";
  displayName: string;
  description: string;
  category: string;
}

function generateWrapperScript(def: WrapperDefinition): string {
  return `#!/usr/bin/env bash
# ==============================================================================
# Codecaine Utility Suite - ${def.displayName}
# Type: ${def.type.toUpperCase()} | Script: ${def.targetScript}
# ==============================================================================
set -e

# Resolve target directory across symlinks (Homebrew /opt/homebrew/bin, etc.)
SOURCE="\${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
BIN_DIR="$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )"
PROJECT_ROOT="$( cd -P "$BIN_DIR/.." >/dev/null 2>&1 && pwd )"

# Resolve bun executable across macOS and Linux standard locations
if command -v bun >/dev/null 2>&1; then
  BUN_BIN="bun"
elif [ -x "/opt/homebrew/bin/bun" ]; then
  BUN_BIN="/opt/homebrew/bin/bun"
elif [ -x "/usr/local/bin/bun" ]; then
  BUN_BIN="/usr/local/bin/bun"
elif [ -x "/home/linuxbrew/.linuxbrew/bin/bun" ]; then
  BUN_BIN="/home/linuxbrew/.linuxbrew/bin/bun"
elif [ -x "$HOME/.bun/bin/bun" ]; then
  BUN_BIN="$HOME/.bun/bin/bun"
else
  echo "❌ Error: 'bun' runtime was not found on PATH." >&2
  echo "   Install Bun via Homebrew: brew install bun" >&2
  echo "   Or via native installer:  curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

export CODECAINE_SUITE="1"
export CODECAINE_HOME="$PROJECT_ROOT"

exec "$BUN_BIN" run "$PROJECT_ROOT/${def.targetScript}" "$@"
`;
}

export function buildWrapperDefinitions(): WrapperDefinition[] {
  const wrappers: WrapperDefinition[] = [];
  const registeredNames = new Set<string>();

  const register = (w: WrapperDefinition) => {
    if (!registeredNames.has(w.binName)) {
      registeredNames.add(w.binName);
      wrappers.push(w);
    }
  };

  // 1. Primary Suite Runner Wrappers
  register({
    binName: "codecaine",
    targetScript: "cli_apps/codecaine_suite_cli.ts",
    type: "suite",
    displayName: "Codecaine Utility Suite Master CLI",
    description: "Master CLI, tool runner, and package manager companion for macOS and Linux",
    category: "Suite Hub",
  });

  register({
    binName: "codecaine-suite",
    targetScript: "cli_apps/codecaine_suite_cli.ts",
    type: "suite",
    displayName: "Codecaine Utility Suite Master Runner",
    description: "Alias for codecaine master CLI runner",
    category: "Suite Hub",
  });

  register({
    binName: "codecaine-launcher",
    targetScript: "applications/launcher_studio.ts",
    type: "gui",
    displayName: "Launcher Studio Pro (GUI)",
    description: "Unified desktop workstation launcher for all applications & tools",
    category: "Suite Hub",
  });

  register({
    binName: "codecaine-launcher-cli",
    targetScript: "cli_apps/launcher_cli.ts",
    type: "cli",
    displayName: "Launcher Studio Pro (CLI)",
    description: "Terminal companion for unified application detection and launching",
    category: "Suite Hub",
  });

  // 2. Discover all tools using scanAllApplications
  // The launcher orders apps by the user's favourites and launch counts. Sort by path so the generated list, and the
  // committed bin/manifest.json, are the same on every machine.
  const apps = [...scanAllApplications().apps].sort((a, b) => a.displayPath.localeCompare(b.displayPath));

  // CLI tools
  for (const app of apps.filter(a => a.source === "cli_tool")) {
    const filename = basename(app.displayPath).replace(/\.ts$/, "");
    const cleanName = filename.replace(/_cli$/, "").replace(/_/g, "-");

    // Primary prefixed name: codecaine-<tool>
    register({
      binName: `codecaine-${cleanName}`,
      targetScript: app.displayPath.replace(/^\.\//, ""),
      type: "cli",
      displayName: app.displayName,
      description: app.description,
      category: app.category,
    });

    // Also register codecaine-<tool>-cli if different
    if (cleanName !== `${cleanName}-cli`) {
      register({
        binName: `codecaine-${cleanName}-cli`,
        targetScript: app.displayPath.replace(/^\.\//, ""),
        type: "cli",
        displayName: `${app.displayName} (CLI)`,
        description: app.description,
        category: app.category,
      });
    }
  }

  // GUI Studio applications
  for (const app of apps.filter(a => a.source === "rad_studio")) {
    const filename = basename(app.displayPath).replace(/\.ts$/, "");
    const cleanName = filename.replace(/_/g, "-");
    const stripped = cleanName.replace(/-studio$/, "");

    // Primary: codecaine-<name>-studio
    register({
      binName: `codecaine-${cleanName}`,
      targetScript: app.displayPath.replace(/^\.\//, ""),
      type: "gui",
      displayName: app.displayName,
      description: app.description,
      category: app.category,
    });

    // Short alias: codecaine-<name> (if not conflicting with existing CLI)
    if (stripped !== cleanName) {
      register({
        binName: `codecaine-${stripped}-studio`,
        targetScript: app.displayPath.replace(/^\.\//, ""),
        type: "gui",
        displayName: app.displayName,
        description: app.description,
        category: app.category,
      });

      // Special friendly aliases for major studios if not collision
      if (!registeredNames.has(`codecaine-${stripped}`)) {
        register({
          binName: `codecaine-${stripped}`,
          targetScript: app.displayPath.replace(/^\.\//, ""),
          type: "gui",
          displayName: app.displayName,
          description: app.description,
          category: app.category,
        });
      }
    }

    // Special popular aliases
    if (filename === "dr_codecaine_studio") {
      register({
        binName: "dr-codecaine",
        targetScript: app.displayPath.replace(/^\.\//, ""),
        type: "gui",
        displayName: "Dr. Codecaine Arcade",
        description: app.description,
        category: app.category,
      });
      register({
        binName: "codecaine-arcade",
        targetScript: app.displayPath.replace(/^\.\//, ""),
        type: "gui",
        displayName: "Dr. Codecaine Arcade",
        description: app.description,
        category: app.category,
      });
    }
    if (filename === "codecaine_bros_studio") {
      register({
        binName: "codecaine-bros",
        targetScript: app.displayPath.replace(/^\.\//, ""),
        type: "gui",
        displayName: "Codecaine Bros Arcade",
        description: app.description,
        category: app.category,
      });
    }
  }

  return wrappers;
}

export function generateAllWrappers(clean = false): { count: number; wrappers: WrapperDefinition[] } {
  if (clean && existsSync(BIN_DIR)) {
    rmSync(BIN_DIR, { recursive: true, force: true });
  }

  mkdirSync(BIN_DIR, { recursive: true });

  const wrappers = buildWrapperDefinitions();

  for (const def of wrappers) {
    const filePath = join(BIN_DIR, def.binName);
    const script = generateWrapperScript(def);
    writeFileSync(filePath, script, { encoding: "utf8" });
    chmodSync(filePath, 0o755);
  }

  // Generate manifest JSON
  const manifest = {
    suite: "Codecaine Utility Suite",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    totalWrappers: wrappers.length,
    commands: wrappers.map(w => ({
      name: w.binName,
      type: w.type,
      displayName: w.displayName,
      category: w.category,
      description: w.description,
      targetScript: w.targetScript,
    })),
  };

  // Keep the existing file (and its timestamp) when nothing but the timestamp would change, so re-running
  // the generator, or the tests that call it, does not dirty the working tree.
  const manifestPath = join(BIN_DIR, "manifest.json");
  let unchanged = false;
  if (existsSync(manifestPath)) {
    try {
      const previous = JSON.parse(readFileSync(manifestPath, "utf8"));
      const { generatedAt: _previousStamp, ...previousRest } = previous;
      const { generatedAt: _newStamp, ...newRest } = manifest;
      unchanged = JSON.stringify(previousRest) === JSON.stringify(newRest);
    } catch {
      unchanged = false;
    }
  }
  if (!unchanged) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  return { count: wrappers.length, wrappers };
}

// -------------------------------------------------------------------------------------------------
// Homebrew Linking Utilities
// -------------------------------------------------------------------------------------------------

export function getHomebrewBinDir(): string {
  try {
    const proc = Bun.spawnSync(["brew", "--prefix"]);
    const prefix = proc.stdout.toString().trim();
    if (prefix) return join(prefix, "bin");
  } catch {}

  if (process.platform === "darwin") {
    return existsSync("/opt/homebrew/bin") ? "/opt/homebrew/bin" : "/usr/local/bin";
  }
  return "/home/linuxbrew/.linuxbrew/bin";
}

export function linkToHomebrew(brewBinDir?: string): { linked: string[]; failed: string[] } {
  const targetDir = brewBinDir || getHomebrewBinDir();
  const linked: string[] = [];
  const failed: string[] = [];

  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const { wrappers } = generateAllWrappers();

  for (const def of wrappers) {
    const srcPath = join(BIN_DIR, def.binName);
    const destPath = join(targetDir, def.binName);
    try {
      if (existsSync(destPath)) {
        unlinkSync(destPath);
      }
      symlinkSync(srcPath, destPath);
      linked.push(def.binName);
    } catch (e) {
      failed.push(def.binName);
    }
  }

  return { linked, failed };
}

export function unlinkFromHomebrew(brewBinDir?: string): { unlinked: string[] } {
  const targetDir = brewBinDir || getHomebrewBinDir();
  const unlinked: string[] = [];
  const wrappers = buildWrapperDefinitions();

  for (const def of wrappers) {
    const destPath = join(targetDir, def.binName);
    try {
      if (existsSync(destPath)) {
        unlinkSync(destPath);
        unlinked.push(def.binName);
      }
    } catch {}
  }

  return { unlinked };
}

// -------------------------------------------------------------------------------------------------
// CLI Entry Point
// -------------------------------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isClean = args.includes("--clean");
  const isLink = args.includes("--link");
  const isUnlink = args.includes("--unlink");

  console.log("⚡ Codecaine Utility Suite — Wrapper & Homebrew Generator");
  console.log("─".repeat(60));

  if (isUnlink) {
    const brewBin = getHomebrewBinDir();
    console.log(`Unlinking suite wrappers from Homebrew bin (${brewBin})...`);
    const { unlinked } = unlinkFromHomebrew(brewBin);
    console.log(`✅ Unlinked ${unlinked.length} wrappers from ${brewBin}`);
    process.exit(0);
  }

  const { count, wrappers } = generateAllWrappers(isClean);
  console.log(`✅ Generated ${count} executable wrappers in bin/`);
  console.log(`📄 Generated bin/manifest.json`);

  if (isLink) {
    const brewBin = getHomebrewBinDir();
    console.log(`\n🔗 Linking ${count} wrappers into Homebrew bin (${brewBin})...`);
    const { linked, failed } = linkToHomebrew(brewBin);
    console.log(`✅ Successfully linked ${linked.length} commands into ${brewBin}!`);
    if (failed.length > 0) {
      console.warn(`⚠️  Failed to link ${failed.length} commands (check permissions).`);
    }
  }

  console.log("\n💡 Test running:");
  console.log("   ./bin/codecaine --version");
  console.log("   ./bin/codecaine list");
}
