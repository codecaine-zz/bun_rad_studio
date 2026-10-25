import { injectGameMasterFx } from "../src/shared/gameMasterFx";
/**
 * ⚡ Codecaine CyberChomp Arcade - Neon Remaster Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Production-level Codecaine CyberChomp arcade remaster
 * - Authentic 4-ghost AI personalities (Crimson, Pulse, Glitch, Amber)
 * - Power pellets, bonus fruit spawns, real-time sound synthesis & neon particle effects
 * - Responsive canvas, mobile touch D-pad & desktop arcade hotkeys
 */

import type { SizeHint, Webview } from "webview-bun";
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

export interface PacmanStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface PacmanStudioInstance {
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

export interface PacmanServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getPacmanAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/pacman"),
    resolve(process.cwd(), "resources/pacman"),
    resolve(import.meta.dir, "../../resources/pacman"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Codecaine CyberChomp with desktop shortcuts injected.
 */
export function generatePacmanStudioHtml(): string {
  const assetsDir = getPacmanAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Codecaine CyberChomp Arcade</h1>";

  const desktopHooks = `
  <script>
    // Desktop RAD Studio Integration
    window.addEventListener("DOMContentLoaded", function() {
      var hubBtn = document.querySelector(".nav-btn[aria-label*='Hub']") || document.querySelector("a[href='/']");
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

/**
 * Starts the Bun.serve server hosting Codecaine CyberChomp Arcade.
 */
export function startPacmanStudioServer(options: PacmanServerOptions = {}) {
  return startStaticStudioServer(
    { app: "pacman_studio", name: "Codecaine CyberChomp Arcade - Neon Remaster", version: "1.0.0", assetsDir: getPacmanAssetsDir(), generateHtml: generatePacmanStudioHtml },
    options,
  );
}

/**
 * Creates the complete native desktop instance of Codecaine CyberChomp.
 */
export function createPacmanStudio(options: PacmanStudioOptions = {}): PacmanStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1200);
  const height = options.height ?? (fullscreen ? screen.height : 900);
  const title = "Codecaine CyberChomp Arcade - Neon Remaster";

  const app: PacmanStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generatePacmanStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Codecaine CyberChomp Arcade...");
      const html = generatePacmanStudioHtml();

      let srv: any = null;
      try {
        srv = startPacmanStudioServer({
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

export const createPacmanApp = createPacmanStudio;
export const createPacman = createPacmanStudio;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startPacmanStudioServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Cyberpunk Pac-Man Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createPacmanStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
