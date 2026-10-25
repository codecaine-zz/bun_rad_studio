/**
 * 🃏 Codecaine CyberDrop: Grab & Throw Chain Blitz Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic Magical Drop III & Money Idol Exchanger Grab-and-Throw Engine (7 Columns x 12 Rows)
 * - Cyber-Jester Bottom Rail Launcher with Multi-Stack Same-Color Grab & High-Velocity Vertical Throw
 * - Vertical 3+ Match & Contiguous Flood-Clear + Orphan Pull-Up Cascade (Active Real-Time Chains!)
 * - Special Orbs: Ice Orbs (adjacent thaw), Rainbow Wild Orbs, and Money Idol Exchanger Coin Synthesis (1c->500c)
 * - 6 Selectable Tarot Arcana Challengers: The Fool, The Magician, The Empress, The Chariot, The Star, The World
 * - 8 Playable Modes: Vs. AI Arcana Duel, Money Idol Exchanger, Endless Quota Marathon, 1-Move Chain Puzzle Vault,
 *   2-Minute Caravan Score Attack, Ice & Rainbow Chaos, Boss Rush (6 Tarot Masters), AI Chain Advisor [H]
 * - Neo-Geo Arcade Synth BGM & Ascending Harmonic Chain Chime SFX + Game Master FX
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

export const DEFAULT_PORT = 3272;
export const APP_PORT = Number(process.env.MAGICAL_DROP_PORT || 3272);
export const APP_TITLE = "Codecaine CyberDrop: Grab & Throw Chain Blitz";

const MAGICAL_DROP_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="dropGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f43f5e"/>
      <stop offset="50%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#090718" stroke="url(#dropGrad)" stroke-width="3"/>
  <circle cx="20" cy="18" r="8" fill="#f43f5e" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="32" cy="18" r="8" fill="#facc15" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="44" cy="18" r="8" fill="#38bdf8" stroke="#ffffff" stroke-width="1.5"/>
  <circle cx="32" cy="34" r="8" fill="#facc15" stroke="#ffffff" stroke-width="1.5"/>
  <path d="M22,54 L32,42 L42,54 Z" fill="#a855f7" stroke="#facc15" stroke-width="2"/>
</svg>`;

export interface MagicalDropStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface MagicalDropStudioInstance {
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

export interface MagicalDropServerOptions {
  port?: number;
  host?: string;
}

export function getMagicalDropAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/magical_drop"),
    resolve(process.cwd(), "resources/magical_drop"),
    resolve(import.meta.dir, "../../resources/magical_drop"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateMagicalDropStudioHtml(): string {
  const assetsDir = getMagicalDropAssetsDir();
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
  return injectGameMasterFx(html, "Codecaine CyberDrop: Grab & Throw Chain Blitz", "rose");
}

export function startMagicalDropServer(options: MagicalDropServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getMagicalDropAssetsDir();

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
        return new Response(generateMagicalDropStudioHtml(), {
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
        return new Response(MAGICAL_DROP_FAVICON_SVG, {
          headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
        });
      }

      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "magical_drop_studio",
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

export function createMagicalDropStudio(options: MagicalDropStudioOptions = {}): MagicalDropStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = APP_TITLE;

  const app: MagicalDropStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateMagicalDropStudioHtml(),
    run: async () => {
      console.log(`🃏 Launching ${APP_TITLE}...`);
      const html = generateMagicalDropStudioHtml();

      let srv: any = null;
      try {
        srv = startMagicalDropServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🃏 Background server active at: ${app.url}`);
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

export class MagicalDropStudio {
  public static async launch() {
    const app = createMagicalDropStudio({ fullscreen: false });
    await app.run();
  }
}

export const createMagicalDropApp = createMagicalDropStudio;
export const startMagicalDropStudioServer = startMagicalDropServer;

if (process.argv.includes("--server")) {
  const port = Number(process.env.MAGICAL_DROP_PORT || process.env.PORT || APP_PORT);
  const srv = startMagicalDropServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🃏 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createMagicalDropStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
