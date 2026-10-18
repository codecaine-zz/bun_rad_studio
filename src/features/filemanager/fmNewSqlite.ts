/**
 * New SQLite database: an empty but valid database file (SQLite's own header, 4 KiB), made next to the other files so it can be
 * opened in SQLite Studio, added as a connection or filled with a sample dataset. Never replaces an existing file.
 */
import { Database } from "bun:sqlite";
import { promises as fsp } from "fs";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext } from "./fmCore";
import { dbState, guarded } from "./fmDbState";
import { FmError, cleanName, uniqueName, validateName } from "./fmPaths";

const DEFAULT_NAME = "New database.sqlite";

export type SqliteStarterTemplate = "empty" | "starter" | "kv" | "notes";

export interface MakeSqliteOptions {
  template?: unknown;
  saveProfile?: unknown;
  connectionName?: unknown;
}

function applyTemplate(db: Database, template: SqliteStarterTemplate): void {
  if (template === "starter") {
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_items_user_id ON items(user_id);
      INSERT INTO users (name, email, role) VALUES
        ('Ada Lovelace', 'ada@example.com', 'admin'),
        ('Grace Hopper', 'grace@example.com', 'member');
      INSERT INTO items (user_id, title, status) VALUES
        (1, 'Design database schema', 'done'),
        (2, 'Write first SQL query', 'open');
    `);
  } else if (template === "kv") {
    db.exec(`
      CREATE TABLE kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO kv_store (key, value) VALUES
        ('app.name', 'My Application'),
        ('app.version', '1.0.0');
    `);
  } else if (template === "notes") {
    db.exec(`
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO notes (title, body, tags) VALUES
        ('Welcome', 'Your new SQLite notes database is ready.', 'getting-started');
    `);
  }
}

export async function makeSqliteFile(
  ctx: FmContext,
  parentInput: unknown,
  nameInput?: unknown,
  options?: MakeSqliteOptions,
): Promise<{ path: string; name: string; profile?: any }> {
  const parent = absolutePath(ctx, parentInput);
  await assertFolder(parent, "The folder you are in");
  assertCreatable(ctx, parent);
  const taken = new Set(await fsp.readdir(parent));
  let name = DEFAULT_NAME;
  if (nameInput !== undefined && nameInput !== "") {
    const reason = validateName(nameInput, ctx.platform);
    if (reason) throw new FmError("BAD_NAME", reason);
    name = cleanName(nameInput);
    if (!/\.[A-Za-z0-9]+$/.test(name)) name += ".sqlite";
  } else name = uniqueName(DEFAULT_NAME, (n) => taken.has(n));
  const path = pathApi(ctx).join(parent, name);
  const rawTemplate = typeof options?.template === "string" ? options.template : "empty";
  const template: SqliteStarterTemplate =
    rawTemplate === "starter" || rawTemplate === "kv" || rawTemplate === "notes" ? rawTemplate : "empty";
  try {
    // "wx" fails if the name is taken, so nothing is ever overwritten
    await fsp.writeFile(path, "", { flag: "wx" });
  } catch (err: any) {
    if (err?.code === "EEXIST") throw new FmError("EXISTS", `"${name}" already exists here. Choose a different name.`);
    throw err;
  }
  try {
    const db = new Database(path);
    try {
      applyTemplate(db, template);
      db.exec("VACUUM"); // writes the header page, so the file is a real database from the start
    } finally {
      db.close();
    }
  } catch (err) {
    await fsp.rm(path, { force: true });
    throw new FmError("CREATE_FAILED", "The database file couldn't be made.");
  }
  if (options?.saveProfile === true) {
    const st = dbState(ctx);
    const connName =
      typeof options.connectionName === "string" && options.connectionName.trim()
        ? options.connectionName.trim().slice(0, 80)
        : name.replace(/\.(sqlite|sqlite3|db|db3|s3db)$/i, "") || name;
    const profile = await guarded(() =>
      st.store.save({ engine: "sqlite", name: connName, path, sqliteMode: "readwrite" }, undefined, undefined),
    );
    st.store.setMeta(profile.id, { source: "manual", savedAt: new Date().toISOString() });
    return { path, name, profile };
  }
  return { path, name };
}
