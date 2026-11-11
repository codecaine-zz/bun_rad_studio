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
/** Removes ANSI escape sequences from `text` so visible character width can be measured accurately. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function visibleWidth(text: string): number {
  const stripped = stripAnsi(text);
  if (typeof Bun !== "undefined" && typeof Bun.stringWidth === "function") {
    return Bun.stringWidth(stripped);
  }
  return stripped.length;
}

// Calculate max width for each column based on headers and rows
/** Computes the maximum visible character width for each column across the header and all data `rows`. */
export function calculateColumnWidths<T>(
  columns: ColumnDef<T>[],
  rows: T[],
): number[] {
  return columns.map((col) => {
    let max = visibleWidth(col.header);
    for (const row of rows) {
      const w = visibleWidth(col.getValue(row));
      if (w > max) max = w;
    }
    return max;
  });
}

// Format a single cell with padding and alignment
/** Pads `text` with spaces to `width` visible characters using left or right alignment. */
export function formatCell(
  text: string,
  width: number,
  align: "left" | "right" = "left",
  precomputedWidth?: number,
): string {
  const visibleLength = precomputedWidth ?? visibleWidth(text);
  const padding = " ".repeat(Math.max(0, width - visibleLength));
  return align === "right" ? `${padding}${text}` : `${text}${padding}`;
}

// Render complete table string
/** Renders `rows` into a newline-separated, column-aligned plain-text table with a header line. */
export function renderTable<T>(columns: ColumnDef<T>[], rows: T[]): string {
  const headerWidths = columns.map((col) => visibleWidth(col.header));
  const widths = [...headerWidths];
  const evaluatedRows: Array<Array<{ raw: string; width: number }>> = new Array(
    rows.length,
  );

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const cells = new Array<{ raw: string; width: number }>(columns.length);
    for (let c = 0; c < columns.length; c++) {
      const raw = columns[c]!.getValue(row);
      const w = visibleWidth(raw);
      if (w > widths[c]!) widths[c] = w;
      cells[c] = { raw, width: w };
    }
    evaluatedRows[r] = cells;
  }

  const headerLine = columns
    .map((col, i) =>
      formatCell(col.header, widths[i]!, col.align, headerWidths[i]!),
    )
    .join("  ");

  const dataLines = evaluatedRows.map((cells) =>
    cells
      .map((cell, i) =>
        formatCell(cell.raw, widths[i]!, columns[i]!.align, cell.width),
      )
      .join("  "),
  );

  return [headerLine, ...dataLines].join("\n");
}
