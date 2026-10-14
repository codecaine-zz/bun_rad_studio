// The left side of the Secrets tab: search box, filter chips, sort, and the list of items. The list is drawn in a
// window (only the rows you can see, plus a few), so thousands of items stay smooth. Only display data from the
// server is used here: titles, user names, hosts, tags; never a password or a note.
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { showMenu } from "./menus.js";
import { clock } from "./secretsClock.js";
import { errorText, sx } from "./secretsState.js";
import { emit, on } from "./state.js";
import { plural } from "./util.js";

export const ROW_HEIGHT = 52;
const OVERSCAN = 6;
const PAGE = 500;

export const TYPE_ICONS = { login: "🔑", note: "📝", card: "💳", identity: "🪪", api: "🧩", wifi: "📶", ssh: "🖥️", custom: "🗂️" };
export const TYPE_NAMES = { login: "Login", note: "Secure note", card: "Card", identity: "Identity", api: "API key", wifi: "Wi-Fi", ssh: "SSH key", custom: "Custom" };

const CHIPS = [
  ["all", "All", "Every item"],
  ["login", "Logins", "Website and app logins"],
  ["note", "Notes", "Secure notes"],
  ["card", "Cards", "Payment cards"],
  ["favorite", "Favourites", "Items you starred"],
  ["flagged", "Weak or reused", "Items with a weak or reused password"],
  ["trash", "Trash", "Deleted items you can still restore"],
];

export function buildList() {
  const filter = { kind: "all", tag: "", query: "", sort: "title" };
  let items = [];
  let total = 0;
  let ticket = 0;
  let searchTimer = 0;
  let facets = { tags: [] };

  const search = h("input", { type: "search", class: "text-input sx-search", "aria-label": "Search your items", placeholder: "Search…", autocomplete: "off", spellcheck: "false", autocapitalize: "off", title: "Search titles, user names, websites, tags and notes. Press / to jump here. Passwords are never searched." });
  const sort = h("select", { class: "text-input sx-sort", "aria-label": "Sort the list", title: "Choose how the list is ordered" },
    h("option", { value: "title" }, "Name A–Z"), h("option", { value: "modified" }, "Recently changed"), h("option", { value: "created" }, "Newest first"), h("option", { value: "type" }, "Kind"));
  const chipEls = new Map();
  const tagChip = h("button", { type: "button", class: "sx-chip", "aria-haspopup": "menu", "aria-pressed": "false", title: "Show only items with a tag you choose", onclick: () => openTags() }, "Tags ▾");
  const chips = h("div", { class: "sx-chips", role: "group", "aria-label": "Filter the list" },
    CHIPS.map(([kind, label, tip]) => {
      const b = h("button", { type: "button", class: "sx-chip", "aria-pressed": String(kind === "all"), title: tip, onclick: () => setKind(kind) }, label);
      chipEls.set(kind, b);
      return b;
    }), tagChip);
  const count = h("p", { class: "sx-count", role: "status" }, "");
  const rows = h("div", { class: "sx-rows", role: "presentation" });
  const scroller = h("div", { class: "sx-scroll", tabindex: "0", role: "listbox", "aria-label": "Your items", title: "Use the up and down arrow keys to move through the items; Enter opens the selected one" }, rows);
  const el = h("div", { class: "sx-listpane", "data-copy": "off" }, h("div", { class: "sx-searchbar" }, search, sort), chips, count, scroller);

  const indexOfSelected = () => items.findIndex((i) => i.id === sx.selectedId);

  function paintChips() {
    for (const [kind, b] of chipEls) b.setAttribute("aria-pressed", String(filter.tag === "" && filter.kind === kind));
    tagChip.setAttribute("aria-pressed", String(filter.tag !== ""));
    tagChip.textContent = filter.tag ? `Tag: ${filter.tag} ✕` : "Tags ▾";
  }

  function rowEl(item, index) {
    const selected = item.id === sx.selectedId;
    return h("div", {
      class: `sx-row-item${selected ? " selected" : ""}`, role: "option", id: `sx-opt-${item.id}`, "aria-selected": String(selected), "aria-posinset": String(index + 1), "aria-setsize": String(total),
      onclick: () => select(item.id),
    },
    h("span", { class: "sx-ico", "aria-hidden": "true" }, TYPE_ICONS[item.type] ?? "🗂️"),
    h("span", { class: "sx-rtext" }, h("strong", { class: "sx-rtitle" }, item.title), h("span", { class: "sx-rsub" }, [item.subtitle, item.host && item.host !== item.subtitle ? item.host : ""].filter(Boolean).join(" · "))),
    item.favorite ? h("span", { class: "sx-badge", title: "Favourite" }, "★") : null,
    item.hasTotp ? h("span", { class: "sx-badge", title: "Has a one-time code (2FA)" }, "2FA") : null);
  }

  function render() {
    const vh = scroller.clientHeight || 520;
    const first = Math.max(0, Math.floor(scroller.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(items.length, Math.ceil((scroller.scrollTop + vh) / ROW_HEIGHT) + OVERSCAN);
    rows.replaceChildren(...items.slice(first, last).map((item, i) => rowEl(item, first + i)));
    rows.style.paddingTop = `${first * ROW_HEIGHT}px`;
    rows.style.paddingBottom = `${Math.max(0, items.length - last) * ROW_HEIGHT}px`;
    const sel = indexOfSelected();
    if (sel >= 0) scroller.setAttribute("aria-activedescendant", `sx-opt-${items[sel].id}`);
    else scroller.removeAttribute("aria-activedescendant");
  }

  function request() {
    const base = { query: filter.query, sort: filter.sort, limit: PAGE };
    if (filter.tag) return { ...base, tag: filter.tag };
    if (filter.kind === "favorite") return { ...base, favorite: true };
    if (filter.kind === "flagged") return { ...base, flagged: true };
    if (filter.kind === "trash") return { ...base, trash: true };
    if (["login", "note", "card"].includes(filter.kind)) return { ...base, type: filter.kind };
    return base;
  }

  function select(id) {
    sx.selectedId = id;
    render();
    emit("secrets-select", id);
  }

  async function load({ keep = true } = {}) {
    const mine = ++ticket;
    try {
      const all = [];
      let offset = 0;
      let seen = Infinity;
      while (offset < seen) {
        const page = await call("secrets/list", { ...request(), offset });
        if (mine !== ticket) return;
        seen = page.total;
        all.push(...page.items);
        if (!page.items.length) break;
        offset += page.items.length;
      }
      items = all;
      total = seen === Infinity ? 0 : seen;
      const filtered = filter.query || filter.tag || filter.kind !== "all";
      count.textContent = total === 0 ? (filtered ? "Nothing matches." : "No items yet. Press “New item” to add your first one.") : `${plural(total, "item")}${filter.kind === "trash" ? " in the Trash" : ""}`;
      if (!keep || !items.some((i) => i.id === sx.selectedId)) select(items[0]?.id ?? null);
      else render();
      emit("secrets-listed", { total, trash: filter.kind === "trash" });
      call("secrets/facets").then((f) => (facets = f)).catch(() => {});
    } catch (err) {
      if (mine === ticket) count.textContent = errorText(err, "Couldn't load the list.");
    }
  }

  function setKind(kind) {
    filter.kind = kind;
    filter.tag = "";
    paintChips();
    announce(`Showing ${CHIPS.find((c) => c[0] === kind)?.[1].toLowerCase() ?? "items"}.`);
    load({ keep: false });
  }

  function openTags() {
    if (filter.tag) {
      filter.tag = "";
      paintChips();
      load({ keep: false });
      return;
    }
    const tags = facets.tags ?? [];
    showMenu(tags.length ? tags.map((t) => ({ label: `${t.name} (${t.count})`, action: () => { filter.tag = t.name; paintChips(); load({ keep: false }); } })) : [{ label: "No tags yet", disabled: true }], { anchor: tagChip, label: "Tags" });
  }

  function move(delta, absolute = null) {
    if (!items.length) return;
    const now = indexOfSelected();
    const i = absolute ?? Math.max(0, Math.min(items.length - 1, (now < 0 ? (delta > 0 ? -1 : items.length) : now) + delta));
    const top = i * ROW_HEIGHT;
    const vh = scroller.clientHeight || 520;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (top + ROW_HEIGHT > scroller.scrollTop + vh) scroller.scrollTop = top + ROW_HEIGHT - vh;
    select(items[i].id);
  }

  search.addEventListener("input", () => {
    clock.clearTimeout(searchTimer);
    searchTimer = clock.setTimeout(() => {
      filter.query = search.value.trim();
      load({ keep: false });
    }, 150);
  });
  sort.addEventListener("change", () => {
    filter.sort = sort.value;
    load();
  });
  scroller.addEventListener("scroll", render);
  scroller.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "PageDown") move(8);
    else if (e.key === "PageUp") move(-8);
    else if (e.key === "Home") move(0, 0);
    else if (e.key === "End") move(0, items.length - 1);
    else if (e.key === "Enter" && sx.selectedId) emit("secrets-open", sx.selectedId);
    else return;
    e.preventDefault();
  });
  on("secrets-items", () => load());

  return {
    el,
    load,
    select,
    focusSearch: () => search.focus(),
    /** Clears the search and filters so a chosen item is certain to be in the list. */
    showAll() {
      filter.kind = "all";
      filter.tag = "";
      filter.query = "";
      search.value = "";
      paintChips();
      return load();
    },
    isTrash: () => filter.kind === "trash",
    reset() {
      items = [];
      total = 0;
      search.value = "";
      filter.kind = "all";
      filter.tag = "";
      filter.query = "";
      paintChips();
      rows.replaceChildren();
    },
    visibleRowCount: () => rows.children.length,
  };
}
