import type { Engine } from "./types";
import { leadingKeyword } from "./splitter";

export type StatementKind = "read" | "write" | "ddl" | "destructive" | "transaction" | "admin" | "other";

export interface Classification {
  kind: StatementKind;
  /** Human-readable reasons, shown in the confirmation dialog. */
  reasons: string[];
}

/** Blank out quoted text and comments so keyword checks cannot be fooled by data. Length is preserved. */
export function maskLiterals(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/'(?:[^'\\]|\\.|'')*'/g, (m) => "'" + " ".repeat(Math.max(0, m.length - 2)) + "'")
    .replace(/"(?:[^"\\]|\\.|"")*"/g, (m) => '"' + " ".repeat(Math.max(0, m.length - 2)) + '"')
    .replace(/`(?:[^`]|``)*`/g, (m) => "`" + " ".repeat(Math.max(0, m.length - 2)) + "`");
}

/**
 * Best-effort classification used to decide when a confirmation is needed. It is a safety net for people,
 * not a security boundary (read-only enforcement lives in the adapters).
 */
export function classifyStatement(_engine: Engine, sql: string): Classification {
  const kw = leadingKeyword(sql);
  const masked = maskLiterals(sql);
  const has = (re: RegExp) => re.test(masked);
  switch (kw) {
    case "SELECT":
    case "SHOW":
    case "DESCRIBE":
    case "DESC":
    case "EXPLAIN":
    case "VALUES":
    case "TABLE":
    case "PRAGMA":
      if (kw === "PRAGMA" && has(/=/)) return { kind: "admin", reasons: ["Changes a database setting (PRAGMA)"] };
      if (kw === "EXPLAIN" && has(/\banalyze\b/i) && has(/\b(insert|update|delete|merge)\b/i)) return { kind: "write", reasons: ["EXPLAIN ANALYZE executes the statement and will change data"] };
      return { kind: "read", reasons: [] };
    case "WITH":
      return has(/\b(insert|update|delete|merge)\b/i) ? { kind: "write", reasons: ["Data-changing statement inside WITH"] } : { kind: "read", reasons: [] };
    case "BEGIN":
    case "START":
    case "COMMIT":
    case "ROLLBACK":
    case "END":
    case "SAVEPOINT":
    case "RELEASE":
      return { kind: "transaction", reasons: [] };
    case "DROP":
      return { kind: "destructive", reasons: ["Drops (permanently removes) a database object"] };
    case "TRUNCATE":
      return { kind: "destructive", reasons: ["Removes every row of the table"] };
    case "DELETE":
      return has(/\bwhere\b/i) ? { kind: "write", reasons: ["Deletes rows"] } : { kind: "destructive", reasons: ["DELETE without WHERE removes every row"] };
    case "UPDATE":
      return has(/\bwhere\b/i) ? { kind: "write", reasons: ["Updates rows"] } : { kind: "destructive", reasons: ["UPDATE without WHERE changes every row"] };
    case "INSERT":
    case "REPLACE":
    case "MERGE":
    case "COPY":
    case "LOAD":
    case "CALL":
      return { kind: "write", reasons: ["Changes data"] };
    case "ALTER":
      return has(/\bdrop\b/i) ? { kind: "destructive", reasons: ["ALTER ... DROP removes a column or constraint (data may be lost)"] } : { kind: "ddl", reasons: ["Changes the schema"] };
    case "CREATE":
    case "RENAME":
    case "COMMENT":
      return { kind: "ddl", reasons: ["Changes the schema"] };
    case "GRANT":
    case "REVOKE":
      return { kind: "admin", reasons: ["Changes users, roles or permissions"] };
    case "VACUUM":
    case "REINDEX":
    case "ANALYZE":
    case "OPTIMIZE":
    case "SET":
    case "RESET":
    case "KILL":
      return { kind: "admin", reasons: ["Administrative statement"] };
    default:
      return { kind: "other", reasons: ["Statement type not recognized"] };
  }
}

/** Does this statement need an explicit confirmation on a connection of the given environment? */
export function needsConfirmation(c: Classification, production: boolean): boolean {
  if (c.kind === "destructive" || c.kind === "admin" || c.kind === "other") return true;
  if (production) return c.kind === "write" || c.kind === "ddl";
  return false;
}
