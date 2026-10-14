/**
 * The choices a person can make for a conversion (quality, size, times, page ranges...), and the checks that make
 * sure nothing else gets through. Every value that reaches a command line has been through `validateOptions`:
 * choices must be one of the listed values, numbers are limited to a range, times and page ranges must match a
 * strict pattern, and text is limited in length and stripped of control characters.
 */
import { FmError } from "./fmPaths";

export type OptionKind = "choice" | "number" | "time" | "pages" | "text" | "name" | "toggle";

export interface OptionChoice {
  value: string;
  label: string;
  /** A capability the program must have for this choice (see fmBatch); the choice is greyed out without it. */
  needs?: string;
}

export interface OptionDef {
  id: string;
  label: string;
  /** One plain sentence shown under the field. */
  hint: string;
  kind: OptionKind;
  choices?: OptionChoice[];
  /** The choices are the installed languages (or similar) the program reports: capability names that start with `prefix`. */
  choicesFromCaps?: { prefix: string };
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default: string | number | boolean;
  /** Text and name fields: the longest value allowed (default 100). */
  maxLength?: number;
  /** Only shown (and used) when another option has one of these values. */
  showWhen?: { option: string; values: string[] };
  /** Only shown when at least one of the selected files has one of these extensions. */
  forExts?: string[];
}

export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;

const TIME = /^(?:\d{1,3}:)?\d{1,2}:\d{1,2}(?:\.\d{1,3})?$|^\d{1,6}(?:\.\d{1,3})?$/;
const PAGES = /^\d{1,6}(?:-\d{1,6})?(?:,\d{1,6}(?:-\d{1,6})?)*$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** Seconds in a time written as 90, 90.5, 1:30, 01:30.5 or 1:01:30.5; null when it isn't one of those. */
export function parseTime(text: string): number | null {
  if (!TIME.test(text)) return null;
  const parts = text.split(":").map(Number);
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return seconds;
}

/** The pages of a range like "1-3,5" as a sorted, de-duplicated list; null when it is not a valid range. */
export function parsePages(text: string, limit = 100_000): number[] | null {
  if (!PAGES.test(text)) return null;
  const pages = new Set<number>();
  for (const part of text.split(",")) {
    const [a, b] = part.split("-").map(Number) as [number, number | undefined];
    const end = b ?? a;
    if (a < 1 || end < a || end > limit || end - a > 20_000) return null;
    for (let i = a; i <= end; i++) pages.add(i);
    if (pages.size > 20_000) return null;
  }
  return [...pages].sort((x, y) => x - y);
}

function fail(def: OptionDef, why: string): never {
  throw new FmError("BAD_OPTION", `${def.label}: ${why}`);
}

/** Checks one value against its definition and returns the cleaned value. Throws a plain-language FmError. */
export function validateOne(def: OptionDef, raw: unknown, allowed?: string[]): OptionValue {
  if (raw === undefined || raw === null) return def.default;
  switch (def.kind) {
    case "toggle": {
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      return fail(def, "choose yes or no.");
    }
    case "choice": {
      const values = allowed ?? def.choices?.map((c) => c.value) ?? [];
      if (typeof raw !== "string" || !values.includes(raw)) return fail(def, "that choice isn't available.");
      return raw;
    }
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" && /^-?\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
      if (!Number.isFinite(n)) return fail(def, "type a number.");
      const lo = def.min ?? -1e9;
      const hi = def.max ?? 1e9;
      const clamped = Math.min(hi, Math.max(lo, n));
      const step = def.step ?? 1;
      return Number.isInteger(step) ? Math.round(clamped) : Math.round(clamped / step) * step;
    }
    case "time": {
      if (typeof raw !== "string" && typeof raw !== "number") return fail(def, "type a time like 1:30 or 90.5.");
      const text = String(raw).trim();
      if (text === "") return "";
      const seconds = parseTime(text);
      if (seconds === null || seconds > 360_000) return fail(def, "type a time like 1:30, 00:01:30.5 or 90.");
      return text;
    }
    case "pages": {
      if (typeof raw !== "string") return fail(def, "type pages like 1-3,5.");
      const text = raw.replace(/\s+/g, "");
      if (text === "") return "";
      if (!parsePages(text)) return fail(def, "type pages like 1-3,5 (the first number can't be bigger than the last).");
      return text;
    }
    case "name": {
      if (typeof raw !== "string") return fail(def, "type a name.");
      const text = raw.trim();
      if (!NAME.test(text)) return fail(def, "use letters, digits, _ . and - only, starting with a letter or _.");
      return text;
    }
    case "text": {
      if (typeof raw !== "string") return fail(def, "type some text.");
      const text = raw.replace(CONTROL, " ").trim();
      if (text.length > (def.maxLength ?? 100)) return fail(def, `that is too long (at most ${def.maxLength ?? 100} characters).`);
      return text;
    }
  }
}

/**
 * The cleaned values for an action's options. Options the action doesn't have are dropped. A missing option gets
 * its default. `dynamicChoices` lets the caller narrow a choice to what the installed program supports.
 */
export function validateOptions(defs: OptionDef[] | undefined, raw: unknown, dynamicChoices: Record<string, string[]> = {}): OptionValues {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) throw new FmError("BAD_OPTION", "The options weren't understood.");
  const given = (raw ?? {}) as Record<string, unknown>;
  const out: OptionValues = {};
  for (const def of defs ?? []) {
    out[def.id] = validateOne(def, Object.prototype.hasOwnProperty.call(given, def.id) ? given[def.id] : undefined, dynamicChoices[def.id]);
  }
  return out;
}

/** Reads a validated option as the type the caller expects. */
export const optNum = (o: OptionValues, id: string): number => Number(o[id]);
export const optStr = (o: OptionValues, id: string): string => String(o[id] ?? "");
export const optBool = (o: OptionValues, id: string): boolean => o[id] === true;

/** A name pattern such as "{name} (small)": the tokens {name}, {n} and {date}; no folders. Returns the checked pattern. */
export function validatePattern(pattern: unknown): string {
  if (pattern === undefined || pattern === null || pattern === "") return "";
  if (typeof pattern !== "string") throw new FmError("BAD_OPTION", "The name pattern wasn't understood.");
  const text = pattern.replace(CONTROL, " ").trim();
  if (text.length > 120) throw new FmError("BAD_OPTION", "The name pattern is too long.");
  if (/[/\\]/.test(text)) throw new FmError("BAD_OPTION", "The name pattern can't contain / or \\: choose the folder separately.");
  const stripped = text.replace(/\{(name|n|date)\}/g, "");
  if (/[{}]/.test(stripped)) throw new FmError("BAD_OPTION", "The name pattern can only use {name}, {n} and {date}.");
  return text;
}

/** Fills in the tokens of a checked name pattern. */
export function applyPattern(pattern: string, base: string, index: number, date = new Date()): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return pattern.replace(/\{name\}/g, base).replace(/\{n\}/g, String(index)).replace(/\{date\}/g, day);
}
