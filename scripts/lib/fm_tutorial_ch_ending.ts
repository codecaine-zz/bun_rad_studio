import type { Chapter } from "./fm_tutorial_types";
import type { Do } from "../tutorial_file_manager";

/** Shows a key combination on screen (the desktop-only keys can't be pressed in a browser recording). */
const showKeys = (d: Do, keys: string[]) => d.eval(`window.__cc.keys(${JSON.stringify(keys)})`);

/** Closes any open dialog (saving a theme goes back to the gallery). */
async function closeDialogs(d: Do) {
  for (let i = 0; i < 4 && await d.eval<boolean>(`!!document.querySelector('.modal-backdrop')`); i++) {
    await d.key("Escape", "Esc");
    await d.wait(500);
  }
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
 * Applies a theme while the Theme Picker modal is CLOSED and keeps `folderFxOnly: true` active
 * so the viewer sees the 3D folder icons and crests in Icons View (#list.view-icons) with zero floating screen clutter!
 */
async function showThemeUnobstructed(
  d: Do,
  key: string,
  bannerTitle: string,
  bannerSub: string,
  opts: { anim?: string; hoverRow?: string; waitMs?: number } = {},
) {
  const anim = opts.anim || "folder_3d_spin_turntable";
  const waitMs = opts.waitMs ?? 1400;
  await d.eval(`(async () => {
    const backdrops = [...document.querySelectorAll('.modal-backdrop')];
    for (const b of backdrops) b.remove();
    const { state } = await import('/ui/state.js');
    const { applyPalette, applyUiImmersionProfiles } = await import('/ui/themes.js');
    const { syncVisibleIcons } = await import('/ui/dom.js');
    if (state?.settings) {
      state.settings.folderFxOnly = true;
      state.settings.atmosphere = 'none';
      state.settings.atmosphereTier = 'ultra';
      state.settings.themeIconAnimation = ${JSON.stringify(anim)};
    }
    document.documentElement.dataset.folderFxOnly = 'true';
    document.documentElement.dataset.fmIconAnim = ${JSON.stringify(anim)};
    applyPalette?.(${JSON.stringify(key)});
    applyUiImmersionProfiles?.({ folderFxOnly: true });
    const listEl = document.getElementById('list');
    if (listEl) syncVisibleIcons(listEl);

    let banner = document.getElementById('fm-unobstructed-theme-hud');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'fm-unobstructed-theme-hud';
      banner.style.cssText = 'position:fixed;top:10px;right:18px;z-index:9999;pointer-events:none;padding:8px 14px;border-radius:12px;background:rgba(9,13,24,0.92);border:1.5px solid var(--accent, #ff8c1a);color:#fff;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,0.55);backdrop-filter:blur(12px);max-width:480px;transition:all 0.2s ease;';
      document.body.appendChild(banner);
    }
    banner.innerHTML = '<div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent, #ff8c1a);">🎃 UNOBSTRUCTED 6K XDR ICONS VIEW · 3D FOLDER FX ONLY</div>'
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

const SF = ".db-studio-frame ||| iframe";
const S = `${SF} ||| `;

/** Chapters 22 to 26: themes & bulk custom theme import, the Databases Hub & Cross-Engine Cloning, live SQLite Studio inside the File Manager, and the closing summary. */
export const ending: Chapter[] = [
  {
    id: "22_themes",
    chapter: "THEMES & BULK IMPORT",
    title: "Theme Studio: Halloween 3D Folder FX Only Mode, Bulk Custom Theme Import, Gemini AI & WCAG Editor",
    blurb: "Halloween Ultra with 3D Folder Icon FX Only, unobstructed Icons View tour, Single & Bulk Folder Import (custom_themes/), Google Gemini AI Theme Customizer, Split-Screen Compare & WCAG Theme Editor",
    path: "<HOME>/Projects/shop-app",
    setup: (w) => {
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
        cap: "Halloween Ultra & 3D Folder Icon FX Only Mode in Unobstructed Icons View",
        say: "Welcome to the Theme Studio on our Apple Mac Studio M4 Ultra. First, let's switch to Icons View so you can see the entire workspace unobstructed. In our Halloween Carved Jack-O'-Lantern Ultra theme with Folder Effects Only mode enabled, every folder keeps its sculpted three-D turntable animation and holiday crest badge, while floating screen particles, smoke, and toolbar button overrides stay out of the way so your files and text remain razor sharp.",
        act: async (d) => {
          await d.click("#status-views button >> Icons", { pause: 1200 });
          await showThemeUnobstructed(
            d,
            "holiday_halloween_jack_o_lantern",
            "🎃 Halloween Carved Jack-O'-Lantern Ultra",
            "3D Turntable Folders & 🎃 Crests Active · Floating Screen FX Off (Folder FX Only)",
            { anim: "folder_3d_spin_turntable", hoverRow: "custom_themes", waitMs: 2200 },
          );
          await d.hover('#list .row[data-name="shaders"]', 1400).catch(() => {});
          await d.hover('#list .row[data-name="ai-models"]', 1400).catch(() => {});
        },
      },
      {
        cap: "Touring Ultra Color Palettes & Holiday 3D Folder Crests with Zero Clutter",
        say: "With the dialog closed, watch how switching themes transforms the color palette and three-D folder crests across all eighteen U S Holiday themes and our flagship workstation palettes—including Polar Night, Mac Studio M4 Ultra, Fourth of July Fireworks, Thanksgiving Harvest, Christmas Nutcracker Hearth, and back to Halloween Jack-O'-Lantern—all while keeping non-folder screen effects suppressed.",
        act: async (d) => {
          const tour: Array<[string, string, string]> = [
            ["polar_night", "🌌 Polar Night Ultra", "Arctic Slate Palette · 3D Folders Only"],
            ["mac_studio_m4_ultra", "🍎 Mac Studio M4 Ultra Titanium", "Space-Black Titanium Palette · 3D Folders Only"],
            ["holiday_fourth_of_july_fireworks", "🎆 Fourth of July Ultra", "3D 🎆 Liberty Folder Crests · Folder FX Only"],
            ["holiday_thanksgiving_harvest_hearth", "🦃 Thanksgiving Harvest Ultra", "3D 🦃 Harvest Folder Crests · Folder FX Only"],
            ["holiday_christmas_nutcracker_hearth", "🎄 Christmas Nutcracker Hearth", "3D 🎄 Evergreen Folder Crests · Folder FX Only"],
            ["holiday_halloween_jack_o_lantern", "🎃 Halloween Carved Jack-O'-Lantern", "3D 🎃 Pumpkin Folder Crests · Folder FX Only"],
          ];
          for (const [key, title, sub] of tour) {
            await showThemeUnobstructed(d, key, title, sub, { anim: "folder_3d_spin_turntable", waitMs: 1700 });
          }
          await clearUnobstructedBanner(d);
        },
      },
      {
        cap: "The Theme Gallery, Single Custom Theme Import & Bulk Folder Import (custom_themes/)",
        say: "Open the Themes menu to browse over three hundred built-in themes plus twenty Master Custom Themes across Low, Medium, High, and Ultra hardware tiers. If you open the custom themes folder in the File Manager and click Share and Import, you can paste a single theme code or click Load Current Folder Themes to bulk-import every custom theme file in the open directory at once, complete with automatic conflict resolution.",
        act: async (d) => {
          await d.row("custom_themes", "dblclick", { pause: 1400 });
          await d.click("#viewbar-themes", { pause: 900 });
          await d.menu("All themes", { pause: 1200 });
          await d.waitFor(".theme-card", 6000);
          await d.click('[data-share-hub="true"]', { pause: 1200 });
          await d.waitFor('[data-share-import-current-folder-btn="true"]', 6000);
          await d.hover('[data-share-import-current-folder-btn="true"]', 1000).catch(() => {});
          await d.click('[data-share-import-current-folder-btn="true"]', { pause: 1300 }).catch(() => {});
          await d.click('[data-share-import-apply="true"]', { pause: 1300 }).catch(() => {});
          if (await d.eval<boolean>(`!!document.querySelector('[data-conflict-summary="true"]')`)) {
            await d.click('[data-conflict-bulk="replace"]', { pause: 900 }).catch(() => {});
            await d.click('.modal-backdrop:last-child .dialog [data-dialog-btn="confirm"]', { pause: 1200 }).catch(() => {});
          }
          await closeDialogs(d);
          await d.click("#tool-up", { pause: 1000 }).catch(() => {});
        },
      },
      {
        cap: "Google Gemini AI Theme Customizer, Split-Screen Compare, WCAG Editor & Shortcuts",
        say: "Inside Share and Import, the Google Gemini A I Theme Customizer generates WCAG-verified themes from plain English descriptions. You can also open Compare and Blend to drag a live split-screen wipe between two themes or crossfade them in O K Lab color space, open Create or edit a theme to inspect contrast ratios live, and press Command Comma for Settings or F1 for the interactive keyboard shortcut guide.",
        act: async (d) => {
          await d.click("#viewbar-themes", { pause: 800 });
          await d.menu("All themes", { pause: 1000 });
          await d.click('[data-compare-themes="true"]', { pause: 1300 });
          await d.waitFor(".theme-compare-slider", 6000);
          await pick(d, "Left theme (Theme A)", "polar_night");
          await pick(d, "Right theme (Theme B)", "holiday_halloween_jack_o_lantern");
          await slide(d, "Split comparison wipe position", 50, 25, 5);
          await slide(d, "Split comparison wipe position", 25, 75, 5);
          await closeDialogs(d);
          await showThemeUnobstructed(
            d,
            "holiday_halloween_jack_o_lantern",
            "🎃 Halloween Carved Jack-O'-Lantern Ultra",
            "3D Folder Icon FX Only · Switching to Details View for Databases",
            { anim: "folder_3d_spin_turntable", waitMs: 1100 },
          );
          await clearUnobstructedBanner(d);
          await d.click("#status-views button >> Details", { pause: 800 }).catch(() => {});
          await d.key("F1", "F1");
          await d.waitFor(".dialog", 6000);
          await d.hover(".dialog", 1400);
          await closeDialogs(d);
        },
      },
    ],
  },

  {
    id: "23_databases",
    chapter: "DATABASES HUB & CLONING",
    title: "The Databases Hub: All 4 Engines, Sample Databases, Bulk Cross-Engine Cloning & Bun JS Macros",
    blurb: "SQLite, MySQL / MariaDB, PostgreSQL & Redis connections, 1-click synthetic sample databases, bulk Cross-Engine Database & Table Cloning, and Bun JavaScript DAO Macros",
    path: "<HOME>/Projects/shop-app/data",
    setup: (w) => {
      w.put(
        "Projects/shop-app/data/new-customers.csv",
        "name,email,country\nElena Vance,elena@example.com,US\nMarco Bellini,marco@example.com,IT\nSora Takahashi,sora@example.com,JP\n",
      );
    },
    steps: [
      {
        cap: "Database & CSV files in the File List: right-click to open, connect, or bulk stage-import",
        say: "Now let's explore the built-in Database Studios. In our project's data folder, we have shop dot s q lite and a C S V spreadsheet of new customers. Notice that the Type column recognizes S Q Lite files by reading their magic bytes. Right-click shop dot s q lite to open it directly in S Q Lite Studio, launch it in a separate window or browser, or save it as a named connection. And right-clicking any C S V, J S O N, or Parquet file offers Load into a database with staging first.",
        act: async (d) => {
          await d.row("shop.sqlite", "click", { pause: 900 });
          await d.row("shop.sqlite", "rclick", { pause: 900 });
          await d.hover(".menu [role^=menuitem] >> Open in SQLite Studio", 1100);
          await d.hover(".menu [role^=menuitem] >> Add as database connection", 1200);
          await d.click(".menu [role^=menuitem] >> Add as database connection", { pause: 1300 });
          await d.waitFor(".dialog", 6000);
          await d.hover(".dialog", 1200);
          await d.click(".dialog button >> Save", { pause: 1400 });
        },
      },
      {
        cap: "The Databases Hub: SQLite, MySQL, PostgreSQL, Redis & Test Connection",
        say: "Saving the connection registers it in the Databases Hub inside Tools. Across the top toolbar, you can add connections for S Q Lite, My S Q L and Maria D B, Postgre S Q L, or Redis, create a new S Q Lite file, clone databases across engines, open the Bun JavaScript Macro Studio, create a synthetic sample database, paste a connection U R I, or import settings from a dot env file. Click shop dot s q lite in the list and press Test connection to verify the S Q Lite engine version and table count.",
        act: async (d) => {
          await d.click("#view-tools", { pause: 600 });
          await d.click("#power-tab-databases", { pause: 1200 });
          await d.eval(`[...document.querySelectorAll('#power-body button')].filter((b) => /^(Never for this one|Not now)$/.test(b.textContent.trim())).forEach((b) => b.click())`);
          await d.wait(500);
          for (const btn of [
            "button >> Add connection",
            "button >> New SQLite database",
            "button >> Clone database",
            "button >> Macros (Bun JS)",
            "button >> New sample database",
          ]) {
            await d.hover(btn, 900);
          }
          await d.click(".db-row >> shop.sqlite", { pause: 1000 });
          await d.click("button >> Test connection", { pause: 2200 });
        },
      },
      {
        cap: "New Sample Database: 11 realistic synthetic databases in one click",
        say: "Need realistic test data for bulk queries or demos? Click New sample database and choose from eleven synthetic industry schemas—including Hospital E H R, Medicare Formulary, Retail Banking, Airline Reservations, and E-Commerce. Pick Small, name it hospital demo, and click Create sample database to generate and register the database in a single second.",
        act: async (d) => {
          await d.click("button >> New sample database", { pause: 1200 });
          await d.waitFor(".dialog", 6000);
          await d.scroll(".dialog label >> Hospital EHR", 140, 4).catch(() => {});
          await d.click(".dialog label >> Hospital EHR", { pause: 1100 });
          await d.click(".dialog label >> Small", { pause: 900 });
          await d.eval(`(() => { const i = [...document.querySelectorAll('.dialog input')].find((x) => x.value.startsWith('sample_')); if (i) { i.focus(); i.select(); i.value = 'hospital_demo'; i.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
          await d.wait(500);
          await d.click(".dialog button >> Create sample database", { pause: 2400 });
        },
      },
      {
        cap: "Bulk Cross-Engine Database & Table Cloning (SQLite, MySQL, PostgreSQL & Redis)",
        say: "To copy tables or migrate an entire database in bulk between S Q Lite, My S Q L, Postgre S Q L, and Redis, click Clone database or tables. Select your source database, inspect its tables and row counts, choose which tables, views, indexes, and foreign keys to include, and pick any destination connection or a new S Q Lite file. Let's clone shop dot s q lite into a brand-new backup database in one click.",
        act: async (d) => {
          await d.click(".db-row >> shop.sqlite", { pause: 800 });
          await d.click("button >> Clone database", { pause: 1400 });
          await d.waitFor(".dialog", 6000);
          await d.hover(".dialog", 1800);
          await d.click(".dialog .btn.primary", { pause: 2200 }).catch(() => {});
          await closeDialogs(d);
        },
      },
      {
        cap: "Bun JS & Visual Macro Studio (CurrentDb, OpenRecordset, DLookup & DoCmd)",
        say: "And for repeatable bulk database automation, click Macros Bun J S. You can build Microsoft Access-style visual action rows or write full JavaScript and TypeScript modules using Current D b dot query, Open Recordset, D Lookup, D Count, D Sum, Do Command dot Run S Q L, and savepoint transactions across any saved connection.",
        act: async (d) => {
          await d.click("button >> Macros (Bun JS)", { pause: 1500 });
          await d.waitFor(".dialog", 6000);
          await d.hover(".dialog", 2200);
          await closeDialogs(d);
        },
      },
    ],
  },

  {
    id: "24_sqlite",
    chapter: "SQLITE STUDIO MASTERCLASS",
    title: "SQLite Studio Inside the File Manager: Data Grid, Bulk Edit, Schema, SQL, Macros & Staging Import",
    blurb: "Live embedded SQLite Studio walkthrough: sorting, filtering, totals row, printable reports, form & inline CRUD, visual table designer, ER schema, SQL & visual query designer, explain plan, backup dump & bulk CSV staging import",
    path: "<HOME>/Projects/shop-app/data",
    before: async (d) => {
      await d.eval(`(async () => {
        const { call } = await import('/ui/api.js');
        const { currentPath } = await import('/ui/state.js');
        const dir = currentPath();
        await call('db/profile/save', {
          profile: {
            name: 'shop.sqlite',
            engine: 'sqlite',
            path: dir + '/shop.sqlite',
            sqliteMode: 'readwrite',
            environment: 'development',
          },
          source: 'manual',
        }).catch(() => {});
      })()`);
      await d.click("#view-tools", { pause: 600 });
      await d.click("#power-tab-databases", { pause: 1200 });
      await d.eval(`[...document.querySelectorAll('#power-body button')].filter((b) => /^(Never for this one|Not now)$/.test(b.textContent.trim())).forEach((b) => b.click())`);
      await d.wait(500);
    },
    steps: [
      {
        cap: "Open in SQLite Studio: embedded frame, Focus mode & the 8 Studio Tabs",
        say: "Let's select shop dot s q lite and click Open in S Q Lite Studio. The File Manager starts the real S Q Lite Studio server on a private local port and embeds it right inside this tab. Click O K on the startup greeting, and click Focus in the top bar so the studio gets the entire window. On the left are our tables—customers, orders, and products—and across the top are the eight studio tabs: Grid, Designer, Macros, Schema, Explain, J S O N, Audit, and Pragma.",
        act: async (d) => {
          await d.click(".db-row >> shop.sqlite", { pause: 800 });
          await d.click("button >> Open in SQLite Studio", { pause: 800 });
          await d.waitFor(S + "#msgBoxBtnOk", 30000);
          await d.wait(800);
          await d.click(S + "#msgBoxBtnOk", { pause: 900 });
          await d.click("#focus-toggle", { pause: 1200 });
          await d.click(S + ".tree-item-title >> customers", { pause: 1000 });
          for (const t of ["Grid", "Designer", "Macros", "Schema", "Explain", "Json", "Audit", "Pragma"]) {
            await d.hover(S + `#tabBtn${t}`, 550);
          }
          await d.click(S + "#tabBtnGrid", { pause: 600 });
        },
      },
      {
        cap: "Data Grid: sorting, live row filter, Totals footer row, Columns & Printable Report",
        say: "In the Data Grid, click any column header such as name to sort ascending or descending. Type into the Filter rows box to narrow the table across every column in real time, then clear it. Click Totals to pin a footer row showing the total row count and numeric sums and averages, use Columns to show or hide individual fields, or click Report to generate a clean, print-ready HTML datasheet.",
        act: async (d) => {
          await d.click(S + "th >> name", { pause: 1200 });
          await d.click(S + "th >> name", { pause: 1100 });
          await d.click(S + "#gridSearchInput", { pause: 400 });
          await d.type("US", 110);
          await d.wait(1300);
          await d.c.evalFrame(SF, `(() => { const e = document.querySelector('#gridSearchInput'); if (e) { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
          await d.wait(800);
          await d.click(S + "#btnToggleTotals", { pause: 1400 });
          await d.click(S + "#btnAccessReport", { pause: 1800 });
          await d.key("Escape", "Esc");
          await d.wait(600);
        },
      },
      {
        cap: "Adding, Inline-Editing & Bulk Managing Rows Without Writing SQL",
        say: "To add a record without writing S Q L, click New Row, fill in the generated form, and save. You can also double-click any cell in the grid to edit it inline and press Enter, or tick multiple rows with the checkboxes to duplicate, export for spreadsheets, or delete in bulk with confirmation.",
        act: async (d) => {
          await d.click(S + "button >> ➕ New Row", { pause: 1200 });
          await d.hover(S + "[class*=modal]", 1400).catch(() => {});
          await d.key("Escape", "Esc");
          await d.wait(600);
          await d.click(S + ".tree-item-title >> products", { pause: 1200 });
          await d.hover(S + "tbody tr", 1400);
        },
      },
      {
        cap: "Visual Table Designer, ER Schema Diagram, SQL Editor & Visual Query Designer",
        say: "Click New Table or Design Table to add or modify columns, primary keys, and foreign keys visually with a live D D L preview. Switch to the Schema tab to inspect your tables and foreign-key relationships on an interactive E R diagram, or open the Designer tab to write S Q L queries with presets, visual table joins, and one-click Explain Query Plan analysis.",
        act: async (d) => {
          await d.click(S + "button >> 🛠️ Design Table", { pause: 1500 });
          await d.hover(S + "[class*=modal]", 1400).catch(() => {});
          await d.click(S + "[class*=modal] button >> Cancel", { pause: 800 }).catch(() => d.key("Escape", "Esc"));
          await d.click(S + "#tabBtnSchema", { pause: 1800 });
          await d.click(S + "#tabBtnDesigner", { pause: 1800 });
          await d.click(S + "#tabBtnExplain", { pause: 1500 });
        },
      },
      {
        cap: "Macros, JSON Inspector, Audit Log, PRAGMAs, 1-Click Backup Dump & Bulk Staging Import",
        say: "Across the remaining tabs, you can build automated visual macros, inspect nested J S O N columns, review the complete SQL audit log, tune S Q Lite W A L and cache pragmas, export a one-click S Q L backup dump, or open the Import Staging Wizard to validate and preview bulk C S V and J S O N files before a single row is committed to your table.",
        act: async (d) => {
          await d.click(S + "#tabBtnMacros", { pause: 1300 });
          await d.click(S + "#tabBtnJson", { pause: 1200 });
          await d.click(S + "#tabBtnAudit", { pause: 1200 });
          await d.click(S + "#tabBtnPragma", { pause: 1300 });
          await d.click(S + "#tabBtnGrid", { pause: 900 });
          await d.click(S + "#crudHdrImport", { pause: 1600 }).catch(() => {});
          await d.hover(S + "[class*=modal]", 1400).catch(() => {});
          await d.key("Escape", "Esc");
          await d.wait(600);
          await d.click("#focus-toggle", { pause: 900 });
        },
      },
    ],
  },

  {
    id: "26_outro",
    chapter: "THE END",
    title: "That is the tour",
    kind: "card",
    card: {
      kicker: "Free and open source · Recorded on Apple Mac Studio M4 Ultra · Pro Display XDR 6K 120Hz",
      title: "Thank you for watching",
      lines: [
        "Download: github.com/codecaine-zz/bun_rad_studio",
        "All 33 Power Tools · Phonon TTS (Zoey) · 5s Voice Cloning · Ollama AI · 4 Databases",
        "🎃 Halloween Ultra (3D Folder FX Only) · Press F1 or ⌘⇧P inside the app any time",
        "🍎 Apple Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz",
      ],
    },
    steps: [
      {
        cap: "Thank you for watching · Codecaine File Manager Complete Masterclass",
        say: "And that is the complete tour of the Codecaine File Manager. You have seen how to navigate at top speed, filter and select in bulk, copy and move safely across dual panes and the background task queue, preview anything with Spacebar Quick Look, and lock sensitive files with A E S two-fifty-six encryption. You have seen how the synced terminal and file list follow each other automatically, how to bulk-rename, diff folders, and replace text across an entire project, and how to use all thirty-three built-in tools—including the Image and Media Studios with reusable batch presets, Media Deck, Paint, all sixty arcade games, the Ollama Phonon Voice and Read-Along Video Studio with my voice Zoey and five-second voice cloning, the local Ollama A I Assistant, the Theme Studio in our Halloween Ultra theme with three-D folder effects only, and the four built-in database studios. Everything is free, open source, and safe by default. Thank you so much for watching!",
      },
    ],
  },
];
