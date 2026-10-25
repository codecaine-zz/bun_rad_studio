/**
 * 🎰 Codecaine Vegas Jackpot Slots Royale: Hold & Spin, Megaways & Progressive Link
 *
 * Complete cross-platform desktop application powered by Bun RAD Studio & Webview.
 * Features:
 * - 8 Real Vegas Casino Floor Slot Cabinets:
 *   1. ⚡ Lightning Cash Link: Hold & Spin (6+ Cash Orbs trigger 3-Respin Lock & Reset + GRAND Jackpot)
 *   2. 🦬 Cyber-Buffalo Gold Stampede (1,024 Ways + 2x/3x Wild Sunset Multipliers up to 27x)
 *   3. 🏛️ Gates of Cyber-Olympus (Tumble Cascades + Zeus 2x–500x Winged Multiplier Orbs)
 *   4. 🏺 Triple Coin Treasure Pots (Red Multiplier Pot, Green 5x6 Expand Pot, Gold Jackpot Pick Pot)
 *   5. 🍒 Triple Diamond 777 High-Limit Stepper (Classic 3-Reel Mechanical Stepper + 2x/5x/10x Diamond Wilds & Nudge)
 *   6. 🎡 Wheel of Vegas Mega-Spin (Top-Box Progressive Bonus Wheel Spin)
 *   7. 🐺 Sticky Expanding Wilds & Mystery Doors (Full-Reel Locked Wilds + Synchronized Gold Mystery Reveal)
 *   8. 👑 VIP 4-Cabinet Multi-Spin (Play 4 Synchronized Slot Machines Simultaneously!)
 * - 4 Live Ticking Progressive Jackpot Meters: GRAND ($1,250,000+), MAJOR ($50,000+), MINOR ($10,000+), MINI ($2,500+)
 * - Real Casino Sensory Engineering: Reel 5 Near-Miss Anticipation Drumroll & Spotlight, Odometer Win Roll-Up,
 *   3D Coin Fountain Shower, Slam-Stop [SPACE], Buy Bonus Feature [B], Auto-Spin [A] & Turbo Spin [T]
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

export const DEFAULT_PORT = 3278;
export const APP_PORT = Number(process.env.SLOTS_PORT || DEFAULT_PORT);
export const APP_TITLE = "Codecaine Vegas Jackpot Slots Royale: Hold & Spin";

export interface SlotsStudioOptions {
  fullscreen?: boolean;
  width?: number;
  height?: number;
  alwaysOnTop?: boolean;
  port?: number;
  host?: string;
}

export interface SlotsStudioInstance {
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

export function getSlotsAssetsDir(): string {
  const candidates = [
    resolve(import.meta.dir, "../resources/slots"),
    resolve(process.cwd(), "resources/slots"),
    resolve(import.meta.dir, "../../resources/slots"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) return c;
  }
  return candidates[0]!;
}

export function generateSlotsStudioHtml(): string {
  const assetsDir = getSlotsAssetsDir();
  const indexPath = join(assetsDir, "index.html");
  let html = existsSync(indexPath)
    ? readFileSync(indexPath, "utf8")
    : `<h1>${APP_TITLE}</h1>`;
  const shortcutScript = `<script>${getWindowShortcutsScript()}</script>`;
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${shortcutScript}\n</head>`);
  } else {
    html = shortcutScript + html;
  }
  return injectGameMasterFx(html);
}

export function startSlotsServer(options: { port?: number; host?: string } = {}) {
  return startStaticStudioServer(
    {
      app: "slots_studio",
      name: APP_TITLE,
      version: "2.0.0",
      assetsDir: getSlotsAssetsDir(),
      generateHtml: generateSlotsStudioHtml,
    },
    options
  );
}

export function createSlotsStudio(options: SlotsStudioOptions = {}): SlotsStudioInstance {
  const screen = getScreenDimensions();
  const width = options.width ?? Math.min(1440, screen.width);
  const height = options.height ?? Math.min(920, screen.height);
  const fullscreen = options.fullscreen ?? false;

  const app: SlotsStudioInstance = {
    title: `🎰 ${APP_TITLE}`,
    width,
    height,
    fullscreen,
    generateHtml: generateSlotsStudioHtml,
    run: async () => {
      let srv: any = null;
      try {
        srv = startSlotsServer({ port: options.port ?? 0, host: options.host ?? "127.0.0.1" });
        app.server = srv;
        app.port = srv.port;
        app.url = `http://127.0.0.1:${srv.port}`;

        const { Webview, SizeHint } = await import("webview-bun");
        const html = generateSlotsStudioHtml();
        const webview = new Webview(false, {
          width,
          height,
          hint: SizeHint.NONE,
        });
        app.webview = webview;
        webview.title = app.title;

        try {
          if (fullscreen) {
            toggleFullscreenNative(webview);
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

export const SlotsStudio = createSlotsStudio;
export const createSlotsApp = createSlotsStudio;
export const startSlotsStudioServer = startSlotsServer;

if (process.argv.includes("--server")) {
  const port = parseInt(process.env.SLOTS_PORT || process.env.PORT || "0", 10);
  const srv = startSlotsServer({ port, host: "127.0.0.1" });
  console.log(`READY:${srv.port}`);
  console.log(`🎰 ${APP_TITLE} Server listening on http://127.0.0.1:${srv.port}`);
  setInterval(() => {}, 60000);
} else if (import.meta.main) {
  const fullscreen = process.argv.includes("--fullscreen") || process.argv.includes("-f");
  const app = createSlotsStudio({ fullscreen });
  await app.run();
  process.exit(0);
}
