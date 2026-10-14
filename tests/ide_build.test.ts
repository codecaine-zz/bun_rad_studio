import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { OUTPUT, PARTS_DIR, buildIdeHtml, listParts, main } from "../scripts/build_ide.ts";
import { getIdeHtml } from "../index.ts";

const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("The designer page is built from src/ide/", () => {
  test("src/ide.html is exactly what the parts produce (edit the parts, then run bun run ide:build)", () => {
    expect(lf(readFileSync(OUTPUT, "utf8"))).toBe(lf(buildIdeHtml()));
  });

  test("getIdeHtml serves the built page, with only the default form filled in", () => {
    const [before, after, ...rest] = lf(buildIdeHtml()).split("__SPEC_JSON__");
    expect(rest).toEqual([]);
    const served = lf(getIdeHtml());
    expect(served.startsWith(before!)).toBe(true);
    expect(served.endsWith(after!)).toBe(true);
    expect(served).not.toContain("__SPEC_JSON__");
  });

  test("parts are ordered by their number, so 100_ comes after 20_ and the end part comes last", () => {
    const parts = listParts();
    const numbers = parts.map((p) => parseInt(p, 10));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(parts[0]).toMatch(/^00_head/);
    expect(parts.at(-1)).toMatch(/^\d+_end\.html$/);
    expect(parts.indexOf("100_selection.js")).toBeGreaterThan(parts.indexOf("20_keyboard_and_dialogs.js"));
    const html = lf(buildIdeHtml());
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html.indexOf("</script>\n</body>")).toBeGreaterThan(html.indexOf("function triggerRunForm"));
  });

  test("the script parts join into one script that parses", () => {
    const html = lf(buildIdeHtml());
    const start = html.indexOf("\t<script>\n") + "\t<script>\n".length;
    const script = html.slice(start, html.lastIndexOf("\t</script>"));
    expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(script)).not.toThrow();
  });

  test("every part is non-empty and a script part never contains a closing script tag", () => {
    for (const name of listParts()) {
      const text = readFileSync(join(PARTS_DIR, name), "utf8");
      expect(text.length, name).toBeGreaterThan(0);
      if (name.endsWith(".js")) expect(text.toLowerCase(), name).not.toContain("</script>");
    }
  });
});

describe("scripts/build_ide.ts", () => {
  const dirs: string[] = [];
  afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
  const temp = () => {
    const d = mkdtempSync(join(tmpdir(), "ide-parts-"));
    dirs.push(d);
    return d;
  };

  test("listParts sorts by number, not alphabetically", () => {
    const d = temp();
    for (const n of ["100_c.js", "20_b.js", "05_a.html", "999_end.html", "99_x.js"]) writeFileSync(join(d, n), "x");
    expect(listParts(d)).toEqual(["05_a.html", "20_b.js", "99_x.js", "100_c.js", "999_end.html"]);
  });

  test("a stray or badly named file, or a repeated number, is an error", () => {
    const a = temp();
    writeFileSync(join(a, "10_a.js"), "x");
    writeFileSync(join(a, "notes.txt"), "x");
    expect(() => listParts(a)).toThrow("Unexpected file");
    const b = temp();
    writeFileSync(join(b, "10_a.js"), "x");
    writeFileSync(join(b, "10_b.js"), "y");
    expect(() => listParts(b)).toThrow("share a number");
  });

  test("building concatenates the parts exactly", () => {
    const d = temp();
    mkdirSync(join(d, ".hidden"), { recursive: true });
    writeFileSync(join(d, "1_a.html"), "A\n");
    writeFileSync(join(d, "2_b.js"), "B\n");
    expect(buildIdeHtml(d)).toBe("A\nB\n");
  });

  test("--check passes now, and fails with a helpful message when src/ide.html is edited by hand", () => {
    expect(main(["--check"])).toBe(0);
    const original = readFileSync(OUTPUT, "utf8");
    const errors: string[] = [];
    const realError = console.error;
    console.error = (m: string) => errors.push(String(m));
    try {
      writeFileSync(OUTPUT, original + "\n// hand edit\n");
      expect(main(["--check"])).toBe(1);
      expect(errors.join("\n")).toContain("bun run ide:build");
    } finally {
      console.error = realError;
      writeFileSync(OUTPUT, original);
    }
    expect(main(["--check"])).toBe(0);
  });
});
