/**
 * SQL statement classification (`read`, `write`, `ddl`, `destructive`, `transaction`, `admin`, `other`)
 * used to determine when user confirmation is required before execution.
 */
import type { Engine } from "./types";
import { leadingKeyword } from "./splitter";

/** High-level risk and effect category of a SQL statement. */
export type StatementKind =
  "read" | "write" | "ddl" | "destructive" | "transaction" | "admin" | "other";

/** Result of classifying a SQL statement, pairing its `StatementKind` with human-readable explanations. */
export interface Classification {
  kind: StatementKind;
  /** Human-readable reasons, shown in the confirmation dialog. */
  reasons: string[];
}

const isWordCode = (code: number): boolean =>
  (code >= 65 && code <= 90) ||
  (code >= 97 && code <= 122) ||
  (code >= 48 && code <= 57) ||
  code === 95 ||
  code === 36;

/** Read-only SQLite PRAGMAs that may take a single table/index/schema argument `PRAGMA name(arg)` or zero args. */
const CALLABLE_READONLY_PRAGMAS = new Set([
  "collation_list",
  "compile_options",
  "database_list",
  "foreign_key_check",
  "foreign_key_list",
  "function_list",
  "index_info",
  "index_list",
  "index_xinfo",
  "integrity_check",
  "module_list",
  "pragma_list",
  "quick_check",
  "stats",
  "table_info",
  "table_list",
  "table_xinfo",
]);

/** SQLite PRAGMAs that are read-only ONLY when queried with zero arguments and no `=` assignment. */
const ZERO_ARG_READONLY_PRAGMAS = new Set([
  "application_id",
  "auto_vacuum",
  "automatic_index",
  "busy_timeout",
  "cache_size",
  "cache_spill",
  "cell_size_check",
  "checkpoint_fullfsync",
  "data_version",
  "defer_foreign_keys",
  "encoding",
  "foreign_keys",
  "freelist_count",
  "fullfsync",
  "hard_heap_limit",
  "ignore_check_constraints",
  "journal_mode",
  "journal_size_limit",
  "legacy_alter_table",
  "legacy_file_format",
  "locking_mode",
  "max_page_count",
  "mmap_size",
  "page_count",
  "page_size",
  "query_only",
  "read_uncommitted",
  "recursive_triggers",
  "reverse_unordered_selects",
  "schema_version",
  "secure_delete",
  "soft_heap_limit",
  "synchronous",
  "temp_store",
  "threads",
  "trusted_schema",
  "user_version",
  "wal_autocheckpoint",
]);

/**
 * Returns true iff `sql` is a strictly read-only SQLite `PRAGMA` inspection statement.
 * Rejects `=` assignments, function-call mutations such as `PRAGMA query_only(0)` or `PRAGMA writable_schema(1)`,
 * and side-effecting zero-arg pragmas such as `PRAGMA wal_checkpoint` or `PRAGMA optimize`.
 */
export function isReadOnlyPragma(sql: string): boolean {
  const masked = maskLiterals(sql, "sqlite");
  if (masked.includes("=")) return false;
  const m =
    /^\s*pragma\s+(?:(?:"[^"]*"|`[^`]*`|\[[^\]]*\]|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))?\s*$/i.exec(
      masked,
    );
  if (!m) return false;
  const name = m[1]!.toLowerCase();
  const argGroup = m[2];
  if (argGroup !== undefined) {
    if (!CALLABLE_READONLY_PRAGMAS.has(name)) return false;
    const inner = argGroup.slice(1, -1).trim();
    if (inner.includes(";") || inner.includes("=")) return false;
    return true;
  }
  return (
    CALLABLE_READONLY_PRAGMAS.has(name) || ZERO_ARG_READONLY_PRAGMAS.has(name)
  );
}

/**
 * Blank out quoted text and comments using dialect-accurate lexical rules so keyword checks cannot be
 * fooled by data, `\'` non-escapes, nested PostgreSQL block comments, or MySQL executable comments.
 * Length is strictly preserved (`masked.length === sql.length`).
 */
export function maskLiterals(sql: string, engine: Engine = "postgres"): string {
  const n = sql.length;
  if (n === 0) return "";
  let out = "";
  let i = 0;
  let mysqlExecDepth = 0;

  while (i < n) {
    const c = sql[i]!;
    const next = sql[i + 1];

    // Closing `*/` of an unwrapped MySQL `/*!50000 ... */` executable comment.
    if (mysqlExecDepth > 0 && c === "*" && next === "/") {
      mysqlExecDepth--;
      out += "  ";
      i += 2;
      continue;
    }

    // `--` single-line comment (MySQL requires whitespace or EOF after `--`).
    if (
      c === "-" &&
      next === "-" &&
      (engine !== "mysql" || /\s/.test(sql[i + 2] ?? "\n") || i + 2 >= n)
    ) {
      const eol = sql.indexOf("\n", i);
      const end = eol < 0 ? n : eol;
      out += " ".repeat(end - i);
      i = end;
      continue;
    }

    // MySQL `#` single-line comment.
    if (engine === "mysql" && c === "#") {
      const eol = sql.indexOf("\n", i);
      const end = eol < 0 ? n : eol;
      out += " ".repeat(end - i);
      i = end;
      continue;
    }

    // Block comments `/* ... */` (nested in PostgreSQL; executable `/*! ... */` in MySQL).
    if (c === "/" && next === "*") {
      if (engine === "mysql" && sql[i + 2] === "!") {
        let j = i + 3;
        let digits = 0;
        while (
          j < n &&
          digits < 6 &&
          sql.charCodeAt(j) >= 48 &&
          sql.charCodeAt(j) <= 57
        ) {
          j++;
          digits++;
        }
        out += " ".repeat(j - i);
        i = j;
        mysqlExecDepth++;
        continue;
      }
      const start = i;
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (engine === "postgres" && sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      out += " ".repeat(i - start);
      continue;
    }

    // Quoted strings and quoted identifiers (`'...'`, `"..."`, `` `...` ``, SQLite `[...]`).
    if (
      c === "'" ||
      c === '"' ||
      c === "`" ||
      (engine === "sqlite" && c === "[")
    ) {
      const start = i;
      const close = c === "[" ? "]" : c;
      const backslash = engine === "mysql" && c !== "`";
      const pgEscape =
        engine === "postgres" &&
        c === "'" &&
        i > 0 &&
        (sql[i - 1] === "e" || sql[i - 1] === "E") &&
        (i < 2 || !isWordCode(sql.charCodeAt(i - 2)));
      i++;
      let closed = false;
      while (i < n) {
        const ch = sql[i]!;
        if ((backslash || pgEscape) && ch === "\\") {
          i = Math.min(n, i + 2);
          continue;
        }
        if (ch === close) {
          if (c !== "[" && sql[i + 1] === close) {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      const len = i - start;
      if (closed && len >= 2) {
        out += c + " ".repeat(len - 2) + close;
      } else {
        out += c + " ".repeat(Math.max(0, len - 1));
      }
      continue;
    }

    // PostgreSQL dollar-quoted strings: `$$...$$` or `$tag$...$tag$`.
    if (
      engine === "postgres" &&
      c === "$" &&
      !(i > 0 && isWordCode(sql.charCodeAt(i - 1)))
    ) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const endIdx = sql.indexOf(tag, i + tag.length);
        const end = endIdx < 0 ? n : endIdx + tag.length;
        const len = end - i;
        out += "'" + " ".repeat(Math.max(0, len - 2)) + (len >= 2 ? "'" : "");
        i = end;
        continue;
      }
    }

    out += c;
    i++;
  }
  return out;
}

/**
 * Best-effort classification used to decide when a confirmation is needed. It is a safety net for people,
 * not a security boundary (read-only enforcement lives in the adapters).
 */
export function classifyStatement(engine: Engine, sql: string): Classification {
  const kw = leadingKeyword(sql, engine);
  let masked: string | undefined;
  const getMasked = () => (masked ??= maskLiterals(sql, engine));
  const has = (re: RegExp) => re.test(getMasked());
  switch (kw) {
    case "SELECT":
      if (engine === "mysql" && has(/\binto\s+(outfile|dumpfile)\b/i)) {
        return {
          kind: "admin",
          reasons: ["SELECT ... INTO OUTFILE/DUMPFILE writes server files"],
        };
      }
      return { kind: "read", reasons: [] };
    case "SHOW":
    case "DESCRIBE":
    case "DESC":
    case "VALUES":
    case "TABLE":
      return { kind: "read", reasons: [] };
    case "PRAGMA":
      if (!isReadOnlyPragma(sql)) {
        return {
          kind: "admin",
          reasons: ["Changes or invokes a non-read-only database PRAGMA"],
        };
      }
      return { kind: "read", reasons: [] };
    case "EXPLAIN":
      if (has(/\banalyze\b/i)) {
        if (has(/\b(drop|truncate)\b/i)) {
          return {
            kind: "destructive",
            reasons: [
              "EXPLAIN ANALYZE executes the statement and will destroy data",
            ],
          };
        }
        if (
          has(/\b(delete|update)\b/i) &&
          !has(/\bwhere\b/i) &&
          !has(/\b(insert|merge|replace|create|alter)\b/i)
        ) {
          return {
            kind: "destructive",
            reasons: [
              "EXPLAIN ANALYZE executes DELETE/UPDATE without WHERE and changes every row",
            ],
          };
        }
        if (has(/\b(create|alter|rename|comment)\b/i)) {
          return {
            kind: "ddl",
            reasons: [
              "EXPLAIN ANALYZE executes the statement and changes schema",
            ],
          };
        }
        if (
          has(
            /\b(insert|update|delete|merge|replace|copy|load|call|do|vacuum|reindex|grant|revoke)\b/i,
          )
        ) {
          return {
            kind: "write",
            reasons: [
              "EXPLAIN ANALYZE executes the statement and will change data",
            ],
          };
        }
      }
      return { kind: "read", reasons: [] };
    case "WITH":
      if (engine === "mysql" && has(/\binto\s+(outfile|dumpfile)\b/i)) {
        return {
          kind: "admin",
          reasons: ["WITH ... INTO OUTFILE/DUMPFILE writes server files"],
        };
      }
      if (has(/\b(drop|truncate)\b/i)) {
        return {
          kind: "destructive",
          reasons: ["Destructive statement inside WITH"],
        };
      }
      return has(/\b(insert|update|delete|merge|replace|copy|call)\b/i)
        ? { kind: "write", reasons: ["Data-changing statement inside WITH"] }
        : { kind: "read", reasons: [] };
    case "BEGIN":
    case "START":
    case "COMMIT":
    case "ROLLBACK":
    case "END":
    case "SAVEPOINT":
    case "RELEASE":
      return { kind: "transaction", reasons: [] };
    case "DROP":
      return {
        kind: "destructive",
        reasons: ["Drops (permanently removes) a database object"],
      };
    case "TRUNCATE":
      return {
        kind: "destructive",
        reasons: ["Removes every row of the table"],
      };
    case "DELETE":
      return has(/\bwhere\b/i)
        ? { kind: "write", reasons: ["Deletes rows"] }
        : {
            kind: "destructive",
            reasons: ["DELETE without WHERE removes every row"],
          };
    case "UPDATE":
      return has(/\bwhere\b/i)
        ? { kind: "write", reasons: ["Updates rows"] }
        : {
            kind: "destructive",
            reasons: ["UPDATE without WHERE changes every row"],
          };
    case "COPY":
      if (has(/\bprogram\b/i)) {
        return {
          kind: "destructive",
          reasons: ["COPY ... PROGRAM executes a host command on the server"],
        };
      }
      return { kind: "write", reasons: ["Changes or copies data"] };
    case "INSERT":
    case "REPLACE":
    case "MERGE":
    case "LOAD":
    case "CALL":
    case "DO":
      return { kind: "write", reasons: ["Changes data"] };
    case "ALTER":
      return has(/\bdrop\b/i)
        ? {
            kind: "destructive",
            reasons: [
              "ALTER ... DROP removes a column or constraint (data may be lost)",
            ],
          }
        : { kind: "ddl", reasons: ["Changes the schema"] };
    case "CREATE":
    case "RENAME":
    case "COMMENT":
      return { kind: "ddl", reasons: ["Changes the schema"] };
    case "GRANT":
    case "REVOKE":
      return {
        kind: "admin",
        reasons: ["Changes users, roles or permissions"],
      };
    case "VACUUM":
    case "REINDEX":
    case "ANALYZE":
    case "OPTIMIZE":
    case "SET":
    case "RESET":
    case "KILL":
    case "ATTACH":
    case "DETACH":
      return { kind: "admin", reasons: ["Administrative statement"] };
    default:
      return { kind: "other", reasons: ["Statement type not recognized"] };
  }
}

/** Does this statement need an explicit confirmation on a connection of the given environment? */
export function needsConfirmation(
  c: Classification,
  production: boolean,
): boolean {
  if (c.kind === "destructive" || c.kind === "admin" || c.kind === "other")
    return true;
  if (production) return c.kind === "write" || c.kind === "ddl";
  return false;
}
