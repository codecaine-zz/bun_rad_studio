# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
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
      sha256 "84c51ae617257209a987f7ac129119917852a929107f32e2fc05e5a157695159"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.2/bun-rad-studio-v1.6.2-macos-x64.tar.gz"
      sha256 "e79594ec90b7ac6814cf863cfd59894fd3cde4393db4a2af3fb34b5f73486398"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.2/bun-rad-studio-v1.6.2-linux-arm64.tar.gz"
      sha256 "3c984fc09a42673c4642bb1b8f655172fe51796be13832f94fd5e0af0e990c3b"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.2/bun-rad-studio-v1.6.2-linux-x64.tar.gz"
      sha256 "11c0ebb891effcf91f707bc69a908be9cfb46be4558c50bf5e9dea61535abbbb"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
