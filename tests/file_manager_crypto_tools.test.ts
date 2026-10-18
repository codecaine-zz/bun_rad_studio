import { describe, expect, test } from "bun:test";
import { createContext } from "../src/features/filemanager/fmCore";
import { describeTextWidth, encodeText, unescapeHtml } from "../src/features/filemanager/fmCrypto";
import { cryptoOperations } from "../src/features/filemanager/fmCryptoOps";
import { convertColor } from "../src/features/filemanager/fmColor";
import { FmError } from "../src/features/filemanager/fmPaths";
import { API_OPERATIONS } from "../src/features/filemanager/fmServer";

const ctx = createContext({ home: "/", dataDir: "/" });
const op = (name: string, body: Record<string, any> = {}) => cryptoOperations[`crypto/${name}`]!(ctx, body) as Promise<any>;
const value = (r: ReturnType<typeof convertColor>, id: string) => r.rows.find((x) => x.id === id)?.value;

describe("color converter (Bun.color)", () => {
  test("the operation is registered", () => expect(API_OPERATIONS).toContain("crypto/color"));

  test("a name, short hex, long hex, rgb() and hsl() all land on the same red", () => {
    for (const text of ["red", "#f00", "#FF0000", "rgb(255, 0, 0)", "rgb(255 0 0)", "hsl(0, 100%, 50%)", "hwb(0 0% 0%)", "  RED  ", "0xff0000"]) {
      const r = convertColor(text);
      expect(value(r, "hex"), text).toBe("#ff0000");
      expect(value(r, "HEX"), text).toBe("#FF0000");
      expect(value(r, "css"), text).toBe("red");
      expect(value(r, "rgb"), text).toBe("rgb(255, 0, 0)");
      expect(value(r, "number"), text).toBe("16711680");
      expect(value(r, "{rgb}"), text).toBe('{"r":255,"g":0,"b":0}');
      expect(value(r, "[rgb]"), text).toBe("[255,0,0]");
      expect(r.swatch).toBe("red");
    }
  });

  test("every row has a label, a value and a plain-words hint, and the escape codes are readable", () => {
    const r = convertColor("rebeccapurple");
    expect(r.rows.length).toBe(15);
    for (const row of r.rows) {
      expect(row.label.length).toBeGreaterThan(2);
      expect(row.value.length).toBeGreaterThan(0);
      expect(row.hint.length).toBeGreaterThan(20);
      expect(row.value).not.toContain("\u001b");
    }
    expect(value(r, "hex")).toBe("#663399");
    expect(value(r, "css")).toBe("#639");
    expect(value(r, "ansi-16m")).toBe("\\x1b[38;2;102;51;153m");
    expect(value(r, "hsl")).toMatch(/^hsl\(270, /);
    expect(value(r, "lab")).toMatch(/^lab\(/);
  });

  test("transparency is kept where the form can hold it, and explained", () => {
    const r = convertColor("rgba(10, 20, 30, 0.5)");
    expect(value(r, "css")).toBe("#0a141e80");
    expect(value(r, "hex")).toBe("#0a141e");
    expect(value(r, "rgba")).toMatch(/^rgba\(10, 20, 30, 0\.50/);
    expect(value(r, "[rgba]")).toBe("[10,20,30,128]");
    expect(r.notes.join(" ")).toMatch(/partly transparent/);
    expect(convertColor("transparent").notes.join(" ")).toMatch(/partly transparent/);
    expect(convertColor("red").notes).toEqual([]);
  });

  test("lab(), oklch() and display-p3 colors are read; forms that can't hold them are left out and said so", () => {
    expect(value(convertColor("lab(50% 40 59.5)"), "hex")).toBe("#bf5700");
    expect(value(convertColor("oklch(60% 0.2 30)"), "hex")).toBe("#de3e2d");
    const wide = convertColor("color(display-p3 1 0 0)");
    expect(wide.swatch).toBe("color(display-p3 1 0 0)");
    expect(wide.notes.join(" ")).toMatch(/Not available for this color/);
    expect(wide.rows.some((x) => x.id === "css")).toBe(true);
    expect(wide.rows.some((x) => x.id === "hex")).toBe(false);
  });

  test("many named colors and hex shorthand round-trip through the hex form", () => {
    const names: Record<string, string> = { black: "#000000", white: "#ffffff", lime: "#00ff00", navy: "#000080", tomato: "#ff6347", gold: "#ffd700", teal: "#008080", "#abc": "#aabbcc", "#ABCDEF": "#abcdef", "hsl(120 100% 50%)": "#00ff00", "rgb(0 128 255)": "#0080ff" };
    for (const [input, hex] of Object.entries(names)) expect(value(convertColor(input), "hex"), input).toBe(hex);
  });

  test("things that are not colors are explained in plain words", () => {
    for (const bad of ["not a color", "#12345", "#gggggg", "rgb(1,2)", "currentColor", "12345", "javascript:alert(1)", "red; background:url(x)", "red blue", "#ff0000;", "rgb(1 2 3) x"]) {
      let err: any;
      try {
        convertColor(bad);
      } catch (e) {
        err = e;
      }
      expect(err, bad).toBeInstanceOf(FmError);
      expect(err.code, bad).toBe("BAD_COLOR");
      expect(err.message).toMatch(/Try a name/);
    }
    expect(() => convertColor("")).toThrow(/Type a color first/);
    expect(() => convertColor("   ")).toThrow(/Type a color first/);
    expect(() => convertColor(42 as any)).toThrow(/isn't text/);
    expect(() => convertColor("a".repeat(201))).toThrow(/too long/);
  });

  test("the long input is cut in the message, never echoed in full", () => {
    try {
      convertColor("x".repeat(150));
    } catch (e: any) {
      expect(e.message.length).toBeLessThan(300);
    }
  });

  test("over the operation", async () => {
    const r = await op("color", { text: "tomato" });
    expect(r.swatch).toBe("tomato");
    expect(r.rows.find((x: any) => x.id === "hex").value).toBe("#ff6347");
    await expect(op("color", { text: "zzz" })).rejects.toBeInstanceOf(FmError);
  });
});

describe("text tools: HTML escape, unescape, color codes and width", () => {
  test("escape uses Bun.escapeHTML for the five special characters", () => {
    expect(encodeText("html-escape", `<a href="x">Tom & 'Jerry'</a>`).output).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &#x27;Jerry&#x27;&lt;/a&gt;");
    expect(encodeText("html-escape", "plain text ü 日本").output).toBe("plain text ü 日本");
  });

  test("unescape reverses it, in one pass only", () => {
    const original = `<a href="x">Tom & 'Jerry'</a> <script>alert(1)</script>`;
    expect(encodeText("html-unescape", encodeText("html-escape", original).output).output).toBe(original);
    expect(unescapeHtml("&amp;lt;")).toBe("&lt;");
    expect(unescapeHtml("&lt;b&gt; &quot;q&quot; &apos;a&apos; &#39;b&#39; &#x27;c&#X27;")).toBe(`<b> "q" 'a' 'b' 'c'`);
  });

  test("numeric references: real characters decode, invalid ones and unknown names stay as typed", () => {
    expect(unescapeHtml("&#65;&#x42;&#128512;&#x1F600;")).toBe("AB😀😀");
    for (const keep of ["&#0;", "&#xD800;", "&#1114112;", "&#xFFFFFFF;", "&nbsp;", "&copy;", "&amp", "&#;", "&#x;", "& amp;", "&#12345678;"]) expect(unescapeHtml(keep), keep).toBe(keep);
  });

  test("the decoder never produces markup that something else would run: it only returns text", () => {
    expect(unescapeHtml("&lt;img src=x onerror=alert(1)&gt;")).toBe("<img src=x onerror=alert(1)>");
    expect(typeof encodeText("html-unescape", "&lt;b&gt;").output).toBe("string");
  });

  test("color codes (ANSI) are removed from terminal text", () => {
    const log = "\u001b[31mERROR\u001b[0m something \u001b[1;32mok\u001b[0m\n\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007";
    expect(encodeText("strip-ansi", log).output).toBe("ERROR something ok\nlink");
    expect(encodeText("strip-ansi", "nothing to remove").output).toBe("nothing to remove");
  });

  test("text width counts characters, bytes and terminal columns", () => {
    expect(describeTextWidth("abc")).toBe("Characters: 3\nBytes (UTF-8): 3\nColumns in a terminal: 3\nEvery character takes one column.");
    const wide = describeTextWidth("日本語😀");
    expect(wide).toContain("Characters: 4");
    expect(wide).toContain("Columns in a terminal: 8");
    expect(wide).toContain("take two columns");
    expect(describeTextWidth("e\u0301")).toContain("Columns in a terminal: 1");
    expect(describeTextWidth("e\u0301")).toContain("Characters: 2");
    expect(describeTextWidth("\u001b[31mred\u001b[0m")).toContain("Columns in a terminal: 3");
  });

  test("the encode operation offers the new modes and still refuses empty text and unknown modes", async () => {
    for (const mode of ["html-escape", "html-unescape", "strip-ansi", "text-width"]) {
      const r = await op("encode", { mode, text: "a <b> &amp; \u001b[31mx" });
      expect(typeof r.output).toBe("string");
      expect(r.bytes).toBeGreaterThan(0);
    }
    await expect(op("encode", { mode: "html-escape", text: "" })).rejects.toBeInstanceOf(FmError);
    await expect(op("encode", { mode: "nope", text: "x" })).rejects.toBeInstanceOf(FmError);
  });
});
