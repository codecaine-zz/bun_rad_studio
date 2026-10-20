#!/usr/bin/env bun
/**
 * Complete Databases & Cross-Engine Cloning Masterclass in the Codecaine File Manager:
 * Discover SQLite files, auto-detect .env connections, connect SQLite, MySQL, PostgreSQL and Redis,
 * create synthetic sample databases, clone databases, tables, views, foreign keys and Redis key groups
 * seamlessly across all four engines, and work inside the embedded database studios.
 *
 *   bun scripts/tutorial_databases_masterclass.ts list                  list chapters and steps
 *   bun scripts/tutorial_databases_masterclass.ts audio [--shard i/n]   synthesize narration with Google Gemini TTS
 *   bun scripts/tutorial_databases_masterclass.ts record [ids,...]      record live chapters against throwaway servers
 *   bun scripts/tutorial_databases_masterclass.ts build                 assemble youtube_production/databases_masterclass_tutorial.mp4
 *   bun scripts/tutorial_databases_masterclass.ts all                   audio, record, build
 *
 * Uses Google Gemini TTS (gemini-2.5-flash-preview-tts, voice Kore) via GEMINI_API_KEY / GOOGLE_API_KEY from .env
 * (without ever logging or exposing the key). Starts isolated throwaway instances of MySQL (port 3399),
 * PostgreSQL (port 5499), and Redis (port 6399) plus a seeded SQLite storefront database under
 * youtube_production/databases_masterclass_tutorial/_work, with the in-memory keychain preload.
 */
import "./lib/tts_edge_default";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const WORK = join(ROOT, "youtube_production", "databases_masterclass_tutorial", "_work");
const HOME = join(WORK, "home");
const DATA = join(WORK, "data");
const GRAVE = join(WORK, "grave");
const LAUNCH = join(HOME, "Projects", "commerce-hub");
const CHROME_DIR = join(WORK, "chrome");

mkdirSync(join(WORK, "hosthome"), { recursive: true });
process.env.HOME = join(WORK, "hosthome");

import { Cdp, sleep } from "./lib/cdp_recorder";
import { GEMINI_KEY, GEMINI_VOICE, EDGE_VOICE, fmtTime } from "./lib/video_pipeline";
import { runTutorial, type Do, type Suite } from "./lib/step_video";
import type { Chapter, World } from "./lib/fm_tutorial_types";

const MYSQL_PORT = 3399;
const PG_PORT = 5499;
const REDIS_PORT = 6399;
const FM_PORT = 51695;
const CDP_PORT = 9395;
const VIEW_H = 972;

const MYSQL_DATA = join(WORK, "mysql_data");
const PG_DATA = join(WORK, "pg_data");
const REDIS_DATA = join(WORK, "redis_data");

const MYSQL_BIN = "/opt/homebrew/bin";
const PG_BIN = "/opt/homebrew/opt/postgresql@18/bin";
const REDIS_BIN = "/opt/homebrew/bin";

export const STUDIO = "iframe ||| iframe ||| ";

let mysqldProc: ReturnType<typeof Bun.spawn> | null = null;
let pgProc: ReturnType<typeof Bun.spawn> | null = null;
let redisProc: ReturnType<typeof Bun.spawn> | null = null;
let fmProc: ReturnType<typeof Bun.spawn> | null = null;
let cdp: Cdp;

/* -------------------------------------------------------------------------- Throwaway Servers */

function mysqlRun(sql: string, db = ""): string {
  const r = Bun.spawnSync(
    [`${MYSQL_BIN}/mysql`, "-h127.0.0.1", `-P${MYSQL_PORT}`, "-uroot", "--batch", ...(db ? [db] : []), "-e", sql],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (r.exitCode !== 0) throw new Error(`mysql: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

const mysqlUp = () => {
  try {
    mysqlRun("SELECT 1");
    return true;
  } catch {
    return false;
  }
};

async function startMysql() {
  if (mysqlUp() && existsSync(MYSQL_DATA)) return;
  if (mysqlUp() && !existsSync(MYSQL_DATA)) {
    try {
      Bun.spawnSync([`${MYSQL_BIN}/mysqladmin`, "-h127.0.0.1", `-P${MYSQL_PORT}`, "-uroot", "shutdown"]);
    } catch {}
    for (let i = 0; i < 20 && mysqlUp(); i++) await sleep(250);
  }
  if (!existsSync(MYSQL_DATA)) {
    mkdirSync(WORK, { recursive: true });
    const prefix = Bun.spawnSync(["brew", "--prefix", "mysql"]).stdout.toString().trim();
    const r = Bun.spawnSync([`${MYSQL_BIN}/mysqld`, "--initialize-insecure", `--datadir=${MYSQL_DATA}`, `--basedir=${prefix}`], {
      stdout: "ignore",
      stderr: "pipe",
    });
    if (r.exitCode !== 0) throw new Error(`mysqld --initialize-insecure failed: ${r.stderr.toString().slice(-400)}`);
  }
  mysqldProc = Bun.spawn(
    [
      `${MYSQL_BIN}/mysqld`,
      `--datadir=${MYSQL_DATA}`,
      `--port=${MYSQL_PORT}`,
      `--socket=${WORK}/mysql.sock`,
      "--mysqlx=OFF",
      "--bind-address=127.0.0.1",
      `--pid-file=${WORK}/mysqld.pid`,
      `--log-error=${WORK}/mysqld.err`,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  for (let i = 0; i < 120 && !mysqlUp(); i++) await sleep(500);
  if (!mysqlUp()) throw new Error("Throwaway MySQL server did not start on port " + MYSQL_PORT);
}

async function stopMysql() {
  if (!mysqldProc) return;
  try {
    Bun.spawnSync([`${MYSQL_BIN}/mysqladmin`, "-h127.0.0.1", `-P${MYSQL_PORT}`, "-uroot", "shutdown"]);
  } catch {}
  await Promise.race([mysqldProc.exited, sleep(10000)]);
  try {
    mysqldProc.kill();
  } catch {}
  mysqldProc = null;
}

function pgRun(sql: string, db = "postgres"): string {
  const r = Bun.spawnSync([`${PG_BIN}/psql`, "-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres", "-d", db, "-tAc", sql], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`psql: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

const pgUp = () => {
  const r = Bun.spawnSync([`${PG_BIN}/pg_isready`, "-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return r.exitCode === 0;
};

async function startPostgres() {
  if (pgUp()) return;
  if (!existsSync(PG_DATA)) {
    mkdirSync(WORK, { recursive: true });
    const r = Bun.spawnSync([`${PG_BIN}/initdb`, "-D", PG_DATA, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"], {
      stdout: "ignore",
      stderr: "pipe",
    });
    if (r.exitCode !== 0) throw new Error(`initdb failed: ${r.stderr.toString().slice(-400)}`);
  }
  pgProc = Bun.spawn([`${PG_BIN}/postgres`, "-D", PG_DATA, "-p", String(PG_PORT), "-h", "127.0.0.1", "-k", WORK], {
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let i = 0; i < 80 && !pgUp(); i++) await sleep(300);
  if (!pgUp()) throw new Error("Throwaway PostgreSQL server did not start on port " + PG_PORT);
}

async function stopPostgres() {
  if (!pgProc) return;
  try {
    Bun.spawnSync([`${PG_BIN}/pg_ctl`, "-D", PG_DATA, "stop", "-m", "fast"], { stdout: "ignore", stderr: "ignore" });
  } catch {}
  await Promise.race([pgProc.exited, sleep(8000)]);
  try {
    pgProc.kill();
  } catch {}
  pgProc = null;
}

function redisRun(args: string[]): string {
  const r = Bun.spawnSync([`${REDIS_BIN}/redis-cli`, "-h", "127.0.0.1", "-p", String(REDIS_PORT), ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0) throw new Error(`redis-cli: ${r.stderr.toString().trim()}`);
  return r.stdout.toString().trim();
}

const redisUp = () => {
  try {
    return redisRun(["PING"]) === "PONG";
  } catch {
    return false;
  }
};

async function startRedis() {
  if (redisUp()) return;
  mkdirSync(REDIS_DATA, { recursive: true });
  redisProc = Bun.spawn(
    [
      `${REDIS_BIN}/redis-server`,
      "--bind",
      "127.0.0.1",
      "--port",
      String(REDIS_PORT),
      "--dir",
      REDIS_DATA,
      "--save",
      "",
      "--appendonly",
      "no",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  for (let i = 0; i < 60 && !redisUp(); i++) await sleep(250);
  if (!redisUp()) throw new Error("Throwaway Redis server did not start on port " + REDIS_PORT);
}

async function stopRedis() {
  if (!redisProc) return;
  try {
    redisRun(["SHUTDOWN", "NOSAVE"]);
  } catch {}
  await Promise.race([redisProc.exited, sleep(5000)]);
  try {
    redisProc.kill();
  } catch {}
  redisProc = null;
}

/* -------------------------------------------------------------------------- Seeding World & Databases */

function seedSqliteShop(sqlitePath: string) {
  rmSync(sqlitePath, { force: true });
  mkdirSync(join(sqlitePath, ".."), { recursive: true });
  const db = new Database(sqlitePath, { create: true });
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;

    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL,
      tier VARCHAR(32) NOT NULL DEFAULT 'standard',
      points INTEGER NOT NULL DEFAULT 150,
      active BOOLEAN NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT '2026-01-15 09:30:00'
    );
    CREATE UNIQUE INDEX idx_customers_email ON customers(email);

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku VARCHAR(40) NOT NULL,
      title VARCHAR(140) NOT NULL,
      category VARCHAR(60) NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      in_stock INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX idx_products_sku ON products(sku);

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      status VARCHAR(32) NOT NULL DEFAULT 'paid',
      total_amount NUMERIC(10,2) NOT NULL,
      total_cents INTEGER NOT NULL DEFAULT 50000,
      ordered_on DATE NOT NULL
    );
    CREATE INDEX idx_orders_customer ON orders(customer_id);

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price NUMERIC(10,2) NOT NULL
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action VARCHAR(80) NOT NULL,
      details VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT '2026-02-22 12:00:00'
    );

    CREATE VIEW customer_order_summary AS
      SELECT c.id AS customer_id, c.name, c.tier, COUNT(o.id) AS order_count, COALESCE(SUM(o.total_amount), 0) AS lifetime_spend
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id, c.name, c.tier;

    INSERT INTO customers (name, email, tier, points, active, created_at) VALUES
      ('Ada Lovelace', 'ada@analytical.org', 'enterprise', 420, 1, '2026-01-10 10:00:00'),
      ('Grace Hopper', 'grace@compiler.dev', 'enterprise', 380, 1, '2026-01-12 14:15:00'),
      ('Alan Turing', 'alan@enigma.uk', 'pro', 240, 1, '2026-01-18 09:45:00'),
      ('Margaret Hamilton', 'margaret@apollo.nasa', 'enterprise', 510, 1, '2026-02-01 11:20:00'),
      ('Katherine Johnson', 'katherine@orbital.nasa', 'pro', 290, 1, '2026-02-05 16:30:00'),
      ('Donald Knuth', 'tex@artofprog.edu', 'standard', 95, 1, '2026-02-11 08:10:00');

    INSERT INTO products (sku, title, category, price, in_stock) VALUES
      ('HW-101', 'Mechanical Studio Keyboard', 'Hardware', 189.00, 42),
      ('HW-204', '4K Reference Monitor 27"', 'Displays', 649.00, 18),
      ('SW-301', 'Bun RAD Pro License', 'Software', 99.00, 500),
      ('AC-402', 'Thunderbolt 5 Dock', 'Accessories', 279.00, 31),
      ('AC-509', 'Studio Condenser Mic', 'Audio', 219.00, 25);

    INSERT INTO orders (customer_id, status, total_amount, total_cents, ordered_on) VALUES
      (1, 'shipped', 838.00, 83800, '2026-02-15'),
      (2, 'paid', 378.00, 37800, '2026-02-16'),
      (3, 'shipped', 649.00, 64900, '2026-02-18'),
      (4, 'paid', 498.00, 49800, '2026-02-20'),
      (1, 'paid', 219.00, 21900, '2026-02-22');

    INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
      (1, 1, 1, 189.00),
      (1, 2, 1, 649.00),
      (2, 3, 1, 99.00),
      (2, 4, 1, 279.00),
      (3, 2, 1, 649.00),
      (4, 4, 1, 279.00),
      (4, 5, 1, 219.00),
      (5, 5, 1, 219.00);

    INSERT INTO audit_logs (action, details) VALUES
      ('SEED', 'Initial storefront schema seeded');
  `);
  db.close();
}

function resetNetworkDatabases() {
  mysqlRun("DROP DATABASE IF EXISTS shop_mysql; CREATE DATABASE shop_mysql CHARACTER SET utf8mb4;");
  try {
    pgRun("DROP DATABASE IF EXISTS shop_pg WITH (FORCE);");
  } catch {
    pgRun("DROP DATABASE IF EXISTS shop_pg;");
  }
  pgRun("CREATE DATABASE shop_pg;");
  redisRun(["FLUSHALL"]);
}

function putFile(rel: string, body: string) {
  const p = join(HOME, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
}

function seedWorld(): World {
  rmSync(HOME, { recursive: true, force: true });
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(GRAVE, { recursive: true });
  mkdirSync(LAUNCH, { recursive: true });

  const shopSqlite = join(LAUNCH, "shop.sqlite");
  seedSqliteShop(shopSqlite);
  resetNetworkDatabases();

  putFile(
    "Projects/commerce-hub/README.md",
    "# Commerce Hub\n\nMulti-engine database workspace: SQLite, MySQL, PostgreSQL, and Redis.\n",
  );
  putFile(
    "Projects/commerce-hub/new_customers.csv",
    "name,email,tier,points,active,created_at\nBarbara Liskov,barbara@clutypes.edu,enterprise,450,1,2026-03-01 10:00:00\nKen Thompson,ken@unixbell.org,pro,310,1,2026-03-02 12:30:00\n",
  );
  putFile(
    "Projects/commerce-hub/.env",
    [
      `SQLITE_PATH=${shopSqlite}`,
      `MSQL_HOST=127.0.0.1`,
      `MSQL_PORT=${MYSQL_PORT}`,
      `MSQL_USER=root`,
      `MSQL_PASSWORD=`,
      `MSQL_NAME=shop_mysql`,
      `PG_HOST=127.0.0.1`,
      `PG_PORT=${PG_PORT}`,
      `PG_USER=postgres`,
      `PG_DATABASE=shop_pg`,
      `REDIS_URL=redis://127.0.0.1:${REDIS_PORT}/0`,
      "",
    ].join("\n"),
  );

  return { home: HOME, data: DATA, big: "", put: putFile };
}

function stopFm() {
  try {
    fmProc?.kill(9);
  } catch {}
  fmProc = null;
}

async function startFm(startPath = LAUNCH) {
  stopFm();
  await sleep(500);
  fmProc = Bun.spawn(
    [
      process.execPath,
      "--preload",
      join(ROOT, "scripts/lib/mysql_tutorial_nokeychain.ts"),
      join(ROOT, "applications/file_manager_studio.ts"),
      "--server",
      "--port",
      String(FM_PORT),
      "--home",
      HOME,
      "--data-dir",
      DATA,
      "--path",
      startPath,
    ],
    { cwd: LAUNCH, stdout: "ignore", stderr: "ignore", env: { PATH: process.env.PATH ?? "", HOME, GRAVEYARD: GRAVE } },
  );
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) break;
    } catch {}
    await sleep(250);
  }
}

async function openDatabasesTabQuiet(c: Cdp) {
  await c.eval(`document.querySelector('#tool-power')?.click()`);
  await sleep(450);
  await c.eval(`document.querySelector('#power-tab-databases')?.click()`);
  await sleep(1100);
}

/** Saves all 4 detected connections (.env) via the File Manager API so later chapters start with all 4 engines ready. */
async function saveAllDetectedQuiet(c: Cdp) {
  await openDatabasesTabQuiet(c);
  await c.eval(`(async () => {
    const token = document.querySelector('meta[name="fm-token"]')?.getAttribute('content') || '';
    const callApi = async (op, body = {}) => {
      const res = await fetch('/api/' + op, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fm-token': token },
        body: JSON.stringify(body),
      });
      return await res.json();
    };
    const det = await callApi('db/detect', { manual: true, quiet: true });
    for (const card of (det.cards || [])) {
      if (card.status === 'new') {
        await callApi('db/detect/save', { key: card.key });
      }
    }
  })()`);
  await c.goto(`http://127.0.0.1:${FM_PORT}/`);
  await c.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`);
  await sleep(600);
  await openDatabasesTabQuiet(c);
}

/** Pre-clones shop.sqlite into PostgreSQL, MySQL, and Redis quietly via the API. */
async function cloneAllEnginesQuiet(c: Cdp) {
  await c.eval(`(async () => {
    const token = document.querySelector('meta[name="fm-token"]')?.getAttribute('content') || '';
    const callApi = async (op, body = {}) => {
      const res = await fetch('/api/' + op, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fm-token': token },
        body: JSON.stringify(body),
      });
      return await res.json();
    };
    const ov = await callApi('db/overview');
    const profiles = ov.profiles || [];
    const sq = profiles.find(p => p.engine === 'sqlite');
    const pg = profiles.find(p => p.engine === 'postgres');
    const my = profiles.find(p => p.engine === 'mysql');
    const rd = profiles.find(p => p.engine === 'redis');
    if (sq && pg) {
      await callApi('db/clone/run', {
        source: { kind: 'profile', profileId: sq.id },
        target: { kind: 'profile', profileId: pg.id },
        options: { contentMode: 'all', conflictMode: 'replace', includeIndexes: true, includeForeignKeys: true, includeViews: true },
      });
    }
    if (sq && my) {
      await callApi('db/clone/run', {
        source: { kind: 'profile', profileId: sq.id },
        target: { kind: 'profile', profileId: my.id },
        options: { contentMode: 'all', conflictMode: 'replace', includeIndexes: true, includeForeignKeys: true, includeViews: true },
      });
    }
    if (sq && rd) {
      await callApi('db/clone/run', {
        source: { kind: 'profile', profileId: sq.id },
        target: { kind: 'profile', profileId: rd.id },
        options: { contentMode: 'tables_only', conflictMode: 'replace', redisKeyFormat: 'hash' },
      });
    }
  })()`);
  await sleep(600);
}

async function openExpandedSqliteStudioQuiet(c: Cdp) {
  await saveAllDetectedQuiet(c);
  await c.eval(`[...document.querySelectorAll('.db-row')].find(r => r.textContent.includes('shop.sqlite'))?.click()`);
  await sleep(400);
  await c.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Open in SQLite Studio'))?.click()`);
  await c.waitFor(STUDIO + "#msgBoxBtnOk", 25000);
  await sleep(500);
  await c.click(STUDIO + "#msgBoxBtnOk");
  await sleep(500);
  await c.eval(`document.querySelector('button.db-expand')?.click()`);
  await sleep(600);
}

/* -------------------------------------------------------------------------- Chapters & Steps */

const chapters: Chapter[] = [
  {
    id: "00_intro",
    chapter: "WELCOME",
    title: "The Unified Databases Hub & Cross-Engine Cloning",
    kind: "card",
    card: {
      kicker: "Codecaine File Manager · Bun RAD Studio",
      title: "Every Database. Seamlessly Connected.",
      lines: [
        "SQLite · MySQL / MariaDB · PostgreSQL · Redis",
        "Auto-Detect · OS Keychain · Live Embedded Studios",
        "Cross-Engine Cloning · Bun JS Macros · 15-Format Import",
      ],
    },
    steps: [
      {
        cap: "SQLite, MySQL, PostgreSQL, and Redis in one place",
        say: "Welcome to the complete guide to databases in the Codecaine File Manager. From one unified hub, you can discover SQLite files on disk, manage connections for SQLite, MySQL, PostgreSQL, and Redis with OS keychain security, launch full studios inside the window, and clone entire databases, tables, views, and Redis keys across any engine. Let's dive right in.",
      },
    ],
  },

  {
    id: "01_files_and_sample",
    chapter: "DISCOVER & SEED",
    title: "SQLite files in the file list & one-click sample databases",
    blurb: "Magic-byte inspection, right-click actions, and synthetic sample datasets",
    steps: [
      {
        cap: "Magic-byte SQLite recognition & right-click database commands",
        say: "We start in the file list inside our Commerce Hub project. The File Manager inspects the first sixteen bytes of every candidate file, so shop dot sqlite is recognized as a genuine SQLite database. Right clicking it reveals instant commands to open SQLite Studio in this tab, in its own window, or in your browser, save it as a connection, or clone its tables into any other database.",
        act: async (d) => {
          await d.hover("#list .row >> new_customers.csv", 800);
          await d.click("#list .row >> shop.sqlite", { pause: 900 });
          await d.rclick("#list .row >> shop.sqlite", { pause: 800 });
          await d.hover(".menu [role^=menuitem] >> Open in SQLite Studio", 1000);
          await d.hover(".menu [role^=menuitem] >> in its own window", 900);
          await d.hover(".menu [role^=menuitem] >> Add as database connection", 1000);
          await d.hover(".menu [role^=menuitem] >> Clone database / tables", 1300);
        },
      },
      {
        cap: "Opening the Databases Hub & creating a Hospital EHR sample database",
        say: "Now let's open Find and more, and switch to the Databases tab. Need realistic data for testing or demos? Click New sample database, choose from eleven synthetic datasets like Hospital E H R, pick a size, and press Create sample database. In one second, a brand new SQLite database is built and saved to your connections list.",
        act: async (d) => {
          await d.key("Escape");
          await d.wait(350);
          await d.click("#tool-power", { pause: 700 });
          await d.click("#power-tab-databases", { pause: 1100 });
          await d.click("button >> New sample database", { pause: 1100 });
          await d.scroll(".dialog label >> Hospital EHR", 140, 5);
          await d.click(".dialog label >> Hospital EHR", { pause: 900 });
          await d.click(".dialog label >> Small", { pause: 700 });
          await d.click(".dialog button >> Create sample database", { pause: 2600 });
          await d.hover(".db-row >> Hospital", 1200);
        },
      },
    ],
  },

  {
    id: "02_all_four_connections",
    chapter: "ALL FOUR ENGINES",
    title: "Connecting SQLite, MySQL, PostgreSQL and Redis",
    blurb: "Environment auto-detection, Effective Settings, and live connection tests",
    steps: [
      {
        cap: "Auto-detecting .env connections across SQLite, MySQL, PostgreSQL, and Redis",
        say: "In the Found in your environment banner, the File Manager automatically spotted our SQLite, MySQL, PostgreSQL, and Redis settings from the project's dot env file without connecting or exposing passwords. Let's save our SQLite and PostgreSQL connections right from the banner, or use Paste address to fill in any connection URL.",
        act: async (d) => {
          await d.hover(".db-found", 1200);
          await d.click("button >> Save to the manager", { pause: 1400 });
          await d.click(".dialog button >> Done", { pause: 800 });
          await d.click("button >> Save to the manager", { pause: 1400 });
          await d.click(".dialog button >> Done", { pause: 800 });
          await d.hover("button >> Paste address", 1000);
        },
      },
      {
        cap: "Testing live SQLite, MySQL, PostgreSQL, and Redis servers & Effective Settings",
        say: "Let's save the remaining connections and test all four live engines. Clicking a connection shows its details and the Effective settings table, which explains whether each value comes from the saved connection, engine defaults, or environment variables. Clicking Test connection verifies PostgreSQL, MySQL, and Redis in milliseconds.",
        act: async (d) => {
          await d.click("button >> Save to the manager", { pause: 1400 });
          await d.click(".dialog button >> Done", { pause: 700 });
          await d.click("button >> Save to the manager", { pause: 1400 });
          await d.click(".dialog button >> Done", { pause: 700 });
          await d.click(".db-row >> PostgreSQL", { pause: 800 });
          await d.click("button >> Test connection", { pause: 1800 });
          await d.click(".db-row >> MySQL", { pause: 800 });
          await d.click("button >> Test connection", { pause: 1800 });
          await d.click(".db-row >> Redis", { pause: 800 });
          await d.click("button >> Test connection", { pause: 1800 });
        },
      },
    ],
  },

  {
    id: "03_clone_sql_to_postgres_and_mysql",
    chapter: "CROSS-ENGINE CLONING",
    title: "Cloning databases and tables across SQLite, PostgreSQL and MySQL",
    blurb: "Schema inspection, canonical type translation, dry-run DDL preview, and live cloning",
    steps: [
      {
        cap: "Opening the Clone wizard & inspecting tables, views, indexes, and foreign keys",
        say: "Now for the centerpiece: cross-engine database cloning. Select our SQLite shop connection and click Clone database or tables. The wizard inspects the source database in read-only mode, listing customers, products, orders, order items, and the customer order summary view, complete with row counts, primary keys, indexes, and foreign key relationships.",
        act: async (d) => {
          await d.click(".db-row >> SQLite", { pause: 700 });
          await d.click("button >> Clone database / tables", { pause: 1600 });
          await d.hover(".db-clone-list", 1500);
          await d.hover("button >> Tables only", 900);
          await d.hover("button >> Select all", 900);
        },
      },
      {
        cap: "Previewing translated PostgreSQL DDL & cloning SQLite → PostgreSQL",
        say: "Let's choose our live PostgreSQL server as the target database and click Preview plan and SQL. Notice how SQLite's schema is translated into native PostgreSQL types: identity primary keys, numeric decimals, timestamps, and foreign keys ordered topologically so parent tables load before child tables. Click Clone now, and all five objects and twenty-four rows are live in PostgreSQL.",
        act: async (d) => {
          await d.eval(`(() => {
            const sel = document.querySelector('select[aria-label="Target database"]');
            const opt = [...sel.options].find(o => o.textContent.includes('PostgreSQL'));
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
          })()`);
          await d.wait(700);
          await d.click("button >> Preview plan & SQL", { pause: 2200 });
          await d.scroll(".db-clone-preview", 260, 6);
          await d.wait(1400);
          await d.click(".dialog button >> Clone now", { pause: 2600 });
          await d.click(".db-row >> PostgreSQL", { pause: 800 });
          await d.click("button >> Test connection", { pause: 2000 });
        },
      },
      {
        cap: "Cloning PostgreSQL → MySQL with InnoDB foreign keys and conflict modes",
        say: "Next, let's clone from PostgreSQL straight into MySQL. Click Clone on the PostgreSQL connection, select MySQL as the destination, and explore the six conflict modes, including replace, truncate, append, and upsert. Preview plan and SQL shows the generated MySQL InnoDB tables and auto-increment keys. Press Clone now, and test MySQL to confirm all tables and rows arrived cleanly.",
        act: async (d) => {
          await d.click(".db-actions button >> Clone…", { pause: 1500 });
          await d.eval(`(() => {
            const sel = document.querySelector('select[aria-label="Target database"]');
            const opt = [...sel.options].find(o => o.textContent.includes('MySQL'));
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
          })()`);
          await d.wait(600);
          await d.hover('select[aria-label="When a target table or key already exists"]', 1100);
          await d.click("button >> Preview plan & SQL", { pause: 1800 });
          await d.click(".dialog button >> Clone now", { pause: 2600 });
          await d.click(".db-row >> MySQL", { pause: 800 });
          await d.click("button >> Test connection", { pause: 1800 });
        },
      },
    ],
  },

  {
    id: "04_clone_redis_and_new_sqlite",
    chapter: "REDIS ↔ SQL CLONING",
    title: "Cloning SQL tables into Redis Hashes & back into a new SQLite file",
    blurb: "Bidirectional SQL-to-Redis Hash mapping and instant SQLite file creation",
    steps: [
      {
        cap: "Cloning SQL tables into Redis Hashes (<table>:<pk>)",
        say: "You can even clone between relational SQL tables and Redis. Open the Clone wizard from our SQLite shop database, choose Redis as the target, and click Tables only. Each row becomes a structured Redis hash keyed by table name and primary key, plus an index set of IDs. Click Preview plan and SQL, then press Clone now to populate Redis.",
        act: async (d) => {
          await d.click(".db-row >> SQLite", { pause: 700 });
          await d.click("button >> Clone database / tables", { pause: 1500 });
          await d.eval(`(() => {
            const sel = document.querySelector('select[aria-label="Target database"]');
            const opt = [...sel.options].find(o => o.textContent.includes('Redis'));
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
          })()`);
          await d.wait(500);
          await d.click("button >> Tables only", { pause: 700 });
          await d.hover('select[aria-label="Redis key format when cloning SQL tables to Redis"]', 1000);
          await d.click("button >> Preview plan & SQL", { pause: 1800 });
          await d.click(".dialog button >> Clone now", { pause: 2400 });
          await d.click(".db-row >> Redis", { pause: 800 });
          await d.click("button >> Test connection", { pause: 1800 });
        },
      },
      {
        cap: "Cloning Redis key groups into a brand-new SQLite database file",
        say: "Now let's go in reverse: with Redis selected, click Clone. The wizard automatically groups Redis keys by their prefix and discovers every hash field. Choose New SQLite database file as the target, name it redis snapshot dot sqlite, preview the synthesized SQLite table definitions, and click Clone now. Our new SQLite database is created on disk and added to our connections list.",
        act: async (d) => {
          await d.click(".db-actions button >> Clone…", { pause: 1600 });
          await d.hover(".db-clone-list", 1200);
          await d.eval(`(() => {
            const sel = document.querySelector('select[aria-label="Target database"]');
            sel.value = '__new_sqlite__';
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            const nameInput = document.querySelector('input[aria-label="File name for the new SQLite file"]');
            if (nameInput) {
              nameInput.value = 'redis_snapshot.sqlite';
              nameInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
          })()`);
          await d.wait(700);
          await d.click("button >> Preview plan & SQL", { pause: 1800 });
          await d.click(".dialog button >> Clone now", { pause: 2600 });
          await d.hover(".db-row >> redis_snapshot", 1400);
        },
      },
    ],
  },

  {
    id: "05_bun_js_and_visual_macros",
    chapter: "BUN JS & VISUAL MACROS",
    title: "The Bun JavaScript & Visual Macro Studio across all engines",
    blurb: "Access DAO/DoCmd API, cross-connection scripts, dry-run rollback, and TypeScript/VBA/SQL export",
    steps: [
      {
        cap: "Opening the Bun JS & Visual Macro Studio & running Table Row Counter against shop.sqlite",
        say: "Next, click Macros Bun J S in the Databases toolbar to open the multi-engine Macro Studio. It ships with five built-in macros and can target an in-memory scratch database or any saved SQLite, PostgreSQL, MySQL, or Redis connection. Let's pick our SQLite shop connection and run Table Row Counter, which inspects every table and returns structured row counts and console trace logs.",
        act: async (d) => {
          await d.click("button >> Macros (Bun JS)", { pause: 1300 });
          await d.hover(".db-macro-list", 1200);
          await d.eval(`(() => {
            const sel = document.querySelector('select[aria-label="Target database connection"]');
            const opt = [...sel.options].find(o => o.textContent.includes('shop.sqlite'));
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
          })()`);
          await d.wait(600);
          await d.click(".dialog button >> ▶ Run Macro", { pause: 2200 });
          await d.hover(".db-macro-output", 1400);
        },
      },
      {
        cap: "DAO Recordset, DCount/DSum, Check Syntax, and Dry Run (Rollback)",
        say: "Select Customer Order Audit to see the Microsoft Access D A O and Do Command objects in action, alongside quick-insert snippet chips for Current D B query, Open Recordset, D Count, D Lookup, D Sum, transactions, and cross-connection queries. Click Check Syntax to validate the script with Bun's transpiler, then press Dry Run Rollback to execute the entire audit inside a transaction that automatically rolls back.",
        act: async (d) => {
          await d.click(".db-macro-item >> Customer Order Audit", { pause: 1100 });
          await d.hover(".db-macro-snippets", 1200);
          await d.click("button >> ✓ Check Syntax", { pause: 1400 });
          await d.click(".dialog button >> 🧪 Dry Run (Rollback)", { pause: 2400 });
          await d.scroll(".db-macro-output", 220, 5);
          await d.wait(1000);
        },
      },
      {
        cap: "Visual Action Macros, Convert Actions to Bun JS, and .ts / .bas / .sql Export",
        say: "Prefer a no-code builder? Select Quick V I P Report to edit conditional visual steps like Message Box, Set Temp Var, and Run S Q L. Click Run Macro to execute the steps, then press Convert Actions to Bun J S to compile the visual macro into clean JavaScript. You can export any macro as a standalone Bun TypeScript script, a V B A module, or a S Q L script.",
        act: async (d) => {
          await d.click(".db-macro-item >> Quick VIP Report", { pause: 900 });
          await d.hover(".db-macro-step-card", 800);
          await d.click(".dialog button >> ▶ Run Macro", { pause: 1800 });
          await d.click("button >> ⇄ Convert Actions to Bun JS", { pause: 1100 });
          await d.click("button >> 🥟 Export .ts", { pause: 1000 });
          await d.click("button >> 🧾 Export VBA", { pause: 1000 });
          await d.click("button >> 📄 Export .sql", { pause: 1000 });
          await d.click(".dialog button >> Close", { pause: 600 });
        },
      },
    ],
  },

  {
    id: "06_universal_import_and_staging",
    chapter: "15-FORMAT STAGING IMPORT",
    title: "Universal 15-format import & the 5-step Staging Wizard",
    blurb: "Right-click Load into a database, schema mapping, row validation, and safe transactional promotion",
    steps: [
      {
        cap: "Right-clicking a file → Load into a database (staging first)",
        say: "Every studio supports fifteen import formats—including C S V, T S V, J S O N, Parquet, Excel, Arrow, Avro, O R C, XML, Yaml, H T M L, and SQLite—and you can launch the staging wizard straight from the file list. Right-click new customers dot C S V, choose Load into a database, pick our saved shop dot sqlite connection, and click Open the import wizard.",
        act: async (d) => {
          await d.rclick("#list .row >> new_customers.csv", { pause: 900 });
          await d.click(".menu [role^=menuitem] >> Load into a database", { pause: 1400 });
          await d.eval(`(() => {
            const sel = document.querySelector('.dialog select');
            const opt = sel && [...sel.options].find(o => o.textContent.includes('shop.sqlite'));
            if (sel && opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
          })()`);
          await d.hover(".dialog select", 900);
          await d.click(".dialog button >> Open the import wizard", { pause: 800 });
          await d.waitFor(STUDIO + "#msgBoxBtnOk", 25000);
          await d.wait(600);
          await d.click(STUDIO + "#msgBoxBtnOk", { pause: 1600 });
        },
      },
      {
        cap: "Mapping columns, loading to staging, checking rows, and promoting in one transaction",
        say: "Step one auto-detects the delimiter, encoding, and headers. In step two, we choose the customers table so columns match automatically, then load the rows into an isolated staging table. Click Check the rows to validate types, required fields, and duplicates before touching real data. Finally, choose Add new rows only and click Promote to commit Barbara Liskov and Ken Thompson in one atomic transaction.",
        act: async (d) => {
          await d.click(STUDIO + "button >> Next: choose where it goes", { pause: 1200 });
          await d.c.evalFrame(".db-studio-frame ||| iframe", `(() => {
            const s = [...document.querySelectorAll('select')].find(x => x.textContent.includes('choose a table'));
            if (s) { s.value = 'customers'; s.dispatchEvent(new Event('change', { bubbles: true })); }
          })()`);
          await d.wait(1500);
          await d.click(STUDIO + "button >> Next: load into staging", { pause: 2200 });
          await d.click(STUDIO + "button >> Check the rows", { pause: 2200 });
          await d.click(STUDIO + "button >> Next: review & promote", { pause: 1300 });
          await d.click(STUDIO + "label >> Add new rows only", { pause: 800 });
          await d.click(STUDIO + "button >> Promote", { pause: 2200 });
          await d.click(STUDIO + ".stg-foot button >> Close", { pause: 900 });
          await d.click(STUDIO + ".tree-item-title >> customers", { pause: 1400 });
        },
      },
    ],
  },

  {
    id: "07_studio_grid_crud_inspector",
    chapter: "DATA GRID PRO & INSPECTOR",
    title: "Per-column filter bar, Side Row Inspector, FK jump & backups",
    blurb: "Studio IDE v2 data grid: instant column filters, side-by-side record/JSON inspector, and relational navigation",
    steps: [
      {
        cap: "Per-column Filter Bar & the Side-by-Side Row / JSON Inspector",
        say: "Now let's explore the Studio I D E version two inside full-screen mode. In the Data Grid, toggle the Filter Bar to filter individual columns—let's type enterprise under tier—and open the Side Row Inspector. Clicking any customer row displays every column value, primary key badge, and formatted J S O N payload right beside the grid, with one-click Copy Row J S O N and Edit Row buttons.",
        act: async (d) => {
          await d.click(STUDIO + ".tree-item-title >> customers", { pause: 900 });
          await d.click(STUDIO + "#btnToggleFilterBar", { pause: 1000 });
          await d.click(STUDIO + '.access-filter-input[data-col="tier"]', { pause: 400 });
          await d.type("enterprise", 80);
          await d.key("Enter");
          await d.wait(1300);
          await d.click(STUDIO + "#btnToggleRowInspector", { pause: 900 });
          await d.click(STUDIO + "#gridBody tr", { pause: 1600 });
          await d.hover(STUDIO + "#studioRowInspector", 1400);
          await d.click(STUDIO + "#btnCloseRowInspector", { pause: 700 });
          await d.click(STUDIO + "#btnToggleFilterBar", { pause: 700 });
        },
      },
      {
        cap: "Foreign-Key ↗ drill-down, Totals footer, 6-format table export & Full DB Backup / Dump",
        say: "Select the orders table and notice the Foreign Key jump badge next to each customer I D. Clicking that arrow jumps straight to the parent customer row in the customers table! You can also pin the Totals footer row for live counts, sums, and averages, export any table in six formats, or open D B Backup and Dump to generate a complete transactional S Q L script.",
        act: async (d) => {
          await d.click(STUDIO + ".tree-item-title >> orders", { pause: 900 });
          await d.click(STUDIO + "#btnToggleTotals", { pause: 1100 });
          await d.click(STUDIO + ".studio-fk-jump", { pause: 1600 });
          await d.click(STUDIO + "button >> 📤 Export", { pause: 1100 });
          await d.click(STUDIO + "button >> 📋 Copy to clipboard", { pause: 900 });
          await d.click(STUDIO + "#btnDbBackupDump", { pause: 1400 });
          await d.click(STUDIO + 'button[onclick="closeDatabaseDumpModal()"]', { pause: 600 });
        },
      },
    ],
  },

  {
    id: "08_sql_ide_er_diff_codegen",
    chapter: "SQL IDE, ER DIAGRAM & CODEGEN",
    title: "Multi-tab SQL IDE, Full ER Diagram, Schema Diff & Code Generation",
    blurb: "SQL worksheets, Format SQL, Transaction & Read-Only Guard, ER diagram, Schema Diff, and 5-language codegen",
    steps: [
      {
        cap: "Multi-tab SQL Worksheets, Format SQL, Query History, Transaction Bar & Explain Plan",
        say: "Open the S Q L Editor I D E to see multi-tab worksheets that persist automatically. You can add new worksheet tabs, pretty-print queries with Format S Q L, browse and replay past queries in the History drawer, control manual Begin, Commit, and Rollback transactions or lock the studio with the Read-Only Guard, and visualize execution steps in the Explain Plan tab.",
        act: async (d) => {
          await d.click(STUDIO + "#btnAddWorksheet", { pause: 700 });
          await d.click(STUDIO + ".studio-ws-tab", { pause: 600 });
          await d.click(STUDIO + "#btnStudioFormatSql", { pause: 900 });
          await d.click(STUDIO + 'button[onclick="runEditorQuery()"]', { pause: 1100 });
          await d.click(STUDIO + "#btnStudioSqlHistory", { pause: 1100 });
          await d.click(STUDIO + "#btnStudioHistClose", { pause: 500 });
          await d.click(STUDIO + "#btnTxBegin", { pause: 900 });
          await d.click(STUDIO + "#btnTxCommit", { pause: 800 });
          await d.click(STUDIO + "#btnReadOnlyGuard", { pause: 800 });
          await d.click(STUDIO + "#btnReadOnlyGuard", { pause: 600 });
          await d.click(STUDIO + "#tabBtnExplain", { pause: 800 });
          await d.click(STUDIO + 'button[onclick="explainCurrentQuery()"]', { pause: 1200 });
        },
      },
      {
        cap: "Visual Query Designer, Interactive Full-Database ER Diagram & Schema Diff Migration DDL",
        say: "The Visual Query Designer builds multi-table joins on a drag-and-drop canvas. Switch to the Schema Designer tab and click Full E R Diagram to render an interactive SVG entity-relationship diagram of every table and foreign key connector, with SVG export. Then click Schema Diff and Migration, capture a baseline snapshot, and compare schemas to generate ready-to-run migration D D L.",
        act: async (d) => {
          await d.click(STUDIO + "#tabBtnDesigner", { pause: 1400 });
          await d.click(STUDIO + "#tabBtnSchema", { pause: 1200 });
          await d.click(STUDIO + "#btnSchemaModeEr", { pause: 1800 });
          await d.hover(STUDIO + "#studioErDiagramPane", 1400);
          await d.click(STUDIO + "#btnSchemaModeDiff", { pause: 1300 });
          await d.click(STUDIO + "#btnCaptureBaseline", { pause: 1200 });
          await d.click(STUDIO + "#btnRunSchemaDiff", { pause: 1500 });
        },
      },
      {
        cap: "In-Studio Macros, RunCode, and 5-Language Code Generator (Bun.sql, TypeScript, Python, V)",
        say: "Inside the studio's Macro Designer, you can combine visual actions with Run Code JavaScript blocks, open the embedded Bun J S Editor, or click Code to open the multi-language Code Generator. It translates your macro into native Bun dot S Q L, TypeScript, Bun SQLite, Python, or V-lang code ready to paste into your application.",
        act: async (d) => {
          await d.click(STUDIO + "#tabBtnMacros", { pause: 1100 });
          await d.click(STUDIO + 'button[onclick="quickAddAction(\'RunCode\')"]', { pause: 900 });
          await d.click(STUDIO + 'button[onclick="openMacroExportDialog(\'bun\')"]', { pause: 1100 });
          await d.click(STUDIO + 'button[onclick="closeMacroJsonModal()"]', { pause: 600 });
          await d.click(STUDIO + 'button[onclick="openCodeGenForCurrentMacro()"]', { pause: 1200 });
          for (const lang of ["bun-sql", "typescript", "bun", "python", "vlang"]) {
            await d.click(STUDIO + `#macroCodeTabs button[data-target="${lang}"]`, { pause: 750 });
          }
          await d.click(STUDIO + 'button[onclick="closeCodeGenModal()"]', { pause: 600 });
          await d.click(STUDIO + "#tabBtnPragma", { pause: 1100 });
        },
      },
    ],
  },

  {
    id: "09_postgres_mysql_redis_studios",
    chapter: "POSTGRES, MYSQL & REDIS STUDIOS",
    title: "Live PostgreSQL, MySQL and Redis Studios & the Open Studios Switcher",
    blurb: "Inspecting cloned tables in PostgreSQL & MySQL, and exploring hashes, 15-format import & CLI in Redis Studio",
    steps: [
      {
        cap: "Launching PostgreSQL Studio & MySQL Studio and switching via the Open Studios bar",
        say: "Back in the Databases Hub, let's open PostgreSQL Studio and MySQL Studio on the databases we cloned earlier. Both studios share the exact same Data Grid Pro, Side Row Inspector, Full E R Diagram, Schema Diff, and Macro tools, and the Open studios bar at the top lets you jump between running engines in a single click.",
        act: async (d) => {
          await d.click(".db-row >> PostgreSQL", { pause: 700 });
          await d.click("button >> Open in PostgreSQL Studio", { pause: 1000 });
          await d.waitFor(STUDIO + "#msgBoxBtnOk", 25000);
          await d.wait(500);
          await d.click(STUDIO + "#msgBoxBtnOk", { pause: 700 });
          await d.click(STUDIO + ".tree-item >> orders", { pause: 1100 });
          await d.click("button >> ← Connections", { pause: 800 });
          await d.click(".db-row >> MySQL", { pause: 700 });
          await d.click("button >> Open in MySQL Studio", { pause: 1000 });
          await d.waitFor(STUDIO + "#msgBoxBtnOk", 25000);
          await d.wait(500);
          await d.click(STUDIO + "#msgBoxBtnOk", { pause: 700 });
          await d.click(STUDIO + ".tree-item >> orders", { pause: 1100 });
          await d.click("button >> ← Connections", { pause: 800 });
          await d.hover(".db-strip", 1300);
        },
      },
      {
        cap: "Exploring Redis Studio: Hash editor, 15-format Redis Import, CLI Console & Telemetry",
        say: "Now select Redis and click Open in Redis Studio. Expand the view to inspect the customer and order hash keys we cloned from SQLite, edit fields, TTLs, and key types, or click Import to load fifteen file formats into Redis Strings, Hashes, Lists, Sets, Sorted Sets, or Streams. You also get an interactive Redis C L I console with command reference pills and live server telemetry.",
        act: async (d) => {
          await d.click(".db-row >> Redis", { pause: 700 });
          await d.click("button >> Open in Redis Studio", { pause: 1100 });
          await d.waitFor(STUDIO + "#keyList", 25000);
          await d.wait(800);
          await d.click("button.db-expand", { pause: 800 });
          await d.click(STUDIO + "#keyList .key-item", { pause: 1100 });
          await d.click(STUDIO + "button >> ⬆ Import", { pause: 1100 });
          await d.hover(STUDIO + "#importFormat", 800);
          await d.click(STUDIO + 'button[onclick="closeModal(\'importModal\')"]', { pause: 600 });
          await d.click(STUDIO + ".tab-btn >> Interactive CLI Console", { pause: 900 });
          await d.click(STUDIO + "#cliInput", { pause: 300 });
          await d.type("HGETALL customers:1", 45);
          await d.click(STUDIO + 'button[onclick="submitCli()"]', { pause: 1200 });
          await d.click(STUDIO + ".tab-btn >> Server Telemetry", { pause: 1300 });
        },
      },
    ],
  },

  {
    id: "10_outro",
    chapter: "WRAP UP",
    title: "One Hub. Four Engines. Zero Friction.",
    kind: "card",
    card: {
      kicker: "Complete Databases Guide · Bun RAD Studio",
      title: "One Hub. Four Engines.",
      lines: [
        "docs/databases/complete-databases-guide.md",
        "SQLite · MySQL / MariaDB · PostgreSQL · Redis",
        "Cross-Engine Cloning · Bun JS Macros · Studio IDE v2",
      ],
    },
    steps: [
      {
        cap: "Read the Complete Databases Guide in docs/databases/complete-databases-guide.md",
        say: "And that is the complete Databases Hub in the Codecaine File Manager: automatic environment discovery, OS keychain security, synthetic sample databases, cross-engine cloning across SQLite, PostgreSQL, MySQL, and Redis, the Bun JavaScript and Visual Macro Studio, fifteen-format staging imports, and full Studio I D E version two workbenches with E R diagrams, schema diff, and multi-language code generation. Check out the complete databases guide in the docs folder, and thanks for watching!",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- Chapter Setup & Notes */

async function openChapter(ch: Chapter, _world: World) {
  await startFm(LAUNCH);
  await cdp.goto(`http://127.0.0.1:${FM_PORT}/`);
  await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`);
  await sleep(700);

  if (ch.id === "02_all_four_connections") {
    await openDatabasesTabQuiet(cdp);
  } else if (
    ch.id === "03_clone_sql_to_postgres_and_mysql" ||
    ch.id === "04_clone_redis_and_new_sqlite" ||
    ch.id === "05_bun_js_and_visual_macros"
  ) {
    await saveAllDetectedQuiet(cdp);
  } else if (ch.id === "06_universal_import_and_staging") {
    await saveAllDetectedQuiet(cdp);
    await cdp.eval(`document.querySelector('#view-files')?.click()`);
    await sleep(600);
  } else if (ch.id === "07_studio_grid_crud_inspector" || ch.id === "08_sql_ide_er_diff_codegen") {
    await openExpandedSqliteStudioQuiet(cdp);
  } else if (ch.id === "09_postgres_mysql_redis_studios") {
    await saveAllDetectedQuiet(cdp);
    await cloneAllEnginesQuiet(cdp);
  }
}

const notes = (marks: Array<{ at: number; title: string }>, total: number) => {
  const REPO = "https://github.com/codecaine-zz/bun_rad_studio";
  const text = marks.map((m, i) => `${fmtTime(i === 0 ? 0 : m.at)} ${m.title}`).join("\n");
  const voiceLabel = GEMINI_KEY ? `Google Gemini TTS (${GEMINI_VOICE})` : `Edge neural voice (${EDGE_VOICE})`;
  return `# Complete Databases & Cross-Engine Cloning Masterclass (${fmtTime(total)})

## YouTube title

All 4 Databases in the Codecaine File Manager: SQLite, MySQL, PostgreSQL, Redis, Cloning, Bun JS Macros & Studio IDE v2

## YouTube description (copy and paste)

\`\`\`text
Master every database capability in the Codecaine File Manager (part of Bun RAD Studio). Discover SQLite files by magic bytes in the file list, generate synthetic sample databases in one click, auto-detect .env connections for SQLite, MySQL / MariaDB, PostgreSQL and Redis with OS keychain security, inspect Effective Settings, and run live connection tests. Clone entire databases, selected tables, views, secondary indexes, foreign keys, and Redis Hash key groups seamlessly between SQLite, PostgreSQL, MySQL, Redis, and brand-new SQLite files. Run Access-style DAO/DoCmd scripts and visual action macros in the Bun JavaScript & Visual Macro Studio across any connection with dry-run rollback and .ts/.bas/.sql export. Load 15 file formats through the 5-step Staging Import Wizard, and explore Studio IDE v2: Data Grid Pro with per-column filters, Side Row/JSON Inspector, FK ↗ jump links, multi-tab SQL worksheets, Format SQL, Query History, Transaction & Read-Only Guard, Full ER Diagram, Schema Diff & Migration DDL, 5-language Code Generation (Bun.sql, TypeScript, Python, V), and the live PostgreSQL, MySQL, and Redis Studios.

Free and open source: ${REPO}
Complete Databases Guide: ${REPO}/blob/main/docs/databases/complete-databases-guide.md
File Manager Guide: ${REPO}/blob/main/docs/userguides/43_file_manager.md

Chapters
${text}
\`\`\`

## Tags (comma separated)

sqlite, mysql, postgresql, redis, database cloning, cross engine database migration, bun js macros, visual macro builder, er diagram, schema diff, code generation, bun sql, staging import, database gui, database manager, file manager, codecaine file manager, bun, bun runtime, typescript, bun rad studio, sqlite studio, mysql studio, postgres studio, redis studio, sql tutorial, database tools, macos

## Hashtags

#SQLite #PostgreSQL #MySQL #Redis #Database #Bun #TypeScript #FileManager #DevTools #OpenSource #DataEngineering

## Notes

- Recorded live in headless Chrome against real throwaway instances of **SQLite** (\`bun:sqlite\`), **MySQL** (port ${MYSQL_PORT}), **PostgreSQL** (port ${PG_PORT}), and **Redis** (port ${REDIS_PORT}) in \`youtube_production/databases_masterclass_tutorial/_work\`.
- Uses \`scripts/lib/mysql_tutorial_nokeychain.ts\` preload so no real macOS Keychain entry or repository \`.env\` secret is ever read or modified.
- Narration: ${voiceLabel}.
- Rebuild: \`bun scripts/tutorial_databases_masterclass.ts all\`.
`;
};

const suite: Suite = {
  name: "databases_masterclass",
  chapters,
  seedWorld,
  open: (ch, world) => openChapter(ch, world),
  start: async () => {
    await startMysql();
    await startPostgres();
    await startRedis();
    cdp = await Cdp.launch(CDP_PORT, CHROME_DIR, 1920, VIEW_H);
  },
  stop: () => {
    stopFm();
    cdp?.close();
  },
  cdp: () => cdp,
  notes,
  viewHeight: VIEW_H,
  rigMark: "🍎 Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz",
};

await runTutorial(suite, process.argv.slice(2));
await stopRedis();
await stopPostgres();
await stopMysql();
process.exit(0);
