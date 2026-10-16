/**
 * Captures the screenshots that `scripts/capture_app_screenshots.ts` does not cover, into screenshots/apps/:
 *
 *   bun run scripts/capture_extra_screenshots.ts                 everything below
 *   bun run scripts/capture_extra_screenshots.ts file_manager    only the File Manager (the pictures in its guide)
 *   bun run scripts/capture_extra_screenshots.ts redis           Redis Studio on demo keys (only when asked; needs an empty database 14)
 *   bun run scripts/capture_extra_screenshots.ts code_studio snake_studio
 *
 * Three ways of getting a page, depending on the app:
 *   - pages built by `createXxxStudio().generateHtml()` (Code Studio, Paint, PostgreSQL, RAD Studio, the Subprocess
 *     Pipe studio and the games that have such a function) are written to a temporary file;
 *   - the games that only have a resources folder are served by a small local server;
 *   - the File Manager is started on a throw-away sample home folder (so none of your own files appear) and driven
 *     through Chrome's DevTools protocol, to show a selected picture, the Convert window and the terminal.
 *
 * Needs Google Chrome (path below). Desktop shots are the app's window size; responsive shots are 960 wide.
 */
process.env.SCREENSHOT_MODE = "1";

import { spawn, spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "screenshots", "apps");
const work = mkdtempSync(join(tmpdir(), "shots-"));
mkdirSync(OUT, { recursive: true });

if (!existsSync(CHROME)) {
  console.error(`Google Chrome was not found at ${CHROME}. Set CHROME_BIN to its path.`);
  process.exit(1);
}

interface Target { name: string; mode: "html" | "static"; module?: string; factory?: string; resources?: string; width?: number; height?: number; /** Changes the page before it is photographed (to remove a start-up dialog, say). */ post?: (html: string) => string }

/** Keeps an element (a start-up dialog the app raises a moment after loading) out of the picture. */
const hiding = (id: string) => (html: string) => {
  // The first </head> is the real one; a page's own script may contain the text "</head>" later on.
  const at = html.indexOf("</head>");
  const style = `<style>#${id}{display:none !important}</style>`;
  return at < 0 ? style + html : html.slice(0, at) + style + html.slice(at);
};

/** `name` is the file prefix: studios use their full name, games the short one (as the existing screenshots do). */
const TARGETS: Target[] = [
  { name: "code_studio", mode: "html", module: "code_studio", factory: "createCodeStudio" },
  { name: "paint_studio", mode: "html", module: "paint_studio", factory: "createPaintStudio" },
  { name: "postgres_studio", mode: "html", module: "postgres_studio", factory: "createPostgresStudio", post: hiding("macroMsgBoxModal") },
  { name: "rad_studio", mode: "html", module: "rad_studio", factory: "createRadStudio" },
  { name: "subprocess_pipe_studio", mode: "html", module: "subprocess_pipe_studio", factory: "createSubprocessPipeStudio" },
  { name: "balatro", mode: "html", module: "balatro_studio", factory: "createBalatroStudio" },
  { name: "blackjack", mode: "html", module: "blackjack_studio", factory: "createBlackjackStudio" },
  { name: "breakout", mode: "html", module: "breakout_studio", factory: "createBreakoutStudio" },
  { name: "flappy_bird", mode: "html", module: "flappy_bird_studio", factory: "createFlappyBirdStudio" },
  { name: "math_munchers", mode: "html", module: "math_munchers_studio", factory: "createMathMunchersStudio" },
  { name: "minesweeper", mode: "html", module: "minesweeper_studio", factory: "createMinesweeperStudio" },
  { name: "poker", mode: "html", module: "poker_studio", factory: "createPokerStudio" },
  { name: "rat_screw", mode: "html", module: "rat_screw_studio", factory: "createRatScrewStudio" },
  { name: "skifree", mode: "html", module: "skifree_studio", factory: "createSkiFreeStudio" },
  { name: "yahtzee", mode: "html", module: "yahtzee_studio", factory: "createYahtzeeStudio" },
  { name: "frogger", mode: "static", resources: "frogger_studio", width: 1000, height: 800 },
  { name: "snake", mode: "static", resources: "snake_studio", width: 1000, height: 800 },
  { name: "tetris", mode: "static", resources: "tetris_studio", width: 1000, height: 800 },
  { name: "typing", mode: "static", resources: "typing_studio", width: 1100, height: 800 },
];

/** Runs Chrome without blocking this process, so a local server started by this script can still answer it. */
async function chromeShot(url: string, out: string, width: number, height: number) {
  const profile = join(work, "profile");
  const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--user-data-dir=${profile}`, "--virtual-time-budget=3000", `--screenshot=${out}`, `--window-size=${width},${height}`, url], { stdio: "ignore" });
  const timer = setTimeout(() => child.kill(), 60000);
  await new Promise((resolve) => child.once("exit", resolve));
  clearTimeout(timer);
  if (!existsSync(out)) console.warn(`  ! Chrome did not produce ${out}`);
}

async function both(name: string, url: string, width: number, height: number) {
  await chromeShot(url, join(OUT, `${name}_desktop.png`), width, height);
  const respH = Math.max(720, Math.round(height * (960 / width)));
  await chromeShot(url, join(OUT, `${name}_responsive.png`), 960, respH);
  const size = existsSync(join(OUT, `${name}_desktop.png`)) ? (Bun.file(join(OUT, `${name}_desktop.png`)).size / 1024).toFixed(0) : "0";
  console.log(`  ✔ ${name}: desktop ${width}x${height} (${size} KB) and responsive`);
}

async function captureHtml(t: Target) {
  const mod: any = await import(join(ROOT, "applications", `${t.module}.ts`));
  const app = mod[t.factory!]({});
  const html: string = t.post ? t.post(app.generateHtml()) : app.generateHtml();
  const file = join(work, `${t.name}.html`);
  writeFileSync(file, html, "utf8");
  await both(t.name, `file://${file}`, app.width || 1200, app.height || 850);
}

async function captureStatic(t: Target) {
  const dir = join(ROOT, "resources", t.resources!);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const p = new URL(req.url).pathname;
      const file = join(dir, p === "/" ? "index.html" : p);
      return file.startsWith(dir) && existsSync(file) ? new Response(Bun.file(file)) : new Response("Not Found", { status: 404 });
    },
  });
  try {
    await both(t.name, `http://127.0.0.1:${server.port}/`, t.width ?? 1000, t.height ?? 800);
  } finally {
    server.stop(true);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The File Manager, on a sample home folder
// ---------------------------------------------------------------------------------------------------------------

function tool(name: string): string | null {
  for (const dir of ["/opt/homebrew/opt/imagemagick-full/bin", "/opt/homebrew/opt/ffmpeg-full/bin", "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]) if (existsSync(join(dir, name))) return join(dir, name);
  return null;
}

function makeSampleHome(): { home: string; data: string } {
  // A short, tidy path so the address bar and the terminal prompt look natural in the pictures.
  const base = join("/tmp", "demo");
  rmSync(base, { recursive: true, force: true });
  const home = base;
  const data = join(work, "data");
  for (const d of ["Pictures/Trip to Italy", "Documents/Taxes", "Music", "Videos", "Downloads", "Desktop"]) mkdirSync(join(home, d), { recursive: true });
  mkdirSync(data, { recursive: true });
  const magick = tool("magick");
  const ffmpeg = tool("ffmpeg");
  const picture = (name: string, gradient: string, size = "1200x800") => {
    const out = join(home, "Pictures", name);
    if (magick) spawnSync(magick, ["-size", size, gradient, out]);
    else writeFileSync(out, "");
  };
  picture("Sunset over the bay.jpg", "gradient:#ff7e5f-#3a1c71");
  picture("Mountain lake.png", "gradient:#2c5364-#a8e063");
  picture("Beach morning.jpg", "gradient:#2193b0-#ffe9a8");
  picture("Forest path.png", "gradient:#134e5e-#71b280");
  picture("City lights.jpg", "gradient:#141e30-#f2c94c");
  picture("Portrait.jpg", "gradient:#bc4e9c-#f80759", "800x1100");
  if (magick) for (const n of ["Colosseum.jpg", "Venice canal.jpg"]) spawnSync(magick, ["-size", "1000x700", "gradient:#355c7d-#f67280", join(home, "Pictures", "Trip to Italy", n)]);
  const text = (rel: string, body: string) => writeFileSync(join(home, rel), body);
  text("Documents/Project notes.md", "# Project notes\n\n- Plan the launch\n- Write the guide\n- Ask for feedback\n");
  text("Documents/Meeting minutes.txt", "Attendees: Alex, Sam, Priya\n\nDecisions:\n1. Ship on Friday.\n2. Review the budget.\n");
  text("Documents/Budget 2026.csv", "Item,Cost\nHosting,240\nDomain,15\nDesign,600\n");
  text("Documents/Taxes/Receipts.txt", "Receipts for 2026 go here.\n");
  text("Downloads/installer-notes.txt", "Read me first.\n");
  if (ffmpeg) {
    spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", join(home, "Music", "Morning melody.mp3")]);
    spawnSync(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "testsrc=duration=2:size=640x360:rate=24", "-pix_fmt", "yuv420p", join(home, "Videos", "Holiday clip.mp4")]);
  }
  writeFileSync(join(data, "file_manager.json"), JSON.stringify({
    favorites: [join(home, "Pictures"), join(home, "Documents")], recents: [], view: "details", sortBy: "name", sortDir: "asc", foldersFirst: true,
    showHidden: false, showInfoPanel: true, theme: "dark", textSize: 100, lastPath: join(home, "Pictures"), seenWelcome: true,
  }));
  return { home, data };
}

class Cdp {
  private id = 0;
  private waiting = new Map<number, (v: any) => void>();
  constructor(private ws: WebSocket) {
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id && this.waiting.has(m.id)) { this.waiting.get(m.id)!(m); this.waiting.delete(m.id); }
    };
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression: string): Promise<any> {
    // The page may reload once while it starts (new context), so try again a few times.
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`);
        return r.result?.value;
      } catch (err: any) {
        if (attempt < 20 && /context was destroyed|Cannot find context/i.test(String(err?.message))) { await sleep(500); continue; }
        throw err;
      }
    }
  }
  async shot(file: string) {
    await this.eval("document.querySelector('#toasts')?.replaceChildren()");
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(r.data, "base64"));
  }
  async size(width: number, height: number) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function captureFileManager() {
  const { home, data } = makeSampleHome();
  const server = spawn(process.execPath, [join(ROOT, "applications", "file_manager_studio.ts"), "--server", "--port", "0", "--home", home, "--data-dir", data, "--path", join(home, "Pictures")], { stdio: ["ignore", "pipe", "ignore"] });
  let port = 0;
  const reader = (server.stdout as any as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
  for (let text = ""; !port;) {
    const { value, done } = await reader.next();
    if (done) break;
    text += value.toString();
    port = Number(/READY:(\d+)/.exec(text)?.[1] ?? 0);
  }
  if (!port) throw new Error("The File Manager server did not start.");

  const debugPort = 9333;
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${join(work, "fm-profile")}`, "--window-size=1280,820", `http://127.0.0.1:${port}/`], { stdio: "ignore" });
  try {
    let target: any;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        const list = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as any[];
        target = list.find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1"));
      } catch { /* Chrome is still starting */ }
    }
    if (!target) throw new Error("Chrome's debugging port did not answer.");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r as any));
    const page = new Cdp(ws);
    await page.send("Page.enable");
    await page.size(1280, 820);
    await page.eval("new Promise(r => { const t = setInterval(() => { if (document.body.classList.contains('ready')) { clearInterval(t); r(true); } }, 100); })");
    await sleep(800);

    const click = (name: string, meta = false) => page.eval(`(() => { const r = [...document.querySelectorAll('#list .row')].find(r => r.querySelector('.name-text')?.textContent === ${JSON.stringify(name)}); r.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: ${meta} })); })()`);

    // 1. A picture selected, with the details panel showing its preview.
    await click("Sunset over the bay.jpg");
    await sleep(1200);
    await page.shot(join(OUT, "file_manager_studio_desktop.png"));
    await page.size(960, 720);
    await sleep(500);
    await page.shot(join(OUT, "file_manager_studio_responsive.png"));
    await page.size(1280, 900);
    await sleep(400);

    // 2. The Convert window for three pictures.
    await click("Sunset over the bay.jpg");
    await click("Mountain lake.png", true);
    await click("Beach morning.jpg", true);
    await page.eval("document.querySelector('#tool-tools').click()");
    await page.eval("new Promise(r => { const t = setInterval(() => { if (document.querySelector('.dialog.wide') && document.querySelector('.dialog.wide').textContent.includes('What do you want to turn')) { clearInterval(t); r(true); } }, 100); })");
    await sleep(1500);
    await page.shot(join(OUT, "file_manager_studio_convert.png"));
    await page.eval("[...document.querySelectorAll('.dialog button')].find(b => b.textContent === 'Close')?.click()");
    await sleep(300);

    // 3. The Databases tool, opened from its own toolbar button. The screenshot machine's own .env files are put aside so
    // only the Redis found on this computer is left.
    await page.eval("document.querySelector('#tool-databases').click()");
    await page.eval("new Promise(r => { const t = setInterval(() => { if (document.querySelector('#power-panel') && !document.querySelector('#power-panel').hidden && document.querySelector('.db-row')) { clearInterval(t); r(true); } }, 100); })");
    await sleep(800);
    await page.eval("[...document.querySelectorAll('#power-panel button')].filter(b => b.textContent === 'Not now').forEach(b => b.click())");
    await sleep(600);
    await page.eval("document.querySelector('#power-panel .db-row')?.click()");
    await page.eval("document.querySelector('#toasts')?.replaceChildren()");
    await sleep(1200);
    await page.shot(join(OUT, "file_manager_studio_databases.png"));
    await page.eval("document.querySelector('#tool-power')?.click()");
    await sleep(500);

    // 4. The terminal, started in the folder on screen.
    await page.eval("document.querySelector('#tool-terminal').click()");
    await sleep(2500);
    await page.eval("document.querySelector('.xterm-helper-textarea')?.focus()");
    await page.send("Input.insertText", { text: "ls" });
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await sleep(1200);
    await page.shot(join(OUT, "file_manager_studio_terminal.png"));
    ws.close();
    console.log("  ✔ file_manager_studio: desktop, responsive, convert, databases and terminal");
  } finally {
    chrome.kill();
    server.kill();
    rmSync(join("/tmp", "demo"), { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Redis Studio, on a few demo keys in database 14 of the Redis on this computer
// ---------------------------------------------------------------------------------------------------------------

/** Shows the hash editor of a live Redis Studio. Only `demo:*` keys are written, and only in an empty database 14; they are deleted again. */
async function captureRedis() {
  const { RedisClient } = await import("bun");
  const { startRedisStudioServer } = await import(join(ROOT, "applications", "redis_studio_server.ts"));
  const redis = new RedisClient("redis://127.0.0.1:6379");
  try {
    await redis.ping();
  } catch {
    console.warn("  ! no Redis on 127.0.0.1:6379, so the live Redis Studio picture was skipped (the static one stays)");
    return;
  }
  await redis.send("SELECT", ["14"]);
  if (Number(await redis.send("DBSIZE", [])) !== 0) {
    console.warn("  ! database 14 is not empty, so the live Redis Studio picture was skipped");
    redis.close();
    return;
  }
  const studio = startRedisStudioServer({ port: 0, url: "redis://127.0.0.1:6379", db: 14 });
  const post = (path: string, body: object) => fetch(`${studio.url}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const cli = (command: string) => post("/api/cli", { command });
  const debugPort = 9334;
  let chrome: ReturnType<typeof spawn> | undefined;
  try {
    for (const c of [
      "HSET demo:user:1001 name Ada email ada@example.com plan pro seats 5 country UK",
      "HSET demo:user:1002 name Grace email grace@example.com plan team seats 12 country US",
      "RPUSH demo:queue:emails welcome-1001 reset-1002 invoice-1003",
      "SADD demo:tags redis bun typescript",
      "ZADD demo:leaders 4200 ada 3900 grace 3100 linus",
      "SET demo:greeting hello EX 3600",
    ]) await cli(c);

    chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${join(work, "redis-profile")}`, "--window-size=1280,860", studio.url], { stdio: "ignore" });
    let target: any;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        const list = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()) as any[];
        target = list.find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1"));
      } catch { /* Chrome is still starting */ }
    }
    if (!target) throw new Error("Chrome's debugging port did not answer.");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r as any));
    const page = new Cdp(ws);
    await page.send("Page.enable");
    const pick = async (key: string) => { await page.eval(`selectKey(${JSON.stringify(key)})`); await sleep(900); };
    const mark = (cls: string, value: string) => page.eval(`(() => { const el = document.querySelector(${JSON.stringify(cls)}); if (el) { el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);

    await page.size(1280, 860);
    await sleep(2500);
    await page.eval("refreshAll()");
    await sleep(1200);
    await pick("demo:user:1001");
    await page.shot(join(OUT, "redis_studio_desktop.png"));
    await page.size(960, 760);
    await sleep(600);
    await page.shot(join(OUT, "redis_studio_responsive.png"));
    await page.size(1280, 860);
    await sleep(400);
    await pick("demo:leaders");
    await mark('.zset-score-input[data-idx="2"]', "4800");
    await page.shot(join(OUT, "redis_studio_editing.png"));
    ws.close();
    console.log("  ✔ redis_studio: desktop and responsive (hash editor) and editing (sorted set)");
  } finally {
    chrome?.kill();
    await post("/api/keys/delete-pattern", { pattern: "demo:*" }).catch(() => {});
    studio.close();
    redis.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const wants = (name: string) => wanted.length === 0 || wanted.includes(name) || wanted.includes(name.replace(/_studio$/, ""));

console.log(`📸 Capturing into ${OUT}\n`);
try {
  for (const t of TARGETS) {
    if (!wants(t.name)) continue;
    console.log(`[${t.name}]`);
    try {
      if (t.mode === "html") await captureHtml(t);
      else await captureStatic(t);
    } catch (err: any) {
      console.warn(`  ! ${t.name} failed: ${err?.message ?? err}`);
    }
  }
  if (wants("file_manager") || wants("file_manager_studio")) {
    console.log("[file_manager_studio]");
    await captureFileManager().catch((err) => console.warn(`  ! file_manager_studio failed: ${err?.message ?? err}`));
  }
  if (wanted.includes("redis") || wanted.includes("redis_studio")) {
    console.log("[redis_studio]");
    await captureRedis().catch((err) => console.warn(`  ! redis_studio failed: ${err?.message ?? err}`));
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(0);
