cask "codecaine-file-manager" do
  arch arm: "arm64", intel: "x64"

  version "1.6.5"
  sha256 arm:   "51dc6799ed9469852758d2741754922753d9fce5f75fd3f570c88f46cf99cf98",
         intel: "92e5dbc8148782080ecb8f0001b9f8da7d7f08e59cc7009587d4d2f6f1a01b94"

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
