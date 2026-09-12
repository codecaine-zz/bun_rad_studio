import { describe, it, expect } from "bun:test";
import {
  executeFdSearch,
  globToRegExp,
  parseSizeFilter,
  parseDurationMs,
  formatHumanSize,
  formatPermissions,
  interpolateExecCommand,
  runFdCommand,
} from "../applications/fd_engine";
import { createFdStudio, generateFdStudioHtml } from "../applications/fd_studio";
import { Sys } from "../src/simplecli/sys";

describe("⚡ Native Bun Fd Engine & Studio Specification Suite", () => {
  // ---------------------------------------------------------------------------
  // 1. Helper Function Specifications
  // ---------------------------------------------------------------------------
  it("1. Glob to RegExp conversion supports wildcards, recursive glob, and brackets", () => {
    const rx1 = globToRegExp("*.ts", false);
    expect(rx1.test("app.ts")).toBe(true);
    expect(rx1.test("dir/app.ts")).toBe(false);

    const rx2 = globToRegExp("**/*.ts", false);
    expect(rx2.test("dir/sub/app.ts")).toBe(true);

    const rx3 = globToRegExp("*.{js,ts}", false);
    expect(rx3.test("index.js")).toBe(true);
    expect(rx3.test("index.ts")).toBe(true);
    expect(rx3.test("index.py")).toBe(false);
  });

  it("2. Human size parsing and formatting accurately handles units", () => {
    expect(formatHumanSize(500)).toBe("500 B");
    expect(formatHumanSize(1024)).toBe("1.0 KB");
    expect(formatHumanSize(2 * 1024 * 1024)).toBe("2.0 MB");

    const sz1 = parseSizeFilter("+10M");
    expect(sz1).toEqual({ mode: "greater", bytes: 10 * 1024 * 1024 });

    const sz2 = parseSizeFilter("-500k");
    expect(sz2).toEqual({ mode: "less", bytes: 500 * 1024 });

    const sz3 = parseSizeFilter("2G");
    expect(sz3).toEqual({ mode: "exact", bytes: 2 * 1024 * 1024 * 1024 });
  });

  it("3. Duration parsing accurately converts human time to milliseconds", () => {
    expect(parseDurationMs("10s")).toBe(10000);
    expect(parseDurationMs("5m")).toBe(5 * 60 * 1000);
    expect(parseDurationMs("2h")).toBe(2 * 60 * 60 * 1000);
    expect(parseDurationMs("1d")).toBe(24 * 60 * 60 * 1000);
    expect(parseDurationMs("1w")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("4. Exec command placeholder interpolation correctly replaces variables", () => {
    const filePath = "/Users/test/project/src/index.ts";
    expect(interpolateExecCommand("file {}", filePath)).toBe("file /Users/test/project/src/index.ts");
    expect(interpolateExecCommand("echo {/}", filePath)).toBe("echo index.ts");
    expect(interpolateExecCommand("ls {//}", filePath)).toBe("ls /Users/test/project/src");
    expect(interpolateExecCommand("echo {.}", filePath)).toBe("echo /Users/test/project/src/index");
    expect(interpolateExecCommand("echo {/.}", filePath)).toBe("echo index");
  });

  it("5. Permissions formatting returns standard unix mode string", () => {
    expect(formatPermissions(0o755)).toBe("rwxr-xr-x");
    expect(formatPermissions(0o644)).toBe("rw-r--r--");
  });

  // ---------------------------------------------------------------------------
  // 2. Core Search Engine Traversal & Filter Tests
  // ---------------------------------------------------------------------------
  it("6. Basic pattern search finds target files by regex and smart case", async () => {
    const res = await executeFdSearch({
      searchRoot: ".",
      pattern: "package\\.json",
      searchMode: "regex",
    });

    expect(res.matchedCount).toBeGreaterThanOrEqual(1);
    expect(res.items.some((it) => it.name === "package.json")).toBe(true);
    expect(res.durationMs).toBeGreaterThan(0);
    expect(res.totalScanned).toBeGreaterThan(10);
  });

  it("7. Glob pattern search successfully filters by file pattern", async () => {
    const res = await executeFdSearch({
      searchRoot: ".",
      pattern: "*.json",
      searchMode: "glob",
      maxDepth: 1,
    });

    expect(res.matchedCount).toBeGreaterThanOrEqual(1);
    expect(res.items.every((it) => it.name.endsWith(".json"))).toBe(true);
  });

  it("8. Fixed string search treats regex metacharacters literally", async () => {
    const res = await executeFdSearch({
      searchRoot: ".",
      pattern: "package.json",
      searchMode: "fixed",
      maxDepth: 1,
    });

    expect(res.matchedCount).toBe(1);
    expect(res.items[0].name).toBe("package.json");
  });

  it("9. Type filtering correctly separates directories from files", async () => {
    const dirRes = await executeFdSearch({
      searchRoot: ".",
      pattern: "applications",
      types: ["directory"],
      maxDepth: 1,
    });
    expect(dirRes.matchedCount).toBe(1);
    expect(dirRes.items[0].type).toBe("directory");

    const fileRes = await executeFdSearch({
      searchRoot: ".",
      pattern: "package.json",
      types: ["file"],
      maxDepth: 1,
    });
    expect(fileRes.matchedCount).toBe(1);
    expect(fileRes.items[0].type).toBe("file");
  });

  it("10. Extension filtering matches specified extensions only", async () => {
    const res = await executeFdSearch({
      searchRoot: "applications",
      extensions: ["ts"],
      maxDepth: 1,
    });

    expect(res.matchedCount).toBeGreaterThan(10);
    expect(res.items.every((it) => it.extension === "ts")).toBe(true);
  });

  it("11. Hidden files are ignored by default and included with hidden flag", async () => {
    const hiddenOff = await executeFdSearch({
      searchRoot: ".",
      pattern: "^\\.git",
      hidden: false,
    });
    expect(hiddenOff.matchedCount).toBe(0);

    const hiddenOn = await executeFdSearch({
      searchRoot: ".",
      pattern: "^\\.gitignore",
      hidden: true,
      maxDepth: 1,
    });
    expect(hiddenOn.matchedCount).toBe(1);
    expect(hiddenOn.items[0].name).toBe(".gitignore");
  });

  it("12. Depth limit stops recursion beyond maxDepth", async () => {
    const res = await executeFdSearch({
      searchRoot: ".",
      maxDepth: 1,
      types: ["file"],
    });

    expect(res.items.every((it) => !it.relativePath.includes("/"))).toBe(true);
  });

  it("13. Size filter filters items by byte range", async () => {
    const res = await executeFdSearch({
      searchRoot: ".",
      minSizeBytes: 100 * 1024, // > 100KB
      types: ["file"],
    });

    expect(res.matchedCount).toBeGreaterThanOrEqual(1);
    expect(res.items.every((it) => it.sizeBytes >= 100 * 1024)).toBe(true);
  });

  it("14. Native command execution (-x) runs command on file", async () => {
    const run = await runFdCommand("echo 'TEST: {}'", ["/path/to/test.txt"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toBe("TEST: /path/to/test.txt");
  });

  // ---------------------------------------------------------------------------
  // 3. Fd Studio Pro Desktop GUI & HTML Suite
  // ---------------------------------------------------------------------------
  it("15. Fd Studio Pro desktop workstation initializes with all required controls", () => {
    const win = createFdStudio({ fullscreen: false });
    const html = win.generateHtml();

    expect(html).toContain("Fd Studio Pro");
    expect(html).toContain("txt_pattern");
    expect(html).toContain("txt_root");
    expect(html).toContain("dd_mode");
    expect(html).toContain("dd_case");
    expect(html).toContain("btn_search");
    expect(html).toContain("btn_clear");
    expect(html).toContain("btn_type_all");
    expect(html).toContain("btn_type_files");
    expect(html).toContain("btn_type_dirs");
    expect(html).toContain("tbl_results");
    expect(html).toContain("fd_console");
    expect(html).toContain("txt_exec_cmd");
    expect(html).toContain("btn_exec_one");
    expect(html).toContain("btn_exec_all");
  });

  // ---------------------------------------------------------------------------
  // 4. CLI Execution Parity Tests
  // ---------------------------------------------------------------------------
  it("16. fd-cli executes via CLI and outputs formatted results and json", () => {
    const [jsonOut, jsonCode] = Sys.exec("bun run cli_apps/fd_cli.ts fd_engine . --json");
    expect(jsonCode).toBe(0);
    const parsed = JSON.parse(jsonOut);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(1);
    expect(parsed[0].name).toBe("fd_engine.ts");

    const [tableOut, tableCode] = Sys.exec("bun run cli_apps/fd_cli.ts package.json . -t f");
    expect(tableCode).toBe(0);
    expect(tableOut).toContain("Native Bun File Finder");
    expect(tableOut).toContain("package.json");
  });
});
