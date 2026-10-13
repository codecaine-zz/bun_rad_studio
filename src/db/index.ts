import type { ConnectionConfig, DbAdapter } from "./types";
import { SqliteAdapter } from "./adapters/sqlite";
import { MysqlAdapter } from "./adapters/mysql";
import { PostgresAdapter } from "./adapters/postgres";

export * from "./types";
export { DbError, normalizeError, assertReadOnlyStatement, redact } from "./errors";
export { quoteIdent, quoteRef } from "./quote";
export { splitStatements, statementAt, leadingKeyword } from "./splitter";
export { toWire, decodeParam, decodeParams, csvCell } from "./wire";
export { SqliteAdapter, MysqlAdapter, PostgresAdapter };

export function createAdapter(config: ConnectionConfig): DbAdapter {
  switch (config.engine) {
    case "sqlite":
      return new SqliteAdapter(config);
    case "mysql":
      return new MysqlAdapter(config);
    case "postgres":
      return new PostgresAdapter(config);
    default:
      throw new Error(`Unsupported engine: ${String((config as { engine?: unknown }).engine)}`);
  }
}
