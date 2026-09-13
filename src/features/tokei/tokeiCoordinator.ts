import { readFileSync, readdirSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FileStat, LanguageReport, TokeiOptions } from "./tokeiTypes.ts";
import {
  aggregateStats,
  analyzeLines,
  detectLanguage,
  formatFilesBreakdown,
  formatJsonReports,
  formatMarkdownTable,
  formatTokeiTable,
  sortReports,
} from "./tokeiDoers.ts";

export async function scanCodeFiles(
  dirPath: string,
  hidden: boolean,
  ignores: string[] = ["node_modules", ".git", ".graveyard", "dist", "build"]
): Promise<string[]> {
  const matchedFiles: string[] = [];
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!hidden && entry.name.startsWith(".")) continue;
      if (ignores.includes(entry.name)) continue;

      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = await scanCodeFiles(fullPath, hidden, ignores);
        matchedFiles.push(...sub);
      } else if (entry.isFile()) {
        matchedFiles.push(fullPath);
      }
    }
  } catch {
    // Directory unreadable
  }
  return matchedFiles;
}

export async function processFile(filePath: string): Promise<FileStat | null> {
  const lang = detectLanguage(filePath);
  if (!lang) return null;

  try {
    const content = await Bun.file(filePath).text();
    const stats = analyzeLines(content, lang.commentRule);
    return { path: filePath, language: lang.name, stats };
  } catch {
    return null;
  }
}

export async function computeCodeStats(options: TokeiOptions): Promise<LanguageReport[]> {
  const allFiles: string[] = [];
  const defaultIgnores = ["node_modules", ".git", ".graveyard", "dist", "build"];
  const combinedIgnores = options.excludes ? [...defaultIgnores, ...options.excludes] : defaultIgnores;

  for (const p of options.paths) {
    const s = await Bun.file(p).exists();
    if (s) {
      allFiles.push(p);
    } else {
      const files = await scanCodeFiles(p, options.hidden, combinedIgnores);
      allFiles.push(...files);
    }
  }

  const fileStats: FileStat[] = [];
  for (const file of allFiles) {
    const stat = await processFile(file);
    if (stat) fileStats.push(stat);
  }

  const reports = aggregateStats(fileStats);
  return sortReports(reports, options.sort);
}

export function scanCodeFilesSync(
  dirPath: string,
  hidden: boolean,
  ignores: string[] = ["node_modules", ".git", ".graveyard", "dist", "build"]
): string[] {
  const matchedFiles: string[] = [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!hidden && entry.name.startsWith(".")) continue;
      if (ignores.includes(entry.name)) continue;

      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = scanCodeFilesSync(fullPath, hidden, ignores);
        matchedFiles.push(...sub);
      } else if (entry.isFile()) {
        matchedFiles.push(fullPath);
      }
    }
  } catch {}
  return matchedFiles;
}

export function processFileSync(filePath: string): FileStat | null {
  const lang = detectLanguage(filePath);
  if (!lang) return null;

  try {
    const content = readFileSync(filePath, "utf-8");
    const stats = analyzeLines(content, lang.commentRule);
    return { path: filePath, language: lang.name, stats };
  } catch {
    return null;
  }
}

export function computeCodeStatsSync(options: TokeiOptions): LanguageReport[] {
  const allFiles: string[] = [];
  const defaultIgnores = ["node_modules", ".git", ".graveyard", "dist", "build"];
  const combinedIgnores = options.excludes ? [...defaultIgnores, ...options.excludes] : defaultIgnores;

  for (const p of options.paths) {
    try {
      const s = statSync(p);
      if (s.isDirectory()) {
        allFiles.push(...scanCodeFilesSync(p, options.hidden ?? false, combinedIgnores));
      } else if (s.isFile()) {
        allFiles.push(p);
      }
    } catch {}
  }

  const fileStats: FileStat[] = [];
  for (const file of allFiles) {
    const stat = processFileSync(file);
    if (stat) fileStats.push(stat);
  }

  const reports = aggregateStats(fileStats);
  return sortReports(reports, options.sort);
}

export async function runTokeiCoordinator(options: TokeiOptions): Promise<string> {
  const reports = await computeCodeStats(options);
  if (reports.length === 0) {
    return "No supported code files found.";
  }
  if (options.json) {
    return formatJsonReports(reports);
  }
  if (options.markdown) {
    return formatMarkdownTable(reports);
  }
  const summaryTable = formatTokeiTable(reports);
  if (options.showFiles) {
    return `${summaryTable}\n${formatFilesBreakdown(reports)}`;
  }
  return summaryTable;
}
