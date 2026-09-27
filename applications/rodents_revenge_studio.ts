/**
 * ⚡ Rodent's Revenge - Deluxe Master Edition Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Deluxe arcade revival of the classic Rodent's Revenge puzzle game
 * - Trap cats with movable blocks, collect cheese, unlock special powers
 * - Neon retro visuals, high-DPI canvas & responsive keyboard/touch controls
 */

import { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface RodentsRevengeStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface RodentsRevengeStudioInstance {
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

export interface RodentsRevengeServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getRodentsRevengeAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/rodents_revenge"),
    resolve(process.cwd(), "resources/rodents_revenge"),
    resolve(import.meta.dir, "../../resources/rodents_revenge"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Rodent's Revenge with desktop shortcuts injected.
 */
export function generateRodentsRevengeStudioHtml(): string {
  const assetsDir = getRodentsRevengeAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Rodent's Revenge</h1>";

  const desktopHooks = `
  <script>
    // Desktop RAD Studio Integration
    window.addEventListener("DOMContentLoaded", function() {
      var hubBtn = document.querySelector("a[href='/']") || document.querySelector("a[title*='Hub']");
      if (hubBtn) {
        hubBtn.addEventListener("click", function(e) {
          if (typeof window.quitApp === "function" || typeof window.closeWindow === "function") {
            e.preventDefault();
            if (typeof window.quitApp === "function") window.quitApp();
            else if (typeof window.closeWindow === "function") window.closeWindow();
          }
        });
      }
    });
  </script>
  <script>
${getWindowShortcutsScript()}
  </script>
  `;

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${desktopHooks}\n</body>`);
  } else {
    html += desktopHooks;
  }

  return html;
}

/**
 * Starts the Bun.serve server hosting Rodent's Revenge Deluxe.
 */
export function startRodentsRevengeStudioServer(options: RodentsRevengeServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getRodentsRevengeAssetsDir();

  const server = Bun.serve({
    port,
    hostname: host,
    fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Root / Index
      if (pathname === "/" || pathname === "/index.html") {
        const html = generateRodentsRevengeStudioHtml();
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      // Favicon Icon
      if (pathname === "/favicon.svg") {
        const filePath = join(assetsDir, "favicon.svg");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
          });
        }
      }

      // API Health Check
      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "rodents_revenge_studio",
            name: "Rodent's Revenge - Deluxe Master Edition",
            version: "1.0.0",
            timestamp: Date.now(),
          },
          { headers: corsHeaders }
        );
      }

      // Fallback: static file in assets directory
      const sanitized = pathname.replace(/^\/+/, "");
      const directCandidate = join(assetsDir, sanitized);
      if (existsSync(directCandidate)) {
        return new Response(Bun.file(directCandidate), { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

/**
 * Creates the complete native desktop instance of Rodent's Revenge.
 */
export function createRodentsRevengeStudio(options: RodentsRevengeStudioOptions = {}): RodentsRevengeStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1200);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = "Rodent's Revenge - Deluxe Master Edition";

  const app: RodentsRevengeStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateRodentsRevengeStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Rodent's Revenge Deluxe...");
      const html = generateRodentsRevengeStudioHtml();

      let srv: any = null;
      try {
        srv = startRodentsRevengeStudioServer({
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
        console.log(`⚡ Desktop window open (Fullscreen: ${fullscreen ? 'Enabled' : 'Disabled'}).`);

        webview.run();
        try { srv?.stop(); } catch {}
        process.exit(0);
      } catch (err: any) {
        console.warn(`Desktop Webview unavailable (${err?.message || err}). Application running in browser at: ${app.url}`);
        await new Promise(() => {});
      } finally {
        try { srv?.stop(); } catch {}
        process.exit(0);
      }
    },
  };

  return app;
}

export const createRodentsRevengeApp = createRodentsRevengeStudio;
export const createRodentsRevenge = createRodentsRevengeStudio;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startRodentsRevengeStudioServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Rodent's Revenge Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createRodentsRevengeStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
