/**
 * ⚡ Codecaine CyberQix: Laser Territory Claim Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic Qix / Volfied Territory-Slicing Grid Engine (160 x 100 Logical Grid on 880x540 Canvas)
 * - Perimeter Marker with Fast Draw (1x Cyan Laser) & Slow Draw (2x Amber High-Voltage Laser)
 * - Flood-Fill Cavity Capture & Split-Qix Twin Core Multiplier (2x-4x)
 * - Harmonic Multi-Segment Plasma Qix, Perimeter Sparx, Stix Fuse, and Volfied Power Cubes
 * - 8 Playable Modes: Classic Qix (75%), Volfied Power-Cube Mode (80% + Bosses), Split-Qix Twin Core,
 *   Slow-Draw 2x High-Risk, 90s Speed Slice Blitz, 90% Precision Grandmaster, Vs. AI Territory Race, Zen Neon Weaver
 * - WebAudio Synthwave Arpeggiator BGM & Laser/Capture/Sparx SFX + Game Master FX
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

export const DEFAULT_PORT = 3271;
export const APP_PORT = Number(process.env.QIX_PORT || 3271);
export const APP_TITLE = "Codecaine CyberQix: Laser Territory Claim";

const QIX_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="qixGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00f5d4"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#f43f5e"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#070916" stroke="url(#qixGrad)" stroke-width="3"/>
  <polygon points="8,8 34,8 34,26 22,26 22,56 8,56" fill="rgba(0,245,212,0.28)" stroke="#00f5d4" stroke-width="2"/>
  <polyline points="20,44 46,16 54,28 32,50 48,52" fill="none" stroke="url(#qixGrad)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polygon points="34,20 40,26 34,32 28,26" fill="#facc15" stroke="#ffffff" stroke-width="1.5"/>
</svg>`;

export interface QixStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface QixStudioInstance {
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

export interface QixServerOptions {
  port?: number;
  host?: string;
}

export function getQixAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/qix"),
    resolve(process.cwd(), "resources/qix"),
    resolve(import.meta.dir, "../../resources/qix"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateQixStudioHtml(): string {
  const assetsDir = getQixAssetsDir();
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

  // @ts-ignore - extra metadata args supported for studio branding
  return injectGameMasterFx(html, "Codecaine CyberQix: Laser Territory Claim", "violet");
}

export function startQixServer(options: QixServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getQixAssetsDir();

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
        return new Response(generateQixStudioHtml(), {
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
        return new Response(QIX_FAVICON_SVG, {
          headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
        });
      }

      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "qix_studio",
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
        !directCandidate.startsWith(directCandidate + "\\")
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

export function createQixStudio(options: QixStudioOptions = {}): QixStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = APP_TITLE;

  const app: QixStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateQixStudioHtml(),
    run: async () => {
      console.log(`⚡ Launching ${APP_TITLE}...`);
      const html = generateQixStudioHtml();

      let srv: any = null;
      try {
        srv = startQixServer({
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

export class QixStudio {
  public static async launch() {
    const app = createQixStudio({ fullscreen: false });
    await app.run();
  }
}

export const createQixApp = createQixStudio;
export const startQixStudioServer = startQixServer;

if (process.argv.includes("--server")) {
  const port = Number(process.env.QIX_PORT || process.env.PORT || APP_PORT);
  const srv = startQixServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createQixStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
