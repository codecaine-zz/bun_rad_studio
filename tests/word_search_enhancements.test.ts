import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  generateWordSearchStudioHtml, startWordSearchStudioServer, loadWordSearchState, saveWordSearchState, getWordSearchStatePath,
} from "../applications/word_search_studio";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const E = require("../resources/word_search/engine.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ws-test-"));
const stateFile = path.join(tmp, "state.json");
const origState = process.env.WORD_SEARCH_STATE_FILE;
beforeAll(() => { process.env.WORD_SEARCH_STATE_FILE = stateFile; });
afterAll(() => {
  if (origState === undefined) delete process.env.WORD_SEARCH_STATE_FILE; else process.env.WORD_SEARCH_STATE_FILE = origState;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const resetState = (obj?: unknown) => { try { fs.rmSync(stateFile); } catch {} if (obj !== undefined) fs.writeFileSync(stateFile, JSON.stringify(obj)); };

// ---------------------------------------------------------------------------------------------
describe("engine: puzzle generation", () => {
  test("every category, size and difficulty yields a full, correct board", () => {
    for (const cat of Object.keys(E.CATEGORIES)) {
      for (const size of [10, 12, 14]) {
        for (const diff of Object.keys(E.DIFFICULTIES)) {
          const p = E.generatePuzzle({ category: cat, size, difficulty: diff, seed: "unit" });
          expect(p.placed.length).toBe(E.SIZES[size].words);
          expect(p.grid.length).toBe(size);
          for (const row of p.grid) { expect(row.length).toBe(size); for (const ch of row) expect(ch).toMatch(/^[A-Z]$/); }
          for (const w of p.placed) {
            expect(E.selectionText(p.grid, w.cells)).toBe(w.word); // cells are in reading order
            expect(w.cells.length).toBe(w.word.length);
          }
        }
      }
    }
  });
  test("same seed gives the same puzzle, different seed a different one", () => {
    const a = E.generatePuzzle({ category: "food", size: 12, difficulty: "hard", seed: "abc" });
    const b = E.generatePuzzle({ category: "food", size: 12, difficulty: "hard", seed: "abc" });
    const c = E.generatePuzzle({ category: "food", size: 12, difficulty: "hard", seed: "abd" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a.grid)).not.toBe(JSON.stringify(c.grid));
  });
  test("difficulty controls directions: easy only right/down, medium never backwards, hard uses backwards", () => {
    const dirOf = (w: any) => ({ dr: Math.sign(w.cells[1].r - w.cells[0].r), dc: Math.sign(w.cells[1].c - w.cells[0].c) });
    for (let i = 0; i < 12; i++) {
      for (const w of E.generatePuzzle({ category: "cyber", size: 14, difficulty: "easy", seed: `e${i}` }).placed) {
        const d = dirOf(w); expect(d.dr >= 0 && d.dc >= 0 && (d.dr + d.dc) > 0 && !(d.dr === 1 && d.dc === 1)).toBe(true);
      }
      for (const w of E.generatePuzzle({ category: "cyber", size: 14, difficulty: "medium", seed: `m${i}` }).placed) {
        const d = dirOf(w); expect(d.dc).toBeGreaterThanOrEqual(0); expect(d.dr === 0 && d.dc < 0).toBe(false);
      }
    }
    let backwards = 0;
    for (let i = 0; i < 12; i++) for (const w of E.generatePuzzle({ category: "cyber", size: 14, difficulty: "hard", seed: `h${i}` }).placed) {
      const d = dirOf(w); if (d.dc < 0 || d.dr < 0 && d.dc === 0) backwards++;
    }
    expect(backwards).toBeGreaterThan(0);
  });
  test("word pool: uppercase A-Z, deduped, fits the grid and has no word contained in another", () => {
    const pool = E.buildPool(["alpha", "ALPHABET", "beta", "be", "tebah", "Hello World", "x-ray", "gamma", "GAMMA"], 12);
    for (const w of ["ALPHABET", "BETA", "GAMMA"]) expect(pool).toContain(w);
    expect(pool).not.toContain("TEBAH");       // reverse of HABET, inside ALPHABET
    expect(pool.filter((w: string) => w === "GAMMA").length).toBe(1); // deduped
    expect(pool).not.toContain("ALPHA");       // contained in ALPHABET
    expect(pool).not.toContain("BE");          // too short
    expect(pool).not.toContain("HELLO WORLD"); // not A-Z only
    expect(pool).not.toContain("X-RAY");
    expect(E.buildPool(["ABCDEFGHIJKL"], 10)).toEqual([]);
    for (const cat of Object.values(E.CATEGORIES) as any[]) {
      expect(new Set(cat.words).size).toBe(cat.words.length);
      for (const w of cat.words) expect(w).toMatch(/^[A-Z]{3,}$/);
      expect(E.buildPool(cat.words, 10).length).toBeGreaterThanOrEqual(E.SIZES[10].words);
    }
  });
  test("unknown settings fall back to safe defaults instead of throwing", () => {
    const p = E.generatePuzzle({ category: "nope", size: 99, difficulty: "x", seed: 7 });
    expect(p.category).toBe("cyber"); expect(p.size).toBe(12); expect(p.difficulty).toBe("hard");
    expect(p.placed.length).toBeGreaterThan(0);
  });
});

describe("engine: selection, scoring, stats", () => {
  const p = E.generatePuzzle({ category: "music", size: 12, difficulty: "hard", seed: "sel" });
  const w0 = p.placed[0];
  test("computeLine accepts straight and diagonal lines only", () => {
    expect(E.computeLine({ r: 2, c: 2 }, { r: 2, c: 5 }).length).toBe(4);
    expect(E.computeLine({ r: 5, c: 5 }, { r: 2, c: 2 }).length).toBe(4);
    expect(E.computeLine({ r: 0, c: 0 }, { r: 2, c: 1 })).toEqual([{ r: 0, c: 0 }]);
    expect(E.computeLine({ r: 1, c: 1 }, { r: 1, c: 1 })).toEqual([{ r: 1, c: 1 }]);
  });
  test("found / reversed / already / miss", () => {
    const found = new Set<string>();
    let r = E.matchSelection(p, found, w0.cells);
    expect(r.status).toBe("found"); expect(r.word).toBe(w0.word);
    r = E.matchSelection(p, found, w0.cells.slice().reverse());
    expect(r.status).toBe("found");
    expect(E.selectionText(p.grid, r.cells)).toBe(w0.word); // reading order restored
    found.add(w0.word);
    expect(E.matchSelection(p, found, w0.cells).status).toBe("already");
    expect(E.matchSelection(p, found, w0.cells.slice().reverse()).status).toBe("already");
    expect(E.matchSelection(p, found, [{ r: 0, c: 0 }, { r: 0, c: 1 }]).status).toBe("miss");
  });
  test("scoring, streaks, stars, time format", () => {
    expect(E.pointsForWord(5, 1)).toBe(500);
    expect(E.pointsForWord(5, 3)).toBe(1500);
    expect(E.pointsForWord(5, 0)).toBe(500);
    expect(E.nextStreak(0, 0, 5000)).toBe(1);
    expect(E.nextStreak(2, 1000, 9000)).toBe(3);
    expect(E.nextStreak(2, 1000, 11001)).toBe(1);
    expect(E.starsFor(60_000, 12)).toBe(3);
    expect(E.starsFor(150_000, 12)).toBe(2);
    expect(E.starsFor(400_000, 12)).toBe(1);
    expect(E.starsFor(100_000, 14)).toBe(3); // bigger boards get more time
    expect(E.starsFor(100_000, 10)).toBe(2);
    expect(E.formatTime(0)).toBe("00:00"); expect(E.formatTime(65_000)).toBe("01:05"); expect(E.formatTime(-5)).toBe("00:00");
  });
  test("daily puzzle is stable per date and varies across dates", () => {
    const d = new Date(2026, 9, 12);
    expect(E.dailyConfig(d)).toEqual(E.dailyConfig(new Date(2026, 9, 12, 23, 59)));
    expect(E.dailyConfig(d).key).toBe("2026-10-12");
    const cats = new Set<string>();
    for (let i = 1; i <= 40; i++) cats.add(E.dailyConfig(new Date(2026, 0, i)).category);
    expect(cats.size).toBeGreaterThan(4);
  });
  test("settings and stats sanitising, and record keeping", () => {
    expect(E.sanitizeSettings({ category: "zzz", size: 7, difficulty: 3, theme: "x", sound: "yes" })).toEqual(E.DEFAULT_SETTINGS);
    expect(E.sanitizeSettings({ category: "food", size: "14", difficulty: "easy", theme: "arctic", sound: false }))
      .toEqual({ category: "food", size: 14, difficulty: "easy", theme: "arctic", sound: false });
    expect(E.sanitizeStats("junk")).toEqual(E.emptyStats());
    expect(E.sanitizeStats({ played: -3, won: 2.9, best: { a: { score: "x", timeMs: 1 }, b: { score: 5, timeMs: 9 } } }))
      .toEqual({ played: 0, won: 2, words: 0, bestStreak: 0, best: { b: { score: 5, timeMs: 9 } } });
    const cfg = { category: "food", size: 12, difficulty: "hard" };
    let r = E.recordGame(E.emptyStats(), cfg, { won: true, words: 13, score: 5000, timeMs: 90_000, maxStreak: 4 });
    expect(r.newBestScore && r.newBestTime).toBe(true);
    r = E.recordGame(r.stats, cfg, { won: true, words: 13, score: 4000, timeMs: 80_000, maxStreak: 2 });
    expect(r.newBestScore).toBe(false); expect(r.newBestTime).toBe(true);
    expect(r.stats.best["food|12|hard"]).toEqual({ score: 5000, timeMs: 80_000 });
    r = E.recordGame(r.stats, cfg, { won: false, words: 3, score: 900, timeMs: 10_000, maxStreak: 1 });
    expect(r.stats).toMatchObject({ played: 3, won: 2, words: 29, bestStreak: 4 });
    expect(r.newBestScore || r.newBestTime).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe("server: HTML assembly and state API", () => {
  test("generated page inlines the engine and injects escaped saved state", () => {
    resetState({ settings: { category: "food" }, stats: { played: 1, note: "</script><b>" } });
    const html = generateWordSearchStudioHtml();
    expect(html).not.toContain('src="engine.js"');
    expect(html).toContain("window.WordSearchEngine");
    expect(html).toContain("window.__WS_STATE__");
    expect(html).not.toContain("</script><b>");
    expect(html).toContain("\\u003c/script>");
  });
  test("state round-trips atomically; garbage, arrays and oversized payloads are rejected", () => {
    resetState();
    expect(loadWordSearchState()).toEqual({});
    expect(saveWordSearchState(JSON.stringify({ settings: { theme: "arctic" }, stats: { played: 2 } }))).toBe(true);
    expect(loadWordSearchState()).toEqual({ settings: { theme: "arctic" }, stats: { played: 2 } });
    expect(saveWordSearchState("not json")).toBe(false);
    expect(saveWordSearchState("[1,2]")).toBe(false);
    expect(saveWordSearchState({ settings: "x".repeat(70_000) })).toBe(false);
    expect(loadWordSearchState()).toEqual({ settings: { theme: "arctic" }, stats: { played: 2 } });
    fs.writeFileSync(getWordSearchStatePath(), "{{broken");
    expect(loadWordSearchState()).toEqual({});
    expect(fs.readdirSync(tmp).filter((f) => f.endsWith(".tmp")).length).toBe(0);
  });
  test("HTTP: /, engine.js, state GET/POST, cross-origin write blocked, traversal blocked", async () => {
    resetState();
    const srv = startWordSearchStudioServer({ port: 0 });
    const base = `http://127.0.0.1:${srv.port}`;
    try {
      expect((await fetch(`${base}/`)).status).toBe(200);
      const eng = await fetch(`${base}/engine.js`);
      expect(eng.status).toBe(200);
      expect(await eng.text()).toContain("WordSearchEngine");
      const post = await fetch(`${base}/api/state`, { method: "POST", body: JSON.stringify({ settings: { size: 14 }, stats: {} }) });
      expect(post.status).toBe(200);
      expect(await (await fetch(`${base}/api/state`)).json()).toEqual({ settings: { size: 14 }, stats: {} });
      const evil = await fetch(`${base}/api/state`, { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
      expect(evil.status).toBe(403);
      const same = await fetch(`${base}/api/state`, { method: "POST", headers: { Origin: base }, body: JSON.stringify({ settings: { size: 10 } }) });
      expect(same.status).toBe(200);
      expect((await fetch(`${base}/api/state`, { method: "POST", body: "nope" })).status).toBe(400);
      expect((await fetch(`${base}/api/state`, { method: "DELETE" })).status).toBe(405);
      expect((await fetch(`${base}/api/state`)).headers.get("access-control-allow-origin")).toBeNull();
      expect((await fetch(`${base}/..%2f..%2fpackage.json`)).status).not.toBe(200);
    } finally { srv.stop(true); }
  });
});

// ---------------------------------------------------------------------------------------------
// The real page, running in jsdom. jsdom cannot execute page scripts under Bun's vm, so the page
// tests live in word_search_page.node.mjs and are run by Node (node:test) from here.
// ---------------------------------------------------------------------------------------------
describe("page (jsdom, run under node)", () => {
  test("all page tests pass", () => {
    resetState();
    const baseFile = path.join(tmp, "base.html");
    fs.writeFileSync(baseFile, generateWordSearchStudioHtml());
    const r = Bun.spawnSync(["node", "--test", "--test-reporter=spec", path.join(import.meta.dir, "word_search_page.node.mjs")], {
      cwd: path.join(import.meta.dir, ".."),
      env: { ...process.env, WS_BASE_HTML: baseFile, WS_STATE_FILE: stateFile },
    });
    const out = r.stdout.toString() + r.stderr.toString();
    if (r.exitCode !== 0) console.log(out);
    expect(r.exitCode).toBe(0);
  }, 60_000);
});
