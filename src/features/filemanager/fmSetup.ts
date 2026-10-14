/**
 * One-click setup of the helper programs with the computer's package manager: Homebrew (installing Homebrew first
 * when it is missing), or apt, dnf or pacman on Linux.
 *
 * These installs need the person's password and a real terminal, so nothing runs by itself: a short, readable script
 * is written (its text is fixed here, with only package names from our own catalog filled in) and the page types it
 * into the built-in Terminal, where the person watches it and enters the password. Installs that need no password
 * (Homebrew already there, winget, Scoop) keep using the background install jobs.
 */
import { randomBytes } from "crypto";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import type { FmContext } from "./fmCore";
import { FmError } from "./fmPaths";
import { detectManagers, resolveTool, toolStatus } from "./fmToolDetect";
import { HOMEBREW_INSTALL_COMMAND, TOOLS, TOOL_IDS, type ToolId } from "./fmTools";

export type SetupManager = "brew" | "apt" | "dnf" | "pacman";
const PACKAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9@+._/-]*$/;
const NAMES: Record<SetupManager, string> = { brew: "Homebrew", apt: "apt", dnf: "dnf", pacman: "pacman" };

export interface SetupChoice {
  id: SetupManager;
  name: string;
  /** The person's computer password is asked for in the Terminal. */
  needsPassword: boolean;
  /** Homebrew is not installed yet, so the script installs it first. */
  installsItself: boolean;
}

export interface SetupTool {
  id: ToolId;
  name: string;
  what: string;
  size: string;
  installed: boolean;
  optional: boolean;
  /** Which of the offered managers have a package for it. */
  packages: Partial<Record<SetupManager, boolean>>;
}

export interface SetupOptions {
  platform: string;
  choices: SetupChoice[];
  defaultManager: SetupManager | null;
  tools: SetupTool[];
}

export interface SetupPlan {
  path: string;
  command: string;
  script: string;
  manager: SetupManager;
  managerName: string;
  needsPassword: boolean;
  installsHomebrew: boolean;
  tools: Array<{ id: ToolId; name: string; size: string }>;
  skipped: Array<{ id: ToolId; name: string; why: string }>;
}

/** Quotes text for a POSIX shell: inside single quotes, with each single quote written as '\'' . */
export const shellQuote = (s: string): string => `'${s.replaceAll("'", `'\\''`)}'`;

const hasPackage = (ctx: FmContext, manager: SetupManager, id: ToolId): boolean => {
  const def = TOOLS[id];
  return def[manager].split(" ").some(Boolean) && !(manager === "brew" && def.brewCask && ctx.platform !== "darwin");
};

/** The package managers this computer can use for setup, with what each one involves. */
export function setupChoices(ctx: FmContext): SetupChoice[] {
  if (ctx.platform !== "darwin" && ctx.platform !== "linux") return [];
  const found = detectManagers(ctx);
  const out: SetupChoice[] = [];
  if (ctx.platform === "linux") for (const id of ["apt", "dnf", "pacman"] as const) if (found[id]) out.push({ id, name: NAMES[id], needsPassword: true, installsItself: false });
  out.push({ id: "brew", name: NAMES.brew, needsPassword: !found.brew, installsItself: !found.brew });
  return out;
}

/** What to offer: the managers, the programs that are not installed yet and which managers can install each. */
export async function setupOptions(ctx: FmContext): Promise<SetupOptions> {
  const choices = setupChoices(ctx);
  const status = await toolStatus(ctx);
  const tools: SetupTool[] = status.tools.map((t) => ({
    id: t.id, name: t.name, what: t.what, size: TOOLS[t.id].size ?? "", installed: t.installed, optional: t.optional,
    packages: Object.fromEntries(choices.map((c) => [c.id, hasPackage(ctx, c.id, t.id)])),
  }));
  return { platform: ctx.platform, choices, defaultManager: choices[0]?.id ?? null, tools };
}

/** The script text. Each item is a display name and its package names (validated by the caller). */
export function setupScript(manager: SetupManager, items: Array<{ name: string; packages: string[]; cask?: boolean }>): string {
  const lines = items.map((i) => `${i.cask ? "try_cask" : "try"} ${shellQuote(i.name)} ${i.packages.map(shellQuote).join(" ")}`);
  const head = `#!/bin/bash
# Made by Codecaine File Manager. It installs the helper programs the File Manager uses, with ${NAMES[manager]}.
# Every step is written out below, and nothing here changes anything else on your computer${manager === "brew" ? " except adding Homebrew to your shell settings" : ""}.
set -u

say() { printf '\\n==> %s\\n' "$1"; }
FAILED=""
`;
  const brew = `
find_brew() {
  if command -v brew >/dev/null 2>&1; then command -v brew; return 0; fi
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew /home/linuxbrew/.linuxbrew/bin/brew "$HOME/.linuxbrew/bin/brew"; do
    if [ -x "$b" ]; then echo "$b"; return 0; fi
  done
  command -v brew 2>/dev/null
}

BREW="$(find_brew)"
if [ -z "$BREW" ]; then
  say "Homebrew is not installed yet. Installing it from https://github.com/Homebrew/install"
  echo "It will ask for your computer's password. Nothing shows while you type it; press Enter when done."
  ${HOMEBREW_INSTALL_COMMAND}
  BREW="$(find_brew)"
fi
if [ -z "$BREW" ]; then
  say "Homebrew could not be installed, so nothing else was changed. See https://brew.sh for help."
  exit 1
fi

say "Making Homebrew work in your Terminal"
eval "$("$BREW" shellenv)"
case "$(basename "\${SHELL:-}")" in
  zsh) PROFILE="$HOME/.zprofile" ;;
  bash) if [ "$(uname)" = "Darwin" ]; then PROFILE="$HOME/.bash_profile"; else PROFILE="$HOME/.profile"; fi ;;
  *) PROFILE="$HOME/.profile" ;;
esac
if grep -qs 'brew shellenv' "$PROFILE"; then
  echo "Homebrew is already set up in $PROFILE"
else
  printf '\\n# Added by Codecaine File Manager so your Terminal can find Homebrew\\neval "$(%s shellenv)"\\n' "$BREW" >> "$PROFILE"
  echo "Added Homebrew to $PROFILE (new Terminal windows will find it)"
fi

try() { n="$1"; shift; say "Installing $n"; "$BREW" install "$@" || FAILED="$FAILED $n"; }
try_cask() { n="$1"; shift; say "Installing $n (an application: this can be a big download)"; "$BREW" install --cask "$@" || FAILED="$FAILED $n"; }
`;
  const system: Record<Exclude<SetupManager, "brew">, string> = {
    apt: `
say "Using apt. It asks for your computer's password once. Nothing shows while you type it."
sudo -v || { echo "Could not get permission to install programs."; exit 1; }
sudo apt-get update
try() { n="$1"; shift; say "Installing $n"; sudo apt-get install -y "$@" || FAILED="$FAILED $n"; }
`,
    dnf: `
say "Using dnf. It asks for your computer's password once. Nothing shows while you type it."
sudo -v || { echo "Could not get permission to install programs."; exit 1; }
try() { n="$1"; shift; say "Installing $n"; sudo dnf install -y "$@" || FAILED="$FAILED $n"; }
`,
    pacman: `
say "Using pacman. It asks for your computer's password once. Nothing shows while you type it."
sudo -v || { echo "Could not get permission to install programs."; exit 1; }
try() { n="$1"; shift; say "Installing $n"; sudo pacman -S --needed --noconfirm "$@" || FAILED="$FAILED $n"; }
`,
  };
  const tail = `
if [ -z "$FAILED" ]; then
  say "All done. Go back to Codecaine File Manager and press Check again."
else
  say "Some programs did not install:$FAILED"
  echo "Go back to Codecaine File Manager and press Check again to see what is still missing."
fi
`;
  return head + (manager === "brew" ? brew : system[manager]) + lines.join("\n") + "\n" + tail;
}

/** Works out what to install, writes the script into the app's data folder and says what to type to run it. */
export async function planSetup(ctx: FmContext, input: { tools?: unknown; manager?: unknown }): Promise<SetupPlan> {
  const choices = setupChoices(ctx);
  if (!choices.length) throw new FmError("NOT_SUPPORTED", "This one-click setup is for macOS and Linux. On Windows the install buttons use winget or Scoop.");
  const choice = input.manager === undefined || input.manager === null || input.manager === "" ? choices[0]! : choices.find((c) => c.id === input.manager);
  if (!choice) throw new FmError("BAD_REQUEST", `That package manager isn't available here. Choose one of: ${choices.map((c) => c.name).join(", ")}.`);
  const manager = choice.id;
  const asked = input.tools === undefined || input.tools === "all" ? TOOL_IDS : (Array.isArray(input.tools) ? input.tools : [input.tools]).filter((t): t is ToolId => typeof t === "string" && (TOOL_IDS as string[]).includes(t));
  if (!asked.length) throw new FmError("UNKNOWN_TOOL", "Choose at least one program to install.");
  const items: Array<{ name: string; packages: string[]; cask?: boolean }> = [];
  const tools: SetupPlan["tools"] = [];
  const skipped: SetupPlan["skipped"] = [];
  for (const id of [...new Set(asked)]) {
    const def = TOOLS[id];
    if (resolveTool(ctx, id)) continue;
    if (!hasPackage(ctx, manager, id)) {
      skipped.push({ id, name: def.name, why: `${NAMES[manager]} has no package for it. Download it from ${def.website}` });
      continue;
    }
    const packages = def[manager].split(" ").filter(Boolean);
    for (const pkg of packages) if (!PACKAGE_NAME.test(pkg)) throw new FmError("BAD_REQUEST", `"${pkg}" isn't a package name this app will pass to ${NAMES[manager]}.`);
    items.push({ name: def.name, packages, cask: manager === "brew" && !!def.brewCask });
    tools.push({ id, name: def.name, size: def.size ?? "" });
  }
  if (!items.length) throw new FmError("ALREADY_INSTALLED", skipped.length ? `Nothing to install with ${NAMES[manager]}: ${skipped.map((s) => s.name).join(", ")} can't be installed this way.` : "Every program you chose is already installed.");
  const script = setupScript(manager, items);
  const path = nodePath.join(ctx.dataDir, "install_helper_programs.sh");
  await fsp.mkdir(ctx.dataDir, { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, script, { mode: 0o700 });
  await fsp.rename(tmp, path);
  return { path, command: `bash ${shellQuote(path)}`, script, manager, managerName: choice.name, needsPassword: choice.needsPassword, installsHomebrew: choice.installsItself, tools, skipped };
}
