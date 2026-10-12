/**
 * 🃏 Joker Royale — Balatro Deluxe Roguelike Poker Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic, high-fidelity Balatro roguelike poker deckbuilder with Ante & Blind progression
 * - Dynamic 3D gyro card physics, procedural chiptune synth music & tactical sound effects
 * - 30+ synergistic Jokers (Blueprint, Cavendish, Baron, Bloodstone, Gros Michel, Cyber Quantum)
 * - Tarots, Celestial Planet hand level-ups, Boss Blinds (The Wall, The Hook, The Needle, The Eye)
 * - The Cyber Shop with Card packs, Vouchers, Rerolls, SafeStorage autosave & Hall of Fame
 */

import { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface BalatroStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface BalatroStudioInstance {
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

export interface BalatroServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getBalatroAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/balatro"),
    resolve(process.cwd(), "resources/balatro"),
    resolve(import.meta.dir, "../../resources/balatro"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Joker Royale with desktop shortcuts injected.
 */
export function generateBalatroStudioHtml(): string {
  const assetsDir = getBalatroAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Joker Royale</h1>";

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
      var hubBtn = document.getElementById("btnHub") || document.querySelector("a[href='/']");
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
 * Starts the Bun.serve server hosting Joker Royale.
 */
export function startBalatroServer(options: BalatroServerOptions = {}) {
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const assetsDir = getBalatroAssetsDir();

  const server = Bun.serve({
    port,
    hostname: host,
    fetch(req) {
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
        const html = generateBalatroStudioHtml();
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
        });
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

      // API Health Check
      if (pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            app: "balatro_studio",
            name: "Joker Royale — Balatro Deluxe",
            version: "1.0.0",
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
 * Creates the complete native desktop instance of Joker Royale.
 */
export function createBalatroStudio(options: BalatroStudioOptions = {}): BalatroStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1240);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = "Joker Royale — Balatro Deluxe Roguelike Poker Studio";

  const app: BalatroStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateBalatroStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Joker Royale (Balatro Deluxe)...");
      const html = generateBalatroStudioHtml();

      let srv: any = null;
      try {
        srv = startBalatroServer({
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

      let webview: Webview;
      try {
        webview = new Webview();
      } catch (err: any) {
        console.error("❌ Failed to initialize Webview runtime:", err?.message || err);
        if (srv) {
          console.log(`🌐 You can still play directly in your browser at: ${app.url}`);
        }
        return;
      }

      app.webview = webview;
      webview.title = title;
      webview.size = {
        width,
        height,
        hint: fullscreen ? SizeHint.NONE : SizeHint.FIXED,
      };

      if (fullscreen) {
        try {
          toggleFullscreenNative(title);
        } catch (e) {}
      }

      if (options.alwaysOnTop) {
        try {
          setAlwaysOnTopNative(title, true);
        } catch (e) {}
      }

      attachWindowShortcuts(webview, {
        reload: () => {
          if (app.url) webview.navigate(app.url);
          else webview.setHTML(generateBalatroStudioHtml());
        },
      });

      // Bind Native Handlers
      webview.bind("closeWindow", () => {
        try { webview.destroy(); } catch (e) {}
        if (srv) {
          try { srv.stop(true); } catch (e) {}
        }
        process.exit(0);
      });

      webview.bind("quitApp", () => {
        try { webview.destroy(); } catch (e) {}
        if (srv) {
          try { srv.stop(true); } catch (e) {}
        }
        process.exit(0);
      });

      webview.bind("toggleFullscreen", () => {
        try {
          toggleFullscreenNative(title);
        } catch (e) {}
      });

      if (app.url) {
        webview.navigate(app.url);
      } else {
        webview.setHTML(html);
      }

      console.log(`⚡ Desktop window open (Fullscreen: ${fullscreen ? "Enabled" : "Disabled"}).`);
      webview.run();
    },
  };

  return app;
}

// Direct CLI Invocation
if (import.meta.main) {
  const args = process.argv.slice(2);
  const fullscreen = !args.includes("--windowed") && !args.includes("-w");
  const portFlagIdx = args.indexOf("--port");
  const port = portFlagIdx !== -1 ? parseInt(args[portFlagIdx + 1]!, 10) : undefined;

  const app = createBalatroStudio({ fullscreen, port });
  app.run();
}
