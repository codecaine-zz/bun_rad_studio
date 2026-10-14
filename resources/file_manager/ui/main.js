// Start-up: load the places and settings, apply them, draw everything and open the first folder.
import { ApiError } from "./api.js";
import { $, h } from "./dom.js";
import { showWelcome } from "./extras.js";
import { wireInfo } from "./info.js";
import { wireKeys } from "./keys.js";
import { isRenaming, renderList, wireList } from "./list.js";
import { menuIsOpen } from "./menus.js";
import { goTo, loadPlaces, refresh } from "./nav.js";
import { renderSidebar, wireSidebar } from "./sidebar.js";
import { on, state } from "./state.js";
import { wireTerminal } from "./terminal.js";
import { wireTools } from "./tools.js";
import { renderAddress, renderBanner, updateSearchBox, updateToolbar, wireToolbar } from "./toolbar.js";

/** The settings that change how the list looks or is ordered. */
const LIST_SETTINGS = ["view", "sortBy", "sortDir", "foldersFirst"];

function applySettings() {
  const s = state.settings;
  const root = document.documentElement;
  if (s.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.style.setProperty("--fm-scale", String(s.textSize / 100));
  $("#info").hidden = !s.showInfoPanel;
}

function showFatal(message) {
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
  wireInfo();
  wireKeys();
  wireTerminal();
  wireTools();
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
