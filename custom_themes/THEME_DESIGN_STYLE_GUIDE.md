# 📐 Codecaine File Manager — Professional Theme Design & Architecture Style Guide

> **From Zero-Watt Featherweight Systems (`low`) to 120Hz ProMotion 6K XDR Flagships (`ultra`)**

This style guide documents the engineering principles, color science, GPU shader budgeting, 3D folder iconography, and CSS variable architecture used to craft professional themes for the **Codecaine File Manager**.

---

## 1. System Hardware Tier Budgeting (`low` · `medium` · `high` · `ultra`)

A professional theme designer never forces a single heavy shader budget onto every machine. Always classify your theme into one of four **Hardware Tiers** so users on any computer get a locked framerate:

| Tier | Target Hardware | Backdrop Blur (`blur`) | Glass Opacity (`glass`) | Atmosphere Layers (`atmosphere`) | 3D Icon Animation (`iconAnimation`) | Motion Profile (`motion`) |
| :--- | :--- | :-: | :-: | :--- | :--- | :-: |
| **🟢 `low`** | Raspberry Pi, Chromebook, Intel N100, Remote VNC/SSH, Laptop Battery Saver | `0` (Zero GPU blur) | `0` (Opaque matte/OLED) | `"none"` (0 canvas particles) | `"off"` (Static crisp 3D SVG icons) | `"zero"` or `"calm"` |
| **🟡 `medium`** | MacBook Air M1/M2/M3, Ultrabooks, Surface Pro, Steam Deck (60Hz) | `10` – `14` px | `0.45` – `0.55` | **1 lightweight layer** (`bokeh`, `snow`, `autumn_leaves`, `fireflies`) | Gentle 2D/3D (`spring_pop_3d`, `levitate_float`) | `"calm"` or `"spring"` |
| **🟠 `high`** | MacBook Pro M3/M4 Pro, iMac 24", Desktop RTX 3060–4070 / Radeon RX (60–120Hz) | `20` – `24` px | `0.62` – `0.68` | **2 combined layers** (`aurora_ribbons+bokeh`, `snow+aurora_ribbons`, `data_rain+hud_reticle`) | Active 3D (`holo_foil_shimmer`, `orbital_halo_spin`, `clockwork_gear_tick`) | `"spring"` or `"cinematic"` |
| **🔴 `ultra`** | **Apple Mac Studio M4 Ultra (32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K @ 120Hz)**, RTX 4090/5090 | `26` – `32` px | `0.70` – `0.78` | **3 to 6 combined layers** (`autumn_leaves+embers+fireflies`, `blizzard+aurora_australis`, `supernova_remnant+tesseract_4d+aurora_australis`) | Full 120Hz 3D Turntable / Origami / Cube / C4D (`folder_3d_spin_turntable`, `folder_3d_flip_origami`, `c4d_mograph_cloner_wave`, `m4_liquid_metal_morph`) | `"spring"`, `"snappy"`, or `"elastic"` |

---

## 2. Color Science & WCAG AA/AAA Legibility Rules

Every theme defines **3 required hex colors** and **7 optional semantic hex colors**:

```json
"colors": {
  "background": "#0d0614",
  "text":       "#fff4e6",
  "accent":     "#ff6d00",
  "secondary":  "#b388ff",
  "card":       "#170b24",
  "border":     "#3b1d54",
  "danger":     "#ff3d00",
  "warning":    "#ffab00",
  "success":    "#00e676",
  "info":       "#b388ff"
}
```

### Golden Rules of Palette Engineering
1. **Primary Body Contrast ≥ 7.0:1 (WCAG AAA):** Keep `text` against both `background` and `card` above **7.0:1** (10:1+ preferred for 6K XDR studio monitors). The File Manager's `fmThemes.ts` engine automatically audits contrast and lifts/darkens tokens that fall below **4.5:1 (WCAG AA)**.
2. **Card Elevation Step (`card` vs `background`):**
   - **Dark Themes (`dark: true`):** Make `card` **4% to 8% lighter** in relative luminance than `background` (e.g. `#050d17` background → `#0a1829` card) so panels, sidebars, and 3D folder plates separate cleanly without relying solely on borders.
   - **Light Themes (`dark: false`):** Set `background` to a soft tinted paper/glacier tone (`#f2f8ff` or `#faf7f0`) and `card` to pure crisp `#ffffff` so cards float naturally above the workspace.
3. **Complementary Dual-Glow Pairing (`glowColor` + `glowColor2`):** Pair a warm or primary `glowColor` with a cool or harmonic `glowColor2` (e.g., Halloween `#ff6d00` pumpkin amber + `#b388ff` witching-hour violet; Polar `#64ffda` aurora mint + `#80d8ff` glacier cyan).
4. **Semantic Distinctness:** Never make `danger`, `warning`, and `success` the same hue as `accent`. Keep `danger` in the crimson/coral family, `warning` in amber/gold, and `success` in emerald/mint so destructive prompts (`Delete`, `Bury (Rip)`) and audit badges remain unmistakable.

---

## 3. Sculpted 3D Folder Shaders (`uiElementFx` — 44 Shaders)

The `fx.uiElementFx` property transforms every folder row and **Icons View (`#list.view-icons`)** tile into a physical 3D material with custom top-tab geometry, specular rim lighting, and animated surface shaders:

| Category | `uiElementFx` Keys | Visual Signature |
| :--- | :--- | :--- |
| **Apple / Desktop Pro** | `tahoe_glass_folders`, `cupertino_ceramic_bevel`, `xdr_titanium_folders`, `fluent_mica_folders`, `google_material_folders` | Specular refractive glass, CNC-machined titanium chamfers, and layered mica elevation |
| **Holiday & Seasonal** | `holiday_festive_glow`, `cryo_frost` | Warm festive lantern glow with animated holiday crests (`🎃`, `🎄`, `🎆`, `🦃`), or sculpted hanging ice crystals along folder rims |
| **Visceral & Elemental** | `fire_folders`, `screen_melt_ooze`, `slime_drip`, `molten_lava_melt`, `storm_wind`, `tesla_arcs` | Compiz roaring flames, Salvador Dalí dripping bio-slime, molten magma fissures, and high-voltage plasma arcs |
| **Gothic, Sci-Fi & Retro** | `horror_blood_moon`, `horror_vhs_static`, `void_tentacles`, `flash_3000_vector_hud`, `nerd_lcars_hud`, `nerd_arcane_runes` | Crimson gothic filigree, 2Advanced v3 vector targeting reticles, Starfleet LCARS bezels, and glowing arcane runes |
| **3D Motion & Luxury** | `spinning_3d_holo_folders`, `c4d_mograph_extrude_folders`, `houdini_procedural_vex_hud`, `swiss_sapphire_chronograph`, `kyoto_washi_sumi`, `carbon_kevlar_weave` | Cinema 4D beveled extrusions, Houdini VEX wireframe cages, 24K gold horology bezels, and tactile Washi paper |
| **Year 3000+ God-Mode** | `godmode_omega_halo`, `godmode_photonic_crystal`, `godmode_dyson_lattice`, `godmode_chrono_crystal`, `godmode_neural_synapse`, `godmode_zero_point_arc` | Post-singularity Dyson-sphere lattices, photonic waveguides, and zero-point energy halos |

---

## 4. 3D Icon Packs (`iconPackStyle` — 56 Packs) & Icons View Choreography

When the File Manager is switched to **Icons View (`#status-views button >> Icons` / `#list.view-icons`)**, every item renders at **`2.85rem` (`45.6px`)** inside a 3D stage card (`min-height: 118px`) with:
- **Sculpted 3D Folder Top Tabs (`::before`)** and **3D Pedestal Plates (`::after`)**.
- **Semantic Folder Detection (`folderIconTypeForName`):** Folders named `src`, `tests`, `docs`, `docker`, `ai-models`, `shaders`, `security-vault`, `camera-raw`, `music-stems`, `games`, `database`, `cloud`, etc. automatically receive bespoke 3D inner emblems.
- **Holiday Corner Crests (`data-holiday-crest` & `data-holiday-badge`):** All 18 `holiday_*` themes automatically mount a floating, bobbing holiday crest (`🎃`, `🎄`, `🎆`, `🦃`, `☘️`, `💝`, `🥂`, `🕎`, `🌼`, etc.) on the top-right corner of every 3D icon.

### Recommended `uiElementFx` + `iconPackStyle` + `iconAnimation` Triads

| Theme Archetype | `uiElementFx` | `iconPackStyle` | `iconAnimation` |
| :--- | :--- | :--- | :--- |
| **🎃 Halloween Ultra** | `holiday_festive_glow` | `us_holidays_festive` | `folder_3d_spin_turntable` |
| **❄️ Polar Night Ultra** | `cryo_frost` | `aurora_nordic_ice` or `cryo_crystal` | `raytraced_caustic_refraction` |
| **🍎 M4 Ultra Studio** | `xdr_titanium_folders` | `pro_studio_xdr` | `m4_liquid_metal_morph` |
| **🧛 Gothic Crypt Ultra** | `horror_blood_moon` | `horror_crypt` | `folder_3d_flip_origami` |
| **🔥 Compiz Hellfire** | `fire_folders` | `inferno_burn` | `fire_ember_flicker` |
| **🧪 Bio-Slime Melt** | `screen_melt_ooze` | `bio_slime` | `liquid_jelly_morph` |
| **🎯 Flash-3000 HUD** | `flash_3000_vector_hud` | `cyberdeck_matrix_hud` | `flash_2advanced_vector_hud` |
| **🎬 Cinema 4D Studio** | `c4d_mograph_extrude_folders` | `creative_cinema_8k` | `c4d_mograph_cloner_wave` |
| **⌚ 24K Gold Horology** | `swiss_sapphire_chronograph` | `royal_24k_gold_obsidian` | `clockwork_gear_tick` |
| **🌌 Year 3099 Omega** | `godmode_omega_halo` | `godmode_omni_pantheon` | `godmode_pantheon_ascend` |

---

## 5. Multi-Layer Atmosphere Composition (`atmosphere`)

- Combine up to **6 simultaneous particle/shader layers** using `+` (e.g. `"autumn_leaves+embers+fireflies"` or `"blizzard+aurora_australis"`).
- Fine-tune individual layers with `@speed`, `@density`, and `@opacity` modifiers (e.g. `"snow@speed=1.3,density=1.4+aurora_australis@opacity=0.85"`).
- Always pair `atmosphere` with a matching `vignette` (`"subtle"`, `"cinema"`, or `"ambient"`) so particles have depth against the window edges.

---

## 6. Theme Hacker Lab (`customVars` & Sanitized `customCss`)

For pixel-level mastery, every custom theme supports:
1. **`fx.customVars` (Up to 64 CSS Custom Property Overrides):**
   ```json
   "customVars": {
     "row-hover": "rgba(255, 109, 0, 0.16)",
     "focus-ring": "#ff9100"
   }
   ```
2. **`fx.customCss` (Up to 8,000 Characters of Sanitized CSS):**
   - Target `#list.view-icons .row[data-kind="dir"]` to add bespoke 3D drop shadows and inner specular highlights in Icons View.
   - **Security Guardrails:** External `url(...)`, `@import`, `<script>`, and `expression(...)` are automatically stripped by `sanitizeCustomCss()` so shared themes are 100% safe to paste.

---

## 7. Packaging & Sharing (`CCFM-THEME-v1:` & `CCFM-PACK-v1:`)

- **Single Theme Share Code (`CCFM-THEME-v1:<base64url>`):** Encodes a single `ThemeDraft` into a one-line string that users can copy from any GitHub README codeblock and paste directly into the File Manager with **`⌘V` / `Ctrl+V`**.
- **Multi-Theme Pack Share Code (`CCFM-PACK-v1:<base64url>`):** Bundles up to 50 themes into a single one-line string for 1-click collection installs.

---

## 8. 🤖 Customizing & Generating Themes with Google Gemini (`gemini.google.com`)

You can use **Google Gemini** (either via the built-in **🤖 Google Gemini AI Theme Customizer** inside **🎨 Theme → Share / Export / Import…** or by chatting in **[gemini.google.com](https://gemini.google.com)**) to design or remix custom themes for any hardware tier (`low`, `medium`, `high`, `ultra`).

### Copy-Paste Master Prompt for Google Gemini Chat

Copy the block below into **Google Gemini**, replace the last line with your dream theme idea and computer tier, and paste Gemini's JSON response straight into the Codecaine File Manager with **`⌘V` / `Ctrl+V`**:

```text
You are a Master UI/UX Theme Architect for the Codecaine File Manager.
Generate a valid Codecaine File Manager Custom Theme JSON object matching this exact schema:
{
  "format": "bun-rad-studio-file-manager-theme",
  "version": 1,
  "name": "Theme Name (MAX 40 chars)",
  "dark": true,
  "base": "Google Gemini AI Studio",
  "colors": {
    "background": "#0d0614",
    "text": "#fff4e6",
    "accent": "#ff6d00",
    "secondary": "#b388ff",
    "card": "#170b24",
    "border": "#3b1d54",
    "danger": "#ff3d00",
    "warning": "#ffab00",
    "success": "#00e676",
    "info": "#b388ff"
  },
  "fx": {
    "glow": "ember",
    "glowColor": "#ff6d00",
    "glowColor2": "#b388ff",
    "blur": 28,
    "glass": 0.72,
    "glowIntensity": 1,
    "borderOpacity": 0.34,
    "grain": "subtle",
    "scanlines": "none",
    "radius": "squircle",
    "border": "iridescent",
    "motion": "spring",
    "sheen": true,
    "noise": true,
    "chromatic": false,
    "ambient": true,
    "atmosphere": "autumn_leaves+embers+fireflies",
    "backdropStyle": "liquid",
    "cursorEffect": "spotlight",
    "vignette": "cinema",
    "saturation": 1.55,
    "uiElementFx": "holiday_festive_glow",
    "iconPackStyle": "us_holidays_festive",
    "fontProfile": "editorial",
    "cornerProfile": "squircle_hig",
    "iconGlow": "xdr_specular",
    "iconAnimation": "folder_3d_spin_turntable",
    "prismEdge": true,
    "innerGlow": true,
    "frostedRim": true
  }
}

Allowed values:
- Hardware Tier rules:
  * LOW (0% GPU): blur=0, glass=0, atmosphere="none", iconAnimation="off", motion="zero"
  * MEDIUM (60fps): blur=12, glass=0.52, 1 atmosphere layer (e.g. "snow", "autumn_leaves", "fireflies", "bokeh"), iconAnimation="spring_pop_3d" or "levitate_float"
  * HIGH (60-120Hz): blur=22, glass=0.66, 2 atmosphere layers joined with '+' (e.g. "snow+aurora_ribbons", "aurora_ribbons+bokeh", "data_rain+hud_reticle"), iconAnimation="orbital_halo_spin" or "holo_foil_shimmer"
  * ULTRA (120Hz 6K XDR): blur=28..32, glass=0.72..0.78, 3 atmosphere layers (e.g. "autumn_leaves+embers+fireflies", "blizzard+aurora_australis", "dragon_forge+embers+solar_flare"), iconAnimation="folder_3d_spin_turntable", "folder_3d_flip_origami", "c4d_mograph_cloner_wave", "m4_liquid_metal_morph", or "raytraced_caustic_refraction"
- uiElementFx: "off", "tahoe_glass_folders", "fluent_mica_folders", "xdr_titanium_folders", "cupertino_ceramic_bevel", "swiss_sapphire_chronograph", "kyoto_washi_sumi", "carbon_kevlar_weave", "fire_folders", "screen_melt_ooze", "cryo_frost", "storm_wind", "holiday_festive_glow", "horror_blood_moon", "flash_3000_vector_hud", "c4d_mograph_extrude_folders", "godmode_omega_halo"
- iconPackStyle: "default", "macos_sequoia_hig", "apple_vision_glass_3d", "pro_studio_xdr", "us_holidays_festive", "aurora_nordic_ice", "cryo_crystal", "inferno_burn", "bio_slime", "horror_crypt", "cyberdeck_matrix_hud", "creative_cinema_8k", "royal_24k_gold_obsidian", "kyoto_zen_ink", "dev_polyglot_pro", "bioluminescent_eden", "godmode_omni_pantheon"
- Contrast rule: Keep text vs background/card contrast >= 7.0:1 (WCAG AAA).

My Request: Create an ULTRA 120Hz 6K XDR theme combining Halloween Jack-O'-Lanterns and Polar Night Aurora Borealis with 3D spinning folders.
```
