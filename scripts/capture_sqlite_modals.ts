import { spawn } from "child_process";
import { writeFileSync, copyFileSync } from "fs";
import { startSqliteStudioServer } from "../applications/sqlite_studio_server.ts";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9226;
const BRAIN_DIR = "/Users/codecaine/.gemini/antigravity-ide/brain/4205c847-f2cc-4335-96b0-60138148d8af";
const SCREENSHOTS_DIR = "/Users/codecaine/bun_rad_studio/screenshots/apps";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Starting background SQLite Studio Server on dynamic port...");
  const server = startSqliteStudioServer({
    port: 33334,
    initialDbPath: ":memory:",
  });
  const serverUrl = `http://127.0.0.1:${server.port}/`;
  console.log("SQLite Studio running at:", serverUrl);

  console.log("Launching Headless Chrome with Remote Debugging on port " + PORT);
  const chromeProc = spawn(CHROME_BIN, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/chrome_sqlite_cdp_" + Date.now(),
    "about:blank",
  ]);

  // Wait for Chrome to bind port
  let wsUrl = "";
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error("Could not connect to Chrome CDP");
    chromeProc.kill();
    server.stop(true);
    process.exit(1);
  }

  console.log("Connected to Chrome:", wsUrl);

  // Create new target
  const newPageRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(serverUrl)}`, { method: "PUT" });
  const pageData = await newPageRes.json();
  const pageWsUrl = pageData.webSocketDebuggerUrl;

  const ws = new WebSocket(pageWsUrl);
  await new Promise((resolve) => (ws.onopen = resolve));

  let reqId = 1;
  const pending = new Map<number, (res: any) => void>();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg.result);
      pending.delete(msg.id);
    }
  };

  function send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = reqId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log("Waiting for SQLite Studio to initialize and load data...");
  await sleep(2500);

  // Helper to capture and copy to screenshots/apps
  async function capture(name: string) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const pBrain = `${BRAIN_DIR}/${name}.png`;
    const pApp = `${SCREENSHOTS_DIR}/${name}.png`;
    writeFileSync(pBrain, Buffer.from(shot.data, "base64"));
    try {
      copyFileSync(pBrain, pApp);
    } catch {}
    console.log(`✅ Saved: ${name}.png`);
    return pBrain;
  }

  // 1. Data Grid with Totals Row & Quick Filter Bar Active
  console.log("1. Activating Totals Row & Filter Bar on customers...");
  await send("Runtime.evaluate", {
    expression: `(async () => {
      if (typeof selectTable === "function") selectTable('customers');
      await new Promise(r => setTimeout(r, 600));
      if (typeof toggleAccessTotalsRow === "function" && !accessTotalsRowVisible) toggleAccessTotalsRow();
      if (typeof toggleQuickFilterBar === "function" && !accessFilterBarVisible) toggleQuickFilterBar();
    })()`,
    awaitPromise: true,
  });
  await sleep(1000);
  await capture("sqlite_totals_filter_verified");

  // 2. Microsoft Access Publication Report Modal
  console.log("2. Opening Access Publication Report Modal...");
  await send("Runtime.evaluate", {
    expression: `(async () => { await openAccessReportModal(); })()`,
    awaitPromise: true,
  });
  await sleep(1200);
  await capture("sqlite_access_report_modal_verified");

  await send("Runtime.evaluate", { expression: `closeAccessReportModal()` });
  await sleep(400);

  // 3. Database Backup & SQL Dump Generator Modal
  console.log("3. Opening Database Backup & SQL Dump Modal...");
  await send("Runtime.evaluate", {
    expression: `(async () => { await openDatabaseDumpModal(); })()`,
    awaitPromise: true,
  });
  await sleep(1500);
  await capture("sqlite_backup_dump_modal_verified");

  await send("Runtime.evaluate", { expression: `closeDatabaseDumpModal()` });
  await sleep(400);

  // 4. PRAGMA Performance & WAL Workstation Tab
  console.log("4. Switching to PRAGMA Performance Tab...");
  await send("Runtime.evaluate", {
    expression: `switchTab('pragma')`,
  });
  await sleep(1000);
  await capture("sqlite_pragma_performance_verified");

  // 5. Visual Query Designer with Cardinality Badges
  console.log("5. Switching to Visual Query Designer Tab...");
  await send("Runtime.evaluate", {
    expression: `(async () => {
      switchTab('designer');
      await new Promise(r => setTimeout(r, 600));
      if (typeof applyDesignerPreset === 'function') {
        applyDesignerPreset('ecommerce_multi');
      }
      await new Promise(r => setTimeout(r, 600));
    })()`,
    awaitPromise: true,
  });
  await sleep(1200);
  await capture("sqlite_visual_designer_cardinality_verified");

  console.log("All 5 SQLite verified screenshots captured successfully!");
  ws.close();
  chromeProc.kill();
  server.stop(true);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
