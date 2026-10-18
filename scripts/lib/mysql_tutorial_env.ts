// Everything the MySQL tutorial needs outside the browser: a throwaway MySQL server (port 3399), its sample "shop" database,
// a throwaway home folder, and the File Manager server started with the safety preload. Nothing here touches the real MySQL,
// keychain, home folder or settings: it all lives in youtube_production/mysql_studio_tutorial/_work (git-ignored).
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { sleep } from "./cdp_recorder";

export const ROOT = process.cwd();
export const WORK = join(ROOT, "youtube_production", "mysql_studio_tutorial", "_work");
export const HOME = join(WORK, "home");
export const DATA = join(WORK, "data");
export const GRAVE = join(WORK, "grave");
export const LAUNCH = join(HOME, "Projects", "shop-app");
export const MYSQL_PORT = 3399;
export const FM_PORT = 51691;
export const CDP_PORT = 9391;
export const CHROME_DIR = join(WORK, "chrome");
const MYSQL_DATA = join(WORK, "mysql_data");
const MYSQL_BIN = "/opt/homebrew/bin";

let mysqld: ReturnType<typeof Bun.spawn> | null = null;
let fm: ReturnType<typeof Bun.spawn> | null = null;

/** Runs the mysql client against the throwaway server (never any other). */
export function mysqlRun(sql: string, db = ""): string {
  const r = Bun.spawnSync([`${MYSQL_BIN}/mysql`, "-h127.0.0.1", `-P${MYSQL_PORT}`, "-uroot", "--batch", ...(db ? [db] : []), "-e", sql], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`mysql: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

const mysqlUp = () => { try { mysqlRun("select 1"); return true; } catch { return false; } };

/** Starts the throwaway MySQL server (creating its data folder the first time) unless one is already answering on 3399. */
export async function startMysql() {
  if (mysqlUp()) return;
  if (!existsSync(MYSQL_DATA)) {
    mkdirSync(WORK, { recursive: true });
    const prefix = Bun.spawnSync(["brew", "--prefix", "mysql"]).stdout.toString().trim();
    const r = Bun.spawnSync([`${MYSQL_BIN}/mysqld`, "--initialize-insecure", `--datadir=${MYSQL_DATA}`, `--basedir=${prefix}`], { stdout: "ignore", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`mysqld --initialize-insecure failed: ${r.stderr.toString().slice(-400)}`);
  }
  mysqld = Bun.spawn([`${MYSQL_BIN}/mysqld`, `--datadir=${MYSQL_DATA}`, `--port=${MYSQL_PORT}`, `--socket=${WORK}/mysql.sock`, "--mysqlx=OFF", "--bind-address=127.0.0.1", `--pid-file=${WORK}/mysqld.pid`, `--log-error=${WORK}/mysqld.err`], { stdout: "ignore", stderr: "ignore" });
  for (let i = 0; i < 120 && !mysqlUp(); i++) await sleep(500);
  if (!mysqlUp()) throw new Error("the throwaway MySQL server did not come up");
}

export async function stopMysql() {
  if (!mysqld) return;
  try { Bun.spawnSync([`${MYSQL_BIN}/mysqladmin`, "-h127.0.0.1", `-P${MYSQL_PORT}`, "-uroot", "shutdown"]); } catch {}
  await Promise.race([mysqld.exited, sleep(15000)]);
  try { mysqld.kill(); } catch {}
  mysqld = null;
}

const SEED_SQL = join(WORK, "shop_seed.sql");

/** Drops and rebuilds the sample "shop" database. The first time it is made by the studio's own sample data (customers,
 *  products, orders, order items, a partitioned sales_history table, ENUM columns, foreign keys and views), exactly what its
 *  "Seed Sample DB" button creates; that is saved with mysqldump and loaded again for every later chapter (fast, same rows). */
export async function seedShop() {
  mysqlRun("DROP DATABASE IF EXISTS shop; DROP DATABASE IF EXISTS shop_copy;");
  if (existsSync(SEED_SQL)) {
    const r = Bun.spawnSync([`${MYSQL_BIN}/mysql`, "-h127.0.0.1", `-P${MYSQL_PORT}`, "-uroot"], { stdin: Bun.file(SEED_SQL), stdout: "pipe", stderr: "pipe" });
    if (r.exitCode !== 0) throw new Error(`could not load the shop database: ${r.stderr.toString().trim()}`);
    return;
  }
  mysqlRun("CREATE DATABASE shop CHARACTER SET utf8mb4;");
  const { startMysqlStudioServer } = await import("../../applications/mysql_studio_server.ts");
  const s = startMysqlStudioServer({ port: 0, host: "127.0.0.1", initialDbPath: "shop", config: { host: "127.0.0.1", port: MYSQL_PORT, user: "root", password: "", database: "shop" } as any });
  const r = await fetch(`http://127.0.0.1:${s.port}/api/seed`, { method: "POST" });
  const body: any = await r.json();
  if (!body.success) throw new Error(`could not seed the shop database: ${JSON.stringify(body)}`);
  try { (s as any).stop?.(true); } catch {}
  const dump = Bun.spawnSync([`${MYSQL_BIN}/mysqldump`, "-h127.0.0.1", `-P${MYSQL_PORT}`, "-uroot", "--databases", "shop", "--routines", "--set-gtid-purged=OFF"], { stdout: "pipe", stderr: "pipe" });
  if (dump.exitCode !== 0) throw new Error(`mysqldump failed: ${dump.stderr.toString().trim()}`);
  writeFileSync(SEED_SQL, dump.stdout);
}

const put = (rel: string, body: string) => { const p = join(HOME, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, body); };

/** A small throwaway home folder: a project folder with a database settings file, and a CSV to import. */
export function seedHome() {
  rmSync(HOME, { recursive: true, force: true });
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(GRAVE, { recursive: true });
  put("Documents/notes.txt", "Shop database: tables customers, products, orders, order_items.\n");
  put("Projects/shop-app/README.md", "# Shop App\n\nA small storefront. Its MySQL database is called shop.\n");
  put("Projects/shop-app/.env", "MSQL_HOST=127.0.0.1\nMSQL_PORT=3399\nMSQL_USER=root\nMSQL_PASSWORD=\nMSQL_NAME=shop\n");
  put("Projects/shop-app/data/new_products.csv", "sku,name,category,price,stock\nSKU-9001,Desk Lamp,Home Office,34.50,60\nSKU-9002,Notebook Pack,Stationery,12.00,200\nSKU-9003,Standing Mat,Home Office,45.90,35\nSKU-9004,Cable Tidy,Accessories,8.25,150\nSKU-9005,Webcam Cover,Accessories,3.99,500\n");
}

/** Starts the File Manager server with the throwaway home, settings and keychain stand-in, started in the folder holding the
 *  throwaway .env, with a clean environment (nothing of the real one reaches it). */
export async function startFm(startPath: string) {
  stopFm();
  await sleep(500);
  fm = Bun.spawn([process.execPath, "--preload", join(ROOT, "scripts/lib/mysql_tutorial_nokeychain.ts"), join(ROOT, "applications/file_manager_studio.ts"), "--server", "--port", String(FM_PORT), "--home", HOME, "--data-dir", DATA, "--path", startPath],
    { cwd: LAUNCH, stdout: "ignore", stderr: "ignore", env: { PATH: process.env.PATH ?? "", HOME, GRAVEYARD: GRAVE } });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`http://127.0.0.1:${FM_PORT}/`)).ok) break; } catch {} await sleep(250); }
}

export function stopFm() { try { fm?.kill(9); } catch {} fm = null; }

/* ---------------------------------------------------------------------------------------------- the browser side */

import type { Cdp } from "./cdp_recorder";

/** The studio is a page inside a page inside the File Manager: its frame, then the studio's own page. */
export const STUDIO = "iframe ||| iframe ||| ";

/** A fresh File Manager (and a freshly seeded shop database) in the browser, past the welcome screen. */
export async function freshFm(c: Cdp, startPath: string, opts: { seed?: boolean } = {}) {
  if (opts.seed !== false) await seedShop();
  await startFm(startPath);
  await c.goto(`http://127.0.0.1:${FM_PORT}/`);
  await c.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`);
  await sleep(800);
}

/** Without being recorded: Find & more, Databases, then saves the connection found in the environment. */
export async function saveEnvConnection(c: Cdp) {
  await c.eval(`document.querySelector('#tool-power')?.click()`);
  await sleep(500);
  await c.eval(`document.querySelector('#power-tab-databases')?.click()`);
  await sleep(1200);
  await c.eval(`[...document.querySelectorAll('#power-pane-databases button')].find(b => b.textContent.trim() === 'Save to the manager')?.click()`);
  await sleep(1500);
  await c.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Done')?.click()`);
  await sleep(600);
  await c.eval(`[...document.querySelectorAll('#power-pane-databases .db-row')].find(r => r.textContent.includes('shop'))?.click()`);
  await sleep(800);
}

/** Without being recorded: opens the saved connection in MySQL Studio, in Focus mode, past its welcome message. */
export async function openStudioQuiet(c: Cdp, { welcome = true } = {}) {
  await c.eval(`[...document.querySelectorAll('#power-pane-databases button')].find(b => b.textContent.trim() === 'Open in MySQL Studio')?.click()`);
  for (let i = 0; i < 60 && !(await c.exists(STUDIO + "#tabBtnGrid")); i++) await sleep(300);
  await c.eval(`document.querySelector('#focus-toggle')?.click()`);
  await sleep(800);
  if (welcome) { await c.waitFor(STUDIO + "button >> OK", 10000); await c.click(STUDIO + "button >> OK", { pause: 600, ms: 250 }); }
  await sleep(500);
}

/** Two throwaway client sessions that really block each other (one holds a row lock inside a transaction, the other waits for
 *  it), so the studio's lock monitor has something true to show. Returns a function that ends both. */
export function startLockDemo(): () => void {
  const client = (sql: string) => Bun.spawn([`${MYSQL_BIN}/mysql`, "-h127.0.0.1", `-P${MYSQL_PORT}`, "-uroot", "shop", "-e", sql], { stdout: "ignore", stderr: "ignore" });
  const holder = client("START TRANSACTION; UPDATE products SET stock = stock WHERE id = 1; SELECT SLEEP(60); ROLLBACK;");
  const waiter = Bun.spawn(["sh", "-c", `sleep 1; exec ${MYSQL_BIN}/mysql -h127.0.0.1 -P${MYSQL_PORT} -uroot shop -e "UPDATE products SET stock = stock + 0 WHERE id = 1;"`], { stdout: "ignore", stderr: "ignore" });
  return () => { try { waiter.kill(9); } catch {} try { holder.kill(9); } catch {} };
}
