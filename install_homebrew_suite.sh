#!/usr/bin/env bash
# ==============================================================================
# ⚡ Codecaine Utility Suite — Homebrew Installer for macOS and Linux
# ==============================================================================
# Installs and links all 65+ Desktop Studio Applications and 77+ CLI Utilities
# directly into your Homebrew environment.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FORMULA="$SCRIPT_DIR/Formula/codecaine-utility-suite.rb"
BREWFILE="$SCRIPT_DIR/Brewfile"

MODE="link"
INSTALL_DEPS=0
NON_INTERACTIVE=0

BOLD="$(printf '\033[1m')"
GREEN="$(printf '\033[32m')"
CYAN="$(printf '\033[36m')"
YELLOW="$(printf '\033[33m')"
RED="$(printf '\033[31m')"
RESET="$(printf '\033[0m')"


usage() {
  cat <<EOF
${BOLD}⚡ Codecaine Utility Suite — Homebrew Installer for macOS and Linux${RESET}

${BOLD}USAGE:${RESET}
  ./install_homebrew_suite.sh [options]

${BOLD}OPTIONS:${RESET}
  --link            ${CYAN}(Default)${RESET} Symlink all suite binaries directly into Homebrew bin ($(brew --prefix 2>/dev/null || echo '/opt/homebrew')/bin)
  --unlink          Remove all Codecaine Utility Suite symlinks from Homebrew bin
  --build           Install via Homebrew formula build: brew install --build-from-source ./Formula/codecaine-utility-suite.rb
  --tap             Configure this repository as a local Homebrew tap
  --deps            Install all external CLI dependencies from Brewfile (ffmpeg, jq, ripgrep, sqlite, etc.)
  --doctor, -d      Run diagnostic health check on Homebrew, Bun, and suite commands
  -y, --yes         Non-interactive mode (auto-confirm prompts)
  -h, --help        Show this help message

${BOLD}EXAMPLES:${RESET}
  ./install_homebrew_suite.sh                 # Install and link all 140+ tools to Homebrew bin
  ./install_homebrew_suite.sh --deps          # Install suite + all Brewfile dependencies
  ./install_homebrew_suite.sh --doctor        # Run full system diagnostics
  ./install_homebrew_suite.sh --unlink        # Cleanly remove all symlinks
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --link)
      MODE="link"
      ;;
    --unlink)
      MODE="unlink"
      ;;
    --build)
      MODE="build"
      ;;
    --tap)
      MODE="tap"
      ;;
    --deps)
      INSTALL_DEPS=1
      ;;
    --doctor|-d)
      MODE="doctor"
      ;;
    -y|--yes)
      NON_INTERACTIVE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown argument:${RESET} $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

echo -e "\n${BOLD}${CYAN}⚡ Codecaine Utility Suite — Homebrew System Setup${RESET}"
echo -e "${BOLD}Platform:${RESET} $(uname -s) ($(uname -m))\n"

# 1. Verify Homebrew
if ! command -v brew >/dev/null 2>&1; then
  echo -e "${RED}❌ Homebrew is not installed or not found on PATH.${RESET}"
  echo "Homebrew is required to install the Codecaine Utility Suite via brew."
  echo "To install Homebrew, run:"
  echo -e "  ${CYAN}/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${RESET}"
  echo "Then restart your terminal and re-run this script."
  exit 1
fi

BREW_PREFIX="$(brew --prefix)"
BREW_BIN="$BREW_PREFIX/bin"
echo -e "${GREEN}✔ Homebrew detected:${RESET} $BREW_PREFIX"

# 2. Verify Bun Runtime
if ! command -v bun >/dev/null 2>&1; then
  echo -e "${YELLOW}○ Bun runtime not detected on PATH.${RESET}"
  echo -e "Installing Bun via Homebrew: ${CYAN}brew install bun${RESET}..."
  brew install bun
fi

BUN_VER="$(bun --version)"
echo -e "${GREEN}✔ Bun runtime detected:${RESET} v$BUN_VER ($(which bun))"

# 3. Optional dependencies from Brewfile
if [[ "$INSTALL_DEPS" -eq 1 ]]; then
  echo -e "\n${CYAN}📦 Installing external CLI dependencies from Brewfile...${RESET}"
  if [[ -f "$BREWFILE" ]]; then
    brew bundle --file "$BREWFILE" || true
    echo -e "${GREEN}✔ Brewfile bundle installation complete.${RESET}"
  fi
fi

# ------------------------------------------------------------------------------
# Action: Doctor / Health Check
# ------------------------------------------------------------------------------
if [[ "$MODE" == "doctor" ]]; then
  echo -e "\n${BOLD}🩺 Running Codecaine Utility Suite Diagnostics:${RESET}"
  echo "--------------------------------------------------------"
  echo -e "• Homebrew Prefix:  $BREW_PREFIX"
  echo -e "• Homebrew Bin:     $BREW_BIN"
  echo -e "• Bun Version:      v$BUN_VER"
  echo -e "• Suite Root:       $SCRIPT_DIR"
  
  # Check wrappers in bin
  if [[ -d "$SCRIPT_DIR/bin" ]]; then
    WRAPPER_COUNT=$(find "$SCRIPT_DIR/bin" -type f -perm +111 2>/dev/null | wc -l | tr -d ' ')
    echo -e "• Local Wrappers:   ${GREEN}$WRAPPER_COUNT executable binaries in bin/${RESET}"
  else
    echo -e "• Local Wrappers:   ${YELLOW}Not yet generated (run ./install_homebrew_suite.sh)${RESET}"
  fi

  # Check if codecaine is in PATH
  if command -v codecaine >/dev/null 2>&1; then
    CODECAINE_LOC="$(which codecaine)"
    echo -e "• PATH Check:       ${GREEN}✔ 'codecaine' available at $CODECAINE_LOC${RESET}"
    echo -e "\n${GREEN}Diagnostic check passed: Codecaine Utility Suite is active and ready to brew!${RESET}\n"
  else
    echo -e "• PATH Check:       ${YELLOW}○ 'codecaine' not yet found on PATH (run ./install_homebrew_suite.sh --link)${RESET}\n"
  fi
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Unlink
# ------------------------------------------------------------------------------
if [[ "$MODE" == "unlink" ]]; then
  echo -e "\n${YELLOW}Unlinking Codecaine Utility Suite from $BREW_BIN...${RESET}"
  bun run "$SCRIPT_DIR/scripts/generate_brew_suite.ts" --unlink
  echo -e "${GREEN}✔ Unlink complete.${RESET}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Build from Formula
# ------------------------------------------------------------------------------
if [[ "$MODE" == "build" ]]; then
  echo -e "\n${CYAN}🔨 Building and installing from Homebrew Formula...${RESET}"
  brew install --build-from-source "$FORMULA"
  echo -e "\n${GREEN}✨ Codecaine Utility Suite successfully installed via Homebrew Formula!${RESET}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Tap
# ------------------------------------------------------------------------------
if [[ "$MODE" == "tap" ]]; then
  echo -e "\n${CYAN}🍺 Setting up local Homebrew Tap for Codecaine Utility Suite...${RESET}"
  TAP_DIR="$(brew --repository)/Library/Taps/codecaine-zz/homebrew-codecaine-utility-suite"
  mkdir -p "$(dirname "$TAP_DIR")"
  if [[ -d "$TAP_DIR" ]]; then
    rm -rf "$TAP_DIR"
  fi
  ln -s "$SCRIPT_DIR" "$TAP_DIR"
  echo -e "${GREEN}✔ Local tap created at:${RESET} $TAP_DIR"
  echo -e "You can now run: ${CYAN}brew install codecaine-utility-suite${RESET} or ${CYAN}brew install codecaine${RESET}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Link (Default)
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}⚡ Generating standalone binary wrappers for all applications & CLIs...${RESET}"
cd "$SCRIPT_DIR"
bun run scripts/generate_brew_suite.ts --clean

echo -e "\n${CYAN}🔗 Linking all executable wrappers into Homebrew bin directory ($BREW_BIN)...${RESET}"
bun run scripts/generate_brew_suite.ts --link

echo -e "\n${GREEN}════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}✨ Codecaine Utility Suite has been successfully linked into Homebrew!${RESET}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════════════${RESET}\n"

echo -e "${BOLD}Try these commands from any terminal window:${RESET}"
echo -e "  ${CYAN}codecaine${RESET}                   # Open Unified Launcher Studio Pro GUI"
echo -e "  ${CYAN}codecaine list${RESET}              # List all 170+ applications & CLI utilities"
echo -e "  ${CYAN}codecaine search sqlite${RESET}     # Search tools by keyword"
echo -e "  ${CYAN}codecaine run database${RESET}      # Execute any tool"
echo -e "  ${CYAN}codecaine-database --help${RESET}   # Direct CLI shortcut on PATH"
echo -e "  ${CYAN}codecaine-system --telemetry${RESET}# Hardware telemetry inspection"
echo -e "  ${CYAN}codecaine-launcher${RESET}          # Direct GUI launcher executable\n"
