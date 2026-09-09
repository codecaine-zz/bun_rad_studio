import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export function createAppBundlerStudio(): SimpleWindow {
  const win = newSimpleWindow("App Bundler Studio Pro -- macOS .app Bundle & DMG Builder", 1140, 880, {
    appId: "app_bundler_studio",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  // Title Row
  win.beginRow();
  win.addHeading("App Bundler Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center");
  win.endRow();

  // App Identity Configuration
  win.beginGroupBox("Application Identity & Bundle Metadata");
  win.beginRow();
  win.addLabel("lbl_app_name", "Application Name:");
  win.addInput("txt_app_name", "OmniTool Studio").width(240);
  win.addLabel("lbl_bundle_id", "Bundle Identifier:");
  win.addInput("txt_bundle_id", "com.codecaine.omnitool").width(260);
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_version", "Version:");
  win.addInput("txt_version", "1.0.0").width(120);
  win.addLabel("lbl_icon_preset", "Icon Preset:");
  win.addDropdown("dd_icon_preset", [
    "1. Developer Tools (Terminal/Code)",
    "2. Database & Studio",
    "3. Media & Graphics",
    "4. Security & Cryptography",
    "5. System Utility",
  ], "1. Developer Tools (Terminal/Code)");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_exec_path", "Executable / Script Path:");
  win.addInput("txt_exec_path", process.cwd() + "/applications/omnitool_studio.ts").width(520);
  win.endRow();
  win.endGroupBox();

  // Bundle Options
  win.beginGroupBox("macOS Packaging & Security Options");
  win.beginRow();
  win.addCheckbox("chk_codesign", "Ad-hoc Code Sign (codesign -s -)", true);
  win.addCheckbox("chk_high_dpi", "High Resolution Capable (Retina NSHighResolutionCapable)", true);
  win.addCheckbox("chk_dark_mode", "Dark Mode Supported (NSRequiresAquaSystemAppearance=NO)", true);
  win.addCheckbox("chk_open_finder", "Reveal in Finder upon completion", false);
  win.endRow();

  win.beginRow();
  win.addButton("btn_build_bundle", "🚀 Build .app Bundle");
  win.addButton("btn_preview_plist", "Preview Info.plist");
  win.addButton("btn_build_dmg", "💿 Build DMG Archive");
  win.endRow();
  win.endGroupBox();

  // Preview Box
  win.beginGroupBox("Generated Info.plist / Bundle Manifest Preview");
  win.addTextarea("txt_plist_preview", `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>OmniTool Studio</string>
  <key>CFBundleIdentifier</key>
  <string>com.codecaine.omnitool</string>
  <key>CFBundleName</key>
  <string>OmniTool Studio</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSRequiresAquaSystemAppearance</key>
  <false/>
</dict>
</plist>`);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Bundler Execution & Build Log");
  win.addConsole("bundler_console", 100);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Target Output: ~/Desktop or ./dist  |  macOS Cocoa Ready");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("App Bundler configuration saved successfully!");
  });

  const generatePlist = (name: string, id: string, ver: string) => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${name}</string>
  <key>CFBundleIdentifier</key>
  <string>${id}</string>
  <key>CFBundleName</key>
  <string>${name}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${ver}</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSRequiresAquaSystemAppearance</key>
  <false/>
</dict>
</plist>`;
  };

  win.onClick("btn_preview_plist", () => {
    const name = win.getValue("txt_app_name") || "MyApp";
    const id = win.getValue("txt_bundle_id") || "com.app";
    const ver = win.getValue("txt_version") || "1.0.0";
    const plist = generatePlist(name, id, ver);
    win.setText("txt_plist_preview", plist);
    win.appendConsole("bundler_console", `[Bundler] Generated Info.plist preview for ${name}\n`, 1);
  });

  win.onClick("btn_build_bundle", () => {
    const name = win.getValue("txt_app_name") || "MyApp";
    const id = win.getValue("txt_bundle_id") || "com.app";
    const ver = win.getValue("txt_version") || "1.0.0";
    const execPath = win.getValue("txt_exec_path") || "";

    win.appendConsole("bundler_console", `[Bundler] Starting .app bundle creation for "${name}"...\n`, 1);
    win.setStatus(`Building ${name}.app...`);

    const distDir = join(process.cwd(), "dist");
    const appDir = join(distDir, `${name}.app`);
    const contentsDir = join(appDir, "Contents");
    const macosDir = join(contentsDir, "MacOS");
    const resDir = join(contentsDir, "Resources");

    try {
      mkdirSync(macosDir, { recursive: true });
      mkdirSync(resDir, { recursive: true });

      const plist = generatePlist(name, id, ver);
      writeFileSync(join(contentsDir, "Info.plist"), plist);

      // Launcher script
      const launcherPath = join(macosDir, name);
      const launcherScript = `#!/bin/bash\nexec bun run "${execPath}" "$@"\n`;
      writeFileSync(launcherPath, launcherScript, { mode: 0o755 });

      win.appendConsole("bundler_console", `[Bundler] Created bundle structure: ${appDir}\n`, 2);

      const sign = win.getValue("chk_codesign") === "true" || win.getValue("chk_codesign") === true;
      if (sign) {
        const [out, code] = Sys.exec(`codesign --force --deep --sign - "${appDir}"`);
        win.appendConsole("bundler_console", `[Codesign] Ad-hoc signature applied (exit ${code})\n`, code === 0 ? 2 : 3);
      }

      win.appendConsole("bundler_console", `[Bundler] ${name}.app built successfully in dist/ directory!\n`, 2);
      win.setStatus(`Build complete: ${name}.app`);
      win.toast(`Built ${name}.app`);
    } catch (e: any) {
      win.appendConsole("bundler_console", `[Bundler Error] ${e.message}\n`, 3);
      win.setStatus(`Build Error: ${e.message}`);
    }
  });

  return win;
}

if (import.meta.main) {
  const win = createAppBundlerStudio();
  console.log("Launching App Bundler Studio Pro...");
  win.run();
}
