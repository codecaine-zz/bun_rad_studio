# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.6.1"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.1/bun-rad-studio-v1.6.1-macos-arm64.tar.gz"
      sha256 "6ae42bda02aad52429311f7f67ab8d80bc4c7ce92b4b455fa6c7867d40e519ab"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.1/bun-rad-studio-v1.6.1-macos-x64.tar.gz"
      sha256 "3f8223df5d403c6e05b4b7aef3c47afe26bd5491cbb9fc9b1266fe41f4c2b1e9"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.1/bun-rad-studio-v1.6.1-linux-arm64.tar.gz"
      sha256 "a80ba1661d6e045e326b0f825ffdde3c29cb6f2b58b2c124d725d56c4da3b3d6"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.1/bun-rad-studio-v1.6.1-linux-x64.tar.gz"
      sha256 "6a230449612f509431b823342fd36bc9f3291d9374b88b3f5ee7785b93e2b876"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
