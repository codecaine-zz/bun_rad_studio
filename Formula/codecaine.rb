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
      sha256 "f7542e90daf74ebc01311c05a74706330bbe34631a010e7af0aada806a25f0f8"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-macos-x64.tar.gz"
      sha256 "9df39163c9261544dca1ce41adc556fa335faa9628af8d8976d638886f7cc0b9"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-linux-arm64.tar.gz"
      sha256 "95705a5ddb8cff95bc9bb12847c620cb2e50f1336ef0af2d5855be8f9f02fa47"
    else
      url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v1.5.4/bun-rad-studio-v1.5.4-linux-x64.tar.gz"
      sha256 "2018781d92cf77d8de2ec12356384b429a2bc348613544d36a67406d0afb8fe2"
    end
  end

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
