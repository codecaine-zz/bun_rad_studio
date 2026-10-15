import { describe, expect, test } from "bun:test";
import { TRANSFORMS, TRANSFORM_BY_ID, TRANSFORM_GROUPS, convertText, wordsOf } from "../resources/file_manager/ui/textConvert.js";

const run = (id: string, text: string) => TRANSFORM_BY_ID.get(id)!.fn(text);
const fails = (id: string, text: string) => {
  try {
    run(id, text);
  } catch (e: any) {
    return String(e.message);
  }
  return null;
};

describe("the list", () => {
  test("every conversion has an id, a group, a label and a tip, and ids are unique", () => {
    expect(new Set(TRANSFORMS.map((t) => t.id)).size).toBe(TRANSFORMS.length);
    for (const t of TRANSFORMS) {
      expect(t.id && t.group && t.label && t.tip && typeof t.fn === "function", t.id).toBeTruthy();
    }
    expect(TRANSFORMS.length).toBeGreaterThanOrEqual(65);
    expect(TRANSFORM_GROUPS).toEqual(["Case", "Clean up", "Lines", "Encode & escape", "Extract", "Dates & numbers"]);
  });
  test("every conversion runs on ordinary text without throwing, or says why in a sentence", () => {
    for (const t of TRANSFORMS) {
      try {
        expect(typeof t.fn("Hello, World! café\nsecond line 123")).toBe("string");
      } catch (e: any) {
        expect(e.message.length, t.id).toBeGreaterThan(8);
      }
    }
  });
});

describe("case", () => {
  test("words are found in identifiers and phrases", () => {
    expect(wordsOf("someHTTPValue_here-now")).toEqual(["some", "HTTP", "Value", "here", "now"]);
    expect(wordsOf("Ünïcode wörds2go")).toEqual(["Ünïcode", "wörds2go"]);
  });
  test("identifier cases work one line at a time", () => {
    const t = "hello big world\nsome_other-thing";
    expect(run("camel", t)).toBe("helloBigWorld\nsomeOtherThing");
    expect(run("pascal", t)).toBe("HelloBigWorld\nSomeOtherThing");
    expect(run("snake", "HelloBigWorld")).toBe("hello_big_world");
    expect(run("constant", "helloBigWorld")).toBe("HELLO_BIG_WORLD");
    expect(run("kebab", "Hello Big World")).toBe("hello-big-world");
    expect(run("train", "hello big world")).toBe("Hello-Big-World");
    expect(run("dot", "helloBigWorld")).toBe("hello.big.world");
    expect(run("path", "helloBigWorld")).toBe("hello/big/world");
    expect(run("words", "someVariable_name")).toBe("some variable name");
  });
  test("sentence, swap and title", () => {
    expect(run("sentence", "HELLO there. how ARE you? fine!\nnext line")).toBe("Hello there. How are you? Fine!\nNext line");
    expect(run("swap", "Hello World")).toBe("hELLO wORLD");
    expect(run("title", "it's a tale of two cities")).toBe("It's A Tale Of Two Cities");
  });
});

describe("clean up", () => {
  test("lines and spaces", () => {
    expect(run("trimLines", "  a  \n\tb\t")).toBe("a\nb");
    expect(run("noBlank", "a\n\n  \nb\n")).toBe("a\nb");
    expect(run("oneBlank", "a\n\n\n\nb\n\nc")).toBe("a\n\nb\n\nc");
    expect(run("spaces", "  a   b \t c")).toBe("  a b c");
    expect(run("oneLine", "a\n b \n\nc")).toBe("a b c");
    expect(run("unwrap", "one\ntwo\n\nthree\nfour")).toBe("one two\n\nthree four");
  });
  test("wrapping keeps words whole and the indentation", () => {
    const out = run("wrap72", "word ".repeat(40).trim());
    for (const l of out.split("\n")) expect(l.length).toBeLessThanOrEqual(72);
    expect(out.replace(/\n/g, " ")).toBe("word ".repeat(40).trim());
    expect(run("wrap80", "  short")).toBe("  short");
  });
  test("line endings are kept as they were", () => {
    expect(run("noBlank", "a\r\n\r\nb")).toBe("a\r\nb");
    expect(run("trimLines", " a \r\n b ")).toBe("a\r\nb");
  });
  test("characters", () => {
    expect(run("straighten", "“Hi” ‘there’ – ok — … ")).toBe('"Hi" \'there\' - ok -- ... ');
    expect(run("invisible", "a\u200bb\u00a0c\ufeff")).toBe("ab c");
    expect(run("control", "a\u0000b\tc\n")).toBe("ab\tc\n");
    expect(run("ascii", "café 日本 ok")).toBe("caf  ok");
    expect(run("noEmoji", "hi 😀 there 👨‍👩‍👧!")).toBe("hi  there !");
    expect(run("stripTags", "<p>Hi <b>you</b> &amp; <script>x()</script>me<!-- c --></p>")).toBe("Hi you & me");
    expect(run("nfkc", "ﬁne ² Ａ")).toBe("fine 2 A");
    expect(run("noAccents", "Crème brûlée")).toBe("Creme brulee");
  });
});

describe("lines", () => {
  test("numbering and bullets go on and come off", () => {
    expect(run("numberLines", "a\nb")).toBe("1. a\n2. b");
    expect(run("unnumber", "1. a\n2) b\n  3: c")).toBe("a\nb\n  c");
    expect(run("bullets", "a\n\nb")).toBe("- a\n\n- b");
    expect(run("unbullet", "- a\n  * b\n• c")).toBe("a\n  b\nc");
    expect(run("quote", "a\n\nb")).toBe("> a\n>\n> b");
    expect(run("unquote", "> a\n>\n> b")).toBe("a\n\nb");
  });
  test("quotes escape what they must", () => {
    expect(run("dq", 'say "hi"\n\nback\\slash')).toBe('"say \\"hi\\""\n\n"back\\\\slash"');
    expect(run("sq", "it's")).toBe("'it\\'s'");
  });
  test("lists in and out", () => {
    expect(run("toComma", "a\n\nb\n c ")).toBe("a, b, c");
    expect(run("fromComma", "a, b;c ,, d")).toBe("a\nb\nc\nd");
    expect(run("toJsonArray", 'a\n"b"\n\nc')).toBe('["a","\\"b\\"","c"]');
    expect(run("fromJsonArray", '["a","b",3,{"x":1}]')).toBe('a\nb\n3\n{"x":1}');
    expect(fails("fromJsonArray", "nope")).toContain("valid JSON");
    expect(fails("fromJsonArray", '{"a":1}')).toContain("list");
  });
  test("ordering", () => {
    expect(run("sortLength", "ccc\na\nbb")).toBe("a\nbb\nccc");
    const shuffled = run("shuffle", "1\n2\n3\n4\n5\n6\n7\n8\n9").split("\n").sort();
    expect(shuffled).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(run("reverseText", "abc 😀é")).toBe("é😀 cba");
    expect(run("reverseWords", "one two three")).toBe("three two one");
  });
});

describe("encode and escape", () => {
  test("Base64 is UTF-8 safe, accepts URL-safe and unpadded input, and refuses nonsense", () => {
    expect(run("b64", "héllo ☃")).toBe("aMOpbGxvIOKYgw==");
    expect(run("unb64", "aMOpbGxvIOKYgw==")).toBe("héllo ☃");
    expect(run("unb64", "aMOpbGxvIOKYgw")).toBe("héllo ☃");
    expect(run("unb64", "aGk-_w==".replace("aGk-_w==", "SGk="))).toBe("Hi");
    expect(fails("unb64", "not base64!")).toContain("Base64");
    expect(fails("unb64", "/wD/")).toContain("binary");
  });
  test("hex and binary round-trip", () => {
    expect(run("hex", "Hi é")).toBe("48 69 20 c3 a9");
    expect(run("unhex", "48 69 20 c3 a9")).toBe("Hi é");
    expect(run("unhex", "0x48,0x69")).toBe("Hi");
    expect(run("unhex", "4869")).toBe("Hi");
    expect(fails("unhex", "zz")).toContain("hex");
    expect(fails("unhex", "abc")).toContain("hex");
    expect(run("bin", "Hi")).toBe("01001000 01101001");
    expect(run("unbin", "01001000 01101001")).toBe("Hi");
    expect(fails("unbin", "0100")).toContain("binary");
  });
  test("URL and HTML", () => {
    expect(run("urlEnc", "a b&c/é")).toBe("a%20b%26c%2F%C3%A9");
    expect(run("urlDec", "a%20b%26c+d")).toBe("a b&c d");
    expect(fails("urlDec", "100%")).toContain("web-address");
    expect(run("htmlEnc", `<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(run("htmlDec", "&lt;b&gt; &amp;amp; &#233; &#x1F600; &copy; &unknown; &#0;")).toBe("<b> &amp; é 😀 © &unknown; &#0;");
  });
  test("string escapes", () => {
    expect(run("jsonEsc", 'a "b"\n\tc\\')).toBe('a \\"b\\"\\n\\tc\\\\');
    expect(run("jsonUnesc", 'a \\"b\\"\\n\\tc\\\\ \\u00e9')).toBe('a "b"\n\tc\\ é');
    expect(fails("jsonUnesc", "bad \\q")).toContain("escape");
    expect(run("uEsc", "é😀")).toBe("\\u00e9\\ud83d\\ude00");
    expect(run("uUnesc", "\\u00e9 \\u{1F600} \\ud83d\\ude00")).toBe("é 😀 😀");
    expect(run("regexEsc", "a.b*c(d)")).toBe("a\\.b\\*c\\(d\\)");
    expect(run("shellEsc", "it's; rm -rf /")).toBe(`'it'\\''s; rm -rf /'`);
  });
  test("ROT13, Morse and slugs", () => {
    expect(run("rot13", "Hello, World!")).toBe("Uryyb, Jbeyq!");
    expect(run("rot13", run("rot13", "Round Trip"))).toBe("Round Trip");
    expect(run("morse", "SOS 12")).toBe("... --- ... / .---- ..---");
    expect(run("unmorse", "... --- ... / .---- ..---")).toBe("sos 12");
    expect(run("slug", "Crème Brûlée & Straße!\n  Hello  World ")).toBe("creme-brulee-strasse\nhello-world");
  });
});

describe("extract", () => {
  const text = "See https://a.com/x?y=1, (http://b.org) and https://a.com/x?y=1 or mail me@ex.com, Me@Ex.com; ip 10.0.0.1 and 999.1.1.1 #tag #tag2 cost 3.5 or -2";
  test("links, e-mail, IPs, hashtags and numbers, without repeats", () => {
    expect(run("urls", text)).toBe("https://a.com/x?y=1\nhttp://b.org");
    expect(run("emails", text)).toBe("me@ex.com\nMe@Ex.com");
    expect(run("ips", text)).toBe("10.0.0.1");
    expect(run("hashtags", text)).toBe("#tag\n#tag2");
    expect(run("numbers", "a 3.5 b -2 c 10")).toBe("3.5\n-2\n10");
  });
  test("nothing found is said plainly", () => {
    expect(fails("urls", "no links")).toBe("No web addresses found.");
    expect(fails("emails", "none")).toContain("e-mail");
    expect(fails("numbers", "none")).toBe("No numbers found.");
  });
  test("words", () => {
    expect(run("wordList", "One, two; don't stop")).toBe("One\ntwo\ndon't\nstop");
    expect(run("uniqueWords", "the cat The dog cat")).toBe("cat\ndog\nthe");
  });
});

describe("dates and numbers", () => {
  test("Unix timestamps both ways", () => {
    expect(run("unixToDate", "t=1700000000 and 1700000000000 and 12345")).toBe("t=2023-11-14 22:13:20 UTC and 2023-11-14 22:13:20 UTC and 12345");
    expect(run("dateToUnix", "2023-11-14\n2023-11-14T22:13:20Z\n2023-11-14 22:13:20\nnot a date")).toBe("1699920000\n1700000000\n1700000000\nnot a date");
  });
  test("thousands separators", () => {
    expect(run("thousands", "1234567 and 12.5 and 1234.5678 and 999 and 3,000")).toBe("1,234,567 and 12.5 and 1,234.5678 and 999 and 3,000");
    expect(run("unthousands", "1,234,567 and 12,5 and 3,000.25")).toBe("1234567 and 12,5 and 3000.25");
  });
});

describe("convertText (what the Code tab applies)", () => {
  test("with no selection the whole file is converted", () => {
    expect(convertText("abc\ndef", 2, 2, "upper")).toEqual({ from: 0, to: 7, insert: "ABC\nDEF", selStart: 2, selEnd: 2 });
  });
  test("with a selection only that is converted, and stays selected", () => {
    expect(convertText("abc def ghi", 4, 7, "upper")).toEqual({ from: 4, to: 7, insert: "DEF", selStart: 4, selEnd: 7 });
  });
  test("nothing to change, an empty file, an unknown id and a failing conversion give a message", () => {
    expect(convertText("ABC", 0, 0, "upper")).toEqual({ message: "Nothing needed changing." });
    expect(convertText("  \n", 0, 0, "upper")).toMatchObject({ message: expect.stringContaining("empty") });
    expect(convertText("a", 0, 1, "nope")).toMatchObject({ message: expect.stringContaining("isn't known") });
    expect(convertText("not base64!", 0, 0, "unb64")).toMatchObject({ message: expect.stringContaining("Base64") });
  });
});
