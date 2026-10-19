/**
 * 🪙 Blackjack Royale VIP — Multi-Hand Casino Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - High-roller multi-hand VIP casino Blackjack with 3 simultaneous betting spots (Left, Center Main, Right)
 * - Complete Authentic Bicycle/Bee casino-grade vector playing cards (12-figure French Court suite, Acanthus Aces, rosette backs)
 * - 6-deck shoe with realistic shuffle penetration, cut card insertion, and real-time Hi-Lo card counting telemetry (Running & True Count)
 * - Classic Casino Rules: Natural 21 pays 3:2, Dealer stands on all 17s, Hole-card peek on Ace/10, Late Surrender (50% refund)
 * - Action-packed splitting (matching ranks), Double Down (any initial two cards), and Insurance against Dealer Ace
 * - Exclusive Side Bets: Perfect Pairs (Mixed 6:1, Colored 12:1, Perfect 25:1) and 21+3 Poker (Flush, Straight, Trips, Straight Flush, Suited Trips up to 100:1)
 * - Dynamic Basic Strategy Advisor bar with live recommended moves + comprehensive Strategy Matrix Modal
 * - Polyphonic WebAudio synthesizer (chip clinks, card snaps, dealer stand knocks, win fanfares, bust drops)
 * - Multi-felt luxury table customization (Emerald Green, Monte Carlo Navy, Bellagio Burgundy, Midnight Onyx)
 */

import type { SizeHint, Webview } from "webview-bun";
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

export interface BlackjackStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface BlackjackStudioInstance {
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

export interface BlackjackServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static blackjack assets.
 */
export function getBlackjackAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/blackjack"),
    resolve(process.cwd(), "resources/blackjack"),
    resolve(import.meta.dir, "../../resources/blackjack"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Blackjack Royale VIP with desktop shortcuts and storage polyfill injected.
 */
export function generateBlackjackStudioHtml(): string {
  const assetsDir = getBlackjackAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Blackjack Royale VIP</h1>";

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
 * Starts the Bun.serve server hosting Blackjack Royale VIP.
 */
export function startBlackjackServer(options: BlackjackServerOptions = {}) {
  return startStaticStudioServer(
    { app: "blackjack_studio", name: "Codecaine Blackjack Royale VIP — Multi-Hand Casino Studio", version: "1.0.0", assetsDir: getBlackjackAssetsDir(), generateHtml: generateBlackjackStudioHtml },
    options,
  );
}

/**
 * Creates the complete native desktop instance of Blackjack Royale VIP.
 */
export function createBlackjackStudio(options: BlackjackStudioOptions = {}): BlackjackStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1240);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = "Codecaine Blackjack Royale VIP — Multi-Hand Casino Studio";

  const app: BlackjackStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateBlackjackStudioHtml(),
    run: async () => {
      console.log("🪙 Launching Blackjack Royale VIP...");
      const html = generateBlackjackStudioHtml();

      let srv: any = null;
      try {
        srv = startBlackjackServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🪙 Background server active at: ${app.url}`);
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

        // Set HTML directly into Webview memory (bypasses macOS ATS network restrictions)
        webview.setHTML(html);
        console.log(`🪙 Desktop window open (Fullscreen: ${fullscreen ? "Enabled" : "Disabled"}).`);

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
  const port = portFlagIdx !== -1 ? parseInt(args[portFlagIdx + 1]!, 10) : 8997;
  const serverOnly = args.includes("--server") || args.includes("-s");

  if (serverOnly) {
    const srv = startBlackjackServer({ port, host: "127.0.0.1" });
    console.log(`🪙 Blackjack Royale VIP server running at: http://127.0.0.1:${srv.port}/`);
    await new Promise(() => {});
  } else {
    const app = createBlackjackStudio({ fullscreen, port });
    app.run();
  }
}
