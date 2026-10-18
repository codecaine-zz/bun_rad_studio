/**
 * Shared helpers of the built-in converters (no tools needed): the plain-language error type, safe object building,
 * flattening nested data into table rows and back, and the limits every converter respects.
 */

/** An error whose message is already written for the person using the File Manager. */
export class ConvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConvError";
  }
}

/** Biggest input a built-in converter reads. */
export const MAX_INPUT_BYTES = 100 * 1024 * 1024;
export const MAX_DEPTH = 200;

/** A parsed value: JSON-like, plus `bigint` for whole numbers too big for a normal number. */
export type Value = null | boolean | number | bigint | string | Value[] | { [key: string]: Value };
export type Obj = { [key: string]: Value };

export function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

/** Sets a key without ever touching the object's prototype (a key named "__proto__" is just a key). */
export function setKey(target: Obj, key: string, value: Value): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

export function newObj(): Obj {
  return {};
}

/** Collects the things a conversion could not keep exactly, to tell the person afterwards. */
export class Notes {
  readonly list: string[] = [];
  add(text: string): void {
    if (!this.list.includes(text) && this.list.length < 12) this.list.push(text);
  }
  toString(): string {
    return this.list.join(" ");
  }
  get any(): boolean {
    return this.list.length > 0;
  }
}

/** Turns what other parsers return (dates, typed arrays, undefined) into plain values. */
export function plain(v: unknown, depth = 0): Value {
  if (depth > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "boolean" || typeof v === "bigint") return v;
  if (typeof v === "number") return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (Array.isArray(v)) return v.map((x) => plain(x, depth + 1));
  // TOML dates and times come back from Bun as Temporal objects (Instant, PlainDate, ...): they say what they are with toJSON().
  if (typeof v === "object" && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null && typeof (v as { toJSON?: unknown }).toJSON === "function") return plain((v as { toJSON(): unknown }).toJSON(), depth + 1);
  if (typeof v === "object") {
    const out = newObj();
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) setKey(out, k, plain(x, depth + 1));
    return out;
  }
  return String(v);
}

/** Sorts the keys of every object, deeply. */
export function sortKeysDeep(v: Value, depth = 0): Value {
  if (depth > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
  if (Array.isArray(v)) return v.map((x) => sortKeysDeep(x, depth + 1));
  if (isObj(v)) {
    const out = newObj();
    for (const k of Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) setKey(out, k, sortKeysDeep(v[k]!, depth + 1));
    return out;
  }
  return v;
}

/**
 * Text from a table cell or a plain text file to a value: numbers that read back exactly the same, true and false.
 * "007", "1.50", "1e3" and numbers with more than 15 digits stay text so nothing is lost.
 */
export function inferScalar(s: string): Value {
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?(?:0|[1-9]\d*)$/.test(s)) {
    if (s.length <= 15) return Number(s);
    return String(Number(s)) === s && Number.isSafeInteger(Number(s)) ? Number(s) : s;
  }
  if (/^-?(?:0|[1-9]\d*)\.\d*[1-9]$/.test(s) || /^-?0\.\d*[1-9]$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && String(n) === s ? n : s;
  }
  return s;
}

/** Text of a scalar for formats that only have text (CSV cells, INI values...). */
export function scalarText(v: Value): string {
  if (v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v);
}

/** Flattens nested data to dotted keys: {a:{b:1},c:[1,2]} -> {"a.b":1,"c.0":1,"c.1":2}. Empty objects and arrays stay as they are. */
export function flatten(v: Value, joiner = ".", prefix = "", out: Obj = newObj(), depth = 0): Obj {
  if (depth > MAX_DEPTH) throw new ConvError("The data is nested too deeply (more than 200 levels).");
  if (Array.isArray(v) && v.length) v.forEach((x, i) => flatten(x, joiner, prefix ? `${prefix}${joiner}${i}` : String(i), out, depth + 1));
  else if (isObj(v) && Object.keys(v).length) for (const [k, x] of Object.entries(v)) flatten(x, joiner, prefix ? `${prefix}${joiner}${k}` : k, out, depth + 1);
  else setKey(out, prefix, Array.isArray(v) ? "[]" : isObj(v) ? "{}" : v);
  return out;
}

/** The reverse of `flatten` for dotted keys: "a.b" makes a nested object, and numeric parts make arrays. */
export function unflatten(flat: Obj, joiner = "."): Obj {
  const root = newObj();
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(joiner);
    let cur: Obj | Value[] = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^(0|[1-9]\d{0,5})$/.test(parts[i + 1]!);
      if (Array.isArray(cur)) {
        const idx = Number(part);
        if (last) cur[idx] = value;
        else {
          const existing = cur[idx];
          cur[idx] = existing !== undefined && typeof existing === "object" && existing !== null ? existing : nextIsIndex ? [] : newObj();
          cur = cur[idx] as Obj | Value[];
        }
      } else if (last) {
        setKey(cur, part, value === "[]" ? [] : value === "{}" ? newObj() : value);
      } else {
        const existing = cur[part];
        if (existing !== undefined && typeof existing === "object" && existing !== null) cur = existing as Obj | Value[];
        else {
          const created: Obj | Value[] = nextIsIndex ? [] : newObj();
          setKey(cur, part, created);
          cur = created;
        }
      }
      // A numeric first part under an object is still an object key unless the parent was created as an array.
    }
  }
  return root;
}

export interface Table {
  columns: string[];
  rows: Value[][];
}

/** Rows and columns from any value: a list of records, a list of lists, a single record, or a list of plain values. */
export function toTable(value: Value, opts: { flatten: boolean; notes: Notes }): Table {
  const cell = (v: Value): Value => (typeof v === "object" && v !== null ? JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) : v);
  let list: Value[];
  if (Array.isArray(value)) list = value;
  else if (isObj(value)) {
    const values = Object.values(value);
    // {"a":[{...},{...}]}: a single key holding the records
    if (values.length === 1 && Array.isArray(values[0]) && (values[0] as Value[]).every(isObj)) list = values[0] as Value[];
    else list = [value];
  } else list = [value];
  if (list.length === 0) throw new ConvError("There is no data to put in a table (the list is empty).");

  if (list.every((r) => Array.isArray(r))) {
    const width = Math.max(...(list as Value[][]).map((r) => r.length));
    const rows = (list as Value[][]).map((r) => Array.from({ length: width }, (_, i) => cell(r[i] ?? null)));
    return { columns: Array.from({ length: width }, (_, i) => `column${i + 1}`), rows };
  }
  const columns: string[] = [];
  const seen = new Set<string>();
  const records: Obj[] = list.map((r) => {
    let rec: Obj;
    if (isObj(r)) {
      if (opts.flatten) {
        rec = flatten(r);
        if (Object.values(r).some((x) => typeof x === "object" && x !== null && !(Array.isArray(x) && x.length === 0) && !(isObj(x) && Object.keys(x).length === 0))) opts.notes.add("Nested data was flattened into columns with dotted names (like address.city), so it can't be turned back into the exact same structure.");
      } else {
        rec = newObj();
        for (const [k, x] of Object.entries(r)) setKey(rec, k, cell(x));
        if (Object.values(r).some((x) => typeof x === "object" && x !== null)) opts.notes.add("Nested data was written as text inside one cell.");
      }
    } else {
      rec = newObj();
      setKey(rec, "value", r);
    }
    for (const k of Object.keys(rec)) if (!seen.has(k)) { seen.add(k); columns.push(k); }
    return rec;
  });
  const rows = records.map((rec) => columns.map((c) => (Object.prototype.hasOwnProperty.call(rec, c) ? rec[c]! : null)));
  return { columns, rows };
}

/** A list of records from a header row and text rows (type inference as in `inferScalar`). */
export function recordsFromRows(header: string[], rows: string[][], infer: boolean): Obj[] {
  const names = uniqueHeaders(header);
  return rows.map((r) => {
    const rec = newObj();
    names.forEach((name, i) => setKey(rec, name, i < r.length ? (infer ? inferScalar(r[i]!) : r[i]!) : ""));
    return rec;
  });
}

/** Column names that are never empty and never repeat: "", "a", "a" -> "column1", "a", "a_2". */
export function uniqueHeaders(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((h, i) => {
    const base = h.trim() === "" ? `column${i + 1}` : h;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

/** Checks the size of a file before reading it. */
export function checkSize(size: number, what = "This file"): void {
  if (size > MAX_INPUT_BYTES) throw new ConvError(`${what} is bigger than 100 MB, which is more than the built-in converters handle. Split it into smaller files first.`);
}
