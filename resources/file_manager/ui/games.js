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
    title: "Codecaine TetroGrid Ultra Deluxe",
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
    note: "6-mode Cyber-Sewer Platformer & Roguelike Suite: Classic 1983, Endless Roguelike Perks, Boss Rush, 90s Parkour Blitz, 6-Biome Architect & 2P Battle.",
    controls: "WASD/Arrows: Run/Jump • Shift: Air-Dash • F: Fireball • Down+Space: Ground-Pound • 1-6: Mode",
  },
  {
    id: "dr_codecaine",
    title: "Codecaine Dr. Codecaine Arcade",
    icon: "💊",
    category: "Puzzle & Logic",
    note: "10-mode Dr. Codecaine Medical Suite: Classic, Miracle Cure Power Capsules, Vs. CPU Garbage Duel, Flash VIP Bugs, Bio-Surge, Boss Pathogen, Rx Puzzle & 2P Co-Op.",
    controls: "Arrows/WASD: Move Capsule • Z/X/Up: Flip • Space: Hard Drop • E: Miracle Skill • 1-0: Mode",
  },
  {
    id: "pacman",
    title: "Codecaine CyberChomp Arcade",
    icon: "🟡",
    category: "Arcade & Action",
    note: "6-mode CyberChomp DX+ Suite: Classic 1980, Championship DX+ Ghost Trains, Procedural Mazes, 256 Glitch Survival, Play-as-Blinky & 2P Co-Op/Versus.",
    controls: "Arrows/WASD: Steer • Shift: Phase Dash • E: DX Smart Bomb • 1-6: Mode • P: Pause",
  },
  {
    id: "breakout",
    title: "Codecaine CyberBrick Breaker Deluxe",
    icon: "🧱",
    category: "Arcade & Action",
    note: "Deluxe CyberBrick Breaker arcade with continuous swept collision physics, 8 dynamic power-ups, pentatonic combo synth melodies & gamepad support.",
    controls: "Mouse or Left/Right: Paddle • Space/Click: Launch & Laser",
  },
  {
    id: "balatro",
    title: "Codecaine Joker Royale Deluxe",
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
    note: "Deluxe casino poker table featuring No-Limit Texas Hold'em and 5-Card Draw, 6-max AI personalities, Codecaine Royale vector cards & hand odds.",
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
    note: "High-speed reflex card slapper with authentic Codecaine Royale vector cards, face-card challenges, customizable slap rules (Doubles, Sandwich, 10s) & multi-CPU AI.",
    controls: "Space / Enter: Deal Card • Shift / S: Slap Pile",
  },
  {
    id: "yahtzee",
    title: "Codecaine Yacht Dice Royale Deluxe",
    icon: "🎲",
    category: "Card & Casino",
    note: "Deluxe classic Yacht Dice board studio with 3D tactile dice, Codecaine championship scorecard, +35 upper bonus, Yacht Jokers & AI opponent.",
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
    title: "Codecaine Adventures of Caine Remaster",
    icon: "👾",
    category: "Puzzle & Logic",
    note: "Cyberpunk remastered Adventures of Caine puzzle rooms with Snakey, Medusa, Alma, Emerald Framers, Egg mechanics & level editor.",
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
    title: "Codecaine CyberSki Deluxe",
    icon: "⛷️",
    category: "Arcade & Action",
    note: "Downhill alpine skiing across Slalom, Freestyle & Endless modes with aerial tricks, rainbow boost pads & the Abominable Cyber-Yeti.",
    controls: "Mouse or Left/Right: Carve • Space: Jump/Tricks • F: Boost",
  },
  {
    id: "flappy_bird",
    title: "Codecaine CyberWing Deluxe",
    icon: "🐦",
    category: "Arcade & Action",
    note: "Kinetic cyberpunk CyberWing arcade with plasma conduits, day/night/synthwave themes, medal achievements & WebAudio synth.",
    controls: "Space / Up / Click: Flap Thrust • P: Pause",
  },
  {
    id: "math_munchers",
    title: "Codecaine CyberMunch Math Deluxe",
    icon: "👾",
    category: "Word & Skill",
    note: "Cyberpunk CyberMunch Math classic with Multiples, Factors, Primes, Equalities, Glitchers AI patrollers & CRT synth audio.",
    controls: "Arrows/WASD: Move • Space/Enter: Munch Number",
  },
  {
    id: "typing",
    title: "Codecaine CyberType Deluxe",
    icon: "⌨️",
    category: "Word & Skill",
    note: "Codecaine Master Edition typing academy with 10-step guided tutorial, 18-lesson curriculum, Codecaine Adaptive AI, QWERTY/Colemak/Dvorak/Workman layouts, 6 switch profiles & Word Rain defense.",
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
    title: "Codecaine CyberMouse Trap Deluxe",
    icon: "🧀",
    category: "Arcade & Action",
    note: "Deluxe arcade revival of CyberMouse Trap: push movable blocks to trap chasing cats, turn them into cheese & survive escalating waves.",
    controls: "Arrows or WASD: Move & Push Blocks • P: Pause",
  },
  {
    id: "pong",
    title: "Codecaine Neon Cyber Paddle",
    icon: "🏓",
    category: "Arcade & Action",
    note: "High-speed kinetic Cyber Paddle with paddle spin physics, 4 AI difficulty tiers, local 2-player versus mode & synth sound effects.",
    controls: "W/S or Up/Down or Mouse: Move Paddle • Space: Serve",
  },
  {
    id: "connect4",
    title: "Codecaine Cyberpunk QuadLink 4",
    icon: "🔴",
    category: "Puzzle & Logic",
    note: "Neon QuadLink 4 arcade with Minimax alpha-beta AI difficulty levels, 2-player local battle, column hover preview & drop physics.",
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
  {
    id: "jezzball",
    title: "Codecaine CyberJezz Containment Deluxe",
    icon: "⚡",
    category: "Arcade & Action",
    note: "1992 JezzBall remaster: capture 75%+ of the cyber-grid by firing horizontal/vertical laser containment beams while dodging bouncing plasma atoms.",
    controls: "Left Click: Fire Beam • Right Click/Space/R: Toggle H/V • E: Slow-Mo • Q: Shielded Beam",
  },
  {
    id: "chips_challenge",
    title: "Codecaine CyberChip's Labyrinth",
    icon: "💾",
    category: "Puzzle & Logic",
    note: "Tile-based puzzle gauntlet with Quantum Microchips, elemental boots (Fire, Flippers, Ice Cleats, Suction), colored keys, sliding blocks & undo.",
    controls: "Arrows/WASD: Move • Z: Undo Move • R: Restart Level • N: Procedural Level",
  },
  {
    id: "pipe_dream",
    title: "Codecaine CyberPipe Flow Deluxe",
    icon: "🔧",
    category: "Puzzle & Logic",
    note: "8-mode Pipe Engineering Suite: Classic Pipe Mania, 100-Level Rotate-All Grid, Dual-Color Mixing, Reactor Meltdown, Hold Slot [H], Rotate [R] & 3D Flanged Conduits.",
    controls: "Click/Space: Place/Rotate • R: Rotate Next • H: Hold Slot • C: Cryo-Freeze • X: Wrench • F: Surge",
  },
  {
    id: "solitaire",
    title: "Codecaine Solitaire Royale: Klondike, Spider & FreeCell",
    icon: "🃏",
    category: "Card & Casino",
    note: "3-in-1 Championship Solitaire (Klondike, Spider & FreeCell) with auto-foundation, smart hints, unlimited undo & bouncing cards victory waterfall.",
    controls: "Click/Drag Cards • Double-Click/A: Auto-Foundation • H: Hint • Z: Undo",
  },
  {
    id: "pinball",
    title: "Codecaine CyberCadet Pinball 2099",
    icon: "🛸",
    category: "Arcade & Action",
    note: "Space Cadet 60fps physics pinball table with pop bumpers, slingshots, drop targets, hyperspace loop, wormhole multiball & Space Fleet ranks.",
    controls: "Z/Left: Left Flipper • //Right: Right Flipper • Hold Space: Plunger • X: Nudge",
  },
  {
    id: "asteroids",
    title: "Codecaine VoidVector Asteroids Deluxe",
    icon: "☄️",
    category: "Arcade & Action",
    note: "360° Newtonian vector shooter with splitting wireframe boulders, hunter-seeker UFO saucers, energy shields, hyperspace warp & weapon orbs.",
    controls: "Left/Right: Rotate • Up/W: Thrust • Space: Fire • Shift/S: Shield • H/E: Hyperspace",
  },
  {
    id: "space_invaders",
    title: "Codecaine CyberInvaders: StarSwarm",
    icon: "👾",
    category: "Arcade & Action",
    note: "Galactic alien formation & dive-bomber shooter with pixel-eroding plasma bunkers, mystery red UFOs, twin-blaster upgrades & wave beam.",
    controls: "Left/Right or A/D: Move • Space: Fire • E: Overcharge Wave Cannon",
  },
  {
    id: "bomberman",
    title: "Codecaine CyberBomber Grid Arena",
    icon: "🧨",
    category: "Arcade & Action",
    note: "8-mode Super CyberBomber DX Suite: 50-Stage Campaign, Battle Royale + Revenge Carts, Roguelike Perks, Boss Rush, Cyber-Louie Mounts, 6 Biomes & 2P Co-Op/Versus.",
    controls: "WASD + Space: Bomb • Q: Remote • E: Glove Punch/Throw • C: Line Bomb • V: Louie Mount",
  },
  {
    id: "missile_command",
    title: "Codecaine CyberDefense: ICBM Interceptor",
    icon: "🚀",
    category: "Arcade & Action",
    note: "Defend 6 neon megacities with Alpha/Beta/Gamma counter-missile silos and expanding chain-reaction shockwaves against splitting MIRV warheads.",
    controls: "Mouse Aim + Click (or A/S/D for Left/Center/Right Battery)",
  },
  {
    id: "qbert",
    title: "Codecaine CyberCube Hopper",
    icon: "🟧",
    category: "Arcade & Action",
    note: "Isometric 28-cube 3D pyramid color-flipper with Coily the cyber-snake, spinning escape discs, Slick color-reverters & green chrono-freeze orbs.",
    controls: "Q/W/A/S or Arrows or Click Adjacent Cube: Hop Diagonally",
  },
  {
    id: "centipede",
    title: "Codecaine CyberCentipede Blaster",
    icon: "🐛",
    category: "Arcade & Action",
    note: "High-speed spore-field shooter where splitting centipede segments spawn independent chains alongside bouncing spiders, fleas & poison scorpions.",
    controls: "Mouse or WASD/Arrows: Move • Space/Click: Rapid Plasma Fire",
  },
  {
    id: "artillery",
    title: "Codecaine CyberArtillery: Scorched Skyline",
    icon: "🎯",
    category: "Arcade & Action",
    note: "Turn-based wind & gravity trajectory artillery across destructible procedural skyscrapers with MIRVs, Funky Bombs, Bunker Busters & 1P/2P modes.",
    controls: "Up/Down: Angle • Left/Right: Power • 1-5: Weapon • Space: Fire",
  },
  {
    id: "pool",
    title: "Codecaine 8-Ball Pool Royale: Cyber Billiards Suite",
    icon: "🎱",
    category: "Arcade & Action",
    note: "10-mode Billiards & Snooker Suite (8-Ball, 9-Ball, 10-Ball, 14.1 Straight, One-Pocket, Cut-Throat, 6-Red Snooker, Bank Pool & 12 Trick Shots) with Masse & Jump Shots.",
    controls: "Mouse: Aim & Power • E: Cue Elevation (Masse/Jump) • C: Call Pocket • K: Chalk • V: Replay",
  },
  {
    id: "lunar_lander",
    title: "Codecaine CyberLander: Vector Descent",
    icon: "🌕",
    category: "Arcade & Action",
    note: "Precision vector thruster & fuel physics simulator across Moon, Mars & Titan craters with 1x-5x multiplier pads and emergency retro-stabilizer.",
    controls: "Up/W/Space: Main Thruster • Left/Right: Rotate • E: Retro-Stabilizer",
  },
  {
    id: "cyber2048",
    title: "Codecaine Cyber2048 Quantum Merge",
    icon: "🔢",
    category: "Puzzle & Logic",
    note: "Power-of-2 sliding neon tile synthesizer with 3x3/4x4/5x5 grids, harmonic merge synth, 5-step temporal undo, tile zap & AI expectimax hint.",
    controls: "Arrows/WASD/Swipe: Slide Tiles • Z: Undo • X: Zap Tile • H: AI Hint",
  },
  {
    id: "sokoban",
    title: "Codecaine CyberCrate Sokoban",
    icon: "📦",
    category: "Puzzle & Logic",
    note: "100 verified solvable warehouse puzzle chambers + multi-difficulty winnable random generator, live AI Hint & Auto-Solve, and deadlock alerts.",
    controls: "Arrows/WASD: Push Crates • G: Random • H: Hint • X: Solve • Z: Undo",
  },
  {
    id: "reversi_checkers",
    title: "Codecaine CyberReversi & Checkers AI",
    icon: "⚫",
    category: "Puzzle & Logic",
    note: "Dual 8x8 strategy workstation combining Othello/Reversi and Championship Checkers with 3-tier alpha-beta Minimax AI, flip previews & 2P versus.",
    controls: "Click highlighted valid cells/jumps • Z: Undo • H: AI Best Move Hint",
  },
  {
    id: "uno",
    title: "Codecaine UNO Royale: Wild Cascade Edition",
    icon: "🎴",
    category: "Card & Casino",
    note: "Realistic 4-player tabletop UNO with authentic physical vector cards, +2/+4 Stacking Cascades, 7-0 Hand Swap, UNO Catch & 500-Pt Tournament Cup.",
    controls: "Click Playable Card or Draw Deck • U: Shout UNO! • C: Catch AI • S: Sort • H: Hint",
  },
  {
    id: "bowling",
    title: "Codecaine CyberStrike Bowling: 300 Perfect Club",
    icon: "🎳",
    category: "Arcade & Action",
    note: "AAA 3D-perspective 10-frame PBA bowling with lane oil hook physics, 10-pin domino scatter, split spare clinic & 1P Pro AI / 2P Pass & Play.",
    controls: "Left/Right: Stance & Aim • S: Spin Curve • Space/Click: Bowl • R: Reset",
  },
  {
    id: "darts",
    title: "Codecaine Pro Darts Royale: 501 & Cricket Arena",
    icon: "🎯",
    category: "Word & Skill",
    note: "14-Game Pro Darts Arena (501, 301, 701, Cricket, Cut-Throat, Tactics, Clock, Shanghai, Killer, Bob's 27, Halve-It, Baseball, Golf & Count-Up) + 4-Tier Ballistics.",
    controls: "Mouse/Arrows: Aim • Hold Click/Space: Charge 78% Power & Release • Shift: Steady Breath",
  },
  {
    id: "bejeweled",
    title: "Codecaine CyberJewel 12-Mode Blitz: Diamond Mine & Prism Royale",
    icon: "💎",
    category: "Puzzle & Logic",
    note: "12-mode Match-3 gem symphony with 3D ray-traced jewelry shaders, interactive Mini-Game Stage Canvas & active [SPACE] tactical gadgets.",
    controls: "Click/Drag Adjacent Gems • Space: Mode Gadget • 1-9/0: Mode • H: AI Hint • R: Shuffle",
  },
  {
    id: "balloon_fight",
    title: "Codecaine CyberBalloon Fight: Sky Joust & Storm Trip",
    icon: "🎈",
    category: "Arcade & Action",
    note: "6-mode NES Balloon Fight & Balloon Trip remaster: Sky Arena, Endless Lightning Trip, Roguelike Perks, Boss Storm, 2P Co-Op & 2P Dogfight with Piranha waves.",
    controls: "W/Up/Space: Flap • A/D or Left/Right: Steer • Shift: Air-Dash • S/Down: Pump/Dive • 1-6: Mode",
  },
  {
    id: "marble_madness",
    title: "Codecaine CyberMarble Madness: Isometric Gravity Odyssey",
    icon: "🔮",
    category: "Arcade & Action",
    note: "8-mode 3D isometric Marble Madness & Marble Blast suite with slope gravity, Black Steel Knockers, Gem Hunt, Tilt Labyrinth, Ghost Replay & 2P Race.",
    controls: "WASD/Arrows or Mouse Drag: Roll • Shift: Turbo Boost • Space: Gyro-Hop • 1-8: Mode",
  },
  {
    id: "mappy",
    title: "Codecaine CyberMappy: Mansion Heist & Trampoline Police",
    icon: "🐭",
    category: "Arcade & Action",
    note: "8-mode Namco Mappy mansion remaster with color-changing trampolines, Microwave Shockwave Doors, Goro hiding multipliers, Roof Balloons & 2P Co-Op/Versus.",
    controls: "Left/Right or A/D: Run & Exit Trampoline • Space/E: Open Door / Microwave Wave • 1-8: Mode",
  },
  {
    id: "cyber_maker",
    title: "Codecaine CyberMaker Studio: OS Kernel World Architect",
    icon: "🏗️",
    category: "Arcade & Action",
    note: "Super Mario Maker-style level architect & platformer with Linux Tux Slide, macOS Dock/Beachball, FreeBSD Beastie Trident & Windows BSOD Thwomp/Clippy.",
    controls: "Tab/P: Toggle Edit/Play • Click/Drag: Paint Tiles & Wires • WASD/Arrows+Space: Playtest",
  },
  {
    id: "lemmings",
    title: "Codecaine CyberLemmings: Kernel Thread Rescue",
    icon: "🧵",
    category: "Puzzle & Logic",
    note: "8-mode destructible terrain puzzle with 8 assignable daemon thread roles (Climber, Floater, Bomber, Blocker, Builder, Basher, Miner, Digger) & terrain brush.",
    controls: "1-8: Select Skill • Click Lemming: Assign Role • -/+: Release Rate • F: Fast-Forward • P: Pause",
  },
  {
    id: "lode_runner",
    title: "Codecaine CyberLode: Gold Cache Heist",
    icon: "⛏️",
    category: "Arcade & Action",
    note: "8-mode Lode Runner remaster: drill temporary holes in brick floors to trap pursuing AI guards, shimmy across zip-lines, collect gold & unlock the Escape Ladder.",
    controls: "WASD/Arrows: Move & Climb • Q/Z: Drill Left • E/X: Drill Right • H: AI Hint • G: Random Level",
  },
  {
    id: "chuchu_rocket",
    title: "Codecaine CyberRocket: Arrow Tile Panic",
    icon: "🚀",
    category: "Puzzle & Logic",
    note: "8-mode Dreamcast ChuChu Rocket! action puzzle: place directional arrows (▲▼◄►) to herd mice into your rocket while routing cats into rival AI rockets.",
    controls: "WASD/1-4 + Click or Drag: Place Arrow Tile • H: AI Best Arrow • Space: Start/Pause",
  },
  {
    id: "rampart",
    title: "Codecaine CyberRampart: Fortress Build & Cannon Siege",
    icon: "🏰",
    category: "Arcade & Action",
    note: "8-mode 3-phase Rampart strategy arcade: deploy cannons inside enclosed castles, bombard invading warships, and patch walls with Tetris polyominoes.",
    controls: "Mouse Click: Place Cannon / Fire Salvo / Place Wall • R/Right-Click: Rotate Piece • H: Auto-Patch",
  },
  {
    id: "qix",
    title: "Codecaine CyberQix: Laser Territory Claim",
    icon: "⚡",
    category: "Arcade & Action",
    note: "8-mode Qix & Volfied territory slicer: draw laser trails to claim 75%+ of the grid while dodging the harmonic Plasma Qix, Sparx & collecting Power Cubes.",
    controls: "WASD/Arrows: Move • Hold Space: Fast Draw • Hold Shift: Slow Draw (2x Pts)",
  },
  {
    id: "magical_drop",
    title: "Codecaine CyberDrop: Grab & Throw Chain Blitz",
    icon: "🃏",
    category: "Puzzle & Logic",
    note: "8-mode Neo-Geo Magical Drop III & Money Idol Exchanger action puzzle with 6 Tarot Arcana fighters, Ice/Rainbow orbs & 15x active cascade chains.",
    controls: "A/D or Left/Right: Move Jester • S/Down/Space/Click: Grab Orbs • W/Up/Right-Click: Throw Orbs",
  },
  {
    id: "peggle",
    title: "Codecaine CyberPeggle: Extreme Pachinko Odyssey",
    icon: "🌈",
    category: "Arcade & Action",
    note: "8-mode Peggle pachinko spectacle: clear all 25 Orange Pegs with 8 Zen Master power-ups (Super Guide, Multiball, Fireball, Flippers) & Extreme Fever fanfare.",
    controls: "Mouse or Left/Right: Aim Cannon • Click/Space: Fire Ball & Flippers • 1-8: Mode",
  },
  {
    id: "memory_match",
    title: "Codecaine CyberRecall Royale: Holo-Vault Memory Match",
    icon: "🧠",
    category: "Card, Casino & Board",
    note: "8-mode 3D Hologram Card-Flip & Memory Match Royale: Classic 4x4, Grand Vault 6x4, Master 6x6, Triad Match-3, 60s Blitz, Cyber-Minefield & VS Neural AI Duel.",
    controls: "Click or Arrows/WASD + Space: Flip Card • Q: X-Ray Peek • W: Auto-Pair • E: Freeze • R: Hint • 1-8: Mode",
  },
  {
    id: "vampire_survivors",
    title: "Codecaine NightSavior: Vampire Survivors & Dark Force",
    icon: "🧛",
    category: "Arcade & Action",
    note: "8-mode Gothic Bullet-Heaven & Vampire Savior Dark Force Odyssey: 6 Night-Lords, 10 Weapon Evolutions, Multi-Beam Chest Jackpots & 1v1 Darkstalkers Duel.",
    controls: "WASD/Arrows: Move • Space/E: Dark Force Overdrive • Shift: Dash • C: Open Chest • 1-8: Mode",
  },
  {
    id: "game_show",
    title: "Codecaine Mr. Game Show Royale: TV Studio Mega-Pack",
    icon: "🎩",
    category: "Word & Skill",
    note: "8-in-1 Primetime TV Game Show Mega-Studio hosted by Mr. Caine-Show: Wheel of Fortune, No Whammies Big Board, Survey Feud, Cyber-Jeopardy, Plinko & Deal Cases.",
    controls: "Space: Spin Wheel / Stop Big Board / Buzz In • Click Tiles/Cases/Letters • 1-8: TV Show Mode",
  },
  {
    id: "slots",
    title: "Codecaine Vegas Jackpot Slots Royale: Hold & Spin",
    icon: "🎰",
    category: "Cards & Casino",
    note: "8-machine Vegas High-Limit Casino Slots suite: Lightning Link Hold & Spin, 4 Progressive Jackpots (Grand/Major/Minor/Mini), Buffalo Stampede & Bonus Wheel.",
    controls: "Space/Enter: Spin Reels & Slam-Stop • H: Trigger Hold & Spin • F: Free Spins • B: Max Bet • 1-8: Machine",
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
    let activeShader = "cyber_bloom";
    const favSet = new Set();
    let recentIds = [];

    try {
      const savedFavs = JSON.parse(localStorage.getItem("codecaine_games_favorites") || "[]");
      if (Array.isArray(savedFavs)) savedFavs.forEach((id) => favSet.add(String(id)));
      const savedRec = JSON.parse(localStorage.getItem("codecaine_games_recent") || "[]");
      if (Array.isArray(savedRec)) recentIds = savedRec.map(String).slice(0, 6);
    } catch {
      /* storage unavailable */
    }

    function saveFavorites() {
      try {
        localStorage.setItem("codecaine_games_favorites", JSON.stringify([...favSet]));
      } catch {}
    }

    function recordRecent(gameId) {
      recentIds = [gameId, ...recentIds.filter((id) => id !== gameId)].slice(0, 6);
      try {
        localStorage.setItem("codecaine_games_recent", JSON.stringify(recentIds));
      } catch {}
    }

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

    const randomGameBtn = h(
      "button",
      {
        type: "button",
        id: "games-random-btn",
        class: "pw-btn",
        title: "Arcade Roulette: Pick and launch a random Codecaine game",
        onclick: () => {
          const pool = CODECAINE_GAMES.filter((g) => g.id !== activeGame.id);
          const pick = pool[Math.floor(Math.random() * pool.length)] || CODECAINE_GAMES[0];
          playGame(pick);
        },
      },
      "🎲 Random Game",
    );

    const shaderPicker = h(
      "select",
      {
        id: "games-fx-shader",
        "aria-label": "Game Master FX Shader Preset",
        title: "Choose live Game Master post-processing shader preset",
        onchange: () => {
          activeShader = shaderPicker.value;
          syncFrameShader();
        },
      },
      h("option", { value: "cyber_bloom" }, "⚡ Cyber Bloom"),
      h("option", { value: "crt_arcade" }, "📺 CRT 1984"),
      h("option", { value: "synthwave" }, "🌆 Synthwave"),
      h("option", { value: "matrix" }, "🟢 Matrix Grid"),
      h("option", { value: "golden_vip" }, "👑 Golden VIP"),
      h("option", { value: "clean" }, "🎯 Esports Raw"),
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
      randomGameBtn,
      closeGameBtn,
      h("label", {}, "Active game:", picker),
      h("label", {}, "FX Shader:", shaderPicker),
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

    function syncFrameShader() {
      try {
        frame.contentWindow?.postMessage?.({ fmGameMasterFx: activeShader }, "*");
      } catch {
        /* frame not ready */
      }
    }

    frame.addEventListener("load", () => {
      syncFrameTheme(frame);
      syncFrameShader();
      focusAndResizeFrame();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => focusAndResizeFrame());
      }
    });
    on("theme-changed", (payload) => syncFrameTheme(frame, payload));

    if (typeof window !== "undefined") {
      window.addEventListener("message", (e) => {
        if (
          e.data &&
          typeof e.data === "object" &&
          e.data.fmCloseGame &&
          e.source === frame.contentWindow &&
          (!e.origin || e.origin !== "null")
        ) {
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
      recordRecent(game.id);
      updateActiveButtons();
      renderCatalog();
      setMode("play");
    }

    function renderCategories() {
      const cats = ["All", "⭐ Favorites", "🕒 Recent", "Arcade & Action", "Puzzle & Logic", "Card & Casino", "Word & Skill"];
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
      const isFav = favSet.has(game.id);
      const isRecent = recentIds.includes(game.id);
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
          h(
            "div",
            { class: "game-card-badges" },
            isRecent ? h("span", { class: "game-recent-pill", title: "Recently Played" }, "🕒 Recent") : null,
            h("span", { class: "code-badge code-badge-quiet" }, game.category),
            h(
              "button",
              {
                type: "button",
                class: `game-fav-btn${isFav ? " is-fav" : ""}`,
                title: isFav ? "Remove from Favorites" : "Add to Favorites",
                "aria-label": `Favorite ${game.title}`,
                "aria-pressed": String(isFav),
                onclick: (e) => {
                  e.stopPropagation();
                  if (favSet.has(game.id)) favSet.delete(game.id);
                  else favSet.add(game.id);
                  saveFavorites();
                  renderCatalog();
                },
              },
              isFav ? "★" : "☆",
            ),
          ),
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
        if (selectedCategory === "⭐ Favorites" && !favSet.has(g.id)) return false;
        if (selectedCategory === "🕒 Recent" && !recentIds.includes(g.id)) return false;
        if (selectedCategory !== "All" && selectedCategory !== "⭐ Favorites" && selectedCategory !== "🕒 Recent" && g.category !== selectedCategory) return false;
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
