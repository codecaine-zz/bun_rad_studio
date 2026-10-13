import { Webview } from "webview-bun";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { guardLocalRequest } from "../src/localGuard";

function findAvailablePort(start: number, end: number): number {
  for (let p = start; p <= end; p++) {
    try {
      const server = Bun.serve({ port: p, fetch() { return new Response("ok"); } });
      server.stop();
      return p;
    } catch (e) { }
  }
  return start;
}

export class SnakeStudio {
  public static async launch() {
    console.log("⚡ Launching Neon Snake Deluxe...");

    const port = findAvailablePort(63000, 64000);
    const resourcesPath = join(process.cwd(), "resources", "snake_studio");
    const indexPath = join(resourcesPath, "index.html");

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

    let htmlContent = "";
    if (existsSync(indexPath)) {
      htmlContent = readFileSync(indexPath, "utf-8");
      htmlContent = htmlContent.replace(/http:\/\/127\.0\.0\.1:0/g, `http://127.0.0.1:${port}`);
    } else {
      console.error(`❌ Error: index.html not found at ${indexPath}`);
      process.exit(1);
    }

    const webview = new Webview(true, {
      width: 1000,
      height: 800,
      window: {
        title: "🐍 Neon Snake Deluxe",
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
  SnakeStudio.launch();
}
