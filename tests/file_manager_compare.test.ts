/**
 * Folder comparison and the selective one-way copy: the five groups, quick versus verified checks, links, unreadable
 * folders, ignore rules, cancelling, and copying through the shared plan and queue. Temporary folders only.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { compareOperations, type CompareCategory, type CompareEntry, type CompareSummary } from "../src/features/filemanager/fmCompare";
import { findDevJob, type DevJob } from "../src/features/filemanager/fmDevJobs";
import { applyPlan } from "../src/features/filemanager/fmPlanRun";
import type { PlanView } from "../src/features/filemanager/fmPlan";
import { listTrash } from "../src/features/filemanager/fmTrash";

const posix = process.platform !== "win32";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const suite = posix ? describe : describe.skip;
const roots: string[] = [];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "fm-compare-"));
  roots.push(root);
  const home = join(root, "home");
  const left = join(root, "left");
  const right = join(root, "right");
  mkdirSync(home);
  mkdirSync(left);
  mkdirSync(right);
  return { root, left, right, ctx: createContext({ home, dataDir: join(root, "data") }) };
}
type Box = ReturnType<typeof sandbox>;
const put = (path: string, content = "x", when?: number) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  if (when) utimesSync(path, when / 1000, when / 1000);
  return path;
};
const op = <T>(name: string, ctx: Box["ctx"], body: Record<string, unknown>) => compareOperations[name]!(ctx, body) as Promise<T>;

async function compare(box: Box, extra: Record<string, unknown> = {}) {
  const { id } = await op<{ id: string }>("compare/start", box.ctx, { left: box.left, right: box.right, ...extra });
  const job = findDevJob(box.ctx, id, ["compare"]);
  await waitFor(job);
  const entries = (await op<{ entries: CompareEntry[] }>("compare/entries", box.ctx, { id, limit: 1000 })).entries;
  return { id, job, summary: job.result as CompareSummary, entries, by: (cat: CompareCategory) => entries.filter((e) => e.category === cat).map((e) => e.rel) };
}
async function waitFor(job: DevJob) {
  for (let i = 0; i < 500 && job.state === "running"; i++) await new Promise((r) => setTimeout(r, 10));
  expect(job.state).not.toBe("running");
}

afterAll(() => roots.forEach((r) => { try { chmodSync(join(r, "left", "locked"), 0o755); } catch {} rmSync(r, { recursive: true, force: true }); }));

suite("the five groups", () => {
  test("nested folders, empty folders and every group", async () => {
    const box = sandbox();
    const t = 1_700_000_000_000;
    put(join(box.left, "same.txt"), "same", t);
    put(join(box.right, "same.txt"), "same", t);
    put(join(box.left, "deep", "er", "only-left.txt"), "L");
    put(join(box.right, "deep", "only-right.txt"), "R");
    put(join(box.left, "changed.txt"), "left text");
    put(join(box.right, "changed.txt"), "right text, longer");
    mkdirSync(join(box.left, "empty-left"));
    mkdirSync(join(box.right, "empty-right"));
    mkdirSync(join(box.left, "both-empty"));
    mkdirSync(join(box.right, "both-empty"));
    const r = await compare(box);
    expect(r.by("onlyLeft")).toEqual(["deep/er/only-left.txt", "empty-left"]);
    expect(r.by("onlyRight")).toEqual(["deep/only-right.txt", "empty-right"]);
    expect(r.by("different")).toEqual(["changed.txt"]);
    expect(r.by("identical")).toEqual(["same.txt"]);
    expect(r.by("cannot")).toEqual([]);
    expect(r.summary.counts).toEqual({ onlyLeft: 2, onlyRight: 2, different: 1, identical: 1, cannot: 0 });
    const changed = r.entries.find((e) => e.rel === "changed.txt")!;
    expect(changed.left!.size).toBe(9);
    expect(changed.right!.size).toBe(18);
    expect(changed.left!.mtimeMs).toBeGreaterThan(0);
    expect(r.entries.find((e) => e.rel === "empty-left")!.left!.kind).toBe("dir");
  });

  test("quick check never calls same-size same-date files identical without saying the contents were not read", async () => {
    const box = sandbox();
    const t = 1_700_000_000_000;
    put(join(box.left, "a.bin"), "AAAA", t);
    put(join(box.right, "a.bin"), "BBBB", t);
    const quick = await compare(box);
    const entry = quick.entries[0]!;
    expect(entry.category).toBe("identical");
    expect(entry.verified).toBe(false);
    expect(entry.note).toMatch(/not verified/);
    expect(quick.summary.unverifiedIdentical).toBe(1);

    const verified = await compare(box, { mode: "verified" });
    expect(verified.entries[0]).toMatchObject({ category: "different", basis: "content" });
    expect(verified.summary.unverifiedIdentical).toBe(0);
  });

  test("verified check confirms identical contents byte by byte, whatever the dates", async () => {
    const box = sandbox();
    put(join(box.left, "a.txt"), "same bytes", 1_700_000_000_000);
    put(join(box.right, "a.txt"), "same bytes", 1_600_000_000_000);
    const quick = await compare(box);
    expect(quick.entries[0]).toMatchObject({ category: "different", basis: "date", verified: false });
    expect(quick.entries[0]!.note).toMatch(/not read/);
    const verified = await compare(box, { mode: "verified" });
    expect(verified.entries[0]).toMatchObject({ category: "identical", basis: "content", verified: true });
  });

  test("a file on one side and a folder on the other is different and is never copied over", async () => {
    const box = sandbox();
    put(join(box.left, "thing"), "file");
    mkdirSync(join(box.right, "thing"));
    const r = await compare(box);
    expect(r.entries[0]).toMatchObject({ rel: "thing", category: "different", basis: "type" });
    const { plan } = await op<{ plan: PlanView }>("compare/plan", box.ctx, { id: r.id, direction: "toRight", paths: ["thing"], replace: true });
    expect(plan.canApply).toBe(false);
    expect(plan.items[0]!.reason).toMatch(/neither is copied/);
  });
});

suite("symbolic links, unreadable folders, ignore rules, limits", () => {
  test("links are compared by target, never followed, and a loop cannot run away", async () => {
    const box = sandbox();
    put(join(box.left, "dir", "f.txt"), "f");
    put(join(box.right, "dir", "f.txt"), "f");
    symlinkSync(box.left, join(box.left, "dir", "loop"));
    symlinkSync(box.right, join(box.right, "dir", "loop"));
    symlinkSync("target-a", join(box.left, "ln"));
    symlinkSync("target-b", join(box.right, "ln"));
    symlinkSync("same", join(box.left, "ln-same"));
    symlinkSync("same", join(box.right, "ln-same"));
    const r = await compare(box);
    expect(r.by("different")).toContain("ln");
    expect(r.by("identical")).toContain("ln-same");
    expect(r.entries.find((e) => e.rel === "ln")!.note).toMatch(/point to different places/);
    expect(r.summary.scannedLeft).toBeLessThan(10);
    expect(r.entries.find((e) => e.rel === "dir/loop")).toMatchObject({ category: "different" });
  });

  test("a link in a folder you choose is resolved once, and the compare still works", async () => {
    const box = sandbox();
    put(join(box.left, "a.txt"), "a");
    const alias = join(box.root, "left-alias");
    symlinkSync(box.left, alias);
    const { id } = await op<{ id: string }>("compare/start", box.ctx, { left: alias, right: box.right });
    await waitFor(findDevJob(box.ctx, id, ["compare"]));
    expect((findDevJob(box.ctx, id).result as CompareSummary).counts.onlyLeft).toBe(1);
  });

  test.skipIf(isRoot)("an unreadable folder is reported as cannot compare, and nothing below it is called only-on-the-other-side", async () => {
    const box = sandbox();
    put(join(box.left, "locked", "secret.txt"), "s");
    put(join(box.right, "locked", "secret.txt"), "s");
    put(join(box.right, "locked", "extra.txt"), "e");
    put(join(box.left, "ok.txt"), "ok");
    put(join(box.right, "ok.txt"), "ok", 0);
    chmodSync(join(box.left, "locked"), 0o000);
    try {
      const r = await compare(box);
      expect(r.by("cannot").sort()).toEqual(["locked", "locked/extra.txt", "locked/secret.txt"]);
      expect(r.by("onlyRight")).toEqual([]);
      expect(r.entries.find((e) => e.rel === "locked")!.note).toMatch(/can't be read/i);
      const cannot = r.entries.find((e) => e.rel === "locked/secret.txt")!;
      expect(cannot.note).toMatch(/can't be compared/);
    } finally {
      chmodSync(join(box.left, "locked"), 0o755);
    }
  });

  test.skipIf(isRoot)("an unreadable file during the verified check is reported, not treated as missing", async () => {
    const box = sandbox();
    put(join(box.left, "a.txt"), "same");
    put(join(box.right, "a.txt"), "same");
    chmodSync(join(box.right, "a.txt"), 0o000);
    try {
      const r = await compare(box, { mode: "verified" });
      expect(r.entries[0]).toMatchObject({ category: "cannot", basis: "unreadable" });
    } finally {
      chmodSync(join(box.right, "a.txt"), 0o644);
    }
  });

  test("ignore rules (.gitignore style) leave things out of every group", async () => {
    const box = sandbox();
    put(join(box.left, "keep.txt"), "k");
    put(join(box.left, "node_modules", "pkg", "index.js"), "x");
    put(join(box.left, "debug.log"), "x");
    put(join(box.right, "build", "out.js"), "x");
    const r = await compare(box, { ignore: ["node_modules/", "*.log", "# a comment", "", "/build"] });
    expect(r.entries.map((e) => e.rel)).toEqual(["keep.txt"]);
    expect(r.summary.ignore).toEqual(["node_modules/", "*.log", "/build"]);
  });

  test("the same folder, or one inside the other, is refused", async () => {
    const box = sandbox();
    mkdirSync(join(box.left, "inner"));
    await expect(op("compare/start", box.ctx, { left: box.left, right: box.left })).rejects.toMatchObject({ code: "OVERLAP" });
    await expect(op("compare/start", box.ctx, { left: box.left, right: join(box.left, "inner") })).rejects.toMatchObject({ code: "OVERLAP" });
    await expect(op("compare/start", box.ctx, { left: box.left, right: join(box.root, "nope") })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("cancelling stops the verified check; files not reached are 'cannot compare', not 'identical'", async () => {
    const box = sandbox();
    for (let i = 0; i < 40; i++) {
      put(join(box.left, `f${i}.bin`), "x".repeat(3_000_000));
      put(join(box.right, `f${i}.bin`), "x".repeat(3_000_000));
    }
    const { id } = await op<{ id: string }>("compare/start", box.ctx, { left: box.left, right: box.right, mode: "verified" });
    const job = findDevJob(box.ctx, id, ["compare"]);
    while (job.state === "running" && (job.progress.phase !== "verifying" || Number(job.progress.filesDone) < 1)) await new Promise((r) => setTimeout(r, 2));
    job.cancelled = true;
    await waitFor(job);
    const summary = job.result as CompareSummary;
    expect(summary.cancelled).toBe(true);
    const { entries } = await op<{ entries: CompareEntry[] }>("compare/entries", box.ctx, { id, limit: 1000 });
    const unfinished = entries.filter((e) => e.category === "cannot");
    expect(unfinished.length).toBeGreaterThan(0);
    expect(unfinished.every((e) => /cancelled/.test(e.note))).toBe(true);
    expect(entries.filter((e) => e.category === "identical" && e.verified).length + unfinished.length).toBe(40);
  });

  test("results can be filtered and paged", async () => {
    const box = sandbox();
    for (let i = 0; i < 5; i++) put(join(box.left, `file${i}.txt`), "x");
    put(join(box.right, "other.txt"), "y");
    const r = await compare(box);
    const page = await op<{ total: number; entries: CompareEntry[] }>("compare/entries", box.ctx, { id: r.id, category: "onlyLeft", offset: 1, limit: 2 });
    expect(page.total).toBe(5);
    expect(page.entries.map((e) => e.rel)).toEqual(["file1.txt", "file2.txt"]);
    const found = await op<{ total: number; entries: CompareEntry[] }>("compare/entries", box.ctx, { id: r.id, query: "OTHER" });
    expect(found.entries.map((e) => e.rel)).toEqual(["other.txt"]);
  });
});

suite("copying the differences you choose", () => {
  async function copy(box: Box, r: Awaited<ReturnType<typeof compare>>, body: Record<string, unknown>) {
    const { plan } = await op<{ plan: PlanView }>("compare/plan", box.ctx, { id: r.id, ...body });
    const { job } = await applyPlan(box.ctx, plan.id, { approved: true });
    return { plan, job: await box.ctx.jobs.whenDone(job.id) };
  }

  test("copies only the chosen entries to the right, creates folders, and never deletes anything", async () => {
    const box = sandbox();
    put(join(box.left, "deep", "er", "new.txt"), "new");
    put(join(box.left, "skip-me.txt"), "no");
    mkdirSync(join(box.left, "empty-left"));
    put(join(box.right, "right-only.txt"), "keep me");
    const r = await compare(box);
    const { plan, job } = await copy(box, r, { direction: "toRight", paths: ["deep/er/new.txt", "empty-left", "right-only.txt"] });
    expect(plan.summary).toMatchObject({ copy: 1, create: 1, skip: 1 });
    expect(plan.items.find((i) => i.action === "skip")!.reason).toMatch(/Nothing is ever deleted/);
    expect(job.state).toBe("done");
    expect(readFileSync(join(box.right, "deep", "er", "new.txt"), "utf8")).toBe("new");
    expect(existsSync(join(box.right, "empty-left"))).toBe(true);
    expect(existsSync(join(box.right, "skip-me.txt"))).toBe(false);
    expect(readFileSync(join(box.right, "right-only.txt"), "utf8")).toBe("keep me");
    expect(readdirSync(box.left).sort()).toEqual(["deep", "empty-left", "skip-me.txt"]);
  });

  test("the other direction copies from right to left", async () => {
    const box = sandbox();
    put(join(box.right, "from-right.txt"), "R");
    const r = await compare(box);
    await copy(box, r, { direction: "toLeft", paths: ["from-right.txt"] });
    expect(readFileSync(join(box.left, "from-right.txt"), "utf8")).toBe("R");
  });

  test("a different file is replaced only when asked, and the old one goes to the Recycle Bin", async () => {
    const box = sandbox();
    put(join(box.left, "c.txt"), "new content");
    put(join(box.right, "c.txt"), "old");
    const r = await compare(box);
    const noReplace = await op<{ plan: PlanView }>("compare/plan", box.ctx, { id: r.id, direction: "toRight", paths: ["c.txt"] });
    expect(noReplace.plan.summary).toMatchObject({ replace: 0, skip: 1 });
    expect(noReplace.plan.needsApproval).toBe(false);
    const { plan } = await op<{ plan: PlanView }>("compare/plan", box.ctx, { id: r.id, direction: "toRight", paths: ["c.txt"], replace: true });
    expect(plan.summary.replace).toBe(1);
    await expect(applyPlan(box.ctx, plan.id, {})).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(readFileSync(join(box.right, "c.txt"), "utf8")).toBe("old");
    const { job } = await applyPlan(box.ctx, plan.id, { approved: true });
    await box.ctx.jobs.whenDone(job.id);
    expect(readFileSync(join(box.right, "c.txt"), "utf8")).toBe("new content");
    expect((await listTrash(box.ctx)).count).toBe(1);
  });

  test("a file that changed after the comparison is blocked, not copied", async () => {
    const box = sandbox();
    put(join(box.left, "a.txt"), "first");
    const r = await compare(box);
    writeFileSync(join(box.left, "a.txt"), "edited since the comparison");
    const { plan } = await op<{ plan: PlanView }>("compare/plan", box.ctx, { id: r.id, direction: "toRight", paths: ["a.txt"] });
    expect(plan.items[0]!.issues[0]).toMatchObject({ level: "block", code: "CHANGED" });
    expect(plan.canApply).toBe(false);
  });

  test("a name that appeared on the right after the preview is not overwritten", async () => {
    const box = sandbox();
    put(join(box.left, "a.txt"), "mine");
    const r = await compare(box);
    const { plan } = await op<{ plan: PlanView }>("compare/plan", box.ctx, { id: r.id, direction: "toRight", paths: ["a.txt"] });
    put(join(box.right, "a.txt"), "theirs");
    const { job } = await applyPlan(box.ctx, plan.id, { approved: true });
    const done = await box.ctx.jobs.whenDone(job.id);
    expect(done.steps[0]!.state).toBe("skipped");
    expect(readFileSync(join(box.right, "a.txt"), "utf8")).toBe("theirs");
  });

  test("links are copied as links", async () => {
    const box = sandbox();
    symlinkSync("somewhere", join(box.left, "ln"));
    const r = await compare(box);
    const { job } = await copy(box, r, { direction: "toRight", paths: ["ln"] });
    expect(job.state).toBe("done");
    expect(require("fs").readlinkSync(join(box.right, "ln"))).toBe("somewhere");
  });

  test("asking for nothing, or for something not in the comparison, is explained", async () => {
    const box = sandbox();
    put(join(box.left, "a.txt"), "a");
    const r = await compare(box);
    await expect(op("compare/plan", box.ctx, { id: r.id, direction: "toRight", paths: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { plan } = await op<{ plan: PlanView }>("compare/plan", box.ctx, { id: r.id, direction: "toRight", paths: ["ghost.txt"] });
    expect(plan.items[0]!.reason).toMatch(/not in the comparison/);
    await expect(op("compare/entries", box.ctx, { id: "nope" })).rejects.toMatchObject({ code: "NO_JOB" });
  });
});

suite("large trees and unusual names", () => {
  test("two trees of 3000 files compare in good time, with unusual names, and results are paged", async () => {
    const box = sandbox();
    const t = 1_700_000_000_000;
    for (let i = 0; i < 1500; i++) {
      const rel = join(`dir ${i % 25}`, `sub-${i % 7}`, `file ${i} é"q".txt`);
      put(join(box.left, rel), String(i), t);
      if (i % 3) put(join(box.right, rel), i % 5 === 0 ? `changed ${i}` : String(i), t);
    }
    const started = Date.now();
    const r = await compare(box);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(r.summary.counts.onlyLeft).toBe(500);
    expect(r.summary.counts.onlyRight).toBe(0);
    expect(r.summary.counts.different + r.summary.counts.identical).toBe(1000);
    expect(Object.values(r.summary.counts).reduce((a, b) => a + b, 0)).toBe(1500);
    const odd = await op<{ total: number }>("compare/entries", box.ctx, { id: r.id, query: 'é"q"', limit: 5 });
    expect(odd.total).toBe(1500);
    const page = await op<{ total: number; entries: CompareEntry[] }>("compare/entries", box.ctx, { id: r.id, category: "onlyLeft", offset: 490, limit: 50 });
    expect(page.total).toBe(500);
    expect(page.entries.length).toBe(10);
  });

  test("a symlink to a parent folder inside a deep tree can't make the scan endless, and a deep tree is bounded", async () => {
    const box = sandbox();
    let at = box.left;
    for (let i = 0; i < 80; i++) at = join(at, `d${i}`);
    put(join(at, "deep.txt"), "deep");
    symlinkSync(box.left, join(box.left, "d0", "back-to-root"));
    const r = await compare(box);
    expect(r.summary.scannedLeft).toBeLessThan(200);
    expect(r.entries.some((e) => e.category === "cannot" && /more than 64 levels/.test(e.note))).toBe(true);
    expect(r.entries.find((e) => e.rel === "d0/back-to-root")).toMatchObject({ category: "onlyLeft" });
  });
});
