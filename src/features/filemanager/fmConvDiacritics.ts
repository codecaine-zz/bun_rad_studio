/**
 * Accents and other diacritics in plain text: take them off (é → e), or change how they are stored (one character é,
 * or an e followed by a separate accent mark). Pure functions on text; the Code tab has the same rules in
 * resources/file_manager/ui/diacritics.js (keep the two in step; tests/file_manager_diacritics.test.ts checks both).
 *
 * Only Latin and Greek letters lose their marks. Cyrillic, Japanese, Korean and Indian scripts keep theirs, because
 * there the mark changes the letter (が and か are different, so are й and и for a Russian reader).
 */
export type DiacriticMode = "remove" | "compose" | "decompose";

/** Letters that have no accent to take off but are written with one in mind: they are spelled out in plain letters. */
const SPELLED: Record<string, string> = {
  ß: "ss", ẞ: "SS", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ø: "o", Ø: "O", đ: "d", Đ: "D", ð: "d", Ð: "D",
  þ: "th", Þ: "TH", ł: "l", Ł: "L", ħ: "h", Ħ: "H", ı: "i", ĸ: "k", ŀ: "l", Ŀ: "L", ſ: "s", ĳ: "ij", Ĳ: "IJ",
};
const SPELLED_RE = new RegExp(`[${Object.keys(SPELLED).join("")}]`, "g");
const MARKED_LETTER = /([\p{Script=Latin}\p{Script=Greek}])[\u0300-\u036f]+/gu;

export function removeDiacritics(text: string, spellOut = true): string {
  const plain = text.normalize("NFD").replace(MARKED_LETTER, "$1").normalize("NFC");
  return spellOut ? plain.replace(SPELLED_RE, (c) => SPELLED[c]!) : plain;
}

export function changeDiacritics(text: string, mode: DiacriticMode, spellOut = true): string {
  if (mode === "compose") return text.normalize("NFC");
  if (mode === "decompose") return text.normalize("NFD");
  return removeDiacritics(text, spellOut);
}

/** How many characters carry a diacritic (or are a letter spelled out), to tell the user what was found. */
export function countDiacritics(text: string, spellOut = true): number {
  const marked = text.normalize("NFD").match(MARKED_LETTER)?.length ?? 0;
  return marked + (spellOut ? (text.match(SPELLED_RE)?.length ?? 0) : 0);
}
