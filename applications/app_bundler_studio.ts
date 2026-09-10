import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, resolve, basename } from "path";

export function createAppBundlerStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const fullscreen = options.fullscreen ?? true;
  const win = newSimpleWindow("App Bundler Studio Pro -- Enterprise Binary & macOS .app Compiler", 1160, 920, {
    appId: "app_bundler_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen,
  });

  // Title Row
  win.beginRow();
  win.addHeading("App Bundler Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption("Enterprise Standalone Executable Compiler (bun build --compile) & macOS .app Bundler");

  // App Identity Configuration
  win.beginGroupBox("Application Identity & Compilation Targets");
  win.beginRow();
  win.addLabel("lbl_app_name", "Application Name:");
  win.addInput("txt_app_name", "DevToolsStudio").width(220);
  win.addLabel("lbl_target", "Target Binary:");
  win.addDropdown(
    "dd_target",
    [
      "Native Host (Auto)",
      "bun-darwin-arm64 (macOS Apple Silicon)",
      "bun-darwin-x64 (macOS Intel)",
      "bun-linux-x64 (Linux Server)",
      "bun-windows-x64 (Windows x64)",
    ],
    "Native Host (Auto)"
  ).width(260);
  win.addButton("btn_compile_binary", "⚡ Compile Standalone Binary");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_exec_path", "Entry Script:");
  win.addInput("txt_exec_path", "./applications/devtools_studio.ts").width(440);
  win.addLabel("lbl_version", "Version:");
  win.addInput("txt_version", "1.0.0").width(120);
  win.addButton("btn_build_bundle", "🍎 Build macOS .app");
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_minify", "Minify Bytecode (--minify)", true);
  win.addCheckbox("chk_sourcemap", "Include Sourcemaps", false);
  win.addCheckbox("chk_codesign", "Ad-hoc Codesign (codesign -s -)", true);
  win.addCheckbox("chk_retina", "Retina High-DPI Support", true);
  win.endRow();
  win.endGroupBox();

  // Preview Box
  win.beginGroupBox("Generated Bundle Manifest / Compiler Configuration");
  win.addTextarea(
    "txt_plist_preview",
    `# Enterprise Compiler Spec
Target Binary: Native Host
Entrypoint:    ./applications/devtools_studio.ts
Output Dir:    ./dist
Flags:         --compile --minify
Status:        Ready to produce self-contained single-executable zero-dependency binary.`
  ).height(75);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Compiler Execution, Codesign & Artifact Telemetry");
  win.addConsole("bundler_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Output: ./dist  |  Compiler: Bun Built-In Bytecode Engine");
  win.endRow();

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

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Bundler configuration saved successfully!");
  });

  win.onClick("btn_compile_binary", async () => {
    const name = win.getValue("txt_app_name") || "app";
    const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
    const targetChoice = win.getValue("dd_target") || "";
    const minify = win.getValue("chk_minify");

    const distDir = resolve(process.cwd(), "dist");
    mkdirSync(distDir, { recursive: true });
    const outBin = join(distDir, name);

    let targetFlag = "";
    if (targetChoice.includes("darwin-arm64")) targetFlag = "--target=bun-darwin-arm64";
    else if (targetChoice.includes("darwin-x64")) targetFlag = "--target=bun-darwin-x64";
    else if (targetChoice.includes("linux-x64")) targetFlag = "--target=bun-linux-x64";
    else if (targetChoice.includes("windows-x64")) targetFlag = "--target=bun-windows-x64";

    const compileCmd = `bun build ${entry} --compile --outfile="${outBin}" ${minify ? "--minify" : ""} ${targetFlag}`;

    win.appendConsole("bundler_console", `[Compiler] Executing: ${compileCmd}...\n`, 1);
    win.setStatus(`Compiling standalone binary ${name}...`);

    const t0 = performance.now();
    const [out, code] = Sys.exec(compileCmd);
    const elapsed = (performance.now() - t0).toFixed(1);

    if (code === 0 && existsSync(outBin)) {
      const sz = (statSync(outBin).size / 1024 / 1024).toFixed(2);
      win.appendConsole("bundler_console", `[Success] Single-executable compiled in ${elapsed}ms!\n  Artifact: ${outBin} (${sz} MB)\n`, 2);
      win.setText("lbl_status", `Compiled: ${name} (${sz} MB)  |  Latency: ${elapsed}ms  |  Status: OK`);
      win.setStatus(`Compiled in ${elapsed}ms (${sz} MB)`);
      win.toast(`Compiled ${name} (${sz} MB)`);
    } else {
      win.appendConsole("bundler_console", `[Compile Error] ${out}\n`, 3);
      win.setStatus("Compilation Failed");
    }
  });

  win.onClick("btn_build_bundle", () => {
    const name = win.getValue("txt_app_name") || "MyApp";
    const id = `com.enterprise.${name.toLowerCase()}`;
    const ver = win.getValue("txt_version") || "1.0.0";
    const execPath = win.getValue("txt_exec_path") || "";

    win.appendConsole("bundler_console", `[Bundler] Packaging macOS .app bundle for "${name}"...\n`, 1);
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
      win.setText("txt_plist_preview", plist);

      // Launcher script
      const launcherPath = join(macosDir, name);
      const launcherScript = `#!/bin/bash\nexec bun run "${execPath}" "$@"\n`;
      writeFileSync(launcherPath, launcherScript, { mode: 0o755 });

      const sign = win.getValue("chk_codesign");
      if (sign) {
        const [out, code] = Sys.exec(`codesign --force --deep --sign - "${appDir}" 2>&1`);
        win.appendConsole("bundler_console", `[Codesign] Ad-hoc signature: ${out} (exit ${code})\n`, code === 0 ? 2 : 3);
      }

      win.appendConsole("bundler_console", `[Success] ${name}.app assembled in dist/ directory.\n`, 2);
      win.setStatus(`Assembled ${name}.app`);
      win.toast(`Built ${name}.app`);
    } catch (e: any) {
      win.appendConsole("bundler_console", `[Bundler Error] ${e.message}\n`, 3);
      win.setStatus(`Bundle Error: ${e.message}`);
    }
  });

  win.onClick("btn_fullscreen", () => win.toggleFullscreen());

  return win;
}

if (import.meta.main) {
  const win = createAppBundlerStudio({ fullscreen: true });
  console.log("⚡ Launching App Bundler Studio Pro (Fullscreen)...");
  win.run();
}
