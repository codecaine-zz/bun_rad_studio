// Runs under NODE (jsdom cannot execute page scripts under Bun's vm). Driven by maze_generator_enhancements.test.ts.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const E = (() => {
  const m = { exports: {} };
  new Function("module", "exports", fs.readFileSync(new URL("../resources/maze_generator/engine.js", import.meta.url), "utf8"))(m, m.exports);
  return m.exports;
})();

const BASE = fs.readFileSync(process.env.MAZE_BASE_HTML, "utf8");
const stateFile = process.env.MAZE_STATE_FILE;
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return {}; } };
const resetState = (obj) => { try { fs.rmSync(stateFile); } catch {} if (obj !== undefined) fs.writeFileSync(stateFile, JSON.stringify(obj)); };

function expect(v) {
  const mk = (neg) => {
    const chk = (ok, msg) => assert.ok(neg ? !ok : ok, (neg ? "NOT " : "") + msg);
    return {
      toBe: (x) => (neg ? assert.notStrictEqual(v, x) : assert.strictEqual(v, x)),
      toBeNull: () => (neg ? assert.notStrictEqual(v, null) : assert.strictEqual(v, null)),
      toEqual: (x) => (neg ? assert.notDeepStrictEqual(v, x) : assert.deepStrictEqual(v, x)),
      toContain: (x) => chk(v.includes(x), `${JSON.stringify(v)} contains ${x}`),
      toBeGreaterThan: (x) => chk(v > x, `${v} > ${x}`),
      toMatchObject: (x) => { for (const k of Object.keys(x)) assert.deepStrictEqual(v[k], x[k]); },
    };
  };
  const r = mk(false); r.not = mk(true); return r;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const html = BASE.replace("window.__MAZE_STATE__ = {};", "window.__MAZE_STATE__ = " + JSON.stringify(readState()).replace(/</g, "\\u003c") + ";");
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1:1/", runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(win) {
      const noop = () => {};
      const ctx = { canvas: {} };
      for (const m of ["scale", "setTransform", "clearRect", "save", "restore", "translate", "rotate", "fillRect", "strokeRect", "beginPath", "closePath", "arc", "fill", "stroke", "moveTo", "lineTo", "fillText", "strokeText", "drawImage", "clip", "rect", "quadraticCurveTo", "bezierCurveTo", "roundRect", "setLineDash", "transform", "ellipse"]) ctx[m] = noop;
      ctx.measureText = () => ({ width: 10 });
      ctx.createLinearGradient = ctx.createRadialGradient = () => ({ addColorStop: noop });
      ctx.getImageData = () => ({ data: [] });

      win.HTMLCanvasElement.prototype.getContext = () => ctx;
      win.HTMLCanvasElement.prototype.toDataURL = () => "data:,";
      win.Element.prototype.getBoundingClientRect = function () {
        const big = this.id === "mazeCanvas" || this.id === "canvasContainer" || this.id === "canvasWrapper";
        return { left: 0, top: 0, right: big ? 600 : 0, bottom: big ? 600 : 0, width: big ? 600 : 0, height: big ? 600 : 0, x: 0, y: 0, toJSON() {} };
      };
      win.mazeSaveState = (json) => { fs.writeFileSync(stateFile, json); };
    },
  });
  return dom.window;
}

const $ = (w, id) => w.document.getElementById(id);
const key = (w, k, code) => w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, code: code || k, bubbles: true, cancelable: true }));
const click = (w, id) => $(w, id).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

describe("page (jsdom): boot and preferences", () => {
  test("saved preferences are loaded into selects, theme, and game state", () => {
    resetState({
      settings: { diff: "hard", algo: "kruskal", solver: "dijkstra", theme: "amber", sound: false, trail: false },
      stats: { played: 3, won: 2, totalSteps: 120, shardsCollected: 5, best: { "classic|hard": { timeMs: 42000, steps: 85 } } }
    });
    const w = boot();
    try {
      expect($(w, "diffSelect").value).toBe("hard");
      expect($(w, "algoSelect").value).toBe("kruskal");
      expect($(w, "solverSelect").value).toBe("dijkstra");
      expect($(w, "themeSelect").value).toBe("amber");
      expect($(w, "soundIcon").textContent).toBe("🔇");
      expect(w.eval("currentDiff")).toBe("hard");
      expect(w.eval("currentAlgo")).toBe("kruskal");
      expect(w.eval("currentSolver")).toBe("dijkstra");
      expect(w.eval("cols")).toBe(29);
      expect($(w, "bestTimeVal").textContent).toBe("00:42");
    } finally { w.close(); }
  });

  test("changing selects updates game state and persists to disk", () => {
    resetState();
    const w = boot();
    try {
      $(w, "diffSelect").value = "easy";
      $(w, "diffSelect").dispatchEvent(new w.Event("change"));
      expect(w.eval("cols")).toBe(11);
      expect(w.eval("currentDiff")).toBe("easy");

      $(w, "algoSelect").value = "wilson";
      $(w, "algoSelect").dispatchEvent(new w.Event("change"));
      expect(w.eval("currentAlgo")).toBe("wilson");

      $(w, "solverSelect").value = "bfs";
      $(w, "solverSelect").dispatchEvent(new w.Event("change"));
      expect(w.eval("currentSolver")).toBe("bfs");

      $(w, "themeSelect").value = "green";
      $(w, "themeSelect").dispatchEvent(new w.Event("change"));
      expect(w.eval("currentTheme")).toBe("green");

      const saved = readState();
      expect(saved.settings).toMatchObject({ diff: "easy", algo: "wilson", solver: "bfs", theme: "green" });
    } finally { w.close(); }
  });
});

describe("page (jsdom): gameplay and actions", () => {
  test("new (N), replay (R), and daily (D) generation controls", () => {
    resetState();
    const w = boot();
    try {
      const seed0 = w.eval("currentSeed");
      // Replay preserves same seed
      click(w, "replayBtn");
      expect(w.eval("currentSeed")).toBe(seed0);

      // New generates fresh seed
      click(w, "regenBtn");
      expect(w.eval("currentSeed")).not.toBe(seed0);

      // Daily button triggers daily puzzle without overwriting user settings
      click(w, "dailyBtn");
      expect(w.eval("isDaily")).toBe(true);
      expect(w.eval("currentSeed")).toContain("DAILY-");
      expect($(w, "mazeToast").textContent).toContain("Daily Challenge");
    } finally { w.close(); }
  });

  test("pause (P or Space) stops timer and shows pause overlay; resuming restores timer", async () => {
    resetState();
    const w = boot();
    try {
      await sleep(100);
      click(w, "pauseBtn");
      expect(w.eval("isPaused")).toBe(true);
      expect($(w, "pauseOverlay").style.display).toBe("flex");
      expect($(w, "pauseText").textContent).toBe("Resume");

      const t1 = w.eval("accumulatedElapsed");
      await sleep(150);
      expect(w.eval("accumulatedElapsed")).toBe(t1);

      // Key toggle (P or Space) resumes
      key(w, "p");
      expect(w.eval("isPaused")).toBe(false);
      expect($(w, "pauseOverlay").style.display).toBe("none");
      expect($(w, "pauseText").textContent).toBe("Pause");
    } finally { w.close(); }
  });

  test("give up (G) requires 2 clicks, displays surrender status, and reveals optimal solution", () => {
    resetState();
    const w = boot();
    try {
      click(w, "giveUpBtn");
      expect($(w, "giveUpText").textContent).toBe("Sure?");
      expect(w.eval("gameLost")).toBe(false);

      // Second click confirms surrender
      click(w, "giveUpBtn");
      expect($(w, "giveUpText").textContent).toBe("Revealed");
      expect(w.eval("gameLost")).toBe(true);
      expect(w.eval("gameActive")).toBe(false);
      expect(w.eval("hintPath")).not.toBeNull();
      expect($(w, "mazeToast").textContent).toContain("surrendered");

      const saved = readState();
      expect(saved.stats.played).toBe(1);
      expect(saved.stats.surrendered).toBe(1);
    } finally { w.close(); }
  });

  test("hints decrement and display toast when empty", () => {
    resetState();
    const w = boot();
    try {
      expect($(w, "hintsVal").textContent).toBe("3");
      click(w, "hintBtn");
      expect($(w, "hintsVal").textContent).toBe("2");
      click(w, "hintBtn");
      click(w, "hintBtn");
      expect($(w, "hintsVal").textContent).toBe("0");

      click(w, "hintBtn");
      expect($(w, "mazeToast").textContent).toContain("No hint charges remaining");
    } finally { w.close(); }
  });

  test("stats dialog (T) shows records and supports 2-click reset", () => {
    resetState({
      stats: { played: 10, won: 8, surrendered: 2, totalSteps: 540, shardsCollected: 14, best: { "classic|medium": { timeMs: 38000, steps: 60 } } }
    });
    const w = boot();
    try {
      key(w, "t");
      expect($(w, "statsModal").style.display).toBe("flex");
      expect($(w, "statsBody").textContent).toContain("80%");
      expect($(w, "statsBody").textContent).toContain("540");
      expect($(w, "statsBody").textContent).toContain("00:38");

      // 1st click on reset
      click(w, "resetStatsBtn");
      expect($(w, "resetStatsText").textContent).toContain("confirm");
      expect(readState().stats.played).toBe(10);

      // 2nd click resets
      click(w, "resetStatsBtn");
      expect($(w, "statsBody").textContent).toContain("No recorded completed missions");
      expect(readState().stats.played).toBe(0);

      click(w, "statsClose");
      expect($(w, "statsModal").style.display).toBe("none");
    } finally { w.close(); }
  });
});
