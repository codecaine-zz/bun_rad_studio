// Accents and other diacritics in plain text. Same rules as src/features/filemanager/fmConvDiacritics.ts (the file converter);
// Only Latin and Greek letters lose their marks: in Cyrillic, Japanese, Korean and Indian scripts the mark changes the letter.

const SPELLED = {
  ß: "ss", ẞ: "SS", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ø: "o", Ø: "O", đ: "d", Đ: "D", ð: "d", Ð: "D",
  þ: "th", Þ: "TH", ł: "l", Ł: "L", ħ: "h", Ħ: "H", ı: "i", ĸ: "k", ŀ: "l", Ŀ: "L", ſ: "s", ĳ: "ij", Ĳ: "IJ",
};
const SPELLED_RE = new RegExp(`[${Object.keys(SPELLED).join("")}]`, "g");
const MARKED_LETTER = /([\p{Script=Latin}\p{Script=Greek}])[\u0300-\u036f]+/gu;

export function removeDiacritics(text, spellOut = true) {
  const plain = text.normalize("NFD").replace(MARKED_LETTER, "$1").normalize("NFC");
  return spellOut ? plain.replace(SPELLED_RE, (c) => SPELLED[c]) : plain;
}

export function changeDiacritics(text, mode, spellOut = true) {
  if (mode === "compose") return text.normalize("NFC");
  if (mode === "decompose") return text.normalize("NFD");
  return removeDiacritics(text, spellOut);
}

export function countDiacritics(text, spellOut = true) {
  const marked = text.normalize("NFD").match(MARKED_LETTER)?.length ?? 0;
  return marked + (spellOut ? (text.match(SPELLED_RE)?.length ?? 0) : 0);
}
