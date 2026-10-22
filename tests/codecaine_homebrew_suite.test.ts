import { describe, it, expect, beforeAll } from "bun:test";
import { resolve, join } from "node:path";
import { existsSync, statSync, readFileSync } from "node:fs";
import { generateAllWrappers, buildWrapperDefinitions } from "../scripts/generate_brew_suite.ts";

describe("⚡ Codecaine Utility Suite — Homebrew Distribution & Binary Wrappers", () => {
  const root = resolve(process.cwd());
  const binDir = join(root, "bin");
  const formulaFile = join(root, "Formula", "codecaine-utility-suite.rb");
  const aliasFormulaFile = join(root, "Formula", "codecaine.rb");
  const installerScript = join(root, "install_homebrew_suite.sh");
  const suiteCli = join(root, "cli_apps", "codecaine_suite_cli.ts");

  beforeAll(() => {
    // Ensure wrappers are generated for test execution
    generateAllWrappers();
  });

  const runSubprocess = async (cmd: string[]): Promise<{ stdout: string; stderr: string; output: string; exitCode: number }> => {
    const argv = process.platform === "win32" && cmd[0] && !cmd[0].endsWith(".exe") && cmd[0] !== process.execPath && cmd[0] !== "bash"
      ? [process.execPath, ...cmd]
      : cmd;
    const proc = Bun.spawn(argv, {
      cwd: root,
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
    expect(formulaContent).toContain("class CodecaineUtilitySuite < Formula");
    expect(formulaContent).toContain('depends_on "bun"');
    expect(formulaContent).toContain("def install");
    expect(formulaContent).toContain("test do");

    const aliasContent = readFileSync(aliasFormulaFile, "utf8");
    expect(aliasContent).toContain("class Codecaine < CodecaineUtilitySuite");
  });

  it("2. Homebrew Formula syntax passes ruby linter", async () => {
    if (!Bun.which("ruby")) return;
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

    const helpRes = await runSubprocess(process.platform === "win32" ? ["bash", installerScript, "--help"] : [installerScript, "--help"]);
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.output).toContain("Codecaine Utility Suite");
    expect(helpRes.output).toContain("--link");
    expect(helpRes.output).toContain("--build");
  });

  it("4. Wrapper Generator builds wrappers for all tools and outputs manifest.json", () => {
    const defs = buildWrapperDefinitions();
    expect(defs.length).toBeGreaterThanOrEqual(150);

    // Verify key wrappers exist in definition list
    const names = defs.map(d => d.binName);
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
    expect(existsSync(manifestFile)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    expect(manifest.suite).toBe("Codecaine Utility Suite");
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
    const verRes = await runSubprocess([process.execPath, suiteCli, "--version"]);
    expect(verRes.exitCode).toBe(0);
    expect(verRes.output).toContain("Codecaine Utility Suite v1.0.0");

    const helpRes = await runSubprocess([process.execPath, suiteCli, "--help"]);
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.output).toContain("USAGE:");
    expect(helpRes.output).toContain("codecaine run <name>");
  });

  it("7. Master codecaine CLI lists all tools with category and JSON options", async () => {
    const jsonRes = await runSubprocess([process.execPath, suiteCli, "list", "--json"]);
    expect(jsonRes.exitCode).toBe(0);
    const data = JSON.parse(jsonRes.stdout);
    expect(data.suite).toBe("Codecaine Utility Suite");
    expect(data.kpis.total).toBeGreaterThanOrEqual(160);
    expect(data.kpis.radStudios).toBeGreaterThanOrEqual(60);
    expect(data.kpis.cliTools).toBeGreaterThanOrEqual(70);
    expect(data.tools.length).toBeGreaterThanOrEqual(160);

    const listRes = await runSubprocess([process.execPath, suiteCli, "list", "--cli"]);
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
    const searchRes = await runSubprocess([process.execPath, suiteCli, "search", "sqlite"]);
    expect(searchRes.exitCode).toBe(0);
    expect(searchRes.output).toContain("Search results for \"sqlite\"");
    expect(searchRes.output).toContain("SQLite Studio Pro");
  });

  it("10. Master codecaine CLI provides info and Homebrew status", async () => {
    const infoRes = await runSubprocess([process.execPath, suiteCli, "info"]);
    expect(infoRes.exitCode).toBe(0);
    expect(infoRes.output).toContain("Codecaine Utility Suite:");
    expect(infoRes.output).toContain("System Environment:");

    const brewRes = await runSubprocess([process.execPath, suiteCli, "brew", "status"]);
    expect(brewRes.exitCode).toBe(0);
    expect(brewRes.output).toContain("Homebrew Integration Status:");
  });

  it("11. Standalone binary wrapper ./bin/codecaine runs successfully", async () => {
    const binExecutable = join(binDir, "codecaine");
    const res = await runSubprocess([binExecutable, "--version"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Codecaine Utility Suite v1.0.0");
  });

  it("12. Standalone binary wrapper ./bin/codecaine-database runs in-memory query", async () => {
    const binExecutable = join(binDir, "codecaine-database");
    const res = await runSubprocess([binExecutable, "--db", ":memory:", "--query", "SELECT 777 AS lucky"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("777");
  });

  it("13. Standalone binary wrapper ./bin/codecaine-calc executes math expression", async () => {
    const binExecutable = join(binDir, "codecaine-calc");
    const res = await runSubprocess([binExecutable, "100 + 200"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Programmer Calculator CLI");
  });
});
