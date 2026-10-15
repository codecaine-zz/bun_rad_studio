import { spawn } from "child_process";
import { writeFileSync } from "fs";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9224;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Launching Headless Chrome with Remote Debugging on port " + PORT);
  const chromeProc = spawn(CHROME_BIN, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--remote-debugging-port=${PORT}`,
    "--user-data-dir=/tmp/chrome_cdp_profile_" + Date.now(),
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
    process.exit(1);
  }

  console.log("Connected to Chrome:", wsUrl);

  // Create new target
  const newPageRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:54321/`, { method: "PUT" });
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

  console.log("Waiting for Postgres Studio to initialize and load data...");
  await sleep(2500);

  // 1. Capture Publication Report Modal
  console.log("Opening Access Report Modal...");
  const evalRes = await send("Runtime.evaluate", {
    expression: `(() => {
      const modal = document.getElementById("accessReportModal");
      const exists = !!modal;
      const fnExists = typeof openAccessReportModal === "function";
      let err = null;
      try {
        openAccessReportModal();
      } catch(e) {
        err = e.message + "\\n" + e.stack;
      }
      return {
        exists,
        fnExists,
        err,
        display: modal ? modal.style.display : null,
        className: modal ? modal.className : null,
        computedDisplay: modal ? window.getComputedStyle(modal).display : null,
        zIndex: modal ? window.getComputedStyle(modal).zIndex : null,
        rect: modal ? modal.getBoundingClientRect() : null
      };
    })()`,
    returnByValue: true
  });
  console.log("Evaluate result:", JSON.stringify(evalRes, null, 2));
  await sleep(1000);

  const reportShot = await send("Page.captureScreenshot", { format: "png" });
  const reportPath = "/Users/codecaine/.gemini/antigravity-ide/brain/4205c847-f2cc-4335-96b0-60138148d8af/access_report_modal_verified.png";
  writeFileSync(reportPath, Buffer.from(reportShot.data, "base64"));
  console.log("✅ Saved:", reportPath);

  // Close Report Modal
  await send("Runtime.evaluate", { expression: `closeAccessReportModal()` });
  await sleep(300);

  // 2. Open Database Backup & SQL Dump Modal
  console.log("Opening Database Backup & SQL Dump Modal...");
  await send("Runtime.evaluate", {
    expression: `(async () => {
      await openDatabaseDumpModal();
    })()`,
    awaitPromise: true,
  });
  // Wait for dump generation
  await sleep(1500);

  const dumpShot = await send("Page.captureScreenshot", { format: "png" });
  const dumpPath = "/Users/codecaine/.gemini/antigravity-ide/brain/4205c847-f2cc-4335-96b0-60138148d8af/backup_dump_modal_verified.png";
  writeFileSync(dumpPath, Buffer.from(dumpShot.data, "base64"));
  console.log("✅ Saved:", dumpPath);

  // Close Dump Modal
  await send("Runtime.evaluate", { expression: `closeDatabaseDumpModal()` });
  await sleep(300);

  // 3. Open Create ENUM Type Modal
  console.log("Opening Create ENUM Modal...");
  await send("Runtime.evaluate", {
    expression: `openCreateEnumModal()`,
  });
  await sleep(500);

  const enumShot = await send("Page.captureScreenshot", { format: "png" });
  const enumPath = "/Users/codecaine/.gemini/antigravity-ide/brain/4205c847-f2cc-4335-96b0-60138148d8af/create_enum_modal_verified.png";
  writeFileSync(enumPath, Buffer.from(enumShot.data, "base64"));
  console.log("✅ Saved:", enumPath);

  await send("Runtime.evaluate", { expression: `closeCreateEnumModal()` });
  await sleep(300);

  ws.close();
  chromeProc.kill();
  console.log("Finished capturing verified screenshots!");
}

main().catch(console.error);
