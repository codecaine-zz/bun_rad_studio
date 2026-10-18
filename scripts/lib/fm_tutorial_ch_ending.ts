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

/** Chapters 22 to 26: themes and shortcuts, the database studios (joined from their own tutorials), and the goodbye. */
export const ending: Chapter[] = [
  {
    id: "22_themes", chapter: "YOUR WAY", title: "Make it yours: 212 themes, 194 shaders, fire & slime folders, OKLab blender, bulk import & hacker lab", blurb: "5-row filter pills, Immersion Studio (fire/slime/storm folders & custom icon packs), OKLab theme blender, CCFM-THEME-v1 bulk import with conflict resolution, 4-stage solar cycle + playlist, 194 shaders with 6-layer mixer, Theme Show screensaver, and Theme Hacker Lab",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "The Themes button & quick switcher",
        say: "Let's explore the completely upgraded Themes and Atmospheric Shader Studio, recorded live on a high-end Retina display. The Themes button in the ribbon lets you transform the entire workstation instantly. Your favorite and most recent themes sit right at the top of the menu, alongside one-click tools for Day and Night pairs, side-by-side comparison, folder pinning, and live atmospheric shaders.",
        act: async (d) => { await d.click("#tool-themes", { pause: 1800 }); await d.hover(".menu", 2400); },
      },
      {
        cap: "212 themes, Tier/UI FX badges & [ / ] rapid preview",
        say: "I choose All themes to open the gallery of two hundred and twelve built-in themes. Every card shows a live window swatch, whether it includes glass and shader effects, its hardware tier from Low Eco to Medium Glass and Ultra, its motion profile, and U I Element badges like Fire U I, Slime U I, or Storm U I. A great productivity trick: press the bracket keys or arrow keys right inside the gallery to live-preview themes rapidly.",
        act: async (d) => {
          await d.menu("All themes", { pause: 1600 });
          await d.waitFor(".theme-card", 6000);
          await d.hover(".dialog .theme-fx-badge", 1000).catch(() => {});
          await d.hover(".dialog .theme-tier-badge", 1000).catch(() => {});
          await d.hover(".dialog .theme-uifx-badge", 1200).catch(() => {});
          await showKeys(d, ["]"]);
          await d.click('[data-theme-step="1"]', { pause: 900 }).catch(() => {});
          await showKeys(d, ["["]);
          await d.click('[data-theme-step="-1"]', { pause: 900 }).catch(() => {});
          await d.scroll(".theme-list", 600, 6).catch(() => {});
          await d.wait(900);
          await d.scroll(".theme-list", -600, 6).catch(() => {});
        },
      },
      {
        cap: "5-row filter pills & Folder, Toolbar & Icon Immersion Studio",
        say: "Above the grid, the five-row filter bar slices the catalog by category, hardware tier with For My System auto-detection, animations, Liquid Glass or Mica shaders, and color vibes. Right below it, the Folder, Toolbar and Icon Immersion Studio lets you set folders and toolbars on fire, drip radioactive slime, sweep hurricane leaves across rows, or switch to Blazing Inferno, Toxic Slime, and 2126 Xenotech icon packs.",
        act: async (d) => {
          await d.click('[data-cat-pill="Futuristic"]', { pause: 1000 });
          await d.click("[data-hw-recommend]", { pause: 1000 });
          await d.click('[data-material-pill="liquid"]', { pause: 1000 });
          await d.click('[data-reset-filters="true"]', { pause: 1000 });
          await d.click('.theme-immersion-bar [data-ui-fx="fire_folders"]', { pause: 1300 }).catch(() => {});
          await d.click('.theme-immersion-bar [data-icon-pack="inferno"]', { pause: 1300 }).catch(() => {});
          await d.click('.theme-immersion-bar [data-ui-fx="slime_drip"]', { pause: 1300 }).catch(() => {});
          await d.click('.theme-immersion-bar [data-icon-pack="slime"]', { pause: 1300 }).catch(() => {});
          await d.click('.theme-immersion-bar [data-ui-fx="auto"]', { pause: 900 }).catch(() => {});
          await d.click('.theme-immersion-bar [data-icon-pack="default"]', { pause: 900 }).catch(() => {});
        },
      },
      {
        cap: "Inferno Fire Folders, Radioactive Slime, EF5 Tornado & Tesla Plasma",
        say: "Let's try the visceral storm and sci-fi themes. I search for inferno and click Inferno Blazing Folders with molten flames and fire icons, then try Radioactive Slime Bio-Vat with glowing green ooze, E F 5 Debris Tornado with wind-swept folders, and Tesla Coil Plasma, pinning Tesla to Favorites.",
        act: async (d) => {
          await search(d, "inferno");
          await d.click('.theme-card[data-key="inferno_fire_folders"]', { pause: 2100 });
          await search(d, "slime");
          await d.click('.theme-card[data-key="toxic_slime_ooze"]', { pause: 2100 });
          await search(d, "tornado");
          await d.click('.theme-card[data-key="ef5_debris_tornado"]', { pause: 2100 });
          await search(d, "tesla");
          await d.click('.theme-card[data-key="tesla_coil_plasma"]', { pause: 2000 });
          await d.click('.theme-pin[data-pin-key="tesla_coil_plasma"]', { pause: 1100 }).catch(() => {});
        },
      },
      {
        cap: "Rare classic systems (BeOS, OS/2 Warp, Linux CDE) & Surprise Me",
        say: "For Linux and classic computing fans, the Linux and Rare systems groups recreate nostalgic desktops like BeOS R 5, O S 2 Warp 4, Palm O S, Solaris C D E, and Ubuntu Yaru. You can also click Surprise me to jump to a random theme, or use Previous and Next to step through the list.",
        act: async (d) => {
          await search(d, "rare");
          await d.click('.theme-card[data-key="beos_r5"]', { pause: 2200 });
          await d.click('.theme-card[data-key="os2_warp"]', { pause: 2200 });
          await search(d, "");
          await d.click(".theme-random-btn", { pause: 1600 });
          await d.click('[data-theme-step="1"]', { pause: 1400 });
        },
      },
      {
        cap: "📁 Pin to Folder, 📤 Share Hub & 📦 Bulk Import Conflict Resolution",
        say: "Pick Prism Reactor and click Pin to Folder so this project automatically activates its theme whenever you open it. Then click Share and Import: generate one-line C C F M Theme share codes or Weather and Retro O S Pack bundles, or bulk import multiple themes at once. When a theme conflicts with an existing custom theme, the Conflict Resolution modal automatically prompts you to Replace, Keep Both with auto-rename, Merge FX, or Skip.",
        act: async (d) => {
          await search(d, "prism");
          await d.click('.theme-card[data-key="prism_reactor"]', { pause: 1400 });
          await d.click(".theme-pin-folder-btn", { pause: 1400 });
          await d.click(".theme-pin-folder-btn", { pause: 900 });
          await search(d, "");
          await d.eval(`(async () => {
            await fetch('/api/themes/custom/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                theme: {
                  name: 'Storm Custom',
                  dark: true,
                  colors: { background: '#0b0f17', card: '#141c2b', text: '#e8f0ff', accent: '#38bdf8', border: '#26344d', danger: '#ff6b81', warning: '#fbbf24', success: '#34d399', info: '#38bdf8' },
                  fx: { atmosphere: 'debris_tornado_ef5', uiElementFx: 'storm_wind', iconPackStyle: 'storm_tempest' }
                }
              })
            });
          })()`);
          await d.click('[data-share-hub="true"]', { pause: 1400 });
          await d.waitFor('[data-share-format="code"]', 6000);
          await d.click('[data-share-format="pack-weather"]', { pause: 1200 });
          await d.click('[data-share-format="pack-nostalgia"]', { pause: 1200 });
          await d.click('[data-share-format="code"]', { pause: 1000 });
          await d.hover('[data-share-import-files-btn="true"]', 1000).catch(() => {});
          await d.eval(`(() => {
            const box = document.querySelector('[data-share-import-box="true"]');
            if (!box) return;
            const payload = JSON.stringify([
              {
                name: 'Storm Custom',
                dark: true,
                colors: { background: '#1a090d', card: '#2d1018', text: '#ffe4e6', accent: '#ff2a85', border: '#4c1d2b', danger: '#ff6b81', warning: '#fbbf24', success: '#34d399', info: '#38bdf8' },
                fx: { atmosphere: 'volcanic_lightning', uiElementFx: 'fire_folders', iconPackStyle: 'inferno' }
              },
              {
                name: 'Storm Custom',
                dark: true,
                colors: { background: '#050814', card: '#0d152c', text: '#e0f2fe', accent: '#00f5d4', border: '#1e2f5c', danger: '#ff6b81', warning: '#fbbf24', success: '#34d399', info: '#38bdf8' },
                fx: { atmosphere: 'tesseract_4d', uiElementFx: 'holo_glitch', iconPackStyle: 'xenotech_2126' }
              }
            ]);
            box.value = payload;
            box.dispatchEvent(new Event('input', { bubbles: true }));
          })()`);
          await d.wait(900);
          await d.click('[data-share-import-apply="true"]', { pause: 1500 });
          await d.waitFor('[data-conflict-summary="true"]', 6000);
          await d.hover('[data-conflict-row="0"]', 1100).catch(() => {});
          await d.click('[data-conflict-bulk="keep_both"]', { pause: 1200 }).catch(() => {});
          await d.click('.modal-backdrop:last-child .dialog button >> Apply Resolutions & Import', { pause: 1600 }).catch(() => {});
          await d.eval(`(() => {
            const backdrops = [...document.querySelectorAll('.modal-backdrop')];
            while (backdrops.length > 1) {
              const top = backdrops.pop();
              top?.querySelector('button[value="close"], button[value="cancel"]')?.click();
            }
          })()`);
          await d.wait(700);
        },
      },
      {
        cap: "⚖️ Compare & Blend: split-screen wipe & Live OKLab Theme Blender",
        say: "Click Compare and Blend to open the side-by-side stage. Drag the interactive wipe slider across Theme A and Theme B, swap sides, inspect the specification diff table, or use the Live O K Lab Theme Blender to perceptually crossfade any two themes at any ratio, preview the hybrid live, and apply or save your winner.",
        act: async (d) => {
          if (!(await d.eval<boolean>(`!!document.querySelector('[data-compare-themes="true"]')`))) {
            await closeDialogs(d);
            await d.click("#tool-themes", { pause: 900 });
            await d.menu("All themes", { pause: 1200 });
          }
          await d.click('[data-compare-themes="true"]', { pause: 1600 });
          await d.waitFor(".theme-compare-slider", 6000);
          await pick(d, "Left theme (Theme A)", "tesla_coil_plasma");
          await pick(d, "Right theme (Theme B)", "inferno_fire_folders");
          await slide(d, "Split comparison wipe position", 50, 22, 4);
          await slide(d, "Split comparison wipe position", 22, 78, 4);
          await slide(d, "Split comparison wipe position", 78, 50, 4);
          await slide(d, "OKLab Theme Blend Ratio (0% = A, 100% = B)", 50, 65, 5).catch(() => {});
          await d.click('[data-preview-blend="true"]', { pause: 1500 }).catch(() => {});
          await d.hover(".theme-compare-table", 1500);
          await d.click('[data-apply-compare="a"]', { pause: 1500 });
        },
      },
      {
        cap: "Day / Night, 4-Stage Solar Cycle & Ambient Playlist Auto-Rotation",
        say: "Next, click Day Night and Playlist. Pair a light daytime theme with a dark nighttime theme, click Auto-Fill Sci-Fi Solar Cycle to assign Dawn, Solar Day, Golden Dusk, and Deep Midnight, or enable the new Ambient Playlist Auto-Rotation to cycle through your Favorites or Ultra Storm showcase on a timer.",
        act: async (d) => {
          await d.click(".dialog button >> Day / Night", { pause: 1600 });
          await d.waitFor('[data-solar-preset="scifi"]', 6000);
          await d.hover('select[aria-label="Daytime (Light) theme"]', 1000);
          await d.click('[data-solar-preset="scifi"]', { pause: 1600 });
          await d.hover('[data-solar-stage="dawn"]', 1000);
          await d.hover('[data-solar-stage="night"]', 1000);
          await d.click('[data-playlist-enabled="true"]', { pause: 1200 }).catch(() => {});
          await d.hover('[data-playlist-pool="true"]', 1200).catch(() => {});
          await d.key("Escape", "Esc");
          await d.wait(1000);
        },
      },
      {
        cap: "Atmosphere FX: 194 shaders, M4 Extreme 120Hz & EF5 Tornadoes",
        say: "Now click Atmosphere FX to open the live procedural shader studio. It includes one hundred and ninety-four real-time effects across Low Eco, Medium, Modern ARM Ultra, and M4 Max Extreme Uncapped 120 Hertz tiers, including E F 5 Debris Tornadoes with 3D-tumbling autumn leaves, roof shingles, flying newspapers, and Category 5 Hurricanes.",
        act: async (d) => {
          await d.click(".dialog button >> Atmosphere FX", { pause: 1800 });
          await d.waitFor(".fm-atmo-card", 6000);
          await d.click('.fm-atmo-tier-btn[data-tier="extreme"]', { pause: 1400 });
          await d.click('.fm-atmo-cat-btn[data-cat="weather"]', { pause: 1200 });
          await d.click('.fm-atmo-card[data-atmo="debris_tornado_ef5"]', { pause: 2200 });
          await d.click('.fm-atmo-card[data-atmo="autumn_noreaster_gale"]', { pause: 2000 });
          await d.click('.fm-atmo-card[data-atmo="category5_hurricane"]', { pause: 2000 });
          await d.click('.fm-atmo-tier-btn[data-tier="auto"]', { pause: 1200 });
        },
      },
      {
        cap: "🛸 Year 2126 Hyper-Dimensional & ⚡ Tesla / Sci-Fi Physics",
        say: "Explore ten categories of effects. In Year 2126 Hyper-Dimensional, try the 4D Hypercube Stereographic Fold, the 11D Calabi-Yau String Manifold, or the Non-Orientable Klein Bottle. Switch to Tesla, Plasma and Sci-Fi Physics to unleash the Wardenclyffe Magnifying Transmitter, the ITER Tokamak Magnetic Torus, or Rosensweig Ferrofluid Spikes that bristle toward your cursor.",
        act: async (d) => {
          await d.click('.fm-atmo-cat-btn[data-cat="future2126"]', { pause: 1400 });
          await d.click('.fm-atmo-card[data-atmo="tesseract_4d"]', { pause: 2200 });
          await d.click('.fm-atmo-card[data-atmo="calabi_yau"]', { pause: 2200 });
          await d.click('.fm-atmo-card[data-atmo="klein_mobius"]', { pause: 2000 });
          await d.click('.fm-atmo-cat-btn[data-cat="physics"]', { pause: 1400 });
          await d.click('.fm-atmo-card[data-atmo="tesla_megacoil"]', { pause: 2200 });
          await d.click('.fm-atmo-card[data-atmo="tokamak_fusion"]', { pause: 2200 });
          await d.click('.fm-atmo-card[data-atmo="ferrofluid_spikes"]', { pause: 2200 });
        },
      },
      {
        cap: "Reactive physics: Typing Velocity, Telemetry Pulse, Audio Beat & Surge",
        say: "With Reactive Physics Modulation, effects respond to what you do. Choose Typing and Cursor Velocity so arcs and particles accelerate as you type and move, System Telemetry Pulse to breathe with live C P U load, or Audio and Synth Beat. And click Trigger Arc Surge anytime for an immediate high-voltage impulse.",
        act: async (d) => {
          await d.click('.fm-atmo-reactive-btn[data-reactive-mode="activity"]', { pause: 1500 });
          await d.click('.fm-atmo-reactive-btn[data-reactive-mode="telemetry"]', { pause: 1500 });
          await d.click('.fm-atmo-reactive-btn[data-reactive-mode="audio"]', { pause: 1500 });
          await d.click('.fm-atmo-reactive-btn[data-reactive-mode="activity"]', { pause: 1200 });
          await d.click('[data-surge-btn="true"]', { pause: 1800 });
          await d.click('[data-surge-btn="true"]', { pause: 1800 });
        },
      },
      {
        cap: "6-Layer Mixer, Per-Layer Tint/Speed Modifiers & 48 Signature Mixes",
        say: "The Multi-Effect Layer Mixer lets you combine up to six effects simultaneously, with per-layer color tint, opacity, and speed sliders plus shareable preset codes. Pick from forty-eight curated Signature Mixes like M4 Max E F 5 Debris Apocalypse, 2126 11D Hyperspace Fold, Wardenclyffe Overdrive, or Tahoe Liquid Glass Pro, save a custom preset, and click Apply effect.",
        act: async (d) => {
          await d.click('.fm-atmo-preset-btn[data-mix="debris_tornado_ef5+urban_cyclone_debris+hail_supercell+derecho_squall"]', { pause: 2200 });
          await d.click('.fm-atmo-preset-btn[data-mix="tesseract_4d+calabi_yau+chronos_retrocausal"]', { pause: 2200 });
          await d.click('.fm-atmo-preset-btn[data-mix="plasma_storm+tesla_megacoil+ball_lightning"]', { pause: 2200 });
          await d.click('.fm-atmo-preset-btn[data-mix="liquid_glass_caustics+m4_raytrace_prism+aurora"]', { pause: 2200 });
          await d.eval(`(() => { const e = document.querySelector(".fm-atmo-preset-name-input"); if (e) { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); } })()`);
          await d.type("Hyper Glass 2126", 80);
          await d.click('[data-save-user-preset="true"]', { pause: 1600 });
          await d.hover(".fm-atmo-intensity input[type=range]", 1200);
          await d.click(".modal-backdrop:last-child .dialog button >> Apply effect", { pause: 1800 });
        },
      },
      {
        cap: "🎬 Theme Show & Screensaver Studio + ⌘⇧T from anywhere",
        say: "Back in the Themes gallery, click Theme Show and Screensaver to launch a full-bleed visual showcase with four presentation modes including Cinema H U D, Living File Manager, and Retro After Dark XScreenSaver O S D across seven curated channels. And from anywhere in the File Manager, Command Shift T or Right Option T opens the theme gallery immediately.",
        act: async (d) => {
          await d.click('[data-theme-show-btn="true"]', { pause: 1600 });
          await d.waitFor('[data-show-mode-card="retro_afterdark"]', 6000);
          await d.click('[data-show-mode-card="retro_afterdark"]', { pause: 1200 });
          await d.click('[data-show-channel-card="storms_debris"]', { pause: 1200 });
          await d.click(".dialog button >> Launch Theme Show Now", { pause: 2200 });
          await d.click("[data-theme-show-next]", { pause: 1800 }).catch(() => {});
          await d.click('[data-theme-show-exit="true"]', { pause: 1400 }).catch(() => {});
          await d.eval(`document.querySelector('[data-theme-show-exit]')?.click()`);
          await closeDialogs(d);
          await d.key("Meta+Shift+T", "⌘+⇧+T");
          await d.wait(1100);
          if (!(await d.eval<boolean>(`!!document.querySelector('.theme-card')`))) await d.eval(`window.openAppThemes?.()`);
          await d.wait(1500);
          await closeDialogs(d);
          await showKeys(d, ["Right ⌥", "T"]);
          await d.wait(1500);
        },
      },
      {
        cap: "Theme Editor: Auto-Harmonize, Wallpaper Chameleon & WCAG Contrast",
        say: "Now let's design and hack our own theme. In the gallery, I click Create or edit a theme. Every color token has a visual picker and hex input, plus one-click Palette Tools: Randomize palette, Invert Dark and Light mode, Auto-harmonize from your Accent color, and Extract from Image or Wallpaper. Below the colors, a live W C A G contrast inspector verifies every pair with double-A and triple-A grades.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 1200 });
          await d.menu("All themes", { pause: 1400 });
          await d.click(".dialog button >> Create or edit a theme", { pause: 1800 });
          await d.waitFor(".dialog input[aria-label='Theme name']", 6000);
          await d.click('[data-harmony="random"]', { pause: 1500 });
          await d.click('[data-harmony="invert"]', { pause: 1500 });
          await d.click('[data-harmony="invert"]', { pause: 1500 });
          await d.click('[data-harmony="accent"]', { pause: 1500 });
          await d.hover('[data-extract-image-btn="true"]', 1400).catch(() => {});
          await d.hover(".theme-contrast-inspector", 2000);
        },
      },
      {
        cap: "12 Style Presets, 🛠️ Theme Hacker Lab (Compiz Burn & CDE) & Custom CSS",
        say: "In Glass, glow, materials and motion, pick from twelve Effect Style Presets like Cyberpunk Hologram, Plasma Reactor, or Tahoe Liquid Glass. Then scroll to the Theme Hacker Lab: inject one-click mutators like Compiz Burn and Inferno, Bio-Slime Vat, 90s Linux C D E Chisel, or Green-Phosphor C R T Hacker, override internal C S S design tokens, or inject custom C S S snippets like Wobbly Hover and Neon Pulsing Folders.",
        act: async (d) => {
          await d.click('[data-fx-preset="cyber_hologram"]', { pause: 1400 });
          await d.click('[data-fx-preset="liquid_glass"]', { pause: 1400 });
          await d.eval(`(() => {
            const det = document.querySelector('[data-hacker-studio]');
            if (det) {
              det.open = true;
              det.querySelector('summary')?.addEventListener('click', (e) => e.preventDefault());
              det.scrollIntoView({ behavior: 'instant', block: 'center' });
            }
          })()`);
          await d.wait(300);
          await d.click('[data-hack-mutate="compiz_burn"]', { pause: 1800 });
          await d.click('[data-hack-mutate="retro_linux_cde"]', { pause: 1800 });
          await d.click('[data-hack-mutate="cyber_overdrive"]', { pause: 1800 });
          await d.click('[data-css-snippet="compiz_wobbly"]', { pause: 1300 }).catch(() => {});
          await d.click('[data-css-snippet="neon_folders"]', { pause: 1300 }).catch(() => {});
          await slide(d, "Glass blur", 26, 32, 2);
          await pick(d, "Surface material", "liquid");
          await pick(d, "Border style", "iridescent");
          await pick(d, "Cursor interaction", "prism");
        },
      },
      {
        cap: "Attach Shader Mixes, Export CCFM-THEME-v1 Code & Save Theme",
        say: "You can attach any of the one hundred and ninety-four atmospheric effects or forty-eight multi-layer mixes directly to your custom theme, along with its folder shader, icon pack, and custom C S S. I name our creation Midnight Liquid Glass, hover Export and Import for one-line C C F M Theme share codes and bulk conflict-resolved imports, and click Save theme.",
        act: async (d) => {
          await pick(d, "Atmospheric effect", "liquid_glass_caustics+m4_raytrace_prism+aurora");
          await d.eval(`(() => { const e = document.querySelector(".dialog input[aria-label='Theme name']"); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); })()`);
          await d.type("Midnight Liquid Glass", 85);
          await d.hover(".dialog button >> Export", 1100);
          await d.hover(".dialog button >> Import", 1100);
          await d.dialog("Save theme", { pause: 2200 });
          await closeDialogs(d);
        },
      },
      {
        cap: "Right ⌥ + ] / [ theme cycling, close lock & custom shortcuts",
        say: "Finally, in the desktop app, hold Right Option and press the closing or opening square bracket to cycle through themes live without opening a menu, or Right Option and slash for full screen. In Settings, you can lock the window so only its close button can close it, and in Help under Change keyboard shortcuts, you can remap any key in the program.",
        act: async (d) => {
          await closeDialogs(d);
          for (let i = 0; i < 3; i++) { await showKeys(d, ["Right ⌥", "]"]); await d.eval(`window.cycleAppTheme(1)`); await d.wait(1300); }
          await showKeys(d, ["Right ⌥", "["]); await d.eval(`window.cycleAppTheme(-1)`); await d.wait(1300);
          await showKeys(d, ["Right ⌥", "/"]); await d.wait(1400);
          await d.eval(`(() => { if (typeof window.closeApp !== 'function') window.closeApp = () => {}; })()`);
          await d.key("Meta+,", "⌘+,");
          await d.wait(900);
          if (!(await d.eval<boolean>(`!!document.querySelector('.modal-backdrop')`))) await d.eval(`import('/ui/extras.js').then((m) => m.showSettings())`);
          await d.wait(1000);
          const sel = ".dialog label >> Only close the window";
          await d.eval(`[...document.querySelectorAll('.dialog label')].find((l) => l.textContent.includes('Only close the window'))?.scrollIntoView({ block: 'center' })`);
          await d.click(sel, { pause: 1600 }).catch(() => {});
          await closeDialogs(d);
          await d.key("F1", "F1");
          await d.waitFor(".dialog", 6000);
          await d.click(".dialog .btn >> Change keyboard shortcuts", { pause: 1600 }).catch(() => {});
          await d.hover(".dialog", 2000);
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
    card: { kicker: "Free and open source", title: "Thank you for watching", lines: ["Download: github.com/codecaine-zz/bun_rad_studio", "Every guide is in the docs folder", "Press F1 inside the app any time"] },
    steps: [
      {
        cap: "Thank you for watching",
        say: "And that is the whole tour. You have seen how to find your way around, copy and move safely, and preview anything. How the terminal and your files follow each other, so you never type a long path again. Every tool in the toolbox. The Image and Media Studios, with presets for many files at once. Themes that are truly yours. And the database studios. Everything is safe by default. Deleting goes to the Recycle Bin, nothing is overwritten silently, and big changes are shown to you first. The guides are in the docs folder, and you can press F1 inside the app at any time. Thank you so much for watching.",
      },
    ],
  },
];
