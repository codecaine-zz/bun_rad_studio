import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  generateMazeStudioHtml,
  startMazeStudioServer,
  loadMazeState,
  saveMazeState,
  getMazeStatePath,
} from "../applications/maze_generator_studio";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const E = require("../resources/maze_generator/engine.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maze-test-"));
const stateFile = path.join(tmp, "state.json");
const origState = process.env.MAZE_GENERATOR_STATE_FILE;

beforeAll(() => {
  process.env.MAZE_GENERATOR_STATE_FILE = stateFile;
});

afterAll(() => {
  if (origState === undefined) delete process.env.MAZE_GENERATOR_STATE_FILE;
  else process.env.MAZE_GENERATOR_STATE_FILE = origState;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const resetState = (obj?: unknown) => {
  try { fs.rmSync(stateFile); } catch {}
  if (obj !== undefined) fs.writeFileSync(stateFile, JSON.stringify(obj));
};

// ---------------------------------------------------------------------------------------------
// 1. Engine: Generation Algorithms & Graph Properties
// ---------------------------------------------------------------------------------------------
describe("maze engine: generation algorithms", () => {
  test("all 5 algorithms create valid spanning labyrinths connecting start (0,0) to exit", () => {
    const algos = Object.keys(E.ALGORITHMS);
    expect(algos).toEqual(["dfs", "prim", "kruskal", "wilson", "braided"]);

    for (const algo of algos) {
      for (const diff of ["easy", "medium"]) {
        const p = E.generatePuzzle({ algo, diff, seed: `test-seed-${algo}-${diff}` });
        expect(p.grid.length).toBe(p.rows);
        expect(p.grid[0].length).toBe(p.cols);
        expect(p.exit).toEqual({ x: p.cols - 1, y: p.rows - 1 });

        // Verify start can reach exit via A*
        expect(p.solutionPath).not.toBeNull();
        expect(p.solutionPath.length).toBeGreaterThan(p.cols);
        expect(p.solutionPath[0]).toEqual({ x: 0, y: 0 });
        expect(p.solutionPath[p.solutionPath.length - 1]).toEqual(p.exit);

        // Verify solution steps are contiguous (distance = 1)
        for (let i = 1; i < p.solutionPath.length; i++) {
          const a = p.solutionPath[i - 1];
          const b = p.solutionPath[i];
          const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
          expect(dist).toBe(1);
        }
      }
    }
  });

  test("seeded PRNG is deterministic across repeated runs", () => {
    const p1 = E.generatePuzzle({ algo: "kruskal", diff: "medium", seed: "cyber-seed-42" });
    const p2 = E.generatePuzzle({ algo: "kruskal", diff: "medium", seed: "cyber-seed-42" });
    const p3 = E.generatePuzzle({ algo: "kruskal", diff: "medium", seed: "different-seed-99" });

    expect(JSON.stringify(p1.grid)).toBe(JSON.stringify(p2.grid));
    expect(p1.solutionPath).toEqual(p2.solutionPath);
    expect(JSON.stringify(p1.grid)).not.toBe(JSON.stringify(p3.grid));
  });

  test("braided maze reduces dead ends compared to standard tree mazes", () => {
    const unbraided = E.generatePuzzle({ algo: "dfs", diff: "medium", seed: "braid-check" });
    const braided = E.generatePuzzle({ algo: "braided", diff: "medium", seed: "braid-check", braidFactor: 0.8 });

    const deUnbraided = E.findDeadEnds(unbraided.grid, unbraided.cols, unbraided.rows);
    const deBraided = E.findDeadEnds(braided.grid, braided.cols, braided.rows);

    expect(deBraided.length).toBeLessThan(deUnbraided.length);
  });

  test("shards are placed in dead ends and exclude start and exit", () => {
    const p = E.generatePuzzle({ algo: "prim", diff: "medium", seed: "shard-test" });
    expect(p.shards.length).toBeGreaterThan(0);

    for (const s of p.shards) {
      expect(s.x === 0 && s.y === 0).toBe(false);
      expect(s.x === p.exit.x && s.y === p.exit.y).toBe(false);
      expect(s.collected).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Engine: Pathfinding Solvers (A*, Dijkstra, BFS)
// ---------------------------------------------------------------------------------------------
describe("maze engine: pathfinding solvers", () => {
  test("A*, Dijkstra, and BFS all find optimal paths, while A* explores fewer or equal nodes", () => {
    const p = E.generatePuzzle({ algo: "dfs", diff: "medium", seed: "solver-compare" });

    const astar = E.solveMaze(p.grid, p.cols, p.rows, { x: 0, y: 0 }, p.exit, "astar");
    const dijkstra = E.solveMaze(p.grid, p.cols, p.rows, { x: 0, y: 0 }, p.exit, "dijkstra");
    const bfs = E.solveMaze(p.grid, p.cols, p.rows, { x: 0, y: 0 }, p.exit, "bfs");

    expect(astar.path).not.toBeNull();
    expect(dijkstra.path).not.toBeNull();
    expect(bfs.path).not.toBeNull();

    // Optimal paths should have equal cost
    expect(astar.cost).toBe(dijkstra.cost);
    expect(astar.cost).toBe(bfs.cost);

    // Explored nodes recorded
    expect(astar.nodesExplored).toBeGreaterThan(0);
    expect(dijkstra.nodesExplored).toBeGreaterThan(0);
    expect(bfs.nodesExplored).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Engine: Telemetry, Daily Puzzles & Statistics
// ---------------------------------------------------------------------------------------------
describe("maze engine: telemetry, daily challenges, and statistics", () => {
  test("time formatting and star calculations", () => {
    expect(E.formatTime(0)).toBe("00:00");
    expect(E.formatTime(59000)).toBe("00:59");
    expect(E.formatTime(65000)).toBe("01:05");
    expect(E.formatTime(3600000)).toBe("60:00");

    expect(E.calculateStars(10, 19, 19, 10)).toBe("★★★");
    expect(E.calculateStars(100, 19, 19, 10)).toBe("★☆☆");
  });

  test("daily puzzle configuration is deterministic per day and distinct across days", () => {
    const d1 = E.dailyConfig(new Date("2026-10-12T10:00:00Z"));
    const d2 = E.dailyConfig(new Date("2026-10-12T22:00:00Z"));
    const d3 = E.dailyConfig(new Date("2026-10-13T10:00:00Z"));

    expect(d1.seed).toBe(d2.seed);
    expect(d1.diff).toBe(d2.diff);
    expect(d1.algo).toBe(d2.algo);

    expect(d1.seed).not.toBe(d3.seed);
  });

  test("statistics sanitization and record tracking", () => {
    expect(E.sanitizeSettings({ mode: "invalid", diff: "insane" })).toMatchObject({
      mode: "classic",
      diff: "insane",
      algo: "dfs",
      solver: "astar",
    });

    let stats = E.emptyStats();
    expect(stats.played).toBe(0);

    const r1 = E.recordGame(stats, { won: true, mode: "classic", diff: "medium", timeMs: 45000, steps: 50, shards: 3 });
    stats = r1.stats;
    expect(stats.played).toBe(1);
    expect(stats.won).toBe(1);
    expect(stats.shardsCollected).toBe(3);
    expect(stats.best["classic|medium"].timeMs).toBe(45000);
    expect(r1.isNewBestTime).toBe(true);

    // Slower game does not overwrite best
    const r2 = E.recordGame(stats, { won: true, mode: "classic", diff: "medium", timeMs: 60000, steps: 80, shards: 1 });
    stats = r2.stats;
    expect(stats.played).toBe(2);
    expect(stats.best["classic|medium"].timeMs).toBe(45000);
    expect(r2.isNewBestTime).toBe(false);

    // Surrendered game recorded
    const r3 = E.recordGame(stats, { won: false, surrendered: true, mode: "classic", diff: "medium", steps: 20 });
    stats = r3.stats;
    expect(stats.played).toBe(3);
    expect(stats.surrendered).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Server: HTML Assembly, State API & Security
// ---------------------------------------------------------------------------------------------
describe("maze studio server & persistence", () => {
  test("generated HTML inlines the engine and injects escaped state", () => {
    resetState({ settings: { theme: "magenta" }, stats: { played: 5, note: "</script><b>" } });
    const html = generateMazeStudioHtml();

    expect(html).not.toContain('src="engine.js"');
    expect(html).toContain("window.MazeEngine");
    expect(html).toContain("window.__MAZE_STATE__");
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("\\u003c/script>");
  });

  test("state round-trips atomically; malformed input is rejected", () => {
    resetState();
    expect(loadMazeState()).toEqual({});

    expect(saveMazeState(JSON.stringify({ settings: { theme: "amber" }, stats: { played: 1 } }))).toBe(true);
    expect(loadMazeState()).toEqual({ settings: { theme: "amber" }, stats: { played: 1 } });

    expect(saveMazeState("not json")).toBe(false);
    expect(saveMazeState("[1, 2, 3]")).toBe(false);
    expect(saveMazeState({ settings: "x".repeat(70_000) })).toBe(false);

    // Corrupted file falls back to {}
    fs.writeFileSync(getMazeStatePath(), "{{broken json");
    expect(loadMazeState()).toEqual({});
    expect(fs.readdirSync(tmp).filter((f) => f.endsWith(".tmp")).length).toBe(0);
  });

  test("HTTP server endpoints: root, engine.js, health, state GET/POST, origin protection", async () => {
    resetState();
    const srv = startMazeStudioServer({ port: 0 });
    const base = `http://127.0.0.1:${srv.port}`;

    try {
      // 1. Root & static
      const resRoot = await fetch(`${base}/`);
      expect(resRoot.status).toBe(200);
      expect(await resRoot.text()).toContain("Cyberpunk Maze");

      const resEng = await fetch(`${base}/engine.js`);
      expect(resEng.status).toBe(200);
      expect(await resEng.text()).toContain("MazeEngine");

      // 2. Health check
      const resHealth = await (await fetch(`${base}/api/health`)).json() as any;
      expect(resHealth.status).toBe("ok");
      expect(resHealth.app).toBe("maze_generator_studio");

      // 3. State GET & POST
      const resGet1 = await (await fetch(`${base}/api/state`)).json();
      expect(resGet1).toEqual({});

      const postData = { settings: { theme: "green", diff: "hard" }, stats: { played: 2 } };
      const resPost = await fetch(`${base}/api/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postData),
      });
      expect(resPost.status).toBe(200);

      const resGet2 = await (await fetch(`${base}/api/state`)).json();
      expect(resGet2).toEqual(postData);

      // 4. Cross-origin rejection
      const evilPost = await fetch(`${base}/api/state`, {
        method: "POST",
        headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
        body: JSON.stringify(postData),
      });
      expect(evilPost.status).toBe(403);

      // 5. Malformed payload & unsupported method
      const badPost = await fetch(`${base}/api/state`, { method: "POST", body: "not-json" });
      expect(badPost.status).toBe(400);

      const badMethod = await fetch(`${base}/api/state`, { method: "DELETE" });
      expect(badMethod.status).toBe(405);

      // 6. Path traversal blocked
      const trav = await fetch(`${base}/..%2f..%2fpackage.json`);
      expect(trav.status).not.toBe(200);
    } finally {
      srv.stop(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 5. The real page, running in jsdom under Node
// ---------------------------------------------------------------------------------------------
describe("maze page (jsdom, run under node)", () => {
  test("all page tests pass", () => {
    resetState();
    const baseFile = path.join(tmp, "base.html");
    fs.writeFileSync(baseFile, generateMazeStudioHtml());
    const r = Bun.spawnSync(["node", "--test", "--test-reporter=spec", path.join(import.meta.dir, "maze_generator_page.node.mjs")], {
      cwd: path.join(import.meta.dir, ".."),
      env: { ...process.env, MAZE_BASE_HTML: baseFile, MAZE_STATE_FILE: stateFile },
    });
    const out = r.stdout.toString() + r.stderr.toString();
    if (r.exitCode !== 0) console.log(out);
    expect(r.exitCode).toBe(0);
  }, 60_000);
});
