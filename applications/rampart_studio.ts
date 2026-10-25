/**
 * 🏰 Codecaine CyberRampart: Fortress Build & Cannon Siege Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic 3-Phase Atari Rampart Strategic Loop on a 28x18 Coastline & Fortress Grid:
 *   1. 💣 DEPLOY CANNONS (12s or instant [SPACE]): Place ordnance inside enclosed territory
 *   2. 🔥 CANNON SIEGE (18s): Fire simultaneous arcing cannonball salvos at warships & Kraken bosses
 *   3. 🧱 POLYOMINO WALL REPAIR (18s): Rotate ([R]/Right-Click) & place Tetris-style wall blocks + Auto-Patch [H]
 * - Real-time BFS Flood-Fill Territory Enclosure Engine around Castle Keeps (🏰)
 * - 8 Playable Modes: Archipelago Campaign, 2-Citadel Vs. AI Cannon Duel, Kraken Armada Boss Blitz,
 *   Polyomino Architect Rush, Super Cannon Overdrive, Ironclad Endless Siege, Custom Island Map Generator [G],
 *   and Blitz 10-Second Repair
 * - Orchestral-Synth WebAudio Battle Score & Cannon Barrage SFX
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

export const DEFAULT_PORT = 3270;
export const APP_PORT = Number(process.env.RAMPART_PORT || 3270);
export const APP_TITLE = "Codecaine CyberRampart: Fortress Build & Cannon Siege";

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0b101d"/>
  <path d="M12 48 L12 20 L20 20 L20 26 L28 26 L28 20 L36 20 L36 26 L44 26 L44 20 L52 20 L52 48 Z" fill="#f59e0b" stroke="#fde68a" stroke-width="2"/>
  <rect x="26" y="34" width="12" height="14" rx="4" fill="#1e293b"/>
</svg>`;

export interface RampartStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface RampartStudioInstance {
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

export interface RampartServerOptions {
  port?: number;
  host?: string;
}

export function getRampartAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/rampart"),
    resolve(process.cwd(), "resources/rampart"),
    resolve(import.meta.dir, "../../resources/rampart"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateRampartStudioHtml(): string {
  const assetsDir = getRampartAssetsDir();
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

  return injectGameMasterFx(html, "Codecaine CyberRampart: Fortress Build & Cannon Siege", "amber");
}

export function startRampartServer(options: RampartServerOptions = {}) {
  const port = options.port ?? APP_PORT;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getRampartAssetsDir();

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
        const html = generateRampartStudioHtml();
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
            app: "rampart_studio",
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

export function createRampartStudio(options: RampartStudioOptions = {}): RampartStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1340);
  const height = options.height ?? (fullscreen ? screen.height : 880);
  const title = APP_TITLE;

  const app: RampartStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateRampartStudioHtml(),
    run: async () => {
      console.log(`🏰 Launching ${APP_TITLE}...`);
      const html = generateRampartStudioHtml();

      let srv: any = null;
      try {
        srv = startRampartServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🏰 Background server active at: ${app.url}`);
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

export class RampartStudio {
  public static async launch() {
    const app = createRampartStudio({ fullscreen: false });
    await app.run();
  }
}

export const createRampartApp = createRampartStudio;
export const startRampartStudioServer = startRampartServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.RAMPART_PORT || process.env.PORT || String(APP_PORT), 10);
  const srv = startRampartServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🏰 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createRampartStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
