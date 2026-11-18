# typed: false
# frozen_string_literal: true

# Release version "1.6.2"
class CodecaineUtilitySuite < Formula
  desc "RAD desktop studio applications and CLI utility suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.6.2"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.2/bun-rad-studio-v1.6.2-macos-arm64.tar.gz"
      sha256 "521fb196d8e07c7a99dc34b53e5c09212190de942859d00caf78bdc867e59bd6"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.2/bun-rad-studio-v1.6.2-macos-x64.tar.gz"
      sha256 "ca8780b673fac8b7a5b54781a58e188c2260cda0faebe53dab992fe98d11cf37"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.2/bun-rad-studio-v1.6.2-linux-arm64.tar.gz"
      sha256 "7c18e2ddde4ac7bb9d0415c6c77387f58f1cce1e8bf4647ef583aad4aa02487e"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.2/bun-rad-studio-v1.6.2-linux-x64.tar.gz"
      sha256 "8c33dad64f7282573364140b4b47dd2ce18dc8b40c67c939342e89cd65a21937"
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
