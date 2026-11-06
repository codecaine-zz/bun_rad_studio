/**
 * Plain-text column-aligned table formatter with ANSI escape code width compensation.
 */
// Plain text column-aligned table formatter

/** Column specification for rendering a typed row `T` in a plain-text CLI table. */
export interface ColumnDef<T> {
  header: string;
  align?: "left" | "right";
  getValue: (row: T) => string;
}

// Strip ANSI codes when calculating visible width
/** Removes ANSI SGR escape sequences from `text` so visible character width can be measured accurately. */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// Calculate max width for each column based on headers and rows
/** Computes the maximum visible character width for each column across the header and all data `rows`. */
export function calculateColumnWidths<T>(
  columns: ColumnDef<T>[],
  rows: T[]
): number[] {
  return columns.map((col) => {
    let max = stripAnsi(col.header).length;
    for (const row of rows) {
      const val = stripAnsi(col.getValue(row));
      if (val.length > max) max = val.length;
    }
    return max;
  });
}

// Format a single cell with padding and alignment
/** Pads `text` with spaces to `width` visible characters using left or right alignment. */
export function formatCell(
  text: string,
  width: number,
  align: "left" | "right" = "left"
): string {
  const visibleLength = stripAnsi(text).length;
  const padding = " ".repeat(Math.max(0, width - visibleLength));
  return align === "right" ? `${padding}${text}` : `${text}${padding}`;
}

// Render complete table string
/** Renders `rows` into a newline-separated, column-aligned plain-text table with a header line. */
export function renderTable<T>(columns: ColumnDef<T>[], rows: T[]): string {
  const widths = calculateColumnWidths(columns, rows);
  const headerLine = columns
    .map((col, i) => formatCell(col.header, widths[i]!, col.align))
    .join("  ");

  const dataLines = rows.map((row) =>
    columns
      .map((col, i) => formatCell(col.getValue(row), widths[i]!, col.align))
      .join("  ")
  );

  return [headerLine, ...dataLines].join("\n");
}
