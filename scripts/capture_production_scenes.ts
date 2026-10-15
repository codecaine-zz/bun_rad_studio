// Complete production screenshot capture script for Codecaine File Manager
import { join } from "path";

const port = 9222;
const OUTPUT_DIR = join(process.cwd(), "youtube_production", "frames");

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("Connecting to Chrome DevTools on port 9222...");
  const targetsRes = await fetch(`http://127.0.0.1:${port}/json`);
  const targets = (await targetsRes.json()) as any[];
  const pageTarget = targets.find((t: any) => t.type === "page" && t.url.includes("51292")) || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let idCounter = 1;
  const pending = new Map<number, (res: any) => void>();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const resolver = pending.get(data.id)!;
      pending.delete(data.id);
      resolver(data);
    }
  };

  await new Promise<void>((r) => { ws.onopen = () => r(); });

  function send(method: string, params: any = {}): Promise<any> {
    const id = idCounter++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evalJs(expr: string) {
    return send("Runtime.evaluate", { expression: expr });
  }

  async function capture(filename: string) {
    await wait(500);
    const snap = await send("Page.captureScreenshot", { format: "png" });
    if (snap.result?.data) {
      const outPath = join(OUTPUT_DIR, filename);
      await Bun.write(outPath, Buffer.from(snap.result.data, "base64"));
      console.log(`  ✔ Saved: ${filename}`);
    }
  }

  console.log("Navigating to File Manager...");
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:51292/" });
  await wait(1800);

  // 1. Home Dashboard
  console.log("1. Capturing Home Dashboard...");
  await evalJs(`document.querySelector('#view-home')?.click();`);
  await capture("01_home_dashboard.png");

  // 2. Everyday Files Workspace
  console.log("2. Capturing Files Workspace...");
  await evalJs(`document.querySelector('#view-files')?.click();`);
  await capture("02_files_workspace.png");

  // 3. Dual Pane Mode
  console.log("3. Capturing Dual Pane View...");
  await evalJs(`document.querySelector('#view-dual')?.click();`);
  await capture("03_dual_pane.png");

  // 4. Split View with Terminal open
  console.log("4. Capturing Split View with Terminal...");
  await evalJs(`
    document.querySelector('#view-split')?.click();
    document.querySelector('#btn-terminal')?.click();
  `);
  await wait(800);
  await capture("04_split_terminal.png");
  await evalJs(`document.querySelector('#term-close')?.click();`);

  // Switch to Tools view for dedicated deep dives
  await evalJs(`document.querySelector('#view-tools')?.click();`);
  await wait(400);

  // 5. Code Studio
  console.log("5. Capturing Code Studio...");
  await evalJs(`document.querySelector('#power-tab-code')?.click();`);
  await capture("05_code_studio.png");

  // 6. Dev Station / Tokei Lines of Code & Git
  console.log("6. Capturing Dev Station...");
  await evalJs(`document.querySelector('#power-tab-dev')?.click();`);
  await wait(1000);
  await capture("06_dev_station.png");

  // 7. Database Hub (SQLite, Postgres, MySQL, Redis)
  console.log("7. Capturing Database Hub...");
  await evalJs(`document.querySelector('#power-tab-databases')?.click();`);
  await wait(600);
  await capture("07_database_hub.png");

  // 8. Secrets & Password Manager
  console.log("8. Capturing Secrets & Vault...");
  await evalJs(`document.querySelector('#power-tab-secrets')?.click();`);
  await wait(600);
  await capture("08_secrets_vault.png");

  // 9. Crypto & Hashing Suite
  console.log("9. Capturing Crypto & Hash Tools...");
  await evalJs(`document.querySelector('#power-tab-crypto')?.click();`);
  await wait(600);
  await capture("09_crypto_tools.png");

  // 10. Live Web & PHP Server
  console.log("10. Capturing Live & PHP Server...");
  await evalJs(`document.querySelector('#power-tab-serve')?.click();`);
  await wait(600);
  await capture("10_live_server.png");

  // 11. Network & IP Tools
  console.log("11. Capturing Network & IP Tools...");
  await evalJs(`document.querySelector('#power-tab-ip')?.click();`);
  await wait(600);
  await capture("11_network_ip.png");

  // 12. Subdomain Recon (Subfinder)
  console.log("12. Capturing Subdomain Recon...");
  await evalJs(`document.querySelector('#power-tab-subs')?.click();`);
  await wait(600);
  await capture("12_subfinder_recon.png");

  // 13. Graveyard (Rip)
  console.log("13. Capturing Rip Graveyard...");
  await evalJs(`document.querySelector('#power-tab-grave')?.click();`);
  await wait(600);
  await capture("13_rip_graveyard.png");

  // 14. Convert & Process Dialog
  console.log("14. Capturing Universal Converter Dialog...");
  await evalJs(`
    document.querySelector('#view-files')?.click();
    document.querySelector('#btn-convert')?.click();
  `);
  await wait(600);
  await capture("14_converter_dialog.png");
  await evalJs(`document.querySelector('.modal-backdrop [aria-label="Close"]')?.click() || document.querySelector('.modal-backdrop button.btn-secondary')?.click();`);

  // 15. More Info & Forensics Dialog
  console.log("15. Capturing More Info & Forensics...");
  await evalJs(`
    const firstRow = document.querySelector('#list .file-entry') || document.querySelector('#list tr');
    if (firstRow) firstRow.click();
    document.querySelector('#btn-details')?.click();
  `);
  await wait(600);
  await capture("15_more_info_forensics.png");

  console.log("All scene captures completed!");
  ws.close();
}

run().catch(console.error);
