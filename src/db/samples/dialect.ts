/** Per-dialect SQL helpers: identifier quoting, literals and the portable functions used by views and queries. */
import type { Cell, ColumnDef, Dialect, SqlHelpers } from "./model";

export function quoteId(d: Dialect, name: string): string {
  return d === "mysql" ? `\`${name.replace(/`/g, "``")}\`` : `"${name.replace(/"/g, '""')}"`;
}

export function quoteString(d: Dialect, s: string): string {
  let out = s.replace(/'/g, "''");
  if (d === "mysql") out = out.replace(/\\/g, "\\\\");
  return `'${out}'`;
}

export function literal(d: Dialect, v: Cell | undefined, col?: ColumnDef): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "NULL";
    if (col?.type === "dec") return v.toFixed(col.scale ?? 2);
    if (col?.type === "bool") return d === "postgres" ? (v ? "TRUE" : "FALSE") : v ? "1" : "0";
    return String(v);
  }
  if (typeof v === "boolean") return d === "postgres" ? (v ? "TRUE" : "FALSE") : v ? "1" : "0";
  if (Array.isArray(v)) {
    if (col?.type === "tags" && d === "postgres") {
      return v.length ? `ARRAY[${v.map((x) => quoteString(d, String(x))).join(",")}]::text[]` : "ARRAY[]::text[]";
    }
    return quoteString(d, JSON.stringify(v));
  }
  if (typeof v === "object") return quoteString(d, JSON.stringify(v));
  if (col?.type === "bool") return d === "postgres" ? (v === "true" ? "TRUE" : "FALSE") : v === "true" ? "1" : "0";
  return quoteString(d, String(v));
}

const AS_OF = "(SELECT as_of FROM _sample_info)";

export function sqlHelpers(d: Dialect): SqlHelpers {
  const sqlite = d === "sqlite";
  const mysql = d === "mysql";
  return {
    dialect: d,
    asOf: AS_OF,
    concat: (...p) => (mysql ? `CONCAT(${p.join(", ")})` : `(${p.join(" || ")})`),
    ym: (x) => (sqlite ? `strftime('%Y-%m', ${x})` : mysql ? `DATE_FORMAT(${x}, '%Y-%m')` : `to_char(${x}, 'YYYY-MM')`),
    year: (x) => (sqlite ? `CAST(strftime('%Y', ${x}) AS INTEGER)` : mysql ? `YEAR(${x})` : `CAST(EXTRACT(YEAR FROM ${x}) AS INTEGER)`),
    month: (x) => (sqlite ? `CAST(strftime('%m', ${x}) AS INTEGER)` : mysql ? `MONTH(${x})` : `CAST(EXTRACT(MONTH FROM ${x}) AS INTEGER)`),
    dow: (x) => (sqlite ? `CAST(strftime('%w', ${x}) AS INTEGER)` : mysql ? `(DAYOFWEEK(${x}) - 1)` : `CAST(EXTRACT(DOW FROM ${x}) AS INTEGER)`),
    hour: (x) => (sqlite ? `CAST(strftime('%H', ${x}) AS INTEGER)` : mysql ? `HOUR(${x})` : `CAST(EXTRACT(HOUR FROM ${x}) AS INTEGER)`),
    dateOf: (x) => (sqlite ? `date(${x})` : mysql ? `DATE(${x})` : `CAST(${x} AS DATE)`),
    addDays: (x, n) => (sqlite ? `date(${x}, (${n}) || ' day')` : mysql ? `DATE_ADD(${x}, INTERVAL ${n} DAY)` : `(CAST(${x} AS DATE) + CAST(${n} AS INTEGER))`),
    diffDays: (a, b) => (sqlite ? `CAST(julianday(${a}) - julianday(${b}) AS INTEGER)` : mysql ? `DATEDIFF(${a}, ${b})` : `(CAST(${a} AS DATE) - CAST(${b} AS DATE))`),
    strAgg: (x, sep = ", ") => {
      const s = `'${sep.replace(/'/g, "''")}'`;
      return sqlite ? `GROUP_CONCAT(${x}, ${s})` : mysql ? `GROUP_CONCAT(${x} SEPARATOR ${s})` : `STRING_AGG(CAST(${x} AS TEXT), ${s})`;
    },
    cast: (x, to) => {
      if (to === "int") return mysql ? `CAST(${x} AS SIGNED)` : sqlite ? `CAST(${x} AS INTEGER)` : `CAST(${x} AS INTEGER)`;
      if (to === "dec") return mysql ? `CAST(${x} AS DECIMAL(18,4))` : sqlite ? `CAST(${x} AS REAL)` : `CAST(${x} AS NUMERIC(18,4))`;
      if (to === "text") return mysql ? `CAST(${x} AS CHAR)` : `CAST(${x} AS TEXT)`;
      return mysql ? `CAST(${x} AS DATE)` : sqlite ? `date(${x})` : `CAST(${x} AS DATE)`;
    },
    round: (x, digits = 2) => (d === "postgres" ? `ROUND(CAST(${x} AS NUMERIC), ${digits})` : `ROUND(${x}, ${digits})`),
    jsonGet: (col, key) =>
      sqlite ? `json_extract(${col}, '$.${key}')` : mysql ? `JSON_UNQUOTE(JSON_EXTRACT(${col}, '$.${key}'))` : `(${col}->>'${key}')`,
    arrayHas: (col, value) =>
      sqlite
        ? `EXISTS (SELECT 1 FROM json_each(${col}) WHERE json_each.value = ${value})`
        : mysql ? `JSON_CONTAINS(${col}, JSON_QUOTE(${value}))` : `(${value} = ANY(${col}))`,
  };
}
