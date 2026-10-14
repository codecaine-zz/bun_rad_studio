/**
 * Git summary for the Dev tab. Read only: every command here only reads (rev-parse, status, log, rev-list, remote,
 * shortlog, tag, ls-tree), through the same safe runner as the Code tab (an argument list, no shell, a time limit
 * and an output limit). Credentials in remote URLs are removed before anything is shown.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { tick } from "./fmCore";
import { parseStatus, runGit } from "./fmCodeGit";

export interface GitSummary {
  available: boolean;
  isRepo: boolean;
  message?: string;
  toplevel?: string;
  /** True when the chosen folder is inside the repository rather than its top. */
  subfolder?: boolean;
  branch?: string;
  detached?: boolean;
  upstream?: string | null;
  ahead?: number;
  behind?: number;
  changed?: number;
  untracked?: number;
  staged?: number;
  commitCount?: number;
  lastCommit?: { hash: string; author: string; date: string; subject: string } | null;
  firstCommitDate?: string | null;
  remotes?: Array<{ name: string; url: string }>;
  contributors?: Array<{ name: string; commits: number }>;
  contributorCount?: number;
  perMonth?: Array<{ month: string; commits: number }>;
  tags?: { count: number; latest: string[] };
  gitDirBytes?: number | null;
  gitDirNote?: string;
  biggestFiles?: Array<{ path: string; bytes: number }>;
  biggestTruncated?: boolean;
}

/** `https://user:token@host/x` and `ssh://user:pw@host/x` lose the user and password; `git@host:x` is left as it is (no secret in it). */
export function stripCredentials(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, "$1");
}

const SEP = "\x1f";

function monthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

async function folderBytes(dir: string, cap = 60_000): Promise<number | null> {
  let total = 0;
  let seen = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let entries;
    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (++seen > cap) return null;
      const p = nodePath.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) total += (await fsp.lstat(p).catch(() => null))?.size ?? 0;
    }
    if (seen % 2000 < 50) await tick();
  }
  return total;
}

export async function gitSummary(root: string, now = new Date()): Promise<GitSummary> {
  const top = await runGit(root, ["rev-parse", "--show-toplevel"], 6000);
  if (top.missing) return { available: false, isRepo: false, message: "Git isn't installed (or isn't on your PATH), so there is no Git summary." };
  if (!top.ok || !top.stdout.trim()) return { available: true, isRepo: false, message: "This folder isn't inside a Git repository." };
  const toplevel = top.stdout.trim();
  const realRoot = await fsp.realpath(root).catch(() => root);
  const out: GitSummary = { available: true, isRepo: true, toplevel, subfolder: nodePath.resolve(toplevel) !== nodePath.resolve(realRoot) };
  const first = monthKeys(now, 12)[0]!;
  const [status, count, last, roots, remotes, shortlog, months, tags, tree, up] = await Promise.all([
    runGit(root, ["status", "--porcelain=v1", "-b", "--untracked-files=normal"], 15000),
    runGit(root, ["rev-list", "--count", "HEAD"], 15000),
    runGit(root, ["log", "-1", `--format=%H${SEP}%an${SEP}%aI${SEP}%s`], 8000),
    runGit(root, ["rev-list", "--max-parents=0", "HEAD"], 8000),
    runGit(root, ["remote", "-v"], 6000),
    runGit(root, ["shortlog", "-sn", "HEAD"], 15000),
    runGit(root, ["log", `--since=${first}-01`, "--date=format:%Y-%m", "--format=%ad"], 15000),
    runGit(root, ["tag", "--sort=-creatordate"], 8000),
    runGit(toplevel, ["ls-tree", "-r", "-l", "-z", "HEAD"], 20000),
    runGit(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], 6000),
  ]);
  if (status.ok) {
    const parsed = parseStatus(status.stdout);
    out.branch = parsed.branch;
    out.detached = /HEAD \(no branch\)|^HEAD$/.test(parsed.branch);
    out.ahead = parsed.ahead;
    out.behind = parsed.behind;
    out.untracked = parsed.files.filter((f) => f.x === "?").length;
    out.staged = parsed.files.filter((f) => f.x !== "?" && f.x !== " " && f.x !== "!").length;
    out.changed = parsed.files.filter((f) => f.x !== "?").length;
  }
  out.upstream = up.ok && up.stdout.trim() ? up.stdout.trim() : null;
  if (count.ok) out.commitCount = Number(count.stdout.trim()) || 0;
  const l = last.ok ? last.stdout.trim().split(SEP) : [];
  out.lastCommit = l.length === 4 ? { hash: l[0]!.slice(0, 12), author: l[1]!, date: l[2]!, subject: l[3]!.slice(0, 200) } : null;
  if (roots.ok && roots.stdout.trim()) {
    const dates = await Promise.all(roots.stdout.trim().split("\n").slice(0, 5).map((h) => runGit(root, ["show", "-s", "--format=%aI", h.trim()], 6000)));
    const times = dates.filter((d) => d.ok).map((d) => d.stdout.trim()).filter(Boolean).sort();
    out.firstCommitDate = times[0] ?? null;
  } else out.firstCommitDate = null;
  const seen = new Map<string, string>();
  for (const line of remotes.ok ? remotes.stdout.split("\n") : []) {
    const m = /^(\S+)\t(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
    if (m && !seen.has(m[1]!)) seen.set(m[1]!, stripCredentials(m[2]!));
  }
  out.remotes = [...seen].map(([name, url]) => ({ name, url }));
  const people = (shortlog.ok ? shortlog.stdout.split("\n") : []).map((s) => /^\s*(\d+)\s+(.+)$/.exec(s)).filter((m): m is RegExpExecArray => !!m).map((m) => ({ name: m[2]!, commits: Number(m[1]) }));
  out.contributorCount = people.length;
  out.contributors = people.slice(0, 10);
  const keys = monthKeys(now, 12);
  const perMonth = new Map(keys.map((k) => [k, 0]));
  for (const key of months.ok ? months.stdout.split("\n") : []) if (perMonth.has(key.trim())) perMonth.set(key.trim(), perMonth.get(key.trim())! + 1);
  out.perMonth = keys.map((month) => ({ month, commits: perMonth.get(month)! }));
  const tagList = tags.ok ? tags.stdout.split("\n").map((t) => t.trim()).filter(Boolean) : [];
  out.tags = { count: tagList.length, latest: tagList.slice(0, 10) };
  const files: Array<{ path: string; bytes: number }> = [];
  for (const rec of tree.ok ? tree.stdout.split("\0") : []) {
    const m = /^\d+ blob \w+\s+(\d+)\t([\s\S]+)$/.exec(rec);
    if (m) files.push({ path: m[2]!, bytes: Number(m[1]) });
  }
  out.biggestFiles = files.sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  out.biggestTruncated = tree.truncated;
  const gitDir = nodePath.join(toplevel, ".git");
  const st = await fsp.lstat(gitDir).catch(() => null);
  if (st?.isDirectory()) {
    out.gitDirBytes = await folderBytes(gitDir);
    if (out.gitDirBytes === null) out.gitDirNote = "The .git folder is too big to measure here.";
  } else {
    out.gitDirBytes = null;
    out.gitDirNote = "This is a linked worktree or submodule: its history is stored elsewhere.";
  }
  return out;
}
