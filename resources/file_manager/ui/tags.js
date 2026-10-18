// Color tags (labels) for files and folders: Red, Orange, Yellow, Green, Blue, Purple, Gray.
// Tags are stored in `state.settings.tags` (path -> color id) so they persist across restarts.
import { state, emit } from "./state.js";
import { saveSettings } from "./nav.js";
import { h, say } from "./dom.js";

export const TAG_DEFS = [
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "orange", label: "Orange", hex: "#f97316" },
  { id: "yellow", label: "Yellow", hex: "#eab308" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "purple", label: "Purple", hex: "#a855f7" },
  { id: "gray", label: "Gray", hex: "#64748b" },
];

const BY_ID = new Map(TAG_DEFS.map((t) => [t.id, t]));

export function tagInfo(id) {
  return typeof id === "string" ? BY_ID.get(id) ?? null : null;
}

export function tagForPath(path) {
  if (!path) return null;
  const id = state.settings?.tags?.[path];
  return tagInfo(id);
}

export async function setTagForPaths(paths, colorId) {
  const list = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === "string" && p.length > 0);
  if (!list.length) return;
  const next = { ...(state.settings.tags ?? {}) };
  const valid = tagInfo(colorId);
  for (const p of list) {
    if (valid) next[p] = valid.id;
    else delete next[p];
  }
  await saveSettings({ tags: next });
  emit("view");
  emit("places");
  say(valid ? `Tagged ${list.length} item${list.length === 1 ? "" : "s"} ${valid.label}.` : `Cleared color tag from ${list.length} item${list.length === 1 ? "" : "s"}.`);
}

export function setTagFilter(colorId) {
  const valid = tagInfo(colorId);
  state.tagFilter = valid && state.tagFilter !== valid.id ? valid.id : "";
  emit("view");
  emit("places");
  const active = tagInfo(state.tagFilter);
  say(active ? `Showing ${active.label}-tagged items.` : "Showing all items.");
}

export function tagsSection() {
  const counts = {};
  for (const c of Object.values(state.settings?.tags ?? {})) {
    counts[c] = (counts[c] || 0) + 1;
  }
  const active = state.tagFilter || "";
  const head = h("div", { class: "side-head" },
    h("h2", { class: "side-title" }, "Tags"),
    active
      ? h("button", {
          type: "button",
          class: "side-mini",
          dataset: { tagClearFilter: "" },
          title: "Clear color tag filter and show all items",
          "aria-label": "Clear tag filter",
          onclick: () => setTagFilter(""),
        }, "✕")
      : null,
  );
  const pills = h("div", { class: "side-tags", role: "group", "aria-label": "Filter current folder by color tag" },
    ...TAG_DEFS.map((t) => {
      const isOn = active === t.id;
      const n = counts[t.id] || 0;
      const dot = h("span", { class: `tag-dot tag-${t.id}`, "aria-hidden": "true" });
      return h("button", {
        type: "button",
        class: `side-tag-pill${isOn ? " active" : ""}`,
        dataset: { tagFilter: t.id },
        "aria-pressed": String(isOn),
        title: `Filter folder by ${t.label} tag (${n} tagged overall). Click again to show all.`,
        "aria-label": `${t.label} tag filter${n ? `, ${n} tagged` : ""}`,
        onclick: () => setTagFilter(t.id),
      }, dot, h("span", { class: "side-tag-label" }, t.label));
    }),
  );
  return h("section", { class: "side-section", dataset: { tagsSection: "" } }, head, pills);
}
