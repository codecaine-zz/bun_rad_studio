# 🧛 Codecaine NightSavior: Bullet-Heaven & Dark Force Odyssey

![Codecaine NightSavior Banner](../../screenshots/apps/vampire_survivors_desktop.png)

**Port**: `3276`  
**Launch Command**: `bun run app:vampire_survivors`  
**Server Entrypoint**: `applications/vampire_survivors_studio.ts`  
**Interactive Frontend**: `resources/vampire_survivors/index.html`

---

## 1. Overview: Gothic Bullet-Heaven Meets Vampire Savior Dark Force

**Codecaine NightSavior: Bullet-Heaven & Dark Force Odyssey** fuses the relentless auto-battler weapon evolutions and screen-filling gem swarms of ***Vampire Survivors*** with the high-voltage **Dark Force Overdrive**, **Twin Shadow Clones**, **Dash-Cancels**, and **EX Ultimate Specials** of Capcom's 1997 Gothic fighting masterpiece ***Vampire Savior: The Lord of Vampire (Darkstalkers 3)***.

Launch the desktop studio or local server anytime with:

```bash
bun run app:vampire_survivors
```

---

## 2. Six Playable Gothic Night-Lords (`#lordSelect`)

| Night-Lord | Signature Weapon & Evolution | Dark Force Overdrive EX Ultimate (`[SPACE]` / `[E]`) |
| :--- | :--- | :--- |
| **🧛‍♂️ Demitri-Caine** | `🩸 Crimson Whip` ➔ **`🩸 Bloody Tear`** (Lifesteal Crit Lash) | **Midnight Bliss & Demon Cradle**: Summons a Twin Shadow Clone, doubles attack speed, and unleashes screen-cleaving crimson bat waves. |
| **🦇 Morrigan-Vex** | `🪄 Magic Wand` ➔ **`🌟 Holy Wand`** (Zero-Cooldown Soul Fist Barrage) | **Darkness Illusion Clone Swarm**: Summons a mirrored Succubus Illusion and fires an emerald Soul Fist spiral across the arena. |
| **🐺 Talbain-X** | `🗡️ Throwing Knife` ➔ **`🗡️ Thousand Edge`** (Cyber Werewolf Claws) | **Dragon Cannon Dash**: Unleashes a blazing plasma flame dragon and a 360° silver blade flurry. |
| **🗡️ Donovan-Zero** | `📖 King Bible` ➔ **`📕 Unholy Vespers`** (Orbiting Dhampir Grimoires) | **Change Immortal**: Surrounds the hero with 8+ permanent crimson-gold grimoires and elemental lightning pillars. |
| **🧄 Poe-Phantasm** | `🧄 Garlic Aura` ➔ **`🌌 Soul Eater`** (Dark-Matter Lifesteal Field) | **Supreme Crimson Soul Vortex**: Expands the Soul Eater field across the arena while draining vitality from every undead stalker. |
| **👑 Jedah-Omega** | `🪓 Execution Axe` ➔ **`🪓 Death Spiral`** + **`🌩️ Thunder Loop`** | **Finale Rosso Blood Contract**: Hurls 16 radial Reaper scythes while chaining continuous heaven-to-earth lightning bolts. |

---

## 3. 10 Weapon Evolutions & 6 Passive Relics (`6 × 6` HUD Matrix)

Level any base weapon to **Lv. 5+** (or **Lv. 8**) while holding its paired **Passive Relic**, then collect a **Golden Boss Treasure Chest (`🎁`)** or press **`🎁 CHEST JACKPOT [C]`** to awaken its **Red/Gold Evolved Super Weapon**:

| Base Weapon | Paired Passive Relic | Evolved Super Weapon | Evolved Super Behavior |
| :--- | :--- | :--- | :--- |
| `🩸 Crimson Whip` | `📖 Empty Tome (-Cooldown)` | **`🩸 Bloody Tear`** | Critical horizontal slashes that restore hero HP on hit |
| `📖 King Bible` | `🕯️ Candelabrador (+Area)` | **`📕 Unholy Vespers`** | Never-ending ring of 8 crimson-gold orbiting grimoires |
| `🧄 Garlic Aura` | `🧲 AttractOrb (+Magnet)` | **`🌌 Soul Eater`** | Expanding dark-matter barrier whose damage scales with HP drained |
| `⚡ Lightning Ring` | `💍 Duplicator (+Amount)` | **`🌩️ Thunder Loop`** | Dual-strike heaven lightning bolts with secondary chain arcs |
| `🪄 Magic Wand` | `📖 Empty Tome (-Cooldown)` | **`🌟 Holy Wand`** | Fires a relentless homing stream of Soul Fist projectiles with zero delay |
| `💧 Santa Water` | `🧲 AttractOrb (+Magnet)` | **`🌊 La Borra`** | Glowing hydro-sanctuary pools that converge around the Night-Lord |
| `🗡️ Throwing Knife` | `🥊 Bracer (+Speed)` | **`🗡️ Thousand Edge`** | Continuous machine-gun barrage of high-velocity silver dhampir blades |
| `🪓 Execution Axe` | `🕯️ Candelabrador (+Area)` | **`🪓 Death Spiral`** | Piercing giant Reaper scythes hurled radially in all directions |
| `✝️ Sacred Cross` | `🥬 Spinach (+Might)` | **`⚔️ Heaven Sword`** | Boomerang celestial broadswords that cleave twice and crit |
| `🔥 Fire Wand` | `🥬 Spinach (+Might)` | **`☄️ Hellfire`** | Giant piercing meteor fireballs that incinerate entire enemy columns |

---

## 4. All 8 Playable Game Modes (`#vampireModeSelect` & Keys `1–8`)

1. **🌲 1. Mad Neon Forest (`mad_forest`)**: Classic 30-minute Gothic bullet-heaven survival amidst moonlit cathedrals, bat swarms, and Red Death bosses.
2. **📚 2. Inlaid Cyber-Library (`inlaid_library`)**: Horizontal grimoire corridor designed for high-density XP gem farming and evolution testing.
3. **🗼 3. Gallo Blood Tower (`gallo_tower`)**: Vertical gothic gauntlet packed with armored skeletons, ghouls, and elite Mini-Reapers.
4. **🥊 4. Vampire Savior 1v1 Duel (`vampire_savior_duel`)**: Darkstalkers 3 fighting arena crossover with dual top health bars, rival Night-Lord boss AI, Dash-Cancels, and Dark Force EX clashes.
5. **⚡ 5. Hyper Hurry Overdrive (`hyper_hurry`)**: `1.85×` simulation speed, doubled XP gem value, and rapid weapon evolution chests.
6. **🃏 6. Arcana Tarot & Limit Break Sandbox (`arcana_sandbox`)**: Toggle **XVI - Slash**, **II - Twilight Requiem**, and **VI - Sarabande of Healing** while pushing weapons beyond max level.
7. **💀 7. Red Death Reaper Boss Rush (`reaper_boss_rush`)**: Non-stop waves of hooded Crimson Reapers dropping golden evolution chests.
8. **🤖 8. Auto-Survivor AI & Build Tester (`auto_ai_tester`)**: Autonomous orbital kiting AI that stress-tests 6-weapon evolved builds hands-free.

---

## 5. Controls & Keyboard Shortcuts

| Key / Input | Action |
| :--- | :--- |
| `W A S D` / `Arrow Keys` / Mouse Drag | Steer your Night-Lord across the Gothic arena |
| `SPACE` or `E` | Activate **Vampire Savior Dark Force Overdrive** (Twin Shadow Clone + EX Ultimate) |
| `SHIFT` | Execute **Darkstalkers Dash-Cancel** with invulnerability frames |
| `C` | Open **Boss Treasure Chest Jackpot** (evolves eligible weapons & awards Soul Gold) |
| `V` | Open/Close **Weapon Evolution Grimoire Modal** (with instant 1-click Awaken buttons) |
| `1` / `2` / `3` | Pick **Level-Up Draft Card 1–3** (or switch Game Modes `1–8`) |
| `R` / `X` | **Reroll (`[R]`)** or **Banish (`[X]`)** current Level-Up Draft choices |
| `M` | Toggle **Baroque Pipe Organ & Synthwave WebAudio BGM** |
