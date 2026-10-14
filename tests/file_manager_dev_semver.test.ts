import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { devOperations } from "../src/features/filemanager/fmDevOps";
import { checkProjectVersions, checkRange, cleanVersion, compareVersions, isRange, judge, pinRange, sortVersions, versionIn } from "../src/features/filemanager/fmDevSemver";
import { FmError } from "../src/features/filemanager/fmPaths";
import { API_OPERATIONS } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-semver-"));
beforeAll(() => mkdirSync(root, { recursive: true }));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const fails = (fn: () => unknown): FmError => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(FmError);
    return err as FmError;
  }
  throw new Error("should have failed");
};

describe("versions", () => {
  test("only complete MAJOR.MINOR.PATCH versions count; v and = are dropped", () => {
    expect(["1.2.3", "v1.2.3", "=1.2.3", " 1.2.3 ", "1.2.3-beta.1", "1.2.3+build.5", "1.2.3-rc.1+b", "0.0.0", "10.20.30"].map(cleanVersion)).toEqual(["1.2.3", "1.2.3", "1.2.3", "1.2.3", "1.2.3-beta.1", "1.2.3+build.5", "1.2.3-rc.1+b", "0.0.0", "10.20.30"]);
    for (const bad of ["1.2", "1", "", "abc", "1.2.x", "1.2.3.4", "^1.2.3", "1.2.3 4", "1..3", "-1.2.3", "1.2.3-", "x".repeat(200), null, 5, undefined]) expect(cleanVersion(bad), String(bad)).toBeNull();
  });

  test("compare: older, same, newer, with the ordering rules explained", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toMatchObject({ order: -1, message: "1.2.3 is older than 1.2.4." });
    expect(compareVersions("1.10.0", "1.9.0")).toMatchObject({ order: 1, message: "1.10.0 is newer than 1.9.0." });
    expect(compareVersions("v2.0.0", "2.0.0")).toMatchObject({ order: 0, message: "2.0.0 and 2.0.0 are the same version." });
    const pre = compareVersions("1.0.0-beta.2", "1.0.0");
    expect(pre.order).toBe(-1);
    expect(pre.notes.join(" ")).toMatch(/pre-release/);
    expect(compareVersions("1.0.0-alpha.10", "1.0.0-alpha.9").order).toBe(1);
    expect(compareVersions("1.0.0+a", "1.0.0+b")).toMatchObject({ order: 0 });
    expect(compareVersions("1.0.0+a", "1.0.0+b").notes.join(" ")).toMatch(/ignored/);
    expect(compareVersions("0.9.9", "1.0.0").order).toBe(-1);
  });

  test("compare refuses things that aren't versions in plain words, without echoing long text", () => {
    expect(fails(() => compareVersions("abc", "1.0.0")).message).toMatch(/isn't a version/);
    expect(fails(() => compareVersions("1.2", "1.0.0")).code).toBe("BAD_VERSION");
    expect(fails(() => compareVersions("", "1.0.0")).code).toBe("BAD_REQUEST");
    expect(fails(() => compareVersions("1.0.0", undefined)).message).toMatch(/Type the second version/);
    expect(fails(() => compareVersions("z".repeat(500), "1.0.0")).message.length).toBeLessThan(300);
  });
});

describe("ranges", () => {
  test("the usual range forms", () => {
    const yes: Array<[string, string]> = [["1.2.3", "^1.2.0"], ["1.9.9", "^1.2.0"], ["2.5.0", ">=2 <3"], ["1.2.3", "1.x"], ["1.2.9", "~1.2.0"], ["3.1.0", "1.x || >=3"], ["1.2.3", "*"], ["1.2.5", "1.2.3 - 1.2.9"], ["20.11.0", ">=18.0.0 <21"], ["0.2.5", "^0.2.3"], ["1.2.3", "=1.2.3"], ["1.2.3", "1.2.3"], ["1.0.0-beta.2", ">=1.0.0-beta.1"]];
    const no: Array<[string, string]> = [["2.0.0", "^1.2.0"], ["1.1.9", "^1.2.0"], ["3.0.0", ">=2 <3"], ["2.0.0", "1.x"], ["1.3.0", "~1.2.0"], ["2.5.0", "1.x || >=3"], ["1.3.0", "1.2.3 - 1.2.9"], ["0.3.0", "^0.2.3"], ["1.0.0-beta.1", "^1.0.0"]];
    for (const [v, r] of yes) expect(checkRange(v, r).satisfies, `${v} ${r}`).toBe(true);
    for (const [v, r] of no) expect(checkRange(v, r).satisfies, `${v} ${r}`).toBe(false);
  });

  test("the answer is a sentence, and a beta that doesn't fit explains why", () => {
    expect(checkRange("1.2.3", "^1.2.0").message).toBe("1.2.3 fits ^1.2.0.");
    expect(checkRange("2.0.0", " ^1.2.0 ").message).toBe("2.0.0 does not fit ^1.2.0.");
    expect(checkRange("1.3.0-beta.1", "^1.2.0").notes.join(" ")).toMatch(/pre-release version only fits/);
  });

  test("things Bun.semver would accept as 'anything' are refused here: it never answers yes to nonsense", () => {
    for (const bad of ["not a range", "", "   ", "^", ">=", "1.2.3 -", "||", "1.2.3 ||", "latest", "^1.2.3; rm -rf /", "1.2.3 1.2.4 abc", "a".repeat(300)]) {
      const err = fails(() => checkRange("1.2.3", bad));
      expect(["BAD_RANGE", "BAD_REQUEST"], bad.slice(0, 20)).toContain(err.code);
    }
    expect(fails(() => checkRange("1.2.3", "latest")).message).toMatch(/isn't a range I can read.*Examples/);
    expect(fails(() => checkRange("1.2", "^1")).code).toBe("BAD_VERSION");
    expect(isRange("^1.2.0")).toBe(true);
    expect(isRange("nonsense")).toBe(false);
  });
});

describe("sorting a list", () => {
  test("oldest first by default, newest first on request, duplicates counted once, mess reported by line", () => {
    const text = "1.10.0\n1.2.0\n\nv1.2.0\n1.2.0-beta\n0.9.9\nnot-a-version\n1.2\n2.0.0-rc.1\n2.0.0\n";
    const up = sortVersions(text);
    expect(up.sorted).toEqual(["0.9.9", "1.2.0-beta", "1.2.0", "1.10.0", "2.0.0-rc.1", "2.0.0"]);
    expect(up.duplicates).toBe(1);
    expect(up.invalid).toEqual([[7, "not-a-version"], [8, "1.2"]]);
    expect(sortVersions(text, true).sorted).toEqual([...up.sorted].reverse());
    expect(sortVersions("1.0.0\r\n0.1.0\r\n").sorted).toEqual(["0.1.0", "1.0.0"]);
  });

  test("empty, no versions at all, and far too many lines are explained", () => {
    expect(fails(() => sortVersions("")).message).toMatch(/Paste some versions/);
    expect(fails(() => sortVersions("a\nb")).code).toBe("BAD_VERSION");
    expect(fails(() => sortVersions(Array.from({ length: 2001 }, () => "1.0.0").join("\n"))).code).toBe("TOO_LARGE");
    expect(sortVersions(Array.from({ length: 2000 }, (_v, i) => `1.0.${i}`).join("\n")).sorted.length).toBe(2000);
  });
});

describe("what a project asks for", () => {
  test("version numbers are found inside what tools print", () => {
    expect([versionIn("v20.11.0"), versionIn("Python 3.12.1"), versionIn("go version go1.22.0 darwin/arm64"), versionIn("git version 2.43"), versionIn("openjdk 21.0.1-ea"), versionIn(null), versionIn("none")]).toEqual(["20.11.0", "3.12.1", "1.22.0", "2.43.0", "21.0.1-ea", null, null]);
  });

  test("pins become ranges: 20 means 20.x, a full version means exactly that, unknown names are left alone", () => {
    expect([pinRange("20"), pinRange("v20.11"), pinRange("20.11.0"), pinRange("lts/*"), pinRange("system"), pinRange("1.2.3-rc.1")]).toEqual(["20.x", "20.11.x", "=20.11.0", null, null, "=1.2.3-rc.1"]);
  });

  test("judge: fits, older, newer, missing and unreadable", () => {
    expect(judge("node", "x", ">=18", ">=18", "20.1.0").status).toBe("ok");
    expect(judge("node", "x", ">=18", ">=18", "16.0.0")).toMatchObject({ status: "older", message: "node 16.0.0 is older than >=18. Update it." });
    expect(judge("node", "x", "^8 || ^9", "^8 || ^9", "11.0.0").status).toBe("newer");
    expect(judge("node", "x", "20", "20.x", "21.0.0").status).toBe("newer");
    expect(judge("node", "x", "20", "20.x", "19.9.0").status).toBe("older");
    expect(judge("node", "x", ">=18", ">=18", null).status).toBe("missing");
    expect(judge("node", "x", "lts/*", null, "20.0.0").status).toBe("unknown");
    expect(judge("node", "x", "weird", "weird", "20.0.0").status).toBe("unknown");
  });

  test("a project folder is read (package.json engines, .tool-versions, pin files) and compared with the tools found here", async () => {
    const project = join(root, "proj");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "package.json"), JSON.stringify({ engines: { node: ">=18", bun: ">=99.0.0", yarn: "^1.22", unknownthing: "1" } }));
    writeFileSync(join(project, ".tool-versions"), "# comment\nnodejs 20.11.0\npython 3.12 # trailing\nmystery 1.0\n");
    writeFileSync(join(project, ".nvmrc"), "v20\n");
    // a stand-in `node`, `bun` and `python3` that print fixed versions, found through the injectable tool folder
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const fakeTool = (name: string, text: string) => {
      writeFileSync(join(bin, name), `#!/bin/sh\necho "${text}"\n`, { mode: 0o755 });
    };
    fakeTool("node", "v20.11.0");
    fakeTool("bun", "1.4.2");
    fakeTool("python3", "Python 3.11.4");
    const ctx = createContext({ platform: "linux", home: root, dataDir: join(root, "data"), toolDirs: [bin] });
    const r = await checkProjectVersions(ctx, project);
    expect(r.sources).toEqual(["package.json", ".tool-versions", ".nvmrc"]);
    const by = (tool: string, source: string) => r.requirements.find((x) => x.tool === tool && x.source === source)!;
    if (process.platform === "win32") return;
    expect(by("node", "package.json engines")).toMatchObject({ status: "ok", installed: "20.11.0" });
    expect(by("bun", "package.json engines")).toMatchObject({ status: "older", installed: "1.4.2" });
    expect(by("yarn", "package.json engines").status).toBe("missing");
    expect(by("nodejs", ".tool-versions")).toMatchObject({ status: "ok", wanted: "20.11.0" });
    expect(by("python", ".tool-versions")).toMatchObject({ status: "older", installed: "3.11.4" });
    expect(by("node", ".nvmrc")).toMatchObject({ status: "ok", wanted: "v20" });
    expect(r.requirements.some((x) => x.tool === "mystery" || x.tool === "unknownthing")).toBe(false);
  });

  test("a folder with nothing to check, and a damaged package.json, are handled", async () => {
    const empty = join(root, "empty-proj");
    mkdirSync(empty, { recursive: true });
    const ctx = createContext({ platform: "linux", home: root, dataDir: join(root, "data2"), toolDirs: [join(root, "no-bin")] });
    expect(await checkProjectVersions(ctx, empty)).toEqual({ requirements: [], sources: [] });
    const broken = join(root, "broken-proj");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "package.json"), "{ nope");
    expect((await checkProjectVersions(ctx, broken)).sources).toEqual(["package.json (couldn't be read)"]);
  });
});

describe("dev/semver over the operation table", () => {
  const ctx = createContext({ platform: "linux", home: root, dataDir: join(root, "data3"), toolDirs: [join(root, "no-bin")] });
  const op = (b: Record<string, unknown>) => devOperations["dev/semver"]!(ctx, b) as Promise<any>;
  test("registered, and each action answers", async () => {
    expect(API_OPERATIONS).toContain("dev/semver");
    expect((await op({ action: "compare", a: "1.0.0", b: "2.0.0" })).order).toBe(-1);
    expect((await op({ action: "range", version: "1.5.0", range: "^1.2.0" })).satisfies).toBe(true);
    expect((await op({ action: "sort", text: "2.0.0\n1.0.0", descending: true })).sorted).toEqual(["2.0.0", "1.0.0"]);
    expect((await op({ action: "project", root: join(root, "empty-proj") })).requirements).toEqual([]);
    await expect(op({ action: "dance" })).rejects.toBeInstanceOf(FmError);
    await expect(op({ action: "project", root: join(root, "nowhere") })).rejects.toBeInstanceOf(FmError);
    await expect(op({ action: "project", root: "relative" })).rejects.toBeInstanceOf(FmError);
  });
});
