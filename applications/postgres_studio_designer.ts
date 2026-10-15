import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * ⚡ Bun RAD Studio - Postgres Studio Pro Visual Query Designer & QBE Engine
 * Loads client-side Visual Query Designer engine for PostgreSQL.
 */
export const POSTGRES_DESIGNER_SCRIPT = readFileSync(
  resolve(import.meta.dir, "postgres_designer.js"),
  "utf8"
);
