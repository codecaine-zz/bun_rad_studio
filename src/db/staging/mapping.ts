/**
 * Mapping source columns to target columns: automatic matching by name, per-column clean-up steps ("transforms"),
 * and turning a mapping into a function that builds the values for one source row.
 */
import type { SourceColumn } from "./reader";
import type { ColumnRule, Step, TargetColumn, TargetTable } from "./types";
import { detectDateOrder, formatDate, formatDateTime, parseBoolean, parseDate, parseNumber, titleCase } from "./values";

export function applyStep(value: string | null, step: Step): string | null {
  switch (step.t) {
    case "default":
      return value === null || value.trim() === "" ? step.value : value;
    case "emptyToNull":
      return value === null || value.trim() === "" ? null : value;
  }
  if (value === null) return null;
  switch (step.t) {
    case "trim":
      return value.trim();
    case "collapse":
      return value.trim().replace(/\s+/g, " ");
    case "upper":
      return value.toUpperCase();
    case "lower":
      return value.toLowerCase();
    case "title":
      return titleCase(value);
    case "digits":
      return value.replace(/\D+/g, "");
    case "date": {
      const p = value.trim() ? parseDate(value, step.order ?? "auto") : null;
      return p ? formatDate(p) : value;
    }
    case "datetime": {
      const p = value.trim() ? parseDate(value, step.order ?? "auto") : null;
      return p ? formatDateTime(p) : value;
    }
    case "number": {
      const n = value.trim() ? parseNumber(value, step.locale ?? "auto") : null;
      return n ?? value;
    }
    case "boolean": {
      const b = parseBoolean(value);
      return b ?? value;
    }
    case "replace":
      return step.find ? value.split(step.find).join(step.with) : value;
  }
}

export function applySteps(value: string | null, steps: Step[]): string | null {
  let v = value;
  for (const s of steps) v = applyStep(v, s);
  return v;
}

export const STEP_LABELS: Record<Step["t"], string> = {
  trim: "Remove spaces at the start and end",
  collapse: "Tidy spaces (trim, and one space between words)",
  emptyToNull: "Treat empty as no value (NULL)",
  upper: "UPPER CASE",
  lower: "lower case",
  title: "Title Case",
  digits: "Keep digits only",
  date: "Read as a date",
  datetime: "Read as a date and time",
  number: "Read as a number",
  boolean: "Read yes/no/Y/N/1/0 as true/false",
  replace: "Replace text",
  default: "If empty, use a default value",
};

const isStepType = (t: unknown): t is Step["t"] => typeof t === "string" && t in STEP_LABELS;

/** Checks a mapping that came from the page and returns a clean copy (or throws a plain message). */
export function sanitizeRules(input: unknown, sourceNames: string[], targetNames: string[] | null): ColumnRule[] {
  if (!Array.isArray(input)) throw new Error("The mapping must be a list.");
  const seenTargets = new Set<string>();
  const out: ColumnRule[] = [];
  const known = new Set(sourceNames);
  for (const raw of input as any[]) {
    if (!raw || typeof raw !== "object" || typeof raw.target !== "string" || !raw.target) throw new Error("Each mapped column needs a target name.");
    if (targetNames && !targetNames.includes(raw.target)) throw new Error(`The table has no column called “${raw.target}”.`);
    if (seenTargets.has(raw.target)) throw new Error(`Column “${raw.target}” is mapped twice.`);
    seenTargets.add(raw.target);
    const s = raw.source ?? { kind: "skip" };
    let source: ColumnRule["source"];
    const needCol = (c: unknown): string => {
      if (typeof c !== "string" || !known.has(c)) throw new Error(`The file has no column called “${String(c)}”.`);
      return c;
    };
    switch (s.kind) {
      case "column":
        source = { kind: "column", column: needCol(s.column) };
        break;
      case "concat":
        if (!Array.isArray(s.columns) || s.columns.length < 1 || s.columns.length > 20) throw new Error("Joining needs between 1 and 20 columns.");
        source = { kind: "concat", columns: s.columns.map(needCol), separator: String(s.separator ?? "").slice(0, 20) };
        break;
      case "split":
        source = { kind: "split", column: needCol(s.column), separator: String(s.separator ?? " ").slice(0, 20) || " ", part: Math.max(1, Math.min(50, Math.trunc(Number(s.part) || 1))) };
        break;
      case "constant":
        source = { kind: "constant", value: s.value === null || s.value === undefined ? null : String(s.value).slice(0, 10000) };
        break;
      default:
        source = { kind: "skip" };
    }
    const steps: Step[] = [];
    for (const st of Array.isArray(raw.steps) ? raw.steps : []) {
      if (!st || !isStepType(st.t)) throw new Error("Unknown clean-up step.");
      const order = ["YMD", "DMY", "MDY", "auto"].includes(st.order) ? st.order : "auto";
      switch (st.t) {
        case "date":
        case "datetime":
          steps.push({ t: st.t, order });
          break;
        case "number":
          steps.push({ t: "number", locale: ["us", "eu", "auto"].includes(st.locale) ? st.locale : "auto" });
          break;
        case "replace":
          steps.push({ t: "replace", find: String(st.find ?? "").slice(0, 200), with: String(st.with ?? "").slice(0, 200) });
          break;
        case "default":
          steps.push({ t: "default", value: String(st.value ?? "").slice(0, 10000) });
          break;
        default:
          steps.push({ t: st.t } as Step);
      }
    }
    out.push({ target: raw.target, source, steps });
  }
  return out;
}

export interface RowBuilder {
  /** Staged values, in the order of `rules` that are not skipped. */
  columns: string[];
  build(cells: (string | null)[]): { values: (string | null)[]; changed: boolean };
  /** Source columns that no rule uses (they are kept only in the raw copy). */
  unusedSource: string[];
}

export function compileRules(rules: ColumnRule[], sourceNames: string[]): RowBuilder {
  const idx = new Map(sourceNames.map((n, i) => [n, i]));
  const active = rules.filter((r) => r.source.kind !== "skip");
  const used = new Set<string>();
  const getters = active.map((r) => {
    const s = r.source;
    switch (s.kind) {
      case "column": {
        used.add(s.column);
        const i = idx.get(s.column)!;
        return (c: (string | null)[]) => c[i] ?? null;
      }
      case "concat": {
        const is = s.columns.map((c) => (used.add(c), idx.get(c)!));
        return (c: (string | null)[]) => {
          const parts = is.map((i) => c[i] ?? null).filter((v): v is string => v !== null && v.trim() !== "");
          return parts.length ? parts.join(s.separator) : null;
        };
      }
      case "split": {
        used.add(s.column);
        const i = idx.get(s.column)!;
        return (c: (string | null)[]) => {
          const v = c[i] ?? null;
          if (v === null) return null;
          const part = v.split(s.separator)[s.part - 1];
          return part === undefined ? null : part;
        };
      }
      default:
        return () => (s as { value: string | null }).value;
    }
  });
  return {
    columns: active.map((r) => r.target),
    unusedSource: sourceNames.filter((n) => !used.has(n)),
    build(cells) {
      let changed = false;
      const values = active.map((r, i) => {
        const original = getters[i]!(cells);
        const v = r.steps.length ? applySteps(original, r.steps) : original;
        if (v !== original || r.source.kind !== "column") changed = true;
        return v;
      });
      return { values, changed };
    },
  };
}

// ---- automatic matching ---------------------------------------------------------------------------------------------

const SYNONYMS: string[][] = [
  ["id", "identifier", "uid", "key"],
  ["email", "emailaddress", "mail", "emailaddr", "e-mail"],
  ["phone", "telephone", "tel", "mobile", "phonenumber", "cell", "cellphone"],
  ["zip", "zipcode", "postal", "postalcode", "postcode"],
  ["firstname", "fname", "givenname", "forename", "first"],
  ["lastname", "lname", "surname", "familyname", "last"],
  ["name", "fullname", "title"],
  ["dob", "birthdate", "dateofbirth", "birthday", "born", "birth"],
  ["qty", "quantity", "count", "units"],
  ["desc", "description", "details", "summary"],
  ["amt", "amount", "total", "sum"],
  ["addr", "address", "street", "streetaddress", "address1"],
  ["company", "organization", "organisation", "org", "employer", "business"],
  ["created", "createdat", "createddate", "creationdate", "datecreated", "createdon"],
  ["updated", "updatedat", "modifiedat", "modified", "lastmodified", "datemodified", "updatedon"],
  ["state", "province", "region"],
  ["country", "nation", "countryname"],
  ["price", "unitprice", "cost", "rate"],
  ["sku", "productcode", "itemcode", "partnumber"],
  ["num", "number", "no", "nr"],
  ["city", "town", "locality"],
  ["notes", "note", "comment", "comments", "remarks"],
  ["active", "enabled", "isactive", "status"],
  ["tier", "plan", "level", "plantype", "subscription"],
];

export function normalizeName(name: string): string {
  let n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (n.length > 4 && n.endsWith("ies")) n = n.slice(0, -3) + "y";
  else if (n.length > 3 && n.endsWith("s") && !n.endsWith("ss")) n = n.slice(0, -1);
  return n;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

const GROUPS = SYNONYMS.map((g) => new Set(g.map(normalizeName)));

export interface MatchInfo {
  target: string;
  source: string;
  score: number;
  reason: "same name" | "known synonym" | "similar name";
}

export function nameScore(a: string, b: string): { score: number; reason: MatchInfo["reason"] } | null {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return null;
  if (x === y) return { score: 1, reason: "same name" };
  if (GROUPS.some((g) => g.has(x) && g.has(y))) return { score: 0.92, reason: "known synonym" };
  // "Customer ID" in the file, "id" in the table (the table's own key)
  if ((y === "id" && x.length > 2 && x.endsWith("id")) || (x === "id" && y.length > 2 && y.endsWith("id"))) return { score: 0.66, reason: "similar name" };
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return { score: 0.72, reason: "similar name" };
  const sim = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  if (sim >= 0.78 && Math.min(x.length, y.length) >= 4) return { score: 0.6 + sim * 0.3, reason: "similar name" };
  return null;
}

/** Steps that make typical incoming text fit this kind of column. */
export function suggestSteps(col: TargetColumn, src: SourceColumn | null): Step[] {
  const steps: Step[] = [];
  const inf = src?.inferred;
  if (col.cls !== "text") steps.push({ t: "trim" }, { t: "emptyToNull" });
  switch (col.cls) {
    case "integer":
    case "decimal":
    case "float":
      if (inf?.needsCleaning) steps.push({ t: "number", locale: inf.numberLocale ?? "auto" });
      break;
    case "boolean":
      steps.push({ t: "boolean" });
      break;
    case "date":
    case "timestamp": {
      if (inf && (inf.kind === "date" || inf.kind === "timestamp") && !inf.needsCleaning) break;
      const order = inf?.dateOrder && inf.dateOrder !== "unknown" ? inf.dateOrder : src ? detectDateOrder(src.samples).order : "unknown";
      steps.push({ t: col.cls === "date" ? "date" : "datetime", order: order === "unknown" ? "MDY" : order });
      break;
    }
    case "uuid":
      break;
  }
  return steps;
}

export interface AutoMapResult {
  rules: ColumnRule[];
  matches: MatchInfo[];
  unmatchedSource: string[];
  unmatchedTarget: string[];
  /** Dates where day and month cannot be told apart: the page asks which way round. */
  ambiguousDates: string[];
}

export function autoMap(source: SourceColumn[], target: TargetTable): AutoMapResult {
  const pairs: MatchInfo[] = [];
  for (const t of target.columns) {
    for (const s of source) {
      const m = nameScore(t.name, s.name);
      if (m && m.score >= 0.65) pairs.push({ target: t.name, source: s.name, ...m });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedT = new Set<string>();
  const usedS = new Set<string>();
  const matches: MatchInfo[] = [];
  for (const p of pairs) {
    if (usedT.has(p.target) || usedS.has(p.source)) continue;
    usedT.add(p.target);
    usedS.add(p.source);
    matches.push(p);
  }
  const bySource = new Map(source.map((s) => [s.name, s]));
  const ambiguousDates: string[] = [];
  const rules: ColumnRule[] = target.columns.map((t) => {
    const m = matches.find((x) => x.target === t.name);
    if (!m) return { target: t.name, source: { kind: "skip" }, steps: [] };
    const src = bySource.get(m.source)!;
    if ((t.cls === "date" || t.cls === "timestamp") && src.inferred.dateOrder === "unknown") ambiguousDates.push(t.name);
    return { target: t.name, source: { kind: "column", column: m.source }, steps: suggestSteps(t, src) };
  });
  return {
    rules,
    matches,
    unmatchedSource: source.filter((s) => !usedS.has(s.name)).map((s) => s.name),
    unmatchedTarget: target.columns.filter((c) => !usedT.has(c.name)).map((c) => c.name),
    ambiguousDates,
  };
}
