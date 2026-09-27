/**
 * ⚡ Interval Timer & High-Performance Calisthenics Suite
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - High-intensity interval timer with customizable work/rest cycles
 * - Keith Baar isometric tendon training protocols & animated execution guides
 * - Tone.js audio cues, YouTube playlist integration & motivational soundtrack sync
 */

import { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface IntervalTimerStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface IntervalTimerStudioInstance {
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

export interface IntervalTimerServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getIntervalTimerAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/interval_timer"),
    resolve(process.cwd(), "resources/interval_timer"),
    resolve(import.meta.dir, "../../resources/interval_timer"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

// In-memory cache for inlined animations & favicon
let cachedInlinedHtml: string | null = null;

/**
 * Generates the complete HTML for Interval Timer with all exercise animations inlined
 * as Base64 data URIs and desktop shortcuts + external link interceptor injected.
 */
export function generateIntervalTimerStudioHtml(): string {
  if (cachedInlinedHtml) {
    return cachedInlinedHtml;
  }

  const assetsDir = getIntervalTimerAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Interval Timer Suite</h1>";

  // 1. Inline all animation GIFs and JPG diagrams from assets/animations/
  const animDir = join(assetsDir, "assets/animations");
  if (existsSync(animDir)) {
    try {
      const files = readdirSync(animDir);
      for (const f of files) {
        const fullPath = join(animDir, f);
        const ext = f.endsWith(".jpg") ? "jpeg" : "gif";
        const base64 = readFileSync(fullPath).toString("base64");
        const dataUri = `data:image/${ext};base64,${base64}`;
        html = html.replaceAll(`assets/animations/${f}`, dataUri);
      }
    } catch (e) {
      console.warn("Notice: could not inline animation files:", e);
    }
  }

  // 2. Inline favicon.png
  const faviconPath = join(assetsDir, "favicon.png");
  if (existsSync(faviconPath)) {
    try {
      const favB64 = readFileSync(faviconPath).toString("base64");
      const favUri = `data:image/png;base64,${favB64}`;
      html = html.replaceAll("/favicon.png", favUri);
      html = html.replaceAll("favicon.png", favUri);
    } catch {}
  }

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

  cachedInlinedHtml = html;
  return html;
}

/**
 * Starts the Bun.serve server hosting Interval Timer Suite.
 */
export function startIntervalTimerStudioServer(options: IntervalTimerServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getIntervalTimerAssetsDir();

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
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
        const html = generateIntervalTimerStudioHtml();
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      // Playlist Sync API endpoint
      if (url.searchParams.get("action") === "sync_codecaine_playlist" || pathname === "/api/sync_playlist") {
        const cachePath = join(assetsDir, "cache/codecaine_playlist.json");
        let tracks: any[] = [];
        if (existsSync(cachePath)) {
          try {
            tracks = JSON.parse(readFileSync(cachePath, "utf8"));
          } catch {}
        }
        return Response.json(
          { success: true, count: tracks.length, tracks },
          { headers: corsHeaders }
        );
      }

      // Favicon Icon
      if (pathname === "/favicon.png") {
        const filePath = join(assetsDir, "favicon.png");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "image/png", ...corsHeaders },
          });
        }
      }

      // API Health Check
      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "interval_timer_studio",
            name: "Interval Timer & High-Performance Calisthenics Suite",
            version: "1.0.0",
            timestamp: Date.now(),
          },
          { headers: corsHeaders }
        );
      }

      // Static assets (animations, images, cache, etc.)
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
 * Creates the complete native desktop instance of Interval Timer.
 */
export function createIntervalTimerStudio(options: IntervalTimerStudioOptions = {}): IntervalTimerStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1380);
  const height = options.height ?? (fullscreen ? screen.height : 920);
  const title = "Interval Timer & High-Performance Calisthenics Suite";

  const app: IntervalTimerStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateIntervalTimerStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Interval Timer Suite...");
      const html = generateIntervalTimerStudioHtml();

      let srv: any = null;
      try {
        srv = startIntervalTimerStudioServer({
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

export const createIntervalTimerApp = createIntervalTimerStudio;
export const createIntervalTimer = createIntervalTimerStudio;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startIntervalTimerStudioServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Interval Timer Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createIntervalTimerStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
