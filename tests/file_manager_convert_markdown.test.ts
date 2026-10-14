/**
 * Markdown to a web page: Bun's renderer is used for the Convert action when it is richer than the built-in one,
 * but only behind the safety checks (raw HTML as text, safe addresses only, nothing unexpected in the result), with
 * the built-in renderer as the fallback.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { startConvert } from "../src/features/filemanager/fmBatch";
import { onlyExpectedMarkup, renderMarkdownPage, sanitizeRenderedHtml } from "../src/features/filemanager/fmConvMarkdown";
import { markdownToHtml, safeUrl } from "../src/features/filemanager/fmConvText";
import { createContext } from "../src/features/filemanager/fmCore";

const root = mkdtempSync(join(tmpdir(), "fm-md-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const body = (page: string) => /<body>\n([\s\S]*)\n<\/body>/.exec(page)![1]!;

describe("what Bun's renderer does better than the built-in one", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["nested lists", "- a\n- b\n  - nested\n", /<li>b\n<ul>\n<li>nested<\/li>/],
    ["a heading underlined with dashes", "Title\n=====\n\nSub\n---\n", /<h2 id="sub">Sub<\/h2>/],
    ["reference-style links", "[docs][1]\n\n[1]: https://example.com/docs \"Docs\"\n", /<a href="https:\/\/example.com\/docs" rel="noopener noreferrer" title="Docs">docs<\/a>/],
    ["web addresses become links", "see https://example.com/a?b=c and me@example.com", /<a href="https:\/\/example.com\/a\?b=c" rel="noopener noreferrer">https:\/\/example.com\/a\?b=c<\/a>.*<a href="mailto:me@example.com"/],
    ["tables with alignment", "| a | b |\n|:--|--:|\n| 1 | 2 |\n", /<th align="left">a<\/th><th align="right">b<\/th>/],
    ["task lists", "- [x] done\n- [ ] todo\n", /<input type="checkbox" class="task-list-item-checkbox" disabled checked>done/],
    ["strikethrough", "~~gone~~", /<del>gone<\/del>/],
    ["code fences keep the language", "```ts\nconst a = 1 < 2;\n```\n", /<pre><code class="language-ts">const a = 1 &lt; 2;\n<\/code><\/pre>/],
    ["numbered lists keep their start", "3. three\n4. four\n", /<ol start="3">/],
  ];
  for (const [name, md, pattern] of cases) {
    test(name, () => {
      const r = renderMarkdownPage(md, "t");
      expect(r.engine).toBe("bun");
      expect(body(r.html)).toMatch(pattern);
    });
  }

  test("the built-in renderer is simpler: it flattens nested lists and has no reference links (why Bun's is preferred)", () => {
    expect(markdownToHtml("- a\n- b\n  - nested\n", "t").fragment).not.toContain("<ul>\n<li>nested");
    expect(markdownToHtml("[docs][1]\n\n[1]: https://example.com\n", "t").fragment).not.toContain("<a ");
  });

  test("the page names itself after the first heading, declares UTF-8 and forbids scripts", () => {
    const page = renderMarkdownPage("# Héllo *there*\n\nbody", "fallback").html;
    expect(page).toContain("<title>Héllo <em>there</em></title>".replace("<em>", "").replace("</em>", ""));
    expect(page).toContain('<meta charset="utf-8">');
    expect(page).toContain("default-src 'none'");
    expect(page).not.toContain("<script");
    expect(renderMarkdownPage("no heading", "My File").html).toContain("<title>My File</title>");
  });

  test("a byte-order mark and Windows line endings are fine", () => {
    expect(body(renderMarkdownPage("\ufeff# T\r\n\r\n- a\r\n- b\r\n", "t").html)).toMatch(/<h1 id="t">T<\/h1>\n<ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul>/);
  });
});

describe("everything that could run code is made harmless", () => {
  const attacks = [
    "<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "[x](javascript:alert(1))", "[x](JaVaScRiPt:alert(1))", "[x](<java&#9;script:alert(1)>)", "[x](jav&#x61;script:alert(1))", "[x]( java\nscript:alert(1))",
    "![x](javascript:alert(1))", "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)", "![x](data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+)", "[x](vbscript:msgbox)", "[x](file:///etc/passwd)",
    "<a href=\"javascript:alert(1)\">x</a>", "<iframe src=//evil></iframe>", "**<b onmouseover=alert(1)>x</b>**", "`</code><script>`", "[a](https://ok.example)\"onclick=\"alert(1)", "<javascript:alert(1)>",
    "[ref]\n\n[ref]: javascript:alert(1)", "<div onclick=\"x()\">block</div>", "<style>body{display:none}</style>", "[x](https://a.b \"t\" onmouseover=\"alert(1)\")", "![a\" onerror=\"alert(1)](https://x.y/i.png)",
    "[x](//evil.example/a)", "<!-- comment --><svg onload=alert(1)>", "text <b>inline</b> <u>u</u> <math><mi>x</mi></math>", "* * *\n\n<object data=x></object>", "&lt;script&gt;alert(1)&lt;/script&gt; &#60;script&#62;",
  ];
  for (const attack of attacks) {
    test(JSON.stringify(attack).slice(0, 60), () => {
      const r = renderMarkdownPage(attack, "t");
      const out = body(r.html);
      expect(onlyExpectedMarkup(out), out).toBe(true);
      expect(out).not.toMatch(/(?:href|src)="\s*(?:javascript|vbscript|data:text|file:)/i);
      // every address the page keeps passes the same check the renderer uses
      for (const m of out.matchAll(/(?:href|src)="([^"]*)"/g)) expect(safeUrl(m[1]!.replace(/&amp;/g, "&"), true), m[1]).not.toBeNull();
      // typed code is shown as text (&lt;...&gt;), so a real tag is only ever one the renderer wrote itself
      for (const tag of out.match(/<[a-z][^<>]*>/gi) ?? []) expect(tag, out).not.toMatch(/^<(?:script|iframe|style|object|svg|math)\b/i);
      expect(r.html).not.toContain("<script");
    });
  }

  test("safe addresses are kept, with rel=noopener noreferrer on links, and the unsafe ones lose their address", () => {
    const out = body(renderMarkdownPage("[a](https://ok.example/x?y=1&z=2) [b](mailto:a@b.c) [c](../rel.md) [d](#top) [e](javascript:alert(1)) ![i](pic.png) ![j](data:image/png;base64,AAAA) ![k](data:image/svg+xml;base64,AAAA)", "t").html);
    expect(out).toContain('<a href="https://ok.example/x?y=1&amp;z=2" rel="noopener noreferrer">a</a>');
    expect(out).toContain('<a href="mailto:a@b.c" rel="noopener noreferrer">b</a>');
    expect(out).toContain('<a href="../rel.md" rel="noopener noreferrer">c</a>');
    expect(out).toContain('<a href="#top" rel="noopener noreferrer">d</a>');
    expect(out).toContain("<a>e</a>");
    expect(out).toContain('<img src="pic.png" alt="i" />');
    expect(out).toContain('<img src="data:image/png;base64,AAAA" alt="j" />');
    expect(out).toContain('<img alt="k" />');
  });

  test("the sanitizer and the markup check on their own", () => {
    expect(sanitizeRenderedHtml('<a href="javascript:x">y</a><img src="vbscript:z" alt="q" />')).toBe('<a>y</a><img alt="q" />');
    expect(onlyExpectedMarkup("<p>fine <a href=\"x\">link</a><br /></p>")).toBe(true);
    for (const bad of ["<script>x</script>", '<p onclick="x">a</p>', "<iframe></iframe>", '<a href="x" style="y">a</a>', "<p>a < b</p>", "<svg onload=x>"]) expect(onlyExpectedMarkup(bad), bad).toBe(false);
  });
});

describe("the fallback", () => {
  test("when Bun's renderer is missing, throws, or writes anything unexpected, the built-in renderer is used", () => {
    const md = (Bun as any).markdown;
    try {
      for (const fake of [undefined, { html: () => { throw new Error("boom"); } }, { html: () => "<p>ok</p><script>alert(1)</script>" }, { html: () => '<p onclick="x">a</p>' }, { html: () => 5 }]) {
        (Bun as any).markdown = fake;
        const r = renderMarkdownPage("# Title\n\nhello", "t");
        expect(r.engine).toBe("builtin");
        expect(body(r.html)).toContain("<h1>Title</h1>");
        expect(r.html).not.toContain("<script");
      }
    } finally {
      (Bun as any).markdown = md;
    }
    expect(renderMarkdownPage("x", "t").engine).toBe("bun");
  });
});

(process.platform === "win32" ? describe.skip : describe)("through the Convert window", () => {
  const work = join(root, "home", "Docs");
  const ctx = createContext({ platform: "darwin", home: join(root, "home"), dataDir: join(root, "data"), toolDirs: [join(root, "no-tools")] });
  beforeAll(() => mkdirSync(work, { recursive: true }));

  test("a .md file becomes a .html page (when pandoc is not installed, this renderer does it) with nested lists and tables; the note says what is made safe", async () => {
    writeFileSync(join(work, "readme.md"), "# Project\n\n- a\n  - nested\n\n| h | i |\n|---|---|\n| 1 | 2 |\n\n[bad](javascript:alert(1)) and <script>alert(1)</script>\n");
    const done = await ctx.jobs.whenDone((await startConvert(ctx, { action: "doc-html", paths: [join(work, "readme.md")] })).id);
    expect(done.state).toBe("done");
    expect(done.outputs).toEqual([join(work, "readme.html")]);
    const html = readFileSync(join(work, "readme.html"), "utf8");
    expect(html).toContain("<title>Project</title>");
    expect(html).toContain("<ul>\n<li>nested</li>");
    expect(html).toContain("<table>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(done.steps[0]!.message).toContain("Raw HTML in the Markdown is shown as text");
    expect(done.steps[0]!.message).not.toContain("built-in renderer was used");
  });
});
