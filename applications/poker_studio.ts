/**
 * ♠️ Texas Hold'em & 5-Card Draw Poker Royale — Deluxe Casino Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Dual Iconic Poker Engines: No-Limit Texas Hold'em (community board, 4 betting rounds, 7-choose-5 showdown)
 *   and classic 5-Card Draw (antes, pre-draw betting, interactive card discard/draw replacement phase, post-draw showdown)
 * - 6-Max casino table with legendary AI poker personalities (Doyle Brunson, Phil Hellmuth, Johnny Chan, Daniel Negreanu, Gus Hansen)
 * - Authentic Bicycle/Bee casino-grade vector playing cards (12-figure French Court suite, Acanthus Aces, rosette backs)
 * - Micro-precision poker hand evaluation across all 10 hand ranks with full tie-breaker kickers
 * - Interactive discard marking with red DISCARD stamps and smooth replacement animations
 * - Full WebAudio casino sound effects (card deals, chip clatters, check knocks, win fanfares)
 * - Real-time Action Telemetry log and interactive Hand Rankings hierarchy guide
 */

import { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { guardLocalRequest } from "../src/localGuard";
import { startStaticStudioServer } from "../src/studio_server";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface PokerStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface PokerStudioInstance {
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

export interface PokerServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static poker assets.
 */
export function getPokerAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/poker"),
    resolve(process.cwd(), "resources/poker"),
    resolve(import.meta.dir, "../../resources/poker"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Poker Royale with desktop shortcuts and storage polyfill injected.
 */
export function generatePokerStudioHtml(): string {
  const assetsDir = getPokerAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Poker Royale</h1>";

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
        hubBtn.style.display = "inline-flex";
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
 * Starts the Bun.serve server hosting Poker Royale.
 */
export function startPokerServer(options: PokerServerOptions = {}) {
  return startStaticStudioServer(
    { app: "poker_studio", name: "Codecaine Texas Hold'em & 5-Card Draw Poker Royale", version: "1.0.0", assetsDir: getPokerAssetsDir(), generateHtml: generatePokerStudioHtml },
    options,
  );
}

/**
 * Creates the complete native desktop instance of Poker Royale.
 */
export function createPokerStudio(options: PokerStudioOptions = {}): PokerStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1240);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = "Codecaine Texas Hold'em & 5-Card Draw Poker Royale — Casino Studio";

  const app: PokerStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generatePokerStudioHtml(),
    run: async () => {
      console.log("♠️ Launching Texas Hold'em & 5-Card Draw Poker Royale...");
      const html = generatePokerStudioHtml();

      let srv: any = null;
      try {
        srv = startPokerServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`♠️ Background server active at: ${app.url}`);
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

        // Set HTML directly into Webview memory (bypasses macOS ATS network restrictions)
        webview.setHTML(html);
        console.log(`♠️ Desktop window open (Fullscreen: ${fullscreen ? "Enabled" : "Disabled"}).`);

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

// Direct CLI Invocation
if (import.meta.main) {
  const args = process.argv.slice(2);
  const fullscreen = !args.includes("--windowed") && !args.includes("-w");
  const portFlagIdx = args.indexOf("--port");
  const port = portFlagIdx !== -1 ? parseInt(args[portFlagIdx + 1]!, 10) : 8996;
  const serverOnly = args.includes("--server") || args.includes("-s");

  if (serverOnly) {
    const srv = startPokerServer({ port, host: "127.0.0.1" });
    console.log(`♠️ Poker Royale server running at: http://127.0.0.1:${srv.port}/`);
    await new Promise(() => {});
  } else {
    const app = createPokerStudio({ fullscreen, port });
    app.run();
  }
}
