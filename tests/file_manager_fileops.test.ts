/**
 * File operations as queued jobs: copy, move and rename through the shared job hub, with progress, same-name policy,
 * partial failures, cancellation, retry and the persistent history. Everything happens in temporary folders.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, lstatSync, truncateSync, appendFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { copyWithProgress, measureTree, startRenames, startTransfer } from "../src/features/filemanager/fmFileOps";
import { createJobHub, StepSkip, type JobView, type StepProgress } from "../src/features/filemanager/fmJobs";
import { HISTORY_VERSION, historyFile, loadHistory, clearHistory } from "../src/features/filemanager/fmOpHistory";
import { listTrash } from "../src/features/filemanager/fmTrash";

const posix = process.platform !== "win32";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const suite = posix ? describe : describe.skip;
const roots: string[] = [];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "fm-fileops-"));
  roots.push(root);
  const home = join(root, "home");
  const work = join(root, "work");
  mkdirSync(home);
  mkdirSync(work);
  const ctx = createContext({ home, dataDir: join(root, "data") });
  return { root, home, work, ctx, data: join(root, "data") };
}
const put = (path: string, content = "x") => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
};
const names = (dir: string) => readdirSync(dir).sort();
const finish = (ctx: ReturnType<typeof sandbox>["ctx"], job: JobView) => ctx.jobs.whenDone(job.id);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

describe("the queue itself", () => {
  test("jobs wait their turn, run, and end in a final state; unmeasurable work has no total", async () => {
    const hub = createJobHub(1);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = hub.start({ kind: "copy", title: "first", steps: [{ label: "a", item: { source: "/a" }, prepare: async () => ({ work: async () => void (await gate) }) }] });
    const second = hub.start({ kind: "copy", title: "second", steps: [{ label: "b", measure: async () => null, prepare: async () => ({ work: async () => {} }) }] });
    await sleep(20);
    expect(first.state).toBe("running");
    expect(second.state).toBe("waiting");
    release();
    await hub.whenDone(second.id);
    expect(first.state).toBe("done");
    expect(second.state).toBe("done");
    expect(second.progress.bytesTotal).toBeNull();
    expect(second.progress.filesTotal).toBeNull();
  });

  test("a waiting job can be cancelled and nothing of it runs", async () => {
    const hub = createJobHub(1);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    hub.start({ kind: "copy", title: "busy", steps: [{ label: "a", prepare: async () => ({ work: async () => void (await gate) }) }] });
    let ran = false;
    const waiting = hub.start({ kind: "copy", title: "never", steps: [{ label: "b", prepare: async () => ({ work: async () => void (ran = true) }) }] });
    expect(hub.cancel(waiting.id)).toBe(true);
    release();
    await sleep(20);
    expect(ran).toBe(false);
    expect(waiting.state).toBe("cancelled");
    expect(waiting.steps[0]!.state).toBe("skipped");
    expect(waiting.steps[0]!.skipReason).toBe("cancelled");
  });

  test("a failing history hook never changes the outcome", async () => {
    const hub = createJobHub(1, { onStart: () => { throw new Error("disk full"); }, onFinish: async () => { throw new Error("disk full"); } });
    const job = hub.start({ kind: "copy", title: "x", steps: [{ label: "a", prepare: async () => ({ work: async () => {} }) }] });
    expect((await hub.whenDone(job.id)).state).toBe("done");
  });
});

suite("copy", () => {
  test("copies files and folders, measures files and bytes, and keeps both when the name is taken", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "src", "a.txt"), "hello");
    put(join(work, "src", "dir", "b.txt"), "world!");
    put(join(work, "src", "empty", ".keep"), "");
    mkdirSync(join(work, "src", "emptydir"));
    put(join(work, "dest", "a.txt"), "OLD");
    const job = await startTransfer(ctx, "copy", [join(work, "src", "a.txt"), join(work, "src", "dir"), join(work, "src", "emptydir")], join(work, "dest"));
    const done = await finish(ctx, job);
    expect(done.state).toBe("done");
    expect(done.done).toBe(3);
    expect(done.progress.filesTotal).toBe(2);
    expect(done.progress.bytesTotal).toBe(11);
    expect(done.progress.bytesDone).toBe(11);
    expect(readFileSync(join(work, "dest", "a.txt"), "utf8")).toBe("OLD");
    expect(readFileSync(join(work, "dest", "a (2).txt"), "utf8")).toBe("hello");
    expect(readFileSync(join(work, "dest", "dir", "b.txt"), "utf8")).toBe("world!");
    expect(statSync(join(work, "dest", "emptydir")).isDirectory()).toBe(true);
    expect(done.steps[0]!.item?.destination).toBe(join(work, "dest", "a (2).txt"));
  });

  test("skip leaves the existing item and says why; the step is skipped by policy, not failed", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "a.txt"), "new");
    put(join(work, "d", "a.txt"), "old");
    const done = await finish(ctx, await startTransfer(ctx, "copy", [join(work, "s", "a.txt")], join(work, "d"), "skip"));
    expect(done.state).toBe("done");
    expect(done.skipped).toBe(1);
    expect(done.steps[0]!.skipReason).toBe("policy");
    expect(done.steps[0]!.message).toContain("already there");
    expect(readFileSync(join(work, "d", "a.txt"), "utf8")).toBe("old");
  });

  test("replace sends the old item to the Recycle Bin first, so it is recoverable", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "a.txt"), "new");
    put(join(work, "d", "a.txt"), "old");
    const done = await finish(ctx, await startTransfer(ctx, "copy", [join(work, "s", "a.txt")], join(work, "d"), "replace"));
    expect(done.state).toBe("done");
    expect(readFileSync(join(work, "d", "a.txt"), "utf8")).toBe("new");
    expect(done.steps[0]!.item?.replacedTrashId).toBeTruthy();
    expect((await listTrash(ctx)).count).toBe(1);
  });

  test("a conflict that appears after queuing is still resolved safely when the item runs", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "a.txt"), "new");
    mkdirSync(join(work, "d"));
    const hub = ctx.jobs;
    // Hold the queue so the copy waits, then create the clash.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    hub.start({ kind: "copy", title: "x", steps: [{ label: "a", prepare: async () => ({ work: async () => void (await gate) }) }] });
    hub.start({ kind: "copy", title: "y", steps: [{ label: "a", prepare: async () => ({ work: async () => void (await gate) }) }] });
    const job = await startTransfer(ctx, "copy", [join(work, "s", "a.txt")], join(work, "d"));
    put(join(work, "d", "a.txt"), "appeared later");
    release();
    const done = await finish(ctx, job);
    expect(done.state).toBe("done");
    expect(readFileSync(join(work, "d", "a.txt"), "utf8")).toBe("appeared later");
    expect(readFileSync(join(work, "d", "a (2).txt"), "utf8")).toBe("new");
  });

  test("a missing source fails only its own item, names the path, and is not lost; retry runs only that item", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "a.txt"), "A");
    mkdirSync(join(work, "d"));
    const job = await startTransfer(ctx, "copy", [join(work, "s", "a.txt"), join(work, "s", "b.txt")], join(work, "d"));
    const first = await finish(ctx, job);
    expect(first.state).toBe("failed");
    expect(first.done).toBe(1);
    expect(first.failed).toBe(1);
    expect(first.steps[1]!.state).toBe("failed");
    expect(first.steps[1]!.message).toContain("b.txt");
    expect(first.steps[1]!.item?.source).toBe(join(work, "s", "b.txt"));
    put(join(work, "s", "b.txt"), "B");
    const again = ctx.jobs.retry(first.id)!;
    expect(again.total).toBe(1);
    expect(again.retryOf).toBe(first.id);
    expect(first.retriedBy).toBe(again.id);
    expect((await finish(ctx, again)).state).toBe("done");
    expect(names(join(work, "d"))).toEqual(["a.txt", "b.txt"]);
    expect(ctx.jobs.retry(first.id)).toBeNull();
    expect(ctx.jobs.retry(again.id)).toBeNull();
  });

  test("a folder cannot be copied into itself; other items still go through and nothing is left behind", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "tree", "f.txt"), "f");
    put(join(work, "other.txt"), "o");
    const done = await finish(ctx, await startTransfer(ctx, "copy", [join(work, "tree"), join(work, "other.txt")], join(work, "tree")));
    expect(done.steps[0]!.state).toBe("failed");
    expect(done.steps[0]!.message).toContain("inside itself");
    expect(done.steps[1]!.state).toBe("done");
    expect(names(join(work, "tree"))).toEqual(["f.txt", "other.txt"]);
  });

  test("unusual file names survive: spaces, unicode, leading dashes, quotes, newlines", async () => {
    const { ctx, work } = sandbox();
    const odd = ["with space.txt", "żółć 日本語.txt", "-rf", "it's \"quoted\".txt", "line\nbreak.txt", "$(touch pwned).txt", ".hidden"];
    for (const n of odd) put(join(work, "s", n), n);
    mkdirSync(join(work, "d"));
    const done = await finish(ctx, await startTransfer(ctx, "copy", odd.map((n) => join(work, "s", n)), join(work, "d")));
    expect(done.state).toBe("done");
    expect(names(join(work, "d"))).toEqual([...odd].sort());
    expect(existsSync(join(work, "pwned.txt"))).toBe(false);
    for (const n of odd) expect(readFileSync(join(work, "d", n), "utf8")).toBe(n);
  });

  test("links are copied as links and never followed, so a link loop cannot make the copy endless", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "tree", "f.txt"), "f");
    symlinkSync(join(work, "s"), join(work, "s", "tree", "loop"));
    symlinkSync(join(work, "nowhere"), join(work, "s", "tree", "dangling"));
    mkdirSync(join(work, "d"));
    const done = await finish(ctx, await startTransfer(ctx, "copy", [join(work, "s", "tree")], join(work, "d")));
    expect(done.state).toBe("done");
    expect(lstatSync(join(work, "d", "tree", "loop")).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(work, "d", "tree", "dangling")).isSymbolicLink()).toBe(true);
    expect(done.progress.filesTotal).toBe(3);
  });

  test("a big tree is copied completely, with matching totals", async () => {
    const { ctx, work } = sandbox();
    let bytes = 0;
    for (let d = 0; d < 20; d++) for (let f = 0; f < 100; f++) {
      const body = `file ${d}/${f}`;
      put(join(work, "big", `d${d}`, `n${d % 3}`, `f${f}.txt`), body);
      bytes += body.length;
    }
    mkdirSync(join(work, "out"));
    const done = await finish(ctx, await startTransfer(ctx, "copy", [join(work, "big")], join(work, "out")));
    expect(done.state).toBe("done");
    expect(done.progress.filesTotal).toBe(2000);
    expect(done.progress.filesDone).toBe(2000);
    expect(done.progress.bytesDone).toBe(bytes);
    expect(readdirSync(join(work, "out", "big", "d7", "n1")).length).toBe(100);
  });

  test("a pipe is refused instead of being read forever", async () => {
    const { ctx, work } = sandbox();
    mkdirSync(join(work, "s"));
    mkdirSync(join(work, "d"));
    const fifo = Bun.spawnSync(["mkfifo", join(work, "s", "pipe")]);
    if (fifo.exitCode !== 0) return;
    const done = await finish(ctx, await startTransfer(ctx, "copy", [join(work, "s", "pipe")], join(work, "d")));
    expect(done.steps[0]!.state).toBe("failed");
    expect(done.steps[0]!.message).toContain("special file");
    expect(existsSync(join(work, "d", "pipe"))).toBe(false);
  });

  test("a file that changes while it is copied fails and leaves no partial copy", async () => {
    const { work } = sandbox();
    const src = put(join(work, "grow.bin"), "x".repeat(3 * 1024 * 1024));
    let first = true;
    const progress: StepProgress = {
      bytes: () => {
        if (!first) return;
        first = false;
        appendFileSync(src, "more");
        utimesSync(src, new Date(), new Date(Date.now() + 5000));
      },
      files: () => {},
      item: () => {},
      note: () => {},
    };
    const dest = join(work, "copy.bin");
    await expect(copyWithProgress(src, dest, new AbortController().signal, progress)).rejects.toThrow(/changed while/);
  });

  test.skipIf(isRoot)("an unreadable source fails with its name; a replaced item is put back", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "locked.txt"), "secret");
    put(join(work, "d", "locked.txt"), "old");
    chmodSync(join(work, "s", "locked.txt"), 0o000);
    try {
      const done = await finish(ctx, await startTransfer(ctx, "copy", [join(work, "s", "locked.txt")], join(work, "d"), "replace"));
      expect(done.state).toBe("failed");
      expect(done.steps[0]!.message).toContain("locked.txt");
      expect(done.steps[0]!.message).toContain("permission");
      expect(done.steps[0]!.message).toContain("put back");
      expect(readFileSync(join(work, "d", "locked.txt"), "utf8")).toBe("old");
      expect((await listTrash(ctx)).count).toBe(0);
    } finally {
      chmodSync(join(work, "s", "locked.txt"), 0o600);
    }
  });
});

suite("cancel", () => {
  test("cancelling mid-copy removes the partial item and reports what was and was not done", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "small.txt"), "done first");
    mkdirSync(join(work, "s", "pad"), { recursive: true });
    put(join(work, "s", "z-last.txt"), "never");
    const huge = join(work, "s", "huge.bin");
    writeFileSync(huge, "");
    truncateSync(huge, 256 * 1024 * 1024);
    const sources = [join(work, "s", "small.txt"), huge, join(work, "s", "z-last.txt")];
    mkdirSync(join(work, "d"));
    const job = await startTransfer(ctx, "copy", sources, join(work, "d"));
    const deadline = Date.now() + 20_000;
    while (job.progress.bytesDone <= 10 && Date.now() < deadline) await sleep(1);
    expect(ctx.jobs.cancel(job.id)).toBe(true);
    const done = await finish(ctx, job);
    expect(done.state).toBe("cancelled");
    expect(done.steps.map((s) => s.state)).toEqual(["done", "skipped", "skipped"]);
    expect(done.steps[1]!.message).toContain("partly made copy was removed");
    expect(done.steps[2]!.message).toContain("Nothing was changed");
    expect(names(join(work, "d"))).toEqual(["small.txt"]);
    expect(existsSync(huge)).toBe(true);
    const history = await loadHistory(ctx);
    expect(history.at(-1)!.state).toBe("cancelled");
    // Retry runs the two unfinished items only.
    const again = ctx.jobs.retry(job.id)!;
    expect(again.total).toBe(2);
    rmSync(huge);
    ctx.jobs.cancel(again.id);
  }, 60_000);

  test("cancel before anything starts changes nothing", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "a.txt"));
    const hub = createJobHub(1, { onStart: (v) => void hubCancel(v.id) });
    let hubCancel: (id: string) => void = () => {};
    hubCancel = (id) => void hub.cancel(id);
    const job = hub.start({ kind: "copy", title: "t", steps: [{ label: "a", prepare: async () => ({ work: async () => void put(join(work, "made.txt")) }) }] });
    const done = await hub.whenDone(job.id);
    expect(done.state).toBe("cancelled");
    expect(existsSync(join(work, "made.txt"))).toBe(false);
    expect(done.skipped).toBe(1);
    void ctx;
  });

  test("an item that finished stays done even if Cancel arrives at that moment", async () => {
    const hub = createJobHub(1);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = hub.start({ kind: "rename", title: "r", steps: [{ label: "a", keepFinishedOnCancel: true, prepare: async () => ({ work: async () => void (await gate) }) }] });
    await sleep(10);
    hub.cancel(job.id);
    release();
    const done = await hub.whenDone(job.id);
    expect(done.steps[0]!.state).toBe("done");
    expect(done.state).toBe("done");
  });
});

suite("move", () => {
  test("moves on one disk by renaming, with progress, and never overwrites", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "s", "a.txt"), "AAA");
    put(join(work, "s", "dir", "b.txt"), "BB");
    put(join(work, "d", "a.txt"), "old");
    const done = await finish(ctx, await startTransfer(ctx, "move", [join(work, "s", "a.txt"), join(work, "s", "dir")], join(work, "d")));
    expect(done.state).toBe("done");
    expect(existsSync(join(work, "s", "a.txt"))).toBe(false);
    expect(readFileSync(join(work, "d", "a.txt"), "utf8")).toBe("old");
    expect(readFileSync(join(work, "d", "a (2).txt"), "utf8")).toBe("AAA");
    expect(done.progress.bytesDone).toBe(5);
    expect(done.progress.filesDone).toBe(2);
  });

  test("moving into the folder it is already in is skipped, not failed", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    const done = await finish(ctx, await startTransfer(ctx, "move", [join(work, "a.txt")], work));
    expect(done.steps[0]!.state).toBe("skipped");
    expect(done.steps[0]!.message).toBe("Already in that folder.");
  });

  test("a folder cannot be moved into itself and stays where it was", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "tree", "sub", "f.txt"));
    const done = await finish(ctx, await startTransfer(ctx, "move", [join(work, "tree")], join(work, "tree", "sub")));
    expect(done.steps[0]!.state).toBe("failed");
    expect(existsSync(join(work, "tree", "sub", "f.txt"))).toBe(true);
  });

  test("protected folders cannot be moved", async () => {
    const { ctx, home, work } = sandbox();
    mkdirSync(work, { recursive: true });
    const done = await finish(ctx, await startTransfer(ctx, "move", [home], work));
    expect(done.steps[0]!.state).toBe("failed");
    expect(existsSync(home)).toBe(true);
  });
});

suite("rename", () => {
  test("renames in place, refuses a taken name for that item only, and reports it", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"), "a");
    put(join(work, "b.txt"), "b");
    put(join(work, "c.txt"), "c");
    const done = await finish(ctx, await startRenames(ctx, [{ path: join(work, "a.txt"), name: "b.txt" }, { path: join(work, "c.txt"), name: "d.txt" }]));
    expect(done.state).toBe("failed");
    expect(done.steps[0]!.state).toBe("failed");
    expect(done.steps[0]!.message).toContain("already exists");
    expect(done.steps[1]!.state).toBe("done");
    expect(names(work)).toEqual(["a.txt", "b.txt", "d.txt"]);
    expect(readFileSync(join(work, "b.txt"), "utf8")).toBe("b");
  });

  test("bad names are refused before anything changes", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    const done = await finish(ctx, await startRenames(ctx, [{ path: join(work, "a.txt"), name: "x/y" }]));
    expect(done.steps[0]!.state).toBe("failed");
    expect(existsSync(join(work, "a.txt"))).toBe(true);
  });
});

suite("requests", () => {
  test("bad requests are refused up front", async () => {
    const { ctx, work } = sandbox();
    await expect(startTransfer(ctx, "copy", [], work)).rejects.toThrow();
    await expect(startTransfer(ctx, "copy", ["relative"], work)).rejects.toThrow();
    await expect(startTransfer(ctx, "copy", [join(work, "a")], join(work, "missing"))).rejects.toThrow(/doesn't exist/);
    await expect(startTransfer(ctx, "copy", [join(work, "a")], ctx.trashRoot)).rejects.toThrow();
    await expect(startRenames(ctx, [{ path: join(work, "a"), name: 5 }])).rejects.toThrow();
  });

  test("measureTree reports unknown when there are too many entries", async () => {
    const { work } = sandbox();
    for (let i = 0; i < 10; i++) put(join(work, "t", `${i}.txt`), "x");
    expect(await measureTree(join(work, "t"), new AbortController().signal, 5)).toBeNull();
    expect(await measureTree(join(work, "t"), new AbortController().signal)).toEqual({ files: 10, bytes: 10 });
  });
});

suite("history", () => {
  test("records finished operations with paths and outcomes, privately, and without file contents", async () => {
    const { ctx, work, data } = sandbox();
    put(join(work, "s", "a.txt"), "TOP-SECRET-CONTENT");
    mkdirSync(join(work, "d"));
    const done = await finish(ctx, await startTransfer(ctx, "copy", [join(work, "s", "a.txt"), join(work, "s", "gone.txt")], join(work, "d")));
    const entries = await loadHistory(ctx);
    expect(entries.length).toBe(1);
    const e = entries[0]!;
    expect(e.id).toBe(done.id);
    expect(e.state).toBe("failed");
    expect([e.done, e.failed]).toEqual([1, 1]);
    expect(e.items[0]).toMatchObject({ source: join(work, "s", "a.txt"), destination: join(work, "d", "a.txt"), state: "done" });
    expect(e.items[1]!.message).toContain("gone.txt");
    const text = readFileSync(historyFile(ctx), "utf8");
    expect(text).not.toContain("TOP-SECRET-CONTENT");
    expect(JSON.parse(text).version).toBe(HISTORY_VERSION);
    expect(statSync(historyFile(ctx)).mode & 0o777).toBe(0o600);
    expect(names(data).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect(await clearHistory(ctx)).toBe(1);
    expect(await loadHistory(ctx)).toEqual([]);
  });

  test("operations still marked running from an earlier run show as interrupted; damaged files are ignored", async () => {
    const { ctx, data } = sandbox();
    mkdirSync(data, { recursive: true });
    const entry = { id: "abcdef012345", kind: "copy", title: "old", state: "running", startedAt: 1, finishedAt: null, done: 0, failed: 0, skipped: 0, total: 1, bytesDone: 0, bytesTotal: null, items: [{ source: "/x", destination: null, state: "running", message: "" }], itemsOmitted: 0, retryOf: null };
    writeFileSync(historyFile(ctx), JSON.stringify({ version: HISTORY_VERSION, entries: [entry, { nonsense: true }, { ...entry, id: "../../etc" }] }));
    const loaded = await loadHistory(ctx);
    expect(loaded.length).toBe(1);
    expect(loaded[0]!.state).toBe("interrupted");
    expect(loaded[0]!.items[0]!.message).toContain("closed before");
    writeFileSync(historyFile(ctx), "{ broken");
    expect(await loadHistory(ctx)).toEqual([]);
    writeFileSync(historyFile(ctx), JSON.stringify({ version: 99, entries: [entry] }));
    expect(await loadHistory(ctx)).toEqual([]);
  });

  test("many operations at once all get recorded", async () => {
    const { ctx, work } = sandbox();
    put(join(work, "a.txt"));
    const jobs = await Promise.all([1, 2, 3, 4, 5].map((i) => startTransfer(ctx, "copy", [join(work, "a.txt")], (mkdirSync(join(work, `d${i}`)), join(work, `d${i}`)))));
    for (const j of jobs) await finish(ctx, j);
    expect((await loadHistory(ctx)).length).toBe(5);
  });

  test("StepSkip is not an error", () => {
    expect(new StepSkip("x")).toBeInstanceOf(Error);
  });
});

suite("the API", () => {
  test("fileops/start, jobs/list, jobs/retry and fileops/history work end to end", async () => {
    const { startFileManagerServer } = await import("../src/features/filemanager/fmServer");
    const { root, home, work } = sandbox();
    put(join(work, "s", "a.txt"), "A");
    mkdirSync(join(work, "d"));
    const server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: "tok", context: { home, dataDir: join(root, "data") } });
    const api = async (op: string, body: unknown = {}) => {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": "tok" }, body: JSON.stringify(body) });
      return { status: res.status, json: (await res.json()) as any };
    };
    try {
      const started = await api("fileops/start", { mode: "copy", sources: [join(work, "s", "a.txt"), join(work, "s", "nope.txt")], dest: join(work, "d") });
      expect(started.status).toBe(200);
      const id = (started.json.data?.job ?? started.json.job).id as string;
      let job: any;
      for (let i = 0; i < 100; i++) {
        const listed = await api("jobs/list");
        job = (listed.json.data?.jobs ?? listed.json.jobs).find((j: any) => j.id === id);
        if (job && job.state !== "running" && job.state !== "waiting") break;
        await sleep(20);
      }
      expect(job.state).toBe("failed");
      expect(job.steps[1].message).toContain("nope.txt");
      put(join(work, "s", "nope.txt"), "N");
      const retried = await api("jobs/retry", { id });
      expect(retried.status).toBe(200);
      const again = await api("jobs/retry", { id });
      expect(again.status).not.toBe(200);
      for (let i = 0; i < 100 && !existsSync(join(work, "d", "nope.txt")); i++) await sleep(20);
      expect(existsSync(join(work, "d", "nope.txt"))).toBe(true);
      await sleep(100);
      const history = await api("fileops/history");
      const entries = history.json.data?.entries ?? history.json.entries;
      expect(entries.length).toBe(2);
      expect(entries.some((e: any) => e.retryOf === id)).toBe(true);
      expect((await api("fileops/start", { mode: "delete", sources: [] })).status).not.toBe(200);
    } finally {
      server.stop(true);
    }
  });
});
