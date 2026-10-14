// The first step of the Convert & process window: "What do you want to turn these into?" A searchable list of
// everything that applies to the selected files, grouped, with a label that says what each one needs.
import { h } from "./dom.js";
import { GROUP_BLURB, badgeFor, describeSelection, groupActions, searchActions } from "./convertdata.js";
import { plural } from "./util.js";

function actionItem(action, toolNames, tools, handlers) {
  const badge = badgeFor(action, toolNames);
  const unavailable = !action.available;
  const count = action.count;
  const main = h("button", {
    type: "button", class: "cv-main", disabled: unavailable,
    title: unavailable ? action.why : action.hint,
    "aria-describedby": null,
    onclick: () => handlers.pick(action),
  },
    h("span", { class: "cv-label" }, action.label),
    h("span", { class: "cv-hint" }, action.hint),
    h("span", { class: "cv-meta" },
      h("span", { class: "cv-badge", dataset: { kind: badge.kind } }, badge.text),
      action.mode === "all" ? h("span", { class: "cv-mode" }, "all together → one new item") : null,
      count < handlers.selected ? h("span", { class: "cv-mode" }, `${count} of ${handlers.selected}`) : null));
  const missing = (action.installTools ?? []).map((id) => tools.find((t) => t.id === id)).filter(Boolean);
  let extra = null;
  if (unavailable) {
    const first = missing[0];
    extra = h("div", { class: "cv-unavailable" },
      h("span", { class: "cv-why" }, action.why),
      first ? (first.plan.auto
        ? h("button", { type: "button", class: "btn", title: `Install ${missing.map((t) => t.name).join(" and ")} now. ${first.plan.note}`, onclick: () => handlers.install(missing.map((t) => t.id)) }, `Install ${missing.map((t) => t.name).join(" and ")}`)
        : h("button", { type: "button", class: "btn", title: "Show how to install it", onclick: () => handlers.showTools() }, `How to install ${first.name}`)) : null);
  }
  return h("li", { class: "cv-item", dataset: { available: String(!unavailable) } }, main, extra);
}

/**
 * Fills `box` with the chooser.
 * @param {{ box: HTMLElement, data: any, entries: Array<{ name: string, isDir?: boolean }>, pick: (action: any) => void, install: (ids: string[]) => void, showTools: () => void }} o
 */
export function renderChooser({ box, data, entries, pick, install, showTools }) {
  const toolNames = Object.fromEntries(data.tools.map((t) => [t.id, t.name]));
  const handlers = { pick, install, showTools, selected: data.selected + data.folders };
  let query = "";
  let group = "";

  const search = h("input", {
    type: "search", class: "cv-search", id: "cv-search", placeholder: "Search: pdf, small, mp3, csv, rotate…", autocomplete: "off", spellcheck: "false",
    "aria-label": "Search for what you want to make", title: "Type a word like pdf, small, mp3 or csv to narrow the list", "aria-controls": "cv-list", oninput: () => { query = search.value; draw(); },
    onkeydown: (e) => { if (e.key === "ArrowDown") { e.preventDefault(); list.querySelector(".cv-main:not(:disabled)")?.focus(); } },
  });
  const count = h("p", { class: "hint cv-count", "aria-live": "polite" });
  const chips = h("div", { class: "cv-chips", role: "group", "aria-label": "Show only" });
  const list = h("div", { class: "cv-list", id: "cv-list" });
  const groups = groupActions(data.actions);

  const chip = (value, text) => h("button", { type: "button", class: "cv-chip", "aria-pressed": "false", title: value ? `Show only ${value}` : "Show everything", dataset: { group: value }, onclick: () => { group = value; draw(); } }, text);
  chips.append(chip("", "All"), ...groups.map((g) => chip(g.group, g.group)));

  function draw() {
    for (const c of chips.children) c.setAttribute("aria-pressed", String(c.dataset.group === group));
    const found = searchActions(data.actions, query, group);
    count.textContent = found.length ? `${plural(found.length, "thing")} you can make` : "Nothing matches. Try another word, or choose All.";
    if (query.trim()) {
      list.replaceChildren(h("ul", { class: "cv-ul" }, found.map((a) => actionItem(a, toolNames, data.tools, handlers))));
      return;
    }
    list.replaceChildren(...groupActions(found).map((g) => h("section", { class: "cv-group", "aria-label": g.group },
      h("h3", {}, g.group, h("span", { class: "cv-group-blurb" }, ` ${GROUP_BLURB[g.group] ?? ""}`)),
      h("ul", { class: "cv-ul" }, g.items.map((a) => actionItem(a, toolNames, data.tools, handlers))))));
  }
  list.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...list.querySelectorAll(".cv-main:not(:disabled)")];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && i === 0) search.focus();
    else items[Math.min(items.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  });

  box.replaceChildren(
    h("h3", { class: "cv-question" }, "What do you want to turn these into?"),
    h("p", { class: "cv-selected" }, `Selected: ${describeSelection(entries)}. Results are saved as new files; the originals are never changed.`),
    search, chips, count, list,
  );
  draw();
  return { focus: () => search.focus() };
}
