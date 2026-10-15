import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runBuiltin } from "../src/features/filemanager/fmConvBuiltin";
import { CATALOG_BY_ID } from "../src/features/filemanager/fmConvCatalog";
import { changeDiacritics, countDiacritics, removeDiacritics } from "../src/features/filemanager/fmConvDiacritics";
import * as ui from "../resources/file_manager/ui/diacritics.js";
import { changeDiacritics as editorChange } from "../resources/file_manager/ui/codeLines.js";

const work = mkdtempSync(join(tmpdir(), "fm-diacritics-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const SAMPLE = "Crème brûlée, Müller, Ångström, Łódź, façade, naïve, Ñandú, Straße, Æsir, Øresund, Đà Nẵng, Ελλάδα ήλιος";

describe("the rules", () => {
  test("accents come off Latin and Greek letters", () => {
    expect(removeDiacritics(SAMPLE)).toBe("Creme brulee, Muller, Angstrom, Lodz, facade, naive, Nandu, Strasse, AEsir, Oresund, Da Nang, Ελλαδα ηλιος");
  });
  test("letters such as ß, æ and ø are spelled out, unless that is switched off", () => {
    expect(removeDiacritics("Straße Æsir Øre", true)).toBe("Strasse AEsir Ore");
    expect(removeDiacritics("Straße Æsir Øre é", false)).toBe("Straße Æsir Øre e");
  });
  test("scripts where a mark changes the letter are left alone", () => {
    for (const s of ["がぎぐ ハンバーガー", "한국어 텍스트", "Привет, ёжик, йод", "हिन्दी भाषा", "עִבְרִית", "日本語"]) expect(removeDiacritics(s)).toBe(s);
  });
  test("composing and decomposing change how an accent is stored, not what is shown", () => {
    const nfc = "caf\u00e9";
    const nfd = "cafe\u0301";
    expect(changeDiacritics(nfd, "compose")).toBe(nfc);
    expect(changeDiacritics(nfc, "decompose")).toBe(nfd);
    expect(changeDiacritics(nfd, "remove")).toBe("cafe");
    expect(removeDiacritics(nfd)).toBe("cafe");
  });
  test("plain text, emoji and an empty string are untouched", () => {
    for (const s of ["", "plain ASCII 123", "😀 emoji 👨‍👩‍👧", "tabs\tand\r\nlines"]) expect(removeDiacritics(s)).toBe(s);
  });
  test("it counts what it will change", () => {
    expect(countDiacritics("café ß")).toBe(2);
    expect(countDiacritics("café ß", false)).toBe(1);
    expect(countDiacritics("plain")).toBe(0);
  });
  test("the file converter and the Code tab follow the same rules", () => {
    for (const mode of ["remove", "compose", "decompose"] as const) {
      for (const letters of [true, false]) {
        expect(ui.changeDiacritics(SAMPLE, mode, letters)).toBe(changeDiacritics(SAMPLE, mode, letters));
      }
    }
    expect(ui.countDiacritics(SAMPLE)).toBe(countDiacritics(SAMPLE));
  });
});

describe("the file converter", () => {
  const def = CATALOG_BY_ID.get("text-diacritics")!;
  const run = async (name: string, bytes: Uint8Array | string, opts: Record<string, string | boolean> = {}) => {
    const input = join(work, name);
    writeFileSync(input, bytes);
    const output = join(work, `out-${name}`);
    const engine = def.engines[0]!.builtin!;
    const note = await runBuiltin({ kind: engine.kind, inputs: [input], output, opts, params: engine.params, platform: "darwin", home: work } as any);
    return { note, out: readFileSync(output) };
  };

  test("it is in the list for text files, with its options", () => {
    expect(def).toBeTruthy();
    expect(def.options!.map((o) => o.id)).toEqual(["mode", "from", "letters"]);
  });
  test("a UTF-8 file loses its accents and keeps its line endings and byte-order mark", async () => {
    const { out, note } = await run("a.txt", "\u{feff}Café\r\nnaïve\r\n", { mode: "remove" });
    expect(out.toString("utf8")).toBe("\u{feff}Cafe\r\nnaive\r\n");
    expect(note).toContain("2");
  });
  test("a file in Windows-1252 is read properly and written back in the same encoding", async () => {
    const { out } = await run("w.txt", Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0xdf]), { mode: "remove", from: "windows-1252" });
    expect([...out]).toEqual([0x43, 0x61, 0x66, 0x65, 0x20, 0x73, 0x73]);
  });
  test("a Cyrillic file in Windows-1251 is not damaged", async () => {
    const bytes = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
    // Guessing would read it as Windows-1252 and turn the letters into plain ones, so automatic mode refuses.
    await expect(run("c0.txt", bytes, { mode: "remove" })).rejects.toThrow(/Read it as/);
    const { out, note } = await run("c.txt", bytes, { mode: "remove", from: "windows-1251" });
    expect(out.equals(bytes)).toBe(true);
    expect(note.toLowerCase()).toContain("nothing");
  });
  test("a UTF-16 file keeps being UTF-16", async () => {
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Zoë", "utf16le")]);
    const { out } = await run("u16.txt", utf16, { mode: "remove" });
    expect(out.equals(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Zoe", "utf16le")]))).toBe(true);
  });
  test("compose fixes text made of letter + separate accent, and decompose does the opposite", async () => {
    const a = await run("n.txt", "cafe\u0301", { mode: "compose" });
    expect(a.out.toString("utf8")).toBe("caf\u00e9");
    const b = await run("d.txt", "caf\u00e9", { mode: "decompose" });
    expect(b.out.toString("utf8")).toBe("cafe\u0301");
  });
  test("decomposing a file that is not Unicode is refused, because the accents could not be stored", async () => {
    await expect(run("l1.txt", Buffer.from([0x63, 0x61, 0x66, 0xe9]), { mode: "decompose", from: "windows-1252" })).rejects.toThrow(/UTF-8/);
  });
  test("the letters switch changes ß", async () => {
    expect((await run("s1.txt", "Straße", { mode: "remove", letters: true })).out.toString()).toBe("Strasse");
    expect((await run("s2.txt", "Straße é", { mode: "remove", letters: false })).out.toString()).toBe("Straße e");
  });
});

describe("the Code tab", () => {
  const apply = (r: any, text: string) => (r && "insert" in r ? text.slice(0, r.from) + r.insert + text.slice(r.to) : text);
  test("with nothing selected the whole file is changed", () => {
    const t = "café\nnaïve\n";
    expect(apply(editorChange(t, 3, 3, "remove"), t)).toBe("cafe\nnaive\n");
  });
  test("with a selection only the selection is changed", () => {
    const t = "café naïve";
    expect(apply(editorChange(t, 5, 10, "remove"), t)).toBe("café naive");
  });
  test("nothing to change gives a message, not an empty edit", () => {
    expect(editorChange("plain", 0, 0, "remove")).toMatchObject({ message: expect.stringContaining("no accents") });
  });
});
