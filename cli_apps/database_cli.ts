#!/usr/bin/env bun
/**
 * Database Studio CLI -- High-Performance SQLite Workbench
 * Powered by native bun:sqlite with zero external dependencies
 */
import { SimpleCLI } from '../src/index.ts';
import { Database } from 'bun:sqlite';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = SimpleCLI.newApp('database-cli', '1.0.0')
  .setDescription('Native SQLite Database Explorer, Query Runner & Exporter');

app.addFlagString('db', 'd', ':memory:', 'SQLite database file path (:memory: or path to .db/.sqlite)');
app.addFlagString('query', 'q', 'SELECT * FROM users LIMIT 10;', 'SQL query to execute');
app.addFlagBool('explain', 'e', false, 'Run EXPLAIN QUERY PLAN on the query');
app.addFlagBool('schema', 's', false, 'Print complete DDL schema of all tables and indexes');
app.addFlagBool('seed', 'S', false, 'Seed synthetic test tables (users, transactions) before querying');
app.addFlagString('export', 'x', '', 'Export format (csv, json, sql)');
app.addFlagString('out', 'o', '', 'Output file path for exported results');

if (!app.parseCli()) process.exit(0);

const dbPath = app.getFlagString('db');
const isMemory = dbPath === ':memory:';
const targetPath = isMemory ? ':memory:' : resolve(process.cwd(), dbPath);

app.banner('Database Studio CLI', 'v1.0.0 - Native SQLite Engine (bun:sqlite)');

try {
  const db = new Database(targetPath);
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  if (isMemory || app.getFlagBool('seed')) {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT DEFAULT 'developer',
        status TEXT DEFAULT 'ACTIVE',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        status TEXT DEFAULT 'COMPLETED',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const count = (db.query('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
    if (count === 0) {
      const stmt = db.prepare('INSERT INTO users (name, email, role, status) VALUES (?, ?, ?, ?)');
      const roles = ['admin', 'engineer', 'lead', 'designer', 'analyst'];
      for (let i = 1; i <= 20; i++) {
        stmt.run(`Developer ${i}`, `dev${i}@company.internal`, roles[i % roles.length] ?? 'developer', i % 7 === 0 ? 'SUSPENDED' : 'ACTIVE');
      }
      const tStmt = db.prepare('INSERT INTO transactions (user_id, amount, category) VALUES (?, ?, ?)');
      for (let i = 1; i <= 30; i++) {
        tStmt.run((i % 20) + 1, Math.round((Math.random() * 500 + 10) * 100) / 100, 'Cloud Infrastructure');
      }
      app.info(`Seeded database with sample users and transactions.`);
    }
  }

  if (app.getFlagBool('schema')) {
    app.info(`Database DDL Schema (${targetPath}):`);
    const tables = db.query("SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name;").all() as any[];
    for (const t of tables) {
      console.log(`\x1b[36m-- [${t.type.toUpperCase()}] ${t.name}\x1b[0m\n${t.sql};\n`);
    }
    process.exit(0);
  }

  const query = app.getFlagString('query');
  if (app.getFlagBool('explain')) {
    app.info(`Execution Plan for: ${query}`);
    const plan = db.query(`EXPLAIN QUERY PLAN ${query}`).all() as any[];
    app.table(
      ['ID', 'Parent', 'NotUsed', 'Detail'],
      plan.map(p => [String(p.id ?? ''), String(p.parent ?? ''), String(p.notused ?? ''), String(p.detail ?? '')])
    );
    process.exit(0);
  }

  const startTime = performance.now();
  const rows = db.query(query).all() as Record<string, any>[];
  const elapsed = (performance.now() - startTime).toFixed(3);

  app.success(`Executed in ${elapsed}ms | Returned ${rows.length} rows`);

  if (rows.length > 0) {
    const headers = Object.keys(rows[0] ?? {});
    const tableData = rows.slice(0, 50).map(r => headers.map(h => String(r[h] ?? 'NULL')));
    app.table(headers, tableData);
    if (rows.length > 50) {
      app.info(`... and ${rows.length - 50} more rows (display truncated)`);
    }

    const exportFmt = app.getFlagString('export').toLowerCase();
    const outFile = app.getFlagString('out');
    if (exportFmt) {
      let exportData = '';
      if (exportFmt === 'json') {
        exportData = JSON.stringify(rows, null, 2);
      } else if (exportFmt === 'csv') {
        exportData = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      } else if (exportFmt === 'sql') {
        const tbl = 'exported_records';
        exportData = rows.map(r => {
          const vals = headers.map(h => {
            const v = r[h];
            return typeof v === 'number' ? v : `'${String(v ?? '').replace(/'/g, "''")}'`;
          });
          return `INSERT INTO ${tbl} (${headers.join(', ')}) VALUES (${vals.join(', ')});`;
        }).join('\n');
      }

      if (outFile) {
        writeFileSync(resolve(process.cwd(), outFile), exportData, 'utf8');
        app.success(`Exported ${exportFmt.toUpperCase()} to ${outFile}`);
      } else {
        console.log('\n--- Export Output ---');
        console.log(exportData.slice(0, 1000) + (exportData.length > 1000 ? '\n... [truncated]' : ''));
      }
    }
  } else {
    app.info('Query returned 0 rows or executed non-returning statement.');
  }

  db.close();
} catch (err: any) {
  app.error(`Database error: ${err.message}`);
  process.exit(1);
}
