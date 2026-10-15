/**
 * Hard limits of the staging import. They exist so a huge or damaged file can never exhaust memory, disk or a database;
 * every limit has a plain-words message (see `limitMessage`). Tests and advanced users may lower them with `setLimits`.
 */
export const limits = {
  /** Largest source file (upload or file on disk). */
  maxFileBytes: 2 * 1024 ** 3,
  /** Most rows one batch may hold. */
  maxRows: 5_000_000,
  maxColumns: 500,
  /** Largest single record (cells of one row together): an unclosed quote shows up here. */
  maxRecordChars: 8 * 1024 * 1024,
  maxPasteChars: 32 * 1024 * 1024,
  /** Rows per multi-row INSERT is also bounded by `maxParams` / column count. */
  batchRows: 1000,
  maxParams: 30000,
  /** Problems collected by one validation run before it asks the person to fix and re-run. */
  maxFindings: 200_000,
  /** Rows shown on one page of the error table / staged rows. */
  pageSize: 100,
  /** Staging tables older than this many days are offered for dropping (never dropped silently). */
  retainDays: 7,
};

export type Limits = typeof limits;

export function setLimits(patch: Partial<Limits>): Limits {
  Object.assign(limits, patch);
  return limits;
}

export function resetLimits(): void {
  Object.assign(limits, {
    maxFileBytes: 2 * 1024 ** 3,
    maxRows: 5_000_000,
    maxColumns: 500,
    maxRecordChars: 8 * 1024 * 1024,
    maxPasteChars: 32 * 1024 * 1024,
    batchRows: 1000,
    maxParams: 30000,
    maxFindings: 200_000,
    pageSize: 100,
    retainDays: 7,
  } satisfies Limits);
}

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

export function limitMessage(kind: "file" | "rows" | "columns" | "record" | "paste"): string {
  switch (kind) {
    case "file":
      return `That file is bigger than the ${limits.maxFileBytes >= 1024 ** 3 ? (limits.maxFileBytes / 1024 ** 3).toFixed(0) + " GB" : mb(limits.maxFileBytes)} limit. Split it into smaller files and load them one after another.`;
    case "rows":
      return `This file has more than ${limits.maxRows.toLocaleString("en-US")} rows, which is the most one import can hold. Split it into smaller files and load them one after another.`;
    case "columns":
      return `This file has more than ${limits.maxColumns} columns, which is more than an import can handle.`;
    case "record":
      return `One row is bigger than ${mb(limits.maxRecordChars)}. This usually means a quote was opened and never closed. Check the quote setting or the file.`;
    case "paste":
      return `Pasted text is limited to ${mb(limits.maxPasteChars)}. Save it as a file and choose the file instead.`;
  }
}

/** An error whose message is already written for a person. */
export class StagingError extends Error {
  constructor(
    message: string,
    readonly code: string = "BAD_REQUEST",
    readonly status: number = 400,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "StagingError";
  }
}
