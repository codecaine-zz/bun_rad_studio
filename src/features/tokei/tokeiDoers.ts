/**
 * Pure helper functions and language definitions for the `tokei` feature.
 * Handles language detection by extension, line-by-line code/comment/blank classification,
 * aggregation by language, sorting, and output formatting (ASCII table, JSON, Markdown).
 */
import { extname } from "node:path";
import type {
  CommentRule,
  FileStat,
  LanguageReport,
  LanguageSpec,
  LineStats,
  TokeiSortField,
} from "./tokeiTypes.ts";
import { colors } from "../../shared/colors.ts";
import { renderTable, type ColumnDef } from "../../shared/table.ts";

/**
 * Registry of supported programming and markup languages with their file extensions and comment rules.
 */
export const LANGUAGES: LanguageSpec[] = [
  {
    name: "TypeScript",
    extensions: [".ts", ".tsx"],
    commentRule: { single: ["//"], multi: [["/*", "*/"]] },
  },
  {
    name: "JavaScript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    commentRule: { single: ["//"], multi: [["/*", "*/"]] },
  },
  {
    name: "Rust",
    extensions: [".rs"],
    commentRule: { single: ["//"], multi: [["/*", "*/"]] },
  },
  {
    name: "Python",
    extensions: [".py"],
    commentRule: {
      single: ["#"],
      multi: [
        ['"""', '"""'],
        ["'''", "'''"],
      ],
    },
  },
  {
    name: "Go",
    extensions: [".go"],
    commentRule: { single: ["//"], multi: [["/*", "*/"]] },
  },
  {
    name: "C/C++",
    extensions: [".c", ".h", ".cpp", ".hpp", ".cc"],
    commentRule: { single: ["//"], multi: [["/*", "*/"]] },
  },
  { name: "Zig", extensions: [".zig"], commentRule: { single: ["//"] } },
  {
    name: "Kotlin",
    extensions: [".kt", ".kts"],
    commentRule: { single: ["//"], multi: [["/*", "*/"]] },
  },
  {
    name: "Swift",
    extensions: [".swift"],
    commentRule: { single: ["//"], multi: [["/*", "*/"]] },
  },
  {
    name: "Dart",
    extensions: [".dart"],
    commentRule: { single: ["//"], multi: [["/*", "*/"]] },
  },
  {
    name: "Svelte",
    extensions: [".svelte"],
    commentRule: { multi: [["<!--", "-->"]] },
  },
  {
    name: "Vue",
    extensions: [".vue"],
    commentRule: { multi: [["<!--", "-->"]] },
  },
  {
    name: "Astro",
    extensions: [".astro"],
    commentRule: { multi: [["<!--", "-->"]] },
  },
  { name: "Nix", extensions: [".nix"], commentRule: { single: ["#"] } },
  {
    name: "Shell",
    extensions: [".sh", ".bash", ".zsh"],
    commentRule: { single: ["#"] },
  },
  {
    name: "Markdown",
    extensions: [".md", ".markdown"],
    commentRule: { multi: [["<!--", "-->"]] },
  },
  { name: "JSON", extensions: [".json"], commentRule: {} },
  {
    name: "HTML",
    extensions: [".html", ".htm"],
    commentRule: { multi: [["<!--", "-->"]] },
  },
  { name: "CSS", extensions: [".css"], commentRule: { multi: [["/*", "*/"]] } },
  {
    name: "YAML",
    extensions: [".yaml", ".yml"],
    commentRule: { single: ["#"] },
  },
  {
    name: "SQL",
    extensions: [".sql"],
    commentRule: { single: ["--"], multi: [["/*", "*/"]] },
  },
  { name: "TOML", extensions: [".toml"], commentRule: { single: ["#"] } },
  {
    name: "GraphQL",
    extensions: [".graphql", ".gql"],
    commentRule: { single: ["#"] },
  },
];

/**
 * Looks up the language specification matching a filename's extension.
 * Returns `null` if the file has no extension or is not in `LANGUAGES`.
 */
export function detectLanguage(filename: string): LanguageSpec | null {
  const ext = extname(filename).toLowerCase();
  if (!ext) return null;
  return LANGUAGES.find((lang) => lang.extensions.includes(ext)) ?? null;
}

/**
 * Counts total, blank, comment, and code lines in `content` using the given language `CommentRule`.
 */
export function analyzeLines(content: string, rule: CommentRule): LineStats {
  const lines = content.split("\n");
  let blank = 0;
  let comment = 0;
  let code = 0;
  let inMultiComment = false;
  let activeMultiEnd = "";

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      blank++;
      continue;
    }

    if (inMultiComment) {
      comment++;
      if (trimmed.includes(activeMultiEnd)) inMultiComment = false;
      continue;
    }

    const matchedStart = rule.multi?.find(([start]) =>
      trimmed.startsWith(start),
    );
    if (matchedStart) {
      comment++;
      if (!trimmed.endsWith(matchedStart[1]) || trimmed === matchedStart[0]) {
        inMultiComment = true;
        activeMultiEnd = matchedStart[1];
      }
      continue;
    }

    if (rule.single?.some((s) => trimmed.startsWith(s))) {
      comment++;
      continue;
    }

    code++;
  }

  return { lines: lines.length, blank, comment, code };
}

/**
 * Groups individual file statistics by language and computes per-language totals.
 */
export function aggregateStats(fileStats: FileStat[]): LanguageReport[] {
  const map = new Map<string, LanguageReport>();
  for (const f of fileStats) {
    let report = map.get(f.language);
    if (!report) {
      report = {
        language: f.language,
        files: 0,
        stats: { lines: 0, blank: 0, comment: 0, code: 0 },
        fileDetails: [],
      };
      map.set(f.language, report);
    }
    report.files++;
    report.stats.lines += f.stats.lines;
    report.stats.blank += f.stats.blank;
    report.stats.comment += f.stats.comment;
    report.stats.code += f.stats.code;
    report.fileDetails.push(f);
  }
  return Array.from(map.values());
}

/**
 * Returns a new array of language reports sorted in descending order by the specified metric.
 */
export function sortReports(
  reports: LanguageReport[],
  sort: TokeiSortField,
): LanguageReport[] {
  const copy = [...reports];
  return copy.sort((a, b) => {
    if (sort === "files") return b.files - a.files;
    return b.stats[sort] - a.stats[sort];
  });
}

/**
 * Renders aggregated language statistics and grand totals as a colorized terminal table.
 */
export function formatTokeiTable(reports: LanguageReport[]): string {
  const totalFiles = reports.reduce((acc, r) => acc + r.files, 0);
  const totalLines = reports.reduce((acc, r) => acc + r.stats.lines, 0);
  const totalBlank = reports.reduce((acc, r) => acc + r.stats.blank, 0);
  const totalComment = reports.reduce((acc, r) => acc + r.stats.comment, 0);
  const totalCode = reports.reduce((acc, r) => acc + r.stats.code, 0);

  const columns: ColumnDef<LanguageReport>[] = [
    {
      header: "Language",
      align: "left",
      getValue: (r) => colors.bold(colors.cyan(r.language)),
    },
    { header: "Files", align: "right", getValue: (r) => r.files.toString() },
    {
      header: "Lines",
      align: "right",
      getValue: (r) => colors.dim(r.stats.lines.toString()),
    },
    {
      header: "Blank",
      align: "right",
      getValue: (r) => colors.dim(r.stats.blank.toString()),
    },
    {
      header: "Comment",
      align: "right",
      getValue: (r) => colors.green(r.stats.comment.toString()),
    },
    {
      header: "Code",
      align: "right",
      getValue: (r) => colors.yellow(r.stats.code.toString()),
    },
  ];

  const tableBody = renderTable(columns, reports);
  const divider = "-".repeat(56);
  const summaryLine = `${colors.bold("Total".padEnd(12))} ${totalFiles.toString().padStart(5)}  ${totalLines.toString().padStart(6)}  ${totalBlank.toString().padStart(5)}  ${totalComment.toString().padStart(7)}  ${totalCode.toString().padStart(6)}`;

  return `========================================================\n${tableBody}\n${divider}\n${summaryLine}\n========================================================`;
}

/**
 * Serializes language reports as pretty-printed JSON.
 */
export function formatJsonReports(reports: LanguageReport[]): string {
  return JSON.stringify(reports, null, 2);
}

/**
 * Formats language reports and grand totals as a GitHub Flavored Markdown table.
 */
export function formatMarkdownTable(reports: LanguageReport[]): string {
  const header = "| Language | Files | Lines | Blank | Comment | Code |";
  const divider = "|:---|---:|---:|---:|---:|---:|";
  const rows = reports.map(
    (r) =>
      `| ${r.language} | ${r.files} | ${r.stats.lines} | ${r.stats.blank} | ${r.stats.comment} | ${r.stats.code} |`,
  );
  const totalFiles = reports.reduce((acc, r) => acc + r.files, 0);
  const totalLines = reports.reduce((acc, r) => acc + r.stats.lines, 0);
  const totalBlank = reports.reduce((acc, r) => acc + r.stats.blank, 0);
  const totalComment = reports.reduce((acc, r) => acc + r.stats.comment, 0);
  const totalCode = reports.reduce((acc, r) => acc + r.stats.code, 0);
  const totalRow = `| **Total** | **${totalFiles}** | **${totalLines}** | **${totalBlank}** | **${totalComment}** | **${totalCode}** |`;

  return [header, divider, ...rows, totalRow].join("\n");
}

/**
 * Formats a per-language, per-file line count breakdown table for terminal display.
 */
export function formatFilesBreakdown(reports: LanguageReport[]): string {
  const lines: string[] = [];
  for (const report of reports) {
    lines.push(
      `\n${colors.bold(colors.cyan(`--- ${report.language} (${report.files} files) ---`))}`,
    );
    const columns: ColumnDef<FileStat>[] = [
      { header: "File", align: "left", getValue: (f) => f.path },
      {
        header: "Lines",
        align: "right",
        getValue: (f) => colors.dim(f.stats.lines.toString()),
      },
      {
        header: "Blank",
        align: "right",
        getValue: (f) => colors.dim(f.stats.blank.toString()),
      },
      {
        header: "Comment",
        align: "right",
        getValue: (f) => colors.green(f.stats.comment.toString()),
      },
      {
        header: "Code",
        align: "right",
        getValue: (f) => colors.yellow(f.stats.code.toString()),
      },
    ];
    lines.push(renderTable(columns, report.fileDetails));
  }
  return lines.join("\n");
}
