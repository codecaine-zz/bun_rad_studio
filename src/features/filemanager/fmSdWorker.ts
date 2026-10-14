/**
 * Runs the Replace tool's heavy jobs off the server's main thread: a pattern can take a very long time on the
 * wrong text, and the server (and so the terminal) must keep answering. The server ends this worker when the job
 * is done or has taken too long. Nothing here writes to disk: it only reads, matches and prepares the new text.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import * as nodePath from "path";
import { isLikelyBinary, parseExtList, passesFileFilter, SD_MAX_FILE_BYTES } from "../../sd_helpers";
import { unifiedDiff } from "./fmSdDiff";
import {
  SD_DEFAULT_EXCLUDES, SD_DIFF_BUDGET, SD_DIFF_LIMITS, SD_MAX_FILES, SD_MAX_REPLACEMENTS, compileSpec, rewriteText,
  type SdFileResult, type SdFilter, type SdJob, type SdScanOutcome, type SdSkipped, type SdTransformOutcome,
} from "./fmSdShared";
import { FmError } from "./fmPaths";

type Loaded =
  | { ok: true; text: string; hash: string; size: number; bytes: Buffer; bom: boolean }
  | { ok: false; why: keyof SdSkipped };

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const decoder = new TextDecoder("utf-8", { fatal: true });

/** Reads a file as text, or says why it must be left alone: a link, too big, binary, not UTF-8, unreadable. */
function load(path: string): Loaded {
  try {
    const st = fs.lstatSync(path);
    if (st.isSymbolicLink()) return { ok: false, why: "links" };
    if (!st.isFile()) return { ok: false, why: "unreadable" };
    if (st.size > SD_MAX_FILE_BYTES) return { ok: false, why: "large" };
    const bytes = fs.readFileSync(path);
    if (bytes.length > SD_MAX_FILE_BYTES) return { ok: false, why: "large" };
    if (bytes.includes(0) || isLikelyBinary(bytes)) return { ok: false, why: "binary" };
    let text: string;
    try {
      text = decoder.decode(bytes);
    } catch {
      return { ok: false, why: "notText" };
    }
    return { ok: true, text, bytes, size: bytes.length, bom: bytes.subarray(0, 3).equals(BOM), hash: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    return { ok: false, why: "unreadable" };
  }
}

/** The files to look at, in a steady order. Links are never followed; the walk stops at SD_MAX_FILES. */
function* candidates(targets: string[], filter: SdFilter, skipped: SdSkipped): Generator<string> {
  const exts = filter.exts.length ? filter.exts : undefined;
  const fileOk = (p: string) => passesFileFilter(p, { exts, exclude: filter.exclude });
  const dirOk = (p: string) => passesFileFilter(p, { exclude: filter.exclude });
  const seen = new Set<string>();
  const stack: string[] = [...targets].reverse();
  while (stack.length) {
    const p = stack.pop()!;
    let st: fs.Stats;
    try {
      st = fs.lstatSync(p);
    } catch {
      skipped.unreadable++;
      continue;
    }
    if (st.isSymbolicLink()) {
      skipped.links++;
    } else if (st.isFile()) {
      if (!seen.has(p) && fileOk(p)) {
        seen.add(p);
        yield p;
      }
    } else if (st.isDirectory()) {
      let names: string[];
      try {
        names = fs.readdirSync(p).sort();
      } catch {
        skipped.unreadable++;
        continue;
      }
      for (let i = names.length - 1; i >= 0; i--) {
        const name = names[i]!;
        if (!filter.hidden && name.startsWith(".")) continue;
        const child = nodePath.join(p, name);
        let kind: "dir" | "other" | "link" = "other";
        try {
          const cst = fs.lstatSync(child);
          kind = cst.isSymbolicLink() ? "link" : cst.isDirectory() ? "dir" : "other";
        } catch {
          skipped.unreadable++;
          continue;
        }
        if (kind === "link") skipped.links++;
        else if (kind === "dir" && ((filter.defaultExcludes && SD_DEFAULT_EXCLUDES.includes(name)) || !dirOk(child))) continue;
        else stack.push(child);
      }
    }
  }
}

function scan(job: Extract<SdJob, { kind: "scan" }>): SdScanOutcome {
  const c = compileSpec(job.spec);
  const skipped: SdSkipped = { binary: 0, large: 0, notText: 0, unreadable: 0, links: 0 };
  const budget = { left: SD_MAX_REPLACEMENTS };
  const files: SdFileResult[] = [];
  let filesScanned = 0;
  let filesCapped = false;
  let replacementsCapped = false;
  let diffChars = 0;
  const filter: SdFilter = { ...job.filter, exts: parseExtList(job.filter.exts.join(",")) };
  for (const path of candidates(job.targets, filter, skipped)) {
    if (filesScanned >= SD_MAX_FILES) {
      filesCapped = true;
      break;
    }
    const f = load(path);
    if (!f.ok) {
      skipped[f.why]++;
      continue;
    }
    filesScanned++;
    const r = rewriteText(f.text, c, budget, job.mode === "count");
    if (r.capped) {
      replacementsCapped = true;
      break;
    }
    if (r.matches === 0) continue;
    const changed = r.final !== f.text;
    const row: SdFileResult = { path, matches: r.matches, changed, hunks: 0, added: 0, removed: 0, size: f.size, hash: f.hash, diff: "", diffTruncated: false };
    if (job.mode === "preview" && changed) {
      const d = unifiedDiff(path, r.before, r.after, SD_DIFF_LIMITS);
      row.hunks = d.hunks;
      row.added = d.added;
      row.removed = d.removed;
      if (diffChars + d.text.length <= SD_DIFF_BUDGET) {
        row.diff = d.text;
        row.diffTruncated = d.truncated;
        diffChars += d.text.length;
      } else {
        row.diffTruncated = true;
      }
    }
    files.push(row);
  }
  return { files, filesScanned, replacements: SD_MAX_REPLACEMENTS - budget.left, skipped, filesCapped, replacementsCapped };
}

/** Prepares the new content of the chosen files, but only for files that still have the content that was previewed. */
function transform(job: Extract<SdJob, { kind: "transform" }>): SdTransformOutcome {
  const c = compileSpec(job.spec);
  const budget = { left: SD_MAX_REPLACEMENTS };
  const items: SdTransformOutcome["items"] = [];
  let bytes = 0;
  let replacementsCapped = false;
  for (const { path, hash } of job.files) {
    const f = load(path);
    if (!f.ok) {
      items.push({ path, status: "unreadable", replacements: 0 });
      continue;
    }
    if (f.hash !== hash) {
      items.push({ path, status: "changed", replacements: 0 });
      continue;
    }
    const r = rewriteText(f.text, c, budget);
    if (r.capped) {
      replacementsCapped = true;
      break;
    }
    if (r.final === f.text) {
      items.push({ path, status: "unchanged", replacements: r.matches });
      continue;
    }
    const body = Buffer.from(r.final, "utf8");
    const updated = f.bom ? Buffer.concat([BOM, body]) : body;
    bytes += f.bytes.length + updated.length;
    if (bytes > job.maxBytes) throw new FmError("TOO_BIG", `These files add up to more than ${Math.round(job.maxBytes / 1024 / 1024)} MB, which is too much to change (and keep an undo copy of) in one go. Tick fewer files.`);
    items.push({ path, status: "ok", replacements: r.matches, original: f.bytes, updated });
  }
  return { items, replacementsCapped };
}

function run(job: SdJob): unknown {
  switch (job.kind) {
    case "scan": return scan(job);
    case "transform": return transform(job);
    case "spin": {
      const end = Date.now() + job.ms;
      while (Date.now() < end) {
        // busy on purpose (tests)
      }
      return { spun: true };
    }
  }
}

const g = globalThis as any;
g.onmessage = (e: MessageEvent) => {
  try {
    g.postMessage({ ok: true, result: run(e.data as SdJob) });
  } catch (err: any) {
    g.postMessage({ ok: false, code: typeof err?.code === "string" ? err.code : "UNKNOWN", message: String(err?.message ?? err) });
  }
};
