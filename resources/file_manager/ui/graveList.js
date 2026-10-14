// The list of buried items in the Graveyard tab (the "seance"): a real table with a checkbox on every row, sortable column
// headings, and a pager, so even a graveyard with thousands of items shows one page at a time. Names and folders come
// from disk and are only ever set as text.
import { h } from "./dom.js";
import { formatDate, plural } from "./util.js";

const COLUMNS = [
  { key: "name", label: "Name", tip: "Sort by name" },
  { key: "type", label: "Type", tip: "Sort by kind: file, folder or link" },
  { key: "size", label: "Size", tip: "Sort by size", num: true },
  { key: "folder", label: "Came from", tip: "Sort by the folder it was buried from" },
  { key: "buried", label: "Buried", tip: "Sort by when it was buried" },
];

const KIND = { file: ["📄", "File"], directory: ["📁", "Folder"], symlink: ["🔗", "Link"], other: ["❔", "Other"] };

export function createList(env) {
  const head = h("tr", {});
  const all = h("input", { type: "checkbox", "aria-label": "Select every item on this page", title: "Tick or untick every item on this page", onchange: () => {
    for (const r of env.rows) (all.checked ? env.selected.add(r.id) : env.selected.delete(r.id));
    paintChecks();
    env.onSelect();
  } });
  head.append(h("th", { scope: "col", class: "grave-check" }, all));
  const sorters = new Map();
  for (const c of COLUMNS) {
    const th = h("th", { scope: "col", class: c.num ? "num" : "" });
    const button = h("button", { type: "button", class: "grave-sort", title: c.tip, onclick: () => env.sortBy(c.key) }, c.label, h("span", { class: "grave-arrow", "aria-hidden": "true" }));
    th.append(button);
    sorters.set(c.key, th);
    head.append(th);
  }
  const body = h("tbody", {});
  const caption = h("caption", { class: "sr-only" }, "Buried items");
  const table = h("table", { class: "pw-table grave-table" }, caption, h("thead", {}, head), body);
  const empty = h("p", { class: "pw-hint grave-empty", hidden: true });
  const wrap = h("div", { class: "pw-table-wrap grave-wrap", tabindex: "-1" }, table);
  const info = h("span", { class: "pw-status", role: "status" });
  const prev = h("button", { type: "button", class: "pw-btn", title: "Go to the previous page of buried items", onclick: () => env.goPage(env.query.page - 1) }, "‹ Previous");
  const next = h("button", { type: "button", class: "pw-btn", title: "Go to the next page of buried items", onclick: () => env.goPage(env.query.page + 1) }, "Next ›");
  const pager = h("div", { class: "pw-row grave-pager", role: "navigation", "aria-label": "Pages of buried items" }, prev, info, next);
  const el = h("div", { class: "grave-list" }, wrap, empty, pager);
  const checks = new Map();

  function paintChecks() {
    for (const [id, box] of checks) {
      box.checked = env.selected.has(id);
      box.closest("tr")?.classList.toggle("selected", box.checked);
    }
    const onPage = env.rows.filter((r) => env.selected.has(r.id)).length;
    all.checked = env.rows.length > 0 && onPage === env.rows.length;
    all.indeterminate = onPage > 0 && onPage < env.rows.length;
  }

  function rowEl(row) {
    const [icon, kind] = KIND[row.type] ?? KIND.other;
    const box = h("input", { type: "checkbox", "aria-label": `Select ${row.name}`, title: `Tick to choose ${row.name}`, onchange: () => {
      if (box.checked) env.selected.add(row.id);
      else env.selected.delete(row.id);
      paintChecks();
      env.onSelect();
    } });
    checks.set(row.id, box);
    const name = h("button", { type: "button", class: "grave-name", title: `Look at ${row.name} without restoring it`, onclick: () => env.onPreview(row) },
      h("span", { "aria-hidden": "true" }, `${icon} `), row.name);
    const origin = row.unknownOrigin
      ? h("span", { class: "pw-hint", title: "Verify found this and added it back to the list, so where it came from is not known. Use Restore to… to choose a folder." }, "Unknown place")
      : h("button", { type: "button", class: "grave-link pw-mono", title: `${row.originalPath}\nClick to open this folder in the file list.`, onclick: () => env.onOpenFolder(row) }, row.folder);
    return h("tr", { dataset: { id: row.id } },
      h("td", { class: "grave-check" }, box),
      h("th", { scope: "row", class: "grave-namecell" }, name, row.missing ? h("span", { class: "grave-warn", title: "The files of this item are no longer in the graveyard, so it can't be restored. Open Verify to tidy up the list." }, " ⚠ files missing") : null),
      h("td", {}, kind),
      h("td", { class: "num", title: row.type === "directory" ? `${plural(row.fileCount, "item")} inside` : "" }, row.humanSize),
      h("td", {}, origin),
      h("td", { title: row.buriedAt }, formatDate(row.buriedAtMs)));
  }

  return {
    el,
    paintChecks,
    render(data) {
      env.rows = data.items;
      checks.clear();
      body.replaceChildren(...data.items.map(rowEl));
      for (const c of COLUMNS) {
        const th = sorters.get(c.key);
        const active = env.query.sort === c.key;
        th.setAttribute("aria-sort", active ? (env.query.dir === "asc" ? "ascending" : "descending") : "none");
        th.querySelector(".grave-arrow").textContent = active ? (env.query.dir === "asc" ? " ▲" : " ▼") : "";
      }
      const first = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
      const last = Math.min(data.total, data.page * data.pageSize);
      info.textContent = data.total === 0 ? "No items" : `${first.toLocaleString("en-US")}–${last.toLocaleString("en-US")} of ${data.total.toLocaleString("en-US")}  ·  page ${data.page} of ${data.pages}`;
      prev.disabled = data.page <= 1;
      next.disabled = data.page >= data.pages;
      pager.hidden = data.pages <= 1 && data.total <= data.items.length;
      wrap.hidden = data.total === 0;
      empty.hidden = data.total !== 0;
      empty.textContent = env.emptyText(data);
      paintChecks();
    },
  };
}
