// "Codecaine Games" tool of the Power tools panel: all 24 Codecaine arcade, puzzle, card, casino and word games
// playable directly inside the File Manager frame, in their own desktop window, or in the system web browser.
import { h } from "./dom.js";
import { embeddedUrl, syncFrameTheme } from "./embed.js";
import {
  isPowerExpanded,
  openToolInBrowser,
  openToolInWindow,
  registerPowerTab,
  togglePowerExpanded,
} from "./power.js";
import { on } from "./state.js";

export const CODECAINE_GAMES = [
  {
    id: "tetris",
    title: "Codecaine Tetris Ultra Deluxe",
    icon: "🧱",
    category: "Puzzle & Logic",
    note: "7-bag SRS block puzzle with T-Spin & Back-to-Back telemetry, 4 modes (Marathon, 40L Sprint, 2M Ultra, Zen), 3-piece queue & synthwave themes.",
    controls: "Arrows: Move/Drop • Up/X/Z/A: Rotate • Space: Hard Drop • C: Hold",
  },
  {
    id: "codecaine_bros",
    title: "Codecaine Bros. Arcade",
    icon: "🍄",
    category: "Arcade & Action",
    note: "Authentic 1983 Mario Bros. arcade remaster with high-speed bumping physics, POW block shockwaves & 4-channel sound synthesis.",
    controls: "Left/Right or A/D: Run • Up/W/Space: Jump • P: Pause",
  },
  {
    id: "dr_codecaine",
    title: "Codecaine Dr. Codecaine Arcade",
    icon: "💊",
    category: "Puzzle & Logic",
    note: "Triple-A remastered Dr. Codecaine capsule puzzle game with polyphonic Fever/Chill synthesizers, glossy 3D capsules & pathogen AI.",
    controls: "Arrows/WASD: Move Capsule • Z/X/Up: Flip • Space: Hard Drop",
  },
  {
    id: "pacman",
    title: "Codecaine Cyberpunk Pac-Man Arcade",
    icon: "🟡",
    category: "Arcade & Action",
    note: "Cyberpunk Pac-Man arcade remaster with 4 distinct ghost AI personalities (Blinky, Pinky, Inky, Clyde), power pellets & synth audio.",
    controls: "Arrows or WASD: Steer • P: Pause",
  },
  {
    id: "breakout",
    title: "Codecaine Cyber Breakout Deluxe",
    icon: "🧱",
    category: "Arcade & Action",
    note: "Deluxe Breakout arcade with continuous swept collision physics, 8 dynamic power-ups, pentatonic combo synth melodies & gamepad support.",
    controls: "Mouse or Left/Right: Paddle • Space/Click: Launch & Laser",
  },
  {
    id: "balatro",
    title: "Codecaine Joker Royale (Balatro Deluxe)",
    icon: "🃏",
    category: "Card & Casino",
    note: "Roguelike poker deckbuilder with Ante & Blind runs, 30+ holographic Jokers, Planet & Tarot upgrades, 3D card tilt physics & synth audio.",
    controls: "Click cards to select • Play Hand / Discard • Shop between Blinds",
  },
  {
    id: "poker",
    title: "Codecaine Texas Hold'em & 5-Card Draw Poker Royale",
    icon: "♠️",
    category: "Card & Casino",
    note: "Deluxe casino poker table featuring No-Limit Texas Hold'em and 5-Card Draw, 6-max AI personalities, Bicycle vector cards & hand odds.",
    controls: "Fold / Check / Call / Raise controls & keyboard shortcuts",
  },
  {
    id: "blackjack",
    title: "Codecaine Blackjack Royale VIP",
    icon: "🪙",
    category: "Card & Casino",
    note: "High-roller multi-hand VIP casino Blackjack with 3-spot betting, 6-deck shoe Hi-Lo count telemetry, split, double down & side bets.",
    controls: "Click chips to bet • Deal / Hit / Stand / Double / Split",
  },
  {
    id: "rat_screw",
    title: "Codecaine Egyptian Rat Screw Royale",
    icon: "🎴",
    category: "Card & Casino",
    note: "High-speed reflex card slapper with authentic Bicycle vector cards, face-card challenges, customizable slap rules (Doubles, Sandwich, 10s) & multi-CPU AI.",
    controls: "Space / Enter: Deal Card • Shift / S: Slap Pile",
  },
  {
    id: "yahtzee",
    title: "Codecaine Yahtzee Royale Deluxe",
    icon: "🎲",
    category: "Card & Casino",
    note: "Deluxe classic Yahtzee dice board studio with 3D tactile dice, Milton Bradley scorecard, +35 upper bonus, Yahtzee Jokers & AI opponent.",
    controls: "Space/Click: Roll Dice • 1-5: Hold Dice • Click scorecard row",
  },
  {
    id: "snake",
    title: "Codecaine Neon Snake Deluxe",
    icon: "🐍",
    category: "Arcade & Action",
    note: "High-speed glowing cyber viper across multi-sector arenas with combo boost multipliers, power-ups, synth tracks & Hall of Fame.",
    controls: "Arrows or WASD: Turn • Space: Dash • P: Pause",
  },
  {
    id: "frogger",
    title: "Codecaine CyberFrog Deluxe",
    icon: "🐸",
    category: "Arcade & Action",
    note: "Navigate 5 hazardous cyberpunk highway and boiling acid river sectors with hover-speeders, cyber-logs, neon flies & power-ups.",
    controls: "Arrows or WASD: Hop • P: Pause",
  },
  {
    id: "lolo",
    title: "Codecaine Adventures of Lolo Remaster",
    icon: "👾",
    category: "Puzzle & Logic",
    note: "Cyberpunk remastered Adventures of Lolo puzzle rooms with Snakey, Medusa, Alma, Emerald Framers, Egg mechanics & level editor.",
    controls: "Arrows/WASD: Move • Space/Z: Shoot Magic Shot • R: Retry Room",
  },
  {
    id: "maze_generator",
    title: "Codecaine Cyberpunk Maze Runner",
    icon: "🌀",
    category: "Puzzle & Logic",
    note: "Procedural neon labyrinth featuring Recursive Backtracking, Prim's & Wilson's generators, Fog of War, keys/portals & live A* AI solver.",
    controls: "Arrows or WASD: Navigate • H: Hint Path • Space: Auto-Solve",
  },
  {
    id: "minesweeper",
    title: "Codecaine Minesweeper Pro Championship",
    icon: "💣",
    category: "Puzzle & Logic",
    note: "Championship Minesweeper with guaranteed safe first-click opening, chord clearing, 3BV efficiency telemetry & 4 visual themes.",
    controls: "Left Click: Reveal • Right Click/F: Flag • Middle/Double Click: Chord",
  },
  {
    id: "skifree",
    title: "Codecaine SkiFree Deluxe",
    icon: "⛷️",
    category: "Arcade & Action",
    note: "Downhill alpine skiing across Slalom, Freestyle & Endless modes with aerial tricks, rainbow boost pads & the Abominable Cyber-Yeti.",
    controls: "Mouse or Left/Right: Carve • Space: Jump/Tricks • F: Boost",
  },
  {
    id: "flappy_bird",
    title: "Codecaine Flappy Bird Deluxe",
    icon: "🐦",
    category: "Arcade & Action",
    note: "Kinetic cyberpunk Flappy Bird arcade with plasma conduits, day/night/synthwave themes, medal achievements & WebAudio synth.",
    controls: "Space / Up / Click: Flap Thrust • P: Pause",
  },
  {
    id: "math_munchers",
    title: "Codecaine Math Munchers Deluxe",
    icon: "👾",
    category: "Word & Skill",
    note: "Cyberpunk Math Munchers classic with Multiples, Factors, Primes, Equalities, Troggles AI patrollers & CRT synth audio.",
    controls: "Arrows/WASD: Move • Space/Enter: Munch Number",
  },
  {
    id: "typing",
    title: "Codecaine CyberType Deluxe",
    icon: "⌨️",
    category: "Word & Skill",
    note: "Mavis Beacon Master Edition typing academy with 10-step guided tutorial, 18-lesson curriculum, Keybr Adaptive AI, QWERTY/Colemak/Dvorak/Workman layouts, 6 switch profiles & Word Rain defense.",
    controls: "Type directly on keyboard • Tab+Enter: Quick Restart",
  },
  {
    id: "word_search",
    title: "Codecaine Neon Word Search Labyrinth",
    icon: "🔤",
    category: "Word & Skill",
    note: "AAA cyber word search with Web Audio synthesizer, neon ribbon selection, particle bursts & curated themed dictionaries.",
    controls: "Drag across letters to highlight words • Hint button for clues",
  },
  {
    id: "rodents_revenge",
    title: "Codecaine Rodent's Revenge Deluxe",
    icon: "🧀",
    category: "Arcade & Action",
    note: "Deluxe arcade revival of Rodent's Revenge: push movable blocks to trap chasing cats, turn them into cheese & survive escalating waves.",
    controls: "Arrows or WASD: Move & Push Blocks • P: Pause",
  },
  {
    id: "pong",
    title: "Codecaine Neon Cyber Pong",
    icon: "🏓",
    category: "Arcade & Action",
    note: "High-speed kinetic Pong with paddle spin physics, 4 AI difficulty tiers, local 2-player versus mode & synth sound effects.",
    controls: "W/S or Up/Down or Mouse: Move Paddle • Space: Serve",
  },
  {
    id: "connect4",
    title: "Codecaine Cyberpunk Connect 4",
    icon: "🔴",
    category: "Puzzle & Logic",
    note: "Neon Connect 4 arcade with Minimax alpha-beta AI difficulty levels, 2-player local battle, column hover preview & drop physics.",
    controls: "Click column or press 1-7 to drop disc",
  },
  {
    id: "tictactoe",
    title: "Codecaine Neon Tic-Tac-Toe Arcade",
    icon: "❌",
    category: "Puzzle & Logic",
    note: "Unbeatable Minimax AI (Easy, Medium, Master) and 2-player local versus battle with glowing neon canvas & celebratory particles.",
    controls: "Click any grid cell to place X or O",
  },
];

registerPowerTab({
  id: "games",
  label: "Codecaine Games",
  icon: "🕹️",
  tip: "Play all 24 Codecaine arcade, puzzle, card, casino and word games right inside the File Manager, in a separate desktop window, or in your browser",
  group: "more",
  mount(root) {
    root.classList.add("games-pane");
    let activeGame = CODECAINE_GAMES[0];
    let selectedCategory = "All";
    let mode = "catalog"; // "catalog" | "play"

    const picker = h(
      "select",
      {
        id: "games-picker",
        "aria-label": "Choose a Codecaine game",
        onchange: () => {
          const found = CODECAINE_GAMES.find((g) => g.id === picker.value);
          if (found) playGame(found);
        },
      },
      ...CODECAINE_GAMES.map((g) => h("option", { value: g.id }, `${g.icon} ${g.title}`)),
    );

    const catalogBtn = h(
      "button",
      {
        type: "button",
        id: "games-view-catalog",
        class: "pw-btn primary",
        "aria-pressed": "true",
        onclick: () => setMode("catalog"),
      },
      `📋 All ${CODECAINE_GAMES.length} Games`,
    );

    const playBtn = h(
      "button",
      {
        type: "button",
        id: "games-view-play",
        class: "pw-btn",
        "aria-pressed": "false",
        onclick: () => setMode("play"),
      },
      "▶ Play Active Game",
    );

    const closeGameBtn = h(
      "button",
      {
        type: "button",
        id: "games-close-game",
        class: "pw-btn danger",
        hidden: true,
        title: "Stop and close the active game and silence all game audio",
        onclick: () => closeActiveGame(),
      },
      "✕ Close Game",
    );

    const expanded = isPowerExpanded();
    const expandBtn = h(
      "button",
      {
        type: "button",
        class: "pw-btn embed-expand",
        "aria-pressed": String(expanded),
        title: expanded ? "Restore the File Manager bars and tabs (Esc)" : "Fill the whole window with Codecaine Games (press Esc to restore)",
        onclick: () => togglePowerExpanded(),
      },
      expanded ? "⛶ Restore" : "⛶ Expand",
    );

    const windowBtn = h(
      "button",
      {
        type: "button",
        id: "games-open-window",
        class: "pw-btn embed-window",
        title: `Open ${activeGame.title} in its own desktop window`,
        onclick: () => void openToolInWindow(activeGame.id),
      },
      "🪟 Open in separate window",
    );

    const browserBtn = h(
      "button",
      {
        type: "button",
        id: "games-open-browser",
        class: "pw-btn embed-browser",
        title: `Open ${activeGame.title} in your web browser`,
        onclick: () => void openToolInBrowser(activeGame.id, embeddedUrl(activeGame.id)),
      },
      "🌐 Open in browser",
    );

    const topBar = h(
      "div",
      { class: "pw-row embed-bar games-topbar" },
      catalogBtn,
      playBtn,
      closeGameBtn,
      h("label", {}, "Active game:", picker),
      expandBtn,
      windowBtn,
      browserBtn,
    );

    const searchInput = h("input", {
      type: "search",
      id: "games-search",
      class: "find-input",
      placeholder: "Filter 24 Codecaine games by title, genre or controls…",
      "aria-label": "Filter Codecaine games",
      spellcheck: "false",
      autocomplete: "off",
      oninput: () => renderCatalog(),
    });

    const categoryBar = h("div", { class: "pw-row games-categories" });
    const countLabel = h("span", { class: "pw-status", id: "games-count" });
    const gridWrap = h("div", { class: "pw-split games-grid", id: "games-grid" });

    const catalogPane = h(
      "div",
      { id: "games-catalog", class: "games-catalog-wrap" },
      h(
        "div",
        { class: "pw-card" },
        h(
          "div",
          { class: "pw-row" },
          h("strong", {}, "🕹️ Codecaine Arcade Suite — 24 Built-in Games"),
          countLabel,
        ),
        h(
          "p",
          { class: "pw-hint" },
          "Launch any Codecaine game right inside the File Manager, pop it out into its own native desktop window, or open it in your browser.",
        ),
        h("div", { class: "pw-row" }, searchInput),
        categoryBar,
      ),
      gridWrap,
    );

    const frame = h("iframe", {
      class: "embed-frame",
      id: "games-frame",
      title: activeGame.title,
      src: "about:blank",
      referrerpolicy: "no-referrer",
      loading: "eager",
      allow: "autoplay; fullscreen; clipboard-write",
      sandbox: "allow-scripts allow-same-origin allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox",
    });

    function stopGameFrame() {
      try {
        frame.contentWindow?.postMessage?.({ fmStopGame: true }, "*");
      } catch {
        /* frame already unloaded or cross-origin */
      }
      if (frame.getAttribute("src") !== "about:blank") {
        frame.setAttribute("src", "about:blank");
      }
    }

    function closeActiveGame() {
      stopGameFrame();
      setMode("catalog");
    }

    function focusAndResizeFrame() {
      if (mode !== "play") return;
      try {
        frame.focus();
        frame.contentWindow?.focus?.();
        frame.contentWindow?.dispatchEvent?.(new Event("resize"));
      } catch {
        /* cross-origin frame handles resize/focus via bridge */
      }
    }

    frame.addEventListener("load", () => {
      syncFrameTheme(frame);
      focusAndResizeFrame();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => focusAndResizeFrame());
      }
    });
    on("theme-changed", (payload) => syncFrameTheme(frame, payload));

    if (typeof window !== "undefined") {
      window.addEventListener("message", (e) => {
        if (e.data && typeof e.data === "object" && e.data.fmCloseGame && e.source === frame.contentWindow) {
          closeActiveGame();
        }
      });
    }

    const activeNote = h("p", { class: "pw-hint", id: "games-active-note" }, `${activeGame.icon} ${activeGame.title} — ${activeGame.controls}`);
    const stagePane = h(
      "div",
      { id: "games-stage", class: "games-stage-wrap", hidden: true },
      activeNote,
      frame,
    );

    function updateActiveButtons() {
      picker.value = activeGame.id;
      windowBtn.title = `Open ${activeGame.title} in its own desktop window`;
      browserBtn.title = `Open ${activeGame.title} in your web browser`;
      closeGameBtn.title = `Close ${activeGame.title} and stop game audio`;
      activeNote.textContent = `${activeGame.icon} ${activeGame.title} — ${activeGame.controls}`;
      frame.title = activeGame.title;
    }

    function setMode(nextMode) {
      mode = nextMode;
      const isPlay = mode === "play";
      root.classList.toggle("games-mode-play", isPlay);
      catalogPane.hidden = isPlay;
      stagePane.hidden = !isPlay;
      closeGameBtn.hidden = !isPlay;
      catalogBtn.classList.toggle("primary", !isPlay);
      catalogBtn.setAttribute("aria-pressed", String(!isPlay));
      playBtn.classList.toggle("primary", isPlay);
      playBtn.setAttribute("aria-pressed", String(isPlay));
      if (isPlay) {
        const targetUrl = embeddedUrl(activeGame.id);
        if (frame.getAttribute("src") !== targetUrl) {
          stopGameFrame();
          frame.setAttribute("src", targetUrl);
        }
        focusAndResizeFrame();
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => focusAndResizeFrame());
        }
      } else {
        stopGameFrame();
      }
    }

    function playGame(game) {
      if (activeGame.id !== game.id) {
        stopGameFrame();
      }
      activeGame = game;
      updateActiveButtons();
      setMode("play");
    }

    function renderCategories() {
      const cats = ["All", "Arcade & Action", "Puzzle & Logic", "Card & Casino", "Word & Skill"];
      categoryBar.replaceChildren(
        ...cats.map((cat) =>
          h(
            "button",
            {
              type: "button",
              class: `pw-btn${selectedCategory === cat ? " primary" : ""}`,
              "aria-pressed": String(selectedCategory === cat),
              onclick: () => {
                selectedCategory = cat;
                renderCategories();
                renderCatalog();
              },
            },
            cat,
          ),
        ),
      );
    }

    function renderCard(game) {
      return h(
        "article",
        {
          class: "pw-card game-card",
          dataset: { gameId: game.id, category: game.category },
          "aria-label": game.title,
        },
        h(
          "div",
          { class: "pw-row game-card-head" },
          h("strong", {}, `${game.icon} ${game.title}`),
          h("span", { class: "code-badge code-badge-quiet" }, game.category),
        ),
        h("p", { class: "pw-hint" }, game.note),
        h("p", { class: "pw-hint pw-mono game-card-controls" }, `🎮 ${game.controls}`),
        h(
          "div",
          { class: "pw-row game-card-actions" },
          h(
            "button",
            {
              type: "button",
              class: "pw-btn primary game-play-btn",
              onclick: () => playGame(game),
            },
            "▶ Play Here",
          ),
          h(
            "button",
            {
              type: "button",
              class: "pw-btn game-window-btn",
              title: `Open ${game.title} in its own desktop window`,
              onclick: () => void openToolInWindow(game.id),
            },
            "🪟 Open Window",
          ),
          h(
            "button",
            {
              type: "button",
              class: "pw-btn game-browser-btn",
              title: `Open ${game.title} in your web browser`,
              onclick: () => void openToolInBrowser(game.id, embeddedUrl(game.id)),
            },
            "🌐 Browser",
          ),
        ),
      );
    }

    function renderCatalog() {
      const q = (searchInput.value || "").trim().toLowerCase();
      const filtered = CODECAINE_GAMES.filter((g) => {
        if (selectedCategory !== "All" && g.category !== selectedCategory) return false;
        if (!q) return true;
        return `${g.title} ${g.id} ${g.category} ${g.note} ${g.controls}`.toLowerCase().includes(q);
      });
      countLabel.textContent = `${filtered.length} of ${CODECAINE_GAMES.length} games shown`;
      if (filtered.length === 0) {
        gridWrap.replaceChildren(h("p", { class: "pw-hint" }, "No Codecaine games match that filter."));
        return;
      }
      gridWrap.replaceChildren(...filtered.map(renderCard));
    }

    renderCategories();
    renderCatalog();
    updateActiveButtons();
    root.append(topBar, catalogPane, stagePane);

    return {
      targetId: () => activeGame.id,
      show(opts) {
        if (opts && typeof opts.game === "string") {
          const found = CODECAINE_GAMES.find((g) => g.id === opts.game);
          if (found) {
            playGame(found);
            return;
          }
        }
        if (mode === "play") focusAndResizeFrame();
      },
      hide() {
        closeActiveGame();
      },
    };
  },
});
