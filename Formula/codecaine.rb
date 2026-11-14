# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.5.7"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.7/bun-rad-studio-v1.5.7-macos-arm64.tar.gz"
      sha256 "1fd5f3c97670d821de74e23784d73db1d7292f14b99c770fb91c3d60b1c49b5f"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.7/bun-rad-studio-v1.5.7-macos-x64.tar.gz"
      sha256 "0cc2dc3133c81867f915368698c7ca795cfa3325033c64166da39cb83790d725"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.7/bun-rad-studio-v1.5.7-linux-arm64.tar.gz"
      sha256 "08eee72fcf42f1510e3d7dbb0abb8f043b080f2a29d0f3b3f7235f68da004751"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.7/bun-rad-studio-v1.5.7-linux-x64.tar.gz"
      sha256 "9ff07d4988dc76ba57aefa2e7cdf0bd5444c8e284726a80adf92bf2783eec29e"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
