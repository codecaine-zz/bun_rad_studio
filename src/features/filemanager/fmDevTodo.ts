/**
 * TODO / FIXME scanner for the Dev tab: finds marker words (TODO, FIXME, HACK, XXX, BUG, NOTE by default) in the
 * text files of a folder. Respects .gitignore, skips binary and very big files, and never reads outside the folder.
 */
import { setProgress, type DevJob } from "./fmDevJobs";
import { languageForName } from "./fmDevLangs";
import { decodeText, looksBinary, readRegularFile } from "./fmDevRead";
import { walkFiles, type WalkLimits } from "./fmDevWalk";
import { FmError } from "./fmPaths";

export const DEFAULT_TAGS = ["TODO", "FIXME", "HACK", "XXX", "BUG", "NOTE"];
export const MAX_TAGS = 12;
export const MAX_TODO_ITEMS = 5000;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_LINE = 400;
const SKIP_NAMES = /(^|\.)(min\.(js|css)|lock)$|^(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Cargo\.lock|go\.sum)$/i;

export interface TodoItem {
  path: string;
  line: number;
  tag: string;
  text: string;
}

export interface TodoReport {
  root: string;
  tags: string[];
  items: TodoItem[];
  counts: Record<string, number>;
  filesWithHits: number;
  filesScanned: number;
  truncated: boolean;
  stoppedBy: string | null;
  elapsedMs: number;
}

export function parseTags(input: unknown): string[] {
  if (input === undefined) return DEFAULT_TAGS;
  if (!Array.isArray(input)) throw new FmError("BAD_TAGS", "The marker words must be a list.");
  const tags = [...new Set(input.filter((t): t is string => typeof t === "string").map((t) => t.trim().toUpperCase()))];
  if (!tags.length) throw new FmError("BAD_TAGS", "Give at least one marker word, like TODO.");
  if (tags.length > MAX_TAGS || tags.some((t) => !/^[A-Z][A-Z0-9_]{1,15}$/.test(t))) throw new FmError("BAD_TAGS", `Marker words are 2 to 16 letters, digits or _ (at most ${MAX_TAGS} of them).`);
  return tags;
}

/** The markers on one line, in order. A marker is a whole upper-case word that is not in quotes (so a list like ["TODO"] isn't a hit). */
export function findMarkers(line: string, pattern: RegExp): Array<{ tag: string; text: string }> {
  if (line.length > MAX_LINE * 4) return [];
  const re = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  const out: Array<{ tag: string; text: string }> = [];
  re.lastIndex = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const before = line[m.index - 1];
    const after = line[m.index + m[0].length];
    if (before === '"' || before === "'" || before === "`" || after === '"' || after === "'" || after === "`") continue;
    out.push({ tag: m[1]!, text: line.slice(m.index).replace(/\s*(\*\/|-->|--}|\|#)\s*$/, "").trim().slice(0, 240) });
    break;
  }
  return out;
}

export async function runTodo(job: DevJob, o: { tags: string[]; respectGitignore: boolean; hidden: boolean; vendored: boolean; excludes: string[]; limits?: Partial<WalkLimits> }): Promise<TodoReport> {
  const started = Date.now();
  const re = new RegExp(`(?<![A-Za-z0-9_])(${o.tags.join("|")})(?![A-Za-z0-9_])`, "g");
  const items: TodoItem[] = [];
  const counts: Record<string, number> = Object.fromEntries(o.tags.map((t) => [t, 0]));
  let withHits = 0;
  let scanned = 0;
  let truncated = false;
  const report = await walkFiles(job.root, { respectIgnore: o.respectGitignore, hidden: o.hidden, vendored: o.vendored, excludes: o.excludes, ...o.limits }, job, async (batch, rep) => {
    for (const f of batch) {
      if (job.cancelled) return;
      if (SKIP_NAMES.test(f.name) || !languageForName(f.name) || /^\.env/i.test(f.name)) continue;
      const read = await readRegularFile(f.abs, MAX_FILE_BYTES);
      if (read.kind !== "ok" || looksBinary(read.buf)) continue;
      scanned++;
      const lines = decodeText(read.buf).split("\n");
      let hit = false;
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i]!;
        if (!/[A-Z]/.test(text)) continue;
        for (const found of findMarkers(text, re)) {
          hit = true;
          counts[found.tag] = (counts[found.tag] ?? 0) + 1;
          if (items.length < MAX_TODO_ITEMS) items.push({ path: f.rel, line: i + 1, tag: found.tag, text: found.text });
          else truncated = true;
        }
      }
      if (hit) withHits++;
    }
    setProgress(job, { files: rep.files, found: items.length });
  });
  return { root: job.root, tags: o.tags, items, counts, filesWithHits: withHits, filesScanned: scanned, truncated, stoppedBy: report.stoppedBy, elapsedMs: Date.now() - started };
}
