// Seeds a throwaway home folder for the demo recording so nothing real is shown or modified.
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, writeFileSync, copyFileSync, existsSync } from "fs";
import { join } from "path";

function put(root: string, rel: string, body: string) {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
}

const git = (cwd: string, args: string[], date: string) =>
  Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "ignore",
    stderr: "ignore",
    env: { ...process.env, GIT_AUTHOR_NAME: "Alex Rivera", GIT_AUTHOR_EMAIL: "alex@example.com", GIT_COMMITTER_NAME: "Alex Rivera", GIT_COMMITTER_EMAIL: "alex@example.com", GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });

export function seedDemoWorkspace(home: string, framesDir: string) {
  rmSync(home, { recursive: true, force: true });
  const app = join(home, "Projects", "shop-app");

  put(home, "Projects/shop-app/README.md", "# Shop App\n\nA small storefront with a product catalog, cart and checkout.\n\n## Run\n\n```bash\nbun install\nbun run dev\n```\n");
  put(home, "Projects/shop-app/package.json", JSON.stringify({ name: "shop-app", version: "1.2.0", scripts: { dev: "bun run src/server.ts", test: "bun test" }, dependencies: { hono: "^4.6.0" } }, null, 2) + "\n");
  put(home, "Projects/shop-app/index.html", `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>Shop App</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Welcome to the Shop</h1>\n  <p id="tagline">Fresh products, delivered fast.</p>\n  <script src="app.js"></script>\n</body>\n</html>\n`);
  put(home, "Projects/shop-app/style.css", `body {\n  font-family: system-ui, sans-serif;\n  background: #0f172a;\n  color: #e2e8f0;\n  margin: 2rem;\n}\n\nh1 { color: #38bdf8; }\n`);
  put(home, "Projects/shop-app/app.js", `// TODO: load the catalog from the API\nconst products = [\n  { id: 1, name: "Keyboard", price: 79 },\n  { id: 2, name: "Monitor", price: 249 },\n];\n\nfunction total(cart) {\n  return cart.reduce((sum, p) => sum + p.price, 0);\n}\n\nconsole.log("cart total:", total(products));\n`);
  put(home, "Projects/shop-app/src/server.ts", `import { Hono } from "hono";\nimport { listProducts } from "./products";\n\nconst app = new Hono();\n\n// FIXME: add rate limiting before launch\napp.get("/api/products", (c) => c.json(listProducts()));\n\nexport default { port: 3000, fetch: app.fetch };\n`);
  put(home, "Projects/shop-app/src/products.ts", `export interface Product { id: number; name: string; price: number }\n\nconst items: Product[] = [\n  { id: 1, name: "Keyboard", price: 79 },\n  { id: 2, name: "Monitor", price: 249 },\n  { id: 3, name: "Webcam", price: 59 },\n];\n\n// TODO: move products into the database\nexport function listProducts(): Product[] {\n  return items;\n}\n`);
  put(home, "Projects/shop-app/src/utils.ts", `export const money = (n: number) => "$" + n.toFixed(2);\n\nexport function slug(s: string) {\n  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");\n}\n`);
  put(home, "Projects/shop-app/docs/notes.md", "# Release notes\n\n- Added product search\n- Faster checkout\n- Fixed cart rounding bug\n\nOld host name: oldshop.example.com\n");
  put(home, "Projects/shop-app/docs/deploy.md", "# Deploy\n\nPoint DNS to oldshop.example.com and restart.\n");
  put(home, "Projects/shop-app/.env", "API_TOKEN=demo-token-not-real\n");
  put(home, "Projects/api-service/main.py", "def health():\n    return {'ok': True}\n\n# TODO: add auth middleware\n");
  put(home, "Projects/api-service/requirements.txt", "fastapi\nuvicorn\n");
  put(home, "Projects/starter/package.json", JSON.stringify({ name: "starter", version: "0.1.0", dependencies: { "is-odd": "^3.0.1" } }, null, 2) + "\n");
  put(home, "Projects/starter/index.ts", 'import isOdd from "is-odd";\nconsole.log(isOdd(7));\n');

  const dbPath = join(app, "data", "shop.sqlite");
  mkdirSync(join(app, "data"), { recursive: true });
  const db = new Database(dbPath);
  db.run("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT, country TEXT)");
  db.run("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL, stock INTEGER)");
  db.run("CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), product_id INTEGER REFERENCES products(id), qty INTEGER, ordered_at TEXT)");
  const names = ["Ava Chen", "Liam Novak", "Maya Singh", "Noah Berg", "Zoe Alvarez", "Ethan Park", "Isla Rossi", "Lucas Meyer"];
  const countries = ["US", "CA", "UK", "DE", "IN", "KR", "IT", "FR"];
  names.forEach((n, i) => db.run("INSERT INTO customers(name,email,country) VALUES (?,?,?)", [n, n.split(" ")[0]!.toLowerCase() + "@example.com", countries[i]!]));
  [["Keyboard", 79, 40], ["Monitor", 249, 12], ["Webcam", 59, 55], ["Headset", 99, 30], ["Desk Mat", 25, 100]].forEach(([n, p, s]) => db.run("INSERT INTO products(name,price,stock) VALUES (?,?,?)", [n as string, p as number, s as number]));
  for (let i = 0; i < 60; i++) db.run("INSERT INTO orders(customer_id,product_id,qty,ordered_at) VALUES (?,?,?,?)", [1 + (i % 8), 1 + ((i * 3) % 5), 1 + (i % 4), `2026-0${1 + (i % 9)}-${String(1 + (i % 27)).padStart(2, "0")}`]);
  db.close();

  put(home, "Documents/quarterly-report.md", "# Q3 Report\n\nRevenue grew 18% quarter over quarter.\n");
  put(home, "Documents/budget.csv", "month,income,expenses\nJul,12000,8300\nAug,13250,8900\nSep,14100,9100\n");
  put(home, "Documents/meeting-notes.txt", "Discuss launch date.\nAssign QA owners.\n");
  put(home, "Downloads/installer-log.txt", "Installed 42 packages in 1.8s\n");
  put(home, "Downloads/data-export.json", JSON.stringify({ users: 128, active: 97, plan: "pro" }, null, 2) + "\n");
  put(home, "Desktop/Backup/README.txt", "Drop files here to back them up.\n");
  put(home, "Projects/shop-app/to-delete/old-draft.txt", "Outdated draft. Safe to remove.\n");
  put(home, "Projects/shop-app/to-delete/scratch.log", "debug output\n");

  mkdirSync(join(home, "Pictures"), { recursive: true });
  for (const f of ["01_home_dashboard.png", "05_code_studio.png", "15_theme_cyberpunk.png"]) {
    const src = join(framesDir, f);
    if (existsSync(src)) copyFileSync(src, join(home, "Pictures", f.replace(/^\d+_/, "")));
  }

  git(app, ["init", "-q", "-b", "main"], "2026-08-01T10:00:00");
  const commits: [string, string][] = [
    ["Initial storefront skeleton", "2026-08-01T10:00:00"],
    ["Add product catalog and API route", "2026-08-12T14:20:00"],
    ["Style the landing page", "2026-08-20T09:45:00"],
    ["Fix cart rounding bug", "2026-09-03T16:10:00"],
    ["Add SQLite order history", "2026-09-18T11:30:00"],
  ];
  for (const [msg, date] of commits) {
    git(app, ["add", "-A"], date);
    git(app, ["commit", "-q", "--allow-empty", "-m", msg], date);
  }
  return { app, db: dbPath };
}
