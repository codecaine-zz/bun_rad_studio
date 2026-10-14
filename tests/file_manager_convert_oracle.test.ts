/**
 * Bun's own parsers (Bun.YAML, Bun.TOML, Bun.JSON5) used as an independent check of the built-in data converters:
 * what the converters read must mean the same as what Bun reads, and what they write must be read back by Bun as
 * the same data. Known, documented differences are listed in the "known differences" test.
 */
import { describe, expect, test } from "bun:test";
import { Notes } from "../src/features/filemanager/fmConvCommon";
import { parseJson, parseToml, parseYaml, writeJson, writeToml, writeYaml } from "../src/features/filemanager/fmConvData";

/** Dates and non-finite numbers made comparable. */
const norm = (v: any): any =>
  typeof v === "number" && !Number.isFinite(v) ? { $number: String(v) }
    : v instanceof Date ? { $date: v.toISOString() }
      : typeof v === "bigint" ? { $big: String(v) }
        // Bun.TOML returns dates and times as Temporal objects; they write themselves with toJSON()
        : v && typeof v === "object" && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null && typeof v.toJSON === "function" ? norm(v.toJSON())
        : Array.isArray(v) ? v.map(norm)
          : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]))
            : v;
const same = (a: unknown, b: unknown) => Bun.deepEquals(norm(a), norm(b), true);

function bothParse(ours: () => unknown, bun: () => unknown, label: string): void {
  let a: unknown, b: unknown, ea = "", eb = "";
  try { a = ours(); } catch (e: any) { ea = String(e.message); }
  try { b = bun(); } catch (e: any) { eb = String(e.message); }
  if (ea || eb) expect(!!ea, `${label}\n ours: ${ea || JSON.stringify(norm(a))}\n bun: ${eb || JSON.stringify(norm(b))}`).toBe(!!eb);
  else expect(same(a, b), `${label}\n ours: ${JSON.stringify(norm(a))}\n bun:  ${JSON.stringify(norm(b))}`).toBe(true);
}

const YAML_DOCS = [
  "a: 1\nb: [1, 2, 3]\nc:\n  d: true\n  e: null\n",
  "- a\n- b: 1\n  c: 2\n- [x, y]\n",
  "s: 'single ''quoted'''\nd: \"double \\n escaped \\u00e9\"\n",
  "multi: |\n  line1\n  line2\nfold: >\n  folded\n  text\n",
  "anchors: &a {x: 1}\nref: *a\nmerge:\n  <<: *a\n  y: 2\n",
  "n: 0x1F\no: 0o17\nf: 1.5e3\ninf: .inf\nnan: .nan\nneg: -12\n",
  "t: yes\nf: no\nn: ~\nempty:\n",
  "date: 2024-01-15\ndt: 2024-01-15T10:30:00Z\n",
  "list:\n- 1\n-\n  - 2\n  - 3\n",
  "key with spaces: v\n'quoted key': 1\n\"x\": 2\n",
  "a: 1 # comment\n# whole\nb: 2\n",
  "str: 007\nver: 1.10\nstr2: '1'\nbig: 12345678901234567890\n",
  "url: http://x.y/z?a=b#c\ncolon: 'a: b'\ntime: 12:30:45\n",
  "empty_list: []\nempty_map: {}\ntilde: ~\n",
  "a:\n  - b:\n      - c\n",
  "a: [1, 2\n",
  "a: b: c\n",
  "\ta: 1\n",
  "a: 'unclosed\n",
];

const TOML_DOCS = [
  'a = 1\nb = "x"\n[t]\nc = [1,2]\n',
  '[[arr]]\nx = 1\n[[arr]]\nx = 2\n',
  'd = 2024-01-15\ndt = 2024-01-15T10:30:00Z\nldt = 2024-01-15T10:30:00\n',
  'i = 0xff\no = 0o17\nb = 0b101\nu = 1_000\nf = 1e3\ninf = inf\nnan = nan\nneg = -5\n',
  's = """\nmulti\nline"""\nl = \'literal\\n\'\nm = \'\'\'raw\n\'\'\'\n',
  'inline = { a = 1, b = { c = 2 } }\n"quoted key" = 1\na.b.c = 3\n',
  'bool = true\nz = false\n',
  'arr = [ [1,2], ["a"], {x=1} ]\n',
  'e = ""\nu = "\\u00e9 \\U0001F600"\n',
  '[a.b]\nc = 1\n[a]\nd = 2\n',
  'bad = \n',
  'dup = 1\ndup = 2\n',
  'a = [1, 2\n',
  '[t]\n[t]\n',
  'x = 1 y = 2\n',
];

const JSON5_DOCS = [
  "{a:1, 'b':2, \"c\":3,}", "// c\n{x: [1,2,],}", "{h: 0xFF, p: +1, n: -.5}", "{s: 'a\\\nb', t: \"q\\x41\"}", "/* c */ [1, /* in */ 2]", "{a:1, a:2}", "{unquoted_key: null, $k: 1, _k: 2}", "'str'",
  "[1,2", "{a:}", "0x10", "{e: 1e3, f: 1E-2, g: .5, h: 5.}", "'\\a\\v\\0'", "{a: 'x\u2028y'}", "{a:1}x", "[1 2]", "{a:1 b:2}", "'unterminated", "{'a':1,\n}", "[,]", "[1,,2]",
  "{a:0777}", "{a: 00}", "{a: 1_0}", "{ä: 1, \\u0061b: 2, 日本: 3}", "[0.]", "[.e1]", "[+.5]", "{\"a\":\"\\u00e9\\ud83d\\ude00\"}", "{a: 'it\\'s'}", "'\\x4'", "{a: '\\01'}",
];

describe("YAML: what the converter reads, Bun reads the same way", () => {
  for (const doc of YAML_DOCS) test(JSON.stringify(doc).slice(0, 70), () => bothParse(() => parseYaml(doc), () => Bun.YAML.parse(doc), doc));
});

describe("TOML: what the converter reads, Bun reads the same way", () => {
  for (const doc of TOML_DOCS) test(JSON.stringify(doc).slice(0, 70), () => bothParse(() => parseToml(doc), () => Bun.TOML.parse(doc), doc));
});

describe("TOML dates and times (a bug this oracle found: they used to become {})", () => {
  test("every kind of TOML date and time is kept as text (offsets become the same moment in UTC)", () => {
    const toml = "offset = 2024-01-15T10:30:00Z\nlocal = 2024-01-15T10:30:00\nday = 2024-01-15\nclock = 10:30:00\nplus = 1979-05-27T07:32:00+01:00\n";
    expect(parseToml(toml)).toEqual({ offset: "2024-01-15T10:30:00Z", local: "2024-01-15T10:30:00", day: "2024-01-15", clock: "10:30:00", plus: "1979-05-27T06:32:00Z" }); // a time with an offset is read by Bun as the same moment in UTC
    expect(parseToml("when = [2024-01-15, 2024-02-01]\n[t]\nd = 2000-01-01T00:00:00Z\n")).toEqual({ when: ["2024-01-15", "2024-02-01"], t: { d: "2000-01-01T00:00:00Z" } });
    expect(JSON.parse(writeJson(parseToml("when = 2024-01-15T10:30:00Z"), 0, new Notes()))).toEqual({ when: "2024-01-15T10:30:00Z" });
  });
});

describe("JSON5: what the converter reads, Bun reads the same way", () => {
  for (const doc of JSON5_DOCS) test(JSON.stringify(doc).slice(0, 70), () => bothParse(() => parseJson(doc, true, new Notes()), () => Bun.JSON5.parse(doc), doc));

  test("bugs this oracle found, now fixed: \\x escapes, other identity escapes, line continuations, unicode and escaped keys, leading zeros", () => {
    const ok = (text: string) => parseJson(text, true, new Notes());
    expect(ok("{t: \"q\\x41\"}")).toEqual({ t: "qA" });
    expect(ok("'\\a\\v\\0'")).toBe("a\v\0");
    expect(ok("{s: 'a\\\nb'}")).toEqual({ s: "ab" });
    expect(ok("{ä: 1, \\u0061b: 2, 日本: 3, $x: 4}")).toEqual({ ä: 1, ab: 2, 日本: 3, $x: 4 });
    for (const bad of ["{a:0777}", "[00]", "[-01]"]) expect(() => ok(bad), bad).toThrow(/can't start with a zero/);
    expect(ok("[0, 0.5, -0, 10]")).toEqual([0, 0.5, 0, 10]);
    // strict JSON still refuses all of it
    for (const bad of ["{\"t\": \"q\\x41\"}", "\"\\a\"", "[01]"]) expect(() => parseJson(bad, false, new Notes()), bad).toThrow();
  });

  test("known differences: Infinity and NaN have no JSON form, so the converter writes null and says so (Bun keeps them as numbers)", () => {
    const notes = new Notes();
    expect(parseJson("[Infinity, -Infinity, NaN]", true, notes)).toEqual([null, null, null]);
    expect(notes.toString()).toContain("Infinity and NaN have no JSON form");
    expect(Bun.JSON5.parse("[Infinity, -Infinity, NaN]")).toEqual([Infinity, -Infinity, NaN]);
  });
});

// A small seeded random generator, so a failure can be reproduced.
function generator(seed: number) {
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const pick = <T,>(list: T[]): T => list[Math.floor(next() * list.length)]!;
  const WORDS = ["a", "b c", "x:y", "- dash", "# hash", "yes", "no", "null", "~", "true", "123", "1.5", "0x1F", "2024-01-15", "12:30", "é✓日本😀", " lead", "trail ", "", "multi\nline", "tab\there", 'q"uote', "it's", "back\\slash", "{", "[", "]", "}", ",", "&a", "*a", "!tag", "%x", "@x", "`x", "|", ">", "?", ": x", "x: ", "=", "<<", "---", "...", "\u00a0", "1e3", ".inf", "-.inf", "0o17", "0b1", "+1", "-", "- ", ":", "a #b", "a#b", "'", '"', "\\n", "\r\n", "\u2028", "\ufeff", "ON", "Off", "y", "n", "0", "-0", "00", "1_000", "NaN", "Infinity"];
  const scalars: Array<() => unknown> = [() => pick(WORDS), () => Math.floor(next() * 2000) - 1000, () => Math.round(next() * 1e6) / 1e3, () => next() < 0.5, () => 0, () => -1.5e-7, () => 123456789012];
  const KEYS = ["a", "b", "key with space", "x:y", "é", "1", "true", "null", "a.b", "k-1", "K_2", "", "- x", "#c", "yes", "~", "'q'", '"d"', "tab\tk", "日本"];
  const tree = (depth: number): unknown => {
    const r = next();
    if (depth <= 0 || r < 0.35) return pick(scalars)();
    if (r < 0.65) return Array.from({ length: Math.floor(next() * 4) }, () => tree(depth - 1));
    const o: Record<string, unknown> = {};
    for (let i = 0, n = Math.floor(next() * 4); i < n; i++) o[pick(KEYS)] = tree(depth - 1);
    return o;
  };
  return tree;
}

describe("what the converters write is read back by Bun as the same data", () => {
  const tree = generator(20260514);
  const samples = Array.from({ length: 400 }, () => tree(3));

  test("YAML: 400 random trees full of awkward text (colons, #, yes/no, numbers as text, unicode, line breaks)", () => {
    const bad: string[] = [];
    for (const v of samples) {
      const text = writeYaml(v as any);
      let back: unknown, err = "";
      try { back = Bun.YAML.parse(text); } catch (e: any) { err = e.message; }
      if (err || !same(back, v)) bad.push(`${JSON.stringify(v)}\n${text}\n=> ${err || JSON.stringify(back)}`);
    }
    expect(bad.slice(0, 3).join("\n---\n")).toBe("");
  });

  test("TOML: the same trees, as top-level tables", () => {
    const bad: string[] = [];
    let tested = 0;
    for (const v of samples) {
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      tested++;
      const text = writeToml(v as any, new Notes());
      let back: unknown, err = "";
      try { back = Bun.TOML.parse(text); } catch (e: any) { err = e.message; }
      if (err || !same(back, v)) bad.push(`${JSON.stringify(v)}\n${text}\n=> ${err || JSON.stringify(back)}`);
    }
    expect(tested).toBeGreaterThan(40);
    expect(bad.slice(0, 3).join("\n---\n")).toBe("");
  });

  test("JSON: pretty and minified output parse back to the same data, and the key order is kept", () => {
    for (const v of samples) {
      for (const indent of [2, 0]) expect(same(JSON.parse(writeJson(v as any, indent, new Notes())), JSON.parse(JSON.stringify(v)))).toBe(true);
    }
    expect(writeJson({ b: 1, a: 2 }, 0, new Notes()).trim()).toBe('{"b":1,"a":2}');
  });
});
