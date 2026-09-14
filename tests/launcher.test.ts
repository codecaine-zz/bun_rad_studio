import { describe, expect, it } from "bun:test";
import {
  scanWorkspaceApps,
  scanSystemApps,
  scanAllApplications,
  deriveAppMetadata,
  launchApplication,
  launchInTerminal,
  getAvailableLinuxTerminal,
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
    expect(typeof getAvailableLinuxTerminal).toBe("function");

    // Dry-run validation works identically on all platforms
    const dryRes = launchInTerminal("echo 'Bun RAD Studio Test'", process.cwd(), { dryRun: true });
    expect(dryRes.success).toBe(true);
    expect(dryRes.message).toContain("[Dry Run]");

    if (process.platform === "darwin") {
      const res = launchInTerminal("echo 'Bun RAD Studio Launcher Test'");
      expect(res.success).toBe(true);
      expect(res.message).toContain("Opened CLI in macOS Terminal");
      expect(res.terminalEmulator).toBe("Terminal.app");
    } else if (process.platform === "linux") {
      const linuxTerm = getAvailableLinuxTerminal();
      if (linuxTerm) {
        expect(typeof linuxTerm.binary).toBe("string");
        const args = linuxTerm.buildArgs("echo 'test'", "/tmp");
        expect(args.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("launches CLI tool in terminal mode via launchApplication", async () => {
    if (process.platform === "darwin") {
      const res = await launchApplication("system_cli", "--version", { openTerminal: true });
      expect(res.success).toBe(true);
      expect(res.output).toContain("Launched in Terminal");
    } else if (process.platform === "linux") {
      const res = await launchApplication("system_cli", "--version", { openTerminal: true });
      expect(res).toBeDefined();
    }
  });

  it("initializes SimpleWindow GUI layout and generates valid HTML with ListBox", () => {
    const win = createLauncherStudio({ fullscreen: false });
    expect(win).toBeDefined();
    const html = win.generateHtml();
    expect(html.length).toBeGreaterThan(10000);
    expect(html).toContain("Project Application & CLI Launcher");
    expect(html).toContain('id="lst_apps"');
    expect(html).toContain("simplegui-listbox");
    expect(html).toContain('id="dd_select_app"');
    expect(html).toContain('id="tbl_apps"');
  });

  it("updates launcher app when an item is selected in the listbox", () => {
    const win = createLauncherStudio({ fullscreen: false });
    expect(win).toBeDefined();

    // Trigger ListBox change with a specific tool (e.g. redis_studio or git_cli)
    const listboxHandler = (win as any).eventHandlersMap?.get("lst_apps:onchange");
    expect(listboxHandler).toBeDefined();

    listboxHandler(win, "[Studio] Redis Studio (applications/redis_studio.ts)");

    // Verify Dropdown and ListBox are synchronized
    const ddVal = win.getValue("dd_select_app");
    expect(ddVal).toContain("Redis Studio");
    expect(ddVal).toContain("applications/redis_studio.ts");

    const lstVal = win.getValue("lst_apps");
    expect(lstVal).toContain("Redis Studio");

    // Verify details output updated
    const outputText = win.getText("txt_output");
    expect(outputText).toContain("Redis Studio");
    expect(outputText).toContain("redis_studio.ts");

    // Verify status updated
    const statusText = win.getText("lbl_status");
    expect(statusText).toContain("Redis Studio");

    // Select a CLI tool in the listbox
    listboxHandler(win, "[CLI Tool] System CLI (cli_apps/system_cli.ts)");
    expect(win.getValue("dd_select_app")).toContain("System CLI");
    expect(win.getValue("txt_cli_args")).toBe("--telemetry");
    expect(win.getText("txt_output")).toContain("System CLI");
  });
});
