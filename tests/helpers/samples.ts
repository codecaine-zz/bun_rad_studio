import { Database } from "bun:sqlite";
import { seedDataset, type SeedProgress } from "../../src/db/samples/runner";
import { renderDrop } from "../../src/db/samples/render";
import type { DatasetDef, Scale } from "../../src/db/samples/model";

/** Seeds a dataset into a fresh in-memory SQLite database with foreign keys enforced. */
export async function seedSqlite(ds: DatasetDef, scale: Scale, seed?: number, progress?: SeedProgress[]): Promise<{ db: Database; ms: number; rows: number }> {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  const t0 = performance.now();
  const sum = await seedDataset(ds, "sqlite", async (sql) => { db.run(sql); }, { scale, seed, onProgress: progress ? (p) => progress.push(p) : undefined });
  return { db, ms: performance.now() - t0, rows: sum.rows };
}

export function dropStatements(ds: DatasetDef): string[] {
  return renderDrop("sqlite", ds);
}

export function scalar(db: Database, sql: string): any {
  const row = db.query(sql).get() as Record<string, any> | null;
  return row ? Object.values(row)[0] : undefined;
}
