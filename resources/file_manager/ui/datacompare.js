// "Compare data files": two JSON, JSON5, YAML or TOML files, compared by what they say (not by how they are written).
import { ApiError, call } from "./api.js";
import { copyItemButton } from "./copyclip.js";
import { openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { extensionOf } from "./util.js";

const COMPARABLE = new Set(["json", "jsonc", "json5", "yaml", "yml", "toml"]);

/** Exactly two ordinary files that are JSON, JSON5, YAML or TOML (by name). */
export function canCompareData(entries) {
  return entries.length === 2 && entries.every((e) => !e.isDir && COMPARABLE.has(extensionOf(e.name)));
}

const tsv = (rows) => rows.map((r) => r.join("\t")).join("\n");

function section(title, tip, rows, columns) {
  const text = () => `${title}\n${tsv([columns, ...rows])}`;
  return h("section", { class: "cmp-section", "data-count": String(rows.length) },
    h("div", { class: "cmp-head" },
      h("h3", { class: "cmp-title", title: tip }, `${title} (${rows.length})`),
      copyItemButton({ label: `the list “${title}”`, getText: text })),
    h("div", { class: "cmp-wrap" }, h("table", { class: "cmp-table", "data-copy": "off" },
      h("caption", { class: "sr-only" }, title),
      h("thead", {}, h("tr", {}, columns.map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((cell, i) => (i === 0 ? h("th", { scope: "row", class: "cmp-path" }, cell) : h("td", { class: "cmp-value" }, cell)))))))));
}

function report(r) {
  const lines = [`Left: ${r.left.name} (${r.left.kind})`, `Right: ${r.right.name} (${r.right.kind})`, r.identical ? "Same meaning." : `${r.total} difference${r.total === 1 ? "" : "s"}.`];
  for (const [title, list, cols] of [["Changed", r.changed, (d) => [d.path, d.left, d.right]], ["Only in the left file", r.onlyLeft, (d) => [d.path, d.left]], ["Only in the right file", r.onlyRight, (d) => [d.path, d.right]]]) {
    if (list.length) lines.push("", title, ...list.map((d) => cols(d).join("\t")));
  }
  return lines.join("\n");
}

/** Shows the comparison of the two selected files in a window. */
export async function showCompareData(entries) {
  if (!canCompareData(entries)) return;
  const [left, right] = entries;
  let r;
  try {
    r = await call("data/compare", { left: left.path, right: right.path });
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "Couldn't compare those files.", { kind: "error" });
    return;
  }
  const verdict = h("p", { class: `cmp-verdict ${r.identical ? "cmp-same" : "cmp-diff"}`, role: "status" },
    r.identical ? "✔ These files mean exactly the same thing (key order, spacing and comments are ignored)." : `✖ The files differ: ${r.total.toLocaleString("en-US")} difference${r.total === 1 ? "" : "s"}.`);
  const sections = [
    r.changed.length ? section("Changed", "Settings that exist in both files but have different values. The path shows where: a.b is the key b inside a, and [2] is the third item of a list.", r.changed.map((d) => [d.path + (d.note ? ` — ${d.note}` : ""), d.left, d.right]), ["Where", r.left.name, r.right.name]) : null,
    r.onlyLeft.length ? section("Only in the left file", `Settings that ${r.left.name} has and ${r.right.name} doesn't.`, r.onlyLeft.map((d) => [d.path, d.left]), ["Where", "Value"]) : null,
    r.onlyRight.length ? section("Only in the right file", `Settings that ${r.right.name} has and ${r.left.name} doesn't.`, r.onlyRight.map((d) => [d.path, d.right]), ["Where", "Value"]) : null,
  ];
  openDialog({
    title: "Compare data files",
    wide: true,
    body: [
      h("p", { class: "cmp-names" }, h("strong", {}, "Left: "), `${r.left.name} (${r.left.kind})`, "  ", h("strong", {}, "Right: "), `${r.right.name} (${r.right.kind})`),
      verdict,
      r.notes.length ? h("ul", { class: "cmp-notes" }, r.notes.map((n) => h("li", {}, n))) : null,
      ...sections,
      h("div", { class: "cmp-all" }, copyItemButton({ label: "the whole comparison", getText: () => report(r), words: "Copy everything" })),
    ],
    buttons: [{ label: "Close", primary: true, value: true }],
  });
}
