# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"
  version "1.6.0"
  license "MIT"

  head do
    url "https://github.com/codecaine-zz/bun_rad_studio.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.0/bun-rad-studio-v1.6.0-macos-arm64.tar.gz"
      sha256 "87fbe9259f93e3678e38b9cc9bce853c9598a0595e08c87daeaa6aab77efe823"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.0/bun-rad-studio-v1.6.0-macos-x64.tar.gz"
      sha256 "fd287987113226eaee5e89b25c82ca1bad8f4516860e16306d9e535602b9ba6f"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.0/bun-rad-studio-v1.6.0-linux-arm64.tar.gz"
      sha256 "536536fc3852d9c64c8afe0e4731d308b89fbbd4078198991af0606083cc0023"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.6.0/bun-rad-studio-v1.6.0-linux-x64.tar.gz"
      sha256 "69f537969b24e055511feb51590cb9aade222ddbb1a0aa204101d526351f1501"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
