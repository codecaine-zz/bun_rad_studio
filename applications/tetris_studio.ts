import { injectGameMasterFx } from "../src/shared/gameMasterFx";
/**
 * ⚡ Codecaine TetroGrid Ultra Deluxe — Cyber Grid Master Edition Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - True 7-Bag Randomizer & SRS-inspired multi-point wall kicks + 180-degree flip
 * - 4 Game Modes: Marathon (20 levels), 40-Line Sprint, 2-Minute Ultra, and Zen Chill
 * - 3-Corner T-Spin, Back-to-Back (B2B), Combo, and Perfect Clear detection
 * - 4 Visual Themes (Cyberpunk Neon, Synthwave Sunset, Matrix Grid, Retro Handheld)
 * - Polyphonic Web Audio API chiptune/synthwave sequencer + interactive Arcade Deck
 */

import type { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { startStaticStudioServer } from "../src/studio_server";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export interface TetrisStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface TetrisStudioInstance {
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

export interface TetrisServerOptions {
  port?: number;
  host?: string;
}

export function getTetrisAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/tetris_studio"),
    resolve(process.cwd(), "resources/tetris_studio"),
    resolve(import.meta.dir, "../../resources/tetris_studio"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateTetrisStudioHtml(): string {
  const assetsDir = getTetrisAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : "<h1>Codecaine TetroGrid Ultra Deluxe</h1>";

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

  return injectGameMasterFx(html);
}

export function startTetrisServer(options: TetrisServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "tetris_studio",
      name: "Codecaine TetroGrid Ultra Deluxe — Cyber Grid Master Edition",
      version: "2.0.0",
      assetsDir: getTetrisAssetsDir(),
      generateHtml: generateTetrisStudioHtml,
    },
    options,
  );
}

export function createTetrisStudio(options: TetrisStudioOptions = {}): TetrisStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1080);
  const height = options.height ?? (fullscreen ? screen.height : 820);
  const title = "Codecaine TetroGrid Ultra Deluxe — Cyber Grid Master Edition";

  const app: TetrisStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateTetrisStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Codecaine TetroGrid Ultra Deluxe...");
      const html = generateTetrisStudioHtml();

      let srv: any = null;
      try {
        srv = startTetrisServer({
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

export class TetrisStudio {
  public static async launch() {
    const app = createTetrisStudio({ fullscreen: false });
    await app.run();
  }
}

export const createTetrisApp = createTetrisStudio;
export const startTetrisStudioServer = startTetrisServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startTetrisServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Codecaine Tetris Ultra Deluxe Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createTetrisStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
