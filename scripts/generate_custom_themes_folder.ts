/**
 * Generates the `/custom_themes/` directory with:
 * - Per-System Hardware Tier Packs (`low`, `medium`, `high`, `ultra`, and `all` 20 themes)
 * - Individual `.json` and `.ccfm.txt` files for all 20 Master Designer Custom Themes
 * - `us_holidays_18_ultra_pack.json` and `.ccfm.txt`
 * - Live Playwright screenshots (`custom_themes/screenshots/*.png`) of every single theme in Icons View (`#list.view-icons`)
 * - `custom_themes/README.md` with embedded screenshots, system-tier guides, and 1-click copy-paste `CCFM-PACK-v1:` / `CCFM-THEME-v1:` codeblocks
 * - `custom_themes/THEME_DESIGN_STYLE_GUIDE.md` — The Complete Professional Style Guide for Designing File Manager Themes
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Cdp, sleep } from "./lib/cdp_recorder";
import {
  MASTER_CUSTOM_THEMES,
  MASTER_CUSTOM_THEME_ENTRIES,
  ALL_US_HOLIDAY_ULTRA_THEME_KEYS,
  type HardwareTier,
  getMasterCustomThemesPackShareCode,
  getMasterCustomThemesPackJson,
  getMasterCustomThemeExports,
} from "../src/features/filemanager/fmMasterCustomThemes";
import {
  type ThemeDraft,
  validateDraft,
  encodeThemeShareCode,
  encodeThemePackShareCode,
  EXPORT_PACK_FORMAT,
} from "../src/features/filemanager/fmThemeStore";
import { sourceOf } from "../src/features/filemanager/fmThemes";
import { SIMPLEGUI_THEMES } from "../src/simplegui";
import { normalizeAtmosphereSpec } from "../resources/file_manager/ui/atmosphereCatalog.js";

const ROOT = path.resolve(import.meta.dir, "..");
const OUT_DIR = path.join(ROOT, "custom_themes");
const SHOTS_DIR = path.join(OUT_DIR, "screenshots");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(SHOTS_DIR, { recursive: true });

// 1. Write All-Systems Pack + Per-Tier Packs (`low`, `medium`, `high`, `ultra`)
const allPackJson = getMasterCustomThemesPackJson();
const allPackCode = getMasterCustomThemesPackShareCode();
fs.writeFileSync(path.join(OUT_DIR, "master_all_systems_20_themes_pack.json"), JSON.stringify(allPackJson, null, 2) + "\n");
fs.writeFileSync(path.join(OUT_DIR, "master_all_systems_20_themes_pack.ccfm.txt"), allPackCode + "\n");

// Keep `master_ultra_custom_themes_pack.json` as the Ultra pack alias + full pack compatibility
const tierFiles: Record<HardwareTier, string> = {
  low: "pack_tier_1_low_featherweight",
  medium: "pack_tier_2_medium_balanced_60fps",
  high: "pack_tier_3_high_spec_120hz",
  ultra: "pack_tier_4_ultra_6k_xdr_120hz",
};

const tierPackCodes: Record<HardwareTier, string> = {
  low: getMasterCustomThemesPackShareCode("low"),
  medium: getMasterCustomThemesPackShareCode("medium"),
  high: getMasterCustomThemesPackShareCode("high"),
  ultra: getMasterCustomThemesPackShareCode("ultra"),
};

for (const tier of ["low", "medium", "high", "ultra"] as const) {
  const baseName = tierFiles[tier];
  const json = getMasterCustomThemesPackJson(tier);
  const code = tierPackCodes[tier];
  fs.writeFileSync(path.join(OUT_DIR, `${baseName}.json`), JSON.stringify(json, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT_DIR, `${baseName}.ccfm.txt`), code + "\n");
}
// Also write `master_ultra_custom_themes_pack.json` & `.ccfm.txt`
fs.writeFileSync(
  path.join(OUT_DIR, "master_ultra_custom_themes_pack.json"),
  JSON.stringify(getMasterCustomThemesPackJson("ultra"), null, 2) + "\n"
);
fs.writeFileSync(path.join(OUT_DIR, "master_ultra_custom_themes_pack.ccfm.txt"), tierPackCodes.ultra + "\n");

// 2. Write individual Master Custom Theme JSON + CCFM files
const masterExports = getMasterCustomThemeExports();
for (const item of masterExports) {
  fs.writeFileSync(path.join(OUT_DIR, `${item.slug}.json`), JSON.stringify(item.jsonPayload, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT_DIR, `${item.slug}.ccfm.txt`), item.shareCode + "\n");
}

// 3. Build All 18 US Holiday Ultra Themes Pack + individual share codes
const HOLIDAY_META: Record<string, { crest: string; badge: string; burst: string; holiday: string }> = {
  holiday_new_years_times_square: { crest: "🥂", badge: "🎆", burst: "🥂 🎆 🎊 ✨ 🍾", holiday: "New Year's Eve (Jan 1)" },
  holiday_mlk_dream_memorial: { crest: "🕊️", badge: "🕯️", burst: "🕊️ 🕯️ ✨ 🌟 🤝", holiday: "MLK Jr. Day (Jan)" },
  holiday_valentines_velvet_rose: { crest: "💝", badge: "🌹", burst: "💝 🌹 💘 ✨ 🍫", holiday: "Valentine's Day (Feb 14)" },
  holiday_presidents_mount_rushmore: { crest: "🦅", badge: "🏛️", burst: "🦅 🏛️ ⭐ 🔔 📜", holiday: "Presidents' Day (Feb)" },
  holiday_st_patricks_emerald_clover: { crest: "☘️", badge: "🍀", burst: "☘️ 🍀 🪙 🌈 ✨", holiday: "St. Patrick's Day (Mar 17)" },
  holiday_easter_pastel_egg_hunt: { crest: "🥚", badge: "🐣", burst: "🥚 🐣 🐰 🌷 🌸", holiday: "Easter Sunday (Spring)" },
  holiday_mothers_day_botanical_tea: { crest: "🌸", badge: "🫖", burst: "🌸 🫖 💐 🌺 ✨", holiday: "Mother's Day (May)" },
  holiday_memorial_day_poppy_honor: { crest: "🌺", badge: "🎖️", burst: "🌺 🎖️ 🦅 ⭐ 🕯️", holiday: "Memorial Day (May)" },
  holiday_juneteenth_jubilee_star: { crest: "🌟", badge: "🎆", burst: "🌟 🎆 ✨ ❤️ 💛 💚", holiday: "Juneteenth (Jun 19)" },
  holiday_fathers_day_leather_den: { crest: "⌚", badge: "🧭", burst: "⌚ 🧭 🥃 🪵 ⭐", holiday: "Father's Day (Jun)" },
  holiday_fourth_of_july_fireworks: { crest: "🎆", badge: "🗽", burst: "🎆 🎇 🗽 🦅 ⭐", holiday: "Independence Day (Jul 4)" },
  holiday_labor_day_rivet_forge: { crest: "⚒️", badge: "⚙️", burst: "⚒️ ⚙️ 🔥 🏗️ ⭐", holiday: "Labor Day (Sep)" },
  holiday_halloween_jack_o_lantern: { crest: "🎃", badge: "🦇", burst: "🎃 🦇 👻 🕯️ 🕸️", holiday: "Halloween (Oct 31)" },
  holiday_dia_de_los_muertos_marigold: { crest: "🌼", badge: "💀", burst: "🌼 💀 🕯️ 🦋 🌺", holiday: "Día de los Muertos (Nov 1–2)" },
  holiday_veterans_day_valor_medallion: { crest: "🎖️", badge: "🦅", burst: "🎖️ 🦅 ⭐ 🛡️ 🕯️", holiday: "Veterans Day (Nov 11)" },
  holiday_thanksgiving_harvest_hearth: { crest: "🦃", badge: "🍁", burst: "🦃 🍁 🥧 🍂 🌽", holiday: "Thanksgiving (Nov)" },
  holiday_hanukkah_menorah_sapphire: { crest: "🕎", badge: "✡️", burst: "🕎 ✡️ ✨ 🪙 💙", holiday: "Hanukkah (Dec)" },
  holiday_christmas_nutcracker_hearth: { crest: "🎄", badge: "🎅", burst: "🎄 🎅 ❄️ 🎁 ⭐", holiday: "Christmas Day (Dec 25)" },
};

const holidayDrafts: Array<{
  key: string;
  draft: ThemeDraft;
  code: string;
  screenshotRelPath: string;
  meta: { crest: string; badge: string; burst: string; holiday: string };
}> = [];

for (const key of ALL_US_HOLIDAY_ULTRA_THEME_KEYS) {
  const sg = SIMPLEGUI_THEMES[key];
  if (!sg) throw new Error(`Missing built-in holiday theme: ${key}`);
  const src = sourceOf(sg);
  const fx = src.fx ? { ...src.fx, atmosphere: normalizeAtmosphereSpec(src.fx.atmosphere) || "none" } : undefined;
  const draft = validateDraft({
    name: sg.name.slice(0, 40),
    dark: src.dark,
    base: sg.name.slice(0, 40),
    colors: src.colors,
    fx,
  });
  holidayDrafts.push({
    key,
    draft,
    code: encodeThemeShareCode(draft),
    screenshotRelPath: `screenshots/${key}.png`,
    meta: HOLIDAY_META[key]!,
  });
}

const holidayPackCode = encodeThemePackShareCode(holidayDrafts.map((h) => h.draft));
const holidayPackJson = {
  format: EXPORT_PACK_FORMAT,
  version: 1,
  packName: "All 18 US Holiday Celebration 6K XDR Ultra Themes Pack",
  themes: holidayDrafts.map((h) => ({
    key: h.key,
    holiday: h.meta.holiday,
    folderCrest: h.meta.crest,
    fileBadge: h.meta.badge,
    celebrationBurst: h.meta.burst,
    screenshot: h.screenshotRelPath,
    ...h.draft,
  })),
};
fs.writeFileSync(path.join(OUT_DIR, "us_holidays_18_ultra_pack.json"), JSON.stringify(holidayPackJson, null, 2) + "\n");
fs.writeFileSync(path.join(OUT_DIR, "us_holidays_18_ultra_pack.ccfm.txt"), holidayPackCode + "\n");

// 4. Polar Night & Cryo-Glacier Icicle Storm share codes
const polarKeys = ["polar_night", "cryo_icicle_blizzard", "orbital_ice"] as const;
const polarExports = polarKeys.map((key) => {
  const sg = SIMPLEGUI_THEMES[key]!;
  const src = sourceOf(sg);
  const fx = src.fx ? { ...src.fx, atmosphere: normalizeAtmosphereSpec(src.fx.atmosphere) || "none" } : undefined;
  const draft = validateDraft({
    name: sg.name.slice(0, 40),
    dark: src.dark,
    base: sg.name.slice(0, 40),
    colors: src.colors,
    fx,
  });
  return {
    key,
    name: sg.name,
    screenshotRelPath: `screenshots/${key}.png`,
    draft,
    code: encodeThemeShareCode(draft),
  };
});

// 5. Generate custom_themes/THEME_DESIGN_STYLE_GUIDE.md
const styleGuideLines: string[] = [
  "# 📐 Codecaine File Manager — Professional Theme Design & Architecture Style Guide",
  "",
  "> **From Zero-Watt Featherweight Systems (`low`) to 120Hz ProMotion 6K XDR Flagships (`ultra`)**",
  "",
  "This style guide documents the engineering principles, color science, GPU shader budgeting, 3D folder iconography, and CSS variable architecture used to craft professional themes for the **Codecaine File Manager**.",
  "",
  "---",
  "",
  "## 1. System Hardware Tier Budgeting (`low` · `medium` · `high` · `ultra`)",
  "",
  "A professional theme designer never forces a single heavy shader budget onto every machine. Always classify your theme into one of four **Hardware Tiers** so users on any computer get a locked framerate:",
  "",
  "| Tier | Target Hardware | Backdrop Blur (`blur`) | Glass Opacity (`glass`) | Atmosphere Layers (`atmosphere`) | 3D Icon Animation (`iconAnimation`) | Motion Profile (`motion`) |",
  "| :--- | :--- | :-: | :-: | :--- | :--- | :-: |",
  "| **🟢 `low`** | Raspberry Pi, Chromebook, Intel N100, Remote VNC/SSH, Laptop Battery Saver | `0` (Zero GPU blur) | `0` (Opaque matte/OLED) | `\"none\"` (0 canvas particles) | `\"off\"` (Static crisp 3D SVG icons) | `\"zero\"` or `\"calm\"` |",
  "| **🟡 `medium`** | MacBook Air M1/M2/M3, Ultrabooks, Surface Pro, Steam Deck (60Hz) | `10` – `14` px | `0.45` – `0.55` | **1 lightweight layer** (`bokeh`, `snow`, `autumn_leaves`, `fireflies`) | Gentle 2D/3D (`spring_pop_3d`, `levitate_float`) | `\"calm\"` or `\"spring\"` |",
  "| **🟠 `high`** | MacBook Pro M3/M4 Pro, iMac 24\", Desktop RTX 3060–4070 / Radeon RX (60–120Hz) | `20` – `24` px | `0.62` – `0.68` | **2 combined layers** (`aurora_ribbons+bokeh`, `snow+aurora_ribbons`, `data_rain+hud_reticle`) | Active 3D (`holo_foil_shimmer`, `orbital_halo_spin`, `clockwork_gear_tick`) | `\"spring\"` or `\"cinematic\"` |",
  "| **🔴 `ultra`** | **Apple Mac Studio M4 Ultra (32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K @ 120Hz)**, RTX 4090/5090 | `26` – `32` px | `0.70` – `0.78` | **3 to 6 combined layers** (`autumn_leaves+embers+fireflies`, `blizzard+aurora_australis`, `supernova_remnant+tesseract_4d+aurora_australis`) | Full 120Hz 3D Turntable / Origami / Cube / C4D (`folder_3d_spin_turntable`, `folder_3d_flip_origami`, `c4d_mograph_cloner_wave`, `m4_liquid_metal_morph`) | `\"spring\"`, `\"snappy\"`, or `\"elastic\"` |",
  "",
  "---",
  "",
  "## 2. Color Science & WCAG AA/AAA Legibility Rules",
  "",
  "Every theme defines **3 required hex colors** and **7 optional semantic hex colors**:",
  "",
  "```json",
  "\"colors\": {",
  "  \"background\": \"#0d0614\",",
  "  \"text\":       \"#fff4e6\",",
  "  \"accent\":     \"#ff6d00\",",
  "  \"secondary\":  \"#b388ff\",",
  "  \"card\":       \"#170b24\",",
  "  \"border\":     \"#3b1d54\",",
  "  \"danger\":     \"#ff3d00\",",
  "  \"warning\":    \"#ffab00\",",
  "  \"success\":    \"#00e676\",",
  "  \"info\":       \"#b388ff\"",
  "}",
  "```",
  "",
  "### Golden Rules of Palette Engineering",
  "1. **Primary Body Contrast ≥ 7.0:1 (WCAG AAA):** Keep `text` against both `background` and `card` above **7.0:1** (10:1+ preferred for 6K XDR studio monitors). The File Manager's `fmThemes.ts` engine automatically audits contrast and lifts/darkens tokens that fall below **4.5:1 (WCAG AA)**.",
  "2. **Card Elevation Step (`card` vs `background`):**",
  "   - **Dark Themes (`dark: true`):** Make `card` **4% to 8% lighter** in relative luminance than `background` (e.g. `#050d17` background → `#0a1829` card) so panels, sidebars, and 3D folder plates separate cleanly without relying solely on borders.",
  "   - **Light Themes (`dark: false`):** Set `background` to a soft tinted paper/glacier tone (`#f2f8ff` or `#faf7f0`) and `card` to pure crisp `#ffffff` so cards float naturally above the workspace.",
  "3. **Complementary Dual-Glow Pairing (`glowColor` + `glowColor2`):** Pair a warm or primary `glowColor` with a cool or harmonic `glowColor2` (e.g., Halloween `#ff6d00` pumpkin amber + `#b388ff` witching-hour violet; Polar `#64ffda` aurora mint + `#80d8ff` glacier cyan).",
  "4. **Semantic Distinctness:** Never make `danger`, `warning`, and `success` the same hue as `accent`. Keep `danger` in the crimson/coral family, `warning` in amber/gold, and `success` in emerald/mint so destructive prompts (`Delete`, `Bury (Rip)`) and audit badges remain unmistakable.",
  "",
  "---",
  "",
  "## 3. Sculpted 3D Folder Shaders (`uiElementFx` — 44 Shaders)",
  "",
  "The `fx.uiElementFx` property transforms every folder row and **Icons View (`#list.view-icons`)** tile into a physical 3D material with custom top-tab geometry, specular rim lighting, and animated surface shaders:",
  "",
  "| Category | `uiElementFx` Keys | Visual Signature |",
  "| :--- | :--- | :--- |",
  "| **Apple / Desktop Pro** | `tahoe_glass_folders`, `cupertino_ceramic_bevel`, `xdr_titanium_folders`, `fluent_mica_folders`, `google_material_folders` | Specular refractive glass, CNC-machined titanium chamfers, and layered mica elevation |",
  "| **Holiday & Seasonal** | `holiday_festive_glow`, `cryo_frost` | Warm festive lantern glow with animated holiday crests (`🎃`, `🎄`, `🎆`, `🦃`), or sculpted hanging ice crystals along folder rims |",
  "| **Visceral & Elemental** | `fire_folders`, `screen_melt_ooze`, `slime_drip`, `molten_lava_melt`, `storm_wind`, `tesla_arcs` | Compiz roaring flames, Salvador Dalí dripping bio-slime, molten magma fissures, and high-voltage plasma arcs |",
  "| **Gothic, Sci-Fi & Retro** | `horror_blood_moon`, `horror_vhs_static`, `void_tentacles`, `flash_3000_vector_hud`, `nerd_lcars_hud`, `nerd_arcane_runes` | Crimson gothic filigree, 2Advanced v3 vector targeting reticles, Starfleet LCARS bezels, and glowing arcane runes |",
  "| **3D Motion & Luxury** | `spinning_3d_holo_folders`, `c4d_mograph_extrude_folders`, `houdini_procedural_vex_hud`, `swiss_sapphire_chronograph`, `kyoto_washi_sumi`, `carbon_kevlar_weave` | Cinema 4D beveled extrusions, Houdini VEX wireframe cages, 24K gold horology bezels, and tactile Washi paper |",
  "| **Year 3000+ God-Mode** | `godmode_omega_halo`, `godmode_photonic_crystal`, `godmode_dyson_lattice`, `godmode_chrono_crystal`, `godmode_neural_synapse`, `godmode_zero_point_arc` | Post-singularity Dyson-sphere lattices, photonic waveguides, and zero-point energy halos |",
  "",
  "---",
  "",
  "## 4. 3D Icon Packs (`iconPackStyle` — 56 Packs) & Icons View Choreography",
  "",
  "When the File Manager is switched to **Icons View (`#status-views button >> Icons` / `#list.view-icons`)**, every item renders at **`2.85rem` (`45.6px`)** inside a 3D stage card (`min-height: 118px`) with:",
  "- **Sculpted 3D Folder Top Tabs (`::before`)** and **3D Pedestal Plates (`::after`)**.",
  "- **Semantic Folder Detection (`folderIconTypeForName`):** Folders named `src`, `tests`, `docs`, `docker`, `ai-models`, `shaders`, `security-vault`, `camera-raw`, `music-stems`, `games`, `database`, `cloud`, etc. automatically receive bespoke 3D inner emblems.",
  "- **Holiday Corner Crests (`data-holiday-crest` & `data-holiday-badge`):** All 18 `holiday_*` themes automatically mount a floating, bobbing holiday crest (`🎃`, `🎄`, `🎆`, `🦃`, `☘️`, `💝`, `🥂`, `🕎`, `🌼`, etc.) on the top-right corner of every 3D icon.",
  "",
  "### Recommended `uiElementFx` + `iconPackStyle` + `iconAnimation` Triads",
  "",
  "| Theme Archetype | `uiElementFx` | `iconPackStyle` | `iconAnimation` |",
  "| :--- | :--- | :--- | :--- |",
  "| **🎃 Halloween Ultra** | `holiday_festive_glow` | `us_holidays_festive` | `folder_3d_spin_turntable` |",
  "| **❄️ Polar Night Ultra** | `cryo_frost` | `aurora_nordic_ice` or `cryo_crystal` | `raytraced_caustic_refraction` |",
  "| **🍎 M4 Ultra Studio** | `xdr_titanium_folders` | `pro_studio_xdr` | `m4_liquid_metal_morph` |",
  "| **🧛 Gothic Crypt Ultra** | `horror_blood_moon` | `horror_crypt` | `folder_3d_flip_origami` |",
  "| **🔥 Compiz Hellfire** | `fire_folders` | `inferno_burn` | `fire_ember_flicker` |",
  "| **🧪 Bio-Slime Melt** | `screen_melt_ooze` | `bio_slime` | `liquid_jelly_morph` |",
  "| **🎯 Flash-3000 HUD** | `flash_3000_vector_hud` | `cyberdeck_matrix_hud` | `flash_2advanced_vector_hud` |",
  "| **🎬 Cinema 4D Studio** | `c4d_mograph_extrude_folders` | `creative_cinema_8k` | `c4d_mograph_cloner_wave` |",
  "| **⌚ 24K Gold Horology** | `swiss_sapphire_chronograph` | `royal_24k_gold_obsidian` | `clockwork_gear_tick` |",
  "| **🌌 Year 3099 Omega** | `godmode_omega_halo` | `godmode_omni_pantheon` | `godmode_pantheon_ascend` |",
  "",
  "---",
  "",
  "## 5. Multi-Layer Atmosphere Composition (`atmosphere`)",
  "",
  "- Combine up to **6 simultaneous particle/shader layers** using `+` (e.g. `\"autumn_leaves+embers+fireflies\"` or `\"blizzard+aurora_australis\"`).",
  "- Fine-tune individual layers with `@speed`, `@density`, and `@opacity` modifiers (e.g. `\"snow@speed=1.3,density=1.4+aurora_australis@opacity=0.85\"`).",
  "- Always pair `atmosphere` with a matching `vignette` (`\"subtle\"`, `\"cinema\"`, or `\"ambient\"`) so particles have depth against the window edges.",
  "",
  "---",
  "",
  "## 6. Theme Hacker Lab (`customVars` & Sanitized `customCss`)",
  "",
  "For pixel-level mastery, every custom theme supports:",
  "1. **`fx.customVars` (Up to 64 CSS Custom Property Overrides):**",
  "   ```json",
  "   \"customVars\": {",
  "     \"row-hover\": \"rgba(255, 109, 0, 0.16)\",",
  "     \"focus-ring\": \"#ff9100\"",
  "   }",
  "   ```",
  "2. **`fx.customCss` (Up to 8,000 Characters of Sanitized CSS):**",
  "   - Target `#list.view-icons .row[data-kind=\"dir\"]` to add bespoke 3D drop shadows and inner specular highlights in Icons View.",
  "   - **Security Guardrails:** External `url(...)`, `@import`, `<script>`, and `expression(...)` are automatically stripped by `sanitizeCustomCss()` so shared themes are 100% safe to paste.",
  "",
  "---",
  "",
  "## 7. Packaging & Sharing (`CCFM-THEME-v1:` & `CCFM-PACK-v1:`)",
  "",
  "- **Single Theme Share Code (`CCFM-THEME-v1:<base64url>`):** Encodes a single `ThemeDraft` into a one-line string that users can copy from any GitHub README codeblock and paste directly into the File Manager with **`⌘V` / `Ctrl+V`**.",
  "- **Multi-Theme Pack Share Code (`CCFM-PACK-v1:<base64url>`):** Bundles up to 50 themes into a single one-line string for 1-click collection installs.",
  "",
  "---",
  "",
  "## 8. 🤖 Customizing & Generating Themes with Google Gemini (`gemini.google.com`)",
  "",
  "You can use **Google Gemini** (either via the built-in **🤖 Google Gemini AI Theme Customizer** inside **🎨 Theme → Share / Export / Import…** or by chatting in **[gemini.google.com](https://gemini.google.com)**) to design or remix custom themes for any hardware tier (`low`, `medium`, `high`, `ultra`).",
  "",
  "### Copy-Paste Master Prompt for Google Gemini Chat",
  "",
  "Copy the block below into **Google Gemini**, replace the last line with your dream theme idea and computer tier, and paste Gemini's JSON response straight into the Codecaine File Manager with **`⌘V` / `Ctrl+V`**:",
  "",
  "```text",
  "You are a Master UI/UX Theme Architect for the Codecaine File Manager.",
  "Generate a valid Codecaine File Manager Custom Theme JSON object matching this exact schema:",
  "{",
  "  \"format\": \"bun-rad-studio-file-manager-theme\",",
  "  \"version\": 1,",
  "  \"name\": \"Theme Name (MAX 40 chars)\",",
  "  \"dark\": true,",
  "  \"base\": \"Google Gemini AI Studio\",",
  "  \"colors\": {",
  "    \"background\": \"#0d0614\",",
  "    \"text\": \"#fff4e6\",",
  "    \"accent\": \"#ff6d00\",",
  "    \"secondary\": \"#b388ff\",",
  "    \"card\": \"#170b24\",",
  "    \"border\": \"#3b1d54\",",
  "    \"danger\": \"#ff3d00\",",
  "    \"warning\": \"#ffab00\",",
  "    \"success\": \"#00e676\",",
  "    \"info\": \"#b388ff\"",
  "  },",
  "  \"fx\": {",
  "    \"glow\": \"ember\",",
  "    \"glowColor\": \"#ff6d00\",",
  "    \"glowColor2\": \"#b388ff\",",
  "    \"blur\": 28,",
  "    \"glass\": 0.72,",
  "    \"glowIntensity\": 1,",
  "    \"borderOpacity\": 0.34,",
  "    \"grain\": \"subtle\",",
  "    \"scanlines\": \"none\",",
  "    \"radius\": \"squircle\",",
  "    \"border\": \"iridescent\",",
  "    \"motion\": \"spring\",",
  "    \"sheen\": true,",
  "    \"noise\": true,",
  "    \"chromatic\": false,",
  "    \"ambient\": true,",
  "    \"atmosphere\": \"autumn_leaves+embers+fireflies\",",
  "    \"backdropStyle\": \"liquid\",",
  "    \"cursorEffect\": \"spotlight\",",
  "    \"vignette\": \"cinema\",",
  "    \"saturation\": 1.55,",
  "    \"uiElementFx\": \"holiday_festive_glow\",",
  "    \"iconPackStyle\": \"us_holidays_festive\",",
  "    \"fontProfile\": \"editorial\",",
  "    \"cornerProfile\": \"squircle_hig\",",
  "    \"iconGlow\": \"xdr_specular\",",
  "    \"iconAnimation\": \"folder_3d_spin_turntable\",",
  "    \"prismEdge\": true,",
  "    \"innerGlow\": true,",
  "    \"frostedRim\": true",
  "  }",
  "}",
  "",
  "Allowed values:",
  "- Hardware Tier rules:",
  "  * LOW (0% GPU): blur=0, glass=0, atmosphere=\"none\", iconAnimation=\"off\", motion=\"zero\"",
  "  * MEDIUM (60fps): blur=12, glass=0.52, 1 atmosphere layer (e.g. \"snow\", \"autumn_leaves\", \"fireflies\", \"bokeh\"), iconAnimation=\"spring_pop_3d\" or \"levitate_float\"",
  "  * HIGH (60-120Hz): blur=22, glass=0.66, 2 atmosphere layers joined with '+' (e.g. \"snow+aurora_ribbons\", \"aurora_ribbons+bokeh\", \"data_rain+hud_reticle\"), iconAnimation=\"orbital_halo_spin\" or \"holo_foil_shimmer\"",
  "  * ULTRA (120Hz 6K XDR): blur=28..32, glass=0.72..0.78, 3 atmosphere layers (e.g. \"autumn_leaves+embers+fireflies\", \"blizzard+aurora_australis\", \"dragon_forge+embers+solar_flare\"), iconAnimation=\"folder_3d_spin_turntable\", \"folder_3d_flip_origami\", \"c4d_mograph_cloner_wave\", \"m4_liquid_metal_morph\", or \"raytraced_caustic_refraction\"",
  "- uiElementFx: \"off\", \"tahoe_glass_folders\", \"fluent_mica_folders\", \"xdr_titanium_folders\", \"cupertino_ceramic_bevel\", \"swiss_sapphire_chronograph\", \"kyoto_washi_sumi\", \"carbon_kevlar_weave\", \"fire_folders\", \"screen_melt_ooze\", \"cryo_frost\", \"storm_wind\", \"holiday_festive_glow\", \"horror_blood_moon\", \"flash_3000_vector_hud\", \"c4d_mograph_extrude_folders\", \"godmode_omega_halo\"",
  "- iconPackStyle: \"default\", \"macos_sequoia_hig\", \"apple_vision_glass_3d\", \"pro_studio_xdr\", \"us_holidays_festive\", \"aurora_nordic_ice\", \"cryo_crystal\", \"inferno_burn\", \"bio_slime\", \"horror_crypt\", \"cyberdeck_matrix_hud\", \"creative_cinema_8k\", \"royal_24k_gold_obsidian\", \"kyoto_zen_ink\", \"dev_polyglot_pro\", \"bioluminescent_eden\", \"godmode_omni_pantheon\"",
  "- Contrast rule: Keep text vs background/card contrast >= 7.0:1 (WCAG AAA).",
  "",
  "My Request: Create an ULTRA 120Hz 6K XDR theme combining Halloween Jack-O'-Lanterns and Polar Night Aurora Borealis with 3D spinning folders.",
  "```",
];

fs.writeFileSync(path.join(OUT_DIR, "THEME_DESIGN_STYLE_GUIDE.md"), styleGuideLines.join("\n") + "\n");

// 6. Capture Live Screenshots in Icons View (`#list.view-icons`) if `--skip-screenshots` is not set
async function captureAllThemeScreenshots() {
  if (process.argv.includes("--skip-screenshots")) {
    console.log("Skipping screenshot capture (--skip-screenshots).");
    return;
  }
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fm-theme-shots-"));
  const homeDir = path.join(tmpRoot, "home");
  const dataDir = path.join(tmpRoot, "data");
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  // Seed rich semantic folders & files so Icons View looks like a pro workstation
  const dirs = [
    "Projects",
    "ai-models",
    "shaders",
    "docker",
    "camera-raw",
    "music-stems",
    "security-vault",
    "games",
    "Documents",
    "Pictures",
  ];
  for (const d of dirs) {
    fs.mkdirSync(path.join(homeDir, d), { recursive: true });
    fs.writeFileSync(path.join(homeDir, d, "README.md"), `# ${d}\n`);
  }
  fs.writeFileSync(path.join(homeDir, "render_pipeline.ts"), "export const fps = 120;\n");
  fs.writeFileSync(path.join(homeDir, "studio_config.json"), JSON.stringify({ tier: "ultra", display: "6K XDR" }, null, 2));
  fs.writeFileSync(path.join(homeDir, "soundtrack_master.wav"), "RIFF....WAVEfmt ");
  fs.writeFileSync(path.join(homeDir, "release_bundle.tar.gz"), "gzip-archive-placeholder");

  // Pre-seed all 20 Master Custom Themes into `file_manager_themes.json`
  fs.writeFileSync(
    path.join(dataDir, "file_manager_themes.json"),
    JSON.stringify({ version: 1, themes: MASTER_CUSTOM_THEMES }, null, 2)
  );
  fs.writeFileSync(
    path.join(dataDir, "file_manager.json"),
    JSON.stringify(
      {
        theme: "dark",
        palette: "holiday_halloween_jack_o_lantern",
        view: "icons",
        showHidden: false,
        sortBy: "name",
        sortDir: "asc",
        atmosphereTier: "ultra",
        themeIconAnimation: "folder_3d_spin_turntable",
        seenWelcome: true,
        favoriteThemes: [
          "holiday_halloween_jack_o_lantern",
          "polar_night",
          ...MASTER_CUSTOM_THEMES.slice(0, 6).map((t) => t.id),
        ],
      },
      null,
      2
    )
  );

  // Start ephemeral File Manager server
  const port = 49100 + Math.floor(Math.random() * 800);
  const cdpPort = 9440 + Math.floor(Math.random() * 200);
  const chromeDir = path.join(tmpRoot, "chrome");
  const proc = Bun.spawn(
    [
      process.execPath,
      path.join(ROOT, "applications", "file_manager_studio.ts"),
      "--server",
      "--port",
      String(port),
      "--home",
      homeDir,
      "--data-dir",
      dataDir,
      "--path",
      homeDir,
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FM_SHOWCASE_MAC_ULTRA: "1",
      },
      stdout: "ignore",
      stderr: "ignore",
    }
  );

  const baseUrl = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(baseUrl);
      if (r.ok) break;
    } catch {}
    await sleep(150);
  }

  const cdp = await Cdp.launch(cdpPort, chromeDir, 1280, 720);
  try {
    await cdp.goto(baseUrl);
    await sleep(500);

    // Ensure Icons View is active and select "Projects" so the 3D selection plate is visible
    await cdp.eval(`(() => {
      const btn = [...document.querySelectorAll("#status-views button")].find((b) => (b.textContent || "").includes("Icons"));
      if (btn) btn.click();
    })()`);
    await sleep(300);

    const applyAndShoot = async (
      themeKey: string,
      outPngPath: string,
      opts: { tier?: HardwareTier; iconAnim?: string } = {}
    ) => {
      const atmoTier = opts.tier === "low" ? "low" : opts.tier === "medium" ? "medium" : opts.tier === "high" ? "high" : "ultra";
      fs.writeFileSync(
        path.join(dataDir, "file_manager.json"),
        JSON.stringify(
          {
            theme: "dark",
            palette: themeKey,
            view: "icons",
            showHidden: false,
            sortBy: "name",
            sortDir: "asc",
            seenWelcome: true,
            atmosphereTier: atmoTier,
            themeIconAnimation: opts.iconAnim || "off",
            favoriteThemes: [
              "holiday_halloween_jack_o_lantern",
              "polar_night",
              ...MASTER_CUSTOM_THEMES.slice(0, 6).map((t) => t.id),
            ],
          },
          null,
          2
        )
      );
      await cdp.goto(baseUrl);
      await cdp.eval(`(() => {
        const btn = [...document.querySelectorAll("#status-views button")].find((b) => (b.textContent || "").includes("Icons"));
        if (btn) btn.click();
        const row = document.querySelector('#list .row[data-name="Projects"]') || document.querySelector("#list .row");
        if (row) row.click();
        document.querySelectorAll("div").forEach((d) => {
          if (d.style && d.style.zIndex === "2147483647") d.style.display = "none";
        });
      })()`);
      await sleep(320);
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(outPngPath, Buffer.from(shot.data, "base64"));
    };

    console.log("Capturing screenshots for all 20 Master Custom Themes (Low · Medium · High · Ultra)...");
    for (const item of masterExports) {
      const pngPath = path.join(OUT_DIR, item.screenshotRelPath);
      await applyAndShoot(item.id, pngPath, {
        tier: item.tier,
        iconAnim: item.theme.fx?.iconAnimation || "off",
      });
      console.log(`  ✓ ${item.screenshotRelPath}`);
    }

    console.log("Capturing screenshots for Polar Night & Cryo-Glacier themes...");
    for (const p of polarExports) {
      const pngPath = path.join(OUT_DIR, p.screenshotRelPath);
      await applyAndShoot(p.key, pngPath, {
        tier: "ultra",
        iconAnim: "raytraced_caustic_refraction",
      });
      console.log(`  ✓ ${p.screenshotRelPath}`);
    }

    console.log("Capturing screenshots for all 18 US Holiday Celebration Ultra themes...");
    for (const h of holidayDrafts) {
      const pngPath = path.join(OUT_DIR, h.screenshotRelPath);
      await applyAndShoot(h.key, pngPath, {
        tier: "ultra",
        iconAnim: "folder_3d_spin_turntable",
      });
      console.log(`  ✓ ${h.screenshotRelPath}`);
    }
  } finally {
    cdp.close();
    try {
      proc.kill(9);
    } catch {}
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  }
}

await captureAllThemeScreenshots();

// 7. Generate custom_themes/README.md with embedded screenshots + system tiers + style guide
const tierSections: Array<{
  tier: HardwareTier;
  badge: string;
  title: string;
  subtitle: string;
  packFile: string;
  packCode: string;
}> = [
  {
    tier: "low",
    badge: "🟢 LOW-END / FEATHERWEIGHT TIER",
    title: "Tier 1: Low-End & Featherweight Systems (`low` — 0% GPU · Zero Blur · Battery Saver)",
    subtitle:
      "Engineered for **Raspberry Pi, Chromebooks, Intel Celeron/N100, older laptops, remote VNC/SSH sessions, and OLED Battery-Saver mode**. Uses `blur: 0`, `glass: 0`, `atmosphere: \"none\"`, and `motion: \"zero\"` for instant 60fps response with custom 3D SVG iconography and WCAG AAA contrast.",
    packFile: "pack_tier_1_low_featherweight.json",
    packCode: tierPackCodes.low,
  },
  {
    tier: "medium",
    badge: "🟡 MEDIUM BALANCED TIER",
    title: "Tier 2: Medium Balanced Systems (`medium` — Smooth 60fps · Moderate Glass & 1-Layer FX)",
    subtitle:
      "Engineered for **MacBook Air (M1/M2/M3), Surface Pro, ThinkPad X1 Carbon, Steam Deck, and everyday integrated-GPU laptops**. Uses `blur: 12–14px`, `glass: 0.50–0.55`, a single lightweight particle layer (`bokeh`, `snow`, `autumn_leaves`, `fireflies`), and gentle spring icon motion.",
    packFile: "pack_tier_2_medium_balanced_60fps.json",
    packCode: tierPackCodes.medium,
  },
  {
    tier: "high",
    badge: "🟠 HIGH-SPEC TIER",
    title: "Tier 3: High-Spec Systems (`high` — 60–120Hz · Dual-Layer Shaders & Sculpted 3D Folders)",
    subtitle:
      "Engineered for **MacBook Pro (M3/M4 Pro), iMac 24\", and desktop RTX 3060–4070 / Radeon RX workstations**. Uses `blur: 20–24px`, `glass: 0.64–0.68`, dual-layer atmospheres (`aurora_ribbons+bokeh`, `snow+aurora_ribbons`, `data_rain+hud_reticle`, `gold_dust+bokeh`), and active 3D icon animations.",
    packFile: "pack_tier_3_high_spec_120hz.json",
    packCode: tierPackCodes.high,
  },
  {
    tier: "ultra",
    badge: "🔴 ULTRA FLAGSHIP TIER",
    title: "Tier 4: Ultra Flagship Systems (`ultra` — Uncapped 120Hz ProMotion 6K XDR · 3-Layer Shaders & 3D Turntable Icons)",
    subtitle:
      "Engineered for **🍎 Apple Mac Studio M4 Ultra (32-Core CPU · 80-Core GPU · 32-Core Neural Engine · 192GB Unified Memory · Pro Display XDR 6K @ 120Hz ProMotion)** and flagship desktop GPUs. Uses `blur: 26–32px`, `glass: 0.68–0.78`, 3-layer WebGL/Canvas atmospheres, visceral 3D folder shaders, and 120Hz 3D spinning turntable/origami/liquid-metal icon animations.",
    packFile: "pack_tier_4_ultra_6k_xdr_120hz.json",
    packCode: tierPackCodes.ultra,
  },
];

const readmeLines: string[] = [
  "# 🎨 Codecaine File Manager — Master Custom Themes Vault (Low · Medium · High · Ultra) + Professional Style Guide",
  "",
  "> **Showcase Workstation Benchmark:** `🍎 Apple Mac Studio M4 Ultra · 32-Core CPU · 80-Core GPU · 32-Core Neural Engine · 192GB Unified Memory · Apple Pro Display XDR 6K @ 120Hz ProMotion`  ",
  "> **Universal Hardware Coverage:** Includes dedicated custom themes and 1-click packs for **🟢 Low-End (`low`)**, **🟡 Medium (`medium`)**, **🟠 High-Spec (`high`)**, and **🔴 Ultra Flagship (`ultra`)** computers — plus **live Icons View screenshots** of every single theme!",
  "",
  "## 📑 Quick Navigation",
  "- [⚡ How to Import in 2 Seconds (Copy Codeblock & Press `⌘V`)](#-how-to-import-in-2-seconds-copy-codeblock--press-v)",
  "- [📦 1-Click Master Packs by System Tier (`low` · `medium` · `high` · `ultra` · `all`)](#-1-click-master-packs-by-system-tier-low--medium--high--ultra--all)",
  "- [🟢 Tier 1: Low-End / Featherweight Custom Themes (4 Themes + Screenshots)](#tier-1-low-end--featherweight-systems-low--0-gpu--zero-blur--battery-saver)",
  "- [🟡 Tier 2: Medium Balanced 60fps Custom Themes (4 Themes + Screenshots)](#tier-2-medium-balanced-systems-medium--smooth-60fps--moderate-glass--1-layer-fx)",
  "- [🟠 Tier 3: High-Spec 60–120Hz Custom Themes (4 Themes + Screenshots)](#tier-3-high-spec-systems-high--60120hz--dual-layer-shaders--sculpted-3d-folders)",
  "- [🔴 Tier 4: Ultra Flagship 6K XDR 120Hz Custom Themes (8 Themes + Screenshots)](#tier-4-ultra-flagship-systems-ultra--uncapped-120hz-promotion-6k-xdr--3-layer-shaders--3d-turntable-icons)",
  "- [❄️ Polar Night & Cryo-Glacier Collection (3 Themes + Screenshots)](#-polar-night--cryo-glacier-6k-ultra-collection)",
  "- [🎃🎆🎄 All 18 US Holiday Celebration Ultra Themes (18 Themes + Screenshots)](#-all-18-us-holiday-celebration-6k-ultra-themes-holiday_)",
  "- [📐 Professional Theme Design & Architecture Style Guide](#-professional-theme-design--architecture-style-guide)",
  "",
  "---",
  "",
  "## ⚡ How to Import in 2 Seconds (Copy Codeblock & Press `⌘V`)",
  "",
  "1. **Click the Copy icon** in the top-right corner of **any `CCFM-PACK-v1:` or `CCFM-THEME-v1:` codeblock** below.",
  "2. In the **Codecaine File Manager**, click **🎨 Theme** in the top toolbar and click **Paste theme (`⌘V`)** (or press **`⌘V` / `Ctrl+V`** anywhere inside the Theme Picker / Theme Editor).",
  "3. Prefer `.json` files? Click **Import…** in the Theme Picker and select any `.json` file from this [`custom_themes/`](./) directory.",
  "",
  "---",
  "",
  "## 📦 1-Click Master Packs by System Tier (`low` · `medium` · `high` · `ultra` · `all`)",
  "",
  "| System Tier | Themes Included | Target Computers | JSON Pack File |",
  "| :--- | :-: | :--- | :--- |",
  "| **🌐 Complete All-Systems Pack** | **20** | All 4 tiers (`low` + `medium` + `high` + `ultra`) | [`master_all_systems_20_themes_pack.json`](./master_all_systems_20_themes_pack.json) |",
  "| **🟢 Tier 1: Low-End / Featherweight** | **4** | Raspberry Pi, Chromebook, Intel N100, VNC/SSH, Battery Saver (0% GPU) | [`pack_tier_1_low_featherweight.json`](./pack_tier_1_low_featherweight.json) |",
  "| **🟡 Tier 2: Medium Balanced (60fps)** | **4** | MacBook Air M1/M2/M3, Surface Pro, ThinkPad, Steam Deck | [`pack_tier_2_medium_balanced_60fps.json`](./pack_tier_2_medium_balanced_60fps.json) |",
  "| **🟠 Tier 3: High-Spec (60–120Hz)** | **4** | MacBook Pro M3/M4 Pro, iMac 24\", Desktop RTX/Radeon Workstations | [`pack_tier_3_high_spec_120hz.json`](./pack_tier_3_high_spec_120hz.json) |",
  "| **🔴 Tier 4: Ultra Flagship (120Hz 6K XDR)** | **8** | **Mac Studio M4 Ultra (32c CPU · 80c GPU · 192GB)**, RTX 4090/5090 | [`pack_tier_4_ultra_6k_xdr_120hz.json`](./pack_tier_4_ultra_6k_xdr_120hz.json) |",
  "| **🎃🎆🎄 All 18 US Holidays Ultra Pack** | **18** | All 18 US Holiday Celebration themes with 3D folder crests & bursts | [`us_holidays_18_ultra_pack.json`](./us_holidays_18_ultra_pack.json) |",
  "",
  "### 🌐 Copy All 20 Custom Themes (Low + Medium + High + Ultra) in One Paste (`CCFM-PACK-v1`)",
  "",
  "```text",
  allPackCode,
  "```",
  "",
  "---",
  "",
];

// Render each of the 4 System Tiers with their Pack codeblock, summary table, and individual theme cards + screenshots
for (const sec of tierSections) {
  const items = masterExports.filter((e) => e.tier === sec.tier);
  readmeLines.push(
    `## ${sec.title}`,
    "",
    sec.subtitle,
    "",
    `### 📦 1-Click ${sec.badge} Pack (${items.length} Themes — [\`${sec.packFile}\`](./${sec.packFile}))`,
    "",
    "```text",
    sec.packCode,
    "```",
    "",
    "| Theme | Blur / Glass | 3D Folder Shader (`uiElementFx`) | 3D Icon Pack (`iconPackStyle`) | 3D Icon Motion (`iconAnimation`) | Atmosphere (`atmosphere`) | JSON |",
    "| :--- | :-: | :--- | :--- | :--- | :--- | :--- |",
    ...items.map(
      (it) =>
        `| **${it.theme.name}** | \`${it.theme.fx?.blur ?? 0}px\` / \`${it.theme.fx?.glass ?? 0}\` | \`${it.theme.fx?.uiElementFx ?? "off"}\` | \`${it.theme.fx?.iconPackStyle ?? "default"}\` | \`${it.theme.fx?.iconAnimation ?? "off"}\` | \`${it.theme.fx?.atmosphere ?? "none"}\` | [\`${it.slug}.json\`](./${it.slug}.json) |`
    ),
    ""
  );

  for (const item of items) {
    const fx = item.theme.fx!;
    readmeLines.push(
      `### ${item.theme.name} (\`${item.id}\` · \`${item.tier.toUpperCase()}\`)`,
      "",
      `> **Target System:** ${item.targetHardware}  `,
      `> **Design Notes:** ${item.summary}`,
      "",
      `![${item.theme.name} — Live Icons View Screenshot](./${item.screenshotRelPath})`,
      "",
      `- **Palette:** Background \`${item.theme.colors.background}\` · Text \`${item.theme.colors.text}\` · Accent \`${item.theme.colors.accent}\` · Secondary \`${item.theme.colors.secondary}\` · Card \`${item.theme.colors.card}\` · Border \`${item.theme.colors.border}\``,
      `- **GPU Profile:** Blur \`${fx.blur ?? 0}px\` · Glass \`${fx.glass ?? 0}\` · Folder Shader \`${fx.uiElementFx ?? "off"}\` · 3D Icons \`${fx.iconPackStyle ?? "default"}\` · Animation \`${fx.iconAnimation ?? "off"}\` · Atmosphere \`${fx.atmosphere ?? "none"}\``,
      `- **Download JSON:** [\`custom_themes/${item.slug}.json\`](./${item.slug}.json)`,
      "",
      "```text",
      item.shareCode,
      "```",
      ""
    );
  }

  readmeLines.push("---", "");
}

// Polar Night & Cryo-Glacier section with screenshots
readmeLines.push(
  "## ❄️ Polar Night & Cryo-Glacier 6K Ultra Collection",
  "",
  "Featuring **`polar_night` (`Polar Night`)**, **`cryo_icicle_blizzard` (`Cryo-Glacier Icicle Storm`)**, and **`orbital_ice` (`Orbital Ice`)** with sculpted hanging crystal icicles (`cryo_frost`), `cryo_crystal` / `aurora_nordic_ice` 3D icons, and `blizzard+aurora_australis` 120Hz shaders:",
  ""
);

for (const p of polarExports) {
  readmeLines.push(
    `### ❄️ ${p.name} (\`${p.key}\`)`,
    "",
    `![${p.name} — Live Icons View Screenshot](./${p.screenshotRelPath})`,
    "",
    `- **Shader / Icons / Atmosphere:** \`${p.draft.fx?.uiElementFx}\` · \`${p.draft.fx?.iconPackStyle}\` · \`${p.draft.fx?.atmosphere}\``,
    "",
    "```text",
    p.code,
    "```",
    ""
  );
}

// All 18 US Holiday Celebration Ultra Themes section with screenshots
readmeLines.push(
  "---",
  "",
  "## 🎃🎆🎄 All 18 US Holiday Celebration 6K Ultra Themes (`holiday_*`)",
  "",
  "Every built-in US Holiday theme runs at **Ultra tier (`tier: \"ultra\"`)** with:",
  "- **Animated Holiday Corner Crests (`data-holiday-crest`)** on every 3D folder and file badge (`data-holiday-badge`) in **Icons View** and **List View**.",
  "- **Interactive Celebration Particle Burst** across the 6K viewport whenever selected.",
  "- **Festive 3D Folder Shaders (`holiday_festive_glow`)** and **`us_holidays_festive`** 3D icons.",
  "",
  "### 📦 1-Click Pack: All 18 US Holiday Celebration Ultra Themes (`CCFM-PACK-v1`)",
  "",
  "Copy this codeblock and press `⌘V` in the File Manager (or import [`us_holidays_18_ultra_pack.json`](./us_holidays_18_ultra_pack.json)):",
  "",
  "```text",
  holidayPackCode,
  "```",
  "",
  "### 🗓️ All 18 US Holiday Ultra Themes — Live Screenshots & Individual Share Codes",
  "",
  "| # | Holiday | Built-In Key | Theme Name | Folder Crest | File Badge | Celebration Particle Burst |",
  "| :-: | :--- | :--- | :--- | :-: | :-: | :--- |",
  ...holidayDrafts.map(
    (h, idx) =>
      `| **${idx + 1}** | ${h.meta.holiday} | \`${h.key}\` | **${h.draft.name}** | ${h.meta.crest} | ${h.meta.badge} | ${h.meta.burst} |`
  ),
  ""
);

for (let i = 0; i < holidayDrafts.length; i++) {
  const h = holidayDrafts[i]!;
  readmeLines.push(
    `#### ${i + 1}. ${h.meta.crest} ${h.draft.name} (\`${h.key}\`) — ${h.meta.holiday}`,
    "",
    `![${h.draft.name} — Live Icons View Screenshot](./${h.screenshotRelPath})`,
    "",
    `- **Folder Crest:** ${h.meta.crest} · **File Badge:** ${h.meta.badge} · **Celebration Particle Burst:** ${h.meta.burst}`,
    "",
    "```text",
    h.code,
    "```",
    ""
  );
}

readmeLines.push(
  "---",
  "",
  ...styleGuideLines.map((line, idx) => (idx === 0 ? "## 📐 Professional Theme Design & Architecture Style Guide" : line)),
  "",
  "> 📄 **Standalone Style Guide Reference:** See [`custom_themes/THEME_DESIGN_STYLE_GUIDE.md`](./THEME_DESIGN_STYLE_GUIDE.md) for the dedicated printable guide.",
  ""
);

fs.writeFileSync(path.join(OUT_DIR, "README.md"), readmeLines.join("\n"));
console.log(
  `Generated 20 Master Custom Themes (Low/Medium/High/Ultra), 18 US Holiday themes, 3 Polar themes, 41 live PNG screenshots, THEME_DESIGN_STYLE_GUIDE.md, and README.md in ${OUT_DIR}`
);
