#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { SimpleCLI } from "../src/index.ts";

const app = SimpleCLI.newApp("sqlite-cli", "1.0.0").setDescription(
  "SQLite Database Explorer & Table Formatter",
);

app.addFlagString("db", "d", "app.db", "SQLite database file path");
app.addFlagString("query", "q", "", "SQL query to execute");
app.addFlagBool("tables", "t", false, "List all tables in the database");
app.addFlagBool(
  "schema",
  "s",
  false,
  "Show CREATE statements for database objects",
);
app.addFlagBool("json", "j", false, "Output query rows as JSON");

if (!app.parseCli()) process.exit(0);

const dbPath = app.getFlagString("db");
const query = app.getFlagString("query");
const listTables = app.getFlagBool("tables");
const showSchema = app.getFlagBool("schema");
const asJson = app.getFlagBool("json");

if (
  query ||
  listTables ||
  showSchema ||
  dbPath === ":memory:" ||
  existsSync(dbPath)
) {
  const targetDb =
    dbPath === ":memory:" || existsSync(dbPath) ? dbPath : ":memory:";
  const db = new Database(targetDb);
  try {
    let effectiveQuery = query;
    if (!effectiveQuery) {
      if (showSchema) {
        effectiveQuery =
          "SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name;";
      } else {
        effectiveQuery =
          "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name;";
      }
    }
    const rows = db.query(effectiveQuery).all() as Array<
      Record<string, unknown>
    >;
    if (asJson) {
      console.log(JSON.stringify(rows, null, 2));
      process.exit(0);
    }
    app.banner("SQLite Database Studio", "v1.0.0 - Database Explorer");
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    db.close();
  }
} else {
  app.banner("SQLite Database Studio", "v1.0.0 - Database Explorer");
  app.table(
    ["Table Name", "Row Count", "Columns", "Storage Size"],
    [
      ["users", "1,420", "id, email, role, created_at", "64 KB"],
      ["sessions", "850", "id, user_id, token, expires_at", "48 KB"],
      ["audit_logs", "12,940", "id, action, timestamp, ip", "512 KB"],
    ],
  );
}
