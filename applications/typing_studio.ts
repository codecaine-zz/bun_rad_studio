import { injectGameMasterFx } from "../src/shared/gameMasterFx";
/**
 * ⚡ Codecaine CyberType Deluxe — Codecaine Master Edition Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 */

import type { SizeHint, Webview } from "webview-bun";
import { serve } from "bun";
import { join, resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { startStaticStudioServer } from "../src/studio_server";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface TypingStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface TypingStudioInstance {
  title: string;
  width: number;
  height: number;
  fullscreen: boolean;
  port?: number;
  url?: string;
  server?: any;
  webview?: Webview;
  run: () => Promise<void> | void;
  generateHtml: () => string;
}

export interface TypingServerOptions {
  port?: number;
  host?: string;
}

export function getTypingAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/typing_studio"),
    resolve(process.cwd(), "resources/typing_studio"),
    resolve(import.meta.dir, "../../resources/typing_studio"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateTypingStudioHtml(): string {
  const assetsDir = getTypingAssetsDir();
  const indexPath = join(assetsDir, "index.html");
  let html = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : "<h1>Codecaine CyberType Deluxe</h1>";

  const desktopHooks = `
  <script>
${getWindowShortcutsScript()}
  </script>
  `;

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${desktopHooks}\n</body>`);
  } else {
    html += desktopHooks;
  }

  return injectGameMasterFx(html);
}

export function startTypingServer(options: TypingServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "typing_studio",
      name: "Codecaine CyberType Deluxe — Codecaine Master Edition",
      version: "2.0.0",
      assetsDir: getTypingAssetsDir(),
      generateHtml: generateTypingStudioHtml,
    },
    options,
  );
}

export function createTypingStudio(options: TypingStudioOptions = {}): TypingStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 820);
  const title = "Codecaine CyberType Deluxe — Codecaine Edition";

  const app: TypingStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateTypingStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Codecaine CyberType Deluxe...");
      const html = generateTypingStudioHtml();

      let srv: any = null;
      try {
        srv = startTypingServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`⚡ Background server active at: ${app.url}`);
      } catch (err: any) {
        console.warn("Local server note:", err?.message || err);
      }

      try {
        const { SizeHint, Webview } = (await import("webview-bun")) as typeof import("webview-bun");
        const webview = new Webview(true, {
          width,
          height,
          hint: SizeHint.NONE,
        });
        app.webview = webview;
        webview.title = title;

        try {
          if (fullscreen) {
            setWindowPositionNative(webview, { x: 0, y: 0 }, width, height);
          } else {
            setWindowPositionNative(webview, "center", width, height);
          }
          setAlwaysOnTopNative(webview, options.alwaysOnTop ?? false);
        } catch {}

        attachWindowShortcuts(webview, {
          onQuit: () => {
            try { srv?.stop(); } catch {}
            process.exit(0);
          },
          onClose: () => {
            try { srv?.stop(); } catch {}
            process.exit(0);
          },
          onFullscreen: () => {
            toggleFullscreenNative(webview);
          },
          fullscreen,
        });

        webview.setHTML(html);
        console.log("⚡ Desktop window open.");
        webview.run();
        try { srv?.stop(); } catch {}
        process.exit(0);
      } catch (err: any) {
        console.warn("Desktop Webview unavailable. Running as server only.", err);
        await new Promise(() => {});
      }
    },
  };

  return app;
}

export class TypingStudio {
  private webview: Webview | null = null;
  private port: number;

  constructor() {
    this.port = 59700 + Math.floor(Math.random() * 100);
  }

  public async start(): Promise<void> {
    console.log("⚡ Launching Codecaine CyberType Deluxe...");
    this.startServer();
    console.log(`⚡ Background server active at: http://127.0.0.1:${this.port}`);

    try {
      const { SizeHint, Webview } = (await import("webview-bun")) as typeof import("webview-bun");
      this.webview = new Webview(true, {
        width: 1280,
        height: 800,
        hint: SizeHint.NONE,
      });
      this.webview.title = "Codecaine CyberType Deluxe — Codecaine Edition";
      attachWindowShortcuts(this.webview, { fullscreen: false });

      const htmlContent = generateTypingStudioHtml();

      this.webview.setHTML(htmlContent);
      console.log("⚡ Desktop window open.");
      this.webview.run();
      process.exit(0);
    } catch (err) {
      console.warn("Desktop Webview unavailable. Running as server only.", err);
      await new Promise(() => {});
    }
  }

  private startServer() {
    serve({
      port: this.port,
      fetch: (req) => {
        const url = new URL(req.url);

        if (url.pathname === "/api/health") {
          return new Response(
            JSON.stringify({
              status: "ok",
              game: "typing_studio",
              name: "Codecaine CyberType Deluxe",
              version: "3.0.0",
              features: [
                "interactive-10-step-tutorial",
                "18-lesson-academy-curriculum",
                "codecaine-adaptive-ai",
                "multi-layout-keyboard",
                "pace-ghost-runner",
                "per-finger-telemetry",
              ],
            }),
            {
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            },
          );
        }

        if (url.pathname === "/favicon.svg") {
          try {
            const svgPath = join(getTypingAssetsDir(), "favicon.svg");
            const svgData = readFileSync(svgPath, "utf-8");
            return new Response(svgData, { headers: { "Content-Type": "image/svg+xml" } });
          } catch (e) {
            return new Response("Not Found", { status: 404 });
          }
        }

        if (url.pathname === "/") {
          try {
            const htmlPath = join(getTypingAssetsDir(), "index.html");
            const htmlData = readFileSync(htmlPath, "utf-8");
            return new Response(htmlData, { headers: { "Content-Type": "text/html" } });
          } catch (e) {
            return new Response("Not Found", { status: 404 });
          }
        }

        return new Response("Not Found", { status: 404 });
      },
    });
  }
}

export const createTypingApp = createTypingStudio;
export const startTypingStudioServer = startTypingServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startTypingServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Codecaine CyberType Deluxe Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const app = new TypingStudio();
  app.start().catch((err) => {
    console.error("Failed to start TypingStudio:", err);
    process.exit(1);
  });
}
