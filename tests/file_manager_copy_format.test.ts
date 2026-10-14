import { describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { MAX_CHARS, capText, extractSection, inlineText, rowsToJson, rowsToMarkdown, rowsToTsv } from "../resources/file_manager/ui/copyformat.js";

// The pure "what text does this block copy as" rules, tried on small pieces of markup (no page, no server).
const make = (html: string): any => {
  const dom = new JSDOM(`<body><div id="root">${html}</div></body>`);
  return dom.window.document.getElementById("root")!;
};
const text = (html: string, options?: any) => extractSection(make(html), options).text;

describe("copy format: plain text", () => {
  test("headings and paragraphs become lines, with a blank line before a heading", () => {
    expect(text("<h3>Git summary</h3><p>Branch: main</p><p>Clean   tree</p><h4>Files</h4><p>none</p>")).toBe("Git summary\nBranch: main\nClean tree\n\nFiles\nnone");
  });

  test("definition lists become Name: value lines", () => {
    const html = "<dl><dt>Size</dt><dd>3 KB</dd><dt>Kind</dt><dd>Text <b>file</b></dd><dt>Empty</dt><dd></dd></dl>";
    expect(text(html)).toBe("Size: 3 KB\nKind: Text file\nEmpty:");
  });

  test("lists keep bullets, numbers and nesting", () => {
    expect(text("<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul><ol><li>first</li><li>second</li></ol>")).toBe("- one\n  - inner\n- two\n1. first\n2. second");
  });

  test("hidden, aria-hidden, data-copy-ui, buttons and skip markers are left out", () => {
    const html = `<p>Visible</p><p hidden>Secret hidden</p><span aria-hidden="true">★</span><button>Click me</button><span data-copy-ui>Copy</span><div data-copy-skip>skip me</div><p style="display: none">gone</p><span aria-hidden="true" data-copy-keep>Label:</span> <b>value</b><script>alert(1)</script><svg><text>vector</text></svg>`;
    expect(text(html)).toBe("Visible\nLabel: value");
  });

  test("pre blocks keep every space and line break", () => {
    const code = "line one\n    indented   with  spaces\n\n\ttabbed\n";
    expect(text(`<pre>${code}</pre>`)).toBe(code);
    expect(text(`<pre>a\r\nb</pre>`)).toBe("a\nb");
    expect(text("<h3>Log</h3><pre>x  y\n  z</pre><p>after</p>")).toBe("Log\nx  y\n  z\n\nafter");
  });

  test("line breaks and trailing spaces are tidied outside pre", () => {
    expect(text("<p>a   <br>  b  </p><div>c </div>")).toBe("a\nb\nc");
  });

  test("the heading can be left out", () => {
    expect(text("<h3>Title</h3><p>Body</p>", { heading: false })).toBe("Body");
    expect(text("<table><caption>Cap</caption><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>", { heading: false })).toBe("A\n1");
  });

  test("read-only fields show their value; other fields stay out, until controls are asked for", () => {
    const html = `<p>Name <input readonly value="shown"></p><input value="typed"><input type="password" readonly value="hunter2"><label><input type="checkbox" checked> Use dark</label><label><input type="checkbox"> Use light</label>`;
    expect(text(html)).toBe("Name shown\nUse dark\nUse light");
    expect(text(html, { controls: true })).toBe("Name shown\ntyped\n[x] Use dark\n[ ] Use light");
    expect(text(`<textarea readonly>two\n  lines</textarea>`)).toBe("two\n  lines");
  });

  test("never writes the words null or undefined", () => {
    const out = extractSection(make("<p></p><table><tr><td></td><td></td></tr></table><dl><dt>A</dt></dl><ul><li></li></ul><pre> </pre>"));
    for (const v of [out.text, out.markdown, out.tsv ?? "", out.json ?? ""]) expect(v).not.toMatch(/null|undefined/);
  });
});

describe("copy format: tables", () => {
  const TABLE = `<table><caption>Results</caption><thead><tr><th scope="col">Name</th><th scope="col">Note</th><th scope="col">Size</th></tr></thead><tbody>
    <tr><th scope="row">a,b</th><td>say "hi"</td><td>1</td></tr>
    <tr><th scope="row">tab\there</th><td></td><td>2</td></tr>
    <tr><td colspan="2">wide cell</td><td>3</td></tr></tbody></table>`;

  test("tab-separated text keeps empty cells, flattens tabs and quotes cells that hold a quote", () => {
    const out = extractSection(make(TABLE));
    expect(out.tsv).toBe('Name\tNote\tSize\na,b\t"say ""hi"""\t1\ntab here\t\t2\nwide cell\t\t3');
    expect(out.tabular).toBe(true);
  });

  test("the plain text of a table is its caption and tab-separated rows", () => {
    expect(extractSection(make(TABLE)).text).toBe('Results\nName\tNote\tSize\na,b\tsay "hi"\t1\ntab here\t\t2\nwide cell\t\t3');
  });

  test("Markdown uses a header row and escapes pipes", () => {
    const html = "<table><thead><tr><th>A</th><th>B|C</th></tr></thead><tbody><tr><td>x|y</td><td>1</td></tr></tbody></table>";
    expect(extractSection(make(html)).markdown).toBe("| A | B\\|C |\n| --- | --- |\n| x\\|y | 1 |");
  });

  test("JSON is an array of objects named by the header; duplicate and empty names are made unique", () => {
    const html = "<table><thead><tr><th>Size</th><th>Size</th><th></th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>";
    expect(JSON.parse(extractSection(make(html)).json!)).toEqual([{ Size: "1", "Size (2)": "2", "Column 3": "3" }]);
  });

  test("a table without a header row is read as plain rows", () => {
    const out = extractSection(make("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>"));
    expect(out.tsv).toBe("a\tb\nc\td");
    expect(JSON.parse(out.json!)).toEqual([{ "Column 1": "a", "Column 2": "b" }, { "Column 1": "c", "Column 2": "d" }]);
    expect(out.markdown).toContain("| Column 1 | Column 2 |");
  });

  test("a header row of th cells is found even without thead", () => {
    const out = extractSection(make("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>"));
    expect(out.tsv).toBe("A\tB\n1\t2");
  });

  test("a two-column table of labels and values is a list of facts", () => {
    const html = `<table><tbody><tr><th scope="row">Name</th><td>photo.jpg</td></tr><tr><th scope="row">Camera</th><td>Canon "R5"</td></tr></tbody></table>`;
    const out = extractSection(make(html));
    expect(out.text).toBe('Name: photo.jpg\nCamera: Canon "R5"');
    expect(out.tsv).toBe('Name\tphoto.jpg\nCamera\t"Canon ""R5"""');
    expect(JSON.parse(out.json!)).toEqual({ Name: "photo.jpg", Camera: 'Canon "R5"' });
    expect(out.markdown).toBe('- **Name:** photo.jpg\n- **Camera:** Canon "R5"');
  });

  test("rowspan leaves the covered cell empty and cells made for the Copy button are left out", () => {
    const html = `<table><thead><tr><th>A</th><th>B</th><th data-copy-ui>Copy</th></tr></thead><tbody><tr><td rowspan="2">x</td><td>1</td><td data-copy-ui><button>Copy</button></td></tr><tr><td>2</td><td data-copy-ui></td></tr></tbody></table>`;
    expect(extractSection(make(html)).tsv).toBe("A\tB\nx\t1\n\t2");
  });

  test("hidden rows and cells are skipped, nested tables are not mixed in", () => {
    const html = `<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>keep</td></tr><tr hidden><td>drop</td></tr><tr><td>after<table><tr><td>inner</td></tr></table></td></tr></tbody></table>`;
    const out = extractSection(make(html));
    expect(out.tsv).not.toContain("drop");
    expect(out.tsv!.split("\n")[1]).toBe("keep");
  });

  test("sections with no table have no table or JSON form", () => {
    const out = extractSection(make("<p>just words</p>"));
    expect(out.tsv).toBeNull();
    expect(out.json).toBeNull();
    expect(out.tabular).toBe(false);
  });

  test("two tables in one section become a JSON object named by their captions or headings", () => {
    const html = "<h3>Both</h3><h4>First</h4><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><table><caption>Second</caption><thead><tr><th>B</th></tr></thead><tbody><tr><td>2</td></tr></tbody></table>";
    expect(JSON.parse(extractSection(make(html)).json!)).toEqual({ First: [{ A: "1" }], Second: [{ B: "2" }] });
  });

  test("dl facts also give tab-separated and JSON forms", () => {
    const out = extractSection(make("<dl><dt>A</dt><dd>1</dd><dt>A</dt><dd>2</dd></dl>"));
    expect(out.tsv).toBe("A\t1\nA\t2");
    expect(JSON.parse(out.json!)).toEqual({ A: "1", "A (2)": "2" });
  });
});

describe("copy format: markdown and limits", () => {
  test("Markdown has headings, bullet lists and fenced code that survives backticks", () => {
    const md = extractSection(make("<h3>T</h3><p>para</p><ul><li>a</li><li>b</li></ul><pre>x ``` y</pre>")).markdown;
    expect(md).toBe("### T\n\npara\n\n- a\n- b\n\n````\nx ``` y\n````");
  });

  test("long text is cut to the clipboard limit with a note", () => {
    const out = extractSection(make(`<p>${"word ".repeat(40_000)}</p>`));
    expect(out.text.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(out.text.endsWith("(shortened)")).toBe(true);
    expect(out.shortened).toBe(true);
    expect(capText("short").shortened).toBe(false);
  });

  test("long tables lose their last rows (never half a row) and say so", () => {
    const rows = Array.from({ length: 5000 }, (_v, i) => `<tr><td>row ${i} ${"x".repeat(40)}</td><td>${i}</td></tr>`).join("");
    const out = extractSection(make(`<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`));
    expect(out.tsv!.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(out.tsv!.split("\n").every((l: string) => l.split("\t").length === 2)).toBe(true);
    expect(JSON.parse(out.json!).length).toBeGreaterThan(100);
    expect(out.shortened).toBe(true);
  });

  test("inlineText gives one tidy line", () => {
    expect(inlineText(make("<span>a</span>  <b>b</b><i hidden>x</i><span aria-hidden='true'>y</span>"))).toBe("a b");
  });

  test("row helpers quote, escape and name columns", () => {
    expect(rowsToTsv([["a", 'b"c'], ["1", "2"]])).toBe('a\t"b""c"\n1\t2');
    expect(rowsToMarkdown([["A", "B"], ["1", "2|3"]])).toBe("| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
    expect(JSON.parse(rowsToJson([["A", "A"], ["1", "2"]]))).toEqual([{ A: "1", "A (2)": "2" }]);
    expect(rowsToMarkdown([])).toBe("");
  });
});
