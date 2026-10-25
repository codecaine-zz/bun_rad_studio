import { injectGameMasterFx } from "../src/shared/gameMasterFx";
/**
 * ⚡ Minesweeper Pro — Championship Deluxe Master Edition Studio
 * 
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Championship Minesweeper with 100% Safe First-Click & Chord Clearing
 * - Real-time 3BV benchmark and 3BV/s click efficiency tracker
 * - Multi-theme engine (Rip Engine Graveyard, Win95 Classic, Cyber Neon, Amber CRT)
 * - Triple-A procedural WebAudio synthesizer & particle canvas explosion engine
 * - Keyboard / WASD navigation, Practice/Undo mode & high scores
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

export interface MinesweeperStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
  theme?: string;
}

export interface MinesweeperStudioInstance {
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

export interface MinesweeperServerOptions {
  port?: number;
  host?: string;
}

/**
 * Resolves the directory containing the static web assets.
 */
export function getMinesweeperAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/minesweeper"),
    resolve(process.cwd(), "resources/minesweeper"),
    resolve(import.meta.dir, "../../resources/minesweeper"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

/**
 * Generates the complete HTML for Minesweeper Pro with desktop shortcuts injected.
 */
export function generateMinesweeperStudioHtml(): string {
  const assetsDir = getMinesweeperAssetsDir();
  const indexPath = join(assetsDir, "index.html");

  let html = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "<h1>Minesweeper Pro</h1>";

  const desktopHooks = `
  <script>
    // Desktop RAD Studio Integration
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

/**
 * Starts the Bun.serve server hosting Minesweeper Pro.
 */
export function startMinesweeperServer(options: MinesweeperServerOptions = {}) {
  return startStaticStudioServer(
    { app: "minesweeper_studio", name: "Codecaine Minesweeper Pro — Championship Deluxe Master Edition", version: "1.0.0", assetsDir: getMinesweeperAssetsDir(), generateHtml: generateMinesweeperStudioHtml },
    options,
  );
}

/**
 * Creates the complete native desktop instance of Minesweeper Pro.
 */
export function createMinesweeperStudio(options: MinesweeperStudioOptions = {}): MinesweeperStudioInstance {
  const fullscreen = options.fullscreen ?? true;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1200);
  const height = options.height ?? (fullscreen ? screen.height : 860);
  const title = "Codecaine Minesweeper Pro — Championship Deluxe Master Edition";

  const app: MinesweeperStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateMinesweeperStudioHtml(),
    run: async () => {
      console.log("⚡ Launching Minesweeper Pro...");
      const html = generateMinesweeperStudioHtml();

      let srv: any = null;
      try {
        srv = startMinesweeperServer({
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

export const createMinesweeperApp = createMinesweeperStudio;
export const createMinesweeper = createMinesweeperStudio;
export const startMinesweeperStudioServer = startMinesweeperServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.PORT || "0", 10);
  const srv = startMinesweeperServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`⚡ Minesweeper Pro Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = !process.argv.includes("--no-fullscreen") && !process.argv.includes("-w");
  const app = createMinesweeperStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
