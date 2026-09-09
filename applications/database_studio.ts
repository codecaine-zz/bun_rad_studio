/**
 * Database Studio Pro -- Embedded Database Explorer & Query IDE
 * High-performance embedded SQLite workbench powered by native bun:sqlite.
 */
import { createDatabaseStudio, createSqliteStudio } from "./sqlite_studio";

export { createDatabaseStudio, createSqliteStudio };

if (import.meta.main) {
  const win = createDatabaseStudio();
  console.log("⚡ Launching Database Studio Pro...");
  win.run();
}
