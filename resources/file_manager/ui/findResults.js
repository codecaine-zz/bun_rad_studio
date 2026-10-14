// The results table of the Find tool: one row per match, with mouse and keyboard selection, a quick filter and a
// sort box. Only the first rows are drawn at first (a search can find thousands); "Show more" draws the rest.
import { debounce, h, iconFor } from "./dom.js";
import { rangeBetween, dirOf, typeLabel } from "./findCore.js";
import { fs, onFind, setSelection, setViewOptions } from "./findStore.js";
import { dropdown, button } from "./findUi.js";
import { formatDate, formatSize, plural } from "./util.js";
import { registerCopySource } from "./copysection.js";
import { rowsToJson, rowsToMarkdown, rowsToTsv } from "./copyformat.js";

const PAGE = 300;

/** @param {{ onActivate: (item: any) => void }} hooks */
export function createResults(hooks) {
  let shown = PAGE;
  let focusIndex = -1;
  let anchorIndex = -1;

  const count = h("span", { class: "pw-status", role: "status", "aria-live": "polite" }, "No search yet.");
  const filter = h("input", {
    type: "search", class: "find-input find-w-m", placeholder: "Narrow these results…", "aria-label": "Narrow these results",
    title: "Type part of a name or folder to show fewer of the results below. Nothing is searched again.", spellcheck: "false", autocomplete: "off",
    oninput: debounce(() => setViewOptions({ filter: filter.value }), 200),
  });
  const sort = dropdown(["Default order"], { label: "Sort the results", tip: "Change the order of the results below", onchange: () => setViewOptions({ sort: sort.value }) });
  const selectAll = button("Select all", () => { setSelection(fs.view.map((i) => i.path)); table.focus(); }, { tip: "Select every result that is shown (Ctrl+A or ⌘A in the table)" });
  const selectNone = button("Select none", () => setSelection([]), { tip: "Clear the selection" });
  const more = button("Show more", () => { shown += PAGE; renderRows(); }, { tip: "Show the next results in the table" });

  const head = h("thead", {}, h("tr", { role: "row" }, ["Name", "Folder", "Type", "Size", "Changed", "Permissions"].map((t) => h("th", { scope: "col", role: "columnheader", class: t === "Size" ? "num" : t === "Permissions" ? "find-col-perms" : "" }, t))));
  const body = h("tbody", {});
  const table = h("table", {
    class: "pw-table find-table", role: "grid", tabindex: "0", "aria-multiselectable": "true", "aria-label": "Search results. Arrow keys move, Space selects, Enter opens.",
    onkeydown: onKey,
  }, head, body);
  const wrap = h("div", { class: "pw-table-wrap find-table-wrap" }, table);
  // The Copy button copies every result that matches the filter, not only the rows drawn so far.
  registerCopySource(table, () => {
    const rows = [["Name", "Folder", "Type", "Size", "Changed", "Permissions"], ...fs.view.map((i) => [i.name, dirOf(i.relativePath) || "·", typeLabel(i.type), i.type === "directory" ? "—" : formatSize(i.sizeBytes), formatDate(i.mtimeMs), fs.meta.posix ? i.permStr : "—"])];
    if (rows.length === 1) return null;
    return { text: rowsToTsv(rows), tsv: rowsToTsv(rows), markdown: rowsToMarkdown(rows), json: rowsToJson(rows) };
  }, "Search results");

  const el = h("section", { class: "pw-card find-results", "aria-label": "Results" },
    h("div", { class: "pw-row find-results-head" }, h("h3", {}, "Results"), count),
    h("div", { class: "pw-row" }, filter, sort, selectAll, selectNone),
    wrap,
    h("div", { class: "pw-row" }, more),
  );

  function rowFor(item, index) {
    const tr = h("tr", {
      role: "row", id: `find-row-${index}`, "aria-selected": fs.selected.has(item.path) ? "true" : "false", dataset: { index: String(index) }, title: item.path,
      onclick: (e) => click(index, e),
      ondblclick: () => hooks.onActivate(item),
    },
      h("td", { role: "gridcell", class: "find-name" }, h("span", { "aria-hidden": "true" }, `${iconFor(item.name, item.type === "directory")} `), item.name, item.type === "symlink" && item.targetSymlink ? h("span", { class: "pw-hint" }, ` → ${item.targetSymlink}`) : null),
      h("td", { role: "gridcell", class: "find-dir", title: "Where it is inside the search folder" }, dirOf(item.relativePath) || "·"),
      h("td", { role: "gridcell" }, typeLabel(item.type)),
      h("td", { role: "gridcell", class: "num" }, item.type === "directory" ? "—" : formatSize(item.sizeBytes)),
      h("td", { role: "gridcell" }, formatDate(item.mtimeMs)),
      h("td", { role: "gridcell", class: "pw-mono find-col-perms" }, fs.meta.posix ? item.permStr : "—"),
    );
    return tr;
  }

  function renderRows() {
    const rows = fs.view.slice(0, shown);
    if (!rows.length) {
      const text = fs.stats ? (fs.items.length ? "Nothing matches the words in the box above. Clear it to see all results." : "Nothing was found. Try a different word or fewer filters.") : "Type something above and press Find to see matches here.";
      body.replaceChildren(h("tr", { role: "row" }, h("td", { role: "gridcell", colspan: "6", class: "pw-hint" }, text)));
    } else {
      body.replaceChildren(...rows.map(rowFor));
    }
    more.hidden = shown >= fs.view.length;
    more.textContent = `Show ${Math.min(PAGE, fs.view.length - shown)} more (${fs.view.length - shown} not shown yet)`;
    paintFocus();
    paintCount();
  }

  function paintCount() {
    if (!fs.stats) {
      count.textContent = "No search yet.";
      return;
    }
    const parts = [`${plural(fs.view.length, "match", "matches")}${fs.view.length !== fs.items.length ? ` shown of ${fs.items.length}` : ""}`];
    if (fs.selected.size) parts.push(`${fs.selected.size} selected`);
    count.textContent = parts.join(" · ");
  }

  function paintSelection() {
    for (const tr of body.children) {
      const item = fs.view[Number(tr.dataset.index)];
      if (item) tr.setAttribute("aria-selected", fs.selected.has(item.path) ? "true" : "false");
    }
    paintCount();
  }

  function paintFocus() {
    for (const tr of body.querySelectorAll(".find-focus")) tr.classList.remove("find-focus");
    const tr = document.getElementById(`find-row-${focusIndex}`);
    if (tr && body.contains(tr)) {
      tr.classList.add("find-focus");
      table.setAttribute("aria-activedescendant", tr.id);
      tr.scrollIntoView({ block: "nearest" });
    } else {
      table.removeAttribute("aria-activedescendant");
    }
  }

  function moveTo(index, { extend = false, keep = false } = {}) {
    if (!fs.view.length) return;
    const i = Math.max(0, Math.min(fs.view.length - 1, index));
    if (i >= shown) {
      shown = Math.ceil((i + 1) / PAGE) * PAGE;
      renderRows();
    }
    focusIndex = i;
    if (extend) {
      if (anchorIndex < 0) anchorIndex = i;
      setSelection(rangeBetween(anchorIndex, i).map((n) => fs.view[n].path));
    } else if (!keep) {
      anchorIndex = i;
      setSelection([fs.view[i].path]);
    }
    paintFocus();
  }

  function click(index, e) {
    table.focus();
    const item = fs.view[index];
    if (!item) return;
    focusIndex = index;
    if (e.shiftKey) return moveTo(index, { extend: true });
    anchorIndex = index;
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(fs.selected);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      setSelection([...next]);
    } else {
      setSelection([item.path]);
    }
    paintFocus();
  }

  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    const start = focusIndex < 0 ? 0 : focusIndex;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); return moveTo(focusIndex < 0 ? 0 : focusIndex + 1, { extend: e.shiftKey, keep: mod });
      case "ArrowUp": e.preventDefault(); return moveTo(focusIndex < 0 ? 0 : focusIndex - 1, { extend: e.shiftKey, keep: mod });
      case "PageDown": e.preventDefault(); return moveTo(start + 10, { extend: e.shiftKey });
      case "PageUp": e.preventDefault(); return moveTo(start - 10, { extend: e.shiftKey });
      case "Home": e.preventDefault(); return moveTo(0, { extend: e.shiftKey });
      case "End": e.preventDefault(); return moveTo(fs.view.length - 1, { extend: e.shiftKey });
      case " ": {
        e.preventDefault();
        const item = fs.view[start];
        if (!item) return;
        focusIndex = start;
        anchorIndex = start;
        const next = new Set(fs.selected);
        if (next.has(item.path)) next.delete(item.path);
        else next.add(item.path);
        setSelection([...next]);
        return paintFocus();
      }
      case "Enter": {
        const item = fs.view[start];
        if (item) {
          e.preventDefault();
          hooks.onActivate(item);
        }
        return undefined;
      }
      case "a":
      case "A":
        if (mod) {
          e.preventDefault();
          setSelection(fs.view.map((i) => i.path));
        }
        return undefined;
      default:
        return undefined;
    }
  }

  onFind("results", () => {
    shown = PAGE;
    focusIndex = -1;
    anchorIndex = -1;
    renderRows();
  });
  onFind("view", () => {
    shown = PAGE;
    focusIndex = -1;
    renderRows();
  });
  onFind("selection", paintSelection);
  renderRows();

  return {
    el,
    setSortKeys(keys) {
      sort.replaceChildren(...keys.map((k) => h("option", { value: k }, k)));
      sort.value = fs.sort;
    },
    /** Points at one result (used when a line in the content search or the duplicates list is clicked). */
    reveal(path) {
      const index = fs.view.findIndex((i) => i.path === path);
      if (index < 0) return false;
      moveTo(index);
      table.focus();
      return true;
    },
    resetFilter() {
      filter.value = "";
    },
    focusTable: () => table.focus(),
  };
}
