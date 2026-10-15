// The list of saved connections, grouped by folder (favourites first), with a filter box. Arrow keys move through it,
// Enter opens the studio, and every row says its environment in words as well as with an icon.
import { clear, h } from "./dom.js";
import { db, engineInfo, environmentBadge, summaryOf, studiosFor } from "./dbState.js";
import { emit } from "./state.js";

const NO_FOLDER = "No folder";

/** The connections that match the filter text (name, folder, tags, host, file), in display order. */
export function visibleProfiles(filter = "") {
  const q = filter.trim().toLowerCase();
  const matches = (p) => !q || [p.name, p.folder, ...(p.tags ?? []), summaryOf(p), engineInfo(p.engine).label, p.environment].some((s) => String(s ?? "").toLowerCase().includes(q));
  return db.profiles.filter(matches).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function groupedProfiles(filter = "") {
  const groups = new Map();
  for (const p of visibleProfiles(filter)) {
    const key = p.folder || NO_FOLDER;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === NO_FOLDER ? 1 : b === NO_FOLDER ? -1 : a.localeCompare(b, undefined, { sensitivity: "base" })));
}

/** Draws the list into `box`. `open(profile)` runs for Enter and double-click; `shortcut(profile)` for Shift+Enter (its own window or the browser). */
export function renderList(box, { filter = "", open, shortcut }) {
  clear(box);
  const groups = groupedProfiles(filter);
  if (!db.profiles.length) {
    box.append(h("p", { class: "pw-hint db-empty" }, "No connections yet. Use “Add connection” above, paste an address, or import one from your environment."));
    return;
  }
  if (!groups.length) {
    box.append(h("p", { class: "pw-hint db-empty", role: "status" }, "No connection matches that filter."));
    return;
  }
  const list = h("div", { class: "db-list", role: "listbox", "aria-label": "Database connections" });
  let first = true;
  groups.forEach(([folder, profiles], gi) => {
    const id = `db-group-${gi}`;
    const group = h("div", { class: "db-group", role: "group", "aria-labelledby": id }, h("div", { class: "db-group-title", id }, h("span", { "aria-hidden": "true" }, "📂 "), folder));
    for (const p of profiles) {
      const info = engineInfo(p.engine);
      const selected = p.id === db.selectedId;
      const running = studiosFor(p.id).length > 0;
      const row = h("button", {
        type: "button", role: "option", class: `db-row${selected ? " selected" : ""}`, "aria-selected": String(selected), tabindex: selected || (first && !db.selectedId) ? "0" : "-1",
        dataset: { id: p.id }, title: `${p.name}: ${info.label}, ${summaryOf(p)}`,
        onclick: () => { db.selectedId = p.id; emit("db-select", p.id); },
        ondblclick: () => open?.(p),
      },
        h("span", { class: "db-row-icon", "aria-hidden": "true" }, info.icon),
        h("span", { class: "db-row-main" },
          h("span", { class: "db-row-name" }, p.favorite ? h("span", { class: "db-fav", title: "Favourite" }, "★ ") : null, p.name),
          h("span", { class: "db-row-sub pw-mono" }, summaryOf(p)),
          p.tags?.length ? h("span", { class: "db-row-tags" }, p.tags.map((t) => h("span", { class: "db-tag" }, t))) : null,
        ),
        environmentBadge(p.environment),
        running ? h("span", { class: "db-running", title: "A studio is open for this connection" }, "🟢 open") : null,
      );
      first = false;
      group.append(row);
    }
    list.append(group);
  });
  list.addEventListener("keydown", (e) => {
    const rows = [...list.querySelectorAll(".db-row")];
    const at = rows.indexOf(document.activeElement);
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(rows.length - 1, at + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, at - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows.length - 1;
    else if (e.key === "Enter" && at >= 0) {
      e.preventDefault();
      const chosen = db.profiles.find((p) => p.id === rows[at].dataset.id);
      if (e.shiftKey) shortcut?.(chosen);
      else open?.(chosen);
      return;
    } else return;
    e.preventDefault();
    if (next >= 0 && rows[next]) rows[next].click();
  });
  box.append(list);
}
