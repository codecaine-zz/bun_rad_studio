import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { COMPARE_MAX_BYTES, COMPARE_MAX_ENTRIES, comparableKind, compareDataFiles, dataCompareOperations, diffValues, parseDataText, toPlain } from "../src/features/filemanager/fmDataCompare";
import { FmError } from "../src/features/filemanager/fmPaths";
import { API_OPERATIONS } from "../src/features/filemanager/fmServer";

const root = mkdtempSync(join(tmpdir(), "fm-datacmp-"));
const ctx = createContext({ home: root, dataDir: join(root, "data") });
beforeAll(() => mkdirSync(root, { recursive: true }));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const put = (name: string, text: string) => {
  writeFileSync(join(root, name), text);
  return join(root, name);
};
const failure = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (err: any) {
    expect(err).toBeInstanceOf(FmError);
    return { code: err.code as string, message: err.message as string };
  }
  throw new Error("should have failed");
};

describe("which files can be compared", () => {
  test("by extension: JSON, JSON5/JSONC, YAML and TOML only", () => {
    expect(["a.json", "a.JSON", "a.jsonc", "a.json5", "a.yaml", "a.yml", "a.toml", "a.txt", "a.csv", "json", ".json"].map(comparableKind)).toEqual(["JSON", "JSON", "JSON5", "JSON5", "YAML", "YAML", "TOML", null, null, null, null]);
  });
  test("the operation is registered", () => expect(API_OPERATIONS).toContain("data/compare"));
});

describe("identical in meaning", () => {
  test("key order, spacing and quoting don't matter, and the answer says the files are written differently", async () => {
    const a = put("a.json", '{"name":"x","list":[1,2,{"k":true}],"nested":{"b":1,"a":2}}');
    const b = put("b.json", '{\n  "nested": { "a": 2, "b": 1 },\n  "list": [1, 2, { "k": true }],\n  "name": "x"\n}\n');
    const r = await compareDataFiles(ctx, a, b);
    expect(r).toMatchObject({ identical: true, sameBytes: false, total: 0, changed: [], onlyLeft: [], onlyRight: [] });
    expect(r.notes.join(" ")).toMatch(/written differently/);
    const same = await compareDataFiles(ctx, a, a);
    expect(same).toMatchObject({ identical: true, sameBytes: true, notes: [] });
  });

  test("across formats: the same settings in JSON, YAML, TOML and JSON5 are identical", async () => {
    const json = put("s.json", '{"title":"T","n":3,"on":true,"tags":["a","b"],"db":{"host":"h","port":5432}}');
    const yaml = put("s.yaml", "db:\n  port: 5432\n  host: h\ntags: [a, b]\non: true\nn: 3\ntitle: T # comment\n");
    const toml = put("s.toml", 'title = "T"\nn = 3\non = true\ntags = ["a", "b"]\n[db]\nhost = "h"\nport = 5432\n');
    const json5 = put("s.json5", "// hi\n{title: 'T', n: 3, on: true, tags: ['a', 'b',], db: {host: 'h', port: 5432}}");
    for (const other of [yaml, toml, json5]) {
      const r = await compareDataFiles(ctx, json, other);
      expect(r.identical, other).toBe(true);
      expect(r.notes.join(" ")).toMatch(/compared by what they say/);
    }
  });
});

describe("what differs", () => {
  test("changed values, only-left and only-right keys, with paths a person can read", async () => {
    const a = put("l.json", JSON.stringify({ name: "x", version: 1, keep: [1, 2, 3], gone: { deep: true }, db: { host: "a", port: 1 }, "odd key": 1 }));
    const b = put("r.json", JSON.stringify({ name: "y", version: 1, keep: [1, 9, 3, 4], added: "new", db: { host: "a", port: 2, user: "u" }, "odd key": 2 }));
    const r = await compareDataFiles(ctx, a, b);
    expect(r.identical).toBe(false);
    expect(r.changed).toEqual([
      { path: "name", left: '"x"', right: '"y"' },
      { path: "keep[1]", left: "2", right: "9" },
      { path: "db.port", left: "1", right: "2" },
      { path: '["odd key"]', left: "1", right: "2" },
    ]);
    expect(r.onlyLeft).toEqual([{ path: "gone", left: '{"deep":true}' }]);
    expect(r.onlyRight).toEqual([{ path: "keep[3]", right: "4" }, { path: "db.user", right: '"u"' }, { path: "added", right: '"new"' }]);
    expect(r.total).toBe(8);
    expect(r.truncated).toBe(false);
  });

  test("a value that changes kind says so in plain words", () => {
    const d = diffValues({ a: 1, b: [1], c: { x: 1 }, d: null }, { a: "1", b: { 0: 1 }, c: [1], d: false });
    expect(d.changed.map((x) => [x.path, x.note])).toEqual([["a", "a number became text"], ["b", "a list became a group of settings"], ["c", "a group of settings became a list"], ["d", "null became true/false"]]);
  });

  test("lists are compared position by position; null and missing are different things", () => {
    const d = diffValues({ a: null, l: [1, 2] }, { l: [1], z: null });
    expect(d.onlyLeft).toEqual([{ path: "a", left: "null" }, { path: "l[1]", left: "2" }]);
    expect(d.onlyRight).toEqual([{ path: "z", right: "null" }]);
  });

  test("a different top-level kind is reported for the whole file", () => {
    expect(diffValues([1], { a: 1 }).changed).toEqual([{ path: "(the whole file)", left: "[1]", right: '{"a":1}', note: "a list became a group of settings" }]);
  });

  test("dates, big numbers and odd numbers are compared as what they say", async () => {
    const y = put("d.yaml", "when: 2024-01-15T10:30:00Z\nday: 2024-01-15\ninf: .inf\nnone: ~\n");
    const t = put("d.toml", 'when = 2024-01-15T10:30:00Z\nday = 2024-01-15\ninf = "Infinity"\n');
    const r = await compareDataFiles(ctx, y, t);
    expect(r.changed).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/compared by what they say/);
    expect(r.onlyLeft.map((x) => x.path)).toContain("none");
    expect(toPlain({ a: 10n, b: Infinity, c: new Date(0), d: undefined, e: -0 })).toEqual({ a: "10", b: "Infinity", c: "1970-01-01T00:00:00.000Z", d: null, e: 0 });
  });

  test("long values are shortened, and a huge number of differences is capped but counted", () => {
    const long = "x".repeat(500);
    expect(diffValues({ a: long }, { a: "y" }).changed[0]!.left!.length).toBeLessThan(210);
    const left: Record<string, number> = {};
    const right: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      left[`k${i}`] = i;
      right[`k${i}`] = i + 1;
    }
    const d = diffValues(left, right);
    expect(d.changed.length).toBe(COMPARE_MAX_ENTRIES);
    expect(d.total).toBe(1000);
    expect(d.truncated).toBe(true);
  });

  test("a deeply nested file is refused rather than overflowing", async () => {
    const deep = "[".repeat(150) + "]".repeat(150);
    const f = put("deep.json", deep);
    expect((await failure(() => compareDataFiles(ctx, f, f))).code).toBe("TOO_DEEP");
  });
});

describe("bad input", () => {
  test("a file that isn't valid says which one and why, in each format", async () => {
    const good = put("ok.json", "{}");
    for (const [name, text, kind] of [["bad.json", "{ nope", "JSON"], ["bad.yaml", "a: [1\n", "YAML"], ["bad.toml", "a = \n", "TOML"], ["bad.json5", "{a:}", "JSON5"]] as const) {
      const f = put(name, text);
      const e = await failure(() => compareDataFiles(ctx, good, f));
      expect(e.code).toBe("BAD_DATA");
      expect(e.message).toContain(`"${name}" couldn't be read as ${kind}`);
      const e2 = await failure(() => compareDataFiles(ctx, f, good));
      expect(e2.message).toContain(name);
    }
  });

  test("the wrong kind of file, a folder, a missing file, a huge file and bad paths", async () => {
    const good = put("g.json", "{}");
    expect((await failure(() => compareDataFiles(ctx, good, put("t.txt", "{}")))).code).toBe("NOT_DATA");
    mkdirSync(join(root, "dir.json"), { recursive: true });
    expect((await failure(() => compareDataFiles(ctx, good, join(root, "dir.json")))).code).toBe("NOT_A_FILE");
    expect((await failure(() => compareDataFiles(ctx, good, join(root, "missing.json")))).code).toBe("ENOENT");
    writeFileSync(join(root, "huge.json"), Buffer.alloc(COMPARE_MAX_BYTES + 1, " "));
    expect((await failure(() => compareDataFiles(ctx, good, join(root, "huge.json")))).code).toBe("TOO_LARGE");
    expect((await failure(() => compareDataFiles(ctx, good, "relative.json"))).code).toBe("BAD_PATH");
    expect((await failure(() => compareDataFiles(ctx, good, undefined))).code).toBe("BAD_PATH");
  });

  test("a byte-order mark is ignored, and parseDataText reads each kind", () => {
    expect(parseDataText('\uFEFF{"a":1}', "JSON", "x.json")).toEqual({ a: 1 });
    expect(parseDataText("a: 1", "YAML", "x.yaml")).toEqual({ a: 1 });
    expect(parseDataText("a = 1", "TOML", "x.toml")).toEqual({ a: 1 });
    expect(parseDataText("{a: 1,}", "JSON5", "x.json5")).toEqual({ a: 1 });
  });

  test("over the operation", async () => {
    const a = put("o1.yaml", "a: 1\n");
    const b = put("o2.json", '{"a":2}');
    const r = (await dataCompareOperations["data/compare"]!(ctx, { left: a, right: b })) as any;
    expect(r.changed).toEqual([{ path: "a", left: "1", right: "2" }]);
    expect(r.left).toEqual({ name: "o1.yaml", kind: "YAML", bytes: 5 });
  });
});
