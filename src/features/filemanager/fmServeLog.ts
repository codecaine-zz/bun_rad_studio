/** A short log kept in memory: the newest lines of a server's output, capped by line count and by total size. */

/** Default maximum number of log lines retained in memory by a `RingLog`. */
export const LOG_MAX_LINES = 500;
/** Default maximum total character count retained in memory by a `RingLog`. */
export const LOG_MAX_CHARS = 256 * 1024;
const MAX_LINE = 2000;

/** A single numbered, timestamped line in a server's ring log. */
export interface LogLine {
  n: number;
  t: number;
  text: string;
}

/** Bounded in-memory ring buffer of log lines capped by both line count and total character length. */
export class RingLog {
  private lines: LogLine[] = [];
  private chars = 0;
  private counter = 0;
  private partial = "";

  /** Creates a new `RingLog` bounded by `maxLines` and `maxChars`. */
  constructor(private maxLines = LOG_MAX_LINES, private maxChars = LOG_MAX_CHARS) {}

  /** Adds one line (never split). */
  add(text: string): void {
    const clean = text.replace(/\r/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "?");
    const line = clean.length > MAX_LINE ? `${clean.slice(0, MAX_LINE)}…` : clean;
    this.lines.push({ n: ++this.counter, t: Date.now(), text: line });
    this.chars += line.length + 1;
    while (this.lines.length > this.maxLines || (this.chars > this.maxChars && this.lines.length > 1)) this.chars -= this.lines.shift()!.text.length + 1;
  }

  /** Adds raw program output of any chunking: complete lines are added, the unfinished end waits for the next chunk. */
  write(chunk: string): void {
    const text = this.partial + chunk;
    const parts = text.split("\n");
    this.partial = parts.pop() ?? "";
    if (this.partial.length > MAX_LINE * 4) {
      parts.push(this.partial);
      this.partial = "";
    }
    for (const p of parts) this.add(p);
  }

  /** Adds an unfinished last line (when the program has ended). */
  flush(): void {
    if (this.partial) this.add(this.partial);
    this.partial = "";
  }

  /** The lines after `since` (a line number from an earlier answer), and the number to ask from next time. */
  read(since?: number): { lines: LogLine[]; cursor: number; dropped: boolean } {
    const from = typeof since === "number" && Number.isFinite(since) ? since : 0;
    const first = this.lines[0]?.n ?? this.counter + 1;
    return { lines: this.lines.filter((l) => l.n > from), cursor: this.counter, dropped: from > 0 && from + 1 < first };
  }

  /** Removes all retained lines from the log buffer while keeping the line counter monotonic. */
  clear(): void {
    this.lines = [];
    this.chars = 0;
  }

  /** Number of lines currently held in the ring buffer. */
  get size(): number {
    return this.lines.length;
  }

  /** Total character count currently held across all lines in the ring buffer. */
  get totalChars(): number {
    return this.chars;
  }
}
