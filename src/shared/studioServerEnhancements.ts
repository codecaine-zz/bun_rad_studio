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

/**
 * Builds parameterized SQL WHERE conditions for per-column quick filters (`columnFilters`).
 * Supports operators (`=`, `!=`, `<>`, `>=`, `<=`, `>`, `<`, `null`, `!null`, `is null`, `is not null`)
 * as well as default case-insensitive substring matching.
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

  for (const [col, rawExpr] of Object.entries(columnFilters)) {
    if (!validSet.has(col)) continue;
    const expr = String(rawExpr ?? "").trim();
    if (!expr) continue;

    const qCol = quoteCol(col, dialect);
    const lower = expr.toLowerCase();

    if (lower === "null" || lower === "is null") {
      clauses.push(`${qCol} IS NULL`);
      continue;
    }
    if (lower === "!null" || lower === "not null" || lower === "is not null") {
      clauses.push(`${qCol} IS NOT NULL`);
      continue;
    }

    const opMatch = /^(>=|<=|!=|<>|>|<|=)\s*(.*)$/.exec(expr);
    if (opMatch) {
      const rawOp = opMatch[1]!;
      const op = rawOp === "!=" ? "<>" : rawOp;
      const rhs = opMatch[2]!.trim();
      const numVal = Number(rhs);
      if (rhs !== "" && !Number.isNaN(numVal) && (op === ">" || op === ">=" || op === "<" || op === "<=")) {
        clauses.push(`${castNum(qCol)} ${op} ${nextPlaceholder()}`);
        params.push(numVal);
      } else {
        clauses.push(`${castText(qCol)} ${op} ${nextPlaceholder()}`);
        params.push(rhs);
      }
      continue;
    }

    if (dialect === "postgres") {
      clauses.push(`${castText(qCol)} ILIKE ${nextPlaceholder()}`);
      params.push(`%${expr}%`);
    } else {
      clauses.push(`${castText(qCol)} LIKE ${nextPlaceholder()}`);
      params.push(`%${expr}%`);
    }
  }

  return { clauses, params };
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
