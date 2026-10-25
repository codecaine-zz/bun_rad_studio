import { injectGameMasterFx } from "../src/shared/gameMasterFx";
/**
 * 🚀 Codecaine CyberLander: Vector Descent Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
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

export interface LunarLanderStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface LunarLanderStudioInstance {
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

export interface LunarLanderServerOptions {
  port?: number;
  host?: string;
}

export function getLunarLanderAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/lunar_lander"),
    resolve(process.cwd(), "resources/lunar_lander"),
    resolve(import.meta.dir, "../../resources/lunar_lander"),
    resolve(import.meta.dir, "../resources/lunar_lander_studio"),
    resolve(process.cwd(), "resources/lunar_lander_studio"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateLunarLanderStudioHtml(): string {
  const assetsDir = getLunarLanderAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : "<h1>Codecaine CyberLander: Vector Descent</h1>";

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

export function startLunarLanderServer(options: LunarLanderServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "lunar_lander_studio",
      name: "Codecaine CyberLander: Vector Descent",
      version: "2.5.0",
      assetsDir: getLunarLanderAssetsDir(),
      generateHtml: generateLunarLanderStudioHtml,
    },
    options,
  );
}

export function createLunarLanderStudio(options: LunarLanderStudioOptions = {}): LunarLanderStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1180);
  const height = options.height ?? (fullscreen ? screen.height : 840);
  const title = "Codecaine CyberLander: Vector Descent";

  const app: LunarLanderStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateLunarLanderStudioHtml(),
    run: async () => {
      console.log("🚀 Launching Codecaine CyberLander: Vector Descent...");
      const html = generateLunarLanderStudioHtml();

      let srv: any = null;
      try {
        srv = startLunarLanderServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🚀 Background server active at: ${app.url}`);
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

export class LunarLanderStudio {
  public static async launch() {
    const app = createLunarLanderStudio({ fullscreen: false });
    await app.run();
  }
}

export const createLunarLanderApp = createLunarLanderStudio;
export const startLunarLanderStudioServer = startLunarLanderServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startLunarLanderServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🚀 Codecaine CyberLander: Vector Descent Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createLunarLanderStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
