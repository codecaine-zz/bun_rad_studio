/**
 * 🎩 Codecaine Mr. Game Show Royale: TV Studio Mega-Pack
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - Animated 3D-Shaded Host Character (🎩 Mr. Caine-Show) with golden microphone, stage spotlights & live quips
 * - 3 Illuminated Contestant Podiums (YOU, 🤖 LEXI-9000, 🤖 MAX-VEGAS) + Live Studio Applause & Jackpot Marquee
 * - 8 Interactive Primetime TV Game Show Modes:
 *   1. 🎡 Wheel of Fortune & Phrase Board (24-Wedge 3D Cash Wheel + 4-Row Illuminated Letter Tile Board)
 *   2. 👹 Press Your Luck: No Whammies Big Board! (18-Square Perimeter Neon Selector + Cyber-Whammy)
 *   3. 📋 Cyber-Feud: Survey Says Top 6! (LED Flip-Board, Strike Overlays & Steal the Bank)
 *   4. 🧠 Cyber-Jeopardy! 5×5 Grid & Daily Double (25-Clue Trivia Wall, Daily Double Wager & Final Jeopardy)
 *   5. 🪙 Price Is Right: Plinko $50,000 Drop! (Higher/Lower Chip Pricing + 12-Row Physics Pegboard)
 *   6. 💼 Deal or No Deal: 20 Golden Briefcases (20 Cases from $1 to $1,000,000 + Live Banker EV Offers)
 *   7. 💎 Millionaire 15-Rung Ladder & 4 Lifelines (50:50, Ask the Audience, Phone AI Friend, Switch Question)
 *   8. 👑 Mr. Game Show Live Episode (Seamless 4-Round Primetime TV Broadcast Championship!)
 * - WebAudio Primetime TV Theme Synthesizer, Wheel Clicker, Plinko Peg Chimes, Whammy Siren & Studio Applause
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

export const DEFAULT_PORT = 3277;
export const APP_PORT = Number(process.env.GAME_SHOW_PORT || DEFAULT_PORT);
export const APP_TITLE = "Codecaine Mr. Game Show Royale: TV Studio Mega-Pack";

export interface GameShowStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface GameShowStudioInstance {
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

export interface GameShowServerOptions {
  port?: number;
  host?: string;
}

export function getGameShowAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/game_show"),
    resolve(process.cwd(), "resources/game_show"),
    resolve(import.meta.dir, "../../resources/game_show"),
  ];

  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }

  return candidates[0]!;
}

export function generateGameShowStudioHtml(): string {
  const assetsDir = getGameShowAssetsDir();
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

export function startGameShowServer(options: GameShowServerOptions = {}) {
  return startStaticStudioServer(
    {
      app: "game_show_studio",
      name: APP_TITLE,
      version: "2.5.0",
      assetsDir: getGameShowAssetsDir(),
      generateHtml: generateGameShowStudioHtml,
    },
    options,
  );
}

export function createGameShowStudio(options: GameShowStudioOptions = {}): GameShowStudioInstance {
  const fullscreen = options.fullscreen ?? false;
  const screen = getScreenDimensions();
  const width = options.width ?? (fullscreen ? screen.width : 1400);
  const height = options.height ?? (fullscreen ? screen.height : 900);
  const title = APP_TITLE;

  const app: GameShowStudioInstance = {
    title,
    width,
    height,
    fullscreen,
    generateHtml: () => generateGameShowStudioHtml(),
    run: async () => {
      console.log(`🎩 Launching ${APP_TITLE}...`);
      const html = generateGameShowStudioHtml();

      let srv: any = null;
      try {
        srv = startGameShowServer({
          port: options.port ?? 0,
          host: options.host ?? "127.0.0.1",
        });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;
        console.log(`🎩 Background server active at: ${app.url}`);
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

export class GameShowStudio {
  public static async launch() {
    const app = createGameShowStudio({ fullscreen: false });
    await app.run();
  }
}

export const createGameShowApp = createGameShowStudio;
export const startGameShowStudioServer = startGameShowServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.GAME_SHOW_PORT || process.env.PORT || "0", 10);
  const srv = startGameShowServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🎩 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createGameShowStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
