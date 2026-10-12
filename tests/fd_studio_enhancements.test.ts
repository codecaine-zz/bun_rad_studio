import { describe, expect, test } from "bun:test";
import {
  FD_PRESETS,
  FD_PRESET_NONE,
  findPreset,
  sortResults,
  filterResults,
  parseMaxResults,
  pushHistory,
  exportFileName,
} from "../src/fd_helpers";
import { createFdStudio } from "../applications/fd_studio";

const items = [
  { name: "b.ts", sizeBytes: 50, mtimeMs: 200, relativePath: "src/b.ts" },
  { name: "A.md", sizeBytes: 900, mtimeMs: 100, relativePath: "docs/A.md" },
  { name: "c10.log", sizeBytes: 5, mtimeMs: 300, relativePath: "logs/c10.log" },
  { name: "c2.log", sizeBytes: 7, mtimeMs: 50, relativePath: "logs/c2.log" },
];

describe("fd_helpers", () => {
  test("presets are well-formed", () => {
    expect(FD_PRESETS.length).toBeGreaterThan(5);
    expect(new Set(FD_PRESETS.map((p) => p.label)).size).toBe(FD_PRESETS.length);
    expect(findPreset("Images")?.exts).toContain("png");
    expect(findPreset(FD_PRESET_NONE)).toBeUndefined();
  });

  test("sortResults orders by each key without mutating input", () => {
    const before = items.map((i) => i.name);
    expect(sortResults(items, "Name (A→Z)").map((i) => i.name)).toEqual(["A.md", "b.ts", "c2.log", "c10.log"]);
    expect(sortResults(items, "Name (Z→A)")[0]!.name).toBe("c10.log");
    expect(sortResults(items, "Size (largest)")[0]!.name).toBe("A.md");
    expect(sortResults(items, "Size (smallest)")[0]!.name).toBe("c10.log");
    expect(sortResults(items, "Modified (newest)")[0]!.name).toBe("c10.log");
    expect(sortResults(items, "Modified (oldest)")[0]!.name).toBe("c2.log");
    expect(sortResults(items, "Default order").map((i) => i.name)).toEqual(before);
    expect(items.map((i) => i.name)).toEqual(before);
  });

  test("filterResults matches name or path, case-insensitively", () => {
    expect(filterResults(items, "").length).toBe(4);
    expect(filterResults(items, "LOG").length).toBe(2);
    expect(filterResults(items, "docs/").map((i) => i.name)).toEqual(["A.md"]);
    expect(filterResults(items, "zzz")).toEqual([]);
  });

  test("parseMaxResults clamps and defaults", () => {
    expect(parseMaxResults("")).toBe(1500);
    expect(parseMaxResults("abc")).toBe(1500);
    expect(parseMaxResults("-5")).toBe(1500);
    expect(parseMaxResults("250")).toBe(250);
    expect(parseMaxResults("999999")).toBe(20000);
  });

  test("pushHistory dedupes, caps and ignores blanks", () => {
    expect(pushHistory(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(pushHistory(["a"], "  ")).toEqual(["a"]);
    const long = Array.from({ length: 20 }, (_, i) => String(i));
    expect(pushHistory(long, "new", 5).length).toBe(5);
    expect(pushHistory(long, "new", 5)[0]).toBe("new");
  });

  test("exportFileName embeds timestamp and extension", () => {
    expect(exportFileName(".csv", new Date(2026, 0, 2, 3, 4))).toBe("fd_results_20260102_0304.csv");
  });
});

describe("Fd Studio enhanced UI", () => {
  test("renders the new controls", () => {
    const win = createFdStudio({ fullscreen: false } as any);
    const html = win.generateHtml();
    for (const id of [
      "btn_browse_root", "btn_browse_dest", "dd_preset", "dd_history",
      "txt_max_results", "dd_sort", "txt_filter", "btn_export_saveas",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});
