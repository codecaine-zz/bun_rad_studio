/**
 * 🧠 Codecaine CyberRecall Royale: Holo-Vault Memory Match Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - 60fps 3D Perspective Holographic Card-Flip Engine (Math.cos 3D Y-axis rotation + gold foil specular highlights)
 * - 8 Playable Memory Match Modes:
 *   1. 🃏 Classic Holo-Pairs (4x4 — 16 Cards / 8 Pairs)
 *   2. 🏛️ Grand Casino Vault (6x4 — 24 Cards / 12 Pairs + Golden Wild Card)
 *   3. 🧠 Master Matrix (6x6 — 36 Cards / 18 Pairs + 3s Opening Memorization Peek)
 *   4. 🔺 Triad Match-3 Recall (6x4 — 24 Cards / 8 Triplets — Flip 3 Identical Cards in a Row!)
 *   5. ⚡ 60s Blitz Rush (Time Attack with +3.0s Bonus Time per Pair & Infinite Board Deals)
 *   6. 💣 Cyber-Minefield & Decoy Traps (Memorize EMP Bomb Positions During Peek & Match Safe Pairs)
 *   7. 🤖 VS Neural AI Dealer (Turn-Based Memory Duel vs C.A.I.N.E.-9000 with Working Short-Term Memory)
 *   8. 🎵 Chrono-Sequence Simon Recall (Watch & Repeat Escalating Musical Hologram Sequences)
 * - 5 Selectable Holographic Card Deck Themes (Cyber-Casino Gems, Mythic Tarot, Deep-Space Mecha, Neon Tokyo Izakaya, Quantum Bio-Lab)
 * - 4 Tactical Memory Power-Ups (X-Ray Peek [Q], Auto-Pair Strike [W], Chrono-Freeze [E], Hint Radar [R])
 * - Procedural WebAudio Synthesizer with Ascending Combo Harmonics & Lounge Synthwave BGM
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

export const APP_PORT = Number(process.env.MEMORY_MATCH_PORT || 3288);
export const DEFAULT_PORT = APP_PORT;
export const APP_TITLE = "Codecaine CyberRecall Royale: Holo-Vault Memory Match";

export interface MemoryMatchStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface MemoryMatchStudioInstance {
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

export interface MemoryMatchServerOptions {
  port?: number;
  host?: string;
}

export function getMemoryMatchAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/memory_match"),
    resolve(process.cwd(), "resources/memory_match"),
    resolve(import.meta.dir, "../../resources/memory_match"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateMemoryMatchStudioHtml(): string {
  const assetsDir = getMemoryMatchAssetsDir();
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

  return injectGameMasterFx(html, APP_TITLE, "cyan");
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#090d1e"/>
  <rect x="10" y="12" width="24" height="34" rx="5" fill="#1e1b4b" stroke="#00f5d4" stroke-width="2.5"/>
  <rect x="28" y="18" width="26" height="34" rx="5" fill="#311042" stroke="#facc15" stroke-width="2.5"/>
  <circle cx="41" cy="35" r="7" fill="#facc15"/>
</svg>`;

export function startMemoryMatchServer(options: MemoryMatchServerOptions = {}) {
  const port = options.port ?? APP_PORT;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getMemoryMatchAssetsDir();

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
        return new Response(generateMemoryMatchStudioHtml(), {
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
            app: "memory_match_studio",
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

export function createMemoryMatchStudio(options: MemoryMatchStudioOptions = {}): MemoryMatchStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1420);
  const height = options.height ?? (fullscreen ? screen.height : 880);
  const title = APP_TITLE;

  const app: MemoryMatchStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateMemoryMatchStudioHtml(),
    run: async () => {
      console.log(`🧠 Launching ${APP_TITLE}...`);
      const html = generateMemoryMatchStudioHtml();

      let srv: any = null;
      try {
        srv = startMemoryMatchServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🧠 Background server active at: ${app.url}`);
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

export class MemoryMatchStudio {
  public static async launch() {
    const app = createMemoryMatchStudio({ fullscreen: false });
    await app.run();
  }
}

export const createMemoryMatchApp = createMemoryMatchStudio;
export const startMemoryMatchStudioServer = startMemoryMatchServer;

if (process.argv.includes("--server")) {
  const port = Number(process.env.MEMORY_MATCH_PORT || process.env.PORT || APP_PORT);
  const srv = startMemoryMatchServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🧠 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createMemoryMatchStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
