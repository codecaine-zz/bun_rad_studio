import type { Chapter } from "./fm_tutorial_types";
import { S } from "./mysql_tutorial_helpers";

/** Chapter 5: the studio's own connection workbench. */
export const workbenchChapters: Chapter[] = [
  {
    id: "05_workbench", chapter: "WORKBENCH", title: "The studio's own connection workbench",
    blurb: "Form fields or a connection address, presets, a safe connection test, and the databases on the server",
    steps: [
      {
        cap: "Connection Config: the manual workbench",
        say: "The studio has its own connection workbench, which is what you get when you start it by itself. Connection Config opens it. Host, port, user, a password box, and the database: here, one two seven dot zero dot zero dot one, thirty three ninety nine, root, no password.",
        act: async (d) => {
          await d.click(S + "button >> Connection Config", { pause: 2000 });
          for (const id of ["#cfgHost", "#cfgPort", "#cfgUser", "#cfgPass", "#cfgDb"]) await d.hover(S + id, 900);
          await d.wait(1500);
        },
      },
      {
        cap: "Form fields or a connection address, and presets",
        say: "Switch between form fields and a single connection address; they stay in sync. Presets fill in localhost, Docker, another port, or a cloud template with S S L on.",
        act: async (d) => {
          await d.click(S + "#btnModeUrl", { pause: 2200 });
          await d.hover(S + "#cfgUrl", 1500);
          await d.click(S + "#btnModeForm", { pause: 1200 });
          for (const p of ["Localhost (3306)", "Docker", "Port 3307", "RDS Template"]) await d.hover(S + `.sidebar-mini-btn >> ${p}`, 700);
        },
      },
      {
        cap: "A non-destructive connection test",
        say: "Test Connection checks the credentials and the network without changing the live connection. It reports the server version and round trip time, and a failure says why.",
        act: async (d) => {
          await d.click(S + "#btnTestConn", { pause: 3000 });
          await d.wait(2500);
        },
      },
      {
        cap: "Server Databases and Saved Profiles",
        say: "Server Databases lists every database on the server, switches with one click, and has a box to create one. Saved Profiles keeps named connections. I close it, because the File Manager already has ours.",
        act: async (d) => {
          await d.click(S + "#btnConnTabDatabases", { pause: 2000 });
          await d.wait(2500);
          await d.click(S + "#btnConnTabProfiles", { pause: 2000 });
          await d.wait(1500);
          await d.click(S + ".modal-close", { pause: 900 });
        },
      },
    ],
  },
];

/** Chapters 12 and 13: back in the File Manager, then the goodbye. */
export const endChapters: Chapter[] = [
  {
    id: "12_back", chapter: "BACK IN THE FILE MANAGER", title: "Back to the File Manager: stop, shortcuts and safety",
    blurb: "Stopping a studio, favorites and the Home tile, production warnings, and where the password lives",
    steps: [
      {
        cap: "Stop the studio, back to Connections",
        say: "Back to the File Manager. Stop ends the studio's server. Studios also end when the File Manager closes, even if it is killed, and at most four run at once. Connections returns to the list.",
        act: async (d) => {
          await d.click("button >> Stop", { pause: 2200 });
          await d.click("button >> Connections", { pause: 1500 });
        },
      },
      {
        cap: "Favorite, and the Home tile",
        say: "I star the connection as a favorite. Favorites and recent connections get a tile on Home, one click away; Shift Enter does the same. Showing tiles never reads your keychain.",
        act: async (d) => {
          await d.click("#power-pane-databases button >> Favorite", { pause: 1800 });
          await d.click("#view-home", { pause: 2000 });
          await d.scroll("body", 900, 8);
          await d.wait(2500);
        },
      },
      {
        cap: "Production, read-only, and the keychain",
        say: "Two safety points. Production or Read only connections ask before a studio opens and keep a warning banner, since studios have no read only mode. And passwords: on your Mac they go only to the keychain. In this recording the keychain is a throwaway stand in, and the password is empty, so nothing real was written.",
        act: async (d) => {
          await d.click("#view-tools", { pause: 1500 });
          await d.click("#power-tab-databases", { pause: 1500 });
          await d.click("#power-pane-databases .db-row >> shop", { pause: 1200 });
          await d.click("#power-pane-databases button >> Edit", { pause: 1800 });
          await d.hover(".dialog select", 1500);
          await d.wait(2500);
          await d.dialog("Cancel", { pause: 800 });
        },
      },
    ],
  },
  {
    id: "13_outro", chapter: "THE END", title: "That is MySQL in the File Manager", kind: "card",
    card: { kicker: "Free and open source", title: "Thank you for watching", lines: ["github.com/codecaine-zz/bun_rad_studio", "Guides: docs/userguides, 41 MySQL Studio and 43 File Manager", "The same Databases tool opens SQLite, PostgreSQL and Redis studios"] },
    steps: [
      {
        cap: "Thank you for watching",
        say: "That was MySQL Studio Pro, from inside the Codecaine File Manager. The guides are in the docs folder, the code is on GitHub at codecaine dash zz slash bun underscore rad underscore studio, and the same Databases tool opens SQLite, PostgreSQL and Redis studios. Thanks for watching.",
      },
    ],
  },
];
