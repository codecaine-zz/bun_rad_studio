// The per-file table of the Code stats section: the files of one language (or all, largest first) with their lines of
// code, comments and blanks. Press a file to show it in the file list; double-press (or Enter) to open it in the Code editor.
import { call } from "./api.js";
import { h } from "./dom.js";
import { openInCodeAt, joinRoot, revealPath } from "./devActions.js";
import { btn, createStatus, createTable, errorText, num } from "./devCore.js";
import { formatSize, plural } from "./util.js";

const PAGE = 100;
const COLUMNS = [
  { key: "path", label: "File", sort: true, rowHeader: true },
  { key: "language", label: "Language" },
  { key: "code", label: "Code", num: true, sort: true },
  { key: "comments", label: "Comments", num: true, sort: true },
  { key: "blanks", label: "Blanks", num: true, sort: true },
  { key: "lines", label: "Lines", num: true, sort: true },
  { key: "size", label: "Size", num: true, sort: true },
];

export function createFiles(env) {
  let language = "";
  let sort = { key: "code", dir: "desc" };
  let shown = [];
  let total = 0;
  let seq = 0;
  let selectedPath = "";

  const status = createStatus();
  const select = h("select", { id: "dev-files-lang", title: "Show the files of one language, or all of them." }, h("option", { value: "" }, "All languages"));
  const filter = h("input", { type: "search", id: "dev-files-filter", spellcheck: "false", autocomplete: "off", "aria-label": "Filter files", placeholder: "Filter by file name", title: "Type part of a file's path to show only the matching files." });
  const more = btn("Show more", "Show the next files.", () => load(true));
  more.hidden = true;
  const table = createTable({ caption: "Files, largest first. Press a file to select it in the file list; double-press to open it in the Code editor.", columns: COLUMNS, onSort: (key, dir) => { sort = { key, dir }; load(false); } });
  const title = h("h3", {}, "Files");
  const el = h("div", { class: "pw-card dev-files", hidden: true },
    title,
    h("div", { class: "pw-row" }, h("label", { class: "pw-field" }, "Language", select), h("label", { class: "pw-field" }, "Filter", filter)),
    status.el, table.el, more);

  select.addEventListener("change", () => { language = select.value; load(false); });
  let timer = 0;
  filter.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => load(false), 200); });

  const folder = () => env.getCurrent()?.result.root ?? "";

  async function load(append) {
    const cur = env.getCurrent();
    if (!cur) return;
    const mine = ++seq;
    try {
      const res = await call("dev/stats/files", { id: cur.id, language, sort: sort.key, dir: sort.dir, filter: filter.value, offset: append ? shown.length : 0, limit: PAGE });
      if (mine !== seq) return;
      shown = append ? [...shown, ...res.rows] : res.rows;
      total = res.total;
      render();
    } catch (err) {
      if (mine === seq) status.set(errorText(err, "The file list couldn't be loaded."), true);
    }
  }

  function render() {
    table.setSort(sort.key, sort.dir);
    const root = folder();
    table.render(shown.map((f) => ({
      key: f.path,
      selected: f.path === selectedPath,
      onclick: () => { selectedPath = f.path; revealPath(joinRoot(root, f.path)); render(); },
      ondblclick: () => openInCodeAt(joinRoot(root, f.path)),
      cells: [f.path, f.language, num(f.code), num(f.comments), num(f.blanks), num(f.code + f.comments + f.blanks), f.size ? formatSize(f.size) : "—"],
    })));
    title.textContent = language ? `${language} files` : "All files";
    status.set(total === 0 ? "No files match." : `Showing ${shown.length.toLocaleString()} of ${plural(total, "file")}.`);
    more.hidden = shown.length >= total;
  }

  return {
    el,
    setResult(result) {
      el.hidden = false;
      const names = result.languages.filter((l) => l.files > 0).map((l) => l.name);
      select.replaceChildren(h("option", { value: "" }, "All languages"), ...names.map((n) => h("option", { value: n }, n)));
      if (!names.includes(language)) language = "";
      select.value = language;
      sort = { key: "code", dir: "desc" };
      selectedPath = "";
      load(false);
    },
    setLanguage(name) {
      language = name;
      if (![...select.options].some((o) => o.value === name)) select.append(h("option", { value: name }, name));
      select.value = name;
      load(false);
      el.scrollIntoView?.({ block: "nearest" });
    },
    /** What the table shows now, for an export of the same list. */
    currentQuery: () => ({ language, sort: sort.key, dir: sort.dir, filter: filter.value }),
  };
}
