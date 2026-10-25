/**
 * 🌈 Codecaine CyberPeggle: Extreme Pachinko Odyssey Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic Peggle Deluxe / Nights 2D Rigid-Body Peg & Brick Pachinko Engine (900x560 Arena)
 * - Top Rotating Cyber-Cannon + Precision Aim Wheel + Ball-O-Tron 10-Ball Tube + Fever Meter Thermometer
 * - 4 Peg Types: Blue (10x), 25 Orange (100x), Relocating Purple Bonus (500x), 2 Green Power-Up Pegs
 * - Slow-Motion Dramatic Zoom (0.25x time scale + spotlight ring) on the 25th Orange Peg
 * - Extreme Fever Finale with Beethoven's Ode to Joy WebAudio Fanfare & 5 Fever Scoring Chutes
 * - 8 Cyber-Masters (Bjorn, Jimmy Lightning, Kat Tut, Splork, Claude, Lord Cinderbottom, Warren, Master Hu)
 * - 8 Playable Game Modes including Adventure Odyssey, Peggle Nights, AI Master Duel & Custom Board Architect
 */

import type { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { guardLocalRequest } from "../src/localGuard";
import { injectGameMasterFx as injectGameMasterFxBase } from "../src/shared/gameMasterFx";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

const injectGameMasterFx = (html: string, _title?: string, _accent?: string): string =>
  injectGameMasterFxBase(html);

export const APP_PORT = Number(process.env.PEGGLE_PORT || 3274);
export const DEFAULT_PORT = APP_PORT;
export const APP_TITLE = "Codecaine CyberPeggle: Extreme Pachinko Odyssey";

export interface PeggleStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface PeggleStudioInstance {
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

export interface PeggleServerOptions {
  port?: number;
  host?: string;
}

export function getPeggleAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/peggle"),
    resolve(process.cwd(), "resources/peggle"),
    resolve(import.meta.dir, "../../resources/peggle"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generatePeggleStudioHtml(): string {
  const assetsDir = getPeggleAssetsDir();
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

  return injectGameMasterFx(html, "Codecaine CyberPeggle: Extreme Pachinko Odyssey", "amber");
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#180b28"/>
  <circle cx="32" cy="32" r="22" fill="#f97316" stroke="#fde047" stroke-width="3"/>
  <circle cx="25" cy="24" r="6" fill="#fff7ed" opacity="0.85"/>
</svg>`;

export function startPeggleServer(options: PeggleServerOptions = {}) {
  const port = options.port ?? APP_PORT;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getPeggleAssetsDir();

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
        return new Response(generatePeggleStudioHtml(), {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      if (pathname === "/favicon.svg" || pathname === "/favicon.ico") {
        const favPath = join(assetsDir, "favicon.svg");
        if (existsSync(favPath)) {
          return new Response(Bun.file(favPath), {
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
            app: "peggle_studio",
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

export function createPeggleStudio(options: PeggleStudioOptions = {}): PeggleStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1380);
  const height = options.height ?? (fullscreen ? screen.height : 880);
  const title = APP_TITLE;

  const app: PeggleStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generatePeggleStudioHtml(),
    run: async () => {
      console.log(`🌈 Launching ${APP_TITLE}...`);
      const html = generatePeggleStudioHtml();

      let srv: any = null;
      try {
        srv = startPeggleServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🌈 Background server active at: ${app.url}`);
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
        console.warn(
          `Desktop Webview unavailable (${err?.message || err}). Application running in browser at: ${app.url}`,
        );
        await new Promise(() => {});
      } finally {
        try { srv?.stop(); } catch {}
        process.exit(0);
      }
    },
  };

  return app;
}

export class PeggleStudio {
  public static async launch() {
    const app = createPeggleStudio({ fullscreen: false });
    await app.run();
  }
}

export const createPeggleApp = createPeggleStudio;
export const startPeggleStudioServer = startPeggleServer;

if (process.argv.includes("--server")) {
  const port = Number(process.env.PEGGLE_PORT || process.env.PORT || APP_PORT);
  const srv = startPeggleServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🌈 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createPeggleStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
