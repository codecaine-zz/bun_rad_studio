// "Databases" tool of the Power tools panel: saved connections for SQLite, MySQL / MariaDB, PostgreSQL and Redis, the
// real studios for each shown inside the tab, and settings that replace environment variables. The page never talks to
// a database itself: the File Manager server does that, and keeps passwords in the OS keychain.
import { clear, h } from "./dom.js";
import { ApiError } from "./api.js";
import { detected, refreshDetect, renderBanner, renderDetectSettings } from "./dbDetect.js";
import { renderDetail } from "./dbDetail.js";
import { showEditor } from "./dbEditor.js";
import { showEnvFileImport, showEnvImport, showPasteUrl } from "./dbImport.js";
import { renderList } from "./dbList.js";
import { db, loadOverview, profileById } from "./dbState.js";
import { hideStudios, mountStudioArea, openStudio, openStudios, showStudioById } from "./dbStudio.js";
import { showMenu } from "./menus.js";
import { registerPowerTab } from "./power.js";
import { on } from "./state.js";

const STATE_ICON = { starting: "⏳", running: "🟢", crashed: "🔴" };

function mount(root) {
  root.classList.add("db-root");
  root.dataset.view = "list";
  let filter = "";
  let visible = false;

  const addBtn = h("button", { type: "button", class: "pw-btn primary", "aria-haspopup": "menu", title: "Add a connection: SQLite, MySQL / MariaDB, PostgreSQL or Redis" }, "＋ Add connection");
  const pasteBtn = h("button", { type: "button", class: "pw-btn", title: "Paste a mysql://, postgres://, redis:// or sqlite: address to fill in the form" }, "Paste address…");
  const envBtn = h("button", { type: "button", class: "pw-btn", title: "Look for connections in this program's environment variables and .env files" }, "Import from environment…");
  const fileBtn = h("button", { type: "button", class: "pw-btn", title: "Import database settings from a .env file you choose" }, "Import .env file…");
  const search = h("input", { type: "search", class: "text-input db-filter", placeholder: "Filter connections", "aria-label": "Filter connections by name, folder, tag or server", autocomplete: "off" });
  const toolbar = h("div", { class: "pw-row db-toolbar", role: "toolbar", "aria-label": "Database connections" }, addBtn, pasteBtn, envBtn, fileBtn, search);
  const found = h("section", { class: "db-found", "aria-label": "Found in your environment", hidden: true });
  const detectBox = h("div", { class: "db-detect" });
  const strip = h("div", { class: "db-strip", role: "group", "aria-label": "Open studios", hidden: true });
  const listBox = h("div", { class: "db-listbox" });
  const detail = h("div", { class: "db-detail", "aria-live": "polite" });
  const studios = h("div", { class: "db-studio-area" });
  const keychain = h("p", { class: "db-notice", role: "note", hidden: true });
  const main = h("div", { class: "db-main" }, listBox, detail);
  root.append(toolbar, keychain, found, detectBox, strip, main, studios);
  mountStudioArea(studios);

  const drawList = () => renderList(listBox, { filter, open: (p) => openStudio({ profileId: p.id }) });

  const choose = async (profile) => {
    if (!profile) return;
    db.selectedId = profile.id;
    await loadOverview();
    renderAll();
  };

  addBtn.addEventListener("click", () => {
    showMenu(
      db.engines.map((e) => ({ label: e.label, icon: e.icon, action: async () => choose(await showEditor({ engine: e.id })) })),
      { anchor: addBtn, label: "Kind of connection to add" },
    );
  });
  pasteBtn.addEventListener("click", async () => choose(await showPasteUrl()));
  envBtn.addEventListener("click", async () => {
    await showEnvImport({ chooseFile: () => showEnvFileImport() });
    await loadOverview();
    renderAll();
  });
  fileBtn.addEventListener("click", async () => {
    await showEnvFileImport();
    await loadOverview();
    renderAll();
  });
  search.addEventListener("input", () => {
    filter = search.value;
    drawList();
  });

  function renderStrip() {
    const open = openStudios();
    clear(strip);
    strip.hidden = open.length === 0;
    if (!open.length) return;
    strip.append(
      h("span", { class: "pw-hint" }, `Open studios (${open.filter((s) => s.state !== "crashed").length} of ${db.limits.maxStudios}): `),
      ...open.map((s) => h("button", { type: "button", class: "pw-btn db-chip", title: `Show ${s.title}`, onclick: () => showStudioById(s.id) }, `${STATE_ICON[s.state] ?? ""} ${s.title}`)),
    );
  }

  function renderKeychain() {
    keychain.hidden = db.secretStore.persistent || !db.loaded;
    keychain.textContent = db.secretStore.persistent ? "" : "⚠ Your computer's keychain isn't available. Passwords you save are kept only until the File Manager closes, so you will be asked for them again next time.";
  }

  function renderAll() {
    const hadFocus = listBox.contains(document.activeElement);
    renderKeychain();
    drawList();
    renderDetail(detail);
    renderStrip();
    renderBanner(found);
    renderDetectSettings(detectBox);
    if (hadFocus) listBox.querySelector(".db-row.selected")?.focus();
  }

  on("db-overview", () => visible && renderAll());
  on("db-select", () => {
    if (!visible) return;
    const hadFocus = listBox.contains(document.activeElement);
    drawList();
    renderDetail(detail);
    if (hadFocus) listBox.querySelector(".db-row.selected")?.focus();
  });
  on("db-detect", () => visible && renderBanner(found));
  on("db-studios", () => {
    if (!visible) return;
    renderStrip();
    drawList();
  });
  on("db-view", (d) => {
    root.dataset.view = d.view === "studio" ? "studio" : "list";
    if (d.view !== "studio") hideStudios();
    if (visible) {
      renderStrip();
      if (d.view !== "studio") drawList();
    }
  });

  return {
    async show(opts = {}) {
      visible = true;
      try {
        await loadOverview();
        if (db.settings.detect.auto || !detected.loaded) await refreshDetect().catch(() => {});
      } catch (err) {
        detail.replaceChildren(h("p", { class: "power-error", role: "alert" }, err instanceof ApiError ? err.message : "The Databases tool couldn't load."));
        return;
      }
      if (opts.select && profileById(opts.select)) db.selectedId = opts.select;
      renderAll();
      if (opts.sqlitePath) await openStudio({ engine: "sqlite", path: opts.sqlitePath });
      else if (opts.profileId) await openStudio({ profileId: opts.profileId });
      else if (root.dataset.view === "list") listBox.querySelector(".db-row[tabindex='0']")?.focus({ preventScroll: true });
    },
    hide() {
      visible = false;
    },
  };
}

registerPowerTab({
  id: "databases", label: "Databases", icon: "🗄️",
  tip: "Saved connections for SQLite, MySQL, PostgreSQL and Redis, with each studio inside the tab. A saved connection replaces environment variables.",
  mount,
});
