import type { Engine } from "./types";
import { leadingKeyword } from "./splitter";

export type DbErrorCode =
  | "CONNECTION_REFUSED"
  | "HOST_NOT_FOUND"
  | "AUTH_FAILED"
  | "DATABASE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "SYNTAX_ERROR"
  | "CONSTRAINT_VIOLATION"
  | "OBJECT_NOT_FOUND"
  | "LOCKED"
  | "TIMEOUT"
  | "CANCELED"
  | "READ_ONLY"
  | "TLS_ERROR"
  | "CONFLICT"
  | "NOT_EDITABLE"
  | "INVALID_REQUEST"
  | "CONNECTION_LOST"
  | "UNKNOWN";

/** An error that is safe to show to a user: no credentials, plus an actionable hint when we know one. */
export class DbError extends Error {
  readonly code: DbErrorCode;
  readonly hint?: string;
  readonly engineCode?: string;
  constructor(code: DbErrorCode, message: string, hint?: string, engineCode?: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
    this.hint = hint;
    this.engineCode = engineCode;
  }
  toJSON() {
    return { code: this.code, message: this.message, hint: this.hint, engineCode: this.engineCode };
  }
}

export function redact(text: string, secrets: (string | undefined)[]): string {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 3) out = out.split(s).join("********");
  return out.replace(/(password|pwd|passwd)=([^&\s;]+)/gi, "$1=********").replace(/(:\/\/[^:/@\s]+:)[^@\s]+@/g, "$1********@");
}

const HINTS: Partial<Record<DbErrorCode, string>> = {
  CONNECTION_REFUSED: "Check that the server is running and that host and port are correct.",
  HOST_NOT_FOUND: "Check the host name for typos and your network/DNS settings.",
  AUTH_FAILED: "Check the user name and password, and that this account may connect from this machine.",
  DATABASE_NOT_FOUND: "The database does not exist on this server. Check the name or create it first.",
  PERMISSION_DENIED: "This account lacks the required privilege. Ask an administrator or use another connection profile.",
  LOCKED: "Another connection holds a lock on this data. Wait and retry, or close the other session.",
  TIMEOUT: "The statement exceeded the time limit.",
  TLS_ERROR: "TLS negotiation failed. Verify the server certificate/CA, or disable TLS only for trusted local servers.",
  READ_ONLY: "This connection is read-only. Use a read-write profile to change data.",
  CONNECTION_LOST: "The connection to the server was lost. Reconnect and retry.",
};

/** Map any driver error onto a stable code. `secrets` are removed from the message. */
export function normalizeError(engine: Engine, err: unknown, secrets: (string | undefined)[] = []): DbError {
  if (err instanceof DbError) return err;
  const e = err as { message?: string; code?: string; errno?: number | string; sqlState?: string } | undefined;
  const raw = redact(String(e?.message ?? err ?? "Unknown error"), secrets);
  const code = String(e?.code ?? "");
  const errno = e?.errno;
  const state = String(e?.sqlState ?? "");
  const msg = raw.toLowerCase();
  const mk = (c: DbErrorCode, engineCode?: string) => new DbError(c, raw, HINTS[c], engineCode ?? (code || undefined));

  if (/econnrefused|connection refused|failed to connect|unable to connect/.test(msg) || code === "ERR_POSTGRES_CONNECTION_CLOSED" && /refused/.test(msg)) return mk("CONNECTION_REFUSED");
  if (/enotfound|getaddrinfo|eai_again/.test(msg)) return mk("HOST_NOT_FOUND");
  if (/certificate|self.signed|ssl|tls/.test(msg) && !/read.only/.test(msg)) return mk("TLS_ERROR");
  if (errno === 1045 || state === "28000" || /access denied for user|password authentication failed|authentication failed|no pg_hba/.test(msg) || state === "28P01") return mk("AUTH_FAILED");
  if (errno === 1049 || /unknown database|database ".*" does not exist/.test(msg) || (state === "3D000")) return mk("DATABASE_NOT_FOUND");
  if (/read.only|readonly|attempt to write a readonly/.test(msg) || errno === 1792 || state === "25006") return mk("READ_ONLY");
  if (errno === 1044 || errno === 1142 || errno === 1143 || state === "42501" || /permission denied|command denied|access denied/.test(msg)) return mk("PERMISSION_DENIED");
  if (/statement timeout|max_execution_time|maximum statement execution time/.test(msg) || errno === 3024 || errno === 1969) return mk("TIMEOUT");
  if (/cancel(l)?ing statement|query execution was interrupted|query was canceled|interrupted/.test(msg) || state === "57014") return mk("CANCELED");
  if (/database is locked|database table is locked|sqlite_busy|lock wait timeout|deadlock|could not obtain lock|55p03|40p01/.test(msg) || errno === 1205 || errno === 1213 || state === "40P01" || state === "55P03") return mk("LOCKED");
  if (/unique constraint|duplicate entry|violates (unique|foreign key|not-null|check)|constraint failed|foreign key constraint|cannot be null|not null constraint/.test(msg) || [1062, 1451, 1452, 1048, 3819].includes(Number(errno)) || /^23/.test(state)) return mk("CONSTRAINT_VIOLATION");
  if (/syntax error|you have an error in your sql syntax|near ".*": syntax/.test(msg) || errno === 1064 || state === "42601") return mk("SYNTAX_ERROR");
  if (/no such (table|column)|doesn't exist|does not exist|unknown column|undefined_table|undefined_column/.test(msg) || errno === 1146 || errno === 1054 || state === "42P01" || state === "42703") return mk("OBJECT_NOT_FOUND");
  if (/connection (closed|terminated|lost)|connection must be a|server closed the connection|broken pipe|econnreset|socket/.test(msg) || code === "ERR_POSTGRES_CONNECTION_CLOSED" || code === "ERR_MYSQL_CONNECTION_CLOSED") return mk("CONNECTION_LOST");
  return mk("UNKNOWN");
}

/** Statements allowed on a read-only connection (defense in depth on top of the engine-level enforcement). */
const READ_KEYWORDS = new Set(["SELECT", "WITH", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "VALUES", "TABLE", "PRAGMA"]);

/**
 * Reject statements that are not plainly reads. This is NOT the security boundary: the engine-level
 * read-only mode is. It exists so that tricks such as `COMMIT; INSERT ...` or `SET transaction_read_only = 0`
 * cannot undo that mode, and to give a clear message early.
 */
export function assertReadOnlyStatement(engine: Engine, sql: string): void {
  const kw = leadingKeyword(sql);
  if (!READ_KEYWORDS.has(kw)) {
    throw new DbError("READ_ONLY", `Statement type ${kw || "(unknown)"} is not allowed on a read-only connection.`, HINTS.READ_ONLY);
  }
  if (engine === "mysql" && /\binto\s+(outfile|dumpfile)\b/i.test(sql)) {
    throw new DbError("READ_ONLY", "SELECT ... INTO OUTFILE/DUMPFILE writes files and is not allowed on a read-only connection.", HINTS.READ_ONLY);
  }
  if (engine === "sqlite" && kw === "PRAGMA" && /=/.test(sql)) {
    throw new DbError("READ_ONLY", "PRAGMA assignments are not allowed on a read-only connection.", HINTS.READ_ONLY);
  }
}
