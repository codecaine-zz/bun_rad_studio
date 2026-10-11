# 🕹️ Cyberpunk Pac-Man Arcade -- Complete Production User Guide

```
Version: 2.4.0  •  Engine: Native HTML5 Canvas & Authentic Ghost AI Personalities  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:pacman]  •  [Headless Server: bun run applications/pacman_studio.ts --server]
```

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
- **Move**: `Arrow Keys` or `W`, `A`, `S`, `D`
- **Pause**: `P` or `Escape`
- **Restart**: `R`
- **Fullscreen**: `F` or `F11`
