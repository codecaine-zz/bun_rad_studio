# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.5.4"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-macos-arm64.tar.gz"
      sha256 "1570b87ea32d484994daab7e3886fcc9461355950b692862ca87eae32ef613ac"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-macos-x64.tar.gz"
      sha256 "bd5c8e5ff2ce3d99934b0dfac4b9f550e47795bd6b90c3788016322478ac2d31"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-linux-arm64.tar.gz"
      sha256 "b2493e02969d9d5c48f97eee316974d5074f01516268a22325e1cbea7b38f223"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-linux-x64.tar.gz"
      sha256 "c4d01a1b1d33350822703a1a61d44b4aaffcbe4a87d143905db99eaf85d1c2bd"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
