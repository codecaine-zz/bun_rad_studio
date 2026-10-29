// "Databases" tool of the Power tools panel: saved connections for SQLite, MySQL / MariaDB, PostgreSQL and Redis, the
// real studios for each shown inside the tab, and settings that replace environment variables. The page never talks to
// a database itself: the File Manager server does that, and keeps passwords in the OS keychain.
import { clear, h } from "./dom.js";
import { ApiError } from "./api.js";
import { detected, refreshDetect, renderBanner, renderDetectSettings } from "./dbDetect.js";
import { showCloneDialog } from "./dbClone.js";
import { showMacrosDialog } from "./dbMacros.js";
import { renderDetail } from "./dbDetail.js";
import { showEditor, showNewSqliteDialog } from "./dbEditor.js";
import { showSampleDialog } from "./dbSample.js";
import { showEnvFileImport, showEnvImport, showPasteUrl } from "./dbImport.js";
import { renderList } from "./dbList.js";
import { openShortcut } from "./dbShortcuts.js";
import { db, loadOverview, profileById } from "./dbState.js";
import { activeStudioId, hideStudios, mountStudioArea, openStudio, openStudios, setStudioExpanded, showStudioById } from "./dbStudio.js";
import { showMenu, toast } from "./menus.js";
import { registerPowerTab } from "./power.js";
import { on } from "./state.js";

const STATE_ICON = { starting: "⏳", running: "🟢", crashed: "🔴" };

function mount(root) {
  root.classList.add("db-root");
  root.dataset.view = "list";
  let filter = "";
  let visible = false;
  const syncStudioChrome = () => {
    if (typeof document !== "undefined") {
      document.getElementById("app")?.classList.toggle("db-studio-open", visible && root.dataset.view === "studio");
    }
  };

  const addBtn = h("button", { type: "button", class: "pw-btn primary", "aria-haspopup": "menu", title: "Add a connection: SQLite, MySQL / MariaDB, PostgreSQL or Redis" }, "＋ Add connection");
  const newSqliteBtn = h("button", { type: "button", class: "pw-btn", title: "Create a brand-new SQLite database file (empty or with starter tables) and optionally open it right away" }, "🪶 New SQLite database…");
  const cloneBtn = h("button", { type: "button", class: "pw-btn", title: "Clone an entire database or selected tables, views and Redis keys between SQLite, MySQL / MariaDB, PostgreSQL and Redis" }, "🧬 Clone database / tables…");
  const macrosBtn = h("button", { type: "button", class: "pw-btn", title: "Build and run Microsoft Access-style database macros using the Bun JavaScript runtime (CurrentDb, DoCmd, DLookup, TempVars) or visual action rows" }, "⚡ Macros (Bun JS)…");
  const pasteBtn = h("button", { type: "button", class: "pw-btn", title: "Paste a mysql://, postgres://, redis:// or sqlite: address to fill in the form" }, "Paste address…");
  const envBtn = h("button", { type: "button", class: "pw-btn", title: "Look for connections in this program's environment variables and .env files" }, "Import from environment…");
  const fileBtn = h("button", { type: "button", class: "pw-btn", title: "Import database settings from a .env file you choose" }, "Import .env file…");
  const sampleBtn = h("button", { type: "button", class: "pw-btn", title: "Create a new SQLite file with one of the built-in synthetic sample databases (Medicare formulary builder, hospital, banking and more)" }, "New sample database…");
  const search = h("input", { type: "search", class: "text-input db-filter", placeholder: "Filter connections", "aria-label": "Filter connections by name, folder, tag or server", autocomplete: "off" });
  const toolbar = h("div", { class: "pw-row db-toolbar", role: "toolbar", "aria-label": "Database connections" }, addBtn, newSqliteBtn, cloneBtn, macrosBtn, sampleBtn, pasteBtn, envBtn, fileBtn, search);
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

  const drawList = () => renderList(listBox, { filter, open: (p) => openStudio({ profileId: p.id }), shortcut: (p) => openShortcut(p) });

  /** "Open MySQL Studio" from a right-click menu: the one saved connection of that kind, a list to choose from, or the form to add the first. */
  const openEngine = async (engine) => {
    const label = db.engines.find((e) => e.id === engine)?.label ?? engine;
    const mine = db.profiles.filter((p) => p.engine === engine).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || (Date.parse(b.lastUsedAt ?? "") || 0) - (Date.parse(a.lastUsedAt ?? "") || 0));
    if (mine.length === 1) return void (await openStudio({ profileId: mine[0].id }));
    if (mine.length > 1) {
      filter = label;
      search.value = label;
      db.selectedId = mine[0].id;
      renderAll();
      toast(`You have ${mine.length} ${label} connections. Choose one, then press Enter or “Open in …”.`, { kind: "info" });
      return;
    }
    toast(`No ${label} connection yet. Add one to open its studio.`, { kind: "info" });
    await choose(await showEditor({ engine }));
  };

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
  newSqliteBtn.addEventListener("click", async () => {
    const made = await showNewSqliteDialog();
    if (!made) return;
    toast(`Created ${made.path}${made.profile ? " and saved it as a connection." : "."}`, { kind: "info" });
    if (made.profile) await choose(made.profile);
    else await loadOverview();
    if (made.openNow) {
      if (made.profile) await openStudio({ profileId: made.profile.id });
      else await openStudio({ engine: "sqlite", path: made.path });
    }
  });
  cloneBtn.addEventListener("click", async () => {
    const made = await showCloneDialog({ sourceProfileId: db.selectedId ?? undefined });
    if (!made) return;
    if (made.createdProfile) await choose(made.createdProfile);
    else {
      await loadOverview();
      renderAll();
    }
  });
  macrosBtn.addEventListener("click", async () => {
    await showMacrosDialog({ profileId: db.selectedId ?? undefined });
  });
  pasteBtn.addEventListener("click", async () => choose(await showPasteUrl()));
  sampleBtn.addEventListener("click", async () => {
    const made = await showSampleDialog();
    if (!made) return;
    toast(`Created ${made.path}${made.profile ? " and saved it as a connection." : "."}`, { kind: "info" });
    await choose(made.profile ?? null);
    if (!made.profile) await loadOverview();
  });
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
    const cur = activeStudioId();
    clear(strip);
    strip.dataset.count = String(open.length);
    strip.hidden = open.length === 0;
    if (!open.length) return;
    strip.append(
      h("span", { class: "pw-hint" }, `Open studios (${open.filter((s) => s.state !== "crashed").length} of ${db.limits.maxStudios}): `),
      ...open.map((s) => {
        const isCurrent = s.id === cur;
        return h("button", {
          type: "button",
          class: `pw-btn db-chip${isCurrent ? " active" : ""}`,
          ...(isCurrent ? { "aria-current": "true" } : {}),
          title: `Show ${s.title}`,
          onclick: () => showStudioById(s.id),
        }, `${STATE_ICON[s.state] ?? ""} ${s.title}`);
      }),
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
    syncStudioChrome();
    if (visible) {
      renderStrip();
      if (d.view !== "studio") drawList();
    }
  });

  return {
    async show(opts = {}) {
      visible = true;
      syncStudioChrome();
      try {
        await loadOverview();
      } catch (err) {
        detail.replaceChildren(h("p", { class: "power-error", role: "alert" }, err instanceof ApiError ? err.message : "The Databases tool couldn't load."));
        return;
      }
      if (opts.select && profileById(opts.select)) db.selectedId = opts.select;
      renderAll();
      if (db.settings.detect.auto || !detected.loaded) await refreshDetect().catch(() => {});
      if (opts.engine) await openEngine(opts.engine);
      else if (opts.sqlitePath) await openStudio({ engine: "sqlite", path: opts.sqlitePath });
      else if (opts.profileId) await openStudio({ profileId: opts.profileId });
      else if (root.dataset.view === "list") listBox.querySelector(".db-row[tabindex='0']")?.focus({ preventScroll: true });
    },
    hide() {
      visible = false;
      setStudioExpanded(false);
      syncStudioChrome();
    },
  };
}

registerPowerTab({
  id: "databases", label: "Databases", icon: "🗄️",
  tip: "Saved connections for SQLite, MySQL, PostgreSQL and Redis, with each studio inside the tab. A saved connection replaces environment variables.",
  mount,
});
