#!/usr/bin/env bun
/**
 * ⚡ Synchronizes Homebrew Formula & Cask definitions (`Formula/*.rb`, `Casks/*.rb`)
 * with `package.json` version and `release/SHA256SUMS.txt` digests.
 *
 * Usage:
 *   bun run scripts/sync_homebrew.ts                  # Update Formula/ and Casks/ in place
 *   bun run scripts/sync_homebrew.ts --check          # Verify Formula/ and Casks/ match version & checksums
 *   bun run scripts/sync_homebrew.ts --export-tap     # Also emit a standalone 10 KB tap in dist/homebrew-tap/
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");

export interface HomebrewChecksums {
  suiteMacosArm64: string;
  suiteMacosX64: string;
  suiteLinuxArm64: string;
  suiteLinuxX64: string;
  caskMacosArm64: string;
  caskMacosX64: string;
}

const PLACEHOLDER_SHA = "0".repeat(64);

export function parseSumsMap(sumsText: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const rawLine of sumsText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line);
    if (m) {
      map.set(m[2]!.trim(), m[1]!.toLowerCase());
    }
  }
  return map;
}

export function extractExistingFormulaSums(
  formulaPath: string,
  caskPath: string,
): Partial<HomebrewChecksums> {
  const out: Partial<HomebrewChecksums> = {};
  if (existsSync(formulaPath)) {
    const f = readFileSync(formulaPath, "utf8");
    const mArm = /macos-arm64\.tar\.gz"\s+sha256\s+"([a-f0-9]{64})"/m.exec(
      f,
    )?.[1];
    const mX64 = /macos-x64\.tar\.gz"\s+sha256\s+"([a-f0-9]{64})"/m.exec(
      f,
    )?.[1];
    const lArm = /linux-arm64\.tar\.gz"\s+sha256\s+"([a-f0-9]{64})"/m.exec(
      f,
    )?.[1];
    const lX64 = /linux-x64\.tar\.gz"\s+sha256\s+"([a-f0-9]{64})"/m.exec(
      f,
    )?.[1];
    if (mArm) out.suiteMacosArm64 = mArm;
    if (mX64) out.suiteMacosX64 = mX64;
    if (lArm) out.suiteLinuxArm64 = lArm;
    if (lX64) out.suiteLinuxX64 = lX64;
  }
  if (existsSync(caskPath)) {
    const c = readFileSync(caskPath, "utf8");
    const cArm = /arm:\s+"([a-f0-9]{64})"/m.exec(c)?.[1];
    const cX64 = /intel:\s+"([a-f0-9]{64})"/m.exec(c)?.[1];
    if (cArm) out.caskMacosArm64 = cArm;
    if (cX64) out.caskMacosX64 = cX64;
  }
  return out;
}

export function resolveChecksumsForVersion(
  version: string,
  sumsMap: Map<string, string>,
  fallback: Partial<HomebrewChecksums> = {},
): HomebrewChecksums {
  const get = (assetName: string, fb?: string) =>
    sumsMap.get(assetName) || fb || PLACEHOLDER_SHA;

  return {
    suiteMacosArm64: get(
      `bun-rad-studio-v${version}-macos-arm64.tar.gz`,
      fallback.suiteMacosArm64,
    ),
    suiteMacosX64: get(
      `bun-rad-studio-v${version}-macos-x64.tar.gz`,
      fallback.suiteMacosX64,
    ),
    suiteLinuxArm64: get(
      `bun-rad-studio-v${version}-linux-arm64.tar.gz`,
      fallback.suiteLinuxArm64,
    ),
    suiteLinuxX64: get(
      `bun-rad-studio-v${version}-linux-x64.tar.gz`,
      fallback.suiteLinuxX64,
    ),
    caskMacosArm64: get(
      `Codecaine-File-Manager-v${version}-macos-arm64.zip`,
      fallback.caskMacosArm64,
    ),
    caskMacosX64: get(
      `Codecaine-File-Manager-v${version}-macos-x64.zip`,
      fallback.caskMacosX64,
    ),
  };
}

function renderFormulaSpecHeader(
  version: string,
  sums: HomebrewChecksums,
  repo: string,
): string {
  return `  homepage "https://github.com/${repo}"
  version "${version}"
  license "MIT"

  head do
    url "https://github.com/${repo}.git", branch: "main"
    depends_on "bun"
  end

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/${repo}/releases/download/v${version}/bun-rad-studio-v${version}-macos-arm64.tar.gz"
      sha256 "${sums.suiteMacosArm64}"
    else
      url "https://github.com/${repo}/releases/download/v${version}/bun-rad-studio-v${version}-macos-x64.tar.gz"
      sha256 "${sums.suiteMacosX64}"
    end
  end

  on_linux do
    # Desktop GUI studios use webview-bun backed by GTK4 + WebKitGTK-6.0
    depends_on "gtk4"

    if Hardware::CPU.arm?
      url "https://github.com/${repo}/releases/download/v${version}/bun-rad-studio-v${version}-linux-arm64.tar.gz"
      sha256 "${sums.suiteLinuxArm64}"
    else
      url "https://github.com/${repo}/releases/download/v${version}/bun-rad-studio-v${version}-linux-x64.tar.gz"
      sha256 "${sums.suiteLinuxX64}"
    end
  end`;
}

export function renderSuiteFormula(
  version: string,
  sums: HomebrewChecksums,
  repo = "codecaine-zz/bun_rad_studio",
): string {
  return (
    `# typed: false
# frozen_string_literal: true

# Release version "${version}"
class CodecaineUtilitySuite < Formula
  desc "RAD desktop studio applications and CLI utility suite"
${renderFormulaSpecHeader(version, sums, repo)}

  conflicts_with "codecaine", because: "both install the codecaine suite commands"

  def install
    libexec.install Dir["*"]

    if (libexec/"runtime/bun").exist?
      # Pre-built release archive: bundled Bun runtime + pre-compiled JS bundles (zero build step needed)
      chmod 0755, libexec/"runtime/bun"
      bin_dir = libexec/"bin"
      Dir["#{bin_dir}/*"].each { |f| chmod 0755, f if File.file?(f) }

      # Ensure friendly codecaine-* prefixed entrypoints exist without clashing with system tools (e.g. redis-cli)
      alias_map = {
        "codecaine"              => "codecaine-suite-cli",
        "codecaine-suite"        => "codecaine-suite-cli",
        "codecaine-launcher"     => "launcher-studio",
        "codecaine-launcher-cli" => "launcher-cli",
        "codecaine-file-manager" => "file-manager-studio",
        "dr-codecaine"           => "dr-codecaine-studio",
        "codecaine-arcade"       => "dr-codecaine-studio",
        "codecaine-bros"         => "codecaine-bros-studio",
      }
      alias_map.each do |alias_name, target_name|
        target_path = bin_dir/target_name
        link_path = bin_dir/alias_name
        ln_sf target_name, link_path if target_path.exist? && !link_path.exist?
      end

      Dir["#{bin_dir}/*"].each do |entry|
        next if !File.file?(entry) || File.symlink?(entry)

        base = File.basename(entry)
        next if base.start_with?("codecaine")

        if base.end_with?("-cli")
          stem = base.sub(/-cli$/, "")
          [
            "codecaine-#{stem}",
            "codecaine-#{stem}-cli",
          ].each do |prefixed|
            dest = bin_dir/prefixed
            ln_sf base, dest unless dest.exist?
          end
        elsif base.end_with?("-studio")
          stem = base.sub(/-studio$/, "")
          [
            "codecaine-#{base}",
            "codecaine-#{stem}",
          ].each do |prefixed|
            dest = bin_dir/prefixed
            ln_sf base, dest unless dest.exist?
          end
        else
          dest = bin_dir/"codecaine-#{base}"
          ln_sf base, dest unless dest.exist?
        end
      end
    else
      # Source (--HEAD) build using Homebrew's bun
      cd libexec do
        system("bun", "install", "--frozen-lockfile") || system("bun", "install")
        system "bun", "run", "scripts/generate_brew_suite.ts"
      end
    end

    # Keep wrappers inside libexec/bin (where relative ../ resolution finds libexec)
    # and expose only collision-free codecaine* / dr-codecaine exec scripts in Homebrew's bin directory.
    exposed = Dir["#{libexec}/bin/codecaine*", "#{libexec}/bin/dr-codecaine"].uniq.select do |f|
      File.executable?(f) && !File.directory?(f)
    end
    bin.write_exec_script exposed
  end

  def caveats
    <<~EOS
      ⚡ Codecaine Utility Suite v#{version} has been installed!

      Quick Start:
        codecaine                  # Open Unified Launcher Studio Pro GUI
        codecaine-file-manager     # Open Codecaine File Manager desktop app
        codecaine list             # Browse all 200+ GUI studios and CLI utilities
        codecaine search <term>    # Search tools by name or description
        codecaine run <name>       # Run any studio or CLI utility with arguments
        codecaine doctor           # Run health & environment diagnostics

      macOS Native .app Tip:
        To also install "Codecaine File Manager.app" into /Applications:
          brew install --cask codecaine-zz/tap/codecaine-file-manager

      Linux Desktop Note:
        GUI studio windows require GTK4 and WebKitGTK 6.0 (` +
    "`libwebkitgtk-6.0-4`" +
    ` on Ubuntu/Debian
        or ` +
    "`webkitgtk6.0`" +
    ` on Fedora). CLI utilities work headless with zero GUI libraries.
    EOS
  end

  test do
    assert_match "Codecaine Utility Suite", shell_output("#{bin}/codecaine --version")
    assert_match "Codecaine Utility Suite", shell_output("#{bin}/codecaine-suite --version")
    assert_match "SQLite", shell_output("#{bin}/codecaine-database --help")
    assert_match "Telemetry", shell_output("#{bin}/codecaine-system --help")
    assert_match "USAGE:", shell_output("#{bin}/codecaine-launcher-cli --help")
  end
end
`
  );
}

export function renderAliasFormula(
  version: string,
  sums: HomebrewChecksums,
  repo = "codecaine-zz/bun_rad_studio",
): string {
  return `# typed: false
# frozen_string_literal: true

require_relative "codecaine-utility-suite"

class Codecaine < CodecaineUtilitySuite
  desc "Short alias formula for Codecaine Utility Suite"
${renderFormulaSpecHeader(version, sums, repo)}

  conflicts_with "codecaine-utility-suite", because: "both install the codecaine suite commands"
end
`;
}

export function renderFileManagerCask(
  version: string,
  sums: HomebrewChecksums,
  repo = "codecaine-zz/bun_rad_studio",
): string {
  return `cask "codecaine-file-manager" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm:   "${sums.caskMacosArm64}",
         intel: "${sums.caskMacosX64}"

  url "https://github.com/${repo}/releases/download/v#{version}/Codecaine-File-Manager-v#{version}-macos-#{arch}.zip"
  name "Codecaine File Manager"
  desc "Dual-pane developer file manager with database studios, IDE, and vault"
  homepage "https://github.com/${repo}"

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
`;
}

export function syncHomebrewFiles(options?: {
  rootDir?: string;
  version?: string;
  sumsMap?: Map<string, string>;
  repo?: string;
  checkOnly?: boolean;
  exportTapDir?: string;
}): { changed: string[]; sums: HomebrewChecksums } {
  const rootDir = options?.rootDir ?? ROOT;
  const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  const version = options?.version ?? pkg.version;
  const repo = options?.repo ?? "codecaine-zz/bun_rad_studio";

  const formulaDir = join(rootDir, "Formula");
  const casksDir = join(rootDir, "Casks");
  const suiteFormulaPath = join(formulaDir, "codecaine-utility-suite.rb");
  const aliasFormulaPath = join(formulaDir, "codecaine.rb");
  const fmCaskPath = join(casksDir, "codecaine-file-manager.rb");

  const sumsFile = join(rootDir, "release", "SHA256SUMS.txt");
  const sumsMap =
    options?.sumsMap ??
    (existsSync(sumsFile)
      ? parseSumsMap(readFileSync(sumsFile, "utf8"))
      : new Map<string, string>());

  const existingSums = extractExistingFormulaSums(suiteFormulaPath, fmCaskPath);
  const sums = resolveChecksumsForVersion(version, sumsMap, existingSums);

  const expectedFiles: Array<{ path: string; content: string }> = [
    {
      path: suiteFormulaPath,
      content: renderSuiteFormula(version, sums, repo),
    },
    {
      path: aliasFormulaPath,
      content: renderAliasFormula(version, sums, repo),
    },
    {
      path: fmCaskPath,
      content: renderFileManagerCask(version, sums, repo),
    },
  ];

  const changed: string[] = [];
  for (const item of expectedFiles) {
    const current = existsSync(item.path)
      ? readFileSync(item.path, "utf8")
      : "";
    if (current !== item.content) {
      changed.push(item.path);
      if (!options?.checkOnly) {
        mkdirSync(resolve(item.path, ".."), { recursive: true });
        writeFileSync(item.path, item.content, "utf8");
      }
    }
  }

  if (options?.exportTapDir && !options?.checkOnly) {
    const tapDir = resolve(options.exportTapDir);
    mkdirSync(join(tapDir, "Formula"), { recursive: true });
    mkdirSync(join(tapDir, "Casks"), { recursive: true });
    writeFileSync(
      join(tapDir, "Formula", "codecaine-utility-suite.rb"),
      renderSuiteFormula(version, sums, repo),
      "utf8",
    );
    writeFileSync(
      join(tapDir, "Formula", "codecaine.rb"),
      renderAliasFormula(version, sums, repo),
      "utf8",
    );
    writeFileSync(
      join(tapDir, "Casks", "codecaine-file-manager.rb"),
      renderFileManagerCask(version, sums, repo),
      "utf8",
    );
    writeFileSync(
      join(tapDir, "README.md"),
      `# Homebrew Tap for Codecaine Utility Suite & File Manager (v${version})

\`\`\`bash
brew tap codecaine-zz/tap
brew install codecaine
brew install --cask codecaine-file-manager
\`\`\`
`,
      "utf8",
    );
  }

  return { changed, sums };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const exportTap = args.includes("--export-tap");
  const exportIdx = args.indexOf("--export-tap");
  const customTapDir =
    exportTap && args[exportIdx + 1] && !args[exportIdx + 1]!.startsWith("-")
      ? args[exportIdx + 1]!
      : exportTap
        ? join(ROOT, "dist", "homebrew-tap")
        : undefined;

  const { changed } = syncHomebrewFiles({
    checkOnly,
    exportTapDir: customTapDir,
  });

  if (checkOnly) {
    if (changed.length > 0) {
      console.error(
        `❌ Homebrew Formula/Cask files are out of sync:\n${changed.map((p) => `  - ${p}`).join("\n")}\nRun: bun run brew:sync`,
      );
      process.exit(1);
    }
    console.log("✅ Homebrew Formula & Cask files are in sync.");
    process.exit(0);
  }

  console.log(
    changed.length > 0
      ? `✅ Updated ${changed.length} Homebrew file(s):\n${changed.map((p) => `   • ${p}`).join("\n")}`
      : "✅ Homebrew Formula & Cask files are already up to date.",
  );
  if (customTapDir) {
    console.log(`🍺 Exported standalone Homebrew tap → ${customTapDir}`);
  }
}
