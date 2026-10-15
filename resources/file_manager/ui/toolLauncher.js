// Right-click shortcuts to the other tools: one click from any folder to the database studios, the Graveyard and every other
// tool of the Find & more panel. Nothing here talks to a server; opening a tool is what the Find & more panel already does.
import { showMenu } from "./menus.js";
import { listPowerTabs, openPower } from "./power.js";

/** The four database studios: the same names and icons the Databases tool uses. */
const STUDIOS = [
  ["sqlite", "SQLite Studio", "🪶", "SQLite files: browse, query and design them."],
  ["mysql", "MySQL Studio", "🐬", "MySQL and MariaDB servers."],
  ["postgres", "PostgreSQL Studio", "🐘", "PostgreSQL servers."],
  ["redis", "Redis Studio", "🧰", "Redis servers: keys, streams and more."],
];

/** Where the person last right-clicked, so the list of tools opens in the same place. */
const last = { x: 0, y: 0 };
if (typeof document !== "undefined") {
  document.addEventListener("contextmenu", (e) => {
    last.x = e.clientX;
    last.y = e.clientY;
  }, true);
}

/** "Open SQLite Studio" and so on. Each opens the Databases tool for that kind of database. */
export function databaseStudioItems() {
  return STUDIOS.map(([engine, name, icon, what]) => ({
    label: `Open ${name}`, icon,
    tip: `Go to the Databases tool and open ${name} (${what}) with a saved connection. If there is none yet, it helps you add one.`,
    action: () => openPower("databases", { engine }),
  }));
}

/** One menu entry per tool, grouped like the Find & more panel. */
export function toolItems() {
  const items = [];
  let group = null;
  for (const t of listPowerTabs()) {
    if (t.groupLabel && t.groupLabel !== group) {
      if (group !== null) items.push({ separator: true });
      items.push({ header: t.groupLabel });
      group = t.groupLabel;
    }
    items.push({ label: t.label, icon: t.icon, tip: t.tip, action: () => openPower(t.id) });
  }
  return items;
}

export function showToolMenu(point = last) {
  showMenu([...toolItems(), { separator: true }, { header: "Database studios" }, ...databaseStudioItems()], { x: point.x, y: point.y, label: "Open a tool" });
}

/** The entries for the right-click menus. */
export const moreToolsItem = () => ({
  label: "Open a tool…", icon: "🧰", tip: "Go to any tool: Find, Code, Dev, Serve, Secrets, Databases, Graveyard, Subdomains and the rest.", action: () => showToolMenu(),
});
