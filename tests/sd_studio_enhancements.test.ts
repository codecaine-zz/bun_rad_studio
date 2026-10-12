import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  SD_PRESETS,
  findSdPreset,
  parseExtList,
  globToRegExp,
  passesFileFilter,
  isLikelyBinary,
  unescapeReplacement,
  mergeUndo,
  formatReport,
  joinDiffs,
} from "../src/sd_helpers";
import { createSdStudio } from "../applications/sd_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

describe("sd_helpers", () => {
  test("presets compile and behave as described", () => {
    for (const p of SD_PRESETS) expect(() => new RegExp(p.find, p.flags)).not.toThrow();
    const trim = findSdPreset("Trim trailing whitespace")!;
    expect("a  \nb\t\n".replace(new RegExp(trim.find, trim.flags), trim.replace)).toBe("a\nb\n");
    const crlf = findSdPreset("Windows (CRLF) → Unix (LF)")!;
    expect("a\r\nb\r\n".replace(new RegExp(crlf.find, crlf.flags), unescapeReplacement(crlf.replace))).toBe("a\nb\n");
    const logs = findSdPreset("Remove console.log lines")!;
    expect("x\n  console.log('hi');\ny\n".replace(new RegExp(logs.find, logs.flags), logs.replace)).toBe("x\ny\n");
  });

  test("parseExtList normalizes", () => {
    expect(parseExtList(" .TS, tsx;md  json")).toEqual(["ts", "tsx", "md", "json"]);
    expect(parseExtList("")).toEqual([]);
  });

  test("glob excludes and extension filter", () => {
    expect(globToRegExp("*.min.js").test("a/b/app.min.js")).toBe(true);
    expect(globToRegExp("vendor").test("src/vendor/x.ts")).toBe(true);
    expect(globToRegExp("vendor").test("src/vendors/x.ts")).toBe(false);
    expect(globToRegExp("test/**").test("a/test/x/y.ts")).toBe(true);
    expect(passesFileFilter("src/a.ts", { exts: ["ts"] })).toBe(true);
    expect(passesFileFilter("src/a.md", { exts: ["ts"] })).toBe(false);
    expect(passesFileFilter("src/a.min.js", { exclude: ["*.min.js"] })).toBe(false);
    expect(passesFileFilter("Makefile", { exts: ["ts"] })).toBe(false);
  });

  test("binary detection", () => {
    expect(isLikelyBinary(new TextEncoder().encode("hello world\nline 2\n"))).toBe(false);
    expect(isLikelyBinary(new Uint8Array([0x50, 0x4b, 0, 3, 4]))).toBe(true);
    expect(isLikelyBinary(new Uint8Array(0))).toBe(false);
  });

  test("unescape + undo merge + report", () => {
    expect(unescapeReplacement("a\\nb\\tc\\\\d $1")).toBe("a\nb\tc\\d $1");
    const m = mergeUndo([{ filePath: "a", original: "1" }], [{ filePath: "a", original: "2" }, { filePath: "b", original: "3" }]);
    expect(m).toEqual([{ filePath: "a", original: "1" }, { filePath: "b", original: "3" }]);
    const rep = formatReport({ find: "x", replace: "y", mode: "preview", skipped: 2, rows: [{ filePath: "f.ts", matches: 3, hunks: 2, status: "Diff Ready" }] });
    expect(rep).toContain("Total matches: 3");
    expect(rep).toContain("| f.ts | 3 | 2 | Diff Ready |");
    expect(rep).toContain("Skipped");
    expect(joinDiffs([])).toBe("");
  });
});

describe("Sd Studio enhancements (temp workspace)", () => {
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sd_studio_test_"));
    fs.writeFileSync(path.join(dir, "a.ts"), "const foo = 1;\nfoo();\n");
    fs.writeFileSync(path.join(dir, "b.md"), "foo in docs\n");
    fs.writeFileSync(path.join(dir, "skip.min.js"), "foo();\n");
    fs.writeFileSync(path.join(dir, "bin.dat"), Buffer.from([0x66, 0x6f, 0x6f, 0, 1, 2, 3, 0, 0]));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("renders new controls", () => {
    const html = createSdStudio({ fullscreen: false }).generateHtml();
    for (const id of ["btn_browse_folder", "dd_preset", "btn_swap", "txt_exts", "txt_exclude", "btn_undo_replace", "btn_save_patch", "btn_save_report", "btn_copy_diff", "chk_escapes"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  test("filters by extension/exclude and skips binaries", async () => {
    const win = createSdStudio({ fullscreen: false });
    win.setValue("txt_targets", dir);
    win.setValue("txt_find", "foo");
    await trigger(win, "btn_count_matches");
    let rows = win.getValue("tbl_files") as string[][];
    const names = rows.map((r) => path.basename(r[0]!)).sort();
    expect(names).toEqual(["a.ts", "b.md", "skip.min.js"]); // binary skipped
    expect(win.getValue("lbl_status_bar")).toContain("Skipped 1");

    win.setValue("txt_exts", "ts,js");
    win.setValue("txt_exclude", "*.min.js");
    await trigger(win, "btn_count_matches");
    rows = win.getValue("tbl_files") as string[][];
    expect(rows.map((r) => path.basename(r[0]!))).toEqual(["a.ts"]);
  });

  test("swap and preset fill the form", async () => {
    const win = createSdStudio({ fullscreen: false });
    win.setValue("txt_find", "one");
    win.setValue("txt_replace", "two");
    await trigger(win, "btn_swap");
    expect(win.getValue("txt_find")).toBe("two");
    expect(win.getValue("txt_replace")).toBe("one");
    win.setValue("dd_preset", "Trim trailing whitespace");
    await trigger(win, "dd_preset", "change");
    expect(win.getValue("txt_find")).toBe("[ \\t]+$");
    expect(win.getValue("txt_flags")).toBe("gm");
  });

  test("replace with escapes then undo restores the original files", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "sd_undo_"));
    const f = path.join(d, "a.txt");
    fs.writeFileSync(f, "foo bar\n");
    const win = createSdStudio({ fullscreen: false });
    win.setValue("txt_targets", d);
    win.setValue("txt_find", "foo");
    win.setValue("txt_replace", "x\\ny");
    win.setValue("chk_escapes", true);
    await trigger(win, "btn_apply_replace");
    expect(fs.readFileSync(f, "utf8")).toBe("x\ny bar\n");
    await trigger(win, "btn_undo_replace");
    expect(fs.readFileSync(f, "utf8")).toBe("foo bar\n");
    fs.rmSync(d, { recursive: true, force: true });
  });
});
