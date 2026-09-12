import { describe, it, expect } from "bun:test";
import { createTaskTracker, fetchProcesses, matchesQuery, ProcessItem } from "../applications/task_manager";

describe("Task Manager UI Alignment & Search Resilience Specification", () => {
  it("verifies Limit label and Limit dropdown are on the exact same line (same top coordinate)", () => {
    const win = createTaskTracker({ fullscreen: false });
    
    // Check controls in win
    const lblLimit = (win as any).controls.find((c: any) => c.id === "lbl_limit");
    const ddLimit = (win as any).controls.find((c: any) => c.id === "dd_limit");
    const lblFilter = (win as any).controls.find((c: any) => c.id === "lbl_filter");
    const txtFilter = (win as any).controls.find((c: any) => c.id === "txt_filter");
    const btnSearch = (win as any).controls.find((c: any) => c.id === "btn_apply_filter");
    const btnClear = (win as any).controls.find((c: any) => c.id === "btn_clear_filter");
    const lblSort = (win as any).controls.find((c: any) => c.id === "lbl_sort");
    const ddSort = (win as any).controls.find((c: any) => c.id === "dd_sort");

    expect(lblLimit).toBeDefined();
    expect(ddLimit).toBeDefined();
    expect(lblFilter).toBeDefined();
    expect(txtFilter).toBeDefined();
    expect(btnSearch).toBeDefined();
    expect(btnClear).toBeDefined();
    expect(lblSort).toBeDefined();
    expect(ddSort).toBeDefined();

    // Key UI assertion: Limit label and Limit dropdown must have the exact same top coordinate!
    expect(ddLimit.top).toBe(lblLimit.top);
    expect(ddSort.top).toBe(lblFilter.top);
    expect(lblLimit.top).toBe(lblFilter.top);
    expect(ddLimit.top).toBe(txtFilter.top);

    // ddLimit should be positioned to the right of lblLimit
    expect(ddLimit.left).toBeGreaterThan(lblLimit.left);
  });

  it("verifies processes fetch reliably across repeated rapid invocations", () => {
    // Call fetchProcesses 10 times in rapid succession
    for (let i = 0; i < 10; i++) {
      const procs = fetchProcesses();
      expect(Array.isArray(procs)).toBe(true);
      expect(procs.length).toBeGreaterThan(0);
    }
  });

  it("verifies searching and clearing repeatedly preserves process items", () => {
    const procs = fetchProcesses();
    expect(procs.length).toBeGreaterThan(10);

    // Search for terminal / ghosty
    const termMatches = procs.filter((p) => matchesQuery(p, "terminal"));
    // Search for nonexistent query
    const nonMatches = procs.filter((p) => matchesQuery(p, "zzz999xyz_nonexistent"));
    expect(nonMatches.length).toBe(0);

    // Clear (empty query) returns 100% of processes
    const allMatches = procs.filter((p) => matchesQuery(p, ""));
    expect(allMatches.length).toBe(procs.length);

    // Repeat cycle 5 times
    for (let cycle = 0; cycle < 5; cycle++) {
      const searchRes = procs.filter((p) => matchesQuery(p, "bun"));
      expect(searchRes.length).toBeGreaterThan(0);
      const clearRes = procs.filter((p) => matchesQuery(p, ""));
      expect(clearRes.length).toBe(procs.length);
    }
  });

  it("verifies HTML output contains client-side master table caching and instant clear logic", () => {
    const win = createTaskTracker({ fullscreen: false });
    const html = win.generateHtml();

    expect(html).toContain("__masterTableTbodyHtml");
    expect(html).toContain("btn_clear_filter");
    expect(html).toContain("txt_filter");
    expect(html).toContain("lbl_limit");
    expect(html).toContain("dd_limit");
  });
});
