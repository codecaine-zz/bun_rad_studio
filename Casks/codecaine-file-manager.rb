cask "codecaine-file-manager" do
  arch arm: "arm64", intel: "x64"

  version "1.6.0"
  sha256 arm:   "a75ab1bd78fc9d2736dc7f11557c53905dc8d7e9aec1a0c49daac4d3a1b3e9a4",
         intel: "d15f8e65fd5794db40a9ec9c768f2b4e3815f7f2726ede1001e17a5a8a264369"

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
