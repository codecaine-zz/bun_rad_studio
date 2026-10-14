import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const scratch = join(import.meta.dir, `.scratch-vault-cli-${process.pid}`);
const CLI = join(import.meta.dir, "..", "cli_apps", "vault_cli.ts");
const PW = "river-lamp-orbit-seven-plum";

beforeAll(() => mkdirSync(scratch, { recursive: true }));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
const fresh = () => {
  const d = join(scratch, `c${++n}`);
  mkdirSync(d, { recursive: true });
  return d;
};
const files = (d: string) => readdirSync(d).sort();

async function run(args: string[], env: Record<string, string> = {}, cwd = scratch) {
  const proc = Bun.spawn(["bun", CLI, ...args], { cwd, env: { ...process.env, RADENC_PASSWORD: "", ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
}

/** Runs the tool on a real (pseudo-)terminal, answering its prompts. Returns everything that was shown. */
async function runTty(args: string[], answers: Array<[string, string]>, env: Record<string, string> = {}) {
  let out = "";
  const proc = Bun.spawn(["bun", CLI, ...args], {
    cwd: scratch,
    env: { ...process.env, RADENC_PASSWORD: "", ...env },
    terminal: { cols: 100, rows: 24, data: (_t: unknown, data: Uint8Array) => void (out += Buffer.from(data).toString()) },
  });
  for (const [needle, text] of answers) {
    const end = Date.now() + 15_000;
    while (!out.includes(needle)) {
      if (Date.now() > end) throw new Error(`timed out waiting for "${needle}". Shown so far: ${out}`);
      await Bun.sleep(15);
    }
    proc.terminal!.write(text);
  }
  const code = await proc.exited;
  return { out, code };
}

describe.skipIf(process.platform === "win32")("vault_cli prompt on a terminal", () => {
  test("the password is asked for twice, is not echoed, and backspace works", async () => {
    const d = fresh();
    writeFileSync(join(d, "t.txt"), "typed in");
    const r = await runTty(["encrypt", join(d, "t.txt")], [["Password: ", `${PW}zz\x7f\x7f\r`], ["again: ", `${PW}\r`]]);
    expect(r.code).toBe(0);
    expect(r.out).not.toContain(PW);
    expect(r.out).not.toContain("river");
    expect(files(d)).toEqual(["t.txt", "t.txt.radenc"]);
    const back = fresh();
    const x = await runTty(["decrypt", join(d, "t.txt.radenc"), "--out", back], [["Password: ", `${PW}\r`]]);
    expect(x.code).toBe(0);
    expect(x.out).not.toContain(PW);
    expect(readFileSync(join(back, "t.txt"), "utf8")).toBe("typed in");
  }, 30_000);

  test("two different passwords are refused and nothing is written", async () => {
    const d = fresh();
    writeFileSync(join(d, "m.txt"), "m");
    const r = await runTty(["encrypt", join(d, "m.txt")], [["Password: ", `${PW}\r`], ["again: ", "something else entirely\r"]]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("not the same");
    expect(files(d)).toEqual(["m.txt"]);
  }, 30_000);

  test("Ctrl-C at the prompt cancels cleanly", async () => {
    const d = fresh();
    writeFileSync(join(d, "c.txt"), "c");
    const r = await runTty(["encrypt", join(d, "c.txt")], [["Password: ", "abc\x03"]]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("Cancelled");
    expect(files(d)).toEqual(["c.txt"]);
  }, 30_000);
});

describe("vault_cli", () => {
  test("help lists the commands and never offers a --password option", async () => {
    const r = await run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("encrypt");
    expect(r.stdout).toContain("--password-file");
    expect(r.stdout).toContain("RADENC_PASSWORD");
    expect(r.stdout).not.toMatch(/^\s+--password\s/m);
  });

  test("encrypt and decrypt a file with the password in the environment", async () => {
    const d = fresh();
    writeFileSync(join(d, "note.txt"), "secret note");
    const e = await run(["encrypt", join(d, "note.txt")], { RADENC_PASSWORD: PW });
    expect(e.code).toBe(0);
    expect(e.stdout).toContain("note.txt.radenc");
    expect(files(d)).toEqual(["note.txt", "note.txt.radenc"]);
    expect(readFileSync(join(d, "note.txt.radenc")).includes(Buffer.from("secret note"))).toBe(false);
    const out = fresh();
    const x = await run(["decrypt", join(d, "note.txt.radenc"), "--out", out], { RADENC_PASSWORD: PW });
    expect(x.code).toBe(0);
    expect(readFileSync(join(out, "note.txt"), "utf8")).toBe("secret note");
    expect(e.stdout + e.stderr + x.stdout + x.stderr).not.toContain(PW);
  }, 30_000);

  test("a folder, with --out, --hide-name, --no-compress and --level", async () => {
    const d = fresh();
    mkdirSync(join(d, "proj/sub"), { recursive: true });
    writeFileSync(join(d, "proj/a.txt"), "A");
    writeFileSync(join(d, "proj/sub/b.txt"), "B");
    const out = fresh();
    const e = await run(["encrypt", join(d, "proj"), "--out", out, "--hide-name", "--no-compress", "--level", "standard"], { RADENC_PASSWORD: PW });
    expect(e.code).toBe(0);
    expect(files(out)).toEqual(["Encrypted file 1.radenc"]);
    const info = await run(["info", join(out, "Encrypted file 1.radenc")]);
    expect(info.code).toBe(0);
    expect(info.stdout).toContain("standard");
    expect(info.stdout).toContain("compressed: no");
    const back = fresh();
    const x = await run(["decrypt", join(out, "Encrypted file 1.radenc"), "--out", back], { RADENC_PASSWORD: PW });
    expect(x.code).toBe(0);
    expect(readFileSync(join(back, "proj/sub/b.txt"), "utf8")).toBe("B");
  }, 30_000);

  test("the password can come from a file (first line only)", async () => {
    const d = fresh();
    writeFileSync(join(d, "f.txt"), "from a password file");
    const pwFile = join(d, "pw.txt");
    writeFileSync(pwFile, `${PW}\nignored second line\n`);
    chmodSync(pwFile, 0o600);
    const e = await run(["encrypt", join(d, "f.txt"), "--password-file", pwFile], { RADENC_PASSWORD: "this is ignored when a file is given" });
    expect(e.code).toBe(0);
    expect(e.stderr).not.toContain("can be read by other users");
    const out = fresh();
    const x = await run(["decrypt", join(d, "f.txt.radenc"), "--password-file", pwFile, "--out", out]);
    expect(x.code).toBe(0);
    expect(readFileSync(join(out, "f.txt"), "utf8")).toBe("from a password file");
    chmodSync(pwFile, 0o644);
    const warn = await run(["decrypt", join(d, "f.txt.radenc"), "--password-file", pwFile, "--out", out]);
    expect(warn.stderr).toContain("can be read by other users");
  }, 30_000);

  test("a wrong password exits with code 2 and writes nothing", async () => {
    const d = fresh();
    writeFileSync(join(d, "w.txt"), "w");
    await run(["encrypt", join(d, "w.txt")], { RADENC_PASSWORD: PW });
    const out = fresh();
    const x = await run(["decrypt", join(d, "w.txt.radenc"), "--out", out], { RADENC_PASSWORD: "a wrong password" });
    expect(x.code).toBe(2);
    expect(x.stderr).toContain("Wrong password, or the file is damaged or has been changed.");
    expect(files(out)).toEqual([]);
    expect(files(d)).toEqual(["w.txt", "w.txt.radenc"]);
    const notEnc = join(d, "w.txt");
    expect((await run(["decrypt", notEnc, "--out", out], { RADENC_PASSWORD: PW })).code).toBe(2);
    expect((await run(["info", notEnc])).code).toBe(2);
  }, 30_000);

  test("a damaged file exits with code 2", async () => {
    const d = fresh();
    writeFileSync(join(d, "x.txt"), "x".repeat(100));
    await run(["encrypt", join(d, "x.txt")], { RADENC_PASSWORD: PW });
    const bytes = readFileSync(join(d, "x.txt.radenc"));
    bytes[bytes.length - 5]! ^= 1;
    writeFileSync(join(d, "x.txt.radenc"), bytes);
    const out = fresh();
    expect((await run(["decrypt", join(d, "x.txt.radenc"), "--out", out], { RADENC_PASSWORD: PW })).code).toBe(2);
    expect(files(out)).toEqual([]);
  }, 30_000);

  test("other problems exit with code 1 and a plain message", async () => {
    const d = fresh();
    expect((await run(["encrypt", join(d, "missing.txt")], { RADENC_PASSWORD: PW })).code).toBe(1);
    expect((await run(["encrypt"], {})).code).toBe(1);
    expect((await run(["frobnicate", "x"])).code).toBe(1);
    expect((await run(["encrypt", "x", "--level", "extreme"], { RADENC_PASSWORD: PW })).code).toBe(1);
    const noPw = await run(["encrypt", join(d, "x")]);
    expect(noPw.code).toBe(1);
    expect(noPw.stderr).toContain("RADENC_PASSWORD");
    writeFileSync(join(d, "weak.txt"), "w");
    const weak = await run(["encrypt", join(d, "weak.txt")], { RADENC_PASSWORD: "password123" });
    expect(weak.code).toBe(1);
    expect(weak.stderr).toContain("too easy to guess");
    expect(files(d)).toEqual(["weak.txt"]);
    expect((await run(["decrypt", join(d, "weak.txt"), "--out", "/etc"], { RADENC_PASSWORD: PW })).code).toBe(1);
  }, 30_000);

  test("--password is refused with an explanation, and its value is never echoed", async () => {
    const r = await run(["encrypt", "x.txt", "--password", "hunter2hunter2"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("no --password option");
    expect(r.stderr).not.toContain("hunter2");
    expect(existsSync(join(scratch, "x.txt.radenc"))).toBe(false);
  });

  test("one bad item doesn't stop the others", async () => {
    const d = fresh();
    writeFileSync(join(d, "ok.txt"), "ok");
    const r = await run(["encrypt", join(d, "nope.txt"), join(d, "ok.txt")], { RADENC_PASSWORD: PW });
    expect(r.code).toBe(1);
    expect(files(d)).toEqual(["ok.txt", "ok.txt.radenc"]);
  }, 30_000);
});
