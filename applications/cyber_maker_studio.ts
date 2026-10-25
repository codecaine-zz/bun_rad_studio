/**
 * 🏗️ Codecaine CyberMaker Studio: OS Kernel World Architect
 *
 * Next-Gen AAA Platformer Level Editor, Physics Sandbox & Multi-OS Course Builder
 * powered by Bun RAD Studio & Webview.
 *
 * Features:
 * - Seamless Dual-Mode Engine: 🛠️ EDIT STUDIO ↔ 🎬 PLAYTEST ARENA [P / Tab]
 * - 5 OS Kernel World Themes: Linux Tundra, macOS Aqua Glass, FreeBSD Citadel,
 *   Windows 95/NT Vaporwave Desktop, and Bun & Codecaine Cyber-Core
 * - 36+ Interactive Blocks, OS Power-Ups, Hazards, Gizmos, and Boss Encounters
 * - Pro Level Editor Tools: Brush, Line, Box Fill, Flood Bucket, Rail Track Painter,
 *   Logic Wire Linker, Eyedropper, Eraser, Modifiers (Wings, Parachute, 2x Giant),
 *   Onion-Skin Playtest Trail, 30-Step Undo/Redo, Minimap Scrubber & JSON Course Sharing
 * - 8 Built-In Playable Courses + 1-Click Procedural AI Course Architect [G]
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

export const DEFAULT_PORT = 3266;
export const APP_TITLE = "Codecaine CyberMaker Studio: OS Kernel World Architect";

export interface CyberMakerStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface CyberMakerStudioInstance {
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

export interface CyberMakerServerOptions {
  port?: number;
  host?: string;
}

export function getCyberMakerAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/cyber_maker"),
    resolve(process.cwd(), "resources/cyber_maker"),
    resolve(import.meta.dir, "../../resources/cyber_maker"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateCyberMakerStudioHtml(): string {
  const assetsDir = getCyberMakerAssetsDir();
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

  return injectGameMasterFx(html);
}

export function startCyberMakerServer(options: CyberMakerServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "cyber_maker_studio",
      name: APP_TITLE,
      version: "1.0.0",
      assetsDir: getCyberMakerAssetsDir(),
      generateHtml: generateCyberMakerStudioHtml,
    },
    options,
  );
}

export function createCyberMakerStudio(options: CyberMakerStudioOptions = {}): CyberMakerStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1440);
  const height = options.height ?? (fullscreen ? screen.height : 920);
  const title = APP_TITLE;

  const app: CyberMakerStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateCyberMakerStudioHtml(),
    run: async () => {
      console.log(`🏗️ Launching ${APP_TITLE}...`);
      const html = generateCyberMakerStudioHtml();

      let srv: any = null;
      try {
        srv = startCyberMakerServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🏗️ Background server active at: ${app.url}`);
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
        console.log(`🏗️ Desktop window open (Fullscreen: ${fullscreen ? "Enabled" : "Disabled"}).`);

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

export const CyberMakerStudio = createCyberMakerStudio;
export const createCyberMakerApp = createCyberMakerStudio;
export const startCyberMakerStudioServer = startCyberMakerServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.CYBER_MAKER_PORT || process.env.PORT || "0", 10);
  const srv = startCyberMakerServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🏗️ ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createCyberMakerStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
