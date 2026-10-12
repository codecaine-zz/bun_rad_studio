// Runs under NODE (jsdom cannot execute page scripts under Bun's vm). Driven by word_search_enhancements.test.ts.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
const E = (() => { const m = { exports: {} }; new Function("module", "exports", fs.readFileSync(new URL("../resources/word_search/engine.js", import.meta.url), "utf8"))(m, m.exports); return m.exports; })();
const BASE = fs.readFileSync(process.env.WS_BASE_HTML, "utf8");
const stateFile = process.env.WS_STATE_FILE;
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return {}; } };
const resetState = (obj) => { try { fs.rmSync(stateFile); } catch {} if (obj !== undefined) fs.writeFileSync(stateFile, JSON.stringify(obj)); };
const gt = (a, b) => assert.ok(a > b, `${a} > ${b}`);
function expect(v) {
  const mk = (neg) => {
    const chk = (ok, msg) => assert.ok(neg ? !ok : ok, (neg ? "NOT " : "") + msg);
    return {
      toBe: (x) => (neg ? assert.notStrictEqual(v, x) : assert.strictEqual(v, x)),
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
  const html = BASE.replace("window.__WS_STATE__ = {};", "window.__WS_STATE__ = " + JSON.stringify(readState()).replace(/</g, "\\u003c") + ";");
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
        const big = this.id === "gridBox";
        return { left: 0, top: 0, right: big ? 600 : 0, bottom: big ? 600 : 0, width: big ? 600 : 0, height: big ? 600 : 0, x: 0, y: 0, toJSON() {} };
      };
      win.wsSaveState = (json) => { fs.writeFileSync(stateFile, json); }; // what the desktop bridge does
    },
  });
  return dom.window;
}
const $ = (w, id) => w.document.getElementById(id);
const puzzleOf = (w) => w.eval("puzzle");
const foundOf = (w) => [...w.eval("Array.from(foundWords)")];
function drag(w, cells) {
  const size = w.eval("gridSize"), cs = 600 / size;
  const pt = (p) => ({ x: (p.c + 0.5) * cs, y: (p.r + 0.5) * cs });
  const a = pt(cells[0]), b = pt(cells[cells.length - 1]);
  $(w, "gridBox").dispatchEvent(new w.MouseEvent("mousedown", { clientX: a.x, clientY: a.y, bubbles: true, cancelable: true }));
  w.dispatchEvent(new w.MouseEvent("mousemove", { clientX: b.x, clientY: b.y }));
  w.dispatchEvent(new w.MouseEvent("mouseup"));
}
const key = (w, k) => w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const click = (w, id) => $(w, id).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

describe("page (jsdom): boot and settings", () => {
  test("saved preferences are applied on start: board, selects, theme", () => {
    resetState({ settings: { category: "animals", size: 10, difficulty: "easy", theme: "sunset", sound: false } });
    const w = boot();
    try {
      expect(w.document.querySelectorAll(".grid-cell").length).toBe(100);
      expect(w.document.querySelectorAll(".word-chip").length).toBe(10);
      expect($(w, "categorySelect").value).toBe("animals");
      expect($(w, "gridSizeSelect").value).toBe("10");
      expect($(w, "difficultySelect").value).toBe("easy");
      expect($(w, "themeSelect").value).toBe("sunset");
      expect(w.document.documentElement.style.getPropertyValue("--neon-cyan")).toBe("#ff9e4d");
      expect(w.eval("soundOn")).toBe(false);
      expect($(w, "soundIcon").textContent).toBe("🔇");
      expect(puzzleOf(w).category).toBe("animals");
    } finally { w.close(); }
  });
  test("corrupt saved state falls back to defaults", () => {
    resetState({ settings: { category: 42, size: "huge" }, stats: "nope" });
    const w = boot();
    try {
      expect(w.document.querySelectorAll(".grid-cell").length).toBe(144);
      expect(puzzleOf(w).category).toBe("cyber");
    } finally { w.close(); }
  });
  test("changing difficulty / size / category / theme starts the right game and is saved", () => {
    resetState();
    const w = boot();
    try {
      $(w, "difficultySelect").value = "easy"; $(w, "difficultySelect").dispatchEvent(new w.Event("change"));
      expect(puzzleOf(w).difficulty).toBe("easy");
      $(w, "gridSizeSelect").value = "14"; $(w, "gridSizeSelect").dispatchEvent(new w.Event("change"));
      expect(w.document.querySelectorAll(".grid-cell").length).toBe(196);
      $(w, "categorySelect").value = "sports"; $(w, "categorySelect").dispatchEvent(new w.Event("change"));
      expect(puzzleOf(w).category).toBe("sports");
      $(w, "themeSelect").value = "arctic"; $(w, "themeSelect").dispatchEvent(new w.Event("change"));
      expect(w.document.documentElement.style.getPropertyValue("--neon-cyan")).toBe("#7dd3fc");
      expect(w.eval("wordColors[placedWords[0].word]")).toBe(E.THEMES.arctic.palette[0]);
      expect(readState().settings).toEqual({ category: "sports", size: 14, difficulty: "easy", theme: "arctic", sound: true });
      click(w, "categoryQuickBtn"); // cycles to the next category
      expect(puzzleOf(w).category).not.toBe("sports");
    } finally { w.close(); }
  });
});

describe("page (jsdom): playing", () => {
  test("dragging a word scores it; streak survives a re-drag of a found word but not a wrong drag", () => {
    resetState();
    const w = boot();
    try {
      const p = puzzleOf(w);
      drag(w, p.placed[0].cells);
      expect(foundOf(w)).toEqual([p.placed[0].word]);
      expect($(w, "scoreVal").textContent).toBe(String(p.placed[0].word.length * 100));
      expect($(w, `chip-${p.placed[0].word}`).classList.contains("found")).toBe(true);
      expect($(w, "foundVal").textContent).toBe(`1 / ${p.placed.length}`);
      drag(w, p.placed[1].cells.slice().reverse()); // backwards selection also works
      expect($(w, "streakVal").textContent).toBe("x2");
      drag(w, p.placed[0].cells);                    // already found: neutral
      expect($(w, "streakVal").textContent).toBe("x2");
      expect(foundOf(w).length).toBe(2);
      drag(w, [{ r: 0, c: 0 }, { r: 0, c: 1 }]);     // wrong
      expect($(w, "streakVal").textContent).toBe("x1");
    } finally { w.close(); }
  });
  test("hints are limited and say so", () => {
    resetState();
    const w = boot();
    try {
      for (let i = 0; i < 3; i++) click(w, "hintBtn");
      expect($(w, "hintsVal").textContent).toBe("0");
      click(w, "hintBtn");
      expect($(w, "wsToast").textContent).toContain("No hints left");
      expect(w.document.querySelectorAll(".hint-pulse").length).toBeGreaterThan(0);
    } finally { w.close(); }
  });
  test("pause stops the clock, hides the board and ignores drags; resume restores", async () => {
    resetState();
    const w = boot();
    try {
      const p = puzzleOf(w);
      await sleep(120);
      click(w, "pauseBtn");
      expect($(w, "gridBox").classList.contains("paused")).toBe(true);
      expect($(w, "pauseOverlay").style.display).toBe("flex");
      expect($(w, "pauseText").textContent).toBe("Resume");
      const t1 = w.eval("getElapsed()");
      await sleep(250);
      expect(w.eval("getElapsed()")).toBe(t1);
      drag(w, p.placed[0].cells);
      expect(foundOf(w).length).toBe(0);
      click(w, "hintBtn");
      expect($(w, "hintsVal").textContent).toBe("3");
      key(w, "p");
      expect($(w, "gridBox").classList.contains("paused")).toBe(false);
      await sleep(150);
      expect(w.eval("getElapsed()")).toBeGreaterThan(t1);
      drag(w, p.placed[0].cells);
      expect(foundOf(w).length).toBe(1);
    } finally { w.close(); }
  });
  test("opening a dialog pauses the clock and closing it (button or Esc) resumes", async () => {
    resetState();
    const w = boot();
    try {
      click(w, "settingsBtn");
      const t1 = w.eval("getElapsed()");
      await sleep(200);
      expect(w.eval("getElapsed()")).toBe(t1);
      expect($(w, "pauseOverlay").style.display).toBe("none"); // the dialog itself covers the board
      key(w, "Escape");
      expect($(w, "settingsModal").style.display).toBe("none");
      await sleep(150);
      expect(w.eval("getElapsed()")).toBeGreaterThan(t1);
      key(w, "?");
      expect($(w, "helpModal").style.display).toBe("flex");
      key(w, "Escape");
      expect($(w, "helpModal").style.display).toBe("none");
    } finally { w.close(); }
  });
  test("new / replay / daily keys", () => {
    resetState();
    const w = boot();
    try {
      const seed0 = w.eval("currentSeed");
      const grid0 = JSON.stringify(puzzleOf(w).grid);
      drag(w, puzzleOf(w).placed[0].cells);
      key(w, "r");
      expect(w.eval("currentSeed")).toBe(seed0);
      expect(JSON.stringify(puzzleOf(w).grid)).toBe(grid0);
      expect(foundOf(w).length).toBe(0);
      key(w, "n");
      expect(w.eval("currentSeed")).not.toBe(seed0);
      key(w, "d");
      const daily = E.dailyConfig();
      expect(w.eval("currentMode")).toBe("daily");
      expect(w.eval("currentSeed")).toBe(daily.seed);
      expect(puzzleOf(w).category).toBe(daily.category);
      expect($(w, "quickCatLabel").textContent).toContain("Daily");
      const dailyGrid = JSON.stringify(puzzleOf(w).grid);
      click(w, "dailyBtn");
      expect(JSON.stringify(puzzleOf(w).grid)).toBe(dailyGrid); // same puzzle every time today
      key(w, "n");
      expect(w.eval("currentMode")).toBe("random");
      expect(puzzleOf(w).category).toBe("cyber"); // preferences were not overwritten by the daily
    } finally { w.close(); }
  });
  test("shortcuts are ignored with modifiers and while a select has focus", () => {
    resetState();
    const w = boot();
    try {
      const seed0 = w.eval("currentSeed");
      w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "n", metaKey: true, bubbles: true }));
      expect(w.eval("currentSeed")).toBe(seed0);
      $(w, "categorySelect").dispatchEvent(new w.KeyboardEvent("keydown", { key: "n", bubbles: true }));
      expect(w.eval("currentSeed")).toBe(seed0);
    } finally { w.close(); }
  });
});

describe("page (jsdom): finishing, statistics, persistence", () => {
  test("solving a puzzle shows the result, records stats and flags new bests; a 2nd win does not", async () => {
    resetState();
    const w = boot();
    try {
      for (const pw of puzzleOf(w).placed) drag(w, pw.cells);
      expect(foundOf(w).length).toBe(puzzleOf(w).placed.length);
      await sleep(550);
      expect($(w, "victoryOverlay").style.display).toBe("flex");
      expect($(w, "resBest").textContent).toBe("NEW BEST SCORE  ·  NEW BEST TIME");
      expect($(w, "overlayStars").textContent).toBe("★★★");
      const saved = readState();
      expect(saved.stats.played).toBe(1);
      expect(saved.stats.won).toBe(1);
      expect(Object.keys(saved.stats.best)).toEqual(["cyber|12|hard"]);
      const firstBest = saved.stats.best["cyber|12|hard"];
      // second game: wait so the time is worse; slower clock, lower streak => no new records
      click(w, "nextGameBtn");
      expect($(w, "victoryOverlay").style.display).toBe("none");
      await sleep(1100);
      for (const pw of puzzleOf(w).placed) { await sleep(30); drag(w, pw.cells); w.eval("lastWordFoundTime = 0"); }
      await sleep(550);
      const again = readState();
      expect(again.stats.won).toBe(2);
      expect(again.stats.best["cyber|12|hard"].timeMs).toBe(firstBest.timeMs);
      expect($(w, "resBest").textContent).toBe("");
    } finally { w.close(); }
  });
  test("give up needs a confirming second click, reveals the board and counts as a played game", () => {
    resetState();
    const w = boot();
    try {
      drag(w, puzzleOf(w).placed[0].cells);
      click(w, "giveUpBtn");
      expect($(w, "giveUpText").textContent).toBe("Sure?");
      expect(w.document.querySelectorAll(".revealed-cell").length).toBe(0);
      click(w, "giveUpBtn");
      expect(w.document.querySelectorAll(".word-chip.revealed").length).toBe(puzzleOf(w).placed.length - 1);
      expect(w.document.querySelectorAll(".revealed-cell").length).toBeGreaterThan(0);
      expect(w.eval("gameActive")).toBe(false);
      const saved = readState();
      expect(saved.stats).toMatchObject({ played: 1, won: 0, words: 1 });
      expect(saved.stats.best).toEqual({});
      drag(w, puzzleOf(w).placed[1].cells); // board is over: nothing more scores
      expect(foundOf(w).length).toBe(1);
      key(w, "n");
      expect(w.eval("gameActive")).toBe(true);
      expect(w.document.querySelectorAll(".revealed-cell").length).toBe(0);
    } finally { w.close(); }
  });
  test("stats dialog shows records and can be reset (two clicks)", async () => {
    resetState({ stats: { played: 4, won: 3, words: 40, bestStreak: 5, best: { "food|12|hard": { score: 12345, timeMs: 83000 }, "daily|12|hard": { score: 999, timeMs: 61000 } } } });
    const w = boot();
    try {
      key(w, "t");
      expect($(w, "statsModal").style.display).toBe("flex");
      const text = $(w, "statsBody").textContent;
      expect(text).toContain("75%");
      expect(text).toContain("Food & Kitchen · 12×12 · Hard");
      expect(text).toContain("Daily puzzle");
      expect(text).toContain("12,345");
      expect(text).toContain("01:23");
      click(w, "resetStatsBtn");
      expect($(w, "resetStatsText").textContent).toContain("again");
      expect((readState()).stats.played).toBe(4);
      click(w, "resetStatsBtn");
      expect((readState()).stats).toEqual(E.emptyStats());
      expect($(w, "statsBody").textContent).toContain("Finish a puzzle");
      click(w, "statsClose");
      expect($(w, "statsModal").style.display).toBe("none");
    } finally { w.close(); }
  });
});
