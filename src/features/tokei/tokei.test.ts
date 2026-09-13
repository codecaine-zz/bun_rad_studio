import { describe, expect, it } from "bun:test";
import {
  aggregateStats,
  analyzeLines,
  detectLanguage,
  formatFilesBreakdown,
  formatJsonReports,
  formatMarkdownTable,
  sortReports,
} from "./tokeiDoers.ts";
import type { FileStat } from "./tokeiTypes.ts";

describe("tokei doers", () => {
  it("detects language from file extension", () => {
    expect(detectLanguage("main.ts")?.name).toBe("TypeScript");
    expect(detectLanguage("script.py")?.name).toBe("Python");
    expect(detectLanguage("index.html")?.name).toBe("HTML");
    expect(detectLanguage("unknown.xyz")).toBeNull();
  });

  it("analyzes code lines, comments, and blanks accurately", () => {
    const tsSnippet = `
// Single comment
const a = 1;

/*
 Multi comment
*/
console.log(a);
`;
    const stats = analyzeLines(tsSnippet, {
      single: ["//"],
      multi: [["/*", "*/"]],
    });

    expect(stats.blank).toBe(3);
    expect(stats.comment).toBe(4);
    expect(stats.code).toBe(2);
    expect(stats.lines).toBe(9);
  });

  it("aggregates file stats by language", () => {
    const fileStats: FileStat[] = [
      { path: "a.ts", language: "TypeScript", stats: { lines: 10, blank: 2, comment: 3, code: 5 } },
      { path: "b.ts", language: "TypeScript", stats: { lines: 20, blank: 4, comment: 6, code: 10 } },
      { path: "c.md", language: "Markdown", stats: { lines: 5, blank: 1, comment: 0, code: 4 } },
    ];

    const reports = aggregateStats(fileStats);
    expect(reports.length).toBe(2);

    const tsReport = reports.find((r) => r.language === "TypeScript");
    expect(tsReport?.files).toBe(2);
    expect(tsReport?.stats.code).toBe(15);
  });

  it("sorts reports by chosen column", () => {
    const fileStats: FileStat[] = [
      { path: "a.ts", language: "TypeScript", stats: { lines: 10, blank: 2, comment: 3, code: 5 } },
      { path: "b.md", language: "Markdown", stats: { lines: 20, blank: 4, comment: 6, code: 10 } },
    ];
    const reports = aggregateStats(fileStats);
    const sortedByCode = sortReports(reports, "code");

    expect(sortedByCode[0]?.language).toBe("Markdown");
  });

  it("formats json reports correctly", () => {
    const fileStats: FileStat[] = [
      { path: "a.ts", language: "TypeScript", stats: { lines: 10, blank: 2, comment: 3, code: 5 } },
    ];
    const reports = aggregateStats(fileStats);
    const jsonStr = formatJsonReports(reports);
    expect(jsonStr).toContain("TypeScript");
    expect(JSON.parse(jsonStr)[0].files).toBe(1);
  });

  it("formats per-file breakdown table correctly", () => {
    const fileStats: FileStat[] = [
      { path: "a.ts", language: "TypeScript", stats: { lines: 10, blank: 2, comment: 3, code: 5 } },
    ];
    const reports = aggregateStats(fileStats);
    const breakdown = formatFilesBreakdown(reports);
    expect(breakdown).toContain("TypeScript");
    expect(breakdown).toContain("a.ts");
  });

  it("detects modern languages", () => {
    expect(detectLanguage("build.zig")?.name).toBe("Zig");
    expect(detectLanguage("App.svelte")?.name).toBe("Svelte");
    expect(detectLanguage("Main.kt")?.name).toBe("Kotlin");
    expect(detectLanguage("Query.graphql")?.name).toBe("GraphQL");
  });

  it("formats markdown table correctly", () => {
    const fileStats: FileStat[] = [
      { path: "a.ts", language: "TypeScript", stats: { lines: 10, blank: 2, comment: 3, code: 5 } },
    ];
    const reports = aggregateStats(fileStats);
    const md = formatMarkdownTable(reports);
    expect(md).toContain("| Language | Files | Lines | Blank | Comment | Code |");
    expect(md).toContain("| TypeScript | 1 | 10 | 2 | 3 | 5 |");
    expect(md).toContain("| **Total** |");
  });
});
