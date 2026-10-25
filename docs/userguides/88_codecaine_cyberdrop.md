# 🃏 Codecaine CyberDrop: Grab & Throw Chain Blitz -- Complete Production User Guide

![Codecaine CyberDrop Banner](../../screenshots/apps/magical_drop_desktop.png)

```
Version: 2.5.0  •  Port: 3272  •  Engine: 7×12 Magical Drop III & Money Idol Exchanger Grab-and-Throw Cascade Engine, Orphan Pull-Up Solver & Tarot Arcana AI + Game Master FX (Alt+G)
Launchers: [Desktop GUI: bun run app:magical_drop]  •  [Headless Server: bun run applications/magical_drop_studio.ts --server]
```

---

## 🌟 Executive Overview

**Codecaine CyberDrop: Grab & Throw Chain Blitz** is a 60fps HTML5 Canvas tribute to Data East's 1997 Neo-Geo arcade classic **Magical Drop III** and Face's **Money Idol Exchanger**.

Glide your **Cyber-Jester Launcher (`🃏`)** along the bottom rail of a **7-Column × 12-Row Jewel Canopy**, grab contiguous stacks of same-color orbs from any column (`[S]` / `Left-Click`), and slam them upward into target columns (`[W]` / `Right-Click`) to ignite **Contiguous Flood-Clears**, **Orphan Pull-Up Cascades**, and **Active Real-Time Chains (`2×`–`15×`)**!

---

## 🚀 Quick Start & Launch

```bash
# Launch Desktop Studio GUI
bun run app:magical_drop

# Launch Headless HTTP Server on Port 3272
bun run applications/magical_drop_studio.ts --server
```

---

## 🃏 Core Grab-and-Throw & Active Chain Mechanics

### 1. Multi-Stack Same-Color Grab & Vertical Throw
- **Grab (`[S]` / `[Down]` / `[Space]` / `Left-Click`)**: Pulls the bottom-most orb in your current column—plus **all contiguous orbs of the same color stacked immediately above it**—into the Cyber-Jester's hands. While holding color `C`, you can move to other columns and grab additional `C` orbs!
- **Throw (`[W]` / `[Up]` / `Right-Click`)**: Slams all held orbs upward into the bottom of the current column.

### 2. Contiguous Flood-Clear & Orphan Pull-Up Cascade
- **Contiguous Flood-Clear**: Aligning **`3+` orbs vertically** in any column pops that vertical run **AND recursively pops all orthogonally connected orbs of that same color** across neighboring columns!
- **Orphan Pull-Up Cascade**: Any orbs left hanging below a cleared gap automatically snap upward into the ceiling stack, triggering **2×–15× Automatic Chain Reactions** while you continue grabbing and throwing in real time!

### 3. Special Orbs & Money Idol Exchanger Coin Synthesis
- **❄️ Ice Orbs**: Cannot be grabbed directly while frozen; popping any orthogonally adjacent orb cluster thaws surrounding Ice Orbs into that matching color!
- **🌈 Rainbow Wild Orb**: Throwing or striking a Rainbow Orb vaporizes **every orb on the board** matching the target color!
- **💰 Money Idol Exchanger Mode**: Merge coins by value instead of vanishing:
  - `5× 1¢` → `5¢ Nickel` • `2× 5¢` → `10¢ Silver` • `5× 10¢` → `50¢ Gold` • `2× 50¢` → `100¢ Ingot` • `5× 100¢` → `500¢ Crown!`

---

## 🔮 6 Selectable Tarot Arcana Challengers (`#arcanaSelect`)

1. **🃏 0. The Fool**: Balanced alternating column drops with bonus Rainbow Orbs.
2. **🪄 I. The Magician**: High-tempo Sapphire & Amethyst spell chains.
3. **👑 III. The Empress**: Royal Ruby & Topaz cascades with pressurized counter-garbage.
4. **🛡️ VII. The Chariot**: High-speed blitz cadence with armored Ice Orb formations.
5. **⭐ XVII. The Star**: Celestial Ice & Rainbow prism patterns across all 7 columns.
6. **🌍 XXI. The World**: Supreme Tarot Grandmaster with dense 5-color canopies.

---

## 🎮 Complete Guide to All 8 Game Modes (`#dropModeSelect`)

1. **⚔️ Vs. AI Arcana Duel (`vs_ai`)**: Head-to-head split-stage battle against any of the 6 Tarot Arcana Challengers.
2. **💰 Money Idol Exchanger (`money_idol`)**: Authentic `1¢ → 5¢ → 10¢ → 50¢ → 100¢ → 500¢` coin-merging cascade puzzle.
3. **🏆 Endless Quota Marathon (`marathon`)**: Clear 100+ orb stage quotas across progressively faster canopy descents.
4. **🧩 1-Move Chain Puzzle Vault (`puzzle`)**: Curated multi-column canopy formations designed for massive `4×+` chain solutions.
5. **⚡ 2-Minute Caravan Score Attack (`caravan`)**: High-velocity 120-second Neo-Geo tournament score attack.
6. **❄️ Ice & Rainbow Chaos (`ice_chaos`)**: High-frequency Ice Orbs and Rainbow Wild Orbs for full-screen prism clears.
7. **👑 Boss Rush (6 Tarot Masters) (`boss_rush`)**: Consecutive gauntlet against all 6 Tarot Arcana masters.
8. **🤖 AI Chain Advisor (`ai_advisor`)**: Live tactical telemetry highlighting the highest-scoring Grab → Throw column pair (`[H]`).

---

## ⌨️ Controls & Keyboard Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `A` / `D` or `◄` / `►` or `Mouse Hover` | Move Cyber-Jester Launcher across Columns `1`–`7` |
| `S` / `▼` / `SPACE` / `Left-Click` | **Grab** bottom orb stack of matching color |
| `W` / `▲` / `Right-Click` | **Throw** all held orbs upward into current column |
| `Q` or `SHIFT` | Pull down a new ceiling row immediately |
| `H` | Execute **AI Chain Advisor** optimal Grab & Throw move |
| `R` | Reset match canopy |
| `M` | Toggle Neo-Geo Arcade Synth BGM & Chain Chime SFX |
| `1` – `8` | Instant switch between all 8 Game Modes |
