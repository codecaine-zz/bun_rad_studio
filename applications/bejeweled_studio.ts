import { injectGameMasterFx } from "../src/shared/gameMasterFx";
/**
 * 💎 Codecaine CyberJewel 12-Mode Blitz: Diamond Mine & Prism Royale Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - 12 Playable Game Modes: Classic, Diamond Mine, Lightning, Ice Storm, Butterflies,
 *   Jewel Poker, Zen, Alchemy Gold, Time Bombs, Lava Escape, Boss Raid, and Stratamax 20
 * - 4 Special Power Gems + Combos: Flame Gem (3x3 blast), Star Gem (row+column lightning),
 *   Hypercube (color-wipe arc lightning + Total Board Annihilation), and Supernova (3-row x 3-col mega-beam)
 * - 7 Multi-Faceted Geometric Cut Gems with specular light sweeps, spring physics, and shattering shards
 * - Blazing Speed Meter, Cascade Callouts, AI Best Move Hint [H], and JewelAudio harmonic Web Audio synth
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

export const DEFAULT_PORT = 3262;
export const APP_TITLE = "Codecaine CyberJewel 12-Mode Blitz: Diamond Mine & Prism Royale";

export interface BejeweledStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface BejeweledStudioInstance {
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

export interface BejeweledServerOptions {
  port?: number;
  host?: string;
}

export function getBejeweledAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/bejeweled"),
    resolve(process.cwd(), "resources/bejeweled"),
    resolve(import.meta.dir, "../../resources/bejeweled"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateBejeweledStudioHtml(): string {
  const assetsDir = getBejeweledAssetsDir();
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

  return injectGameMasterFx(html);
}

export function startBejeweledServer(options: BejeweledServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "bejeweled_studio",
      name: APP_TITLE,
      version: "2.5.0",
      assetsDir: getBejeweledAssetsDir(),
      generateHtml: generateBejeweledStudioHtml,
    },
    options,
  );
}

export function createBejeweledStudio(options: BejeweledStudioOptions = {}): BejeweledStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = APP_TITLE;

  const app: BejeweledStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateBejeweledStudioHtml(),
    run: async () => {
      console.log(`💎 Launching ${APP_TITLE}...`);
      const html = generateBejeweledStudioHtml();

      let srv: any = null;
      try {
        srv = startBejeweledServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`💎 Background server active at: ${app.url}`);
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

export class BejeweledStudio {
  public static async launch() {
    const app = createBejeweledStudio({ fullscreen: false });
    await app.run();
  }
}

export const createBejeweledApp = createBejeweledStudio;
export const startBejeweledStudioServer = startBejeweledServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.BEJEWELED_PORT || process.env.PORT || "0", 10);
  const srv = startBejeweledServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`💎 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createBejeweledStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
