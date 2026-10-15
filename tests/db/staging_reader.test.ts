import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, createWriteStream } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { analyzeSource, readRows, type SourceSettings } from "../../src/db/staging/reader";
import { detectEncoding, fileSource, memorySource } from "../../src/db/staging/source";
import { applySteps, autoMap, compileRules, nameScore, normalizeName, sanitizeRules } from "../../src/db/staging/mapping";
import { detectDateOrder, formatDate, formatDateTime, inferColumn, parseBoolean, parseDate, parseNumber, titleCase } from "../../src/db/staging/values";
import { checkCell, compileUserRule } from "../../src/db/staging/validate";
import { classifyType } from "../../src/db/staging/db";
import type { TargetColumn, TargetTable } from "../../src/db/staging/types";

const dir = mkdtempSync(join(tmpdir(), "staging-reader-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function rows(text: string | Uint8Array, overrides: Partial<SourceSettings> = {}, name = "x.csv") {
  const src = typeof text === "string" ? memorySource(text, name) : { ...memorySource("", name), size: text.length, sample: async (n = 65536) => text.subarray(0, n), chunks: async function* () { yield text; } };
  const a = await analyzeSource(src, overrides);
  const out: { n: number; cells: (string | null)[]; problem?: string }[] = [];
  for await (const r of readRows(src, a.settings, a.columns.map((c) => c.name))) out.push({ n: r.n, cells: r.cells, ...(r.problem ? { problem: r.problem } : {}) });
  return { a, out };
}

describe("format detection and reading", () => {
  it("detects comma, tab, semicolon and pipe separated text, with and without a header", async () => {
    for (const [sep, label] of [[",", "comma"], ["\t", "tab"], [";", "semicolon"], ["|", "pipe"]] as const) {
      const { a, out } = await rows(`id${sep}name${sep}age\n1${sep}Ann${sep}30\n2${sep}Bob${sep}40\n`);
      expect(a.settings).toMatchObject({ format: "csv", delimiter: sep, hasHeader: true });
      expect(a.summary).toContain(label);
      expect(out.map((r) => r.cells)).toEqual([["1", "Ann", "30"], ["2", "Bob", "40"]]);
      expect(out.map((r) => r.n)).toEqual([2, 3]);
    }
    const noHeader = await rows("1,Ann,30\n2,Bob,40\n3,Cy,50\n");
    expect(noHeader.a.settings.hasHeader).toBe(false);
    expect(noHeader.a.columns.map((c) => c.name)).toEqual(["column_1", "column_2", "column_3"]);
    expect(noHeader.out[0]!.n).toBe(1);
  });

  it("handles quotes, doubled quotes, quoted separators and newlines, CRLF/LF/CR, blank lines and a lone column", async () => {
    const { out } = await rows('a,b\r\n"x, y","he said ""hi"""\r\n"line1\nline2",plain\r\n\r\n3,4\r\n');
    expect(out.map((r) => r.cells)).toEqual([["x, y", 'he said "hi"'], ["line1\nline2", "plain"], ["3", "4"]]);
    expect(out.map((r) => r.n)).toEqual([2, 3, 5]);
    expect((await rows("a,b\r1,2\r3,4\r")).out.length).toBe(2);
    const one = await rows("name\nAnn\nBob\n");
    expect(one.a.settings.delimiter).toBe("");
    expect(one.out.map((r) => r.cells)).toEqual([["Ann"], ["Bob"]]);
  });

  it("reads rows split across read chunks exactly like whole text", async () => {
    const text = Array.from({ length: 3000 }, (_, i) => `${i},"quoted, ""value"" ${i}\nline two",${i % 7}`).join("\r\n");
    const whole = await rows("id,v,k\r\n" + text);
    expect(whole.out.length).toBe(3000);
    const file = join(dir, "chunks.csv");
    writeFileSync(file, "id,v,k\r\n" + text);
    const src = fileSource(file);
    const wrapped = { ...src, chunks: async function* () { const buf = new Uint8Array(await Bun.file(file).arrayBuffer()); for (let i = 0; i < buf.length; i += 7) yield buf.subarray(i, i + 7); } };
    const a = await analyzeSource(wrapped);
    const got: string[][] = [];
    for await (const r of readRows(wrapped, a.settings, a.columns.map((c) => c.name))) got.push(r.cells as string[]);
    expect(got).toEqual(whole.out.map((r) => r.cells as string[]));
  });

  it("marks ragged rows instead of guessing", async () => {
    const { out } = await rows("a,b,c\n1,2,3\n4,5\n6,7,8,9\n");
    expect(out[0]!.problem).toBeUndefined();
    expect(out[1]).toMatchObject({ cells: ["4", "5", null], problem: "Row has 2 fields but there are 3 columns." });
    expect(out[2]!.problem).toBe("Row has 4 fields but there are 3 columns.");
  });

  it("detects UTF-8 with and without BOM, UTF-16 (both orders, with and without BOM) and Latin-1, and reads accents correctly", async () => {
    const text = "name,city\nJosé,Zürich\nÅsa,Malmö\n";
    const enc = new TextEncoder();
    const utf8 = enc.encode(text);
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    const u16le = new Uint8Array(text.length * 2);
    const u16be = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      u16le[i * 2] = c & 255; u16le[i * 2 + 1] = c >> 8;
      u16be[i * 2] = c >> 8; u16be[i * 2 + 1] = c & 255;
    }
    const latin = Uint8Array.from([...text].map((ch) => ch.charCodeAt(0)));
    const cases: [string, Uint8Array, string][] = [
      ["utf-8", utf8, "utf-8"], ["utf-8 bom", bom, "utf-8"], ["utf-16le bom", new Uint8Array([0xff, 0xfe, ...u16le]), "utf-16le"], ["utf-16be bom", new Uint8Array([0xfe, 0xff, ...u16be]), "utf-16be"],
      ["utf-16le no bom", u16le, "utf-16le"], ["utf-16be no bom", u16be, "utf-16be"], ["latin-1", latin, "windows-1252"],
    ];
    for (const [label, bytes, expected] of cases) {
      expect(detectEncoding(bytes).encoding as string, label).toBe(expected);
      const { a, out } = await rows(bytes);
      expect(a.columns.map((c) => c.name), label).toEqual(["name", "city"]);
      expect(out.map((r) => r.cells), label).toEqual([["José", "Zürich"], ["Åsa", "Malmö"]]);
    }
  });

  it("warns about characters it could not read in a big file that starts as clean UTF-8, and reads a small Latin-1 file as Latin-1", async () => {
    expect(detectEncoding(new Uint8Array([...new TextEncoder().encode("a,b\ncaf"), 0xe9, 10])).encoding).toBe("windows-1252");
    const good = new TextEncoder().encode("a,b\n" + "plain,row\n".repeat(40000) + "caf");
    const bytes = new Uint8Array([...good, 0xe9, ...new TextEncoder().encode(",x\n")]);
    const { a } = await rows(bytes);
    expect(a.warnings.join(" ")).toMatch(/could not be read/);
  });

  it("reads a JSON list, JSON Lines, arrays of arrays, nested values, awkward strings, and fails clearly on broken JSON", async () => {
    const j = await rows('[{"id":1,"name":"Ann","tags":["a","b"],"ok":true,"n":null},{"id":2,"name":"]},\\"x"}, {"id":3,"extra":1.5}]', {}, "d.json");
    expect(j.a.settings.format).toBe("json");
    expect(j.a.columns.map((c) => c.name)).toEqual(["id", "name", "tags", "ok", "n", "extra"]);
    expect(j.out[0]!.cells).toEqual(["1", "Ann", '["a","b"]', "true", null, null]);
    expect(j.out[1]!.cells[1]).toBe(']},"x');
    expect(j.out[2]!.cells).toEqual(["3", null, null, null, null, "1.5"]);
    const nd = await rows('{"a":1}\n\n{"a":2,"b":"x"}\nnot json\n', {}, "d.ndjson");
    expect(nd.a.settings.format).toBe("ndjson");
    expect(nd.out.map((r) => r.cells[0])).toEqual(["1", "2", null]);
    expect(nd.out[2]!.problem).toMatch(/Not valid JSON/);
    const arr = await rows('[["id","name"],[1,"Ann"],[2,"Bob"]]', {}, "a.json");
    expect(arr.a.columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(arr.out.map((r) => r.cells)).toEqual([["1", "Ann"], ["2", "Bob"]]);
    await expect(rows('{"a":1}', { format: "json" }, "x.json")).rejects.toThrow(/not a list/);
    await expect(rows('[{"a":1},{"a":', {}, "x.json")).rejects.toThrow(/cut off/);
  });

  it("says plainly that Excel files cannot be read", async () => {
    await expect(rows(new Uint8Array([0x50, 0x4b, 3, 4, 20, 0, 0, 0]), {}, "book.xlsx")).rejects.toThrow(/Excel.*can't be read here.*CSV UTF-8/);
    await expect(rows(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), {}, "old.xls")).rejects.toThrow(/Excel/);
    await expect(rows("", {}, "e.csv")).rejects.toThrow(/empty/);
  });

  it("lets the person override every detected setting", async () => {
    const { a, out } = await rows("a;b\n1;2\n", { delimiter: ",", hasHeader: false });
    expect(a.settings).toMatchObject({ delimiter: ",", hasHeader: false });
    expect(out[0]!.cells).toEqual(["1;2"] .concat([]).slice(0, 1).length ? ["a;b"] : []);
  });

  it("streams a large file with bounded memory", async () => {
    const file = join(dir, "big.csv");
    const ws = createWriteStream(file);
    const line = "12345,Some Name With Spaces,someone@example.com,2024-03-01,19.99,\"a, quoted, value\",tail tail tail tail\n";
    const target = 60 * 1024 * 1024;
    ws.write("id,name,email,day,price,note,tail\n");
    const chunk = line.repeat(20000);
    for (let written = 0; written < target; written += chunk.length) if (!ws.write(chunk)) await new Promise((r) => ws.once("drain", r));
    await new Promise((r) => ws.end(r));
    const src = fileSource(file);
    const a = await analyzeSource(src);
    const startRss = process.memoryUsage().rss;
    let peak = startRss;
    let n = 0;
    for await (const r of readRows(src, a.settings, a.columns.map((c) => c.name))) {
      n++;
      if (n % 100000 === 0) peak = Math.max(peak, process.memoryUsage().rss);
      if (r.cells[0] !== "12345") throw new Error("bad row");
    }
    expect(n).toBeGreaterThan(500000);
    expect(peak - startRss).toBeLessThan(120 * 1024 * 1024);
  }, 120_000);
});

describe("values: dates, numbers, yes/no, inference", () => {
  it("reads dates in many layouts and keeps day/month order honest", () => {
    expect(formatDate(parseDate("2024-03-04")!)).toBe("2024-03-04");
    expect(formatDate(parseDate("31/12/2022")!)).toBe("2022-12-31");
    expect(formatDate(parseDate("03/04/2024", "DMY")!)).toBe("2024-04-03");
    expect(formatDate(parseDate("03/04/2024", "MDY")!)).toBe("2024-03-04");
    expect(parseDate("03/04/2024")!.ambiguous).toBe(true);
    expect(formatDate(parseDate("12 Mar 2024")!)).toBe("2024-03-12");
    expect(formatDate(parseDate("March 5, 2024")!)).toBe("2024-03-05");
    expect(formatDate(parseDate("5.3.99", "DMY")!)).toBe("1999-03-05");
    expect(formatDateTime(parseDate("2024-03-04T14:30:15Z")!)).toBe("2024-03-04 14:30:15Z");
    expect(formatDateTime(parseDate("04/03/2024 2:05 PM", "DMY")!)).toBe("2024-03-04 14:05:00");
    expect(formatDateTime(parseDate("2024-03-04 09:00:00+02:00")!)).toBe("2024-03-04 09:00:00+02:00");
    for (const bad of ["2023-02-29", "31/04/2024", "not a date", "13/13/2024", "2024-13-01", ""]) expect(parseDate(bad, "DMY"), bad).toBeNull();
    expect(detectDateOrder(["25/12/2023", "01/02/2024"]).order).toBe("DMY");
    expect(detectDateOrder(["12/25/2023", "01/02/2024"]).order).toBe("MDY");
    expect(detectDateOrder(["01/02/2024"]).order).toBe("unknown");
    expect(detectDateOrder(["2024-01-02"]).order).toBe("YMD");
  });

  it("reads numbers written in US, European and spreadsheet styles without rounding", () => {
    const eq = (s: string, want: string | null, loc: "us" | "eu" | "auto" = "auto") => expect(parseNumber(s, loc), `${s} (${loc})`).toBe(want);
    eq("1,234.56", "1234.56"); eq("1.234,56", "1234.56"); eq("1 234,56", "1234.56"); eq("€ 1.234,50", "1234.50"); eq("$1,234", "1234");
    eq("(12.5)", "-12.5"); eq("7-", "-7"); eq("-3", "-3"); eq("+3", "3"); eq("0,5", "0.5"); eq("1.234.567", "1234567");
    eq("12345678901234567890.123456789", "12345678901234567890.123456789"); eq("1e3", "1e3");
    eq("1,5", "1.5", "eu"); eq("1.5", "1.5", "us"); eq("1,234", "1234", "us");
    eq("abc", null); eq("", null); eq("1,2,3.4.5", null); eq("1.234,5,6", null);
    eq("-0", "0");
  });

  it("reads yes/no words, title case, and guesses column kinds cautiously", () => {
    expect([parseBoolean("Yes"), parseBoolean("N"), parseBoolean("1"), parseBoolean("off"), parseBoolean("maybe")]).toEqual(["true", "false", "true", "false", null]);
    expect(titleCase("mcDONALD o'neil-smith")).toBe("Mcdonald O'Neil-Smith");
    expect(inferColumn(["1", "22", "333"]).kind).toBe("integer");
    expect(inferColumn(["007", "012"]).kind).toBe("text");
    expect(inferColumn(["1.5", "2", "3.25"]).kind).toBe("decimal");
    expect(inferColumn(["1,234.50", "99"]).kind).toBe("decimal");
    expect(inferColumn(["yes", "no", "yes"]).kind).toBe("boolean");
    expect(inferColumn(["2024-03-01", "2024-03-02"])).toMatchObject({ kind: "date", needsCleaning: false });
    expect(inferColumn(["01/02/2024", "25/12/2024"])).toMatchObject({ kind: "date", dateOrder: "DMY", needsCleaning: true });
    expect(inferColumn(["2024-03-01 10:00", "2024-03-02 11:30:05"]).kind).toBe("timestamp");
    expect(inferColumn(["123e4567-e89b-12d3-a456-426614174000"]).kind).toBe("uuid");
    expect(inferColumn(['{"a":1}', "[1]"]).kind).toBe("json");
    expect(inferColumn(["hello", "2"]).kind).toBe("text");
    expect(inferColumn(["1", "", null]).nullable).toBe(true);
  });
});

describe("mapping and clean-up steps", () => {
  const tcol = (name: string, cls: TargetColumn["cls"], extra: Partial<TargetColumn> = {}): TargetColumn => ({ name, dataType: cls, cls, nullable: true, hasDefault: false, auto: false, generated: false, pkPosition: null, ...extra });
  const target: TargetTable = { engine: "sqlite", name: "people", columns: [tcol("id", "integer", { nullable: false, pkPosition: 1 }), tcol("first_name", "text"), tcol("last_name", "text"), tcol("email", "text"), tcol("phone", "text"), tcol("born", "date"), tcol("is_active", "boolean"), tcol("zip", "text")], primaryKey: ["id"], uniques: [], foreignKeys: [] };

  it("matches columns by name ignoring case, underscores, plurals and known synonyms", async () => {
    expect(normalizeName("First_Name")).toBe(normalizeName("firstName"));
    expect(normalizeName("Emails")).toBe("email");
    expect(nameScore("zip", "Postal Code")!.reason).toBe("known synonym");
    const csv = "ID,FirstName,Surname,E-mail,Telephone,Date of Birth,Active,Postcode,Notes\n1,Ann,Lee,a@x.com,555,03/04/2001,yes,12345,hi\n";
    const a = await analyzeSource(memorySource(csv));
    const m = autoMap(a.columns, target);
    const by = Object.fromEntries(m.matches.map((x) => [x.target, x.source]));
    expect(by).toMatchObject({ id: "ID", first_name: "FirstName", last_name: "Surname", email: "E-mail", phone: "Telephone", born: "Date of Birth", is_active: "Active", zip: "Postcode" });
    expect(m.unmatchedSource).toEqual(["Notes"]);
    expect(m.ambiguousDates).toEqual(["born"]);
    const boolRule = m.rules.find((r) => r.target === "is_active")!;
    expect(boolRule.steps.map((s) => s.t)).toEqual(["trim", "emptyToNull", "boolean"]);
  });

  it("applies steps, joins, splits, constants and defaults", () => {
    expect(applySteps("  Hello   World ", [{ t: "collapse" }, { t: "upper" }])).toBe("HELLO WORLD");
    expect(applySteps("", [{ t: "emptyToNull" }])).toBeNull();
    expect(applySteps(null, [{ t: "default", value: "n/a" }])).toBe("n/a");
    expect(applySteps("(555) 123-4567", [{ t: "digits" }])).toBe("5551234567");
    expect(applySteps("31/12/2022", [{ t: "date", order: "DMY" }])).toBe("2022-12-31");
    expect(applySteps("not a date", [{ t: "date", order: "DMY" }])).toBe("not a date");
    expect(applySteps("1.234,5", [{ t: "number", locale: "eu" }])).toBe("1234.5");
    expect(applySteps("Y", [{ t: "boolean" }])).toBe("true");
    expect(applySteps("a-b-c", [{ t: "replace", find: "-", with: "+" }])).toBe("a+b+c");
    const rules = sanitizeRules([
      { target: "full", source: { kind: "concat", columns: ["first", "last"], separator: " " }, steps: [{ t: "title" }] },
      { target: "first", source: { kind: "split", column: "name", separator: " ", part: 1 }, steps: [] },
      { target: "src", source: { kind: "constant", value: "import" }, steps: [] },
      { target: "dropped", source: { kind: "skip" }, steps: [] },
    ], ["first", "last", "name"], null);
    const b = compileRules(rules, ["first", "last", "name"]);
    expect(b.columns).toEqual(["full", "first", "src"]);
    expect(b.build(["ann", "LEE", "Ann Lee"]).values).toEqual(["Ann Lee", "Ann", "import"]);
    expect(b.build([null, null, null]).values).toEqual([null, null, "import"]);
    expect(b.unusedSource).toEqual([]);
  });

  it("refuses mappings that name columns that do not exist or repeat a target", () => {
    expect(() => sanitizeRules([{ target: "id", source: { kind: "column", column: "nope" } }], ["a"], ["id"])).toThrow(/no column called/);
    expect(() => sanitizeRules([{ target: "zzz", source: { kind: "skip" } }], ["a"], ["id"])).toThrow(/no column called/);
    expect(() => sanitizeRules([{ target: "id", source: { kind: "skip" } }, { target: "id", source: { kind: "skip" } }], ["a"], ["id"])).toThrow(/twice/);
  });
});

describe("cell checks (the same strict rules on every engine)", () => {
  const c = (type: string, e: "sqlite" | "mysql" | "postgres" = "postgres") => ({ ...classifyType(e, type), name: "x", dataType: type, nullable: true, hasDefault: false, auto: false, generated: false, pkPosition: null }) as TargetColumn;
  const code = (type: string, v: string, e: "sqlite" | "mysql" | "postgres" = "postgres") => checkCell(c(type, e), v, e)?.code ?? null;

  it("integers: format and range per type", () => {
    expect(code("integer", "42")).toBeNull();
    expect(code("integer", "12.5")).toBe("not_integer");
    expect(code("integer", "1,234")).toBe("bad_number_format");
    expect(code("integer", "abc")).toBe("not_integer");
    expect(code("integer", "2147483648")).toBe("out_of_range");
    expect(code("smallint", "40000")).toBe("out_of_range");
    expect(code("bigint", "9223372036854775807")).toBeNull();
    expect(code("bigint", "9223372036854775808")).toBe("out_of_range");
    expect(code("int unsigned", "-1", "mysql")).toBe("out_of_range");
    expect(code("tinyint(1)", "yes", "mysql")).toBeNull();
    expect(code("INTEGER", "9223372036854775807", "sqlite")).toBeNull();
  });
  it("decimals, dates, times, booleans, uuid, json, enum, length", () => {
    expect(code("numeric(5,2)", "123.45")).toBeNull();
    expect(code("numeric(5,2)", "123.456")).toBe("too_many_decimals");
    expect(code("numeric(5,2)", "1234.5")).toBe("too_big");
    expect(code("numeric(5,2)", "x")).toBe("not_number");
    expect(code("date", "2024-02-29")).toBeNull();
    expect(code("date", "2023-02-29")).toBe("bad_date");
    expect(code("date", "03/04/2024")).toBe("date_format");
    expect(code("timestamp without time zone", "2024-03-04 10:00:00")).toBeNull();
    expect(code("timestamp without time zone", "2024-03-04")).toBe("date_format");
    expect(code("datetime", "2024-03-04 10:00:00Z", "mysql")).toBe("timezone");
    expect(code("time", "25:00")).toBe("bad_time");
    expect(code("boolean", "maybe")).toBe("not_boolean");
    expect(code("boolean", "YES")).toBeNull();
    expect(code("uuid", "nope")).toBe("not_uuid");
    expect(code("jsonb", "{oops")).toBe("not_json");
    expect(code("jsonb", '{"a":1}')).toBeNull();
    expect(code("varchar(3)", "abcd")).toBe("too_long");
    expect(code("varchar(3)", "äöü")).toBeNull();
    expect(code("varchar(3)", "abcd", "sqlite")).toBeNull();
    const en = { ...c("enum('a','b')", "mysql") };
    expect(checkCell(en, "A", "mysql")).toBeNull();
    expect(checkCell(en, "z", "mysql")!.code).toBe("not_in_list");
  });
  it("the person's own rules compile safely", () => {
    const f = compileUserRule({ column: "x", kind: "regex", value: "^a+$" }) as (v: string | null) => string | null;
    expect(f("aaa")).toBeNull();
    expect(f("b")).toMatch(/pattern/);
    expect(compileUserRule({ column: "x", kind: "regex", value: "(" })).toMatchObject({ error: expect.stringMatching(/not valid/) });
    expect(compileUserRule({ column: "x", kind: "regex", value: "a".repeat(300) })).toMatchObject({ error: expect.stringMatching(/too long/) });
    const lim = compileUserRule({ column: "x", kind: "min", value: "5" }) as (v: string | null) => string | null;
    expect(lim("4")).toMatch(/at least 5/);
    expect(lim("1.234,5")).toBeNull();
    expect((compileUserRule({ column: "x", kind: "oneof", value: "a, b" }) as (v: string | null) => string | null)("C")).toMatch(/one of/);
    expect((compileUserRule({ column: "x", kind: "length", value: "3-4" }) as (v: string | null) => string | null)("ab")).toMatch(/3 to 4/);
  });
});
