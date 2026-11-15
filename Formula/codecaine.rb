# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.5.9"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.9/bun-rad-studio-v1.5.9-macos-arm64.tar.gz"
      sha256 "907b1ec79de71e030fcd39fdedbe47890ab95b52771aa71cce0e89f76c0085e4"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.9/bun-rad-studio-v1.5.9-macos-x64.tar.gz"
      sha256 "9f24e03815afedbd541e78c9753652b0dd1d9c0240d1594296dc09591c3dca12"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.9/bun-rad-studio-v1.5.9-linux-arm64.tar.gz"
      sha256 "f0958207dfe0bbaa4ee2089466040af3a91950098c59cba86a956ec286887328"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.9/bun-rad-studio-v1.5.9-linux-x64.tar.gz"
      sha256 "91b781955a3c355756f710e3702f45904aff747e8095cab042f80301c8ad8a71"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
