import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { DOTENV_MAX_BYTES, dotenvFileNames, expandValue, parseDotenv, readDotenvFolder } from "../src/features/filemanager/fmDbDotenv";
import { buildEnvView, provenanceText } from "../src/features/filemanager/fmDbEnvView";

const root = mkdtempSync(join(tmpdir(), "fm-db-dotenv-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const folder = (files: Record<string, string | Buffer>) => {
  const dir = join(root, `d${++n}`);
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
};

/** What the real Bun loader puts in process.env for `dir` with a clean environment. */
function bunLoads(dir: string, nodeEnv: string | undefined, names: string[]): Record<string, string | undefined> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
  if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;
  const code = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.map((k) => [k, process.env[k]]))))`;
  const out = Bun.spawnSync([process.execPath, "-e", code], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
  return JSON.parse(out.stdout.toString());
}

const BASE = [
  "A=base", "B=base", "C=base", "D=base", "E=base", "F=base", "G=base",
  'Q="x $A y"', "R='x $A y'", "S=\\$A", "T=${A}-${NOPE:-dflt}-${NOPE}", "U=pre${A}post", "V=plain # comment", 'W="a # not comment"',
  "export X=exported", "Y=", 'Z="line1\\nline2"', 'EMPTYQ=""', "P=a#b", "EQ=a=b=c", "SP=two words here", "`BT`=ignored", "BT2=`back tick`", "# whole line comment", "NOEQUALS",
].join("\n");
const FILES = {
  ".env": BASE,
  ".env.production": "B=prod\nG=prod\nU=prod-$A\n",
  ".env.development": "C=dev\nG=dev\n",
  ".env.test": "D=test\nG=test\n",
  ".env.local": "E=local\nG=local\n",
  ".env.production.local": "F=prodlocal\n",
  ".env.development.local": "F=devlocal\n",
  ".env.test.local": "F=testlocal\n",
};
const NAMES = ["A", "B", "C", "D", "E", "F", "G", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "EMPTYQ", "P", "EQ", "SP", "BT", "BT2", "NOEQUALS"];

describe(".env files are read the way Bun reads them (compared with the real Bun loader)", () => {
  const dir = folder(FILES);
  for (const nodeEnv of [undefined, "production", "development", "test", "staging", ""] as const) {
    test(`NODE_ENV=${nodeEnv === undefined ? "(unset)" : JSON.stringify(nodeEnv)}: same values and precedence`, async () => {
      const expected = bunLoads(dir, nodeEnv, NAMES);
      const folderRead = await readDotenvFolder(dir, nodeEnv, {});
      const mine = Object.fromEntries(NAMES.map((k) => [k, folderRead.values.get(k)?.value]));
      expect(mine).toEqual(expected);
    });
  }

  test("which files are read for each mode, lowest precedence first", () => {
    expect(dotenvFileNames(undefined)).toEqual([".env", ".env.development", ".env.local", ".env.development.local"]);
    expect(dotenvFileNames("production")).toEqual([".env", ".env.production", ".env.local", ".env.production.local"]);
    expect(dotenvFileNames("test")).toEqual([".env", ".env.test", ".env.test.local"]);
    expect(dotenvFileNames("staging")).toEqual(dotenvFileNames(undefined));
  });

  test("a real environment variable is used when a value refers to it, and wins over the file", async () => {
    const d = folder({ ".env": "A=file\nB=$A-x\n" });
    const env = { PATH: process.env.PATH ?? "", A: "real" };
    const bun = Bun.spawnSync([process.execPath, "-e", "console.log(JSON.stringify([process.env.A, process.env.B]))"], { cwd: d, env, stdout: "pipe" });
    const read = await readDotenvFolder(d, undefined, { A: "real" });
    // the file's own value for B is built from what A already is
    expect(JSON.parse(bun.stdout.toString())[1]).toBe(read.values.get("B")!.value);
  });

  test("expansion never runs anything: command text stays text", () => {
    const e = parseDotenv("X=$(touch /nope)\nY=`id`\nZ=\"${HOME:-$(id)}\"");
    const looked: string[] = [];
    const value = (r: (typeof e)[number]) => expandValue(r.raw, r.quote, (n) => (looked.push(n), undefined));
    expect(value(e[0]!)).toBe("$(touch /nope)");
    expect(value(e[1]!)).toBe("id");
    expect(value(e[2]!)).toBe("$(id)");
  });
});

describe("hostile .env files", () => {
  test("a huge file, a binary file, a link and a folder are all skipped, with the reason", async () => {
    const outside = join(root, "outside-secret.env");
    writeFileSync(outside, "MSQL_HOST=stolen.example.com\n");
    const d = folder({ ".env": "X=" + "a".repeat(DOTENV_MAX_BYTES + 10), ".env.development": Buffer.from([0x41, 0x3d, 0x00, 0x42]) });
    let linked = true;
    try { symlinkSync(outside, join(d, ".env.local")); } catch { linked = false; }
    mkdirSync(join(d, ".env.development.local"));
    const read = await readDotenvFolder(d, undefined, {});
    const why = Object.fromEntries(read.files.map((f) => [f.name, f.skipped]));
    expect(why).toEqual(linked ? { ".env": "too-big", ".env.development": "binary", ".env.local": "link", ".env.development.local": "not-a-file" } : { ".env": "too-big", ".env.development": "binary", ".env.development.local": "not-a-file" });
    expect(read.values.size).toBe(0);
  });

  test("a million lines are cut off, and odd bytes are only data", () => {
    const text = "A=1\n".repeat(1_000_000);
    expect(parseDotenv(text.slice(0, DOTENV_MAX_BYTES)).length).toBeLessThanOrEqual(4000);
    expect(() => parseDotenv("\u0001\u0002=\u0003\n=\n==\nA\n\uFEFFB=1")).not.toThrow();
  });
});

describe("where each connection variable really came from", () => {
  const home = "/Users/someone";
  test("a value Bun loaded is attributed to the file, a different real value overrides it, and an unloaded file is marked", async () => {
    const cwd = folder({ ".env": "MSQL_HOST=from-file\nMSQL_USER=file-user\nMSQL_NAME=file-db\n", ".env.local": "MSQL_USER=local-user\n" });
    const view = await buildEnvView({ env: { NODE_ENV: "", MSQL_HOST: "from-file", MSQL_USER: "real-user", MYSQL_PORT: "3307" }, cwd, roots: [], home });
    const host = view.vars.get("MSQL_HOST")!;
    expect(host.prov).toMatchObject({ kind: "file", file: ".env", loaded: true, where: "application" });
    expect(provenanceText(host.prov)).toContain("`.env` in the application folder");
    const user = view.vars.get("MSQL_USER")!;
    expect(user.value).toBe("real-user");
    expect(user.prov).toEqual({ kind: "process", variable: "MSQL_USER", overrides: [".env.local"] });
    expect(provenanceText(user.prov)).toBe("environment variable MSQL_USER (overrides .env.local)");
    const name = view.vars.get("MSQL_NAME")!;
    expect(name.prov).toMatchObject({ kind: "file", file: ".env", loaded: false });
    expect(provenanceText(name.prov)).toContain("found in the file but not loaded into the environment");
    expect(view.vars.get("MYSQL_PORT")!.prov).toEqual({ kind: "process", variable: "MYSQL_PORT" });
  });

  test("the install folder is read too, the start folder wins, and paths are shown with ~", async () => {
    const homeDir = folder({});
    const start = join(homeDir, "start");
    const install = join(homeDir, "install");
    mkdirSync(start);
    mkdirSync(install);
    writeFileSync(join(start, ".env"), "PG_HOST=start-host\n");
    writeFileSync(join(install, ".env"), "PG_HOST=install-host\nPG_USER=install-user\n");
    const view = await buildEnvView({ env: {}, cwd: start, roots: [install], home: homeDir });
    expect(view.vars.get("PG_HOST")!.value).toBe("start-host");
    expect(view.vars.get("PG_HOST")!.prov).toMatchObject({ where: "start", shown: "~/start", loaded: false });
    expect(view.vars.get("PG_USER")!.prov).toMatchObject({ where: "install", shown: "~/install" });
    expect(provenanceText(view.vars.get("PG_USER")!.prov)).toBe("`.env` in the install folder (~/install), variable PG_USER; found in the file but not loaded into the environment");
  });

  test("when the start folder is the install folder it is one 'application folder', read once", async () => {
    const dir = folder({ ".env": "REDIS_URL=redis://cache:6379/1\n" });
    const view = await buildEnvView({ env: { REDIS_URL: "redis://cache:6379/1" }, cwd: dir, roots: [dir], home: "/elsewhere" });
    expect(view.files.map((f) => f.where)).toEqual(["application"]);
    expect(view.vars.get("REDIS_URL")!.prov).toMatchObject({ where: "application", loaded: true });
  });

  test("only connection variables are kept in the view (nothing else from the files or the environment)", async () => {
    const dir = folder({ ".env": "API_KEY=abc\nPG_HOST=h\nSECRET_TOKEN=zzz\n" });
    const view = await buildEnvView({ env: { HOME: "/x", AWS_SECRET_ACCESS_KEY: "k" }, cwd: dir, roots: [], home: "/x" });
    expect([...view.vars.keys()]).toEqual(["PG_HOST"]);
  });
});
