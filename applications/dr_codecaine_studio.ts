/**
 * ⚡ Dr. Codecaine - Overclocked Retro Arcade Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Triple-A remastered Dr. Codecaine capsule puzzle game
 * - Polyphonic 8-bit Fever and Chill synthesizers
 * - Glossy 3D capsules, expressive pathogen AI, tactile arcade touch & keyboard controls
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

export interface DrCodecaineStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface DrCodecaineStudioInstance {
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

export interface DrCodecaineServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getDrCodecaineAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/dr_codecaine"),
    resolve(process.cwd(), "resources/dr_codecaine"),
    resolve(import.meta.dir, "../../resources/dr_codecaine"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Dr. Codecaine with desktop shortcuts injected.
 */
export function generateDrCodecaineStudioHtml(): string {
  const assetsDir = getDrCodecaineAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Dr. Codecaine Arcade</h1>";

  const storagePolyfill = `
  <script>
    (function() {
      try {
        var k = '__storage_test__';
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

  return html;
}

/**
 * Starts the Bun.serve server hosting Dr. Codecaine Arcade.
 */
export function startDrCodecaineStudioServer(options: DrCodecaineServerOptions = {}) {
  return startStaticStudioServer(
    { app: "dr_codecaine_studio", name: "Dr. Codecaine - Overclocked Retro Arcade", version: "1.0.0", assetsDir: getDrCodecaineAssetsDir(), generateHtml: generateDrCodecaineStudioHtml },
    options,
  );
}

/**
 * Creates the complete native desktop instance of Dr. Codecaine.
 */
export function createDrCodecaineStudio(options: DrCodecaineStudioOptions = {}): DrCodecaineStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1200);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = "Dr. Codecaine - Overclocked Retro Arcade";

  const app: DrCodecaineStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateDrCodecaineStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Dr. Codecaine Arcade...");
      const html = generateDrCodecaineStudioHtml();

      let srv: any = null;
      try {
        srv = startDrCodecaineStudioServer({
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

export const createDrCodecaineApp = createDrCodecaineStudio;
export const createDrCodecaine = createDrCodecaineStudio;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startDrCodecaineStudioServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Dr. Codecaine Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createDrCodecaineStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
