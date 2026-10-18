import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";
import { writeFileSync, mkdirSync, existsSync, statSync, readdirSync, chmodSync, copyFileSync, rmSync, readFileSync } from "fs";
import { join, resolve, basename } from "path";
import { Data, Format, NtExecutable, NtExecutableResource, Resource } from "resedit";

// -------------------------------------------------------------------------------------------------
// Application Detection & Helper Utilities
// -------------------------------------------------------------------------------------------------

export function deriveAppName(filepath: string): string {
  const base = basename(filepath).replace(/\.(ts|js|tsx|jsx|mjs)$/i, "");
  const knownMap: Record<string, string> = {
    api_studio: "ApiStudioPro",
    app_bundler_studio: "AppBundlerStudioPro",
    brew_studio: "BrewStudioPro",
    calculator_studio: "CalculatorStudioPro",
    dr_codecaine_studio: "DrCodecaineStudio",
    interval_timer_studio: "IntervalTimerStudio",
    lolo_studio: "LoloStudio",
    pacman_studio: "PacmanStudio",
    rodents_revenge_studio: "RodentsRevengeStudio",
    minesweeper_studio: "MinesweeperStudio",
    breakout_studio: "BreakoutStudio",
    skifree_studio: "SkiFreeStudio",
    math_munchers_studio: "MathMunchersStudio",
    flappy_bird_studio: "FlappyBirdStudio",
    typing_studio: "TypingStudio",
    tetris_studio: "TetrisStudio",
    snake_studio: "SnakeStudio",
    frogger_studio: "FroggerStudio",
    word_search_studio: "WordSearchStudio",
    world_time_zones_studio: "WorldTimeZonesStudio",
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
    media_player_studio: "MediaPlayerStudioPro",
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
    subprocess_pipe_studio: "SubprocessPipeStudioPro",
  };
  const mapped = knownMap[base.toLowerCase()];
  if (mapped) {
    return mapped;
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
    calculator_studio: "Universal Calculator & Computing Studio",
    dr_codecaine_studio: "Codecaine Dr. Codecaine Arcade",
    codecaine_bros_studio: "Codecaine Bros. Arcade",
    connect4_studio: "Codecaine Cyberpunk Connect 4",
    maze_generator_studio: "Codecaine Cyberpunk Maze Runner",
    balatro_studio: "Codecaine Joker Royale (Balatro Deluxe)",
    rat_screw_studio: "Codecaine Egyptian Rat Screw Royale",
    poker_studio: "Codecaine Texas Hold'em & 5-Card Draw Poker Royale",
    blackjack_studio: "Codecaine Blackjack Royale VIP",
    yahtzee_studio: "Codecaine Yahtzee Royale Deluxe",
    pong_studio: "Codecaine Neon Cyber Pong",
    tictactoe_studio: "Codecaine Neon Tic-Tac-Toe Arcade",
    interval_timer_studio: "Interval Timer & Workout Suite",
    lolo_studio: "Codecaine Adventures of Lolo Remaster",
    pacman_studio: "Codecaine Cyberpunk Pac-Man Arcade",
    rodents_revenge_studio: "Codecaine Rodent's Revenge Deluxe",
    minesweeper_studio: "Codecaine Minesweeper Pro Championship",
    breakout_studio: "Codecaine Cyber Breakout Deluxe",
    skifree_studio: "Codecaine SkiFree Deluxe",
    math_munchers_studio: "Codecaine Math Munchers Deluxe",
    flappy_bird_studio: "Codecaine Flappy Bird Deluxe",
    typing_studio: "Codecaine CyberType Deluxe — Mavis Edition",
    tetris_studio: "Codecaine Tetris Ultra Deluxe",
    snake_studio: "Codecaine Neon Snake Deluxe",
    frogger_studio: "Codecaine CyberFrog Deluxe",
    word_search_studio: "Codecaine Neon Word Search Labyrinth",
    world_time_zones_studio: "World Time Zones Studio Pro",
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
    media_player_studio: "Media Player Studio Pro",
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
  const desktopDir = join(iconsDir, "desktop");
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

  if (existsSync(desktopDir)) {
    try {
      const files = readdirSync(desktopDir)
        .filter((f) => f.endsWith(".png") || f.endsWith(".ico"))
        .sort();

      for (const file of files) {
        const relPath = `./icons/desktop/${file}`;
        const name = file.replace(/\.(png|ico)$/i, "");
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

export function pngToIcoBuffer(pngBytes: Buffer): Buffer {
  let width = 256;
  let height = 256;
  if (
    pngBytes.length >= 24 &&
    pngBytes[0] === 0x89 &&
    pngBytes[1] === 0x50 &&
    pngBytes[2] === 0x4e &&
    pngBytes[3] === 0x47
  ) {
    width = pngBytes.readUInt32BE(16);
    height = pngBytes.readUInt32BE(20);
  }
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(1, 4); // Image count: 1
  header.writeUInt8(width >= 256 || width <= 0 ? 0 : width, 6);
  header.writeUInt8(height >= 256 || height <= 0 ? 0 : height, 7);
  header.writeUInt8(0, 8); // Color palette
  header.writeUInt8(0, 9); // Reserved
  header.writeUInt16LE(1, 10); // Color planes
  header.writeUInt16LE(32, 12); // Bits per pixel
  header.writeUInt32LE(pngBytes.length, 14); // Image byte size
  header.writeUInt32LE(22, 18); // Offset to image data
  return Buffer.concat([header, pngBytes]);
}

export function embedPeIcon(exePath: string, icoBuffer: Buffer): boolean {
  try {
    if (!existsSync(exePath)) return false;
    const binary = readFileSync(exePath);
    if (binary.length < 64 || binary[0] !== 0x4d || binary[1] !== 0x5a) return false;
    const image = NtExecutable.from(binary);
    const resource = image.getSectionByEntry(Format.ImageDirectoryEntry.Resource);
    let resources: NtExecutableResource;
    if (resource) {
      const sections = image.getAllSections();
      const index = sections.indexOf(resource);
      const copy = Buffer.from(binary);
      const peOffset = copy.readUInt32LE(0x3c);
      copy.writeUInt16LE(index + 1, peOffset + 6);
      resources = NtExecutableResource.from(NtExecutable.from(copy));
    } else {
      resources = NtExecutableResource.from(image);
    }
    const icon = Data.IconFile.from(icoBuffer);
    resources.entries = resources.entries.filter((entry) => entry.type !== 3 && entry.type !== 14);
    Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries,
      1,
      1033,
      icon.icons.map((i) => i.data)
    );
    image.newHeader.optionalHeaderDataDirectory.set(Format.ImageDirectoryEntry.Resource, {
      virtualAddress: 0,
      size: 0,
    });
    resources.outputResource(image);
    writeFileSync(exePath, Buffer.from(image.generate()));
    return true;
  } catch {
    return false;
  }
}

function resolvePngBytesFromIcon(absIcon: string, tmpDir: string): Buffer | null {
  const lower = absIcon.toLowerCase();
  if (lower.endsWith(".png")) {
    return readFileSync(absIcon);
  }
  const siblingPng = absIcon.replace(/\.(icns|ico)$/i, ".png");
  if (existsSync(siblingPng)) {
    return readFileSync(siblingPng);
  }
  const baseSlug = basename(absIcon).replace(/\.(icns|ico|png)$/i, "").replace(/_/g, "-").toLowerCase();
  const desktopPng = resolve(process.cwd(), "icons", "desktop", `${baseSlug}.png`);
  if (existsSync(desktopPng)) {
    return readFileSync(desktopPng);
  }
  if (lower.endsWith(".ico")) {
    try {
      const ico = readFileSync(absIcon);
      if (ico.length >= 22 && ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1) {
        const count = ico.readUInt16LE(4);
        for (let i = count - 1; i >= 0; i--) {
          const entryOff = 6 + i * 16;
          if (entryOff + 16 > ico.length) continue;
          const size = ico.readUInt32LE(entryOff + 8);
          const offset = ico.readUInt32LE(entryOff + 12);
          if (offset + size <= ico.length && size >= 8) {
            const slice = ico.subarray(offset, offset + size);
            if (slice[0] === 0x89 && slice[1] === 0x50 && slice[2] === 0x4e && slice[3] === 0x47) {
              return Buffer.from(slice);
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }
  if (process.platform === "darwin" && lower.endsWith(".icns")) {
    const tmpPng = join(tmpDir, `_tmp_icon_${Date.now()}.png`);
    try {
      Bun.spawnSync(["sips", "-s", "format", "png", absIcon, "--out", tmpPng]);
      if (existsSync(tmpPng)) {
        const bytes = readFileSync(tmpPng);
        rmSync(tmpPng, { force: true });
        return bytes;
      }
    } catch {
      if (existsSync(tmpPng)) rmSync(tmpPng, { force: true });
    }
  }
  return null;
}

export function bundleWindowsIcon(
  iconPath: string,
  winAppDir: string,
  appName = "AppIcon",
  exePath?: string
): { success: boolean; message: string; icoPath?: string } {
  if (!iconPath || !iconPath.trim()) {
    return { success: true, message: "No icon specified (skipping Windows icon bundle)" };
  }

  const absIcon = resolve(process.cwd(), iconPath);
  if (!existsSync(absIcon)) {
    return { success: false, message: `Icon file not found: ${iconPath}` };
  }

  mkdirSync(winAppDir, { recursive: true });
  const destAppIcon = join(winAppDir, "AppIcon.ico");
  const destNamedIcon = join(winAppDir, `${appName}.ico`);

  try {
    let icoBuffer: Buffer | null = null;
    let sourceDesc = "";
    if (absIcon.toLowerCase().endsWith(".ico")) {
      icoBuffer = readFileSync(absIcon);
      sourceDesc = "Copied .ico icon";
    } else {
      const baseSlug = basename(absIcon).replace(/\.(icns|ico|png)$/i, "").replace(/_/g, "-").toLowerCase();
      const desktopIco = resolve(process.cwd(), "icons", "desktop", `${baseSlug}.ico`);
      if (existsSync(desktopIco)) {
        icoBuffer = readFileSync(desktopIco);
        sourceDesc = `Packaged multi-resolution desktop .ico (${basename(desktopIco)})`;
      } else {
        const pngBytes = resolvePngBytesFromIcon(absIcon, winAppDir);
        if (pngBytes) {
          icoBuffer = pngToIcoBuffer(pngBytes);
          sourceDesc = "Converted PNG artwork to Windows .ico";
        }
      }
    }

    if (!icoBuffer) {
      const ext = absIcon.split(".").pop() || "ico";
      const fallbackDest = join(winAppDir, `AppIcon.${ext}`);
      copyFileSync(absIcon, fallbackDest);
      return { success: true, message: `Copied icon as AppIcon.${ext}`, icoPath: fallbackDest };
    }

    writeFileSync(destAppIcon, icoBuffer);
    if (destNamedIcon !== destAppIcon) {
      writeFileSync(destNamedIcon, icoBuffer);
    }

    const embedded = exePath ? embedPeIcon(exePath, icoBuffer) : false;
    return {
      success: true,
      message: `${sourceDesc} -> ${basename(destNamedIcon)}${embedded ? " (embedded into PE .exe resources)" : ""}`,
      icoPath: destNamedIcon,
    };
  } catch (e: any) {
    return { success: false, message: `Failed packaging Windows icon: ${e.message}` };
  }
}

export function bundleLinuxIcon(
  iconPath: string,
  appDir: string,
  appName = "AppIcon"
): { success: boolean; message: string; iconPath?: string } {
  if (!iconPath || !iconPath.trim()) {
    return { success: true, message: "No icon specified (skipping Linux icon bundle)" };
  }

  const absIcon = resolve(process.cwd(), iconPath);
  if (!existsSync(absIcon)) {
    return { success: false, message: `Icon file not found: ${iconPath}` };
  }

  const hicolorDir = join(appDir, "usr", "share", "icons", "hicolor", "256x256", "apps");
  mkdirSync(hicolorDir, { recursive: true });
  const rootIcon = join(appDir, `${appName}.png`);
  const dirIcon = join(appDir, ".DirIcon");
  const hicolorIcon = join(hicolorDir, `${appName}.png`);

  try {
    const pngBytes = resolvePngBytesFromIcon(absIcon, appDir);
    if (pngBytes) {
      writeFileSync(rootIcon, pngBytes);
      writeFileSync(dirIcon, pngBytes);
      writeFileSync(hicolorIcon, pngBytes);
      return {
        success: true,
        message: `Packaged Freedesktop PNG icon (${appName}.png & .DirIcon)`,
        iconPath: rootIcon,
      };
    }

    const ext = absIcon.split(".").pop() || "png";
    const fallbackDest = join(appDir, `${appName}.${ext}`);
    copyFileSync(absIcon, fallbackDest);
    return { success: true, message: `Copied icon as ${appName}.${ext}`, iconPath: fallbackDest };
  } catch (e: any) {
    return { success: false, message: `Failed packaging Linux icon: ${e.message}` };
  }
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

export function ensureAssetsCopied(
  distDir: string,
  appDir?: string,
  platform: "darwin" | "win32" | "linux" = "darwin"
) {
  const rootIdeHtml = resolve(process.cwd(), "src", "ide.html");
  if (existsSync(rootIdeHtml)) {
    const distSrc = join(distDir, "src");
    mkdirSync(distSrc, { recursive: true });
    try { copyFileSync(rootIdeHtml, join(distSrc, "ide.html")); } catch {}

    if (appDir) {
      if (platform === "darwin") {
        const resSrc = join(appDir, "Contents", "Resources", "src");
        mkdirSync(resSrc, { recursive: true });
        try { copyFileSync(rootIdeHtml, join(resSrc, "ide.html")); } catch {}
        const macosSrc = join(appDir, "Contents", "MacOS", "src");
        mkdirSync(macosSrc, { recursive: true });
        try { copyFileSync(rootIdeHtml, join(macosSrc, "ide.html")); } catch {}
      } else if (platform === "win32") {
        const winSrc = join(appDir, "src");
        mkdirSync(winSrc, { recursive: true });
        try { copyFileSync(rootIdeHtml, join(winSrc, "ide.html")); } catch {}
        const winDll = resolve(process.cwd(), "node_modules", "webview-bun", "build", "libwebview.dll");
        if (existsSync(winDll)) {
          const libDir = join(appDir, "lib");
          mkdirSync(libDir, { recursive: true });
          try { copyFileSync(winDll, join(libDir, "libwebview.dll")); } catch {}
        }
      } else if (platform === "linux") {
        const linuxSrc = join(appDir, "src");
        mkdirSync(linuxSrc, { recursive: true });
        try { copyFileSync(rootIdeHtml, join(linuxSrc, "ide.html")); } catch {}
        const binSrc = join(appDir, "usr", "bin", "src");
        mkdirSync(binSrc, { recursive: true });
        try { copyFileSync(rootIdeHtml, join(binSrc, "ide.html")); } catch {}
        const libDir = join(appDir, "usr", "lib");
        for (const soName of ["libwebview-x64.so", "libwebview-arm64.so"]) {
          const soFile = resolve(process.cwd(), "node_modules", "webview-bun", "build", soName);
          if (existsSync(soFile)) {
            mkdirSync(libDir, { recursive: true });
            try { copyFileSync(soFile, join(libDir, soName)); } catch {}
          }
        }
      }
    }
  }
}

function escapeXmlAttr(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generatePlist(name: string, id: string, ver: string, retina = true): string {
  const safeName = escapeXmlAttr(name);
  const safeId = escapeXmlAttr(id);
  const safeVer = escapeXmlAttr(ver);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>${safeName}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>${safeId}</string>
  <key>CFBundleName</key>
  <string>${safeName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${safeVer}</string>
  <key>CFBundleVersion</key>
  <string>${safeVer}</string>
  <key>NSHighResolutionCapable</key>
  <${retina ? "true" : "false"}/>
  <key>NSRequiresAquaSystemAppearance</key>
  <false/>
</dict>
</plist>`;
}

export function generateWindowsManifest(name: string, id: string, ver: string, highDpi = true): string {
  const parts = ver.split(".").map((n) => parseInt(n, 10) || 0);
  const fourPartVer = `${parts[0] ?? 1}.${parts[1] ?? 0}.${parts[2] ?? 0}.${parts[3] ?? 0}`;
  const safeName = escapeXmlAttr(name);
  const safeId = escapeXmlAttr(id);
  const dpiBlock = highDpi
    ? `
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2, PerMonitor</dpiAwareness>
    </windowsSettings>
  </application>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity version="${fourPartVer}" processorArchitecture="*" name="${safeId}" type="win32"/>
  <description>${safeName}</description>${dpiBlock}
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>`;
}

export function generateLinuxDesktopEntry(name: string, id: string, ver: string): string {
  const cleanLine = (s: string) => String(s ?? "").replace(/[\r\n]/g, " ").trim();
  const sName = cleanLine(name);
  const sId = cleanLine(id);
  const sVer = cleanLine(ver);
  return `[Desktop Entry]
Type=Application
Version=${sVer}
Name=${sName}
GenericName=${sName}
Comment=${sName} (${sId})
Exec=${sName} %F
Icon=${sName}
Terminal=false
Categories=Development;Utility;
StartupNotify=true
StartupWMClass=${sName}
`;
}

function updatePreview(win: SimpleWindow) {
  const name = win.getValue("txt_app_name") || "app";
  const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
  const targetChoice = win.getValue("dd_target") || "Native Host (Auto)";
  const minify = win.getValue("chk_minify");
  const sourcemap = win.getValue("chk_sourcemap");
  const sign = win.getValue("chk_codesign");
  const retina = win.getValue("chk_retina");
  const ver = win.getValue("txt_version") || "1.0.0";
  const iconPath = win.getValue("txt_icon_path") || win.getValue("dd_preset_icon") || "None (Default)";

  const preview = `# Enterprise Compiler & Multi-OS Bundler Spec
Application:   ${name} (v${ver})
Target Binary: ${targetChoice}
Entrypoint:    ${entry}
Icon:          ${iconPath}
Output Dir:    ./dist (${name}.app | ${name}-windows | ${name}.AppDir)
Flags:         --compile${minify ? " --minify" : ""}${sourcemap ? " --sourcemap" : ""}${sign ? " [macOS Ad-hoc Codesign]" : ""}${retina ? " [High-DPI / Retina]" : ""}
Status:        Ready to produce standalone binary or macOS / Windows / Linux application bundle.`;

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
    const icNorm = icBase.replace(/-/g, "_");
    return (
      icBase === targetBase ||
      icBase.replace(/_studio$/, "") === targetBase.replace(/_studio$/, "") ||
      icBase === fileBase ||
      icBase.replace(/_studio$/, "") === fileBase.replace(/_studio$/, "") ||
      icNorm === fileBase
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
  const win = newSimpleWindow("App Bundler Studio Pro -- Enterprise Binary & Cross-Platform App Compiler", 1160, 920, {
    appId: "app_bundler_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen,
  });

  const availableApps = getAvailableApplications();
  const defaultApp = availableApps.find((a) => a.path.includes("devtools_studio")) || availableApps[0];
  const defaultAppPath = defaultApp?.path || "./applications/devtools_studio.ts";
  const defaultAppName = defaultApp?.appName || "DevToolsStudio";

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
  win.addCaption("Enterprise Standalone Executable Compiler (bun build --compile) & macOS / Windows / Linux App Bundler");

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
      "bun-linux-arm64 (Linux ARM64)",
      "bun-windows-x64 (Windows x64)",
      "bun-windows-arm64 (Windows ARM64)",
    ],
    "Native Host (Auto)"
  ).width(260);
  win.addButton("btn_compile_binary", "⚡ Compile Standalone Binary");
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_exec_path", "Entry Script:");
  win.addInput("txt_exec_path", defaultAppPath).width(320);
  win.addButton("btn_browse_script", "📂 Browse...");
  win.addLabel("lbl_version", "Version:");
  win.addInput("txt_version", "1.0.0").width(70);
  win.addButton("btn_build_bundle", "🍎 Build macOS .app");
  win.addButton("btn_build_windows", "🪟 Build Windows App");
  win.addButton("btn_build_linux", "🐧 Build Linux App");
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
    `# Enterprise Compiler & Multi-OS Bundler Spec
Application:   ${defaultAppName} (v1.0.0)
Target Binary: Native Host (Auto)
Entrypoint:    ${defaultAppPath}
Icon:          ${defaultIconPath}
Output Dir:    ./dist (${defaultAppName}.app | ${defaultAppName}-windows | ${defaultAppName}.AppDir)
Flags:         --compile --minify [macOS Ad-hoc Codesign] [High-DPI / Retina]
Status:        Ready to produce standalone binary or macOS / Windows / Linux application bundle.`
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

  const handleBrowse = (w: SimpleWindow) => {
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

  win.onClick("btn_browse_icon", (w) => {
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
      Bun.spawnSync(["open", distDir]);
    } else if (process.platform === "win32") {
      Bun.spawnSync(["explorer", distDir]);
    } else {
      Bun.spawnSync(["xdg-open", distDir]);
    }
    w.toast("Revealed ./dist folder in Finder");
  });

  win.onChange("dd_target", (w) => updatePreview(w));
  win.onChange("chk_minify", (w) => updatePreview(w));
  win.onChange("chk_sourcemap", (w) => updatePreview(w));
  win.onChange("chk_codesign", (w) => updatePreview(w));
  win.onChange("chk_retina", (w) => updatePreview(w));
  win.onChange("txt_version", (w) => updatePreview(w));
  win.onChange("txt_app_name", (w) => updatePreview(w));
  win.onChange("txt_exec_path", (w) => updatePreview(w));
  win.onChange("txt_icon_path", (w) => updatePreview(w));

  const sanitizeBundleName = (raw: string, fallback: string) =>
    String(raw || fallback).replace(/[/\\:*?"<>|$`';&%!\r\n]/g, "_").replace(/^\.+/, "_").trim() || fallback;
  const sanitizeBundleVer = (raw: string) =>
    String(raw || "1.0.0").replace(/[^0-9A-Za-z._+-]/g, "").trim() || "1.0.0";

  win.onClick("btn_compile_binary", () => {
    const rawName = win.getValue("txt_app_name") || "app";
    const name = sanitizeBundleName(rawName, "app");
    const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
    const targetChoice = win.getValue("dd_target") || "";
    const minify = win.getValue("chk_minify");
    const sourcemap = win.getValue("chk_sourcemap");

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

    let targetFlag = "";
    if (targetChoice.includes("darwin-arm64")) targetFlag = "--target=bun-darwin-arm64";
    else if (targetChoice.includes("darwin-x64")) targetFlag = "--target=bun-darwin-x64";
    else if (targetChoice.includes("linux-arm64")) targetFlag = "--target=bun-linux-arm64";
    else if (targetChoice.includes("linux-x64")) targetFlag = "--target=bun-linux-x64";
    else if (targetChoice.includes("windows-arm64")) targetFlag = "--target=bun-windows-arm64";
    else if (targetChoice.includes("windows-x64")) targetFlag = "--target=bun-windows-x64";

    const isWin = targetFlag.includes("windows") || (!targetFlag && process.platform === "win32");
    const outFileName = isWin && !name.toLowerCase().endsWith(".exe") ? `${name}.exe` : name;
    const outBin = join(distDir, outFileName);

    const extraFlags = [minify ? "--minify" : "", sourcemap ? "--sourcemap" : "", targetFlag].filter(Boolean).join(" ");
    const compileCmd = `bun build "${absEntry.replace(/["$`\\]/g, "\\$&")}" --compile --outfile="${outBin}" ${extraFlags}`;

    win.appendConsole("bundler_console", `[Compiler] Executing: ${compileCmd}...\n`, 1);
    win.setStatus(`Compiling standalone binary ${outFileName}...`);

    const t0 = performance.now();
    const [out, code] = Sys.exec(compileCmd);
    const elapsed = (performance.now() - t0).toFixed(1);

    if (code === 0 && existsSync(outBin)) {
      try { chmodSync(outBin, 0o755); } catch {}
      if (isWin) {
        const chosenIcon = win.getValue("txt_icon_path") || win.getValue("dd_preset_icon") || "";
        if (chosenIcon) {
          const iconRes = bundleWindowsIcon(chosenIcon, distDir, name, outBin);
          if (iconRes.success) {
            win.appendConsole("bundler_console", `[Icon] ${iconRes.message}\n`, 2);
          }
        }
      }
      const sz = (statSync(outBin).size / 1024 / 1024).toFixed(2);
      win.appendConsole("bundler_console", `[Success] Single-executable compiled in ${elapsed}ms!\n  Artifact: ${outBin} (${sz} MB)\n`, 2);
      win.setText("lbl_status", `Compiled: ${outFileName} (${sz} MB)  |  Latency: ${elapsed}ms  |  Status: OK`);
      win.setStatus(`Compiled in ${elapsed}ms (${sz} MB)`);
      win.toast(`Compiled ${outFileName} (${sz} MB)`);
    } else {
      win.appendConsole("bundler_console", `[Compile Error] ${out}\n`, 3);
      win.setStatus("Compilation Failed");
      win.toast("Compilation Failed");
    }
  });

  win.onClick("btn_build_bundle", () => {
    const rawName = win.getValue("txt_app_name") || "MyApp";
    const name = sanitizeBundleName(rawName, "MyApp");
    const cleanId = ("com.enterprise." + name.toLowerCase()).replace(/[^a-z0-9.-]/g, "_");
    const ver = sanitizeBundleVer(win.getValue("txt_version") || "1.0.0");
    const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
    const targetChoice = win.getValue("dd_target") || "";
    const minify = win.getValue("chk_minify");
    const sourcemap = win.getValue("chk_sourcemap");
    const retina = Boolean(win.getValue("chk_retina"));

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
      ensureAssetsCopied(distDir, appDir, "darwin");

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

      const plist = generatePlist(name, cleanId, ver, retina);
      writeFileSync(join(contentsDir, "Info.plist"), plist);
      win.setText("txt_plist_preview", plist);

      // Compile standalone native Mach-O binary directly into Contents/MacOS/
      let targetFlag = "";
      if (targetChoice.includes("darwin-arm64")) targetFlag = "--target=bun-darwin-arm64";
      else if (targetChoice.includes("darwin-x64")) targetFlag = "--target=bun-darwin-x64";
      else if (process.platform !== "darwin") targetFlag = "--target=bun-darwin-arm64";

      const macosBin = join(macosDir, name);
      const extraFlags = [minify ? "--minify" : "", sourcemap ? "--sourcemap" : "", targetFlag].filter(Boolean).join(" ");
      const compileCmd = `bun build "${absEntry}" --compile --outfile="${macosBin}" ${extraFlags}`;

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
        const signProc = Bun.spawnSync(["codesign", "--force", "--deep", "--sign", "-", appDir], { stdout: "pipe", stderr: "pipe" });
        const signOut = signProc.stdout.toString() + signProc.stderr.toString();
        const signCode = signProc.exitCode;
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

  win.onClick("btn_build_windows", () => {
    const rawName = win.getValue("txt_app_name") || "MyApp";
    const name = sanitizeBundleName(rawName, "MyApp");
    const cleanId = ("com.enterprise." + name.toLowerCase()).replace(/[^a-z0-9.-]/g, "_");
    const ver = sanitizeBundleVer(win.getValue("txt_version") || "1.0.0");
    const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
    const targetChoice = win.getValue("dd_target") || "";
    const minify = win.getValue("chk_minify");
    const sourcemap = win.getValue("chk_sourcemap");
    const highDpi = Boolean(win.getValue("chk_retina"));

    const absEntry = resolve(process.cwd(), entry);
    if (!existsSync(absEntry)) {
      win.appendConsole("bundler_console", `[Bundler Error] Entry script does not exist: "${entry}" (${absEntry})\n`, 3);
      win.setStatus(`Error: Entry script not found: ${entry}`);
      win.toast(`Error: Entry script not found: ${entry}`);
      return;
    }

    win.appendConsole("bundler_console", `[Bundler] Packaging Windows desktop bundle for "${name}"...\n`, 1);
    win.setStatus(`Building ${name}-windows...`);

    const distDir = resolve(process.cwd(), "dist");
    const winAppDir = join(distDir, `${name}-windows`);

    try {
      mkdirSync(winAppDir, { recursive: true });
      ensureAssetsCopied(distDir, winAppDir, "win32");

      const manifestXml = generateWindowsManifest(name, cleanId, ver, highDpi);
      writeFileSync(join(winAppDir, `${name}.exe.manifest`), manifestXml);
      win.setText("txt_plist_preview", manifestXml);

      const targetFlag = targetChoice.includes("windows-arm64")
        ? "--target=bun-windows-arm64"
        : "--target=bun-windows-x64";

      const winExe = join(winAppDir, `${name}.exe`);
      const extraFlags = [
        minify ? "--minify" : "",
        sourcemap ? "--sourcemap" : "",
        "--windows-hide-console",
        targetFlag,
      ]
        .filter(Boolean)
        .join(" ");
      const compileCmd = `bun build "${absEntry.replace(/["$`\\]/g, "\\$&")}" --compile --outfile="${winExe}" ${extraFlags}`;

      win.appendConsole("bundler_console", `[Compiler] Compiling Windows PE executable...\n  Command: ${compileCmd}\n`, 1);
      win.setStatus(`Compiling ${name}.exe...`);

      const t0 = performance.now();
      const [compOut, compCode] = Sys.exec(compileCmd);
      const elapsed = (performance.now() - t0).toFixed(1);

      let sz = "0.0";
      if (compCode === 0 && existsSync(winExe)) {
        sz = (statSync(winExe).size / 1024 / 1024).toFixed(2);
        win.appendConsole("bundler_console", `[Compiler] Standalone Windows PE executable compiled in ${elapsed}ms!\n  Binary: ${winExe} (${sz} MB)\n`, 2);
      } else {
        win.appendConsole("bundler_console", `[Compiler Note] ${compOut || "code " + compCode}. Generating fallback Windows launcher script...\n`, 3);
        const fallbackCmd = `@echo off\r\nsetlocal\r\npushd "%~dp0" || exit /b 1\r\nset "BUN_BE_BUN=1"\r\nif exist "%~dp0lib\\libwebview.dll" set "WEBVIEW_PATH=%~dp0lib\\libwebview.dll"\r\nbun run "${absEntry}" %*\r\nset "EXIT_CODE=%errorlevel%"\r\npopd\r\nexit /b %EXIT_CODE%\r\n`;
        writeFileSync(join(winAppDir, `${name}.cmd`), fallbackCmd);
        sz = "0.01";
      }

      // Package chosen or preset icon into Windows bundle (.ico) and embed into .exe if compiled
      const chosenIcon = win.getValue("txt_icon_path") || win.getValue("dd_preset_icon") || "";
      if (chosenIcon) {
        const iconRes = bundleWindowsIcon(chosenIcon, winAppDir, name, existsSync(winExe) ? winExe : undefined);
        if (iconRes.success) {
          win.appendConsole("bundler_console", `[Icon] ${iconRes.message}\n`, 2);
        } else {
          win.appendConsole("bundler_console", `[Icon Warning] ${iconRes.message}\n`, 1);
        }
      }

      // Generate launch.cmd and install-shortcuts.ps1 for Start Menu / Desktop integration
      const launchBatch = `@echo off\r\nsetlocal\r\npushd "%~dp0" || exit /b 1\r\nset "BUN_BE_BUN=1"\r\nif not defined WEBVIEW_PATH if exist "%~dp0lib\\libwebview.dll" set "WEBVIEW_PATH=%~dp0lib\\libwebview.dll"\r\nif exist "%~dp0${name}.exe" (\r\n  "%~dp0${name}.exe" %*\r\n) else (\r\n  call "%~dp0${name}.cmd" %*\r\n)\r\nset "EXIT_CODE=%errorlevel%"\r\npopd\r\nexit /b %EXIT_CODE%\r\n`;
      writeFileSync(join(winAppDir, "launch.cmd"), launchBatch);

      const shortcutScript = `param([switch]$Uninstall, [switch]$Desktop)\r\n$ErrorActionPreference = 'Stop'\r\n$root = $PSScriptRoot\r\n$folders = @([Environment]::GetFolderPath('Programs'))\r\nif ($Desktop) { $folders += [Environment]::GetFolderPath('Desktop') }\r\n$shell = New-Object -ComObject WScript.Shell\r\nforeach ($folder in $folders) {\r\n  $lnkPath = Join-Path $folder '${name}.lnk'\r\n  if ($Uninstall) {\r\n    if (Test-Path -LiteralPath $lnkPath) { Remove-Item -LiteralPath $lnkPath }\r\n    continue\r\n  }\r\n  New-Item -ItemType Directory -Path $folder -Force | Out-Null\r\n  $link = $shell.CreateShortcut($lnkPath)\r\n  $exe = Join-Path $root '${name}.exe'\r\n  $link.TargetPath = if (Test-Path -LiteralPath $exe) { $exe } else { Join-Path $root 'launch.cmd' }\r\n  $link.WorkingDirectory = $root\r\n  $ico = Join-Path $root '${name}.ico'\r\n  if (Test-Path -LiteralPath $ico) { $link.IconLocation = "$ico,0" }\r\n  $link.Description = '${name} (v${ver})'\r\n  $link.Save()\r\n}\r\n`;
      writeFileSync(join(winAppDir, "install-shortcuts.ps1"), shortcutScript);

      win.appendConsole("bundler_console", `[Success] ${name}-windows bundle assembled successfully in ./dist/!\n  Location: ${winAppDir}\n`, 2);
      win.setText("lbl_status", `Built: ${name}-windows (${sz} MB)  |  Path: ./dist/${name}-windows  |  Status: OK`);
      win.setStatus(`Assembled ${name}-windows (${sz} MB)`);
      win.toast(`Built ${name}-windows (${sz} MB)`);
    } catch (e: any) {
      win.appendConsole("bundler_console", `[Bundler Error] ${e.message}\n`, 3);
      win.setStatus(`Bundle Error: ${e.message}`);
      win.toast(`Bundle Error: ${e.message}`);
    }
  });

  win.onClick("btn_build_linux", () => {
    const rawName = win.getValue("txt_app_name") || "MyApp";
    const name = sanitizeBundleName(rawName, "MyApp");
    const cleanId = ("com.enterprise." + name.toLowerCase()).replace(/[^a-z0-9.-]/g, "_");
    const ver = sanitizeBundleVer(win.getValue("txt_version") || "1.0.0");
    const entry = win.getValue("txt_exec_path") || "./applications/devtools_studio.ts";
    const targetChoice = win.getValue("dd_target") || "";
    const minify = win.getValue("chk_minify");
    const sourcemap = win.getValue("chk_sourcemap");

    const absEntry = resolve(process.cwd(), entry);
    if (!existsSync(absEntry)) {
      win.appendConsole("bundler_console", `[Bundler Error] Entry script does not exist: "${entry}" (${absEntry})\n`, 3);
      win.setStatus(`Error: Entry script not found: ${entry}`);
      win.toast(`Error: Entry script not found: ${entry}`);
      return;
    }

    win.appendConsole("bundler_console", `[Bundler] Packaging Linux .AppDir bundle for "${name}"...\n`, 1);
    win.setStatus(`Building ${name}.AppDir...`);

    const distDir = resolve(process.cwd(), "dist");
    const appDir = join(distDir, `${name}.AppDir`);
    const binDir = join(appDir, "usr", "bin");
    const appsDir = join(appDir, "usr", "share", "applications");

    try {
      mkdirSync(binDir, { recursive: true });
      mkdirSync(appsDir, { recursive: true });
      ensureAssetsCopied(distDir, appDir, "linux");

      // Package chosen or preset icon into .AppDir
      const chosenIcon = win.getValue("txt_icon_path") || win.getValue("dd_preset_icon") || "";
      if (chosenIcon) {
        const iconRes = bundleLinuxIcon(chosenIcon, appDir, name);
        if (iconRes.success) {
          win.appendConsole("bundler_console", `[Icon] ${iconRes.message}\n`, 2);
        } else {
          win.appendConsole("bundler_console", `[Icon Warning] ${iconRes.message}\n`, 1);
        }
      }

      const desktopEntry = generateLinuxDesktopEntry(name, cleanId, ver);
      writeFileSync(join(appDir, `${name}.desktop`), desktopEntry);
      writeFileSync(join(appsDir, `${name}.desktop`), desktopEntry);
      win.setText("txt_plist_preview", desktopEntry);

      const targetFlag = targetChoice.includes("linux-arm64")
        ? "--target=bun-linux-arm64"
        : "--target=bun-linux-x64";

      const linuxBin = join(binDir, name);
      const extraFlags = [minify ? "--minify" : "", sourcemap ? "--sourcemap" : "", targetFlag].filter(Boolean).join(" ");
      const compileCmd = `bun build "${absEntry}" --compile --outfile="${linuxBin}" ${extraFlags}`;

      win.appendConsole("bundler_console", `[Compiler] Compiling Linux ELF binary for .AppDir bundle...\n  Command: ${compileCmd}\n`, 1);
      win.setStatus(`Compiling executable for ${name}.AppDir...`);

      const t0 = performance.now();
      const [compOut, compCode] = Sys.exec(compileCmd);
      const elapsed = (performance.now() - t0).toFixed(1);

      let sz = "0.0";
      if (compCode === 0 && existsSync(linuxBin)) {
        try { chmodSync(linuxBin, 0o755); } catch {}
        sz = (statSync(linuxBin).size / 1024 / 1024).toFixed(2);
        win.appendConsole("bundler_console", `[Compiler] Standalone Linux ELF binary compiled in ${elapsed}ms!\n  Binary: ${linuxBin} (${sz} MB)\n`, 2);
      } else {
        win.appendConsole("bundler_console", `[Compiler Note] ${compOut || "code " + compCode}. Generating fallback Linux launcher script...\n`, 3);
        const launcherScript = `#!/usr/bin/env bash\nexport PATH="/home/linuxbrew/.linuxbrew/bin:/usr/local/bin:$HOME/.bun/bin:$PATH"\nBUN_BIN="${process.execPath}"\nif [ ! -x "$BUN_BIN" ]; then\n  BUN_BIN="$(command -v bun 2>/dev/null || echo "bun")"\nfi\nexec "$BUN_BIN" run "${absEntry}" "$@"\n`;
        writeFileSync(linuxBin, launcherScript, { mode: 0o755 });
        try { chmodSync(linuxBin, 0o755); } catch {}
        sz = "0.01";
      }

      // Generate AppRun entrypoint and install.sh desktop integration script
      const appRunScript = `#!/bin/sh\nHERE="$(cd "$(dirname "$0")" && pwd -P)"\nexport BUN_BE_BUN=1\nARCH="$(uname -m 2>/dev/null || echo x86_64)"\nif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then\n  SO="$HERE/usr/lib/libwebview-arm64.so"\nelse\n  SO="$HERE/usr/lib/libwebview-x64.so"\nfi\nif [ -z "$WEBVIEW_PATH" ] && [ -f "$SO" ]; then\n  export WEBVIEW_PATH="$SO"\nfi\nexec "$HERE/usr/bin/${name}" "$@"\n`;
      const appRunPath = join(appDir, "AppRun");
      writeFileSync(appRunPath, appRunScript, { mode: 0o755 });
      try { chmodSync(appRunPath, 0o755); } catch {}

      const installSh = `#!/bin/sh\nset -e\nHERE="$(cd "$(dirname "$0")" && pwd -P)"\nBIN_DIR="\${HOME}/.local/bin"\nAPPS_DIR="\${HOME}/.local/share/applications"\nICON_DIR="\${HOME}/.local/share/icons/hicolor/256x256/apps"\nif [ "\${1:-}" = "--uninstall" ]; then\n  rm -f "$BIN_DIR/${name}" "$APPS_DIR/${name}.desktop" "$ICON_DIR/${name}.png"\n  echo "Uninstalled ${name}."\n  exit 0\nfi\nmkdir -p "$BIN_DIR" "$APPS_DIR" "$ICON_DIR"\nchmod +x "$HERE/AppRun" "$HERE/usr/bin/${name}"\nln -sf "$HERE/AppRun" "$BIN_DIR/${name}"\nif [ -f "$HERE/${name}.png" ]; then\n  cp "$HERE/${name}.png" "$ICON_DIR/${name}.png"\nfi\nsed "s|^Exec=.*|Exec=\\"$HERE/AppRun\\" %F|; s|^Icon=.*|Icon=$HERE/${name}.png|" "$HERE/${name}.desktop" > "$APPS_DIR/${name}.desktop"\necho "Installed ${name} to $APPS_DIR/${name}.desktop and $BIN_DIR/${name}."\n`;
      const installShPath = join(appDir, "install.sh");
      writeFileSync(installShPath, installSh, { mode: 0o755 });
      try { chmodSync(installShPath, 0o755); } catch {}

      win.appendConsole("bundler_console", `[Success] ${name}.AppDir bundle assembled successfully in ./dist/!\n  Location: ${appDir}\n`, 2);
      win.setText("lbl_status", `Built: ${name}.AppDir (${sz} MB)  |  Path: ./dist/${name}.AppDir  |  Status: OK`);
      win.setStatus(`Assembled ${name}.AppDir (${sz} MB)`);
      win.toast(`Built ${name}.AppDir (${sz} MB)`);
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
