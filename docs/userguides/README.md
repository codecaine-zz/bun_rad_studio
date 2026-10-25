# ⚡ Bun RAD Studio -- Enterprise Application User Guides (Master Hub)

Welcome to the comprehensive, AAA-grade documentation and operational user guides for the **Bun RAD Studio Desktop & Workstation Suite**.

Every application in this suite is built to 30-year enterprise standards: **zero external dependencies** (no Homebrew, no third-party native drivers), pure Bun and Node subsystem primitives, full macOS WKWebView integration, reactive state persistence, and instant visual feedback.

---

## 📑 Complete 40-Application Directory & Master Launcher

### ⚡ 0. Master Workstation Launcher & Dispatcher
| # | Application Guide | Focus Area | GUI Launch | CLI Launch |
| :-: | :--- | :--- | :--- | :--- |
| **00** | [Launcher Studio Pro](00_launcher_studio.md) | Unified command cockpit for all 150+ tools with **Pinned Favorites**, 1-click execution, and rock-solid selection stability. | `bun run app:launcher` | `bun run cli:launcher` |

### 🗄️ 1. Core Systems & Workstations
| # | Application Guide | Focus Area | GUI Launch | CLI Launch |
| :-: | :--- | :--- | :--- | :--- |
| **01** | [SQLite Studio Pro](01_sqlite_studio.md) | Full GUI CRUD (no SQL needed): table designer, row forms, inline edit, CSV/JSON/SQL/clipboard import, export & backup, query plans. | `bun run app:database` | `bun run cli:database` |
| **02** | [System & Package Workstation](02_system_package_studio.md) | 60-API hardware & OS telemetry, live KPI sparklines, snapshot compare, JSON/CSV/Markdown/HTML export. | `bun run app:system` | `bun run cli:system` |
| **03** | [Task Watcher Studio](03_task_watcher_studio.md) | Native `fs.watch` event pipeline, extension filters, ignore rules, build console. | `bun run app:watcher` | `bun run cli:watcher` |
| **04** | [JSON Query Studio Pro](04_json_query_studio.md) | High-throughput JSON query engine, nested selectors, key projection, formatting. | `bun run app:json` | `bun run cli:json` |
| **05** | [DevTools Studio Pro](05_devtools_studio.md) | 6-in-1 suite: Ripgrep search, Fd finder, Sd replace (dry run, backups), Trash with undo, JQ. | `bun run app:devtools` | `bun run cli:devtools` |
| **06** | [Process Monitor Studio](06_process_monitor_studio.md) | Process table with group-by-app, tree kill, safe signals with confirmations, listener-only port kill, export. | `bun run app:process` | `bun run cli:process` |
| **40** | [Redis Studio Pro](40_redis_studio.md) | Key browser with sort/filter, typed editors, export/import backup, bulk delete, duplicate, CLI history with safety prompts, telemetry, Pub/Sub. | `bun run applications/redis_studio.ts` | — |

### 🛠️ 2. Developer Utilities & Data Engineering
| # | Application Guide | Focus Area | GUI Launch | CLI Launch |
| :-: | :--- | :--- | :--- | :--- |
| **07** | [API Studio Pro](07_api_studio.md) | HTTP/REST client with variables, auth, cURL import/export, request files, history, JSON filter and load benchmark. | `bun run app:api` | `bun run cli:api` |
| **08** | [Data Converter Studio](08_data_converter_studio.md) | Bidirectional transformer across CSV, TSV, JSON, YAML, Base64, and Markdown. | `bun run app:convert` | `bun run cli:convert` |
| **09** | [Crypto Studio Pro](09_crypto_studio.md) | SHA-256/512, MD5, HMAC, AES-256-GCM encryption/decryption, JWT decoder, UUID. | `bun run app:crypto` | `bun run cli:crypto` |
| **10** | [Regex Studio Pro](10_regex_studio.md) | Live pattern tester, match + capture-group table, substitution preview, pattern explainer, presets, code gen for 6 languages. | `bun run app:regex` | `bun run cli:regex` |

### 📦 3. Advanced Engineering Systems & Tooling
| # | Application Guide | Focus Area | GUI Launch | CLI Launch |
| :-: | :--- | :--- | :--- | :--- |
| **11** | [App Bundler Studio](11_app_bundler_studio.md) | `bun build --compile` single-file compilation, cross-compilation, macOS `.app`. | `bun run app:bundler` | `bun run cli:bundler` |
| **12** | [Network Forensics Studio](12_network_forensics_studio.md) | Multi-port TCP socket scanner (`node:net`), DNS records (`A/MX/TXT/NS`), TTFB. | `bun run app:network` | `bun run cli:network` |
| **13** | [Git Workbench Pro](13_git_workbench_studio.md) | Working tree status, visual diff viewer, commit log history, stage, commit. | `bun run app:git` | `bun run cli:git` |
| **14** | [Markdown Studio Pro](14_markdown_studio.md) | Split-pane Markdown editor, reading stats, standalone styled HTML document export. | `bun run app:markdown` | `bun run cli:markdown` |
| **15** | [Color & Design Token Studio](15_color_token_studio.md) | HEX/RGB/HSL converter, WCAG 2.1 contrast auditor, 50–950 tonal scale, token export. | `bun run app:color` | `bun run cli:color` |
| **16** | [Environment Vault Studio](16_environment_vault_studio.md) | `.env` parser & validator, secret key masking, diff against `.env.example`. | `bun run app:env` | `bun run cli:env` |

### ⚡ 4. Modern CLI Tool Alternatives
| # | Application Guide | Replaces Tool | Primary Advantage | GUI Launch | CLI Launch |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **17** | [Fd Studio Pro](17_fd_studio.md) | `find` / `fd` | Ultra-fast filesystem search, glob/regex, file operations (rename/batch rename/undo), content search, duplicate finder, Rip safe burial quarantine. | `bun run app:fd` | `bun run cli:fd` |
| **18** | [Rip Studio Pro](18_rip_studio.md) | `rm` (rm-improved) | Safe & ergonomic rm replacement, graveyard quarantine, instant unbury. | `bun run app:rip` | `bun run cli:rip` |
| **19** | [Sd Studio Pro](19_sd_studio.md) | `sed` / `sd` | Visual find & replace, unified live diffs, regex capture groups, backups. | `bun run app:sd` | `bun run cli:sd` |
| **20** | [Procs Studio Pro](20_procs_studio.md) | `ps` / `procs` | Modern ps replacement, process table, CPU/Memory telemetry, listening ports. | `bun run app:procs` | `bun run cli:procs` |
| **21** | [Watchexec Studio Pro](21_watchexec_studio.md) | `watchexec` | Continuous file watcher, task runner, extension filters, debounce console. | `bun run app:watchexec` | `bun run cli:watchexec` |
| **22** | [Tokei Studio Pro](22_tokei_studio.md) | `tokei` / `cloc` | Code & LOC counter across 50+ languages, comment ratios, Markdown/JSON. | `bun run app:tokei` | `bun run cli:tokei` |
| **23** | [Gdu Studio Pro](23_gdu_studio.md) | `gdu` / `ncdu` | Disk usage analyzer, storage explorer, visual proportion bars, cleanup. | `bun run app:gdu` | `bun run cli:gdu` |
| **24** | [IpInfo Studio Pro](24_ipinfo_studio.md) | `ipinfo` / `curl ifconfig.me` | IP address geolocation, ASN details, CIDR subnet calculator, interfaces. | `bun run app:ipinfo` | `bun run cli:ipinfo` |
| **25** | [Subfinder Studio Pro](25_subfinder_studio.md) | `subfinder` | Passive multi-source subdomain discovery, active DNS checks, HTTP probes. | `bun run app:subfinder` | `bun run cli:subfinder` |
| **26** | [Doggo Studio Pro](26_doggo_studio.md) | `dig` / `doggo` | Modern DNS client for humans, standard records, custom resolvers, DoH. | `bun run app:doggo` | `bun run cli:doggo` |

### 🧮 5. Scientific Computing, Fitness & Codecaine Arcade Classics (42 Games)

> **🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip:** On slower Linux machines, integrated GPUs, or virtual machines where Linux's native `libwebkitgtk-6.0-4` webview falls back to software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run the 46 Codecaine Arcade games dramatically faster. Start Codecaine File Manager (`./codecaine-file-manager --server` or `bun run app:files --server`) or any individual game (`bun run applications/<game>_studio.ts --server`) with `--server` and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome**. You can also press **`Alt+G`** in any game to open the **Game Master FX HUD** and disable CRT Scanlines or Cabinet Glow on older hardware.

| # | Application Guide | Focus Area | GUI Launch | Engine Highlights |
| :-: | :--- | :--- | :--- | :--- |
| **27** | [Universal Calculator & STEM IntuitionLab](27_calculator_studio.md) | Scientific calculation, 17-unit converter, time-series charts, 64-bit programmer lab & **6-engine STEM IntuitionLab**. | `bun run app:calculator` | Simpson's 1/3 Rule, Projectile, Gravity, Waves, Gas, Circuit, Optics |
| **28** | [Codecaine Dr. Codecaine Arcade](28_codecaine_dr_codecaine_arcade.md) | Capsule puzzle arcade game with polyphonic synthesizers, pathogen AI & tactile 60fps controls. | `bun run app:dr_codecaine` | Tricolor viral eradication, cascade combos, Web Audio chiptune |
| **29** | [Interval Timer & Calisthenics Suite](29_interval_timer_suite.md) | High-performance interval timer with Keith Baar isometric tendon training protocols & **24-album Codecaine Music Deck**. | `bun run app:interval_timer` | Overcoming isometrics, base64 GIF loops, YouTube music drawer |
| **30** | [Codecaine Adventures of Caine Remaster](30_codecaine_adventures_of_caine_remaster.md) | Cyberpunk logic puzzle game with 100 procedural chambers, sound engine & tactical field manual. | `bun run app:lolo` | 9 hostile drone AI classes, temporal rewind, AI ghost guide |
| **31** | [Codecaine CyberMouse Trap Deluxe](31_codecaine_cybermouse_trap_deluxe.md) | Deluxe block-pushing arcade game with neon retro maze, cat trapping & high-DPI canvas. | `bun run app:rodents_revenge` | Block pushing, cat traps into cheese, obstacle evasion |
| **32** | [Codecaine Neon Word Search Labyrinth](32_codecaine_neon_word_search_labyrinth.md) | Cyber word search with Web Audio synthesizer, neon particle visual effects & procedural dictionaries. | `bun run app:word_search` | 10 word categories, 3 difficulties, daily puzzle, stats & saved records |
| **33** | [World Time Zones Studio Pro](33_world_time_zones_studio.md) | Real-time global time zones workstation with interactive search, UTC offsets & local clock synchronization. | `bun run app:world_time_zones` | 400+ IANA zones, solar day/night tracking, meeting scrubber |
| **34** | [Codecaine CyberChomp Arcade](34_codecaine_cyberchomp_arcade.md) | Cyber maze-chomping arcade game with 4-ghost AI personalities, sound synthesis & particle effects. | `bun run app:pacman` | Blinky, Pinky, Inky & Clyde AI targeting algorithms |
| **35** | [Codecaine Bros. Arcade](35_codecaine_bros_arcade.md) | Sewer platformer arcade game with high-speed bumping physics, interactive POW block & 2-player mode. | `bun run app:codecaine_bros` | Ceiling bump flips, sewer kicks, 4-channel sound tracker |
| **36** | [Codecaine Cyberpunk QuadLink 4](36_codecaine_cyberpunk_quadlink_4.md) | Tactical 2-player & Minimax AI board game with column hover preview, falling disc physics & particle celebrations. | `bun run app:connect4` | 3-tier Minimax heuristics, turn timer, win streak tracker |
| **37** | [Codecaine Cyberpunk Maze Runner](37_codecaine_cyberpunk_maze_runner.md) | Procedural maze generation (5 algorithms) & real-time A*/Dijkstra/BFS visual solvers. | `bun run app:maze` | 5 graph generators, 3 solvers, daily puzzle, stats telemetry |
| **38** | [Codecaine Neon Cyber Paddle](38_codecaine_neon_cyber_paddle.md) | High-speed kinetic arcade paddle-tennis with responsive paddle spin deflection physics & 3-tier AI opponents. | `bun run app:pong` | Edge spin deflection, acceleration smashes, 2-player versus |
| **39** | [Codecaine Neon Tic-Tac-Toe Arcade](39_codecaine_neon_tic_tac_toe_arcade.md) | Unbeatable Minimax AI mode, casual mode & local 2-player battle with scoreboard and glowing neon visuals. | `bun run app:tictactoe` | Mathematical Minimax tree search, numpad 1-9 grid controls |
| **44** | [Codecaine TetroGrid Ultra Deluxe](44_codecaine_tetrogrid_ultra_deluxe.md) | Falling-block puzzle arcade with SRS wall kicks, hold queue, ghost piece & T-Spin scoring. | `bun run app:tetris` | Super Rotation System, 7-bag randomizer, Game Master FX HUD |
| **45** | [Codecaine Neon Snake Deluxe](45_codecaine_neon_snake_deluxe.md) | Cyber-grid serpent arcade with warp portals, speed boosters & combo multipliers. | `bun run app:snake` | Portal wrap/walled modes, particle trails, Game Master FX HUD |
| **46** | [Codecaine CyberBrick Breaker Deluxe](46_codecaine_cyberbrick_breaker_deluxe.md) | Kinetic paddle-and-ball brick-breaking arcade with multi-ball, laser cannons & boss barriers. | `bun run app:breakout` | Multi-ball mayhem, 6 capsule power-ups, Game Master FX HUD |
| **47** | [Codecaine CyberFrog Deluxe](47_codecaine_cyberfrog_deluxe.md) | Highway and cyber-river crossing arcade with turbo vehicles, plasma logs & docking bays. | `bun run app:frogger` | Multi-lane velocity hazards, river currents, Game Master FX HUD |
| **48** | [Codecaine CyberWing Deluxe](48_codecaine_cyberwing_deluxe.md) | Precision neon thruster flight arcade with moving laser gates & gravity wells. | `bun run app:flappy` | 60fps thruster physics, moving gates, Game Master FX HUD |
| **49** | [Codecaine CyberSki Deluxe](49_codecaine_cyberski_deluxe.md) | High-speed downhill cyber-alpine slalom with trick jumps & Apex Cyber-Yeti pursuit. | `bun run app:skifree` | Carving physics, stunt ramps, nitro boost, Game Master FX HUD |
| **50** | [Codecaine CyberMunch Math Deluxe](50_codecaine_cybermunch_math_deluxe.md) | Educational math-grid arcade with multiples, factors, primes, equations & Troggle AI. | `bun run app:math_munchers` | 5 mathematical modes, 4 Troggle classes, Game Master FX HUD |
| **51** | [Codecaine Minesweeper Pro Championship](51_codecaine_minesweeper_pro_championship.md) | Championship logic-grid puzzle with guaranteed safe first click & chord-clearing. | `bun run app:minesweeper` | Safe first-click generator, chording, 3BV efficiency telemetry |
| **52** | [Codecaine CyberType Deluxe](52_codecaine_cybertype_deluxe.md) | Cyberpunk speed-typing defense & WPM trainer with syntax waves and boss fights. | `bun run app:typing` | Live WPM/accuracy telemetry, code syntax mode, Game Master FX HUD |
| **53** | [Codecaine Joker Royale Deluxe](53_codecaine_joker_royale_deluxe.md) | High-stakes roguelike deckbuilder poker with 30+ Cyber Jokers, Tarot cards & Boss Blinds. | `bun run app:balatro` |Additive/multiplicative Joker chain scoring, Game Master FX HUD |
| **54** | [Codecaine Texas Hold'em & 5-Card Draw Poker Royale](54_codecaine_poker_royale.md) | Dual-mode championship poker suite with 5 AI personalities, pot odds & showdown telemetry. | `bun run app:poker` | No-Limit Hold'em & 5-Card Draw, 7-card evaluator, Game Master FX HUD |
| **55** | [Codecaine Blackjack Royale VIP](55_codecaine_blackjack_royale_vip.md) | 6-deck Vegas shoe Blackjack with Split, Double Down, Insurance & Hi-Lo card counting trainer. | `bun run app:blackjack` | Basic strategy coach, Hi-Lo running/true count, Game Master FX HUD |
| **56** | [Codecaine Egyptian Rat Screw Royale](56_codecaine_egyptian_rat_screw_royale.md) | Reflex card-slapping party game with Doubles, Sandwiches, Marriages & millisecond slap timers. | `bun run app:ers` | 7 slap rules, penalty burn protection, 4 AI reflex tiers |
| **57** | [Codecaine Yacht Dice Royale Deluxe](57_codecaine_yacht_dice_royale_deluxe.md) | 5-dice tactical probability & scorecard game with 13 categories, EV hints & AI challengers. | `bun run app:yahtzee` | 35-pt upper bonus, 100-pt Multi-Yacht bonus, EV probability engine |
| **58** | [Codecaine CyberJezz Containment Deluxe](58_codecaine_cyberjezz_containment_deluxe.md) | 1992 JezzBall remaster: capture 75%+ of the cyber-grid with laser containment walls, cryo slow-mo & shielded beams. | `bun run app:jezzball` | Flood-fill capture, cryo slow-mo, shielded laser walls |
| **59** | [Codecaine CyberChip's Labyrinth](59_codecaine_cyberchips_labyrinth.md) | Tile-based puzzle gauntlet with microchips, elemental boots (fire, flippers, cleats, suction), keys, blocks & undo. | `bun run app:chips_challenge` | 4 elemental boots, color keys, ice/conveyor physics, undo |
| **60** | [Codecaine CyberPipe Flow Deluxe](60_codecaine_cyberpipe_flow_deluxe.md) | High-pressure pipe-routing puzzle with cross-junction loop bonuses, reservoir tanks, 5-piece queue & neon coolant flow. | `bun run app:pipe_dream` | Cross-pipe loop bonuses, reservoir tanks, 5-piece preview |
| **61** | [Codecaine Solitaire Royale: Klondike, Spider & FreeCell](61_codecaine_solitaire_royale.md) | 3-in-1 Championship Solitaire (Klondike, Spider, FreeCell) with auto-foundation, hints, undo & bouncing cards waterfall. | `bun run app:solitaire` | Klondike, FreeCell & Spider, Win95 waterfall animation |
| **62** | [Codecaine CyberCadet Pinball 2099](62_codecaine_cybercadet_pinball_2099.md) | Space Cadet pinball table with 60fps flipper physics, pop bumpers, hyperspace ramp, wormhole multiball & fleet ranks. | `bun run app:pinball` | Sub-stepped rigid-body physics, multiball, 9 fleet ranks |
| **63** | [Codecaine VoidVector Asteroids Deluxe](63_codecaine_voidvector_asteroids_deluxe.md) | 360° Newtonian vector shooter with splitting asteroids, hunter-seeker UFOs, shields, hyperspace warp & weapon power-ups. | `bun run app:asteroids` | Inertial thrust, wireframe shatters, UFOs, spread/tailgun |
| **64** | [Codecaine CyberInvaders: StarSwarm](64_codecaine_cyberinvaders_starswarm.md) | Galactic alien formation & dive-bomber shooter with destructible plasma bunkers, mystery UFOs & overcharge wave beam. | `bun run app:space_invaders` | Dive-bomber AI, eroding bunkers, twin-blaster & wave cannon |
| **65** | [Codecaine CyberBomber Grid Arena](65_codecaine_cyberbomber_grid_arena.md) | Destructible grid arena with chain-reaction plasma bombs, kick boots, Campaign, AI Battle Royale & 2-Player Versus. | `bun run app:bomberman` | Cruciform chain blasts, kick boots, 3 AI bots & 2P local |
| **66** | [Codecaine CyberDefense: ICBM Interceptor](66_codecaine_cyberdefense_icbm_interceptor.md) | Defend 6 neon megacities with 3 counter-missile batteries and chain-reaction shockwaves against MIRV warheads. | `bun run app:missile_command` | 3 interceptor silos, MIRV splitters, shockwave cascades |
| **67** | [Codecaine CyberCube Hopper](67_codecaine_cybercube_hopper.md) | Isometric 28-cube 3D pyramid color-flipper with Coily the cyber-snake, spinning escape discs & chrono-freeze orbs. | `bun run app:qbert` | Isometric 3D pyramid, Coily AI, flying escape discs |
| **68** | [Codecaine CyberCentipede Blaster](68_codecaine_cybercentipede_blaster.md) | High-speed spore-field shooter with splitting centipede chains, bouncing spiders, fleas & poison scorpions. | `bun run app:centipede` | Dynamic chain-splitting, poisoned spore dives, 8 palettes |
| **69** | [Codecaine CyberArtillery: Scorched Skyline](69_codecaine_cyberartillery_scorched_skyline.md) | Turn-based wind & gravity trajectory artillery across destructible city skylines with MIRVs, Funky Bombs & AI/2P modes. | `bun run app:artillery` | Crater-carving terrain, wind physics, 5 weapons, AI & 2P |
| **70** | [Codecaine 8-Ball Pool Royale: Cyber Billiards Suite](70_codecaine_8ball_pool_royale.md) | AAA 8-Ball, 9-Ball & Speed Pool with sub-stepped rigid-body physics, English spin control, ghost-ball laser sight & 1P/2P. | `bun run app:pool` | 8-Ball, 9-Ball, English spin pad, ghost-ball ray, AI Shark |
| **71** | [Codecaine CyberLander: Vector Descent](71_codecaine_cyberlander_vector_descent.md) | Precision vector thruster & fuel simulator across Moon, Mars & Titan craters with multiplier landing pads. | `bun run app:lunar_lander` | Moon/Mars/Titan gravity, VX/VY telemetry, retro-stabilizer |
| **72** | [Codecaine Cyber2048 Quantum Merge](72_codecaine_cyber2048_quantum_merge.md) | Power-of-2 sliding neon tile synthesizer with 3x3/4x4/5x5 grids, temporal undo, tile zap & AI expectimax hints. | `bun run app:2048` | 3x3/4x4/5x5 grids, 5-step undo, tile zap, AI hint |
| **73** | [Codecaine CyberCrate Sokoban](73_codecaine_cybercrate_sokoban.md) | 100 verified solvable warehouse puzzle chambers + multi-difficulty winnable random generator, AI Hint/Auto-Solve & deadlock warnings. | `bun run app:sokoban` | 100 solvable chambers, winnable random generator, AI BFS solver |
| **74** | [Codecaine CyberReversi & Checkers AI](74_codecaine_cyberreversi_checkers_ai.md) | Dual 8x8 strategy suite: Reversi (Othello) & Championship Checkers with 3-tier Minimax AI, flip previews & 2P local. | `bun run app:reversi_checkers` | Othello + Checkers, alpha-beta Minimax AI, multi-jump chains |
| **75** | [Codecaine UNO Royale: Wild Cascade Edition](75_codecaine_uno_royale.md) | Realistic 4-player tabletop UNO with authentic vector cards, +2/+4 Stacking, 7-0 Hand Swap, UNO Catch & 500-Pt Cup. | `bun run app:uno` | Physical UNO vector cards, +2/+4 cascades, 7-0 switch, Career XP |
| **76** | [Codecaine CyberStrike Bowling: 300 Perfect Club](76_codecaine_cyberstrike_bowling.md) | AAA 3D-perspective 10-frame PBA bowling with lane oil hook physics, 10-pin domino scatter, split spare clinic & 1P/2P. | `bun run app:bowling` | 10-frame PBA scoring, lane oil hook, 10-pin physics, split clinic |
| **77** | [Codecaine Pro Darts Royale: 501 & Cricket Arena](77_codecaine_pro_darts_royale.md) | Championship 501 Double-Out, 301 & Tactics Cricket with 4-tier Ballistic Physics, 3D dart flight & live AI checkout routes. | `bun run app:darts` | 4-tier Ballistic Physics, 18g/22g/26g barrels, live AI checkout |
| **78** | [Codecaine CyberJewel 12-Mode Blitz: Diamond Mine & Prism Royale](78_codecaine_cyberjewel_blitz.md) | 12-mode Match-3 gem symphony: Classic, Diamond Mine, Lightning, Ice Storm, Butterflies, Poker, Zen, Alchemy, Bombs, Lava, Boss Raid & Stratamax. | `bun run app:bejeweled` | 12 modes, Flame/Star/Hypercube/Supernova gems, harmonic Web Audio |
| **79** | [Codecaine CyberBalloon Fight: Sky Joust & Storm Trip](79_codecaine_cyberballoon_fight.md) | 6-mode NES Balloon Fight & Balloon Trip remaster: Sky Arena, Endless Lightning Trip, Roguelike Perks, Boss Storm, 2P Co-Op & 2P Dogfight. | `bun run app:balloon_fight` | Inertial flap physics, Parachute/Pump AI, Piranha waves, Balloon Trip |
| **80** | [Codecaine CyberMarble Madness: Isometric Gravity Odyssey](80_codecaine_cybermarble_madness.md) | 8-mode 3D isometric Marble Madness & Marble Blast suite with slope gravity, Black Steel Knockers, Gem Hunt, Tilt Labyrinth & 2P Race. | `bun run app:marble_madness` | 3D isometric heightmap, slope gravity, 4 marble chassis, 8 modes |
| **81** | [Codecaine CyberMappy: Mansion Heist & Trampoline Police](81_codecaine_cybermappy_mansion.md) | 8-mode Namco Mappy mansion remaster with color-changing trampolines, Microwave Shockwave Doors, Goro loot multipliers & Roof Balloon Bonus. | `bun run app:mappy` | 4-color trampolines, Microwave Sonic Doors, Goro x2-x6 pair multipliers |
| **82** | [Codecaine CyberMaker Studio: OS Kernel World Architect](82_codecaine_cybermaker_studio.md) | Super Mario Maker-style level architect & platformer with Linux Tux, macOS Dock/Beachball, FreeBSD Beastie & Windows BSOD/Clippy objects. | `bun run app:cyber_maker` | Live Edit/Play toggle, 5 OS Kernel themes, 36+ OS objects, Rail Tracks |

---

## 🚀 Quick Launch Cheat Sheet

### 🖼️ Desktop GUI Applications
```bash
# Core Workstations
bun run app:database       # Database Studio Pro (SQLite)
bun run app:system         # System & Package Workstation
bun run app:watcher        # Task Watcher Studio
bun run app:json           # JSON Query Studio Pro
bun run app:devtools       # DevTools Studio Pro (6-in-1)
bun run app:process        # Process Monitor Studio

# Developer Utilities
bun run app:api            # API Studio Pro
bun run app:convert        # Data Converter Studio
bun run app:crypto         # Crypto Studio Pro
bun run app:regex          # Regex Studio Pro

# Engineering & Systems
bun run app:bundler        # App Bundler Studio
bun run app:network        # Network Forensics Studio
bun run app:git            # Git Workbench Pro
bun run app:markdown       # Markdown Studio Pro
bun run app:color          # Color & Design Token Studio
bun run app:env            # Environment Vault Studio

# Modern CLI Tool Replacements
bun run app:fd             # Fd Studio Pro (find replacement)
bun run app:rip            # Rip Studio Pro (rm replacement)
bun run app:sd             # Sd Studio Pro (sed replacement)
bun run app:procs          # Procs Studio Pro (ps replacement)
bun run app:watchexec      # Watchexec Studio Pro (watcher runner)
bun run app:tokei          # Tokei Studio Pro (code counter)
bun run app:gdu            # Gdu Studio Pro (disk analyzer)
bun run app:ipinfo         # IpInfo Studio Pro (geolocation & CIDR)
bun run app:subfinder      # Subfinder Studio Pro (subdomain recon)
bun run app:doggo          # Doggo Studio Pro (modern DNS client)

# Computing, Fitness & Games
bun run app:calculator     # Universal Calculator & STEM IntuitionLab
bun run app:dr_codecaine   # Dr. Codecaine Arcade
bun run app:interval_timer # Interval Timer & Workout Suite
bun run app:lolo           # Adventures of Lolo Cyberpunk Remaster
bun run app:rodents_revenge# Rodent's Revenge Deluxe
bun run app:word_search    # Neon Word Search Labyrinth
bun run app:world_time_zones # World Time Zones Studio Pro
bun run app:pacman         # Cyberpunk Pac-Man Arcade
bun run app:codecaine_bros # Codecaine Bros. Arcade
bun run app:connect4       # Connect 4 Champion
bun run app:maze           # Cyberpunk Maze Runner
bun run app:pong           # Neon Cyber Pong
bun run app:tictactoe      # Neon Tic-Tac-Toe AI Studio
```
