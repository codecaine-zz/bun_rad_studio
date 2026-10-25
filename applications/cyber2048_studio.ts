import { injectGameMasterFx } from "../src/shared/gameMasterFx";
/**
 * 🔢 Codecaine Cyber2048 Quantum Merge Studio
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

export interface Cyber2048StudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface Cyber2048StudioInstance {
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

export interface Cyber2048ServerOptions {
  port?: number;
  host?: string;
}

export function getCyber2048AssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/cyber2048"),
    resolve(process.cwd(), "resources/cyber2048"),
    resolve(import.meta.dir, "../../resources/cyber2048"),
    resolve(import.meta.dir, "../resources/cyber2048_studio"),
    resolve(process.cwd(), "resources/cyber2048_studio"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateCyber2048StudioHtml(): string {
  const assetsDir = getCyber2048AssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : "<h1>Codecaine Cyber2048 Quantum Merge</h1>";

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

export function startCyber2048Server(options: Cyber2048ServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "cyber2048_studio",
      name: "Codecaine Cyber2048 Quantum Merge",
      version: "2.5.0",
      assetsDir: getCyber2048AssetsDir(),
      generateHtml: generateCyber2048StudioHtml,
    },
    options,
  );
}

export function createCyber2048Studio(options: Cyber2048StudioOptions = {}): Cyber2048StudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1140);
  const height = options.height ?? (fullscreen ? screen.height : 840);
  const title = "Codecaine Cyber2048 Quantum Merge";

  const app: Cyber2048StudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateCyber2048StudioHtml(),
    run: async () => {
      console.log("🔢 Launching Codecaine Cyber2048 Quantum Merge...");
      const html = generateCyber2048StudioHtml();

      let srv: any = null;
      try {
        srv = startCyber2048Server({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🔢 Background server active at: ${app.url}`);
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

export class Cyber2048Studio {
  public static async launch() {
    const app = createCyber2048Studio({ fullscreen: false });
    await app.run();
  }
}

export const createCyber2048App = createCyber2048Studio;
export const startCyber2048StudioServer = startCyber2048Server;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startCyber2048Server({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🔢 Codecaine Cyber2048 Quantum Merge Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createCyber2048Studio({ fullscreen });
  await app.run();
  process.exit(0);
}
