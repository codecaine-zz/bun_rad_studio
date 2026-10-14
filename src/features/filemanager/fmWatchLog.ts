/**
 * The log of one watcher: its output cleaned of terminal colours, kept in a capped buffer whose cursor only ever
 * grows, so the page can ask for "everything since where I was".
 */

export const MAX_LOG_CHARS = 1_000_000;

/** Removes colours and other terminal escape sequences, and makes line endings plain. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?<=>!]*[ -\/]*[@-~]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

const UNFINISHED_TAIL = /(?:\x1b(?:\[[0-9;?<=>!]*[ -\/]*|\][^\x07\x1b]*)?|\r)$/;

/** Turns the bytes of one output pipe into clean text; escape sequences and characters split between chunks are held back. */
export function createTextCleaner(): (bytes: Uint8Array | null, final?: boolean) => string {
  const decoder = new TextDecoder();
  let pending = "";
  return (bytes, final = false) => {
    let text = pending + (bytes ? decoder.decode(bytes, { stream: !final }) : final ? decoder.decode() : "");
    pending = "";
    if (!final) {
      const tail = UNFINISHED_TAIL.exec(text);
      if (tail && tail[0].length < 4096) {
        pending = tail[0];
        text = text.slice(0, tail.index);
      }
    }
    return stripAnsi(text);
  };
}

export class LogBuffer {
  private text = "";
  private base = 0;
  /** Changes whenever the log is cleared, so a reader knows its copy is out of date. */
  epoch = 0;

  constructor(private readonly cap = MAX_LOG_CHARS) {}

  /** Position after the last character ever written (characters dropped or cleared still count). */
  get cursor(): number {
    return this.base + this.text.length;
  }

  get length(): number {
    return this.text.length;
  }

  append(text: string): void {
    if (!text) return;
    this.text += text;
    if (this.text.length > this.cap) {
      const drop = this.text.length - this.cap;
      this.text = this.text.slice(drop);
      this.base += drop;
    }
  }

  clear(): void {
    this.base = this.cursor;
    this.text = "";
    this.epoch++;
  }

  /** What was written since `since`. `reset` means "replace your copy with `log`" (first read, cleared, or older text was dropped). */
  read(since: unknown, epoch: unknown): { log: string; cursor: number; epoch: number; reset: boolean } {
    const known = typeof since === "number" && Number.isFinite(since) && (epoch === undefined || epoch === this.epoch);
    if (!known || since < this.base || since > this.cursor) return { log: this.text, cursor: this.cursor, epoch: this.epoch, reset: true };
    return { log: this.text.slice(since - this.base), cursor: this.cursor, epoch: this.epoch, reset: false };
  }

  snapshot(): { text: string; truncated: boolean } {
    return { text: this.text, truncated: this.base > 0 };
  }
}
