import { describe, it, expect } from "bun:test";
import { createFdStudio } from "../applications/fd_studio";
import { createSdStudio } from "../applications/sd_studio";
import { createRipStudio } from "../applications/rip_studio";
import { createProcsStudio } from "../applications/procs_studio";
import { createWatchexecStudio } from "../applications/watchexec_studio";
import { createTokeiStudio } from "../applications/tokei_studio";
import { createGduStudio } from "../applications/gdu_studio";
import { createIpInfoStudio } from "../applications/ipinfo_studio";
import { createSubfinderStudio } from "../applications/subfinder_studio";
import { createDoggoStudio } from "../applications/doggo_studio";

describe("⚡ Bun Sys Utils GUI Desktop Workstations Suite", () => {
  it("1. Fd Studio Pro initializes with expected search controls and options", () => {
    const win = createFdStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Fd Studio Pro");
    expect(win.appId).toBe("fd_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_pattern");
    expect(ids).toContain("txt_root");
    expect(ids).toContain("btn_search");
    expect(ids).toContain("tbl_results");
  });

  it("2. Sd Studio Pro initializes with find, replace, and diff controls", () => {
    const win = createSdStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Sd Studio Pro");
    expect(win.appId).toBe("sd_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_find");
    expect(ids).toContain("txt_replace");
    expect(ids).toContain("txt_targets");
    expect(ids).toContain("btn_count_matches");
    expect(ids).toContain("btn_preview_diffs");
    expect(ids).toContain("btn_apply_replace");
    expect(ids).toContain("tbl_files");
    expect(ids).toContain("console_diffs");
  });

  it("3. Rip Studio Pro initializes with graveyard quarantine telemetry & controls", () => {
    const win = createRipStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Rip Studio Pro");
    expect(win.appId).toBe("rip_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_bury_target");
    expect(ids).toContain("btn_bury_target");
    expect(ids).toContain("tbl_graveyard");
    expect(ids).toContain("btn_unbury_selected");
  });

  it("4. Procs Studio Pro initializes with process monitor table & signals", () => {
    const win = createProcsStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Procs Studio Pro");
    expect(win.appId).toBe("procs_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_search");
    expect(ids).toContain("btn_refresh");
    expect(ids).toContain("btn_tree");
    expect(ids).toContain("btn_sigterm");
    expect(ids).toContain("btn_sigkill");
    expect(ids).toContain("tbl_procs");
    expect(ids).toContain("console_detail");
  });

  it("5. Watchexec Studio Pro initializes with watcher configuration & execution console", () => {
    const win = createWatchexecStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Watchexec Studio Pro");
    expect(win.appId).toBe("watchexec_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_watch_path");
    expect(ids).toContain("txt_exec_cmd");
    expect(ids).toContain("btn_start_watch");
    expect(ids).toContain("btn_stop_watch");
    expect(ids).toContain("watch_console");
    expect(ids).toContain("tbl_history");
  });

  it("6. Tokei Studio Pro initializes with code counter table & export options", () => {
    const win = createTokeiStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Tokei Studio Pro");
    expect(win.appId).toBe("tokei_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_path");
    expect(ids).toContain("dd_sort");
    expect(ids).toContain("btn_analyze");
    expect(ids).toContain("btn_copy_markdown");
    expect(ids).toContain("btn_export_json");
    expect(ids).toContain("tbl_tokei");
    expect(ids).toContain("console_tokei");
  });

  it("7. Gdu Studio Pro initializes with disk usage explorer & mounted disks", () => {
    const win = createGduStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Gdu Studio Pro");
    expect(win.appId).toBe("gdu_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_path");
    expect(ids).toContain("btn_scan");
    expect(ids).toContain("btn_parent");
    expect(ids).toContain("btn_drill_in");
    expect(ids).toContain("btn_disks");
    expect(ids).toContain("tbl_items");
    expect(ids).toContain("console_gdu");
  });

  it("8. IpInfo Studio Pro initializes with geolocation, CIDR, and interface tools", () => {
    const win = createIpInfoStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("IpInfo Studio Pro");
    expect(win.appId).toBe("ipinfo_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_target");
    expect(ids).toContain("btn_search");
    expect(ids).toContain("btn_calc_subnet");
    expect(ids).toContain("btn_local_ifaces");
    expect(ids).toContain("tbl_details");
    expect(ids).toContain("console_ipinfo");
  });

  it("9. Subfinder Studio Pro initializes with OSINT domain reconnaissance controls", () => {
    const win = createSubfinderStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Subfinder Studio Pro");
    expect(win.appId).toBe("subfinder_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_domain");
    expect(ids).toContain("btn_start");
    expect(ids).toContain("tbl_subs");
    expect(ids).toContain("console_subs");
  });

  it("10. Doggo Studio Pro initializes with DNS client records table & DoH controls", () => {
    const win = createDoggoStudio({ fullscreen: false, theme: "midnight" });
    expect(win).toBeDefined();
    expect(win.title).toContain("Doggo Studio Pro");
    expect(win.appId).toBe("doggo_studio");

    const controls = win.getControls();
    const ids = controls.map((c: any) => c.id);
    expect(ids).toContain("txt_target");
    expect(ids).toContain("dd_type");
    expect(ids).toContain("btn_query");
    expect(ids).toContain("btn_query_all");
    expect(ids).toContain("tbl_records");
    expect(ids).toContain("console_doggo");
  });
});
