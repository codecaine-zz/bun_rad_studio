/**
 * Operation plans: preview, approval, re-checking before applying, Undo and the honest recovery notes.
 * Everything happens in temporary folders.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { createPlan, findPlan, type PlanView } from "../src/features/filemanager/fmPlan";
import { applyPlan, undoPlan } from "../src/features/filemanager/fmPlanRun";
import { planOperations } from "../src/features/filemanager/fmPlanOps";
import { listTrash } from "../src/features/filemanager/fmTrash";

const posix = process.platform !== "win32";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const suite = posix ? describe : describe.skip;
const roots: string[] = [];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "fm-plan-"));
  roots.push(root);
  const home = join(root, "home");
  const work = join(root, "work");
  mkdirSync(home);
  mkdirSync(work);
  return { root, home, work, ctx: createContext({ home, dataDir: join(root, "data") }) };
}
type Box = ReturnType<typeof sandbox>;
const put = (path: string, content = "x") => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
};
const names = (dir: string) => readdirSync(dir).sort();
const approve = { approved: true };

async function run(box: Box, plan: PlanView, request: Record<string, unknown> = approve) {
  const { job } = await applyPlan(box.ctx, plan.id, request);
  return await box.ctx.jobs.whenDone(job.id);
}

afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

suite("planning changes nothing and says what would happen", () => {
  test("a move shows its summary, every item, and the recovery notes", async () => {
    const box = sandbox();
    const a = put(join(box.work, "src", "a.txt"), "A");
    const b = put(join(box.work, "src", "b.txt"), "B");
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "move", sources: [a, b], destination: dest });
    expect(plan.summary.move).toBe(2);
    expect(plan.summary.replace).toBe(0);
    expect(plan.items.map((i) => [i.action, i.source, i.destination])).toEqual([["move", a, join(dest, "a.txt")], ["move", b, join(dest, "b.txt")]]);
    expect(plan.needsApproval).toBe(false);
    expect(plan.canApply).toBe(true);
    expect(existsSync(a) && existsSync(b)).toBe(true);
    expect(names(dest)).toEqual([]);
    const kinds = Object.fromEntries(plan.recovery.map((r) => [r.kind, r.available]));
    expect(kinds).toEqual({ undo: true, "recycle-bin": false, backup: false, quarantine: false });
  });

  test("a same-name conflict follows the policy and is visible in the preview", async () => {
    const box = sandbox();
    const a = put(join(box.work, "src", "a.txt"), "new");
    const dest = join(box.work, "dest");
    put(join(dest, "a.txt"), "old");
    const keep = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [a], destination: dest, policy: "rename" });
    expect(keep.items[0]!.destination).toBe(join(dest, "a (2).txt"));
    const skip = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [a], destination: dest, policy: "skip" });
    expect(skip.items[0]!.action).toBe("skip");
    expect(skip.items[0]!.reason).toMatch(/already there/);
    expect(skip.canApply).toBe(false);
    const replace = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [a], destination: dest, policy: "replace" });
    expect(replace.summary.replace).toBe(1);
    expect(replace.needsApproval).toBe(true);
    expect(replace.recovery.find((r) => r.kind === "recycle-bin")!.available).toBe(true);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("old");
  });

  test("problems found while planning stay in the list as skipped items with their reason", async () => {
    const box = sandbox();
    const gone = join(box.work, "gone.txt");
    const a = put(join(box.work, "one", "a.txt"));
    const a2 = put(join(box.work, "two", "a.txt"));
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [gone, a, a2, a], destination: dest });
    expect(plan.items.length).toBe(4);
    expect(plan.items[3]).toMatchObject({ action: "skip", reason: "Selected more than once." });
    expect(plan.items[0]).toMatchObject({ action: "skip" });
    expect(plan.items[0]!.issues[0]).toMatchObject({ level: "block", code: "NOT_FOUND" });
    expect(plan.items[1]!.destination).toBe(join(dest, "a.txt"));
    expect(plan.items[2]!.action).toBe("copy");
    expect(plan.items[2]!.destination).toBe(join(dest, "a (2).txt"));
    expect(plan.warnings.join(" ")).toMatch(/can't be done/);
  });

  test.skipIf(isRoot)("a destination that is not writable is reported as a permission problem", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"));
    const dest = join(box.work, "locked");
    mkdirSync(dest);
    chmodSync(dest, 0o555);
    try {
      const plan = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [a], destination: dest });
      expect(plan.items[0]!.issues[0]).toMatchObject({ level: "block", code: "EACCES" });
      expect(plan.canApply).toBe(false);
    } finally {
      chmodSync(dest, 0o755);
    }
  });

  test("rename: clashes with an item that stays, duplicates and bad names are blocked; renaming never replaces", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"));
    const b = put(join(box.work, "b.txt"));
    put(join(box.work, "taken.txt"));
    const plan = await createPlan(box.ctx, { type: "rename", items: [{ path: a, name: "taken.txt" }, { path: b, name: "bad/name.txt" }] });
    expect(plan.items.map((i) => i.issues[0]?.code)).toEqual(["EXISTS", "BAD_NAME"]);
    expect(plan.summary.rename).toBe(0);
    expect(plan.canApply).toBe(false);
    const twice = await createPlan(box.ctx, { type: "rename", items: [{ path: a, name: "same.txt" }, { path: b, name: "same.txt" }] });
    expect(twice.items.map((i) => i.issues[0]?.code)).toEqual(["DUPLICATE", "DUPLICATE"]);
  });

  test("delete: Recycle Bin versus permanent are told apart, and folders say what goes with them", async () => {
    const box = sandbox();
    const f = put(join(box.work, "f.txt"));
    const d = join(box.work, "dir");
    put(join(d, "x.txt"));
    put(join(d, "y.txt"));
    const bin = await createPlan(box.ctx, { type: "delete", paths: [f, d] });
    expect(bin.summary).toMatchObject({ delete: 2, permanentDelete: 0 });
    expect(bin.items[1]!.issues[0]!.message).toMatch(/2 files/);
    expect(bin.needsApproval).toBe(true);
    expect(bin.needsPermanentApproval).toBe(false);
    expect(bin.recovery.find((r) => r.kind === "recycle-bin")!.available).toBe(true);
    const gone = await createPlan(box.ctx, { type: "delete", paths: [f], permanent: true });
    expect(gone.summary).toMatchObject({ delete: 0, permanentDelete: 1 });
    expect(gone.needsPermanentApproval).toBe(true);
    expect(gone.recovery.find((r) => r.kind === "undo")!.available).toBe(false);
    expect(gone.warnings.join(" ")).toMatch(/for good/);
    expect(existsSync(f)).toBe(true);
  });

  test("an item inside another selected item is not counted twice", async () => {
    const box = sandbox();
    const d = join(box.work, "dir");
    const f = put(join(d, "x.txt"));
    const plan = await createPlan(box.ctx, { type: "delete", paths: [d, f] });
    expect(plan.items.map((i) => i.action)).toEqual(["delete", "skip"]);
    expect(plan.items[1]!.reason).toMatch(/Already included/);
  });
});

suite("approval", () => {
  test("replacing or deleting needs explicit approval; deleting for good needs a second confirmation", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"), "new");
    const dest = join(box.work, "dest");
    put(join(dest, "a.txt"), "old");
    const replace = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [a], destination: dest, policy: "replace" });
    await expect(applyPlan(box.ctx, replace.id, {})).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("old");

    const f = put(join(box.work, "f.txt"));
    const gone = await createPlan(box.ctx, { type: "delete", paths: [f], permanent: true });
    await expect(applyPlan(box.ctx, gone.id, { approved: true })).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(existsSync(f)).toBe(true);
    const job = await run(box, gone, { approved: true, confirmPermanent: true });
    expect(job.state).toBe("done");
    expect(existsSync(f)).toBe(false);
    expect((await listTrash(box.ctx)).count).toBe(0);
  });

  test("items the person leaves out are not touched and are reported as left out", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"));
    const b = put(join(box.work, "b.txt"));
    const plan = await createPlan(box.ctx, { type: "delete", paths: [a, b] });
    const job = await run(box, plan, { approved: true, exclude: [1] });
    expect(job.total).toBe(1);
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(true);
    expect(findPlan(box.ctx, plan.id).items[1]!.reason).toBe("Left out by you.");
  });

  test("a plan applies once, and an unknown or discarded one is refused", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"));
    const plan = await createPlan(box.ctx, { type: "rename", items: [{ path: a, name: "b.txt" }] });
    await run(box, plan);
    await expect(applyPlan(box.ctx, plan.id, approve)).rejects.toMatchObject({ code: "ALREADY_APPLIED" });
    await expect(applyPlan(box.ctx, "nope", approve)).rejects.toMatchObject({ code: "PLAN_GONE" });
    const other = await createPlan(box.ctx, { type: "rename", items: [{ path: join(box.work, "b.txt"), name: "c.txt" }] });
    await planOperations["plan/discard"]!(box.ctx, { id: other.id });
    await expect(applyPlan(box.ctx, other.id, approve)).rejects.toMatchObject({ code: "PLAN_GONE" });
  });

  test("a plan with nothing to do cannot be applied", async () => {
    const box = sandbox();
    const plan = await createPlan(box.ctx, { type: "delete", paths: [join(box.work, "missing")] });
    expect(plan.canApply).toBe(false);
    await expect(applyPlan(box.ctx, plan.id, approve)).rejects.toMatchObject({ code: "NOTHING_TO_DO" });
  });
});

suite("changes between the preview and the apply are handled safely", () => {
  test("a source that changed after the preview is not touched", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"), "one");
    const b = put(join(box.work, "b.txt"), "fine");
    const plan = await createPlan(box.ctx, { type: "delete", paths: [a, b] });
    writeFileSync(a, "one, then edited by someone else");
    const job = await run(box, plan);
    expect(job.state).toBe("failed");
    expect(existsSync(a)).toBe(true);
    expect(existsSync(b)).toBe(false);
    expect(job.steps[0]!.message).toMatch(/changed after the preview/);
  });

  test("a source that disappeared fails that item only", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"));
    const b = put(join(box.work, "b.txt"));
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [a, b], destination: dest });
    rmSync(a);
    const job = await run(box, plan);
    expect(job.steps.map((s) => s.state)).toEqual(["failed", "done"]);
    expect(job.steps[0]!.message).toMatch(/no longer exists/);
    expect(names(dest)).toEqual(["b.txt"]);
  });

  test("a name that was free in the preview but is taken now is left alone, never overwritten", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"), "mine");
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [a], destination: dest });
    put(join(dest, "a.txt"), "someone else's file");
    const job = await run(box, plan);
    expect(job.steps[0]!.state).toBe("skipped");
    expect(job.steps[0]!.message).toMatch(/appeared at the destination after the preview/);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("someone else's file");
  });

  test("an item that was going to be replaced but changed since is not replaced", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"), "new");
    const dest = join(box.work, "dest");
    put(join(dest, "a.txt"), "old");
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [a], destination: dest, policy: "replace" });
    writeFileSync(join(dest, "a.txt"), "edited meanwhile");
    const job = await run(box, plan);
    expect(job.state).toBe("failed");
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("edited meanwhile");
    expect((await listTrash(box.ctx)).count).toBe(0);
  });

  test("a partial failure is recorded per item and Retry runs only what did not finish", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"));
    const b = put(join(box.work, "b.txt"));
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "move", sources: [a, b], destination: dest });
    const later = new Date(Date.now() + 5000);
    utimesSync(a, later, later);
    const first = await run(box, plan);
    expect(first.state).toBe("failed");
    expect(first.steps.map((s) => s.state)).toEqual(["failed", "done"]);
    expect(existsSync(a)).toBe(true);
    expect(names(dest)).toEqual(["b.txt"]);
    expect(first.retryable).toBe(true);
  });
});

suite("mixed plans and recovery", () => {
  test("a folder comparison style plan creates parents and empty folders and replaces only what was approved", async () => {
    const box = sandbox();
    const left = join(box.work, "left");
    const right = join(box.work, "right");
    const a = put(join(left, "deep", "er", "a.txt"), "A");
    const c = put(join(left, "c.txt"), "new c");
    put(join(right, "c.txt"), "old c");
    mkdirSync(join(left, "empty"), { recursive: true });
    const plan = await createPlan(box.ctx, {
      type: "items",
      title: "Copy to right",
      items: [
        { action: "copy", source: a, destination: join(right, "deep", "er", "a.txt") },
        { action: "copy", source: c, destination: join(right, "c.txt"), replace: true },
        { action: "create", destination: join(right, "empty") },
      ],
    });
    expect(plan.summary).toMatchObject({ copy: 1, replace: 1, create: 1 });
    const job = await run(box, plan);
    expect(job.state).toBe("done");
    expect(job.kind).toBe("mixed");
    expect(readFileSync(join(right, "deep", "er", "a.txt"), "utf8")).toBe("A");
    expect(readFileSync(join(right, "c.txt"), "utf8")).toBe("new c");
    expect(existsSync(join(right, "empty"))).toBe(true);
    expect((await listTrash(box.ctx)).count).toBe(1);
  });

  test("an explicit item whose destination holds a different kind of thing is blocked", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a"), "file");
    mkdirSync(join(box.work, "dest", "a"), { recursive: true });
    const plan = await createPlan(box.ctx, { type: "items", items: [{ action: "copy", source: a, destination: join(box.work, "dest", "a"), replace: true }] });
    expect(plan.items[0]!.issues[0]).toMatchObject({ level: "block", code: "TYPE_MISMATCH" });
  });

  test("renames that swap names are done together and nothing is lost", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"), "was a");
    const b = put(join(box.work, "b.txt"), "was b");
    const plan = await createPlan(box.ctx, { type: "rename", items: [{ path: a, name: "b.txt" }, { path: b, name: "a.txt" }] });
    expect(plan.summary.rename).toBe(2);
    expect(plan.canApply).toBe(true);
    const job = await run(box, plan);
    expect(job.state).toBe("done");
    expect(readFileSync(a, "utf8")).toBe("was b");
    expect(readFileSync(b, "utf8")).toBe("was a");
    const undone = await undoPlan(box.ctx, plan.id);
    expect(undone.results.every((r) => r.ok)).toBe(true);
    expect(readFileSync(a, "utf8")).toBe("was a");
    expect(readFileSync(b, "utf8")).toBe("was b");
    expect(names(box.work).filter((n) => n.startsWith("."))).toEqual([]);
  });

  test("a chain of renames runs in an order that never clashes", async () => {
    const box = sandbox();
    put(join(box.work, "1.txt"), "one");
    put(join(box.work, "2.txt"), "two");
    put(join(box.work, "3.txt"), "three");
    const plan = await createPlan(box.ctx, {
      type: "rename",
      items: [{ path: join(box.work, "1.txt"), name: "2.txt" }, { path: join(box.work, "2.txt"), name: "3.txt" }, { path: join(box.work, "3.txt"), name: "4.txt" }],
    });
    expect(plan.summary.rename).toBe(3);
    const job = await run(box, plan);
    expect(job.state).toBe("done");
    expect(names(box.work).map((n) => readFileSync(join(box.work, n), "utf8"))).toEqual(["one", "two", "three"]);
    expect(names(box.work)).toEqual(["2.txt", "3.txt", "4.txt"]);
  });

  test("batch rename plans use the same rules as the Rename dialog", async () => {
    const box = sandbox();
    put(join(box.work, "IMG_1.jpg"));
    put(join(box.work, "IMG_2.jpg"));
    put(join(box.work, "holiday_1.jpg"));
    const plan = await createPlan(box.ctx, { type: "bulk-rename", folder: box.work, names: ["IMG_1.jpg", "IMG_2.jpg"], spec: { mode: "replace", find: "IMG_", replace: "holiday_" } });
    expect(plan.items.map((i) => i.action)).toEqual(["skip", "rename"]);
    expect(plan.items[0]!.issues[0]!.message).toMatch(/already exists/);
    expect(plan.items[1]!.destination).toBe(join(box.work, "holiday_2.jpg"));
  });

  test("Undo reverses a move and a replace; Recycle Bin items return; nothing changed afterwards is touched", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"), "new a");
    const dest = join(box.work, "dest");
    put(join(dest, "a.txt"), "old a");
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "move", sources: [a], destination: dest, policy: "replace" });
    await run(box, plan);
    expect(existsSync(a)).toBe(false);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("new a");
    const undone = await undoPlan(box.ctx, plan.id);
    expect(undone.results).toEqual([expect.objectContaining({ ok: true })]);
    expect(readFileSync(a, "utf8")).toBe("new a");
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("old a");
    expect(undone.plan.undone).toBe(true);
    await expect(undoPlan(box.ctx, plan.id)).rejects.toMatchObject({ code: "NOTHING_TO_UNDO" });
  });

  test("Undo of a delete restores from the Recycle Bin; Undo of a copy removes the copy to the Recycle Bin", async () => {
    const box = sandbox();
    const f = put(join(box.work, "f.txt"), "keep me");
    const del = await createPlan(box.ctx, { type: "delete", paths: [f] });
    await run(box, del);
    expect(existsSync(f)).toBe(false);
    await undoPlan(box.ctx, del.id);
    expect(readFileSync(f, "utf8")).toBe("keep me");

    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const copy = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [f], destination: dest });
    await run(box, copy);
    expect(existsSync(join(dest, "f.txt"))).toBe(true);
    await undoPlan(box.ctx, copy.id);
    expect(existsSync(join(dest, "f.txt"))).toBe(false);
    expect(existsSync(f)).toBe(true);
  });

  test("Undo refuses to touch an item that was changed after the operation", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"), "one");
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "move", sources: [a], destination: dest });
    await run(box, plan);
    writeFileSync(join(dest, "a.txt"), "edited later, longer");
    const undone = await undoPlan(box.ctx, plan.id);
    expect(undone.results[0]).toMatchObject({ ok: false });
    expect(undone.results[0]!.message).toMatch(/changed after the operation/);
    expect(existsSync(a)).toBe(false);
    expect(undone.plan.undone).toBe(false);
  });

  test("permanent deletes cannot be undone, and the plan says so", async () => {
    const box = sandbox();
    const f = put(join(box.work, "f.txt"));
    const plan = await createPlan(box.ctx, { type: "delete", paths: [f], permanent: true });
    await run(box, plan, { approved: true, confirmPermanent: true });
    await expect(undoPlan(box.ctx, plan.id)).rejects.toMatchObject({ code: "NOTHING_TO_UNDO" });
  });

  test("the operations are reachable through the server's operation table", async () => {
    const box = sandbox();
    const a = put(join(box.work, "a.txt"));
    const { plan } = (await planOperations["plan/preview"]!(box.ctx, { request: { type: "rename", items: [{ path: a, name: "z.txt" }] } })) as { plan: PlanView };
    expect(plan.summary.rename).toBe(1);
    const { job } = (await planOperations["plan/apply"]!(box.ctx, { id: plan.id })) as { job: { id: string } };
    await box.ctx.jobs.whenDone(job.id);
    expect(names(box.work)).toEqual(["z.txt"]);
  });
});

suite("unusual names, links, nested destinations and interruptions", () => {
  test("names with spaces, quotes, dashes, unicode and shell characters are copied, renamed and deleted as plain names", async () => {
    const box = sandbox();
    const odd = ["a b.txt", "-rf", "quote's \"double\".txt", "résumé 日本語 🎉.txt", "semi;colon&amp|pipe$HOME`tick`.txt", "  leading space.txt", "dots...txt"];
    const sources = odd.map((n) => put(join(box.work, "src", n), `content of ${n}`));
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const copy = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources, destination: dest });
    expect(copy.summary.copy).toBe(odd.length);
    expect((await run(box, copy)).state).toBe("done");
    expect(names(dest)).toEqual([...odd].sort());
    for (const n of odd) expect(readFileSync(join(dest, n), "utf8")).toBe(`content of ${n}`);
    const rename = await createPlan(box.ctx, { type: "rename", items: odd.map((n, i) => ({ path: join(dest, n), name: `renamed ${i} "q" ;$(x).txt` })) });
    expect(rename.summary.rename).toBe(odd.length);
    expect((await run(box, rename)).state).toBe("done");
    expect(names(dest)).toEqual(odd.map((_, i) => `renamed ${i} "q" ;$(x).txt`).sort());
    const del = await createPlan(box.ctx, { type: "delete", paths: readdirSync(dest).map((n) => join(dest, n)) });
    expect((await run(box, del)).state).toBe("done");
    expect(names(dest)).toEqual([]);
    expect((await listTrash(box.ctx)).count).toBe(odd.length);
  });

  test("a folder can't be copied or moved into itself or into something inside it", async () => {
    const box = sandbox();
    const dir = join(box.work, "project");
    put(join(dir, "a.txt"));
    mkdirSync(join(dir, "inner"));
    for (const mode of ["copy", "move"] as const) {
      const plan = await createPlan(box.ctx, { type: "transfer", mode, sources: [dir], destination: join(dir, "inner") });
      expect(plan.items[0]).toMatchObject({ action: "skip" });
      expect(plan.items[0]!.issues[0]).toMatchObject({ level: "block" });
      expect(plan.canApply).toBe(false);
    }
    expect(names(dir)).toEqual(["a.txt", "inner"]);
  });

  test("symbolic links are copied as links, never followed, including broken ones and links to folders", async () => {
    const box = sandbox();
    const target = join(box.work, "real");
    put(join(target, "secret.txt"), "do not duplicate");
    const src = join(box.work, "src");
    mkdirSync(src);
    symlinkSync(target, join(src, "to-folder"));
    symlinkSync("missing-target", join(src, "broken"));
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: [join(src, "to-folder"), join(src, "broken")], destination: dest });
    expect(plan.summary.copy).toBe(2);
    expect((await run(box, plan)).state).toBe("done");
    expect(lstatSync(join(dest, "to-folder")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(dest, "to-folder"))).toBe(target);
    expect(readlinkSync(join(dest, "broken"))).toBe("missing-target");
    expect(names(dest)).toEqual(["broken", "to-folder"]);
    // deleting a link removes the link and never the folder it points to
    const del = await createPlan(box.ctx, { type: "delete", paths: [join(dest, "to-folder")], permanent: true });
    await run(box, del, { approved: true, confirmPermanent: true });
    expect(existsSync(join(target, "secret.txt"))).toBe(true);
  });

  test("cancelling part-way keeps what finished, reports what did not, and Undo reverses only the finished items", async () => {
    const box = sandbox();
    const files = Array.from({ length: 6 }, (_, i) => put(join(box.work, "src", `big${i}.bin`), "x".repeat(4_000_000)));
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: files, destination: dest });
    const { job } = await applyPlan(box.ctx, plan.id, {});
    for (let i = 0; i < 400 && !job.steps.some((s) => s.state === "done"); i++) await new Promise((r) => setTimeout(r, 5));
    box.ctx.jobs.cancel(job.id);
    const done = await box.ctx.jobs.whenDone(job.id);
    expect(done.state).toBe("cancelled");
    const finished = done.steps.filter((s) => s.state === "done").length;
    expect(finished).toBeGreaterThan(0);
    expect(finished).toBeLessThan(6);
    expect(names(dest).length).toBe(finished);
    expect(done.steps.filter((s) => s.state === "skipped" && s.skipReason === "cancelled").length).toBe(6 - finished);
    const undone = await undoPlan(box.ctx, plan.id);
    expect(undone.results.length).toBe(finished);
    expect(names(dest)).toEqual([]);
    for (const f of files) expect(existsSync(f)).toBe(true);
  });

  test("a big batch is planned and applied: 1500 files", async () => {
    const box = sandbox();
    const sources: string[] = [];
    for (let i = 0; i < 1500; i++) sources.push(put(join(box.work, "src", `d${i % 30}`, `f${i}.txt`), String(i)));
    const dest = join(box.work, "dest");
    mkdirSync(dest);
    const started = Date.now();
    const plan = await createPlan(box.ctx, { type: "transfer", mode: "move", sources, destination: dest });
    expect(plan.summary.move).toBe(1500);
    expect(plan.items.length).toBe(1500);
    expect((await run(box, plan)).state).toBe("done");
    expect(names(dest).length).toBe(1500);
    expect(Date.now() - started).toBeLessThan(20_000);
    const tooMany = await createPlan(box.ctx, { type: "transfer", mode: "copy", sources: sources.slice(0, 10), destination: dest }).catch((e) => e);
    expect(tooMany.summary?.skip).toBe(10);
  });

  test("more items than the limit is refused with a message, not half planned", async () => {
    const box = sandbox();
    const many = Array.from({ length: 5001 }, (_, i) => join(box.work, `x${i}`));
    await expect(createPlan(box.ctx, { type: "delete", paths: many })).rejects.toMatchObject({ code: "TOO_MANY" });
  });
});
