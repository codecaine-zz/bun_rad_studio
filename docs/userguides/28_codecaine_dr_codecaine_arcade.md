# 💊 Codecaine Dr. Codecaine Arcade — 10-Mode Mega Edition User Guide

```
Version: 3.0.0  •  Engine: Native HTML5 Canvas, Web Audio Chiptune Synthesizer (FEVER / CHILL / CYBER) & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:dr_codecaine]  •  [Headless Server: bun run applications/dr_codecaine_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine Dr. Codecaine Arcade (10-Mode Mega Edition)** is a fast-paced, tactile capsule-matching puzzle arcade experience built natively for Bun RAD Studio. Combining nostalgic color-matching puzzle mechanics with **10 distinct arcade modes**, **4 Miracle Cure Power Capsules**, **Armored & Cryo-Stasis Mutant Pathogens**, procedural chiptune audio synthesis (`FEVER`, `CHILL`, and `CYBER` soundtracks), high-DPI scaling, the universal **Codecaine Game Master FX & Post-Processing Engine (`Alt+G`)**, and responsive desktop windowing, Dr. Codecaine Arcade brings pure medical-grade arcade energy directly to your desktop workstation.

Featuring an authentic dual-tone capsule falling engine, 60fps physics, gravity cascade chaining, L/Cross/+ Super Surgery bonuses, a persistent **Medical Career Vault**, and an intelligent rival AI opponent (**Dr. Helix**), it offers endless hours of mental sharpness and dopamine-fueled puzzle action.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:dr_codecaine

# Launch headless web server
bun run applications/dr_codecaine_studio.ts --server
```

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Dr. Codecaine Desktop](../../screenshots/apps/dr_codecaine_desktop.png) | ![Dr. Codecaine Responsive](../../screenshots/apps/dr_codecaine_responsive.png) |

---

## 🎮 The 10 Arcade Game Modes

Switch instantly between all 10 game modes using the **Mode Selector Dropdown** in the top bar, the **10-Button Interactive Mode Dock** below the header, or keyboard hotkeys **`1` through `0`**:

| Key | Mode ID | Mode Name | Objective & Special Mechanics |
| :---: | :--- | :--- | :--- |
| **`1`** | `classic` | **💊 Classic Clinic (Levels 0–20)** | Standard stage progression from Level 0 to 20. Eradicate every virus in the bottle to advance; includes Armored 2-Hit viruses on higher stages. |
| **`2`** | `miracle_cure` | **⚡ Miracle Cure Deluxe** | Charge the **Miracle Syringe Gauge** (`0–100%`) by clearing matches and cascades. Spawns **Power Capsules** (`💣`, `⚡`, `🌈`, `🧪`) and press **`E`** at 100% to trigger an instant Surgical Strike! |
| **`3`** | `vs_cpu` | **🤖 Vs. Cyber-Pathogen AI** | Competitive head-to-head duel against **Dr. Helix AI**. Triggering 2+ chain cascades launches garbage capsule halves into the rival's bottle; Dr. Helix also sends garbage attacks when his meter fills! |
| **`4`** | `flash` | **✨ Flash Virus Hunt** | Eliminate the **3 pulsing Golden VIP Target Viruses (`✨`)** buried inside the pathogen cluster. Clear just the 3 flashing targets to win the stage instantly! |
| **`5`** | `marathon` | **♾️ Endless Bio-Surge** | Endless survival mode where a new pressurized row of mutant pathogens rises from the bottom of the bottle every **7 capsules** dropped. Survive as many Bio-Surge waves as possible! |
| **`6`** | `time_blitz` | **⏱️ 3-Minute ER Triage Blitz** | High-velocity 180-second emergency room score attack. Clearing a bottle immediately spawns a denser emergency wave with **+1,500 Triage Wave Bonus**. |
| **`7`** | `boss_pathogen` | **☣️ Mega-Pathogen Boss Raid** | Confront the **Omega Capsid (`10,000 HP`)**! Every virus cleared deals `350 × Chain` damage (`750 × Chain` for Golden VIP hits). Periodically, the boss mutates bottom cells into new viruses! |
| **`8`** | `stage_puzzle` | **🧩 Rx Prescription Lab** | Tactical puzzle laboratory with a strict **Rx Capsule Quota**. Sterilize every pathogen before your allotted prescription capsule count reaches `0`! |
| **`9`** | `chill_zen` | **🧘 Chill Zen Lab (No Game Over)** | Relaxed, zero-stress laboratory with `⏪ UNDO [U]` support and automatic **Top-4 Neck Sterilization** whenever the bottle stacks to the top. Never Game Over! |
| **`0`** | `coop_2p` | **👥 2P Med-Squad Co-Op** | Alternating-capsule team mode (**P1 Surgeon** + **P2 Specialist**) with a **+50% Co-Op Synergy Score Multiplier** and high-frequency Miracle Power Capsules. |

---

## 🧪 Miracle Cure Power Capsules & Mutant Pathogens

### 4 Special Power-Up Capsule Halves
1. **💣 Bio-Bomb (`bomb`)**: When matched in a 4-in-a-row alignment, detonates a **3×3 blast radius** around the capsule segment, vaporizing all adjacent capsules and pathogens.
2. **⚡ Laser Cross (`cross`)**: Fires a high-energy surgical beam across the **entire row and column**, eradicating every pathogen and pill segment in its crosshairs.
3. **🧪 Color Dissolver (`dissolver`)**: Releases a targeted antibody wave that **eradicates up to 4 pathogens of the matching color** anywhere in the bottle.
4. **🌈 Rainbow Wildcard (`rainbow`)**: Universal antigen segment that matches **Red, Yellow, or Blue** lines horizontally and vertically.

### Advanced Pathogen Strains & Super Surgery Bonus
- **🛡️ Armored 2-Hit Pathogen**: Protected by a calcified outer shell. The first match cracks the armor (`CRACK! +300`) and spawns a shield-shatter shockwave; a second match eradicates the pathogen.
- **❄️ Cryo-Stasis Ice Pathogen**: Encased in sub-zero frost that thaws when matched.
- **✨ Golden Flash VIP Pathogen**: Pulsing high-priority target in **Flash Virus Hunt** (`+500 VIP BONUS`).
- **📐 Super Surgery Bonus (`+2,500`)**: Clearing 5 or more segments in an intersecting **L-Shape, T-Shape, or Cross (+)** formation awards an instant `+2,500` Super Surgery Bonus and extra Miracle Cure charge!

---

## ⌨️ Desktop Keyboard & Gamepad Controls

| Action | Primary Key | Secondary Key |
| :--- | :--- | :--- |
| **Move Left** | `←` Left Arrow | `A` |
| **Move Right** | `→` Right Arrow | `D` |
| **Soft Drop (Accelerate)** | `↓` Down Arrow | `S` |
| **Hard Drop (Instant)** | `Space` | `Enter` / `W` |
| **Rotate Clockwise** | `↑` Up Arrow | `X` |
| **Rotate Counter-Clockwise** | `Z` | `Control` |
| **Hold / Swap Capsule** | `C` | `Shift` |
| **Activate Miracle Cure Skill** | `E` | `💉 SKILL [E]` Button |
| **Undo Last Capsule Drop** | `U` | `⏪ UNDO [U]` Button |
| **Switch Game Modes (1–10)** | `1` – `9`, `0` | Top Mode Bar / Dropdown |
| **Pause / Resume** | `P` | `Escape` |
| **Toggle Fullscreen** | `F11` | `⛶` Button |

---

## 🏆 Persistent Medical Career Vault
Your progress is automatically persisted in `localStorage` (`dr_codecaine_career_v2`):
- Tracks **Lifetime Viruses Eradicated**, **Total Bottles Cleared**, **Best Cascade Chain**, **Highest Score**, and per-mode **Stage Clear Badges**.
- Ranks your medical career from **Intern** → **Resident** → **Attending MD** → **Chief Surgeon** → **Surgeon General** → **Bio-Legend**.

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
