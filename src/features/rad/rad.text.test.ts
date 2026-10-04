import { describe, expect, test } from "bun:test";
import { colorutils, diffutils, htmlutils, regexutils, strutils, templateutils } from "./index.ts";

describe("rad text: strutils", () => {
  test("word splitting and case conversion", () => {
    expect(strutils.words("parseHTTPResponse_v2 code")).toEqual(["parse", "HTTP", "Response", "v2", "code"]);
    expect(strutils.toSnakeCase("XMLHttpRequest")).toBe("xml_http_request");
    expect(strutils.toCamelCase("helloWorld")).toBe("helloWorld");
    expect(strutils.toConstantCase("maxRetryCount")).toBe("MAX_RETRY_COUNT");
    expect(strutils.toDotCase("App Server Port")).toBe("app.server.port");
    expect(strutils.toSentenceCase("userAccountId")).toBe("User account id");
    expect(strutils.capitalize("bun rocks")).toBe("Bun rocks");
    expect(strutils.uncapitalize("Bun")).toBe("bun");
    expect(strutils.slugify("Crème Brûlée & Co!")).toBe("creme-brulee-co");
    expect(strutils.slugify("Hello World", { separator: "_", maxLength: 7 })).toBe("hello_w");
  });

  test("similarity, did-you-mean, fuzzy search", () => {
    expect(strutils.similarity("night", "nacht")).toBeCloseTo(0.6);
    expect(strutils.closestMatch("stauts", ["status", "start", "stop"])).toBe("status");
    expect(strutils.closestMatch("zzzzzz", ["status"])).toBeNull();
    expect(strutils.fuzzyScore("gco", "git checkout")).not.toBeNull();
    expect(strutils.fuzzyScore("xyz", "git checkout")).toBeNull();
    const hits = strutils.fuzzySearch("dep", [{ n: "test" }, { n: "deploy" }, { n: "dev-prep" }], (x) => x.n);
    expect(hits[0]!.item.n).toBe("deploy");
    expect(hits.map((h) => h.item.n)).not.toContain("test");
  });

  test("truncation, wrapping, layout", () => {
    expect(strutils.truncateWords("The quick brown fox", 15)).toBe("The quick...");
    expect(strutils.truncateMiddle("/very/long/path/to/file.ts", 16)).toBe("/very/lo…file.ts");
    expect(strutils.wordWrap("The quick brown fox", 10)).toBe("The quick\nbrown fox");
    expect(strutils.wordWrap("a\n\nb", 80, { preserveNewlines: true, indent: "> " })).toBe("> a\n> \n> b");
    expect(strutils.wordWrap("abcdefghij", 4, { breakLongWords: true })).toBe("abcd\nefgh\nij");
    expect(strutils.dedent("\n    a\n      b\n")).toBe("a\n  b");
    expect(strutils.indent("a\nb", 2)).toBe("  a\n  b");
    expect(strutils.normalizeWhitespace("  a \n\t b ")).toBe("a b");
    expect(strutils.isBlank("  \n")).toBe(true);
    expect(strutils.padCenter("hi", 6, "*")).toBe("**hi**");
  });

  test("misc helpers", () => {
    expect(strutils.countOccurrences("banana", "an")).toBe(2);
    expect(strutils.ensurePrefix("api/users", "/")).toBe("/api/users");
    expect(strutils.ensureSuffix("dir/", "/")).toBe("dir/");
    expect(strutils.removePrefix("v1.2.3", "v")).toBe("1.2.3");
    expect(strutils.removeSuffix("report.json", ".json")).toBe("report");
    expect(strutils.graphemes("👍🏽a")).toEqual(["👍🏽", "a"]);
    expect(strutils.reverse("añb👍🏽")).toBe("👍🏽bña");
    expect(strutils.displayWidth("日本")).toBe(4);
    expect(strutils.stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
    expect(strutils.pluralize(1, "file")).toBe("1 file");
    expect(strutils.pluralize(3, "child", "children")).toBe("3 children");
    expect([1, 2, 3, 4, 11, 12, 13, 22, 101].map(strutils.ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "22nd", "101st"]);
    expect(strutils.initials("Ada King Lovelace")).toBe("AK");
    expect(strutils.maskString("sk_live_abcdef123456", 8, 4)).toBe("sk_live_********3456");
    expect(strutils.randomString(32, "01")).toMatch(/^[01]{32}$/);
    expect(strutils.randomAlphanumeric(40)).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(() => strutils.randomString(4, "")).toThrow("[strutils.randomString]");
  });
});

describe("rad text: regexutils", () => {
  test("stateless matching with /g regexes", () => {
    const re = /\d+/g;
    expect(regexutils.isMatch(re, "a1")).toBe(true);
    expect(regexutils.isMatch(re, "a1")).toBe(true);
    expect(re.lastIndex).toBe(0);
    expect(regexutils.findFirst(/\d+/, "v42")).toBe("42");
    expect(regexutils.countMatches(/o/, "foo boo")).toBe(4);
  });

  test("detailed matches, groups, replacements", () => {
    expect(regexutils.matchAll(/(\w)=(\d)/, "a=1 b=2").map((m) => m.captures)).toEqual([["a", "1"], ["b", "2"]]);
    expect(regexutils.matchFirst(/(\d+)px/, "w: 12px")).toEqual({ match: "12px", index: 3, captures: ["12"], groups: {} });
    expect(regexutils.extractGroups(/(?<major>\d+)\.(?<minor>\d+)/, "v3.14")).toEqual({ major: "3", minor: "14" });
    expect(regexutils.findNamedGroups(/(?<k>\w+)=(?<v>\w+)/, "a=1 b=2")).toEqual([{ k: "a", v: "1" }, { k: "b", v: "2" }]);
    expect(regexutils.replace(/\d+/, "1 2", (m) => String(+m * 10))).toBe("10 20");
    expect(regexutils.replaceFirst(/a/g, "aaa", "b")).toBe("baa");
    expect(regexutils.split(/ ?, ?/, "a , b,c")).toEqual(["a", "b", "c"]);
  });

  test("escaping, validation, patterns, alternation", () => {
    expect(regexutils.escapeRegExp("1+1=2?")).toBe("1\\+1=2\\?");
    expect(regexutils.literal("a.b").test("axb")).toBe(false);
    expect(regexutils.isValidRegex("(unclosed")).toBe(false);
    expect(regexutils.tryRegex("[a-z]+", "i")?.flags).toBe("i");
    expect(() => regexutils.findAll("(bad", "x")).toThrow("[regexutils] Invalid pattern");
    expect(regexutils.matchesPattern("email", "a@b.co")).toBe(true);
    expect(regexutils.matchesPattern("uuid", crypto.randomUUID())).toBe(true);
    expect(regexutils.matchesPattern("semver", "1.2.3-beta.1")).toBe(true);
    expect(regexutils.matchesPattern("ipv4", "256.1.1.1")).toBe(false);
    expect(regexutils.anyOf(["c.t", /dogs?/]).test("dogs")).toBe(true);
    expect(regexutils.anyOf(["c.t"]).test("cat")).toBe(false);
  });
});

describe("rad text: templateutils", () => {
  test("paths, fallbacks, filters, escaping", () => {
    expect(templateutils.renderTemplate("Hi {{ user.name | upper }}!", { user: { name: "ada" } })).toBe("Hi ADA!");
    expect(templateutils.renderTemplate("Hello {{name | User}}!", {})).toBe("Hello User!");
    expect(templateutils.renderTemplate('{{ name | "Guest" | upper }}', {})).toBe("GUEST");
    expect(templateutils.renderTemplate("{{items.1}}", { items: ["a", "b"] })).toBe("b");
    expect(templateutils.renderTemplate("<b>{{bio}}</b>{{{raw}}}", { bio: "<script>", raw: "<i>ok</i>" }, { escape: true })).toBe("<b>&lt;script&gt;</b><i>ok</i>");
    expect(templateutils.renderTemplate("{{x | shout}}", { x: "hey" }, { filters: { shout: (v) => `${v}!` } })).toBe("hey!");
    expect(templateutils.renderTemplate("{{ hello world! }}", {})).toBe("{{ hello world! }}");
    expect(templateutils.renderTemplate("{{missing}}", {}, { missing: "keep" })).toBe("{{missing}}");
    expect(() => templateutils.renderTemplate("{{missing}}", {}, { missing: "throw" })).toThrow('Missing variable "missing"');
  });

  test("blocks and compilation", () => {
    const tpl = "{{#each xs}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}";
    expect(templateutils.renderTemplate(tpl, { xs: [1, 2, 3] })).toBe("1, 2, 3");
    expect(templateutils.renderTemplate("{{#each xs}}x{{else}}none{{/each}}", { xs: [] })).toBe("none");
    expect(templateutils.renderTemplate("{{#if admin}}A{{else}}U{{/if}}", { admin: false })).toBe("U");
    expect(templateutils.renderTemplate("{{#each users}}{{@index}}:{{name}}@{{org}} {{/each}}", { org: "bun", users: [{ name: "a" }, { name: "b" }] })).toBe("0:a@bun 1:b@bun ");
    expect(templateutils.renderTemplate("{{#each m}}{{@key}}={{this}};{{/each}}", { m: { a: 1, b: 2 } })).toBe("a=1;b=2;");
    expect(() => templateutils.compileTemplate("{{#if x}}open")).toThrow("Unclosed");
    const greet = templateutils.compileTemplate("Hello {{name}}!");
    expect([greet({ name: "Ada" }), greet({ name: "Linus" })]).toEqual(["Hello Ada!", "Hello Linus!"]);
    expect(templateutils.templateVariables("{{a}} {{#each b}}{{this.c}}{{/each}} {{a}}")).toEqual(["a", "b"]);
  });

  test("markdown to ANSI keeps content", () => {
    const out = strutils.stripAnsi(templateutils.renderMarkdownAnsi("# Release\n- [x] tests\n1. one\n> quote **bold**\n[Bun](https://bun.sh)\n---"));
    for (const s of ["Release", "☑ tests", "1. one", "│ quote bold", "Bun (https://bun.sh)", "─"]) expect(out).toContain(s);
  });
});

describe("rad text: colorutils", () => {
  test("parsing and conversions", () => {
    expect(colorutils.parseColor("hsl(120 100% 50% / 0.5)")).toEqual({ r: 0, g: 255, b: 0, a: 0.502 });
    expect(colorutils.parseColor("rebeccapurple")).toEqual({ r: 102, g: 51, b: 153, a: 1 });
    expect(() => colorutils.parseColor("nope")).toThrow("[colorutils.parseColor]");
    expect(colorutils.isValidColor("tomato")).toBe(true);
    expect(colorutils.rgbToHex({ r: 255, g: 0, b: 0, a: 0.5 }, true)).toBe("#ff000080");
    expect(colorutils.toCssRgb({ r: 1, g: 2, b: 3, a: 0.5 })).toBe("rgba(1, 2, 3, 0.5)");
    expect(colorutils.toCssHsl({ h: 210, s: 0.5, l: 0.4 })).toBe("hsl(210 50% 40%)");
    expect(colorutils.rgbToHsv({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 1, v: 1 });
    expect(colorutils.hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 });
    expect(colorutils.rgbToLab({ r: 255, g: 255, b: 255 }).l).toBeCloseTo(100, 0);
    expect(colorutils.deltaE({ r: 255, g: 0, b: 0 }, { r: 250, g: 0, b: 0 })).toBeLessThan(3);
  });

  test("manipulation, palettes, accessibility", () => {
    expect(colorutils.rotateHue({ r: 255, g: 0, b: 0 }, 120)).toEqual({ r: 0, g: 255, b: 0 });
    expect(colorutils.complement({ r: 255, g: 0, b: 0 })).toEqual({ r: 0, g: 255, b: 255 });
    expect(colorutils.invertColor({ r: 0, g: 0, b: 0 })).toEqual({ r: 255, g: 255, b: 255 });
    expect(colorutils.grayscale({ r: 255, g: 0, b: 0 })).toEqual({ r: 54, g: 54, b: 54 });
    expect(colorutils.mix({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5)).toEqual({ r: 128, g: 128, b: 128 });
    expect(colorutils.desaturate({ r: 255, g: 0, b: 0 }, 1)).toEqual({ r: 128, g: 128, b: 128 });
    expect(colorutils.gradient({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 3)[1]).toEqual({ r: 128, g: 128, b: 128 });
    expect(colorutils.shades({ r: 52, g: 152, b: 219 }, 5)).toHaveLength(5);
    expect(colorutils.harmony({ r: 255, g: 0, b: 0 }, "triadic")).toHaveLength(3);
    expect(colorutils.bestTextColor({ r: 52, g: 152, b: 219 })).toEqual({ r: 0, g: 0, b: 0 });
    expect(colorutils.bestTextColor({ r: 20, g: 20, b: 60 })).toEqual({ r: 255, g: 255, b: 255 });
    expect(colorutils.isLight({ r: 250, g: 250, b: 210 })).toBe(true);
    expect(colorutils.isAccessible({ r: 118, g: 118, b: 118 }, { r: 255, g: 255, b: 255 }, "AA-large")).toBe(true);
    expect(strutils.stripAnsi(colorutils.gradientText("BUN", "#f472b6", "#60a5fa"))).toBe("BUN");
    expect(colorutils.fgColor("x", "red")).toContain("38;2;255;0;0");
  });
});

describe("rad text: htmlutils", () => {
  const page = `<!doctype html><html lang="en"><head><title>Bun &amp; Co</title>
    <meta name="description" content="Fast JS"><meta property="og:type" content="website">
    <link rel="canonical" href="https://bun.sh/"></head>
    <body><h1>Hello</h1><h2 class="sub">World</h2><p>Read <a href="/docs" rel="next">the <b>docs</b></a>.</p>
    <img src="/logo.png" alt="Logo"><script>var x = "<p>no</p>";</script></body></html>`;

  test("entity decoding and text extraction", () => {
    expect(htmlutils.unescapeHtml("&lt;b&gt;Tom &amp; Jerry&#x27;s&lt;/b&gt; &#169; &bogus;")).toBe("<b>Tom & Jerry's</b> © &bogus;");
    expect(htmlutils.unescapeHtml("&amp;lt;")).toBe("&lt;");
    expect(htmlutils.htmlToText("<h1>Hi</h1><p>a&nbsp;b</p><ul><li>x</li></ul>")).toBe("Hi\n\na b\n\n• x");
    expect(htmlutils.htmlToText(page)).not.toContain("no");
    expect(htmlutils.parseAttributes('<input type="checkbox" checked data-id=7>')).toEqual({ type: "checkbox", checked: "", "data-id": "7" });
  });

  test("HTMLRewriter-powered scraping", () => {
    expect(htmlutils.selectAll(page, "h2.sub")).toEqual([{ tag: "h2", attrs: { class: "sub" }, text: "World" }]);
    expect(htmlutils.selectFirst(page, "title")?.text).toBe("Bun & Co");
    expect(htmlutils.extractLinks(page, "https://bun.sh")).toEqual([{ href: "https://bun.sh/docs", text: "the docs", rel: "next" }]);
    expect(htmlutils.extractLinks('<a href="https://bun.sh">Bun Runtime</a>')).toEqual([{ href: "https://bun.sh", text: "Bun Runtime" }]);
    expect(htmlutils.extractImages(page)).toEqual([{ src: "/logo.png", alt: "Logo" }]);
    expect(htmlutils.extractHeadings(page)).toEqual([{ level: 1, text: "Hello" }, { level: 2, text: "World" }]);
    const meta = htmlutils.extractMeta(page);
    expect(meta).toEqual({ title: "Bun & Co", description: "Fast JS", canonical: "https://bun.sh/", lang: "en", tags: { description: "Fast JS", "og:type": "website" } });
    expect(htmlutils.getElementById('<div id="a.b">x</div>', "a.b")?.text).toBe("x");
    expect(htmlutils.getElementsByTag("<li>a</li><link><li>b</li>", "li")).toHaveLength(2);
  });

  test("safe generation", () => {
    const items = ["<a>", "b"];
    expect(String(htmlutils.safeHtml`<ul>${items.map((x) => htmlutils.safeHtml`<li>${x}</li>`)}</ul>`)).toBe("<ul><li>&lt;a&gt;</li><li>b</li></ul>");
    expect(String(htmlutils.safeHtml`${null}${false}${htmlutils.rawHtml("<hr>")}`)).toBe("<hr>");
    expect(htmlutils.buildTag("a", { href: "/x?a=1&b=2", target: "_blank", hidden: false }, "Go")).toBe('<a href="/x?a=1&amp;b=2" target="_blank">Go</a>');
    expect(htmlutils.buildTag("input", { disabled: true })).toBe("<input disabled>");
    expect(() => htmlutils.buildTag("a onclick", {})).toThrow("[htmlutils.buildTag]");
  });
});

describe("rad text: diffutils", () => {
  test("generic, word and char diffs", () => {
    expect(diffutils.diffArrays([1, 2, 3], [1, 3, 4])).toEqual([
      { type: "equal", value: 1 },
      { type: "delete", value: 2 },
      { type: "equal", value: 3 },
      { type: "add", value: 4 },
    ]);
    const words = diffutils.diffWords("the cat sat", "the dog sat");
    expect(words.filter((w) => w.type !== "equal")).toEqual([{ type: "delete", value: "cat" }, { type: "add", value: "dog" }]);
    expect(diffutils.diffChars("abc", "abd").filter((c) => c.type !== "equal").map((c) => c.value)).toEqual(["c", "d"]);
    expect(diffutils.diffLines("A\nb", "a\nb", { ignoreCase: true }).every((c) => c.type === "equal")).toBe(true);
    expect(diffutils.diffStats(diffutils.diffLines("a", "b"))).toEqual({ added: 1, deleted: 1, unchanged: 0 });
    expect(diffutils.similarityRatio("a\nb", "a\nc")).toBe(0.5);
  });

  test("unified diff hunks and patch round-trip", () => {
    expect(diffutils.unifiedDiff("alpha\nbeta", "alpha\ngamma", "f.txt")).toBe("--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n alpha\n-beta\n+gamma");
    expect(diffutils.unifiedDiff("same", "same")).toBe("");
    const oldText = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n");
    const newText = oldText.replace("line 3\n", "line three\n").replace("line 25", "line 25 edited") + "\nline 31";
    const patch = diffutils.unifiedDiff(oldText, newText, "big.txt", { context: 2 });
    expect(diffutils.parseUnifiedDiff(patch)).toHaveLength(3);
    expect(diffutils.applyPatch(oldText, patch)).toBe(newText);
    const insertTop = diffutils.unifiedDiff("b\nc", "a\nb\nc", "x", { context: 0 });
    expect(diffutils.applyPatch("b\nc", insertTop)).toBe("a\nb\nc");
    expect(() => diffutils.applyPatch("totally\ndifferent", patch)).toThrow("[diffutils.applyPatch] Hunk 1 mismatch");
  });

  test("terminal renderers keep text", () => {
    expect(strutils.stripAnsi(diffutils.renderInlineDiff("the cat", "the dog"))).toBe("the catdog");
    expect(strutils.stripAnsi(diffutils.renderColoredDiff("+a\n-b"))).toBe("+a\n-b");
  });
});
