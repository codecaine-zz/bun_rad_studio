import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";
import { MAX_HISTORY, getWatchHub, shellArgv } from "../src/features/filemanager/fmWatch";
import { LogBuffer, MAX_LOG_CHARS, createTextCleaner, stripAnsi } from "../src/features/filemanager/fmWatchLog";
import { presetsFor, shellsFor, watchOperations } from "../src/features/filemanager/fmWatchOps";

const root = mkdtempSync(join(tmpdir(), "fm-watch-"));
const home = join(root, "home");
const BUN = JSON.stringify(process.execPath);
mkdirSync(home);

// Helper programs: one that stays alive and records its process id, one that records the environment, one that prints a lot.
const sleepy = join(root, "sleepy.js");
const envdump = join(root, "envdump.js");
const big = join(root, "big.js");
writeFileSync(sleepy, `require("fs").appendFileSync(process.argv[2], process.pid + "\\n"); console.log("sleepy started"); setTimeout(() => {}, 120000);`);
writeFileSync(envdump, `const e = process.env; require("fs").writeFileSync(process.argv[2], JSON.stringify({ triggered: e.WATCHEXEC_TRIGGERED_PATH, written: e.WATCHEXEC_WRITTEN_PATH, common: e.WATCHEXEC_COMMON_PATH }));`);
writeFileSync(big, `process.stdout.write("x".repeat(1500000) + "\\nTHE END\\n");`);
const sleepyCmd = (pidFile: string) => `${BUN} ${JSON.stringify(sleepy)} ${JSON.stringify(pidFile)}`;

const contexts: FmContext[] = [];
const pidFiles: string[] = [];
let counter = 0;

function newCtx(): FmContext {
  const ctx = createContext({ home, dataDir: join(root, `data${++counter}`) });
  contexts.push(ctx);
  return ctx;
}
function newDir(name = "watched"): string {
  const dir = join(root, `${name}${++counter}`);
  mkdirSync(dir);
  return dir;
}
function newPidFile(): string {
  const file = join(root, `pids${++counter}.txt`);
  writeFileSync(file, "");
  pidFiles.push(file);
  return file;
}
const pidsIn = (file: string) => readFileSync(file, "utf8").split("\n").filter(Boolean).map(Number);
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const op = (ctx: FmContext, name: string, body: Record<string, any> = {}): Promise<any> => watchOperations[name]!(ctx, body) as Promise<any>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(fn: () => T | Promise<T>, what: string, ms = 10_000): Promise<NonNullable<T>> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v as NonNullable<T>;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(25);
  }
}

const baseStart = (dir: string, extra: Record<string, any> = {}) => ({ path: dir, command: "echo hi", confirm: true, postponeInitial: true, debounce: 50, exts: "", ignore: "", ...extra });
async function start(ctx: FmContext, dir: string, extra: Record<string, any> = {}): Promise<string> {
  const { id } = await op(ctx, "watch/start", baseStart(dir, extra));
  await sleep(300); // let the operating system's watcher settle before touching files
  return id;
}
const state = (ctx: FmContext, id: string, extra: Record<string, any> = {}) => op(ctx, "watch/state", { id, ...extra });
const waitRows = (ctx: FmContext, id: string, pred: (s: any) => boolean, what: string) => until(async () => { const s = await state(ctx, id); return pred(s) ? s : null; }, what);
const finished = (s: any) => s.history.length > 0 && s.history.every((r: any) => r.kind !== "running") && !s.running;

afterEach(async () => {
  for (const ctx of contexts.splice(0)) for (const dispose of ctx.disposers.splice(0)) dispose();
  for (const file of pidFiles.splice(0)) for (const pid of pidsIn(file)) await until(() => !alive(pid), `process ${pid} to be gone`);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("starting and stopping", () => {
  test("a watcher runs the command when a file changes, shows its output and history, and stops cleanly", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { command: "echo hello-from-test" });
    expect((await state(ctx, id)).state).toBe("ACTIVE");
    writeFileSync(join(dir, "a.txt"), "1");
    const s = await waitRows(ctx, id, finished, "the run to finish");
    expect(s.log).toContain("hello-from-test");
    expect(s.triggerCount).toBe(1);
    expect(s.lastEvent).toBe("a.txt");
    expect(s.history[0]).toMatchObject({ n: 1, file: "a.txt", status: "SUCCESS", kind: "success", code: 0 });
    expect(s.status).toContain("OK");

    expect(await op(ctx, "watch/stop", { id })).toEqual({ stopped: true });
    expect((await state(ctx, id)).state).toBe("STOPPED");
    writeFileSync(join(dir, "b.txt"), "2");
    await sleep(500);
    expect((await state(ctx, id)).triggerCount).toBe(1);
    expect(getWatchHub(ctx).watchers.size).toBe(1);
    expect(await op(ctx, "watch/remove", { id })).toEqual({ removed: true });
    expect(getWatchHub(ctx).watchers.size).toBe(0);
  });

  test("the command runs in the watch folder unless another folder is given", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const other = newDir("other");
    const cwdOut = join(root, `cwd${++counter}.txt`);
    const script = join(root, `cwd${counter}.js`);
    writeFileSync(script, `require("fs").writeFileSync(${JSON.stringify(cwdOut)}, process.cwd());`);
    const id = await start(ctx, dir, { command: `${BUN} ${JSON.stringify(script)}`, postponeInitial: false, cwd: other });
    await waitRows(ctx, id, finished, "the run");
    expect(readFileSync(cwdOut, "utf8").endsWith(other.slice(other.lastIndexOf("/") + 1))).toBe(true);
    const id2 = await start(ctx, dir, { command: `${BUN} ${JSON.stringify(script)}`, postponeInitial: false });
    await waitRows(ctx, id2, finished, "the second run");
    expect(readFileSync(cwdOut, "utf8").endsWith(dir.slice(dir.lastIndexOf("/") + 1))).toBe(true);
  });

  test("with 'postpone initial run' on nothing runs until a change; off runs at once", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const waiting = await start(ctx, dir, { postponeInitial: true });
    await sleep(400);
    expect((await state(ctx, waiting)).triggerCount).toBe(0);
    const eager = await start(ctx, dir, { postponeInitial: false });
    const s = await waitRows(ctx, eager, finished, "the first run");
    expect(s.history[0]).toMatchObject({ file: "Manual", status: "SUCCESS" });
  });

  test("at most 3 watchers can be active; stopping one makes room, and old stopped ones are tidied up", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const ids = [await start(ctx, dir), await start(ctx, dir), await start(ctx, dir)];
    await expect(op(ctx, "watch/start", baseStart(dir))).rejects.toMatchObject({ code: "TOO_MANY" });
    await op(ctx, "watch/stop", { id: ids[0] });
    const fourth = await start(ctx, dir);
    expect(ids).not.toContain(fourth);
    const list = await op(ctx, "watch/list");
    expect(list.max).toBe(3);
    expect(list.watchers.map((w: any) => w.state).sort()).toEqual(["ACTIVE", "ACTIVE", "ACTIVE", "STOPPED"]);
    // Stopped watchers are kept for their logs, but only a handful.
    await op(ctx, "watch/stop", { id: fourth });
    for (let i = 0; i < 8; i++) {
      const id = await start(ctx, dir);
      await op(ctx, "watch/stop", { id });
    }
    expect(getWatchHub(ctx).watchers.size).toBeLessThanOrEqual(6);
    expect((await op(ctx, "watch/list")).watchers.filter((w: any) => w.state === "ACTIVE").length).toBe(2);
  });
});

describe("what triggers a run", () => {
  test("only files with the chosen extensions trigger it", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { exts: ".txt, md" });
    writeFileSync(join(dir, "a.js"), "x");
    await sleep(300);
    writeFileSync(join(dir, "b.txt"), "x");
    await waitRows(ctx, id, finished, "the run for b.txt");
    await sleep(300);
    const s = await state(ctx, id);
    expect(s.history.map((r: any) => r.file)).toContain("b.txt");
    expect(s.history.map((r: any) => r.file)).not.toContain("a.js");
    expect(s.config.exts).toEqual(["txt", "md"]);
  });

  test("ignore patterns keep matching paths from triggering it, including inside sub-folders", async () => {
    const ctx = newCtx();
    const dir = newDir();
    mkdirSync(join(dir, "skipme"));
    mkdirSync(join(dir, "keep"));
    const id = await start(ctx, dir, { ignore: "skipme, .tmp" });
    writeFileSync(join(dir, "skipme", "x.txt"), "x");
    writeFileSync(join(dir, "y.tmp"), "x");
    await sleep(300);
    writeFileSync(join(dir, "keep", "z.txt"), "x");
    await waitRows(ctx, id, finished, "the run for keep/z.txt");
    await sleep(300);
    const files = (await state(ctx, id)).history.map((r: any) => r.file.replace(/\\/g, "/"));
    expect(files).toContain("keep/z.txt");
    expect(files.some((f: string) => f.includes("skipme") || f.endsWith(".tmp"))).toBe(false);
  });

  test("filters narrow what triggers it further, and a broken filter is refused", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { filters: "special" });
    writeFileSync(join(dir, "plain.txt"), "x");
    await sleep(300);
    writeFileSync(join(dir, "special.txt"), "x");
    await waitRows(ctx, id, finished, "the run");
    await sleep(300);
    expect((await state(ctx, id)).history.map((r: any) => r.file)).toEqual(["special.txt"]);
    await expect(op(ctx, "watch/start", baseStart(dir, { filters: "(" }))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("a burst of changes inside the debounce time makes one run", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { debounce: 500 });
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(dir, "burst.txt"), String(i));
      await sleep(40);
    }
    await waitRows(ctx, id, (s) => s.triggerCount >= 1, "the run");
    await sleep(900);
    const s = await state(ctx, id);
    expect(s.triggerCount).toBe(1);
    expect(s.config.debounce).toBe(500);
  });

  test("the numbers are kept in range", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const low = await start(ctx, dir, { debounce: 1 });
    const high = await start(ctx, dir, { debounce: 999_999 });
    expect((await state(ctx, low)).config.debounce).toBe(50);
    expect((await state(ctx, high)).config.debounce).toBe(10_000);
  });
});

describe("a running command", () => {
  test("restart on change ends the old run's whole process and starts a new one", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const pids = newPidFile();
    const id = await start(ctx, dir, { command: sleepyCmd(pids), restart: true });
    writeFileSync(join(dir, "a.txt"), "1");
    await until(() => pidsIn(pids).length >= 1, "the first run to start");
    const [first] = pidsIn(pids);
    writeFileSync(join(dir, "a.txt"), "2");
    await until(() => pidsIn(pids).length >= 2, "the second run to start");
    await until(() => !alive(first!), "the first run's process to end");
    const s = await state(ctx, id);
    expect(s.history.some((r: any) => r.status === "CANCELLED")).toBe(true);
    expect(s.history[0].kind).toBe("running");
    expect(s.running).toBe(true);
    expect(typeof s.pid).toBe("number");
    expect(s.log).toContain("sleepy started");
  });

  test("with restart off a change during a run is ignored and noted in the log", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const pids = newPidFile();
    const id = await start(ctx, dir, { command: sleepyCmd(pids), restart: false });
    writeFileSync(join(dir, "a.txt"), "1");
    await until(() => pidsIn(pids).length >= 1, "the run to start");
    writeFileSync(join(dir, "a.txt"), "2");
    const s = await waitRows(ctx, id, (x) => x.log.includes("Change ignored"), "the ignored-change note");
    expect(s.triggerCount).toBe(1);
    expect(pidsIn(pids).length).toBe(1);
    expect(s.history.filter((r: any) => r.kind === "running").length).toBe(1);
    expect((await op(ctx, "watch/run", { id })).result).toBe("busy");
  });

  test("Kill ends the command and everything it started; the watcher keeps watching", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const pids = newPidFile();
    const id = await start(ctx, dir, { command: `${sleepyCmd(pids)} & ${sleepyCmd(pids)}`, postponeInitial: false });
    await until(() => pidsIn(pids).length >= 2, "both programs to start");
    expect((await state(ctx, id)).running).toBe(true);
    expect(await op(ctx, "watch/kill", { id })).toEqual({ killed: true });
    for (const pid of pidsIn(pids)) await until(() => !alive(pid), `process ${pid} to end`);
    const s = await state(ctx, id);
    expect(s.running).toBe(false);
    expect(s.pid).toBeNull();
    expect(s.state).toBe("ACTIVE");
    expect(s.history[0].status).toBe("CANCELLED");
    expect(s.log).toContain("stopped by you");
    expect(await op(ctx, "watch/kill", { id })).toEqual({ killed: false });
  });

  test("Run now runs the command without a file change", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { command: "echo manual-run" });
    expect((await op(ctx, "watch/run", { id })).result).toBe("started");
    const s = await waitRows(ctx, id, finished, "the run");
    expect(s.history[0]).toMatchObject({ file: "Manual", status: "SUCCESS" });
    expect(s.log).toContain("manual-run");
    await op(ctx, "watch/stop", { id });
    await expect(op(ctx, "watch/run", { id })).rejects.toMatchObject({ code: "NOT_WATCHING" });
  });

  test("a failing command is recorded as FAILED(n) with its status", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { command: "echo before-failing; exit 3" });
    await op(ctx, "watch/run", { id });
    const s = await waitRows(ctx, id, finished, "the run");
    expect(s.history[0]).toMatchObject({ status: "FAILED(3)", kind: "failed", code: 3 });
    expect(s.log).toContain("before-failing");
    expect(s.log).toContain("status 3");
    expect(s.status).toContain("Failed");
  });

  test("a folder to run in that has gone is reported, not fatal", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const gone = newDir("gone");
    const id = await start(ctx, dir, { cwd: gone });
    rmSync(gone, { recursive: true });
    expect((await op(ctx, "watch/run", { id })).result).toBe("failed");
    const s = await state(ctx, id);
    expect(s.log).toContain("doesn't exist");
    expect(s.state).toBe("ACTIVE");
  });

  test("every run receives the WATCHEXEC_ variables", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const out = join(root, `env${++counter}.json`);
    const id = await start(ctx, dir, { command: `${BUN} ${JSON.stringify(envdump)} ${JSON.stringify(out)}` });
    writeFileSync(join(dir, "changed.txt"), "x");
    await until(() => existsSync(out) && readFileSync(out, "utf8"), "the variables file");
    await waitRows(ctx, id, finished, "the run");
    const seen = JSON.parse(readFileSync(out, "utf8"));
    expect(seen).toEqual({ triggered: join(dir, "changed.txt"), written: join(dir, "changed.txt"), common: dir });
    rmSync(out);
    await op(ctx, "watch/run", { id });
    await waitRows(ctx, id, finished, "the manual run");
    await until(() => existsSync(out), "the manual variables file");
    const manual = JSON.parse(readFileSync(out, "utf8"));
    expect(manual.common).toBe(dir);
    expect(manual.triggered).toBeUndefined();
  });

  test("the history keeps the newest 50 runs, newest first", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { command: "echo x" });
    for (let i = 0; i < MAX_HISTORY + 5; i++) await op(ctx, "watch/run", { id });
    const s = await waitRows(ctx, id, finished, "the last run");
    expect(s.triggerCount).toBe(MAX_HISTORY + 5);
    expect(s.history.length).toBe(MAX_HISTORY);
    expect(s.history[0].n).toBe(MAX_HISTORY + 5);
    expect(s.history.at(-1).n).toBe(6);
  });

  test("clear-on-run empties the log first; the clear operation does too", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { command: "echo run-output", clear: true });
    await op(ctx, "watch/run", { id });
    await waitRows(ctx, id, finished, "run one");
    const before = await state(ctx, id);
    await op(ctx, "watch/run", { id });
    const after = await waitRows(ctx, id, (s) => finished(s) && s.history.length === 2, "run two");
    expect(after.log.match(/Running: echo run-output/g)?.length).toBe(1);
    expect(after.epoch).toBeGreaterThan(before.epoch);
    await op(ctx, "watch/clear", { id });
    const cleared = await state(ctx, id);
    expect(cleared.log).toBe("");
    expect(cleared.epoch).toBeGreaterThan(after.epoch);
    expect(cleared.history.length).toBe(2);
    await op(ctx, "watch/clear", { id, log: false, history: true });
    expect((await state(ctx, id)).history).toEqual([]);
  });

  test("watchers are independent of each other", async () => {
    const ctx = newCtx();
    const a = newDir();
    const b = newDir();
    const one = await start(ctx, a, { command: "echo from-one" });
    const two = await start(ctx, b, { command: "echo from-two" });
    writeFileSync(join(b, "x.txt"), "x");
    const s = await waitRows(ctx, two, finished, "watcher two");
    await sleep(200);
    expect(s.log).toContain("from-two");
    const first = await state(ctx, one);
    expect(first.triggerCount).toBe(0);
    expect(first.log).not.toContain("from-two");
  });

  test("a watched folder that disappears is reported, not a crash, and its command is ended", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const pids = newPidFile();
    const id = await start(ctx, dir, { command: sleepyCmd(pids), postponeInitial: false });
    await until(() => pidsIn(pids).length >= 1, "the run to start");
    rmSync(dir, { recursive: true });
    const s = await state(ctx, id);
    expect(s.state).toBe("ERROR");
    expect(s.message).toContain("gone");
    expect(s.running).toBe(false);
    for (const pid of pidsIn(pids)) await until(() => !alive(pid), "the process to end");
    await expect(op(ctx, "watch/run", { id })).rejects.toMatchObject({ code: "NOT_WATCHING" });
  });
});

describe("the log", () => {
  test("the cursor only grows: reads return what is new, and a clear or an unknown cursor asks for a full reset", () => {
    const log = new LogBuffer(1000);
    log.append("hello ");
    const first = log.read(undefined, undefined);
    expect(first).toMatchObject({ log: "hello ", cursor: 6, reset: true });
    log.append("world");
    expect(log.read(first.cursor, first.epoch)).toMatchObject({ log: "world", cursor: 11, reset: false });
    expect(log.read(11, first.epoch)).toMatchObject({ log: "", cursor: 11, reset: false });
    expect(log.read(99, first.epoch).reset).toBe(true);
    expect(log.read(-1, first.epoch).reset).toBe(true);
    expect(log.read("5", first.epoch).reset).toBe(true);
    log.clear();
    log.append("!");
    expect(log.read(11, first.epoch)).toMatchObject({ log: "!", cursor: 12, reset: true });
    expect(log.cursor).toBe(12);
  });

  test("the oldest text is dropped past the cap, and readers behind it get a reset", () => {
    const log = new LogBuffer(10);
    log.append("0123456789");
    log.append("abcde");
    expect(log.length).toBe(10);
    expect(log.cursor).toBe(15);
    expect(log.read(0, log.epoch)).toMatchObject({ log: "56789abcde", reset: true });
    expect(log.read(5, log.epoch)).toMatchObject({ log: "56789abcde", reset: false });
    expect(log.read(12, log.epoch)).toMatchObject({ log: "cde", reset: false });
    expect(log.snapshot()).toEqual({ text: "56789abcde", truncated: true });
  });

  test("huge output stays within about 1 MB and keeps the end", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { command: `${BUN} ${JSON.stringify(big)}` });
    await op(ctx, "watch/run", { id });
    const s = await waitRows(ctx, id, (x) => finished(x) && x.log.includes("THE END"), "the big output");
    expect(s.log.length).toBeLessThanOrEqual(MAX_LOG_CHARS);
    expect(s.cursor).toBeGreaterThan(1_500_000);
    expect(s.reset).toBe(true);
    const next = await state(ctx, id, { since: s.cursor, epoch: s.epoch });
    expect(next).toMatchObject({ log: "", reset: false, cursor: s.cursor });
  });

  test("polling with the cursor returns only new text", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir, { command: "echo second-run" });
    await op(ctx, "watch/run", { id });
    const one = await waitRows(ctx, id, finished, "run one");
    await op(ctx, "watch/run", { id });
    const two = await waitRows(ctx, id, (s) => finished(s) && s.history.length === 2, "run two");
    const incremental = await state(ctx, id, { since: one.cursor, epoch: one.epoch });
    expect(incremental.reset).toBe(false);
    expect(one.log + incremental.log).toBe(two.log);
  });

  test("colors and cursor codes are removed, even when split between chunks", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m \x1b]0;title\x07ok\r\nnext\rline\x07")).toBe("red ok\nnext\nline");
    const clean = createTextCleaner();
    const enc = new TextEncoder();
    const out = clean(enc.encode("a\x1b[3")) + clean(enc.encode("1mb\x1b[0m\r")) + clean(enc.encode("\nc")) + clean(null, true);
    expect(out).toBe("ab\nc");
    const bytes = enc.encode("é");
    expect(clean(bytes.slice(0, 1)) + clean(bytes.slice(1))).toBe("é");
  });

  test("colored output from a command arrives clean", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const script = join(root, `color${++counter}.js`);
    writeFileSync(script, `process.stdout.write("\\x1b[32mgreen text\\x1b[0m\\n");`);
    const id = await start(ctx, dir, { command: `${BUN} ${JSON.stringify(script)}` });
    await op(ctx, "watch/run", { id });
    const s = await waitRows(ctx, id, finished, "the run");
    expect(s.log).toContain("green text");
    expect(s.log).not.toContain("\x1b");
  });
});

describe("export", () => {
  test("the log is saved to a new file and nothing is ever overwritten", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const out = newDir("exports");
    const id = await start(ctx, dir, { command: "echo exported-text" });
    await op(ctx, "watch/run", { id });
    await waitRows(ctx, id, finished, "the run");
    const first = await op(ctx, "watch/export", { id, folder: out, name: "mylog.txt" });
    expect(first.path).toBe(join(out, "mylog.txt"));
    expect(readFileSync(first.path, "utf8")).toContain("exported-text");
    writeFileSync(first.path, "precious");
    const second = await op(ctx, "watch/export", { id, folder: out, name: "mylog.txt" });
    expect(second.path).toBe(join(out, "mylog (2).txt"));
    expect(readFileSync(first.path, "utf8")).toBe("precious");
    const auto = await op(ctx, "watch/export", { id, folder: out });
    expect(auto.name).toMatch(/^watcher-log-\d{8}-\d{6}\.txt$/);
    expect(readdirSync(out).length).toBe(3);
  });

  test("bad names and folders are refused with plain messages", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const id = await start(ctx, dir);
    await expect(op(ctx, "watch/export", { id, folder: dir, name: "../evil.txt" })).rejects.toMatchObject({ code: "BAD_NAME" });
    await expect(op(ctx, "watch/export", { id, folder: dir, name: ".." })).rejects.toMatchObject({ code: "BAD_NAME" });
    await expect(op(ctx, "watch/export", { id, folder: join(dir, "nope") })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(op(ctx, "watch/export", { id, folder: "relative/folder" })).rejects.toMatchObject({ code: "BAD_PATH" });
    await expect(op(ctx, "watch/export", { id: "w999", folder: dir })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(op(ctx, "watch/export", { id, folder: join(root, "") + "\0" })).rejects.toMatchObject({ code: "BAD_PATH" });
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("bad requests", () => {
  test("starting needs confirm: true", async () => {
    const ctx = newCtx();
    const dir = newDir();
    for (const confirm of [undefined, false, "true", 1]) {
      await expect(op(ctx, "watch/start", { ...baseStart(dir), confirm })).rejects.toMatchObject({ code: "NEEDS_CONFIRM" });
    }
    expect(getWatchHub(ctx).watchers.size).toBe(0);
  });

  test("commands, paths, lists and shells are checked", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const file = join(dir, "file.txt");
    writeFileSync(file, "x");
    const bad = (extra: Record<string, any>, code: string) => expect(op(ctx, "watch/start", baseStart(dir, extra))).rejects.toMatchObject({ code });
    await bad({ command: "" }, "BAD_REQUEST");
    await bad({ command: "   " }, "BAD_REQUEST");
    await bad({ command: 42 }, "BAD_REQUEST");
    await bad({ command: "a".repeat(4001) }, "BAD_REQUEST");
    await bad({ command: "echo\0hi" }, "BAD_REQUEST");
    await bad({ path: "relative" }, "BAD_PATH");
    await bad({ path: undefined }, "BAD_PATH");
    await bad({ path: dir + "\0" }, "BAD_PATH");
    await bad({ path: join(dir, "missing") }, "NOT_FOUND");
    await bad({ path: file }, "NOT_A_FOLDER");
    await bad({ cwd: join(dir, "missing") }, "NOT_FOUND");
    await bad({ cwd: file }, "NOT_A_FOLDER");
    await bad({ cwd: "relative" }, "BAD_PATH");
    await bad({ exts: "a/b" }, "BAD_REQUEST");
    await bad({ exts: [1] }, "BAD_REQUEST");
    await bad({ exts: 5 }, "BAD_REQUEST");
    await bad({ ignore: ["x".repeat(201)] }, "BAD_REQUEST");
    await bad({ ignore: Array.from({ length: 101 }, (_, i) => `p${i}`) }, "BAD_REQUEST");
    await bad({ shell: "/bin/evil" }, "BAD_REQUEST");
    await bad({ shell: "powershell" }, "BAD_REQUEST");
    expect(getWatchHub(ctx).watchers.size).toBe(0);
  });

  test("an exactly 4000 character command is accepted", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const { id } = await op(ctx, "watch/start", baseStart(dir, { command: command4000() }));
    expect((await state(ctx, id)).command.length).toBe(4000);
  });

  test("unknown or malformed watcher ids are refused", async () => {
    const ctx = newCtx();
    for (const name of ["watch/stop", "watch/remove", "watch/run", "watch/kill", "watch/clear", "watch/state"]) {
      for (const id of [undefined, "w42", 7, "__proto__", "constructor"]) {
        await expect(op(ctx, name, { id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
    }
  });

  test("an allowed shell is used", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const shells = shellsFor(ctx.platform);
    expect(shells.length).toBeGreaterThan(0);
    const id = await start(ctx, dir, { shell: "bash", command: "echo $0" });
    await op(ctx, "watch/run", { id });
    const s = await waitRows(ctx, id, finished, "the run");
    if (process.platform !== "win32") expect(s.log).toContain("bash");
    expect(s.config.shell).toBe("bash");
  });
});

describe("pure helpers", () => {
  test("presets and shells fit the platform", () => {
    const posix = presetsFor("linux");
    const win = presetsFor("win32");
    expect(posix.map((p) => p.id)).toEqual(expect.arrayContaining(["hello", "bun-test", "tsc", "eslint", "bun-build", "npm-test", "npm-build", "npm-dev", "pytest", "cargo-test", "go-test", "make"]));
    expect(win.some((p) => p.id === "make")).toBe(false);
    expect(win.find((p) => p.id === "changed")!.command).toContain("%WATCHEXEC_TRIGGERED_PATH%");
    expect(posix.find((p) => p.id === "changed")!.command).toContain("$WATCHEXEC_TRIGGERED_PATH");
    for (const p of [...posix, ...win]) expect(p.hint.length).toBeGreaterThan(10);
    expect(shellsFor("darwin").map((s) => s.id)).toEqual(["sh", "bash", "zsh"]);
    expect(shellsFor("win32").map((s) => s.id)).toEqual(["cmd", "powershell"]);
  });

  test("commands are run through the platform's shell", () => {
    expect(shellArgv("linux", null, "echo hi")).toEqual(["/bin/sh", "-c", "echo hi"]);
    expect(shellArgv("darwin", "zsh", "echo hi")).toEqual(["/bin/zsh", "-c", "echo hi"]);
    expect(shellArgv("win32", null, "echo hi")).toEqual(["cmd.exe", "/d", "/s", "/c", "echo hi"]);
    expect(shellArgv("win32", "powershell", "echo hi")[0]).toBe("powershell.exe");
  });
});

describe("cleanup", () => {
  test("the context's disposers end every watcher and every process they started", async () => {
    const ctx = newCtx();
    const dir = newDir();
    const pids = newPidFile();
    const id = await start(ctx, dir, { command: sleepyCmd(pids), postponeInitial: false });
    await until(() => pidsIn(pids).length >= 1, "the run to start");
    expect(ctx.disposers.length).toBeGreaterThan(0);
    for (const dispose of ctx.disposers.splice(0)) dispose();
    for (const pid of pidsIn(pids)) await until(() => !alive(pid), "the process to end");
    expect(getWatchHub(ctx).watchers.size).toBe(0);
    // A new hub after cleanup works and registers its own cleanup.
    const again = await start(ctx, dir);
    expect(again).toBeTruthy();
    expect(ctx.disposers.length).toBe(1);
    writeFileSync(join(dir, "late.txt"), "x");
    await sleep(300);
  });
});

describe("through the HTTP server", () => {
  let server: ReturnType<typeof startFileManagerServer>;
  let base: string;
  const TOKEN = "watch-test-token";
  const work = join(root, "http-work");

  beforeAll(() => {
    mkdirSync(work);
    server = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: join(root, "http-data") } });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));

  async function api(name: string, body: unknown = {}) {
    const res = await fetch(`${base}/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN }, body: JSON.stringify(body) });
    return { status: res.status, json: (await res.json()) as any };
  }

  test("the operations are registered", () => {
    for (const name of ["presets", "start", "stop", "remove", "run", "kill", "state", "clear", "export", "list"]) expect(API_OPERATIONS).toContain(`watch/${name}`);
  });

  test("presets are served", async () => {
    const { status, json } = await api("watch/presets");
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.presets.length).toBeGreaterThanOrEqual(12);
    expect(json.maxWatchers).toBe(3);
    expect(json.defaults.debounce).toBe(150);
  });

  test("start without confirm is refused with 409; bad input with 400; unknown watcher with 400", async () => {
    const noConfirm = await api("watch/start", { path: work, command: "echo hi" });
    expect(noConfirm.status).toBe(409);
    expect(noConfirm.json.error.code).toBe("NEEDS_CONFIRM");
    expect((await api("watch/start", { path: "nope", command: "echo hi", confirm: true })).status).toBe(400);
    expect((await api("watch/start", { path: work, command: "", confirm: true })).json.error.message).toContain("command");
    const unknown = await api("watch/state", { id: "w404" });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error.code).toBe("NOT_FOUND");
  });

  test("start, change a file, read the state and export the log", async () => {
    const started = await api("watch/start", { path: work, command: "echo over-http", confirm: true, postponeInitial: true, debounce: 50, exts: "txt", ignore: "" });
    expect(started.status).toBe(200);
    const id = started.json.id as string;
    await sleep(300);
    writeFileSync(join(work, "http.txt"), "x");
    const s = await until(async () => {
      const r = await api("watch/state", { id });
      return r.json.history?.length && r.json.history.every((row: any) => row.kind !== "running") ? r.json : null;
    }, "the run to finish");
    expect(s.log).toContain("over-http");
    expect(s.history[0]).toMatchObject({ file: "http.txt", status: "SUCCESS" });
    const exported = await api("watch/export", { id, folder: work, name: "http-log.txt" });
    expect(exported.status).toBe(200);
    expect(readFileSync(exported.json.path, "utf8")).toContain("over-http");
    expect((await api("watch/list")).json.watchers.length).toBe(1);
    expect((await api("watch/remove", { id })).json.removed).toBe(true);
  });

  test("stopping the server ends the watchers and their processes", async () => {
    const own = startFileManagerServer({ port: 0, token: TOKEN, context: { home, dataDir: join(root, "http-data2") } });
    const pids = newPidFile();
    const res = await fetch(`http://127.0.0.1:${own.port}/api/watch/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fm-token": TOKEN },
      body: JSON.stringify({ path: work, command: sleepyCmd(pids), confirm: true, postponeInitial: false }),
    });
    expect(res.status).toBe(200);
    await until(() => pidsIn(pids).length >= 1, "the program to start");
    own.stop(true);
    for (const pid of pidsIn(pids)) await until(() => !alive(pid), "the program to end");
  });
});

function command4000(): string {
  return "echo " + "a".repeat(3995);
}
