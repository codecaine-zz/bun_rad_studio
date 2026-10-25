/**
 * 🧛 Codecaine NightSavior: Bullet-Heaven & Dark Force Odyssey Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Hybrid Gothic Bullet-Heaven Roguelike (Vampire Survivors) + Darkstalkers 3 (Vampire Savior) Dark Force Overdrive
 * - 6 Playable Gothic Night-Lords: Demitri-Caine, Morrigan-Vex, Talbain-X, Donovan-Zero, Poe-Phantasm, Jedah-Omega
 * - 10 Base Weapons + 10 Red/Gold Evolved Super Weapons + 6 Passive Relics (6x6 HUD Slot Matrix)
 * - Active Dark Force Overdrive ([SPACE]/[E]) summoning a Twin Shadow Clone + Lord EX Ultimate & Dash-Cancel ([SHIFT])
 * - Interactive Level-Up Draft Overlay ([1],[2],[3], Reroll [R], Banish), Boss Chest Jackpot ([C]), Evolution Grimoire ([V])
 * - 8 Playable Modes: Mad Neon Forest, Inlaid Cyber-Library, Gallo Blood Tower, Vampire Savior 1v1 Duel Arena,
 *   Hyper Hurry Overdrive, Arcana Tarot & Limit Break Sandbox, Red Death Reaper Boss Rush, Auto-Survivor AI & Build Tester
 * - Castlevania / Darkstalkers Baroque Pipe Organ + Synthwave WebAudio BGM & Crunchy XP / Chest Jackpot SFX
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

export const DEFAULT_PORT = 3276;
export const APP_PORT = Number(process.env.VAMPIRE_SURVIVORS_PORT || 3276);
export const APP_TITLE = "Codecaine NightSavior: Bullet-Heaven & Dark Force Odyssey";

const FALLBACK_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="vampG" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#f43f5e"/>
      <stop offset="60%" stop-color="#9f1239"/>
      <stop offset="100%" stop-color="#090414"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#vampG)" stroke="#facc15" stroke-width="2.5"/>
  <path d="M10 38 C16 20, 24 24, 32 32 C40 24, 48 20, 54 38 C46 34, 38 38, 32 46 C26 38, 18 34, 10 38 Z" fill="#1e1b4b" stroke="#fb7185" stroke-width="2"/>
  <polygon points="24,34 27,44 30,35" fill="#ffffff"/>
  <polygon points="40,34 37,44 34,35" fill="#ffffff"/>
  <circle cx="25" cy="26" r="3" fill="#facc15"/>
  <circle cx="39" cy="26" r="3" fill="#facc15"/>
</svg>`;

export interface VampireSurvivorsStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface VampireSurvivorsStudioInstance {
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

export interface VampireSurvivorsServerOptions {
  port?: number;
  host?: string;
}

export function getVampireSurvivorsAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/vampire_survivors"),
    resolve(process.cwd(), "resources/vampire_survivors"),
    resolve(import.meta.dir, "../../resources/vampire_survivors"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateVampireSurvivorsStudioHtml(): string {
  const assetsDir = getVampireSurvivorsAssetsDir();
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
  return applyFx(html, "Codecaine NightSavior: Vampire Survivors & Dark Force", "rose");
}

export function startVampireSurvivorsServer(options: VampireSurvivorsServerOptions = {}) {
  const port = options.port ?? APP_PORT;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getVampireSurvivorsAssetsDir();

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
        return new Response(generateVampireSurvivorsStudioHtml(), {
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
            app: "vampire_survivors_studio",
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

export function createVampireSurvivorsStudio(
  options: VampireSurvivorsStudioOptions = {},
): VampireSurvivorsStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = APP_TITLE;

  const app: VampireSurvivorsStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateVampireSurvivorsStudioHtml(),
    run: async () => {
      console.log(`🧛 Launching ${APP_TITLE}...`);
      const html = generateVampireSurvivorsStudioHtml();

      let srv: any = null;
      try {
        srv = startVampireSurvivorsServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🧛 Background server active at: ${app.url}`);
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

export class VampireSurvivorsStudio {
  public static async launch() {
    const app = createVampireSurvivorsStudio({ fullscreen: false });
    await app.run();
  }
}

export const createVampireSurvivorsApp = createVampireSurvivorsStudio;
export const startVampireSurvivorsStudioServer = startVampireSurvivorsServer;

if (process.argv.includes("--server")) {
  const port = parseInt(
    process.env.VAMPIRE_SURVIVORS_PORT || process.env.PORT || String(APP_PORT),
    10,
  );
  const srv = startVampireSurvivorsServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🧛 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createVampireSurvivorsStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
