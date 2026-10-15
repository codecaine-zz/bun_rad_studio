/** Deterministic data generation helpers (seeded PRNG, distributions, dates, names, check-digit ids). */
import type { Row, Scale } from "./model";
import {
  CITIES, COMPANY_A, COMPANY_B, EMAIL_DOMAINS, FIRST_NAMES, LAST_NAMES, LOREM, STREETS, STREET_SUFFIX,
} from "./words";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, used to derive an independent PRNG stream per table from the dataset seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const dayOf = (s: string): number => Math.floor(Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / 86400000);
export const dayStr = (n: number): string => new Date(n * 86400000).toISOString().slice(0, 10);
export const addDays = (s: string, n: number): string => dayStr(dayOf(s) + n);
const p2 = (n: number) => (n < 10 ? `0${n}` : String(n));

export function luhnCheckDigit(base: string): string {
  let sum = 0;
  let dbl = true;
  for (let i = base.length - 1; i >= 0; i--) {
    let d = base.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return String((10 - (sum % 10)) % 10);
}

export function luhnValid(num: string): boolean {
  return luhnCheckDigit(num.slice(0, -1)) === num.slice(-1);
}

/** ISO 7064 mod-97 check digits for an IBAN-like account string ("<CC>00<bban>" -> "<CC><cd><bban>"). */
export function ibanLike(country: string, bban: string): string {
  const rearranged = `${bban}${country}00`;
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return `${country}${p2(98 - rem)}${bban}`;
}

export class Gen {
  private rand: () => number;
  constructor(
    public readonly seed: number,
    public readonly scale: Scale,
    public readonly asOf: string,
    private readonly store: Map<string, Row[]>,
    public readonly table: string,
    /** Number of rows this table will have. */
    public readonly n: number = 0,
  ) {
    this.rand = mulberry32(seed);
  }

  // ---- primitives
  r(): number { return this.rand(); }
  int(a: number, b: number): number { return a + Math.floor(this.rand() * (b - a + 1)); }
  float(a: number, b: number, dp = 2): number { return Number((a + this.rand() * (b - a)).toFixed(dp)); }
  bool(p = 0.5): boolean { return this.rand() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.rand() * arr.length)]!; }
  /** Weighted choice: weights need not sum to one. */
  w<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const it of items) total += it[1];
    let x = this.rand() * total;
    for (const it of items) {
      x -= it[1];
      if (x < 0) return it[0];
    }
    return items[items.length - 1]![0];
  }
  /** Index in [0, n) skewed towards 0 (power-law-like: a few hot items, a long tail). */
  skew(n: number, k = 2.5): number { return Math.min(n - 1, Math.floor(n * Math.pow(this.rand(), k))); }
  pickSkew<T>(arr: readonly T[], k = 2.5): T { return arr[this.skew(arr.length, k)]!; }
  normal(mean: number, sd: number): number {
    const u = Math.max(this.rand(), 1e-12);
    const v = this.rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  logNormal(median: number, sigma = 0.6): number { return median * Math.exp(this.normal(0, sigma)); }
  clamp(x: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, x)); }
  round(x: number, dp = 2): number { return Number(x.toFixed(dp)); }
  money(median: number, sigma = 0.6, min = 0.01, max = 1e9): number { return this.round(this.clamp(this.logNormal(median, sigma), min, max)); }
  sample<T>(arr: readonly T[], k: number): T[] {
    const copy = arr.slice();
    const out: T[] = [];
    for (let i = 0; i < k && copy.length; i++) out.push(copy.splice(Math.floor(this.rand() * copy.length), 1)[0]!);
    return out;
  }

  // ---- dates (all returned as text: 'YYYY-MM-DD' and 'YYYY-MM-DD HH:MM:SS')
  date(from: string, to: string): string { return dayStr(this.int(dayOf(from), dayOf(to))); }
  /** A date with month and weekday weights (index 0 = January / Sunday). */
  seasonal(from: string, to: string, months: readonly number[], dows?: readonly number[]): string {
    const a = dayOf(from);
    const b = dayOf(to);
    for (let tries = 0; tries < 200; tries++) {
      const d = this.int(a, b);
      const dt = new Date(d * 86400000);
      if (this.rand() * Math.max(...months) <= months[dt.getUTCMonth()]! && (!dows || this.rand() * Math.max(...dows) <= dows[dt.getUTCDay()]!)) return dayStr(d);
    }
    return dayStr(this.int(a, b));
  }
  time(fromHour = 0, toHour = 23): string { return `${p2(this.int(fromHour, toHour))}:${p2(this.int(0, 59))}:${p2(this.int(0, 59))}`; }
  ts(date: string, fromHour = 0, toHour = 23): string { return `${date} ${this.time(fromHour, toHour)}`; }
  tsBetween(from: string, to: string): string { return this.ts(this.date(from, to)); }
  /** Shift a 'YYYY-MM-DD[ HH:MM:SS]' value by whole days, keeping any time part. */
  shift(value: string, days: number): string { return dayStr(dayOf(value) + days) + value.slice(10); }
  minDate(a: string, b: string): string { return a <= b ? a : b; }

  // ---- people and places
  first(): string { return this.pickSkew(FIRST_NAMES, 1.6); }
  last(): string { return this.pickSkew(LAST_NAMES, 1.6); }
  email(first: string, last: string, n = 0): string {
    return `${first}.${last}${n ? n : ""}@${this.pick(EMAIL_DOMAINS)}`.toLowerCase().replace(/[^a-z0-9.@_-]/g, "");
  }
  phone(): string { return `555-${this.int(100, 999)}-${String(this.int(0, 9999)).padStart(4, "0")}`; }
  street(): string { return `${this.int(10, 9899)} ${this.pick(STREETS)} ${this.pick(STREET_SUFFIX)}`; }
  place(): { city: string; state: string; zip: string } {
    const [city, state, z3] = this.pickSkew(CITIES, 1.4);
    return { city, state, zip: `${z3}${String(this.int(0, 99)).padStart(2, "0")}` };
  }
  company(): string { return `${this.pick(COMPANY_A)} ${this.pick(COMPANY_B)}`; }
  words(n: number): string { return Array.from({ length: n }, () => this.pick(LOREM)).join(" "); }
  sentence(n = 8): string { const s = this.words(n); return s.charAt(0).toUpperCase() + s.slice(1) + "."; }

  // ---- identifiers
  uuid(): string {
    const h = (n: number) => Array.from({ length: n }, () => this.int(0, 15).toString(16)).join("");
    return `${h(8)}-${h(4)}-4${h(3)}-${this.pick(["8", "9", "a", "b"])}${h(3)}-${h(12)}`;
  }
  hex(n: number): string { return Array.from({ length: n }, () => this.int(0, 15).toString(16)).join(""); }
  digits(n: number, leadingZero = true): string {
    let s = "";
    for (let i = 0; i < n; i++) s += String(i === 0 && !leadingZero ? this.int(1, 9) : this.int(0, 9));
    return s;
  }
  /** Luhn-valid number: prefix + random digits + check digit, total length `len`. */
  luhn(prefix: string, len: number): string {
    const body = prefix + this.digits(len - prefix.length - 1);
    return body + luhnCheckDigit(body);
  }
  /** NPI-style provider id: 10 digits, Luhn-valid when prefixed with 80840 (as the real NPI check-digit rule works). */
  npi(): string {
    const base = String(this.int(1, 2)) + this.digits(8);
    return base + luhnCheckDigit(`80840${base}`);
  }
  /** NDC-style 11-digit code formatted 5-4-2. */
  ndc(labeler?: number, product?: number, pkg?: number): string {
    return `${String(labeler ?? this.int(100, 99999)).padStart(5, "0")}-${String(product ?? this.int(1, 9999)).padStart(4, "0")}-${String(pkg ?? this.int(1, 99)).padStart(2, "0")}`;
  }
  code(prefix: string, n: number, width = 6): string { return `${prefix}${String(n).padStart(width, "0")}`; }

  private memos = new Map<string, unknown>();
  /** Per-table scratch state that lives as long as this table's generator run (so reruns start clean). */
  memo<T>(key: string, init: () => T): T {
    if (!this.memos.has(key)) this.memos.set(key, init());
    return this.memos.get(key) as T;
  }

  // ---- access to rows generated for earlier tables
  rows(table: string): Row[] {
    const rows = this.store.get(table);
    if (!rows) throw new Error(`${this.table}: rows of ${table} are not available (declare it in uses or as a foreign key)`);
    return rows;
  }
  count(table: string): number { return this.rows(table).length; }
  /** The i-th child row maps to parent i for the first `parents` rows (every parent gets one), the rest skew to popular parents. */
  spread(parents: number, i: number, k = 2): number { return i <= parents ? i : 1 + this.skew(parents, k); }
  /** Uniform parent id in 1..n. */
  fk(n: number): number { return this.int(1, n); }
  /** Skewed parent id in 1..n. */
  fkSkew(n: number, k = 2): number { return 1 + this.skew(n, k); }
}
