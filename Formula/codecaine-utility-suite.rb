# typed: false
# frozen_string_literal: true

# Release version "1.6.4"
class CodecaineUtilitySuite < Formula
  desc "RAD desktop studio applications and CLI utility suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.6.4"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.4/bun-rad-studio-v1.6.4-macos-arm64.tar.gz"
      sha256 "8001e86715e7263d6915bed5707f6cfc05e247abf94afc1613d259f7b3f3834d"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.4/bun-rad-studio-v1.6.4-macos-x64.tar.gz"
      sha256 "d8da838ea1d8c2102b33831c6f20ba93462f0dea0a1fd42d2b5617bc58f77e91"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.4/bun-rad-studio-v1.6.4-linux-arm64.tar.gz"
      sha256 "3c99cfb2fc42745f8f571db514e1f6b05a234ae873f0905d77432fec934ea5c1"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.4/bun-rad-studio-v1.6.4-linux-x64.tar.gz"
      sha256 "bdb472d89eda974e23d94c2708976dd071dd9744d5f6cf6178c7fc4c1426baa9"
    end
  end

  conflicts_with "codecaine", because: "both install the codecaine suite commands"

  def install
    libexec.install Dir["*"]

    if (libexec/"runtime/bun").exist?
      # Pre-built release archive: bundled Bun runtime + pre-compiled JS bundles (zero build step needed)
      chmod 0755, libexec/"runtime/bun"
      bin_dir = libexec/"bin"
      Dir["#{bin_dir}/*"].each { |f| chmod 0755, f if File.file?(f) }

      # Ensure friendly codecaine-* prefixed entrypoints exist without clashing with system tools (e.g. redis-cli)
      alias_map = {
        "codecaine"              => "codecaine-suite-cli",
        "codecaine-suite"        => "codecaine-suite-cli",
        "codecaine-launcher"     => "launcher-studio",
        "codecaine-launcher-cli" => "launcher-cli",
        "codecaine-file-manager" => "file-manager-studio",
        "dr-codecaine"           => "dr-codecaine-studio",
        "codecaine-arcade"       => "dr-codecaine-studio",
        "codecaine-bros"         => "codecaine-bros-studio",
      }
      alias_map.each do |alias_name, target_name|
        target_path = bin_dir/target_name
        link_path = bin_dir/alias_name
        ln_sf target_name, link_path if target_path.exist? && !link_path.exist?
      end

      Dir["#{bin_dir}/*"].each do |entry|
        next if !File.file?(entry) || File.symlink?(entry)

        base = File.basename(entry)
        next if base.start_with?("codecaine")

        if base.end_with?("-cli")
          stem = base.sub(/-cli$/, "")
          [
            "codecaine-#{stem}",
            "codecaine-#{stem}-cli",
          ].each do |prefixed|
            dest = bin_dir/prefixed
            ln_sf base, dest unless dest.exist?
          end
        elsif base.end_with?("-studio")
          stem = base.sub(/-studio$/, "")
          [
            "codecaine-#{base}",
            "codecaine-#{stem}",
          ].each do |prefixed|
            dest = bin_dir/prefixed
            ln_sf base, dest unless dest.exist?
          end
        else
          dest = bin_dir/"codecaine-#{base}"
          ln_sf base, dest unless dest.exist?
        end
      end
    else
      # Source (--HEAD) build using Homebrew's bun
      cd libexec do
        system("bun", "install", "--frozen-lockfile") || system("bun", "install")
        system "bun", "run", "scripts/generate_brew_suite.ts"
      end
    end

    # Keep wrappers inside libexec/bin (where relative ../ resolution finds libexec)
    # and expose only collision-free codecaine* / dr-codecaine exec scripts in Homebrew's bin directory.
    exposed = Dir["#{libexec}/bin/codecaine*", "#{libexec}/bin/dr-codecaine"].uniq.select do |f|
      File.executable?(f) && !File.directory?(f)
    end
    bin.write_exec_script exposed
  end

  def caveats
    <<~EOS
      ⚡ Codecaine Utility Suite v#{version} has been installed!

      Quick Start:
        codecaine                  # Open Unified Launcher Studio Pro GUI
        codecaine-file-manager     # Open Codecaine File Manager desktop app
        codecaine list             # Browse all 200+ GUI studios and CLI utilities
        codecaine search <term>    # Search tools by name or description
        codecaine run <name>       # Run any studio or CLI utility with arguments
        codecaine doctor           # Run health & environment diagnostics

      macOS Native .app Tip:
        To also install "Codecaine File Manager.app" into /Applications:
          brew install --cask codecaine-zz/tap/codecaine-file-manager

      Linux Desktop Note:
        GUI studio windows require GTK4 and WebKitGTK 6.0 (`libwebkitgtk-6.0-4` on Ubuntu/Debian
        or `webkitgtk6.0` on Fedora). CLI utilities work headless with zero GUI libraries.
    EOS
  end

  test do
    assert_match "Codecaine Utility Suite", shell_output("#{bin}/codecaine --version")
    assert_match "Codecaine Utility Suite", shell_output("#{bin}/codecaine-suite --version")
    assert_match "SQLite", shell_output("#{bin}/codecaine-database --help")
    assert_match "Telemetry", shell_output("#{bin}/codecaine-system --help")
    assert_match "USAGE:", shell_output("#{bin}/codecaine-launcher-cli --help")
  end
end
