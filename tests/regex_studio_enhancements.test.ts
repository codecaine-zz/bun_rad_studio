import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildFlags, validatePattern, looksCatastrophic, lineCol, runRegexSync, replaceSync, runRegexSafe, replaceSafe, markMatches,
  groupsLabel, matchesToList, matchesToCsv, matchesToJson, explainPattern, generateCode, PRESETS, serializeWorkspace, parseWorkspace,
  CHEATSHEET,
} from "../src/regex_tools";
import { createRegexStudio } from "../applications/regex_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

describe("flags and validation", () => {
  test("buildFlags orders flags", () => {
    expect(buildFlags({ g: true, i: true, m: true, s: true, u: true })).toBe("gimsu");
    expect(buildFlags({})).toBe("");
  });

  test("validatePattern reports groups, named groups and errors", () => {
    const ok = validatePattern("(a)(?<n>b)(?:c)", "");
    expect(ok.ok).toBe(true);
    expect(ok.groupCount).toBe(2);
    expect(ok.namedGroups).toEqual(["n"]);
    const bad = validatePattern("(", "");
    expect(bad.ok).toBe(false);
    expect(bad.error).toBeTruthy();
    expect(validatePattern("", "").error).toContain("empty");
    expect(validatePattern("a", "gg").ok).toBe(false);
  });

  test("catastrophic heuristic", () => {
    expect(looksCatastrophic("(x+x+)+y")).toBe(true);
    expect(looksCatastrophic("(a*)*")).toBe(true);
    expect(looksCatastrophic("(\\d+)-(\\d+)")).toBe(false);
    expect(looksCatastrophic("^[a-z]+$")).toBe(false);
  });
});

describe("running", () => {
  test("global matches with line/col, groups and named groups", () => {
    const r = runRegexSync("(?<k>[a-z]+)=(\\d+)", "g", "a=1\nbb=22\n  c=3");
    expect(r.matches.map((m) => m.text)).toEqual(["a=1", "bb=22", "c=3"]);
    expect(r.matches[1]!.line).toBe(2);
    expect(r.matches[1]!.col).toBe(1);
    expect(r.matches[2]!.line).toBe(3);
    expect(r.matches[2]!.col).toBe(3);
    expect(r.matches[1]!.groups).toEqual(["bb", "22"]);
    expect(r.matches[1]!.named["k"]).toBe("bb");
    expect(r.matches[0]!.end).toBe(3);
  });

  test("non-global returns first match only; zero-length matches terminate", () => {
    expect(runRegexSync("\\d", "", "1 2 3").matches.length).toBe(1);
    const z = runRegexSync("x*", "g", "abc");
    expect(z.matches.length).toBe(4);
  });

  test("match cap and errors", () => {
    const r = runRegexSync("a", "g", "a".repeat(50), 10);
    expect(r.matches.length).toBe(10);
    expect(r.capped).toBe(true);
    expect(runRegexSync("(", "g", "x").error).toBeTruthy();
  });

  test("lineCol", () => {
    expect(lineCol("ab\ncd", 3)).toEqual({ line: 2, col: 1 });
    expect(lineCol("ab\ncd", 4)).toEqual({ line: 2, col: 2 });
  });

  test("replace keeps native $ semantics and counts", () => {
    const r = replaceSync("(\\w+)@(\\w+)", "g", "a@b c@d", "$2 at $1");
    expect(r.text).toBe("b at a d at c");
    expect(r.count).toBe(2);
    expect(replaceSync("(?<x>\\d)", "g", "1 2", "<$<x>>").text).toBe("<1> <2>");
    expect(replaceSync("\\d", "", "1 2", "#").count).toBe(1);
    expect(replaceSync("(", "g", "x", "").error).toBeTruthy();
  });

  test("worker-backed run and replace match the sync results", async () => {
    const r = await runRegexSafe("\\d+", "g", "a1 b22 c333");
    expect(r.matches.map((m) => m.text)).toEqual(["1", "22", "333"]);
    const p = await replaceSafe("\\d+", "g", "a1 b22", "N");
    expect(p.text).toBe("aN bN");
    expect((await runRegexSafe("(", "g", "x")).error).toBeTruthy();
  });

  test("catastrophic pattern is stopped by the timeout and the app stays responsive", async () => {
    const t0 = performance.now();
    const r = await runRegexSafe("(x+x+)+y", "", "x".repeat(60), 1000, 400);
    expect(r.timedOut).toBe(true);
    expect(r.error).toContain("backtracking");
    expect(performance.now() - t0).toBeLessThan(3000);
    const after = await runRegexSafe("a", "g", "aaa");
    expect(after.matches.length).toBe(3);
  });
});

describe("presentation helpers", () => {
  const ms = runRegexSync("(\\d)(\\w)", "g", "1a 2b").matches;
  test("markMatches, groupsLabel, lists", () => {
    expect(markMatches("1a 2b", ms)).toBe("«1a» «2b»");
    expect(groupsLabel(ms[0]!)).toBe("G1: 1, G2: a");
    expect(matchesToList(ms)).toEqual(["1a", "2b"]);
    expect(matchesToList(ms, 2)).toEqual(["a", "b"]);
  });

  test("csv escapes and json shape", () => {
    const m = runRegexSync(".+", "g", 'say "hi", ok').matches;
    const csv = matchesToCsv(m);
    expect(csv.split("\n")[0]).toBe("match,text,index,end,line,col");
    expect(csv).toContain('"say ""hi"", ok"');
    const j = JSON.parse(matchesToJson(ms));
    expect(j[0].matchNum).toBe(1);
    expect(j[0].groups).toEqual(["1", "a"]);
  });

  test("explainPattern covers common tokens", () => {
    const e = explainPattern("^(?<year>\\d{4})-(?:a|b)+?[^x]\\1$").join("\n");
    expect(e).toContain("start of the text");
    expect(e).toContain('named "year"');
    expect(e).toContain("exactly 4 times");
    expect(e).toContain("non-capturing");
    expect(e).toContain("lazy");
    expect(e).toContain("NOT in this set");
    expect(e).toContain("back-reference to group 1");
    expect(explainPattern("a{2,}").join("")).toContain("2 or more");
  });

  test("cheat sheet exists", () => {
    expect(CHEATSHEET).toContain("Lookaround");
  });
});

describe("code generation", () => {
  test("TypeScript keeps the original snippet", () => {
    const c = generateCode("TypeScript", "a\\d", "gi");
    expect(c).toContain("// TypeScript / Bun RegExp");
    expect(c).toContain('new RegExp("a\\\\d", "gi")');
  });
  test("other languages", () => {
    expect(generateCode("JavaScript", "x", "g")).toContain("// JavaScript RegExp");
    const py = generateCode("Python", "(?<n>\\d)\\k<n>", "gim");
    expect(py).toContain("(?P<n>");
    expect(py).toContain("(?P=n)");
    expect(py).toContain("re.IGNORECASE | re.MULTILINE");
    const go = generateCode("Go", "a(?=b)", "gi");
    expect(go).toContain("(?i)");
    expect(go).toContain("RE2");
    expect(generateCode("Java", "\\d+", "gis")).toContain("Pattern.CASE_INSENSITIVE | Pattern.DOTALL");
    expect(generateCode("PHP", "a/b'", "gi")).toContain("preg_match_all('/a\\/b\\'/i'");
  });
});

describe("presets and workspace files", () => {
  test("every preset compiles and has a unique name", () => {
    const names = new Set(PRESETS.map((p) => p.name));
    expect(names.size).toBe(PRESETS.length);
    for (const p of PRESETS) expect(validatePattern(p.pattern, "g").ok).toBe(true);
    expect(runRegexSync(PRESETS.find((p) => p.name.includes("Duplicate"))!.pattern, "g", "the the cat").matches.length).toBe(1);
  });

  test("workspace round trip and rejects junk", () => {
    const s = serializeWorkspace({ pattern: "a", subst: "b", corpus: "c", flags: { g: true, i: true, m: false, s: false, u: false } });
    const w = parseWorkspace(s);
    expect(w.pattern).toBe("a");
    expect(w.flags.i).toBe(true);
    expect(() => parseWorkspace("{}")).toThrow();
    expect(() => parseWorkspace("nope")).toThrow();
  });
});

describe("Regex Studio GUI", () => {
  const make = () => createRegexStudio({ fullscreen: false });
  const rows = (w: SimpleWindow) => w.getValue("tbl_matches") as string[][];
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "regex-studio-"));

  test("renders new controls", () => {
    const html = make().generateHtml();
    for (const id of ["chk_u", "chk_live", "dd_lang", "btn_explain", "btn_cheatsheet", "btn_load_corpus", "btn_copy_matches", "btn_copy_replaced", "btn_save_replaced", "btn_save_ws_file", "btn_load_ws_file", "txt_marked", "txt_group_n", "btn_gen_code", "btn_export_matches", "btn_replace", "dd_lib"]) {
      expect(html).toContain(id);
    }
  });

  test("test fills table with line:col, highlight view and status", async () => {
    const win = make();
    win.setValue("txt_pattern", "([A-Za-z]+)\\s+(\\d+)");
    win.setValue("txt_corpus", "Server 404,\nWorker 200");
    await trigger(win, "btn_test");
    const r = rows(win);
    expect(r.length).toBe(2);
    expect(r[1]![5]).toBe("2:1");
    expect(String(win.getValue("txt_marked"))).toBe("«Server 404»,\n«Worker 200»");
    expect(String(win.getValue("lbl_status"))).toContain("Matches Found: 2");
  });

  test("invalid pattern shows the error and keeps old table", async () => {
    const win = make();
    win.setValue("txt_pattern", "(");
    await trigger(win, "btn_test");
    expect(String(win.getValue("regex_console"))).toContain("[RegEx Error]");
    expect(String(win.getValue("lbl_status"))).toContain("Pattern error");
  });

  test("runaway pattern times out instead of freezing", async () => {
    const win = make();
    win.setValue("txt_pattern", "(x+x+)+y");
    win.setValue("txt_corpus", "x".repeat(60));
    win.setBool("chk_g", false);
    win.setBool("chk_m", false);
    const t0 = performance.now();
    await trigger(win, "btn_test");
    expect(performance.now() - t0).toBeLessThan(8000);
    // JavaScriptCore bails out of runaway patterns after ~0.5s on its own; either way the UI must not hang.
    expect(String(win.getValue("regex_console"))).toMatch(/backtracking|Evaluated/);
  }, 15000);

  test("replace preview, copy and save", async () => {
    const dir = tmp();
    const file = path.join(dir, "r.txt");
    const win = make();
    (win as any).saveFile = (_o: any, cb: any) => cb(file);
    let copied = "";
    (win as any).copyToClipboard = (t: string) => { copied = t; };
    win.setValue("txt_pattern", "(\\w+)@(\\w+)");
    win.setValue("txt_corpus", "a@b c@d");
    win.setValue("txt_subst", "$2/$1");
    await trigger(win, "btn_replace");
    expect(String(win.getValue("regex_console"))).toContain("[Substitution Preview]:\nb/a d/c");
    await trigger(win, "btn_copy_replaced");
    expect(copied).toBe("b/a d/c");
    await trigger(win, "btn_save_replaced");
    expect(fs.readFileSync(file, "utf8")).toBe("b/a d/c");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("code generator honours the language and copies", async () => {
    const win = make();
    let copied = "";
    (win as any).copyToClipboard = (t: string) => { copied = t; };
    win.setValue("txt_pattern", "\\d+");
    win.setValue("dd_lang", "Python");
    await trigger(win, "btn_gen_code");
    expect(copied).toContain("import re");
    expect(String(win.getValue("regex_console"))).toContain("[Generated Code Snippet]");
  });

  test("explain and cheat sheet write to the console", async () => {
    const win = make();
    win.setValue("txt_pattern", "\\d+");
    await trigger(win, "btn_explain");
    expect(String(win.getValue("regex_console"))).toContain("any digit");
    await trigger(win, "btn_cheatsheet");
    expect(String(win.getValue("regex_console"))).toContain("Lookaround");
  });

  test("copy matches / groups and export json + csv", async () => {
    const dir = tmp();
    const win = make();
    let copied = "";
    (win as any).copyToClipboard = (t: string) => { copied = t; };
    win.setValue("txt_pattern", "(\\d)(\\w)");
    win.setValue("txt_corpus", "1a 2b");
    await trigger(win, "btn_test");
    await trigger(win, "btn_copy_matches");
    expect(copied).toBe("1a\n2b");
    win.setValue("txt_group_n", "2");
    await trigger(win, "btn_copy_matches");
    expect(copied).toBe("a\nb");
    win.setValue("txt_group_n", "9");
    copied = "";
    await trigger(win, "btn_copy_matches");
    expect(copied).toBe("");

    const jf = path.join(dir, "m.json");
    (win as any).saveFile = (_o: any, cb: any) => cb(jf);
    await trigger(win, "btn_export_matches");
    expect(JSON.parse(fs.readFileSync(jf, "utf8"))[0].text).toBe("1a");
    const cf = path.join(dir, "m.csv");
    (win as any).saveFile = (_o: any, cb: any) => cb(cf);
    await trigger(win, "btn_export_matches");
    expect(fs.readFileSync(cf, "utf8")).toContain("match,text,index");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("load text file and size guard", async () => {
    const dir = tmp();
    const f = path.join(dir, "t.txt");
    fs.writeFileSync(f, "id=7 id=8");
    const win = make();
    (win as any).openFile = (_o: any, cb: any) => cb(f);
    win.setValue("txt_pattern", "id=(\\d)");
    await trigger(win, "btn_load_corpus");
    expect(win.getValue("txt_corpus")).toBe("id=7 id=8");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("workspace file save/load with flags", async () => {
    const dir = tmp();
    const f = path.join(dir, "w.regex.json");
    const win = make();
    (win as any).saveFile = (_o: any, cb: any) => cb(f);
    win.setValue("txt_pattern", "abc");
    win.setValue("txt_corpus", "xabcx");
    win.setBool("chk_i", true);
    await trigger(win, "btn_save_ws_file");
    const win2 = make();
    (win2 as any).openFile = (_o: any, cb: any) => cb(f);
    await trigger(win2, "btn_load_ws_file");
    expect(win2.getValue("txt_pattern")).toBe("abc");
    expect(win2.getBool("chk_i")).toBe(true);
    fs.writeFileSync(f, "junk");
    await trigger(win2, "btn_load_ws_file");
    expect(String(win2.getValue("regex_console"))).toContain("[Open Error]");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("preset dropdown sets the pattern and evaluates", async () => {
    const win = make();
    await trigger(win, "dd_lib", "change", "6. ISO-8601 Dates");
    expect(win.getValue("txt_pattern")).toBe("\\d{4}-\\d{2}-\\d{2}");
    expect(rows(win)[0]![1]).toBe("2026-09-09");
    await trigger(win, "dd_lib", "change", "12. Hashtags");
    expect(win.getValue("txt_pattern")).toBe("#\\w+");
  });
});
