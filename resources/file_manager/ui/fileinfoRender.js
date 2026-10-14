// "More info": drawing groups of rows as real tables, with a copy button on every row and a search filter.
// Everything is built with h() and textContent, so nothing read from a file can become markup.
import { call } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { rowMatches } from "./fileinfoReport.js";

/** Which groups the person closed, remembered while the page stays open. */
const closed = new Set();

/** Copies text to the clipboard (through the server, which works in every window) and says so. */
export async function copyValue(text, what = "That") {
  try {
    await call("copytext", { text: String(text).slice(0, 100_000) });
    toast(`${what} copied.`, { kind: "success" });
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(String(text));
      toast(`${what} copied.`, { kind: "success" });
      return true;
    } catch {
      toast("Couldn't copy. Select the text and copy it yourself.", { kind: "error" });
      return false;
    }
  }
}

const FLAG = {
  warn: { icon: "⚠", word: "Warning: " },
  good: { icon: "✔", word: "Good: " },
  info: { icon: "ℹ", word: "Note: " },
};

/** The small button that copies one value. */
export function copyButton(label, getText) {
  return h("button", { type: "button", class: "fi-copy", "aria-label": `Copy ${label}`, title: `Copy "${label}"`, onclick: () => copyValue(getText(), label) }, "⧉");
}

/**
 * One group as a collapsible table. Returns { el, filter(query), count }.
 * @param {{ id: string, title: string, hint?: string, note?: string, rows: Array<{ label: string, value: string, hint?: string, flag?: string }> }} group
 */
export function groupView(group) {
  const bodyRows = group.rows.map((row) => {
    const flag = row.flag ? FLAG[row.flag] : null;
    const value = h("td", { class: `fi-value${row.flag ? ` fi-${row.flag}` : ""}` },
      flag ? h("span", { class: "fi-flag", "aria-hidden": "true" }, `${flag.icon} `) : null,
      flag ? h("span", { class: "sr-only" }, flag.word) : null,
      row.value,
    );
    const label = h("th", { scope: "row", class: "fi-label", title: row.hint || null }, row.label, row.hint ? h("span", { class: "fi-help", "aria-hidden": "true" }, " ⓘ") : null);
    const tr = h("tr", { class: "fi-row" }, label, value, h("td", { class: "fi-act", "data-copy-ui": "" }, copyButton(row.label, () => row.value)));
    return { row, tr };
  });
  const table = group.rows.length
    ? h("table", { class: "fi-table", "data-copy": "off" },
      h("caption", { class: "sr-only", "data-copy-skip": "" }, group.title),
      h("colgroup", {}, h("col", { class: "fi-col-label" }), h("col", {}), h("col", { class: "fi-col-act" })),
      h("thead", { class: "sr-only", "data-copy-skip": "" }, h("tr", {}, h("th", { scope: "col" }, "Setting"), h("th", { scope: "col" }, "Value"), h("th", { scope: "col" }, "Copy"))),
      h("tbody", {}, bodyRows.map((r) => r.tr)))
    : null;
  const empty = h("p", { class: "fi-none", hidden: true }, "Nothing here matches what you typed.");
  const summary = h("summary", { class: "fi-summary", title: group.hint || null }, h("span", { class: "fi-title" }, group.title), h("span", { class: "fi-count", "data-copy-skip": "" }, ` (${group.rows.length})`));
  const details = h("details", { class: "fi-details", open: !closed.has(group.id) },
    summary,
    group.note ? h("p", { class: "fi-note" }, group.note) : null,
    table,
    empty,
  );
  let searching = false;
  // What the person opens or closes is remembered; what a search opens on its own is not.
  summary.addEventListener("click", () => setTimeout(() => { if (!searching) closed[details.open ? "delete" : "add"](group.id); }, 0));
  const el = h("section", { class: "fi-group", dataset: { group: group.id }, "data-copy": group.title }, details);
  return {
    el,
    group,
    /** Hides the rows that don't match. Returns how many rows are shown. */
    filter(query) {
      const q = query.trim();
      let shown = 0;
      for (const { row, tr } of bodyRows) {
        const show = !q || rowMatches(row, q) || group.title.toLowerCase().includes(q.toLowerCase());
        tr.hidden = !show;
        if (show) shown++;
      }
      empty.hidden = shown > 0 || !group.rows.length;
      el.hidden = !!q && shown === 0 && !!group.rows.length;
      searching = !!q;
      details.open = q ? true : !closed.has(group.id);
      return shown;
    },
    count: group.rows.length,
  };
}
