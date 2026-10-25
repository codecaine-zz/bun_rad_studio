/**
 * 🔮 Codecaine CyberMarble Madness: Isometric Gravity Odyssey Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 */

import type { SizeHint, Webview } from "webview-bun";
import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";
import { startStaticStudioServer } from "../src/studio_server";
import { injectGameMasterFx } from "../src/shared/gameMasterFx";
import {
  setAlwaysOnTopNative,
  setWindowPositionNative,
  attachWindowShortcuts,
  toggleFullscreenNative,
  getWindowShortcutsScript,
  getScreenDimensions,
} from "../index.ts";

export const DEFAULT_PORT = 3264;
export const APP_TITLE = "Codecaine CyberMarble Madness: Isometric Gravity Odyssey";

export interface MarbleMadnessStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface MarbleMadnessStudioInstance {
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

export interface MarbleMadnessServerOptions {
  port?: number;
  host?: string;
}

export function getMarbleMadnessAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/marble_madness"),
    resolve(process.cwd(), "resources/marble_madness"),
    resolve(import.meta.dir, "../../resources/marble_madness"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateMarbleMadnessStudioHtml(): string {
  const assetsDir = getMarbleMadnessAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : "<h1>Codecaine CyberMarble Madness: Isometric Gravity Odyssey</h1>";

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

export function startMarbleMadnessServer(options: MarbleMadnessServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "marble_madness_studio",
      name: APP_TITLE,
      version: "2.5.0",
      assetsDir: getMarbleMadnessAssetsDir(),
      generateHtml: generateMarbleMadnessStudioHtml,
    },
    options,
  );
}

export function createMarbleMadnessStudio(options: MarbleMadnessStudioOptions = {}): MarbleMadnessStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = APP_TITLE;

  const app: MarbleMadnessStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateMarbleMadnessStudioHtml(),
    run: async () => {
      console.log("🔮 Launching Codecaine CyberMarble Madness: Isometric Gravity Odyssey...");
      const html = generateMarbleMadnessStudioHtml();

      let srv: any = null;
      try {
        srv = startMarbleMadnessServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🔮 Background server active at: ${app.url}`);
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

export class MarbleMadnessStudio {
  public static async launch() {
    const app = createMarbleMadnessStudio({ fullscreen: false });
    await app.run();
  }
}

export const createMarbleMadnessApp = createMarbleMadnessStudio;
export const startMarbleMadnessStudioServer = startMarbleMadnessServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.MARBLE_MADNESS_PORT || process.env.PORT || "0", 10);
  const srv = startMarbleMadnessServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🔮 Codecaine CyberMarble Madness Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createMarbleMadnessStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
