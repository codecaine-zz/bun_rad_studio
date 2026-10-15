/** One-line wiring of the sample API into each studio server (kept out of the studio files to keep their diffs small). */
import { homedir } from "node:os";
import { join } from "node:path";
import { createSampleApi, type SampleApi } from "./routes";
import { mysqlSampleHost, postgresSampleHost, sqliteSampleHost } from "./hosts";

export function defaultSampleDir(): string {
  return process.env.BUNRAD_SAMPLE_DIR?.trim() || join(homedir(), "bun_rad_samples");
}

export function sqliteSampleApi(manager: any, sampleDir: () => string = defaultSampleDir): SampleApi {
  return createSampleApi(sqliteSampleHost({
    getDb: () => manager.db,
    getActivePath: () => manager.activePath,
    connect: (path) => manager.connect(path),
    sampleDir,
  }));
}

export function mysqlSampleApi(manager: any): SampleApi {
  return createSampleApi(mysqlSampleHost({
    getSql: () => manager.sql_conn,
    currentDatabase: () => manager.dbConfig?.database ?? "",
    connect: (db) => manager.connect(db),
  }));
}

export function postgresSampleApi(manager: any): SampleApi {
  return createSampleApi(postgresSampleHost({
    getSql: () => manager.sql_conn,
    currentDatabase: () => manager.dbConfig?.database ?? "",
    currentSchema: () => manager.activeSchema ?? "public",
    connect: (db, schema) => manager.connect(db, schema),
  }));
}
