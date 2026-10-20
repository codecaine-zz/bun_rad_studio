import type { Chapter } from "./fm_tutorial_types";
import type { Do } from "../tutorial_file_manager";

/** Shows a key combination on screen (the desktop-only keys can't be pressed in a browser recording). */
const showKeys = (d: Do, keys: string[]) => d.eval(`window.__cc.keys(${JSON.stringify(keys)})`);

/** Closes any open dialog (saving a theme goes back to the gallery). */
async function closeDialogs(d: Do) {
  for (let i = 0; i < 4 && await d.eval<boolean>(`!!document.querySelector('.modal-backdrop')`); i++) { await d.key("Escape", "Esc"); await d.wait(500); }
}

/** Empties the theme gallery's search box and types a new word. */
async function search(d: Do, word: string) {
  await d.eval(`(() => { const e = document.querySelector('.dialog input[type=search]'); if (e) { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); } })()`);
  if (word) await d.type(word, 85);
  await d.eval(`(() => { const e = document.querySelector('.dialog input[type=search]'); if (e && e.value !== ${JSON.stringify(word)}) { e.value = ${JSON.stringify(word)}; e.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await d.wait(900);
}

/** Moves a slider of the theme editor slowly, so the change can be seen. */
async function slide(d: Do, label: string, from: number, to: number, step: number) {
  const sel = `.dialog input[aria-label='${label}']`;
  await d.hover(sel, 700);
  await d.eval(`(async () => { const r = document.querySelector(${JSON.stringify(sel)}); const n = Math.round(Math.abs(${to} - ${from}) / ${step}); for (let i = 0; i <= n; i++) { r.value = String(${from} + Math.sign(${to} - ${from}) * ${step} * i); r.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((z) => setTimeout(z, 60)); } })()`);
  await d.wait(1200);
}

/** Chooses a value in one of the theme editor's lists. */
async function pick(d: Do, label: string, value: string) {
  const sel = `.dialog select[aria-label='${label}']`;
  await d.hover(sel, 700);
  await d.eval(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await d.wait(900);
}

/**
 * Applies a theme while the Theme Picker modal is CLOSED so the viewer can see the
 * entire File Manager in Icons View (#list.view-icons) with zero modal obstruction!
 */
async function showThemeUnobstructed(
  d: Do,
  key: string,
  bannerTitle: string,
  bannerSub: string,
  opts: { anim?: string; holidayBurst?: boolean; hoverRow?: string; waitMs?: number } = {},
) {
  const anim = opts.anim || "folder_3d_spin_turntable";
  const waitMs = opts.waitMs ?? 1250;
  await d.eval(`(async () => {
    const backdrops = [...document.querySelectorAll('.modal-backdrop')];
    for (const b of backdrops) b.remove();
    const { state } = await import('/ui/state.js');
    const { applyPalette, triggerHolidayCelebrationBurst } = await import('/ui/themes.js');
    const { applyAtmosphere } = await import('/ui/atmosphereFx.js');
    const { syncVisibleIcons } = await import('/ui/dom.js');
    if (state?.settings) {
      state.settings.atmosphereTier = 'ultra';
      state.settings.themeIconAnimation = ${JSON.stringify(anim)};
    }
    document.documentElement.dataset.fmIconAnim = ${JSON.stringify(anim)};
    applyPalette?.(${JSON.stringify(key)});
    if (${Boolean(opts.holidayBurst)}) {
      triggerHolidayCelebrationBurst?.(${JSON.stringify(key)});
    }
    try { applyAtmosphere?.(); } catch {}
    const listEl = document.getElementById('list');
    if (listEl) syncVisibleIcons(listEl);

    let banner = document.getElementById('fm-unobstructed-theme-hud');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'fm-unobstructed-theme-hud';
      banner.style.cssText = 'position:fixed;top:10px;right:18px;z-index:9999;pointer-events:none;padding:8px 14px;border-radius:12px;background:rgba(9,13,24,0.88);border:1.5px solid var(--accent, #ff8c1a);color:#fff;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,0.55);backdrop-filter:blur(12px);max-width:460px;transition:all 0.2s ease;';
      document.body.appendChild(banner);
    }
    banner.innerHTML = '<div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent, #ff8c1a);">🔴 UNOBSTRUCTED 6K XDR ICONS VIEW · 120Hz ULTRA</div>'
      + '<div style="font-size:14px;font-weight:800;margin-top:2px;color:#ffffff;">' + ${JSON.stringify(bannerTitle)} + '</div>'
      + '<div style="font-size:11px;opacity:0.86;margin-top:1px;color:#cbd5e1;">' + ${JSON.stringify(bannerSub)} + '</div>';
  })()`);
  if (opts.hoverRow) {
    await d.hover(`#list .row[data-name=${JSON.stringify(opts.hoverRow)}]`, Math.min(700, waitMs)).catch(() => {});
    await d.wait(Math.max(250, waitMs - 700));
  } else {
    await d.wait(waitMs);
  }
}

async function clearUnobstructedBanner(d: Do) {
  await d.eval(`document.getElementById('fm-unobstructed-theme-hud')?.remove()`);
}

/** Chapters 22 to 26: themes and shortcuts, the database studios (joined from their own tutorials), and the goodbye. */
export const ending: Chapter[] = [
  {
    id: "22_themes", chapter: "YOUR WAY", title: "God-Mode Theme & Shader Studio: Unobstructed Icons View, All 18 US Holidays, Polar Night, 20 Custom Themes (Low–Ultra) & Gemini AI", blurb: "Unobstructed Icons View showcase, Halloween & Polar Night Ultra, all 18 US Holiday themes, 20 Master Custom Themes across Low/Medium/High/Ultra tiers, Single & Bulk Folder Import, Google Gemini AI Theme Customizer & 194 Shaders",
    path: "<HOME>/Projects/shop-app",
    setup: (w) => {
      // Seed rich semantic folders so Icons View (#list.view-icons) showcases 14+ distinct 3D animated folders & crests
      w.put("Projects/shop-app/ai-models/README.md", "# AI Models\n");
      w.put("Projects/shop-app/camera-raw/README.md", "# Camera RAW\n");
      w.put("Projects/shop-app/docker/README.md", "# Docker\n");
      w.put("Projects/shop-app/games/README.md", "# Games\n");
      w.put("Projects/shop-app/music-stems/README.md", "# Music Stems\n");
      w.put("Projects/shop-app/security-vault/README.md", "# Security Vault\n");
      w.put("Projects/shop-app/shaders/README.md", "# Shaders\n");
    },
    steps: [
      {
        cap: "Icons View First: Unobstructed 120Hz 3D Folder & Icon Animations",
        say: "Welcome to the God-Mode Themes and Atmospheric Shader Studio, recorded on our flagship Apple Mac Studio M4 Ultra with an eighty-core G P U and a six-K Pro Display X D R at one hundred and twenty Hertz ProMotion. Before opening any dialog, I switch the File Manager to Icons View so you can see every theme, 3D folder shader, and animated icon pack across the full screen without a large dialog window blocking your view.",
        act: async (d) => {
          await d.click("#status-views button >> Icons", { pause: 1400 });
          await showThemeUnobstructed(
            d,
            "holiday_halloween_jack_o_lantern",
            "🎃 Halloween Carved Jack-O'-Lantern & Witching Hour",
            "3D Spinning Turntable Folders · Floating Jack-O'-Lantern Crests · 120Hz Fireflies",
            { anim: "folder_3d_spin_turntable", holidayBurst: true, hoverRow: "custom_themes", waitMs: 2200 },
          );
          await d.hover('#list .row[data-name="shaders"]', 1400).catch(() => {});
          await d.hover('#list .row[data-name="ai-models"]', 1400).catch(() => {});
        },
      },
      {
        cap: "🎃 Halloween Ultra & ❄️ Polar Night / Cryo-Glacier Unobstructed Showcase",
        say: "With the theme window closed, watch how every folder and file icon transforms in real time. We start with our Halloween Jack-O'-Lantern Ultra theme and Nosferatu Crimson Blood-Moon Crypt, then switch to two favorites: Polar Night with shimmering Nordic aurora ribbons and frost-rimmed glass cards, and Sub-Zero Cryo-Glacier with hanging 3D ice spikes and crystalline folders.",
        act: async (d) => {
          await showThemeUnobstructed(
            d,
            "horror_nosferatu_blood_moon",
            "🧛 Nosferatu Crimson Blood-Moon Vampire",
            "Gothic Obsidian Velvet · 3D Levitating Crypt Folders · Blood-Moon Eclipse",
            { anim: "neon_levitate_3d", hoverRow: "security-vault", waitMs: 2200 },
          );
          await showThemeUnobstructed(
            d,
            "polar_night",
            "🌌 Polar Night (Nordic Aurora & Cryo-Frost Ultra)",
            "Arctic Midnight Slate · Shimmering Aurora Ribbons · Cryo-Frost 3D Folders",
            { anim: "folder_3d_spin_turntable", hoverRow: "camera-raw", waitMs: 2600 },
          );
          await showThemeUnobstructed(
            d,
            "cryo_icicle_blizzard",
            "🧊 Sub-Zero Cryo-Glacier & Hanging Icicles",
            "Glacial Cyan Ice · Hanging 3D Icicles on Every Folder · Whiteout Blizzard",
            { anim: "cube_3d_rotate", hoverRow: "music-stems", waitMs: 2400 },
          );
        },
      },
      {
        cap: "🎆 All 18 US Holiday Celebration Ultra Themes — Unobstructed Icons Tour (Part 1)",
        say: "Codecaine Studio includes eighteen bespoke U S Holiday Celebration Ultra themes. Every holiday features its own multi-layer atmospheric shader, custom 3D corner crests on every folder, file badges, and an interactive celebration particle burst on Option H. Here in unobstructed Icons View are the first nine holidays: New Year's Midnight Champagne, Martin Luther King Junior Sunrise Dream, Valentine's Velvet Rose, Presidents' Day Constitutional Parchment, Saint Patrick's Emerald Clover, Easter Pastel Spring Bloom, Mother's Day Botanical Garden, Memorial Day Poppy Tribute, and Juneteenth Emancipation Starburst.",
        act: async (d) => {
          const part1: Array<[string, string, string, string]> = [
            ["holiday_new_years_midnight_champagne", "🥂 1/18 · New Year's Eve Midnight Champagne", "3D 🥂 Folder Crests · Gold Firework Burst · Art-Deco Obsidian", "folder_3d_spin_turntable"],
            ["holiday_mlk_dream_sunrise", "🕊️ 2/18 · MLK Jr. Day Sunrise Dream", "3D 🕊️ Peace Dove Crests · Warm Amber Dawn Aurora", "neon_levitate_3d"],
            ["holiday_valentines_velvet_rose", "💝 3/18 · Valentine's Day Velvet Rose & Gold", "3D 💝 Ribbon Heart Crests · Rose-Petal Bokeh Shimmer", "jelly_squish_3d"],
            ["holiday_presidents_day_parchment", "🦅 4/18 · Presidents' Day Constitutional Brass", "3D 🦅 Presidential Crest · Continental Navy & Gold Leaf", "origami_fold_flip"],
            ["holiday_st_patricks_emerald_clover", "☘️ 5/18 · St. Patrick's Day Celtic Clover & Gold", "3D ☘️ Shamrock Crests · Rainbow Gold Shimmer", "folder_3d_spin_turntable"],
            ["holiday_easter_pastel_bloom", "🥚 6/18 · Easter Sunday Pastel Egg & Spring", "3D 🥚 Painted Egg Crests · Cherry Blossom Breeze", "jelly_squish_3d"],
            ["holiday_mothers_day_botanical_tea", "🌸 7/18 · Mother's Day Botanical Rose Garden", "3D 🌸 Peony Blossom Crests · Warm Sunbeam Dust", "neon_levitate_3d"],
            ["holiday_memorial_day_poppy_honor", "🌺 8/18 · Memorial Day Red Poppy & Marble", "3D 🌺 Remembrance Poppy Crests · Twilight Starlight", "origami_fold_flip"],
            ["holiday_juneteenth_freedom_starburst", "🌟 9/18 · Juneteenth Emancipation Pan-African Gold", "3D 🌟 Nova Star Crests · Pan-African Jubilee Fireworks", "folder_3d_spin_turntable"],
          ];
          for (const [key, title, sub, anim] of part1) {
            await showThemeUnobstructed(d, key, title, sub, { anim, holidayBurst: true, waitMs: 1450 });
          }
        },
      },
      {
        cap: "🎃🎄 All 18 US Holiday Celebration Ultra Themes — Unobstructed Icons Tour (Part 2)",
        say: "Continuing through all eighteen U S Holidays in unobstructed Icons View: Father's Day Chronograph and Mahogany, Fourth of July Grand Finale Fireworks, Labor Day Steel Foundry Forge, Indigenous Peoples' and Columbus Day Autumn Star-Compass, Halloween Carved Jack-O'-Lantern, Veterans Day Valor Medal, Thanksgiving Harvest Cornucopia, Hanukkah Festival of Lights Menorah, and Christmas Nutcracker Fireside Hearth.",
        act: async (d) => {
          const part2: Array<[string, string, string, string]> = [
            ["holiday_fathers_day_chronograph_denim", "⌚ 10/18 · Father's Day Chronograph & Mahogany", "3D ⌚ Tourbillon Gear Crests · Brushed Steel & Espresso", "cube_3d_rotate"],
            ["holiday_fourth_of_july_fireworks", "🎆 11/18 · Fourth of July Grand Finale Fireworks", "3D 🎆 Liberty Rocket Crests · Red-White-Blue Sky Shells", "folder_3d_spin_turntable"],
            ["holiday_labor_day_foundry_forge", "⚒️ 12/18 · Labor Day Steel Foundry & Rivet Forge", "3D ⚒️ Crossed Hammer Crests · Molten Spark Stream", "c4d_mograph_extrude"],
            ["holiday_indigenous_autumn_compass", "🧭 13/18 · Indigenous Peoples' & Columbus Day Compass", "3D 🧭 Celestial Compass Crests · Terracotta Turquoise", "origami_fold_flip"],
            ["holiday_halloween_jack_o_lantern", "🎃 14/18 · Halloween Carved Jack-O'-Lantern", "3D 🎃 Pumpkin & 🦇 Bat Crests · Witching Hour Fog", "folder_3d_spin_turntable"],
            ["holiday_veterans_day_valor_medal", "🎖️ 15/18 · Veterans Day Bronze Star & Valor", "3D 🎖️ Dress Ribbon Crests · Honor Guard Gold", "neon_levitate_3d"],
            ["holiday_thanksgiving_harvest_hearth", "🦃 16/18 · Thanksgiving Harvest Cornucopia", "3D 🦃 Autumn Maple Crests · Falling Leaves & Hearth", "origami_fold_flip"],
            ["holiday_hanukkah_menorah_starlight", "🕎 17/18 · Hanukkah Festival of Lights Menorah", "3D 🕎 Nine-Branch Menorah Crests · Sapphire & Silver", "folder_3d_spin_turntable"],
            ["holiday_christmas_nutcracker_hearth", "🎄 18/18 · Christmas Nutcracker Fireside Hearth", "3D 🎄 Evergreen Wreath Crests · Snowfall & Warm Ember", "folder_3d_spin_turntable"],
          ];
          for (const [key, title, sub, anim] of part2) {
            await showThemeUnobstructed(d, key, title, sub, { anim, holidayBurst: true, waitMs: 1450 });
          }
        },
      },
      {
        cap: "🔥 Visceral 3D Folder Shaders & 120Hz Icon Animations in Action",
        say: "Now watch the visceral 3D folder shaders and 120 Hertz icon animations in full Icons View: Compiz Fusion Blazing Fire Folders with rising embers, Toxic Bio-Slime dripping neon green ooze, E F 5 Debris Tornado swirling folders in a vortex, Two-Advanced Year Three Thousand orbital HUD rings, Cinema 4D MoGraph extruded studios, and Omega Point Singularity.",
        act: async (d) => {
          await showThemeUnobstructed(d, "inferno_fire_folders", "🔥 Inferno Blazing Folders", "Compiz Fusion Flame Shader · 3D Extrude Icons", { anim: "c4d_mograph_extrude", hoverRow: "docker", waitMs: 1900 });
          await showThemeUnobstructed(d, "toxic_slime_ooze", "🧪 Toxic Bio-Slime Ooze", "Dripping Radioactive Slime Folders · Jelly 3D Squish", { anim: "jelly_squish_3d", hoverRow: "games", waitMs: 1900 });
          await showThemeUnobstructed(d, "ef5_debris_tornado", "🌪️ EF5 Debris Tornado Supercell", "Swirling Vortex Wind · 3D Gyro Cube Rotation", { anim: "cube_3d_rotate", hoverRow: "shaders", waitMs: 1900 });
          await showThemeUnobstructed(d, "flash_2advanced_v3_studio", "⚡ 2Advanced Studios v3 (Year 3000 Flash HUD)", "Orbital Vector Sweeps · Flash-3000 3D Rings", { anim: "flash_3000_orbital", hoverRow: "ai-models", waitMs: 1900 });
          await showThemeUnobstructed(d, "omega_point_singularity", "🌌 Omega Point Singularity (Year 3099)", "11D Calabi-Yau Manifold · 120Hz 3D Turntable Folders", { anim: "folder_3d_spin_turntable", hoverRow: "custom_themes", waitMs: 1900 });
        },
      },
      {
        cap: "👑 Master Designer Custom Themes: Low, Medium, High & Ultra System Tiers",
        say: "As a master theme designer, we created twenty flagship Custom Themes organized across all four computer hardware tiers—Low Featherweight with zero G P U load, Medium Balanced sixty frames per second, High-Spec one hundred and twenty Hertz, and Ultra six-K X D R—all ready in the custom themes folder on GitHub. Watch our eight Ultra custom creations unobstructed in Icons View: All Hallows Eve six-K X D R Ultra, Polar Aurora Borealis six-K Ultra, Polar Daylight Glacier six-K Ultra, M4 Ultra Liquid Titanium, Crimson Blood-Moon Crypt Ultra, Compiz Hellfire Forge, Bio-Hazard Dalí Screen-Melt, and Omega Pantheon thirty-ninety-nine.",
        act: async (d) => {
          const masterUltras: Array<[string, string, string, string]> = [
            ["custom_0000000d", "🎃 All Hallows Eve 6K XDR Ultra (Custom #13)", "Tier 4 ULTRA · 3-Layer Jack-O'-Lantern + Blood Moon + Fireflies · 3D Turntable", "folder_3d_spin_turntable"],
            ["custom_0000000e", "🌌 Polar Aurora Borealis 6K Ultra (Custom #14)", "Tier 4 ULTRA · 3-Layer Aurora + Blizzard + Cryo-Frost Icicles · 3D Turntable", "folder_3d_spin_turntable"],
            ["custom_0000000f", "🏔️ Polar Daylight Glacier 6K Ultra (Custom #15)", "Tier 4 ULTRA · High-Contrast Glacial Daylight + Raytraced Prism · Origami 3D", "origami_fold_flip"],
            ["custom_00000010", "🍎 M4 Ultra Liquid Titanium 6K (Custom #16)", "Tier 4 ULTRA · Machined Space-Black Titanium + 6K XDR Caustics · C4D MoGraph", "c4d_mograph_extrude"],
            ["custom_00000011", "🧛 Crimson Blood-Moon Crypt Ultra (Custom #17)", "Tier 4 ULTRA · Gothic Cathedral + Tesla Plasma + Blood Moon · 3D Levitate", "neon_levitate_3d"],
            ["custom_00000012", "🔥 Compiz Hellfire Forge 120Hz (Custom #18)", "Tier 4 ULTRA · Blazing Fire Folders + Volcanic Lightning · 3D Gyro Cube", "cube_3d_rotate"],
            ["custom_00000013", "🧪 Bio-Hazard Dalí Screen-Melt (Custom #19)", "Tier 4 ULTRA · Dripping Bio-Slime + Ferrofluid Spikes · 3D Jelly Squish", "jelly_squish_3d"],
            ["custom_00000014", "🌌 Omega Pantheon 3099 Singularity (Custom #20)", "Tier 4 ULTRA · 11D Calabi-Yau + 4D Tesseract + Tokamak · Flash-3000 Orbital", "flash_3000_orbital"],
          ];
          for (const [key, title, sub, anim] of masterUltras) {
            await showThemeUnobstructed(d, key, title, sub, { anim, hoverRow: "custom_themes", waitMs: 1650 });
          }
          await clearUnobstructedBanner(d);
        },
      },
      {
        cap: "The Theme Gallery, Hardware Tier Filters (Low/Medium/High/Ultra) & Telemetry",
        say: "Now let's open the Themes menu briefly to see where everything lives. The gallery organizes over three hundred built-in themes plus your twenty Master Custom Themes, with one-click Optimize buttons for Mac, Windows, and Linux, a live Hardware V F D Telemetry Deck, and One-Click Jumpstart Kits.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 1100 });
          await d.menu("All themes", { pause: 1400 });
          await d.waitFor(".theme-card", 6000);
          await d.click('[data-optimize-platform="macos"]', { pause: 800 }).catch(() => {});
          await d.click('[data-open-telemetry-studio="true"]', { pause: 1000 }).catch(() => {});
          await d.click('[data-open-telemetry-studio="true"]', { pause: 700 }).catch(() => {});
          await d.click('[data-collection-pill="us_holidays"]', { pause: 1100 }).catch(() => {});
          await d.click('[data-collection-pill="flagship_mac_xdr"]', { pause: 1100 }).catch(() => {});
          await d.click('[data-collection-pill="all"]', { pause: 900 }).catch(() => {});
        },
      },
      {
        cap: "📄 Single Custom Theme Import & 📁 Bulk Folder Import from custom_themes/",
        say: "Let's demonstrate both Single Theme Import and Bulk Folder Import using the custom themes folder included in the repository. First, I close the gallery and open the custom themes folder right in the File Manager, where you see individual J S O N and C C F M share files plus the Low, Medium, High, and Ultra tier packs. Then I open Share and Import: you can import a single theme file or paste a single C C F M code, or click Load Current Folder Themes to bulk-import every theme file in the open folder at once, with automatic Conflict Resolution—and then close the dialog to admire the imported theme unobstructed!",
        act: async (d) => {
          await closeDialogs(d);
          await d.row("custom_themes", "dblclick", { pause: 1600 });
          await d.hover('#list .row[data-name="13_ultra_all_hallows_eve_6k_xdr.json"]', 1200).catch(() => {});
          await d.hover('#list .row[data-name="pack_tier_4_ultra_6k_xdr_120hz.json"]', 1200).catch(() => {});
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click('[data-share-hub="true"]', { pause: 1300 });
          await d.waitFor('[data-share-import-box="true"]', 6000);
          // 1) Single Custom Theme Import example
          await d.eval(`(() => {
            const box = document.querySelector('[data-share-import-box="true"]');
            if (!box) return;
            box.value = JSON.stringify({
              format: 'bun-rad-studio-file-manager-theme',
              version: 1,
              name: "Polar Jack-O'-Lantern 6K",
              dark: true,
              base: 'Custom Import',
              colors: { background: '#070a12', card: '#101829', text: '#f4f8ff', accent: '#ff8c1a', secondary: '#38bdf8', border: '#38bdf8', danger: '#ff4d6d', warning: '#fbbf24', success: '#34d399', info: '#38bdf8' },
              fx: {
                glow: 'ember',
                glowColor: '#ff8c1a',
                glowColor2: '#38bdf8',
                blur: 28,
                glass: 0.74,
                glowIntensity: 1,
                borderOpacity: 0.34,
                grain: 'subtle',
                scanlines: 'none',
                radius: 'squircle',
                border: 'iridescent',
                motion: 'spring',
                sheen: true,
                noise: true,
                chromatic: false,
                ambient: true,
                atmosphere: 'autumn_leaves+embers+aurora_australis',
                uiElementFx: 'holiday_festive_glow',
                iconPackStyle: 'us_holidays_festive',
                iconAnimation: 'folder_3d_spin_turntable'
              }
            }, null, 2);
            box.dispatchEvent(new Event('input', { bubbles: true }));
          })()`);
          await d.wait(1000);
          await d.click('[data-share-import-apply="true"]', { pause: 1300 });
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.click('[data-conflict-bulk="replace"]', { pause: 700 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 1000 }).catch(() => {});
          }
          // 2) Bulk Folder Import from the open custom_themes/ folder
          await closeDialogs(d);
          await d.click("#tool-themes", { pause: 700 });
          await d.menu("All themes", { pause: 900 });
          await d.click('[data-share-hub="true"]', { pause: 1000 });
          await d.waitFor('[data-share-import-current-folder-btn="true"]', 6000);
          await d.hover('[data-share-import-current-folder-btn="true"]', 900).catch(() => {});
          await d.click('[data-share-import-current-folder-btn="true"]', { pause: 1400 }).catch(() => {});
          await d.click('[data-share-import-apply="true"]', { pause: 1400 }).catch(() => {});
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.hover('[data-conflict-row="0"]', 800).catch(() => {});
            await d.click('[data-conflict-bulk="replace"]', { pause: 1000 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 1400 }).catch(() => {});
          }
          // Close all dialogs so the viewer sees the imported theme unobstructed in Icons View!
          await closeDialogs(d);
          await d.click("#tool-up", { pause: 1200 }).catch(() => {});
          await showThemeUnobstructed(
            d,
            "custom_0000000d",
            "📦 Imported from custom_themes/ · All Hallows Eve 6K XDR Ultra",
            "Single & Bulk Folder Import Complete · Unobstructed Icons View",
            { anim: "folder_3d_spin_turntable", hoverRow: "custom_themes", waitMs: 1800 },
          );
          await clearUnobstructedBanner(d);
        },
      },
      {
        cap: "🤖 Google Gemini AI Theme Customizer & Master LLM Prompt Studio",
        say: "Inside Share and Import, you also have the built-in Google Gemini A I Theme Customizer. Describe any theme you can imagine in plain English—like a Halloween Jack-O'-Lantern and Polar Night Aurora hybrid with one hundred and twenty Hertz 3D spinning folders—choose your system tier from Low to Ultra, and click Generate with Gemini A I to synthesize and apply a WCAG-verified theme on the spot, or click Copy Gemini L L M Master Prompt to paste our complete schema specification into Google AI Studio or Gemini Chat. Watch as we close the window to see our new Gemini-crafted theme across the full Icons View!",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click('[data-share-hub="true"]', { pause: 1300 });
          await d.waitFor('[data-gemini-theme-prompt="true"]', 6000);
          await d.eval(`(() => {
            const p = document.querySelector('[data-gemini-theme-prompt="true"]');
            if (p) {
              p.scrollIntoView({ behavior: 'instant', block: 'center' });
              p.value = "Halloween Jack-O'-Lantern meets Polar Night Aurora with 120Hz 3D spinning folders";
              p.dispatchEvent(new Event('input', { bubbles: true }));
            }
            const t = document.querySelector('[data-gemini-theme-tier="true"]');
            if (t) {
              t.value = 'ultra';
              t.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()`);
          await d.wait(1000);
          await d.hover('[data-gemini-copy-prompt-btn="true"]', 900).catch(() => {});
          await d.click('[data-gemini-generate-btn="true"]', { pause: 1300 }).catch(() => {});
          await d.click('[data-share-import-apply="true"]', { pause: 1300 }).catch(() => {});
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.click('[data-conflict-bulk="replace"]', { pause: 700 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 1000 }).catch(() => {});
          }
          // Immediately close the modal so the Gemini-generated theme is visible unobstructed in Icons View!
          await closeDialogs(d);
          await d.hover('#list .row[data-name="shaders"]', 1500).catch(() => {});
          await d.hover('#list .row[data-name="custom_themes"]', 1500).catch(() => {});
        },
      },
      {
        cap: "⚖️ Compare & Blend: split-screen wipe & Live OKLab Theme Blender",
        say: "Click Compare and Blend to open the side-by-side stage. Drag the interactive wipe slider across Polar Night and Halloween Jack-O'-Lantern, inspect the specification diff table, or use the Live O K Lab Theme Blender to perceptually crossfade any two themes at any ratio.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.click('[data-compare-themes="true"]', { pause: 1500 });
          await d.waitFor(".theme-compare-slider", 6000);
          await pick(d, "Left theme (Theme A)", "polar_night");
          await pick(d, "Right theme (Theme B)", "holiday_halloween_jack_o_lantern");
          await slide(d, "Split comparison wipe position", 50, 22, 4);
          await slide(d, "Split comparison wipe position", 22, 78, 4);
          await slide(d, "Split comparison wipe position", 78, 50, 4);
          await slide(d, "OKLab Theme Blend Ratio (0% = A, 100% = B)", 50, 65, 5).catch(() => {});
          await d.click('[data-preview-blend="true"]', { pause: 1400 }).catch(() => {});
          await closeDialogs(d);
          await d.wait(800);
        },
      },
      {
        cap: "Atmosphere FX: 194 Shaders, 6-Layer Mixer & Reactive Physics",
        say: "In Atmosphere FX, you can mix up to six simultaneous real-time shaders from one hundred and ninety-four effects—including E F 5 Debris Tornadoes, 4D Hypercubes, Tesla Megacoils, and Liquid Glass Caustics—and modulate them by typing velocity, live C P U telemetry, or audio beat.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1100 });
          await d.click(".theme-tools button >> Atmosphere FX", { pause: 1400 });
          await d.waitFor(".fm-atmo-card", 6000);
          await d.click('.fm-atmo-tier-btn[data-tier="extreme"]', { pause: 1100 });
          await d.click('.fm-atmo-preset-btn[data-mix="liquid_glass_caustics+m4_raytrace_prism+aurora"]', { pause: 1600 });
          await d.click('[data-surge-btn="true"]', { pause: 1300 });
          await d.click(".modal-backdrop:last-child .dialog button >> Apply effect", { pause: 1400 });
          await closeDialogs(d);
          await d.wait(1000);
        },
      },
      {
        cap: "Theme Editor, 🛠️ Theme Hacker Lab, WCAG Inspector & Save Theme",
        say: "In Create or edit a theme, pick a pre-built 8K studio picture, check live W C A G contrast ratios, open the Theme Hacker Lab for one-click Compiz Burn and custom C S S snippets, and save your theme.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 1000 });
          await d.menu("All themes", { pause: 1200 });
          await d.click(".dialog button >> Create or edit a theme", { pause: 1600 });
          await d.waitFor(".dialog input[aria-label='Theme name']", 6000);
          await d.click('[data-prebuilt-picture="pro_display_xdr_nebula"]', { pause: 1200 }).catch(() => {});
          await d.click('[data-fx-preset="liquid_glass"]', { pause: 1200 });
          await d.hover(".theme-contrast-inspector", 1200);
          await d.eval(`(() => { const e = document.querySelector(".dialog input[aria-label='Theme name']"); if (e) { e.value = 'Midnight Liquid Glass Ultra'; e.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
          await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="save"]', { pause: 1800 });
          await closeDialogs(d);
        },
      },
      {
        cap: "🏆 Zero-Dialog Keyboard Power-Ups (⌥M, ⌥9, ⌥H, ⌥F, ⌥S, ⌥Z) & F1 Help",
        say: "Best of all, you can control the entire ten-engine Triple-A Theme Studio directly from the keyboard with zero dialogs blocking your view: press Option M for Master Director's Cut presets, Option 9 to cycle 3D spinning folder animations, Option H to cycle all eighteen U S Holiday themes with firework bursts, Option F for CRT and cinema screen filters, Option S for 3D stage tilt, or Option Z to undo—and press Command Comma for Settings or F1 anytime for the interactive keyboard shortcut guide.",
        act: async (d) => {
          await closeDialogs(d);
          await showKeys(d, ["⌥", "M"]);
          await d.eval(`window.cycleAppAaaDirectorCut?.(1)`);
          await d.wait(1100);
          await showKeys(d, ["⌥", "9"]);
          await d.eval(`window.cycleAppHighEndAnimation?.(1)`);
          await d.wait(1100);
          await showKeys(d, ["⌥", "H"]);
          await d.eval(`window.cycleAppHolidayTheme?.(1)`);
          await d.wait(1200);
          await showKeys(d, ["⌥", "Z"]);
          await d.eval(`import('/ui/themes.js').then((m) => m.undoThemeHistory?.())`).catch(() => {});
          await d.wait(900);
          await showThemeUnobstructed(
            d,
            "polar_night",
            "❄️ Polar Night · Ready for Databases Masterclass",
            "Unobstructed 6K XDR View · Switching back to List View",
            { anim: "folder_3d_spin_turntable", waitMs: 1200 },
          );
          await clearUnobstructedBanner(d);
          await d.click("#status-views button >> List", { pause: 900 }).catch(() => {});
          await d.eval(`(() => { if (typeof window.closeApp !== 'function') window.closeApp = () => {}; })()`);
          await d.key("Meta+,", "⌘+,");
          await d.wait(800);
          if (!(await d.eval<boolean>(`!!document.querySelector('.modal-backdrop')`))) await d.eval(`import('/ui/extras.js').then((m) => m.showSettings())`);
          await d.wait(800);
          const sel = ".dialog label >> Only close the window";
          await d.eval(`[...document.querySelectorAll('.dialog label')].find((l) => l.textContent.includes('Only close the window'))?.scrollIntoView({ block: 'center' })`);
          await d.click(sel, { pause: 1000 }).catch(() => {});
          await closeDialogs(d);
          await d.key("F1", "F1");
          await d.waitFor(".dialog", 6000);
          await d.click(".dialog .btn >> Change keyboard shortcuts", { pause: 1200 }).catch(() => {});
          await d.hover(".dialog", 1300);
        },
      },
    ],
  },

  {
    id: "23_databases", chapter: "DATABASES", title: "The database studios", blurb: "SQLite, MySQL and MariaDB, PostgreSQL and Redis, right inside the File Manager",
    path: "<HOME>/Projects/shop-app",
    view: "#view-tools",
    // The Databases tab offers connections it finds in the environment of the program (this repository's .env): they are
    // dismissed before recording so no real setting or path is shown.
    before: async (d) => {
      await d.eval(`document.querySelector('#power-tab-databases')?.click()`);
      await d.wait(2500);
      await d.eval(`[...document.querySelectorAll('#power-body button')].filter((b) => /^(Never for this one|Not now)$/.test(b.textContent.trim())).forEach((b) => b.click())`);
      await d.wait(800);
      await d.eval(`[...document.querySelectorAll('#power-body button')].filter((b) => /^(Never for this one|Not now)$/.test(b.textContent.trim())).forEach((b) => b.click())`);
      await d.wait(800);
    },
    steps: [
      {
        cap: "The Databases tab: four studios",
        say: "The last tool is a big one. Databases. The File Manager has four database studios built in. SQLite, for database files on your computer. MySQL and MariaDB. PostgreSQL. And Redis. Passwords are kept in your system keychain, never in a plain file.",
        act: async (d) => { await d.click("#power-tab-databases", { pause: 1800 }); await d.hover("#power-body", 3500); },
      },
      {
        cap: "Next: Complete Databases Masterclass, SQLite Studio & MySQL Studio",
        say: "Next, we will go through the entire database suite completely, step by step. First, the Complete Databases and Cross-Engine Cloning Masterclass across all four engines: SQLite, PostgreSQL, MySQL, and Redis, including Bun JavaScript and Visual Macros, Universal Staging Import, and Studio I D E version two. Then the dedicated SQLite Studio and MySQL Studio deep dives. Take your time, and pause whenever you like.",
        act: async (d) => { await d.hover("#power-body", 4000); },
      },
    ],
  },

  {
    id: "23b_databases_masterclass", chapter: "DATABASES MASTERCLASS", title: "All 4 Databases, Cross-Engine Cloning, Bun JS Macros & Studio IDE v2", blurb: "SQLite, MySQL, PostgreSQL, Redis, live cross-engine cloning, Bun JS & visual macros, staging import, ER diagram, schema diff & codegen",
    kind: "external", external: { dir: "databases_masterclass_tutorial", label: "Databases Hub" },
    steps: [],
  },

  {
    id: "24_sqlite", chapter: "SQLITE STUDIO", title: "SQLite Studio, step by step", blurb: "Find a database file, browse and edit it, design tables, write SQL, and keep it safe",
    kind: "external", external: { dir: "sqlite_studio_tutorial", label: "SQLite" },
    steps: [],
  },

  {
    id: "25_mysql", chapter: "MYSQL STUDIO", title: "MySQL Studio, step by step", blurb: "Connect to a server, the workbench, the grid, SQL, design, imports and backups",
    kind: "external", external: { dir: "mysql_studio_tutorial", label: "MySQL" },
    steps: [],
  },

  {
    id: "26_outro", chapter: "THE END", title: "That is the tour", kind: "card",
    card: {
      kicker: "Free and open source · Recorded on Apple Mac Studio M4 Ultra · Pro Display XDR 6K 120Hz",
      title: "Thank you for watching",
      lines: [
        "Download: github.com/codecaine-zz/bun_rad_studio",
        "Every guide is in the docs folder · Press F1 or ⌘⇧P inside the app any time",
        "🍎 Apple Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz",
      ],
    },
    steps: [
      {
        cap: "Thank you for watching",
        say: "And that is the whole tour. You have seen how to find your way around, copy and move safely, and preview anything. How the terminal and your files follow each other, so you never type a long path again. Every tool in the toolbox. The Image and Media Studios, with presets for many files at once. Themes that are truly yours. And the database studios. Everything is safe by default. Deleting goes to the Recycle Bin, nothing is overwritten silently, and big changes are shown to you first. The guides are in the docs folder, and you can press F1 inside the app at any time. Thank you so much for watching.",
      },
    ],
  },
];
