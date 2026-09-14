import { describe, expect, it } from "bun:test";
import {
  scanWorkspaceApps,
  scanSystemApps,
  scanAllApplications,
  deriveAppMetadata,
  launchApplication,
  launchInTerminal,
  killApplication,
  createLauncherStudio,
} from "../applications/launcher_studio";

describe("Launcher Studio Pro - Application Auto-Detection", () => {
  it("derives app metadata correctly from application script path", () => {
    const meta = deriveAppMetadata("./applications/sqlite_studio.ts");
    expect(meta.name).toBe("sqlite_studio");
    expect(meta.displayName).toContain("SQLite");
    expect(meta.category).toBe("Database & Storage");
    expect(meta.source).toBe("rad_studio");
  });

  it("derives app metadata correctly from CLI tool script path", () => {
    const meta = deriveAppMetadata("./cli_apps/system_cli.ts");
    expect(meta.name).toBe("system_cli");
    expect(meta.displayName).toContain("System");
    expect(meta.category).toBe("CLI Utilities");
    expect(meta.source).toBe("cli_tool");
  });

  it("derives app metadata correctly from demo showcase script path", () => {
    const meta = deriveAppMetadata("./demos/01_standard_controls.ts");
    expect(meta.source).toBe("rad_demo");
    expect(meta.category).toBe("Demos & Templates");
    expect(meta.displayName).toContain("Standard UI Controls");
  });

  it("auto-detects workspace RAD Studio applications, CLI tools, and demos", () => {
    const apps = scanWorkspaceApps();
    expect(apps.length).toBeGreaterThan(100);

    const sqliteApp = apps.find((a) => a.id.includes("sqlite_studio"));
    expect(sqliteApp).toBeDefined();
    expect(sqliteApp?.source).toBe("rad_studio");

    const demoApp = apps.find((a) => a.source === "rad_demo");
    expect(demoApp).toBeDefined();

    const cliApp = apps.find((a) => a.source === "cli_tool");
    expect(cliApp).toBeDefined();
  });

  it("scopes exclusively to project repository tools and excludes external system apps", () => {
    const sysApps = scanSystemApps();
    expect(sysApps).toHaveLength(0);

    const apps = scanWorkspaceApps();
    // All tools must be within the project workspace repository
    for (const app of apps) {
      expect(["rad_studio", "cli_tool", "rad_demo"]).toContain(app.source);
      expect(app.path).toContain("/bun_rad_studio/");
      expect(app.command).toStartWith("bun run ");
    }

    // Verify no external OS desktop apps are included
    const hasExternal = apps.some(
      (a) =>
        a.displayName.toLowerCase() === "safari" ||
        a.displayName.toLowerCase() === "calculator" ||
        a.displayName.toLowerCase() === "finder" ||
        a.displayName.toLowerCase() === "terminal"
    );
    expect(hasExternal).toBe(false);
  });

  it("aggregates all applications and computes valid KPIs", () => {
    const all = scanAllApplications();
    expect(all.apps.length).toBeGreaterThan(100);
    expect(all.kpis.total).toBe(all.apps.length);
    expect(all.kpis.radStudios).toBeGreaterThan(30);
    expect(all.kpis.cliTools).toBeGreaterThan(70);
    expect(all.kpis.demos).toBeGreaterThan(20);
    expect(all.categories.length).toBeGreaterThan(3);
  });

  it("executes CLI tools and returns valid output", async () => {
    const res = await launchApplication("system_cli", "--version");
    expect(res.success).toBe(true);
    expect(res.output).toContain("system-cli version");
  });

  it("handles non-existent tools gracefully", async () => {
    const res = await launchApplication("non_existent_fake_tool_xyz");
    expect(res.success).toBe(false);
    expect(res.message).toContain("not found");
  });

  it("handles process termination gracefully for non-running tools", () => {
    const res = killApplication("non_existent_app");
    expect(res.success).toBe(false);
    expect(res.message).toBeDefined();
  });

  it("provides launchInTerminal utility for desktop terminal execution", () => {
    expect(typeof launchInTerminal).toBe("function");
    if (process.platform === "darwin") {
      const res = launchInTerminal("echo 'Bun RAD Studio Launcher Test'");
      expect(res.success).toBe(true);
      expect(res.message).toContain("Opened CLI in macOS Terminal");
    }
  });

  it("launches CLI tool in terminal mode via launchApplication", async () => {
    if (process.platform === "darwin") {
      const res = await launchApplication("system_cli", "--version", { openTerminal: true });
      expect(res.success).toBe(true);
      expect(res.output).toContain("Launched in Terminal");
    }
  });

  it("initializes SimpleWindow GUI layout and generates valid HTML", () => {
    const win = createLauncherStudio({ fullscreen: false });
    expect(win).toBeDefined();
    const html = win.generateHtml();
    expect(html.length).toBeGreaterThan(10000);
    expect(html).toContain("Project Application & CLI Launcher");
  });
});
