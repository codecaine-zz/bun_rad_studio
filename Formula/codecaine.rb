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
      sha256 "4055729475a1db1f8aa82085fb84a1cf7e366aac5ed5f425438dee8ae53577c6"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-macos-x64.tar.gz"
      sha256 "fc58cee53f596d20021a50fd3b6df9262ad4e4cb422e23c75007d932e1d88b34"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-linux-arm64.tar.gz"
      sha256 "05b5135e2686950011200f2e5d38d5d136e0cc65d8e142b6bb4b47fc7c202707"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-linux-x64.tar.gz"
      sha256 "fb6d4e47133cf478a85a01f3bc5a61e5c9fa73dec8f52af67af419984492ddff"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
