# 💎 Codecaine CyberJewel 12-Mode Blitz: Diamond Mine & Prism Royale -- Complete Production User Guide

```
Version: 2.5.0  •  Engine: 12-Mode Match-3 Gem Symphony, 3D Ray-Traced Jewelry Shaders, Live Mini-Game Stage Canvas & Lydian Web Audio Synth + Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:bejeweled]  •  [Headless Server: bun run applications/bejeweled_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine CyberJewel 12-Mode Blitz: Diamond Mine & Prism Royale** is a 60fps Match-3 gem symphony and arcade suite inspired by PopCap's iPad *Bejeweled 3 / Bejeweled HD* and expanded to **12 full playable game modes** with a dedicated **Live Mini-Game Stage Canvas (`544×92`)** and **12 Active Mode Tactical Gadgets (`[SPACE]`)**.

Every gem is rendered with **multi-layered 3D crystalline refraction** (contact drop shadow inside recessed beveled crystal sockets, subsurface pavilion caustic glow, individual directional crown trapezoid facets, internal pavilion star lines, diagonal glass reflection bands, and 4-point starburst specular glints).

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:bejeweled

# Launch headless server
bun run applications/bejeweled_studio.ts --server
```

---

## 🎮 Complete Guide to All 12 Game Modes & Active Gadgets (`[SPACE]`)

Each mode features its own animated **Mini-Game Stage Canvas** above the board and a rechargeable **Mode Tactical Gadget (`[SPACE]`)** that starts at `100% READY`:

### 1. 💎 Classic Mode (`[1]`)
- **Mini-Game Stage**: 3D Ringed Crystal Planet & Swirling Liquid Plasma Warp Conduit.
- **Rules**: Match 3+ gems to fill the Warp Conduit and advance through planetary crystal stages. Ends only when no valid moves remain.
- **Active Gadget (`[SPACE]`)**: **🌌 Warp Starburst** — Instantly promotes 2 random board gems into a **Flame Gem** and a **Star Gem**!

### 2. ⛏️ Diamond Mine (`[2]`)
- **Mini-Game Stage**: Subterranean Hydraulic Laser Drill & Rolling Mine Cart on rails.
- **3D Geological Strata & Vector Treasures**: Excavate multi-layer **Topsoil**, **Dense Clay**, and **Obsidian Bedrock** to unearth custom 3D **24K Gold Bullion (`+$2,500`)**, **Sparkling Cut Diamonds (`+$5,000`)**, and **Ancient Cyber-Idol Relics (`+$15,000`)**!
- **Depth Scroll & Time Bonus**: Clearing all dirt above the golden **Excavation Depth Line** scrolls the mine **`+20m deeper`**, awards **`+30s Bonus Time`**, and boosts your Depth Multiplier!
- **Active Gadget (`[SPACE]`)**: **🧨 Detonate Dynamite** — Blasts an entire horizontal row of dirt and stone across all 8 columns!

### 3. ⚡ Lightning Blitz (`[3]`)
- **Mini-Game Stage**: Dual Arcing Tesla Coils & Cryo-Plasma Time Extension Tank.
- **Time Extension Tank**: Match **`+5s`** and **`+10s`** Cryo-Cell Time Gems to fill the Tank. When the clock reaches `0:00`, the Tank drains into the clock and increments your **Speed Multiplier (`x2, x3, x4...`)**!
- **Active Gadget (`[SPACE]`)**: **⚡ Tesla Overload** — Adds `+5s` to the clock and zaps 2 board gems into `+10s` Time Gems!

### 4. ❄️ Ice Storm (`[4]`)
- **Mini-Game Stage**: Cyber-Steam Boiler Furnace with live Analog Pressure Gauge Needle & 8 column cryo-monitors.
- **3D Glacier Columns & Vertical Shatter**: Translucent 3D frost-fractured ice columns creep upward in real time. Vertical matches **shatter** the column completely!
- **Active Gadget (`[SPACE]`)**: **🔥 Steam Vent Blast** — Vents superheated steam across all 8 columns, pushing every glacier column down by 2 rows!

### 5. 🦋 Butterflies (`[5]`)
- **Mini-Game Stage**: Bioluminescent Laser Web where an **Articulated 8-Legged Mechanical Cyber-Spider** stalks the column of the highest butterfly!
- **Iridescent 4-Wing Monarchs**: Monarch Butterfly Gems spawn on the bottom row and flutter **up 1 row after every swap**. Match or blast butterflies before any reaches the spider at Row 1!
- **Active Gadget (`[SPACE]`)**: **🕸️ Web Shock** — Stuns the spider, rescues the highest Monarch Butterfly on the board, and promotes that cell into a Star Gem!

### 6. 🃏 Jewel Poker (`[6]`)
- **Mini-Game Stage**: Monte Carlo Cyber-Velvet Casino Table with 5 3D Foil Cards and live hand rank evaluator.
- **Hand Payouts**: **Royal Gem Flush (`50,000`)**, **Four of a Kind (`30,000`)**, **Full House (`15,000`)**, **Prism Spectrum (`12,000`)**, **Three of a Kind (`7,500`)**, **Two Pair (`5,000`)**, **One Pair (`2,500`)**.
- **Active Gadget (`[SPACE]`)**: **🃏 Deal Royal Wild** — Deals a Wild Hypercube Joker Card directly onto your 5-Card Poker Hand!

### 7. 🧘 Zen Breath (`[7]`)
- **Mini-Game Stage**: Sacred Geometry Lotus & Binaural Sine Wave Visualizer synced to the `Inhale 4s • Hold 4s • Exhale 4s` cycle.
- **Active Gadget (`[SPACE]`)**: **🪷 Harmonic Ripple** — Manifests a Rainbow Hypercube at the center of the crystal matrix!

### 8. 🧪 Alchemy Gold (`[8]`)
- **Mini-Game Stage**: Hermetic Philosopher's Crucible & 64-Tile Bullion Ingot Progress Bar.
- **3D Bullion Floor Plates**: Every match upgrades cells from **Dark Lead → Brushed Silver Filigree → 24K Embossed Solid Gold with Corner Rivets**.
- **Active Gadget (`[SPACE]`)**: **⚗️ Philosopher's Elixir** — Transmutes 4 non-gold cells directly into 24K Solid Gold!

### 9. 💣 Time Bombs (`[9]`)
- **Mini-Game Stage**: EOD Bomb Squad `360°` Phosphor Radar Sweep.
- **3D Cyber-Detonators**: Ticking Chrono-Bomb Gems feature circular LED countdown rings (`12` moves down to `0`).
- **Active Gadget (`[SPACE]`)**: **🛠️ Defuse Drone** — Defuses the most urgent bomb on the board (converting it into a Flame Gem) and adds `+4 moves` to all other bombs!

### 10. 🌋 Lava Escape (`[0]`)
- **Mini-Game Stage**: Volcanic Seismograph Waveform & Cryo-Coolant Manifold.
- **Molten Magma Fissures**: Magma surges upward after every swap; match on or adjacent to magma to solidify it.
- **Active Gadget (`[SPACE]`)**: **❄️ Cryo-Wave** — Cools and solidifies up to 6 molten magma cells on the highest lava rows!

### 11. 👾 Boss Raid (`[-]`)
- **Mini-Game Stage**: **3D Articulated Prism Leviathan Dreadnought** with flapping crystalline wings, glowing eye, and live Hull Integrity Bar that flashes when struck by your homing plasma bolts!
- **Active Gadget (`[SPACE]`)**: **☄️ Orbital Railgun** — Fires a mega-strike for `-3,500 Boss HP` and shatters all Crystal Chains on the board!

### 12. 🧩 Stratamax 20 (`[=]`)
- **Mini-Game Stage**: Live **Score-Per-Move (SPM) Telemetry Sparkline Chart**.
- **Active Gadget (`[SPACE]`)**: **⏪ Tactical Undo** — Restores the previous board state and move counter (up to 3 Tactical Undos per session)!

---

## ⚡ Special Power Gems & Cross-Combinations

| Power Gem | How to Forge | Detonation Effect |
| :--- | :--- | :--- |
| **🔥 Flame Gem** | Match **4** in a line | Swirling solar corona + orbiting embers; explodes a **`3×3` area** |
| **⚡ Star Gem** | Match **L, T, or +** shape | 8-point rotating pulsar; fires lightning across its **entire Row and Column** |
| **🌈 Hypercube** | Match **5** in a line | 4D rotating tesseract; swapping with any gem zaps **ALL gems of that color** |
| **🌟 Supernova Gem** | Match **6+** gems | Fires a massive **`3-Row × 3-Column` mega-cross** plasma beam |
| **🌈 + 🌈 Dual Hypercube** | Swap two Hypercubes | **Total Board Annihilation** (`+50,000 pts`, vaporizes all 64 tiles!) |
| **🌈 + 🔥 / ⚡** | Swap Hypercube with Flame/Star | Converts every gem of that color into Flame or Star Gems! |
| **🔥 + ⚡ Flame-Star** | Swap Flame Gem with Star Gem | Fires a fiery **`3-Row × 3-Column` electro-cross**! |

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Click / Drag Adjacent Gem` | Swap two orthogonally adjacent gems |
| `SPACE` | **Activate Current Mode's Tactical Gadget** (`#btnModeGadget`) |
| `H` | **AI Best Move Hint** (Highlights highest-value swap or urgent hazard) |
| `R` | **Shuffle / Re-Harmonize Matrix** |
| `N` | Start Fresh Session in Current Mode |
| `1` – `9`, `0`, `-`, `=` | Instant-switch between Modes `1` through `12` |
| `B` | Toggle Ambient Lydian Synth Music Pad |
| `M` | Mute / Unmute Web Audio SFX |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
