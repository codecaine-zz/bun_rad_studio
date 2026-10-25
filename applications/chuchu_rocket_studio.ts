/**
 * 🚀 Codecaine CyberRocket: Arrow Tile Panic Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic ChuChu Rocket! 12x9 Neon Grid Engine with 4 Corner Rockets (P1 Blue, AI2 Red, AI3 Green, AI4 Gold)
 * - Directional Arrow Tile Placement (Up to 3 active arrows per player with FIFO cycling & 2-Hit Cat Durability)
 * - Right-Hand Rule Cyber-Mice (ChuChus), Rival Cyber-Cats (KapuKapus), 50-Pt Gold Mice & Mystery Roulette Mice
 * - Fever Roulette Wheel Events: Mouse Mania, Cat Attack, Move Everyone's Rocket, Speed Frenzy & Arrow Monopoly
 * - 8 Playable Modes: 4P Battle Royale, 25-Stage Puzzle Mode, Cat Mania Survival, Mouse Frenzy 500-Rush,
 *   2v2 Team Rocket Alliance, Stage Challenge (30s Target), Custom Puzzle Editor, and AI Best-Arrow Hint Coach [H]
 * - Upbeat Dreamcast-Style WebAudio Synth BGM & Arcade SFX
 */

import type { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { guardLocalRequest } from "../src/localGuard";
import { injectGameMasterFx as rawInjectGameMasterFx } from "../src/shared/gameMasterFx";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

const injectGameMasterFx = (html: string, _title?: string, _accent?: string): string =>
  rawInjectGameMasterFx(html);

export const DEFAULT_PORT = 3269;
export const APP_PORT = Number(process.env.CHUCHU_ROCKET_PORT || 3269);
export const APP_TITLE = "Codecaine CyberRocket: Arrow Tile Panic";

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#070b19"/>
  <circle cx="32" cy="32" r="26" fill="none" stroke="#00f3ff" stroke-width="2.5" opacity="0.6"/>
  <path d="M32 10 L46 36 L37 36 L37 52 L27 52 L27 36 L18 36 Z" fill="#00f3ff"/>
  <circle cx="32" cy="26" r="4" fill="#ffd700"/>
</svg>`;

export interface ChuChuRocketStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface ChuChuRocketStudioInstance {
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

export interface ChuChuRocketServerOptions {
  port?: number;
  host?: string;
}

export function getChuChuRocketAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/chuchu_rocket"),
    resolve(process.cwd(), "resources/chuchu_rocket"),
    resolve(import.meta.dir, "../../resources/chuchu_rocket"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateChuChuRocketStudioHtml(): string {
  const assetsDir = getChuChuRocketAssetsDir();
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

  return injectGameMasterFx(html, "Codecaine CyberRocket: Arrow Tile Panic", "cyan");
}

export function startChuChuRocketServer(options: ChuChuRocketServerOptions = {}) {
  const port = options.port ?? APP_PORT;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getChuChuRocketAssetsDir();

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
        const html = generateChuChuRocketStudioHtml();
        return new Response(html, {
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
        return new Response(FAVICON_SVG, {
          headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
        });
      }

      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "chuchu_rocket_studio",
            name: APP_TITLE,
            version: "2.5.0",
            port: APP_PORT,
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

export function createChuChuRocketStudio(options: ChuChuRocketStudioOptions = {}): ChuChuRocketStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1320);
  const height = options.height ?? (fullscreen ? screen.height : 880);
  const title = APP_TITLE;

  const app: ChuChuRocketStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateChuChuRocketStudioHtml(),
    run: async () => {
      console.log(`🚀 Launching ${APP_TITLE}...`);
      const html = generateChuChuRocketStudioHtml();

      let srv: any = null;
      try {
        srv = startChuChuRocketServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🚀 Background server active at: ${app.url}`);
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

export class ChuChuRocketStudio {
  public static async launch() {
    const app = createChuChuRocketStudio({ fullscreen: false });
    await app.run();
  }
}

export const createChuChuRocketApp = createChuChuRocketStudio;
export const startChuChuRocketStudioServer = startChuChuRocketServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.CHUCHU_ROCKET_PORT || process.env.PORT || String(APP_PORT), 10);
  const srv = startChuChuRocketServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🚀 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createChuChuRocketStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
