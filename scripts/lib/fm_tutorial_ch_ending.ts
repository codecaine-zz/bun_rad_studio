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
  await d.eval(`(() => { const e = document.querySelector('.dialog input[type=search]'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); })()`);
  await d.type(word, 90);
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
    id: "22_themes", chapter: "YOUR WAY", title: "Make it yours: 200+ themes, 172 shaders, mixer, comparator & solar cycle", blurb: "5-row filter pills, sci-fi physics & rare OS themes, folder pinning, split-screen comparator, 4-stage solar cycle, 172 atmospheric shaders with 4-layer mixer, and Theme Editor v2",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "The Themes button & quick switcher",
        say: "Let's explore the completely upgraded Themes and Atmospheric Shader Studio. The Themes button in the ribbon lets you transform the entire workstation instantly. Your favorite and most recent themes sit right at the top of the menu, alongside quick actions for Day and Night pairs, side-by-side comparison, folder pinning, and live atmospheric effects.",
        act: async (d) => { await d.click("#tool-themes", { pause: 1800 }); await d.hover(".menu", 2400); },
      },
      {
        cap: "200+ themes with tier, shader & motion badges",
        say: "I choose All themes to open the gallery of more than two hundred built-in themes. Every card shows a live color swatch, whether it includes glass and shader effects or plain colors, its hardware template tier from Low Eco to Medium Glass and Ultra, and its animation profile like Live Canvas FX or Spring motion.",
        act: async (d) => {
          await d.menu("All themes", { pause: 1600 });
          await d.waitFor(".theme-card", 6000);
          await d.hover(".dialog .theme-fx-badge", 1400).catch(() => {});
          await d.hover(".dialog .theme-tier-badge", 1400).catch(() => {});
          await d.hover(".dialog .theme-anim-badge", 1400).catch(() => {});
          await d.scroll(".theme-list", 600, 6).catch(() => {});
          await d.wait(1000);
          await d.scroll(".theme-list", -600, 6).catch(() => {});
        },
      },
      {
        cap: "5-row filter pills: Category, Tier, Motion, Shader & Vibe",
        say: "Above the grid, a five-row pill bar lets you slice the catalog in one click. Filter by category like Futuristic or Rare systems, click For My System to match your hardware tier automatically, filter by animations such as Live Canvas FX or Tesla and Physics, pick a surface shader like Liquid Glass or Mica, or filter by color vibe from O L E D Black to Cyan and Violet. Reset Filters brings everything back.",
        act: async (d) => {
          await d.click('[data-cat-pill="Futuristic"]', { pause: 1100 });
          await d.click("[data-hw-recommend]", { pause: 1100 });
          await d.click('[data-anim-pill="physics"]', { pause: 1200 });
          await d.click('[data-anim-pill="all"]', { pause: 700 });
          await d.click('[data-material-pill="liquid"]', { pause: 1100 });
          await d.click('[data-material-pill="all"]', { pause: 700 });
          await d.click('[data-vibe-pill="cyan"]', { pause: 1100 });
          await d.click('[data-vibe-pill="violet"]', { pause: 1100 });
          await d.click('[data-reset-filters="true"]', { pause: 1200 });
        },
      },
      {
        cap: "Tesla Coil Plasma, Tokamak Fusion & Tahoe Liquid Glass",
        say: "Let's try the new sci-fi physics and futuristic themes. I search for tesla and click Tesla Coil Plasma, then click the star on its card to pin it to my Favorites. Next, I try Tokamak Fusion with its magnetic plasma glow, and Tahoe Liquid Glass with refractive specular rims.",
        act: async (d) => {
          await search(d, "tesla");
          await d.click(".theme-card >> Tesla Coil Plasma", { pause: 2200 });
          await d.click('.theme-pin[data-pin-key="tesla_coil_plasma"]', { pause: 1200 }).catch(() => {});
          await search(d, "tokamak");
          await d.click(".theme-card >> Tokamak Fusion", { pause: 2200 });
          await search(d, "tahoe");
          await d.click(".theme-card >> Tahoe Liquid Glass", { pause: 2200 });
        },
      },
      {
        cap: "Rare classic systems (BeOS, OS/2 Warp) & Surprise Me",
        say: "For classic computing fans, the Rare and beloved systems group recreates legendary desktops like BeOS R 5, O S 2 Warp 4, Palm O S, Solaris, and NeXTSTEP. You can also click Surprise me to jump to a random theme, or use the Previous and Next buttons to step through the list.",
        act: async (d) => {
          await search(d, "rare");
          await d.click(".theme-card >> BeOS R5", { pause: 2200 });
          await d.click(".theme-card >> OS/2 Warp 4", { pause: 2200 });
          await search(d, "");
          await d.click(".theme-random-btn", { pause: 1600 });
          await d.click('[data-theme-step="1"]', { pause: 1400 });
        },
      },
      {
        cap: "📁 Pin to Folder: per-workspace automatic themes",
        say: "Want a project folder to have its own signature look? I pick Prism Reactor and click Pin to Folder. Now, whenever I navigate into this workspace or any of its subfolders, the File Manager automatically switches to that folder's pinned theme. Clicking the button again unpins it.",
        act: async (d) => {
          await search(d, "prism");
          await d.click(".theme-card >> Prism Reactor", { pause: 1800 });
          await d.click(".theme-pin-folder-btn", { pause: 2400 });
          await d.hover(".theme-pin-folder-btn", 1400);
          await d.click(".theme-pin-folder-btn", { pause: 1400 });
          await search(d, "");
        },
      },
      {
        cap: "⚖️ Compare 2 Themes: interactive split-screen wipe & spec diff",
        say: "To compare any two themes side by side, click Compare 2 Themes. A live split-screen stage opens with Theme A on the left and Theme B on the right. Drag the wipe slider back and forth to compare panels, glass, and typography directly, click Swap A and B, inspect the highlighted differences in the specification table below, and apply your winner in one click.",
        act: async (d) => {
          await d.click('[data-compare-themes="true"]', { pause: 1600 });
          await d.waitFor(".theme-compare-slider", 6000);
          await pick(d, "Left theme (Theme A)", "tesla_coil_plasma");
          await pick(d, "Right theme (Theme B)", "tahoe_liquid_glass");
          await slide(d, "Split comparison wipe position", 50, 22, 4);
          await slide(d, "Split comparison wipe position", 22, 78, 4);
          await slide(d, "Split comparison wipe position", 78, 50, 4);
          await d.click('[data-swap-compare="true"]', { pause: 1400 });
          await d.hover(".theme-compare-table", 1800);
          await d.click('[data-apply-compare="b"]', { pause: 1600 });
        },
      },
      {
        cap: "Day / Night pair & 4-Stage Solar Cycle (Dawn, Day, Dusk, Midnight)",
        say: "Next, click Day Night pair. You can pair your favorite light daytime theme with a dark nighttime theme, or enable the new four-stage Solar Cycle schedule. Click Auto-Fill Sci-Fi Solar Cycle to assign curated themes to Dawn, Solar Day, Golden Dusk, and Deep Midnight so your workspace evolves throughout the day.",
        act: async (d) => {
          await d.click(".dialog button >> Day / Night pair", { pause: 1600 });
          await d.waitFor('[data-solar-preset="scifi"]', 6000);
          await d.hover('select[aria-label="Daytime (Light) theme"]', 1100);
          await d.hover('select[aria-label="Nighttime (Dark) theme"]', 1100);
          await d.click('[data-solar-preset="scifi"]', { pause: 1800 });
          await d.hover('[data-solar-stage="dawn"]', 1100);
          await d.hover('[data-solar-stage="dusk"]', 1100);
          await d.hover('[data-solar-stage="night"]', 1100);
          await d.key("Escape", "Esc");
          await d.wait(1000);
        },
      },
      {
        cap: "Atmosphere FX: 172 live procedural shaders & hardware tiers",
        say: "Now click Atmosphere FX to open the live procedural shader studio. It includes one hundred and seventy-two real-time canvas effects harmonized with your active theme's palette, organized across Low Eco, Medium Volumetric, and High-End Modern ARM Ultra hardware tiers.",
        act: async (d) => {
          await d.click(".dialog button >> Atmosphere FX", { pause: 1800 });
          await d.waitFor(".fm-atmo-card", 6000);
          await d.hover(".fm-atmo-tier-bar", 1400);
          await d.click('.fm-atmo-tier-btn[data-tier="ultra"]', { pause: 1600 });
          await d.click('.fm-atmo-tier-btn[data-tier="auto"]', { pause: 1400 });
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
          await d.click('.fm-atmo-reactive-btn[data-reactive-mode="velocity"]', { pause: 1500 });
          await d.click('.fm-atmo-reactive-btn[data-reactive-mode="telemetry"]', { pause: 1500 });
          await d.click('.fm-atmo-reactive-btn[data-reactive-mode="audio"]', { pause: 1500 });
          await d.click('.fm-atmo-reactive-btn[data-reactive-mode="velocity"]', { pause: 1200 });
          await d.click('[data-surge-btn="true"]', { pause: 1800 });
          await d.click('[data-surge-btn="true"]', { pause: 1800 });
        },
      },
      {
        cap: "4-Layer Effect Mixer, 36 Signature Mixes & Custom Saved Presets",
        say: "The Multi-Effect Layer Mixer lets you combine up to four effects simultaneously. Pick one of thirty-six curated Signature Mixes like 2126 11D Hyperspace Fold, Wardenclyffe Overdrive, or Tahoe Liquid Glass Pro, or click Surprise Mix to generate a three-layer blend. Then type a preset name, click Save Preset for one-click recall, adjust the intensity slider, and click Apply effect.",
        act: async (d) => {
          await d.click('.fm-atmo-preset-btn[data-mix="tesseract_4d+calabi_yau+chronos_retrocausal"]', { pause: 2200 });
          await d.click('.fm-atmo-preset-btn[data-mix="plasma_storm+tesla_megacoil+ball_lightning"]', { pause: 2200 });
          await d.click(".fm-atmo-random-mix:not(.fm-atmo-surge-btn)", { pause: 2000 });
          await d.click('.fm-atmo-preset-btn[data-mix="liquid_glass_caustics+m4_raytrace_prism+aurora"]', { pause: 2200 });
          await d.eval(`(() => { const e = document.querySelector(".fm-atmo-preset-name-input"); if (e) { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); } })()`);
          await d.type("Hyper Glass 2126", 80);
          await d.click('[data-save-user-preset="true"]', { pause: 1600 });
          await d.hover(".fm-atmo-intensity input[type=range]", 1200);
          await d.click(".modal-backdrop:last-child .dialog button >> Apply effect", { pause: 1800 });
        },
      },
      {
        cap: "Keyboard theme browsing & ⌘⇧T from anywhere",
        say: "Back in the Themes gallery, you can rapid-preview themes from the keyboard using the arrow keys or the square bracket keys, and press Escape or Done when you're ready. From anywhere in the File Manager, Command Shift T, or Control Shift T on Windows and Linux, and Right Option T in the desktop app, opens the theme gallery immediately.",
        act: async (d) => {
          await d.click('[data-theme-step="1"]', { pause: 1200 });
          await d.click('[data-theme-step="1"]', { pause: 1200 });
          await d.click('[data-theme-step="-1"]', { pause: 1200 });
          await d.click(".modal-backdrop:last-child .dialog button >> Done", { pause: 1400 });
          await closeDialogs(d);
          await d.key("Meta+Shift+T", "⌘+⇧+T");
          await d.wait(1100);
          if (!(await d.eval<boolean>(`!!document.querySelector('.theme-card')`))) await d.eval(`window.openAppThemes?.()`);
          await d.wait(1800);
          await closeDialogs(d);
          await showKeys(d, ["Right ⌥", "T"]);
          await d.wait(1800);
        },
      },
      {
        cap: "Theme Editor: Auto-Harmonize, Invert Dark/Light & WCAG Contrast",
        say: "Now let's design our own theme. In the gallery, I click Create or edit a theme. Every color token has a visual picker and hex input, plus one-click Palette Tools: Randomize palette, Invert between Dark and Light mode, and Auto-harmonize from your Accent color. Below the colors, a live W C A G contrast inspector verifies every text and background pair with double-A and triple-A accessibility grades.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 1200 });
          await d.menu("All themes", { pause: 1400 });
          await d.click(".dialog button >> Create or edit a theme", { pause: 1800 });
          await d.waitFor(".dialog input[aria-label='Theme name']", 6000);
          await d.click('[data-harmony="random"]', { pause: 1600 });
          await d.click('[data-harmony="invert"]', { pause: 1600 });
          await d.click('[data-harmony="invert"]', { pause: 1600 });
          await d.click('[data-harmony="accent"]', { pause: 1600 });
          await d.hover(".theme-contrast-inspector", 2200);
        },
      },
      {
        cap: "12 Effect Style Presets, Liquid Glass, Iridescent Borders & 3D Parallax",
        say: "In the Glass, glow, materials and motion section, twelve one-click Effect Style Presets instantly configure complex shaders: Tahoe Liquid Glass, M4 Space Black XDR, Windows 11 Mica, Cyberpunk Hologram, Retro C R T Phosphor, or Plasma Reactor. Then fine-tune Panel opacity, Glass blur, Glow intensity, Border strength, and Backdrop saturation, choose Surface materials, Iridescent borders, Prism cursor trails, and optical flags like Specular XDR rim and 3D Parallax.",
        act: async (d) => {
          await d.click('[data-fx-preset="cyber_hologram"]', { pause: 1600 });
          await d.click('[data-fx-preset="plasma_reactor"]', { pause: 1600 });
          await d.click('[data-fx-preset="liquid_glass"]', { pause: 1600 });
          await slide(d, "Panel opacity", 68, 56, 3);
          await slide(d, "Glass blur", 28, 32, 1);
          await slide(d, "Glow intensity", 0.7, 1, 0.05);
          await slide(d, "Backdrop saturation", 1.35, 1.75, 0.1);
          await pick(d, "Surface material", "liquid");
          await pick(d, "Border style", "iridescent");
          await pick(d, "Cursor interaction", "prism");
          await d.click(".dialog input[aria-label='prismEdge effect']", { pause: 900 });
          await d.click(".dialog input[aria-label='parallax effect']", { pause: 900 });
        },
      },
      {
        cap: "Name, Export, Import & Save your custom theme",
        say: "You can even attach any of the one hundred and seventy-two atmospheric effects or thirty-six multi-layer mixes directly to your theme. I name our creation Midnight Liquid Glass, hover Export and Import for sharing themes as compact JSON text, and click Save theme.",
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
