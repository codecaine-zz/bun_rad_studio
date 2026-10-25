/**
 * 🧵 Codecaine CyberLemmings: Kernel Thread Rescue Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic 1991 DMA Design / Psygnosis Lemmings Destructible Pixel Terrain Engine (880x460 offscreen terrain mask)
 * - 6 Pixel Material Types: DIRT, CYBER_BRICK, INDESTRUCTIBLE_STEEL, ONE_WAY_WALL, WATER_HAZARD, LAVA_CORE
 * - 8 Assignable Daemon Thread Skills [Keys 1-8]: Climber, Floater, Bomber, Blocker, Builder, Basher, Miner, Digger
 * - Live Release Rate (-/+), Pause [P], Fast-Forward (2x/3x [F]), Nuke All [N], and AI Bridge/Rescue Coach [H]
 * - 8 Playable Modes: Fun Tier, Tricky Tier, Taxing Tier, Mayhem Tier, 2-Tribe Vs. AI Rescue,
 *   90s Speedrun Rescue, Terrain Sandbox & Brush Editor, and Procedural Level Architect [G]
 * - LemmingsAudio Chiptune March & Procedural Web Audio Synthesizer
 */

import type { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { guardLocalRequest } from "../src/localGuard";
import { injectGameMasterFx } from "../src/shared/gameMasterFx";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export const DEFAULT_PORT = 3267;
export const APP_PORT = Number(process.env.LEMMINGS_PORT || 3267);
export const APP_TITLE = "Codecaine CyberLemmings: Kernel Thread Rescue";

const FALLBACK_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="lemG" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="65%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#051329"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#lemG)" stroke="#38bdf8" stroke-width="2.5"/>
  <path d="M18 22 C24 12, 42 12, 46 22 Z" fill="#22c55e"/>
  <rect x="24" y="22" width="16" height="14" rx="4" fill="#fde68a"/>
  <rect x="22" y="36" width="20" height="16" rx="5" fill="#2563eb"/>
  <circle cx="34" cy="27" r="2.2" fill="#0f172a"/>
</svg>`;

export interface LemmingsStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface LemmingsStudioInstance {
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

export interface LemmingsServerOptions {
  port?: number;
  host?: string;
}

export function getLemmingsAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/lemmings"),
    resolve(process.cwd(), "resources/lemmings"),
    resolve(import.meta.dir, "../../resources/lemmings"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateLemmingsStudioHtml(): string {
  const assetsDir = getLemmingsAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : `<h1>${APP_TITLE}</h1>`;

  const storagePolyfill = `
  <script>
    (function() {
      try {
        var k = '__test__';
        window.localStorage.setItem(k, '1');
        window.localStorage.removeItem(k);
      } catch(e) {
        var mem = {};
        try {
          Object.defineProperty(window, 'localStorage', {
            value: {
              getItem: function(k) { return mem.hasOwnProperty(k) ? mem[k] : null; },
              setItem: function(k, v) { mem[k] = String(v); },
              removeItem: function(k) { delete mem[k]; },
              clear: function() { mem = {}; },
              key: function(i) { return Object.keys(mem)[i] || null; },
              get length() { return Object.keys(mem).length; }
            },
            writable: true,
            configurable: true
          });
        } catch(err) {}
      }
    })();
  </script>
  `;

  if (html.includes("<head>")) {
    html = html.replace("<head>", `<head>\n${storagePolyfill}`);
  } else {
    html = storagePolyfill + html;
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

  const applyFx = injectGameMasterFx as (
    markup: string,
    title?: string,
    accent?: string,
  ) => string;
  return applyFx(html, "Codecaine CyberLemmings: Kernel Thread Rescue", "emerald");
}

export function startLemmingsServer(options: LemmingsServerOptions = {}) {
  const port = options.port ?? APP_PORT;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getLemmingsAssetsDir();

  return Bun.serve({
    port,
    hostname: host,
    fetch(req) {
      const blocked = guardLocalRequest(req);
      if (blocked) return blocked;

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

      if (pathname === "/" || pathname === "/index.html") {
        return new Response(generateLemmingsStudioHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      if (pathname === "/favicon.svg") {
        const filePath = join(assetsDir, "favicon.svg");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
          });
        }
        return new Response(FALLBACK_FAVICON_SVG, {
          headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
        });
      }

      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "lemmings_studio",
            name: APP_TITLE,
            version: "2.5.0",
            timestamp: Date.now(),
          },
          { headers: corsHeaders },
        );
      }

      const sanitized = pathname.replace(/^\/+/, "");
      const directCandidate = join(assetsDir, sanitized);
      if (
        directCandidate !== assetsDir &&
        !directCandidate.startsWith(assetsDir + "/") &&
        !directCandidate.startsWith(assetsDir + "\\")
      ) {
        return new Response("Forbidden", { status: 403 });
      }
      if (existsSync(directCandidate)) {
        return new Response(Bun.file(directCandidate), { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });
}

export function createLemmingsStudio(options: LemmingsStudioOptions = {}): LemmingsStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = APP_TITLE;

  const app: LemmingsStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateLemmingsStudioHtml(),
    run: async () => {
      console.log(`🧵 Launching ${APP_TITLE}...`);
      const html = generateLemmingsStudioHtml();

      let srv: any = null;
      try {
        srv = startLemmingsServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🧵 Background server active at: ${app.url}`);
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

export class LemmingsStudio {
  public static async launch() {
    const app = createLemmingsStudio({ fullscreen: false });
    await app.run();
  }
}

export const createLemmingsApp = createLemmingsStudio;
export const startLemmingsStudioServer = startLemmingsServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.LEMMINGS_PORT || process.env.PORT || String(APP_PORT), 10);
  const srv = startLemmingsServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🧵 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createLemmingsStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
