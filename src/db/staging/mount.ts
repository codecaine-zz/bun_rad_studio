/** One-line mounting of the staging import into each studio server (see applications/*_studio_server.ts). */
import { createStagingHandler, type StagingHandler } from "./routes";
import { serverProvider, sqliteProvider, type ServerLike, type SqliteLike } from "./providers";

/** Creates a staging import HTTP handler bound to a SQLite studio database manager. */
export function sqliteStaging(manager: SqliteLike): StagingHandler {
  return createStagingHandler({ engine: "sqlite", getDb: sqliteProvider(() => manager) });
}

/** Creates a staging import HTTP handler bound to a MySQL studio database manager. */
export function mysqlStaging(manager: { dbConfig: ServerLike }): StagingHandler {
  return createStagingHandler({ engine: "mysql", getDb: serverProvider("mysql", () => manager.dbConfig) });
}

/** Creates a staging import HTTP handler bound to a PostgreSQL studio database manager and active schema. */
export function postgresStaging(manager: { dbConfig: ServerLike; activeSchema: string }): StagingHandler {
  return createStagingHandler({ engine: "postgres", getDb: serverProvider("postgres", () => ({ ...manager.dbConfig, schema: manager.activeSchema || manager.dbConfig.schema })) });
}
