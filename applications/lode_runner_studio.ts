/**
 * ⛏️ Codecaine CyberLode: Gold Cache Heist Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic 1983 Broderbund / Douglas E. Smith Lode Runner 28x16 Tile Grid Architecture
 * - 8 Tile Types: EMPTY, DIGGABLE_BRICK (drilled via Q/Z Left or E/X Right, regenerates after 5.5s),
 *   SOLID_CONCRETE, LADDER, HAND_BAR (overhead monkey-bar zip-line), TRAP_BRICK, GOLD_CACHE, HIDDEN_ESCAPE_LADDER
 * - Smart AI Malware Guards (3-5 per stage): chase along ladders/bars/floors, fall into drilled holes (STUNNED_IN_HOLE),
 *   drop carried Gold Caches above holes, act as safe bridges for the runner, climb out after 3.5s, or get crushed & respawn at top!
 * - 8 Playable Modes: Classic 150-Style Heist, Championship Lode Runner (Hard), Bomb & Trapdoors,
 *   90s Gold Rush Blitz, 2P Co-Op Heist (WASD + Arrows), Stealth No-Drill Challenge, Built-In Level Editor,
 *   and Procedural Winnable Heist [G]
 * - AI Path & Drill Hint [H], Random Level [G], and Procedural WebAudio Chiptune Synthesizer
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

export const DEFAULT_PORT = 3268;
export const APP_PORT = Number(process.env.LODE_RUNNER_PORT || 3268);
export const APP_TITLE = "Codecaine CyberLode: Gold Cache Heist";

const FALLBACK_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <radialGradient id="lodeG" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="65%" stop-color="#b45309"/>
      <stop offset="100%" stop-color="#090d16"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#lodeG)" stroke="#fde047" stroke-width="2.5"/>
  <rect x="12" y="42" width="40" height="10" rx="2" fill="#dc2626" stroke="#fca5a5" stroke-width="1.2"/>
  <polygon points="32,14 46,34 18,34" fill="#fde047" stroke="#ffffff" stroke-width="1.5"/>
</svg>`;

export interface LodeRunnerStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface LodeRunnerStudioInstance {
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

export interface LodeRunnerServerOptions {
  port?: number;
  host?: string;
}

export function getLodeRunnerAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/lode_runner"),
    resolve(process.cwd(), "resources/lode_runner"),
    resolve(import.meta.dir, "../../resources/lode_runner"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateLodeRunnerStudioHtml(): string {
  const assetsDir = getLodeRunnerAssetsDir();
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
  return applyFx(html, "Codecaine CyberLode: Gold Cache Heist", "amber");
}

export function startLodeRunnerServer(options: LodeRunnerServerOptions = {}) {
  const port = options.port ?? APP_PORT;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getLodeRunnerAssetsDir();

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
        return new Response(generateLodeRunnerStudioHtml(), {
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
            app: "lode_runner_studio",
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

export function createLodeRunnerStudio(options: LodeRunnerStudioOptions = {}): LodeRunnerStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = APP_TITLE;

  const app: LodeRunnerStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateLodeRunnerStudioHtml(),
    run: async () => {
      console.log(`⛏️ Launching ${APP_TITLE}...`);
      const html = generateLodeRunnerStudioHtml();

      let srv: any = null;
      try {
        srv = startLodeRunnerServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`⛏️ Background server active at: ${app.url}`);
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

export class LodeRunnerStudio {
  public static async launch() {
    const app = createLodeRunnerStudio({ fullscreen: false });
    await app.run();
  }
}

export const createLodeRunnerApp = createLodeRunnerStudio;
export const startLodeRunnerStudioServer = startLodeRunnerServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.LODE_RUNNER_PORT || process.env.PORT || String(APP_PORT), 10);
  const srv = startLodeRunnerServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⛏️ ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createLodeRunnerStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
