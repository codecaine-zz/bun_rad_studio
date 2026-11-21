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
      sha256 "32cf217a35485db386a8354f92d903e73f94faf74c82f5378ec9ed80882d9526"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-macos-x64.tar.gz"
      sha256 "4325fb3ff9a0915398f4a78f5fdbde853f9b9aaad53406b7bb3515af16674a17"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-linux-arm64.tar.gz"
      sha256 "8667a173ba3f27aa342ae3c3c0d25e584b56d0f97dfd908f9276dccf40e63b33"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-linux-x64.tar.gz"
      sha256 "de8082bca073d1af92cfd408c905ec11cbe9ae9499118d528144e9b5c6ea44e2"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
