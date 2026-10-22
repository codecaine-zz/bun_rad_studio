/**
 * Test rigs for the staging import: one realistic schema per engine (SQLite always; MySQL and PostgreSQL when
 * TEST_MYSQL_URL / TEST_PG_URL point at a throwaway server, see docs/testing/database-tests.md).
 */
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createAdapter, type DbAdapter } from "../../src/db";
import { AdapterStageDb, SqliteStageDb, type StageDb } from "../../src/db/staging/db";
import { provisionTestDb, type TestDb } from "./testdb";
import { rmDir } from "./rm";

export interface Rig {
  name: "sqlite" | "mysql" | "postgres";
  db: StageDb;
  /** Runs SQL directly (outside the staging code) to look at or change the data. */
  sql(text: string, params?: unknown[]): Promise<Record<string, any>[]>;
  dir: string;
  /** SQLite: the database file. Servers: the connection settings of the throwaway database. */
  path?: string;
  config?: TestDb["config"];
  write(name: string, content: string | Uint8Array): string;
  close(): Promise<void>;
}

const SCHEMAS: Record<Rig["name"], string[]> = {
  sqlite: [
    `CREATE TABLE customers (id INTEGER PRIMARY KEY, name VARCHAR(50) NOT NULL, email VARCHAR(100) UNIQUE, age INTEGER CHECK (age >= 0 AND age < 150), balance DECIMAL(10,2), joined DATE, active BOOLEAN, created TIMESTAMP, tier TEXT CHECK (tier IN ('free','pro','team')))`,
    `CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL REFERENCES customers(id), total DECIMAL(10,2) NOT NULL, note TEXT)`,
    `CREATE TABLE logs (msg TEXT, at TEXT)`,
  ],
  mysql: [
    `CREATE TABLE customers (id INT PRIMARY KEY, name VARCHAR(50) NOT NULL, email VARCHAR(100) UNIQUE, age INT, balance DECIMAL(10,2), joined DATE, active TINYINT(1), created DATETIME, tier ENUM('free','pro','team'), CONSTRAINT age_ok CHECK (age >= 0 AND age < 150))`,
    `CREATE TABLE orders (id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, total DECIMAL(10,2) NOT NULL, note TEXT, CONSTRAINT fk_cust FOREIGN KEY (customer_id) REFERENCES customers(id))`,
    `CREATE TABLE logs (msg TEXT, at VARCHAR(40))`,
  ],
  postgres: [
    `CREATE TYPE tier_t AS ENUM ('free','pro','team')`,
    `CREATE TABLE customers (id INTEGER PRIMARY KEY, name VARCHAR(50) NOT NULL, email VARCHAR(100) UNIQUE, age INTEGER CHECK (age >= 0 AND age < 150), balance NUMERIC(10,2), joined DATE, active BOOLEAN, created TIMESTAMP, tier tier_t)`,
    `CREATE TABLE orders (id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), total NUMERIC(10,2) NOT NULL, note TEXT)`,
    `CREATE TABLE logs (msg TEXT, at TEXT)`,
  ],
};

export async function makeRig(name: Rig["name"]): Promise<Rig | null> {
  const dir = mkdtempSync(join(tmpdir(), "staging-test-"));
  const write = (file: string, content: string | Uint8Array) => {
    const p = join(dir, file);
    writeFileSync(p, content);
    return p;
  };
  if (name === "sqlite") {
    const path = join(dir, "t.db");
    const d = new Database(path);
    d.run("PRAGMA journal_mode = WAL");
    for (const s of SCHEMAS.sqlite) d.run(s);
    d.close();
    const db = new SqliteStageDb({ path });
    return {
      name,
      db,
      dir,
      path,
      write,
      async sql(text, params = []) {
        const c = new Database(path);
        try {
          const st = c.query(text);
          return st.columnNames.length ? (st.all(...(params as any[])) as any[]) : (st.run(...(params as any[])), []);
        } finally {
          c.close();
        }
      },
      async close() {
        rmDir(dir);
      },
    };
  }
  const t: TestDb | null = await provisionTestDb(name);
  if (!t) {
    rmDir(dir);
    return null;
  }
  const adapter: DbAdapter = createAdapter({ engine: name, ...t.config, ...(name === "mysql" ? { allowPublicKeyRetrieval: true } : { schema: "public" }), maxConnections: 4 });
  await adapter.connect();
  for (const s of SCHEMAS[name]) await adapter.query(s);
  return {
    name,
    db: new AdapterStageDb(adapter, t.name),
    dir,
    config: t.config,
    write,
    async sql(text, params = []) {
      return (await adapter.query(text, params as never[])).rows as any[];
    },
    async close() {
      await adapter.close();
      await t.drop();
      rmDir(dir);
    },
  };
}

export const RIGS: Rig["name"][] = ["sqlite", "mysql", "postgres"];
