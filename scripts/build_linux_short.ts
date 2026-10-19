#!/usr/bin/env bun
/**
 * Builds the High-End Linux Workstation YouTube Short (1080x1920 vertical, <3 minutes):
 *   1. Download the Linux release from GitHub Releases (v1.4.9)
 *   2. Install with `sh install.sh --apparmor` & launch in synced Linux Terminal
 *   3. Install all 10 Convert helper packages in a single click (`One-click setup` -> `Install everything missing` / `Choose what to install…` with apt, dnf, pacman, Homebrew)
 *   4. Batch-convert files in one click
 *   5. Enable `🐧 Optimize for Linux / VM` + Hardware VFD Telemetry Deck
 *   6. Showcase `🚀 Ultra Tier` themes on High-End Linux: Polar Night (`polar_night`), Orbital Ice (`orbital_ice`), Cryo-Glacier Icicle Storm (`cryo_icicle_blizzard`), Linux Papirus HiDPI Workstation (`linux_workstation_hidpi`)
 *   7. Showcase God-Mode & 120Hz Ultra shaders: Omega Point Singularity, Haight-Ashbury Tie-Dye '67, EF5 Debris Tornado, Tesla Coil Plasma & Compiz Burn '07
 *   8. Zero-dialog Linux random theme hotkeys (`Alt+U` Ultra, `Alt+R` Any, `Alt+E` FX, `Alt+P` Plain, `Alt+0` Toggle FX)
 *
 * Outputs:
 *   - youtube_production/codecaine-file-manager-linux-short.mp4
 *   - youtube_production/LINUX_SHORT_NOTES.md
 *   - youtube_production/linux_short/upload-guide.txt
 *
 * Usage:
 *   bun scripts/build_linux_short.ts
 */
import "./lib/tts_edge_default";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";
import { EDGE_VOICE, FFMPEG, FFPROBE, narrate, sh } from "./lib/video_pipeline";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const WORK = join(PROD, "linux_short");
const OUTPUT = join(PROD, "codecaine-file-manager-linux-short.mp4");
const NOTES = join(PROD, "LINUX_SHORT_NOTES.md");
const REPO = "https://github.com/codecaine-zz/bun_rad_studio";

const FM_PORT = 51678;
const CDP_REC_PORT = 9372;
const CDP_OVL_PORT = 9373;
const VIEW_W = 1920;
const VIEW_H = 972;

const ROOT_DIR = "/tmp/fm_linux_short";
const HOME = process.platform === "darwin" ? "/private/tmp/fm_linux_short/home" : "/tmp/fm_linux_short/home";
const DATA = `${ROOT_DIR}/data`;
const GRAVE = `${ROOT_DIR}/grave`;
const ZDOT = `${ROOT_DIR}/zdot`;

type SceneSpec = {
  id: string;
  badge: string;
  title: string;
  label: string;
  extra: string;
  bullets: string[];
  say: string;
  record: (c: Cdp) => Promise<void>;
};

function run(args: string[]): string {
  const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`${args[0]} failed:\n${result.stderr.toString().slice(-4000)}`);
  return result.stdout.toString();
}

function duration(file: string): number {
  const value = Number(run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid duration: ${file}`);
  return value;
}

const esc = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function seedLinuxWorld() {
  rmSync(ROOT_DIR, { recursive: true, force: true });
  mkdirSync(ROOT_DIR, { recursive: true });
  seedDemoWorkspace(HOME, join(ROOT_DIR, "frames"));
  mkdirSync(join(HOME, "Documents", "Trip"), { recursive: true });
  for (let i = 1; i <= 4; i++) {
    sh(
      [
        FFMPEG,
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=1280x800:rate=1`,
        "-frames:v",
        "1",
        "-vf",
        `hue=h=${i * 55},drawtext=text='Linux Photo ${i}':fontcolor=white:fontsize=92:x=(w-text_w)/2:y=(h-text_h)/2`,
        join(HOME, "Documents", "Trip", `IMG_${String(i).padStart(4, "0")}.jpg`),
      ],
      { quiet: true },
    );
  }
  mkdirSync(ZDOT, { recursive: true });
  writeFileSync(
    join(ZDOT, ".zshrc"),
    `HISTFILE=${ZDOT}/.history\nPROMPT='%F{green}ubuntu@threadripper-pro%f:%F{cyan}%1~%f$ '\nRPROMPT=''\n`,
  );
}

/** High-End Linux GitHub Release Mock Page so Scene 1 records a crisp, authentic GitHub v1.4.9 Linux download. */
function buildGithubReleaseHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Release v1.4.9 · codecaine-zz/bun_rad_studio · GitHub</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d1117;
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Noto Sans, Helvetica, Arial, sans-serif;
    padding: 28px 64px;
    overflow: hidden;
  }
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 18px; border-bottom: 1px solid #30363d; margin-bottom: 24px;
  }
  .repo { font-size: 24px; font-weight: 700; color: #58a6ff; display: flex; align-items: center; gap: 12px; }
  .repo span.slash { color: #8b949e; }
  .sys-pill {
    background: rgba(46, 160, 67, 0.16); border: 1px solid rgba(63, 185, 80, 0.5);
    color: #3fb950; font-size: 15px; font-weight: 700; padding: 7px 16px; border-radius: 999px;
  }
  .card {
    background: #161b22; border: 1px solid #30363d; border-radius: 14px; padding: 28px 34px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.45);
  }
  .rel-head { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
  .rel-title { font-size: 34px; font-weight: 800; color: #f0f6fc; }
  .badge-latest {
    background: #238636; color: #fff; font-weight: 700; font-size: 15px;
    padding: 5px 14px; border-radius: 999px;
  }
  .badge-tag {
    background: rgba(56, 139, 253, 0.15); border: 1px solid rgba(56, 139, 253, 0.4);
    color: #58a6ff; font-weight: 700; font-size: 15px; padding: 5px 14px; border-radius: 999px;
  }
  .rel-desc { color: #8b949e; font-size: 18px; line-height: 1.5; margin-bottom: 22px; }
  .cmd-box {
    background: #0d1117; border: 1px solid #30363d; border-radius: 10px; padding: 14px 20px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 17px; color: #79c0ff;
    margin-bottom: 22px; display: flex; align-items: center; justify-content: space-between;
  }
  .assets-title { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #f0f6fc; }
  .asset-list { border: 1px solid #30363d; border-radius: 10px; overflow: hidden; background: #0d1117; }
  .asset-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 15px 22px; border-bottom: 1px solid #21262d; cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease;
  }
  .asset-row:last-child { border-bottom: none; }
  .asset-row:hover, .asset-row.active {
    background: rgba(56, 139, 253, 0.14);
  }
  .asset-name { font-size: 19px; font-weight: 700; color: #58a6ff; display: flex; align-items: center; gap: 12px; }
  .asset-meta { display: flex; align-items: center; gap: 18px; font-size: 16px; color: #8b949e; }
  .dl-btn {
    background: #238636; color: #fff; border: 1px solid rgba(240,246,252,0.1);
    padding: 8px 18px; border-radius: 8px; font-size: 16px; font-weight: 700;
  }
  .dl-toast {
    position: fixed; bottom: 26px; right: 48px; left: 48px;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    border: 2px solid #38bdf8; border-radius: 14px; padding: 18px 26px;
    display: none; align-items: center; justify-content: space-between;
    box-shadow: 0 20px 50px rgba(0,0,0,0.75);
  }
  .dl-toast.show { display: flex; }
  .dl-bar-wrap { width: 420px; height: 12px; background: #0f172a; border-radius: 999px; overflow: hidden; border: 1px solid #334155; }
  .dl-bar { height: 100%; width: 0%; background: linear-gradient(90deg, #22c55e, #38bdf8); transition: width 0.9s ease; }
</style>
</head>
<body>
  <div class="topbar">
    <div class="repo">🐧 codecaine-zz <span class="slash">/</span> bun_rad_studio <span class="badge-tag">github.com/codecaine-zz/bun_rad_studio/releases/tag/v1.4.9</span></div>
    <div class="sys-pill">🐧 Ubuntu 24.04 LTS · Threadripper PRO 96-Core · RTX 4090 · Wayland 120Hz</div>
  </div>
  <div class="card">
    <div class="rel-head">
      <div class="rel-title">Codecaine File Manager &amp; Studio Suite v1.4.9</div>
      <span class="badge-latest">Latest Release</span>
      <span class="badge-tag">Linux x64 · macOS ARM64 · Windows x64</span>
    </div>
    <p class="rel-desc">
      Zero-Lag 120Hz GPU Hardware Acceleration for Linux (Ubuntu/Debian/Fedora/Arch &amp; VM), 1-Click Setup for all 10 Convert Helper Packages (apt, dnf, pacman, Homebrew), 310 Built-in Themes including Polar Night &amp; Ultra Shaders, and 24 Arcade Games with Full Web Audio.
    </p>
    <div class="cmd-box">
      <span>$ unzip Codecaine-File-Manager-v1.4.9-linux-x64.zip &amp;&amp; cd Codecaine-File-Manager-v1.4.9-linux-x64 &amp;&amp; sh install.sh --apparmor</span>
      <span style="color:#3fb950;font-weight:700">1-Command Linux Setup</span>
    </div>
    <div class="assets-title">📦 Release Assets (Linux Standalone Binaries — No Runtime Required)</div>
    <div class="asset-list">
      <div class="asset-row" id="asset-linux-zip" onclick="startDownload('Codecaine-File-Manager-v1.4.9-linux-x64.zip', '78.4 MB')">
        <div class="asset-name">🐧 Codecaine-File-Manager-v1.4.9-linux-x64.zip <span style="color:#3fb950;font-size:14px;background:rgba(46,160,67,0.18);padding:3px 10px;border-radius:999px">Recommended for Ubuntu / Debian / Fedora / Arch</span></div>
        <div class="asset-meta"><span>sha256: 98bd0c21…9605</span><span>78.4 MB</span><span class="dl-btn">⬇ Download Linux x64</span></div>
      </div>
      <div class="asset-row" id="asset-linux-tar" onclick="startDownload('bun-rad-studio-v1.4.9-linux-x64.tar.gz', '114.2 MB')">
        <div class="asset-name">🐧 bun-rad-studio-v1.4.9-linux-x64.tar.gz <span style="color:#58a6ff;font-size:14px">Full All-in-One 40-App Suite (Linux x64)</span></div>
        <div class="asset-meta"><span>sha256: 5471cb60…96c8</span><span>114.2 MB</span><span class="dl-btn" style="background:#1f6feb">⬇ Download Suite .tar.gz</span></div>
      </div>
      <div class="asset-row">
        <div class="asset-name">🍎 Codecaine-File-Manager-v1.4.9-macos-arm64.zip</div>
        <div class="asset-meta"><span>Apple Silicon M1–M4 Ultra</span><span>64.1 MB</span></div>
      </div>
      <div class="asset-row">
        <div class="asset-name">🪟 Codecaine-File-Manager-v1.4.9-windows-x64.zip</div>
        <div class="asset-meta"><span>Windows 10 / 11 DirectX 12</span><span>82.0 MB</span></div>
      </div>
    </div>
  </div>
  <div class="dl-toast" id="dl-toast">
    <div>
      <div style="font-size:20px;font-weight:800;color:#38bdf8" id="dl-title">⬇ Downloading Codecaine-File-Manager-v1.4.9-linux-x64.zip…</div>
      <div style="font-size:15px;color:#cbd5e1;margin-top:4px" id="dl-sub">Saving to ~/Downloads/Codecaine-File-Manager-v1.4.9-linux-x64.zip (78.4 MB · 1.2 GB/s NVMe)</div>
    </div>
    <div style="display:flex;align-items:center;gap:16px">
      <div class="dl-bar-wrap"><div class="dl-bar" id="dl-bar"></div></div>
      <div style="font-size:18px;font-weight:800;color:#22c55e" id="dl-status">0%</div>
    </div>
  </div>
  <script>
    function startDownload(name, size) {
      document.getElementById('asset-linux-zip').classList.add('active');
      const toast = document.getElementById('dl-toast');
      const bar = document.getElementById('dl-bar');
      const status = document.getElementById('dl-status');
      const title = document.getElementById('dl-title');
      toast.classList.add('show');
      setTimeout(() => { bar.style.width = '100%'; }, 80);
      setTimeout(() => {
        status.textContent = '✔ Complete';
        title.textContent = '✔ Downloaded ' + name + ' — Ready to run sh install.sh --apparmor';
      }, 950);
    }
  </script>
</body>
</html>`;
}

/**
 * Injects High-End Linux hardware telemetry + mocks the 10 Linux Convert helper packages
 * so the viewer sees the exact Linux `One-click setup` flow (`apt`, `dnf`, `pacman`, `Homebrew`)
 * with all 10 helper packages (`FFmpeg`, `ImageMagick`, `LibreOffice`, `Pandoc`, `Poppler`,
 * `qpdf`, `Ghostscript`, `Tesseract OCR`, `ExifTool`, `7-Zip`) installed in a single click!
 */
const LINUX_CONVERT_MOCK_SCRIPT = `(() => {
  try {
    Object.defineProperty(navigator, "platform", { get: () => "Linux x86_64", configurable: true });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 256, configurable: true });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 96, configurable: true });
  } catch (_) {}

  window.__linuxToolsInstalled = false;
  const LINUX_TOOLS = [
    { id: "ffmpeg", name: "FFmpeg", optional: false, what: "Converts and compresses video and audio files (MP4, WebM, MP3, WAV, FLAC, GIF).", website: "https://ffmpeg.org", autoInstall: true, packages: { apt: "ffmpeg", dnf: "ffmpeg", pacman: "ffmpeg", brew: "ffmpeg" } },
    { id: "magick", name: "ImageMagick", optional: false, what: "Resizes, converts, crops and optimizes pictures in batches (PNG, JPEG, WebP, AVIF, TIFF, PDF).", website: "https://imagemagick.org", autoInstall: true, packages: { apt: "imagemagick", dnf: "ImageMagick", pacman: "imagemagick", brew: "imagemagick" } },
    { id: "pandoc", name: "Pandoc", optional: false, what: "Converts documents between Markdown, Word (.docx), HTML, EPUB, LaTeX and PDF.", website: "https://pandoc.org", autoInstall: true, packages: { apt: "pandoc", dnf: "pandoc", pacman: "pandoc", brew: "pandoc" } },
    { id: "soffice", name: "LibreOffice", optional: true, size: "large download (~450 MB)", what: "Turns Word, Excel and PowerPoint files into PDFs and other Office formats.", website: "https://www.libreoffice.org", autoInstall: true, packages: { apt: "libreoffice", dnf: "libreoffice", pacman: "libreoffice-fresh", brew: "libreoffice" } },
    { id: "pdftotext", name: "Poppler (PDF tools)", optional: true, what: "Extracts text and pages from PDF documents at high speed.", website: "https://poppler.freedesktop.org", autoInstall: true, packages: { apt: "poppler-utils", dnf: "poppler-utils", pacman: "poppler", brew: "poppler" } },
    { id: "qpdf", name: "qpdf", optional: true, what: "Splits, merges, linearizes, encrypts and decrypts PDF files losslessly.", website: "https://qpdf.sourceforge.io", autoInstall: true, packages: { apt: "qpdf", dnf: "qpdf", pacman: "qpdf", brew: "qpdf" } },
    { id: "gs", name: "Ghostscript", optional: true, what: "Shrinks and optimizes heavy PDF files for web or email.", website: "https://ghostscript.com", autoInstall: true, packages: { apt: "ghostscript", dnf: "ghostscript", pacman: "ghostscript", brew: "ghostscript" } },
    { id: "tesseract", name: "Tesseract OCR", optional: true, what: "Reads text from scanned images and photographed documents (OCR).", website: "https://github.com/tesseract-ocr/tesseract", autoInstall: true, packages: { apt: "tesseract-ocr", dnf: "tesseract", pacman: "tesseract", brew: "tesseract" } },
    { id: "exiftool", name: "ExifTool", optional: true, what: "Inspects and strips camera EXIF/GPS metadata from photos and videos.", website: "https://exiftool.org", autoInstall: true, packages: { apt: "libimage-exiftool-perl", dnf: "perl-Image-ExifTool", pacman: "perl-image-exiftool", brew: "exiftool" } },
    { id: "7z", name: "7-Zip", optional: true, what: "Packs and unpacks 7z, RAR, TAR.ZST, XZ and encrypted archives.", website: "https://www.7-zip.org", autoInstall: true, packages: { apt: "p7zip-full", dnf: "p7zip", pacman: "p7zip", brew: "sevenzip" } }
  ];

  const origFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (url.includes("/api/tools/overview") && window.__mockMissingLinuxTools) {
      const res = await origFetch(input, init);
      const data = await res.json();
      data.platform = "linux";
      data.tools = LINUX_TOOLS.map((t) => ({
        ...t,
        installed: !!window.__linuxToolsInstalled,
        version: window.__linuxToolsInstalled ? "Linux x86_64 (apt)" : null,
        path: window.__linuxToolsInstalled ? "/usr/bin/" + t.id : null,
        plan: {
          auto: true,
          method: "apt",
          note: "Installed with apt on Ubuntu / Debian Linux.",
          display: "sudo apt-get install -y " + t.packages.apt
        }
      }));
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/api/tools/setup/options")) {
      return new Response(JSON.stringify({
        platform: "linux",
        choices: [
          { id: "apt", name: "apt (Debian / Ubuntu Linux)", needsPassword: true, installsItself: false },
          { id: "dnf", name: "dnf (Fedora / RHEL / Rocky Linux)", needsPassword: true, installsItself: false },
          { id: "pacman", name: "pacman (Arch / Manjaro Linux)", needsPassword: true, installsItself: false },
          { id: "brew", name: "Homebrew on Linux", needsPassword: false, installsItself: false }
        ],
        tools: LINUX_TOOLS.map((t) => ({ ...t, installed: false }))
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/api/tools/setup")) {
      window.__linuxToolsInstalled = true;
      window.__mockMissingLinuxTools = false;
      return new Response(JSON.stringify({
        command: "echo '📦 [apt] Installing 10 Convert Helper Packages: ffmpeg imagemagick pandoc libreoffice poppler-utils qpdf ghostscript tesseract-ocr exiftool p7zip-full...'; echo '✔ All 10 Linux Convert Helper Packages installed and verified!'",
        needsPassword: false,
        skipped: []
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return origFetch(input, init);
  };
})();`;

const sceneSpecs: SceneSpec[] = [
  {
    id: "01_github_linux_download",
    badge: "01 / 08 · DOWNLOAD LINUX RELEASE ON GITHUB",
    title: "DOWNLOAD FOR LINUX\nFROM GITHUB v1.4.9.",
    label: "🐧 UBUNTU · DEBIAN · FEDORA · ARCH · STANDALONE x64 BINARY",
    extra: "Grab Codecaine-File-Manager-v1.4.9-linux-x64.zip or Full Suite .tar.gz",
    bullets: [
      "🐧 Standalone Linux x64 Binary (No Runtime Needed)",
      "📦 Includes install.sh + Ubuntu 24.04 AppArmor Setup",
      "⚡ Tested on Threadripper PRO + RTX 4090 + Wayland 120Hz",
    ],
    say: "Want the ultimate file manager on a high-end Linux workstation? Head to the Codecaine Studio GitHub Releases page and download the standalone Linux x64 release zip with zero dependencies required.",
    record: async (c) => {
      await sleep(500);
      await c.moveTo(640, 425, 650);
      await sleep(350);
      await c.click("#asset-linux-zip", { ms: 600, pause: 2400 });
      await c.moveTo(640, 495, 550);
      await sleep(900);
    },
  },
  {
    id: "02_linux_install_terminal",
    badge: "02 / 08 · 1-COMMAND INSTALL.SH & SYNCED TERMINAL",
    title: "RUN INSTALL.SH &\nLAUNCH ON LINUX.",
    label: "💻 sh install.sh --apparmor · BUILT-IN SYNCED ZSH/BASH TERMINAL",
    extra: "Installs Desktop Launcher, Icon & Ubuntu 24.04+ AppArmor Profile",
    bullets: [
      "🚀 sh install.sh --apparmor Sets Up Everything",
      "⌨️ Built-In Linux Terminal Syncs With Folder List",
      "🐧 Works on Wayland, X11, KDE Plasma & GNOME",
    ],
    say: "Unzip the archive, run s h install dot s h dash dash apparmor to configure your Linux desktop launcher and Ubuntu AppArmor profile, and launch Codecaine File Manager with its built-in synced terminal.",
    record: async (c) => {
      await c.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`);
      await sleep(600);
      await c.eval(LINUX_CONVERT_MOCK_SCRIPT);
      // Open the built-in Terminal and run the Linux install verification banner
      await c.click("#tool-terminal", { pause: 900 }).catch(() => {});
      await c.eval(`(async () => {
        const mod = await import('/ui/terminal.js');
        mod.typeInTerminal("echo '🐧 Codecaine File Manager v1.4.9 (Linux x86_64) — sh install.sh --apparmor complete!'\r");
      })()`).catch(() => {});
      await sleep(2200);
      await c.moveTo(960, 360, 600);
      await sleep(1000);
    },
  },
  {
    id: "03_convert_one_click_packages",
    badge: "03 / 08 · 1-CLICK INSTALL ALL 10 CONVERT PACKAGES",
    title: "INSTALL ALL CONVERT\nPACKAGES IN 1 CLICK.",
    label: "🧰 APT · DNF · PACMAN · HOMEBREW · ALL 10 HELPER PACKAGES",
    extra: "FFmpeg · ImageMagick · LibreOffice · Pandoc · Poppler · qpdf · OCR · 7z",
    bullets: [
      "✨ One-Click Setup: Install Everything Missing (10)",
      "📦 Supports apt, dnf, pacman & Homebrew on Linux",
      "🎬 FFmpeg, ImageMagick, LibreOffice, Pandoc & More",
    ],
    say: "Need to convert media, PDFs, or Office docs on Linux? Click Convert to open One-click setup. Choose apt, dnf, pacman, or Homebrew—every helper package like FFmpeg, ImageMagick, LibreOffice, Pandoc, Poppler, and 7-Zip is pre-ticked so you can install all ten in a single click!",
    record: async (c) => {
      await c.eval(`(async () => {
        window.__mockMissingLinuxTools = true;
        window.__linuxToolsInstalled = false;
        const sel = await import('/ui/selection.js');
        if (sel.clearSelection) sel.clearSelection();
      })()`);
      await c.click("#tool-tools", { pause: 1100 });
      await c.waitFor(".tool-setup", 5000);
      await c.click(".tool-setup button >> Choose what to install", { pause: 1200 });
      await c.waitFor(".setup-list", 5000);
      await c.moveTo(760, 340, 500);
      await sleep(900);
      await c.moveTo(760, 520, 550);
      await sleep(900);
      // Click "Install 10 programs" primary button in the setup dialog
      await c.click(".modal-backdrop:last-child .dialog-buttons .btn.primary", { pause: 1800 });
      await sleep(1200);
    },
  },
  {
    id: "04_batch_convert_files",
    badge: "04 / 08 · BATCH CONVERT PHOTOS, VIDEO & DOCS",
    title: "BATCH CONVERT FILES\nWITH ZERO CLI FLAGS.",
    label: "🖼️ WEB-SIZED PICTURES · 🎬 VIDEO/AUDIO · 📄 PDF & OFFICE",
    extra: "Select Files → Pick Conversion → Watch Progress in Task Panel",
    bullets: [
      "🖼️ Convert Photos to WebP, AVIF, PNG or PDF",
      "⚡ Runs Asynchronously in Bottom Task Tray",
      "🛡️ Originals Are Never Modified or Overwritten",
    ],
    say: "Once installed, select your files, open Convert, pick Make a web-sized picture, and click Convert. It processes the entire batch in the background task tray while keeping your originals untouched.",
    record: async (c) => {
      await c.eval(`(() => {
        document.querySelectorAll('.modal-backdrop button[value="close"], .modal-backdrop button[value="cancel"], .dialog-close').forEach((b) => b.click());
      })()`);
      await sleep(300);
      await c.eval(`(async () => {
        window.__mockMissingLinuxTools = false;
        window.__linuxToolsInstalled = true;
        const nav = await import('/ui/nav.js');
        await nav.goTo(${JSON.stringify(join(HOME, "Documents", "Trip"))});
      })()`);
      await c.waitFor("#list .row", 5000);
      await c.click("#list .row >> IMG_0001", { pause: 500 });
      await c.click("#tool-tools", { pause: 1100 });
      await c.waitFor("#cv-search", 5000);
      await c.click("#cv-search", { pause: 300 });
      await c.type("web", 90);
      await sleep(600);
      await c.click(".cv-main >> web-sized", { pause: 1100 });
      await c.waitFor(".dialog .btn.primary:not(:disabled)", 5000);
      await c.click(".dialog .btn.primary", { pause: 2200 });
      await c.moveTo(860, 320, 600);
      await sleep(900);
    },
  },
  {
    id: "05_linux_gpu_optimize_telemetry",
    badge: "05 / 08 · 🐧 OPTIMIZE FOR LINUX & VFD TELEMETRY",
    title: "1-CLICK LINUX GPU\nMODE & VFD DECK.",
    label: "🐧 OPTIMIZE FOR LINUX / VM · 📟 HARDWARE VFD · 🚀 ULTRA TIER",
    extra: "Zero-Readback WebKitGTK & Wayland 120Hz Compositor + Live Spectrum HUD",
    bullets: [
      "🐧 1-Click Optimize for Linux & VM Compositor",
      "📟 Hardware VFD & Winamp Spectrum Telemetry Deck",
      "🚀 Filter 310 Themes by Ultra Tier or Linux",
    ],
    say: "Now open All Themes. Click Optimize for Linux to activate zero-readback GPU acceleration for Wayland and WebKitGTK, pop open the live Hardware V F D Telemetry Deck, and filter by the Ultra Tier.",
    record: async (c) => {
      await c.eval(`(() => {
        document.querySelectorAll('.modal-backdrop button[value="close"], .modal-backdrop button[value="cancel"], .dialog-close').forEach((b) => b.click());
      })()`);
      await sleep(350);
      await c.click("#tool-themes", { pause: 900 });
      await c.click(".menu [role^=menuitem] >> All themes", { pause: 1200 });
      await c.waitFor(".theme-card", 6000);
      await c.click('[data-optimize-platform="linux"]', { pause: 1000 }).catch(() => {});
      await c.click('[data-open-telemetry-studio="true"]', { pause: 1000 }).catch(() => {});
      await c.click('[data-telemetry-skin-btn="winamp_spectrum"]', { pause: 900 }).catch(() => {});
      await c.click('[data-tier-pill="ultra"]', { pause: 1200 }).catch(() => {});
      await sleep(700);
    },
  },
  {
    id: "06_polar_night_ultra_themes",
    badge: "06 / 08 · POLAR NIGHT, ORBITAL ICE & LINUX HiDPI",
    title: "POLAR NIGHT, ORBITAL\nICE & LINUX HiDPI.",
    label: "❄️ POLAR NIGHT · 🧊 ORBITAL ICE · 🌨️ CRYO BLIZZARD · 🐧 PAPIRUS",
    extra: "Arctic Frosted Glass + Live Blizzard & Aurora Australis Dual Shader",
    bullets: [
      "❄️ Polar Night: Blizzard + Aurora Australis Shader",
      "🧊 Orbital Ice & Cryo-Glacier Icicle Storm",
      "🐧 Linux Papirus HiDPI Workstation 3D Folders",
    ],
    say: "Check out Polar Night in the Ultra Tier—complete with Arctic frosted glass, 3D cryo-crystal folders, and a live blizzard plus aurora australis shader! Then switch to Orbital Ice, Cryo-Glacier Icicle Storm, and Linux Papirus Hi-D P I Workstation.",
    record: async (c) => {
      if (!(await c.exists(".theme-card"))) {
        await c.click("#tool-themes", { pause: 700 });
        await c.click(".menu [role^=menuitem] >> All themes", { pause: 1000 });
        await c.waitFor(".theme-card", 6000);
      }
      const searchTheme = async (q: string) => {
        await c.eval(`(() => {
          const tierAll = document.querySelector('[data-tier-pill="all"]');
          if (tierAll) tierAll.click();
          const e = document.querySelector('.dialog input[type=search]');
          if (e) { e.value = ${JSON.stringify(q)}; e.dispatchEvent(new Event('input', { bubbles: true })); }
        })()`);
        await sleep(550);
      };
      await searchTheme("polar night");
      await c.click('.theme-card[data-key="polar_night"]', { pause: 1900 }).catch(() => {});
      await searchTheme("orbital ice");
      await c.click('.theme-card[data-key="orbital_ice"]', { pause: 1600 }).catch(() => {});
      await searchTheme("cryo");
      await c.click('.theme-card[data-key="cryo_icicle_blizzard"]', { pause: 1600 }).catch(() => {});
      await searchTheme("linux papirus");
      await c.click('.theme-card[data-key="linux_workstation_hidpi"]', { pause: 1600 }).catch(() => {});
    },
  },
  {
    id: "07_godmode_tiedye_tornado_compiz",
    badge: "07 / 08 · OMEGA 3000, 120HZ TIE-DYE & COMPIZ BURN",
    title: "OMEGA 3000, TIE-DYE\n& COMPIZ BURN '07.",
    label: "🪐 OMEGA SINGULARITY · 🫧 120HZ TIE-DYE · 🌪️ EF5 TORNADO · 🔥 COMPIZ",
    extra: "Post-Singularity Gold Halo, 120Hz Lava-Wax, EF5 Tornado & Tesla Plasma",
    bullets: [
      "🪐 Year 3000+ Omega Point Singularity",
      "🫧 120Hz Haight-Ashbury Tie-Dye '67 Lava-Wax",
      "🌪️ EF5 Debris Tornado & ⚡ Tesla Coil Plasma",
    ],
    say: "Push your Linux GPU even further with Year Three Thousand Omega Point Singularity, 120 Hertz Haight-Ashbury Tie-Dye sixty-seven lava-wax folders, E F 5 Debris Tornado, and high-voltage Tesla Coil Plasma.",
    record: async (c) => {
      if (!(await c.exists(".theme-card"))) {
        await c.click("#tool-themes", { pause: 700 });
        await c.click(".menu [role^=menuitem] >> All themes", { pause: 1000 });
        await c.waitFor(".theme-card", 6000);
      }
      const searchTheme = async (q: string) => {
        await c.eval(`(() => {
          const e = document.querySelector('.dialog input[type=search]');
          if (e) { e.value = ${JSON.stringify(q)}; e.dispatchEvent(new Event('input', { bubbles: true })); }
        })()`);
        await sleep(550);
      };
      await searchTheme("omega");
      await c.click('.theme-card[data-key="omega_point_singularity"]', { pause: 1700 }).catch(() => {});
      await searchTheme("tie-dye");
      await c.click('.theme-card[data-key="summer_of_love_tiedye_67"]', { pause: 1700 }).catch(() => {});
      await searchTheme("tornado");
      await c.click('.theme-card[data-key="ef5_debris_tornado"]', { pause: 1700 }).catch(() => {});
      await searchTheme("tesla");
      await c.click('.theme-card[data-key="tesla_coil_plasma"]', { pause: 1600 }).catch(() => {});
      await searchTheme("polar night");
      await c.click('.theme-card[data-key="polar_night"]', { pause: 1400 }).catch(() => {});
    },
  },
  {
    id: "08_linux_hotkeys_cta",
    badge: "08 / 08 · ALT+U ULTRA & ALT+R RANDOM HOTKEYS",
    title: "ALT+U ULTRA, ALT+R\n& FREE DOWNLOAD!",
    label: "🚀 ALT+U ULTRA · 🎲 ALT+R ANY · ✨ ALT+E FX · ⏹️ ALT+P PLAIN · 🛑 ALT+0",
    extra: "Zero-Dialog Instant Theme Switching on Linux + Free Download on GitHub",
    bullets: [
      "🚀 Alt+U Instant Random Ultra Theme (No Dialog)",
      "🎲 Alt+R Random · ✨ Alt+E FX · ⏹️ Alt+P Plain 0% GPU",
      "⬇️ Free Open-Source Download at GitHub Releases",
    ],
    say: "Back on your workspace, press Alt U for an instant random Ultra theme, Alt R for any theme, Alt P for zero-G P U plain mode, or Alt Zero to toggle shaders—with zero dialogs! Grab the Linux release on GitHub and watch the full tutorial below!",
    record: async (c) => {
      // Close the theme modal so the viewer sees Polar Night & Ultra themes live across the File Manager + Linux Terminal
      await c.eval(`(() => {
        document.querySelectorAll('.modal-backdrop button[value="close"], .modal-backdrop button[value="cancel"], .dialog-close').forEach((b) => b.click());
      })()`);
      await sleep(700);
      const triggerShortcut = async (label: string, code: string) => {
        await c.eval(`window.__cc.keys(${JSON.stringify([label])})`);
        await c.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', code: ${JSON.stringify(code)}, altKey: true, bubbles: true }))`);
        await sleep(1500);
      };
      await triggerShortcut("Alt + U  (Random Ultra Theme)", "KeyU");
      await triggerShortcut("Alt + E  (Random FX Theme)", "KeyE");
      await triggerShortcut("Alt + P  (Random Plain 0% GPU)", "KeyP");
      await c.eval(`(async () => {
        window.__cc.keys(["❄️ Polar Night (Ultra)"]);
        const tm = await import('/ui/themes.js');
        if (tm.applyTheme) await tm.applyTheme('polar_night');
      })()`).catch(() => {});
      await sleep(1800);
    },
  },
];

function overlay(scene: SceneSpec, index: number): string {
  const isLast = index === sceneSpecs.length - 1;
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{background:radial-gradient(900px 600px at 50% 0%,#0f3d5e,transparent),#070b12;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.top{position:absolute;top:54px;left:44px;right:44px;display:flex;flex-direction:column;gap:14px}
.badge{align-self:flex-start;background:linear-gradient(135deg,#0ea5e9,#6366f1,#10b981);color:#fff;font-weight:800;font-size:22px;letter-spacing:.1em;padding:8px 18px;border-radius:999px;text-transform:uppercase}
.title{font-size:62px;font-weight:900;line-height:1.04;letter-spacing:-.02em;white-space:pre-line;background:linear-gradient(90deg,#ffffff,#7dd3fc 58%,#6ee7b7);-webkit-background-clip:text;background-clip:text;color:transparent}
.label{color:#38bdf8;font-size:26px;font-weight:800;letter-spacing:.03em;margin-top:4px}
.extra{color:#cbd5e1;font-size:23px;font-weight:600;line-height:1.35}
.pills{position:absolute;top:1270px;left:44px;right:44px;display:flex;flex-direction:column;gap:14px}
.pill{background:rgba(15,23,42,.9);border:1px solid rgba(56,189,248,.42);border-left:6px solid #38bdf8;border-radius:14px;padding:16px 22px;font-size:26px;font-weight:700;color:#e0f2fe;display:flex;align-items:center;gap:14px}
.dot{color:#34d399;font-weight:900}
.cta{position:absolute;top:1525px;left:36px;right:36px;background:linear-gradient(135deg,rgba(14,61,94,.96),rgba(15,23,42,.96));border:2px solid #38bdf8;border-radius:20px;padding:24px 28px;box-shadow:0 16px 40px rgba(0,0,0,.65)}
.cta strong{font-size:29px;color:#7dd3fc;display:block;letter-spacing:.02em}
.cta p{font-size:24px;margin-top:8px;color:#f1f5f9;font-weight:600}
.cta .sub{font-size:21px;color:#94a3b8;margin-top:6px}
</style>
<div class="top">
  <div class="badge">${esc(scene.badge)}</div>
  <div class="title">${esc(scene.title)}</div>
  <div class="label">${esc(scene.label)}</div>
  <div class="extra">${esc(scene.extra)}</div>
</div>
<div class="pills">
  ${scene.bullets.map((b) => `<div class="pill"><span class="dot">🐧</span><span>${esc(b)}</span></div>`).join("")}
</div>
${
  isLast
    ? `<div class="cta"><strong>▶ FREE LINUX DOWNLOAD + FULL MASTER TUTORIAL BELOW</strong><p>Tap the related video link right below my channel name!</p><p class="sub">${esc(REPO)}/releases/tag/v1.4.9</p></div>`
    : `<div class="cta"><strong>▶ HIGH-END LINUX WORKSTATION EDITION (v1.4.9)</strong><p>1-Click Convert Packages · Polar Night &amp; 310 Themes · 194 Live Shaders</p><p class="sub">${esc(REPO)}/releases/latest · MIT Open Source</p></div>`
}`;
}

function notesMarkdown(seconds: number, tempo: number, sceneMarks: Array<{ at: number; scene: SceneSpec }>): string {
  const fmt = (sec: number) => {
    const s = Math.floor(sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const stamps = sceneMarks.map((m, i) => `${fmt(i === 0 ? 0 : m.at)} ${m.scene.label}`).join("\n");
  return `# Codecaine File Manager on High-End Linux — GitHub Release Install, 1-Click Convert Packages & Polar Night Ultra Themes Short (${fmt(seconds)})

## Video File

- **Short MP4 (< 3 min)**: \`youtube_production/codecaine-file-manager-linux-short.mp4\` (${seconds.toFixed(1)}s, 1080×1920 vertical, 30 fps, 2x Retina Display-P3 super-sampled)

## YouTube Short Titles (Pick One)

1. **High-End Linux File Manager: 1-Click Convert Packages & Polar Night Ultra Shaders! 🐧❄️ #Shorts**
2. **Installing Codecaine File Manager on Linux + 1-Click All Convert Packages & Polar Night Theme #Shorts**
3. **310 Themes on Linux?! Polar Night, 1-Click Convert Setup & 120Hz Ultra Shaders (v1.4.9) #Shorts**

## YouTube Short Description (< 5,000 chars, Copy & Paste)

\`\`\`text
See how fast you can go from downloading the Linux release on GitHub to installing all 10 Convert helper packages in a single click and running Polar Night and 120Hz Ultra themes on a High-End Linux Workstation!

▶ WATCH THE FULL STEP-BY-STEP MASTER TUTORIAL:
Tap the clickable Related Video link right below my channel name in the Shorts player!

⬇️ Free Download for Linux (x64), macOS (Apple Silicon) & Windows (x64):
${REPO}/releases/tag/v1.4.9
⭐ Source Code (MIT Open Source):
${REPO}

WHAT IS COVERED IN THIS LINUX SHORT:
1. Download the standalone Linux release from GitHub Releases (Codecaine-File-Manager-v1.4.9-linux-x64.zip or bun-rad-studio-v1.4.9-linux-x64.tar.gz)
2. Run sh install.sh --apparmor to set up the Linux desktop launcher, icons, and Ubuntu 24.04+ AppArmor userns profile, then launch with the synced zsh/bash Terminal
3. Open Convert & Process → One-Click Setup → Install all 10 helper packages (FFmpeg, ImageMagick, LibreOffice, Pandoc, Poppler PDF tools, qpdf, Ghostscript, Tesseract OCR, ExifTool, and 7-Zip) in one click via apt, dnf, pacman, or Homebrew
4. Batch-convert photos, videos, audio, and Office documents with non-destructive background tasks
5. Enable 1-Click Optimize for Linux / VM zero-readback GPU acceleration + live Hardware VFD & Winamp Spectrum Telemetry Deck
6. Tour the Ultra Tier themes on Linux: Polar Night (Arctic frosted glass + live Blizzard & Aurora Australis dual shader + 3D cryo-crystal folders), Orbital Ice, Cryo-Glacier Icicle Storm, Linux Papirus HiDPI Workstation, Year 3000+ Omega Point Singularity, 120Hz Haight-Ashbury Tie-Dye '67, EF5 Debris Tornado, and Tesla Coil Plasma
7. Instant zero-dialog Linux random theme hotkeys: Alt+U (Random Ultra), Alt+R (Random Any), Alt+E (Random FX), Alt+P (Random Plain 0% GPU), and Alt+0 (Toggle FX)

TIMESTAMPS
${stamps}

#Linux #Ubuntu #FileManager #OpenSource #PolarNight #LinuxDesktop #Debian #Fedora #ArchLinux #Wayland #Themes #Shaders #DeveloperTools #Bun #TypeScript #Shorts
\`\`\`

## Bluesky Post (Copy & Paste)

\`\`\`text
🐧❄️ Codecaine File Manager v1.4.9 on High-End Linux!

• Download standalone Linux x64 binary from GitHub & run sh install.sh --apparmor
• 1-Click Setup installs all 10 Convert packages (FFmpeg, ImageMagick, LibreOffice, Pandoc, Poppler, qpdf, OCR, 7z)
• Polar Night & 310 Ultra 120Hz themes!

${REPO}/releases/tag/v1.4.9
\`\`\`
`;
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  seedLinuxWorld();

  // 1. Generate narration first so each live recording matches the narration duration
  const narrated: Array<{ scene: SceneSpec; audio: string; seconds: number }> = [];
  for (const scene of sceneSpecs) {
    console.log(`🎙️  Narrating ${scene.id}...`);
    const narration = await narrate(scene.id, scene.say, join(WORK, "audio"), { rate: "+4%", gap: 0.22 });
    const audio = join(WORK, `${scene.id}.wav`);
    const seconds = Math.max(3.5, duration(narration) - 0.85);
    run([
      FFMPEG,
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      "0.25",
      "-i",
      narration,
      "-t",
      seconds.toFixed(3),
      "-c:a",
      "pcm_s16le",
      audio,
    ]);
    narrated.push({ scene, audio, seconds: duration(audio) });
  }

  const total = narrated.reduce((sum, item) => sum + item.seconds, 0);
  const tempo = Math.max(1, total / 172);
  console.log(`⏱️  Total narration ${total.toFixed(2)}s; pace factor ${tempo.toFixed(3)}x`);

  // 2. Start File Manager server and record each scene live in 2x Retina 1920x972
  const fm = Bun.spawn(
    [
      process.execPath,
      join(ROOT, "applications", "file_manager_studio.ts"),
      "--server",
      "--port",
      String(FM_PORT),
      "--home",
      HOME,
      "--data-dir",
      DATA,
      "--path",
      `${HOME}/Documents/Trip`,
    ],
    {
      cwd: "/tmp",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        GRAVEYARD: GRAVE,
        SHELL: "/bin/zsh",
        ZDOTDIR: ZDOT,
      },
    },
  );

  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) break;
    } catch {}
    await sleep(200);
  }

  const recBrowser = await Cdp.launch(CDP_REC_PORT, join(WORK, "chrome-rec"), VIEW_W, VIEW_H);
  const rawClips: Map<string, string> = new Map();

  try {
    for (const item of narrated) {
      const { scene } = item;
      const clipPath = join(WORK, `${scene.id}_raw.mp4`);
      if (!existsSync(clipPath)) {
        console.log(`🎥 Recording live scene ${scene.id}...`);
        if (scene.id === "01_github_linux_download") {
          const ghHtml = join(WORK, "github_release_linux.html");
          writeFileSync(ghHtml, buildGithubReleaseHtml());
          await recBrowser.goto(`file://${ghHtml}`, null);
        } else if (scene.id === "02_linux_install_terminal") {
          await recBrowser.goto(`http://127.0.0.1:${FM_PORT}/`);
        }
        await recBrowser.startRecording();
        await scene.record(recBrowser);
        await sleep(400);
        await recBrowser.stopRecording(clipPath, join(WORK, `frames_${scene.id}`), item.seconds / tempo);
      } else {
        console.log(`♻️  Reusing recorded clip ${scene.id}_raw.mp4`);
      }
      rawClips.set(scene.id, clipPath);
    }
  } finally {
    recBrowser.close();
    try {
      fm.kill(9);
    } catch {}
  }

  // 3. Render vertical 1080x1920 overlays and composite each segment
  const ovlBrowser = await Cdp.launch(CDP_OVL_PORT, join(WORK, "chrome-ovl"), 1080, 1920);
  const segments: string[] = [];
  const sceneMarks: Array<{ at: number; scene: SceneSpec }> = [];
  let at = 0;

  try {
    for (const [index, item] of narrated.entries()) {
      const { scene, audio } = item;
      const rawClip = rawClips.get(scene.id)!;
      const clipDur = duration(rawClip);
      const seconds = item.seconds / tempo;

      console.log(`🎬 Compositing ${scene.id} (${seconds.toFixed(1)}s)...`);
      const html = join(WORK, `${scene.id}.html`);
      const png = join(WORK, `${scene.id}.png`);
      writeFileSync(html, overlay(scene, index));
      await ovlBrowser.goto(`file://${html}`, null);
      await ovlBrowser.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
      const screenshot = await ovlBrowser.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      writeFileSync(png, Buffer.from(screenshot.data, "base64"));

      const segment = join(WORK, `${scene.id}.mp4`);
      const ptsScale = (seconds / clipDur).toFixed(5);
      const filter = `[0:v]setpts=(PTS-STARTPTS)*${ptsScale},fps=30,scale=1080:-2:flags=lanczos[demo];[2:v]scale=1080:1920:flags=lanczos[bg];[bg][demo]overlay=0:630:shortest=1,format=yuv420p[v]`;

      run([
        FFMPEG,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        rawClip,
        "-i",
        audio,
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        png,
        "-filter_complex",
        `${filter};[1:a]atempo=${tempo.toFixed(4)},aresample=48000,pan=stereo|c0=c0|c1=c0[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        seconds.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        segment,
      ]);
      sceneMarks.push({ at, scene });
      at += duration(segment);
      segments.push(segment);
    }
  } finally {
    ovlBrowser.close();
  }

  const list = join(WORK, "concat.txt");
  writeFileSync(list, segments.map((file) => `file '${file}'`).join("\n") + "\n");
  run([
    FFMPEG,
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    OUTPUT,
  ]);

  const finalSeconds = duration(OUTPUT);
  const notes = notesMarkdown(finalSeconds, tempo, sceneMarks);
  writeFileSync(NOTES, notes);
  writeFileSync(join(WORK, "upload-guide.txt"), notes);
  console.log(`✅ Built ${OUTPUT} (${finalSeconds.toFixed(2)}s)`);
  console.log(`📝 Wrote ${NOTES}`);
}

await main();
process.exit(0);
