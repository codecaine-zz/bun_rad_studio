# 🧠 Codecaine CyberRecall Royale: Holo-Vault Memory Match

![Codecaine CyberRecall Royale Banner](../../screenshots/apps/memory_match_desktop.png)

**Category**: Games & Entertainment  
**Launch Command**: `bun run app:memory_match`  
**Server Entrypoint**: `applications/memory_match_studio.ts`  
**Interactive Frontend**: `resources/memory_match/index.html`

---

## 1. Overview

**Codecaine CyberRecall Royale: Holo-Vault Memory Match** is a 60fps 3D perspective holographic card-flipping and cognitive memory match game studio. It features 8 distinct playable memory modes, 5 selectable holographic card deck themes, 4 tactical recall power-ups, combo multiplier chains, and a turn-based duel mode against the **C.A.I.N.E.-9000** neural AI opponent.

```bash
bun run app:memory_match
```

---

## 2. 8 Playable Memory Match Modes

| Key | Mode Name | Grid & Mechanics |
| :--- | :--- | :--- |
| `1` | **🃏 Classic Holo-Pairs (4×4)** | 16 cards (8 pairs) with 3D perspective flips and combo streak multipliers. |
| `2` | **🏛️ Grand Vault (6×4)** | 24 cards (12 pairs) across an expanded high-stakes casino vault table. |
| `3` | **🧠 Master Matrix (6×6)** | 36 cards (18 pairs) with an opening 2.2-second memorization peek phase. |
| `4` | **🔺 Triad Match-3 Recall** | 24 cards (8 triplets) — flip **3 identical cards in a row** (`+1,500 × Streak`)! |
| `5` | **⚡ 60s Blitz Rush** | High-speed 60-second time attack where every matched pair grants `+3.0s` bonus time. |
| `6` | **💣 Cyber-Minefield** | Memorize the positions of 2 EMP Decoy Bomb tiles (`💣`) during the opening peek and match all safe pairs. |
| `7` | **🤖 VS Neural AI Dealer** | Turn-based memory duel against **C.A.I.N.E.-9000**, which tracks seen cards in a 6-card short-term memory buffer. |
| `8` | **🎵 Chrono-Sequence Recall** | Pattern + pair hybrid memory challenge with opening sequence preview. |

---

## 3. Controls & Tactical Power-Ups

- **Flip Card**: Left-click any card on the `<canvas>` or navigate with `WASD` / `Arrow Keys` and press `Space` or `Enter`.
- **`Q` — 👁️ X-Ray Holo-Peek**: Reveals all unmatched cards on the board for `1.8 seconds`.
- **`W` (`Shift+W`) — ⚡ Quantum Auto-Pair**: Automatically locates and locks 1 matching pair on the board.
- **`E` — ❄️ Chrono-Freeze**: Freezes the round clock and protects your Combo Streak against mismatches for `10 seconds`.
- **`R` — 🔦 Neural Hint Radar**: Pulses a golden halo around a valid matching pair.
- **`N` — 🔄 New Deal**: Deals a fresh shuffled board.
- **`M` — 🔊 Audio Toggle**: Toggles the WebAudio crystalline card-flip and combo harmonic synthesizer.

---

## 4. Navigation

- Return to the [Documentation Table of Contents](../toc.md) or [Application Index](../reference/application-index.md).
