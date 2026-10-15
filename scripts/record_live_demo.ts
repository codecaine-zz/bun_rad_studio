// Records the real Codecaine File Manager UI (headless Chrome + visible cursor) as one live clip per scene,
// each trimmed/held to the exact length of that scene's narration.
//
//   bun scripts/record_live_demo.ts                 record every scene
//   bun scripts/record_live_demo.ts 03_files,04_dual   record only those scenes
//   bun scripts/record_live_demo.ts --shots 03_files    also save PNG checkpoints under scratch/shots
import { join } from "path";
import { existsSync, mkdirSync, rmSync } from "fs";
import { Cdp, sleep } from "./lib/cdp_recorder";
import { seedDemoWorkspace } from "./lib/demo_workspace";

const ROOT = process.cwd();
const PROD = join(ROOT, "youtube_production");
const LIVE_DIR = join(PROD, "live");
const AUDIO_DIR = join(PROD, "audio");
const SHOTS = join(ROOT, "scratch", "shots");
const HOME = "/tmp/cc_home";
const DATA = "/tmp/cc_data";
const GRAVE = "/tmp/cc_grave";
const PORT = 51299;
const URL = `http://127.0.0.1:${PORT}/`;
const FFPROBE = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";

const args = process.argv.slice(2);
const wantShots = args.includes("--shots");
const only = (args.find((a) => !a.startsWith("--")) ?? "").split(",").filter(Boolean);

type Page = Cdp;
interface Scene {
  id: string;
  /** Un-recorded setup that puts the app in the scene's starting state. */
  prepare?: (c: Page) => Promise<void>;
  /** The recorded actions. `dur` is the narration length in seconds. */
  run: (c: Page, dur: number) => Promise<void>;
}

const app = `${HOME}/Projects/shop-app`;

/** Click a control immediately, without the animated cursor (for un-recorded setup). */
async function quick(c: Page, js: string) {
  await c.eval(js);
  await sleep(500);
}
const goView = (c: Page, v: string) => quick(c, `document.querySelector('#view-${v}').click()`);
const goTool = async (c: Page, t: string) => {
  await goView(c, "tools");
  await quick(c, `document.querySelector('#power-tab-${t}').click()`);
  await sleep(500);
};

/** Type a path into the address bar (un-recorded setup). */
async function goFolder(c: Page, path: string) {
  await goView(c, "files");
  await c.click("#edit-address", { ms: 120, pause: 300 });
  await c.key("Meta+a", "⌘ A");
  await c.type(path, 4);
  await c.key("Enter", "Enter");
  await sleep(700);
}

/** Wait until `startedAt + seconds` so a scene fills (but does not exceed) its narration. */
const until = async (t0: number, seconds: number) => {
  const left = seconds * 1000 - (performance.now() - t0);
  if (left > 0) await sleep(left);
};

const shot = async (c: Page, name: string) => { if (wantShots) { await sleep(300); await c.screenshot(join(SHOTS, `${name}.png`)); } };
const tab = (c: Page, id: string, pause = 700) => c.click(`#power-tab-${id}`, { pause });
const pane = (id: string) => `#power-pane-${id}`;
const DEMO_PASSWORD = "Demo-Passphrase-2026!";

const scenes: Scene[] = [
  {
    id: "01_install",
    prepare: async (c) => { await goView(c, "files"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(800);
      await c.click("#tool-terminal", { pause: 1800 });
      await c.click("#terminal-host", { pause: 300 });
      const line = async (cmd: string, wait: number, per = 70) => { await c.type(cmd, per); await sleep(250); await c.key("Enter", "Enter"); await sleep(wait); };
      await line("cd ../starter && cat package.json", 1800);
      await line("bun install", 4500);
      await shot(c, "01_a");
      await line("bun --version", 1500);
      await line("echo 'bun run app:files'", 2200);
      await c.click("#terminal-close", { pause: 800 });
      await c.click("#view-home", { pause: 800 });
      await until(t0, dur);
    },
  },
  {
    id: "02_home",
    prepare: async (c) => { await goView(c, "files"); await goView(c, "home"); await sleep(600); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(900);
      await c.hover(".home-tile >> Browse files", 900);
      await c.hover(".home-tile >> Two folders", 900);
      await c.hover(".home-tile >> Find", 900);
      await c.hover(".home-tile >> Graveyard", 900);
      await c.click("#home input", { pause: 400 });
      await c.type("crypto", 120);
      await sleep(1500);
      await shot(c, "02_a");
      await until(t0, dur);
    },
  },
  {
    id: "03_files",
    prepare: async (c) => { await goView(c, "files"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(600);
      await c.dblclick("#list .row >> docs");
      await c.click("#list .row >> notes.md", { pause: 400 });
      await c.click("#tool-info", { pause: 1500 });
      await shot(c, "03_a");
      await c.click("#tool-info", { pause: 500 });
      await c.click("#tool-up", { pause: 600 });
      await c.click('.status-view[data-view="icons"]', { pause: 1100 });
      await c.click('.status-view[data-view="list"]', { pause: 900 });
      await c.click('.status-view[data-view="details"]', { pause: 700 });
      await c.click("#search", { pause: 300 });
      await c.type("*.ts", 90);
      await c.key("Enter", "Enter");
      await sleep(1500);
      await shot(c, "03_b");
      await c.click("button >> Clear search", { pause: 600 });
      await until(t0, dur);
    },
  },
  {
    id: "04_dual",
    prepare: async (c) => { await goView(c, "files"); await goFolder(c, app); await goView(c, "dual"); await sleep(600); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.dblclick("#dual-list .row >> Desktop", { pause: 500 });
      await c.dblclick("#dual-list .row >> Backup", { pause: 600 });
      await c.click("#list .row >> app.js", { pause: 500 });
      await c.key("F5", "F5");
      await sleep(1100);
      await c.click("#list .row >> style.css", { pause: 500 });
      await c.key("F6", "F6");
      await sleep(1300);
      await shot(c, "04_a");
      await c.key("Meta+z", "⌘ Z");
      await sleep(1200);
      await shot(c, "04_b");
      await until(t0, dur);
    },
  },
  {
    id: "05_split",
    prepare: async (c) => { await goView(c, "files"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.click("#view-split", { pause: 700 });
      await tab(c, "find", 500);
      await c.click(`${pane("find")} input >> @Part of a name`, { pause: 200 });
      await c.type("js", 90);
      await c.click(`${pane("find")} button >> 🔍 Find`, { pause: 900 });
      await shot(c, "05_a");
      await c.click("#split-orient", { pause: 1100 });
      await shot(c, "05_b");
      await c.click("#split-orient", { pause: 900 });
      await c.drag("#splitter", -260, 0, 600);
      await sleep(500);
      await shot(c, "05_c");
      await until(t0, dur);
    },
  },
  {
    id: "06_code",
    prepare: async (c) => { await goTool(c, "code"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.click(".code-tn >> app.js", { pause: 600 });
      await c.click(".code-ta", { dy: 160, pause: 300 });
      await c.type("\n\nconst tax = (n) => n * 1.08;\nconsole.log(tax(total(products)));", 22);
      await sleep(400);
      await shot(c, "06_a");
      await c.click(".code-tn >> README.md", { pause: 700 });
      await c.click(".code-btn >> Preview", { pause: 1400 });
      await shot(c, "06_b");
      await c.click(".code-tn >> app.js", { pause: 700 });
      await c.click(".code-btn >> Find", { pause: 500 });
      await c.type("total", 100);
      await sleep(900);
      await shot(c, "06_c");
      await until(t0, dur);
    },
  },
  {
    id: "07_dev",
    prepare: async (c) => { await goTool(c, "dev"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.click(`${pane("dev")} button >> Use current folder`, { pause: 500 });
      await c.click(`${pane("dev")} button >> Count code`, { pause: 1800 });
      await shot(c, "07_a");
      await c.scroll("#power-body", 420, 8);
      await sleep(700);
      await c.scroll("#power-body", -420, 8);
      await c.click("#dev-tab-git", { pause: 500 });
      await c.click(`${pane("dev")} button >> Read Git history`, { pause: 2200 });
      await shot(c, "07_b");
      await c.click("#dev-tab-todo", { pause: 500 });
      await c.click(`${pane("dev")} button >> Find markers`, { pause: 2000 });
      await shot(c, "07_c");
      await until(t0, dur);
    },
  },
  {
    id: "08_database",
    prepare: async (c) => {
      await goTool(c, "databases");
      await c.click(`${pane("databases")} button >> Add connection`, { ms: 150, pause: 400 });
      await c.click("[role=menuitem] >> SQLite", { ms: 150, pause: 600 });
      await c.type("Shop analytics", 15);
      await c.click("#overlay input >> @/Users/you/data.sqlite", { ms: 150, pause: 200 });
      await c.type(`${app}/data/shop.sqlite`, 8);
      await c.click("#overlay button >> Save", { ms: 150, pause: 1200 });
    },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(900);
      await c.click(`${pane("databases")} button >> Open in SQLite Studio`, { pause: 500 });
      const frame = `${pane("databases")} iframe ||| iframe |||`;
      await c.waitFor(`${frame} button >> OK`, 20000);
      await sleep(600);
      await c.click(`${frame} button >> OK`, { pause: 800 });
      await c.click(`${frame} .tree-item-title >> orders`, { pause: 1200 });
      await c.click(`${frame} #sqlEditor`, { pause: 300 });
      await c.key("Meta+a", "⌘ A");
      await c.type("SELECT c.name, ROUND(SUM(o.qty * p.price), 2) AS revenue FROM orders o JOIN customers c ON c.id = o.customer_id JOIN products p ON p.id = o.product_id GROUP BY c.name ORDER BY revenue DESC;", 6);
      await sleep(400);
      await c.click(`${frame} button >> Execute`, { pause: 1500 });
      await shot(c, "08_a");
      await until(t0, dur);
    },
  },
  {
    id: "09_secrets",
    prepare: async (c) => {
      await goTool(c, "secrets");
      await c.click("#vault-pw-1", { ms: 150, pause: 200 });
      await c.type(DEMO_PASSWORD, 8);
      await c.click("#vault-pw-1-again", { ms: 150, pause: 200 });
      await c.type(DEMO_PASSWORD, 8);
      await sleep(1200);
      await c.click(`${pane("secrets")} button >> Create my vault`, { ms: 150, pause: 500 });
      if (!(await c.waitFor("#overlay button >> Continue", 120000))) throw new Error("the vault was not created");
      await c.click("#overlay input", { ms: 150, pause: 300 });
      await c.click("#overlay button >> Continue", { ms: 150, pause: 2500 });
      await c.click("#overlay button >> Close", { ms: 150, pause: 600 });
    },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(600);
      await c.click(`${pane("secrets")} button >> New item`, { pause: 500 });
      await c.click("[role=menuitem] >> Login", { pause: 700 });
      await c.click("#sx-f1-title", { pause: 200 });
      await c.type("GitHub", 60);
      await c.click("#sx-f1-username", { pause: 200 });
      await c.type("alex@example.com", 40);
      await c.click(`${pane("secrets")} button >> Generate`, { pause: 800 });
      await c.click("#sx-f1-url", { pause: 200 });
      await c.type("https://github.com", 35);
      await c.click("#sx-f1-totp", { pause: 200 });
      await c.type("JBSWY3DPEHPK3PXP", 40);
      await shot(c, "09_a");
      await c.click(`${pane("secrets")} button >> Save`, { pause: 1800 });
      await shot(c, "09_b");
      await until(t0, dur);
    },
  },
  {
    id: "10_crypto",
    prepare: async (c) => { await goTool(c, "crypto"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.click("#crypto-text-1", { pause: 300 });
      await c.key("Meta+a", "⌘ A");
      await c.type("Codecaine File Manager v1.4.2", 55);
      await c.click(`${pane("crypto")} button >> Calculate hashes`, { pause: 1500 });
      await shot(c, "10_a");
      await c.scroll("#power-body", 700, 10);
      await sleep(900);
      await c.scroll("#power-body", 700, 10);
      await sleep(600);
      await c.click(`${pane("crypto")} button >> Generate password`, { pause: 1200 });
      await shot(c, "10_b");
      await until(t0, dur);
    },
  },
  {
    id: "11_serve",
    prepare: async (c) => { await goTool(c, "serve"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(600);
      await c.click(`${pane("serve")} button >> Use the folder I'm looking at`, { pause: 500 });
      await c.click(`${pane("serve")} label >> Open my browser when it starts`, { pause: 500 });
      await c.click(`${pane("serve")} button >> Start server`, { pause: 2500 });
      await shot(c, "11_a");
      for (const path of ["/", "/style.css", "/app.js"]) await fetch(`http://127.0.0.1:5500${path}`).then((r) => r.text()).catch(() => {});
      await c.click(`${pane("serve")} button >> Show log`, { pause: 1800 });
      await shot(c, "11_b");
      await until(t0, dur);
    },
  },
  {
    id: "12_net",
    prepare: async (c) => { await goTool(c, "ip"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.click(`${pane("ip")} input.ip-target`, { pause: 300 });
      await c.type("10.20.30.0/24", 70);
      await c.click(`${pane("ip")} button >> Subnet calculator`, { pause: 1500 });
      await shot(c, "12_a");
      await c.click(`${pane("ip")} button >> Split block`, { pause: 1500 });
      await tab(c, "net", 800);
      await c.click(`${pane("net")} button >> Localhost`, { pause: 500 });
      await c.click(`${pane("net")} button >> Scan common ports`, { pause: 2500 });
      await shot(c, "12_b");
      await until(t0, dur);
    },
  },
  {
    id: "13_subs",
    prepare: async (c) => { await goTool(c, "subs"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.click(`${pane("subs")} input >> @example.com`, { pause: 300 });
      await c.type("example.com", 70);
      await c.click(`${pane("subs")} button >> Find subdomains`, { pause: 500 });
      await sleep(6000);
      await shot(c, "13_a");
      await c.scroll("#power-body", 700, 10);
      await sleep(1200);
      await shot(c, "13_b");
      await until(t0, dur);
    },
  },
  {
    id: "14_grave",
    prepare: async (c) => { await goView(c, "files"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.rclick("#list .row >> to-delete", { pause: 800 });
      await c.click(".menu .menu-item >> Bury (Rip)", { pause: 1500 });
      await shot(c, "14_a");
      await c.key("Meta+z", "⌘ Z");
      await sleep(1100);
      await c.rclick("#list .row >> to-delete", { pause: 800 });
      await c.click(".menu .menu-item >> Bury (Rip)", { pause: 1200 });
      await c.click("#tool-power", { pause: 800 });
      await tab(c, "grave", 1500);
      await shot(c, "14_b");
      await c.click(`${pane("grave")} button.grave-name >> to-delete`, { pause: 1300 });
      await c.click(`${pane("grave")} button >> Verify`, { pause: 1500 });
      await shot(c, "14_c");
      await until(t0, dur);
    },
  },
  {
    id: "15_find",
    prepare: async (c) => { await goTool(c, "find"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(400);
      await c.click(`${pane("find")} input >> @Part of a name`, { pause: 200 });
      await c.type("\\.md$", 60);
      await c.click(`${pane("find")} button >> 🔍 Find`, { pause: 1300 });
      await shot(c, "15_a");
      await tab(c, "sd", 700);
      await c.click(`${pane("sd")} input >> @function (`, { pause: 200 });
      await c.type("oldshop.example.com", 25);
      await c.click(`${pane("sd")} input >> @function $1Sync`, { pause: 200 });
      await c.type("shop.example.com", 25);
      await c.click(`${pane("sd")} button >> Use the open folder`, { pause: 400 });
      await c.click(`${pane("sd")} button >> Preview changes`, { pause: 1800 });
      await c.click(`${pane("sd")} button.sd-file >> deploy.md`, { pause: 1500 });
      await shot(c, "15_b");
      await until(t0, dur);
    },
  },
  {
    id: "16_cyberpunk",
    prepare: async (c) => { await goView(c, "files"); },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.click("#tool-settings", { pause: 700 });
      await c.click("#overlay button >> Choose a theme", { pause: 800 });
      await c.click("#overlay input >> @Search themes", { pause: 200 });
      await c.type("cyber", 120);
      await sleep(600);
      await c.click(".theme-card >> Cyberpunk Hologram", { pause: 1500 });
      await shot(c, "16_a");
      await c.click("#overlay input >> @Search themes", { pause: 200 });
      await c.key("Meta+a", "⌘ A");
      await c.type("neon", 120);
      await sleep(500);
      await c.click(".theme-card >> Neon HUD", { pause: 1500 });
      await shot(c, "16_b");
      await until(t0, dur);
    },
  },
  {
    id: "17_sonoma",
    prepare: async (c) => {
      await goView(c, "files");
      await c.click("#tool-settings", { ms: 150, pause: 600 });
      await c.click("#overlay button >> Choose a theme", { ms: 150, pause: 800 });
    },
    run: async (c, dur) => {
      const t0 = performance.now();
      await sleep(500);
      await c.click("#overlay input >> @Search themes", { pause: 200 });
      await c.key("Meta+a", "⌘ A");
      await c.type("sonoma", 120);
      await sleep(600);
      await c.click(".theme-card >> Sonoma Emerald", { pause: 1500 });
      await shot(c, "17_a");
      await c.click("#overlay button >> Create or edit a theme", { pause: 1800 });
      await shot(c, "17_b");
      await until(t0, dur);
    },
  },
];

async function audioSeconds(id: string): Promise<number> {
  const file = join(AUDIO_DIR, `narration_${id}.mp3`);
  const p = Bun.spawnSync([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(p.stdout.toString()) || 15;
}

async function startServer() {
  seedDemoWorkspace(HOME, join(PROD, "frames"));
  rmSync(DATA, { recursive: true, force: true });
  rmSync(GRAVE, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  // Start from a folder with no .env so no real connection details are ever picked up.
  const proc = Bun.spawn(
    [process.execPath, join(ROOT, "applications", "file_manager_studio.ts"), "--server", "--port", String(PORT), "--home", HOME, "--data-dir", DATA, "--path", app],
    { cwd: "/tmp", stdout: "ignore", stderr: "ignore", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", GRAVEYARD: GRAVE } },
  );
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL)).ok) return proc; } catch {}
    await sleep(250);
  }
  throw new Error("file manager server did not start");
}

/** Dismiss dialogs, toasts and the terminal left over from the previous scene. */
async function closeLeftovers(c: Page) {
  await quick(c, `(() => {
    const o = document.querySelector('#overlay');
    if (o && o.children.length) {
      const b = [...o.querySelectorAll('button')].find((x) => /^(Done|Close|Cancel|OK)$/.test(x.textContent.trim()));
      b ? b.click() : document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    document.querySelectorAll('.toast .toast-close').forEach((b) => b.click());
    document.querySelector('#terminal-close')?.click();
  })()`);
  await sleep(300);
}

async function firstRunSetup(c: Page) {
  await c.goto(URL);
  await quick(c, `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`);
  await goTool(c, "databases");
  await quick(c, `(() => { const a = document.querySelector('#db-detect-auto'); if (a && a.checked) a.click(); })()`);
  await quick(c, `document.querySelectorAll('#toasts button, .toast button').forEach(b => b.click())`);
  await goView(c, "files");
}

async function main() {
  mkdirSync(LIVE_DIR, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  const server = await startServer();
  const c = await Cdp.launch(9333, "/tmp/cc_chrome_rec");
  try {
    await firstRunSetup(c);
    for (const sc of scenes) {
      if (only.length && !only.includes(sc.id)) continue;
      const dur = await audioSeconds(sc.id);
      console.log(`🎬 ${sc.id} (${dur.toFixed(1)}s of narration)`);
      await closeLeftovers(c);
      await goFolder(c, app);
      await sc.prepare?.(c);
      await c.startRecording();
      const t0 = performance.now();
      let err: unknown;
      try { await sc.run(c, dur); } catch (e) { err = e; }
      const took = (performance.now() - t0) / 1000;
      if (wantShots) await c.screenshot(join(SHOTS, `${sc.id}_end.png`));
      const out = join(LIVE_DIR, `live_${sc.id}.mp4`);
      const r = await c.stopRecording(out, join(LIVE_DIR, `_work_${sc.id}`), dur);
      console.log(`   actions took ${took.toFixed(1)}s, ${r.frames} frames → ${out.replace(ROOT + "/", "")}${r.speed > 1 ? `  (sped up ${r.speed.toFixed(2)}x to fit)` : ""}${r.speed >= 1.35 && took > dur * 1.35 ? "  ⚠ still too long: tail trimmed" : ""}`);
      if (err) throw err;
    }
  } finally {
    c.close();
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
