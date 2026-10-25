# 🎴 Codecaine UNO Royale: Wild Cascade Edition — 8-Mode Championship Guide

```
Version: 3.0.0  •  Engine: 4-Player Physical UNO Vector Tabletop, 8 Custom Game Modes, +2/+4/+5/+6/+10 Cascade & Game Master FX (Alt+G)  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:uno]  •  [Headless Server: bun run applications/uno_studio.ts --server]
```

---

## 🌟 Executive Overview
**Codecaine UNO Royale: Wild Cascade Edition** is a 4-player tabletop UNO workstation featuring **8 Custom UNO Game Modes** (`Classic Royale`, `UNO FLIP!`, `Show 'Em No Mercy`, `Jump-In Blitz`, `2v2 Partner Team`, `UNO All Wild!`, `Cyber Roulette`, and `Codecaine Cyber-Hack Deck`), custom physical-style vector cards (including `FLIP`, `+5`, `+6`, `+10`, `SKIP ALL`, `PURGE`, `MIRROR`, `TORNADO`, and `XRAY`), three distinct AI personalities (**Viper**, **Nova**, and **Titan**), and a **500-Point Tournament Cup** with persistent Career XP.

---

## 🚀 Quick Start & Launch

```bash
# Standard desktop launch
bun run app:uno

# Launch headless server
bun run applications/uno_studio.ts --server
```

---

## 🎮 The 8 Custom UNO Game Modes
Switch modes anytime via the **Top Mode Ribbon**, the **`#unoModeSelect` Header Dropdown**, or number keys **`1`–`8`**:

1. **🏆 1. Classic 500-Pt Royale (`classic`)**:
   - Standard 4-player championship UNO with toggleable `+2/+4` Stacking, `7-0` Hand Swap/Rotation, `UNO!` Shout (`[U]`), and `Catch AI` (`[C]`).
2. **🌗 2. UNO FLIP! — Light & Dark Side (`flip`)**:
   - Adds **🔄 FLIP** cards (`value: 'FLIP'`) to the deck!
   - Playing a **🔄 FLIP** card flips the arena between the **☀️ Light Side** (`Red`, `Blue`, `Green`, `Gold`) and the **🌑 Dark Side** (`Magenta`, `Violet`, `Teal`, `Amber`) with brutal Dark Actions: **`+5` Draw Five**, **`⏭️ Skip All`** (skips all 3 opponents so you immediately play again!), and **`🌈 Wild +6`**.
   - Includes a live **`☀️ LIGHT SIDE` / `🌑 DARK SIDE`** indicator pill in the HUD.
3. **💀 3. Show 'Em No Mercy — 25-Card Knockout (`no_mercy`)**:
   - Adds brutal **`+4`**, **`+6`**, **`Wild +10`**, **`⏭️ Skip All`**, and **`🗑️ Discard All` (`PURGE`)** (discards every card in your hand matching the active suit color in one move!).
   - Enforces the **☠️ 25-Card Mercy Knockout Rule**: any player whose hand reaches **25 or more cards** is immediately **ELIMINATED (`💀 KO`)** from the round!
4. **⚡ 4. Jump-In & Speed Slap Blitz (`jump_in`)**:
   - Enables the **⚡ Jump-In Rule**: Even during an AI opponent's turn, if you hold an **identical twin card** (same color and same value as the top discard card), it glows gold and clicking it immediately triggers **`⚡ JUMP IN!`** to cut in line and hijack the turn!
5. **🤝 5. 2v2 Partner Team Royale (`team_2v2`)**:
   - You and **North AI (`NOVA 🤝 Partner`)** team up against **West (`VIPER`)** and **East (`TITAN`)**!
   - Your team shares combined Cup Points, and if either you or your Partner empties their hand first, your team wins the round! Includes a **👁️ Peek Partner (`[P]`)** toggle so you can see North AI's cards face-up.
6. **🎰 6. UNO All Wild! Chaos (`all_wild`)**:
   - 100% Wild Deck! Every card is playable on any suit and carries a special Wild action (`Wild`, `Wild Reverse`, `Wild Skip`, `Wild Skip All`, `Wild +2`, `Wild +4`, `Wild Swap`, and `Wild Tornado`).
7. **💣 7. Cyber Roulette & Time-Bomb Press (`roulette`)**:
   - Replaces standard 1-card draws with the **💣 Cyber Roulette Press**: each draw increases the Roulette Danger Meter (`15% → 90%`) and either lets you escape with **`0` cards (`SAFE!`)** or erupts for **`2–6` penalty cards**!
8. **💻 8. Codecaine Cyber-Hack Deck (`cyber_hack`)**:
   - Injects 4 exclusive **Cyber-Hack Cards** into the deck:
     - **🗑️ Purge Color (`PURGE`)**: Dumps all cards of the active color from your hand at once!
     - **🪞 Mirror Shield (`MIRROR`)**: Reflects any active `+2/+4/+5/+6/+10` Draw Stack back onto the previous player by reversing turn direction!
     - **🌪️ Tornado Equalizer (`TORNADO`)**: Collects all cards from all active players' hands, shuffles them together, and redistributes them evenly around the table!
     - **👁️ X-Ray Reveal (`XRAY`)**: Reveals all AI opponents' hands face-up on the canvas for 3 turns!

---

## 🕹️ Keyboard & Mouse Controls Reference

| Key / Action | Command Description |
| :--- | :--- |
| `Left Click Card` | Play highlighted matching card (or `⚡ JUMP IN!` twin card on AI turns) |
| `Left Click Deck` / `D` | Draw from Stock, press Cyber Roulette, or accept active stack penalty |
| `1` – `8` | Switch between the 8 UNO Game Modes (or pick Wild Color `1`–`4` when modal is open) |
| `U` | **Shout UNO!** when holding 1–2 cards |
| `C` | **Catch AI!** (Penalize an AI holding 1 card who forgot to call UNO) |
| `P` | Toggle **👁️ Peek Partner** (reveals North AI's hand face-up) |
| `S` / `H` | Sort Your Hand by Suit Color & Value / Highlight Best Tactical Card |
| `N` / `B` / `M` | Deal Fresh 500-Point Tournament / Toggle Synthwave Music / Mute SFX |
| `Alt + G` | Toggle Codecaine Game Master FX HUD |

---

## 🐧 Slow Linux Machines — Brave & Chrome Browser Performance Tip
- On slower Linux machines, integrated GPUs, or virtual machines where the native `libwebkitgtk-6.0-4` window uses software rendering, **Brave**, **Google Chrome**, and other Chromium-based browsers run Canvas 2D graphics, particle effects, and Web Audio synthesizers significantly faster.
- Launch with `--server` (or start Codecaine File Manager with `bun run app:files --server`) and open the printed `http://127.0.0.1:<port>` URL in **Brave** or **Chrome** for smooth 60fps gameplay.
- Press **`Alt+G`** at any time to open the **Game Master FX HUD** and toggle off **CRT Scanlines** or **Cabinet Glow** to further reduce GPU/CPU compositing overhead on older hardware.
