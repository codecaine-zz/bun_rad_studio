import { writeFileSync } from "fs";
import { join } from "path";

export function generateRetroArcadeGames(outDir: string) {
  // 30_lolo_remaster.md
  writeFileSync(join(outDir, "30_lolo_remaster.md"), `# 🏰 Adventures of Lolo: Cyberpunk Remaster -- Complete Production User Guide

\`\`\`
Version: 4.8.0  •  Engine: Native HTML5 Canvas & Web Audio Chiptune Synthesizer  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:lolo]  •  [Headless Server: bun run applications/lolo_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Adventures of Lolo: Cyberpunk Remaster** is a AAA procedural logic puzzle arcade game built natively for Bun RAD Studio. Reimagining the classic HAL Laboratory / Nintendo puzzle series inside a dark cyberpunk universe, it combines 100 mathematical logic chambers, autonomous hostile drone AI, temporal rewinding, an AI holographic pathfinding solver, and an in-game level editor.

You play as **LOLO** (Low-latency Optical Logic Operative), navigating the impenetrable **Eggerland Megastructure Citadel** to decrypt memory cores, outwit rogue sentry algorithms, and rescue **Princess Lala**.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:lolo

# Launch headless server
bun run applications/lolo_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Lolo Remaster Desktop](../../screenshots/apps/lolo_desktop.png) | ![Lolo Remaster Responsive](../../screenshots/apps/lolo_responsive.png) |

---

## 🕹️ Core Objectives & Operational Sequence

1. **Collect All Heart Framers (Memory Cores)**:
   - Each chamber contains glowing Heart Framers. You must collect every one on the grid to unlock the central chest.
   - **Plasma Ammo Batteries**: Certain Heart Framers contain compressed plasma batteries granting **2 Plasma Stasis Blaster shots**. Conserve shots carefully!
2. **Decrypt the Jewel Chest (Quantum Key Recovery)**:
   - Collecting the final Heart Framer opens the Jewel Chest.
   - Stepping onto the open chest extracts the decryption key, immediately freezes all hostiles into permanent harmless stasis, and unlocks the extraction gate.
3. **Evacuate Through the Warp Gate**:
   - Exit through the opened door along the upper wall to advance to the next chamber.

---

## 👾 Hostile Threat Bestiary (9 Drone Classes)

| Drone Class | Identity | Visual | Behavior & Countermeasures |
| :--- | :--- | :--- | :--- |
| **Snakey** | Static Repulsor | Green Serpent | Passive sentinel. Does not move or attack, but blocks passages. Shoot to encase into pushable egg and use as a shield or bridge. |
| **Gol** | Heat Plasma Sentry | Red Dragon | Dormant until the final Heart Framer is collected. Once awake, fires fatal high-speed fireballs if you cross its direct line of sight. |
| **Skull** | Skeletal Stalker | Brown Bone Drone | Remains dormant until the Jewel Chest is unlocked, then awakens and relentlessly charges directly at Lolo. |
| **Alma** | Rolling Sentry | Red Armadillo | Actively patrols corridors and rolls toward Lolo at high speed. Block its movement with emerald prisms or eggs. |
| **Medusa** | Stare Cannon | Gray Gorgon | Immobile turret that instantly incinerates Lolo with lethal line-of-sight laser beams. Must be obstructed with blocks or eggs. |
| **Don Medusa** | Kinetic Laser Sentry | Green Spike Drone | Patrols back and forth along a fixed axis, firing lethal line-of-sight lasers in all 4 cardinal directions. |
| **Leeper** | Fatigue Parasite | Green Hopper | Hops toward Lolo. If it touches Lolo, it falls permanently asleep, turning into an immovable obstacle that can trap you if mismanaged. |
| **Rocky** | Inertial Bulldozer | Gray Golem | Charges forward and pushes Lolo against obstacles or traps him in corners. Slow-moving and easily dodged. |
| **King Egger** | Citadel Mainframe | Rogue Core | The supreme Citadel boss requiring multi-stage puzzle mechanics and precise timing to defeat. |

---

## ⌨️ Desktop Keyboard & Gamepad Controls

| Key / Input | Category | Tactical Function |
| :--- | :--- | :--- |
| **WASD** / **Arrow Keys** | Movement | Move Lolo; push alloy blocks, emerald prisms, and eggs along paths. |
| **Space** / **X** | Combat | **Plasma Stasis Blaster**: 1st shot turns enemy into pushable egg; 2nd shot disintegrates it. |
| **Z** | Tactical | **Temporal Rewind (Undo)**: Rewinds time by 1 move with unlimited memory and zero penalty. |
| **R** | Tactical | **Chamber Reset**: Resets the current chamber to initial layout. |
| **H** | Intelligence | **Holographic Ghost Guide**: Toggles AI mathematical shortest-path solver. |
| **M** | Navigation | **Sector Map**: Opens the 5-sector tactical campaign overview. |
| **L** | Navigation | **Level Selector**: Jump to any of the 100 unlocked operations. |
| **E** | Creative | **Architect Studio**: Launch built-in custom level editor. |
| **D** | Challenge | **Daily Cyber Hack**: Loads globally synchronized daily puzzle. |
| **O** | Procedural | **Random Synthesis Lab**: Generates mathematically verified random chambers. |
| **F1** or **?** | System | Open in-game tactical field manual. |
| **F11** or **F** | Global | Toggle borderless fullscreen display. |
`);

  // 31_rodents_revenge_deluxe.md
  writeFileSync(join(outDir, "31_rodents_revenge_deluxe.md"), `# 🐭 Rodent's Revenge Deluxe -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native HTML5 Canvas & Retro Sound Synthesis  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:rodents_revenge]  •  [Headless Server: bun run applications/rodents_revenge_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Rodent's Revenge Deluxe** is a high-DPI modern arcade revival of the classic 1991 Microsoft Windows puzzle game, rebuilt natively for Bun RAD Studio. You control a clever mouse trapped inside a grid crawling with hungry hostile cats.

By pushing movable green blocks, you must outmaneuver the feline predators, trap them so they cannot move, and turn them into delicious wedges of score-multiplying cheese!

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Rodents Revenge Desktop](../../screenshots/apps/rodents_revenge_desktop.png) | ![Rodents Revenge Responsive](../../screenshots/apps/rodents_revenge_responsive.png) |

---

## 🕹️ Gameplay & Strategic Rules
- **Pushing Blocks**: The mouse can push a single movable block or a whole row of blocks if there is an empty space at the end.
- **Trapping Cats**: When a cat has zero valid moves left on any of its four adjacent tiles, it transforms into a wedge of cheese worth bonus points.
- **Obstacles**: Watch out for mousetraps, yarn balls, sinkholes, and perimeter border barriers.
- **Level Progression**: Clear all cats on the board to advance to the next level with faster cats and tighter grids.

---

## ⌨️ Controls Reference

| Action | Primary Key | Secondary Key |
| :--- | :--- | :--- |
| **Move Up / Down / Left / Right** | Arrow Keys | \`W\`, \`S\`, \`A\`, \`D\` |
| **Pause Game** | \`P\` | \`Escape\` |
| **Restart Level** | \`R\` | — |
| **Toggle Sound** | \`M\` | — |
| **Fullscreen** | \`F\` | \`F11\` |
`);

  // 32_word_search_labyrinth.md
  writeFileSync(join(outDir, "32_word_search_labyrinth.md"), `# 🔠 Neon Word Search Labyrinth -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Web Audio & Particle Effects Canvas  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:word_search]  •  [Headless Server: bun run applications/word_search_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Neon Word Search Labyrinth** is a cyberpunk-themed procedural word puzzle game featuring high-DPI glowing canvas typography, tactile Web Audio feedback, interactive drag-and-release word selection, dynamic hint engines, and curated dictionaries across 10 specialized categories (Computer Science, Science, Literature, Geography, Cyberpunk, etc.).

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Word Search Desktop](../../screenshots/apps/word_search_desktop.png) | ![Word Search Responsive](../../screenshots/apps/word_search_responsive.png) |

---

## 🕹️ Gameplay & Controls
- **Word Selection**: Click and drag your mouse across letters horizontally, vertically, or diagonally. Releasing the mouse over a valid word highlights it in vibrant neon color.
- **Hints (H)**: Highlights the starting letter of an unrevealed word.
- **New Puzzle (N)**: Generates a brand-new seeded board with selected dictionary category and difficulty.
`);

  // 33_world_time_zones_studio.md
  writeFileSync(join(outDir, "33_world_time_zones_studio.md"), `# 🌐 World Time Zones Studio Pro -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Intl & IANA Time Zone Database  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:world_time_zones]  •  [Headless Server: bun run applications/world_time_zones_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**World Time Zones Studio Pro** is a real-time global time management and meeting coordination workstation built natively for Bun RAD Studio. Powered by the operating system's built-in IANA Time Zone database and \`Intl.DateTimeFormat\`, it eliminates confusing manual UTC conversions.

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![World Time Zones Desktop](../../screenshots/apps/world_time_zones_desktop.png) | ![World Time Zones Responsive](../../screenshots/apps/world_time_zones_responsive.png) |

---

## 🧭 Key Capabilities
- **Live Synchronized Clocks**: Displays major financial hubs: New York (EDT), London (BST), Tokyo (JST), Sydney (AEST), San Francisco (PDT), Singapore (SGT), and UTC.
- **Solar Day/Night Indicators**: Shows whether a target location is in daylight, twilight, or night.
- **Interactive Scrubber Slider**: Drag a time slider to preview what 3:00 PM in your timezone will be across all global colleagues simultaneously.
`);

  // 34_pacman_arcade.md
  writeFileSync(join(outDir, "34_pacman_arcade.md"), `# 🕹️ Cyberpunk Pac-Man Arcade -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native HTML5 Canvas & Authentic Ghost AI Personalities  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:pacman]  •  [Headless Server: bun run applications/pacman_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Cyberpunk Pac-Man Arcade** is an authentic, retro-futuristic arcade remaster of the legendary 1980 maze game built natively for Bun RAD Studio. Rebuilt from the ground up with 60fps canvas rendering, synthetic chiptune sound effects, and the original, distinct AI personalities for all 4 ghost drones.

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Pacman Desktop](../../screenshots/apps/pacman_desktop.png) | ![Pacman Responsive](../../screenshots/apps/pacman_responsive.png) |

---

## 👻 Ghost AI Personality Dossier

| Ghost | Name | Nickname | Targeting Algorithm |
| :--- | :--- | :--- | :--- |
| 🔴 **Red** | Blinky | Shadow | Aggressive Pursuer: Directly targets Pac-Man's exact grid tile. Accelerates as dots decrease (Cruise Elroy). |
| 🌸 **Pink** | Pinky | Speedy | Tactical Ambusher: Targets 4 tiles ahead of Pac-Man's current direction to cut off escape routes. |
| 🔷 **Cyan** | Inky | Bashful | Unpredictable Flanker: Computes target using vector math between Blinky and Pac-Man. |
| 🟠 **Orange**| Clyde | Pokey | Shy Wanderer: Chases Pac-Man when far away ($> 8$ tiles), but retreats to corner when close. |

---

## ⌨️ Controls Reference
- **Move**: \`Arrow Keys\` or \`W\`, \`A\`, \`S\`, \`D\`
- **Pause**: \`P\` or \`Escape\`
- **Restart**: \`R\`
- **Fullscreen**: \`F\` or \`F11\`
`);

  // 35_codecaine_bros_arcade.md
  writeFileSync(join(outDir, "35_codecaine_bros_arcade.md"), `# 🍄 Codecaine Bros. Arcade -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: 1983 Bumping Arcade Physics & 4-Channel Polyphonic Synth  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:codecaine_bros]  •  [Headless Server: bun run applications/codecaine_bros_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Codecaine Bros. Arcade** is an authentic, overclocked remaster of the legendary 1983 Mario Bros. sewer arcade platformer built natively for Bun RAD Studio. Re-engineered with responsive bumping physics, polyphonic square-wave sound bursts, an interactive suspended POW block, and multiplier combo cascades.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:codecaine_bros

# Launch headless web server
bun run applications/codecaine_bros_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Codecaine Bros Desktop](../../screenshots/apps/codecaine_bros_desktop.png) | ![Codecaine Bros Responsive](../../screenshots/apps/codecaine_bros_responsive.png) |

---

## 🕹️ Core Mechanics & Rules
- **Under-Platform Bumping**: Unlike later games where you jump on top of enemies, in Codecaine Bros. you must run underneath the platforms and **jump to hit the ceiling directly beneath the enemy** to flip them onto their backs.
- **Kicking Flipped Enemies**: Once an enemy is flipped and stunned, jump up to their ledge and run into them to kick them off the screen into the sewer water for bonus points!
- **Interactive POW Block**: Hitting the central POW block causes an earthquake that flips all grounded enemies simultaneously. Conserve its 3 charges!
- **Enemy Escalation**:
  - **Spinies**: Require 1 hit from beneath.
  - **Fighter Flies**: Hop along platforms; must be hit when touching down.
  - **Sidesteppers (Crabs)**: Require 2 bumps: 1st hit angers them and speeds them up; 2nd hit flips them.
  - **Freezies**: Slide across ledges turning platforms into slippery ice; hit them before they freeze the floor!

---

## ⌨️ Desktop Controls Reference

| Action | Player 1 (Keyboard) | Player 2 (Keyboard) |
| :--- | :--- | :--- |
| **Move Left / Right** | \`A\` / \`D\` or \`←\` / \`→\` | \`J\` / \`L\` |
| **Jump** | \`Space\` or \`W\` or \`↑\` | \`I\` or \`K\` |
| **Pause** | \`P\` | \`P\` |
| **Restart** | \`R\` | \`R\` |
| **Fullscreen** | \`F\` / \`F11\` | \`F\` / \`F11\` |
`);

  // 36_connect4_studio.md
  writeFileSync(join(outDir, "36_connect4_studio.md"), `# 🔴 Cyberpunk Connect 4 Champion -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Minimax Heuristics AI Engine & Kinetic Falling Physics  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:connect4]  •  [Headless Server: bun run applications/connect4_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Cyberpunk Connect 4 Champion** is a neon-infused, tactical 2-player and AI board game studio built natively for Bun RAD Studio. It combines real-time column hover drop previews, kinetic gravity disc falling physics, celebratory particle bursts, Web Audio sound effects, and a configurable Minimax heuristic AI.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:connect4

# Launch headless server
bun run applications/connect4_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Connect 4 Desktop](../../screenshots/apps/connect4_desktop.png) | ![Connect 4 Responsive](../../screenshots/apps/connect4_responsive.png) |

---

## 🕹️ Game Modes & AI Difficulty
- **Player vs AI**:
  - \`Cadet (Easy)\`: Casual heuristics, perfect for relaxing play.
  - \`Cyber (Medium)\`: Looks ahead 3–4 plies, blocks immediate threats.
  - \`Overclocked (Hard)\`: Deep Minimax tree search with positional evaluation.
- **2-Player Local Battle**: Play head-to-head on the same keyboard or mouse.
- **Turn Timer**: Optional 15s / 30s shot clock to keep matches fast and competitive.
- **Win Streak Counter**: Tracks consecutive victories and high-score streaks.

---

## ⌨️ Controls Reference
- **Drop Disc in Column 1..7**: Keys \`1\`, \`2\`, \`3\`, \`4\`, \`5\`, \`6\`, \`7\` or direct mouse click.
- **Reset Board**: \`R\`
- **Toggle AI Mode**: \`M\`
- **Fullscreen**: \`F\` / \`F11\`
`);

  // 37_maze_generator_studio.md
  writeFileSync(join(outDir, "37_maze_generator_studio.md"), `# 🌀 Cyberpunk Maze Generator & Solver -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Procedural Maze Graph Algorithms & A*/Dijkstra Solvers  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:maze]  •  [Headless Server: bun run applications/maze_generator_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Cyberpunk Maze Generator & Solver** is an interactive procedural labyrinth generation, pathfinding visualization, and exploration studio built natively for Bun RAD Studio. It provides live visual demonstrations of graph theory algorithms, dynamic neon particle trails, and interactive player navigation with optional fog-of-war.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:maze

# Launch headless server
bun run applications/maze_generator_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Maze Generator Desktop](../../screenshots/apps/maze_generator_desktop.png) | ![Maze Generator Responsive](../../screenshots/apps/maze_generator_responsive.png) |

---

## 🧭 Procedural Algorithms & Solvers

### 1. Maze Generation Algorithms
- **Recursive Backtracker**: Produces long, winding corridors with deep solution paths.
- **Prim's Algorithm**: Generates short, highly branched mazes with numerous dead ends.
- **Kruskal's Algorithm**: Randomized minimum spanning tree algorithm creating balanced labyrinths.
- **Wilson's Algorithm**: Generates completely unbiased uniform spanning trees using loop-erased random walks.

### 2. Real-Time Pathfinding Solvers
- **A* Search (A-Star)**: Heuristic-driven shortest path finder using Manhattan distance ($f(n) = g(n) + h(n)$).
- **Dijkstra's Algorithm**: Exhaustive breadth-first wavefront exploration showing every visited node in glowing neon.

---

## ⌨️ Controls Reference
- **Interactive Player Movement**: \`WASD\` or \`Arrow Keys\`
- **Generate New Maze**: \`N\` or \`Space\`
- **Toggle AI Solver**: \`S\`
- **Clear Solution Path**: \`C\`
- **Fullscreen**: \`F\` / \`F11\`
`);

  // 38_pong_arcade.md
  writeFileSync(join(outDir, "38_pong_arcade.md"), `# 🏓 Neon Cyber Pong -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Kinetic Vector Ball Physics & Synthetic Audio  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:pong]  •  [Headless Server: bun run applications/pong_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Neon Cyber Pong** is a high-speed, kinetic arcade tennis remaster built natively for Bun RAD Studio. Featuring responsive paddle spin deflection physics, particle collision shockwaves, Web Audio frequency synthesis, multi-tier AI opponents, and local 2-player multiplayer.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:pong

# Launch headless server
bun run applications/pong_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Cyber Pong Desktop](../../screenshots/apps/pong_desktop.png) | ![Cyber Pong Responsive](../../screenshots/apps/pong_responsive.png) |

---

## 🕹️ Physics & Deflection Mechanics
- **Edge Spin Deflection**: Hitting the ball with the outer edges of the paddle introduces severe vertical spin, deflecting the ball at sharp, high-speed angles to outmaneuver opponents.
- **Paddle Momentum Acceleration**: Moving the paddle in the direction of the ball during impact increases velocity by 15%, delivering a power smash.
- **Victory Race**: First player to score 11 points wins the match with a celebratory neon fanfare.

---

## ⌨️ Controls Reference

| Player | Up | Down |
| :--- | :--- | :--- |
| **Player 1 (Left Paddle)** | \`W\` | \`S\` |
| **Player 2 (Right Paddle / Local)** | \`↑\` Up Arrow | \`↓\` Down Arrow |
| **Pause Game** | \`P\` or \`Escape\` | — |
| **Toggle AI / 2-Player** | \`M\` | — |
| **Fullscreen** | \`F\` / \`F11\` | — |
`);

  // 39_tictactoe_studio.md
  writeFileSync(join(outDir, "39_tictactoe_studio.md"), `# ⭕ Neon Tic-Tac-Toe AI Studio -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Unbeatable Minimax Game Theory Engine  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:tictactoe]  •  [Headless Server: bun run applications/tictactoe_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Neon Tic-Tac-Toe AI Studio** is an interactive, cyberpunk-styled 3x3 strategy game and game theory workstation built natively for Bun RAD Studio. It showcases the classic **Minimax Algorithm** in an unbeatable AI mode, alongside casual practice modes, local 2-player matches, glowing neon canvas visuals, particle celebrations, and sound synthesis.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:tictactoe

# Launch headless server
bun run applications/tictactoe_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Tic Tac Toe Desktop](../../screenshots/apps/tictactoe_desktop.png) | ![Tic Tac Toe Responsive](../../screenshots/apps/tictactoe_responsive.png) |

---

## 🧭 Game Modes & AI Theory
- **Unbeatable Minimax AI**: Recursively evaluates all future game states ($3^9 = 19,683$ possible leaf nodes). It is mathematically impossible to win against this mode—the best possible outcome is a hard-fought Draw.
- **Casual Mode**: Introduces a 20% random exploration probability, allowing players to practice win scenarios.
- **2-Player Local Battle**: Play against a friend on the same machine.
- **Scoreboard**: Tracks Player X Wins, Player O Wins, Draws, and active win streaks.

---

## ⌨️ Controls Reference
- **Place Marker on Grid**: Numpad keys \`1..9\` (mapped to 3x3 grid) or direct mouse click.
- **Restart Round**: \`R\`
- **Toggle Mode**: \`M\`
- **Fullscreen**: \`F\` / \`F11\`
`);

  console.log("✔ Retro Arcade & Classic Games (30 to 39) generated with AAA quality.");
}
