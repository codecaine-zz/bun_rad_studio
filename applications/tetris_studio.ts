import { Webview } from "webview-bun";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { guardLocalRequest } from "../src/localGuard";

// Find available port between 63000-64000 for local assets
function findAvailablePort(start: number, end: number): number {
  for (let p = start; p <= end; p++) {
    try {
      const server = Bun.serve({
        port: p,
        fetch() {
          return new Response("ok");
        },
      });
      server.stop();
      return p;
    } catch (e) {
      // Port in use, continue
    }
  }
  return start;
}

export class TetrisStudio {
  public static async launch() {
    console.log("⚡ Launching Tetris Ultra Deluxe...");

    const port = findAvailablePort(63000, 64000);
    const resourcesPath = join(process.cwd(), "resources", "tetris_studio");
    const indexPath = join(resourcesPath, "index.html");

    // Start background file server for audio assets if needed
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: port,
      fetch(req) {
        const blocked = guardLocalRequest(req);
        if (blocked) return blocked;

        const url = new URL(req.url);
        const filePath = join(resourcesPath, url.pathname);
        if (existsSync(filePath)) {
          const file = Bun.file(filePath);
          return new Response(file);
        }
        return new Response("Not Found", { status: 404 });
      },
    });

    console.log(`⚡ Background server active at: http://127.0.0.1:${port}`);

    // Load HTML directly
    let htmlContent = "";
    if (existsSync(indexPath)) {
      htmlContent = readFileSync(indexPath, "utf-8");
      // Replace asset urls if necessary
      htmlContent = htmlContent.replace(/http:\/\/127\.0\.0\.1:0/g, `http://127.0.0.1:${port}`);
    } else {
      console.error(`❌ Error: index.html not found at ${indexPath}`);
      process.exit(1);
    }

    const webview = new Webview(true, {
      width: 1000,
      height: 800,
      window: {
        title: "🧱 Tetris Ultra Deluxe",
        resizable: true,
        minWidth: 800,
        minHeight: 600,
      },
    });

    webview.setHTML(htmlContent);
    webview.run();
    server.stop();
    process.exit(0);
  }
}

if (import.meta.main) {
  TetrisStudio.launch();
}
