/**
 * Reading values written by people: dates in many layouts, numbers with thousands separators, yes/no words.
 * Everything here works on text and never uses floating point for numbers, so no digit is changed.
 */

export type DateOrder = "YMD" | "DMY" | "MDY";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export interface ParsedDate {
  y: number;
  m: number;
  d: number;
  time?: { h: number; mi: number; s: number; frac: string };
  tz?: string;
  /** True when day and month could be swapped (both 12 or less) and the layout did not say which is which. */
  ambiguous?: boolean;
}

export function daysInMonth(y: number, m: number): number {
  return m === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
}

const validYmd = (y: number, m: number, d: number) => y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const twoDigitYear = (y: number) => (y < 69 ? 2000 + y : 1900 + y);

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?\s*(am|pm|a\.m\.|p\.m\.)?\s*(z|utc|gmt|[+-]\d{2}(?::?\d{2})?)?$/i;

function parseTime(text: string): ParsedDate["time"] & { tz?: string } | null {
  const m = TIME_RE.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  const ap = m[5]?.toLowerCase().replace(/\./g, "");
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  }
  if (h > 23 || mi > 59 || s > 59) return null;
  let tz: string | undefined;
  if (m[6]) {
    const z = m[6].toLowerCase();
    if (z === "z" || z === "utc" || z === "gmt") tz = "Z";
    else {
      const digits = z.replace(":", "");
      tz = `${digits[0]}${digits.slice(1, 3)}:${digits.slice(3, 5) || "00"}`;
    }
  }
  return { h, mi, s, frac: m[4] ?? "", ...(tz ? { tz } : {}) };
}

function withTime(base: ParsedDate, timeText: string | undefined): ParsedDate | null {
  if (!timeText) return base;
  const t = parseTime(timeText);
  if (!t) return null;
  const { tz, ...time } = t;
  return { ...base, time, ...(tz ? { tz } : {}) };
}

/** Reads one date or date-time. `order` says how to read 03/04/2024; "auto" decides per value and calls a tie ambiguous. */
export function parseDate(text: string, order: DateOrder | "auto" = "auto"): ParsedDate | null {
  const s = text.trim().replace(/\s+/g, " ");
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:(?:T|\s)\s*(.+))?$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? withTime({ y, m: mo, d }, m[4]) : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:(?:T|\s)\s*(.+))?$/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3]!.length === 2 ? twoDigitYear(Number(m[3])) : Number(m[3]);
    let day: number;
    let mon: number;
    let ambiguous = false;
    if (order === "DMY") [day, mon] = [a, b];
    else if (order === "MDY") [mon, day] = [a, b];
    else if (order === "YMD") return null;
    else if (a > 12) [day, mon] = [a, b];
    else if (b > 12) [mon, day] = [a, b];
    else {
      [mon, day] = [a, b];
      ambiguous = a !== b;
    }
    return validYmd(y, mon, day) ? withTime({ y, m: mon, d: day, ...(ambiguous ? { ambiguous } : {}) }, m[4]) : null;
  }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})(?:(?:,|\s)\s*(.+))?$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2]!.toLowerCase()];
    const d = Number(m[1]);
    const y = Number(m[3]);
    return mo && validYmd(y, mo, d) ? withTime({ y, m: mo, d }, m[4]) : null;
  }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:(?:,|\s)\s*(.+))?$/.exec(s);
  if (m) {
    const mo = MONTHS[m[1]!.toLowerCase()];
    const d = Number(m[2]);
    const y = Number(m[3]);
    return mo && validYmd(y, mo, d) ? withTime({ y, m: mo, d }, m[4]) : null;
  }
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return y >= 1900 && y <= 2100 && validYmd(y, mo, d) ? { y, m: mo, d } : null;
  }
  return null;
}

export const formatDate = (p: ParsedDate): string => `${pad(p.y, 4)}-${pad(p.m)}-${pad(p.d)}`;

export function formatDateTime(p: ParsedDate): string {
  const t = p.time ?? { h: 0, mi: 0, s: 0, frac: "" };
  return `${formatDate(p)} ${pad(t.h)}:${pad(t.mi)}:${pad(t.s)}${t.frac ? "." + t.frac : ""}${p.tz && p.tz !== "Z" ? p.tz : p.tz ?? ""}`;
}

/** Which way round are the day and the month in these values? "unknown" means every value could be read both ways. */
export function detectDateOrder(values: string[]): { order: DateOrder | "unknown"; iso: boolean } {
  let iso = 0;
  let dmy = 0;
  let mdy = 0;
  let total = 0;
  for (const v of values) {
    const s = v.trim();
    if (!s) continue;
    total++;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) {
      iso++;
      continue;
    }
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(s);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    else if (Number(m[2]) > 12) mdy++;
  }
  if (total > 0 && iso === total) return { order: "YMD", iso: true };
  if (dmy && !mdy) return { order: "DMY", iso: false };
  if (mdy && !dmy) return { order: "MDY", iso: false };
  return { order: "unknown", iso: false };
}

export type NumberLocale = "us" | "eu" | "auto";

/**
 * Turns "1,234.50", "1.234,50", "€ 1 234,50", "(12.5)" or "7-" into a plain number text such as "1234.50".
 * Returns null when the text is not a number. Digits are never rounded.
 */
export function parseNumber(text: string, locale: NumberLocale = "auto"): string | null {
  let s = text.trim().replace(/[\u00a0\u202f\u2009 ]/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^[€$£¥₹]+|[€$£¥₹]+$/g, "").replace(/^(usd|eur|gbp)|(usd|eur|gbp)$/i, "");
  if (/-$/.test(s)) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!s || !/^[\d.,'’]+(?:[eE][+-]?\d+)?$/.test(s)) return null;
  let exp = "";
  const em = /([eE][+-]?\d+)$/.exec(s);
  if (em) {
    exp = em[1]!;
    s = s.slice(0, -exp.length);
  }
  s = s.replace(/['’]/g, "");
  let intPart = "";
  let frac = "";
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const decimalIs = (sep: "." | ","): void => {
    const group = sep === "." ? "," : ".";
    const idx = s.lastIndexOf(sep);
    const head = s.slice(0, idx);
    const tail = s.slice(idx + 1);
    if (head.includes(sep) || tail.includes(group)) throw new Error("bad");
    intPart = head.split(group).join("");
    frac = tail;
  };
  try {
    if (locale === "us") {
      if (lastComma > lastDot && lastDot !== -1) return null;
      if (lastDot === -1) intPart = s.split(",").join("");
      else decimalIs(".");
    } else if (locale === "eu") {
      if (lastDot > lastComma && lastComma !== -1) return null;
      if (lastComma === -1) intPart = s.split(".").join("");
      else decimalIs(",");
    } else if (lastDot !== -1 && lastComma !== -1) decimalIs(lastDot > lastComma ? "." : ",");
    else if (lastComma !== -1) {
      if (/^\d{1,3}(,\d{3})+$/.test(s)) intPart = s.split(",").join("");
      else decimalIs(",");
    } else if (lastDot !== -1) {
      if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) intPart = s.split(".").join("");
      else decimalIs(".");
    } else intPart = s;
  } catch {
    return null;
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || (intPart === "" && frac === "")) return null;
  const out = `${intPart === "" ? "0" : intPart}${frac ? "." + frac : ""}${exp}`;
  return negative && !/^0(\.0*)?$/.test(out) ? "-" + out : out;
}

const TRUE_WORDS = new Set(["true", "t", "yes", "y", "1", "on", "si", "sí", "ja", "oui", "x"]);
const FALSE_WORDS = new Set(["false", "f", "no", "n", "0", "off", "nein", "non"]);

/** "yes"/"Y"/"1"/"on" → "true", "no"/"N"/"0"/"off" → "false"; anything else → null. */
export function parseBoolean(text: string): "true" | "false" | null {
  const s = text.trim().toLowerCase();
  if (TRUE_WORDS.has(s)) return "true";
  if (FALSE_WORDS.has(s)) return "false";
  return null;
}

export function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s\-'’(/])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

export type InferredKind = "integer" | "decimal" | "boolean" | "date" | "timestamp" | "uuid" | "json" | "text";

export interface InferredColumn {
  kind: InferredKind;
  nullable: boolean;
  /** Longest value, in characters. */
  maxLength: number;
  /** For decimals: most digits before and after the point. */
  intDigits: number;
  scale: number;
  dateOrder?: DateOrder | "unknown";
  numberLocale?: NumberLocale;
  /** Values that were empty. */
  empty: number;
  /** Values looked at. */
  sampled: number;
  /** True when the plain values would need cleaning first (thousands separators, currency, yes/no words, other date layouts). */
  needsCleaning: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guesses what kind of value a column holds from a sample. Cautious: anything doubtful is text. */
export function inferColumn(values: (string | null)[]): InferredColumn {
  const present = values.filter((v): v is string => v !== null && v.trim() !== "");
  const out: InferredColumn = { kind: "text", nullable: present.length < values.length, maxLength: 0, intDigits: 0, scale: 0, empty: values.length - present.length, sampled: values.length, needsCleaning: false };
  for (const v of present) out.maxLength = Math.max(out.maxLength, v.length);
  if (!present.length) return out;
  const all = (fn: (v: string) => boolean) => present.every(fn);
  const leadingZero = present.some((v) => /^[+-]?0\d/.test(v.trim()));
  if (!leadingZero && all((v) => /^[+-]?\d{1,18}$/.test(v.trim()))) return { ...out, kind: "integer", intDigits: Math.max(...present.map((v) => v.replace(/^[+-]/, "").length)) };
  if (!leadingZero && all((v) => /^[+-]?(\d+\.\d+|\.\d+|\d+\.)(e[+-]?\d+)?$/i.test(v.trim()) || /^[+-]?\d+$/.test(v.trim()))) {
    return { ...out, kind: "decimal", ...digitsOf(present, (v) => v.trim()), numberLocale: "us" };
  }
  if (all((v) => UUID_RE.test(v.trim()))) return { ...out, kind: "uuid" };
  if (present.some((v) => /[a-z]/i.test(v)) && all((v) => parseBoolean(v) !== null && !/^[01]$/.test(v.trim()) && v.trim().length <= 5)) return { ...out, kind: "boolean", needsCleaning: !all((v) => /^(true|false)$/i.test(v.trim())) };
  const dates = present.map((v) => parseDate(v));
  if (dates.every((d) => d !== null) && all((v) => /\d/.test(v))) {
    const { order } = detectDateOrder(present);
    const hasTime = dates.some((d) => d!.time);
    const reparsed = order === "unknown" ? dates : present.map((v) => parseDate(v, order));
    if (reparsed.every((d) => d !== null)) {
      const isoOnly = present.every((v) => (hasTime ? /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/ : /^\d{4}-\d{2}-\d{2}$/).test(v.trim()));
      return { ...out, kind: hasTime ? "timestamp" : "date", dateOrder: order, needsCleaning: !isoOnly };
    }
  }
  if (present.length && all((v) => parseNumber(v, "auto") !== null && /\d/.test(v)) && !leadingZero) {
    const euCount = present.filter((v) => /\d,\d{1,2}$|\d\.\d{3},/.test(v.replace(/\s/g, ""))).length;
    const locale: NumberLocale = euCount > 0 ? "eu" : "us";
    const nums = present.map((v) => parseNumber(v, locale)!);
    if (nums.every((n) => !n.includes("e") && !n.includes("E"))) {
      const isInt = nums.every((n) => /^-?\d{1,18}$/.test(n));
      return { ...out, kind: isInt ? "integer" : "decimal", ...digitsOf(nums, (n) => n), numberLocale: locale, needsCleaning: true };
    }
  }
  if (all((v) => /^\s*[\[{]/.test(v) && safeJson(v))) return { ...out, kind: "json" };
  return out;
}

function digitsOf(values: string[], get: (v: string) => string): { intDigits: number; scale: number } {
  let intDigits = 1;
  let scale = 0;
  for (const raw of values) {
    const [i = "", f = ""] = get(raw).replace(/^[+-]/, "").replace(/e.*$/i, "").split(".");
    intDigits = Math.max(intDigits, i.length);
    scale = Math.max(scale, f.length);
  }
  return { intDigits, scale };
}

function safeJson(v: string): boolean {
  try {
    JSON.parse(v);
    return true;
  } catch {
    return false;
  }
}
