# 🔠 Codecaine Neon Word Search Labyrinth — Championship 8-Mode Edition

```
Version: 3.0.0  •  Engine: Pure seeded puzzle engine + 8 Playable Modes + 16 Categories + Web Audio & Game Master FX (Alt+G)  •  Dependencies: 0
Launchers: [Desktop GUI: bun run app:word_search]  •  [Headless Server: bun run applications/word_search_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Neon Word Search Labyrinth** is a cyberpunk-themed word puzzle game featuring an **8-Mode Modern Word Search Suite**, **16 Word Categories** (over 960 curated vocabulary words), a **Custom Word Search Creator Modal**, **Lexical Gadgets** (Compass Hint Beacon, Laser Row/Col Crosshair Scanner, Decoy Letter Scrubber), glowing Retina canvas capsules, tactile Web Audio arpeggios, and the **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**.

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Word Search Desktop](../../screenshots/apps/word_search_desktop.png) | ![Word Search Responsive](../../screenshots/apps/word_search_responsive.png) |

---

## 🎮 The 8-Mode Modern Word Search Suite
Switch modes anytime using the top **Mode Ribbon**, the **Game Mode** selector in Settings, or number keys **`1`–`8`**:

1. **🔍 Classic Search (`1`)** — Standard straight-line word hunting in 8 compass directions (`→`, `↘`, `↓`, `↙`, `←`, `↖`, `↑`, `↗`).
2. **🐍 Boggle Snake (`2`)** — Words can bend and snake through any adjacent cells! Drag cell-by-cell along winding paths or backtrack by dragging onto your previous cell.
3. **🕵️ Cryptic Clues (`3`)** — The word bank masks middle letters (`C _ _ _ T O [6]`) until you discover the word on the board.
4. **🔀 Anagram Scramble (`4`)** — The word bank displays scrambled anagrams (`R Y C P O T [6]`). Mentally unscramble each clue and trace the real word in the grid!
5. **📜 Hidden Message (`5`)** — Every word you capture progressively decodes an encrypted cyberpunk quote in the live **Word Info & Cipher Banner**.
6. **🔦 Fog of War (`6`)** — Grid letters are shrouded in dark fog! Hover or drag your cursor/finger to illuminate a **3×3 flashlight radius** around your position.
7. **⚡ Blitz Time Attack (`7`)** — Race against a **90-second countdown**! Every word found awards **+5 seconds** of bonus time.
8. **🤖 vs AI LexiBot (`8`)** — Compete head-to-head against **LexiBot**, an autonomous AI rival that periodically claims unfound words on the board. Outscore LexiBot before the board is cleared!

---

## 📚 16 Curated Word Categories
Choose from **16 distinct thematic categories** in Settings or cycle through them with the **Category** button:
- **💻 Cyber & AI** • **🌌 Deep Cosmos** • **🕹️ Retro Arcade** • **🌿 Wild Nature**
- **🐾 Wild Kingdom** • **🍜 Street Food** • **🗺️ World Atlas** • **⚗️ Lab Science**
- **🎸 Synth & Sound** • **🏆 Arena Sports** • **🐧 Linux & Unix** • **🍎 macOS & Darwin**
- **⌨️ Programming** • **🔐 Cryptography** • **🧠 Neural & AI** • **⚡ Mythology**

---

## 🧰 Lexical Gadgets & Custom Puzzle Builder
- **🧭 Compass Hint (`H` or click any word chip)**: Pulses the starting cell of an unfound word and displays its exact row, column, and compass direction arrow (`→`, `↘`, `↓`, `↙`, `←`, `↖`, `↑`, `↗`) in the info banner (3 uses per puzzle).
- **🔦 Laser Row/Col Scanner (`E` or `🔦 Laser`)**: Fires a neon crosshair across the entire starting row and column of a hidden word (1 use per puzzle).
- **📡 Decoy Letter Scrubber (`F` or `📡 Scrub`)**: Scans the grid and dims 35% of non-word filler tiles so hidden words stand out clearly (1 use per puzzle).
- **✏️ Custom Word Search Creator (`C` or `✏️ Custom`)**: Paste or type your own list of words (3+ letters each) to generate a customplayable board on the spot.

---

## 🕹️ Keyboard Shortcuts & Controls
- **`1` – `8`**: Switch directly between the 8 Word Search game modes.
- **`N` / `R` / `D`**: New random puzzle / Replay current board / Daily seeded puzzle.
- **`H` / `E` / `F` / `C`**: Compass Hint / Laser Crosshair Scan / Decoy Scrubber / Custom Puzzle Creator.
- **`P` / `G` / `T` / `M` / `?`**: Pause / Give Up (press twice) / Stats Modal / Mute Audio / Help Modal.

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
