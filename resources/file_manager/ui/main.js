// Start-up: load the places and settings, apply them, draw everything and open the first folder.
import { ApiError } from "./api.js";
import { $, h } from "./dom.js";
import { showWelcome } from "./extras.js";
import { wireFavorites } from "./favorites.js";
import { wireInfo } from "./info.js";
import { wireKeys } from "./keys.js";
import { isRenaming, renderList, wireList } from "./list.js";
import { menuIsOpen } from "./menus.js";
import { goTo, loadPlaces, refresh } from "./nav.js";
import { renderSidebar, wireSidebar } from "./sidebar.js";
import { on, state } from "./state.js";
import { wirePower } from "./power.js";
import { wireChrome } from "./chrome.js";
import { applyPalette } from "./themes.js";
import { wireTypeCheck } from "./typecheck.js";
import { wireDual } from "./dual.js";
import { wireHome } from "./home.js";
import { registerHomeTiles } from "./homeTiles.js";
import { restoreWorkspace, wireWorkspace } from "./workspace.js";
import "./find.js";
import "./watch.js";
import "./crypto.js";
import "./ip.js";
import "./net.js";
import "./sd.js";
import "./vault.js";
import "./calc.js";
import "./timer.js";
import "./code.js";
import "./dev.js";
import "./themeEditor.js";
import { wireTerminal } from "./terminal.js";
import { wireTools } from "./tools.js";
import { renderAddress, renderBanner, updateSearchBox, updateToolbar, wireToolbar } from "./toolbar.js";

/** The settings that change how the list looks or is ordered. */
const LIST_SETTINGS = ["view", "sortBy", "sortDir", "foldersFirst"];

function applySettings() {
  const s = state.settings;
  const root = document.documentElement;
  // While the theme editor shows a theme that isn't saved yet, the page keeps it.
  if (root.dataset.palette === "preview") {
    // nothing to change
  } else if (s.palette) {
    if (root.dataset.palette !== s.palette) applyPalette(s.palette);
  } else if (root.dataset.palette) applyPalette("");
  else if (s.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.style.setProperty("--fm-scale", String(s.textSize / 100));
  $("#info").hidden = !s.showInfoPanel;
}

function showFatal(message) {
  document.body.classList.add("ready");
  $("#list").replaceChildren(h("div", { class: "fatal", role: "alert" }, h("h2", {}, "The File Manager can't start"), h("p", {}, message)));
}

async function start() {
  try {
    await loadPlaces();
  } catch (err) {
    return showFatal(err instanceof ApiError ? err.message : "Something went wrong while starting.");
  }
  applySettings();
  wireToolbar();
  wireList();
  wireSidebar();
  wireFavorites();
  wireInfo();
  // The view switcher and the Dual view listen for keys before the file list does, so Alt+digits, Esc (Focus), Tab, F5 and F6 reach them first.
  wireWorkspace();
  wireDual();
  wireHome();
  registerHomeTiles();
  wireKeys();
  wireTerminal();
  wireTools();
  wirePower();
  wireChrome();
  wireTypeCheck();
  renderSidebar();

  // Settings changes: apply them, and redo only what they affect. Saving the last folder or a favorite must not
  // redraw the list (that would throw away a name someone is in the middle of typing).
  on("settings", (change) => {
    applySettings();
    updateToolbar();
    const keys = Object.keys(change ?? {});
    if (keys.includes("showHidden")) refresh();
    else if (keys.some((k) => LIST_SETTINGS.includes(k))) renderList();
  });

  const requested = document.querySelector('meta[name="fm-start"]')?.getAttribute("content") ?? "";
  const first = (requested && decodeURIComponent(requested)) || state.settings.lastPath || state.home;
  if (!(await goTo(first, { push: false }))) await goTo(state.home, { push: false });
  renderAddress();
  renderBanner();
  updateSearchBox();
  restoreWorkspace();
  document.body.classList.add("ready");
  // The window has no browser menu, so keep the system's own page menu (Reload, Inspect ...) out of the way.
  document.addEventListener("contextmenu", (e) => {
    if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
  });
  $("#list").focus();
  if (!state.settings.seenWelcome) showWelcome();

  // Pick up changes made by other programs when you come back to this window.
  let last = Date.now();
  window.addEventListener("focus", () => {
    // Never rebuild the list under someone who is typing a new name, choosing from a menu or answering a dialog.
    if (Date.now() - last < 2000 || state.busy || isRenaming() || menuIsOpen() || document.querySelector(".modal-backdrop")) return;
    last = Date.now();
    refresh();
  });
}

start();
