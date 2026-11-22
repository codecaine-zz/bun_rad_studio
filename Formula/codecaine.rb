# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
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

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
