import { colors } from "../../../shared/colors.ts";

export const { bold, dim, red, green, yellow, blue, magenta, cyan, gray } = colors;

// Doer: Render horizontal terminal progress bar
export function formatProgressBar(current: number, total: number, width = 30): string {
  if (total <= 0) return `[${" ".repeat(width)}] 0%`;
  const pct = Math.min(1, Math.max(0, current / total));
  const filledLen = Math.round(width * pct);
  const emptyLen = width - filledLen;
  const bar = "█".repeat(filledLen) + "░".repeat(emptyLen);
  const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
  return `[${bar}] ${pctStr}`;
}

// Doer: Render compact Unicode sparkline from numeric array
export function renderSparkline(values: number[]): string {
  if (values.length === 0) return "";
  const ticks = [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return values
    .map((v) => {
      if (range === 0) return ticks[3];
      const normalized = (v - min) / range;
      const idx = Math.min(ticks.length - 1, Math.floor(normalized * ticks.length));
      return ticks[idx];
    })
    .join("");
}

export interface BarChartItem {
  label: string;
  value: number;
}

// Doer: Render ASCII/Unicode horizontal bar chart
export function renderBarChart(items: BarChartItem[], maxWidth = 30): string {
  if (items.length === 0) return "";
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const maxLabelLen = Math.max(...items.map((i) => i.label.length), 0);

  return items
    .map((item) => {
      const barLen = Math.round((item.value / maxVal) * maxWidth);
      const bar = "■".repeat(barLen);
      const label = item.label.padEnd(maxLabelLen);
      return `${label} | ${bar} ${item.value}`;
    })
    .join("\n");
}

// Doer: Render numeric gauge meter
export function renderGauge(value: number, min: number, max: number, width = 20): string {
  const clamped = Math.min(max, Math.max(min, value));
  const range = max - min || 1;
  const ratio = (clamped - min) / range;
  const pos = Math.round(ratio * (width - 1));

  const chars: string[] = Array(width).fill("-");
  chars[pos] = "●";
  return `[${chars.join("")}] ${value} (${Math.round(ratio * 100)}%)`;
}

export interface TreeNode {
  name: string;
  children?: TreeNode[];
}

// Doer: Render tree hierarchy lines
function renderSubtree(node: TreeNode, prefix = "", isLast = true): string[] {
  const marker = isLast ? "└── " : "├── ";
  const lines = [`${prefix}${marker}${node.name}`];
  if (node.children && node.children.length > 0) {
    const nextPrefix = prefix + (isLast ? "    " : "│   ");
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i]!;
      const childIsLast = i === node.children.length - 1;
      lines.push(...renderSubtree(child, nextPrefix, childIsLast));
    }
  }
  return lines;
}

// Coordinator: Render visual tree hierarchy
export function renderTree(root: TreeNode): string {
  if (!root.children || root.children.length === 0) return root.name;
  const lines = [root.name];
  for (let i = 0; i < root.children.length; i++) {
    const isLast = i === root.children.length - 1;
    lines.push(...renderSubtree(root.children[i]!, "", isLast));
  }
  return lines.join("\n");
}

// Doer: Strip ANSI escape codes from string using native Bun.stripANSI
export function stripAnsi(text: string): string {
  return Bun.stripANSI(text);
}

// Doer: Calculate visual terminal display width using native Bun.stringWidth
export function stringWidth(text: string): number {
  return Bun.stringWidth(text);
}

// Doer: Slice ANSI styled string preserving styles using native Bun.sliceAnsi
export function sliceAnsi(text: string, start: number, end?: number): string {
  return Bun.sliceAnsi(text, start, end);
}

// Doer: Wrap ANSI styled string to column width using native Bun.wrapAnsi
export function wrapAnsi(text: string, columns: number): string {
  return Bun.wrapAnsi(text, columns);
}

export const cliutils = {
  colors,
  bold,
  dim,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  gray,
  stripAnsi,
  stringWidth,
  sliceAnsi,
  wrapAnsi,
  formatProgressBar,
  progressBar: formatProgressBar,
  renderSparkline,
  sparkline: renderSparkline,
  renderBarChart,
  barChart: renderBarChart,
  renderGauge,
  gauge: renderGauge,
  renderTree,
  tree: renderTree,
};

