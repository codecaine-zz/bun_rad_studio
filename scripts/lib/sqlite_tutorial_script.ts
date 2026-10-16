import type { Chapter } from "./fm_tutorial_types";
import { S, openDatabasesTool, saveFoundConnection, setValue, skipWelcome } from "./sqlite_tutorial_helpers";

/** Chapters 0 to 4: the File Manager's side of databases. Finding a file, the Databases tool, a sample database, opening the studio. */
export const fmChapters: Chapter[] = [
  {
    id: "00_intro", chapter: "WELCOME", title: "Welcome", kind: "card",
    card: { kicker: "Databases in the Codecaine File Manager", title: "SQLite, from the File Manager", lines: ["Find it. Connect it. Explore it.", "Browse, edit, query, design, import, back up", "Free and open source"] },
    steps: [{
      cap: "SQLite Studio, inside the File Manager",
      say: "Welcome. In this tutorial you work with S Q Lite databases without leaving the Codecaine File Manager. You find a database in your files, save it as a connection, open S Q Lite Studio inside the window, and use all of it. Everything happens on made up sample data. Let's begin.",
    }],
  },

  {
    id: "01_find", chapter: "FIND IT", title: "A database in the file list", blurb: "Open it from the right-click menu",
    steps: [
      {
        cap: "A real database file in the file list",
        say: "We start in the ordinary file list. This folder holds a database called shop dot s q lite, a C S V file of new customers, and a note. The Type column says S Q Lite file, because the File Manager reads the first bytes of the file, not just its name.",
        act: async (d) => { await d.hover("#list .row >> new-customers.csv", 900); await d.click("#list .row >> shop.sqlite", { pause: 1500 }); },
      },
      {
        cap: "Right-click: Open in SQLite Studio",
        say: "Right click the database. Besides the usual file commands there are four database commands. Open in S Q Lite Studio shows the studio inside this tab. The next two open it in its own window, or in your browser. The last saves it as a connection.",
        act: async (d) => {
          await d.rclick("#list .row >> shop.sqlite", { pause: 900 });
          await d.hover(".menu [role^=menuitem] >> Open in SQLite Studio", 1300);
          await d.hover(".menu [role^=menuitem] >> in its own window", 1400);
          await d.hover(".menu [role^=menuitem] >> in my browser", 1400);
          await d.hover(".menu [role^=menuitem] >> Add as database connection", 1600);
        },
      },
      {
        cap: "Load a CSV into a database, then Find & more → Databases",
        say: "A data file gets a database command too: Load into a database, staging first. We use it near the end. Everything is organised in the Databases tool, so open Find and more, and choose the Databases tab.",
        act: async (d) => {
          await d.key("Escape");
          await d.wait(500);
          await d.rclick("#list .row >> new-customers.csv", { pause: 900 });
          await d.hover(".menu [role^=menuitem] >> Load into a database", 1800);
          await d.key("Escape");
          await d.wait(400);
          await d.click("#tool-power", { pause: 900 });
          await d.click("#power-tab-databases", { pause: 1500 });
        },
      },
    ],
  },

  {
    id: "02_connections", chapter: "CONNECTIONS", title: "Saving and testing a connection", blurb: "The Databases tool, step by step",
    before: async (d) => { await skipWelcome(d); await d.wait(400); await openDatabasesTool(d); },
    steps: [
      {
        cap: "The Databases tool: add, paste, import",
        say: "This is the Databases tool. You can add a connection for S Q Lite, My S Q L, Postgres or Redis, create a sample database, paste a connection address, or read settings from the environment or a dot env file. A saved connection is used instead of environment variables.",
        act: async (d) => {
          for (const t of ["button >> Add connection", "button >> New sample database", "button >> Paste address", "button >> Import from environment", "button >> Import .env file"]) await d.hover(t, 1100);
          await d.hover("input >> @Filter connections", 900);
        },
      },
      {
        cap: "Found in your environment → Save to the manager",
        say: "The tool also looks around for you. Here it found an S Q Lite path in a dot env file, and it says exactly where each value came from. Nothing has connected, and a password would never be shown. Press Save to the manager, and then Done.",
        act: async (d) => {
          await d.hover("button >> Save to the manager", 2200);
          await d.click("button >> Save to the manager", { pause: 2600 });
          await d.click(".dialog button >> Done", { pause: 900 });
        },
      },
      {
        cap: "Details and the Effective settings table",
        say: "Click the connection for its details. It is an S Q Lite file, opened for reading and writing, with no password. The Effective settings table shows every value the studio will use, and where it came from: the connection first, then your defaults, then environment variables.",
        act: async (d) => {
          await d.click(".db-row", { pause: 1800 });
          await d.scroll("button >> Test connection", 420, 8);
          await d.wait(2200);
          await d.scroll("button >> Test connection", -420, 8);
        },
      },
      {
        cap: "Test connection",
        say: "Test connection is an explicit click, never automatic. It opens the file read only, and answers in plain words: it works, the S Q Lite version, and how many tables and views it found.",
        act: async (d) => { await d.click("button >> Test connection", { pause: 3500 }); },
      },
      {
        cap: "Edit: environment, tags, read-only",
        say: "Edit lets you name the connection, add a folder and tags, mark a favourite, and choose its environment: development, test, staging or production. You can also mark it read only. Duplicate copies it, and Delete asks first.",
        act: async (d) => {
          await d.click("button >> Edit…", { pause: 1200 });
          await d.hover(".dialog select", 1500);
          await d.hover(".dialog label >> Read-only", 1500);
          await d.click(".dialog button >> Cancel", { pause: 800 });
          await d.hover("button >> Duplicate", 900);
          await d.hover("button >> Delete…", 900);
        },
      },
    ],
  },

  {
    id: "03_sample", chapter: "SAMPLE DATA", title: "A sample database in one click", blurb: "Eleven realistic, synthetic databases",
    before: async (d) => { await skipWelcome(d); await d.wait(400); await openDatabasesTool(d); await saveFoundConnection(d); },
    steps: [
      {
        cap: "New sample database…",
        say: "Need data to play with? New sample database creates a brand new S Q Lite file filled with realistic, but completely made up, data. Choose one of eleven: a hospital, an insurer, a bank, an airline, a marketplace and more. I pick Hospital E H R.",
        act: async (d) => {
          await d.click("button >> New sample database", { pause: 1500 });
          await d.scroll(".dialog label >> Hospital EHR", 140, 5);
          await d.click(".dialog label >> Hospital EHR", { pause: 1500 });
        },
      },
      {
        cap: "Size, file name, created and saved as a connection",
        say: "Choose a size, a folder and a file name. An existing file is never overwritten. I keep small, and call it hospital demo. Create, and a second later the file exists and is saved as a connection, with the tag sample.",
        act: async (d) => {
          await d.click(".dialog label >> Small", { pause: 1000 });
          await d.eval(`(() => { const i = [...document.querySelectorAll('.dialog input')].find((x) => x.value.startsWith('sample_')); i.focus(); i.select(); })()`);
          await d.type("hospital_demo", 60);
          await d.wait(400);
          await d.click(".dialog button >> Create sample database", { pause: 3500 });
          await d.hover(".db-row >> Hospital", 1500);
        },
      },
    ],
  },

  {
    id: "04_studio", chapter: "THE STUDIO", title: "SQLite Studio inside the File Manager", blurb: "Start it, control it, find your way around",
    before: async (d) => { await skipWelcome(d); await d.wait(400); await openDatabasesTool(d); await saveFoundConnection(d); await d.click(".db-row", { pause: 700 }); },
    steps: [
      {
        cap: "Open in SQLite Studio",
        say: "Select the shop connection and press Open in S Q Lite Studio. The File Manager starts the real studio on a private port of this computer and shows its page in a frame, right in this tab. It greets you with a message from a startup macro. Press O K.",
        act: async (d) => {
          await d.click("button >> Open in SQLite Studio", { pause: 500 });
          await d.waitFor(S + "#msgBoxBtnOk", 30000);
          await d.wait(1200);
          await d.click(S + "#msgBoxBtnOk", { pause: 800 });
        },
      },
      {
        cap: "Running, Stop, Restart, window, browser",
        say: "Above the studio is its status. Stop shuts it down, Restart starts it again, Open in a separate window gives it a desktop window, and Open in my browser shows it in your browser. The log hides every secret.",
        act: async (d) => {
          for (const t of [".db-state", "button >> Stop", "button >> Restart", "button >> Open in a separate window", "button >> Open in my browser"]) await d.hover(t, 900);
          await d.click("summary >> Log", { pause: 2000 });
          await d.click("summary >> Log", { pause: 500 });
        },
      },
      {
        cap: "Focus, then the header and database panel",
        say: "The studio is a big program, so press Focus. It hides the toolbar and gives the studio the room. The header has a theme switcher and the main actions. On the left is the active database in W A L mode.",
        act: async (d) => {
          await d.click("#focus-toggle", { pause: 1500 });
          await d.hover(S + "#ddStudioTheme", 1000);
          for (const t of ["button >> Seed Sample DB", "button >> Vacuum DB", "button >> Integrity Check", "#btnDbBackupDump", "#btnShortcuts", "#crudHdrNew", "#crudHdrImport"]) await d.hover(S + t, 600);
          await d.hover(S + "button >> Browse & Load", 900);
        },
      },
      {
        cap: "Sidebar: tables, views, queries, macros",
        say: "The sidebar lists the tables with their row counts, then views, saved queries and macros. Click a table to open it. The search box finds any object by name.",
        act: async (d) => {
          await d.click(S + ".tree-item-title >> customers", { pause: 900 });
          await d.click(S + "#searchObjects", { pause: 500 });
          await d.type("order", 90);
          await d.wait(1500);
          await setValue(d, "#searchObjects", "");
        },
      },
      {
        cap: "Eight tabs",
        say: "Across the top are the tabs we visit next: the data grid, the query designer, the macro designer, the schema designer, the query plan visualizer, the J S O N inspector, the audit log, and pragma.",
        act: async (d) => {
          for (const t of ["Grid", "Designer", "Macros", "Schema", "Explain", "Json", "Audit", "Pragma"]) await d.hover(S + `#tabBtn${t}`, 650);
          await d.click(S + "#tabBtnGrid", { pause: 500 });
        },
      },
    ],
  },
];
