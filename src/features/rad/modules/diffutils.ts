import { colors } from "../../../shared/colors.ts";

export interface DiffChange {
  type: "add" | "delete" | "equal";
  line: string;
}

// Coordinator: Calculate line-level diff between two text strings using LCS
export function diffLines(oldText: string, newText: string): DiffChange[] {
  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const n = oldLines.length;
  const m = newLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1]![j + 1] = dp[i]![j]! + 1;
      } else {
        dp[i + 1]![j + 1] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      }
    }
  }

  const changes: DiffChange[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      changes.unshift({ type: "equal", line: oldLines[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      changes.unshift({ type: "add", line: newLines[j - 1]! });
      j--;
    } else if (i > 0 && (j === 0 || dp[i]![j - 1]! < dp[i - 1]![j]!)) {
      changes.unshift({ type: "delete", line: oldLines[i - 1]! });
      i--;
    }
  }

  return changes;
}

// Coordinator: Generate standard Git-style unified diff
export function unifiedDiff(oldText: string, newText: string, filename = "file.txt"): string {
  const changes = diffLines(oldText, newText);
  const header = `--- a/${filename}\n+++ b/${filename}`;
  const diffBody = changes
    .map((c) => {
      if (c.type === "add") return `+${c.line}`;
      if (c.type === "delete") return `-${c.line}`;
      return ` ${c.line}`;
    })
    .join("\n");

  return `${header}\n@@ -1,${oldText.split(/\r?\n/).length} +1,${newText.split(/\r?\n/).length} @@\n${diffBody}`;
}

// Doer: Render colored diff output for terminal viewing
export function renderColoredDiff(diffText: string): string {
  const lines = diffText.split(/\r?\n/);
  return lines
    .map((line) => {
      if (line.startsWith("---") || line.startsWith("+++")) return colors.bold(line);
      if (line.startsWith("@@")) return colors.cyan(line);
      if (line.startsWith("+")) return colors.green(line);
      if (line.startsWith("-")) return colors.red(line);
      return colors.gray(line);
    })
    .join("\n");
}

export const diffutils = {
  diffLines,
  unifiedDiff,
  renderColoredDiff,
};
