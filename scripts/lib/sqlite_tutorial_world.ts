// The throwaway world for the SQLite-in-the-File-Manager tutorial: a sample home folder with one small shop database,
// a CSV file to import and a few ordinary files. Nothing here is real, and nothing outside the work folder is touched.
import { SqliteManager } from "../../applications/sqlite_studio_server";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const FIRST = ["Ava", "Liam", "Maya", "Noah", "Zoe", "Ethan", "Isla", "Lucas", "Mia", "Owen", "Nora", "Leo", "Ella", "Finn", "Ivy", "Jack", "Ruby", "Kai", "Luna", "Theo"];
const LAST = ["Chen", "Novak", "Singh", "Berg", "Alvarez", "Park", "Rossi", "Meyer", "Okafor", "Silva", "Kim", "Dubois"];
const COMPANIES = ["Northwind Traders", "Blue Harbor Co", "Summit Labs", "Greenleaf Foods", "Pixel Forge", "Atlas Freight", "Lumen Studio", "Cedar & Pine"];
const COUNTRIES = ["United States", "Canada", "United Kingdom", "Germany", "India", "Korea", "Italy", "France"];
const TIERS = ["Standard", "Standard", "Enterprise", "VIP"];
const PRODUCTS: Array<[string, string, string, number, number, number]> = [
  ["KB-MECH-01", "Mechanical Keyboard", "Peripherals", 79, 40, 4.7], ["MON-4K-02", "4K Monitor", "Displays", 249, 12, 4.6], ["CAM-HD-03", "HD Webcam", "Peripherals", 59, 55, 4.3],
  ["AUD-HS-04", "Studio Headset", "Audio", 99, 30, 4.8], ["ACC-MAT-05", "Desk Mat", "Accessories", 25, 100, 4.5], ["ACC-HUB-06", "USB-C Hub", "Accessories", 39, 80, 4.4],
  ["ACC-STD-07", "Laptop Stand", "Accessories", 45, 64, 4.6], ["PER-MSE-08", "Wireless Mouse", "Peripherals", 35, 90, 4.5], ["AUD-MIC-09", "Microphone", "Audio", 129, 22, 4.9],
  ["DSP-ARM-10", "Monitor Arm", "Displays", 89, 18, 4.4], ["ACC-LGT-11", "Webcam Light", "Accessories", 29, 70, 4.2], ["AUD-SPK-12", "Speaker Pair", "Audio", 149, 15, 4.7],
];

/** Where the whole throwaway world lives. A short path with no user name in it, because paths are shown on screen. */
export const WORK = "/Users/Shared/sqlite_demo";

export interface World {
  home: string;
  shopDir: string;
  shopDb: string;
  csv: string;
}

/** Builds the sample home folder under `home` (it is wiped first). */
export function seedSqliteWorld(home: string): World {
  rmSync(home, { recursive: true, force: true });
  const shopDir = join(home, "Projects", "shop-app", "data");
  mkdirSync(shopDir, { recursive: true });
  const put = (rel: string, body: string) => { const p = join(home, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, body); };

  const shopDb = join(shopDir, "shop.sqlite");
  // The studio's own sample schema (tables, views, indexes, audit log), filled with made-up customers instead of its starter rows.
  const manager = new SqliteManager(shopDb);
  manager.seedEnterpriseDatabase();
  const db = manager.db;
  db.run("PRAGMA foreign_keys = OFF");
  for (const t of ["order_items", "orders", "customers", "products"]) db.run(`DELETE FROM ${t}`);
  db.run("DELETE FROM sqlite_sequence");
  db.run("PRAGMA foreign_keys = ON");
  for (let i = 0; i < 48; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`;
    db.run("INSERT INTO customers(name,email,company,country,tier,balance,created_at) VALUES (?,?,?,?,?,?,?)",
      [name, `${name.toLowerCase().replace(" ", ".")}${i}@example.com`, COMPANIES[i % COMPANIES.length]!, COUNTRIES[i % COUNTRIES.length]!, TIERS[(i * 7 + Math.floor(i / 3)) % 4]!, Math.round((200 + ((i * 137) % 9000)) * 100) / 100, `2026-0${1 + (i % 8)}-${String(1 + (i % 27)).padStart(2, "0")} 09:${String(10 + (i % 50))}:00`]);
  }
  for (const [sku, n, c, p, s, r] of PRODUCTS) db.run("INSERT INTO products(sku,name,category,price,stock,rating) VALUES (?,?,?,?,?,?)", [sku, n, c, p, s, r]);
  const statuses = ["completed", "shipped", "processing", "pending", "completed", "shipped"];
  for (let i = 0; i < 120; i++) {
    const items: Array<[number, number, number]> = [];
    for (let k = 0; k < 1 + (i % 3); k++) { const pid = 1 + ((i * 5 + k * 3) % PRODUCTS.length); items.push([pid, 1 + ((i + k) % 4), PRODUCTS[pid - 1]![3]]); }
    const total = items.reduce((a, [, q, pr]) => a + q * pr, 0);
    const r = db.run("INSERT INTO orders(customer_id,order_number,status,total_amount,payment_method,created_at) VALUES (?,?,?,?,?,?)",
      [1 + ((i * 7) % 48), `ORD-2026-${2000 + i}`, statuses[i % statuses.length]!, total, i % 2 ? "Credit Card" : "Corporate Net-30", `2026-0${1 + (i % 9)}-${String(1 + ((i * 3) % 27)).padStart(2, "0")} 14:00:00`]);
    for (const [pid, q, pr] of items) db.run("INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES (?,?,?,?)", [Number(r.lastInsertRowid), pid, q, pr]);
  }
  db.run("DELETE FROM audit_logs");
  db.run("PRAGMA journal_mode = DELETE");
  db.close();

  const csv = join(shopDir, "new-customers.csv");
  writeFileSync(csv, [
    "name,email,company,country,tier",
    "Hana Ito,hana.ito@example.com,Kiri Design,Japan,Enterprise",
    "Marco Bianchi,marco.bianchi@example.com,Bianchi Cafe,Italy,Standard",
    "Sofia Lund,sofia.lund@example.com,Lund Logistics,Sweden,VIP",
    "Omar Haddad,omar.haddad@example.com,Atlas Souk,Morocco,Standard",
    "Priya Nair,priya.nair@example.com,Nair Textiles,India,Enterprise",
    "Tomas Weber,tomas.weber@example.com,Weber Optics,Germany,Standard",
  ].join("\n") + "\n");

  put("Projects/shop-app/README.md", "# Shop App\n\nA small storefront. Its data lives in data/shop.sqlite.\n");
  put("Projects/shop-app/data/schema-notes.txt", "customers -> orders -> order_items -> products\n");
  put("Projects/shop-app/package.json", JSON.stringify({ name: "shop-app", version: "1.2.0" }, null, 2) + "\n");
  put("Documents/meeting-notes.txt", "Check the order numbers before Friday.\n");
  put("Downloads/installer-log.txt", "Installed 42 packages in 1.8s\n");
  return { home, shopDir, shopDb, csv };
}

/**
 * A private copy of the program's own folders. The File Manager reads the `.env` files of its install folder to find
 * database settings, and the real project folder has a real `.env`: the recording must never touch it. The copy gets a
 * made-up `.env` instead, which is also what the "Found in your environment" card of the tutorial shows.
 */
export function prepareAppCopy(repo: string, app: string, shopDb: string) {
  rmSync(app, { recursive: true, force: true });
  mkdirSync(app, { recursive: true });
  for (const d of ["src", "applications", "resources", "icons"]) Bun.spawnSync(["cp", "-R", join(repo, d), join(app, d)]);
  for (const f of ["package.json", "tsconfig.json", "design_tokens.css", "index.ts"]) Bun.spawnSync(["cp", join(repo, f), join(app, f)]);
  Bun.spawnSync(["ln", "-s", join(repo, "node_modules"), join(app, "node_modules")]);
  writeFileSync(join(app, ".env"), `# Example settings for the tutorial (made up)\nSQLITE_PATH=${shopDb}\n`);
}
