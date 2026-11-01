/**
 * Shared server-side helpers for SQLite, MySQL, and Postgres Studio Pro:
 * - Dialect-aware SQL formatting (`sql-formatter`)
 * - Server-side per-column filter (`columnFilters`) and multi-column sort (`sortColumns`) builders
 * - Schema Diff & Migration DDL generator (`/api/schema/diff`)
 */

import { format as formatSql } from "sql-formatter";

export type StudioDialect = "sqlite" | "mysql" | "postgres";

export interface SortColumnSpec {
  col: string;
  dir: "ASC" | "DESC" | "asc" | "desc";
}

export function formatSqlDialect(sql: string, dialect: StudioDialect = "sqlite"): string {
  const raw = String(sql ?? "").trim();
  if (!raw) return "";
  const language = dialect === "postgres" ? "postgresql" : dialect === "mysql" ? "mysql" : "sqlite";
  try {
    return formatSql(raw, { language, tabWidth: 2, keywordCase: "upper" });
  } catch {
    return raw;
  }
}

function quoteCol(col: string, dialect: StudioDialect): string {
  if (dialect === "mysql") {
    return `\`${col.replace(/`/g, "``")}\``;
  }
  return `"${col.replace(/"/g, '""')}"`;
}

function stripFilterDelimiters(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2) {
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("#") && s.endsWith("#"))) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
}

function parseNumericFilterValue(raw: string): number | null {
  const cleaned = stripFilterDelimiters(raw).replace(/^\$/, "").replace(/,/g, "").trim();
  if (!cleaned || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeDateFilterValue(raw: string): { iso: string; isDateOnly: boolean } | null {
  const s = stripFilterDelimiters(raw);
  const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (isoDate) {
    const yyyy = isoDate[1]!;
    const mm = isoDate[2]!.padStart(2, "0");
    const dd = isoDate[3]!.padStart(2, "0");
    return { iso: `${yyyy}-${mm}-${dd}`, isDateOnly: true };
  }
  const usDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (usDate) {
    const mm = usDate[1]!.padStart(2, "0");
    const dd = usDate[2]!.padStart(2, "0");
    const yyyy = usDate[3]!;
    return { iso: `${yyyy}-${mm}-${dd}`, isDateOnly: true };
  }
  const isoTs = /^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}:\d{2}(?::\d{2})?)/.exec(s);
  if (isoTs) {
    const yyyy = isoTs[1]!;
    const mm = isoTs[2]!.padStart(2, "0");
    const dd = isoTs[3]!.padStart(2, "0");
    const time = isoTs[4]!.length === 4 ? `0${isoTs[4]}` : isoTs[4]!;
    return { iso: `${yyyy}-${mm}-${dd} ${time}`, isDateOnly: false };
  }
  return null;
}

function splitCompoundAccessFilter(expr: string): { parts: string[]; combinator: "AND" | "OR" } | null {
  // Do not split if BETWEEN ... AND ... is present without extra clauses
  if (/^\s*(?:not\s+)?between\s+.+\s+and\s+.+$/i.test(expr) && !/\s+or\s+/i.test(expr)) {
    const andMatches = expr.match(/\band\b/gi);
    if (andMatches && andMatches.length === 1) return null;
  }
  const orSplit = expr.split(/\s+or\s+/i).map((s) => s.trim()).filter(Boolean);
  if (orSplit.length > 1) {
    return { parts: orSplit, combinator: "OR" };
  }
  if (!/^\s*(?:not\s+)?between\b/i.test(expr)) {
    const andSplit = expr.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    if (andSplit.length > 1) {
      return { parts: andSplit, combinator: "AND" };
    }
  }
  return null;
}

/**
 * Builds parameterized SQL WHERE conditions for per-column quick filters (`columnFilters`).
 * Supports Microsoft Access-style operators for Number, String, and Date/Time:
 * - Comparison: `=`, `!=`, `<>`, `>=`, `<=`, `>`, `<`
 * - Ranges: `BETWEEN a AND b`, `NOT BETWEEN a AND b`, `a..b`
 * - Sets: `IN (a, b, c)`, `NOT IN (a, b, c)`
 * - Pattern / Text: `LIKE`, `NOT LIKE`, wildcards `*` and `?`, `STARTS WITH`, `ENDS WITH`, `CONTAINS`, `NOT CONTAINS`
 * - Nulls: `NULL`, `!NULL`, `IS NULL`, `IS NOT NULL`, `= NULL`, `<> NULL`, `EMPTY`, `NOT EMPTY`
 * - Compound: `> 100 AND <= 500`, `= 'VIP' OR = 'Enterprise'`
 * - Default case-insensitive substring matching.
 */
export function buildColumnFilterWhere(
  columnFilters: Record<string, string> | undefined,
  validColumns: string[],
  dialect: StudioDialect,
  startParamIndex: number = 1
): { clauses: string[]; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];
  if (!columnFilters || typeof columnFilters !== "object") {
    return { clauses, params };
  }

  const validSet = new Set(validColumns);
  let pIdx = startParamIndex;
  const nextPlaceholder = () => (dialect === "postgres" ? `$${pIdx++}` : "?");
  const castText = (qCol: string) =>
    dialect === "mysql" ? `CAST(${qCol} AS CHAR)` : `CAST(${qCol} AS TEXT)`;
  const castNum = (qCol: string) =>
    dialect === "mysql" ? `CAST(${qCol} AS DECIMAL(65,10))` : dialect === "postgres" ? `CAST(${qCol} AS DOUBLE PRECISION)` : `CAST(${qCol} AS REAL)`;
  const likeOp = dialect === "postgres" ? "ILIKE" : "LIKE";
  const notLikeOp = dialect === "postgres" ? "NOT ILIKE" : "NOT LIKE";

  const buildSingleAtom = (col: string, qCol: string, rawAtom: string): string | null => {
    let expr = String(rawAtom ?? "").trim();
    if (!expr) return null;

    // Strip optional leading column name (e.g. `balance <= 500` or `[balance] <= 500` typed into `balance` column)
    const escCol = col.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const colPrefixRe = new RegExp(`^(?:\\[?["\`]?${escCol}["\`]?\\]?)\\s+(?=(?:>=|<=|!=|<>|>|<|=|between\\b|not\\b|in\\b|like\\b|is\\b|starts\\b|begins\\b|ends\\b|contains\\b))`, "i");
    expr = expr.replace(colPrefixRe, "").trim();
    if (!expr) return null;

    // Skip incomplete operator-only inputs while the user is still typing in the filter box
    if (/^(>=|<=|!=|<>|>|<|=|!|not|between|not\s+between|in|not\s+in|like|not\s+like|starts\s+with|begins\s+with|ends\s+with|contains|not\s+contains)$/i.test(expr)) {
      return null;
    }

    const lower = expr.toLowerCase();

    // 1. NULL / EMPTY checks
    if (lower === "null" || lower === "is null" || lower === "= null" || lower === "=null" || lower === "empty" || lower === "is empty") {
      return `${qCol} IS NULL`;
    }
    if (lower === "!null" || lower === "not null" || lower === "is not null" || lower === "<> null" || lower === "!= null" || lower === "<>null" || lower === "!=null" || lower === "not empty" || lower === "is not empty") {
      return `${qCol} IS NOT NULL`;
    }

    // 2. BETWEEN a AND b / NOT BETWEEN a AND b / a..b
    const betweenMatch = /^(not\s+)?between\s+(.+?)\s+and\s+(.+)$/i.exec(expr);
    const rangeDotsMatch = !betweenMatch ? /^([^.]+?)\s*\.\.\s*(.+)$/.exec(expr) : null;
    if (betweenMatch || rangeDotsMatch) {
      const isNot = Boolean(betweenMatch && betweenMatch[1]);
      const rawLow = (betweenMatch ? betweenMatch[2]! : rangeDotsMatch![1]!).trim();
      const rawHigh = (betweenMatch ? betweenMatch[3]! : rangeDotsMatch![2]!).trim();
      if (!rawLow || !rawHigh) return null;

      const kw = isNot ? "NOT BETWEEN" : "BETWEEN";
      const nLow = parseNumericFilterValue(rawLow);
      const nHigh = parseNumericFilterValue(rawHigh);
      if (nLow !== null && nHigh !== null) {
        params.push(nLow, nHigh);
        return `${castNum(qCol)} ${kw} ${nextPlaceholder()} AND ${nextPlaceholder()}`;
      }
      const dLow = normalizeDateFilterValue(rawLow);
      const dHigh = normalizeDateFilterValue(rawHigh);
      if (dLow && dHigh) {
        const len = dLow.isDateOnly && dHigh.isDateOnly ? 10 : Math.max(dLow.iso.length, dHigh.iso.length);
        params.push(dLow.iso, dHigh.iso);
        return `SUBSTR(${castText(qCol)}, 1, ${len}) ${kw} ${nextPlaceholder()} AND ${nextPlaceholder()}`;
      }
      params.push(stripFilterDelimiters(rawLow), stripFilterDelimiters(rawHigh));
      return `${castText(qCol)} ${kw} ${nextPlaceholder()} AND ${nextPlaceholder()}`;
    }

    // 3. IN (a, b, c) / NOT IN (a, b, c)
    const inMatch = /^(not\s+)?in\s*\((.*)\)$/i.exec(expr);
    if (inMatch) {
      const isNot = Boolean(inMatch[1]);
      const items = inMatch[2]!
        .split(",")
        .map((s) => stripFilterDelimiters(s))
        .filter((s) => s.length > 0);
      if (items.length === 0) return null;
      const allNumeric = items.every((item) => parseNumericFilterValue(item) !== null);
      const kw = isNot ? "NOT IN" : "IN";
      if (allNumeric) {
        const placeholders = items.map((item) => {
          params.push(parseNumericFilterValue(item)!);
          return nextPlaceholder();
        });
        return `${castNum(qCol)} ${kw} (${placeholders.join(", ")})`;
      }
      const placeholders = items.map((item) => {
        params.push(item);
        return nextPlaceholder();
      });
      return `LOWER(${castText(qCol)}) ${kw} (${placeholders.map((p) => `LOWER(${p})`).join(", ")})`;
    }

    // 4. STARTS WITH / BEGINS WITH / ENDS WITH / CONTAINS / NOT CONTAINS
    const textFnMatch = /^(not\s+contains|!contains|does\s+not\s+contain|contains|starts\s+with|begins\s+with|ends\s+with)\s+(.+)$/i.exec(expr);
    if (textFnMatch) {
      const fn = textFnMatch[1]!.toLowerCase().replace(/\s+/g, " ");
      const val = stripFilterDelimiters(textFnMatch[2]!);
      if (!val) return null;
      if (fn === "starts with" || fn === "begins with") {
        params.push(`${val}%`);
        return `${castText(qCol)} ${likeOp} ${nextPlaceholder()}`;
      }
      if (fn === "ends with") {
        params.push(`%${val}`);
        return `${castText(qCol)} ${likeOp} ${nextPlaceholder()}`;
      }
      if (fn === "contains") {
        params.push(`%${val}%`);
        return `${castText(qCol)} ${likeOp} ${nextPlaceholder()}`;
      }
      params.push(`%${val}%`);
      return `(${qCol} IS NULL OR ${castText(qCol)} ${notLikeOp} ${nextPlaceholder()})`;
    }

    // 5. LIKE / NOT LIKE (with Access `*` and `?` wildcard conversion)
    const likeMatch = /^(not\s+)?like\s+(.+)$/i.exec(expr);
    if (likeMatch) {
      const isNot = Boolean(likeMatch[1]);
      let pattern = stripFilterDelimiters(likeMatch[2]!);
      if (!pattern) return null;
      pattern = pattern.replace(/\*/g, "%").replace(/\?/g, "_");
      if (!pattern.includes("%") && !pattern.includes("_")) {
        pattern = `%${pattern}%`;
      }
      params.push(pattern);
      return `${castText(qCol)} ${isNot ? notLikeOp : likeOp} ${nextPlaceholder()}`;
    }

    // 6. Comparison operators: `>=`, `<=`, `!=`, `<>`, `>`, `<`, `=`
    const opMatch = /^(>=|<=|!=|<>|>|<|=)\s*(.*)$/.exec(expr);
    if (opMatch) {
      const rawOp = opMatch[1]!;
      const op = rawOp === "!=" ? "<>" : rawOp;
      const rawRhs = opMatch[2]!.trim();
      if (!rawRhs) return null;

      const unquotedRhs = stripFilterDelimiters(rawRhs);
      const isExplicitlyQuotedString =
        (rawRhs.startsWith("'") && rawRhs.endsWith("'")) ||
        (rawRhs.startsWith('"') && rawRhs.endsWith('"'));

      // Check date literal first (e.g., `<= 2026-10-30`, `>= #2026-01-01#`, `< 10/30/2026`)
      const dateVal = normalizeDateFilterValue(rawRhs);
      if (dateVal) {
        const substrLen = dateVal.isDateOnly ? 10 : dateVal.iso.length;
        params.push(dateVal.iso);
        return `SUBSTR(${castText(qCol)}, 1, ${substrLen}) ${op} ${nextPlaceholder()}`;
      }

      // Check numeric literal (e.g., `<= 500`, `< 50`, `= 450`, `<> 0`)
      const numVal = !isExplicitlyQuotedString ? parseNumericFilterValue(rawRhs) : null;
      if (numVal !== null) {
        params.push(numVal);
        return `${castNum(qCol)} ${op} ${nextPlaceholder()}`;
      }

      // If `= *foo*` or `<> *foo*` uses Access wildcards
      if ((op === "=" || op === "<>") && (unquotedRhs.includes("*") || unquotedRhs.includes("?"))) {
        const pattern = unquotedRhs.replace(/\*/g, "%").replace(/\?/g, "_");
        params.push(pattern);
        return `${castText(qCol)} ${op === "<>" ? notLikeOp : likeOp} ${nextPlaceholder()}`;
      }

      params.push(unquotedRhs);
      return `${castText(qCol)} ${op} ${nextPlaceholder()}`;
    }

    // 7. Wildcard pattern without `LIKE` keyword (e.g., `A*`, `*@example.com`, `VIP?`)
    const unquoted = stripFilterDelimiters(expr);
    if (unquoted.includes("*") || unquoted.includes("?")) {
      const pattern = unquoted.replace(/\*/g, "%").replace(/\?/g, "_");
      params.push(pattern);
      return `${castText(qCol)} ${likeOp} ${nextPlaceholder()}`;
    }

    // 8. Negation prefix `!value` (does not contain)
    if (expr.startsWith("!") && expr.length > 1) {
      const negVal = stripFilterDelimiters(expr.slice(1));
      if (!negVal) return null;
      params.push(`%${negVal}%`);
      return `(${qCol} IS NULL OR ${castText(qCol)} ${notLikeOp} ${nextPlaceholder()})`;
    }

    // 9. Default case-insensitive substring match
    params.push(`%${unquoted}%`);
    return `${castText(qCol)} ${likeOp} ${nextPlaceholder()}`;
  };

  for (const [col, rawExpr] of Object.entries(columnFilters)) {
    if (!validSet.has(col)) continue;
    const expr = String(rawExpr ?? "").trim();
    if (!expr) continue;

    const qCol = quoteCol(col, dialect);
    const compound = splitCompoundAccessFilter(expr);
    if (compound) {
      const subClauses: string[] = [];
      for (const part of compound.parts) {
        const built = buildSingleAtom(col, qCol, part);
        if (built) subClauses.push(`(${built})`);
      }
      if (subClauses.length === 1) {
        clauses.push(subClauses[0]!);
      } else if (subClauses.length > 1) {
        clauses.push(`(${subClauses.join(` ${compound.combinator} `)})`);
      }
      continue;
    }

    const single = buildSingleAtom(col, qCol, expr);
    if (single) clauses.push(single);
  }

  return { clauses, params };
}

/**
 * Builds parameterized SQL WHERE condition for the global `#gridSearchInput` ("Filter rows...") box.
 * If the user enters a column-targeted Access filter expression such as `balance <= 500`,
 * `created_at >= 2025-01-01`, or `tier = 'VIP'`, it delegates to `buildColumnFilterWhere`.
 * Otherwise it performs a case-insensitive search across all table columns.
 */
export function buildSearchFilterWhere(
  search: string | undefined,
  validColumns: string[],
  dialect: StudioDialect,
  startParamIndex: number = 1
): { clause: string | null; params: any[] } {
  const raw = String(search ?? "").trim();
  if (!raw || validColumns.length === 0) {
    return { clause: null, params: [] };
  }

  // Check if search begins with a valid column name followed by an Access filter operator
  const colLookup = new Map<string, string>();
  for (const c of validColumns) {
    colLookup.set(c.toLowerCase(), c);
  }

  const colExprMatch = /^\[?["`]?([a-zA-Z0-9_]+)["`]?\]?\s*(>=|<=|!=|<>|>|<|=|\.\.|\b(?:between|not\s+between|in|not\s+in|like|not\s+like|is\s+null|is\s+not\s+null|starts\s+with|begins\s+with|ends\s+with|contains|not\s+contains)\b)(.*)$/i.exec(raw);
  if (colExprMatch) {
    const matchedCol = colLookup.get(colExprMatch[1]!.toLowerCase());
    if (matchedCol) {
      const rhsExpr = `${colExprMatch[2]} ${colExprMatch[3] || ""}`.trim();
      const res = buildColumnFilterWhere({ [matchedCol]: rhsExpr }, validColumns, dialect, startParamIndex);
      if (res.clauses.length > 0) {
        return { clause: res.clauses.join(" AND "), params: res.params };
      }
      return { clause: null, params: [] };
    }
  }

  let pIdx = startParamIndex;
  const nextPlaceholder = () => (dialect === "postgres" ? `$${pIdx++}` : "?");
  const castText = (qCol: string) =>
    dialect === "mysql" ? `CAST(${qCol} AS CHAR)` : `CAST(${qCol} AS TEXT)`;
  const likeOp = dialect === "postgres" ? "ILIKE" : "LIKE";

  const params: any[] = [];
  const sub = validColumns.map((c) => {
    params.push(`%${raw}%`);
    return `${castText(quoteCol(c, dialect))} ${likeOp} ${nextPlaceholder()}`;
  });
  return { clause: `(${sub.join(" OR ")})`, params };
}

/**
 * Builds a validated `ORDER BY` clause supporting multi-column sorting (`sortColumns`)
 * with fallback to single-column `orderBy` + `orderDir`.
 */
export function buildOrderClause(
  validColumns: string[],
  dialect: StudioDialect,
  options: {
    sortColumns?: SortColumnSpec[];
    orderBy?: string;
    orderDir?: string;
    defaultPkColumn?: string;
  }
): string {
  const validSet = new Set(validColumns);
  const parts: string[] = [];

  if (Array.isArray(options.sortColumns) && options.sortColumns.length > 0) {
    const seen = new Set<string>();
    for (const sc of options.sortColumns) {
      if (!sc || typeof sc.col !== "string" || !validSet.has(sc.col) || seen.has(sc.col)) continue;
      seen.add(sc.col);
      const dir = String(sc.dir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
      parts.push(`${quoteCol(sc.col, dialect)} ${dir}`);
    }
  } else if (options.orderBy && validSet.has(options.orderBy)) {
    const dir = String(options.orderDir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
    parts.push(`${quoteCol(options.orderBy, dialect)} ${dir}`);
  } else if (options.defaultPkColumn && validSet.has(options.defaultPkColumn)) {
    parts.push(`${quoteCol(options.defaultPkColumn, dialect)} ASC`);
  }

  return parts.length > 0 ? `ORDER BY ${parts.join(", ")}` : "";
}

export interface DiffTableShape {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    notnull?: boolean;
    dflt_value?: any;
    pk?: boolean;
  }>;
}

export interface SchemaDiffResult {
  hasChanges: boolean;
  summary: {
    addedTables: string[];
    removedTables: string[];
    modifiedTables: string[];
    addedColumns: number;
    removedColumns: number;
    typeChanges: number;
  };
  statements: string[];
  ddl: string;
}

/**
 * Computes a forward migration DDL script to evolve `baselineTables` into `currentTables`.
 */
export function computeSchemaDiffDdl(
  baselineTables: DiffTableShape[],
  currentTables: DiffTableShape[],
  dialect: StudioDialect = "sqlite"
): SchemaDiffResult {
  const baseMap = new Map<string, DiffTableShape>();
  for (const t of baselineTables || []) {
    if (t && t.name) baseMap.set(t.name, t);
  }
  const currMap = new Map<string, DiffTableShape>();
  for (const t of currentTables || []) {
    if (t && t.name) currMap.set(t.name, t);
  }

  const addedTables: string[] = [];
  const removedTables: string[] = [];
  const modifiedTables: string[] = [];
  let addedColumns = 0;
  let removedColumns = 0;
  let typeChanges = 0;
  const statements: string[] = [];

  const safeDdlType = (rawType: unknown): string => {
    const s = String(rawType || "TEXT").trim() || "TEXT";
    if (/;|--|\/\*|\*\//.test(s) || !/^[A-Za-z0-9_ (),.\[\]'"]+$/.test(s)) return "TEXT";
    return s;
  };
  const safeDdlDefault = (rawDflt: unknown): string => {
    if (rawDflt === undefined || rawDflt === null || String(rawDflt) === "") return "";
    const s = String(rawDflt).trim();
    if (!s || /;|--|\/\*|\*\//.test(s)) return "";
    return ` DEFAULT ${s}`;
  };

  for (const [name, curr] of currMap.entries()) {
    const qTable = quoteCol(name, dialect);
    if (!baseMap.has(name)) {
      addedTables.push(name);
      const colDefs = (curr.columns || []).map((c) => {
        const qCol = quoteCol(c.name, dialect);
        const typeStr = safeDdlType(c.type);
        const pkStr = c.pk ? " PRIMARY KEY" : "";
        const nnStr = c.notnull && !c.pk ? " NOT NULL" : "";
        const dfltStr = safeDdlDefault(c.dflt_value);
        return `  ${qCol} ${typeStr}${pkStr}${nnStr}${dfltStr}`;
      });
      statements.push(`CREATE TABLE ${qTable} (\n${colDefs.join(",\n")}\n);`);
      continue;
    }

    const base = baseMap.get(name)!;
    const baseCols = new Map((base.columns || []).map((c) => [c.name, c]));
    const currCols = new Map((curr.columns || []).map((c) => [c.name, c]));
    let tableModified = false;

    for (const [colName, col] of currCols.entries()) {
      const qCol = quoteCol(colName, dialect);
      if (!baseCols.has(colName)) {
        tableModified = true;
        addedColumns++;
        const typeStr = safeDdlType(col.type);
        const nnStr = col.notnull ? " NOT NULL" : "";
        const dfltStr = safeDdlDefault(col.dflt_value) || (col.notnull ? " DEFAULT ''" : "");
        statements.push(`ALTER TABLE ${qTable} ADD COLUMN ${qCol} ${typeStr}${nnStr}${dfltStr};`);
      } else {
        const oldCol = baseCols.get(colName)!;
        const oldType = safeDdlType(oldCol.type).toUpperCase().trim();
        const newType = safeDdlType(col.type).toUpperCase().trim();
        if (oldType !== newType || Boolean(oldCol.notnull) !== Boolean(col.notnull)) {
          tableModified = true;
          typeChanges++;
          if (dialect === "postgres") {
            if (oldType !== newType) {
              statements.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qCol} TYPE ${safeDdlType(col.type)};`);
            }
            if (Boolean(oldCol.notnull) !== Boolean(col.notnull)) {
              statements.push(`ALTER TABLE ${qTable} ALTER COLUMN ${qCol} ${col.notnull ? "SET NOT NULL" : "DROP NOT NULL"};`);
            }
          } else if (dialect === "mysql") {
            statements.push(`ALTER TABLE ${qTable} MODIFY COLUMN ${qCol} ${safeDdlType(col.type)}${col.notnull ? " NOT NULL" : " NULL"};`);
          } else {
            statements.push(`-- SQLite column modification on ${qTable}.${qCol}: ${oldType || "ANY"} -> ${newType || "ANY"} (use Table Redesign in SQLite Studio)`);
          }
        }
      }
    }

    for (const [colName] of baseCols.entries()) {
      if (!currCols.has(colName)) {
        tableModified = true;
        removedColumns++;
        const qCol = quoteCol(colName, dialect);
        statements.push(`ALTER TABLE ${qTable} DROP COLUMN ${qCol};`);
      }
    }

    if (tableModified) modifiedTables.push(name);
  }

  for (const [name] of baseMap.entries()) {
    if (!currMap.has(name)) {
      removedTables.push(name);
      statements.push(`DROP TABLE ${quoteCol(name, dialect)};`);
    }
  }

  const hasChanges = statements.length > 0;
  const header = [
    `-- Schema Migration DDL (${dialect.toUpperCase()})`,
    `-- Added tables: ${addedTables.length}, Modified tables: ${modifiedTables.length}, Removed tables: ${removedTables.length}`,
  ].join("\n");

  return {
    hasChanges,
    summary: {
      addedTables,
      removedTables,
      modifiedTables,
      addedColumns,
      removedColumns,
      typeChanges,
    },
    statements,
    ddl: hasChanges ? `${header}\n\n${statements.join("\n\n")}` : `-- No schema differences detected (${dialect.toUpperCase()}).`,
  };
}
