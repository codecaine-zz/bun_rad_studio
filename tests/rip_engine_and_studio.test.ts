import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  getGraveyardDir,
  loadManifest,
  saveManifest,
  isProtectedPath,
  inspectTargets,
  buryTargets,
  unburyTargets,
  seanceGraveyard,
  decomposeGraveyard,
  getGraveyardStats,
  formatHumanSize,
  formatPermissions,
  parseDurationMs,
  calculatePathMetrics,
} from "../applications/rip_engine";
import { createRipStudio, generateRipStudioHtml, startRipStudioServer } from "../applications/rip_studio";
import { Sys } from "../src/simplecli/sys";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("🪦 Native Bun Rip Engine & Studio Specification Suite", () => {
  let testWorkspace: string;
  let testGraveyard: string;

  beforeEach(() => {
    // Create unique sandbox for each test
    testWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "rip-test-ws-"));
    testGraveyard = fs.mkdtempSync(path.join(os.tmpdir(), "rip-test-gy-"));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testWorkspace)) fs.rmSync(testWorkspace, { recursive: true, force: true });
      if (fs.existsSync(testGraveyard)) fs.rmSync(testGraveyard, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Utilities & Safety Guard Specifications
  // ---------------------------------------------------------------------------
  it("1. Human size formatting and duration parser accurately convert units", () => {
    expect(formatHumanSize(0)).toBe("0 B");
    expect(formatHumanSize(512)).toBe("512 B");
    expect(formatHumanSize(1024)).toBe("1.0 KB");
    expect(formatHumanSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatHumanSize(2 * 1024 * 1024 * 1024)).toBe("2.0 GB");

    expect(parseDurationMs("30s")).toBe(30 * 1000);
    expect(parseDurationMs("15m")).toBe(15 * 60 * 1000);
    expect(parseDurationMs("4h")).toBe(4 * 60 * 60 * 1000);
    expect(parseDurationMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    expect(parseDurationMs("2w")).toBe(14 * 24 * 60 * 60 * 1000);
    expect(parseDurationMs("invalid")).toBeNull();
  });

  it("2. File permissions formatting maps mode bits to unix permission string", () => {
    expect(formatPermissions(0o755)).toBe("rwxr-xr-x");
    expect(formatPermissions(0o644)).toBe("rw-r--r--");
    expect(formatPermissions(0o700)).toBe("rwx------");
  });

  it("3. Safety verification protects system root, home, cwd, and graveyard", () => {
    expect(isProtectedPath("/").protected).toBe(true);
    expect(isProtectedPath(".", { cwd: testWorkspace }).protected).toBe(true);
    expect(isProtectedPath("..", { cwd: testWorkspace }).protected).toBe(true);
    expect(isProtectedPath(os.homedir()).protected).toBe(true);
    expect(isProtectedPath("/etc").protected).toBe(true);
    expect(isProtectedPath("/System").protected).toBe(true);
    expect(isProtectedPath("/usr/bin").protected).toBe(true);

    // Graveyard itself is protected
    expect(isProtectedPath(testGraveyard, { graveyardDir: testGraveyard }).protected).toBe(true);

    // Normal scratch file inside workspace is NOT protected
    const safeFile = path.join(testWorkspace, "draft.txt");
    expect(isProtectedPath(safeFile, { cwd: testWorkspace, graveyardDir: testGraveyard }).protected).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 2. Pre-Deletion Inspect Mode Specifications
  // ---------------------------------------------------------------------------
  it("4. Pre-deletion inspect calculates payload size, file count, and detects git repos", async () => {
    const file1 = path.join(testWorkspace, "notes.txt");
    fs.writeFileSync(file1, "Hello world this is test content", "utf-8");

    const subDir = path.join(testWorkspace, "project_repo");
    fs.mkdirSync(path.join(subDir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(subDir, "main.ts"), "console.log(42);", "utf-8");

    const insp = await inspectTargets([file1, subDir], { cwd: testWorkspace, graveyardDir: testGraveyard });

    expect(insp.items.length).toBe(2);
    expect(insp.items[0].type).toBe("file");
    expect(insp.items[0].sizeBytes).toBeGreaterThan(0);
    expect(insp.items[0].isProtected).toBe(false);

    expect(insp.items[1].type).toBe("directory");
    expect(insp.items[1].isGitRepo).toBe(true);
    expect(insp.hasWarnings).toBe(true);
    expect(insp.warnings.some((w) => w.includes("Git repository"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 3. Safe Burial (Quarantine) & Collision-Free Storage Specifications
  // ---------------------------------------------------------------------------
  it("5. Safe burial moves files into graveyard quarantine with metadata", async () => {
    const docPath = path.join(testWorkspace, "document.pdf");
    fs.writeFileSync(docPath, "PDF_MOCK_BYTES", "utf-8");

    const buryRes = await buryTargets([docPath], { graveyardDir: testGraveyard, cwd: testWorkspace });
    expect(buryRes.success).toBe(true);
    expect(buryRes.buriedItems.length).toBe(1);
    expect(fs.existsSync(docPath)).toBe(false); // Removed from original place!

    const buried = buryRes.buriedItems[0];
    expect(buried.name).toBe("document.pdf");
    expect(buried.status).toBe("buried");
    expect(fs.existsSync(buried.graveyardPath)).toBe(true);

    const manifest = loadManifest(testGraveyard);
    expect(manifest.items.length).toBe(1);
    expect(manifest.items[0].id).toBe(buried.id);
  });

  it("6. Zero collision graveyard storage preserves multiple burials of identically-named files", async () => {
    const testFile = path.join(testWorkspace, "config.json");

    // Version 1
    fs.writeFileSync(testFile, JSON.stringify({ version: 1 }), "utf-8");
    const res1 = await buryTargets([testFile], { graveyardDir: testGraveyard, cwd: testWorkspace });
    expect(res1.success).toBe(true);

    // Version 2 (same filename!)
    fs.writeFileSync(testFile, JSON.stringify({ version: 2 }), "utf-8");
    const res2 = await buryTargets([testFile], { graveyardDir: testGraveyard, cwd: testWorkspace });
    expect(res2.success).toBe(true);

    const manifest = loadManifest(testGraveyard);
    expect(manifest.items.length).toBe(2);
    expect(manifest.items[0].name).toBe("config.json");
    expect(manifest.items[1].name).toBe("config.json");
    expect(manifest.items[0].id).not.toBe(manifest.items[1].id);

    // Both files exist independently in graveyard
    expect(fs.existsSync(manifest.items[0].graveyardPath)).toBe(true);
    expect(fs.existsSync(manifest.items[1].graveyardPath)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. Unbury (Undo / Restore) Specifications
  // ---------------------------------------------------------------------------
  it("7. Unbury restores the last buried file to its original location", async () => {
    const filePath = path.join(testWorkspace, "secret.key");
    fs.writeFileSync(filePath, "SUPER_SECRET_KEY_12345", "utf-8");

    await buryTargets([filePath], { graveyardDir: testGraveyard, cwd: testWorkspace });
    expect(fs.existsSync(filePath)).toBe(false);

    // Unbury with no arguments -> restores most recent
    const unburyRes = await unburyTargets(undefined, { graveyardDir: testGraveyard, cwd: testWorkspace });
    expect(unburyRes.success).toBe(true);
    expect(unburyRes.restoredItems.length).toBe(1);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("SUPER_SECRET_KEY_12345");
  });

  it("8. Unbury automatically recreates deleted parent directories if missing", async () => {
    const nestedDir = path.join(testWorkspace, "deep", "nested", "folder");
    fs.mkdirSync(nestedDir, { recursive: true });
    const nestedFile = path.join(nestedDir, "app.log");
    fs.writeFileSync(nestedFile, "2026-09-12 LOG ENTRY", "utf-8");

    await buryTargets([nestedFile], { graveyardDir: testGraveyard, cwd: testWorkspace });

    // Completely remove the parent directory tree
    fs.rmSync(path.join(testWorkspace, "deep"), { recursive: true, force: true });
    expect(fs.existsSync(path.join(testWorkspace, "deep"))).toBe(false);

    // Unburying restores file and recreates parent folder
    const unburyRes = await unburyTargets([path.basename(nestedFile)], { graveyardDir: testGraveyard, cwd: testWorkspace });
    expect(unburyRes.success).toBe(true);
    expect(fs.existsSync(nestedFile)).toBe(true);
    expect(fs.readFileSync(nestedFile, "utf-8")).toBe("2026-09-12 LOG ENTRY");
  });

  // ---------------------------------------------------------------------------
  // 5. Séance & Decompose Specifications
  // ---------------------------------------------------------------------------
  it("9. Séance filters items by current directory vs global graveyard", async () => {
    const file1 = path.join(testWorkspace, "local.txt");
    fs.writeFileSync(file1, "local content", "utf-8");
    await buryTargets([file1], { graveyardDir: testGraveyard, cwd: testWorkspace });

    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), "other-dir-"));
    const file2 = path.join(otherDir, "remote.txt");
    fs.writeFileSync(file2, "remote content", "utf-8");
    await buryTargets([file2], { graveyardDir: testGraveyard, cwd: otherDir });

    // Séance in testWorkspace without --all only finds local.txt
    const seanceLocal = seanceGraveyard({ graveyardDir: testGraveyard, cwd: testWorkspace, all: false });
    expect(seanceLocal.length).toBe(1);
    expect(seanceLocal[0].name).toBe("local.txt");

    // Séance with all: true finds both
    const seanceAll = seanceGraveyard({ graveyardDir: testGraveyard, cwd: testWorkspace, all: true });
    expect(seanceAll.length).toBe(2);

    fs.rmSync(otherDir, { recursive: true, force: true });
  });

  it("10. Decompose permanently deletes graveyard entries and frees disk space", async () => {
    const f1 = path.join(testWorkspace, "trash1.txt");
    const f2 = path.join(testWorkspace, "trash2.txt");
    fs.writeFileSync(f1, "CONTENT 1", "utf-8");
    fs.writeFileSync(f2, "CONTENT 2", "utf-8");

    await buryTargets([f1, f2], { graveyardDir: testGraveyard, cwd: testWorkspace });

    const decomp = await decomposeGraveyard({ graveyardDir: testGraveyard, all: true });
    expect(decomp.deletedCount).toBe(2);
    expect(decomp.freedBytes).toBeGreaterThan(0);

    const manifestAfter = loadManifest(testGraveyard);
    expect(manifestAfter.items.length).toBe(0);
  });

  it("11. Graveyard statistics accurately summarizes items and sizes", async () => {
    const f = path.join(testWorkspace, "stat_file.txt");
    fs.writeFileSync(f, "A".repeat(5000), "utf-8");
    await buryTargets([f], { graveyardDir: testGraveyard, cwd: testWorkspace });

    const stats = getGraveyardStats(testGraveyard);
    expect(stats.totalItems).toBe(1);
    expect(stats.totalSizeBytes).toBe(5000);
    expect(stats.totalHumanSize).toContain("KB");
    expect(stats.buriedTodayCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 6. Rip Studio Desktop Workstation & Server Specifications
  // ---------------------------------------------------------------------------
  it("12. Rip Studio Pro desktop workstation initializes controls and renders HTML", () => {
    const win = createRipStudio({ fullscreen: false, graveyardDir: testGraveyard });
    const html = win.generateHtml();

    expect(html).toContain("Rip Studio Pro");
    expect(html).toContain("lbl_metric_total");
    expect(html).toContain("lbl_metric_size");
    expect(html).toContain("txt_bury_target");
    expect(html).toContain("btn_inspect_target");
    expect(html).toContain("btn_bury_target");
    expect(html).toContain("tbl_graveyard");
    expect(html).toContain("btn_unbury_selected");
    expect(html).toContain("btn_unbury_last");
    expect(html).toContain("btn_decompose_selected");
    expect(html).toContain("btn_decompose_all");
    expect(html).toContain("rip_console");
  });

  it("13. Rip Studio Pro HTTP server responds to API endpoints", async () => {
    const serverInstance = startRipStudioServer({ graveyardDir: testGraveyard });
    const baseUrl = serverInstance.url;

    // Test stats endpoint
    const statsRes = await fetch(`${baseUrl}/api/stats`);
    expect(statsRes.status).toBe(200);
    const stats = await statsRes.json();
    expect(stats.totalItems).toBe(0);

    // Test graveyard listing endpoint
    const gyRes = await fetch(`${baseUrl}/api/graveyard`);
    expect(gyRes.status).toBe(200);
    const gy = await gyRes.json();
    expect(Array.isArray(gy)).toBe(true);

    // Stop server
    serverInstance.stop();
  });

  // ---------------------------------------------------------------------------
  // 7. CLI Execution Parity Tests
  // ---------------------------------------------------------------------------
  it("14. rip-cli executes via CLI and supports --help, graveyard, and completions", () => {
    const [helpOut, helpCode] = Sys.exec("bun run cli_apps/rip_cli.ts --help");
    expect(helpCode).toBe(0);
    expect(helpOut).toContain("safe and ergonomic alternative to rm");

    const [gyOut, gyCode] = Sys.exec("bun run cli_apps/rip_cli.ts graveyard");
    expect(gyCode).toBe(0);
    expect(gyOut).toContain(".local/share/rip/graveyard");

    const [compOut, compCode] = Sys.exec("bun run cli_apps/rip_cli.ts completions zsh");
    expect(compCode).toBe(0);
    expect(compOut).toContain("#compdef rip");
  });

  it("15. rip-cli performs safe bury, seance, and unbury via CLI commands", () => {
    const sample = path.join(testWorkspace, "cli_test_file.txt");
    fs.writeFileSync(sample, "CLI TESTING LINE", "utf-8");

    // Bury via CLI
    const [buryOut, buryCode] = Sys.exec(
      `bun run cli_apps/rip_cli.ts ${sample} --graveyard ${testGraveyard} -f`
    );
    expect(buryCode).toBe(0);
    expect(fs.existsSync(sample)).toBe(false);

    // Séance via CLI
    const [seanceOut, seanceCode] = Sys.exec(
      `bun run cli_apps/rip_cli.ts -s --graveyard ${testGraveyard} -a`
    );
    expect(seanceCode).toBe(0);
    expect(seanceOut).toContain("cli_test_file.txt");

    // Unbury via CLI
    const [unburyOut, unburyCode] = Sys.exec(
      `bun run cli_apps/rip_cli.ts -u --graveyard ${testGraveyard} -f`
    );
    expect(unburyCode).toBe(0);
    expect(fs.existsSync(sample)).toBe(true);
    expect(fs.readFileSync(sample, "utf-8")).toBe("CLI TESTING LINE");
  });
});
