import type { Chapter } from "./fm_tutorial_types";
import { STUDIO } from "./mysql_tutorial_env";

const P = "#power-pane-databases button >> ";
const closeAnyDialog = `[...document.querySelectorAll('.dialog button, .modal button')].find((b) => /^(Close|Cancel|Done)$/.test(b.textContent.trim()))?.click()`;

/** Chapters 0 to 4: the title, a server to talk to, finding and saving the connection, testing it, and opening the studio. */
export const fmChapters: Chapter[] = [
  {
    id: "00_intro", chapter: "INTRO", title: "MySQL in the Codecaine File Manager", kind: "card",
    card: { kicker: "Databases in the Codecaine File Manager", title: "MySQL Studio Pro", lines: ["Save a connection, test it, and open the studio", "Grid, S Q L, designers, diagnostics and macros", "Everything on a throwaway MySQL server"] },
    steps: [
      {
        cap: "MySQL Studio Pro, opened from the File Manager",
        say: "Welcome. This tutorial works with a real MySQL server, entirely from inside the Codecaine File Manager. Find a connection, save and test it, open MySQL Studio Pro in the window, then tour every pane of the studio. All on throwaway data.",
      },
    ],
  },

  {
    id: "01_server", chapter: "A SERVER", title: "A MySQL server to talk to", kind: "card",
    card: { kicker: "Before you start", title: "You need a MySQL server", lines: ["brew install mysql", "brew services start mysql", "mysql -u root   then   CREATE DATABASE shop;", "This video: a throwaway server on port 3399"] },
    steps: [
      {
        cap: "Install MySQL, and use a throwaway server",
        say: "You need a MySQL server. On a Mac: brew install mysql, then brew services start mysql, then connect as root and create a database. In this video I use a separate throwaway server on port 3399, with an empty password and sample data, so nothing real is touched.",
      },
    ],
  },

  {
    id: "02_find", chapter: "FIND IT", title: "Find the connection and save it", blurb: "A dot env file, the Databases tool, and Found in your environment",
    steps: [
      {
        cap: "Settings often live in a .env file",
        say: "We start in the file list, in a project folder. Database settings often live in a dot env file, which is hidden, so I choose Show hidden files in the View menu.",
        act: async (d) => {
          await d.click("#tool-view", { pause: 900 });
          await d.click(".menu [role^=menuitem] >> Show hidden files", { pause: 1500 });
        },
      },
      {
        cap: "Right-click: Import database settings…",
        say: "Right click the dot env file: Import database settings. It only reads the file to show you what is inside, and never changes it.",
        act: async (d) => {
          await d.rclick("#list .row >> .env", { pause: 900 });
          await d.hover(".menu [role^=menuitem] >> Import database settings", 800);
          await d.wait(1200);
        },
      },
      {
        cap: "A preview first: nothing is written yet",
        say: "A preview lists the connection it found, and the variable each value came from. No password here. Nothing is saved until I press Save to the manager, so I close it.",
        act: async (d) => {
          await d.click(".menu [role^=menuitem] >> Import database settings", { pause: 2200 });
          await d.hover(".dialog", 2500);
          await d.dialog("Close", { pause: 800 });
        },
      },
      {
        cap: "Find & more → Databases",
        say: "Connections live in Find and more, Databases. Add connection, New sample database, Paste address, Import from environment, and Import dot env file. A saved connection replaces environment variables.",
        act: async (d) => {
          await d.click("#tool-power", { pause: 1000 });
          await d.click("#power-tab-databases", { pause: 1500 });
          await d.hover(P + "Add connection", 700);
          await d.hover(P + "Paste address", 700);
          await d.hover(P + "Import from environment", 700);
        },
      },
      {
        cap: "Found in your environment",
        say: "And a card: Found in your environment. This program was started with the M S Q L variables, and each value shows which variable and which dot env file it came from. Detection only reads. It never connects.",
        act: async (d) => {
          await d.hover("#power-pane-databases .db-detect, #power-pane-databases h2", 600).catch(() => {});
          await d.wait(2500);
          await d.scroll("#power-pane-databases", 200, 4);
          await d.wait(1500);
        },
      },
      {
        cap: "Save to the manager",
        say: "Save to the manager creates the connection. A password would go to the keychain, never into a file. The page then lists the variables that are no longer needed, and edits nothing for you.",
        act: async (d) => {
          await d.eval(`document.querySelector('#power-pane-databases').scrollTop = 0`);
          await d.click(P + "Save to the manager", { pause: 2200 });
          await d.hover(".dialog, .modal", 3500);
        },
      },
      {
        cap: "The connection now lives in the manager",
        say: "Done: the connection is in the list, marked Development. Next, test it and open the studio.",
        act: async (d) => {
          await d.eval(closeAnyDialog);
          await d.wait(900);
          await d.click("#power-pane-databases .db-row", { pause: 1500 });
        },
      },
    ],
  },

  {
    id: "03_connection", chapter: "CONNECTION", title: "Test it, see where every value comes from",
    blurb: "Test connection, Effective settings, and the Edit form",
    steps: [
      {
        cap: "The connection's details",
        say: "The details: MySQL, server 127 dot 0 dot 0 dot 1, port thirty three ninety nine, database shop, user root. Password says none saved, because this server has none. A real password reads Saved in your computer's keychain.",
        act: async (d) => { await d.hover("#power-pane-databases .db-row", 600); await d.wait(1500); await d.hover(P + "Open in MySQL Studio", 800); },
      },
      {
        cap: "Test connection",
        say: "Test connection is an explicit click: ten seconds at most, read only, in plain words. It works, and shows the server version and the time taken. A failure would say why, like the server refused the password.",
        act: async (d) => { await d.click(P + "Test connection", { pause: 3500 }); },
      },
      {
        cap: "Effective settings: which value wins",
        say: "Effective settings shows every value the studio will use and where it came from. The connection you chose wins, then your engine defaults, then environment variables, then the studio's own. Ignored variables are listed by name.",
        act: async (d) => {
          await d.scroll("#power-pane-databases", 420, 6);
          await d.wait(2200);
          await d.scroll("#power-pane-databases", 500, 6);
          await d.wait(1500);
        },
      },
      {
        cap: "Edit: the connection form",
        say: "Edit opens the connection form: name, folder, environment, host, port, user, a write only password box, database, T L S and time outs. Mark it Production or Read only, and the File Manager asks before any studio opens.",
        act: async (d) => {
          await d.eval(`document.querySelector('#power-pane-databases').scrollTop = 0`);
          await d.click(P + "Edit", { pause: 1800 });
          await d.hover(".dialog input[type=password], .dialog input >> @", 600).catch(() => {});
          await d.wait(2500);
        },
      },
      {
        cap: "Test inside the form, then Cancel",
        say: "The form has its own Test connection button, so you can check before saving. It works. I cancel, because nothing needs to change.",
        act: async (d) => {
          await d.click(".dialog button >> Test connection", { pause: 3000 });
          await d.dialog("Cancel", { pause: 900 });
        },
      },
      {
        cap: "Paste address…",
        say: "Or paste an address, like mysql colon slash slash root at 127 dot 0 dot 0 dot 1, colon thirty three ninety nine, slash shop, and the form fills in for you to check.",
        act: async (d) => {
          await d.click(P + "Paste address", { pause: 1200 });
          await d.click(".dialog input", { pause: 400 });
          await d.type("mysql://root@127.0.0.1:3399/shop", 45);
          await d.wait(700);
          await d.dialog("Fill in the form", { pause: 1800 });
          await d.hover(".dialog", 1800);
          await d.dialog("Cancel", { pause: 700 });
        },
      },
    ],
  },

  {
    id: "04_open", chapter: "OPEN THE STUDIO", title: "Open MySQL Studio inside the window",
    blurb: "A real studio in a frame, Focus mode, and a tour of every pane",
    steps: [
      {
        cap: "Open in MySQL Studio",
        say: "Open in MySQL Studio. The File Manager starts the studio's own server on this computer, and shows its page in a frame, right in the window. The status goes from starting to running.",
        act: async (d) => {
          await d.click(P + "Open in MySQL Studio", { pause: 1500 });
          await d.waitFor(STUDIO + "#tabBtnGrid", 20000);
          await d.wait(1200);
        },
      },
      {
        cap: "The studio's own startup macro",
        say: "The studio greets us. That message comes from a startup macro called AutoExec, which also opened the customers table. We will build a macro of our own later. I press O K.",
        act: async (d) => { await d.waitFor(STUDIO + "button >> OK", 15000); await d.click(STUDIO + "button >> OK", { pause: 900 }); },
      },
      {
        cap: "Focus mode: more room for the studio",
        say: "Focus mode hides the toolbar for more room. The bar above the studio keeps Stop, Restart, Open in a separate window, and Open in my browser.",
        act: async (d) => {
          await d.click("#focus-toggle", { pause: 1200 });
          await d.hover("button >> Restart", 700);
          await d.hover("button >> Open in a separate window", 700);
          await d.hover("button >> Open in my browser", 700);
        },
      },
      {
        cap: "The header and the sidebar",
        say: "The studio header has connection settings, databases, backup and dump, Run Query, sample data and maintenance. The sidebar lists tables and views with their row counts, and a search box.",
        act: async (d) => {
          for (const b of ["button >> Databases...", "button >> DB Backup / Dump", "button >> Run Query", "button >> Seed Sample DB"]) await d.hover(STUDIO + b, 650);
          await d.hover(STUDIO + "#searchObjects", 700);
          await d.hover(STUDIO + ".sidebar-item >> customers, .tree-item >> customers", 700).catch(() => {});
        },
      },
      {
        cap: "Twelve panes, one cockpit",
        say: "Twelve panes: the data grid, query designer, macro designer, schema designer, custom types, partitions, activity and locks, replication, query plans, raw JSON, telemetry, and maintenance. We visit them one by one.",
        act: async (d) => {
          for (const t of ["Designer", "Macros", "Schema", "Types", "Partitions", "Activity", "Replication", "Explain", "Json", "Audit", "Pragma", "Grid"]) {
            await d.click(STUDIO + `#tabBtn${t}`, { pause: 600, ms: 320 });
          }
        },
      },
    ],
  },
];
