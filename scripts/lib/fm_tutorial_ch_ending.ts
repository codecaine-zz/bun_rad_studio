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
    id: "22_themes", chapter: "YOUR WAY", title: "God-Mode Theme & Shader Studio: 310 themes, Year 3000+ Singularity, Flagship Mac M4 Ultra 6K XDR, 120Hz Tie-Dye & 194 Shaders", blurb: "310 built-in themes, Year 3000+ God-Mode hyper-materials, Flagship Mac Studio M4 Ultra & Pro Display XDR 6K / 5K Studio Display, 120Hz ProMotion zero-lag shaders, 1-click Jumpstart Kits, ⌘V paste import, OKLab blender & Theme Hacker Lab",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "The Themes menu, M4 Ultra 6K XDR Specs, ⌘V Paste & Live Telemetry",
        say: "Welcome to the God-Mode Themes and Atmospheric Shader Studio, recorded on a flagship Apple M4 Ultra eighty-core G P U workstation with one hundred and ninety-two gigabytes of unified memory and a six-K Pro Display X D R at one hundred and twenty Hertz ProMotion. Clicking the Themes button in the ribbon gives you instant access to three hundred and ten built-in themes, Plain No-Animation themes, Instant Paste Theme with Command V, Share and Bulk Import, the Theme Show Screensaver, one hundred and ninety-four Atmospheric Shaders, and the Theme Editor.",
        act: async (d) => { await d.click("#tool-themes", { pause: 1800 }); await d.hover(".menu", 2400); },
      },
      {
        cap: "310 themes, Cross-Platform Mac/Windows/Linux Optimizer & VFD Telemetry Deck",
        say: "I choose All themes to open the gallery of three hundred and ten built-in themes. Every theme is hardware-optimized for zero lag across Apple Silicon M4 Pro, Max, and Ultra ProMotion displays, Windows DirectX 12 WebView2, and Ubuntu Linux on bare metal or Parallels VMs—with one-click Optimize for Mac, Optimize for Windows, and Optimize for Linux buttons right in the top bar, plus a live Hardware V F D and Oscilloscope Telemetry Deck.",
        act: async (d) => {
          await d.menu("All themes", { pause: 1600 });
          await d.waitFor(".theme-card", 6000);
          await d.click('[data-optimize-platform="linux"]', { pause: 800 }).catch(() => {});
          await d.click('[data-optimize-platform="windows"]', { pause: 800 }).catch(() => {});
          await d.click('[data-optimize-platform="macos"]', { pause: 800 }).catch(() => {});
          await d.hover('[data-paste-theme-btn="true"]', 900).catch(() => {});
          await d.click('[data-open-telemetry-studio="true"]', { pause: 1100 }).catch(() => {});
          await d.click('[data-telemetry-skin-btn="winamp_spectrum"]', { pause: 900 }).catch(() => {});
          await d.click('[data-open-telemetry-studio="true"]', { pause: 700 }).catch(() => {});
          await showKeys(d, ["]"]);
          await d.click('[data-theme-step="1"]', { pause: 900 }).catch(() => {});
          await showKeys(d, ["["]);
          await d.click('[data-theme-step="-1"]', { pause: 900 }).catch(() => {});
          await d.scroll(".theme-list", 600, 6).catch(() => {});
          await d.wait(700);
          await d.scroll(".theme-list", -600, 6).catch(() => {});
        },
      },
      {
        cap: "🌌 Year 3000+ God-Mode, 🍎 Flagship Mac M4 Ultra 6K XDR & ⚡ Jumpstart Kits",
        say: "Zero manual setup is required. Click any One-Click Jumpstart Workstation Kit to transform your entire desktop—palette, 3D folders, framed picture icons, typography, and shaders—in a single click. Try the new Year Three Thousand God-Mode kits like Omega Point Singularity and Photonic Metamaterial thirty-ninety-nine, or Flagship Mac kits like Mac Studio M4 Ultra six-K X D R, Apple Studio Display five-K, and macOS Tahoe 3D Glass.",
        act: async (d) => {
          await d.eval(`(() => { const det = document.querySelector('[data-fx-studio-drawer="true"]'); if (det) det.open = true; })()`);
          await d.wait(300);
          await d.click('[data-jumpstart-kit="godmode_omega_singularity_kit"]', { pause: 1400 }).catch(() => {});
          await d.click('[data-jumpstart-kit="godmode_photonic_3099_kit"]', { pause: 1400 }).catch(() => {});
          await d.click('[data-jumpstart-kit="mac_studio_m4_ultra_kit"]', { pause: 1400 }).catch(() => {});
          await d.click('[data-jumpstart-kit="apple_studio_display_5k_kit"]', { pause: 1300 }).catch(() => {});
          await d.click('[data-jumpstart-kit="macos_tahoe_3d_kit"]', { pause: 1300 }).catch(() => {});
          await d.eval(`(() => { const det = document.querySelector('[data-fx-studio-drawer="true"]'); if (det) det.open = false; })()`);
          await d.wait(300);
          await d.click('[data-collection-pill="god_mode_3000"]', { pause: 1300 }).catch(() => {});
          await d.click('[data-collection-pill="flagship_mac_xdr"]', { pause: 1300 }).catch(() => {});
          await d.click('[data-collection-pill="all"]', { pause: 900 }).catch(() => {});
        },
      },
      {
        cap: "Omega Singularity, Mac Studio M4 Ultra, 120Hz Tie-Dye '67, Fire & Tornado",
        say: "Let's test our God-Mode, Flagship Mac, and high-velocity shader themes. I apply Omega Point Singularity and Matrioshka Dyson Brain from the Year Three Thousand collection, switch to Mac Studio M4 Ultra and MacBook Pro Space Black X D R, then test Haight-Ashbury Tie-Dye sixty-seven with silky-smooth one hundred and twenty Hertz lava-wax folders, Inferno Blazing Folders, E F 5 Debris Tornado, and Tesla Coil Plasma.",
        act: async (d) => {
          await search(d, "omega");
          await d.click('.theme-card[data-key="omega_point_singularity"]', { pause: 1700 }).catch(() => {});
          await search(d, "dyson");
          await d.click('.theme-card[data-key="matrioshka_dyson_brain"]', { pause: 1700 }).catch(() => {});
          await search(d, "m4 ultra");
          await d.click('.theme-card[data-key="mac_studio_m4_ultra"]', { pause: 1700 }).catch(() => {});
          await search(d, "tie-dye");
          await d.click('.theme-card[data-key="summer_of_love_tiedye_67"]', { pause: 1700 }).catch(() => {});
          await search(d, "inferno");
          await d.click('.theme-card[data-key="inferno_fire_folders"]', { pause: 1700 });
          await search(d, "tornado");
          await d.click('.theme-card[data-key="ef5_debris_tornado"]', { pause: 1700 });
          await search(d, "tesla");
          await d.click('.theme-card[data-key="tesla_coil_plasma"]', { pause: 1700 });
          await d.click('.theme-pin[data-pin-key="tesla_coil_plasma"]', { pause: 900 }).catch(() => {});
        },
      },
      {
        cap: "US Holidays, Nerd Complete, Horror, Real-World Objects & Classic OS",
        say: "Explore specialized worlds for every mood: eighteen U S Holiday themes, ten Nerd Complete themes like D and D Arcane Grimoire and Starfleet L C A R S Bridge, ten Horror themes with Dalí screen-melting ooze, Real-World Mahogany Clockwork and Stained Glass, plus classic systems like BeOS R 5 and O S 2 Warp 4.",
        act: async (d) => {
          await search(d, "grimoire");
          await d.click('.theme-card[data-key="nerd_dnd_arcane_grimoire"]', { pause: 1700 }).catch(() => {});
          await search(d, "lcars");
          await d.click('.theme-card[data-key="nerd_starfleet_lcars_bridge"]', { pause: 1700 }).catch(() => {});
          await search(d, "rare");
          await d.click('.theme-card[data-key="beos_r5"]', { pause: 1700 });
          await d.click('.theme-card[data-key="os2_warp"]', { pause: 1700 });
          await search(d, "");
          await d.click(".theme-random-btn", { pause: 1300 });
          await d.click('[data-theme-step="1"]', { pause: 1100 });
        },
      },
      {
        cap: "📁 Pin to Folder, 📋 ⌘V Clipboard Paste & 📦 Bulk Import Conflict Resolution",
        say: "Pick Prism Reactor and click Pin to Folder so this workspace automatically activates its theme whenever you open it. Next, click Share and Import: generate one-line C C F M Theme share codes, click Paste from Clipboard or press Command V anywhere, or bulk import multiple themes at once. When a theme conflicts with an existing custom theme, the Conflict Resolution modal automatically prompts you to Replace, Keep Both with auto-rename, Merge FX, or Skip.",
        act: async (d) => {
          await search(d, "prism");
          await d.click('.theme-card[data-key="prism_reactor"]', { pause: 1400 });
          await d.click(".theme-pin-folder-btn", { pause: 1300 });
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
          await d.click('[data-share-format="pack-weather"]', { pause: 1100 });
          await d.click('[data-share-format="pack-nostalgia"]', { pause: 1100 });
          await d.click('[data-share-format="code"]', { pause: 1000 });
          await showKeys(d, ["⌘", "V"]);
          await d.hover('[data-share-paste-clipboard-btn="true"]', 1000).catch(() => {});
          await d.hover('[data-share-import-files-btn="true"]', 900).catch(() => {});
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
          await d.click('[data-apply-compare="a"]', { pause: 1200 }).catch(() => {});
          await d.eval(`(() => {
            const applyBtn = document.querySelector('[data-apply-compare="a"]');
            if (applyBtn) applyBtn.click();
          })()`);
          await d.wait(500);
        },
      },
      {
        cap: "Day / Night, 4-Stage Solar Cycle & Ambient Playlist Auto-Rotation",
        say: "Next, click Day Night and Playlist. Pair a light daytime theme with a dark nighttime theme, click Auto-Fill Sci-Fi Solar Cycle to assign Dawn, Solar Day, Golden Dusk, and Deep Midnight, or enable the new Ambient Playlist Auto-Rotation to cycle through your Favorites or Ultra Storm showcase on a timer.",
        act: async (d) => {
          await d.eval(`(() => {
            const backdrops = [...document.querySelectorAll('.modal-backdrop')];
            while (backdrops.length > 1) {
              const top = backdrops.pop();
              top?.querySelector('button[value="close"], button[value="cancel"]')?.click();
            }
          })()`);
          await d.click(".theme-tools button >> Day / Night", { pause: 1600 });
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
          await d.eval(`(() => {
            const backdrops = [...document.querySelectorAll('.modal-backdrop')];
            while (backdrops.length > 1) {
              const top = backdrops.pop();
              top?.querySelector('button[value="close"], button[value="cancel"]')?.click();
            }
          })()`);
          await d.click(".theme-tools button >> Atmosphere FX", { pause: 1800 });
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
        cap: "Theme Editor: Pre-Built Studio Pictures, Auto-Harmonize & WCAG Contrast",
        say: "Now let's design and hack our own theme. In the gallery, I click Create or edit a theme. Along with Auto-harmonize, Invert, Randomize, Extract from Wallpaper, and Paste Theme with Command V, you get one-click Pre-Built Studio Pictures and 3D Folders like Tahoe Aerial Coast 8K, Pro Display X D R Nebula, and 8K Hasselblad Golden Hour. Below the colors, a live W C A G contrast inspector verifies every pair.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 1200 });
          await d.menu("All themes", { pause: 1400 });
          await d.click(".dialog button >> Create or edit a theme", { pause: 1800 });
          await d.waitFor(".dialog input[aria-label='Theme name']", 6000);
          await d.click('[data-prebuilt-picture="tahoe_aerial_coast"]', { pause: 1400 }).catch(() => {});
          await d.click('[data-prebuilt-picture="pro_display_xdr_nebula"]', { pause: 1400 }).catch(() => {});
          await d.click('[data-harmony="random"]', { pause: 1200 });
          await d.click('[data-harmony="invert"]', { pause: 1200 });
          await d.click('[data-harmony="invert"]', { pause: 1200 });
          await d.click('[data-harmony="accent"]', { pause: 1200 });
          await d.hover('[data-editor-paste-theme="true"]', 1000).catch(() => {});
          await d.hover(".theme-contrast-inspector", 1600);
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
        say: "You can attach any of the one hundred and ninety-four atmospheric effects or forty-eight multi-layer mixes directly to your custom theme, along with its 3D folder shader, picture icon pack, and custom C S S. I name our creation Midnight Liquid Glass, hover Export and Import for one-line C C F M Theme share codes and bulk conflict-resolved imports, and click Save theme.",
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
        cap: "Zero-Dialog Shortcuts: ⌥R Random, ⌥E FX, ⌥P Plain, ⌥0 Toggle & ⌥]/[ HUD",
        say: "Finally, you can switch or randomize themes from anywhere with zero dialogs needed. Press Option R for an instant random theme, Option E for a random animated F X theme, Option P for a random zero-G P U plain theme, Option U for a random Ultra God-Mode theme, or Option Zero to toggle effects on and off on the spot. Hold Right Option with the square brackets for the Selection Templates Quick-Switcher H U D, or open Settings and Help to lock the window close button and customize every keyboard shortcut.",
        act: async (d) => {
          await closeDialogs(d);
          await showKeys(d, ["⌥", "R"]);
          await d.eval(`window.randomAppTheme("any")`);
          await d.wait(1100);
          await showKeys(d, ["⌥", "E"]);
          await d.eval(`window.randomAppTheme("fx")`);
          await d.wait(1100);
          await showKeys(d, ["⌥", "P"]);
          await d.eval(`window.randomAppTheme("plain")`);
          await d.wait(1100);
          await showKeys(d, ["⌥", "U"]);
          await d.eval(`window.randomAppTheme("ultra")`);
          await d.wait(1100);
          await showKeys(d, ["⌥", "0"]);
          await d.eval(`window.toggleAppThemeFx()`);
          await d.wait(900);
          await showKeys(d, ["Right ⌥", "]"]);
          await d.eval(`window.cycleAppTheme(1, { showcaseOnly: true, showHud: true })`);
          await d.wait(1100);
          await showKeys(d, ["Right ⌥", "["]);
          await d.eval(`window.cycleAppTheme(-1, { showcaseOnly: true, showHud: true })`);
          await d.wait(1100);
          await d.eval(`document.querySelector('[data-quick-hud-close]')?.click()`).catch(() => {});
          await showKeys(d, ["Right ⌥", "/"]); await d.wait(900);
          await d.eval(`(() => { if (typeof window.closeApp !== 'function') window.closeApp = () => {}; })()`);
          await d.key("Meta+,", "⌘+,");
          await d.wait(800);
          if (!(await d.eval<boolean>(`!!document.querySelector('.modal-backdrop')`))) await d.eval(`import('/ui/extras.js').then((m) => m.showSettings())`);
          await d.wait(900);
          const sel = ".dialog label >> Only close the window";
          await d.eval(`[...document.querySelectorAll('.dialog label')].find((l) => l.textContent.includes('Only close the window'))?.scrollIntoView({ block: 'center' })`);
          await d.click(sel, { pause: 1300 }).catch(() => {});
          await closeDialogs(d);
          await d.key("F1", "F1");
          await d.waitFor(".dialog", 6000);
          await d.click(".dialog .btn >> Change keyboard shortcuts", { pause: 1500 }).catch(() => {});
          await d.hover(".dialog", 1800);
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
