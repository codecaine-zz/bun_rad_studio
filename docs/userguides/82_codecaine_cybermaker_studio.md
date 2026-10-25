# 🏗️ Codecaine CyberMaker Studio: OS Kernel World Architect

![Codecaine CyberMaker Studio Banner](../../screenshots/apps/cyber_maker_desktop.png)

## 1. Overview & Vision

**Codecaine CyberMaker Studio** (`applications/cyber_maker_studio.ts`) is an interactive side-scrolling level architect, 4-tier procedural AI course generator (`Easy`, `Medium`, `Hard`, `Extreme`), and real-time 2D platformer playtest engine inspired by *Super Mario Maker 2* and classic operating system kernel folklore. Players seamlessly toggle between **Blueprint Edit Studio Mode** (painting terrain, guided rails, logic wires, OS gizmos, hazards, and boss encounters onto a `120 × 20` grid) and **Live Playtest Arena Mode** (`[P]` / `[Tab]`) with zero loading screens.

Engineered specifically for **macOS Apple Silicon M4 (`WKWebView` / Metal)**, CyberMaker Studio utilizes a **2× Retina Supersampled 3D-Shaded Offscreen Sprite Atlas (`spriteCache`)**, **Pre-Baked `1280×640` Panoramic Parallax World Backdrops (`bgCache`)**, and a **Dirty-Flag Offscreen Minimap (`minimapBuffer`)** to deliver a locked **60–120 FPS (`< 0.8ms` frame time)** with zero CPU CoreText emoji rasterization bottlenecks.

---

## 2. Top-Tier 2× Retina 3D-Shaded Silhouettes & Live Per-Item Effects

Every single item in the 38-object OS catalog is rendered with a **completely unique, unmistakable 3D vector silhouette** inside `renderSpriteToCtx` (cached at `2×` Retina resolution in `spriteCache` and previewed live inside `<canvas class="item-preview-can">` cards in the left palette dock) plus lightweight **live animated per-item effects** in `drawCourseObjectFast`:

- **🐧 Tux Ice Suit (`tux_suit`)**: Full sculpted Linux Penguin silhouette (spread flippers, snow-white belly, cyan cryo goggles, 3D orange diamond beak, webbed orange feet) with a bobbing animation, pulsing cryo aura ring, and orbiting sparkle motes.
- **🔱 Beastie Pitchfork (`bsd_trident`)**: Diagonal **Flaming 3-Pronged Devil Pitchfork** spanning corner-to-corner with a horned crossguard, barbed golden-crimson spear tips, and pulsing crimson energy halo.
- **👑 Sudo Root Star (`sudo_star`)**: Faceted 5-pointed golden star with an inner ruby power core and a **3D Royal Root Crown** perched on top, plus orbiting golden sparkles.
- **📦 Tarball Bomb (`tarball_bomb`)**: Spiked black-iron naval mine / bomb sphere with **6 protruding metallic conical studs**, hazard equator belt, curved rope fuse, and a live flickering orange/yellow fuse spark.
- **⚙️ Cron Beat Block (`cron_block`)**: **12-tooth metallic Clockwork Gear / Cogwheel** with an inner dark-glass clock dial, golden hour/minute hands, and a live rotating cyan second-hand.
- **👾 Zombie `<defunct>` (`zombie_proc`)**: Undead cyberpunk monster head with jagged metallic **Frankenstein neck bolts**, exposed glowing toxic-green brain dome, asymmetric red laser visor eye, stitched grin, and rising bio-aura wisps.
- **💀 OOM Killer Drone (`oom_reaper`)**: Hooded Grim Reaper phantom in a tattered dark-matter cloak with glowing crimson skull eyes, hovering phantom wisps, and a **large curved silver/crimson Scythe blade** sweeping overhead.
- **⏪ Time Machine Orb (`timemachine_orb`)**: Ornate **Celestial Astrolabe & Gyroscopic Hourglass** with intersecting tilted golden rings and a diamond temporal singularity core.
- **🔍 Spotlight Turret (`spotlight_turret`)**: Articulated metallic laser cannon on a tripod pedestal with a sapphire optical barrel and pulsing cyan aperture charge glow.
- **🐡 Puffy Spike-Fish (`puffy_fish`)**: Detailed OpenBSD blowfish with 16 two-tone golden spines, tail fin, cream belly, and expressive eyes.
- **👹 Mecha-Beastie Boss (`boss_beastie`)**: Giant (`64×64`) armored Daemon King with spread crimson bat wings, curved golden horns, menacing visor eyes, and a glowing cyan chest fusion reactor core.
- **🟦 BSOD Thwomp (`bsod_thwomp`)**: Heavy fortress crusher with **12 sharp metallic perimeter spikes**, recessed `#0000AA` Win95 CRT screen, `:(`, and crash dump bars.
- **⏳ Hourglass Lag Zone (`hourglass_zone`)**: Sculpted **3D Golden Hourglass** with blown-glass bulbs and trickling golden sand inside a purple time-dilation vortex.
- **🥟 Bun Turbo Pad (`bun_booster`)**: Angled neon speed-ramp with scrolling plasma chevrons (`>>>`) topped by a sculpted white **Steamed Bao Bun mascot** with dough pleats and rosy cheeks.
- **🔺 Kernel Panic Spike (`kernel_spike`)**: 3 jagged obsidian-and-crimson crystal stalagmites with razor-sharp specular facets.

---

## 3. World-Class 4-Tier Procedural AI Course Architect (`#aiDifficultySelect`)

Select a difficulty tier from **`#aiDifficultySelect`** in the top toolbar (or press **`🎲 AI GENERATE [G]`**) to invoke `generateProceduralAiCourse(difficulty)` (`window.generateAiLevel`):

| Tier | Mode Name | Set-Piece Architecture & Challenge Profile |
| :--- | :--- | :--- |
| **`easy`** | **🌱 Easy (Boot Sandbox)** | Continuous floor with 1–2 tile safety-bridged gaps, Dock Springboards, generous `tux_suit` / `bsd_trident` / `sudo_star` power-up stations, 2 `checkpoint` flags, slow sparse `zombie_proc` patrols, and an end boss with a high `semisolid` bypass deck. |
| **`medium`** | **⚡ Medium (Daemon Run)** | 2–3 tile gaps, paired `warp_pipe`s, guided `rail` `clippy_helper` ferries, wired `onoff_switch -> pf_firewall` puzzle, midway `checkpoint`, `conveyor` belts, and a guarded `boss_beastie` citadel. |
| **`hard`** | **🔥 Hard (Ring-0 Gauntlet)** | Momentum chains (`bun_booster` + `macos_dock`), `onoff_switch` (`red_block`/`blue_block`) rhythm bridges, 2 wired `pf_firewall` puzzles, `bsod_thwomp` timing bays with upper window bypasses, `spotlight_turret` terraces, and a multi-deck Boss Fortress. |
| **`extreme`** | **💀 Extreme (Kaizo Kernel)** | High-altitude Kaizo sky-island parkour: chained `macos_dock` -> `semisolid` -> `note_block` bounces, fast `bun_booster` -> guided `rail` transfers, dual `bsod_thwomp` + `onoff_switch` phase skyways, `conveyor` launches, and a **Twin-Boss Kaizo Citadel** with 2-tier battle decks and `sudo_star` armory. |

### 🛡️ 100% Beatable Forward-Kinematic Verifier & Auto-Repair (`verifyAndRepairCourse()`)
Every AI-generated course automatically runs **`verifyAndRepairCourse()`** (`window.verifyAndRepairCourse`) before play:
1. **Air Headroom Carving**: Ensures a clear 2–3 tile air corridor above every landing surface along the golden path.
2. **Horizontal & Vertical Reachability Repair**: Scans left-to-right from `spawn_pad` to `goal_gate`. Any horizontal gap `> 3 tiles` without a ferry is automatically fitted with a rescue `semisolid` bridge and coin guide arc; any vertical climb `> 3 tiles` automatically receives a `macos_dock` springboard.
3. **Firewall Switch Verification**: Verifies that every `pf_firewall` column has a reachable, wired `onoff_switch` to its left.
4. **Golden Solution Trajectory (`aiGoldenPath`)**: Computes and renders the verified solution waypoints (`onionTrail`) and guides the **`🤖 AI BOT [V]`** (`stepAiSpeedrunner`) to clear Easy, Medium, Hard, and Extreme courses autonomously.

---

## 4. Five Playable OS Mascot Heroes (`#heroSelect`)

| Hero ID | Mascot Name | Passive Signature Trait | Active Fire / `[F]` Ability |
| :--- | :--- | :--- | :--- |
| **`tux`** | **🐧 Tux (Linux Kernel)** | **Low-Friction Belly-Slide (`[S]` / `[Down]`)** that shatters `📦 Package Blocks` | Throws **Cryo Snowballs** that freeze enemies into solid ice blocks you can stand on! |
| **`bsd`** | **😈 Beastie (FreeBSD Daemon)** | **Mid-Air Double Jump** + **Spin-Jump (`[C]`)** | Fires a **3-Way Forked Trident Spread** that pierces multiple targets. |
| **`clarus`** | **🍎 Clarus (Mac OS Dogcow)** | **Auto Spin-Bounce** off enemy heads & `🔺 Kernel Panic Spikes` | Fires a high-velocity horizontal **Moof! Aqua Laser Beam** across the screen. |
| **`clippy`** | **📎 Clippy (Office Assistant)** | **Hover Glide** (hold `[Jump]` while falling to cap descent at `1.8 px/frame`) | Spawns a solid **Mid-Air Lift Platform** (`semisolid`) directly beneath Clippy's feet! |
| **`bao`** | **🥟 Bao (Bun Runtime Mascot)** | **1.25× Hyper-Run Speed** | Executes an **Invulnerable Horizontal Hyper-Dash** that smashes through blocks and enemies! |
