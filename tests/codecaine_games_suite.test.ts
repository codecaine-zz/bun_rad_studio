import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { scanWorkspaceApps } from "../applications/launcher_studio";
import { createTetrisStudio, startTetrisServer } from "../applications/tetris_studio";
import { createSnakeStudio, startSnakeServer } from "../applications/snake_studio";
import { createFroggerStudio, startFroggerServer } from "../applications/frogger_studio";
import { EMBEDDED_APPS } from "../src/features/filemanager/fmServer";
import { TOOL_WINDOW_APPS } from "../src/features/filemanager/fmHostedStudios";
import { CODECAINE_GAMES } from "../resources/file_manager/ui/games.js";

describe("🕹️ Codecaine 24-Game Arcade Suite & File Manager Integration", () => {
  test("1. All 24 games in Launcher Studio are prefixed with Codecaine", () => {
    const apps = scanWorkspaceApps();
    const games = apps.filter((a) => a.category === "Games & Entertainment");
    expect(games.length).toBe(24);
    for (const g of games) {
      expect(g.displayName.startsWith("Codecaine"), `${g.name}: ${g.displayName}`).toBe(true);
    }
  });

  test("2. All 24 games inCODECAINE_GAMES are registered in File Manager EMBEDDED_APPS and TOOL_WINDOW_APPS", () => {
    expect(CODECAINE_GAMES.length).toBe(24);
    for (const game of CODECAINE_GAMES) {
      expect(game.title.startsWith("Codecaine"), game.id).toBe(true);
      expect(EMBEDDED_APPS[game.id], `EMBEDDED_APPS[${game.id}]`).toBeDefined();
      expect(TOOL_WINDOW_APPS[game.id], `TOOL_WINDOW_APPS[${game.id}]`).toBeDefined();
      expect(TOOL_WINDOW_APPS[game.id]!.title.startsWith("Codecaine"), game.id).toBe(true);
    }
  });

  test("3. Upgraded TetroGrid, Snake, and Frogger studios serve HTML, favicon.svg, and /api/health", async () => {
    const studios = [
      { name: "Codecaine TetroGrid Ultra Deluxe", create: createTetrisStudio, start: startTetrisServer },
      { name: "Codecaine Neon Snake Deluxe", create: createSnakeStudio, start: startSnakeServer },
      { name: "Codecaine CyberFrog Deluxe", create: createFroggerStudio, start: startFroggerServer },
    ];

    for (const s of studios) {
      const instance = s.create({ fullscreen: false });
      expect(instance.title).toContain(s.name);
      expect(instance.generateHtml()).toContain(s.name.toUpperCase());

      const srv = s.start({ port: 0, host: "127.0.0.1" });
      try {
        const base = `http://127.0.0.1:${srv.port}`;
        const htmlRes = await fetch(`${base}/`);
        expect(htmlRes.status).toBe(200);
        expect(await htmlRes.text()).toContain("Codecaine");

        const iconRes = await fetch(`${base}/favicon.svg`);
        expect(iconRes.status).toBe(200);
        expect(await iconRes.text()).toContain("<svg");

        const healthRes = await fetch(`${base}/api/health`);
        expect(healthRes.status).toBe(200);
        const health = (await healthRes.json()) as any;
        expect(health.status).toBe("ok");
        expect(health.name).toContain("Codecaine");
      } finally {
        srv.stop(true);
      }
    }
  });

  test("4. Desktop icon manifest has Codecaine prefix for all 24 game entries", () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, "../icons/desktop/manifest.json"), "utf8"));
    const gameKeys = [
      "balatro-studio", "blackjack-studio", "breakout-studio", "codecaine-bros-studio",
      "connect4-studio", "dr-codecaine-studio", "flappy-bird-studio", "frogger-studio",
      "lolo-studio", "math-munchers-studio", "maze-generator-studio", "minesweeper-studio",
      "pacman-studio", "poker-studio", "pong-studio", "rat-screw-studio",
      "rodents-revenge-studio", "skifree-studio", "snake-studio", "tetris-studio",
      "tictactoe-studio", "typing-studio", "word-search-studio", "yahtzee-studio",
    ];
    for (const k of gameKeys) {
      expect(manifest[k]?.title?.startsWith("Codecaine"), `${k}: ${manifest[k]?.title}`).toBe(true);
    }
  });

  test("5. File Manager games.js uses CSP-safe CSS classes in power.css and zero inline style attributes", () => {
    const gamesJs = readFileSync(join(import.meta.dir, "../resources/file_manager/ui/games.js"), "utf8");
    const powerCss = readFileSync(join(import.meta.dir, "../resources/file_manager/ui/power.css"), "utf8");
    expect(gamesJs).not.toContain('style: "');
    expect(gamesJs).not.toContain(".style.display");
    expect(powerCss).toContain(".games-stage-wrap");
    expect(powerCss).toContain("#games-frame");
    expect(powerCss).toContain(".games-catalog-wrap");
  });

  test("6. All 24 game HTML files include localStorage opaque-origin protection and Pac-Man clamps arena height", () => {
    for (const game of CODECAINE_GAMES) {
      const app = EMBEDDED_APPS[game.id]!;
      const htmlPath = join(import.meta.dir, "..", "resources", app.dir, "index.html");
      const html = readFileSync(htmlPath, "utf8");
      if (html.includes("localStorage")) {
        expect(html.includes("Object.defineProperty") || html.includes("safeGetStorage") || html.includes("try"), `${game.id} storage guard`).toBe(true);
      }
    }
    const pacmanHtml = readFileSync(join(import.meta.dir, "../resources/pacman/index.html"), "utf8");
    expect(pacmanHtml).toContain("max(360px, calc(100vh - 200px))");
  });
});

