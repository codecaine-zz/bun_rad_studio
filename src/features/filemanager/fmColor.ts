/** The colour converter of the Crypto tab: any CSS colour in, every common way to write it out, with `Bun.color`. */
import { FmError } from "./fmPaths";

export const MAX_COLOR_CHARS = 200;

interface ColorFormat {
  id: string;
  label: string;
  hint: string;
  /** What `Bun.color` is asked for. */
  format: string;
  /** Written out so that an invisible escape character can be read and copied. */
  escapes?: boolean;
}

const FORMATS: ColorFormat[] = [
  { id: "css", label: "CSS (shortest)", hint: "The shortest way to write it in a style sheet: a colour name when there is one, otherwise short hex.", format: "css" },
  { id: "hex", label: "Hex #rrggbb", hint: "Six hex digits: red, green and blue. Transparency is not part of this form.", format: "hex" },
  { id: "HEX", label: "Hex in capitals", hint: "The same hex form with capital letters, as some design tools write it.", format: "HEX" },
  { id: "rgb", label: "rgb( )", hint: "Red, green and blue from 0 to 255, in the CSS rgb() form.", format: "rgb" },
  { id: "rgba", label: "rgba( )", hint: "Like rgb() with a fourth number for transparency (1 is solid, 0 is invisible). Transparency is kept in 8 bits, so 0.5 shows as 0.502.", format: "rgba" },
  { id: "hsl", label: "hsl( )", hint: "Hue (the colour wheel in degrees), saturation and lightness, which are easier to adjust by hand.", format: "hsl" },
  { id: "lab", label: "lab( )", hint: "The CIE Lab form, based on how people see lightness and colour differences.", format: "lab" },
  { id: "number", label: "Number", hint: "The colour as one whole number (0xRRGGBB written in decimal), used by some programs and games.", format: "number" },
  { id: "{rgb}", label: "{ r, g, b } object", hint: "A JSON object with red, green and blue from 0 to 255, for use in code.", format: "{rgb}" },
  { id: "{rgba}", label: "{ r, g, b, a } object", hint: "A JSON object with red, green, blue and transparency (0 to 1), for use in code.", format: "{rgba}" },
  { id: "[rgb]", label: "[ r, g, b ] list", hint: "A list of the three numbers, for use in code.", format: "[rgb]" },
  { id: "[rgba]", label: "[ r, g, b, a ] list", hint: "A list of four numbers; the last is transparency from 0 to 255.", format: "[rgba]" },
  { id: "ansi-16", label: "Terminal, 16 colours", hint: "The closest of the 16 basic terminal colours, written as the escape code a program prints (ESC is shown as \\x1b).", format: "ansi-16", escapes: true },
  { id: "ansi-256", label: "Terminal, 256 colours", hint: "The closest of the 256 terminal colours, as the escape code a program prints (ESC is shown as \\x1b).", format: "ansi-256", escapes: true },
  { id: "ansi-16m", label: "Terminal, true colour", hint: "The exact colour as a true-colour terminal escape code (ESC is shown as \\x1b).", format: "ansi-16m", escapes: true },
];

export interface ColorRow {
  id: string;
  label: string;
  value: string;
  hint: string;
}

export interface ColorResult {
  /** What was read, tidied (spaces removed, lower case). */
  input: string;
  /** The colour in a form a browser draws (for the swatch). */
  swatch: string;
  rows: ColorRow[];
  notes: string[];
}

const show = (value: unknown, escapes: boolean): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return escapes ? text.replace(/\u001b/g, "\\x1b") : text;
};

/** Reads a colour the way CSS writes it (names, #hex, rgb(), hsl(), lab(), oklch(), ...) and writes it in every common form. */
export function convertColor(raw: unknown): ColorResult {
  if (raw !== undefined && raw !== null && typeof raw !== "string") throw new FmError("BAD_REQUEST", "That colour isn't text.");
  const typed = (raw ?? "").trim();
  if (!typed) throw new FmError("BAD_REQUEST", "Type a colour first, like red, #ff8800 or rgb(255 136 0).");
  if (typed.length > MAX_COLOR_CHARS) throw new FmError("TOO_LARGE", "That is too long to be a colour.");
  const input = typed.toLowerCase();
  // Bun reads a colour at the start and ignores whatever follows ("red; x" gives red), so be strict about the whole text.
  const oneColour = /^(?:[a-z]+|#[0-9a-f]{3,8}|0x[0-9a-f]{6}|[a-z][a-z-]*\([0-9a-z\s.,%/+\-*()]*\))$/.test(input);
  const asNumber = /^0x[0-9a-f]{6}$/.exec(input) ? parseInt(input.slice(2), 16) : null;
  const read = (format: string): unknown => {
    try {
      return oneColour ? Bun.color(asNumber ?? input, format as "css") : null;
    } catch {
      return null;
    }
  };
  const css = read("css");
  if (typeof css !== "string" || css.toLowerCase() === "currentcolor") {
    throw new FmError("BAD_COLOR", `Couldn't read "${typed.length > 40 ? `${typed.slice(0, 40)}…` : typed}" as a colour. Try a name (rebeccapurple), hex (#ff8800 or #f80), rgb(255 136 0), hsl(32 100% 50%), lab() or oklch().`);
  }
  const rows: ColorRow[] = [];
  const missing: string[] = [];
  for (const f of FORMATS) {
    const value = read(f.format);
    const wide = typeof value === "string" && /^color\(/.test(value) && f.id !== "css";
    if (value === null || value === undefined || value === "" || wide) missing.push(f.label);
    else rows.push({ id: f.id, label: f.label, value: show(value, f.escapes === true), hint: f.hint });
  }
  const notes: string[] = [];
  if (missing.length) notes.push(`Not available for this colour: ${missing.join(", ")}. It lies outside the ordinary screen colours (sRGB) these forms can hold.`);
  const rgba = read("{rgba}") as { a?: number } | null;
  if (rgba && typeof rgba === "object" && typeof rgba.a === "number" && rgba.a < 1) notes.push("This colour is partly transparent. Hex #rrggbb drops the transparency; the CSS form keeps it as extra digits.");
  return { input, swatch: css, rows, notes };
}
