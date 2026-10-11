import { test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as o from "../applications/fd_ops";

let d = "";
const P = (n: string) => path.join(d, n);
beforeEach(() => {
  d = fs.mkdtempSync(path.join(os.tmpdir(), "fdops-"));
  fs.writeFileSync(P("My File.TXT"), "hello world\nfoo");
  fs.writeFileSync(P("b.txt"), "hello world\nfoo");
  fs.writeFileSync(P("c.log"), "other");
});
afterEach(() => fs.rmSync(d, { recursive: true, force: true }));

test("create / rename / duplicate / undo", () => {
  const f = o.createFileAt(d, "new.md");
  expect(fs.existsSync(P("new.md"))).toBe(true);
  expect(() => o.createFileAt(d, "a/b")).toThrow();
  const r = o.renamePath(P("c.log"), "c2.log");
  o.undoEntry(r);
  expect(fs.existsSync(P("c.log"))).toBe(true);
  const dup = o.duplicatePath(P("b.txt")) as any;
  expect(path.basename(dup.path)).toBe("b copy.txt");
  o.undoEntry(f);
  expect(fs.existsSync(P("new.md"))).toBe(false);
});

test("batch rename preview, conflicts and apply", () => {
  const ps = [P("My File.TXT"), P("b.txt")];
  const plan = o.planBatchRename(ps, { spacesToUnderscore: true, caseMode: "lower", numbering: true });
  expect(plan.map((p) => p.newName)).toEqual(["my_file_001.TXT", "b_002.txt"]);
  const clash = o.planBatchRename([P("c.log")], { find: "c", replace: "b", suffix: "" });
  expect(clash[0].newName).toBe("b.log");
  const res = o.applyRenamePlan(plan);
  expect(res.done.length).toBe(2);
  expect(fs.existsSync(P("b_002.txt"))).toBe(true);
});

test("content search, duplicates, chmod, hex, exports", () => {
  const all = fs.readdirSync(d).map(P);
  expect(o.searchContents(all, "HELLO").matches.length).toBe(2);
  const dp = o.findDuplicates(all);
  expect(dp.groups.length).toBe(1);
  expect(dp.groups[0].paths.length).toBe(2);
  expect(o.parseMode("rwxr-xr-x")).toBe(0o755);
  expect(o.chmodPath(P("c.log"), "600").after).toBe("600");
  expect(o.hexPreview(P("c.log"), 16)).toContain("6f 74 68 65 72");
  const row = { name: "a|b", type: "file", humanSize: "1 B", relativePath: "a", mtimeStr: "x", permStr: "y" };
  expect(o.toMarkdownTable([row])).toContain("a\\|b");
  expect(o.toTsv([row]).startsWith("Name\t")).toBe(true);
});
