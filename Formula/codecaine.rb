# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.6.5"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.5/bun-rad-studio-v1.6.5-macos-arm64.tar.gz"
      sha256 "b91dccf3370d4261006425a5e05492ec4c3f2d36e790a7a482244cc5b528aed8"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.5/bun-rad-studio-v1.6.5-macos-x64.tar.gz"
      sha256 "ec1b3ac8a1db7009fe996a98f6b4c9d6a2369164d2675bde0a207818b6de92db"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.5/bun-rad-studio-v1.6.5-linux-arm64.tar.gz"
      sha256 "bc5aac82e63e873c8646fd06f827635332f4e296fbf6d1c080ce622094525bea"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.5/bun-rad-studio-v1.6.5-linux-x64.tar.gz"
      sha256 "6a1bdd62231cf96b53457069b15bbd12c24faf9846fe5df9f3a280352a03fd34"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
