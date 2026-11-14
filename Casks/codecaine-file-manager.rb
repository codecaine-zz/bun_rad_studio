cask "codecaine-file-manager" do
  arch arm: "arm64", intel: "x64"

  version "1.5.4"
  sha256 arm:   "4b54b6d5d56050d0e386904fc87de63a0a9893bb4522b5d88a648f4fc4176114",
         intel: "27fcd1b0c64eea826e8d6ebdb6c75f07f5b4ba1595333622cfa1be28018ba096"

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
