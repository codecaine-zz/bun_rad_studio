import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { writeFileSync, mkdirSync, existsSync, statSync, readdirSync, chmodSync, copyFileSync, rmSync } from "fs";
import { join, resolve, basename } from "path";

// -------------------------------------------------------------------------------------------------
// Application Detection & Helper Utilities
// -------------------------------------------------------------------------------------------------

export function deriveAppName(filepath: string): string {
  const base = basename(filepath).replace(/\.(ts|js|tsx|jsx|mjs)$/i, "");
  const knownMap: Record<string, string> = {
    api_studio: "ApiStudioPro",
    app_bundler_studio: "AppBundlerStudioPro",
    brew_studio: "BrewStudioPro",
    color_studio: "ColorStudioPro",
    crypto_studio: "CryptoStudioPro",
    database_studio: "DatabaseStudioPro",
    dataconvert_studio: "DataConvertStudioPro",
    devtools_studio: "DevToolsStudio",
    env_studio: "EnvStudioPro",
    git_studio: "GitStudioPro",
    jq_studio: "JqStudioPro",
    json_studio: "JsonStudioPro",
    markdown_studio: "MarkdownStudioPro",
    network_studio: "NetworkStudioPro",
    omnitool_studio: "OmniToolStudioPro",
    process_studio: "ProcessStudioPro",
    redis_studio: "RedisStudioPro",
    redis_studio_server: "RedisStudioServer",
    regex_studio: "RegexStudioPro",
    sqlite_studio: "SqliteStudioPro",
    sqlite_studio_server: "SqliteStudioServer",
    system_studio: "SystemStudioPro",
    system_studio_server: "SystemStudioServer",
    task_manager: "TaskManagerStudio",
    watcher_studio: "WatcherStudioPro",
    watchexec_studio: "WatchExecStudioPro",
  };
  if (knownMap[base.toLowerCase()]) {
    return knownMap[base.toLowerCase()];
  }
  return (
    base
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("") || "CustomApp"
  );
}

export function getHumanLabel(filepath: string): string {
  const file = basename(filepath);
  const base = file.replace(/\.(ts|js|tsx|jsx|mjs)$/i, "");
  const knownTitles: Record<string, string> = {
    api_studio: "API Testing Studio Pro",
    app_bundler_studio: "App Bundler Studio Pro",
    brew_studio: "Homebrew Package Studio",
    color_studio: "Color Palette Studio",
    crypto_studio: "Cryptography & Hashing Studio",
    database_studio: "Unified Database Studio",
    dataconvert_studio: "Data Format Converter Studio",
    devtools_studio: "DevTools Studio",
    env_studio: "Environment Variable Studio",
    git_studio: "Git Version Control Studio",
    jq_studio: "JQ JSON Query Studio",
    json_studio: "JSON Formatter Studio",
    markdown_studio: "Markdown Live Editor Studio",
    network_studio: "Network Diagnostics Studio",
    omnitool_studio: "OmniTool Studio Pro",
    process_studio: "Process Monitor Studio",
    redis_studio: "Redis Studio Pro",
    redis_studio_server: "Redis Studio (Server)",
    regex_studio: "Regex Pattern Testing Studio",
    sqlite_studio: "SQLite Studio Pro",
    sqlite_studio_server: "SQLite Studio (Server)",
    system_studio: "System Monitor Studio",
    system_studio_server: "System Studio (Server)",
    task_manager: "Task Manager & Process Studio",
    watcher_studio: "Filesystem Watcher Studio",
    watchexec_studio: "WatchExec Studio Pro",
  };
  const title = knownTitles[base.toLowerCase()] || deriveAppName(file);
  return `${title} (${file})`;
}

export function getAvailableApplications(): { path: string; label: string; appName: string }[] {
  const appsDir = resolve(process.cwd(), "applications");
  const list: { path: string; label: string; appName: string }[] = [];

  if (existsSync(appsDir)) {
    try {
      const files = readdirSync(appsDir)
        .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts") && !f.includes("_server."))
        .sort();

      for (const file of files) {
        const relPath = `./applications/${file}`;
        const appName = deriveAppName(file);
        const label = getHumanLabel(file);
        list.push({ path: relPath, label, appName });
      }
    } catch {
      // fallback
    }
  }

  if (list.length === 0) {
    list.push({
      path: "./applications/devtools_studio.ts",
      label: "DevTools Studio (./applications/devtools_studio.ts)",
      appName: "DevToolsStudio",
    });
  }

  return list;
}

export function normalizeScriptPath(fullPath: string): string {
  const cwd = process.cwd();
  if (fullPath.startsWith(cwd)) {
    let rel = fullPath.slice(cwd.length);
    if (rel.startsWith("/") || rel.startsWith("\\")) {
      rel = rel.slice(1);
    }
    return "./" + rel.replace(/\\/g, "/");
  }
  return fullPath;
}

export function pickApplicationFile(): string | null {
  try {
    if (process.platform === "darwin") {
      const defaultLoc = existsSync(join(process.cwd(), "applications"))
        ? join(process.cwd(), "applications")
        : process.cwd();
      const safeLoc = defaultLoc.replace(/"/g, '\\"');
      const script = `try
POSIX path of (choose file with prompt "Select Application Entry Script (.ts, .js)" default location (POSIX file "${safeLoc}"))
on error
return ""
end try`;
      const proc = Bun.spawnSync(["osascript", "-e", script]);
      const out = proc.stdout.toString().trim();
      return out || null;
    } else if (process.platform === "linux") {
      const proc = Bun.spawnSync([
        "zenity",
        "--file-selection",
        "--title=Select Application Entry Script",
        "--file-filter=TypeScript/JavaScript (*.ts *.js *.tsx *.jsx)|*.ts *.js *.tsx *.jsx",
        "--file-filter=All Files|*",
      ]);
      const out = proc.stdout.toString().trim();
      return out || null;
    } else if (process.platform === "win32") {
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Select Application Entry Script'; $f.Filter = 'TypeScript / JavaScript (*.ts;*.js;*.tsx;*.jsx)|*.ts;*.js;*.tsx;*.jsx|All Files (*.*)|*.*'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$f.FileName}`;
      const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", psScript]);
      const out = proc.stdout.toString().trim();
      return out || null;
    }
  } catch {
    // fallback
  }
  return null;
}

export function getAvailableIcons(): { path: string; label: string; name: string }[] {
  const iconsDir = resolve(process.cwd(), "icons");
  const list: { path: string; label: string; name: string }[] = [];

  if (existsSync(iconsDir)) {
    try {
      const files = readdirSync(iconsDir)
        .filter((f) => f.endsWith(".icns") || f.endsWith(".png") || f.endsWith(".ico"))
        .sort();

      for (const file of files) {
        const relPath = `./icons/${file}`;
        const name = file.replace(/\.(icns|png|ico)$/i, "");
        const ext = file.split(".").pop()?.toUpperCase() || "";
        const label = `${name} [${ext}] (${relPath})`;
        list.push({ path: relPath, label, name });
      }
    } catch {
      // fallback
    }
  }

  if (list.length === 0) {
    list.push({
      path: "./icons/app_default.icns",
      label: "App Default [ICNS] (./icons/app_default.icns)",
      name: "app_default",
    });
  }

  return list;
}

export function pickIconFile(): string | null {
  try {
    if (process.platform === "darwin") {
      const defaultLoc = existsSync(join(process.cwd(), "icons"))
        ? join(process.cwd(), "icons")
        : process.cwd();
      const safeLoc = defaultLoc.replace(/"/g, '\\"');
      const script = `try
POSIX path of (choose file with prompt "Select Application Icon (.icns, .png, .ico)" default location (POSIX file "${safeLoc}"))
on error
return ""
end try`;
      const proc = Bun.spawnSync(["osascript", "-e", script]);
      const out = proc.stdout.toString().trim();
      return out || null;
    } else if (process.platform === "linux") {
      const proc = Bun.spawnSync([
        "zenity",
        "--file-selection",
        "--title=Select Application Icon",
        "--file-filter=Icons (*.icns *.png *.ico)|*.icns *.png *.ico",
        "--file-filter=All Files|*",
      ]);
      const out = proc.stdout.toString().trim();
      return out || null;
    } else if (process.platform === "win32") {
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Title = 'Select Application Icon'; $f.Filter = 'Icon Files (*.icns;*.png;*.ico)|*.icns;*.png;*.ico|All Files (*.*)|*.*'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){$f.FileName}`;
      const proc = Bun.spawnSync(["powershell", "-NoProfile", "-Command", psScript]);
      const out = proc.stdout.toString().trim();
      return out || null;
    }
  } catch {
    // fallback
  }
  return null;
}

export function bundleIcon(iconPath: string, appDir: string): { success: boolean; message: string } {
  if (!iconPath || !iconPath.trim()) {
    return { success: true, message: "No icon specified (skipping icon bundle)" };
  }

  const absIcon = resolve(process.cwd(), iconPath);
  if (!existsSync(absIcon)) {
    return { success: false, message: `Icon file not found: ${iconPath}` };
  }

  const resDir = join(appDir, "Contents", "Resources");
  mkdirSync(resDir, { recursive: true });
  const destIcns = join(resDir, "AppIcon.icns");

  // If already .icns, directly copy it
  if (absIcon.toLowerCase().endsWith(".icns")) {
    try {
      copyFileSync(absIcon, destIcns);
      return { success: true, message: `Copied .icns icon directly to AppIcon.icns` };
    } catch (e: any) {
      return { success: false, message: `Failed copying .icns icon: ${e.message}` };
    }
  }

  // If PNG on macOS, convert using built-in sips and iconutil
  if (process.platform === "darwin" && absIcon.toLowerCase().endsWith(".png")) {
    const tmpIconset = join(resDir, "AppIcon.iconset");
    try {
      if (existsSync(tmpIconset)) rmSync(tmpIconset, { recursive: true, force: true });
      mkdirSync(tmpIconset, { recursive: true });

      const sizes = [16, 32, 64, 128, 256, 512, 1024];
      for (const sz of sizes) {
        Bun.spawnSync(["sips", "-z", sz.toString(), sz.toString(), absIcon, "--out", join(tmpIconset, `icon_${sz}x${sz}.png`)]);
        if (sz <= 512) {
          const sz2x = sz * 2;
          Bun.spawnSync(["sips", "-z", sz2x.toString(), sz2x.toString(), absIcon, "--out", join(tmpIconset, `icon_${sz}x${sz}@2x.png`)]);
        }
      }

      const iconutilProc = Bun.spawnSync(["iconutil", "-c", "icns", tmpIconset, "-o", destIcns]);
      if (existsSync(tmpIconset)) rmSync(tmpIconset, { recursive: true, force: true });

      if (iconutilProc.exitCode === 0 && existsSync(destIcns)) {
        return { success: true, message: `Converted PNG to high-res multi-tier AppIcon.icns via iconutil` };
      }
    } catch (e: any) {
      if (existsSync(tmpIconset)) rmSync(tmpIconset, { recursive: true, force: true });
      // fallback to plain copy below
    }
  }

  // Fallback: copy file as AppIcon.png or AppIcon.icns
  try {
    const ext = absIcon.split(".").pop() || "png";
    const destFallback = join(resDir, `AppIcon.${ext}`);
    copyFileSync(absIcon, destFallback);
    return { success: true, message: `Copied icon as AppIcon.${ext}` };
  } catch (e: any) {
    return { success: false, message: `Failed copying fallback icon: ${e.message}` };
  }
}


export function ensureAssetsCopied(distDir: string, appDir?: string) {
  const rootIdeHtml = resolve(process.cwd(), "src", "ide.html");
  if (existsSync(rootIdeHtml)) {
    const distSrc = join(distDir, "src");
    mkdirSync(distSrc, { recursive: true });
    try { copyFileSync(rootIdeHtml, join(distSrc, "ide.html")); } catch {}

    if (appDir) {
      const resSrc = join(appDir, "Contents", "Resources", "src");
      mkdirSync(resSrc, { recursive: true });
      try { copyFileSync(rootIdeHtml, join(resSrc, "ide.html")); } catch {}
      const macosSrc = join(appDir, "Contents", "MacOS", "src");
      mkdirSync(macosSrc, { recursive: true });
      try { copyFileSync(rootIdeHtml, join(macosSrc, "ide.html")); } catch {}
    }
  }
}

function updatePreview(win: SimpleWindow) {
  const name = win.getValue("txt_app_name") || "app";
  const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
  const targetChoice = win.getValue("dd_target") || "Native Host (Auto)";
  const minify = win.getValue("chk_minify");
  const sign = win.getValue("chk_codesign");
  const ver = win.getValue("txt_version") || "1.0.0";
  const iconPath = win.getValue("txt_icon_path") || win.getValue("dd_preset_icon") || "None (Default)";

  const preview = `# Enterprise Compiler Spec
Application:   ${name} (v${ver})
Target Binary: ${targetChoice}
Entrypoint:    ${entry}
Icon:          ${iconPath}
Output Dir:    ./dist
Flags:         --compile ${minify ? "--minify" : ""}${sign ? " [macOS Ad-hoc Codesign]" : ""}
Status:        Ready to produce self-contained single-executable zero-dependency binary.`;

  win.setText("txt_plist_preview", preview);
}

export function loadApplicationIntoWindow(win: SimpleWindow, scriptPath: string) {
  const normPath = normalizeScriptPath(scriptPath);
  const appName = deriveAppName(scriptPath);

  win.setValue("txt_exec_path", normPath);
  win.setValue("txt_app_name", appName);
  win.setValue("dd_preset_app", normPath);

  // Auto-match icon from ./icons/ if matching name exists
  const fileBase = basename(scriptPath).replace(/\.(ts|js|tsx|jsx|mjs)$/i, "").toLowerCase();
  const iconAliases: Record<string, string> = {
    sqlite_studio: "database_studio",
    sqlite_studio_server: "database_studio",
    redis_studio_server: "redis_studio",
    system_studio_server: "system_studio",
    task_manager: "process_studio",
    watchexec_studio: "devtools_studio",
    watcher_studio: "system_studio",
    omnitool_studio: "devtools_studio",
    jq_studio: "devtools_studio",
    json_studio: "devtools_studio",
    brew_studio: "system_studio",
  };
  const targetBase = iconAliases[fileBase] || fileBase;

  const availableIcons = getAvailableIcons();
  const matchedIcon = availableIcons.find((ic) => {
    const icBase = ic.name.toLowerCase();
    return (
      icBase === targetBase ||
      icBase.replace(/_studio$/, "") === targetBase.replace(/_studio$/, "") ||
      icBase === fileBase ||
      icBase.replace(/_studio$/, "") === fileBase.replace(/_studio$/, "")
    );
  }) || availableIcons.find((ic) => ic.path.includes("app_default"));

  if (matchedIcon) {
    win.setValue("txt_icon_path", matchedIcon.path);
    win.setValue("dd_preset_icon", matchedIcon.path);
  }

  updatePreview(win);

  win.appendConsole(
    "bundler_console",
    `[Loader] Loaded application: "${appName}"\n  Script: ${normPath}\n  Icon: ${matchedIcon?.path || "none"}\n  Status: Ready to compile or package.\n`,
    2
  );
  win.setText("lbl_status", `Loaded: ${appName}  |  Script: ${normPath}  |  Status: Ready`);
  win.setStatus(`Loaded: ${appName}`);
  win.toast(`Loaded: ${appName}`);
}

export function createAppBundlerStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const fullscreen = options.fullscreen ?? true;
  const win = newSimpleWindow("App Bundler Studio Pro -- Enterprise Binary & macOS .app Compiler", 1160, 920, {
    appId: "app_bundler_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen,
  });

  const availableApps = getAvailableApplications();
  const defaultApp = availableApps.find((a) => a.path.includes("devtools_studio")) || availableApps[0];
  const defaultAppPath = defaultApp.path;
  const defaultAppName = defaultApp.appName;

  const appPaths = availableApps.map((a) => a.path);
  const appLabels: Record<string, string> = {};
  for (const a of availableApps) {
    appLabels[a.path] = a.label;
  }

  // Title Row
  win.beginRow();
  win.addHeading("App Bundler Studio Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save Config");
  win.addButton("btn_center", "Center Window");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.endRow();
  win.addCaption("Enterprise Standalone Executable Compiler (bun build --compile) & macOS .app Bundler");

  const availableIcons = getAvailableIcons();
  const defaultIcon = availableIcons.find((ic) => ic.path.includes("devtools_studio")) || availableIcons[0];
  const defaultIconPath = defaultIcon?.path || "./icons/app_default.icns";
  const iconPaths = availableIcons.map((ic) => ic.path);
  const iconLabels: Record<string, string> = {};
  for (const ic of availableIcons) {
    iconLabels[ic.path] = ic.label;
  }

  // App Identity Configuration
  win.beginGroupBox("Application Identity & Compilation Targets");

  // Browse & Preset Quick-Load Row
  win.beginRow();
  win.addLabel("lbl_preset_app", "Pre-Configured App:");
  win.addDropdown("dd_preset_app", appPaths, defaultAppPath, { item_labels: appLabels }).width(420);
  win.addButton("btn_load_app", "📥 Load App");
  win.addButton("btn_browse_app", "📂 Browse File...");
  win.addButton("btn_rescan", "🔄 Rescan");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_app_name", "Application Name:");
  win.addInput("txt_app_name", defaultAppName).width(240);
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
  win.addInput("txt_exec_path", defaultAppPath).width(360);
  win.addButton("btn_browse_script", "📂 Browse...");
  win.addLabel("lbl_version", "Version:");
  win.addInput("txt_version", "1.0.0").width(80);
  win.addButton("btn_build_bundle", "🍎 Build macOS .app");
  win.addButton("btn_open_dist", "📂 Reveal dist/");
  win.endRow();

  // App Icon Row (Browse & Select .icns, .png, .ico)
  win.beginRow();
  win.addLabel("lbl_preset_icon", "Application Icon:");
  win.addDropdown("dd_preset_icon", iconPaths, defaultIconPath, { item_labels: iconLabels }).width(320);
  win.addInput("txt_icon_path", defaultIconPath).width(280);
  win.addButton("btn_browse_icon", "📂 Browse Icon...");
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
Application:   ${defaultAppName} (v1.0.0)
Target Binary: Native Host (Auto)
Entrypoint:    ${defaultAppPath}
Output Dir:    ./dist
Flags:         --compile --minify [macOS Ad-hoc Codesign]
Status:        Ready to produce self-contained single-executable zero-dependency binary.`
  ).height(75);
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Compiler Execution, Codesign & Artifact Telemetry");
  win.addConsole("bundler_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", `Status: Ready  |  Loaded: ${defaultAppName}  |  Compiler: Bun Built-In Bytecode Engine`);
  win.endRow();

  const generatePlist = (name: string, id: string, ver: string) => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${name}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>${id}</string>
  <key>CFBundleName</key>
  <string>${name}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${ver}</string>
  <key>CFBundleVersion</key>
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

  win.onChange("dd_preset_app", (w, val) => {
    if (val && typeof val === "string") {
      loadApplicationIntoWindow(w, val);
    }
  });

  win.onClick("btn_load_app", (w) => {
    const chosen = w.getValue("dd_preset_app");
    if (chosen && typeof chosen === "string") {
      loadApplicationIntoWindow(w, chosen);
    } else {
      w.toast("Please select an application from the dropdown");
    }
  });

  const handleBrowse = async (w: SimpleWindow) => {
    w.setStatus("Opening file browser...");
    const picked = pickApplicationFile();
    if (picked) {
      loadApplicationIntoWindow(w, picked);
    } else {
      w.setStatus("Browse cancelled");
    }
  };

  win.onClick("btn_browse_app", handleBrowse);
  win.onClick("btn_browse_script", handleBrowse);

  win.onChange("dd_preset_icon", (w, val) => {
    if (val && typeof val === "string") {
      w.setValue("txt_icon_path", val);
      updatePreview(w);
    }
  });

  win.onClick("btn_browse_icon", async (w) => {
    w.setStatus("Opening icon browser...");
    const picked = pickIconFile();
    if (picked) {
      const norm = normalizeScriptPath(picked);
      w.setValue("txt_icon_path", norm);
      w.setValue("dd_preset_icon", norm);
      updatePreview(w);
      w.appendConsole("bundler_console", `[Icon] Selected application icon: ${norm}\n`, 2);
      w.toast(`Icon selected: ${basename(norm)}`);
      w.setStatus(`Icon: ${basename(norm)}`);
    } else {
      w.setStatus("Icon browse cancelled");
    }
  });

  win.onClick("btn_rescan", (w) => {
    const freshApps = getAvailableApplications();
    const optionsHtml = freshApps
      .map((a) => `<option value="${a.path.replace(/"/g, "&quot;")}">${a.label.replace(/</g, "&lt;")}</option>`)
      .join("");

    const freshIcons = getAvailableIcons();
    const iconOptionsHtml = freshIcons
      .map((i) => `<option value="${i.path.replace(/"/g, "&quot;")}">${i.label.replace(/</g, "&lt;")}</option>`)
      .join("");

    w.evalJS(`
      (function() {
        const sel = document.getElementById("dd_preset_app");
        if (sel) {
          const cur = sel.value;
          sel.innerHTML = ${JSON.stringify(optionsHtml)};
          sel.value = cur || ${JSON.stringify(freshApps[0]?.path || "")};
        }
        const selIcon = document.getElementById("dd_preset_icon");
        if (selIcon) {
          const curIcon = selIcon.value;
          selIcon.innerHTML = ${JSON.stringify(iconOptionsHtml)};
          selIcon.value = curIcon || ${JSON.stringify(freshIcons[0]?.path || "")};
        }
      })();
    `);
    w.toast(`Rescanned: ${freshApps.length} apps, ${freshIcons.length} icons`);
    w.appendConsole("bundler_console", `[Scanner] Rescanned ./applications/ (${freshApps.length} apps) and ./icons/ (${freshIcons.length} icons).\n`, 1);
  });

  win.onClick("btn_open_dist", (w) => {
    const distDir = resolve(process.cwd(), "dist");
    mkdirSync(distDir, { recursive: true });
    if (process.platform === "darwin") {
      Sys.exec(`open "${distDir}"`);
    } else if (process.platform === "win32") {
      Sys.exec(`explorer "${distDir}"`);
    } else {
      Sys.exec(`xdg-open "${distDir}"`);
    }
    w.toast("Revealed ./dist folder in Finder");
  });

  win.onChange("dd_target", (w) => updatePreview(w));
  win.onChange("chk_minify", (w) => updatePreview(w));
  win.onChange("chk_codesign", (w) => updatePreview(w));
  win.onChange("txt_version", (w) => updatePreview(w));
  win.onChange("txt_app_name", (w) => updatePreview(w));
  win.onChange("txt_exec_path", (w) => updatePreview(w));
  win.onChange("txt_icon_path", (w) => updatePreview(w));

  win.onClick("btn_compile_binary", async () => {
    const rawName = win.getValue("txt_app_name") || "app";
    const name = rawName.replace(/[/\\:*?"<>|]/g, "_").trim() || "app";
    const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
    const targetChoice = win.getValue("dd_target") || "";
    const minify = win.getValue("chk_minify");

    const absEntry = resolve(process.cwd(), entry);
    if (!existsSync(absEntry)) {
      win.appendConsole("bundler_console", `[Compiler Error] Entry script does not exist: "${entry}" (${absEntry})\n`, 3);
      win.setStatus(`Error: Entry script not found: ${entry}`);
      win.toast(`Error: Entry script not found: ${entry}`);
      return;
    }

    const distDir = resolve(process.cwd(), "dist");
    mkdirSync(distDir, { recursive: true });
    ensureAssetsCopied(distDir);
    const outBin = join(distDir, name);

    let targetFlag = "";
    if (targetChoice.includes("darwin-arm64")) targetFlag = "--target=bun-darwin-arm64";
    else if (targetChoice.includes("darwin-x64")) targetFlag = "--target=bun-darwin-x64";
    else if (targetChoice.includes("linux-x64")) targetFlag = "--target=bun-linux-x64";
    else if (targetChoice.includes("windows-x64")) targetFlag = "--target=bun-windows-x64";

    const compileCmd = `bun build "${absEntry}" --compile --outfile="${outBin}" ${minify ? "--minify" : ""} ${targetFlag}`;

    win.appendConsole("bundler_console", `[Compiler] Executing: ${compileCmd}...\n`, 1);
    win.setStatus(`Compiling standalone binary ${name}...`);

    const t0 = performance.now();
    const [out, code] = Sys.exec(compileCmd);
    const elapsed = (performance.now() - t0).toFixed(1);

    if (code === 0 && existsSync(outBin)) {
      try { chmodSync(outBin, 0o755); } catch {}
      const sz = (statSync(outBin).size / 1024 / 1024).toFixed(2);
      win.appendConsole("bundler_console", `[Success] Single-executable compiled in ${elapsed}ms!\n  Artifact: ${outBin} (${sz} MB)\n`, 2);
      win.setText("lbl_status", `Compiled: ${name} (${sz} MB)  |  Latency: ${elapsed}ms  |  Status: OK`);
      win.setStatus(`Compiled in ${elapsed}ms (${sz} MB)`);
      win.toast(`Compiled ${name} (${sz} MB)`);
    } else {
      win.appendConsole("bundler_console", `[Compile Error] ${out}\n`, 3);
      win.setStatus("Compilation Failed");
      win.toast("Compilation Failed");
    }
  });

  win.onClick("btn_build_bundle", async () => {
    const rawName = win.getValue("txt_app_name") || "MyApp";
    const name = rawName.replace(/[/\\:*?"<>|]/g, "_").trim() || "MyApp";
    const cleanId = ("com.enterprise." + name.toLowerCase()).replace(/[^a-z0-9.-]/g, "_");
    const ver = win.getValue("txt_version") || "1.0.0";
    const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
    const targetChoice = win.getValue("dd_target") || "";
    const minify = win.getValue("chk_minify");

    const absEntry = resolve(process.cwd(), entry);
    if (!existsSync(absEntry)) {
      win.appendConsole("bundler_console", `[Bundler Error] Entry script does not exist: "${entry}" (${absEntry})\n`, 3);
      win.setStatus(`Error: Entry script not found: ${entry}`);
      win.toast(`Error: Entry script not found: ${entry}`);
      return;
    }

    win.appendConsole("bundler_console", `[Bundler] Packaging macOS .app bundle for "${name}"...\n`, 1);
    win.setStatus(`Building ${name}.app...`);

    const distDir = resolve(process.cwd(), "dist");
    const appDir = join(distDir, `${name}.app`);
    const contentsDir = join(appDir, "Contents");
    const macosDir = join(contentsDir, "MacOS");
    const resDir = join(contentsDir, "Resources");

    try {
      mkdirSync(macosDir, { recursive: true });
      mkdirSync(resDir, { recursive: true });
      ensureAssetsCopied(distDir, appDir);

      // Package chosen or preset icon into Contents/Resources/AppIcon.icns
      const chosenIcon = win.getValue("txt_icon_path") || win.getValue("dd_preset_icon") || "";
      if (chosenIcon) {
        const iconRes = bundleIcon(chosenIcon, appDir);
        if (iconRes.success) {
          win.appendConsole("bundler_console", `[Icon] ${iconRes.message}\n`, 2);
        } else {
          win.appendConsole("bundler_console", `[Icon Warning] ${iconRes.message}\n`, 1);
        }
      }

      const plist = generatePlist(name, cleanId, ver);
      writeFileSync(join(contentsDir, "Info.plist"), plist);
      win.setText("txt_plist_preview", plist);

      // Compile standalone native Mach-O binary directly into Contents/MacOS/
      let targetFlag = "";
      if (targetChoice.includes("darwin-arm64")) targetFlag = "--target=bun-darwin-arm64";
      else if (targetChoice.includes("darwin-x64")) targetFlag = "--target=bun-darwin-x64";

      const macosBin = join(macosDir, name);
      const compileCmd = `bun build "${absEntry}" --compile --outfile="${macosBin}" ${minify ? "--minify" : ""} ${targetFlag}`;

      win.appendConsole("bundler_console", `[Compiler] Compiling native binary for .app bundle...\n  Command: ${compileCmd}\n`, 1);
      win.setStatus(`Compiling executable for ${name}.app...`);

      const t0 = performance.now();
      const [compOut, compCode] = Sys.exec(compileCmd);
      const elapsed = (performance.now() - t0).toFixed(1);

      let sz = "0.0";
      if (compCode === 0 && existsSync(macosBin)) {
        try { chmodSync(macosBin, 0o755); } catch {}
        sz = (statSync(macosBin).size / 1024 / 1024).toFixed(2);
        win.appendConsole("bundler_console", `[Compiler] Standalone Mach-O binary compiled in ${elapsed}ms!\n  Binary: ${macosBin} (${sz} MB)\n`, 2);
      } else {
        win.appendConsole("bundler_console", `[Compiler Note] ${compOut || "code " + compCode}. Generating robust fallback launcher script...\n`, 3);
        const launcherScript = `#!/bin/bash\nexport PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"\nBUN_BIN="${process.execPath}"\nif [ ! -x "$BUN_BIN" ]; then\n  BUN_BIN="$(which bun 2>/dev/null || echo "bun")"\nfi\nexec "$BUN_BIN" run "${absEntry}" "$@"\n`;
        writeFileSync(macosBin, launcherScript, { mode: 0o755 });
        sz = "0.01";
      }

      const sign = win.getValue("chk_codesign");
      if (sign && process.platform === "darwin") {
        const [signOut, signCode] = Sys.exec(`codesign --force --deep --sign - "${appDir}" 2>&1`);
        if (signCode === 0) {
          win.appendConsole("bundler_console", `[Codesign] Ad-hoc signature successfully applied\n`, 2);
        } else {
          win.appendConsole("bundler_console", `[Codesign Warning] ${signOut} (exit ${signCode})\n`, 1);
        }
      }

      win.appendConsole("bundler_console", `[Success] ${name}.app bundle assembled successfully in ./dist/!\n  Location: ${appDir}\n`, 2);
      win.setText("lbl_status", `Built: ${name}.app (${sz} MB)  |  Path: ./dist/${name}.app  |  Status: OK`);
      win.setStatus(`Assembled ${name}.app (${sz} MB)`);
      win.toast(`Built ${name}.app (${sz} MB)`);
    } catch (e: any) {
      win.appendConsole("bundler_console", `[Bundler Error] ${e.message}\n`, 3);
      win.setStatus(`Bundle Error: ${e.message}`);
      win.toast(`Bundle Error: ${e.message}`);
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
