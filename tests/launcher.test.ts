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
  isPidAlive,
  loadHistory,
  toggleFavorite,
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
      expect(app.path.startsWith(process.cwd())).toBe(true);
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

    // Opening a real Terminal window needs a logged-in desktop; CI runners have none.
    if (process.platform === "darwin" && !process.env.CI) {
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
    if (process.platform === "darwin" && !process.env.CI) {
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

  it("supports pinning favorites and maintains synchronized selection across top and bottom controls", () => {
    const win = createLauncherStudio({ fullscreen: false });
    expect(win).toBeDefined();

    // Verify favorite controls exist
    const controls = (win as any).controls || [];
    const btnFav = controls.find((c: any) => c.id === "btn_fav");
    expect(btnFav).toBeDefined();

    const btnQuickFavs = controls.find((c: any) => c.id === "btn_quick_favs");
    expect(btnQuickFavs).toBeDefined();

    // Toggle favorite via click handler
    const favHandler = (win as any).eventHandlersMap?.get("btn_fav:onclick");
    expect(favHandler).toBeDefined();

    // Select SQLite Studio
    const listboxHandler = (win as any).eventHandlersMap?.get("lst_apps:onchange");
    listboxHandler(win, "[App Studio] SQLite Studio Pro (./applications/sqlite_studio.ts)");

    // Table click handler keeps Top synchronized
    const tableHandler = (win as any).eventHandlersMap?.get("tbl_apps:onclick");
    expect(tableHandler).toBeDefined();

    tableHandler(win, "rad_sqlite_studio");
    expect(win.getValue("dd_select_app")).toContain("SQLite Studio Pro");
    expect(win.getValue("lst_apps")).toContain("SQLite Studio Pro");

    // Quick filter to favorites
    const quickFavsHandler = (win as any).eventHandlersMap?.get("btn_quick_favs:onclick");
    expect(quickFavsHandler).toBeDefined();
    quickFavsHandler(win);

    expect(win.getValue("dd_category")).toBe("⭐ Pinned Favorites");
  });

  it("registers double-click auto-launch handlers for both lst_apps and tbl_apps", () => {
    const win = createLauncherStudio({ fullscreen: false });
    expect(win).toBeDefined();

    // Verify double-click handlers are registered in eventHandlersMap
    const lstDblHandler = (win as any).eventHandlersMap?.get("lst_apps:ondoubleclick");
    expect(lstDblHandler).toBeDefined();

    const tblDblHandler = (win as any).eventHandlersMap?.get("tbl_apps:ondoubleclick");
    expect(tblDblHandler).toBeDefined();

    // Verify HTML generation includes ondblclick on the table container / script setup
    const html = win.generateHtml();
    expect(html).toContain('id="tbl_apps"');
    expect(html).toContain('id="lst_apps"');

    // Triggering double click on tbl_apps updates selection
    tblDblHandler(win, "rad_sqlite_studio");
    expect(win.getValue("lst_apps")).toContain("SQLite Studio Pro");
  });

  it("verifies isPidAlive detects active vs terminated PIDs", () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(-1)).toBe(false);
    expect(isPidAlive(0)).toBe(false);
    expect(isPidAlive(99999999)).toBe(false);
  });

  it("allows re-launching a Studio app after the process exits without becoming stuck", async () => {
    const res1 = await launchApplication("rad_ipinfo_studio");
    expect(res1.success).toBe(true);
    expect(res1.pid).toBeDefined();

    if (res1.pid) {
      expect(isPidAlive(res1.pid)).toBe(true);

      // Simulate closing the app out
      try { process.kill(res1.pid, "SIGTERM"); } catch {}
      let dead = false;
      for (let i = 0; i < 20; i++) {
        if (!isPidAlive(res1.pid)) { dead = true; break; }
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(dead).toBe(true);

      // Verify scanWorkspaceApps prunes the dead PID and marks app as not running
      const apps = scanWorkspaceApps();
      const ipApp = apps.find((a) => a.id === "rad_ipinfo_studio");
      expect(ipApp).toBeDefined();
      expect(ipApp?.isRunning).toBe(false);

      // Second launch should succeed smoothly and not be blocked
      const res2 = await launchApplication("rad_ipinfo_studio");
      expect(res2.success).toBe(true);
      expect(res2.pid).toBeDefined();
      if (res2.pid) {
        try { process.kill(res2.pid, "SIGKILL"); } catch {}
      }
    }
  });

  it("allows opening 2 or more of the same application concurrently", async () => {
    // Launch instance 1
    const res1 = await launchApplication("rad_ipinfo_studio");
    expect(res1.success).toBe(true);
    expect(res1.pid).toBeDefined();

    // Launch instance 2 of the SAME application
    const res2 = await launchApplication("rad_ipinfo_studio");
    expect(res2.success).toBe(true);
    expect(res2.pid).toBeDefined();
    expect(res2.pid).not.toBe(res1.pid);

    try {
      const apps = scanWorkspaceApps();
      const ipApp = apps.find((a) => a.id === "rad_ipinfo_studio");
      expect(ipApp).toBeDefined();
      expect(ipApp?.isRunning).toBe(true);
      expect(ipApp?.instanceCount).toBeGreaterThanOrEqual(2);

      // Verify killApplication terminates all active instances when no PID is specified
      const killRes = killApplication("rad_ipinfo_studio");
      expect(killRes.success).toBe(true);
      expect(killRes.message).toContain("Terminated");
    } finally {
      if (res1.pid) { try { process.kill(res1.pid, "SIGKILL"); } catch {} }
      if (res2.pid) { try { process.kill(res2.pid, "SIGKILL"); } catch {} }
    }
  });

  it("allows opening sqlite_studio twice and resolves SQLite Studio Pro cleanly", async () => {
    const res1 = await launchApplication("sqlite_studio");
    expect(res1.success).toBe(true);
    expect(res1.message).toContain("SQLite Studio Pro");
    expect(res1.pid).toBeDefined();

    const res2 = await launchApplication("sqlite_studio");
    expect(res2.success).toBe(true);
    expect(res2.message).toContain("SQLite Studio Pro");
    expect(res2.pid).toBeDefined();
    expect(res2.pid).not.toBe(res1.pid);

    try {
      const apps = scanWorkspaceApps();
      const sqliteApp = apps.find((a) => a.id === "rad_sqlite_studio");
      expect(sqliteApp).toBeDefined();
      expect(sqliteApp?.isRunning).toBe(true);
      expect(sqliteApp?.instanceCount).toBeGreaterThanOrEqual(2);

      const killRes = killApplication("rad_sqlite_studio");
      expect(killRes.success).toBe(true);
    } finally {
      if (res1.pid) { try { process.kill(res1.pid, "SIGKILL"); } catch {} }
      if (res2.pid) { try { process.kill(res2.pid, "SIGKILL"); } catch {} }
    }
  });

  it("allows opening system_studio twice and resolves System Information Studio Pro cleanly", async () => {
    const res1 = await launchApplication("system_studio");
    expect(res1.success).toBe(true);
    expect(res1.message).toContain("System Information Studio Pro");
    expect(res1.pid).toBeDefined();

    const res2 = await launchApplication("system_studio");
    expect(res2.success).toBe(true);
    expect(res2.message).toContain("System Information Studio Pro");
    expect(res2.pid).toBeDefined();
    expect(res2.pid).not.toBe(res1.pid);

    try {
      const apps = scanWorkspaceApps();
      const sysApp = apps.find((a) => a.id === "rad_system_studio");
      expect(sysApp).toBeDefined();
      expect(sysApp?.isRunning).toBe(true);
      expect(sysApp?.instanceCount).toBeGreaterThanOrEqual(2);

      const killRes = killApplication("rad_system_studio");
      expect(killRes.success).toBe(true);
    } finally {
      if (res1.pid) { try { process.kill(res1.pid, "SIGKILL"); } catch {} }
      if (res2.pid) { try { process.kill(res2.pid, "SIGKILL"); } catch {} }
    }
  });

  it("allows opening redis_studio twice and resolves Redis Studio Pro cleanly", async () => {
    const res1 = await launchApplication("redis_studio");
    expect(res1.success).toBe(true);
    expect(res1.message).toContain("Redis Studio Pro");
    expect(res1.pid).toBeDefined();

    const res2 = await launchApplication("redis_studio");
    expect(res2.success).toBe(true);
    expect(res2.message).toContain("Redis Studio Pro");
    expect(res2.pid).toBeDefined();
    expect(res2.pid).not.toBe(res1.pid);

    try {
      const apps = scanWorkspaceApps();
      const redisApp = apps.find((a) => a.id === "rad_redis_studio");
      expect(redisApp).toBeDefined();
      expect(redisApp?.isRunning).toBe(true);
      expect(redisApp?.instanceCount).toBeGreaterThanOrEqual(2);

      const killRes = killApplication("rad_redis_studio");
      expect(killRes.success).toBe(true);
    } finally {
      if (res1.pid) { try { process.kill(res1.pid, "SIGKILL"); } catch {} }
      if (res2.pid) { try { process.kill(res2.pid, "SIGKILL"); } catch {} }
    }
  });

  it("allows opening rip_studio twice and resolves Rip Studio Pro cleanly", async () => {
    const res1 = await launchApplication("rip_studio");
    expect(res1.success).toBe(true);
    expect(res1.message).toContain("Rip Studio Pro");
    expect(res1.pid).toBeDefined();

    const res2 = await launchApplication("rip_studio");
    expect(res2.success).toBe(true);
    expect(res2.message).toContain("Rip Studio Pro");
    expect(res2.pid).toBeDefined();
    expect(res2.pid).not.toBe(res1.pid);

    try {
      const apps = scanWorkspaceApps();
      const ripApp = apps.find((a) => a.id === "rad_rip_studio");
      expect(ripApp).toBeDefined();
      expect(ripApp?.isRunning).toBe(true);
      expect(ripApp?.instanceCount).toBeGreaterThanOrEqual(2);

      const killRes = killApplication("rad_rip_studio");
      expect(killRes.success).toBe(true);
    } finally {
      if (res1.pid) { try { process.kill(res1.pid, "SIGKILL"); } catch {} }
      if (res2.pid) { try { process.kill(res2.pid, "SIGKILL"); } catch {} }
    }
  });

  it("allows opening fd_studio twice and resolves Fd Studio Pro cleanly", async () => {
    const res1 = await launchApplication("fd_studio");
    expect(res1.success).toBe(true);
    expect(res1.message).toContain("Fd Studio Pro");
    expect(res1.pid).toBeDefined();

    const res2 = await launchApplication("fd_studio");
    expect(res2.success).toBe(true);
    expect(res2.message).toContain("Fd Studio Pro");
    expect(res2.pid).toBeDefined();
    expect(res2.pid).not.toBe(res1.pid);

    try {
      const apps = scanWorkspaceApps();
      const fdApp = apps.find((a) => a.id === "rad_fd_studio");
      expect(fdApp).toBeDefined();
      expect(fdApp?.isRunning).toBe(true);
      expect(fdApp?.instanceCount).toBeGreaterThanOrEqual(2);

      const killRes = killApplication("rad_fd_studio");
      expect(killRes.success).toBe(true);
    } finally {
      if (res1.pid) { try { process.kill(res1.pid, "SIGKILL"); } catch {} }
      if (res2.pid) { try { process.kill(res2.pid, "SIGKILL"); } catch {} }
    }
  });

  it("dynamically falls back to ephemeral ports when fd_studio and rip_studio servers are launched multiple times", async () => {
    const { startFdStudioServer } = await import("../applications/fd_studio.ts");
    const { startRipStudioServer } = await import("../applications/rip_studio.ts");

    const fd1 = startFdStudioServer({ port: 0 });
    const fd2 = startFdStudioServer({ port: fd1.port });
    expect(fd1.port).toBeGreaterThan(0);
    expect(fd2.port).toBeGreaterThan(0);
    expect(fd2.port).not.toBe(fd1.port);

    const rip1 = startRipStudioServer({ port: 0 });
    const rip2 = startRipStudioServer({ port: rip1.port });
    expect(rip1.port).toBeGreaterThan(0);
    expect(rip2.port).toBeGreaterThan(0);
    expect(rip2.port).not.toBe(rip1.port);

    fd1.stop();
    fd2.stop();
    rip1.stop();
    rip2.stop();
  });

  it("provides functional apps-by-category dropdown and 1-click category quick buttons", () => {
    const win = createLauncherStudio({ fullscreen: false });
    expect(win).toBeDefined();

    // Verify category dropdown exists and has items
    const ddAppCatVal = win.getValue("dd_app_category");
    expect(ddAppCatVal).toBeDefined();
    expect(String(ddAppCatVal)).toContain("All Categories");

    // Verify 1-click category quick buttons are registered
    const controls = (win as any).controls || [];
    const catBtnIds = [
      "btn_cat_all",
      "btn_cat_db",
      "btn_cat_devtools",
      "btn_cat_system",
      "btn_cat_files",
      "btn_cat_network",
      "btn_cat_prod",
      "btn_cat_games",
      "btn_cat_security",
      "btn_cat_design",
      "btn_cat_demos",
      "btn_cat_cli",
    ];
    for (const btnId of catBtnIds) {
      const found = controls.find((c: any) => c.id === btnId);
      expect(found).toBeDefined();
      expect((win as any).eventHandlersMap?.has(`${btnId}:onclick`)).toBe(true);
    }

    // Filter to Database & Storage via quick button click
    const dbHandler = (win as any).eventHandlersMap?.get("btn_cat_db:onclick");
    expect(dbHandler).toBeDefined();
    dbHandler(win);

    expect(win.getValue("dd_app_category")).toContain("Database & Storage");
    const statusText = win.getText("lbl_status");
    expect(statusText).toContain("Database & Storage");

    // Verify the listbox and table only contain database tools
    const lstItems = win.getListItems("lst_apps");
    expect(lstItems.length).toBeGreaterThan(0);
    expect(lstItems.length).toBeLessThan(10); // database tools count is ~4

    const tblRows = (win.getValue("tbl_apps") as string[][]) || [];
    expect(tblRows.length).toBe(lstItems.length);
    for (const r of tblRows) {
      expect(r[4]).toBe("Database & Storage");
    }

    // Filter to Games & Entertainment via quick button click
    const gamesHandler = (win as any).eventHandlersMap?.get("btn_cat_games:onclick");
    expect(gamesHandler).toBeDefined();
    gamesHandler(win);

    expect(win.getValue("dd_app_category")).toContain("Games & Entertainment");
    const gamesStatus = win.getText("lbl_status");
    expect(gamesStatus).toContain("Games & Entertainment");

    const gamesItems = win.getListItems("lst_apps");
    expect(gamesItems.length).toBeGreaterThanOrEqual(20);
    const gamesRows = (win.getValue("tbl_apps") as string[][]) || [];
    expect(gamesRows.length).toBe(gamesItems.length);
    for (const r of gamesRows) {
      expect(r[4]).toBe("Games & Entertainment");
    }

    // Test clearing category filter via btn_cat_all
    const allHandler = (win as any).eventHandlersMap?.get("btn_cat_all:onclick");
    expect(allHandler).toBeDefined();
    allHandler(win);

    expect(win.getValue("dd_app_category")).toContain("All Categories");
    const restoredItems = win.getListItems("lst_apps");
    expect(restoredItems.length).toBeGreaterThan(100);
  });

  it("provides functional filter-to-favorites and launch-top-favorite operations", async () => {
    const curH = loadHistory();
    if (!curH.favorites.includes("rad_ipinfo_studio")) {
      toggleFavorite("rad_ipinfo_studio");
    }
    const win = createLauncherStudio({ fullscreen: false });

    // 1. Switch to Games category first to create potential scope conflict
    const gamesHandler = (win as any).eventHandlersMap?.get("btn_cat_games:onclick");
    expect(gamesHandler).toBeDefined();
    gamesHandler(win);
    expect(win.getValue("dd_app_category")).toContain("Games & Entertainment");

    // 2. Click "Filter to Favorites" (btn_quick_favs_filter)
    const favFilterHandler = (win as any).eventHandlersMap?.get("btn_quick_favs_filter:onclick");
    expect(favFilterHandler).toBeDefined();
    favFilterHandler(win);

    // Verify category and scope are cleanly reset and favorites are shown
    expect(win.getValue("dd_category")).toBe("⭐ Pinned Favorites");
    expect(win.getValue("dd_app_category")).toBe("📁 All Categories");
    expect(win.getValue("txt_search")).toBe("");

    const favRows = (win.getValue("tbl_apps") as string[][]) || [];
    expect(favRows.length).toBeGreaterThanOrEqual(1);
    for (const r of favRows) {
      expect(r[1]).toBe("⭐ Fav");
    }

    // 3. Test btn_quick_favs button as well
    const favsOnlyHandler = (win as any).eventHandlersMap?.get("btn_quick_favs:onclick");
    expect(favsOnlyHandler).toBeDefined();
    favsOnlyHandler(win);
    expect(win.getValue("dd_category")).toBe("⭐ Pinned Favorites");

    try {
      // 4. Test Launch Top Favorite (btn_quick_launch_fav1)
      const topFavHandler = (win as any).eventHandlersMap?.get("btn_quick_launch_fav1:onclick");
      expect(topFavHandler).toBeDefined();
      await topFavHandler(win);

      const statusText = win.getText("lbl_status");
      expect(statusText).toContain("Running");

      const outputText = win.getText("txt_output");
      expect(outputText).toContain("[Desktop GUI Application Launched]");

      // 5. Test Toggle Favorite (btn_fav)
      const toggleHandler = (win as any).eventHandlersMap?.get("btn_fav:onclick");
      expect(toggleHandler).toBeDefined();
      toggleHandler(win);
      // Toggling once removes favorite from selected tool
      toggleHandler(win);
      // Toggling again restores favorite
    } finally {
      killApplication("rad_ipinfo_studio");
      killApplication("rad_rip_studio");
    }
  });

  it("registers 1-click quick launch buttons for all requested popular studios and tools", () => {
    const win = createLauncherStudio({ fullscreen: false });
    const handlers = (win as any).eventHandlersMap;
    expect(handlers).toBeDefined();

    const expectedButtons = [
      "btn_quick_ipinfo",
      "btn_quick_network",
      "btn_quick_code",
      "btn_quick_env",
      "btn_quick_interval",
      "btn_quick_drcodecaine",
      "btn_quick_lolo",
      "btn_quick_tetris",
      "btn_quick_crypto_cli",
      "btn_quick_sqlite",
      "btn_quick_redis",
      "btn_quick_system",
      "btn_quick_fd",
      "btn_quick_git",
      "btn_quick_api",
      "btn_quick_task",
      "btn_quick_bundler",
      "btn_quick_rad",
      "btn_quick_calc",
      "btn_quick_markdown",
      "btn_quick_paint",
      // GUI Studio versions of CLI tools
      "btn_quick_db",
      "btn_quick_database",
      "btn_quick_tokei",
      "btn_quick_gdu",
      "btn_quick_crypto",
      // CLI tools companion
      "btn_quick_sys_cli",
      "btn_quick_db_cli",
      "btn_quick_fd_cli",
      "btn_quick_git_cli",
      "btn_quick_tokei_cli",
      "btn_quick_gdu_cli",
      "btn_quick_net_cli",
    ];

    for (const btnId of expectedButtons) {
      const handler = handlers.get(`${btnId}:onclick`);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe("function");
    }
  });

  it("triggers auto-launch when Return / Enter key is pressed in lst_apps listbox", () => {
    const win = createLauncherStudio({ fullscreen: false });
    const handlers = (win as any).eventHandlersMap;
    expect(handlers).toBeDefined();

    // Verify onEnter handlers are registered
    const enterHandler = handlers.get("lst_apps:onenter") || handlers.get("lst_apps:enter");
    expect(enterHandler).toBeDefined();
    expect(typeof enterHandler).toBe("function");

    // Verify HTML includes Return key detection on lst_apps
    const html = win.generateHtml();
    expect(html).toContain('id="lst_apps"');
    expect(html.toLowerCase()).toContain("onkeydown");
    expect(html).toContain("on_lst_apps_enter");

    // Invoking enter handler updates selection
    enterHandler(win, "rad_sqlite_studio");
    expect(win.getValue("lst_apps")).toContain("SQLite Studio Pro");
  });

  it("ensures every CLI tool in 1-clicks has a corresponding GUI Studio version in 1-clicks", () => {
    const win = createLauncherStudio({ fullscreen: false });
    const handlers = (win as any).eventHandlersMap;
    expect(handlers).toBeDefined();

    const cliAndGuiPairs = [
      { cli: "btn_quick_sys_cli", gui: "btn_quick_system", label: "System Information" },
      { cli: "btn_quick_db_cli", gui: "btn_quick_db", label: "Database" },
      { cli: "btn_quick_fd_cli", gui: "btn_quick_fd", label: "Fd File Discovery" },
      { cli: "btn_quick_git_cli", gui: "btn_quick_git", label: "Git Version Control" },
      { cli: "btn_quick_tokei_cli", gui: "btn_quick_tokei", label: "Tokei Code Stats" },
      { cli: "btn_quick_gdu_cli", gui: "btn_quick_gdu", label: "GDU Disk Usage" },
      { cli: "btn_quick_net_cli", gui: "btn_quick_network", label: "Network Diagnostics" },
      { cli: "btn_quick_crypto_cli", gui: "btn_quick_crypto", label: "Cryptography & Hashing" },
    ];

    for (const pair of cliAndGuiPairs) {
      const cliHandler = handlers.get(`${pair.cli}:onclick`);
      const guiHandler = handlers.get(`${pair.gui}:onclick`);
      expect(cliHandler).toBeDefined();
      expect(typeof cliHandler).toBe("function");
      expect(guiHandler).toBeDefined();
      expect(typeof guiHandler).toBe("function");
    }
  });
});



