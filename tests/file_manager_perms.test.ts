import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext, type FmContext } from "../src/features/filemanager/fmCore";
import { permissionText } from "../src/features/filemanager/fmInfoFile";
import { applyPerms, getPerms, planPerms, protectedChangeReason, undoPerms, type RunControl } from "../src/features/filemanager/fmPerms";
import { applySymbolic, newModeFor, octalOf, parseChange, parseSymbolic, risksOfChange, symbolicOf } from "../src/features/filemanager/fmPermsModel";
import { permsOperations } from "../src/features/filemanager/fmPermsOps";
import { defaultHooks, hooksFor, parseAttribLine, setPermsHooks, type PermStat, type RunResult } from "../src/features/filemanager/fmPermsSys";
import { FmError } from "../src/features/filemanager/fmPaths";
import { API_OPERATIONS, startFileManagerServer } from "../src/features/filemanager/fmServer";

const posix = process.platform !== "win32";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const root = mkdtempSync(join(tmpdir(), "fm-perms-"));
const home = join(root, "home");
let counter = 0;

const modeOf = (p: string) => lstatSync(p).mode & 0o7777;
const typeOf = (p: string) => lstatSync(p).mode & 0o170000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newCtx(extra: { platform?: "linux" | "darwin" | "win32"; home?: string; dataDir?: string } = {}): FmContext {
  if (extra.platform === "win32") {
    // Windows paths can't be made on this computer's path rules, so the context is filled in by hand.
    const data = extra.dataDir ?? "C:\\Users\\me\\data";
    return Object.assign(createContext({ home: root, dataDir: join(root, "unused") }), { platform: "win32" as const, home: extra.home ?? "C:\\Users\\me", dataDir: data, trashRoot: `${data}\\file_manager_trash` });
  }
  return createContext({ home: extra.home ?? home, dataDir: extra.dataDir ?? join(root, `data${++counter}`), platform: extra.platform });
}

/** A fresh folder to work in. */
function work(): string {
  const d = join(root, `w${++counter}`);
  mkdirSync(d, { recursive: true });
  chmodSync(d, 0o755);
  return d;
}

function put(path: string, mode: number, text = "x") {
  writeFileSync(path, text);
  chmodSync(path, mode);
}

/** A small tree: files 644 and 755, a folder with a 600 file, a deeper folder, and three kinds of link. */
function tree(): string {
  const d = work();
  put(join(d, "a.txt"), 0o644);
  put(join(d, "run.sh"), 0o755);
  mkdirSync(join(d, "sub"), { recursive: true });
  chmodSync(join(d, "sub"), 0o755);
  put(join(d, "sub", "c.txt"), 0o600);
  mkdirSync(join(d, "sub", "deep"));
  chmodSync(join(d, "sub", "deep"), 0o755);
  put(join(d, "sub", "deep", "d.txt"), 0o644);
  symlinkSync(join(d, "a.txt"), join(d, "link"));
  symlinkSync(join(d, "nowhere"), join(d, "broken"));
  symlinkSync(d, join(d, "sub", "loop"));
  return d;
}

function snapshot(dir: string): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (p: string) => {
    out[p] = modeOf(p);
    if (lstatSync(p).isDirectory()) for (const n of readdirSync(p)) walk(join(p, n));
  };
  walk(dir);
  return out;
}

const apply = async (ctx: FmContext, body: Record<string, any>) => (await permsOperations["perms/apply"]!(ctx, body)) as any;
const plan = async (ctx: FmContext, body: Record<string, any>) => ((await permsOperations["perms/plan"]!(ctx, body)) as any).plan;
const rejects = async (p: Promise<unknown>, code: string) => {
  try {
    await p;
  } catch (err: any) {
    expect(err).toBeInstanceOf(FmError);
    expect(err.code).toBe(code);
    return err as FmError;
  }
  throw new Error(`expected ${code}, but it succeeded`);
};

afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeAll(() => mkdirSync(home, { recursive: true }));

// ---------------------------------------------------------------------------------------------------------------
describe("reading and applying chmod-style text", () => {
  const cases: Array<[string, number, boolean, number]> = [
    ["u+x", 0o644, false, 0o744],
    ["go-w", 0o666, false, 0o644],
    ["a=", 0o755, false, 0],
    ["a=rx", 0, false, 0o555],
    ["u=rwx,g=rX,o=", 0o644, false, 0o740],
    ["u=rwx,g=rX,o=", 0, true, 0o750],
    ["u+x,g=rX,o-rwx", 0o666, false, 0o740],
    ["u=g", 0o750, false, 0o550],
    ["g=u", 0o700, false, 0o770],
    ["o=g", 0o750, false, 0o755],
    ["a+rX", 0o644, false, 0o644],
    ["a+rX", 0o744, false, 0o755],
    ["a+rX", 0o700, true, 0o755],
    ["u+x-w", 0o644, false, 0o544],
    ["+x", 0o644, false, 0o755],
    ["+t", 0o755, true, 0o1755],
    ["o+t", 0o755, true, 0o1755],
    ["u+t", 0o755, true, 0o755],
    ["u+s", 0o755, false, 0o4755],
    ["g+s", 0o755, true, 0o2755],
    ["a+s", 0o755, false, 0o6755],
    ["o+s", 0o755, false, 0o755],
    ["a-s", 0o6755, false, 0o755],
    ["u=rwx", 0o4755, false, 0o755],
    ["+", 0o644, false, 0o644],
  ];
  test.each(cases)("%s on %i (folder: %p) gives %i", (text, before, isDir, after) => {
    expect(applySymbolic(parseSymbolic(text), before, isDir)).toBe(after);
  });

  test("the same results as the real chmod program for plain read/write/run changes", () => {
    if (!posix) return;
    // No spec here uses X after another change in the same text: chmod programs differ on what "already runs" means then.
    const specs = ["u+x", "go-w", "a=r", "u=g", "g=u", "o=g", "a+rX", "u-x", "go=u", "a=", "u+r-w", "g+rw,o+r", "a-rwx,u+rw", "u=rX,go=", "u=rwx,g=u,o=g"];
    const d = work();
    for (const spec of specs) {
      for (const before of [0o000, 0o644, 0o755, 0o700, 0o070, 0o421]) {
        for (const isDir of [false, true]) {
          const p = join(d, "probe");
          if (isDir) mkdirSync(p);
          else writeFileSync(p, "");
          chmodSync(p, before);
          const r = Bun.spawnSync(["chmod", spec, p]);
          expect(r.exitCode, spec).toBe(0);
          expect(applySymbolic(parseSymbolic(spec), before, isDir), `${spec} on ${before.toString(8)} ${isDir ? "folder" : "file"}`).toBe(modeOf(p));
          chmodSync(p, 0o700);
          rmSync(p, { recursive: true });
        }
      }
    }
  });

  const bad = ["", " ", "u", "ugo", "rwx", "644", "u+q", "u+x,", ",u+x", "u+x,,g+w", "u=rwxx", "u=gr", "u=ug", "u+ a", "u+x\n", "u=r w", "a+rwx;ls", "u+x`id`", "$(id)", "𝑢+x", "ü+x", "u+x\u0000", "a+rwx|", "+x ", "g=a", "u+rx a"];
  test.each(bad)("%j is refused with a plain sentence", (text) => {
    try {
      parseSymbolic(text);
    } catch (err: any) {
      expect(err).toBeInstanceOf(FmError);
      expect(err.code).toBe("BAD_MODE");
      expect(err.message.length).toBeGreaterThan(8);
      return;
    }
    throw new Error(`${JSON.stringify(text)} was accepted`);
  });

  test("a text that is too long, or not text, is refused", () => {
    expect(() => parseSymbolic("u+x,".repeat(60) + "g+w")).toThrow(/too long/);
    expect(() => parseSymbolic("u+x" + ",g+w".repeat(60))).toThrow(/too long/);
    for (const v of [undefined, null, 5, {}, []]) expect(() => parseSymbolic(v)).toThrow(FmError);
  });

  test("fuzz: any short text either parses or is refused with BAD_MODE, and a parsed one always stays inside twelve bits", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const alphabet = "ugoa+-=rwxXst,u g\u00e9";
    let ok = 0;
    for (let i = 0; i < 4000; i++) {
      let s = "";
      for (let n = Math.floor(rnd() * 12); n > 0; n--) s += alphabet[Math.floor(rnd() * alphabet.length)];
      try {
        const clauses = parseSymbolic(s);
        ok++;
        for (const before of [0, 0o644, 0o7777]) for (const isDir of [false, true]) {
          const after = applySymbolic(clauses, before, isDir);
          expect(after >= 0 && after <= 0o7777 && Number.isInteger(after)).toBe(true);
        }
      } catch (err: any) {
        expect(err).toBeInstanceOf(FmError);
        expect(err.code).toBe("BAD_MODE");
      }
    }
    expect(ok).toBeGreaterThan(100);
  });
});

describe("mode arithmetic and the change request", () => {
  test("octal and rwx text agree with the More info panel's own formatting for every mode", () => {
    for (let mode = 0; mode <= 0o7777; mode += 1) expect(symbolicOf(mode)).toBe(permissionText(mode));
    expect(octalOf(0o644)).toBe("644");
    expect(octalOf(0o7)).toBe("007");
    expect(octalOf(0o4755)).toBe("4755");
    expect(octalOf(0o1000)).toBe("1000");
  });

  test("exact, add/remove and text changes, with different results for files and folders", () => {
    const set = parseChange({ set: { file: 0o644, dir: 0o755 } }, "linux");
    expect(newModeFor(0o600, false, set)).toBe(0o644);
    expect(newModeFor(0o600, true, set)).toBe(0o755);
    const onlyFiles = parseChange({ set: { file: 0o600 } }, "linux");
    expect(newModeFor(0o777, true, onlyFiles)).toBe(0o777);
    expect(newModeFor(0o777, false, onlyFiles)).toBe(0o600);
    const bits = parseChange({ add: 0o444, remove: 0o222 }, "linux");
    expect(newModeFor(0o622, false, bits)).toBe(0o444);
    expect(newModeFor(0o0, false, parseChange({ symbolic: "a+rX" }, "linux"))).toBe(0o444);
    expect(newModeFor(0o17777, false, parseChange({ set: 0 }, "linux"))).toBe(0);
  });

  test("the capital-X rule: a file that doesn't run doesn't start to; one that does, does", () => {
    const c = parseChange({ add: 0o755, recursive: { scope: "all", xOnlyIfExecutable: true } }, "linux");
    expect(newModeFor(0o600, false, c)).toBe(0o644);
    expect(newModeFor(0o700, false, c)).toBe(0o755);
    expect(newModeFor(0o600, true, c)).toBe(0o755);
  });

  test.each([
    [{}, "Nothing to change"],
    [{ set: 8 * 8 * 8 * 8 }, "whole number"],
    [{ set: -1 }, "whole number"],
    [{ set: 1.5 }, "whole number"],
    [{ set: "644" }, "whole number"],
    [{ set: 0o644, add: 1 }, "one kind of change"],
    [{ add: 0o200, remove: 0o200 }, "both added and removed"],
    [{ set: {} }, "files, folders or both"],
    [{ set: { file: 1, other: 2 } }, "isn't"],
    [{ symbolic: "u+q" }, "permission letter"],
    [{ symbolic: "u+x", recursive: { scope: "everything" } }, "Choose files"],
    [{ symbolic: "u+x", recursive: { scope: "all", surprise: 1 } }, "isn't an option"],
    [{ symbolic: "u+x", extra: 1 }, "isn't something"],
    [{ symbolic: "u+x", flags: { locked: "yes" } }, "on or off"],
    [{ flags: { locked: true } }, "macOS"],
    [{ flags: { hidden: true } }, "dot"],
    [{ flags: { readonly: true } }, "Windows"],
    [{ flags: { nope: true } }, "isn't a setting"],
    [{ flags: {} }, "Nothing to change"],
  ])("a bad request %j is refused: %s", (raw, words) => {
    try {
      parseChange(raw, "linux");
    } catch (err: any) {
      expect(err).toBeInstanceOf(FmError);
      expect(err.message).toContain(words);
      return;
    }
    throw new Error("accepted");
  });

  test("non-objects are refused, and Windows takes only the Windows settings", () => {
    for (const v of [undefined, null, "u+x", 5, [], true]) expect(() => parseChange(v, "linux")).toThrow(FmError);
    expect(() => parseChange({ symbolic: "u+x" }, "win32")).toThrow(/Windows doesn't use/);
    expect(parseChange({ flags: { readonly: true, hidden: false } }, "win32").flags).toEqual({ readonly: true, hidden: false });
    expect(parseChange({ flags: { locked: true, hidden: true } }, "darwin").flags).toEqual({ locked: true, hidden: true });
  });

  test("which changes are risky", () => {
    expect(risksOfChange(0o644, 0o777, false)).toContain("world-writable");
    expect(risksOfChange(0o666, 0o666, false)).toEqual([]);
    expect(risksOfChange(0o755, 0o755 & ~0o700, true)).toContain("owner-lockout");
    expect(risksOfChange(0o644, 0o444, false)).toContain("owner-lockout");
    expect(risksOfChange(0o755, 0o655, true)).toContain("owner-lockout");
    expect(risksOfChange(0o755, 0o644, false)).toEqual([]);
    expect(risksOfChange(0o755, 0o4755, false)).toEqual(["special-bits"]);
    expect(risksOfChange(0o755, 0o2755, true)).toEqual([]);
    expect(risksOfChange(0o755, 0o1755, true)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("looking at items", () => {
  test("modes, owners, links and what can be changed", async () => {
    const ctx = newCtx();
    const d = tree();
    const out = await getPerms(ctx, hooksFor(ctx), [join(d, "a.txt"), join(d, "sub"), join(d, "link"), join(d, "broken")]);
    const [file, folder, link, broken] = out.items;
    expect(file).toMatchObject({ name: "a.txt", isDir: false, isLink: false, mode: 0o644, octal: "644", symbolic: "rw-r--r--", canChange: true, reason: null });
    expect(folder).toMatchObject({ isDir: true, mode: 0o755, octal: "755", symbolic: "rwxr-xr-x" });
    expect(link).toMatchObject({ isLink: true, mode: null, canChange: false });
    expect(link!.reason).toContain("link");
    expect(broken).toMatchObject({ isLink: true, canChange: false });
    expect(out.support).toMatchObject({ platform: ctx.platform, mode: true, specialBits: true });
    if (existsSync("/usr/bin/stat")) {
      expect(typeof file!.owner).toBe("string");
      expect(typeof file!.group).toBe("string");
    }
    expect(JSON.stringify(out)).not.toMatch(/\bundefined\b/);
  });

  test("a missing item is described, not thrown; bad input is refused", async () => {
    const ctx = newCtx();
    const out = await getPerms(ctx, hooksFor(ctx), [join(work(), "ghost")]);
    expect(out.items[0]).toMatchObject({ canChange: false, mode: null });
    expect(out.items[0]!.reason).toContain("doesn't exist");
    await rejects(getPerms(ctx, hooksFor(ctx), []), "BAD_REQUEST");
    await rejects(getPerms(ctx, hooksFor(ctx), "x"), "BAD_REQUEST");
    await rejects(getPerms(ctx, hooksFor(ctx), ["relative/path"]), "BAD_PATH");
    await rejects(getPerms(ctx, hooksFor(ctx), [`${work()}/a\0b`]), "BAD_PATH");
  });

  test("an item that someone else owns can't be changed (checked with a different user id, so it also works as root)", async () => {
    const ctx = newCtx();
    const d = tree();
    setPermsHooks(ctx, { uid: () => (process.getuid!() === 4242 ? 4243 : 4242) });
    const out = await getPerms(ctx, hooksFor(ctx), [join(d, "a.txt")]);
    expect(out.items[0]).toMatchObject({ canChange: false });
    expect(out.items[0]!.reason).toContain("aren't the owner");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("preview and change agree", () => {
  test("the preview changes nothing, and counts what would happen", async () => {
    const ctx = newCtx();
    const d = tree();
    const before = snapshot(d);
    const p = await plan(ctx, { paths: [join(d, "a.txt"), join(d, "run.sh")], change: { set: 0o644 } });
    expect(p.counts).toMatchObject({ considered: 2, willChange: 1, alreadyCorrect: 1, cannotChange: 0, skipped: 0 });
    expect(p.examples).toHaveLength(1);
    expect(p.examples[0]).toMatchObject({ path: join(d, "run.sh"), before: "755", after: "644", beforeText: "rwxr-xr-x", afterText: "rw-r--r--" });
    expect(p.needsConfirm).toBe(false);
    expect(snapshot(d)).toEqual(before);
  });

  test("for several kinds of change, what the preview said is what happened", async () => {
    const changes: Array<Record<string, any>> = [
      { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } },
      { symbolic: "go-rwx", recursive: { scope: "all" } },
      { symbolic: "a+rX", recursive: { scope: "all" } },
      { add: 0o111, recursive: { scope: "files", xOnlyIfExecutable: true } },
      { remove: 0o022, recursive: { scope: "dirs" } },
      { set: 0o750 },
    ];
    for (const change of changes) {
      const ctx = newCtx();
      const d = tree();
      const p = await plan(ctx, { paths: [d], change });
      const before = snapshot(d);
      const r = (await apply(ctx, { paths: [d], change, confirmed: true })).result;
      const after = snapshot(d);
      const real = Object.keys(before).filter((k) => before[k] !== after[k]);
      expect(r.counts.changed, JSON.stringify(change)).toBe(p.counts.willChange);
      expect(real.length, JSON.stringify(change)).toBe(p.counts.willChange);
      expect(r.counts.alreadyCorrect).toBe(p.counts.alreadyCorrect);
      expect(r.counts.skipped).toBe(p.counts.skipped);
      for (const ex of p.examples) expect(octalOf(after[ex.path]!), ex.path).toBe(ex.after);
    }
  });

  test("scopes: only files, only folders, or both (the folder itself follows its type)", async () => {
    for (const [scope, filesChange, dirsChange] of [["files", true, false], ["dirs", false, true], ["all", true, true]] as const) {
      const ctx = newCtx();
      const d = tree();
      await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope } }, confirmed: true });
      expect(modeOf(join(d, "a.txt")) === 0o600).toBe(filesChange);
      expect(modeOf(join(d, "sub", "deep", "d.txt")) === 0o600).toBe(filesChange);
      expect(modeOf(d) === 0o700).toBe(dirsChange);
      expect(modeOf(join(d, "sub", "deep")) === 0o700).toBe(dirsChange);
    }
  });

  test("capital X: making things readable adds 'run' only to folders and to files that already run", async () => {
    const ctx = newCtx();
    const d = tree();
    chmodSync(join(d, "sub"), 0o700);
    await apply(ctx, { paths: [d], change: { symbolic: "a+rX", recursive: { scope: "all" } }, confirmed: true });
    expect(modeOf(join(d, "a.txt"))).toBe(0o644);
    expect(modeOf(join(d, "sub", "c.txt"))).toBe(0o644);
    expect(modeOf(join(d, "run.sh"))).toBe(0o755);
    expect(modeOf(join(d, "sub"))).toBe(0o755);
    // the same with the switch, for a change that is not written with X
    const ctx2 = newCtx();
    const e = tree();
    await apply(ctx2, { paths: [e], change: { add: 0o444 | 0o111, recursive: { scope: "all", xOnlyIfExecutable: true } }, confirmed: true });
    expect(modeOf(join(e, "a.txt"))).toBe(0o644);
    expect(modeOf(join(e, "run.sh"))).toBe(0o755);
    expect(modeOf(join(e, "sub"))).toBe(0o755);
  });

  test("a folder and something inside it chosen together are handled once", async () => {
    const ctx = newCtx();
    const d = tree();
    const p = await plan(ctx, { paths: [d, join(d, "sub", "c.txt"), d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } } });
    expect(p.counts.willChange + p.counts.alreadyCorrect).toBe(7);
  });

  test("the type bits of files and folders stay as they are, even for the largest mode", async () => {
    const ctx = newCtx();
    const d = tree();
    const f = join(d, "a.txt");
    const types = [typeOf(f), typeOf(join(d, "sub")), typeOf(join(d, "link"))];
    await apply(ctx, { paths: [f, join(d, "sub")], change: { set: 0o1777 }, confirmed: true });
    expect([typeOf(f), typeOf(join(d, "sub")), typeOf(join(d, "link"))]).toEqual(types);
    expect(modeOf(join(d, "sub"))).toBe(0o1777);
  });

  test("names with spaces, quotes, dashes, newlines and accents are just names", async () => {
    const ctx = newCtx();
    const d = work();
    const names = ["a b.txt", `q"uote'.txt`, "-rf", "--help", "new\nline", "naïve ☃.txt", "$(touch hacked)", "; rm -rf x"];
    for (const n of names) put(join(d, n), 0o644);
    const r = (await apply(ctx, { paths: names.map((n) => join(d, n)), change: { set: 0o600 } })).result;
    expect(r.counts.changed).toBe(names.length);
    for (const n of names) expect(modeOf(join(d, n))).toBe(0o600);
    expect(existsSync(join(d, "hacked"))).toBe(false);
    expect(readdirSync(d).length).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("links, odd items and other disks", () => {
  test("a link is never changed, and neither is what it points to; broken and looping links are fine", async () => {
    const ctx = newCtx();
    const d = tree();
    const target = join(d, "a.txt");
    const before = modeOf(target);
    const r = (await apply(ctx, { paths: [join(d, "link"), join(d, "broken")], change: { set: 0o600 } })).result;
    expect(r.counts).toMatchObject({ changed: 0, skipped: 2 });
    expect(modeOf(target)).toBe(before);
    const p = await plan(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } } });
    expect(p.skippedBecause).toEqual([{ reason: "link", count: 3 }]);
    const done = (await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } }, confirmed: true })).result;
    expect(done.counts.skipped).toBe(3);
    expect(done.counts.changed).toBe(p.counts.willChange);
    expect(modeOf(target)).toBe(0o600); // it was a real file in the folder, changed as itself
  });

  test("a link to a folder outside is not entered", async () => {
    const ctx = newCtx();
    const outside = tree();
    const d = work();
    symlinkSync(outside, join(d, "to-outside"));
    const snap = snapshot(outside);
    await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } }, confirmed: true });
    expect(snapshot(outside)).toEqual(snap);
  });

  test("pipes and other special items are left alone", async () => {
    const ctx = newCtx();
    const d = work();
    const fifo = join(d, "pipe");
    if (Bun.spawnSync(["mkfifo", fifo]).exitCode !== 0) return;
    const before = modeOf(fifo);
    const r = (await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } }, confirmed: true })).result;
    expect(r.counts.skipped).toBe(1);
    expect(modeOf(fifo)).toBe(before);
  });

  test("an item on another disk is skipped and not entered, but a whole run on that disk works", async () => {
    const ctx = newCtx();
    const d = tree();
    const real = hooksFor(ctx).fs;
    const withDev = (dev: (p: string) => number) => ({
      ...real,
      lstat: async (p: string) => {
        const st = await real.lstat(p);
        return Object.assign(Object.create(st), { dev: dev(p), mode: st.mode, ino: st.ino, uid: st.uid, gid: st.gid, isDirectory: () => st.isDirectory(), isSymbolicLink: () => st.isSymbolicLink(), isFile: () => st.isFile() }) as PermStat;
      },
    });
    setPermsHooks(ctx, { fs: withDev((p) => (p.startsWith(join(d, "sub")) ? 99 : 1)) });
    const p = await plan(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } } });
    expect(p.skippedBecause.map((s: { reason: string }) => s.reason)).toContain("on another disk");
    const snap = snapshot(join(d, "sub"));
    await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } }, confirmed: true });
    expect(snapshot(join(d, "sub"))).toEqual(snap);
    expect(modeOf(join(d, "a.txt"))).toBe(0o600);
    // started on that disk: everything below it is on the same one
    const ctx2 = newCtx();
    setPermsHooks(ctx2, { fs: withDev(() => 99) });
    const e = tree();
    await apply(ctx2, { paths: [e], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } }, confirmed: true });
    expect(modeOf(join(e, "sub", "deep", "d.txt"))).toBe(0o600);
  });

  test("a folder that can't be opened is reported, and the rest still changes (not as an administrator)", async () => {
    if (isRoot) return; // an administrator can open any folder, so there is nothing to report
    const ctx = newCtx();
    const d = tree();
    chmodSync(join(d, "sub"), 0o000);
    try {
      const p = await plan(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o755 }, recursive: { scope: "all" } } });
      expect(p.problems.some((x: any) => x.path === join(d, "sub") && x.reason.includes("Couldn't look inside"))).toBe(true);
      await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o755 }, recursive: { scope: "all" } }, confirmed: true });
      expect(modeOf(join(d, "a.txt"))).toBe(0o600);
    } finally {
      chmodSync(join(d, "sub"), 0o755);
    }
  });

  test("items in the app's Recycle Bin are never entered", async () => {
    const d = work();
    const ctx = newCtx({ dataDir: join(d, "data") });
    mkdirSync(ctx.trashRoot, { recursive: true });
    put(join(ctx.trashRoot, "kept.txt"), 0o644);
    put(join(d, "mine.txt"), 0o644);
    const r = (await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o755 }, recursive: { scope: "all" } }, confirmed: true })).result;
    expect(modeOf(join(ctx.trashRoot, "kept.txt"))).toBe(0o644);
    expect(modeOf(join(d, "mine.txt"))).toBe(0o600);
    expect(r.counts.skipped).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("places that must not be changed", () => {
  test("system folders and the Recycle Bin are refused outright, with nothing changed", async () => {
    const ctx = newCtx();
    for (const p of ["/usr/bin/env", "/etc/hosts", "/bin", "/", "/usr", "/System", ctx.trashRoot, join(ctx.trashRoot, "x")]) {
      const before = existsSync(p) ? modeOf(p) : null;
      await rejects(plan(ctx, { paths: [p], change: { set: 0o777 } }), "PROTECTED");
      await rejects(apply(ctx, { paths: [p], change: { set: 0o777 }, confirmed: true }), "PROTECTED");
      if (before !== null) expect(modeOf(p)).toBe(before);
    }
  });

  test("one protected item among others refuses the whole request", async () => {
    const ctx = newCtx();
    const d = tree();
    const before = snapshot(d);
    await rejects(apply(ctx, { paths: [join(d, "a.txt"), "/usr/bin/env"], change: { set: 0o600 } }), "PROTECTED");
    expect(snapshot(d)).toEqual(before);
  });

  test("the home folder and its main folders may be changed themselves, but the home folder is refused for 'everything inside'", async () => {
    const h = work();
    const ctx = newCtx({ home: h });
    for (const n of ["Documents", "Downloads"]) mkdirSync(join(h, n));
    expect(protectedChangeReason(ctx, h, false)).toBeNull();
    expect(protectedChangeReason(ctx, h, true)).toContain("home folder");
    expect(protectedChangeReason(ctx, join(h, "Documents"), false)).toBeNull();
    expect(protectedChangeReason(ctx, join(h, "Documents"), true)).toBeNull();
    await rejects(plan(ctx, { paths: [h], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } } }), "PROTECTED");
    const r = (await apply(ctx, { paths: [h], change: { set: 0o750 } })).result;
    expect(r.counts.changed).toBe(1);
    expect(modeOf(h)).toBe(0o750);
    chmodSync(h, 0o755);
    expect(protectedChangeReason(ctx, "/Users", false)).not.toBeNull();
    expect(protectedChangeReason(ctx, "/home", false)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("what needs the person's confirmation", () => {
  const confirmNeeded = async (ctx: FmContext, body: Record<string, any>, risk: string) => {
    const err = await rejects(apply(ctx, body), "NEEDS_CONFIRM");
    expect((err.details as any).risks.map((r: any) => r.code)).toContain(risk);
    expect((err.details as any).risks.every((r: any) => typeof r.message === "string" && r.message.length > 10)).toBe(true);
    return err;
  };

  test("777 and anything else world-writable", async () => {
    const ctx = newCtx();
    const d = tree();
    const f = join(d, "a.txt");
    await confirmNeeded(ctx, { paths: [f], change: { set: 0o777 } }, "world-writable");
    await confirmNeeded(ctx, { paths: [f], change: { symbolic: "o+w" } }, "world-writable");
    await confirmNeeded(ctx, { paths: [f], change: { add: 0o002 } }, "world-writable");
    expect(modeOf(f)).toBe(0o644);
    expect((await plan(ctx, { paths: [f], change: { set: 0o777 } })).needsConfirm).toBe(true);
    await apply(ctx, { paths: [f], change: { set: 0o777 }, confirmed: true });
    expect(modeOf(f)).toBe(0o777);
  });

  test("only a true 'confirmed' counts: the server decides, not the page", async () => {
    const ctx = newCtx();
    const f = join(tree(), "a.txt");
    for (const confirmed of [undefined, false, "true", 1, "yes", {}, [true]]) await confirmNeeded(ctx, { paths: [f], change: { set: 0o777 }, confirmed }, "world-writable");
    expect(modeOf(f)).toBe(0o644);
    // a request with no risk doesn't need it
    await apply(ctx, { paths: [f], change: { set: 0o600 } });
    expect(modeOf(f)).toBe(0o600);
  });

  test("taking away your own read, write or open access", async () => {
    const ctx = newCtx();
    const d = tree();
    await confirmNeeded(ctx, { paths: [join(d, "a.txt")], change: { set: 0o044 } }, "owner-lockout");
    await confirmNeeded(ctx, { paths: [join(d, "a.txt")], change: { symbolic: "u-w" } }, "owner-lockout");
    await confirmNeeded(ctx, { paths: [join(d, "sub")], change: { symbolic: "u-x" } }, "owner-lockout");
    await apply(ctx, { paths: [join(d, "a.txt")], change: { symbolic: "u-x" } }); // a file that is not run is no lock-out
    await apply(ctx, { paths: [join(d, "run.sh")], change: { symbolic: "u-x" } });
    expect(modeOf(join(d, "sub"))).toBe(0o755);
  });

  test("setuid and setgid on files; not on folders; sticky never", async () => {
    const ctx = newCtx();
    const d = tree();
    const f = join(d, "run.sh");
    await confirmNeeded(ctx, { paths: [f], change: { set: 0o4755 } }, "special-bits");
    await confirmNeeded(ctx, { paths: [f], change: { symbolic: "g+s" } }, "special-bits");
    expect(modeOf(f)).toBe(0o755);
    await apply(ctx, { paths: [join(d, "sub")], change: { symbolic: "g+s" } });
    expect(modeOf(join(d, "sub")) & 0o2000).toBe(0o2000);
    await apply(ctx, { paths: [join(d, "sub", "deep")], change: { symbolic: "+t" } });
    expect(modeOf(join(d, "sub", "deep")) & 0o1000).toBe(0o1000);
  });

  test("more than 50 items at once in 'everything inside', but not 50", async () => {
    const ctx = newCtx();
    const many = work();
    for (let i = 0; i < 60; i++) put(join(many, `f${i}.txt`), 0o644);
    const change = { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "files" } };
    await confirmNeeded(ctx, { paths: [many], change }, "many-items");
    expect(modeOf(join(many, "f1.txt"))).toBe(0o644);
    await apply(ctx, { paths: [many], change, confirmed: true });
    expect(modeOf(join(many, "f1.txt"))).toBe(0o600);
    const few = work();
    for (let i = 0; i < 50; i++) put(join(few, `f${i}.txt`), 0o644);
    await apply(ctx, { paths: [few], change }); // exactly 50 changes: fine
    expect(modeOf(join(few, "f1.txt"))).toBe(0o600);
    // many items chosen one by one are not 'everything inside'
    const picked = work();
    const list: string[] = [];
    for (let i = 0; i < 60; i++) {
      put(join(picked, `f${i}.txt`), 0o644);
      list.push(join(picked, `f${i}.txt`));
    }
    await apply(ctx, { paths: list, change: { set: 0o600 } });
    expect(modeOf(list[3]!)).toBe(0o600);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("Undo", () => {
  test("puts back every exact mode of a whole run", async () => {
    const ctx = newCtx();
    const d = tree();
    const before = snapshot(d);
    const r = (await apply(ctx, { paths: [d], change: { set: { file: 0o4600, dir: 0o2700 }, recursive: { scope: "all" } }, confirmed: true })).result;
    expect(r.undo.count).toBe(r.counts.changed);
    expect(snapshot(d)).not.toEqual(before);
    const u = ((await permsOperations["perms/undo"]!(ctx, { undo: r.undo.id })) as any).result;
    expect(u.restored).toBe(r.counts.changed);
    expect(u.skippedCount).toBe(0);
    expect(snapshot(d)).toEqual(before);
    await rejects(permsOperations["perms/undo"]!(ctx, { undo: r.undo.id }), "NO_UNDO");
  });

  test("a folder that lost its 'open' permission is restored before what is inside it", async () => {
    if (isRoot) return; // an administrator isn't stopped by a closed folder, so the order can't be seen
    const ctx = newCtx();
    const d = tree();
    const before = snapshot(d);
    const r = (await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o000 }, recursive: { scope: "all" } }, confirmed: true })).result;
    expect(r.counts.failed).toBe(0);
    expect(modeOf(join(d)) & 0o777).toBe(0);
    const u = ((await permsOperations["perms/undo"]!(ctx, { undo: r.undo.id })) as any).result;
    expect(u.skippedCount).toBe(0);
    expect(snapshot(d)).toEqual(before);
  });

  test("items that were changed again, replaced, or lost since are skipped and left alone", async () => {
    const ctx = newCtx();
    const d = tree();
    const r = (await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } }, confirmed: true })).result;
    chmodSync(join(d, "a.txt"), 0o640); // changed again by someone else
    unlinkSync(join(d, "run.sh"));
    put(join(d, "run.sh"), 0o666); // same name, a different file
    rmSync(join(d, "sub", "deep", "d.txt")); // gone
    const u = ((await permsOperations["perms/undo"]!(ctx, { undo: r.undo.id })) as any).result;
    expect(u.skippedCount).toBe(3);
    expect(u.skipped.map((s: any) => s.reason).join(" ")).toMatch(/changed again/);
    expect(u.skipped.map((s: any) => s.reason).join(" ")).toMatch(/replaced/);
    expect(u.skipped.map((s: any) => s.reason).join(" ")).toMatch(/doesn't exist/);
    expect(modeOf(join(d, "a.txt"))).toBe(0o640);
    expect(modeOf(join(d, "run.sh"))).toBe(0o666);
    expect(modeOf(d)).toBe(0o755);
    expect(modeOf(join(d, "sub", "c.txt"))).toBe(0o600);
  });

  test("a change that changed nothing has nothing to undo, and a made-up token is refused", async () => {
    const ctx = newCtx();
    const f = join(tree(), "a.txt");
    const r = (await apply(ctx, { paths: [f], change: { set: 0o644 } })).result;
    expect(r.undo).toBeNull();
    for (const token of ["nope", "", undefined, 5, {}, "0".repeat(18)]) await rejects(permsOperations["perms/undo"]!(ctx, { undo: token }), "NO_UNDO");
  });

  test("two servers never share undo tokens", async () => {
    const a = newCtx();
    const b = newCtx();
    const f = join(tree(), "a.txt");
    const r = (await apply(a, { paths: [f], change: { set: 0o600 } })).result;
    await rejects(permsOperations["perms/undo"]!(b, { undo: r.undo.id }), "NO_UNDO");
    expect((((await permsOperations["perms/undo"]!(a, { undo: r.undo.id })) as any).result).restored).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("things going wrong, in plain words", () => {
  const errorKinds: Array<[string, RegExp]> = [
    ["EPERM", /owner|administrator/],
    ["EACCES", /access/],
    ["EROFS", /read-only/],
    ["ENOENT", /doesn't exist/],
  ];
  test.each(errorKinds)("%s from the computer is explained per item, and the others still change", async (code, words) => {
    const ctx = newCtx();
    const d = work();
    put(join(d, "bad.txt"), 0o644);
    put(join(d, "good.txt"), 0o644);
    const real = hooksFor(ctx).fs;
    setPermsHooks(ctx, { fs: { ...real, chmod: async (p, m) => { if (p.endsWith("bad.txt")) throw Object.assign(new Error("x"), { code }); await real.chmod(p, m); } } });
    const r = (await apply(ctx, { paths: [join(d, "bad.txt"), join(d, "good.txt")], change: { set: 0o600 } })).result;
    expect(r.counts).toMatchObject({ changed: 1, failed: 1 });
    expect(r.problems[0].path).toBe(join(d, "bad.txt"));
    expect(r.problems[0].reason).toMatch(words);
    expect(r.problems[0].reason).not.toMatch(/undefined|null|\[object/);
    expect(modeOf(join(d, "good.txt"))).toBe(0o600);
    expect(modeOf(join(d, "bad.txt"))).toBe(0o644);
    expect(r.undo.count).toBe(1);
  });

  test("items owned by someone else are reported and never tried (different user id, so it also works as root)", async () => {
    const ctx = newCtx();
    const d = tree();
    let tried = 0;
    const real = hooksFor(ctx).fs;
    setPermsHooks(ctx, { uid: () => 4242 + (process.getuid?.() ?? 0), fs: { ...real, chmod: async (p, m) => { tried++; await real.chmod(p, m); } } });
    const p = await plan(ctx, { paths: [join(d, "a.txt"), join(d, "run.sh")], change: { set: 0o600 } });
    expect(p.counts).toMatchObject({ willChange: 0, cannotChange: 2 });
    expect(p.problems[0].reason).toContain("aren't the owner");
    const r = (await apply(ctx, { paths: [join(d, "a.txt")], change: { set: 0o600 } })).result;
    expect(r.counts).toMatchObject({ changed: 0, failed: 1 });
    expect(tried).toBe(0);
    expect(modeOf(join(d, "a.txt"))).toBe(0o644);
    // items that already have the wanted mode are not a problem even if they are someone else's
    const same = await plan(ctx, { paths: [join(d, "a.txt")], change: { set: 0o644 } });
    expect(same.counts).toMatchObject({ alreadyCorrect: 1, cannotChange: 0 });
  });

  test("an item that is swapped for another kind between the preview and the change is left alone", async () => {
    const ctx = newCtx();
    const d = work();
    put(join(d, "x.txt"), 0o644);
    put(join(d, "y.txt"), 0o644);
    const real = hooksFor(ctx).fs;
    const seen = new Map<string, number>();
    setPermsHooks(ctx, {
      fs: {
        ...real,
        lstat: async (p: string) => {
          const st = await real.lstat(p);
          const n = (seen.get(p) ?? 0) + 1;
          seen.set(p, n);
          return n >= 2 && p.endsWith("x.txt") ? (Object.assign(Object.create(st), { isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false, mode: st.mode, ino: st.ino, dev: st.dev, uid: st.uid, gid: st.gid }) as PermStat) : st;
        },
      },
    });
    const r = (await apply(ctx, { paths: [join(d, "x.txt"), join(d, "y.txt")], change: { set: 0o600 } })).result;
    expect(r.counts).toMatchObject({ changed: 1, failed: 1 });
    expect(r.problems[0].reason).toContain("replaced");
    expect(modeOf(join(d, "x.txt"))).toBe(0o644);
  });

  test("a missing item is a problem for that item only", async () => {
    const ctx = newCtx();
    const d = work();
    put(join(d, "ok.txt"), 0o644);
    const r = (await apply(ctx, { paths: [join(d, "ghost.txt"), join(d, "ok.txt")], change: { set: 0o600 } })).result;
    expect(r.counts).toMatchObject({ changed: 1, failed: 1 });
    expect(r.problems[0].reason).toContain("doesn't exist");
  });

  test("a change the computer only half accepts is reported as it really ended", async () => {
    const ctx = newCtx();
    const d = work();
    put(join(d, "p.txt"), 0o644);
    const real = hooksFor(ctx).fs;
    setPermsHooks(ctx, { fs: { ...real, chmod: async (p, m) => real.chmod(p, m & 0o777) } });
    const r = (await apply(ctx, { paths: [join(d, "p.txt")], change: { set: 0o2755 }, confirmed: true })).result;
    expect(r.counts.changed).toBe(1);
    expect(r.problems[0].reason).toContain("not exactly as asked");
    expect(modeOf(join(d, "p.txt"))).toBe(0o755);
    await undoPerms(ctx, hooksFor(ctx), r.undo.id);
    expect(modeOf(join(d, "p.txt"))).toBe(0o644);
  });

  test("flags that the platform doesn't have are refused", async () => {
    const ctx = newCtx({ platform: "linux" });
    const f = join(tree(), "a.txt");
    await rejects(apply(ctx, { paths: [f], change: { flags: { locked: true } } }), "UNSUPPORTED");
    await rejects(apply(ctx, { paths: [f], change: { flags: { hidden: true } } }), "UNSUPPORTED");
    await rejects(apply(ctx, { paths: [f], change: { flags: { readonly: true } } }), "UNSUPPORTED");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("limits and cancelling", () => {
  test("too many items are refused before anything is changed; too many chosen items too", async () => {
    const ctx = newCtx();
    const d = work();
    for (let i = 0; i < 20; i++) put(join(d, `f${i}`), 0o644);
    setPermsHooks(ctx, { limits: { ...defaultHooks("linux").limits, maxItems: 10, maxPaths: 3 } });
    const change = { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } };
    await rejects(plan(ctx, { paths: [d], change }), "TOO_MANY");
    await rejects(apply(ctx, { paths: [d], change, confirmed: true }), "TOO_MANY");
    expect(modeOf(join(d, "f1"))).toBe(0o644);
    await rejects(plan(ctx, { paths: [1, 2, 3, 4].map((i) => join(d, `f${i}`)), change: { set: 0o600 } }), "BAD_REQUEST");
  });

  test("a preview that takes too long is stopped", async () => {
    const ctx = newCtx();
    const d = work();
    for (let i = 0; i < 200; i++) put(join(d, `f${i}`), 0o644);
    let clock = 0;
    setPermsHooks(ctx, { now: () => (clock += 3000), limits: { ...defaultHooks("linux").limits, maxMillis: 5000 } });
    await rejects(plan(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } } }), "TOO_SLOW");
    expect(modeOf(join(d, "f1"))).toBe(0o644);
  });

  test("a change that runs out of time keeps what it did, can be undone, and says what it did not reach", async () => {
    const ctx = newCtx();
    const d = work();
    for (let i = 0; i < 30; i++) put(join(d, `f${i}`), 0o644);
    let clock = 0;
    const real = hooksFor(ctx).fs;
    setPermsHooks(ctx, { now: () => clock, limits: { ...defaultHooks("linux").limits, maxMillis: 1000, manyItems: 1000 }, fs: { ...real, chmod: async (p, m) => { clock += 100; await real.chmod(p, m); } } });
    const r = (await apply(ctx, { paths: [d], change: { set: { file: 0o600, dir: 0o755 }, recursive: { scope: "files" } } })).result;
    expect(r.stopped).toBe("time");
    expect(r.counts.changed).toBeGreaterThan(5);
    expect(r.counts.changed + r.counts.notDone).toBe(30);
    expect(r.undo.count).toBe(r.counts.changed);
    const changed = readdirSync(d).filter((n) => modeOf(join(d, n)) === 0o600).length;
    expect(changed).toBe(r.counts.changed);
    await undoPerms(ctx, hooksFor(ctx), r.undo.id);
    expect(readdirSync(d).every((n) => modeOf(join(d, n)) === 0o644)).toBe(true);
  });

  test("cancelling stops after the current item and keeps an undo for what was done", async () => {
    const ctx = newCtx();
    const d = work();
    for (let i = 0; i < 20; i++) put(join(d, `f${i}`), 0o644);
    const abort = new AbortController();
    let done = 0;
    const real = hooksFor(ctx).fs;
    setPermsHooks(ctx, { limits: { ...defaultHooks("linux").limits, manyItems: 1000 }, fs: { ...real, chmod: async (p, m) => { await real.chmod(p, m); if (++done === 7) abort.abort(); } } });
    const ctl: RunControl = { signal: abort.signal, report() {} };
    const r = await applyPerms(ctx, hooksFor(ctx), { paths: [d], change: { set: { file: 0o600, dir: 0o755 }, recursive: { scope: "files" } } }, ctl);
    expect(r.stopped).toBe("cancelled");
    expect(r.counts.changed).toBe(7);
    expect(r.counts.notDone).toBe(13);
    // cancelled before anything was looked at: nothing is changed
    const e = work();
    for (let i = 0; i < 5; i++) put(join(e, `g${i}`), 0o644);
    const pre = new AbortController();
    pre.abort();
    const again: RunControl = { signal: pre.signal, report() {} };
    const body = { paths: [e], change: { set: { file: 0o600, dir: 0o755 }, recursive: { scope: "files" } } };
    await rejects(planPerms(ctx, hooksFor(ctx), body, again), "CANCELLED");
    await rejects(applyPerms(ctx, hooksFor(ctx), body, again), "CANCELLED");
    expect(readdirSync(e).every((n) => modeOf(join(e, n)) === 0o644)).toBe(true);
  });

  test("a recursive run is cancellable through the server by its run name, with progress", async () => {
    const ctx = newCtx();
    const d = work();
    for (let i = 0; i < 40; i++) put(join(d, `f${i}`), 0o644);
    const real = hooksFor(ctx).fs;
    setPermsHooks(ctx, { limits: { ...defaultHooks("linux").limits, manyItems: 1000 }, fs: { ...real, chmod: async (p, m) => { await sleep(25); await real.chmod(p, m); } } });
    const running = apply(ctx, { paths: [d], runId: "run-test-1", change: { set: { file: 0o600, dir: 0o755 }, recursive: { scope: "files" } } });
    let progress: any = null;
    for (let i = 0; i < 100 && !(progress?.phase === "changing" && progress.done >= 3); i++) {
      await sleep(20);
      progress = await permsOperations["perms/progress"]!(ctx, { runId: "run-test-1" });
    }
    expect(progress).toMatchObject({ found: true, state: "running", phase: "changing" });
    expect(progress.done).toBeGreaterThanOrEqual(3);
    expect(await permsOperations["perms/cancel"]!(ctx, { runId: "run-test-1" })).toEqual({ cancelled: true });
    const r = (await running).result;
    expect(r.stopped).toBe("cancelled");
    expect(r.counts.changed).toBeLessThan(40);
    expect(r.counts.changed).toBeGreaterThan(0);
    expect((await permsOperations["perms/progress"]!(ctx, { runId: "run-test-1" })) as any).toMatchObject({ found: true, state: "finished" });
    expect(await permsOperations["perms/cancel"]!(ctx, { runId: "run-test-1" })).toEqual({ cancelled: false });
    expect(await permsOperations["perms/cancel"]!(ctx, { runId: "unknown-run" })).toEqual({ cancelled: false });
    expect(await permsOperations["perms/progress"]!(ctx, { runId: "unknown-run" })).toMatchObject({ found: false });
    await rejects(permsOperations["perms/apply"]!(ctx, { paths: [d], runId: "bad run!", change: { set: 0, recursive: {} } }), "BAD_REQUEST");
    await undoPerms(ctx, hooksFor(ctx), r.undo.id);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("macOS extras: Locked and Hidden, through a stand-in for chflags and stat", () => {
  function stand(files: Record<string, { locked?: boolean; hidden?: boolean }>) {
    const calls: string[][] = [];
    const run = async (argv: string[]): Promise<RunResult> => {
      calls.push(argv);
      const path = argv[argv.length - 1]!;
      if (argv[0] === "/usr/bin/stat" && argv[2] === "%f") {
        const f = files[path] ?? {};
        return { code: 0, stdout: `${(f.locked ? 0x2 : 0) | (f.hidden ? 0x8000 : 0)}\n`, stderr: "" };
      }
      if (argv[0] === "/usr/bin/stat") return { code: 0, stdout: "me:staff\n", stderr: "" };
      if (argv[0] === "/usr/bin/chflags") {
        expect(argv.slice(0, 3)).toEqual(["/usr/bin/chflags", "-h", "--"]);
        const f = (files[path] ??= {});
        for (const w of argv[3]!.split(",")) {
          if (w === "uchg") f.locked = true;
          else if (w === "nouchg") f.locked = false;
          else if (w === "hidden") f.hidden = true;
          else if (w === "nohidden") f.hidden = false;
          else return { code: 1, stdout: "", stderr: `unknown flag ${w}` };
        }
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "" };
    };
    return { calls, run, files };
  }

  test("read, change in one program call with an argument list, then Undo", async () => {
    const ctx = newCtx({ platform: "darwin" });
    const d = work();
    const f = join(d, `-rf "weird ' name`);
    put(f, 0o644);
    const s = stand({});
    setPermsHooks(ctx, { run: s.run });
    const got = await getPerms(ctx, hooksFor(ctx), [f]);
    expect(got.items[0]!.flags).toEqual({ locked: false, hidden: false });
    expect(got.support).toMatchObject({ locked: true, hidden: true, readonly: false });
    const r = (await apply(ctx, { paths: [f], change: { flags: { locked: true, hidden: true } } })).result;
    expect(r.counts.changed).toBe(1);
    expect(s.files[f]).toEqual({ locked: true, hidden: true });
    const call = s.calls.find((c) => c[0] === "/usr/bin/chflags")!;
    expect(call).toEqual(["/usr/bin/chflags", "-h", "--", "hidden,uchg", f]);
    expect(modeOf(f)).toBe(0o644);
    await undoPerms(ctx, hooksFor(ctx), r.undo.id);
    expect(s.files[f]).toEqual({ locked: false, hidden: false });
  });

  test("already-correct items are left alone; a locked item is unlocked only when asked, or for the time a mode change takes", async () => {
    const ctx = newCtx({ platform: "darwin" });
    const d = work();
    const f = join(d, "locked.txt");
    put(f, 0o644);
    const s = stand({ [f]: { locked: true } });
    const real = hooksFor(ctx).fs;
    const order: string[] = [];
    setPermsHooks(ctx, {
      run: async (argv) => {
        if (argv[0] === "/usr/bin/chflags") order.push(`flags ${argv[3]}`);
        return s.run(argv);
      },
      fs: { ...real, chmod: async (p, m) => { if (s.files[p]?.locked) throw Object.assign(new Error("locked"), { code: "EPERM" }); order.push("chmod"); await real.chmod(p, m); } },
    });
    expect((await plan(ctx, { paths: [f], change: { flags: { locked: true } } })).counts).toMatchObject({ alreadyCorrect: 1, willChange: 0 });
    // a mode change alone on a locked item fails, with a sentence that says why
    const r1 = (await apply(ctx, { paths: [f], change: { set: 0o600 } })).result;
    expect(r1.counts.failed).toBe(1);
    expect(r1.problems[0].reason).toMatch(/locked/i);
    expect(modeOf(f)).toBe(0o644);
    // together with a request about extra settings the item is unlocked for the change and locked again
    order.length = 0;
    const r2 = (await apply(ctx, { paths: [f], change: { set: 0o600, flags: { hidden: true } } })).result;
    expect(r2.counts.changed).toBe(1);
    expect(order).toEqual(["flags nouchg", "chmod", "flags hidden,uchg"]);
    expect(s.files[f]).toEqual({ locked: true, hidden: true });
    await undoPerms(ctx, hooksFor(ctx), r2.undo.id);
    expect(modeOf(f)).toBe(0o644);
    expect(s.files[f]).toEqual({ locked: true, hidden: false });
    // unlocking is a request of its own
    order.length = 0;
    await apply(ctx, { paths: [f], change: { flags: { locked: false } } });
    expect(s.files[f]!.locked).toBe(false);
  });

  test("a failing program is explained and the item is left as it was", async () => {
    const ctx = newCtx({ platform: "darwin" });
    const f = join(work(), "x.txt");
    put(f, 0o644);
    const s = stand({});
    setPermsHooks(ctx, { run: async (argv) => (argv[0] === "/usr/bin/chflags" ? { code: 1, stdout: "", stderr: "Operation not permitted" } : s.run(argv)) });
    const r = (await apply(ctx, { paths: [f], change: { flags: { hidden: true } } })).result;
    expect(r.counts).toMatchObject({ changed: 0, failed: 1 });
    expect(r.problems[0].reason).toMatch(/owner|locked/);
    expect(r.undo).toBeNull();
  });

  test("a locked/hidden change over a folder reaches its contents", async () => {
    const ctx = newCtx({ platform: "darwin" });
    const d = tree();
    const s = stand({});
    setPermsHooks(ctx, { run: s.run, limits: { ...defaultHooks("darwin").limits, manyItems: 1000 } });
    const r = (await apply(ctx, { paths: [d], change: { flags: { hidden: true }, recursive: { scope: "files" } } })).result;
    expect(r.counts.changed).toBe(4);
    expect(Object.keys(s.files).sort()).toEqual([join(d, "a.txt"), join(d, "run.sh"), join(d, "sub", "c.txt"), join(d, "sub", "deep", "d.txt")].sort());
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("Windows: Read-only and Hidden through attrib, with a stand-in program", () => {
  const WHOME = "C:\\Users\\me";
  type Node = { dir: boolean; mode: number; children?: string[] };

  function fakeFs(nodes: Record<string, Node>) {
    const key = (p: string) => p.toLowerCase();
    const map = new Map(Object.entries(nodes).map(([k, v]) => [key(k), v]));
    const stat = (n: Node, i: number): PermStat => ({ mode: n.mode, uid: 0, gid: 0, dev: 1, ino: i, isDirectory: () => n.dir, isSymbolicLink: () => false, isFile: () => !n.dir });
    return {
      lstat: async (p: string) => {
        const n = map.get(key(p));
        if (!n) throw Object.assign(new Error("gone"), { code: "ENOENT" });
        return stat(n, [...map.keys()].indexOf(key(p)) + 1);
      },
      readdir: async (p: string) => map.get(key(p))?.children ?? [],
      chmod: async () => { throw new Error("chmod must not be used on Windows"); },
    };
  }

  function program(dir: string): { path: string; log: string } {
    const log = join(dir, "attrib.log");
    const path = join(dir, "attrib-standin");
    writeFileSync(path, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a" >> '${log}'; done\nprintf -- '--\\n' >> '${log}'\nif [ $# -eq 1 ]; then printf 'A  %s      %s\\n' "$ATTRIB_FLAGS" "$1"; fi\n`);
    chmodSync(path, 0o755);
    return { path, log };
  }
  const lines = (log: string) => (existsSync(log) ? readFileSync(log, "utf8").split("\n").slice(0, -1) : []);
  afterAll(() => { delete process.env.ATTRIB_FLAGS; });

  test.skipIf(!posix)("reading and changing the two settings with a real program started from an argument list", async () => {
    process.env.ATTRIB_FLAGS = "R";
    const dir = work();
    const prog = program(dir);
    const name = "-rf 'a' & b (1).txt";
    const hostile = `${WHOME}\\Docs\\${name}`;
    const fs = fakeFs({ [WHOME]: { dir: true, mode: 0o666, children: ["Docs"] }, [`${WHOME}\\Docs`]: { dir: true, mode: 0o666, children: [name] }, [hostile]: { dir: false, mode: 0o444 } });
    const ctx = newCtx({ platform: "win32", home: WHOME, dataDir: `${WHOME}\\data` });
    setPermsHooks(ctx, { fs, programs: { attrib: prog.path, chflags: "", stat: "", ls: "" } });
    const got = await getPerms(ctx, hooksFor(ctx), [hostile]);
    expect(got.support).toMatchObject({ mode: false, readonly: true, hidden: true, locked: false, specialBits: false });
    expect(got.items[0]).toMatchObject({ mode: null, octal: null, owner: null, flags: { readonly: true, hidden: false }, canChange: true });
    expect(lines(prog.log)).toEqual([hostile, "--"]);
    // already read-only: nothing to do
    expect((await plan(ctx, { paths: [hostile], change: { flags: { readonly: true } } })).counts).toMatchObject({ alreadyCorrect: 1, willChange: 0 });
    // turning it off and hiding it: one call, every argument separate
    const r = (await apply(ctx, { paths: [hostile], change: { flags: { readonly: false, hidden: true } } })).result;
    expect(r.counts.changed).toBe(1);
    const all = lines(prog.log);
    expect(all.slice(-5)).toEqual(["-R", "+H", hostile, "/L", "--"]);
    expect(r.undo.count).toBe(1);
  });

  test.skipIf(!posix)("mode changes, system places and bad requests are refused on Windows", async () => {
    const dir = work();
    const prog = program(dir);
    const fs = fakeFs({ [WHOME]: { dir: true, mode: 0o666 }, "C:\\Windows\\System32\\x.dll": { dir: false, mode: 0o666 }, "C:\\": { dir: true, mode: 0o666 }, [`${WHOME}\\a.txt`]: { dir: false, mode: 0o666 } });
    const ctx = newCtx({ platform: "win32", home: WHOME, dataDir: `${WHOME}\\data` });
    setPermsHooks(ctx, { fs, programs: { attrib: prog.path, chflags: "", stat: "", ls: "" } });
    await rejects(apply(ctx, { paths: [`${WHOME}\\a.txt`], change: { set: 0o644 } }), "UNSUPPORTED");
    await rejects(apply(ctx, { paths: [`${WHOME}\\a.txt`], change: { flags: { locked: true } } }), "UNSUPPORTED");
    await rejects(apply(ctx, { paths: ["C:\\Windows\\System32\\x.dll"], change: { flags: { hidden: true } } }), "PROTECTED");
    await rejects(apply(ctx, { paths: ["C:\\"], change: { flags: { hidden: true } } }), "PROTECTED");
    await rejects(apply(ctx, { paths: ["not-absolute.txt"], change: { flags: { hidden: true } } }), "BAD_PATH");
    expect(lines(prog.log).filter((l) => l === "+H")).toEqual([]);
  });

  test.skipIf(!posix)("a recursive run goes through the files with the scope, and Undo puts the settings back", async () => {
    const dir = work();
    const prog = program(dir);
    const A = `${WHOME}\\proj`;
    const fs = fakeFs({ [A]: { dir: true, mode: 0o666, children: ["a.txt", "sub"] }, [`${A}\\a.txt`]: { dir: false, mode: 0o666 }, [`${A}\\sub`]: { dir: true, mode: 0o666, children: ["b.txt"] }, [`${A}\\sub\\b.txt`]: { dir: false, mode: 0o666 } });
    const ctx = newCtx({ platform: "win32", home: WHOME, dataDir: `${WHOME}\\data` });
    setPermsHooks(ctx, { fs, programs: { attrib: prog.path, chflags: "", stat: "", ls: "" } });
    process.env.ATTRIB_FLAGS = "R";
    const r = (await apply(ctx, { paths: [A], change: { flags: { readonly: false }, recursive: { scope: "files" } } })).result;
    // the stand-in reports every file as read-only, so each one needs -R
    expect(r.counts.changed).toBe(2);
    expect(lines(prog.log).filter((l) => l === "-R")).toHaveLength(2);
    process.env.ATTRIB_FLAGS = "";
    const u = ((await permsOperations["perms/undo"]!(ctx, { undo: r.undo.id })) as any).result;
    expect(u.restored).toBe(2);
    expect(lines(prog.log).filter((l) => l === "+R")).toHaveLength(2);
  });

  test("attrib's output is read by position, whatever the path looks like", () => {
    expect(parseAttribLine("A    R       C:\\a b\\c.txt", "C:\\a b\\c.txt")).toEqual({ readonly: true, hidden: false });
    expect(parseAttribLine("A  SHR       C:\\x", "c:\\X")).toEqual({ readonly: true, hidden: true });
    expect(parseAttribLine("            C:\\x", "C:\\x")).toEqual({ readonly: false, hidden: false });
    expect(parseAttribLine("A  H  C:\\x", "C:\\other")).toBeNull();
    expect(parseAttribLine("File not found - C:\\x", "C:\\x")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe.skipIf(!posix)("over HTTP", () => {
  const TOKEN = "perms-test-token";
  let server: ReturnType<typeof startFileManagerServer>;
  let base = "";
  const call = async (op: string, body: unknown = {}, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}/api/${op}`, { method: "POST", headers: { "Content-Type": "application/json", "x-fm-token": TOKEN, ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // a plain-text refusal (wrong host or origin)
    }
    return { status: res.status, json };
  };

  beforeAll(() => {
    server = startFileManagerServer({ port: 0, host: "127.0.0.1", token: TOKEN, context: { home, dataDir: join(root, "http-data") } });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => server.stop(true));

  test("the operations are registered", () => {
    for (const op of ["get", "plan", "apply", "undo", "progress", "cancel"]) expect(API_OPERATIONS).toContain(`perms/${op}`);
  });

  test("the token is needed, other web pages are refused, and bodies must be JSON objects", async () => {
    const d = tree();
    const body = { paths: [join(d, "a.txt")], change: { set: 0o600 } };
    for (const op of ["get", "plan", "apply", "undo", "progress", "cancel"]) {
      expect((await call(`perms/${op}`, body, { "x-fm-token": "wrong" })).status, op).toBe(401);
      const noToken = await fetch(`${base}/api/perms/${op}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      expect(noToken.status, op).toBe(401);
    }
    expect(modeOf(join(d, "a.txt"))).toBe(0o644);
    expect((await call("perms/apply", body, { Host: "attacker.example" })).status).toBe(403);
    expect((await call("perms/apply", body, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await call("perms/apply", body, { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await call("perms/apply", "{broken")).json.error.code).toBe("BAD_JSON");
    expect((await call("perms/apply", "[1]")).json.error.code).toBe("BAD_JSON");
    expect(modeOf(join(d, "a.txt"))).toBe(0o644);
  });

  test("get, plan, apply and undo work end to end, with the right status codes", async () => {
    const d = tree();
    const f = join(d, "a.txt");
    const g = await call("perms/get", { paths: [f, d] });
    expect(g.status).toBe(200);
    expect(g.json.items.map((i: any) => i.octal)).toEqual(["644", "755"]);
    const p = await call("perms/plan", { paths: [f], change: { symbolic: "go-r" } });
    expect(p.json.plan.counts.willChange).toBe(1);
    expect(modeOf(f)).toBe(0o644);
    const risky = await call("perms/apply", { paths: [f], change: { set: 0o777 } });
    expect(risky.status).toBe(409);
    expect(risky.json).toMatchObject({ ok: false, error: { code: "NEEDS_CONFIRM" } });
    expect(risky.json.error.details.risks[0].code).toBe("world-writable");
    expect(modeOf(f)).toBe(0o644);
    const done = await call("perms/apply", { paths: [f], change: { symbolic: "go-r" } });
    expect(done.status).toBe(200);
    expect(modeOf(f)).toBe(0o600);
    const undone = await call("perms/undo", { undo: done.json.result.undo.id });
    expect(undone.json.result.restored).toBe(1);
    expect(modeOf(f)).toBe(0o644);
    expect((await call("perms/undo", { undo: done.json.result.undo.id })).json.error.code).toBe("NO_UNDO");
  });

  test("bad input gets a plain answer and changes nothing", async () => {
    const d = tree();
    const f = join(d, "a.txt");
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ paths: [f], change: { symbolic: "u+q" } }, "BAD_MODE"],
      [{ paths: [f], change: { set: 99999 } }, "BAD_MODE"],
      [{ paths: [f] }, "BAD_REQUEST"],
      [{ paths: [], change: { set: 0 } }, "BAD_REQUEST"],
      [{ paths: "x", change: { set: 0 } }, "BAD_REQUEST"],
      [{ paths: ["rel.txt"], change: { set: 0 } }, "BAD_PATH"],
      [{ paths: [f], change: { set: 0, recursive: { scope: "x" } } }, "BAD_REQUEST"],
      [{ paths: ["/usr/bin/env"], change: { set: 0o777 }, confirmed: true }, "PROTECTED"],
    ];
    for (const [body, code] of bad) {
      for (const op of ["perms/plan", "perms/apply"]) {
        const r = await call(op, body);
        expect(r.status, `${op} ${JSON.stringify(body)}`).toBe(400);
        expect(r.json.error.code).toBe(code);
        expect(typeof r.json.error.message).toBe("string");
      }
    }
    expect(modeOf(f)).toBe(0o644);
  });

  test("a recursive run over HTTP, with a run name, returns progress afterwards", async () => {
    const d = tree();
    const r = await call("perms/apply", { paths: [d], runId: "http-run-1", change: { set: { file: 0o600, dir: 0o700 }, recursive: { scope: "all" } }, confirmed: true });
    expect(r.status).toBe(200);
    expect(r.json.result.counts.changed).toBeGreaterThan(3);
    const pr = await call("perms/progress", { runId: "http-run-1" });
    expect(pr.json).toMatchObject({ found: true, state: "finished" });
    await call("perms/undo", { undo: r.json.result.undo.id });
    expect(modeOf(join(d, "a.txt"))).toBe(0o644);
  });
});
