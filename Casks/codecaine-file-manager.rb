cask "codecaine-file-manager" do
  arch arm: "arm64", intel: "x64"

  version "1.5.8"
  sha256 arm:   "63121d41ce824d026babc3a5c76f421aec42c110ae20112a5a7038876148387c",
         intel: "083bb6be22f53d0efcba6fff3dcd804fe7a14e94769b3fec5ee0f16bf5c52eca"

  url "https://github.com/codecaine-zz/bun_rad_studio/releases/download/v#{version}/Codecaine-File-Manager-v#{version}-macos-#{arch}.zip"
  name "Codecaine File Manager"
  desc "Dual-pane developer file manager with database studios, IDE, and vault"
  homepage "https://github.com/codecaine-zz/bun_rad_studio"

  depends_on macos: :monterey

  app "Codecaine File Manager.app"

  if respond_to?(:postflight_steps)
    postflight_steps do
      run "/usr/bin/xattr",
          args:           ["-dr", "com.apple.quarantine", "{{appdir}}/Codecaine File Manager.app"],
          writable_paths: ["Codecaine File Manager.app"],
          writable_base:  :appdir,
          must_succeed:   false
    end
  else
    postflight do
      system_command "/usr/bin/xattr",
                     args: ["-dr", "com.apple.quarantine", "#{appdir}/Codecaine File Manager.app"],
                     sudo: false
    end
  end

  zap trash: [
    "~/.bun_rad_studio",
  ]
end
