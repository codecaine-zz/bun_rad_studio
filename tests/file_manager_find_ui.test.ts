import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import * as tsm from "typescript";
import { filterResults, pushHistory, sortResults, FD_SORT_KEYS } from "../src/fd_helpers";
import { dirOf, filterItems, pathsText, pushHistory as pageHistory, rangeBetween, sampleNames, sortItems, summarizeBatch, totalBytes, typeLabel } from "../resources/file_manager/ui/findCore.js";

const ts: any = (tsm as any).default ?? tsm;
const UI = join(import.meta.dir, "..", "resources", "file_manager", "ui");

const item = (name: string, sizeBytes: number, mtimeMs: number, relativePath = name, type = "file") => ({ name, sizeBytes, mtimeMs, relativePath, path: `/r/${relativePath}`, type });
const items = [item("b10.txt", 5, 300), item("B2.txt", 50, 100, "sub/B2.txt"), item("a.md", 500, 200, "sub/deep/a.md"), item("Z", 0, 400, "Z", "directory")];

describe("the page sorts and filters like Fd Studio does", () => {
  test("every sort key gives the same order as the server's helper", () => {
    for (const key of [...FD_SORT_KEYS, "Something else"]) expect(sortItems(items, key).map((i: any) => i.name)).toEqual(sortResults(items, key).map((i) => i.name));
  });

  test("the filter matches names and relative paths, ignoring case", () => {
    for (const q of ["", "  ", "B", "deep", "TXT", "nothing-here"]) expect(filterItems(items, q).map((i: any) => i.name)).toEqual(filterResults(items, q).map((i) => i.name));
    expect(filterItems(items, "deep").map((i: any) => i.name)).toEqual(["a.md"]);
  });

  test("recent searches: newest first, no repeats, capped", () => {
    expect(pageHistory(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(pageHistory(["a"], "  ")).toEqual(["a"]);
    const many = Array.from({ length: 20 }, (_, i) => `q${i}`).reduce((h: string[], q) => pageHistory(h, q), []);
    expect(many.length).toBe(15);
    expect(many[0]).toBe("q19");
    expect(pageHistory(["x", "y"], "z", 2)).toEqual(pushHistory(["x", "y"], "z", 2));
  });

  test("sorting leaves the original list alone", () => {
    const copy = items.slice();
    sortItems(items, "Size (largest)");
    filterItems(items, "a");
    expect(items).toEqual(copy);
  });
});

describe("small helpers", () => {
  test("dirOf, typeLabel, rangeBetween", () => {
    expect(dirOf("a.txt")).toBe("");
    expect(dirOf("sub/deep/a.txt")).toBe("sub/deep");
    expect(typeLabel("directory")).toBe("Folder");
    expect(typeLabel("symlink")).toBe("Link");
    expect(typeLabel("weird")).toBe("Other");
    expect(rangeBetween(2, 5)).toEqual([2, 3, 4, 5]);
    expect(rangeBetween(5, 3)).toEqual([3, 4, 5]);
    expect(rangeBetween(1, 1)).toEqual([1]);
  });

  test("paths text and totals", () => {
    expect(pathsText(items.slice(0, 2), "relative")).toBe("b10.txt\nsub/B2.txt");
    expect(pathsText(items.slice(0, 2), "full")).toBe("/r/b10.txt\n/r/sub/B2.txt");
    expect(totalBytes(items)).toBe(555);
  });

  test("names for a confirmation, and the batch summary", () => {
    expect(sampleNames(items, 2)).toBe("b10.txt, B2.txt and 2 more");
    expect(sampleNames(items.slice(0, 2), 5)).toBe("b10.txt, B2.txt");
    expect(summarizeBatch("Copied", { done: 3, skipped: 0, failed: 0 })).toBe("Copied 3 items");
    expect(summarizeBatch("Moved", { done: 1, skipped: 2, failed: 1 })).toBe("Moved 1 item, 2 skipped, 1 couldn't be done");
    expect(summarizeBatch("Moved", { done: 0, skipped: 0, failed: 0 })).toBe("Nothing was changed");
  });
});

describe("every control of the Find tool explains itself", () => {
  const files = readdirSync(UI).filter((f) => /^find.*\.js$/.test(f));
  const trees = files.map((f) => ({ f, sf: ts.createSourceFile(f, readFileSync(join(UI, f), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS) }));

  const names = (obj: any): string[] => (obj && ts.isObjectLiteralExpression(obj) ? obj.properties.map((p: any) => p.name?.text ?? p.name?.getText?.() ?? "") : []);
  const visit = (cb: (call: any, f: string) => void) => {
    for (const { f, sf } of trees) {
      const walk = (n: any) => {
        if (ts.isCallExpression(n)) cb(n, f);
        ts.forEachChild(n, walk);
      };
      walk(sf);
    }
  };

  test("the find modules exist", () => {
    expect(files).toEqual(expect.arrayContaining(["find.js", "findForm.js", "findResults.js", "findInspector.js", "findActions.js", "findRename.js", "findAnalyze.js", "findExec.js", "findPicker.js"]));
    for (const f of files) expect(readFileSync(join(UI, f), "utf8").split("\n").length, f).toBeLessThan(400);
  });

  test("buttons, text boxes, drop-downs and check boxes made with the helpers have a tooltip (and a label where needed)", () => {
    const problems: string[] = [];
    let checked = 0;
    visit((call, f) => {
      const callee = call.expression.getText();
      if (["button", "textInput", "dropdown", "checkbox"].includes(callee)) checked++;
      const at = (i: number) => names(call.arguments[i]);
      if (callee === "button" && !at(2).includes("tip")) problems.push(`${f}: button(${call.arguments[0]?.getText()}) has no tip`);
      if (callee === "textInput" && !(at(0).includes("tip") && at(0).includes("label"))) problems.push(`${f}: textInput needs tip and label`);
      if (callee === "dropdown" && !(at(1).includes("tip") && at(1).includes("label"))) problems.push(`${f}: dropdown needs tip and label`);
      if (callee === "checkbox" && !at(1).includes("tip")) problems.push(`${f}: checkbox(${call.arguments[0]?.getText()}) has no tip`);
    });
    expect(checked).toBeGreaterThan(40);
    expect(problems).toEqual([]);
  });

  test("elements made by hand with h() have a tooltip or label too", () => {
    const problems: string[] = [];
    visit((call, f) => {
      if (call.expression.getText() !== "h") return;
      const tag = call.arguments[0];
      if (!tag || !ts.isStringLiteral(tag) || !["button", "input", "select", "textarea"].includes(tag.text)) return;
      const attrs = names(call.arguments[1]);
      const isCheckbox = call.arguments[1]?.getText().includes('"checkbox"');
      if (!isCheckbox && !(attrs.includes("title") || attrs.includes("aria-label"))) problems.push(`${f}: <${tag.text}> without title or aria-label`);
      if ((tag.text === "input" || tag.text === "textarea" || tag.text === "select") && !isCheckbox && !attrs.includes("aria-label")) problems.push(`${f}: <${tag.text}> without aria-label`);
    });
    expect(problems).toEqual([]);
  });

  test("no inline styles: the tool only styles through classes", () => {
    for (const { f } of trees) expect(readFileSync(join(UI, f), "utf8"), f).not.toMatch(/\.style\b|style:/);
    const css = readFileSync(join(UI, "find.css"), "utf8");
    for (const m of css.matchAll(/^\s*([.#][\w-]+)[^{]*\{/gm)) {
      if (m[1]!.startsWith(".find-") || m[1]!.startsWith(".pw-")) continue;
      expect(m[0], "selector outside the find- prefix").toMatch(/\.find-/);
    }
  });
});
