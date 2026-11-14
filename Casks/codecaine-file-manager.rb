cask "codecaine-file-manager" do
  arch arm: "arm64", intel: "x64"

  version "1.5.8"
  sha256 arm:   "00d61ae05d0acc3af1bfacd0664f96ab929919e4110c777e640638b8904d9756",
         intel: "4167a913b916573f91018c4b7a7a8d66b0743165d4daf78012a0c8d9fe859f23"

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
