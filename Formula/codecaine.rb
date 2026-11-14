# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.5.8"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.8/bun-rad-studio-v1.5.8-macos-arm64.tar.gz"
      sha256 "adffec2a4a3623d53ccec4292894654da41ae129ebf5a3b0e557222ddf7abbf8"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.8/bun-rad-studio-v1.5.8-macos-x64.tar.gz"
      sha256 "e5761fab8bd2d0bc6c0040d714cb4d2cfe2ceceb53b237f16dc3e0337736bb78"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.8/bun-rad-studio-v1.5.8-linux-arm64.tar.gz"
      sha256 "7ea338bd6c888ebeea0c99bfdec19a443e859ac3cb096073a896e5efa73a4147"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.8/bun-rad-studio-v1.5.8-linux-x64.tar.gz"
      sha256 "1449a14f1f2db051fbb2deb6bbeda345ecf7a806ac444352d9717f19e8e993f3"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
