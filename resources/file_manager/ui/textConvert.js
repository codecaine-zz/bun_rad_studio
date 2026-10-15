// Everyday text conversions for the Code tab: change the case, clean up, work with lines, encode and escape, pull things
// out of text. Each takes plain text and gives plain text back, or throws an Error with a sentence that says why it can't
// (the Code tab shows it). Nothing here touches the page. `convertText` applies one to the selection, or to the whole file
// when nothing is selected.
import { changeDiacritics } from "./diacritics.js";

const lines = (t) => t.split(/\r\n|\r|\n/);
const eolOf = (t) => (t.includes("\r\n") ? "\r\n" : t.includes("\r") && !t.includes("\n") ? "\r" : "\n");
const perLine = (fn) => (t) => lines(t).map(fn).join(eolOf(t));
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

/** Splits an identifier or phrase into its words: "someHTTPValue_here-now" → some, HTTP, Value, here, now. */
export function wordsOf(t) {
  return t
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
const cap = (w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);

const toBase64 = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromBase64 = (t) => {
  const clean = t.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!clean || /[^A-Za-z0-9+/=]/.test(clean)) throw new Error("That isn't Base64 (it holds characters other than letters, digits, + / and =).");
  let bin;
  try {
    bin = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "="));
  } catch {
    throw new Error("That isn't valid Base64.");
  }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  try {
    return dec.decode(bytes);
  } catch {
    throw new Error("That is valid Base64, but it holds a binary file, not text.");
  }
};

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", copy: "©", reg: "®", trade: "™", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", euro: "€", pound: "£", yen: "¥", cent: "¢", deg: "°", times: "×", divide: "÷", laquo: "«", raquo: "»", bull: "•", middot: "·" };
const htmlEncode = (t) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const htmlDecode = (t) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const uniq = (list) => [...new Set(list)];
const extract = (re, what, clean = (s) => s) => (t) => {
  const found = uniq((t.match(re) ?? []).map(clean));
  if (!found.length) throw new Error(`No ${what} found.`);
  return found.join(eolOf(t));
};

const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function hardWrap(t, width) {
  const eol = eolOf(t);
  return lines(t).map((line) => {
    if (line.length <= width) return line;
    const indent = /^\s*/.exec(line)[0];
    const out = [];
    let cur = indent;
    for (const w of line.trim().split(/\s+/)) {
      if (cur.trim() && (cur + " " + w).length > width) { out.push(cur); cur = indent + w; }
      else cur = cur.trim() ? cur + " " + w : indent + w;
    }
    out.push(cur);
    return out.join(eol);
  }).join(eol);
}

const SMART = [[/[\u2018\u2019\u201a\u201b\u2032]/g, "'"], [/[\u201c\u201d\u201e\u201f\u2033]/g, '"'], [/\u2026/g, "..."], [/[\u2013]/g, "-"], [/\u2014/g, "--"], [/[\u00ab]/g, '"'], [/[\u00bb]/g, '"']];
const EMOJI = /[\p{Extended_Pictographic}\u200d\ufe0f\u20e3]/gu;

const MORSE = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----." };
const UNMORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

/** Every conversion: { id, group, label, tip, fn }. */
export const TRANSFORMS = [
  // Case
  { id: "upper", group: "Case", label: "UPPERCASE", tip: "Every letter a capital.", fn: (t) => t.toUpperCase() },
  { id: "lower", group: "Case", label: "lowercase", tip: "Every letter small.", fn: (t) => t.toLowerCase() },
  { id: "title", group: "Case", label: "Title Case", tip: "Capitalise each word.", fn: (t) => t.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) },
  { id: "sentence", group: "Case", label: "Sentence case", tip: "Small letters, with a capital at the start of each sentence and line.", fn: (t) => t.toLowerCase().replace(/(^|[.!?]\s+|\n\s*)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) },
  { id: "swap", group: "Case", label: "sWAP cASE", tip: "Capitals become small and small become capitals.", fn: (t) => [...t].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join("") },
  { id: "camel", group: "Case", label: "camelCase", tip: "Join words like someVariableName (each line separately).", fn: perLine((l) => wordsOf(l).map((w, i) => (i ? cap(w) : w.toLowerCase())).join("")) },
  { id: "pascal", group: "Case", label: "PascalCase", tip: "Join words like SomeClassName (each line separately).", fn: perLine((l) => wordsOf(l).map(cap).join("")) },
  { id: "snake", group: "Case", label: "snake_case", tip: "Join words like some_variable_name (each line separately).", fn: perLine((l) => wordsOf(l).map((w) => w.toLowerCase()).join("_")) },
  { id: "constant", group: "Case", label: "CONSTANT_CASE", tip: "Join words like SOME_CONSTANT_NAME (each line separately).", fn: perLine((l) => wordsOf(l).map((w) => w.toUpperCase()).join("_")) },
  { id: "kebab", group: "Case", label: "kebab-case", tip: "Join words like some-css-name (each line separately).", fn: perLine((l) => wordsOf(l).map((w) => w.toLowerCase()).join("-")) },
  { id: "train", group: "Case", label: "Train-Case", tip: "Join words like Some-Header-Name (each line separately).", fn: perLine((l) => wordsOf(l).map(cap).join("-")) },
  { id: "dot", group: "Case", label: "dot.case", tip: "Join words like some.setting.name (each line separately).", fn: perLine((l) => wordsOf(l).map((w) => w.toLowerCase()).join(".")) },
  { id: "path", group: "Case", label: "path/case", tip: "Join words like some/folder/name (each line separately).", fn: perLine((l) => wordsOf(l).map((w) => w.toLowerCase()).join("/")) },
  { id: "words", group: "Case", label: "Split an identifier into words", tip: "someVariable_name becomes: some variable name.", fn: perLine((l) => wordsOf(l).map((w) => w.toLowerCase()).join(" ")) },

  // Clean up
  { id: "trimLines", group: "Clean up", label: "Trim spaces at both ends of every line", tip: "Remove spaces and tabs at the start and end of each line.", fn: perLine((l) => l.trim()) },
  { id: "noBlank", group: "Clean up", label: "Remove blank lines", tip: "Delete every empty line (and lines with only spaces).", fn: (t) => lines(t).filter((l) => l.trim() !== "").join(eolOf(t)) },
  { id: "oneBlank", group: "Clean up", label: "Collapse several blank lines into one", tip: "Two or more empty lines in a row become one.", fn: (t) => t.replace(/(\r\n|\r|\n)([ \t]*(\r\n|\r|\n))+/g, (_, a) => a + a) },
  { id: "spaces", group: "Clean up", label: "Collapse repeated spaces into one", tip: "Runs of spaces and tabs inside a line become a single space (the indentation stays).", fn: perLine((l) => /^\s*/.exec(l)[0] + l.trimStart().replace(/[ \t]{2,}/g, " ")) },
  { id: "oneLine", group: "Clean up", label: "Remove all line breaks (make one line)", tip: "Join everything into one line, with a space where each line break was.", fn: (t) => lines(t).map((l) => l.trim()).filter(Boolean).join(" ") },
  { id: "unwrap", group: "Clean up", label: "Join the lines of each paragraph", tip: "Text broken into short lines becomes paragraphs; a blank line still starts a new paragraph.", fn: (t) => t.split(/(?:\r\n|\r|\n)[ \t]*(?:\r\n|\r|\n)+/).map((p) => lines(p).map((l) => l.trim()).filter(Boolean).join(" ")).join(eolOf(t) + eolOf(t)) },
  { id: "wrap80", group: "Clean up", label: "Wrap long lines at 80 characters", tip: "Break lines longer than 80 characters between words.", fn: (t) => hardWrap(t, 80) },
  { id: "wrap72", group: "Clean up", label: "Wrap long lines at 72 characters", tip: "Break lines longer than 72 characters between words (e-mail style).", fn: (t) => hardWrap(t, 72) },
  { id: "straighten", group: "Clean up", label: "Straighten curly quotes and dashes", tip: "“ ” ‘ ’ become plain quotes; – and — become - and --; … becomes ...", fn: (t) => SMART.reduce((s, [re, to]) => s.replace(re, to), t) },
  { id: "invisible", group: "Clean up", label: "Remove invisible characters", tip: "Delete zero-width spaces and joiners, byte-order marks and soft hyphens; non-breaking spaces become normal spaces.", fn: (t) => t.replace(/[\u200b\u200c\u2060\ufeff\u00ad]/g, "").replace(/[\u00a0\u2007\u202f\u2009\u2003\u2002]/g, " ") },
  { id: "control", group: "Clean up", label: "Remove control characters", tip: "Delete odd characters that can't be seen (everything except tabs and line breaks).", fn: (t) => t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "") },
  { id: "ascii", group: "Clean up", label: "Remove everything that isn't plain ASCII", tip: "Keep only letters without accents, digits, punctuation and spaces. Accents and other scripts are deleted.", fn: (t) => t.replace(/[^\u0000-\u007f]/g, "") },
  { id: "noEmoji", group: "Clean up", label: "Remove emoji", tip: "Delete emoji and pictograms.", fn: (t) => t.replace(EMOJI, "") },
  { id: "stripTags", group: "Clean up", label: "Remove HTML tags", tip: "Keep only the text between <tags> (and turn &entities; into characters).", fn: (t) => htmlDecode(t.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "")) },
  { id: "nfkc", group: "Clean up", label: "Normalise look-alike characters (ﬁ → fi, ² → 2)", tip: "Unicode compatibility form: ligatures, full-width letters and superscripts become ordinary characters.", fn: (t) => t.normalize("NFKC") },
  { id: "noAccents", group: "Clean up", label: "Remove accents (é → e)", tip: "Take accents off Latin and Greek letters; ß becomes ss, æ becomes ae.", fn: (t) => changeDiacritics(t, "remove", true) },
  { id: "joinAccents", group: "Clean up", label: "Join letters and accents (fix split accents)", tip: "Make é one character again when it was stored as e plus a separate accent.", fn: (t) => t.normalize("NFC") },
  { id: "splitAccents", group: "Clean up", label: "Split letters and accents", tip: "Store each accent as a separate mark after its letter.", fn: (t) => t.normalize("NFD") },

  // Lines
  { id: "numberLines", group: "Lines", label: "Number the lines (1. 2. 3.)", tip: "Put 1. 2. 3. in front of each line.", fn: (t) => { const L = lines(t); const w = String(L.length).length; return L.map((l, i) => `${String(i + 1).padStart(w, " ")}. ${l}`).join(eolOf(t)); } },
  { id: "unnumber", group: "Lines", label: "Remove line numbers and list numbers", tip: "Delete 1. or 2) or 3: at the start of each line.", fn: perLine((l) => l.replace(/^(\s*)\d+\s*[.):\]-]\s?/, "$1")) },
  { id: "bullets", group: "Lines", label: "Make a bullet list (- )", tip: "Put - in front of each non-empty line.", fn: perLine((l) => (l.trim() ? l.replace(/^(\s*)/, "$1- ") : l)) },
  { id: "unbullet", group: "Lines", label: "Remove bullets (- * •)", tip: "Delete - or * or • at the start of each line.", fn: perLine((l) => l.replace(/^(\s*)[-*•·▪‣]\s+/, "$1")) },
  { id: "quote", group: "Lines", label: "Quote each line (> )", tip: "Put > in front of each line, like an e-mail reply.", fn: perLine((l) => `> ${l}`.trimEnd()) },
  { id: "unquote", group: "Lines", label: "Remove the quote marks (> ) from each line", tip: "Delete > at the start of each line.", fn: perLine((l) => l.replace(/^(\s*)>\s?/, "$1")) },
  { id: "dq", group: "Lines", label: 'Put "double quotes" around each line', tip: "Wrap every non-empty line in double quotes.", fn: perLine((l) => (l.trim() ? `"${l.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : l)) },
  { id: "sq", group: "Lines", label: "Put 'single quotes' around each line", tip: "Wrap every non-empty line in single quotes.", fn: perLine((l) => (l.trim() ? `'${l.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'` : l)) },
  { id: "toComma", group: "Lines", label: "Lines to one comma-separated line", tip: "a, b, c on one line.", fn: (t) => lines(t).map((l) => l.trim()).filter(Boolean).join(", ") },
  { id: "fromComma", group: "Lines", label: "Comma-separated list to lines", tip: "One item per line (commas and semicolons separate items).", fn: (t) => t.split(/\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean).join(eolOf(t)) },
  { id: "toJsonArray", group: "Lines", label: "Lines to a JSON list of strings", tip: 'Make ["a", "b", "c"] from one item per line.', fn: (t) => JSON.stringify(lines(t).filter((l) => l.trim() !== "")) },
  { id: "fromJsonArray", group: "Lines", label: "JSON list to lines", tip: "One item per line, from a JSON array.", fn: (t) => { let v; try { v = JSON.parse(t); } catch { throw new Error("That isn't valid JSON."); } if (!Array.isArray(v)) throw new Error("That JSON isn't a list (it should start with [)."); return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(eolOf(t)); } },
  { id: "sortLength", group: "Lines", label: "Sort lines by length", tip: "Shortest line first.", fn: (t) => lines(t).sort((a, b) => a.length - b.length).join(eolOf(t)) },
  { id: "shuffle", group: "Lines", label: "Shuffle the lines (random order)", tip: "Put the lines in a random order.", fn: (t) => { const L = lines(t); for (let i = L.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [L[i], L[j]] = [L[j], L[i]]; } return L.join(eolOf(t)); } },
  { id: "reverseText", group: "Lines", label: "Reverse the text (back to front)", tip: "The whole text read backwards, letter by letter.", fn: (t) => [...(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t))].map((s) => s.segment).reverse().join("") },
  { id: "reverseWords", group: "Lines", label: "Reverse the words in each line", tip: "Last word first.", fn: perLine((l) => l.split(/(\s+)/).reverse().join("")) },

  // Encode and escape
  { id: "b64", group: "Encode & escape", label: "Base64 encode", tip: "Turn the text (as UTF-8) into Base64.", fn: (t) => toBase64(enc.encode(t)) },
  { id: "unb64", group: "Encode & escape", label: "Base64 decode", tip: "Turn Base64 back into text.", fn: fromBase64 },
  { id: "hex", group: "Encode & escape", label: "Text to hex bytes", tip: "Each byte of the text (as UTF-8) as two hex digits: 48 65 6c 6c 6f.", fn: (t) => [...enc.encode(t)].map((b) => b.toString(16).padStart(2, "0")).join(" ") },
  { id: "unhex", group: "Encode & escape", label: "Hex bytes to text", tip: "Read 48 65 6c 6c 6f (or 48656c6c6f, or 0x48,0x65) as text.", fn: (t) => { const c = t.replace(/0x/gi, "").replace(/[\s,:-]+/g, ""); if (!c || c.length % 2 || /[^0-9a-f]/i.test(c)) throw new Error("That isn't hex (it needs pairs of the digits 0-9 and a-f)."); try { return dec.decode(Uint8Array.from(c.match(/../g), (h) => parseInt(h, 16))); } catch { throw new Error("Those bytes aren't valid UTF-8 text."); } } },
  { id: "bin", group: "Encode & escape", label: "Text to binary", tip: "Each byte as eight 0s and 1s.", fn: (t) => [...enc.encode(t)].map((b) => b.toString(2).padStart(8, "0")).join(" ") },
  { id: "unbin", group: "Encode & escape", label: "Binary to text", tip: "Read groups of eight 0s and 1s as text.", fn: (t) => { const c = t.replace(/\s+/g, ""); if (!c || c.length % 8 || /[^01]/.test(c)) throw new Error("That isn't binary (groups of eight 0s and 1s)."); try { return dec.decode(Uint8Array.from(c.match(/.{8}/g), (b) => parseInt(b, 2))); } catch { throw new Error("Those bytes aren't valid UTF-8 text."); } } },
  { id: "urlEnc", group: "Encode & escape", label: "URL-encode (%20)", tip: "Spaces and symbols become %20 style codes.", fn: (t) => encodeURIComponent(t) },
  { id: "urlDec", group: "Encode & escape", label: "URL-decode", tip: "%20 style codes (and +) become characters.", fn: (t) => { try { return decodeURIComponent(t.replace(/\+/g, " ")); } catch { throw new Error("That isn't valid web-address encoding (a % isn't followed by two digits)."); } } },
  { id: "htmlEnc", group: "Encode & escape", label: "HTML-escape (& → &amp;)", tip: "Make < > & and quotes safe to put in a web page.", fn: htmlEncode },
  { id: "htmlDec", group: "Encode & escape", label: "HTML-unescape (&amp; → &)", tip: "Turn &amp; &lt; &#233; and similar into characters.", fn: htmlDecode },
  { id: "jsonEsc", group: "Encode & escape", label: "Escape for a JSON or JavaScript string", tip: 'Quotes, backslashes and line breaks become \\" \\\\ \\n (without the outer quotes).', fn: (t) => JSON.stringify(t).slice(1, -1) },
  { id: "jsonUnesc", group: "Encode & escape", label: "Unescape a JSON or JavaScript string", tip: "\\n \\t \\\" \\u00e9 become the real characters.", fn: (t) => { try { return JSON.parse(`"${t.replace(/\r?\n/g, "\\n").replace(/(?<!\\)"/g, '\\"')}"`); } catch { throw new Error("That has an escape that isn't valid (for example a lone backslash)."); } } },
  { id: "uEsc", group: "Encode & escape", label: "Non-ASCII to \\uXXXX escapes", tip: "é becomes \\u00e9, so the text is plain ASCII.", fn: (t) => t.replace(/[^\u0000-\u007f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) },
  { id: "uUnesc", group: "Encode & escape", label: "\\uXXXX escapes to characters", tip: "\\u00e9 becomes é (\\u{1F600} works too).", fn: (t) => t.replace(/\\u\{([0-9a-fA-F]{1,6})\}|\\u([0-9a-fA-F]{4})/g, (m, a, b) => { const n = parseInt(a || b, 16); return n <= 0x10ffff ? String.fromCodePoint(n) : m; }) },
  { id: "regexEsc", group: "Encode & escape", label: "Escape for a regular expression", tip: "Put a backslash before characters such as . * + ? ( ) [ ] so they match themselves.", fn: (t) => t.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&") },
  { id: "shellEsc", group: "Encode & escape", label: "Quote for a shell command", tip: "Wrap in single quotes so a terminal treats it as one plain word.", fn: (t) => `'${t.replace(/'/g, `'\\''`)}'` },
  { id: "rot13", group: "Encode & escape", label: "ROT13", tip: "Swap each letter with the one 13 places on (a simple scramble; run it again to undo).", fn: (t) => t.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= "Z" ? 65 : 97) + ((c.charCodeAt(0) - (c <= "Z" ? 65 : 97) + 13) % 26))) },
  { id: "morse", group: "Encode & escape", label: "Text to Morse code", tip: "Letters and digits as dots and dashes; / between words.", fn: (t) => t.toLowerCase().split(/\s+/).filter(Boolean).map((w) => [...w].map((c) => MORSE[c]).filter(Boolean).join(" ")).join(" / ") },
  { id: "unmorse", group: "Encode & escape", label: "Morse code to text", tip: "Dots and dashes (letters separated by spaces, words by /).", fn: (t) => t.trim().split(/\s*\/\s*/).map((w) => w.split(/\s+/).map((c) => UNMORSE[c] ?? "?").join("")).join(" ") },
  { id: "slug", group: "Encode & escape", label: "Make a URL slug (my-page-title)", tip: "Lower case, no accents, words joined by - (each line separately).", fn: perLine(slug) },

  // Extract
  { id: "urls", group: "Extract", label: "Extract the web addresses", tip: "Keep only the http(s) links, one per line, without repeats.", fn: extract(/https?:\/\/[^\s<>"'`)\]]+/gi, "web addresses", (u) => u.replace(/[.,;:!?]+$/, "")) },
  { id: "emails", group: "Extract", label: "Extract the e-mail addresses", tip: "Keep only the e-mail addresses, one per line, without repeats.", fn: extract(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu, "e-mail addresses") },
  { id: "numbers", group: "Extract", label: "Extract the numbers", tip: "Keep only the numbers (with decimals and minus signs), one per line.", fn: (t) => { const f = t.match(/-?\d+(?:[.,]\d+)?/g); if (!f) throw new Error("No numbers found."); return f.join(eolOf(t)); } },
  { id: "ips", group: "Extract", label: "Extract the IPv4 addresses", tip: "Keep only things like 192.168.0.1, one per line, without repeats.", fn: extract(/\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g, "IPv4 addresses") },
  { id: "hashtags", group: "Extract", label: "Extract the #hashtags", tip: "Keep only the #tags, one per line, without repeats.", fn: extract(/#[\p{L}\p{N}_]+/gu, "hashtags") },
  { id: "wordList", group: "Extract", label: "One word per line", tip: "Split the text into its words, one on each line.", fn: (t) => { const f = t.match(/[\p{L}\p{N}'’-]+/gu); if (!f) throw new Error("No words found."); return f.join(eolOf(t)); } },
  { id: "uniqueWords", group: "Extract", label: "List the different words (A to Z)", tip: "Each word once, in alphabetical order, ignoring capitals.", fn: (t) => { const f = t.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu); if (!f) throw new Error("No words found."); return uniq(f).sort((a, b) => a.localeCompare(b)).join(eolOf(t)); } },

  // Dates
  { id: "unixToDate", group: "Dates & numbers", label: "Unix timestamps to dates", tip: "Numbers like 1700000000 (or in milliseconds) become 2023-11-14 22:13:20 UTC (each line separately).", fn: perLine((l) => l.replace(/\b\d{10}(\d{3})?\b/g, (m) => { const d = new Date(m.length === 13 ? Number(m) : Number(m) * 1000); return Number.isNaN(d.getTime()) ? m : d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC"); })) },
  { id: "dateToUnix", group: "Dates & numbers", label: "Dates to Unix timestamps", tip: "Dates like 2023-11-14 or 2023-11-14T22:13:20Z (without a zone: UTC) become seconds since 1970 (each line separately).", fn: perLine((l) => { const s = l.trim(); if (!s) return l; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(" ", "T")}Z`); return Number.isNaN(d.getTime()) ? l : String(Math.floor(d.getTime() / 1000)); }) },
  { id: "thousands", group: "Dates & numbers", label: "Add thousands separators (1234567 → 1,234,567)", tip: "Put commas in long whole numbers.", fn: (t) => t.replace(/(?<![\d.,])\d{4,}(?![\d,])(?:\.\d+)?/g, (m) => { const [i, f] = m.split("."); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : ""); }) },
  { id: "unthousands", group: "Dates & numbers", label: "Remove thousands separators (1,234,567 → 1234567)", tip: "Take the commas out of numbers like 1,234,567.", fn: (t) => t.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, (m) => m.replace(/,/g, "")) },
];

export const TRANSFORM_BY_ID = new Map(TRANSFORMS.map((t) => [t.id, t]));
export const TRANSFORM_GROUPS = [...new Set(TRANSFORMS.map((t) => t.group))];

/**
 * An edit for the Code tab: the conversion applied to the selection, or to the whole text when nothing is selected.
 * Answers `{ message }` when it can't be done or nothing would change.
 */
export function convertText(text, s, e, id) {
  const t = TRANSFORM_BY_ID.get(id);
  if (!t) return { message: "That conversion isn't known." };
  const whole = s === e;
  const from = whole ? 0 : s;
  const to = whole ? text.length : e;
  const before = text.slice(from, to);
  if (!before.trim()) return { message: whole ? "The file is empty." : "Select some text first, or clear the selection to convert the whole file." };
  let after;
  try {
    after = t.fn(before);
  } catch (err) {
    return { message: err?.message || "That text can't be converted." };
  }
  if (after === before) return { message: "Nothing needed changing." };
  return { from, to, insert: after, selStart: whole ? Math.min(s, after.length) : from, selEnd: whole ? Math.min(e, after.length) : from + after.length };
}
