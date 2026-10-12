import { SizeHint, Webview } from "webview-bun";
import { serve } from "bun";
import { join } from "path";
import { readFileSync } from "fs";

export class TypingStudio {
  private webview: Webview | null = null;
  private port: number;

  constructor() {
    this.port = 59700 + Math.floor(Math.random() * 100);
  }

  public async start(): Promise<void> {
    console.log(`⚡ Launching CyberType Deluxe...`);
    this.startServer();
    console.log(`⚡ Background server active at: http://127.0.0.1:${this.port}`);

    try {
      this.webview = new Webview(true, {
        width: 1280,
        height: 800,
        hint: SizeHint.NONE,
      });
      this.webview.title = "CyberType Deluxe — Mavis Edition";

      // Read HTML directly to bypass macOS App Transport Security on localhost
      const htmlPath = join(import.meta.dir, "../resources/typing_studio/index.html");
      const htmlContent = readFileSync(htmlPath, "utf-8");
      
      this.webview.setHTML(htmlContent);
      console.log(`⚡ Desktop window open.`);
      this.webview.run();
      process.exit(0);
    } catch(err) {
      console.warn("Desktop Webview unavailable. Running as server only.", err);
      // keep alive
      await new Promise(() => {});
    }
  }

  private startServer() {
    serve({
      port: this.port,
      fetch: (req) => {
        const url = new URL(req.url);
        
        if (url.pathname === "/api/health") {
          return new Response(JSON.stringify({ status: "ok", game: "typing_studio" }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }
        
        if (url.pathname === "/favicon.svg") {
          try {
            const svgPath = join(import.meta.dir, "../resources/typing_studio/favicon.svg");
            const svgData = readFileSync(svgPath, "utf-8");
            return new Response(svgData, { headers: { "Content-Type": "image/svg+xml" } });
          } catch (e) {
            return new Response("Not Found", { status: 404 });
          }
        }
        
        if (url.pathname === "/") {
          try {
            const htmlPath = join(import.meta.dir, "../resources/typing_studio/index.html");
            const htmlData = readFileSync(htmlPath, "utf-8");
            return new Response(htmlData, { headers: { "Content-Type": "text/html" } });
          } catch (e) {
            return new Response("Not Found", { status: 404 });
          }
        }

        return new Response("Not Found", { status: 404 });
      }
    });
  }
}

// Auto-run if executed directly
if (import.meta.main) {
  const app = new TypingStudio();
  app.start().catch(err => {
    console.error("Failed to start TypingStudio:", err);
    process.exit(1);
  });
}
