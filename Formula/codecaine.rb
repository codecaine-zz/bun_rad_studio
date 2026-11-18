# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.6.3"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-macos-arm64.tar.gz"
      sha256 "b5e6083166b8ee4acc452dae2f3793c03dd6a2176b21d7a137520d6ff88e20aa"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-macos-x64.tar.gz"
      sha256 "59865dfd14614c94a97dd292d9e445d6102b816e4e7fbde79108db6ea6a5eabe"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-linux-arm64.tar.gz"
      sha256 "34eb1be31149e0770cba17fb343139e77ec477e84e21d9a43d48763a44a5b902"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-linux-x64.tar.gz"
      sha256 "3c627035f627ea224b3f0718786e138082356bb0debf5adb49effa7e41cb642e"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
