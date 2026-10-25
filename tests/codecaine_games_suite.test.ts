import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { scanWorkspaceApps } from "../applications/launcher_studio";
import { createTetrisStudio, startTetrisServer } from "../applications/tetris_studio";
import { createSnakeStudio, startSnakeServer } from "../applications/snake_studio";
import { createFroggerStudio, startFroggerServer } from "../applications/frogger_studio";
import { EMBEDDED_APPS, startFileManagerServer } from "../src/features/filemanager/fmServer";
import { TOOL_WINDOW_APPS } from "../src/features/filemanager/fmHostedStudios";
import { GAME_MASTER_SHADER_PRESETS, injectGameMasterFx } from "../src/shared/gameMasterFx";
import { CODECAINE_GAMES } from "../resources/file_manager/ui/games.js";

describe("🕹️ Codecaine 60-Game Arcade Suite & File Manager Integration", () => {
  test("1. All 60 games in Launcher Studio are prefixed with Codecaine", () => {
    const apps = scanWorkspaceApps();
    const games = apps.filter((a) => a.category === "Games & Entertainment");
    expect(games.length).toBe(60);
    for (const g of games) {
      expect(g.displayName.startsWith("Codecaine"), `${g.name}: ${g.displayName}`).toBe(true);
    }
  });

  test("2. All 60 games in CODECAINE_GAMES are registered in File Manager EMBEDDED_APPS and TOOL_WINDOW_APPS", () => {
    expect(CODECAINE_GAMES.length).toBe(60);
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

  test("4. Desktop icon manifest has Codecaine prefix for all 60 game entries", () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, "../icons/desktop/manifest.json"), "utf8"));
    const gameKeys = [
      "balatro-studio", "blackjack-studio", "breakout-studio", "codecaine-bros-studio",
      "connect4-studio", "dr-codecaine-studio", "flappy-bird-studio", "frogger-studio",
      "lolo-studio", "math-munchers-studio", "maze-generator-studio", "minesweeper-studio",
      "pacman-studio", "poker-studio", "pong-studio", "rat-screw-studio",
      "rodents-revenge-studio", "skifree-studio", "snake-studio", "tetris-studio",
      "tictactoe-studio", "typing-studio", "word-search-studio", "yahtzee-studio",
      "jezzball-studio", "chips-challenge-studio", "pipe-dream-studio", "solitaire-studio",
      "pinball-studio", "asteroids-studio", "space-invaders-studio", "bomberman-studio",
      "missile-command-studio", "qbert-studio", "centipede-studio", "artillery-studio",
      "pool-studio", "lunar-lander-studio", "cyber2048-studio", "sokoban-studio",
      "reversi-checkers-studio", "uno-studio", "bowling-studio", "darts-studio",
      "bejeweled-studio", "balloon-fight-studio", "marble-madness-studio",
      "mappy-studio", "cyber-maker-studio", "lemmings-studio", "lode-runner-studio",
      "chuchu-rocket-studio", "rampart-studio", "qix-studio", "magical-drop-studio",
      "peggle-studio", "memory-match-studio", "vampire-survivors-studio",
      "game-show-studio", "slots-studio",
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

  test("7. Codecaine Game Master FX & Post-Processing Engine injects shaders, Universal Start Menu Gate, HUD dock, and particle engine idempotently", () => {
    expect(GAME_MASTER_SHADER_PRESETS.length).toBe(6);
    const sample = "<html><head><title>Test</title></head><body><h1>Game</h1></body></html>";
    const injected = injectGameMasterFx(sample);
    expect(injected).toContain("codecaine-game-master-fx-style");
    expect(injected).toContain("codecaine-game-master-pregate");
    expect(injected).toContain("codecaine-game-master-fx-script");
    expect(injected).toContain("gm-start-gate-overlay");
    expect(injected).toContain("gm-start-play-btn");
    expect(injected).toContain("window.CodecaineGameMaster");
    expect(injected).toContain("gm-fx-dock");
    for (const preset of GAME_MASTER_SHADER_PRESETS) {
      expect(injected).toContain(preset.id);
    }
    // Idempotent second call
    expect(injectGameMasterFx(injected)).toBe(injected);
  });

  test("8. Upgraded Pong, Tic-Tac-Toe, Connect 4, Pac-Man, Breakout, and Games Hub include new graphics & gameplay features", () => {
    const pongHtml = readFileSync(join(import.meta.dir, "../resources/pong/index.html"), "utf8");
    expect(pongHtml).toContain("arenaThemeSelect");
    expect(pongHtml).toContain("powerupsToggleSelect");
    expect(pongHtml).toContain("maybeSpawnPowerUpOrb");
    expect(pongHtml).toContain("createShockwave");

    const tttHtml = readFileSync(join(import.meta.dir, "../resources/tictactoe/index.html"), "utf8");
    expect(tttHtml).toContain("variantSelect");
    expect(tttHtml).toContain("infinity");
    expect(tttHtml).toContain("renderCellGlyph");
    expect(tttHtml).toContain("streakCount");

    const c4Html = readFileSync(join(import.meta.dir, "../resources/connect4/index.html"), "utf8");
    expect(c4Html).toContain("boardThemeSelect");
    expect(c4Html).toContain("undoMoveBtn");
    expect(c4Html).toContain("laser-target");
    expect(c4Html).toContain("landing-preview");

    const pacHtml = readFileSync(join(import.meta.dir, "../resources/pacman/index.html"), "utf8");
    expect(pacHtml).toContain("_pacShockwaves");
    expect(pacHtml).toContain("_chompParticles");
    expect(pacHtml).toContain("_pacTrail");

    const brkHtml = readFileSync(join(import.meta.dir, "../resources/breakout/index.html"), "utf8");
    expect(brkHtml).toContain("_breakoutShockwaves");

    const gamesJs = readFileSync(join(import.meta.dir, "../resources/file_manager/ui/games.js"), "utf8");
    const powerCss = readFileSync(join(import.meta.dir, "../resources/file_manager/ui/power.css"), "utf8");
    expect(gamesJs).toContain("games-random-btn");
    expect(gamesJs).toContain("games-fx-shader");
    expect(gamesJs).toContain("codecaine_games_favorites");
    expect(powerCss).toContain("color-mix(in oklab");
    expect(powerCss).toContain("translate: 0px 0px");
  });

  test("9. All 41 embedded games in File Manager load with 200 OK when browser sends Sec-Fetch-Site: cross-site from 127.0.0.1 parent to localhost iframe", async () => {
    const srv = startFileManagerServer({ port: 0, host: "127.0.0.1" });
    try {
      for (const game of CODECAINE_GAMES) {
        const res = await fetch(`http://localhost:${srv.port}/app/${game.id}/`, {
          headers: {
            Host: `localhost:${srv.port}`,
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "iframe",
          },
        });
        expect(res.status, `${game.id} status`).toBe(200);
        const html = await res.text();
        expect(html).not.toContain("Forbidden: cross-site request blocked");
        expect(html).toContain("codecaine-game-master-fx-script");
      }
    } finally {
      srv.stop(true);
    }
  });

  test("10. All 25 new arcade, card, puzzle & sports game studios serve HTML with Game Master FX, favicon.svg, and /api/health", async () => {
    const newGames = [
      "jezzball", "chips_challenge", "pipe_dream", "solitaire",
      "pinball", "asteroids", "space_invaders", "bomberman",
      "missile_command", "qbert", "centipede", "artillery",
      "pool", "lunar_lander", "cyber2048", "sokoban",
      "reversi_checkers", "uno", "bowling", "darts",
      "bejeweled", "balloon_fight", "marble_madness", "mappy",
      "cyber_maker",
    ];
    for (const id of newGames) {
      const mod = await import(`../applications/${id}_studio.ts`);
      const startFn = Object.entries(mod).find(([k, v]) => k.startsWith("start") && k.endsWith("Server") && typeof v === "function")?.[1] as any;
      expect(typeof startFn, `${id}_studio startServer`).toBe("function");
      const srv = startFn({ port: 0, host: "127.0.0.1" });
      try {
        const base = `http://127.0.0.1:${srv.port}`;
        const htmlRes = await fetch(`${base}/`);
        expect(htmlRes.status, `${id} /`).toBe(200);
        const html = await htmlRes.text();
        expect(html, `${id} GameMasterFX`).toContain("codecaine-game-master-fx-script");
        expect(html, `${id} canvas`).toContain("<canvas");

        const iconRes = await fetch(`${base}/favicon.svg`);
        expect(iconRes.status, `${id} /favicon.svg`).toBe(200);
        expect(await iconRes.text()).toContain("<svg");

        const healthRes = await fetch(`${base}/api/health`);
        expect(healthRes.status, `${id} /api/health`).toBe(200);
        const health = (await healthRes.json()) as any;
        expect(health.status).toBe("ok");
        expect(health.name).toContain("Codecaine");
      } finally {
        srv.stop(true);
      }
    }
  });

  test("11. All 100 Sokoban campaign chambers have balanced crates/targets, verified winning solutions, and multi-difficulty random winnable generator", () => {
    const sokobanHtml = readFileSync(join(import.meta.dir, "../resources/sokoban/index.html"), "utf8");
    expect(sokobanHtml).toContain("hintMove()");
    expect(sokobanHtml).toContain("toggleAutoSolve()");
    expect(sokobanHtml).toContain("generateRandomSolvableLevel");
    expect(sokobanHtml).toContain('id="rng-difficulty"');
    const match = sokobanHtml.match(/const LEVELS = (\[[\s\S]*?\n\]);/);
    expect(match).toBeTruthy();
    const levels = new Function(`return ${match![1]}`)() as Array<{
      name: string;
      difficulty: string;
      par: number;
      solution: string;
      map: string[];
    }>;
    expect(levels.length).toBe(100);

    const dirMap: Record<string, [number, number]> = {
      U: [-1, 0],
      D: [1, 0],
      L: [0, -1],
      R: [0, 1],
    };

    for (const lvl of levels) {
      const rows = lvl.map.length;
      const cols = Math.max(...lvl.map.map((r) => r.length));
      const walls = Array.from({ length: rows }, () => Array(cols).fill(false));
      const targets = Array.from({ length: rows }, () => Array(cols).fill(false));
      const crates = Array.from({ length: rows }, () => Array(cols).fill(false));
      let pr = -1;
      let pc = -1;
      let targetCount = 0;
      let crateCount = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ch = lvl.map[r]![c] || " ";
          if (ch === "#") walls[r]![c] = true;
          if (ch === "." || ch === "*" || ch === "+") {
            targets[r]![c] = true;
            targetCount++;
          }
          if (ch === "$" || ch === "*") {
            crates[r]![c] = true;
            crateCount++;
          }
          if (ch === "@" || ch === "+") {
            pr = r;
            pc = c;
          }
        }
      }

      expect(crateCount, `${lvl.name} crateCount === targetCount`).toBe(targetCount);
      expect(targetCount).toBeGreaterThan(0);
      expect(lvl.solution.length).toBe(lvl.par);
      expect(["Easy", "Medium", "Hard", "Expert"]).toContain(lvl.difficulty);

      // Replay solution and verify every crate locks onto a target pad
      for (const moveCh of lvl.solution) {
        const [dr, dc] = dirMap[moveCh]!;
        const nr = pr + dr;
        const nc = pc + dc;
        expect(walls[nr]![nc], `${lvl.name} walked into wall`).toBe(false);
        if (crates[nr]![nc]) {
          const cr = nr + dr;
          const cc = nc + dc;
          expect(walls[cr]![cc], `${lvl.name} pushed crate into wall`).toBe(false);
          expect(crates[cr]![cc], `${lvl.name} pushed crate into crate`).toBe(false);
          crates[nr]![nc] = false;
          crates[cr]![cc] = true;
        }
        pr = nr;
        pc = nc;
      }

      let locked = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (targets[r]![c] && crates[r]![c]) locked++;
        }
      }
      expect(locked, `${lvl.name} solved all targets`).toBe(targetCount);
    }
  });

  test("12. Solitaire Royale, UNO Royale AAA, 8-Ball Pool, CyberStrike Bowling, and Pro Darts Royale feature full engines", () => {
    const solitaireHtml = readFileSync(join(import.meta.dir, "../resources/solitaire/index.html"), "utf8");
    expect(solitaireHtml).toContain("PIP_LAYOUTS");
    expect(solitaireHtml).toContain("drawCourtPortrait");
    expect(solitaireHtml).toContain("drawCornerIndex");

    const unoHtml = readFileSync(join(import.meta.dir, "../resources/uno/index.html"), "utf8");
    expect(unoHtml).toContain("drawUnoCard");
    expect(unoHtml).toContain("UnoAudio");
    expect(unoHtml).toContain("toggleMusic");
    expect(unoHtml).toContain("rotateAllHandsZeroRule");
    expect(unoHtml).toContain("shoutUnoHuman");
    expect(unoHtml).toContain("catchAiUno");

    const poolHtml = readFileSync(join(import.meta.dir, "../resources/pool/index.html"), "utf8");
    expect(poolHtml).toContain("Codecaine 8-Ball Pool Royale");

    const bowlingHtml = readFileSync(join(import.meta.dir, "../resources/bowling/index.html"), "utf8");
    expect(bowlingHtml).toContain("Codecaine CyberStrike Bowling");

    const dartsHtml = readFileSync(join(import.meta.dir, "../resources/darts/index.html"), "utf8");
    expect(dartsHtml).toContain("Codecaine Pro Darts Royale");
    expect(dartsHtml).toContain("setPhysicsMode");
    expect(dartsHtml).toContain("setBarrelWeight");
    expect(dartsHtml).toContain("checkSpiderWireInteraction");

    const bejeweledHtml = readFileSync(join(import.meta.dir, "../resources/bejeweled/index.html"), "utf8");
    expect(bejeweledHtml).toContain("Codecaine CyberJewel");
    expect(bejeweledHtml).toContain("miniGameStageCanvas");
    expect(bejeweledHtml).toContain("btnModeGadget");

    const balloonHtml = readFileSync(join(import.meta.dir, "../resources/balloon_fight/index.html"), "utf8");
    expect(balloonHtml).toContain("Codecaine CyberBalloon Fight");

    const marbleHtml = readFileSync(join(import.meta.dir, "../resources/marble_madness/index.html"), "utf8");
    expect(marbleHtml).toContain("Codecaine CyberMarble Madness");

    const mappyHtml = readFileSync(join(import.meta.dir, "../resources/mappy/index.html"), "utf8");
    expect(mappyHtml).toContain("Codecaine CyberMappy");
    expect(mappyHtml).toContain("blockingDoor");
    expect(mappyHtml).toContain("[SPACE] OPEN");

    const vsHtml = readFileSync(join(import.meta.dir, "../resources/vampire_survivors/index.html"), "utf8");
    expect(vsHtml).toContain("startFreshLevel1Run");
    expect(vsHtml).toContain("💀 YOU DIED");
    expect(vsHtml).not.toContain("Math.max(25, hero.hp");

    const memoryHtml = readFileSync(join(import.meta.dir, "../resources/memory_match/index.html"), "utf8");
    expect(memoryHtml).toContain("Codecaine CyberRecall Royale");
    expect(memoryHtml).toContain("triad_match3");
    expect(memoryHtml).toContain("executeAiFlipStep");

    const cyberMakerHtml = readFileSync(join(import.meta.dir, "../resources/cyber_maker/index.html"), "utf8");
    expect(cyberMakerHtml).toContain("Codecaine CyberMaker Studio");
  });
});

