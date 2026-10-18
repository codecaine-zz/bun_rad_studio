# 🔠 Neon Word Search Labyrinth -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: Pure seeded puzzle engine + Web Audio & Canvas effects  •  Dependencies: 0  •  Works offline (fonts load online, with a system fallback)
Launchers: [Desktop GUI: bun run app:word_search]  •  [Headless Server: bun run applications/word_search_studio.ts --server]
```

---

## 🌟 Executive Overview
**Neon Word Search Labyrinth** is a cyberpunk-themed word puzzle game: glowing canvas typography, tactile Web Audio feedback, drag-to-select words, limited hints, streak scoring and star ratings. It ships 10 word categories (Cyber, Cosmos, Arcade, Nature, Animals, Food, Geography, Science, Music, Sports), 3 difficulty levels, 3 board sizes, 4 color palettes, a **Daily Puzzle**, a **Stats** screen with personal bests, and saves your preferences and records between sessions.

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Word Search Desktop](../../screenshots/apps/word_search_desktop.png) | ![Word Search Responsive](../../screenshots/apps/word_search_responsive.png) |

---

## 🕹️ Gameplay & Controls
- **Word Selection**: Click and drag across letters in a straight line (horizontal, vertical or diagonal, forwards or backwards). Releasing over a valid word locks it in with a neon color. Re-selecting a found word is harmless and does not break your streak.
- **Difficulty**: Easy (words run down), Medium (4 directions), Hard (all 8 directions, some reversed). Board sizes 10×10, 12×12, 14×14.
- **Scoring**: points per letter plus a streak multiplier for quick consecutive finds; 1–3 stars by score and time.
- **Hint (H)**: Pulses the first letter of an unfound word; 3 per game, then it tells you none are left.
- **New (N) / Replay (R)**: New random board, or restart the same board from scratch.
- **Daily (D)**: One shared puzzle per calendar day, identical every time you open it that day. It never overwrites your saved preferences.
- **Pause (P)**: Stops the clock and hides the board. It also pauses automatically when you open a dialog or switch away from the window.
- **Give Up (G)**: Click twice to confirm; reveals every remaining word and counts as a played game.
- **Stats (T)**: Games played, win rate, words found, best streak and best score/time per category, size and difficulty (two clicks to reset).
- **Mute (M)**, **Help (?)**, **Esc** closes dialogs. **Settings** holds category, size, difficulty, palette (Cyber, Sunset, Emerald, Arctic), sound and ambient drone; **Export** saves the board as a PNG.
- **Persistence**: Preferences and records are stored in `.word_search_state.json` in the folder you launch from.
- **Headless**: `bun run applications/word_search_studio.ts --server` serves the game in a browser.
