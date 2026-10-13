# typed: false
# frozen_string_literal: true

class CodecaineUtilitySuite < Formula
  desc "Comprehensive RAD GUI desktop studio applications and CLI utility suite for macOS and Linux"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
  version "1.0.0"
  license "MIT"
  head "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"

  depends_on "bun"

  # Core recommended external dependencies from the suite's Brewfile
  depends_on "sqlite" => :recommended
  depends_on "jq" => :recommended
  depends_on "ripgrep" => :recommended
  depends_on "fd" => :recommended
  depends_on "bat" => :optional
  depends_on "eza" => :optional
  depends_on "watchexec" => :optional
  depends_on "ffmpeg" => :optional
  depends_on "imagemagick" => :optional

  on_linux do
    depends_on "gtk+3"
  end

  def install
    # Install all suite files into libexec
    libexec.install Dir["*"]

    # Ensure dependencies and fresh wrapper binaries are prepared inside libexec
    cd libexec do
      system "bun", "install", "--frozen-lockfile" rescue system "bun", "install"
      system "bun", "run", "scripts/generate_brew_suite.ts"
    end

    # Install all standalone executable wrappers from libexec/bin into Homebrew's bin
    bin.install Dir["#{libexec}/bin/*"]
  end

  def caveats
    <<~EOS
      ⚡ Codecaine Utility Suite has been successfully installed!

      Quick Start:
        codecaine                  # Open Unified Launcher Studio Pro GUI
        codecaine list             # Browse all 170+ GUI applications and CLI utilities
        codecaine search <term>    # Search tools by name or description
        codecaine run <name>       # Run any application or CLI utility with arguments
        codecaine brew status      # Verify Homebrew suite integration and dependencies

      All 140+ individual tools are also directly available on your PATH:
        codecaine-database, codecaine-system, codecaine-api, codecaine-calc,
        codecaine-sqlite-studio, codecaine-launcher, dr-codecaine, and more!
    EOS
  end

  test do
    assert_match "Codecaine Utility Suite", shell_output("#{bin}/codecaine --version")
    assert_match "Codecaine Utility Suite", shell_output("#{bin}/codecaine-suite --version")
    assert_match "Database Studio CLI", shell_output("#{bin}/codecaine-database --help")
    assert_match "System & Package Workstation", shell_output("#{bin}/codecaine-system --help")
    assert_match "Launcher Studio Pro", shell_output("#{bin}/codecaine-launcher-cli --help")
  end
end
