#!/usr/bin/env bun
import { Sys } from "../src/simplecli/sys";
import { Ansi } from "../src/simplecli/core/ansi";
import { existsSync } from "fs";
import { join } from "path";

interface Dependency {
  category: string;
  formula: string;
  binNames: string[];
  name: string;
  description: string;
  studioApp: string;
  optional?: boolean;
}

const DEPENDENCIES: Dependency[] = [
  // Media, Audio & Graphics
  { category: "Media & Graphics", formula: "ffmpeg", binNames: ["ffmpeg", "ffprobe"], name: "FFmpeg & FFprobe", description: "Video/Audio transcoding & media processing", studioApp: "Media Studio Hub" },
  { category: "Media & Graphics", formula: "imagemagick", binNames: ["magick", "convert"], name: "ImageMagick", description: "Image manipulation & asset generation", studioApp: "ImageMagick Studio" },
  { category: "Media & Graphics", formula: "yt-dlp", binNames: ["yt-dlp"], name: "yt-dlp", description: "High-speed media and stream downloader", studioApp: "YT-DLP Studio" },
  { category: "Media & Graphics", formula: "exiftool", binNames: ["exiftool"], name: "ExifTool", description: "Image & video metadata inspector", studioApp: "Exif Studio" },
  { category: "Media & Graphics", formula: "tesseract", binNames: ["tesseract"], name: "Tesseract OCR", description: "Optical character recognition engine", studioApp: "OCR Studio" },
  { category: "Media & Graphics", formula: "graphviz", binNames: ["dot"], name: "Graphviz (DOT)", description: "Graph layout and architecture diagramming", studioApp: "DOT Studio" },

  // Text, Data & Document Processing
  { category: "Text & Data", formula: "jq", binNames: ["jq"], name: "jq", description: "High-performance JSON processor & filter", studioApp: "JQ Studio Pro" },
  { category: "Text & Data", formula: "yq", binNames: ["yq"], name: "yq", description: "YAML, JSON & XML command-line editor", studioApp: "DataConvert Studio" },
  { category: "Text & Data", formula: "pandoc", binNames: ["pandoc"], name: "Pandoc", description: "Universal markup document converter", studioApp: "Pandoc Studio" },
  { category: "Text & Data", formula: "gawk", binNames: ["gawk"], name: "GNU Awk (gawk)", description: "Pattern scanning & data language", studioApp: "Gawk Studio" },
  { category: "Text & Data", formula: "sd", binNames: ["sd"], name: "sd", description: "Intuitive regex search and replace", studioApp: "OmniTool Studio Pro" },

  // Search, Navigation & Modern CLI
  { category: "Search & Navigation", formula: "ripgrep", binNames: ["rg"], name: "ripgrep (rg)", description: "Ultra-fast recursive regex searcher", studioApp: "OmniTool Studio Pro" },
  { category: "Search & Navigation", formula: "fd", binNames: ["fd"], name: "fd", description: "Simple, fast and user-friendly file finder", studioApp: "OmniTool Studio Pro" },
  { category: "Search & Navigation", formula: "eza", binNames: ["eza"], name: "eza", description: "Modern replacement for ls with tree view", studioApp: "OmniTool Studio Pro" },
  { category: "Search & Navigation", formula: "bat", binNames: ["bat"], name: "bat", description: "Syntax-highlighted pager & viewer", studioApp: "OmniTool Studio Pro" },
  { category: "Search & Navigation", formula: "watchexec", binNames: ["watchexec"], name: "watchexec", description: "Continuous file watcher & daemon", studioApp: "Watchexec Studio" },
  { category: "Search & Navigation", formula: "ouch", binNames: ["ouch"], name: "ouch", description: "Universal compression & decompression", studioApp: "Ouch Studio" },
  { category: "Search & Navigation", formula: "rip2", binNames: ["rip"], name: "rip (rm-improved)", description: "Safe trash graveyard with undo support", studioApp: "OmniTool Studio Pro" },

  // Database, Network & Security
  { category: "Database & Security", formula: "sqlite", binNames: ["sqlite3"], name: "SQLite", description: "Self-contained SQL database engine", studioApp: "SQLite Studio Pro" },
  { category: "Database & Security", formula: "wget2", binNames: ["wget2", "wget"], name: "Wget2", description: "Multi-threaded HTTP/HTTPS downloader", studioApp: "Wget2 Studio" },
  { category: "Database & Security", formula: "nmap", binNames: ["nmap"], name: "Nmap", description: "Network security scanner & port auditing", studioApp: "Nmap Studio" },
  { category: "Database & Security", formula: "bind", binNames: ["dig"], name: "BIND (dig)", description: "DNS lookup and domain forensics utility", studioApp: "DNS Studio" },
  { category: "Database & Security", formula: "openssl@3", binNames: ["openssl"], name: "OpenSSL 3", description: "TLS/SSL cryptography toolkit", studioApp: "Crypto Studio" },
  { category: "Database & Security", formula: "whois", binNames: ["whois"], name: "WHOIS", description: "Internet domain registry inspector", studioApp: "Recon Studio" },
  { category: "Database & Security", formula: "subfinder", binNames: ["subfinder"], name: "Subfinder", description: "Passive subdomain discovery tool", studioApp: "Subfinder Studio" },
  { category: "Database & Security", formula: "qrencode", binNames: ["qrencode"], name: "qrencode", description: "QR code data generator", studioApp: "Media Studio Hub" },

  // Mathematics & Scientific Calculators
  { category: "Calculators", formula: "libqalculate", binNames: ["qalc"], name: "Qalculate! (qalc)", description: "Multi-purpose desktop calculator engine", studioApp: "Qalc Studio" },
  { category: "Calculators", formula: "numbat", binNames: ["numbat"], name: "Numbat", description: "Physical dimensions & scientific calculator", studioApp: "Numbat Studio" },
  { category: "Calculators", formula: "kalker", binNames: ["kalker"], name: "Kalker", description: "Full-featured scientific math engine", studioApp: "Kalker Studio" },

  // Optional cross-compilation
  { category: "Cross-Compilation", formula: "zig", binNames: ["zig"], name: "Zig Compiler", description: "Toolchain for cross-platform builds", studioApp: "App Bundler Studio", optional: true },
  { category: "Cross-Compilation", formula: "mingw-w64", binNames: ["x86_64-w64-mingw32-gcc"], name: "MinGW-w64 GCC", description: "Windows target cross-compiler", studioApp: "App Bundler Studio", optional: true },
];

function isToolInstalled(dep: Dependency): { installed: boolean; path: string; version: string } {
  for (const bin of dep.binNames) {
    const [out, code] = Sys.exec(`which ${bin}`);
    if (code === 0 && out.trim()) {
      const p = out.trim();
      const [verOut] = Sys.exec(`${p} --version 2>&1 | head -n 1`);
      return { installed: true, path: p, version: verOut.trim().slice(0, 30) };
    }
  }
  return { installed: false, path: "", version: "" };
}

export async function runDependencyCheckAndInstall(autoInstall = false, includeOptional = false) {
  console.log(`\n========================================================================`);
  console.log(`📦 Bun RAD Studio - Homebrew Dependency Inspector & Installer`);
  console.log(`========================================================================\n`);

  const missing: Dependency[] = [];
  const installed: Dependency[] = [];

  const targets = DEPENDENCIES.filter(d => !d.optional || includeOptional);

  console.log(`${Ansi.bold("STATUS")}  ${Ansi.bold("FORMULA".padEnd(16))} ${Ansi.bold("NAME".padEnd(24))} ${Ansi.bold("STUDIO WORKBENCH".padEnd(22))} ${Ansi.bold("BINARY PATH")}`);
  console.log("─".repeat(88));

  for (const dep of targets) {
    const info = isToolInstalled(dep);
    if (info.installed) {
      installed.push(dep);
      console.log(`${Ansi.green("✔ YES ")}  ${Ansi.cyan(dep.formula.padEnd(16))} ${dep.name.padEnd(24)} ${dep.studioApp.padEnd(22)} ${Ansi.dim(info.path)}`);
    } else {
      missing.push(dep);
      const mark = dep.optional ? Ansi.yellow("○ OPT ") : Ansi.red("✖ NO  ");
      console.log(`${mark}  ${Ansi.bold(dep.formula.padEnd(16))} ${dep.name.padEnd(24)} ${dep.studioApp.padEnd(22)} ${Ansi.red("(Not Installed)")}`);
    }
  }

  console.log("\n" + "─".repeat(88));
  console.log(`Summary: ${Ansi.green(`${installed.length} Installed`)} | ${Ansi.yellow(`${missing.length} Missing / Not on PATH`)} | Total: ${targets.length}`);

  if (missing.length === 0) {
    console.log(`\n${Ansi.green("✨ All dependencies are satisfied! All 11 desktop workstations are 100% operational.")}\n`);
    return;
  }

  if (autoInstall) {
    const missingRequired = missing.filter(m => !m.optional);
    if (missingRequired.length === 0) {
      console.log(`\nAll required dependencies are present! Only optional toolchains are missing.`);
      return;
    }

    console.log(`\n${Ansi.cyan("⚡ Auto-installing missing dependencies via Homebrew...")}`);
    const brewFile = join(process.cwd(), "Brewfile");
    if (existsSync(brewFile)) {
      console.log(`Executing: brew bundle --file ${brewFile}\n`);
      const proc = Bun.spawn(["brew", "bundle", "--file", brewFile], {
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, CI: "1", HOMEBREW_NO_AUTO_UPDATE: "1" }
      });
      await proc.exited;
      console.log(`\n${Ansi.green("✔ Homebrew bundle install completed.")}\n`);
    } else {
      for (const m of missingRequired) {
        console.log(`Installing ${m.formula}...`);
        Sys.exec(`brew install ${m.formula}`);
      }
    }
  } else {
    console.log(`\n${Ansi.bold("To automatically install missing tools with Homebrew, run:")}`);
    console.log(`  ${Ansi.cyan("./install_homebrew_dependencies.sh")}`);
    console.log(`  Or: ${Ansi.cyan("brew bundle --file ./Brewfile")}\n`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const autoInstall = args.includes("--install") || args.includes("-i");
  const includeOptional = args.includes("--optional") || args.includes("--all");
  await runDependencyCheckAndInstall(autoInstall, includeOptional);
}
