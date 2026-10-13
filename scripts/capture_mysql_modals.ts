import { spawn } from "child_process";
import { writeFileSync } from "fs";
import { startMysqlStudioServer } from "../applications/mysql_studio_server.ts";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9225;
const BRAIN_DIR = "/Users/codecaine/.gemini/antigravity-ide/brain/4205c847-f2cc-4335-96b0-60138148d8af";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Starting background MySQL Studio Server on port 33333...");
  const server = startMysqlStudioServer({
    port: 33333,
    config: {
      host: "localhost",
      port: 3306,
      user: "root",
      password: process.env.MSQL_PASSWORD,
      database: "my_app_dev",
    },
  });
  const serverUrl = `http://127.0.0.1:${server.port}/`;
  console.log("MySQL Studio running at:", serverUrl);

  console.log("Launching Headless Chrome with Remote Debugging on port " + PORT);
  const chromeProc = spawn(CHROME_BIN, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/chrome_mysql_cdp_" + Date.now(),
    "about:blank",
  ]);

  // Wait for Chrome to bind port
  let wsUrl = "";
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        const data = (await res.json()) as { webSocketDebuggerUrl: string };
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
  const pageData = (await newPageRes.json()) as { webSocketDebuggerUrl: string };
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

  console.log("Waiting for MySQL Studio to initialize and load data...");
  await sleep(2500);

  // Helper to capture
  async function capture(name: string) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    const p = `${BRAIN_DIR}/${name}.png`;
    writeFileSync(p, Buffer.from(shot.data, "base64"));
    console.log(`✅ Saved: ${name}.png`);
    return p;
  }

  // 1. Data Grid with Totals Row & Quick Filter Bar Active
  console.log("1. Activating Totals Row & Filter Bar on customers...");
  await send("Runtime.evaluate", {
    expression: `(async () => {
      if (typeof selectObject === "function") selectObject('table', 'customers');
      await new Promise(r => setTimeout(r, 600));
      if (typeof toggleAccessTotalsRow === "function" && !accessTotalsRowVisible) toggleAccessTotalsRow();
      if (typeof toggleQuickFilterBar === "function" && !accessFilterBarVisible) toggleQuickFilterBar();
    })()`,
    awaitPromise: true,
  });
  await sleep(1000);
  await capture("mysql_totals_filter_verified");

  // 2. Microsoft Access Publication Report Modal
  console.log("2. Opening Access Publication Report Modal...");
  await send("Runtime.evaluate", {
    expression: `openAccessReportModal()`,
  });
  await sleep(1000);
  await capture("mysql_access_report_modal_verified");

  await send("Runtime.evaluate", { expression: `closeAccessReportModal()` });
  await sleep(300);

  // 3. Database Backup & SQL Dump Generator Modal
  console.log("3. Opening Database Backup & SQL Dump Modal...");
  await send("Runtime.evaluate", {
    expression: `(async () => { await openDatabaseDumpModal(); })()`,
    awaitPromise: true,
  });
  await sleep(1500);
  await capture("mysql_backup_dump_modal_verified");

  await send("Runtime.evaluate", { expression: `closeDatabaseDumpModal()` });
  await sleep(300);

  // 4. Custom Types & ENUMs Tab
  console.log("4. Switching to Custom Types & ENUMs Tab...");
  await send("Runtime.evaluate", {
    expression: `switchTab('types')`,
  });
  await sleep(1000);
  await capture("mysql_enum_types_tab_verified");

  // 5. Create ENUM Column Modal
  console.log("5. Opening Create ENUM Column Modal...");
  await send("Runtime.evaluate", {
    expression: `openCreateEnumModal()`,
  });
  await sleep(600);
  await capture("mysql_create_enum_modal_verified");

  await send("Runtime.evaluate", { expression: `closeCreateEnumModal()` });
  await sleep(300);

  // 6. Declarative Partition Trees Explorer Tab
  console.log("6. Switching to Partition Trees Tab...");
  await send("Runtime.evaluate", {
    expression: `switchTab('partitions')`,
  });
  await sleep(1000);
  await capture("mysql_partition_trees_tab_verified");

  // 7. Streaming Replication & Binary Log Diagnostics Tab
  console.log("7. Switching to Replication & Binlogs Tab...");
  await send("Runtime.evaluate", {
    expression: `switchTab('replication')`,
  });
  await sleep(1000);
  await capture("mysql_replication_tab_verified");

  // 8. Live Process List & Lock Contention Monitor Tab
  console.log("8. Switching to Live Activity & Locks Tab...");
  await send("Runtime.evaluate", {
    expression: `switchTab('activity')`,
  });
  await sleep(1000);
  await capture("mysql_activity_locks_tab_verified");

  // 9. Visual Query Designer with Cardinality Badges
  console.log("9. Switching to Visual Query Designer Tab...");
  await send("Runtime.evaluate", {
    expression: `(async () => {
      switchTab('designer');
      await new Promise(r => setTimeout(r, 600));
      queryDesignerState.selectedTables = [];
      queryDesignerState.joins = [];
      addDesignerTable('customers');
      addDesignerTable('orders');
      await new Promise(r => setTimeout(r, 400));
      if (typeof autoDetectForeignKeys === 'function') autoDetectForeignKeys();
      if (typeof autoArrangeDesignerTables === 'function') autoArrangeDesignerTables();
      await new Promise(r => setTimeout(r, 400));
      if (typeof updateCanvasSvg === 'function') updateCanvasSvg();
    })()`,
    awaitPromise: true,
  });
  await sleep(1500);
  await capture("mysql_visual_designer_cardinality_verified");

  ws.close();
  chromeProc.kill();
  server.stop(true);
  console.log("🎉 All MySQL Studio visual verification screenshots captured successfully!");
  process.exit(0);
}

main().catch(console.error);
