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
    id: "22_themes", chapter: "YOUR WAY", title: "Make it yours: themes, effects and shortcuts", blurb: "Futuristic themes, glass and glow effects, panel opacity, and keys to switch themes instantly",
    path: "<HOME>/Projects/shop-app",
    steps: [
      {
        cap: "The Themes button",
        say: "Let's make the File Manager look the way you like. The Themes button, in the ribbon, changes the colours of the whole app. Your most recent themes are listed first, so your favourites are always one click away.",
        act: async (d) => { await d.click("#tool-themes", { pause: 1800 }); await d.hover(".menu", 2200); },
      },
      {
        cap: "All themes: search the gallery",
        say: "I choose All themes. A gallery opens, with a little preview of every theme, in groups. Dark, light, futuristic, and the looks of other systems and code editors. You can search by name. I type prism, and click Prism Reactor. The whole window changes at once.",
        act: async (d) => {
          await d.menu("All themes", { pause: 1800 });
          await d.waitFor(".theme-card", 6000);
          await d.scroll(".theme-list", 700, 6).catch(() => {});
          await d.wait(900);
          await search(d, "prism");
          await d.click(".theme-card >> Prism Reactor", { pause: 2600 });
        },
      },
      {
        cap: "Futuristic themes: glass, glow and motion",
        say: "The futuristic themes go further than colour. Panels are made of frosted glass, edges glow, and there is a gentle living light behind everything. Here is Orbital Ice, cool and calm. And Ember Grid, warm and bold. Each one keeps text easy to read, because every theme is checked for contrast.",
        act: async (d) => {
          await search(d, "orbital");
          await d.click(".theme-card >> Orbital Ice", { pause: 2800 });
          await search(d, "ember");
          await d.click(".theme-card >> Ember Grid", { pause: 2600 });
          await d.dialog("Done", { pause: 1500 });
        },
      },
      {
        cap: "Create or edit a theme",
        say: "Now let's make our own. In the gallery, I press Create or edit a theme. It starts from the theme I am using, Ember Grid, so its effects are already switched on. Every colour can be changed, with a colour picker or a hex code. And below the colours, glass, glow and motion.",
        act: async (d) => {
          await d.click("#tool-themes", { pause: 1400 });
          await d.menu("All themes", { pause: 1600 });
          await d.click(".dialog button >> Create or edit a theme", { pause: 1800 });
          await d.waitFor(".dialog input[aria-label='Theme name']", 6000);
          await d.hover(".dialog .theme-field", 2000);
          await d.hover(".dialog input[aria-label='Enable visual effects']", 1500);
        },
      },
      {
        cap: "Panel opacity and glass blur",
        say: "Panel opacity sets how see through the panels are. I slide it down, and you can see the light glowing through. Glass blur softens what is behind them. And Glow intensity, and Border strength, control how bright the edges are.",
        act: async (d) => {
          await slide(d, "Panel opacity", 100, 62, 2);
          await slide(d, "Glass blur", 16, 28, 1);
          await slide(d, "Glow intensity", 0.5, 1, 0.05);
          await slide(d, "Border strength", 0.16, 0.5, 0.02);
        },
      },
      {
        cap: "Glow, corners, borders, motion and texture",
        say: "There is more. Glow style, from none to soft to neon. Two glow colours. Corners, from sharp to round to pill shaped. Borders, flat, gradient or metal. How lively the animations feel. And extras like an ambient light, a sheen, film grain and scanlines, for a real science fiction look.",
        act: async (d) => {
          await pick(d, "Glow style", "neon");
          await pick(d, "Corner style", "round");
          await pick(d, "Border style", "gradient");
          await pick(d, "Animation feel", "spring");
          await d.click(".dialog input[aria-label='ambient effect']", { pause: 900 });
          await d.click(".dialog input[aria-label='sheen effect']", { pause: 900 });
          await pick(d, "Scanlines", "subtle");
        },
      },
      {
        cap: "Name it, save it, share it",
        say: "I give it a name, Midnight Glass, and press Save theme. It now appears in the gallery with all the others. Export turns a theme into a short piece of text, so you can keep it, or send it to a friend. And Import brings one back.",
        act: async (d) => {
          await d.eval(`(() => { const e = document.querySelector(".dialog input[aria-label='Theme name']"); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); })()`);
          await d.type("Midnight Glass", 95);
          await d.hover(".dialog button >> Export", 1200);
          await d.dialog("Save theme", { pause: 2200 });
          await closeDialogs(d);
        },
      },
      {
        cap: "Right ⌥ + ] and [ : next and previous theme",
        say: "Here is a quick shortcut, in the desktop app. Hold the right Option key, and press the closing square bracket. That switches to the next theme. Press it again, and again, to flip through them all. Right Option and the opening square bracket goes back. It is the fastest way to find a look you love.",
        act: async (d) => {
          await closeDialogs(d);
          for (let i = 0; i < 4; i++) { await showKeys(d, ["Right ⌥", "]"]); await d.eval(`window.cycleAppTheme(1)`); await d.wait(1500); }
          await showKeys(d, ["Right ⌥", "["]); await d.eval(`window.cycleAppTheme(-1)`); await d.wait(1500);
        },
      },
      {
        cap: "Right ⌥ + / full screen · ⌘Q quits",
        say: "Two more shortcuts for the desktop app. Right Option and the slash key turns full screen on, and off again. The Escape key never throws you out of full screen by accident, so you can use Escape freely to close menus and windows. And Command Q quits the app, just like every other Mac program.",
        act: async (d) => { await showKeys(d, ["Right ⌥", "/"]); await d.wait(2600); await showKeys(d, ["Esc"]); await d.wait(2200); await showKeys(d, ["⌘", "Q"]); await d.wait(1500); },
      },
      {
        cap: "Change any keyboard shortcut",
        say: "And every keyboard shortcut can be changed. Press F1 for Help, then Change keyboard shortcuts. Pick an action, press the keys you want, and it is saved. Two actions can never share the same keys. If you try, it tells you which action already uses them.",
        act: async (d) => { await closeDialogs(d); await d.key("F1", "F1"); await d.waitFor(".dialog", 6000); await d.hover(".dialog", 1800); await d.click(".dialog .btn >> Change keyboard shortcuts", { pause: 1800 }).catch(() => {}); await d.hover(".dialog", 2500); },
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
        cap: "Next: SQLite Studio, then MySQL Studio",
        say: "Next, we will go through two of them completely, step by step. First SQLite Studio, from finding a database file in your folders, to browsing, editing, designing tables and writing queries. Then MySQL Studio, from connecting to a server, to the workbench, backups and imports. Just like before, take your time, and pause whenever you like.",
        act: async (d) => { await d.hover("#power-body", 4000); },
      },
    ],
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
        say: "And that is the whole tour. You have seen how to find your way around, copy and move safely, and preview anything. How the terminal and your files follow each other, so you never type a long path again. Every tool in the toolbox. Themes that are truly yours. And the database studios. Everything is safe by default. Deleting goes to the Recycle Bin, nothing is overwritten silently, and big changes are shown to you first. The guides are in the docs folder, and you can press F1 inside the app at any time. Thank you so much for watching.",
      },
    ],
  },
];
