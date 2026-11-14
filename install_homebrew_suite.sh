#!/usr/bin/env bash
# ==============================================================================
# ⚡ Codecaine Utility Suite — Homebrew Installer for macOS and Linux
# ==============================================================================
# Supports:
#   1. 1-line remote install (no repo clone needed):
#        curl -fsSL https://raw.githubusercontent.com/codecaine-zz/bun_rad_studio/main/install_homebrew_suite.sh | bash
#   2. Local checkout symlink mode (instant dev setup):
#        ./install_homebrew_suite.sh --link
#   3. Homebrew 7+ Formula & macOS Cask install (with automatic `brew trust`):
#        ./install_homebrew_suite.sh --formula
#        ./install_homebrew_suite.sh --cask
# ==============================================================================

set -euo pipefail

REPO_SLUG="codecaine-zz/bun_rad_studio"
TAP_NAME="codecaine-zz/tap"
RAW_BASE="https://raw.githubusercontent.com/${REPO_SLUG}/main"

SCRIPT_DIR=""
IN_REPO=0
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  CANDIDATE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$CANDIDATE_DIR/package.json" && -d "$CANDIDATE_DIR/Formula" ]]; then
    SCRIPT_DIR="$CANDIDATE_DIR"
    IN_REPO=1
  fi
fi

# Default mode: symlink when run from a local source checkout, pre-built Formula when run via curl|bash
if [[ "$IN_REPO" -eq 1 ]]; then
  MODE="link"
else
  MODE="formula"
fi

INSTALL_DEPS=0
INSTALL_CASK=0
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
  curl -fsSL ${RAW_BASE}/install_homebrew_suite.sh | bash -s -- [options]

${BOLD}OPTIONS:${RESET}
  --link            Symlink local repo wrappers directly into Homebrew bin (default inside git clone)
  --formula         Install pre-built release via Homebrew Formula (${TAP_NAME}/codecaine-utility-suite)
  --cask            Install native "Codecaine File Manager.app" into /Applications via Homebrew Cask (macOS)
  --build           Build and install --HEAD from source via Homebrew Formula
  --tap             Configure and trust ${TAP_NAME} in Homebrew (Homebrew 7+ compatible)
  --unlink          Remove local Codecaine Utility Suite symlinks from Homebrew bin
  --uninstall       Uninstall Homebrew Formula/Cask and remove any local symlinks
  --deps            Also install optional external CLI tools from Brewfile (jq, ripgrep, fd, ffmpeg, etc.)
  --doctor, -d      Run diagnostic health check on Homebrew, tap trust, Bun, and suite commands
  -y, --yes         Non-interactive mode (auto-confirm prompts)
  -h, --help        Show this help message

${BOLD}EXAMPLES:${RESET}
  ./install_homebrew_suite.sh                 # Link all 200+ tools from local repo (or install Formula remotely)
  ./install_homebrew_suite.sh --formula       # Install pre-built suite via Homebrew Formula
  ./install_homebrew_suite.sh --cask          # Install Codecaine File Manager.app on macOS
  ./install_homebrew_suite.sh --doctor        # Run full system diagnostics
  ./install_homebrew_suite.sh --unlink        # Cleanly remove local symlinks
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
    --formula|--install)
      MODE="formula"
      ;;
    --cask)
      if [[ "$MODE" == "formula" ]]; then
        INSTALL_CASK=1
      fi
      MODE="cask"
      ;;
    --build)
      MODE="build"
      ;;
    --tap)
      MODE="tap"
      ;;
    --uninstall|--remove)
      MODE="uninstall"
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
  for candidate_brew in /opt/homebrew/bin/brew /usr/local/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
    if [[ -x "$candidate_brew" ]]; then
      eval "$("$candidate_brew" shellenv)"
      break
    fi
  done
fi

if ! command -v brew >/dev/null 2>&1; then
  echo -e "${RED}❌ Homebrew is not installed or not found on PATH.${RESET}"
  echo "Install Homebrew from https://brew.sh:"
  echo -e "  ${CYAN}/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"${RESET}"
  echo -e "\nOr install via Bun / npm without Homebrew:"
  echo -e "  ${CYAN}bun add -g bun-rad-studio${RESET}   (or ${CYAN}npm install -g bun-rad-studio${RESET})"
  exit 1
fi

BREW_PREFIX="$(brew --prefix)"
BREW_BIN="$BREW_PREFIX/bin"
BREW_VER="$(brew --version | sed -n '1p')"
echo -e "${GREEN}✔ Homebrew detected:${RESET} $BREW_VER ($BREW_PREFIX)"

# Helper: Provision lightweight local tap & trust it on Homebrew 7+
setup_and_trust_tap() {
  local tap_dir
  tap_dir="$(brew --repository)/Library/Taps/codecaine-zz/homebrew-tap"
  mkdir -p "$(dirname "$tap_dir")"

  if [[ "$IN_REPO" -eq 1 && ! -L "$tap_dir" ]]; then
    rm -rf "$tap_dir"
    mkdir -p "$tap_dir/Formula" "$tap_dir/Casks"
    cp "$SCRIPT_DIR/Formula/"*.rb "$tap_dir/Formula/"
    if [[ -d "$SCRIPT_DIR/Casks" ]]; then
      cp "$SCRIPT_DIR/Casks/"*.rb "$tap_dir/Casks/"
    fi
    (
      cd "$tap_dir"
      git init -q
      git add .
      git -c user.name="Codecaine Installer" -c user.email="noreply@codecaine.dev" commit -qm "Sync Codecaine Homebrew tap"
    )
  elif [[ "$IN_REPO" -eq 0 ]]; then
    rm -rf "$tap_dir"
    mkdir -p "$tap_dir/Formula" "$tap_dir/Casks"
    curl -fsSL "${RAW_BASE}/Formula/codecaine-utility-suite.rb" -o "$tap_dir/Formula/codecaine-utility-suite.rb"
    curl -fsSL "${RAW_BASE}/Formula/codecaine.rb" -o "$tap_dir/Formula/codecaine.rb"
    curl -fsSL "${RAW_BASE}/Casks/codecaine-file-manager.rb" -o "$tap_dir/Casks/codecaine-file-manager.rb"
    (
      cd "$tap_dir"
      git init -q
      git add .
      git -c user.name="Codecaine Installer" -c user.email="noreply@codecaine.dev" commit -qm "Sync Codecaine Homebrew tap"
    )
  fi

  # Homebrew 7+ requires explicit tap trust before loading third-party formulae/casks
  if brew trust --help >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew trust "$TAP_NAME" >/dev/null 2>&1 || true
    echo -e "${GREEN}✔ Trusted tap (Homebrew 7+):${RESET} $TAP_NAME"
  fi
}

# Optional dependencies from Brewfile
if [[ "$INSTALL_DEPS" -eq 1 ]]; then
  echo -e "\n${CYAN}📦 Installing external CLI dependencies...${RESET}"
  if [[ "$IN_REPO" -eq 1 && -f "$SCRIPT_DIR/Brewfile" ]]; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew bundle --file "$SCRIPT_DIR/Brewfile" || true
  else
    HOMEBREW_NO_AUTO_UPDATE=1 brew install sqlite jq ripgrep fd ffmpeg imagemagick || true
  fi
  echo -e "${GREEN}✔ External CLI dependencies ready.${RESET}"
fi

# ------------------------------------------------------------------------------
# Action: Doctor / Health Check
# ------------------------------------------------------------------------------
if [[ "$MODE" == "doctor" ]]; then
  echo -e "\n${BOLD}🩺 Running Codecaine Utility Suite Diagnostics:${RESET}"
  echo "--------------------------------------------------------"
  echo -e "• Homebrew Version: $BREW_VER"
  echo -e "• Homebrew Prefix:  $BREW_PREFIX"
  echo -e "• Homebrew Bin:     $BREW_BIN"
  if command -v bun >/dev/null 2>&1; then
    echo -e "• Bun Runtime:      ${GREEN}v$(bun --version) ($(command -v bun))${RESET}"
  else
    echo -e "• Bun Runtime:      ${YELLOW}Not on PATH (bundled automatically in Formula/Cask installs)${RESET}"
  fi

  if [[ "$IN_REPO" -eq 1 ]]; then
    echo -e "• Suite Root:       $SCRIPT_DIR"
    # Check wrappers in bin (portable POSIX executable check across macOS BSD and GNU/Linux)
    if [[ -d "$SCRIPT_DIR/bin" ]]; then
      WRAPPER_COUNT=0
      for f in "$SCRIPT_DIR/bin"/*; do
        if [ -f "$f" ] && [ -x "$f" ]; then
          WRAPPER_COUNT=$((WRAPPER_COUNT + 1))
        fi
      done
      echo -e "• Local Wrappers:   ${GREEN}$WRAPPER_COUNT executable binaries in bin/${RESET}"
    else
      echo -e "• Local Wrappers:   ${YELLOW}Not yet generated (run ./install_homebrew_suite.sh --link)${RESET}"
    fi
  fi

  if command -v codecaine >/dev/null 2>&1; then
    CODECAINE_LOC="$(command -v codecaine)"
    CODECAINE_VER="$(codecaine --version 2>/dev/null || echo 'installed')"
    echo -e "• PATH Check:       ${GREEN}✔ '$CODECAINE_LOC' ($CODECAINE_VER)${RESET}"
  else
    echo -e "• PATH Check:       ${YELLOW}○ 'codecaine' not yet on PATH${RESET}"
  fi

  if [[ "$(uname -s)" == "Darwin" && -d "/Applications/Codecaine File Manager.app" ]]; then
    echo -e "• macOS App:        ${GREEN}✔ /Applications/Codecaine File Manager.app${RESET}"
  fi

  echo -e "\n${GREEN}Diagnostic check complete!${RESET}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Unlink / Uninstall
# ------------------------------------------------------------------------------
if [[ "$MODE" == "unlink" ]]; then
  if [[ "$IN_REPO" -eq 0 ]]; then
    echo -e "${RED}--unlink requires running from a local repository clone. Use --uninstall for Formula/Cask installs.${RESET}" >&2
    exit 1
  fi
  echo -e "\n${YELLOW}Unlinking Codecaine Utility Suite from $BREW_BIN...${RESET}"
  bun run "$SCRIPT_DIR/scripts/generate_brew_suite.ts" --unlink
  echo -e "${GREEN}✔ Unlink complete.${RESET}\n"
  exit 0
fi

if [[ "$MODE" == "uninstall" ]]; then
  echo -e "\n${YELLOW}Uninstalling Codecaine Utility Suite from Homebrew...${RESET}"
  if [[ "$IN_REPO" -eq 1 ]] && command -v bun >/dev/null 2>&1; then
    bun run "$SCRIPT_DIR/scripts/generate_brew_suite.ts" --unlink || true
  fi
  HOMEBREW_NO_AUTO_UPDATE=1 brew uninstall codecaine-utility-suite 2>/dev/null || true
  HOMEBREW_NO_AUTO_UPDATE=1 brew uninstall codecaine 2>/dev/null || true
  if [[ "$(uname -s)" == "Darwin" ]]; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew uninstall --cask codecaine-file-manager 2>/dev/null || true
  fi
  echo -e "${GREEN}✔ Uninstall complete.${RESET}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Tap
# ------------------------------------------------------------------------------
if [[ "$MODE" == "tap" ]]; then
  echo -e "\n${CYAN}🍺 Configuring Homebrew Tap (${TAP_NAME})...${RESET}"
  setup_and_trust_tap
  echo -e "${GREEN}✔ Tap ready!${RESET} Install anytime with:"
  echo -e "  ${CYAN}brew install ${TAP_NAME}/codecaine${RESET}"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo -e "  ${CYAN}brew install --cask ${TAP_NAME}/codecaine-file-manager${RESET}"
  fi
  echo
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Pre-built Formula Install (Default for curl|bash)
# ------------------------------------------------------------------------------
if [[ "$MODE" == "formula" ]]; then
  echo -e "\n${CYAN}🍺 Installing pre-built Codecaine Utility Suite via Homebrew Formula...${RESET}"
  setup_and_trust_tap
  # Unlink any local repo symlinks first so Homebrew links cleanly without conflicts
  if [[ "$IN_REPO" -eq 1 ]] && command -v bun >/dev/null 2>&1; then
    bun run "$SCRIPT_DIR/scripts/generate_brew_suite.ts" --unlink >/dev/null 2>&1 || true
  fi
  HOMEBREW_NO_AUTO_UPDATE=1 brew install "${TAP_NAME}/codecaine-utility-suite"
  echo -e "\n${GREEN}✨ Codecaine Utility Suite installed! Run 'codecaine --version' or 'codecaine' to start.${RESET}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: macOS Cask Install (Codecaine File Manager.app)
# ------------------------------------------------------------------------------
if [[ "$MODE" == "cask" ]]; then
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo -e "${RED}❌ Homebrew Casks are only supported on macOS. Use --formula on Linux.${RESET}" >&2
    exit 1
  fi
  echo -e "\n${CYAN}🍎 Installing Codecaine File Manager.app into /Applications via Homebrew Cask...${RESET}"
  setup_and_trust_tap
  HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask "${TAP_NAME}/codecaine-file-manager"
  echo -e "\n${GREEN}✨ Codecaine File Manager.app is now in /Applications (quarantine cleared)!${RESET}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Build --HEAD from Source via Formula
# ------------------------------------------------------------------------------
if [[ "$MODE" == "build" ]]; then
  echo -e "\n${CYAN}🔨 Building and installing --HEAD from source via Homebrew Formula...${RESET}"
  setup_and_trust_tap
  if [[ "$IN_REPO" -eq 1 ]] && command -v bun >/dev/null 2>&1; then
    bun run "$SCRIPT_DIR/scripts/generate_brew_suite.ts" --unlink >/dev/null 2>&1 || true
  fi
  HOMEBREW_NO_AUTO_UPDATE=1 brew install --HEAD "${TAP_NAME}/codecaine-utility-suite"
  echo -e "\n${GREEN}✨ Codecaine Utility Suite (--HEAD) installed via Homebrew Formula!${RESET}\n"
  exit 0
fi

# ------------------------------------------------------------------------------
# Action: Link Local Checkout (Default inside git repo)
# ------------------------------------------------------------------------------
if [[ "$IN_REPO" -eq 0 ]]; then
  echo -e "${RED}--link requires running inside a local git clone. Use --formula instead.${RESET}" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo -e "${YELLOW}○ Bun runtime not detected on PATH.${RESET}"
  echo -e "Installing Bun via Homebrew: ${CYAN}brew install bun${RESET}..."
  HOMEBREW_NO_AUTO_UPDATE=1 brew install bun
fi

BUN_VER="$(bun --version)"
echo -e "${GREEN}✔ Bun runtime detected:${RESET} v$BUN_VER ($(command -v bun))"

echo -e "\n${CYAN}⚡ Generating standalone binary wrappers for all applications & CLIs...${RESET}"
cd "$SCRIPT_DIR"
bun run scripts/generate_brew_suite.ts --clean

echo -e "\n${CYAN}🔗 Linking all executable wrappers into Homebrew bin directory ($BREW_BIN)...${RESET}"
bun run scripts/generate_brew_suite.ts --link

echo -e "\n${GREEN}════════════════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}✨ Codecaine Utility Suite v$(bun -p 'require("./package.json").version') linked into Homebrew!${RESET}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════════════${RESET}\n"

echo -e "${BOLD}Try these commands from any terminal window:${RESET}"
echo -e "  ${CYAN}codecaine${RESET}                   # Open Unified Launcher Studio Pro GUI"
echo -e "  ${CYAN}codecaine-file-manager${RESET}      # Open Codecaine File Manager"
echo -e "  ${CYAN}codecaine list${RESET}              # List all 200+ applications & CLI utilities"
echo -e "  ${CYAN}codecaine search sqlite${RESET}     # Search tools by keyword"
echo -e "  ${CYAN}codecaine doctor${RESET}            # Run full health diagnostics"
echo -e "  ${CYAN}codecaine upgrade${RESET}           # Check how to update anytime\n"
