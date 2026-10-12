/**
 * ⚡ Cyberpunk Maze Runner - Neon Labyrinth Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Production procedural maze engines (Recursive Backtracking, Prim's, Kruskal's, Wilson's)
 * - High-DPI neon canvas rendering with glow filters, particles & fog of war
 * - Full Web Audio synthesizer for ambient cyber drone & interactive footsteps
 * - AI pathfinding solvers (A*, Dijkstra) with real-time animated exploration
 */

import { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface MazeStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface MazeStudioInstance {
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

export interface MazeServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getMazeAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/maze_generator"),
    resolve(process.cwd(), "resources/maze_generator"),
    resolve(import.meta.dir, "../../resources/maze_generator"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/** Where settings and statistics live. MAZE_GENERATOR_STATE_FILE overrides it (used by tests). */
export function getMazeStatePath(): string {
  return process.env.MAZE_GENERATOR_STATE_FILE || resolve(process.cwd(), ".maze_generator_state.json");
}

/** Read saved settings/statistics; anything unreadable yields an empty object (the page sanitises the rest). */
export function loadMazeState(): { settings?: unknown; stats?: unknown } {
  try {
    const file = getMazeStatePath();
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { settings: parsed.settings, stats: parsed.stats } : {};
  } catch {
    return {};
  }
}

/** Persist settings/statistics atomically. Returns false for malformed or oversized input. */
export function saveMazeState(raw: unknown): boolean {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const body = JSON.stringify({ settings: (data as any).settings ?? {}, stats: (data as any).stats ?? {} });
    if (body.length > 64 * 1024) return false;
    const file = getMazeStatePath();
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, body, "utf8");
    renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates the complete HTML for Maze Runner with desktop shortcuts injected.
 */
export function generateMazeStudioHtml(): string {
  const assetsDir = getMazeAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Cyberpunk Maze Runner</h1>";

  // The desktop window loads this HTML with no base URL, so relative scripts cannot load: inline the engine,
  // and inject the saved state so settings and records are there on the first frame.
  const enginePath = join(assetsDir, "engine.js");
  if (existsSync(enginePath)) {
    const stateJson = JSON.stringify(loadMazeState()).replace(/</g, "\\u003c");
    const inline = `<script>window.__MAZE_STATE__ = ${stateJson};</script>\n<script>\n${readFileSync(enginePath, "utf8")}\n</script>`;
    if (html.includes('<script src="engine.js"></script>')) {
      html = html.replace('<script src="engine.js"></script>', () => inline);
    } else if (html.includes("</head>")) {
      html = html.replace("</head>", `${inline}\n</head>`);
    } else {
      html = inline + "\n" + html;
    }
  }

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
    // Desktop RAD Studio Integration
    window.addEventListener("DOMContentLoaded", function() {
      var hubBtn = document.querySelector(".nav-btn[aria-label*='Hub']") || document.querySelector("a[href='/']") || document.querySelector("a[title*='Hub']");
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

  return html;
}

/**
 * Starts the Bun.serve server hosting Maze Runner.
 */
export function startMazeStudioServer(options: MazeServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getMazeAssetsDir();

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(req) {
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

      // Root / Index
      if (pathname === "/" || pathname === "/index.html") {
        const html = generateMazeStudioHtml();
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
      }

      // Engine
      if (pathname === "/engine.js") {
        const filePath = join(assetsDir, "engine.js");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "application/javascript; charset=utf-8", ...corsHeaders },
          });
        }
      }

      // Favicon Icon
      if (pathname === "/favicon.svg") {
        const filePath = join(assetsDir, "favicon.svg");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "image/svg+xml", ...corsHeaders },
          });
        }
      }

      if (pathname === "/favicon.png") {
        const filePath = join(assetsDir, "favicon.png");
        if (existsSync(filePath)) {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": "image/png", ...corsHeaders },
          });
        }
      }

      // State API
      if (pathname === "/api/state") {
        if (req.method === "GET") {
          return Response.json(loadMazeState());
        }
        if (req.method === "POST") {
          const origin = req.headers.get("origin");
          const hostHeader = req.headers.get("host");
          if (origin && hostHeader) {
            try {
              const u = new URL(origin);
              if (u.host !== hostHeader) {
                return new Response("Forbidden: Cross-origin state mutation rejected", { status: 403 });
              }
            } catch {
              return new Response("Forbidden", { status: 403 });
            }
          }
          try {
            const body = await req.json();
            const ok = saveMazeState(body);
            if (!ok) return new Response("Bad Request: Invalid state structure or size", { status: 400 });
            return Response.json({ success: true, saved: loadMazeState() });
          } catch {
            return new Response("Bad Request: Malformed JSON body", { status: 400 });
          }
        }
        return new Response("Method Not Allowed", { status: 405 });
      }

      // API Health Check
      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "maze_generator_studio",
            name: "Cyberpunk Maze Runner - Neon Labyrinth",
            version: "2.5.0",
            timestamp: Date.now(),
          },
          { headers: corsHeaders }
        );
      }

      // Fallback: static file in assets directory
      const sanitized = pathname.replace(/^\/+/, "");
      const directCandidate = join(assetsDir, sanitized);
      if (directCandidate !== assetsDir && !directCandidate.startsWith(assetsDir + "/") && !directCandidate.startsWith(assetsDir + "\\")) {
        return new Response("Forbidden", { status: 403 });
      }
      if (existsSync(directCandidate)) {
        return new Response(Bun.file(directCandidate), { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
  });

  return server;
}

/**
 * Creates the complete native desktop instance of Maze Runner.
 */
export function createMazeStudio(options: MazeStudioOptions = {}): MazeStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1200);
  const height = options.height ?? (fullscreen ? screen.height : 900);
  const title = "Cyberpunk Maze Runner - Neon Labyrinth";

  const app: MazeStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateMazeStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Cyberpunk Maze Runner...");
      const html = generateMazeStudioHtml();

      let srv: any = null;
      try {
        srv = startMazeStudioServer({
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

        webview.bind("mazeSaveState", (json: string) => {
          saveMazeState(json);
        });

        webview.setHTML(html);
        console.log(`⚡ Desktop window open (Fullscreen: ${fullscreen ? 'Enabled' : 'Disabled'}).`);

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

export const createMazeApp = createMazeStudio;
export const createMaze = createMazeStudio;
export const createMazeGeneratorStudio = createMazeStudio;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startMazeStudioServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Cyberpunk Maze Runner Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createMazeStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
