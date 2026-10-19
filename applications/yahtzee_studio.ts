/**
 * 🎲 Yahtzee Royale Deluxe — Classic Dice Board Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic Milton Bradley 13-category scorecard with upper subtotal bonus (+35 for 63+) and lower section combos
 * - Tactile 3D dice physics and animations with customizable skins (Classic Vegas Red, Ivory Porcelain, Golden Sovereign, Cyberpunk Neon)
 * - Interactive felt rolling tray and kept dice tray with smooth hold/release toggles
 * - Live ghost score projections on scorecard predicting point yields in real-time
 * - Yahtzee Bonus (+100) and official Joker wild rules
 * - AI Opponent "The Professor" using probability expected value ($EV$) decision heuristics
 * - Pass & Play local 2-player mode and Solo high score challenge mode
 * - Polyphonic WebAudio synthesizer (cup shaker rattle, tumbling dice on felt, category stamp, Yahtzee victory fanfare)
 * - Hall of Fame records & session statistics with persistent storage
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

export interface YahtzeeStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface YahtzeeStudioInstance {
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

export interface YahtzeeServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static yahtzee assets.
 */
export function getYahtzeeAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/yahtzee"),
    resolve(process.cwd(), "resources/yahtzee"),
    resolve(import.meta.dir, "../../resources/yahtzee"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Yahtzee Royale Deluxe with desktop shortcuts and storage polyfill injected.
 */
export function generateYahtzeeStudioHtml(): string {
  const assetsDir = getYahtzeeAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Yahtzee Royale Deluxe</h1>";

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
 * Starts the Bun.serve server hosting Yahtzee Royale Deluxe.
 */
export function startYahtzeeServer(options: YahtzeeServerOptions = {}) {
  return startStaticStudioServer(
    { app: "yahtzee_studio", name: "Codecaine Yahtzee Royale Deluxe — Classic Dice Board Studio", version: "1.0.0", assetsDir: getYahtzeeAssetsDir(), generateHtml: generateYahtzeeStudioHtml },
    options,
  );
}

/**
 * Creates the complete native desktop instance of Yahtzee Royale Deluxe.
 */
export function createYahtzeeStudio(options: YahtzeeStudioOptions = {}): YahtzeeStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1240);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = "Codecaine Yahtzee Royale Deluxe — Classic Dice Board Studio";

  const app: YahtzeeStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateYahtzeeStudioHtml(),
    run: async () => {
      console.log("🎲 Launching Yahtzee Royale Deluxe...");
      const html = generateYahtzeeStudioHtml();

      let srv: any = null;
      try {
        srv = startYahtzeeServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🎲 Background server active at: ${app.url}`);
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
        console.log(`🎲 Desktop window open (Fullscreen: ${fullscreen ? "Enabled" : "Disabled"}).`);

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
  const port = portFlagIdx !== -1 ? parseInt(args[portFlagIdx + 1]!, 10) : 8998;
  const serverOnly = args.includes("--server") || args.includes("-s");

  if (serverOnly) {
    const srv = startYahtzeeServer({ port, host: "127.0.0.1" });
    console.log(`🎲 Yahtzee Royale Deluxe server running at: http://127.0.0.1:${srv.port}/`);
    await new Promise(() => {});
  } else {
    const app = createYahtzeeStudio({ fullscreen, port });
    app.run();
  }
}
