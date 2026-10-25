/**
 * The built-in converters (nothing to install): data formats, text, encodings, Base64/hex, Markdown, spreadsheets and
 * archives. Pure functions are tested directly; the archive and spreadsheet work is tested on real files.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { gzipSync } from "zlib";
import { ConvError, Notes, flatten, inferScalar, unflatten } from "../src/features/filemanager/fmConvCommon";
import { DEFAULT_DATA_OPTIONS, convertData, parseData, type DataFormat, type DataOptions } from "../src/features/filemanager/fmConvFormats";
import { parseJson, writeJson } from "../src/features/filemanager/fmConvData";
import { runBuiltin, type BuiltinJob } from "../src/features/filemanager/fmConvBuiltin";
import { readOds, readXlsx, sheetValue, writeXlsx } from "../src/features/filemanager/fmConvSheet";
import {
  convertLineEndings, decodeBase64, decodeBytes, decodeHex, detectEncoding, encodeBase64, encodeHex, encodeText, htmlToText, markdownToHtml, safeUrl, sniffExtension, spacesToTabs,
  stripTrailingSpaces, stripUtf8Bom, tabsToSpaces,
} from "../src/features/filemanager/fmConvText";
import { zipBuffer, ZipFileWriter } from "../src/features/filemanager/fmConvZip";
import { createTarGzFrom, extractTarGz, gunzipFile, tarGzToZip, zipToTarGz } from "../src/features/filemanager/fmConvArchive";

const root = mkdtempSync(join(tmpdir(), "fm-conv-data-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let counter = 0;
const dir = (name = "t") => {
  const d = join(root, `${name}-${++counter}`);
  mkdirSync(d, { recursive: true });
  return d;
};

const O: DataOptions = { ...DEFAULT_DATA_OPTIONS };
const conv = (from: DataFormat, to: DataFormat, text: string, o: Partial<DataOptions> = {}) => convertData(from, to, text, { ...O, ...o });
const parse = (format: DataFormat, text: string, o: Partial<DataOptions> = {}) => parseData(format, text, { ...O, ...o }, new Notes());
const plainJson = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
const errorOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err: any) {
    expect(err).toBeInstanceOf(ConvError);
    return err.message;
  }
  throw new Error("expected an error");
};

const SAMPLE = { name: "Zoë \"Q\"", count: 3, ratio: 0.5, ok: true, nothing: null, tags: ["a", "b,c"], address: { city: "Köln", zip: "00123" } };

describe("JSON, JSON5 and JSONC", () => {
  test("strict JSON round trips with unicode, escapes and key order", () => {
    const text = JSON.stringify({ z: 1, a: "tab\t\"q\" \u2603 \ud83d\ude00", n: [1, 2.5, -3e2, true, null], "": 0 });
    expect(JSON.parse(writeJson(parseJson(text, false, new Notes()), 2, new Notes()))).toEqual(JSON.parse(text));
    expect(Object.keys(parseJson(text, false, new Notes()) as object)).toEqual(["z", "a", "n", ""]);
  });

  test("whole numbers beyond 15 digits keep every digit", () => {
    const out = writeJson(parseJson('{"id":12345678901234567890,"neg":-9007199254740993,"safe":9007199254740991,"f":1.5e300}', false, new Notes()), 0, new Notes());
    expect(out.trim()).toBe('{"id":12345678901234567890,"neg":-9007199254740993,"safe":9007199254740991,"f":1.5e+300}');
  });

  test("JSONC and JSON5 are read: comments, trailing commas, single quotes, bare keys, hex, Infinity", () => {
    const notes = new Notes();
    const v = parseJson(`// head\n{ /* c */ unquoted: 'single', hex: 0xFF, plus: +5, "arr": [1, 2,], inf: Infinity, nested: { a: 1, }, }`, true, notes);
    expect(plainJson(v)).toEqual({ unquoted: "single", hex: 255, plus: 5, arr: [1, 2], inf: null, nested: { a: 1 } });
    expect(notes.toString()).toContain("Infinity");
    expect(() => parseJson("{a:1}", false, new Notes())).toThrow(ConvError);
    expect(() => parseJson("[1,]", false, new Notes())).toThrow(ConvError);
  });

  test("duplicate keys keep the last value and say so; __proto__ is only a key", () => {
    const notes = new Notes();
    const v = parseJson('{"a":1,"a":2,"__proto__":{"polluted":true}}', false, notes) as Record<string, unknown>;
    expect(v.a).toBe(2);
    expect(notes.toString()).toContain('"a" appears more than once');
    expect(Object.keys(v)).toEqual(["a", "__proto__"]);
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
  });

  test("errors say what and where, in plain words", () => {
    expect(errorOf(() => parseJson('{\n  "a": 1,\n  "b": oops\n}', false, new Notes()))).toMatch(/line 3, column 8/);
    expect(errorOf(() => parseJson("", false, new Notes()))).toContain("empty");
    expect(errorOf(() => parseJson('{"a":1} extra', false, new Notes()))).toContain("more text after the data");
    expect(errorOf(() => parseJson('"unterminated', false, new Notes()))).toContain("never closed");
    expect(errorOf(() => parseJson("[".repeat(300), false, new Notes()))).toContain("200 levels");
  });

  test("minified, pretty and sorted output", () => {
    const v = parseJson('{"b":[1,{"d":1,"c":2}],"a":{}}', false, new Notes());
    expect(writeJson(v, 0, new Notes())).toBe('{"b":[1,{"d":1,"c":2}],"a":{}}\n');
    expect(writeJson(v, 4, new Notes())).toContain('\n    "b": [\n        1,');
    const sorted = conv("json", "json", '{"b":1,"a":{"z":1,"y":2}}', { sortKeys: true }).text;
    expect(sorted.indexOf('"a"')).toBeLessThan(sorted.indexOf('"b"'));
    expect(sorted.indexOf('"y"')).toBeLessThan(sorted.indexOf('"z"'));
  });
});

describe("JSON, YAML and TOML round trips", () => {
  const roundTrip = (via: DataFormat, value: unknown) => {
    const json = JSON.stringify(value);
    const there = conv("json", via, json).text;
    return plainJson(parse("json", conv(via, "json", there).text));
  };

  test("a nested document survives YAML and TOML", () => {
    expect(roundTrip("yaml", SAMPLE)).toEqual(SAMPLE);
    const { nothing, ...noNull } = SAMPLE;
    expect(roundTrip("toml", noNull)).toEqual(noNull);
  });

  test("YAML quoting keeps strings that look like other things as strings", () => {
    const tricky = { a: "true", b: "null", c: "123", d: "1.5", e: "yes", f: "", g: " lead", h: "x: y", i: "# not a comment", j: "multi\nline", k: "- dash", l: "007", m: "2024-01-01", n: "~", o: "on" };
    expect(roundTrip("yaml", tricky)).toEqual(tricky);
  });

  test("YAML lists of lists and of objects, and empty containers", () => {
    const v = { list: [[1, 2], [3, [4, 5]], { a: 1, b: { c: [] } }, {}], empty: {}, none: [] };
    expect(roundTrip("yaml", v)).toEqual(v);
  });

  test("TOML: arrays of tables, dotted structure, odd keys; null and over-64-bit numbers are reported", () => {
    const v = { servers: [{ host: "a", port: 1 }, { host: "b", port: 2 }], "odd key": { "x.y": 1 }, pi: 3.14, list: [1, 2, 3] };
    expect(roundTrip("toml", v)).toEqual(v);
    const r = conv("json", "toml", '{"a":null,"big":12345678901234567890,"b":1}');
    expect(r.notes).toContain("TOML has no null");
    expect(r.notes).toContain("too big for TOML");
    expect(conv("json", "toml", "[1,2]").notes).toContain('under the name "data"');
  });

  test("bad YAML and TOML give plain errors", () => {
    expect(errorOf(() => parse("yaml", "a: [1, 2"))).toContain("isn't valid YAML");
    expect(errorOf(() => parse("toml", "a = "))).toContain("isn't valid TOML");
    expect(errorOf(() => parse("yaml", "   \n"))).toContain("empty");
  });
});

describe("CSV and TSV", () => {
  test("quotes, commas, newlines and unicode inside fields", () => {
    const rows = [{ name: 'He said "hi"', note: "a,b\nsecond line", emoji: "🙂 ü", empty: "" }, { name: " padded ", note: "x", emoji: "é", empty: "" }];
    const csv = conv("json", "csv", JSON.stringify(rows)).text;
    expect(csv).toContain('"He said ""hi"""');
    expect(csv).toContain('"a,b\nsecond line"');
    expect(plainJson(parse("csv", csv, { types: false }))).toEqual(rows);
  });

  test("CRLF files, a BOM, a missing final newline, blank lines and ragged rows", () => {
    const text = "\ufeffa,b\r\n1,2\r\n\r\n3\r\n4,5,6";
    const v = plainJson(parse("csv", text));
    expect(v).toEqual([{ a: 1, b: 2 }, { a: 3, b: "" }, { a: 4, b: 5 }]);
  });

  test("the separator is found: semicolon, tab, pipe", () => {
    for (const d of [";", "\t", "|"]) expect(plainJson(parse("csv", `a${d}b\n1${d}2`))).toEqual([{ a: 1, b: 2 }]);
    expect(plainJson(parse("csv", 'a;b\n"x;y";2'))).toEqual([{ a: "x;y", b: 2 }]);
  });

  test("numbers become numbers only when nothing is lost", () => {
    const v = plainJson(parse("csv", "a,b,c,d,e,f\n007,1.50,12345678901234567890,1e3,-5,true"));
    expect(v).toEqual([{ a: "007", b: "1.50", c: "12345678901234567890", d: "1e3", e: -5, f: true }]);
    expect(inferScalar("0.1")).toBe(0.1);
    expect(inferScalar("1.0")).toBe("1.0");
    expect(plainJson(parse("csv", "a\n5", { types: false }))).toEqual([{ a: "5" }]);
  });

  test("no header row, duplicate and empty column names", () => {
    expect(plainJson(parse("csv", "1,2\n3,4", { header: false }))).toEqual([[1, 2], [3, 4]]);
    expect(plainJson(parse("csv", "a,a,\n1,2,3"))).toEqual([{ a: 1, a_2: 2, column3: 3 }]);
  });

  test("an unclosed quote is a plain error, an empty file too", () => {
    expect(errorOf(() => parse("csv", 'a,b\n"oops,2'))).toContain("never ends");
    expect(errorOf(() => parse("csv", ""))).toContain("empty");
  });

  test("nested JSON flattens to dotted columns with a warning; turning it off keeps JSON text; unflatten rebuilds", () => {
    const flat = conv("json", "csv", JSON.stringify([SAMPLE]));
    expect(flat.text.split("\n")[0]).toBe("name,count,ratio,ok,nothing,tags.0,tags.1,address.city,address.zip");
    expect(flat.notes).toContain("flattened");
    const kept = conv("json", "csv", JSON.stringify([SAMPLE]), { flatten: false });
    expect(kept.text).toContain('"[""a"",""b,c""]"');
    expect(kept.notes).toContain("text inside one cell");
    const back = plainJson(parse("csv", flat.text, { unflatten: true, types: true }));
    expect(back[0].address).toEqual({ city: "Köln", zip: "00123" });
    expect(back[0].tags).toEqual(["a", "b,c"]);
    expect(unflatten(flatten({ a: { b: [1, { c: 2 }] } }))).toEqual({ a: { b: [1, { c: 2 }] } });
  });

  test("records with different keys share the union of columns; lists of lists; single values", () => {
    expect(conv("json", "csv", '[{"a":1},{"b":2},{"a":3,"b":4}]').text).toBe("a,b\n1,\n,2\n3,4\n");
    expect(conv("json", "csv", "[[1,2],[3]]").text).toBe("1,2\n3,\n");
    expect(conv("json", "csv", "[1,2]").text).toBe("value\n1\n2\n");
    expect(errorOf(() => conv("json", "csv", "[]"))).toContain("empty");
  });

  test("TSV, a chosen separator and the Excel mark", () => {
    expect(conv("json", "tsv", '[{"a":"x\\ty","b":1}]').text).toBe('a\tb\n"x\ty"\t1\n');
    expect(conv("json", "csv", '[{"a":"x;y","b":1}]', { delimiter: ";" }).text).toBe('a;b\n"x;y";1\n');
    expect(conv("json", "csv", '[{"a":"é"}]', { bom: true }).text.charCodeAt(0)).toBe(0xfeff);
  });

  test("huge counts of rows are fine", () => {
    const n = 20000;
    const csv = `id,v\n${Array.from({ length: n }, (_, i) => `${i},"row ${i}"`).join("\n")}\n`;
    const json = plainJson(parse("csv", csv));
    expect(json.length).toBe(n);
    expect(json[n - 1]).toEqual({ id: n - 1, v: `row ${n - 1}` });
  });
});

describe("XML and plist", () => {
  test("elements, attributes, repeated children, text, CDATA, comments, entities", () => {
    const xml = `<?xml version="1.0"?><!-- c --><lib name="A &amp; B"><book id="1"><t>Tom &lt;3</t></book><book id="2"><t><![CDATA[x < y]]></t></book><note/></lib>`;
    const v = plainJson(parse("xml", xml));
    expect(v).toEqual({ lib: { "@name": "A & B", book: [{ "@id": "1", t: "Tom <3" }, { "@id": "2", t: "x < y" }], note: "" } });
  });

  test("JSON to XML and back keeps the data; names that XML can't use are fixed with a note", () => {
    const r = conv("json", "xml", '{"people":{"person":[{"@id":"1","name":"Ann"},{"@id":"2","name":"Bob"}]}}');
    expect(r.text).toContain('<person id="1">');
    expect(plainJson(parse("xml", r.text))).toEqual({ people: { person: [{ "@id": "1", name: "Ann" }, { "@id": "2", name: "Bob" }] } });
    const odd = conv("json", "xml", '{"first name":"x","1st":"y","a&b":"<z>"}');
    expect(odd.notes).toContain("changed");
    expect(odd.text).toContain("<first_name>x</first_name>");
    expect(odd.text).toContain("&lt;z&gt;");
    expect(conv("json", "xml", "[1,2]").text).toContain("<root>\n  <item>1</item>");
  });

  test("a DOCTYPE with entities is never expanded, and broken XML is a plain error", () => {
    const hostile = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><x>&xxe;</x>`;
    expect(plainJson(parse("xml", hostile))).toEqual({ x: "&xxe;" });
    expect(errorOf(() => parse("xml", "<a><b></a>"))).toContain("closed by");
    expect(errorOf(() => parse("xml", "<a>"))).toContain("never closed");
    expect(errorOf(() => parse("xml", "<a/><b/>"))).toContain("more content");
    expect(errorOf(() => parse("xml", "<a x=1/>"))).toContain("quotes");
    expect(errorOf(() => parse("xml", ""))).toContain("empty");
  });

  test("property lists both ways, and a binary plist is explained", () => {
    const v = { name: "App", n: 3, pi: 1.5, on: true, list: ["a", 2], nested: { k: "v" } };
    const plist = conv("json", "plist", JSON.stringify(v)).text;
    expect(plist).toContain("<key>pi</key>\n\t<real>1.5</real>");
    expect(plainJson(parse("plist", plist))).toEqual(v);
    expect(errorOf(() => parse("plist", "bplist00\u0000\u0001"))).toContain("binary property list");
    expect(errorOf(() => parse("plist", "<a/>"))).toContain("isn't a property list");
  });
});

describe("INI, .env and .properties", () => {
  test("INI sections, comments, arrays, quotes and types", () => {
    const ini = `; c\ntop = 1\n[db]\nhost = "my host"\nport: 5432\ntags[] = a\ntags[] = b\n# other\n[db.pool]\nsize = 5`;
    expect(plainJson(parse("ini", ini))).toEqual({ top: 1, db: { host: "my host", port: 5432, tags: ["a", "b"] }, "db.pool": { size: 5 } });
    expect(plainJson(parse("ini", ini, { unflatten: true })).db.pool).toEqual({ size: 5 });
    expect(errorOf(() => parse("ini", "not a setting"))).toContain("isn't a setting");
    const written = conv("json", "ini", '{"a":1,"s":{"x":"y z","l":[1,2],"deep":{"k":1}}}');
    expect(written.text).toContain("[s]");
    expect(written.text).toContain("l[] = 1");
    expect(written.notes).toContain("flattened");
    expect(errorOf(() => conv("json", "ini", "[1]"))).toContain("named settings");
  });

  test(".env: export, quotes, escapes, multi-line values, comments", () => {
    const env = `# c\nexport A=1\nB="two words\\nnew"\nC='sin $gle'\nD=plain # trailing\nE="multi\nline"\nF=`;
    expect(plainJson(parse("env", env, { types: false }))).toEqual({ A: "1", B: "two words\nnew", C: "sin $gle", D: "plain", E: "multi\nline", F: "" });
    const out = conv("json", "env", '{"db":{"host":"x y","port":5},"q":"it\'s","n":"a\\nb"}');
    expect(out.text).toContain("db_host='x y'");
    expect(out.text).toContain('q="it\'s"');
    expect(plainJson(parse("env", out.text, { types: false }))).toEqual({ db_host: "x y", db_port: "5", q: "it's", n: "a\nb" });
    expect(errorOf(() => parse("env", "1BAD=2"))).toContain("isn't a setting");
  });

  test(".properties: continuation lines, escapes, separators, unicode both ways", () => {
    const props = "# c\n! c2\nkey1 = v1\nkey2:v2\nkey3 v3\nlong = a \\\n   b\nuni = caf\\u00e9\\n\nesc\\ key = x\\=y";
    expect(plainJson(parse("properties", props, { types: false }))).toEqual({ key1: "v1", key2: "v2", key3: "v3", long: "a b", uni: "café\n", "esc key": "x=y" });
    const out = conv("json", "properties", '{"name":"Zoë","a":{"b":"x y"},"sp":" lead"}').text;
    expect(out).toContain("name=Zo\\u00eb");
    expect(out).toContain("sp=\\ lead");
    expect(plainJson(parse("properties", out, { types: false }))).toEqual({ name: "Zoë", "a.b": "x y", sp: " lead" });
    expect(plainJson(parse("properties", out, { types: false, unflatten: true })).a).toEqual({ b: "x y" });
  });
});

describe("Markdown tables, HTML tables and SQL", () => {
  test("Markdown table both ways, with pipes, newlines and alignment", () => {
    const md = conv("json", "markdown", JSON.stringify([{ a: "x|y", b: "l1\nl2", c: 5 }])).text;
    expect(md).toContain("x\\|y");
    expect(md).toContain("l1<br>l2");
    expect(plainJson(parse("markdown", md))).toEqual([{ a: "x|y", b: "l1\nl2", c: 5 }]);
    expect(plainJson(parse("markdown", "text\n\n| h1 | h2 |\n|:---|---:|\n| a | b |\n\nmore"))).toEqual([{ h1: "a", h2: "b" }]);
    expect(errorOf(() => parse("markdown", "no table here"))).toContain("No table was found");
  });

  test("HTML tables: tags and entities in cells, th headers, escaping when writing", () => {
    const html = `<TABLE><tr><th>Name</th><th>Qty</th></tr><tr><td><b>A</b> &amp; B</td><td>3</td></tr></TABLE><table><tr><td>ignored</td></tr></table>`;
    const r = new Notes();
    expect(plainJson(parseData("html", html, O, r))).toEqual([{ Name: "A & B", Qty: 3 }]);
    expect(r.toString()).toContain("more than one table");
    const out = conv("json", "html", '[{"x":"<script>alert(1)</script>"}]').text;
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(errorOf(() => parse("html", "<p>none</p>"))).toContain("No table");
  });

  test("SQL INSERT statements are valid and escape quotes; both dialects; reading them back", () => {
    const data = [{ id: 1, name: "O'Brien", note: "back\\slash", ok: true, none: null, big: "12345678901234567890" }];
    const ansi = conv("json", "sql", JSON.stringify(data), { tableName: "people", createTable: true });
    expect(ansi.text).toContain('CREATE TABLE "people"');
    expect(ansi.text).toContain("'O''Brien'");
    const mysql = conv("json", "sql", JSON.stringify(data), { dialect: "mysql" }).text;
    expect(mysql).toContain("`name`");
    expect(mysql).toContain("'back\\\\slash'");
    const ms = conv("json", "sql", JSON.stringify(data), { dialect: "sqlserver" }).text;
    expect(ms).toContain("[name]");
    expect(ms).toContain("N'O''Brien'");
    expect(plainJson(parse("sql", ansi.text))).toEqual([{ id: 1, name: "O'Brien", note: "back\\slash", ok: true, none: null, big: "12345678901234567890" }]);
    const manyRows = conv("json", "sql", JSON.stringify(Array.from({ length: 250 }, (_, i) => ({ i })))).text;
    expect(manyRows.match(/INSERT INTO/g)!.length).toBe(3);
    expect(plainJson(parse("sql", "-- c\nCREATE TABLE t (a int);\nINSERT INTO t (a, b) VALUES (1, 'x;y'), (2, NULL);\nINSERT INTO u VALUES (3);")).t).toEqual([{ a: 1, b: "x;y" }, { a: 2, b: null }]);
    expect(errorOf(() => parse("sql", "SELECT 1;"))).toContain("No INSERT");
  });
});

describe("encodings", () => {
  test("the encoding is found from a mark, from valid UTF-8, or falls back to Windows-1252 and says so", () => {
    expect(detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x41])).id).toBe("utf-8-bom");
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x41, 0x00])).id).toBe("utf-16le");
    expect(detectEncoding(Buffer.from([0xfe, 0xff, 0x00, 0x41])).id).toBe("utf-16be");
    expect(detectEncoding(Buffer.from("héllo wörld", "utf8")).id).toBe("utf-8");
    expect(detectEncoding(Buffer.from([0x63, 0x61, 0x66, 0xe9])).how).toContain("assumed to be Windows-1252");
    expect(detectEncoding(Buffer.from("a\u0000b\u0000c\u0000d\u0000e\u0000", "latin1")).id).toBe("utf-16le");
  });

  const TEXT = "Ünïcödé € — ok";
  test("every writable Unicode and single-byte encoding round trips", () => {
    for (const enc of ["utf-8", "utf-8-bom", "utf-16le", "utf-16be"]) {
      const bytes = encodeText(TEXT, enc, false).bytes;
      expect(decodeBytes(bytes, "auto", false).text, enc).toBe(TEXT);
      expect(decodeBytes(bytes, enc.startsWith("utf-8") ? "utf-8" : enc, false).text.replace(/^\ufeff/, ""), enc).toBe(TEXT);
    }
    expect(decodeBytes(encodeText("café €", "windows-1252", false).bytes, "windows-1252", false).text).toBe("café €");
    expect(encodeText("é", "iso-8859-1", false).bytes).toEqual(Buffer.from([0xe9]));
    expect(decodeBytes(encodeText("Привет", "windows-1251", false).bytes, "windows-1251", false).text).toBe("Привет");
    expect(decodeBytes(encodeText("Привет", "koi8-r", false).bytes, "koi8-r", false).text).toBe("Привет");
  });

  test("Shift_JIS, EUC-JP, GBK, Big5 and EUC-KR round trip real text", () => {
    const samples: Array<[string, string]> = [["shift_jis", "こんにちは世界ｱｲｳ"], ["euc-jp", "日本語のテキスト"], ["gbk", "你好，世界"], ["big5", "你好，世界"], ["euc-kr", "안녕하세요 세계"]];
    for (const [enc, text] of samples) {
      const e = encodeText(text, enc, false);
      expect(e.unmappable, enc).toBe(0);
      expect(decodeBytes(e.bytes, enc, false).text, enc).toBe(text);
    }
    expect([...encodeText("こんにちは", "shift_jis", false).bytes].slice(0, 2)).toEqual([0x82, 0xb1]);
    expect(encodeText("A1", "shift_jis", false).bytes.toString()).toBe("A1");
  });

  test("bytes that can't be read are reported with their place; replacing is a choice", () => {
    const bad = Buffer.from([0x68, 0x69, 0xff, 0xfe, 0x21]);
    expect(errorOf(() => decodeBytes(bad, "utf-8", false))).toMatch(/can't be read.*byte 3/);
    const lenient = decodeBytes(bad, "utf-8", true);
    expect(lenient.bad).toBeGreaterThan(0);
    expect(lenient.firstBad).toBe(2);
    expect(lenient.text.startsWith("hi")).toBe(true);
  });

  test("characters the target encoding doesn't have are an error, or become ?", () => {
    expect(errorOf(() => encodeText("日本", "windows-1252", false))).toContain("can't be written in Windows-1252");
    const r = encodeText("a日b", "windows-1252", true);
    expect(r.bytes.toString("latin1")).toBe("a?b");
    expect(r.unmappable).toBe(1);
    expect(errorOf(() => encodeText("x", "gb18030", false))).toContain("can't be written");
  });
});

describe("line endings, tabs and spaces, BOM", () => {
  test("LF, CRLF and CR in any mix, for UTF-8, Latin-1 bytes and UTF-16", () => {
    const mixed = Buffer.from("a\r\nb\nc\rd");
    expect(convertLineEndings(mixed, "lf").toString()).toBe("a\nb\nc\nd");
    expect(convertLineEndings(mixed, "crlf").toString()).toBe("a\r\nb\r\nc\r\nd");
    expect(convertLineEndings(mixed, "cr").toString()).toBe("a\rb\rc\rd");
    const latin = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0d, 0x0a, 0xff]);
    expect([...convertLineEndings(latin, "lf")]).toEqual([0x63, 0x61, 0x66, 0xe9, 0x0a, 0xff]);
    const u16 = encodeText("é\nü", "utf-16le", false).bytes;
    expect(decodeBytes(convertLineEndings(u16, "crlf"), "utf-16le", false).text).toBe("é\r\nü");
    expect(convertLineEndings(Buffer.from("\ufeffx\ny"), "crlf").toString().startsWith("\ufeff")).toBe(true);
  });

  test("tabs and spaces use tab stops and leave other text alone", () => {
    expect(tabsToSpaces(Buffer.from("a\tb\n\tc\t\td"), 4).toString()).toBe("a   b\n    c       d");
    expect(spacesToTabs(Buffer.from("        x\n    y\n  z  w\n\t  v"), 4).toString()).toBe("\t\tx\n\ty\n  z  w\n\t  v");
    expect(tabsToSpaces(Buffer.from("é\tx"), 4).toString()).toBe("é   x");
  });

  test("trailing spaces and the BOM", () => {
    expect(stripTrailingSpaces(Buffer.from("a  \nb\t\r\nc \n \nd")).toString()).toBe("a\nb\r\nc\n\nd");
    expect(stripUtf8Bom(Buffer.from([0xef, 0xbb, 0xbf, 0x41])).toString()).toBe("A");
    expect(stripUtf8Bom(Buffer.from("A")).toString()).toBe("A");
    expect(() => stripUtf8Bom(Buffer.from([0xff, 0xfe, 0x41, 0]))).toThrow(ConvError);
  });
});

describe("Base64 and hex", () => {
  test("any bytes survive both ways, wrapped or not", () => {
    const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => (i * 37) & 0xff));
    for (const wrap of [0, 64, 76]) expect(decodeBase64(encodeBase64(bytes, wrap)).equals(bytes), String(wrap)).toBe(true);
    for (const [spaced, upper] of [[true, false], [false, true], [true, true]] as const) expect(decodeHex(encodeHex(bytes, spaced, upper)).equals(bytes)).toBe(true);
    expect(encodeBase64(Buffer.alloc(100), 76).split("\n")[0]!.length).toBe(76);
  });

  test("lenient readers: data: links, URL-safe letters, missing padding, 0x and commas", () => {
    expect(decodeBase64("data:text/plain;base64,aGk=").toString()).toBe("hi");
    expect(decodeBase64("-_-_").equals(Buffer.from("fbffbf", "hex"))).toBe(true);
    expect(decodeBase64("aGk").toString()).toBe("hi");
    expect(decodeHex("0x68, 0x69:21").toString()).toBe("hi!");
  });

  test("bad text is explained", () => {
    expect(errorOf(() => decodeBase64("ab$d"))).toContain('"$"');
    expect(errorOf(() => decodeBase64("a"))).toContain("damaged");
    expect(errorOf(() => decodeHex("abc"))).toContain("odd number");
    expect(errorOf(() => decodeHex("zz"))).toContain('"z"');
    expect(errorOf(() => decodeHex("  "))).toContain("empty");
  });

  test("a file type is guessed from the first bytes", () => {
    expect(sniffExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]))).toBe("png");
    expect(sniffExtension(Buffer.from("%PDF-1.4"))).toBe("pdf");
    expect(sniffExtension(Buffer.from("hello text"))).toBe("txt");
    expect(sniffExtension(Buffer.from([0, 1, 2, 3, 200]))).toBe("bin");
    expect(sniffExtension(Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBP")]))).toBe("webp");
  });
});

describe("the Markdown renderer", () => {
  const html = (md: string) => markdownToHtml(md, "t").fragment;

  test("headings, emphasis, code, lists, quotes, rules, tables and links", () => {
    const out = html("# Title\n\nSome *em* and **strong** and `co<de>` and ~~gone~~.\n\n- one\n- two\n  - nested\n\n1. a\n2. b\n\n> quote\n\n---\n\n| h | i |\n|---|--:|\n| 1 | 2 |\n\n```js\nlet a = '<b>';\n```\n\n[link](https://example.com \"t\") and ![pic](https://x.test/a.png)");
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<em>em</em>");
    expect(out).toContain("<strong>strong</strong>");
    expect(out).toContain("<code>co&lt;de&gt;</code>");
    expect(out).toContain("<del>gone</del>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<ol>");
    expect(out).toContain("<blockquote>");
    expect(out).toContain("<hr>");
    expect(out).toContain('<th style="text-align:right">i</th>');
    expect(out).toContain(`<pre><code class="language-js">let a = '&lt;b&gt;';</code></pre>`);
  });

  test("everything that could run code is made harmless", () => {
    const attacks = [
      "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "[x](javascript:alert(1))", "[x](JaVaScRiPt:alert(1))", "[x]( java\nscript:alert(1))", "![x](javascript:alert(1))", "[x](data:text/html;base64,PHNjcmlwdD4=)",
      "[x](vbscript:msgbox)", "<a href=\"javascript:alert(1)\">x</a>", "<iframe src=//evil></iframe>", "**<b onmouseover=alert(1)>x</b>**", "`</code><script>`", "[a](https://ok.example)\"onclick=\"alert(1)", "<!-- c --><svg onload=alert(1)>",
    ];
    for (const a of attacks) {
      const out = html(a);
      // Only the tags the renderer makes itself may appear; anything the writer typed is shown as inert text.
      const tags = [...out.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1]!.toLowerCase());
      expect(tags.every((t) => ["p", "a", "em", "strong", "code", "pre", "img", "br", "h1", "h2", "ul", "ol", "li", "blockquote", "hr", "del"].includes(t)), a).toBe(true);
      expect(out, a).not.toMatch(/(?:href|src)="(?:javascript|vbscript|data:text)|<img[^>]*\son\w+=|<a[^>]*\son\w+=/i);
    }
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("relative/path.html")).toBe("relative/path.html");
    expect(safeUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:image/png;base64,AAAA", true)).not.toBeNull();
    expect(safeUrl("data:image/svg+xml;base64,AAAA", true)).toBeNull();
    expect(html("[x](https://ok.example)")).toContain('rel="noopener noreferrer"');
  });

  test("the whole page names itself, declares UTF-8 and forbids scripts", () => {
    const page = markdownToHtml("# Héllo\n\nbody", "fallback").html;
    expect(page).toContain("<title>Héllo</title>");
    expect(page).toContain('<meta charset="utf-8">');
    expect(page).toContain("default-src 'none'");
    expect(page).not.toContain("<script");
  });

  test("a web page becomes plain text", () => {
    const text = htmlToText("<html><head><title>x</title><style>p{}</style></head><body><h1>Hi &amp; bye</h1><p>One<br>two</p><ul><li>a</li><li>b</li></ul><script>alert(1)</script><pre>  keep\n  this</pre></body></html>");
    expect(text).toContain("Hi & bye");
    expect(text).toContain("- a\n- b");
    expect(text).toContain("  keep\n  this");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("p{}");
    expect(errorOf(() => htmlToText("<p> </p>"))).toContain("no text");
  });
});

describe("spreadsheets", () => {
  test("XLSX written here is read back: text, numbers, booleans, unicode, quotes, several sheets", async () => {
    const notes = new Notes();
    const buf = writeXlsx([
      { name: "People", columns: ["name", "age", "ok"], rows: [["Zoë \"Q\" <&>", 31, true], ["line\nbreak", 2.5, false], [" padded ", -1e10, null]] },
      { name: "Second", columns: null, rows: [["a", 1], ["b", 2]] },
    ], notes);
    const f = join(dir("xlsx"), "t.xlsx");
    writeFileSync(f, buf);
    const sheets = await readXlsx(f);
    expect(sheets.map((s) => s.name)).toEqual(["People", "Second"]);
    expect(sheets[0]!.rows).toEqual([["name", "age", "ok"], ["Zoë \"Q\" <&>", 31, true], ["line\nbreak", 2.5, false], [" padded ", -1e10, null]]);
    expect(sheets[1]!.rows).toEqual([["a", 1], ["b", 2]]);
    expect(plainJson(sheetValue(sheets[0]!, true))).toEqual([{ name: "Zoë \"Q\" <&>", age: 31, ok: true }, { name: "line\nbreak", age: 2.5, ok: false }, { name: " padded ", age: -1e10, ok: "" }]);
  });

  test("dates, shared and inline strings, repeated cells, and a date1904 workbook", async () => {
    const wb = (extra = "") => `<workbook xmlns="x" xmlns:r="r"><workbookPr${extra}/><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const rels = '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>';
    const styles = '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd hh:mm"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>';
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"><v>45292</v></c><c r="C1" s="2"><v>45292.5</v></c><c r="D1" t="inlineStr"><is><t>inline</t></is></c></row><row r="3"><c r="B3"><v>7</v></c><c r="A3" t="e"><v>#DIV/0!</v></c></row></sheetData></worksheet>';
    const make = (extra: string) => zipBuffer([
      { name: "[Content_Types].xml", data: Buffer.from("<Types/>") }, { name: "xl/workbook.xml", data: Buffer.from(wb(extra)) }, { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(rels) },
      { name: "xl/styles.xml", data: Buffer.from(styles) }, { name: "xl/sharedStrings.xml", data: Buffer.from('<sst><si><t>shared &amp; text</t></si></sst>') }, { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheet) },
    ]);
    const d = dir("xlsx2");
    writeFileSync(join(d, "a.xlsx"), make(""));
    const [s] = await readXlsx(join(d, "a.xlsx"));
    expect(s!.rows[0]).toEqual(["shared & text", "2024-01-01", "2024-01-01T12:00:00", "inline"]);
    expect(s!.rows[1]).toEqual([null, null, null, null]);
    expect(s!.rows[2]).toEqual(["#DIV/0!", 7, null, null]);
    writeFileSync(join(d, "b.xlsx"), make(' date1904="1"'));
    expect((await readXlsx(join(d, "b.xlsx")))[0]!.rows[0]![1]).toBe("2028-01-02");
  });

  test("ODS: floats, text with spaces and tabs, booleans, dates, repeated columns and several sheets", async () => {
    const content = `<office:document-content><office:body><office:spreadsheet>
      <table:table table:name="One"><table:table-row><table:table-cell office:value-type="string"><text:p>Hello<text:s text:c="2"/>there</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="3.5" table:number-columns-repeated="2"/><table:table-cell office:value-type="boolean" office:boolean-value="true"/></table:table-row>
      <table:table-row table:number-rows-repeated="2"><table:table-cell/></table:table-row>
      <table:table-row><table:table-cell office:value-type="date" office:date-value="2024-05-06"/><table:table-cell office:value-type="string"><text:p>a &amp; b</text:p><text:p>second</text:p></table:table-cell></table:table-row></table:table>
      <table:table table:name="Two"><table:table-row><table:table-cell office:value-type="float" office:value="1"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`;
    const f = join(dir("ods"), "t.ods");
    writeFileSync(f, zipBuffer([{ name: "mimetype", data: Buffer.from("application/vnd.oasis.opendocument.spreadsheet") }, { name: "content.xml", data: Buffer.from(content) }]));
    const sheets = await readOds(f);
    expect(sheets.map((s) => s.name)).toEqual(["One", "Two"]);
    expect(sheets[0]!.rows).toEqual([["Hello  there", 3.5, 3.5, true], [null, null, null, null], [null, null, null, null], ["2024-05-06", "a & b\nsecond", null, null]]);
    expect(sheets[1]!.rows).toEqual([[1]]);
  });

  test("a file that is not a spreadsheet is a plain error", async () => {
    const f = join(dir("bad"), "x.xlsx");
    writeFileSync(f, "not a zip at all");
    await expect(readXlsx(f)).rejects.toThrow(/isn't a valid .xlsx/);
    const z = join(dir("bad2"), "y.xlsx");
    writeFileSync(z, zipBuffer([{ name: "hello.txt", data: Buffer.from("x") }]));
    await expect(readXlsx(z)).rejects.toThrow(/valid spreadsheet/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Archives
// ---------------------------------------------------------------------------------------------------------------

const job = (kind: string, input: string[], output: string, extra: Partial<BuiltinJob> = {}): BuiltinJob => ({ kind, inputs: input, output, opts: {}, params: {}, platform: process.platform === "win32" ? "win32" : "linux", home: root, ...extra });

function tree(base: string, rel = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(base, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(join(base, r)).isDirectory()) out.push(`${r}/`, ...tree(base, r));
    else out.push(r);
  }
  return out;
}

function sample(): string {
  const d = dir("sample");
  mkdirSync(join(d, "proj", "sub", "deep"), { recursive: true });
  writeFileSync(join(d, "proj", "a.txt"), "alpha");
  writeFileSync(join(d, "proj", "sub", "b ü.txt"), "beta ü");
  writeFileSync(join(d, "proj", "sub", "deep", "empty.bin"), "");
  writeFileSync(join(d, "proj", "big.dat"), Buffer.alloc(300_000, 7));
  return join(d, "proj");
}

/** A tar.gz made by hand, so entries with hostile names can exist. */
function handTar(entries: Array<{ name: string; data?: string; type?: string; link?: string }>): Buffer {
  const blocks: Buffer[] = [];
  for (const e of entries) {
    const body = Buffer.from(e.data ?? "");
    const h = Buffer.alloc(512);
    h.write(e.name, 0, 100);
    h.write("0000644\0", 100);
    h.write("0000000\0", 108);
    h.write("0000000\0", 116);
    h.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124);
    h.write("00000000000\0", 136);
    h.write(e.type ?? "0", 156);
    if (e.link) h.write(e.link, 157);
    h.write("ustar\0", 257);
    h.write("00", 263);
    h.fill(0x20, 148, 156);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(h, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

describe("zip and tar.gz", () => {
  test("a folder is zipped and unzipped with the same names, contents and empty folders", async () => {
    const src = sample();
    const zip = join(dir("out"), "proj.zip");
    const note = await runBuiltin(job("zip-create", [src], zip));
    expect(note).toContain("Zipped: 4 files");
    const dest = dir("extract");
    await runBuiltin(job("zip-extract", [zip], dest));
    expect(tree(dest)).toEqual(tree(join(src, "..")));
    expect(readFileSync(join(dest, "proj", "sub", "b ü.txt"), "utf8")).toBe("beta ü");
    expect(readFileSync(join(dest, "proj", "big.dat")).equals(readFileSync(join(src, "big.dat")))).toBe(true);
  });

  test("tar.gz is packed and unpacked the same way, including long names", async () => {
    const src = sample();
    const long = join(src, "x".repeat(90), "y".repeat(90));
    mkdirSync(long, { recursive: true });
    writeFileSync(join(long, "z".repeat(60) + ".txt"), "long");
    const tgz = join(dir("out"), "proj.tar.gz");
    await runBuiltin(job("targz-create", [src], tgz));
    const dest = dir("extract");
    await runBuiltin(job("targz-extract", [tgz], dest));
    expect(tree(dest)).toEqual(tree(join(src, "..")));
    expect(readFileSync(join(dest, "proj", "x".repeat(90), "y".repeat(90), "z".repeat(60) + ".txt"), "utf8")).toBe("long");
    // the system's own tar agrees that this is a good archive
    const sys = Bun.spawnSync(["tar", "-tzf", tgz]);
    if (sys.exitCode === 0) expect(sys.stdout.toString()).toContain("proj/a.txt");
  });

  test("zip to tar.gz and back, without unpacking, keeps everything", async () => {
    const src = sample();
    const zip = join(dir("out"), "p.zip");
    await runBuiltin(job("zip-create", [src], zip));
    const tgz = join(dir("out"), "p.tar.gz");
    expect(await runBuiltin(job("zip-to-targz", [zip], tgz))).toContain("Converted: 4 files");
    const back = join(dir("out"), "back.zip");
    await runBuiltin(job("targz-to-zip", [tgz], back));
    const d1 = dir("e1");
    const d2 = dir("e2");
    await runBuiltin(job("targz-extract", [tgz], d1));
    await runBuiltin(job("zip-extract", [back], d2));
    expect(tree(d1)).toEqual(tree(d2));
    expect(readFileSync(join(d2, "proj", "a.txt"), "utf8")).toBe("alpha");
  });

  test("gzip, gunzip, brotli and unbrotli", async () => {
    const d = dir("gz");
    const f = join(d, "data.txt");
    writeFileSync(f, "repeat ".repeat(10000));
    for (const [pack, unpack, ext] of [["gzip", "gunzip", "gz"], ["brotli", "unbrotli", "br"]] as const) {
      await runBuiltin(job(pack, [f], join(d, `data.txt.${ext}`)));
      expect(statSync(join(d, `data.txt.${ext}`)).size).toBeLessThan(2000);
      await runBuiltin(job(unpack, [join(d, `data.txt.${ext}`)], join(d, `back.${ext}.txt`)));
      expect(readFileSync(join(d, `back.${ext}.txt`), "utf8")).toBe("repeat ".repeat(10000));
    }
    writeFileSync(join(d, "junk.gz"), "this is not gzip");
    await expect(runBuiltin(job("gunzip", [join(d, "junk.gz")], join(d, "junk.out")))).rejects.toThrow(/damaged|isn't the kind/);
    expect(existsSync(join(d, "junk.out"))).toBe(false);
  });

  test("never overwrites: an output that exists is an error and the file is left alone", async () => {
    const d = dir("exists");
    writeFileSync(join(d, "a.txt"), "x");
    writeFileSync(join(d, "a.zip"), "precious");
    await expect(runBuiltin(job("zip-create", [join(d, "a.txt")], join(d, "a.zip")))).rejects.toThrow();
    expect(readFileSync(join(d, "a.zip"), "utf8")).toBe("precious");
  });
});

describe("hostile archives", () => {
  const zipWith = async (entries: Array<{ name: string; data: string; mode?: number }>) => {
    const f = join(dir("hostile"), "evil.zip");
    const w = await ZipFileWriter.create(f);
    for (const e of entries) await w.add(e.name, Buffer.from(e.data), new Date(), e.mode);
    await w.finish();
    return f;
  };

  test("zip-slip names are skipped: nothing is written outside the folder", async () => {
    const f = await zipWith([{ name: "../evil.txt", data: "x" }, { name: "/abs/evil.txt", data: "x" }, { name: "C:\\win\\evil.txt", data: "x" }, { name: "ok/../../evil2.txt", data: "x" }, { name: "good.txt", data: "fine" }]);
    const parent = dir("slip");
    const dest = join(parent, "out");
    mkdirSync(dest);
    const note = await runBuiltin(job("zip-extract", [f], dest));
    expect(note).toContain("skipped for safety");
    expect(readdirSync(parent)).toEqual(["out"]);
    expect(tree(dest)).toEqual(["good.txt"]);
    expect(existsSync(join(parent, "evil.txt"))).toBe(false);
    expect(existsSync("/abs/evil.txt")).toBe(false);
  });

  test("tar.gz slip, absolute paths and links are skipped, never created", async () => {
    const tgz = join(dir("hostile"), "evil.tar.gz");
    writeFileSync(tgz, handTar([
      { name: "../evil.txt", data: "x" }, { name: "/tmp/fm-evil-abs.txt", data: "x" }, { name: "link", type: "2", link: "/etc/passwd" }, { name: "hard", type: "1", link: "good.txt" },
      { name: "dev", type: "3" }, { name: "good.txt", data: "fine" }, { name: "good.txt", data: "second copy" },
    ]));
    const parent = dir("slip2");
    const dest = join(parent, "out");
    mkdirSync(dest);
    const note = await runBuiltin(job("targz-extract", [tgz], dest));
    expect(note).toContain("skipped for safety");
    expect(tree(dest)).toEqual(["good.txt"]);
    expect(readFileSync(join(dest, "good.txt"), "utf8")).toBe("fine");
    expect(existsSync(join(parent, "evil.txt"))).toBe(false);
    expect(existsSync("/tmp/fm-evil-abs.txt")).toBe(false);
  });

  test("a zip link entry (a symlink) is not created, and zip to tar.gz doesn't copy it", async () => {
    const f = await zipWith([{ name: "link", data: "/etc/passwd", mode: 0o120777 }, { name: "real.txt", data: "r" }]);
    const dest = dir("lnk");
    await runBuiltin(job("zip-extract", [f], dest));
    expect(tree(dest)).toEqual(["real.txt"]);
    const out = join(dir("lnk2"), "o.tar.gz");
    expect(await runBuiltin(job("zip-to-targz", [f], out))).toContain("skipped");
  });

  test("zip bombs: too much data, too many items, and sizes that lie", async () => {
    const f = await zipWith([{ name: "a.bin", data: "A".repeat(5000) }, { name: "b.bin", data: "B".repeat(5000) }]);
    const dest = dir("bomb");
    await expect(runBuiltin(job("zip-extract", [f], dest, { limits: { maxBytes: 6000, maxEntries: 100 } }))).rejects.toThrow(/disk space|safety limit/);
    const many = await zipWith(Array.from({ length: 12 }, (_, i) => ({ name: `f${i}.txt`, data: "x" })));
    await expect(runBuiltin(job("zip-extract", [many], dir("bomb2"), { limits: { maxBytes: 1e9, maxEntries: 5 } }))).rejects.toThrow(/too many items/);
    // an entry whose header claims 10 bytes but whose data inflates to more
    const good = readFileSync(f);
    const lying = Buffer.from(good);
    const cdAt = lying.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    lying.writeUInt32LE(10, cdAt + 24);
    const lf = join(dir("bomb3"), "lie.zip");
    writeFileSync(lf, lying);
    await expect(runBuiltin(job("zip-extract", [lf], dir("bomb3o")))).rejects.toThrow(/larger than the zip file says|damaged/);
  });

  test("tar.gz bombs: a decompressed size beyond the limit, and too many items", async () => {
    const tgz = join(dir("bomb"), "b.tar.gz");
    writeFileSync(tgz, handTar([{ name: "big.txt", data: "Z".repeat(200_000) }]));
    await expect(runBuiltin(job("targz-extract", [tgz], dir("tb1"), { limits: { maxBytes: 50_000, maxEntries: 10 } }))).rejects.toThrow(/safety limit|disk space/);
    const lots = join(dir("bomb"), "lots.tar.gz");
    writeFileSync(lots, handTar(Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, data: "x" }))));
    await expect(runBuiltin(job("targz-extract", [lots], dir("tb2"), { limits: { maxBytes: 1e9, maxEntries: 10 } }))).rejects.toThrow(/too many items/);
    const gz = join(dir("bomb"), "x.gz");
    writeFileSync(gz, gzipSync(Buffer.alloc(2_000_000, 1)));
    await expect(gunzipFile(gz, join(dirname(gz), "x.out"), 100_000)).rejects.toThrow(/safety limit/);
  });

  test("a damaged archive is a plain error and nothing is left behind", async () => {
    const d = dir("damaged");
    writeFileSync(join(d, "bad.zip"), "PK\u0003\u0004 truncated");
    await expect(runBuiltin(job("zip-extract", [join(d, "bad.zip")], join(d, "o")))).rejects.toThrow();
    const tgz = join(d, "bad.tar.gz");
    writeFileSync(tgz, gzipSync(Buffer.from("this is definitely not a tar archive, not at all, nope".repeat(30))));
    await expect(extractTarGz(tgz, d, "linux")).rejects.toThrow(/valid tar archive/);
    await expect(zipToTarGz(join(d, "bad.zip"), join(d, "x.tgz"), "linux")).rejects.toThrow();
    expect(existsSync(join(d, "x.tgz"))).toBe(false);
    await expect(tarGzToZip(tgz, join(d, "x.zip"), "linux")).rejects.toThrow();
    expect(existsSync(join(d, "x.zip"))).toBe(false);
  });

  test("symlinks inside a folder being zipped are skipped, not followed", async () => {
    const src = sample();
    try {
      symlinkSync("/etc", join(src, "etc-link"));
    } catch {
      return;
    }
    const zip = join(dir("out"), "l.zip");
    expect(await runBuiltin(job("zip-create", [src], zip))).toContain("1 link skipped");
    const dest = dir("lx");
    await runBuiltin(job("zip-extract", [zip], dest));
    expect(existsSync(join(dest, "proj", "etc-link"))).toBe(false);
    const tgz = join(dir("out"), "l.tar.gz");
    expect(await createTarGzFrom([src], tgz)).toMatchObject({ skippedLinks: 1 });
  });

  test("unflatten and parseTomlLite resist prototype pollution keys", () => {
    const { unflatten } = require("../src/features/filemanager/fmConvCommon");
    const { parseTomlLite } = require("../src/features/filemanager/fmDevManifest");
    const res1 = unflatten({ "__proto__.polluted": "yes", "constructor.prototype.polluted": "yes", "safe.key": 42 });
    expect(({} as any).polluted).toBeUndefined();
    expect((res1 as any).safe.key).toBe(42);

    const res2 = parseTomlLite("[__proto__]\npolluted = \"yes\"\n[dependencies]\nbun = \"1.0.0\"\n");
    expect(({} as any).polluted).toBeUndefined();
    expect(res2.dependencies?.bun).toBe("1.0.0");
  });
});

import { dirname } from "path";
