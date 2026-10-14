/**
 * Runs the Find tool's heavy jobs off the server's main thread (a search over a big folder is synchronous and
 * would freeze every other request, including the terminal). One job per worker; the server ends the worker
 * when the job is done or has taken too long.
 */
import { createHash } from "crypto";
import * as fs from "fs";
import * as nodePath from "path";
import { executeFdSearch } from "../../../applications/fd_engine";
import { findDuplicates, largestFiles, planBatchRename, searchContents, sizeByExtension } from "../../../applications/fd_ops";
import { packTarGz, type TarEntry } from "../rad/modules/tarutils";
import { validateName, type Platform } from "./fmPaths";
import { DUPE_MAX_FILE_BYTES, toFindItem, type SearchOutcome, type TarOutcome, type WorkerJob } from "./fmFindShared";

class JobError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function search(job: Extract<WorkerJob, { kind: "search" }>): SearchOutcome {
  const { options } = job;
  let patternFallback = false;
  if ((options.searchMode ?? "regex") === "regex" && options.pattern) {
    try {
      new RegExp(options.pattern);
    } catch {
      patternFallback = true;
    }
  }
  const r = executeFdSearch(options);
  return {
    items: r.items.map(toFindItem),
    totalScanned: r.totalScanned,
    matchedCount: r.matchedCount,
    durationMs: r.durationMs,
    totalSizeBytes: r.totalSizeBytes,
    truncated: r.truncated,
    patternFallback,
  };
}

/** The analysis jobs look at real files only: the engines follow links, which would count a file twice (once as itself, once as its link). */
function realFiles(paths: string[]): string[] {
  return paths.filter((p) => {
    try {
      return !fs.lstatSync(p).isSymbolicLink();
    } catch {
      return false;
    }
  });
}

function grep(job: Extract<WorkerJob, { kind: "grep" }>) {
  if (job.regex) {
    try {
      new RegExp(job.query);
    } catch (err: any) {
      throw new JobError("BAD_PATTERN", `That isn't a valid pattern (${String(err?.message ?? err).replace(/^Invalid regular expression: /, "")}). Turn off "Regex" to search for it as plain text.`);
    }
  }
  return searchContents(realFiles(job.paths), job.query, { regex: job.regex, caseSensitive: job.matchCase, maxMatches: job.maxMatches });
}

function dupes(job: Extract<WorkerJob, { kind: "dupes" }>) {
  // The finder reads each candidate whole, so very big files are left out rather than risk running out of memory.
  let skippedTooBig = 0;
  const paths: string[] = [];
  for (const p of realFiles(job.paths)) {
    try {
      const st = fs.statSync(p);
      if (st.isFile() && st.size > DUPE_MAX_FILE_BYTES) skippedTooBig++;
      else paths.push(p);
    } catch {
      // gone: ignore
    }
  }
  const r = findDuplicates(paths, job.minBytes);
  return { totalGroups: r.groups.length, groups: r.groups.slice(0, 500), wastedBytes: r.wastedBytes, skippedTooBig };
}

function hash(job: Extract<WorkerJob, { kind: "hash" }>): Promise<{ sha256: string; size: number }> {
  return new Promise((resolve, reject) => {
    const hasher = createHash("sha256");
    let size = 0;
    const stream = fs.createReadStream(job.path);
    stream.on("data", (chunk) => {
      size += (chunk as Buffer).length;
      hasher.update(chunk as Buffer);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve({ sha256: hasher.digest("hex"), size }));
  });
}

function renamePlan(job: Extract<WorkerJob, { kind: "renameplan" }>) {
  let rows;
  try {
    rows = planBatchRename(job.paths, job.rules);
  } catch (err: any) {
    throw new JobError("BAD_PATTERN", `${String(err?.message ?? err).replace(/^Invalid pattern: (Invalid regular expression: )?/, "That isn't a valid pattern: ")}. Turn off "Regex" to use the text as it is.`);
  }
  const platform = job.platform as Platform;
  const insensitive = platform !== "linux";
  const seen = new Map<string, number>();
  const key = (to: string) => (insensitive ? to.toLowerCase() : to);
  for (const row of rows) {
    if (row.from === row.to) continue;
        // A change of letter case only ("a.txt" to "A.txt") is the same file on a case-insensitive disk, not a clash.
    if (row.error === "A file with that name already exists." && insensitive && key(row.from) === key(row.to)) row.error = undefined;
    if (!row.error && row.newName !== row.newName.trim()) row.error = "A name can't start or end with a space.";
    if (!row.error) {
      const reason = validateName(row.newName, platform);
      if (reason) row.error = reason;
    }
    if (!row.error) {
      const k = key(row.to);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  if (insensitive) {
    for (const row of rows) if (!row.error && row.from !== row.to && (seen.get(key(row.to)) ?? 0) > 1) row.error = "Duplicate target name in this batch.";
  }
  return rows.map((r) => ({ from: r.from, to: r.to, oldName: r.oldName, newName: r.newName, changed: r.from !== r.to, ...(r.error ? { error: r.error } : {}) }));
}

function tar(job: Extract<WorkerJob, { kind: "tar" }>): TarOutcome {
  const entries: TarEntry[] = [];
  let files = 0;
  let folders = 0;
  let bytes = 0;
  let skipped = 0;
  const walk = (abs: string) => {
    if (abs === job.dest) return;
    let st: fs.Stats;
    try {
      st = fs.lstatSync(abs);
    } catch {
      skipped++;
      return;
    }
    const name = nodePath.relative(job.base, abs).split(nodePath.sep).join("/");
    if (!name || name.startsWith("..")) {
      skipped++;
      return;
    }
    if (st.isSymbolicLink()) {
      skipped++;
    } else if (st.isDirectory()) {
      entries.push({ name: `${name}/`, data: "", type: "directory", mode: st.mode & 0o777, mtime: st.mtime });
      folders++;
      let children: string[];
      try {
        children = fs.readdirSync(abs).sort();
      } catch {
        skipped++;
        return;
      }
      for (const child of children) walk(nodePath.join(abs, child));
    } else if (st.isFile()) {
      bytes += st.size;
      if (bytes > job.maxBytes) throw new JobError("TOO_BIG", `These items add up to more than ${Math.round(job.maxBytes / 1024 / 1024)} MB, which is too much for one .tar.gz here. Use a zip file instead, or archive fewer items.`);
      let data: Buffer;
      try {
        data = fs.readFileSync(abs);
      } catch {
        skipped++;
        bytes -= st.size;
        return;
      }
      entries.push({ name, data, mode: st.mode & 0o777, mtime: st.mtime, type: "file" });
      files++;
    } else {
      skipped++;
    }
    if (entries.length > 100_000) throw new JobError("TOO_MANY", "That's too many items for one archive (the limit is 100,000).");
  };
  for (const p of job.paths) walk(p);
  if (files + folders === 0) throw new JobError("NOTHING_TO_DO", "There's nothing to archive: the items are links or can't be read.");
  fs.writeFileSync(job.dest, packTarGz(entries), { flag: "wx" });
  return { dest: job.dest, files, folders, bytes, skipped };
}

async function run(job: WorkerJob): Promise<unknown> {
  switch (job.kind) {
    case "search": return search(job);
    case "grep": return grep(job);
    case "dupes": return dupes(job);
    case "largest": return largestFiles(realFiles(job.paths), job.count);
    case "extstats": return sizeByExtension(realFiles(job.paths));
    case "hash": return await hash(job);
    case "renameplan": return renamePlan(job);
    case "tar": return tar(job);
    case "spin": {
      const end = Date.now() + job.ms;
      while (Date.now() < end) {
        // busy on purpose
      }
      return { spun: true };
    }
  }
}

const g = globalThis as any;
g.onmessage = async (e: MessageEvent) => {
  try {
    g.postMessage({ ok: true, result: await run(e.data as WorkerJob) });
  } catch (err: any) {
    g.postMessage({ ok: false, code: typeof err?.code === "string" ? err.code : "UNKNOWN", message: String(err?.message ?? err) });
  }
};
