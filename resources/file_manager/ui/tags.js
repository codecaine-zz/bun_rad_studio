// Color tags (labels) and sticky notes for files and folders.
// Tags are stored in `state.settings.tags` (path -> color id) and notes in `state.settings.notes` (path -> text)
// so they persist across restarts.
import { state, emit } from "./state.js";
import { saveSettings } from "./nav.js";
import { h, say } from "./dom.js";
import { openDialog } from "./dialogs.js";
import { baseName } from "./util.js";

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
  return typeof id === "string" ? (BY_ID.get(id) ?? null) : null;
}

export function tagForPath(path) {
  if (!path) return null;
  const id = state.settings?.tags?.[path];
  return tagInfo(id);
}

export async function setTagForPaths(paths, colorId) {
  const list = (Array.isArray(paths) ? paths : []).filter(
    (p) => typeof p === "string" && p.length > 0,
  );
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
  say(
    valid
      ? `Tagged ${list.length} item${list.length === 1 ? "" : "s"} ${valid.label}.`
      : `Cleared color tag from ${list.length} item${list.length === 1 ? "" : "s"}.`,
  );
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
  const head = h(
    "div",
    { class: "side-head" },
    h("h2", { class: "side-title" }, "Tags"),
    active
      ? h(
          "button",
          {
            type: "button",
            class: "side-mini",
            dataset: { tagClearFilter: "" },
            title: "Clear color tag filter and show all items",
            "aria-label": "Clear tag filter",
            onclick: () => setTagFilter(""),
          },
          "✕",
        )
      : null,
  );
  const pills = h(
    "div",
    {
      class: "side-tags",
      role: "group",
      "aria-label": "Filter current folder by color tag",
    },
    ...TAG_DEFS.map((t) => {
      const isOn = active === t.id;
      const n = counts[t.id] || 0;
      const dot = h("span", {
        class: `tag-dot tag-${t.id}`,
        "aria-hidden": "true",
      });
      return h(
        "button",
        {
          type: "button",
          class: `side-tag-pill${isOn ? " active" : ""}`,
          dataset: { tagFilter: t.id },
          "aria-pressed": String(isOn),
          title: `Filter folder by ${t.label} tag (${n} tagged overall). Click again to show all.`,
          "aria-label": `${t.label} tag filter${n ? `, ${n} tagged` : ""}`,
          onclick: () => setTagFilter(t.id),
        },
        dot,
        h("span", { class: "side-tag-label" }, t.label),
      );
    }),
  );
  return h(
    "section",
    { class: "side-section", dataset: { tagsSection: "" } },
    head,
    pills,
  );
}

export function noteForPath(path) {
  if (!path || typeof path !== "string") return "";
  const val = state.settings?.notes?.[path];
  return typeof val === "string" ? val : "";
}

export async function setNoteForPath(path, text) {
  if (!path || typeof path !== "string") return;
  const clean =
    typeof text === "string"
      ? text
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
          .trim()
          .slice(0, 500)
      : "";
  const next = { ...(state.settings.notes ?? {}) };
  if (clean) next[path] = clean;
  else delete next[path];
  await saveSettings({ notes: next });
  emit("view");
  emit("selection");
  say(
    clean
      ? `Saved note for ${baseName(path, state.sep)}.`
      : `Removed note from ${baseName(path, state.sep)}.`,
  );
}

export async function editNoteDialog(entryOrPath) {
  const path =
    typeof entryOrPath === "string" ? entryOrPath : entryOrPath?.path;
  if (!path) return;
  const name =
    (typeof entryOrPath === "object" && entryOrPath?.name) ||
    baseName(path, state.sep);
  const current = noteForPath(path);
  const textarea = h(
    "textarea",
    {
      class: "text-input note-textarea",
      rows: "4",
      maxlength: "500",
      placeholder:
        "Write a sticky note, reminder, TODO, or context for this item…",
      "aria-label": `Sticky note for ${name}`,
      dataset: { noteInput: "" },
      style:
        "width: 100%; resize: vertical; min-height: 84px; font-family: inherit;",
    },
    current,
  );
  const countEl = h(
    "span",
    { class: "hint", dataset: { noteCount: "" } },
    `${current.length} / 500`,
  );
  textarea.addEventListener("input", () => {
    countEl.textContent = `${textarea.value.length} / 500`;
  });

  const buttons = [
    { label: "Cancel", value: null },
    ...(current ? [{ label: "Clear note", value: "clear", danger: true }] : []),
    { label: "Save note", value: "save", primary: true },
  ];
  const dlg = openDialog({
    title: `${current ? "Edit" : "Add"} Note — ${name}`,
    body: [
      h(
        "label",
        { class: "field" },
        h(
          "span",
          { class: "field-label" },
          "Sticky note (searchable via Filter & note:query)",
        ),
        textarea,
      ),
      h(
        "div",
        {
          style:
            "display: flex; justify-content: space-between; align-items: center; margin-top: 4px;",
        },
        h(
          "span",
          { class: "hint" },
          "Tip: Filter noted items anytime with is:noted or note:todo",
        ),
        countEl,
      ),
    ],
    buttons,
    initialFocus: textarea,
  });
  const choice = await dlg.result;
  if (choice === "save") {
    await setNoteForPath(path, textarea.value);
  } else if (choice === "clear") {
    await setNoteForPath(path, "");
  }
}
