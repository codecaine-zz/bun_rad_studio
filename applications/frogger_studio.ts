/**
 * ⚡ Codecaine CyberFrog Deluxe — Neon Highway Edition Studio
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 */

import { SizeHint, Webview } from "webview-bun";
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

export interface FroggerStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface FroggerStudioInstance {
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

export interface FroggerServerOptions {
  port?: number;
  host?: string;
}

export function getFroggerAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/frogger_studio"),
    resolve(process.cwd(), "resources/frogger_studio"),
    resolve(import.meta.dir, "../../resources/frogger_studio"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateFroggerStudioHtml(): string {
  const assetsDir = getFroggerAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : "<h1>Codecaine CyberFrog Deluxe</h1>";

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

  return html;
}

export function startFroggerServer(options: FroggerServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "frogger_studio",
      name: "Codecaine CyberFrog Deluxe — Neon Highway Edition",
      version: "2.0.0",
      assetsDir: getFroggerAssetsDir(),
      generateHtml: generateFroggerStudioHtml,
    },
    options,
  );
}

export function createFroggerStudio(options: FroggerStudioOptions = {}): FroggerStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1080);
  const height = options.height ?? (fullscreen ? screen.height : 840);
  const title = "Codecaine CyberFrog Deluxe — Neon Highway Edition";

  const app: FroggerStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateFroggerStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Codecaine CyberFrog Deluxe...");
      const html = generateFroggerStudioHtml();

      let srv: any = null;
      try {
        srv = startFroggerServer({
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

export class FroggerStudio {
  public static async launch() {
    const app = createFroggerStudio({ fullscreen: false });
    await app.run();
  }
}

export const createFroggerApp = createFroggerStudio;
export const startFroggerStudioServer = startFroggerServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startFroggerServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Codecaine CyberFrog Deluxe Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createFroggerStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
