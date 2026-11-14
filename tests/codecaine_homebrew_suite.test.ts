import { describe, it, expect, beforeAll } from "bun:test";
import { resolve, join } from "node:path";
import { existsSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  generateAllWrappers,
  buildWrapperDefinitions,
} from "../scripts/generate_brew_suite.ts";
import { buildNpmPackage } from "../scripts/build_npm_package.ts";

describe("⚡ Codecaine Utility Suite — Homebrew Distribution & Binary Wrappers", () => {
  const root = resolve(process.cwd());
  const binDir = join(root, "bin");
  const formulaFile = join(root, "Formula", "codecaine-utility-suite.rb");
  const aliasFormulaFile = join(root, "Formula", "codecaine.rb");
  const caskFile = join(root, "Casks", "codecaine-file-manager.rb");
  const installerScript = join(root, "install_homebrew_suite.sh");
  const depsInstallerScript = join(root, "install_homebrew_dependencies.sh");
  const suiteCli = join(root, "cli_apps", "codecaine_suite_cli.ts");

  beforeAll(() => {
    // Ensure wrappers are generated for test execution
    generateAllWrappers();
  });

  const runSubprocess = async (
    cmd: string[],
    cwdOverride = root,
  ): Promise<{
    stdout: string;
    stderr: string;
    output: string;
    exitCode: number;
  }> => {
    // The files in bin/ are bash scripts: Windows can't start them directly, so Git Bash runs them (with forward slashes).
    const argv =
      process.platform === "win32" && cmd[0]?.startsWith(binDir)
        ? ["bash", cmd[0].replace(/\\/g, "/"), ...cmd.slice(1)]
        : cmd;
    const proc = Bun.spawn(argv, {
      cwd: cwdOverride,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { stdout, stderr, output: stdout + stderr, exitCode };
  };

  it("1. Homebrew Formula files exist and contain valid class specifications", () => {
    expect(existsSync(formulaFile)).toBe(true);
    expect(existsSync(aliasFormulaFile)).toBe(true);

    const formulaContent = readFileSync(formulaFile, "utf8");
    const pkgVersion = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ).version;
    expect(formulaContent).toContain("class CodecaineUtilitySuite < Formula");
    expect(formulaContent).toContain(`version "${pkgVersion}"`);
    expect(formulaContent).toContain('depends_on "bun"');
    expect(formulaContent).toContain('depends_on "gtk4"');
    expect(formulaContent).not.toContain('depends_on "gtk+3"');
    expect(formulaContent).toContain("bin.write_exec_script");
    expect(formulaContent).not.toContain('bin.install Dir["#{libexec}/bin/*"]');
    expect(formulaContent).toContain("def install");
    expect(formulaContent).toContain("test do");

    const aliasContent = readFileSync(aliasFormulaFile, "utf8");
    expect(aliasContent).toContain("class Codecaine < CodecaineUtilitySuite");
  });

  it("2. Homebrew Formula syntax passes ruby linter", async () => {
    // Formula files are for Homebrew (macOS and Linux); a Windows checkout may turn their line endings into CRLF, which Ruby's heredocs reject.
    if (process.platform === "win32" || !Bun.which("ruby")) return;
    const res = await runSubprocess(["ruby", "-c", formulaFile]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Syntax OK");

    const aliasRes = await runSubprocess(["ruby", "-c", aliasFormulaFile]);
    expect(aliasRes.exitCode).toBe(0);
    expect(aliasRes.output).toContain("Syntax OK");
  });

  it("3. Homebrew Installer script exists, is executable, and passes bash syntax validation", async () => {
    expect(existsSync(installerScript)).toBe(true);
    const stat = statSync(installerScript);
    if (process.platform !== "win32") {
      expect((stat.mode & 0o111) !== 0).toBe(true);
    }

    const syntaxRes = await runSubprocess(["bash", "-n", installerScript]);
    expect(syntaxRes.exitCode).toBe(0);

    const helpRes = await runSubprocess(
      process.platform === "win32"
        ? ["bash", installerScript, "--help"]
        : [installerScript, "--help"],
    );
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.output).toContain("Codecaine Utility Suite");
    expect(helpRes.output).toContain("--link");
    expect(helpRes.output).toContain("--build");
  });

  it("4. Wrapper Generator builds wrappers for all tools and outputs manifest.json", () => {
    const defs = buildWrapperDefinitions();
    expect(defs.length).toBeGreaterThanOrEqual(150);

    // Verify key wrappers exist in definition list
    const names = defs.map((d) => d.binName);
    expect(names).toContain("codecaine");
    expect(names).toContain("codecaine-suite");
    expect(names).toContain("codecaine-launcher");
    expect(names).toContain("codecaine-database");
    expect(names).toContain("codecaine-system");
    expect(names).toContain("codecaine-api");
    expect(names).toContain("codecaine-calc");
    expect(names).toContain("codecaine-sqlite-studio");
    expect(names).toContain("codecaine-mysql-studio");
    expect(names).toContain("codecaine-postgres-studio");
    expect(names).toContain("dr-codecaine");

    // Verify manifest.json
    const manifestFile = join(binDir, "manifest.json");
    const pkgVersion = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ).version;
    expect(existsSync(manifestFile)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    expect(manifest.suite).toBe("Codecaine Utility Suite");
    expect(manifest.version).toBe(pkgVersion);
    expect(manifest.totalWrappers).toBe(defs.length);
    expect(manifest.commands.length).toBe(defs.length);
  });

  it("5. Primary standalone executable wrappers are executable files", () => {
    const primaryBins = [
      "codecaine",
      "codecaine-suite",
      "codecaine-launcher",
      "codecaine-database",
      "codecaine-system",
      "codecaine-calc",
      "codecaine-sqlite-studio",
      "dr-codecaine",
    ];

    for (const b of primaryBins) {
      const p = join(binDir, b);
      expect(existsSync(p)).toBe(true);
      const stat = statSync(p);
      if (process.platform !== "win32") {
        expect((stat.mode & 0o111) !== 0).toBe(true);
      }
    }
  });

  it("6. Master codecaine CLI reports version and help", async () => {
    const verRes = await runSubprocess([
      process.execPath,
      suiteCli,
      "--version",
    ]);
    expect(verRes.exitCode).toBe(0);
    expect(verRes.output).toMatch(/Codecaine Utility Suite v\d+\.\d+\.\d+/);

    const helpRes = await runSubprocess([process.execPath, suiteCli, "--help"]);
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.output).toContain("USAGE:");
    expect(helpRes.output).toContain("codecaine run <name>");
  });

  it("7. Master codecaine CLI lists all tools with category and JSON options", async () => {
    const jsonRes = await runSubprocess([
      process.execPath,
      suiteCli,
      "list",
      "--json",
    ]);
    expect(jsonRes.exitCode).toBe(0);
    const data = JSON.parse(jsonRes.stdout);
    expect(data.suite).toBe("Codecaine Utility Suite");
    expect(data.kpis.total).toBeGreaterThanOrEqual(160);
    expect(data.kpis.radStudios).toBeGreaterThanOrEqual(60);
    expect(data.kpis.cliTools).toBeGreaterThanOrEqual(70);
    expect(data.tools.length).toBeGreaterThanOrEqual(160);

    const listRes = await runSubprocess([
      process.execPath,
      suiteCli,
      "list",
      "--cli",
    ]);
    expect(listRes.exitCode).toBe(0);
    expect(listRes.output).toContain("Database CLI");
  });

  it("8. Master codecaine CLI runs CLI utilities with forwarded arguments", async () => {
    const res = await runSubprocess([
      "bun",
      suiteCli,
      "run",
      "database",
      "--db",
      ":memory:",
      "--query",
      "SELECT 'codecaine_test_val' AS check_col",
    ]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Database Studio CLI");
    expect(res.output).toContain("codecaine_test_val");
  });

  it("9. Master codecaine CLI searches tools by keyword", async () => {
    const searchRes = await runSubprocess([
      process.execPath,
      suiteCli,
      "search",
      "sqlite",
    ]);
    expect(searchRes.exitCode).toBe(0);
    expect(searchRes.output).toContain('Search results for "sqlite"');
    expect(searchRes.output).toContain("SQLite Studio Pro");
  });

  it("10. Master codecaine CLI provides info and Homebrew status", async () => {
    const infoRes = await runSubprocess([process.execPath, suiteCli, "info"]);
    expect(infoRes.exitCode).toBe(0);
    expect(infoRes.output).toContain("Codecaine Utility Suite:");
    expect(infoRes.output).toContain("System Environment:");

    const brewRes = await runSubprocess([
      process.execPath,
      suiteCli,
      "brew",
      "status",
    ]);
    expect(brewRes.exitCode).toBe(0);
    expect(brewRes.output).toContain("Homebrew Integration Status:");
  });

  it("11. Standalone binary wrapper ./bin/codecaine runs successfully", async () => {
    const binExecutable = join(binDir, "codecaine");
    const res = await runSubprocess([binExecutable, "--version"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toMatch(/Codecaine Utility Suite v\d+\.\d+\.\d+/);
  });

  it("12. Standalone binary wrapper ./bin/codecaine-database runs in-memory query", async () => {
    const binExecutable = join(binDir, "codecaine-database");
    const res = await runSubprocess([
      binExecutable,
      "--db",
      ":memory:",
      "--query",
      "SELECT 777 AS lucky",
    ]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("777");
  });

  it("13. Standalone binary wrapper ./bin/codecaine-calc executes math expression", async () => {
    const binExecutable = join(binDir, "codecaine-calc");
    const res = await runSubprocess([binExecutable, "100 + 200"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Programmer Calculator CLI");
  });

  it("14. Homebrew Cask & sync_homebrew.ts --check validate cleanly", async () => {
    expect(existsSync(caskFile)).toBe(true);
    const pkgVersion = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ).version;
    const caskContent = readFileSync(caskFile, "utf8");
    expect(caskContent).toContain('cask "codecaine-file-manager"');
    expect(caskContent).toContain(`version "${pkgVersion}"`);
    expect(caskContent).toContain('app "Codecaine File Manager.app"');
    expect(caskContent).toContain("postflight_steps");

    if (process.platform !== "win32" && Bun.which("ruby")) {
      const caskSyntax = await runSubprocess(["ruby", "-c", caskFile]);
      expect(caskSyntax.exitCode).toBe(0);
    }

    const syncCheck = await runSubprocess([
      process.execPath,
      join(root, "scripts", "sync_homebrew.ts"),
      "--check",
    ]);
    expect(syncCheck.exitCode).toBe(0);

    const depsSyntax = await runSubprocess([
      "bash",
      "-n",
      depsInstallerScript.replace(/\\/g, "/"),
    ]);
    expect(depsSyntax.exitCode).toBe(0);
  });

  it("15. Master codecaine CLI works outside repository CWD with exact package version and doctor command", async () => {
    const pkgVersion = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ).version;
    const outsideDir = tmpdir();

    const verRes = await runSubprocess(
      [process.execPath, suiteCli, "--version"],
      outsideDir,
    );
    expect(verRes.exitCode).toBe(0);
    expect(verRes.output).toContain(`v${pkgVersion}`);

    const doctorRes = await runSubprocess(
      [process.execPath, suiteCli, "doctor"],
      outsideDir,
    );
    expect(doctorRes.exitCode).toBe(0);
    expect(doctorRes.output).toContain(`v${pkgVersion}`);
    expect(doctorRes.output).toContain("Detected Catalog:");
  });

  it("16. Publish-ready npm/Bun package (bun-rad-studio) builds and runs under both Bun and Node.js", async () => {
    const npmOutDir = join(root, "dist", "npm");
    const built = await buildNpmPackage({ outDir: npmOutDir, quiet: true });
    const pkgVersion = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ).version;

    expect(built.version).toBe(pkgVersion);
    expect(built.guiCount).toBeGreaterThanOrEqual(60);
    expect(built.cliCount).toBeGreaterThanOrEqual(70);
    expect(built.binCount).toBeGreaterThanOrEqual(150);

    const npmPkg = JSON.parse(
      readFileSync(join(npmOutDir, "package.json"), "utf8"),
    );
    expect(npmPkg.name).toBe("bun-rad-studio");
    expect(npmPkg.version).toBe(pkgVersion);
    expect(npmPkg.dependencies.bun).toBeDefined();
    expect(npmPkg.bin["bun-rad-studio"]).toBe("./bin/bun-rad-studio.mjs");
    expect(npmPkg.bin["codecaine"]).toBe("./bin/codecaine.mjs");

    for (const libName of [
      "libwebview.dylib",
      "libwebview-x64.so",
      "libwebview-arm64.so",
      "libwebview.dll",
    ]) {
      expect(existsSync(join(npmOutDir, "lib", libName))).toBe(true);
    }
    expect(existsSync(join(npmOutDir, "src", "ide.html"))).toBe(true);
    expect(existsSync(join(npmOutDir, "apps", "postgres_designer.js"))).toBe(
      true,
    );
    expect(existsSync(join(npmOutDir, "workers", "fmFindWorker.js"))).toBe(
      true,
    );

    const outsideDir = tmpdir();
    const bunShimRes = await runSubprocess(
      [
        process.execPath,
        join(npmOutDir, "bin", "bun-rad-studio.mjs"),
        "doctor",
      ],
      outsideDir,
    );
    expect(bunShimRes.exitCode).toBe(0);
    expect(bunShimRes.output).toContain(`v${pkgVersion}`);
    expect(bunShimRes.output).toContain("npm-global");

    const dbShimRes = await runSubprocess(
      [
        process.execPath,
        join(npmOutDir, "bin", "codecaine-database.mjs"),
        "--db",
        ":memory:",
        "--query",
        "SELECT 314 AS npm_pi",
      ],
      outsideDir,
    );
    expect(dbShimRes.exitCode).toBe(0);
    expect(dbShimRes.output).toContain("314");

    // Verify Node.js runtime shim delegation when node is installed on the host
    const nodeBin = Bun.which("node");
    if (nodeBin) {
      const nodeRes = await runSubprocess(
        [
          nodeBin,
          join(npmOutDir, "bin", "codecaine-database.mjs"),
          "--db",
          ":memory:",
          "--query",
          "SELECT 2718 AS node_e",
        ],
        outsideDir,
      );
      expect(nodeRes.exitCode).toBe(0);
      expect(nodeRes.output).toContain("2718");
    }

    // Verify library exports resolve cleanly without opening a native window
    const libMod: any = await import(
      pathToFileURL(join(npmOutDir, "index.js")).href
    );
    const sgMod: any = await import(
      pathToFileURL(join(npmOutDir, "simplegui.js")).href
    );
    expect(typeof libMod.getIdeHtml).toBe("function");
    expect(libMod.getIdeHtml().length).toBeGreaterThan(100_000);
    expect(typeof libMod.simplegui?.createWindow).toBe("function");
    expect(typeof sgMod.SimpleWindow).toBe("function");
  });
});
