/**
 * 🔑 Codecaine CyberChip: Logic Tile Gauntlet Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic Chip's Challenge 19x13 Tile Logic Engine with 3D-shaded vector tiles
 * - 4 Footwear Inventory Slots: Flippers, Fire Boots, Ice Skates, Suction Boots
 * - 4 Color Keys & Doors (Red, Blue, Yellow, reusable Green) + Microchip Socket & Exit Portal
 * - Interactive Logic Tiles: Pushable Dirt Blocks (Water -> Mud Bridge), Green Toggle Button,
 *   Blue Tank Button, Teleport Pads, Thief Tile, Hint Tile, Bombs, Ice & Corner Slides, Force Floors
 * - Patrolling Enemies: Bug (wall-follower), Fireball (right-turner), Glider (left-turner), Teeth (tracker)
 * - 15 Built-In Campaign Levels + Procedural Winnable Gauntlet Generator [G] + Tile Editor + AI Solver [H]
 * - 8 Game Modes & WebAudio Nostalgic Synth BGM/SFX ("Bummer!" hazard + exit fanfare)
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

export const APP_PORT = Number(process.env.CHIPS_CHALLENGE_PORT || 3273);
export const DEFAULT_PORT = APP_PORT;
export const APP_TITLE = "Codecaine CyberChip: Logic Tile Gauntlet";

export interface ChipsChallengeStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface ChipsChallengeStudioInstance {
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

export interface ChipsChallengeServerOptions {
  port?: number;
  host?: string;
}

export function getChipsChallengeAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/chips_challenge"),
    resolve(process.cwd(), "resources/chips_challenge"),
    resolve(import.meta.dir, "../../resources/chips_challenge"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateChipsChallengeStudioHtml(): string {
  const assetsDir = getChipsChallengeAssetsDir();
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

  return injectGameMasterFx(html, "Codecaine CyberChip: Logic Tile Gauntlet", "emerald");
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#061914"/>
  <rect x="14" y="14" width="36" height="36" rx="6" fill="#10b981" stroke="#6ee7b7" stroke-width="3"/>
  <rect x="22" y="22" width="20" height="20" rx="3" fill="#042f2e" stroke="#facc15" stroke-width="2"/>
  <path d="M8 22h6M8 32h6M8 42h6M50 22h6M50 32h6M50 42h6M22 8v6M32 8v6M42 8v6M22 50v6M32 50v6M42 50v6" stroke="#facc15" stroke-width="3" stroke-linecap="round"/>
</svg>`;

export function startChipsChallengeServer(options: ChipsChallengeServerOptions = {}) {
  const port = options.port ?? APP_PORT;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getChipsChallengeAssetsDir();

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
        return new Response(generateChipsChallengeStudioHtml(), {
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
            app: "chips_challenge_studio",
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

export function createChipsChallengeStudio(
  options: ChipsChallengeStudioOptions = {},
): ChipsChallengeStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1380);
  const height = options.height ?? (fullscreen ? screen.height : 880);
  const title = APP_TITLE;

  const app: ChipsChallengeStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateChipsChallengeStudioHtml(),
    run: async () => {
      console.log(`🔑 Launching ${APP_TITLE}...`);
      const html = generateChipsChallengeStudioHtml();

      let srv: any = null;
      try {
        srv = startChipsChallengeServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🔑 Background server active at: ${app.url}`);
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

export class ChipsChallengeStudio {
  public static async launch() {
    const app = createChipsChallengeStudio({ fullscreen: false });
    await app.run();
  }
}

export const createChipsChallengeApp = createChipsChallengeStudio;
export const startChipsChallengeStudioServer = startChipsChallengeServer;

if (process.argv.includes("--server")) {
  const port = Number(process.env.CHIPS_CHALLENGE_PORT || process.env.PORT || APP_PORT);
  const srv = startChipsChallengeServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🔑 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createChipsChallengeStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
