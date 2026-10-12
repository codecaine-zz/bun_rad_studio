import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  globToRegExp,
  parseGlobList,
  compileGlobs,
  passesGlobs,
  parseGitignore,
  buildMatcher,
  searchCode,
  findPaths,
  replaceInFiles,
  trashPath,
  undoLastTrash,
  getLastTrash,
  clampInt,
  formatBytes,
} from "../src/devtools_tools";
import { createOmnitoolStudio, bunNativeRipgrep } from "../applications/omnitool_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

let root: string;
const w = (rel: string, body: string | Buffer) => {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, body);
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "devtools-"));
  w("a.ts", "const Foo = 1;\nconst foo = 2;\nfoobar();\n// foo\n");
  w("src/b.js", "let foo = 'x';\nlet other = 1;\nlet foo2 = 2;\n");
  w("notes.md", "Foo is great\n");
  w(".hidden/secret.txt", "foo hidden\n");
  w("ignored/skip.txt", "foo ignored\n");
  w("build.log", "foo log\n");
  w("bin.dat", Buffer.from([102, 111, 111, 0, 1, 2]));
  w("node_modules/pkg/index.js", "foo module\n");
  w(".gitignore", "ignored/\n*.log\n");
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("globs", () => {
  test("globToRegExp", () => {
    expect(globToRegExp("*.ts").test("a.ts")).toBe(true);
    expect(globToRegExp("*.ts").test("src/a.ts")).toBe(false);
    expect(globToRegExp("**/*.ts").test("src/deep/a.ts")).toBe(true);
    expect(globToRegExp("**/*.ts").test("a.ts")).toBe(true);
    expect(globToRegExp("*.{ts,js}").test("b.js")).toBe(true);
    expect(globToRegExp("a?.ts").test("ab.ts")).toBe(true);
    expect(globToRegExp("a.ts").test("axts")).toBe(false);
  });
  test("parseGlobList keeps braces together", () => {
    expect(parseGlobList("*.ts, *.{js,jsx} !*.test.ts")).toEqual(["*.ts", "*.{js,jsx}", "!*.test.ts"]);
    expect(parseGlobList("")).toEqual([]);
  });
  test("passesGlobs include and exclude", () => {
    const r = compileGlobs(["*.ts", "!*.test.ts"]);
    expect(passesGlobs("a.ts", r)).toBe(true);
    expect(passesGlobs("a.test.ts", r)).toBe(false);
    expect(passesGlobs("a.js", r)).toBe(false);
    expect(passesGlobs("anything", [])).toBe(true);
    expect(passesGlobs("a.js", compileGlobs(["!*.test.ts"]))).toBe(true);
  });
  test("parseGitignore", () => {
    const ig = parseGitignore("# c\nignored/\n*.log\n/rootonly\nlogs/*.tmp\n!keep\n");
    expect(ig("ignored", true)).toBe(true);
    expect(ig("ignored/skip.txt", false)).toBe(true);
    expect(ig("ignored", false)).toBe(false);
    expect(ig("x/y.log", false)).toBe(true);
    expect(ig("rootonly", false)).toBe(true);
    expect(ig("sub/rootonly", false)).toBe(false);
    expect(ig("logs/a.tmp", false)).toBe(true);
    expect(ig("src/a.ts", false)).toBe(false);
  });
});

describe("search", () => {
  test("regression: global-flag lastIndex no longer skips matching lines", () => {
    // 'foo' appears on consecutive lines; stateful /g regex used to skip every other hit
    const r = searchCode(root, "foo", { caseSensitive: true, gitignore: false });
    expect(r.output).toContain("a.ts:2:");
    expect(r.output).toContain("b.js:1:".replace("b.js", "src/b.js"));
    expect(r.output).toContain("src/b.js:3:");
  });
  test("case sensitivity", () => {
    const ci = searchCode(root, "foo", { gitignore: false });
    const cs = searchCode(root, "foo", { caseSensitive: true, gitignore: false });
    expect(ci.matches).toBeGreaterThan(cs.matches);
    expect(ci.output).toContain("notes.md:1:");
    expect(cs.output).not.toContain("notes.md");
  });
  test("whole word and literal", () => {
    const r = searchCode(root, "foo", { caseSensitive: true, wholeWord: true, gitignore: false });
    expect(r.output).toContain("a.ts:2:");
    expect(r.output).not.toContain("foobar");
    expect(r.output).not.toContain("foo2");
    const lit = searchCode(root, "foo(", { fixed: true, caseSensitive: true });
    expect(lit.output).not.toContain("Invalid");
    expect(searchCode(root, "foo(", {}).output).toContain("[Invalid Regex]");
  });
  test("hidden, node_modules, binary and gitignore handling", () => {
    const def = searchCode(root, "foo", { gitignore: true });
    expect(def.output).not.toContain(".hidden");
    expect(def.output).not.toContain("node_modules");
    expect(def.output).not.toContain("ignored/skip");
    expect(def.output).not.toContain("build.log");
    expect(def.output).not.toContain("bin.dat");
    const all = searchCode(root, "foo", { hidden: true, gitignore: false });
    expect(all.output).toContain(".hidden/secret.txt");
    expect(all.output).toContain("ignored/skip.txt");
    expect(all.output).not.toContain("node_modules");
  });
  test("include / exclude globs", () => {
    const r = searchCode(root, "foo", { include: "*.js", gitignore: false });
    expect(r.output).toContain("src/b.js");
    expect(r.output).not.toContain("a.ts");
    const ex = searchCode(root, "foo", { include: "!*.ts", gitignore: false });
    expect(ex.output).not.toContain("a.ts:");
    expect(ex.output).toContain("src/b.js");
  });
  test("max results cap and files-only", () => {
    const r = searchCode(root, "foo", { maxResults: 2, gitignore: false });
    expect(r.matches).toBe(2);
    expect(r.truncated).toBe(true);
    expect(r.output).toContain("capped at 2");
    const f = searchCode(root, "foo", { filesOnly: true, caseSensitive: true });
    expect(f.output).toContain("a.ts (");
    expect(f.output).not.toContain("a.ts:");
    expect(f.filesMatched).toBeGreaterThan(1);
  });
  test("context lines", () => {
    const r = searchCode(path.join(root, "src/b.js"), "other", { context: 1 });
    expect(r.output).toContain("b.js:2: let other = 1;");
    expect(r.output).toContain("b.js-1- let foo = 'x';");
    expect(r.output).toContain("b.js-3- let foo2 = 2;");
  });
  test("single file target and no match", () => {
    expect(searchCode(path.join(root, "a.ts"), "Foo", { caseSensitive: true }).matches).toBe(1);
    expect(searchCode(root, "zzzzqqq").output).toBe("(No matches found)");
  });
  test("bunNativeRipgrep wrapper keeps working", () => {
    const r = bunNativeRipgrep(root, "foo", { caseSensitive: true });
    expect(r.matches).toBeGreaterThan(0);
  });
});

describe("find", () => {
  test("type filters", () => {
    expect(findPaths(root, "src", { type: "dir" }).output).toContain("[DIR]");
    expect(findPaths(root, "src", { type: "file" }).output).toContain("b.js");
    expect(findPaths(root, "^src$", { type: "file" }).output).toContain("No matching");
  });
  test("hidden, gitignore and globs", () => {
    expect(findPaths(root, "secret").output).toContain("No matching");
    expect(findPaths(root, "secret", { hidden: true }).output).toContain("secret.txt");
    expect(findPaths(root, "skip", { gitignore: true }).output).toContain("No matching");
    expect(findPaths(root, "b", { include: "*.js" }).output).toContain("b.js");
  });
  test("cap and invalid regex", () => {
    const r = findPaths(root, ".", { maxResults: 1, hidden: true });
    expect(r.matches).toBe(1);
    expect(r.truncated).toBe(true);
    expect(findPaths(root, "(").output).toContain("[Invalid Regex]");
  });
});

describe("replace", () => {
  test("dry run previews and does not write", () => {
    const before = fs.readFileSync(path.join(root, "a.ts"), "utf-8");
    const r = replaceInFiles(root, "foo", "BAR", { dryRun: true, caseSensitive: true, gitignore: true });
    expect(r.output).toContain("[DRY RUN PREVIEW]");
    expect(r.output).toContain("- const foo = 2;");
    expect(r.output).toContain("+ const BAR = 2;");
    expect(fs.readFileSync(path.join(root, "a.ts"), "utf-8")).toBe(before);
  });
  test("literal mode treats $ and regex chars literally", () => {
    w("lit.txt", "price (a) and a.b\n");
    replaceInFiles(path.join(root, "lit.txt"), "(a)", "$1$&", { dryRun: false, fixed: true, caseSensitive: true });
    expect(fs.readFileSync(path.join(root, "lit.txt"), "utf-8")).toBe("price $1$& and a.b\n");
  });
  test("regex mode supports capture groups, whole word, backup and include", () => {
    w("re.txt", "foo foobar foo\n");
    w("re.md", "foo\n");
    const r = replaceInFiles(root, "(f)oo", "$1_", { dryRun: false, wholeWord: true, caseSensitive: true, include: "re.txt", backup: true });
    expect(r.replacements).toBe(2);
    expect(fs.readFileSync(path.join(root, "re.txt"), "utf-8")).toBe("f_ foobar f_\n");
    expect(fs.readFileSync(path.join(root, "re.txt.bak"), "utf-8")).toBe("foo foobar foo\n");
    expect(fs.readFileSync(path.join(root, "re.md"), "utf-8")).toBe("foo\n");
  });
  test("skips binary files, rejects empty and invalid patterns", () => {
    w("bindir/bin.dat", Buffer.from([102, 111, 111, 0, 1, 2]));
    w("bindir/t.txt", "foo\n");
    replaceInFiles(path.join(root, "bindir"), "foo", "x", { dryRun: false, caseSensitive: true });
    expect(fs.readFileSync(path.join(root, "bindir/bin.dat"))[0]).toBe(102);
    expect(fs.readFileSync(path.join(root, "bindir/t.txt"), "utf-8")).toBe("x\n");
    expect(replaceInFiles(root, "", "x", { dryRun: true }).output).toContain("empty");
    expect(replaceInFiles(root, "(", "x", { dryRun: true }).output).toContain("[Invalid Regex]");
    expect(replaceInFiles(path.join(root, "nope"), "a", "b", { dryRun: true }).output).toContain("does not exist");
  });
});

describe("trash with undo", () => {
  test("trash then undo restores the file", () => {
    const trashDir = path.join(root, "_trash");
    w("victim/file.txt", "keep me");
    const victim = path.join(root, "victim");
    const t = trashPath(victim, trashDir);
    expect(t.success).toBe(true);
    expect(fs.existsSync(victim)).toBe(false);
    expect(getLastTrash()).not.toBeNull();
    const u = undoLastTrash();
    expect(u.success).toBe(true);
    expect(fs.readFileSync(path.join(victim, "file.txt"), "utf-8")).toBe("keep me");
    expect(undoLastTrash().success).toBe(false);
  });
  test("refuses protected paths and missing targets; undo won't overwrite", () => {
    expect(trashPath(process.cwd(), path.join(root, "_t2")).success).toBe(false);
    expect(trashPath(path.join(root, "missing"), path.join(root, "_t2")).output).toContain("does not exist");
    w("dup.txt", "one");
    const p = path.join(root, "dup.txt");
    trashPath(p, path.join(root, "_t3"));
    w("dup.txt", "two");
    const u = undoLastTrash();
    expect(u.success).toBe(false);
    expect(u.output).toContain("already exists");
  });
});

describe("misc helpers", () => {
  test("clampInt, formatBytes, buildMatcher", () => {
    expect(clampInt("abc", 1, 10, 5)).toBe(5);
    expect(clampInt("99", 1, 10, 5)).toBe(10);
    expect(clampInt("-4", 1, 10, 5)).toBe(1);
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(buildMatcher("a.c", { fixed: true }).test("abc")).toBe(false);
    expect(buildMatcher("a.c", { fixed: true }).test("a.c")).toBe(true);
  });
});

describe("DevTools Studio GUI", () => {
  const make = () => createOmnitoolStudio({ fullscreen: false });

  test("renders the new controls", () => {
    const html = make().generateHtml();
    for (const id of ["btn_browse_folder", "btn_browse_target_file", "txt_include", "txt_max", "txt_context", "dd_fd_type", "chk_word", "chk_fixed", "chk_hidden", "chk_gitignore", "chk_files_only", "chk_backup", "btn_copy_results", "btn_save_results", "btn_undo_trash"]) {
      expect(html).toContain(id);
    }
  });

  test("ripgrep honours options from the form", async () => {
    const win = make();
    win.setValue("dd_mode", "1. Ripgrep (rg) - Code Search");
    win.setValue("txt_search_path", root);
    win.setValue("txt_pattern", "foo");
    win.setValue("chk_case", true);
    win.setValue("chk_word", true);
    win.setValue("txt_include", "*.ts");
    await trigger(win, "btn_run_omni");
    const out = String(win.getValue("txt_results"));
    expect(out).toContain("a.ts:2:");
    expect(out).not.toContain("foobar");
    expect(out).not.toContain("b.js");
    expect(String(win.getValue("omni_console"))).toContain("[Ripgrep Native]");
  });

  test("fd honours the type dropdown", async () => {
    const win = make();
    win.setValue("dd_mode", "2. Fd (fd) - File & Directory Finder");
    win.setValue("txt_search_path", root);
    win.setValue("txt_pattern", "src");
    win.setValue("dd_fd_type", "Folders only");
    await trigger(win, "btn_run_omni");
    expect(String(win.getValue("txt_results"))).toContain("[DIR]");
  });

  test("sd dry run is the default and previews changes", async () => {
    const win = make();
    win.setValue("dd_mode", "3. Sd (sd) - Regex Find & Replace");
    win.setValue("txt_search_path", root);
    win.setValue("txt_pattern", "other");
    win.setValue("txt_replace", "THING");
    await trigger(win, "btn_run_omni");
    expect(String(win.getValue("txt_results"))).toContain("[DRY RUN PREVIEW]");
    expect(fs.readFileSync(path.join(root, "src/b.js"), "utf-8")).toContain("other");
  });

  test("a missing target path toasts instead of running", async () => {
    const win = make();
    win.setValue("txt_search_path", path.join(root, "does-not-exist"));
    win.setValue("txt_results", "untouched");
    await trigger(win, "btn_run_omni");
    expect(String(win.getValue("txt_results"))).toBe("untouched");
  });

  test("copy / save / clear / undo handlers", async () => {
    const win = make();
    win.setValue("txt_results", "");
    await trigger(win, "btn_copy_results");
    await trigger(win, "btn_save_results");
    await trigger(win, "btn_undo_trash");
    win.setValue("txt_results", "hello");
    await trigger(win, "btn_copy_results");
    await trigger(win, "btn_clear_out");
    expect(String(win.getValue("txt_results"))).toBe("");
  });
});
