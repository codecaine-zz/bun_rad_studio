/** One-line wiring of the sample API into each studio server (kept out of the studio files to keep their diffs small). */
import { homedir } from "node:os";
import { join } from "node:path";
import { createSampleApi, type SampleApi } from "./routes";
import { mysqlSampleHost, postgresSampleHost, sqliteSampleHost } from "./hosts";

/** Returns the default filesystem directory where generated SQLite sample database files are stored. */
export function defaultSampleDir(): string {
  return process.env.BUNRAD_SAMPLE_DIR?.trim() || join(homedir(), "bun_rad_samples");
}

/** Creates a `SampleApi` wired to a SQLite studio database manager. */
export function sqliteSampleApi(manager: any, sampleDir: () => string = defaultSampleDir): SampleApi {
  return createSampleApi(sqliteSampleHost({
    getDb: () => manager.db,
    getActivePath: () => manager.activePath,
    connect: (path) => manager.connect(path),
    sampleDir,
  }));
}

/** Creates a `SampleApi` wired to a MySQL studio database manager. */
export function mysqlSampleApi(manager: any): SampleApi {
  return createSampleApi(mysqlSampleHost({
    getSql: () => manager.sql_conn,
    currentDatabase: () => manager.dbConfig?.database ?? "",
    connect: (db) => manager.connect(db),
  }));
}

/** Creates a `SampleApi` wired to a PostgreSQL studio database manager. */
export function postgresSampleApi(manager: any): SampleApi {
  return createSampleApi(postgresSampleHost({
    getSql: () => manager.sql_conn,
    currentDatabase: () => manager.dbConfig?.database ?? "",
    currentSchema: () => manager.activeSchema ?? "public",
    connect: (db, schema) => manager.connect(db, schema),
  }));
}
