import { injectGameMasterFx } from "../src/shared/gameMasterFx";
/**
 * 🎈 Codecaine CyberBalloon Fight: Sky Joust & Storm Trip Studio
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

export const DEFAULT_PORT = 3263;
export const APP_TITLE = "Codecaine CyberBalloon Fight: Sky Joust & Storm Trip";

export interface BalloonFightStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface BalloonFightStudioInstance {
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

export interface BalloonFightServerOptions {
  port?: number;
  host?: string;
}

export function getBalloonFightAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/balloon_fight"),
    resolve(process.cwd(), "resources/balloon_fight"),
    resolve(import.meta.dir, "../../resources/balloon_fight"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateBalloonFightStudioHtml(): string {
  const assetsDir = getBalloonFightAssetsDir();
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

export function startBalloonFightServer(options: BalloonFightServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "balloon_fight_studio",
      name: APP_TITLE,
      version: "2.5.0",
      assetsDir: getBalloonFightAssetsDir(),
      generateHtml: generateBalloonFightStudioHtml,
    },
    options,
  );
}

export function createBalloonFightStudio(options: BalloonFightStudioOptions = {}): BalloonFightStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1280);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = APP_TITLE;

  const app: BalloonFightStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateBalloonFightStudioHtml(),
    run: async () => {
      console.log(`🎈 Launching ${APP_TITLE}...`);
      const html = generateBalloonFightStudioHtml();

      let srv: any = null;
      try {
        srv = startBalloonFightServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🎈 Background server active at: ${app.url}`);
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

export class BalloonFightStudio {
  public static async launch() {
    const app = createBalloonFightStudio({ fullscreen: false });
    await app.run();
  }
}

export const createBalloonFightApp = createBalloonFightStudio;
export const startBalloonFightStudioServer = startBalloonFightServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || process.env.BALLOON_FIGHT_PORT || "0", 10);
  const srv = startBalloonFightServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🎈 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createBalloonFightStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
