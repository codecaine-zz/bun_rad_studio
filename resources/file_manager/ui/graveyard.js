// The Graveyard tab (Find & more → Graveyard): everything Rip Studio does, inside the File Manager. Buried items wait in the
// Rip graveyard (shared with Rip Studio and `bun run cli:rip`) until you restore them or delete them for good.
// This file owns the tab; the list, the actions, the preview and Verify live in their own grave*.js modules.
import { ApiError, call } from "./api.js";
import { debounce, h } from "./dom.js";
import { toast } from "./menus.js";
import { goTo } from "./nav.js";
import { registerPowerTab } from "./power.js";
import { currentPath, emit, on } from "./state.js";
import { deleteIds, deleteOlderThan, emptyEverything, restoreIds, restoreToFolder } from "./graveActions.js";
import { createList } from "./graveList.js";
import { createPreview } from "./gravePreview.js";
import { showVerify } from "./graveVerify.js";
import { formatDate, formatSize, plural } from "./util.js";

const say = (err) => (err instanceof ApiError ? err.message : "That didn't work.");
const FILTERS = [["all", "All"], ["here", "From the current folder"], ["files", "Files"], ["folders", "Folders"]];

function card(label, value, sub, title) {
  return h("div", { class: "grave-card", title }, h("span", { class: "grave-card-n" }, value), h("span", { class: "grave-card-l" }, label), h("span", { class: "grave-card-s" }, sub));
}

function mount(root) {
  root.classList.add("grave-pane");
  const env = {
    query: { query: "", filter: "all", sort: "buried", dir: "desc", page: 1, pageSize: 100 },
    selected: new Set(),
    rows: [],
    status: null,
    emptyText: (data) => {
      if (data.damaged || env.status?.damaged) return "The list can't be read because its record file is damaged. Open Verify to repair it.";
      if (env.query.filter === "here" && !currentPath()) return "Open a folder in the file list first: this filter shows what was buried from the folder you are looking at.";
      if (env.query.query || env.query.filter !== "all") return "Nothing matches. Clear the search or choose All to see everything that is buried.";
      return data.total === 0 ? "The graveyard is empty. Things you bury (right-click → Bury (Rip)) wait here until you restore or delete them." : "";
    },
    onSelect: () => updateButtons(),
    onPreview: (row) => preview.show(row),
    onOpenFolder: (row) => openFolderOf(row),
    sortBy: (key) => {
      const q = env.query;
      if (q.sort === key) q.dir = q.dir === "asc" ? "desc" : "asc";
      else {
        q.sort = key;
        q.dir = key === "buried" || key === "size" ? "desc" : "asc";
      }
      q.page = 1;
      return loadList();
    },
    goPage: (page) => {
      env.query.page = Math.max(1, page);
      return loadList();
    },
  };
  const list = createList(env);
  const preview = createPreview();
  let statusSeq = 0;
  let listSeq = 0;

  // ---- summary cards -------------------------------------------------------------------------------------------------
  const cards = h("section", { class: "grave-cards", "aria-label": "Graveyard summary" });
  const where = h("code", { class: "grave-path pw-mono" }, "");
  const alert = h("p", { class: "grave-alert", role: "alert", hidden: true });
  const status = h("p", { class: "pw-status", role: "status", "aria-live": "polite" });

  function drawStatus(s) {
    env.status = s;
    const free = s.free ? formatSize(s.free.freeBytes) : "Unknown";
    cards.replaceChildren(
      card("Buried items", s.count.toLocaleString("en-US"), s.today ? `${plural(s.today, "item")} buried today` : "none buried today", "How many items wait in the graveyard"),
      card("Total size", s.count ? s.human : "0 B", "freed if you emptied it", "The space the buried items use on the disk"),
      card("Oldest", s.oldest ? formatDate(s.oldest.buriedAtMs) : "—", s.oldest ? s.oldest.name : "nothing buried yet", "When the item that has been waiting longest was buried"),
      card("Newest", s.newest ? formatDate(s.newest.buriedAtMs) : "—", s.newest ? s.newest.name : "nothing buried yet", "When the most recent item was buried"),
      card("Free space", free, s.free ? `of ${formatSize(s.free.totalBytes)} on this disk` : "on this disk", "How much room is left on the disk that holds the graveyard"),
    );
    where.textContent = s.dir;
    alert.hidden = !s.damaged;
    alert.textContent = s.damaged ? "⚠ The graveyard's record file is damaged, so nothing can be changed yet. Open Verify and choose Repair." : "";
  }

  // ---- loading -------------------------------------------------------------------------------------------------------
  async function loadStatus() {
    const mine = ++statusSeq;
    try {
      const { status: s } = await call("grave/status");
      if (mine === statusSeq) drawStatus(s);
    } catch (err) {
      status.textContent = say(err);
    }
  }

  async function loadList() {
    const mine = ++listSeq;
    const q = env.query;
    if (q.filter === "here" && !currentPath()) {
      list.render({ items: [], total: 0, page: 1, pages: 1, pageSize: q.pageSize });
      return;
    }
    try {
      const data = await call("grave/list", { ...q, folder: currentPath() });
      if (mine !== listSeq) return;
      q.page = data.page;
      list.render(data);
      status.textContent = "";
    } catch (err) {
      if (mine === listSeq) status.textContent = say(err);
    }
    updateButtons();
  }

  const reload = () => Promise.all([loadStatus(), loadList()]);
  const visible = () => !root.hidden;

  // ---- controls ------------------------------------------------------------------------------------------------------
  const search = h("input", { type: "search", class: "grave-search", "aria-label": "Search buried items", placeholder: "Search by name or folder", title: "Type part of a name or folder to narrow the list. Several words must all match.", maxlength: "200", oninput: debounce(() => { env.query.query = search.value; env.query.page = 1; loadList(); }, 250) });
  const filter = h("select", { "aria-label": "Show", title: "Choose which buried items to show", onchange: () => { env.query.filter = filter.value; env.query.page = 1; loadList(); } },
    FILTERS.map(([v, l]) => h("option", { value: v }, l)));
  const pageSize = h("select", { "aria-label": "Items per page", title: "How many buried items to show on each page", onchange: () => { env.query.pageSize = Number(pageSize.value); env.query.page = 1; loadList(); } },
    [50, 100, 250, 500].map((n) => h("option", { value: String(n), selected: n === 100 }, `${n} per page`)));
  const count = h("span", { class: "pw-status", "aria-live": "polite" });

  const button = (label, title, onclick, { primary = false, danger = false } = {}) => h("button", { type: "button", class: `pw-btn${primary ? " primary" : ""}${danger ? " danger" : ""}`, title, onclick }, label);
  const ids = () => [...env.selected];
  const namesOf = () => env.rows.filter((r) => env.selected.has(r.id)).map((r) => r.name);
  const afterAction = (promise) => promise.then((did) => did && env.selected.clear()).finally(() => reload());

  const restore = button("Restore", "Put the selected items back where they came from. If the folder is gone, or something with the same name is in the way, you choose what to do.", () => afterAction(restoreIds(ids())), { primary: true });
  const restoreTo = button("Restore to…", "Put the selected items in a folder you choose, instead of where they came from.", () => afterAction(restoreToFolder(ids())));
  const openFolder = button("Open its folder", "Show the folder this item came from in the file list (select one item).", () => { const row = env.rows.find((r) => env.selected.has(r.id)); if (row) openFolderOf(row); });
  const del = button("Delete for good…", "Permanently delete the selected items. You will be asked first, and this can't be undone.", () => afterAction(deleteIds(ids(), namesOf())), { danger: true });
  const older = button("Delete old…", "Permanently delete everything that was buried more than a number of days ago. You choose the number and see how many items that is first.", () => afterAction(deleteOlderThan()), { danger: true });
  const empty = button("Empty graveyard…", "Permanently delete everything in the graveyard. You will be asked to type a word first.", () => afterAction(emptyEverything()), { danger: true });
  const selectAll = button("Select all", "Choose every item that matches the search and filter, on every page.", async () => {
    try {
      const { ids: all } = await call("grave/list", { ...env.query, folder: currentPath(), idsOnly: true });
      for (const id of all) env.selected.add(id);
      list.paintChecks();
      updateButtons();
      status.textContent = `Selected ${all.length.toLocaleString("en-US")} ${all.length === 1 ? "item" : "items"} on all pages.`;
    } catch (err) {
      toast(say(err), { kind: "error" });
    }
  });
  const selectNone = button("Select none", "Untick everything.", () => { env.selected.clear(); list.paintChecks(); updateButtons(); status.textContent = ""; });
  const verify = button("Verify…", "Check that the list and the files in the graveyard agree, and repair the list if they don't.", () => showVerify());
  const refresh = button("Refresh", "Look at the graveyard again.", () => reload());

  function updateButtons() {
    const n = env.selected.size;
    for (const b of [restore, restoreTo, del]) b.disabled = n === 0;
    openFolder.disabled = n !== 1;
    const total = env.status?.count ?? 0;
    older.disabled = total === 0;
    empty.disabled = !env.status || (total === 0 && !env.status.exists);
    count.textContent = n ? `${plural(n, "item")} selected` : "";
  }

  async function openFolderOf(row) {
    if (row.unknownOrigin) return toast("Where this came from isn't known. Use Restore to… to choose a folder.", { kind: "info" });
    try {
      const res = await call("typedpath", { text: row.folder, cwd: row.folder });
      if (!res.exists || !res.isDir) return toast("That folder doesn't exist any more. Restore will offer to create it again.", { kind: "info" });
    } catch (err) {
      return toast(say(err), { kind: "error" });
    }
    emit("workspace-go", "files");
    await goTo(row.folder, { select: [row.originalPath] });
  }

  async function showInFileManager() {
    if (!env.status?.exists) return toast("The graveyard folder doesn't exist yet. It is made the first time you bury something.", { kind: "info" });
    try {
      await call("reveal", { path: env.status.dir });
    } catch (err) {
      toast(say(err), { kind: "error" });
    }
  }

  async function openHere() {
    if (!env.status?.exists) return toast("The graveyard folder doesn't exist yet. It is made the first time you bury something.", { kind: "info" });
    emit("workspace-go", "files");
    await goTo(env.status.dir);
  }

  root.append(
    h("p", { class: "pw-hint" }, "Buried items wait here, safe, until you bring them back or delete them for good. Rip Studio and the command bun run cli:rip use this same graveyard."),
    cards,
    h("div", { class: "pw-row grave-where" },
      h("span", {}, "Graveyard folder:"), where,
      button("Show in file manager", "Open the graveyard folder in your computer's own file manager.", () => showInFileManager()),
      button("Open here", "Show the graveyard folder in this file list.", () => openHere())),
    alert,
    h("details", { class: "grave-about" },
      h("summary", { title: "What the graveyard is, and how it differs from the Recycle Bin" }, "How is this different from the Recycle Bin?"),
      h("p", {}, "The Recycle Bin belongs to this app only: it keeps what you delete here and brings it back with Restore. The Rip graveyard is the quarantine folder used by Rip Studio and the bun run cli:rip command, so what you bury here can be restored from there too, and the other way round."),
      h("p", {}, "The separate rip program (installed with Homebrew) keeps its own graveyard in a different layout. It can sit in the same folder without harm, but its items aren't shown here, and these items aren't shown by it."),
      h("p", {}, "In Settings you can choose which one the Delete key uses. Right-click → Bury (Rip) always uses the graveyard.")),
    h("div", { class: "pw-row grave-controls" },
      h("label", { class: "pw-field" }, "Search", search), h("label", { class: "pw-field" }, "Show", filter), h("label", { class: "pw-field" }, "Page size", pageSize)),
    h("div", { class: "pw-row grave-actions", role: "toolbar", "aria-label": "Graveyard actions" }, restore, restoreTo, openFolder, del, older, empty, selectAll, selectNone, verify, refresh, count),
    status,
    list.el,
    preview.el,
  );

  on("grave-changed", () => visible() && reload());
  // The "From the current folder" filter follows the folder shown in the file list.
  on("view", () => visible() && env.query.filter === "here" && loadList());
  updateButtons();

  return {
    show() {
      preview.clear();
      reload();
    },
  };
}

registerPowerTab({
  id: "grave",
  label: "Graveyard",
  icon: "🪦",
  tip: "A safe place for things you bury instead of deleting: see what is there, restore items, or delete them for good (shared with Rip Studio)",
  group: "files",
  mount,
});
