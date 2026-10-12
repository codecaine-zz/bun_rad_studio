/**
 * Neon Word Search -- pure game engine (no DOM, no audio, no timers).
 * Loaded inline by the page and imported directly by the unit tests, so every rule of the game
 * (puzzle generation, selection matching, scoring, stars, statistics) is testable.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WordSearchEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CATEGORIES = {
    cyber: { name: "Cyber & Tech", words: [
      "ALGORITHM", "QUANTUM", "FIREWALL", "ENCRYPTION", "NEURAL", "SYNAPSE", "MATRIX", "KERNEL", "CIPHER", "PROTOCOL",
      "BITCOIN", "DATABASE", "BITMAP", "HACKER", "PYTHON", "REACT", "DOCKER", "CLOUD", "LINUX", "CYBER", "TERMINAL",
      "PAYLOAD", "OPTIC", "ROBOTIC", "BYTE", "VECTOR", "CIRCUIT", "GATEWAY", "SUBROUTINE", "FIRMWARE"] },
    cosmos: { name: "Cosmos & Sci-Fi", words: [
      "GALAXY", "NEBULA", "PULSAR", "ECLIPSE", "HORIZON", "QUASAR", "SUPERNOVA", "VOYAGER", "ORBITAL", "ANDROMEDA",
      "COSMOS", "ASTEROID", "GRAVITY", "CELESTIAL", "STARSHIP", "JUPITER", "PARADOX", "QUANTUM", "CORONA", "SPACETIME",
      "SOLAR", "ZENITH", "METEOR", "TITAN", "INTERSTELLAR"] },
    arcade: { name: "Arcade & Gaming", words: [
      "PIXEL", "COMBO", "JOYSTICK", "STEALTH", "GLITCH", "RESPAWN", "DUNGEON", "CRITICAL", "LEVEL", "SHADOW", "AVATAR",
      "CHRONO", "SHURIKEN", "ARCADE", "QUEST", "BLASTER", "SHIELD", "POWERUP", "HIGHWAY", "WARRIOR", "PLATFORM", "RETRO",
      "VORTEX", "NINJA"] },
    nature: { name: "Nature & Elements", words: [
      "TSUNAMI", "AURORA", "VOLCANO", "GLACIER", "CYCLONE", "MONSOON", "LIGHTNING", "BLIZZARD", "CRYSTAL", "CASCADE",
      "AVALANCHE", "ZEPHYR", "WILDERNESS", "SOLAR", "RAINBOW", "GEYSER", "OCEAN", "TROPICAL", "EVERGREEN", "HORIZON",
      "CANYON", "SAVANNA", "WHIRLPOOL"] },
    animals: { name: "Animals & Wildlife", words: [
      "ELEPHANT", "GIRAFFE", "DOLPHIN", "PENGUIN", "LEOPARD", "GORILLA", "KANGAROO", "CHEETAH", "PANTHER", "OCTOPUS",
      "FLAMINGO", "HEDGEHOG", "BUFFALO", "CROCODILE", "SQUIRREL", "PORCUPINE", "WALRUS", "BADGER", "FALCON", "OSTRICH",
      "LOBSTER", "GAZELLE", "PELICAN", "TORTOISE"] },
    food: { name: "Food & Kitchen", words: [
      "SPAGHETTI", "PANCAKE", "AVOCADO", "BROCCOLI", "CHOCOLATE", "BLUEBERRY", "CINNAMON", "MUSHROOM", "PINEAPPLE",
      "SANDWICH", "TOMATO", "PUMPKIN", "NOODLES", "BURRITO", "CROISSANT", "LASAGNA", "POPCORN", "PRETZEL", "WAFFLE",
      "MEATBALL", "CUCUMBER", "ALMOND", "CARAMEL", "BISCUIT"] },
    geography: { name: "World Geography", words: [
      "AMAZON", "SAHARA", "HIMALAYA", "PACIFIC", "ATLANTIC", "ANTARCTICA", "MOUNTAIN", "VOLGA", "NILE", "ALPS", "ANDES",
      "BALTIC", "CARIBBEAN", "DANUBE", "EVEREST", "FJORD", "GOBI", "ICELAND", "JAPAN", "KILIMANJARO", "MEXICO", "NORWAY",
      "PATAGONIA", "TUNDRA"] },
    science: { name: "Science & Lab", words: [
      "ELECTRON", "PROTON", "NEUTRON", "MOLECULE", "CHEMISTRY", "PHYSICS", "BIOLOGY", "GENETICS", "ENZYME", "CATALYST",
      "ISOTOPE", "OXYGEN", "HYDROGEN", "CARBON", "NITROGEN", "MAGNET", "PLASMA", "FUSION", "FISSION", "LABORATORY",
      "MICROSCOPE", "SPECTRUM", "VELOCITY", "ENTROPY"] },
    music: { name: "Music & Sound", words: [
      "GUITAR", "PIANO", "VIOLIN", "TRUMPET", "DRUMS", "MELODY", "HARMONY", "RHYTHM", "SYMPHONY", "ORCHESTRA", "CHORUS",
      "TEMPO", "OCTAVE", "CONCERT", "ENCORE", "BASSLINE", "CLARINET", "SAXOPHONE", "CELLO", "FLUTE", "ACOUSTIC", "VOCAL",
      "ANTHEM", "LULLABY"] },
    sports: { name: "Sports & Games", words: [
      "SOCCER", "BASKETBALL", "TENNIS", "HOCKEY", "CRICKET", "BASEBALL", "VOLLEYBALL", "BADMINTON", "SWIMMING", "CYCLING",
      "MARATHON", "GYMNASTICS", "ARCHERY", "FENCING", "ROWING", "SURFING", "SKIING", "CLIMBING", "BOXING", "WRESTLING",
      "SKATING", "GOLF", "RUGBY", "SOFTBALL"] },
  };

  // dr/dc steps. Index order is relied upon by DIFFICULTIES.
  const DIRECTIONS = [
    { dr: 0, dc: 1 },   // 0 right
    { dr: 1, dc: 0 },   // 1 down
    { dr: 1, dc: 1 },   // 2 down-right
    { dr: -1, dc: 1 },  // 3 up-right
    { dr: 0, dc: -1 },  // 4 left
    { dr: -1, dc: 0 },  // 5 up
    { dr: -1, dc: -1 }, // 6 up-left
    { dr: 1, dc: -1 },  // 7 down-left
  ];

  const DIFFICULTIES = {
    easy: { label: "Easy (right & down)", dirs: [0, 1], reverseChance: 0 },
    medium: { label: "Medium (4 directions)", dirs: [0, 1, 2, 3], reverseChance: 0 },
    hard: { label: "Hard (all 8, backwards)", dirs: [0, 1, 2, 3, 4, 5, 6, 7], reverseChance: 0.35 },
  };

  // words = target word count; stars = [3-star limit, 2-star limit] in seconds
  const SIZES = {
    10: { words: 10, stars: [90, 150] },
    12: { words: 13, stars: [110, 180] },
    14: { words: 16, stars: [140, 230] },
  };

  const PALETTES = ["#00f0ff", "#ff0077", "#00ff9d", "#ffd43b", "#b026ff", "#ff7700", "#38bdf8", "#a6ff00", "#f43f5e", "#818cf8"];

  // ---------------------------------------------------------------- randomness
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function randomSeed() {
    return Math.floor(Math.random() * 0xffffffff).toString(36);
  }

  // ---------------------------------------------------------------- generation
  const rev = (s) => s.split("").reverse().join("");

  /**
   * Candidate words for a board: upper-case A-Z, 3..size letters, unique, and never a word that is
   * contained in (or is the reverse of part of) another candidate, which would make a puzzle ambiguous.
   */
  function buildPool(words, size) {
    const uniq = [...new Set(words.map((w) => String(w).toUpperCase()).filter((w) => /^[A-Z]{3,}$/.test(w) && w.length <= size))];
    return uniq.filter((w) => !uniq.some((o) => o !== w && (o.includes(w) || rev(o).includes(w))));
  }

  function emptyGrid(size) {
    return Array.from({ length: size }, () => Array(size).fill(""));
  }

  function tryPlace(grid, size, word, dirs, reverseChance, rng) {
    const text = rng() < reverseChance ? rev(word) : word;
    for (let attempt = 0; attempt < 120; attempt++) {
      const dir = DIRECTIONS[dirs[Math.floor(rng() * dirs.length)]];
      const span = text.length - 1;
      const minR = dir.dr < 0 ? span : 0, maxR = dir.dr > 0 ? size - 1 - span : size - 1;
      const minC = dir.dc < 0 ? span : 0, maxC = dir.dc > 0 ? size - 1 - span : size - 1;
      if (maxR < minR || maxC < minC) continue;
      const r = minR + Math.floor(rng() * (maxR - minR + 1));
      const c = minC + Math.floor(rng() * (maxC - minC + 1));
      const cells = [];
      let ok = true;
      for (let i = 0; i < text.length; i++) {
        const rr = r + i * dir.dr, cc = c + i * dir.dc;
        const cur = grid[rr][cc];
        if (cur !== "" && cur !== text[i]) { ok = false; break; }
        cells.push({ r: rr, c: cc });
      }
      if (!ok) continue;
      cells.forEach((p, i) => { grid[p.r][p.c] = text[i]; });
      // cells run in the direction the letters were written; the canonical word may be reversed
      return text === word ? cells : cells.reverse();
    }
    return null;
  }

  /**
   * Build a puzzle. The same {category,size,difficulty,seed} always yields the same board.
   * Several attempts are made so the board really contains the target number of words.
   */
  function generatePuzzle(opts) {
    const category = CATEGORIES[opts.category] ? opts.category : "cyber";
    const size = SIZES[opts.size] ? Number(opts.size) : 12;
    const difficulty = DIFFICULTIES[opts.difficulty] ? opts.difficulty : "hard";
    const seed = String(opts.seed ?? randomSeed());
    const target = SIZES[size].words;
    const diff = DIFFICULTIES[difficulty];
    const pool = buildPool(CATEGORIES[category].words, size);

    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const rng = mulberry32(hashSeed(`${category}|${size}|${difficulty}|${seed}|${attempt}`));
      const grid = emptyGrid(size);
      const placed = [];
      for (const word of shuffle(pool.slice(), rng)) {
        if (placed.length >= target) break;
        const cells = tryPlace(grid, size, word, diff.dirs, diff.reverseChance, rng);
        if (cells) placed.push({ word, cells });
      }
      if (!best || placed.length > best.placed.length) {
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
          if (grid[r][c] === "") grid[r][c] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(rng() * 26)];
        }
        best = { grid, placed };
      }
      if (best.placed.length >= target) break;
    }
    return { category, size, difficulty, seed, grid: best.grid, placed: best.placed, target };
  }

  // ---------------------------------------------------------------- selection
  /** Cells for a straight drag from start to end (horizontal, vertical or 45-degree), else just [start]. */
  function computeLine(start, end) {
    const dr = end.r - start.r, dc = end.c - start.c;
    const adr = Math.abs(dr), adc = Math.abs(dc);
    let sr = 0, sc = 0, steps = 0;
    if (dr === 0 && dc !== 0) { sc = Math.sign(dc); steps = adc; }
    else if (dc === 0 && dr !== 0) { sr = Math.sign(dr); steps = adr; }
    else if (adr === adc && adr !== 0) { sr = Math.sign(dr); sc = Math.sign(dc); steps = adr; }
    else return [{ r: start.r, c: start.c }];
    const cells = [];
    for (let i = 0; i <= steps; i++) cells.push({ r: start.r + i * sr, c: start.c + i * sc });
    return cells;
  }

  function selectionText(grid, cells) {
    return cells.map((p) => grid[p.r][p.c]).join("");
  }

  /**
   * Decide what a finished drag means.
   *  - found:   an unfound word was selected (cells are returned in the word's reading order)
   *  - already: a word that was already found (neutral, must not break the streak)
   *  - miss:    anything else
   */
  function matchSelection(puzzle, found, cells) {
    const forward = selectionText(puzzle.grid, cells);
    const backward = rev(forward);
    for (const pw of puzzle.placed) {
      if (pw.word !== forward && pw.word !== backward) continue;
      if (found.has(pw.word)) continue;
      const ordered = pw.word === forward ? cells : cells.slice().reverse();
      return { status: "found", word: pw.word, cells: ordered.map((p) => ({ r: p.r, c: p.c })) };
    }
    for (const pw of puzzle.placed) {
      if (found.has(pw.word) && (pw.word === forward || pw.word === backward)) return { status: "already", word: pw.word };
    }
    return { status: "miss" };
  }

  // ---------------------------------------------------------------- scoring
  const STREAK_WINDOW_MS = 10000;
  function nextStreak(streak, lastFoundAt, now) {
    return lastFoundAt && now - lastFoundAt < STREAK_WINDOW_MS ? streak + 1 : 1;
  }
  function pointsForWord(length, streak) {
    return length * 100 * Math.max(1, streak);
  }
  function starsFor(elapsedMs, size) {
    const [three, two] = (SIZES[size] || SIZES[12]).stars;
    const s = elapsedMs / 1000;
    return s <= three ? 3 : s <= two ? 2 : 1;
  }
  function formatTime(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------- daily puzzle
  function dateKey(d) {
    const x = d || new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  }
  function dailyConfig(d) {
    const key = dateKey(d);
    const cats = Object.keys(CATEGORIES);
    return { category: cats[hashSeed(`cat|${key}`) % cats.length], size: 12, difficulty: "hard", seed: `daily-${key}`, key };
  }

  // ---------------------------------------------------------------- settings & statistics
  const DEFAULT_SETTINGS = { category: "cyber", size: 12, difficulty: "hard", theme: "cyber", sound: true };
  const THEMES = {
    cyber: { name: "Neon Cyber", vars: {}, palette: PALETTES },
    sunset: {
      name: "Solar Sunset",
      vars: { "--neon-cyan": "#ff9e4d", "--neon-pink": "#ff3d71", "--neon-green": "#ffd166", "--neon-purple": "#c77dff", "--neon-orange": "#ff7b00" },
      palette: ["#ff9e4d", "#ff3d71", "#ffd166", "#c77dff", "#ff7b00", "#f94144", "#f9c74f", "#f3722c", "#e56b6f", "#b56576"],
    },
    emerald: {
      name: "Emerald Matrix",
      vars: { "--neon-cyan": "#00ff9d", "--neon-pink": "#b6ff3b", "--neon-green": "#00e5a0", "--neon-purple": "#2de2e6", "--neon-orange": "#a3e635" },
      palette: ["#00ff9d", "#b6ff3b", "#2de2e6", "#a3e635", "#34d399", "#4ade80", "#86efac", "#22d3ee", "#bef264", "#5eead4"],
    },
    arctic: {
      name: "Arctic Frost",
      vars: { "--neon-cyan": "#7dd3fc", "--neon-pink": "#c4b5fd", "--neon-green": "#a5f3fc", "--neon-purple": "#a5b4fc", "--neon-orange": "#93c5fd" },
      palette: ["#7dd3fc", "#c4b5fd", "#a5f3fc", "#a5b4fc", "#93c5fd", "#bae6fd", "#ddd6fe", "#67e8f9", "#e0e7ff", "#38bdf8"],
    },
  };

  /** Coerce arbitrary stored data into valid settings. */
  function sanitizeSettings(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    return {
      category: CATEGORIES[s.category] ? s.category : DEFAULT_SETTINGS.category,
      size: SIZES[s.size] ? Number(s.size) : DEFAULT_SETTINGS.size,
      difficulty: DIFFICULTIES[s.difficulty] ? s.difficulty : DEFAULT_SETTINGS.difficulty,
      theme: THEMES[s.theme] ? s.theme : DEFAULT_SETTINGS.theme,
      sound: typeof s.sound === "boolean" ? s.sound : DEFAULT_SETTINGS.sound,
    };
  }

  const emptyStats = () => ({ played: 0, won: 0, words: 0, bestStreak: 0, best: {} });
  function sanitizeStats(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    const best = {};
    if (s.best && typeof s.best === "object") {
      for (const [k, v] of Object.entries(s.best)) {
        if (v && Number.isFinite(v.score) && Number.isFinite(v.timeMs)) best[k] = { score: Math.floor(v.score), timeMs: Math.floor(v.timeMs) };
      }
    }
    return { played: n(s.played), won: n(s.won), words: n(s.words), bestStreak: n(s.bestStreak), best };
  }
  const statsKey = (cfg) => `${cfg.category}|${cfg.size}|${cfg.difficulty}`;

  /**
   * Fold a finished game into the statistics. Returns { stats, newBestScore, newBestTime }.
   * result: { won, words, score, timeMs, maxStreak }
   */
  function recordGame(stats, cfg, result) {
    const next = sanitizeStats(stats);
    next.played += 1;
    next.words += Math.max(0, result.words | 0);
    next.bestStreak = Math.max(next.bestStreak, result.maxStreak | 0);
    let newBestScore = false, newBestTime = false;
    if (result.won) {
      next.won += 1;
      const key = statsKey(cfg);
      const prev = next.best[key];
      if (!prev) { next.best[key] = { score: result.score, timeMs: result.timeMs }; newBestScore = newBestTime = true; }
      else {
        if (result.score > prev.score) { prev.score = result.score; newBestScore = true; }
        if (result.timeMs < prev.timeMs) { prev.timeMs = result.timeMs; newBestTime = true; }
      }
    }
    return { stats: next, newBestScore, newBestTime };
  }

  return {
    CATEGORIES, DIRECTIONS, DIFFICULTIES, SIZES, PALETTES, THEMES, DEFAULT_SETTINGS, STREAK_WINDOW_MS,
    hashSeed, mulberry32, shuffle, randomSeed,
    buildPool, generatePuzzle, computeLine, selectionText, matchSelection,
    nextStreak, pointsForWord, starsFor, formatTime,
    dateKey, dailyConfig,
    sanitizeSettings, sanitizeStats, emptyStats, statsKey, recordGame,
  };
});
