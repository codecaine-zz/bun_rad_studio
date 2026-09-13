import { describe, it, expect } from "bun:test";
import { createIpInfoStudio } from "../applications/ipinfo_studio";
import { createDoggoStudio } from "../applications/doggo_studio";
import { createTokeiStudio } from "../applications/tokei_studio";
import { createSubfinderStudio } from "../applications/subfinder_studio";
import { createGduStudio } from "../applications/gdu_studio";
import { createProcsStudio } from "../applications/procs_studio";
import { createSdStudio } from "../applications/sd_studio";
import { createRipStudio } from "../applications/rip_studio";
import { createFdStudio } from "../applications/fd_studio";
import { createWatchexecStudio } from "../applications/watchexec_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, controlId: string, event = "click", val?: any) {
  const norm = event.startsWith("on") ? event.toLowerCase() : `on${event.toLowerCase()}`;
  const raw = event.toLowerCase();
  const handler = win.eventHandlersMap.get(`${controlId}:${norm}`)
    || win.eventHandlersMap.get(`${controlId}:${raw}`)
    || win.eventHandlersMap.get(`${controlId}`);
  if (!handler) {
    throw new Error(`Handler not found for control "${controlId}" (event: ${event}). Keys: ${Array.from(win.eventHandlersMap.keys()).join(", ")}`);
  }
  return await handler(win, val);
}

describe("⚡ Interactive GUI Control & Assertion Suite", () => {
  it("1. Controls IpInfo Studio: CIDR calculations, interface discovery, and clearing", async () => {
    const win = createIpInfoStudio();
    
    // Test CIDR calculation
    win.setValue("txt_target", "192.168.1.0/24");
    await trigger(win, "btn_calc_subnet");

    const cidrRows = win.getValue("tbl_details") as string[][];
    expect(Array.isArray(cidrRows)).toBe(true);
    expect(cidrRows.length).toBeGreaterThanOrEqual(9);
    expect(cidrRows.some(r => r[0] === "CIDR Block" && r[1] === "192.168.1.0/24")).toBe(true);
    expect(cidrRows.some(r => r[0] === "Network Address" && r[1] === "192.168.1.0")).toBe(true);
    expect(cidrRows.some(r => r[0] === "Broadcast Address" && r[1] === "192.168.1.255")).toBe(true);
    expect(win.getValue("lbl_status_bar")).toContain("✓ Calculated subnet 192.168.1.0/24");
    expect(win.getValue("console_ipinfo")).toContain("192.168.1.0/24");

    // Test Copy JSON for subnet
    await trigger(win, "btn_copy_json");
    expect(win.getValue("console_ipinfo")).toContain('"cidr": "192.168.1.0/24"');
    expect(win.getValue("lbl_status_bar")).toContain("✓ Subnet JSON copied");

    // Test local network interfaces
    await trigger(win, "btn_local_ifaces");
    const ifaceRows = win.getValue("tbl_details") as string[][];
    expect(Array.isArray(ifaceRows)).toBe(true);
    expect(ifaceRows.length).toBeGreaterThanOrEqual(1);
    expect(win.getValue("console_ipinfo")).toContain("LOCAL NETWORK INTERFACES");
    expect(win.getValue("lbl_metric_status")).toContain("Mode: Local Network");

    // Test IP lookup
    win.setValue("txt_target", "8.8.8.8");
    await trigger(win, "btn_search");
    const ipRows = win.getValue("tbl_details") as string[][];
    expect(Array.isArray(ipRows)).toBe(true);
    expect(ipRows.length).toBeGreaterThanOrEqual(5);
    expect(win.getValue("lbl_metric_ip")).toContain("8.8.8.8");
    expect(win.getValue("lbl_status_bar")).toContain("✓ Successfully resolved");

    // Test Domain resolution (google.com) via Enter key
    await trigger(win, "txt_target", "enter", "google.com");
    expect(win.getValue("lbl_status_bar")).toContain("✓ Successfully resolved");
    expect(win.getValue("lbl_metric_ip")).not.toBe("Target IP: -");
    expect(win.getValue("console_ipinfo")).toContain("google.com");

    // Test CSV export
    await trigger(win, "btn_copy_csv");
    expect(win.getValue("console_ipinfo")).toContain("AS15169 Google LLC");
    expect(win.getValue("lbl_status_bar")).toContain("CSV formatted output");

    // Test invalid CIDR error handling
    win.setValue("txt_target", "invalid-ip-block");
    await trigger(win, "btn_calc_subnet");
    expect(win.getValue("lbl_status_bar")).toContain("⚠️ Target must be in CIDR notation");

    // Test clear
    await trigger(win, "btn_clear");
    expect(win.getValue("txt_target")).toBe("");
    expect(win.getValue("tbl_details")).toEqual([]);
    expect(win.getValue("console_ipinfo")).toBe("");
    expect(win.getValue("lbl_status_bar")).toBe("Cleared.");
  });

  it("2. Controls Doggo Studio: multi-record DNS query, export JSON, and clear", async () => {
    const win = createDoggoStudio();

    win.setValue("txt_target", "example.com");
    win.setValue("dd_type", "A");
    await trigger(win, "btn_query");

    const records = win.getValue("tbl_records") as string[][];
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeGreaterThanOrEqual(1);
    expect(records[0]![0]).toBe("A");
    expect(win.getValue("lbl_metric_target")).toContain("example.com");
    expect(win.getValue("console_doggo")).toContain("example.com");
    expect(win.getValue("lbl_status_bar")).toContain("Received");

    // Test export JSON
    await trigger(win, "btn_export_json");
    expect(win.getValue("console_doggo")).toContain('"domain": "example.com"');
    expect(win.getValue("lbl_status_bar")).toContain("Exported DNS response JSON");

    // Test clear
    await trigger(win, "btn_clear");
    expect(win.getValue("txt_target")).toBe("");
    expect(win.getValue("tbl_records")).toEqual([]);
    expect(win.getValue("console_doggo")).toBe("");
  });

  it("3. Controls Tokei Studio: code analysis, markdown generation, and JSON export", async () => {
    const win = createTokeiStudio();

    win.setValue("txt_path", "./src/features/sd");
    await trigger(win, "btn_analyze");

    const tokeiRows = win.getValue("tbl_tokei") as string[][];
    expect(Array.isArray(tokeiRows)).toBe(true);
    expect(tokeiRows.length).toBeGreaterThanOrEqual(2); // At least TypeScript + TOTAL
    expect(tokeiRows.some(r => r[0] === "TypeScript")).toBe(true);
    expect(tokeiRows.some(r => r[0] === "TOTAL")).toBe(true);
    expect(win.getValue("lbl_status_bar")).toContain("Completed scan");

    // Test copy Markdown
    await trigger(win, "btn_copy_markdown");
    expect(win.getValue("console_tokei")).toContain("| Language");
    expect(win.getValue("lbl_status_bar")).toContain("Markdown table generated");

    // Test export JSON
    await trigger(win, "btn_export_json");
    expect(win.getValue("console_tokei")).toContain('"language": "TypeScript"');
    expect(win.getValue("lbl_status_bar")).toContain("JSON report generated");

    // Test clear
    await trigger(win, "btn_clear");
    expect(win.getValue("tbl_tokei")).toEqual([]);
    expect(win.getValue("console_tokei")).toBe("");
  });

  it(
    "4. Controls Subfinder Studio: domain reconnaissance and list export",
    async () => {
      const win = createSubfinderStudio();

      win.setValue("txt_domain", "example.com");
      win.setValue("chk_silent", true);
      win.setValue("chk_probe", false);
      await trigger(win, "btn_start");

      const subsRows = win.getValue("tbl_subs") as string[][];
      expect(Array.isArray(subsRows)).toBe(true);
      expect(win.getValue("lbl_metric_domain")).toContain("example.com");
      expect(win.getValue("lbl_status_bar")).toContain("Completed enumeration");

      // Test copy list
      await trigger(win, "btn_copy_list");
      expect(win.getValue("console_subs")).toBeDefined();

      // Test clear
      await trigger(win, "btn_clear");
      expect(win.getValue("tbl_subs")).toEqual([]);
      expect(win.getValue("console_subs")).toBe("");
    },
    15000
  );

  it("5. Controls Gdu Studio: disk scanning, mounted disks, and drill-down navigation", async () => {
    const win = createGduStudio();

    win.setValue("txt_path", "./src/features");
    await trigger(win, "btn_scan");

    const items = win.getValue("tbl_items") as string[][];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(win.getValue("lbl_status_bar")).toContain("Scanned");

    // Test drill-down on a directory row
    await trigger(win, "tbl_items", "click", 0);
    expect(win.getValue("console_gdu")).toContain("SELECTED ITEM");

    // Test mounted disks query
    await trigger(win, "btn_disks");
    expect(win.getValue("console_gdu")).toContain("MOUNTED FILESYSTEMS");
    expect(win.getValue("lbl_status_bar")).toContain("mounted filesystem volume(s)");
  });

  it("6. Controls Procs Studio: process scanning, filtering, inspection, and tree toggle", async () => {
    const win = createProcsStudio();

    await trigger(win, "btn_refresh");
    const procsRows = win.getValue("tbl_procs") as string[][];
    expect(Array.isArray(procsRows)).toBe(true);
    expect(procsRows.length).toBeGreaterThanOrEqual(1);
    expect(win.getValue("lbl_status_bar")).toContain("Displaying");

    // Test selecting a process row from table
    await trigger(win, "tbl_procs", "click", 0);
    expect(win.getValue("console_detail")).toContain("PROCESS DETAIL INSPECTOR");
    expect(win.getValue("lbl_status_bar")).toContain("Selected PID");

    // Test tree toggle
    await trigger(win, "btn_tree");
    expect(win.getValue("console_detail")).toContain("PROCESS HIERARCHY TREE");
    expect(win.getValue("lbl_status_bar")).toContain("Tree View enabled");

    // Test clear filter
    win.setValue("txt_search", "bun");
    await trigger(win, "btn_clear_filter");
    expect(win.getValue("txt_search")).toBe("");
  });

  it("7. Controls Sd Studio: pattern count, diff preview, and row selection", async () => {
    const win = createSdStudio();

    win.setValue("txt_path", "./src/features/tokei");
    win.setValue("txt_find", "export function");
    win.setValue("txt_replace", "export const");
    
    // Test count matches
    await trigger(win, "btn_count_matches");
    const countRows = win.getValue("tbl_files") as string[][];
    expect(Array.isArray(countRows)).toBe(true);
    expect(countRows.length).toBeGreaterThanOrEqual(1);
    expect(win.getValue("lbl_status_bar")).toContain("Completed count");

    // Test preview diffs
    await trigger(win, "btn_preview_diffs");
    const diffRows = win.getValue("tbl_files") as string[][];
    expect(Array.isArray(diffRows)).toBe(true);
    expect(win.getValue("console_diffs")).toContain("[L");
    expect(win.getValue("lbl_status_bar")).toContain("Completed preview");

    // Test selecting a row in tbl_files
    await trigger(win, "tbl_files", "click", 0);
    expect(win.getValue("console_diffs")).toContain("[L");

    // Test clear
    await trigger(win, "btn_clear");
    expect(win.getValue("txt_find")).toBe("");
    expect(win.getValue("txt_replace")).toBe("");
    expect(win.getValue("tbl_files")).toEqual([]);
    expect(win.getValue("console_diffs")).toBe("");
  });

  it("8. Controls Rip Studio: graveyard refresh, file quarantine, and undo restoration", async () => {
    const win = createRipStudio();

    await trigger(win, "btn_refresh");
    expect(win.getValue("lbl_status_msg")).toContain("Status:");
    expect(win.getValue("lbl_metric_total")).toContain("Buried Items:");

    await trigger(win, "btn_filter_files");
    expect(win.getValue("lbl_status_msg")).toContain("Status:");

    // Create a temporary file to test real burying and unburying through the GUI
    const testFile = `./test_rip_gui_${Date.now()}.txt`;
    await Bun.write(testFile, "Temporary test content for GUI quarantine");
    expect(await Bun.file(testFile).exists()).toBe(true);

    // Bury via GUI
    win.setValue("txt_bury_target", testFile);
    await trigger(win, "btn_bury_target");
    expect(await Bun.file(testFile).exists()).toBe(false);

    // Unbury via GUI
    await trigger(win, "btn_unbury_last");
    expect(await Bun.file(testFile).exists()).toBe(true);

    // Clean up test file
    await Bun.file(testFile).delete();

    await trigger(win, "btn_clear_console");
    expect(win.getValue("rip_console")).toContain("cleared");
  });

  it("9. Controls Fd Studio: file search, extension filtering, and type filters", async () => {
    const win = createFdStudio();

    win.setValue("txt_pattern", "tokei");
    win.setValue("txt_search_path", "./src/features");
    await trigger(win, "btn_search");

    const searchRows = win.getValue("tbl_results") as string[][];
    expect(Array.isArray(searchRows)).toBe(true);
    expect(searchRows.length).toBeGreaterThanOrEqual(1);
    expect(win.getValue("lbl_status")).toContain("Matches:");

    // Test selecting a row in tbl_results
    await trigger(win, "tbl_results", "click", searchRows[0]![0]);
    expect(win.getValue("lbl_status")).toBeDefined();

    // Test type filter
    await trigger(win, "btn_type_dirs");
    expect(win.getValue("lbl_status")).toBeDefined();

    // Test clear
    await trigger(win, "btn_clear");
    expect(win.getValue("txt_pattern")).toBe("");
  });

  it("10. Controls Watchexec Studio: watcher start/stop lifecycle, manual execution trigger, and console clear", async () => {
    const win = createWatchexecStudio();

    // Test watcher start and stop
    await trigger(win, "btn_start_watch");
    expect(win.getValue("lbl_metric_status")).toContain("ACTIVE");

    await trigger(win, "btn_stop_watch");
    expect(win.getValue("lbl_metric_status")).toContain("STOPPED");

    // Test manual trigger
    win.setValue("txt_exec_cmd", "echo 'interactive test output'");
    await trigger(win, "btn_trigger_now");

    expect(win.getValue("watch_console")).toContain("interactive test output");
    expect(win.getValue("lbl_metric_triggers")).toContain("Trigger Count: 1");

    // Long-running commands stay asynchronous and can be cancelled from the UI.
    win.setValue("txt_exec_cmd", "sleep 1");
    const runningCommand = trigger(win, "btn_trigger_now");
    expect(win.getValue("lbl_metric_pid")).not.toBe("Active PID: None");
    await trigger(win, "btn_kill_run");
    expect(win.getValue("lbl_status_bar")).toBe("Process killed.");
    await runningCommand;
    expect(win.getValue("lbl_status_bar")).toBe("Process killed.");

    // Test clear console
    await trigger(win, "btn_clear_console");
    expect(win.getValue("watch_console")).toBe("");
  });
});
