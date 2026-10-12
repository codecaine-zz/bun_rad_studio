import { describe, it, expect } from "bun:test";
import {
  validateJson, formatJson, minifyJson, sortKeysDeep, indentFrom, jsonToCsv, csvToJson, parseCsv, jsonToYaml, jsonStats, searchJson,
} from "../src/json_tools";
import { evaluateBunJsonQuery, createJqStudio } from "../applications/jq_studio";

const DATA = {
  modules: [
    { name: "a", lines: 3900, status: "stable" },
    { name: "b", lines: 1200, status: "preview" },
    { name: "c", lines: 2800, status: "stable" },
  ],
  tags: ["x", "y"],
};

describe("json_tools", () => {
  it("validates and locates syntax errors", () => {
    expect(validateJson('{"a":1}').ok).toBe(true);
    const bad = validateJson('{\n  "a": 1,\n  "b": oops\n}');
    expect(bad.ok).toBe(false);
    expect(bad.line).toBe(3);
    expect(validateJson("   ").ok).toBe(false);
  });

  it("formats, minifies and sorts keys", () => {
    expect(formatJson('{"a":1}', 4)).toBe('{\n    "a": 1\n}');
    expect(minifyJson('{ "a" : [1, 2] }')).toBe('{"a":[1,2]}');
    expect(JSON.stringify(sortKeysDeep({ b: 1, a: { d: 1, c: 2 } }))).toBe('{"a":{"c":2,"d":1},"b":1}');
    expect(indentFrom("Tab")).toBe("\t");
    expect(indentFrom("4 spaces")).toBe(4);
    expect(indentFrom(undefined)).toBe(2);
  });

  it("converts JSON <-> CSV with quoting", () => {
    const csv = jsonToCsv([{ n: "a,b", v: 1 }, { n: 'q"t', v: null, extra: true }]);
    expect(csv.split("\n")[0]).toBe("n,v,extra");
    expect(csv).toContain('"a,b",1,');
    expect(csv).toContain('"q""t"');
    const back = csvToJson("name,age,ok\n\"Smith, J\",42,true\nBob,,false");
    expect(back).toEqual([{ name: "Smith, J", age: 42, ok: true }, { name: "Bob", age: null, ok: false }]);
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(jsonToCsv(["x", "y"])).toBe("value\nx\ny");
  });

  it("converts JSON to YAML", () => {
    const y = jsonToYaml({ name: "app", list: [1, { a: 2 }], empty: [], flag: true, s: "true" });
    expect(y).toContain("name: app");
    expect(y).toContain("flag: true");
    expect(y).toContain('s: "true"');
    expect(y).toContain("empty: []");
    expect(y).toContain("- 1");
  });

  it("computes stats and searches", () => {
    const s = jsonStats(DATA);
    expect(s.arrays).toBe(2);
    expect(s.objects).toBe(4);
    expect(s.numbers).toBe(3);
    const hits = searchJson(DATA, "stable");
    expect(hits.map((h) => h.path)).toEqual([".modules[0].status", ".modules[2].status"]);
    expect(searchJson(DATA, "lines").every((h) => h.kind === "key")).toBe(true);
    expect(searchJson(DATA, "")).toEqual([]);
  });
});

describe("query engine upgrades", () => {
  it("supports comparison selects", () => {
    const big = evaluateBunJsonQuery(DATA, '.modules[] | select(.lines > 2000)');
    expect(big.map((m: any) => m.name)).toEqual(["a", "c"]);
    expect(evaluateBunJsonQuery(DATA, '.modules | map(select(.status != "stable")) | length')).toBe(1);
    expect(evaluateBunJsonQuery(DATA, '.modules[] | select(.status == "stable" and .lines < 3000)').length).toBe(1);
  });

  it("does not split pipes inside quotes / parentheses", () => {
    const d = [{ n: "a | b" }, { n: "c" }];
    expect(evaluateBunJsonQuery(d, 'map(select(.n | contains("|")))')).toEqual([{ n: "a | b" }]);
  });

  it("supports //, group_by, unique_by, min_by/max_by, del, any/all, string helpers", () => {
    expect(evaluateBunJsonQuery(DATA, '.missing // "fallback"')).toBe("fallback");
    expect(evaluateBunJsonQuery(DATA, ".modules | group_by(.status) | length")).toBe(2);
    expect(evaluateBunJsonQuery(DATA, ".modules | unique_by(.status) | length")).toBe(2);
    expect((evaluateBunJsonQuery(DATA, ".modules | max_by(.lines)") as any).name).toBe("a");
    expect((evaluateBunJsonQuery(DATA, ".modules | min_by(.lines)") as any).name).toBe("b");
    expect(evaluateBunJsonQuery({ a: 1, b: 2 }, "del(.a)")).toEqual({ b: 2 });
    expect(evaluateBunJsonQuery(DATA, ".modules | any(.lines > 3000)")).toBe(true);
    expect(evaluateBunJsonQuery(DATA, ".modules | all(.lines > 3000)")).toBe(false);
    expect(evaluateBunJsonQuery("a,b,c", 'split(",")')).toEqual(["a", "b", "c"]);
    expect(evaluateBunJsonQuery("hello", 'test("^he")')).toBe(true);
  });

  it("keeps existing behaviour", () => {
    expect(evaluateBunJsonQuery(DATA, ".modules | map(.name)")).toEqual(["a", "b", "c"]);
    expect(evaluateBunJsonQuery(DATA, "[.modules[].lines] | add")).toBe(7900);
    expect(evaluateBunJsonQuery(DATA, '.tags | join(", ")')).toBe("x, y");
  });

  it("builds the studio with the new controls", () => {
    const html = createJqStudio({ fullscreen: false }).generateHtml();
    for (const id of ["btn_open", "btn_format", "btn_to_csv", "btn_find", "chk_live", "dd_indent"]) expect(html).toContain(id);
  });
});
