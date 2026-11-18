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
      sha256 "521fb196d8e07c7a99dc34b53e5c09212190de942859d00caf78bdc867e59bd6"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-macos-x64.tar.gz"
      sha256 "ca8780b673fac8b7a5b54781a58e188c2260cda0faebe53dab992fe98d11cf37"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-linux-arm64.tar.gz"
      sha256 "7c18e2ddde4ac7bb9d0415c6c77387f58f1cce1e8bf4647ef583aad4aa02487e"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.3/bun-rad-studio-v1.6.3-linux-x64.tar.gz"
      sha256 "8c33dad64f7282573364140b4b47dd2ce18dc8b40c67c939342e89cd65a21937"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
