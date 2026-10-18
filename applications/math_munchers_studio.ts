/**
 * 👾 Math Munchers Deluxe — Cyber Legends Arcade Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Authentic procedural math matrix grid (Multiples, Factors, Primes, Equalities, Inequalities)
 * - Animated Cyber Muncher with directional facing, chomping mouth, and power-up shields
 * - Interactive Troggles AI: Reggie, Basher, Glitcher with lane rushes & grid corruption
 * - Triple-A procedural Pentatonic WebAudio synthesizer engine (crunch chomps, fanfare, roars)
 * - CRT screen shader suite (Subtle, Heavy, Clean Arcade) with scanline post-processing
 * - Full Gamepad API, touch virtual D-pad, keyboard shortcuts & persistent SafeStorage
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

export interface MathMunchersStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface MathMunchersStudioInstance {
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

export interface MathMunchersServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getMathMunchersAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/math_munchers"),
    resolve(process.cwd(), "resources/math_munchers"),
    resolve(import.meta.dir, "../../resources/math_munchers"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Math Munchers with desktop shortcuts injected.
 */
export function generateMathMunchersStudioHtml(): string {
  const assetsDir = getMathMunchersAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Math Munchers Deluxe</h1>";

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
 * Starts the Bun.serve server hosting Math Munchers.
 */
export function startMathMunchersServer(options: MathMunchersServerOptions = {}) {
  return startStaticStudioServer(
    { app: "math_munchers_studio", name: "Codecaine Math Munchers Deluxe — Cyber Legends Arcade", version: "1.0.0", assetsDir: getMathMunchersAssetsDir(), generateHtml: generateMathMunchersStudioHtml },
    options,
  );
}

/**
 * Creates the complete native desktop instance of Math Munchers Deluxe.
 */
export function createMathMunchersStudio(options: MathMunchersStudioOptions = {}): MathMunchersStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1240);
  const height = options.height ?? (fullscreen ? screen.height : 880);
  const title = "Codecaine Math Munchers Deluxe — Cyber Legends Arcade";

  const app: MathMunchersStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateMathMunchersStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Math Munchers Deluxe...");
      const html = generateMathMunchersStudioHtml();

      let srv: any = null;
      try {
        srv = startMathMunchersServer({
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

export const createMathMunchersApp = createMathMunchersStudio;
export const createMathMunchers = createMathMunchersStudio;
export const startMathMunchersStudioServer = startMathMunchersServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startMathMunchersServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Math Munchers Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createMathMunchersStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
